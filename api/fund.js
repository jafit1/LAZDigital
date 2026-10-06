// api/fund.js — satu pintu untuk seluruh tindakan modul Fundraising
//
// Bentuk permintaan : POST { token, tindakan: 'donatur.daftar', data: {...} }
// Bentuk balasan    : { ok: true, ... } atau { ok: false, pesan: '...' }
//
// Hak akses diperiksa di SINI (server). Menu yang disembunyikan di tampilan
// hanyalah kenyamanan. Modul ini berbagi akun dengan LAZDigital lewat centang
// modul 'fundraising' — lihat lib/fund/sesi-laz.js.

const util = require('../lib/blast/util');
const db = require('../lib/fund/db');
const donaturLib = require('../lib/fund/donatur');
const imporLib = require('../lib/fund/impor-donatur');
const himpunanLib = require('../lib/fund/himpunan');
const akunLib = require('../lib/fund/akun');
const sesi = require('../lib/fund/sesi-laz');
const fu = require('../lib/fund/util');
const pencocok = require('../lib/fund/pencocok');
const fundraiserLib = require('../lib/fund/fundraiser');
const rpc = require('./rpc.js');
const kwitansiLib = require('../lib/blast/kwitansi');
const antreanLib = require('../lib/blast/antrean');

const { sukses, gagal, bacaBody, GalatAplikasi } = util;

const tindakan = {};

// ---------------------------------------------------------------- lingkup
/* Cakupan data seorang pengguna: dirinya sendiri, atau semua fundraiser bila
   ia koordinator/superadmin. Dihitung sekali per permintaan dan diteruskan ke
   pustaka, supaya tidak ada tindakan yang lupa menyaring lalu bocor. */
function lingkup(pengguna) {
  return { pemilik: String(pengguna.id), lihatSemua: sesi.lihatSemua(pengguna) };
}

/* Menyempitkan lingkup ke SATU fundraiser, dipakai penyaring di halaman
 * Penghimpunan, Cocokkan, dan Laporan.
 *
 * Yang dijaga: penyaring ini hanya boleh MEMPERSEMPIT, tidak pernah
 * memperluas. Fundraiser biasa yang mengirimkan id rekannya tetap melihat
 * datanya sendiri, karena lihatSemua-nya tidak ikut dinyalakan. Kalau
 * penyaringnya dipercaya begitu saja, satu parameter di alamat sudah cukup
 * untuk membaca setoran orang lain. */
function lingkupTersaring(pengguna, data) {
  const l = lingkup(pengguna);
  const pilih = String((data && data.fundraiser) || '').trim();
  if (!pilih || !l.lihatSemua) return l;
  return { pemilik: pilih, lihatSemua: false, disaring: pilih };
}

/* Halaman yang memang hanya untuk pengawas. Ditolak di server, bukan sekadar
   disembunyikan menunya. */
function wajibLihatSemua(pengguna) {
  if (!sesi.lihatSemua(pengguna)) {
    throw new GalatAplikasi('Bagian ini hanya untuk koordinator dan superadmin.', 403);
  }
}

// ---------------------------------------------------------------- pembantu hapus
const BATAS_HAPUS_SEKALI = 500;

function idBanyak(data) {
  const kasar = []
    .concat(Array.isArray(data.id) ? data.id : (data.id ? [data.id] : []))
    .concat(Array.isArray(data.ids) ? data.ids : []);
  const unik = Array.from(new Set(kasar.map((i) => String(i || '').trim()).filter(Boolean)));
  if (!unik.length) throw new GalatAplikasi('Tidak ada baris yang ditandai.', 400);
  if (unik.length > BATAS_HAPUS_SEKALI) {
    throw new GalatAplikasi(`Terlalu banyak sekaligus (${unik.length}). Maksimal ${BATAS_HAPUS_SEKALI}.`, 400);
  }
  return unik;
}

async function hapusBerurutan(daftar, hapusSatu) {
  let terhapus = 0;
  const gagalList = [];
  for (const i of daftar) {
    try { await hapusSatu(i); terhapus++; }
    catch (e) { gagalList.push({ id: i, alasan: e.message || 'gagal dihapus' }); }
  }
  return { terhapus, gagal: gagalList };
}

function ringkasHapus({ terhapus, gagal }, satuan, tambahan = '') {
  const inti = gagal.length
    ? `${terhapus} ${satuan} dihapus, ${gagal.length} dilewati: `
      + gagal.slice(0, 3).map((g) => g.alasan).join('; ') + (gagal.length > 3 ? ' …' : '')
    : `${terhapus} ${satuan} dihapus.`;
  return { terhapus, gagal, pesan: (inti + ' ' + tambahan).trim() };
}

