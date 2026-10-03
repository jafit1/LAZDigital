/* lib/laz-pg.js: buku besar LAZ Digital di atas PostgreSQL.
 *
 * APA YANG DIGANTIKAN. Sebelum ini seluruh basis data adalah SATU bongkah JSON
 * di kunci Redis laz:db. Membuka dasbor berarti mengunduh seluruh bongkah itu;
 * menyimpan satu kwitansi berarti menulis ulang seluruh bongkah itu. Pada 45 MB
 * dan ~4.300 transaksi, satu tab Broadcast yang dibiarkan terbuka sudah cukup
 * untuk menghabiskan kuota 500.000 perintah per bulan.
 *
 * ================================================================
 * MASALAH YANG SEBENARNYA: ENGINE-NYA SINKRON
 * ================================================================
 * api/_engine.js adalah Google Apps Script yang dipindahkan apa adanya, 296 KB,
 * dan seluruh pembacaannya sinkron: readAll('Penghimpunan') mengembalikan
 * lariknya seketika, tanpa await. Tidak ada satu pun tempat di dalamnya untuk
 * menunggu jaringan. Jadi "muat kalau dibutuhkan" dengan Proxy async tidak
 * mungkin, dan menulis ulang engine-nya menjadi async berarti menyentuh ribuan
 * baris kode akuntansi yang sudah terbukti benar, risiko yang jauh lebih besar
 * daripada masalah yang sedang diselesaikan.
 *
 * Jalan yang dipakai: MUAT DULU, ULANGI KALAU KURANG.
 *
 *   1. Muat baris judul SEMUA tabel (13 baris, murah) plus isi tiga tabel kecil
 *      yang dipakai pada setiap permintaan: Users, Sessions, Settings.
 *   2. Jalankan fungsinya.
 *   3. Kalau engine menyentuh isi tabel yang belum dimuat, shim melempar galat
 *      khusus (lihat _perluLembar di api/_engine.js). Galat itu ditangkap di
 *      sini, tabelnya dimuat, dan fungsinya dijalankan ULANG dari awal.
 *   4. Daftar tabel yang ternyata dibutuhkan tiap fungsi DIINGAT (di memori
 *      proses dan di baris kv laz:lembar), jadi langkah 3 hampir tidak pernah
 *      terjadi lagi setelah pemanggilan pertama.
 *
 * Menjalankan ulang terdengar mahal, tapi yang diulang cuma perhitungan di
 * memori; yang mahal adalah perjalanan ke basis data, dan jumlahnya justru
 * berkurang. Fungsi yang cuma butuh Users (mis. login) tidak pernah menyentuh
 * tabel transaksi sama sekali.
 *
 * ================================================================
 * MENYIMPAN: SELISIH BARIS, BUKAN TULIS ULANG
 * ================================================================
 * Setiap tabel yang dimuat disalin dulu (potret). Setelah fungsinya selesai,
 * isi tabel dibandingkan dengan potretnya per baris, dikunci kolom id:
 *
 *   ada di baru, tidak ada di lama  -> INSERT
 *   ada di keduanya tapi berbeda    -> UPDATE
 *   ada di lama, hilang di baru     -> DELETE
 *
 * Menyimpan satu kwitansi baru menjadi SATU INSERT. Tabel yang hanya dimuat
 * baris judulnya tidak mungkin punya baris yang diubah atau dihapus (engine
 * tidak pernah melihatnya), jadi yang ada di sana pasti baris tambahan.
 *
 * ================================================================
 * DUA PENULIS SEKALIGUS
 * ================================================================
 * Versi Redis memakai skrip Lua: tulis hanya bila nomor versi belum berubah.
 * Di sini padanannya satu baris kv laz:ver yang dikunci SELECT ... FOR UPDATE di
 * dalam transaksi penyimpanan. Kalau nomornya sudah berubah, penyimpanan
 * ditolak dan pemanggil mengulang dari data terbaru, persis perilaku lama,
 * sehingga perubahan petugas lain tidak tertimpa.
 *
 * Tambahan yang tidak ada di versi lama: satu gerbang antrean di dalam proses
 * (gerbang()). api/_engine.js menyimpan basis datanya di variabel tingkat modul
 * dan runRPC async, jadi dua permintaan yang dilayani satu instance bisa saling
 * menimpa DB di tengah jalan. Itu sudah berlaku sejak sebelum pemindahan ini;
 * di sini sekalian ditutup.
 */
'use strict';

const kv = require('./kv-postgres.js');
const skema = require('./laz-skema.js');

const DASAR = ['Users', 'Sessions', 'Settings'];
const K_VERSI = 'laz:ver';
const K_PROPS = 'laz:props';
const K_PETUNJUK = 'laz:lembar';
const K_CVER = 'laz:cver';
/* Tabel yang isinya TIDAK memengaruhi hasil bacaan buku besar: log aktivitas
   dan sesi login. Perubahan yang hanya menyentuh keduanya tidak menggugurkan
   hasil bacaan yang sudah diingat (lihat HASIL BACAAN DIINGAT di bawah). */
