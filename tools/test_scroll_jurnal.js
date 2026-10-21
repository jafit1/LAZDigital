/* Uji: panel Jurnal Penerimaan (Laporan) punya scrollbar terlihat, tidak
 * ikut aturan global yang menyembunyikan semua scrollbar (styles.css ~1083).
 *
 * Pemilik (21 Oktober 2026): data jurnal panjang, perlu scrollbar samping
 * kanan supaya mudah berpindah tanpa menebak-nebak.
 *
 *   node tools/test_scroll_jurnal.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'styles.css'), 'utf8');
const fn = (app.match(/function renderJurnalPreview\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

cek('renderJurnalPreview ditemukan', !!fn);
cek('wrapper tabel jurnal diberi kelas khusus (jurnal-scroll)', /class="jurnal-scroll"/.test(fn), 'wrapper masih pakai style inline tanpa kelas');
cek('scrollbar .jurnal-scroll diset terlihat di CSS', /\.jurnal-scroll::-webkit-scrollbar\{width:[^0]/.test(css), 'aturan scrollbar terlihat tidak ditemukan');

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_scroll_jurnal.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
