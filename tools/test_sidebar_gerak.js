/* Uji gerak buka/tutup bilah menu LAZ Digital.
 *
 * KELUHAN YANG DIJAGA DI SINI: "kalau unhide terus hide animasinya masih kaya
 * stuck gitu dikit". Sendatan seperti itu tidak bisa diuji dengan melihat —
 * ia lahir dari pekerjaan yang diminta ke peramban tiap frame. Jadi yang
 * diperiksa di sini sebab-sebabnya, satu per satu, dengan angka.
 *
 *  A. Isi halaman tetap DIDORONG seperti sebelumnya — bukan ditutupi panel.
 *     Tapi perpindahannya harus SEKALI: di tengah animasi, kotak .main wajib
 *     masih persis sama dengan salah satu ujungnya, tidak pernah di antaranya.
 *     Kalau ia berada di antara, berarti ia sedang dianimasikan — dan itu
 *     berarti seluruh pohon dashboard dihitung ulang tiap frame.
 *  B. Ikon tidak bergerak. Titik tiap ikon diukur di kedua keadaan dan di
 *     tengah animasi; selisihnya harus nol.
 *  C. Keterangan nama melayang dengan lebar tetap, memudar lewat opacity.
 *  D. Yang dianimasikan hanya properti murah.
 *  E. Ongkos nyatanya, ditanyakan langsung ke Chrome.
 *  F. Logo menepi saat ciut, ke tengah saat dibuka — dan pindahnya lewat
 *     transform, bukan lewat ukuran.
 *  G. Semua butir menu tetap bisa ditekan di kedua keadaan.
 *  H. Menutup lewat klik di luar dan lewat Esc terpasang di keempat halaman.
 *
 * jalankan:  node tools/test_sidebar_gerak.js
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

const indexHtml = fs.readFileSync(path.join(PUBLIK, 'index.html'), 'utf8');
const a = indexHtml.indexOf('<header class="topnav"');
const b = indexHtml.indexOf('</header>', a) + '</header>'.length;
if (a === -1 || b < a) throw new Error('markup .topnav tidak ditemukan di index.html');
const HEADER = indexHtml.slice(a, b);

/* Wordmark 3:1 — bentuk logo Lazismu Bantul yang sesungguhnya, dan bentuk
   yang paling sulit ditangani di rel sempit. */
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 50">'
  + '<rect width="150" height="50" fill="#ea6a1e"/>'
  + '<text x="75" y="33" font-size="22" font-family="sans-serif" fill="#fff" text-anchor="middle">lazismu</text>'
  + '</svg>').toString('base64');

/* Isi halaman sengaja dibuat berat — 12 kartu berisi tabel. Kalau isinya cuma
   satu paragraf, menghitung ulang tata letak jadi murah dan ujinya lulus
   walaupun sebabnya belum diperbaiki. Dashboard sungguhan lebih berat lagi. */
function isiBerat() {
  let h = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:18px">';
  for (let i = 0; i < 12; i++) {
    h += '<div class="card" style="padding:14px"><h3>Kartu ' + i + '</h3><table>';
    for (let r = 0; r < 14; r++) {
      h += '<tr><td>Baris ' + r + '</td><td>Rp ' + (r * 125000).toLocaleString('id-ID') + '</td><td>keterangan panjang sedikit</td></tr>';
    }
    h += '</table></div>';
  }
  return h + '</div>';
}

/* Ikon menu diambil dari app.js, bukan ditulis ulang di sini. Versi pertama
   uji ini memakai satu ikon kotak yang sama untuk kesebelas menu — dan ikon
   yang seragam membuat pemeriksaan kerapian jarak jadi tidak ada artinya,
   karena yang membuat deretan terlihat tidak rapi justru perbedaan lebar
   antar-ikon yang sesungguhnya. */
const BUTIR = (() => {
  const src = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');
  const i = src.indexOf('function navIcon(');
  const j = src.indexOf('var MENU=[');
  if (i === -1 || j === -1) throw new Error('NAV_ICONS / MENU tidak ditemukan di app.js');
  const NAV_ICONS = eval(src.slice(i, j) + '; NAV_ICONS');        // eslint-disable-line no-eval
  void NAV_ICONS;
  const daftar = eval(src.slice(j, src.indexOf('\n];', j) + 3).replace('var MENU=', '') + ';');  // eslint-disable-line no-eval
  return daftar.map((m) => ({ label: m.label, ic: m.ic }));
})();
const MENU = BUTIR.map((m) => m.label);

