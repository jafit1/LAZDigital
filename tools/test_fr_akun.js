/* Uji: nama fundraising melekat ke akun pengguna.
 *
 * Keputusan pemilik: nama fundraising harus punya akun aktif, walaupun
 * inputnya bisa manual oleh superadmin. Cocokkan ke akun yang sudah ada
 * sesuai namanya; yang belum cocok dibuatkan akun baru dengan izin paket
 * fundraiser. Nama bukan orang ("Lazismu Daerah Bantul", "Kantor", "Qris")
 * tidak dibuatkan akun.
 *
 * Aturan yang dijaga:
 *   1. _bacaFundraising tetap mengembalikan daftar STRING seperti sebelum
 *      (semua dropdown lama tidak pecah).
 *   2. apiPemakaianFundraising mengembalikan peta `akun` {nama: {userId,
 *      username, aktif}} untuk nama yang sudah terikat akun.
 *   3. apiTautkanFundraising memasangkan nama ke akun yang sudah ada
 *      (cocok nama) atau membuat akun baru (username disarankan dari nama,
 *      sandi wajib, izin paket fundraiser), hanya superadmin.
 *   4. apiSavePenghimpunan: akun yang terikat nama fundraising selalu
 *      memakai namanya sendiri, tidak bisa diisi manual nama lain
 *      (kecuali superadmin/koordinator).
 *
 * Nama dan angka karangan, bukan data lembaga.
 *
 *   node tools/test_fr_akun.js
 */
'use strict';
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 220)); }
};

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [['id', 'username', 'passwordHash', 'salt', 'nama', 'role', 'permissions', 'aktif', 'dibuat', 'layanan']];
  s.Sessions = [['token', 'userId', 'expired']];
  s.Settings = [['key', 'value']];
  const besok = new Date(Date.now() + 864e5).toISOString();
  const u = (id, username, nama, role, izin) => [id, username, 'hash', 'garam', nama, role, JSON.stringify(izin), 'true', new Date().toISOString(), ''];
  s.Users.push(u('u_super', 'superadmin', 'Super Administrator', 'superadmin', {}));
  s.Users.push(u('u_sherli', 'sherli', 'Sherli', 'staff', { penghimpunan: { view: true, create: true } }));
  s.Sessions.push(['tok_super', 'u_super', besok]);
  s.Sessions.push(['tok_sherli', 'u_sherli', besok]);
  return { sheets: s, props: {} };
}
async function jalan(fn, args, db) {
  db = db || dbBaru();
  try {
    const out = await engine.runRPC(db, fn, args, {});
    return { ok: true, hasil: out.result, db: out.db };
  } catch (e) {
    return { ok: false, galat: e.message, db };
  }
}

(async () => {
  const F = (r) => (r.hasil && r.hasil.daftar) || [];

  console.log('\n=== A. DAFTAR TETAP STRING (KOMPATIBEL) ===');
  let r = await jalan('apiListFundraising', ['tok_super']);
  cek('apiListFundraising ok', r.ok, r.galat);
  cek('daftar berupa string', r.ok && F(r).every((n) => typeof n === 'string'), F(r));

  console.log('\n=== B. TAUTKAN KE AKUN YANG SUDAH ADA ===');
  r = await jalan('apiTautkanFundraising', ['tok_super', { nama: 'Sherli', username: 'sherli' }]);
  cek('tautkan berhasil', r.ok, r.galat);
  r = await jalan('apiPemakaianFundraising', ['tok_super'], r.db);
  const akunSherli = r.ok && r.hasil.akun && r.hasil.akun.Sherli;
  cek('peta akun berisi Sherli', !!(akunSherli && akunSherli.username === 'sherli'), r.hasil && r.hasil.akun);
  cek('daftar tetap string setelah ditautkan', F(r).every((n) => typeof n === 'string'));

  console.log('\n=== C. BUATKAN AKUN BARU + IZIN PAKET ===');
  r = await jalan('apiTautkanFundraising', ['tok_super', { nama: 'Ariya', username: 'Petugas Uji', password: 'SandiBaru123' }]);
  cek('buatkan akun berhasil', r.ok, r.galat);
  if (r.ok) {
    const t = r.db.sheets.Users, h = t[0];
    const baris = t.slice(1).find((x) => String(x[h.indexOf('username')]).toLowerCase().replace(/[^a-z0-9]/g, '') === 'petugasuji');
    cek('baris user baru ada', !!baris);
    if (baris) {
      const izin = JSON.parse(baris[h.indexOf('permissions')] || '{}');
      cek('paket izin: penghimpunan lihat+tambah', !!(izin.penghimpunan && izin.penghimpunan.view && izin.penghimpunan.create), izin);
      cek('paket izin: tanpa settings', !(izin.settings && (izin.settings.view || izin.settings.edit)), izin);
      cek('paket izin: tanpa users', !(izin.users && (izin.users.view || izin.users.create)), izin);
      cek('role staff, bukan superadmin', baris[h.indexOf('role')] === 'staff', baris[h.indexOf('role')]);
    }
    const r2 = await jalan('apiPemakaianFundraising', ['tok_super'], r.db);
    cek('nama baru terikat di peta akun', !!(r2.ok && r2.hasil.akun && r2.hasil.akun.Ariya), r2.hasil && r2.hasil.akun);
  }

  console.log('\n=== D. NAMA BUKAN ORANG DITOLAK ===');
  for (const nama of ['Lazismu Daerah Bantul', 'Kantor', 'Qris']) {
    r = await jalan('apiTautkanFundraising', ['tok_super', { nama, username: 'x', password: 'SandiBaru123' }]);
    cek('"' + nama + '" tidak bisa dibuatkan/tautkan akun', !r.ok, r.galat);
  }

  console.log('\n=== E. BUKAN SUPERADMIN DITOLAK ===');
  r = await jalan('apiTautkanFundraising', ['tok_sherli', { nama: 'Ariya', username: 'sherli' }]);
  cek('staff tidak bisa menautkan (IZIN)', !r.ok && /^IZIN:/.test(r.galat || ''), r.galat);

  console.log('\n=== F. INPUT TERKUNCI KE NAMANYA SENDIRI ===');
  r = await jalan('apiTautkanFundraising', ['tok_super', { nama: 'Sherli', username: 'sherli' }]);
  const dbTaut = r.db;
  r = await jalan('apiSavePenghimpunan', ['tok_sherli', {
    tanggal: '2026-10-16', namaDonatur: 'Hamba Allah', jenisDana: 'Infak', subJenis: 'Infak Umum',
    jumlah: 50000, metode: 'Cash/Tunai', fundraising: 'Ariya',
  }], dbTaut);
  cek('simpan tetap ok (tidak ditolak)', r.ok, r.galat);
  if (r.ok) cek('fundraising dipaksa jadi nama sendiri', r.hasil.fundraising === 'Sherli', r.hasil.fundraising);
  r = await jalan('apiSavePenghimpunan', ['tok_super', {
    tanggal: '2026-10-16', namaDonatur: 'Hamba Allah', jenisDana: 'Infak', subJenis: 'Infak Umum',
    jumlah: 50000, metode: 'Cash/Tunai', fundraising: 'Ariya',
  }], dbTaut);
  cek('superadmin tetap bisa isi manual', r.ok && r.hasil.fundraising === 'Ariya', r.ok ? r.hasil.fundraising : r.galat);

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_fr_akun.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
