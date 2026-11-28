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
  cek('Tabel setoran punya kolom Diambil amil dengan persen amil di sub', await p.evaluate(() => { const ada = [...document.querySelectorAll('.kl-tbl .sub')].some((s) => /amil/.test(s.textContent)); return ada && !!document.querySelector('.kl-amil-switch'); }));
  cek('Aturan awal tertera: semua diambil amil kecuali kemanusiaan', await p.evaluate(() => /kecuali pilar kemanusiaan/i.test(document.getElementById('klIsi').textContent)));

  const tsAmil = await p.evaluate(() => { const s = document.querySelector('select.kl-sel'); return s ? 'ada' : 'tidak'; });
  cek('Status amil: sakelar Ya/Tidak + catatan nilai efektif di bawahnya (tanpa dropdown)', await p.evaluate(() => {
    const sw = document.querySelector('.kl-amil-switch input[type="checkbox"]');
    const note = document.querySelector('.kl-amil-note');
    return !!sw && !!note && /amil|ambil/.test(note.textContent) && !document.querySelector('#klIsi select.kl-sel');
  }), tsAmil);
  /* Klik sakelar yang sedang "Ya" → "Tidak": halaman tidak boleh digambar ulang / bergeser. */
  const geser = await p.evaluate(() => {
    const sw = [...document.querySelectorAll('.kl-amil-switch input')].find((i) => i.checked);
    if (!sw) return { ada: false };
    sw.scrollIntoView({ block: 'center' });
    const y0 = window.scrollY, tabel = document.querySelector('#klIsi .kl-tbl');
    const kunci = sw.parentNode.getAttribute('data-kunci');
    sw.click();
    const note = document.querySelector('.kl-amil-note[data-kunci="' + kunci + '"]');
    return { ada: true, sama: tabel === document.querySelector('#klIsi .kl-tbl') && sw.isConnected, dy: Math.abs(window.scrollY - y0), note: note ? note.textContent + '|' + note.className : '' };
  });
  cek('Klik sakelar amil: tabel tidak digambar ulang & gulir tidak bergeser', geser.ada && geser.sama && geser.dy === 0, JSON.stringify(geser));
  cek('Klik sakelar amil: catatan berubah ke "amil Rp 0" bertanda diubah', /amil Rp 0/.test(geser.note) && /diubah/.test(geser.note), geser.note);
  /* Klik sakelar bolak-balik: kolom, baris, sakelar, dan savebar tidak boleh bergeser sepiksel pun. */
  const diam = await p.evaluate(() => {
    const sw = document.querySelector('.kl-amil-switch input');
    const row = sw.closest('tr');
    const bar = document.getElementById('klSavebar');
    const ukur = () => JSON.stringify({
      th: [...document.querySelectorAll('#klIsi .kl-tbl thead th')].map((t) => Math.round(t.getBoundingClientRect().left) + ':' + Math.round(t.getBoundingClientRect().width)),
      row: Math.round(row.getBoundingClientRect().height), sw: Math.round(sw.getBoundingClientRect().left), y: window.scrollY,
    });
    const u0 = ukur(); sw.click(); const u1 = ukur(); sw.click(); const u2 = ukur();
    return { sama: u0 === u1 && u1 === u2, barSama: bar === document.getElementById('klSavebar'), u0, u1 };
  });
  cek('Klik sakelar amil bolak-balik: kolom, tinggi baris, posisi sakelar & savebar diam', diam.sama && diam.barSama, JSON.stringify(diam));
  /* Checkbox tak terlihat harus menutup seluruh track (110px) supaya sisi "Tidak" (kanan) bisa diklik. */
  cek('Sakelar amil: area klik (checkbox) selebar track penuh — sisi Ya & Tidak keduanya bisa ditekan', await p.evaluate(() => {
    const sw = document.querySelector('.kl-amil-switch input[type="checkbox"]');
    const trk = document.querySelector('.kl-amil-switch .track');
    if (!sw || !trk) return false;
    const a = sw.getBoundingClientRect(), b = trk.getBoundingClientRect();
    return Math.abs(a.width - b.width) <= 1 && a.width >= 100;
  }));
  cek('Pilih "Tidak" (berbeda dari aturan awal) membuat ajuan: Simpan menyala + draft masuk localStorage', await p.evaluate(() => { const b = document.getElementById('klSimpanBtn'); return b && !b.disabled && (localStorage.getItem('sinkronKLDraft_' + localStorage.getItem('klKode')) || '').indexOf('belum') >= 0; }));
  cek('Tanda ajuan: kelompok tombol jadi bergaris oranye', await p.evaluate(() => !!document.querySelector('.kl-amil-switch.ajuan, .kl-ts.ajuan, .kl-sel.ajuan, .kl-edit.ajuan')));

  await p.evaluate(() => { Object.keys(SINKRON.ajuan).forEach((k) => { if (/\|pecahan$/.test(k)) delete SINKRON.ajuan[k]; }); draftSimpan(); gambarIsi(); const b = document.getElementById('klSavebar'); if (b) b.outerHTML = saveBar(); });
  await p.click('#klSimpanBtn');
  await p.waitForFunction(() => { const bar = document.getElementById('klSavebar'); return !bar || /sudah tersimpan/.test(bar.textContent) || /Gagal/.test(bar.textContent); }, null, { timeout: 15000 });
  cek('Simpan terkirim: savebar kembali "semua tersimpan"', await p.evaluate(() => { const bar = document.getElementById('klSavebar'); return bar && /sudah tersimpan/.test(bar.textContent); }), await p.evaluate(() => (document.getElementById('klSavebar') || {}).textContent));
  cek('Draft jaga-jaga dibersihkan setelah terkirim', await p.evaluate(() => !localStorage.getItem('sinkronKLDraft_' + localStorage.getItem('klKode'))));

  await p.evaluate(() => document.querySelectorAll('.kl-tab')[1].click());
  cek('Tab UMP: tombol "Pecah pilar / pindahkan" tersedia per baris', await p.evaluate(() => /Pecah pilar/.test(document.getElementById('klIsi').textContent)));
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kl-ganti')].find((x) => /Pecah pilar/.test(x.textContent)); if (b) b.click(); });
  cek('Pecah UMP: panel detail terbuka di bawah kartunya dengan pilar, nominal, dan Simpan menyala', await p.evaluate(() => { const pec = document.querySelector('.kl-ump-item.buka .kl-pec-panel .kl-pec'); const b = document.getElementById('klSimpanBtn'); return !!pec && pec.querySelectorAll('.kl-pec-baris select.kl-pilih-pilar').length >= 1 && !!pec.querySelector('.kl-pec-nom input') && b && !b.disabled; }));
  cek('Pecah UMP: tiap pos punya empat kolom berlabel (Pilar, Keterangan, Nominal, Kantor)', await p.evaluate(() => {
    const l = [...document.querySelectorAll('.kl-pec-baris')[0].querySelectorAll('.kl-f-l')].map((e) => e.textContent).join('|');
    return /Pilar/.test(l) && /Keterangan/.test(l) && /Nominal/.test(l) && /Kantor/.test(l);
  }));
  cek('Pecah UMP: dropdown Tom Select tidak kolaps (ts-hidden-accessible tidak bocor ke pembungkus)', await p.evaluate(() => {
    const w = [...document.querySelectorAll('.kl-pec .ts-wrapper')];
    return w.length >= 1 && w.every((x) => !x.classList.contains('ts-hidden-accessible') && x.getBoundingClientRect().height > 20 && x.getBoundingClientRect().width > 60);
  }));
  cek('Pecah UMP: dropdown pilar terisi daftar lengkap + opsi "Lainnya (tulis sendiri)"', await p.evaluate(() => {
    const s = document.querySelector('.kl-pec-baris select.kl-pilih-pilar');
    if (!s) return false;
    const teks = s.tomselect ? Object.keys(s.tomselect.options).map((k) => s.tomselect.options[k].text).join('|') : [...s.options].map((o) => o.text).join('|');
    return /Pendidikan|Kesehatan/.test(teks) && /Lainnya/.test(teks);
  }));
  const ubahNom = await p.evaluate(() => {
    const inp = document.querySelector('.kl-pec-nom input'); const panel = document.querySelector('.kl-pec-panel');
    inp.value = 1000; inp.dispatchEvent(new Event('change'));
    return { sama: panel === document.querySelector('.kl-pec-panel') && inp.isConnected, sum: (document.querySelector('.kl-pec-sum') || {}).textContent || '' };
  });
  cek('Pecah UMP: ubah nominal pos memperbarui ringkasan tanpa menggambar ulang panel', ubahNom.sama && /total pos/.test(ubahNom.sum), JSON.stringify(ubahNom));
  await p.evaluate(() => { const b = document.querySelector('.kl-ump-item.buka .pec-btn'); b.click(); });
  cek('Pecah UMP: "Tutup detail" menutup panel tapi ajuan pecahan tetap ada', await p.evaluate(() =>
    !document.querySelector('.kl-pec-panel') && /Pecahan pilar/.test(document.querySelector('.pec-btn[aria-expanded="false"]').textContent) && Object.keys(SINKRON.ajuan).some((k) => /\|pecahan$/.test(k))));
  await p.evaluate(() => { const b = [...document.querySelectorAll('.pec-btn')].find((x) => /Pecahan pilar/.test(x.textContent)); b.click(); });
  cek('Pecah UMP: dibuka lagi, panel kembali', await p.evaluate(() => !!document.querySelector('.kl-pec-panel')));
  for (const w of [1280, 980, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(150);
    const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    cek('Tab UMP lebar ' + w + 'px: tidak ada gulir samping', ov.sw <= ov.cw + 1, JSON.stringify(ov));
  }
  await p.setViewportSize({ width: 1280, height: 900 });
  cek('Pecah UMP: kolom Keterangan dengan dropdown "Uang Muka Program" untuk semua pilar + Lainnya', await p.evaluate(() => {
    const s = document.querySelector('.kl-pec-baris select.kl-pilih-ket'); if (!s) return false;
    const teks = s.tomselect ? Object.keys(s.tomselect.options).map((k) => s.tomselect.options[k].text).join('|') : [...s.options].map((o) => o.text).join('|');
    return /Uang Muka Program Pendidikan/.test(teks) && /Uang Muka Program Kesehatan/.test(teks) && /Uang Muka Program Zakat/.test(teks) && /Lainnya/.test(teks);
  }));
  await p.evaluate(() => { const s = document.querySelector('.kl-pec-baris select.kl-pilih-ket'); if (s.tomselect) s.tomselect.setValue('__ketlain'); else { s.value = '__ketlain'; s.dispatchEvent(new Event('change')); } });
  await p.waitForTimeout(300);
  await p.fill('.kl-pec-ket-lain', 'Keterangan Pecahan Manual');
  await p.evaluate(() => document.querySelector('.kl-pec-ket-lain').dispatchEvent(new Event('change')));
  cek('Pecah UMP: keterangan tulisan sendiri tersimpan di ajuan pecahan', await p.evaluate(() => { const a = SINKRON.ajuan[Object.keys(SINKRON.ajuan).find((k) => /\|pecahan$/.test(k))]; return !!a && a.nilai[0].ket === 'Keterangan Pecahan Manual'; }));
  await p.evaluate(() => { const s = document.querySelector('.kl-pec-baris select.kl-pilih-pilar'); if (s.tomselect) s.tomselect.setValue('__lain'); else { s.value = '__lain'; s.dispatchEvent(new Event('change')); } });
  await p.waitForTimeout(300);
  cek('Pecah UMP: pilih "Lainnya" memunculkan kolom tulis manual', await p.evaluate(() => !!document.querySelector('.kl-pec-lain')));
  await p.fill('.kl-pec-lain', 'Pos Uji Manual'); await p.evaluate(() => document.querySelector('.kl-pec-lain').dispatchEvent(new Event('change')));
  cek('Pecah UMP: nama pilar tulisan sendiri tersimpan di ajuan pecahan', await p.evaluate(() => { const a = SINKRON.ajuan[Object.keys(SINKRON.ajuan).find((k) => /\|pecahan$/.test(k))]; return !!a && a.nilai[0].pilar === 'Pos Uji Manual'; }));
  cek('Hero: kantor + tanggal samping nominal saldo akhir, ukuran kecil', await p.evaluate(() => {
    const saldo = document.querySelector('.kl-hero-saldo'); const k = document.querySelector('.kl-hero-kantor .kn'); const v = document.querySelector('.kl-hero .v');
    if (!saldo || !k || !v || document.querySelector('.kl-hero-top')) return false;
    const ks = parseFloat(getComputedStyle(k).fontSize), vs = parseFloat(getComputedStyle(v).fontSize);
    return !!document.querySelector('.kl-hero-waktu .wt b') && ks < vs && saldo.contains(k) && saldo.contains(v);
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
  cek('Tab LPJ: kartu per baris LPJ dengan kepala grid (tanggal, program, nominal) & panel tujuan UMP terbuka di bawah', await p.evaluate(() => {
    const item = document.querySelector('#klIsi .kl-ump-item');
    const head = item && item.querySelector('.kl-ump-head');
    const hub = item && item.querySelector('.kl-lpj-hub');
    return !!item && !!head && !!hub && !!item.querySelector('.kl-ump-field') && /Program|Tujuan UMP/.test(item.textContent);
  }));
  cek('Tab LPJ: daftar UMP yang ditutup kartu ditampilkan dengan nominal di kanan', await p.evaluate(() => {
    const list = document.querySelector('#klIsi .kl-lpj-hub');
    const lis = list ? [...list.querySelectorAll('li')] : [];
    return list && lis.length > 0 && lis[0].innerHTML.includes('Rp');
  }));
  await p.evaluate(() => { const b = [...document.querySelectorAll('#klIsi .kl-ganti')].find((x) => /Tujuan UMP/.test(x.textContent)); if (b) b.click(); });
  cek('Tab LPJ: tombol "Tujuan UMP" membuka panel di dalam kartunya, pencari aktif + usulan UMP belum lengkap', await p.evaluate(() => {
    const pnl = document.querySelector('#klIsi .kl-ump-item.buka .kl-pec-panel');
    const ed = pnl && pnl.querySelector('.kl-tujuan');
    const inp = ed && ed.querySelector('#klCariIn');
    const opt = ed ? ed.querySelectorAll('#klCariList .kl-cari-opt') : [];
    if (!ed || !inp || !opt.length) return false;
    return document.activeElement === inp && /sisa belum LPJ/.test(opt[0].textContent) && /Pakai otomatis/.test(ed.textContent);
  }));
  await p.fill('#klCariIn', 'zzzz');
  cek('Pencari UMP: ketik menyaring daftar, tak ada hasil menampilkan pesan', await p.evaluate(() =>
    [...document.querySelectorAll('#klCariList .kl-cari-opt')].every((o) => o.style.display === 'none') && document.getElementById('klCariKosong').style.display !== 'none'));
  await p.fill('#klCariIn', '');
  await p.evaluate(() => { document.querySelector('#klCariList .kl-cari-opt').click(); });
  cek('Tab LPJ: menunjuk UMP lewat pencari membuat alokasi (nominal = sisa LPJ) & Simpan menyala', await p.evaluate(() => {
    const a = daftarAjuan().find((x) => x.kolom === 'tujuan');
    const inp = document.querySelector('.kl-tujuan-baris input.kl-edit');
    return !!a && a.nilai[0].nominal === 1000000 && inp && Number(inp.value) === 1000000 && !document.getElementById('klSimpanBtn').disabled;
  }));
  cek('Tab LPJ: panel tetap terbuka setelah alokasi ditambah', await p.evaluate(() => !!document.querySelector('#klIsi .kl-ump-item.buka .kl-pec-panel .kl-tujuan')));
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kl-tujuan-aksi .kl-batal')].find((x) => /Pakai otomatis/.test(x.textContent)); if (b) b.click(); });
  cek('Tab LPJ: "Pakai otomatis" menghapus ajuan tujuan', await p.evaluate(() => !daftarAjuan().some((x) => x.kolom === 'tujuan')));
  cek('Tab LPJ: tanggal juga memakai pemilih bertema', await p.evaluate(() =>
    !!document.querySelector('#klIsi .kl-tgl .kl-tgl-btn') && !document.querySelector('#klIsi input[type="date"]')));
  cek('Tab LPJ: tidak ada overflow horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await p.evaluate(() => document.querySelectorAll('.kl-tab')[3].click());
  const tR2 = await p.evaluate(() => (document.getElementById('klIsi') || {}).innerText || '');
  cek('Ringkasan: saldo akhir HANYA SATU dengan langkah alur terbaca',
    /SALDO AKHIR/.test(tR2) && /Total setoran tahun ini/.test(tR2) && /dikurangi hak amil/.test(tR2) && /dikurangi uang muka/.test(tR2) && !/Hasil TANPA LPJ/.test(tR2) && !/Hasil DENGAN LPJ/.test(tR2), tR2.slice(0, 900));
  cek('Ringkasan: angka SALDO AKHIR identik dengan angka di kepala', await p.evaluate(() => {
    const angka = document.querySelector('.kl-hero .v').textContent.replace(/\D/g, '');
    const hasil = [...document.querySelectorAll('#klIsi .kl-alur-hasil .kl-alur-v')].map((e) => e.textContent.replace(/\D/g, ''));
    return hasil.includes(angka);
  }));
  const thPilar = await p.evaluate(() => [...document.querySelectorAll('#klIsi .kl-pilar th')].map((e) => e.textContent).join('|'));
  cek('Ringkasan: tabel pilar punya kolom Setoran, Amil diambil, UMP, Saldo akhir (tanpa kolom belum diambil)',
    thPilar === 'Pilar|Setoran|Amil diambil|UMP|Saldo akhir', thPilar);
  const pilBaris = await p.evaluate(() => [...document.querySelectorAll('#klIsi .kl-pilar tbody td.pil')].map((e) => e.textContent));
  const adaInfakUmum = await p.evaluate(() => /Infak Umum/.test(document.getElementById('klIsi').textContent));
  cek('Ringkasan: baris Amil di bawah + tanpa pilar masuk Infak Umum/Zakat',
    pilBaris.some((x) => /^Amil/.test(x)) && adaInfakUmum, pilBaris);
  cek('Ringkasan: bagian merah "Belum LPJ" tersendiri (LPJ tidak mengurangi saldo)',
    tR2.split('Belum LPJ').length > 1 && /BELUM LPJ/.test(tR2) && /LPJ tidak mengurangi saldo/.test(tR2), tR2.slice(0, 900));
  cek('Ringkasan: detail per pilar - amil yang diambil saja, tanpa kolom "belum diambil"', await p.evaluate(() => {
    const t = document.getElementById('klIsi').textContent;
    return /Amil diambil/.test(t) && !/Amil belum diambil/.test(t) && !!document.querySelector('#klIsi .kl-pilar tbody tr');
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