const halaman = `<!DOCTYPE html><html lang="id" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<script src="/js/lz-perangkat.js"></script>
<script src="/js/lz-sisi.js"></script>
</head><body>
<div id="appView" class="app collapsed">
  ${HEADER}
  <main class="main"><div id="content">${isiBerat()}</div></main>
</div>
<script>
  document.getElementById('brandBox').innerHTML =
    '<button class="tn-brand-id" type="button" title="Buka atau tutup menu">'
    + '<img class="logo-img" src="${LOGO}" alt="Lazismu Bantul">'
    + '</button>';
  var nav = document.getElementById('nav');
  nav.innerHTML = ${JSON.stringify(BUTIR)}.map(function (m, i) {
    return '<button class="tn-item' + (i === 0 ? ' active' : '') + '" data-menu="' + m.label + '" title="' + m.label + '">'
      + '<span class="ic">' + m.ic + '</span>'
      + '<span class="tn-tip">' + m.label + '</span></button>';
  }).join('');
  window.__ditekan = [];
  nav.addEventListener('click', function (e) {
    var t = e.target.closest('.tn-item');
    if (t) window.__ditekan.push(t.dataset.menu);
  });
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
    const ket = info === undefined ? '' : String(JSON.stringify(info)).slice(0, 260);
    yangGagal.push(`${n}  ->  ${ket}`);
    console.log('  GAGAL|', n, ket);
  };

  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const galat = [];
  p.on('pageerror', (e) => galat.push(String(e)));
  await p.goto(A + '/');
  await p.waitForSelector('.tn-item', { timeout: 10000 });
  await p.mouse.move(1300, 800);              // kursor jauh dari bilah
  await p.waitForTimeout(600);

  const potret = () => p.evaluate(() => {
    const bulat = (n) => Math.round(n * 100) / 100;
    const kotak = (e) => { const r = e.getBoundingClientRect(); return { x: bulat(r.x), y: bulat(r.y), w: bulat(r.width), h: bulat(r.height) }; };
    const ikon = [...document.querySelectorAll('.tn-item .ic')].map((e) => kotak(e));
    const logo = document.querySelector('.tn-brand .logo-img');
    const keluarIkon = document.querySelector('.tn-keluar svg');
    return {
      ikon,
      main: kotak(document.querySelector('.main')),
      nav: kotak(document.querySelector('.topnav')),
      avatar: kotak(document.querySelector('.user-chip .avatar')),
      logo: logo ? kotak(logo) : null,
      keluar: keluarIkon ? kotak(keluarIkon) : null,
    };
  });

  const setara = (a, b, toleransi) => {
    const t = toleransi === undefined ? 0.6 : toleransi;
    return Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t
      && Math.abs(a.w - b.w) <= t && Math.abs(a.h - b.h) <= t;
  };

  console.log('=== A. ISI HALAMAN DIDORONG, TAPI PINDAHNYA SEKALI ===');
  const ciut = await potret();

  /* Dicuplik beberapa kali sepanjang animasi. Kalau .main sedang
     dianimasikan, salah satu cuplikan pasti menangkapnya di posisi antara. */
  await p.evaluate(() => document.getElementById('appView').classList.remove('collapsed'));
  const cuplikan = [];
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(40); cuplikan.push(await potret()); }
  await p.waitForTimeout(500);
  const buka = await potret();

  cek('lebar panel memang berubah (animasinya jalan)', buka.nav.w > ciut.nav.w + 60, { ciut: ciut.nav.w, buka: buka.nav.w });
  cek('isi halaman tetap didorong, bukan ditutupi', Math.abs(buka.main.x - ciut.main.x) > 60, { ciut: ciut.main.x, buka: buka.main.x });
  cek('isi halaman tidak menyempit lebih dari lebar panelnya', Math.abs((ciut.main.w - buka.main.w) - (buka.nav.w - ciut.nav.w)) < 2,
    { isi: ciut.main.w - buka.main.w, panel: buka.nav.w - ciut.nav.w });

  const diAntara = cuplikan.filter((c) => !setara(c.main, ciut.main) && !setara(c.main, buka.main));
  cek('sepanjang animasi, isi halaman TIDAK PERNAH di posisi antara',
    diAntara.length === 0, { jumlah: diAntara.length, contoh: diAntara[0] && diAntara[0].main, ciut: ciut.main, buka: buka.main });

  console.log('\n=== B. IKON TIDAK BERGERAK ===');
  cek('jumlah ikon menu terbaca', ciut.ikon.length === MENU.length, ciut.ikon.length);
  let geser = 0;
  for (let i = 0; i < ciut.ikon.length; i++) if (!setara(ciut.ikon[i], buka.ikon[i])) geser++;
  let geserTengah = 0;
  for (const c of cuplikan) {
    for (let i = 0; i < ciut.ikon.length; i++) if (!setara(ciut.ikon[i], c.ikon[i])) { geserTengah++; break; }
  }
  cek('tidak ada ikon menu yang bergeser saat panel melebar', geser === 0,
    { geser, contohCiut: ciut.ikon[0], contohBuka: buka.ikon[0] });
  cek('juga tidak bergeser di tengah animasi', geserTengah === 0, { geserTengah });
  /* Saat ciut, ikonnya tetap terlihat di tengah rel seperti dulu. */
  const tengahRel = Math.abs((ciut.ikon[0].x + ciut.ikon[0].w / 2) - (ciut.nav.x + ciut.nav.w / 2));
  cek('saat ciut ikonnya tetap di tengah rel', tengahRel <= 1.5, { selisih: tengahRel });
  cek('foto pengguna tidak bergeser', setara(ciut.avatar, buka.avatar), { ciut: ciut.avatar, buka: buka.avatar });
  if (ciut.keluar && buka.keluar) cek('ikon keluar tidak bergeser', setara(ciut.keluar, buka.keluar), { ciut: ciut.keluar, buka: buka.keluar });

  console.log('\n=== C. KETERANGAN NAMA MELAYANG ===');
  const label = await p.evaluate(() => {
    const t = document.querySelector('.tn-item .tn-tip');
    const gy = getComputedStyle(t);
    return { posisi: gy.position, lebar: gy.width };
  });
  cek('keterangan nama position:absolute', label.posisi === 'absolute', label);
  cek('lebarnya tetap, tidak ikut panel', /^\d+(\.\d+)?px$/.test(label.lebar) && parseFloat(label.lebar) > 40, label);

  await p.evaluate(() => document.getElementById('appView').classList.add('collapsed'));
  await p.waitForTimeout(500);
  const opasitas = await p.evaluate(() => {
    const t = document.querySelector('.tn-item .tn-tip');
    return { op: parseFloat(getComputedStyle(t).opacity), tampilan: getComputedStyle(t).display };
  });
  cek('saat ciut keterangannya memudar sampai hilang', opasitas.op < 0.02, opasitas);
  /* display:none membuatnya muncul/hilang mendadak — itu yang dulu terlihat
     seperti berkedip, bukan menyambung. */
  cek('memudarnya lewat opacity, bukan display:none', opasitas.tampilan !== 'none', opasitas);

  console.log('\n=== D. YANG DIANIMASIKAN HANYA YANG MURAH ===');
  const trans = await p.evaluate(() => {
    const baca = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const gy = getComputedStyle(e);
      return {
        prop: gy.transitionProperty.split(',').map((x) => x.trim()),
        durasi: gy.transitionDuration.split(',').map((x) => parseFloat(x)),
      };
    };
    return { item: baca('.tn-item'), chip: baca('.user-chip'), keluar: baca('.tn-keluar'),
             logo: baca('.tn-brand .logo-img'), main: baca('.main'), nav: baca('.topnav') };
  });
  const MAHAL = ['all', 'padding', 'padding-left', 'padding-right', 'margin', 'margin-left', 'gap', 'width', 'max-width', 'height'];
  for (const nama of ['item', 'chip', 'keluar', 'logo']) {
    const d = trans[nama];
    if (!d) continue;
    const buruk = d.prop.filter((x) => MAHAL.includes(x));
    cek(nama + ': tidak menganimasikan properti tata letak', buruk.length === 0, d);
  }
  cek('logo diperbesar lewat transform, bukan width/height',
    !!trans.logo && trans.logo.prop.includes('transform'), trans.logo);
  cek('panel: tidak memakai transition:all', !!trans.nav && !trans.nav.prop.includes('all'), trans.nav);
  cek('panel: lebarnya yang dianimasikan', !!trans.nav && trans.nav.prop.includes('width'), trans.nav);
  /* .main memang memakai transition untuk margin dan width — tapi durasinya
     NOL. Ia cuma dijadwalkan, bukan dianimasikan. Durasi lebih dari nol di
     sini berarti seluruh dashboard dihitung ulang tiap frame. */
  cek('isi halaman: perpindahannya dijadwalkan, bukan dianimasikan',
    !!trans.main && trans.main.durasi.every((d) => d === 0), trans.main);

  console.log('\n=== E. ONGKOS NYATA DI CHROME ===');
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  const ambil = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = {};
    for (const x of metrics) m[x.name] = x.value;
    return m;
  };
  await p.waitForTimeout(250);
  const sebelum = await ambil();
  await p.evaluate(() => document.getElementById('appView').classList.remove('collapsed'));
  await p.waitForTimeout(430);
  await p.evaluate(() => document.getElementById('appView').classList.add('collapsed'));
  await p.waitForTimeout(430);
  const sesudah = await ambil();
  const dLayout = sesudah.LayoutCount - sebelum.LayoutCount;
  const dDurasi = (sesudah.LayoutDuration - sebelum.LayoutDuration) * 1000;
  console.log('  ukur  | hitung tata letak: ' + dLayout + 'x, ' + dDurasi.toFixed(1) + ' ms');
  /* Ambangnya longgar dengan sengaja — mesin yang menjalankan uji ini
     berbeda-beda. Cara lama memakan 93-136 ms; yang dijaga ordenya. */
  cek('waktu hitung tata letak sepanjang dua animasi jauh di bawah cara lama', dDurasi < 45, dDurasi.toFixed(1));

  console.log('\n=== F. LOGO: MENEPI SAAT CIUT, KE TENGAH SAAT DIBUKA ===');
  await p.evaluate(() => document.getElementById('appView').classList.add('collapsed'));
  await p.waitForTimeout(450);
  const logoCiut = (await potret());
  await p.evaluate(() => document.getElementById('appView').classList.remove('collapsed'));
  await p.waitForTimeout(500);
  const logoBuka = (await potret());
  if (logoCiut.logo && logoBuka.logo) {
    /* Keputusannya berubah setelah dilihat langsung: awalnya logo dirapatkan
       ke kiri saat ciut, tapi ikon-ikon di bawahnya ada di TENGAH rel, jadi
       logonya terbaca meleset sendiri. Sekarang ia ikut sumbu yang sama —
       diperiksa lebih teliti di bagian F2. */
    cek('saat ciut logonya masih muat di dalam rel',
      logoCiut.logo.x + logoCiut.logo.w <= logoCiut.nav.x + logoCiut.nav.w, logoCiut.logo);
    const pusatLogo = logoBuka.logo.x + logoBuka.logo.w / 2;
    const pusatPanel = logoBuka.nav.x + logoBuka.nav.w / 2;
    cek('saat dibuka logonya di tengah panel', Math.abs(pusatLogo - pusatPanel) <= 8,
      { pusatLogo, pusatPanel, logo: logoBuka.logo });
    /* Rasio wordmark 3:1 harus terjaga — kalau berubah, logonya dipenyet. */
    const r1 = logoCiut.logo.w / logoCiut.logo.h, r2 = logoBuka.logo.w / logoBuka.logo.h;
    cek('bentuk logonya tidak dipenyet di kedua keadaan',
      Math.abs(r1 - 3) < 0.25 && Math.abs(r2 - 3) < 0.25, { ciut: r1, buka: r2 });
    cek('logonya membesar saat dibuka', logoBuka.logo.w > logoCiut.logo.w + 10,
      { ciut: logoCiut.logo.w, buka: logoBuka.logo.w });
    /* Kotak tata letaknya TETAP — yang berubah cuma transform. Kalau
       offsetWidth ikut berubah, berarti ukurannya yang diubah dan gambarnya
       diukur ulang tiap frame. */
    const kotakTetap = await p.evaluate(() => {
      const img = document.querySelector('.tn-brand .logo-img');
      const app = document.getElementById('appView');
      const a = img.offsetWidth;
      app.classList.add('collapsed');
      const b = img.offsetWidth;
      app.classList.remove('collapsed');
      return { buka: a, ciut: b };
    });
    cek('kotak tata letak logonya tidak berubah (murni transform)',
      kotakTetap.buka === kotakTetap.ciut, kotakTetap);
  } else {
    cek('logo terbaca', false);
  }
  await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(LUAR, 'sidebar-gerak-buka.png'), clip: { x: 0, y: 0, width: 360, height: 900 } });
  await p.evaluate(() => document.getElementById('appView').classList.add('collapsed'));
  await p.waitForTimeout(450);
  await p.screenshot({ path: path.join(LUAR, 'sidebar-gerak-ciut.png'), clip: { x: 0, y: 0, width: 360, height: 900 } });

  console.log('\n=== F2. SATU SUMBU DAN JARAK YANG SERAGAM ===');
  /* Keluhannya: "posisi antara ikon dan teks nggak jelas nggak rapi" dan
     "logo... nggak presisi sejajar dengan ikon lain dibawahnya".
     Dulu ada EMPAT sumbu berbeda di rel yang sama — ikon menu di 43, foto
     pengguna di 41, ikon keluar di 41, logo di 38,5 — karena tiap elemen
     memakai padding sendiri-sendiri. Selisih 4,5 px itu cukup untuk terbaca
     sebagai deretan yang goyah. */
  await p.evaluate(() => document.getElementById('appView').classList.add('collapsed'));
  await p.waitForTimeout(500);
  const sumbu = await p.evaluate(() => {
    const cx = (e) => { const r = e.getBoundingClientRect(); return +(r.x + r.width / 2).toFixed(2); };
    const nav = document.querySelector('.topnav').getBoundingClientRect();
    return {
      relCx: +(nav.x + nav.width / 2).toFixed(2),
      ikon: [...document.querySelectorAll('.tn-item .ic')].map(cx),
      avatar: cx(document.querySelector('.user-chip .avatar')),
      keluar: cx(document.querySelector('.tn-keluar svg')),
      logo: cx(document.querySelector('.tn-brand .logo-img')),
    };
  });
  const menyimpang = sumbu.ikon.filter((x) => Math.abs(x - sumbu.relCx) > 0.75);
  cek('semua ikon menu tepat di sumbu tengah rel', menyimpang.length === 0, { relCx: sumbu.relCx, menyimpang });
  cek('foto pengguna di sumbu yang sama', Math.abs(sumbu.avatar - sumbu.relCx) <= 0.75, sumbu);
  cek('ikon keluar di sumbu yang sama', Math.abs(sumbu.keluar - sumbu.relCx) <= 0.75, sumbu);
  cek('logo di sumbu yang sama — bukan menepi ke kiri', Math.abs(sumbu.logo - sumbu.relCx) <= 0.75, sumbu);

  await p.evaluate(() => document.getElementById('appView').classList.remove('collapsed'));
  await p.waitForTimeout(500);
  const rapi = await p.evaluate(() => {
    const nav = document.querySelector('.topnav').getBoundingClientRect();
    const baris = [...document.querySelectorAll('.tn-item')].map((it) => {
      const ic = it.querySelector('.ic').getBoundingClientRect();
      const svg = it.querySelector('.ic svg');
      const tip = it.querySelector('.tn-tip').getBoundingClientRect();
      let tintaKanan = null;
      try {
        const bb = svg.getBBox(); const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
        const k = r.width / vb.width;
        tintaKanan = r.x + (bb.x - vb.x) * k + bb.width * k;
      } catch (e) { /* peramban tanpa getBBox */ }
      return {
        label: it.dataset.menu,
        tipX: +tip.x.toFixed(2),
        dy: +((tip.y + tip.height / 2) - (ic.y + ic.height / 2)).toFixed(2),
        celah: tintaKanan === null ? null : +(tip.x - tintaKanan).toFixed(2),
      };
    });
    const logo = document.querySelector('.tn-brand .logo-img').getBoundingClientRect();
    return { baris, navCx: +(nav.x + nav.width / 2).toFixed(2), logoCx: +(logo.x + logo.width / 2).toFixed(2) };
  });
  const xLabel = [...new Set(rapi.baris.map((b) => b.tipX))];
  cek('semua keterangan mulai di titik yang sama persis', xLabel.length === 1, xLabel);
  cek('semua keterangan sejajar tegak dengan ikonnya', rapi.baris.every((b) => Math.abs(b.dy) <= 0.6),
    rapi.baris.filter((b) => Math.abs(b.dy) > 0.6));
  const celah = rapi.baris.map((b) => b.celah).filter((x) => x !== null);
  const min = Math.min(...celah), maks = Math.max(...celah);
  console.log('  ukur  | jarak ikon ke teks: ' + min.toFixed(1) + '-' + maks.toFixed(1) + ' px');
  /* Dulu 13,6-18,0 px: terlalu rapat, dan selisih antar-barisnya 4,4 px. */
  cek('jarak ikon ke teks tidak terlalu rapat (>= 18 px)', min >= 18, min);
  cek('jarak itu seragam antar-baris (selisih <= 3,5 px)', maks - min <= 3.5, { min, maks, beda: +(maks - min).toFixed(2) });
  cek('saat dibuka, logo tepat di tengah panel', Math.abs(rapi.logoCx - rapi.navCx) <= 1, rapi);

  console.log('\n=== G. SEMUA MENU TETAP BISA DITEKAN ===');
  for (const keadaan of ['collapsed', 'terbuka']) {
    await p.evaluate((k) => {
      const app = document.getElementById('appView');
      if (k === 'collapsed') app.classList.add('collapsed'); else app.classList.remove('collapsed');
      window.__ditekan = [];
    }, keadaan);
    await p.waitForTimeout(430);
    for (const n of MENU) await p.click('.tn-item[data-menu="' + n + '"]', { timeout: 4000 });
    const ditekan = await p.evaluate(() => window.__ditekan);
    cek('keadaan ' + keadaan + ': seluruh ' + MENU.length + ' menu tertekan', ditekan.length === MENU.length, ditekan);
    cek('keadaan ' + keadaan + ': tidak ada menu yang tertukar', ditekan.join('|') === MENU.join('|'), ditekan);
  }

  console.log('\n=== H. MENUTUP LEWAT KLIK DI LUAR DAN Esc ===');
  const sisiJs = fs.readFileSync(path.join(PUBLIK, 'js', 'lz-sisi.js'), 'utf8');
  cek('ada penangan klik di luar bilah', /addEventListener\('click'[\s\S]{0,700}ciutkan\(\)/.test(sisiJs));
  cek('klik di dalam bilah dikecualikan', /closest\('\.topnav'\)/.test(sisiJs));
  cek('klik di dalam modal / dropdown dikecualikan', /modal-bg/.test(sisiJs));
  cek('di bawah 1024px dilewati (di sana bentuknya bukan bilah samping)', /1024/.test(sisiJs));
  cek('Esc juga menutup', /Escape[\s\S]{0,700}ciutkan\(\)/.test(sisiJs));
  cek('penyimpanan pilihan ditunda sampai animasi selesai', /setTimeout[\s\S]{0,200}localStorage\.setItem/.test(sisiJs));
  /* Keadaan awal bilah TIDAK boleh ditentukan di sini — itu tetap urusan
     masing-masing halaman, persis seperti sebelumnya. */
  cek('tidak ikut menentukan keadaan awal bilah',
    !/classList\.add\('collapsed'\)[\s\S]{0,40}$/m.test(sisiJs) || !/keadaanAwal/.test(sisiJs), true);
  cek('tidak ada lagi fungsi keadaanAwal', !/keadaanAwal/.test(sisiJs));
  cek('jarak logo ke tengah diukur dan ditaruh di --u-logo-x', /--u-logo-x/.test(sisiJs));

  for (const h of ['index.html', 'ai.html', 'blast.html', 'fund.html']) {
    const html = fs.readFileSync(path.join(PUBLIK, h), 'utf8');
    cek(h + ': memuat js/lz-sisi.js', /<script src="\/js\/lz-sisi\.js" defer><\/script>/.test(html));
    /* Harus dimuat sebelum skrip halamannya. */
    const iSisi = html.indexOf('/js/lz-sisi.js');
    const iHal = Math.max(html.indexOf('/app.js'), html.indexOf('/ai.js'),
                          html.indexOf('/blast.js'), html.indexOf('/fund.js'));
    cek(h + ': dimuat sebelum skrip halamannya', iSisi > -1 && iHal > -1 && iSisi < iHal, { iSisi, iHal });
  }

  const appJs = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');
  cek('app.js: penyimpanan pilihan ditunda juga', /simpanSisiNanti/.test(appJs));
  cek('app.js: tidak ada lagi localStorage.setItem di tengah pergantian class',
    !/classList\.toggle\('collapsed'\);\r?\n\s*localStorage\.setItem/.test(appJs));

  console.log('\n=== I. TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript', galat.length === 0, galat.slice(0, 3));

  await ctx.close();
  await br.close();
  server.close();
  if (yangGagal.length) {
    console.log('\nYANG GAGAL:');
    yangGagal.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  }
  console.log('\ntest_sidebar_gerak.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exitCode = g ? 1 : 0;
  setTimeout(() => process.exit(g ? 1 : 0), 300).unref();
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
