/* Uji tiga permintaan pemilik (1 Oktober 2026), di peramban sungguhan:
 *
 *  A. Rekap bulanan TIDAK wajib, tetapi ditawarkan. Setelah jurnal dianalisis
 *     tanpa rekap, pratinjau menampilkan tawaran "Cantumkan rekap" yang
 *     langsung membuka pemilih berkas. Begitu rekap terbaca, tawarannya hilang.
 *  B. Saldo KLL & ULL ringkas: kalimat penjelasan panjang dibuang, sisa saldo
 *     hijau dan sedikit lebih besar, belum LPJ diberi tanda merah (hanya kalau
 *     memang ada yang belum di-LPJ-kan).
 *  C. Urutan menu kiri bisa diatur sendiri: ditarik ke atas/bawah atau lewat
 *     tombol naik/turun, tersimpan per akun di server, menu teratas jadi
 *     halaman pertama sesudah masuk, dan bisa dikembalikan ke urutan awal.
 *
 * Datanya BUATAN.
 *
 *   node tools/test_tampilan_kll_menu.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

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
const XLSX = require(path.join(AKAR, 'node_modules', 'xlsx'));
const SHEETJS = [path.join(AKAR, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), path.join(AKAR, 'node_modules', 'xlsx', 'xlsx.js')]
  .find((f) => fs.existsSync(f));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 260)); }
};
const SANDI = 'Admin12345';
const TAHUN = new Date().getFullYear();
let DB = null, TOKEN = '', ID_ADMIN = '';
const LAY = {};

function tambahBaris(nama, o) {
  const t = DB.sheets[nama], h = t[0];
  t.push(h.map((k) => (o[k] === undefined ? '' : o[k])));
}
function nilaiSetting(k) {
  const t = DB.sheets.Settings, h = t[0];
  const r = t.slice(1).find((x) => x[h.indexOf('key')] === k);
  return r ? r[h.indexOf('value')] : undefined;
}
async function rpc(fn, args) {
  const out = await engine.runRPC(DB, fn, args, {});
  DB = out.db; return out.result;
}
async function siapkanDB() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const r = await rpc('login', ['superadmin', SANDI]);
  TOKEN = r.token; ID_ADMIN = r.user.id;
  for (const [tipe, nama] of [['KLL', 'Kota Contoh'], ['KLL', 'Desa Contoh']]) {
    await rpc('apiSaveLayanan', [TOKEN, { tipe, nama, aktif: 'true' }]);
  }
  const t = DB.sheets.Layanan, h = t[0];
  t.slice(1).forEach((x) => { LAY[x[h.indexOf('nama')]] = x[h.indexOf('id')]; });
  /* Kota Contoh: setor 10 jt, uang muka 3 jt belum di-LPJ-kan.
     Desa Contoh: setor 2 jt, tidak mengambil uang muka. */
  tambahBaris('Penghimpunan', { id: 'p1', tanggal: TAHUN + '-01-10', jenisDana: 'Infak', namaDonatur: 'KLL Kota Contoh', tipeDonatur: 'KLL', layananId: LAY['Kota Contoh'], jumlah: 10000000, metode: 'Tunai' });
  tambahBaris('Penghimpunan', { id: 'p2', tanggal: TAHUN + '-01-11', jenisDana: 'Infak', namaDonatur: 'KLL Desa Contoh', tipeDonatur: 'KLL', layananId: LAY['Desa Contoh'], jumlah: 2000000, metode: 'Tunai' });
  tambahBaris('UangMuka', { id: 'u1', tanggal: TAHUN + '-01-12', jenis: 'keluar', dana: 'Infak', layanan: 'KLL Kota Contoh', nominal: 3000000, keterangan: 'Uang muka program' });
}

