/* tools/ukur-percakapan.js: mengukur layar Percakapan di tujuh ukuran layar.
 *
 * KENAPA DIUKUR, BUKAN DILIHAT.
 * Layar ini bentuknya berbeda dari halaman lain: tingginya dipatok ke tinggi
 * layar, isinya yang bergulir, dan di dasarnya ada kotak tulis yang HARUS
 * selalu terlihat. Kesalahan pada bentuk seperti ini tidak pernah tampak
 * sebagai galat. Ia tampak sebagai "kok balasannya nggak bisa diketik di HP"
 * berminggu-minggu kemudian, dan sampai saat itu tidak ada satu pun uji yang
 * merah.
 *
 * EMPAT HAL YANG DIUKUR, DAN MASING-MASING PERNAH SALAH:
 *
 *   1. Kotak tulis terlihat. Dulu ia jatuh 11 px di bawah dasar layar ponsel:
 *      cukup untuk tidak terlihat sama sekali, tidak cukup untuk dicurigai.
 *
 *   2. Halamannya TIDAK ikut bergulir. Dua gulungan bersusun membuat gerakan
 *      jari tidak bisa ditebak: kadang yang bergerak percakapannya, kadang
 *      seluruh halaman. Penyebabnya min-height:auto bawaan anak flex, yang
 *      membuat kotak gelembung menolak menyusut dan panelnya memanjang 208 px
 *      melewati layar.
 *
 *   3. Percakapan terbuka pada pesan TERBARU. Kurang 17 px saja sudah cukup
 *      membuat pesan terakhir terpotong, dan itulah pesan yang mau dibaca.
 *      Sebabnya dua: gelembung membungkus ulang sesudah lebarnya berubah, dan
 *      fokus ke kotak tulis menggeser guliran induknya.
 *
 *   4. Tidak melebar ke samping. Dua kolom dipaksakan di lebar 360 px
 *      menghasilkan halaman yang harus digeser ke kanan untuk dibaca.
 *
 *   node tools/ukur-percakapan.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
const PUBLIK = path.join(AKAR, 'src', 'public');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) {
  try { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
  catch (e) {
    console.log('  DILEWATI: Playwright belum terpasang.');
    console.log('  npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium')
  ? { executablePath: '/opt/pw-browsers/chromium' } : {});

let lulus = 0, gagal = 0;
function cek(nama, benar, info) {
  if (benar) { lulus++; console.log('  ok    | ' + nama); return; }
  gagal++;
  console.log('  GAGAL | ' + nama + (info === undefined ? '' : '  ' + JSON.stringify(info)));
}

/* Data palsu yang sengaja PANJANG. Percakapan pendek muat di layar mana pun,
   jadi ia tidak pernah membuktikan apa-apa soal guliran dan kotak tulis. */
const IKINI = (menit) => new Date(Date.now() - menit * 60000).toISOString();
const BARIS = Array.from({ length: 14 }, (_, i) => ({
  kunci: 'nomor:62811122233' + i, jenis: 'kontak', nomor: '62811122233' + i,
  nama: 'Kontak Uji ' + i, kantor: '', diblokir: false, jumlah: 2, masuk: 1,
  belumDibaca: i % 3 ? 0 : 2, waktu: IKINI(i * 7),
  cuplikan: 'Pesan contoh nomor ' + i, arahTerakhir: i % 2 ? 'masuk' : 'keluar',
  statusTerakhir: i % 2 ? 'masuk' : 'dibaca',
}));
const PESAN = Array.from({ length: 22 }, (_, i) => ({
  id: 'm' + i, arah: i % 2 ? 'masuk' : 'keluar',
  teks: 'Baris percakapan nomor ' + i + ' yang cukup panjang untuk jadi dua baris di layar ponsel.',
  status: i % 2 ? 'masuk' : 'dibaca', waktu: IKINI(70 - i * 2), namaMassal: '',
}));
const JAWABAN = {
  'sistem.status': {
    masuk: true, driver: 'mandiri', akses: {},
    pengguna: { id: 'u1', nama: 'Superadmin', peran: 'superadmin', kantor: '' },
    izin: ['*'], lembaga: { nama: 'LAZISMU Daerah Bantul', singkatan: 'Lazismu Bantul' },
  },
  'inbox.daftar': { denyut: 1, belumDibaca: 4, baris: BARIS },
  'inbox.denyut': { denyut: 1 },
  'inbox.utas': {
    nomor: '628111222330', nama: 'Kontak Uji 0', kantor: '', diblokir: false,
    grup: ['Pengurus Harian'], pesan: PESAN,
  },
  'inbox.tandaiDibaca': { kunci: 'nomor:628111222330' },
};

