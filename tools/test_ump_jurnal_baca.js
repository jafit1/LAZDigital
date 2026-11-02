// tools/test_ump_jurnal_baca.js
'use strict';
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
  console.log('\n=== A. INISIALISASI UNTUK BACA UMP DARI JURNAL ===');
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const SU = (await rpcLaz('login', ['superadmin', SANDI])).token;

  await rpcLaz('apiSaveLayanan', [SU, { kode: 'PDKB', nama: 'Pandak Barat', tipe: 'KLL' }]);
  await rpcLaz('apiSaveLayanan', [SU, { kode: 'BTL', nama: 'Bantul Kota', tipe: 'KLL' }]);

  // Berkas Jurnal dengan UMP Keluar, Pengembalian UMP, dan LPJ UMP
  const teksJurnal = [
    '\tUMP INFAK\t\t\t',
    '2026-10-05\tUMP KLL Pandak Barat\t1500000\t\tUang muka program kado ramadhan',
    '2026-10-05\tKas Infak\t\t1500000\tUang muka program kado ramadhan',
    '',
    '\tPENGEMBALIAN UMP\t\t\t',
    '2026-10-20\tKas Infak\t200000\t\tPengembalian sisa UMP KLL Pandak Barat',
    '2026-10-20\tUMP KLL Pandak Barat\t\t200000\tPengembalian sisa UMP KLL Pandak Barat',
    '',
    '\tUMP LPJ INFAK\t\t\t',
    '2026-10-25\tPenyaluran Infak - Sosial\t1300000\t\tLPJ KLL Pandak Barat',
    '2026-10-25\tKas Infak\t\t1300000\tLPJ KLL Pandak Barat'
  ].join('\n');

  const res = await rpcLaz('apiParseImportText', [SU, teksJurnal, 'himpun']);
  cek('jurnal berhasil diparsing', !!res && res.success);
  cek('terdeteksi sebagai jurnal', res.isJurnal === true);

  const umpList = res.umpValid || [];
  cek('terdapat 2 baris pergerakan UMP (keluar dan kembali)', umpList.length === 2, umpList);

  const umpKeluar = umpList.find(x => x.jenis === 'keluar');
  cek('ump keluar terdeteksi untuk KLL Pandak Barat senilai 1.500.000', umpKeluar && umpKeluar.layanan === 'KLL Pandak Barat' && umpKeluar.nominal === 1500000, umpKeluar);

  const umpKembali = umpList.find(x => x.jenis === 'kembali');
  cek('ump kembali terdeteksi untuk KLL Pandak Barat senilai 200.000', umpKembali && umpKembali.layanan === 'KLL Pandak Barat' && umpKembali.nominal === 200000, umpKembali);

  const salurList = res.salurValid || [];
  const lpjRow = salurList.find(x => x.program.includes('Penyaluran Infak'));
  cek('LPJ masuk ke penyaluran atas nama KLL Pandak Barat senilai 1.300.000', lpjRow && lpjRow.namaPenerima === 'KLL Pandak Barat' && lpjRow.jumlah === 1300000, lpjRow);

  // Simpan data UMP dan LPJ ke sistem
  await rpcLaz('apiSaveImportedData', [SU, umpList, 'ump']);
  await rpcLaz('apiSaveImportedData', [SU, salurList, 'salur']);

  // Cek saldo KLL Pandak Barat
  const resSaldo = await rpcLaz('apiSaldoLayanan', [SU, '2026-10-31', '2026-10']);
  const kllRow = resSaldo.daftar.find(x => x.layanan === 'KLL Pandak Barat');
  cek('saldo KLL Pandak Barat memuat UMP Keluar 1.500.000', kllRow && kllRow.umpKeluar === 1500000, kllRow);
  cek('saldo KLL Pandak Barat memuat UMP Kembali 200.000', kllRow && kllRow.umpKembali === 200000, kllRow);
  cek('saldo KLL Pandak Barat memuat LPJ 1.300.000', kllRow && kllRow.lpj === 1300000, kllRow);
  cek('belum LPJ KLL Pandak Barat lunas = 0 (1.500.000 - 1.300.000 - 200.000)', kllRow && kllRow.belumLPJ === 0, kllRow);

  console.log(`\n=== HASIL: ${ok} lulus, ${gagal} gagal ===`);
  if (gagal > 0) process.exit(1);
})();
