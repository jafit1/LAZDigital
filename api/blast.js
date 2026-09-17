// api/rpc.js — satu pintu untuk seluruh tindakan aplikasi
//
// Bentuk permintaan : POST { tindakan: 'kontak.daftar', data: {...} }
// Bentuk balasan    : { ok: true, ... } atau { ok: false, pesan: '...' }
//
// Hak akses diperiksa di SINI (server), bukan di tampilan.

const db = require('../lib/blast/db');
const util = require('../lib/blast/util');
const auth = require('../lib/blast/auth');
const { PERAN, punyaIzin, kantorTerkunci, IZIN } = require('../lib/blast/peran');
const setelanLib = require('../lib/blast/setelan');
const kontakLib = require('../lib/blast/kontak');
const berkasLib = require('../lib/blast/berkas');
const antreanLib = require('../lib/blast/antrean');
const webhookLib = require('../lib/blast/webhook');
const { pilihDriver, DRIVER } = require('../lib/blast/pengirim');
const { siapkanAwal, sudahSiap } = require('../lib/blast/siap');

const { sukses, gagal, bacaBody, GalatAplikasi, id, sekarang, isiPlaceholder, normalkanNomor } = util;

// ---------------------------------------------------------------- tindakan
const tindakan = {};

/* Daftar izin yang dikirim ke tampilan hanya untuk menyembunyikan menu.
   Yang menentukan boleh-tidaknya tetap pemeriksaan di server (wajibIzin).
   Setelah digabung, daftarnya disaring ulang lewat izin LAZDigital supaya
   menu yang muncul benar-benar sesuai centang akunnya. */
function izinTampil(pengguna) {
  if (!pengguna) return [];
  if (!pengguna._laz) return IZIN[pengguna.peran] || [];
  /* Setelah digabung, menu TIDAK boleh diturunkan dari peran tebakan: peran
     "penyelia" misalnya tidak memuat setelan.ubah, sehingga akun yang memang
     dicentang "ubah" kehilangan menunya padahal server mengizinkan. Jadi
     kandidatnya seluruh izin yang dikenal, lalu disaring izin sungguhan. */
  const semua = new Set(Object.keys(require('../lib/blast/sesi-laz').PETA_IZIN));
  Object.keys(IZIN).forEach(function (p) {
    (IZIN[p] || []).forEach(function (i) { if (i !== '*') semua.add(i); });
  });
  return Array.from(semua).filter(function (i) { return punyaIzin(pengguna, i); });
}

/* SIAPA BOLEH MEMBUKA WEBHOOK DAN CATATAN AUDIT.
 *
 * Dulu keduanya dikunci mati untuk superadmin saja. Itu benar sebagai bawaan
 * — isinya alamat webhook, rahasia tanda tangannya, dan catatan siapa
 * mengirim apa ke nomor siapa — tetapi terlalu kaku: ada penyelia yang memang
 * perlu melihat audit tanpa harus diberi akun superadmin, dan memberi akun
 * superadmin "supaya bisa lihat audit" adalah cara paling umum hak akses
 * melar diam-diam.
 *
 * Sekarang superadmin selalu boleh, dan selain itu bisa diberikan satu per
 * satu. Daftarnya disimpan di setelan, bukan diturunkan dari peran — peran
 * berubah karena alasan lain, dan akses ke rahasia tidak boleh ikut berubah
 * sebagai efek samping.
 */
async function bolehKhusus(pengguna, bagian) {
  if (!pengguna) return false;
  if (pengguna.peran === 'superadmin') return true;
  const setelan = await setelanLib.ambilSetelan();
  const daftar = ((setelan.aksesKhusus || {})[bagian]) || [];
  return daftar.map(String).includes(String(pengguna.id));
}

// Dorongan sekali jalan setelah pesan diantrekan, supaya pengiriman kecil
// terasa langsung tanpa menunggu cron. Kegagalannya tidak boleh menggagalkan
// permintaan — antrean tetap akan disapu cron berikutnya.
async function dorongAntrean() {
  try { await antreanLib.prosesAntrean(2500); } catch (e) { console.error('[dorong]', e.message); }
}

// --- Sistem ---------------------------------------------------------------
tindakan['sistem.status'] = { publik: true, async jalankan({ req }) {
  const siap = await sudahSiap();
  if (!siap) await siapkanAwal(); // penyiapan otomatis saat pertama dibuka
  const setelan = await setelanLib.ambilSetelan();
  const pengguna = await auth.penggunaDariPermintaan(req);
  return {
    siap: true,
    penyimpanan: db.pakaiUpstash ? 'Upstash Redis' : 'Berkas lokal (.data/blast.json)',
    driver: setelan.pengirim.driver,
    lembaga: setelan.lembaga,
    masuk: Boolean(pengguna),
    pengguna: pengguna ? auth.pengunaTampil(pengguna) : null,
    izin: pengguna ? izinTampil(pengguna) : [],
    /* Menu Webhook dan Catatan Audit disembunyikan berdasarkan ini, bukan
       berdasarkan peran. Yang menegakkan tetap server; ini supaya tampilan
       tidak menawarkan pintu yang akan ditolak. */
    akses: pengguna
      ? { webhook: await bolehKhusus(pengguna, 'webhook'), audit: await bolehKhusus(pengguna, 'audit') }
      : { webhook: false, audit: false },
  };
} };

// --- Autentikasi ----------------------------------------------------------
// DIGABUNG KE LAZDIGITAL: masuk, keluar, dan ganti sandi adalah urusan
// LAZDigital. Tindakannya sengaja TIDAK sekadar dihapus, melainkan dijawab
// dengan penjelasan — kalau dihapus begitu saja, tampilan lama yang masih
// memanggilnya hanya dapat "Tindakan tidak dikenal" dan orang mengira rusak.
function urusanLazdigital(apa) {
  return { publik: true, async jalankan() {
    throw new GalatAplikasi(apa + ' dilakukan di LAZDigital, bukan di sini.', 400);
  } };
}
tindakan['auth.masuk'] = urusanLazdigital('Masuk');
tindakan['auth.keluar'] = urusanLazdigital('Keluar');
tindakan['auth.gantiSandi'] = urusanLazdigital('Ganti sandi');

tindakan['auth.saya'] = { async jalankan({ pengguna }) {
  return {
    pengguna: auth.pengunaTampil(pengguna),
    izin: izinTampil(pengguna),
    akses: { webhook: await bolehKhusus(pengguna, 'webhook'), audit: await bolehKhusus(pengguna, 'audit') },
  };
} };

// --- Dasbor ---------------------------------------------------------------
tindakan['dasbor.ringkas'] = { izin: 'dasbor', async jalankan({ pengguna }) {
  const kunciKantor = kantorTerkunci(pengguna);
  const [idPesan, perangkatId, setelan, antrean] = await Promise.all([
    db.ambil('pesan:baru'),
    db.anggotaHimpunan('perangkat:daftar'),
    setelanLib.ambilSetelan(),
    antreanLib.ringkasAntrean(),
  ]);

  const pesan = (await db.ambilBanyak((idPesan || []).slice(0, 500).map(antreanLib.KUNCI_PESAN))).filter(Boolean);
  const perangkat = (await db.ambilBanyak(perangkatId.map((i) => `perangkat:${i}`))).filter(Boolean);

  const { tanggal } = util.waktuLokal();
  const hariIni = pesan.filter((p) => String(p.dibuat).slice(0, 10) === tanggal);

  const hitung = (daftar) => ({
    total: daftar.length,
    terkirim: daftar.filter((p) => ['terkirim', 'sampai', 'dibaca'].includes(p.status)).length,
    sampai: daftar.filter((p) => ['sampai', 'dibaca'].includes(p.status)).length,
    dibaca: daftar.filter((p) => p.status === 'dibaca').length,
    gagal: daftar.filter((p) => p.status === 'gagal').length,
    antre: daftar.filter((p) => p.status === 'antre').length,
  });

  // Grafik 14 hari terakhir
  const grafik = [];
  for (let i = 13; i >= 0; i--) {
    const t = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const hari = pesan.filter((p) => String(p.dibuat).slice(0, 10) === t);
    grafik.push({ tanggal: t, total: hari.length, terkirim: hitung(hari).terkirim, gagal: hitung(hari).gagal });
  }

  const kontak = await kontakLib.daftarKontak({ perHalaman: 1, kantorTerkunci: kunciKantor });

  return {
    hariIni: hitung(hariIni),
    keseluruhan: hitung(pesan),
    balasan: hitungBalasan(pesan),
    grafik,
    antrean,
    kontak: { total: kontak.total },
    perangkat: perangkat.map((d) => ({
      id: d.id, nama: d.nama, nomor: d.nomor, status: d.status, driver: d.driver,
    })),
    /* Tidak ada lagi ringkasan biaya. Gateway sendiri tidak menagih per pesan,
       jadi angkanya selalu nol dan hanya menyita satu kotak di dasbor. */
  };
} };

