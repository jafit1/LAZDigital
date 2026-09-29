/* lib/media/tim.js - siapa anggota tim media, dan memegang bidang apa.
 *
 * KENAPA MODUL INI PUNYA DAFTARNYA SENDIRI.
 * Izin LAZDigital cuma punya empat centang per modul: lihat, tambah, ubah,
 * hapus. Empat centang tidak bisa menyatakan "orang ini memegang foto dan
 * video, tetapi bukan desain grafis" - itu tiga keadaan yang berdiri sendiri,
 * bukan satu tangga dari sedikit ke banyak.
 *
 * Memaksakannya ke empat centang itu berarti menyandera arti 'edit' menjadi
 * "bidang foto" dan 'hapus' menjadi "bidang video", dan sejak saat itu tidak
 * ada seorang pun yang bisa membaca tabel izin dan tahu artinya. Jadi bidang
 * disimpan di sini, dan empat centang LAZDigital tetap berarti apa adanya:
 *
 *   lihat  - boleh membuka modul Media
 *   tambah - boleh mengajukan permohonan
 *   ubah   - boleh mengerjakan permohonan (tim media)
 *   hapus  - koordinator: melihat semua, membagi ulang, merekap
 *
 * SATU ORANG BOLEH LEBIH DARI SATU BIDANG. Di lembaga sebesar ini yang
 * memegang kamera sering juga yang mengedit videonya. Memaksa satu orang satu
 * bidang akan membuat separuh permohonan mendarat di kotak yang salah sejak
 * hari pertama.
 *
 * YANG TIDAK DILAKUKAN: membuat akun sendiri. Anggota tim media adalah akun
 * LAZDigital yang sudah ada; di sini hanya dicatat bidangnya. Akun kedua untuk
 * orang yang sama adalah cara tercepat membuat sandi tercecer.
 */
'use strict';

const db = require('./db');
const { bidangSah } = require('./jenis');

const KUNCI = (userId) => `tim:${userId}`;
const DAFTAR = 'tim:daftar';

function bersih(teks, maks) {
  return String(teks === null || teks === undefined ? '' : teks).trim().slice(0, maks);
}

async function semua() {
  const ids = await db.anggotaHimpunan(DAFTAR);
  if (!ids.length) return [];
  return (await db.ambilBanyak(ids.map(KUNCI))).filter(Boolean);
}

async function ambil(userId) {
  if (!userId) return null;
  return db.ambil(KUNCI(userId));
}

/* Bidang seseorang. Mengembalikan array kosong kalau ia bukan tim media, dan
   itu jawaban yang benar: bukan galat, cuma bukan bagiannya. */
async function bidangPunya(userId) {
  const t = await ambil(userId);
  if (!t || t.aktif === false) return [];
  return Array.isArray(t.bidang) ? t.bidang : [];
}

/* Menyimpan penugasan. Bidang yang tidak dikenal DIBUANG, bukan disimpan apa
   adanya: satu salah ketik yang tersimpan berarti orang itu memegang bidang
   yang tidak pernah menerima permohonan apa pun, dan dari layar ia terlihat
   seperti sudah ditugaskan. */
async function simpan({ userId, nama, bidang, catatan, aktif }) {
  const uid = bersih(userId, 80);
  if (!uid) throw new Error('Akun belum dipilih.');

  const dipakai = (Array.isArray(bidang) ? bidang : [])
    .map((b) => bersih(b, 20).toLowerCase())
    .filter((b, i, a) => bidangSah(b) && a.indexOf(b) === i);

  const lama = (await ambil(uid)) || {};
  const rec = {
    userId: uid,
    nama: bersih(nama, 120) || lama.nama || uid,
    bidang: dipakai,
    catatan: bersih(catatan, 200),
    aktif: aktif === undefined ? (lama.aktif === undefined ? true : lama.aktif) : Boolean(aktif),
    dibuat: lama.dibuat || new Date().toISOString(),
    diubah: new Date().toISOString(),
  };
  await db.simpan(KUNCI(uid), rec);
  await db.tambahKeHimpunan(DAFTAR, uid);
  return rec;
}

async function hapus(userId) {
  const uid = bersih(userId, 80);
  if (!uid) return false;
  await db.hapus(KUNCI(uid));
  await db.keluarDariHimpunan(DAFTAR, uid);
  return true;
}

/* Siapa saja yang memegang sebuah bidang. Dipakai halaman rekap untuk
   menjawab "bidang video dipegang siapa" tanpa memindai seluruh daftar. */
async function pemegang(bidang) {
  const b = bersih(bidang, 20).toLowerCase();
  return (await semua()).filter((t) => t.aktif !== false && (t.bidang || []).includes(b));
}

/* BIDANG YANG TIDAK ADA PEMEGANGNYA. Ini pertanyaan yang jarang ditanyakan
   sampai terlambat: permohonan video yang masuk ke bidang tanpa satu pun orang
   akan diam di sana sampai deadline lewat, tanpa ada yang merasa bersalah
   karena memang tidak ada yang tahu. Halaman koordinator memakainya untuk
   memperingatkan lebih dulu. */
async function bidangKosong(daftarBidang) {
  const isi = await semua();
  return daftarBidang.filter((b) =>
    !isi.some((t) => t.aktif !== false && (t.bidang || []).includes(b)));
}

module.exports = { KUNCI, DAFTAR, semua, ambil, bidangPunya, simpan, hapus, pemegang, bidangKosong };
