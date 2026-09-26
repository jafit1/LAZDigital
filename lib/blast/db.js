// lib/db.js — lapisan basis data Blast Uyeee
//
// Sumber kebenaran: Upstash Redis (REST). Bila variabel Upstash kosong,
// otomatis jatuh ke penyimpanan lokal berkas .data/blast.json supaya
// aplikasi tetap bisa dicoba tanpa kredensial apa pun.
//
// ATURAN: kegagalan tulis TIDAK BOLEH ditelan diam-diam — selalu lempar
// galat agar terlihat oleh pengguna (lihat lib/util.js > balas()).

const fs = require('fs');
const path = require('path');

const pg = require('../kv-postgres.js');
const URL_REST = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN_REST = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PAKAI_UPSTASH = Boolean(URL_REST && TOKEN_REST);

const PREFIKS = 'blast:'; // dipisah dari laz:* dan wab:* milik LAZDigital

// Di Vercel, sistem berkas hanya bisa dibaca dan setiap pemanggilan berdiri
// sendiri — penyimpanan lokal mustahil dipakai di sana. Berhenti dengan pesan
// yang jelas, bukan galat EROFS yang membingungkan.
const DI_VERCEL = Boolean(process.env.VERCEL);
if (DI_VERCEL && !PAKAI_UPSTASH) {
  console.error(
    '[db] UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN belum diisi. ' +
    'Di Vercel, aplikasi wajib memakai Upstash Redis — penyimpanan lokal tidak tersedia.'
  );
}

function pastikanSiap() {
  if (DI_VERCEL && !PAKAI_UPSTASH) {
    throw new Error(
      'Basis data belum tersambung. Isi UPSTASH_REDIS_REST_URL dan ' +
      'UPSTASH_REDIS_REST_TOKEN di Environment Variables Vercel, lalu deploy ulang.'
    );
  }
}

// ------------------------------------------------------------------
// Penyimpanan lokal (hanya untuk uji coba di komputer sendiri)
// ------------------------------------------------------------------
const BERKAS_LOKAL = path.join(process.cwd(), '.data', 'blast.json');
let lokal = null;
let tulisTertunda = null;

function muatLokal() {
  if (lokal) return lokal;
  try {
    lokal = JSON.parse(fs.readFileSync(BERKAS_LOKAL, 'utf8'));
  } catch (_) {
    lokal = { kv: {}, set: {}, kedaluwarsa: {} };
  }
  return lokal;
}

function simpanLokal() {
  if (tulisTertunda) return;
  tulisTertunda = setTimeout(() => {
    tulisTertunda = null;
    try {
      fs.mkdirSync(path.dirname(BERKAS_LOKAL), { recursive: true });
      fs.writeFileSync(BERKAS_LOKAL, JSON.stringify(lokal, null, 2));
    } catch (e) {
      console.error('[db] gagal menulis penyimpanan lokal:', e.message);
    }
  }, 30);
}

function bersihkanKedaluwarsa(kunci) {
  const d = muatLokal();
  const batas = d.kedaluwarsa[kunci];
  if (batas && Date.now() > batas) {
    delete d.kv[kunci];
    delete d.kedaluwarsa[kunci];
    simpanLokal();
    return true;
  }
  return false;
}

