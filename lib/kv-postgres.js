/* lib/kv-postgres.js: penyimpan kunci-nilai di PostgreSQL.
 *
 * Menggantikan Upstash Redis untuk modul AI, Broadcast, dan Fundraising.
 * Ketiganya memakai kosakata perintah yang sama dan hanya sembilan buah:
 * GET, SET (dengan EX), DEL, EXPIRE, INCR, SADD, SREM, SMEMBERS, SCARD.
 * Berkas ini menjawab kesembilannya di atas dua tabel, kv dan kv_set, dengan
 * arti yang sama persis seperti aslinya.
 *
 * KENAPA MENIRU PERINTAH REDIS, BUKAN MENULIS ULANG KETIGA MODULNYA.
 * lib/ai/db.js, lib/blast/db.js, dan lib/fund/db.js sudah punya lapisan
 * pengirim perintah; di atasnya ada ribuan baris yang memanggil ambil(),
 * simpan(), anggotaHimpunan(), dan seterusnya. Menyambung di lapisan perintah
 * berarti seluruh kode di atasnya tidak perlu disentuh sama sekali, dan uji
 * yang sudah ada (114 + 122 + 40 pemeriksaan) langsung berlaku sebagai bukti
 * bahwa penggantinya berperilaku sama. Menulis ulang ketiga modul akan
 * membuang bukti itu dan menggantinya dengan harapan.
 *
 * MASA BERLAKU. Redis membuang kunci kedaluwarsa sendiri; PostgreSQL perlu
 * disuruh. Di sini dipakai dua lapis: pembacaan selalu menyaring yang sudah
 * lewat waktunya (jadi tidak pernah ada yang terbaca padahal sudah mati), dan
 * penyapu berkala menghapus barisnya supaya tabelnya tidak menggelembung.
 * Menyaring saat membaca yang menentukan kebenarannya; penyapu hanya
 * kebersihan.
 *
 * KOLAM SAMBUNGAN. Di lingkungan tanpa server, tiap panggilan bisa mendarat di
 * proses yang berbeda dan tiap proses membuka sambungannya sendiri. Kolamnya
 * sengaja dibuat kecil (maks 2) dan Supabase harus diakses lewat alamat
 * "transaction pooler" (porta 6543), bukan sambungan langsung porta 5432:
 * sambungan langsung akan habis jauh sebelum penggunanya bertambah banyak.
 */
'use strict';

let Pool = null;
try { ({ Pool } = require('pg')); } catch (_) { /* dilaporkan saat dipakai */ }

const ALAMAT = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

/* Ada tidaknya PostgreSQL diputuskan dari alamatnya, bukan dari percobaan
   menyambung: pemutusnya harus bisa dijawab tanpa menunggu jaringan. */
function pakaiPostgres() { return Boolean(ALAMAT()); }

let kolam = null;
function ambilKolam() {
  if (kolam) return kolam;
  if (!Pool) throw new Error('Pustaka "pg" belum terpasang. Jalankan: npm install pg');
  const alamat = ALAMAT();
  if (!alamat) throw new Error('DATABASE_URL belum disetel.');

  /* Supabase mewajibkan TLS. Kalau alamatnya belum menyebut sslmode dan
     tujuannya bukan komputer sendiri, TLS dinyalakan.
     rejectUnauthorized:false dipakai karena rantai sertifikat Supabase tidak
     ada di penyimpanan akar Node; lalu lintasnya tetap terenkripsi. */
  const lokal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(alamat);
  const sudahDisebut = /[?&]sslmode=/.test(alamat);
  const ssl = (!lokal && !sudahDisebut) ? { rejectUnauthorized: false } : undefined;

  kolam = new Pool({
    connectionString: alamat,
    ssl,
    max: Number(process.env.PG_MAKS_SAMBUNGAN || 2),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
  });
  /* Tanpa penangan ini, satu sambungan yang diputus server membuat seluruh
     proses berhenti dengan galat yang tidak ada hubungannya dengan permintaan
     yang sedang dilayani. */
  kolam.on('error', () => {});
  return kolam;
}

/* Penyapu dijalankan paling sering sekali per lima menit per proses. Ia tidak
   menentukan kebenaran (pembacaan sudah menyaring sendiri), jadi tidak perlu
   sering dan tidak perlu ditunggu. */
let sapuTerakhir = 0;
async function sapuSekali(klien) {
  const kini = Date.now();
  if (kini - sapuTerakhir < 5 * 60 * 1000) return;
  sapuTerakhir = kini;
  try { await klien.query('DELETE FROM kv WHERE kedaluwarsa IS NOT NULL AND kedaluwarsa < now()'); } catch (_) {}
}

const HIDUP = '(kedaluwarsa IS NULL OR kedaluwarsa > now())';

/* Satu perintah Redis, dijalankan di atas sebuah klien PostgreSQL. Dipisah
   dari pengelolaan sambungan supaya pipeline bisa memakainya berulang kali di
   dalam satu transaksi. */
