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
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
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
  'ambil.catat': { rec: { id: 'hx', donaturNama: 'Budi Santosa', jumlah: 150000, status: 'diambil', buku: { id: 'p1', noKwitansi: 'KW-001' } }, buku: { id: 'p1', noKwitansi: 'KW-001' }, pesan: 'Donasi Rp 150.000 dari Budi Santosa dicatat.' },
  'donatur.impor': { ringkas: { total: 3, baru: 2, ada: 1, galat: 0 }, pesan: '2 donatur ditambahkan.', disimpan: 2, baris: [
    { no: 1, nama: 'Hasan', alamat: 'Sewon', telepon: '6281270000001', jadwal: { tanggal: HARI, ulang: 'mingguan' }, status: 'baru', alasan: '' },
    { no: 2, nama: 'Laila', alamat: 'Pundong', telepon: '6281270000002', jadwal: null, status: 'baru', alasan: '' },
    { no: 3, nama: 'Umar', alamat: 'Imogiri', telepon: '6281270000003', jadwal: null, status: 'ada', alasan: 'Nomor ini sudah ada di daftar donatur' }] },
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
    ringkas: { totalFund: 350000, totalMain: 150000, selisih: 200000, jumlahFund: 3, jumlahMain: 1,
      sudahCocok: 1, belumCocok: 2, cocokOtomatis: 1, cocokManual: 0, siapOtomatis: 0 },
    fund: [
      { id: 'h1', donaturNama: 'Budi Santosa', peruntukan: 'Zakat', jumlah: 150000, tanggal: HARI,
        cocok: { sudah: false, ref: '' }, usul: { id: 'p1', noKwitansi: 'KW-001' }, alasan: '', alasanTeks: '' },
      { id: 'h2', donaturNama: 'Siti Aminah', peruntukan: 'Infak', jumlah: 100000, tanggal: HARI,
        cocok: { sudah: false, ref: '' }, usul: null,
        alasan: 'ganda', alasanTeks: 'Ada lebih dari satu kemungkinan, perlu diperiksa sendiri' },
      { id: 'h3', donaturNama: 'Joko Widodo', peruntukan: 'Zakat', jumlah: 100000, tanggal: HARI,
        cocok: { sudah: true, ref: 'KW-009', otomatis: true, oleh: 'Sistem' }, usul: null, alasan: 'sudah', alasanTeks: '' },
    ],
    main: [{ id: 'p1', noKwitansi: 'KW-001', tanggal: HARI, nama: 'Budi Santosa', jumlah: 150000, jenisDana: 'Zakat', fundraising: 'Tim Bantul Kota' }],
  },
  'cocok.tandai': { pesan: 'Ditandai.' },
  'cocok.otomatis': { ditandai: 0, sisa: 1, pesan: 'Tidak ada yang cocok persis.' },
  'cocok.batalOtomatis': { dibatalkan: 1, pesan: '1 penandaan otomatis dibatalkan.' },
  /* Daftar fundraiser: sengaja memuat ketiga keadaan yang bentuknya berbeda di
     layar — yang sudah menyetor dan semuanya cocok, yang punya sisa belum
     cocok, dan akun yang dibuatkan tetapi belum jalan sama sekali. */
  'fundraiser.daftar': {
    galatUsers: '',
    ringkas: { orang: 3, aktif: 3, belumMenyetor: 1, total: 850000, sudahCocok: 3, belumCocok: 1, nilaiBelumCocok: 200000 },
    baris: [
      { userId: 'u_slamet', nama: 'Slamet Riyadi', username: 'slamet', namaFundraising: 'Tim Bantul Kota',
        foto: '', telepon: '', peran: 'staff', aktif: true, dicentang: true, punyaAkun: true,
        kunjungan: 5, berhasil: 4, kosong: 1, total: 650000, sudahCocok: 3, cocokOtomatis: 2, cocokManual: 1,
        belumCocok: 1, nilaiBelumCocok: 200000, terakhir: HARI },
      { userId: 'u_rina', nama: 'Rina Wati', username: 'rina', namaFundraising: 'Tim Sewon',
        foto: '', telepon: '', peran: 'staff', aktif: true, dicentang: true, punyaAkun: true,
        kunjungan: 2, berhasil: 2, kosong: 0, total: 200000, sudahCocok: 0, cocokOtomatis: 0, cocokManual: 0,
        belumCocok: 0, nilaiBelumCocok: 0, terakhir: HARI },
      { userId: 'u_baru', nama: 'Fundraiser Baru', username: 'baru', namaFundraising: 'Fundraiser Baru',
        foto: '', telepon: '', peran: 'staff', aktif: true, dicentang: true, punyaAkun: true,
        kunjungan: 0, berhasil: 0, kosong: 0, total: 0, sudahCocok: 0, cocokOtomatis: 0, cocokManual: 0,
        belumCocok: 0, nilaiBelumCocok: 0, terakhir: '' },
    ],
  },
  'fundraiser.detail': {
    fundraiser: { userId: 'u_slamet', nama: 'Slamet Riyadi', username: 'slamet',
      namaFundraising: 'Tim Bantul Kota', foto: '', telepon: '628120001111', catatanProfil: '',
      aktif: true, punyaAkun: true, kunjungan: 5, berhasil: 4, kosong: 1, total: 650000,
      sudahCocok: 3, cocokOtomatis: 2, cocokManual: 1, belumCocok: 1, nilaiBelumCocok: 200000, terakhir: HARI },
    baris: [
      { id: 'h9', tanggal: HARI, donaturNama: 'Budi Santosa', peruntukan: 'Zakat', jumlah: 250000,
        status: 'diambil', cocok: { sudah: true, ref: 'KW-001', otomatis: true, oleh: 'Sistem' } },
      { id: 'h8', tanggal: HARI, donaturNama: 'Siti Aminah', peruntukan: 'Infak', jumlah: 200000,
        status: 'diambil', cocok: { sudah: false, ref: '', otomatis: false, oleh: '' } },
      { id: 'h7', tanggal: HARI, donaturNama: 'Joko Widodo', peruntukan: 'Zakat', jumlah: 200000,
        status: 'diambil', cocok: { sudah: true, ref: 'KW-002', otomatis: false, oleh: 'Ahmad Maruf' } },
    ],
  },
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
  if (req.method === 'POST' && req.url === '/api/ocr') {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: { terbaca: true, isi: { jumlah: 250000, jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Pendidikan', metode: 'Transfer', namaDonatur: 'Budi Santosa', noKwitansi: 'K-77' }, raguRagu: ['pilar'] } }));
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/rpc') {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: { data: { id: 'p1', noKwitansi: 'KW-001', namaDonatur: 'Budi Santosa', telepon: '081211112222', jumlah: 150000, tanggal: HARI, jenis: 'Infak', subJenis: 'Infak Terikat', keterangan: 'Kesehatan', alamat: 'Bantul' }, settings: {}, linkDonatur: '' } }));
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
  } else {
    /* Tanpa Leaflet lokal, yang diuji adalah jalur cadangan. Unpkg HARUS
       diblokir di sini: dulu uji ini diam-diam mengandalkan komputer yang tidak
       punya internet. Di komputer yang online, Leaflet asli termuat dari CDN,
       peta tampil normal, dan pemeriksaan jalur cadangan gagal padahal
       aplikasinya benar (terjadi 30 September 2026). */
    await p.route('**/leaflet@1.9.4/**', (r) => r.abort());
  }
  await p.route('**tile.openstreetmap.org/**', (r) => r.fulfill({ body: PNG1x1, contentType: 'image/png' }));
  await p.route('**nominatim.openstreetmap.org/**', (r) => r.fulfill({ body: JSON.stringify({ display_name: 'Jl. Contoh, Bantul' }), contentType: 'application/json' }));

  await p.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); } catch (_) {} });
  await p.goto(A + '/fund.html');
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
  await p.waitForTimeout(400);

  console.log('=== A. RANGKA & MENU ===');
  const menu = await p.$$eval('.tn-item', (n) => n.map((x) => x.title));
  cek('tujuh menu tergambar untuk pengawas', menu.length === 7, menu);
  cek('menu inti ada', ['Dashboard', 'Donatur', 'Penghimpunan', 'Cocokkan', 'Laporan', 'Pengaturan'].every((m) => menu.includes(m)), menu);
  /* Halaman Fundraiser hanya untuk koordinator dan superadmin. Yang
     menegakkannya server (wajibLihatSemua di api/fund.js); menu di sini cuma
     supaya tidak ada yang menekan pintu yang memang terkunci. */
  cek('pengawas melihat menu Fundraiser', menu.includes('Fundraiser'), menu);
  /* Teksnya pendek supaya muat di bilah atas HP; keterangan panjangnya pindah
     ke title, bukan hilang. */
  const lenc = await p.$eval('#lencanaLingkup', (e) => ({ teks: e.textContent, judul: e.title }));
  cek('lencana cakupan data tampil & ringkas', /Semua fundraiser/i.test(lenc.teks) && lenc.teks.length < 20, lenc);
  cek('keterangan panjangnya tetap ada di title', /Koordinator/i.test(lenc.judul), lenc.judul);
  /* Lencana ini dulu .badge polos di kolom yang meregang: pil selebar bilah
     menu, teks menempel di kiri, tinggi beberapa piksel. Yang diperiksa di
     sini bukan warnanya, melainkan bahwa ia punya tinggi yang wajar dan
     teksnya tidak terpotong. */
  const bentukLenc = await p.evaluate(() => {
    const e = document.getElementById('lencanaLingkup');
    const t = e.querySelector('.lingkup-teks');
    return {
      tinggi: Math.round(e.getBoundingClientRect().height),
      adaIkon: !!e.querySelector('svg'),
      terpotong: t ? t.scrollWidth > t.clientWidth + 1 : true,
      keluar: e.getBoundingClientRect().right > document.querySelector('.topnav').getBoundingClientRect().right + 1,
    };
  });
  cek('lencana cakupan punya tinggi yang wajar', bentukLenc.tinggi >= 28, bentukLenc.tinggi);
  cek('lencana cakupan berikon', bentukLenc.adaIkon);
  cek('teks lencana tidak terpotong', !bentukLenc.terpotong, bentukLenc);
  cek('lencana tidak melewati tepi bilah menu', !bentukLenc.keluar, bentukLenc);

  /* Dikuncupkan, ikonnya harus tetap terlihat dan labelnya menyingkir — bukan
     tulisan yang terpotong di tengah kata. */
  await p.evaluate(() => document.getElementById('appView').classList.add('collapsed'));
  await p.waitForTimeout(350);
  const lencKuncup = await p.evaluate(() => {
    const e = document.getElementById('lencanaLingkup');
    const t = e.querySelector('.lingkup-teks');
    return {
      ikonTampil: !!e.querySelector('svg') && e.getBoundingClientRect().width > 10,
      teksSembunyi: t ? getComputedStyle(t).display === 'none' : false,
      keluar: e.getBoundingClientRect().right > document.querySelector('.topnav').getBoundingClientRect().right + 1,
    };
  });
  cek('saat bilah menu dikuncupkan, ikon lencana tetap ada', lencKuncup.ikonTampil, lencKuncup);
  cek('labelnya menyingkir, bukan terpotong di tengah kata', lencKuncup.teksSembunyi, lencKuncup);
  cek('lencana tetap di dalam bilah saat dikuncupkan', !lencKuncup.keluar, lencKuncup);
  await p.evaluate(() => document.getElementById('appView').classList.remove('collapsed'));
  await p.waitForTimeout(300);

  /* Tombol tema: ikon lama (lingkaran separuh terisi) berwarna var(--text2) di
     atas putih — nyaris tak terlihat dan tidak memberi tahu apa-apa. */
  const tema = await p.evaluate(() => {
    const b = document.getElementById('tombolTema');
    const svg = b.querySelector('svg');
    const bentuk = svg ? svg.querySelectorAll('path, circle') : [];
    const kotak = svg ? svg.getBoundingClientRect() : null;
    const g = getComputedStyle(b);
    return {
      ada: !!b, judul: b.title,
      adaSvg: !!svg,
      bentuk: bentuk.length,
      /* Bentuk PADAT, bukan cuma garis tipis: kalau semuanya fill="none",
         yang tergambar cuma kotak putih kosong — persis keluhannya. */
      adaIsian: Array.from(bentuk).some((x) => (x.getAttribute('fill') || '') === 'currentColor'),
      lebarIkon: kotak ? Math.round(kotak.width) : 0,
      warna: g.color,
      latar: g.backgroundColor,
    };
  });
  cek('tombol tema menjelaskan tema tujuannya', /Ganti ke tema gelap/i.test(tema.judul), tema.judul);
  cek('ikonnya benar-benar tergambar, bukan kotak kosong',
    tema.adaSvg && tema.bentuk > 0 && tema.lebarIkon >= 14, tema);
  cek('bentuknya padat, tidak bergantung garis tipis saja', tema.adaIsian, tema);
  /* Warna ikon dan warna latar tombol tidak boleh sama — itulah definisi
     "blank putih" yang dilaporkan. */
  cek('warna ikon berbeda dari latar tombolnya', tema.warna !== tema.latar, tema);
  await p.click('#tombolTema');
  await p.waitForTimeout(250);
  const temaSesudah = await p.evaluate(() => ({
    tema: document.documentElement.getAttribute('data-theme'),
    judul: document.getElementById('tombolTema').title,
  }));
  cek('menekan tombol tema benar-benar mengganti tema', temaSesudah.tema === 'dark', temaSesudah);
  cek('ikon & keterangannya ikut berganti saat itu juga',
    /Ganti ke tema terang/i.test(temaSesudah.judul), temaSesudah.judul);
  await p.click('#tombolTema');
  await p.waitForTimeout(250);

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
  /* Yang dibutuhkan petugas di lapangan adalah BELOKAN, bukan gambar peta.
     Tautannya harus ke rute Google Maps, bukan ke OpenStreetMap. */
  const rute = await p.evaluate(() => {
    const a = document.querySelector('.jw-peta');
    return a ? { url: a.href, teks: a.textContent.trim(), ikon: !!a.querySelector('svg') } : null;
  });
  cek('tautan lokasi membuka rute Google Maps',
    rute && /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/.test(rute.url), rute);
  cek('koordinat donatur ikut sebagai tujuan',
    rute && rute.url.includes(encodeURIComponent('-7.8879,110.3288')), rute && rute.url);
  cek('labelnya "Rute", bukan "peta"', rute && rute.teks === 'Rute', rute && rute.teks);
  cek('ikonnya panah arah, bukan lembaran peta', rute && rute.ikon, rute);
  cek('tidak tergambar bergaris bawah di antara tombol lain',
    (await p.$eval('.jw-peta', (e) => getComputedStyle(e).textDecorationLine)) === 'none');
  cek('yang sudah diambil tampil bertanda nominal (bukan lenyap)', dash.sudahBadge, dash.sudahBadge);
  await p.screenshot({ path: path.join(LUAR, 'fund-dasbor.png') });

  // buka modal Diambil
  await p.click('[data-ambil]');
  await p.waitForTimeout(300);
  const modalAmbil = await p.evaluate(() => ({
    ada: document.getElementById('modalBg').classList.contains('show'),
    nominal: !!document.querySelector('[name=jumlah]'),
    peruntukan: !!document.getElementById('faJenis') && !!document.getElementById('faSub'),
  }));
  cek('modal Diambil meminta nominal & peruntukan', modalAmbil.ada && modalAmbil.nominal && modalAmbil.peruntukan, modalAmbil);
  await p.fill('[name=jumlah]', '150000');
  await p.waitForTimeout(150);
  cek('nominal langsung diformat rupiah', /Rp\s?150\.000/.test(await p.$eval('#faHint', (e) => e.textContent)));
  /* Baca kwitansi (OCR): isian terisi dari foto, ditandai, pilar ragu bertanda kuning */
  const GAMBAR = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('#faBerkas', { name: 'kw.png', mimeType: 'image/png', buffer: GAMBAR });
  await p.waitForFunction(() => /terbaca/.test((document.getElementById('faBacaInfo') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const ocrHasil = await p.evaluate(() => ({ jumlah: document.querySelector('[name=jumlah]').value, jenis: document.getElementById('faJenis').value, sub: document.getElementById('faSub').value, pilar: document.getElementById('faPilar').value, metode: document.querySelector('[name=metode]').value, catatan: document.querySelector('[name=catatan]').value, hijau: document.querySelectorAll('#modalBody .field.fa-ai').length, ragu: document.querySelectorAll('#modalBody .field.fa-ragu').length, info: document.getElementById('faBacaInfo').textContent }));
  cek('baca kwitansi mengisi nominal, jenis, detail, pilar, metode', /250/.test(ocrHasil.jumlah) && ocrHasil.jenis === 'Infak' && ocrHasil.sub === 'Infak Terikat' && ocrHasil.pilar === 'Pendidikan' && ocrHasil.metode === 'Transfer', ocrHasil);
  cek('isian hasil bacaan ditandai dan yang ragu berbeda', ocrHasil.hijau >= 5 && ocrHasil.ragu === 1 && /terbaca/.test(ocrHasil.info), ocrHasil);
  const setSel = (id, v) => p.evaluate(([i, x]) => { const e = document.getElementById(i); e.value = x; e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  await setSel('faJenis', 'Infak');
  const jenisOpsi = await p.$$eval('#faSub option', (o) => o.map((x) => x.textContent));
  cek('pilihan Infak Umum dan Infak Terikat ada', jenisOpsi.some((x) => /Umum/.test(x)) && jenisOpsi.some((x) => /Terikat/.test(x)), jenisOpsi);
  await setSel('faSub', 'Infak Terikat');
  await p.waitForTimeout(150);
  const pilarOpsi = await p.evaluate(() => { const w = document.getElementById('faPilarWrap'); return { tampil: !!w && getComputedStyle(w).display !== 'none' && w.offsetHeight > 0, n: document.querySelectorAll('#faPilar option').length }; });
  cek('pilar muncul saat Infak Terikat dipilih', pilarOpsi.tampil && pilarOpsi.n >= 7, pilarOpsi);
  await p.screenshot({ path: path.join(LUAR, 'fund-ambil.png') });
  await setSel('faPilar', 'Kesehatan');
  await p.click('#faSimpan');
  await p.waitForSelector('#kwKirim', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  const kw = await p.evaluate(() => {
    const r = ['kwTidak', 'kwCetak', 'kwKirim'].map((i) => { const e = document.getElementById(i); return e ? e.getBoundingClientRect() : null; });
    return { ada: r.every(Boolean), sejajar: r.every(Boolean) && r.every((x) => Math.abs(x.top - r[0].top) < 4), dalam: r.every((x) => x && x.right <= innerWidth + 1 && x.left >= 0), ucapan: (document.getElementById('kwTeks') || {}).value || '', gambar: !!(document.getElementById('kwPrev') || {}).src };
  });
  cek('popup kwitansi muncul dengan tiga tombol sejajar', kw.ada && kw.sejajar && kw.dalam, kw);
  cek('ada ucapan terima kasih siap kirim', /terima kasih|syukron|jaza/i.test(kw.ucapan), kw.ucapan.slice(0, 80));
  await p.screenshot({ path: path.join(LUAR, 'fund-kwitansi.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  console.log('\n=== B2. PINTASAN TAMBAH DONATUR DI DASBOR ===');
  const pintas = await p.evaluate(() => {
    const b = document.getElementById('pintasDonatur');
    const t = document.getElementById('tombolTema');
    if (!b || !t) return null;
    const rb = b.getBoundingClientRect(); const rt = t.getBoundingClientRect();
    return {
      teks: b.textContent.trim(), ikon: !!b.querySelector('svg'),
      diKiriTema: rb.right <= rt.left + 1,
      sebaris: Math.abs((rb.top + rb.height / 2) - (rt.top + rt.height / 2)) < 6,
      diDalamLayar: rb.right <= window.innerWidth + 1,
    };
  });
  cek('pintasan tambah donatur ada di kepala dasbor', pintas !== null, pintas);
  cek('letaknya di sebelah KIRI ikon tema', pintas && pintas.diKiriTema, pintas);
  cek('sejajar sebaris dengan ikon tema', pintas && pintas.sebaris, pintas);
  cek('berlabel dan berikon', pintas && /Tambah Donatur/i.test(pintas.teks) && pintas.ikon, pintas);
  cek('tidak terdorong keluar layar', pintas && pintas.diDalamLayar, pintas);

  await p.click('#pintasDonatur');
  await p.waitForTimeout(600);
  const dariPintas = await p.evaluate(() => ({
    modal: document.getElementById('modalBg').classList.contains('show'),
    judul: (document.getElementById('modalTitle') || {}).textContent || '',
    nama: !!document.querySelector('[name=nama]'),
  }));
  cek('pintasan membuka formulir donatur baru',
    dariPintas.modal && /Donatur baru/i.test(dariPintas.judul) && dariPintas.nama, dariPintas);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  /* Menutup formulirnya harus mengembalikan DASBOR, bukan berpindah diam-diam
     ke daftar donatur — formulir ini dipakai dua halaman sekarang. */
  cek('menutup formulir tidak memindahkan halaman',
    (await p.$$('.jw-baris')).length === 3, (await p.$$('.jw-baris')).length);
  await p.screenshot({ path: path.join(LUAR, 'fund-pintasan.png') });

  console.log('\n=== C. DONATUR: FORM + PETA ===');
  await p.evaluate(() => { location.hash = '#donatur'; });
  await p.waitForTimeout(600);
  cek('daftar donatur tergambar', (await p.$$('#isiHalaman tbody tr')).length === 3);
  await p.screenshot({ path: path.join(LUAR, 'fund-donatur.png') });

  await p.click('#imporD');
  await p.waitForSelector('#idTeks', { timeout: 4000 });
  await p.fill('#idTeks', 'Hasan, Sewon, 0812 7000 0001, setiap Senin');
  await p.click('#idPeriksa');
  await p.waitForSelector('#idHasil table', { timeout: 4000 }).catch(() => {});
  const imp = await p.evaluate(() => ({ baris: document.querySelectorAll('#idHasil tbody tr').length, simpan: document.getElementById('idSimpan').textContent, aktif: !document.getElementById('idSimpan').disabled }));
  cek('impor: pratinjau tampil dan tombol simpan menyebut jumlah', imp.baris === 3 && imp.aktif && /Simpan 2 donatur/.test(imp.simpan), imp);
  await p.screenshot({ path: path.join(LUAR, 'fund-impor.png') });
  await p.click('#idSimpan');
  await p.waitForTimeout(500);
  cek('impor: dialog menutup setelah simpan', !(await p.$('#idTeks')));
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
  /* Jembatan Google Maps -> pemilih lokasi. Nominatim kalah jauh untuk NAMA
     TEMPAT (masjid, warung, sekolah), dan patokan itulah yang dipakai petugas.
     Jadi tempatnya dicari di Google Maps, koordinatnya disalin, ditempel ke
     sini. Tiga bentuk tempelan harus dimengerti. */
  const bentukTempelan = [
    { nama: 'koordinat polos', teks: '-7.85001, 110.40002', lat: '-7.85001' },
    { nama: 'tautan Google Maps (@lat,lng)', teks: 'https://www.google.com/maps/place/Masjid/@-7.86003,110.41004,18z', lat: '-7.86003' },
    { nama: 'tautan berbagi (?q=lat,lng)', teks: 'https://maps.google.com/?q=-7.87005,110.42006', lat: '-7.87005' },
  ];
  for (const b of bentukTempelan) {
    await p.fill('#lokCari', '');
    await p.fill('#lokCari', b.teks);
    await p.waitForTimeout(350);
    const hasil = await p.evaluate(() => ({
      koor: document.getElementById('lokKoor').textContent,
      kotakCari: document.getElementById('lokCari').value,
      gmaps: (document.getElementById('lokGmaps') || {}).href || '',
    }));
    cek(`titik dari ${b.nama} langsung dipakai`, hasil.koor.includes(b.lat), hasil);
    cek(`kotak pencarian dikosongkan setelah ${b.nama} dipakai`, hasil.kotakCari === '', hasil.kotakCari);
    cek(`tautan Google Maps ikut menunjuk titik ${b.nama}`, hasil.gmaps.includes(b.lat), hasil.gmaps);
  }
  /* Teks biasa TIDAK boleh disalahartikan sebagai koordinat. */
  await p.fill('#lokCari', 'Masjid Agung Bantul');
  await p.waitForTimeout(250);
  cek('nama tempat tetap diperlakukan sebagai pencarian, bukan koordinat',
    (await p.$eval('#lokCari', (e) => e.value)) === 'Masjid Agung Bantul');
  await p.fill('#lokCari', '');

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

  console.log('\n=== E2. HALAMAN FUNDRAISER ===');
  /* Pertanyaan yang halaman ini harus jawab dalam sekali lihat: siapa
     mengumpulkan berapa, dan berapa uang yang BELUM bisa dipertanggungjawabkan
     ke buku kas. Angka kedua itu yang ditaruh menonjol, bukan totalnya. */
  await p.evaluate(() => { location.hash = '#fundraiser'; });
  await p.waitForTimeout(800);
  const fr = await p.evaluate(() => {
    const baris = Array.from(document.querySelectorAll('#isi [data-buka]'));
    return {
      jumlahBaris: baris.length,
      isi: baris.map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      kpi: Array.from(document.querySelectorAll('#isi .kpi-v2')).map((k) => k.textContent.replace(/\s+/g, ' ').trim()),
      adaRentang: Boolean(document.getElementById('rtFund_btn')),
      kotakTanggalLama: document.querySelectorAll('#isi input[type=date]').length,
    };
  });
  cek('tiga fundraiser tergambar', fr.jumlahBaris === 3, fr.jumlahBaris);
  cek('akun yang belum pernah menyetor tetap terlihat',
    fr.isi.some((t) => /Fundraiser Baru/.test(t)), fr.isi);
  cek('rupiah yang belum cocok ditampilkan, bukan cuma jumlah barisnya',
    fr.kpi.some((t) => /Belum cocok/.test(t) && /200\.000/.test(t)), fr.kpi);
  cek('penyaring tanggalnya satu tombol rentang, bukan dua kotak terpisah',
    fr.adaRentang === true && fr.kotakTanggalLama === 0, fr);

  await p.click('#isi [data-buka="u_slamet"]');
  await p.waitForTimeout(700);
  const rinci = await p.evaluate(() => {
    const w = document.getElementById('rincianF');
    const lencana = Array.from(w.querySelectorAll('.badge')).map((b) => b.textContent.trim());
    return {
      ada: Boolean(w && w.textContent.trim()),
      baris: w.querySelectorAll('tbody tr').length,
      teks: w.textContent.replace(/\s+/g, ' ').trim(),
      lencana,
      adaTutup: Boolean(document.getElementById('tutupF')),
    };
  });
  cek('mengklik satu fundraiser memperlihatkan transaksinya', rinci.baris === 3, rinci.baris);
  cek('namanya muncul di kepala rincian', /Slamet Riyadi/.test(rinci.teks), rinci.teks.slice(0, 120));
  /* INI YANG PALING PENTING DI HALAMAN INI. Hasil sistem harus bisa dikenali
     sekilas dari hasil petugas: kalau suatu saat aturan pencocokannya keliru,
     yang perlu diperiksa ulang adalah yang bercap otomatis. */
  cek('cocok otomatis dibedakan dari cocok yang ditandai petugas',
    rinci.lencana.some((t) => /otomatis/.test(t)) && rinci.lencana.some((t) => /KW-002/.test(t)),
    rinci.lencana);
  cek('yang belum cocok tetap terlihat sebagai belum',
    rinci.lencana.some((t) => /^belum$/.test(t)), rinci.lencana);
  cek('ada tombol menutup rinciannya', rinci.adaTutup === true);
  await p.screenshot({ path: path.join(LUAR, 'fund-fundraiser.png'), fullPage: true });

  console.log('\n=== E2b. PEMILIH RENTANG TANGGAL ===');
  /* Dua kotak tanggal terpisah memaksa orang menghitung sendiri "tanggal
     berapa tujuh hari lalu", lalu membuka dua kalender, dan tidak ada satu pun
     layar yang memperlihatkan rentang yang sedang dipilih sebagai satu
     kesatuan. Yang diperiksa di sini: pilihan cepatnya ada, dan klik awal lalu
     klik akhir benar-benar menghasilkan rentang. */
  await p.click('#rtFund_btn');
  await p.waitForTimeout(400);
  const kal = await p.evaluate(() => {
    const pop = document.querySelector('.rt-pop:not(.hidden)');
    return {
      terbuka: Boolean(pop),
      chip: pop ? Array.from(pop.querySelectorAll('.rt-chip')).map((c) => c.textContent.trim()) : [],
      jumlahHari: pop ? pop.querySelectorAll('.rt-sel').length : 0,
      info: pop ? (pop.querySelector('.rt-info') || {}).textContent || '' : '',
      adaSemua: pop ? Boolean(pop.querySelector('[data-hapus]')) : false,
      adaSelesai: pop ? Boolean(pop.querySelector('[data-terap]')) : false,
    };
  });
  cek('kalendernya terbuka', kal.terbuka === true);
  cek('pilihan cepat Hari ini, 3 hari, dan 7 hari tersedia',
    ['Hari ini', '3 hari', '7 hari'].every((x) => kal.chip.includes(x)), kal.chip);
  cek('pilihan rentang panjang tetap ada',
    ['30 hari', 'Bulan ini', 'Bulan lalu', 'Tahun ini'].every((x) => kal.chip.includes(x)), kal.chip);
  cek('sebulan penuh tergambar', kal.jumlahHari >= 28 && kal.jumlahHari <= 31, kal.jumlahHari);
  cek('diminta mengklik tanggal AWAL lebih dulu', /tanggal awal/i.test(kal.info), kal.info);
  cek('ada tombol "Semua" untuk melepas penyaringnya', kal.adaSemua === true);
  cek('dan tombol Selesai', kal.adaSelesai === true);

  /* Klik awal lalu klik akhir. Di antara keduanya, rentangnya harus sudah
     terlihat sebagai pita — itu yang membuat orang tahu ia sedang memilih
     rentang, bukan satu tanggal. */
  const hasilRentang = await p.evaluate(async () => {
    const pop = document.querySelector('.rt-pop:not(.hidden)');
    const sel = Array.from(pop.querySelectorAll('.rt-sel'));
    const awal = sel[4], akhir = sel[9];
    awal.click();
    const sesudahAwal = {
      info: (pop.querySelector('.rt-info') || {}).textContent || '',
      ujung: pop.querySelectorAll('.rt-sel.ujung').length,
    };
    akhir.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const pita = pop.querySelectorAll('.rt-sel.dalam').length;
    akhir.click();
    /* Ditunggu sampai tulisannya muncul (paling lama 5 detik), bukan jeda
       tetap 400 ms: di komputer pemilik yang sedang menjalankan uji lain,
       tombolnya masih kosong setelah 400 ms dan uji gagal palsu. */
    for (let i = 0; i < 100; i++) {
      const t = (document.getElementById('rtFund_teks') || {}).textContent || '';
      if (/\u2013/.test(t) && !document.querySelector('.rt-pop:not(.hidden)')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return {
      sesudahAwal, pita,
      teksTombol: (document.getElementById('rtFund_teks') || {}).textContent || '',
      tertutup: !document.querySelector('.rt-pop:not(.hidden)'),
    };
  });
  cek('sesudah klik pertama, diminta mengklik tanggal AKHIR',
    /tanggal akhir/i.test(hasilRentang.sesudahAwal.info), hasilRentang.sesudahAwal.info);
  cek('rentangnya terlihat sebagai pita sebelum klik kedua',
    hasilRentang.pita === 4, hasilRentang.pita);
  cek('klik kedua menutup kalender dan menuliskan rentangnya di tombol',
    hasilRentang.tertutup === true && /\u2013/.test(hasilRentang.teksTombol),
    hasilRentang);

  /* Pilihan cepat harus benar-benar menyaring, bukan cuma mengubah tulisan. */
  await p.click('#rtFund_btn');
  await p.waitForTimeout(300);
  const cepat = await p.evaluate(async () => {
    const pop = document.querySelector('.rt-pop:not(.hidden)');
    const chip = Array.from(pop.querySelectorAll('.rt-chip')).find((c) => c.textContent.trim() === '7 hari');
    chip.click();
    await new Promise((r) => setTimeout(r, 500));
    return (document.getElementById('rtFund_teks') || {}).textContent || '';
  });
  cek('pilihan cepat 7 hari mengisi rentangnya', /\u2013/.test(cepat), cepat);

  console.log('\n=== E3. ALASAN BELUM COCOK ===');
  await p.evaluate(() => { location.hash = '#cocok'; });
  await p.waitForTimeout(800);
  const ck = await p.evaluate(() => {
    const tubuh = document.querySelector('#isi tbody');
    return {
      teks: tubuh ? tubuh.textContent.replace(/\s+/g, ' ').trim() : '',
      adaPenyaring: Boolean(document.getElementById('fundraiserC')),
      adaBatalOto: Boolean(document.getElementById('batalOto')),
      lencana: Array.from(document.querySelectorAll('#isi tbody .badge')).map((b) => b.textContent.trim()),
    };
  });
  /* Daftar "belum cocok" tanpa sebab cuma memindahkan pekerjaan menebak dari
     mesin ke petugas. */
  cek('yang belum cocok menyebutkan ALASANNYA',
    /lebih dari satu kemungkinan/i.test(ck.teks), ck.teks.slice(0, 200));
  cek('penyaring per fundraiser tersedia untuk pengawas', ck.adaPenyaring === true);
  cek('ada tombol membatalkan pencocokan otomatis saja', ck.adaBatalOto === true);
  cek('baris yang dicocokkan sistem bercap otomatis',
    ck.lencana.some((t) => /otomatis/.test(t)), ck.lencana);

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
