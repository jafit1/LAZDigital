/* Uji tampilan kwitansi ke WhatsApp di halaman Penghimpunan (app.js + js/lz-kwitansi.js).
 *
 * Yang dijaga: kolom "Kwitansi WA" menandai yang sudah dan belum dikirim, popup Kirim / Tidak muncul otomatis sesudah
 * menyimpan penghimpunan baru, yang dikirim memang gambar PNG kwitansi beserta ucapan terima kasih, "Tidak" tidak
 * mengirim apa pun tetapi menyinkronkan kontak, yang sudah dikirim ditawari "Kirim ulang", dan akun tanpa izin
 * Broadcast tidak melihat tombol kirim. Server Broadcast di sini ditiru (uji server ada di test_kwitansi_wa.js).
 * jalankan:  node tools/test_kwitansi_ui.js
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

const baris = (i, telepon) => ({ id: 'h' + i, noKwitansi: 'KW/202610/000' + i, tanggal: '2026-10-0' + i, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '', program: 'Air bersih', namaDonatur: 'Donatur ' + i, telepon: telepon || '', alamat: 'Sleman', jumlah: 100000 * i, metode: 'Transfer Bank', bank: 'BPD DIY Syariah', petugas: 'Sherli', fundraising: 'Kantor', statusBayar: 'Lunas', dibuat: '2026-10-0' + i + 'T03:00:00.000Z' });
const DATA = [baris(1, '081234567801'), baris(2, '081234567802'), baris(3, ''), baris(4, '081234567804')];
const PANGGILAN = [];           // panggilan ke /api/blast
let PERAN = 'superadmin';
let STATUS = { h1: { status: 'terkirim', waktu: '2026-10-02T03:00:00.000Z', nomor: '6281234567801', percobaan: 1 } };
const SETELAN = { namaLembaga: 'Lazismu Daerah Bantul', singkatan: 'Lazismu Bantul', alamat: 'Jl. Urip Sumoharjo No.4A, Bantul', telepon: '0877 8284 1912', email: 'bantullazismu@gmail.com', website: 'www.sobatlazismu.org' };

const JAWAB = {
  apiBootstrap: () => ({
    user: PERAN === 'superadmin' ? { id: 'u1', username: 'uji', nama: 'Petugas Uji', role: 'superadmin', permissions: {} }
      : { id: 'u2', username: 'staf', nama: 'Staf Penghimpunan', role: 'staff', permissions: { penghimpunan: { view: true, create: true, edit: true } } },
    settings: SETELAN, webAppUrl: '' }),
  apiGetPermissionMeta: () => ({ modules: [], actions: [] }),
  apiListPenghimpunan: () => DATA,
  apiListRekeningPublic: () => [], apiListLayananPublic: () => [],
  apiGetKwitansi: (a) => ({ data: DATA.find((x) => x.id === a[1]) || DATA[0], settings: SETELAN }),
  apiSavePenghimpunan: (a) => { const d = Object.assign({ id: 'h9', noKwitansi: 'KW/202610/0009', petugas: 'Petugas Uji' }, a[1]); DATA.unshift(d); return d; },
};
const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    let m = {}; try { m = JSON.parse(body); } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.startsWith('/api/blast')) {
      PANGGILAN.push(m);
      if (m.tindakan === 'kwitansi.status') return res.end(JSON.stringify({ ok: true, peta: STATUS }));
      if (m.tindakan === 'kwitansi.kirim') return res.end(JSON.stringify({ ok: true, pesanId: 'm1', status: 'menunggu', kontakBaru: true, pesan: 'Kwitansi masuk antrean WhatsApp dan nomornya disimpan sebagai kontak Broadcast.' }));
      if (m.tindakan === 'kontak.sinkronDonatur') return res.end(JSON.stringify({ ok: true, baru: (m.data.daftar || []).length, sudahAda: 0, tidakSah: 0, pesan: 'ok' }));
      return res.end(JSON.stringify({ ok: false, pesan: 'tidak dikenal' }));
    }
    const f = JAWAB[m.fn];
    return res.end(JSON.stringify({ result: f ? f(m.args || m.a || []) : (/^apiList/.test(m.fn || '') ? [] : {}) }));
  }
  const nama = req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas) || fs.statSync(berkas).isDirectory()) { res.writeHead(404); return res.end('x'); }
  const isi = fs.readFileSync(berkas);
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(isi);
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(CHROMIUM);
  let ok = 0, g = 0;
  const cek = (n, s, info) => { if (s) { ok++; return; } g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 400)); };
  const galat = [];
  const buka = async () => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => galat.push(String(e).slice(0, 150)));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await p.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
    await p.goto(A + '/?hal=penghimpunan', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#himpunTable tbody tr[data-id]', { timeout: 20000 });
    await p.waitForFunction(() => document.querySelector('#himpunTable tr[data-id="h1"] .kw-wa').textContent.trim() !== '', null, { timeout: 8000 });
    return { ctx, p };
  };
  const sel = (p, id) => p.evaluate((i) => (document.querySelector('#himpunTable tr[data-id="' + i + '"] .kw-wa') || {}).textContent, id);

  console.log('=== A. KOLOM DAN PENANDA ===');
  {
    const { ctx, p } = await buka();
    await p.waitForTimeout(500);
    cek('kepala kolom "Kwitansi WA" ada', (await p.evaluate(() => [...document.querySelectorAll('#himpunTable th')].map((x) => x.textContent))).includes('Kwitansi WA'));
    cek('yang sudah dikirim ditandai Terkirim', /Terkirim/.test(await sel(p, 'h1')), await sel(p, 'h1'));
    cek('yang belum dikirim ditandai Belum dikirim', /Belum dikirim/.test(await sel(p, 'h2')), await sel(p, 'h2'));
    cek('tanpa nomor tetap Belum dikirim, dengan catatan tanpa nomor', /tanpa nomor/.test(await sel(p, 'h3')), await sel(p, 'h3'));
    cek('status diminta ke Broadcast (kwitansi.status)', PANGGILAN.some((x) => x.tindakan === 'kwitansi.status'));
    await p.fill('#himpunTable_search', 'belum dikirim');
    await p.waitForTimeout(400);
    const tampak = await p.evaluate(() => [...document.querySelectorAll('#himpunTable tbody tr[data-id]')].map((x) => x.dataset.id));
    cek('mencari "belum dikirim" menyisakan yang belum saja', tampak.sort().join() === 'h2,h3,h4', tampak);
    await p.fill('#himpunTable_search', 'terkirim');
    await p.waitForTimeout(400);
    cek('mencari "terkirim" hanya yang terkirim', (await p.evaluate(() => [...document.querySelectorAll('#himpunTable tbody tr[data-id]')].map((x) => x.dataset.id))).join() === 'h1');
    await ctx.close();
  }

  console.log('\n=== B. POPUP DAN KIRIM ===');
  {
    const { ctx, p } = await buka();
    await p.click('#himpunTable tr[data-id="h2"] button[onclick^="kwPopup"]');
    await p.waitForSelector('#kwKirim', { timeout: 8000 });
    cek('popup punya tombol Kirim dan Tidak', !!(await p.$('#kwKirim')) && !!(await p.$('#kwTidak')));
    /* Pemilik 6 Oktober 2026: di HP "Tidak, nanti saja" terpotong di tepi kiri. Tiga tombol harus sebaris, utuh di dalam
       jendela, dan tombol utama memakai logo WhatsApp dengan tulisan pendek "Kirim". */
    await p.setViewportSize({ width: 390, height: 800 });
    await p.waitForTimeout(150);
    const kaki = await p.evaluate(() => {
      const card = document.getElementById('modalCard').getBoundingClientRect();
      const r = ['kwTidak', 'kwCetak', 'kwKirim'].map((id) => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return { id, kiri: b.left, kanan: b.right, atas: Math.round(b.top), tinggi: Math.round(b.height), teks: e.textContent.trim(), lebihLebar: e.scrollWidth > e.clientWidth + 1 }; });
      return { r, kartuKiri: card.left, kartuKanan: card.right, wa: !!document.querySelector('#kwKirim svg path') };
    });
    cek('HP: tiga tombol sebaris, utuh di dalam jendela, tulisan tidak terpotong', kaki.r.every((x) => x.kiri >= kaki.kartuKiri - 0.5 && x.kanan <= kaki.kartuKanan + 0.5 && !x.lebihLebar) && new Set(kaki.r.map((x) => x.atas)).size === 1 && new Set(kaki.r.map((x) => x.tinggi)).size === 1, kaki);
    cek('HP: tulisan tombol pendek (Nanti, Cetak, Kirim) dan tombol utama berlogo WhatsApp', kaki.r[0].teks === 'Nanti' && kaki.r[1].teks === 'Cetak' && /^Kirim/.test(kaki.r[2].teks) && kaki.wa, kaki);
    if (process.env.LZ_FOTO) { await p.waitForFunction(() => !document.documentElement.classList.contains('tunggu-huruf'), null, { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(500); } if (process.env.LZ_FOTO) await p.screenshot({ path: process.env.LZ_FOTO + '/kwitansi-hp.png' });
    await p.setViewportSize({ width: 1440, height: 1000 });
    cek('nomor donatur terisi dari data', (await p.inputValue('#kwNomor')) === '081234567802');
    const teks = await p.inputValue('#kwTeks');
    cek('ucapan terima kasih memuat nama, jumlah, dan nomor kwitansi', /Donatur 2/.test(teks) && /Rp 200\.000/.test(teks) && /KW\/202610\/0002/.test(teks) && /Jazakumullah/i.test(teks), teks.slice(0, 200));
    await p.waitForFunction(() => document.getElementById('kwPrev').src.startsWith('data:image/png'), null, { timeout: 8000 });
    const kecil = await p.evaluate(() => { const i = document.getElementById('kwPrev'); return Math.round(i.getBoundingClientRect().width); });
    cek('pratinjau di popup kecil (tidak memenuhi lebar popup)', kecil > 0 && kecil <= 150, kecil);
    await p.click('#kwPrev');
    cek('ketuk pratinjau memperbesarnya', await p.evaluate(() => document.getElementById('kwPrev').classList.contains('kw-besar')));
    await p.click('#kwPrev');
    cek('ketuk lagi mengecilkannya', await p.evaluate(() => !document.getElementById('kwPrev').classList.contains('kw-besar')));
    const tpl = await p.evaluate(() => ({
      bawaan: LZKwitansi.templateBawaan,
      kustom: LZKwitansi.pesan({ namaDonatur: 'Budi', jumlah: 150000, subJenis: 'Infak Umum', noKwitansi: 'KW/1', tanggal: '2026-10-05' }, { namaLembaga: 'Lazismu Bantul', kwPesan: 'Halo {nama}, {jenis} Rp {jumlah} no {nomor} ({tanggal}) dari {lembaga}.' }),
      kosong: LZKwitansi.pesan({ namaDonatur: 'Budi', jumlah: 1000, noKwitansi: 'KW/2' }, { namaLembaga: 'Lazismu Bantul', kwPesan: '   ' }),
      denganLink: LZKwitansi.pesan({ namaDonatur: 'Budi', jumlah: 1000, noKwitansi: 'KW/3' }, { namaLembaga: 'Lazismu Bantul', __linkDonatur: 'https://x.test/harian.html?t=abc' }),
      tanpaLink: LZKwitansi.pesan({ namaDonatur: 'Budi', jumlah: 1000, noKwitansi: 'KW/3' }, { namaLembaga: 'Lazismu Bantul' })
    }));
    cek('template ucapan dari Pengaturan memakai isian {nama} {jenis} {jumlah} {nomor} {tanggal} {lembaga}', tpl.kustom === 'Halo Budi, infak umum Rp 150.000 no KW/1 (2026-10-05) dari Lazismu Bantul.', tpl.kustom);
    cek('template kosong memakai ucapan bawaan', /Jazakumullah/.test(tpl.kosong) && /KW\/2/.test(tpl.kosong) && !/\{nama\}/.test(tpl.kosong), tpl.kosong.slice(0, 120));
    cek('ucapan memuat link donatur bila aktif', tpl.denganLink.includes('https://x.test/harian.html?t=abc'), tpl.denganLink.slice(-160));
    cek('baris link dibuang bila link belum aktif', !/\{link\}|harian\.html/.test(tpl.tanpaLink) && /KW\/3/.test(tpl.tanpaLink), tpl.tanpaLink.slice(-160));
    cek('ucapan bawaan menyediakan isian untuk Pengaturan', /\{nama\}/.test(tpl.bawaan) && /\{lembaga\}/.test(tpl.bawaan));
    const dim = await p.evaluate(() => { const i = document.getElementById('kwPrev'); return { w: i.naturalWidth, h: i.naturalHeight }; });
    cek('pratinjau kwitansi berupa PNG 1600 x 1238', dim.w === 1600 && dim.h === 1238, dim);
    PANGGILAN.length = 0;
    await p.click('#kwKirim');
    await p.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), null, { timeout: 8000 });
    const kirim = PANGGILAN.find((x) => x.tindakan === 'kwitansi.kirim');
    cek('mengirim lewat kwitansi.kirim dengan id, nomor, teks, dan gambar PNG', kirim && kirim.data.penghimpunanId === 'h2' && kirim.data.nomor === '081234567802' && /Donatur 2/.test(kirim.data.teks) && kirim.data.tipe === 'image/png'
      && Buffer.from(kirim.data.base64, 'base64').slice(1, 4).toString() === 'PNG' && /^Kwitansi-KW-202610-0002\.png$/.test(kirim.data.namaBerkas) && !kirim.data.paksa, kirim && Object.keys(kirim.data));
    cek('penanda berubah jadi Menunggu tanpa memuat ulang', /Menunggu/.test(await sel(p, 'h2')), await sel(p, 'h2'));
    cek('token ikut dikirim ke Broadcast', kirim && kirim.token === 'uji');
    await ctx.close();
  }

  console.log('\n=== C. TIDAK, KIRIM ULANG, NOMOR KOSONG ===');
  {
    const { ctx, p } = await buka();
    PANGGILAN.length = 0;
    await p.click('#himpunTable tr[data-id="h4"] button[onclick^="kwPopup"]');
    await p.waitForSelector('#kwTidak');
    await p.click('#kwTidak');
    await p.waitForTimeout(500);
    cek('"Tidak" tidak mengirim kwitansi', !PANGGILAN.some((x) => x.tindakan === 'kwitansi.kirim'));
    const sink = PANGGILAN.find((x) => x.tindakan === 'kontak.sinkronDonatur');
    cek('"Tidak" tetap menyinkronkan nomornya ke kontak Broadcast', sink && sink.data.daftar.length === 1 && sink.data.daftar[0].nomor === '081234567804' && sink.data.daftar[0].nama === 'Donatur 4', sink);
    cek('penanda tetap Belum dikirim', /Belum dikirim/.test(await sel(p, 'h4')));
    await p.click('#himpunTable tr[data-id="h1"] button[onclick^="kwPopup"]');
    await p.waitForSelector('#kwKirim');
    cek('yang sudah terkirim ditawari "Kirim ulang" dengan keterangan', /Kirim ulang/.test(await p.textContent('#kwKirim')) && /[Ss]udah terkirim/.test(await p.textContent('.kw-info')), await p.textContent('.kw-pop'));
    PANGGILAN.length = 0;
    await p.waitForFunction(() => document.getElementById('kwPrev').src.startsWith('data:image/png'));
    await p.click('#kwKirim');
    await p.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'));
    cek('kirim ulang membawa paksa:true', (PANGGILAN.find((x) => x.tindakan === 'kwitansi.kirim') || { data: {} }).data.paksa === true);
    await p.click('#himpunTable tr[data-id="h3"] button[onclick^="kwPopup"]');
    await p.waitForSelector('#kwKirim');
    PANGGILAN.length = 0;
    await p.click('#kwKirim');
    await p.waitForTimeout(300);
    cek('nomor kosong ditolak di popup, tidak ada yang dikirim', !PANGGILAN.some((x) => x.tindakan === 'kwitansi.kirim') && (await p.$('#kwKirim')) !== null);
    await p.fill('#kwNomor', '12ab');
    await p.click('#kwKirim');
    await p.waitForTimeout(300);
    cek('nomor tidak sah ditolak', !PANGGILAN.some((x) => x.tindakan === 'kwitansi.kirim'));
    await p.fill('#kwNomor', '0857 1111 2222');
    await p.waitForFunction(() => document.getElementById('kwPrev').src.startsWith('data:image/png'));
    await p.click('#kwKirim');
    await p.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'));
    const k3 = PANGGILAN.find((x) => x.tindakan === 'kwitansi.kirim');
    cek('nomor yang diketik di popup dipakai', k3 && k3.data.nomor === '0857 1111 2222' && k3.data.penghimpunanId === 'h3', k3 && k3.data.nomor);
    await ctx.close();
  }

  console.log('\n=== D. POPUP OTOMATIS SESUDAH MENYIMPAN ===');
  {
    const { ctx, p } = await buka();
    await p.waitForSelector('#f_namaDonatur');
    await p.fill('#f_namaDonatur', 'Hamba Allah Baru');
    await p.fill('#f_telepon', '081299998888');
    await p.fill('#f_jumlah', '250000');
    await p.evaluate(() => { const f = document.getElementById('f_fundraising'); if (f && f.tagName === 'SELECT' && f.options.length > 1) f.selectedIndex = 1; else if (f) f.value = 'Kantor'; });
    await p.evaluate(() => saveHimpun(''));
    await p.waitForSelector('#kwKirim', { timeout: 8000 });
    cek('sesudah menyimpan penghimpunan baru, popup kirim muncul sendiri', /Penghimpunan tersimpan/.test(await p.textContent('.kw-pop')));
    cek('nomor yang diisi di formulir sudah ada di popup', (await p.inputValue('#kwNomor')) === '081299998888', await p.inputValue('#kwNomor'));
    await p.click('#kwCetak');
    await p.waitForTimeout(600);
    await p.click('#kwTidak');
    await ctx.close();
  }

  console.log('\n=== E. TANPA IZIN BROADCAST ===');
  {
    PERAN = 'staf';
    const { ctx, p } = await buka().catch(async () => { /* kolom status tidak terisi tanpa izin: normal */ return null; }) || {};
    void p; void ctx;
    const c2 = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const q = await c2.newPage();
    q.on('pageerror', (e) => galat.push(String(e).slice(0, 150)));
    await q.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await q.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
    PANGGILAN.length = 0;
    await q.goto(A + '/?hal=penghimpunan', { waitUntil: 'domcontentloaded' });
    await q.waitForSelector('#himpunTable tbody tr[data-id]', { timeout: 20000 });
    await q.waitForTimeout(800);
    cek('akun tanpa izin Broadcast tidak melihat tombol kirim WhatsApp', (await q.$$('#himpunTable button[onclick^="kwPopup"]')).length === 0);
    cek('akun itu tidak memanggil Broadcast sama sekali', PANGGILAN.length === 0, PANGGILAN.map((x) => x.tindakan));
    cek('tombol sinkron kontak juga tidak ada', !(await q.evaluate(() => /Sinkron Kontak/.test(document.body.innerText))));
    cek('tombol kwitansi biasa tetap ada', (await q.$$('#himpunTable button[onclick^="cetakKwitansi"]')).length === DATA.length);
    await c2.close();
    PERAN = 'superadmin';
  }
  cek('tidak ada galat JavaScript', galat.length === 0, galat.slice(0, 3));
  await b.close(); server.close();
  console.log('\ntest_kwitansi_ui.js  ' + ok + '/' + (ok + g) + '  ' + (g ? 'ADA YANG GAGAL' : 'SEMUA LULUS') + '\n');
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
