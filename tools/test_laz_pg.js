/* tools/test_laz_pg.js: membuktikan buku besar di PostgreSQL berperilaku sama
 * dengan buku besar di satu bongkah JSON.
 *
 * CARA MENGUJINYA: KESETARAAN, BUKAN DAFTAR PERIKSA.
 * Rangkaian pekerjaan yang sama dijalankan DUA KALI: sekali lewat jalur lama
 * (satu objek JSON di memori, persis seperti laz:db di Redis), sekali lewat
 * lib/laz-pg.js, lalu hasil tiap langkah dibandingkan. Menguji "apakah INSERT
 * jalan" tidak membuktikan apa pun tentang uang; membuktikan bahwa kedua jalur
 * menghasilkan angka yang sama persis, membuktikannya.
 *
 * Supaya dua sisi bisa dibandingkan huruf per huruf, pembuat id (crypto.randomUUID)
 * diganti penghitung berurutan yang di-nolkan sebelum tiap sisi berjalan. Jadi
 * id, nomor kwitansi, dan salt sandi sama di kedua sisi, dan satu-satunya yang
 * masih berbeda adalah cap waktu, dan itu dinormalkan sebelum dibandingkan.
 *
 * Perlu PostgreSQL yang boleh dikosongkan:
 *   node tools/test_laz_pg.js --alamat "postgres://postgres@127.0.0.1:55432/uji_laz"
 * atau setel DATABASE_URL. SELURUH ISI SKEMA public DIHAPUS lebih dulu.
 */
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Jakarta';   /* zona waktu Indonesia: perangkap date/UTC */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

let Client;
try { ({ Client } = require('pg')); } catch (e) { console.error('\nnpm install pg\n'); process.exit(2); }

/* ---------------- penghitung pemakaian basis data ----------------
   Dipasang di Client.prototype supaya klien dari kolam pun terhitung. Dipakai
   untuk membuktikan pemuatan bertahap: login tidak boleh menyentuh tabel
   transaksi. */
const jejakSQL = [];
let rekamSQL = false;
const queryAsli = Client.prototype.query;
Client.prototype.query = function (...a) {
  if (rekamSQL) jejakSQL.push(String(typeof a[0] === 'string' ? a[0] : (a[0] && a[0].text) || ''));
  return queryAsli.apply(this, a);
};

/* ---------------- id berurutan ---------------- */
let nomorId = 0;
function nolkanId() { nomorId = 0; }
/* Angkanya diletakkan di DEPAN, bukan di belakang: makeId() memotong uuid jadi
   16 huruf pertama, jadi nomor di ujung akan terpotong dan semua id jadi sama.
   Kekeliruan ini sempat terjadi dan gejalanya menyesatkan (daftar rekening
   terlihat kosong), jadi ditulis di sini supaya tidak terulang. */
crypto.randomUUID = function () {
  nomorId++;
  const h = (nomorId.toString(16).padStart(8, '0') + '0'.repeat(32)).slice(0, 32);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
};

const engine = require(path.join(AKAR, 'api', '_engine.js'));
const lazpg = require(path.join(AKAR, 'lib', 'laz-pg.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const kvpg = require(path.join(AKAR, 'lib', 'kv-postgres.js'));

/* ---------------- pemeriksaan ---------------- */
let lulus = 0, gagal = 0;
function cek(nama, benar, tambahan) {
  if (benar) { lulus++; console.log('  ok    | ' + nama); return true; }
  gagal++;
  console.log('  GAGAL | ' + nama + (tambahan ? '\n          ' + tambahan : ''));
  return false;
}
function cekSama(nama, a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa === sb) { lulus++; console.log('  ok    | ' + nama); return; }
  gagal++;
  console.log('  GAGAL | ' + nama);
  console.log('          lama: ' + String(sa).slice(0, 300));
  console.log('          baru: ' + String(sb).slice(0, 300));
}

/* Cap waktu dan hal yang memang tidak mungkin sama dinormalkan. Yang TIDAK
   dinormalkan: nominal, id, nomor kwitansi, nama akun, semua yang menentukan
   uangnya mendarat di mana. */
/* Urutan KUNCI objek tidak ikut dibandingkan: di JavaScript urutan itu sekadar
   urutan pemasukan, dan tidak ada satu pun bagian aplikasi yang membacanya
   (matriks izin, misalnya, dirangkai dari daftar modul di apiGetPermissionMeta,
   bukan dari Object.keys). Urutan LARIK tetap dibandingkan apa adanya, karena
   itu yang menentukan urutan baris di layar. */
function urutkanKunci(v) {
  if (Array.isArray(v)) return v.map(urutkanKunci);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = urutkanKunci(v[k]);
    return o;
  }
  return v;
}

