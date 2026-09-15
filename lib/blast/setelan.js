// lib/setelan.js — setelan yang bisa diubah dari dasbor tanpa deploy ulang

const db = require('./db');

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
    jedaMinDetik: 10,       // jeda acak antar pesan
    jedaMaksDetik: 20,
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
  biaya: {
    biayaPerPesan: 0,       // rupiah, untuk laporan biaya vs dana terhimpun
    saldoDicatat: 0,
    peringatanSaldo: 50000,
  },
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
  return gabung(BAWAAN, tersimpan || {});
}

async function simpanSetelan(baru) {
  const lama = await ambilSetelan();
  const gabungan = gabung(lama, baru || {});
  // Angka dijaga supaya tidak merusak antrean
  const k = gabungan.kirim;
  k.jedaMinDetik = Math.max(1, Math.min(600, Number(k.jedaMinDetik) || 10));
  k.jedaMaksDetik = Math.max(k.jedaMinDetik, Math.min(1800, Number(k.jedaMaksDetik) || 20));
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

module.exports = { BAWAAN, ambilSetelan, simpanSetelan, setelanAman };
