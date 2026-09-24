// lib/ai/percakapan.js — sesi percakapan MILIK BERSAMA
//
// Berbeda dari donatur di modul Fundraising, sesi di sini TIDAK dimiliki
// siapa pun: semua pengguna modul AI melihat, membuka, dan melanjutkan sesi
// yang sama. Itu keputusan yang diminta, dan konsekuensinya dicatat di sini
// supaya tidak terlupa: apa pun yang diketik seseorang ke dalam percakapan
// akan terbaca seluruh tim. Karena itu modul ini tidak pernah menyelipkan data
// pribadi donatur ke dalam prompt (lihat lib/ai/ringkas.js).

const db = require('./db');
const util = require('../blast/util');
const { id, sekarang, bersihkanTeks } = util;

const KUNCI = (i) => `sesi:${i}`;
const DAFTAR = 'sesi:daftar';

/* Batas dijaga di dua tempat sekaligus: jumlah pesan supaya satu sesi tidak
   tumbuh tanpa akhir, dan panjang satu pesan supaya satu tempelan raksasa
   tidak membuat seluruh sesi gagal disimpan. */
const MAKS_PESAN = 300;
const MAKS_ISI = 60000;

async function semua() {
  const ids = await db.anggotaHimpunan(DAFTAR);
  if (!ids.length) return [];
  return (await db.ambilBanyak(ids.map(KUNCI))).filter(Boolean);
}

async function ambil(sesiId) {
  return db.ambil(KUNCI(sesiId));
}

/* Judul otomatis dari kalimat pertama. Sesi tanpa judul yang menumpuk sebagai
   "Percakapan baru" membuat daftar bersama tidak bisa dipakai siapa pun. */