const TABEL_ABAIKAN = new Set(['AuditLog', 'Sessions']);
const MAKS_PUTARAN = 24;            /* cukup untuk 13 tabel + bentrok versi */

function pakaiPostgres() { return kv.pakaiPostgres(); }

/* ---------------------------------------------------------------- galat khusus */
class PerluLembar extends Error {
  constructor(nama) {
    super('Tabel "' + nama + '" belum dimuat.');
    this.lembar = nama;
    this.perluLembar = true;
  }
}

/* MENGENALI PerluLembar YANG SUDAH DIBUNGKUS ORANG LAIN.
 *
 * KEGAGALAN YANG DIPERBAIKI DI SINI PERNAH TERJADI, DAN BENTUKNYA MENIPU.
 * Impor jurnal berhenti dengan pesan:
 *
 *     Gagal memproses teks: Tabel "Penghimpunan" belum dimuat.
 *
 * Padahal pemuatan bertahap ini justru dirancang supaya pesan itu TIDAK
 * pernah sampai ke layar: ia sinyal ke jalankanRPC agar memuat tabelnya lalu
 * mengulang. Yang terjadi, api/_engine.js membungkus galatnya
 *
 *     catch (e) { throw new Error('Gagal memproses teks: ' + e.message); }
 *
 * dan bungkus itu membuang medan perluLembar. Sinyalnya hilang, pengulangan
 * tidak pernah terjadi, dan impor gagal untuk alasan yang sebenarnya sudah
 * ada penanganannya.
 *
 * Membetulkan satu baris catch itu saja tidak cukup: ada tiga puluh dua catch
 * lain di berkas yang sama, dan yang berikutnya akan mengulangi kesalahan
 * yang sama tanpa ada yang sadar. Jadi yang diperbaiki pengenalannya: kalau
 * medannya hilang, nama tabelnya masih tertinggal di dalam PESAN, dan itu
 * sudah cukup untuk memulihkan sinyalnya. Rantai penyebab (e.cause) ikut
 * ditelusuri, karena pembungkus yang lebih baru memakai itu.
 */
const POLA_PERLU = /Tabel "([^"]+)" belum dimuat/;
function lembarDari(e) {
  for (let g = e, n = 0; g && n < 6; g = g.cause, n++) {
    if (g.perluLembar && g.lembar) return g.lembar;
    const c = POLA_PERLU.exec(String((g && g.message) || ''));
    if (c) return c[1];
  }
  return '';
}

/* ---------------------------------------------------------------- petunjuk */
/* Daftar tabel yang ternyata dibutuhkan tiap fungsi. Disimpan di kv supaya
   instance yang baru dingin tidak perlu belajar dari nol lagi. */
let petunjuk = null;
let petunjukKotor = false;

async function ambilPetunjuk(klien) {
  if (petunjuk) return petunjuk;
  petunjuk = {};
  try {
    const r = await klien.query('SELECT nilai FROM kv WHERE kunci=$1', [K_PETUNJUK]);
    if (r.rows.length) petunjuk = JSON.parse(r.rows[0].nilai) || {};
  } catch (e) { petunjuk = {}; }
  return petunjuk;
}

function catatPetunjuk(fn, nama) {
  if (!petunjuk) petunjuk = {};
  const d = petunjuk[fn] || (petunjuk[fn] = []);
  if (!d.includes(nama)) { d.push(nama); petunjukKotor = true; }
}

/* ---------------------------------------------------------------- memuat */
/* Satu perjalanan untuk semuanya: nilai kv yang dibutuhkan, jumlah baris tiap
   tabel, lalu isi tabel yang diminta. Beberapa pernyataan dalam satu query
   dijalankan PostgreSQL sebagai satu transaksi tersirat, jadi potretnya
   konsisten: tidak mungkin Penghimpunan terbaca sebelum dan Rekening sesudah
   petugas lain menyimpan. */
/* PostgreSQL tidak menjanjikan urutan baris tanpa ORDER BY, dan urutan itu
   TERLIHAT: daftar rekening, daftar layanan, dan daftar donatur ditampilkan apa
   adanya oleh aplikasi. Tanpa urutan yang pasti, daftar yang sama bisa tampil
   berbeda pada dua kali pembukaan tanpa ada yang mengubah apa pun. Diurutkan
   mendekati urutan pemasukan: kolom dibuat kalau ada, lalu kunci sebagai
   penentu akhir supaya hasilnya tidak pernah ambigu. */
function urutan(tabel) {
  const def = skema.TABEL[tabel];
  const punya = (n) => def.kolom.some(([k]) => k === n);
  const bagian = [];
  if (punya('dibuat')) bagian.push('"dibuat" NULLS FIRST');
  else if (punya('waktu')) bagian.push('"waktu"');
  else if (punya('tanggal')) bagian.push('"tanggal"');
  bagian.push(def.kunci ? '"' + def.kunci + '"' : '"id"');
  return bagian.join(', ');
}

