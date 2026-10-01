/* Uji rekomendasi 12: penguncian login yang tidak bisa dipakai untuk mengunci
 * orang lain, dan token sesi yang tidak tersimpan apa adanya.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * 1. Penguncian login dulu dihitung per USERNAME saja (ditambah per IP).
 *    Siapa pun di internet cukup salah sandi 12 kali atas nama "superadmin"
 *    untuk mengunci superadmin yang asli selama 30 menit, dari komputer mana
 *    pun. Username superadmin mudah ditebak, dan repo ini publik.
 *    Sekarang hitungan ketat berlaku per (username + IP) dan per IP, jadi
 *    penyerang hanya mengunci dirinya sendiri. Hitungan per username tetap
 *    ada tetapi dengan ambang jauh lebih tinggi (20 kali), supaya tebakan sandi
 *    yang disebar dari banyak IP tetap terhenti.
 *
 * 2. Token sesi dulu disimpan di tabel Sessions apa adanya. Siapa pun yang
 *    bisa membaca tabel itu (bocoran basis data, akses Supabase yang terlalu
 *    luas) bisa langsung memakai sesi siapa saja. Sekarang yang disimpan hanya
 *    hash-nya dengan awalan "h:". Sesi lama yang tersimpan apa adanya tetap
 *    diterima sampai kedaluwarsa (paling lama 12 jam), supaya tidak ada yang
 *    terlempar keluar pada hari deploy.
 *
 *   node tools/test_sesi_kuat.js
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 220)); }
};
async function rpc(db, fn, args, ip) {
  try { const out = await engine.runRPC(db, fn, args, { ip: ip || '10.9.9.9' }); return { ok: true, hasil: out.result, db: out.db }; }
  catch (e) { return { ok: false, galat: e.message, db }; }
}
function barisSesi(db) {
  const t = db.sheets.Sessions, h = t[0];
  return t.slice(1).map((r) => { const o = {}; h.forEach((k, j) => { o[k] = r[j]; }); return o; });
}
const SANDI = 'Contoh1234';
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

(async () => {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  const dasar = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const salin = () => JSON.parse(JSON.stringify(dasar));

  console.log('\n=== A. PENYERANG TIDAK BISA MENGUNCI SUPERADMIN DARI LUAR ===');
  let db = salin(), r;
  for (let i = 0; i < 12; i++) { r = await rpc(db, 'login', ['superadmin', 'tebakan' + i], '203.0.113.7'); db = r.db; }
  cek('penyerang sendiri terkunci setelah 12 kali salah', r.ok && r.hasil.ok === false && r.hasil.terkunci > 0, r.hasil);
  r = await rpc(db, 'login', ['superadmin', SANDI], '203.0.113.7'); db = r.db;
  cek('dari IP penyerang, sandi benar pun tetap ditolak selama terkunci', r.ok && r.hasil.ok === false && r.hasil.terkunci > 0, r.hasil);
  r = await rpc(db, 'login', ['superadmin', SANDI], '198.51.100.20'); db = r.db;
  cek('superadmin asli dari kantor TETAP bisa masuk', r.ok && r.hasil.ok === true, r.hasil);

  console.log('\n=== B. TEBAKAN YANG DISEBAR DARI BANYAK IP TETAP TERHENTI ===');
  db = salin();
  for (let i = 0; i < 20; i++) { r = await rpc(db, 'login', ['superadmin', 'tebakan' + i], '192.0.2.' + (i + 1)); db = r.db; }
  r = await rpc(db, 'login', ['superadmin', 'tebakan-lagi'], '192.0.2.200'); db = r.db;
  cek('setelah 20 kali salah dari 20 IP berbeda, username itu terkunci sementara', r.ok && r.hasil.ok === false && r.hasil.terkunci > 0, r.hasil);
  cek('pesannya tetap tidak membocorkan apakah username ada', r.ok && !/tidak ditemukan|tidak ada/i.test(r.hasil.msg || ''), r.hasil);

  console.log('\n=== C. SALAH KETIK BIASA TIDAK MENGUNCI ===');
  db = salin();
  for (let i = 0; i < 3; i++) { r = await rpc(db, 'login', ['superadmin', 'salahketik'], '198.51.100.20'); db = r.db; }
  r = await rpc(db, 'login', ['superadmin', SANDI], '198.51.100.20'); db = r.db;
  cek('tiga kali salah ketik lalu benar: langsung masuk', r.ok && r.hasil.ok === true, r.hasil);

  console.log('\n=== D. TOKEN SESI TIDAK TERSIMPAN APA ADANYA ===');
  db = salin();
  r = await rpc(db, 'login', ['superadmin', SANDI]); db = r.db;
  const tok = r.hasil.token;
  const baris = barisSesi(db);
  cek('tabel Sessions tidak memuat token itu apa adanya', !baris.some((b) => b.token === tok));
  cek('yang tersimpan adalah hash-nya (awalan h:)', baris.some((b) => b.token === 'h:' + sha(tok)), baris.map((b) => String(b.token).slice(0, 6)));
  r = await rpc(db, 'apiMe', [tok]);
  cek('token itu tetap bisa dipakai', r.ok && r.hasil.username === 'superadmin', r.galat);
  r = await rpc(db, 'apiMe', ['h:' + sha(tok)]);
  cek('isi kolom basis data (h:...) tidak bisa dipakai sebagai token', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');

  console.log('\n=== E. SESI LAMA YANG TERSIMPAN APA ADANYA TETAP BERLAKU ===');
  const idSuper = db.sheets.Users[1][db.sheets.Users[0].indexOf('id')];
  db.sheets.Sessions.push(['token-lama-apa-adanya', idSuper, new Date(Date.now() + 36e5).toISOString()]);
  r = await rpc(db, 'apiMe', ['token-lama-apa-adanya']);
  cek('sesi yang dibuat sebelum pembaruan tidak terlempar keluar', r.ok && r.hasil.username === 'superadmin', r.galat);

  console.log('\n=== F. KELUAR DAN GANTI SANDI TETAP BEKERJA ===');
  r = await rpc(db, 'login', ['superadmin', SANDI]); db = r.db;
  const tok2 = r.hasil.token;
  r = await rpc(db, 'logout', [tok]); db = r.db;
  cek('keluar menghapus baris hash-nya', !barisSesi(db).some((b) => b.token === 'h:' + sha(tok)));
  r = await rpc(db, 'apiMe', [tok]);
  cek('token yang sudah keluar ditolak', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'apiChangeMyPassword', [tok2, SANDI, 'SandiBaru5678']); db = r.db;
  cek('ganti sandi berhasil', r.ok, r.galat);
  r = await rpc(db, 'apiMe', [tok2]);
  cek('sesi yang dipakai untuk mengganti sandi tetap hidup', r.ok, r.galat);
  r = await rpc(db, 'apiMe', ['token-lama-apa-adanya']);
  cek('sesi lain (termasuk yang tersimpan apa adanya) dimatikan', !r.ok && /AUTH:/.test(r.galat), r.galat || 'diterima');

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: penguncian login atau penyimpanan sesi belum benar.\n'); process.exit(1); }
  console.log('\ntest_sesi_kuat.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
