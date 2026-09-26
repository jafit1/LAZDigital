/* tools/impor-postgres.js: memindahkan isi ekspor Redis ke PostgreSQL.
 *
 * TIGA MODE, dan pilihannya bukan soal teknis melainkan soal pembukuan:
 *
 *   --mode induk
 *     Hanya data induk: Users, Rekening, Layanan, Donatur, Settings, beserta
 *     data modul AI/Broadcast/Fundraising. Tabel transaksi kosong, dan
 *     SaldoAwal juga DIBIARKAN KOSONG.
 *
 *     Mode ini dipakai kalau saldo awal tahun berjalan tidak pernah diisi di
 *     sistem lama. Dalam keadaan itu, apiSaldo hanya bisa menghitung
 *     PERGERAKAN sejak 1 Januari, bukan saldo sesungguhnya, dan hasilnya
 *     rekening bank bersaldo minus. Membawa angka seperti itu berarti
 *     mengunci kekeliruan jadi saldo awal permanen di sistem baru. Lebih
 *     benar dikosongkan, lalu diisi sendiri dari rekening koran lewat
 *     Pengaturan > Saldo Awal, yang memang tempatnya.
 *
 *   --mode kosong (bawaan)
 *     Tabel transaksi dimulai bersih. Data induk (Users, Rekening, Layanan,
 *     Donatur, Settings) tetap dibawa, dan SALDO per tanggal potong dihitung
 *     dari data lama lalu ditulis sebagai baris SaldoAwal, supaya pencatatan
 *     baru menyambung ke angka yang benar.
 *
 *   --mode penuh
 *     Semua ikut: 4.332 Penghimpunan, 3.227 Pentasyarufan, dan seterusnya.
 *     Perlu diketahui sebelum memilih "kosong": mode ini TIDAK menambah
 *     pekerjaan sama sekali. Tabelnya sudah dibuat, skrip impornya sudah
 *     ditulis, dan mengimpor 4.332 baris sama saja dengan mengimpor nol baris.
 *     Yang hilang kalau memilih kosong: laporan tahunan 2026 yang utuh, dan
 *     riwayat tiap donatur (halaman Donatur menghitungnya dari Penghimpunan,
 *     jadi semua donatur akan tampak belum pernah berdonasi).
 *
 * SALDO AWALNYA TIDAK DIHITUNG ULANG DI SINI. Rumus saldo aplikasi ini penuh
 * perkecualian: donasi barang tidak menambah kas, LPJ bukan uang keluar, uang
 * muka punya ember sendiri per dana, satu sisi transfer boleh berupa akun
 * bukan-uang. Menulis ulang rumus itu di skrip pemindahan berarti dua rumus
 * yang harus selalu sama selamanya, dan suatu hari salah satunya berubah
 * duluan. Jadi yang dipanggil di sini fungsi aplikasinya sendiri
 * (api/_engine.js lewat runRPC -> apiSaldo), dengan data lama apa adanya.
 *
 * BAWAANNYA HANYA MENSIMULASIKAN. Tanpa --jalankan tidak ada satu pun baris
 * ditulis; yang keluar laporan apa yang AKAN masuk. Dan saat dijalankan
 * sungguhan, semuanya dalam SATU transaksi: kalau ada yang gagal di tengah,
 * basis datanya kembali kosong seperti semula, bukan terisi separuh.
 *
 * jalankan:
 *   node tools/impor-postgres.js --alamat "postgres://..." --potong 2026-09-26
 *   node tools/impor-postgres.js --alamat "..." --potong 2026-09-26 --jalankan
 *   node tools/impor-postgres.js --alamat "..." --mode penuh --jalankan
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const DIR = path.join(AKAR, 'data');

function muatEnv() {
  for (const nama of ['.env.local', '.env']) {
    const berkas = path.join(AKAR, nama);
    if (!fs.existsSync(berkas)) continue;
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(baris);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
}
muatEnv();

const arg = process.argv.slice(2);
const opsi = (n, bawaan) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : bawaan; };
const JALANKAN = arg.includes('--jalankan');
const MODE = opsi('--mode', 'kosong');
const ALAMAT = opsi('--alamat', process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
const POTONG = opsi('--potong', new Date().toISOString().slice(0, 10));

if (!['induk', 'kosong', 'penuh'].includes(MODE)) {
  console.error('\n--mode harus "induk", "kosong", atau "penuh".\n'); process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(POTONG)) {
  console.error('\n--potong harus berformat YYYY-MM-DD.\n'); process.exit(2);
}
if (!ALAMAT) {
  console.error('\nAlamat PostgreSQL belum ada. Pakai --alamat "postgres://..."');
  console.error('atau setel DATABASE_URL di .env.local.\n'); process.exit(2);
}

function berkasTerbaru() {
  if (!fs.existsSync(DIR)) return null;
  const d = fs.readdirSync(DIR).filter((f) => /^ekspor-redis-.*\.json$/.test(f)).sort();
  return d.length ? path.join(DIR, d[d.length - 1]) : null;
}
const bArg = opsi('--berkas', null);
const BERKAS = bArg ? (path.isAbsolute(bArg) ? bArg : path.join(AKAR, bArg)) : berkasTerbaru();
if (!BERKAS || !fs.existsSync(BERKAS)) {
  console.error('\nBerkas ekspor tidak ditemukan. Jalankan dulu: node tools/ekspor-redis.js\n');
  process.exit(2);
}

let Client;
try { ({ Client } = require('pg')); } catch (e) {
  console.error('\nPustaka "pg" belum terpasang. Jalankan:  npm install pg\n'); process.exit(2);
}

// ------------------------------------------------------------------ bantuan
const skemaLaz = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/* Angka dari data lama bisa berupa number, "1.500.000", atau "Rp 1.500.000".
   Yang TIDAK boleh terjadi: nilai yang tidak terbaca diam-diam jadi 0, karena
   nol di kolom nominal terlihat seperti transaksi yang memang nol rupiah. */
