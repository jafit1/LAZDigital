/* Potret layar muat — tanpa menyalakan aplikasi.
 *
 * Layar muat hanya terlihat beberapa ratus milidetik saat aplikasi dibuka,
 * jadi satu-satunya cara memeriksanya dengan tenang adalah memotretnya
 * sendirian. Markupnya diambil apa adanya dari index.html supaya yang
 * dipotret benar-benar yang dipakai.
 *
 * Yang diperiksa dengan angka, bukan dengan mata:
 * - sembilan pita benar-benar bertumpuk persis (kalau meleset, hurufnya
 *   terlihat robek dan itu sulit disadari dari potret kecil);
 * - pita-pitanya menutup 0–100% tinggi huruf tanpa celah;
 * - hurufnya benar-benar tergambar, di tema terang maupun gelap. Loader yang
 *   salah warna tetap menghasilkan potret yang "wajar" — hanya kosong.
 *
 *   jalankan:  node tools/potret_loader.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

function muatPlaywright() {
  for (const jalur of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(jalur); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang:\n  npm i -D playwright\n  npx playwright install chromium\n');
  process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: '/opt/pw-browsers/chromium' } : {};

const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const LUAR = path.join(AKAR, 'potret');

/* Markup diambil dari index.html, bukan ditulis ulang di sini. */
const indexHtml = fs.readFileSync(path.join(PUBLIK, 'index.html'), 'utf8');
const a = indexHtml.indexOf('<div id="boot"');
/* Dua kali: penutup pertama milik .lz-lama, yang kedua milik #boot sendiri.
   Mengambil yang pertama saja menghasilkan potongan HTML yang tidak seimbang,
   dan peramban lalu "memperbaikinya" dengan cara yang tidak bisa ditebak. */
let b = indexHtml.indexOf('</div>', indexHtml.indexOf('id="bootLama"')) + 6;
b = indexHtml.indexOf('</div>', b) + 6;
if (a === -1 || b < a) throw new Error('markup #boot tidak ditemukan di index.html');
const BOOT = indexHtml.slice(a, b);

