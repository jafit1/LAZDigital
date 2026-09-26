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
  /* Endpoint /pipeline membalas galat PER PERINTAH, bukan menggagalkan
     seluruh panggilannya. Jadi satu jawaban bisa berisi campuran: sebagian
     nilai sungguhan, sebagian galat. Penanda di bawah ini yang membedakan
     keduanya, dan pemanggilnya WAJIB memeriksanya.

     Versi pertama alat ini menyimpan galatnya seolah-olah itu nilai. Hasilnya
     berkas ekspor yang kelihatan lengkap padahal dua ratus kunci isinya cuma
     kalimat "max requests limit exceeded" — dan itu baru ketahuan karena tiap
     kunci kebetulan berukuran sama persis, 158 bita. Kesalahan seperti ini
     tidak memunculkan galat apa pun; ia memunculkan cadangan yang kosong. */
  return j.map((x) => (x && x.error ? { __galat: String(x.error) } : (x ? x.result : null)));
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

    /* Berkas dari versi lama alat ini bisa berisi pesan galat yang tersimpan
       seolah-olah nilai. Dibersihkan di sini, dan kuncinya dikembalikan ke
       antrean supaya diambil ulang. Tanpa ini, berkasnya akan tetap terlihat
       lengkap selamanya. */
    const tercemar = Object.entries(keluar.kunci)
      .filter(([, v]) => (v && v.nilai && v.nilai.__galat) || (v && v.tipe && v.tipe.__galat))
      .map(([k]) => k);
    if (tercemar.length) {
      for (const k of tercemar) delete keluar.kunci[k];
      const sudahAntre = new Set(keluar.belumTerambil);
      keluar.belumTerambil = keluar.belumTerambil.concat(tercemar.filter((k) => !sudahAntre.has(k)));
      console.log('\n' + tercemar.length + ' kunci ternyata berisi pesan galat, bukan data.');
      console.log('Sudah dibuang dan dimasukkan lagi ke antrean pengambilan.');
    }

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
  let galatTerakhir = null;
  const hilang = [];

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

    /* Kunci yang salah satu dari tiga jawabannya galat TIDAK disimpan: ia
       tetap tinggal di daftar "belum terambil" supaya --lanjut mengambilnya
       lagi nanti. Menyimpan sebagian lebih berbahaya daripada tidak menyimpan
       sama sekali, karena yang sebagian itu terlihat seperti data. */
    const bergalat = [];
    potong.forEach((k, i) => {
      const g = [tipe[i], nilai[i], ttl[i]].find((x) => x && x.__galat);
      if (g) { bergalat.push(k); galatTerakhir = g.__galat; return; }
      /* Kunci berumur bisa habis masa berlakunya di antara SCAN dan
         pengambilan isinya. Yang begini dilewati, bukan disimpan sebagai
         nilai kosong: nilai kosong akan ikut terimpor dan menimpa kunci
         bernama sama di basis data tujuan. */
      if (tipe[i] === 'none') { hilang.push(k); return; }
      keluar.kunci[k] = {
        tipe: tipe[i],
        ttl: (ttl[i] === undefined || ttl[i] === null) ? -1 : ttl[i],
        nilai: nilai[i],
      };
    });
    /* Yang berhasil dibuang dari antrean, yang bergalat didorong ke belakang. */
    keluar.belumTerambil = keluar.belumTerambil.slice(potong.length).concat(bergalat);
    simpan();
    process.stdout.write('\r  ' + Object.keys(keluar.kunci).length + ' kunci diambil, sisa ' + keluar.belumTerambil.length + '   ');

    if (bergalat.length === potong.length) {
      /* Seluruh kelompok gagal: meneruskan hanya akan menghabiskan sisa jatah
         untuk mendapat galat yang sama berulang-ulang. */
      console.log('\nBerhenti: seluruh kelompok terakhir ditolak server.');
      console.log('  ' + galatTerakhir);
      gagalKarenaJatah = /max requests limit|limit exceeded|quota/i.test(galatTerakhir || '');
      break;
    }
  }
  process.stdout.write('\n');

  keluar.selesai = new Date().toISOString();
  simpan();

  const jumlah = Object.keys(keluar.kunci).length;
  const besar = fs.statSync(berkas).size;

  /* Pagar terakhir. Kalau toh ada penanda galat yang lolos ke dalam berkas,
     lebih baik alat ini berteriak sekarang daripada berkasnya dipakai sebagai
     cadangan berbulan-bulan lalu ketahuan kosong saat dibutuhkan. */
  const tercemar = Object.entries(keluar.kunci)
    .filter(([, v]) => (v.nilai && v.nilai.__galat) || (v.tipe && v.tipe.__galat))
    .map(([k]) => k);
  if (tercemar.length) {
    console.error('\nBAHAYA: ' + tercemar.length + ' kunci tersimpan berisi pesan galat, bukan data.');
    console.error('Contoh: ' + tercemar.slice(0, 3).join(', '));
    console.error('Berkas ini TIDAK boleh dipakai sebagai cadangan. Laporkan ini.\n');
    process.exitCode = 1;
    return;
  }

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
  if (hilang.length) {
    console.log('Kedaluwarsa saat diambil: ' + hilang.length + ' kunci berumur (wajar, dilewati)');
  }
  console.log('\nkelompok'.padEnd(23) + 'kunci'.padStart(8) + 'isi'.padStart(12));
  for (const [g, v] of Object.entries(grup).sort((a, b) => b[1].byte - a[1].byte)) {
    console.log(g.padEnd(22) + String(v.n).padStart(8) + rapi(v.byte).padStart(12));
  }

  if (keluar.belumTerambil.length) {
    console.log('\nBELUM SELESAI. ' + keluar.belumTerambil.length + ' kunci belum berhasil diambil.');
    const contoh = keluar.belumTerambil.slice(0, 5);
    console.log('Contoh: ' + contoh.join(', ') + (keluar.belumTerambil.length > 5 ? ', ...' : ''));
    console.log('\nLanjutkan dengan:');
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