function tegaskanHapusSemua(data) {
  if (String(data.tegaskan || '').trim().toUpperCase() !== 'HAPUS SEMUA') {
    throw new GalatAplikasi('Ketik HAPUS SEMUA untuk menegaskan.', 400);
  }
}

/* Menjaga milik-siapa PER BARIS. Fundraiser hanya boleh menyentuh donaturnya
   sendiri; koordinator/superadmin bebas. Diperiksa saat mengubah & menghapus. */
function pastikanMilik(rec, pengguna, apa = 'data ini') {
  if (sesi.lihatSemua(pengguna)) return;
  if (!rec || String(rec.pemilik || '') !== String(pengguna.id)) {
    throw new GalatAplikasi(`${apa} bukan milik akun Anda.`, 403);
  }
}

// ================================================================ SISTEM
tindakan['fund.status'] = { async jalankan({ pengguna }) {
  const akun = await akunLib.ambilAkun(pengguna);
  return {
    pengguna: { id: pengguna.id, nama: pengguna.nama, peran: pengguna.peran, kantor: pengguna.kantor },
    izin: izinTampil(pengguna),
    lihatSemua: sesi.lihatSemua(pengguna),
    akun,
    upstash: db.pakaiUpstash,
  };
} };

/* Daftar izin untuk menyembunyikan menu. Yang menentukan tetap server. */
function izinTampil(pengguna) {
  return Object.keys(sesi.PETA_IZIN).filter((i) => sesi.bolehFund(pengguna, i));
}

// ================================================================ DASBOR
tindakan['dasbor.ringkas'] = { izin: 'fund.dasbor', async jalankan({ data, pengguna }) {
  const l = lingkup(pengguna);
  const tgl = fu.tglValid(data.tanggal) ? data.tanggal : fu.tglLokal();

  const kerja = await himpunanLib.jadwalKerja(tgl, l);
  const semuaRec = await himpunanLib.saring(l);

  const bulan = tgl.slice(0, 7);
  const recBulan = semuaRec.filter((r) => String(r.tanggal).slice(0, 7) === bulan);
  const recHari = semuaRec.filter((r) => r.tanggal === tgl);

  const donaturKu = await donaturLib.daftarDonatur({ ...l, perHalaman: 1 });

  return {
    tanggal: tgl,
    tanggalPanjang: fu.tanggalPanjang(tgl),
    jadwal: kerja,
    ringkasHari: himpunanLib.ringkas(recHari),
    ringkasBulan: himpunanLib.ringkas(recBulan),
    totalDonatur: donaturKu.total,
    belumDikunjungi: kerja.filter((k) => !k.sudahDikunjungi).length,
  };
} };

// ================================================================ DONATUR
tindakan['donatur.daftar'] = { izin: 'donatur.lihat', async jalankan({ data, pengguna }) {
  const l = lingkup(pengguna);
  const hasil = await donaturLib.daftarDonatur({
    ...l,
    cari: util.bersihkanTeks(data.cari, 80),
    grup: util.bersihkanTeks(data.grup, 40),
    halaman: Number(data.halaman) || 1,
    perHalaman: Math.min(100, Number(data.perHalaman) || 25),
  });
  const grup = await donaturLib.daftarGrup(l);
  return { ...hasil, grup, lihatSemua: l.lihatSemua };
} };

tindakan['grup.daftar'] = { izin: 'donatur.lihat', async jalankan({ pengguna }) {
  return { baris: await donaturLib.daftarGrup(lingkup(pengguna)) };
} };

tindakan['donatur.simpan'] = { izin: 'donatur.ubah', async jalankan({ data, pengguna }) {
  if (data.id) {
    const ada = await donaturLib.ambilDonatur(data.id);
    pastikanMilik(ada, pengguna, 'Donatur');
  }
  const { donatur, baru } = await donaturLib.simpanDonatur(data, pengguna.id);
  return { donatur, baru };
} };

/* Impor banyak donatur dari teks/berkas (nama, alamat, nomor, jadwal). simpan=false hanya memeriksa. */
tindakan['donatur.impor'] = { izin: 'donatur.ubah', async jalankan({ data, pengguna }) {
  const teks = String(data.teks || '');
  if (teks.length > 400000) throw new Error('Teks terlalu panjang (maksimum sekitar 400 ribu karakter).');
  const punya = await donaturLib.saringDonatur({ pemilik: pengguna.id, lihatSemua: false });
  const adaNomor = new Set(punya.map((d) => d.telepon));
  const hasil = imporLib.periksa(teks, { adaNomor });
  if (data.simpan !== true) return hasil;
  if (hasil.baris.length > 500) throw new Error('Maksimum 500 baris sekali impor.');
  let disimpan = 0;
  for (const b of hasil.baris) {
    if (b.status !== 'baru') continue;
    await donaturLib.simpanDonatur({ nama: b.nama, telepon: b.telepon, alamat: b.alamat, jadwal: b.jadwal, grup: data.grup || [] }, pengguna.id, { tanpaLokasi: true });
    disimpan++;
  }
  return { ...hasil, disimpan, pesan: `${disimpan} donatur ditambahkan, ${hasil.ringkas.ada} dilewati (sudah ada), ${hasil.ringkas.galat} baris bermasalah.` };
} };

