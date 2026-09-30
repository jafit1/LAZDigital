// api/masuk.js — penerima pesan masuk dari penyedia (webhook masuk)
//
// Fonnte : POST JSON { device, sender, message, ... }
// Meta   : verifikasi GET hub.challenge, lalu POST entry[].changes[]...
//
// Setelah pesan masuk dicatat, balasan otomatis dijalankan dan kejadian
// "masuk" diteruskan ke webhook keluar (mis. ke LAZDigital).

const db = require('../lib/blast/db');
const { id, sekarang, normalkanNomor, bersihkanTeks, sukses, gagal, bacaBody, bandingAman } = require('../lib/blast/util');
const { ambilSetelan } = require('../lib/blast/setelan');
const { catatKeDaftar, KUNCI_PESAN, simpanPesan } = require('../lib/blast/antrean');
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

/* PINTU INI TERTUTUP SECARA BAWAAN.
   Dulu siapa pun yang tahu alamatnya (dan repositori ini publik) bisa mengirim
   POST ke sini: pesan palsu masuk ke kotak masuk amil atas nama nomor mana pun,
   nomor karangan membanjiri daftar kontak, dan satu kiriman "STOP" palsu
   memasukkan donatur sungguhan ke daftar hitam sehingga ia diam-diam tidak
   lagi menerima broadcast. tools/test_blast_masuk.js membuktikannya: 12 dari
   20 pemeriksaannya gagal sebelum penjaga ini dipasang.

   Gateway WhatsApp mandiri milik lembaga tidak lewat sini, melainkan lewat
   api/blast-agen.js yang dijaga BLAST_AGEN_TOKEN. Pintu ini hanya dipakai
   penyedia pihak ketiga (Fonnte, Meta), jadi ia dibuka HANYA kalau
   BLAST_MASUK_KUNCI disetel, dan penyedia menyertakan kunci yang sama di
   alamat webhook (?kunci=...) atau di header x-masuk-kunci. Kunci di alamat
   dipilih karena Fonnte tidak bisa menambah header sendiri. */
function kunciMasukSah(req, url) {
  const seharusnya = String(process.env.BLAST_MASUK_KUNCI || '');
  if (!seharusnya) return { ok: false, kode: 403, alasan: 'Pintu pesan masuk ditutup. Setel BLAST_MASUK_KUNCI untuk membukanya.' };
  const diminta = String((req.headers && req.headers['x-masuk-kunci']) || url.searchParams.get('kunci') || '');
  if (!diminta || !bandingAman(diminta, seharusnya)) return { ok: false, kode: 401, alasan: 'Kunci pesan masuk tidak sah' };
  return { ok: true };
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

  /* Diperiksa SEBELUM badan permintaan dibaca: kiriman tanpa kunci tidak
     boleh menyentuh basis data sama sekali, termasuk mencatat kontak. */
  const sah = kunciMasukSah(req, new URL(req.url, 'http://x'));
  if (!sah.ok) return gagal(res, sah.kode, sah.alasan);

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
    await simpanPesan(pesan);
    await catatKeDaftar(pesan.id);
    await db.tambahKeHimpunan(`percakapan:${masuk.nomor}`, pesan.id);
    await kirimKejadian('masuk', pesan, setelan);

    /* Permintaan berhenti dihormati lebih dulu, sebelum aturan balasan lain.
       Dua medan ditulis sekaligus karena tampilan sekarang hanya mengenal satu
       saklar "diblokir"; kalau cuma `langganan` yang diturunkan, daftar kontak
       akan menampilkannya sebagai aktif padahal ia tidak lagi dikirimi. */
    const teksBersih = masuk.teks.trim().toLowerCase();
    if (['berhenti', 'stop', 'unsubscribe'].includes(teksBersih)) {
      kontak.langganan = false;
      kontak.daftarHitam = true;
      kontak.diubah = sekarang();
      await db.simpan(kontakLib.KUNCI(kontak.id), kontak);
    }

    /* TIDAK ADA BALASAN OTOMATIS. Lihat alasannya di api/blast-agen.js: pesan
       yang masuk ke nomor lembaga dijawab amil, bukan mesin. Jalur webhook ini
       dimatikan bersamaan supaya tidak ada satu pintu pun yang tertinggal
       menyala, karena pintu yang tertinggal baru ketahuan dari keluhan
       donatur. balasanId tetap dikirim sebagai null demi pemanggil lama. */
    return sukses(res, { pesanId: pesan.id, balasanId: null, tindakan: '' });
  } catch (e) {
    console.error('[masuk] gagal memproses:', e);
    // Tetap 200 agar penyedia tidak membanjiri kiriman ulang; galat dicatat di log
    return sukses(res, { ok: false, pesan: e.message });
  }
};
