/* Uji kestabilan seret Atur Layout: selama menyeret, kartu yang ditumpangkan
 * tidak boleh berubah ukuran/posisi secara kasar dan placeholder tidak boleh
 * melompat-lompat antar posisi saat pointer diam-di-ujung pergerakan halus.
 * Keluhan pemilik (26 Nov 2026): "loncat-loncat bagian yang diklik".
 *   node tools/test_dasbor_drag_stabil.js */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = (() => { for (const j of ['playwright']) { try { return require(j); } catch (_) {} } process.exit(2); })();
const CHROMIUM = require('./_luncurkan.js')(process.env.LZ_EXE ? { executablePath: process.env.LZ_EXE } : {});
const AKAR = path.join(__dirname, '..'), PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js')), skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
let DB = null, TOKEN = '';
const tgl = (g) => new Date(Date.now() + 7 * 3600e3 + (g || 0) * 864e5).toISOString().slice(0, 10);
const tambah = (n, o) => { const t = DB.sheets[n], h = t[0]; t.push(h.map((k) => (o[k] === undefined ? '' : o[k]))); };
const rpc = async (fn, a) => { const o = await engine.runRPC(DB, fn, a, {}); DB = o.db; return o.result; };
const srv = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/rpc' && req.method === 'POST') {
    let b = ''; for await (const c of req) b += c; const j = JSON.parse(b || '{}');
    res.setHeader('Content-Type', 'application/json');
    try { const o = await engine.runRPC(DB, j.fn, j.args || [], { ip: '127.0.0.1', ua: 'uji' }); DB = o.db; res.end(JSON.stringify({ result: o.result })); }
    catch (e) { res.end(JSON.stringify({ __error: e.message })); }
    return;
  }
  const f = path.join(PUBLIK, url === '/' ? 'index.html' : url);
  if (url.startsWith('/api/') || !f.startsWith(PUBLIK) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(''); }
  res.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