tindakan['donatur.jadwal'] = { izin: 'donatur.ubah', async jalankan({ data, pengguna }) {
  const ada = await donaturLib.ambilDonatur(data.id);
  pastikanMilik(ada, pengguna, 'Donatur');
  const donatur = await donaturLib.aturJadwal(data.id, data.jadwal);
  return { donatur };
} };

tindakan['donatur.hapus'] = { izin: 'donatur.hapus', async jalankan({ data, pengguna }) {
  const ada = await donaturLib.ambilDonatur(data.id);
  pastikanMilik(ada, pengguna, 'Donatur');
  await donaturLib.hapusDonatur(data.id);
  return { pesan: 'Donatur dihapus.' };
} };

tindakan['donatur.hapusBanyak'] = { izin: 'donatur.hapus', async jalankan({ data, pengguna }) {
  const hasil = await hapusBerurutan(idBanyak(data), async (i) => {
    const d = await donaturLib.ambilDonatur(i);
    if (!d) throw new Error('donatur itu sudah tidak ada');
    pastikanMilik(d, pengguna, `${d.nama}`);
    await donaturLib.hapusDonatur(i);
  });
  return ringkasHapus(hasil, 'donatur');
} };

tindakan['donatur.hapusSemua'] = { izin: 'donatur.hapus', async jalankan({ data, pengguna }) {
  tegaskanHapusSemua(data);
  const l = lingkup(pengguna);
  const cocok = await donaturLib.saringDonatur({
    ...l,
    cari: util.bersihkanTeks(data.cari, 80),
    grup: util.bersihkanTeks(data.grup, 40),
  });
  const hasil = await hapusBerurutan(cocok.map((d) => d.id), (i) => donaturLib.hapusDonatur(i));
  return ringkasHapus(hasil, 'donatur',
    l.lihatSemua ? 'Termasuk donatur milik fundraiser lain.' : 'Hanya donatur milik akun Anda.');
} };

// ================================================================ PENGAMBILAN
async function catat(data, pengguna, status) {
  const donatur = await donaturLib.ambilDonatur(data.donaturId);
  pastikanMilik(donatur, pengguna, 'Donatur');
  const namaFundraising = await akunLib.namaFundraising(pengguna);
  return himpunanLib.catatKunjungan(data, { pengguna, namaFundraising, status });
}

/* Memanggil fungsi buku utama (api/rpc.js) dari dalam proses server dengan token pengguna yang sama. Objek req buatan
   sendiri membawa __dalamProses, penanda yang tidak bisa dipalsukan dari luar: dengannya engine mempercayai nama
   fundraising yang dikirim server ini (kunci pencocokan), bukan isian peramban. */
function panggilBuku(fn, args, reqAsal) {
  return new Promise((resolve, reject) => {
    const req2 = { method: 'POST', headers: (reqAsal && reqAsal.headers) || {}, socket: reqAsal && reqAsal.socket, body: { fn, args }, __dalamProses: true };
    let kode = 200;
    const res2 = {
      statusCode: 200,
      setHeader() {},
      status(k) { kode = k; return res2; },
      json(o) { if (o && o.__error) reject(new GalatAplikasi(String(o.__error), kode >= 400 ? kode : 400)); else resolve(o ? o.result : undefined); },
      end(t) { try { const o = JSON.parse(t); if (o && o.__error) reject(new GalatAplikasi(String(o.__error))); else resolve(o.result); } catch (e) { reject(e); } },
    };
    Promise.resolve(rpc(req2, res2)).catch(reject);
  });
}

/* Menulis catatan lapangan yang berisi ke buku utama (Penghimpunan) lalu menautkannya. Aman diulang: apiFundHimpunkan
   mengembalikan baris yang sama untuk catatan yang sama. Gagal di sini TIDAK membatalkan catatan lapangan; ia tetap
   tersimpan dan muncul di halaman Cocokkan seperti sebelumnya, dan petugas diberi tahu. */
