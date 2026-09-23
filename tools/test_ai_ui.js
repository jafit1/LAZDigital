/* Uji tampilan modul AI Asisten: apakah halamannya digambar utuh, jawaban
   benar-benar MENGALIR di layar, penyaji Markdown aman terhadap jawaban model
   yang menyisipkan HTML, kunci API tidak pernah sampai ke DOM, dan tata
   letaknya rapi di layar HP.

   Datanya dipalsukan — server tiruan menjawab /api/ai dan /api/ai-stream apa
   adanya, jadi semua halaman bisa digambar tanpa Redis, tanpa login, dan tanpa
   provider AI sungguhan.

   jalankan:  node tools/test_ai_ui.js
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
function muatPlaywright() {
  for (const j of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(j); } catch (_) {}
  }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const LUAR = path.join(AKAR, 'potret');

/* Jawaban model yang sengaja NAKAL: ada HTML mentah, ada percobaan menjalankan
   skrip, dan ada markdown normal. Di layar, semuanya harus terbaca sebagai
   TEKS — tidak satu pun boleh jadi elemen sungguhan. Ini bukan uji teoretis:
   isi percakapan di modul ini dibuka oleh seluruh tim. */
const JAHAT = '<img src=x onerror="window.__kena=1"> lalu <script>window.__kena2=1</script>';
const JAWAB_MD = [
  'Ringkasnya **tiga hal**:\n\n',
  '- Penghimpunan naik\n',
  '- Pentasyarufan stabil\n',
  '- Sisa dana aman\n\n',
  '## Rincian\n',
  'Gunakan `laporan bulanan` untuk melihat angkanya.\n\n',
  '```js\nconst total = 750000;\n```\n\n',
  'Catatan keamanan: ' + JAHAT + '\n',
];
const JAWAB_UTUH = JAWAB_MD.join('');

const SESI_ISI = {
  id: 's1', judul: 'Ringkas penghimpunan bulan ini', olehNama: 'Ahmad Maruf',
  penyediaId: 'pv1', personaId: '',
  dibuat: new Date().toISOString(), diubah: new Date().toISOString(),
  pesan: [
    { id: 'm1', peran: 'user', isi: 'Ringkas penghimpunan bulan ini', olehNama: 'Ahmad Maruf', waktu: new Date().toISOString() },
    { id: 'm2', peran: 'assistant', isi: JAWAB_UTUH, model: 'model-uji', penyedia: 'Tiruan', terpotong: false, waktu: new Date().toISOString() },
  ],
};

