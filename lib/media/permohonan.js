/* lib/media/permohonan.js - permohonan desain, dari diajukan sampai dipakai.
 *
 * APA YANG SEBENARNYA DIGANTIKAN BERKAS INI.
 * Sebelum ada modul ini, permintaan desain hidup di grup WhatsApp: "mas tolong
 * bikin flyer untuk Jumat ya". Tiga hal hilang tiap kali, dan ketiganya baru
 * terasa saat sudah terlambat.
 *
 *   1. SIAPA YANG MEMINTA APA. Pesan tenggelam dalam dua hari. Yang tersisa
 *      cuma ingatan, dan ingatan dua orang tentang brief yang sama selalu
 *      berbeda persis pada bagian yang penting.
 *
 *   2. KAPAN DIPAKAI. "Secepatnya" berarti berbeda bagi yang meminta dan yang
 *      mengerjakan. Deadline di sini wajib diisi tanggalnya, bukan dirasakan.
 *
 *   3. SUDAH SAMPAI MANA. Pemohon bertanya lewat japri, tim media menjawab
 *      satu per satu. Yang bertanya paling berisik dilayani lebih dulu, bukan
 *      yang paling mendesak.
 *
 * TIGA ATURAN YANG MENJAGA CATATAN INI TETAP BISA DIPERCAYA.
 *
 * JEJAK HANYA BERTAMBAH, TIDAK PERNAH DIUBAH. Tiap langkah menyimpan siapa,
 * kapan, dan catatannya. Status sekarang adalah kesimpulan dari jejak, bukan
 * satu-satunya yang disimpan. Kalau hanya status yang disimpan, pertanyaan
 * "kenapa ini baru dikerjakan seminggu kemudian" tidak akan pernah ada
 * jawabannya, dan pertanyaan itu pasti datang saat rapat evaluasi.
 *
 * HASIL LAMA TIDAK DITIMPA SAAT REVISI. Tiap kiriman hasil masuk daftar
 * tersendiri. Pemohon yang minta revisi lalu berubah pikiran masih bisa
 * menunjuk versi pertama, dan tim media punya bukti bahwa yang pertama memang
 * pernah dikirim tepat waktu.
 *
 * BIDANG DIBEKUKAN SAAT DIAJUKAN. Bidang disalin dari tabel jenis pada saat
 * permohonan lahir, bukan dihitung ulang tiap kali dibaca. Kalau suatu hari
 * Flyer dipindahkan dari desain grafis ke bidang lain, permohonan lama tidak
 * ikut berpindah kotak surut. Tanpa ini, satu perubahan tabel bisa memindahkan
 * ratusan pekerjaan yang sudah selesai ke kotak masuk orang yang tidak pernah
 * mengerjakannya.
 */
'use strict';

const db = require('./db');
const { bidangUntuk, jenisSah, labelJenis } = require('./jenis');

const KUNCI = (i) => `permohonan:${i}`;
const DAFTAR = 'permohonan:daftar';
const URUT = 'permohonan:urut';

const STATUS = {
  BARU: 'baru',
  DIPROSES: 'diproses',
  SELESAI: 'selesai',
};

const LABEL_STATUS = {
  [STATUS.BARU]: 'Menunggu dikerjakan',
  [STATUS.DIPROSES]: 'Sedang dikerjakan',
  [STATUS.SELESAI]: 'Selesai',
};

const LANGKAH = {
  DIAJUKAN: 'diajukan',
  DIAMBIL: 'diambil',
  DIKIRIM: 'dikirim',
  REVISI: 'revisi',
  DIBAGI: 'dibagi',
};

const LABEL_LANGKAH = {
  [LANGKAH.DIAJUKAN]: 'Permohonan diajukan',
  [LANGKAH.DIAMBIL]: 'Mulai dikerjakan tim media',
  [LANGKAH.DIKIRIM]: 'Hasil dikirim',
  [LANGKAH.REVISI]: 'Pemohon meminta revisi',
  [LANGKAH.DIBAGI]: 'Dibagikan koordinator ke sebuah bidang',
};

function sekarang() { return new Date().toISOString(); }

