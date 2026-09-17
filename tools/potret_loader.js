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
const b = indexHtml.indexOf('</div>', indexHtml.indexOf('id="bootLama"')) + 6;
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
      const mark = document.querySelector('#boot .lz-mark');
      const pita = Array.from(mark.querySelectorAll('.lz-teks'));
      const rM = mark.getBoundingClientRect();

      /* Kotak tiap lapis harus identik. Kalau tidak, hurufnya bergeser antar
         pita dan kata itu terlihat robek.
         Diukur dengan offset*, bukan getBoundingClientRect: riaknya memang
         menggeser tiap pita beberapa piksel, jadi kotak terpasang justru
         SEHARUSNYA berbeda-beda saat animasi berjalan. Yang wajib sama adalah
         kotak tata letaknya, sebelum transform. */
      const meleset = pita.filter((t) =>
        t.offsetLeft !== pita[0].offsetLeft || t.offsetTop !== pita[0].offsetTop
        || Math.abs(t.offsetWidth - pita[0].offsetWidth) > 1
        || Math.abs(t.offsetHeight - pita[0].offsetHeight) > 1).length;

      /* clip-path tiap pita dibaca kembali dari gaya terhitung, lalu diperiksa
         apakah gabungannya menutup seluruh tinggi huruf. Celah di antara pita
         muncul sebagai garis rambut yang memotong huruf. */
      const persen = (s) => {
        const m = String(s).match(/inset\(([^)]+)\)/);
        if (!m) return null;
        const bagian = m[1].trim().split(/\s+/).map((v) => parseFloat(v) || 0);
        return { atas: bagian[0], bawah: bagian[2] };
      };
      const pitaPersen = pita.map((t) => persen(getComputedStyle(t).clipPath)).filter(Boolean);
      pitaPersen.sort((x, y) => x.atas - y.atas);
      let tutupSampai = 0, celah = 0;
      for (const q of pitaPersen) {
        if (q.atas > tutupSampai + 0.01) celah++;
        tutupSampai = Math.max(tutupSampai, 100 - q.bawah);
      }

      const teks = pita.map((t) => t.textContent.trim());
      return {
        jumlahPita: pita.length,
        jumlahClip: pitaPersen.length,
        meleset, celah,
        tutupSampai: Math.round(tutupSampai * 100) / 100,
        kataSama: new Set(teks).size === 1,
        kata: teks[0],
        lebarKata: Math.round(rM.width),
        tinggiKata: Math.round(rM.height),
        kotak: { x: Math.round(rM.left), y: Math.round(rM.top), w: Math.ceil(rM.width), h: Math.ceil(rM.height) },
      };
    });

    const salah = [];
    if (galat.length) salah.push('galat JS: ' + galat.join(' | '));
    if (ukur.jumlahPita !== 9) salah.push('pita ' + ukur.jumlahPita + ', seharusnya 9');
    if (ukur.jumlahClip !== 9) salah.push('clip-path hanya ' + ukur.jumlahClip + ' pita');
    if (ukur.meleset) salah.push(ukur.meleset + ' pita tidak sejajar');
    if (ukur.celah) salah.push(ukur.celah + ' celah antar pita');
    if (ukur.tutupSampai < 99.9) salah.push('pita berhenti di ' + ukur.tutupSampai + '%');
    if (!ukur.kataSama) salah.push('kata antar pita berbeda');
    if (ukur.lebarKata < 40 || ukur.tinggiKata < 12) salah.push('kotak kata terlalu kecil');

    console.log(`  ${tema}: "${ukur.kata}" ${ukur.jumlahPita} pita, `
      + `${ukur.lebarKata}×${ukur.tinggiKata}px, tutup 0–${ukur.tutupSampai}%`
      + (salah.length ? '  ← ' + salah.join('; ') : ''));
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
      const pita = Array.from(document.querySelectorAll('#boot .lz-teks'));
      return {
        redup: pita.filter((t) => parseFloat(getComputedStyle(t).opacity) < 0.99).length,
        bergeser: pita.filter((t) => getComputedStyle(t).transform !== 'none').length,
      };
    });
    /* Kelas ditambahkan di panggilan terpisah lalu ditunggu sebentar.
       Menambah kelas dan membaca getComputedStyle dalam satu evaluate
       mengembalikan nilai LAMA di sini: tanpa animasi yang berjalan, Chromium
       belum tentu menghitung ulang gayanya saat itu juga. Yang terbaca lalu
       terlihat seperti aturan CSS yang tidak berlaku, padahal aturannya benar
       — sudah sempat salah didiagnosis sekali. */
    const sebelum = await p.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('#boot .lz-mark')).fontSize));
    await p.evaluate(() => document.getElementById('boot').classList.add('lz--sibuk'));
    await p.waitForTimeout(120);
    const sesudah = await p.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector('#boot .lz-mark')).fontSize));
    await p.evaluate(() => document.getElementById('boot').classList.remove('lz--sibuk'));
    await p.waitForTimeout(60);
    const besar = { sebelum, sesudah };
    const salah = [];
    if (diam.redup) salah.push(diam.redup + ' pita tetap redup tanpa animasi');
    if (diam.bergeser) salah.push(diam.bergeser + ' pita tetap tergeser tanpa animasi');
    if (!(besar.sesudah < besar.sebelum * 0.7)) salah.push('selubung sibuk tidak mengecil');
    console.log(`  tanpa-animasi: 9 pita utuh; selubung ${besar.sebelum}px \u2192 ${besar.sesudah}px`
      + (salah.length ? '  \u2190 ' + salah.join('; ') : ''));
    if (salah.length) process.exitCode = 1;
    await p.screenshot({ path: path.join(LUAR, 'loader-tanpa-animasi.png') });
    await ctx.close();
  }

  await br.close();
  server.close();
  console.log('potret layar muat selesai');
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