/* BERAPA YANG MEMBALAS.
 *
 * "Dibaca" hanya berarti pesannya dibuka. Yang sebenarnya ingin diketahui amil
 * adalah berapa orang yang MENJAWAB — itulah ukuran apakah ajakannya mengena,
 * dan itu tidak sama dengan centang biru.
 *
 * Yang dihitung: nomor yang mengirim pesan masuk SESUDAH kita mengirimi mereka.
 * Syarat "sesudah" itu penting. Tanpa itu, donatur yang kebetulan bertanya
 * kemarin akan terhitung sebagai membalas kiriman hari ini, dan angkanya
 * memuji kampanye yang sebenarnya tidak dijawab siapa pun.
 *
 * Satu nomor dihitung sekali walau membalas lima kali — yang ditanya berapa
 * ORANG yang menjawab, bukan berapa pesan yang masuk.
 */
function hitungBalasan(pesan) {
  const keluarPada = new Map();   // nomor -> waktu kirim paling awal
  for (const p of pesan) {
    if (p.arah === 'masuk') continue;
    const t = new Date(p.dikirim || p.diserahkanPada || p.dibuat).getTime();
    if (!Number.isFinite(t)) continue;
    const ada = keluarPada.get(p.nomor);
    if (ada === undefined || t < ada) keluarPada.set(p.nomor, t);
  }

  const membalas = new Set();
  const membalasMassal = new Set();
  const nomorMassal = new Set(pesan.filter((p) => p.massalId && p.arah !== 'masuk').map((p) => p.nomor));

  for (const p of pesan) {
    if (p.arah !== 'masuk') continue;
    const dikirimPada = keluarPada.get(p.nomor);
    if (dikirimPada === undefined) continue;
    const masukPada = new Date(p.dibuat).getTime();
    if (!Number.isFinite(masukPada) || masukPada < dikirimPada) continue;
    membalas.add(p.nomor);
    if (nomorMassal.has(p.nomor)) membalasMassal.add(p.nomor);
  }

  const dikirimi = keluarPada.size;
  return {
    dikirimi,
    membalas: membalas.size,
    persen: dikirimi ? Math.round((membalas.size / dikirimi) * 100) : 0,
    dikirimiMassal: nomorMassal.size,
    membalasMassal: membalasMassal.size,
    persenMassal: nomorMassal.size ? Math.round((membalasMassal.size / nomorMassal.size) * 100) : 0,
  };
}

// --- Perangkat ------------------------------------------------------------
tindakan['perangkat.daftar'] = { izin: 'perangkat.lihat', async jalankan({ pengguna }) {
  const idDaftar = await db.anggotaHimpunan('perangkat:daftar');
  const isi = (await db.ambilBanyak(idDaftar.map((i) => `perangkat:${i}`))).filter(Boolean);
  const bolehUbah = punyaIzin(pengguna, 'perangkat.ubah');
  const baris = await Promise.all(isi.map(async (d) => ({
    ...d,
    token: bolehUbah && d.token ? '••••••••' : '',
    terpakaiHariIni: await antreanLib.hitungHarian(d.id),
  })));
  baris.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
  return { baris, driver: Object.values(DRIVER).map((d) => ({ nama: d.nama, label: d.label, butuhKredensial: d.butuhKredensial })) };
} };

tindakan['perangkat.simpan'] = { izin: 'perangkat.ubah', async jalankan({ data, pengguna, req }) {
  const { bersih, galat } = util.periksaSkema(data, {
    nama: { wajib: true, label: 'Nama perangkat', maks: 80 },
    nomor: { label: 'Nomor', maks: 25 },
    keterangan: { label: 'Keterangan', maks: 200 },
    driver: { label: 'Pengirim', pilihan: Object.keys(DRIVER), bawaan: 'sandbox' },
    token: { label: 'Token', maks: 500 },
    nomorId: { label: 'Phone Number ID', maks: 80 },
  });
  if (galat.length) throw new GalatAplikasi(galat.join('. '));

  let perangkat = data.id ? await db.ambil(`perangkat:${data.id}`) : null;
  if (data.id && !perangkat) throw new GalatAplikasi('Perangkat tidak ditemukan', 404);

  const baru = !perangkat;
  perangkat = Object.assign(
    { id: id('d_'), status: 'terputus', aktif: true, dibuat: sekarang(), bolehKirimSetelah: 0 },
    perangkat || {},
    {
      nama: bersih.nama,
      nomor: bersih.nomor ? normalkanNomor(bersih.nomor) : (perangkat ? perangkat.nomor : ''),
      keterangan: bersih.keterangan || '',
      driver: bersih.driver,
      nomorId: bersih.nomorId || (perangkat ? perangkat.nomorId : ''),
      diubah: sekarang(),
    }
  );
  // Token hanya ditimpa bila benar-benar diisi baru (bukan tanda bintang)
  if (bersih.token && !/^•+$/.test(bersih.token)) perangkat.token = bersih.token;
  if (data.aktif !== undefined) perangkat.aktif = Boolean(data.aktif);

  await db.simpan(`perangkat:${perangkat.id}`, perangkat);
  await db.tambahKeHimpunan('perangkat:daftar', perangkat.id);
  await auth.catatAudit(pengguna, baru ? 'perangkat.tambah' : 'perangkat.ubah', { id: perangkat.id, nama: perangkat.nama }, req);
  return { perangkat: { ...perangkat, token: perangkat.token ? '••••••••' : '' } };
} };

tindakan['perangkat.hapus'] = { izin: 'perangkat.ubah', async jalankan({ data, pengguna, req }) {
  const perangkat = await db.ambil(`perangkat:${data.id}`);
  if (!perangkat) throw new GalatAplikasi('Perangkat tidak ditemukan', 404);
  await db.hapus(`perangkat:${data.id}`);
  await db.keluarDariHimpunan('perangkat:daftar', data.id);
  await auth.catatAudit(pengguna, 'perangkat.hapus', { id: data.id, nama: perangkat.nama }, req);
  return { pesan: `Perangkat "${perangkat.nama}" dihapus.` };
} };

tindakan['perangkat.sambung'] = { izin: 'perangkat.ubah', async jalankan({ data, pengguna, req }) {
  const perangkat = await db.ambil(`perangkat:${data.id}`);
  if (!perangkat) throw new GalatAplikasi('Perangkat tidak ditemukan', 404);
  const setelan = await setelanLib.ambilSetelan();
  const driver = pilihDriver(setelan, perangkat);
  const hasil = await driver.sambungkan(perangkat, setelan);
  perangkat.status = hasil.status;
  if (hasil.nomor) perangkat.nomor = hasil.nomor;
  perangkat.qrTerakhir = hasil.qr || '';
  perangkat.diubah = sekarang();
  await db.simpan(`perangkat:${perangkat.id}`, perangkat);
  await webhookLib.kirimKejadian(hasil.status === 'tersambung' ? 'tersambung' : 'qr', { id: perangkat.id, nomor: perangkat.nomor, status: hasil.status, perangkatId: perangkat.id });
  await auth.catatAudit(pengguna, 'perangkat.sambung', { id: perangkat.id }, req);
  return { status: hasil.status, qr: hasil.qr, keterangan: hasil.keterangan };
} };

tindakan['perangkat.putus'] = { izin: 'perangkat.ubah', async jalankan({ data, pengguna, req }) {
  const perangkat = await db.ambil(`perangkat:${data.id}`);
  if (!perangkat) throw new GalatAplikasi('Perangkat tidak ditemukan', 404);
  const setelan = await setelanLib.ambilSetelan();
  const driver = pilihDriver(setelan, perangkat);
  await driver.putuskan(perangkat, setelan);
  perangkat.status = 'terputus';
  await db.simpan(`perangkat:${perangkat.id}`, perangkat);
  await webhookLib.kirimKejadian('terputus', { id: perangkat.id, perangkatId: perangkat.id, status: 'terputus' });
  await auth.catatAudit(pengguna, 'perangkat.putus', { id: perangkat.id }, req);
  return { status: 'terputus' };
} };

