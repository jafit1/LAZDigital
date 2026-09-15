// lib/auth.js — sandi, sesi, kunci bertingkat, dan audit

const crypto = require('crypto');
const sesiLaz = require('./sesi-laz');
const db = require('./db');
const { id, sekarang, ipPermintaan, GalatAplikasi, bandingAman } = require('./util');
const { punyaIzin, PERAN } = require('./peran');

const UMUR_SESI = 60 * 60 * 12; // 12 jam
const KUNCI_SESI = (t) => `sesi:${t}`;
const KUNCI_PENGGUNA = (i) => `pengguna:${i}`;
const IDX_USERNAME = 'idx:username';

// --- Sandi -----------------------------------------------------------------
function acakGaram() {
  return crypto.randomBytes(16).toString('hex');
}

function hashSandi(sandi, garam) {
  return crypto.pbkdf2Sync(String(sandi), String(garam), 120000, 32, 'sha256').toString('hex');
}

function sandiLayak(sandi) {
  const s = String(sandi || '');
  return s.length >= 8 && /[A-Za-z]/.test(s) && /[0-9]/.test(s);
}

// --- Pengguna --------------------------------------------------------------
async function cariPenggunaLewatUsername(username) {
  const peta = (await db.ambil(IDX_USERNAME)) || {};
  const pid = peta[String(username || '').toLowerCase()];
  if (!pid) return null;
  return db.ambil(KUNCI_PENGGUNA(pid));
}

async function simpanPengguna(pengguna) {
  await db.simpan(KUNCI_PENGGUNA(pengguna.id), pengguna);
  const peta = (await db.ambil(IDX_USERNAME)) || {};
  for (const [u, pid] of Object.entries(peta)) {
    if (pid === pengguna.id && u !== pengguna.username.toLowerCase()) delete peta[u];
  }
  peta[pengguna.username.toLowerCase()] = pengguna.id;
  await db.simpan(IDX_USERNAME, peta);
  await db.tambahKeHimpunan('pengguna:daftar', pengguna.id);
  return pengguna;
}

async function buatPengguna({ nama, username, sandi, peran = 'petugas', kantor = '' }) {
  if (!PERAN[peran]) throw new GalatAplikasi('Peran tidak dikenal');
  if (!sandiLayak(sandi)) {
    throw new GalatAplikasi('Sandi minimal 8 karakter dan memuat huruf serta angka');
  }
  const uname = String(username || '').toLowerCase().trim();
  if (!/^[a-z0-9._-]{3,32}$/.test(uname)) {
    throw new GalatAplikasi('Nama pengguna hanya boleh huruf kecil, angka, titik, garis bawah, atau strip (3–32 karakter)');
  }
  if (await cariPenggunaLewatUsername(uname)) {
    throw new GalatAplikasi('Nama pengguna sudah dipakai');
  }
  const garam = acakGaram();
  const pengguna = {
    id: id('p_'),
    nama: String(nama || uname).trim(),
    username: uname,
    garam,
    sandiHash: hashSandi(sandi, garam),
    peran,
    kantor: String(kantor || '').trim(),
    aktif: true,
    dibuat: sekarang(),
    sandiDiubah: sekarang(),
  };
  return simpanPengguna(pengguna);
}

function pengunaTampil(p) {
  if (!p) return null;
  const { garam, sandiHash, ...sisa } = p;
  return sisa;
}

// --- Kunci bertingkat saat gagal masuk -------------------------------------
// 5x = 1 menit, 8x = 5 menit, 12x = 30 menit (mengikuti LAZDigital)
function durasiKunci(gagal) {
  if (gagal >= 12) return 30 * 60;
  if (gagal >= 8) return 5 * 60;
  if (gagal >= 5) return 60;
  return 0;
}

async function periksaKunci(kunci) {
  const data = await db.ambil(`kunci:${kunci}`);
  if (!data) return { terkunci: false, gagal: 0 };
  if (data.sampai && Date.now() < data.sampai) {
    return { terkunci: true, gagal: data.gagal, sisaDetik: Math.ceil((data.sampai - Date.now()) / 1000) };
  }
  return { terkunci: false, gagal: data.gagal || 0 };
}

async function catatGagal(kunci) {
  const data = (await db.ambil(`kunci:${kunci}`)) || { gagal: 0 };
  data.gagal = (data.gagal || 0) + 1;
  const durasi = durasiKunci(data.gagal);
  data.sampai = durasi ? Date.now() + durasi * 1000 : 0;
  await db.simpan(`kunci:${kunci}`, data, { detik: 60 * 60 });
  return data;
}

async function bersihkanGagal(kunci) {
  await db.hapus(`kunci:${kunci}`);
}

// --- Sesi ------------------------------------------------------------------
function tokenSesi() {
  return crypto.randomBytes(32).toString('hex');
}

async function buatSesi(penggunaId, req) {
  const token = tokenSesi();
  await db.simpan(KUNCI_SESI(token), {
    penggunaId,
    dibuat: sekarang(),
    ip: ipPermintaan(req),
    perangkat: String((req.headers && req.headers['user-agent']) || '').slice(0, 200),
  }, { detik: UMUR_SESI });
  await db.tambahKeHimpunan(`sesi:milik:${penggunaId}`, token);
  return token;
}

async function hapusSesi(token) {
  const sesi = await db.ambil(KUNCI_SESI(token));
  await db.hapus(KUNCI_SESI(token));
  if (sesi) await db.keluarDariHimpunan(`sesi:milik:${sesi.penggunaId}`, token);
}

