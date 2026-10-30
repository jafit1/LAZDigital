// lib/pengajuan/db.js - lapisan basis data modul Pengajuan
//
// Sumber kebenaran: PostgreSQL (kv-postgres) atau Upstash Redis (REST).
// Bila variabel basis data kosong, otomatis jatuh ke penyimpanan lokal berkas
// .data/pengajuan.json supaya aplikasi tetap bisa dicoba tanpa kredensial apa pun.
'use strict';

const fs = require('fs');
const path = require('path');

const pg = require('../kv-postgres.js');
const URL_REST = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN_REST = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PAKAI_UPSTASH = Boolean(URL_REST && TOKEN_REST);

const PREFIKS = 'pengajuan:';

const DI_VERCEL = Boolean(process.env.VERCEL);
if (DI_VERCEL && !PAKAI_UPSTASH && !pg.pakaiPostgres()) {
  console.error(
    '[db-pengajuan] Basis data cloud belum disetel. Modul Pengajuan membutuhkan PostgreSQL atau Upstash Redis.'
  );
}

function pastikanSiap() {
  if (DI_VERCEL && !PAKAI_UPSTASH && !pg.pakaiPostgres()) {
    throw new Error(
      'Basis data belum tersambung. Setel DATABASE_URL atau UPSTASH_REDIS_* di Environment Variables Vercel.'
    );
  }
}

// ------------------------------------------------------------------
// Penyimpanan lokal (hanya untuk uji coba di komputer sendiri)
// ------------------------------------------------------------------
const BERKAS_LOKAL = path.join(process.env.LAZ_DATA_LOKAL || path.join(process.cwd(), '.data'), 'pengajuan.json');
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
      console.error('[db-pengajuan] gagal menulis penyimpanan lokal:', e.message);
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

async function jalan(args) {
  if (pg.pakaiPostgres()) return pg.jalan(args);
  pastikanSiap();
  return PAKAI_UPSTASH ? perintah(args) : jalanLokal(args);
}

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
    throw new Error('Penyimpanan gagal — data pengajuan belum tersimpan.');
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

module.exports = {
  ambil,
  simpan,
  hapus,
  tambahKeHimpunan,
  keluarDariHimpunan,
  anggotaHimpunan,
  jalan,
};
