// lib/fund/donatur.js — basis data donatur milik modul Fundraising
//
// Tiap donatur DIMILIKI oleh satu akun fundraiser (medan `pemilik` = id akun
// LAZDigital). Fundraiser hanya melihat donaturnya sendiri; koordinator dan
// superadmin melihat semua. Kepemilikan dipakai untuk menyaring, BUKAN untuk
// keamanan mutlak — pagar sesungguhnya tetap di api/fund.js (server).

const db = require('./db');
const util = require('../blast/util');
const { tglValid, lokasiValid } = require('./util');
const { id, sekarang, normalkanNomor, bersihkanTeks } = util;

const KUNCI = (i) => `donatur:${i}`;
const DAFTAR = 'donatur:daftar';

const BATAS_GRUP = 8;
const PANJANG_GRUP = 40;

function rapikanGrup(nama) {
  return bersihkanTeks(nama, PANJANG_GRUP).replace(/\s+/g, ' ').trim();
}

/* Grup datang sebagai array atau teks dipisah koma; disatukan jadi array unik
   yang rapi. Donatur yang sama tidak boleh punya "Ramadan" dan "ramadan"
   sekaligus — dibedakan huruf besar-kecil, keduanya jadi dua grup yang di mata
   petugas satu. */
function bersihkanGrupBanyak(masukan) {
  const kasar = Array.isArray(masukan) ? masukan : String(masukan || '').split(',');
  const keluar = [];
  const terlihat = new Set();
  for (const g of kasar) {
    const r = rapikanGrup(g);
    if (!r) continue;
    const k = r.toLowerCase();
    if (terlihat.has(k)) continue;
    terlihat.add(k);
    keluar.push(r);
    if (keluar.length >= BATAS_GRUP) break;
  }
  return keluar;
}

async function semuaDonatur() {
  const ids = await db.anggotaHimpunan(DAFTAR);
  if (!ids.length) return [];
  return (await db.ambilBanyak(ids.map(KUNCI))).filter(Boolean);
}

async function ambilDonatur(donaturId) {
  return db.ambil(KUNCI(donaturId));
}

/* Kepemilikan diperiksa di satu tempat. lihatSemua = koordinator/superadmin. */
function boleh(donatur, pemilik, lihatSemua) {
  if (lihatSemua) return true;
  return donatur && String(donatur.pemilik || '') === String(pemilik || '');
}

/* Menyaring dipisahkan dari menghalaman — sama alasannya dengan kontak di
   Broadcast: daftar yang menghitung "24 donatur" dan tombol yang menghapusnya
   wajib memakai saringan yang SATU, bukan dua yang mirip lalu berbeda diam-diam. */
async function saringDonatur({ cari = '', grup = '', pemilik = null, lihatSemua = false } = {}) {
  let isi = await semuaDonatur();
  if (!lihatSemua) isi = isi.filter((d) => String(d.pemilik || '') === String(pemilik || ''));

  const grupCari = rapikanGrup(grup);
  if (grupCari) {
    const gc = grupCari.toLowerCase();
    isi = isi.filter((d) => (d.grup || []).some((g) => rapikanGrup(g).toLowerCase() === gc));
  }
  if (cari) {
    const q = String(cari).toLowerCase();
    isi = isi.filter((d) =>
      String(d.nama).toLowerCase().includes(q) ||
      util.nomorCocok(d.telepon, cari) ||
      String(d.alamat || '').toLowerCase().includes(q) ||
      String((d.lokasi && d.lokasi.alamat) || '').toLowerCase().includes(q));
  }
  isi.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
  return isi;
}

async function daftarDonatur({ halaman = 1, perHalaman = 25, ...saring } = {}) {
  const isi = await saringDonatur(saring);
  const mulai = (Math.max(1, halaman) - 1) * perHalaman;
  return { total: isi.length, halaman, perHalaman, baris: isi.slice(mulai, mulai + perHalaman) };
}

