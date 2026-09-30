/* Uji "Ingat saya": peramban tidak boleh lagi menyimpan sandi.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Dulu "Ingat saya" menyimpan username DAN sandi asli di localStorage
 * (kunci laz_creds), cuma dibungkus base64. Base64 bukan penyandian: siapa
 * pun yang membuka DevTools di komputer kantor yang dipakai bersama, atau
 * satu baris skrip jahat lewat celah XSS, langsung mendapat sandi amil dalam
 * bentuk teks biasa. Sandi itu juga sering dipakai ulang di email pribadi.
 * Lebih buruk lagi, sandi yang tersimpan tidak bisa "dicabut": mengganti sandi
 * di server tidak menghapus salinan di peramban.
 *
 * Penggantinya adalah TOKEN INGAT:
 *   - acak 256 bit, dibuat server, berlaku 30 hari;
 *   - yang disimpan di basis data hanya HASH-nya (baris Sessions berawalan
 *     "ing:"), jadi bocornya tabel Sessions tidak memberi token yang bisa
 *     dipakai;
 *   - hanya bisa ditukar dengan sesi biasa lewat loginIngat, tidak bisa
 *     dipakai langsung sebagai token sesi;
 *   - ikut dicabut saat keluar, saat sandi diganti, dan saat akun
 *     dinonaktifkan.
 *
 *   node tools/test_ingat_saya.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
async function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  let db = { sheets: s, props: {} };
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  db = (await engine.runRPC(db, 'setup', [], {})).db;
  /* satu petugas biasa */
  db = (await engine.runRPC(db, 'login', ['superadmin', SANDI], {})).db;
  const tokSuper = sesiTerakhir(db);
  db = (await engine.runRPC(db, 'apiSaveUser', [tokSuper, { username: 'petugas.uji', nama: 'Petugas Uji', role: 'staff', password: SANDI, permissions: { penghimpunan: { view: true } } }], {})).db;
  return db;
}
function barisSesi(db) {
  const t = db.sheets.Sessions, h = t[0];
  return t.slice(1).map((r) => { const o = {}; h.forEach((k, j) => { o[k] = r[j]; }); return o; });
}
function sesiTerakhir(db) { const b = barisSesi(db); return b[b.length - 1].token; }
function idUser(db, username) {
  const t = db.sheets.Users, h = t[0];
  const r = t.slice(1).find((x) => x[h.indexOf('username')] === username);
  return r[h.indexOf('id')];
}
async function rpc(db, fn, args) {
  try { const out = await engine.runRPC(db, fn, args, { ip: '10.0.0.1' }); return { ok: true, hasil: out.result, db: out.db }; }
  catch (e) { return { ok: false, galat: e.message, db }; }
}
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

