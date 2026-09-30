/* Uji: pemegang izin Pengguna tidak boleh menjadikan dirinya (atau orang lain)
 * superadmin, dan tidak boleh membagikan izin yang ia sendiri tidak punya.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Sebelum perbaikan ini, apiSaveUser menyalin `role` dan `permissions` dari
 * permintaan apa adanya. Pemeriksaannya cuma "punya izin users:edit?". Jadi
 * seorang admin kantor yang diberi hak mengelola akun petugas bisa:
 *   - mengubah perannya sendiri menjadi superadmin,
 *   - mengganti sandi akun superadmin lalu masuk sebagai superadmin,
 *   - mencentang izin apa pun untuk dirinya, termasuk yang tidak pernah
 *     diberikan kepadanya (mis. Pengaturan: hapus).
 * Tombolnya memang ada di layar (pilihan Role berisi 'superadmin' untuk semua
 * yang bisa membuka dialog Edit User), dan karena repositori ini publik, siapa
 * pun bisa membaca bahwa server tidak menolaknya. Tidak ada galat, tidak ada
 * peringatan: yang tersisa hanya satu baris "edit_user" di log.
 *
 * Aturan yang dijaga di sini:
 *   A. Selain superadmin, TIDAK ADA yang boleh membuat, mengangkat, menyunting,
 *      mengganti sandi, menonaktifkan, atau menghapus akun superadmin.
 *   B. Selain superadmin, seseorang hanya boleh MEMBERI izin yang ia sendiri
 *      punya. Mencabut izin tetap boleh (arahnya aman), dan izin lama akun
 *      yang tidak diubah tetap dibiarkan, supaya menyimpan ulang akun tanpa
 *      mengubah apa pun tidak tiba-tiba ditolak.
 *   C. Superadmin aktif terakhir tidak boleh diturunkan atau dinonaktifkan,
 *      karena itu mengunci semua orang dari menu Pengguna dan Pengaturan.
 *   D. Username tidak boleh kembar saat MENYUNTING (dulu hanya diperiksa saat
 *      membuat akun baru).
 *
 *   node tools/test_eskalasi_user.js
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

/* ---------------------------------------------------------------- fixture
   Nama dan angka karangan, bukan data lembaga. */
const IZIN_ADMIN = {
  users: { view: true, create: true, edit: true, delete: true },
  penghimpunan: { view: true, create: true },
};
const AKUN = [
  { id: 'u_super', username: 'superadmin', role: 'superadmin', izin: {} },
  { id: 'u_admin', username: 'admin.kantor', role: 'admin', izin: IZIN_ADMIN },
  { id: 'u_staf', username: 'petugas.a', role: 'staff', izin: { penghimpunan: { view: true } } },
  /* Punya izin yang TIDAK dimiliki admin: pengaturan lihat. */
  { id: 'u_staf2', username: 'petugas.b', role: 'staff',
    izin: { penghimpunan: { view: true }, settings: { view: true } } },
];

function dbBaru(tambahan) {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [['id', 'username', 'passwordHash', 'salt', 'nama', 'role', 'permissions', 'aktif', 'dibuat', 'layanan']];
  s.Sessions = [['token', 'userId', 'expired']];
  const besok = new Date(Date.now() + 864e5).toISOString();
  for (const a of AKUN.concat(tambahan || [])) {
    s.Users.push([a.id, a.username, 'hash-lama', 'garam', 'Nama ' + a.id, a.role,
      JSON.stringify(a.izin), a.aktif === false ? 'false' : 'true', new Date().toISOString(), '']);
    s.Sessions.push(['tok_' + a.id, a.id, besok]);
  }
  return { sheets: s, props: {} };
}

/* Menjalankan satu RPC atas basis data segar (atau yang diberikan) dan
   mengembalikan hasil, galat, serta basis data sesudahnya. */
async function jalan(fn, args, db) {
  db = db || dbBaru();
  try {
    const out = await engine.runRPC(db, fn, args, {});
    return { ok: true, db: out.db };
  } catch (e) {
    return { ok: false, galat: e.message, db };
  }
}
function barisUser(db, id) {
  const t = db.sheets.Users, h = t[0];
  for (let i = 1; i < t.length; i++) {
    if (t[i][h.indexOf('id')] === id) {
      const o = {}; h.forEach((k, j) => { o[k] = t[i][j]; });
      o.izin = JSON.parse(o.permissions || '{}');
      return o;
    }
  }
  return null;
}
const ditolak = (r) => !r.ok && /^IZIN:/.test(r.galat || '');
const SANDI = 'SandiBaru123';

