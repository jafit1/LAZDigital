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
    asesmenId: bersihkanTeks(d.asesmenId, 80),
    asesmenSkor: angka(d.asesmenSkor),
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

// ------------------------------------------------------------------
// IMPOR DARI GOOGLE SPREADSHEET / EXCEL / CSV
// ------------------------------------------------------------------
function normalisasiTanggalImpor(str) {
  if (!str) return '';
  str = String(str).trim();
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const BULAN_MAP = {
    january: '01', januari: '01', jan: '01',
    february: '02', februari: '02', feb: '02',
    march: '03', maret: '03', mar: '03',
    april: '04', apr: '04',
    may: '05', mei: '05',
    june: '06', juni: '06', jun: '06',
    july: '07', juli: '07', jul: '07',
    august: '08', agustus: '08', agu: '08', agt: '08',
    september: '09', sep: '09',
    october: '10', oktober: '10', okt: '10', oct: '10',
    november: '11', nopember: '11', nov: '11',
    december: '12', desember: '12', des: '12', dec: '12'
  };
  m = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const bNama = m[2].toLowerCase();
    const mm = BULAN_MAP[bNama] || '01';
    return `${m[3]}-${mm}-${dd}`;
  }
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return str;
  return str;
}

function parseCSV(text) {
  const baris = [];
  let curRow = [];
  let curVal = '';
  let inQuote = false;
  text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuote && text[i + 1] === '"') {
        curVal += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (c === ',' && !inQuote) {
      curRow.push(curVal.trim());
      curVal = '';
    } else if (c === '\n' && !inQuote) {
      curRow.push(curVal.trim());
      curVal = '';
      if (curRow.some((x) => x !== '')) baris.push(curRow);
      curRow = [];
    } else {
      curVal += c;
    }
  }
  if (curVal || curRow.length) {
    curRow.push(curVal.trim());
    if (curRow.some((x) => x !== '')) baris.push(curRow);
  }
  return baris;
}

