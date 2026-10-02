/* Uji link Penghimpunan Harian (permintaan pemilik, 2 Oktober 2026).
 *
 * Dua link baru, terpisah dari link Dashboard Publik yang sudah ada:
 *  - Untuk donatur: semua penghimpunan per hari, lengkap dengan nama donatur,
 *    nominal, fundraiser, dan metode. Nama ditampilkan lengkap, kecuali yang
 *    memang anonim ("Hamba Allah", "NN", kosong). Setoran KLL/ULL ditandai.
 *  - Untuk KLL & ULL: satu link untuk semua kantor, hanya setoran kantor,
 *    dengan ringkasan per kantor hari ini dan bulan ini, bisa disaring.
 * Keduanya hari ini secara bawaan, bisa pilih tanggal lain, dan memperbarui
 * sendiri. Yang TIDAK boleh ikut keluar: telepon, email, alamat,
 * keterangan, nomor kwitansi, rekening, petugas.
 *
 * Datanya BUATAN.
 *
 *   node tools/test_link_harian.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

function muatPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (_) { /* coba berikutnya */ }
  }
  return null;
}
const pw = muatPlaywright();
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};
const SANDI = 'Admin12345';
const tgl = (geser) => new Date(Date.now() + 7 * 3600e3 + (geser || 0) * 864e5).toISOString().slice(0, 10);
const HARI_INI = tgl(0), KEMARIN = tgl(-1), BESOK = tgl(1);
const BULAN_LALU = (() => { const d = new Date(Date.now() + 7 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
let DB = null, TOKEN = '';
const LAY = {};

function tambahBaris(nama, o) {
  const t = DB.sheets[nama], h = t[0];
  t.push(h.map((k) => (o[k] === undefined ? '' : o[k])));
}
async function rpc(fn, args) {
  const out = await engine.runRPC(DB, fn, args, {});
  DB = out.db; return out.result;
}
async function galat(fn, args) {
  try { await rpc(fn, args); return ''; } catch (e) { return e.message || String(e); }
}

async function siapkanDB() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const r = await rpc('login', ['superadmin', SANDI]);
  TOKEN = r.token;
  for (const [tipe, nama] of [['KLL', 'Kota Contoh'], ['ULL', 'Masjid Contoh']]) {
    await rpc('apiSaveLayanan', [TOKEN, { tipe, nama, aktif: 'true' }]);
  }
  const t = DB.sheets.Layanan, h = t[0];
  t.slice(1).forEach((x) => { LAY[x[h.indexOf('nama')]] = x[h.indexOf('id')]; });
  const pribadi = { telepon: '081299990000', email: 'rahasia@contoh.id', alamat: 'Jl. Rahasia No. 9', keterangan: 'catatan internal petugas',
    noKwitansi: 'KW-RAHASIA-1', petugas: 'Petugas Rahasia', rekeningId: 'rek-rahasia', atasNama: 'Atas Nama Rahasia' };
  tambahBaris('Penghimpunan', Object.assign({ id: 'h1', tanggal: HARI_INI, jenisDana: 'Infak', subJenis: 'Infak Umum', namaDonatur: 'Budi Contoh', tipeDonatur: 'Perorangan',
    jumlah: 100000, metode: 'Transfer Bank', fundraising: 'Rina Contoh', dibuat: new Date().toISOString() }, pribadi));
  tambahBaris('Penghimpunan', { id: 'h2', tanggal: HARI_INI, jenisDana: 'Zakat', subJenis: 'Zakat Maal', namaDonatur: '', jumlah: 300000, metode: 'QRIS' });
  tambahBaris('Penghimpunan', { id: 'h3', tanggal: HARI_INI, jenisDana: 'Infak', namaDonatur: 'NN', jumlah: 50000, metode: 'Cash/Tunai' });
  tambahBaris('Penghimpunan', { id: 'h4', tanggal: HARI_INI, jenisDana: 'Infak', namaDonatur: 'KLL Kota Contoh', tipeDonatur: 'KLL', layananId: LAY['Kota Contoh'],
    jumlah: 2000000, metode: 'Cash/Tunai', fundraising: 'KLL Kota Contoh' });
  tambahBaris('Penghimpunan', { id: 'h5', tanggal: HARI_INI, jenisDana: 'Infak', namaDonatur: 'ULL Masjid Contoh', tipeDonatur: 'ULL', layananId: LAY['Masjid Contoh'],
    jumlah: 500000, metode: 'Transfer Bank' });
  tambahBaris('Penghimpunan', { id: 'h6', tanggal: KEMARIN, jenisDana: 'Infak', namaDonatur: 'Siti Kemarin', jumlah: 75000, metode: 'QRIS' });
  tambahBaris('Penghimpunan', { id: 'h7', tanggal: BULAN_LALU, jenisDana: 'Infak', namaDonatur: 'KLL Kota Contoh', layananId: LAY['Kota Contoh'], jumlah: 9000000, metode: 'Cash/Tunai' });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/rpc' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; });
    await new Promise((r) => req.on('end', r));
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (_) {}
    res.setHeader('Content-Type', 'application/json');
    try {
      const out = await engine.runRPC(DB, j.fn, j.args || [], { ip: '127.0.0.1', ua: 'uji' });
      DB = out.db;
      res.end(JSON.stringify({ result: out.result }));
    } catch (e) { res.end(JSON.stringify({ __error: e.message })); }
    return;
  }
  if (url.startsWith('/api/')) { res.statusCode = 404; res.end('{}'); return; }
  const f = path.join(PUBLIK, url === '/' ? 'index.html' : url);
  if (!f.startsWith(PUBLIK) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(''); return; }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await siapkanDB();

  console.log('\n=== A. MEMBUAT DAN MEMATIKAN LINK ===');
  cek('sebelum dibuat, token sembarang ditolak', /tidak valid/i.test(await galat('apiPenghimpunanHarian', ['a'.repeat(32), HARI_INI])));
  cek('token kosong ditolak', /tidak valid/i.test(await galat('apiPenghimpunanHarian', ['', HARI_INI])));
  const info0 = await rpc('apiInfoLinkHarian', [TOKEN]);
  cek('awalnya kedua link belum aktif', info0 && info0.donatur && !info0.donatur.aktif && !info0.kantor.aktif, info0);
  const lD = await rpc('apiBuatLinkHarian', [TOKEN, 'donatur']);
  const lK = await rpc('apiBuatLinkHarian', [TOKEN, 'kantor']);
  cek('link donatur dan link KLL/ULL punya token sendiri-sendiri', lD.token && lK.token && lD.token !== lK.token && lD.token.length >= 24, [lD, lK]);
  cek('jenis link yang tidak dikenal ditolak', /tidak dikenal/i.test(await galat('apiBuatLinkHarian', [TOKEN, 'semua'])));
  const pub = await rpc('apiGetPublicLinkInfo', [TOKEN]);
  cek('link Dashboard Publik lama tidak ikut menyala', !pub.enabled, pub);
  cek('token link harian tidak bisa ditulis lewat Pengaturan umum', /IZIN/.test(await galat('apiSaveSettings', [TOKEN, { lhTokenDonatur: 'x'.repeat(32) }])));
  const boot = await rpc('apiBootstrap', [TOKEN]);
  cek('token link harian tidak ikut terkirim ke peramban lewat Settings', !JSON.stringify(boot.settings).includes(lD.token) && !JSON.stringify(boot.settings).includes(lK.token));

  console.log('\n=== B. LINK DONATUR ===');
  const d = await rpc('apiPenghimpunanHarian', [lD.token, '']);
  cek('tanpa tanggal: hari ini', d.tanggal === HARI_INI && d.jenis === 'donatur', [d.tanggal, d.jenis]);
  cek('semua penghimpunan hari ini tampil (5 transaksi)', d.baris.length === 5, d.baris.map((x) => x.nama));
  cek('total hari ini Rp 2.950.000', d.ringkas.total === 2950000 && d.ringkas.n === 5, d.ringkas);
  const budi = d.baris.find((x) => x.nama === 'Budi Contoh') || {};
  cek('nama donatur tampil lengkap', !!budi.nama);
  cek('nominal, fundraiser, metode, dan jenis dana ikut', budi.jumlah === 100000 && budi.fundraising === 'Rina Contoh' && budi.metode === 'Transfer Bank' && /Infak/.test(budi.dana), budi);
  cek('nama kosong dan "NN" jadi "Hamba Allah"', d.baris.filter((x) => x.nama === 'Hamba Allah').length === 2, d.baris.map((x) => x.nama));
  const kll = d.baris.find((x) => x.jumlah === 2000000) || {};
  cek('setoran KLL ditandai kantornya', kll.tipe === 'KLL' && /Kota Contoh/.test(kll.kantor), kll);
  cek('setoran langsung ke daerah tidak bertanda kantor', !budi.kantor && budi.tipe === 'Daerah', budi);
  const json = JSON.stringify(d);
  const bocor = ['081299990000', 'rahasia@contoh.id', 'Jl. Rahasia', 'catatan internal', 'KW-RAHASIA', 'Petugas Rahasia', 'rek-rahasia', 'Atas Nama Rahasia', 'lhToken', 'publicToken']
    .filter((x) => json.includes(x));
  cek('telepon, email, alamat, keterangan, kwitansi, petugas, rekening tidak ikut keluar', bocor.length === 0, bocor);
  cek('rincian per metode', d.ringkas.perMetode && d.ringkas.perMetode['QRIS'] === 300000 && d.ringkas.perMetode['Transfer Bank'] === 600000, d.ringkas.perMetode);
  cek('ringkasan bulan berjalan ikut (tanpa bulan lalu)', d.bulan && d.bulan.total >= 2950000 && d.bulan.total < 2950000 + 9000000, d.bulan);
  const kmr = await rpc('apiPenghimpunanHarian', [lD.token, KEMARIN]);
  cek('pilih tanggal kemarin: hanya transaksi kemarin', kmr.tanggal === KEMARIN && kmr.baris.length === 1 && kmr.baris[0].nama === 'Siti Kemarin', kmr.baris);
  const bsk = await rpc('apiPenghimpunanHarian', [lD.token, BESOK]);
  cek('tanggal masa depan dikembalikan ke hari ini', bsk.tanggal === HARI_INI, bsk.tanggal);
  const ngawur = await rpc('apiPenghimpunanHarian', [lD.token, '2026-13-45<script>']);
  cek('tanggal tidak sah dikembalikan ke hari ini', ngawur.tanggal === HARI_INI, ngawur.tanggal);

  console.log('\n=== C. LINK KLL & ULL ===');
  const k = await rpc('apiPenghimpunanHarian', [lK.token, '']);
  cek('jenisnya kantor', k.jenis === 'kantor');
  cek('hanya setoran KLL/ULL yang tampil', k.baris.length === 2 && k.baris.every((x) => x.tipe === 'KLL' || x.tipe === 'ULL'), k.baris);
  cek('tidak memuat nama donatur perorangan', !JSON.stringify(k).includes('Budi Contoh') && !JSON.stringify(k).includes('Hamba Allah'));
  const pk = (k.perKantor || []).find((x) => /Kota Contoh/.test(x.kantor)) || {};
  cek('ringkasan per kantor: hari ini dan bulan ini', pk.hariIni === 2000000 && pk.bulanIni >= 2000000 && pk.bulanIni < 11000000 && pk.tipe === 'KLL', k.perKantor);
  cek('daftar kantor memuat semua KLL/ULL terdaftar, termasuk yang belum setor', (k.perKantor || []).length === 2, k.perKantor);
  cek('total hari ini hanya setoran kantor', k.ringkas.total === 2500000, k.ringkas);

  console.log('\n=== D. MEMATIKAN ===');
  await rpc('apiMatikanLinkHarian', [TOKEN, 'donatur']);
  cek('link donatur yang dimatikan ditolak', /tidak valid/i.test(await galat('apiPenghimpunanHarian', [lD.token, ''])));
  cek('link KLL/ULL tetap jalan', (await rpc('apiPenghimpunanHarian', [lK.token, ''])).jenis === 'kantor');
  const lD2 = await rpc('apiBuatLinkHarian', [TOKEN, 'donatur']);
  cek('buat ulang memberi token baru, token lama tetap mati', lD2.token !== lD.token && /tidak valid/i.test(await galat('apiPenghimpunanHarian', [lD.token, ''])));

  if (!pw) { console.log('\nPlaywright tidak ada, bagian tampilan dilewati.'); }
  else {
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const A = 'http://127.0.0.1:' + srv.address().port;
    const browser = await pw.chromium.launch(CHROMIUM);
    const ctx = await browser.newContext({ timezoneId: 'Asia/Jakarta', viewport: { width: 1280, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript(() => { window.__ujiJedaHarian = 400; try { navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()); } catch (_) {} });
    const page = await ctx.newPage();
    const galatHal = [];
    page.on('pageerror', (e) => galatHal.push(e.message));
    try {
      console.log('\n=== E. HALAMAN DONATUR ===');
      await page.goto(A + '/harian.html?t=' + lD2.token);
      await page.waitForSelector('.lh-baris', { timeout: 15000 });
      const isi = await page.evaluate(() => document.body.innerText);
      cek('total hari ini tampil', /2\.950\.000/.test(await page.textContent('#lhTotal')), await page.textContent('#lhTotal'));
      cek('nama donatur dan Hamba Allah tampil', /Budi Contoh/.test(isi) && /Hamba Allah/.test(isi));
      cek('fundraiser dan metode tampil', /Rina Contoh/.test(isi) && /QRIS/.test(isi) && /Transfer Bank/.test(isi));
      const tanda = await page.evaluate(() => [...document.querySelectorAll('.lh-baris')].filter((b) => b.querySelector('.lh-kantor')).map((b) => [b.querySelector('.lh-nama-d').firstChild.textContent.trim(), b.querySelector('.lh-kantor').textContent]));
      cek('setoran KLL/ULL bertanda jenis kantornya, tanpa nama dobel', tanda.length === 2 && tanda.some((x) => x[0] === 'KLL Kota Contoh' && x[1] === 'KLL') && tanda.some((x) => x[0] === 'ULL Masjid Contoh' && x[1] === 'ULL'), tanda);
      cek('hari ini ditulis "hari ini", bukan "hari itu"', /Terhimpun hari ini/i.test(isi), isi.slice(0, 300));
      cek('tidak ada em dash di halaman', !/\u2014/.test(isi));
      const ringkas = await page.evaluate(() => ({ kotak: document.querySelectorAll('.lh-k, .lap-filter label').length,
        totalDiKepala: !!document.querySelector('.lh-head #lhTotal'), kata: document.body.innerText.split(/\s+/).length }));
      cek('sederhana: angka utama di kepala, tanpa deretan kartu angka dan label kotak', ringkas.totalDiKepala && ringkas.kotak === 0, ringkas);
      cek('sederhana: teks halaman donatur di bawah 130 kata untuk 5 donasi', ringkas.kata < 130, ringkas.kata);
      /* Pemilik: "kalender jangan bawaan, dropdown sesuaikan desain web". */
      const kendali = await page.waitForFunction(() => {
        const t = document.getElementById('lhTanggal');
        return t && t.previousElementSibling && t.previousElementSibling.classList.contains('datepicker-enhanced') && getComputedStyle(t).display === 'none';
      }, null, { timeout: 5000 }).then(() => true).catch(() => false);
      cek('kalender memakai pemilih tanggal web, bukan bawaan peramban', kendali);
      cek('ada kotak cari donatur', (await page.$('#lhCari')) !== null);
      await page.fill('#lhCari', 'rina');
      await page.waitForTimeout(150);
      let namaTampil = await page.evaluate(() => [...document.querySelectorAll('.lh-baris .lh-nama-d')].map((x) => x.firstChild.textContent.trim()));
      cek('cari "rina" menemukan donasi lewat fundraiser Rina', namaTampil.length === 1 && namaTampil[0] === 'Budi Contoh', namaTampil);
      await page.focus('#lhCari');
      await page.waitForTimeout(1200);
      cek('ketikan pencarian tidak hilang saat halaman memperbarui sendiri',
        (await page.inputValue('#lhCari')) === 'rina' && await page.evaluate(() => document.activeElement && document.activeElement.id === 'lhCari'));
      await page.click('#lhCariHapus');
      await page.waitForTimeout(150);
      namaTampil = await page.evaluate(() => document.querySelectorAll('.lh-baris').length);
      cek('tombol hapus pencarian mengembalikan semua donasi', namaTampil === 5, namaTampil);
      cek('judulnya bukan judul Dashboard Publik', !/Transparansi Dana/.test(await page.title()), await page.title());
      tambahBaris('Penghimpunan', { id: 'h8', tanggal: HARI_INI, jenisDana: 'Sedekah', namaDonatur: 'Donatur Baru Masuk', jumlah: 25000, metode: 'QRIS', dibuat: new Date().toISOString() });
      const muncul = await page.waitForFunction(() => /Donatur Baru Masuk/.test(document.body.innerText), null, { timeout: 8000 }).then(() => true).catch(() => false);
      cek('transaksi baru muncul sendiri tanpa memuat ulang', muncul);
      cek('transaksi baru ditandai', await page.evaluate(() => [...document.querySelectorAll('.lh-baris.lh-baru')].some((x) => /Donatur Baru Masuk/.test(x.textContent))));
      cek('total ikut bertambah', /2\.975\.000/.test(await page.textContent('#lhTotal')), await page.textContent('#lhTotal'));
      await page.evaluate((t) => { const i = document.getElementById('lhTanggal'); i.value = t; i.dispatchEvent(new Event('change', { bubbles: true })); }, KEMARIN);
      await page.waitForFunction(() => /Siti Kemarin/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
      const isiKmr = await page.evaluate(() => document.body.innerText);
      cek('pilih tanggal kemarin menampilkan transaksi kemarin saja', /Siti Kemarin/.test(isiKmr) && !/Budi Contoh/.test(isiKmr));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      cek('di layar HP tidak ada geser ke samping', await page.evaluate(() => document.documentElement.scrollWidth <= 391), await page.evaluate(() => document.documentElement.scrollWidth));

      console.log('\n=== F. HALAMAN KLL & ULL ===');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(A + '/harian.html?t=' + lK.token);
      await page.waitForSelector('.lh-kantor-kartu', { timeout: 15000 });
      const isiK = await page.evaluate(() => document.body.innerText);
      cek('ringkasan per kantor tampil', /KLL Kota Contoh/.test(isiK) && /ULL Masjid Contoh/.test(isiK));
      cek('donatur perorangan tidak tampil', !/Budi Contoh/.test(isiK));
      /* Pemilik: "lebih menarik tapi simple, tidak banyak keterangan". Dropdown
         kantor dibuang karena kartu kantornya sendiri sudah jadi saringan. */
      cek('tanpa dropdown kantor yang dobel dengan kartu kantor', (await page.$('#lhSaring')) === null);
      cek('ada kotak "Cari kantor layanan"', (await page.getAttribute('#lhCari', 'placeholder')) === 'Cari kantor layanan');
      await page.fill('#lhCari', 'masjid');
      await page.waitForTimeout(150);
      const cariK = await page.evaluate(() => ({ kartu: [...document.querySelectorAll('.lh-kantor-kartu')].map((x) => x.textContent), baris: document.querySelectorAll('.lh-baris').length }));
      cek('cari kantor menyaring kartu dan rincian', cariK.kartu.length === 1 && /Masjid/.test(cariK.kartu[0]) && cariK.baris === 1, cariK);
      await page.fill('#lhCari', '');
      await page.waitForTimeout(100);
      await page.evaluate(() => [...document.querySelectorAll('.lh-kantor-kartu')].find((x) => /Masjid/.test(x.textContent)).click());
      await page.waitForTimeout(200);
      const baris = await page.evaluate(() => [...document.querySelectorAll('.lh-baris')].map((x) => x.textContent));
      cek('klik kartu kantor hanya menampilkan kantor itu', baris.length === 1 && /Masjid Contoh/.test(baris[0]), baris);
      await page.click('.lh-hapus-saring');
      await page.waitForTimeout(150);
      cek('"Semua kantor" mengembalikan semua setoran', (await page.$$('.lh-baris')).length === 2);

      console.log('\n=== G. LINK MATI DAN ADMIN ===');
      await page.goto(A + '/harian.html?t=' + lD.token);
      await page.waitForSelector('#lhGalat', { timeout: 10000 });
      cek('link mati menampilkan pesan yang jelas', /tidak valid|dimatikan/i.test(await page.textContent('#lhGalat')));
      await page.goto(A + '/');
      await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (_) {} });
      await page.goto(A + '/');
      await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
      await page.fill('#lUser', 'superadmin'); await page.fill('#lPass', SANDI); await page.click('#loginBtn');
      await page.waitForFunction(() => !document.getElementById('appView').classList.contains('hidden'), null, { timeout: 20000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => openLinkHarian());
      await page.waitForSelector('.lh-admin-kartu', { timeout: 10000 });
      const adm = await page.evaluate(() => [...document.querySelectorAll('.lh-admin-kartu')].map((x) => x.innerText));
      cek('jendela admin menampilkan dua link: donatur dan KLL/ULL', adm.length === 2 && /Donatur/i.test(adm[0]) && /KLL/.test(adm[1]), adm);
      const nilaiUrl = await page.evaluate(() => [...document.querySelectorAll('.lh-admin-kartu input')].map((i) => i.value).join(' '));
      cek('alamat link memuat token yang aktif dan menuju harian.html', nilaiUrl.includes(lD2.token) && nilaiUrl.includes(lK.token) && /harian\.html\?t=/.test(nilaiUrl), nilaiUrl);
      cek('tidak ada galat JavaScript', galatHal.length === 0, galatHal);
    } finally {
      await browser.close();
      srv.close();
    }
  }

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: link Penghimpunan Harian belum benar.\n'); process.exit(1); }
  console.log('\ntest_link_harian.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
