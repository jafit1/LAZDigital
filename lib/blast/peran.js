const sesiLaz = require('./sesi-laz');
// lib/peran.js — peran dan izin
//
// Penyaringan hak akses SELALU dikerjakan di server (lihat lib/auth.js >
// wajibIzin). Menu yang disembunyikan di tampilan hanyalah kenyamanan,
// bukan pengaman.

const PERAN = {
  superadmin: {
    label: 'Superadmin',
    keterangan: 'Akses penuh termasuk pengguna, pemulihan data, dan penyamaran akun',
  },
  admin: {
    label: 'Admin Daerah',
    keterangan: 'Mengelola seluruh perangkat, kontak, kiriman, dan laporan',
  },
  penyelia: {
    label: 'Penyelia',
    keterangan: 'Mengawasi percakapan dan kiriman, tanpa mengubah pengaturan sistem',
  },
  petugas: {
    label: 'Petugas / Amil',
    keterangan: 'Membalas percakapan dan mengirim pesan yang ditugaskan',
  },
  kll: {
    label: 'Pengurus KLL/ULL',
    keterangan: 'Hanya melihat kontak, percakapan, dan laporan kantornya sendiri',
  },
};

// Daftar izin; '*' berarti seluruh izin.
const IZIN = {
  superadmin: ['*'],
  admin: [
    'dasbor', 'perangkat.lihat', 'perangkat.ubah',
    'kontak.lihat', 'kontak.ubah', 'kontak.impor',
    'pesan.kirim', 'pesan.lihat', 'massal.kelola',
    'inbox.lihat', 'inbox.balas',
    'laporan.lihat', 'setelan.lihat', 'setelan.ubah',
    'pengguna.lihat', 'pengguna.ubah', 'audit.lihat',
  ],
  penyelia: [
    'dasbor', 'perangkat.lihat',
    'kontak.lihat', 'kontak.ubah',
    'pesan.kirim', 'pesan.lihat', 'massal.kelola',
    'inbox.lihat', 'inbox.balas',
    'laporan.lihat', 'setelan.lihat', 'audit.lihat',
  ],
  petugas: [
    'dasbor', 'perangkat.lihat',
    'kontak.lihat', 'kontak.ubah',
    'pesan.kirim', 'pesan.lihat',
    'inbox.lihat', 'inbox.balas',
  ],
  kll: [
    'dasbor', 'kontak.lihat', 'pesan.lihat', 'inbox.lihat', 'laporan.lihat',
  ],
};

/* DIGABUNG KE LAZDIGITAL: yang menentukan boleh-tidaknya adalah centang
   modul "broadcast" pada akun LAZDigital, bukan peran Blast. Daftar IZIN di
   atas tinggal dipakai untuk menampilkan menu; kalau ia ikut menentukan,
   akun yang cuma dicentang "lihat" bisa naik jadi bisa mengirim hanya karena
   perannya ditebak "petugas". */
function punyaIzin(pengguna, izin) {
  if (!pengguna) return false;
  if (pengguna._laz) return sesiLaz.bolehLaz(pengguna, izin);
  /* Jalur lama (Blast berdiri sendiri) tetap ada supaya bisa diuji terpisah. */
  const daftar = IZIN[pengguna.peran] || [];
  return daftar.includes('*') || daftar.includes(izin);
}

// Peran "kll" dikunci ke satu kantor layanan. Kembalikan nama kantor
// bila pengguna memang dibatasi, atau null bila bebas.
function kantorTerkunci(pengguna) {
  if (!pengguna) return null;
  if (pengguna.peran !== 'kll') return null;
  return pengguna.kantor || '__tanpa-kantor__';
}

module.exports = { PERAN, IZIN, punyaIzin, kantorTerkunci };
