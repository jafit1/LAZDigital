/* Uji tampilan modul Fundraising: apakah halaman-halamannya digambar utuh,
   tombol alur kerja (Diambil/Reschedule/Kosong) muncul, pemilih lokasi peta
   hidup, dan tidak ada galat JavaScript.

   Datanya dipalsukan — server tiruan menjawab /api/fund apa adanya, jadi semua
   halaman bisa digambar tanpa Redis dan tanpa login. Leaflet, ubin OSM, dan
   Nominatim dialihkan ke berkas lokal supaya peta tetap tergambar tanpa
   jaringan.

   jalankan:  node tools/test_fund_ui.js
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

const HARI = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const lok = { lat: -7.8879, lng: 110.3288, alamat: 'Jl. Sudirman, Bantul' };

const JAWABAN = {
  'fund.status': {
    pengguna: { id: 'u1', nama: 'Ahmad Maruf', peran: 'koordinator', kantor: '' },
    izin: ['fund.dasbor', 'donatur.lihat', 'donatur.ubah', 'donatur.hapus', 'ambil.catat', 'himpunan.lihat', 'himpunan.hapus', 'cocok.lihat', 'cocok.tandai', 'laporan.lihat', 'akun.lihat', 'akun.ubah'],
    lihatSemua: true,
    akun: { namaTampil: 'Ahmad Maruf', namaFundraising: 'Tim Bantul Kota', foto: '', telepon: '628129998888', catatan: '' },
    upstash: true,
  },
  'dasbor.ringkas': {
    tanggal: HARI, tanggalPanjang: 'Kamis, 17 September 2026',
    ringkasHari: { kunjungan: 3, berhasil: 2, kosong: 1, total: 350000 },
    ringkasBulan: { kunjungan: 40, berhasil: 33, kosong: 7, total: 7250000 },
    totalDonatur: 42, belumDikunjungi: 1,
    jadwal: [
      { id: 'd1', nama: 'Budi Santosa', telepon: '628111000111', lokasi: lok, jadwal: { tanggal: HARI, ulang: 'sekali' }, sudahDikunjungi: false, hasilKunjungan: null },
      { id: 'd2', nama: 'Siti Aminah', telepon: '628222000222', lokasi: lok, jadwal: { tanggal: HARI, ulang: 'mingguan' }, sudahDikunjungi: true, hasilKunjungan: { id: 'h2', status: 'diambil', jumlah: 200000, peruntukan: 'Zakat' } },
      { id: 'd3', nama: 'Andi Wijaya', telepon: '628333000333', lokasi: lok, jadwal: { tanggal: HARI, ulang: 'sekali' }, sudahDikunjungi: true, hasilKunjungan: { id: 'h3', status: 'kosong', jumlah: 0, peruntukan: '' } },
    ],
  },
  'donatur.daftar': {
    total: 3, halaman: 1, perHalaman: 25, lihatSemua: true,
    grup: [{ nama: 'Rutin', jumlah: 2 }, { nama: 'Ramadan', jumlah: 1 }],
    baris: [
      { id: 'd1', nama: 'Budi Santosa', telepon: '628111000111', grup: ['Rutin', 'Ramadan'], lokasi: lok, jadwal: { tanggal: HARI, ulang: 'sekali' } },
      { id: 'd2', nama: 'Siti Aminah', telepon: '628222000222', grup: ['Rutin'], lokasi: lok, jadwal: { tanggal: HARI, ulang: 'mingguan' } },
      { id: 'd3', nama: 'Andi Wijaya', telepon: '628333000333', grup: [], lokasi: lok, jadwal: null },
    ],
  },
  'grup.daftar': { baris: [{ nama: 'Rutin', jumlah: 2 }, { nama: 'Ramadan', jumlah: 1 }] },
  'donatur.simpan': { donatur: { id: 'd9', nama: 'Baru' }, baru: true },
  'donatur.jadwal': { donatur: { id: 'd1' } },
  'ambil.catat': { pesan: 'Donasi Rp 150.000 dari Budi Santosa dicatat.' },
  'ambil.kosong': { pesan: 'Kunjungan dicatat kosong.' },
  'ambil.reschedule': { pesan: 'Jadwal dipindah.' },
  'himpunan.daftar': {
    total: 2, halaman: 1, perHalaman: 25, ringkas: { kunjungan: 2, berhasil: 1, kosong: 1, total: 150000 },
    baris: [
      { id: 'h1', donaturNama: 'Budi Santosa', olehNama: 'Ahmad', fundraising: 'Tim Bantul Kota', status: 'diambil', jumlah: 150000, peruntukan: 'Zakat', tanggal: HARI, cocok: { sudah: false, ref: '' } },
      { id: 'h2', donaturNama: 'Andi Wijaya', olehNama: 'Ahmad', fundraising: 'Tim Bantul Kota', status: 'kosong', jumlah: 0, peruntukan: '', tanggal: HARI, cocok: { sudah: false, ref: '' } },
    ],
  },
  'cocok.daftar': {
    namaFundraising: 'Tim Bantul Kota', galatMain: '',
    ringkas: { totalFund: 150000, totalMain: 150000, selisih: 0, jumlahFund: 1, jumlahMain: 1, sudahCocok: 0, belumCocok: 1 },
    fund: [{ id: 'h1', donaturNama: 'Budi Santosa', peruntukan: 'Zakat', jumlah: 150000, tanggal: HARI, cocok: { sudah: false, ref: '' }, usul: { id: 'p1', noKwitansi: 'KW-001' } }],
    main: [{ id: 'p1', noKwitansi: 'KW-001', tanggal: HARI, nama: 'Budi Santosa', jumlah: 150000, jenisDana: 'Zakat', fundraising: 'Tim Bantul Kota' }],
  },
  'cocok.tandai': { pesan: 'Ditandai.' },
  'laporan.ringkas': {
    ringkas: { kunjungan: 40, berhasil: 33, kosong: 7, total: 7250000 },
    perPeruntukan: [{ nama: 'Zakat', jumlah: 5000000 }, { nama: 'Infak', jumlah: 2250000 }],
    perFundraiser: [{ nama: 'Tim Bantul Kota', jumlah: 7250000 }],
    perPetugas: [{ nama: 'Ahmad Maruf', jumlah: 7250000 }],
    perHari: [{ tanggal: HARI, jumlah: 350000 }],
  },
  'akun.ambil': { akun: { namaTampil: 'Ahmad Maruf', namaFundraising: 'Tim Bantul Kota', foto: '', telepon: '628129998888', catatan: '' } },
};

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/fund') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let t = '';
      try { t = JSON.parse(body).tindakan; } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...(JAWABAN[t] || {}) }));
    });
    return;
  }
  const nama = req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

/* Ubin tiruan abu terang — supaya area peta pada potret uji tidak tampak
   seperti kotak hitam yang rusak. Di produksi ubin OSM sungguhan yang dimuat. */
