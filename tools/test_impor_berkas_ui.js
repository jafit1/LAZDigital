/* Uji Impor Jurnal per Berkas di peramban sungguhan, zona waktu WIB.
 *
 * test_impor_berkas.js memeriksa mesinnya. Berkas ini memeriksa yang dialami
 * amil: memilih jenis berkas dan bulan, mengunggah Excel, melihat temuan di
 * atas pratinjau, membetulkan langsung di layar, melihat ringkasan Daerah /
 * KLL / ULL berubah, lalu menyimpan. Yang tersimpan harus yang sudah
 * dibetulkan, dan baris yang dilewati tidak boleh ikut.
 *
 * Peramban dijalankan dengan zona Asia/Jakarta karena di zona itulah tanggal
 * dulu mundur satu hari. SheetJS dari CDN diganti salinan lokal di
 * node_modules; permintaan keluar lainnya ditolak.
 *
 * Datanya BUATAN, ditulis ke folder sementara lalu dihapus.
 *
 *   node tools/test_impor_berkas_ui.js
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
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const XLSX = require(path.join(AKAR, 'node_modules', 'xlsx'));
const SHEETJS = [path.join(AKAR, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), path.join(AKAR, 'node_modules', 'xlsx', 'xlsx.js')]
  .find((f) => fs.existsSync(f));


/* Bentuk tombol di jendela impor (pemilik, 2 Oktober 2026: "tombol batal dan
   sejajarnya masih jelek"). Diukur, bukan dilihat: tinggi, posisi, dan apakah
   tombol sekunder benar-benar tampak sebagai tombol (berbingkai). */
const bentukKaki = (page) => page.evaluate(() => [...document.querySelectorAll('#modalFoot button')].filter((b) => b.offsetParent).map((b) => {
  const r = b.getBoundingClientRect(), c = getComputedStyle(b);
  return { teks: b.textContent.trim(), atas: Math.round(r.top), tinggi: Math.round(r.height), kiri: Math.round(r.left),
    bingkai: c.borderTopStyle !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c.borderTopColor) && parseFloat(c.borderTopWidth) > 0,
    gradasi: c.backgroundImage !== 'none' };
}));
/* Kaki jendela sesudah dianalisis: Batal, baris status, Tarik Ulang, Simpan.
   Semua tombol harus tetap di dalam jendela (tidak terpotong di HP) dan
   tombol Simpan tidak boleh melebar karena labelnya (dulu 330 px saat
   berbunyi "Tetap simpan (3 temuan belum diputuskan)"). */
const kakiLengkap = (page) => page.evaluate(() => {
  const kaki = document.getElementById('modalFoot'), info = document.getElementById('imporKakiInfo');
  const rk = kaki.getBoundingClientRect(), kartu = document.getElementById('modalCard').getBoundingClientRect();
  const tombol = [...kaki.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { teks: b.textContent.trim(), kiri: r.left, kanan: r.right, lebar: Math.round(r.width), tinggi: Math.round(r.height), atas: Math.round(r.top) }; });
  const ri = info ? info.getBoundingClientRect() : null;
  return { tombol, info: info ? info.innerText.trim() : null, kelas: info ? info.className : '', infoKiri: ri ? ri.left : 0, infoKanan: ri ? ri.right : 0,
    dalam: tombol.every((t) => t.kiri >= kartu.left - 0.5 && t.kanan <= kartu.right + 0.5), kakiKanan: rk.right };
});
let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 260)); }
};
const SANDI = 'Admin12345';
let DB = null;
const LAY = {};
async function siapkanDB() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const r = await engine.runRPC(DB, 'login', ['superadmin', SANDI], {});
  DB = r.db;
  for (const [tipe, nama] of [['KLL', 'Bantul Kota'], ['KLL', 'Imogiri'], ['ULL', 'Masjid Baiturrahman Aceh'], ['ULL', 'Masjid Al Ikhlas']]) {
    DB = (await engine.runRPC(DB, 'apiSaveLayanan', [r.result.token, { tipe, nama, aktif: 'true' }], {})).db;
  }
  const t = DB.sheets.Layanan, h = t[0];
  t.slice(1).forEach((x) => { LAY[x[h.indexOf('nama')]] = x[h.indexOf('id')]; });
}
function tabel(n) {
  const t = DB.sheets[n], h = t[0];
  return t.slice(1).map((r) => { const o = {}; h.forEach((k, j) => { o[k] = r[j]; }); return o; });
}

/* Buku kerja buatan: tanggal sebagai nomor seri Excel, persis seperti berkas
   unduhan Google Sheets, supaya kekeliruan zona waktu ikut teruji. */
