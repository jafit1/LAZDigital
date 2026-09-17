/* Potret kendali kepala dasbor — sendirian, tanpa menyalakan seluruh aplikasi.
 *
 * Dasbor asli butuh login dan data dari Apps Script, jadi memotretnya utuh
 * berarti menyiapkan separuh sistem hanya untuk melihat satu baris tombol.
 * Di sini yang dimuat hanya styles.css dan potongan pembangun kendalinya.
 *
 * YANG DIPOTRET ADALAH KODE ASLINYA.
 * Baik fungsi maupun pernyataan pembangun tombol diambil apa adanya dari
 * app.js dengan penanda teks — bukan disalin ke sini. Salinan yang ditulis
 * tangan akan terus terlihat rapi di potret lama setelah kode aslinya
 * berubah, dan itu potret yang berbohong.
 *
 * Yang diperiksa: apakah benar SATU baris, dan apakah di layar HP ia berhenti
 * memakan ruang yang seharusnya untuk angka.
 *
 *   jalankan:  node tools/potret_kepala_dasbor.js
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

/* Data dasbor secukupnya — hanya medan yang dibaca pembangun kendali. */
const DASH = {
  selectedMonth: '2026-09',
  selectedPekan: 'Semua',
  selectedRentang: null,
  availableMonths: ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05'],
};

const halaman = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<style>body{padding:24px;background:var(--bg)}#kotak{max-width:100%}</style>
</head><body>
<div class="dh"><div class="dh-content"><div class="dh-row">
  <div class="dh-greeting"><div class="dh-hi">Assalamualaikum, Ma'ruf</div>
  <div class="dh-sub">Rabu, 17 September 2026</div></div>
  <div class="dh-acts" id="kotak"></div>
