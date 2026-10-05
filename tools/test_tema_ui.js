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

const HALAMAN_ASAL = '<!doctype html><link rel=stylesheet href="/styles.css"><script>document.documentElement.setAttribute("data-theme","light")</script>'
  + '<body><div class="app KELAS"><main class=main><div class="page-head"><div><h2>Uji</h2></div><div class="page-head-aksi">'
  + '<button class="btn btn-primary btn-sm">Catat</button><span id=h></span></div></div><div class=card style="height:200px">Isi</div></main></div>'
  + '<script src="/js/lz-tema.js"></script><script>document.getElementById("h").innerHTML=\'<button class="tn-icon kepala-tema" id=t type=button>\'+LZTema.svg()+"</button>"</script>';

const HALAMAN = (k) => HALAMAN_ASAL.replace('KELAS', k || '');
/* Kepala dasbor utama: tombol saudaranya (dh-ikon) dan tombol tema memakai kelas yang sama dengan app.js. */
const DASBOR = '<!doctype html><link rel=stylesheet href="/styles.css"><script>document.documentElement.setAttribute("data-theme","light")</script>'
  + '<body style="padding:24px"><div class="dh"><div class="dh-content"><div class="dh-row"><div class="dh-greeting"><div class="dh-hi">Halo</div></div>'
  + '<div class="dh-acts"><div class="dh-act-row"><button class="dh-quick-btn dh-ikon primary" id=s1><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12l7-7 7 7" stroke="currentColor" fill="none" stroke-width="2"/></svg></button>'
  + '<button class="dh-quick-btn dh-ikon" id=s2><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" fill="none" stroke-width="2"/></svg></button>'
  + '<span id=h></span></div></div></div></div></div>'
  + '<script src="/js/lz-tema.js"></script><script>document.getElementById("h").innerHTML=\'<button type=button class="dh-quick-btn dh-ikon kepala-tema" id=t>\'+LZTema.svg()+"</button>"</script>';

