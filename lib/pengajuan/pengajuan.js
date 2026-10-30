// lib/pengajuan/pengajuan.js - aturan dan logika modul Pengajuan
'use strict';

const crypto = require('crypto');
const db = require('./db');

class GalatPengajuan extends Error {
  constructor(pesan, kode = 400) {
    super(pesan);
    this.name = 'GalatPengajuan';
    this.kode = kode;
  }
}

const NAMA_HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const STATUS_DAFTAR = [
  'Masuk',
  'Diproses',
  'Disetujui',
  'Ditasyarufkan',
  'Ditolak'
];

const JENIS_BANTUAN_DAFTAR = [
  'Pendidikan',
  'Kesehatan',
  'Ekonomi & Pemberdayaan',
  'Sosial Kemanusiaan',
  'Dakwah & Advokasi',
  'Lingkungan',
  'Zakat Mal',
  'Infak Terikat',
  'Infak Umum'
];

const ASESMEN_DAFTAR = [
  'Belum Diasesmen',
  'Belum Layak',
  'Layak',
  'Sangat Layak'
];

const MAKS_BERKAS = 5 * 1024 * 1024; // 5 MB

const MIME_BOLEH = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function sekarangWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString();
}

function hariIniWIB() {
  return sekarangWIB().slice(0, 10);
}

function hariDariTanggal(tglStr) {
  if (!tglStr) return '';
  const str = String(tglStr).trim();
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return NAMA_HARI[d.getDay()] || '';
}

function bersihkanTeks(val, maks = 500) {
  return String(val == null ? '' : val)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maks);
}

