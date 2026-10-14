/* Uji: tab impor harus kembali ke Unggah File setiap modal dibuka.
 *
 * Bug yang dijaga: IMPORT_TAB tidak di-reset di openImportModal(). Setelah
 * pengguna pernah membuka tab Tempel Teks atau Link, membuka modal lagi
 * menampilkan tab Unggah File, tetapi tarikImportData() masih membaca tab
 * lama. Hasilnya: unggah file yang sudah dipilih malah ditolak dengan pesan
 * "Masukkan teks data spreadsheet terlebih dahulu".
 *
 *   node tools/test_impor_tab_reset.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

const fungsi = app.match(/function openImportModal\([^)]*\)\s*\{[\s\S]*?\n\}/);
cek('openImportModal ditemukan', !!fungsi, 'fungsi tidak ada');

if (fungsi) {
  cek('openImportModal mereset IMPORT_TAB ke "file"',
    /IMPORT_TAB\s*=\s*'file'/.test(fungsi[0]),
    'IMPORT_TAB tidak di-reset, tab lama terbawa');
}

const tarik = app.match(/function tarikImportData\(\)\s*\{[\s\S]*?\n\}/);
cek('tarikImportData membaca IMPORT_TAB', !!tarik && /IMPORT_TAB === 'file'/.test(tarik[0]));

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_impor_tab_reset.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