tindakan['perangkat.gantiNomor'] = { izin: 'perangkat.ubah', async jalankan({ data, pengguna, req }) {
  const perangkat = await db.ambil(`perangkat:${data.id}`);
  if (!perangkat) throw new GalatAplikasi('Perangkat tidak ditemukan', 404);
  const setelan = await setelanLib.ambilSetelan();
  const driver = pilihDriver(setelan, perangkat);
  if (typeof driver.gantiNomor !== 'function') {
    throw new GalatAplikasi(`Pengirim "${driver.nama}" tidak mendukung ganti nomor dari sini.`);
  }
  const hasil = await driver.gantiNomor(perangkat, setelan);
  perangkat.status = hasil.status;
  perangkat.nomor = '';          // nomor lama tidak berlaku lagi
  perangkat.qrTerakhir = '';
  perangkat.diubah = sekarang();
  await db.simpan(`perangkat:${perangkat.id}`, perangkat);
  await auth.catatAudit(pengguna, 'perangkat.gantiNomor', { id: perangkat.id }, req);
  return { status: hasil.status, keterangan: hasil.keterangan };
} };

tindakan['perangkat.periksa'] = { izin: 'perangkat.lihat', async jalankan({ data }) {
  const perangkat = await db.ambil(`perangkat:${data.id}`);
  if (!perangkat) throw new GalatAplikasi('Perangkat tidak ditemukan', 404);
  const setelan = await setelanLib.ambilSetelan();
  const driver = pilihDriver(setelan, perangkat);
  const hasil = await driver.periksa(perangkat, setelan);
  if (hasil.status && hasil.status !== perangkat.status) {
    perangkat.status = hasil.status;
    await db.simpan(`perangkat:${perangkat.id}`, perangkat);
  }
  return hasil;
} };

// --- Kontak ---------------------------------------------------------------
tindakan['kontak.daftar'] = { izin: 'kontak.lihat', async jalankan({ data, pengguna }) {
  const hasil = await kontakLib.daftarKontak({
    cari: util.bersihkanTeks(data.cari, 80),
    segmen: util.bersihkanTeks(data.segmen, 40),
    grup: util.bersihkanTeks(data.grup || data.label, 40),
    halaman: Number(data.halaman) || 1,
    perHalaman: Math.min(100, Number(data.perHalaman) || 25),
    kantorTerkunci: kantorTerkunci(pengguna),
  });
  return { ...hasil, segmen: kontakLib.SEGMEN, grup: await kontakLib.daftarGrup() };
} };

/* Dipakai pemilih penerima di halaman Kirim Pesan dan Kiriman Massal. Berbeda
   dari kontak.daftar yang berhalaman: pemilih perlu SELURUH kontak sekaligus
   supaya pencarian di dalam dropdown terasa seketika, jadi medannya dipangkas
   seperlunya — daftar lengkap dengan catatan dan alamat bisa ratusan kilobita. */
tindakan['kontak.pilihan'] = { izin: 'kontak.lihat', async jalankan({ pengguna }) {
  const kunci = kantorTerkunci(pengguna);
  let isi = await kontakLib.semuaKontak();
  if (kunci) isi = isi.filter((k) => (k.kantor || '') === kunci);
  isi.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
  return {
    baris: isi.map((k) => ({
      id: k.id, nama: k.nama, nomor: k.nomor, kantor: k.kantor || '',
      grup: k.label || [], segmen: k.segmen || [],
      /* Kontak yang diblokir tetap DIKIRIM ke tampilan, tidak disembunyikan:
         petugas yang mencari "Budi" dan tidak menemukannya akan menyangka
         kontaknya belum ada lalu membuat kembarannya. Yang benar adalah ia
         terlihat, tetapi tidak bisa dicentang, dengan alasannya tertulis. */
      diblokir: kontakLib.diblokir(k),
    })),
    grup: await kontakLib.daftarGrup(),
    segmen: kontakLib.SEGMEN,
  };
} };

// --- Grup kontak ----------------------------------------------------------
tindakan['grup.daftar'] = { izin: 'kontak.lihat', async jalankan() {
  return { baris: await kontakLib.daftarGrup() };
} };

tindakan['grup.atur'] = { izin: 'kontak.ubah', async jalankan({ data, pengguna, req }) {
  const hasil = await kontakLib.aturGrupKontak(
    Array.isArray(data.kontakId) ? data.kontakId : [data.kontakId],
    data.grup,
    data.masuk !== false);
  await auth.catatAudit(pengguna, 'grup.atur', hasil, req);
  return { ...hasil, baris: await kontakLib.daftarGrup() };
} };

tindakan['grup.ubahNama'] = { izin: 'kontak.ubah', async jalankan({ data, pengguna, req }) {
  const hasil = await kontakLib.ubahNamaGrup(data.lama, data.baru);
  await auth.catatAudit(pengguna, 'grup.ubahNama', { ...hasil, dari: data.lama }, req);
  return { ...hasil, baris: await kontakLib.daftarGrup() };
} };

tindakan['grup.hapus'] = { izin: 'kontak.ubah', async jalankan({ data, pengguna, req }) {
  const hasil = await kontakLib.hapusGrup(data.grup);
  await auth.catatAudit(pengguna, 'grup.hapus', hasil, req);
  return { ...hasil, baris: await kontakLib.daftarGrup() };
} };

tindakan['kontak.simpan'] = { izin: 'kontak.ubah', async jalankan({ data, pengguna, req }) {
  const kunci = kantorTerkunci(pengguna);
  if (kunci) data.kantor = kunci; // pengurus KLL hanya boleh menulis untuk kantornya
  const { kontak, baru } = await kontakLib.simpanKontak(data, pengguna);
  await auth.catatAudit(pengguna, baru ? 'kontak.tambah' : 'kontak.ubah', { id: kontak.id, nomor: kontak.nomor }, req);
  return { kontak, baru };
} };

tindakan['kontak.hapus'] = { izin: 'kontak.ubah', async jalankan({ data, pengguna, req }) {
  const kontak = await db.ambil(kontakLib.KUNCI(data.id));
  if (!kontak) throw new GalatAplikasi('Kontak tidak ditemukan', 404);
  const kunci = kantorTerkunci(pengguna);
  if (kunci && kontak.kantor !== kunci) throw new GalatAplikasi('Kontak ini bukan milik kantor Anda', 403);
  await kontakLib.hapusKontak(data.id);
  await auth.catatAudit(pengguna, 'kontak.hapus', { id: data.id, nomor: kontak.nomor }, req);
  return { pesan: 'Kontak dihapus.' };
} };

/* Satu saklar, bukan dua. "Berlangganan" dan "daftar hitam" dulu berdiri
   sendiri-sendiri dan artinya bertumpang tindih; sekarang keduanya digerakkan
   bersama supaya tidak mungkin lagi ada kontak yang aktif menurut saklar yang
   satu dan diblokir menurut saklar yang lain. */
tindakan['kontak.ubahBlokir'] = { izin: 'kontak.ubah', async jalankan({ data, pengguna, req }) {
  const kontak = await db.ambil(kontakLib.KUNCI(data.id));
  if (!kontak) throw new GalatAplikasi('Kontak tidak ditemukan', 404);
  const blokir = data.diblokir !== undefined ? Boolean(data.diblokir)
    : data.daftarHitam !== undefined ? Boolean(data.daftarHitam)
    : !kontakLib.diblokir(kontak);
  kontak.daftarHitam = blokir;
  kontak.langganan = !blokir;
  kontak.diubah = sekarang();
  await db.simpan(kontakLib.KUNCI(kontak.id), kontak);
  await auth.catatAudit(pengguna, 'kontak.blokir', { id: kontak.id, diblokir: blokir }, req);
  return { kontak, diblokir: blokir };
} };
tindakan['kontak.ubahLangganan'] = tindakan['kontak.ubahBlokir']; // nama lama

tindakan['kontak.impor'] = { izin: 'kontak.impor', async jalankan({ data, pengguna, req }) {
  const teks = String(data.teks || '');
  if (!teks.trim()) throw new GalatAplikasi('Tidak ada data untuk diimpor');
  if (teks.length > 2 * 1024 * 1024) throw new GalatAplikasi('Data terlalu besar, bagi menjadi beberapa bagian');
  const hasil = await kontakLib.imporKontak(teks, pengguna);
  await auth.catatAudit(pengguna, 'kontak.impor', hasil, req);
  return { hasil };
} };

