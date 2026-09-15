// lib/pengirim/index.js — pemilih driver pengirim WhatsApp
//
// Tiga driver yang bisa ditukar tanpa mengubah kode pemanggil:
//   sandbox — simulasi penuh, tidak butuh kredensial apa pun
//   fonnte  — gateway tidak resmi (dipakai LAZDigital saat ini)
//   meta    — WhatsApp Cloud API resmi Meta
//   mandiri — gateway WhatsApp Web milik lembaga sendiri (Baileys), yang
//             menarik pekerjaannya lewat /api/blast-agen
//
// Setiap driver menyediakan:
//   kirim({ nomor, isi, perangkat, setelan })  -> { idLuar, status, mentah }
//   sambungkan(perangkat, setelan)             -> { status, qr? }
//   periksa(perangkat, setelan)                -> { status, keterangan }

const sandbox = require('./sandbox');
const fonnte = require('./fonnte');
const meta = require('./meta');
const mandiri = require('./mandiri');

const DRIVER = { sandbox, fonnte, meta, mandiri };

function pilihDriver(setelan, perangkat) {
  const nama = (perangkat && perangkat.driver) || (setelan && setelan.pengirim && setelan.pengirim.driver) || 'sandbox';
  return DRIVER[nama] || sandbox;
}

module.exports = { DRIVER, pilihDriver };
