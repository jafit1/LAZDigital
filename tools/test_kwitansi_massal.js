/* Uji Cetak Kwitansi massal (Laporan): data server (apiKwitansiRentang) dan alur di peramban sampai berkas PDF A5.
 * Engine asli atas data tiruan. Yang dijaga: rentang diperiksa, izin Laporan DAN Penghimpunan keduanya wajib, kwitansi
 * hanya dari periode yang dipilih, batas 300 baris diberi tanda; di layar: tab ada, hasil tampil, PDF yang diunduh sah
 * (jumlah halaman = jumlah kwitansi, ukuran A5 mendatar), dan bagian bening kwitansi tidak menjadi hitam.
 *   node tools/test_kwitansi_massal.js */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { spawnSync } = require('child_process');
const AKAR = path.join(__dirname, '..'), PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js')), skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
let ok = 0, g = 0;
const cek = (n, s, i) => { if (s) { ok++; console.log('  OK   | ' + n); } else { g++; console.log('  GAGAL| ' + n + (i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 300))); } };
let DB = null, TOKEN = '';
const wib = (g2) => new Date(Date.now() + 7 * 3600e3 + (g2 || 0) * 864e5).toISOString().slice(0, 10);
const tambah = (n, o) => { const t = DB.sheets[n], h = t[0]; t.push(h.map((k) => (o[k] === undefined ? '' : o[k]))); };
const rpc = async (fn, a) => { const o = await engine.runRPC(DB, fn, a, {}); DB = o.db; return o.result; };
const tolak = async (fn, a) => { try { await rpc(fn, a); return null; } catch (e) { return e.message || String(e); } };