async function tulisKeBuku(rec, pengguna, req) {
  const token = sesi.tokenDari(req);
  const hasil = await panggilBuku('apiFundHimpunkan', [token, {
    himpunanId: rec.id, jenisDana: rec.jenisDana, subJenis: rec.subJenis, pilar: rec.pilar,
    jumlah: rec.jumlah, metode: rec.metode, tanggal: rec.tanggal,
    namaDonatur: rec.donaturNama, telepon: rec.donaturTelepon, catatan: rec.catatan, fundraising: rec.fundraising,
  }], req);
  const baris = hasil && hasil.row;
  if (!baris || !baris.id) throw new GalatAplikasi('Buku utama tidak mengembalikan baris penghimpunan.', 502);
  const tertaut = await himpunanLib.tautkanBuku(rec.id, { id: baris.id, noKwitansi: baris.noKwitansi });
  return { rec: tertaut, baris };
}

tindakan['ambil.catat'] = { izin: 'ambil.catat', async jalankan({ data, pengguna, req }) {
  let rec = await catat(data, pengguna, 'diambil');
  let buku = null, galatBuku = '';
  /* Bentuk baru (ada jenisDana): langsung masuk buku utama. Bentuk lama (hanya peruntukan) tetap berdiri sendiri. */
  if (rec.jenisDana) {
    try { const t = await tulisKeBuku(rec, pengguna, req); rec = t.rec; buku = t.baris; }
    catch (e) { galatBuku = e.message || 'Gagal menulis ke buku utama.'; }
  }
  return {
    rec, buku, galatBuku,
    pesan: `Donasi ${util.rupiah(rec.jumlah)} dari ${rec.donaturNama} dicatat` + (buku ? ` dan masuk buku utama (${buku.noKwitansi}).` : '.'),
  };
} };

/* Mengulang penulisan ke buku utama untuk catatan yang tadinya gagal (jaringan, izin, dll.). */
tindakan['ambil.tulisBuku'] = { izin: 'ambil.catat', async jalankan({ data, pengguna, req }) {
  const rec = await himpunanLib.ambil(String(data.himpunanId || ''));
  if (!rec) throw new GalatAplikasi('Catatan tidak ditemukan', 404);
  pastikanMilik(rec, pengguna, 'Catatan');
  if (rec.status !== 'diambil' || !rec.jenisDana) throw new GalatAplikasi('Catatan ini tidak punya jenis dana, jadi tidak bisa ditulis otomatis. Gunakan halaman Cocokkan.');
  const t = await tulisKeBuku(rec, pengguna, req);
  return { rec: t.rec, buku: t.baris, pesan: `Masuk buku utama (${t.baris.noKwitansi}).` };
} };

tindakan['ambil.kosong'] = { izin: 'ambil.catat', async jalankan({ data, pengguna }) {
  const rec = await catat(data, pengguna, 'kosong');
  return { rec, pesan: `Kunjungan ke ${rec.donaturNama} dicatat kosong (tidak ada donasi).` };
} };

/* Kirim kwitansi dan ucapan terima kasih ke WhatsApp donatur dari modul Fundraising. Memakai mesin Broadcast yang sama
   (lib/blast/kwitansi.js), tetapi izinnya fundraising dan hanya untuk catatan yang sudah masuk buku utama dan milik
   pemanggil: penggalang tidak mendapat kemampuan mengirim pesan WhatsApp bebas. */
tindakan['kwitansi.kirim'] = { izin: 'ambil.catat', async jalankan({ data, pengguna, req }) {
  const rec = await himpunanLib.ambil(String(data.himpunanId || ''));
  if (!rec || !rec.buku || !rec.buku.id) throw new GalatAplikasi('Catatan ini belum masuk buku utama, jadi kwitansinya belum ada.', 409);
  pastikanMilik(rec, pengguna, 'Catatan');
  const dorong = async () => { try { await antreanLib.prosesAntrean(2500); } catch (e) { console.error('[dorong]', e.message); } };
  return kwitansiLib.kirimKwitansi({
    data: { ...data, penghimpunanId: rec.buku.id },
    pengguna, req, dorong,
  });
} };

tindakan['ambil.reschedule'] = { izin: 'donatur.ubah', async jalankan({ data, pengguna }) {
  const donatur = await donaturLib.ambilDonatur(data.donaturId);
  pastikanMilik(donatur, pengguna, 'Donatur');
  const { tanggalBaru } = await himpunanLib.reschedule(data.donaturId);
  return { tanggalBaru, pesan: `Jadwal ${donatur.nama} dipindah ke ${fu.tanggalPanjang(tanggalBaru)}.` };
} };