</div><div id="panel"></div></div></div>
<script src="/app-kendali.js"></script>
</body></html>`;

const appJs = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');

/* Potongan app.js diambil dengan penanda teks. Kalau penandanya hilang karena
   kodenya ditata ulang, harness ini MATI dengan pesan jelas — bukan diam-diam
   memotret versi lama. */
function ambilFungsi(nama) {
  const awal = appJs.indexOf('function ' + nama + '(');
  if (awal === -1) throw new Error('tidak ada fungsi: ' + nama);
  let dalam = 0;
  for (let j = appJs.indexOf('{', awal); j < appJs.length; j++) {
    if (appJs[j] === '{') dalam++;
    else if (appJs[j] === '}') { dalam--; if (!dalam) return appJs.slice(awal, j + 1); }
  }
  throw new Error('kurung tidak tertutup: ' + nama);
}
function ambilAntara(dari, sampai) {
  const a = appJs.indexOf(dari);
  const b = appJs.indexOf(sampai, a + 1);
  if (a === -1 || b === -1) throw new Error('penanda hilang di app.js: ' + dari + ' … ' + sampai);
  return appJs.slice(a, b);
}

const ikon = appJs.slice(appJs.indexOf('var SVG_ICONS'), appJs.indexOf('};', appJs.indexOf('var SVG_ICONS')) + 2);

/* Urutan kendali di dalam baris. Ini satu-satunya yang masih ditulis ulang di
   sini, jadi dicocokkan langsung dengan app.js supaya tidak bisa berbeda. */
const SUSUNAN = "addHimpunBtn + addSalurBtn + periodeChip + menuBtn";
if (appJs.indexOf(SUSUNAN) === -1) {
  throw new Error('susunan kendali di app.js sudah berubah; perbarui SUSUNAN di harness ini');
}

const kendali = `
${ikon}
function el(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
function formatMonthYear(m){
  var b=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var p=String(m).split('-'); return b[Number(p[1])-1]+' '+p[0];
}
function rtLabel(a,b){ return a+' \\u2013 '+b; }
${ambilFungsi('rentangHTML')}
${ambilFungsi('dashPeriodeLabel')}
${ambilFungsi('dashPeriodeAngka')}
${ambilFungsi('dashPeriodePanel')}
${ambilFungsi('toggleDashPeriode')}
function canDo(){ return true; }
function go(){}
function openModalAddPenghimpunan(){}
function openModalAddPentasyarufan(){}
function handleMonthClick(){}
function handlePekanClick(){}
function dashHapusRentang(){}
function toggleCustomDropdown(){}
function openPublicLink(){}
function toggleDashEdit(){}
function dashMenuPilih(){}

var d = ${JSON.stringify(DASH)};
var canView = true;

/* ── diambil apa adanya dari app.js ── */
${ambilAntara('var addHimpunBtn=', '  var nm=')}
${ambilAntara('var periodeLengkap = ', '  /* Pilih tanggal memakai kalender rentang')}
/* ── akhir potongan app.js ── */

var dropdownOptions = [{ value:'Semua', label:'Semua Waktu' }].concat(
  d.availableMonths.map(function(m){ return { value:m, label:formatMonthYear(m) }; }));

document.getElementById('kotak').innerHTML =
  '<div class="dh-act-row">' + ${SUSUNAN} + '</div>';
document.getElementById('panel').innerHTML = dashPeriodePanel(d, dropdownOptions, null);
`;

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const nama = req.url.split('?')[0];
  if (nama === '/' ) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(halaman); }
  if (nama === '/app-kendali.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(kendali); }
  const berkas = path.join(PUBLIK, nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('tidak ada'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(LUAR, { recursive: true });

  const b = await chromium.launch(CHROMIUM);

  for (const [nama, lebar, tinggi] of [['kepala-desktop', 1280, 420], ['kepala-hp', 390, 620]]) {
    const ctx = await b.newContext({ viewport: { width: lebar, height: tinggi } });
    const p = await ctx.newPage();
    const galat = [];
    p.on('pageerror', (e) => galat.push(String(e)));
    await p.goto(A + '/');
    await p.waitForTimeout(500);
    if (galat.length) { console.error('  galat JS:', galat.join(' | ')); process.exitCode = 1; }

    const ukur = await p.evaluate(() => {
      const baris = document.querySelector('.dh-act-row');
      const tombol = Array.from(baris.children);
      /* Dikelompokkan dengan toleransi, bukan dibulatkan ke kisi tetap:
         pembulatan ke kelipatan 8px memecah dua tombol yang bersebelahan
         (11,9px dan 12,0px) menjadi "dua baris" padahal jelas satu. */
      const tops = tombol.map((t) => t.getBoundingClientRect().top).sort((a, b) => a - b);
      let barisTerpakai = 0, patokan = -1e9;
      for (const t of tops) if (t - patokan > 6) { barisTerpakai++; patokan = t; }
      const kanan = Math.max.apply(null, tombol.map((t) => t.getBoundingClientRect().right));
      const chip = document.getElementById('dashPeriodeBtn');
      const isi = chip.querySelector('.dh-periode-teks');
      return {
        jumlahKendali: tombol.length,
        barisTerpakai: barisTerpakai,
        tinggiKendali: Math.round(baris.getBoundingClientRect().height),
        lebarBaris: Math.round(kanan - tombol[0].getBoundingClientRect().left),
        /* Yang sungguh berbahaya bukan halaman yang bisa digulir ke samping,
           melainkan tombol yang terdorong ke luar layar tanpa tanda apa pun. */
        adaYangKeluarLayar: kanan > window.innerWidth + 1,
        chipTeks: isi.textContent,
        /* Chip berisi angka tidak boleh ikut terpotong — kalau ini pun
           terpotong, tidak ada lagi yang bisa dipendekkan. */
        chipTerpotong: isi.scrollWidth > isi.clientWidth + 1,
        /* Tombol tanpa label wajib tetap punya nama yang bisa dibaca pembaca
           layar; ikon saja tidak menyisakan apa pun untuk dibacakan. */
        tanpaNama: tombol.filter((t) => {
          const btn = t.matches('button') ? t : t.querySelector('button');
          return btn && !btn.textContent.trim() && !btn.getAttribute('aria-label');
        }).length,
      };
    });
    console.log(`  ${nama}: ${ukur.jumlahKendali} kendali, ${ukur.barisTerpakai} baris, `
      + `tinggi ${ukur.tinggiKendali}px, lebar ${ukur.lebarBaris}px, chip "${ukur.chipTeks}", `
      + `keluar layar: ${ukur.adaYangKeluarLayar ? 'YA' : 'tidak'}`);
    if (ukur.tinggiKendali > 52 || ukur.adaYangKeluarLayar) {
      console.error('  ^ seharusnya satu baris dan seluruhnya terlihat');
      process.exitCode = 1;
    }
    if (ukur.chipTerpotong) { console.error('  ^ chip periode terpotong'); process.exitCode = 1; }
    if (ukur.tanpaNama) { console.error('  ^ ada tombol tanpa aria-label'); process.exitCode = 1; }

    await p.screenshot({ path: path.join(LUAR, nama + '-tutup.png') });
    await p.click('#dashPeriodeBtn');
    await p.waitForTimeout(450);
    /* Panel yang gagal terbuka karena galat JS tetap menghasilkan potret yang
       terlihat "wajar" — hanya kosong. Jadi keadaan terbukanya diperiksa, bukan
       dipercaya. */
    const terbuka = await p.evaluate(() =>
      document.getElementById('dashPeriodePanel').classList.contains('buka'));
    if (!terbuka || galat.length) {
      console.error('  ^ panel periode tidak terbuka' + (galat.length ? ': ' + galat.join(' | ') : ''));
      process.exitCode = 1;
    }
    await p.screenshot({ path: path.join(LUAR, nama + '-buka.png') });
    await ctx.close();
  }

  await b.close();
  server.close();
  console.log('potret kepala dasbor selesai');
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
