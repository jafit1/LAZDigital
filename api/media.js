// api/media.js - satu pintu untuk seluruh tindakan modul Media
//
// Bentuk permintaan : POST { token, tindakan: 'permohonan.daftar', data: {...} }
// Bentuk balasan    : { ok: true, ... } atau { ok: false, pesan: '...' }
//
// SATU FUNGSI, DAN ITU KEPUTUSAN SADAR. Vercel paket Hobby membatasi 12
// Serverless Function untuk seluruh situs, dan sebelum modul ini ada 10 yang
// terpakai. Memecah modul Media menjadi beberapa berkas di folder api/ akan
// memakan sisa jatahnya sekaligus, dan yang gagal bukan cuma modul ini
// melainkan SELURUH deploy, termasuk pembukuan zakat yang sudah jalan. Jadi
// seluruh tindakan lewat satu berkas, persis seperti api/blast.js dan
// api/fund.js.
//
// Hak akses diperiksa di SINI (server). Menu yang disembunyikan di tampilan
// hanyalah kenyamanan: siapa pun bisa memanggil alamat ini langsung.

const util = require('../lib/blast/util');
const db = require('../lib/media/db');
const sesi = require('../lib/media/sesi-laz');
const jenisLib = require('../lib/media/jenis');
const timLib = require('../lib/media/tim');
const pmLib = require('../lib/media/permohonan');
const rpc = require('./rpc.js');
/* Modul Surat & Pengajuan menumpang pintu ini supaya tidak menambah fungsi
   Vercel (batas 12, terpakai 10). Lihat lib/surat/api.js. */
const suratApi = require('../lib/surat/api');

const { sukses, gagal, bacaBody, GalatAplikasi } = util;

const tindakan = {};

