/* Uji: PDF Laporan Harian tidak memuat teks dobel dan tabel belang.
 *
 * Masalah di PDF sebelum diperbaiki (16 Oktober 2026):
 *  1. Nama KLL muncul dua kali (Donatur "KLL Sanden" + sub "KLL Sanden"),
 *     padahal namaDonatur KLL memang sudah mengandung nama layanannya.
 *  2. Info bank tiga baris ("Bank BPD DIY Syariah - 803211000511") membuat
 *     tabel gemuk dan sulit dibaca.
 *  3. Baris belang (zebra) dan header abu: dekorasi tanpa fungsi di dokumen
 *     cetak.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_harian_pdf.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
const fn = (app.match(/function buildHarianHTML\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

cek('buildHarianHTML ditemukan', !!fn);
cek('layanan hanya ditampilkan bila beda dari nama donatur (bukan teks dobel KLL/ULL)',
  fn.indexOf("x.layanan !== x.namaDonatur") >= 0, 'layanan masih selalu jadi sub baris donatur');
cek('info bank tidak ditampilkan sebagai sub metode',
  fn.indexOf("esc(x.bank)+'</div>'") < 0, 'bank masih jadi sub baris metode');
cek('tanpa baris belang di PDF',
  !/nth-child\(even\)/.test(fn), 'zebra striping masih ada');
cek('tanpa latar abu pada header tabel',
  !/#eef0f3/.test(fn), 'header abu masih ada');

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_harian_pdf.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
