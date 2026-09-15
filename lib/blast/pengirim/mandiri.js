// lib/blast/pengirim/mandiri.js — driver gateway WhatsApp milik lembaga sendiri
//
// Berbeda dari fonnte dan meta, driver ini TIDAK mengirim apa pun sendiri.
// LAZDigital berjalan di Vercel: fungsinya hidup beberapa detik lalu mati,
// sedangkan sambungan WhatsApp Web harus dijaga menyala terus-menerus. Jadi
// pengirimannya dikerjakan gateway di PC kantor atau VPS, yang MENARIK
// pekerjaan lewat /api/blast-agen — bukan dipanggil, karena PC kantor ada di
// balik NAT dan tidak punya alamat yang bisa dihubungi dari luar.
//
// Yang dilakukan driver ini hanyalah menaruh pesan di kotak keluar perangkat
// dan mengembalikan status 'diserahkan'.
//
// Statusnya sengaja BUKAN 'terkirim'. Kalau di sini mengaku terkirim, dasbor
// akan melaporkan satu kampanye sukses seluruhnya pada detik pesan masuk
// antrean — padahal gateway-nya mungkin sedang mati, laptopnya tertutup, atau
// nomornya keburu diblokir. Amil baru sadar berhari-hari kemudian. Yang berhak
// menyatakan "terkirim" cuma gateway, setelah WhatsApp menerimanya.

const db = require('../db');
const { sekarang } = require('../util');

const nama = 'mandiri';
const label = 'Gateway sendiri (WhatsApp Web)';
const butuhKredensial = false;

/* Kotak keluar per perangkat: himpunan id pesan yang menunggu ditarik agen. */
const KUNCI_KELUAR = (perangkatId) => `agen:keluar:${perangkatId}`;
/* Laporan hidup dari gateway: status sambungan, nomor, QR, waktu terakhir. */
const KUNCI_AGEN = (perangkatId) => `agen:perangkat:${perangkatId}`;
/* Perintah satu arah untuk gateway: 'sambungkan' | 'putuskan'. */
const KUNCI_PERINTAH = (perangkatId) => `agen:perintah:${perangkatId}`;

/* Gateway melapor tiap beberapa detik. Lewat dari ini, ia dianggap mati —
   dipilih longgar supaya jaringan kantor yang tersendat tidak bikin perangkat
   bolak-balik dinyatakan putus. */
const BATAS_DIAM_MS = 90 * 1000;

async function kabarAgen(perangkatId) {
  const kabar = await db.ambil(KUNCI_AGEN(perangkatId));
  if (!kabar) return { hidup: false, kabar: null };
  const umur = Date.now() - new Date(kabar.waktu || 0).getTime();
  return { hidup: umur <= BATAS_DIAM_MS, umurDetik: Math.round(umur / 1000), kabar };
}

async function kirim({ pesanId, nomor, perangkat }) {
  if (!perangkat || !perangkat.id) {
    const e = new Error('Pesan tidak punya perangkat pengirim');
    e.sementara = false;
    throw e;
  }

  const { hidup } = await kabarAgen(perangkat.id);
  if (!hidup) {
    /* Sementara, bukan gagal permanen: pesan tetap di antrean dan berangkat
       sendiri begitu gateway dinyalakan lagi. Amil tidak perlu mengirim ulang
       satu per satu hanya karena laptop sempat tertutup. */
    const e = new Error('Gateway WhatsApp sedang tidak terhubung');
    e.sementara = true;
    throw e;
  }

  if (!pesanId) {
    const e = new Error('Pesan tanpa id tidak bisa diserahkan ke gateway');
    e.sementara = false;
    throw e;
  }
  await db.tambahKeHimpunan(KUNCI_KELUAR(perangkat.id), pesanId);
  return {
    idLuar: '',
    status: 'diserahkan',
    mentah: { diserahkan: sekarang(), perangkatId: perangkat.id, nomor },
  };
}

async function sambungkan(perangkat) {
  /* Pemindaian QR terjadi di gateway, bukan di sini. Yang bisa dilakukan dari
     Vercel hanyalah menitipkan perintah, lalu menunggu gateway melaporkan QR-nya
     kembali — itulah yang ditampilkan di layar amil. */
  await db.simpan(KUNCI_PERINTAH(perangkat.id), { perintah: 'sambungkan', waktu: sekarang() }, { detik: 600 });
  const { hidup, kabar } = await kabarAgen(perangkat.id);
  if (!hidup) {
    return {
      status: 'menunggu',
      qr: null,
      keterangan: 'Gateway belum terhubung. Nyalakan dulu gateway di komputer kantor, QR-nya akan muncul di sini sendiri.',
    };
  }
  return {
    status: kabar.status === 'tersambung' ? 'tersambung' : 'menunggu',
    qr: kabar.qr || null,
    nomor: kabar.nomor || '',
    keterangan: kabar.qr ? 'Pindai QR ini dengan WhatsApp di ponsel pengirim.' : 'Permintaan sudah dikirim ke gateway, menunggu QR.',
  };
}

async function putuskan(perangkat) {
  await db.simpan(KUNCI_PERINTAH(perangkat.id), { perintah: 'putuskan', waktu: sekarang() }, { detik: 600 });
  return { status: 'terputus' };
}

async function periksa(perangkat) {
  const { hidup, umurDetik, kabar } = await kabarAgen(perangkat.id);
  if (!kabar) {
    return { status: 'terputus', keterangan: 'Perangkat ini belum pernah dilaporkan gateway mana pun.' };
  }
  if (!hidup) {
    return {
      status: 'terputus',
      keterangan: `Gateway terakhir melapor ${umurDetik} detik lalu — kemungkinan komputernya mati atau kehilangan internet.`,
    };
  }
  return {
    status: kabar.status || 'terputus',
    nomor: kabar.nomor || '',
    keterangan: kabar.keterangan || 'Gateway terhubung.',
  };
}

module.exports = {
  nama, label, butuhKredensial,
  kirim, sambungkan, putuskan, periksa,
  KUNCI_KELUAR, KUNCI_AGEN, KUNCI_PERINTAH, BATAS_DIAM_MS, kabarAgen,
};