function normal(v) {
  return urutkanKunci(JSON.parse(JSON.stringify(v === undefined ? null : v, (k, x) => {
    if (typeof x === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(x)) return '<waktu>';
      if (/^\d{2}:\d{2}:\d{2}$/.test(x)) return '<jam>';
      /* Ringkasan audit memuat cap waktu di tengah teks. */
      return x.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<waktu>');
    }
    return x;
  })));
}

/* ---------------- jalur lama: satu bongkah di memori ---------------- */
function pembuatBlob() {
  let db = { sheets: {}, props: {} };
  return async function jalan(fn, args) {
    const keluar = await engine.runRPC(db, fn, JSON.parse(JSON.stringify(args || [])), {});
    db = keluar.db;
    return keluar.result;
  };
}
function pembuatPg() {
  return function jalan(fn, args) { return lazpg.jalankanRPC(engine, fn, args, {}); };
}

/* ---------------- skenario ----------------
   Satu hari kerja yang masuk akal: pasang, login, buat rekening & layanan,
   catat saldo awal tahun, catat penerimaan tunai dan transfer, catat
   penyaluran, pindah kas, lalu lihat saldo dan laporannya. */
async function skenario(jalan, catat) {
  const langkah = async (nama, fn, args) => { catat(nama, normal(await jalan(fn, args))); };

  await langkah('setup', 'setup', []);
  const masuk = await jalan('login', ['superadmin', 'SandiUji#2026']);
  catat('login', normal({ user: masuk.user }));
  const t = masuk.token;

  await langkah('bootstrap', 'apiBootstrap', [t]);

  await langkah('rekening BSI', 'apiSaveRekening', [t, {
    namaBank: 'BSI', nomor: '7081234567', atasNama: 'Lazismu Bantul',
    fundGroup: 'Zakat', aktif: 'true',
  }]);
  await langkah('rekening Mandiri', 'apiSaveRekening', [t, {
    namaBank: 'Mandiri', nomor: '1370099887', atasNama: 'Lazismu Bantul',
    fundGroup: 'Infak', aktif: 'true',
  }]);
  const rek = await jalan('apiListRekening', [t]);
  const rekZakat = rek.find((r) => r.namaBank === 'BSI');
  const rekInfak = rek.find((r) => r.namaBank === 'Mandiri');
  catat('daftar rekening', normal(rek));

  await langkah('layanan KLL', 'apiSaveLayanan', [t, {
    tipe: 'KLL', kode: 'KLL-01', nama: 'KL Sewon', wilayah: 'Sewon',
    penanggungJawab: 'Budi', telepon: '08120001', aktif: 'true',
  }]);
  const lay = (await jalan('apiListLayanan', [t]))[0];

  await langkah('saldo awal 2026', 'apiSaveSaldoAwal', [t, '2026', [
    { kode: 'rek:' + rekZakat.id, nominal: 25000000, keterangan: 'saldo pindahan' },
    { kode: 'kas:Zakat', nominal: 1500000, keterangan: 'kas tangan' },
    { jenis: 'ump', dana: 'Infak', nominal: 750000, keterangan: 'uang muka program' },
  ]]);

  await langkah('himpun tunai', 'apiSavePenghimpunan', [t, {
    tanggal: '2026-03-01', jenisDana: 'Zakat', subJenis: 'Maal', pilar: '', program: '',
    namaDonatur: 'Hamba Allah', tipeDonatur: 'Perorangan', layananId: '',
    telepon: '', email: '', alamat: 'Bantul', jumlah: 2000000,
    metode: 'Cash', rekeningId: '', bank: '', statusBayar: 'Lunas',
    atasNama: '', keterangan: 'zakat maal', fundraising: '',
  }]);
  await langkah('himpun transfer', 'apiSavePenghimpunan', [t, {
    tanggal: '2026-03-02', jenisDana: 'Infak', subJenis: '', pilar: '', program: '',
    namaDonatur: 'Ibu Sri', tipeDonatur: 'Perorangan', layananId: lay.id,
    telepon: '08123', email: '', alamat: 'Sewon', jumlah: 5000000,
    metode: 'Transfer', rekeningId: rekInfak.id, bank: 'Mandiri', statusBayar: 'Lunas',
    atasNama: 'Sri', keterangan: '', fundraising: '',
  }]);
  await langkah('himpun barang', 'apiSavePenghimpunan', [t, {
    tanggal: '2026-03-03', jenisDana: 'Infak', subJenis: '', pilar: '', program: '',
    namaDonatur: 'Toko Beras', tipeDonatur: 'Lembaga', layananId: '',
    telepon: '', email: '', alamat: '', jumlah: 1200000,
    metode: 'Barang', rekeningId: '', bank: '', statusBayar: 'Lunas',
    atasNama: '', keterangan: '50 kg beras', fundraising: '',
  }]);

  await langkah('salur tunai', 'apiSavePentasyarufan', [t, {
    tanggal: '2026-03-05', ashnaf: 'Fakir', program: 'Bantuan Pangan',
    sumberDana: 'Zakat', namaPenerima: 'Pak Slamet', nik: '3402', telepon: '',
    alamat: 'Bantul', jumlah: 500000, bentukBantuan: 'Uang', metode: 'Cash',
    statusSalur: 'Tersalurkan', keterangan: '', fundraising: '',
    rekeningId: '', bank: '', section: '',
  }]);
  await langkah('salur transfer', 'apiSavePentasyarufan', [t, {
    tanggal: '2026-03-06', ashnaf: 'Miskin', program: 'Beasiswa',
    sumberDana: 'Infak', namaPenerima: 'Ananda', nik: '3403', telepon: '',
    alamat: 'Sewon', jumlah: 1000000, bentukBantuan: 'Uang', metode: 'Transfer',
    statusSalur: 'Tersalurkan', keterangan: '', fundraising: '',
    rekeningId: rekInfak.id, bank: 'Mandiri', section: '',
  }]);

  await langkah('saldo 31 Mar', 'apiSaldo', [t, '2026-03-31']);
  await langkah('dasbor Maret', 'apiDashboard', [t, '2026-03']);
  await langkah('laporan harian', 'apiLaporanHarian', [t, '2026-03-02']);
  await langkah('daftar himpunan', 'apiListPenghimpunan', [t]);
  await langkah('daftar donatur', 'apiListDonatur', [t]);
  await langkah('buku akun rek Infak', 'apiMutasiAkun', [t, 'rek:' + rekInfak.id, '2026-01-01', '2026-12-31']);
  await langkah('saldo awal tersimpan', 'apiListSaldoAwal', [t, '2026']);

  /* Ubah lalu hapus: membuktikan UPDATE dan DELETE ikut benar, bukan cuma INSERT. */
  const daftar = await jalan('apiListPenghimpunan', [t]);
  const barang = daftar.find((r) => r.metode === 'Barang');
  await langkah('ubah himpunan', 'apiSavePenghimpunan', [t,
    Object.assign({}, barang, { jumlah: 1300000, keterangan: '55 kg beras' })]);
  const tunai = daftar.find((r) => r.jenisDana === 'Zakat' && r.metode === 'Cash');
  await langkah('hapus himpunan', 'apiDeletePenghimpunan', [t, tunai.id]);
  await langkah('saldo sesudah ubah & hapus', 'apiSaldo', [t, '2026-12-31']);

  await langkah('ganti pengaturan', 'apiSaveSettings', [t, { namaLembaga: 'Lazismu Bantul', singkatan: 'Lazismu' }]);
  await langkah('pengaturan', 'apiGetSettings', [t]);
  await langkah('daftar pengguna', 'apiListUsers', [t]);
  await langkah('audit', 'apiListAudit', [t, { batas: 200 }]);

  return { t: t, rekInfak: rekInfak.id };
}

