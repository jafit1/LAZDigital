/* Uji: pemulihan cadangan (api/backup.js, aksi "pulihkan") tidak boleh
 * menyentuh apa pun sebelum izinnya terbukti.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Sebelum perbaikan ini, jalankanPulihkan() memuat SELURUH basis data lalu
 * menyimpan salinan "sebelum-pulih" (titik batal) LEBIH DULU, baru kemudian
 * menyerahkan pemeriksaan superadmin ke engine. Pemeriksaan satu-satunya di
 * depannya hanya "token tidak kosong". Jadi siapa pun tanpa login, cukup
 * mengirim token berisi teks apa saja, bisa:
 *   - MENIMPA titik batal "sebelum-pulih". Kalau superadmin baru saja
 *     memulihkan cadangan yang keliru, jalan pulangnya hilang;
 *   - memaksa server memuat seluruh buku besar pada setiap permintaan, dan
 *     itu gampang dipakai untuk membebani server.
 *
 * Aturan yang dijaga di sini:
 *   A. Token palsu, akun bukan superadmin, atau konfirmasi yang salah
 *      ditolak SEBELUM titik batal disentuh.
 *   B. Pemulihan sungguhan oleh superadmin tetap berjalan, dan titik batalnya
 *      tetap dibuat seperti biasa.
 *   C. Cron harian tetap berjalan dengan CRON_SECRET yang benar, dan menolak
 *      yang salah.
 *
 *   node tools/test_pulihkan_aman.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const AKAR = path.join(__dirname, '..');

/* Mode berkas lokal di folder sementara: tanpa PostgreSQL, tanpa Redis. */
const KERJA = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-pulih-'));
process.chdir(KERJA);
for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'GDRIVE_REFRESH_TOKEN', 'GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_FOLDER_ID']) delete process.env[k];
process.env.CRON_SECRET = 'rahasia-cron-uji-7c1e';
process.env.SETUP_ADMIN_PASSWORD = 'Contoh1234';

const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const backup = require(path.join(AKAR, 'api', 'backup.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200)); }
};
function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.tubuh = o; r.writableEnded = true; return r; };
  r.end = (s) => { try { r.tubuh = JSON.parse(s); } catch (e) { r.tubuh = s; } r.writableEnded = true; return r; };
  return r;
}
async function panggil(badan, headers) {
  const req = { method: 'POST', url: '/api/backup', headers: Object.assign({ host: 'contoh.test' }, headers || {}), body: badan };
  const res = balasan();
  await backup(req, res);
  return res;
}
const DB_LOKAL = path.join(KERJA, 'data', 'laz-db-local.json');
const TITIK_BATAL = path.join(KERJA, 'data', 'cadangan', 'sebelum-pulih.json');
const bacaDB = () => JSON.parse(fs.readFileSync(DB_LOKAL, 'utf8'));
const tulisDB = (db) => { fs.mkdirSync(path.dirname(DB_LOKAL), { recursive: true }); fs.writeFileSync(DB_LOKAL, JSON.stringify(db)); };

