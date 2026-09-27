/* tools/ukur-sisi.js: mengukur kelurusan bilah menu, bukan menilainya dengan mata.
 *
 * Yang diukur pada bilah TERBUKA dan DICIUTKAN:
 *   - tepi kiri tiap tulisan menu
 *   - sumbu tengah tiap ikon
 *   - sumbu tengah logo, avatar, dan tombol keluar
 *
 * Menu dan ikonnya diambil langsung dari src/public/app.js (larik MENU dan
 * NAV_ICONS), bukan ditulis ulang di sini. Ikon yang ditulis ulang akan
 * membuat ujinya lulus atas gambar yang tidak pernah dilihat pengguna, dan
 * itu persis kekeliruan yang pernah terjadi: potret ujinya memakai satu ikon
 * yang sama untuk sebelas menu.
 *
 * jalankan:  node tools/ukur-sisi.js
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

const appJs = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(PUBLIK, 'index.html'), 'utf8');

/* NAV_ICONS dan MENU dipotong apa adanya dari app.js lalu dijalankan di
   halaman uji, supaya ikon dan labelnya persis yang dipakai aplikasi. */
function potong(awal, akhir) {
  const i = appJs.indexOf(awal);
  if (i < 0) throw new Error('tidak ketemu di app.js: ' + awal);
  const j = appJs.indexOf(akhir, i);
  if (j < 0) throw new Error('penutup tidak ketemu untuk: ' + awal);
  return appJs.slice(i, j + akhir.length);
}
/* navIcon() ikut diambil: NAV_ICONS memanggilnya untuk tiap ikon, dan tanpa
   itu potongannya melempar "navIcon is not defined" lalu menunya tidak
   tergambar sama sekali. */
const SUMBER_NAVICON = potong('function navIcon(paths){', '}');
const SUMBER_IKON = potong('var NAV_ICONS', '};');
const SUMBER_MENU = potong('var MENU=[', '];');

const a = indexHtml.indexOf('<header class="topnav"');
const b = indexHtml.indexOf('</header>', a) + '</header>'.length;
if (a < 0) throw new Error('markup .topnav tidak ditemukan di index.html');
const HEADER = indexHtml.slice(a, b);

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
  <main class="main"><div id="content" style="padding:20px">isi</div></main>
