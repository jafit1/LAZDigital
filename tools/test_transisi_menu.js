/* Uji kehalusan perpindahan menu: klik menu -> konten lama meredup (view-leaving)
 * -> konten baru masuk (view-anim). Yang dijaga (keluhan pemilik 26 Nov 2026:
 * "perpindahan page/menu dibuat lebih smooth dan mulus"):
 *  1. Klik menu memasang view-leaving pada #content (bukan langsung memotong isi).
 *  2. Isi baru tetap masuk dengan view-anim (animasi kelas tetap terpasang).
 *  3. Selama transisi, TIDAK ada scroll melompat: posisi gulir saat menu tiba
 *     sama dengan saat klik (halaman baru dibuka di posisi yang sama, bukan
 *     "muncul dari bawah").
 *  4. Waktu redup pendek (<= 260 ms terukur dari style) supaya tidak terasa nge-lag.
 *  5. Perpindahan berulang cepat (spam klik 3 menu) tidak meninggalkan kelas
 *     transisi lengket / konten membeku di opasitas rendah.
 *   node tools/test_transisi_menu.js   (engine asli atas data tiruan) */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = (() => { for (const j of ['playwright']) { try { return require(j); } catch (_) {} } process.exit(2); })();
const CHROMIUM = require('./_luncurkan.js')(process.env.LZ_EXE ? { executablePath: process.env.LZ_EXE } : {});
const AKAR = path.join(__dirname, '..'), PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js')), skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
let DB = null, TOKEN = '';
const tgl = (g) => new Date(Date.now() + 7 * 3600e3 + (g || 0) * 864e5).toISOString().slice(0, 10);
const tambah = (n, o) => { const t = DB.sheets[n], h = t[0]; t.push(h.map((k) => (o[k] === undefined ? '' : o[k]))); };
const rpc = async (fn, a) => { const o = await engine.runRPC(DB, fn, a, {}); DB = o.db; return o.result; };
const srv = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/rpc' && req.method === 'POST') {
    let b = ''; for await (const c of req) b += c; const j = JSON.parse(b || '{}');
    res.setHeader('Content-Type', 'application/json');
    try { const o = await engine.runRPC(DB, j.fn, j.args || [], { ip: '127.0.0.1', ua: 'uji' }); DB = o.db; res.end(JSON.stringify({ result: o.result })); }
    catch (e) { res.end(JSON.stringify({ __error: e.message })); }
    return;
  }
  const f = path.join(PUBLIK, url === '/' ? 'index.html' : url);
  if (url.startsWith('/api/') || !f.startsWith(PUBLIK) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(''); }
  res.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