// ================================================================ PENGHIMPUNAN
tindakan['himpunan.daftar'] = { izin: 'himpunan.lihat', async jalankan({ data, pengguna }) {
  const l = lingkupTersaring(pengguna, data);
  const isi = await himpunanLib.saring({
    ...l,
    dari: fu.tglValid(data.dari) ? data.dari : '',
    sampai: fu.tglValid(data.sampai) ? data.sampai : '',
    status: ['diambil', 'kosong'].includes(data.status) ? data.status : '',
    cari: util.bersihkanTeks(data.cari, 80),
  });
  const perHalaman = Math.min(100, Number(data.perHalaman) || 25);
  const halaman = Math.max(1, Number(data.halaman) || 1);
  return {
    total: isi.length,
    ringkas: himpunanLib.ringkas(isi),
    halaman, perHalaman,
    baris: isi.slice((halaman - 1) * perHalaman, halaman * perHalaman),
    disaring: l.disaring || '',
  };
} };

tindakan['himpunan.hapus'] = { izin: 'himpunan.hapus', async jalankan({ data, pengguna }) {
  const rec = await himpunanLib.ambil(data.id);
  pastikanMilik(rec, pengguna, 'Catatan');
  await himpunanLib.hapus(data.id);
  return { pesan: 'Catatan penghimpunan dihapus.' };
} };

// ================================================================ COCOKKAN
/* Baris sebuah sheet LAZDigital dari basis data yang dimuat rpc.muat().
   Sheet disimpan sebagai array-of-array (baris 0 = judul). Diubah jadi objek
   di sini, sekali, supaya sisanya bekerja dengan nama kolom. */
function bacaSheet(dbLaz, nama) {
  const rows = (dbLaz && dbLaz.sheets && dbLaz.sheets[nama]) || [];
  if (rows.length < 2) return [];
  const kepala = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    kepala.forEach((k, i) => { o[k] = r[i]; });
    return o;
  });
}

const samakan = (s) => String(s || '').trim().toLowerCase();

/* Sisi buku utama: baris Penghimpunan LAZDigital yang kolom fundraising-nya
 * cocok dengan nama fundraising akun ini. Koordinator dan superadmin melihat
 * semua nama, tetapi kalau penyaring per orang sedang aktif, yang dibaca juga
 * dipersempit ke nama fundraising orang itu — kalau tidak, satu setoran bisa
 * dicocokkan dengan kwitansi milik rekannya.
 *
 * Dipisah jadi fungsi karena dipakai dua kali: menampilkan daftar, dan
 * menjalankan pencocokan otomatis. Dua salinan cara membaca buku kas adalah
 * dua kesempatan untuk berbeda tanpa ada yang sadar. */
async function bacaBukuUtama({ dari, sampai, lingkup: l, namaKu, namaSaring = '' }) {
  try {
    const r = await rpc._internal.muat();
    const semua = bacaSheet(r.db, 'Penghimpunan');
    const baris = semua.filter((row) => {
      if (dari && String(row.tanggal) < dari) return false;
      if (sampai && String(row.tanggal) > sampai) return false;
      if (namaSaring) return samakan(row.fundraising) === samakan(namaSaring);
      if (l.lihatSemua) return String(row.fundraising || '').trim() !== '';
      return samakan(row.fundraising) === samakan(namaKu);
    }).map((row) => ({
      id: row.id,
      noKwitansi: row.noKwitansi,
      tanggal: row.tanggal,
      nama: row.namaDonatur,
      jumlah: Number(row.jumlah) || 0,
      jenisDana: row.jenisDana,
      fundraising: row.fundraising,
    }));
    return { baris, galat: '' };
  } catch (e) {
    /* Buku utama tak terbaca (mis. basis data LAZDigital belum tersambung di
       lingkungan ini) BUKAN alasan menggagalkan halaman: sisi fundraising tetap
       berguna sendiri. Kesalahannya disampaikan, tidak ditelan. */
    return { baris: [], galat: e.message || 'Buku utama tidak terbaca' };
  }
}