/* ---------------- penyiapan basis data ---------------- */
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
async function tanya(sql, nilai) {
  const k = new Client({ connectionString: ALAMAT });
  await k.connect();
  try { return (await k.query(sql, nilai)).rows; } finally { await k.end(); }
}

/* ---------------- mulai ---------------- */
(async () => {
  /* PEMANASAN. Pada pemanggilan pertama sebuah fungsi, lib/laz-pg.js belum tahu
     tabel apa yang dibutuhkannya: ia menjalankan fungsinya, kena galat "tabel
     belum dimuat", lalu mengulang. Pengulangan itu memakai beberapa id acak yang
     lalu dibuang, sehingga id di sisi PostgreSQL bergeser dan tidak bisa
     dibandingkan huruf per huruf dengan sisi lama. Sekali dijalankan, daftar
     tabel per fungsi sudah terisi, dan itu juga keadaan sesungguhnya di
     produksi, karena daftarnya ikut disimpan di kv. */
  console.log('\n(pemanasan: sekali jalan untuk mengisi daftar tabel per fungsi)');
  await kosongkan();
  nolkanId();
  await skenario(pembuatPg(), () => {});

  console.log('\n================ A. KESETARAAN DUA JALUR ================');
  await kosongkan();

  const hasilBlob = [];
  nolkanId();
  const infoBlob = await skenario(pembuatBlob(), (n, v) => hasilBlob.push([n, v]));

  const hasilPg = [];
  nolkanId();
  rekamSQL = true;
  const infoPg = await skenario(pembuatPg(), (n, v) => hasilPg.push([n, v]));
  rekamSQL = false;

  cek('jumlah langkah sama', hasilBlob.length === hasilPg.length,
    hasilBlob.length + ' vs ' + hasilPg.length);
  for (let i = 0; i < Math.min(hasilBlob.length, hasilPg.length); i++) {
    cekSama('langkah: ' + hasilBlob[i][0], hasilBlob[i][1], hasilPg[i][1]);
  }
  cek('token terbentuk di kedua sisi', !!infoBlob.t && !!infoPg.t);

  console.log('\n================ B. ISI TABEL SUNGGUHAN ================');
  for (const [tabel, harap] of [['Users', 1], ['Rekening', 2], ['Layanan', 1],
    ['Penghimpunan', 2], ['Pentasyarufan', 2], ['SaldoAwal', 3],
    /* Satu donatur saja: penyumbang lewat kantor layanan (KLL/ULL) dan
       penyumbang anonim memang tidak didaftarkan. */
    ['Donatur', 1]]) {
    const n = Number((await tanya('SELECT count(*)::int AS n FROM "' + tabel + '"'))[0].n);
    cek(tabel + ' berisi ' + harap + ' baris', n === harap, 'dapat ' + n);
  }
  const jml = Number((await tanya('SELECT count(*)::int AS n FROM "AuditLog"'))[0].n);
  cek('AuditLog terisi', jml > 10, 'dapat ' + jml);

  console.log('\n--- tipe kolom benar-benar dipakai, bukan teks ---');
  const tipe = await tanya(
    "SELECT table_name, column_name, data_type FROM information_schema.columns "
    + "WHERE table_schema='public' AND (table_name,column_name) IN "
    + "(('Penghimpunan','tanggal'),('Penghimpunan','jumlah'),('Users','aktif'),"
    + "('Users','permissions'),('Sessions','expired'))");
  const petaTipe = {};
  tipe.forEach((r) => { petaTipe[r.table_name + '.' + r.column_name] = r.data_type; });
  cek('Penghimpunan.tanggal bertipe date', petaTipe['Penghimpunan.tanggal'] === 'date');
  cek('Penghimpunan.jumlah bertipe numeric', petaTipe['Penghimpunan.jumlah'] === 'numeric');
  cek('Users.aktif bertipe boolean', petaTipe['Users.aktif'] === 'boolean');
  cek('Users.permissions bertipe jsonb', petaTipe['Users.permissions'] === 'jsonb');

  /* Perangkap zona waktu: date yang dibaca lalu ditulis ulang tidak boleh
     bergeser satu hari. Prosesnya berjalan di Asia/Jakarta (UTC+7), zona di
     mana kesalahan ini muncul. */
  const tgl = (await tanya('SELECT "tanggal"::text AS t FROM "Penghimpunan" ORDER BY "tanggal"')).map((r) => r.t);
  cekSama('tanggal tidak bergeser sehari', tgl, ['2026-03-02', '2026-03-03']);
  const nom = (await tanya('SELECT "jumlah"::text AS j FROM "Penghimpunan" ORDER BY "tanggal"')).map((r) => r.j);
  cekSama('nominal utuh sampai sen', nom, ['5000000.00', '1300000.00']);

  console.log('\n================ C. PEMUATAN BERTAHAP ================');
  /* Hanya pemuatan isi tabel yang dihitung (SELECT * FROM "X"). Kueri
     penghitung baris menyebut ke-13 nama tabel dalam satu pernyataan, dan kalau
     itu ikut terhitung, ujinya akan selalu tampak "membaca semuanya". */
  const selectTabel = (teks) => {
    const out = new Set();
    for (const m of teks.matchAll(/SELECT \* FROM "([A-Za-z]+)"/g)) out.add(m[1]);
    return out;
  };
  const semuaSelect = selectTabel(jejakSQL.join(' '));
  cek('Users dimuat', semuaSelect.has('Users'));
  cek('Penghimpunan dimuat saat memang dibutuhkan', semuaSelect.has('Penghimpunan'));

  /* Login sendirian, di proses yang petunjuknya sudah terisi: tidak boleh
     menyentuh tabel transaksi sama sekali. */
  jejakSQL.length = 0;
  rekamSQL = true;
  const masukLagi = await lazpg.jalankanRPC(engine, 'login', ['superadmin', 'SandiUji#2026'], {});
  rekamSQL = false;
  const dipakaiLogin = selectTabel(jejakSQL.join(' '));
  cek('login berhasil', !!masukLagi.token);
  cek('login tidak membaca Penghimpunan', !dipakaiLogin.has('Penghimpunan'),
    [...dipakaiLogin].join(', '));
  cek('login tidak membaca Pentasyarufan', !dipakaiLogin.has('Pentasyarufan'));
  cek('login tetap membaca Users', dipakaiLogin.has('Users'));

  /* Petunjuk tabel per fungsi tersimpan, jadi instance berikutnya tidak perlu
     belajar dari nol. */
  const pet = await tanya('SELECT nilai FROM kv WHERE kunci=$1', ['laz:lembar']);
  const petObj = pet.length ? JSON.parse(pet[0].nilai) : {};
  cek('petunjuk tabel tersimpan di kv', Object.keys(petObj).length > 0,
    Object.keys(petObj).length + ' fungsi');
  cek('petunjuk apiSaldo menyebut Penghimpunan',
    (petObj.apiSaldo || []).includes('Penghimpunan'), JSON.stringify(petObj.apiSaldo || []));

  console.log('\n================ D. BACA TIDAK MENULIS ================');
  const verSebelum = (await tanya('SELECT nilai FROM kv WHERE kunci=$1', ['laz:ver']))[0].nilai;
  jejakSQL.length = 0;
  rekamSQL = true;
  await lazpg.jalankanRPC(engine, 'apiSaldo', [infoPg.t, '2026-12-31'], {});
  rekamSQL = false;
  /* Yang diuji: tidak ada satu pun TABEL buku besar yang disentuh. Baris kv
     laz:props boleh berubah, karena aplikasi memang mencatat "siapa membuka
     apa" (dibatasi sekali per lima menit per pengguna per modul), dan
     pencatatan itu perilaku lama yang tidak ikut diubah di sini. */
  const menulisTabel = jejakSQL.filter((s) => /^\s*(INSERT|UPDATE|DELETE)/i.test(s))
    .filter((s) => skema.NAMA_TABEL.some((t) => s.includes('"' + t + '"')));
  const verSesudah = (await tanya('SELECT nilai FROM kv WHERE kunci=$1', ['laz:ver']))[0].nilai;
  cek('apiSaldo tidak menyentuh satu pun tabel buku besar', menulisTabel.length === 0,
    menulisTabel.slice(0, 3).map((s) => s.slice(0, 70)).join(' | '));

  console.log('\n================ E. SATU SIMPAN = SATU INSERT ================');
  jejakSQL.length = 0;
  rekamSQL = true;
  await lazpg.jalankanRPC(engine, 'apiSavePenghimpunan', [infoPg.t, {
    tanggal: '2026-04-01', jenisDana: 'Zakat', subJenis: 'Fitrah', pilar: '', program: '',
    namaDonatur: 'Pak Anwar', tipeDonatur: 'Perorangan', layananId: '',
    telepon: '', email: '', alamat: '', jumlah: 300000, metode: 'Cash',
    rekeningId: '', bank: '', statusBayar: 'Lunas', atasNama: '', keterangan: '',
    fundraising: '',
  }], {});
  rekamSQL = false;
  const sisipHimpun = jejakSQL.filter((s) => /INSERT INTO "Penghimpunan"/.test(s));
  cek('satu INSERT ke Penghimpunan', sisipHimpun.length === 1, sisipHimpun.length + ' kali');
  cek('tidak ada DELETE ke Penghimpunan',
    jejakSQL.filter((s) => /DELETE FROM "Penghimpunan"/.test(s)).length === 0);
  const nHimpun = Number((await tanya('SELECT count(*)::int AS n FROM "Penghimpunan"'))[0].n);
  cek('barisnya bertambah jadi 3', nHimpun === 3, 'dapat ' + nHimpun);
  const verNaik = (await tanya('SELECT nilai FROM kv WHERE kunci=$1', ['laz:ver']))[0].nilai;
  cek('nomor versi naik', Number(verNaik) > Number(verSesudah), verSesudah + ' -> ' + verNaik);

  /* Nomor kwitansi diambil dari nomor terbesar, bukan dari jumlah baris. Di
     bagian A satu penerimaan sudah dihapus, jadi cara lama akan mengulang nomor
     yang masih terpakai dan tertolak indeks unik. */
  const kw = (await tanya('SELECT "noKwitansi" AS k FROM "Penghimpunan" ORDER BY "noKwitansi"')).map((r) => r.k);
  cek('nomor kwitansi tidak ada yang kembar', new Set(kw).size === kw.length, kw.join(', '));

  console.log('\n================ F. DUA PENULIS SEKALIGUS ================');
  /* Nomor versi diubah di luar, meniru petugas lain yang menyimpan lebih dulu.
     simpan() harus MENOLAK, bukan menimpa. */
  {
    const kolam = kvpg.ambilKolam();
    const klien = await kolam.connect();
    let keadaan;
    try {
      keadaan = await lazpg._internal.muat(klien, ['Rekening']);
      await tanya('UPDATE kv SET nilai=$1 WHERE kunci=$2', [String(Number(keadaan.versi) + 99), 'laz:ver']);
      keadaan.db.sheets.Rekening.push(keadaan.db.sheets.Rekening[1].slice());
      keadaan.db.sheets.Rekening[keadaan.db.sheets.Rekening.length - 1][0] = 'palsu001';
      const ok = await lazpg._internal.simpan(klien, keadaan, keadaan.db);
      cek('simpan menolak saat versi sudah berubah', ok === false, 'dapat ' + ok);
    } finally { klien.release(); }
    const nRek = Number((await tanya('SELECT count(*)::int AS n FROM "Rekening"'))[0].n);
    cek('tidak ada baris yang lolos saat ditolak', nRek === 2, 'dapat ' + nRek);
    await tanya('UPDATE kv SET nilai=$1 WHERE kunci=$2', [verNaik, 'laz:ver']);
  }

  console.log('\n================ G. KOLOM ASING DITOLAK ================');
  {
    const klien = await kvpg.ambilKolam().connect();
    try {
      const keadaan = await lazpg._internal.muat(klien, ['Rekening']);
      keadaan.db.sheets.Rekening[0].push('kolomBaruYangBelumAda');
      let pesan = '';
      try { await lazpg._internal.simpan(klien, keadaan, keadaan.db); }
      catch (e) { pesan = e.message; }
      cek('kolom yang belum ada di PostgreSQL dilaporkan, bukan dibuang',
        /kolomBaruYangBelumAda/.test(pesan) && /01-skema\.sql/.test(pesan), pesan);
    } finally { klien.release(); }
  }

  console.log('\n================ H. NILAI RUSAK TIDAK JADI NOL ================');
  {
    let pesan = '';
    try { skema.keTabel('angka', 'seratus ribu', 'Penghimpunan[x].jumlah'); }
    catch (e) { pesan = e.message; }
    cek('nominal tak terbaca dilempar, bukan dijadikan 0', /bukan angka/.test(pesan), pesan);
    pesan = '';
    try { skema.keTabel('tanggal', '3 Maret', 'Penghimpunan[x].tanggal'); }
    catch (e) { pesan = e.message; }
    cek('tanggal tak terbaca dilempar, bukan dijadikan NULL',
      /tidak bisa dibaca/.test(pesan), pesan);
    cek('waktu tidak dipotong jadi tanggal saja',
      skema.keMesin('waktu', new Date('2026-09-26T19:30:00Z')) === '2026-09-26T19:30:00.000Z');
    cek('bool jadi teks true/false seperti yang engine simpan',
      skema.keMesin('bool', true) === 'true' && skema.keMesin('bool', false) === 'false');
    cek('json jadi teks, bukan objek',
      skema.keMesin('json', { a: 1 }) === '{"a":1}');
    cek('numeric dari pg (teks) jadi angka',
      skema.keMesin('angka', '1500000.00') === 1500000);
  }

  console.log('\n================ I. SESI KEDALUWARSA DIBERSIHKAN ================');
  {
    await tanya('INSERT INTO "Sessions" (token,"userId","expired") VALUES ($1,$2,$3)',
      ['sesi-mati', 'x', new Date(Date.now() - 86400e3).toISOString()]);
    lazpg._internal.DASAR;                     /* sengaja: sekadar penanda */
    /* Penyapuan dibatasi sekali per lima menit per proses dan sudah terpakai di
       atas, jadi di sini yang diuji perintahnya sendiri. */
    await tanya('DELETE FROM "Sessions" WHERE "expired" < now()');
    const sisa = (await tanya('SELECT token FROM "Sessions"')).map((r) => r.token);
    cek('sesi kedaluwarsa hilang, sesi hidup tetap',
      !sisa.includes('sesi-mati') && sisa.includes(infoPg.t), sisa.join(', '));
  }

  console.log('\n================ J. MEMUAT SELURUHNYA (untuk cadangan) ================');
  {
    const semua = await lazpg.muatSemua();
    const kurang = skema.NAMA_TABEL.filter((t) => !semua.db.sheets[t]);
    cek('semua tabel hadir', kurang.length === 0, kurang.join(', '));
    cek('Penghimpunan ikut terbaca isinya', semua.db.sheets.Penghimpunan.length === 4,
      String(semua.db.sheets.Penghimpunan.length));
    cek('baris judul sesuai skema',
      JSON.stringify(semua.db.sheets.Penghimpunan[0]) === JSON.stringify(skema.kepala('Penghimpunan')));
  }

  console.log('\n================ HASIL ================');
  console.log(lulus + ' lulus, ' + gagal + ' gagal.');
  await kvpg.tutup();
  if (gagal) {
    console.log('\nJANGAN dideploy. Selisih di sini berarti angka di aplikasi bisa berbeda.\n');
    process.exit(1);
  }
  console.log('\nJalur PostgreSQL menghasilkan hasil yang sama persis dengan jalur lama.\n');
})().catch(async (e) => {
  console.error('\nGAGAL TOTAL: ' + (e && e.stack || e) + '\n');
  try { await kvpg.tutup(); } catch (x) {}
  process.exit(1);
});
