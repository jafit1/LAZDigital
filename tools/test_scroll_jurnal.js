/* Uji: panel Jurnal Penerimaan (Laporan) punya scrollbar yang benar-benar
 * TERLIHAT dan bisa ditarik, diukur di peramban sungguhan.
 *
 * Versi lama uji ini hanya membaca teks CSS, dan lulus padahal scrollbar tidak
 * muncul: styles.css punya `* { scrollbar-width: none !important }` (baris
 * ~1088), dan `.jurnal-scroll{scrollbar-width:thin}` tanpa !important kalah.
 * Di Chrome terbaru, scrollbar-width juga mengalahkan ::-webkit-scrollbar.
 * Karena itu yang diukur di sini hasil akhirnya: lebar jalur scrollbar
 * (offsetWidth - clientWidth) harus lebih dari nol.
 *
 * Pemilik (21 Oktober 2026): "buat juga ada scroll yang bisa ditarik di
 * bagian jurnal penerimaan".
 *
 *   node tools/test_scroll_jurnal.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

function muatPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});

const PUBLIK = path.join(__dirname, '..', 'src', 'public');
const app = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(PUBLIK, 'styles.css'), 'utf8');
const fn = (app.match(/function renderJurnalPreview\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 240)); }
};

cek('renderJurnalPreview memakai wrapper .jurnal-scroll', /class="jurnal-scroll"/.test(fn));

(async () => {
  /* Playwright headless memasang --hide-scrollbars secara bawaan, sehingga jalur
     scrollbar selalu terukur 0 dan uji ini tidak bisa membedakan ada/tidaknya.
     Flag itu dilepas supaya yang diukur sama dengan peramban pemilik. */
  const browser = await chromium.launch(Object.assign({}, CHROMIUM, { ignoreDefaultArgs: ['--hide-scrollbars'] }));
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const baris = Array.from({ length: 120 }, (_, i) => '<tr><td>' + (i + 1) + '</td><td>Akun contoh</td><td>1000</td></tr>').join('');
    await page.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>'
      + '<div class="jurnal-scroll"><table><tbody>' + baris + '</tbody></table></div></body></html>');
    const u = await page.evaluate(() => {
      const e = document.querySelector('.jurnal-scroll');
      const tinggiIsi = e.scrollHeight, tinggiKotak = e.clientHeight;
      e.scrollTop = 200;
      return { jalur: e.offsetWidth - e.clientWidth, bisaGulir: tinggiIsi > tinggiKotak, geser: e.scrollTop,
        sw: getComputedStyle(e).scrollbarWidth };
    });
    cek('data panjang memang bisa digulir', u.bisaGulir, u);
    cek('jalur scrollbar memakan lebar (terlihat, bukan 0)', u.jalur > 0, u);
    cek('scrollbar tidak disembunyikan (scrollbar-width bukan none)', u.sw !== 'none', u);
    cek('jalur cukup lebar untuk ditarik (minimal 8 px)', u.jalur >= 8, u);
    cek('isi benar-benar bergeser saat digulir', u.geser > 0, u);
  } finally {
    await browser.close();
  }
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_scroll_jurnal.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