(async () => {
  /* Basis data karangan: superadmin + satu admin berizin Pengaturan penuh
     (bukan superadmin), plus satu setoran. */
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  let db = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  let out = await engine.runRPC(db, 'login', ['superadmin', 'Contoh1234'], {}); db = out.db;
  const tokSuper = out.result.token;
  db = (await engine.runRPC(db, 'apiSaveUser', [tokSuper, { username: 'admin.kantor', nama: 'Admin Kantor', role: 'admin', password: 'Contoh1234',
    permissions: { settings: { view: true, create: true, edit: true, delete: true } } }], {})).db;
  out = await engine.runRPC(db, 'login', ['admin.kantor', 'Contoh1234'], {}); db = out.db;
  const tokAdmin = out.result.token;
  db = (await engine.runRPC(db, 'apiSavePenghimpunan', [tokSuper, { tanggal: '2026-09-01', jenisDana: 'Infak', namaDonatur: 'Donatur Karangan', jumlah: 100000, metode: 'Tunai' }], {})).db;
  tulisDB(db);

  /* Titik batal yang sudah ada, dengan isi penanda. Kalau isinya berubah,
     berarti ada yang menimpanya. */
  fs.mkdirSync(path.dirname(TITIK_BATAL), { recursive: true });
  const PENANDA = JSON.stringify({ penanda: 'titik-batal-asli' });
  fs.writeFileSync(TITIK_BATAL, PENANDA);
  const titikUtuh = () => fs.existsSync(TITIK_BATAL) && fs.readFileSync(TITIK_BATAL, 'utf8') === PENANDA;

  console.log('\n=== A. DITOLAK SEBELUM TITIK BATAL DISENTUH ===');
  let r = await panggil({ aksi: 'pulihkan', token: 'teks-sembarang', isi: 'apa saja', konfirmasi: 'PULIHKAN' });
  cek('token palsu ditolak', r.tubuh && r.tubuh.__error && /AUTH|IZIN|berwenang/i.test(r.tubuh.__error), r.tubuh);
  cek('titik batal "sebelum-pulih" TIDAK tertimpa oleh token palsu', titikUtuh());

  r = await panggil({ aksi: 'pulihkan', token: tokAdmin, nama: 'sebelum-pulih', konfirmasi: 'PULIHKAN' });
  cek('admin berizin Pengaturan penuh (bukan superadmin) ditolak', r.tubuh && /IZIN|superadmin/i.test(r.tubuh.__error || ''), r.tubuh);
  cek('titik batal tidak tertimpa oleh admin', titikUtuh());

  r = await panggil({ aksi: 'pulihkan', token: tokSuper, isi: '{}', konfirmasi: 'salah' });
  cek('superadmin tanpa mengetik PULIHKAN ditolak', r.tubuh && /PULIHKAN/.test(r.tubuh.__error || ''), r.tubuh);
  cek('titik batal tidak tertimpa oleh konfirmasi yang salah', titikUtuh());

  r = await panggil({ aksi: 'ambil', token: 'teks-sembarang', nama: 'sebelum-pulih' });
  cek('mengambil isi cadangan dengan token palsu ditolak', r.tubuh && r.tubuh.__error && !r.tubuh.result, r.tubuh);
  r = await panggil({ aksi: 'daftar', token: 'teks-sembarang' });
  cek('melihat daftar cadangan dengan token palsu ditolak', r.tubuh && r.tubuh.__error && !r.tubuh.result, r.tubuh);

  console.log('\n=== B. PEMULIHAN SUNGGUHAN OLEH SUPERADMIN TETAP JALAN ===');
  r = await panggil({ aksi: 'cadangkan', token: tokSuper });
  const namaCadangan = r.tubuh && r.tubuh.result && r.tubuh.result.nama;
  cek('superadmin membuat cadangan manual', !!namaCadangan, r.tubuh);
  /* Sesudah dicadangkan, satu setoran lagi masuk. Pemulihan harus
     membuangnya, dan titik batal harus memuatnya. */
  db = bacaDB();
  db = (await engine.runRPC(db, 'apiSavePenghimpunan', [tokSuper, { tanggal: '2026-09-02', jenisDana: 'Zakat', namaDonatur: 'Donatur Kedua', jumlah: 250000, metode: 'Tunai' }], {})).db;
  tulisDB(db);
  const nSebelum = bacaDB().sheets.Penghimpunan.length;
  r = await panggil({ aksi: 'pulihkan', token: tokSuper, nama: namaCadangan, konfirmasi: 'PULIHKAN' });
  cek('pemulihan oleh superadmin berhasil', r.tubuh && r.tubuh.result && !r.tubuh.__error, r.tubuh);
  const nSesudah = bacaDB().sheets.Penghimpunan.length;
  cek('buku besar kembali ke isi cadangan (setoran kedua hilang)', nSesudah === nSebelum - 1, [nSebelum, nSesudah]);
  const titikBaru = fs.existsSync(TITIK_BATAL) ? fs.readFileSync(TITIK_BATAL, 'utf8') : '';
  cek('titik batal diperbarui dan memuat setoran kedua', !titikUtuh() && titikBaru.indexOf('Donatur Kedua') >= 0);

  console.log('\n=== C. CRON HARIAN ===');
  r = await panggil({}, { authorization: 'Bearer rahasia-cron-uji-7c1e' });
  cek('cron dengan CRON_SECRET benar membuat cadangan harian', r.tubuh && r.tubuh.result && /^harian-/.test(r.tubuh.result.nama || ''), r.tubuh);
  r = await panggil({}, { authorization: 'Bearer rahasia-cron-uji-7c1f' });
  cek('cron dengan rahasia yang salah ditolak', r.statusCode === 401 || (r.tubuh && r.tubuh.__error), [r.statusCode, r.tubuh]);
  const kode = fs.readFileSync(path.join(AKAR, 'api', 'backup.js'), 'utf8');
  cek('rahasia cron dibandingkan dengan timingSafeEqual', /timingSafeEqual/.test(kode));

  process.chdir(AKAR);
  try { fs.rmSync(KERJA, { recursive: true, force: true }); } catch (e) { console.log('  (catatan: folder sementara tidak terhapus: ' + e.code + ')'); }
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: pemulihan cadangan masih bisa disentuh tanpa izin.\n'); process.exit(1); }
  console.log('\ntest_pulihkan_aman.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