const PNG1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN48uIdVsQwtCQALESugXQ06fgAAAAASUVORK5CYII=', 'base64');

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(LUAR, { recursive: true });
  const b = await chromium.launch(CHROMIUM);

  let ok = 0, g = 0;
  const galat = [];
  const cek = (n, s, info) => { if (s) { ok++; console.log('  OK   |', n); } else { g++; console.log('  GAGAL|', n, info === undefined ? '' : JSON.stringify(info).slice(0, 200)); } };

  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => galat.push(String(e)));
  /* Leaflet, ubin, dan Nominatim dialihkan ke lokal supaya peta tergambar tanpa
     jaringan. Leaflet hanya dialihkan bila kebetulan ada di node_modules (mis.
     `npm i -D leaflet`); tanpa itu, peta jatuh ke isian koordinat manual dan
     uji menguji jalur cadangan itu — keduanya sah. */
  const leafletJs = path.join(AKAR, 'node_modules/leaflet/dist/leaflet.js');
  const adaLeaflet = fs.existsSync(leafletJs);
  if (adaLeaflet) {
    await p.route('**/leaflet@1.9.4/dist/leaflet.js', (r) => r.fulfill({ path: leafletJs, contentType: 'text/javascript' }));
    await p.route('**/leaflet@1.9.4/dist/leaflet.css', (r) => r.fulfill({ path: path.join(AKAR, 'node_modules/leaflet/dist/leaflet.css'), contentType: 'text/css' }));
  }
  await p.route('**tile.openstreetmap.org/**', (r) => r.fulfill({ body: PNG1x1, contentType: 'image/png' }));
  await p.route('**nominatim.openstreetmap.org/**', (r) => r.fulfill({ body: JSON.stringify({ display_name: 'Jl. Contoh, Bantul' }), contentType: 'application/json' }));

  await p.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); } catch (_) {} });
  await p.goto(A + '/fund.html');
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
  await p.waitForTimeout(400);

  console.log('=== A. RANGKA & MENU ===');
  const menu = await p.$$eval('.tn-item', (n) => n.map((x) => x.title));
  cek('enam menu tergambar', menu.length === 6, menu);
  cek('menu inti ada', ['Dashboard', 'Donatur', 'Penghimpunan', 'Cocokkan', 'Laporan', 'Pengaturan'].every((m) => menu.includes(m)), menu);
  /* Teksnya pendek supaya muat di bilah atas HP; keterangan panjangnya pindah
     ke title, bukan hilang. */
  const lenc = await p.$eval('#lencanaLingkup', (e) => ({ teks: e.textContent, judul: e.title }));
  cek('lencana cakupan data tampil & ringkas', /Semua fundraiser/i.test(lenc.teks) && lenc.teks.length < 20, lenc);
  cek('keterangan panjangnya tetap ada di title', /Koordinator/i.test(lenc.judul), lenc.judul);

  console.log('\n=== B. DASHBOARD: JADWAL & TOMBOL ALUR ===');
  const dash = await p.evaluate(() => ({
    kpi: document.querySelectorAll('.fund-kpi .kpi-v2').length,
    /* Struktur kartu harus SAMA dengan dasbor utama, bukan div polos yang mirip. */
    kpiLabel: document.querySelectorAll('.fund-kpi .kpi-v2-label').length,
    kpiIkon: document.querySelectorAll('.fund-kpi .kpi-v2-icon').length,
    kpiNilai: document.querySelectorAll('.fund-kpi .kpi-v2-value').length,
    baris: document.querySelectorAll('.jw-baris').length,
    diambil: document.querySelectorAll('[data-ambil]').length,
    reschedule: document.querySelectorAll('[data-reschedule]').length,
    kosong: document.querySelectorAll('[data-kosong]').length,
    sudahBadge: /✓ Rp/.test(document.querySelector('#isiHalaman').textContent),
    /* Kartu tidak bisa diklik, jadi tidak boleh berlagak bisa. */
    telunjuk: getComputedStyle(document.querySelector('.fund-kpi .kpi-v2')).cursor,
  }));
  cek('empat KPI', dash.kpi === 4, dash.kpi);
  cek('kartu KPI memakai struktur kartu dasbor utama (label+ikon+nilai)',
    dash.kpiLabel === 4 && dash.kpiIkon === 4 && dash.kpiNilai === 4, dash);
  cek('kartu ringkas tidak berlagak bisa diklik', dash.telunjuk === 'default', dash.telunjuk);
  cek('tiga baris jadwal', dash.baris === 3, dash.baris);
  /* Lencana status punya dua tempat (kepala untuk HP, kolom untuk layar lebar).
     Kalau keduanya terlihat sekaligus, statusnya tergambar dua kali. */
  const lencanaGanda = await p.evaluate(() => Array.from(document.querySelectorAll('.jw-baris'))
    .filter((r) => Array.from(r.querySelectorAll('.jw-status-hp, .jw-status-desk'))
      .filter((x) => x.getClientRects().length > 0).length > 1).length);
  cek('status tidak tergambar dua kali di layar lebar', lencanaGanda === 0, lencanaGanda);
  cek('donatur belum dikunjungi punya tombol Diambil/Reschedule/Kosong', dash.diambil === 1 && dash.reschedule === 1 && dash.kosong === 1, dash);
  cek('yang sudah diambil tampil bertanda nominal (bukan lenyap)', dash.sudahBadge, dash.sudahBadge);
  await p.screenshot({ path: path.join(LUAR, 'fund-dasbor.png') });

  // buka modal Diambil
  await p.click('[data-ambil]');
  await p.waitForTimeout(300);
  const modalAmbil = await p.evaluate(() => ({
    ada: document.getElementById('modalBg').classList.contains('show'),
    nominal: !!document.querySelector('[name=jumlah]'),
    peruntukan: !!document.querySelector('[name=peruntukan]'),
  }));
  cek('modal Diambil meminta nominal & peruntukan', modalAmbil.ada && modalAmbil.nominal && modalAmbil.peruntukan, modalAmbil);
  await p.fill('[name=jumlah]', '150000');
  await p.waitForTimeout(150);
  cek('nominal langsung diformat rupiah', /Rp\s?150\.000/.test(await p.$eval('#faHint', (e) => e.textContent)));
  await p.screenshot({ path: path.join(LUAR, 'fund-ambil.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  console.log('\n=== C. DONATUR: FORM + PETA ===');
  await p.evaluate(() => { location.hash = '#donatur'; });
  await p.waitForTimeout(600);
  cek('daftar donatur tergambar', (await p.$$('#isiHalaman tbody tr')).length === 3);
  await p.screenshot({ path: path.join(LUAR, 'fund-donatur.png') });

  await p.click('#tambahD');
  await p.waitForTimeout(700); // beri waktu Leaflet membangun peta
  const form = await p.evaluate(() => ({
    modal: document.getElementById('modalBg').classList.contains('show'),
    nama: !!document.querySelector('[name=nama]'),
    telp: !!document.querySelector('[name=telepon]'),
    lokSaya: !!document.getElementById('lokSaya'),
    peta: !!document.getElementById('peta'),
    /* Leaflet menjadikan elemen #peta ITU SENDIRI .leaflet-container dan
       menyuntik .leaflet-pane di dalamnya — bukan membuat anak .leaflet-container. */
    leafletHidup: !!(document.querySelector('#peta.leaflet-container') && document.querySelector('#peta .leaflet-pane')),
  }));
  cek('form donatur mewajibkan nama & telepon', form.nama && form.telp, form);
  cek('pemilih lokasi ada tombol "Lokasi saya"', form.lokSaya);
  if (adaLeaflet) {
    cek('peta Leaflet benar-benar terpasang', form.peta && form.leafletHidup, form);
  } else {
    /* Tanpa Leaflet lokal, jalur cadangan harus muncul: isian koordinat manual. */
    const manual = await p.evaluate(() => !!document.getElementById('lokLat') && !!document.getElementById('lokLng'));
    cek('tanpa Leaflet, jatuh ke isian koordinat manual (jalur cadangan)', manual, { form, manual });
  }
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(LUAR, 'fund-donatur-form.png') });

  // submit tanpa titik -> ditolak di sisi tampilan
  const sblmTitik = await p.evaluate(() => {
    document.querySelector('[name=nama]').value = 'Tes';
    document.querySelector('[name=telepon]').value = '08123456789';
    document.querySelector('#fd').requestSubmit();
    return document.getElementById('modalBg').classList.contains('show');
  });
  await p.waitForTimeout(200);
  cek('tanpa titik lokasi, form tidak tertutup (ditahan)', sblmTitik === true);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  console.log('\n=== D. PENGHIMPUNAN / COCOK / LAPORAN / AKUN ===');
  await p.evaluate(() => { location.hash = '#himpunan'; });
  await p.waitForTimeout(500);
  cek('penghimpunan menampilkan ringkasan total', /Rp\s?150\.000/.test(await p.$eval('#isiHalaman', (e) => e.textContent)));
  await p.screenshot({ path: path.join(LUAR, 'fund-himpunan.png') });

  await p.evaluate(() => { location.hash = '#cocok'; });
  await p.waitForTimeout(500);
  const cocok = await p.evaluate(() => ({
    kpi: document.querySelectorAll('.kpi-v2').length,
    usul: /usul: KW-001/.test(document.querySelector('#isiHalaman').textContent),
    tandai: !!document.querySelector('[data-tandai]'),
  }));
  cek('cocok menampilkan 4 KPI ringkas', cocok.kpi === 4, cocok.kpi);
  cek('usulan padanan buku utama tampil', cocok.usul, cocok.usul);
  cek('ada tombol tandai cocok', cocok.tandai);
  await p.screenshot({ path: path.join(LUAR, 'fund-cocok.png') });

  await p.evaluate(() => { location.hash = '#laporan'; });
  await p.waitForTimeout(500);
  cek('laporan menampilkan rekap per peruntukan', /Zakat/.test(await p.$eval('#isiHalaman', (e) => e.textContent)));
  await p.screenshot({ path: path.join(LUAR, 'fund-laporan.png') });

  await p.evaluate(() => { location.hash = '#akun'; });
  await p.waitForTimeout(500);
  cek('pengaturan memuat nama fundraising (kunci pencocokan)', /Tim Bantul Kota/.test(await p.$eval('#isiHalaman [name=namaFundraising]', (e) => e.value)));
  await p.screenshot({ path: path.join(LUAR, 'fund-akun.png') });

  console.log('\n=== E. TATA LETAK HP (tema terang, seperti web utama) ===');
  await ctx.close();
  const ctxHp = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const p2 = await ctxHp.newPage();
  p2.on('pageerror', (e) => galat.push(String(e)));
  await p2.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
  await p2.route('**tile.openstreetmap.org/**', (r) => r.fulfill({ body: PNG1x1, contentType: 'image/png' }));
  await p2.goto(A + '/fund.html');
  await p2.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
  await p2.waitForTimeout(600);

  const hp = await p2.evaluate(() => {
    const k = Array.from(document.querySelectorAll('.fund-kpi .kpi-v2'));
    const kiri = new Set(k.map((x) => Math.round(x.getBoundingClientRect().left)));
    const nilai = Array.from(document.querySelectorAll('.fund-kpi .kpi-v2-value'));
    return {
      luber: document.documentElement.scrollWidth <= window.innerWidth + 2,
      /* Dua kolom: empat kartu hanya boleh punya DUA posisi kiri yang berbeda. */
      kolom: kiri.size,
      /* Angka yang terpotong di tengah adalah keluhan utamanya — diperiksa
         dengan membandingkan lebar isi terhadap lebar kotaknya, bukan dengan mata. */
      nilaiTerpotong: nilai.filter((x) => x.scrollWidth > x.clientWidth + 1).length,
      kartuKeluar: k.filter((x) => x.getBoundingClientRect().right > window.innerWidth + 1).length,
      tombolSempit: Array.from(document.querySelectorAll('.jw-aksi .btn'))
        .filter((x) => x.getBoundingClientRect().height < 36).length,
      tombolKeluar: Array.from(document.querySelectorAll('.jw-aksi .btn'))
        .filter((x) => x.getBoundingClientRect().right > window.innerWidth + 1).length,
      terang: document.documentElement.getAttribute('data-theme'),
    };
  });
  cek('tema terang seperti web utama', hp.terang === 'light', hp.terang);
  cek('tidak meluber ke samping di layar HP', hp.luber, hp);
  cek('kartu ringkas jadi DUA kolom di HP (bukan empat berdesakan)', hp.kolom === 2, hp.kolom);
  cek('tidak ada angka yang terpotong di tengah', hp.nilaiTerpotong === 0, hp.nilaiTerpotong);
  cek('tidak ada kartu yang terdorong keluar layar', hp.kartuKeluar === 0, hp.kartuKeluar);
  cek('tombol aksi cukup tinggi untuk ibu jari (>=36px)', hp.tombolSempit === 0, hp.tombolSempit);
  cek('tidak ada tombol yang terpotong di tepi kanan', hp.tombolKeluar === 0, hp.tombolKeluar);
  await p2.screenshot({ path: path.join(LUAR, 'fund-hp.png'), fullPage: true });

  /* Tema gelap tetap harus waras — hanya tidak lagi dipakai sebagai potret utama. */
  await p2.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: path.join(LUAR, 'fund-hp-gelap.png') });
  await ctxHp.close();

  console.log('\n=== F. TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript sepanjang uji', galat.length === 0, galat.slice(0, 4));

  await b.close();
  server.close();
  console.log('\ntest_fund_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
