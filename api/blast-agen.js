// api/blast-agen.js — pintu bagi gateway WhatsApp milik lembaga sendiri
//
// Arah hubungannya sengaja dibalik: LAZDigital tidak pernah memanggil gateway,
// gateway yang menarik pekerjaan dari sini. Alasannya sederhana — gateway
// hidup di PC kantor atau VPS di balik NAT, tidak punya alamat tetap yang bisa
// dihubungi dari internet, dan IP-nya berubah-ubah. Kalau LAZDigital yang
// memanggil, setiap kali ganti jaringan pengiriman akan mati tanpa sebab yang
// terlihat. Dengan ditarik, gateway cukup bisa menghubungi internet keluar.
//
// Endpoint ini BUKAN untuk pengguna. Ia tidak mengenal token sesi amil dan
// tidak membaca tabel Users. Yang dipakai adalah satu token mesin
// (BLAST_AGEN_TOKEN) yang hanya ada di variabel lingkungan Vercel dan di
// berkas setelan gateway — tidak pernah masuk git, karena repositori ini
// publik.

const db = require('../lib/blast/db');
const {
  id, sekarang, normalkanNomor, bersihkanTeks, isiPlaceholder,
  bandingAman, sukses, gagal, bacaBody,
} = require('../lib/blast/util');
const { ambilSetelan } = require('../lib/blast/setelan');
const { KUNCI_PESAN, KUNCI_ANTREAN, KUNCI_SERAHAN, catatKeDaftar, prosesAntrean } = require('../lib/blast/antrean');
const { kirimKejadian } = require('../lib/blast/webhook');
const mandiri = require('../lib/blast/pengirim/mandiri');
const kontakLib = require('../lib/blast/kontak');
const berkasLib = require('../lib/blast/berkas');
const { cariBalasan } = require('../lib/blast/balasan');

const KUNCI_PERANGKAT = (i) => `perangkat:${i}`;
/* Kunci klaim per pesan. INCR bersifat atomik di Redis, jadi hanya penarik
   pertama yang mendapat nilai 1 — inilah yang mencegah satu pesan terkirim dua
   kali ketika ada dua gateway menyala, atau satu gateway yang menarik ulang
   karena jawabannya hilang di tengah jalan. */
const KUNCI_KLAIM = (pesanId) => `agen:klaim:${pesanId}`;
/* Penghubung id pesan WhatsApp ke id pesan kita, dipakai laporan centang. */
const KUNCI_LUAR = (idLuar) => `idluar:${idLuar}`;
const LUAR_DETIK = 7 * 24 * 60 * 60;

/* Status hanya boleh MAJU. WhatsApp kadang mengirim centang lama menyusul yang
   baru, dan tanpa urutan ini sebuah pesan yang sudah dibaca bisa turun lagi
   jadi "sampai" — laporannya lalu terlihat mundur tanpa sebab. */
const URUTAN = { antre: 0, diserahkan: 1, terkirim: 2, sampai: 3, dibaca: 4 };
const KLAIM_DETIK = 15 * 60;

const MAKS_AMBIL = 20;

/* Antrean didorong oleh gateway yang sedang menarik, bukan oleh cron Vercel.
   Alasannya praktis: paket Hobby hanya mengizinkan cron sekali sehari, jadi
   mengandalkan cron berarti pesan menumpuk sampai besok. Lagi pula tidak ada
   gunanya memproses antrean saat tidak ada satu pun gateway yang siap kirim —
   yang menarik pekerjaan otomatis juga yang paling tahu ia sedang siap.

   Kunci INCR ini membatasi satu dorongan tiap 15 detik, supaya dua gateway
   yang menarik bersamaan tidak menjalankan pemrosesan dua kali. */
const KUNCI_DORONG = 'agen:dorong';
const DORONG_DETIK = 15;
const DORONG_BATAS_MS = 8000;

