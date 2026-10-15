/* Uji: temuan "kemungkinan salah tanggal" menyertakan nomor baris sumber
 * di berkas Excel, supaya admin tidak perlu mencari manual di antara
 * ribuan baris jurnal.
 *
 * Pemilik (15 Oktober 2026): "di foto ada yang tanggalnya salah tapi ku cari
 * di file ga nemu" — keterangan dan nama donatur saja tidak cukup untuk
 * menemukan baris aslinya di Excel.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_anomali_tgl_baris.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require(path.join(__dirname, '..', 'api', '_engine.js'));
const pg = require(path.join(__dirname, '..', 'lib', 'laz-pg.js'));
const skema = require(path.join(__dirname, '..', 'lib', 'laz-skema.js'));

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
    ['tok-uji-baris', 'u1', new Date().toISOString(), new Date(Date.now() + 864e5).toISOString(), '', ''],
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
  ['', 'PENERIMAAN INFAK UMUM VIA BANK', '', '', ''],
  ['2026-10-05', 'Kas Infak', '5000', '', 'NN - Infak Umum'],
  ['2026-10-07', 'Penerimaan Infak Umum', '', '5000', 'NN - Infak Umum'],
  ['2026-10-08', 'Kas Infak', '600000', '', 'Donatur Dua - Infak Umum'],
  ['2026-10-08', 'Penerimaan Infak Umum', '', '600000', 'Donatur Dua - Infak Umum'],
].map((r) => r.join('\t')).join('\n');

(async () => {
  const r = await jalankan('apiParseImportText', ['tok-uji-baris', B, 'himpun', { bulan: '2026-10', jenis: 'bank' }]);
  cek('impor berjalan sebagai jurnal', !!(r && r.isJurnal), r);
  const anom = (r && r.anomaliTanggal) || [];
  cek('ada anomali tanggal terdeteksi', anom.length === 1, anom);
  if (anom.length) cek('nomor baris sumber disertakan', anom[0].baris === 2, anom[0]);

  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
  const fn = (app.match(/function imporBlokTanggal\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  cek('imporBlokTanggal menampilkan kolom Baris', /a\.baris/.test(fn), 'tabel tidak menampilkan a.baris');

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_anomali_tgl_baris.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