async function muat(klien, tambahan) {
  const diminta = [];
  for (const t of DASAR.concat(tambahan || [])) {
    if (skema.TABEL[t] && !diminta.includes(t)) diminta.push(t);
  }

  const hitung = skema.NAMA_TABEL
    .map((t) => "SELECT '" + t + "' AS t, count(*)::int AS n FROM \"" + t + '"')
    .join(' UNION ALL ');

  const bagian = [
    "SELECT kunci, nilai FROM kv WHERE kunci IN ('" + [K_VERSI, K_PROPS, K_PETUNJUK, K_CVER].join("','") + "')",
    hitung,
  ].concat(diminta.map((t) => 'SELECT * FROM "' + t + '" ORDER BY ' + urutan(t)));

  const hasil = await klien.query(bagian.join(';'));
  const daftar = Array.isArray(hasil) ? hasil : [hasil];

  const petaKv = {};
  (daftar[0].rows || []).forEach((r) => { petaKv[r.kunci] = r.nilai; });
  const jumlahSemua = {};
  (daftar[1].rows || []).forEach((r) => { jumlahSemua[r.t] = Number(r.n) || 0; });

  if (!petunjuk) {
    try { petunjuk = petaKv[K_PETUNJUK] ? (JSON.parse(petaKv[K_PETUNJUK]) || {}) : {}; }
    catch (e) { petunjuk = {}; }
  } else if (!petaKv[K_PETUNJUK] && Object.keys(petunjuk).length) {
    /* Daftarnya hilang dari basis data (basis data baru, atau dibersihkan)
       sementara proses ini masih mengingatnya. Ditulis ulang pada penyimpanan
       berikutnya, supaya proses lain tidak perlu belajar dari nol lagi. */
    petunjukKotor = true;
  }

  let props = {};
  try { props = petaKv[K_PROPS] ? (JSON.parse(petaKv[K_PROPS]) || {}) : {}; } catch (e) { props = {}; }

  const db = { sheets: {}, props: props };
  const lengkap = new Set();
  const jumlah = {};

  /* Semua tabel hadir minimal sebagai baris judul. Ini yang membuat
     ensureSheet() di setup() tidak pernah mencoba membuat tabel baru, dan
     getSheetByName() tidak pernah mengembalikan null untuk tabel yang ada. */
  for (const t of skema.NAMA_TABEL) {
    db.sheets[t] = [skema.kepala(t)];
    jumlah[t] = jumlahSemua[t] || 0;
  }

  diminta.forEach((t, i) => {
    const kepala = skema.kepala(t);
    const tipe = skema.tipeKolom(t);
    const baris = (daftar[2 + i].rows || []).map((r) => kepala.map((k) => skema.keMesin(tipe[k], r[k])));
    db.sheets[t] = [kepala].concat(baris);
    lengkap.add(t);
    jumlah[t] = 0;
  });

  /* Potret: dasar pembanding saat menyimpan. Disalin dalam, karena engine
     mengubah lariknya di tempat. */
  const potret = {};
  for (const t of skema.NAMA_TABEL) potret[t] = db.sheets[t].slice(1).map((b) => b.slice());

  /* Penanda "isi buku besar", terpisah dari nomor versi. Nomor versi naik pada
     SETIAP penyimpanan, termasuk catatan "siapa membuka apa" yang ditulis tiap
     lima menit per orang per halaman; penanda ini hanya berganti kalau isi
     sungguhan berubah. Pasangan {c, v} ditulis dalam transaksi yang sama dengan
     nomor versinya: kalau v tidak sama dengan nomor versi sekarang, ada penulis
     lain yang tidak memperbaruinya (mis. instance dari deploy lama), dan penanda
     TIDAK dipercaya; dipakai nomor versi itu sendiri. */
  const versiTeks = String(petaKv[K_VERSI] || '0');
  let pasang = null;
  try { pasang = petaKv[K_CVER] ? JSON.parse(petaKv[K_CVER]) : null; } catch (e) { pasang = null; }
  const cverSah = (pasang && String(pasang.v) === versiTeks) ? String(pasang.c) : '';

  return {
    db: db,
    teks: JSON.stringify(db),
    versi: versiTeks,
    cver: cverSah,
    kunciCache: cverSah ? 'c' + cverSah : 'v' + versiTeks,
    potret: potret,
    props: JSON.stringify(props),
    lengkap: lengkap,
    jumlah: jumlah,
    /* diminta: daftar tabel yang sempat diminta engine. Galat PerluLembar saja
       tidak cukup sebagai penanda, karena api/_engine.js punya beberapa
       try{}catch{} lebar (mis. pendaftaran donatur otomatis dan pencatatan
       akses) yang akan MENELAN galatnya. Kalau itu terjadi, fungsinya selesai
       dengan diam-diam melewatkan pekerjaan: donatur tidak terdaftar dan tidak
       ada yang tahu. Karena itu nama tabelnya dicatat di larik ini sebelum
       dilempar, dan pemanggil memeriksa larik ini setelah fungsinya selesai,
       bukan hanya menangkap galatnya. */
    lambat: {
      lengkap: lengkap,
      jumlah: jumlah,
      diminta: [],
      minta(n) { if (!this.diminta.includes(n)) this.diminta.push(n); throw new PerluLembar(n); },
    },
  };
}

