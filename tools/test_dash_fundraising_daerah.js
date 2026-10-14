/* Uji: "Capaian Fundraising" di dasbor hanya menghitung transaksi daerah.
 * Transaksi KLL/ULL (finalKey bukan LAYANAN_DAERAH) tidak masuk byFundraising,
 * karena fundraising hanya berlaku untuk tingkat daerah.
 *
 *   node tools/test_dash_fundraising_daerah.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const engine = fs.readFileSync(path.join(__dirname, '..', 'api', '_engine.js'), 'utf8');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

cek('penjumlahan byFundraising penghimpunan hanya untuk daerah',
  /if \(finalKey === LAYANAN_DAERAH\) \{\s*var frName = [^;]+;\s*byFundraising\[frName\]/.test(engine),
  'byFundraising penghimpunan masih untuk semua transaksi');
cek('penjumlahan byFundraising pentasyarufan hanya untuk daerah',
  /if \(finalKey === LAYANAN_DAERAH\) \{\s*var frNameT = [^;]+;\s*byFundraising\[frNameT\]/.test(engine),
  'byFundraising pentasyarufan masih untuk semua transaksi');

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_dash_fundraising_daerah.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
