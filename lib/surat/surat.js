// lib/surat/surat.js - aturan modul Surat & Pengajuan
//
// Pemilik (2 Oktober 2026): "fitur untuk surat masuk serta pengajuan bantuan,
// sponsorship atau proposal, untuk mempermudah pencatatan keluar masuknya,
// dan ada detail progresnya dari diterima, diproses, asesmen, disetujui".
//
// Satu catatan = satu surat atau satu pengajuan. Lampiran disimpan di kunci
// tersendiri (berkas:<id>), bukan di dalam catatannya: daftar surat dibaca
// sekaligus ratusan, dan kalau isi PDF ikut terbawa, membuka daftar berarti
// mengunduh puluhan megabita yang tidak dilihat siapa pun.
//
// Yang ditegakkan di sini, bukan di layar:
//   - urutan langkah (tidak bisa melompat dari Diterima ke Dicairkan),
//   - data wajib tiap langkah (nominal disetujui, alasan penolakan, dst.),
//   - batas ukuran dan jenis lampiran, dan kuota ruang lampiran.
'use strict';
const crypto = require('crypto');
const db = require('./db');

class GalatSurat extends Error {
  constructor(pesan, kode) { super(pesan); this.kode = kode || 400; }
}

const JENIS = {
  masuk: { label: 'Surat Masuk', kode: 'SM', alur: 'surat' },
  keluar: { label: 'Surat Keluar', kode: 'SK', alur: 'keluar' },
  bantuan: { label: 'Pengajuan Bantuan', kode: 'PB', alur: 'pengajuan' },
  sponsorship: { label: 'Sponsorship', kode: 'SP', alur: 'pengajuan' },
  proposal: { label: 'Proposal', kode: 'PR', alur: 'pengajuan' },
};
const ALUR = {
  surat: ['diterima', 'disposisi', 'tindaklanjut', 'selesai'],
  keluar: ['draf', 'dikirim', 'selesai'],
  pengajuan: ['diterima', 'diproses', 'asesmen', 'disetujui', 'dicairkan', 'selesai'],
};
const LABEL_STATUS = {
  diterima: 'Diterima', disposisi: 'Didisposisi', tindaklanjut: 'Ditindaklanjuti', selesai: 'Selesai',
  draf: 'Draf', dikirim: 'Dikirim', diproses: 'Diproses', asesmen: 'Asesmen', disetujui: 'Disetujui',
  dicairkan: 'Dicairkan', ditolak: 'Ditolak',
};
/* Penolakan hanya mungkin sebelum ada keputusan. Sesudah disetujui, yang
   terjadi adalah pembatalan pencairan, dan itu urusan pembukuan, bukan
   modul surat. */
const BOLEH_TOLAK = ['diterima', 'diproses', 'asesmen'];
const SIFAT = ['biasa', 'segera', 'penting', 'rahasia'];
const INSTRUKSI = ['Tindak lanjuti', 'Pelajari dan laporkan', 'Hadiri', 'Koordinasikan', 'Siapkan jawaban', 'Arsipkan'];

/* BATAS LAMPIRAN. Vercel menolak kiriman di atas 4,5 MB per permintaan, dan
   base64 membesarkan berkas sepertiga: 2 MB jadi 2,7 MB, masih ada ruang
   untuk sisa JSON-nya. Foto dikompres di peramban sebelum dikirim, jadi
   batas ini hampir hanya mengenai PDF. Kuota keseluruhan menjaga Supabase
   gratis (500 MB) tidak habis oleh lampiran: buku besar, cadangan, dan modul
   lain juga tinggal di sana. */
const MAKS_BERKAS = 2 * 1024 * 1024;
const MAKS_LAMPIRAN = 6;
const KUOTA = Number(process.env.SURAT_KUOTA_MB || 200) * 1024 * 1024;
const MIME_BOLEH = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
};