const JAWABAN = {
  'ai.status': {
    pengguna: { id: 'u1', nama: 'Ahmad Maruf', peran: 'pengelola' },
    izin: ['ai.chat', 'sesi.lihat', 'sesi.kirim', 'sesi.ubah', 'sesi.hapus',
      'pengetahuan.lihat', 'pengetahuan.ubah', 'prompt.lihat', 'prompt.ubah', 'pakai.lihat'],
    superadmin: true,
    penyediaAktif: { id: 'pv1', nama: 'Tiruan', model: 'model-uji', bentuk: 'openai' },
    adaPenyedia: true,
    persona: [{ id: 'pr1', judul: 'Penulis Surat', jenis: 'prompt', ikon: '\u{1F4DD}', isi: 'Tulis surat resmi.' }],
    pengetahuan: { jumlah: 2, terpotong: false },
    upstash: true,
  },
  'sesi.daftar': {
    baris: [
      { id: 's1', judul: 'Ringkas penghimpunan bulan ini', olehNama: 'Ahmad Maruf', dibuat: '', diubah: new Date().toISOString(), jumlahPesan: 2, cuplikan: 'Ringkasnya tiga hal…', model: 'model-uji' },
      { id: 's2', judul: 'Draf pesan untuk muzaki', olehNama: 'Sherli', dibuat: '', diubah: new Date(Date.now() - 7200e3).toISOString(), jumlahPesan: 6, cuplikan: 'Assalamualaikum Bapak/Ibu…', model: 'model-uji' },
    ],
  },
  'sesi.buka': { sesi: SESI_ISI },
  'sesi.ubah': { sesi: SESI_ISI },
  'sesi.hapus': { pesan: 'Percakapan dihapus.' },
  'pengetahuan.daftar': {
    baris: [
      { id: 't1', judul: 'Jam kantor', isi: 'Senin-Jumat 08.00-15.00 WIB.', aktif: true, urutan: 10, olehNama: 'Ahmad', diubah: new Date().toISOString() },
      { id: 't2', judul: 'Rekening resmi', isi: 'BSI 1234567890 a.n. Lazismu Bantul.', aktif: false, urutan: 20, olehNama: 'Ahmad', diubah: new Date().toISOString() },
    ],
    gabungan: { panjang: 480, terpotong: false },
  },
  'prompt.daftar': {
    baris: [{ id: 'pr1', judul: 'Penulis Surat', isi: 'Tulis surat resmi.', ikon: '\u{1F4DD}', aktif: true, urutan: 10, olehNama: 'Ahmad', diubah: new Date().toISOString() }],
  },
  'penyedia.daftar': {
    /* Yang dikirim server memang SUDAH disamarkan — kalau suatu saat kunci
       aslinya ikut terkirim, uji "kunci tidak ada di DOM" di bawah harus
       gagal, jadi di sini sengaja ditaruh juga kunci palsu yang utuh untuk
       memastikan tampilan tidak menampilkan medan tak terduga. */
    baris: [
      { id: 'pv1', nama: 'Tiruan', bentuk: 'openai', url: 'https://contoh.test/v1', model: 'model-uji', suhu: 0.4, maksToken: 2048, catatan: 'utama', kunciTerpasang: true, kunciEkor: '9931' },
      { id: 'pv2', nama: 'Cadangan', bentuk: 'anthropic', url: 'https://api.anthropic.com', model: 'claude-uji', suhu: 0.3, maksToken: 1024, catatan: '', kunciTerpasang: false, kunciEkor: '' },
    ],
    aktif: 'pv1',
    bentuk: {
      openai: { label: 'OpenAI-compatible', keterangan: 'Apa pun yang meniru /chat/completions.', contohUrl: 'https://api.openai.com/v1', contohModel: 'gpt-4o-mini' },
      anthropic: { label: 'Anthropic (Claude)', keterangan: 'API resmi Anthropic.', contohUrl: 'https://api.anthropic.com', contohModel: 'claude-sonnet-4' },
      gemini: { label: 'Google Gemini', keterangan: 'Google AI Studio.', contohUrl: 'https://generativelanguage.googleapis.com', contohModel: 'gemini-2.0-flash' },
    },
  },
  'data.ringkas': {
    kosong: false, galat: '', bulanTerakhir: '2026-08',
    teks: 'DATA RINGKAS LAZISMU (angka saja, tanpa data pribadi donatur):\nTotal penghimpunan: Rp 750.000 dari 2 transaksi.',
  },
  'pakai.ringkas': {
    bulan: '2026-09', daftarBulan: ['2026-09', '2026-08'],
    ringkas: { panggilan: 12, masuk: 14400, keluar: 2100 },
    perModel: [{ nama: 'Tiruan · model-uji', panggilan: 12, masuk: 14400, keluar: 2100, total: 16500 }],
    perPengguna: [{ nama: 'Ahmad Maruf', panggilan: 9, masuk: 11000, keluar: 1600, total: 12600 }],
  },
};

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/ai') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let t = '';
      try { t = JSON.parse(body).tindakan; } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...(JAWABAN[t] || {}) }));
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/ai-stream') {
    for await (const _ of req) { /* buang badan */ }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    const kirim = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    kirim({
      t: 'mulai', sesiId: 's1', judul: 'Ringkas penghimpunan bulan ini',
      pesanTanya: { id: 'm1', peran: 'user', isi: 'x', waktu: new Date().toISOString() },
      penyedia: { nama: 'Tiruan', model: 'model-uji', bentuk: 'openai' },
      otak: { persona: '', pengetahuan: 2, data: true },
    });
    /* Pelan dengan sengaja: yang diuji justru bahwa layar terisi BERTAHAP,
       dan itu hanya terlihat kalau tokennya tidak datang sekaligus. */
    for (const potong of JAWAB_MD) {
      await new Promise((s) => setTimeout(s, 90));
      if (res.destroyed) return;
      kirim({ t: 'token', v: potong });
    }
    kirim({ t: 'selesai', sesiId: 's1', pesanJawab: SESI_ISI.pesan[1], token: { masuk: 120, keluar: 40 }, ms: 900 });
    return res.end();
  }
  const nama = req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(LUAR, { recursive: true });
  const b = await chromium.launch(CHROMIUM);

  let ok = 0, g = 0;
  const galat = [];
  const cek = (n, s, info) => { if (s) { ok++; console.log('  OK   |', n); } else { g++; console.log('  GAGAL|', n, info === undefined ? '' : JSON.stringify(info).slice(0, 220)); } };

  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => galat.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
  await p.goto(A + '/ai.html');
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
  await p.waitForTimeout(400);

  console.log('=== A. RANGKA & MENU ===');
  const menu = await p.$$eval('.tn-item', (n) => n.map((x) => x.title));
  cek('tujuh menu tergambar untuk superadmin', menu.length === 7, menu);
  cek('menu inti ada',
    ['Percakapan', 'Riwayat Bersama', 'Pengetahuan', 'Persona', 'Data yang Diketahui', 'Penggunaan', 'Provider AI'].every((m) => menu.includes(m)), menu);
  const lenc = await p.$eval('#lencanaLingkup', (e) => ({ teks: e.textContent, judul: e.title }));
  cek('lencana menyebut model aktif', /model-uji/.test(lenc.teks), lenc);
  cek('nama provider ada di title', /Tiruan/.test(lenc.judul), lenc.judul);

  console.log('\n=== B. LAYAR SAMBUTAN & RAIL ===');
  const awal = await p.evaluate(() => ({
    sambut: !!document.querySelector('.ai-sambut'),
    contoh: document.querySelectorAll('.ai-contoh-item').length,
    railItem: document.querySelectorAll('.ai-rail-item').length,
    persona: !!document.querySelector('#aiPersona'),
    komposer: !!document.querySelector('#aiIsian'),
    // Halaman percakapan memakai seluruh tinggi layar, bukan tata letak biasa.
    penuh: document.getElementById('appView').classList.contains('ai-penuh'),
    gulirHalaman: document.documentElement.scrollHeight <= window.innerHeight + 2,
  }));
  cek('layar sambutan tampil saat belum ada percakapan', awal.sambut);
  cek('empat contoh pertanyaan', awal.contoh === 4, awal.contoh);
  cek('daftar percakapan bersama terisi', awal.railItem === 2, awal.railItem);
  cek('pemilih peran/persona ada', awal.persona);
  cek('halaman percakapan memakai tinggi penuh', awal.penuh && awal.gulirHalaman, awal);

  await p.click('.ai-contoh-item');
  await p.waitForTimeout(150);
  cek('contoh pertanyaan mengisi kotak isian',
    (await p.$eval('#aiIsian', (e) => e.value)).length > 20);
  await p.fill('#aiIsian', '');

  console.log('\n=== C. JAWABAN MENGALIR ===');
  const awalStop = await p.$eval('#aiStop', (e) => getComputedStyle(e).display);
  await p.fill('#aiIsian', 'Ringkas penghimpunan bulan ini');
  await p.click('#aiKirim');
  await p.waitForTimeout(220);

  const tengah1 = await p.evaluate(() => ({
    gelembungOrang: document.querySelectorAll('.ai-pesan.dari-orang').length,
    denyutAtauIsi: !!document.querySelector('#aiIsiAlir'),
    kirimMati: document.getElementById('aiKirim').disabled,
    /* Diukur dari gaya yang BENAR-BENAR berlaku, bukan dari properti .hidden:
       .btn menyetel display:inline-flex dan pernah mengalahkan [hidden], jadi
       tombolnya tetap tergambar walau propertinya sudah true. */
    stopTampil: getComputedStyle(document.getElementById('aiStop')).display !== 'none',
    panjang: (document.querySelector('#aiIsiAlir') || {}).textContent ? document.querySelector('#aiIsiAlir').textContent.length : 0,
  }));
  cek('pertanyaan langsung tampil tanpa menunggu server', tengah1.gelembungOrang === 1, tengah1);
  cek('tombol Hentikan tersembunyi sebelum ada yang dikirim', awalStop === 'none', awalStop);
  cek('tombol kirim dikunci selama menjawab', tengah1.kirimMati);
  cek('tombol Hentikan muncul selama menjawab', tengah1.stopTampil);

  await p.waitForTimeout(320);
  const tengah2 = await p.evaluate(() => ({
    panjang: (document.querySelector('#aiIsiAlir') || { textContent: '' }).textContent.length,
    kursor: !!document.querySelector('.ai-kursor'),
  }));
  cek('teks bertambah selama menunggu (benar-benar mengalir)',
    tengah2.panjang > tengah1.panjang, { awal: tengah1.panjang, lalu: tengah2.panjang });
  cek('ada tanda sedang mengetik', tengah2.kursor);
  await p.screenshot({ path: path.join(LUAR, 'ai-mengalir.png') });

  await p.waitForFunction(() => !document.getElementById('aiKirim').disabled, { timeout: 15000 });
  await p.waitForTimeout(300);

  console.log('\n=== D. PENYAJIAN JAWABAN ===');
  const hasil = await p.evaluate(() => {
    const isi = document.querySelector('.ai-pesan.dari-ai .ai-isi');
    return {
      ada: !!isi,
      tebal: isi.querySelectorAll('strong').length,
      daftar: isi.querySelectorAll('ul li').length,
      judul: isi.querySelectorAll('h4,h5,h6').length,
      kodeInline: isi.querySelectorAll('code').length,
      blokKode: isi.querySelectorAll('.ai-kode pre code').length,
      tombolSalin: isi.querySelectorAll('.ai-salin').length,
      kursorSisa: document.querySelectorAll('.ai-kursor').length,
      stopTampil: getComputedStyle(document.getElementById('aiStop')).display !== 'none',
      aksi: document.querySelectorAll('.ai-pesan.dari-ai .ai-pesan-aksi .ai-aksi-kecil').length,
      judulKepala: document.getElementById('aiJudul').textContent,
    };
  });
  cek('jawaban tergambar', hasil.ada);
  cek('**tebal** jadi huruf tebal', hasil.tebal >= 1, hasil.tebal);
  cek('daftar bertitik jadi <li>', hasil.daftar === 3, hasil.daftar);
  cek('judul markdown jadi heading', hasil.judul === 1, hasil.judul);
  cek('blok kode punya tombol Salin', hasil.blokKode === 1 && hasil.tombolSalin === 1, hasil);
  cek('tanda mengetik hilang setelah selesai', hasil.kursorSisa === 0, hasil.kursorSisa);
  cek('tombol Hentikan kembali tersembunyi setelah selesai', hasil.stopTampil === false, hasil.stopTampil);
  cek('tombol Salin & Minta ulang tersedia', hasil.aksi === 2, hasil.aksi);
  cek('judul percakapan ikut berubah', /Ringkas penghimpunan/.test(hasil.judulKepala), hasil.judulKepala);

  console.log('\n=== E. JAWABAN MODEL TIDAK BOLEH JADI HTML ===');
  const aman = await p.evaluate(() => {
    const isi = document.querySelector('.ai-pesan.dari-ai .ai-isi');
    return {
      kena: !!window.__kena, kena2: !!window.__kena2,
      img: isi.querySelectorAll('img').length,
      skrip: isi.querySelectorAll('script').length,
      /* Tetap TERBACA sebagai teks — menyensornya diam-diam juga salah, karena
         pengguna tidak akan tahu model menjawab apa. */
      terbaca: isi.textContent.includes('<img src=x') && isi.textContent.includes('<script>'),
    };
  });
  cek('skrip dari jawaban model TIDAK berjalan', !aman.kena && !aman.kena2, aman);
  cek('tidak ada elemen <img> yang lahir dari jawaban', aman.img === 0, aman.img);
  cek('tidak ada elemen <script> yang lahir dari jawaban', aman.skrip === 0, aman.skrip);
  cek('HTML-nya tetap terbaca sebagai teks biasa', aman.terbaca, aman);
  await p.screenshot({ path: path.join(LUAR, 'ai-chat.png') });

  console.log('\n=== F. HALAMAN TURUNAN ===');
  const bukaHal = async (hash, penanda) => {
    await p.evaluate((h) => { location.hash = h; }, hash);
    await p.waitForSelector(penanda, { timeout: 8000 });
    await p.waitForTimeout(250);
  };

  await bukaHal('#riwayat', '#rwIsi table');
  const rw = await p.evaluate(() => ({
    baris: document.querySelectorAll('#rwIsi tbody tr').length,
    tandai: document.querySelectorAll('#rwIsi .tandai').length,
    buka: document.querySelectorAll('[data-buka]').length,
  }));
  cek('riwayat bersama menampilkan semua percakapan', rw.baris === 2, rw);
  cek('penandaan untuk hapus banyak tersedia', rw.tandai === 2 && rw.buka === 2, rw);

  await bukaHal('#tahu', '.ai-kartu');
  const th = await p.evaluate(() => ({
    kartu: document.querySelectorAll('.ai-kartu').length,
    mati: document.querySelectorAll('.ai-kartu.mati').length,
    info: (document.querySelector('.ai-info') || {}).textContent || '',
  }));
  cek('pengetahuan tergambar sebagai kartu', th.kartu === 2, th);
  cek('catatan nonaktif ditandai berbeda', th.mati === 1, th.mati);
  cek('panjang gabungan dilaporkan', /480/.test(th.info), th.info);

  await bukaHal('#persona', '.ai-kartu');
  cek('persona tergambar', (await p.$$('.ai-kartu')).length === 1);

  await bukaHal('#data', '.ai-pra');
  const dt = await p.$eval('.ai-pra', (e) => e.textContent);
  cek('blok data ditampilkan apa adanya', /DATA RINGKAS LAZISMU/.test(dt), dt.slice(0, 60));

  await bukaHal('#pakai', '.fund-kpi .kpi-v2');
  const pk = await p.evaluate(() => ({
    kpi: document.querySelectorAll('.fund-kpi .kpi-v2').length,
    tabel: document.querySelectorAll('table').length,
    total: document.body.textContent.includes('16.500'),
  }));
  cek('empat kartu penggunaan', pk.kpi === 4, pk);
  cek('tabel per model & per pengguna', pk.tabel === 2, pk.tabel);
  cek('total token dijumlahkan', pk.total, pk);

  console.log('\n=== G. PROVIDER: KUNCI TIDAK BOLEH ADA DI HALAMAN ===');
  await bukaHal('#penyedia', '.ai-kartu');
  const pv = await p.evaluate(() => ({
    kartu: document.querySelectorAll('.ai-kartu').length,
    aktifDitandai: document.querySelectorAll('.ai-kartu.pilih').length,
    ekor: document.body.textContent.includes('…9931'),
    belumIsi: document.body.textContent.includes('belum diisi'),
    html: document.body.innerHTML,
  }));
  cek('dua provider tergambar', pv.kartu === 2, pv.kartu);
  cek('yang aktif ditandai', pv.aktifDitandai === 1, pv.aktifDitandai);
  cek('hanya empat huruf terakhir kunci yang tampil', pv.ekor, pv.ekor);
  cek('provider tanpa kunci diberi peringatan', pv.belumIsi);
  cek('tidak ada kunci utuh di DOM', !/sk-[A-Za-z0-9_-]{8,}/.test(pv.html));

  await p.click('[data-ubah]');
  await p.waitForTimeout(300);
  const form = await p.evaluate(() => {
    const k = document.getElementById('pvKunci');
    return { tipe: k && k.type, kosong: k && k.value === '', ket: (document.getElementById('pvKet') || {}).textContent || '' };
  });
  cek('kotak kunci bertipe password', form.tipe === 'password', form);
  /* Kotak kunci SENGAJA kosong saat menyunting: kalau diisi nilai palsu, orang
     akan mengira kuncinya terbaca dari server. */
  cek('kotak kunci dibiarkan kosong saat menyunting', form.kosong, form);
  cek('keterangan bentuk API ikut dijelaskan', form.ket.length > 10, form.ket);
  await p.screenshot({ path: path.join(LUAR, 'ai-provider.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  console.log('\n=== H. LAYAR HP ===');
  const ctxHp = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p2 = await ctxHp.newPage();
  p2.on('pageerror', (e) => galat.push('HP: ' + String(e)));
  await p2.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {} });
  await p2.goto(A + '/ai.html');
  await p2.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
  await p2.waitForTimeout(500);

  const hp = await p2.evaluate(() => {
    const rail = document.querySelector('.ai-rail');
    const komposer = document.querySelector('.ai-komposer');
    const kk = komposer.getBoundingClientRect();
    return {
      terang: document.documentElement.getAttribute('data-theme'),
      luber: document.documentElement.scrollWidth <= window.innerWidth + 2,
      // Rail harus jadi laci tersembunyi, bukan kolom yang memakan layar.
      railTersembunyi: rail.getBoundingClientRect().right <= 1,
      tombolRail: getComputedStyle(document.getElementById('aiRailTombol')).display !== 'none',
      komposerTerlihat: kk.bottom <= window.innerHeight + 1 && kk.top > 0,
      komposerKeluar: kk.right > window.innerWidth + 1 || kk.left < -1,
      isianTinggi: document.getElementById('aiIsian').getBoundingClientRect().height >= 20,
      contohSatuKolom: new Set(Array.from(document.querySelectorAll('.ai-contoh-item'))
        .map((x) => Math.round(x.getBoundingClientRect().left))).size === 1,
    };
  });
  cek('tema terang seperti web utama', hp.terang === 'light', hp.terang);
  cek('tidak meluber ke samping', hp.luber, hp);
  cek('daftar percakapan jadi laci tersembunyi', hp.railTersembunyi, hp);
  cek('tombol pembuka laci muncul di HP', hp.tombolRail, hp);
  cek('kotak isian terlihat tanpa menggulir', hp.komposerTerlihat && !hp.komposerKeluar, hp);
  cek('contoh pertanyaan jadi satu kolom', hp.contohSatuKolom, hp);
  await p2.screenshot({ path: path.join(LUAR, 'ai-hp.png') });

  await p2.click('#aiRailTombol');
  await p2.waitForTimeout(400);
  const laci = await p2.evaluate(() => {
    const r = document.querySelector('.ai-rail').getBoundingClientRect();
    const t = document.querySelector('.ai-rail-tirai');
    return { kiri: Math.round(r.left), lebar: Math.round(r.width), tirai: getComputedStyle(t).opacity };
  });
  cek('laci terbuka menutupi, bukan menggeser isi', laci.kiri === 0 && laci.lebar > 200, laci);
  cek('tirai gelap ikut muncul', Number(laci.tirai) > 0.5, laci.tirai);
  await p2.screenshot({ path: path.join(LUAR, 'ai-hp-laci.png') });

  /* Tombol Salin / Minta ulang bergantung pada :hover di layar lebar. Di HP
     tidak ada hover, jadi keduanya harus selalu terlihat — kalau tidak, di HP
     keduanya tidak akan pernah bisa ditemukan. */
  await p2.evaluate(() => { document.querySelector('.ai-rail-tirai').click(); });
  await p2.waitForTimeout(300);
  await p2.evaluate(() => { location.hash = '#chat'; });
  await p2.waitForTimeout(300);
  await p2.fill('#aiIsian', 'Halo');
  await p2.click('#aiKirim');
  await p2.waitForFunction(() => !document.getElementById('aiKirim').disabled, { timeout: 15000 });
  await p2.waitForTimeout(400);
  const aksiHp = await p2.evaluate(() => {
    const a = document.querySelector('.ai-pesan.dari-ai .ai-pesan-aksi');
    const isi = document.querySelector('.ai-pesan.dari-ai .ai-isi');
    const kode = document.querySelector('.ai-kode pre');
    return {
      opasitas: a ? getComputedStyle(a).opacity : '0',
      isiKeluar: isi ? isi.getBoundingClientRect().right > window.innerWidth + 1 : true,
      /* Blok kode panjang harus menggulir DI DALAM kotaknya, bukan melebarkan
         seluruh halaman. */
      kodeMenggulirSendiri: kode ? getComputedStyle(kode).overflowX === 'auto' : false,
      luber: document.documentElement.scrollWidth <= window.innerWidth + 2,
    };
  });
  cek('tombol aksi jawaban selalu terlihat di HP', Number(aksiHp.opasitas) === 1, aksiHp);
  cek('jawaban tidak terdorong keluar layar', !aksiHp.isiKeluar, aksiHp);
  cek('blok kode menggulir di dalam kotaknya', aksiHp.kodeMenggulirSendiri, aksiHp);
  cek('halaman tetap tidak meluber setelah ada jawaban', aksiHp.luber, aksiHp);
  await p2.screenshot({ path: path.join(LUAR, 'ai-hp-jawaban.png'), fullPage: false });
  await ctxHp.close();

  console.log('\n=== I. TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript sepanjang uji', galat.length === 0, galat.slice(0, 4));

  await b.close();
  server.close();
  console.log('\ntest_ai_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