function judulDari(teks) {
  const s = bersihkanTeks(teks, 80).replace(/\s+/g, ' ').trim();
  if (!s) return 'Percakapan baru';
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

async function buat({ judul, penyediaId, personaId, model }, pengguna) {
  const s = {
    id: id('s_'),
    judul: bersihkanTeks(judul, 100) || 'Percakapan baru',
    penyediaId: bersihkanTeks(penyediaId, 40),
    personaId: bersihkanTeks(personaId, 40),
    model: bersihkanTeks(model, 80),
    olehId: pengguna ? String(pengguna.id) : '',
    olehNama: pengguna ? pengguna.nama : '',
    pesan: [],
    dibuat: sekarang(),
    diubah: sekarang(),
  };
  await db.simpan(KUNCI(s.id), s);
  await db.tambahKeHimpunan(DAFTAR, s.id);
  return s;
}

async function tambahPesan(sesiId, { peran, isi, olehNama, olehId, model, penyedia, token, terpotong, lampiran }) {
  const s = await ambil(sesiId);
  if (!s) throw new util.GalatAplikasi('Percakapan tidak ditemukan', 404);
  const p = {
    id: id('m_'),
    peran: peran === 'assistant' ? 'assistant' : 'user',
    isi: String(isi || '').slice(0, MAKS_ISI),
    olehId: olehId || '',
    olehNama: olehNama || '',
    model: model || '',
    penyedia: penyedia || '',
    token: token || null,
    terpotong: Boolean(terpotong),
    /* METADATA lampiran saja — berkas mentahnya hidup di kuncinya sendiri
       dengan umur terbatas (lihat lib/ai/lampiran.js). Hasil bacaannya ikut di
       sini, dan itu yang membuat isi berkas tetap bisa dicari lama setelah
       berkasnya sendiri hilang. */
    lampiran: Array.isArray(lampiran) ? lampiran : [],
    waktu: sekarang(),
  };
  s.pesan = (s.pesan || []).concat([p]);
  /* Yang dipotong yang PALING TUA. Memotong yang terbaru berarti membuang
     justru bagian yang sedang dibicarakan. */
  if (s.pesan.length > MAKS_PESAN) s.pesan = s.pesan.slice(-MAKS_PESAN);
  if ((!s.judul || s.judul === 'Percakapan baru') && p.peran === 'user') {
    /* Pertanyaan yang isinya cuma lampiran ("tolong baca ini" pun kadang tidak
       diketik) tetap harus punya judul yang bisa dikenali di daftar bersama. */
    s.judul = judulDari(p.isi || (p.lampiran[0] ? p.lampiran[0].nama : ''));
  }
  s.diubah = sekarang();
  await db.simpan(KUNCI(s.id), s);
  return { sesi: s, pesan: p };
}

/* Dipakai tombol "ulangi": membuang jawaban terakhir supaya bisa diminta lagi
   tanpa meninggalkan dua jawaban berturut-turut di riwayat. */
async function buangJawabanTerakhir(sesiId) {
  const s = await ambil(sesiId);
  if (!s) throw new util.GalatAplikasi('Percakapan tidak ditemukan', 404);
  const p = s.pesan || [];
  if (p.length && p[p.length - 1].peran === 'assistant') {
    s.pesan = p.slice(0, -1);
    s.diubah = sekarang();
    await db.simpan(KUNCI(s.id), s);
  }
  return s;
}

async function ubah(sesiId, data) {
  const s = await ambil(sesiId);
  if (!s) throw new util.GalatAplikasi('Percakapan tidak ditemukan', 404);
  if (data.judul !== undefined) s.judul = bersihkanTeks(data.judul, 100) || s.judul;
  if (data.penyediaId !== undefined) s.penyediaId = bersihkanTeks(data.penyediaId, 40);
  if (data.personaId !== undefined) s.personaId = bersihkanTeks(data.personaId, 40);
  if (data.model !== undefined) s.model = bersihkanTeks(data.model, 80);
  s.diubah = sekarang();
  await db.simpan(KUNCI(s.id), s);
  return s;
}

async function hapus(sesiId) {
  const s = await ambil(sesiId);
  if (!s) throw new util.GalatAplikasi('Percakapan tidak ditemukan', 404);
  await db.hapus(KUNCI(sesiId));
  await db.keluarDariHimpunan(DAFTAR, sesiId);
  return s;
}

/* Daftar sesi TANPA isi pesannya — daftar riwayat hanya perlu judul dan
   cuplikan. Mengirim seluruh isi percakapan hanya untuk menggambar sebuah
   daftar adalah cara paling cepat membuat halaman ini terasa berat. */
async function daftar({ cari = '' } = {}) {
  let isi = await semua();
  if (cari) {
    const q = String(cari).toLowerCase();
    /* Hasil bacaan berkas ikut dicari. Inilah yang membuat "berkasnya sudah
       kedaluwarsa" tidak berarti "isinya hilang": nama dan isi bacaan PDF atau
       Excel yang pernah dilampirkan tetap bisa ditemukan bertahun kemudian. */
    const cocok = (p) => String(p.isi).toLowerCase().includes(q)
      || (p.lampiran || []).some((l) => String(l.nama).toLowerCase().includes(q)
        || String(l.teks || '').toLowerCase().includes(q));
    isi = isi.filter((s) => String(s.judul).toLowerCase().includes(q)
      || (s.pesan || []).some(cocok));
  }
  isi.sort((a, b) => String(b.diubah).localeCompare(String(a.diubah)));
  return isi.map((s) => {
    const pesan = s.pesan || [];
    const akhir = pesan[pesan.length - 1];
    return {
      id: s.id, judul: s.judul, olehNama: s.olehNama,
      dibuat: s.dibuat, diubah: s.diubah,
      jumlahPesan: pesan.length,
      cuplikan: akhir ? String(akhir.isi).replace(/\s+/g, ' ').slice(0, 120) : '',
      model: akhir ? akhir.model : '',
      jumlahLampiran: pesan.reduce((n, p) => n + ((p.lampiran || []).length), 0),
    };
  });
}

module.exports = {
  KUNCI, DAFTAR, MAKS_PESAN, MAKS_ISI,
  semua, ambil, buat, tambahPesan, buangJawabanTerakhir, ubah, hapus, daftar, judulDari,
};