(async () => {
  console.log('\n=== A. SELAIN SUPERADMIN TIDAK BISA MENYENTUH AKUN SUPERADMIN ===');

  let r = await jalan('apiSaveUser', ['tok_u_admin', { username: 'penyusup', nama: 'Penyusup', role: 'superadmin', password: SANDI, permissions: {} }]);
  cek('admin tidak bisa membuat akun superadmin baru', ditolak(r), r.galat || 'diterima');

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_admin', nama: 'Admin', username: 'admin.kantor', role: 'superadmin', aktif: true, permissions: IZIN_ADMIN }]);
  cek('admin tidak bisa mengangkat dirinya sendiri jadi superadmin', ditolak(r), r.galat || 'diterima');
  cek('perannya di basis data tetap admin', barisUser(r.db, 'u_admin').role === 'admin', barisUser(r.db, 'u_admin').role);

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf', nama: 'Staf', username: 'petugas.a', role: 'superadmin', aktif: true, permissions: {} }]);
  cek('admin tidak bisa mengangkat petugas lain jadi superadmin', ditolak(r), r.galat || 'diterima');

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_super', nama: 'Super', username: 'superadmin', role: 'superadmin', aktif: true, permissions: {}, password: SANDI }]);
  cek('admin tidak bisa mengganti sandi superadmin', ditolak(r), r.galat || 'diterima');
  cek('hash sandi superadmin tidak berubah', barisUser(r.db, 'u_super').passwordHash === 'hash-lama');

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_super', nama: 'Super', username: 'superadmin', role: 'staff', aktif: false, permissions: {} }]);
  cek('admin tidak bisa menurunkan atau menonaktifkan superadmin', ditolak(r), r.galat || 'diterima');
  cek('superadmin tetap superadmin dan aktif',
    barisUser(r.db, 'u_super').role === 'superadmin' && barisUser(r.db, 'u_super').aktif === 'true');

  /* Dua superadmin, supaya penjaga "superadmin terakhir" yang lama tidak ikut
     menolak dan uji ini benar-benar menguji penjaga yang baru. */
  const duaSuper = dbBaru([{ id: 'u_super2', username: 'superadmin2', role: 'superadmin', izin: {} }]);
  r = await jalan('apiDeleteUser', ['tok_u_admin', 'u_super2'], duaSuper);
  cek('admin tidak bisa menghapus superadmin (walau ada dua)', ditolak(r), r.galat || 'diterima');
  cek('akun superadmin kedua masih ada', !!barisUser(r.db, 'u_super2'));

  console.log('\n=== B. HANYA BOLEH MEMBERI IZIN YANG DIMILIKI SENDIRI ===');

  const izinLebih = JSON.parse(JSON.stringify(IZIN_ADMIN));
  izinLebih.settings = { view: true, edit: true, delete: true };
  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_admin', nama: 'Admin', username: 'admin.kantor', role: 'admin', aktif: true, permissions: izinLebih }]);
  cek('admin tidak bisa mencentang izin Pengaturan untuk dirinya', ditolak(r), r.galat || 'diterima');
  cek('izinnya di basis data tidak bertambah', !barisUser(r.db, 'u_admin').izin.settings);

  r = await jalan('apiSaveUser', ['tok_u_admin', { username: 'petugas.c', nama: 'Petugas C', role: 'staff', password: SANDI, permissions: { laporan: { view: true } } }]);
  cek('admin tidak bisa membuat akun dengan izin Laporan yang ia sendiri tidak punya', ditolak(r), r.galat || 'diterima');

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf', nama: 'Staf', username: 'petugas.a', role: 'staff', aktif: true, permissions: { penghimpunan: { view: true }, log: { view: true, delete: true } } }]);
  cek('admin tidak bisa memberi izin hapus log ke petugas lain', ditolak(r), r.galat || 'diterima');

  console.log('\n=== C. PEKERJAAN SAH ADMIN TETAP JALAN ===');

  r = await jalan('apiSaveUser', ['tok_u_admin', { username: 'petugas.d', nama: 'Petugas D', role: 'staff', password: SANDI, permissions: { penghimpunan: { view: true, create: true } } }]);
  cek('admin tetap bisa membuat petugas dengan izin yang ia punya', r.ok, r.galat);

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf', nama: 'Staf Ganti Nama', username: 'petugas.a', role: 'staff', aktif: true, permissions: { penghimpunan: { view: true } }, password: SANDI }]);
  cek('admin tetap bisa mengganti nama dan sandi petugas', r.ok, r.galat);
  cek('sandinya memang berganti', r.ok && barisUser(r.db, 'u_staf').passwordHash !== 'hash-lama');

  /* Petugas B sudah punya izin Pengaturan dari superadmin. Admin yang tidak
     punya izin itu menyimpan ulang akunnya tanpa mengubah centangnya: harus
     diterima, dan izin lamanya harus tetap utuh. Kalau tidak, admin kantor
     tidak bisa lagi sekadar membetulkan salah ketik nama petugas. */
  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf2', nama: 'Petugas B Baru', username: 'petugas.b', role: 'staff', aktif: true,
    permissions: { penghimpunan: { view: true }, settings: { view: true } } }]);
  cek('menyimpan ulang akun yang izinnya lebih luas, tanpa mengubah centang, tetap diterima', r.ok, r.galat);
  cek('izin Pengaturan lamanya tetap utuh', r.ok && barisUser(r.db, 'u_staf2').izin.settings && barisUser(r.db, 'u_staf2').izin.settings.view === true);

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf2', nama: 'Petugas B', username: 'petugas.b', role: 'staff', aktif: true,
    permissions: { penghimpunan: { view: true }, settings: { view: false } } }]);
  cek('admin tetap boleh MENCABUT izin yang ia sendiri tidak punya', r.ok, r.galat);

  /* Akun lama dari sebelum izin Dashboard dipecah: hanya punya kunci
     dashboard. Dialog Edit User mencentang saldo dan saldokll untuknya lewat
     jembatan MODUL_ASAL, jadi keduanya ikut terkirim sebagai true. Itu bukan
     pemberian izin baru dan tidak boleh ditolak. */
  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_lama', nama: 'Amil Lama', username: 'amil.lama', role: 'staff', aktif: true,
    permissions: { dashboard: { view: true }, saldo: { view: true }, saldokll: { view: true } } }],
    dbBaru([{ id: 'u_lama', username: 'amil.lama', role: 'staff', izin: { dashboard: { view: true } } }]));
  cek('akun lama (saldo menumpang izin dashboard) tetap bisa disimpan ulang', r.ok, r.galat);

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf', nama: 'Staf', username: 'petugas.a', role: 'staff', aktif: true, permissions: { penghimpunan: { view: 'ya' }, settings: { edit: 1 } } }]);
  cek('nilai izin bukan boolean ("ya", 1) tidak bisa dipakai untuk menyelinap', ditolak(r), r.galat || 'diterima');

  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf', nama: 'Staf', username: 'petugas.a', role: 'staff', aktif: false, permissions: { penghimpunan: { view: true } } }]);
  cek('admin tetap bisa menonaktifkan petugas', r.ok && barisUser(r.db, 'u_staf').aktif === 'false', r.galat);

  console.log('\n=== D. SUPERADMIN TETAP BOLEH SEMUANYA, KECUALI MENGHILANGKAN SUPERADMIN TERAKHIR ===');

  r = await jalan('apiSaveUser', ['tok_u_super', { id: 'u_admin', nama: 'Admin', username: 'admin.kantor', role: 'superadmin', aktif: true, permissions: {} }]);
  cek('superadmin boleh mengangkat admin jadi superadmin', r.ok && barisUser(r.db, 'u_admin').role === 'superadmin', r.galat);

  r = await jalan('apiSaveUser', ['tok_u_super', { id: 'u_staf', nama: 'Staf', username: 'petugas.a', role: 'staff', aktif: true, permissions: { settings: { view: true, edit: true } } }]);
  cek('superadmin boleh memberi izin apa pun', r.ok, r.galat);

  r = await jalan('apiSaveUser', ['tok_u_super', { id: 'u_super', nama: 'Super', username: 'superadmin', role: 'staff', aktif: true, permissions: {} }]);
  cek('superadmin terakhir tidak bisa menurunkan dirinya sendiri', !r.ok, r.galat || 'diterima');
  cek('perannya tetap superadmin', barisUser(r.db, 'u_super').role === 'superadmin');

  r = await jalan('apiSaveUser', ['tok_u_super', { id: 'u_super', nama: 'Super', username: 'superadmin', role: 'superadmin', aktif: false, permissions: {} }]);
  cek('superadmin terakhir tidak bisa dinonaktifkan', !r.ok, r.galat || 'diterima');

  r = await jalan('apiSaveUser', ['tok_u_super', { id: 'u_super', nama: 'Super', username: 'superadmin', role: 'staff', aktif: true, permissions: {} }],
    dbBaru([{ id: 'u_super2', username: 'superadmin2', role: 'superadmin', izin: {} }]));
  cek('kalau ada superadmin lain yang aktif, penurunan diterima', r.ok, r.galat);

  console.log('\n=== E. USERNAME TIDAK BOLEH KEMBAR SAAT MENYUNTING ===');
  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf', nama: 'Staf', username: 'Petugas.B', role: 'staff', aktif: true, permissions: { penghimpunan: { view: true } } }]);
  cek('mengganti username menjadi milik akun lain ditolak', !r.ok && /dipakai/i.test(r.galat || ''), r.galat || 'diterima');
  r = await jalan('apiSaveUser', ['tok_u_admin', { id: 'u_staf', nama: 'Staf', username: 'PETUGAS.A', role: 'staff', aktif: true, permissions: { penghimpunan: { view: true } } }]);
  cek('mengubah huruf besar-kecil username sendiri tetap boleh', r.ok, r.galat);

  console.log('\n=== F. TAMPILAN TIDAK MENAWARKAN PILIHAN YANG PASTI DITOLAK ===');
  const fs = require('fs');
  const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
  cek('pilihan Role "superadmin" hanya ditawarkan kepada superadmin',
    !/selOpt\('u_role',\['staff','admin','superadmin'\]/.test(app) && /u_role/.test(app));

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: pengelolaan akun masih bisa dipakai untuk mengambil alih superadmin.\n'); process.exit(1); }
  console.log('\ntest_eskalasi_user.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