/* ---------------------------------------------------------------- selisih */
/* Perbandingan baris dilakukan pada nilai yang SUDAH diterjemahkan ke bentuk
   tabel. Alasannya: engine kadang menulis 1500000 sebagai angka dan kadang
   sebagai teks "1500000", dan keduanya adalah nilai yang sama di kolom
   numeric. Membandingkan bentuk mentahnya akan menghasilkan UPDATE palsu pada
   setiap permintaan. */
function kunciNilai(v) {
  if (v === null || v === undefined) return '\u0000';
  if (typeof v === 'number') return 'n:' + v;
  if (typeof v === 'boolean') return 'b:' + v;
  return 's:' + v;
}
function cap(nilai) { return nilai.map(kunciNilai).join('\u0001'); }

function selisihTabel(tabel, kepalaBaris, lama, baru, lengkap) {
  const def = skema.TABEL[tabel];
  const kolKunci = def.kunci;
  const tambah = [], ubah = [], hapus = [];

  /* Tabel tanpa kolom kunci (AuditLog): hanya ditambah di ujung dan dipangkas
     dari depan. Kalau isinya berubah selain penambahan, seluruh tabel ditulis
     ulang; itu jarang (pemangkasan dan "hapus semua log") dan jauh lebih mudah
     dipertanggungjawabkan daripada mencocokkan baris tanpa identitas. */
  if (!kolKunci) {
    if (!lengkap) return { tambah: baru.map((b) => skema.barisKeTabel(tabel, kepalaBaris, b)), ubah, hapus, kosongkan: false };
    const awalanSama = baru.length >= lama.length
      && lama.every((b, i) => cap(skema.barisKeTabel(tabel, kepalaBaris, b)) === cap(skema.barisKeTabel(tabel, kepalaBaris, baru[i])));
    if (awalanSama) {
      return { tambah: baru.slice(lama.length).map((b) => skema.barisKeTabel(tabel, kepalaBaris, b)), ubah, hapus, kosongkan: false };
    }
    return { tambah: baru.map((b) => skema.barisKeTabel(tabel, kepalaBaris, b)), ubah, hapus, kosongkan: true };
  }

  const iKunci = kepalaBaris.indexOf(kolKunci);
  if (iKunci < 0) throw new Error('Tabel ' + tabel + ': kolom kunci "' + kolKunci + '" tidak ada di baris judul.');

  const petaLama = new Map();
  if (lengkap) {
    for (const b of lama) {
      const k = String(b[iKunci] == null ? '' : b[iKunci]);
      if (k !== '') petaLama.set(k, cap(skema.barisKeTabel(tabel, kepalaBaris, b)));
    }
  }

  const terlihat = new Set();
  for (const b of baru) {
    const k = String(b[iKunci] == null ? '' : b[iKunci]);
    if (k === '') continue;                       /* baris tanpa kunci diabaikan */
    terlihat.add(k);
    const nilai = skema.barisKeTabel(tabel, kepalaBaris, b);
    if (!petaLama.has(k)) { tambah.push(nilai); continue; }
    if (petaLama.get(k) !== cap(nilai)) ubah.push(nilai);
  }
  if (lengkap) for (const k of petaLama.keys()) if (!terlihat.has(k)) hapus.push(k);

  return { tambah, ubah, hapus, kosongkan: false };
}

/* ---------------------------------------------------------------- menyimpan */
function sqlSisip(tabel, kol, baris, timpa) {
  const kutip = kol.map((k) => '"' + k + '"').join(',');
  const nilai = [];
  const tanda = baris.map((b, j) => '(' + kol.map((_, c) => '$' + (j * kol.length + c + 1)).join(',') + ')');
  for (const b of baris) for (const x of b) nilai.push(x);
  const def = skema.TABEL[tabel];
  let akhir = '';
  if (def.kunci && timpa) {
    const set = kol.filter((k) => k !== def.kunci).map((k) => '"' + k + '"=EXCLUDED."' + k + '"').join(',');
    akhir = ' ON CONFLICT ("' + def.kunci + '") DO UPDATE SET ' + set;
  }
  return { teks: 'INSERT INTO "' + tabel + '" (' + kutip + ') VALUES ' + tanda.join(',') + akhir, nilai };
}

/* Dikirim per potongan supaya tidak menabrak batas 65.535 parameter milik
   protokol PostgreSQL. 500 baris x 24 kolom = 12.000 parameter, aman. */
async function sisipBanyak(klien, tabel, baris, timpa) {
  const kol = skema.kepala(tabel);
  for (let i = 0; i < baris.length; i += 500) {
    const p = sqlSisip(tabel, kol, baris.slice(i, i + 500), timpa);
    await klien.query(p.teks, p.nilai);
  }
}

let sapuSesiTerakhir = 0;