tindakan['kontak.ekspor'] = { izin: 'kontak.lihat', async jalankan({ pengguna }) {
  const kunci = kantorTerkunci(pengguna);
  let isi = await kontakLib.semuaKontak();
  if (kunci) isi = isi.filter((k) => k.kantor === kunci);
  return { csv: kontakLib.keCsv(isi), jumlah: isi.length };
} };

// --- Templat pesan --------------------------------------------------------
tindakan['templat.daftar'] = { izin: 'pesan.lihat', async jalankan() {
  return { baris: (await db.ambil('templat')) || [] };
} };

tindakan['templat.simpan'] = { izin: 'pesan.kirim', async jalankan({ data, pengguna, req }) {
  const { bersih, galat } = util.periksaSkema(data, {
    nama: { wajib: true, label: 'Nama templat', maks: 100 },
    isi: { wajib: true, label: 'Isi pesan', maks: 4000 },
  });
  if (galat.length) throw new GalatAplikasi(galat.join('. '));

  /* Lampiran templat dibebaskan dari umur tujuh hari. Templat dipanggil lagi
     berbulan-bulan kemudian — brosur zakat fitrah tiap Ramadan — dan lampiran
     yang diam-diam kedaluwarsa menghasilkan kegagalan yang paling sulit
     dimengerti: templatnya ada, isinya benar, berkasnya tidak pernah sampai. */
  let berkas = {};
  if (data.berkasId) {
    const abadi = await berkasLib.jadikanAbadi(data.berkasId);
    if (!abadi) throw new GalatAplikasi('Lampirannya tidak ditemukan lagi. Unggah ulang berkasnya, lalu simpan.', 404);
    berkas = await lampiran(data.berkasId);
  }
  const bersihkanBerkas = data.hapusBerkas === true || data.berkasId === '';

  const daftar = (await db.ambil('templat')) || [];
  if (data.id) {
    const i = daftar.findIndex((t) => t.id === data.id);
    if (i === -1) throw new GalatAplikasi('Templat tidak ditemukan', 404);
    /* Medannya harus ditulis KOSONG, bukan sekadar tidak disebut: templat yang
       lama disalin utuh dengan sebaran di bawah, jadi medan yang dilewati akan
       ikut terbawa dan lampiran yang "dilepas" tetap menempel. */
    const lamaBerkas = bersihkanBerkas
      ? { berkasId: '', namaBerkas: '', tipeBerkas: '', jenisBerkas: '' }
      : {
        berkasId: daftar[i].berkasId || '', namaBerkas: daftar[i].namaBerkas || '',
        tipeBerkas: daftar[i].tipeBerkas || '', jenisBerkas: daftar[i].jenisBerkas || '',
      };
    daftar[i] = { ...daftar[i], ...bersih, ...lamaBerkas, ...berkas, diubah: sekarang() };
  } else {
    daftar.unshift({ id: id('t_'), ...bersih, ...berkas, dibuat: sekarang() });
  }
  await db.simpan('templat', daftar.slice(0, 200));
  await auth.catatAudit(pengguna, 'templat.simpan', { nama: bersih.nama }, req);
  return { baris: daftar };
} };

tindakan['templat.hapus'] = { izin: 'pesan.kirim', async jalankan({ data }) {
  const daftar = ((await db.ambil('templat')) || []).filter((t) => t.id !== data.id);
  await db.simpan('templat', daftar);
  return { baris: daftar };
} };

// --- Pesan ----------------------------------------------------------------
/* Lampiran disebut lewat id, bukan disalin ke tiap pesan: satu PDF untuk
   lima ratus penerima cukup disimpan sekali, dan gateway pun menariknya sekali
   lalu memakainya berulang. */
async function lampiran(berkasId) {
  if (!berkasId) return {};
  const b = await berkasLib.ambilKeterangan(berkasId);
  if (!b) throw new GalatAplikasi('Lampiran tidak ditemukan atau sudah kedaluwarsa. Unggah ulang berkasnya.', 404);
  return { berkasId: b.id, namaBerkas: b.nama, tipeBerkas: b.tipe, jenisBerkas: b.jenis };
}

tindakan['berkas.unggah'] = { izin: 'pesan.kirim', async jalankan({ data }) {
  const berkas = await berkasLib.simpanBerkas({
    nama: data.nama, tipe: data.tipe, base64: data.base64,
  });
  /* base64-nya tidak dikembalikan: tampilan sudah memegang berkasnya sendiri,
     dan memantulkannya balik hanya menggandakan lalu lintas beberapa megabita. */
  return { berkas };
} };

/* PENERIMA DISEBUT LEWAT kontakId, BUKAN NOMOR MENTAH.
 *
 * Penanda {{nama}} hanya bisa terisi kalau namanya ada di suatu tempat, dan
 * satu-satunya tempat itu adalah kontak. Selama nomor boleh diketik bebas,
 * separuh kiriman berakhir dengan sapaan "Bapak/Ibu" tanpa ada yang menyadari
 * kenapa — penandanya terlihat bekerja, hanya saja datanya tidak ada.
 *
 * Boleh lebih dari satu penerima: satu pengumuman ke lima pengurus adalah
 * pekerjaan sehari-hari, dan memaksanya lewat Kiriman Massal berarti membuat
 * kampanye bernama untuk sesuatu yang bukan kampanye.
 */
tindakan['pesan.kirim'] = { izin: 'pesan.kirim', async jalankan({ data, pengguna, req }) {
  const { bersih, galat } = util.periksaSkema(data, {
    perangkatId: { wajib: true, label: 'Perangkat pengirim', maks: 60 },
    teks: { wajib: true, label: 'Isi pesan', maks: 4000 },
    berkasUrl: { label: 'Tautan berkas', maks: 500 },
    namaBerkas: { label: 'Nama berkas', maks: 120 },
    berkasId: { label: 'Lampiran', maks: 60 },
  });
  if (galat.length) throw new GalatAplikasi(galat.join('. '));

  const perangkat = await db.ambil(`perangkat:${bersih.perangkatId}`);
  if (!perangkat) throw new GalatAplikasi('Perangkat pengirim tidak ditemukan', 404);

  const daftarId = Array.isArray(data.kontakId) ? data.kontakId
    : data.kontakId ? [data.kontakId] : [];
  const idUnik = Array.from(new Set(daftarId.map((i) => String(i || '').trim()).filter(Boolean)));
  if (!idUnik.length) {
    throw new GalatAplikasi('Pilih dulu minimal satu kontak penerima. Nomor yang belum tersimpan harus disimpan sebagai kontak lebih dulu, supaya namanya bisa dipakai di pesan.');
  }
  if (idUnik.length > 50) {
    throw new GalatAplikasi('Lebih dari 50 penerima sebaiknya lewat Kiriman Massal, supaya jalannya bisa dipantau dan dihentikan.');
  }

  const kunciKantor = kantorTerkunci(pengguna);
  const berkasSatu = await lampiran(bersih.berkasId);
  const terkirim = [];
  const dilewati = [];

  for (const kid of idUnik) {
    const kontak = await db.ambil(kontakLib.KUNCI(kid));
    if (!kontak) { dilewati.push('satu kontak sudah terhapus'); continue; }
    if (kunciKantor && (kontak.kantor || '') !== kunciKantor) {
      dilewati.push(`${kontak.nama} (bukan kantor Anda)`); continue;
    }
    if (kontakLib.diblokir(kontak)) { dilewati.push(`${kontak.nama} (diblokir)`); continue; }
    if (!util.nomorValid(kontak.nomor)) { dilewati.push(`${kontak.nama} (nomornya tidak sah)`); continue; }

    const pesan = await antreanLib.antrikan({
      perangkatId: perangkat.id,
      nomor: kontak.nomor,
      nama: kontak.nama,
      kontakId: kontak.id,
      isi: {
        teks: isiPlaceholder(bersih.teks, {
          nama: kontak.anonim ? 'Bapak/Ibu' : (kontak.nama || 'Bapak/Ibu'),
          kantor: kontak.kantor || '',
          lembaga: 'LAZISMU Bantul',
        }),
        berkasUrl: bersih.berkasUrl,
        namaBerkas: bersih.namaBerkas,
        ...berkasSatu,
      },
      prioritas: 2, // pesan bernama penerima didahulukan atas kiriman massal
      jadwal: data.jadwal || undefined,
      oleh: pengguna.id,
    });
    terkirim.push(pesan);
  }

  if (!terkirim.length) {
    throw new GalatAplikasi('Tidak ada penerima yang bisa dikirimi: ' + dilewati.join(', '));
  }

  await auth.catatAudit(pengguna, 'pesan.kirim', { jumlah: terkirim.length, pesanId: terkirim.map((p) => p.id).slice(0, 20) }, req);
  await dorongAntrean();

  /* Yang dilewati disebut apa adanya. Melaporkan "5 pesan masuk antrean" saat
     dua di antaranya diblokir akan membuat petugas menunggu balasan yang tidak
     akan pernah datang. */
  const catatan = `${terkirim.length} pesan masuk antrean dan dikirim mengikuti jeda aman.`
    + (dilewati.length ? ` ${dilewati.length} dilewati: ${dilewati.join(', ')}.` : '');
  return { pesan: terkirim[0], jumlah: terkirim.length, dilewati, catatan };
} };

