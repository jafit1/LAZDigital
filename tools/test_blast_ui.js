/* Uji tampilan halaman Broadcast: apakah benar-benar senada dengan LAZDigital.

   Yang diuji bukan datanya (itu di test_blast.js dan test_agen.js), melainkan
   hal-hal yang membuat sebuah halaman terasa nyempil: huruf yang beda, latar
   yang beda, dropdown bawaan browser di tengah dropdown kustom, tema gelap
   yang tidak ikut berpindah, dan halaman yang melebar di layar HP.

   Datanya dipalsukan semua — server tiruan menjawab /api/blast apa adanya,
   supaya kesebelas halaman bisa digambar tanpa Redis dan tanpa login.

   jalankan:  node tools/test_blast_ui.js
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
/* Playwright dicari di beberapa tempat supaya uji ini bisa dijalankan di
   komputer sendiri, bukan cuma di lingkungan tempat ia ditulis. */
function muatPlaywright() {
  for (const jalur of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(jalur); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang. Jalankan dulu:\n'
    + '  npm i -D playwright\n  npx playwright install chromium\n');
  process.exit(2);
}
const { chromium } = muatPlaywright();

/* Di lingkungan tertentu Chromium sudah tersedia di tempat tetap; kalau tidak
   ada, biarkan Playwright memakai yang ia pasang sendiri. */
const CHROMIUM = require('fs').existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: '/opt/pw-browsers/chromium' } : {};

const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');

let ok = 0, g = 0;
const cek = (n, c, i) => { if (c) { ok++; console.log('  OK   |', n); } else { g++; console.log('  GAGAL|', n, i === undefined ? '' : JSON.stringify(i).slice(0, 320)); } };

/* ---------- data palsu secukupnya untuk menggambar tiap halaman ---------- */
const PENGGUNA = { id: 'u1', nama: 'Superadmin', username: 'superadmin', peran: 'superadmin', kantor: '' };
const IZIN = ['*'];
const PERANGKAT = [
  { id: 'p1', nama: 'HP Kantor', nomor: '628111000111', driver: 'mandiri', status: 'tersambung', aktif: true, terpakaiHariIni: 12, diperiksa: new Date().toISOString() },
  { id: 'p2', nama: 'HP Cadangan', nomor: '', driver: 'mandiri', status: 'terputus', aktif: true, terpakaiHariIni: 0 },
];
const PESAN = [
  { id: 'm1', nomor: '628111222333', nama: 'Budi', status: 'terkirim', arah: 'keluar', isi: { teks: 'Terima kasih' }, dibuat: new Date().toISOString() },
  { id: 'm2', nomor: '628444555666', nama: 'Siti', status: 'diserahkan', arah: 'keluar', isi: { teks: 'Halo' }, dibuat: new Date().toISOString() },
  { id: 'm3', nomor: '628777888999', nama: 'Ani', status: 'gagal', arah: 'keluar', isi: { teks: 'Coba' }, galatTerakhir: 'Nomor tidak terdaftar', dibuat: new Date().toISOString() },
];
const SEGMEN = [
  { kode: 'donatur-rutin', label: 'Donatur rutin' },
  { kode: 'simpatisan', label: 'Simpatisan belum berdonasi' },
  { kode: 'mustahik', label: 'Mustahik binaan' },
];
const GRUP = [{ nama: 'Panitia Qurban', jumlah: 2 }, { nama: 'Pengurus Harian', jumlah: 1 }];
const KONTAK = [
  { id: 'k1', nama: 'Budi Santosa', nomor: '628111222333', segmen: ['donatur-rutin'], label: ['Pengurus Harian', 'Panitia Qurban'], langganan: true, daftarHitam: false, kantor: 'KLL Sewon' },
  { id: 'k2', nama: 'Siti Aminah', nomor: '628444555666', segmen: ['simpatisan'], label: ['Panitia Qurban'], langganan: true, daftarHitam: false, kantor: '' },
  { id: 'k3', nama: 'Ani Diblokir', nomor: '628777888999', segmen: [], label: [], langganan: false, daftarHitam: true, kantor: '' },
];

