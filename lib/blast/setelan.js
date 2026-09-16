// lib/setelan.js — setelan yang bisa diubah dari dasbor tanpa deploy ulang

const db = require('./db');

/* Batas bawah jeda antar pesan, dalam detik. Dipakai bersama oleh nilai bawaan,
   penjagaan di simpanSetelan, dan tampilan — supaya ketiganya tidak bisa
   berbeda diam-diam. */
const JEDA_MIN_DETIK = 30;

const BAWAAN = {
  lembaga: {
    nama: 'LAZISMU Daerah Bantul',
    singkatan: 'Lazismu Bantul',
    alamat: 'Jl. Jenderal Sudirman, Bantul, D.I. Yogyakarta',
    telepon: '',
    surel: '',
    situs: 'https://lazdigital.my.id',
    penandatangan: 'Ketua Badan Pengurus',
  },
  pengirim: {
    driver: process.env.PENGIRIM || 'sandbox', // sandbox | fonnte | meta
    kodeNegara: process.env.KODE_NEGARA || '62',
    efekMengetik: true,
  },
  kirim: {
    /* Jeda acak antar pesan. Batas bawahnya 30 detik dan dikunci di
       simpanSetelan — bukan sekadar nilai bawaan. Nomor pribadi yang
       menyemburkan pesan beruntun adalah pola yang dikenali WhatsApp, dan
       hukumannya jatuh ke nomor itu sendiri, bukan ke aplikasi ini. */
    jedaMinDetik: 30,
    jedaMaksDetik: 60,
    jamMulai: 8,            // jam kirim (window) WIB
    jamSelesai: 20,
    batasHarianPerangkat: 800,
    kirimPerPutaran: 5,     // berapa pesan diproses tiap panggilan cron
    percobaanMaks: 3,
    hormatiJamKirim: true,
  },
  webhook: {
    aktif: false,
    url: '',
    rahasia: '',
    kejadian: ['masuk', 'terkirim', 'sampai', 'dibaca', 'gagal'],
  },
  /* Tidak ada bagian "biaya" di sini. Itu peninggalan masa memakai Fonnte, yang
     memotong pulsa tiap pesan. Gateway sendiri tidak menagih apa pun, jadi kolom
     biaya per pesan dan saldo hanya menampilkan angka yang tidak berarti. */
  rekening: [
    { dana: 'Zakat', bank: 'BSI', nomor: '', atasNama: 'LAZISMU BANTUL' },
    { dana: 'Infak', bank: 'BSI', nomor: '', atasNama: 'LAZISMU BANTUL' },
    { dana: 'Kemanusiaan', bank: 'BSI', nomor: '', atasNama: 'LAZISMU BANTUL' },
  ],
  tampilan: {
    tema: 'terang',
    intervalPollingDetik: 10,
  },
};

function gabung(bawaan, tersimpan) {
  if (Array.isArray(bawaan)) return Array.isArray(tersimpan) ? tersimpan : bawaan;
  if (bawaan && typeof bawaan === 'object') {
    const hasil = {};
    for (const k of Object.keys(bawaan)) {
      hasil[k] = gabung(bawaan[k], tersimpan ? tersimpan[k] : undefined);
    }
    if (tersimpan && typeof tersimpan === 'object') {
      for (const k of Object.keys(tersimpan)) if (!(k in hasil)) hasil[k] = tersimpan[k];
    }
    return hasil;
  }
  return tersimpan === undefined ? bawaan : tersimpan;
}

async function ambilSetelan() {
  const tersimpan = await db.ambil('setelan');
  const hasil = gabung(BAWAAN, tersimpan || {});
  delete hasil.biaya;   // peninggalan Fonnte; lihat catatan di BAWAAN
  /* Setelan yang tersimpan sebelum aturan 30 detik berlaku tetap harus tunduk:
     kalau tidak, jeda 10 detik yang lama akan hidup terus tanpa pernah
     ditinjau — dan tidak ada tanda apa pun bahwa batasnya sudah berubah. */
  if (hasil.kirim) {
    hasil.kirim.jedaMinDetik = Math.max(JEDA_MIN_DETIK, Number(hasil.kirim.jedaMinDetik) || JEDA_MIN_DETIK);
    hasil.kirim.jedaMaksDetik = Math.max(hasil.kirim.jedaMinDetik, Number(hasil.kirim.jedaMaksDetik) || hasil.kirim.jedaMinDetik * 2);
  }
  return hasil;
}

async function simpanSetelan(baru) {
  const lama = await ambilSetelan();
  const gabungan = gabung(lama, baru || {});
  /* Setelan lama masih menyimpan bagian "biaya". Dibuang di sini supaya ia
     hilang begitu setelan disentuh, bukan menetap selamanya di Redis. */
  delete gabungan.biaya;
  // Angka dijaga supaya tidak merusak antrean
  const k = gabungan.kirim;
  /* JEDA_MIN dijaga di server, bukan cuma di tampilan: batas yang hanya ditulis
     sebagai min="30" pada kotak isian bisa dilewati siapa pun yang memanggil
     API langsung, dan yang menanggung akibatnya adalah nomor WhatsApp-nya. */
  k.jedaMinDetik = Math.max(JEDA_MIN_DETIK, Math.min(600, Number(k.jedaMinDetik) || JEDA_MIN_DETIK));
  k.jedaMaksDetik = Math.max(k.jedaMinDetik, Math.min(1800, Number(k.jedaMaksDetik) || k.jedaMinDetik * 2));
  k.jamMulai = Math.max(0, Math.min(23, Number(k.jamMulai) || 0));
  k.jamSelesai = Math.max(k.jamMulai, Math.min(24, Number(k.jamSelesai) || 24));
  k.batasHarianPerangkat = Math.max(1, Math.min(100000, Number(k.batasHarianPerangkat) || 800));
  k.kirimPerPutaran = Math.max(1, Math.min(30, Number(k.kirimPerPutaran) || 5));
  k.percobaanMaks = Math.max(1, Math.min(10, Number(k.percobaanMaks) || 3));
  await db.simpan('setelan', gabungan);
  return gabungan;
}

// Rahasia jangan ikut terkirim ke tampilan
function setelanAman(setelan) {
  const salinan = JSON.parse(JSON.stringify(setelan));
  if (salinan.webhook) salinan.webhook.rahasia = salinan.webhook.rahasia ? '••••••••' : '';
  return salinan;
}

module.exports = { BAWAAN, JEDA_MIN_DETIK, ambilSetelan, simpanSetelan, setelanAman };
