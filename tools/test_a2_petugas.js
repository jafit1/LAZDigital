/* Uji: kolom "Petugas" di Formulir A2 berisi "Lazismu Daerah Bantul", bukan
 * nama fundraising.
 *
 * Pemilik (21 Oktober 2026): "di bagian kolom petugas cukup isikan Lazismu
 * daerah bantul saja, tidak perlu menuliskan nama fundraisingnya".
 *
 * Sebelumnya kolom ini diisi nama fundraising per baris ("Tim Relawan ...",
 * "Sherli +2"). Lembar serah terima kasir itu milik lembaga, bukan milik tiap
 * penggalang, dan nama yang panjang membuat baris membungkus sehingga lembar
 * A5 melewati satu halaman.
 *
 * Fungsi aslinya dijalankan apa adanya (diambil dari app.js), bukan ditiru.
 *
 *   node tools/test_a2_petugas.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 260)); }
};

/* Ambil fungsi dari app.js lalu jalankan di sandbox kecil. */
function ambil(nama) {
  const i = app.indexOf('function ' + nama + '(');
  if (i < 0) return '';
  let d = 0; const j = app.indexOf('{', i);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  return '';
}
const urut = (app.match(/var A2_URUT = \[[^\]]*\];/) || [''])[0] + '\n' + (app.match(/var A2_PETUGAS = '[^']*';/) || [''])[0];
cek('konstanta A2_PETUGAS ada dan bernilai Lazismu Daerah Bantul', /A2_PETUGAS = 'Lazismu Daerah Bantul'/.test(urut), urut);
const kode = urut + '\n' + ['isTransferMethod', 'a2Label', 'a2Kelompok'].map(ambil).join('\n') + '\nreturn a2Kelompok;';
cek('fungsi a2Kelompok ditemukan', /function a2Kelompok/.test(kode));
const a2Kelompok = new Function(kode)();

const baris = [
  { jenisDana: 'Zakat', metode: 'Cash/Tunai', jumlah: 100000, fundraising: 'Sherli', petugas: 'Admin Satu' },
  { jenisDana: 'Zakat', metode: 'Cash/Tunai', jumlah: 50000, fundraising: 'Renata', petugas: 'Admin Dua' },
  { jenisDana: 'Zakat', metode: 'Cash/Tunai', jumlah: 25000, fundraising: 'Ariya', petugas: 'Admin Tiga' },
  { jenisDana: 'Infak', metode: 'Transfer Bank', jumlah: 300000, fundraising: 'Tim Relawan Bantul Kota', petugas: 'Admin Satu' },
  { jenisDana: 'Wakaf', metode: 'Transfer Bank', jumlah: 700000, fundraising: '', petugas: 'Admin Dua' },
];
const g = a2Kelompok(baris);

console.log('\n=== A. KOLOM PETUGAS ===');
const semua = g.tunai.concat(g.bank);
cek('ada baris tunai dan bank', g.tunai.length >= 1 && g.bank.length >= 2, { tunai: g.tunai.length, bank: g.bank.length });
cek('setiap baris petugasnya "Lazismu Daerah Bantul"', semua.every((b) => b.petugas === 'Lazismu Daerah Bantul'), semua.map((b) => b.petugas));
cek('nama fundraising tidak muncul di kolom petugas',
  !semua.some((b) => /Sherli|Renata|Ariya|Relawan/.test(b.petugas)), semua.map((b) => b.petugas));
cek('baris tanpa fundraising pun tetap terisi (tidak kosong)', semua.every((b) => b.petugas), semua.map((b) => b.petugas));
cek('nama akun pencatat (Admin ...) juga tidak muncul', !semua.some((b) => /Admin/.test(b.petugas)), semua.map((b) => b.petugas));

console.log('\n=== B. ANGKA TIDAK BERUBAH ===');
cek('total tunai tetap', g.totalTunai === 175000, g.totalTunai);
cek('total bank tetap', g.totalBank === 1000000, g.totalBank);
cek('total keseluruhan tetap', g.total === 1175000, g.total);
const zakat = g.tunai.find((b) => b.label === 'Zakat');
cek('tiga transaksi zakat tetap digabung jadi satu baris', !!zakat && zakat.jumlah === 175000 && g.tunai.length === 1, g.tunai);

console.log('\n=== C. LAYAR DAN CETAK MEMAKAI NILAI YANG SAMA ===');
cek('pratinjau layar membaca b.petugas', /esc\(b\.petugas \|\| '-'\)/.test(app));
cek('cetak A5 membaca b.petugas', /esc\(b\.petugas \|\| ''\)/.test(app));

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) process.exit(1);
console.log('\ntest_a2_petugas.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