/* Mengembalikan true bila tersimpan, false bila nomor versinya sudah berubah
   (petugas lain menulis lebih dulu); pemanggil mengulang dari data terbaru. */
async function simpan(klien, keadaan, db) {
  /* Kolom yang dikenal engine tapi tidak ada di tabel = data yang akan hilang
     tanpa jejak kalau dibiarkan. Diperiksa sebelum apa pun ditulis. */
  for (const t of skema.NAMA_TABEL) {
    const kepalaBaris = (db.sheets[t] || [[]])[0] || [];
    const sah = skema.kepala(t);
    const asing = kepalaBaris.filter((k) => k && sah.indexOf(k) < 0);
    if (asing.length) {
      throw new Error('Tabel ' + t + ' punya kolom yang belum ada di PostgreSQL: '
        + asing.join(', ') + '. Tambahkan kolomnya di sql/01-skema.sql lebih dulu.');
    }
  }
  const asingLembar = Object.keys(db.sheets).filter((n) => !skema.TABEL[n]);
  if (asingLembar.length) {
    throw new Error('Ada tabel yang tidak dikenal skema: ' + asingLembar.join(', ')
      + '. Tambahkan di sql/01-skema.sql dan lib/laz-skema.js.');
  }

  const rencana = [];
  for (const t of skema.NAMA_TABEL) {
    const lembar = db.sheets[t] || [skema.kepala(t)];
    const s = selisihTabel(t, lembar[0] || skema.kepala(t), keadaan.potret[t] || [],
      lembar.slice(1), keadaan.lengkap.has(t));
    if (s.tambah.length || s.ubah.length || s.hapus.length || s.kosongkan) rencana.push([t, s]);
  }

  /* Dibandingkan dengan POTRET teksnya, bukan dengan keadaan.db.props: objek itu
     sama persis (satu referensi) dengan db.props yang baru saja diubah engine,
     jadi perbandingannya akan selalu sama dan perubahan props tidak pernah
     tersimpan. */
  const propsBaru = JSON.stringify(db.props || {});
  const propsLama = keadaan.props;

  await klien.query('BEGIN');
  try {
    /* Kunci nomor versi. Barisnya dibuat lebih dulu bila belum ada, karena
       FOR UPDATE tidak mengunci baris yang tidak eksis. */
    await klien.query('INSERT INTO kv (kunci, nilai) VALUES ($1,$2) ON CONFLICT DO NOTHING', [K_VERSI, '0']);
    const rv = await klien.query('SELECT nilai FROM kv WHERE kunci=$1 FOR UPDATE', [K_VERSI]);
    const sekarang = String((rv.rows[0] || {}).nilai || '0');
    if (sekarang !== keadaan.versi) { await klien.query('ROLLBACK'); return false; }

    for (const [t, s] of rencana) {
      const def = skema.TABEL[t];
      if (s.kosongkan) await klien.query('DELETE FROM "' + t + '"');
      if (s.hapus.length) {
        for (let i = 0; i < s.hapus.length; i += 1000) {
          await klien.query('DELETE FROM "' + t + '" WHERE "' + def.kunci + '" = ANY($1::text[])',
            [s.hapus.slice(i, i + 1000)]);
        }
      }
      if (s.tambah.length) await sisipBanyak(klien, t, s.tambah, true);
      if (s.ubah.length) await sisipBanyak(klien, t, s.ubah, true);
    }

    if (propsBaru !== propsLama) {
      await klien.query(
        'INSERT INTO kv (kunci, nilai, diubah) VALUES ($1,$2,now()) '
        + 'ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, diubah=now()', [K_PROPS, propsBaru]);
    }
    if (petunjukKotor) {
      await klien.query(
        'INSERT INTO kv (kunci, nilai, diubah) VALUES ($1,$2,now()) '
        + 'ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, diubah=now()',
        [K_PETUNJUK, JSON.stringify(petunjuk || {})]);
      petunjukKotor = false;
    }

    const versiBaru = String(Number(keadaan.versi) + 1);
    await klien.query('UPDATE kv SET nilai=$2, diubah=now() WHERE kunci=$1', [K_VERSI, versiBaru]);

    /* Isi buku besar berubah? Hanya log aktivitas, sesi, dan catatan akses di
       props yang berubah berarti TIDAK: penandanya dibiarkan, jadi hasil bacaan
       yang diingat tetap sah. Selain itu penandanya jadi nomor versi baru. */
    const catatanSaja = Boolean(keadaan.cver)
      && rencana.every(([t]) => TABEL_ABAIKAN.has(t))
      && propsHanyaCatatan(propsLama, propsBaru);
    /* Nilainya ACAK, bukan nomor versi: nomor versi berulang kalau basis data
       dibuat ulang dari kosong (pemulihan, pindah proyek, uji), dan ingatan
       sebuah proses yang masih hidup akan menganggap isi baru sama dengan isi
       lama pada nomor yang sama. */
    const cBaru = catatanSaja ? keadaan.cver : require('crypto').randomBytes(8).toString('hex');
    await klien.query(
      'INSERT INTO kv (kunci, nilai, diubah) VALUES ($1,$2,now()) '
      + 'ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, diubah=now()',
      [K_CVER, JSON.stringify({ c: cBaru, v: versiBaru })]);
    keadaan.kunciBaru = 'c' + cBaru;

    /* Sesi kedaluwarsa dulu menumpuk di dalam bongkah JSON karena tidak ada
       yang membuangnya. Di sini satu DELETE berindeks, paling sering sekali
       per lima menit per proses. */
    if (Date.now() - sapuSesiTerakhir > 5 * 60 * 1000) {
      sapuSesiTerakhir = Date.now();
      await klien.query('DELETE FROM "Sessions" WHERE "expired" < now()');
    }

    await klien.query('COMMIT');
    return true;
  } catch (e) {
    try { await klien.query('ROLLBACK'); } catch (e2) {}
    throw e;
  }
}

