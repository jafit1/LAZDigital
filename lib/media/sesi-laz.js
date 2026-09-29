// lib/media/sesi-laz.js - jembatan ke sesi & izin LAZDigital untuk modul Media
//
// Sama seperti Broadcast dan Fundraising, modul Media TIDAK punya akun/sandi
// sendiri. Sumber kebenaran "siapa ini dan boleh apa" adalah tabel Users
// LAZDigital, khususnya centang modul 'media' pada akun.
//
// EMPAT CENTANG, DAN ARTINYA DIJAGA TETAP LURUS:
//
//   lihat  - boleh membuka modul Media dan melihat permohonan
//   tambah - boleh mengajukan permohonan desain
//   ubah   - tim media: boleh mengambil dan mengerjakan permohonan
//   hapus  - koordinator: membagi ulang, merekap, mengatur anggota tim
//
// Bidang (foto/video/desain) TIDAK dititipkan di sini. Alasannya ditulis
// panjang di lib/media/tim.js: empat centang tidak bisa menyatakan tiga
// keadaan yang berdiri sendiri tanpa menyandera artinya.
const engine = require('../../api/_engine.js');
const rpc = require('../../api/rpc.js');
const lazpg = require('../laz-pg.js');

const MODUL = 'media';

/* Satu izin Media → satu aksi LAZDigital (view/create/edit/delete).
   Yang tak terdaftar dianggap 'edit' — sengaja ketat: izin baru yang lupa
   didaftarkan akan tertutup, bukan terbuka diam-diam. */
/* Satu izin Media -> satu aksi LAZDigital (view/create/edit/delete).
   Yang tak terdaftar dianggap 'edit' - sengaja ketat: izin baru yang lupa
   didaftarkan akan tertutup, bukan terbuka diam-diam. */
const PETA_IZIN = {
  'media.dasbor': 'view',
  'permohonan.lihat': 'view',
  'rekap.lihat': 'view',

  'permohonan.ajukan': 'create',

  'kerja.ambil': 'edit',
  'kerja.kirim': 'edit',

  /* Revisi dipetakan ke 'create', bukan 'edit'. Yang meminta revisi adalah
     PEMOHON, dan pemohon biasa tidak punya centang 'ubah' - itu centang tim
     media. Kalau revisi dipetakan ke 'edit', satu-satunya orang yang berhak
     menilai hasilnya justru tidak bisa mengatakan apa-apa. */
  'permohonan.revisi': 'create',

  'tim.lihat': 'delete',
  'tim.ubah': 'delete',
  'permohonan.bagi': 'delete',
};

function aksiLaz(izin) {
  return PETA_IZIN[String(izin || '')] || 'edit';
}

/* Label peran hanya untuk ditampilkan; yang menegakkan tetap centang izin. */
function labelPeran(u) {
  if (!u) return 'pemohon';
  if (u.role === 'superadmin') return 'superadmin';
  const b = (u.permissions || {})[MODUL] || {};
  if (b.delete) return 'koordinator';
  if (b.edit) return 'tim media';
  if (b.create) return 'pemohon';
  return 'pengamat';
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
    /* Jalur PostgreSQL memuat hanya tabel yang dibutuhkan pemeriksaan izin
       (Users, Sessions, Settings), bukan seluruh buku besar. Tanpa cabang
       ini, rpc._internal.muat() membaca Redis yang sudah tidak dipakai lagi,
       mengembalikan basis data KOSONG, dan setiap token ditolak. Gejalanya
       di layar: halaman modul terbuka sekejap lalu memantul balik ke dasbor,
       tanpa satu pun pesan galat. */
    if (lazpg.pakaiPostgres()) {
      u = await lazpg.cekIzin(engine, token, MODUL, 'view', ctxDari(req));
    } else {
      const r = await rpc._internal.muat();
      u = engine.cekIzin(r.db, token, MODUL, 'view', ctxDari(req));
    }
  } catch (e) {
    const pesan = (e && e.message) || '';
    if (req) req.__alasanMedia = /IZIN:/.test(pesan) ? 'izin' : 'auth';
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

/* Superadmin selalu boleh; selain itu ikut centang modul media. */
function bolehMedia(pengguna, izin) {
  const u = pengguna && pengguna._laz;
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  const b = (u.permissions || {})[MODUL] || {};
  return !!b[aksiLaz(izin)];
}

/* SEMUA YANG BOLEH MEMBUKA MODUL INI MELIHAT SEMUA PERMOHONAN.
 *
 * Ini keputusan pengelola, diambil sadar setelah akibatnya disebutkan: brief
 * kegiatan yang belum diumumkan ikut terbaca seluruh staff yang punya akses
 * modul Media. Yang ditukar dengan itu: tidak ada lagi dua orang mengajukan
 * flyer untuk acara yang sama, dan siapa pun bisa melihat antrean tim media
 * sedang sepanjang apa sebelum menuntut pekerjaannya didahulukan.
 *
 * Jadi fungsi ini sengaja tidak menyaring. Ia tetap ada, dan tetap dipanggil
 * di tempat yang seharusnya, supaya kalau suatu hari keputusannya berubah
 * yang perlu diubah cuma satu fungsi ini, bukan berburu penyaringan yang
 * tersebar di belasan tempat. */
function lihatSemua(pengguna) {
  return Boolean(pengguna && pengguna._laz);
}

/* Koordinator: boleh membagi ulang permohonan dan mengatur anggota tim. */
function koordinator(pengguna) {
  const u = pengguna && pengguna._laz;
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  return Boolean(((u.permissions || {})[MODUL] || {}).delete);
}
module.exports = {
  MODUL, penggunaLaz, bolehMedia, lihatSemua, koordinator,
  labelPeran, aksiLaz, PETA_IZIN, tokenDari,
};
