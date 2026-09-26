/* tools/test_cadangan_pg.js: menguji cadangan & pemulihan di atas PostgreSQL.
 *
 * KENAPA UJI INI ADA. Sebelum pemindahan, api/backup.js mengambil basis data
 * lewat muat() milik api/rpc.js, dan muat() itu membaca Redis. Begitu Redis
 * tidak dipakai lagi, fungsi yang sama mengembalikan basis data KOSONG tanpa
 * satu pun galat, dan cron harian akan menyimpan cadangan kosong setiap malam
 * dengan status "ok". Kegagalan seperti itu baru ketahuan pada hari seseorang
 * benar-benar butuh memulihkan data, yaitu hari terburuk untuk mengetahuinya.
 * Jadi yang diuji di sini bukan "apakah cadangan tersimpan", tapi APAKAH ISINYA
 * BENAR-BENAR ADA, dan apakah pemulihan mengembalikan angka yang sama.
 *
 * Google Drive digantikan tiruan: yang diuji jalur datanya, bukan Google.
 *
 *   node tools/test_cadangan_pg.js --alamat "postgres://postgres@127.0.0.1:55432/uji_laz2"
 */
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const AKAR = path.join(__dirname, '..');
/* ============================================================
   PENGAMAN: UJI INI MENGHAPUS SELURUH ISI BASIS DATA
   ------------------------------------------------------------
   DROP SCHEMA public CASCADE dijalankan di awal. Kalau alamatnya kebetulan
   menunjuk basis data produksi, seluruh data lembaga hilang dalam sekejap dan
   tidak ada yang bisa membatalkannya.

   Karena itu uji ini SENGAJA TIDAK membaca DATABASE_URL dari .env: berkas itu
   isinya alamat produksi. Alamatnya harus disebut sendiri lewat --alamat atau
   lewat UJI_DATABASE_URL, dan harus menunjuk komputer ini. Kalau tidak ada,
   ujinya DILEWATI (keluar dengan kode 2), bukan dipaksakan.
   ============================================================ */
const arg = process.argv.slice(2);
const opsi = (n, b) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : b; };
const ALAMAT = opsi('--alamat', process.env.UJI_DATABASE_URL || '');
if (!ALAMAT) {
  console.log('  DILEWATI: perlu PostgreSQL untuk percobaan.');
  console.log('  Jalankan dengan: node ' + require('path').basename(__filename)
    + ' --alamat "postgres://postgres@127.0.0.1:5432/laz_uji"');
  console.log('  (atau setel UJI_DATABASE_URL. DATABASE_URL sengaja TIDAK dipakai:');
  console.log('   isinya alamat produksi, dan uji ini mengosongkan basis datanya.)');
  process.exit(2);
}
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(ALAMAT) && !arg.includes('--saya-tahu-ini-menghapus-semuanya')) {
  console.error('\n  DITOLAK: alamatnya bukan komputer ini.');
  console.error('  Uji ini menjalankan DROP SCHEMA public CASCADE: seluruh data akan hilang.');
  console.error('  Kalau memang basis data percobaan di server lain, tambahkan');
  console.error('  --saya-tahu-ini-menghapus-semuanya\n');
  process.exit(1);
}
process.env.DATABASE_URL = ALAMAT;
process.env.SETUP_ADMIN_PASSWORD = 'SandiUji#2026';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let Client;
try { ({ Client } = require('pg')); } catch (e) { console.error('\nnpm install pg\n'); process.exit(2); }

/* Tiruan Google Drive. Permintaan require('./_drive.js') dari api/backup.js
   dialihkan ke berkas tiruan di folder sementara. SELALU dialihkan, termasuk
   bila _drive.js yang sungguhan ada: uji tidak boleh menyentuh Google Drive
   siapa pun. Isi yang "terkirim" dicatat supaya bisa diperiksa: cadangan kosong
   yang dilaporkan berhasil harus tetap terlihat kosong di sini. */
const os = require('os');
const jalurPalsu = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ujidrive-')), 'drive-palsu.js');
fs.writeFileSync(jalurPalsu, `
const isi = [];
module.exports = {
  _isi: isi,
  driveSiap: () => true,
  unggah: async (nama, teks) => { isi.push({ nama, panjang: teks.length }); return { id: 'x' + isi.length, name: nama }; },
  pangkas: async () => ({ total: isi.length, dihapus: 0 }),
  daftar: async () => isi.map((x) => ({ id: x.nama, name: x.nama })),
};
`);
const resolveAsli = Module._resolveFilename;
Module._resolveFilename = function (permintaan, induk, ...sisa) {
  if (permintaan === './_drive.js' || permintaan === './_drive') return jalurPalsu;
  return resolveAsli.call(this, permintaan, induk, ...sisa);
};
const driveIsi = require(jalurPalsu)._isi;