(async () => {
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/uji.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(HALAMAN(new URL(q.url, 'http://x').searchParams.get('k'))); }
    if (u === '/dasbor.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(DASBOR); }
    try { const f = path.join(PUBLIK, u); const t = f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'; const isi = fs.readFileSync(f); r.writeHead(200, { 'content-type': t }); r.end(isi); }
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
  /* Susunan di semua keadaan menu kiri dan lebar layar. Aturan sidebar `.app.collapsed .tn-icon` (padding 0 18px, rata
     kiri, !important) pernah mengalahkan aturan tombol ini: ikon terdorong ke kanan dan tidak di tengah. */
  for (const tampil of [
    { nama: 'menu terbuka', url: '/uji.html?k=' },
    { nama: 'menu ciut', url: '/uji.html?k=collapsed' },
    { nama: 'dasbor utama', url: '/dasbor.html' },
  ]) {
    for (const lebar of [1440, 1100, 820, 390]) {
      for (const tema of ['light', 'dark']) {
        const ctx = await b.newContext({ viewport: { width: lebar, height: 700 } });
        const p = await ctx.newPage();
        await p.route(/^https?:\/\/(?!127)/, (r) => r.abort());
        await p.addInitScript((t) => { try { localStorage.setItem('laz_theme', t); } catch (_) {} }, tema);
        await p.goto(A + tampil.url, { waitUntil: 'domcontentloaded' });
        await p.waitForSelector('#t');
        await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
        await p.waitForTimeout(250);
        const u = await ukur(p);
        const kotak = await p.evaluate(() => { const r = document.getElementById('t').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
        const sdr = tampil.nama === 'dasbor utama'
          ? await p.evaluate(() => { const a = document.getElementById('s2').getBoundingClientRect(), t = document.getElementById('t').getBoundingClientRect(); return { dTop: Math.abs(a.top - t.top), dH: Math.abs(a.height - t.height) }; })
          : null;
        cek(`${tampil.nama} @${lebar} ${tema}: ikon tepat di tengah tombol 40 px`, rata(u) && kotak[0] === 40 && kotak[1] === 40, { u, kotak });
        if (sdr) cek(`${tampil.nama} @${lebar} ${tema}: tombol tema sebaris dan setinggi saudaranya`, sdr.dTop <= 1 && sdr.dH <= 4, sdr);
        await ctx.close();
      }
    }
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
  /* Kepala semua halaman utama: kode asli pasangTemaKepala diambil dari app.js (penanda teks), dijalankan pada beberapa
     bentuk kepala yang sama dengan yang ditulis app.js: judul saja, judul + tombol, kepala Saldo (kotak tanggal + tombol,
     rata bawah), kepala yang sudah punya .page-head-aksi, dan kepala bersarang di dalam Pengaturan. */
  {
    const src = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');
    const a = src.indexOf('/* >>> pasangTemaKepala */'), z = src.indexOf('/* <<< pasangTemaKepala */');
    cek('app.js: blok pasangTemaKepala ditemukan', a > 0 && z > a);
    const kode = src.slice(a, z);
    const KEPALA = {
      'judul saja': '<div class="page-head"><div><h2>Input Penghimpunan</h2><div class="desc">Catat</div></div></div>',
      'judul + tombol': '<div class="page-head"><div><h1>No. Rekening</h1></div><button class="btn btn-primary" onclick="window.__klik=1">Tambah</button></div>',
      'saldo': '<div class="page-head saldo-head"><div><h2>Saldo</h2></div><div class="saldo-head-alat"><div class="field" style="margin:0;min-width:150px"><label>Posisi per tanggal</label><input type="date"></div><button class="btn btn-ghost">Saldo awal</button></div></div>',
      'sudah beraksi': '<div class="page-head"><div><h2>X</h2></div><div class="page-head-aksi"><button class="btn">A</button></div></div>',
      'donatur': '<div class="page-head"><div><h2>Database Donatur</h2></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost">Sinkronkan</button><button class="btn btn-primary">Impor</button></div></div>',
    };
    for (const kelas of ['', 'collapsed']) {
      for (const lebar of [1440, 390]) {
        const ctx = await b.newContext({ viewport: { width: lebar, height: 700 } });
        const p = await ctx.newPage();
        await p.route(/^https?:\/\/(?!127)/, (r) => r.abort());
        await p.goto(A + '/uji.html?k=' + kelas, { waitUntil: 'domcontentloaded' });
        await p.waitForSelector('#t');
        await p.evaluate((x) => { document.querySelector('.page-head').remove(); const m = document.createElement('div'); m.id = 'content'; document.querySelector('main').prepend(m); window.eval(x); }, kode.replace(/^\/\* >>> pasangTemaKepala \*\//, ''));
        for (const [nama, html] of Object.entries(KEPALA)) {
          await p.evaluate(() => { const o = document.getElementById('tombolTema'); if (o) o.remove(); });
          await p.evaluate((h) => { document.getElementById('content').innerHTML = h; }, html);
          await p.waitForFunction(() => document.querySelector('#content .kepala-tema'), null, { timeout: 3000 }).catch(() => {});
          const r = await p.evaluate(() => {
            const t = document.querySelector('#content .kepala-tema'); if (!t) return null;
            const ph = document.querySelector('#content .page-head'), v = t.querySelector('svg');
            const tb = t.getBoundingClientRect(), vb = v.getBoundingClientRect(), pb = ph.getBoundingClientRect();
            const judul = ph.children[0].getBoundingClientRect();
            return {
              jumlah: document.querySelectorAll('#content .kepala-tema').length,
              dalamAksi: !!t.closest('.page-head-aksi'),
              judulPertama: ph.children[0].querySelector('h1,h2') !== null,
              sel: Math.abs((vb.x - tb.x) - (tb.right - vb.right)), selY: Math.abs((vb.y - tb.y) - (tb.bottom - vb.bottom)),
              ukuran: [Math.round(tb.width), Math.round(tb.height)],
              dalamKepala: tb.right <= pb.right + 1 && tb.left >= pb.left - 1,
              luber: document.documentElement.scrollWidth <= window.innerWidth + 1,
              kananRapat: lebarOk(tb, pb),
              handler: [...ph.querySelectorAll('button[onclick]')].length,
            };
            function lebarOk(a, c) { return Math.abs(c.right - a.right) <= 1; }
          });
          const tag = `kepala ${nama} @${lebar}${kelas ? ' ciut' : ''}`;
          cek(`${tag}: tombol tema terpasang sekali di .page-head-aksi, judul tetap pertama`, !!r && r.jumlah === 1 && r.dalamAksi && r.judulPertama, r);
          if (r) {
            cek(`${tag}: ikon tepat di tengah tombol 40 px`, r.sel <= 1 && r.selY <= 1 && r.ukuran[0] === 40 && r.ukuran[1] === 40, r);
            cek(`${tag}: tidak keluar kepala dan tidak meluber`, r.dalamKepala && r.luber, r);
            if (lebar >= 1100) cek(`${tag}: rata kanan kepala`, r.kananRapat, r);
          }
        }
        const hid = await p.evaluate(() => {
          document.getElementById('content').innerHTML = '<div class="page-head"><div><h2>T</h2></div><button class="btn" onclick="window.__klik=1">Tambah</button></div>';
          return null;
        });
        void hid;
        await p.waitForFunction(() => document.querySelector('#content .kepala-tema'), null, { timeout: 3000 });
        await p.click('#content .page-head .btn');
        cek(`handler tombol lama tetap hidup setelah dipindah (@${lebar}${kelas ? ' ciut' : ''})`, await p.evaluate(() => window.__klik === 1));
        await p.evaluate(() => { document.getElementById('content').innerHTML = '<div id="setRekBody"><div class="page-head"><div><h2>Bersarang</h2></div></div></div>'; });
        await p.waitForTimeout(150);
        cek(`kepala bersarang di Pengaturan tidak diberi tombol (@${lebar}${kelas ? ' ciut' : ''})`, await p.evaluate(() => !document.querySelector('#content .kepala-tema')));
        await ctx.close();
      }
    }
  }
  const idx = fs.readFileSync(path.join(PUBLIK, 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');
  cek('index.html: memuat lz-tema.js sebelum app.js', idx.indexOf('/js/lz-tema.js') > 0 && idx.indexOf('/app.js') > idx.indexOf('/js/lz-tema.js'));
  cek('app.js: dasbor utama memasang tombol tema di baris tombol kepala', /var temaBtn=window\.LZTema/.test(appjs) && /menuBtn \+ temaBtn/.test(appjs));
  const css = fs.readFileSync(path.join(PUBLIK, 'styles.css'), 'utf8');
  cek('styles.css: tombol tema dipatok tengah (padding 0 dan justify center, !important)', /\.app\.collapsed \.tn-icon\.kepala-tema,[^{]*\{[^}]*padding:0 !important[^}]*justify-content:center !important/.test(css));


  /* Halaman di luar menu: layar login, pelacakan, laporan publik, ringkasan harian. Halaman aslinya dimuat; yang
     butuh data dari API (publik, harian) diberi tombol di wadah aslinya supaya gaya inline halaman itu yang diukur. */
  const SUMBER = (n) => fs.readFileSync(path.join(PUBLIK, n), 'utf8');
  for (const n of ['public.html', 'lacak.html', 'harian.html']) cek(n + ': memuat lz-tema.js', /<script src="\/js\/lz-tema\.js"><\/script>/.test(SUMBER(n)));
  cek('public.html/harian.html: gantiTema lama dihapus, tombol memakai kepala-tema', !/function gantiTema/.test(SUMBER('public.html') + SUMBER('harian.html')) && /pub-tema kepala-tema/.test(SUMBER('public.html')) && /lh-tema kepala-tema/.test(SUMBER('harian.html')));
  const pusatIkon = async (pg, sel) => pg.evaluate((s) => {
    const bt = document.querySelector(s), ik = bt.querySelector('.lz-tema-ikon'); if (!ik) return { tanpaIkon: true };
    const a = bt.getBoundingClientRect(), c = ik.getBoundingClientRect();
    return { dx: Math.abs((c.left - a.left) - (a.right - c.right)), dy: Math.abs((c.top - a.top) - (a.bottom - c.bottom)), lebar: a.width, tinggi: a.height };
  }, sel);
  const tengah = (m) => !m.tanpaIkon && m.dx <= 1 && m.dy <= 1;
  async function halamanLuar(nama, url, siapkan, sel) {
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await pg.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await pg.addInitScript(() => { try { localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
    await pg.goto('http://localhost:' + srv.address().port + url, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.LZTema);
    if (siapkan) await pg.evaluate(siapkan);
    await pg.waitForSelector(sel, { state: 'visible' });
    cek(nama + ': tepat satu tombol tema', (await pg.locator('.kepala-tema').count()) === 1);
    const m1 = await pusatIkon(pg, sel);
    cek(nama + ': ikon tepat di tengah tombol (terang)', tengah(m1), m1);
    cek(nama + ': tombol bulat/persegi berukuran 34-40 px', m1.lebar >= 34 && m1.lebar <= 40 && Math.abs(m1.lebar - m1.tinggi) <= 1, m1);
    await pg.click(sel);
    await pg.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
    cek(nama + ': klik mengganti tema jadi gelap dan tersimpan', (await pg.evaluate(() => localStorage.getItem('laz_theme'))) === 'dark');
    cek(nama + ': judul tombol ikut berganti', (await pg.evaluate((s) => document.querySelector(s).title, sel)) === 'Ganti ke tema terang');
    await pg.waitForFunction(() => !document.getElementById('lz-tema-lingkar'), null, { timeout: 4000 });
    const m2 = await pusatIkon(pg, sel);
    cek(nama + ': ikon tepat di tengah tombol (gelap)', tengah(m2), m2);
    await pg.close();
  }
  await halamanLuar('Layar login', '/index.html', () => { const v = document.getElementById('loginView'); v.classList.remove('hidden'); document.getElementById('boot')?.remove(); }, '#loginView .lz-tema-pojok');
  await halamanLuar('Pelacakan', '/lacak.html', null, '.lz-tema-pojok');
  await halamanLuar('Laporan publik', '/public.html', () => {
    const d = document.createElement('div'); d.className = 'pub-head-alat';
    d.innerHTML = '<select class="pub-chip"><option>Mei</option></select><button class="pub-chip pub-tema kepala-tema" type="button">' + LZTema.svg() + '</button>';
    document.body.appendChild(d);
  }, '.pub-tema');
  await halamanLuar('Ringkasan harian', '/harian.html', () => {
    const d = document.createElement('div'); d.className = 'lh-alat';
    d.innerHTML = '<button class="lh-tema kepala-tema" type="button">' + LZTema.svg() + '</button>';
    document.body.appendChild(d);
  }, '.lh-tema');

  await b.close(); srv.close();
  console.log('\n  ' + lulus + ' lulus, ' + gagal + ' gagal');
  console.log('\ntest_tema_ui.js  ' + lulus + '/' + (lulus + gagal) + '  ' + (gagal ? 'ADA YANG GAGAL' : 'SEMUA LULUS') + '\n');
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
