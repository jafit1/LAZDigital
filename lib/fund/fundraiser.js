/* lib/fund/fundraiser.js — daftar penggalang dana beserta angkanya.
 *
 * APA YANG DIJAWAB HALAMAN INI. Superadmin sebenarnya sudah melihat data semua
 * fundraiser di halaman Donatur, Penghimpunan, dan Cocokkan. Masalahnya semua
 * tercampur jadi satu daftar panjang: pertanyaan "Pak Slamet bulan ini dapat
 * berapa, dan apakah setorannya sudah masuk buku kas" hanya bisa dijawab dengan
 * memindai ratusan baris sambil menghitung sendiri.
 *
 * Berkas ini menyusun jawabannya per orang.
 *
 * SIAPA YANG MASUK DAFTAR.
 * Semua akun LAZDigital yang modul 'fundraising'-nya dicentang, termasuk yang
 * BELUM pernah menyetor apa pun. Justru mereka yang penting terlihat: akun yang
 * sudah dibuatkan tetapi angkanya nol sejak sebulan lalu adalah kabar, bukan
 * baris kosong yang pantas disembunyikan.
 *
 * Ditambah siapa pun yang punya catatan penghimpunan walau centangnya sudah
 * dicabut. Kalau mereka dibuang dari daftar, uang yang pernah mereka kumpulkan
 * ikut lenyap dari pandangan, dan total per orang tidak akan pernah sama dengan
 * total seluruhnya. Selisih yang tidak bisa dijelaskan adalah cara tercepat
 * membuat orang berhenti mempercayai laporan.
 *
 * PENGAWAS TIDAK IKUT KECUALI IA MEMANG MENYETOR. Superadmin memegang seluruh
 * centang, dan koordinator dicentang 'delete' supaya bisa melihat data semua
 * orang. Kalau keduanya dihitung apa adanya, daftar penggalang dana selalu
 * diawali dua baris berangka nol yang memang tidak pernah menggalang apa pun.
 * Itu bukan kabar, itu gangguan. Yang dicari halaman ini adalah petugas
 * lapangan; pengawas yang kebetulan ikut menyetor tetap masuk lewat catatannya.
 */
'use strict';

const MODUL = 'fundraising';

/* Centang modul bisa tersimpan sebagai objek atau sebagai teks JSON, tergantung
   lewat mana akunnya terakhir disimpan. Dua-duanya harus dimengerti; kalau
   tidak, izin kadang terbaca kosong dan daftarnya mendadak kehilangan orang. */
function izinModul(u) {
  let p = u && u.permissions;
  if (typeof p === 'string') {
    try { p = JSON.parse(p || '{}'); } catch (_) { p = {}; }
  }
  return (p && p[MODUL]) || {};
}

function dicentangFundraising(u) {
  const b = izinModul(u);
  return Boolean(b.view || b.create || b.edit || b.delete);
}

/* Pengawas: superadmin, atau akun yang dicentang 'delete' pada modul ini.
   Centang 'delete' itulah yang di lib/fund/sesi-laz.js menjadi lihatSemua. */
function pengawas(u) {
  return String(u && u.role) === 'superadmin' || Boolean(izinModul(u).delete);
}

const benar = (nilai) => String(nilai) !== 'false' && nilai !== false;

/* Satu baris ringkasan untuk satu orang. */
function hitung(catatan) {
  const diambil = catatan.filter((r) => r.status === 'diambil');
  const sudah = diambil.filter((r) => r.cocok && r.cocok.sudah);
  const otomatis = sudah.filter((r) => r.cocok.otomatis);
  const belum = diambil.filter((r) => !(r.cocok && r.cocok.sudah));
  const tanggal = catatan.map((r) => String(r.tanggal || '')).filter(Boolean).sort();
  return {
    kunjungan: catatan.length,
    berhasil: diambil.length,
    kosong: catatan.filter((r) => r.status === 'kosong').length,
    total: diambil.reduce((s, r) => s + (Number(r.jumlah) || 0), 0),
    sudahCocok: sudah.length,
    cocokOtomatis: otomatis.length,
    cocokManual: sudah.length - otomatis.length,
    belumCocok: belum.length,
    /* Rupiah yang belum ketemu padanannya. Inilah angka yang sebenarnya
       ditunggu pengurus: bukan berapa baris, tetapi berapa uang yang belum
       bisa dipertanggungjawabkan ke buku kas. */
    nilaiBelumCocok: belum.reduce((s, r) => s + (Number(r.jumlah) || 0), 0),
    terakhir: tanggal.length ? tanggal[tanggal.length - 1] : '',
  };
}

