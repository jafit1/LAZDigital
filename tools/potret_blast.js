/* Uji tampilan halaman Broadcast: apakah benar-benar senada dengan LAZDigital.

   Yang diuji bukan datanya (itu di test_blast.js dan test_agen.js), melainkan
   hal-hal yang membuat sebuah halaman terasa nyempil: huruf yang beda, latar
   yang beda, dropdown bawaan browser di tengah dropdown kustom, tema gelap
   yang tidak ikut berpindah, dan halaman yang melebar di layar HP.

   Datanya dipalsukan semua — server tiruan menjawab /api/blast apa adanya,
   supaya kesebelas halaman bisa digambar tanpa Redis dan tanpa login.

   jalankan:  node tools/test_blast_ui.js
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
/* Playwright dicari di beberapa tempat supaya uji ini bisa dijalankan di
   komputer sendiri, bukan cuma di lingkungan tempat ia ditulis. */
function muatPlaywright() {
  for (const jalur of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(jalur); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang. Jalankan dulu:\n'
    + '  npm i -D playwright\n  npx playwright install chromium\n');
  process.exit(2);
}
const { chromium } = muatPlaywright();

/* Di lingkungan tertentu Chromium sudah tersedia di tempat tetap; kalau tidak
   ada, biarkan Playwright memakai yang ia pasang sendiri. */
const CHROMIUM = require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: '/opt/pw-browsers/chromium' } : {};

const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');



/* ---------- data palsu secukupnya untuk menggambar tiap halaman ---------- */
const PENGGUNA = { id: 'u1', nama: 'Superadmin', username: 'superadmin', peran: 'superadmin', kantor: '' };
const IZIN = ['*'];
const PERANGKAT = [
  { id: 'p1', nama: 'HP Kantor', nomor: '628111000111', driver: 'mandiri', status: 'tersambung', aktif: true, terpakaiHariIni: 12, diperiksa: new Date().toISOString() },
  { id: 'p2', nama: 'HP Cadangan', nomor: '', driver: 'mandiri', status: 'terputus', aktif: true, terpakaiHariIni: 0 },
];
const PESAN = [
  { id: 'm1', nomor: '628111222333', nama: 'Budi', status: 'terkirim', arah: 'keluar', isi: { teks: 'Terima kasih' }, dibuat: new Date().toISOString() },
  { id: 'm2', nomor: '628444555666', nama: 'Siti', status: 'diserahkan', arah: 'keluar', isi: { teks: 'Halo' }, dibuat: new Date().toISOString() },
  { id: 'm3', nomor: '628777888999', nama: 'Ani', status: 'gagal', arah: 'keluar', isi: { teks: 'Coba' }, galatTerakhir: 'Nomor tidak terdaftar', dibuat: new Date().toISOString() },
];
const JAWABAN = {
  'sistem.status': { masuk: true, pengguna: PENGGUNA, izin: IZIN, driver: 'mandiri', lembaga: { nama: 'LAZISMU Daerah Bantul', singkatan: 'Lazismu Bantul' } },
  'sistem.kesiapan': {
    siapDeploy: true, diVercel: false,
    butir: [
      { kode: 'basisdata', label: 'Basis data Upstash Redis tersambung', lolos: true, wajib: true, saran: '' },
      { kode: 'rahasia', label: 'RAHASIA_SESI sudah diganti', lolos: false, wajib: true, saran: 'Ganti di Environment Variables.' },
    ],
  },
  'dasbor.ringkas': {
    hariIni: { total: 20, terkirim: 18, sampai: 15, dibaca: 9, gagal: 2, antre: 3 },
    keseluruhan: { total: 640, terkirim: 600, sampai: 540, dibaca: 300, gagal: 12, antre: 7 },
    grafik: [
      { tanggal: '2026-09-09', total: 12, terkirim: 11, gagal: 1 },
      { tanggal: '2026-09-10', total: 30, terkirim: 29, gagal: 1 },
      { tanggal: '2026-09-11', total: 22, terkirim: 22, gagal: 0 },
    ],
    antrean: { antre: 7, gagal: 3, dalamJamKirim: true, jamKirim: '08:00\u201320:00 WIB' },
    kontak: { total: 540 },
    perangkat: PERANGKAT.map((d) => ({ id: d.id, nama: d.nama, nomor: d.nomor, status: d.status, driver: d.driver })),
    biaya: { perPesan: 0, perkiraanBulanIni: 0, saldoDicatat: 0, peringatan: false },
  },
  'perangkat.daftar': {
    baris: PERANGKAT,
    driver: [
      { nama: 'sandbox', label: 'Sandbox (simulasi)', butuhKredensial: false },
      { nama: 'mandiri', label: 'Gateway sendiri (WhatsApp Web)', butuhKredensial: false },
      { nama: 'fonnte', label: 'Fonnte', butuhKredensial: true },
    ],
  },
  'pesan.daftar': { total: PESAN.length, halaman: 1, perHalaman: 25, baris: PESAN },
  'kontak.daftar': {
    total: 1, halaman: 1, perHalaman: 25,
    baris: [{ id: 'k1', nama: 'Budi', nomor: '628111222333', segmen: ['donatur'], langganan: true, kantor: '' }],
    segmen: ['donatur', 'simpatisan', 'mustahik'],
  },
  'templat.daftar': { baris: [{ id: 't1', nama: 'Ucapan terima kasih', isi: 'Terima kasih {{nama}}', dibuat: new Date().toISOString() }] },
  'massal.daftar': {
    baris: [{
      id: 'b1', nama: 'Kampanye Qurban', status: 'berjalan', total: 100, dibuat: new Date().toISOString(),
      statistik: { antre: 59, terkirim: 40, sampai: 30, dibaca: 12, gagal: 1 },
    }],
  },
  'pengguna.daftar': { baris: [PENGGUNA], peran: ['superadmin', 'admin', 'penyelia', 'petugas', 'kll'] },
  'audit.daftar': { baris: [{ id: 'a1', aksi: 'pesan.kirim', oleh: 'superadmin', waktu: new Date().toISOString(), rincian: { nomor: '628111222333' } }] },
  'webhook.riwayat': {
    baris: [{ id: 'w1', jenis: 'terkirim', kode: 200, waktu: new Date().toISOString(), url: 'https://contoh.test/hook', isi: {} }],
    mati: [],
  },
  'setelan.ambil': {
    setelan: {
      lembaga: { nama: 'LAZISMU Daerah Bantul', singkatan: 'Lazismu Bantul', alamat: 'Bantul', telepon: '', surel: '', situs: '', penandatangan: '' },
      pengirim: { driver: 'mandiri', kodeNegara: '62', efekMengetik: true },
      kirim: { jedaMinDetik: 10, jedaMaksDetik: 20, jamMulai: 8, jamSelesai: 20, batasHarianPerangkat: 800, kirimPerPutaran: 5, percobaanMaks: 3, hormatiJamKirim: true },
      webhook: { aktif: false, url: '', rahasia: '', kejadian: ['terkirim'] },
      biaya: { biayaPerPesan: 0, saldoDicatat: 0, peringatanSaldo: 50000 },
      rekening: [], tampilan: { tema: 'terang', intervalPollingDetik: 10 },
    },
  },
  'antrean.proses': { laporan: { diproses: 0, terkirim: 0, diserahkan: 0, gagal: 0, ditunda: 0, alasan: [] } },
};

