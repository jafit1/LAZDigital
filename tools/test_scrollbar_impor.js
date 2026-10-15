/* Uji: panel pratinjau impor (#importPreview) punya scrollbar yang
 * TERLIHAT, bukan ikut aturan global yang menyembunyikan semua scrollbar
 * (::-webkit-scrollbar { width: 0px !important }, styles.css ~1083).
 *
 * Pemilik (15 Oktober 2026): daftar temuan panjang (51+ baris) di Impor
 * Jurnal per Berkas sulit dipindah-pindah tanpa scrollbar yang kelihatan.
 *
 *   node tools/test_scrollbar_impor.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'styles.css'), 'utf8');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

cek('ada aturan scrollbar khusus untuk #importPreview',
  /#importPreview::-webkit-scrollbar/.test(css),
  'tidak ditemukan, scrollbar panel ini masih ikut disembunyikan global');
cek('lebar scrollbar panel impor tidak nol',
  /#importPreview::-webkit-scrollbar\s*\{[^}]*width\s*:\s*(?!0)/.test(css),
  'lebar scrollbar masih 0');

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_scrollbar_impor.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