/* Rekap bulanan buatan, bentuk sheetnya sama dengan rekap pemilik. */
function buatRekap(f) {
  const seri = (t) => (Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  const himpun = [
    ['TANGGAL', 'NAMA', 'KETERANGAN', 'PROGRAM PENERIMAAN', 'JUMLAH', 'MELALUI', 'Kasir'],
    ['2026-09-01', 'KL Lazismu Imogiri', 'Infak Umum', 'Infak Tanpa Pembatasan', 400000, 'BANTUL', 'Kantor'],
    ['2026-09-30', 'KL Lazismu Bantul Kota', 'Infak Umum', 'Infak Tanpa Pembatasan', 2500000, 'BANTUL', 'Kantor'],
    ['2026-09-12', 'Unit Layanan Masjid Baiturrahman Aceh', 'Infak Umum', 'Infak Tanpa Pembatasan', 150000, 'BANTUL', 'Kantor'],
    ['2026-09-14', 'Donatur Karangan', 'Infak Terikat Kekeringan', 'Infak Pembatasan Lingkungan Lainnya', 75000, 'BANTUL', 'Kantor'],
    ['2026-09-07', 'Donatur Kedua', 'Zakat Mal', 'Tanpa Pembatasan Zakat Maal', 120000, 'BANTUL', 'Kantor'],
    ['2026-09-24', 'KL Lazismu Bantul Kota', 'Infak Terikat Ambulan', 'Peduli Kesehatan & Mobile Clinic/Ambulance', 1000000, 'BANTUL', 'Kantor'],
    ['2026-09-20', 'Donatur Rekap', 'Infak Umum', 'Infak Tanpa Pembatasan', 50000, 'BANTUL', 'Kantor'],
    ['', '', '', '', 4295000, '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(himpun.map((r) => r.map((c, j) => (j === 0 ? '' : c))));
  himpun.forEach((r, i) => { if (i && r[0]) ws['A' + (i + 1)] = { t: 'n', v: seri(r[0]), z: 'd/m/yyyy' }; });
  ws.A1 = { t: 's', v: 'TANGGAL' };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'HIMPUN');
  XLSX.writeFile(wb, f);
}

function buatBerkas(f) {
  const seri = (t) => (Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  const baris = [];
  const pasang = (tgl, d, k, n, ket) => { baris.push([tgl, d, n, '', ket]); baris.push([tgl, k, '', n, ket]); };
  baris.push(['', 'PENERIMAAN INFAK UMUM VIA KAS', '', '', '']);
  pasang('2026-09-01', 'Kas Infak', 'Penerimaan Infak Umum', 400000, 'Infak Umum KLL Imogiri');
  pasang('2026-09-30', 'Kas Infak', 'Penerimaan Infak Umum', 2500000, 'Infak Umum Bantul Kota');
  pasang('2026-09-12', 'Kas Infak', 'Penerimaan Infak Umum', 150000, 'Infak Umum ULL Masjid');
  pasang('2026-09-14', 'Kas Infak', 'Penerimaan Infak Umum', 75000, 'Infak Umum Donatur Karangan');
  pasang('2026-09-15', 'Kas Infak', 'Penerimaan Infak Umum', 10, 'Infak Umum NN');
  baris.push(['', 'PENERIMAAN ZAKAT VIA KAS', '', '', '']);
  pasang('2026-06-07', 'Kas Zakat', 'Penerimaan Zakat Mal', 120000, 'Zakat Mal Donatur Kedua');
  baris.push(['', 'PENERIMAAN INFAK TERIKAT VIA KAS', '', '', '']);
  pasang('2026-09-24', 'Kas Infak', 'Penerimaan Infak Terikat - Pendidikan', 1000000, 'KLL Bantul Kota Infak Ambulan');
  const ws = XLSX.utils.aoa_to_sheet(baris.map((r) => r.map((c, j) => (j === 0 ? '' : c))));
  baris.forEach((r, i) => { if (r[0]) ws['A' + (i + 1)] = { t: 'n', v: seri(r[0]), z: 'd/m/yyyy' }; });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-impor-berkas-'));
  const berkas = path.join(tmp, 'Kas_contoh.xlsx');
  buatBerkas(berkas);
  const berkasRekap = path.join(tmp, 'Rekap_contoh.xlsx');
  buatRekap(berkasRekap);
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
  const teksPratinjau = () => page.evaluate(() => (document.getElementById('importPreview') || {}).innerText || '');
  const klikAksi = async (jenisTeks, aksi) => {
    const ok_ = await page.evaluate(([j, a]) => {
      const t = (window.IMPORT_TEMP_RES.temuan || []).find((x) => x.judul.indexOf(j) >= 0);
      if (!t) return false;
      const b = document.querySelector('.imp-temu-aksi[data-t="' + t.id + '"][data-aksi="' + a + '"]');
      if (!b) return false;
      b.click(); return true;
    }, [jenisTeks, aksi]);
    await page.waitForTimeout(150);
    return ok_;
  };

  try {
    console.log('\n=== A. MEMBUKA MENU ===');
    await page.goto(ALAMAT + '/');
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    await page.fill('#lUser', 'superadmin');
    await page.fill('#lPass', SANDI);
    await page.click('#loginBtn');
    await page.waitForFunction(() => !document.getElementById('appView').classList.contains('hidden'), null, { timeout: 20000 });
    /* Dashboard bawaan bisa selesai digambar SESUDAH halaman Penghimpunan
       dibuka dan menimpanya, jadi tombolnya dicari dan diklik dalam satu
       langkah, diulang sampai jendela impor benar-benar terbuka. */
    await page.waitForTimeout(800);
    await page.evaluate(() => viewPenghimpunan());
    let adaTombol = false;
    for (let i = 0; i < 40 && !(await page.$('#impb_jenis')); i++) {
      const diklik = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /Impor Jurnal per Berkas/.test(x.textContent));
        if (!b) { if (!document.querySelector('.table-wrap')) viewPenghimpunan(); return false; }
        b.click(); return true;
      });
      adaTombol = adaTombol || diklik;
      await page.waitForTimeout(250);
    }
    cek('tombol "Impor Jurnal per Berkas" ada di Penghimpunan', adaTombol);
    await page.waitForSelector('#impb_jenis', { state: 'attached', timeout: 10000 });
    cek('judul jendelanya "Impor Jurnal per Berkas"', (await page.textContent('#modalTitle')).trim() === 'Impor Jurnal per Berkas');
    let kaki = await bentukKaki(page);
    cek('tombol bawah sama tinggi dan sejajar', kaki.length >= 2 && kaki.every((x) => x.tinggi === kaki[0].tinggi && Math.abs(x.atas - kaki[0].atas) <= 1), kaki);
    cek('"Batal" tampak sebagai tombol berbingkai, bukan tulisan polos', (kaki.find((x) => x.teks === 'Batal') || {}).bingkai === true, kaki);
    cek('sebelum dianalisis, "Tarik & Analisis Data" jadi tombol utama', (kaki.find((x) => /Tarik/.test(x.teks)) || {}).gradasi === true, kaki);
    cek('"Batal" dipisah di kiri, jauh dari tombol utama', (kaki.find((x) => x.teks === 'Batal') || {}).kiri < Math.min(...kaki.filter((x) => x.teks !== 'Batal').map((x) => x.kiri)) - 100, kaki);
    cek('ada pilihan jenis berkas, bulan, dan tahun',
      await page.evaluate(() => !!(document.getElementById('impb_jenis') && document.getElementById('impb_bulan') && document.getElementById('impb_tahun'))));
    cek('pilihan metode dan rekening bawaan tidak ditampilkan (jurnal sudah menyebutnya)',
      await page.evaluate(() => !document.getElementById('import_default_metode') && !document.getElementById('import_default_rekening')));
    await page.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
      /* Sengaja salah: pemilik pernah mengunggah jurnal BANK dengan pilihan
         bawaan "Jurnal Kas", dan rekapnya jadi 538 temuan (yang benar 61). */
      set('impb_jenis', 'bank'); set('impb_bulan', '09'); set('impb_tahun', '2026');
    });

    console.log('\n=== B. UNGGAH, TANGGAL TIDAK MUNDUR, TEMUAN TAMPIL ===');
    await page.setInputFiles('#import_file', berkas);
    await page.waitForFunction(() => window.IMPORT_FILE_TSV || (typeof IMPORT_FILE_TSV !== 'undefined' && IMPORT_FILE_TSV), null, { timeout: 15000 });
    cek('jenis berkas mengikuti isi berkas: seksi "VIA KAS" jadi Jurnal Kas', await page.evaluate(() => document.getElementById('impb_jenis').value) === 'kas',
      await page.evaluate(() => document.getElementById('impb_jenis').value));
    cek('keping berkas menyebut jenis yang terbaca', /Jurnal Kas/.test(await page.textContent('#importFileInfo')), await page.textContent('#importFileInfo'));
    const tata = await page.evaluate(() => {
      const k = (id) => document.getElementById(id).getBoundingClientRect();
      const drop = k('importDrop'), jenis = document.getElementById('impb_jenis').closest('.field').getBoundingClientRect(), rekap = document.querySelector('#impb_rekap').closest('.field').getBoundingClientRect();
      const atas = document.querySelector('.imp-atas').getBoundingClientRect(), badan = document.getElementById('modalBody').getBoundingClientRect();
      return { dropW: drop.width, badanW: badan.width, dropTop: drop.top, dropBawah: drop.bottom, jenisTop: jenis.top, jenisBawah: jenis.bottom, rekapTop: rekap.top, atasH: atas.height };
    });
    cek('kotak Telusuri disempitkan (kurang dari 40% lebar jendela)', tata.dropW < tata.badanW * 0.4, tata);
    cek('pilihan jenis, bulan, tahun, dan rekap berdampingan dengan kotak Telusuri',
      tata.jenisTop < tata.dropBawah && tata.jenisBawah > tata.dropTop && Math.abs(tata.rekapTop - tata.jenisTop) < 30, tata);
    cek('bagian atas jendela impor ringkas (di bawah 170 px) supaya pratinjau lebih luas', tata.atasH < 170, tata);
    await page.click('#importTarikBtn');
    await page.waitForSelector('#imporTemuanBlok', { timeout: 20000 });
    const H = () => page.evaluate(() => (window.IMPORT_TEMP_HIMPUN_ROWS || []).map((r) => ({ t: r.tanggal, j: r.jumlah, n: r.namaDonatur, l: r.layananId, p: r.pilar, x: !!r._lewati })));
    let rows = await H();
    const baris = (j) => rows.find((r) => Math.round(r.j) === j) || {};
    cek('tanggal 1 September tetap 1 September di zona WIB', baris(400000).t === '2026-09-01', baris(400000));
    cek('tanggal 30 September tetap 30 September', baris(2500000).t === '2026-09-30', baris(2500000));
    let teks = await teksPratinjau();
    cek('temuan nama kantor tanpa KLL/ULL tampil', /Nama kantor tanpa KLL\/ULL/.test(teks));
    cek('temuan kantor tidak terdaftar tampil', /Kantor "ULL Masjid" tidak terdaftar/.test(teks));
    /* Warna bingkai tombol berpindah lewat transisi 0,16 detik. Di komputer
       sibuk pengukuran bisa jatuh di tengah transisi (bingkai masih bening),
       jadi ditunggu sampai bingkainya selesai muncul. */
    await page.waitForFunction(() => { const b = document.getElementById('importTarikBtn'); return b && !/, 0\)$/.test(getComputedStyle(b).borderTopColor); }, null, { timeout: 3000 }).catch(() => {});
    kaki = await bentukKaki(page);
    cek('sesudah dianalisis: tombol bawah tetap sama tinggi dan sejajar', kaki.length === 3 && kaki.every((x) => x.tinggi === kaki[0].tinggi && Math.abs(x.atas - kaki[0].atas) <= 1), kaki);
    cek('sesudah dianalisis: "Simpan" yang utama, "Tarik Ulang" berbingkai biasa',
      (kaki.find((x) => /Simpan/.test(x.teks)) || {}).gradasi === true && (kaki.find((x) => /Tarik/.test(x.teks)) || {}).gradasi === false
      && (kaki.find((x) => /Tarik/.test(x.teks)) || {}).bingkai === true, kaki);
    await page.waitForFunction(() => { const x = document.querySelector('select.imp-temu-pilih'); return x && x.previousElementSibling && x.previousElementSibling.classList.contains('select-enhanced'); }, null, { timeout: 5000 }).catch(() => {});
    const aksiTemuan = await page.evaluate(() => {
      const sek = [...document.querySelectorAll('.imp-temu-aksi[data-aksi="biar"]')].filter((b) => b.offsetParent);
      const garis = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
      const c = sek[0] && getComputedStyle(sek[0]);
      const t = window.IMPORT_TEMP_RES.temuan.find((x) => x.jenis === 'kantorTakTerdaftar');
      const pilih = document.querySelector('select.imp-temu-pilih[data-t="' + t.id + '"]');
      const kotak = pilih && pilih.previousElementSibling && pilih.previousElementSibling.classList.contains('select-enhanced') ? pilih.previousElementSibling : null;
      const terap = document.querySelector('.imp-temu-aksi[data-t="' + t.id + '"][data-aksi="pilih"]');
      const kartu = document.getElementById('imporTemuanBlok').getBoundingClientRect();
      const rk = kotak && kotak.getBoundingClientRect(), rt = terap && terap.getBoundingClientRect();
      return { n: sek.length, bingkai: c ? c.borderTopColor : '', putih: c ? /255, 255, 255/.test(c.borderTopColor) : null,
        sebaris: rk && rt ? Math.abs((rk.top + rk.height / 2) - (rt.top + rt.height / 2)) : null,
        lebarPilih: rk ? Math.round(rk.width) : null, lebarKartu: Math.round(kartu.width), tinggiPilih: rk ? Math.round(rk.height) : null, tinggiTombol: rt ? Math.round(rt.height) : null };
    });
    cek('tombol pilihan kedua di temuan berbingkai jelas (bukan putih di atas merah muda)', aksiTemuan.n > 0 && aksiTemuan.putih === false, aksiTemuan);
    cek('pilihan kantor dan tombol "Terapkan" satu baris', aksiTemuan.sebaris !== null && aksiTemuan.sebaris <= 3, aksiTemuan);
    cek('kotak pilihan kantor tidak selebar kartu', aksiTemuan.lebarPilih !== null && aksiTemuan.lebarPilih < aksiTemuan.lebarKartu * 0.5, aksiTemuan);
    cek('kotak pilihan kantor setinggi tombolnya', aksiTemuan.tinggiPilih !== null && Math.abs(aksiTemuan.tinggiPilih - aksiTemuan.tinggiTombol) <= 2, aksiTemuan);
    const baris1 = await page.evaluate(() => {
      const k = (e) => e.getBoundingClientRect();
      const drop = k(document.getElementById('importDrop'));
      const kontrol = [document.getElementById('impb_jenis').previousElementSibling, document.getElementById('impb_bulan').previousElementSibling,
        document.getElementById('impb_tahun').previousElementSibling, document.getElementById('impb_rekap_btn')].map(k);
      return { drop: [Math.round(drop.top), Math.round(drop.bottom)], kontrol: kontrol.map((r) => [Math.round(r.top), Math.round(r.bottom)]) };
    });
    cek('kotak Telusuri sejajar atas-bawah dengan pilihan jenis, bulan, tahun, dan rekap',
      baris1.kontrol.every((r) => Math.abs(r[0] - baris1.drop[0]) <= 1 && Math.abs(r[1] - baris1.drop[1]) <= 1), baris1);
    cek('temuan tanggal di luar bulan tampil', /Tanggal di luar September 2026/.test(teks));
    /* Tanpa rekap, fokusnya tanggal dan nama KLL/ULL (pemilik, 2 Oktober
       2026). Temuan lain tetap ada, tetapi dilipat di bawah. */
    const fokus = await page.evaluate(() => {
      const blok = document.getElementById('imporTemuanBlok');
      const kel = [...blok.querySelectorAll('.imp-kel')].map((x) => x.getAttribute('data-kel'));
      const lain = document.getElementById('imporLainBlok');
      const atasTemuan = blok.getBoundingClientRect().top, atasRingkas = [...document.querySelectorAll('#importPreview summary')].find((x) => /Ringkasan/.test(x.textContent));
      return { judul: blok.querySelector('.imp-fokus-j').textContent, kel, chip: [...blok.querySelectorAll('.imp-fchip')].map((x) => x.textContent.trim()),
        lainAda: !!lain, lainBuka: lain ? lain.open : null, lainTeks: lain ? lain.textContent : '', pilarDiFokus: /Pilar Pendidikan/.test(blok.textContent),
        temuanDiAtasRingkasan: atasRingkas ? atasTemuan < atasRingkas.getBoundingClientRect().top : false };
    });
    cek('tanpa rekap: judul fokus "Prioritas: tanggal dan nama KLL / ULL"', /Prioritas: tanggal dan nama KLL \/ ULL/.test(fokus.judul), fokus);
    cek('tanpa rekap: bagian Tanggal lalu Nama KLL/ULL, tidak ada yang lain di fokus', fokus.kel.join(',') === 'tanggal,kantor', fokus.kel);
    cek('tanpa rekap: penanda jumlah per bagian (Tanggal 1, Nama kantor 2)', fokus.chip.join('|') === 'Tanggal 1|Nama kantor 2', fokus.chip);
    cek('temuan pilar tidak di fokus, tetapi ada di "Pemeriksaan lain" yang dilipat', !fokus.pilarDiFokus && fokus.lainAda && fokus.lainBuka === false
      && /Pilar Pendidikan, keterangan menyebut Kesehatan/.test(fokus.lainTeks) && /1 belum diputuskan/.test(fokus.lainTeks), fokus);
    cek('fokus pemeriksaan tampil di atas ringkasan', fokus.temuanDiAtasRingkasan, fokus);
    let kk = await kakiLengkap(page);
    cek('kaki jendela: status "3 belum diputuskan" di antara Batal dan Tarik Ulang',
      /Tanggal dan nama kantor: 3 belum diputuskan/.test(kk.info) && /warn/.test(kk.kelas)
      && kk.infoKiri >= kk.tombol[0].kanan && kk.infoKanan <= kk.tombol[1].kiri, kk);
    cek('ringkasan Daerah / KLL / ULL tampil', /Ringkasan/.test(teks) && /Daerah/.test(teks) && /KLL/.test(teks));
    cek('tidak ada em dash di layar impor', !/—/.test(teks + (await page.textContent('#modalTitle'))));
    const daerahAwal = await page.evaluate(() => ringkasImporJurnal(window.IMPORT_TEMP_HIMPUN_ROWS, window.IMPORT_TEMP_SALUR_ROWS, [], []).totalHimpun.Daerah);
    cek('sebelum dibetulkan, setoran "Bantul Kota" masih terhitung Daerah', daerahAwal === 2500000 + 75000 + 10 + 120000, daerahAwal);

    console.log('\n=== C. MEMBETULKAN LANGSUNG DI LAYAR ===');
    cek('klik "Jadikan KLL Bantul Kota"', await klikAksi('Nama kantor tanpa KLL/ULL', 'terap'));
    rows = await H();
    await page.evaluate(() => { document.getElementById('imporLainBlok').open = true; });
    await page.waitForTimeout(100);
    cek('"Pemeriksaan lain" yang dibuka tetap terbuka sesudah layar digambar ulang',
      await page.evaluate(() => { imporGambarUlang(); return document.getElementById('imporLainBlok').open; }));
    cek('baris itu sekarang KLL Bantul Kota', baris(2500000).n === 'KLL Bantul Kota' && baris(2500000).l === LAY['Bantul Kota'], baris(2500000));
    const daerahSesudah = await page.evaluate(() => ringkasImporJurnal(window.IMPORT_TEMP_HIMPUN_ROWS, window.IMPORT_TEMP_SALUR_ROWS, [], []).totalHimpun.Daerah);
    cek('ringkasan Daerah turun sebesar setoran itu', daerahAwal - daerahSesudah === 2500000, [daerahAwal, daerahSesudah]);
    teks = await teksPratinjau();
    cek('tabel pratinjau ikut berubah', /KLL Bantul Kota/.test(teks));

    await page.evaluate((id) => {
      const t = window.IMPORT_TEMP_RES.temuan.find((x) => x.jenis === 'kantorTakTerdaftar');
      const s = document.querySelector('select.imp-temu-pilih[data-t="' + t.id + '"]');
      s.value = id; s.dispatchEvent(new Event('change', { bubbles: true }));
    }, LAY['Masjid Baiturrahman Aceh']);
    cek('pilih kantor untuk "ULL Masjid" lalu Terapkan', await klikAksi('tidak terdaftar', 'pilih'));
    rows = await H();
    cek('"ULL Masjid" jadi ULL Masjid Baiturrahman Aceh', baris(150000).l === LAY['Masjid Baiturrahman Aceh'], baris(150000));
    await page.waitForTimeout(400);
    const alias = (await engine.runRPC(DB, 'apiDaftarAliasKantor', [await page.evaluate(() => TOKEN)], {})).result;
    cek('pilihannya diingat di server untuk impor berikutnya', alias.some((a) => a.tertulis === 'ULL Masjid' && a.id === LAY['Masjid Baiturrahman Aceh']), alias);

    cek('klik "Pakai" tanggal usulan', await klikAksi('Tanggal di luar', 'terap'));
    rows = await H();
    cek('tanggal Juni jadi September', baris(120000).t === '2026-09-07', baris(120000));
    kk = await kakiLengkap(page);
    cek('tanggal dan nama kantor diputuskan: kaki berbunyi "sudah beres", hijau', /sudah beres/.test(kk.info) && /\bok\b/.test(kk.kelas), kk);
    cek('penanda bagian berubah jadi centang', await page.evaluate(() => [...document.querySelectorAll('.imp-fchip')].every((x) => x.classList.contains('beres'))), await page.evaluate(() => [...document.querySelectorAll('.imp-fchip')].map((x) => x.outerHTML)));
    cek('klik "Lewati baris ini" untuk nominal Rp 10', await klikAksi('Nominal sangat kecil', 'terap'));
    rows = await H();
    cek('baris Rp 10 ditandai dilewati', baris(10).x === true, baris(10));
    teks = await teksPratinjau();
    cek('tabel menandai baris yang dilewati', /Dilewati, tidak ikut disimpan/.test(teks));

    console.log('\n=== D. MENYIMPAN ===');
    /* Temuan pilar sengaja belum diputuskan: klik pertama hanya mengingatkan. */
    await page.click('#importSimpanBtn');
    await page.waitForTimeout(300);
    kk = await kakiLengkap(page);
    cek('klik pertama mengingatkan temuan yang belum diputuskan, belum menyimpan',
      (await page.textContent('#importSimpanBtn')).trim() === 'Tetap simpan' && /1 temuan belum diputuskan/.test(kk.info) && /bahaya/.test(kk.kelas) && tabel('Penghimpunan').length === 0,
      [await page.textContent('#importSimpanBtn'), kk.info, tabel('Penghimpunan').length]);
    cek('peringatan tidak melebarkan tombol Simpan (di bawah 180 px), tombol tetap sejajar',
      kk.tombol.every((t) => t.lebar < 180 && t.tinggi === kk.tombol[0].tinggi && Math.abs(t.atas - kk.tombol[0].atas) <= 1), kk.tombol);
    await page.click('#importSimpanBtn');
    await page.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), null, { timeout: 15000 });
    const P = tabel('Penghimpunan');
    const p = (j) => P.find((r) => Math.round(Number(r.jumlah)) === j) || {};
    cek('klik kedua menyimpan', P.length === 6, P.length);
    cek('baris yang dilewati tidak tersimpan', !p(10).id);
    cek('setoran Bantul Kota tersimpan sebagai KLL Bantul Kota', p(2500000).layananId === LAY['Bantul Kota'] && /KLL/.test(p(2500000).tipeDonatur), p(2500000));
    cek('tanggal yang dibetulkan yang tersimpan', String(p(120000).tanggal).slice(0, 10) === '2026-09-07', p(120000).tanggal);
    cek('tanggal unggahan tersimpan tanpa mundur', String(p(400000).tanggal).slice(0, 10) === '2026-09-01', p(400000).tanggal);
    cek('penanda milik layar (_lewati, _tetapSimpan) tidak ikut tersimpan', !JSON.stringify(DB.sheets.Penghimpunan).includes('_lewati'));

    console.log('\n=== E. SAMAKAN DENGAN REKAP ===');
    DB.sheets.Penghimpunan = [DB.sheets.Penghimpunan[0]];
    await page.evaluate(() => openImportJurnalBerkas());
    await page.waitForSelector('#impb_rekap', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
      set('impb_jenis', 'kas'); set('impb_bulan', '09'); set('impb_tahun', '2026');
    });
    await page.setInputFiles('#impb_rekap', berkasRekap);
    await page.waitForFunction(() => !!window.IMPORT_REKAP_SHEETS, null, { timeout: 10000 });
    cek('rekap terbaca di peramban', true);
    await page.setInputFiles('#import_file', berkas);
    await page.waitForFunction(() => typeof IMPORT_FILE_TSV !== 'undefined' && IMPORT_FILE_TSV, null, { timeout: 15000 });
    await page.click('#importTarikBtn');
    await page.waitForFunction(() => (window.IMPORT_TEMP_RES && (window.IMPORT_TEMP_RES.temuan || []).some((t) => /^rekap/.test(t.jenis))), null, { timeout: 20000 });
    const jenisRekap = await page.evaluate(() => window.IMPORT_TEMP_RES.temuan.filter((t) => /^rekap/.test(t.jenis)).map((t) => t.jenis));
    cek('temuan rekap muncul otomatis setelah jurnal dianalisis', jenisRekap.includes('rekapRingkas'), jenisRekap);
    cek('kekeringan diusulkan pindah ke Lingkungan, ambulan ke Kesehatan',
      await page.evaluate(() => { const j = JSON.stringify(window.IMPORT_TEMP_RES.temuan.filter((t) => t.jenis === 'rekapDana')); return /Lingkungan/.test(j) && /Kesehatan/.test(j); }));
    cek('tombol "Samakan semua dengan rekap" tampil', await page.$('#imporSamakanSemua') !== null);
    const banding = () => page.evaluate(() => {
      const blok = document.getElementById('imporTemuanBlok'), t = blok.querySelector('.imp-banding');
      const baris = t ? [...t.querySelectorAll('tbody tr')].map((r) => [...r.cells].map((c) => c.textContent.trim())) : [];
      const lain = document.getElementById('imporLainBlok');
      return { judul: (blok.querySelector('.imp-fokus-j') || {}).textContent, baris, kel: [...blok.querySelectorAll('.imp-kel')].map((x) => x.getAttribute('data-kel')),
        lainBuka: lain ? lain.open : null, lainTeks: lain ? lain.textContent : '', kaki: document.getElementById('imporKakiInfo').innerText };
    });
    let bd = await banding();
    const totalBaris = (b) => (b.baris.find((r) => r[0] === 'Total penerimaan') || []);
    cek('dengan rekap: fokusnya "Perbandingan jurnal dengan rekap"', bd.judul === 'Perbandingan jurnal dengan rekap', bd.judul);
    cek('tabel perbandingan: rekap Rp 4.295.000, ada selisih sebelum disamakan', /4\.295\.000/.test(totalBaris(bd)[2] || '') && totalBaris(bd)[3] !== 'Sama', bd.baris);
    cek('tabel perbandingan memisah Daerah, KLL, ULL', ['Penerimaan Daerah', 'Penerimaan KLL', 'Penerimaan ULL'].every((k) => bd.baris.some((r) => r[0] === k)), bd.baris);
    cek('dengan rekap: perbedaan dikelompokkan (beda kantor di depan, beda dana, hanya di rekap)',
      bd.kel[0] === 'rKantor' && bd.kel.includes('rDana') && bd.kel.includes('rRekap') && !bd.kel.includes('tanggal') && !bd.kel.includes('kantor'), bd.kel);
    cek('dengan rekap: pemeriksaan jurnal sendiri (tanggal, nama kantor, pilar) dilipat di bawah', bd.lainBuka === false && /Tanggal di luar September/.test(bd.lainTeks), bd.lainTeks.slice(0, 120));
    cek('kaki jendela menyebut selisih penerimaan dengan rekap', /Selisih penerimaan/.test(bd.kaki), bd.kaki);

    console.log('\n=== F. PILIHAN MASSAL: IKUT REKAP, IKUT JURNAL, PERTAHANKAN PILIHAN SENDIRI ===');
    const totalNow = () => page.evaluate(() => Math.round(ringkasImporJurnal(window.IMPORT_TEMP_HIMPUN_ROWS, window.IMPORT_TEMP_SALUR_ROWS, [], []).totalHimpun.total));
    const pilarKek = () => page.evaluate(() => (window.IMPORT_TEMP_HIMPUN_ROWS.find((r) => Math.round(r.jumlah) === 75000) || {}).pilar);
    const statusT = (id) => page.evaluate((i) => { const t = window.IMPORT_TEMP_RES.temuan.find((x) => x.id === i); return t ? (t.status || '') : 'hilang'; }, id);
    const totalJurnal = await totalNow();
    const pilarJurnal = await pilarKek();
    cek('ada tombol "Semua sesuai jurnal"', (await page.$('#imporSemuaJurnal')) !== null);
    cek('ada pilihan "pertahankan yang sudah saya pilih sendiri", tercentang bawaan',
      await page.evaluate(() => { const c = document.getElementById('imporPertahankan'); return !!c && c.checked; }));
    const idKek = await page.evaluate(() => (window.IMPORT_TEMP_RES.temuan.find((t) => t.jenis === 'rekapDana' && /Lingkungan/.test(JSON.stringify(t.usulan))) || {}).id);
    const idAmb = await page.evaluate(() => (window.IMPORT_TEMP_RES.temuan.find((t) => t.jenis === 'rekapDana' && /Kesehatan/.test(JSON.stringify(t.usulan))) || {}).id);
    const idTambah = await page.evaluate(() => (window.IMPORT_TEMP_RES.temuan.find((t) => t.jenis === 'rekapHanyaRekap' && /Donatur Rekap/.test(JSON.stringify(t.usulan))) || {}).id);
    await page.click('.imp-temu-aksi[data-t="' + idKek + '"][data-aksi="biar"]');
    await page.waitForTimeout(150);
    await page.click('#imporSemuaJurnal');
    await page.waitForTimeout(200);
    const belumPutus = await page.evaluate(() => window.IMPORT_TEMP_RES.temuan.filter((t) => /^rekap/.test(t.jenis) && t.jenis !== 'rekapRingkas' && !t.status).length);
    cek('"Semua sesuai jurnal": semua temuan rekap diputuskan', belumPutus === 0, belumPutus);
    cek('"Semua sesuai jurnal": angka tetap angka jurnal', (await totalNow()) === totalJurnal, [await totalNow(), totalJurnal]);
    await page.click('#imporSamakanSemua');
    await page.waitForTimeout(200);
    cek('"Cocokkan ke rekap" dengan pilihan sendiri dipertahankan: kekeringan tetap ikut jurnal',
      (await pilarKek()) === pilarJurnal && (await statusT(idKek)) === 'dibiarkan', [await pilarKek(), await statusT(idKek)]);
    cek('yang tidak dipilih sendiri ikut rekap, termasuk yang tadi "sesuai jurnal" massal', (await statusT(idAmb)) === 'diterapkan' && (await totalNow()) === 4295000,
      [await statusT(idAmb), await totalNow()]);
    cek('tiap temuan yang sudah diputuskan punya tombol "Ubah"', (await page.$('.imp-temu-ubah[data-t="' + idTambah + '"]')) !== null);
    await page.click('.imp-temu-ubah[data-t="' + idTambah + '"]');
    await page.waitForTimeout(200);
    cek('"Ubah" membatalkan tambahan dari rekap: barisnya hilang lagi', (await totalNow()) === 4295000 - 50000
      && !(await page.evaluate(() => window.IMPORT_TEMP_HIMPUN_ROWS.some((r) => r.namaDonatur === 'Donatur Rekap' && !r._lewati))), await totalNow());
    cek('sesudah "Ubah", tombol pilihannya muncul lagi', (await statusT(idTambah)) === ''
      && (await page.$('.imp-temu-aksi[data-t="' + idTambah + '"]')) !== null);
    await page.click('.imp-temu-ubah[data-t="' + idKek + '"]');
    await page.waitForTimeout(150);
    await page.click('.imp-temu-aksi[data-t="' + idKek + '"][data-aksi="terap"]');
    await page.waitForTimeout(150);
    cek('pilihan sendiri bisa diganti: kekeringan jadi Lingkungan', (await pilarKek()) === 'Lingkungan', await pilarKek());
    await page.click('.imp-temu-ubah[data-t="' + idKek + '"]');
    await page.waitForTimeout(150);
    cek('"Ubah" mengembalikan nilai jurnal', (await pilarKek()) === pilarJurnal, await pilarKek());
    await page.click('.imp-temu-aksi[data-t="' + idKek + '"][data-aksi="biar"]');
    await page.waitForTimeout(150);
    await page.uncheck('#imporPertahankan');
    await page.click('#imporSamakanSemua');
    await page.waitForTimeout(300);
    const R = await page.evaluate(() => ringkasImporJurnal(window.IMPORT_TEMP_HIMPUN_ROWS, window.IMPORT_TEMP_SALUR_ROWS, [], []));
    cek('setelah disamakan, total penerimaan = total rekap', Math.round(R.totalHimpun.total) === 4295000, R.totalHimpun);
    cek('setelah disamakan, Penghimpunan Daerah = Daerah rekap', Math.round(R.totalHimpun.Daerah) === 245000, R.totalHimpun);
    teks = await teksPratinjau();
    cek('ringkasan di layar ikut berubah', /4\.295\.000/.test(teks));
    bd = await banding();
    cek('setelah disamakan: semua baris tabel perbandingan "Sama"', bd.baris.length >= 2 && bd.baris.every((r) => r[3] === 'Sama'), bd.baris);
    cek('setelah disamakan: kaki berbunyi "Sama dengan rekap"', /Sama dengan rekap/.test(bd.kaki), bd.kaki);

    console.log('\n=== G. KAKI JENDELA DI HP ===');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(300);
    kk = await kakiLengkap(page);
    cek('lebar 390: semua tombol bawah di dalam jendela, tidak terpotong', kk.dalam && kk.tombol.length === 3, kk);
    cek('lebar 390: tombol bawah sama tinggi dan satu baris', kk.tombol.every((t) => t.tinggi === kk.tombol[0].tinggi && Math.abs(t.atas - kk.tombol[0].atas) <= 1), kk.tombol);
    cek('lebar 390: status di atas tombol, bukan berdesakan di antaranya', kk.info && kk.tombol.every((t) => t.atas > 0) && await page.evaluate(() => {
      const i = document.getElementById('imporKakiInfo').getBoundingClientRect(), b = document.getElementById('importSimpanBtn').getBoundingClientRect();
      return i.bottom <= b.top + 1;
    }), kk);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(200);
    await page.click('#importSimpanBtn');
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.getElementById('modalBg').classList.contains('show'))) await page.click('#importSimpanBtn');
    await page.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), null, { timeout: 15000 });
    const P2 = tabel('Penghimpunan');
    cek('yang tersimpan sama dengan rekap: 7 baris, Rp 4.295.000', P2.length === 7 && Math.round(P2.reduce((a, x) => a + Number(x.jumlah), 0)) === 4295000,
      P2.map((x) => [x.tanggal, x.jumlah, x.namaDonatur]));
    const kek = P2.find((x) => Math.round(Number(x.jumlah)) === 75000) || {};
    cek('pilar kekeringan tersimpan Lingkungan', kek.pilar === 'Lingkungan', kek);
    cek('baris yang hanya ada di rekap ikut tersimpan', P2.some((x) => x.namaDonatur === 'Donatur Rekap'));
    cek('tidak ada galat JavaScript di halaman', galatHalaman.length === 0, galatHalaman);
  } finally {
    await browser.close();
    srv.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: layar Impor Jurnal per Berkas belum benar.\n'); process.exit(1); }
  console.log('\ntest_impor_berkas_ui.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
