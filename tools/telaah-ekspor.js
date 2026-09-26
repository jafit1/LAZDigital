/* tools/telaah-ekspor.js — membedah berkas hasil tools/ekspor-redis.js
 *
 * Tidak menyentuh Redis sama sekali. Semua yang dibaca berkas di cakram, jadi
 * bisa dijalankan berkali-kali tanpa memakai jatah perintah yang sudah habis.
 *
 * Dua kegunaan.
 *
 * 1. MENENTUKAN BENTUK BASIS DATA TUJUAN. Ekspor cuma bilang "laz:db 3,11 MB",
 *    padahal yang menentukan rancangan adalah isi 3,11 MB itu tersebar di
 *    tabel mana. Kalau sebagian besarnya AuditLog, memindahkan satu tabel itu
 *    saja sudah menyelesaikan sebagian besar masalah lebar pita; kalau yang
 *    besar justru Penghimpunan, jalan keluarnya lain lagi.
 *
 * 2. MENJADI PATOKAN PEMBANDING. Angka yang dicetak di sini (jumlah baris tiap
 *    tabel, dan total rupiah Penghimpunan serta Pentasyarufan) disimpan ke
 *    data/telaah-ekspor.json. Setelah impor ke PostgreSQL, angka yang sama
 *    dihitung ulang di sisi sana dan dibandingkan. Kalau satu saja berbeda,
 *    pemindahannya dibatalkan. Memindahkan catatan keuangan tanpa patokan
 *    seperti ini berarti berharap, bukan memastikan.
 *
 * jalankan:
 *   node tools/telaah-ekspor.js                                (berkas terbaru)
 *   node tools/telaah-ekspor.js data/ekspor-redis-....json     (berkas tertentu)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const DIR = path.join(AKAR, 'data');

function berkasTerbaru() {
  if (!fs.existsSync(DIR)) return null;
  const d = fs.readdirSync(DIR).filter((f) => /^ekspor-redis-.*\.json$/.test(f)).sort();
  return d.length ? path.join(DIR, d[d.length - 1]) : null;
}

const arg = process.argv[2];
const BERKAS = arg ? (path.isAbsolute(arg) ? arg : path.join(AKAR, arg)) : berkasTerbaru();
if (!BERKAS || !fs.existsSync(BERKAS)) {
  console.error('\nBerkas ekspor tidak ditemukan. Jalankan dulu: node tools/ekspor-redis.js\n');
  process.exit(2);
}

function rapi(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}
function rupiah(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

/* Kolom nominal tiap tabel. Ditulis sebagai daftar nama, bukan nomor kolom:
   nomor kolom berubah diam-diam kalau suatu saat ada kolom disisipkan, dan
   totalnya jadi salah tanpa ada yang memberi tahu. */
const KOLOM_NOMINAL = {
  Penghimpunan: 'jumlah',
  Pentasyarufan: 'jumlah',
  Mutasi: 'nominal',
  Transfer: 'nominal',
  UangMuka: 'nominal',
  SaldoAwal: 'nominal',
};

