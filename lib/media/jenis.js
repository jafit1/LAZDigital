/* lib/media/jenis.js - jenis media yang boleh diminta, dan siapa yang mengerjakannya.
 *
 * SATU TABEL, BUKAN DUA. Jenis media dan bidang penanganannya ditulis di satu
 * tempat karena keduanya adalah satu keputusan: "Flyer dikerjakan desain
 * grafis" bukan dua fakta yang kebetulan cocok. Kalau dipisah, menambah jenis
 * baru berarti mengubah dua berkas, dan yang kedua pasti terlupa suatu hari.
 * Gejalanya nanti: permohonan yang tidak pernah muncul di kotak masuk siapa
 * pun, karena bidangnya kosong dan tidak ada yang merasa kebagian.
 *
 * KENAPA PEMBAGIANNYA DI SINI, BUKAN DIPILIH PEMOHON. Staff yang mengajukan
 * tidak perlu tahu tim media dibagi jadi berapa bagian; ia cuma tahu ia butuh
 * flyer. Membiarkannya memilih bidang berarti meminta orang menebak struktur
 * organisasi orang lain, dan tebakan yang salah membuat permohonan nyangkut di
 * kotak yang salah sampai ada yang mengeluh.
 */
'use strict';

const BIDANG = {
  FOTO: 'foto',
  VIDEO: 'video',
  DESAIN: 'desain',
};

const LABEL_BIDANG = {
  [BIDANG.FOTO]: 'Foto',
  [BIDANG.VIDEO]: 'Video',
  [BIDANG.DESAIN]: 'Desain Grafis',
};

/* Urutannya sengaja: yang paling sering diminta di atas, supaya daftar pilihan
   tidak perlu digulir untuk pekerjaan sehari-hari. */
const JENIS = [
  { kode: 'foto', label: 'Foto', bidang: BIDANG.FOTO,
    contoh: 'Dokumentasi kegiatan, foto penyaluran, foto produk' },
  { kode: 'video', label: 'Video', bidang: BIDANG.VIDEO,
    contoh: 'Liputan kegiatan, video pendek, reels' },
  { kode: 'flyer', label: 'Flyer / Poster', bidang: BIDANG.DESAIN,
    contoh: 'Pengumuman kegiatan, ajakan donasi, poster program' },
  { kode: 'banner', label: 'Banner / Spanduk', bidang: BIDANG.DESAIN,
    contoh: 'Backdrop panggung, spanduk kegiatan, roll banner' },
  { kode: 'sosmed', label: 'Desain Sosial Media', bidang: BIDANG.DESAIN,
    contoh: 'Feed Instagram, story, carousel' },
  { kode: 'sertifikat', label: 'Sertifikat / Piagam', bidang: BIDANG.DESAIN,
    contoh: 'Piagam peserta, sertifikat pelatihan, piagam penghargaan' },
  { kode: 'merchandise', label: 'Kaos / Merchandise', bidang: BIDANG.DESAIN,
    contoh: 'Kaos panitia, tumbler, totebag, lanyard' },
  { kode: 'profil', label: 'Company Profile', bidang: BIDANG.DESAIN,
    contoh: 'Profil lembaga, proposal berdesain, laporan tahunan' },
  /* PINTU KELUAR YANG DISENGAJA. Tanpa satu pilihan bebas, tiap permintaan
     yang tidak terduga memaksa menambah jenis baru dan deploy ulang, dan
     sementara menunggu itu orang kembali memakai WhatsApp. Diarahkan ke
     koordinator karena memang belum ada yang tahu ini pekerjaan siapa. */
  { kode: 'lainnya', label: 'Lainnya', bidang: '', bebas: true,
    contoh: 'Tuliskan sendiri di kolom keterangan; koordinator yang membagikan' },
];

const PETA = new Map(JENIS.map((j) => [j.kode, j]));

function ambilJenis(kode) {
  return PETA.get(String(kode || '').trim().toLowerCase()) || null;
}

function jenisSah(kode) {
  return PETA.has(String(kode || '').trim().toLowerCase());
}

/* Bidang yang menangani sebuah jenis. String kosong berarti belum ada yang
   memegang, dan itu BUKAN galat: jenis 'lainnya' memang menunggu koordinator.
   Yang dijaga di tempat lain: permohonan berbidang kosong harus terlihat oleh
   koordinator, kalau tidak ia hilang dari semua kotak masuk. */
function bidangUntuk(kode) {
  const j = ambilJenis(kode);
  return j ? (j.bidang || '') : '';
}

function labelJenis(kode) {
  const j = ambilJenis(kode);
  return j ? j.label : String(kode || '');
}

function bidangSah(kode) {
  return Object.values(BIDANG).includes(String(kode || '').trim().toLowerCase());
}

/* Jenis apa saja yang jatuh ke satu bidang. Dipakai halaman Tim Media untuk
   memperlihatkan konsekuensi mencentang sebuah bidang, supaya yang mencentang
   tahu ia sedang menyanggupi apa. */
function jenisBidang(bidang) {
  return JENIS.filter((j) => j.bidang === bidang).map((j) => j.kode);
}

module.exports = {
  BIDANG, LABEL_BIDANG, JENIS,
  ambilJenis, jenisSah, bidangUntuk, labelJenis, bidangSah, jenisBidang,
};