async function hapusSemuaSesi(penggunaId, kecuali = null) {
  const daftar = await db.anggotaHimpunan(`sesi:milik:${penggunaId}`);
  for (const t of daftar) {
    if (t === kecuali) continue;
    await db.hapus(KUNCI_SESI(t));
    await db.keluarDariHimpunan(`sesi:milik:${penggunaId}`, t);
  }
}

function bacaKuki(req, nama) {
  const mentah = (req.headers && req.headers.cookie) || '';
  for (const bagian of mentah.split(';')) {
    const [k, ...v] = bagian.trim().split('=');
    if (k === nama) return decodeURIComponent(v.join('='));
  }
  return null;
}

function pasangKuki(res, token) {
  const aman = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `blast_sesi=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${UMUR_SESI}${aman}`);
}

function hapusKuki(res) {
  const aman = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `blast_sesi=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${aman}`);
}

/* DIGABUNG KE LAZDIGITAL: Blast tidak lagi punya sesi sendiri.
   Identitas diambil dari token LAZDigital, supaya petugas cukup masuk
   sekali dan pencabutan akses di Manajemen User langsung berlaku di sini.
   Kunci blast:sesi:* dan blast:pengguna:* berhenti dipakai. */
async function penggunaDariPermintaan(req) {
  return sesiLaz.penggunaLaz(req);
}

async function wajibMasuk(req) {
  const pengguna = await penggunaDariPermintaan(req);
  if (!pengguna) {
    if (req && req.__alasanBlast === 'izin') {
      throw new GalatAplikasi('Akun Anda belum diberi akses modul Broadcast. Minta admin mencentangnya di Manajemen User.', 403);
    }
    throw new GalatAplikasi('Sesi berakhir. Silakan masuk kembali lewat LAZDigital.', 401);
  }
  return pengguna;
}

function wajibIzin(pengguna, izin) {
  if (!punyaIzin(pengguna, izin)) {
    throw new GalatAplikasi('Anda tidak berhak melakukan tindakan ini', 403);
  }
  return true;
}

// --- Audit -----------------------------------------------------------------
async function catatAudit(pengguna, tindakan, rincian = {}, req = null) {
  const baris = {
    id: id('a_'),
    waktu: sekarang(),
    penggunaId: pengguna ? pengguna.id : null,
    nama: pengguna ? pengguna.nama : 'sistem',
    peran: pengguna ? pengguna.peran : 'sistem',
    tindakan,
    rincian,
    ip: req ? ipPermintaan(req) : null,
  };
  try {
    const daftar = (await db.ambil('audit')) || [];
    daftar.unshift(baris);
    await db.simpan('audit', daftar.slice(0, 1000));
  } catch (e) {
    console.error('[audit] gagal mencatat:', e.message);
  }
  return baris;
}

// --- Masuk -----------------------------------------------------------------
async function masuk({ username, sandi }, req, res) {
  const uname = String(username || '').toLowerCase().trim();
  const ip = ipPermintaan(req);
  const pesanSeragam = 'Nama pengguna atau sandi salah';

  for (const kunci of [`u:${uname}`, `ip:${ip}`]) {
    const status = await periksaKunci(kunci);
    if (status.terkunci) {
      throw new GalatAplikasi(
        `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(status.sisaDetik / 60)} menit.`, 429);
    }
  }

  const pengguna = await cariPenggunaLewatUsername(uname);
  const cocok = pengguna && bandingAman(hashSandi(sandi, pengguna.garam), pengguna.sandiHash);

  if (!cocok || !pengguna.aktif) {
    await catatGagal(`u:${uname}`);
    await catatGagal(`ip:${ip}`);
    throw new GalatAplikasi(pesanSeragam, 401);
  }

  await bersihkanGagal(`u:${uname}`);
  await bersihkanGagal(`ip:${ip}`);

  const token = await buatSesi(pengguna.id, req);
  pasangKuki(res, token);

  pengguna.masukTerakhir = sekarang();
  await db.simpan(KUNCI_PENGGUNA(pengguna.id), pengguna);
  const riwayat = (await db.ambil(`riwayatMasuk:${pengguna.id}`)) || [];
  riwayat.unshift({ waktu: sekarang(), ip, perangkat: String((req.headers || {})['user-agent'] || '').slice(0, 200) });
  await db.simpan(`riwayatMasuk:${pengguna.id}`, riwayat.slice(0, 50));

  await catatAudit(pengguna, 'masuk', {}, req);
  return pengunaTampil(pengguna);
}

async function gantiSandi(pengguna, { sandiLama, sandiBaru }, req) {
  if (!bandingAman(hashSandi(sandiLama, pengguna.garam), pengguna.sandiHash)) {
    throw new GalatAplikasi('Sandi lama tidak cocok');
  }
  if (!sandiLayak(sandiBaru)) {
    throw new GalatAplikasi('Sandi baru minimal 8 karakter dan memuat huruf serta angka');
  }
  pengguna.garam = acakGaram();
  pengguna.sandiHash = hashSandi(sandiBaru, pengguna.garam);
  pengguna.sandiDiubah = sekarang();
  await db.simpan(KUNCI_PENGGUNA(pengguna.id), pengguna);
  await hapusSemuaSesi(pengguna.id, pengguna._token); // sesi lain dimatikan
  await catatAudit(pengguna, 'ganti-sandi', {}, req);
  return true;
}

module.exports = {
  UMUR_SESI, hashSandi, acakGaram, sandiLayak, buatPengguna, simpanPengguna,
  cariPenggunaLewatUsername, pengunaTampil, penggunaDariPermintaan, wajibMasuk,
  wajibIzin, masuk, gantiSandi, hapusSesi, hapusSemuaSesi, pasangKuki, hapusKuki,
  bacaKuki, catatAudit, KUNCI_PENGGUNA,
};