function hariIni() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function sekarang() { return new Date().toISOString(); }
function idBaru(awalan) { return awalan + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function teks(v, maks) { return String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maks || 300); }
function tanggal(v) { const t = teks(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; }
/* Rupiah tanpa pecahan. Titik dan koma dibuang semua: "2.500.000" yang
   dibaca sebagai bilangan desimal menjadi 2,5 rupiah, bukan dua setengah juta. */
function nominal(v) { if (typeof v === 'number') return v > 0 ? Math.round(v) : 0; const n = Number(String(v === null || v === undefined ? '' : v).replace(/[^\d]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; }
const ROMAWI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function alurDari(jenis) { return ALUR[(JENIS[jenis] || {}).alur] || ALUR.surat; }
function pengajuan(jenis) { return (JENIS[jenis] || {}).alur === 'pengajuan'; }

/* Kode lacak tanpa huruf yang mudah tertukar (0/O, 1/I/L). Dibacakan lewat
   telepon dan diketik ulang pemohon, jadi enam huruf yang jelas lebih
   berguna daripada sepuluh yang membingungkan. */
function kodeLacak() {
  const abjad = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(6);
  let k = '';
  for (let i = 0; i < 6; i++) k += abjad[b[i] % abjad.length];
  return k;
}

async function nomorAgenda(jenis, tgl) {
  const j = JENIS[jenis];
  const t = tgl || hariIni();
  const urut = await db.naikkan('nomor:' + j.kode + ':' + t.slice(0, 4));
  return String(urut).padStart(3, '0') + '/' + j.kode + '/' + ROMAWI[Number(t.slice(5, 7))] + '/' + t.slice(0, 4);
}

function isian(data, lama) {
  const r = Object.assign({}, lama || {});
  const ambil = (k, maks) => { if (data[k] !== undefined) r[k] = teks(data[k], maks); };
  ambil('perihal', 200); ambil('pengirim', 160); ambil('tujuan', 160); ambil('kontak', 80);
  ambil('nomorSurat', 80); ambil('ringkasan', 3000); ambil('kategori', 80); ambil('alamat', 300);
  if (data.tanggalSurat !== undefined) r.tanggalSurat = tanggal(data.tanggalSurat);
  if (data.tanggalTerima !== undefined) r.tanggalTerima = tanggal(data.tanggalTerima);
  if (data.tenggat !== undefined) r.tenggat = tanggal(data.tenggat);
  if (data.sifat !== undefined) r.sifat = SIFAT.includes(data.sifat) ? data.sifat : 'biasa';
  if (data.nominalDiajukan !== undefined) r.nominalDiajukan = nominal(data.nominalDiajukan);
  if (data.balasanDari !== undefined) r.balasanDari = teks(data.balasanDari, 60);
  return r;
}

async function buat(data, oleh) {
  const jenis = String(data.jenis || '');
  if (!JENIS[jenis]) throw new GalatSurat('Jenis surat tidak dikenal.');
  const r = isian(data, {});
  if (!r.perihal) throw new GalatSurat('Perihal wajib diisi.');
  if (jenis === 'keluar' ? !r.tujuan : !r.pengirim) throw new GalatSurat(jenis === 'keluar' ? 'Tujuan surat wajib diisi.' : 'Pengirim atau pemohon wajib diisi.');
  if (!r.tanggalTerima) r.tanggalTerima = hariIni();
  const awal = alurDari(jenis)[0];
  const rec = Object.assign(r, {
    id: idBaru('s'),
    jenis,
    nomor: await nomorAgenda(jenis, r.tanggalTerima),
    status: awal,
    riwayat: [{ status: awal, waktu: sekarang(), olehId: oleh.id, olehNama: oleh.nama, catatan: teks(data.catatan, 500) }],
    disposisi: [],
    lampiran: [],
    dibuat: sekarang(), olehId: oleh.id, olehNama: oleh.nama, diubah: sekarang(),
  });
  if (!rec.sifat) rec.sifat = 'biasa';
  /* Semua jenis dapat kode lacak (surat masuk/keluar juga), kecuali yang bersifat rahasia: itu tidak boleh punya tautan publik. */
  if (rec.sifat !== 'rahasia') rec.kodeLacak = kodeLacak();
  await db.simpan('item:' + rec.id, rec);
  await db.tambahKeHimpunan('indeks', rec.id);
  return rec;
}

async function ambil(id) {
  const r = await db.ambil('item:' + teks(id, 80));
  if (!r) throw new GalatSurat('Surat tidak ditemukan.', 404);
  return r;
}
async function semua() {
  const ids = await db.anggotaHimpunan('indeks');
  const isi = await db.ambilBanyak(ids.map((i) => 'item:' + i));
  return isi.filter(Boolean).sort((a, b) => String(b.tanggalTerima || '').localeCompare(String(a.tanggalTerima || '')) || String(b.dibuat).localeCompare(String(a.dibuat)));
}
async function simpanUbah(r) { r.diubah = sekarang(); await db.simpan('item:' + r.id, r); return r; }

async function ubah(id, data) {
  const r = await ambil(id);
  const baru = isian(data, r);
  if (!baru.perihal) throw new GalatSurat('Perihal wajib diisi.');
  if (baru.sifat === 'rahasia') delete baru.kodeLacak;
  return simpanUbah(baru);
}

/* PINDAH LANGKAH. Maju satu langkah, mundur satu langkah (wajib alasan),
   atau ditolak (pengajuan, sebelum ada keputusan). Data yang dibutuhkan
   langkah tujuan diperiksa di sini, supaya papan kanban yang digeser asal
   tidak bisa melahirkan pengajuan "disetujui" tanpa nominal. */
async function pindah(id, ke, data, oleh) {
  const r = await ambil(id);
  const alur = alurDari(r.jenis);
  const kini = alur.indexOf(r.status);
  const catatan = teks(data.catatan, 1000);
  ke = String(ke || '');
  if (ke === r.status) return r;
  if (ke === 'ditolak') {
    if (!pengajuan(r.jenis)) throw new GalatSurat('Hanya pengajuan yang bisa ditolak.');
    if (!BOLEH_TOLAK.includes(r.status)) throw new GalatSurat('Pengajuan yang sudah ' + LABEL_STATUS[r.status].toLowerCase() + ' tidak bisa ditolak lagi.');
    if (!catatan) throw new GalatSurat('Tulis alasan penolakan.');
    r.alasanTolak = catatan;
  } else {
    const tuju = alur.indexOf(ke);
    if (tuju < 0) throw new GalatSurat('Langkah "' + ke + '" tidak ada di alur ' + JENIS[r.jenis].label + '.');
    if (r.status === 'ditolak') {
      /* Membuka kembali pengajuan yang ditolak: kembali ke Diproses. */
      if (ke !== 'diproses') throw new GalatSurat('Pengajuan yang ditolak hanya bisa dibuka kembali ke Diproses.');
      if (!catatan) throw new GalatSurat('Tulis alasan membuka kembali.');
      r.alasanTolak = '';
    } else if (tuju === kini - 1) {
      if (!catatan) throw new GalatSurat('Tulis alasan mengembalikan ke ' + LABEL_STATUS[ke] + '.');
    } else if (tuju !== kini + 1) {
      throw new GalatSurat('Dari ' + LABEL_STATUS[r.status] + ' hanya bisa lanjut ke ' + (LABEL_STATUS[alur[kini + 1]] || '-') + '.');
    } else {
      /* Syarat maju. */
      if (ke === 'disetujui') {
        const n = nominal(data.nominalDisetujui);
        if (r.jenis !== 'proposal' && !n) throw new GalatSurat('Isi nominal yang disetujui.');
        r.nominalDisetujui = n;
      }
      if (ke === 'dicairkan') {
        const n = nominal(data.nominalCair) || r.nominalDisetujui || 0;
        if (!n) throw new GalatSurat('Isi nominal yang dicairkan.');
        if (r.nominalDisetujui && n > r.nominalDisetujui) throw new GalatSurat('Nominal cair melebihi yang disetujui (' + r.nominalDisetujui.toLocaleString('id-ID') + ').');
        r.nominalCair = n;
        r.tanggalCair = tanggal(data.tanggalCair) || hariIni();
      }
      if (ke === 'dikirim') r.tanggalKirim = tanggal(data.tanggalKirim) || hariIni();
    }
  }
  r.riwayat.push({ status: ke, dari: r.status, waktu: sekarang(), olehId: oleh.id, olehNama: oleh.nama, catatan });
  r.status = ke;
  return simpanUbah(r);
}

async function asesmen(id, data, oleh) {
  const r = await ambil(id);
  if (!pengajuan(r.jenis)) throw new GalatSurat('Asesmen hanya untuk pengajuan.');
  if (r.status !== 'asesmen') throw new GalatSurat('Pindahkan pengajuan ke langkah Asesmen lebih dulu.');
  const hasil = ['layak', 'tidak'].includes(data.hasil) ? data.hasil : '';
  if (!hasil) throw new GalatSurat('Pilih hasil asesmen: layak atau tidak layak.');
  r.asesmen = {
    tanggal: tanggal(data.tanggal) || hariIni(), petugas: teks(data.petugas, 120) || oleh.nama, hasil,
    rekomendasi: nominal(data.rekomendasi), catatan: teks(data.catatan, 2000), olehNama: oleh.nama, waktu: sekarang(),
  };
  return simpanUbah(r);
}

/* DISPOSISI. Surat masuk yang didisposisikan pertama kali ikut berpindah ke
   langkah Didisposisi, karena itulah arti langkah itu. */
async function disposisi(id, data, oleh, akun) {
  const r = await ambil(id);
  const peta = new Map((akun || []).map((a) => [a.id, a]));
  const kepada = [...new Set((Array.isArray(data.kepada) ? data.kepada : []).map(String))].filter((k) => peta.has(k)).map((k) => ({ id: k, nama: peta.get(k).nama }));
  if (!kepada.length) throw new GalatSurat('Pilih minimal satu penerima disposisi.');
  const instruksi = (Array.isArray(data.instruksi) ? data.instruksi : []).map((x) => teks(x, 60)).filter((x) => INSTRUKSI.includes(x));
  const d = {
    id: idBaru('d'), dariId: oleh.id, dariNama: oleh.nama, kepada, instruksi, catatan: teks(data.catatan, 1000),
    batas: tanggal(data.batas), waktu: sekarang(), status: 'baru', dibaca: {},
  };
  if (!instruksi.length && !d.catatan) throw new GalatSurat('Pilih instruksi atau tulis catatan disposisi.');
  r.disposisi.push(d);
  if (r.jenis === 'masuk' && r.status === 'diterima') {
    r.riwayat.push({ status: 'disposisi', dari: 'diterima', waktu: sekarang(), olehId: oleh.id, olehNama: oleh.nama, catatan: 'Disposisi ke ' + kepada.map((k) => k.nama).join(', ') });
    r.status = 'disposisi';
  }
  return simpanUbah(r);
}

async function disposisiSelesai(id, did, data, oleh, bolehSemua) {
  const r = await ambil(id);
  const d = (r.disposisi || []).find((x) => x.id === did);
  if (!d) throw new GalatSurat('Disposisi tidak ditemukan.', 404);
  if (!bolehSemua && !d.kepada.some((k) => k.id === oleh.id)) throw new GalatSurat('Disposisi ini bukan untuk Anda.', 403);
  d.status = 'selesai'; d.selesaiOleh = oleh.nama; d.selesaiWaktu = sekarang(); d.balasan = teks(data.balasan, 1000);
  return simpanUbah(r);
}
async function disposisiDibaca(id, oleh) {
  const r = await ambil(id);
  let ubahan = false;
  (r.disposisi || []).forEach((d) => { if (d.kepada.some((k) => k.id === oleh.id) && !d.dibaca[oleh.id]) { d.dibaca[oleh.id] = sekarang(); ubahan = true; } });
  return ubahan ? simpanUbah(r) : r;
}

// ---------------------------------------------------------------- lampiran
/* Jenis berkas dibaca dari isinya, bukan dari nama atau label yang dikirim
   peramban: berkas .exe yang diganti nama jadi .pdf tetap ditolak. */
function cocokIsi(buf, mime) {
  const awal = buf.slice(0, 8);
  if (mime === 'application/pdf') return awal.slice(0, 5).toString('latin1') === '%PDF-';
  if (mime === 'image/jpeg') return awal[0] === 0xff && awal[1] === 0xd8;
  if (mime === 'image/png') return awal.slice(0, 4).toString('latin1') === '\x89PNG';
  if (mime === 'image/webp') return awal.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  if (/openxmlformats/.test(mime)) return awal[0] === 0x50 && awal[1] === 0x4b;
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel') return awal[0] === 0xd0 && awal[1] === 0xcf;
  return false;
}
async function pakaiRuang() {
  const isi = await semua();
  let n = 0;
  isi.forEach((r) => (r.lampiran || []).forEach((l) => { if (l.simpan === 'db') n += Number(l.ukuran) || 0; }));
  return n;
}
async function tambahLampiran(id, data, oleh, drive) {
  const r = await ambil(id);
  if ((r.lampiran || []).length >= MAKS_LAMPIRAN) throw new GalatSurat('Satu surat paling banyak ' + MAKS_LAMPIRAN + ' lampiran.');
  const nama = teks(data.nama, 120) || 'lampiran';
  const l = { id: idBaru('l'), nama, oleh: oleh.nama, waktu: sekarang() };
  if (data.tautan) {
    const u = teks(data.tautan, 600);
    if (!/^https:\/\/[^\s]+$/i.test(u)) throw new GalatSurat('Tautan harus diawali https://');
    Object.assign(l, { simpan: 'tautan', url: u, mime: '', ukuran: 0 });
  } else {
    const mime = String(data.mime || '');
    if (!MIME_BOLEH[mime]) throw new GalatSurat('Jenis berkas tidak didukung. Pakai PDF, JPG, PNG, WEBP, Word, atau Excel.');
    const buf = Buffer.from(String(data.isi || ''), 'base64');
    if (!buf.length) throw new GalatSurat('Berkasnya kosong.');
    if (buf.length > MAKS_BERKAS) throw new GalatSurat('Berkas ' + (buf.length / 1048576).toFixed(1).replace('.', ',') + ' MB melebihi batas 2 MB. Kompres dulu, atau simpan sebagai tautan Google Drive.', 413);
    if (!cocokIsi(buf, mime)) throw new GalatSurat('Isi berkas tidak sesuai jenisnya (' + MIME_BOLEH[mime].toUpperCase() + ').');
    Object.assign(l, { mime, ukuran: buf.length, ukuranAsli: Number(data.ukuranAsli) || buf.length });
    if (drive && drive.driveSiap && drive.driveSiap()) {
      const f = await drive.unggahBiner(r.nomor.replace(/\//g, '-') + ' ' + nama, buf, mime);
      Object.assign(l, { simpan: 'drive', driveId: f.id });
    } else {
      const pakai = await pakaiRuang();
      if (pakai + buf.length > KUOTA) throw new GalatSurat('Ruang lampiran penuh (' + Math.round(pakai / 1048576) + ' dari ' + Math.round(KUOTA / 1048576) + ' MB). Simpan sebagai tautan Google Drive, atau hapus lampiran lama.', 507);
      await db.simpan('berkas:' + l.id, { mime, isi: buf.toString('base64') });
      l.simpan = 'db';
    }
  }
  r.lampiran.push(l);
  return simpanUbah(r);
}
async function ambilLampiran(id, lid, drive) {
  const r = await ambil(id);
  const l = (r.lampiran || []).find((x) => x.id === lid);
  if (!l) throw new GalatSurat('Lampiran tidak ditemukan.', 404);
  if (l.simpan === 'tautan') return { lampiran: l };
  if (l.simpan === 'drive') {
    const buf = await drive.unduh(l.driveId);
    return { lampiran: l, isi: buf.toString('base64') };
  }
  const b = await db.ambil('berkas:' + l.id);
  if (!b) throw new GalatSurat('Isi lampiran hilang dari penyimpanan.', 404);
  return { lampiran: l, isi: b.isi };
}
async function hapusLampiran(id, lid, drive) {
  const r = await ambil(id);
  const l = (r.lampiran || []).find((x) => x.id === lid);
  if (!l) throw new GalatSurat('Lampiran tidak ditemukan.', 404);
  if (l.simpan === 'db') await db.hapus('berkas:' + l.id);
  if (l.simpan === 'drive' && drive && drive.driveSiap()) { try { await drive.hapus(l.driveId); } catch (_) { /* tetap dilepas dari surat */ } }
  r.lampiran = r.lampiran.filter((x) => x.id !== lid);
  return simpanUbah(r);
}
async function hapus(id, drive) {
  const r = await ambil(id);
  for (const l of r.lampiran || []) {
    if (l.simpan === 'db') await db.hapus('berkas:' + l.id);
    if (l.simpan === 'drive' && drive && drive.driveSiap()) { try { await drive.hapus(l.driveId); } catch (_) { /* abaikan */ } }
  }
  await db.hapus('item:' + r.id);
  await db.keluarDariHimpunan('indeks', r.id);
}

// ---------------------------------------------------------------- tampilan
function telat(r, kini) {
  if (['selesai', 'ditolak', 'dicairkan'].includes(r.status)) return false;
  if (r.tenggat && r.tenggat < kini) return true;
  return (r.disposisi || []).some((d) => d.status !== 'selesai' && d.batas && d.batas < kini);
}
function untukSaya(r, uid) {
  return (r.disposisi || []).filter((d) => d.status !== 'selesai' && d.kepada.some((k) => k.id === uid));
}
/* Bentuk ringkas untuk daftar dan papan: tanpa riwayat lengkap dan tanpa
   isi disposisi, cukup yang perlu digambar. */
function ringkas(r, uid, kini) {
  const alur = alurDari(r.jenis);
  return {
    id: r.id, nomor: r.nomor, jenis: r.jenis, jenisLabel: JENIS[r.jenis].label, perihal: r.perihal,
    pengirim: r.pengirim || '', tujuan: r.tujuan || '', tanggalTerima: r.tanggalTerima, tenggat: r.tenggat || '',
    sifat: r.sifat || 'biasa', status: r.status, statusLabel: LABEL_STATUS[r.status] || r.status,
    langkahKe: r.status === 'ditolak' ? -1 : alur.indexOf(r.status), jumlahLangkah: alur.length,
    nominalDiajukan: r.nominalDiajukan || 0, nominalDisetujui: r.nominalDisetujui || 0, nominalCair: r.nominalCair || 0,
    kategori: r.kategori || '', jumlahLampiran: (r.lampiran || []).length, jumlahDisposisi: (r.disposisi || []).length,
    disposisiSaya: untukSaya(r, uid).length, telat: telat(r, kini), diubah: r.diubah,
  };
}
function ringkasan(isi, uid, kini) {
  const bulan = kini.slice(0, 7), tahun = kini.slice(0, 4);
  const o = { masukBulan: 0, keluarBulan: 0, pengajuanAktif: 0, disposisiSaya: 0, telat: 0, perStatus: {},
    disetujuiTahun: 0, dicairkanTahun: 0, diajukanTahun: 0, ditolakTahun: 0, perJenis: {} };
  isi.forEach((r) => {
    const tgl = String(r.tanggalTerima || '');
    if (r.jenis === 'masuk' && tgl.slice(0, 7) === bulan) o.masukBulan++;
    if (r.jenis === 'keluar' && tgl.slice(0, 7) === bulan) o.keluarBulan++;
    if (pengajuan(r.jenis)) {
      if (!['selesai', 'ditolak'].includes(r.status)) o.pengajuanAktif++;
      o.perStatus[r.status] = (o.perStatus[r.status] || 0) + 1;
      if (tgl.slice(0, 4) === tahun) {
        o.diajukanTahun += r.nominalDiajukan || 0;
        if (r.nominalDisetujui && !['ditolak'].includes(r.status)) o.disetujuiTahun += r.nominalDisetujui;
        o.dicairkanTahun += r.nominalCair || 0;
        if (r.status === 'ditolak') o.ditolakTahun++;
      }
    }
    o.perJenis[r.jenis] = (o.perJenis[r.jenis] || 0) + 1;
    o.disposisiSaya += untukSaya(r, uid).length;
    if (telat(r, kini)) o.telat++;
  });
  return o;
}

/* Lacak untuk pemohon dari luar: hanya langkah dan tanggalnya. Catatan
   internal, nama petugas, nominal asesmen, dan disposisi tidak pernah ikut. */
async function lacak(nomor, kode) {
  const n = teks(nomor, 40).toUpperCase().replace(/\s+/g, '');
  const k = teks(kode, 10).toUpperCase().replace(/\s+/g, '');
  if (!n || !k) throw new GalatSurat('Isi nomor dan kode lacak.');
  const r = (await semua()).find((x) => x.sifat !== 'rahasia' && String(x.nomor).toUpperCase() === n && x.kodeLacak === k);
  if (!r) throw new GalatSurat('Data tidak ditemukan. Periksa lagi nomor dan kodenya.', 404);
  const alur = alurDari(r.jenis);
  const waktuLangkah = {};
  (r.riwayat || []).forEach((h) => { waktuLangkah[h.status] = h.waktu; });
  const kini = r.status === 'ditolak' ? -1 : alur.indexOf(r.status);
  return {
    nomor: r.nomor, jenis: r.jenis, jenisLabel: JENIS[r.jenis].label, perihal: r.perihal, tanggalTerima: r.tanggalTerima,
    status: r.status, statusLabel: LABEL_STATUS[r.status],
    langkah: alur.map((s, i) => { const lewat = r.status === 'ditolak' ? !!waktuLangkah[s] : kini >= i; return { status: s, label: LABEL_STATUS[s], waktu: lewat ? (waktuLangkah[s] || '') : '', selesai: lewat }; }),
    ditolak: r.status === 'ditolak', waktuTolak: r.status === 'ditolak' ? waktuLangkah.ditolak : '',
  };
}

/* Surat lama dibuat sebelum semua jenis punya kode lacak, dan surat yang tadinya rahasia lalu dibuka sifatnya juga
   belum punya. Dipanggil saat petugas berhak membuka detailnya; surat rahasia tetap tanpa kode (dan kodenya dicabut
   kalau sifatnya diubah jadi rahasia) supaya tidak pernah punya tautan publik. */
async function pastikanKode(id) {
  const r = await ambil(id);
  if (r.sifat === 'rahasia') {
    if (r.kodeLacak) { delete r.kodeLacak; await db.simpan('item:' + r.id, r); }
    return r;
  }
  if (!r.kodeLacak) { r.kodeLacak = kodeLacak(); await db.simpan('item:' + r.id, r); }
  return r;
}

module.exports = {
  GalatSurat, JENIS, ALUR, LABEL_STATUS, SIFAT, INSTRUKSI, BOLEH_TOLAK, MAKS_BERKAS, MAKS_LAMPIRAN, KUOTA, MIME_BOLEH,
  hariIni, alurDari, pengajuan, buat, ambil, semua, ubah, pindah, asesmen, disposisi, disposisiSelesai, disposisiDibaca,
  tambahLampiran, ambilLampiran, hapusLampiran, hapus, pakaiRuang, ringkas, ringkasan, untukSaya, telat, lacak, kodeLacak, pastikanKode,
};
