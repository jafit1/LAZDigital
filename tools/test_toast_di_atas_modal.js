/* Uji: toast harus tampil di atas modal yang sedang terbuka.
 * Bug: .toast (z-index 200) berada di bawah .modal-bg (z-index 10000), sehingga
 * pesan seperti "File terbaca, klik Tarik & Analisis Data" tertutup modal impor
 * dan hanya terlihat sebagai bayangan di tepi bawah.
 *
 *   node tools/test_toast_di_atas_modal.js
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

const zTertinggi = (selektor) => {
  const re = new RegExp('(?:^|[\\s,}])' + selektor.replace(/\./g, '\\.') + '\\s*\\{[^}]*?z-index\\s*:\\s*(\\d+)', 'g');
  let m, max = -1;
  while ((m = re.exec(css))) max = Math.max(max, Number(m[1]));
  return max;
};

const zToast = zTertinggi('.toast');
const zModal = zTertinggi('.modal-bg');

cek('z-index .toast terbaca', zToast >= 0, 'tidak ditemukan');
cek('z-index .modal-bg terbaca', zModal >= 0, 'tidak ditemukan');
cek('toast di atas modal-bg',
  zToast > zModal,
  'toast ' + zToast + ' <= modal ' + zModal);

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_toast_di_atas_modal.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
