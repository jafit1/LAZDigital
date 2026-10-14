/* Uji: impor menawarkan "Lewati semua yang sudah ada" untuk baris duplikat,
 * dan pesan sumber kosong tampil di dalam modal, bukan toast di pojok bawah
 * (toast z-index 200 tertutup lapisan modal z-index 10000).
 *
 *   node tools/test_impor_lewati_duplikat.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
const tarik = (app.match(/function tarikImportData\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

cek('fungsi imporLewatiSemua ada', /function imporLewatiSemua\(\)/.test(app));
cek('fungsi imporBarDuplikat ada', /function imporBarDuplikat\(/.test(app));
cek('bar duplikat dipasang di pratinjau biasa',
  /h \+= imporBarDuplikat\(res\.valid\.filter/.test(app));
cek('bar duplikat dipasang di pratinjau jurnal',
  /imporGambarJurnal[\s\S]*?imporBarDuplikat\(/.test(app));
cek('tarikImportData tidak lagi memakai toast untuk sumber kosong',
  !/toast\('Masukkan (teks|URL)/.test(tarik), 'toast masih dipakai');
cek('pesan sumber kosong ditulis ke importPreview',
  /imporPesanKosong\('Masukkan teks data spreadsheet/.test(tarik) && /imporPesanKosong\('Masukkan URL/.test(tarik));
cek('imporPesanKosong menulis ke importPreview',
  /function imporPesanKosong\([^)]*\)\s*\{[^}]*importPreview/.test(app));

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_impor_lewati_duplikat.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
