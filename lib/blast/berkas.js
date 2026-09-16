// lib/blast/berkas.js — lampiran pesan (PDF, gambar, dan sejenisnya)
//
// Berkasnya disimpan di Redis, bukan di sistem berkas: LAZDigital berjalan di
// Vercel, yang sistem berkasnya hanya bisa dibaca dan setiap pemanggilan berdiri
// sendiri — apa pun yang ditulis ke disk hilang beberapa detik kemudian.
//
// Yang disimpan di sini adalah lampiran yang MENUNGGU dikirim, bukan arsip.
// Umurnya dibatasi tujuh hari: cukup lama untuk kiriman massal yang dijadwalkan,
// cukup pendek supaya tagihan penyimpanan tidak menumpuk oleh berkas yang sudah
// tidak ada gunanya.

const db = require('./db');
const { id, sekarang, bersihkanTeks } = require('./util');

const KUNCI = (berkasId) => `berkas:${berkasId}`;
const KUNCI_ISI = (berkasId) => `berkas:isi:${berkasId}`;
const UMUR_DETIK = 7 * 24 * 60 * 60;

/* Vercel menolak badan permintaan di atas ~4,5 MB, dan base64 membengkakkan
   ukuran berkas sekitar sepertiga. Jadi batas aslinya 3 MB — diperiksa di sini
   supaya petugas mendapat penjelasan, bukan galat jaringan tanpa keterangan. */
const BATAS_BYTE = 3 * 1024 * 1024;

/* Jenis yang benar-benar bisa dikirim WhatsApp sebagai lampiran. Daftar putih,
   bukan daftar hitam: yang tidak dikenal ditolak dengan penjelasan, bukan
   diterima lalu gagal diam-diam di gateway. */
const JENIS = {
  'application/pdf': 'dokumen',
  'image/jpeg': 'gambar',
  'image/png': 'gambar',
  'image/webp': 'gambar',
  'video/mp4': 'video',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'application/msword': 'dokumen',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'dokumen',
  'application/vnd.ms-excel': 'dokumen',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'dokumen',
};

function rapikanNama(nama) {
  /* Nama berkas ikut sampai ke WhatsApp dan ke sistem berkas gateway, jadi
     karakter yang bisa dipakai keluar dari folder dibuang di sini. */
  const bersih = bersihkanTeks(String(nama || 'lampiran'), 120)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\.{2,}/g, '.')      // ".." tidak boleh tersisa di mana pun
    .replace(/^[.\s_]+/, '')
    .trim();
  return bersih || 'lampiran';
}

function ukuranBase64(b64) {
  const isi = String(b64 || '').replace(/^data:[^,]*,/, '');
  const padding = (isi.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor(isi.length * 3 / 4) - padding);
}

async function simpanBerkas({ nama, tipe, base64 }) {
  const jenis = JENIS[String(tipe || '').toLowerCase()];
  if (!jenis) {
    throw Object.assign(new Error(
      `Jenis berkas "${tipe || 'tidak dikenal'}" belum didukung. Yang bisa dikirim: PDF, JPG, PNG, WebP, MP4, MP3, Word, dan Excel.`), { kode: 400 });
  }
  const isi = String(base64 || '').replace(/^data:[^,]*,/, '');
  const byte = ukuranBase64(isi);
  if (!byte) throw Object.assign(new Error('Berkasnya kosong'), { kode: 400 });
  if (byte > BATAS_BYTE) {
    throw Object.assign(new Error(
      `Berkas ${(byte / 1024 / 1024).toFixed(1)} MB melebihi batas ${(BATAS_BYTE / 1024 / 1024).toFixed(0)} MB. `
      + 'Kecilkan dulu, atau kirim tautannya saja di dalam teks pesan.'), { kode: 413 });
  }

  const berkasId = id('f_');
  const berkas = {
    id: berkasId,
    nama: rapikanNama(nama),
    tipe: String(tipe).toLowerCase(),
    jenis,
    byte,
    dibuat: sekarang(),
  };
  /* Keterangan dan isinya dipisah: daftar lampiran bisa dibaca tanpa ikut
     menarik berkas berukuran megabita dari Redis. */
  await db.simpan(KUNCI_ISI(berkasId), isi, { detik: UMUR_DETIK });
  await db.simpan(KUNCI(berkasId), berkas, { detik: UMUR_DETIK });
  return berkas;
}

async function ambilKeterangan(berkasId) {
  if (!berkasId) return null;
  return db.ambil(KUNCI(berkasId));
}

async function ambilIsi(berkasId) {
  if (!berkasId) return null;
  const keterangan = await db.ambil(KUNCI(berkasId));
  if (!keterangan) return null;
  const base64 = await db.ambil(KUNCI_ISI(berkasId));
  if (!base64) return null;
  return { ...keterangan, base64 };
}

module.exports = { simpanBerkas, ambilKeterangan, ambilIsi, JENIS, BATAS_BYTE, UMUR_DETIK, KUNCI, KUNCI_ISI };
