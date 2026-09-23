// api/ai.js — satu pintu untuk tindakan modul AI Asisten (selain streaming)
//
// Percakapan yang mengalir ada di api/ai-stream.js karena bentuk balasannya
// berbeda (SSE, bukan JSON sekali kirim). Selebihnya di sini.

const util = require('../lib/blast/util');
const db = require('../lib/ai/db');
const sesi = require('../lib/ai/sesi-laz');
const penyediaLib = require('../lib/ai/penyedia');
const percakapan = require('../lib/ai/percakapan');
const { pengetahuan, prompt, gabungPengetahuan } = require('../lib/ai/pustaka');
const ringkas = require('../lib/ai/ringkas');
const pakai = require('../lib/ai/pakai');

const { sukses, gagal, bacaBody, GalatAplikasi } = util;

const tindakan = {};

function izinTampil(pengguna) {
  return Object.keys(sesi.PETA_IZIN).filter((i) => sesi.bolehAi(pengguna, i));
}

// ================================================================ SISTEM
tindakan['ai.status'] = { async jalankan({ pengguna }) {
  const p = await penyediaLib.untukDipakai('');
  const tahu = await gabungPengetahuan();
  return {
    pengguna: { id: pengguna.id, nama: pengguna.nama, peran: pengguna.peran },
    izin: izinTampil(pengguna),
    superadmin: sesi.bolehPenyedia(pengguna),
    penyediaAktif: p ? { id: p.id, nama: p.nama, model: p.model, bentuk: p.bentuk } : null,
    adaPenyedia: Boolean(p),
    persona: (await prompt.semua()).filter((x) => x.aktif !== false)
      .map((x) => ({ id: x.id, judul: x.judul, jenis: x.jenis, ikon: x.ikon, isi: x.isi })),
    pengetahuan: { jumlah: tahu.jumlah, terpotong: tahu.terpotong },
    upstash: db.pakaiUpstash,
  };
} };

// ================================================================ SESI
tindakan['sesi.daftar'] = { izin: 'sesi.lihat', async jalankan({ data }) {
  return { baris: await percakapan.daftar({ cari: util.bersihkanTeks(data.cari, 80) }) };
} };

tindakan['sesi.buka'] = { izin: 'sesi.lihat', async jalankan({ data }) {
  const s = await percakapan.ambil(data.id);
  if (!s) throw new GalatAplikasi('Percakapan tidak ditemukan', 404);
  return { sesi: s };
} };

tindakan['sesi.buat'] = { izin: 'sesi.kirim', async jalankan({ data, pengguna }) {
  return { sesi: await percakapan.buat(data, pengguna) };
} };

tindakan['sesi.ubah'] = { izin: 'sesi.ubah', async jalankan({ data }) {
  return { sesi: await percakapan.ubah(data.id, data) };
} };

/* Sesi dipakai bersama, jadi menghapusnya berarti menghapus milik orang lain
   juga. Karena itu izinnya 'sesi.hapus' (aksi delete), bukan 'ubah'. */
tindakan['sesi.hapus'] = { izin: 'sesi.hapus', async jalankan({ data }) {
  await percakapan.hapus(data.id);
  return { pesan: 'Percakapan dihapus.' };
} };

tindakan['sesi.hapusBanyak'] = { izin: 'sesi.hapus', async jalankan({ data }) {
  const ids = Array.isArray(data.id) ? data.id : (data.id ? [data.id] : []);
  if (!ids.length) throw new GalatAplikasi('Tidak ada percakapan yang ditandai.', 400);
  let terhapus = 0;
  const gagalList = [];
  for (const i of ids) {
    try { await percakapan.hapus(i); terhapus++; }
    catch (e) { gagalList.push({ id: i, alasan: e.message }); }
  }
  return { terhapus, gagal: gagalList, pesan: `${terhapus} percakapan dihapus.` };
} };

tindakan['sesi.ulangi'] = { izin: 'sesi.kirim', async jalankan({ data }) {
  return { sesi: await percakapan.buangJawabanTerakhir(data.id) };
} };

// ================================================================ PENGETAHUAN & PROMPT
tindakan['pengetahuan.daftar'] = { izin: 'pengetahuan.lihat', async jalankan() {
  const g = await gabungPengetahuan();
  return { baris: await pengetahuan.semua(), gabungan: { panjang: g.teks.length, terpotong: g.terpotong } };
} };
tindakan['pengetahuan.simpan'] = { izin: 'pengetahuan.ubah', async jalankan({ data, pengguna }) {
  return { rec: await pengetahuan.simpan(data, pengguna) };
} };
tindakan['pengetahuan.hapus'] = { izin: 'pengetahuan.ubah', async jalankan({ data }) {
  await pengetahuan.hapus(data.id);
  return { pesan: 'Catatan pengetahuan dihapus.' };
} };

