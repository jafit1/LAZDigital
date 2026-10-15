/* Uji: kolom FR (fundraising) baris jurnal KLL/ULL dibaca "Lazismu Daerah
 * Bantul" (default), bukan nama KLL/ULL itu sendiri. Fundraising dari uraian
 * ("via Sherli") tetap harus terbaca untuk baris non-KLL/ULL.
 *
 * Bug: fundraising dipaksa = namaDonatur untuk baris layanan
 * (`layananId || _pre ? namaDonatur : ...`), sehingga kolom FR di pratinjau
 * menampilkan "KLL Sewon Utara" dkk, padahal fundraising hanya berlaku di
 * tingkat daerah.
 *
 *   node tools/test_fr_bukan_kll.js
 */
'use strict';
const engine = require('../api/_engine.js');
const pg = require('../lib/laz-pg.js');
const skema = require('../lib/laz-skema.js');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [
    ['id', 'username', 'nama', 'password', 'role', 'permissions', 'aktif', 'layanan', 'dibuat'],
    ['u1', 'admin', 'Admin Uji', 'x', 'superadmin', '{}', 'true', '', new Date().toISOString()],
  ];
  s.Sessions = [
    ['token', 'userId', 'dibuat', 'expiredAt', 'ip', 'ua'],
    ['tok-uji-fr', 'u1', new Date().toISOString(), new Date(Date.now() + 864e5).toISOString(), '', ''],
  ];
  s.Layanan = [
    ['id', 'tipe', 'nama', 'kode', 'wilayah', 'penanggungJawab', 'telepon', 'aktif'],
    ['l1', 'KLL', 'Sewon Utara', '', '', '', '', 'true'],
  ];
  return { sheets: s, props: {} };
}
async function jalankan(fn, args) {
  const minta = new Set(pg._internal.DASAR);
  for (let putaran = 1; putaran <= 24; putaran++) {
    const db = dbBaru();
    const diminta = [];
    engine._setLambat({
      lengkap: new Set(minta),
      jumlah: {},
      diminta,
      minta(n) { if (!diminta.includes(n)) diminta.push(n); throw new pg.PerluLembar(n); },
    });
    try {
      const keluar = await engine.runRPC(db, fn, args, {});
      if (diminta.length) { for (const n of diminta) minta.add(n); continue; }
      return keluar.result;
    } catch (e) {
      const perlu = pg.lembarDari(e);
      if (perlu) { for (const n of diminta) minta.add(n); minta.add(perlu); continue; }
      throw e;
    } finally { engine._setLambat(null); }
  }
  throw new Error('Tidak selesai setelah 24 putaran.');
}

const B = [
  ['', 'PENERIMAAN ZAKAT VIA BANK', '', '', ''],
  ['2026-10-01', 'Kas Zakat', '300000', '', 'KLL Sewon Utara - Zakat Mal'],
  ['2026-10-01', 'Penerimaan Zakat Mal', '', '300000', 'KLL Sewon Utara - Zakat Mal'],

  ['', 'PENERIMAAN INFAK TERIKAT VIA BANK', '', '', ''],
  ['2026-10-05', 'Kas Infak', '500000', '', 'Hamba Allah - Kemanusiaan via Sherli'],
  ['2026-10-05', 'Penerimaan Infak Terikat', '', '500000', 'Hamba Allah - Kemanusiaan via Sherli'],
].map((r) => r.join('\t')).join('\n');

(async () => {
  const r = await jalankan('apiParseImportText', ['tok-uji-fr', B, 'himpun', { bulan: '2026-10', jenis: 'bank' }]);
  const H = (r && r.himpunValid) || [];

  const kll = H.find((x) => /sewon utara/i.test(x.namaDonatur || ''));
  cek('baris KLL ditemukan', !!kll, H.map((x) => x.namaDonatur));
  if (kll) cek('FR baris KLL = Lazismu Daerah Bantul, bukan nama KLL', kll.fundraising === 'Lazismu Daerah Bantul', kll.fundraising);

  const viaFr = H.find((x) => /sherli/i.test(x.keterangan || ''));
  cek('baris "via Sherli" ditemukan', !!viaFr);
  if (viaFr) cek('FR membaca nama fundraising dari uraian', viaFr.fundraising === 'Sherli', viaFr.fundraising);

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_fr_bukan_kll.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