tindakan['pesan.daftar'] = { izin: 'pesan.lihat', async jalankan({ data, pengguna }) {
  const idDaftar = ((await db.ambil('pesan:baru')) || []).slice(0, 1000);
  let isi = (await db.ambilBanyak(idDaftar.map(antreanLib.KUNCI_PESAN))).filter(Boolean);

  const kunci = kantorTerkunci(pengguna);
  if (kunci) {
    const kontakKantor = (await kontakLib.semuaKontak()).filter((k) => k.kantor === kunci).map((k) => k.nomor);
    const set = new Set(kontakKantor);
    isi = isi.filter((p) => set.has(p.nomor));
  }

  if (data.status) isi = isi.filter((p) => p.status === data.status);
  if (data.perangkatId) isi = isi.filter((p) => p.perangkatId === data.perangkatId);
  if (data.cari) {
    const q = String(data.cari).toLowerCase();
    isi = isi.filter((p) => util.nomorCocok(p.nomor, data.cari) ||
      String(p.nama).toLowerCase().includes(q) ||
      String(p.isi.teks).toLowerCase().includes(q));
  }

  const perHalaman = Math.min(100, Number(data.perHalaman) || 25);
  const halaman = Math.max(1, Number(data.halaman) || 1);
  return {
    total: isi.length,
    halaman,
    perHalaman,
    baris: isi.slice((halaman - 1) * perHalaman, halaman * perHalaman),
  };
} };

tindakan['pesan.batal'] = { izin: 'pesan.kirim', async jalankan({ data, pengguna, req }) {
  const pesan = await antreanLib.batalkan(data.id);
  await auth.catatAudit(pengguna, 'pesan.batal', { pesanId: data.id }, req);
  return { pesan };
} };

/* Menghapus riwayat satu pesan. Berbeda dari "batalkan": batalkan menghentikan
   pengiriman tetapi catatannya tetap ada; hapus membuang catatannya. Pesan yang
   masih antre ikut keluar dari antrean, kalau tidak ia akan tetap terkirim
   setelah riwayatnya tidak ada lagi — dan tidak ada tempat untuk melihatnya. */
tindakan['pesan.hapus'] = { izin: 'pesan.kirim', async jalankan({ data, pengguna, req }) {
  const kunci = kantorTerkunci(pengguna);
  if (kunci) {
    const pesan = await db.ambil(antreanLib.KUNCI_PESAN(data.id));
    const kontak = pesan ? await kontakLib.cariLewatNomor(pesan.nomor) : null;
    if (!kontak || (kontak.kantor || '') !== kunci) {
      throw new GalatAplikasi('Pesan ini bukan milik kantor Anda', 403);
    }
  }
  const pesan = await antreanLib.hapusPesan(data.id);
  await auth.catatAudit(pengguna, 'pesan.hapus', { pesanId: data.id, nomor: pesan.nomor }, req);
  return { pesan: 'Riwayat pesan dihapus.' };
} };

/* Mengosongkan SELURUH riwayat pesan sekaligus — superadmin saja.
   Bukan sekadar "tombol berbahaya": riwayat pesan adalah bukti apa yang sudah
   dikirim lembaga kepada donatur, dan tidak ada tombol urung. Hak yang
   diturunkan lewat centang modul broadcast tidak cukup untuk ini. */
tindakan['pesan.hapusSemua'] = { izin: 'pesan.kirim', superadmin: true, async jalankan({ data, pengguna, req }) {
  /* Kata kunci diketik ulang, bukan sekadar menekan "Ya". Dialog konfirmasi
     ditekan tanpa dibaca; mengetik ulang tidak bisa dilakukan tanpa sadar. */
  if (String(data.tegaskan || '').trim().toUpperCase() !== 'HAPUS SEMUA') {
    throw new GalatAplikasi('Ketik HAPUS SEMUA untuk menegaskan.', 400);
  }
  const hasil = await antreanLib.hapusSemuaPesan();
  await auth.catatAudit(pengguna, 'pesan.hapusSemua', hasil, req);
  return {
    ...hasil,
    catatan: `${hasil.terhapus} riwayat pesan dihapus. Kontak, templat, dan catatan audit tidak disentuh.`
      + ' Angka pada riwayat kiriman massal ikut jadi nol karena pesannya sudah tidak ada.',
  };
} };

tindakan['pesan.ulangi'] = { izin: 'pesan.kirim', async jalankan({ data, pengguna, req }) {
  const pesan = await antreanLib.ulangi(data.id);
  await auth.catatAudit(pengguna, 'pesan.ulangi', { pesanId: data.id }, req);
  return { pesan };
} };

// --- Kiriman massal -------------------------------------------------------
tindakan['massal.kirim'] = { izin: 'massal.kelola', async jalankan({ data, pengguna, req }) {
  const { bersih, galat } = util.periksaSkema(data, {
    nama: { wajib: true, label: 'Nama kiriman', maks: 100 },
    perangkatId: { wajib: true, label: 'Perangkat pengirim', maks: 60 },
    teks: { wajib: true, label: 'Isi pesan', maks: 4000 },
    segmen: { label: 'Segmen', maks: 40 },   // bentuk lama: satu segmen sebagai teks
    berkasId: { label: 'Lampiran', maks: 60 },
  });
  if (galat.length) throw new GalatAplikasi(galat.join('. '));

  const perangkat = await db.ambil(`perangkat:${bersih.perangkatId}`);
  if (!perangkat) throw new GalatAplikasi('Perangkat pengirim tidak ditemukan', 404);

  let sasaran = await kontakLib.semuaKontak();

  /* Penerima dipilih dari GRUP dan/atau SEGMEN, keduanya boleh lebih dari satu,
     dan hasilnya gabungan — bukan irisan. Petugas yang mencentang "Pengurus
     KLL" dan "Panitia Qurban" bermaksud mengirimi keduanya; irisan akan
     menghasilkan daftar kosong atau, lebih buruk, beberapa orang saja, tanpa
     ada yang sadar bahwa mayoritasnya tidak ikut terkirimi. */
  const grupPilih = (Array.isArray(data.grup) ? data.grup : data.grup ? [data.grup] : [])
    .map(kontakLib.rapikanGrup).filter(Boolean);
  const segmenPilih = (Array.isArray(data.segmen) ? data.segmen : bersih.segmen ? [bersih.segmen] : [])
    .map((s) => util.bersihkanTeks(s, 40)).filter(Boolean);

  if (grupPilih.length || segmenPilih.length) {
    const setGrup = new Set(grupPilih);
    const setSegmen = new Set(segmenPilih);
    sasaran = sasaran.filter((k) =>
      (k.label || []).some((g) => setGrup.has(kontakLib.rapikanGrup(g))) ||
      (k.segmen || []).some((s) => setSegmen.has(s)));
  }
  if (Array.isArray(data.kontakId) && data.kontakId.length) {
    const set = new Set(data.kontakId);
    sasaran = sasaran.filter((k) => set.has(k.id));
  }
  const kunciKantorMassal = kantorTerkunci(pengguna);
  if (kunciKantorMassal) sasaran = sasaran.filter((k) => (k.kantor || '') === kunciKantorMassal);

  const dilewati = sasaran.filter((k) => !kontakLib.bolehDikirimiMassal(k)).length;
  sasaran = sasaran.filter(kontakLib.bolehDikirimiMassal);

  if (!sasaran.length) {
    throw new GalatAplikasi(grupPilih.length || segmenPilih.length
      ? 'Tidak ada penerima pada grup/segmen yang dipilih — atau semuanya sedang diblokir.'
      : 'Belum ada kontak yang bisa dikirimi. Tambahkan kontak dulu di menu Kontak.');
  }

  const massal = {
    id: id('c_'),
    nama: bersih.nama,
    perangkatId: perangkat.id,
    teks: bersih.teks,
    grup: grupPilih,
    segmen: segmenPilih,
    /* Disimpan sebagai kalimat sekali jadi. Nama grup bisa diubah atau dibubarkan
       bulan depan, dan riwayat kiriman harus tetap bisa menjawab "ini dikirim ke
       siapa" — bukan menunjuk grup yang sudah tidak ada. */
    penerimaTertulis: [
      ...grupPilih,
      ...segmenPilih.map((s) => (kontakLib.SEGMEN.find((x) => x.kode === s) || {}).label || s),
    ].join(', ') || 'Semua kontak',
    jumlah: sasaran.length,
    dilewati,
    status: 'berjalan',
    dibuat: sekarang(),
    oleh: pengguna.id,
  };
  /* Diperiksa SEBELUM ratusan pesan diantrekan: lampiran yang sudah kedaluwarsa
     lebih baik ketahuan sekarang daripada nanti gagal satu per satu. */
  const berkasMassal = await lampiran(bersih.berkasId);
  if (berkasMassal.berkasId) {
    massal.berkasId = berkasMassal.berkasId;
    massal.namaBerkas = berkasMassal.namaBerkas;
  }

  await db.simpan(`massal:${massal.id}`, massal);
  await db.tambahKeHimpunan('massal:daftar', massal.id);

  const jadwal = data.jadwal || sekarang();
  for (const k of sasaran) {
    await antreanLib.antrikan({
      perangkatId: perangkat.id,
      nomor: k.nomor,
      nama: k.nama,
      kontakId: k.id,
      isi: {
        teks: isiPlaceholder(bersih.teks, {
          nama: k.anonim ? 'Bapak/Ibu' : (k.nama || 'Bapak/Ibu'),
          kantor: k.kantor || '',
          lembaga: 'LAZISMU Bantul',
        }),
        ...berkasMassal,
      },
      prioritas: 6,
      jadwal,
      massalId: massal.id,
      kunciIdempoten: `${massal.id}:${k.nomor}`,
      oleh: pengguna.id,
    });
  }

  await auth.catatAudit(pengguna, 'massal.kirim', { id: massal.id, nama: massal.nama, jumlah: massal.jumlah }, req);
  await dorongAntrean();
  const ket = `${massal.jumlah} pesan masuk antrean untuk ${massal.penerimaTertulis}.`
    + (dilewati ? ` ${dilewati} kontak dilewati karena diblokir.` : '');
  return { massal, catatan: ket };
} };

