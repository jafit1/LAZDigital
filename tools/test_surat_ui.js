/* Uji tampilan modul Surat & Pengajuan di peramban sungguhan.
 *
 * Yang dialami amil: membuka modul dari menu, mencatat surat masuk sambil
 * melampirkan foto besar (harus dikompres di peramban sebelum dikirim),
 * mendisposisikannya, mencoba PDF yang terlalu besar (harus ditawari kompres
 * atau tautan, bukan gagal diam), mencatat pengajuan bantuan dan
 * menggesernya di papan, lalu pemohon melacaknya dari halaman publik.
 *
 * Datanya BUATAN. Peramban tidak boleh keluar ke internet: permintaan selain
 * 127.0.0.1 ditolak, jadi pustaka kompres PDF dari CDN memang tidak termuat
 * di sini (yang diuji: tawarannya muncul dan jalur tautannya berjalan).
 *
 *   node tools/test_surat_ui.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

function muatPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
if (!process.env.LAZ_DATA_LOKAL) process.env.LAZ_DATA_LOKAL = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-surat-ui-'));
require('./_pagar-db.js')('Uji tampilan Surat');
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const media = require(path.join(AKAR, 'api', 'media.js'));
const suratApi = require(path.join(AKAR, 'lib', 'surat', 'api.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 260)); }
};
const SANDI = 'Admin12345';
let DB = null;
suratApi._uji.aturDasar(async () => DB);

/* PNG bergradasi dan berderau: besar sebagai PNG (sekitar 2 sampai 3 MB untuk
   1600x1200), persis seperti foto ponsel atau hasil scan yang dikirim apa adanya. */
