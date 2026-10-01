/* Uji alur "Ingat saya" di peramban sungguhan.
 *
 * test_ingat_saya.js memeriksa mesinnya. Berkas ini memeriksa yang dialami
 * amil: setelah masuk dengan "Ingat saya", sandinya tidak ada di mana pun di
 * peramban; sesi 12 jam yang habis disambung lagi tanpa layar masuk; sandi
 * warisan dari versi lama ditukar diam-diam lalu hilang; dan tombol Keluar
 * benar-benar mencabut token di server, bukan cuma di peramban.
 *
 * Servernya kecil dan hidup di memori: berkas statis dari src/public dan
 * /api/rpc yang langsung memanggil engine. Tidak ada data sungguhan.
 *
 *   node tools/test_ingat_saya_ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

function muatPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200)); }
};

/* Sandi karangan. Dibuat cukup khas supaya pencarian di localStorage tidak
   mungkin salah cocok dengan teks lain. */
const USER = 'amil.uji', SANDI = 'Kopi7Tubruk9Pagi';

let DB = null;
async function siapkanDB() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  DB = { sheets: s, props: {} };
  process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';
  DB = (await engine.runRPC(DB, 'setup', [], {})).db;
  const r = await engine.runRPC(DB, 'login', ['superadmin', 'Admin12345'], {});
  DB = r.db;
  const semua = {};
  ['dashboard', 'penghimpunan'].forEach((m) => { semua[m] = { view: true }; });
  DB = (await engine.runRPC(DB, 'apiSaveUser', [r.result.token, { username: USER, nama: 'Amil Uji', role: 'staff', password: SANDI, permissions: semua }], {})).db;
}
function barisSesi() {
  const t = DB.sheets.Sessions, h = t[0];
  return t.slice(1).map((r) => { const o = {}; h.forEach((k, j) => { o[k] = r[j]; }); return o; });
}
/* Sesi disimpan sebagai hash berawalan "h:" (sejak 30 September 2026), jadi
   yang dihapus baris hash-nya, atau baris lama yang masih apa adanya. */
function hapusSesi(token) {
  const t = DB.sheets.Sessions, i = t[0].indexOf('token');
  const h = 'h:' + crypto.createHash('sha256').update(String(token)).digest('hex');
  DB.sheets.Sessions = [t[0]].concat(t.slice(1).filter((r) => r[i] !== token && r[i] !== h));
}
const hash = (t) => 'ing:' + crypto.createHash('sha256').update(String(t)).digest('hex');
let catatanRpc = [];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/rpc' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; });
    await new Promise((r) => req.on('end', r));
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (_) {}
    catatanRpc.push({ fn: j.fn, args: j.args });
    res.setHeader('Content-Type', 'application/json');
    try {
      const out = await engine.runRPC(DB, j.fn, j.args || [], { ip: '127.0.0.1', ua: 'uji' });
      DB = out.db;
      const cat = catatanRpc[catatanRpc.length - 1];
      if (cat && out.result && typeof out.result === 'object' && 'ok' in out.result) cat.hasil = String(out.result.ok);
      res.end(JSON.stringify({ result: out.result }));
    } catch (e) { const cat = catatanRpc[catatanRpc.length - 1]; if (cat) cat.hasil = 'galat:' + e.message.slice(0, 40); res.end(JSON.stringify({ __error: e.message })); }
    return;
  }
  if (url.startsWith('/api/')) { res.statusCode = 404; res.end('{}'); return; }
  const f = path.join(PUBLIK, url === '/' ? 'index.html' : url);
  if (!f.startsWith(PUBLIK) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(''); return; }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

async function isiPenyimpanan(page) {
  return page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
}
/* Sandi dicari dalam bentuk polos, base64, dan base64 dari JSON, karena
   bentuk lama justru base64 dari JSON {u,p}. */