/* Props yang berubah hanya di kunci catatan akses (_aksesTerakhir)? */
function propsHanyaCatatan(lamaTeks, baruTeks) {
  if (lamaTeks === baruTeks) return true;
  try {
    const l = JSON.parse(lamaTeks || '{}') || {}, b = JSON.parse(baruTeks || '{}') || {};
    delete l._aksesTerakhir; delete b._aksesTerakhir;
    return JSON.stringify(l) === JSON.stringify(b);
  } catch (e) { return false; }
}

/* ---------------------------------------------------------------- hasil bacaan diingat
 *
 * MASALAH YANG DIUKUR. Setiap pembukaan halaman memuat ulang ribuan baris dari
 * PostgreSQL dan menghitung ulang semuanya di engine, walau tidak ada yang
 * berubah sejak pembukaan sebelumnya. Di data tiruan 15.000 penghimpunan
 * (laptop, tanpa jarak jaringan): Dashboard 585 ms, Donatur 519 ms, Saldo KLL
 * 357 ms, Saldo 263 ms, daftar Penghimpunan 212 ms. Di Vercel lebih lambat lagi.
 *
 * YANG DILAKUKAN. Untuk beberapa fungsi baca murni, hasilnya diingat di memori
 * proses dengan kunci (fungsi, argumen termasuk token, hari WIB) dan penanda isi
 * buku besar (kunciCache). Pembukaan berikutnya cukup memuat tiga tabel kecil
 * (satu perjalanan), memeriksa izin SEPERTI BIASA lewat engine.cekIzin, lalu
 * menjawab dari ingatan kalau penandanya masih sama. Penandanya diperiksa ke
 * basis data pada SETIAP permintaan, jadi instance lain atau penulisan petugas
 * lain langsung menggugurkan ingatan yang basi; tidak ada masa berlaku yang
 * menebak-nebak.
 *
 * YANG TIDAK BOLEH HILANG. Catatan "siapa membuka apa" (AuditLog) ditulis
 * engine setelah tiap bacaan, dibatasi sekali per lima menit per orang per
 * halaman. Menjawab dari ingatan TIDAK boleh melewatkannya, jadi saat sudah
 * waktunya, catatan itu tetap ditulis (engine.catatAkses). Penulisan itu tidak
 * mengubah penanda isi, jadi tidak menggugurkan ingatan siapa pun.
 */
const BACA = {
  apiDashboard: ['dashboard', 'view'],
  apiListPenghimpunan: ['penghimpunan', 'view'],
  apiListPentasyarufan: ['pentasyarufan', 'view'],
  /* Bentuk padat (api/rpc.js mengalihkan ke sini bila klien memintanya): disimpan terpisah
     dari bentuk lama karena isinya memang berbeda. */
  apiListPenghimpunanPadat: ['penghimpunan', 'view'],
  apiListPentasyarufanPadat: ['pentasyarufan', 'view'],
  apiSaldo: ['saldo', 'view'],
  apiSaldoLayanan: ['saldokll', 'view'],
  apiGetDonaturAnalytics: ['penghimpunan', 'view'],
  apiListDonatur: ['penghimpunan', 'view'],
  apiGetRAPBData: ['dashboard', 'view'],
  apiLaporanHarian: ['laporan', 'view'],
};
const INGAT = new Map();
let ingatBesar = 0;
const INGAT_MAKS = Number(process.env.LAZ_INGAT_MAKS || 48e6);      /* huruf, bukan byte */
const INGAT_ENTRI_MAKS = Math.floor(INGAT_MAKS / 2);

class JsonMentah {
  constructor(teks) { this.teks = teks; }
}
function hariWIB() { return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); }
function kunciIngat(fn, args) { return fn + '\u0001' + JSON.stringify(args || []) + '\u0001' + hariWIB(); }
function ingatHasil(kunci, kv, teks) {
  if (typeof teks !== 'string' || teks.length > INGAT_ENTRI_MAKS) return;
  const lama = INGAT.get(kunci);
  if (lama) { ingatBesar -= lama.teks.length; INGAT.delete(kunci); }
  INGAT.set(kunci, { kv, teks });
  ingatBesar += teks.length;
  for (const [k, v] of INGAT) {                    /* Map mengingat urutan sisip: yang terdepan paling lama tak dipakai */
    if (ingatBesar <= INGAT_MAKS) break;
    INGAT.delete(k); ingatBesar -= v.teks.length;
  }
}
function lupakanIngatan() { INGAT.clear(); ingatBesar = 0; }

