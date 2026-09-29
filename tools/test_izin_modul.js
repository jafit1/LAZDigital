/* Uji pemecahan izin Dashboard menjadi tiga: Dashboard, Saldo Kas & Bank,
 * dan Saldo KLL & ULL.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Memecah satu izin jadi tiga terdengar sepele, tetapi ia menyentuh data yang
 * SUDAH TERSIMPAN. Izin tiap akun tersimpan sebagai objek JSON berisi kunci
 * per modul. Akun yang dibuat sebelum pembaruan ini tidak punya kunci 'saldo'
 * maupun 'saldokll' sama sekali — bukan bernilai false, melainkan tidak ada.
 * Kalau pemeriksaannya cuma membaca kunci, seluruh akun lama kehilangan dua
 * menu pada hari pembaruan naik, tanpa ada seorang pun yang mencabut haknya.
 * Tidak ada galat, tidak ada catatan; yang ada cuma amil yang menelepon
 * bertanya kenapa menu saldonya hilang.
 *
 * Jembatannya (MODUL_ASAL) karena itu harus memenuhi dua syarat yang saling
 * bertolak belakang, dan keduanya diuji di sini:
 *
 *   1. Akun lama tidak boleh kehilangan apa pun.
 *   2. Jembatan itu TIDAK BOLEH menghidupkan kembali izin yang sudah dicabut.
 *      Begitu superadmin menyimpan izin sebuah akun, kunci barunya tertulis
 *      apa adanya — termasuk saat tertulis false. Jembatan yang lalai di sini
 *      akan mengembalikan akses yang baru saja sengaja dicabut, dan itu jauh
 *      lebih berbahaya daripada menu yang hilang.
 *
 *   node tools/test_izin_modul.js
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

/* ---------------------------------------------------------------- fixture */
const AKUN = [
  /* Akun lama: izinnya dibuat sebelum pemecahan, jadi hanya punya kunci
     'dashboard'. Inilah bentuk yang ada di basis data sungguhan hari ini. */
  { id: 'u_lama', nama: 'Amil Lama', peran: 'staff', izin: { dashboard: { view: true } } },
  /* Akun yang izinnya sudah pernah disimpan ulang sesudah pemecahan: ketiga
     kuncinya tertulis, dan saldo kas & bank sengaja DICABUT. */
  { id: 'u_baru', nama: 'Amil Baru', peran: 'staff',
    izin: { dashboard: { view: true }, saldo: { view: false }, saldokll: { view: true } } },
  /* Akun yang memang tidak pernah boleh membuka dashboard. */
  { id: 'u_tanpa', nama: 'Amil Tanpa Dashboard', peran: 'staff', izin: { penghimpunan: { view: true } } },
  { id: 'u_super', nama: 'Superadmin', peran: 'superadmin', izin: {} },
];

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [['id', 'username', 'nama', 'password', 'role', 'permissions', 'aktif', 'layanan', 'dibuat']];
  s.Sessions = [['token', 'userId', 'dibuat', 'expiredAt', 'ip', 'ua']];
  const besok = new Date(Date.now() + 864e5).toISOString();
  for (const a of AKUN) {
    s.Users.push([a.id, a.id, a.nama, 'x', a.peran, JSON.stringify(a.izin), 'true', '', new Date().toISOString()]);
    s.Sessions.push(['tok_' + a.id, a.id, new Date().toISOString(), besok, '', '']);
  }
  return { sheets: s, props: {} };
}

const boleh = (akun, modul, aksi) => {
  try { engine.cekIzin(dbBaru(), 'tok_' + akun, modul, aksi || 'view', {}); return true; }
  catch (e) { if (/^IZIN:/.test(e.message)) return false; throw e; }
};

