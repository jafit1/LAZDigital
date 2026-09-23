// lib/ai/sesi-laz.js — jembatan ke sesi & izin LAZDigital untuk modul AI Asisten
//
// Seperti Broadcast dan Fundraising, modul ini tidak punya akun sendiri. Yang
// menentukan boleh-tidaknya adalah centang modul 'ai' pada akun LAZDigital.

const engine = require('../../api/_engine.js');
const rpc = require('../../api/rpc.js');

const MODUL = 'ai';

/* Satu izin AI → satu aksi LAZDigital. Yang tak terdaftar dianggap 'edit'
   (ketat: izin baru yang lupa didaftarkan tertutup, bukan terbuka). */
const PETA_IZIN = {
  'ai.chat': 'view',
  'sesi.lihat': 'view',
  'pengetahuan.lihat': 'view',
  'prompt.lihat': 'view',
  'pakai.lihat': 'view',
  'penyedia.lihat': 'view',

  'sesi.kirim': 'create',

  'sesi.ubah': 'edit',
  'pengetahuan.ubah': 'edit',
  'prompt.ubah': 'edit',

  'sesi.hapus': 'delete',
};

function aksiLaz(izin) { return PETA_IZIN[String(izin || '')] || 'edit'; }

function labelPeran(u) {
  if (!u) return 'pengguna';
  if (u.role === 'superadmin') return 'superadmin';
  const b = (u.permissions || {})[MODUL] || {};
  if (b.delete) return 'pengelola';
  if (b.create || b.edit) return 'pengguna';
  return 'pembaca';
}

function ctxDari(req) {
  return {
    ip: String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim(),
    ua: String((req.headers && req.headers['user-agent']) || '').slice(0, 160),
  };
}

function tokenDari(req) {
  const b = req.body || {};
  return b.token || (req.headers && req.headers['x-laz-token'])
    || (req.query && req.query.token) || '';
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
    if (req) req.__alasanAi = /IZIN:/.test(pesan) ? 'izin' : 'auth';
    return null;
  }
  if (!u) return null;
  return {
    id: u.id,
    nama: u.nama,
    username: u.username,
    peran: labelPeran(u),
    kantor: String(u.layanan || '').trim(),
    superadmin: u.role === 'superadmin',
    _laz: u,
  };
}

function bolehAi(pengguna, izin) {
  const u = pengguna && pengguna._laz;
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  const b = (u.permissions || {})[MODUL] || {};
  return !!b[aksiLaz(izin)];
}

/* PROVIDER: SUPERADMIN SAJA — dan itu bukan sekadar pilihan tampilan.
   Di sanalah kunci API lembaga disimpan; siapa pun yang bisa mengubah provider
   bisa mengarahkan seluruh percakapan ke server pilihannya sendiri. */
function bolehPenyedia(pengguna) {
  return Boolean(pengguna && pengguna._laz && pengguna._laz.role === 'superadmin');
}

module.exports = { MODUL, penggunaLaz, bolehAi, bolehPenyedia, labelPeran, aksiLaz, PETA_IZIN, tokenDari };