</div>
<script>
${SUMBER_NAVICON}
${SUMBER_IKON}
${SUMBER_MENU}
(function(){
  /* Logo lembaga digambar app.js sebagai <img class="logo-img"> di dalam
     .tn-brand-id, menggantikan lencana dua huruf. Di sini bentuk itu ditiru
     persis, karena lebar logo ikut menentukan kelurusannya. */
  var tombolLogo = document.querySelector('.tn-brand-id');
  if (tombolLogo) tombolLogo.innerHTML = '<img class="logo-img" src="' + ${JSON.stringify(LOGO)} + '" alt="logo">';
  var nav = document.querySelector('#nav') || document.querySelector('.tn-nav');
  if (!nav) { document.title = 'GAGAL: nav tidak ada'; return; }
  nav.innerHTML = '';
  MENU.forEach(function(m){
    var d = document.createElement('button');
    d.className = 'tn-item'; d.id = 'nav_' + m.id; d.title = m.label;
    d.innerHTML = '<span class="ic">' + m.ic + '</span><span class="tn-tip">' + m.label + '</span>';
    nav.appendChild(d);
  });
  var nm = document.querySelector('#uName'); if (nm) nm.textContent = 'Sobat Lazismu';
  var rl = document.querySelector('#uRole'); if (rl) rl.textContent = 'Superadmin';
})();
</script>
<script src="/js/lz-sisi.js"></script>
</body></html>`;

function layani() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      const u = decodeURIComponent((req.url || '/').split('?')[0]);
      if (u === '/' || u === '/index.html') {
        resp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        resp.end(halaman); return;
      }
      const f = path.join(PUBLIK, u.replace(/^\/+/, ''));
      if (!f.startsWith(PUBLIK) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        resp.writeHead(404); resp.end('x'); return;
      }
      const tipe = f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript'
        : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
      resp.writeHead(200, { 'Content-Type': tipe + '; charset=utf-8' });
      resp.end(fs.readFileSync(f));
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const bulat = (n) => Math.round(n * 100) / 100;

(async () => {
  const srv = await layani();
  const port = srv.address().port;
  const browser = await chromium.launch(CHROMIUM);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  /* Galat di dalam halaman harus terlihat. Tanpa ini, satu salah ketik di
     potongan app.js membuat menunya tidak tergambar dan ujinya melaporkan
     "sebaran 0 px" dengan tenang, padahal yang diukur nol elemen. */
  page.on('pageerror', (e) => console.error('  GALAT HALAMAN: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('  KONSOL: ' + m.text()); });
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const jumlahItem = await page.$$eval('.tn-item', (n) => n.length);
  if (jumlahItem === 0) {
    console.error('\nGAGAL: tidak ada satu pun .tn-item di halaman uji.');
    console.error('Mengukur nol elemen selalu menghasilkan "sebaran 0 px", dan itu');
    console.error('kelihatan seperti lulus. Periksa potongan MENU/NAV_ICONS dari app.js.\n');
    await browser.close(); srv.close(); process.exit(1);
  }
  console.log('\n(' + jumlahItem + ' menu terukur)');

  async function ukur(keadaan) {
    return page.evaluate(() => {
      const kiri = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, cx: r.left + r.width / 2, w: r.width }; };
      const keluar = { label: [], ikon: [], lain: [] };
      document.querySelectorAll('.tn-item').forEach((b) => {
        const t = b.querySelector('.tn-tip');
        const i = b.querySelector('.ic');
        const svg = i && i.querySelector('svg');
        if (t) keluar.label.push({ nama: t.textContent.trim(), x: kiri(t).x });
        if (i) keluar.ikon.push({ nama: (t && t.textContent.trim()) || b.id, cx: kiri(i).cx, w: kiri(i).w });
        if (svg) {
          const k = keluar.ikon[keluar.ikon.length - 1];
          k.svgCx = kiri(svg).cx;
          /* TINTA: kotak pembatas gambar yang benar-benar tergambar, bukan
             kotak kanvasnya. Inilah yang dilihat mata. Kanvas semua ikon
             memang 24x24 dan selalu sejajar; yang membuat deretan terlihat
             ragged adalah tinta di dalamnya. */
          try {
            const bb = svg.getBBox();
            const vb = svg.viewBox.baseVal;
            const r = svg.getBoundingClientRect();
            const sk = r.width / vb.width;          /* satuan viewBox -> px layar */
            k.tintaKiri = r.left + (bb.x - vb.x) * sk;
            k.tintaKanan = r.left + (bb.x - vb.x + bb.width) * sk;
            k.tintaCx = (k.tintaKiri + k.tintaKanan) / 2;
            k.tintaLebar = bb.width * sk;
            k.tintaTinggi = bb.height * sk;
          } catch (e) {}
        }
      });
      const logo = document.querySelector('.tn-brand-id .logo-img') || document.querySelector('.tn-brand-id');
      const avatar = document.querySelector('.user-chip .avatar');
      const keluarBtn = document.querySelector('.tn-keluar');
      if (logo) keluar.lain.push({ nama: 'logo', cx: kiri(logo).cx, w: kiri(logo).w });
      if (avatar) keluar.lain.push({ nama: 'avatar', cx: kiri(avatar).cx, w: kiri(avatar).w });
      if (keluarBtn) {
        const ic = keluarBtn.querySelector('svg') || keluarBtn;
        keluar.lain.push({ nama: 'keluar', cx: kiri(ic).cx, w: kiri(ic).w });
      }
      return keluar;
    });
  }

  function laporkan(judul, data) {
    console.log('\n================ ' + judul + ' ================');
    const xs = data.label.map((l) => l.x);
    const cxs = data.ikon.map((i) => i.cx);
    const svgCxs = data.ikon.map((i) => i.svgCx).filter((v) => v != null);

    console.log('\n--- tepi kiri tulisan ---');
    data.label.forEach((l) => console.log('  ' + String(bulat(l.x)).padStart(8) + '   ' + l.nama));
    const sebarTeks = xs.length ? bulat(Math.max(...xs) - Math.min(...xs)) : 0;
    console.log('  sebaran: ' + sebarTeks + ' px');

    console.log('\n--- sumbu tengah kotak ikon ---');
    data.ikon.forEach((i) => console.log('  ' + String(bulat(i.cx)).padStart(8)
      + '   lebar ' + String(bulat(i.w)).padStart(6) + '   ' + i.nama));
    const sebarIkon = cxs.length ? bulat(Math.max(...cxs) - Math.min(...cxs)) : 0;
    console.log('  sebaran: ' + sebarIkon + ' px');

    const tKiri = data.ikon.map((i) => i.tintaKiri).filter((v) => v != null);
    if (tKiri.length) {
      console.log('\n--- TINTA ikon: kiri / tengah / kanan / lebar (px layar) ---');
      data.ikon.forEach((i) => {
        if (i.tintaKiri == null) return;
        console.log('  ' + String(bulat(i.tintaKiri)).padStart(7)
          + String(bulat(i.tintaCx)).padStart(9)
          + String(bulat(i.tintaKanan)).padStart(9)
          + String(bulat(i.tintaLebar)).padStart(9) + '   ' + i.nama);
      });
      const kanan = data.ikon.map((i) => i.tintaKanan).filter((v) => v != null);
      const cxs2 = data.ikon.map((i) => i.tintaCx).filter((v) => v != null);
      const leb = data.ikon.map((i) => i.tintaLebar).filter((v) => v != null);
      console.log('  sebaran tepi kiri  : ' + bulat(Math.max(...tKiri) - Math.min(...tKiri)) + ' px');
      console.log('  sebaran tengah     : ' + bulat(Math.max(...cxs2) - Math.min(...cxs2)) + ' px');
      console.log('  sebaran tepi kanan : ' + bulat(Math.max(...kanan) - Math.min(...kanan)) + ' px');
      console.log('  lebar terkecil/terbesar: ' + bulat(Math.min(...leb)) + ' / ' + bulat(Math.max(...leb)) + ' px');
    }

    if (svgCxs.length) {
      console.log('\n--- sumbu tengah GAMBAR di dalam ikon ---');
      data.ikon.forEach((i) => { if (i.svgCx != null) console.log('  ' + String(bulat(i.svgCx)).padStart(8) + '   ' + i.nama); });
      console.log('  sebaran: ' + bulat(Math.max(...svgCxs) - Math.min(...svgCxs)) + ' px');
    }

    if (data.lain.length) {
      console.log('\n--- logo, avatar, keluar ---');
      data.lain.forEach((l) => console.log('  ' + String(bulat(l.cx)).padStart(8)
        + '   lebar ' + String(bulat(l.w)).padStart(6) + '   ' + l.nama));
    }
    const sebarTinta = tKiri.length ? bulat(Math.max(...tKiri) - Math.min(...tKiri)) : 0;
    return {
      sebarTeks, sebarIkon, sebarTinta,
      sebarSvg: svgCxs.length ? bulat(Math.max(...svgCxs) - Math.min(...svgCxs)) : 0,
    };
  }

  await page.evaluate(() => document.querySelector('.app').classList.remove('collapsed'));
  await page.waitForTimeout(500);
  const buka = laporkan('BILAH TERBUKA', await ukur('buka'));

  await page.evaluate(() => document.querySelector('.app').classList.add('collapsed'));
  await page.waitForTimeout(500);
  const ciut = laporkan('BILAH DICIUTKAN', await ukur('ciut'));

  console.log('\n================ KESIMPULAN ================');

  /* Dua ukuran yang berbeda, dan yang kedua yang dulu terlewat.
     KOTAK ikon selalu sejajar: semuanya 24x24 dan dipusatkan pada satu sumbu.
     Yang dilihat mata adalah TINTA di dalam kotak itu, dan tinta tiap ikon
     berbeda lebar karena bentuknya memang berbeda. Ikon dokumen yang jangkung,
     misalnya, pernah 3 px lebih masuk ke dalam daripada sebelas ikon lain
     sementara semua ukuran "resmi" tetap melaporkan 0 px. */
  const nilai = [
    ['tulisan sejajar (terbuka)', buka.sebarTeks, 0.6],
    ['kotak ikon sejajar (terbuka)', buka.sebarIkon, 0.6],
    ['kotak ikon sejajar (diciutkan)', ciut.sebarIkon, 0.6],
    ['TINTA ikon sejajar (terbuka)', buka.sebarTinta, 1.0],
    ['TINTA ikon sejajar (diciutkan)', ciut.sebarTinta, 1.0],
  ];
  let gagal = 0;
  nilai.forEach(([n, v, batas]) => {
    const ok = v <= batas;
    if (!ok) gagal++;
    console.log('  ' + (ok ? 'ok    ' : 'MELESET') + ' | ' + n.padEnd(32)
      + ' sebaran ' + String(v).padStart(5) + ' px   (batas ' + batas + ')');
  });
  console.log('');

  await browser.close();
  srv.close();
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error('\nGAGAL: ' + (e && e.stack || e) + '\n'); process.exit(1); });
