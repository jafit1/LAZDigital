// lib/ai/lampiran.js — berkas yang dilampirkan ke pertanyaan
//
// DUA UMUR YANG BERBEDA, DAN ITU DISENGAJA.
//
// 1. ISI BACAAN (teks hasil pembacaan PDF/Word/Excel, nama berkas, ukuran)
//    ikut tersimpan DI DALAM dokumen percakapan — kecil, dan karena ikut
//    percakapan ia bisa dicari selamanya lewat kotak "Cari percakapan".
// 2. BERKAS MENTAHNYA (terutama gambar, yang besar) disimpan TERPISAH, satu
//    kunci sendiri di Redis, dengan umur terbatas. Lewat umurnya ia hilang
//    dengan sendirinya; namanya, ukurannya, dan hasil bacaannya tetap ada.
//
// Kalau gambar ikut ditaruh di dalam dokumen percakapan, seluruh dokumen itu
// dibaca dan ditulis ulang SETIAP KALI ada yang bertanya di sesi tersebut.
// Satu percakapan berisi sepuluh foto akan memindahkan beberapa megabyte
// bolak-balik pada tiap giliran — lambat, mahal, dan pada akhirnya gagal
// disimpan. Memisahkannya membuat dokumen percakapan tetap ringan berapa pun
// banyaknya foto yang pernah dikirim.

const db = require('./db');
const util = require('../blast/util');
const { id, sekarang, bersihkanTeks } = util;

const KUNCI = (i) => `lampiran:${i}`;

/* Umur berkas mentah. 30 hari cukup untuk "coba lihat lagi foto kwitansi
   minggu lalu", dan pendek untuk menahan basis data agar tidak menggelembung
   tanpa batas. Angkanya ditampilkan ke pengguna, bukan disembunyikan. */
const SIMPAN_HARI = 30;

const MAKS_PER_PESAN = 4;
/* Panjang base64, bukan byte asli — base64 kira-kira 1,37x ukuran berkas,
   jadi 1,4 juta huruf ini kira-kira gambar 1 MB. Browser sudah mengecilkan
   gambarnya dulu; batas ini pagar terakhir bila pengecilannya gagal. */
const MAKS_DATA = 1400000;
const MAKS_TEKS = 30000;          // hasil bacaan satu berkas
const MAKS_TEKS_TOTAL = 60000;    // hasil bacaan seluruh berkas dalam satu pesan

/* Daftar IZIN, bukan daftar larangan — jenis berkas yang tidak dikenal
   tertutup dengan sendirinya. */
const GAMBAR_BOLEH = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function jenisDari(mime, punyaData) {
  if (punyaData && GAMBAR_BOLEH.includes(String(mime))) return 'gambar';
  return 'teks';
}

/* Nama berkas dari komputer orang lain tidak pernah dipercaya: ia muncul di
   halaman yang dibuka seluruh tim dan ikut masuk ke prompt. Jalur folder
   dibuang, dan panjangnya dipangkas. */
function bersihkanNama(n) {
  const dasar = String(n || 'berkas').split(/[\\/]/).pop();
  return bersihkanTeks(dasar, 120) || 'berkas';
}

/* Menyimpan lampiran satu pesan. Yang dikembalikan adalah METADATA saja —
   itulah yang boleh ikut ke dalam dokumen percakapan. */