tindakan['prompt.daftar'] = { izin: 'prompt.lihat', async jalankan() {
  return { baris: await prompt.semua() };
} };
tindakan['prompt.simpan'] = { izin: 'prompt.ubah', async jalankan({ data, pengguna }) {
  return { rec: await prompt.simpan(data, pengguna) };
} };
tindakan['prompt.hapus'] = { izin: 'prompt.ubah', async jalankan({ data }) {
  await prompt.hapus(data.id);
  return { pesan: 'Prompt dihapus.' };
} };

// ================================================================ PENYEDIA (superadmin)
tindakan['penyedia.daftar'] = { superadmin: true, async jalankan() {
  return penyediaLib.daftarAman();
} };
tindakan['penyedia.simpan'] = { superadmin: true, async jalankan({ data, pengguna }) {
  return { penyedia: await penyediaLib.simpan(data, pengguna), pesan: 'Provider disimpan.' };
} };
tindakan['penyedia.hapus'] = { superadmin: true, async jalankan({ data }) {
  const p = await penyediaLib.hapus(data.id);
  return { pesan: `Provider "${p.nama}" dihapus.` };
} };
tindakan['penyedia.aktif'] = { superadmin: true, async jalankan({ data }) {
  const p = await penyediaLib.aturAktif(data.id);
  return { penyedia: p, pesan: `Provider aktif: ${p.nama}.` };
} };
tindakan['penyedia.uji'] = { superadmin: true, async jalankan({ data }) {
  const p = await penyediaLib.ambil(data.id);
  if (!p) throw new GalatAplikasi('Provider tidak ditemukan', 404);
  const h = await penyediaLib.uji(p);
  return { ...h, pesan: `Berhasil dalam ${h.ms} ms — balasan: "${h.balasan}"` };
} };

// ================================================================ DATA & PENGGUNAAN
/* Dibuka untuk semua yang boleh chat, supaya siapa pun bisa MEMERIKSA apa
   yang sebenarnya diketahui asisten tentang lembaga. Isinya memang sudah
   disaring bebas data pribadi di lib/ai/ringkas.js. */
tindakan['data.ringkas'] = { izin: 'ai.chat', async jalankan() {
  return ringkas.blokRingkas();
} };

tindakan['pakai.ringkas'] = { izin: 'pakai.lihat', async jalankan({ data }) {
  const bulan = /^\d{4}-\d{2}$/.test(data.bulan || '') ? data.bulan : pakai.bulanIni();
  const d = await pakai.ambilBulan(bulan);
  return {
    bulan,
    daftarBulan: await pakai.daftarBulan(),
    ringkas: d ? { panggilan: d.panggilan, masuk: d.masuk, keluar: d.keluar } : { panggilan: 0, masuk: 0, keluar: 0 },
    perModel: d ? pakai.keArray(d.perModel) : [],
    perPengguna: d ? pakai.keArray(d.perPengguna) : [],
  };
} };

// ---------------------------------------------------------------- penangan
async function wajibMasuk(req) {
  const pengguna = await sesi.penggunaLaz(req);
  if (!pengguna) {
    if (req && req.__alasanAi === 'izin') {
      throw new GalatAplikasi('Akun Anda belum diberi akses modul AI Asisten. Minta admin mencentangnya di Manajemen User.', 403);
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
    req.body = badan;
    nama = String(badan.tindakan || '');
    const data = badan.data || {};

    const pintu = tindakan[nama];
    if (!pintu) return gagal(res, 404, `Tindakan "${nama}" tidak dikenal`);

    const pengguna = await wajibMasuk(req);
    /* Pagar superadmin untuk provider ditegakkan DI SINI, satu tempat. Kalau
       disebar ke tiap tindakan, tindakan provider baru yang lupa memasangnya
       akan terbuka diam-diam — dan di baliknya ada kunci API lembaga. */
    if (pintu.superadmin && !sesi.bolehPenyedia(pengguna)) {
      throw new GalatAplikasi('Hanya superadmin yang boleh mengatur provider AI.', 403);
    }
    if (pintu.izin && !sesi.bolehAi(pengguna, pintu.izin)) {
      throw new GalatAplikasi('Anda tidak berhak melakukan tindakan ini.', 403);
    }

    const hasil = await pintu.jalankan({ data, pengguna, req, res });
    return sukses(res, hasil || {});
  } catch (e) {
    const kode = e.kode || 500;
    if (kode >= 500) console.error(`[ai] ${nama}:`, e);
    return gagal(res, kode, e.message || 'Terjadi kesalahan di server', kode >= 500 ? { tindakan: nama } : {});
  }
};

module.exports.tindakan = tindakan;
