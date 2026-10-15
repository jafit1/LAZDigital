/* Uji: imporTabelBanding menampilkan rincian per kantor (jurnal vs rekap),
 * bukan cuma total KLL/ULL digabung.
 *
 *   node tools/test_tabel_banding_per_kantor.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
const fn = (app.match(/function imporTabelBanding\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

cek('imporTabelBanding ditemukan', !!fn);
cek('memakai A.himpun.kantor (rincian rekap per kantor)', /A\.himpun\.kantor/.test(fn));
cek('memakai R.kantor (rincian jurnal per kantor)', /R\.kantor/.test(fn));

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_tabel_banding_per_kantor.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