/* ---------------------------------------------------------------- gerbang */
/* api/_engine.js menyimpan basis data yang sedang dikerjakan di variabel
   tingkat modul. Dua permintaan yang dilayani satu instance secara bersamaan
   akan saling menimpanya di titik await. Gerbang ini menjadikan satu proses
   mengerjakan satu permintaan pada satu waktu. Ini bukan penghambat: yang
   ditunggu adalah perhitungan di memori, dan permintaan dari petugas lain
   dilayani instance lain. */
let antrean = Promise.resolve();
function gerbang(kerja) {
  const hasil = antrean.then(kerja, kerja);
  antrean = hasil.then(() => {}, () => {});
  return hasil;
}

/* ---------------------------------------------------------------- pintu utama */
async function jalankanRPC(engine, fn, args, ctx) {
  return gerbang(async () => {
    const klien = await kv.ambilKolam().connect();
    try {
      await ambilPetunjuk(klien);
      const minta = new Set(petunjuk[fn] || []);
      let bentrok = 0;

      /* Bacaan murni yang sudah pernah dihitung dan isinya belum berubah. */
      const aturan = BACA[fn];
      const kunciH = (aturan && args && args[0]) ? kunciIngat(fn, args) : '';
      const mentahBoleh = Boolean(ctx && ctx.izinMentah);
      const keluarkan = (teks) => (mentahBoleh ? new JsonMentah(teks) : JSON.parse(teks));
      if (kunciH && INGAT.has(kunciH)) {
        const k0 = await muat(klien, []);
        const ada = INGAT.get(kunciH);
        if (ada && ada.kv === k0.kunciCache) {
          let sah = false;
          engine._setLambat(k0.lambat);
          try { engine.cekIzin(k0.db, args[0], aturan[0], aturan[1], ctx || {}); sah = true; }
          catch (e) { sah = false; }            /* token basi, izin dicabut, dll: jalur biasa yang menjawab dengan galat yang sama */
          finally { engine._setLambat(null); }
          if (sah) {
            const sebelum = JSON.stringify(k0.db);
            engine._setLambat(k0.lambat);
            try { engine.catatAkses(k0.db, fn, args[0], ctx || {}); } catch (e) { /* catatan gagal tidak boleh menggagalkan bacaan */ }
            finally { engine._setLambat(null); }
            if (JSON.stringify(k0.db) !== sebelum) {
              try { await simpan(klien, k0, k0.db); } catch (e) { /* bentrok atau gagal tulis: catatan hilang, bacaan tetap sah */ }
            }
            INGAT.delete(kunciH); INGAT.set(kunciH, ada);   /* baru dipakai: pindah ke belakang antrean */
            return keluarkan(ada.teks);
          }
        }
      }

      for (let putaran = 1; putaran <= MAKS_PUTARAN; putaran++) {
        const keadaan = await muat(klien, [...minta]);
        let keluar = null;
        engine._setLambat(keadaan.lambat);
        try {
          /* Beberapa fungsi mengubah objek argumennya (mis. mengisi d.id).
             Kalau diulang dengan objek yang sama, simpan-baru berubah jadi
             edit dan datanya hilang. Tiap putaran memakai salinan segar. */
          keluar = await engine.runRPC(keadaan.db, fn, JSON.parse(JSON.stringify(args || [])), ctx);
        } catch (e) {
          const perlu = lembarDari(e);
          if (perlu) {
            for (const n of keadaan.lambat.diminta) { minta.add(n); catatPetunjuk(fn, n); }
            minta.add(perlu); catatPetunjuk(fn, perlu);
            continue;
          }
          throw e;
        } finally {
          engine._setLambat(null);
        }

        /* Fungsinya selesai tanpa galat, tapi ada tabel yang sempat diminta dan
           galatnya ditelan try{}catch{} di dalam engine. Hasilnya TIDAK boleh
           dipakai: ada pekerjaan yang terlewat tanpa jejak. Muat tabelnya dan
           jalankan ulang. */
        if (keadaan.lambat.diminta.length) {
          for (const n of keadaan.lambat.diminta) { minta.add(n); catatPetunjuk(fn, n); }
          continue;
        }

        /* Permintaan yang tidak mengubah apa pun (membuka dasbor, mencetak
           laporan) tidak menulis sama sekali. */
        if (JSON.stringify(keluar.db) === keadaan.teks) {
          if (kunciH) {
            const teks = JSON.stringify(keluar.result);
            ingatHasil(kunciH, keadaan.kunciCache, teks);
            if (mentahBoleh && typeof teks === 'string') return new JsonMentah(teks);
          }
          return keluar.result;
        }

        if (await simpan(klien, keadaan, keluar.db)) {
          /* Hanya yang menulis catatan akses (isi buku besar tetap) yang boleh
             diingat; kalau isinya berubah, hasilnya dihitung ulang berikutnya. */
          if (kunciH && keadaan.kunciBaru === keadaan.kunciCache) {
            const teks = JSON.stringify(keluar.result);
            ingatHasil(kunciH, keadaan.kunciCache, teks);
            if (mentahBoleh && typeof teks === 'string') return new JsonMentah(teks);
          }
          return keluar.result;
        }

        bentrok++;
        await new Promise((t) => setTimeout(t, 60 * bentrok));
      }
      throw new Error('Data sedang diubah pengguna lain. Silakan ulangi.');
    } finally {
      klien.release();
    }
  });
}