async function dorongAntrean() {
  try {
    const urut = await db.naikkan(KUNCI_DORONG, DORONG_DETIK);
    if (Number(urut) !== 1) return null;   // baru saja didorong penarikan lain
    return await prosesAntrean(DORONG_BATAS_MS);
  } catch (e) {
    /* Gagal mendorong tidak boleh menggagalkan penarikan: pekerjaan yang sudah
       telanjur ada di kotak keluar tetap harus bisa diambil. */
    console.error('[blast-agen] gagal mendorong antrean:', e.message);
    return null;
  }
}

function tokenSah(req) {
  const diminta = String((req.headers && req.headers['x-agen-token']) || '');
  const seharusnya = String(process.env.BLAST_AGEN_TOKEN || '');
  /* Tanpa token tersetel, endpoint ini ditutup rapat. Kalau dibiarkan terbuka,
     siapa pun yang tahu alamatnya bisa menarik seluruh antrean berisi nomor
     telepon donatur. */
  if (!seharusnya) return { ok: false, alasan: 'belum-disetel' };
  if (!diminta || !bandingAman(diminta, seharusnya)) return { ok: false, alasan: 'salah' };
  return { ok: true };
}

/* --- halo: gateway memperkenalkan diri dan mengambil aturan kirim ---------- */
async function halo({ data }) {
  const setelan = await ambilSetelan();
  const idDaftar = await db.anggotaHimpunan('perangkat:daftar');
  const perangkat = (await db.ambilBanyak(idDaftar.map(KUNCI_PERANGKAT)))
    .filter(Boolean)
    .filter((p) => (p.driver || setelan.pengirim.driver) === 'mandiri')
    .map((p) => ({ id: p.id, nama: p.nama, nomor: p.nomor || '', aktif: p.aktif !== false }));

  return {
    waktuServer: sekarang(),
    agen: bersihkanTeks(data.agen || 'gateway', 60),
    perangkat,
    /* Jeda dan batas harian tetap ditentukan di sini, bukan di gateway, supaya
       satu tempat saja yang mengatur dan amil tidak perlu menyetelnya dua kali. */
    aturan: {
      jedaMinDetik: setelan.kirim.jedaMinDetik,
      jedaMaksDetik: setelan.kirim.jedaMaksDetik,
      batasHarianPerangkat: setelan.kirim.batasHarianPerangkat,
      jamMulai: setelan.kirim.jamMulai,
      jamSelesai: setelan.kirim.jamSelesai,
      hormatiJamKirim: setelan.kirim.hormatiJamKirim,
      efekMengetik: setelan.pengirim.efekMengetik,
    },
  };
}

/* --- lapor-perangkat: detak jantung + status sambungan + QR ---------------- */
async function laporPerangkat({ data }) {
  const perangkatId = bersihkanTeks(data.perangkatId || '', 80);
  if (!perangkatId) throw Object.assign(new Error('perangkatId wajib diisi'), { kode: 400 });

  const status = ['tersambung', 'menunggu', 'terputus'].includes(data.status) ? data.status : 'terputus';
  const kabar = {
    status,
    nomor: normalkanNomor(data.nomor || '') || '',
    /* QR hanya berumur pendek; menyimpannya lama tidak ada gunanya dan justru
       menampilkan kode basi di layar amil.

       Yang dikirim gateway adalah GAMBARNYA (data URL PNG), bukan teks QR-nya —
       teks itu kredensial yang tidak boleh keluar dari komputer gateway. Satu
       gambar 264px berukuran sekitar 6 KB, jadi batasnya harus jauh di atas itu:
       dipotong sedikit saja, QR-nya rusak dan tidak bisa dipindai. */
    qr: status === 'menunggu' ? bersihkanTeks(data.qr || '', 20000) : '',
    keterangan: bersihkanTeks(data.keterangan || '', 300),
    agen: bersihkanTeks(data.agen || '', 60),
    waktu: sekarang(),
  };
  await db.simpan(mandiri.KUNCI_AGEN(perangkatId), kabar, { detik: 3600 });

  /* Status perangkat yang dilihat amil ikut disegarkan, supaya halaman
     Perangkat tidak menampilkan "tersambung" untuk gateway yang sudah mati. */
  const perangkat = await db.ambil(KUNCI_PERANGKAT(perangkatId));
  if (perangkat) {
    perangkat.status = status;
    if (kabar.nomor) perangkat.nomor = kabar.nomor;
    perangkat.diperiksa = kabar.waktu;
    await db.simpan(KUNCI_PERANGKAT(perangkatId), perangkat);
  }

  /* Perintah menyusul jawaban — gateway tidak perlu endpoint terpisah untuk
     menanyakannya. */
  const perintah = await db.ambil(mandiri.KUNCI_PERINTAH(perangkatId));
  if (perintah) await db.hapus(mandiri.KUNCI_PERINTAH(perangkatId));

  return { dicatat: true, perintah: perintah ? perintah.perintah : '', dikenal: !!perangkat };
}

