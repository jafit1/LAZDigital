/* tools/ekspor-redis.js — mengeluarkan SELURUH isi Redis ke satu berkas JSON.
 *
 * Ini langkah pertama pemindahan ke PostgreSQL, dan sekaligus cadangan lepas
 * yang selama ini tidak ada. Perlu diketahui: cadangan harian aplikasi ini
 * menyimpan salinannya DI DALAM Redis yang sama (kunci laz:cadangan:*). Selama
 * Redisnya sehat itu berguna untuk memulihkan dalam hitungan detik, tetapi saat
 * Redisnya sendiri yang bermasalah, empat belas salinan itu ikut terkunci
 * bersama aslinya. Berkas hasil alat ini yang menutup lubang itu.
 *
 * HEMAT PERINTAH, karena jatah bulanan itu persis yang sedang bermasalah:
 *   - SCAN berukuran seribu, bukan KEYS;
 *   - TYPE, nilai, dan TTL digabung lewat endpoint /pipeline;
 *   - tiga perintah per kunci, dan jumlah totalnya dicetak di akhir.
 *
 * BISA DILANJUTKAN. Kalau di tengah jalan jatahnya habis atau sambungannya
 * putus, apa yang sudah terambil tetap ditulis ke berkas, dan --lanjut
 * meneruskan dari situ tanpa mengambil ulang yang sudah ada. Ekspor yang harus
 * diulang dari nol tiap gagal justru memakan jatah paling banyak.
 *
 * TIDAK MENULIS APA PUN ke Redis. Semua perintahnya baca.
 *
 * jalankan:
 *   node tools/ekspor-redis.js
 *   node tools/ekspor-redis.js --lanjut data/ekspor-redis-....json
 *   node tools/ekspor-redis.js --pola 'laz:*'      (sebagian saja)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const DIR = path.join(AKAR, 'data');

function muatEnv() {
  for (const nama of ['.env.local', '.env']) {
    const berkas = path.join(AKAR, nama);
    if (!fs.existsSync(berkas)) continue;
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(baris);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
}
muatEnv();

const URL_REST = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
if (!URL_REST || !TOKEN) {
  console.error('\nUPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum ada.\n');
  process.exit(2);
}

const arg = process.argv.slice(2);
const ambilOpsi = (nama) => { const i = arg.indexOf(nama); return i >= 0 ? arg[i + 1] : null; };
const LANJUT = ambilOpsi('--lanjut');
const POLA = ambilOpsi('--pola') || '*';

let perintah = 0;

async function satu(cmd) {
  perintah++;
  const res = await fetch(URL_REST, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error((j && j.error) || 'HTTP ' + res.status);
  return j.result;
}

async function banyak(daftar) {
  if (!daftar.length) return [];
  perintah += daftar.length;
  const res = await fetch(URL_REST.replace(/\/+$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(daftar),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(j)) {
    throw new Error((j && j.error) || 'HTTP ' + res.status);
  }
  return j.map((x) => (x && x.error ? { __galat: x.error } : (x ? x.result : null)));
}

function rapi(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

/* Perintah pengambil nilai menurut tipe kuncinya. Tipe yang belum dikenal
   dicatat apa adanya supaya ketahuan saat impor, bukan hilang diam-diam. */
function perintahNilai(kunci, tipe) {
  switch (tipe) {
    case 'string': return ['GET', kunci];
    case 'set': return ['SMEMBERS', kunci];
    case 'list': return ['LRANGE', kunci, '0', '-1'];
    case 'hash': return ['HGETALL', kunci];
    case 'zset': return ['ZRANGE', kunci, '0', '-1', 'WITHSCORES'];
    default: return null;
  }
}

