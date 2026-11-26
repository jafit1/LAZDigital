/* Potret dasbor utama di lebar HP memakai ENGINE ASLI atas data tiruan (tanpa data lembaga sungguhan).
 * Dipakai untuk mengukur kartu widget (Tunai & Non Tunai, Sebaran Dana, dll.): meluber, terpotong, tidak selebar layar.
 *   node tools/potret_dasbor_hp.js [lebar] [folder-foto]
 * Keluaran: JSON ukuran tiap widget + berkas dasbor-<lebar>.png. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = (() => { for (const j of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(j); } catch (_) {} } process.exit(2); })();
/* LZ_EXE: memakai peramban tertentu bila versi cache Playwright tidak cocok (mesin Windows pemilik). */
const CHROMIUM = require('./_luncurkan.js')(process.env.LZ_EXE ? { executablePath: process.env.LZ_EXE } : fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
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
  /* Setiap donatur ketiga memakai nama kantor layanan yang sudah terdaftar, supaya widget
   * Monitoring Kantor Layanan punya isinya saat diuji (transaksi tanpa penanda kantor
   * memang jatuhnya ke Penghimpunan Daerah, bukan ke kantor). */
  for (let i = 0; i < 24; i++) tambah('Penghimpunan', { id: 'h' + i, tanggal: tgl(-(i % 9)), jenisDana: jenis[i % 4], subJenis: 'Umum', pilar: ['Pendidikan', 'Kesehatan', 'Ekonomi'][i % 3], program: ['Beasiswa Anak Negeri', 'Klinik Sehat', 'Usaha Mandiri'][i % 3], namaDonatur: i % 3 === 0 ? 'KLL Kota Contoh' : 'Donatur ' + i, jumlah: 100000 * (i + 1), metode: metode[i % 3], rekeningId: i % 3 ? 'r' + (1 + i % 2) : '', dibuat: new Date().toISOString() });
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
  /* Layar loading logo (posisi fixed + backdrop blur) ikut tergambar di potret
   * fullPage dan menutupi dasbornya; dibuka sebelum memotret. Pengukuran
   * tidak terpengaruh karena .dgrid .wc sudah terpasang sebelum ini. */
  await p.evaluate(() => {
    document.querySelectorAll('.lz-muat').forEach((e) => e.remove());
    document.documentElement.classList.remove('lz-muat-aktif');
    /* Layar loading statis (bekas fade setengah jadi membuat tirai putih di
     * potret) dan sisa blur animasi halaman. */
    document.querySelectorAll('#boot, .lz.lz--full').forEach((e) => { e.style.display = 'none'; });
    document.querySelectorAll('#content, .dash-wrap, .dgrid .wc').forEach((e) => { e.style.filter = 'none'; e.style.opacity = '1'; });
  });
  await p.waitForTimeout(1200);
  /* Render fullPage menggambar halaman bagian demi bagian; animasi fadeUp .wc
   * (delay sampai .28s + durasi .5s) dan fadeUp .kpi-v2 terpicu ulang untuk
   * bagian bawah, sehingga foto memotong tengah animasi (blur/geser).
   * Pembekuan ditulis SETELAH pudaran layar loading selesai — membekukan
   * lebih awal menjebak tirainya di tengah jalan (terukur alfa 0,62).
   * .lz-muat dibunuh di stylesheet (bukan sekadar dihapus dari DOM): aplikasi
   * memasangnya ulang saat pemuatan selesai dan foto menangkap tirainya. */
  await p.addStyleTag({ content: '*, *::before, *::after{animation:none !important;transition:none !important;filter:none !important} .lz-muat,#boot,.lz.lz--full{display:none !important}' });
  await p.waitForTimeout(400);
  const u = await p.evaluate(() => ({
    lebarLayar: innerWidth, scrollW: document.documentElement.scrollWidth,
    wc: [...document.querySelectorAll('.dgrid .wc')].map((w) => {
      const r = w.getBoundingClientRect();
      const luber = [...w.querySelectorAll('*')].filter((e) => { if (e.ownerSVGElement) return false; const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > r.right + 1 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0 && !(e.children && e.children.length)); }).slice(0, 3).map((e) => (typeof e.className === 'string' && e.className) ? e.className : e.tagName);
      const b = w.querySelector('.wc-b');
      return { judul: (w.querySelector('.wc-t') || {}).textContent, kiri: Math.round(r.left), atas: Math.round(r.top), lebar: Math.round(r.width), tinggi: Math.round(r.height), isiTampil: !!b && getComputedStyle(b).display !== 'none', luber };
    }),
    kpi: [...document.querySelectorAll('.kpis-v2 .kpi-v2')].map((k) => { const r = k.getBoundingClientRect(); return { label: (k.querySelector('.kpi-v2-label') || {}).textContent, kiri: Math.round(r.left), atas: Math.round(r.top), lebar: Math.round(r.width), tinggi: Math.round(r.height) }; }),
  }));
  console.log(JSON.stringify(u, null, 1));
  fs.mkdirSync(FOTO, { recursive: true });
  /* fullPage:true di Chrome pada halaman berlatar gradien menggambar selubung
   * putih di viewport pertama (DOM terukur jernih, foto berkabut). Caranya:
   * viewport ditinggikan setinggi halaman, foto biasa tanpa fullPage. */
  const tinggiHalaman = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  await p.setViewportSize({ width: LEBAR, height: Math.min(tinggiHalaman, 8000) });
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(FOTO, 'dasbor-' + LEBAR + '.png') });
  await b.close(); srv.close();
  setTimeout(() => process.exit(0), 200).unref();
})().catch((e) => { console.error(e); process.exit(1); });
