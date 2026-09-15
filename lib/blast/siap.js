// lib/siap.js — penyiapan pertama kali (akun awal + data contoh)
//
// Dijalankan otomatis saat basis data masih kosong, atau lewat tombol
// "Isi Data Contoh" di Panel Admin.

const db = require('./db');
const { buatPengguna } = require('./auth');
const { simpanKontak } = require('./kontak');
const { id, sekarang } = require('./util');
const { ambilSetelan, simpanSetelan } = require('./setelan');

const TEMPLAT_CONTOH = [
  {
    nama: 'Ajakan zakat menjelang Ramadan',
    isi: 'Assalamu\'alaikum {{nama}},\n\nRamadan segera tiba. LAZISMU Bantul membuka layanan zakat, infak, dan fidyah.\n\nSalurkan melalui rekening resmi kami, atau balas pesan ini untuk dijemput petugas.\n\nJazakumullahu khairan.\n\n_Balas BERHENTI bila tidak ingin menerima kabar dari kami._',
  },
  {
    nama: 'Pengingat zakat mal jatuh tempo haul',
    isi: 'Bapak/Ibu {{nama}}, haul zakat mal Anda diperkirakan jatuh pada bulan ini.\n\nBila berkenan, kami siap membantu menghitung nisab dan kadarnya (2,5%). Balas pesan ini untuk dibantu petugas kami.\n\n_Balas BERHENTI bila tidak ingin menerima kabar dari kami._',
  },
  {
    nama: 'Laporan penyaluran bulanan',
    isi: 'Assalamu\'alaikum {{nama}},\n\nAlhamdulillah, amanah Anda telah kami salurkan pada bulan ini. Ringkasan penyaluran dapat dilihat di {{tautan}}.\n\nTerima kasih atas kepercayaan Anda.\n\n_Balas BERHENTI bila tidak ingin menerima kabar dari kami._',
  },
  {
    nama: 'Ucapan terima kasih & kwitansi',
    isi: 'Terima kasih {{nama}}.\n\nDonasi {{nominal}} untuk {{peruntukan}} telah kami terima pada {{tanggal}}. Kwitansi resmi terlampir.\n\nSemoga menjadi amal jariyah yang terus mengalir.',
  },
  {
    nama: 'Pengingat setoran & LPJ ke KLL/ULL',
    isi: 'Kepada pengurus {{kantor}},\n\nMohon setoran dan LPJ bulan {{bulan}} dapat disampaikan paling lambat tanggal 10.\n\nTerima kasih atas kerja samanya.',
  },
  {
    nama: 'Penggalangan tanggap bencana',
    isi: 'Assalamu\'alaikum {{nama}},\n\nLAZISMU Bantul membuka posko tanggap darurat {{kejadian}}. Bantuan Anda sangat berarti bagi saudara kita di lokasi.\n\nSalurkan melalui rekening resmi kami.\n\n_Balas BERHENTI bila tidak ingin menerima kabar dari kami._',
  },
];

const BALASAN_CONTOH = [
  { pemicu: 'zakat', jenis: 'mengandung', balasan: 'Untuk layanan zakat, silakan pilih:\n1. Hitung zakat mal\n2. Rekening resmi\n3. Jemput zakat\n\nBalas dengan angkanya, atau ketik PETUGAS untuk berbicara dengan amil kami.' },
  { pemicu: 'rekening', jenis: 'mengandung', balasan: 'Rekening resmi LAZISMU Bantul dapat dilihat di {{tautanRekening}}.\n\nDemi keamanan, kami TIDAK PERNAH meminta transfer ke rekening pribadi. Bila ragu, hubungi kantor kami.' },
  { pemicu: 'berhenti', jenis: 'persis', balasan: 'Baik, kami hentikan pengiriman kabar ke nomor ini. Terima kasih atas perhatiannya.', tindakan: 'berhenti-langganan' },
  { pemicu: 'petugas', jenis: 'persis', balasan: 'Baik, percakapan ini kami teruskan ke petugas. Mohon ditunggu pada jam layanan 08.00–15.00 WIB.', tindakan: 'alih-ke-petugas' },
  { pemicu: '', jenis: 'cadangan', balasan: 'Terima kasih telah menghubungi LAZISMU Bantul. Pesan Anda kami terima dan akan dibalas petugas pada jam layanan 08.00–15.00 WIB.' },
];

async function sudahSiap() {
  const daftar = await db.anggotaHimpunan('pengguna:daftar');
  return daftar.length > 0;
}

