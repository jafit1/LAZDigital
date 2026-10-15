/* Uji: tglIndo() tidak menampilkan "Invalid Date" (bahasa Inggris, bukan
 * Indonesia) untuk nilai tanggal yang gagal dibaca. new Date(nilai_rusak)
 * tidak melempar error, jadi try/catch di tglIndo tidak pernah menangkapnya;
 * toLocaleDateString pada Invalid Date mengembalikan string Inggris itu
 * mentah-mentah (terlihat di layar impor jurnal, 15 Oktober 2026).
 *
 *   node tools/test_tglindo_rusak.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
const fn = (app.match(/function tglIndo\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

cek('tglIndo ditemukan', !!fn);
cek('tglIndo memeriksa isNaN sebelum format (Invalid Date tidak melempar error)',
  /isNaN/.test(fn), 'tidak ada pengecekan isNaN, bergantung ke try/catch yang tidak pernah terpicu');

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_tglindo_rusak.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
