// tools/test_harian_no_kwitansi_bagi_hasil.js
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
  console.log('\n=== A. CEK STRUKTUR KODE APP.JS (NO KWITANSI TIDAK DITAMPILKAN) ===');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');

  const fnPreview = (appJs.match(/function renderHarianPreview\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const fnCetak = (appJs.match(/function buildHarianHTML\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

  cek('renderHarianPreview tidak memuat <th>No. Kwitansi</th>', !/<th>No\.\s*Kwitansi<\/th>/i.test(fnPreview));
  cek('buildHarianHTML tabel Penghimpunan tidak memiliki kolom No. Kwitansi', !/No\.\s*Kwitansi/i.test(fnCetak));

  console.log('\n=== B. UJI DATA apiLaporanHarian: BAGI HASIL DIPISAH DARI PENGHIMPUNAN ===');
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const SU = (await rpcLaz('login', ['superadmin', SANDI])).token;

  // 1. Donasi reguler Zakat & Infak
  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-11-05', namaDonatur: 'Hamba Allah', jenisDana: 'Zakat',
    subJenis: 'Zakat Mal', jumlah: 500000, metode: 'Cash/Tunai', noKwitansi: 'KW-01'
  }]);
  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-11-05', namaDonatur: 'Donatur Tetap', jenisDana: 'Infak',
    subJenis: 'Infak Umum', jumlah: 250000, metode: 'Transfer Bank', bank: 'BSI - 1011959004', noKwitansi: 'KW-02'
  }]);

  // 2. Transaksi Bagi Hasil Bank
  await rpcLaz('apiSavePenghimpunan', [SU, {
    tanggal: '2026-11-05', namaDonatur: 'Bagi Hasil Rekening BPD', jenisDana: 'Infak',
    subJenis: 'Bagi Hasil Bank', jumlah: 150000, metode: 'Transfer Bank', bank: 'BPD Syariah - 803211000510',
    keterangan: 'Bagi Hasil Rekening Operasional BPD', noKwitansi: 'KW-03'
  }]);

  const res = await rpcLaz('apiLaporanHarian', [SU, '2026-11-05']);

  cek('himpun hanya berisi donasi reguler (2 transaksi)', res.himpun.length === 2, res.himpun.length);
  cek('himpunTotal tidak memasukkan bagi hasil (750.000)', res.ringkas.himpunTotal === 750000, res.ringkas.himpunTotal);
  cek('bagiHasil masuk ke bagian tersendiri (1 transaksi)', res.bagiHasil && res.bagiHasil.length === 1, res.bagiHasil);
  cek('bagiHasilTotal bernilai 150.000', res.ringkas.bagiHasilTotal === 150000, res.ringkas.bagiHasilTotal);
  cek('bagiHasil yang dipisah memuat keterangan dan bank', res.bagiHasil[0].jumlah === 150000 && /BPD/.test(res.bagiHasil[0].bank));

  console.log('\n=== C. UJI RENDER LAYAR & CETAK PDF MEMISAHKAN BAGI HASIL DAN HILANGKAN NO KWITANSI ===');
  const vm = require('vm');
  const sandbox = {
    console: console,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    rp: (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'),
    rpCetak: (n) => (Number(n) || 0).toLocaleString('id-ID'),
    tglIndo: () => 'Kamis, 5 November 2026',
    terbilang: () => 'sembilan ratus ribu',
    jamIndo: () => '14:00',
    SVG_ICONS: { cetak: '', bsrDokumen: '' },
    lhRekapMini: () => '',
    lhRekapCetak: () => '',
    ME: { nama: 'Superadmin' },
    lhTabelCetak: (judul, kolom, baris, total) => {
      let th = kolom.map((k) => '<th>' + k.t + '</th>').join('');
      let tr = baris.map((b) => '<tr>' + b.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('');
      return `<div class="sec-wrap"><div class="judul-tabel">${judul}</div><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody><tfoot><tr><td colspan="${kolom.length}">Total: ${total}</td></tr></tfoot></table></div>`;
    }
  };
  vm.createContext(sandbox);

  // Jalankan kode fungsi dari app.js
  const fnIsTransfer = (appJs.match(/function isTransferMethod\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const fnPisah = (appJs.match(/function lhPisahRekening\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const fnIsBh = (appJs.match(/function isBagiHasil\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const fnIsKantor = (appJs.match(/function isKantorKll\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const fnPrioritas = (appJs.match(/function prioritasJenisHarian\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const fnLabelPilar = (appJs.match(/function labelPilarHarian\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const fnSusun = (appJs.match(/function lhSusunHimpun\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

  const kodeGabung = [fnIsTransfer, fnPisah, fnIsBh, fnIsKantor, fnPrioritas, fnLabelPilar, fnSusun, fnPreview, fnCetak].join('\n;\n');
  vm.runInContext(kodeGabung, sandbox);

  // Buat HTML Cetak
  const htmlHasil = sandbox.buildHarianHTML(res);

  cek('dokumen cetak memuat bagian A. PENGHIMPUNAN', /A\.\s*PENGHIMPUNAN/.test(htmlHasil));
  cek('dokumen cetak memuat bagian tersendiri B. BAGI HASIL BANK', /B\.\s*BAGI HASIL BANK/.test(htmlHasil));
  cek('tabel A. PENGHIMPUNAN tidak memuat teks atau kolom "No. Kwitansi"', !/<th>No\.\s*Kwitansi<\/th>/i.test(htmlHasil) && !/KW-01|KW-02/.test(htmlHasil));
  cek('tabel B. BAGI HASIL BANK memuat nilai 150.000', /150\.000/.test(htmlHasil));
  cek('total penghimpunan terpisah sebesar 750.000', /750\.000/.test(htmlHasil));

  console.log(`\n=== HASIL: ${ok} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
  console.log('\ntest_harian_no_kwitansi_bagi_hasil.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})();