function ekstrakNominalTeks(teks) {
  if (!teks) return 0;
  const m = String(teks).match(/Rp\.?\s*([\d\.,]+)/i) ||
            String(teks).match(/sebesar\s+([\d\.,]+)/i) ||
            String(teks).match(/senilai\s+([\d\.,]+)/i) ||
            String(teks).match(/seharga\s+([\d\.,]+)/i);
  if (m) {
    const s = m[1].replace(/\./g, '').replace(/,/g, '');
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function tentukanKategoriBantuan(keperluan, jenisBantuanRaw) {
  const gabung = (String(keperluan || '') + ' ' + String(jenisBantuanRaw || '')).toLowerCase();
  if (gabung.includes('pendidikan') || gabung.includes('spp') || gabung.includes('sekolah') || gabung.includes('pelatihan') || gabung.includes('ipm') || gabung.includes('imm') || gabung.includes('stie') || gabung.includes('beasiswa')) {
    return 'Pendidikan';
  }
  if (gabung.includes('obat') || gabung.includes('kesehatan') || gabung.includes('operasi') || gabung.includes('sembuh') || gabung.includes('dek hamzah') || gabung.includes('persalinan') || gabung.includes('rumah sakit')) {
    return 'Kesehatan';
  }
  if (gabung.includes('usaha') || gabung.includes('modal') || gabung.includes('ekonomi') || gabung.includes('dagang')) {
    return 'Ekonomi & Pemberdayaan';
  }
  if (gabung.includes('kajian') || gabung.includes('dakwah') || gabung.includes('masjid') || gabung.includes('mushola') || gabung.includes('kramat') || gabung.includes('pengajian')) {
    return 'Dakwah & Advokasi';
  }
  if (gabung.includes('sumur') || gabung.includes('air') || gabung.includes('pipanisasi') || gabung.includes('lingkungan') || gabung.includes('toren') || gabung.includes('pompa')) {
    return 'Lingkungan';
  }
  return 'Sosial Kemanusiaan';
}

function parseBarisSpreadsheet(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  let headerIdx = -1;
  const colMap = {};

  for (let i = 0; i < matrix.length; i++) {
    const row = (matrix[i] || []).map((c) => String(c || '').toLowerCase().trim());
    if (row.includes('pemohon') && (row.includes('tanggal') || row.includes('keperluan'))) {
      headerIdx = i;
      row.forEach((colName, cIdx) => {
        colMap[colName] = cIdx;
      });
      break;
    }
  }

  if (headerIdx === -1) {
    throw new GalatPengajuan('Format kolom tidak cocok. Pastikan terdapat kolom "Pemohon", "Tanggal", dan "Keperluan".');
  }

  const hasil = [];

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const pemohon = String(row[colMap['pemohon']] || '').trim();
    if (!pemohon || pemohon.toLowerCase() === 'pemohon') continue;

    const tglRaw = row[colMap['tanggal']] || '';
    const tgl = normalisasiTanggalImpor(tglRaw) || hariIniWIB();
    const tglSalurRaw = row[colMap['tanggal pentasyarufan']] || '';
    const tglSalur = normalisasiTanggalImpor(tglSalurRaw);

    const hariRaw = row[colMap['hari']] || '';
    const hari = hariRaw || hariDariTanggal(tgl);

    const alamat = String(row[colMap['alamat']] || '').trim();
    const keperluan = String(row[colMap['keperluan']] || '').trim();
    const hasilAsesmenRaw = String(row[colMap['hasil asesment']] || row[colMap['hasil asesmen']] || '').trim();

    let hasilAsesmen = 'Belum Diasesmen';
    if (/sangat layak/i.test(hasilAsesmenRaw)) hasilAsesmen = 'Sangat Layak dibantu';
    else if (/layak/i.test(hasilAsesmenRaw)) hasilAsesmen = 'Layak dibantu';
    else if (/belum/i.test(hasilAsesmenRaw)) hasilAsesmen = 'Belum diasesmen';

    const stRaw = String(row[colMap['status']] || '').toLowerCase().trim();
    let status = 'Masuk';
    if (stRaw.includes('acc') || stRaw.includes('setuju')) status = 'Disetujui';
    else if (stRaw.includes('sudah') || stRaw.includes('cair') || stRaw.includes('tasyaruf')) status = tglSalur ? 'Ditasyarufkan' : 'Disetujui';
    else if (stRaw.includes('sedang') || stRaw.includes('proses')) status = 'Diproses';
    else if (stRaw.includes('tidak') || stRaw.includes('tolak')) status = 'Ditolak';

    const keterangan = String(row[colMap['keterangan']] || '').trim();
    const jenisBantuanRaw = String(row[colMap['jenis bantuan']] || '').trim();
    const jenisBantuan = tentukanKategoriBantuan(keperluan, jenisBantuanRaw);

    const nomSalur = ekstrakNominalTeks(jenisBantuanRaw) || ekstrakNominalTeks(keterangan);
    const nomAjuan = ekstrakNominalTeks(keperluan);

    const catatanParts = [];
    if (keterangan) catatanParts.push(keterangan);
    if (jenisBantuanRaw && (!keterangan || !keterangan.includes(jenisBantuanRaw))) {
      catatanParts.push(`Bantuan: ${jenisBantuanRaw}`);
    }

    hasil.push({
      tanggal: tgl,
      hari: hari,
      pemohon: pemohon,
      alamat: alamat || 'Alamat pemohon',
      keperluan: keperluan || 'Permohonan bantuan',
      hasilAsesmen: hasilAsesmen,
      status: status,
      tanggalPentasyarufan: tglSalur,
      jenisBantuan: jenisBantuan,
      nominalDiajukan: nomAjuan || 0,
      nominalDisetujui: nomSalur || 0,
      catatan: catatanParts.join(' | ')
    });
  }

  return hasil;
}

function ekstrakSpreadsheetId(urlStr) {
  if (!urlStr) return null;
  const m = String(urlStr).match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const sheetId = m[1];
  let gid = '0';
  const mGid = String(urlStr).match(/[#&?]gid=([0-9]+)/);
  if (mGid) gid = mGid[1];
  return { sheetId, gid };
}

async function tarikDariGoogleSpreadsheet(urlStr) {
  const info = ekstrakSpreadsheetId(urlStr);
  if (!info) {
    throw new GalatPengajuan('URL Google Spreadsheet tidak valid. Pastikan formatnya https://docs.google.com/spreadsheets/d/...');
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/export?format=csv&gid=${info.gid}`;
  const res = await fetch(exportUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LAZDigital/2.0' }
  });

  if (!res.ok) {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/gviz/tq?tqx=out:csv&gid=${info.gid}`;
    const resGviz = await fetch(gvizUrl);
    if (!resGviz.ok) {
      throw new GalatPengajuan(`Gagal mengambil data dari Google Spreadsheet (${res.status}). Pastikan spreadsheet memiliki akses "Siapa saja yang memiliki link dapat melihat".`);
    }
    const csvTeks = await resGviz.text();
    const matrix = parseCSV(csvTeks);
    return parseBarisSpreadsheet(matrix);
  }

  const csvTeks = await res.text();
  const matrix = parseCSV(csvTeks);
  return parseBarisSpreadsheet(matrix);
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
  hapusBerkasProposal,
  parseCSV,
  parseBarisSpreadsheet,
  normalisasiTanggalImpor,
  ekstrakSpreadsheetId,
  tarikDariGoogleSpreadsheet
};
