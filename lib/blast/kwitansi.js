/* lib/blast/kwitansi.js: kirim kwitansi dan ucapan terima kasih ke WhatsApp donatur lewat mesin Broadcast.
 *
 * Dipindah dari api/blast.js (6 Oktober 2026) supaya DUA pintu memakai satu mesin yang sama: menu Penghimpunan di
 * aplikasi utama (api/blast.js, izin Broadcast pesan.kirim) dan modul Fundraising (api/fund.js, izin fundraising dan
 * hanya untuk catatannya sendiri). Tidak ada jalur kirim baru: kontak, perangkat, antrean dengan jeda aman, riwayat.
 * Aturan yang dijaga (lihat api/blast.js bagian KWITANSI KE WHATSAPP): kontak tidak ganda, yang berhenti/diblokir tidak
 * dikirimi, status dibaca dari pesannya. */
'use strict';
const db = require('./db');
const util = require('./util');
const auth = require('./auth');
const kontakLib = require('./kontak');
const berkasLib = require('./berkas');
const antreanLib = require('./antrean');
const { GalatAplikasi } = util;

const KUNCI_KW = (i) => `kwitansi:wa:${i}`;
const DAFTAR_KW = 'kwitansi:wa:daftar';
const LABEL_DONATUR = 'Donatur';

function statusKwitansi(pesan) {
  if (!pesan) return 'hilang';
  if (['terkirim', 'sampai', 'dibaca'].includes(pesan.status)) return 'terkirim';
  if (['gagal', 'dibatalkan'].includes(pesan.status)) return 'gagal';
  return 'menunggu';
}

/* Mencari kontak lewat nomor; kalau belum ada dibuatkan. Mengembalikan { kontak, baru }. Kontak yang sudah ada TIDAK
   diubah selain menambah label dan mengisi alamat yang kosong. */
async function pastikanKontakDonatur({ nama, nomor, alamat }, pengguna) {
  const n = util.normalkanNomor(nomor);
  if (!util.nomorValid(n)) throw new GalatAplikasi('Nomor WhatsApp donatur tidak sah. Contoh: 0812 3456 7890.');
  const ada = await kontakLib.cariLewatNomor(n);
  if (!ada) {
    const r = await kontakLib.simpanKontak({
      nama: util.bersihkanTeks(nama || '', 120) || n, nomor: n, label: [LABEL_DONATUR],
      segmen: [], alamat: util.bersihkanTeks(alamat || '', 200),
    }, pengguna);
    return { kontak: r.kontak, baru: true };
  }
  const label = Array.isArray(ada.label) ? ada.label : [];
  const perlu = !label.map((x) => String(x).toLowerCase()).includes(LABEL_DONATUR.toLowerCase())
    || (!ada.alamat && alamat);
  if (!perlu) return { kontak: ada, baru: false };
  const r = await kontakLib.simpanKontak({
    id: ada.id, nomor: ada.nomor, nama: ada.nama,
    label: label.includes(LABEL_DONATUR) ? label : label.concat([LABEL_DONATUR]),
    alamat: ada.alamat || util.bersihkanTeks(alamat || '', 200),
  }, pengguna);
  return { kontak: r.kontak, baru: false };
}

async function perangkatKwitansi() {
  const idDaftar = await db.anggotaHimpunan('perangkat:daftar');
  const semua = (await db.ambilBanyak(idDaftar.map((i) => `perangkat:${i}`))).filter(Boolean);
  return semua.find((d) => d.status === 'tersambung' && d.aktif !== false)
    || semua.find((d) => d.aktif !== false) || null;
}

