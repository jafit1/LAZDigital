// lib/kontak.js — daftar kontak milik aplikasi sendiri
//
// Sengaja TIDAK terikat tabel Donatur LAZDigital: banyak calon donatur dan
// simpatisan belum pernah bertransaksi, tetapi tetap perlu dihubungi.

const db = require('./db');
const { id, sekarang, normalkanNomor, nomorValid, nomorCocok, bersihkanTeks } = require('./util');

const SEGMEN = [
  { kode: 'donatur-rutin', label: 'Donatur rutin' },
  { kode: 'donatur-musiman', label: 'Donatur musiman' },
  { kode: 'muzaki-zakat-mal', label: 'Muzaki zakat mal' },
  { kode: 'mustahik', label: 'Mustahik binaan' },
  { kode: 'pengurus-kll', label: 'Pengurus KLL/ULL' },
  { kode: 'amil-relawan', label: 'Amil & relawan' },
  { kode: 'mitra', label: 'Mitra / instansi' },
  { kode: 'simpatisan', label: 'Simpatisan belum berdonasi' },
];

const KUNCI = (i) => `kontak:${i}`;
const DAFTAR = 'kontak:daftar';
const IDX_NOMOR = 'idx:nomor';

async function cariLewatNomor(nomor) {
  const n = normalkanNomor(nomor);
  const peta = (await db.ambil(IDX_NOMOR)) || {};
  return peta[n] ? db.ambil(KUNCI(peta[n])) : null;
}

async function simpanKontak(data, oleh = null) {
  const nomor = normalkanNomor(data.nomor);
  if (!nomorValid(nomor)) throw new Error('Nomor WhatsApp tidak sah');

  let kontak = data.id ? await db.ambil(KUNCI(data.id)) : await cariLewatNomor(nomor);
  const baru = !kontak;

  kontak = Object.assign(
    {
      id: id('k_'),
      dibuat: sekarang(),
      langganan: true,
      daftarHitam: false,
      catatan: '',
      kolomTambahan: {},
    },
    kontak || {},
    {
      nama: bersihkanTeks(data.nama || (kontak && kontak.nama) || '', 120),
      nomor,
      segmen: Array.isArray(data.segmen) ? data.segmen.filter((s) => SEGMEN.some((x) => x.kode === s)) : (kontak ? kontak.segmen : []),
      label: Array.isArray(data.label) ? data.label.map((l) => bersihkanTeks(l, 40)).slice(0, 12) : (kontak ? kontak.label : []),
      kantor: bersihkanTeks(data.kantor !== undefined ? data.kantor : (kontak && kontak.kantor) || '', 80),
      alamat: bersihkanTeks(data.alamat !== undefined ? data.alamat : (kontak && kontak.alamat) || '', 200),
      surel: bersihkanTeks(data.surel !== undefined ? data.surel : (kontak && kontak.surel) || '', 120),
      catatan: bersihkanTeks(data.catatan !== undefined ? data.catatan : (kontak && kontak.catatan) || '', 1000),
      anonim: data.anonim !== undefined ? Boolean(data.anonim) : Boolean(kontak && kontak.anonim),
      diubah: sekarang(),
      diubahOleh: oleh ? oleh.id : null,
    }
  );
  if (!kontak.nama) kontak.nama = nomor;

  await db.simpan(KUNCI(kontak.id), kontak);
  await db.tambahKeHimpunan(DAFTAR, kontak.id);
  const peta = (await db.ambil(IDX_NOMOR)) || {};
  for (const [n, kid] of Object.entries(peta)) if (kid === kontak.id && n !== nomor) delete peta[n];
  peta[nomor] = kontak.id;
  await db.simpan(IDX_NOMOR, peta);

  return { kontak, baru };
}

async function hapusKontak(kontakId) {
  const kontak = await db.ambil(KUNCI(kontakId));
  if (!kontak) throw new Error('Kontak tidak ditemukan');
  await db.hapus(KUNCI(kontakId));
  await db.keluarDariHimpunan(DAFTAR, kontakId);
  const peta = (await db.ambil(IDX_NOMOR)) || {};
  delete peta[kontak.nomor];
  await db.simpan(IDX_NOMOR, peta);
  return true;
}

async function semuaKontak() {
  const idDaftar = await db.anggotaHimpunan(DAFTAR);
  const isi = await db.ambilBanyak(idDaftar.map(KUNCI));
  return isi.filter(Boolean);
}