/* --- ambil: menarik pekerjaan, satu pesan tidak boleh keluar dua kali ------ */
async function ambil({ data }) {
  const perangkatId = bersihkanTeks(data.perangkatId || '', 80);
  if (!perangkatId) throw Object.assign(new Error('perangkatId wajib diisi'), { kode: 400 });
  const maks = Math.max(1, Math.min(MAKS_AMBIL, Number(data.maks) || 5));

  let ids = await db.anggotaHimpunan(mandiri.KUNCI_KELUAR(perangkatId));
  let laporan = null;
  if (!ids.length) {
    /* Kotak keluar kosong belum tentu antreannya kosong — bisa jadi belum ada
       yang memindahkannya ke sini. Dorong sekali, lalu lihat lagi. */
    laporan = await dorongAntrean();
    ids = await db.anggotaHimpunan(mandiri.KUNCI_KELUAR(perangkatId));
    if (!ids.length) return { pekerjaan: [], sisa: 0, dorong: laporan };
  }

  const isi = (await db.ambilBanyak(ids.map(KUNCI_PESAN))).filter(Boolean);
  const hidup = new Set(isi.map((p) => p.id));
  const yatim = ids.filter((i) => !hidup.has(i));
  if (yatim.length) await db.keluarDariHimpunan(mandiri.KUNCI_KELUAR(perangkatId), ...yatim);

  const antre = isi
    .filter((p) => p.status === 'diserahkan')
    .sort((a, b) => new Date(a.diserahkanPada || a.dibuat) - new Date(b.diserahkanPada || b.dibuat));

  const pekerjaan = [];
  for (const pesan of antre) {
    if (pekerjaan.length >= maks) break;
    const urut = await db.naikkan(KUNCI_KLAIM(pesan.id), KLAIM_DETIK);
    if (Number(urut) !== 1) continue; // sudah dipegang penarikan lain
    pekerjaan.push({
      pesanId: pesan.id,
      nomor: pesan.nomor,
      nama: pesan.nama || '',
      teks: isiPlaceholder(String((pesan.isi && pesan.isi.teks) || ''), { nama: pesan.nama || '' }),
      berkasUrl: (pesan.isi && pesan.isi.berkasUrl) || '',
      namaBerkas: (pesan.isi && pesan.isi.namaBerkas) || '',
      /* Yang dikirim hanya KETERANGAN lampirannya. Isi berkasnya ditarik
         terpisah lewat tindakan "berkas" dan disimpan gateway — satu PDF untuk
         lima ratus penerima kalau ikut di tiap pekerjaan berarti megabita yang
         sama diunduh lima ratus kali. */
      berkasId: (pesan.isi && pesan.isi.berkasId) || '',
      tipeBerkas: (pesan.isi && pesan.isi.tipeBerkas) || '',
      jenisBerkas: (pesan.isi && pesan.isi.jenisBerkas) || '',
    });
  }
  return { pekerjaan, sisa: Math.max(0, antre.length - pekerjaan.length), dorong: laporan };
}