(async () => {
  console.log('\n=== A. TIGA IZIN TERPISAH MEMANG ADA ===');
  const meta = (await engine.runRPC(dbBaru(), 'apiGetPermissionMeta', ['tok_u_super'], {})).result;
  cek('modul dashboard masih ada', meta.modules.indexOf('dashboard') >= 0, meta.modules);
  cek('modul saldo ditambahkan', meta.modules.indexOf('saldo') >= 0, meta.modules);
  cek('modul saldokll ditambahkan', meta.modules.indexOf('saldokll') >= 0, meta.modules);
  cek('ketiganya berurutan di paling atas daftar',
    meta.modules.slice(0, 3).join(',') === 'dashboard,saldo,saldokll', meta.modules.slice(0, 5));
  cek('namanya tidak lagi menggabungkan dua hal',
    meta.label.dashboard === 'Dashboard' && !/Saldo/.test(meta.label.dashboard), meta.label.dashboard);
  cek('saldo kas & bank punya namanya sendiri', meta.label.saldo === 'Saldo Kas & Bank', meta.label.saldo);
  cek('saldo KLL/ULL punya namanya sendiri', meta.label.saldokll === 'Saldo KLL & ULL', meta.label.saldokll);
  cek('tiap modul punya keterangannya',
    !!(meta.ket.dashboard && meta.ket.saldo && meta.ket.saldokll));

  console.log('\n=== B. HANYA "LIHAT" YANG DITAWARKAN ===');
  /* Ketiganya cuma halaman baca. Menawarkan kotak centang Tambah/Ubah/Hapus
     yang tidak dibaca kode mana pun membuat orang mengira ia sedang mengatur
     sesuatu, lalu heran kenapa tidak ada bedanya. */
  for (const m of ['dashboard', 'saldo', 'saldokll']) {
    cek('modul ' + m + ' hanya menawarkan aksi lihat',
      meta.aksi[m] && meta.aksi[m].join(',') === 'view', meta.aksi[m]);
  }

  console.log('\n=== C. AKUN LAMA TIDAK KEHILANGAN APA PUN ===');
  cek('akun lama tetap boleh membuka dashboard', boleh('u_lama', 'dashboard'));
  cek('akun lama tetap boleh membuka Saldo Kas & Bank', boleh('u_lama', 'saldo'));
  cek('akun lama tetap boleh membuka Saldo KLL & ULL', boleh('u_lama', 'saldokll'));

  console.log('\n=== D. JEMBATAN TIDAK MENGHIDUPKAN IZIN YANG DICABUT ===');
  cek('izin saldo yang tertulis false tetap DITOLAK, walau dashboard-nya true',
    !boleh('u_baru', 'saldo'));
  cek('izin saldokll yang tertulis true tetap diterima', boleh('u_baru', 'saldokll'));
  cek('dashboard-nya sendiri tetap boleh', boleh('u_baru', 'dashboard'));

  console.log('\n=== E. YANG MEMANG TIDAK PUNYA IZIN TETAP DITOLAK ===');
  cek('tanpa izin dashboard, saldo ikut ditolak', !boleh('u_tanpa', 'saldo'));
  cek('tanpa izin dashboard, saldo KLL ikut ditolak', !boleh('u_tanpa', 'saldokll'));
  cek('dashboard-nya sendiri juga ditolak', !boleh('u_tanpa', 'dashboard'));
  cek('izin modul lain tidak ikut terbuka', !boleh('u_tanpa', 'laporan'));
  cek('yang memang dimilikinya tetap terbuka', boleh('u_tanpa', 'penghimpunan'));

  console.log('\n=== F. SUPERADMIN TETAP BOLEH SEMUA ===');
  for (const m of ['dashboard', 'saldo', 'saldokll']) {
    cek('superadmin boleh ' + m, boleh('u_super', m));
  }

  console.log('\n=== G. TAMPILAN MEMAKAI JEMBATAN YANG SAMA ===');
  /* canDo() di app.js adalah kembaran can() di mesin. Kalau salah satunya
     punya jembatan dan yang lain tidak, menunya hilang dari bilah kiri
     padahal servernya masih mengizinkan — atau sebaliknya, menunya ada tetapi
     diklik lalu ditolak. Dua-duanya membingungkan, jadi keduanya diperiksa. */
  const fs = require('fs');
  const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
  cek('app.js punya tabel MODUL_ASAL', /MODUL_ASAL\s*=\s*\{[^}]*saldo\s*:\s*'dashboard'/.test(app));
  cek('app.js memetakan saldokll juga', /MODUL_ASAL\s*=\s*\{[^}]*saldokll\s*:\s*'dashboard'/.test(app));
  cek('canDo memakai tabel itu', /function canDo[\s\S]{0,400}MODUL_ASAL\[mod\]/.test(app));
  cek('menu Saldo Kas & Bank memakai izin saldo',
    /id:'saldo'[^}]*mod:'saldo'/.test(app), (app.match(/id:'saldo'[^}]*/) || [''])[0]);
  cek('menu Saldo KLL & ULL memakai izin saldokll',
    /id:'kll'[^}]*mod:'saldokll'/.test(app), (app.match(/id:'kll'[^}]*/) || [''])[0]);
  cek('tidak ada lagi menu yang menumpang izin dashboard',
    !/id:'(saldo|kll)'[^}]*mod:'dashboard'/.test(app));

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: pemecahan izin belum benar.\n'); process.exit(1); }
  console.log('\ntest_izin_modul.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