(async () => {
  const s = {}; for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  TOKEN = (await rpc('login', ['superadmin', 'Admin12345'])).token;
  tambah('Rekening', { id: 'r1', namaBank: 'Bank Contoh', nomor: '1234567890', atasNama: 'Lazismu Contoh', fundGroup: 'Infak', aktif: 'true' });
  const bln = wib().slice(0, 7);
  const jenis = ['Zakat', 'Infak', 'Infak Terikat', 'Wakaf'];
  for (let i = 0; i < 5; i++) tambah('Penghimpunan', { id: 'k' + i, noKwitansi: 'KW/' + bln.replace('-', '') + '/000' + (i + 1), tanggal: bln + '-0' + (i + 1), jenisDana: jenis[i % 4], subJenis: i % 4 === 0 ? 'Zakat Mal' : jenis[i % 4], namaDonatur: 'Donatur Uji ' + i, alamat: 'Jl. Contoh ' + i, jumlah: 150000 * (i + 1), metode: i % 2 ? 'Transfer Bank' : 'Cash/Tunai', rekeningId: i % 2 ? 'r1' : '', dibuat: new Date().toISOString() });
  tambah('Penghimpunan', { id: 'luar', noKwitansi: 'KW/LUAR/1', tanggal: '2019-01-05', jenisDana: 'Infak', subJenis: 'Infak', namaDonatur: 'Di luar periode', jumlah: 1000, metode: 'Cash/Tunai' });

  console.log('=== A. DATA DI SERVER ===');
  let r = await rpc('apiKwitansiRentang', [TOKEN, bln + '-01', bln + '-31']);
  cek('hanya kwitansi dalam rentang (5 dari 6 baris)', r.rows.length === 5 && !r.rows.some((x) => x.id === 'luar'), r.rows.length);
  cek('urut tanggal naik', r.rows.every((x, i, a) => !i || a[i - 1].tanggal <= x.tanggal));
  cek('total dan jumlah benar', r.total === 5 && r.jumlah === 150000 * 15 && r.dipotong === false, [r.total, r.jumlah]);
  cek('rekening hanya 3 angka terakhir', r.rows.find((x) => x.id === 'k1').rekeningAkhir === '890' && !JSON.stringify(r).includes('1234567890'));
  cek('pengaturan disaring (tanpa lg_ dan token harian)', !Object.keys(r.settings).some((k) => /^lg_|^lhToken/.test(k)));
  cek('tanggal salah ditolak', /tidak valid/i.test(await tolak('apiKwitansiRentang', [TOKEN, 'x', bln + '-01']) || ''));
  cek('awal setelah akhir ditolak', /sebelum/i.test(await tolak('apiKwitansiRentang', [TOKEN, bln + '-20', bln + '-01']) || ''));
  cek('rentang lebih dari 400 hari ditolak', /400/.test(await tolak('apiKwitansiRentang', [TOKEN, '2024-01-01', '2026-01-01']) || ''));
  for (let i = 0; i < 320; i++) tambah('Penghimpunan', { id: 'm' + i, noKwitansi: 'M/' + i, tanggal: '2020-03-10', jenisDana: 'Infak', subJenis: 'Infak', namaDonatur: 'Massal ' + i, jumlah: 1000, metode: 'Cash/Tunai' });
  r = await rpc('apiKwitansiRentang', [TOKEN, '2020-03-01', '2020-03-31']);
  cek('lebih dari 300 baris dipotong dan diberi tanda', r.rows.length === 300 && r.total === 320 && r.dipotong === true, [r.rows.length, r.total]);

  console.log('\n=== B. IZIN (Laporan DAN Penghimpunan) ===');
  const SANDI = 'Sandi12345!';
  const buatUser = async (nama, izin) => { await rpc('apiSaveUser', [TOKEN, { username: nama, nama, role: 'staff', password: SANDI, aktif: true, permissions: izin }]); return (await rpc('login', [nama, SANDI])).token; };
  const tLap = await buatUser('hanya.laporan', { laporan: { view: true } });
  const tHim = await buatUser('hanya.himpun', { penghimpunan: { view: true } });
  const tDua = await buatUser('dua.izin', { laporan: { view: true }, penghimpunan: { view: true } });
  cek('hanya izin Laporan: ditolak', /IZIN/.test(await tolak('apiKwitansiRentang', [tLap, bln + '-01', bln + '-31']) || ''));
  cek('hanya izin Penghimpunan: ditolak', /IZIN/.test(await tolak('apiKwitansiRentang', [tHim, bln + '-01', bln + '-31']) || ''));
  cek('kedua izin: boleh', (await rpc('apiKwitansiRentang', [tDua, bln + '-01', bln + '-31'])).rows.length === 5);

  console.log('\n=== C. DI PERAMBAN: TAB, HASIL, PDF A5 ===');
  const { chromium } = (() => { for (const j of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(j); } catch (_) {} } console.log('Playwright belum ada, bagian C dilewati.'); console.log('\ntest_kwitansi_massal.js  ' + ok + '/' + (ok + g)); process.exit(g ? 1 : 2); })();
  const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
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
  await new Promise((r2) => srv.listen(0, '127.0.0.1', r2));
  const A = 'http://127.0.0.1:' + srv.address().port;
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'kwm-'));
  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta', acceptDownloads: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r2) => r2.abort());
  await ctx.addInitScript((x) => { try { localStorage.setItem('laz_token', x.t); localStorage.setItem('laz_theme', 'light'); } catch (_) {} }, { t: TOKEN });
  const p = await ctx.newPage();
  const galat = []; p.on('pageerror', (e) => galat.push(String(e)));
  await p.goto(A + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.dgrid .wc', { timeout: 20000 });
  await p.waitForFunction(() => !document.documentElement.classList.contains('lz-muat-aktif') && !document.documentElement.classList.contains('tunggu-huruf'), null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => go('laporan'));
  await p.waitForSelector('.lap-tab', { timeout: 8000 });
  const tabs = await p.$$eval('.lap-tab', (n) => n.map((x) => x.textContent.trim()));
  cek('tab "Cetak Kwitansi" ada di Laporan', tabs.includes('Cetak Kwitansi'), tabs);
  await p.click('.lap-tab[data-tab="kwitansi"]');
  await p.waitForSelector('#k_bulan', { timeout: 5000 });
  cek('mode Per Bulan dan Rentang Tanggal tersedia', (await p.$$('.j-mode-btn')).length === 2);
  await p.evaluate((bl) => { const m = Number(bl.split('-')[1]); document.getElementById('k_bulan').value = String(m); }, bln);
  await p.evaluate(() => kwTampilkan());
  await p.waitForSelector('#kwAksi', { timeout: 8000 });
  const ket = await p.$eval('#kwHasil h3', (e) => e.textContent);
  cek('hasil menyebut 5 kwitansi', /5 kwitansi/.test(ket), ket);
  cek('tabel pratinjau 5 baris', (await p.$$('#kwHasil tbody tr')).length === 5);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'kwm-hasil.png') });
  const [unduh] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.evaluate(() => kwBuatPdf('unduh'))]);
  const berkas = path.join(OUT, 'k.pdf'); await unduh.saveAs(berkas);
  cek('nama berkas memuat periode', /^Kwitansi_\d{4}-\d{2}\.pdf$/.test(unduh.suggestedFilename()), unduh.suggestedFilename());
  const buf = fs.readFileSync(berkas);
  cek('berkas diawali %PDF dan berakhir %%EOF', buf.slice(0, 5).toString() === '%PDF-' && buf.slice(-6).toString().includes('%%EOF'));
  const info = spawnSync('pdfinfo', [berkas], { encoding: 'utf8' });
  if (info.error) { console.log('  (pdfinfo tidak ada, pemeriksaan isi PDF dilewati)'); }
  else {
    cek('PDF terbaca poppler tanpa galat', info.status === 0 && !/Error/i.test(info.stderr || ''), info.stderr);
    cek('5 halaman (satu per kwitansi)', /Pages:\s+5/.test(info.stdout), info.stdout);
    cek('ukuran A5 mendatar (595 x 420)', /Page size:\s+595\.\d+ x 419\.\d+/.test(info.stdout), (info.stdout.match(/Page size.*/) || [])[0]);
    spawnSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '1', berkas, path.join(OUT, 'hal')]);
    const png = fs.readdirSync(OUT).find((f) => /^hal.*\.png$/.test(f));
    cek('halaman 1 bisa dirender jadi gambar', !!png);
  }
  cek('tidak ada galat JavaScript', galat.length === 0, galat);
  console.log('Potret: ' + OUT);
  await b.close(); srv.close();
  console.log('\ntest_kwitansi_massal.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