tindakan['cocok.daftar'] = { izin: 'cocok.lihat', async jalankan({ data, pengguna }) {
  const l = lingkupTersaring(pengguna, data);
  const dari = fu.tglValid(data.dari) ? data.dari : '';
  const sampai = fu.tglValid(data.sampai) ? data.sampai : '';

  /* Sisi fundraising: hanya kunjungan berisi (diambil). Kunjungan kosong tidak
     punya padanan di buku kas, jadi tidak ikut dicocokkan. */
  const fund = (await himpunanLib.saring({ ...l, dari, sampai, status: 'diambil' }));

  const namaKu = await akunLib.namaFundraising(pengguna);
  const buku = await bacaBukuUtama({ dari, sampai, lingkup: l, namaKu });
  const mainRows = buku.baris;
  const galatMain = buku.galat;

  /* Padanan dihitung oleh satu mesin yang sama dengan yang dipakai pencocokan
     otomatis (lib/fund/pencocok.js). Dulu aturannya ditulis dua kali, di sini
     dan di tempat penandaan, dan dua salinan aturan uang adalah dua kesempatan
     untuk berbeda tanpa ada yang sadar. */
  const hasil = pencocok.padankan(fund, mainRows);
  const usulLewatId = new Map(hasil.pasangan.map((x) => [x.fundId, x.main]));
  const fundOut = fund.map((f) => {
    const kode = hasil.alasan.get(f.id) || '';
    return {
      ...f,
      usul: usulLewatId.get(f.id) || null,
      /* Yang TIDAK cocok diberi sebabnya, bukan dibiarkan kosong. Daftar
         "belum cocok" tanpa alasan cuma memindahkan pekerjaan menebak dari
         mesin ke petugas. */
      alasan: kode,
      alasanTeks: kode ? (pencocok.KETERANGAN[kode] || '') : '',
    };
  });

  const totalFund = fund.reduce((s, f) => s + (Number(f.jumlah) || 0), 0);
  const totalMain = mainRows.reduce((s, m) => s + m.jumlah, 0);
  const sudahCocok = fund.filter((f) => f.cocok.sudah).length;
  const otomatis = fund.filter((f) => f.cocok.sudah && f.cocok.otomatis).length;

  return {
    fund: fundOut,
    main: mainRows,
    ringkas: {
      totalFund, totalMain, selisih: totalFund - totalMain,
      jumlahFund: fund.length, jumlahMain: mainRows.length,
      sudahCocok, belumCocok: fund.length - sudahCocok,
      cocokOtomatis: otomatis, cocokManual: sudahCocok - otomatis,
      siapOtomatis: hasil.pasangan.length,
    },
    galatMain,
    namaFundraising: namaKu,
  };
} };

tindakan['cocok.tandai'] = { izin: 'cocok.tandai', async jalankan({ data, pengguna }) {
  const rec = await himpunanLib.ambil(data.id);
  pastikanMilik(rec, pengguna, 'Catatan');
  await himpunanLib.tandaiCocok(data.id, data.ref, pengguna);
  return { pesan: 'Ditandai sudah masuk buku utama.' };
} };

tindakan['cocok.batal'] = { izin: 'cocok.tandai', async jalankan({ data, pengguna }) {
  const rec = await himpunanLib.ambil(data.id);
  pastikanMilik(rec, pengguna, 'Catatan');
  await himpunanLib.batalCocok(data.id);
  return { pesan: 'Penandaan cocok dibatalkan.' };
} };

/* --- PENCOCOKAN OTOMATIS ---------------------------------------------------
 *
 * Menandai cocok SEMUA baris yang padanannya benar-benar tunggal: nama sama
 * persis, nominal sama persis, tanggal terpaut paling jauh tiga hari, dan
 * hanya ada satu kemungkinan di kedua arah. Aturannya ada di
 * lib/fund/pencocok.js, lengkap dengan alasan kenapa "tunggal dua arah" itu
 * yang menjaga uang orang tidak tertulis ke tempat yang salah.
 *
 * TINDAKAN INI MENULIS, JADI IZINNYA IZIN MENULIS. Ia sengaja dipisah dari
 * cocok.daftar yang hanya melihat. Kalau penandaannya dikerjakan diam-diam di
 * dalam tindakan baca, maka membuka halaman saja sudah mengubah pembukuan,
 * dan pengguna yang cuma boleh melihat ikut menuliskannya tanpa pernah diberi
 * hak itu. */
tindakan['cocok.otomatis'] = { izin: 'cocok.tandai', async jalankan({ data, pengguna }) {
  const l = lingkupTersaring(pengguna, data);
  const dari = fu.tglValid(data.dari) ? data.dari : '';
  const sampai = fu.tglValid(data.sampai) ? data.sampai : '';

  const fund = await himpunanLib.saring({ ...l, dari, sampai, status: 'diambil' });
  const namaKu = await akunLib.namaFundraising(pengguna);
  const buku = await bacaBukuUtama({ dari, sampai, lingkup: l, namaKu });
  if (buku.galat) {
    throw new GalatAplikasi('Buku utama tidak terbaca, jadi tidak ada yang bisa dicocokkan: ' + buku.galat, 503);
  }

  const hasil = pencocok.padankan(fund, buku.baris);
  let ditandai = 0;
  for (const pasang of hasil.pasangan) {
    await himpunanLib.tandaiCocok(pasang.fundId, pasang.ref, pengguna, { otomatis: true });
    ditandai++;
  }

  const sisa = fund.length - fund.filter((f) => f.cocok && f.cocok.sudah).length - ditandai;
  return {
    ditandai,
    sisa: Math.max(0, sisa),
    pesan: ditandai
      ? `${ditandai} catatan dicocokkan otomatis.` + (sisa ? ` ${sisa} sisanya perlu diperiksa sendiri.` : '')
      : 'Tidak ada yang cocok persis. Semua perlu diperiksa sendiri.',
  };
} };

