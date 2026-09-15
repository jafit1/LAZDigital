// lib/pengirim/fonnte.js — driver Fonnte (gateway WhatsApp tidak resmi)
//
// Token diambil dari perangkat (per perangkat punya token sendiri di Fonnte),
// dengan cadangan variabel lingkungan FONNTE_TOKEN.

const nama = 'fonnte';
const label = 'Fonnte';
const butuhKredensial = true;

const DASAR = 'https://api.fonnte.com';

function tokenPerangkat(perangkat) {
  const t = (perangkat && perangkat.token) || process.env.FONNTE_TOKEN || '';
  if (!t) {
    const e = new Error('Token Fonnte belum diisi untuk perangkat ini');
    e.sementara = false;
    throw e;
  }
  return t;
}

async function panggil(jalur, token, data) {
  const badan = new URLSearchParams();
  for (const [k, v] of Object.entries(data || {})) {
    if (v !== undefined && v !== null && v !== '') badan.append(k, String(v));
  }
  const res = await fetch(`${DASAR}${jalur}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: badan,
  });
  const teks = await res.text();
  let hasil;
  try { hasil = JSON.parse(teks); } catch (_) { hasil = { status: false, reason: teks.slice(0, 200) }; }
  if (!res.ok) {
    const e = new Error(`Fonnte menolak (${res.status}): ${hasil.reason || teks.slice(0, 120)}`);
    e.sementara = res.status >= 500 || res.status === 429;
    throw e;
  }
  return hasil;
}

async function kirim({ nomor, isi, perangkat, setelan }) {
  const token = tokenPerangkat(perangkat);
  const data = {
    target: nomor,
    message: isi.teks || '',
    countryCode: (setelan && setelan.pengirim && setelan.pengirim.kodeNegara) || '62',
  };
  if (isi.berkasUrl) {
    data.url = isi.berkasUrl;
    if (isi.namaBerkas) data.filename = isi.namaBerkas;
  }
  if (setelan && setelan.pengirim && setelan.pengirim.efekMengetik) data.typing = true;
  if (isi.jadwalUnix) data.schedule = isi.jadwalUnix;

  const hasil = await panggil('/send', token, data);
  if (hasil.status === false) {
    const alasan = String(hasil.reason || 'tidak diketahui');
    const e = new Error(`Fonnte gagal mengirim: ${alasan}`);
    // Alasan seperti "device not connected" bisa membaik setelah perangkat pulih
    e.sementara = /not connected|quota|limit|timeout|try again/i.test(alasan);
    throw e;
  }
  return {
    idLuar: Array.isArray(hasil.id) ? String(hasil.id[0]) : String(hasil.id || ''),
    status: 'terkirim',
    mentah: hasil,
  };
}

async function sambungkan(perangkat) {
  const token = tokenPerangkat(perangkat);
  const hasil = await panggil('/qr', token, {});
  return {
    status: hasil.status ? 'memindai' : 'terputus',
    qr: hasil.url || hasil.qr || null,
    keterangan: hasil.reason || 'Pindai QR memakai WhatsApp di ponsel perangkat ini.',
  };
}

async function putuskan(perangkat) {
  const token = tokenPerangkat(perangkat);
  await panggil('/disconnect', token, {});
  return { status: 'terputus' };
}

async function periksa(perangkat) {
  const token = tokenPerangkat(perangkat);
  const hasil = await panggil('/device', token, {});
  const d = (hasil.data && hasil.data[0]) || hasil;
  const status = String(d.status || '').toLowerCase();
  return {
    status: status === 'connect' || status === 'connected' ? 'tersambung' : 'terputus',
    nomor: d.device || perangkat.nomor || '',
    kuota: d.quota,
    keterangan: hasil.reason || '',
  };
}

module.exports = { nama, label, butuhKredensial, kirim, sambungkan, putuskan, periksa };
