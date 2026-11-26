/* Uji asap UI /sinkron-kl.html: halaman terbuka tanpa galat JS, kode akses
 * masuk, tab berganti, pilihan amil menjadi ajuan, tombol Simpan terkirim,
 * dan draft jaga-jaga muncul di localStorage. */
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
  tambah('Penghimpunan', { id: 'h1', tanggal: tgl(-2), jenisDana: 'Zakat', subJenis: 'Umum', pilar: 'Pendidikan', program: 'Beasiswa', namaDonatur: 'KLL Kota Contoh', jumlah: 1000000, metode: 'Transfer Bank', rekeningId: 'r1' });
  tambah('Rekening', { id: 'r1', namaBank: 'Bank Contoh', nomor: '123', atasNama: 'x', fundGroup: 'Infak', aktif: 'true' });
  tambah('UangMuka', { id: 'u1', tanggal: tgl(-30), jenis: 'keluar', dana: 'Zakat', layanan: 'KLL Kota Contoh', akun: 'Bank', nominal: 4000000, keterangan: 'UMP Beasiswa', section: 'UMP', petugas: 'admin' });
  tambah('Pentasyarufan', { id: 'p1', tanggal: tgl(-5), ashnaf: 'Fakir', program: 'Program Beasiswa', sumberDana: 'Zakat', namaPenerima: 'KLL Kota Contoh', jumlah: 1000000, metode: 'Transfer Bank', rekeningId: 'r1', section: 'UMP LPJ' });
  const kd = (await rpc('apiBuatKodeAksesKL', [TOKEN])).daftar[0].kode;

  let ok = 0, g = 0;
  const cek = (n, sy, i) => { if (sy) { ok++; console.log('  OK   | ' + n); } else { g++; console.log('  GAGAL| ' + n + (i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 300))); } };
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(CHROMIUM);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const p = await ctx.newPage();
  const galat = [];
  p.on('pageerror', (e) => galat.push(String(e).slice(0, 140)));
  await p.goto(A + '/sinkron-kl.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  cek('Halaman terbuka tanpa galat JS', galat.length === 0, galat);
  cek('Layar loading logo terpasang (lz-muat / boot sama)', await p.evaluate(() => !!document.querySelector('.lz-muat, #boot, .lz-logo-svg')));

  await p.fill('#klKode', kd);
  await p.click('#klBtn');
  await p.waitForSelector('.kl-hero', { timeout: 15000 });
  cek('Kode akses (yang sama dengan cek saldo) membuka halaman sinkron', await p.evaluate(() => !!document.querySelector('.kl-hero')));
  cek('Empat tab tampil: Penghimpunan / UMP & LPJ / Ringkasan / Log', await p.evaluate(() => [...document.querySelectorAll('.kl-tab')].map((t) => t.getAttribute('data-t')).join(',') === 'himpun,ump,ringkas,log'));
  cek('Tabel setoran punya kolom Diambil amil dengan persen amil di sub', await p.evaluate(() => { const ada = [...document.querySelectorAll('.kl-tbl .sub')].some((s) => /amil/.test(s.textContent)); return ada && !!document.querySelector('.kl-ambil'); }));

  await p.selectOption('.kl-ambil', 'sudah');
  cek('Pilih "Sudah" membuat ajuan: tombol Simpan menyala + draft masuk localStorage', await p.evaluate(() => { const b = document.getElementById('klSimpanBtn'); return b && !b.disabled && (localStorage.getItem('sinkronKLDraft_' + localStorage.getItem('klKode')) || '').indexOf('sudah') >= 0; }));
  cek('Tanda ajuan: sel jadi bergaris oranye', await p.evaluate(() => !!document.querySelector('.kl-ambil.ajuan, .kl-edit.ajuan')));

  await p.click('#klSimpanBtn');
  await p.waitForFunction(() => { const bar = document.getElementById('klSavebar'); return !bar || /sudah tersimpan/.test(bar.textContent) || /Gagal/.test(bar.textContent); }, null, { timeout: 15000 });
  cek('Simpan terkirim: savebar kembali "semua tersimpan"', await p.evaluate(() => { const bar = document.getElementById('klSavebar'); return bar && /sudah tersimpan/.test(bar.textContent); }), await p.evaluate(() => (document.getElementById('klSavebar') || {}).textContent));
  cek('Draft jaga-jaga dibersihkan setelah terkirim', await p.evaluate(() => !localStorage.getItem('sinkronKLDraft_' + localStorage.getItem('klKode'))));

  await p.evaluate(() => document.querySelectorAll('.kl-tab')[3].click());
  cek('Tab Log menampilkan catatan ajuan', await p.evaluate(() => /ajuan baru/.test(document.getElementById('klIsi').textContent)));
  await p.evaluate(() => document.querySelectorAll('.kl-tab')[2].click());
  cek('Tab Ringkasan: hasil sementara + pemisahan amil', await p.evaluate(() => /Hasil sementara|hasil sementara/.test(document.getElementById('klIsi').textContent) && /diambil/.test(document.getElementById('klIsi').textContent)));

  cek('Tidak ada galat JS sepanjang alur', galat.length === 0, galat);
  console.log('\ntest_sinkron_kl_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  await b.close(); srv.close();
  setTimeout(() => process.exit(g ? 1 : 0), 200).unref();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
