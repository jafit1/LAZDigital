/* Potret dokumen cetak (Cetak Harian, Formulir A2) dari engine asli atas data tiruan: membangun HTML cetaknya lewat fungsi
 * aplikasi, mencetaknya jadi PDF lewat peramban (ukuran kertas dari @page), lalu menjadikannya gambar.
 *   node tools/potret_cetak.js harian|a2 [folder-keluaran] [jumlahTransaksi]
 * Keluaran: <folder>/<jenis>.pdf dan <jenis>-N.png (butuh pdftoppm). */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { spawnSync } = require('child_process');
const { chromium } = (() => { for (const j of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(j); } catch (_) {} } process.exit(2); })();
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const AKAR = path.join(__dirname, '..'), PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js')), skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const JENIS = process.argv[2] || 'harian', OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'cetak-')), N = Number(process.argv[4]) || 14;
let DB = null, TOKEN = '';
const hari = (new Date(Date.now() + 7 * 3600e3)).toISOString().slice(0, 10);
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
  await rpc('apiSaveLayanan', [TOKEN, { tipe: 'ULL', nama: 'Masjid Baiturrahman Aceh', aktif: 'true' }]);
  tambah('Rekening', { id: 'r1', namaBank: 'Bank Syariah Contoh', nomor: '1234567890', atasNama: 'Lazismu Contoh', fundGroup: 'Infak', aktif: 'true' });
  const jenis = ['Zakat', 'Infak', 'Infak Terikat', 'Wakaf', 'Infak'], metode = ['Cash/Tunai', 'Transfer Bank', 'QRIS'];
  const nama = ['Ahmad Fauzi Rahmatullah', 'Siti Nurhaliza', 'Hamba Allah', 'PT Maju Bersama Sejahtera Abadi', 'Muhammad Ridwan', 'Dewi Lestari', 'Budi Santoso', 'Yayasan Pendidikan Islam Al-Hikmah Bantul', 'Rina Wati', 'Joko Susilo'];
  const fr = ['', 'Tim Bantul Kota', 'Tim Sewon', ''];
  for (let i = 0; i < N; i++) tambah('Penghimpunan', { id: 'h' + i, noKwitansi: 'KW/' + hari.slice(0, 7).replace('-', '') + '/' + ('000' + (i + 1)).slice(-4), tanggal: hari, jenisDana: jenis[i % 5], subJenis: i % 5 === 0 ? 'Zakat Mal' : (i % 5 === 2 ? 'Infak Terikat' : jenis[i % 5]), pilar: i % 5 === 2 ? 'Pendidikan' : '', program: ['Beasiswa Anak Negeri', 'Klinik Sehat', 'Usaha Mandiri'][i % 3], namaDonatur: nama[i % nama.length], jumlah: [125000, 2350700, 50000, 10000000, 750000, 300000][i % 6], metode: metode[i % 3], rekeningId: i % 3 === 1 ? 'r1' : '', fundraising: fr[i % 4], petugas: 'Super Administrator', dibuat: new Date().toISOString() });
  for (let i = 0; i < Math.ceil(N / 3); i++) tambah('Pentasyarufan', { id: 'p' + i, noBukti: 'BPT/' + hari.slice(0, 7).replace('-', '') + '/' + ('000' + (i + 1)).slice(-4), tanggal: hari, ashnaf: ['Fakir', 'Miskin', 'Fisabilillah'][i % 3], program: ['Beasiswa Anak Negeri', 'Klinik Sehat'][i % 2], sumberDana: jenis[i % 4], namaPenerima: 'Penerima ' + nama[(i + 3) % nama.length], bentukBantuan: ['Uang Tunai', 'Barang'][i % 2], jumlah: 500000 * (i + 1), metode: metode[i % 3], rekeningId: '', petugas: 'Super Administrator', dibuat: new Date().toISOString() });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + srv.address().port;
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript((x) => { try { localStorage.setItem('laz_token', x.t); localStorage.setItem('laz_theme', 'light'); } catch (_) {} }, { t: TOKEN });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('GALAT', String(e).slice(0, 160)));
  await p.goto(A + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.dgrid .wc', { timeout: 20000 });
  const html = await p.evaluate(async ([jenisDok, tgl]) => {
    const d = await gas('apiLaporanHarian')(TOKEN, tgl);
    if (jenisDok === 'a2') { A2_DATA = d; return buildA2HTML(d, { kota: 'Bantul', kasir: 'Nama Kasir', keuangan: 'Nama Keuangan', lembar: d.ringkas.himpunCount }); }
    return buildHarianHTML(d);
  }, [JENIS, hari]);
  const p2 = await ctx.newPage();
  await p2.setContent(html, { waitUntil: 'domcontentloaded' });
  const pdf = path.join(OUT, JENIS + '.pdf');
  await p2.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  spawnSync('pdftoppm', ['-r', '90', '-png', pdf, path.join(OUT, JENIS)]);
  const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout || '';
  console.log(OUT); console.log((info.match(/Pages:.*/) || [])[0], (info.match(/Page size:.*/) || [])[0]);
  await b.close(); srv.close();
  setTimeout(() => process.exit(0), 200).unref();
})().catch((e) => { console.error(e); process.exit(1); });
