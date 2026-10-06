/* Potret dasbor utama di lebar HP memakai ENGINE ASLI atas data tiruan (tanpa data lembaga sungguhan).
 * Dipakai untuk mengukur kartu widget (Tunai & Non Tunai, Sebaran Dana, dll.): meluber, terpotong, tidak selebar layar.
 *   node tools/potret_dasbor_hp.js [lebar] [folder-foto]
 * Keluaran: JSON ukuran tiap widget + berkas dasbor-<lebar>.png. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = (() => { for (const j of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(j); } catch (_) {} } process.exit(2); })();
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const AKAR = path.join(__dirname, '..'), PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js')), skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const LEBAR = Number(process.argv[2]) || 390, FOTO = process.argv[3] || '/tmp/foto';
const tema = process.env.LZ_TEMA || 'light';
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
  tambah('Rekening', { id: 'r1', namaBank: 'Bank Contoh', nomor: '1234567890', atasNama: 'Lazismu Contoh', fundGroup: 'Infak', aktif: 'true' });
  tambah('Rekening', { id: 'r2', namaBank: 'Bank Syariah Contoh', nomor: '9988776655', atasNama: 'Lazismu Contoh', fundGroup: 'Zakat', aktif: 'true' });
  const jenis = ['Zakat', 'Infak', 'Infak Terikat', 'Wakaf'], metode = ['Cash/Tunai', 'Transfer Bank', 'QRIS'];
  for (let i = 0; i < 24; i++) tambah('Penghimpunan', { id: 'h' + i, tanggal: tgl(-(i % 9)), jenisDana: jenis[i % 4], subJenis: 'Umum', pilar: ['Pendidikan', 'Kesehatan', 'Ekonomi'][i % 3], program: ['Beasiswa Anak Negeri', 'Klinik Sehat', 'Usaha Mandiri'][i % 3], namaDonatur: 'Donatur ' + i, jumlah: 100000 * (i + 1), metode: metode[i % 3], rekeningId: i % 3 ? 'r' + (1 + i % 2) : '', dibuat: new Date().toISOString() });
  for (let i = 0; i < 8; i++) tambah('Pentasyarufan', { id: 'p' + i, tanggal: tgl(-i), ashnaf: ['Fakir', 'Miskin', 'Fisabilillah'][i % 3], program: 'Beasiswa Anak Negeri', sumberDana: jenis[i % 4], namaPenerima: 'Penerima ' + i, jumlah: 150000 * (i + 1), metode: metode[i % 3], rekeningId: i % 3 ? 'r1' : '' });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: LEBAR, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript((x) => { try { localStorage.setItem('laz_token', x.t); localStorage.setItem('laz_theme', x.tema); if (x.lay) localStorage.setItem('laz_dashlayout', x.lay); } catch (_) {} }, { t: TOKEN, tema, lay: process.env.LZ_LAY || '' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('GALAT', String(e).slice(0, 160)));
  await p.goto(A + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.dgrid .wc', { timeout: 20000 });
  await p.waitForTimeout(2200);
  const u = await p.evaluate(() => ({
    lebarLayar: innerWidth, scrollW: document.documentElement.scrollWidth,
    wc: [...document.querySelectorAll('.dgrid .wc')].map((w) => {
      const r = w.getBoundingClientRect();
      const luber = [...w.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > r.right + 1 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0 && e.children.length === 0); }).slice(0, 3).map((e) => e.className || e.tagName);
      return { judul: (w.querySelector('.wc-t') || {}).textContent, kiri: Math.round(r.left), lebar: Math.round(r.width), tinggi: Math.round(r.height), luber };
    }),
  }));
  console.log(JSON.stringify(u, null, 1));
  fs.mkdirSync(FOTO, { recursive: true });
  await p.screenshot({ path: path.join(FOTO, 'dasbor-' + LEBAR + '.png'), fullPage: true });
  await b.close(); srv.close();
  setTimeout(() => process.exit(0), 200).unref();
})().catch((e) => { console.error(e); process.exit(1); });
