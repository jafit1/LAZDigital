/* Uji tombol tema terang/gelap (src/public/js/lz-tema.js).
 *
 * KENAPA ADA. Ikonnya terukur menempel di tepi kanan tombol (21 px dari kiri, 38 px lebar tombolnya, ikon 19 px,
 * jadi menjorok 2 px keluar) karena aturan .tn-item/.tn-icon lama menurunkan padding 0 14px 0 20px dan
 * justify-content:flex-start. Pergantian tema juga terjadi seketika. Yang dijaga:
 *  1. Ikon tepat di tengah tombol di tema terang DAN gelap (selisih kiri/kanan/atas/bawah <= 1 px).
 *  2. Bentuknya berganti: sinar tersembunyi di tema terang (bulan), tampak di tema gelap (matahari).
 *  3. Klik memicu lingkaran tema baru yang melebar dari tombol (clip-path circle di #lz-tema-lingkar, latar lama
 *     ditahan #lz-tema-dasar), tengah animasi: dekat tombol sudah gelap, sudut jauh masih terang; setelah selesai
 *     elemen bantu dilepas; tema tersimpan, judul tombol ikut berganti.
 *  4. Gerak dikurangi: tema berganti langsung tanpa lingkaran.
 *  5. Kelima halaman modul memuat js/lz-tema.js sebelum skrip halamannya dan svgTema() memakainya.
 * jalankan:  node tools/test_tema_ui.js
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
let lulus = 0, gagal = 0;
const cek = (n, ok, d) => { if (ok) lulus++; else gagal++; console.log((ok ? '  OK   | ' : '  GAGAL| ') + n + (d !== undefined && !ok ? '  ' + JSON.stringify(d) : '')); };

const HALAMAN = '<!doctype html><link rel=stylesheet href="/styles.css"><script>document.documentElement.setAttribute("data-theme","light")</script>'
  + '<body><div class=app><main class=main><div class="page-head"><div><h2>Uji</h2></div><div class="page-head-aksi">'
  + '<button class="btn btn-primary btn-sm">Catat</button><span id=h></span></div></div><div class=card style="height:200px">Isi</div></main></div>'
  + '<script src="/js/lz-tema.js"></script><script>document.getElementById("h").innerHTML=\'<button class="tn-icon kepala-tema" id=t type=button>\'+LZTema.svg()+"</button>"</script>';

(async () => {
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/uji.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(HALAMAN); }
    try { const f = path.join(PUBLIK, u); const t = f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'; r.writeHead(200, { 'content-type': t }); r.end(fs.readFileSync(f)); }
    catch (_) { r.writeHead(404); r.end(); }
  }).listen(0);
  const A = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(CHROMIUM);

  const ukur = (p) => p.evaluate(() => {
    const t = document.getElementById('t'), s = t.querySelector('svg'), r = t.getBoundingClientRect(), q = s.getBoundingClientRect();
    const sinar = getComputedStyle(t.querySelector('.t-sinar')).opacity;
    return { kiri: q.x - r.x, kanan: r.right - q.right, atas: q.y - r.y, bawah: r.bottom - q.bottom, sinar: parseFloat(sinar), tema: document.documentElement.getAttribute('data-theme') };
  });
  const rata = (u) => Math.abs(u.kiri - u.kanan) <= 1 && Math.abs(u.atas - u.bawah) <= 1 && u.kiri >= 4;

  {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 500 } });
    const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!127)/, (r) => r.abort());
    await p.goto(A + '/uji.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#t');
    await p.waitForTimeout(300);
    const t1 = await ukur(p);
    cek('Terang: ikon tepat di tengah tombol', rata(t1), t1);
    cek('Terang: bulan (sinar tersembunyi)', t1.sinar === 0, t1);

    await p.click('#t');
    await p.waitForTimeout(250);
    const mid = await p.evaluate(() => {
      const l = document.getElementById('lz-tema-lingkar');
      const an = l ? l.getAnimations().map((a) => (a.effect.getKeyframes()[0] || {}).clipPath || '') : [];
      return { lingkar: !!l, dasar: !!document.getElementById('lz-tema-dasar'), kelas: document.documentElement.className, an };
    });
    cek('Klik memunculkan lingkaran tema baru dan latar lama', mid.lingkar && mid.dasar, mid);
    cek('Lingkaran tumbuh lewat clip-path circle', mid.an.some((k) => /^circle\(/.test(k)), mid);
    cek('Selama animasi isi halaman berganti warna pelan (lz-tema-halus)', /lz-tema-halus/.test(mid.kelas), mid);
    /* Tengah animasi, dihitung dari tangkapan layar: dekat tombol (kanan atas) sudah gelap, sudut kiri bawah masih terang. */
    await p.waitForTimeout(120);
    const b64 = (await p.screenshot()).toString('base64');
    const px = await p.evaluate((d) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const t = (x, y) => { const q = g.getImageData(x, y, 1, 1).data; return q[0] + q[1] + q[2]; };
        res({ kananAtas: t(im.width - 4, 4), kiriBawah: t(4, im.height - 4) });
      };
      im.src = 'data:image/png;base64,' + d;
    }), b64);
    cek('Tengah animasi: kanan atas (tombol) gelap, kiri bawah masih terang', px.kananAtas < 250 && px.kiriBawah > 600, px);
    await p.waitForTimeout(1100);
    const t2 = await ukur(p);
    cek('Gelap: tema berganti dan tersimpan', t2.tema === 'dark' && (await p.evaluate(() => localStorage.getItem('laz_theme'))) === 'dark', t2);
    cek('Gelap: ikon tepat di tengah tombol', rata(t2), t2);
    cek('Gelap: matahari (sinar tampak)', t2.sinar === 1, t2);
    cek('Judul tombol ikut berganti', (await p.evaluate(() => document.getElementById('t').title)) === 'Ganti ke tema terang');
    cek('Setelah selesai lingkaran, latar lama, dan kelas bantu dilepas', await p.evaluate(() => !document.getElementById('lz-tema-lingkar') && !document.getElementById('lz-tema-dasar') && !document.documentElement.classList.contains('lz-tema-halus')));
    await p.click('#t');
    await p.waitForTimeout(1300);
    const t3 = await ukur(p);
    cek('Klik kedua kembali ke terang', t3.tema === 'light' && t3.sinar === 0, t3);
    /* Dua klik beruntun (animasi pertama belum selesai): klik kedua tidak boleh diabaikan. Dulu tombol menolaknya dan
       tema tersangkut gelap; uji Broadcast menekan dua kali berturut-turut dan mengharapkan kembali ke terang. */
    await p.click('#t');
    await p.click('#t');
    await p.waitForTimeout(1300);
    const t4 = await ukur(p);
    cek('Dua klik beruntun: tema kembali ke awal, tanpa sisa elemen bantu', t4.tema === 'light' && await p.evaluate(() => !document.getElementById('lz-tema-lingkar') && !document.getElementById('lz-tema-dasar') && !document.documentElement.classList.contains('lz-tema-halus')), t4);
    await p.click('#t');
    await p.click('#t');
    await p.click('#t');
    await p.waitForTimeout(1300);
    cek('Tiga klik beruntun: berakhir gelap', (await ukur(p)).tema === 'dark');
    await ctx.close();
  }
  {
    const ctx = await b.newContext({ viewport: { width: 800, height: 400 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!127)/, (r) => r.abort());
    await p.goto(A + '/uji.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#t');
    await p.click('#t');
    await p.waitForTimeout(80);
    cek('Gerak dikurangi: tema berganti langsung tanpa lingkaran', (await p.evaluate(() => !document.getElementById('lz-tema-lingkar'))) && (await ukur(p)).tema === 'dark');
    await ctx.close();
  }
  for (const n of ['surat', 'ai', 'blast', 'fund', 'media']) {
    const h = fs.readFileSync(path.join(PUBLIK, n + '.html'), 'utf8');
    const j = fs.readFileSync(path.join(PUBLIK, n + '.js'), 'utf8');
    const iT = h.indexOf('/js/lz-tema.js'), iH = h.indexOf('/' + n + '.js');
    cek(n + '.html: memuat lz-tema.js sebelum skrip halaman', iT > 0 && iH > iT, [iT, iH]);
    cek(n + '.js: svgTema() memakai LZTema', /function svgTema\(gelap\) \{\s*\/\*[^\n]*\n\s*if \(window\.LZTema\) return window\.LZTema\.svg\(\);/.test(j));
  }
  const css = fs.readFileSync(path.join(PUBLIK, 'styles.css'), 'utf8');
  cek('styles.css: tombol tema dipatok tengah (padding 0 dan justify center, !important)', /\.tn-icon\.kepala-tema\{[^}]*padding:0 !important[^}]*justify-content:center !important/.test(css));

  await b.close(); srv.close();
  console.log('\n  ' + lulus + ' lulus, ' + gagal + ' gagal');
  console.log('\ntest_tema_ui.js  ' + lulus + '/' + (lulus + gagal) + '  ' + (gagal ? 'ADA YANG GAGAL' : 'SEMUA LULUS') + '\n');
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