tindakan['massal.daftar'] = { izin: 'pesan.lihat', async jalankan() {
  const idDaftar = await db.anggotaHimpunan('massal:daftar');
  const isi = (await db.ambilBanyak(idDaftar.map((i) => `massal:${i}`))).filter(Boolean);
  const semuaPesanId = ((await db.ambil('pesan:baru')) || []).slice(0, 2000);
  const pesan = (await db.ambilBanyak(semuaPesanId.map(antreanLib.KUNCI_PESAN))).filter(Boolean);

  /* Balasan per kampanye: nomor yang mengirim pesan masuk sesudah kampanye
     ini mengirimi mereka. Pesan masuk tidak membawa massalId — ia memang
     bukan bagian kampanye — jadi pasangannya dicari lewat nomor dan waktu. */
  const masuk = pesan.filter((p) => p.arah === 'masuk');

  const baris = isi.map((m) => {
    const milik = pesan.filter((p) => p.massalId === m.id);
    const kirimPada = new Map();
    for (const p of milik) {
      const t = new Date(p.dikirim || p.diserahkanPada || p.dibuat).getTime();
      if (Number.isFinite(t)) kirimPada.set(p.nomor, Math.min(kirimPada.get(p.nomor) ?? Infinity, t));
    }
    const membalas = new Set();
    for (const p of masuk) {
      const t0 = kirimPada.get(p.nomor);
      if (t0 === undefined) continue;
      const t = new Date(p.dibuat).getTime();
      if (Number.isFinite(t) && t >= t0) membalas.add(p.nomor);
    }
    return {
      ...m,
      dibalas: membalas.size,
      statistik: {
        antre: milik.filter((p) => p.status === 'antre').length,
        terkirim: milik.filter((p) => ['terkirim', 'sampai', 'dibaca'].includes(p.status)).length,
        sampai: milik.filter((p) => ['sampai', 'dibaca'].includes(p.status)).length,
        dibaca: milik.filter((p) => p.status === 'dibaca').length,
        gagal: milik.filter((p) => p.status === 'gagal').length,
      },
    };
  }).sort((a, b) => new Date(b.dibuat) - new Date(a.dibuat));
  return { baris };
} };

tindakan['massal.hentikan'] = { izin: 'massal.kelola', async jalankan({ data, pengguna, req }) {
  const massal = await db.ambil(`massal:${data.id}`);
  if (!massal) throw new GalatAplikasi('Kiriman tidak ditemukan', 404);
  const idAntre = await db.anggotaHimpunan(antreanLib.KUNCI_ANTREAN);
  const pesan = (await db.ambilBanyak(idAntre.map(antreanLib.KUNCI_PESAN))).filter(Boolean);
  let n = 0;
  for (const p of pesan) {
    if (p.massalId === data.id && p.status === 'antre') { await antreanLib.batalkan(p.id); n++; }
  }
  massal.status = 'dihentikan';
  await db.simpan(`massal:${massal.id}`, massal);
  await auth.catatAudit(pengguna, 'massal.hentikan', { id: data.id, dibatalkan: n }, req);
  return { pesan: `${n} pesan yang belum terkirim dibatalkan.` };
} };

// --- Antrean --------------------------------------------------------------
tindakan['antrean.ringkas'] = { izin: 'dasbor', async jalankan() {
  return antreanLib.ringkasAntrean();
} };

tindakan['antrean.proses'] = { izin: 'pesan.kirim', async jalankan({ data, pengguna, req }) {
  const laporan = await antreanLib.prosesAntrean(15000);
  // Dorongan berkala dari tampilan tidak dicatat — audit hanya untuk tindakan
  // yang benar-benar ditekan pengguna, agar catatannya tetap berguna dibaca.
  if (!data.diam) await auth.catatAudit(pengguna, 'antrean.proses-manual', laporan, req);
  return { laporan };
} };

// --- Setelan --------------------------------------------------------------
/* Bagian webhook ikut dikunci superadmin — bukan cuma menunya.
   Mengunci menu Webhook tetapi membiarkan kartu "Webhook keluar" di Pengaturan
   sama saja dengan tidak mengunci apa pun: alamat tujuan dan rahasia tanda
   tangannya tetap bisa dibaca dan diubah dari satu klik di sebelahnya. */
const bolehWebhook = (pengguna) => bolehKhusus(pengguna, 'webhook');

tindakan['setelan.ambil'] = { izin: 'setelan.lihat', async jalankan({ pengguna }) {
  const setelan = await setelanLib.ambilSetelan();
  const aman = setelanLib.setelanAman(setelan);
  if (!(await bolehWebhook(pengguna))) delete aman.webhook;
  return { setelan: aman, bolehWebhook: await bolehWebhook(pengguna) };
} };

tindakan['setelan.simpan'] = { izin: 'setelan.ubah', async jalankan({ data, pengguna, req }) {
  const masuk = data.setelan || {};
  /* Disaring di server, bukan sekadar tidak digambar di layar: kalau hanya
     kartunya yang disembunyikan, permintaan yang disusun sendiri tetap bisa
     mengubah alamat tujuan webhook dan rahasianya. */
  if (!(await bolehWebhook(pengguna))) delete masuk.webhook;
  /* Daftar akses hanya berubah lewat akses.atur (superadmin). Kalau ia juga
     bisa lewat sini, siapa pun yang boleh mengubah setelan bisa memberi
     dirinya sendiri akses ke webhook dan audit. */
  delete masuk.aksesKhusus;
  // Jangan timpa rahasia dengan tanda bintang dari tampilan
  if (masuk.webhook && /^•+$/.test(String(masuk.webhook.rahasia || ''))) delete masuk.webhook.rahasia;
  const setelan = await setelanLib.simpanSetelan(masuk);
  await auth.catatAudit(pengguna, 'setelan.simpan', {}, req);
  const aman = setelanLib.setelanAman(setelan);
  if (!(await bolehWebhook(pengguna))) delete aman.webhook;
  return { setelan: aman, bolehWebhook: await bolehWebhook(pengguna) };
} };