const JAWABAN = {
  'sistem.status': { masuk: true, pengguna: PENGGUNA, izin: IZIN, driver: 'mandiri', lembaga: { nama: 'LAZISMU Daerah Bantul', singkatan: 'Lazismu Bantul' } },
  'sistem.kesiapan': {
    siapDeploy: true, diVercel: false,
    butir: [
      { kode: 'basisdata', label: 'Basis data Upstash Redis tersambung', lolos: true, wajib: true, saran: '' },
      { kode: 'rahasia', label: 'RAHASIA_SESI sudah diganti', lolos: false, wajib: true, saran: 'Ganti di Environment Variables.' },
    ],
  },
  'dasbor.ringkas': {
    hariIni: { total: 20, terkirim: 18, sampai: 15, dibaca: 9, gagal: 2, antre: 3 },
    keseluruhan: { total: 640, terkirim: 600, sampai: 540, dibaca: 300, gagal: 12, antre: 7 },
    grafik: [
      { tanggal: '2026-09-09', total: 12, terkirim: 11, gagal: 1 },
      { tanggal: '2026-09-10', total: 30, terkirim: 29, gagal: 1 },
      { tanggal: '2026-09-11', total: 22, terkirim: 22, gagal: 0 },
    ],
    antrean: { antre: 7, gagal: 3, dalamJamKirim: true, jamKirim: '08:00\u201320:00 WIB' },
    kontak: { total: 540 },
    perangkat: PERANGKAT.map((d) => ({ id: d.id, nama: d.nama, nomor: d.nomor, status: d.status, driver: d.driver })),
  },
  'perangkat.daftar': {
    baris: PERANGKAT,
    driver: [
      { nama: 'sandbox', label: 'Sandbox (simulasi)', butuhKredensial: false },
      { nama: 'mandiri', label: 'Gateway sendiri (WhatsApp Web)', butuhKredensial: false },
      { nama: 'fonnte', label: 'Fonnte', butuhKredensial: true },
    ],
  },
  'pesan.daftar': { total: PESAN.length, halaman: 1, perHalaman: 25, baris: PESAN },
  'kontak.daftar': {
    total: 3, halaman: 1, perHalaman: 25,
    baris: KONTAK,
    segmen: SEGMEN,
    grup: GRUP,
  },
  'kontak.pilihan': { baris: KONTAK.map((k) => ({
    id: k.id, nama: k.nama, nomor: k.nomor, kantor: k.kantor || '',
    grup: k.label || [], segmen: k.segmen || [],
    diblokir: Boolean(k.daftarHitam || k.langganan === false),
  })), grup: GRUP, segmen: SEGMEN },
  'grup.daftar': { baris: GRUP },
  'templat.daftar': { baris: [{ id: 't1', nama: 'Ucapan terima kasih', isi: 'Terima kasih {{nama}}', dibuat: new Date().toISOString() }] },
  'massal.daftar': {
    baris: [{
      id: 'b1', nama: 'Kampanye Qurban', status: 'berjalan', total: 100, dibuat: new Date().toISOString(),
      statistik: { antre: 59, terkirim: 40, sampai: 30, dibaca: 12, gagal: 1 },
    }],
  },
  'pengguna.daftar': { baris: [PENGGUNA], peran: ['superadmin', 'admin', 'penyelia', 'petugas', 'kll'] },
  'audit.daftar': { baris: [{ id: 'a1', aksi: 'pesan.kirim', oleh: 'superadmin', waktu: new Date().toISOString(), rincian: { nomor: '628111222333' } }] },
  'webhook.riwayat': {
    baris: [{ id: 'w1', jenis: 'terkirim', kode: 200, waktu: new Date().toISOString(), url: 'https://contoh.test/hook', isi: {} }],
    mati: [],
  },
  'setelan.ambil': {
    setelan: {
      lembaga: { nama: 'LAZISMU Daerah Bantul', singkatan: 'Lazismu Bantul', alamat: 'Bantul', telepon: '', surel: '', situs: '', penandatangan: '' },
      pengirim: { driver: 'mandiri', kodeNegara: '62', efekMengetik: true },
      kirim: { jedaMinDetik: 30, jedaMaksDetik: 60, jamMulai: 8, jamSelesai: 20, batasHarianPerangkat: 800, kirimPerPutaran: 5, percobaanMaks: 3, hormatiJamKirim: true },
      webhook: { aktif: false, url: '', rahasia: '', kejadian: ['terkirim'] },
      rekening: [], tampilan: { tema: 'terang', intervalPollingDetik: 10 },
    },
  },
  'kontak.simpan': { kontak: { id: 'k9', nama: 'Kontak Baru', nomor: '628999000111' }, baru: true },
  'templat.simpan': { baris: [] },
  'pesan.hapus': { pesan: 'Riwayat pesan dihapus.' },
  'pesan.hapusSemua': { terhapus: 3, diperiksa: 3, catatan: '3 riwayat pesan dihapus.' },
  'grup.ubahNama': { grup: 'X', kontak: 1, baris: GRUP },
  'grup.hapus': { grup: 'X', kontak: 1, baris: GRUP },
  'antrean.proses': { laporan: { diproses: 0, terkirim: 0, diserahkan: 0, gagal: 0, ditunda: 0, alasan: [] } },
  'berkas.unggah': { berkas: { id: 'f_uji1', nama: 'Panduan Zakat.pdf', tipe: 'application/pdf', jenis: 'dokumen', byte: 204800 } },
};