// ------------------------------------------------------------------
// Pemanggil Upstash REST
// ------------------------------------------------------------------
async function perintah(args) {
  const res = await fetch(URL_REST, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_REST}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const teks = await res.text().catch(() => '');
    throw new Error(`Basis data menolak perintah (${res.status}): ${teks.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data && data.error) throw new Error(`Basis data: ${data.error}`);
  return data ? data.result : null;
}

// Beberapa perintah sekaligus (hemat waktu di serverless)
async function pipeline(daftarArgs) {
  if (pg.pakaiPostgres()) return pg.pipeline(daftarArgs);
  if (!daftarArgs.length) return [];
  pastikanSiap();
  if (!PAKAI_UPSTASH) {
    const hasil = [];
    for (const a of daftarArgs) hasil.push(await jalanLokal(a));
    return hasil;
  }
  const res = await fetch(URL_REST.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_REST}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(daftarArgs),
  });
  if (!res.ok) {
    const teks = await res.text().catch(() => '');
    throw new Error(`Basis data menolak pipeline (${res.status}): ${teks.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.map((d) => {
    if (d && d.error) throw new Error(`Basis data: ${d.error}`);
    return d ? d.result : null;
  });
}

async function jalanLokal(args) {
  const [cmd, ...sisa] = args;
  const d = muatLokal();
  switch (String(cmd).toUpperCase()) {
    case 'GET': {
      bersihkanKedaluwarsa(sisa[0]);
      return d.kv[sisa[0]] ?? null;
    }
    case 'SET': {
      d.kv[sisa[0]] = sisa[1];
      const iEx = sisa.findIndex((v) => String(v).toUpperCase() === 'EX');
      /* SET tanpa EX MENGHAPUS umur yang lama — begitu Redis yang sebenarnya
         bekerja. Sebelumnya umurnya dibiarkan menempel di sini, sehingga
         menyimpan ulang kunci untuk membuatnya abadi tetap saja membuatnya
         hilang pada waktu yang lama; dan itu hanya terjadi di penyimpanan lokal,
         jadi ujinya lulus di Vercel dan gagal di komputer petugas. */
      if (iEx > -1) d.kedaluwarsa[sisa[0]] = Date.now() + Number(sisa[iEx + 1]) * 1000;
      else delete d.kedaluwarsa[sisa[0]];
      simpanLokal();
      return 'OK';
    }
    case 'DEL': {
      let n = 0;
      for (const k of sisa) {
        if (k in d.kv) { delete d.kv[k]; n++; }
        delete d.kedaluwarsa[k];
      }
      simpanLokal();
      return n;
    }
    case 'EXPIRE': {
      d.kedaluwarsa[sisa[0]] = Date.now() + Number(sisa[1]) * 1000;
      simpanLokal();
      return 1;
    }
    case 'INCR': {
      const nilai = Number(d.kv[sisa[0]] || 0) + 1;
      d.kv[sisa[0]] = String(nilai);
      simpanLokal();
      return nilai;
    }
    case 'SADD': {
      const s = (d.set[sisa[0]] = d.set[sisa[0]] || []);
      let n = 0;
      for (const v of sisa.slice(1)) if (!s.includes(v)) { s.push(v); n++; }
      simpanLokal();
      return n;
    }
    case 'SREM': {
      const s = (d.set[sisa[0]] = d.set[sisa[0]] || []);
      let n = 0;
      for (const v of sisa.slice(1)) {
        const i = s.indexOf(v);
        if (i > -1) { s.splice(i, 1); n++; }
      }
      simpanLokal();
      return n;
    }
    case 'SMEMBERS':
      return (d.set[sisa[0]] || []).slice();
    case 'SCARD':
      return (d.set[sisa[0]] || []).length;
    default:
      throw new Error(`Perintah lokal belum didukung: ${cmd}`);
  }
}

/* Urutan pemilihan penyimpanan, dari yang paling diutamakan:
     1. PostgreSQL, kalau DATABASE_URL ada. Ini tujuan akhirnya.
     2. Upstash Redis, kalau UPSTASH_* masih ada. Jalan mundur selama masa
        peralihan, supaya satu berkas .env bisa dipakai mencoba kedua sisi
        tanpa mengubah kode.
     3. Berkas JSON di folder .data, untuk menjalankan di komputer sendiri. */
async function jalan(args) {
  if (pg.pakaiPostgres()) return pg.jalan(args);
  pastikanSiap();
  return PAKAI_UPSTASH ? perintah(args) : jalanLokal(args);
}

// ------------------------------------------------------------------
// API yang dipakai aplikasi
// ------------------------------------------------------------------
const K = (kunci) => (kunci.startsWith(PREFIKS) ? kunci : PREFIKS + kunci);

async function ambil(kunci) {
  const nilai = await jalan(['GET', K(kunci)]);
  if (nilai === null || nilai === undefined) return null;
  try {
    return typeof nilai === 'string' ? JSON.parse(nilai) : nilai;
  } catch (_) {
    return nilai;
  }
}

async function simpan(kunci, nilai, opsi = {}) {
  const args = ['SET', K(kunci), JSON.stringify(nilai)];
  if (opsi.detik) args.push('EX', String(opsi.detik));
  const hasil = await jalan(args);
  if (hasil !== 'OK' && hasil !== 1 && hasil !== true) {
    throw new Error('Penyimpanan gagal — data belum tersimpan. Coba lagi.');
  }
  return true;
}

async function hapus(...kunci) {
  if (!kunci.length) return 0;
  return jalan(['DEL', ...kunci.map(K)]);
}

async function tambahKeHimpunan(kunci, ...nilai) {
  return jalan(['SADD', K(kunci), ...nilai]);
}

async function keluarDariHimpunan(kunci, ...nilai) {
  return jalan(['SREM', K(kunci), ...nilai]);
}

async function anggotaHimpunan(kunci) {
  const hasil = await jalan(['SMEMBERS', K(kunci)]);
  return Array.isArray(hasil) ? hasil : [];
}

async function jumlahHimpunan(kunci) {
  return Number((await jalan(['SCARD', K(kunci)])) || 0);
}

async function naikkan(kunci, detikKedaluwarsa) {
  const nilai = Number(await jalan(['INCR', K(kunci)]));
  if (detikKedaluwarsa && nilai === 1) await jalan(['EXPIRE', K(kunci), String(detikKedaluwarsa)]);
  return nilai;
}

// Ambil banyak dokumen sekaligus lewat pipeline
async function ambilBanyak(daftarKunci) {
  if (!daftarKunci.length) return [];
  const hasil = await pipeline(daftarKunci.map((k) => ['GET', K(k)]));
  return hasil.map((n) => {
    if (n === null || n === undefined) return null;
    try { return typeof n === 'string' ? JSON.parse(n) : n; } catch (_) { return n; }
  });
}

// Simpan banyak dokumen sekaligus
async function simpanBanyak(pasangan) {
  if (!pasangan.length) return true;
  await pipeline(pasangan.map(([k, v]) => ['SET', K(k), JSON.stringify(v)]));
  return true;
}

module.exports = {
  PREFIKS,
  pakaiUpstash: PAKAI_UPSTASH,
  diVercel: DI_VERCEL,
  ambil,
  simpan,
  hapus,
  ambilBanyak,
  simpanBanyak,
  tambahKeHimpunan,
  keluarDariHimpunan,
  anggotaHimpunan,
  jumlahHimpunan,
  naikkan,
};