// --- Pengguna -------------------------------------------------------------
tindakan['pengguna.daftar'] = { izin: 'pengguna.lihat', async jalankan() {
  const idDaftar = await db.anggotaHimpunan('pengguna:daftar');
  const isi = (await db.ambilBanyak(idDaftar.map(auth.KUNCI_PENGGUNA))).filter(Boolean);
  return {
    baris: isi.map(auth.pengunaTampil).sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id')),
    peran: PERAN,
  };
} };

/* Daftar siapa saja yang diberi akses khusus. Hanya superadmin yang boleh
   melihatnya — daftar ini sendiri sudah memberi tahu siapa yang memegang
   kunci ke rahasia webhook. */
tindakan['akses.daftar'] = { izin: 'pengguna.lihat', superadmin: true, async jalankan() {
  const setelan = await setelanLib.ambilSetelan();
  const a = setelan.aksesKhusus || {};
  return { webhook: a.webhook || [], audit: a.audit || [] };
} };

tindakan['akses.atur'] = { izin: 'pengguna.ubah', superadmin: true, async jalankan({ data, pengguna, req }) {
  const bagian = String(data.bagian || '');
  if (!['webhook', 'audit'].includes(bagian)) throw new GalatAplikasi('Bagian tidak dikenal', 400);
  const idAkun = String(data.penggunaId || '').trim();
  if (!idAkun) throw new GalatAplikasi('Akun mana yang diatur?', 400);

  const setelan = await setelanLib.ambilSetelan();
  const akses = setelan.aksesKhusus || { webhook: [], audit: [] };
  const daftar = new Set((akses[bagian] || []).map(String));
  if (data.boleh) daftar.add(idAkun); else daftar.delete(idAkun);
  akses[bagian] = Array.from(daftar);

  /* Ditulis lewat db langsung, bukan simpanSetelan — simpanSetelan sengaja
     membuang aksesKhusus supaya tidak bisa diubah lewat halaman Pengaturan. */
  await db.simpan('setelan', { ...setelan, aksesKhusus: akses });
  await auth.catatAudit(pengguna, 'akses.atur', { bagian, penggunaId: idAkun, boleh: Boolean(data.boleh) }, req);
  return { bagian, daftar: akses[bagian] };
} };

tindakan['pengguna.simpan'] = { izin: 'pengguna.ubah', async jalankan({ data, pengguna, req }) {
  if (data.id) {
    const sasaran = await db.ambil(auth.KUNCI_PENGGUNA(data.id));
    if (!sasaran) throw new GalatAplikasi('Pengguna tidak ditemukan', 404);
    if (sasaran.peran === 'superadmin' && pengguna.peran !== 'superadmin') {
      throw new GalatAplikasi('Hanya superadmin yang boleh mengubah akun superadmin', 403);
    }
    if (data.nama) sasaran.nama = util.bersihkanTeks(data.nama, 80);
    if (data.peran && PERAN[data.peran]) sasaran.peran = data.peran;
    if (data.kantor !== undefined) sasaran.kantor = util.bersihkanTeks(data.kantor, 80);
    if (data.aktif !== undefined) sasaran.aktif = Boolean(data.aktif);
    if (data.sandiBaru) {
      if (!auth.sandiLayak(data.sandiBaru)) throw new GalatAplikasi('Sandi minimal 8 karakter dan memuat huruf serta angka');
      sasaran.garam = auth.acakGaram();
      sasaran.sandiHash = auth.hashSandi(data.sandiBaru, sasaran.garam);
      sasaran.sandiDiubah = sekarang();
      await auth.hapusSemuaSesi(sasaran.id);
    }
    await auth.simpanPengguna(sasaran);
    await auth.catatAudit(pengguna, 'pengguna.ubah', { id: sasaran.id, username: sasaran.username }, req);
    return { pengguna: auth.pengunaTampil(sasaran) };
  }

  const baru = await auth.buatPengguna({
    nama: data.nama, username: data.username, sandi: data.sandi,
    peran: data.peran || 'petugas', kantor: data.kantor || '',
  });
  await auth.catatAudit(pengguna, 'pengguna.tambah', { id: baru.id, username: baru.username, peran: baru.peran }, req);
  return { pengguna: auth.pengunaTampil(baru) };
} };

tindakan['pengguna.hapus'] = { izin: 'pengguna.ubah', async jalankan({ data, pengguna, req }) {
  if (data.id === pengguna.id) throw new GalatAplikasi('Anda tidak dapat menghapus akun sendiri');
  const sasaran = await db.ambil(auth.KUNCI_PENGGUNA(data.id));
  if (!sasaran) throw new GalatAplikasi('Pengguna tidak ditemukan', 404);
  if (sasaran.peran === 'superadmin' && pengguna.peran !== 'superadmin') {
    throw new GalatAplikasi('Hanya superadmin yang boleh menghapus akun superadmin', 403);
  }
  await auth.hapusSemuaSesi(sasaran.id);
  await db.hapus(auth.KUNCI_PENGGUNA(sasaran.id));
  await db.keluarDariHimpunan('pengguna:daftar', sasaran.id);
  const peta = (await db.ambil('idx:username')) || {};
  delete peta[sasaran.username];
  await db.simpan('idx:username', peta);
  await auth.catatAudit(pengguna, 'pengguna.hapus', { username: sasaran.username }, req);
  return { pesan: `Akun ${sasaran.username} dihapus.` };
} };

// --- Audit & webhook ------------------------------------------------------
/* CATATAN AUDIT — SUPERADMIN SAJA.
 *
 * Isinya siapa mengirim apa ke nomor siapa, siapa menghapus riwayat, siapa
 * mengubah pengaturan. Itu bukan sekadar catatan teknis: ia menjawab pertanyaan
 * yang muncul kalau ada donatur protes atau ada nomor yang terkirimi sesuatu
 * yang tidak seharusnya. Hanya yang bertanggung jawab atas seluruh sistem yang
 * perlu — dan boleh — membacanya.
 */
tindakan['audit.daftar'] = { izin: 'audit.lihat', khusus: 'audit', async jalankan({ data }) {
  const daftar = (await db.ambil('audit')) || [];
  return { baris: daftar.slice(0, Math.min(500, Number(data.batas) || 100)) };
} };

tindakan['audit.hapus'] = { izin: 'audit.lihat', khusus: 'audit', async jalankan({ data, pengguna, req }) {
  const daftar = (await db.ambil('audit')) || [];
  const sisa = daftar.filter((a) => a.id !== data.id);
  if (sisa.length === daftar.length) throw new GalatAplikasi('Catatan itu tidak ditemukan', 404);
  await db.simpan('audit', sisa);
  /* Penghapusannya sendiri ikut dicatat. Kalau tidak, satu-satunya tindakan
     yang bisa dilakukan tanpa meninggalkan jejak adalah menghapus jejak. */
  await auth.catatAudit(pengguna, 'audit.hapus', { id: data.id }, req);
  return { pesan: 'Satu catatan audit dihapus.' };
} };

tindakan['audit.kosongkan'] = { izin: 'audit.lihat', khusus: 'audit', async jalankan({ data, pengguna, req }) {
  if (String(data.tegaskan || '').trim().toUpperCase() !== 'HAPUS SEMUA') {
    throw new GalatAplikasi('Ketik HAPUS SEMUA untuk menegaskan.', 400);
  }
  const jumlah = ((await db.ambil('audit')) || []).length;
  await db.hapus('audit');
  /* Dicatat SESUDAH dikosongkan, jadi catatan ini yang pertama di log baru:
     logya boleh kosong, tetapi tidak boleh berpura-pura tidak pernah berisi. */
  await auth.catatAudit(pengguna, 'audit.kosongkan', { terhapus: jumlah }, req);
  return { terhapus: jumlah, catatan: `${jumlah} catatan audit dihapus. Tindakan ini sendiri tercatat sebagai baris pertama yang baru.` };
} };

/* WEBHOOK — SUPERADMIN SAJA.
 *
 * Riwayatnya memuat isi pesan yang diteruskan ke sistem lain, dan halaman ini
 * bersebelahan dengan rahasia tanda tangan yang memungkinkan siapa pun memalsukan
 * kiriman ke penerimanya. Bukan sesuatu yang perlu dibuka petugas harian.
 */
