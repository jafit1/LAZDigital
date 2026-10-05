/* Uji logo SVG di bilah menu (src/public/js/lz-logo.js).
 *
 * Permintaan pemilik (5 Oktober 2026): pojok kiri atas setiap menu dan modul menampilkan logo lembaga berupa SVG, yang
 * bergerak hanya saat pertama kali masuk ke menu itu, sesudahnya diam. Yang dijaga:
 *  A. Logo SVG utuh (22 bagian), rasionya 3840:2574 tidak dipenyet, tingginya 48 px di komputer dan 38 px di HP,
 *     di tengah panel saat bilah terbuka dan di tengah rel saat ciut, tidak keluar dari bilah.
 *  B. Masuk menu pertama kali: logo bergerak (garis digambar, isi warna masuk), sesudah selesai semua animasi dan gaya
 *     sebaris dilepas.
 *  C. Menu lain yang belum pernah dibuka: bergerak lagi. Kembali ke menu yang sudah dibuka: diam dan langsung utuh.
 *  D. Muat ulang di sesi yang sama: diam. Sesi baru (tab baru): bergerak lagi.
 *  E. Cahaya hanya di tema gelap. Gerak dikurangi: tidak bergerak sama sekali, logonya tetap tampil.
 *  F. Lima halaman modul memuat logo yang sama (wadah di markup, skrip sebelum lz-sisi.js).
 * Linimasa dipercepat lewat window.__ujiLogoSkala supaya tidak menunggu 5 detik per menu.
 * jalankan:  node tools/test_logo_ui.js
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

const SETELAN = { namaLembaga: 'Lazismu Contoh', singkatan: 'Lazismu Contoh' };
const JAWAB = {
  apiBootstrap: () => ({ user: { id: 'u1', username: 'uji', nama: 'Petugas Uji', role: 'superadmin', permissions: {} }, settings: SETELAN, webAppUrl: '' }),
  apiGetPermissionMeta: () => ({ modules: [], actions: [] }),
};
const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    let m = {}; try { m = JSON.parse(body); } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (!req.url.startsWith('/api/rpc')) return res.end(JSON.stringify({ ok: false, pesan: 'tidak ditiru' }));
    const f = JAWAB[m.fn];
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

  const konteks = async (o) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, o || {}));
    return ctx;
  };
  const halaman = async (ctx, pilihan) => {
    const o = Object.assign({ tema: 'light', ciut: false, skala: 0.1 }, pilihan || {});
    const p = await ctx.newPage();
    p.on('pageerror', (e) => galat.push(String(e && e.stack || e).slice(0, 200)));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await p.addInitScript((x) => {
      try {
        localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', x.tema);
        localStorage.setItem('sidebar_collapsed', x.ciut ? 'true' : 'false');
      } catch (_) {}
      window.__ujiLogoSkala = x.skala;
    }, o);
    await p.goto(A + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#appView:not(.hidden) .tn-item.active', { timeout: 20000 });
    /* Halaman utama tampil sesudah huruf termuat (atau 1,5 detik); logo baru bergerak sesudah itu. */
    if (!o.tahanHuruf) await p.waitForFunction(() => !document.documentElement.classList.contains('tunggu-huruf'), null, { timeout: 5000 });
    return p;
  };
  const baca = (p) => p.evaluate(() => {
    const e = document.querySelector('#brandBox .lz-logo-svg');
    if (!e) return { ada: false };
    const r = e.getBoundingClientRect(), n = document.querySelector('.topnav').getBoundingClientRect();
    const ps = e.querySelectorAll('.lzm-main path');
    const akhir = ps[ps.length - 1];
    const glow = e.querySelector('.lzm-glow');
    return {
      ada: true, bagian: ps.length, lebar: r.width, tinggi: r.height, tinggiCss: e.offsetHeight,
      rasio: Math.round((e.offsetWidth / e.offsetHeight) * 1000) / 1000,
      meleset: Math.abs((r.left + r.width / 2) - (n.left + n.width / 2)),
      keluar: r.left < n.left - 0.5 || r.right > n.right + 0.5,
      /* Hanya animasi logo (Web Animations), bukan transisi CSS geser/kecil milik bilah. */
      anim: e.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length,
      isiAkhir: parseFloat(getComputedStyle(akhir).fillOpacity),
      gayaSebaris: [...ps].some((x) => x.getAttribute('style')),
      tunggu: e.classList.contains('lz-logo-tunggu'),
      tampakSvg: getComputedStyle(e.querySelector('svg.lzm-main')).opacity,
      cahaya: glow ? getComputedStyle(glow).display : 'tidak ada',
      kunci: sessionStorage.getItem('lz_logo_dilihat') || '',
    };
  });
  const tungguDiam = (p) => p.waitForFunction(() => {
    const e = document.querySelector('#brandBox .lz-logo-svg');
    return e && e.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)).length === 0 && !e.classList.contains('lz-logo-tunggu');
  }, null, { timeout: 8000 });

  console.log('=== A. LOGO SVG DI BILAH TERBUKA (1280 px) ===');
  const ctx1 = await konteks();
  let p = await halaman(ctx1, { skala: 1 });
  await p.waitForTimeout(250);
  let u = await baca(p);
  cek('logo SVG terpasang di pojok kiri atas', u.ada && u.bagian === 22, u);
  cek('rasio 3840:2574 terjaga (tidak dipenyet)', Math.abs(u.rasio - 1.492) < 0.02, u.rasio);
  cek('tinggi 48 px di komputer', u.tinggiCss === 48, u.tinggiCss);
  cek('di tengah panel saat bilah terbuka', u.meleset <= 1.5, u);
  cek('tidak keluar dari bilah', !u.keluar, u);
  console.log('\n=== B. MASUK MENU PERTAMA KALI: BERGERAK ===');
  cek('logo bergerak saat Dasbor pertama kali dibuka', u.anim > 20, u.anim);
  cek('tengah animasi: bagian terakhir belum berisi warna penuh (sedang digambar)', u.isiAkhir < 0.5, u.isiAkhir);
  cek('menu yang diputar tercatat untuk sesi ini', /nav_dashboard/.test(u.kunci), u.kunci);
  await tungguDiam(p);
  u = await baca(p);
  cek('sesudah selesai: semua animasi dan gaya sebaris dilepas, logo utuh', u.anim === 0 && !u.gayaSebaris && u.isiAkhir === 1 && u.tampakSvg === '1', u);
  await p.screenshot({ path: path.join(__dirname, '..', 'potret', 'logo-terbuka.png'), clip: { x: 0, y: 0, width: 260, height: 140 } }).catch(() => {});

  /* Halaman utama menahan body di opacity 0 sampai huruf termuat (html.tunggu-huruf, paling lama 1,5 detik).
     IntersectionObserver tidak tahu soal opacity, jadi dulu animasi menu pertama habis diputar di balik layar kosong. */
  const ctxH = await konteks();
  await ctxH.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const h = document.documentElement;
      new MutationObserver(() => { if (!window.__lepasHuruf && !h.classList.contains('tunggu-huruf')) h.classList.add('tunggu-huruf'); })
        .observe(h, { attributes: true, attributeFilter: ['class'] });
      h.classList.add('tunggu-huruf');
    });
  });
  const pH = await halaman(ctxH, { skala: 0.1, tahanHuruf: true });
  await pH.waitForTimeout(500);
  const sebelum = await baca(pH);
  cek('selama halaman masih disembunyikan menunggu huruf: logo belum bergerak', sebelum.anim === 0 && sebelum.tunggu
    && await pH.evaluate(() => document.documentElement.classList.contains('tunggu-huruf')), sebelum);
  await pH.evaluate(() => { window.__lepasHuruf = true; document.documentElement.classList.remove('tunggu-huruf'); });
  await pH.waitForTimeout(80);
  cek('begitu halaman tampil: logo mulai bergerak', (await baca(pH)).anim > 20);
  await ctxH.close();

  console.log('\n=== C. PINDAH MENU ===');
  await p.evaluate(() => { window.__ujiLogoSkala = 0.1; go('penghimpunan'); });
  await p.waitForFunction(() => document.querySelector('#brandBox .lz-logo-svg').getAnimations({ subtree: true }).length > 0, null, { timeout: 3000 }).catch(() => {});
  u = await baca(p);
  cek('menu baru (Penghimpunan) yang belum pernah dibuka: bergerak', u.anim > 20, u.anim);
  await tungguDiam(p);
  await p.evaluate(() => go('dashboard'));
  await p.waitForTimeout(300);
  u = await baca(p);
  cek('kembali ke menu yang sudah dibuka: diam', u.anim === 0, u.anim);
  cek('dan langsung tampil utuh, tidak disembunyikan', !u.tunggu && u.tampakSvg === '1' && u.isiAkhir === 1, u);
  await p.evaluate(() => go('penghimpunan'));
  await p.waitForTimeout(300);
  cek('Penghimpunan dibuka lagi: diam', (await baca(p)).anim === 0);

  console.log('\n=== D. MUAT ULANG DAN SESI BARU ===');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#appView:not(.hidden) .tn-item.active', { timeout: 20000 });
  await p.waitForTimeout(150);
  u = await baca(p);
  cek('muat ulang di sesi yang sama: Dasbor diam', u.anim === 0 && !u.tunggu, u);
  await ctx1.close();
  const ctx2 = await konteks();
  p = await halaman(ctx2, {});
  await p.waitForTimeout(120);
  cek('sesi baru: bergerak lagi', (await baca(p)).anim > 20);
  await ctx2.close();

  console.log('\n=== E. TEMA, BILAH CIUT, HP, GERAK DIKURANGI ===');
  const ctx3 = await konteks();
  p = await halaman(ctx3, { tema: 'dark' });
  await tungguDiam(p);
  u = await baca(p);
  cek('tema gelap: cahaya oranye menyala', u.cahaya !== 'none' && u.cahaya !== 'tidak ada', u.cahaya);
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  cek('tema terang: cahaya dimatikan', (await baca(p)).cahaya === 'none');
  await ctx3.close();

  const ctx4 = await konteks();
  p = await halaman(ctx4, { ciut: true });
  await tungguDiam(p);
  await p.mouse.move(900, 400);
  await p.waitForTimeout(500);
  u = await baca(p);
  cek('bilah ciut: logo di tengah rel', u.meleset <= 1.5, u);
  cek('bilah ciut: tetap di dalam rel', !u.keluar, u);
  cek('bilah ciut: cukup besar untuk dikenali (lebar >= 50 px)', u.lebar >= 50, u.lebar);
  await p.hover('.topnav');
  await p.waitForTimeout(600);
  u = await baca(p);
  cek('kursor menyentuh bilah ciut: logo kembali penuh di tengah panel', Math.abs(u.lebar - 71.6) < 1.5 && u.meleset <= 1.5, u);
  await ctx4.close();

  const ctx5 = await konteks({ viewport: { width: 390, height: 844 } });
  p = await halaman(ctx5, {});
  await tungguDiam(p);
  u = await baca(p);
  cek('HP: tinggi logo 38 px dan tampil', u.tinggiCss === 38 && u.lebar > 50, u);
  cek('HP: halaman tidak melebar ke samping', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await ctx5.close();

  const ctx6 = await konteks({ reducedMotion: 'reduce' });
  p = await halaman(ctx6, {});
  await p.waitForTimeout(400);
  u = await baca(p);
  cek('gerak dikurangi: tidak bergerak, logo tetap tampil utuh', u.anim === 0 && !u.tunggu && u.tampakSvg === '1', u);
  await ctx6.close();

  console.log('\n=== F. HALAMAN MODUL ===');
  for (const m of ['blast', 'fund', 'ai', 'surat', 'media']) {
    const h = fs.readFileSync(path.join(PUBLIK, m + '.html'), 'utf8');
    const iLogo = h.indexOf('/js/lz-logo.js'), iSisi = h.indexOf('/js/lz-sisi.js');
    cek(`${m}.html: wadah logo SVG di bilah dan skripnya dimuat sebelum lz-sisi.js`,
      /id="brandBox"[\s\S]{0,400}class="logo-img lz-logo-svg/.test(h) && iLogo > 0 && iLogo < iSisi && !/<span class="logo">LZ<\/span>/.test(h));
  }
  const ctx7 = await konteks();
  const pm = await ctx7.newPage();
  pm.on('pageerror', (e) => galat.push('surat: ' + String(e).slice(0, 160)));
  await pm.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await pm.goto(A + '/surat.html', { waitUntil: 'domcontentloaded' });
  await pm.waitForFunction(() => document.querySelectorAll('#brandBox .lz-logo-svg .lzm-main path').length === 22, null, { timeout: 8000 }).catch(() => {});
  cek('halaman modul (Surat): logo SVG terisi', (await pm.evaluate(() => document.querySelectorAll('#brandBox .lz-logo-svg .lzm-main path').length)) === 22);
  await ctx7.close();

  console.log('\n=== G. TIDAK ADA GALAT JS ===');
  /* Semua galat dihitung, bukan yang menyebut "logo" saja: galat dari pengamat (requestAnimationFrame) hanya membawa
     pesannya, misalnya "siapDilihat is not defined", tanpa nama berkas. */
  cek('tidak ada galat JavaScript', galat.length === 0, galat.slice(0, 3));

  await b.close();
  server.close();
  console.log('\ntest_logo_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exitCode = g ? 1 : 0;
  setTimeout(() => process.exit(g ? 1 : 0), 300).unref();
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
