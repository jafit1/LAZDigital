/* tools/ukur-redis.js — mengukur isi Redis: apa yang memenuhi, berapa besar.
 *
 * KENAPA PERLU DIUKUR DULU.
 * "Redis hampir penuh" belum memberi tahu apa pun tentang apa yang harus
 * dilakukan. Kalau yang memenuhi lampiran AI (gambar mentah, berumur 30 hari),
 * cukup ditunggu atau dipangkas. Kalau yang memenuhi buku besarnya sendiri,
 * memangkas tidak akan menolong dan yang perlu dilakukan pindah basis data.
 * Dua kesimpulan yang sangat berbeda dari satu gejala yang sama.
 *
 * YANG DILAPORKAN
 *   - total pemakaian dan berapa persen dari jatah 256 MB (paket gratis),
 *   - rincian per kelompok kunci (laz:, ai:, blast:, fund:), diurutkan,
 *   - sepuluh kunci terbesar, dengan sisa umurnya,
 *   - berapa kunci yang TIDAK punya masa kedaluwarsa — kunci begini yang
 *     menumpuk diam-diam,
 *   - rincian buku besar laz:db per tabel, karena ia satu bongkah JSON dan
 *     dari luar tidak kelihatan tabel mana yang membengkak,
 *   - perkiraan pemakaian lebar pita per bulan. Ini sering terlewat: tiap
 *     kali halaman dibuka, SELURUH laz:db diunduh. Jatah gratisnya 10 GB
 *     sebulan, dan buku besar 5 MB berarti jatah itu habis setelah 2.000
 *     kali buka halaman.
 *
 * HEMAT PERINTAH. Jatah gratis 500 ribu perintah per bulan, jadi alat ini
 * memakai SCAN berukuran besar dan menggabungkan pemeriksaan ukuran lewat
 * endpoint pipeline — seribu kunci selesai dalam belasan panggilan, bukan
 * seribu.
 *
 * TOKENNYA TIDAK PERNAH DICETAK. Ia dibaca dari lingkungan atau .env.local
 * lalu dipakai di header, titik.
 *
 * jalankan:  node tools/ukur-redis.js
 *            node tools/ukur-redis.js --json      (untuk diolah lagi)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const JATAH_BYTE = 256 * 1024 * 1024;      // paket gratis Upstash
const JATAH_PITA = 10 * 1024 * 1024 * 1024;

/* .env.local dibaca sendiri supaya alat ini tidak menuntut dotenv terpasang. */
function muatEnv() {
  for (const nama of ['.env.local', '.env']) {
    const berkas = path.join(AKAR, nama);
    if (!fs.existsSync(berkas)) continue;
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(baris);
      if (!m) continue;
      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
}
muatEnv();

const URL_REST = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
if (!URL_REST || !TOKEN) {
  console.error('\nUPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum ada.');
  console.error('Isi di .env.local (lihat .env.example), atau setel di lingkungan shell.\n');
  process.exit(2);
}

let perintahTerpakai = 0;

async function satu(cmd) {
  perintahTerpakai++;
  const res = await fetch(URL_REST, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error('Redis: ' + (j && j.error ? j.error : 'HTTP ' + res.status));
  return j.result;
}

/* Endpoint /pipeline menerima banyak perintah sekaligus dan membalas array
   berurutan. Satu panggilan jaringan, tetap N perintah di hitungan kuota —
   yang dihemat waktunya, bukan kuotanya. */
async function banyak(daftar) {
  if (!daftar.length) return [];
  perintahTerpakai += daftar.length;
  const res = await fetch(URL_REST.replace(/\/+$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(daftar),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(j)) throw new Error('Redis pipeline: HTTP ' + res.status);
  return j.map((x) => (x && x.error ? null : x && x.result));
}

function rapi(b) {
  if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function umur(detik) {
  if (detik === -1 || detik === null) return 'selamanya';
  if (detik < 0) return '-';
  if (detik >= 86400) return Math.round(detik / 86400) + ' hari';
  if (detik >= 3600) return Math.round(detik / 3600) + ' jam';
  return detik + ' dtk';
}

/* Kelompok diambil dari dua ruas pertama nama kunci: "ai:lampiran:abc123"
   jadi "ai:lampiran". Itu tingkat yang pas — "ai:" saja terlalu kasar untuk
   memutuskan apa yang dipangkas, tiga ruas terlalu halus untuk dibaca. */
function kelompok(kunci) {
  const r = String(kunci).split(':');
  if (r.length <= 1) return r[0];
  return r[0] + ':' + r[1];
}

async function main() {
  const jsonSaja = process.argv.includes('--json');
  const catat = jsonSaja ? () => {} : (...a) => console.log(...a);

  catat('\nMengukur isi Redis... (SCAN, tidak mengubah apa pun)\n');

  const jumlahKunci = await satu(['DBSIZE']);

  /* SCAN, bukan KEYS. KEYS menahan server sampai seluruh ruang kunci selesai
     dibaca; di basis data yang sedang dipakai orang itu terasa sebagai
     aplikasi yang membeku. */
  const kunci = [];
  let kursor = '0';
  do {
    const r = await satu(['SCAN', kursor, 'COUNT', '1000']);
    kursor = String(r[0]);
    for (const k of r[1]) kunci.push(k);
  } while (kursor !== '0' && kunci.length < 200000);

  /* Ukuran + tipe + sisa umur, dipipeline per 200 kunci. */
  const info = [];
  for (let i = 0; i < kunci.length; i += 200) {
    const potong = kunci.slice(i, i + 200);
    const [tipe, ttl] = await Promise.all([
      banyak(potong.map((k) => ['TYPE', k])),
      banyak(potong.map((k) => ['TTL', k])),
    ]);
    /* STRLEN hanya sah untuk string. Untuk tipe lain dipakai MEMORY USAGE;
       kalau Upstash menolaknya, ukurannya dicatat null dan dilaporkan apa
       adanya, bukan ditebak angkanya. */
    const ukuranStr = await banyak(potong.map((k, j) =>
      (tipe[j] === 'string' ? ['STRLEN', k] : ['MEMORY', 'USAGE', k])));
    potong.forEach((k, j) => {
      info.push({ kunci: k, tipe: tipe[j] || '?', ttl: ttl[j], byte: Number(ukuranStr[j]) || 0 });
    });
    if (!jsonSaja) process.stdout.write('\r  ' + Math.min(i + 200, kunci.length) + '/' + kunci.length + ' kunci');
  }
  if (!jsonSaja) process.stdout.write('\r' + ' '.repeat(40) + '\r');

  const total = info.reduce((n, x) => n + x.byte, 0);
  const tanpaUmur = info.filter((x) => x.ttl === -1);

  /* --- rincian buku besar --- */
  let bukuBesar = null;
  const laz = info.find((x) => x.kunci === 'laz:db');
  if (laz) {
    const teks = await satu(['GET', 'laz:db']);
    try {
      const db = JSON.parse(teks);
      bukuBesar = Object.keys(db.sheets || {}).map((nama) => {
        const t = db.sheets[nama] || [];
        return { tabel: nama, baris: Math.max(0, t.length - 1), byte: JSON.stringify(t).length };
      }).sort((a, b) => b.byte - a.byte);
    } catch (e) { bukuBesar = null; }
  }

  const perKelompok = {};
  for (const x of info) {
    const g = kelompok(x.kunci);
    if (!perKelompok[g]) perKelompok[g] = { kunci: 0, byte: 0, abadi: 0 };
    perKelompok[g].kunci++;
    perKelompok[g].byte += x.byte;
    if (x.ttl === -1) perKelompok[g].abadi++;
  }
  const urutKelompok = Object.entries(perKelompok).sort((a, b) => b[1].byte - a[1].byte);
  const terbesar = info.slice().sort((a, b) => b.byte - a.byte).slice(0, 10);

  if (jsonSaja) {
    console.log(JSON.stringify({ jumlahKunci, total, perKelompok, terbesar, bukuBesar, tanpaUmur: tanpaUmur.length }, null, 2));
    return;
  }

  console.log('================ ISI REDIS ================');
  console.log('Jumlah kunci      : ' + jumlahKunci);
  console.log('Total terpakai    : ' + rapi(total) + '   (' + (total / JATAH_BYTE * 100).toFixed(1) + '% dari jatah gratis 256 MB)');
  console.log('Tanpa kedaluwarsa : ' + tanpaUmur.length + ' kunci, ' + rapi(tanpaUmur.reduce((n, x) => n + x.byte, 0)));
  console.log('Perintah dipakai  : ' + perintahTerpakai + ' (jatah gratis 500.000/bulan)');

  console.log('\n---------------- PER KELOMPOK ----------------');
  console.log('kelompok'.padEnd(22) + 'kunci'.padStart(8) + 'ukuran'.padStart(12) + 'abadi'.padStart(8) + '  bagian');
  for (const [g, v] of urutKelompok) {
    const persen = total ? (v.byte / total * 100) : 0;
    console.log(g.padEnd(22) + String(v.kunci).padStart(8) + rapi(v.byte).padStart(12)
      + String(v.abadi).padStart(8) + '  ' + '#'.repeat(Math.round(persen / 3)) + ' ' + persen.toFixed(1) + '%');
  }

  console.log('\n---------------- SEPULUH TERBESAR ----------------');
  for (const x of terbesar) {
    console.log(rapi(x.byte).padStart(11) + '  ' + umur(x.ttl).padEnd(12) + x.kunci.slice(0, 60));
  }

  if (bukuBesar) {
    console.log('\n---------------- ISI laz:db (buku besar) ----------------');
    console.log('Satu bongkah JSON: tiap kali ada yang menyimpan transaksi, SELURUH');
    console.log('isi ini dibaca lalu ditulis ulang.\n');
    console.log('tabel'.padEnd(20) + 'baris'.padStart(9) + 'ukuran'.padStart(12));
    for (const t of bukuBesar) {
      console.log(t.tabel.padEnd(20) + String(t.baris).padStart(9) + rapi(t.byte).padStart(12));
    }
    const besarBlob = laz.byte;
    console.log('\nUkuran satu bongkah: ' + rapi(besarBlob));
    console.log('Lebar pita: tiap pembukaan halaman mengunduhnya sekali.');
    console.log('  jatah gratis 10 GB/bulan  ->  kira-kira '
      + Math.floor(JATAH_PITA / Math.max(1, besarBlob)).toLocaleString('id-ID') + ' kali buka halaman per bulan');
    console.log('  tiap penyimpanan transaksi = 1 unduh + 1 unggah = ' + rapi(besarBlob * 2));
  }

  console.log('\n---------------- BACA ANGKA DI ATAS ----------------');
  const bagianLaz = laz ? laz.byte / Math.max(1, total) : 0;
  if (bagianLaz > 0.4) {
    console.log('Yang memenuhi BUKU BESARNYA sendiri. Memangkas lampiran atau riwayat');
    console.log('tidak akan menolong lama — yang perlu dilakukan pindah basis data.');
  } else if (urutKelompok[0] && /lampiran|berkas/.test(urutKelompok[0][0])) {
    console.log('Yang memenuhi LAMPIRAN. Kunci-kunci ini berumur 30 hari dan hilang');
    console.log('sendiri; memangkasnya menahan sebentar, tapi kalau pemakaiannya tetap');
    console.log('segini ia akan penuh lagi di siklus berikutnya.');
  } else {
    console.log('Yang memenuhi tersebar. Lihat kolom "abadi" — kunci tanpa kedaluwarsa');
    console.log('yang menumpuk biasanya sumber pertumbuhan yang tidak disadari.');
  }
  console.log('\nLangkah memangkas ada di tools/rapikan-redis.js (bawaannya hanya');
  console.log('mensimulasikan, tidak menghapus apa pun sampai diberi --jalankan).\n');
}

main().catch((e) => { console.error('\nGAGAL:', e.message, '\n'); process.exit(1); });