/* Membatalkan seluruh penandaan OTOMATIS dalam rentang yang sedang dilihat.
   Yang ditandai petugas tidak ikut terbawa: kesalahan mesin datang
   berombongan, kesalahan orang tidak. */
tindakan['cocok.batalOtomatis'] = { izin: 'cocok.tandai', async jalankan({ data, pengguna }) {
  const l = lingkupTersaring(pengguna, data);
  const dari = fu.tglValid(data.dari) ? data.dari : '';
  const sampai = fu.tglValid(data.sampai) ? data.sampai : '';
  const fund = await himpunanLib.saring({ ...l, dari, sampai, status: 'diambil' });
  const dibatalkan = await himpunanLib.batalCocokOtomatis(fund);
  return {
    dibatalkan,
    pesan: dibatalkan
      ? `${dibatalkan} penandaan otomatis dibatalkan. Penandaan oleh petugas tidak disentuh.`
      : 'Tidak ada penandaan otomatis pada rentang ini.',
  };
} };

// ================================================================ FUNDRAISER
/* Daftar penggalang dana beserta angkanya, satu baris per orang.
 *
 * Hanya untuk koordinator dan superadmin, dan itu ditegakkan di sini — bukan
 * dengan menyembunyikan menunya, karena menu yang disembunyikan tetap bisa
 * dibuka dengan mengetik alamatnya. */
tindakan['fundraiser.daftar'] = { izin: 'himpunan.lihat', async jalankan({ data, pengguna }) {
  wajibLihatSemua(pengguna);
  const dari = fu.tglValid(data.dari) ? data.dari : '';
  const sampai = fu.tglValid(data.sampai) ? data.sampai : '';

  const catatan = await himpunanLib.saring({ pemilik: null, lihatSemua: true, dari, sampai });

  /* Users milik LAZDigital, bukan modul ini. Kalau tak terbaca, daftarnya
     tetap disusun dari catatan yang ada: lebih baik memperlihatkan angka
     tanpa nama lengkap daripada halaman kosong yang tidak menjelaskan apa-apa. */
  let daftarUsers = [];
  let galatUsers = '';
  try {
    const r = await rpc._internal.muat();
    daftarUsers = bacaSheet(r.db, 'Users');
  } catch (e) {
    galatUsers = e.message || 'Daftar akun tidak terbaca';
  }

  /* Profil fundraising disimpan per akun (akun:<id>). Diambil sekaligus, bukan
     satu per satu di dalam perulangan: dua puluh fundraiser berarti dua puluh
     perjalanan ke basis data untuk data yang muat dalam satu permintaan. */
  const idCalon = Array.from(new Set([
    ...daftarUsers.map((u) => String(u.id || '')),
    ...catatan.map((r) => String(r.pemilik || '')),
  ].filter(Boolean)));
  const profil = await db.ambilBanyak(idCalon.map((i) => akunLib.KUNCI(i)));
  const akun = {};
  idCalon.forEach((uid, i) => { if (profil[i]) akun[uid] = profil[i]; });

  const baris = fundraiserLib.susun({ pengguna: daftarUsers, akun, catatan });
  return { baris, ringkas: fundraiserLib.ringkasSemua(baris), galatUsers, dari, sampai };
} };

/* Satu fundraiser: profilnya, angkanya, dan seluruh transaksinya. */
tindakan['fundraiser.detail'] = { izin: 'himpunan.lihat', async jalankan({ data, pengguna }) {
  wajibLihatSemua(pengguna);
  const uid = String(data.userId || '').trim();
  if (!uid) throw new GalatAplikasi('Fundraiser mana yang mau dilihat?', 400);
  const dari = fu.tglValid(data.dari) ? data.dari : '';
  const sampai = fu.tglValid(data.sampai) ? data.sampai : '';

  const catatan = await himpunanLib.saring({ pemilik: uid, lihatSemua: false, dari, sampai });
  const profil = (await db.ambil(akunLib.KUNCI(uid))) || {};

  let akunLaz = null;
  try {
    const r = await rpc._internal.muat();
    akunLaz = bacaSheet(r.db, 'Users').find((u) => String(u.id) === uid) || null;
  } catch (_) { /* nama lengkapnya saja yang hilang, angkanya tetap benar */ }

  const nama = profil.namaTampil || (akunLaz && akunLaz.nama)
    || (catatan[0] && catatan[0].olehNama) || 'Fundraiser';

  return {
    fundraiser: {
      userId: uid,
      nama,
      username: (akunLaz && akunLaz.username) || '',
      namaFundraising: profil.namaFundraising || (akunLaz && akunLaz.nama) || '',
      foto: profil.foto || '',
      telepon: profil.telepon || '',
      catatanProfil: profil.catatan || '',
      aktif: akunLaz ? String(akunLaz.aktif) !== 'false' : false,
      punyaAkun: Boolean(akunLaz),
      ...fundraiserLib.hitung(catatan),
    },
    baris: catatan,
    dari, sampai,
  };
} };

