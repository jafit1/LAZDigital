/* Uji: Formulir A2 selalu tercetak SATU lembar A5 mendatar, apa pun isinya.
 *
 * Bug (21 Oktober 2026): dicetak atau disimpan PDF, formulir pecah jadi dua
 * lembar. Isi tabel tumbuh mengikuti data (sampai enam jenis dana, dua kali:
 * tunai dan bank) dan nama petugas panjang membuat baris membungkus, sedangkan
 * tinggi kertas tetap 134 mm. Terukur: tiga jenis dana muat (128 mm), enam
 * jenis dana 152 mm dan jatuh ke halaman kedua.
 *
 * Diukur di Chromium sungguhan lewat PDF-nya (jumlah halaman dan ukuran
 * kertas), bukan membaca teks CSS. Data BUATAN, repositori ini publik.
 *
 *   node tools/test_a2_satu_lembar.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');

function muatPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const AKAR = path.join(__dirname, '..'), PUBLIK = path.join(AKAR, 'src', 'public');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 260)); }
};

let DB = null, TOKEN = '';
const geser = (tgl, n) => { const d = new Date(tgl + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const hari = geser(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), 0);
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

const SKENARIO = {
  biasa:    { tgl: geser(hari, 0), jenis: ['Zakat', 'Infak', 'Wakaf'],                                  nama: ['Tim'] },
  terburuk: { tgl: geser(hari, 1), jenis: ['Zakat', 'Infak', 'Wakaf', 'Kurban', 'Fidyah', 'Amil'],     nama: ['Tim Relawan Bantul Kota', 'Tim Relawan Sewon', 'Tim Relawan Pundong'] },
};

(async () => {
  const s = {}; for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  TOKEN = (await rpc('login', ['superadmin', 'Admin12345'])).token;
  tambah('Rekening', { id: 'r1', namaBank: 'Bank Syariah Contoh', nomor: '1234567890', atasNama: 'Lazismu Contoh', fundGroup: 'Infak', aktif: 'true' });
  let n = 0;
  for (const k of Object.keys(SKENARIO)) {
    const sk = SKENARIO[k];
    for (const jd of sk.jenis) for (const m of ['Cash/Tunai', 'Transfer Bank']) for (const fr of sk.nama) {
      n++;
      tambah('Penghimpunan', { id: 'h' + n, noKwitansi: 'KW/' + n, tanggal: sk.tgl, jenisDana: jd, subJenis: jd, namaDonatur: 'Donatur ' + n,
        jumlah: 100000 + n * 1000, metode: m, rekeningId: m === 'Transfer Bank' ? 'r1' : '', fundraising: fr, petugas: 'Super Administrator', dibuat: new Date().toISOString() });
    }
  }
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ALAMAT = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(CHROMIUM);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript((x) => { try { localStorage.setItem('laz_token', x.t); localStorage.setItem('laz_theme', 'light'); } catch (_) {} }, { t: TOKEN });
    const p = await ctx.newPage();
    await p.goto(ALAMAT + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.dgrid .wc', { timeout: 20000 });

    for (const k of Object.keys(SKENARIO)) {
      console.log('\n=== ' + k.toUpperCase() + ' ===');
      const html = await p.evaluate(async (tgl) => {
        const d = await gas('apiLaporanHarian')(TOKEN, tgl);
        A2_DATA = d;
        return buildA2HTML(d, { kota: 'Bantul', kasir: 'Nama Kasir Lengkap', keuangan: 'Nama Bagian Keuangan', lembar: d.ringkas.himpunCount });
      }, SKENARIO[k].tgl);
      const p2 = await ctx.newPage();
      await p2.setContent(html, { waitUntil: 'load' });
      await p2.waitForTimeout(150);
      const pdf = path.join(os.tmpdir(), 'a2-uji-' + k + '.pdf');
      await p2.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
      const buf = fs.readFileSync(pdf).toString('latin1');
      const halaman = (buf.match(/\/Type\s*\/Page[^s]/g) || []).length;
      const kotak = (buf.match(/\/MediaBox\s*\[\s*([\d.\s]+)\]/) || [])[1];
      const [, , lebar, tinggi] = (kotak || '').trim().split(/\s+/).map(Number);
      cek('satu lembar saja', halaman === 1, { halaman });
      cek('ukuran kertas A5 mendatar (595 x 420 pt)', Math.abs(lebar - 595) <= 2 && Math.abs(tinggi - 420) <= 2, { lebar, tinggi });
      /* Diukur dalam mode cetak, dari tepi atas lembar: kertas A5 mendatar dengan
         margin 7 mm menyisakan 134 mm tinggi. */
      await p2.emulateMedia({ media: 'print' });
      const u = await p2.evaluate(() => {
        const mm = 96 / 25.4, l = document.querySelector('.lembar').getBoundingClientRect();
        const jauh = (s) => { const e = document.querySelector(s); return e ? Math.round((e.getBoundingClientRect().bottom - l.top) / mm * 10) / 10 : null; };
        return { ttdMm: jauh('table.ttd'), kiriMm: jauh('table.kiri'), kananMm: jauh('table.kanan'), lembarMm: Math.round(l.height / mm * 10) / 10,
          teksKasir: /Kasir/.test(document.body.innerText), teksKeuangan: /Keuangan/.test(document.body.innerText) };
      });
      cek('blok tanda tangan masuk dalam 134 mm tinggi kertas', u.ttdMm !== null && u.ttdMm <= 134, u);
      cek('tabel penerimaan masuk dalam 134 mm tinggi kertas', u.kiriMm !== null && u.kiriMm <= 134, u);
      cek('lembar tidak lebih tinggi dari kertas', u.lembarMm <= 134, u);
      cek('Kasir dan Keuangan tercetak', u.teksKasir && u.teksKeuangan, u);
      /* Posisi susunan semula (pemilik, 21 Oktober 2026): tanda tangan di bawah
         tabel penerimaan (kolom kiri), kolom denominasi di kanan berdiri sendiri. */
      const pos = await p2.evaluate(() => {
        const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
        const ttd = r('table.ttd'), kiri = r('table.kiri'), kanan = r('table.kanan'), kn = r('.sisi.kn');
        return { ttdKiri: Math.round(ttd.left), kananKiri: Math.round(kanan.left), ttdAtas: Math.round(ttd.top), kiriBawah: Math.round(kiri.bottom),
          lebarKn: Math.round(kn.width), ttdDiKolomKanan: !!document.querySelector('.sisi.kn table.ttd') };
      });
      cek('tanda tangan di kolom kiri, bukan di bawah denominasi', pos.ttdDiKolomKanan === false && pos.ttdKiri < pos.kananKiri, pos);
      cek('tanda tangan tepat di bawah tabel penerimaan', pos.ttdAtas >= pos.kiriBawah - 1, pos);
      if (k === 'terburuk') {
        /* Pengaman: isi dipaksa 40 mm lebih tinggi dari yang muat. Tata letaknya
           sendiri sudah muat untuk isi terburuk yang wajar, jadi pengecil otomatis
           hanya terpicu oleh kejadian tak terduga; di sini dipicu sengaja. */
        const html2 = html.replace('<div class="isi">', '<div style="height:40mm"></div><div class="isi">');
        const p3 = await ctx.newPage();
        await p3.setContent(html2, { waitUntil: 'load' });
        await p3.waitForTimeout(150);
        const pdf2 = path.join(os.tmpdir(), 'a2-uji-berlebih.pdf');
        await p3.pdf({ path: pdf2, preferCSSPageSize: true, printBackground: true });
        const hal2 = (fs.readFileSync(pdf2).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
        await p3.emulateMedia({ media: 'print' });
        const sk = await p3.evaluate(() => {
          const mm = 96 / 25.4, l = document.querySelector('.lembar').getBoundingClientRect();
          const tt = document.querySelector('table.ttd').getBoundingClientRect();
          return { skala: document.querySelector('.konten').style.getPropertyValue('--skala'), ttdMm: Math.round((tt.bottom - l.top) / mm * 10) / 10 };
        });
        cek('isi berlebih tetap satu lembar', hal2 === 1, { halaman: hal2, ...sk });
        cek('pengecil otomatis bekerja (skala di bawah 1)', Number(sk.skala) > 0 && Number(sk.skala) < 1, sk);
        /* Satu lembar belum cukup: overflow:hidden juga membuatnya "satu lembar"
           dengan memotong tanda tangan. Yang diperiksa: tanda tangan terlihat penuh. */
        cek('tanda tangan tidak terpotong setelah dikecilkan (di dalam 132 mm)', sk.ttdMm <= 132, sk);
        await p3.close();
      }
      await p2.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: Formulir A2 belum satu lembar.\n'); process.exit(1); }
  console.log('\ntest_a2_satu_lembar.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
  setTimeout(() => process.exit(0), 200).unref();
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
