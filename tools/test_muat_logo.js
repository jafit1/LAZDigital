/* Uji layar loading logo SVG dan logo di kepala halaman publik (js/lz-logo.js: LZLogo.muat, LZLogo.statis).
 *
 * Permintaan pemilik (5 Oktober 2026): logo SVG baru ikut dipakai di link publik, tampil sebagai animasi loading
 * berlatar blur sesuai tema, HANYA saat link publik dibuka pertama kali (per sesi) dan di web utama sesudah login.
 * Yang dijaga:
 *  A. Link donatur (harian.html): penutup langsung ada, logo 22 bagian bergerak, blur ada, latar mengikuti tema
 *     (terang: terang, gelap: gelap, cahaya hanya di gelap), bertahan selama data belum datang, lepas sesudah data
 *     datang dan animasi selesai, tidak menyisakan penutup atau kelas html; kepala halaman memakai logo SVG baru.
 *  B. Buka lagi di sesi yang sama: tidak tampil. Sesi baru: tampil lagi.
 *  C. Lacak Progres dan Dashboard Publik memakai penutup dan logo yang sama.
 *  D. Web utama: tampil sesudah masuk lewat formulir, tidak sesudah muat ulang atau masuk otomatis; logo bilah baru
 *     bergerak sesudah penutup lepas, bukan di baliknya.
 *  E. Gerak dikurangi: tidak ada penutup. Tidak ada galat JS.
 * jalankan:  node tools/test_muat_logo.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
function muatPlaywright() {
  for (const j of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(j); } catch (_) {} }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const PUBLIK = path.join(__dirname, '..', 'src', 'public');
const FOTO = process.env.LZ_FOTO || '';

const SETELAN = { namaLembaga: 'Lazismu Contoh', singkatan: 'LC', logoData: 'data:image/png;base64,iVBORw0KGgo=' };
let TUNDA = 600;           /* penundaan jawaban data (ms), diubah per skenario */
const HARIAN = () => ({
  jenis: 'donatur', tanggal: '2026-10-05', hariIni: '2026-10-05', diperbarui: new Date().toISOString(), lembaga: SETELAN,
  ringkas: { total: 150000, n: 1, perMetode: { Tunai: 150000 } }, bulan: { total: 150000 }, baris: [], perKantor: [],
});
const JAWAB = {
  login: () => ({ ok: true, token: 'uji', user: { id: 'u1', username: 'uji', nama: 'Petugas Uji', role: 'superadmin', permissions: {} }, ingat: '' }),
  apiBootstrap: () => ({ user: { id: 'u1', username: 'uji', nama: 'Petugas Uji', role: 'superadmin', permissions: {} }, settings: SETELAN, webAppUrl: '' }),
  apiGetPermissionMeta: () => ({ modules: [], actions: [] }),
  apiPenghimpunanHarian: HARIAN,
};
const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    let m = {}; try { m = JSON.parse(body); } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.startsWith('/api/media')) return res.end(JSON.stringify({ ok: false, pesan: 'tidak ditemukan', lembaga: { namaLembaga: 'Lazismu Contoh' } }));
    if (!req.url.startsWith('/api/rpc')) return res.end('{}');
    const f = JAWAB[m.fn];
    if (m.fn === 'apiPenghimpunanHarian' || m.fn === 'apiPublicDashboard') await new Promise((r) => setTimeout(r, TUNDA));
    if (m.fn === 'apiPublicDashboard') return res.end(JSON.stringify({ __error: 'Link tidak berlaku' }));
    return res.end(JSON.stringify({ result: f ? f(m.args || []) : (/^apiList/.test(m.fn || '') ? [] : {}) }));
  }
  const nama = req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas) || fs.statSync(berkas).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(CHROMIUM);
  let ok = 0, g = 0;
  const cek = (n, s, info) => { if (s) { ok++; console.log('  OK   | ' + n); return; } g++; console.log('  GAGAL| ' + n + (info === undefined ? '' : '  ' + String(JSON.stringify(info)).slice(0, 400))); };
  const galat = [];
  const konteks = (o) => b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, o || {}));
  const buka = async (ctx, url, o) => {
    o = Object.assign({ tema: 'light', skala: 0.2 }, o || {});
    const p = await ctx.newPage();
    p.on('pageerror', (e) => galat.push(url + ': ' + String(e && e.stack || e).slice(0, 200)));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await p.addInitScript((x) => { try { localStorage.setItem('laz_theme', x.tema); } catch (_) {} window.__ujiLogoSkala = x.skala; }, o);
    await p.goto(A + url, { waitUntil: 'domcontentloaded' });
    return p;
  };
  const penutup = (p) => p.evaluate(() => {
    const e = document.querySelector('.lz-muat');
    if (!e) return { ada: false, kelasHtml: document.documentElement.classList.contains('lz-muat-aktif') };
    const c = getComputedStyle(e), r = e.getBoundingClientRect(), lg = e.querySelector('.lz-logo-svg');
    const m = c.backgroundColor.match(/[\d.]+/g).map(Number);
    return {
      ada: true, kelasHtml: document.documentElement.classList.contains('lz-muat-aktif'),
      penuh: Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight, posisi: c.position,
      blur: /blur/.test(c.backdropFilter || c.webkitBackdropFilter || ''), terang: (m[0] + m[1] + m[2]) / 3, alfa: m.length > 3 ? m[3] : 1,
      bagian: e.querySelectorAll('.lzm-main path').length, lebar: Math.round(lg.getBoundingClientRect().width),
      anim: lg.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length,
      cahaya: (e.querySelector('.lzm-glow') ? getComputedStyle(e.querySelector('.lzm-glow')).display : 'tidak ada'),
    };
  });
  const tungguLepas = (p, ms) => p.waitForFunction(() => !document.querySelector('.lz-muat') && !document.documentElement.classList.contains('lz-muat-aktif'), null, { timeout: ms || 8000 });
  const kepalaLogo = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? { bagian: e.querySelectorAll('.lzm-main path').length, gambarUnggahan: !!e.querySelector('img'), tinggi: Math.round(e.getBoundingClientRect().height), lebar: Math.round(e.getBoundingClientRect().width) } : null; }, sel);

  console.log('=== A. LINK DONATUR, TERANG ===');
  TUNDA = 600;
  const c1 = await konteks();
  let p = await buka(c1, '/harian.html?t=abc', { skala: 0.2 });
  await p.waitForSelector('.lz-muat', { timeout: 2000 });
  let t = await penutup(p);
  cek('penutup langsung ada, memenuhi layar, tetap (fixed), kelas html terpasang', t.ada && t.penuh && t.posisi === 'fixed' && t.kelasHtml, t);
  cek('logo di penutup: 22 bagian, lebar 150 sampai 290 px, bergerak', t.bagian === 22 && t.lebar >= 150 && t.lebar <= 290, t);
  await p.waitForTimeout(150);
  t = await penutup(p);
  cek('animasi logo berjalan (garis digambar, isi masuk)', t.ada && t.anim > 20, t);
  cek('latar ber-blur dan terang di tema terang, cahaya mati', t.blur && t.terang > 200 && t.cahaya === 'none', t);
  if (FOTO) await p.screenshot({ path: FOTO + '/muat-terang.png' });
  await p.waitForSelector('.lh-head', { timeout: 6000 });
  await tungguLepas(p);
  cek('sesudah data datang dan animasi selesai: penutup dan kelas html lepas', !(await penutup(p)).ada && !(await penutup(p)).kelasHtml);
  const kl = await kepalaLogo(p, '.lh-logo .lz-logo-statis');
  cek('kepala halaman memakai logo SVG baru (22 bagian), bukan gambar unggahan', kl && kl.bagian === 22 && !kl.gambarUnggahan && kl.tinggi >= 30 && kl.tinggi <= 44, kl);
  cek('tidak ada <img> logo unggahan di kepala', await p.evaluate(() => !document.querySelector('.lh-logo img')));
  if (FOTO) await p.screenshot({ path: FOTO + '/harian-terang.png' });

  console.log('\n=== B. SESI SAMA TIDAK TAMPIL, SESI BARU TAMPIL ===');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.lh-head', { timeout: 6000 });
  await p.waitForTimeout(400);
  cek('buka lagi di sesi yang sama: tanpa penutup', !(await penutup(p)).ada);
  const p2 = await c1.newPage();
  p2.on('pageerror', (e) => galat.push(String(e).slice(0, 200)));
  await p2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p2.addInitScript(() => { window.__ujiLogoSkala = 0.2; try { sessionStorage.clear(); } catch (_) {} });
  await p2.goto(A + '/harian.html?t=abc', { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('.lz-muat', { timeout: 2000 }).then(() => cek('sesi baru (sessionStorage kosong): tampil lagi', true)).catch(() => cek('sesi baru: tampil lagi', false));
  await c1.close();

  console.log('\n=== A2. DATA LAMBAT: PENUTUP BERTAHAN SAMPAI DATA DATANG ===');
  TUNDA = 2500;
  const c2 = await konteks();
  p = await buka(c2, '/harian.html?t=abc', { skala: 0.1 });
  await p.waitForSelector('.lz-muat', { timeout: 2000 });
  await p.waitForTimeout(1500);
  t = await penutup(p);
  cek('animasi sudah selesai (skala 0,1) tetapi penutup bertahan karena data belum datang', t.ada && t.anim === 0 && !(await p.$('.lh-head')), t);
  await p.waitForSelector('.lh-head', { timeout: 6000 });
  await tungguLepas(p);
  cek('data datang: penutup lepas', !(await penutup(p)).ada);
  await c2.close();

  console.log('\n=== A3. TEMA GELAP ===');
  TUNDA = 900;
  const c3 = await konteks();
  p = await buka(c3, '/harian.html?t=abc', { tema: 'dark', skala: 0.5 });
  await p.waitForSelector('.lz-muat', { timeout: 2000 });
  await p.waitForTimeout(500);
  t = await penutup(p);
  cek('latar gelap dan tetap ber-blur, cahaya logo menyala', t.ada && t.blur && t.terang < 60 && t.cahaya !== 'none' && t.cahaya !== 'tidak ada', t);
  if (FOTO) await p.screenshot({ path: FOTO + '/muat-gelap.png' });
  await p.waitForSelector('.lh-head', { timeout: 6000 });
  await tungguLepas(p, 9000);
  if (FOTO) await p.screenshot({ path: FOTO + '/harian-gelap.png' });
  await c3.close();

  console.log('\n=== C. LACAK PROGRES DAN DASHBOARD PUBLIK ===');
  const c4 = await konteks();
  p = await buka(c4, '/lacak.html', { skala: 0.2 });
  await p.waitForSelector('.lz-muat', { timeout: 2000 });
  t = await penutup(p);
  cek('Lacak Progres: penutup tampil dengan logo 22 bagian', t.ada && t.bagian === 22, t);
  await tungguLepas(p);
  const kk = await kepalaLogo(p, '#lkLogo .lz-logo-statis');
  cek('Lacak Progres: kepala memakai logo SVG baru', kk && kk.bagian === 22 && !kk.gambarUnggahan, kk);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  cek('Lacak Progres: muat ulang di sesi sama tanpa penutup', !(await penutup(p)).ada);
  await c4.close();
  const c5 = await konteks();
  p = await buka(c5, '/public.html?token=contoh', { skala: 0.2 });
  await p.waitForSelector('.lz-muat', { timeout: 2000 });
  cek('Dashboard Publik: penutup tampil', (await penutup(p)).ada);
  await tungguLepas(p, 9000);
  cek('Dashboard Publik: tetap lepas walau datanya galat (tidak menahan layar)', !(await penutup(p)).ada);
  const kp = await kepalaLogo(p, '.pub-logo .lz-logo-statis');
  cek('Dashboard Publik: kepala memakai logo SVG baru bila halaman tampil', kp === null || (kp.bagian === 22 && !kp.gambarUnggahan), kp);
  await c5.close();

  console.log('\n=== D. WEB UTAMA: SESUDAH LOGIN ===');
  const c6 = await konteks();
  p = await c6.newPage();
  p.on('pageerror', (e) => galat.push('utama: ' + String(e && e.stack || e).slice(0, 200)));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p.addInitScript(() => { window.__ujiLogoSkala = 0.5; try { localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
  await p.goto(A + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loginView:not(.hidden) #lUser', { timeout: 20000 });
  await p.waitForFunction(() => !document.documentElement.classList.contains('tunggu-huruf'), null, { timeout: 5000 });
  cek('layar masuk: belum ada penutup loading', !(await penutup(p)).ada);
  await p.fill('#lUser', 'uji'); await p.fill('#lPass', 'rahasia');
  await p.click('#loginBtn');
  await p.waitForSelector('.lz-muat', { timeout: 5000 });
  t = await penutup(p);
  cek('sesudah login: penutup tampil dengan logo 22 bagian, blur, terang', t.ada && t.bagian === 22 && t.blur && t.terang > 200, t);
  const bilah = await p.evaluate(() => { const e = document.querySelector('#brandBox .lz-logo-svg'); return e ? e.classList.contains('lz-logo-gerak') : null; });
  cek('logo bilah menu belum bergerak selama penutup menutupi (tidak habis di balik layar)', bilah === false, bilah);
  if (FOTO) await p.screenshot({ path: FOTO + '/muat-utama-terang.png' });
  await tungguLepas(p, 9000);
  await p.waitForFunction(() => { const e = document.querySelector('#brandBox .lz-logo-svg'); return e && (e.classList.contains('lz-logo-gerak') || e.__lz); }, null, { timeout: 4000 })
    .then(() => cek('penutup lepas, lalu logo bilah menu bergerak untuk menu pertama', true))
    .catch(async () => cek('penutup lepas, lalu logo bilah menu bergerak untuk menu pertama', false, await p.evaluate(() => sessionStorage.getItem('lz_logo_dilihat'))));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  cek('muat ulang (masuk otomatis dengan token): tanpa penutup', !(await penutup(p)).ada);
  await c6.close();

  console.log('\n=== E. GERAK DIKURANGI ===');
  const c7 = await konteks({ reducedMotion: 'reduce' });
  p = await buka(c7, '/harian.html?t=abc', { skala: 1 });
  await p.waitForTimeout(200);
  cek('gerak dikurangi: tidak ada penutup loading', !(await penutup(p)).ada);
  await p.waitForSelector('.lh-head', { timeout: 6000 });
  cek('gerak dikurangi: kepala tetap memakai logo SVG', (await kepalaLogo(p, '.lh-logo .lz-logo-statis')).bagian === 22);
  await c7.close();

  console.log('\n=== F. TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript', galat.length === 0, galat.slice(0, 3));

  await b.close();
  server.close();
  console.log('\ntest_muat_logo.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exitCode = g ? 1 : 0;
  setTimeout(() => process.exit(g ? 1 : 0), 300).unref();
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