function pngDerau(w, h) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const potong = (jenis, isi) => { const l = Buffer.alloc(4); l.writeUInt32BE(isi.length); const t = Buffer.concat([Buffer.from(jenis), isi]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([l, t, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const mentah = Buffer.alloc((w * 3 + 1) * h);
  /* Gradasi ditambah derau: mirip foto (PNG tetap besar, JPEG kecil). */
  const acak = require('crypto').randomBytes(w * h * 3);
  for (let y = 0; y < h; y++) { mentah[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    const i = y * (w * 3 + 1) + 1 + x * 3 + c; mentah[i] = Math.min(255, Math.round((x / w) * 160 + (y / h) * 60 + c * 20) + (acak[(y * w + x) * 3 + c] & 63)); } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), potong('IHDR', ih), potong('IDAT', zlib.deflateSync(mentah, { level: 1 })), potong('IEND', Buffer.alloc(0))]);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/rpc' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; });
    await new Promise((r) => req.on('end', r));
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (_) {}
    res.setHeader('Content-Type', 'application/json');
    try { const out = await engine.runRPC(DB, j.fn, j.args || [], { ip: '127.0.0.1', ua: 'uji' }); DB = out.db; res.end(JSON.stringify({ result: out.result })); }
    catch (e) { res.end(JSON.stringify({ __error: e.message })); }
    return;
  }
  if (url === '/api/media') { await media(req, res); return; }
  if (url.startsWith('/api/')) { res.statusCode = 404; res.end('{}'); return; }
  const f = path.join(PUBLIK, url === '/' ? 'index.html' : url);
  if (!f.startsWith(PUBLIK) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(''); return; }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

/* PDF sungguhan (bukan sekadar kepala %PDF): n halaman Letter berisi teks, ditambah satu objek
   tak terpakai berisi spasi supaya ukurannya melewati batas lampiran 2 MB. Tabel xref dihitung
   dari posisi byte sebenarnya, jadi pdf.js membacanya tanpa harus membangun ulang strukturnya. */
function pdfNyata(halaman, padding) {
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const anak = [];
  for (let i = 0; i < halaman; i++) anak.push((3 + i * 2) + ' 0 R');
  objs[2] = '<< /Type /Pages /Kids [' + anak.join(' ') + '] /Count ' + halaman + ' >>';
  for (let i = 0; i < halaman; i++) {
    const hal = 3 + i * 2, isi = 4 + i * 2, teks = 'BT /F1 24 Tf 72 700 Td (Halaman karangan ' + (i + 1) + ') Tj ET';
    objs[hal] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + isi + ' 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>';
    objs[isi] = '<< /Length ' + teks.length + ' >>\nstream\n' + teks + '\nendstream';
  }
  const terakhir = 3 + halaman * 2;
  objs[terakhir] = '<< /Length ' + padding + ' >>\nstream\n' + ' '.repeat(padding) + '\nendstream';
  let out = '%PDF-1.4\n';
  const posisi = [];
  for (let n = 1; n <= terakhir; n++) { posisi[n] = Buffer.byteLength(out, 'latin1'); out += n + ' 0 obj\n' + objs[n] + '\nendobj\n'; }
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (terakhir + 1) + '\n0000000000 65535 f \n';
  for (let n = 1; n <= terakhir; n++) out += String(posisi[n]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + (terakhir + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
/* jsPDF dari CDN tidak bisa diunduh di uji (tanpa internet), jadi ditiru: yang dicatat adalah apa
   yang dikerjakan kode kompres terhadap pustaka itu (berapa halaman, ukuran, gambar apa). pdf.js-nya
   SUNGGUHAN (salinan lokal 3.11.174), jadi menggambar halaman ke kanvas benar-benar berjalan. */
const JSPDF_TIRUAN = `window.jspdf = { jsPDF: function (o) {
  var s = window.__pdfTiruan = { opsi: o, halaman: 1, tambahan: [], gambar: [] };
  this.addPage = function (f, a) { s.halaman++; s.tambahan.push([f, a]); };
  this.addImage = function (d, t, x, y, w, h) { s.gambar.push({ panjang: d.length, awal: d.slice(0, 30), tipe: t, w: w, h: h }); };
  this.output = function () { return new Blob(['%PDF-1.4 hasil kompres tiruan'], { type: 'application/pdf' }); };
} };`;

(async () => {
  /* Kelas sr-* yang dipakai surat.js harus ada di styles.css (jebakan 3.6:
     kelas karangan tidak menimbulkan galat, cuma tampilan yang aneh). */
  const js = fs.readFileSync(path.join(PUBLIK, 'surat.js'), 'utf8');
  const css = fs.readFileSync(path.join(PUBLIK, 'styles.css'), 'utf8');
  const kelas = [...new Set((js.match(/\bsr-[a-z0-9-]+/g) || []).filter((k) => !/-$/.test(k)))];
  const hilang = kelas.filter((k) => !new RegExp('\\.' + k.replace(/-/g, '\\-') + '(?![a-z0-9-])').test(css) && !/^sr-(sifat|jenis)-$/.test(k));
  const dibolehkan = ['sr-sifat-biasa', 'sr-jenis-bantuan'];
  cek('setiap kelas sr-* di surat.js ada isinya di styles.css', hilang.filter((k) => !dibolehkan.includes(k)).length === 0, hilang);

  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const SU = (await engine.runRPC(DB, 'login', ['superadmin', SANDI], {})).result.token;
  DB = (await engine.runRPC(DB, 'apiSaveUser', [SU, { username: 'sari', nama: 'Sari Program', password: 'Sandi12345!', role: 'staff', permissions: { surat: { view: true } }, aktif: 'true' }], {})).db;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-surat-'));
  const fotoBesar = path.join(tmp, 'scan_undangan.png');
  fs.writeFileSync(fotoBesar, pngDerau(1600, 1200));
  const pdfBesar = path.join(tmp, 'proposal_lengkap.pdf');
  fs.writeFileSync(pdfBesar, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2600000, 0x20)]));

  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(CHROMIUM);
  const ctx = await browser.newContext({ timezoneId: 'Asia/Jakarta', viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(() => { try { navigator.serviceWorker && (navigator.serviceWorker.register = () => Promise.resolve()); } catch (_) {} });
  const page = await ctx.newPage();
  const galatHal = [];
  page.on('pageerror', (e) => galatHal.push(e.message));
  const urlDiminta = [];
  page.on('request', (r) => urlDiminta.push(r.url()));
  const siap = (rute) => page.waitForFunction((r) => document.body.getAttribute('data-halaman-siap') === r, rute, { timeout: 15000 });
  const toastTeks = () => page.evaluate(() => document.getElementById('toast').textContent);

  try {
    console.log('\n=== A. MASUK DAN MENU ===');
    await page.goto(A + '/');
    await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
    await page.fill('#lUser', 'superadmin'); await page.fill('#lPass', SANDI); await page.click('#loginBtn');
    await page.waitForFunction(() => !document.getElementById('appView').classList.contains('hidden'), null, { timeout: 20000 });
    const adaMenu = await page.waitForSelector('#nav_surat', { state: 'attached', timeout: 10000 }).then(() => true).catch(() => false);
    cek('menu "Surat & Pengajuan" ada di bilah kiri', adaMenu && (await page.getAttribute('#nav_surat', 'title')) === 'Surat & Pengajuan');
    await page.goto(A + '/surat.html');
    await siap('dasbor');
    const kpi = await page.evaluate(() => [...document.querySelectorAll('.sr-kpi .kpi-v2-label')].map((x) => x.textContent));
    cek('beranda: empat kartu angka', kpi.join('|') === 'Surat masuk bulan ini|Pengajuan berjalan|Disposisi untuk saya|Lewat tenggat', kpi);
    const lebarKpi = await page.evaluate(() => [...document.querySelectorAll('.sr-kpi')].map((x) => Math.round(x.getBoundingClientRect().width)));
    cek('empat kartu sama lebar (tidak kena proporsi dashboard utama)', Math.max(...lebarKpi) - Math.min(...lebarKpi) <= 2, lebarKpi);
    cek('menu modul: Beranda, Surat Masuk, Surat Keluar, Pengajuan, Disposisi Saya', (await page.$$('#nav .tn-item')).length === 5);
    await page.waitForFunction(() => /terpakai/.test((document.getElementById('srRuang') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    cek('ruang lampiran ditampilkan (terpakai dari 200 MB)', /terpakai/.test(await page.textContent('#srRuang')) && /200,0 MB|200 MB/.test(await page.textContent('#srRuang')), await page.textContent('#srRuang'));

    console.log('\n=== B. CATAT SURAT MASUK DENGAN FOTO BESAR ===');
    await page.click('[data-catat]');
    await page.waitForSelector('.sr-pilih-jenis', { timeout: 5000 });
    cek('formulir menawarkan lima jenis', (await page.$$('.sr-pilih-jenis button')).length === 5);
    await page.click('.sr-pilih-jenis button[data-j="masuk"]');
    await page.fill('#cPerihal', 'Undangan rapat koordinasi');
    await page.fill('#cSiapa', 'PCM Contoh');
    await page.click('.sr-pilih-jenis button[data-j="bantuan"]');
    cek('berganti jenis tidak menghapus isian yang sudah diketik', (await page.inputValue('#cPerihal')) === 'Undangan rapat koordinasi' && (await page.$('#cNominal')) !== null);
    await page.click('.sr-pilih-jenis button[data-j="masuk"]');
    await page.fill('#cNomorSurat', '45/PCM/X/2026');
    await page.setInputFiles('#cBerkas', fotoBesar);
    cek('lampiran masuk antrean formulir', /scan_undangan\.png/.test(await page.textContent('#cAntreDaftar')));
    await page.click('#cSimpan');
    await siap('s/' + '').catch(() => {});
    await page.waitForFunction(() => /^#s\//.test(location.hash) && /^s\//.test(document.body.getAttribute('data-halaman-siap') || ''), null, { timeout: 30000 });
    const det = await page.evaluate(() => ({ nomor: document.querySelector('.sr-nomor').textContent, judul: document.querySelector('.sr-d-judul').textContent,
      langkah: [...document.querySelectorAll('.sr-step-i')].map((x) => x.className), lamp: [...document.querySelectorAll('.sr-lamp')].map((x) => x.textContent) }));
    cek('surat tercatat dan detailnya terbuka', /\/SM\//.test(det.nomor) && det.judul === 'Undangan rapat koordinasi', det);
    /* Tautan publik: surat masuk juga punya (dulu hanya pengajuan). Nomor dan kode sudah ada di tautannya. */
    const tautanMasuk = await page.inputValue('#srTautan').catch(() => '');
    cek('surat masuk punya tautan publik dengan nomor dan kode terisi', /\/lacak\.html\?n=.+SM.+&k=[A-Z2-9]{6}$/.test(tautanMasuk), tautanMasuk);
    cek('tombol WhatsApp dan Buka memakai tautan itu', await page.evaluate(() => /wa\.me\/\?text=/.test(document.getElementById('srWaLacak').href) && document.getElementById('srWaLacak').href.includes(encodeURIComponent('lacak.html')) && document.getElementById('srBukaLacak').getAttribute('href') === document.getElementById('srTautan').value));
    cek('progres empat langkah, langkah pertama aktif', det.langkah.length === 4 && /kini/.test(det.langkah[0]), det.langkah);
    const L = await page.evaluate(() => window.KINI && window.KINI.lampiran);
    const lampSrv = JSON.parse(JSON.stringify(await (async () => { const r = await suratApi.T['surat.detail'](await suratApi._uji.pengguna({ headers: {} }, { token: SU }), { id: await page.evaluate(() => location.hash.slice(3)) }); return r.surat.lampiran; })()));
    const asli = fs.statSync(fotoBesar).size;
    cek('foto ' + (asli / 1048576).toFixed(1) + ' MB dikompres di peramban sebelum dikirim (di bawah 900 KB, JPEG)',
      lampSrv.length === 1 && lampSrv[0].ukuran < 900 * 1024 && lampSrv[0].mime === 'image/jpeg' && lampSrv[0].ukuranAsli === asli, lampSrv);
    cek('ukuran asli ikut ditampilkan', det.lamp.length === 1 && /asli/.test(det.lamp[0]), [det.lamp, lampSrv]);
    void L;

    console.log('\n=== C. DISPOSISI ===');
    await page.click('#srBuatDisposisi');
    await page.waitForSelector('.penerima-baris', { timeout: 8000 });
    await page.evaluate(() => { const b = [...document.querySelectorAll('.penerima-baris')].find((x) => /Sari Program/.test(x.textContent)); b.querySelector('input').checked = true; });
    await page.click('.sr-instruksi-pilih label:nth-child(1)');
    await page.fill('#dCatatan', 'Mohon diwakili');
    await page.click('#dKirim');
    await page.waitForFunction(() => document.querySelector('.sr-disp') && /Sari Program/.test(document.querySelector('.sr-disp').textContent), null, { timeout: 10000 });
    const sesudah = await page.evaluate(() => ({ kini: [...document.querySelectorAll('.sr-step-i')].findIndex((x) => x.classList.contains('kini')), ins: document.querySelector('.sr-instruksi').textContent }));
    cek('disposisi tampil dan surat pindah ke Didisposisi', sesudah.kini === 1 && /Tindak lanjuti/.test(sesudah.ins), sesudah);
    cek('ada tombol cetak lembar disposisi', (await page.$('[data-cetak]')) !== null);

    console.log('\n=== D. PDF TERLALU BESAR: TAWARAN KOMPRES ATAU TAUTAN ===');
    await page.setInputFiles('#srBerkas', pdfBesar);
    await page.waitForSelector('.sr-tawar', { timeout: 8000 });
    const tawar = await page.evaluate(() => [...document.querySelectorAll('.sr-tawar button')].map((b) => b.textContent));
    cek('PDF 2,5 MB tidak dikirim, ditawari "Kompres PDF" dan "Simpan sebagai tautan"', tawar.includes('Kompres PDF') && tawar.includes('Simpan sebagai tautan'), tawar);
    /* Pustaka kompres PDF dari CDN sengaja tidak bisa diunduh di uji ini:
       yang diuji adalah jalan keluarnya, bukan buntu. */
    await page.click('.sr-tawar button[data-p="kompres"]');
    await page.waitForFunction(() => { const t = document.querySelector('.sr-antre-i.tanya .sr-tawar'); return t && /tidak bisa diunduh/.test(t.parentElement.textContent); }, null, { timeout: 15000 }).catch(() => {});
    cek('kompres gagal (pustaka tak terunduh) tetap menawarkan tautan', await page.evaluate(() => { const t = document.querySelector('.sr-antre-i.tanya'); return !!t && /tidak bisa diunduh/.test(t.textContent) && !!t.querySelector('[data-p="tautan"]'); }),
      await page.evaluate(() => (document.querySelector('.sr-antre') || {}).textContent));
    await page.click('.sr-tawar button[data-p="tautan"]');
    await page.waitForSelector('#tUrl', { timeout: 5000 });
    cek('nama berkas terbawa ke formulir tautan', (await page.inputValue('#tNama')) === 'proposal_lengkap.pdf');
    await page.fill('#tUrl', 'https://drive.google.com/file/d/contoh/view');
    await page.click('#tSimpan');
    await page.waitForFunction(() => document.querySelectorAll('.sr-lamp').length === 2, null, { timeout: 10000 });
    cek('tersimpan sebagai tautan', /Tautan/.test(await page.evaluate(() => document.querySelectorAll('.sr-lamp')[1].textContent)));

    console.log('\n=== D2. KOMPRES PDF BERHASIL (pdf.js lokal sungguhan, jsPDF ditiru) ===');
    const pdfAsli = path.join(tmp, 'scan_beneran.pdf');
    fs.writeFileSync(pdfAsli, pdfNyata(3, 2600000));
    await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//, (r) => r.fulfill({ contentType: 'text/javascript', body: JSPDF_TIRUAN }));
    await page.setInputFiles('#srBerkas', pdfAsli);
    await page.waitForSelector('.sr-tawar', { timeout: 8000 });
    await page.click('.sr-tawar button[data-p="kompres"]');
    const selesai = await page.waitForFunction(() => window.__pdfTiruan && window.__pdfTiruan.gambar.length === 3, null, { timeout: 30000 }).then(() => true).catch(() => false);
    const t = await page.evaluate(() => window.__pdfTiruan || null);
    cek('pdf.js membaca PDF sungguhan dan menggambar tiga halaman', selesai && !!t && t.gambar.length === 3, t);
    cek('halaman pertama dibuat lewat konstruktor, dua sisanya lewat addPage', !!t && t.halaman === 3 && t.tambahan.length === 2, t && [t.halaman, t.tambahan.length]);
    cek('ukuran halaman mengikuti PDF asli (Letter 612 x 792, potret)', !!t && t.opsi.orientation === 'p' && t.opsi.format[0] === 612 && t.opsi.format[1] === 792 && t.gambar.every((g) => g.w === 612 && g.h === 792), t && [t.opsi, t.gambar.map((g) => [g.w, g.h])]);
    cek('tiap halaman dimasukkan sebagai JPEG yang benar-benar tergambar (bukan kanvas kosong kecil)', !!t && t.gambar.every((g) => g.tipe === 'JPEG' && /^data:image\/jpeg;base64,/.test(g.awal) && g.panjang > 1500), t && t.gambar.map((g) => g.panjang));
    await page.waitForFunction(() => document.querySelectorAll('.sr-lamp').length === 3, null, { timeout: 15000 }).catch(() => {});
    const lamp3 = await page.evaluate(() => [...document.querySelectorAll('.sr-lamp')].map((x) => x.textContent));
    cek('hasil kompres terkirim dan tersimpan sebagai lampiran ketiga', lamp3.length === 3 && /scan_beneran\.pdf/.test(lamp3.join('|')), lamp3);
    cek('pdf.js dimuat dari server sendiri, bukan dari CDN', urlDiminta.some((u) => /\/js\/vendor\/pdf\.min\.js/.test(u)) && urlDiminta.some((u) => /\/js\/vendor\/pdf\.worker\.min\.js/.test(u)) && !urlDiminta.some((u) => /cdnjs[^ ]*pdf\.js/.test(u)), urlDiminta.filter((u) => /pdf/.test(u)));
    await page.unroute(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\//);

    console.log('\n=== E. PENGAJUAN DI PAPAN ===');
    await page.goto(A + '/surat.html#pengajuan');
    await siap('pengajuan');
    await page.click('.page-head [data-catat]');
    await page.waitForSelector('#cNominal', { timeout: 5000 });
    cek('dari halaman Pengajuan, formulir langsung jenis Pengajuan Bantuan', await page.evaluate(() => document.querySelector('.sr-pilih-jenis button.on').dataset.j === 'bantuan'));
    await page.fill('#cPerihal', 'Bantuan biaya sekolah');
    await page.fill('#cSiapa', 'Pemohon Contoh');
    await page.type('#cNominal', '2500000');
    cek('nominal diketik jadi berformat ribuan', (await page.inputValue('#cNominal')) === '2.500.000', await page.inputValue('#cNominal'));
    await page.click('#cSimpan');
    await page.waitForFunction(() => /^s\//.test(document.body.getAttribute('data-halaman-siap') || ''), null, { timeout: 15000 });
    const kode = await page.evaluate(() => (document.querySelector('.sr-kode span') || {}).textContent);
    const nomorP = await page.textContent('.sr-nomor');
    const tautanP = await page.inputValue('#srTautan');
    cek('kode lacak 6 huruf tampil untuk diberikan ke pemohon', /^[A-Z2-9]{6}$/.test(kode || ''), kode);
    await page.goto(A + '/surat.html#pengajuan');
    await siap('pengajuan');
    const kolom = await page.evaluate(() => [...document.querySelectorAll('.sr-kolom')].map((k) => k.dataset.status + ':' + k.querySelectorAll('.sr-kartu').length));
    cek('papan: tujuh kolom, kartu baru di Diterima', kolom.length === 7 && kolom[0] === 'diterima:1', kolom);
    /* Seret ke kolom yang melompat: harus dijelaskan, bukan diam. */
    await page.evaluate(() => {
      const k = document.querySelector('.sr-kartu'), dt = new DataTransfer();
      dt.setData('text/plain', k.dataset.id);
      document.querySelector('.sr-kolom[data-status="disetujui"]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });
    cek('menyeret melompati langkah ditolak dengan penjelasan', /hanya bisa ke Diproses/.test(await toastTeks()), await toastTeks());
    await page.click('.sr-lanjut');
    await page.waitForSelector('#pSimpan', { timeout: 5000 });
    await page.fill('#pCatatan', 'Berkas lengkap');
    await page.click('#pSimpan');
    const pindahOk = await page.waitForFunction(() => document.querySelector('.sr-kolom[data-status="diproses"] .sr-kartu'), null, { timeout: 10000 }).then(() => true).catch(() => false);
    cek('tombol lanjut memindah kartu ke Diproses', pindahOk, [await toastTeks(), await page.evaluate(() => document.getElementById('modalBg').className + ' ' + document.getElementById('modalBody').innerText.slice(0, 200))]);
    if (!pindahOk) throw new Error('berhenti');
    await page.evaluate(() => {
      const k = document.querySelector('.sr-kartu'), dt = new DataTransfer();
      dt.setData('text/plain', k.dataset.id);
      document.querySelector('.sr-kolom[data-status="asesmen"]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    });
    await page.waitForSelector('#pSimpan', { timeout: 5000 });
    cek('menyeret ke langkah berikutnya membuka konfirmasi', /Asesmen/.test(await page.textContent('#modalTitle')));
    await page.click('#pSimpan');
    await page.waitForFunction(() => document.querySelector('.sr-kolom[data-status="asesmen"] .sr-kartu'), null, { timeout: 10000 });
    await page.click('.sr-tampil button[data-t="daftar"]');
    await page.waitForSelector('.sr-daftar .sr-baris', { timeout: 5000 });
    cek('tampilan daftar pengajuan', (await page.$$('.sr-daftar .sr-baris')).length === 1);

    console.log('\n=== F. LACAK PUBLIK ===');
    const lacak = await ctx.newPage();
    await lacak.goto(A + '/lacak.html?n=' + encodeURIComponent(nomorP));
    cek('nomor terisi dari tautan', (await lacak.inputValue('#lkNomor')) === nomorP);
    await lacak.fill('#lkKode', kode.toLowerCase());
    await lacak.click('#lkCari');
    await lacak.waitForSelector('#lkKartu, #lkGalat', { timeout: 10000 });
    const lk = await lacak.evaluate(() => ({ teks: document.body.innerText, ya: document.querySelectorAll('.lk-langkah li.ya').length }));
    cek('pemohon melihat status Asesmen dengan tiga langkah terlewati', /Status sekarang: Asesmen/.test(lk.teks) && lk.ya === 3, lk);
    cek('halaman lacak tidak menampilkan nama pemohon, petugas, atau catatan internal', !/Pemohon Contoh|Berkas lengkap|Super/i.test(lk.teks), lk.teks.slice(0, 200));
    await lacak.setViewportSize({ width: 390, height: 800 });
    cek('lacak di HP tanpa geser ke samping', await lacak.evaluate(() => document.documentElement.scrollWidth <= 391));
    await lacak.close();

    console.log('\n=== F2. TAUTAN PUBLIK LANGSUNG TERBUKA ===');
    {
      const tp = await ctx.newPage();
      await tp.goto(tautanP);
      await tp.waitForSelector('#lkKartu, #lkGalat', { timeout: 10000 });
      const a = await tp.evaluate(() => document.body.innerText);
      cek('tautan pengajuan langsung menampilkan progres tanpa mengetik apa pun', /Status sekarang: Asesmen/.test(a), a.slice(0, 200));
      await tp.goto(tautanMasuk);
      await tp.waitForSelector('#lkKartu, #lkGalat', { timeout: 10000 });
      const m = await tp.evaluate(() => ({ teks: document.body.innerText, langkah: document.querySelectorAll('.lk-langkah li').length }));
      cek('tautan surat masuk menampilkan progres 4 langkah', /Surat Masuk/.test(m.teks) && /Status sekarang: Didisposisi/.test(m.teks) && m.langkah === 4, m);
      cek('tautan publik tanpa nama pengirim dan nomor surat asal', !/PCM Contoh|45\/PCM/.test(m.teks), m.teks.slice(0, 200));
      await tp.goto(tautanMasuk.replace(/k=[A-Z2-9]{6}/, 'k=AAAAAA'));
      await tp.waitForSelector('#lkKartu, #lkGalat', { timeout: 10000 });
      cek('kode salah tidak menampilkan apa pun', (await tp.evaluate(() => !!document.getElementById('lkGalat') && !document.getElementById('lkKartu'))));
      await tp.close();
    }

    console.log('\n=== F3. TEMA GELAP: TEKS TERBACA ===');
    {
      const PINDAI = require('./_kontras.js');
      await page.evaluate(() => { localStorage.setItem('laz_theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); });
      for (const rute of ['dasbor', 'masuk', 'keluar', 'pengajuan', 'disposisi']) {
        await page.goto(A + '/surat.html#' + rute);
        await siap(rute);
        await page.waitForTimeout(500);
        const r = await page.evaluate(PINDAI, 2.5);
        cek('surat ' + rute + ' di tema gelap: semua teks terbaca', r.length === 0, r.slice(0, 3));
      }
      await page.goto(A + '/surat.html#masuk'); await siap('masuk');
      await page.evaluate(() => { location.hash = '#s/' + document.querySelector('.sr-baris').dataset.id; });
      await page.waitForFunction(() => /^s\//.test(document.body.getAttribute('data-halaman-siap') || ''), null, { timeout: 10000 });
      await page.waitForTimeout(500);
      const rd = await page.evaluate(PINDAI, 2.5);
      cek('detail surat (kartu tautan publik, riwayat) di tema gelap: semua teks terbaca', rd.length === 0, rd.slice(0, 3));
      const lg = await ctx.newPage();
      await lg.addInitScript(() => { try { localStorage.setItem('laz_theme', 'dark'); } catch (_) {} });
      await lg.goto(tautanP);
      await lg.waitForSelector('#lkKartu, #lkGalat', { timeout: 10000 });
      const rl = await lg.evaluate(PINDAI, 2.5);
      cek('halaman lacak berisi hasil di tema gelap: semua teks terbaca', rl.length === 0, rl.slice(0, 3));
      await lg.close();
      await page.evaluate(() => { localStorage.setItem('laz_theme', 'light'); document.documentElement.setAttribute('data-theme', 'light'); });
    }

    console.log('\n=== G. HP DAN KEBERSIHAN ===');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(A + '/surat.html#dasbor');
    await siap('dasbor');
    cek('beranda di HP tanpa geser ke samping', await page.evaluate(() => document.documentElement.scrollWidth <= 391), await page.evaluate(() => document.documentElement.scrollWidth));
    await page.evaluate(() => { location.hash = '#s/' + document.querySelector('.sr-baris').dataset.id; });
    await page.waitForFunction(() => /^s\//.test(document.body.getAttribute('data-halaman-siap') || ''), null, { timeout: 10000 });
    cek('detail di HP tanpa geser ke samping', await page.evaluate(() => document.documentElement.scrollWidth <= 391), await page.evaluate(() => document.documentElement.scrollWidth));
    cek('tidak ada em dash di layar', !/—/.test(await page.evaluate(() => document.body.innerText)));
    cek('tidak ada galat JavaScript', galatHal.length === 0, galatHal);
  } finally {
    await browser.close();
    srv.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: tampilan modul Surat belum benar.\n'); process.exit(1); }
  console.log('\ntest_surat_ui.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