/* PEMERIKSAAN IZIN, MURAH.

   Modul Broadcast, AI Asisten, dan Fundraising memeriksa siapa penggunanya
   pada SETIAP permintaan. Kalau pemeriksaan itu memuat seluruh buku besar,
   membuka satu halaman Broadcast berarti mengunduh seluruh Penghimpunan dan
   Pentasyarufan cuma untuk memastikan token masih sah.

   Yang dibutuhkan engine.cekIzin hanya Users, Sessions, dan Settings, dan
   ketiganya sudah termasuk kumpulan dasar. Jadi pemeriksaannya satu
   perjalanan kecil. Perulangannya tetap ada untuk berjaga: kalau suatu saat
   pemeriksaan izin menyentuh tabel lain, tabel itu dimuat lalu diulang,
   bukan gagal diam-diam.

   Tidak ada yang ditulis di sini. setup() memang bisa mengubah db di memori
   (mengisi nilai bawaan, mencatat percobaan login gagal), dan perubahan itu
   sengaja dibuang, sama seperti pada jalur Redis sebelumnya. */
async function cekIzin(engine, token, modul, aksi, ctx) {
  return gerbang(async () => {
    const klien = await kv.ambilKolam().connect();
    try {
      const minta = new Set();
      for (let putaran = 1; putaran <= 8; putaran++) {
        const keadaan = await muat(klien, [...minta]);
        engine._setLambat(keadaan.lambat);
        try {
          return engine.cekIzin(keadaan.db, token, modul, aksi, ctx);
        } catch (e) {
          const perlu = lembarDari(e);
          if (perlu) { minta.add(perlu); continue; }
          throw e;
        } finally {
          engine._setLambat(null);
        }
      }
      throw new Error('Tabel yang dibutuhkan pemeriksaan izin tidak selesai dimuat.');
    } finally {
      klien.release();
    }
  });
}

/* Dipakai api/backup.js: membaca SELURUH buku besar sebagai satu objek berbentuk
   lama, supaya berkas cadangannya tetap bisa dibuka dan dipulihkan dengan cara
   yang sama seperti sebelum pemindahan. */
async function muatSemua() {
  const klien = await kv.ambilKolam().connect();
  try {
    const k = await muat(klien, skema.NAMA_TABEL);
    return { db: k.db, teks: k.teks, versi: k.versi };
  } finally {
    klien.release();
  }
}

/* Mengubah SELURUH buku besar sekaligus, untuk pemulihan dari cadangan dan
   pencatatan status cadangan. Tidak memakai pemuatan bertahap: pemulihan memang
   menyentuh semua tabel, dan mencatat status pun perlu memastikan tidak ada
   tabel yang "belum dimuat" lalu dianggap kosong.
   kerja(db) boleh async dan harus mengembalikan { db }. */
async function ubahSemua(kerja) {
  return gerbang(async () => {
    const klien = await kv.ambilKolam().connect();
    try {
      for (let i = 1; i <= 5; i++) {
        const keadaan = await muat(klien, skema.NAMA_TABEL);
        const keluar = await kerja(keadaan.db);
        const db = (keluar && keluar.db) || keadaan.db;
        if (JSON.stringify(db) === keadaan.teks) return keluar;
        if (await simpan(klien, keadaan, db)) return keluar;
        await new Promise((t) => setTimeout(t, 80 * i));
      }
      throw new Error('Basis data sedang diubah pengguna lain, coba lagi.');
    } finally {
      klien.release();
    }
  });
}

/* Satu perintah SQL apa saja di kolam yang sama. Dipakai api/backup.js untuk
   tabel cadangan, supaya tidak perlu membuka kolam sambungannya sendiri. */
async function sql(teks, nilai) {
  const klien = await kv.ambilKolam().connect();
  try { return await klien.query(teks, nilai); } finally { klien.release(); }
}

module.exports = {
  pakaiPostgres, jalankanRPC, cekIzin, muatSemua, ubahSemua, sql, PerluLembar, lembarDari, JsonMentah, lupakanIngatan,
  /* dibuka untuk pengujian */
  _internal: { muat, simpan, selisihTabel, DASAR, K_VERSI, K_PROPS, K_PETUNJUK, K_CVER, BACA, ingatan: () => ({ entri: INGAT.size, huruf: ingatBesar }) },
};
