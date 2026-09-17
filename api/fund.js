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
const himpunanLib = require('../lib/fund/himpunan');
const akunLib = require('../lib/fund/akun');
const sesi = require('../lib/fund/sesi-laz');
const fu = require('../lib/fund/util');
const rpc = require('./rpc.js');

const { sukses, gagal, bacaBody, GalatAplikasi } = util;

const tindakan = {};

// ---------------------------------------------------------------- lingkup
/* Cakupan data seorang pengguna: dirinya sendiri, atau semua fundraiser bila
   ia koordinator/superadmin. Dihitung sekali per permintaan dan diteruskan ke
   pustaka, supaya tidak ada tindakan yang lupa menyaring lalu bocor. */
function lingkup(pengguna) {
  return { pemilik: String(pengguna.id), lihatSemua: sesi.lihatSemua(pengguna) };
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

tindakan['ambil.catat'] = { izin: 'ambil.catat', async jalankan({ data, pengguna }) {
  const rec = await catat(data, pengguna, 'diambil');
  return { rec, pesan: `Donasi ${util.rupiah(rec.jumlah)} dari ${rec.donaturNama} dicatat.` };
} };

tindakan['ambil.kosong'] = { izin: 'ambil.catat', async jalankan({ data, pengguna }) {
  const rec = await catat(data, pengguna, 'kosong');
  return { rec, pesan: `Kunjungan ke ${rec.donaturNama} dicatat kosong (tidak ada donasi).` };
} };

tindakan['ambil.reschedule'] = { izin: 'donatur.ubah', async jalankan({ data, pengguna }) {
  const donatur = await donaturLib.ambilDonatur(data.donaturId);
  pastikanMilik(donatur, pengguna, 'Donatur');
  const { tanggalBaru } = await himpunanLib.reschedule(data.donaturId);
  return { tanggalBaru, pesan: `Jadwal ${donatur.nama} dipindah ke ${fu.tanggalPanjang(tanggalBaru)}.` };
} };

// ================================================================ PENGHIMPUNAN
tindakan['himpunan.daftar'] = { izin: 'himpunan.lihat', async jalankan({ data, pengguna }) {
  const l = lingkup(pengguna);
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

tindakan['cocok.daftar'] = { izin: 'cocok.lihat', async jalankan({ data, pengguna }) {
  const l = lingkup(pengguna);
  const dari = fu.tglValid(data.dari) ? data.dari : '';
  const sampai = fu.tglValid(data.sampai) ? data.sampai : '';

  /* Sisi fundraising: hanya kunjungan berisi (diambil). Kunjungan kosong tidak
     punya padanan di buku kas, jadi tidak ikut dicocokkan. */
  const fund = (await himpunanLib.saring({ ...l, dari, sampai, status: 'diambil' }));

  /* Sisi buku utama: baris Penghimpunan LAZDigital yang kolom fundraising-nya
     cocok dengan nama fundraising akun ini. Koordinator melihat semua nama. */
  const namaKu = await akunLib.namaFundraising(pengguna);
  let mainRows = [];
  try {
    const r = await rpc._internal.muat();
    const semua = bacaSheet(r.db, 'Penghimpunan');
    mainRows = semua.filter((row) => {
      if (dari && String(row.tanggal) < dari) return false;
      if (sampai && String(row.tanggal) > sampai) return false;
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
  } catch (e) {
    /* Buku utama tak terbaca (mis. basis data LAZDigital belum tersambung di
       lingkungan ini) BUKAN alasan menggagalkan halaman — sisi fundraising
       tetap berguna sendiri. Kesalahannya disampaikan, tidak ditelan. */
    mainRows = [];
    var galatMain = e.message || 'Buku utama tidak terbaca';
  }

  /* Tebakan padanan untuk baris fundraising yang BELUM ditandai cocok: satu
     baris buku utama dengan nominal sama dan nama mirip dalam rentang ±3 hari.
     Hanya usulan — penandaan tetap manual, karena salah cocok pada uang orang
     bukan hal yang boleh ditebak lalu ditulis diam-diam. */
  const dipakai = new Set();
  const fundOut = fund.map((f) => {
    let usul = null;
    if (!f.cocok.sudah) {
      const kandidat = mainRows.filter((m) => !dipakai.has(m.id)
        && m.jumlah === Number(f.jumlah)
        && samakan(m.nama) === samakan(f.donaturNama)
        && Math.abs(new Date(m.tanggal) - new Date(f.tanggal)) <= 3 * 864e5);
      if (kandidat.length === 1) { usul = kandidat[0]; dipakai.add(kandidat[0].id); }
    }
    return { ...f, usul };
  });

  const totalFund = fund.reduce((s, f) => s + (Number(f.jumlah) || 0), 0);
  const totalMain = mainRows.reduce((s, m) => s + m.jumlah, 0);
  const sudahCocok = fund.filter((f) => f.cocok.sudah).length;

  return {
    fund: fundOut,
    main: mainRows,
    ringkas: {
      totalFund, totalMain, selisih: totalFund - totalMain,
      jumlahFund: fund.length, jumlahMain: mainRows.length,
      sudahCocok, belumCocok: fund.length - sudahCocok,
    },
    galatMain: typeof galatMain !== 'undefined' ? galatMain : '',
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

// ================================================================ LAPORAN
tindakan['laporan.ringkas'] = { izin: 'laporan.lihat', async jalankan({ data, pengguna }) {
  const l = lingkup(pengguna);
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