function adaSandi(isi) {
  const teks = JSON.stringify(isi);
  if (teks.indexOf(SANDI) >= 0) return true;
  for (const v of Object.values(isi)) {
    try { if (Buffer.from(String(v), 'base64').toString('utf8').indexOf(SANDI) >= 0) return true; } catch (_) {}
  }
  return false;
}
async function tungguAplikasi(page) {
  await page.waitForFunction(() => {
    const a = document.getElementById('appView'), l = document.getElementById('loginView');
    return (a && !a.classList.contains('hidden')) || (l && !l.classList.contains('hidden'));
  }, null, { timeout: 20000 });
  return page.evaluate(() => !document.getElementById('appView').classList.contains('hidden'));
}
/* Sesudah tombol Masuk diklik, layar masuk MASIH tampak sampai jawaban server
   tiba. tungguAplikasi() akan langsung selesai di situ, jadi yang ditunggu di
   sini khusus aplikasinya, atau pesan galat masuk. */
async function tungguMasuk(page) {
  try {
    await page.waitForFunction(() => !document.getElementById('appView').classList.contains('hidden')
      || (document.getElementById('loginErr') && document.getElementById('loginErr').textContent.trim()), null, { timeout: 20000 });
  } catch (_) { return false; }
  return page.evaluate(() => !document.getElementById('appView').classList.contains('hidden'));
}

