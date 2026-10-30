// lib/pengajuan/api.js - penanganan endpoint RPC modul Pengajuan
'use strict';

const engine = require('../../api/_engine.js');
const lazpg = require('../laz-pg.js');
const kv = require('../kv-postgres.js');
const P = require('./pengajuan');

const MODUL = 'pengajuan';

let drive = null;
try { drive = require('../../api/_drive.js'); } catch (_) { drive = null; }

function ctxDari(req) {
  return {
    ip: String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim(),
    ua: String((req.headers && req.headers['user-agent']) || '').slice(0, 160),
  };
}

let DASAR_UJI = null;
async function muatDasar() {
  if (DASAR_UJI) return DASAR_UJI();
  if (lazpg.pakaiPostgres()) {
    const klien = await kv.ambilKolam().connect();
    try { return (await lazpg._internal.muat(klien, [])).db; } finally { klien.release(); }
  }
  const rpc = require('../../api/rpc.js');
  return (await rpc._internal.muat()).db;
}

async function pengguna(req, badan) {
  const token = badan.token || (req.headers && req.headers['x-laz-token']) || '';
  if (!token) return { galat: 'auth' };

  let u;
  try {
    if (lazpg.pakaiPostgres() && !DASAR_UJI) {
      u = await lazpg.cekIzin(engine, token, MODUL, 'view', ctxDari(req));
    } else {
      u = engine.cekIzin(await muatDasar(), token, MODUL, 'view', ctxDari(req));
    }
  } catch (e) {
    return { galat: /IZIN:/.test((e && e.message) || '') ? 'izin' : 'auth' };
  }

  if (!u) return { galat: 'auth' };

  const p = u.role === 'superadmin'
    ? { view: true, create: true, edit: true, delete: true }
    : ((u.permissions || {})[MODUL] || (u.permissions || {}).surat || {});

  return {
    id: u.id,
    nama: u.nama || u.username,
    peran: u.role,
    izin: {
      lihat: !!p.view,
      tambah: !!p.create,
      ubah: !!p.edit,
      hapus: !!p.delete
    }
  };
}

function wajib(p, hak) {
  if (!p.izin[hak]) {
    throw new P.GalatPengajuan('Anda tidak berhak melakukan tindakan ini.', 403);
  }
}

const T = {};

T['pengajuan.status'] = async (p) => {
  return {
    pengguna: { id: p.id, nama: p.nama, peran: p.peran },
    izin: p.izin,
    drive: !!(drive && drive.driveSiapSurat && drive.driveSiapSurat()),
    daftarStatus: P.STATUS_DAFTAR,
    daftarJenisBantuan: P.JENIS_BANTUAN_DAFTAR,
    daftarAsesmen: P.ASESMEN_DAFTAR,
  };
};

T['pengajuan.daftar'] = async (p, d) => {
  wajib(p, 'lihat');
  let daftar = await P.semua();

  if (d.status && d.status !== 'semua') {
    daftar = daftar.filter((x) => x.status === d.status);
  }
  if (d.jenisBantuan && d.jenisBantuan !== 'semua') {
    daftar = daftar.filter((x) => x.jenisBantuan === d.jenisBantuan);
  }
  if (d.bulanTahun) {
    daftar = daftar.filter((x) => String(x.tanggal || '').startsWith(d.bulanTahun));
  }
  if (d.cari) {
    const q = String(d.cari).toLowerCase();
    daftar = daftar.filter((x) =>
      [x.pemohon, x.alamat, x.keperluan, x.jenisBantuan, x.status, x.hasilAsesmen, x.hari, x.telepon]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }

  return {
    daftar,
    total: daftar.length,
    ringkasan: P.rekapan(daftar)
  };
};

T['pengajuan.detail'] = async (p, d) => {
  wajib(p, 'lihat');
  const item = await P.ambil(d.id);
  if (!item) throw new P.GalatPengajuan('Data pengajuan tidak ditemukan.', 404);
  return { pengajuan: item };
};

T['pengajuan.simpan'] = async (p, d) => {
  wajib(p, 'tambah');
  const hasil = await P.buat(d, p, drive);
  return { pengajuan: hasil, pesan: `Pengajuan dari ${hasil.pemohon} berhasil dicatat.` };
};

T['pengajuan.ubah'] = async (p, d) => {
  wajib(p, 'ubah');
  const hasil = await P.ubah(d.id, d, p, drive);
  return { pengajuan: hasil, pesan: 'Perubahan data pengajuan berhasil disimpan.' };
};

T['pengajuan.hapus'] = async (p, d) => {
  wajib(p, 'hapus');
  await P.hapus(d.id, drive);
  return { pesan: 'Data pengajuan berhasil dihapus.' };
};

T['pengajuan.rekapan'] = async (p, d) => {
  wajib(p, 'lihat');
  let daftar = await P.semua();
  if (d.bulanTahun) {
    daftar = daftar.filter((x) => String(x.tanggal || '').startsWith(d.bulanTahun));
  }
  return { rekapan: P.rekapan(daftar), jumlah: daftar.length };
};

T['pengajuan.kalender'] = async (p, d) => {
  wajib(p, 'lihat');
  const data = await P.kalender(d.tahunBulan);
  return data;
};

T['pengajuan.proposal.unggah'] = async (p, d) => {
  wajib(p, 'ubah');
  const r = await P.ambil(d.id);
  if (!r) throw new P.GalatPengajuan('Data pengajuan tidak ditemukan.', 404);
  if (r.proposal) {
    await P.hapusBerkasProposal(r.proposal, drive);
  }
  const prop = await P.prosesUnggahProposal(r, d.berkas, p, drive);
  r.proposal = prop;
  r.diubah = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
  await P.ubah(r.id, r, p, drive);
  return { proposal: prop, pesan: 'Berkas proposal berhasil diunggah.' };
};

T['pengajuan.proposal.ambil'] = async (p, d) => {
  wajib(p, 'lihat');
  return P.ambilProposal(d.id, drive);
};

T['pengajuan.proposal.hapus'] = async (p, d) => {
  wajib(p, 'ubah');
  const r = await P.ambil(d.id);
  if (!r) throw new P.GalatPengajuan('Data pengajuan tidak ditemukan.', 404);
  if (r.proposal) {
    await P.hapusBerkasProposal(r.proposal, drive);
    r.proposal = null;
    r.diubah = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
    await P.ubah(r.id, r, p, drive);
  }
  return { pesan: 'Berkas proposal berhasil dihapus.' };
};

async function tangani(req, res, badan, util) {
  const nama = String(badan.tindakan || '');
  const d = badan.data || {};
  try {
    const kerja = T[nama];
    if (!kerja) return util.gagal(res, 404, 'Tindakan pengajuan "' + nama + '" tidak dikenal');

    const p = await pengguna(req, badan);
    if (p.galat === 'izin') {
      return util.gagal(res, 403, 'Akun Anda belum diberi akses modul Pengajuan. Minta admin mencentangnya di Manajemen User.');
    }
    if (p.galat) {
      return util.gagal(res, 401, 'Sesi berakhir. Silakan masuk kembali lewat LAZDigital.');
    }

    const hasil = await kerja(p, d);
    return util.sukses(res, hasil || {});
  } catch (e) {
    const kode = e.kode || 500;
    if (kode >= 500) console.error('[pengajuan] ' + nama + ':', e);
    return util.gagal(res, kode, e.message || 'Terjadi kesalahan di server');
  }
}

module.exports = {
  tangani,
  T,
  MODUL,
  _uji: { aturDasar(fn) { DASAR_UJI = fn; }, pengguna }
};
