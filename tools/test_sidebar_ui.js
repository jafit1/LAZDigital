/* Uji bilah menu LAZDigital: logo lembaga dan tombol keluar.
 *
 * Halaman utama butuh sesi yang sah untuk menggambar kerangkanya, jadi yang
 * diuji di sini kerangkanya SAJA — markup header diambil apa adanya dari
 * index.html, dipasang di halaman uji bersama styles.css, lalu diperiksa pada
 * dua keadaan: bilah terbuka dan bilah diciutkan.
 *
 * Dua hal yang dijaga:
 * 1. LOGO TETAP LOGO SAAT DICIUTKAN. Dulu ia diganti lencana dua huruf, dan
 *    yang terlihat di rel sempit cuma "LZ" — terbaca seperti gambar yang gagal
 *    dimuat, bukan lambang lembaga.
 * 2. TOMBOL KELUAR PUNYA KETERANGAN. Sebelumnya cuma tanda daya tanpa kata;
 *    satu-satunya cara tahu artinya adalah menekannya, dan itu kebetulan
 *    tindakan yang tidak bisa dibatalkan.
 *
 * jalankan:  node tools/test_sidebar_ui.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

function muatPlaywright() {
  for (const j of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(j); } catch (_) {}
  }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const LUAR = path.join(AKAR, 'potret');

/* Markup diambil dari index.html, bukan ditulis ulang di sini — kalau ditulis
   ulang, ujinya memeriksa salinan yang bisa berbeda dari yang sungguhan. */
const indexHtml = fs.readFileSync(path.join(PUBLIK, 'index.html'), 'utf8');
const a = indexHtml.indexOf('<header class="topnav"');
const b = indexHtml.indexOf('</header>', a) + '</header>'.length;
if (a === -1 || b < a) throw new Error('markup .topnav tidak ditemukan di index.html');
const HEADER = indexHtml.slice(a, b);

/* Logo palsu berbentuk wordmark melebar (3:1) — bentuk yang paling sulit,
   dan persis bentuk logo Lazismu Bantul yang sesungguhnya. */
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 50">'
  + '<rect width="150" height="50" fill="#ea6a1e"/>'
  + '<text x="75" y="33" font-size="22" font-family="sans-serif" fill="#fff" text-anchor="middle">lazismu</text>'
  + '</svg>').toString('base64');

