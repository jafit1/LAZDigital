// lib/fund/himpunan.js — catatan pengambilan donasi (penghimpunan sisi lapangan)
//
// Tiap kali fundraiser menekan "Diambil", satu catatan lahir di sini. Catatan
// ini adalah penghimpunan SISI FUNDRAISING — belum tentu sama dengan buku kas
// resmi LAZDigital. Halaman "Cocokkan" yang mempertemukan keduanya; sampai
// dicocokkan, keduanya sengaja berdiri sendiri supaya selisih justru terlihat,
// bukan tertutup diam-diam.

const db = require('./db');
const util = require('../blast/util');
const donaturLib = require('./donatur');
const { tglLokal, tglValid, hariKerjaBerikutnya } = require('./util');
const { id, sekarang, bersihkanTeks } = util;

const KUNCI = (i) => `himpunan:${i}`;
const DAFTAR = 'himpunan:daftar';

async function semua() {
  const ids = await db.anggotaHimpunan(DAFTAR);
  if (!ids.length) return [];
  return (await db.ambilBanyak(ids.map(KUNCI))).filter(Boolean);
}

async function ambil(himpunanId) {
  return db.ambil(KUNCI(himpunanId));
}

function boleh(rec, pemilik, lihatSemua) {
  if (lihatSemua) return true;
  return rec && String(rec.pemilik || '') === String(pemilik || '');
}

/* Satu kunjungan = satu catatan, entah berisi ('diambil') atau nihil ('kosong').
   Keduanya dicatat: kunjungan yang tidak menghasilkan apa-apa tetap kunjungan,
   dan tanpa catatannya laporan "sudah dikunjungi berapa" jadi bohong. */
async function catatKunjungan(data, { pengguna, namaFundraising, status }) {
  const donatur = await donaturLib.ambilDonatur(data.donaturId);
  if (!donatur) throw new util.GalatAplikasi('Donatur tidak ditemukan', 404);

  let jumlah = 0;
  let peruntukan = '';
  if (status === 'diambil') {
    jumlah = Math.round(Number(data.jumlah) || 0);
    if (!(jumlah > 0)) throw new util.GalatAplikasi('Nominal donasi harus lebih dari nol.');
    if (jumlah > 100000000000) throw new util.GalatAplikasi('Nominal terlalu besar — periksa lagi angkanya.');
    peruntukan = bersihkanTeks(data.peruntukan, 80);
    if (!peruntukan) throw new util.GalatAplikasi('Peruntukan wajib dipilih (mis. Zakat, Infak, Sedekah).');
  }

  const tanggal = tglValid(data.tanggal) ? data.tanggal : tglLokal();

  const rec = {
    id: id('h_'),
    donaturId: donatur.id,
    /* Nama dan nomor disalin ke catatan. Kalau hanya menyimpan id, menghapus
       donaturnya membuat laporan lama kehilangan nama — padahal uang yang sudah
       masuk tidak ikut terhapus. */
    donaturNama: donatur.nama,
    donaturTelepon: donatur.telepon,
    pemilik: donatur.pemilik,
    /* Nama fundraising disalin juga: inilah kunci pencocokan dengan buku utama,
       dan ia tidak boleh berubah surut kalau nama akunnya diganti nanti. */
    fundraising: bersihkanTeks(namaFundraising, 60),
    status,
    jumlah,
    peruntukan,
    metode: bersihkanTeks(data.metode, 40) || 'Tunai',
    catatan: bersihkanTeks(data.catatan, 500),
    tanggal,
    oleh: pengguna ? String(pengguna.id) : '',
    olehNama: pengguna ? pengguna.nama : '',
    cocok: { sudah: false, ref: '', oleh: '', waktu: '' },
    dibuat: sekarang(),
  };
  await db.simpan(KUNCI(rec.id), rec);
  await db.tambahKeHimpunan(DAFTAR, rec.id);

  /* Jadwalnya sengaja TIDAK diutak-atik di sini. Jadwal 'sekali' untuk hari ini
     tidak akan cocok lagi besok dengan sendirinya, jadi tidak ada yang
     menempel; dan membiarkannya membuat donatur yang sudah dikunjungi tetap
     terlihat di dasbor hari ini — bertanda "sudah diambil" — bukan lenyap
     seolah tidak pernah dijadwalkan. Yang menggeser jadwal hanya reschedule. */
  return rec;
}

/* Reschedule: pindahkan jadwal donatur ke hari kerja berikutnya. TIDAK membuat
   catatan penghimpunan — tidak ada uang yang berpindah, hanya janji harinya. */