async function daftarGrup({ pemilik = null, lihatSemua = false } = {}) {
  const isi = await saringDonatur({ pemilik, lihatSemua });
  const peta = new Map();
  for (const d of isi) {
    for (const g of d.grup || []) {
      const r = rapikanGrup(g);
      if (!r) continue;
      const k = r.toLowerCase();
      peta.set(k, { nama: r, jumlah: (peta.get(k) ? peta.get(k).jumlah : 0) + 1 });
    }
  }
  return Array.from(peta.values()).sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/* Jadwal pengambilan sebuah donatur:
   { tanggal:'YYYY-MM-DD', ulang:'sekali'|'mingguan'|'bulanan', catatan }
   'ulang' menentukan apakah tanggalnya menggelinding sendiri sesudah diambil. */
function bersihkanJadwal(j) {
  if (!j || !j.tanggal) return null;
  if (!tglValid(j.tanggal)) return null;
  const ulang = ['sekali', 'mingguan', 'bulanan'].includes(j.ulang) ? j.ulang : 'sekali';
  return { tanggal: j.tanggal, ulang, catatan: bersihkanTeks(j.catatan, 200) };
}

/* Wajib: nama, telepon, dan LOKASI (titik lat/lng). Alamat teks boleh kosong
   kalau petugas hanya menandai titik tanpa menunggu alamat otomatis. */
async function simpanDonatur(data, pemilik) {
  const { bersih, galat } = util.periksaSkema(data, {
    nama: { wajib: true, label: 'Nama lengkap', maks: 100 },
  });
  if (galat.length) throw new util.GalatAplikasi(galat.join('. '));

  const telepon = normalkanNomor(data.telepon || '');
  if (!telepon || !util.nomorValid(telepon)) {
    throw new util.GalatAplikasi('Nomor HP/WA wajib diisi dan harus berupa nomor yang benar.');
  }

  const lat = data.lokasi ? data.lokasi.lat : data.lat;
  const lng = data.lokasi ? data.lokasi.lng : data.lng;
  if (!lokasiValid(lat, lng)) {
    throw new util.GalatAplikasi('Lokasi wajib ditandai. Tekan "Lokasi saya" atau geser pin di peta.');
  }

  const adaId = data.id ? await ambilDonatur(data.id) : null;
  if (data.id && !adaId) throw new util.GalatAplikasi('Donatur tidak ditemukan', 404);

  const lokasi = {
    lat: Number(lat),
    lng: Number(lng),
    alamat: bersihkanTeks((data.lokasi && data.lokasi.alamat) || data.alamatLokasi || '', 240),
  };

  const donatur = {
    id: adaId ? adaId.id : id('d_'),
    /* Pemilik TIDAK berpindah saat donatur disunting oleh orang lain: donatur
       yang dikumpulkan seorang fundraiser tetap miliknya walau koordinator
       ikut mengoreksi datanya. */
    pemilik: adaId ? adaId.pemilik : String(pemilik || ''),
    nama: bersih.nama,
    telepon,
    alamat: bersihkanTeks(data.alamat, 240),
    lokasi,
    grup: bersihkanGrupBanyak(data.grup),
    catatan: bersihkanTeks(data.catatan, 500),
    jadwal: data.jadwal !== undefined ? bersihkanJadwal(data.jadwal) : (adaId ? adaId.jadwal : null),
    dibuat: adaId ? adaId.dibuat : sekarang(),
    diubah: sekarang(),
  };

  await db.simpan(KUNCI(donatur.id), donatur);
  await db.tambahKeHimpunan(DAFTAR, donatur.id);
  return { donatur, baru: !adaId };
}

async function aturJadwal(donaturId, jadwal) {
  const d = await ambilDonatur(donaturId);
  if (!d) throw new util.GalatAplikasi('Donatur tidak ditemukan', 404);
  d.jadwal = bersihkanJadwal(jadwal);
  d.diubah = sekarang();
  await db.simpan(KUNCI(d.id), d);
  return d;
}

async function hapusDonatur(donaturId) {
  const d = await ambilDonatur(donaturId);
  if (!d) throw new util.GalatAplikasi('Donatur tidak ditemukan', 404);
  await db.hapus(KUNCI(donaturId));
  await db.keluarDariHimpunan(DAFTAR, donaturId);
  return d;
}

/* Donatur yang jadwalnya jatuh pada 'tgl'. Untuk 'mingguan'/'bulanan' cukup
   pencocokan sederhana: hari-dalam-pekan sama (mingguan) atau tanggal-dalam-bulan
   sama (bulanan). Jadwal sekali cocok kalau tanggalnya persis. */
async function jadwalHari(tgl, { pemilik = null, lihatSemua = false } = {}) {
  const isi = await saringDonatur({ pemilik, lihatSemua });
  const target = new Date(tgl + 'T12:00:00+07:00');
  const hariTarget = target.getUTCDay();
  const tglBulan = target.getUTCDate();

  return isi.filter((d) => {
    const j = d.jadwal;
    if (!j || !j.tanggal) return false;
    if (j.ulang === 'sekali') return j.tanggal === tgl;
    const asal = new Date(j.tanggal + 'T12:00:00+07:00');
    if (asal.getTime() > target.getTime()) return false; // belum mulai
    if (j.ulang === 'mingguan') return asal.getUTCDay() === hariTarget;
    if (j.ulang === 'bulanan') return asal.getUTCDate() === tglBulan;
    return false;
  });
}

module.exports = {
  KUNCI, DAFTAR, BATAS_GRUP,
  semuaDonatur, ambilDonatur, boleh,
  saringDonatur, daftarDonatur, daftarGrup,
  simpanDonatur, aturJadwal, hapusDonatur, jadwalHari,
  bersihkanJadwal, bersihkanGrupBanyak,
};