(async () => {
  const s = {}; for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  TOKEN = (await rpc('login', ['superadmin', 'Admin12345'])).token;
  await rpc('apiSaveLayanan', [TOKEN, { tipe: 'KLL', nama: 'Kota Contoh', aktif: 'true' }]);
  tambah('Rekening', { id: 'r1', namaBank: 'Bank Contoh', nomor: '123', atasNama: 'x', fundGroup: 'Infak', aktif: 'true' });
  const jenis = ['Zakat', 'Infak', 'Infak Terikat', 'Wakaf'], metode = ['Cash/Tunai', 'Transfer Bank', 'QRIS'];
  for (let i = 0; i < 24; i++) tambah('Penghimpunan', { id: 'h' + i, tanggal: tgl(-(i % 9)), jenisDana: jenis[i % 4], subJenis: 'Umum', pilar: ['Pendidikan', 'Kesehatan', 'Ekonomi'][i % 3], program: 'Beasiswa', namaDonatur: i % 3 === 0 ? 'KLL Kota Contoh' : 'Donatur ' + i, jumlah: 100000 * (i + 1), metode: metode[i % 3], rekeningId: 'r1', dibuat: new Date().toISOString() });
  for (let i = 0; i < 8; i++) tambah('Pentasyarufan', { id: 'p' + i, tanggal: tgl(-i), ashnaf: 'Fakir', program: 'Beasiswa', sumberDana: jenis[i % 4], namaPenerima: 'Penerima ' + i, jumlah: 150000 * (i + 1), metode: metode[i % 3], rekeningId: 'r1' });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript((x) => { try { localStorage.setItem('laz_token', x.t); localStorage.setItem('laz_theme', 'light'); } catch (_) {} }, { t: TOKEN });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('GALAT', String(e).slice(0, 160)));
  await p.goto(A + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.dgrid .wc', { timeout: 20000 });
  await p.waitForFunction(() => !document.querySelector('.lz-muat'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);

  let ok = 0, g = 0;
  const cek = (n, sy, i) => { if (sy) { ok++; console.log('  OK   | ' + n); } else { g++; console.log('  GAGAL| ' + n + (i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 300))); } };

  await p.evaluate(() => document.getElementById('dashEditBtn').click());
  await p.waitForSelector('.dgrid .wc .drag-handle', { timeout: 8000 });
  await p.waitForTimeout(300);

  const kotak = (id) => p.evaluate((id) => { const w = [...document.querySelectorAll('.dgrid .wc')].find((x) => x.getAttribute('data-id') === id); if (!w) return null; const r = w.getBoundingClientRect(); return { kiri: Math.round(r.left), atas: Math.round(r.top), lebar: Math.round(r.width), tinggi: Math.round(r.height) }; }, id);

  // Ambil kartu Pilar (index 1) dan titik tekan pada teks judulnya
  const mulai = await kotak('pilar');
  const px = mulai.kiri + mulai.lebar / 2, py = mulai.atas + 14;

  await p.mouse.move(px, py);
  await p.mouse.down();
  await p.waitForTimeout(120);

  /* Sampel posisi kartu GANTUNGAN dan placeholder, dengan pointer DITAHAN
   * diam lalu digerakkan halus 6 px per langkah (seperti tangan manusia).
   * Yang diuji: kartu gantungan TIDAK melompat posisi/ukuran selama drag
   * (dulu: fixed dihitung ulang oleh layout flex yang berubah-ubah) dan
   * placeholder tidak bergantian posisi tiap mikro-gerakan. */
  const sampel = [];
  for (let i = 0; i < 10; i++) {
    await p.mouse.move(px + i * 6, py + i * 2);
    await p.waitForTimeout(60);
    const s = await p.evaluate(() => {
      const g = document.querySelector('.wc.dragging-floating');
      const ph = document.querySelector('.wc-placeholder');
      const gr = g && g.getBoundingClientRect();
      const pr = ph && ph.getBoundingClientRect();
      return {
        g: gr ? [Math.round(gr.left), Math.round(gr.top), Math.round(gr.width), Math.round(gr.height)] : null,
        p: pr ? [Math.round(pr.left), Math.round(pr.top)] : null,
        pIdx: ph ? [...document.querySelectorAll('.dgrid .wc')].indexOf(ph) : -1,
      };
    });
    sampel.push(s);
  }
  await p.mouse.up();
  await p.waitForTimeout(300);

  /* 1. Kartu gantungan tetap DI TEMPAT pointer (dulu: melompat karena posisi
   *    fixed dikoreksi ulang saat flex berubah). Ukuran tidak boleh berubah. */
  const lebarTetap = new Set(sampel.map((s) => s.g && s.g[2]));
  cek('Kartu gantungan tidak berubah ukuran selama seretan', sampel.every((s) => s.g) && lebarTetap.size === 1, sampel.map((s) => s.g));

  /* 2. Gerakan kartu mengikuti pointer dengan mulus: antar sampel berjarak
   *    kecil (<= 14 px per langkah 6 px), bukan lompatan puluhan piksel. */
  let lompat = 0;
  for (let i = 1; i < sampel.length; i++) {
    const dx = Math.abs(sampel[i].g[0] - sampel[i - 1].g[0]), dy = Math.abs(sampel[i].g[1] - sampel[i - 1].g[1]);
    if (dx > 14 || dy > 14) lompat++;
  }
  cek('Kartu gantungan mengikuti pointer dengan halus (tanpa lompatan > 14 px)', lompat === 0, { lompat, sampel: sampel.map((s) => s.g) });

  /* 3. Placeholder tidak bergetar bolak-balik: jumlah pergantian indeks
   *    rendah untuk gerakan satu arah 60 px. */
  let getar = 0;
  for (let i = 1; i < sampel.length; i++) if (sampel[i].pIdx !== sampel[i - 1].pIdx) getar++;
  cek('Placeholder tidak bergetar bolak-balik (pergantian posisi <= 3)', getar <= 3, { getar, pIdx: sampel.map((s) => s.pIdx) });

  console.log('\ntest_dasbor_drag_stabil.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  await b.close(); srv.close();
  setTimeout(() => process.exit(g ? 1 : 0), 200).unref();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