/* --- lapor: hasil sebenarnya dari WhatsApp --------------------------------- */
async function lapor({ data }) {
  const daftar = Array.isArray(data.hasil) ? data.hasil.slice(0, 100) : [];
  if (!daftar.length) return { diproses: 0 };

  const setelan = await ambilSetelan();
  let terkirim = 0, gagalJml = 0, diabaikan = 0;

  for (const h of daftar) {
    const pesanId = bersihkanTeks(h.pesanId || '', 80);
    if (!pesanId) { diabaikan++; continue; }
    const pesan = await db.ambil(KUNCI_PESAN(pesanId));
    if (!pesan) { diabaikan++; continue; }
    /* Laporan yang datang dua kali (gateway mengirim ulang karena jawabannya
       hilang) tidak boleh mengubah apa pun untuk kedua kalinya. */
    if (pesan.status !== 'diserahkan') { diabaikan++; continue; }

    await db.keluarDariHimpunan(mandiri.KUNCI_KELUAR(pesan.perangkatId), pesan.id);
    await db.keluarDariHimpunan(KUNCI_SERAHAN, pesan.id);
    await db.hapus(KUNCI_KLAIM(pesan.id));

    if (h.status === 'terkirim') {
      pesan.status = 'terkirim';
      pesan.idLuar = bersihkanTeks(h.idLuar || '', 120);
      pesan.dikirim = sekarang();
      pesan.galatTerakhir = '';
      await db.simpan(KUNCI_PESAN(pesan.id), pesan);
      /* Centang sampai dan dibaca datang belakangan, dan WhatsApp hanya
         menyebut id pesannya sendiri — bukan id kita. Indeks ini yang
         menghubungkan keduanya. */
      if (pesan.idLuar) await db.simpan(KUNCI_LUAR(pesan.idLuar), pesan.id, { detik: LUAR_DETIK });
      await kirimKejadian('terkirim', pesan, setelan);
      terkirim++;
      continue;
    }

    pesan.percobaan = (pesan.percobaan || 0) + 1;
    pesan.galatTerakhir = bersihkanTeks(h.galat || 'Gateway gagal mengirim', 300);
    const menyerah = h.sementara === false || pesan.percobaan >= setelan.kirim.percobaanMaks;
    if (menyerah) {
      pesan.status = 'gagal';
      pesan.gagalPada = sekarang();
      await db.simpan(KUNCI_PESAN(pesan.id), pesan);
      await db.tambahKeHimpunan('pesan:gagal', pesan.id);
      await kirimKejadian('gagal', pesan, setelan);
    } else {
      /* Kembali ke antrean utama, bukan langsung ke kotak keluar gateway:
         jeda dan batas harian harus dihitung ulang dari awal. */
      const tundaMenit = Math.pow(2, pesan.percobaan - 1);
      pesan.status = 'antre';
      pesan.jadwal = new Date(Date.now() + tundaMenit * 60 * 1000).toISOString();
      await db.simpan(KUNCI_PESAN(pesan.id), pesan);
      await db.tambahKeHimpunan(KUNCI_ANTREAN, pesan.id);
    }
    gagalJml++;
  }
  return { diproses: daftar.length, terkirim, gagal: gagalJml, diabaikan };
}

/* --- masuk: pesan balasan dari donatur ------------------------------------- */
async function masuk({ data }) {
  const nomor = normalkanNomor(data.nomor || '');
  const teks = bersihkanTeks(data.teks || '', 4000);
  if (!nomor) return { diabaikan: true };

  const perangkatId = bersihkanTeks(data.perangkatId || '', 80);
  const setelan = await ambilSetelan();

  let kontak = await kontakLib.cariLewatNomor(nomor);
  if (!kontak) {
    const hasil = await kontakLib.simpanKontak({
      nama: bersihkanTeks(data.nama || '', 120) || nomor,
      nomor,
      segmen: ['simpatisan'],
    });
    kontak = hasil.kontak;
  }

  const pesan = {
    id: id('m_'),
    perangkatId: perangkatId || null,
    nomor,
    nama: kontak.nama,
    kontakId: kontak.id,
    isi: { teks },
    arah: 'masuk',
    status: 'masuk',
    dibuat: sekarang(),
    sumber: 'mandiri',
  };
  await db.simpan(KUNCI_PESAN(pesan.id), pesan);
  await catatKeDaftar(pesan.id);
  await db.tambahKeHimpunan(`percakapan:${nomor}`, pesan.id);
  await kirimKejadian('masuk', pesan, setelan);

  /* "Berhenti" dihormati lebih dulu dari aturan balasan mana pun. Donatur yang
     minta berhenti tetapi tetap dibalas otomatis adalah cara tercepat membuat
     nomor lembaga dilaporkan. */
  const bersih = teks.trim().toLowerCase();
  if (['berhenti', 'stop', 'unsubscribe'].includes(bersih)) {
    kontak.langganan = false;
    kontak.diubah = sekarang();
    await db.simpan(kontakLib.KUNCI(kontak.id), kontak);
    return { pesanId: pesan.id, berhenti: true, balas: '' };
  }

  const balasan = await cariBalasan(teks, { nama: kontak.anonim ? 'Bapak/Ibu' : kontak.nama });
  /* Balasan dikembalikan langsung ke gateway, bukan diantrekan, supaya
     percakapan terasa seketika dan tidak menunggu putaran cron berikutnya. */
  return { pesanId: pesan.id, balas: balasan ? balasan.balasan : '', tindakan: balasan ? balasan.tindakan : '' };
}

