// lib/fund/sesi-laz.js — jembatan ke sesi & izin LAZDigital untuk modul Fundraising
//
// Sama seperti Broadcast, modul Fundraising TIDAK punya akun/sandi sendiri.
// Sumber kebenaran "siapa ini dan boleh apa" adalah tabel Users LAZDigital,
// khususnya centang modul 'fundraising' pada akun. Peran hanya jadi label.

const engine = require('../../api/_engine.js');
const rpc = require('../../api/rpc.js');

const MODUL = 'fundraising';

/* Satu izin Fundraising → satu aksi LAZDigital (view/create/edit/delete).
   Yang tak terdaftar dianggap 'edit' — sengaja ketat: izin baru yang lupa
   didaftarkan akan tertutup, bukan terbuka diam-diam. */
const PETA_IZIN = {
  'fund.dasbor': 'view',
  'donatur.lihat': 'view',
  'himpunan.lihat': 'view',
  'cocok.lihat': 'view',
  'laporan.lihat': 'view',
  'akun.lihat': 'view',

  'ambil.catat': 'create',

  'donatur.ubah': 'edit',
  'cocok.tandai': 'edit',
  'akun.ubah': 'edit',

  'donatur.hapus': 'delete',
  'himpunan.hapus': 'delete',
};

function aksiLaz(izin) {
  return PETA_IZIN[String(izin || '')] || 'edit';
}

/* Label peran hanya untuk ditampilkan. Koordinator (boleh delete) melihat data
   semua fundraiser; selebihnya hanya miliknya sendiri. */
function labelPeran(u) {
  if (!u) return 'penggalang';
  if (u.role === 'superadmin') return 'superadmin';
  const b = (u.permissions || {})[MODUL] || {};
  if (b.delete) return 'koordinator';
  if (b.create || b.edit) return 'penggalang';
  return 'relawan';
}

function ctxDari(req) {
  return {
    ip: String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim(),
    ua: String((req.headers && req.headers['user-agent']) || '').slice(0, 160),
  };
}

function tokenDari(req) {
  const b = req.body || {};
  return b.token || (req.headers && req.headers['x-laz-token']) || '';
}

async function penggunaLaz(req) {
  const token = tokenDari(req);
  if (!token) return null;
  let u;
  try {
    const r = await rpc._internal.muat();
    u = engine.cekIzin(r.db, token, MODUL, 'view', ctxDari(req));
  } catch (e) {
    const pesan = (e && e.message) || '';
    if (req) req.__alasanFund = /IZIN:/.test(pesan) ? 'izin' : 'auth';
    return null;
  }
  if (!u) return null;
  return {
    id: u.id,
    nama: u.nama,
    username: u.username,
    peran: labelPeran(u),
    kantor: String(u.layanan || '').trim(),
    aktif: true,
    _laz: u,
  };
}

/* Superadmin selalu boleh; selain itu ikut centang modul fundraising. */
function bolehFund(pengguna, izin) {
  const u = pengguna && pengguna._laz;
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  const b = (u.permissions || {})[MODUL] || {};
  return !!b[aksiLaz(izin)];
}

/* Koordinator/superadmin melihat data seluruh fundraiser; fundraiser biasa
   hanya miliknya. Diturunkan dari izin 'delete' pada modul, BUKAN dari peran
   tebakan — hak melihat-semua tidak boleh ikut berubah sebagai efek samping
   pergantian peran. */
function lihatSemua(pengguna) {
  const u = pengguna && pengguna._laz;
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  const b = (u.permissions || {})[MODUL] || {};
  return !!b.delete;
}

module.exports = { MODUL, penggunaLaz, bolehFund, lihatSemua, labelPeran, aksiLaz, PETA_IZIN, tokenDari };