const TIPE = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/blast')) {
    let b = '';
    req.on('data', (d) => { b += d; });
    req.on('end', () => {
      let t = '';
      try { t = JSON.parse(b).tindakan; } catch (_) { /* biar jadi tindakan kosong */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.assign({ ok: true }, JAWABAN[t] || {})));
    });
    return;
  }
  const nama = (req.url.split('?')[0] === '/') ? '/blast.html' : req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('tidak ada'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});


const HALAMAN = ['dasbor', 'perangkat', 'kirim', 'massal', 'antrean', 'kontak', 'setelan'];
(async () => {
  await new Promise((r) => server.listen(0, r));
  const A = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  /* Potret layar pemuatan: jawabannya ditahan sebentar supaya sempat terekam. */
  const luarAwal = path.join(__dirname, '..', 'potret');
  fs.mkdirSync(luarAwal, { recursive: true });
  await p.route('**/api/blast', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    try { await route.continue(); } catch (_) { /* halaman sudah pindah */ }
  });
  await p.goto(A + '/blast.html');
  await p.waitForSelector('#boot', { state: 'visible', timeout: 5000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(luarAwal, 'blast-memuat.png') });
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(luarAwal, 'blast-memuat-gelap.png') });
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await p.unroute('**/api/blast').catch(() => {});

  await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
  const luar = path.join(__dirname, '..', 'potret');
  fs.mkdirSync(luar, { recursive: true });
  for (const k of HALAMAN) {
    await p.evaluate((x) => { location.hash = '#' + x; }, k);
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(luar, 'blast-' + k + '.png') });
  }
  await p.evaluate(() => { location.hash = '#dasbor'; });
  await p.click('#tombolTema');
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(luar, 'blast-dasbor-gelap.png') });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('#tombolTema');
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(luar, 'blast-hp.png') });
  await b.close(); server.close();
  console.log('potret selesai');
})().catch((e) => { console.error(e); try { server.close(); } catch (_) {} process.exit(1); });