/* --- berkas: isi lampiran, ditarik sekali lalu disimpan gateway ---------- */
async function berkas({ data }) {
  const berkasId = bersihkanTeks(data.berkasId || '', 60);
  if (!berkasId) throw Object.assign(new Error('berkasId wajib diisi'), { kode: 400 });
  const b = await berkasLib.ambilIsi(berkasId);
  if (!b) throw Object.assign(new Error('Lampiran tidak ditemukan atau sudah kedaluwarsa'), { kode: 404 });
  return { berkas: b };
}

/* --- lapor-status: centang sampai dan dibaca dari WhatsApp --------------- */
async function laporStatus({ data }) {
  const daftar = Array.isArray(data.hasil) ? data.hasil.slice(0, 200) : [];
  if (!daftar.length) return { diproses: 0 };

  const setelan = await ambilSetelan();
  let naik = 0, diabaikan = 0;
  for (const h of daftar) {
    const idLuar = bersihkanTeks(h.idLuar || '', 120);
    const status = ['sampai', 'dibaca'].includes(h.status) ? h.status : '';
    if (!idLuar || !status) { diabaikan++; continue; }

    const pesanId = await db.ambil(KUNCI_LUAR(idLuar));
    if (!pesanId) { diabaikan++; continue; }
    const pesan = await db.ambil(KUNCI_PESAN(pesanId));
    if (!pesan) { diabaikan++; continue; }

    if ((URUTAN[status] || 0) <= (URUTAN[pesan.status] || 0)) { diabaikan++; continue; }
    pesan.status = status;
    pesan[status] = sekarang();
    await db.simpan(KUNCI_PESAN(pesan.id), pesan);
    await kirimKejadian(status, pesan, setelan);
    naik++;
  }
  return { diproses: daftar.length, naik, diabaikan };
}

const TINDAKAN = { halo, 'lapor-perangkat': laporPerangkat, ambil, lapor, masuk, berkas, 'lapor-status': laporStatus };

module.exports = async function penangan(req, res) {
  if (req.method !== 'POST') return gagal(res, 405, 'Gunakan metode POST');

  const sah = tokenSah(req);
  if (!sah.ok) {
    if (sah.alasan === 'belum-disetel') {
      return gagal(res, 503, 'BLAST_AGEN_TOKEN belum disetel di server, jadi gateway belum bisa disambungkan.');
    }
    return gagal(res, 401, 'Token agen tidak cocok');
  }

  try {
    const badan = await bacaBody(req);
    const fn = TINDAKAN[String(badan.tindakan || '')];
    if (!fn) return gagal(res, 400, `Tindakan "${badan.tindakan}" tidak dikenal`);
    const hasil = await fn({ data: badan.data || {}, req });
    return sukses(res, hasil);
  } catch (e) {
    const kode = e.kode || 500;
    if (kode >= 500) console.error('[blast-agen] gagal:', e);
    return gagal(res, kode, e.message || 'Galat tak terduga');
  }
};