const TIPE = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    let b = '';
    req.on('data', (d) => { b += d; });
    req.on('end', () => {
      let t = '';
      try { t = JSON.parse(b).tindakan; } catch (_) { /* tindakan kosong */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...(JAWABAN[t] || {}) }));
    });
    return;
  }
  const berkas = path.join(PUBLIK, req.url.split('?')[0]);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('tidak ada'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

const UKURAN = [
  { w: 360, h: 640, nama: 'HP kecil' },
  { w: 390, h: 780, nama: 'HP biasa' },
  { w: 414, h: 896, nama: 'HP besar' },
  { w: 768, h: 1024, nama: 'tablet tegak' },
  { w: 1024, h: 768, nama: 'tablet rebah' },
  { w: 1280, h: 800, nama: 'laptop' },
  { w: 1920, h: 1080, nama: 'desktop' },
];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const A = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(CHROMIUM);
  const galat = [];

  for (const u of UKURAN) {
    const p = await b.newPage({ viewport: { width: u.w, height: u.h } });
    p.on('pageerror', (e) => galat.push(u.w + 'x' + u.h + ': ' + e.message));
    await p.goto(A + '/blast.html#percakapan');
    await p.waitForSelector('.pc', { timeout: 15000 });
    await p.waitForTimeout(500);
    await p.click('[data-utas]');
    await p.waitForTimeout(700);

    const m = await p.evaluate(() => {
      const tulis = document.querySelector('.pc-tulis');
      const gel = document.querySelector('.pc-gelembung');
      const t = tulis ? tulis.getBoundingClientRect() : null;
      return {
        adaTulis: Boolean(tulis),
        tulisTampak: t ? t.bottom <= window.innerHeight + 1 : false,
        sisaBawah: t ? Math.round(window.innerHeight - t.bottom) : null,
        gulirHalaman: document.documentElement.scrollHeight - window.innerHeight,
        isiBergulirSendiri: gel ? gel.scrollHeight > gel.clientHeight + 1 : false,
        diPesanTerbaru: gel ? gel.scrollTop + gel.clientHeight >= gel.scrollHeight - 2 : false,
        melebar: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    console.log('\n  ' + u.nama + ' (' + u.w + 'x' + u.h + ')');
    cek('kotak tulis ada dan terlihat di layar',
      m.adaTulis && m.tulisTampak, m);
    cek('halamannya tidak ikut bergulir (yang bergulir isinya)',
      m.gulirHalaman <= 1, { gulirHalaman: m.gulirHalaman });
    cek('percakapannya bergulir sendiri di dalam panel',
      m.isiBergulirSendiri === true, m);
    cek('dan terbuka pada pesan TERBARU, bukan di tengah',
      m.diPesanTerbaru === true, m);
    cek('tidak melebar sampai harus digeser ke samping',
      m.melebar === false, m);
    await p.close();
  }

  console.log('\n  galat JavaScript');
  cek('tidak ada galat sepanjang pengukuran', galat.length === 0, galat.slice(0, 4));

  await b.close();
  server.close();
  console.log('\nukur-percakapan.js  ' + lulus + '/' + (lulus + gagal)
    + (gagal ? '  ADA GAGAL' : '  SEMUA LULUS') + '\n');
  process.exit(gagal ? 1 : 0);
})().catch((e) => {
  console.error('\nGAGAL TOTAL: ' + ((e && e.stack) || e) + '\n');
  try { server.close(); } catch (_) {}
  process.exit(1);
});
