/* Keterbacaan tema gelap di halaman utama LAZDigital dan halaman publik.
 *
 * KENAPA ADA. Pemilik melaporkan: di tema gelap ada bagian yang teksnya tetap hitam sehingga tidak terlihat (yang
 * ketemu: nama pengguna di bilah kiri, karena <button> tanpa `color` memakai hitam bawaan peramban). Pemindai
 * `_kontras.js` menghitung rasio kontras tiap teks terhadap latar efektifnya; di sini dijalankan di tiap menu, tab
 * Pengaturan, modal, layar masuk, dan halaman publik (lacak, laporan, harian) pada tema gelap. Latar gambar/gradien
 * dilewati pemindai, jadi ini jaring pengaman untuk warna yang tertulis mati, bukan pengganti mata.
 * jalankan:  node tools/test_kontras_gelap.js
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
const PINDAI = require('./_kontras.js');
const PUBLIK = path.join(__dirname, '..', 'src', 'public');
const BATAS = Number(process.env.BATAS_KONTRAS || 2.5);

const tgl = (i) => new Date(Date.UTC(2026, 8, 1 + (i % 25))).toISOString().slice(0, 10);
const himpun = [], tasy = [], donatur = [];
for (let i = 0; i < 12; i++) {
  himpun.push({ id: 'h' + i, noKwitansi: 'KW-' + i, tanggal: tgl(i), jenisDana: ['Zakat', 'Infak', 'Sedekah', 'Wakaf'][i % 4], subJenis: 'Umum', pilar: '', program: 'Program ' + (i % 3), namaDonatur: 'Donatur ' + i, jumlah: 100000 * (i + 1), metode: i % 2 ? 'Transfer' : 'Tunai', fundraising: '', dibuat: tgl(i) + 'T03:00:00.000Z' });
  tasy.push({ id: 't' + i, noBukti: 'BK-' + i, tanggal: tgl(i), namaPenerima: 'Penerima ' + i, program: 'Penyaluran', ashnaf: 'Fakir', sumberDana: 'Infak', jumlah: 50000 * (i + 1), dibuat: tgl(i) + 'T03:00:00.000Z' });
  donatur.push({ nama: 'Donatur ' + i, total: 100000 * (i + 1), jumlahTransaksi: i + 1, terakhir: tgl(i), kontak: '' });
}
const JAWAB = {
  apiBootstrap: () => ({ user: { id: 'u1', username: 'uji', nama: 'Petugas Uji', role: 'superadmin', permissions: {} }, settings: { namaLembaga: 'Lazismu Uji' }, webAppUrl: '' }),
  apiGetPermissionMeta: () => ({ modules: [], actions: [] }),
  apiListPenghimpunan: () => himpun,
  apiListPentasyarufan: () => tasy,
  apiGetDonaturAnalytics: () => donatur,
  apiListRekeningPublic: () => [], apiListLayananPublic: () => [],
};
const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    let fn = ''; try { fn = JSON.parse(body).fn || ''; } catch (_) {}
    const f = JAWAB[fn];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: f ? f() : (/^apiList/.test(fn) ? [] : {}) }));
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
  const cek = (n, s, info) => { if (s) { ok++; return; } g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 700)); };
  const galat = [];
  const baru = async (token, tema) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => galat.push(String(e).slice(0, 120)));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await p.addInitScript(([t, th]) => { try { if (t) localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', th); } catch (_) {} }, [token, tema]);
    return { ctx, p };
  };
  const pindai = async (p, nama) => {
    await p.waitForTimeout(900);
    const r = await p.evaluate(PINDAI, BATAS);
    cek(nama + ': semua teks terbaca di tema gelap', r.length === 0, r);
  };

  /* ---- layar masuk ---- */
  {
    const { ctx, p } = await baru(false, 'dark');
    await p.goto(A + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loginView:not(.hidden)', { timeout: 15000 });
    await pindai(p, 'layar masuk');
    await ctx.close();
  }
  /* ---- menu utama ---- */
  {
    const { ctx, p } = await baru(true, 'dark');
    await p.goto(A + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#appView:not(.hidden)', { timeout: 20000 });
    cek('tema gelap aktif', (await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
    for (const m of ['dashboard', 'penghimpunan', 'pentasyarufan', 'saldo', 'kll', 'donatur', 'laporan', 'users', 'settings', 'log']) {
      try { await p.evaluate((x) => go(x), m); } catch (e) { cek('menu ' + m + ' terbuka', false, String(e).slice(0, 100)); continue; }
      await pindai(p, 'menu ' + m);
    }
    /* Bilah kiri terbuka (nama pengguna dan peran baru tampil di sini; saat ciut disembunyikan). */
    await p.evaluate(() => { go('dashboard'); document.getElementById('appView').classList.remove('collapsed'); });
    await pindai(p, 'bilah kiri terbuka');
    await p.evaluate(() => go('settings')); await p.waitForTimeout(900);
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#content [onclick*="setTab("]')].map((x) => (x.getAttribute('onclick') || '').match(/setTab\('([^']+)'/)).filter(Boolean).map((m) => m[1]));
    for (const t of tabs) { await p.evaluate((x) => setTab(x), t); await pindai(p, 'pengaturan tab ' + t); }
    for (const [nama, menu, js] of [['impor penghimpunan', 'penghimpunan', "openImportModal('himpun')"], ['tambah user', 'users', 'formUser()'], ['impor mutasi bank', 'settings', 'openImportMutasiModal()']]) {
      try { await p.evaluate((x) => go(x), menu); await p.waitForTimeout(700); await p.evaluate(js); await pindai(p, 'modal ' + nama); await p.evaluate(() => { try { closeModal(); } catch (_) {} }); }
      catch (e) { cek('modal ' + nama + ' terbuka', false, String(e).slice(0, 100)); }
    }
    await p.evaluate(() => { confirmDialog({ title: 'Uji', message: 'Contoh', okText: 'Ya', cancelText: 'Batal', danger: true }); });
    await p.waitForSelector('.cd-card', { timeout: 8000 }); await pindai(p, 'dialog konfirmasi');
    await ctx.close();
  }
  /* ---- halaman publik ---- */
  for (const u of ['/lacak.html', '/lacak.html?n=001/PB/X/2026&k=ABCDEF', '/public.html?t=uji', '/harian.html?t=uji']) {
    const { ctx, p } = await baru(false, 'dark');
    await p.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, pesan: 'Tidak ditemukan' }) }));
    await p.goto(A + u, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(600);
    await pindai(p, 'halaman ' + u);
    await ctx.close();
  }
  cek('tidak ada galat JavaScript', galat.length === 0, galat.slice(0, 3));
  await b.close(); server.close();
  console.log('\ntest_kontras_gelap.js  ' + ok + '/' + (ok + g) + '  ' + (g ? 'ADA YANG GAGAL' : 'SEMUA LULUS') + '\n');
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
