/* Uji kelancaran daftar panjang: Penghimpunan, Pentasyarufan, Donatur.
 *
 * KELUHAN PEMILIK (2 Oktober 2026): "web jadi lemot atau delay". Setelah jurnal
 * Januari sampai September diimpor, daftar-daftar ini berisi ribuan baris, dan
 * ketiganya dulu menggambar SEMUA baris ke layar. Diukur di data tiruan:
 *   - 15.000 penghimpunan: tiap huruf di kotak cari membekukan layar 1,1 sampai
 *     1,5 detik (textContent dan style.display untuk 15.000 baris);
 *   - 5.000 pentasyarufan: membuka halamannya membekukan layar 17,8 detik
 *     (tugas terpanjang 5,8 detik);
 *   - 3.000 donatur: 1,1 detik.
 * Yang dijaga di sini: jumlah baris yang masuk DOM dibatasi, hasil saringan
 * tetap benar, daftar tetap bisa digulir sampai habis, dan satu ketikan tidak
 * membekukan layar. Datanya karangan, bukan data lembaga.
 *
 * jalankan:  node tools/test_performa_ui.js
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
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const PUBLIK = process.env.LAZ_PUBLIK_UJI || path.join(AKAR, 'src', 'public');

/* ---------- data karangan ---------- */
const JENIS = ['Zakat', 'Infak', 'Sedekah', 'Wakaf'];
const N_HIMPUN = 10000, N_TASY = 4000, N_DONATUR = 3000;
const tgl = (i) => new Date(Date.UTC(2026, 0, 1) + (i % 270) * 86400e3).toISOString().slice(0, 10);
const himpun = [];
for (let i = 0; i < N_HIMPUN; i++) {
  himpun.push({
    id: 'h' + i, noKwitansi: 'KW-' + String(i).padStart(6, '0'), tanggal: tgl(i),
    jenisDana: JENIS[i % 4], subJenis: 'Umum', pilar: '', program: 'Program ' + (i % 9),
    namaDonatur: 'Donatur Karangan ' + (i % 3000), jumlah: 10000 + (i % 500) * 1000,
    metode: i % 2 ? 'Transfer' : 'Tunai', fundraising: '', dibuat: tgl(i) + 'T03:00:00.000Z',
  });
}
const tasy = [];
for (let i = 0; i < N_TASY; i++) {
  tasy.push({
    id: 't' + i, noBukti: 'BK-' + String(i).padStart(6, '0'), tanggal: tgl(i),
    ashnaf: i % 2 ? 'Fakir' : 'Miskin', program: 'Program ' + (i % 9), namaPenerima: 'Penerima Karangan ' + i,
    jumlah: 25000 + (i % 300) * 1000, bentukBantuan: i % 2 ? 'Uang Tunai' : 'Transfer',
    statusSalur: 'Tersalur', fundraising: '', dibuat: tgl(i) + 'T04:00:00.000Z',
  });
}
const donatur = [];
for (let i = 0; i < N_DONATUR; i++) {
  donatur.push({
    nama: 'Donatur Karangan ' + i, kategori: i % 3 ? 'Perorangan' : 'Lembaga/Perusahaan',
    telepon: '0812000' + String(i).padStart(4, '0'), totalDonasi: 1000000 - i * 100, jumlahTransaksi: 1 + (i % 7),
    terakhirDonasi: tgl(i), status: 'Aktif', layanan: [],
  });
}