function angka(val) {
  const n = Number(String(val == null ? 0 : val).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function idBaru() {
  return 'pj_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function validasiTanggal(tglStr, label = 'Tanggal') {
  if (!tglStr) return '';
  const m = String(tglStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new GalatPengajuan(`${label} harus berformat YYYY-MM-DD.`);
  const thn = Number(m[1]), bln = Number(m[2]), hr = Number(m[3]);
  if (bln < 1 || bln > 12 || hr < 1 || hr > 31) {
    throw new GalatPengajuan(`${label} tidak valid.`);
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalisasi(d, oleh = {}, aksi = 'buat') {
  const pemohon = bersihkanTeks(d.pemohon, 150);
  if (!pemohon) throw new GalatPengajuan('Nama pemohon wajib diisi.');

  const tanggal = validasiTanggal(d.tanggal || hariIniWIB(), 'Tanggal pengajuan');
  const hari = hariDariTanggal(tanggal);

  const alamat = bersihkanTeks(d.alamat, 300);
  if (!alamat) throw new GalatPengajuan('Alamat pemohon wajib diisi.');

  const keperluan = bersihkanTeks(d.keperluan, 500);
  if (!keperluan) throw new GalatPengajuan('Keperluan permohonan wajib diisi.');

  const telepon = bersihkanTeks(d.telepon, 40);

  let status = bersihkanTeks(d.status, 50) || 'Masuk';
  if (!STATUS_DAFTAR.includes(status)) {
    status = 'Masuk';
  }

  let jenisBantuan = bersihkanTeks(d.jenisBantuan, 80) || 'Sosial Kemanusiaan';

  let hasilAsesmen = bersihkanTeks(d.hasilAsesmen, 80) || 'Belum Diasesmen';

  let tanggalPentasyarufan = '';
  if (d.tanggalPentasyarufan) {
    tanggalPentasyarufan = validasiTanggal(d.tanggalPentasyarufan, 'Tanggal pentasyarufan');
  }

  const nominalDiajukan = Math.max(0, angka(d.nominalDiajukan));
  const nominalDisetujui = Math.max(0, angka(d.nominalDisetujui));
  const catatan = bersihkanTeks(d.catatan, 1000);

  const res = {
    tanggal,
    hari,
    pemohon,
    telepon,
    alamat,
    keperluan,
    hasilAsesmen,
    status,
    tanggalPentasyarufan,
    jenisBantuan,
    nominalDiajukan,
    nominalDisetujui,
    catatan,
    diubah: sekarangWIB(),
  };

  if (aksi === 'buat') {
    res.id = idBaru();
    res.dibuat = sekarangWIB();
    res.olehId = oleh.id || '';
    res.olehNama = oleh.nama || '';
    res.proposal = null;
  }

  return res;
}

async function simpan(r) {
  await db.simpan('item:' + r.id, r);
  await db.tambahKeHimpunan('daftar', r.id);
  return r;
}

async function ambil(id) {
  if (!id) return null;
  return db.ambil('item:' + id);
}

async function semua() {
  const ids = await db.anggotaHimpunan('daftar');
  if (!ids.length) return [];
  const list = await Promise.all(ids.map((id) => db.ambil('item:' + id)));
  return list
    .filter(Boolean)
    .sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')) || String(b.dibuat || '').localeCompare(String(a.dibuat || '')));
}

async function buat(data, oleh, drive) {
  const r = normalisasi(data, oleh, 'buat');
  if (data.berkasProposal && data.berkasProposal.isi) {
    r.proposal = await prosesUnggahProposal(r, data.berkasProposal, oleh, drive);
  }
  return simpan(r);
}

async function ubah(id, data, oleh, drive) {
  const lama = await ambil(id);
  if (!lama) throw new GalatPengajuan('Data pengajuan tidak ditemukan.', 404);

  const baru = normalisasi(data, oleh, 'ubah');
  const gabung = Object.assign({}, lama, baru);

  if (data.berkasProposal && data.berkasProposal.isi) {
    if (lama.proposal) {
      await hapusBerkasProposal(lama.proposal, drive);
    }
    gabung.proposal = await prosesUnggahProposal(gabung, data.berkasProposal, oleh, drive);
  }

  return simpan(gabung);
}

async function hapus(id, drive) {
  const r = await ambil(id);
  if (!r) throw new GalatPengajuan('Data pengajuan tidak ditemukan.', 404);

  if (r.proposal) {
    await hapusBerkasProposal(r.proposal, drive);
  }

  await db.hapus('item:' + id);
  await db.keluarDariHimpunan('daftar', id);
  return true;
}

// ------------------------------------------------------------------
// PROPOSAL & GOOGLE DRIVE INTEGRATION
// ------------------------------------------------------------------
function cocokIsiBerkas(buf, mime) {
  const awal = buf.slice(0, 8);
  if (mime === 'application/pdf') return awal.slice(0, 5).toString('latin1') === '%PDF-';
  if (mime === 'image/jpeg') return awal[0] === 0xff && awal[1] === 0xd8;
  if (mime === 'image/png') return awal.slice(0, 4).toString('latin1') === '\x89PNG';
  if (mime === 'image/webp') return awal.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  if (/openxmlformats/.test(mime)) return awal[0] === 0x50 && awal[1] === 0x4b;
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel') return awal[0] === 0xd0 && awal[1] === 0xcf;
  return true; // toleran untuk variasi biner lokal
}

async function prosesUnggahProposal(pengajuan, berkas, oleh, drive) {
  const namaAsli = bersihkanTeks(berkas.nama || 'proposal', 120);
  const mime = String(berkas.mime || '').toLowerCase();
  if (mime && !MIME_BOLEH[mime]) {
    throw new GalatPengajuan('Format berkas tidak didukung. Harap gunakan PDF, Word, Excel, JPG, atau PNG.');
  }

  const buf = Buffer.from(String(berkas.isi || ''), 'base64');
  if (!buf.length) throw new GalatPengajuan('Isi berkas proposal kosong.');
  if (buf.length > MAKS_BERKAS) {
    throw new GalatPengajuan(`Ukuran berkas (${(buf.length / 1048576).toFixed(1)} MB) melebihi batas 5 MB.`, 413);
  }

  if (mime && !cocokIsiBerkas(buf, mime)) {
    throw new GalatPengajuan('Isi berkas tidak sesuai dengan jenis format yang dipilih.');
  }

  const propId = 'prop_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  const prop = {
    id: propId,
    nama: namaAsli,
    mime: mime || 'application/octet-stream',
    ukuran: buf.length,
    diunggah: sekarangWIB(),
    olehNama: oleh.nama || '',
  };

  if (drive && drive.driveSiapSurat && drive.driveSiapSurat()) {
    const folder = drive.folderSurat();
    const judulDrive = `Proposal ${pengajuan.pemohon.replace(/[/\\?%*:|"<>]/g, ' ')} - ${namaAsli}`;
    const f = await drive.unggahBiner(judulDrive, buf, prop.mime, folder);
    prop.simpan = 'drive';
    prop.driveId = f.id;
    prop.url = `https://drive.google.com/file/d/${f.id}/view`;
  } else {
    await db.simpan('berkas_prop:' + propId, { mime: prop.mime, isi: buf.toString('base64') });
    prop.simpan = 'db';
  }

  return prop;
}

async function hapusBerkasProposal(prop, drive) {
  if (!prop) return;
  if (prop.simpan === 'db' && prop.id) {
    await db.hapus('berkas_prop:' + prop.id);
  } else if (prop.simpan === 'drive' && prop.driveId && drive && drive.driveSiapSurat && drive.driveSiapSurat()) {
    try { await drive.hapus(prop.driveId); } catch (_) { /* abaikan jika berkas sudah tidak ada di Drive */ }
  }
}

async function ambilProposal(id, drive) {
  const r = await ambil(id);
  if (!r || !r.proposal) throw new GalatPengajuan('Berkas proposal tidak ditemukan.', 404);
  const p = r.proposal;
  if (p.simpan === 'drive' && p.driveId && drive) {
    const buf = await drive.unduh(p.driveId);
    return { proposal: p, isi: buf.toString('base64') };
  }
  if (p.simpan === 'db') {
    const b = await db.ambil('berkas_prop:' + p.id);
    if (!b) throw new GalatPengajuan('Isi berkas proposal hilang dari penyimpanan.', 404);
    return { proposal: p, isi: b.isi };
  }
  return { proposal: p, isi: '' };
}

// ------------------------------------------------------------------
// REKAPAN DAN KALENDER
// ------------------------------------------------------------------
function rekapan(daftar) {
  const list = Array.isArray(daftar) ? daftar : [];

  let totalPengajuan = list.length;
  let totalDiajukan = 0;
  let totalDisetujui = 0;

  const perStatus = {
    Masuk: 0,
    Diproses: 0,
    Disetujui: 0,
    Ditasyarufkan: 0,
    Ditolak: 0
  };

  const perJenis = {};
  JENIS_BANTUAN_DAFTAR.forEach((j) => { perJenis[j] = 0; });

  const perAsesmen = {
    'Sangat Layak': 0,
    'Layak': 0,
    'Belum Layak': 0,
    'Belum Diasesmen': 0
  };

  list.forEach((r) => {
    totalDiajukan += Number(r.nominalDiajukan) || 0;
    totalDisetujui += Number(r.nominalDisetujui) || 0;

    const st = r.status || 'Masuk';
    perStatus[st] = (perStatus[st] || 0) + 1;

    const jb = r.jenisBantuan || 'Lainnya';
    perJenis[jb] = (perJenis[jb] || 0) + 1;

    const as = r.hasilAsesmen || 'Belum Diasesmen';
    if (/sangat layak/i.test(as)) perAsesmen['Sangat Layak']++;
    else if (/belum layak/i.test(as)) perAsesmen['Belum Layak']++;
    else if (/layak/i.test(as)) perAsesmen['Layak']++;
    else perAsesmen['Belum Diasesmen']++;
  });

  return {
    totalPengajuan,
    totalDiajukan,
    totalDisetujui,
    perStatus,
    perJenis,
    perAsesmen,
  };
}

async function kalender(tahunBulan, daftar) {
  const items = daftar || await semua();
  const tb = String(tahunBulan || hariIniWIB().slice(0, 7)); // 'YYYY-MM'

  const perHari = {};

  items.forEach((r) => {
    // Tanggal pengajuan masuk
    if (r.tanggal && r.tanggal.startsWith(tb)) {
      if (!perHari[r.tanggal]) {
        perHari[r.tanggal] = { tanggal: r.tanggal, hari: r.hari, masuk: [], salur: [] };
      }
      perHari[r.tanggal].masuk.push({
        id: r.id,
        pemohon: r.pemohon,
        keperluan: r.keperluan,
        status: r.status,
        jenisBantuan: r.jenisBantuan,
        hasilAsesmen: r.hasilAsesmen,
        nominalDiajukan: r.nominalDiajukan,
        proposal: !!r.proposal
      });
    }

    // Tanggal pentasyarufan
    if (r.tanggalPentasyarufan && r.tanggalPentasyarufan.startsWith(tb)) {
      const tglSalur = r.tanggalPentasyarufan;
      if (!perHari[tglSalur]) {
        perHari[tglSalur] = { tanggal: tglSalur, hari: hariDariTanggal(tglSalur), masuk: [], salur: [] };
      }
      perHari[tglSalur].salur.push({
        id: r.id,
        pemohon: r.pemohon,
        keperluan: r.keperluan,
        status: r.status,
        jenisBantuan: r.jenisBantuan,
        nominalDisetujui: r.nominalDisetujui,
        proposal: !!r.proposal
      });
    }
  });

  return {
    tahunBulan: tb,
    agenda: perHari
  };
}

module.exports = {
  GalatPengajuan,
  STATUS_DAFTAR,
  JENIS_BANTUAN_DAFTAR,
  ASESMEN_DAFTAR,
  hariDariTanggal,
  buat,
  ambil,
  semua,
  ubah,
  hapus,
  rekapan,
  kalender,
  ambilProposal,
  prosesUnggahProposal,
  hapusBerkasProposal
};
