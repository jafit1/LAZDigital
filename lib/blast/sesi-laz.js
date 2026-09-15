// lib/blast/sesi-laz.js — jembatan ke sesi & izin LAZDigital
//
// Setelah Blast digabungkan ke LAZDigital, Blast TIDAK lagi punya akun,
// sandi, atau sesi sendiri. Satu-satunya sumber kebenaran soal "siapa ini
// dan boleh apa" adalah tabel Users LAZDigital, supaya pengelolaan akun
// tidak terpecah dua dan pencabutan akses berlaku seketika di dua tempat.
//
// Izin pun TIDAK diterjemahkan lewat peran. Peran Blast hanya jadi label
// tampilan; yang menentukan boleh-tidaknya adalah centang modul "broadcast"
// pada akun LAZDigital. Menerjemahkan lewat peran berarti akun yang cuma
// dicentang "lihat" bisa naik jadi bisa mengirim — itu kenaikan hak akses
// diam-diam, dan justru tidak terlihat oleh yang mengatur akunnya.

const engine = require('../../api/_engine.js');
const rpc = require('../../api/rpc.js');

/* Satu izin Blast dipetakan ke satu aksi LAZDigital pada modul 'broadcast'.
   Yang tidak terdaftar di sini dianggap aksi 'edit' — pilihan yang sengaja
   ketat: izin baru yang lupa didaftarkan akan tertutup, bukan terbuka. */
const PETA_IZIN = {
  'dasbor': 'view',
  'perangkat.lihat': 'view',
  'kontak.lihat': 'view',
  'pesan.lihat': 'view',
  'inbox.lihat': 'view',
  'laporan.lihat': 'view',
  'setelan.lihat': 'view',
  'pengguna.lihat': 'view',
  'audit.lihat': 'view',

  'pesan.kirim': 'create',
  'kontak.impor': 'create',
  'massal.kelola': 'create',
  'inbox.balas': 'create',

  'perangkat.ubah': 'edit',
  'kontak.ubah': 'edit',
  'setelan.ubah': 'edit',
  'pengguna.ubah': 'edit',
};

function aksiLaz(izin) {
  return PETA_IZIN[String(izin || '')] || 'edit';
}

/* Label peran hanya untuk ditampilkan. Pembatasan sesungguhnya ada di
   izin per aksi dan di kantor layanan. */
function labelPeran(u) {
  if (!u) return 'petugas';
  if (u.role === 'superadmin') return 'superadmin';
  if (String(u.layanan || '').trim()) return 'kll';
  const p = u.permissions || {};
  const b = p.broadcast || {};
  if (b.delete) return 'admin';
  if (b.edit) return 'penyelia';
  return 'petugas';
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

/* Mengembalikan pengguna LAZDigital dalam bentuk yang dimengerti Blast,
   atau null bila tokennya tidak sah / tidak punya akses broadcast. */
async function penggunaLaz(req) {
  const token = tokenDari(req);
  if (!token) return null;
  let u;
  try {
    const r = await rpc._internal.muat();
    u = engine.cekIzin(r.db, token, 'broadcast', 'view', ctxDari(req));
  } catch (e) {
    /* Dua kegagalan yang berbeda dan tidak boleh disamakan: tokennya tidak
       sah (harus masuk lagi), atau akunnya sah tetapi modul broadcast belum
       dicentang (harus minta ke admin). Kalau keduanya dijawab "sesi
       berakhir", petugas akan keluar-masuk berulang kali tanpa hasil. */
    const pesan = (e && e.message) || '';
    if (req) req.__alasanBlast = /IZIN:/.test(pesan) ? 'izin' : 'auth';
    return null;
  }
  if (!u) return null;
  return {
    id: u.id,
    nama: u.nama,
    username: u.username,
    peran: labelPeran(u),
    /* Kolom "Kantor" pada Manajemen User LAZDigital. Inilah yang mengunci
       pengurus KLL/ULL ke kantornya sendiri. */
    kantor: String(u.layanan || '').trim(),
    aktif: true,
    _laz: u,
  };
}

/* Dipakai peran.js. Superadmin selalu boleh; selain itu ikut centang modul
   broadcast pada akun LAZDigital. */
function bolehLaz(pengguna, izin) {
  const u = pengguna && pengguna._laz;
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  const p = u.permissions || {};
  const b = p.broadcast || {};
  return !!b[aksiLaz(izin)];
}

module.exports = { penggunaLaz, bolehLaz, labelPeran, aksiLaz, PETA_IZIN, tokenDari };
