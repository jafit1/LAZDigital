// tools/test_a1_a2_a3_rentang.js
'use strict';
const fs = require('fs');
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
  console.log('\n=== A. SETUP DATA PENERIMAAN KLL/ULL BERBEDA PILAR DI HARI SAMA ===');
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const SU = (await rpcLaz('login', ['superadmin', SANDI])).token;

  await rpcLaz('apiSaveLayanan', [SU, { kode: 'BTL', nama: 'Bantul Kota', tipe: 'KLL' }]);
  await rpcLaz('apiSaveLayanan', [SU, { kode: 'PDKB', nama: 'Pandak Barat', tipe: 'KLL' }]);

  // Di tanggal 2026-11-01:
  // KLL Bantul Kota punya 3 setoran berbeda pilar di hari yang sama:
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-01', namaDonatur: 'KLL Bantul Kota', jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Kesehatan', jumlah: 500000, metode: 'Cash/Tunai' }]);
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-01', namaDonatur: 'KLL Bantul Kota', jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Pendidikan', jumlah: 700000, metode: 'Cash/Tunai' }]);
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-01', namaDonatur: 'KLL Bantul Kota', jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Kemanusiaan', jumlah: 300000, metode: 'Cash/Tunai' }]);

  // Donatur biasa 2 orang (bukan KLL):
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-01', namaDonatur: 'Hamba Allah 1', jenisDana: 'Zakat', subJenis: 'Zakat Mal', jumlah: 200000, metode: 'Transfer Bank' }]);
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-01', namaDonatur: 'Hamba Allah 2', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 100000, metode: 'Cash/Tunai' }]);

  // Total baris transaksi = 3 (KLL) + 2 (Umum) = 5 baris
  // Tapi kwitansi KLL digabung 1 lembar, jadi total lembar kuitansi = 1 (KLL) + 2 (Umum) = 3 lembar!
  const resHarian = await rpcLaz('apiLaporanHarian', [SU, '2026-11-01']);
  cek('apiLaporanHarian membaca 5 transaksi', resHarian.ringkas.himpunCount === 5, resHarian.ringkas.himpunCount);
  cek('kuitansiCount otomatis menghitung setoran KLL Bantul Kota 3 pilar sebagai 1 kwitansi (total 3 kwitansi)', resHarian.ringkas.kuitansiCount === 3, resHarian.ringkas.kuitansiCount);

  console.log('\n=== B. UJI CETAK RENTANG TANGGAL PADA apiLaporanHarian ===');
  // Tambah transaksi di 2026-11-02 dan 2026-11-03
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-02', namaDonatur: 'Donatur Tgl 2', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 400000, metode: 'Cash/Tunai' }]);
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-03', namaDonatur: 'KLL Pandak Barat', jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Kemanusiaan', jumlah: 600000, metode: 'Transfer Bank' }]);
  await rpcLaz('apiSavePenghimpunan', [SU, { tanggal: '2026-11-03', namaDonatur: 'KLL Pandak Barat', jenisDana: 'Zakat', subJenis: 'Zakat Mal', jumlah: 400000, metode: 'Transfer Bank' }]);

  const resRentang = await rpcLaz('apiLaporanHarian', [SU, '2026-11-01', '2026-11-03']);
  cek('apiLaporanHarian rentang tanggal 1 s/d 3 memuat tanggal dan tanggalSampai', resRentang.tanggal === '2026-11-01' && resRentang.tanggalSampai === '2026-11-03');
  cek('total transaksi rentang 1-3 November = 8 transaksi', resRentang.himpun.length === 8, resRentang.himpun.length);

  // Kuitansi count rentang:
  // 1 Nov: KLL BTL (1) + Donatur 1 (1) + Donatur 2 (1) = 3
  // 2 Nov: Donatur Tgl 2 (1) = 1
  // 3 Nov: KLL Pandak Barat (1) = 1
  // Total kuitansi = 3 + 1 + 1 = 5 kuitansi!
  cek('kuitansiCount rentang tanggal menghitung KLL per hari menjadi 1 kwitansi (total 5)', resRentang.ringkas.kuitansiCount === 5, resRentang.ringkas.kuitansiCount);

  console.log('\n=== C. UJI TANDA TANGAN A2 DAN A3 ===');
  const ttdUpdate = await rpcLaz('apiSimpanTandaTanganA2', [SU, {
    kota: 'Kabupaten Bantul',
    kasir: 'Kasir Utama',
    keuangan: 'Laila Keuangan',
    a3Penyusun: 'Serli Manager',
    a3Menyetujui: 'Zainal Direktur'
  }]);
  cek('apiSimpanTandaTanganA2 menyimpan kolom ttd A2 dan A3', ttdUpdate.ok === true && ttdUpdate.a3Penyusun === 'Serli Manager' && ttdUpdate.a3Menyetujui === 'Zainal Direktur');

  const bSt = await rpcLaz('apiBootstrap', [SU]);
  const sSet = bSt.settings || {};
  cek('settings memuat formA3Penyusun dan formA3Menyetujui', sSet.formA3Penyusun === 'Serli Manager' && sSet.formA3Menyetujui === 'Zainal Direktur');

  console.log('\n=== D. UJI DOKUMEN CETAK HTML FORMULIR A1, A2, DAN A3 ===');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
  // Ambil fungsi buildA2HTML dan pendukungnya
  const vm = require('vm');
  const sandbox = {
    esc: (s) => String(s || ''),
    tglIndo: (t) => ({
      '2026-11-01': 'Minggu, 1 November 2026',
      '2026-11-02': 'Senin, 2 November 2026',
      '2026-11-03': 'Selasa, 3 November 2026',
      '2026-11-04': 'Rabu, 4 November 2026'
    })[t] || '',
    A2_MODE: 'otomatis',
    A2_MANUAL: {},
    A2_PECAHAN: [100000, 50000, 20000, 10000, 5000, 2000, 1000],
    A2_KOIN: [1000, 500, 200, 100],
    A2_URUT: ['Zakat', 'Infak', 'Wakaf'],
    A2_PETUGAS: 'Lazismu Daerah Bantul',
    a2Kunci: (p, k) => (k ? 'k_' : 'p_') + p,
    a2Label: (j) => j || 'Infak',
    isTransferMethod: (m) => /transfer|bank/i.test(m),
    a2Kelompok: (rows) => {
      const tunaiTotal = (rows || []).filter(x => !/transfer|bank/i.test(x.metode || '')).reduce((n, x) => n + Number(x.jumlah || 0), 0);
      const bankTotal = (rows || []).filter(x => /transfer|bank/i.test(x.metode || '')).reduce((n, x) => n + Number(x.jumlah || 0), 0);
      return {
        tunai: tunaiTotal ? [{ label: 'Infak', jumlah: tunaiTotal, petugas: 'Lazismu' }] : [],
        bank: bankTotal ? [{ label: 'Zakat', jumlah: bankTotal, petugas: 'Lazismu' }] : [],
        totalTunai: tunaiTotal, totalBank: bankTotal, total: tunaiTotal + bankTotal
      };
    },
    a2Nilai: () => ({ p_100000: 1 }),
    SETTINGS: { formA2Kota: 'Kabupaten Bantul', formA2Kasir: 'Jafit', formA2Keuangan: 'Laila Nurkhasanah', formA3Penyusun: 'Serli Monicawati', formA3Menyetujui: 'Zainal Arifin' }
  };
  vm.createContext(sandbox);
  // Tarik fungsi a2Angka dan buildA2HTML
  const fnMatch = appJs.match(/function a2Angka[\s\S]*?function buildA2HTML[\s\S]*?\n\}/);
  vm.runInContext(fnMatch[0], sandbox);

  // Uji A1 Kosongan
  const htmlA1 = sandbox.buildA2HTML({ tanggal: '2026-11-04' }, { tipe: 'A1', kosong: true });
  cek('Formulir A1 berisi judul "LAPORAN PENERIMAAN HARIAN" dan kode "Formulir A 1"', /LAPORAN PENERIMAAN HARIAN/.test(htmlA1) && /Formulir A 1/.test(htmlA1));
  cek('Formulir A1 bertanda tangan AR/FO dan Kasir', /AR\/FO/.test(htmlA1) && /Kasir/.test(htmlA1));
  cek('Formulir A1 tabel kosong tanpa angka data', !/300000|200000/.test(htmlA1));

  // Uji A2 Single Day & Rentang
  const htmlA2Rentang = sandbox.buildA2HTML({
    tanggal: '2026-11-01', tanggalSampai: '2026-11-03',
    himpun: [
      { tanggal: '2026-11-01', namaDonatur: 'Donatur 1', jumlah: 100000, metode: 'Cash/Tunai' },
      { tanggal: '2026-11-02', namaDonatur: 'Donatur 2', jumlah: 200000, metode: 'Transfer Bank' },
      { tanggal: '2026-11-03', namaDonatur: 'KLL Pandak Barat', layanan: 'KLL Pandak Barat', jumlah: 300000, metode: 'Transfer Bank' },
      { tanggal: '2026-11-03', namaDonatur: 'KLL Pandak Barat', layanan: 'KLL Pandak Barat', jumlah: 400000, metode: 'Transfer Bank' }
    ]
  }, { tipe: 'A2', kota: 'Kabupaten Bantul', kasir: 'Kasir Utama', keuangan: 'Laila Keuangan' });
  cek('Formulir A2 memuat judul "Formulir A 2"', /Formulir A 2/.test(htmlA2Rentang));
  cek('Formulir A2 rentang menjadi satu lembar per tanggal dalam satu dokumen', (htmlA2Rentang.match(/class="lembar(?: halaman-akhir)?"/g) || []).length === 3);
  cek('Formulir A2 rentang mencetak tanggal harian, bukan periode agregat', /Minggu, 1 November 2026/.test(htmlA2Rentang) && /Senin, 2 November 2026/.test(htmlA2Rentang) && /Selasa, 3 November 2026/.test(htmlA2Rentang) && !/Periode.*s\/d/i.test(htmlA2Rentang));
  cek('Formulir A2 rentang memisahkan jumlah per hari', /100\.000/.test(htmlA2Rentang) && /200\.000/.test(htmlA2Rentang) && /700\.000/.test(htmlA2Rentang));
  cek('Formulir A2 rentang menghitung kuitansi tiap halaman, termasuk KLL multi-pilar satu lembar', /Dokumen Kuitansi Penerimaan : 1 lembar/.test(htmlA2Rentang));
  cek('Formulir A2 bertanda tangan Kasir dan Keuangan', /Kasir Utama/.test(htmlA2Rentang) && /Laila Keuangan/.test(htmlA2Rentang));

  // Uji A3 Tutup Hari
  const htmlA3 = sandbox.buildA2HTML({ tanggal: '2026-11-04' }, { tipe: 'A3', kota: 'Kabupaten Bantul' });
  cek('Formulir A3 memuat judul "LAPORAN TUTUP HARI PENERIMAAN" dan kode "Formulir A 3"', /LAPORAN TUTUP HARI PENERIMAAN/.test(htmlA3) && /Formulir A 3/.test(htmlA3));
  cek('Formulir A3 memuat tanda tangan 3 kolom: Penyusun, Diperiksa, Menyetujui', /Penyusun/.test(htmlA3) && /Diperiksa/.test(htmlA3) && /Menyetujui/.test(htmlA3));
  cek('Formulir A3 memuat jabatan Manager Fundraising, Keuangan, Direktur', /Manager Fundraising/.test(htmlA3) && /Keuangan/.test(htmlA3) && /Direktur/.test(htmlA3));
  cek('Formulir A3 mencantumkan nama Serli Monicawati, Laila Nurkhasanah, Zainal Arifin', /Serli Monicawati/.test(htmlA3) && /Laila Nurkhasanah/.test(htmlA3) && /Zainal Arifin/.test(htmlA3));

  console.log(`\n=== HASIL: ${ok} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
})();
