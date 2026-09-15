// lib/pengirim/sandbox.js — driver simulasi
//
// Tujuan: SELURUH alur aplikasi (antrean, kiriman massal, webhook, laporan)
// bisa diuji tanpa kredensial WhatsApp apa pun. Pesan tidak benar-benar
// terkirim; status berikutnya (sampai/dibaca) disimulasikan oleh
// lib/antrean.js supaya kejadian webhook tetap mengalir.

const { id, acakAntara } = require('../util');

const nama = 'sandbox';
const label = 'Sandbox (simulasi)';
const butuhKredensial = false;

async function kirim({ nomor, isi }) {
  // Simulasikan kegagalan kecil supaya alur "gagal + coba ulang" ikut teruji.
  const gagal = acakAntara(1, 100) <= 3;
  if (gagal) {
    const e = new Error('Simulasi: nomor sedang tidak dapat dihubungi');
    e.sementara = true;
    throw e;
  }
  return {
    idLuar: id('sb_'),
    status: 'terkirim',
    mentah: { simulasi: true, nomor, panjangIsi: String(isi && isi.teks || '').length },
  };
}

async function sambungkan(perangkat) {
  // QR palsu berupa teks; tampilan menggambarnya dengan pustaka QR di sisi klien.
  return {
    status: 'tersambung',
    qr: null,
    keterangan: 'Mode sandbox: perangkat dianggap langsung tersambung.',
    nomor: perangkat.nomor || '6281200000000',
  };
}

async function putuskan() {
  return { status: 'terputus' };
}

async function periksa(perangkat) {
  return {
    status: perangkat.status === 'terputus' ? 'terputus' : 'tersambung',
    keterangan: 'Mode sandbox aktif — tidak ada sambungan WhatsApp sungguhan.',
  };
}

module.exports = { nama, label, butuhKredensial, kirim, sambungkan, putuskan, periksa };
