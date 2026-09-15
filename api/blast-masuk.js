// api/masuk.js — penerima pesan masuk dari penyedia (webhook masuk)
//
// Fonnte : POST JSON { device, sender, message, ... }
// Meta   : verifikasi GET hub.challenge, lalu POST entry[].changes[]...
//
// Setelah pesan masuk dicatat, balasan otomatis dijalankan dan kejadian
// "masuk" diteruskan ke webhook keluar (mis. ke LAZDigital).

const db = require('../lib/blast/db');
const { id, sekarang, normalkanNomor, bersihkanTeks, sukses, gagal, bacaBody } = require('../lib/blast/util');
const { ambilSetelan } = require('../lib/blast/setelan');
const { cariBalasan } = require('../lib/blast/balasan');
const { antrikan, catatKeDaftar, KUNCI_PESAN } = require('../lib/blast/antrean');
const { kirimKejadian } = require('../lib/blast/webhook');
const kontakLib = require('../lib/blast/kontak');

function uraikan(badan) {
  // Bentuk Fonnte
  if (badan.sender || badan.pengirim) {
    return {
      nomor: normalkanNomor(badan.sender || badan.pengirim),
      teks: bersihkanTeks(badan.message || badan.pesan || '', 4000),
      nama: bersihkanTeks(badan.name || badan.nama || '', 120),
      perangkatNomor: normalkanNomor(badan.device || ''),
      sumber: 'fonnte',
    };
  }
  // Bentuk Meta Cloud API
  try {
    const nilai = badan.entry[0].changes[0].value;
    const pesan = nilai.messages[0];
    const profil = (nilai.contacts && nilai.contacts[0]) || {};
    return {
      nomor: normalkanNomor(pesan.from),
      teks: bersihkanTeks((pesan.text && pesan.text.body) || '', 4000),
      nama: bersihkanTeks((profil.profile && profil.profile.name) || '', 120),
      perangkatNomor: normalkanNomor((nilai.metadata && nilai.metadata.display_phone_number) || ''),
      sumber: 'meta',
    };
  } catch (_) {
    return null;
  }
}

async function cariPerangkat(nomorPerangkat) {
  const idDaftar = await db.anggotaHimpunan('perangkat:daftar');
  const isi = (await db.ambilBanyak(idDaftar.map((i) => `perangkat:${i}`))).filter(Boolean);
  if (nomorPerangkat) {
    const cocok = isi.find((d) => normalkanNomor(d.nomor) === nomorPerangkat);
    if (cocok) return cocok;
  }
  return isi.find((d) => d.status === 'tersambung') || isi[0] || null;
}

module.exports = async function penangan(req, res) {
  // Verifikasi webhook Meta
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x');
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const tantangan = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      return res.end(String(tantangan || ''));
    }
    return gagal(res, 403, 'Token verifikasi tidak cocok');
  }

  if (req.method !== 'POST') return gagal(res, 405, 'Gunakan metode POST');

  try {
    const badan = await bacaBody(req);
    const masuk = uraikan(badan);
    // Penyedia mengharapkan 200 walau isinya bukan pesan (mis. notifikasi status)
    if (!masuk || !masuk.nomor) return sukses(res, { diabaikan: true });

    const perangkat = await cariPerangkat(masuk.perangkatNomor);
    const setelan = await ambilSetelan();

    // Catat kontak bila belum ada (tanpa mengubah data yang sudah terisi)
    let kontak = await kontakLib.cariLewatNomor(masuk.nomor);
    if (!kontak) {
      const hasil = await kontakLib.simpanKontak({
        nama: masuk.nama || masuk.nomor,
        nomor: masuk.nomor,
        segmen: ['simpatisan'],
      });
      kontak = hasil.kontak;
    }

    const pesan = {
      id: id('m_'),
      perangkatId: perangkat ? perangkat.id : null,
      nomor: masuk.nomor,
      nama: kontak.nama,
      kontakId: kontak.id,
      isi: { teks: masuk.teks },
      arah: 'masuk',
      status: 'masuk',
      dibuat: sekarang(),
      sumber: masuk.sumber,
    };
    await db.simpan(KUNCI_PESAN(pesan.id), pesan);
    await catatKeDaftar(pesan.id);
    await db.tambahKeHimpunan(`percakapan:${masuk.nomor}`, pesan.id);
    await kirimKejadian('masuk', pesan, setelan);

    // Berhenti berlangganan dihormati lebih dulu, sebelum aturan lain
    const teksBersih = masuk.teks.trim().toLowerCase();
    if (['berhenti', 'stop', 'unsubscribe'].includes(teksBersih)) {
      kontak.langganan = false;
      kontak.diubah = sekarang();
      await db.simpan(kontakLib.KUNCI(kontak.id), kontak);
    }

    const balasan = await cariBalasan(masuk.teks, { nama: kontak.anonim ? 'Bapak/Ibu' : kontak.nama });
    let balasanId = null;
    if (balasan && perangkat) {
      const keluar = await antrikan({
        perangkatId: perangkat.id,
        nomor: masuk.nomor,
        nama: kontak.nama,
        kontakId: kontak.id,
        isi: { teks: balasan.balasan },
        prioritas: 1, // balasan percakapan paling didahulukan
        oleh: 'otomatis',
        kunciIdempoten: `balas:${pesan.id}`,
      });
      balasanId = keluar.id;
      if (balasan.tindakan === 'alih-ke-petugas') {
        await db.simpan(`percakapan:status:${masuk.nomor}`, {
          status: 'terbuka', perluPetugas: true, waktu: sekarang(),
        });
      }
    }

    return sukses(res, { pesanId: pesan.id, balasanId, tindakan: balasan ? balasan.tindakan : '' });
  } catch (e) {
    console.error('[masuk] gagal memproses:', e);
    // Tetap 200 agar penyedia tidak membanjiri kiriman ulang; galat dicatat di log
    return sukses(res, { ok: false, pesan: e.message });
  }
};