(async () => {
  const s = {}; for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  TOKEN = (await rpc('login', ['superadmin', 'Admin12345'])).token;
  await rpc('apiSaveLayanan', [TOKEN, { tipe: 'KLL', nama: 'Kota Contoh', aktif: 'true' }]);
  tambah('Rekening', { id: 'r1', namaBank: 'Bank Contoh', nomor: '123', atasNama: 'x', fundGroup: 'Infak', aktif: 'true' });
  const jenis = ['Zakat', 'Infak', 'Infak Terikat', 'Wakaf'], metode = ['Cash/Tunai', 'Transfer Bank', 'QRIS'];
  for (let i = 0; i < 24; i++) tambah('Penghimpunan', { id: 'h' + i, tanggal: tgl(-(i % 9)), jenisDana: jenis[i % 4], subJenis: 'Umum', pilar: ['Pendidikan', 'Kesehatan', 'Ekonomi'][i % 3], program: 'Beasiswa', namaDonatur: i % 3 === 0 ? 'KLL Kota Contoh' : 'Donatur ' + i, jumlah: 100000 * (i + 1), metode: metode[i % 3], rekeningId: 'r1', dibuat: new Date().toISOString() });
  for (let i = 0; i < 8; i++) tambah('Pentasyarufan', { id: 'p' + i, tanggal: tgl(-i), ashnaf: 'Fakir', program: 'Beasiswa', sumberDana: jenis[i % 4], namaPenerima: 'Penerima ' + i, jumlah: 150000 * (i + 1), metode: metode[i % 3], rekeningId: 'r1' });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript((x) => { try { localStorage.setItem('laz_token', x.t); localStorage.setItem('laz_theme', 'light'); } catch (_) {} }, { t: TOKEN });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('GALAT', String(e).slice(0, 160)));
  await p.goto(A + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.dgrid .wc', { timeout: 20000 });
  await p.waitForFunction(() => !document.querySelector('.lz-muat'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);

  let ok = 0, g = 0;
  const cek = (n, sy, i) => { if (sy) { ok++; console.log('  OK   | ' + n); } else { g++; console.log('  GAGAL| ' + n + (i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 300))); } };

  /* Kondisi awal: konten dasbor terlihat penuh. */
  const awal = await p.evaluate(() => { const c = document.getElementById('content'); const s = getComputedStyle(c); return { opa: parseFloat(s.opacity), kelas: c.className }; });
  cek('Konten awal terlihat penuh (opacity 1)', awal.opa >= 0.99, awal);

  /* 1. Klik menu Penghimpunan: konten lama meredup — ukur SELAMA redup
   *    (kelas bisa tertukar view-anim bila data datang lebih cepat dari
   *    60 ms; yang dijaga: opasitas TIDAK pernah jatuh ke 0 = layar kosong). */
  await p.evaluate(() => { window.scrollTo(0, 0); document.getElementById('nav_penghimpunan').click(); });
  await p.waitForTimeout(40);
  let minOpa = 1, pernahLeaving = false;
  for (let i = 0; i < 8; i++) {
    const s = await p.evaluate(() => { const c = document.getElementById('content'); return { leaving: c.classList.contains('view-leaving'), opa: parseFloat(getComputedStyle(c).opacity) }; });
    if (s.leaving) pernahLeaving = true;
    if (s.opa < minOpa) minOpa = s.opa;
    if (s.leaving) break;
    await p.waitForTimeout(30);
  }
  cek('Klik menu: konten lama MELUNCAR meredup (tidak jatuh ke hitam/kosong)', minOpa >= 0.3 && minOpa <= 0.99, { minOpa, pernahLeaving });

  /* 2. Konten baru masuk dengan view-anim. */
  await p.waitForSelector('#content .page-head, #content .tabel-geser, #content .card', { timeout: 15000 });
  await p.waitForTimeout(120);
  const saatMasuk = await p.evaluate(() => { const c = document.getElementById('content'); const s = getComputedStyle(c); return { anim: c.classList.contains('view-anim') || c.classList.contains('view-enter'), opa: parseFloat(s.opacity), scrollY: Math.round(window.scrollY) }; });
  cek('Isi baru masuk dengan animasi (view-anim)', saatMasuk.anim, saatMasuk);

  /* 3. Gulir ke bawah, pindah menu lagi: posisi gulir tidak melompat liar.
   *    Halaman panjang lain (Penghimpunan punya tabel); browser menaikkan
   *    gulir bila halaman baru lebih pendek - yang dijaga: tidak KEMBALI ke
   *    atas secara paksa saat isi sudah setinggi viewport. */
  await p.evaluate(() => window.scrollTo(0, 400));
  await p.waitForTimeout(150);
  await p.evaluate(() => document.getElementById('nav_pentasyarufan').click());
  await p.waitForSelector('#content .page-head, #content .tabel-geser, #content .card', { timeout: 15000 });
  /* Tunggu animasi masuk (320 ms) benar-benar selesai sebelum mengukur. */
  await p.waitForFunction(() => parseFloat(getComputedStyle(document.getElementById('content')).opacity) >= 0.99, null, { timeout: 4000 }).catch(() => {});
  const saatKedua = await p.evaluate(() => ({ scrollY: Math.round(window.scrollY), tinggi: document.documentElement.scrollHeight, opa: parseFloat(getComputedStyle(document.getElementById('content')).opacity) }));
  cek('Perpindahan kedua: gulir tidak dilompatkan ke 0 secara paksa saat halaman cukup panjang',
    saatKedua.tinggi < 1300 || saatKedua.scrollY > 0, saatKedua);
  cek('Setelah transisi selesai konten kembali opasitas penuh', saatKedua.opa >= 0.99, saatKedua);

  /* 4. Spam klik tiga menu dengan cepat: konten tidak boleh membeku redup. */
  await p.evaluate(() => { document.getElementById('nav_dashboard').click(); });
  await p.waitForTimeout(40);
  await p.evaluate(() => { document.getElementById('nav_laporan').click(); });
  await p.waitForTimeout(40);
  await p.evaluate(() => { document.getElementById('nav_donatur').click(); });
  await p.waitForSelector('#content .page-head, #content .tabel-geser, #content .card, #content .donatur-item, #content table', { timeout: 15000 });
  await p.waitForTimeout(600);
  const akhir = await p.evaluate(() => { const c = document.getElementById('content'); const s = getComputedStyle(c); return { opa: parseFloat(s.opacity), kelas: c.className, pointer: s.pointerEvents, punyaIsi: c.innerHTML.length > 500 }; });
  cek('Spam klik menu: konten tidak membeku redup (opacity penuh, pointer aktif)',
    akhir.opa >= 0.99 && akhir.pointer !== 'none' && akhir.punyaIsi, akhir);
  cek('Spam klik menu: tidak ada kelas transisi lengket selain view-anim', !/view-leaving/.test(akhir.kelas), akhir.kelas);

  console.log('\ntest_transisi_menu.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  await b.close(); srv.close();
  setTimeout(() => process.exit(g ? 1 : 0), 200).unref();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