// Saringan + halaman. Penyaringan kantor untuk peran KLL dikerjakan di sini,
// di server — bukan disembunyikan di tampilan.
async function daftarKontak({ cari = '', segmen = '', label = '', halaman = 1, perHalaman = 25, kantorTerkunci = null } = {}) {
  let isi = await semuaKontak();

  if (kantorTerkunci) {
    isi = isi.filter((k) => (k.kantor || '') === kantorTerkunci);
  }
  if (segmen) isi = isi.filter((k) => (k.segmen || []).includes(segmen));
  if (label) isi = isi.filter((k) => (k.label || []).includes(label));
  if (cari) {
    const q = cari.toLowerCase();
    isi = isi.filter((k) =>
      String(k.nama).toLowerCase().includes(q) ||
      nomorCocok(k.nomor, cari) ||
      String(k.kantor || '').toLowerCase().includes(q));
  }

  isi.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
  const total = isi.length;
  const mulai = (Math.max(1, halaman) - 1) * perHalaman;
  return { total, halaman, perHalaman, baris: isi.slice(mulai, mulai + perHalaman) };
}

// Impor CSV/tempel teks. Kolom dikenali dari baris kepala.
function uraikanCsv(teks) {
  const baris = String(teks || '').split(/\r?\n/).filter((b) => b.trim());
  if (!baris.length) return [];
  const pisah = (b) => {
    const hasil = [];
    let saat = '';
    let dalamKutip = false;
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (c === '"') {
        if (dalamKutip && b[i + 1] === '"') { saat += '"'; i++; } else dalamKutip = !dalamKutip;
      } else if ((c === ',' || c === ';' || c === '\t') && !dalamKutip) {
        hasil.push(saat); saat = '';
      } else saat += c;
    }
    hasil.push(saat);
    return hasil.map((s) => s.trim());
  };

  const kepala = pisah(baris[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const petaKolom = {
    nama: ['nama', 'namalengkap', 'name'],
    nomor: ['nomor', 'nowa', 'whatsapp', 'hp', 'telepon', 'phone', 'nohp'],
    kantor: ['kantor', 'kll', 'ull', 'layanan'],
    surel: ['surel', 'email'],
    alamat: ['alamat', 'address'],
    segmen: ['segmen', 'kategori', 'grup'],
    catatan: ['catatan', 'keterangan', 'note'],
  };
  const indeks = {};
  for (const [medan, kemungkinan] of Object.entries(petaKolom)) {
    indeks[medan] = kepala.findIndex((h) => kemungkinan.includes(h));
  }
  // Tanpa baris kepala yang dikenali: anggap kolom 1 nama, kolom 2 nomor
  if (indeks.nomor === -1 && indeks.nama === -1) {
    return baris.map((b) => {
      const k = pisah(b);
      return { nama: k[0] || '', nomor: k[1] || k[0] || '' };
    });
  }

  return baris.slice(1).map((b) => {
    const k = pisah(b);
    const objek = {};
    for (const [medan, i] of Object.entries(indeks)) if (i > -1) objek[medan] = k[i] || '';
    if (objek.segmen) objek.segmen = String(objek.segmen).split(/[|/]/).map((s) => s.trim()).filter(Boolean);
    return objek;
  });
}

async function imporKontak(teks, oleh) {
  const baris = uraikanCsv(teks);
  const hasil = { total: baris.length, baru: 0, diperbarui: 0, dilewati: 0, galat: [] };
  for (const b of baris) {
    try {
      if (!nomorValid(b.nomor)) { hasil.dilewati++; continue; }
      const { baru } = await simpanKontak(b, oleh);
      if (baru) hasil.baru++; else hasil.diperbarui++;
    } catch (e) {
      hasil.dilewati++;
      if (hasil.galat.length < 10) hasil.galat.push(`${b.nama || b.nomor}: ${e.message}`);
    }
  }
  return hasil;
}

function keCsv(daftar) {
  const kepala = ['nama', 'nomor', 'kantor', 'surel', 'alamat', 'segmen', 'label', 'langganan', 'catatan'];
  const baris = [kepala.join(',')];
  for (const k of daftar) {
    baris.push(kepala.map((h) => {
      let v = k[h];
      if (Array.isArray(v)) v = v.join('|');
      if (typeof v === 'boolean') v = v ? 'ya' : 'tidak';
      v = String(v === undefined || v === null ? '' : v);
      return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  return baris.join('\n');
}

// Kontak yang boleh menerima kiriman massal: langganan aktif, bukan daftar hitam
function bolehDikirimiMassal(kontak) {
  return Boolean(kontak && kontak.langganan && !kontak.daftarHitam);
}

module.exports = {
  SEGMEN, simpanKontak, hapusKontak, daftarKontak, semuaKontak, cariLewatNomor,
  imporKontak, uraikanCsv, keCsv, bolehDikirimiMassal, KUNCI,
};