/* dorong: fungsi yang menjalankan antrean sesudah pesan masuk (milik pintu pemanggil). */
async function kirimKwitansi({ data, pengguna, req, dorong }) {
  const id = util.bersihkanTeks(data.penghimpunanId || '', 60);
  if (!id) throw new GalatAplikasi('Data penghimpunannya tidak diketahui.');
  const teks = util.bersihkanTeks(data.teks || '', 4000);
  if (!teks) throw new GalatAplikasi('Isi pesan ucapan terima kasih tidak boleh kosong.');

  const sebelumnya = await db.ambil(KUNCI_KW(id));
  if (sebelumnya && !data.paksa) {
    const pesanLama = await db.ambil(antreanLib.KUNCI_PESAN(sebelumnya.pesanId));
    const st = statusKwitansi(pesanLama);
    if (st !== 'gagal') {
      return { sudah: true, status: st, pesan: 'Kwitansi ini sudah dikirim ke ' + sebelumnya.nomor + '. Pilih "Kirim ulang" kalau memang perlu.' };
    }
  }

  const perangkat = await perangkatKwitansi();
  if (!perangkat) throw new GalatAplikasi('Belum ada perangkat WhatsApp di menu Broadcast. Tambahkan dan sambungkan dulu.', 409);

  const { kontak, baru } = await pastikanKontakDonatur({ nama: data.nama, nomor: data.nomor, alamat: data.alamat }, pengguna);
  if (kontakLib.diblokir(kontak)) {
    throw new GalatAplikasi(`${kontak.nama} berhenti berlangganan atau diblokir di Broadcast, jadi kwitansinya tidak dikirim.`, 409);
  }

  let lampir = {};
  if (data.base64) {
    const berkas = await berkasLib.simpanBerkas({ nama: data.namaBerkas || 'kwitansi.png', tipe: data.tipe || 'image/png', base64: data.base64 });
    lampir = { berkasId: berkas.id, namaBerkas: berkas.nama, tipeBerkas: berkas.tipe, jenisBerkas: berkas.jenis };
  }
  const pesan = await antreanLib.antrikan({
    perangkatId: perangkat.id, nomor: kontak.nomor, nama: kontak.nama, kontakId: kontak.id,
    isi: { teks, ...lampir },
    prioritas: 1,   // kwitansi didahulukan atas kiriman massal dan balasan biasa
    kunciIdempoten: sebelumnya ? undefined : `kwitansi:${id}`,   // klik ganda tidak mengirim dua; kirim ulang/gagal sengaja baru
    oleh: pengguna.id,
  });
  await db.simpan(KUNCI_KW(id), {
    id, pesanId: pesan.id, nomor: kontak.nomor, nama: kontak.nama, kontakId: kontak.id,
    waktu: util.sekarang(), olehId: pengguna.id, olehNama: pengguna.nama,
    percobaan: (sebelumnya ? sebelumnya.percobaan || 1 : 0) + 1,
  });
  await db.tambahKeHimpunan(DAFTAR_KW, id);
  await auth.catatAudit(pengguna, 'kwitansi.kirim', { penghimpunanId: id, kontakBaru: baru }, req);
  if (dorong) await dorong();
  return { pesanId: pesan.id, status: 'menunggu', kontakBaru: baru, kontakId: kontak.id,
    pesan: 'Kwitansi masuk antrean WhatsApp' + (baru ? ' dan nomornya disimpan sebagai kontak Broadcast.' : ' (kontak Broadcast sudah ada, tidak dibuat ganda).') };
}

async function petaStatus() {
  const ids = await db.anggotaHimpunan(DAFTAR_KW);
  if (!ids.length) return {};
  const catatan = (await db.ambilBanyak(ids.map(KUNCI_KW))).filter(Boolean);
  const pesan = await db.ambilBanyak(catatan.map((c) => antreanLib.KUNCI_PESAN(c.pesanId)));
  const peta = {};
  catatan.forEach((c, i) => { peta[c.id] = { status: statusKwitansi(pesan[i]), waktu: c.waktu, nomor: c.nomor, percobaan: c.percobaan || 1 }; });
  return peta;
}

module.exports = { KUNCI_KW, DAFTAR_KW, statusKwitansi, pastikanKontakDonatur, perangkatKwitansi, kirimKwitansi, petaStatus };