function keAngka(v, jejak, galat) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) { galat.push(jejak + ': angka tidak wajar (' + v + ')'); return 0; }
    return v;
  }
  const s = String(v).replace(/[Rr][Pp]\.?\s*/g, '').replace(/\s/g, '');
  /* Titik sebagai pemisah ribuan, koma sebagai desimal, kebiasaan Indonesia. */
  const bersih = s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(bersih);
  if (!Number.isFinite(n)) { galat.push(jejak + ': "' + v + '" bukan angka'); return 0; }
  return n;
}

function keTanggal(v, jejak, galat) {
  const s = String(v || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    if (!isNaN(d.getTime())) return s;
  }
  galat.push(jejak + ': tanggal "' + v + '" tidak bisa dibaca');
  return null;
}

function keWaktu(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function keBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v == null ? '' : v).toLowerCase();
  if (['false', '0', 'tidak', 'nonaktif', ''].includes(s)) return s === '' ? true : false;
  return true;
}

/* Lembar di JSON lama berbentuk larik-of-larik dengan baris pertama sebagai
   judul kolom. Diubah jadi objek supaya kolomnya dipanggil dengan nama. */
function keObjek(lembar) {
  if (!Array.isArray(lembar) || !lembar.length) return [];
  const kepala = lembar[0];
  return lembar.slice(1).map((baris) => {
    const o = {};
    kepala.forEach((k, i) => { o[k] = baris[i]; });
    return o;
  });
}

