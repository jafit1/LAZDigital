// lib/fund/akun.js — profil fundraiser (nama tampil, foto, dan NAMA FUNDRAISING)
//
// "Nama fundraising" adalah kunci yang mempertemukan catatan modul ini dengan
// kolom `fundraising` pada buku Penghimpunan utama LAZDigital. Ia disimpan di
// sini, bukan ditebak dari nama akun, karena satu orang bisa mencatat atas nama
// tim tertentu ("Tim Bantul Kota") yang berbeda dari nama pribadinya.

const db = require('./db');
const util = require('../blast/util');
const { sekarang, bersihkanTeks } = util;

const KUNCI = (uid) => `akun:${uid}`;

/* Foto disimpan sebagai data URL. Dibatasi ketat: Redis bukan tempat menyimpan
   foto besar, dan tampilan yang menunggu 2 MB base64 tiap muat terasa rusak.
   ~180 KB cukup untuk pas foto yang sudah diperkecil di sisi tampilan. */
const BATAS_FOTO = 180 * 1024;

function bersihkanFoto(foto) {
  const s = String(foto || '');
  if (!s) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(s)) {
    throw new util.GalatAplikasi('Foto harus berupa gambar (PNG/JPG/WebP).');
  }
  if (s.length > BATAS_FOTO) {
    throw new util.GalatAplikasi('Foto terlalu besar. Pilih gambar yang lebih kecil (maks ~180 KB).');
  }
  return s;
}

/* Profil selalu ada — kalau belum pernah disimpan, dibangun dari akun
   LAZDig-nya supaya halaman tidak pernah menampilkan medan kosong tanpa sebab. */
async function ambilAkun(pengguna) {
  const uid = String(pengguna.id);
  const tersimpan = (await db.ambil(KUNCI(uid))) || {};
  return {
    userId: uid,
    namaTampil: tersimpan.namaTampil || pengguna.nama || 'Fundraiser',
    namaFundraising: tersimpan.namaFundraising || pengguna.nama || '',
    foto: tersimpan.foto || '',
    telepon: tersimpan.telepon || '',
    catatan: tersimpan.catatan || '',
    dibuat: tersimpan.dibuat || '',
    diubah: tersimpan.diubah || '',
  };
}

async function simpanAkun(pengguna, data) {
  const uid = String(pengguna.id);
  const lama = await ambilAkun(pengguna);
  const baru = {
    userId: uid,
    namaTampil: bersihkanTeks(data.namaTampil, 80) || lama.namaTampil,
    namaFundraising: bersihkanTeks(data.namaFundraising, 60) || lama.namaFundraising,
    telepon: util.normalkanNomor(data.telepon || '') || lama.telepon,
    catatan: bersihkanTeks(data.catatan, 300),
    /* foto: string kosong berarti "hapus foto"; undefined berarti "jangan
       sentuh". Dibedakan supaya menyimpan perubahan lain tidak diam-diam
       menghapus fotonya. */
    foto: data.foto === undefined ? lama.foto : bersihkanFoto(data.foto),
    dibuat: lama.dibuat || sekarang(),
    diubah: sekarang(),
  };
  await db.simpan(KUNCI(uid), baru);
  return baru;
}

/* Nama fundraising yang dipakai untuk mencap catatan penghimpunan & mencocokkan.
   Dipisah jadi fungsi supaya api/fund.js tidak perlu membaca seluruh profil
   hanya demi satu medan. */
async function namaFundraising(pengguna) {
  const a = await ambilAkun(pengguna);
  return a.namaFundraising || pengguna.nama || '';
}

module.exports = { KUNCI, BATAS_FOTO, ambilAkun, simpanAkun, namaFundraising };