/* Jurnal kas buatan secukupnya untuk membuka pratinjau. */
function buatJurnal(f) {
  const seri = (t) => (Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  const baris = [['', 'PENERIMAAN INFAK UMUM VIA KAS', '', '', '']];
  const pasang = (tgl, d, k, n, ket) => { baris.push([tgl, d, n, '', ket]); baris.push([tgl, k, '', n, ket]); };
  pasang('2026-09-03', 'Kas Infak', 'Penerimaan Infak Umum', 250000, 'Infak Umum Donatur Satu');
  pasang('2026-09-04', 'Kas Infak', 'Penerimaan Infak Umum', 500000, 'Infak Umum KLL Kota Contoh');
  const ws = XLSX.utils.aoa_to_sheet(baris.map((r) => r.map((c, j) => (j === 0 ? '' : c))));
  baris.forEach((r, i) => { if (r[0]) ws['A' + (i + 1)] = { t: 'n', v: seri(r[0]), z: 'd/m/yyyy' }; });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, f);
}
function buatRekap(f) {
  const seri = (t) => (Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  const isi = [
    ['TANGGAL', 'NAMA', 'KETERANGAN', 'PROGRAM PENERIMAAN', 'JUMLAH', 'MELALUI', 'Kasir'],
    ['2026-09-03', 'Donatur Satu', 'Infak Umum', 'Infak Tanpa Pembatasan', 250000, 'BANTUL', 'Kantor'],
    ['2026-09-04', 'KL Lazismu Kota Contoh', 'Infak Umum', 'Infak Tanpa Pembatasan', 500000, 'BANTUL', 'Kantor'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(isi.map((r) => r.map((c, j) => (j === 0 ? '' : c))));
  isi.forEach((r, i) => { if (i && r[0]) ws['A' + (i + 1)] = { t: 'n', v: seri(r[0]), z: 'd/m/yyyy' }; });
  ws.A1 = { t: 's', v: 'TANGGAL' };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'HIMPUN');
  XLSX.writeFile(wb, f);
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
  if (!SHEETJS) { console.log('SheetJS lokal tidak ada di node_modules/xlsx, uji dilewati.'); process.exit(2); }
  await siapkanDB();

  console.log('\n=== C0. PENJAGA DI SERVER ===');
  let tolak = '';
  try { await rpc('apiSaveSettings', [TOKEN, { ['um_' + ID_ADMIN]: '["log"]' }]); } catch (e) { tolak = e.message; }
  cek('urutan menu tidak bisa ditulis lewat Pengaturan umum', /IZIN/.test(tolak), tolak);
  tolak = '';
  try { await rpc('apiUpdateMyProfile', [TOKEN, { urutanMenu: ['dashboard', '<img onerror=x>'] }]); } catch (e) { tolak = e.message; }
  cek('urutan berisi nama menu aneh ditolak', /urutan menu/i.test(tolak), tolak);
  tolak = '';
  try { await rpc('apiUpdateMyProfile', [TOKEN, { urutanMenu: 'log' }]); } catch (e) { tolak = e.message; }
  cek('urutan yang bukan daftar ditolak', /urutan menu/i.test(tolak), tolak);
  cek('setelah ditolak, tidak ada yang tersimpan', !nilaiSetting('um_' + ID_ADMIN), nilaiSetting('um_' + ID_ADMIN));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-kll-menu-'));
  const berkas = path.join(tmp, 'Kas_contoh.xlsx'); buatJurnal(berkas);
  const berkasRekap = path.join(tmp, 'Rekap_contoh.xlsx'); buatRekap(berkasRekap);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ALAMAT = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(CHROMIUM);
  const ctx = await browser.newContext({ timezoneId: 'Asia/Jakarta', viewport: { width: 1280, height: 900 } });
  await ctx.route(/cdn\.sheetjs\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(SHEETJS) }));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!cdn\.sheetjs\.com)/, (r) => r.abort());
  await ctx.addInitScript(() => { try { navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()); } catch (_) {} });
  const page = await ctx.newPage();
  const galatHalaman = [];
  page.on('pageerror', (e) => galatHalaman.push(e.message));
  const masuk = async () => {
    await page.goto(ALAMAT + '/');
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (_) {} });
    await page.goto(ALAMAT + '/');
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    await page.fill('#lUser', 'superadmin');
    await page.fill('#lPass', SANDI);
    await page.click('#loginBtn');
    await page.waitForFunction(() => !document.getElementById('appView').classList.contains('hidden'), null, { timeout: 20000 });
    await page.waitForSelector('#nav .tn-item', { timeout: 10000 });
    await page.waitForTimeout(900);
  };
  const urutanNav = () => page.evaluate(() => [...document.querySelectorAll('#nav .tn-item[id^="nav_"]:not(#nav_atur_urutan)')].map((b) => b.id.slice(4)));

  try {
    await masuk();

    console.log('\n=== A. REKAP TIDAK WAJIB, TETAPI DITAWARKAN ===');
    await page.evaluate(() => viewPenghimpunan());
    await page.waitForTimeout(400);
    await page.evaluate(() => openImportJurnalBerkas());
    await page.waitForSelector('#impb_jenis', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
      set('impb_jenis', 'kas'); set('impb_bulan', '09'); set('impb_tahun', '2026');
    });
    await page.setInputFiles('#import_file', berkas);
    await page.waitForFunction(() => typeof IMPORT_FILE_TSV !== 'undefined' && IMPORT_FILE_TSV, null, { timeout: 15000 });
    await page.click('#importTarikBtn');
    await page.waitForFunction(() => window.IMPORT_TEMP_RES && window.IMPORT_TEMP_IS_JURNAL, null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const tawar = await page.$('#imporTawarRekap');
    cek('tanpa rekap, pratinjau menawarkan "Cantumkan rekap"', tawar !== null);
    const teksTawar = tawar ? await tawar.innerText() : '';
    cek('tawarannya menyebut boleh dilewati', /boleh dilewati/i.test(teksTawar), teksTawar);
    cek('tombol Simpan tetap bisa dipakai tanpa rekap',
      await page.evaluate(() => { const b = document.getElementById('importSimpanBtn'); return !!b && !b.disabled; }));
    let pemilih = null;
    if (tawar) {
      const tunggu = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
      await page.click('#imporTawarRekap button');
      pemilih = await tunggu;
    }
    cek('tombol di tawaran langsung membuka pemilih berkas rekap', !!pemilih);
    if (pemilih) {
      await pemilih.setFiles(berkasRekap);
      await page.waitForFunction(() => (window.IMPORT_TEMP_RES.temuan || []).some((t) => /^rekap/.test(t.jenis)), null, { timeout: 20000 });
      await page.waitForTimeout(200);
    }
    cek('setelah rekap dicantumkan, tawarannya hilang', (await page.$('#imporTawarRekap')) === null);
    await page.evaluate(() => closeModal());

    console.log('\n=== B. SALDO KLL & ULL RINGKAS ===');
    await page.evaluate(() => go('kll'));
    await page.waitForSelector('#kllTabel .kll-baris', { timeout: 15000 });
    await page.waitForTimeout(300);
    const isi = await page.evaluate(() => document.getElementById('kllBody').textContent);
    cek('kalimat "Klik nama kantor untuk melihat rincian..." sudah tidak ada', !/Klik nama kantor/i.test(isi));
    cek('baris hitungan "N setoran · N uang muka" di bawah nama kantor sudah tidak ada', (await page.$('.kll-nama-k')) === null);
    cek('kartu ringkas memakai label "Sisa saldo"', /Sisa saldo/.test(isi), isi.slice(0, 200));
    const sisa = await page.evaluate(() => {
      const r = [...document.querySelectorAll('#kllTabel .kll-baris')].find((x) => /Kota Contoh/.test(x.innerText));
      const s = r && r.querySelector('.kll-n.sisa');
      const lain = r && r.querySelector('.kll-n[data-l="Setoran"]');
      if (!s || !lain) return null;
      const cs = getComputedStyle(s), cl = getComputedStyle(lain);
      const hijau = getComputedStyle(document.documentElement).getPropertyValue('--green').trim();
      return { warna: cs.color, besar: parseFloat(cs.fontSize), kecil: parseFloat(cl.fontSize), tebal: Number(cs.fontWeight), hijau, teks: s.innerText };
    });
    const rgbHijau = await page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--green)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    cek('sisa saldo berwarna hijau', !!sisa && sisa.warna === rgbHijau, [sisa, rgbHijau]);
    cek('sisa saldo sedikit lebih besar dari angka lain', !!sisa && sisa.besar > sisa.kecil + 1 && sisa.besar <= sisa.kecil + 5, sisa);
    cek('sisa saldo tebal', !!sisa && sisa.tebal >= 700, sisa);
    const lpj = await page.evaluate(() => {
      const ambil = (nama) => {
        const r = [...document.querySelectorAll('#kllTabel .kll-baris')].find((x) => x.innerText.indexOf(nama) >= 0);
        const tanda = r && r.querySelector('.kll-lpj');
        const merah = (() => { const d = document.createElement('i'); d.style.color = 'var(--red)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })();
        return { ada: !!tanda, warna: tanda ? getComputedStyle(tanda).color : '', merah, teks: tanda ? tanda.innerText : '', tandaBaris: r ? r.classList.contains('ada-lpj') : null };
      };
      return { kota: ambil('Kota Contoh'), desa: ambil('Desa Contoh') };
    });
    cek('kantor yang belum LPJ diberi tanda merah', lpj.kota.ada && lpj.kota.warna === lpj.kota.merah, lpj.kota);
    cek('tanda merahnya memuat nominal belum LPJ Rp 3.000.000', /3\.000\.000/.test(lpj.kota.teks), lpj.kota);
    cek('baris kantornya ikut ditandai', lpj.kota.tandaBaris === true, lpj.kota);
    cek('kantor yang tidak punya tunggakan LPJ tidak diberi tanda merah', !lpj.desa.ada && lpj.desa.tandaBaris === false, lpj.desa);
    const kpiLpj = await page.evaluate(() => {
      const k = [...document.querySelectorAll('.saldo-kpi .kpi-v2')].find((x) => /Belum LPJ/.test(x.textContent));
      const v = k && k.querySelector('.kpi-v2-value');
      const merah = (() => { const d = document.createElement('i'); d.style.color = 'var(--red)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })();
      return { warna: v ? getComputedStyle(v).color : '', merah };
    });
    cek('angka kartu "Belum LPJ" merah', kpiLpj.warna === kpiLpj.merah, kpiLpj);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#kllTabel .kll-nama b')].find((x) => /Kota Contoh/.test(x.textContent)); kllBuka(b.textContent.trim()); });
    await page.waitForSelector('.kll-alur', { timeout: 10000 });
    const rinci = await page.evaluate(() => document.querySelector('.saldo-buku').innerText);
    cek('rincian kantor tanpa kalimat panjang "sudah di-LPJ-kan ..."', !/di-LPJ-kan/.test(rinci), rinci.slice(0, 300));
    cek('rincian tanpa keterangan kecil di bawah tiap angka', (await page.$('.kll-alur-k2')) === null);
    cek('rincian tetap menyebut belum LPJ dengan tanda merah', await page.evaluate(() => !!document.querySelector('.saldo-buku .kll-lpj')));

    console.log('\n=== C. URUTAN MENU KIRI ===');
    const awal = await urutanNav();
    cek('urutan awal dimulai dari Dashboard', awal[0] === 'dashboard', awal);
    cek('ada tombol "Atur urutan menu" di bilah kiri', (await page.$('#nav_atur_urutan')) !== null);
    await page.click('#nav_atur_urutan');
    await page.waitForSelector('.um-daftar .um-baris', { timeout: 5000 });
    const diModal = await page.evaluate(() => [...document.querySelectorAll('.um-daftar .um-baris')].map((x) => x.getAttribute('data-id')));
    cek('jendela urutan memuat semua menu yang terlihat, sama urutannya', JSON.stringify(diModal) === JSON.stringify(awal), [diModal, awal]);
    /* tarik "Saldo KLL & ULL" ke paling atas lewat pegangannya */
    const pegang = await page.$('.um-baris[data-id="kll"] .um-pegang');
    const atas = await page.$('.um-baris[data-id="dashboard"]');
    const bp = await pegang.boundingBox(), ba = await atas.boundingBox();
    await page.mouse.move(bp.x + bp.width / 2, bp.y + bp.height / 2);
    await page.mouse.down();
    await page.mouse.move(bp.x + bp.width / 2, ba.y + 4, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    let modalUrut = await page.evaluate(() => [...document.querySelectorAll('.um-daftar .um-baris')].map((x) => x.getAttribute('data-id')));
    cek('ditarik ke atas: "Saldo KLL & ULL" jadi teratas', modalUrut[0] === 'kll', modalUrut);
    /* tombol naik/turun untuk layar sentuh */
    const iLap = modalUrut.indexOf('laporan');
    await page.click('.um-baris[data-id="laporan"] .um-naik');
    modalUrut = await page.evaluate(() => [...document.querySelectorAll('.um-daftar .um-baris')].map((x) => x.getAttribute('data-id')));
    cek('tombol naik menggeser satu tingkat', modalUrut.indexOf('laporan') === iLap - 1, modalUrut);
    await page.click('.um-baris[data-id="dashboard"] .um-turun');
    modalUrut = await page.evaluate(() => [...document.querySelectorAll('.um-daftar .um-baris')].map((x) => x.getAttribute('data-id')));
    cek('tombol turun menggeser satu tingkat', modalUrut.indexOf('dashboard') === 2, modalUrut);
    cek('tombol naik di baris teratas dimatikan', await page.evaluate(() => document.querySelector('.um-daftar .um-baris .um-naik').disabled));
    const harap = modalUrut.slice();
    await page.click('#umSimpan');
    await page.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), null, { timeout: 10000 });
    await page.waitForTimeout(300);
    cek('bilah kiri langsung mengikuti urutan baru', JSON.stringify(await urutanNav()) === JSON.stringify(harap), [await urutanNav(), harap]);
    const simpanan = nilaiSetting('um_' + ID_ADMIN);
    cek('urutan tersimpan di server untuk akun ini', !!simpanan && JSON.parse(simpanan)[0] === 'kll', simpanan);
    cek('tombol atur urutan tetap paling bawah', await page.evaluate(() => { const n = document.getElementById('nav'); return n.lastElementChild && n.lastElementChild.id === 'nav_atur_urutan'; }));

    await masuk();
    cek('sesudah masuk lagi, urutannya tetap', JSON.stringify(await urutanNav()) === JSON.stringify(harap), await urutanNav());
    cek('menu teratas jadi halaman pertama yang dibuka', await page.evaluate(() => { const a = document.querySelector('#nav .tn-item.active'); return a && a.id; }) === 'nav_kll');

    await page.click('#nav_atur_urutan');
    await page.waitForSelector('#umAwal', { timeout: 5000 });
    await page.click('#umAwal');
    const kembali = await page.evaluate(() => [...document.querySelectorAll('.um-daftar .um-baris')].map((x) => x.getAttribute('data-id')));
    cek('"Kembalikan urutan awal" menyusun ulang seperti bawaan', JSON.stringify(kembali) === JSON.stringify(awal), kembali);
    await page.click('#umSimpan');
    await page.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), null, { timeout: 10000 });
    await page.waitForTimeout(300);
    cek('setelah disimpan, bilah kiri kembali ke urutan awal', JSON.stringify(await urutanNav()) === JSON.stringify(awal), await urutanNav());
    cek('simpanan di server dikosongkan', !nilaiSetting('um_' + ID_ADMIN), nilaiSetting('um_' + ID_ADMIN));

    await page.setViewportSize({ width: 390, height: 800 });
    await page.evaluate(() => go('kll'));
    await page.waitForSelector('#kllTabel .kll-baris', { timeout: 15000 });
    await page.waitForTimeout(300);
    const hp = await page.evaluate(() => {
      const s = document.querySelector('#kllTabel .kll-n.sisa');
      return { label: s ? getComputedStyle(s, '::before').content : '', lebarHalaman: document.documentElement.scrollWidth };
    });
    cek('di layar ponsel angka sisa berlabel "Sisa saldo"', /Sisa saldo/.test(hp.label), hp);
    cek('di layar ponsel tidak ada geser ke samping', hp.lebarHalaman <= 390, hp);

    cek('tidak ada galat JavaScript di halaman', galatHalaman.length === 0, galatHalaman);
  } finally {
    await browser.close();
    srv.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: tawaran rekap, Saldo KLL, atau urutan menu belum benar.\n'); process.exit(1); }
  console.log('\ntest_tampilan_kll_menu.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
