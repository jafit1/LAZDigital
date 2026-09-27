/* lib/fund/pencocok.js — mencocokkan catatan lapangan dengan buku kas utama.
 *
 * DUA SISI YANG HARUS DIPERTEMUKAN.
 * Fundraiser mencatat di lapangan: "Budi Santosa, Rp 250.000, 12 September".
 * Bendahara mencatat di buku Penghimpunan LAZDigital: baris dengan nama, jumlah,
 * dan nomor kwitansi. Keduanya sengaja berdiri sendiri, supaya selisihnya
 * terlihat alih-alih tertutup diam-diam. Berkas ini yang mempertemukannya.
 *
 * APA YANG BERUBAH, DAN KENAPA ITU KEPUTUSAN BESAR.
 * Dulu pencocokan SELURUHNYA manual: sistem cuma mengusulkan, petugas yang
 * menekan. Alasannya ditulis di kodenya sendiri, dan alasan itu masih benar:
 * salah cocok pada uang orang bukan hal yang boleh ditebak lalu ditulis
 * diam-diam. Sekarang pencocokan yang PERSIS dikerjakan sendiri oleh sistem,
 * atas permintaan pengelola, karena ratusan baris yang jelas-jelas sama
 * memakan waktu yang seharusnya dipakai memeriksa yang tidak sama.
 *
 * Yang menjaga perubahan itu tetap aman ada tiga:
 *
 *   1. HANYA YANG BENAR-BENAR TUNGGAL. Sebuah pasangan diterima hanya kalau
 *      catatan lapangannya punya SATU calon di buku utama, DAN calon itu juga
 *      cuma punya satu pelamar. Dua donatur bernama sama yang menyetor nominal
 *      sama di minggu yang sama TIDAK dicocokkan; keduanya ditandai "ganda"
 *      supaya diperiksa orang. Tanpa aturan dua arah ini, uang Budi yang satu
 *      bisa tercatat sebagai uang Budi yang lain, dan angkanya tetap terlihat
 *      benar di laporan.
 *
 *   2. DICAP "OTOMATIS". Tiap penandaan menyimpan siapa yang melakukannya.
 *      Hasil sistem bisa disaring dan dibatalkan berombongan; hasil manusia
 *      tidak ikut terbawa. Kalau suatu saat aturannya keliru, kekeliruannya
 *      bisa diurai, bukan tercampur selamanya dengan pekerjaan petugas.
 *
 *   3. ALASAN UNTUK YANG TIDAK COCOK. Yang gagal tidak dibiarkan kosong
 *      melainkan diberi sebab: namanya tidak ada di buku, nominalnya beda,
 *      tanggalnya terlalu jauh, atau calonnya lebih dari satu. Daftar "belum
 *      cocok" tanpa sebab hanya memindahkan pekerjaan menebak ke petugas.
 *
 * TOLERANSI TANGGAL TIGA HARI. Setoran lapangan masuk ke buku kas beberapa hari
 * kemudian, jadi menuntut tanggal yang sama persis akan menyisakan hampir
 * semuanya manual. Tetapi tanpa batas sama sekali, donatur rutin yang menyetor
 * nominal yang sama tiap bulan akan tercocokkan dengan bulan yang salah, dan
 * itu baru ketahuan saat laporan tahunan tidak seimbang.
 */
'use strict';

const TOLERANSI_HARI = 3;
const SEHARI_MS = 24 * 60 * 60 * 1000;

/* Nama dibandingkan setelah dirapikan: spasi ganda, huruf besar-kecil, dan
   spasi di ujung adalah selisih pengetikan, bukan selisih orang. Yang TIDAK
   dilakukan: menebak salah ketik. "Budi Santosa" dan "Budi Santoso" adalah dua
   nama berbeda sampai ada manusia yang menyatakan sebaliknya. */