tindakan['webhook.riwayat'] = { izin: 'setelan.lihat', khusus: 'webhook', async jalankan({ data }) {
  return { baris: await webhookLib.riwayat(Number(data.batas) || 50), mati: await webhookLib.kotakMati() };
} };

tindakan['webhook.uji'] = { izin: 'setelan.ubah', khusus: 'webhook', async jalankan({ pengguna, req }) {
  const kejadian = await webhookLib.kirimKejadian('uji', {
    id: 'uji', nomor: '628000000000', status: 'uji', perangkatId: 'uji',
  });
  await auth.catatAudit(pengguna, 'webhook.uji', {}, req);
  return { kejadian, catatan: 'Kejadian uji dikirim. Periksa riwayat untuk hasilnya.' };
} };

tindakan['webhook.kirimUlang'] = { izin: 'setelan.ubah', khusus: 'webhook', async jalankan({ data }) {
  const kejadian = await webhookLib.kirimUlangMati(data.id);
  return { kejadian };
} };

tindakan['webhook.hapus'] = { izin: 'setelan.ubah', khusus: 'webhook', async jalankan({ data, pengguna, req }) {
  const hasil = await webhookLib.hapusRiwayat(data.id);
  await auth.catatAudit(pengguna, 'webhook.hapus', { id: data.id }, req);
  return { ...hasil, pesan: 'Satu baris riwayat webhook dihapus.' };
} };

tindakan['webhook.kosongkan'] = { izin: 'setelan.ubah', khusus: 'webhook', async jalankan({ data, pengguna, req }) {
  if (String(data.tegaskan || '').trim().toUpperCase() !== 'HAPUS SEMUA') {
    throw new GalatAplikasi('Ketik HAPUS SEMUA untuk menegaskan.', 400);
  }
  const hasil = await webhookLib.kosongkanRiwayat();
  await auth.catatAudit(pengguna, 'webhook.kosongkan', hasil, req);
  return { ...hasil, catatan: `${hasil.terhapus} baris riwayat webhook dihapus, termasuk ${hasil.mati} yang menunggu kiriman ulang.` };
} };

// --- Kesiapan deploy ------------------------------------------------------
// Daftar periksa sebelum aplikasi dipakai sungguhan. Sengaja dibuat sebagai
// tindakan, bukan catatan di dokumen, supaya jawabannya berasal dari keadaan
// aplikasi yang sebenarnya.
tindakan['sistem.kesiapan'] = { izin: 'setelan.lihat', async jalankan() {
  const setelan = await setelanLib.ambilSetelan();
  const idPengguna = await db.anggotaHimpunan('pengguna:daftar');
  const pengguna = (await db.ambilBanyak(idPengguna.map(auth.KUNCI_PENGGUNA))).filter(Boolean);
  const sandiBawaan = process.env.ADMIN_AWAL_SANDI || 'lazismu123';

  const masihBawaan = [];
  for (const p of pengguna) {
    if (util.bandingAman(auth.hashSandi(sandiBawaan, p.garam), p.sandiHash)) masihBawaan.push(p.username);
  }

  const idPerangkat = await db.anggotaHimpunan('perangkat:daftar');
  const perangkat = (await db.ambilBanyak(idPerangkat.map((i) => `perangkat:${i}`))).filter(Boolean);
  const perluToken = perangkat.filter((d) => d.driver !== 'sandbox' && !d.token);

  const butir = [
    {
      kode: 'basisdata',
      label: 'Basis data Upstash Redis tersambung',
      lolos: db.pakaiUpstash,
      wajib: true,
      saran: 'Isi UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN di Environment Variables Vercel. Tanpa ini, data hilang setiap deploy.',
    },
    {
      kode: 'rahasia',
      label: 'RAHASIA_SESI sudah diganti',
      lolos: Boolean(process.env.RAHASIA_SESI) && !/ubah-saya/i.test(process.env.RAHASIA_SESI),
      wajib: true,
      saran: 'Isi dengan teks acak panjang. Dipakai menandatangani webhook keluar.',
    },
    {
      kode: 'cron',
      label: 'CRON_SECRET sudah diisi',
      lolos: Boolean(process.env.CRON_SECRET) && !/ubah-saya/i.test(process.env.CRON_SECRET),
      wajib: true,
      saran: 'Tanpa ini, siapa pun dapat memanggil pemroses antrean Anda.',
    },
    {
      kode: 'sandi',
      label: 'Sandi bawaan sudah diganti',
      lolos: masihBawaan.length === 0,
      wajib: true,
      saran: masihBawaan.length
        ? `Akun ini masih memakai sandi contoh: ${masihBawaan.join(', ')}. Ganti lewat Tim & Petugas.`
        : '',
    },
    {
      kode: 'pengirim',
      label: 'Pengirim sungguhan sudah dipilih',
      lolos: setelan.pengirim.driver !== 'sandbox',
      wajib: false,
      saran: 'Masih mode sandbox — pesan tidak benar-benar terkirim. Ini aman untuk uji coba; ganti ke Fonnte atau Meta saat siap.',
    },
    {
      kode: 'token',
      label: 'Semua perangkat non-sandbox punya token',
      lolos: perluToken.length === 0,
      wajib: false,
      saran: perluToken.length ? `Belum ada token: ${perluToken.map((d) => d.nama).join(', ')}.` : '',
    },
    {
      kode: 'lembaga',
      label: 'Identitas lembaga sudah diisi',
      lolos: Boolean(setelan.lembaga.nama && setelan.lembaga.situs),
      wajib: false,
      saran: 'Nama dan tautan lembaga dipakai pada balasan otomatis.',
    },
  ];

  return {
    butir,
    siapDeploy: butir.filter((b) => b.wajib).every((b) => b.lolos),
    diVercel: db.diVercel,
    catatanCron: db.diVercel
      ? 'Paket Hobby Vercel hanya mengizinkan cron sekali sehari. Agar antrean berjalan tiap menit, pakai paket Pro (ubah jadwal jadi "* * * * *") atau arahkan pemicu luar ke /api/cron/antrean?kunci=CRON_SECRET.'
      : 'Di komputer sendiri, antrean diproses server.js tiap 5 detik.',
  };
} };

// --- Admin ----------------------------------------------------------------
tindakan['admin.dataContoh'] = { izin: 'pengguna.ubah', async jalankan({ pengguna, req }) {
  const hasil = await siapkanAwal({ paksa: true });
  await auth.catatAudit(pengguna, 'admin.dataContoh', hasil, req);
  return { hasil };
} };

// ---------------------------------------------------------------- penangan
module.exports = async function penangan(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return gagal(res, 405, 'Gunakan metode POST');

  let nama = '(tidak diketahui)';
  try {
    const badan = await bacaBody(req);
    nama = String(badan.tindakan || '');
    const data = badan.data || {};

    const pintu = tindakan[nama];
    if (!pintu) return gagal(res, 404, `Tindakan "${nama}" tidak dikenal`);

    let pengguna = null;
    if (!pintu.publik) {
      pengguna = await auth.wajibMasuk(req);
      if (pintu.izin) auth.wajibIzin(pengguna, pintu.izin);
      /* Pagar superadmin ditegakkan di SATU tempat, bukan di dalam tiap
         tindakan. Kalau disebar, tindakan baru yang lupa memasangnya akan
         terbuka diam-diam — dan yang terbuka diam-diam justru tidak terlihat
         oleh siapa pun sampai ada yang memakainya. */
      if (pintu.superadmin && pengguna.peran !== 'superadmin') {
        throw new GalatAplikasi('Hanya superadmin yang boleh membuka bagian ini', 403);
      }
      if (pintu.khusus && !(await bolehKhusus(pengguna, pintu.khusus))) {
        throw new GalatAplikasi('Akun Anda belum diberi akses ke bagian ini. Minta superadmin membukanya di menu Tim & Petugas.', 403);
      }
    }

    const hasil = await pintu.jalankan({ data, pengguna, req, res });
    return sukses(res, hasil || {});
  } catch (e) {
    const kode = e.kode || 500;
    if (kode >= 500) console.error(`[rpc] ${nama}:`, e);
    return gagal(res, kode, e.message || 'Terjadi kesalahan di server', kode >= 500 ? { tindakan: nama } : {});
  }
};

module.exports.tindakan = tindakan;
