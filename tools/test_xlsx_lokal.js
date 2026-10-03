/* Uji: setiap fungsi SheetJS yang dipanggil aplikasi ada di salinan lokal.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Pada 2 Oktober 2026 pustaka xlsx diturunkan dari CDN 0.20.3 ke salinan lokal
 * 0.18.5 (src/public/js/vendor/xlsx.full.min.js) supaya boot aplikasi tidak
 * menunggu CDN. Ada kemungkinan satu fungsi yang hanya ada di 0.20.3 dipakai
 * di suatu sudut aplikasi: tidak ada galat saat halaman dibuka, baru meledak
 * ("XLSX.xxx is not a function") ketika orang menekan tombolnya. Uji ini
 * mencari semua pemanggilan XLSX.* di src/public dan memeriksa tiap namanya
 * ada di berkas lokal. Hasil saat ditulis: 8 fungsi dipakai, semuanya ada.
 *
 *   node tools/test_xlsx_lokal.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const VENDOR = path.join(PUBLIK, 'js', 'vendor', 'xlsx.full.min.js');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

/* Yang dimuat adalah berkas yang dilayani ke peramban, BUKAN node_modules/xlsx:
   yang kedua versinya bisa berbeda, dan yang diuji di sini yang dipakai petugas. */
const X = require(VENDOR);

function berkasSumber(dir) {
  const hasil = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') hasil.push(...berkasSumber(p)); }
    else if (/\.(js|html)$/.test(e.name)) hasil.push(p);
  }
  return hasil;
}
/* Nama yang dipanggil: XLSX.read, XLSX.utils.sheet_to_json, dst. */
function namaDipakai(teks) {
  const s = new Set();
  for (const m of teks.matchAll(/\bXLSX\.((?:utils\.)?[A-Za-z_][A-Za-z_0-9]*)/g)) s.add(m[1]);
  return s;
}
const ada = (nama) => (nama.startsWith('utils.') ? X.utils && X.utils[nama.slice(6)] : X[nama]) !== undefined;

console.log('\n=== A. VERSI DAN PEMBACA ===');
cek('salinan lokal versi 0.18.5 (sama dengan package.json)', X.version === '0.18.5', X.version);
cek('package.json meminta xlsx 0.18.x', /"xlsx":\s*"\^?0\.18\./.test(fs.readFileSync(path.join(AKAR, 'package.json'), 'utf8')));
{
  /* Pembanding: pemindai ini harus MENEMUKAN nama yang tidak ada, kalau tidak ia tidak menjaga apa pun. */
  const palsu = namaDipakai('XLSX.fungsiYangTidakAda(1); XLSX.utils.juga_tidak_ada(2); XLSX.read(x);');
  cek('pembanding: pemindai mengenali nama yang tidak ada di pustaka', palsu.size === 3 && !ada('fungsiYangTidakAda') && !ada('utils.juga_tidak_ada') && ada('read'), [...palsu]);
}

console.log('\n=== B. SETIAP PEMANGGILAN DI APLIKASI ADA DI SALINAN LOKAL ===');
const dipakai = new Map();
for (const f of berkasSumber(PUBLIK)) {
  for (const n of namaDipakai(fs.readFileSync(f, 'utf8'))) {
    if (!dipakai.has(n)) dipakai.set(n, []);
    dipakai.get(n).push(path.relative(PUBLIK, f));
  }
}
cek('aplikasi memakai SheetJS (ada pemanggilan yang ditemukan)', dipakai.size > 0, dipakai.size);
for (const [nama, dimana] of [...dipakai].sort()) cek('XLSX.' + nama + ' ada (dipakai di ' + [...new Set(dimana)].join(', ') + ')', ada(nama), nama);

console.log('\n=== C. BACA DAN TULIS BERFUNGSI ===');
{
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['tanggal', 'jumlah'], ['2026-08-01', 500000], ['2026-08-11', 250000]]), 'JAN');
  const buf = X.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const kembali = X.read(buf, { type: 'buffer' });
  const baris = X.utils.sheet_to_json(kembali.Sheets.JAN, { header: 1 });
  cek('tulis lalu baca xlsx: isi sama', JSON.stringify(baris) === JSON.stringify([['tanggal', 'jumlah'], ['2026-08-01', 500000], ['2026-08-11', 250000]]), baris);
  cek('csv dari sheet', /tanggal,jumlah/.test(X.utils.sheet_to_csv(kembali.Sheets.JAN)));
}

console.log('\n' + 'test_xlsx_lokal.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
process.exit(gagal ? 1 : 0);