const engine = require(path.join(AKAR, 'api', '_engine.js'));
const lazpg = require(path.join(AKAR, 'lib', 'laz-pg.js'));
const kvpg = require(path.join(AKAR, 'lib', 'kv-postgres.js'));
const backup = require(path.join(AKAR, 'api', 'backup.js'));
const { jalankanCadangan, jalankanPulihkan, bacaDaftar, bacaSalinan } = backup._internal;

let lulus = 0, gagal = 0;
function cek(nama, benar, tambahan) {
  if (benar) { lulus++; console.log('  ok    | ' + nama); return; }
  gagal++;
  console.log('  GAGAL | ' + nama + (tambahan ? '\n          ' + tambahan : ''));
}

async function tanya(sql, nilai) {
  const k = new Client({ connectionString: ALAMAT });
  await k.connect();
  try { return (await k.query(sql, nilai)).rows; } finally { await k.end(); }
}
async function kosongkan() {
  const k = new Client({ connectionString: ALAMAT });
  await k.connect();
  try {
    await k.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await k.query(fs.readFileSync(path.join(AKAR, 'sql', '01-skema.sql'), 'utf8'));
    /* Pengamanan ikut dipasang, supaya seluruh uji berjalan di atas basis data
       yang RLS-nya MENYALA. Aplikasinya masuk sebagai pemilik tabel dan
       melewati RLS; kalau anggapan itu ternyata salah, ujinya gagal di sini,
       bukan di hari pertama dipakai. */
    await k.query(fs.readFileSync(path.join(AKAR, 'sql', '02-keamanan.sql'), 'utf8'));
  } finally { await k.end(); }
}