const TIPE = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/blast')) {
    let b = '';
    req.on('data', (d) => { b += d; });
    req.on('end', () => {
      let t = '';
      try { t = JSON.parse(b).tindakan; } catch (_) { /* biar jadi tindakan kosong */ }
      hitungTindakan[t] = (hitungTindakan[t] || 0) + 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (t === '__hitung') {
        return res.end(JSON.stringify({ ok: true,
          sambung: hitungTindakan['perangkat.sambung'] || 0,
          periksa: hitungTindakan['perangkat.periksa'] || 0,
          unggah: hitungTindakan['berkas.unggah'] || 0 }));
      }
      const khusus = dinamis[t] ? dinamis[t](hitungTindakan[t]) : null;
      res.end(JSON.stringify(Object.assign({ ok: true }, khusus || JAWABAN[t] || {})));
    });
    return;
  }
  const nama = (req.url.split('?')[0] === '/') ? '/blast.html' : req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('tidak ada'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

/* Dipakai uji alur QR: menghitung berapa kali sebuah tindakan dipanggil, dan
   memberi jawaban yang berubah-ubah menurut urutan panggilan. */
const hitungTindakan = {};
const dinamis = {};

const HALAMAN = ['dasbor', 'perangkat', 'kirim', 'massal', 'antrean', 'kontak', 'templat', 'webhook', 'pengguna', 'audit', 'setelan'];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const A = 'http://127.0.0.1:' + server.address().port;

  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const galat = [];
  p.on('pageerror', (e) => galat.push(String(e.message)));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource|fonts\.googleapis/i.test(m.text())) galat.push('console: ' + m.text());
  });

  await p.goto(A + '/blast.html');
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });

  console.log('=== A. SATU BAHASA VISUAL DENGAN LAZDIGITAL ===');
  /* Ambil nilai acuan dari halaman utama supaya uji ini tidak menghafal warna:
     kalau tema LAZDigital diubah, uji ikut berubah sendiri. */
  const acuan = await p.evaluate(async (alamat) => {
    const r = await fetch(alamat + '/index.html');
    const t = await r.text();
    return { punyaStylesCss: /href="\/styles\.css"/.test(t), punyaInter: /family=Inter/.test(t) };
  }, A);
  const gaya = await p.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const akar = getComputedStyle(document.documentElement);
    return {
      font: cs.fontFamily,
      latar: cs.backgroundColor,
      aksen: akar.getPropertyValue('--accent').trim(),
      lembar: Array.from(document.styleSheets).map((s) => s.href || '').filter(Boolean),
    };
  });
  cek('halaman utama memang memakai styles.css (acuan sah)', acuan.punyaStylesCss && acuan.punyaInter, acuan);
  cek('Broadcast memuat styles.css yang sama, bukan salinan',
    gaya.lembar.some((h) => h.endsWith('/styles.css')), gaya.lembar);
  cek('hurufnya Inter seperti seluruh aplikasi', /Inter/.test(gaya.font), gaya.font);
  cek('warna aksennya dari tema LAZDigital', gaya.aksen === '#F2704F', gaya.aksen);
  cek('tidak ada lagi Tailwind dari CDN',
    !gaya.lembar.some((h) => /tailwind/i.test(h)) && !(await p.evaluate(() => typeof window.tailwind !== 'undefined')));

  console.log('\n=== B. KERANGKA HALAMAN SAMA ===');
  const kerangka = await p.evaluate(() => ({
    topnav: !!document.querySelector('.topnav'),
    main: !!document.querySelector('.main'),
    butirMenu: document.querySelectorAll('.tn-item').length,
    ikonSvg: document.querySelectorAll('.tn-item .ic svg').length,
    emoji: /[\u{1F300}-\u{1FAFF}]/u.test(document.querySelector('.tn-nav').textContent),
    modal: !!document.querySelector('.modal-bg .modal .modal-head'),
    toast: !!document.querySelector('.toast'),
  }));
  cek('memakai .topnav dan .main seperti halaman utama', kerangka.topnav && kerangka.main, kerangka);
  cek('kesebelas menu tergambar', kerangka.butirMenu === 11, kerangka.butirMenu);
  cek('ikon menu berupa SVG garis, bukan emoji', kerangka.ikonSvg === 11 && !kerangka.emoji, kerangka);
  cek('kerangka modal sama dengan LAZDigital', kerangka.modal, kerangka);
  cek('toast memakai elemen tunggal .toast', kerangka.toast, kerangka);

  const ciut = await p.evaluate(() => { toggleSidebar(); return document.getElementById('appView').classList.contains('collapsed'); });
  cek('menu bisa diciutkan seperti halaman utama', ciut === true, ciut);
  await p.evaluate(() => toggleSidebar());

  console.log('\n=== C. KESEBELAS HALAMAN BERSIH DARI TAILWIND ===');
  const sisaTailwind = [];
  const tanpaJudul = [];
  const kosongIsi = [];
  for (const kode of HALAMAN) {
    await p.evaluate((k) => { location.hash = '#' + k; }, kode);
    await p.waitForTimeout(450);
    const h = await p.evaluate(() => {
      const semua = Array.from(document.querySelectorAll('#isi *'));
      const pola = /(^|\s)(rounded-|px-\d|py-\d|text-xs|text-sm|text-slate|bg-slate|bg-white|font-medium|dark:|sm:|lg:|md:|grid-cols|space-y-|divide-)/;
      const kotor = semua.filter((e) => typeof e.className === 'string' && pola.test(e.className))
        .map((e) => e.tagName.toLowerCase() + '.' + e.className).slice(0, 3);
      return {
        kotor,
        judul: (document.querySelector('.page-head h2') || {}).textContent || '',
        isiKosong: (document.getElementById('isiHalaman') || {}).innerHTML === '',
      };
    });
    if (h.kotor.length) sisaTailwind.push({ kode, contoh: h.kotor });
    if (!h.judul) tanpaJudul.push(kode);
    if (h.isiKosong) kosongIsi.push(kode);
  }
  cek('tidak ada sisa kelas Tailwind di halaman mana pun', sisaTailwind.length === 0, sisaTailwind);
  cek('tiap halaman punya judul .page-head h2', tanpaJudul.length === 0, tanpaJudul);
  cek('tidak ada halaman yang gagal digambar', kosongIsi.length === 0, kosongIsi);

  console.log('\n=== D. DROPDOWN MEMAKAI PENYELARAS YANG SAMA ===');
  await p.evaluate(() => { location.hash = '#massal'; });
  await p.waitForTimeout(1400);
  const drop = await p.evaluate(() => {
    const asli = Array.from(document.querySelectorAll('#isi select'));
    return {
      jumlahSelect: asli.length,
      tersembunyi: asli.filter((s) => s.style.display === 'none').length,
      tombol: document.querySelectorAll('#isi .select-enhanced-btn').length,
      kelasTombol: (document.querySelector('#isi .select-enhanced-btn') || {}).className || '',
    };
  });
  cek('halaman ini memang punya <select>', drop.jumlahSelect > 0, drop);
  cek('semua <select> bawaan diganti tombol kustom',
    drop.tombol >= drop.jumlahSelect && drop.tersembunyi === drop.jumlahSelect, drop);
  cek('tombolnya memakai kelas yang sama dengan LAZDigital',
    /btn-dropdown/.test(drop.kelasTombol) && /select-enhanced-btn/.test(drop.kelasTombol), drop.kelasTombol);

  await p.click('#isi .select-enhanced-btn');
  await p.waitForTimeout(350);
  const pop = await p.evaluate(() => {
    const el = document.querySelector('.select-enhanced-popover:not(.hidden)');
    return el ? { ada: true, keBody: el.parentElement === document.body, butir: el.querySelectorAll('.dropdown-item').length } : { ada: false };
  });
  cek('popover terbuka saat diklik', pop.ada === true, pop);
  cek('popover dipindah ke <body> supaya tidak terpotong kartu', pop.keBody === true, pop);
  cek('isinya .dropdown-item seperti di halaman utama', pop.butir > 0, pop);
  await p.keyboard.press('Escape');

  console.log('\n=== E. TEMA GELAP IKUT BERPINDAH ===');
  const terang = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.click('#tombolTema');
  await p.waitForTimeout(350);
  const gelap = await p.evaluate(() => ({
    atribut: document.documentElement.getAttribute('data-theme'),
    latar: getComputedStyle(document.body).backgroundColor,
    tersimpan: localStorage.getItem('laz_theme'),
  }));
  cek('tema gelap memakai data-theme, bukan kelas .dark', gelap.atribut === 'dark', gelap);
  cek('latarnya benar-benar berubah', gelap.latar !== terang, { terang, gelap: gelap.latar });
  cek('disimpan di kunci yang sama dengan halaman utama (laz_theme)', gelap.tersimpan === 'dark', gelap.tersimpan);
  await p.click('#tombolTema');
  await p.waitForTimeout(300);

  console.log('\n=== F. DI LAYAR HP ===');
  await p.setViewportSize({ width: 390, height: 844 });
  const luberDi = [];
  for (const kode of HALAMAN) {
    await p.evaluate((k) => { location.hash = '#' + k; }, kode);
    await p.waitForTimeout(400);
    const luber = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (luber) luberDi.push(kode);
  }
  cek('tidak ada halaman yang melebar di layar HP', luberDi.length === 0, luberDi);

  console.log('\n=== F0. PENANDA NAMA DISISIPKAN DI POSISI KURSOR ===');
  /* Penggantian nama per kontak sudah jalan sejak awal; yang tidak ada adalah
     sesuatu yang memberitahu petugas bahwa penandanya ada. */
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.evaluate(() => { location.hash = '#kirim'; });
  await p.waitForTimeout(800);
  const keping = await p.evaluate(() => Array.from(document.querySelectorAll('#isi .keping')).map((k) => k.textContent.trim()));
  cek('ada keping {{nama}} di komposer', keping.includes('{{nama}}'), keping);
  cek('ada keping {{kantor}}', keping.includes('{{kantor}}'), keping);

  const sisip = await p.evaluate(() => {
    const t = document.querySelector('#isi [name=teks]');
    t.value = 'Assalamualaikum , terima kasih.';
    t.focus();
    const pos = 'Assalamualaikum '.length;        // tepat sebelum koma
    t.setSelectionRange(pos, pos);
    Array.from(document.querySelectorAll('#isi .keping')).find((k) => k.textContent.trim() === '{{nama}}').click();
    return { teks: t.value, kursor: t.selectionStart };
  });
  cek('penanda masuk di tengah kalimat, bukan di ujung',
    sisip.teks === 'Assalamualaikum {{nama}}, terima kasih.', sisip.teks);
  cek('kursor pindah ke belakang penanda', sisip.kursor === 'Assalamualaikum {{nama}}'.length, sisip.kursor);

  /* Sebelum kontak dipilih, pratinjau TIDAK boleh mengarang nama. Nama karangan
     membuat penandanya terlihat sudah berfungsi padahal belum ada penerimanya —
     dan kekeliruan itu baru ketahuan sesudah pesannya terkirim. */
  const pratinjauKosong = await p.evaluate(() => ({
    isi: (document.getElementById('pratinjau') || {}).textContent || '',
    kepala: (document.getElementById('pratinjauUntuk') || {}).textContent || '',
  }));
  cek('sebelum kontak dipilih, penanda diganti sapaan umum — bukan nama karangan',
    /Bapak\/Ibu/.test(pratinjauKosong.isi) && !/\{\{/.test(pratinjauKosong.isi), pratinjauKosong.isi);
  cek('dan disebutkan bahwa kontaknya belum dipilih',
    /pilih kontak/i.test(pratinjauKosong.kepala), pratinjauKosong.kepala);

  console.log('\n=== F0b. PENERIMA DIPILIH DARI KONTAK, BUKAN DIKETIK ===');
  const adaKotakNomor = await p.evaluate(() =>
    Boolean(document.querySelector('#isi [name=nomor]')));
  cek('kotak isian nomor bebas sudah tidak ada', adaKotakNomor === false);

  await p.click('#fkPilihTombol');
  await p.waitForTimeout(400);
  const isiPemilih = await p.evaluate(() => ({
    terbuka: !document.getElementById('fkPilihPanel').hidden,
    baris: Array.from(document.querySelectorAll('#fkPilihIsi .pilih-baris')).map((b) => ({
      nama: (b.querySelector('.pilih-nama') || {}).textContent || '',
      mati: b.classList.contains('mati'),
    })),
    adaTombolBaru: Array.from(document.querySelectorAll('#fkPilihPanel .keping'))
      .some((k) => /kontak baru/i.test(k.textContent)),
  }));
  cek('panel pemilih terbuka saat ditekan', isiPemilih.terbuka === true);
  cek('kontaknya tergambar', isiPemilih.baris.length === 3, isiPemilih.baris);
  cek('kontak diblokir tetap terlihat tetapi tidak bisa dicentang',
    (isiPemilih.baris.find((b) => /Ani/.test(b.nama)) || {}).mati === true, isiPemilih.baris);
  cek('ada jalan menyimpan kontak baru tanpa meninggalkan layar ini',
    isiPemilih.adaTombolBaru === true);

  const sesudahCentang = await p.evaluate(() => {
    const kotak = Array.from(document.querySelectorAll('#fkPilihIsi input[type=checkbox]'))
      .filter((c) => !c.disabled);
    kotak[0].checked = true; kotak[0].dispatchEvent(new Event('change', { bubbles: true }));
    kotak[1].checked = true; kotak[1].dispatchEvent(new Event('change', { bubbles: true }));
    return {
      ringkas: document.getElementById('fkPilihRingkas').textContent,
      pratinjau: (document.getElementById('pratinjau') || {}).textContent || '',
      kepala: (document.getElementById('pratinjauUntuk') || {}).textContent || '',
    };
  });
  cek('ringkasan menyebut siapa saja yang terpilih',
    /Budi/.test(sesudahCentang.ringkas) && /Siti/.test(sesudahCentang.ringkas), sesudahCentang.ringkas);
  cek('pratinjau memakai nama kontak yang BENAR-BENAR terpilih',
    /Budi Santosa/.test(sesudahCentang.pratinjau), sesudahCentang.pratinjau);
  cek('dan mengingatkan bahwa yang lain menerima namanya sendiri',
    /namanya sendiri/i.test(sesudahCentang.kepala), sesudahCentang.kepala);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  console.log('\n=== F0c. HAPUS RIWAYAT ===');
  await p.evaluate(() => { location.hash = '#antrean'; });
  await p.waitForTimeout(700);
  const hapusRiwayat = await p.evaluate(() => ({
    tombolBaris: document.querySelectorAll('#isi [data-hapusp]').length,
    tombolSemua: Boolean(document.getElementById('kosongkanRiwayat')),
  }));
  cek('tiap baris riwayat bisa dihapus', hapusRiwayat.tombolBaris === 3, hapusRiwayat);
  cek('superadmin melihat tombol hapus semua', hapusRiwayat.tombolSemua === true, hapusRiwayat);

  await p.click('#kosongkanRiwayat');
  await p.waitForTimeout(400);
  const dialogHapus = await p.evaluate(() => {
    const m = document.querySelector('.modal, .modal-box, [class*=modal]');
    return {
      teks: m ? m.textContent : '',
      adaKetik: Boolean(document.getElementById('tegaskanHapus')),
    };
  });
  cek('menuntut kata kunci diketik ulang, bukan sekadar tombol Ya',
    dialogHapus.adaKetik === true, dialogHapus.adaKetik);
  cek('disebutkan apa yang TIDAK ikut terhapus', /audit/i.test(dialogHapus.teks), dialogHapus.teks.slice(0, 200));
  cek('dan bahwa pesan yang sudah sampai tidak bisa ditarik',
    /HP penerima/i.test(dialogHapus.teks), dialogHapus.teks.slice(0, 300));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  console.log('\n=== F0d. GRUP DI KIRIMAN MASSAL ===');
  await p.evaluate(() => { location.hash = '#massal'; });
  await p.waitForTimeout(800);
  const layarMassal = await p.evaluate(() => ({
    adaSegmenLama: Boolean(document.querySelector('#isi select[name=segmen]')),
    grup: Array.from(document.querySelectorAll('#isi [data-grup]')).map((c) => c.value),
    hitung: (document.getElementById('penerimaHitung') || {}).textContent || '',
    daftarTersembunyi: (document.getElementById('penerimaDaftar') || {}).hidden,
  }));
  cek('dropdown segmen tunggal yang lama sudah tidak ada', layarMassal.adaSegmenLama === false);
  cek('grup buatan sendiri bisa dicentang', layarMassal.grup.length === 2, layarMassal.grup);
  cek('jumlah penerima terlihat SEBELUM tombol ditekan', /\d/.test(layarMassal.hitung), layarMassal.hitung);
  cek('daftar grup tersembunyi selama memilih "semua kontak"',
    layarMassal.daftarTersembunyi === true, layarMassal);

  const sesudahPilihGrup = await p.evaluate(() => {
    const radio = Array.from(document.querySelectorAll('[name=carePenerima]'))
      .find((r) => r.value === 'pilih');
    radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true }));
    const g = document.querySelector('[data-grup]');
    g.checked = true; g.dispatchEvent(new Event('change', { bubbles: true }));
    return (document.getElementById('penerimaHitung') || {}).textContent || '';
  });
  cek('mencentang satu grup langsung memperbarui hitungannya',
    /1|2/.test(sesudahPilihGrup) && /dikirimi/i.test(sesudahPilihGrup), sesudahPilihGrup);

  console.log('\n=== F1. LAMPIRAN BERKAS ===');
  /* Bagian sebelumnya berpindah ke halaman lain, jadi halamannya dikembalikan
     dulu. Uji yang bergantung pada sisa keadaan uji sebelumnya akan gagal
     dengan sebab yang menyesatkan begitu urutannya berubah. */
  await p.evaluate(() => { location.hash = '#kirim'; });
  await p.waitForTimeout(800);
  const kotak = await p.evaluate(() => {
    const f = document.querySelector('#isi input[type=file]');
    return f ? { ada: true, terima: f.accept, ket: (document.getElementById('fkBerkasKet') || {}).textContent || '' } : { ada: false };
  });
  cek('ada pemilih berkas di Kirim Pesan', kotak.ada, kotak);
  cek('menerima PDF dan gambar', /pdf/i.test(kotak.terima) && /png/i.test(kotak.terima), kotak.terima);
  cek('batas ukurannya tertulis sebelum petugas mencoba', /3 MB/.test(kotak.ket), kotak.ket);

  /* Berkas kebesaran ditolak DI LAYAR, tanpa perlu diunggah dulu. */
  const sebelumUnggah = await p.evaluate(async () => {
    const r = await fetch('/api/blast', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tindakan: '__hitung', data: {} }) });
    return (await r.json()).unggah || 0;
  });
  const besar = await p.evaluate(async () => {
    const f = document.querySelector('#isi input[type=file]');
    const berkas = new File([new Uint8Array(4 * 1024 * 1024)], 'besar.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer(); dt.items.add(berkas); f.files = dt.files;
    f.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return { ket: document.getElementById('fkBerkasKet').textContent, id: document.getElementById('fkBerkasId').value };
  });
  cek('berkas kebesaran ditolak di layar', /melebihi batas/i.test(besar.ket), besar.ket);
  cek('dan tidak ikut terkirim ke server', besar.id === '', besar.id);

  const kecil = await p.evaluate(async () => {
    const f = document.querySelector('#isi input[type=file]');
    const berkas = new File([new Uint8Array(1024)], 'Panduan Zakat.pdf', { type: 'application/pdf' });
    const dt = new DataTransfer(); dt.items.add(berkas); f.files = dt.files;
    f.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    return { ket: document.getElementById('fkBerkasKet').textContent, id: document.getElementById('fkBerkasId').value };
  });
  cek('berkas yang muat langsung diunggah', kecil.id === 'f_uji1', kecil);
  cek('namanya ditampilkan supaya petugas yakin', /Panduan Zakat/.test(kecil.ket), kecil.ket);

  await p.evaluate(() => { location.hash = '#massal'; });
  await p.waitForTimeout(800);
  const massal = await p.evaluate(() => ({
    berkas: !!document.querySelector('#isi input[type=file]'),
    keping: Array.from(document.querySelectorAll('#isi .keping')).map((k) => k.textContent.trim()),
  }));
  cek('Kiriman Massal juga bisa melampirkan berkas', massal.berkas, massal);
  cek('dan juga punya keping penanda', massal.keping.includes('{{nama}}'), massal.keping);

  console.log('\n=== F1b. CENTANG SAMPAI DAN DIBACA ===');
  await p.evaluate(() => { location.hash = '#antrean'; });
  await p.waitForTimeout(800);
  const centang = await p.evaluate(() => {
    const cari = (t) => Array.from(document.querySelectorAll('#isi .badge')).find((b) => b.textContent.trim() === t);
    const diserahkan = cari('diserahkan'), terkirim = cari('terkirim');
    return {
      terkirimPunyaCentang: !!(terkirim && terkirim.querySelector('svg')),
      diserahkanTanpaCentang: !!(diserahkan && !diserahkan.querySelector('svg')),
    };
  });
  cek('status terkirim ditandai centang', centang.terkirimPunyaCentang, centang);
  cek('status yang belum sampai HP tidak diberi centang', centang.diserahkanTanpaCentang, centang);

  await p.evaluate(() => { location.hash = '#dasbor'; });
  await p.waitForTimeout(800);
  const dasbor = await p.evaluate(() => {
    const ubin = Array.from(document.querySelectorAll('#isi .ringkas .stat'));
    return {
      jumlah: ubin.length,
      /* Satu baris berarti semuanya berbagi tepi atas yang sama. Kalau ada
         yang turun, angkanya langsung terlihat berbeda di sini. */
      barisAtas: new Set(ubin.map((u) => Math.round(u.getBoundingClientRect().top))).size,
      garisAksen: ubin.filter((u) => getComputedStyle(u, '::before').display !== 'none').length,
      isi: ubin.map((u) => ({
        judul: u.querySelector('.lbl').textContent.trim(),
        svg: !!u.querySelector('.lbl svg'),
        nilai: u.querySelector('.val').textContent.trim(),
        catatan: (u.querySelector('.ket') || {}).textContent || '',
        terpotong: u.querySelector('.ket').scrollWidth > u.querySelector('.ket').clientWidth + 1,
      })),
    };
  });
  const uSampai = dasbor.isi.find((u) => /Sampai di HP/i.test(u.judul));
  const uDibaca = dasbor.isi.find((u) => /Dibaca/i.test(u.judul));
  cek('dasbor menampilkan berapa yang sampai di HP', !!uSampai && uSampai.nilai === '15', uSampai);
  cek('dan berapa yang sudah dibaca', !!uDibaca && uDibaca.nilai === '9', uDibaca);
  cek('keduanya memakai gambar centang, bukan kata saja', !!(uSampai && uSampai.svg && uDibaca && uDibaca.svg), { uSampai, uDibaca });
  cek('disertai persentasenya terhadap yang terkirim', /83%/.test(uSampai.catatan) && /50%/.test(uDibaca.catatan), { s: uSampai.catatan, d: uDibaca.catatan });
  cek('keenam angka muat dalam SATU baris', dasbor.jumlah === 6 && dasbor.barisAtas === 1, dasbor);
  cek('tanpa garis aksen di tepi kiri kotak', dasbor.garisAksen === 0, dasbor.garisAksen);
  cek('tidak ada keterangan yang terpotong', dasbor.isi.every((u) => !u.terpotong), dasbor.isi.filter((u) => u.terpotong));

  console.log('\n=== F2. LAYAR QR MENUNGGU, TIDAK MENYURUH ULANG ===');
  /* Ini bug yang paling memakan waktu di lapangan: QR belum ada saat tombol
     ditekan (perintahnya baru dititipkan), layar menyerah, petugas menekan
     lagi — dan setiap tekanan membuka sambungan baru yang membatalkan QR
     sebelumnya. Perintahnya harus dikirim SEKALI, sisanya cuma menanyakan. */
  await p.setViewportSize({ width: 1280, height: 900 });
  const QR_PALSU = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  hitungTindakan['perangkat.sambung'] = 0;
  hitungTindakan['perangkat.periksa'] = 0;
  dinamis['perangkat.sambung'] = () => ({ status: 'menunggu', keterangan: 'Permintaan dikirim ke gateway.' });
  /* Dua tarikan pertama belum ada QR-nya — persis seperti kenyataannya. */
  dinamis['perangkat.periksa'] = (ke) => (ke >= 3
    ? { status: 'menunggu', qr: QR_PALSU, keterangan: '' }
    : { status: 'terputus', qr: '', keterangan: 'Menunggu gateway.' });

  await p.evaluate(() => { location.hash = '#perangkat'; });
  await p.waitForTimeout(700);
  await p.click('[data-sambung]');
  await p.waitForTimeout(600);
  const awalQR = await p.evaluate(() => ({
    terbuka: document.getElementById('modalBg').classList.contains('show'),
    adaRangka: !!document.querySelector('#qrIsi .rangka'),
    adaGambar: !!document.querySelector('#qrIsi img'),
  }));
  cek('layar QR langsung terbuka walau QR-nya belum ada', awalQR.terbuka, awalQR);
  cek('sementara menunggu, ditampilkan bentuk kasarnya dulu', awalQR.adaRangka && !awalQR.adaGambar, awalQR);

  await p.waitForSelector('#qrIsi img', { timeout: 12000 });
  const sesudah = await p.evaluate(() => ({
    src: (document.querySelector('#qrIsi img') || {}).src || '',
    pesan: (document.getElementById('qrPesan') || {}).textContent || '',
  }));
  cek('QR muncul sendiri begitu gateway mengirimnya', sesudah.src.startsWith('data:image/png'), sesudah.src.slice(0, 30));
  cek('ada petunjuk cara memindainya', /Perangkat Tertaut/i.test(sesudah.pesan), sesudah.pesan);

  const hitung = await p.evaluate(async () => {
    const r = await fetch('/api/blast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tindakan: '__hitung', data: {} }),
    });
    return r.json();
  });
  cek('perintah sambungkan hanya dikirim SEKALI', hitung.sambung === 1, hitung);
  cek('sisanya cuma menanyakan keadaan', hitung.periksa >= 3, hitung);

  /* Begitu tersambung, layarnya menutup sendiri. */
  dinamis['perangkat.periksa'] = () => ({ status: 'tersambung', nomor: '628111000111', qr: '' });
  await p.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), { timeout: 12000 })
    .then(() => cek('layar menutup sendiri setelah tersambung', true))
    .catch(() => cek('layar menutup sendiri setelah tersambung', false));
  delete dinamis['perangkat.sambung'];
  delete dinamis['perangkat.periksa'];

  console.log('\n=== G. LAYAR PEMUATAN MENYATU DENGAN HALAMAN ===');
  /* Layar pembuka harus diperiksa SELAGI terlihat, jadi jawaban status
     ditahan sebentar supaya ia tidak keburu hilang. */
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.route('**/api/blast', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    try { await route.continue(); } catch (_) { /* halaman sudah pindah */ }
  });
  await p.goto(A + '/blast.html');
  await p.waitForSelector('#boot', { state: 'visible', timeout: 5000 });

  /* Peramban mengembalikan dua bentuk: "rgb(247, 244, 242)" dengan angka
     0-255, dan "color(srgb 0.96 0.95 0.94 / 0.88)" dengan angka 0-1. Keduanya
     disamakan ke 0-255 supaya perbandingannya tidak salah baca. */
  const uraiRgb = (v) => {
    const t = String(v);
    const angka = (t.match(/[\d.]+/g) || []).map(Number);
    if (/^color\(/.test(t)) {
      const [r, g, b, a = 1] = angka.slice(-4).length === 4 ? angka.slice(-4) : [...angka, 1];
      return [r * 255, g * 255, b * 255, a];
    }
    return angka;
  };
  const pemuatan = await p.evaluate(() => {
    const boot = document.getElementById('boot');
    const cs = getComputedStyle(boot);
    return {
      latar: cs.backgroundColor,
      latarBadan: getComputedStyle(document.body).backgroundColor,
      garis: getComputedStyle(boot.querySelector('.lz-line')).backgroundColor,
      teks: getComputedStyle(boot.querySelector('.lz-lama')).color,
    };
  });
  const [lr, lg, lb, la = 1] = uraiRgb(pemuatan.latar);
  cek('latarnya tidak lagi hitam', (lr + lg + lb) / 3 > 120, pemuatan.latar);
  cek('warnanya mengikuti latar aplikasi, bukan warna sendiri',
    Math.abs(lr - uraiRgb(pemuatan.latarBadan)[0]) < 12, pemuatan);
  cek('agak tembus supaya gradasi di belakangnya terlihat', la < 1, pemuatan.latar);

  const [gr, gg, gb] = uraiRgb(pemuatan.garis);
  cek('garis pemuatan gelap supaya terlihat di latar terang', (gr + gg + gb) / 3 < 120, pemuatan.garis);
  const [tr, tg, tb] = uraiRgb(pemuatan.teks);
  cek('teks keterangannya juga terbaca di latar terang', (tr + tg + tb) / 3 < 200, pemuatan.teks);

  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await p.waitForTimeout(250);
  const gelapLoader = await p.evaluate(() => {
    const boot = document.getElementById('boot');
    return {
      latar: getComputedStyle(boot).backgroundColor,
      garis: getComputedStyle(boot.querySelector('.lz-line')).backgroundColor,
    };
  });
  const [dr, dg, db] = uraiRgb(gelapLoader.latar);
  cek('di tema gelap ikut menggelap sendiri', (dr + dg + db) / 3 < 120, gelapLoader.latar);
  const [ggr, ggg, ggb] = uraiRgb(gelapLoader.garis);
  cek('garisnya ikut berbalik jadi terang', (ggr + ggg + ggb) / 3 > 160, gelapLoader.garis);

  await p.unroute('**/api/blast').catch(() => {});

  console.log('\n=== G. TIDAK ADA GALAT ===');
  cek('tidak ada galat JavaScript sepanjang uji', galat.length === 0, galat.slice(0, 5));

  await b.close();
  server.close();
  console.log('\ntest_blast_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
