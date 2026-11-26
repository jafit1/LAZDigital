/* Uji Atur Layout dasbor: memindahkan kartu harus bisa dari SELURUH kepala
 * kartu (bukan hanya grip mungil), urutannya tersimpan tanpa entri rusak,
 * dan bertahan setelah halaman dimuat ulang.
 * Latar belakang (26 November 2026): pemilik melaporkan "tidak bisa
 * memindahkan dengan fleksibel setiap bagiannya". Diukur: pointerdown pada
 * teks judul kartu tidak memulai seretan apa- karena listener hanya
 * dipasang pada .drag-handle (grip ~12px).
 *   node tools/test_dasbor_drag.js   (engine asli atas data tiruan) */
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
  const urutan = () => p.evaluate(() => [...document.querySelectorAll('.dgrid .wc')].map((w) => w.getAttribute('data-id')));
  const posisi = (id) => p.evaluate((id) => { const w = [...document.querySelectorAll('.dgrid .wc')].find((x) => x.getAttribute('data-id') === id); if (!w) return null; const r = w.getBoundingClientRect(); return { kiri: Math.round(r.left), atas: Math.round(r.top), lebar: Math.round(r.width), tinggi: Math.round(r.height) }; }, id);

  // Mode Atur Layout
  await p.evaluate(() => document.getElementById('dashEditBtn').click());
  await p.waitForSelector('.dgrid .wc .drag-handle', { timeout: 8000 });
  await p.waitForTimeout(300);

  const seret = async (dariJudul, keJudul, tekanJudul) => {
    /* Auto-scroll seretan sebelumnya bisa meninggalkan halaman tergulir;
     * kembalikan ke atas dulu supaya getBoundingClientRect (koordinat
     * viewport) valid untuk mouse.move. */
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(150);
    const r = await p.evaluate(({ a, b, t }) => {      const ka = [...document.querySelectorAll('.dgrid .wc')].find((w) => (w.querySelector('.wc-t') || {}).textContent.indexOf(a) >= 0);
      const kb = [...document.querySelectorAll('.dgrid .wc')].find((w) => (w.querySelector('.wc-t') || {}).textContent.indexOf(b) >= 0);
      if (!ka || !kb) return null;
      /* Kartu sasaran bisa berada jauh di bawah (di luar viewport); gulirkan
       * ke tengah dulu supaya getBoundingClientRect (koordinat viewport)
       * valid untuk mouse.move. */
      kb.scrollIntoView({ block: 'center' });
      ka.scrollIntoView({ block: 'center' });
      const ra = ka.getBoundingClientRect(), rb = kb.getBoundingClientRect();
      const grip = ka.querySelector('.drag-handle'); const rg = grip && grip.getBoundingClientRect();
      const wt = ka.querySelector('.wc-t'); const rt = wt && wt.getBoundingClientRect();
      const sx = (!t && rg && rg.width) ? rg.left + rg.width / 2 : (rt ? rt.left + rt.width / 2 : ra.left + 34);
      const sy = (!t && rg && rg.width) ? rg.top + rg.height / 2 : (rt ? rt.top + rt.height / 2 : ra.top + 14);
      return { sx, sy, tx: rb.left + rb.width / 2, ty: rb.top + Math.min(rb.height / 2, 120) };
    }, { a: dariJudul, b: keJudul, t: tekanJudul });
    if (!r) return false;
    await p.mouse.move(r.sx, r.sy);
    await p.mouse.down();
    await p.waitForTimeout(80);
    const mulaiJalan = await p.evaluate(() => !!document.querySelector('.wc-placeholder'));
    for (let i = 1; i <= 12; i++) await p.mouse.move(r.sx + (r.tx - r.sx) * i / 12, r.sy + (r.ty - r.sy) * i / 12);
    await p.waitForTimeout(120);
    const jalan = await p.evaluate(() => !!document.querySelector('.wc-placeholder'));
    await p.mouse.up();
    await p.waitForTimeout(250);
    return { mulai: mulaiJalan, jalan: jalan };
  };

  const awal = await urutan();
  const posPilarSebelum = await posisi('pilar');

  /* 1. Seret dari TEKS JUDUL: Pilar (baris 1 kanan) ke atas Sebaran Dana
   *    (baris 2 kanan) - jatuh di seperempat atas kartu berarti "sisip
   *    sebelum kartu ini", jadi Pilar pindah ke posisinya. */
  const jalanJudul = await seret('Pilar Program', 'Sebaran Dana', true);
  cek('Seret dari teks judul kartu memulai seretan (placeholder muncul)', jalanJudul && jalanJudul.jalan === true, { jalanJudul });
  const sesudahJudul = await urutan();
  cek('Pindah kartu dari judul mengubah urutan', JSON.stringify(sesudahJudul) !== JSON.stringify(awal), { awal, sesudahJudul });
  const posPilarSesudah = await posisi('pilar');
  cek('Kartu Pilar benar-benar pindah tempat di layar', posPilarSesudah && posPilarSebelum && (posPilarSesudah.atas !== posPilarSebelum.atas || posPilarSesudah.kiri !== posPilarSebelum.kiri), { posPilarSebelum, posPilarSesudah });

  /* 2. Seret dari GRIP tetap bekerja (jalan lama tidak rusak). */
  const jalanGrip = await seret('Pilar Program', 'Tren Arus Dana', false);
  cek('Seret dari grip tetap bekerja', jalanGrip && jalanGrip.jalan === true, { jalanGrip });

  /* 3. Simpanan bersih: tanpa entri null/undefined dari placeholder. */
  const tersimpan = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('laz_dashlayout') || 'null'); } catch (e) { return { RUSAK: e.message }; } });
  cek('Layout tersimpan berisi urutan id bersih (tanpa null)', tersimpan && Array.isArray(tersimpan.order) && tersimpan.order.every((x) => typeof x === 'string' && x), tersimpan && tersimpan.order);

  /* 4. Bertahan setelah muat ulang. */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.dgrid .wc', { timeout: 20000 });
  await p.waitForTimeout(600);
  const setelahReload = await urutan();
  cek('Urutan bertahan setelah muat ulang', JSON.stringify(setelahReload) === JSON.stringify(tersimpan.order.filter((x) => setelahReload.indexOf(x) >= 0)), { setelahReload, tersimpan: tersimpan.order });

  console.log('\ntest_dasbor_drag.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  await b.close(); srv.close();
  setTimeout(() => process.exit(g ? 1 : 0), 200).unref();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
