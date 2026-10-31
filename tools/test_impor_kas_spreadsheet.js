// tools/test_impor_kas_spreadsheet.js
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
  console.log('\n=== A. INISIALISASI BASIS DATA DENGAN TRANSAKSI AWAL ===');
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const SU = (await rpcLaz('login', ['superadmin', SANDI])).token;

  // Masukkan layanan KLL Bantul Kota & Pandak Barat
  await rpcLaz('apiSaveLayanan', [SU, { kode: 'BTL', nama: 'Bantul Kota', tipe: 'KLL' }]);
  await rpcLaz('apiSaveLayanan', [SU, { kode: 'PDKB', nama: 'Pandak Barat', tipe: 'KLL' }]);

  // Buat 3 transaksi manual di bulan 2026-10 agar nomor KW/202610/0001, 0002, 0003 terpakai
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-10-01', namaDonatur: 'Donatur Awal 1', jenisDana: 'Zakat', subJenis: 'Zakat Mal', jumlah: 100000 }]);
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-10-02', namaDonatur: 'Donatur Awal 2', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 200000 }]);
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-10-03', namaDonatur: 'Donatur Awal 3', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 300000 }]);

  const awalList = (await rpcLaz('apiListPenghimpunan', [SU]));
  cek('3 transaksi awal tercatat dengan no kwitansi KW/202610/0001 s/d 0003', awalList.length === 3 && awalList.some(x => x.noKwitansi === 'KW/202610/0003'));

  console.log('\n=== B. UJI TEMPEL TEKS DARI SPREADSHEET (SESUAI SCREENSHOT) ===');
  const teksScreenshot = [
    '30/10/2026\tKLL Bantul Kota - Kebencanaan\t\t\t515.000',
    '30/10/2026\tKLL Bantul Kota - Sumur Bor\t\t\t7.400.000',
    '30/10/2026\tKLL Bantul Kota - Air Bersih\t\t\t3.800.000',
    '30/10/2026\tKLL Bantul Kota - Fidyah\t\t\t600.000',
    '30/10/2026\tKLL Bantul Kota - Infak Umum\t\t\t56.269.400',
    '30/10/2026\tTK Aisyiyah Khadijah - Filantropis\t\t\t952.000',
    '30/10/2026\tKLL Pandak Barat - Kemanusiaan Air Bersih\t\t\t1.500.000'
  ].join('\n');

  const resParse = await rpcLaz('apiParseImportText', [SU, teksScreenshot, 'himpun']);
  cek('berhasil diparse sebagai headerless dengan valid rows', resParse && resParse.valid && resParse.valid.length === 7);

  const rKebencanaan = resParse.valid.find(x => x.keterangan.includes('Kebencanaan'));
  cek('KLL Bantul Kota - Kebencanaan masuk pilar Kemanusiaan', rKebencanaan && rKebencanaan.pilar === 'Kemanusiaan', rKebencanaan);
  cek('detail keterangan KLL Bantul Kota - Kebencanaan tersimpan', rKebencanaan && rKebencanaan.keterangan === 'KLL Bantul Kota - Kebencanaan');

  const rSumur = resParse.valid.find(x => x.keterangan.includes('Sumur Bor'));
  cek('KLL Bantul Kota - Sumur Bor masuk pilar Kemanusiaan', rSumur && rSumur.pilar === 'Kemanusiaan', rSumur);
  cek('detail keterangan KLL Bantul Kota - Sumur Bor tersimpan', rSumur && rSumur.keterangan === 'KLL Bantul Kota - Sumur Bor');

  const rAir = resParse.valid.find(x => x.keterangan.includes('Air Bersih') && x.namaDonatur.includes('Bantul Kota'));
  cek('KLL Bantul Kota - Air Bersih masuk pilar Kemanusiaan', rAir && rAir.pilar === 'Kemanusiaan', rAir);

  const rPandakAir = resParse.valid.find(x => x.keterangan.includes('Kemanusiaan Air Bersih'));
  cek('KLL Pandak Barat - Kemanusiaan Air Bersih masuk pilar Kemanusiaan', rPandakAir && rPandakAir.pilar === 'Kemanusiaan', rPandakAir);
  cek('detail keterangan Kemanusiaan Air Bersih tersimpan utuh', rPandakAir && rPandakAir.keterangan === 'KLL Pandak Barat - Kemanusiaan Air Bersih');

  const rFidyah = resParse.valid.find(x => x.keterangan.includes('Fidyah'));
  cek('KLL Bantul Kota - Fidyah masuk jenis Fidyah', rFidyah && rFidyah.jenisDana === 'Fidyah' && rFidyah.subJenis === 'Fidyah', rFidyah);

  const rFilantropis = resParse.valid.find(x => x.keterangan.includes('Filantropis'));
  cek('Filantropis masuk pilar Pendidikan', rFilantropis && rFilantropis.pilar === 'Pendidikan', rFilantropis);

  cek('FR baris KLL terbaca Lazismu Daerah Bantul, bukan nama KLL', resParse.valid.every(x => x.fundraising === 'Lazismu Daerah Bantul'), resParse.valid.map(x => x.fundraising));

  console.log('\n=== C. UJI PENYIMPANAN DATA IMPOR (ANTI-DUPLICATE CONSTRAINT) ===');
  // Simpan data hasil impor! Dulu ini GAGAL dengan: duplicate key value violates unique constraint "penghimpunan_kwitansi"
  const resSave = await rpcLaz('apiSaveImportedData', [SU, resParse.valid, 'himpun']);
  cek('apiSaveImportedData berhasil menyimpan 7 data tanpa error duplicate kwitansi', resSave && resSave.count === 7, resSave);

  const allHimpun = await rpcLaz('apiListPenghimpunan', [SU]);
  cek('total data penghimpunan menjadi 10 (3 awal + 7 impor)', allHimpun.length === 10);

  const kwList = allHimpun.map(x => x.noKwitansi);
  const kwUnik = new Set(kwList);
  cek('semua nomor kwitansi unik (tidak ada duplikat)', kwList.length === kwUnik.size, { kwList });

  console.log('\n=== D. UJI SPREADSHEET KAS DENGAN KAS SALDO AWAL & SETOR TUNAI ===');
  const teksBukuKas = [
    'Tanggal\tUraian\tAlamat\tNO HP\tDebet\tKredit\tSaldo\tFundraising',
    '1/1/26\tSaldo awal\t\t\t\t\tRp80.259.007\tSaldo Awal',
    '1/1/26\tPenerimaan donasi kemanusiaan puncak sosok\t\t\t7.954.800\t\tRp88.213.807\t',
    '2/1/26\tKLL Pajangan - Bencana\t\t\t15.000.000\t\tRp103.213.807\t',
    '2/1/26\tStor tunai kas amil\t\t\t\tRp250.000\tRp103.213.807\t',
    '5/1/26\tKLL Bantul Kota - Penghafal Quran\t\t\t1.875.000\t\tRp110.770.607\t',
    '5/1/26\tJamaah Masjid Ar Ridha - Bencana\t\t\t980.000\t\tRp114.941.607\tAriya',
    '17/1/26\tKanjaya Sayur - Bencana\t\t81327230028\t200.000\t\tRp201.907\t',
    '19/1/26\tSMA N 1 Bambanglipuro - Kemanusiaan\tJl Samas, warung pring\t882007277823\t1.510.800\t\tRp1.812.707\t',
    '6/1/26\tStor tunai BPD 551\t\t\t\t107.174.800\tRp16.147.207\t'
  ].join('\n');

  const resParseKas = await rpcLaz('apiParseImportText', [SU, teksBukuKas, 'himpun']);
  cek('berhasil diparse sebagai buku kas', resParseKas && resParseKas.isBukuKas);

  const kasValid = resParseKas.valid || [];
  cek('baris valid berjumlah 6 (saldo awal dan 2 setor tunai dilewati)', kasValid.length === 6, { len: kasValid.length });

  const rPuncak = kasValid.find(x => x.keterangan.includes('puncak sosok'));
  cek('donasi puncak sosok masuk pilar Kemanusiaan', rPuncak && rPuncak.pilar === 'Kemanusiaan', rPuncak);

  const rQuran = kasValid.find(x => x.keterangan.includes('Penghafal Quran'));
  cek('Penghafal Quran masuk pilar Keagamaan', rQuran && rQuran.pilar === 'Keagamaan', rQuran);

  const rFrAriya = kasValid.find(x => x.keterangan.includes('Ar Ridha'));
  cek('fundraising Ariya terbaca dari kolom H', rFrAriya && rFrAriya.fundraising === 'Ariya', rFrAriya);

  const rSma = kasValid.find(x => x.keterangan.includes('SMA N 1 Bambanglipuro'));
  cek('alamat terbaca dari kolom C', rSma && rSma.alamat.includes('Jl Samas'), rSma);
  cek('telepon terbaca dari kolom D', rSma && rSma.telepon.includes('882007277823'), rSma);

  // Simpan data buku kas ke database
  const resSaveKas = await rpcLaz('apiSaveImportedData', [SU, kasValid, 'himpun']);
  cek('berhasil menyimpan 6 data kas buku harian', resSaveKas && resSaveKas.count === 6);

  console.log(`\n=== HASIL: ${ok} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
})();
