// lib/ai/pakai.js — pencatatan pemakaian token per bulan
//
// Disimpan per BULAN (ai:pakai:2026-09), bukan satu dokumen tunggal yang
// tumbuh selamanya. Satu dokumen abadi akan ditulis ulang seluruhnya tiap kali
// ada yang bertanya — persis masalah yang sudah ada pada laz:db, dan tidak ada
// gunanya mengulanginya di modul baru.

const db = require('./db');
const { sekarang } = require('../blast/util');

const KUNCI = (bulan) => `pakai:${bulan}`;
const DAFTAR = 'pakai:bulan';

function bulanIni() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7); // WIB
}

async function catat({ model, penyedia, penggunaId, penggunaNama, masuk, keluar }) {
  const bulan = bulanIni();
  const k = KUNCI(bulan);
  const d = (await db.ambil(k)) || { bulan, panggilan: 0, masuk: 0, keluar: 0, perModel: {}, perPengguna: {} };

  const m = Math.max(0, Number(masuk) || 0);
  const o = Math.max(0, Number(keluar) || 0);
  d.panggilan += 1;
  d.masuk += m;
  d.keluar += o;

  const km = `${penyedia || '-'} · ${model || '-'}`;
  const pm = d.perModel[km] || { panggilan: 0, masuk: 0, keluar: 0 };
  pm.panggilan += 1; pm.masuk += m; pm.keluar += o;
  d.perModel[km] = pm;

  const ku = penggunaNama || penggunaId || '-';
  const pu = d.perPengguna[ku] || { panggilan: 0, masuk: 0, keluar: 0 };
  pu.panggilan += 1; pu.masuk += m; pu.keluar += o;
  d.perPengguna[ku] = pu;

  d.diubah = sekarang();
  await db.simpan(k, d);
  await db.tambahKeHimpunan(DAFTAR, bulan);
  return d;
}

async function ambilBulan(bulan) {
  return (await db.ambil(KUNCI(bulan || bulanIni()))) || null;
}

async function daftarBulan() {
  const b = await db.anggotaHimpunan(DAFTAR);
  return b.sort().reverse();
}

/* Diurutkan dan diubah jadi array di sini, bukan di tampilan: kalau tampilan
   yang mengurutkan, halaman Penggunaan dan laporan apa pun nanti bisa
   mengurutkan dengan cara berbeda untuk angka yang sama. */
function keArray(peta) {
  return Object.entries(peta || {})
    .map(([nama, v]) => ({ nama, ...v, total: (v.masuk || 0) + (v.keluar || 0) }))
    .sort((a, b) => b.total - a.total);
}

module.exports = { KUNCI, DAFTAR, bulanIni, catat, ambilBulan, daftarBulan, keArray };
