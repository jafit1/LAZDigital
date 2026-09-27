/* tools/test_sesi_modul_pg.js: memastikan Broadcast, AI Asisten, dan
 * Fundraising benar-benar mengenali sesi LAZDigital di atas PostgreSQL.
 *
 * KEGAGALAN YANG DIUJI DI SINI PERNAH TERJADI, DAN BENTUKNYA MENIPU.
 * Ketiga modul itu tidak punya akun sendiri. Mereka bertanya ke buku besar
 * LAZDigital lewat engine.cekIzin: "token ini siapa, dan boleh apa". Jalur
 * bacanya dulu rpc._internal.muat(), yang membaca Redis.
 *
 * Begitu buku besarnya pindah ke PostgreSQL, fungsi yang sama mengembalikan
 * basis data KOSONG. Tanpa galat, tanpa peringatan: tidak ada tabel Users,
 * jadi tidak ada pengguna, jadi setiap token ditolak. Yang terlihat di layar
 * cuma halaman modul terbuka sekejap lalu memantul balik ke dasbor, dan tidak
 * ada satu pun pesan yang menjelaskan kenapa.
 *
 * Uji ini memanggil penggunaLaz() milik ketiga modul dengan token sungguhan
 * hasil login, lalu memastikan yang kembali memang penggunanya, lengkap dengan
 * peran dan kantornya. Ia juga memastikan token palsu tetap ditolak, supaya
 * perbaikannya tidak berubah jadi lubang.
 *
 *   node tools/test_sesi_modul_pg.js --alamat "postgres://postgres@127.0.0.1:5432/laz_uji"
 */
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');

/* ============================================================
   PENGAMAN: UJI INI MENGHAPUS SELURUH ISI BASIS DATA
   ------------------------------------------------------------
   Sama seperti uji PostgreSQL lain: alamatnya harus disebut sendiri dan harus
   menunjuk komputer ini. DATABASE_URL sengaja tidak dibaca, karena isinya
   alamat produksi.
   ============================================================ */
const arg = process.argv.slice(2);
const opsi = (n, b) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : b; };
const ALAMAT = opsi('--alamat', process.env.UJI_DATABASE_URL || '');
if (!ALAMAT) {
  console.log('  DILEWATI: perlu PostgreSQL untuk percobaan.');
  console.log('  node tools/test_sesi_modul_pg.js --alamat "postgres://postgres@127.0.0.1:5432/laz_uji"');
  process.exit(2);
}
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(ALAMAT) && !arg.includes('--saya-tahu-ini-menghapus-semuanya')) {
  console.error('\n  DITOLAK: alamatnya bukan komputer ini.\n');
  process.exit(1);
}
process.env.DATABASE_URL = ALAMAT;
process.env.SETUP_ADMIN_PASSWORD = 'SandiUji#2026';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let Client;
try { ({ Client } = require('pg')); } catch (e) { console.error('\nnpm install pg\n'); process.exit(2); }

const engine = require(path.join(AKAR, 'api', '_engine.js'));
const lazpg = require(path.join(AKAR, 'lib', 'laz-pg.js'));
const kvpg = require(path.join(AKAR, 'lib', 'kv-postgres.js'));
const sesiBlast = require(path.join(AKAR, 'lib', 'blast', 'sesi-laz.js'));
const sesiAi = require(path.join(AKAR, 'lib', 'ai', 'sesi-laz.js'));
const sesiFund = require(path.join(AKAR, 'lib', 'fund', 'sesi-laz.js'));

let lulus = 0, gagal = 0;
function cek(nama, benar, tambahan) {
  if (benar) { lulus++; console.log('  ok    | ' + nama); return; }
  gagal++;
  console.log('  GAGAL | ' + nama + (tambahan ? '\n          ' + tambahan : ''));
}

async function kosongkan() {
  const k = new Client({ connectionString: ALAMAT });
  await k.connect();
  try {
    await k.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await k.query(fs.readFileSync(path.join(AKAR, 'sql', '01-skema.sql'), 'utf8'));
    await k.query(fs.readFileSync(path.join(AKAR, 'sql', '02-keamanan.sql'), 'utf8'));
  } finally { await k.end(); }
}

/* Permintaan HTTP tiruan, sebentuk dengan yang diterima api/blast.js dkk. */
const permintaan = (token) => ({ headers: { 'user-agent': 'uji' }, body: { token } });

