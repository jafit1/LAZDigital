// lib/pengirim/meta.js — driver WhatsApp Cloud API resmi Meta
//
// Dipakai sebagai cadangan/pengganti Fonnte. Pesan ke nomor yang belum
// pernah membalas dalam 24 jam wajib memakai template yang sudah disetujui.

const nama = 'meta';
const label = 'WhatsApp Cloud API (Meta)';
const butuhKredensial = true;

const VERSI = 'v21.0';

function kredensial(perangkat) {
  const token = (perangkat && perangkat.token) || process.env.META_TOKEN || '';
  const nomorId = (perangkat && perangkat.nomorId) || process.env.META_PHONE_NUMBER_ID || '';
  if (!token || !nomorId) {
    const e = new Error('Token atau Phone Number ID Meta belum diisi untuk perangkat ini');
    e.sementara = false;
    throw e;
  }
  return { token, nomorId };
}

async function panggil(perangkat, isi) {
  const { token, nomorId } = kredensial(perangkat);
  const res = await fetch(`https://graph.facebook.com/${VERSI}/${nomorId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(isi),
  });
  const hasil = await res.json().catch(() => ({}));
  if (!res.ok) {
    const pesan = (hasil.error && hasil.error.message) || `galat ${res.status}`;
    const e = new Error(`Meta menolak: ${pesan}`);
    e.sementara = res.status >= 500 || res.status === 429;
    throw e;
  }
  return hasil;
}

function susunIsi(nomor, isi) {
  if (isi.template) {
    return {
      messaging_product: 'whatsapp',
      to: nomor,
      type: 'template',
      template: {
        name: isi.template,
        language: { code: isi.bahasa || 'id' },
        components: isi.komponen || [],
      },
    };
  }
  if (isi.berkasUrl) {
    const jenis = isi.jenisMedia || 'document';
    return {
      messaging_product: 'whatsapp',
      to: nomor,
      type: jenis,
      [jenis]: {
        link: isi.berkasUrl,
        ...(jenis === 'document' && isi.namaBerkas ? { filename: isi.namaBerkas } : {}),
        ...(isi.teks ? { caption: isi.teks } : {}),
      },
    };
  }
  return {
    messaging_product: 'whatsapp',
    to: nomor,
    type: 'text',
    text: { preview_url: true, body: isi.teks || '' },
  };
}

async function kirim({ nomor, isi, perangkat }) {
  const hasil = await panggil(perangkat, susunIsi(nomor, isi));
  const pesan = (hasil.messages && hasil.messages[0]) || {};
  return { idLuar: pesan.id || '', status: 'terkirim', mentah: hasil };
}

async function sambungkan(perangkat) {
  // Cloud API tidak memakai QR — sambungan ditentukan kredensial.
  const { nomorId } = kredensial(perangkat);
  return {
    status: 'tersambung',
    qr: null,
    keterangan: `Nomor terdaftar di Meta (ID ${nomorId}). Tidak perlu pindai QR.`,
  };
}

async function putuskan() {
  return { status: 'terputus' };
}

async function periksa(perangkat) {
  const { token, nomorId } = kredensial(perangkat);
  const res = await fetch(`https://graph.facebook.com/${VERSI}/${nomorId}?fields=verified_name,quality_rating,display_phone_number`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const hasil = await res.json().catch(() => ({}));
  if (!res.ok) return { status: 'terputus', keterangan: (hasil.error && hasil.error.message) || 'Gagal memeriksa' };
  return {
    status: 'tersambung',
    nomor: hasil.display_phone_number || perangkat.nomor || '',
    keterangan: `Mutu nomor: ${hasil.quality_rating || 'tidak diketahui'}`,
  };
}

module.exports = { nama, label, butuhKredensial, kirim, sambungkan, putuskan, periksa };
