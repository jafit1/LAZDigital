/* Uji: laporan harian menampilkan detail infak terikat (pilar/program),
 * bukan cuma "Infak — Infak Terikat" tanpa keterangan apa.
 *
 * Pemilik (16 Oktober 2026): "pada laporan harian belum mendetail infak
 * terikat apa" — kolom jenis dana harus memuat pilarnya, misalnya
 * "Infak — Infak Terikat / Kemanusiaan", bukan berhenti di subJenis.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_harian_pilar.js
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

/* Jalur layar: renderHarianPreview membangun sel Jenis Dana. */
const prev = (app.match(/function renderHarianPreview\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
cek('renderHarianPreview memakai x.pilar di sel jenis dana',
  /x\.pilar/.test(prev), 'pilar tidak dipakai di pratinjau');
cek('renderHarianPreview memakai x.program di sel jenis dana',
  /x\.program/.test(prev), 'program tidak dipakai di pratinjau');

/* Jalur PDF: buildHarianHTML membangun barisHimpun. */
const cetak = (app.match(/function buildHarianHTML\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
cek('buildHarianHTML memakai x.pilar di kolom jenis dana',
  /x\.pilar/.test(cetak), 'pilar tidak dipakai di PDF');
cek('buildHarianHTML memakai x.program di kolom jenis dana',
  /x\.program/.test(cetak), 'program tidak dipakai di PDF');

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_harian_pilar.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