function rapikanNama(nilai) {
  return String(nilai || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function angka(nilai) {
  const n = Math.round(Number(nilai) || 0);
  return Number.isFinite(n) ? n : 0;
}

function selisihHari(a, b) {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb) / SEHARI_MS;
}

const ALASAN = {
  TIDAK_ADA: 'tidak-ada',      /* namanya tidak ada sama sekali di buku utama */
  NOMINAL: 'nominal',          /* namanya ada, nominalnya tidak ada yang sama */
  TANGGAL: 'tanggal',          /* nama dan nominal ada, tetapi terlalu jauh harinya */
  GANDA: 'ganda',              /* lebih dari satu calon, atau calonnya diperebutkan */
  SUDAH: 'sudah',              /* sudah dicocokkan sebelumnya */
};

/* Mencari pasangan antara catatan lapangan dan baris buku utama.
 *
 * fund : [{ id, donaturNama, jumlah, tanggal, cocok: { sudah } }]
 * main : [{ id, nama, jumlah, tanggal, noKwitansi }]
 *
 * Mengembalikan { pasangan, alasan, calon } tanpa menyentuh basis data apa pun.
 * Pemisahan ini disengaja: aturan uang harus bisa diuji tanpa menyiapkan
 * seluruh dunia, dan yang menulis perubahannya cuma satu tempat di api/fund.js.
 */
function padankan(fund, main, opsi = {}) {
  const toleransi = Number.isFinite(opsi.toleransiHari) ? opsi.toleransiHari : TOLERANSI_HARI;
  const daftarFund = Array.isArray(fund) ? fund : [];
  const daftarMain = Array.isArray(main) ? main : [];

  /* Baris buku utama yang SUDAH dipakai catatan lain tidak boleh dipakai lagi.
     Tanpa ini, satu kwitansi bisa jadi bukti bagi dua setoran berbeda. */
  const terpakai = new Set(
    daftarFund.filter((f) => f.cocok && f.cocok.sudah && f.cocok.ref)
      .map((f) => String(f.cocok.ref)));

  const alasan = new Map();
  const calon = new Map();

  for (const f of daftarFund) {
    if (f.cocok && f.cocok.sudah) { alasan.set(f.id, ALASAN.SUDAH); continue; }

    const nama = rapikanNama(f.donaturNama);
    const jumlah = angka(f.jumlah);

    const senama = daftarMain.filter((m) => !terpakai.has(String(m.id))
      && rapikanNama(m.nama) === nama);
    if (!senama.length) { alasan.set(f.id, ALASAN.TIDAK_ADA); continue; }

    const senominal = senama.filter((m) => angka(m.jumlah) === jumlah);
    if (!senominal.length) { alasan.set(f.id, ALASAN.NOMINAL); continue; }

    const sewaktu = senominal.filter((m) => selisihHari(m.tanggal, f.tanggal) <= toleransi);
    if (!sewaktu.length) { alasan.set(f.id, ALASAN.TANGGAL); continue; }

    calon.set(f.id, sewaktu);
  }

  /* TUNGGAL DUA ARAH. Sebuah pasangan hanya sah kalau catatan lapangannya punya
     satu calon, DAN calon itu tidak diperebutkan catatan lain. Kalau dua setoran
     sama-sama menunjuk satu kwitansi, dua-duanya ditinggalkan untuk manusia:
     menebak salah satunya berarti menuliskan uang orang ke tempat yang salah,
     dan angka totalnya tetap terlihat benar sehingga tidak ada yang curiga. */
  const peminat = new Map();
  for (const [fid, daftar] of calon) {
    for (const m of daftar) {
      if (!peminat.has(m.id)) peminat.set(m.id, []);
      peminat.get(m.id).push(fid);
    }
  }

  const pasangan = [];
  for (const [fid, daftar] of calon) {
    if (daftar.length !== 1) { alasan.set(fid, ALASAN.GANDA); continue; }
    const m = daftar[0];
    if ((peminat.get(m.id) || []).length !== 1) { alasan.set(fid, ALASAN.GANDA); continue; }
    pasangan.push({ fundId: fid, mainId: m.id, ref: m.noKwitansi || m.id, main: m });
  }

  return { pasangan, alasan, calon };
}

/* Kalimat untuk dibaca petugas. Ditaruh di sini, bukan di tampilan, supaya
   alasan yang sama tidak diterjemahkan dua kali dengan kata yang berbeda. */
const KETERANGAN = {
  [ALASAN.TIDAK_ADA]: 'Nama ini belum ada di buku utama',
  [ALASAN.NOMINAL]: 'Namanya ada, tetapi tidak ada yang nominalnya sama',
  [ALASAN.TANGGAL]: 'Nama dan nominal cocok, tetapi tanggalnya terpaut lebih dari 3 hari',
  [ALASAN.GANDA]: 'Ada lebih dari satu kemungkinan, perlu diperiksa sendiri',
  [ALASAN.SUDAH]: 'Sudah dicocokkan',
};

module.exports = {
  TOLERANSI_HARI, ALASAN, KETERANGAN,
  padankan, rapikanNama, selisihHari,
};
