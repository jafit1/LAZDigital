/* Uji sinkronisasi UI dan aturan CSS/HTML lintas 12 halaman LAZDigital.
 *
 * KENAPA UJI INI ADA.
 * Kesalahan CSS dan ketidaksinkronan antar modul tidak pernah melempar galat JS:
 * - Mobile drawer terpotong atau kehilangan teks karena aturan global di bawahnya
 *   menimpa @media (max-width: 1023px).
 * - Grid KPI 3 kartu (Dashboard, Saldo Kas & Bank, Saldo KL publik) dipaksa jadi
 *   4 kolom, menyisakan 20-25% lubang kosong di kanan.
 * - Modul baru (Pengajuan) dan 3 menu baru (Saldo Daerah Rinci, Saldo KLL/ULL
 *   Rinci, Kode Akses KL) luput dari tombol tema, lz-perangkat, dan kelas CSS rumah.
 * - Variabel CSS tak terdefinisi (--line, --font, --primary, --bahaya, --body)
 *   dan kelas karangan (.input, .inp, .tbl, .text-danger, .badge-muted, .pj-fgrid)
 *   membuat warna dan garis hilang diam-diam.
 *
 * Uji ini murni membaca berkas di src/public (tanpa Playwright), sehingga jalan
 * cepat di mesin mana pun.
 *
 * jalankan:  node tools/test_sinkron_ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PUB = path.join(AKAR, 'src', 'public');
const baca = (rel) => fs.readFileSync(path.join(PUB, rel), 'utf8');

let ok = 0, gagal = 0;
function cek(nama, syarat, info) {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : ' -> ' + String(JSON.stringify(info)).slice(0, 260)); }
}

function ekstrakHead(html) {
  const m = html.match(/<head[\s\S]*?<\/head>/i);
  return m ? m[0] : '';
}
function ekstrakBody(html) {
  const m = html.match(/<body[\s\S]*?<\/body>/i);
  return m ? m[0] : '';
}
function hapusKomentarCss(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}
function hapusKomentarJs(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

const css = baca('styles.css');
const cssBersih = hapusKomentarCss(css);
const app = baca('app.js');
const pj = baca('js/lz-pengajuan.js');
const jrb = baca('js/lz-jurnal-bank.js');
const am = baca('js/asesmen-mustahik.js');
const blast = baca('blast.js');
const surat = baca('surat.js');
const saldoKl = baca('saldo-kl.html');

// ================================================================== A. CSS & LAYOUT
console.log('\n=== A. KONFLIK CSS MOBILE DRAWER, KPI GRID, DAN TOKEN ===');

// 1. Urutan 100vh sebelum 100dvh pada .tn-nav mobile
const mTnNavBlock = cssBersih.match(/\.tn-nav\s*\{[^}]*100dvh[^}]*\}/);
const dvhAman = !!mTnNavBlock && mTnNavBlock[0].indexOf('100vh') < mTnNavBlock[0].indexOf('100dvh');
cek('styles.css: .tn-nav mobile menulis fallback 100vh sebelum 100dvh', dvhAman, mTnNavBlock ? mTnNavBlock[0].slice(0, 140) : 'blok tidak ada');

// 2. Blok penjaga mobile drawer sesudah aturan global bagian 15/55 (harus setelah baris 6000)
const barisCss = css.split('\n');
const ekorCss = hapusKomentarCss(barisCss.slice(6000).join('\n'));
cek('styles.css: aturan @media (max-width:1023px) penjaga mobile drawer ada sesudah bagian 55',
  /@media\s*\(\s*max-width\s*:\s*1023px\s*\)[\s\S]*?\.topnav[\s\S]*?will-change\s*:\s*auto\s*!important/.test(ekorCss));
cek('styles.css: .topnav mobile menyetel overflow:visible dan height:54px sesudah aturan global',
  /@media\s*\(\s*max-width\s*:\s*1023px\s*\)[\s\S]*?\.topnav[^}]*overflow\s*:\s*visible\s*!important[\s\S]*?height\s*:\s*54px\s*!important/.test(ekorCss)
  || /@media\s*\(\s*max-width\s*:\s*1023px\s*\)[\s\S]*?\.topnav[^}]*height\s*:\s*54px\s*!important[\s\S]*?overflow\s*:\s*visible\s*!important/.test(ekorCss));
cek('styles.css: .app.collapsed .tn-nav .tn-item .tn-tip tetap tampil (opacity:1, position:static) di mobile < 1024px',
  /@media\s*\(\s*max-width\s*:\s*1023px\s*\)[\s\S]*?\.app\.collapsed\s+\.tn-nav\s+\.tn-item\s+\.tn-tip[^}]*opacity\s*:\s*1\s*!important/.test(ekorCss));
cek('styles.css: .tn-brand (margin-bottom:0) dan .tn-right (border-top:none) dijaga di mobile < 1024px',
  /@media\s*\(\s*max-width\s*:\s*1023px\s*\)[\s\S]*?\.tn-brand[^}]*margin-bottom\s*:\s*0\s*!important/.test(ekorCss)
  && /@media\s*\(\s*max-width\s*:\s*1023px\s*\)[\s\S]*?\.tn-right[^}]*border-top\s*:\s*none\s*!important/.test(ekorCss));

// 3. Ketiga lencana navbar disembunyikan seragam di < 1024px
const lencanaMobile = /@media\s*\(\s*max-width\s*:\s*1023px\s*\)[\s\S]*?#lencanaPeran[\s\S]*?#lencanaLingkup[\s\S]*?#lencanaDriver[^}]*display\s*:\s*none\s*!important/.test(cssBersih);
cek('styles.css: #lencanaPeran, #lencanaLingkup, #lencanaDriver disembunyikan seragam di < 1024px', lencanaMobile);

// 4. Grid KPI 3 kartu (Dashboard, Saldo, Saldo KL publik)
cek('styles.css: aturan 4 kolom .kpis-v2 mengecualikan .saldo-kpi dan .is-tiga',
  /\.kpis-v2:not\(\.kpi-media\):not\(\.kpi-surat\):not\(\.is-lima\):not\(\.is-tiga\):not\(\.saldo-kpi\)/.test(cssBersih));
cek('styles.css: .kpis-v2.is-tiga mendefinisikan 3 kolom minmax(0,...) di layar lebar',
  /\.kpis-v2\.is-tiga\s*\{[^}]*grid-template-columns\s*:[^}]*minmax\(0\s*,/.test(cssBersih));
cek('app.js: dashboard utama 3 kartu memakai kelas .kpis-v2.is-tiga',
  /var kpis\s*=\s*['"]<div class="kpis-v2 is-tiga">['"]/.test(app));
cek('saldo-kl.html: kartu Belum LPJ tetap disembunyikan (tidak aktif)',
  !/\+kartu\(\s*['"]Belum LPJ['"]/.test(saldoKl));
cek('saldo-kl.html: .kl-stat pada >= 720px memakai repeat(auto-fit, minmax(180px, 1fr)) bukan 4 kolom kaku',
  /@media\s*\(min-width:\s*720px\)\s*\{\s*\.kl-stat\s*\{\s*grid-template-columns\s*:\s*repeat\(auto-fit\s*,\s*minmax\(180px\s*,\s*1fr\)\)/.test(saldoKl));

// 5. Toast error & variabel tak terdefinisi di styles.css & .ai-stop
cek('styles.css: .toast.err dan .toast.toast--danger didefinisikan',
  /\.toast\.err\b/.test(cssBersih) && /\.toast\.toast--danger\b/.test(cssBersih));
cek('styles.css: tidak ada var(--body) tak terdefinisi', !/var\(--body\)/.test(cssBersih));
cek('styles.css: .kpi-surat .sr-kpi:hover punya fallback pada var(--kpi-accent, ...)',
  !/\.kpi-surat\s+\.sr-kpi:hover\s*\{\s*border-color\s*:\s*var\(--kpi-accent\)\s*\}/.test(cssBersih));
cek('styles.css: kelas .ai-stop didefinisikan', /\.ai-stop\b/.test(cssBersih));

// 6. Grid utama memakai minmax(0, ...) bukan fr telanjang
for (const sel of ['.grid-2', '.row-3', '.fgrid', '.lay-summary', '.lay-split-grid', '.lap-sum', '.set-theme', '.set-switch-list']) {
  const esc = sel.replace('.', '\\.');
  const re = new RegExp(esc + '\\s*\\{[^}]*grid-template-columns\\s*:([^;}]+)');
  const m = cssBersih.match(re);
  const aman = !!m && /minmax\(0\s*,/.test(m[1]);
  cek('styles.css: ' + sel + ' memakai minmax(0,...) bukan fr telanjang', aman, m ? m[1].trim() : 'tidak ditemukan');
}

// ================================================================== B. MODUL PENGAJUAN
console.log('\n=== B. SINKRONISASI MODUL PENGAJUAN ===');

const pjHtml = baca('pengajuan.html');
cek('pengajuan.html: xlsx.full.min.js dimuat async (bukan defer blocking)',
  /<script[^>]+src="\/js\/vendor\/xlsx\.full\.min\.js"[^>]*\basync\b/.test(pjHtml));
cek('lz-pengajuan.js: memasang tombol ganti tema (.kepala-tema + LZTema.svg())',
  /kepala-tema/.test(pj) && /LZTema/.test(pj));
cek('lz-pengajuan.js: tidak menduplikasi tombol Kembali ke LAZDigital di dalam menu nav',
  !/kode\s*:\s*['"]kembali_main['"]/.test(pj));
cek('lz-pengajuan.js: memasang handler klik untuk #chipPengguna',
  /chipPengguna/.test(pj));
cek('lz-pengajuan.js: membaca localStorage sidebar_collapsed saat boot',
  /getItem\s*\(\s*['"]sidebar_collapsed['"]\s*\)/.test(pj));
cek('lz-pengajuan.js: memanggil enhanceDatePickers atau tandaiPerluEnhance',
  /enhanceDatePickers|tandaiPerluEnhance/.test(pj));
function adaKelasKarangan(isi, daftar) {
  const re = /class\s*=\s*"([^"]*)"/g;
  const set = new Set(daftar);
  let m;
  while ((m = re.exec(isi)) !== null) {
    for (const tok of m[1].split(/\s+/)) {
      if (set.has(tok)) return tok;
    }
  }
  return '';
}

cek('lz-pengajuan.js: tidak memakai kelas karangan .input, .pj-fgrid, .badge-muted, .text-danger',
  !adaKelasKarangan(pj, ['input', 'pj-fgrid', 'badge-muted', 'text-danger']));
cek('lz-pengajuan.js: tidak memanggil alert() atau confirm() native',
  !/(?:^|[^\w.$])(alert|confirm|prompt)\s*\(/.test(hapusKomentarJs(pj)));

// ================================================================== C. 3 MENU BARU APP.JS
console.log('\n=== C. SINKRONISASI 3 MENU BARU DI app.js ===');

const blokMenuBaru = app.slice(app.indexOf('function _saldoRinciHeader'), app.indexOf('function buatKodeKL'));
cek('app.js: _saldoRinciHeader dan viewKodeAksesKL memakai .page-head (bukan .card-h / .card-t)',
  /class="page-head"/.test(blokMenuBaru) && !/class="card-[ht]"/.test(blokMenuBaru));
cek('app.js: 3 menu baru tidak memakai kelas karangan .inp atau .tbl',
  !/class="[^"]*\b(inp|tbl)\b/.test(blokMenuBaru));
cek('app.js: 3 menu baru tidak memakai var(--line) tak terdefinisi',
  !/var\(--line\)/.test(blokMenuBaru));
cek('app.js: tabel di saldoRinciMuat dan muatKodeKL dibungkus .tabel-geser',
  (blokMenuBaru.match(/class="tabel-geser"/g) || []).length >= 2);
cek('app.js: _saldoRinciHeader tidak hardcode tanggal 2026-11-20',
  !/'2026-11-20'/.test(blokMenuBaru));

// ================================================================== D. 12 HALAMAN HTML
console.log('\n=== D. SINKRONISASI 12 HALAMAN HTML ===');

const HTMLS = [
  'index.html', 'ai.html', 'blast.html', 'fund.html', 'media.html', 'pengajuan.html',
  'surat.html', 'harian.html', 'lacak.html', 'public.html', 'saldo-kl.html', 'ump.html'
];
for (const nama of HTMLS) {
  const html = baca(nama);
  const head = ekstrakHead(html);
  const body = ekstrakBody(html);
  const headTanpaNoscript = head.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
  const fontBlocking = /<link[^>]+fonts\.googleapis\.com[^>]*rel="stylesheet"(?![^>]*media="print")|<link[^>]+rel="stylesheet"[^>]*fonts\.googleapis\.com(?![^>]*media="print")/i.test(headTanpaNoscript);
  cek(nama + ': Google Fonts non-blocking (media="print")', !fontBlocking);
  cek(nama + ': memuat /js/lz-perangkat.js di <head>', /<script[^>]+src="\/js\/lz-perangkat\.js"/.test(head));
  cek(nama + ': memasang data-theme di <head> (bukan di <body>)', /setAttribute\(\s*['"]data-theme['"]/.test(head) && !/setAttribute\(\s*['"]data-theme['"]/.test(body));
  cek(nama + ': punya <link rel="apple-touch-icon">', /<link[^>]+rel="apple-touch-icon"/.test(head));
  const mTitle = head.match(/<title>([^<]*)<\/title>/i);
  cek(nama + ': <title> tanpa em dash (seragam pakai tanda hubung biasa)', !!mTitle && !mTitle[1].includes('\u2014'), mTitle ? mTitle[1] : '');
}
const fundHtml = baca('fund.html');
const fundHeadTanpaNoscript = ekstrakHead(fundHtml).replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
cek('fund.html: leaflet.css dimuat non-blocking (media="print")',
  !/<link[^>]+leaflet\.css(?![^>]*media="print")/i.test(fundHeadTanpaNoscript));

// ================================================================== E. VARIABEL, KELAS, DIALOG NATIVE
console.log('\n=== E. VARIABEL HILANG, KELAS KARANGAN, DAN DIALOG NATIVE ===');

cek('app.js: tidak ada var(--line), var(--font), var(--primary)',
  !/var\(--(line|font|primary)\)/.test(app));
cek('blast.js: tidak ada var(--bahaya)', !/var\(--bahaya\)/.test(blast));
cek('app.js: tidak ada kelas karangan .text-danger, .text-success, .badge-muted, .input',
  !adaKelasKarangan(app, ['text-danger', 'text-success', 'badge-muted', 'input']));
cek('lz-jurnal-bank.js: tidak ada kelas karangan .text-danger, .text-success, .input',
  !adaKelasKarangan(jrb, ['text-danger', 'text-success', 'input']));
cek('asesmen-mustahik.js: kelas .am-tujuan-box, .am-bawah-info, .am-hasil-skor-box terdefinisi di CSS-nya',
  /\.am-tujuan-box\s*\{/.test(am) && /\.am-bawah-info\s*\{/.test(am) && /\.am-hasil-skor-box\s*\{/.test(am));

for (const [nama, isi] of [
  ['lz-jurnal-bank.js', jrb],
  ['asesmen-mustahik.js', am],
  ['blast.js', blast],
  ['surat.js', surat]
]) {
  const bersih = hapusKomentarJs(isi);
  const adaNative = /(?:^|[^\w.$])(alert|confirm|prompt)\s*\(/.test(bersih);
  cek(nama + ': tidak memakai dialog native alert()/confirm()/prompt()', !adaNative);
}

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) process.exit(1);
console.log('\ntest_sinkron_ui.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
