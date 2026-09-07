/* ============================================================
   CADANGAN OTOMATIS & PEMULIHAN  —  /api/backup

   Dua jalur masuk:
   1. Cron Vercel (harian, lihat vercel.json). Vercel mengirim header
      "Authorization: Bearer <CRON_SECRET>". Tanpa secret yang cocok, ditolak.
   2. Manual dari halaman Perawatan: POST {aksi, token, ...} atas nama
      pengguna yang login; izinnya diperiksa engine (apiCekIzin / superadmin).

   Setiap cadangan disimpan ke DUA tempat:
   - Salinan cepat di Redis (kunci terpisah dari basis data utama), disimpan
     14 hari terakhir — untuk pulih dalam hitungan detik dari halaman Perawatan.
   - Berkas JSON di Google Drive (30 terakhir) — cadangan lepas-pantai bila
     Redis-nya sendiri yang bermasalah.
   Saat dijalankan di komputer sendiri tanpa Redis, salinan masuk ke folder
   data/cadangan/.
   ============================================================ */
const engine = require('./_engine.js');
const rpc = require('./rpc.js');
const drive = require('./_drive.js');
const fs = require('fs');
const path = require('path');

const { muat, tulisRedis, redis, PAKAI_REDIS } = rpc._internal;
const AWALAN_KUNCI = 'laz:cadangan:';
const KUNCI_DAFTAR = 'laz:cadangan:_daftar';
const DIR_LOKAL = path.join(process.cwd(), 'data', 'cadangan');
const SIMPAN_HARIAN = 14, SIMPAN_MANUAL = 5, SIMPAN_DRIVE = 30;
const BATAS_PERINGATAN_BYTE = 800 * 1024;     /* paket gratis Upstash: 1 MB per permintaan */

/* ─── waktu Indonesia (WIB) untuk penamaan ─── */
function wib(){ return new Date(Date.now() + 7 * 3600 * 1000); }
function tglWIB(){ return wib().toISOString().slice(0, 10); }
function jamWIB(){ return wib().toISOString().slice(11, 16).replace(':', ''); }

/* ─── penyimpanan salinan: Redis atau berkas lokal ─── */
async function bacaDaftar(){
  if (!PAKAI_REDIS) {
    if (!fs.existsSync(DIR_LOKAL)) return [];
    return fs.readdirSync(DIR_LOKAL).filter(f => f.endsWith('.json')).map(f => {
      const st = fs.statSync(path.join(DIR_LOKAL, f));
      return { nama: f.replace(/\.json$/, ''), waktu: st.mtime.toISOString(), ukuran: st.size };
    }).sort((a, b) => (a.waktu < b.waktu ? 1 : -1));
  }
  const r = await redis(['GET', KUNCI_DAFTAR]);
  try { return r ? JSON.parse(r) : []; } catch (e) { return []; }
}
async function tulisDaftar(d){ if (PAKAI_REDIS) await redis(['SET', KUNCI_DAFTAR, JSON.stringify(d)]); }

async function simpanSalinan(nama, teks){
  if (!PAKAI_REDIS) {
    if (!fs.existsSync(DIR_LOKAL)) fs.mkdirSync(DIR_LOKAL, { recursive: true });
    fs.writeFileSync(path.join(DIR_LOKAL, nama + '.json'), teks);
    return;
  }
  await redis(['SET', AWALAN_KUNCI + nama, teks]);
  const d = (await bacaDaftar()).filter(x => x.nama !== nama);
  d.unshift({ nama, waktu: new Date().toISOString(), ukuran: teks.length });
  await tulisDaftar(d);
}
async function bacaSalinan(nama){
  nama = String(nama || '').replace(/[^A-Za-z0-9_\-]/g, '');
  if (!nama) return null;
  if (!PAKAI_REDIS) {
    const f = path.join(DIR_LOKAL, nama + '.json');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  }
  return redis(['GET', AWALAN_KUNCI + nama]);
}
async function hapusSalinan(nama){
  if (!PAKAI_REDIS) { try { fs.unlinkSync(path.join(DIR_LOKAL, nama + '.json')); } catch (e) {} return; }
  await redis(['DEL', AWALAN_KUNCI + nama]);
  await tulisDaftar((await bacaDaftar()).filter(x => x.nama !== nama));
}
/* Sisakan N salinan terbaru per jenis awalan. */
async function pangkasSalinan(awalan, simpan){
  const d = (await bacaDaftar()).filter(x => x.nama.indexOf(awalan) === 0);
  for (const x of d.slice(simpan)) await hapusSalinan(x.nama);
}

