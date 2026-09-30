/* Uji: akun yang dinonaktifkan atau dihapus harus LANGSUNG kehilangan akses.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Sebelum perbaikan ini, authUser() hanya memeriksa bahwa sesinya ada dan
 * belum kedaluwarsa. Status "aktif" hanya diperiksa saat login. Akibatnya,
 * amil yang dinonaktifkan (misalnya karena berhenti bertugas, atau karena
 * akunnya dicurigai dipakai orang lain) tetap bisa membuka dan MENGUBAH buku
 * besar lewat sesi yang sudah terbuka, sampai 12 jam kemudian. Menonaktifkan
 * akun juga tidak mematikan sesi dan token "Ingat saya"-nya. Menghapus akun
 * meninggalkan baris sesinya di basis data.
 *
 * Aturan yang dijaga di sini:
 *   A. Menonaktifkan akun mematikan semua sesi dan token ingatnya saat itu juga.
 *   B. Kalau status aktif berubah lewat jalur lain (pemulihan cadangan, ubah
 *      langsung di basis data), sesi lama tetap ditolak pada permintaan
 *      berikutnya, karena authUser sendiri yang memeriksa.
 *   C. Semua modul (Broadcast, AI, Fundraising, Media) ikut tertutup, karena
 *      mereka memeriksa izin lewat engine.cekIzin -> authUser yang sama.
 *   D. Menghapus akun ikut menghapus sesi dan token ingatnya.
 *   E. Menyunting akun yang tetap aktif (tanpa ganti sandi) TIDAK boleh
 *      menendang pemiliknya keluar.
 *
 *   node tools/test_akun_nonaktif.js
 */
'use strict';
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200)); }
};

/* Nama dan sandi karangan. */
const SANDI = 'Contoh1234';
async function rpc(db, fn, args) {
  try { const out = await engine.runRPC(db, fn, args, { ip: '10.0.0.2' }); return { ok: true, hasil: out.result, db: out.db }; }
  catch (e) { return { ok: false, galat: e.message, db }; }
}
function barisSesi(db) {
  const t = db.sheets.Sessions, h = t[0];
  return t.slice(1).map((r) => { const o = {}; h.forEach((k, j) => { o[k] = r[j]; }); return o; });
}
function idUser(db, username) {
  const t = db.sheets.Users, h = t[0];
  return t.slice(1).find((r) => r[h.indexOf('username')] === username)[h.indexOf('id')];
}
const salin = (o) => JSON.parse(JSON.stringify(o));

/* Satu basis data: superadmin + satu petugas yang sedang masuk di dua tempat
   (sesi biasa dan token "Ingat saya"). */
async function siapkan() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  let db = { sheets: s, props: {} };
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  db = (await engine.runRPC(db, 'setup', [], {})).db;
  let r = await rpc(db, 'login', ['superadmin', SANDI]); db = r.db;
  const tokSuper = r.hasil.token;
  r = await rpc(db, 'apiSaveUser', [tokSuper, { username: 'amil.berhenti', nama: 'Amil Berhenti', role: 'staff', password: SANDI,
    permissions: { penghimpunan: { view: true, create: true }, broadcast: { view: true } } }]); db = r.db;
  r = await rpc(db, 'login', ['amil.berhenti', SANDI]); db = r.db;
  const tokAmil = r.hasil.token;
  r = await rpc(db, 'login', ['amil.berhenti', SANDI, true]); db = r.db;
  const tokAmil2 = r.hasil.token, ingatAmil = r.hasil.ingat;
  return { db, tokSuper, tokAmil, tokAmil2, ingatAmil, idAmil: idUser(db, 'amil.berhenti') };
}
const dataAmil = (aktif, tambahan) => Object.assign({ username: 'amil.berhenti', nama: 'Amil Berhenti', role: 'staff', aktif,
  permissions: { penghimpunan: { view: true, create: true }, broadcast: { view: true } } }, tambahan || {});