async function simpanBanyak(daftar, pengguna) {
  const masuk = Array.isArray(daftar) ? daftar : [];
  if (!masuk.length) return [];
  if (masuk.length > MAKS_PER_PESAN) {
    throw new util.GalatAplikasi(`Maksimal ${MAKS_PER_PESAN} berkas per pertanyaan.`, 400);
  }

  const keluar = [];
  let totalTeks = 0;

  for (const b of masuk) {
    const mime = bersihkanTeks(b.mime, 100);
    const data = typeof b.data === 'string' ? b.data : '';
    const jenis = jenisDari(mime, Boolean(data));

    if (jenis === 'gambar' && data.length > MAKS_DATA) {
      throw new util.GalatAplikasi(
        `Gambar "${bersihkanNama(b.nama)}" terlalu besar setelah dikecilkan. Coba potong atau kecilkan dulu.`, 400);
    }

    let teks = String(b.teks || '').slice(0, MAKS_TEKS);
    if (totalTeks + teks.length > MAKS_TEKS_TOTAL) {
      teks = teks.slice(0, Math.max(0, MAKS_TEKS_TOTAL - totalTeks));
    }
    totalTeks += teks.length;

    if (jenis !== 'gambar' && !teks.trim()) {
      throw new util.GalatAplikasi(
        `Berkas "${bersihkanNama(b.nama)}" tidak berisi teks yang bisa dibaca.`, 400);
    }

    const meta = {
      id: id('lp_'),
      nama: bersihkanNama(b.nama),
      mime: mime || (jenis === 'gambar' ? 'image/jpeg' : 'text/plain'),
      jenis,
      ukuran: Number(b.ukuran) || 0,
      teks,
      halaman: Number(b.halaman) || 0,
      terpotong: Boolean(b.terpotong) || teks.length >= MAKS_TEKS,
      adaBerkas: jenis === 'gambar',
      kedaluwarsa: jenis === 'gambar'
        ? new Date(Date.now() + SIMPAN_HARI * 86400 * 1000).toISOString() : '',
      oleh: pengguna ? pengguna.nama : '',
      dibuat: sekarang(),
    };

    if (jenis === 'gambar') {
      /* Umur dipasang di sini, bukan lewat pembersihan berkala. Pembersihan
         berkala adalah pekerjaan yang harus diingat dan bisa gagal diam-diam;
         umur pada kuncinya dijalankan basis data sendiri. */
      await db.simpan(KUNCI(meta.id), { mime: meta.mime, data }, { detik: SIMPAN_HARI * 86400 });
    }

    keluar.push(meta);
  }
  return keluar;
}

/* Berkas mentahnya. null berarti sudah lewat umur — pemanggil harus
   memperlakukan itu sebagai keadaan biasa, bukan galat. */
async function ambilData(lampiranId) {
  return db.ambil(KUNCI(lampiranId));
}

/* Bentuk yang dipahami adapter provider. Gambar yang sudah kedaluwarsa
   diturunkan jadi catatan teks, supaya pertanyaan lanjutan tentang gambar lama
   tetap masuk akal alih-alih menghilang tanpa penjelasan. */
async function untukModel(metaDaftar) {
  const keluar = [];
  for (const m of metaDaftar || []) {
    if (m.jenis === 'gambar') {
      const isi = m.adaBerkas ? await ambilData(m.id) : null;
      if (isi && isi.data) {
        keluar.push({ jenis: 'gambar', mime: isi.mime || m.mime, data: isi.data, nama: m.nama });
        continue;
      }
      keluar.push({
        jenis: 'teks', nama: m.nama,
        teks: `[Gambar "${m.nama}" sudah lewat masa simpan ${SIMPAN_HARI} hari dan tidak bisa dilihat lagi.]`,
      });
      continue;
    }
    if (m.teks) {
      keluar.push({
        jenis: 'teks', nama: m.nama,
        teks: `--- Isi berkas "${m.nama}"${m.halaman ? ` (${m.halaman} halaman)` : ''} ---\n`
          + m.teks + (m.terpotong ? '\n[…isi berkas dipotong karena terlalu panjang]' : ''),
      });
    }
  }
  return keluar;
}

/* Yang ikut tersimpan di dokumen percakapan: tanpa data mentah. Hasil bacaan
   TETAP dibawa — itulah yang membuat isi berkas bisa dicari lagi bertahun
   kemudian, jauh setelah berkasnya sendiri kedaluwarsa. */
function untukSimpan(metaDaftar) {
  return (metaDaftar || []).map((m) => ({ ...m, data: undefined }));
}

/* Untuk ditampilkan di layar: hasil bacaan dipangkas supaya daftar percakapan
   tidak ikut membawa isi lengkap sebuah PDF. */
function untukTampilan(metaDaftar) {
  return (metaDaftar || []).map((m) => ({
    id: m.id, nama: m.nama, mime: m.mime, jenis: m.jenis, ukuran: m.ukuran,
    halaman: m.halaman, terpotong: m.terpotong, adaBerkas: m.adaBerkas,
    kedaluwarsa: m.kedaluwarsa,
    cuplikan: m.jenis === 'teks' ? String(m.teks || '').replace(/\s+/g, ' ').slice(0, 160) : '',
    panjangTeks: String(m.teks || '').length,
  }));
}

module.exports = {
  KUNCI, SIMPAN_HARI, MAKS_PER_PESAN, MAKS_DATA, MAKS_TEKS, MAKS_TEKS_TOTAL, GAMBAR_BOLEH,
  simpanBanyak, ambilData, untukModel, untukSimpan, untukTampilan, bersihkanNama,
};