/* ─── ubah basis data utama dengan compare-and-set ─── */
async function ubahDB(kerja){
  for (let i = 1; i <= 4; i++) {
    const r = await muat();
    const out = await kerja(r.db);
    if (!out.db.props) out.db.props = {};
    out.db.props._ver = (Number(out.db.props._ver) || 0) + 1;
    if (!PAKAI_REDIS) {
      const dir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'laz-db-local.json'), JSON.stringify(out.db, null, 2));
      return out;
    }
    if (await tulisRedis(out.db, r.ver)) return out;
    await new Promise(t => setTimeout(t, 80 * i));
  }
  throw new Error('Basis data sedang diubah pengguna lain, coba lagi.');
}

/* ─── inti: buat cadangan & sebarkan ─── */
async function jalankanCadangan(jenis, oleh){
  const r = await muat();
  const isi = engine.buatCadangan(r.db, oleh);
  const teks = JSON.stringify(isi);
  const nama = jenis === 'harian' ? 'harian-' + tglWIB() : jenis + '-' + tglWIB() + '_' + jamWIB();
  const status = {
    waktu: new Date().toISOString(), jenis, oleh, nama,
    ukuranCadangan: teks.length, ukuranDB: (r.teks || '').length,
    redis: null, drive: null, peringatan: []
  };

  try {
    await simpanSalinan(nama, teks);
    if (jenis === 'harian') await pangkasSalinan('harian-', SIMPAN_HARIAN);
    if (jenis === 'manual') await pangkasSalinan('manual-', SIMPAN_MANUAL);
    status.redis = { ok: true, tempat: PAKAI_REDIS ? 'Redis' : 'data/cadangan/' };
  } catch (e) { status.redis = { ok: false, galat: e.message }; }

  if (drive.driveSiap()) {
    try {
      const f = await drive.unggah('laz-cadangan-' + tglWIB() + '_' + jamWIB() + '.json', teks);
      const p = await drive.pangkas('laz-cadangan-', SIMPAN_DRIVE);
      status.drive = { ok: true, id: f.id, nama: f.name, tersimpan: p.total - p.dihapus };
    } catch (e) { status.drive = { ok: false, galat: e.message }; }
  } else {
    status.drive = { ok: false, galat: 'Google Drive belum dikonfigurasi (lihat PANDUAN-CADANGAN.md)' };
  }

  if (status.ukuranDB > BATAS_PERINGATAN_BYTE) {
    status.peringatan.push('Ukuran basis data ' + Math.round(status.ukuranDB / 1024) + ' KB mendekati batas 1 MB paket gratis Upstash. Pertimbangkan naik paket atau mengarsipkan data lama.');
  }
  if (!status.redis.ok && !status.drive.ok) status.peringatan.push('CADANGAN GAGAL DI SEMUA TUJUAN.');

  /* catat status ke basis data supaya terlihat di halaman Perawatan — best effort */
  try { await ubahDB(async db => ({ db: engine.catatStatusCadangan(db, status) })); } catch (e) { status.peringatan.push('Status tidak tercatat: ' + e.message); }
  return status;
}

