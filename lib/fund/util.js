// lib/fund/util.js — pembantu khusus modul Fundraising
//
// Sisanya (id, sekarang, normalkanNomor, bersihkanTeks, GalatAplikasi, …)
// dipinjam dari lib/blast/util supaya tidak ada dua versi yang bisa berbeda.

const WIB_MENIT = 7 * 60; // WIB = UTC+7, tanpa musim panas

/* Tanggal 'YYYY-MM-DD' menurut WIB, bukan menurut zona server.
   Di Vercel server berjalan pada UTC; memakai toISOString() apa adanya membuat
   "hari ini" berganti pukul 07.00 WIB, sehingga jadwal pengambilan pagi hari
   masih dianggap milik kemarin. */
function tglLokal(d = new Date()) {
  const t = new Date(d.getTime() + WIB_MENIT * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/* Hari dari sebuah 'YYYY-MM-DD' dihitung di tengah hari WIB, bukan tengah malam.
   Tengah malam UTC dari string tanggal bisa jatuh ke hari sebelumnya begitu
   digeser ke WIB, dan "Senin" berubah jadi "Minggu" tanpa ada yang menyadari. */
function hariDari(tgl) {
  const noonWib = new Date(tgl + 'T12:00:00+07:00');
  return NAMA_HARI[new Date(noonWib.getTime() + WIB_MENIT * 60000).getUTCDay()];
}

function tanggalPanjang(tgl) {
  const d = new Date(tgl + 'T12:00:00+07:00');
  const wib = new Date(d.getTime() + WIB_MENIT * 60000);
  return `${NAMA_HARI[wib.getUTCDay()]}, ${wib.getUTCDate()} ${NAMA_BULAN[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
}

/* Hari kerja berikutnya sesudah 'tgl' (atau sesudah hari ini bila kosong).
   Sabtu & Minggu dilewati. Hari libur nasional TIDAK dihitung di sini: daftarnya
   berubah tiap tahun dan menaruhnya sebagai daftar mati di kode adalah janji
   yang pasti basi — reschedule ke tanggal yang ternyata libur tinggal
   digeser sekali lagi oleh petugas, dan itu jujur; menebak libur lalu salah
   tidak. */
function hariKerjaBerikutnya(tgl) {
  let d = new Date((tgl ? tgl : tglLokal()) + 'T12:00:00+07:00');
  do {
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  } while ([0, 6].includes(new Date(d.getTime() + WIB_MENIT * 60000).getUTCDay()));
  return tglLokal(new Date(d.getTime() - WIB_MENIT * 60000));
}

function tglValid(tgl) {
  return typeof tgl === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(tgl) && !Number.isNaN(new Date(tgl).getTime());
}

/* Titik koordinat yang masuk akal untuk Indonesia — bukan (0,0) yang muncul
   kalau GPS gagal lalu nilainya dikirim apa adanya. Rentang longgar supaya
   seluruh Nusantara masuk, tetapi (0,0) dan angka ngawur tertolak. */
function lokasiValid(lat, lng) {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === 0 && b === 0) return false;
  return a >= -11.5 && a <= 6.5 && b >= 94.5 && b <= 141.5;
}

module.exports = {
  tglLokal, hariDari, tanggalPanjang, hariKerjaBerikutnya, tglValid, lokasiValid,
  NAMA_HARI, NAMA_BULAN,
};
