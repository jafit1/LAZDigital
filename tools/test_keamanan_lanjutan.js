/* Uji gelombang kedua perbaikan keamanan (30 September 2026).
 *
 * Satu berkas untuk beberapa celah kecil yang saling lepas, supaya
 * uji-sebelum-deploy.bat tidak bertambah panjang untuk hal-hal sepele. Setiap
 * bagian menjelaskan celahnya sendiri.
 *
 *   A. Tautan dashboard publik: dulu izin "lihat Dashboard" saja sudah cukup
 *      untuk MENYALAKAN dan membuat ulang tautan publik lembaga.
 *   B. Pengaturan: apiBootstrap mengirim SEMUA Settings ke setiap pengguna
 *      (termasuk token dashboard publik dan catatan penguncian login), dan
 *      apiSaveSettings menerima kunci apa pun, termasuk yang semestinya hanya
 *      diubah sistem (penguncian login, token publik, foto pengguna lain).
 *   C. Impor lewat URL: server mau mengambil alamat apa saja, termasuk
 *      localhost, jaringan internal, dan alamat metadata cloud (SSRF).
 *   D. Log aktivitas: pemegang izin "hapus log" bisa menghapus seluruh jejak,
 *      termasuk jejak perbuatannya sendiri. Sekarang hanya superadmin.
 *   E. Verifikasi kwitansi: nomor kwitansi berurutan (KW/202609/0001, 0002, ...)
 *      dan halaman publik mengembalikan NOMINAL untuk nomor mana pun, jadi
 *      seluruh donasi bisa disisir dari luar. Sekarang nominal hanya tampil
 *      kalau kode acak di QR kwitansi ikut cocok.
 *   F. Header keamanan di vercel.json.
 *   G. Berkas sensitif tidak ikut ter-push ke repositori publik.
 *
 *   node tools/test_keamanan_lanjutan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 220)); }
};
async function rpc(db, fn, args) {
  try { const out = await engine.runRPC(db, fn, args, { ip: '10.0.0.3' }); return { ok: true, hasil: out.result, db: out.db }; }
  catch (e) { return { ok: false, galat: e.message, db }; }
}
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8');
const SANDI = 'Contoh1234';

(async () => {
  /* Nama dan angka karangan. */
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  let db = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  let r = await rpc(db, 'login', ['superadmin', SANDI]); db = r.db;
  const tSuper = r.hasil.token;
  const buat = async (username, izin) => {
    r = await rpc(db, 'apiSaveUser', [tSuper, { username, nama: username, role: 'staff', password: SANDI, permissions: izin }]); db = r.db;
    r = await rpc(db, 'login', [username, SANDI]); db = r.db;
    return r.hasil.token;
  };
  const tLihat = await buat('amil.lihat', { dashboard: { view: true }, penghimpunan: { view: true, create: true } });
  const tLog = await buat('amil.log', { log: { view: true, delete: true } });

  console.log('\n=== A. TAUTAN DASHBOARD PUBLIK ===');
  r = await rpc(db, 'apiGeneratePublicLink', [tLihat]);
  cek('izin lihat Dashboard saja tidak bisa menyalakan tautan publik', !r.ok && /IZIN/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'apiDisablePublicLink', [tLihat]);
  cek('dan tidak bisa mematikannya', !r.ok && /IZIN/.test(r.galat), r.galat || 'diterima');
  r = await rpc(db, 'apiGeneratePublicLink', [tSuper]); db = r.db;
  cek('pemegang izin Pengaturan (superadmin) tetap bisa menyalakannya', r.ok && !!r.hasil.token, r.galat);
  const tokenPublik = r.ok ? r.hasil.token : '';
  r = await rpc(db, 'apiGetPublicLinkInfo', [tLihat]);
  cek('pemegang izin Dashboard tetap bisa melihat tautannya untuk dibagikan', r.ok && r.hasil.enabled === true, r.galat);
  const app = baca('src/public/app.js');
  cek('tombol buat/nonaktifkan tautan hanya muncul untuk pemegang izin Pengaturan',
    /function openPublicLink[\s\S]{0,1600}canDo\('settings','edit'\)/.test(app));

  console.log('\n=== B. PENGATURAN ===');
  /* Catatan penguncian login ikut tersimpan di Settings. */
  await rpc(db, 'login', ['amil.lihat', 'salah-sandi']).then((x) => { db = x.db; });
  r = await rpc(db, 'apiBootstrap', [tLihat]);
  const set = r.ok ? r.hasil.settings : {};
  cek('apiBootstrap tidak lagi mengirim catatan penguncian login (lg_*)', r.ok && !Object.keys(set).some((k) => /^lg_/.test(k)), Object.keys(set));
  cek('apiBootstrap tidak lagi mengirim token dashboard publik', r.ok && !('publicToken' in set) && Object.values(set).indexOf(tokenPublik) < 0);
  cek('pengaturan yang dibutuhkan tampilan tetap ada', r.ok && 'namaLembaga' in set, Object.keys(set));
  for (const kunci of ['publicToken', 'publicEnabled', 'lg_u_superadmin', 'uf_orang_lain']) {
    const d = {}; d[kunci] = 'x';
    r = await rpc(db, 'apiSaveSettings', [tSuper, d]);
    cek('apiSaveSettings menolak kunci milik sistem: ' + kunci, !r.ok, r.galat || 'diterima');
  }
  r = await rpc(db, 'apiSaveSettings', [tSuper, { namaLembaga: 'Lembaga Karangan' }]); db = r.db;
  cek('menyimpan pengaturan biasa tetap bisa', r.ok && r.hasil.namaLembaga === 'Lembaga Karangan', r.galat);
  cek('hasil apiSaveSettings juga tanpa lg_*', r.ok && !Object.keys(r.hasil).some((k) => /^lg_/.test(k)));

  console.log('\n=== C. IMPOR LEWAT URL TIDAK BOLEH MENJANGKAU JARINGAN INTERNAL ===');
  const DIBLOK = /tidak diizinkan|jaringan internal|hanya alamat https/i;
  for (const u of ['http://example.com/data.xlsx', 'https://127.0.0.1/x.xlsx', 'https://localhost/x.xlsx', 'https://169.254.169.254/latest/meta-data/',
    'https://10.1.2.3/x.xlsx', 'https://192.168.1.1/x.xlsx', 'https://172.20.0.1/x.xlsx', 'https://[::1]/x.xlsx', 'file:///etc/passwd',
    'https://0.0.0.0/x.xlsx', 'https://[::ffff:127.0.0.1]/x.xlsx']) {
    r = await rpc(db, 'apiParseImportUrl', [tLihat, u, 'himpun']);
    cek('ditolak: ' + u, !r.ok && DIBLOK.test(r.galat), r.galat || 'diterima');
  }
  r = await rpc(db, 'apiParseImportUrl', [tLihat, 'https://docs.google.com/spreadsheets/d/abcKarangan123/edit', 'himpun']);
  cek('tautan Google Sheets tidak diblokir oleh penjaga ini', r.ok || !DIBLOK.test(r.galat), r.galat);
  const mesin = baca('api/_engine.js');
  cek('pengalihan (redirect) diperiksa ulang, tidak diikuti buta', /redirect:\s*'manual'/.test(mesin));

  console.log('\n=== D. LOG AKTIVITAS HANYA BISA DIHAPUS SUPERADMIN ===');
  r = await rpc(db, 'apiHapusAudit', [tLog]);
  cek('pemegang izin "hapus log" yang bukan superadmin ditolak', !r.ok && /IZIN/.test(r.galat), r.galat || 'diterima');
  const nLog = (db.sheets.AuditLog || []).length;
  cek('log tidak berkurang', (r.db.sheets.AuditLog || []).length >= nLog);
  r = await rpc(db, 'apiHapusAudit', [tSuper]);
  cek('superadmin tetap bisa membersihkan log', r.ok, r.galat);
  cek('tombol Bersihkan log hanya muncul untuk superadmin', /ME\.role==='superadmin'\)?\s*\?\s*'<button class="btn btn-ghost" onclick="logBersihkan\(\)"/.test(app));

  console.log('\n=== E. VERIFIKASI KWITANSI ===');
  r = await rpc(db, 'apiSavePenghimpunan', [tLihat, { tanggal: '2026-09-15', jenisDana: 'Infak', namaDonatur: 'Budi Karangan', jumlah: 750000, metode: 'Tunai' }]); db = r.db;
  cek('persiapan: setoran karangan tercatat', r.ok, r.galat);
  const th = db.sheets.Penghimpunan, hh = th[0], baris = th[th.length - 1];
  const noKw = baris[hh.indexOf('noKwitansi')], idKw = baris[hh.indexOf('id')];
  r = await rpc(db, 'apiVerifyKwitansi', [noKw]);
  cek('nomor saja: kwitansi tetap dinyatakan sah', r.ok && r.hasil.valid === true, r.hasil);
  cek('nomor saja: NOMINAL tidak dikirim', r.ok && r.hasil.data && !('jumlah' in r.hasil.data) && r.hasil.lengkap === false, r.hasil && r.hasil.data);
  r = await rpc(db, 'apiVerifyKwitansi', [noKw, 'salah12345']);
  cek('kode yang salah: nominal tetap tidak dikirim', r.ok && r.hasil.data && !('jumlah' in r.hasil.data), r.hasil && r.hasil.data);
  r = await rpc(db, 'apiVerifyKwitansi', [noKw, String(idKw).slice(0, 10)]);
  cek('nomor + kode dari QR: nominal dikirim', r.ok && r.hasil.lengkap === true && Number(r.hasil.data.jumlah) === 750000, r.hasil);
  r = await rpc(db, 'apiVerifyKwitansi', [noKw, String(idKw).slice(0, 10).toUpperCase()]);
  cek('kode tidak peka huruf besar-kecil', r.ok && r.hasil.lengkap === true);
  cek('QR kwitansi baru membawa kode', /public\.html\?kwitansi='[^;]*kode=/.test(app));
  const pub = baca('src/public/public.html');
  cek('halaman publik mengirim kode dari alamat', /get\('kode'\)/.test(pub) && /apiVerifyKwitansi',\[kw,\s*kode/.test(pub));
  cek('halaman publik menyembunyikan baris Nominal bila tidak lengkap', /d\.jumlah|lengkap/.test(pub) && /res\.lengkap/.test(pub));

  console.log('\n=== F. HEADER KEAMANAN ===');
  let v = null;
  try { v = JSON.parse(baca('vercel.json')); } catch (e) { v = null; }
  cek('vercel.json masih JSON yang sah', !!v);
  const pertama = v && v.routes && v.routes[0];
  const h = (pertama && pertama.headers) || {};
  cek('rute pertama memasang header untuk semua alamat lalu lanjut', pertama && pertama.src === '/(.*)' && pertama.continue === true, pertama);
  cek('X-Content-Type-Options: nosniff', h['X-Content-Type-Options'] === 'nosniff');
  cek('X-Frame-Options: DENY', h['X-Frame-Options'] === 'DENY');
  cek('frame-ancestors none di CSP', /frame-ancestors 'none'/.test(h['Content-Security-Policy'] || ''));
  cek('HSTS setahun', /max-age=31536000/.test(h['Strict-Transport-Security'] || ''));
  cek('Referrer-Policy', !!h['Referrer-Policy']);
  cek('kamera, mikrofon, dan GPS tetap diizinkan untuk situs sendiri',
    /camera=\(self\)/.test(h['Permissions-Policy'] || '') && /microphone=\(self\)/.test(h['Permissions-Policy'] || '') && /geolocation=\(self\)/.test(h['Permissions-Policy'] || ''),
    h['Permissions-Policy']);
  cek('rute /api dan berkas statis lama tetap ada', v && v.routes.some((x) => x.src === '/api/(.*)') && v.routes.some((x) => x.src === '/(.*)' && x.dest === '/$1'));

  console.log('\n=== G. BERKAS SENSITIF TIDAK IKUT KE REPO PUBLIK ===');
  const gi = baca('.gitignore');
  for (const pola of ['HASIL-*.md', '.data/', 'Claude outputs/', 'potret/']) cek('.gitignore memuat ' + pola, gi.split(/\r?\n/).indexOf(pola) >= 0);
  const dep = baca('deploy.bat');
  cek('deploy.bat memeriksa daftar berkas yang akan di-commit', /git diff --cached --name-only/.test(dep));
  /* Berkas yang sedang dikeluarkan dari Git (git rm --cached) tidak boleh
     ikut dianggap sensitif: mengeluarkannya justru tujuannya. Dulu pengaman
     ini membatalkan langkah perbaikannya sendiri. */
  cek('deploy.bat tidak menghalangi berkas sensitif yang sedang DIKELUARKAN', /git diff --cached --name-only --diff-filter=d/.test(dep));
  cek('deploy.bat membatalkan dan melepas berkas bila ada yang sensitif', /git reset -q/.test(dep) && /HASIL-/.test(dep) && /\\\.env\$/.test(dep));

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: perbaikan keamanan gelombang kedua belum lengkap.\n'); process.exit(1); }
  console.log('\ntest_keamanan_lanjutan.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