(async () => {
  const P = await siapkan();
  let r = await rpc(salin(P.db), 'apiMe', [P.tokAmil]);
  cek('persiapan: sesi amil berlaku sebelum dinonaktifkan', r.ok && r.hasil.username === 'amil.berhenti', r.galat);

  console.log('\n=== A. MENONAKTIFKAN AKUN MEMATIKAN SEMUA SESINYA SAAT ITU JUGA ===');
  r = await rpc(salin(P.db), 'apiSaveUser', [P.tokSuper, Object.assign({ id: P.idAmil }, dataAmil(false))]);
  cek('superadmin menonaktifkan akun amil', r.ok, r.galat);
  let db = r.db;
  cek('tidak ada lagi baris sesi milik amil di basis data',
    !barisSesi(db).some((b) => String(b.userId) === String(P.idAmil)), barisSesi(db).filter((b) => b.userId === P.idAmil).length);
  r = await rpc(db, 'apiMe', [P.tokAmil]);
  cek('sesi pertama amil langsung ditolak', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'apiListPenghimpunan', [P.tokAmil2]);
  cek('sesi kedua amil juga ditolak (tidak bisa membaca buku besar)', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'loginIngat', [P.ingatAmil]);
  cek('token "Ingat saya" amil ikut mati', r.ok && r.hasil.ok === false, r.hasil);
  r = await rpc(db, 'apiMe', [P.tokSuper]);
  cek('sesi superadmin yang menonaktifkan tidak ikut terputus', r.ok && r.hasil.username === 'superadmin', r.galat);

  console.log('\n=== B. STATUS BERUBAH LEWAT JALUR LAIN: AUTHUSER SENDIRI YANG MENOLAK ===');
  /* Misalnya pemulihan cadangan lama atau pengubahan langsung di basis data:
     sesinya masih ada, tetapi akunnya sudah tidak aktif. */
  db = salin(P.db);
  const hU = db.sheets.Users[0];
  db.sheets.Users.forEach((row, i) => { if (i && row[hU.indexOf('id')] === P.idAmil) row[hU.indexOf('aktif')] = 'false'; });
  cek('persiapan: baris sesi amil masih ada', barisSesi(db).some((b) => String(b.userId) === String(P.idAmil)));
  r = await rpc(db, 'apiMe', [P.tokAmil]);
  cek('sesi milik akun nonaktif ditolak walau barisnya masih ada', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'apiSavePenghimpunan', [P.tokAmil2, { tanggal: '2026-09-30', jenisDana: 'Infak', namaDonatur: 'Karangan', jumlah: 50000, metode: 'Tunai' }]);
  cek('akun nonaktif tidak bisa mencatat transaksi', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  const nHimpun = (db.sheets.Penghimpunan || []).length;
  cek('buku besar tidak bertambah satu baris pun', nHimpun <= 1, nHimpun);

  console.log('\n=== C. MODUL LAIN IKUT TERTUTUP ===');
  let tolak = null;
  try { engine.cekIzin(db, P.tokAmil, 'broadcast', 'view', {}); } catch (e) { tolak = e.message; }
  cek('pemeriksaan izin modul (Broadcast, AI, Fundraising, Media) menolak akun nonaktif', /AUTH:/.test(tolak || ''), tolak || 'diterima');

  console.log('\n=== D. MENGHAPUS AKUN IKUT MENGHAPUS SESINYA ===');
  r = await rpc(salin(P.db), 'apiDeleteUser', [P.tokSuper, P.idAmil]);
  cek('superadmin menghapus akun amil', r.ok, r.galat);
  cek('tidak ada baris sesi yatim milik akun yang dihapus',
    !barisSesi(r.db).some((b) => String(b.userId) === String(P.idAmil)));
  const r2 = await rpc(r.db, 'loginIngat', [P.ingatAmil]);
  cek('token "Ingat saya" akun yang dihapus tidak berlaku', r2.ok && r2.hasil.ok === false, r2.hasil);

  console.log('\n=== E. MENYUNTING AKUN YANG TETAP AKTIF TIDAK MENENDANG PEMILIKNYA ===');
  r = await rpc(salin(P.db), 'apiSaveUser', [P.tokSuper, Object.assign({ id: P.idAmil }, dataAmil(true, { nama: 'Amil Ganti Nama' }))]);
  cek('mengganti nama amil berhasil', r.ok, r.galat);
  const r3 = await rpc(r.db, 'apiMe', [P.tokAmil]);
  cek('sesi amil tetap berlaku sesudah namanya diganti', r3.ok && r3.hasil.nama === 'Amil Ganti Nama', r3.galat);
  const r4 = await rpc(r.db, 'loginIngat', [P.ingatAmil]);
  cek('token "Ingat saya"-nya juga tetap berlaku', r4.ok && r4.hasil.ok === true, r4.hasil);

  console.log('\n=== F. DIAKTIFKAN LAGI: HARUS MASUK ULANG, SESI LAMA TIDAK HIDUP LAGI ===');
  r = await rpc(salin(P.db), 'apiSaveUser', [P.tokSuper, Object.assign({ id: P.idAmil }, dataAmil(false))]);
  r = await rpc(r.db, 'apiSaveUser', [P.tokSuper, Object.assign({ id: P.idAmil }, dataAmil(true))]);
  db = r.db;
  r = await rpc(db, 'apiMe', [P.tokAmil]);
  cek('sesi lama tidak hidup kembali setelah akun diaktifkan lagi', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'login', ['amil.berhenti', SANDI]);
  cek('amil bisa masuk lagi dengan sandinya', r.ok && r.hasil.ok === true, r.hasil);

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: akun yang dinonaktifkan masih bisa dipakai.\n'); process.exit(1); }
  console.log('\ntest_akun_nonaktif.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
