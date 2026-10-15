/* Uji: baris impor dengan tanggal yang tidak terbaca (contoh "206-10-11",
 * harusnya "2026-10-11") ditandai SEBELUM disimpan, bukan baru ketahuan
 * lewat galat server yang membocorkan id baris internal ke layar:
 *
 *   "Penghimpunan[b2a2eb4d0bc842f2].tanggal: tanggal "206-10-11" tidak bisa dibaca"
 *
 * Bug lama: parseImportDate() punya fallback `new Date(val)` yang menerima
 * tahun mustahil ("206-10-11" dibaca sebagai tahun 206) dan membulatkannya
 * jadi tanggal yang TAMPAK sah ("0206-10-10"), bukan menandainya rusak.
 * Baris ini lolos sebagai "valid" di impor Excel/teks berheader biasa, baru
 * ditolak server pg saat disimpan.
 *
 * Pemilik (15 Oktober 2026): layar impor tidak menunjukkan tombol "Tetap
 * simpan" dan temuan ini tidak kelihatan di bagian atas.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_tanggal_tak_terbaca.js
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
    ['tok-uji-tgl', 'u1', new Date().toISOString(), new Date(Date.now() + 864e5).toISOString(), '', ''],
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

const TEKS = [
  'Tanggal\tNama\tJenis Dana\tJumlah',
  '206-10-11\tHamba Allah\tZakat\t300000',
  '2026-10-12\tDonatur Dua\tInfak\t500000',
].join('\n');

(async () => {
  const r = await jalankan('apiParseImportText', ['tok-uji-tgl', TEKS, 'himpun', {}]);
  cek('impor berjalan', !!(r && r.success), r);
  const takTerbaca = (r.invalid || []).find((x) => x._tanggalTakTerbaca);
  cek('baris tanggal tak terbaca ditandai, bukan dibulatkan jadi tanggal sah', !!takTerbaca, r);
  if (takTerbaca) cek('nilai mentah tersimpan untuk ditunjukkan ke pengguna', takTerbaca.tanggal === '206-10-11', takTerbaca.tanggal);
  cek('baris tanggal sah tetap masuk valid', (r.valid || []).some((x) => x.tanggal === '2026-10-12'));

  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
  cek('app.js menampilkan peringatan tanggal tak terbaca', /_tanggalTakTerbaca/.test(app), 'tidak ditangani di layar');

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_tanggal_tak_terbaca.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
