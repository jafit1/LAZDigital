// tools/test_closing_bagi_hasil.js
'use strict';
const path = require('path');
const engine = require('../api/_engine.js');
const skema = require('../lib/laz-skema.js');

let ok = 0, gagal = 0;
function cek(n, syarat, info) {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { gagal++; console.log('  GAGAL|', n, info !== undefined ? '-> ' + JSON.stringify(info) : ''); }
}

const SANDI = 'Admin12345';
let DB = null;

async function rpcLaz(fn, args) {
  const o = await engine.runRPC(DB, fn, args, { ip: '127.0.0.1', ua: 'uji' });
  DB = o.db;
  return o.result;
}

(async () => {
  console.log('\n=== A. INISIALISASI TRANSAKSI CLOSING BULANAN ===');
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const SU = (await rpcLaz('login', ['superadmin', SANDI])).token;

  // Layanan KLL Bantul Kota
  await rpcLaz('apiSaveLayanan', [SU, { kode: 'BTL', nama: 'Bantul Kota', tipe: 'KLL' }]);

  // Input transaksi Penghimpunan Daerah (Zakat Mal, Infak Terikat, Infak Umum, Administrasi Bank, dan Bagi Hasil Bank)
  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-10-10',
    namaDonatur: 'Muzakki Zakat',
    jenisDana: 'Zakat',
    subJenis: 'Zakat Mal',
    jumlah: 11242530
  }]);

  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-10-12',
    namaDonatur: 'Donatur Terikat',
    jenisDana: 'Infak',
    subJenis: 'Infak Terikat',
    pilar: 'Kemanusiaan',
    jumlah: 77846520
  }]);

  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-10-15',
    namaDonatur: 'Donatur Umum',
    jenisDana: 'Infak',
    subJenis: 'Infak Umum',
    jumlah: 39374002
  }]);

  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-10-20',
    namaDonatur: 'Administrasi Bank Infak',
    jenisDana: 'Administrasi Bank Infak',
    subJenis: 'Administrasi Bank Infak',
    jumlah: 90322
  }]);

  // Transaksi Bagi Hasil Bank (Rp 813.096,56)
  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-10-31',
    namaDonatur: 'Bagi Hasil Bank',
    jenisDana: 'Infak',
    subJenis: 'Bagi Hasil Bank',
    jumlah: 813096.56,
    keterangan: 'Bagi Hasil Bank BPD DIY Syariah'
  }]);

  console.log('\n=== B. UJI API CLOSING BULANAN: BAGI HASIL MASUK KE DAERAH ===');
  const resClosing = await rpcLaz('apiClosingBulanan', [SU, '2026-10']);
  cek('apiClosingBulanan berhasil dipanggil', !!resClosing);

  const himpunDaerah = resClosing.daerah.penghimpunan;
  console.log('Penghimpunan Daerah:', himpunDaerah);

  cek('bhInfak di daerah terisi 813096.56', Math.abs(himpunDaerah.bhInfak - 813096.56) < 0.01, himpunDaerah.bhInfak);
  cek('Zakat Mal di daerah terisi 11242530', himpunDaerah.zakat === 11242530, himpunDaerah.zakat);
  cek('Infak Terikat di daerah terisi 77846520', himpunDaerah.infakTerikat === 77846520, himpunDaerah.infakTerikat);
  cek('Infak Umum di daerah terisi 39374002', himpunDaerah.infakUmum === 39374002, himpunDaerah.infakUmum);
  cek('Lainnya (admin bank) di daerah terisi 90322', himpunDaerah.lain === 90322, himpunDaerah.lain);

  const totalEkspektasi = 11242530 + 77846520 + 39374002 + 90322 + 813096.56;
  cek('Total Penghimpunan Daerah cocok persis 129.366.470,56', Math.abs(himpunDaerah.total - totalEkspektasi) < 0.01, himpunDaerah.total);

  cek('SE BANTUL juga memuat bhInfak 813096.56', Math.abs(resClosing.seBantul.penghimpunan.bhInfak - 813096.56) < 0.01, resClosing.seBantul.penghimpunan.bhInfak);
  cek('Total SE BANTUL sama dengan total daerah (karena belum ada KLL)', Math.abs(resClosing.seBantul.penghimpunan.total - totalEkspektasi) < 0.01, resClosing.seBantul.penghimpunan.total);

  // KLL selisih = 0
  cek('KLL selisih bhInfak = 0', Math.abs(resClosing.kll.penghimpunan.bhInfak) < 0.01, resClosing.kll.penghimpunan.bhInfak);

  // Detail fundraising memuat total yang cocok
  cek('totalFundraising cocok persis dengan total penghimpunan daerah', Math.abs(resClosing.totalFundraising - totalEkspektasi) < 0.01, { totalFr: resClosing.totalFundraising, totalH: himpunDaerah.total });
  cek('detailFundraising memiliki item Bagi Hasil Bank', resClosing.detailFundraising.some(x => x.nama === 'Bagi Hasil Bank'), resClosing.detailFundraising);

  // Rincian Donatur & Fundraising untuk ekspor Excel/PDF
  cek('rincianDonatur tersedia dan berisi 5 transaksi', Array.isArray(resClosing.rincianDonatur) && resClosing.rincianDonatur.length === 5, resClosing.rincianDonatur);
  cek('setiap baris rincianDonatur memuat namaDonatur, fundraising, dan jumlah', resClosing.rincianDonatur.every(r => r.namaDonatur && r.fundraising && r.jumlah > 0));

  console.log('\n=== C. UJI FILTER BULANAN SALDO KLL & ULL ===');
  // Tambah setoran KLL di bulan September dan Oktober, serta UMP di bulan Oktober
  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-09-10',
    namaDonatur: 'KLL Bantul Kota',
    tipeDonatur: 'Kantor Layanan (KLL)',
    jenisDana: 'Infak',
    subJenis: 'Infak Umum',
    jumlah: 1000000
  }]);
  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-10-12',
    namaDonatur: 'KLL Bantul Kota',
    tipeDonatur: 'Kantor Layanan (KLL)',
    jenisDana: 'Infak',
    subJenis: 'Infak Umum',
    jumlah: 2000000
  }]);
  await rpcLaz('apiSaveImportedData', [SU, [{
    tanggal: '2026-10-15',
    jenis: 'keluar',
    layanan: 'KLL Bantul Kota',
    dana: 'Infak',
    akun: 'Kas Infak',
    nominal: 500000,
    keterangan: 'UMP Oktober'
  }], 'ump']);

  const saldoKumulatif = await rpcLaz('apiSaldoLayanan', [SU, '2026-10-31', '']);
  const kllKum = saldoKumulatif.daftar.find(x => x.layanan === 'KLL Bantul Kota');
  cek('saldo kumulatif KLL Bantul Kota menghimpun 3.000.000 (Sep + Okt)', kllKum && kllKum.himpun === 3000000, kllKum);

  const saldoOkt = await rpcLaz('apiSaldoLayanan', [SU, '2026-10-31', '2026-10']);
  const kllOkt = saldoOkt.daftar.find(x => x.layanan === 'KLL Bantul Kota');
  cek('filter bulanan 2026-10 KLL Bantul Kota hanya menghimpun 2.000.000', kllOkt && kllOkt.himpun === 2000000, kllOkt);
  cek('filter bulanan 2026-10 mencatat UMP keluar 500.000 dan belum LPJ 500.000', kllOkt && kllOkt.umpKeluar === 500000 && kllOkt.belumLPJ === 500000, kllOkt);

  const saldoSep = await rpcLaz('apiSaldoLayanan', [SU, '2026-10-31', '2026-09']);
  const kllSep = saldoSep.daftar.find(x => x.layanan === 'KLL Bantul Kota');
  cek('filter bulanan 2026-09 KLL Bantul Kota hanya menghimpun 1.000.000 dan UMP 0', kllSep && kllSep.himpun === 1000000 && kllSep.umpKeluar === 0, kllSep);

  console.log(`\n=== HASIL: ${ok} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
})();