async function main() {
  let keluar = {
    versi: 1,
    sumber: 'upstash-redis',
    mulai: new Date().toISOString(),
    selesai: null,
    pola: POLA,
    kunci: {},          /* nama -> { tipe, ttl, nilai } */
    belumTerambil: [],
  };
  let berkas = null;

  if (LANJUT) {
    berkas = path.isAbsolute(LANJUT) ? LANJUT : path.join(AKAR, LANJUT);
    if (!fs.existsSync(berkas)) { console.error('\nBerkas lanjutan tidak ditemukan: ' + berkas + '\n'); process.exit(2); }
    keluar = JSON.parse(fs.readFileSync(berkas, 'utf8'));
    console.log('\nMelanjutkan ekspor sebelumnya: ' + path.basename(berkas));
    console.log('Sudah ada ' + Object.keys(keluar.kunci).length + ' kunci, sisa ' + keluar.belumTerambil.length + '.\n');
  } else {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    berkas = path.join(DIR, 'ekspor-redis-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    console.log('\nMendaftar kunci (SCAN)...');
    let kursor = '0';
    const semua = [];
    do {
      const r = await satu(['SCAN', kursor, 'MATCH', POLA, 'COUNT', '1000']);
      kursor = String(r[0]);
      for (const k of r[1]) semua.push(k);
    } while (kursor !== '0' && semua.length < 500000);
    keluar.belumTerambil = semua;
    console.log(semua.length + ' kunci ditemukan.\n');
  }

  /* Ditulis dulu sebelum mengambil isi: kalau prosesnya mati di tengah, yang
     tersisa di cakram tetap berkas yang sah dan bisa dilanjutkan. */
  const simpan = () => fs.writeFileSync(berkas, JSON.stringify(keluar));
  simpan();

  const UKURAN = 100;
  let gagalKarenaJatah = false;

  while (keluar.belumTerambil.length) {
    const potong = keluar.belumTerambil.slice(0, UKURAN);
    let tipe, nilai, ttl;
    try {
      tipe = await banyak(potong.map((k) => ['TYPE', k]));
      const perintahAmbil = potong.map((k, i) => perintahNilai(k, tipe[i]) || ['TYPE', k]);
      [nilai, ttl] = await Promise.all([
        banyak(perintahAmbil),
        banyak(potong.map((k) => ['TTL', k])),
      ]);
    } catch (e) {
      const pesan = String(e.message || e);
      console.log('\nBerhenti: ' + pesan);
      gagalKarenaJatah = /max requests limit|limit exceeded|quota/i.test(pesan);
      break;
    }

    potong.forEach((k, i) => {
      keluar.kunci[k] = {
        tipe: tipe[i],
        ttl: (ttl[i] === undefined || ttl[i] === null) ? -1 : ttl[i],
        nilai: nilai[i],
      };
    });
    keluar.belumTerambil = keluar.belumTerambil.slice(potong.length);
    simpan();
    process.stdout.write('\r  ' + Object.keys(keluar.kunci).length + ' kunci diambil, sisa ' + keluar.belumTerambil.length + '   ');
  }
  process.stdout.write('\n');

  keluar.selesai = new Date().toISOString();
  simpan();

  const jumlah = Object.keys(keluar.kunci).length;
  const besar = fs.statSync(berkas).size;

  /* Rincian per kelompok: yang paling berguna saat menyusun skema tujuan. */
  const grup = {};
  for (const [k, v] of Object.entries(keluar.kunci)) {
    const r = k.split(':');
    const g = r.length > 1 ? r[0] + ':' + r[1] : r[0];
    if (!grup[g]) grup[g] = { n: 0, byte: 0 };
    grup[g].n++;
    grup[g].byte += JSON.stringify(v.nilai || '').length;
  }

  console.log('\n================ HASIL EKSPOR ================');
  console.log('Berkas          : ' + berkas);
  console.log('Ukuran berkas   : ' + rapi(besar));
  console.log('Kunci terambil  : ' + jumlah);
  console.log('Belum terambil  : ' + keluar.belumTerambil.length);
  console.log('Perintah dipakai: ' + perintah);
  console.log('\nkelompok'.padEnd(23) + 'kunci'.padStart(8) + 'isi'.padStart(12));
  for (const [g, v] of Object.entries(grup).sort((a, b) => b[1].byte - a[1].byte)) {
    console.log(g.padEnd(22) + String(v.n).padStart(8) + rapi(v.byte).padStart(12));
  }

  if (keluar.belumTerambil.length) {
    console.log('\nBELUM SELESAI. Lanjutkan dengan:');
    console.log('    node tools/ekspor-redis.js --lanjut ' + path.relative(AKAR, berkas));
    if (gagalKarenaJatah) {
      console.log('\nTerhenti karena jatah perintah habis. Sisanya baru bisa diambil setelah');
      console.log('paketnya dinaikkan atau penghitung bulanannya berputar.');
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nSELESAI. Simpan berkas ini di tempat yang BUKAN Redis dan bukan hanya di');
  console.log('satu komputer — sampai pemindahan ke PostgreSQL selesai, inilah satu-satunya');
  console.log('salinan lepas dari seluruh data.\n');
}

main().catch((e) => { console.error('\nGAGAL:', e.message, '\n'); process.exit(1); });