/* ─── pulihkan ─── */
async function jalankanPulihkan(token, sumber, konfirmasi){
  /* 1. ambil isi cadangan DULU: dari salinan tersimpan, atau berkas unggahan.
        Harus sebelum langkah 2 — kalau yang dipulihkan adalah "sebelum-pulih"
        itu sendiri (membatalkan pemulihan), menyimpan lebih dulu akan
        menimpanya dengan keadaan sekarang. */
  let isi = sumber && sumber.isi;
  if (sumber && sumber.nama) {
    const teks = await bacaSalinan(sumber.nama);
    if (!teks) throw new Error('Salinan "' + sumber.nama + '" tidak ditemukan.');
    isi = teks;
  }
  if (!isi) throw new Error('Tidak ada cadangan yang dipilih.');

  /* 2. simpan keadaan sekarang sebagai "sebelum-pulih" supaya bisa dibatalkan */
  const kini = await muat();
  await simpanSalinan('sebelum-pulih', JSON.stringify(engine.buatCadangan(kini.db, 'sistem (sebelum pulih)')));

  /* 3. jalankan pemulihan lewat engine (yang memeriksa superadmin & konfirmasi) */
  let hasil = null;
  await ubahDB(async db => {
    const out = await engine.runRPC(db, 'apiPulihkanDB', [token, isi, konfirmasi], {});
    hasil = out.result; return out;
  });
  return hasil;
}

/* ─── HTTP ─── */
module.exports = async (req, res) => {
  try {
    const auth = String(req.headers['authorization'] || '');
    const secret = process.env.CRON_SECRET || '';
    const dariCron = !!secret && auth === 'Bearer ' + secret;

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
    body = body || {};
    const aksi = body.aksi || (req.method === 'GET' ? 'cadangkan' : '');
    const token = body.token || '';

    if (dariCron) {
      const st = await jalankanCadangan('harian', 'cron');
      res.status(200).json({ result: st }); return;
    }
    if (!token) {
      res.status(secret ? 401 : 500).json({ __error: secret
        ? 'Tidak berwenang.'
        : 'CRON_SECRET belum disetel di Vercel, cadangan harian belum aktif.' });
      return;
    }

    /* jalur manual — izin diperiksa engine */
    const r = await muat();
    async function butuhIzin(modul, aksiIzin){ await engine.runRPC(r.db, 'apiCekIzin', [token, modul, aksiIzin], {}); }

    if (aksi === 'cadangkan') {
      await butuhIzin('settings', 'edit');
      const who = (await engine.runRPC(r.db, 'apiCekIzin', [token, 'settings', 'edit'], {})).result.username;
      res.status(200).json({ result: await jalankanCadangan('manual', who) }); return;
    }
    if (aksi === 'daftar') {
      await butuhIzin('settings', 'view');
      const salinan = await bacaDaftar();
      let driveFiles = null, driveGalat = '';
      if (drive.driveSiap()) { try { driveFiles = (await drive.daftar('laz-cadangan-')).slice(0, 10); } catch (e) { driveGalat = e.message; } }
      res.status(200).json({ result: {
        salinan, drive: driveFiles, driveSiap: drive.driveSiap(), driveGalat,
        cronSiap: !!secret, tempat: PAKAI_REDIS ? 'Redis' : 'data/cadangan/',
        status: (r.db.props && r.db.props._cadanganTerakhir) || null,
        ukuranDB: (r.teks || '').length, batasPeringatan: BATAS_PERINGATAN_BYTE
      } }); return;
    }
    if (aksi === 'ambil') {
      await butuhIzin('settings', 'edit');
      const teks = await bacaSalinan(body.nama);
      if (!teks) { res.status(200).json({ __error: 'Salinan tidak ditemukan.' }); return; }
      res.status(200).json({ result: { nama: body.nama, isi: teks } }); return;
    }
    if (aksi === 'pulihkan') {
      const hasil = await jalankanPulihkan(token, { nama: body.nama, isi: body.isi }, body.konfirmasi);
      res.status(200).json({ result: hasil }); return;
    }
    res.status(200).json({ __error: 'Aksi tidak dikenal: ' + aksi });
  } catch (err) {
    res.status(200).json({ __error: (err && err.message) || String(err) });
  }
};

module.exports._internal = { jalankanCadangan, jalankanPulihkan, bacaDaftar, bacaSalinan, simpanSalinan };
