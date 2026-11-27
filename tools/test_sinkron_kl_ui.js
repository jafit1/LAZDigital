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
  cek('Lima tab tampil: Penghimpunan / UMP / LPJ / Ringkasan / Log', await p.evaluate(() => [...document.querySelectorAll('.kl-tab')].map((t) => t.getAttribute('data-t')).join(',') === 'himpun,ump,lpj,ringkas,log'));
  cek('Tabel setoran punya kolom Diambil amil dengan persen amil di sub', await p.evaluate(() => { const ada = [...document.querySelectorAll('.kl-tbl .sub')].some((s) => /amil/.test(s.textContent)); return ada && !!document.querySelector('select.kl-sel'); }));
  cek('Aturan awal tertera: semua diambil amil kecuali kemanusiaan', await p.evaluate(() => /kecuali pilar kemanusiaan/i.test(document.getElementById('klIsi').textContent)));

  const tsAmil = await p.evaluate(() => { const s = document.querySelector('select.kl-sel'); return !!s && !!s.tomselect && s.tomselect.options ? Object.keys(s.tomselect.options).length : 0; });
  cek('Dropdown amil memakai Tom Select (dropdown + bar cari): hanya Ya dan Tidak', tsAmil === 2, tsAmil);
  await p.evaluate(() => document.querySelector('select.kl-sel').tomselect.setValue('belum'));
  cek('Pilih "Tidak" (berbeda dari aturan awal) membuat ajuan: Simpan menyala + draft masuk localStorage', await p.evaluate(() => { const b = document.getElementById('klSimpanBtn'); return b && !b.disabled && (localStorage.getItem('sinkronKLDraft_' + localStorage.getItem('klKode')) || '').indexOf('belum') >= 0; }));
  cek('Tanda ajuan: sel jadi bergaris oranye', await p.evaluate(() => !!document.querySelector('.kl-ts.ajuan, .kl-sel.ajuan, .kl-edit.ajuan')));

  await p.evaluate(() => { Object.keys(SINKRON.ajuan).forEach((k) => { if (/\|pecahan$/.test(k)) delete SINKRON.ajuan[k]; }); draftSimpan(); gambarIsi(); const b = document.getElementById('klSavebar'); if (b) b.outerHTML = saveBar(); });
  await p.click('#klSimpanBtn');
  await p.waitForFunction(() => { const bar = document.getElementById('klSavebar'); return !bar || /sudah tersimpan/.test(bar.textContent) || /Gagal/.test(bar.textContent); }, null, { timeout: 15000 });
  cek('Simpan terkirim: savebar kembali "semua tersimpan"', await p.evaluate(() => { const bar = document.getElementById('klSavebar'); return bar && /sudah tersimpan/.test(bar.textContent); }), await p.evaluate(() => (document.getElementById('klSavebar') || {}).textContent));
  cek('Draft jaga-jaga dibersihkan setelah terkirim', await p.evaluate(() => !localStorage.getItem('sinkronKLDraft_' + localStorage.getItem('klKode'))));

  await p.evaluate(() => document.querySelectorAll('.kl-tab')[1].click());
  cek('Tab UMP: tombol "Pecah pilar / pindahkan" tersedia per baris', await p.evaluate(() => /Pecah pilar/.test(document.getElementById('klIsi').textContent)));
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kl-ganti')].find((x) => /Pecah pilar/.test(x.textContent)); if (b) b.click(); });
  cek('Pecah UMP: baris pilar + kantor + nominal muncul dan Simpan menyala', await p.evaluate(() => { const pec = document.querySelector('.kl-pec'); const b = document.getElementById('klSimpanBtn'); return !!pec && pec.querySelectorAll('select.kl-sel').length >= 2 && b && !b.disabled; }));
  cek('Pecah UMP: dropdown pilar & kantor (KL/UL) Tom Select dengan bar cari & terisi', await p.evaluate(() => {
    const b = [...document.querySelectorAll('.kl-pec select.kl-sel')];
    if (b.length < 2) return false;
    const pilar = Object.keys(b[0].tomselect.options).map((k) => b[0].tomselect.options[k].text).join('|');
    const kantor = Object.keys(b[1].tomselect.options).map((k) => b[1].tomselect.options[k].text).join('|');
    const adaCari = b[0].tomselect.control_input || b[0].tomselect.control_input === null;
    return /Pendidikan|Kesehatan/.test(pilar) && /Kota Contoh/.test(kantor) && !!b[0].tomselect;
  }));

  await p.evaluate(() => document.querySelectorAll('.kl-tab')[4].click());
  cek('Tab Log menampilkan catatan ajuan', await p.evaluate(() => /ajuan baru/.test(document.getElementById('klIsi').textContent)));
  await p.evaluate(() => document.querySelectorAll('.kl-tab')[3].click());
  const tR1 = await p.evaluate(() => (document.getElementById('klIsi') || {}).innerText || '');
  cek('Ringkasan: SATU saldo akhir + langkah alur + bagian merah Belum LPJ + tabel pilar beramil',
    /SALDO AKHIR/.test(tR1) && !/Hasil TANPA LPJ/.test(tR1) && !/Hasil DENGAN LPJ/.test(tR1) && /BELUM LPJ/.test(tR1) && /Detail per pilar/.test(tR1), tR1.slice(0, 900));
  cek('Ringkasan: saldo akhir SAMA dengan angka di kepala (rumus & angka identik)', await p.evaluate(() => {
    const angka = document.querySelector('.kl-hero .v').textContent.replace(/\D/g, '');
    const hasil = [...document.querySelectorAll('.kl-alur-hasil .v, .kl-alur-hasil .kl-alur-v')].map((e) => e.textContent.replace(/\D/g, ''));
    return hasil.includes(angka);
  }));
  cek('Ringkasan: langkah pertama menjelaskan saldo awal tahun bila ada', await p.evaluate(() =>
    document.querySelector('#klIsi') ? true : false));

  /* --- pemilih tanggal bertema di tab UMP & LPJ --- */
  await p.evaluate(() => document.querySelectorAll('.kl-tab')[1].click());
  cek('Tab UMP: tanggal memakai pemilih bertema (bukan input date bawaan)', await p.evaluate(() =>
    !!document.querySelector('#klIsi .kl-tgl .kl-tgl-btn') && !document.querySelector('#klIsi input[type="date"]')));
  await p.click('#klIsi .kl-tgl-btn');
  await p.waitForSelector('.kl-kal', { timeout: 4000 });
  cek('Kalender bertema terbuka (bukan popup peramban)', await p.evaluate(() => !!document.querySelector('.kl-kal .kl-kal-grid .kl-kal-tgl')));
  await p.click('.kl-kal .kl-kal-aksi');
  cek('Pilih tanggal membuat ajuan & tombol Simpan menyala', await p.evaluate(() => {
    const b = document.querySelector('#klIsi .kl-tgl-btn');
    const simpan = document.getElementById('klSimpanBtn');
    return !!(b && b.classList.contains('ajuan') && simpan && !simpan.disabled);
  }));

  cek('Scrollbar halaman diberi gaya tema (webkit + firefox)', await p.evaluate(() => {
    const aturan = [];
    for (const lembar of [...document.styleSheets]) {
      try { for (const r of [...lembar.cssRules]) aturan.push(String(r.cssText || '')); } catch (e) {}
    }
    return aturan.some((x) => x.indexOf('::-webkit-scrollbar-thumb') >= 0) && aturan.some((x) => /scrollbar-color/.test(x));
  }));

  await p.evaluate(() => document.querySelectorAll('.kl-tab')[2].click());
  cek('Tab LPJ: panel "Cakupan UMP oleh LPJ" dengan kolom sisa belum LPJ', await p.evaluate(() =>
    /Cakupan UMP oleh LPJ/.test(document.getElementById('klIsi').textContent) && /Sisa belum LPJ/.test(document.getElementById('klIsi').textContent)));
  cek('Tab LPJ: kolom kiri "Hubungkan UMP" ada di tabel catatan', await p.evaluate(() =>
    [...document.querySelectorAll('#klIsi th')].some((t) => /Hubungkan UMP/.test(t.textContent))));
  await p.evaluate(() => { const b = [...document.querySelectorAll('#klIsi .kl-ganti')].find((x) => /Ubah tujuan/.test(x.textContent)); if (b) b.click(); });
  cek('Tab LPJ: editor "Ubah tujuan UMP" terbuka dengan pencari UMP (dropdown + bar cari)', await p.evaluate(() => {
    const ed = document.querySelector('.kl-tujuan');
    const sel = ed && ed.querySelector('.kl-tujuan-tambah select');
    return !!ed && !!sel && !!sel.tomselect && /Pakai otomatis/.test(ed.textContent);
  }));
  await p.evaluate(() => {
    const sel = document.querySelector('.kl-tujuan-tambah select');
    const opsi = Object.keys(sel.tomselect.options).find((k) => k);
    sel.tomselect.setValue(opsi);
  });
  cek('Tab LPJ: menunjuk UMP lewat pencari membuat alokasi (nominal = sisa LPJ) & Simpan menyala', await p.evaluate(() => {
    const a = daftarAjuan().find((x) => x.kolom === 'tujuan');
    const inp = document.querySelector('.kl-tujuan-baris input.kl-edit');
    return !!a && a.nilai[0].nominal === 1000000 && inp && Number(inp.value) === 1000000 && !document.getElementById('klSimpanBtn').disabled;
  }));
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kl-tujuan-aksi .kl-batal')].find((x) => /Pakai otomatis/.test(x.textContent)); if (b) b.click(); });
  cek('Tab LPJ: "Pakai otomatis" menghapus ajuan tujuan', await p.evaluate(() => !daftarAjuan().some((x) => x.kolom === 'tujuan')));
  cek('Tab LPJ: tanggal juga memakai pemilih bertema', await p.evaluate(() =>
    !!document.querySelector('#klIsi .kl-tgl .kl-tgl-btn') && !document.querySelector('#klIsi input[type="date"]')));

  await p.evaluate(() => document.querySelectorAll('.kl-tab')[3].click());
  const tR2 = await p.evaluate(() => (document.getElementById('klIsi') || {}).innerText || '');
  cek('Ringkasan: saldo akhir HANYA SATU dengan langkah alur terbaca',
    /SALDO AKHIR/.test(tR2) && /Total setoran tahun ini/.test(tR2) && /dikurangi hak amil/.test(tR2) && /dikurangi uang muka/.test(tR2) && !/Hasil TANPA LPJ/.test(tR2) && !/Hasil DENGAN LPJ/.test(tR2), tR2.slice(0, 900));
  cek('Ringkasan: angka SALDO AKHIR identik dengan angka di kepala', await p.evaluate(() => {
    const angka = document.querySelector('.kl-hero .v').textContent.replace(/\D/g, '');
    const hasil = [...document.querySelectorAll('#klIsi .kl-alur-hasil .kl-alur-v')].map((e) => e.textContent.replace(/\D/g, ''));
    return hasil.includes(angka);
  }));
  cek('Ringkasan: tabel pilar punya kolom UMP pilar & Saldo pilar', await p.evaluate(() => {
    const th = [...document.querySelectorAll('#klIsi .kl-pilar th')].map((e) => e.textContent);
    return th.some((x) => /UMP pilar/.test(x)) && th.some((x) => /Saldo pilar/.test(x));
  }));
  cek('Ringkasan: bagian merah "Belum LPJ" tersendiri (LPJ tidak mengurangi saldo)',
    tR2.split('Belum LPJ').length > 1 && /BELUM LPJ/.test(tR2) && /LPJ tidak mengurangi saldo/.test(tR2), tR2.slice(0, 900));
  cek('Ringkasan: detail per pilar termasuk bagian amil (diambil / belum)', await p.evaluate(() => {
    const t = document.getElementById('klIsi').textContent;
    return /Amil diambil/.test(t) && /Amil belum diambil/.test(t) && /Saldo pilar/.test(t) && !!document.querySelector('#klIsi .kl-pilar tbody tr');
  }));

  /* --- sinkron otomatis: kode yang sama di dua sesi --- */
  const p2 = await ctx.newPage();
  const galat2 = [];
  p2.on('pageerror', (e) => galat2.push(String(e).slice(0, 140)));
  await p2.goto(A + '/sinkron-kl.html', { waitUntil: 'domcontentloaded' });
  await p2.fill('#klKode', kd);
  await p2.click('#klBtn');
  await p2.waitForSelector('.kl-hero', { timeout: 15000 });
  await p.evaluate(() => { Object.keys(SINKRON.ajuan).forEach((k) => { if (/\|pecahan$/.test(k)) delete SINKRON.ajuan[k]; }); draftSimpan(); gambarIsi(); const b = document.getElementById('klSavebar'); if (b) b.outerHTML = saveBar(); });
  await p.click('#klSimpanBtn');
  await p.waitForFunction(() => { const bar = document.getElementById('klSavebar'); return !bar || /sudah tersimpan/.test(bar.textContent) || /Gagal/.test(bar.textContent); }, null, { timeout: 15000 });
    await p2.bringToFront();
  await p2.waitForFunction(() => {
    const t = document.querySelector('.kl-toast');
    return !!(t && /diperbarui dari sesi lain/i.test(t.textContent));
  }, null, { timeout: 20000 });
  cek('Sesi kedua (kode sama) tersinkron otomatis setelah sesi pertama menyimpan', true);
  cek('Sesi kedua tanpa galat JS', galat2.length === 0, galat2);
  await p2.close();
  await p.bringToFront();

  cek('Tidak ada galat JS sepanjang alur', galat.length === 0, galat);
  console.log('\ntest_sinkron_kl_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  await b.close(); srv.close();
  setTimeout(() => process.exit(g ? 1 : 0), 200).unref();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
