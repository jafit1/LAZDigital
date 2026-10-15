/* Uji: tabel perbandingan jurnal vs rekap (temuan "rekapRingkas", field
 * angka.himpun) memuat rincian per nama KLL/ULL, bukan cuma total KLL dan
 * ULL digabung jadi satu angka.
 *
 * Pemilik (15 Oktober 2026): "baca secara detail" minta rincian per kantor,
 * karena satu baris "Penerimaan KLL" menyembunyikan kantor mana yang
 * sebenarnya beda dengan rekap.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_rkangka_per_kantor.js
 */
'use strict';
const path = require('path');
const engine = require(path.join(__dirname, '..', 'api', '_engine.js'));
const skema = require(path.join(__dirname, '..', 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};
async function rpc(db, fn, args) {
  try { const o = await engine.runRPC(db, fn, args, { ip: '127.0.0.1' }); return { ok: true, hasil: o.result, db: o.db }; }
  catch (e) { return { ok: false, galat: e.message, db }; }
}
const B = (rows) => rows.map((r) => r.join('\t')).join('\n');
const pasang = (tgl, d, k, n, ket) => [[tgl, d, String(n), '', ket], [tgl, k, '', String(n), ket]];

(async () => {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Contoh1234';
  let db = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  let r = await rpc(db, 'login', ['superadmin', 'Contoh1234']); db = r.db;
  const T = r.hasil.token;
  for (const nama of ['Sewon Utara', 'Sanden']) {
    r = await rpc(db, 'apiSaveLayanan', [T, { tipe: 'KLL', nama, aktif: 'true' }]); db = r.db;
  }

  const kas = [
    ['', 'PENERIMAAN ZAKAT VIA KAS', '', '', ''],
    ...pasang('2026-10-03', 'Kas Zakat', 'Penerimaan Zakat Mal', 300000, 'KLL Sewon Utara - Zakat Mal'),
    ...pasang('2026-10-09', 'Kas Zakat', 'Penerimaan Zakat Mal', 500000, 'KLL Sanden - Zakat Mal'),
  ];
  const resKas = await (await rpc(db, 'apiParseImportText', [T, B(kas), 'himpun', { bulan: '2026-10', jenis: 'kas' }])).hasil;
  cek('jurnal kas terbaca', !!(resKas && resKas.isJurnal), resKas);

  const rekap = [
    { nama: 'HIMPUN', rows: [
      ['TANGGAL', 'NAMA', 'KETERANGAN', 'PROGRAM PENERIMAAN', 'JUMLAH', 'MELALUI', 'Kasir'],
      ['2026-10-03', 'KL Lazismu Sewon Utara', 'Zakat Mal', 'Tanpa Pembatasan Zakat Maal', 300000, 'BANTUL', 'Kantor'],
      ['2026-10-09', 'KL Lazismu Sanden', 'Zakat Mal', 'Tanpa Pembatasan Zakat Maal', 500000, 'BANTUL', 'Kantor'],
    ] },
  ];
  const peta = { himpun: resKas.himpunValid, salur: resKas.salurValid, ump: resKas.umpValid, transfer: resKas.transferValid };
  r = await rpc(db, 'apiSamakanRekap', [T, peta, rekap, { bulan: '2026-10', jenis: 'kas' }]);
  cek('apiSamakanRekap tersedia', r.ok, r.galat);

  const ringkas = ((r.hasil && r.hasil.temuan) || []).find((t) => t.jenis === 'rekapRingkas');
  cek('temuan rekapRingkas ada', !!ringkas);
  const kantor = ringkas && ringkas.angka && ringkas.angka.himpun && ringkas.angka.himpun.kantor;
  cek('rincian per kantor ada di angka.himpun.kantor', !!kantor, ringkas && ringkas.angka);
  if (kantor) {
    cek('rincian KLL Sewon Utara', kantor['KLL Sewon Utara'] === 300000, kantor);
    cek('rincian KLL Sanden', kantor['KLL Sanden'] === 500000, kantor);
  }

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_rkangka_per_kantor.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