/* Menyusun daftar. Seluruh datanya diterima sudah jadi, tidak mengambil sendiri:
   Users milik LAZDigital dan hanya api/fund.js yang tahu cara membacanya, dan
   memisahkannya membuat aturan di sini bisa diuji tanpa basis data. */
function susun({ pengguna = [], akun = {}, catatan = [] } = {}) {
  const perPemilik = new Map();
  for (const r of catatan) {
    const kunci = String(r.pemilik || '');
    if (!perPemilik.has(kunci)) perPemilik.set(kunci, []);
    perPemilik.get(kunci).push(r);
  }

  const baris = [];
  const sudahMasuk = new Set();

  for (const u of pengguna) {
    const uid = String(u.id || '');
    if (!uid) continue;
    const punyaCatatan = (perPemilik.get(uid) || []).length > 0;
    const dicentang = dicentangFundraising(u);
    /* Lihat catatan di kepala berkas: pengawas hanya masuk kalau ia memang
       menyetor sendiri. */
    if (pengawas(u) && !punyaCatatan) continue;
    if (!dicentang && !punyaCatatan) continue;

    const profil = akun[uid] || {};
    sudahMasuk.add(uid);
    baris.push({
      userId: uid,
      nama: profil.namaTampil || u.nama || u.username || uid,
      username: u.username || '',
      namaFundraising: profil.namaFundraising || u.nama || '',
      foto: profil.foto || '',
      telepon: profil.telepon || '',
      peran: String(u.role || ''),
      aktif: benar(u.aktif),
      /* Centang yang dicabut sementara catatannya masih ada. Perlu terlihat,
         karena angkanya tetap ikut menghitung tetapi orangnya sudah tidak bisa
         masuk lagi. */
      dicentang,
      punyaAkun: true,
      ...hitung(perPemilik.get(uid) || []),
    });
  }

  /* Pemilik catatan yang akunnya sudah tidak ada sama sekali di Users. */
  for (const [uid, isi] of perPemilik) {
    if (!uid || sudahMasuk.has(uid)) continue;
    baris.push({
      userId: uid,
      nama: (isi[0] && isi[0].olehNama) || (isi[0] && isi[0].fundraising) || 'Akun terhapus',
      username: '',
      namaFundraising: (isi[0] && isi[0].fundraising) || '',
      foto: '', telepon: '', peran: '', aktif: false, dicentang: false,
      punyaAkun: false,
      ...hitung(isi),
    });
  }

  /* Diurut dari yang paling banyak mengumpulkan. Yang belum menyetor apa pun
     jatuh ke bawah dengan sendirinya, tanpa perlu disembunyikan. */
  baris.sort((a, b) => b.total - a.total || String(a.nama).localeCompare(String(b.nama), 'id'));
  return baris;
}

function ringkasSemua(baris) {
  return {
    orang: baris.length,
    aktif: baris.filter((b) => b.aktif && b.dicentang).length,
    belumMenyetor: baris.filter((b) => b.berhasil === 0).length,
    total: baris.reduce((s, b) => s + b.total, 0),
    sudahCocok: baris.reduce((s, b) => s + b.sudahCocok, 0),
    belumCocok: baris.reduce((s, b) => s + b.belumCocok, 0),
    nilaiBelumCocok: baris.reduce((s, b) => s + b.nilaiBelumCocok, 0),
  };
}

module.exports = { MODUL, susun, hitung, ringkasSemua, dicentangFundraising, pengawas, izinModul };