// ================================================================ LAPORAN
tindakan['laporan.ringkas'] = { izin: 'laporan.lihat', async jalankan({ data, pengguna }) {
  const l = lingkupTersaring(pengguna, data);
  const dari = fu.tglValid(data.dari) ? data.dari : '';
  const sampai = fu.tglValid(data.sampai) ? data.sampai : '';
  const isi = await himpunanLib.saring({ ...l, dari, sampai, status: 'diambil' });

  const perPeruntukan = {};
  const perFundraiser = {};
  const perHari = {};
  const perPetugas = {};
  for (const r of isi) {
    const n = Number(r.jumlah) || 0;
    perPeruntukan[r.peruntukan || '—'] = (perPeruntukan[r.peruntukan || '—'] || 0) + n;
    perFundraiser[r.fundraising || '—'] = (perFundraiser[r.fundraising || '—'] || 0) + n;
    perHari[r.tanggal] = (perHari[r.tanggal] || 0) + n;
    perPetugas[r.olehNama || '—'] = (perPetugas[r.olehNama || '—'] || 0) + n;
  }
  const semuaRec = await himpunanLib.saring({ ...l, dari, sampai });

  const keArr = (obj) => Object.entries(obj).map(([k, v]) => ({ nama: k, jumlah: v }))
    .sort((a, b) => b.jumlah - a.jumlah);

  return {
    ringkas: himpunanLib.ringkas(semuaRec),
    perPeruntukan: keArr(perPeruntukan),
    perFundraiser: keArr(perFundraiser),
    perPetugas: keArr(perPetugas),
    perHari: Object.entries(perHari).map(([k, v]) => ({ tanggal: k, jumlah: v }))
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal))),
    disaring: l.disaring || '',
  };
} };

// ================================================================ AKUN
tindakan['akun.ambil'] = { izin: 'akun.lihat', async jalankan({ pengguna }) {
  return { akun: await akunLib.ambilAkun(pengguna) };
} };

tindakan['akun.simpan'] = { izin: 'akun.ubah', async jalankan({ data, pengguna }) {
  const akun = await akunLib.simpanAkun(pengguna, data);
  return { akun, pesan: 'Profil disimpan.' };
} };

// ---------------------------------------------------------------- penangan
async function wajibMasuk(req) {
  const pengguna = await sesi.penggunaLaz(req);
  if (!pengguna) {
    if (req && req.__alasanFund === 'izin') {
      throw new GalatAplikasi('Akun Anda belum diberi akses modul Fundraising. Minta admin mencentangnya di Manajemen User.', 403);
    }
    throw new GalatAplikasi('Sesi berakhir. Silakan masuk kembali lewat LAZDigital.', 401);
  }
  return pengguna;
}

module.exports = async function penangan(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return gagal(res, 405, 'Gunakan metode POST');

  let nama = '(tidak diketahui)';
  try {
    const badan = await bacaBody(req);
    req.body = badan; // sesi-laz membaca token dari req.body
    nama = String(badan.tindakan || '');
    const data = badan.data || {};

    const pintu = tindakan[nama];
    if (!pintu) return gagal(res, 404, `Tindakan "${nama}" tidak dikenal`);

    const pengguna = await wajibMasuk(req);
    /* Pagar izin ditegakkan di SATU tempat. Tindakan baru yang lupa menyetel
       `izin` tetap butuh login, tetapi sebaiknya selalu diberi izin — yang
       tanpa izin hanya fund.status. */
    if (pintu.izin && !sesi.bolehFund(pengguna, pintu.izin)) {
      throw new GalatAplikasi('Anda tidak berhak melakukan tindakan ini.', 403);
    }

    const hasil = await pintu.jalankan({ data, pengguna, req, res });
    return sukses(res, hasil || {});
  } catch (e) {
    const kode = e.kode || 500;
    if (kode >= 500) console.error(`[fund] ${nama}:`, e);
    return gagal(res, kode, e.message || 'Terjadi kesalahan di server', kode >= 500 ? { tindakan: nama } : {});
  }
};

module.exports.tindakan = tindakan;
