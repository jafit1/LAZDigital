// lib/webhook.js — kejadian keluar ke sistem lain (mis. LAZDigital)
//
// Setiap kiriman ditandatangani HMAC-SHA256 pada header X-Blast-Signature
// agar penerima bisa memastikan kiriman benar berasal dari aplikasi ini.

const db = require('./db');
const { id, sekarang, tandaTanganHmac } = require('./util');
const { ambilSetelan } = require('./setelan');

const BATAS_RIWAYAT = 200;

async function kirimKejadian(jenis, data, setelanDiberikan = null) {
  const setelan = setelanDiberikan || (await ambilSetelan());
  const w = setelan.webhook || {};

  const kejadian = {
    id: id('w_'),
    jenis,
    waktu: sekarang(),
    data: ringkas(jenis, data),
  };

  // Selalu dicatat, walau webhook tidak aktif — berguna untuk penampil isi kiriman
  await catatRiwayat(kejadian, w.aktif && w.url ? 'dikirim' : 'dicatat');

  if (!w.aktif || !w.url) return kejadian;
  if (Array.isArray(w.kejadian) && w.kejadian.length && !w.kejadian.includes(jenis)) {
    return kejadian;
  }

  const isi = JSON.stringify(kejadian);
  const tanda = tandaTanganHmac(isi, w.rahasia || process.env.RAHASIA_SESI || '');

  try {
    const res = await fetch(w.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Blast-Signature': `sha256=${tanda}`,
        'X-Blast-Event': jenis,
        'User-Agent': 'BlastUyeee/1.0',
      },
      body: isi,
    });
    if (!res.ok) throw new Error(`penerima menjawab ${res.status}`);
    await catatRiwayat({ ...kejadian, id: kejadian.id + ':k' }, 'berhasil');
  } catch (e) {
    await catatRiwayat({ ...kejadian, id: kejadian.id + ':g' }, 'gagal', e.message);
    await db.tambahKeHimpunan('webhook:mati', kejadian.id);
    await db.simpan(`webhook:kejadian:${kejadian.id}`, kejadian, { detik: 60 * 60 * 24 * 14 });
  }
  return kejadian;
}

function ringkas(jenis, data) {
  if (!data) return {};
  if (jenis === 'masuk') {
    return {
      pesanId: data.id, nomor: data.nomor, nama: data.nama,
      teks: data.isi ? data.isi.teks : '', perangkatId: data.perangkatId, waktu: data.dibuat,
    };
  }
  return {
    pesanId: data.id, nomor: data.nomor, status: data.status,
    idLuar: data.idLuar || '', massalId: data.massalId || null,
    perangkatId: data.perangkatId, galat: data.galatTerakhir || '',
  };
}

async function catatRiwayat(kejadian, keadaan, catatan = '') {
  try {
    const daftar = (await db.ambil('webhook:riwayat')) || [];
    daftar.unshift({ ...kejadian, keadaan, catatan });
    await db.simpan('webhook:riwayat', daftar.slice(0, BATAS_RIWAYAT));
  } catch (e) {
    console.error('[webhook] gagal mencatat riwayat:', e.message);
  }
}

async function riwayat(batas = 50) {
  const daftar = (await db.ambil('webhook:riwayat')) || [];
  return daftar.slice(0, batas);
}

async function kotakMati() {
  const idDaftar = await db.anggotaHimpunan('webhook:mati');
  const isi = await db.ambilBanyak(idDaftar.map((i) => `webhook:kejadian:${i}`));
  return isi.filter(Boolean);
}

async function kirimUlangMati(kejadianId) {
  const kejadian = await db.ambil(`webhook:kejadian:${kejadianId}`);
  if (!kejadian) throw new Error('Kejadian tidak ditemukan atau sudah kedaluwarsa');
  await db.keluarDariHimpunan('webhook:mati', kejadianId);
  return kirimKejadian(kejadian.jenis, kejadian.data);
}

async function hapusRiwayat(kejadianId) {
  if (!kejadianId) throw new Error('Baris mana yang mau dihapus?');
  const daftar = (await db.ambil('webhook:riwayat')) || [];
  const sisa = daftar.filter((k) => k.id !== kejadianId);
  if (sisa.length === daftar.length) throw new Error('Baris riwayat itu tidak ditemukan');
  await db.simpan('webhook:riwayat', sisa);

  /* Kalau barisnya adalah kejadian yang GAGAL terkirim, ia juga terdaftar di
     kotak mati dan menunggu dikirim ulang. Membuangnya dari riwayat saja akan
     meninggalkannya di sana: tidak terlihat di mana pun, tetapi masih bisa
     dikirim ulang oleh siapa pun yang tahu id-nya. */
  const pokok = String(kejadianId).replace(/:[kg]$/, '');
  await db.keluarDariHimpunan('webhook:mati', pokok);
  await db.hapus(`webhook:kejadian:${pokok}`);
  return { terhapus: daftar.length - sisa.length, sisa: sisa.length };
}

async function kosongkanRiwayat() {
  const daftar = (await db.ambil('webhook:riwayat')) || [];
  const mati = await db.anggotaHimpunan('webhook:mati');
  await db.hapus('webhook:riwayat');
  if (mati.length) {
    await db.hapus(...mati.map((i) => `webhook:kejadian:${i}`));
    await db.keluarDariHimpunan('webhook:mati', ...mati);
  }
  return { terhapus: daftar.length, mati: mati.length };
}

module.exports = { kirimKejadian, riwayat, kotakMati, kirimUlangMati, hapusRiwayat, kosongkanRiwayat };
