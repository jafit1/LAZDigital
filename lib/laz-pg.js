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
    "SELECT kunci, nilai FROM kv WHERE kunci IN ('" + [K_VERSI, K_PROPS, K_PETUNJUK].join("','") + "')",
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

  return {
    db: db,
    teks: JSON.stringify(db),
    versi: String(petaKv[K_VERSI] || '0'),
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

    await klien.query('UPDATE kv SET nilai=$2, diubah=now() WHERE kunci=$1',
      [K_VERSI, String(Number(keadaan.versi) + 1)]);

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
          if (e && e.perluLembar) {
            for (const n of keadaan.lambat.diminta) { minta.add(n); catatPetunjuk(fn, n); }
            minta.add(e.lembar); catatPetunjuk(fn, e.lembar);
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
        if (JSON.stringify(keluar.db) === keadaan.teks) return keluar.result;

        if (await simpan(klien, keadaan, keluar.db)) return keluar.result;

        bentrok++;
        await new Promise((t) => setTimeout(t, 60 * bentrok));
      }
      throw new Error('Data sedang diubah pengguna lain. Silakan ulangi.');
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
  pakaiPostgres, jalankanRPC, muatSemua, ubahSemua, sql, PerluLembar,
  /* dibuka untuk pengujian */
  _internal: { muat, simpan, selisihTabel, DASAR, K_VERSI, K_PROPS, K_PETUNJUK },
};