async function reschedule(donaturId) {
  const donatur = await donaturLib.ambilDonatur(donaturId);
  if (!donatur) throw new util.GalatAplikasi('Donatur tidak ditemukan', 404);
  const asal = donatur.jadwal && donatur.jadwal.tanggal ? donatur.jadwal.tanggal : tglLokal();
  const baru = hariKerjaBerikutnya(asal);
  /* Reschedule mengubah kunjungan INI, jadi hasilnya jadwal sekali pada hari
     baru. Pola berulang sengaja tidak digeser diam-diam: menggeser jangkar
     mingguan berarti mengubah harinya untuk selamanya tanpa diminta. Kalau
     donatur ini memang berulang, petugas mengatur ulang polanya sekali. */
  donatur.jadwal = { tanggal: baru, ulang: 'sekali', catatan: (donatur.jadwal && donatur.jadwal.catatan) || '' };
  donatur.diubah = sekarang();
  await db.simpan(donaturLib.KUNCI(donatur.id), donatur);
  return { donatur, tanggalBaru: baru };
}

/* Donatur yang harus dikunjungi pada 'tgl', DIKURANGI yang sudah dikunjungi
   hari itu (diambil atau dinyatakan kosong). Inilah daftar kerja dasbor. */
async function jadwalKerja(tgl, lingkup = {}) {
  const jadwal = await donaturLib.jadwalHari(tgl, lingkup);
  const rec = await semua();
  /* Kunjungan hari ini per donatur — dipakai untuk menandai yang sudah beres
     dan menampilkan berapa yang terkumpul, bukan sekadar centang. */
  const kunjungan = new Map();
  for (const r of rec) if (r.tanggal === tgl) kunjungan.set(r.donaturId, r);
  return jadwal.map((d) => {
    const k = kunjungan.get(d.id) || null;
    return {
      ...d,
      sudahDikunjungi: !!k,
      hasilKunjungan: k ? { id: k.id, status: k.status, jumlah: k.jumlah, peruntukan: k.peruntukan } : null,
    };
  });
}

async function saring({ dari = '', sampai = '', status = '', cari = '', pemilik = null, lihatSemua = false } = {}) {
  let isi = await semua();
  if (!lihatSemua) isi = isi.filter((r) => String(r.pemilik || '') === String(pemilik || ''));
  if (status) isi = isi.filter((r) => r.status === status);
  if (dari) isi = isi.filter((r) => r.tanggal >= dari);
  if (sampai) isi = isi.filter((r) => r.tanggal <= sampai);
  if (cari) {
    const q = String(cari).toLowerCase();
    isi = isi.filter((r) =>
      String(r.donaturNama).toLowerCase().includes(q) ||
      String(r.peruntukan || '').toLowerCase().includes(q) ||
      util.nomorCocok(r.donaturTelepon, cari));
  }
  isi.sort((a, b) => String(b.dibuat).localeCompare(String(a.dibuat)));
  return isi;
}

function ringkas(daftar) {
  const diambil = daftar.filter((r) => r.status === 'diambil');
  return {
    kunjungan: daftar.length,
    berhasil: diambil.length,
    kosong: daftar.filter((r) => r.status === 'kosong').length,
    total: diambil.reduce((s, r) => s + (Number(r.jumlah) || 0), 0),
  };
}

async function tandaiCocok(himpunanId, ref, pengguna) {
  const rec = await ambil(himpunanId);
  if (!rec) throw new util.GalatAplikasi('Catatan tidak ditemukan', 404);
  rec.cocok = {
    sudah: true,
    ref: bersihkanTeks(ref, 60),
    oleh: pengguna ? pengguna.nama : '',
    waktu: sekarang(),
  };
  await db.simpan(KUNCI(rec.id), rec);
  return rec;
}

async function batalCocok(himpunanId) {
  const rec = await ambil(himpunanId);
  if (!rec) throw new util.GalatAplikasi('Catatan tidak ditemukan', 404);
  rec.cocok = { sudah: false, ref: '', oleh: '', waktu: '' };
  await db.simpan(KUNCI(rec.id), rec);
  return rec;
}

async function hapus(himpunanId) {
  const rec = await ambil(himpunanId);
  if (!rec) throw new util.GalatAplikasi('Catatan tidak ditemukan', 404);
  await db.hapus(KUNCI(himpunanId));
  await db.keluarDariHimpunan(DAFTAR, himpunanId);
  return rec;
}

module.exports = {
  KUNCI, DAFTAR,
  semua, ambil, boleh,
  catatKunjungan, reschedule, jadwalKerja,
  saring, ringkas, tandaiCocok, batalCocok, hapus,
};