async function siapkanAwal({ paksa = false } = {}) {
  if (!paksa && (await sudahSiap())) return { dilewati: true };

  const hasil = { pengguna: [], perangkat: 0, kontak: 0, templat: 0, balasan: 0 };

  if (!(await sudahSiap())) {
    const sandi = process.env.ADMIN_AWAL_SANDI || 'lazismu123';
    const akun = await buatPengguna({
      nama: process.env.ADMIN_AWAL_NAMA || 'Superadmin',
      username: process.env.ADMIN_AWAL_USERNAME || 'superadmin',
      sandi,
      peran: 'superadmin',
    });
    hasil.pengguna.push({ username: akun.username, sandi });

    for (const [uname, peran, nama, kantor] of [
      ['admin', 'admin', 'Admin Daerah', ''],
      ['penyelia', 'penyelia', 'Penyelia Layanan', ''],
      ['petugas', 'petugas', 'Petugas Amil', ''],
      ['kll.sewon', 'kll', 'Pengurus KLL Sewon', 'KLL Sewon'],
    ]) {
      const p = await buatPengguna({ nama, username: uname, sandi: 'lazismu123', peran, kantor });
      hasil.pengguna.push({ username: p.username, sandi: 'lazismu123' });
    }
  }

  // Perangkat contoh (mode sandbox — tidak butuh kredensial)
  const daftarPerangkat = await db.anggotaHimpunan('perangkat:daftar');
  if (!daftarPerangkat.length) {
    for (const [nama, nomor, keterangan] of [
      ['Nomor Layanan Donasi', '6281200000001', 'Nomor utama untuk donatur'],
      ['Nomor Kemanusiaan', '6281200000002', 'Khusus kampanye tanggap bencana'],
    ]) {
      const perangkat = {
        id: id('d_'), nama, nomor, keterangan,
        driver: 'sandbox', token: '', nomorId: '',
        status: 'tersambung', aktif: true,
        dibuat: sekarang(), bolehKirimSetelah: 0,
      };
      await db.simpan(`perangkat:${perangkat.id}`, perangkat);
      await db.tambahKeHimpunan('perangkat:daftar', perangkat.id);
      hasil.perangkat++;
    }
  }

  // Kontak contoh
  const contohKontak = [
    { nama: 'Budi Santoso', nomor: '081234567801', segmen: ['donatur-rutin'], kantor: '' },
    { nama: 'Siti Aminah', nomor: '081234567802', segmen: ['muzaki-zakat-mal'], kantor: '' },
    { nama: 'Ahmad Fauzi', nomor: '081234567803', segmen: ['donatur-musiman'], kantor: 'KLL Sewon' },
    { nama: 'Pengurus KLL Sewon', nomor: '081234567804', segmen: ['pengurus-kll'], kantor: 'KLL Sewon' },
    { nama: 'Pengurus ULL Bantul Kota', nomor: '081234567805', segmen: ['pengurus-kll'], kantor: 'ULL Bantul Kota' },
    { nama: 'CV Barokah Jaya', nomor: '081234567806', segmen: ['mitra'], kantor: '' },
    { nama: 'Ibu Marfuah', nomor: '081234567807', segmen: ['mustahik'], kantor: 'KLL Sewon' },
    { nama: 'Relawan Aisyah', nomor: '081234567808', segmen: ['amil-relawan'], kantor: '' },
  ];
  for (const k of contohKontak) {
    try { await simpanKontak(k); hasil.kontak++; } catch (_) { /* lewati */ }
  }

  // Templat pesan
  const templatAda = (await db.ambil('templat')) || [];
  if (!templatAda.length) {
    const templat = TEMPLAT_CONTOH.map((t) => ({ id: id('t_'), ...t, dibuat: sekarang() }));
    await db.simpan('templat', templat);
    hasil.templat = templat.length;
  }

  // Balasan otomatis
  const balasanAda = (await db.ambil('balasan')) || [];
  if (!balasanAda.length) {
    const balasan = BALASAN_CONTOH.map((b) => ({ id: id('b_'), aktif: true, ...b, dibuat: sekarang() }));
    await db.simpan('balasan', balasan);
    hasil.balasan = balasan.length;
  }

  // Pastikan setelan tersimpan agar bisa langsung diubah dari dasbor
  await simpanSetelan(await ambilSetelan());

  return hasil;
}

module.exports = { siapkanAwal, sudahSiap, TEMPLAT_CONTOH, BALASAN_CONTOH };