const halaman = `<!DOCTYPE html><html lang="id" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<script src="/js/lz-perangkat.js"></script>
</head><body>
<div id="appView" class="app">
  ${HEADER}
  <main class="main"><div id="content" style="padding:20px">isi halaman</div></main>
</div>
<script>
  /* Meniru applyBranding() dari app.js untuk kasus "lembaga sudah punya logo". */
  document.getElementById('brandBox').innerHTML =
    '<button class="tn-brand-id" type="button" title="Buka atau tutup menu">'
    + '<img class="logo-img" src="${LOGO}" alt="Lazismu Bantul">'
    + '</button>';
  document.getElementById('uName').textContent = 'Sobat Lazismu';
  document.getElementById('uRole').textContent = 'Superadmin';
  document.getElementById('uAvatar').textContent = 'S';
  window.openProfile = function(){}; window.doLogout = function(){}; window.toggleSidebar = function(){};
</script>
</body></html>`;

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const nama = req.url.split('?')[0];
  if (nama === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(halaman); }
  const berkas = path.join(PUBLIK, nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(LUAR, { recursive: true });
  const br = await chromium.launch(CHROMIUM);

  let ok = 0, g = 0;
  const yangGagal = [];
  const cek = (n, s, info) => {
    if (s) { ok++; return; }
    g++;
    const ket = info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200);
    yangGagal.push(`${n}  ->  ${ket}`);
    console.log('  GAGAL|', n, ket);
  };

  const ctx = await br.newContext({ viewport: { width: 1366, height: 800 } });
  const p = await ctx.newPage();
  const galat = [];
  p.on('pageerror', (e) => galat.push(String(e)));
  await p.goto(A + '/');
  await p.waitForSelector('.topnav', { timeout: 10000 });
  await p.waitForTimeout(400);

  const baca = () => p.evaluate(() => {
    const nav = document.querySelector('.topnav');
    const img = document.querySelector('.tn-brand .logo-img');
    const mini = document.querySelector('.logo-mini');
    const keluar = document.querySelector('.tn-keluar');
    const label = keluar ? keluar.querySelector('span') : null;
    const rn = nav.getBoundingClientRect();
    const ri = img ? img.getBoundingClientRect() : null;
    return {
      navLebar: Math.round(rn.width),
      logoAda: !!img,
      logoTampil: ri ? ri.width > 4 && ri.height > 4 : false,
      logoLebar: ri ? Math.round(ri.width) : 0,
      logoTinggi: ri ? Math.round(ri.height) : 0,
      /* Melebar sampai keluar rel berarti terpotong — itu justru alasan lama
         mengapa logonya dulu disembunyikan. */
      logoKeluarRel: ri ? (ri.right > rn.right - 2 || ri.left < rn.left - 2) : false,
      /* Rasio harus tetap 3:1; kalau tidak, logonya dipenyet. */
      rasio: ri && ri.height ? Math.round((ri.width / ri.height) * 100) / 100 : 0,
      miniTampil: mini ? getComputedStyle(mini).display !== 'none' : false,
      keluarAda: !!keluar,
      keluarIkon: keluar ? !!keluar.querySelector('svg') : false,
      keluarLabel: label ? label.textContent.trim() : '',
      keluarLabelTampil: label ? label.getBoundingClientRect().width > 8 : false,
      keluarJudul: keluar ? keluar.title : '',
    };
  });

  console.log('=== A. BILAH MENU TERBUKA ===');
  const buka = await baca();
  cek('logo lembaga tergambar', buka.logoAda && buka.logoTampil, buka);
  cek('logo tidak dipenyet (rasio 3:1 terjaga)', Math.abs(buka.rasio - 3) < 0.25, buka.rasio);
  cek('logo tidak melewati tepi bilah', !buka.logoKeluarRel, buka);
  cek('tombol keluar berikon', buka.keluarIkon, buka);
  cek('tombol keluar berkata "Keluar"', buka.keluarLabel === 'Keluar', buka.keluarLabel);
  cek('katanya benar-benar terlihat', buka.keluarLabelTampil, buka);
  cek('keterangannya juga ada di title', /Keluar/i.test(buka.keluarJudul), buka.keluarJudul);
  await p.screenshot({ path: path.join(LUAR, 'sidebar-terbuka.png'), clip: { x: 0, y: 0, width: 260, height: 800 } });

  console.log('\n=== B. BILAH MENU DICIUTKAN ===');
  await p.evaluate(() => document.getElementById('appView').classList.add('collapsed'));
  await p.waitForTimeout(450);
  const ciut = await baca();
  cek('bilahnya benar-benar menyempit', ciut.navLebar < buka.navLebar - 80, { buka: buka.navLebar, ciut: ciut.navLebar });
  /* Inti keluhannya: saat diciutkan yang muncul cuma huruf, bukan logonya. */
  cek('logo TETAP tergambar saat diciutkan', ciut.logoTampil, ciut);
  cek('tidak ada lencana dua huruf yang menggantikannya', !ciut.miniTampil, ciut);
  cek('logonya mengecil, bukan terpotong', ciut.logoLebar < buka.logoLebar && !ciut.logoKeluarRel, { buka: buka.logoLebar, ciut: ciut.logoLebar });
  cek('rasionya tetap terjaga saat kecil', Math.abs(ciut.rasio - 3) < 0.25, ciut.rasio);
  cek('logonya masih cukup besar untuk dikenali', ciut.logoLebar >= 40, ciut.logoLebar);
  /* Labelnya menyingkir seperti label menu lain, ikonnya tetap — dan
     keterangannya masih bisa dibaca lewat title saat kursor menyentuhnya. */
  cek('kata "Keluar" menyingkir saat diciutkan', !ciut.keluarLabelTampil, ciut);
  cek('ikon keluarnya tetap ada', ciut.keluarIkon, ciut);
  cek('keterangannya tetap tersedia lewat title', /Keluar/i.test(ciut.keluarJudul), ciut.keluarJudul);
  await p.screenshot({ path: path.join(LUAR, 'sidebar-ciut.png'), clip: { x: 0, y: 0, width: 140, height: 800 } });

  console.log('\n=== C. TANPA LOGO (lembaga belum mengunggah) ===');
  await p.evaluate(() => {
    document.getElementById('brandBox').innerHTML =
      '<button class="tn-brand-id" type="button">'
      + '<span class="logo">LZ</span><span class="brand-name">LAZ Digital</span></button>';
  });
  await p.waitForTimeout(250);
  const tanpa = await p.evaluate(() => {
    const l = document.querySelector('.tn-brand .logo');
    const r = l ? l.getBoundingClientRect() : null;
    return { ada: !!l, tampil: r ? r.width > 10 && r.height > 10 : false, teks: l ? l.textContent.trim() : '' };
  });
  /* Inisial tetap dipakai KALAU memang belum ada logo — yang dibuang cuma
     kebiasaan mengganti logo yang sudah ada dengan inisial. */
  cek('tanpa logo, inisial lembaga yang tampil', tanpa.ada && tanpa.tampil && tanpa.teks === 'LZ', tanpa);

  console.log('\n=== D. TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript', galat.length === 0, galat.slice(0, 3));

  await ctx.close();
  await br.close();
  server.close();
  if (yangGagal.length) {
    console.log('\nYANG GAGAL:');
    yangGagal.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  }
  console.log('\ntest_sidebar_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exitCode = g ? 1 : 0;
  setTimeout(() => process.exit(g ? 1 : 0), 300).unref();
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
