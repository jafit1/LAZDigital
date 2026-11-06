// tools/test_harian_kll_multipilar.js
'use strict';
const fs = require('fs');
const path = require('path');

let ok = 0, gagal = 0;
function cek(n, syarat, info) {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { gagal++; console.log('  GAGAL|', n, info !== undefined ? '-> ' + JSON.stringify(info) : ''); }
}

const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');

// Ekstrak fungsi-fungsi pendukung dari app.js
const sandbox = {
  console: console,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  rp: (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'),
  rpCetak: (n) => (Number(n) || 0).toLocaleString('id-ID'),
  tglIndo: () => '1 November 2026',
  terbilang: () => 'satu juta lima ratus ribu',
  jamIndo: () => '14:00',
  SVG_ICONS: { cetak: '', bsrDokumen: '' },
  lhRingkas: () => '',
  lhPisahRekening: null,
  isTransferMethod: null,
  isKantorKll: null,
  prioritasJenisHarian: null,
  labelPilarHarian: null,
  lhSusunHimpun: null,
  buildHarianHTML: null,
  lhTabelCetak: () => ''
};

// Ambil definisi fungsi dari app.js
const fnIsTransfer = (appJs.match(/function isTransferMethod\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
const fnPisah = (appJs.match(/function lhPisahRekening\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
const fnIsKantor = (appJs.match(/function isKantorKll\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
const fnPrioritas = (appJs.match(/function prioritasJenisHarian\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
const fnLabelPilar = (appJs.match(/function labelPilarHarian\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
const fnSusun = (appJs.match(/function lhSusunHimpun\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

cek('fungsi isTransferMethod ditemukan', !!fnIsTransfer);
cek('fungsi lhPisahRekening ditemukan', !!fnPisah);
cek('fungsi isKantorKll ditemukan', !!fnIsKantor);
cek('fungsi prioritasJenisHarian ditemukan', !!fnPrioritas);
cek('fungsi labelPilarHarian ditemukan', !!fnLabelPilar);
cek('fungsi lhSusunHimpun ditemukan', !!fnSusun);

// Evaluasi bersama agar saling mengenali
const kodeGabung = [fnIsTransfer, fnPisah, fnIsKantor, fnPrioritas, fnLabelPilar, fnSusun].join('\n;\n');
const funcs = eval(`(() => {
  ${kodeGabung}
  return { isTransferMethod, lhPisahRekening, isKantorKll, prioritasJenisHarian, labelPilarHarian, lhSusunHimpun };
})()`);

Object.assign(sandbox, funcs);

console.log('\n=== A. UJI PRIORITAS JENIS DANA (ZAKAT -> INFAK UMUM -> INFAK TERIKAT) ===');
const pZakat = sandbox.prioritasJenisHarian({ jenisDana: 'Zakat', subJenis: 'Zakat Mal' });
const pInfakUmum = sandbox.prioritasJenisHarian({ jenisDana: 'Infak', subJenis: 'Infak Umum' });
const pInfakTerikat = sandbox.prioritasJenisHarian({ jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Pendidikan' });
const pLainnya = sandbox.prioritasJenisHarian({ jenisDana: 'Wakaf' });

cek('Zakat prioritas 1', pZakat === 1, pZakat);
cek('Infak Umum prioritas 2', pInfakUmum === 2, pInfakUmum);
cek('Infak Terikat prioritas 3', pInfakTerikat === 3, pInfakTerikat);
cek('Lainnya prioritas 4', pLainnya === 4, pLainnya);

console.log('\n=== B. UJI PENGGABUNGAN MULTI-PILAR KLL DAN URUTAN TRANSFER TERATAS ===');
const dataUji = [
  // 1. KLL Bantul Kota: 3 pilar Tunai di hari yang sama
  { tanggal: '2026-11-01', namaDonatur: 'KLL Bantul Kota', layanan: 'KLL Bantul Kota', jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Kesehatan', jumlah: 300000, metode: 'Cash/Tunai', noKwitansi: 'KW-001' },
  { tanggal: '2026-11-01', namaDonatur: 'KLL Bantul Kota', layanan: 'KLL Bantul Kota', jenisDana: 'Zakat', subJenis: 'Zakat Mal', jumlah: 500000, metode: 'Cash/Tunai', noKwitansi: 'KW-001' },
  { tanggal: '2026-11-01', namaDonatur: 'KLL Bantul Kota', layanan: 'KLL Bantul Kota', jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Pendidikan', jumlah: 700000, metode: 'Cash/Tunai', noKwitansi: 'KW-001' },

  // 2. Donatur Biasa 1 (Tunai)
  { tanggal: '2026-11-01', namaDonatur: 'Pak Budi', layanan: 'Penghimpunan Daerah', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 100000, metode: 'Cash/Tunai', noKwitansi: 'KW-002' },

  // 3. KLL Pandak Barat: 2 pilar Transfer Bank di hari yang sama
  { tanggal: '2026-11-01', namaDonatur: 'KLL Pandak Barat', layanan: 'KLL Pandak Barat', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 400000, metode: 'Transfer Bank', bank: 'BPD Syariah - 803211000510', noKwitansi: 'KW-003' },
  { tanggal: '2026-11-01', namaDonatur: 'KLL Pandak Barat', layanan: 'KLL Pandak Barat', jenisDana: 'Zakat', subJenis: 'Zakat Mal', jumlah: 600000, metode: 'Transfer Bank', bank: 'BPD Syariah - 803211000510', noKwitansi: 'KW-003' },

  // 4. Donatur Biasa 2 (Transfer)
  { tanggal: '2026-11-01', namaDonatur: 'Ibu Siti', layanan: 'Penghimpunan Daerah', jenisDana: 'Zakat', subJenis: 'Zakat Mal', jumlah: 250000, metode: 'Transfer Bank', bank: 'BSI - 1011959004', noKwitansi: 'KW-004' }
];

const hasilSusun = sandbox.lhSusunHimpun(dataUji);

cek('total baris hasil susun = 4 baris (2 KLL grup + 2 donatur perorangan)', hasilSusun.length === 4, hasilSusun.length);

// Baris 1 & 2 harus Transfer
cek('baris 1 metode Transfer Bank', sandbox.isTransferMethod(hasilSusun[0].metode) === true, hasilSusun[0]);
cek('baris 2 metode Transfer Bank', sandbox.isTransferMethod(hasilSusun[1].metode) === true, hasilSusun[1]);

// Baris 3 & 4 harus Tunai / Cash
cek('baris 3 metode Cash/Tunai', sandbox.isTransferMethod(hasilSusun[2].metode) === false, hasilSusun[2]);
cek('baris 4 metode Cash/Tunai', sandbox.isTransferMethod(hasilSusun[3].metode) === false, hasilSusun[3]);

// Periksa KLL Pandak Barat (Transfer)
const rowPdk = hasilSusun.find((x) => x.namaDonatur === 'KLL Pandak Barat');
cek('KLL Pandak Barat digabung 1 entri', !!rowPdk);
cek('KLL Pandak Barat total jumlah 1.000.000', rowPdk && rowPdk.jumlah === 1000000, rowPdk && rowPdk.jumlah);
cek('KLL Pandak Barat rincian ada 2 item', rowPdk && rowPdk.rincian && rowPdk.rincian.length === 2, rowPdk && rowPdk.rincian);
cek('KLL Pandak Barat urutan item 1 adalah Zakat Mal', rowPdk && rowPdk.rincian && /Zakat/i.test(rowPdk.rincian[0].label), rowPdk && rowPdk.rincian);
cek('KLL Pandak Barat urutan item 2 adalah Infak Umum', rowPdk && rowPdk.rincian && /Infak Umum/i.test(rowPdk.rincian[1].label), rowPdk && rowPdk.rincian);

// Periksa KLL Bantul Kota (Tunai)
const rowBtl = hasilSusun.find((x) => x.namaDonatur === 'KLL Bantul Kota');
cek('KLL Bantul Kota digabung 1 entri', !!rowBtl);
cek('KLL Bantul Kota total jumlah 1.500.000', rowBtl && rowBtl.jumlah === 1500000, rowBtl && rowBtl.jumlah);
cek('KLL Bantul Kota rincian ada 3 item', rowBtl && rowBtl.rincian && rowBtl.rincian.length === 3, rowBtl && rowBtl.rincian);
cek('KLL Bantul Kota urutan 1 adalah Zakat Mal (500k)', rowBtl && rowBtl.rincian && /Zakat/i.test(rowBtl.rincian[0].label) && rowBtl.rincian[0].jumlah === 500000, rowBtl && rowBtl.rincian);
cek('KLL Bantul Kota urutan 2 & 3 adalah Infak Terikat (Kesehatan & Pendidikan)',
  rowBtl && rowBtl.rincian && /Kesehatan/i.test(rowBtl.rincian[1].label) && /Pendidikan/i.test(rowBtl.rincian[2].label),
  rowBtl && rowBtl.rincian
);

console.log('\n=== C. CEK KODE APP.JS DAN DOKUMEN CETAK HARIAN ===');
cek('renderHarianPreview memanggil lhSusunHimpun', /var listHimpun = lhSusunHimpun\(d\.himpun\)/.test(appJs));
cek('renderHarianPreview menampilkan lh-multi-pilar', /lh-multi-pilar/.test(appJs));
cek('buildHarianHTML memanggil lhSusunHimpun', /var listHimpun = lhSusunHimpun\(d\.himpun\)/.test(appJs));
cek('buildHarianHTML menyertakan sub-pilar', /sub-pilar/.test(appJs));

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) process.exit(1);
console.log('\ntest_harian_kll_multipilar.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
