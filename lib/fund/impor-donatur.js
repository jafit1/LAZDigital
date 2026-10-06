'use strict';
/* Impor donatur Fundraising dari teks/berkas. Satu baris satu donatur, urutan:
     nama, alamat, nomor, jadwal
   Pemisah: tab, titik koma, garis tegak, atau koma. Nomor dicari sebagai isian
   yang berbentuk nomor HP, jadi alamat yang memuat koma tidak merusak urutan.
   Hasilnya hanya USULAN: tidak ada yang tersimpan sebelum petugas menyetujui
   pratinjau. Donatur yang nomornya sudah ada tidak digandakan. */
const util = require('../blast/util');
const { tglLokal, tglValid, NAMA_HARI } = require('./util');

const BULAN = { januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, agt: 8, agust: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, desember: 12, des: 12 };
const HARI = { minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
const KEPALA = /^\s*(no\.?\s*)?nama\b/i;

const dua = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => {
  const t = `${y}-${dua(m)}-${dua(d)}`;
  const dt = new Date(t + 'T12:00:00Z');
  return tglValid(t) && dt.getUTCMonth() + 1 === Number(m) ? t : '';
};
function geser(tgl, hari) { const d = new Date(tgl + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + hari); return d.toISOString().slice(0, 10); }

function mirip(s) { return /^\+?[\d\s\-().]{8,}$/.test(String(s || '').trim()) && String(s).replace(/\D/g, '').length >= 8; }

/* Teks jadwal -> { tanggal, ulang } atau { galat }. Kosong = tanpa jadwal. */
function bacaJadwal(teks, hariIni) {
  const t = String(teks || '').trim().toLowerCase();
  if (!t) return { jadwal: null };
  hariIni = hariIni || tglLokal();
  let ulang = 'sekali';
  if (/(mingguan|tiap minggu|setiap minggu|tiap pekan|setiap pekan)/.test(t) || /(tiap|setiap|hari)\s+(senin|selasa|rabu|kamis|jum'?at|sabtu|minggu|ahad)/.test(t)) ulang = 'mingguan';
  if (/(bulanan|tiap bulan|setiap bulan)/.test(t)) ulang = 'bulanan';
  let tanggal = '';
  let m;
  if ((m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) tanggal = iso(m[1], m[2], m[3]);
  else if ((m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) tanggal = iso(m[3], m[2], m[1]);
  else if ((m = t.match(/(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/)) && BULAN[m[2]]) tanggal = iso(m[3], BULAN[m[2]], m[1]);
  if (!tanggal) {
    const h = Object.keys(HARI).find((k) => new RegExp('\\b' + k + '\\b').test(t));
    if (h) {
      const dari = new Date(hariIni + 'T12:00:00Z').getUTCDay();
      tanggal = geser(hariIni, (HARI[h] - dari + 7) % 7);
      if (!/(tiap|setiap|mingguan)/.test(t) && ulang === 'sekali') ulang = 'sekali';
    } else if ((m = t.match(/(?:tgl\.?|tanggal)\s*(\d{1,2})\b/)) || (ulang === 'bulanan' && (m = t.match(/\b(\d{1,2})\b/)))) {
      const hari = Number(m[1]);
      const [y, mo] = hariIni.split('-').map(Number);
      let c = iso(y, mo, hari);
      if (!c || c < hariIni) { const nx = mo === 12 ? [y + 1, 1] : [y, mo + 1]; c = iso(nx[0], nx[1], hari); }
      tanggal = c;
      if (/(tgl|tanggal)/.test(t) && !/sekali/.test(t)) ulang = 'bulanan';
    }
  }
  if (!tanggal) return { galat: `Jadwal "${String(teks).trim()}" tidak terbaca (contoh: 15 Oktober 2026, 2026-10-15, setiap Senin, tanggal 5)` };
  return { jadwal: { tanggal, ulang } };
}

function pecah(baris) {
  const b = String(baris);
  for (const p of ['\t', ';', '|']) if (b.includes(p)) return b.split(p).map((x) => x.trim());
  return b.split(',').map((x) => x.trim());
}

/* teks -> { baris:[{no,nama,alamat,telepon,jadwal,status,alasan}], ringkas } */
function periksa(teks, { adaNomor = new Set(), hariIni } = {}) {
  const lihat = new Set();
  const keluar = [];
  const sumber = String(teks || '').replace(/\r/g, '').split('\n');
  sumber.forEach((mentah, i) => {
    if (!mentah.trim()) return;
    if (i === 0 || keluar.length === 0) { if (KEPALA.test(mentah)) return; }
    const f = pecah(mentah);
    const rec = { no: i + 1, nama: '', alamat: '', telepon: '', jadwal: null, jadwalTeks: '', status: 'baru', alasan: '' };
    rec.nama = util.bersihkanTeks(f[0] || '', 100);
    const ix = f.findIndex((x, k) => k > 0 && mirip(x));
    if (ix > 0) {
      rec.alamat = util.bersihkanTeks(f.slice(1, ix).filter(Boolean).join(', '), 240);
      rec.telepon = util.normalkanNomor(f[ix]);
      rec.jadwalTeks = f.slice(ix + 1).filter(Boolean).join(' ');
    } else {
      rec.alamat = util.bersihkanTeks(f.slice(1, -1).filter(Boolean).join(', '), 240);
    }
    const j = bacaJadwal(rec.jadwalTeks, hariIni);
    if (!rec.nama) { rec.status = 'galat'; rec.alasan = 'Nama kosong'; }
    else if (!rec.telepon || !util.nomorValid(rec.telepon)) { rec.status = 'galat'; rec.alasan = 'Nomor HP tidak ditemukan atau tidak sah'; }
    else if (j.galat) { rec.status = 'galat'; rec.alasan = j.galat; }
    else if (adaNomor.has(rec.telepon)) { rec.status = 'ada'; rec.alasan = 'Nomor ini sudah ada di daftar donatur'; }
    else if (lihat.has(rec.telepon)) { rec.status = 'ada'; rec.alasan = 'Nomor kembar di teks ini'; }
    rec.jadwal = j.jadwal || null;
    if (rec.status === 'baru') lihat.add(rec.telepon);
    keluar.push(rec);
  });
  const hitung = (s) => keluar.filter((x) => x.status === s).length;
  return { baris: keluar, ringkas: { total: keluar.length, baru: hitung('baru'), ada: hitung('ada'), galat: hitung('galat') } };
}

module.exports = { periksa, bacaJadwal };
