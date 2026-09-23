// lib/ai/ringkas.js — angka ringkas LAZDigital untuk disuapkan ke AI
//
// ATURAN YANG TIDAK BOLEH DILANGGAR DI BERKAS INI: tidak ada data pribadi.
// Yang keluar dari sini hanya ANGKA dan KATEGORI — tanggal, jenis dana, pilar,
// program, ashnaf, nama fundraising, dan jumlah rupiah. Tidak ada nama
// donatur, nomor telepon, surel, alamat, NIK, atau nama penerima.
//
// Alasannya dua, dan keduanya berlaku sekaligus:
// 1) sesi percakapan di modul ini dipakai BERSAMA — apa pun yang masuk ke
//    prompt akan terbaca seluruh tim;
// 2) isi prompt dikirim ke server provider di luar lembaga.
// Menyaring di sini, di satu tempat, jauh lebih mudah dijaga daripada berharap
// setiap pemanggil ingat untuk menyaring sendiri.

const rpc = require('../../api/rpc.js');

/* Kolom yang boleh dibaca — daftar IZIN, bukan daftar larangan. Kalau suatu
   saat ada kolom baru di sheet (mis. "nomorKTP"), ia tertutup dengan
   sendirinya karena tidak ada di sini. Daftar larangan akan kebobolan. */
const KOLOM_HIMPUN = ['tanggal', 'jenisDana', 'subJenis', 'pilar', 'program', 'jumlah', 'fundraising', 'metode'];
const KOLOM_TASYARUF = ['tanggal', 'ashnaf', 'program', 'sumberDana', 'jumlah', 'bentukBantuan'];

function bacaSheet(dbLaz, nama, kolomBoleh) {
  const rows = (dbLaz && dbLaz.sheets && dbLaz.sheets[nama]) || [];
  if (rows.length < 2) return [];
  const kepala = rows[0];
  const pakai = kepala.map((k, i) => (kolomBoleh.includes(k) ? i : -1)).filter((i) => i >= 0);
  return rows.slice(1).map((r) => {
    const o = {};
    for (const i of pakai) o[kepala[i]] = r[i];
    return o;
  });
}

const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const bulanDari = (t) => String(t || '').slice(0, 7);

function jumlahkan(baris, ambilKunci) {
  const peta = {};
  for (const r of baris) {
    const k = String(ambilKunci(r) || '').trim() || '(tidak diisi)';
    peta[k] = (peta[k] || 0) + (Number(r.jumlah) || 0);
  }
  return Object.entries(peta).map(([nama, jumlah]) => ({ nama, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
}

const daftarTeks = (arr, batas = 8) => arr.slice(0, batas)
  .map((x) => `- ${x.nama}: ${rp(x.jumlah)}`).join('\n') || '- (belum ada)';

/* Blok teks ringkas untuk prompt sistem. Sengaja pendek: ia ikut terkirim
   pada SETIAP pertanyaan, jadi tiap baris di sini dibayar berulang kali. */
async function blokRingkas() {
  let db;
  try {
    const r = await rpc._internal.muat();
    db = r.db;
  } catch (e) {
    return { teks: '', galat: e.message || 'basis data tidak terbaca', kosong: true };
  }

  const himpun = bacaSheet(db, 'Penghimpunan', KOLOM_HIMPUN);
  const tasyaruf = bacaSheet(db, 'Pentasyarufan', KOLOM_TASYARUF);
  if (!himpun.length && !tasyaruf.length) {
    return { teks: '', galat: '', kosong: true };
  }

  const semuaBulan = Array.from(new Set(
    himpun.concat(tasyaruf).map((r) => bulanDari(r.tanggal)).filter((b) => /^\d{4}-\d{2}$/.test(b)),
  )).sort();
  const bulanTerakhir = semuaBulan[semuaBulan.length - 1] || '';
  const duaBelas = semuaBulan.slice(-12);

  const totalHimpun = himpun.reduce((s, r) => s + (Number(r.jumlah) || 0), 0);
  const totalTasyaruf = tasyaruf.reduce((s, r) => s + (Number(r.jumlah) || 0), 0);

  const perBulan = duaBelas.map((b) => {
    const h = himpun.filter((r) => bulanDari(r.tanggal) === b).reduce((s, r) => s + (Number(r.jumlah) || 0), 0);
    const t = tasyaruf.filter((r) => bulanDari(r.tanggal) === b).reduce((s, r) => s + (Number(r.jumlah) || 0), 0);
    return `- ${b}: himpun ${rp(h)} · tasyaruf ${rp(t)}`;
  }).join('\n');

  const hBulanIni = himpun.filter((r) => bulanDari(r.tanggal) === bulanTerakhir);
  const tBulanIni = tasyaruf.filter((r) => bulanDari(r.tanggal) === bulanTerakhir);

  const teks = [
    'DATA RINGKAS LAZISMU (angka saja, tanpa data pribadi donatur):',
    `Rentang data: ${semuaBulan[0] || '-'} sampai ${bulanTerakhir || '-'}.`,
    `Total penghimpunan sepanjang data: ${rp(totalHimpun)} dari ${himpun.length} transaksi.`,
    `Total pentasyarufan sepanjang data: ${rp(totalTasyaruf)} dari ${tasyaruf.length} transaksi.`,
    '',
    'Per bulan (maksimal 12 bulan terakhir):',
    perBulan || '- (belum ada)',
    '',
    `Rincian bulan ${bulanTerakhir || '-'} — penghimpunan per jenis dana:`,
    daftarTeks(jumlahkan(hBulanIni, (r) => r.jenisDana)),
    '',
    `Penghimpunan bulan ${bulanTerakhir || '-'} per fundraising/sumber:`,
    daftarTeks(jumlahkan(hBulanIni, (r) => r.fundraising)),
    '',
    `Pentasyarufan bulan ${bulanTerakhir || '-'} per ashnaf:`,
    daftarTeks(jumlahkan(tBulanIni, (r) => r.ashnaf)),
    '',
    'Catatan untuk asisten: angka di atas adalah satu-satunya data lembaga yang',
    'kamu miliki. Kamu TIDAK punya akses ke nama donatur, nomor telepon, atau',
    'alamat. Bila ditanya hal itu, katakan terus terang bahwa data pribadi',
    'sengaja tidak diberikan kepadamu, dan arahkan penanya membukanya langsung',
    'di menu Penghimpunan atau Donatur.',
  ].join('\n');

  return { teks, galat: '', kosong: false, bulanTerakhir, totalHimpun, totalTasyaruf };
}

module.exports = { blokRingkas, bacaSheet, KOLOM_HIMPUN, KOLOM_TASYARUF };