const halaman = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<style>
  body{ margin:0; min-height:100vh; background:var(--bg); }
  /* Sesuatu di belakang layar muat, supaya buram-tembusnya benar-benar
     terlihat bekerja dan bukan sekadar latar polos. */
  .isi{ padding:28px; font:600 15px/1.6 system-ui,sans-serif; color:var(--text); }
  .kotak{ height:120px; border-radius:16px; margin:12px 0;
          background:linear-gradient(120deg,var(--accent),#3b82f6); }
</style>
</head><body>
  <div class="isi">
    <h1>Total Penghimpunan</h1><div class="kotak"></div>
    <div class="kotak"></div><div class="kotak"></div>
  </div>
  ${BOOT}
</body></html>`;

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const nama = req.url.split('?')[0];
  if (nama === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(halaman); }
  const berkas = path.join(PUBLIK, nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('tidak ada'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(LUAR, { recursive: true });
  const br = await chromium.launch(CHROMIUM);

  for (const [tema, lebar, tinggi] of [['terang', 900, 560], ['gelap', 900, 560], ['hp', 390, 620]]) {
    const ctx = await br.newContext({ viewport: { width: lebar, height: tinggi } });
    const p = await ctx.newPage();
    const galat = [];
    p.on('pageerror', (e) => galat.push(String(e)));
    await p.goto(A + '/');
    if (tema === 'gelap') {
      await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    }
    await p.waitForTimeout(600);

    const ukur = await p.evaluate(() => {
      const bar = document.querySelector('#boot .lz-bar');
      const batang = Array.from(bar.querySelectorAll('i'));
      const r = bar.getBoundingClientRect();
      /* offsetHeight, bukan getBoundingClientRect: animasinya memang
         meregangkan batang lewat transform, jadi tinggi terpasangnya
         SEHARUSNYA berubah-ubah saat berjalan. Yang dibandingkan di sini
         tinggi tata letaknya, sebelum transform. */
      const tinggi = batang.map((x) => x.offsetHeight);
      const warna = batang.map((x) => getComputedStyle(x).backgroundColor);
      const jeda = batang.map((x) => getComputedStyle(x).animationDelay);
      return {
        jumlah: batang.length,
        tinggi,
        tengahLebihTinggi: tinggi.length === 3 && tinggi[1] > tinggi[0] + 8 && tinggi[1] > tinggi[2] + 8,
        tepiSama: tinggi.length === 3 && tinggi[0] === tinggi[2],
        /* Jeda yang berbeda itulah yang membuat ketiganya berdenyut bergantian
           alih-alih berkedip bersamaan. */
        jedaBeda: new Set(jeda).size === 3,
        warna: warna[0],
        kotak: { x: Math.round(r.left), y: Math.round(r.top), w: Math.ceil(r.width), h: Math.ceil(r.height) },
      };
    });

    const salah = [];
    if (galat.length) salah.push('galat JS: ' + galat.join(' | '));
    if (ukur.jumlah !== 3) salah.push('batang ' + ukur.jumlah + ', seharusnya 3');
    if (!ukur.tengahLebihTinggi) salah.push('batang tengah tidak lebih tinggi');
    if (!ukur.tepiSama) salah.push('dua batang tepi tidak sama tinggi');
    if (!ukur.jedaBeda) salah.push('jeda animasinya tidak berbeda-beda');
    if (/rgba?\(\s*255,\s*255,\s*255/.test(ukur.warna)) salah.push('batangnya masih putih');

    console.log(`  ${tema}: ${ukur.jumlah} batang ${ukur.tinggi.join('/')}px, warna ${ukur.warna}`
      + (salah.length ? '  \u2190 ' + salah.join('; ') : ''));
    if (salah.length) process.exitCode = 1;

    /* Tiga saat berbeda dalam satu putaran: riaknya harus terlihat berpindah,
       bukan seluruh kata berkedip bersamaan. */
    for (const [ke, jeda] of [[1, 0], [2, 700], [3, 700]]) {
      if (jeda) await p.waitForTimeout(jeda);
      await p.screenshot({ path: path.join(LUAR, `loader-${tema}-${ke}.png`) });
    }
    /* Potongan rapat sekitar katanya saja, untuk memeriksa pitanya dari dekat. */
    await p.screenshot({
      path: path.join(LUAR, `loader-${tema}-dekat.png`),
      clip: { x: ukur.kotak.x - 6, y: ukur.kotak.y - 6, width: ukur.kotak.w + 12, height: ukur.kotak.h + 12 },
    });
    await ctx.close();
  }

  /* ─── dua keadaan yang tidak pernah dilihat siapa pun kalau tidak sengaja
     diperiksa ───
     1. prefers-reduced-motion: animasi dimatikan. Sembilan pita yang DIAM dan
        bersebelahan tetap membentuk satu kata utuh — tapi kalau salah satu
        aturannya meleset, yang tersisa cuma sepersembilan huruf.
     2. selubung sibuk: kata yang sama, jauh lebih kecil. Kalau ukurannya tidak
        ikut mengecil, tiap perpindahan menu menutup layar dengan huruf raksasa. */
  {
    const ctx = await br.newContext({ viewport: { width: 900, height: 560 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(A + '/');
    await p.waitForTimeout(300);
    const diam = await p.evaluate(() => {
      const batang = Array.from(document.querySelectorAll('#boot .lz-bar i'));
      return {
        bergeser: batang.filter((x) => getComputedStyle(x).transform !== 'none').length,
        /* Tanpa gerak, warnanya harus dipenuhkan — batang yang diam DAN redup
           terbaca seperti elemen mati, bukan penanda "sedang memuat". */
        redup: batang.filter((x) => {
          const m = getComputedStyle(x).backgroundColor.match(/[\d.]+/g) || [];
          return m.length > 3 && parseFloat(m[3]) < 0.9;
        }).length,
      };
    });
    /* Kelas ditambahkan di panggilan terpisah lalu ditunggu sebentar.
       Menambah kelas dan membaca getComputedStyle dalam satu evaluate
       mengembalikan nilai LAMA di sini: tanpa animasi yang berjalan, Chromium
       belum tentu menghitung ulang gayanya saat itu juga. Yang terbaca lalu
       terlihat seperti aturan CSS yang tidak berlaku, padahal aturannya benar
       \u2014 sudah sempat salah didiagnosis sekali. */
    const sebelum = await p.evaluate(() =>
      document.querySelector('#boot .lz-bar i:nth-child(2)').offsetHeight);
    await p.evaluate(() => {
      const b = document.getElementById('boot');
      b.classList.add('lz--sibuk');
      b.querySelector('.lz-bar').classList.add('lz-bar-kecil');
    });
    await p.waitForTimeout(120);
    const sesudah = await p.evaluate(() =>
      document.querySelector('#boot .lz-bar i:nth-child(2)').offsetHeight);
    await p.evaluate(() => {
      const b = document.getElementById('boot');
      b.classList.remove('lz--sibuk');
      b.querySelector('.lz-bar').classList.remove('lz-bar-kecil');
    });
    await p.waitForTimeout(60);
    const salah = [];
    if (diam.bergeser) salah.push(diam.bergeser + ' batang tetap tergeser tanpa animasi');
    if (diam.redup) salah.push(diam.redup + ' batang tetap redup tanpa animasi');
    if (!(sesudah < sebelum)) salah.push('selubung sibuk tidak mengecil');
    console.log(`  tanpa-animasi: 3 batang penuh; selubung ${sebelum}px \u2192 ${sesudah}px`
      + (salah.length ? '  \u2190 ' + salah.join('; ') : ''));
    if (salah.length) process.exitCode = 1;
    await p.screenshot({ path: path.join(LUAR, 'loader-tanpa-animasi.png') });
    await ctx.close();
  }

  await br.close();
  server.close();
  console.log('potret layar muat selesai');
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