const PADAT_DIMINTA = [];
const JAWAB = {
  apiBootstrap: () => ({ user: { id: 'u1', username: 'uji', nama: 'Petugas Uji', role: 'superadmin', permissions: {} }, settings: {}, webAppUrl: '' }),
  apiGetPermissionMeta: () => ({ modules: [], actions: [] }),
  apiListPenghimpunan: () => himpun,
  apiListPentasyarufan: () => tasy,
  apiGetDonaturAnalytics: () => donatur,
  apiListRekeningPublic: () => [], apiListLayananPublic: () => [],
};
const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = '';
    for await (const c of req) body += c;
    let fn = '', minta = {};
    try { minta = JSON.parse(body); fn = minta.fn || ''; } catch (_) {}
    const f = JAWAB[fn];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    /* Seperti api/rpc.js: bentuk padat hanya dilayani untuk dua fungsi daftar dan hanya
       bila klien meminta. Klien yang tidak meminta tetap mendapat larik biasa. */
    if (f && minta.padat && engine.FN_PADAT[fn]) {
      PADAT_DIMINTA.push(fn);
      return res.end(JSON.stringify({ result: engine._padatkan(f()) }));
    }
    return res.end(JSON.stringify({ result: f ? f() : (/^apiList/.test(fn) ? [] : {}) }));
  }
  const nama = req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas) || fs.statSync(berkas).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(CHROMIUM);
  let ok = 0, g = 0;
  const cek = (n, s, info) => {
    if (s) { ok++; return; }
    g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200));
  };
  const galat = [];

  const buka = async (hal, sel) => {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => galat.push(hal + ': ' + e));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());     // tanpa internet: ukur aplikasinya saja
    await p.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
    const t0 = Date.now();
    await p.goto(A + '/?hal=' + hal);
    await p.waitForSelector(sel, { timeout: 60000 });
    return { p, ctx, waktuBuka: Date.now() - t0 };
  };
  const barisDOM = (p, id) => p.evaluate((i) => document.querySelectorAll('#' + i + ' tbody tr:not(.tbl-lagi):not(.tbl-kosong)').length, id);
  const info = (p, id) => p.evaluate((i) => { const e = document.querySelector('#' + i + ' tr.tbl-lagi-info, #' + i + ' .tbl-lagi-info'); return e ? e.textContent : ''; }, id);
  /* Mengetik: yang diukur adalah tugas terpanjang yang menahan layar (PerformanceObserver
     longtask) sampai penyaringan tertunda selesai digambar, bukan sekadar
     waktu sinkron. Mengembalikan { ms: tugas terpanjang, total: waktu sampai selesai }. */
  const ketik = (p, selektor, teks) => p.evaluate(async ([s, t]) => {
    const tugas = [];
    let ob = null;
    try { ob = new PerformanceObserver((l) => l.getEntries().forEach((e) => tugas.push(e.duration))); ob.observe({ entryTypes: ['longtask'] }); } catch (_) {}
    const e = document.querySelector(s); e.focus(); e.value = t;
    const m = performance.now();
    e.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (ob) { await new Promise((r) => setTimeout(r, 50)); ob.disconnect(); }
    return { ms: Math.max(0, ...tugas), total: performance.now() - m };
  }, [selektor, teks]);

  /* ======================== BOOT TIDAK MENUNGGU SERVER LUAR ======================== */
  {
    /* Dulu index.html memuat pustaka Excel dari cdn.sheetjs.com dengan defer. Skrip
       defer berjalan berurutan, jadi app.js menunggu 880 KB dari server pihak
       ketiga: CDN yang lambat atau diblokir jaringan kantor menahan layar pembuka.
       Di sini semua permintaan ke luar sengaja DIGANTUNG (tidak dijawab, tidak
       ditolak): aplikasi tetap harus terbuka. */
    const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
    const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, () => { /* sengaja tidak dijawab */ });
    await p.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
    const t0 = Date.now();
    await p.goto(A + '/?hal=penghimpunan', { waitUntil: 'commit' });
    const terbuka = await p.waitForSelector('#appView:not(.hidden)', { timeout: 9000 }).then(() => true).catch(() => false);
    cek('Boot: aplikasi terbuka walau server luar (CDN) tidak menjawab sama sekali', terbuka, Date.now() - t0);
    const html = fs.readFileSync(path.join(PUBLIK, 'index.html'), 'utf8');
    cek('index.html: tidak ada skrip defer dari server luar', !/<script[^>]*src="https?:\/\/[^"]*"[^>]*defer/i.test(html));
    cek('index.html: pustaka Excel dari salinan sendiri, async', /<script[^>]*src="\/js\/vendor\/xlsx\.full\.min\.js"[^>]*async/i.test(html));
    cek('index.html: stylesheet Google Fonts tidak menahan gambar pertama', /fonts\.googleapis\.com[^>]*media="print"[^>]*onload/i.test(html));
    cek('index.html: layar ditahan sampai huruf siap (tanpa berganti huruf di depan mata), dengan batas waktu', /tunggu-huruf/.test(html) && /setTimeout\(l,1500\)/.test(html) && /__hurufSiap/.test(html));
    const css = fs.readFileSync(path.join(PUBLIK, 'styles.css'), 'utf8');
    cek('styles.css: tombol (menu kiri, Keluar) mewarisi huruf aplikasi, bukan Arial bawaan peramban', /(^|\n)button,select\{font-family:inherit\}/.test(css) && /\.tn-item,\.tn-icon\{font-family:var\(--sans\)\}/.test(css));
    await ctx.close();
  }

  /* ======================== PENGHIMPUNAN ======================== */
  {
    const { p, ctx, waktuBuka } = await buka('penghimpunan', '#himpunTable');
    await p.waitForTimeout(400);
    cek('Penghimpunan: baris di layar dibatasi (bukan ' + N_HIMPUN + ')', (await barisDOM(p, 'himpunTable')) <= 150, await barisDOM(p, 'himpunTable'));
    cek('Penghimpunan: ada penanda "Menampilkan x dari ' + N_HIMPUN.toLocaleString('id-ID') + '"', /dari 10\.000/.test(await info(p, 'himpunTable')), await info(p, 'himpunTable'));
    cek('Penghimpunan: halaman terbuka wajar (<' + 6000 + ' ms, data ' + N_HIMPUN + ' baris)', waktuBuka < 6000, waktuBuka);

    const urutan = await p.evaluate(() => Array.from(document.querySelectorAll('#himpunTable tbody tr:not(.tbl-lagi)')).slice(0, 3).map((r) => r.getAttribute('data-tanggal')));
    const tglMax = himpun.reduce((m, r) => (r.tanggal > m ? r.tanggal : m), '');
    cek('Penghimpunan: baris pertama tetap tanggal terbaru', urutan[0] === tglMax, [urutan, tglMax]);

    // cari: hasil benar dan cepat
    const harap = himpun.filter((r) => r.namaDonatur.toLowerCase().indexOf('karangan 12') >= 0).length;
    const kt = await ketik(p, '#himpunTable_search', 'Karangan 12');
    cek('Penghimpunan: satu ketikan tidak membekukan layar (tugas terpanjang <200 ms)', kt.ms < 200, Math.round(kt.ms));
    const teksInfo = await info(p, 'himpunTable');
    const dom = await barisDOM(p, 'himpunTable');
    cek('Penghimpunan: jumlah yang cocok sama dengan datanya (' + harap + ')',
      harap > 100 ? new RegExp('dari ' + harap.toLocaleString('id-ID').replace('.', '\\.') + '$').test(teksInfo.trim()) : dom === harap, [harap, teksInfo, dom]);
    const semuaCocok = await p.evaluate(() => Array.from(document.querySelectorAll('#himpunTable tbody tr:not(.tbl-lagi)')).every((r) => r.textContent.toLowerCase().indexOf('karangan 12') >= 0));
    cek('Penghimpunan: semua baris yang tampil memang cocok dengan kata cari', semuaCocok);

    const msKosong = (await ketik(p, '#himpunTable_search', 'tidak-ada-yang-begini')).ms;
    cek('Penghimpunan: tanpa hasil, tampil pesan kosong', await p.evaluate(() => !!document.querySelector('#himpunTable .tbl-kosong')) && (await barisDOM(p, 'himpunTable')) === 0, Math.round(msKosong));

    // saring jenis dana
    await ketik(p, '#himpunTable_search', '');
    await p.evaluate(() => { const s = document.getElementById('himpunTable_filter_type'); s.value = 'Wakaf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(250);
    const jumlahWakaf = himpun.filter((r) => r.jenisDana === 'Wakaf').length;
    cek('Penghimpunan: saring Jenis Dana = Wakaf', new RegExp('dari ' + jumlahWakaf.toLocaleString('id-ID').replace('.', '\\.') + '$').test((await info(p, 'himpunTable')).trim()), [jumlahWakaf, await info(p, 'himpunTable')]);
    await p.evaluate(() => { const s = document.getElementById('himpunTable_filter_type'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(250);

    // gulir sampai bawah: batch berikutnya masuk sendiri
    const sebelum = await barisDOM(p, 'himpunTable');
    await p.evaluate(() => document.querySelector('#himpunTable tr.tbl-lagi').scrollIntoView({ block: 'center' }));
    await p.waitForFunction((n) => document.querySelectorAll('#himpunTable tbody tr:not(.tbl-lagi)').length > n, sebelum, { timeout: 5000 }).catch(() => {});
    const sesudah = await barisDOM(p, 'himpunTable');
    cek('Penghimpunan: digulir ke dasar, 100 baris berikutnya masuk sendiri', sesudah >= sebelum + 100, [sebelum, sesudah]);
    // tombol manual
    await p.evaluate(() => { const t = document.querySelector('#himpunTable tr.tbl-lagi button'); if (t) t.click(); });
    await p.waitForTimeout(100);
    cek('Penghimpunan: tombol "Tampilkan 100 lagi" menambah baris', (await barisDOM(p, 'himpunTable')) > sesudah, [sesudah, await barisDOM(p, 'himpunTable')]);

    // pengurut murah sama hasilnya dengan pengurut lama berbasis Date
    const sama = await p.evaluate(() => {
      const acak = []; let x = 7;
      const r = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x; };
      for (let i = 0; i < 3000; i++) {
        const d = new Date(Date.UTC(2026, 0, 1) + (r() % 60) * 86400e3);
        acak.push({ id: i, tanggal: d.toISOString().slice(0, 10), dibuat: new Date(Date.UTC(2026, 0, 1) + (r() % 5000) * 60000 * 7).toISOString() });
      }
      const lama = acak.slice().sort(function (a, b) {
        const da = new Date(a.tanggal + 'T00:00:00'), db = new Date(b.tanggal + 'T00:00:00');
        if (da.getTime() !== db.getTime()) return db - da;
        return new Date(b.dibuat || 0) - new Date(a.dibuat || 0);
      });
      const baru = acak.slice().sort(_urutTerbaru);
      return lama.every((v, i) => v.tanggal === baru[i].tanggal && v.dibuat === baru[i].dibuat);
    });
    cek('Pengurut baru memberi urutan yang sama dengan pengurut lama', sama);
    await ctx.close();
  }

  /* ======================== PENTASYARUFAN ======================== */
  {
    const { p, ctx, waktuBuka } = await buka('pentasyarufan', '#tasyTable');
    await p.waitForTimeout(400);
    const dom = await barisDOM(p, 'tasyTable');
    cek('Pentasyarufan: baris di layar dibatasi (bukan ' + N_TASY + ')', dom <= 150, dom);
    cek('Pentasyarufan: halaman terbuka wajar (<6000 ms)', waktuBuka < 6000, waktuBuka);
    const harap = tasy.filter((r) => r.namaPenerima.toLowerCase().indexOf('karangan 3') >= 0).length;
    const kt = await ketik(p, '#tasyTable_search', 'Karangan 3');
    cek('Pentasyarufan: satu ketikan tidak membekukan layar (tugas terpanjang <200 ms)', kt.ms < 200, Math.round(kt.ms));
    cek('Pentasyarufan: jumlah yang cocok benar (' + harap + ')', new RegExp('dari ' + harap.toLocaleString('id-ID').replace('.', '\\.') + '$').test((await info(p, 'tasyTable')).trim()), [harap, await info(p, 'tasyTable')]);
    await ctx.close();
  }

  /* ======================== DONATUR ======================== */
  {
    const { p, ctx, waktuBuka } = await buka('donatur', '#donaturTable');
    await p.waitForTimeout(400);
    const dom = await p.evaluate(() => document.querySelectorAll('#donaturTable tbody tr.donatur-row').length);
    cek('Donatur: baris di layar dibatasi (bukan ' + N_DONATUR + ')', dom <= 150, dom);
    const kt = await ketik(p, '#donatur_search', 'Karangan 29');
    cek('Donatur: satu ketikan tidak membekukan layar (tugas terpanjang <200 ms)', kt.ms < 200, Math.round(kt.ms));
    const harap = donatur.filter((d) => (d.nama + ' ' + d.telepon).toLowerCase().indexOf('karangan 29') >= 0).length;
    const tampil = await p.evaluate(() => document.querySelectorAll('#donaturTable tbody tr.donatur-row').length);
    cek('Donatur: pencarian nama benar (' + harap + ' cocok)', tampil === Math.min(100, harap)
      && (harap <= 100 || new RegExp('dari ' + harap + '$').test((await info(p, 'donaturTable')).trim())), [harap, tampil, await info(p, 'donaturTable')]);
    await ketik(p, '#donatur_search', '');
    await p.evaluate(() => { const s = document.getElementById('donatur_filter_kategori'); s.value = 'Lembaga/Perusahaan'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(300);
    const semuaLembaga = await p.evaluate(() => Array.from(document.querySelectorAll('#donaturTable tbody tr.donatur-row')).every((r) => r.getAttribute('data-kategori') === 'Lembaga/Perusahaan'));
    cek('Donatur: saring kategori hanya menampilkan kategori itu', semuaLembaga && (await p.evaluate(() => document.querySelectorAll('#donaturTable tbody tr.donatur-row').length)) > 0);
    await ctx.close();
  }

  /* Daftar besar dikirim padat (3 Okt 2026, 7,72 MB menjadi 3,73 MB pada 15.000 baris). Tiruan server
     di atas HANYA menjawab padat bila klien memintanya, jadi seluruh pemeriksaan baris, saringan, dan
     gulir di atas sekaligus membuktikan hasil bongkarannya sama dengan larik biasa. */
  cek('Klien meminta bentuk padat untuk daftar Penghimpunan', PADAT_DIMINTA.indexOf('apiListPenghimpunan') >= 0, PADAT_DIMINTA);
  cek('Klien meminta bentuk padat untuk daftar Pentasyarufan', PADAT_DIMINTA.indexOf('apiListPentasyarufan') >= 0, PADAT_DIMINTA);
  cek('Tidak ada galat skrip di halaman', galat.length === 0, galat.slice(0, 3));
  await b.close(); server.close();
  console.log(`\n  ${ok} lulus, ${g} gagal`);
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