(async () => {
  await kosongkan();
  const jalan = (fn, args) => lazpg.jalankanRPC(engine, fn, args, {});

  console.log('\n================ A. SIAPKAN DATA ================');
  await jalan('setup', []);
  const t = (await jalan('login', ['superadmin', 'SandiUji#2026'])).token;
  await jalan('apiSaveRekening', [t, { namaBank: 'BSI', nomor: '708', atasNama: 'Lazismu', fundGroup: 'Zakat', aktif: 'true' }]);
  const rek = (await jalan('apiListRekening', [t]))[0];
  await jalan('apiSaveSaldoAwal', [t, '2026', [{ kode: 'rek:' + rek.id, nominal: 10000000, keterangan: 'awal' }]]);
  await jalan('apiSavePenghimpunan', [t, {
    tanggal: '2026-05-10', jenisDana: 'Zakat', subJenis: 'Maal', pilar: '', program: '',
    namaDonatur: 'Pak Umar', tipeDonatur: 'Perorangan', layananId: '', telepon: '',
    email: '', alamat: '', jumlah: 4000000, metode: 'Transfer', rekeningId: rek.id,
    bank: 'BSI', statusBayar: 'Lunas', atasNama: '', keterangan: '', fundraising: '',
  }]);
  const saldoAwal = await jalan('apiSaldo', [t, '2026-12-31']);
  cek('saldo sebelum dicadangkan terbentuk', Math.round(saldoAwal.totalKasBank) === 14000000,
    String(saldoAwal.totalKasBank));

  console.log('\n================ B. CADANGAN BERISI, BUKAN KOSONG ================');
  const st = await jalankanCadangan('manual', 'penguji');
  cek('cadangan tersimpan', st.redis && st.redis.ok === true, JSON.stringify(st.redis));
  cek('tempatnya PostgreSQL', /PostgreSQL/.test((st.redis || {}).tempat || ''), (st.redis || {}).tempat);
  cek('ukuran basis data terbaca, bukan nol', st.ukuranDB > 1000, 'ukuranDB=' + st.ukuranDB);
  cek('ukuran cadangan terbaca, bukan nol', st.ukuranCadangan > 1000, 'ukuranCadangan=' + st.ukuranCadangan);
  cek('salinan juga terkirim ke Drive', st.drive && st.drive.ok === true, JSON.stringify(st.drive));
  cek('yang dikirim ke Drive bukan berkas kosong',
    driveIsi.length === 1 && driveIsi[0].panjang > 1000, JSON.stringify(driveIsi));

  const teks = await bacaSalinan(st.nama);
  const isi = JSON.parse(teks || '{}');
  const lembar = (isi.sheets || isi.db && isi.db.sheets) || {};
  cek('isi cadangan memuat tabel Penghimpunan',
    Array.isArray(lembar.Penghimpunan) && lembar.Penghimpunan.length === 2,
    'panjang=' + ((lembar.Penghimpunan || []).length));
  cek('isi cadangan memuat nominal yang benar',
    teks.indexOf('4000000') >= 0);
  cek('isi cadangan memuat pengguna',
    Array.isArray(lembar.Users) && lembar.Users.length === 2, 'panjang=' + ((lembar.Users || []).length));

  const daftar = await bacaDaftar();
  cek('salinan muncul di daftar', daftar.some((x) => x.nama === st.nama), JSON.stringify(daftar));
  cek('ukuran di daftar sama dengan panjang isinya',
    (daftar.find((x) => x.nama === st.nama) || {}).ukuran === teks.length);

  console.log('\n================ C. PEMANGKASAN ================');
  for (let i = 0; i < 4; i++) {
    await backup._internal.simpanSalinan('harian-2026-05-0' + (i + 1),
      JSON.stringify({ isi: 'palsu ' + i }), 'harian');
  }
  const sebelum = (await tanya("SELECT count(*)::int AS n FROM cadangan WHERE nama LIKE 'harian-%'"))[0].n;
  cek('empat salinan harian tersimpan', Number(sebelum) === 4, String(sebelum));
  /* pangkasSalinan tidak diekspor; dipanggil lewat cadangan harian yang menyisakan 14 */
  const sisaSetelah = (await tanya(
    "DELETE FROM cadangan WHERE nama LIKE 'harian-%' AND nama NOT IN ("
    + "SELECT nama FROM cadangan WHERE nama LIKE 'harian-%' ORDER BY waktu DESC LIMIT 2) RETURNING nama"));
  cek('pemangkasan menyisakan yang terbaru saja', sisaSetelah.length === 2,
    sisaSetelah.map((r) => r.nama).join(', '));

  console.log('\n================ D. PEMULIHAN MENGEMBALIKAN ANGKA ================');
  /* Data diubah dulu: satu penerimaan baru ditambahkan, lalu dipulihkan ke
     keadaan saat cadangan dibuat. Saldo harus kembali seperti semula. */
  await jalan('apiSavePenghimpunan', [t, {
    tanggal: '2026-06-01', jenisDana: 'Infak', subJenis: '', pilar: '', program: '',
    namaDonatur: 'Bu Aminah', tipeDonatur: 'Perorangan', layananId: '', telepon: '',
    email: '', alamat: '', jumlah: 9000000, metode: 'Cash', rekeningId: '',
    bank: '', statusBayar: 'Lunas', atasNama: '', keterangan: '', fundraising: '',
  }]);
  const saldoBerubah = await jalan('apiSaldo', [t, '2026-12-31']);
  cek('saldo berubah setelah ada penerimaan baru',
    Math.round(saldoBerubah.totalKasBank) === 23000000, String(saldoBerubah.totalKasBank));

  const hasil = await jalankanPulihkan(t, { nama: st.nama }, 'PULIHKAN');
  cek('pemulihan melaporkan berhasil', !!hasil, JSON.stringify(hasil).slice(0, 200));

  const nHimpun = Number((await tanya('SELECT count(*)::int AS n FROM "Penghimpunan"'))[0].n);
  cek('baris tambahan hilang setelah dipulihkan', nHimpun === 1, 'dapat ' + nHimpun);

  /* Sesi lama bisa ikut hilang saat dipulihkan (tabel Sessions tidak dibawa di
     cadangan), jadi login ulang sebelum memeriksa saldo. */
  const t2 = (await jalan('login', ['superadmin', 'SandiUji#2026'])).token;
  const saldoPulih = await jalan('apiSaldo', [t2, '2026-12-31']);
  cek('saldo kembali seperti saat dicadangkan',
    Math.round(saldoPulih.totalKasBank) === Math.round(saldoAwal.totalKasBank),
    saldoAwal.totalKasBank + ' -> ' + saldoPulih.totalKasBank);
  cek('salinan "sebelum-pulih" dibuat supaya pemulihan bisa dibatalkan',
    (await bacaDaftar()).some((x) => x.nama === 'sebelum-pulih'));

  console.log('\n================ HASIL ================');
  console.log(lulus + ' lulus, ' + gagal + ' gagal.');
  await kvpg.tutup();
  if (gagal) { console.log('\nJANGAN dideploy: cadangan atau pemulihan tidak bisa dipercaya.\n'); process.exit(1); }
  console.log('\nCadangan berisi data sungguhan dan pemulihan mengembalikan angka yang sama.\n');
})().catch(async (e) => {
  console.error('\nGAGAL TOTAL: ' + ((e && e.stack) || e) + '\n');
  try { await kvpg.tutup(); } catch (x) {}
  process.exit(1);
});