function hariIni() {
  /* WIB, bukan UTC. Deadline "hari ini" yang dihitung dengan jam London
     membuat permohonan terlihat terlambat sejak jam 7 pagi. */
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function wajibKoordinator(pengguna) {
  if (!sesi.koordinator(pengguna)) {
    throw new GalatAplikasi('Bagian ini hanya untuk koordinator media dan superadmin.', 403);
  }
}

/* Ringkasan satu permohonan untuk daftar. Brief TIDAK ikut: ia bisa empat ribu
   huruf, dan mengirim dua ratus baris berisi brief penuh membuat daftar berat
   tanpa ada yang membacanya di situ. */
function baris(r) {
  return {
    id: r.id,
    nomor: r.nomor,
    judul: r.judul,
    jenis: r.jenis,
    jenisLabel: r.jenisLabel || jenisLib.labelJenis(r.jenis),
    bidang: r.bidang || '',
    status: r.status,
    statusLabel: pmLib.LABEL_STATUS[r.status] || r.status,
    pemohonId: r.pemohonId,
    pemohonNama: r.pemohonNama,
    pemohonKantor: r.pemohonKantor || '',
    pengerjaId: r.pengerjaId || '',
    pengerjaNama: r.pengerjaNama || '',
    deadline: r.deadline,
    sisaHari: pmLib.sisaHari(r, hariIni()),
    terlambat: pmLib.terlambat(r, hariIni()),
    jumlahRevisi: Number(r.jumlahRevisi || 0),
    jumlahHasil: (r.hasil || []).length,
    hasilTerakhir: (r.hasil || []).length ? r.hasil[r.hasil.length - 1].tautan : '',
    dibuat: r.dibuat,
    diubah: r.diubah,
  };
}

// ================================================================ STATUS
tindakan['media.status'] = { async jalankan({ pengguna }) {
  const bidangSaya = await timLib.bidangPunya(pengguna.id);
  return {
    pengguna: {
      id: pengguna.id, nama: pengguna.nama,
      peran: pengguna.peran, kantor: pengguna.kantor,
    },
    izin: izinTampil(pengguna),
    koordinator: sesi.koordinator(pengguna),
    /* Bidang yang dipegang pengguna ini. Kotak masuk tim media digambar dari
       sini, jadi anggota tim yang belum ditugaskan bidangnya akan melihat
       kotak kosong beserta keterangannya, bukan layar kosong tanpa sebab. */
    bidangSaya,
    jenis: jenisLib.JENIS,
    labelBidang: jenisLib.LABEL_BIDANG,
    labelStatus: pmLib.LABEL_STATUS,
    labelLangkah: pmLib.LABEL_LANGKAH,
    hariIni: hariIni(),
    upstash: db.pakaiUpstash,
  };
} };

/* Daftar izin untuk menyembunyikan menu. Yang menentukan tetap server. */
function izinTampil(pengguna) {
  return Object.keys(sesi.PETA_IZIN).filter((i) => sesi.bolehMedia(pengguna, i));
}

// ================================================================ DASBOR
tindakan['dasbor.ringkas'] = { izin: 'media.dasbor', async jalankan({ pengguna }) {
  const semua = await pmLib.semua();
  const kini = hariIni();
  const bidangSaya = await timLib.bidangPunya(pengguna.id);

  /* Tiga angka yang berbeda untuk tiga peran, dihitung dari satu sumber.
     Dipisah supaya tiap orang membuka halaman dan langsung melihat angka yang
     memang urusannya, bukan angka lembaga yang tidak bisa ia kerjakan. */
  const punyaSaya = semua.filter((r) => String(r.pemohonId) === String(pengguna.id));
  const kotakSaya = bidangSaya.length
    ? semua.filter((r) => bidangSaya.includes(r.bidang || '') && r.status !== pmLib.STATUS.SELESAI)
    : [];

  const hasil = {
    lembaga: pmLib.ringkas(semua, kini),
    saya: pmLib.ringkas(punyaSaya, kini),
    kotakSaya: {
      jumlah: kotakSaya.length,
      baru: kotakSaya.filter((r) => r.status === pmLib.STATUS.BARU).length,
      terlambat: kotakSaya.filter((r) => pmLib.terlambat(r, kini)).length,
    },
    bidangSaya,
    /* Yang paling mendesak, siap digambar tanpa permintaan kedua. */
    mendesak: (await pmLib.saring({}))
      .filter((r) => r.status !== pmLib.STATUS.SELESAI)
      .slice(0, 8).map(baris),
  };

  /* --- PEMANTAUAN KOORDINATOR & SUPERADMIN --------------------------------
   *
   * Angka lembaga di atas menjawab "berapa", tetapi yang ditanyakan pengawas
   * bukan berapa melainkan DI MANA MACETNYA. Tiga hal yang dijawab di sini,
   * dan ketiganya tidak bisa disimpulkan dari angka total:
   *
   *   1. BEBAN PER BIDANG. Tim desain menumpuk sementara tim foto menganggur
   *      adalah keadaan yang di angka total terlihat sehat-sehat saja.
   *
   *   2. BIDANG TANPA PEMEGANG. Permohonan yang masuk ke situ tidak akan
   *      pernah muncul di kotak siapa pun; ia cuma diam sampai tanggalnya
   *      lewat, dan tidak ada yang merasa bersalah karena tidak ada yang tahu.
   *
   *   3. BEBAN PER ORANG. Satu orang memegang tujuh pekerjaan sementara
   *      rekannya nol biasanya bukan soal rajin, melainkan soal pembagian
   *      yang tidak pernah dilihat siapa pun.
   *
   * Dihitung hanya untuk yang berhak, supaya permintaan pemohon biasa tidak
   * ikut membayar ongkos hitungannya. */
  if (sesi.koordinator(pengguna)) {
    const anggota = await timLib.semua();
    const belum = semua.filter((r) => r.status !== pmLib.STATUS.SELESAI);

    hasil.pantau = {
      perBidang: Object.values(jenisLib.BIDANG).map((b) => {
        const isi = belum.filter((r) => (r.bidang || '') === b);
        const orang = anggota.filter((t) => t.aktif !== false && (t.bidang || []).includes(b));
        return {
          bidang: b,
          label: jenisLib.LABEL_BIDANG[b] || b,
          orang: orang.map((t) => t.nama),
          antre: isi.length,
          baru: isi.filter((r) => r.status === pmLib.STATUS.BARU).length,
          terlambat: isi.filter((r) => pmLib.terlambat(r, kini)).length,
          kosong: orang.length === 0,
        };
      }),
      /* Yang belum dibagikan ke bidang mana pun. Hanya koordinator yang bisa
         membereskannya, jadi hanya dia yang perlu melihatnya. */
      belumDibagi: belum.filter((r) => !r.bidang).length,
      perOrang: anggota.filter((t) => t.aktif !== false).map((t) => ({
        userId: t.userId,
        nama: t.nama,
        bidang: (t.bidang || []).map((b) => jenisLib.LABEL_BIDANG[b] || b),
        sedang: belum.filter((r) => String(r.pengerjaId) === String(t.userId)
          && r.status === pmLib.STATUS.DIPROSES).length,
        selesai: semua.filter((r) => String(r.pengerjaId) === String(t.userId)
          && r.status === pmLib.STATUS.SELESAI).length,
      })).sort((a, b) => b.sedang - a.sedang || String(a.nama).localeCompare(String(b.nama), 'id')),
      /* Yang sudah lewat tanggal dan masih belum selesai. Ini daftar yang
         dibaca lebih dulu dari apa pun di halaman ini. */
      telat: belum.filter((r) => pmLib.terlambat(r, kini))
        .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
        .slice(0, 10).map(baris),
    };
  }

  return hasil;
} };

// ================================================================ PERMOHONAN
tindakan['permohonan.ajukan'] = { izin: 'permohonan.ajukan', async jalankan({ data, pengguna }) {
  const rec = await pmLib.ajukan(data, pengguna);
  return { permohonan: baris(rec), pesan: `Permohonan ${rec.nomor} terkirim.` };
} };

tindakan['permohonan.daftar'] = { izin: 'permohonan.lihat', async jalankan({ data, pengguna }) {
  /* KOTAK MANA YANG DIBUKA. 'saya' = yang saya ajukan, 'kotak' = yang masuk
     bidang saya, kosong = semua. Yang terakhir memang terbuka untuk semua
     yang boleh membuka modul ini; alasannya ditulis di lib/media/sesi-laz.js. */
  const kotak = String(data.kotak || '').trim();
  const saring = {
    status: util.bersihkanTeks(data.status, 20),
    jenis: util.bersihkanTeks(data.jenis, 30),
    bidang: util.bersihkanTeks(data.bidang, 20),
    dari: pmLib.tanggalSah(data.dari),
    sampai: pmLib.tanggalSah(data.sampai),
    cari: util.bersihkanTeks(data.cari, 80),
  };
  if (kotak === 'saya') saring.pemohon = String(pengguna.id);

  let isi = await pmLib.saring(saring);

  if (kotak === 'kotak') {
    const bidangSaya = await timLib.bidangPunya(pengguna.id);
    /* Koordinator juga melihat yang BELUM punya bidang, karena memang dialah
       yang membagikannya. Kalau tidak, permohonan berjenis 'lainnya' tidak
       akan muncul di kotak siapa pun dan diam sampai deadline lewat. */
    const bolehKosong = sesi.koordinator(pengguna);
    isi = isi.filter((r) => bidangSaya.includes(r.bidang || '')
      || (bolehKosong && !r.bidang));
  }

  return {
    baris: isi.map(baris),
    ringkas: pmLib.ringkas(isi, hariIni()),
    kotak,
  };
} };

tindakan['permohonan.detail'] = { izin: 'permohonan.lihat', async jalankan({ data }) {
  const rec = await pmLib.ambil(util.bersihkanTeks(data.id, 80));
  if (!rec) throw new GalatAplikasi('Permohonan tidak ditemukan.', 404);
  const kini = hariIni();
  return {
    permohonan: {
      ...baris(rec),
      brief: rec.brief,
      keterangan: rec.keterangan || '',
      bahan: rec.bahan || '',
      hasil: rec.hasil || [],
      /* Jejak dikirim apa adanya dan urut waktu. Inilah "jalan prosesnya dari
         awal sampai akhir" yang diminta, dan ia tidak boleh diringkas di
         server: yang meringkas berarti memutuskan bagian mana yang tidak
         perlu diketahui pemohon. */
      jejak: (rec.jejak || []).slice().sort((a, b) => String(a.waktu).localeCompare(String(b.waktu))),
    },
    hariIni: kini,
  };
} };

tindakan['permohonan.revisi'] = { izin: 'permohonan.revisi', async jalankan({ data, pengguna }) {
  const rec = await pmLib.ambil(util.bersihkanTeks(data.id, 80));
  if (!rec) throw new GalatAplikasi('Permohonan tidak ditemukan.', 404);
  /* YANG BOLEH MINTA REVISI CUMA PEMOHONNYA, atau koordinator.
     Kalau siapa pun boleh, satu staff yang kurang suka hasil desain orang
     lain bisa mengembalikan pekerjaan yang sudah diterima pemiliknya. */
  if (String(rec.pemohonId) !== String(pengguna.id) && !sesi.koordinator(pengguna)) {
    throw new GalatAplikasi('Revisi hanya bisa diminta oleh pemohonnya sendiri.', 403);
  }
  const baru = await pmLib.mintaRevisi(rec.id, data.catatan, pengguna);
  return { permohonan: baris(baru), pesan: 'Permintaan revisi terkirim ke tim media.' };
} };

// ================================================================ KERJA TIM MEDIA
tindakan['kerja.ambil'] = { izin: 'kerja.ambil', async jalankan({ data, pengguna }) {
  const rec = await pmLib.ambil(util.bersihkanTeks(data.id, 80));
  if (!rec) throw new GalatAplikasi('Permohonan tidak ditemukan.', 404);
  await wajibBidang(rec, pengguna);
  const baru = await pmLib.ambilKerja(rec.id, pengguna);
  return { permohonan: baris(baru), pesan: 'Ditandai sedang dikerjakan. Pemohon sudah bisa melihatnya.' };
} };

tindakan['kerja.kirim'] = { izin: 'kerja.kirim', async jalankan({ data, pengguna }) {
  const rec = await pmLib.ambil(util.bersihkanTeks(data.id, 80));
  if (!rec) throw new GalatAplikasi('Permohonan tidak ditemukan.', 404);
  await wajibBidang(rec, pengguna);
  const baru = await pmLib.kirimHasil(rec.id, data, pengguna);
  return { permohonan: baris(baru), pesan: 'Hasil terkirim. Pemohon langsung melihatnya di halamannya.' };
} };

/* BIDANG DITEGAKKAN DI SERVER, BUKAN DENGAN MENYEMBUNYIKAN TOMBOL.
 *
 * Kotak masuk tim foto memang cuma menggambar permohonan foto, tetapi
 * tombolnya memanggil alamat ini dengan sebuah id, dan id permohonan video
 * sama gampangnya diketik. Tanpa pagar ini, pembagian bidang cuma tata letak
 * layar, bukan aturan. */
async function wajibBidang(rec, pengguna) {
  if (sesi.koordinator(pengguna)) return;
  const bidangSaya = await timLib.bidangPunya(pengguna.id);
  if (!bidangSaya.length) {
    throw new GalatAplikasi(
      'Anda belum ditugaskan ke bidang mana pun. Minta koordinator menambahkan Anda di halaman Tim Media.', 403);
  }
  if (!rec.bidang) {
    throw new GalatAplikasi('Permohonan ini belum dibagikan koordinator ke bidang mana pun.', 409);
  }
  if (!bidangSaya.includes(rec.bidang)) {
    const label = jenisLib.LABEL_BIDANG[rec.bidang] || rec.bidang;
    throw new GalatAplikasi(`Permohonan ini bagian tim ${label}, bukan bidang Anda.`, 403);
  }
}

tindakan['permohonan.bagi'] = { izin: 'permohonan.bagi', async jalankan({ data, pengguna }) {
  wajibKoordinator(pengguna);
  const b = util.bersihkanTeks(data.bidang, 20).toLowerCase();
  if (!jenisLib.bidangSah(b)) throw new GalatAplikasi('Bidang tujuan tidak dikenal.');
  const rec = await pmLib.bagikan(util.bersihkanTeks(data.id, 80), b, pengguna);
  return { permohonan: baris(rec), pesan: `Dibagikan ke tim ${jenisLib.LABEL_BIDANG[b]}.` };
} };

// ================================================================ TIM MEDIA
tindakan['tim.daftar'] = { izin: 'tim.lihat', async jalankan({ pengguna }) {
  wajibKoordinator(pengguna);
  const anggota = await timLib.semua();
  const kosong = await timLib.bidangKosong(Object.values(jenisLib.BIDANG));
  /* Akun LAZDigital yang bisa dipilih. Diambil dari sumber yang sama dengan
     Manajemen User supaya tidak ada daftar nama kedua yang bisa basi. */
  const r = await rpc._internal.muat();
  const pengguna2 = (r.db && r.db.sheets && r.db.sheets.Users) || [];
  const kepala = pengguna2[0] || [];
  const kolom = (nama) => kepala.indexOf(nama);
  const iId = kolom('id'); const iNama = kolom('nama');
  const iUser = kolom('username'); const iAktif = kolom('aktif');
  const akun = pengguna2.slice(1)
    .filter((b) => (iAktif < 0 ? true : String(b[iAktif]) !== 'false'))
    .map((b) => ({
      id: String(b[iId]),
      nama: String(b[iNama] || b[iUser] || b[iId]),
      username: String(b[iUser] || ''),
    }));

  return {
    anggota,
    akun,
    bidang: jenisLib.LABEL_BIDANG,
    /* Bidang tanpa satu pun pemegang. Diperingatkan lebih dulu, karena
       permohonan yang masuk ke bidang kosong akan diam di sana sampai
       deadline lewat tanpa ada yang merasa kebagian. */
    bidangKosong: kosong,
    jenisPerBidang: Object.fromEntries(
      Object.values(jenisLib.BIDANG).map((b) => [b, jenisLib.jenisBidang(b)])),
  };
} };

tindakan['tim.simpan'] = { izin: 'tim.ubah', async jalankan({ data, pengguna }) {
  wajibKoordinator(pengguna);
  const rec = await timLib.simpan({
    userId: data.userId,
    nama: data.nama,
    bidang: data.bidang,
    catatan: data.catatan,
    aktif: data.aktif,
  });
  return { anggota: rec, pesan: `${rec.nama} disimpan.` };
} };

tindakan['tim.hapus'] = { izin: 'tim.ubah', async jalankan({ data, pengguna }) {
  wajibKoordinator(pengguna);
  await timLib.hapus(data.userId);
  return { pesan: 'Anggota dikeluarkan dari tim media.' };
} };

// ================================================================ REKAP
tindakan['rekap.ringkas'] = { izin: 'rekap.lihat', async jalankan({ data, pengguna }) {
  wajibKoordinator(pengguna);
  const dari = pmLib.tanggalSah(data.dari);
  const sampai = pmLib.tanggalSah(data.sampai);
  const isi = await pmLib.saring({ dari, sampai });
  const kini = hariIni();

  const kelompok = (ambilKunci, label) => {
    const peta = new Map();
    for (const r of isi) {
      const k = ambilKunci(r) || '(kosong)';
      if (!peta.has(k)) {
        peta.set(k, { kunci: k, label: label(k, r), total: 0, selesai: 0, terlambat: 0, revisi: 0 });
      }
      const p = peta.get(k);
      p.total++;
      if (r.status === pmLib.STATUS.SELESAI) p.selesai++;
      if (pmLib.terlambat(r, kini)) p.terlambat++;
      p.revisi += Number(r.jumlahRevisi || 0);
    }
    return Array.from(peta.values()).sort((a, b) => b.total - a.total);
  };

  return {
    ringkas: pmLib.ringkas(isi, kini),
    perJenis: kelompok((r) => r.jenis, (k) => jenisLib.labelJenis(k)),
    perBidang: kelompok((r) => r.bidang, (k) => jenisLib.LABEL_BIDANG[k] || 'Belum dibagi'),
    perPemohon: kelompok((r) => r.pemohonId, (k, r) => r.pemohonNama || k),
    /* Siapa mengerjakan berapa. Hanya yang sudah diambil; permohonan yang
       masih menganggur tidak boleh dibebankan ke siapa pun. */
    perPengerja: kelompok(
      (r) => (r.pengerjaId ? r.pengerjaId : ''),
      (k, r) => r.pengerjaNama || 'Belum diambil'),
    baris: isi.map(baris),
    dari, sampai,
  };
} };

// ---------------------------------------------------------------- penangan
async function wajibMasuk(req) {
  const pengguna = await sesi.penggunaLaz(req);
  if (!pengguna) {
    if (req && req.__alasanMedia === 'izin') {
      throw new GalatAplikasi('Akun Anda belum diberi akses modul Media. Minta admin mencentangnya di Manajemen User.', 403);
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
    /* Diteruskan SEBELUM pemeriksaan izin Media: izinnya sendiri (modul
       'surat'), dan tindakan surat.lacak memang terbuka tanpa masuk. */
    if (nama.startsWith('surat.')) return suratApi.tangani(req, res, badan, util);
    const data = badan.data || {};

    const pintu = tindakan[nama];
    if (!pintu) return gagal(res, 404, `Tindakan "${nama}" tidak dikenal`);

    const pengguna = await wajibMasuk(req);
    /* Pagar izin ditegakkan di SATU tempat. Yang tanpa izin hanya media.status. */
    if (pintu.izin && !sesi.bolehMedia(pengguna, pintu.izin)) {
      throw new GalatAplikasi('Anda tidak berhak melakukan tindakan ini.', 403);
    }

    const hasil = await pintu.jalankan({ data, pengguna, req, res });
    return sukses(res, hasil || {});
  } catch (e) {
    const kode = e.kode || 500;
    if (kode >= 500) console.error(`[media] ${nama}:`, e);
    return gagal(res, kode, e.message || 'Terjadi kesalahan di server', kode >= 500 ? { tindakan: nama } : {});
  }
};

module.exports.tindakan = tindakan;