(async () => {
  await kosongkan();
  const jalan = (fn, args) => lazpg.jalankanRPC(engine, fn, args, {});

  console.log('\n================ A. SIAPKAN ================');
  await jalan('setup', []);
  const masuk = await jalan('login', ['superadmin', 'SandiUji#2026']);
  const t = masuk.token;
  cek('login superadmin berhasil', !!t);

  /* Satu akun petugas yang HANYA dicentang broadcast:view, untuk membuktikan
     izinnya benar-benar dibaca dari centang modul, bukan dari peran. */
  await jalan('apiSaveUser', [t, {
    username: 'petugaswa', nama: 'Petugas WA', role: 'staff', password: 'SandiUji#2026',
    aktif: true, layanan: '',
    permissions: { broadcast: { view: true, create: false, edit: false, delete: false } },
  }]);
  const masukPetugas = await jalan('login', ['petugaswa', 'SandiUji#2026']);
  const tp = masukPetugas.token;
  cek('login petugas berhasil', !!tp);

  console.log('\n================ B. KETIGA MODUL MENGENALI SESI ================');
  for (const [nama, sesi] of [['Broadcast', sesiBlast], ['AI Asisten', sesiAi], ['Fundraising', sesiFund]]) {
    let u = null, galatnya = '';
    try { u = await sesi.penggunaLaz(permintaan(t)); } catch (e) { galatnya = e.message; }
    cek(nama + ': superadmin dikenali', !!u && u.username === 'superadmin',
      galatnya || JSON.stringify(u));
    if (u) {
      cek(nama + ': nama pengguna terbawa', u.nama === 'Super Administrator', u.nama);
      cek(nama + ': id pengguna terbawa', !!u.id);
      cek(nama + ': peran superadmin', u.peran === 'superadmin', String(u.peran));
    }
  }

  console.log('\n================ C. TOKEN PALSU TETAP DITOLAK ================');
  for (const [nama, sesi] of [['Broadcast', sesiBlast], ['AI Asisten', sesiAi], ['Fundraising', sesiFund]]) {
    const req = permintaan('token-karangan-' + Date.now());
    const u = await sesi.penggunaLaz(req);
    cek(nama + ': token palsu ditolak', u === null, JSON.stringify(u));
    cek(nama + ': alasannya "auth", bukan "izin"',
      (req.__alasanBlast || req.__alasanAi || req.__alasanFund) === 'auth',
      String(req.__alasanBlast || req.__alasanAi || req.__alasanFund));
  }
  for (const [nama, sesi] of [['Broadcast', sesiBlast], ['AI Asisten', sesiAi], ['Fundraising', sesiFund]]) {
    const u = await sesi.penggunaLaz({ headers: {}, body: {} });
    cek(nama + ': tanpa token ditolak', u === null);
  }

  console.log('\n================ D. IZIN DIBACA DARI CENTANG MODUL ================');
  {
    const u = await sesiBlast.penggunaLaz(permintaan(tp));
    cek('Broadcast: petugas ber-centang view dikenali', !!u && u.username === 'petugaswa',
      JSON.stringify(u));
    if (u) {
      cek('petugas boleh melihat dasbor', sesiBlast.bolehLaz(u, 'dasbor') === true);
      cek('petugas TIDAK boleh mengirim pesan', sesiBlast.bolehLaz(u, 'pesan.kirim') === false);
      cek('petugas TIDAK boleh mengubah setelan', sesiBlast.bolehLaz(u, 'setelan.ubah') === false);
    }
    /* Akun yang sama belum dicentang untuk AI dan Fundraising: harus ditolak
       dengan alasan "izin", bukan "auth". Kalau keduanya disamakan, petugas
       akan keluar-masuk berulang kali tanpa tahu yang kurang apa. */
    const reqAi = permintaan(tp);
    const ua = await sesiAi.penggunaLaz(reqAi);
    cek('AI Asisten: petugas tanpa centang ditolak', ua === null);
    cek('AI Asisten: alasannya "izin", bukan "auth"', reqAi.__alasanAi === 'izin',
      String(reqAi.__alasanAi));
  }

  console.log('\n================ E. SESI DICABUT LANGSUNG BERLAKU ================');
  {
    await jalan('logout', [tp]);
    const u = await sesiBlast.penggunaLaz(permintaan(tp));
    cek('Broadcast: token yang sudah logout ditolak', u === null, JSON.stringify(u));
  }

  console.log('\n================ F. PEMERIKSAAN IZIN TIDAK MEMBACA BUKU BESAR ================');
  {
    /* Kalau pemeriksaan izin ikut memuat Penghimpunan dan Pentasyarufan, tiap
       pembukaan halaman modul menyeret seluruh buku besar. Di sini dibuktikan
       ia hanya menyentuh tabel yang memang dibutuhkan. */
    const jejak = [];
    const asli = Client.prototype.query;
    Client.prototype.query = function (...a) {
      jejak.push(String(typeof a[0] === 'string' ? a[0] : (a[0] && a[0].text) || ''));
      return asli.apply(this, a);
    };
    await sesiBlast.penggunaLaz(permintaan(t));
    Client.prototype.query = asli;
    const dibaca = new Set();
    for (const m of jejak.join(' ').matchAll(/SELECT \* FROM "([A-Za-z]+)"/g)) dibaca.add(m[1]);
    cek('tidak membaca Penghimpunan', !dibaca.has('Penghimpunan'), [...dibaca].join(', '));
    cek('tidak membaca Pentasyarufan', !dibaca.has('Pentasyarufan'), [...dibaca].join(', '));
    cek('tetap membaca Users dan Sessions', dibaca.has('Users') && dibaca.has('Sessions'),
      [...dibaca].join(', '));
    const menulis = jejak.filter((x) => /^\s*(INSERT|UPDATE|DELETE)/i.test(x));
    cek('tidak menulis apa pun', menulis.length === 0,
      menulis.slice(0, 2).map((x) => x.slice(0, 60)).join(' | '));
  }

  console.log('\n================ HASIL ================');
  console.log(lulus + ' lulus, ' + gagal + ' gagal.');
  await kvpg.tutup();
  if (gagal) {
    console.log('\nJANGAN dideploy: modul Broadcast/AI/Fundraising tidak akan bisa dibuka.\n');
    process.exit(1);
  }
  console.log('\nKetiga modul mengenali sesi LAZDigital di atas PostgreSQL.\n');
})().catch(async (e) => {
  console.error('\nGAGAL TOTAL: ' + ((e && e.stack) || e) + '\n');
  try { await kvpg.tutup(); } catch (x) {}
  process.exit(1);
});