function angka(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

console.log('\nMembaca ' + path.basename(BERKAS) + ' (' + rapi(fs.statSync(BERKAS).size) + ')...');
const ekspor = JSON.parse(fs.readFileSync(BERKAS, 'utf8'));
const kunci = ekspor.kunci || {};
console.log('Diambil pada ' + (ekspor.mulai || '?') + ', ' + Object.keys(kunci).length + ' kunci.');

/* Kunci yang isinya ternyata pesan galat, bukan data. Diperiksa PALING AWAL
   dan dilaporkan sekeras mungkin: berkas ekspor yang separuh isinya pesan
   galat tetap terlihat seperti berkas ekspor yang baik-baik saja, dan kalau
   dipakai sebagai cadangan, kekosongannya baru ketahuan saat dibutuhkan. */
const tercemar = Object.entries(kunci)
  .filter(([, v]) => (v && v.nilai && v.nilai.__galat) || (v && v.tipe && v.tipe.__galat))
  .map(([k]) => k);
const belum = (ekspor.belumTerambil || []).length;
if (tercemar.length || belum) {
  console.log('\n!!!!!!!!!!!!!!!! EKSPORNYA BELUM UTUH !!!!!!!!!!!!!!!!');
  if (tercemar.length) {
    console.log(tercemar.length + ' kunci berisi PESAN GALAT, bukan data.');
    console.log('Contoh: ' + tercemar.slice(0, 4).join(', '));
  }
  if (belum) console.log(belum + ' kunci belum sempat diambil.');
  console.log('\nJalankan lagi setelah jatah perintahnya pulih:');
  console.log('    node tools/ekspor-redis.js --lanjut ' + path.relative(AKAR, BERKAS));
  console.log('Perintah itu membuang yang tercemar lalu mengambil ulang.');
  console.log('Telaah di bawah ini tetap berlaku untuk yang SUDAH terambil.');
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
} else {
  console.log('');
}

/* ---------------- buku besar ---------------- */
const mentahDb = kunci['laz:db'] && kunci['laz:db'].nilai;
if (!mentahDb) {
  console.error('laz:db tidak ada di dalam ekspor. Tidak bisa ditelaah.\n');
  process.exit(1);
}
let db = null;
try { db = JSON.parse(mentahDb); } catch (e) {
  console.error('laz:db ada tapi bukan JSON yang bisa dibaca.\n');
  process.exit(1);
}

const besarBlob = mentahDb.length;
const tabel = Object.keys(db.sheets || {}).map((nama) => {
  const t = db.sheets[nama] || [];
  const byte = JSON.stringify(t).length;
  const kepala = t[0] || [];
  const kolom = KOLOM_NOMINAL[nama];
  let total = null;
  if (kolom) {
    const i = kepala.indexOf(kolom);
    if (i >= 0) total = t.slice(1).reduce((n, b) => n + angka(b[i]), 0);
  }
  return { nama, baris: Math.max(0, t.length - 1), kolom: kepala.length, byte, total };
}).sort((a, b) => b.byte - a.byte);

console.log('================ ISI BUKU BESAR (laz:db) ================');
console.log('Satu bongkah ' + rapi(besarBlob) + '. Tiap kali ada yang membuka halaman,');
console.log('SELURUH isi ini diunduh; tiap kali menyimpan, diunduh lalu diunggah lagi.\n');
console.log('tabel'.padEnd(18) + 'baris'.padStart(9) + 'kolom'.padStart(7) + 'ukuran'.padStart(12) + 'bagian'.padStart(9) + '   total nominal');
for (const t of tabel) {
  console.log(
    t.nama.padEnd(18)
    + String(t.baris).padStart(9)
    + String(t.kolom).padStart(7)
    + rapi(t.byte).padStart(12)
    + ((t.byte / besarBlob * 100).toFixed(1) + '%').padStart(9)
    + (t.total === null ? '' : '   ' + rupiah(t.total)));
}

/* ---------------- lebar pita ---------------- */
/* Inilah angka yang menentukan apakah paket gratis mana pun cukup. Ia sering
   terlewat karena tidak pernah muncul sebagai galat sampai jatahnya habis. */
console.log('\n================ LEBAR PITA ================');
const GB = 1024 * 1024 * 1024;
const jatah = [
  { nama: 'Upstash gratis', gb: 10 },
  { nama: 'Supabase gratis', gb: 5 },
  { nama: 'Firestore gratis', gb: 10 },
];
console.log('Satu kali buka halaman menarik ' + rapi(besarBlob) + '.\n');
console.log('paket'.padEnd(20) + 'jatah/bulan'.padStart(12) + '   kira-kira cukup untuk');
for (const j of jatah) {
  const kali = Math.floor(j.gb * GB / besarBlob);
  console.log(j.nama.padEnd(20) + (j.gb + ' GB').padStart(12) + '   ' + kali.toLocaleString('id-ID') + ' kali buka halaman');
}
const duaTerbesar = tabel.slice(0, 2);
const tanpaDuaTerbesar = besarBlob - duaTerbesar.reduce((n, t) => n + t.byte, 0);
console.log('\nKalau ' + duaTerbesar.map((t) => t.nama).join(' dan ') + ' dipindah ke tabelnya sendiri,');
console.log('bongkahnya tinggal ' + rapi(tanpaDuaTerbesar) + ', dan angka di atas naik '
  + (besarBlob / Math.max(1, tanpaDuaTerbesar)).toFixed(1) + ' kali lipat.');

/* ---------------- cadangan di dalam Redis ---------------- */
const cadangan = Object.entries(kunci)
  .filter(([k]) => k.startsWith('laz:cadangan:') && k !== 'laz:cadangan:_daftar')
  .map(([k, v]) => ({ nama: k.replace('laz:cadangan:', ''), byte: String(v.nilai || '').length }))
  .sort((a, b) => (a.nama < b.nama ? 1 : -1));
if (cadangan.length) {
  const total = cadangan.reduce((n, c) => n + c.byte, 0);
  console.log('\n================ CADANGAN DI DALAM REDIS ================');
  console.log(cadangan.length + ' salinan, ' + rapi(total) + ' ('
    + (total / Object.values(kunci).reduce((n, v) => n + String(v.nilai || '').length, 1) * 100).toFixed(0)
    + '% dari seluruh isi Redis).');
  console.log('Salinan ini berguna untuk memulihkan cepat, tapi ia tinggal di dalam');
  console.log('database yang sama dengan aslinya — tidak menolong kalau databasenya');
  console.log('sendiri yang bermasalah, dan itu yang barusan terjadi.\n');
  for (const c of cadangan.slice(0, 5)) console.log('  ' + c.nama.padEnd(32) + rapi(c.byte).padStart(10));
  if (cadangan.length > 5) console.log('  ... dan ' + (cadangan.length - 5) + ' lagi');
}

/* ---------------- kunci modul lain ---------------- */
const lain = {};
for (const [k, v] of Object.entries(kunci)) {
  if (k.startsWith('laz:')) continue;
  const r = k.split(':');
  const g = r.length > 1 ? r[0] + ':' + r[1] : r[0];
  if (!lain[g]) lain[g] = { n: 0, byte: 0, tipe: new Set(), berumur: 0, rusak: 0 };
  lain[g].n++;
  const rusak = (v.nilai && v.nilai.__galat) || (v.tipe && v.tipe.__galat);
  /* continue, BUKAN return. Node membungkus tiap modul di dalam sebuah fungsi,
     jadi "return" di sini sah secara sintaks tapi artinya menghentikan SELURUH
     berkas, diam-diam, tanpa pesan apa pun. Versi pertama baris ini memakai
     return, dan akibatnya laporan berhenti tepat di kunci rusak yang pertama
     — bagian yang justru paling perlu dibaca tidak pernah tercetak. */
  if (rusak) { lain[g].rusak++; continue; }
  lain[g].byte += String(v.nilai === null ? '' : JSON.stringify(v.nilai)).length;
  /* Hanya tipe yang berupa teks. Kalau galat ikut masuk ke sini, yang tercetak
     "[object Object]" berulang-ulang, dan itu menyamarkan masalahnya. */
  if (typeof v.tipe === 'string') lain[g].tipe.add(v.tipe);
  if (v.ttl > 0) lain[g].berumur++;
}
console.log('\n================ KUNCI MODUL LAIN ================');
console.log('kelompok'.padEnd(24) + 'kunci'.padStart(7) + 'ukuran'.padStart(11)
  + '  ' + 'tipe'.padEnd(18) + 'berumur'.padStart(8) + 'rusak'.padStart(7));
for (const [g, v] of Object.entries(lain).sort((a, b) => b[1].byte - a[1].byte)) {
  console.log(g.padEnd(24) + String(v.n).padStart(7) + rapi(v.byte).padStart(11)
    + '  ' + ([...v.tipe].join(',') || '-').padEnd(18)
    + String(v.berumur).padStart(8)
    + (v.rusak ? String(v.rusak) : '').padStart(7));
}

/* ---------------- patokan untuk pembanding ---------------- */
const patokan = {
  dibuat: new Date().toISOString(),
  dariBerkas: path.basename(BERKAS),
  diambilPada: ekspor.mulai || null,
  besarBlob,
  versi: kunci['laz:ver'] ? String(kunci['laz:ver'].nilai) : null,
  tabel: tabel.map((t) => ({ nama: t.nama, baris: t.baris, kolom: t.kolom, total: t.total })),
  jumlahKunci: Object.keys(kunci).length,
  kunciTercemar: tercemar.length,
  kunciBelumTerambil: belum,
  utuh: tercemar.length === 0 && belum === 0,
  kunciPerKelompok: Object.fromEntries(Object.entries(lain).map(([g, v]) => [g, v.n])),
};
const berkasPatokan = path.join(DIR, 'telaah-ekspor.json');
fs.writeFileSync(berkasPatokan, JSON.stringify(patokan, null, 2));

console.log('\n================ PATOKAN PEMBANDING ================');
console.log('Ditulis ke ' + path.relative(AKAR, berkasPatokan) + '.');
console.log('Setelah impor ke PostgreSQL, angka yang sama dihitung ulang di sana dan');
console.log('dibandingkan dengan berkas ini. Jangan dihapus sampai pemindahan selesai.\n');