async function satuPerintah(klien, args) {
  const cmd = String(args[0] || '').toUpperCase();
  const sisa = args.slice(1);
  const kunci = sisa[0];

  switch (cmd) {
    case 'GET': {
      const r = await klien.query('SELECT nilai FROM kv WHERE kunci=$1 AND ' + HIDUP, [kunci]);
      return r.rows.length ? r.rows[0].nilai : null;
    }

    case 'SET': {
      const nilai = sisa[1];
      const iEx = sisa.findIndex((v) => String(v).toUpperCase() === 'EX');
      /* SET tanpa EX MENGHAPUS umur yang lama, sama seperti Redis. Kalau
         umurnya dibiarkan menempel, menyimpan ulang kunci untuk membuatnya
         abadi tetap membuatnya hilang pada waktu yang lama. */
      const detik = iEx > -1 ? Number(sisa[iEx + 1]) : null;
      await klien.query(
        'INSERT INTO kv (kunci, nilai, kedaluwarsa, diubah) VALUES ($1,$2,'
        + (detikSah(detik) ? "now() + ($3 || ' seconds')::interval" : 'NULL') + ',now()) '
        + 'ON CONFLICT (kunci) DO UPDATE SET nilai=EXCLUDED.nilai, kedaluwarsa=EXCLUDED.kedaluwarsa, diubah=now()',
        detikSah(detik) ? [kunci, nilai, String(detik)] : [kunci, nilai]);
      return 'OK';
    }

    case 'DEL': {
      const r = await klien.query('DELETE FROM kv WHERE kunci = ANY($1::text[])', [sisa]);
      /* Satu nama kunci bisa dipakai sebagai string ATAU sebagai himpunan.
         Menghapusnya harus membersihkan keduanya, kalau tidak sisa anggota
         himpunan akan muncul kembali saat nama itu dipakai lagi. */
      await klien.query('DELETE FROM kv_set WHERE kunci = ANY($1::text[])', [sisa]);
      return r.rowCount;
    }

    case 'EXPIRE': {
      const r = await klien.query(
        "UPDATE kv SET kedaluwarsa = now() + ($2 || ' seconds')::interval WHERE kunci=$1",
        [kunci, String(Number(sisa[1]) || 0)]);
      return r.rowCount ? 1 : 0;
    }

    case 'INCR': {
      /* Kunci yang sudah lewat waktunya dihitung mulai dari nol lagi, bukan
         melanjutkan angka lamanya. Ini yang membuat pembatas "sekian kali per
         hari" benar-benar berulang tiap hari. */
      const r = await klien.query(
        'INSERT INTO kv (kunci, nilai, kedaluwarsa, diubah) VALUES ($1, $2, NULL, now()) '
        + 'ON CONFLICT (kunci) DO UPDATE SET '
        + "  nilai = (CASE WHEN kv.kedaluwarsa IS NOT NULL AND kv.kedaluwarsa < now() THEN 0 "
        + '              ELSE COALESCE(NULLIF(kv.nilai, $3), $4)::bigint END + 1)::text, '
        + '  kedaluwarsa = CASE WHEN kv.kedaluwarsa IS NOT NULL AND kv.kedaluwarsa < now() '
        + '                     THEN NULL ELSE kv.kedaluwarsa END, '
        + '  diubah = now() '
        + 'RETURNING nilai',
        [kunci, '1', '', '0']);
      return Number(r.rows[0].nilai);
    }

    case 'SADD': {
      const anggota = sisa.slice(1).map(String);
      if (!anggota.length) return 0;
      const r = await klien.query(
        'INSERT INTO kv_set (kunci, anggota) SELECT $1, x FROM unnest($2::text[]) AS x '
        + 'ON CONFLICT DO NOTHING', [kunci, anggota]);
      return r.rowCount;
    }

    case 'SREM': {
      const anggota = sisa.slice(1).map(String);
      if (!anggota.length) return 0;
      const r = await klien.query(
        'DELETE FROM kv_set WHERE kunci=$1 AND anggota = ANY($2::text[])', [kunci, anggota]);
      return r.rowCount;
    }

    case 'SMEMBERS': {
      const r = await klien.query('SELECT anggota FROM kv_set WHERE kunci=$1', [kunci]);
      return r.rows.map((x) => x.anggota);
    }

    case 'SCARD': {
      const r = await klien.query('SELECT count(*)::int AS n FROM kv_set WHERE kunci=$1', [kunci]);
      return r.rows[0].n;
    }

    default:
      throw new Error('Perintah belum didukung di PostgreSQL: ' + cmd);
  }
}

function detikSah(d) { return Number.isFinite(d) && d > 0; }

async function jalan(args) {
  const klien = await ambilKolam().connect();
  try {
    const hasil = await satuPerintah(klien, args);
    sapuSekali(klien);              /* tidak ditunggu, sengaja */
    return hasil;
  } finally {
    klien.release();
  }
}

/* Pipeline Redis mengirim banyak perintah dalam satu perjalanan. Di sini
   padanannya satu transaksi: satu perjalanan, dan kalau ada yang gagal di
   tengah tidak ada yang separuh jadi. */
async function pipeline(daftarArgs) {
  if (!daftarArgs.length) return [];
  const klien = await ambilKolam().connect();
  try {
    await klien.query('BEGIN');
    const keluar = [];
    for (const args of daftarArgs) keluar.push(await satuPerintah(klien, args));
    await klien.query('COMMIT');
    return keluar;
  } catch (e) {
    try { await klien.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    klien.release();
  }
}

async function tutup() {
  if (!kolam) return;
  const k = kolam; kolam = null;
  try { await k.end(); } catch (_) {}
}

module.exports = { pakaiPostgres, jalan, pipeline, ambilKolam, tutup };