// ------------------------------------------------------------------ mulai
(async () => {
  console.log('\n' + (JALANKAN ? '>>> MODE JALANKAN' : '>>> MODE SIMULASI (tambahkan --jalankan untuk benar-benar mengimpor)'));
  console.log('Berkas  : ' + path.basename(BERKAS));
  console.log('Mode    : ' + MODE + (MODE === 'induk' ? '  (hanya data induk; transaksi DAN saldo awal dikosongkan)'
    : MODE === 'kosong' ? '  (transaksi mulai bersih, saldo dibawa)' : '  (semua transaksi ikut)'));
  console.log('Potong  : ' + POTONG);

  const ekspor = JSON.parse(fs.readFileSync(BERKAS, 'utf8'));
  const kunci = ekspor.kunci || {};

  /* Pagar pertama: berkas yang tercemar galat tidak boleh dipakai sebagai
     sumber pemindahan. Lebih baik berhenti sekarang daripada mengimpor
     kalimat "max requests limit exceeded" ke dalam basis data keuangan. */
  const tercemar = Object.entries(kunci)
    .filter(([, v]) => (v && v.nilai && v.nilai.__galat) || (v && v.tipe && v.tipe.__galat))
    .map(([k]) => k);
  if (tercemar.length) {
    /* Apakah yang tercemar cuma data modul, atau buku besarnya juga?
       Bedanya menentukan: laz:db tercemar berarti pemindahan tidak mungkin
       dilanjutkan sama sekali, sedangkan ai:*, blast:*, dan fund:* adalah
       riwayat percakapan AI, setelan broadcast, dan daftar kontak. Itu bisa
       diisi ulang dari aplikasi, dan tidak ada satu rupiah pun di dalamnya. */
    const kunciInti = tercemar.filter((k) => k === 'laz:db' || k === 'laz:ver'
      || k.indexOf('laz:cadangan') === 0);
    console.error('\nDIHENTIKAN: ' + tercemar.length + ' kunci di berkas ekspor berisi pesan galat, bukan data.');
    console.error('Contoh: ' + tercemar.slice(0, 3).join(', '));

    if (kunciInti.length) {
      console.error('\nYang tercemar termasuk BUKU BESAR atau cadangannya: ' + kunciInti.slice(0, 5).join(', '));
      console.error('Ini tidak boleh dilewati. Ambil ulang dulu:');
      console.error('  node tools/ekspor-redis.js --lanjut ' + path.relative(AKAR, BERKAS) + '\n');
      process.exit(1);
    }

    /* Ringkas per awalan, supaya kelihatan modul mana yang terdampak tanpa
       harus membaca 200 nama kunci. */
    const perModul = {};
    tercemar.forEach((k) => { const a = k.split(':')[0]; perModul[a] = (perModul[a] || 0) + 1; });
    console.error('\nSemuanya data modul, bukan buku besar:');
    Object.entries(perModul).sort().forEach(([a, n]) =>
      console.error('  ' + (a + ':*').padEnd(12) + String(n).padStart(5) + ' kunci'));

    if (!arg.includes('--lewati-kunci-rusak')) {
      console.error('\nDua pilihan:');
      console.error('  1. Ambil ulang kunci yang gagal (butuh kuota Upstash sudah berulang):');
      console.error('       node tools/ekspor-redis.js --lanjut ' + path.relative(AKAR, BERKAS));
      console.error('  2. Lanjutkan tanpa kunci-kunci itu:');
      console.error('       tambahkan --lewati-kunci-rusak');
      console.error('     Yang hilang: riwayat percakapan AI, setelan Broadcast, dan daftar');
      console.error('     kontak. Semuanya bisa diisi ulang dari aplikasi. Buku besar,');
      console.error('     donatur, pengguna, dan saldo TIDAK terpengaruh.\n');
      process.exit(1);
    }

    /* Dibuang, bukan diimpor. Kunci yang isinya pesan galat lebih buruk
       daripada kunci yang tidak ada: yang tidak ada akan dibuat ulang oleh
       aplikasinya sendiri dengan nilai bawaan. */
    tercemar.forEach((k) => { delete kunci[k]; });
    console.error('--lewati-kunci-rusak dipakai: ' + tercemar.length + ' kunci dibuang, tidak diimpor.\n');
  }
  if (!kunci['laz:db'] || !kunci['laz:db'].nilai) {
    console.error('\nDIHENTIKAN: laz:db tidak ada di berkas ekspor.\n'); process.exit(1);
  }

  const dbLama = JSON.parse(kunci['laz:db'].nilai);
  const lembar = dbLama.sheets || {};

  /* ---------------------------------------------------------- pagar tanggal potong
     Di mode kosong, TIDAK ADA satu pun transaksi yang dibawa: yang dibawa hanya
     hasil hitungan saldo sampai tanggal potong. Artinya transaksi yang
     tanggalnya SESUDAH tanggal potong tidak masuk ke saldo awal, dan tidak
     masuk ke tabel transaksi juga. Uangnya hilang, tanpa satu pun pesan galat,
     dan baru ketahuan saat ada yang bertanya kenapa saldonya kurang.

     Karena itu tanggal potong tidak boleh lebih awal daripada transaksi
     terakhir yang tercatat. Kalau lebih awal, skrip ini berhenti dan
     menyebutkan persis apa yang akan hilang. */
  if (MODE === 'kosong') {
    const tabelTgl = [['Penghimpunan', 'jumlah'], ['Pentasyarufan', 'jumlah'],
      ['UangMuka', 'nominal'], ['Transfer', 'nominal'], ['Mutasi', 'nominal']];
    const sesudah = [];
    let adaSisa = false;
    for (const [nama, kolNominal] of tabelTgl) {
      const isi = keObjek(lembar[nama] || []);
      const lewat = isi.filter((r) => String(r.tanggal || '').slice(0, 10) > POTONG);
      const terakhir = isi.reduce((m, r) => {
        const t = String(r.tanggal || '').slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(t) && t > m ? t : m;
      }, '');
      if (lewat.length) {
        adaSisa = true;
        const jml = lewat.reduce((n, r) => n + (Number(String(r[kolNominal] == null ? 0 : r[kolNominal])
          .replace(/[^0-9.-]/g, '')) || 0), 0);
        sesudah.push({ nama, jumlah: lewat.length, nominal: jml, terakhir });
      }
    }

    if (adaSisa) {
      console.error('\nDIHENTIKAN: ada transaksi yang tanggalnya SESUDAH ' + POTONG + '.');
      console.error('Di mode kosong, transaksi itu tidak dibawa ke mana pun: tidak masuk saldo');
      console.error('awal, dan tidak masuk tabel transaksi. Uangnya akan hilang diam-diam.\n');
      for (const x of sesudah) {
        console.error('  ' + x.nama.padEnd(16) + String(x.jumlah).padStart(6) + ' transaksi  '
          + rupiah(x.nominal).padStart(20) + '   terakhir ' + x.terakhir);
      }
      const paling = sesudah.map((x) => x.terakhir).sort().pop();
      console.error('\nPilihan:');
      console.error('  1. Pakai tanggal potong yang mencakup semuanya:');
      console.error('       --potong ' + paling);
  console.error('  2. Kalau transaksi itu MEMANG mau dibuang, tambahkan --abaikan-sisa');
      console.error('     (baca lagi daftar di atas sebelum memilih ini).\n');
      if (!arg.includes('--abaikan-sisa')) process.exit(1);
      console.error('--abaikan-sisa dipakai: transaksi di atas SENGAJA dibuang.\n');
    }
  }

  // ---------------------------------------------------------- saldo awal
  let saldo = null;
  if (MODE === 'kosong') {
    console.log('\nMenghitung saldo per ' + POTONG + ' memakai rumus aplikasinya sendiri...');
const engine = require(path.join(AKAR, 'api', '_engine.js'));

    /* Salinan di memori, bukan data aslinya: runRPC memanggil setup() yang
       menambah tabel dan nilai bawaan, dan itu tidak boleh mengubah berkas
       ekspor kita. */
    const salinan = JSON.parse(JSON.stringify(dbLama));
    const pengguna = keObjek(salinan.sheets.Users || []);
    const super_ = pengguna.find((u) => String(u.role).toLowerCase() === 'superadmin') || pengguna[0];
    if (!super_) { console.error('\nDIHENTIKAN: tidak ada pengguna di data lama, saldo tidak bisa dihitung.\n'); process.exit(1); }

    /* Sesi sementara untuk melewati pemeriksaan izin. Hanya ada di salinan
       memori ini dan tidak pernah ikut terimpor. */
    const token = 'migrasi-' + Date.now();
    const kepalaSesi = (salinan.sheets.Sessions && salinan.sheets.Sessions[0]) || ['token', 'userId', 'expired'];
    salinan.sheets.Sessions = [kepalaSesi, [token, super_.id, new Date(Date.now() + 3600e3).toISOString()]];

    const keluar = await engine.runRPC(salinan, 'apiSaldo', [token, POTONG], {});
    saldo = keluar.result;
    console.log('  ' + saldo.perAkun.length + ' akun, total kas & bank ' + rupiah(saldo.totalKasBank)
      + ', uang muka ' + rupiah(saldo.totalUmp));
    if (!saldo.adaSaldoAwal) {
      console.log('  Catatan: tabel SaldoAwal lama memang kosong, jadi angka di atas murni');
      console.log('  pergerakan sejak 1 Januari ' + POTONG.slice(0, 4) + ' sampai tanggal potong.');
    }
  }

  // ---------------------------------------------------------- susun baris
  const galat = [];
  const baris = {};
  const ambil = (nama) => keObjek(lembar[nama] || []);

  baris.Users = ambil('Users').map((r) => [
    r.id, r.username, r.passwordHash || null, r.salt || null, r.nama || null, r.role || null,
    (() => { try { return typeof r.permissions === 'string' ? JSON.parse(r.permissions || '{}') : (r.permissions || {}); } catch (e) { return {}; } })(),
    keBool(r.aktif), keWaktu(r.dibuat), r.layanan || null,
  ]);
  baris.Rekening = ambil('Rekening').map((r) => [
    r.id, r.namaBank || null, r.nomor || null, r.atasNama || null, r.fundGroup || null,
    keBool(r.aktif), keWaktu(r.dibuat),
  ]);
  baris.Layanan = ambil('Layanan').map((r) => [
    r.id, r.tipe || null, r.kode || null, r.nama || null, r.wilayah || null,
    r.penanggungJawab || null, r.telepon || null, keBool(r.aktif), keWaktu(r.dibuat),
  ]);
  baris.Donatur = ambil('Donatur').map((r) => [
    r.id, r.nama || '', r.kategori || null, r.telepon || null, r.alamat || null, r.email || null, keWaktu(r.dibuat),
  ]);
  baris.Settings = ambil('Settings').map((r) => [r.key, r.value == null ? null : String(r.value)]);

  if (MODE === 'penuh') {
    baris.Penghimpunan = ambil('Penghimpunan').map((r, i) => [
      r.id, r.noKwitansi || null, keTanggal(r.tanggal, 'Penghimpunan baris ' + (i + 2), galat),
      r.jenisDana || null, r.subJenis || null, r.pilar || null, r.program || null,
      r.namaDonatur || null, r.tipeDonatur || null, r.layananId || null, r.telepon || null,
      r.email || null, r.alamat || null, keAngka(r.jumlah, 'Penghimpunan baris ' + (i + 2) + ' jumlah', galat),
      r.metode || null, r.rekeningId || null, r.bank || null, r.statusBayar || null,
      r.atasNama || null, r.keterangan || null, r.petugas || null, keWaktu(r.dibuat),
      r.fundraising || null, r.akunKredit || null,
    ]);
    baris.Pentasyarufan = ambil('Pentasyarufan').map((r, i) => [
      r.id, r.noBukti || null, keTanggal(r.tanggal, 'Pentasyarufan baris ' + (i + 2), galat),
      r.ashnaf || null, r.program || null, r.sumberDana || null, r.namaPenerima || null,
      r.nik || null, r.telepon || null, r.alamat || null,
      keAngka(r.jumlah, 'Pentasyarufan baris ' + (i + 2) + ' jumlah', galat),
      r.bentukBantuan || null, r.metode || null, r.statusSalur || null, r.petugas || null,
      r.keterangan || null, keWaktu(r.dibuat), r.fundraising || null, r.rekeningId || null,
      r.bank || null, r.section || null,
    ]);
    baris.UangMuka = ambil('UangMuka').map((r, i) => [
      r.id, keTanggal(r.tanggal, 'UangMuka baris ' + (i + 2), galat), r.jenis || null, r.dana || null,
      r.layanan || null, r.akun || null, r.rekeningId || null, r.kasNama || null,
      keAngka(r.nominal, 'UangMuka baris ' + (i + 2) + ' nominal', galat),
      r.keterangan || null, r.section || null, r.petugas || null, keWaktu(r.dibuat),
    ]);
    baris.Transfer = ambil('Transfer').map((r, i) => [
      r.id, keTanggal(r.tanggal, 'Transfer baris ' + (i + 2), galat), r.jenis || null,
      r.dariAkun || null, r.dariRekeningId || null, r.dariKas || null,
      r.keAkun || null, r.keRekeningId || null, r.keKas || null,
      keAngka(r.nominal, 'Transfer baris ' + (i + 2) + ' nominal', galat),
      r.keterangan || null, r.section || null, r.petugas || null, keWaktu(r.dibuat),
    ]);
    baris.Mutasi = ambil('Mutasi').map((r, i) => [
      r.id, keTanggal(r.tanggal, 'Mutasi baris ' + (i + 2), galat), r.deskripsi || null,
      r.tipe || null, keAngka(r.nominal, 'Mutasi baris ' + (i + 2) + ' nominal', galat), keWaktu(r.dibuat),
    ]);
    baris.SaldoAwal = ambil('SaldoAwal').map((r, i) => [
      r.id, String(r.tahun || ''), r.jenis || null, r.akun || null, r.rekeningId || null,
      r.kasNama || null, r.dana || null, keAngka(r.nominal, 'SaldoAwal baris ' + (i + 2), galat),
      r.keterangan || null, keWaktu(r.dibuat), r.oleh || null,
    ]);
    baris.AuditLog = ambil('AuditLog').map((r) => [
      keWaktu(r.waktu) || new Date(0).toISOString(), r.userId || null, r.username || null,
      r.aksi || null, r.modul || null, r.entitasId || null, r.ringkas || null,
      r.detail || null, r.ip || null, r.ua || null,
    ]);
  } else if (MODE === 'induk') {
    /* Mode induk: tabel transaksi bersih, DAN SaldoAwal bersih. Tidak ada
       angka uang yang dibawa sama sekali, jadi tidak ada angka keliru yang
       bisa terkunci di sistem baru. Saldo awalnya diisi lewat aplikasinya
       sendiri, dari rekening koran. */
    baris.SaldoAwal = [];
  } else {
    /* Mode kosong: tabel transaksi dibiarkan bersih, dan hasil hitungan saldo
       ditulis sebagai baris SaldoAwal untuk tahun tanggal potong. */
    const tahun = POTONG.slice(0, 4);
    const kini = new Date().toISOString();
    const ket = 'Saldo pindahan dari sistem lama per ' + POTONG;
    let n = 0;
    const id = () => 'mig' + String(++n).padStart(4, '0');

    baris.SaldoAwal = [];
    for (const a of saldo.perAkun) {
      if (!a.saldo) continue;                       // nol tidak perlu dicatat
      baris.SaldoAwal.push([
        id(), tahun, '', a.label || a.kode,
        a.rekeningId || null, a.kasNama || null, a.dana || null,
        a.saldo, ket, kini, 'migrasi',
      ]);
    }
    for (const [dana, u] of Object.entries(saldo.ump.perDana || {})) {
      if (!u || !u.sisa) continue;
      baris.SaldoAwal.push([
        id(), tahun, 'ump', 'Uang Muka Program', null, null, dana,
        u.sisa, ket + ' (uang muka program)', kini, 'migrasi',
      ]);
    }
    baris.Penghimpunan = []; baris.Pentasyarufan = []; baris.UangMuka = [];
    baris.Transfer = []; baris.Mutasi = []; baris.AuditLog = [];
  }

  /* Sessions tidak pernah ikut, mode apa pun: token lama tidak berguna di
     basis data baru, dan membawanya berarti membawa sesi yang masih berlaku
     ke tempat yang belum tentu sama amannya. Semua orang login ulang. */

  // ---------------------------------------------------------- kunci modul
  const kvBaris = [], kvSetBaris = [];
  for (const [k, v] of Object.entries(kunci)) {
    if (k.startsWith('laz:')) continue;             // buku besar & cadangan
    const kedaluwarsa = (v.ttl && v.ttl > 0) ? new Date(Date.now() + v.ttl * 1000).toISOString() : null;
    if (v.tipe === 'set') {
      for (const a of (v.nilai || [])) kvSetBaris.push([k, String(a)]);
    } else if (v.tipe === 'string') {
      kvBaris.push([k, String(v.nilai == null ? '' : v.nilai), kedaluwarsa]);
    } else {
      /* list, hash, zset: disimpan sebagai JSON. Modul yang memakainya
         membaca lewat lapisan sendiri, jadi bentuk ini cukup. */
      kvBaris.push([k, JSON.stringify(v.nilai), kedaluwarsa]);
    }
  }

  // ---------------------------------------------------------- laporan
  console.log('\n---------------- YANG AKAN MASUK ----------------');
  const urut = ['Users', 'Rekening', 'Layanan', 'Donatur', 'Settings', 'SaldoAwal',
    'Penghimpunan', 'Pentasyarufan', 'UangMuka', 'Transfer', 'Mutasi', 'AuditLog'];
  for (const t of urut) {
    const n = (baris[t] || []).length;
    const asli = Math.max(0, (lembar[t] || []).length - 1);
    let catatan = '';
    if (n === 0 && asli > 0 && (MODE === 'kosong' || MODE === 'induk')) {
      catatan = '   (dikosongkan, ' + asli + ' baris lama tidak dibawa)';
    }
    if (MODE === 'induk' && t === 'SaldoAwal') {
      catatan = '   (sengaja kosong; diisi sendiri lewat Pengaturan > Saldo Awal)';
    };
    console.log(t.padEnd(16) + String(n).padStart(7) + ' baris' + catatan);
  }
  console.log('kv'.padEnd(16) + String(kvBaris.length).padStart(7) + ' baris');
  console.log('kv_set'.padEnd(16) + String(kvSetBaris.length).padStart(7) + ' baris');

  if (MODE === 'induk') {
    console.log('\nSaldo awal TIDAK dibawa, sesuai mode induk.');
    console.log('Setelah deploy, isi lewat: Pengaturan > Saldo Awal, per rekening dan per kas,');
    console.log('pakai angka dari rekening koran dan penutupan tahun lalu.');
  }

  if (MODE === 'kosong') {
    console.log('\nSaldo awal yang dibawa:');
    for (const b of baris.SaldoAwal) console.log('  ' + String(b[3]).padEnd(30) + rupiah(b[7]).padStart(20));
    const total = baris.SaldoAwal.reduce((n2, b) => n2 + Number(b[7]), 0);
    console.log('  ' + 'TOTAL'.padEnd(30) + rupiah(total).padStart(20));
  }

  if (galat.length) {
    console.error('\nDIHENTIKAN: ' + galat.length + ' nilai tidak bisa dibaca.');
    galat.slice(0, 10).forEach((g) => console.error('  ' + g));
    if (galat.length > 10) console.error('  ... dan ' + (galat.length - 10) + ' lagi');
    console.error('\nTidak ada yang diimpor. Perbaiki datanya dulu, atau laporkan ini.\n');
    process.exit(1);
  }

  if (!JALANKAN) {
    console.log('\nSimulasi selesai, tidak ada yang ditulis.');
    console.log('Kalau angkanya masuk akal, ulangi dengan --jalankan\n');
    return;
  }

  // ---------------------------------------------------------- tulis
  const klien = new Client({ connectionString: ALAMAT });
  await klien.connect();
  try {
    console.log('\nMenerapkan skema...');
    await klien.query(fs.readFileSync(path.join(AKAR, 'sql', '01-skema.sql'), 'utf8'));

    /* SATU transaksi untuk seluruh isinya. Impor yang gagal di tengah dan
       meninggalkan separuh data jauh lebih sulit dibereskan daripada impor
       yang gagal utuh. */
    await klien.query('BEGIN');

    /* Daftar kolomnya diambil dari lib/laz-skema.js, definisi yang sama yang
       dipakai aplikasi saat berjalan. Dulu daftarnya disalin di berkas ini;
       satu kolom baru yang lupa ditambahkan di salinan itu berarti kolomnya
       ikut dipindahkan sebagai kosong, tanpa satu pun pesan galat. */
    const KOLOM = {};
    skemaLaz.NAMA_TABEL.forEach((t) => { if (t !== 'Sessions') KOLOM[t] = skemaLaz.kepala(t); });

    /* Dikirim per 500 baris. Satu INSERT raksasa menabrak batas 65.535
       parameter milik protokol PostgreSQL; satu INSERT per baris membuat
       4.332 perjalanan bolak-balik. */
    async function masuk(tabel, daftar) {
      if (!daftar.length) return;
      const kol = KOLOM[tabel];
      const kutip = kol.map((k) => '"' + k + '"').join(',');
      for (let i = 0; i < daftar.length; i += 500) {
        const potong = daftar.slice(i, i + 500);
        const nilai = [];
        const tanda = potong.map((b, j) => '(' + kol.map((_, c) => '$' + (j * kol.length + c + 1)).join(',') + ')');
        for (const b of potong) for (const x of b) nilai.push(x);
        await klien.query('INSERT INTO "' + tabel + '" (' + kutip + ') VALUES ' + tanda.join(',')
          + ' ON CONFLICT DO NOTHING', nilai);
      }
      console.log('  ' + tabel.padEnd(16) + String(daftar.length).padStart(7) + ' baris');
    }

    console.log('Mengimpor...');
    for (const t of urut) await masuk(t, baris[t] || []);

    for (let i = 0; i < kvBaris.length; i += 500) {
      const potong = kvBaris.slice(i, i + 500);
      const nilai = []; const tanda = [];
      potong.forEach((b, j) => { tanda.push('($' + (j * 3 + 1) + ',$' + (j * 3 + 2) + ',$' + (j * 3 + 3) + ')'); nilai.push(b[0], b[1], b[2]); });
      await klien.query('INSERT INTO kv (kunci,nilai,kedaluwarsa) VALUES ' + tanda.join(',')
        + ' ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, kedaluwarsa=EXCLUDED.kedaluwarsa, diubah=now()', nilai);
    }
    if (kvBaris.length) console.log('  ' + 'kv'.padEnd(16) + String(kvBaris.length).padStart(7) + ' baris');

    for (let i = 0; i < kvSetBaris.length; i += 500) {
      const potong = kvSetBaris.slice(i, i + 500);
      const nilai = []; const tanda = [];
      potong.forEach((b, j) => { tanda.push('($' + (j * 2 + 1) + ',$' + (j * 2 + 2) + ')'); nilai.push(b[0], b[1]); });
      await klien.query('INSERT INTO kv_set (kunci,anggota) VALUES ' + tanda.join(',') + ' ON CONFLICT DO NOTHING', nilai);
    }
    if (kvSetBaris.length) console.log('  ' + 'kv_set'.padEnd(16) + String(kvSetBaris.length).padStart(7) + ' baris');

    await klien.query(
      'INSERT INTO migrasi (mode, berkas, potong, catatan) VALUES ($1,$2,$3,$4)',
      [MODE, path.basename(BERKAS), POTONG, JSON.stringify({
        diambilPada: ekspor.mulai || null,
        totalKasBank: saldo ? saldo.totalKasBank : null,
        totalUmp: saldo ? saldo.totalUmp : null,
        jumlahKunciEkspor: Object.keys(kunci).length,
      })]);

    await klien.query('COMMIT');
    console.log('\nSELESAI. Periksa hasilnya dengan:');
    console.log('    node tools/banding-migrasi.js --alamat "..." \n');
  } catch (e) {
    try { await klien.query('ROLLBACK'); } catch (e2) {}
    console.error('\nGAGAL: ' + e.message);
    console.error('Semua perubahan dibatalkan; basis datanya kembali seperti sebelum skrip ini jalan.\n');
    process.exitCode = 1;
  } finally {
    await klien.end();
  }
})().catch((e) => { console.error('\nGAGAL:', e.message, '\n'); process.exit(1); });