function bersih(teks, maks) {
  return String(teks === null || teks === undefined ? '' : teks).trim().slice(0, maks);
}

function tanggalSah(t) {
  const s = bersih(t, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) ? s : '';
}

/* TAUTAN HASIL HARUS BENAR-BENAR GOOGLE DRIVE.
 *
 * Bukan kerewelan. Kotak isian yang menerima apa saja akan menerima apa saja:
 * tautan WhatsApp Web yang cuma hidup di browser orang itu, jalur berkas
 * D:\Desain\flyer.psd yang tidak ada di komputer siapa pun, atau alamat yang
 * kurang satu huruf. Ketiganya terlihat seperti pekerjaan yang sudah selesai
 * sampai ada yang mengkliknya, dan yang mengklik biasanya sedang buru-buru
 * karena acaranya besok. */
function tautanDriveSah(tautan) {
  const t = bersih(tautan, 500);
  if (!/^https:\/\//i.test(t)) return false;
  let host = '';
  try { host = new URL(t).hostname.toLowerCase(); } catch (_) { return false; }
  return host === 'drive.google.com'
    || host === 'docs.google.com'
    || host === 'drive.usercontent.google.com';
}

async function nomorBaru() {
  const n = await db.naikkan(URUT);
  const d = new Date();
  const bulan = String(d.getMonth() + 1).padStart(2, '0');
  const tahun = String(d.getFullYear()).slice(-2);
  return `MD-${tahun}${bulan}-${String(n).padStart(3, '0')}`;
}

async function semua() {
  const ids = await db.anggotaHimpunan(DAFTAR);
  if (!ids.length) return [];
  return (await db.ambilBanyak(ids.map(KUNCI))).filter(Boolean);
}

async function ambil(id) {
  if (!id) return null;
  return db.ambil(KUNCI(id));
}

function catat(rec, langkah, pengguna, catatan) {
  rec.jejak = Array.isArray(rec.jejak) ? rec.jejak : [];
  rec.jejak.push({
    langkah,
    oleh: pengguna ? String(pengguna.id) : '',
    olehNama: pengguna ? String(pengguna.nama || '') : 'Sistem',
    waktu: sekarang(),
    catatan: bersih(catatan, 500),
  });
  rec.diubah = sekarang();
}

/* --- mengajukan ---------------------------------------------------------- */

async function ajukan(data, pengguna) {
  const jenis = bersih(data.jenis, 30).toLowerCase();
  if (!jenisSah(jenis)) throw new Error('Jenis media belum dipilih.');

  const judul = bersih(data.judul, 120);
  if (!judul) throw new Error('Judul permohonan wajib diisi, misalnya "Flyer Kajian Ahad Pagi".');

  const brief = bersih(data.brief, 4000);
  if (brief.length < 10) {
    throw new Error('Brief wajib diisi. Tuliskan isi teks, suasana, warna, atau contoh yang diinginkan.');
  }

  const deadline = tanggalSah(data.deadline);
  if (!deadline) throw new Error('Tanggal desain akan dipakai wajib diisi.');

  const rec = {
    id: 'pm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
    nomor: await nomorBaru(),
    /* Nama pemohon DISALIN, bukan cuma id-nya. Akun bisa dinonaktifkan atau
       berganti nama; rekap tahun lalu tidak boleh ikut kehilangan namanya. */
    pemohonId: pengguna ? String(pengguna.id) : '',
    pemohonNama: pengguna ? String(pengguna.nama || '') : '',
    pemohonKantor: pengguna ? String(pengguna.kantor || '') : '',
    jenis,
    jenisLabel: labelJenis(jenis),
    bidang: bidangUntuk(jenis),
    judul,
    brief,
    deadline,
    keterangan: bersih(data.keterangan, 500),
    /* Bahan mentah dari pemohon: folder foto, logo, naskah. Boleh kosong, tapi
       kalau diisi harus tautan Drive yang sungguhan, sama alasannya dengan
       tautan hasil. */
    bahan: bersih(data.bahan, 500),
    status: STATUS.BARU,
    pengerjaId: '',
    pengerjaNama: '',
    hasil: [],
    jumlahRevisi: 0,
    jejak: [],
    dibuat: sekarang(),
    diubah: sekarang(),
  };

  if (rec.bahan && !tautanDriveSah(rec.bahan)) {
    throw new Error('Tautan bahan harus tautan Google Drive yang dimulai dengan https://');
  }

  catat(rec, LANGKAH.DIAJUKAN, pengguna, rec.keterangan);
  await db.simpan(KUNCI(rec.id), rec);
  await db.tambahKeHimpunan(DAFTAR, rec.id);
  return rec;
}

/* --- dikerjakan ---------------------------------------------------------- */

/* Mengambil pekerjaan. Yang dijaga: satu permohonan hanya boleh dipegang satu
   orang. Tanpa ini dua anggota tim mengerjakan flyer yang sama diam-diam, dan
   yang ketahuan cuma saat keduanya mengirim hasil. */
async function ambilKerja(id, pengguna) {
  const rec = await ambil(id);
  if (!rec) throw new Error('Permohonan tidak ditemukan.');
  if (rec.status === STATUS.DIPROSES && rec.pengerjaId
      && String(rec.pengerjaId) !== String(pengguna && pengguna.id)) {
    throw new Error(`Sudah dikerjakan ${rec.pengerjaNama || 'anggota tim lain'}.`);
  }
  if (rec.status === STATUS.SELESAI) throw new Error('Permohonan ini sudah selesai.');

  rec.status = STATUS.DIPROSES;
  rec.pengerjaId = pengguna ? String(pengguna.id) : '';
  rec.pengerjaNama = pengguna ? String(pengguna.nama || '') : '';
  catat(rec, LANGKAH.DIAMBIL, pengguna, '');
  await db.simpan(KUNCI(rec.id), rec);
  return rec;
}

/* Mengirim hasil. Tautannya wajib Google Drive, dan hasil sebelumnya tidak
   ditimpa melainkan ditumpuk: revisi ketiga tetap menyisakan jejak revisi
   pertama dan kedua beserta waktunya. */
async function kirimHasil(id, data, pengguna) {
  const rec = await ambil(id);
  if (!rec) throw new Error('Permohonan tidak ditemukan.');
  if (rec.status === STATUS.BARU) {
    throw new Error('Tekan "Mulai kerjakan" dulu, supaya pemohon tahu pekerjaannya sudah jalan.');
  }

  const tautan = bersih(data.tautan, 500);
  if (!tautan) throw new Error('Tautan hasil wajib diisi.');
  if (!tautanDriveSah(tautan)) {
    throw new Error('Tautan harus Google Drive, dimulai dengan https://drive.google.com atau https://docs.google.com');
  }

  rec.hasil = Array.isArray(rec.hasil) ? rec.hasil : [];
  rec.hasil.push({
    tautan,
    catatan: bersih(data.catatan, 500),
    oleh: pengguna ? String(pengguna.id) : '',
    olehNama: pengguna ? String(pengguna.nama || '') : '',
    waktu: sekarang(),
    versi: rec.hasil.length + 1,
  });
  rec.status = STATUS.SELESAI;
  catat(rec, LANGKAH.DIKIRIM, pengguna, bersih(data.catatan, 500));
  await db.simpan(KUNCI(rec.id), rec);
  return rec;
}

/* Minta revisi. Hanya pemohon (atau koordinator) yang boleh, dan alasannya
   wajib: "tolong direvisi" tanpa keterangan cuma memindahkan pekerjaan
   menebak ke tim media. */
async function mintaRevisi(id, catatan, pengguna) {
  const rec = await ambil(id);
  if (!rec) throw new Error('Permohonan tidak ditemukan.');
  if (rec.status !== STATUS.SELESAI) {
    throw new Error('Revisi hanya bisa diminta setelah hasilnya dikirim.');
  }
  const alasan = bersih(catatan, 1000);
  if (alasan.length < 5) throw new Error('Tuliskan bagian mana yang perlu diperbaiki.');

  rec.status = STATUS.DIPROSES;
  rec.jumlahRevisi = Number(rec.jumlahRevisi || 0) + 1;
  catat(rec, LANGKAH.REVISI, pengguna, alasan);
  await db.simpan(KUNCI(rec.id), rec);
  return rec;
}

/* Koordinator membagikan permohonan berjenis 'lainnya' ke sebuah bidang, atau
   memindahkan yang salah kotak. */
async function bagikan(id, bidang, pengguna) {
  const rec = await ambil(id);
  if (!rec) throw new Error('Permohonan tidak ditemukan.');
  const b = bersih(bidang, 20).toLowerCase();
  if (!b) throw new Error('Bidang tujuan belum dipilih.');
  const lama = rec.bidang || '(belum dibagi)';
  rec.bidang = b;
  catat(rec, LANGKAH.DIBAGI, pengguna, `Dari ${lama} ke ${b}`);
  await db.simpan(KUNCI(rec.id), rec);
  return rec;
}

/* --- membaca ------------------------------------------------------------- */

function terlambat(rec, hariIni) {
  if (!rec || !rec.deadline) return false;
  if (rec.status === STATUS.SELESAI) return false;
  const kini = hariIni || new Date().toISOString().slice(0, 10);
  return rec.deadline < kini;
}

function sisaHari(rec, hariIni) {
  if (!rec || !rec.deadline) return null;
  const kini = hariIni || new Date().toISOString().slice(0, 10);
  const a = new Date(kini + 'T00:00:00Z').getTime();
  const b = new Date(rec.deadline + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

async function saring({ status = '', jenis = '', bidang = '', pemohon = '', pengerja = '',
  dari = '', sampai = '', cari = '' } = {}) {
  let isi = await semua();
  if (status) isi = isi.filter((r) => r.status === status);
  if (jenis) isi = isi.filter((r) => r.jenis === jenis);
  if (bidang) isi = isi.filter((r) => (r.bidang || '') === bidang);
  if (pemohon) isi = isi.filter((r) => String(r.pemohonId) === String(pemohon));
  if (pengerja) isi = isi.filter((r) => String(r.pengerjaId) === String(pengerja));
  if (dari) isi = isi.filter((r) => String(r.dibuat).slice(0, 10) >= dari);
  if (sampai) isi = isi.filter((r) => String(r.dibuat).slice(0, 10) <= sampai);
  if (cari) {
    const q = String(cari).toLowerCase();
    isi = isi.filter((r) =>
      String(r.judul || '').toLowerCase().includes(q)
      || String(r.nomor || '').toLowerCase().includes(q)
      || String(r.brief || '').toLowerCase().includes(q)
      || String(r.pemohonNama || '').toLowerCase().includes(q));
  }
  /* Yang mendesak di atas. Urutannya: belum selesai dulu, lalu deadline
     terdekat. Daftar yang diurut waktu pembuatan membuat permohonan minggu
     lalu yang dipakai besok tenggelam di bawah permohonan hari ini yang
     dipakai bulan depan. */
  isi.sort((a, b) => {
    const sa = a.status === STATUS.SELESAI ? 1 : 0;
    const sb = b.status === STATUS.SELESAI ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (sa === 1) return String(b.diubah).localeCompare(String(a.diubah));
    return String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'));
  });
  return isi;
}

function ringkas(daftar, hariIni) {
  return {
    total: daftar.length,
    baru: daftar.filter((r) => r.status === STATUS.BARU).length,
    diproses: daftar.filter((r) => r.status === STATUS.DIPROSES).length,
    selesai: daftar.filter((r) => r.status === STATUS.SELESAI).length,
    terlambat: daftar.filter((r) => terlambat(r, hariIni)).length,
    revisi: daftar.reduce((s, r) => s + Number(r.jumlahRevisi || 0), 0),
  };
}

module.exports = {
  KUNCI, DAFTAR, STATUS, LABEL_STATUS, LANGKAH, LABEL_LANGKAH,
  semua, ambil, ajukan, ambilKerja, kirimHasil, mintaRevisi, bagikan,
  saring, ringkas, terlambat, sisaHari, tautanDriveSah, tanggalSah,
};