(async () => {
  await siapkanDB();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ALAMAT = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(CHROMIUM);
  const ctx = await browser.newContext();
  /* Tidak ada permintaan keluar: CDN SheetJS dan sejenisnya ditolak. */
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(() => { try { navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()); } catch (_) {} });
  const page = await ctx.newPage();
  const galatHalaman = [];
  page.on('pageerror', (e) => galatHalaman.push(e.message));

  try {
    console.log('\n=== A. MASUK DENGAN "INGAT SAYA" ===');
    await page.goto(ALAMAT + '/');
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    await page.fill('#lUser', USER);
    await page.fill('#lPass', SANDI);
    await page.check('#lRemember');
    await page.click('#loginBtn');
    cek('aplikasi terbuka setelah masuk', await tungguMasuk(page));
    let isi = await isiPenyimpanan(page);
    cek('sandi tidak ada di localStorage dalam bentuk apa pun', !adaSandi(isi), Object.keys(isi));
    cek('laz_creds tidak dibuat', !('laz_creds' in isi));
    cek('token ingat tersimpan (laz_ingat)', typeof isi.laz_ingat === 'string' && isi.laz_ingat.length >= 40);
    cek('basis data hanya memegang hash token ingat',
      barisSesi().some((b) => b.token === hash(isi.laz_ingat)) && !barisSesi().some((b) => b.token === isi.laz_ingat));
    const tokenIngat = isi.laz_ingat;

    console.log('\n=== B. SESI 12 JAM HABIS, AMIL TIDAK DIMINTA MASUK LAGI ===');
    hapusSesi(isi.laz_token);
    catatanRpc = [];
    await page.reload();
    const terbuka = await tungguAplikasi(page);
    cek('setelah sesi habis, aplikasi tetap terbuka tanpa layar masuk', terbuka,
      catatanRpc.map((c) => c.fn + (c.hasil ? '=' + c.hasil : '')));
    isi = await isiPenyimpanan(page);
    cek('token sesi baru dipasang', !!isi.laz_token);
    cek('penyambungan memakai loginIngat', catatanRpc.some((c) => c.fn === 'loginIngat'));
    cek('penyambungan tidak mengirim sandi', !JSON.stringify(catatanRpc).includes(SANDI));

    console.log('\n=== C. KELUAR MENCABUT TOKEN DI SERVER ===');
    catatanRpc = [];
    await page.evaluate(() => doLogout());
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    isi = await isiPenyimpanan(page);
    cek('laz_ingat hilang dari peramban', !('laz_ingat' in isi));
    cek('baris token ingat hilang dari basis data', !barisSesi().some((b) => b.token === hash(tokenIngat)));
    const r = await engine.runRPC(DB, 'loginIngat', [tokenIngat], {});
    cek('token ingat lama tidak bisa dipakai lagi', r.result.ok === false);

    console.log('\n=== D. SANDI WARISAN DARI VERSI LAMA DITUKAR LALU DIHAPUS ===');
    /* Persis bentuk yang dulu ditulis setSavedCreds(). */
    await page.evaluate(([u, p]) => {
      localStorage.clear();
      localStorage.setItem('laz_creds', btoa(unescape(encodeURIComponent(JSON.stringify({ u: u, p: p })))));
    }, [USER, SANDI]);
    await page.reload();
    cek('amil dengan sandi warisan langsung masuk, tidak terlempar keluar', await tungguAplikasi(page));
    isi = await isiPenyimpanan(page);
    cek('laz_creds warisan sudah dihapus', !('laz_creds' in isi));
    cek('sandi tidak ada lagi di localStorage', !adaSandi(isi));
    cek('diganti token ingat', typeof isi.laz_ingat === 'string' && isi.laz_ingat.length >= 40);

    console.log('\n=== E. SANDI WARISAN DIHAPUS WALAU SESINYA MASIH HIDUP ===');
    const tokSesi = isi.laz_token;
    await page.evaluate(([u, p]) => {
      localStorage.removeItem('laz_ingat');
      localStorage.setItem('laz_creds', btoa(unescape(encodeURIComponent(JSON.stringify({ u: u, p: p })))));
    }, [USER, SANDI]);
    await page.reload();
    await tungguAplikasi(page);
    isi = await isiPenyimpanan(page);
    cek('laz_creds hilang tanpa menunggu sesi habis', !('laz_creds' in isi) && !adaSandi(isi), Object.keys(isi));
    cek('sesi yang masih hidup tidak mengganggu', !!isi.laz_token, tokSesi);

    console.log('\n=== F. TANPA "INGAT SAYA" TIDAK ADA YANG TERSIMPAN ===');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    await page.fill('#lUser', USER);
    await page.fill('#lPass', SANDI);
    await page.uncheck('#lRemember');
    await page.click('#loginBtn');
    cek('masuk tanpa "Ingat saya" berhasil', await tungguMasuk(page));
    isi = await isiPenyimpanan(page);
    cek('tidak ada token ingat maupun sandi', !('laz_ingat' in isi) && !adaSandi(isi), Object.keys(isi));

    console.log('\n=== G. JARINGAN PUTUS SAAT MENYAMBUNG ULANG: TOKEN TIDAK BOLEH DICABUT ===');
    /* Bug ini ditemukan uji di atas secara acak (2 dari 6 percobaan): saat
       halaman dimuat ulang, permintaan loginIngat milik halaman lama terputus,
       kode menganggapnya "ditolak", lalu memanggil doLogout() yang mencabut
       token di server. Di sini putusnya dibuat PASTI supaya tidak bergantung
       pada kebetulan waktu. */
    await page.evaluate(() => { try { doLogout(); } catch (_) {} });
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    await page.fill('#lUser', USER);
    await page.fill('#lPass', SANDI);
    await page.check('#lRemember');
    await page.click('#loginBtn');
    await tungguMasuk(page);
    isi = await isiPenyimpanan(page);
    const ingatG = isi.laz_ingat;
    hapusSesi(isi.laz_token);
    catatanRpc = [];
    const putus = (route) => {
      const d = route.request().postData() || '';
      if (d.indexOf('"loginIngat"') >= 0) return route.abort('internetdisconnected');
      return route.continue();
    };
    await page.route('**/api/rpc', putus);
    await page.evaluate(() => { gas('apiDashboard')(TOKEN, 'Semua').catch(handleErr); });
    await page.waitForTimeout(2500);
    isi = await isiPenyimpanan(page);
    cek('token ingat tetap tersimpan di peramban', isi.laz_ingat === ingatG);
    cek('tidak ada panggilan Keluar', !catatanRpc.some((c) => c.fn === 'logout'), catatanRpc.map((c) => c.fn));
    cek('token ingat tetap berlaku di server', barisSesi().some((b) => b.token === hash(ingatG)));
    const pesan = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
    cek('amil diberi tahu koneksinya terputus', /terputus/i.test(pesan), pesan);
    await page.unroute('**/api/rpc', putus);
    await page.reload();
    cek('begitu jaringan pulih, aplikasi tersambung lagi tanpa layar masuk', await tungguAplikasi(page));

    cek('tidak ada galat JavaScript di halaman', galatHalaman.length === 0, galatHalaman.slice(0, 3));
  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: alur "Ingat saya" di peramban belum benar.\n'); process.exit(1); }
  console.log('\ntest_ingat_saya_ui.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