(async () => {
  let db = await dbBaru();

  console.log('\n=== A. LOGIN DENGAN "INGAT SAYA" MEMBERI TOKEN, BUKAN MENYIMPAN SANDI ===');
  let r = await rpc(db, 'login', ['petugas.uji', SANDI, true]);
  db = r.db;
  const ingat = r.ok && r.hasil && r.hasil.ingat;
  cek('login berhasil', r.ok && r.hasil.ok, r.galat || r.hasil);
  cek('server mengembalikan token ingat', typeof ingat === 'string' && ingat.length >= 40, ingat);
  cek('token ingat berbeda dari token sesi', ingat && ingat !== r.hasil.token);
  const baris = barisSesi(db);
  cek('basis data menyimpan HASH token ingat, bukan tokennya',
    ingat && baris.some((b) => b.token === 'ing:' + hash(ingat)) && !baris.some((b) => b.token === ingat));
  const bIngat = ingat && baris.find((b) => b.token === 'ing:' + hash(ingat));
  const hari = bIngat ? (new Date(bIngat.expired) - Date.now()) / 864e5 : 0;
  cek('token ingat berlaku sekitar 30 hari', hari > 29 && hari <= 30.01, hari);

  r = await rpc(db, 'login', ['petugas.uji', SANDI]);
  db = r.db;
  cek('login tanpa "Ingat saya" tidak memberi token ingat', r.ok && r.hasil.ok && !r.hasil.ingat, r.hasil);

  console.log('\n=== B. TOKEN INGAT DITUKAR DENGAN SESI BARU ===');
  r = await rpc(db, 'loginIngat', [ingat]);
  db = r.db;
  const tokBaru = r.ok && r.hasil && r.hasil.token;
  cek('loginIngat dengan token sah berhasil', r.ok && r.hasil.ok && !!tokBaru, r.galat || r.hasil);
  cek('yang kembali adalah user yang benar', r.ok && r.hasil.user && r.hasil.user.username === 'petugas.uji');
  cek('hasil loginIngat tidak memuat hash atau garam sandi',
    r.ok && !/passwordHash|salt/.test(JSON.stringify(r.hasil)));
  r = await rpc(db, 'apiMe', [tokBaru]);
  cek('sesi hasil loginIngat bisa dipakai', r.ok && r.hasil.username === 'petugas.uji', r.galat);

  console.log('\n=== C. TOKEN INGAT BUKAN TOKEN SESI ===');
  r = await rpc(db, 'apiMe', [ingat]);
  cek('token ingat tidak bisa dipakai langsung sebagai sesi', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'apiMe', ['ing:' + hash(ingat)]);
  cek('isi kolom basis data (ing:hash) tidak bisa dipakai sebagai sesi', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'loginIngat', ['ing:' + hash(ingat)]);
  cek('isi kolom basis data juga tidak bisa ditukar lewat loginIngat', r.ok && r.hasil.ok === false, r.hasil);
  r = await rpc(db, 'loginIngat', [tokBaru]);
  cek('token sesi biasa tidak bisa ditukar lewat loginIngat', r.ok && r.hasil.ok === false, r.hasil);
  r = await rpc(db, 'loginIngat', ['tebakan-acak']);
  cek('token karangan ditolak', r.ok && r.hasil.ok === false, r.hasil);
  r = await rpc(db, 'loginIngat', ['']);
  cek('token kosong ditolak', r.ok && r.hasil.ok === false, r.hasil);

  console.log('\n=== D. TOKEN INGAT BISA DICABUT ===');
  /* kedaluwarsa */
  let dbK = JSON.parse(JSON.stringify(db));
  const hS = dbK.sheets.Sessions[0];
  dbK.sheets.Sessions.forEach((row, i) => { if (i && row[hS.indexOf('token')] === 'ing:' + hash(ingat)) row[hS.indexOf('expired')] = new Date(Date.now() - 1000).toISOString(); });
  r = await rpc(dbK, 'loginIngat', [ingat]);
  cek('token ingat yang sudah lewat 30 hari ditolak', r.ok && r.hasil.ok === false, r.hasil);

  /* akun dinonaktifkan */
  let dbN = JSON.parse(JSON.stringify(db));
  const hU = dbN.sheets.Users[0];
  dbN.sheets.Users.forEach((row, i) => { if (i && row[hU.indexOf('username')] === 'petugas.uji') row[hU.indexOf('aktif')] = 'false'; });
  r = await rpc(dbN, 'loginIngat', [ingat]);
  cek('akun yang dinonaktifkan tidak bisa masuk lewat token ingat', r.ok && r.hasil.ok === false, r.hasil);

  /* ganti sandi */
  r = await rpc(JSON.parse(JSON.stringify(db)), 'apiChangeMyPassword', [tokBaru, SANDI, 'SandiLain5678']);
  cek('ganti sandi berhasil', r.ok, r.galat);
  r = await rpc(r.db, 'loginIngat', [ingat]);
  cek('setelah sandi diganti, token ingat lama ikut mati', r.ok && r.hasil.ok === false, r.hasil);

  /* keluar */
  r = await rpc(JSON.parse(JSON.stringify(db)), 'logout', [tokBaru, ingat]);
  cek('keluar berhasil', r.ok, r.galat);
  cek('keluar menghapus baris token ingat', !barisSesi(r.db).some((b) => b.token === 'ing:' + hash(ingat)));
  r = await rpc(r.db, 'loginIngat', [ingat]);
  cek('setelah keluar, token ingat tidak berlaku lagi', r.ok && r.hasil.ok === false, r.hasil);

  /* token ingat milik orang lain tidak bisa dihapus lewat logout sembarang */
  let dbL = JSON.parse(JSON.stringify(db));
  r = await rpc(dbL, 'login', ['superadmin', SANDI]);
  r = await rpc(r.db, 'logout', [sesiTerakhir(r.db), ingat]);
  cek('logout akun lain tidak ikut mencabut token ingat milik petugas',
    barisSesi(r.db).some((b) => b.token === 'ing:' + hash(ingat)));

  console.log('\n=== E. APP.JS TIDAK LAGI MENYIMPAN SANDI ===');
  const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
  cek('tidak ada lagi localStorage.setItem(\'laz_creds\'...)', !/setItem\(\s*'laz_creds'/.test(app));
  cek('tidak ada lagi objek {u:..,p:..} yang disimpan', !/JSON\.stringify\(\{u:u,p:p\}\)/.test(app));
  cek('laz_creds warisan dihapus dari peramban', /removeItem\(\s*'laz_creds'\s*\)/.test(app));
  cek('login mengirim pilihan "Ingat saya" ke server', /gas\('login'\)\(u,p,remember\)/.test(app));
  cek('masuk ulang diam-diam memakai loginIngat', /fn:'loginIngat'/.test(app));
  cek('login ulang diam-diam tidak lagi mengirim sandi', !/fn:'login',args:\[c\.u,c\.p\]/.test(app));

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: "Ingat saya" masih menyimpan sandi atau tokennya belum aman.\n'); process.exit(1); }
  console.log('\ntest_ingat_saya.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
