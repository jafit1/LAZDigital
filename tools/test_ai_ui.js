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
    {
      id: 'm3', peran: 'user', isi: 'Ini berkasnya', olehNama: 'Sherli', waktu: new Date().toISOString(),
      lampiran: [
        { id: 'lp1', nama: 'kwitansi.jpg', mime: 'image/jpeg', jenis: 'gambar', ukuran: 51200, adaBerkas: true, kedaluwarsa: '' },
        { id: 'lp2', nama: 'rekap.xlsx', mime: 'application/vnd.ms-excel', jenis: 'teks', ukuran: 9000, panjangTeks: 1234, halaman: 0, terpotong: false, adaBerkas: false },
        { id: 'lp3', nama: 'lama.png', mime: 'image/png', jenis: 'gambar', ukuran: 4000, adaBerkas: false, kedaluwarsa: '' },
      ],
    },
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
    model: [
      { penyediaId: 'pv1', penyediaNama: 'Tiruan', bentuk: 'openai', model: 'model-uji', utama: true, dukungGambar: true, siap: true, baku: true },
      { penyediaId: 'pv1', penyediaNama: 'Tiruan', bentuk: 'openai', model: 'model-cepat', utama: false, dukungGambar: true, siap: true, baku: false },
      { penyediaId: 'pv2', penyediaNama: 'Cadangan', bentuk: 'anthropic', model: 'claude-uji', utama: true, dukungGambar: false, siap: false, baku: false },
    ],
    lampiran: { simpanHari: 30, maksPerPesan: 4, gambarBoleh: ['image/jpeg', 'image/png'] },
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
  'lampiran.ambil': { ada: true, mime: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' },
  'penyedia.daftar': {
    /* Yang dikirim server memang SUDAH disamarkan — kalau suatu saat kunci
       aslinya ikut terkirim, uji "kunci tidak ada di DOM" di bawah harus
       gagal, jadi di sini sengaja ditaruh juga kunci palsu yang utuh untuk
       memastikan tampilan tidak menampilkan medan tak terduga. */
    baris: [
      { id: 'pv1', nama: 'Tiruan', bentuk: 'openai', url: 'https://contoh.test/v1', model: 'model-uji', modelLain: ['model-cepat'], dukungGambar: true, suhu: 0.4, maksToken: 2048, catatan: 'utama', kunciTerpasang: true, kunciEkor: '9931' },
      { id: 'pv2', nama: 'Cadangan', bentuk: 'anthropic', url: 'https://api.anthropic.com', model: 'claude-uji', modelLain: [], dukungGambar: false, suhu: 0.3, maksToken: 1024, catatan: '', kunciTerpasang: false, kunciEkor: '' },
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
/* Satu alamat untuk semuanya, persis seperti di produksi: /api/ai membalas
   JSON untuk tindakan biasa dan SSE untuk "chat.alir". Kalau tampilan suatu
   saat kembali memanggil alamat kedua, permintaannya akan jatuh ke penyaji
   berkas statis dan uji bagian C gagal — itu memang yang diinginkan, karena
   alamat kedua membuat deploy Vercel gagal seluruhnya. */
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/ai') {
    let body = '';
    for await (const c of req) body += c;
    let t = '';
    let badan = {};
    try { badan = JSON.parse(body); t = badan.tindakan; } catch (_) {}
    if (t === 'chat.alir') server.badanTerakhir = badan;
    if (t !== 'chat.alir') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, ...(JAWABAN[t] || {}) }));
    }
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
  /* Nama model TIDAK boleh lagi ada di bilah kiri — di situ ia terpotong saat
     bilahnya lebar dan hilang saat dikuncupkan. */
  const lencTampil = await p.$eval('#lencanaLingkup', (e) => getComputedStyle(e).display !== 'none' && e.textContent.trim());
  cek('bilah kiri tidak lagi menampilkan nama model', !lencTampil, lencTampil);

  console.log('\n=== B. LAYAR SAMBUTAN & RAIL ===');
  const awal = await p.evaluate(() => ({
    sambut: !!document.querySelector('.ai-sambut'),
    contoh: document.querySelectorAll('.ai-contoh-item').length,
    railItem: document.querySelectorAll('.ai-rail-item').length,
    chipModel: (document.querySelector('#aiModelNama') || {}).textContent,
    tombolLampir: !!document.querySelector('#aiLampirTombol'),
    komposer: !!document.querySelector('#aiIsian'),
    // Halaman percakapan memakai seluruh tinggi layar, bukan tata letak biasa.
    penuh: document.getElementById('appView').classList.contains('ai-penuh'),
    gulirHalaman: document.documentElement.scrollHeight <= window.innerHeight + 2,
  }));
  cek('layar sambutan tampil saat belum ada percakapan', awal.sambut);
  cek('empat contoh pertanyaan', awal.contoh === 4, awal.contoh);
  cek('daftar percakapan bersama terisi', awal.railItem === 2, awal.railItem);
  cek('nama model tampil sebagai tombol di kotak chat', awal.chipModel === 'model-uji', awal.chipModel);
  /* Nama model itu penanda, bukan judul: ia tidak boleh setara ukurannya
     dengan teks percakapan (14px), atau ia ikut menarik mata terus-menerus. */
  const ukuranChip = await p.evaluate(() => {
    const c = getComputedStyle(document.getElementById('aiModelTombol'));
    const isi = getComputedStyle(document.querySelector('.ai-komposer textarea'));
    return { chip: parseFloat(c.fontSize), isi: parseFloat(isi.fontSize) };
  });
  cek('nama model lebih kecil daripada teks pertanyaan',
    ukuranChip.chip <= 11.5 && ukuranChip.chip < ukuranChip.isi - 2, ukuranChip);
  cek('tombol lampirkan berkas ada', awal.tombolLampir);
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

  console.log('\n=== H. MENYEMBUNYIKAN DAFTAR PERCAKAPAN ===');
  await bukaHal('#chat', '#aiRailTutup');
  const lebarSebelum = await p.$eval('.ai-utama', (e) => Math.round(e.getBoundingClientRect().width));
  await p.click('#aiRailTutup');
  await p.waitForTimeout(350);
  const tutup = await p.evaluate(() => {
    const rail = document.querySelector('.ai-rail');
    return {
      lebarUtama: Math.round(document.querySelector('.ai-utama').getBoundingClientRect().width),
      railLebar: Math.round(rail.getBoundingClientRect().width),
      /* Tombol pemanggilnya HARUS muncul — ia satu-satunya jalan kembali. */
      tombolKembali: getComputedStyle(document.getElementById('aiRailTombol')).display !== 'none',
      /* .tn-icon dibuat untuk bilah menu kiri dan lebarnya 100%. Kalau ia
         terbawa apa adanya ke kepala percakapan, tombolnya melebar sebaris
         penuh dan judul percakapan terdorong sampai hilang. */
      lebarTombol: Math.round(document.getElementById('aiRailTombol').getBoundingClientRect().width),
      judulTerbaca: document.getElementById('aiJudul').getBoundingClientRect().width > 60,
      /* Isinya tetap ada di pohon dokumen, hanya disembunyikan. */
      isiMasihAda: rail.querySelectorAll('.ai-rail-item').length,
      ingat: localStorage.getItem('ai_rail_tutup'),
      luber: document.documentElement.scrollWidth <= window.innerWidth + 2,
    };
  });
  cek('daftar percakapan benar-benar menyempit jadi nol', tutup.railLebar === 0, tutup.railLebar);
  cek('ruang percakapan jadi lebih lebar', tutup.lebarUtama > lebarSebelum + 200, { sebelum: lebarSebelum, sesudah: tutup.lebarUtama });
  cek('tombol pemanggil daftar muncul di kepala', tutup.tombolKembali, tutup);
  cek('tombol itu kotak kecil, bukan melebar menutupi judul',
    tutup.lebarTombol <= 40 && tutup.judulTerbaca, tutup);
  cek('isi daftarnya tidak dibuang, hanya disembunyikan', tutup.isiMasihAda === 2, tutup.isiMasihAda);
  cek('pilihan menutup diingat', tutup.ingat === 'true', tutup.ingat);
  cek('halaman tidak meluber setelah daftar ditutup', tutup.luber, tutup);
  await p.screenshot({ path: path.join(LUAR, 'ai-rail-tutup.png') });

  /* Pilihan yang diingat harus masih berlaku setelah halaman dimuat ulang —
     itulah bedanya "diingat" dengan "kebetulan masih begitu". */
  await p.reload();
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
  await p.waitForTimeout(500);
  cek('daftar tetap tersembunyi setelah halaman dimuat ulang',
    await p.$eval('.ai-rail', (e) => Math.round(e.getBoundingClientRect().width)) === 0);

  await p.click('#aiRailTombol');
  await p.waitForTimeout(350);
  const buka = await p.evaluate(() => ({
    railLebar: Math.round(document.querySelector('.ai-rail').getBoundingClientRect().width),
    ingat: localStorage.getItem('ai_rail_tutup'),
  }));
  cek('daftar bisa dipanggil kembali', buka.railLebar > 200, buka);
  cek('pilihan membuka juga diingat', buka.ingat === 'false', buka.ingat);

  console.log('\n=== H2. PEMILIH MODEL DI KOTAK CHAT ===');
  await bukaHal('#chat', '#aiModelTombol');
  await p.click('#aiModelTombol');
  await p.waitForTimeout(250);
  const daftarModel = await p.evaluate(() => {
    const m = document.getElementById('aiMenu');
    const r = m.getBoundingClientRect();
    return {
      tampil: !document.getElementById('aiMenuBg').hidden,
      model: Array.from(m.querySelectorAll('[data-model]')).map((x) => x.querySelector('.ai-menu-utama').textContent),
      mati: Array.from(m.querySelectorAll('[data-model]')).filter((x) => x.disabled).length,
      grup: Array.from(m.querySelectorAll('.ai-menu-grup')).map((x) => x.textContent),
      persona: m.querySelectorAll('[data-persona]').length,
      diLayar: r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.left >= 0 && r.right <= window.innerWidth + 1,
    };
  });
  cek('daftar model terbuka', daftarModel.tampil);
  cek('semua model tersedia terdaftar',
    daftarModel.model.join(',') === 'model-uji,model-cepat,claude-uji', daftarModel.model);
  cek('model tanpa kunci API tidak bisa dipilih', daftarModel.mati === 1, daftarModel.mati);
  /* Persis dua kepala kelompok: satu per provider. Kalau "Peran" ikut punya
     kepala kelompok sendiri, judul bagiannya tergambar dua kali berturut-turut. */
  cek('dikelompokkan per provider, tanpa kepala ganda',
    daftarModel.grup.join(',') === 'Tiruan,Cadangan', daftarModel.grup);
  cek('peran ikut di daftar yang sama', daftarModel.persona === 2, daftarModel.persona);
  cek('daftarnya tidak terpotong tepi layar', daftarModel.diLayar, menu);
  await p.screenshot({ path: path.join(LUAR, 'ai-model.png') });

  await p.click('[data-model="model-cepat"]');
  await p.waitForTimeout(250);
  cek('model yang dipilih tampil di tombol',
    (await p.$eval('#aiModelNama', (e) => e.textContent)) === 'model-cepat');
  cek('daftar tertutup setelah memilih', await p.$eval('#aiMenuBg', (e) => e.hidden));

  await p.click('#aiModelTombol');
  await p.waitForTimeout(200);
  await p.click('[data-persona="pr1"]');
  await p.waitForTimeout(200);
  cek('memilih peran menandai tombolnya',
    await p.$eval('#aiModelTombol', (e) => e.classList.contains('ada-peran')));

  console.log('\n=== I. LAMPIRAN BERKAS ===');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ujilampiran-'));
  const berkasTxt = path.join(tmp, 'catatan.txt');
  fs.writeFileSync(berkasTxt, 'Rekap penghimpunan Agustus: Rp 750.000 dari dua transaksi.');
  const berkasCsv = path.join(tmp, 'rekap.csv');
  fs.writeFileSync(berkasCsv, 'tanggal,jumlah\n2026-08-01,500000\n2026-08-11,250000');
  const berkasPng = path.join(tmp, 'kwitansi.png');
  fs.writeFileSync(berkasPng, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJklEQVR42u3OMQEAAAgDoC251a3g'
    + 'LwEoJb1JCgUCgUAgEAgEAsE7CxKCAAGmcLQPAAAAAElFTkSuQmCC', 'base64'));
  const berkasXlsx = path.join(tmp, 'buku.xlsx');
  require('xlsx').writeFile(
    (() => { const w = require('xlsx').utils.book_new();
      require('xlsx').utils.book_append_sheet(w, require('xlsx').utils.aoa_to_sheet(
        [['Nama', 'Jumlah'], ['Zakat', 500000], ['Infak', 250000]]), 'Rekap'); return w; })(),
    berkasXlsx);
  const berkasTolak = path.join(tmp, 'program.exe');
  fs.writeFileSync(berkasTolak, 'MZ');

  await p.setInputFiles('#aiBerkas', [berkasTxt, berkasCsv, berkasPng]);
  await p.waitForFunction(() => {
    const c = document.querySelectorAll('.ai-lampiran .ai-lp-chip');
    return c.length === 3 && !document.querySelector('.ai-lp-chip.memuat');
  }, { timeout: 15000 });
  const chip = await p.evaluate(() => ({
    jumlah: document.querySelectorAll('.ai-lampiran .ai-lp-chip').length,
    thumb: document.querySelectorAll('.ai-lampiran .ai-lp-thumb').length,
    ext: Array.from(document.querySelectorAll('.ai-lampiran .ai-lp-ext')).map((x) => x.textContent),
    ket: Array.from(document.querySelectorAll('.ai-lampiran .ai-lp-ket')).map((x) => x.textContent),
    buang: document.querySelectorAll('.ai-lampiran .ai-lp-x').length,
  }));
  cek('tiga berkas terbaca', chip.jumlah === 3, chip);
  cek('gambar tampil sebagai pratinjau kecil', chip.thumb === 1, chip.thumb);
  cek('berkas teks ditandai jenisnya', chip.ext.includes('TXT') && chip.ext.includes('CSV'), chip.ext);
  cek('jumlah huruf terbaca ditampilkan', chip.ket.some((k) => /huruf/.test(k)), chip.ket);
  cek('tiap berkas bisa dibuang', chip.buang === 3);
  await p.screenshot({ path: path.join(LUAR, 'ai-lampiran.png') });

  /* Pembaca Excel adalah pustaka 880 KB. Ia TIDAK boleh ikut terunduh saat
     halaman dibuka — hanya saat ada yang benar-benar melampirkan Excel. */
  const sheetSebelum = await p.evaluate(() => Boolean(window.XLSX));
  await p.setInputFiles('#aiBerkas', [berkasXlsx]);
  await p.waitForFunction(() => document.querySelectorAll('.ai-lampiran .ai-lp-chip').length === 4
    && !document.querySelector('.ai-lp-chip.memuat'), { timeout: 20000 });
  const sheetSesudah = await p.evaluate(() => Boolean(window.XLSX));
  cek('pustaka Excel belum diunduh sebelum dibutuhkan', sheetSebelum === false);
  cek('pustaka Excel diunduh saat Excel dilampirkan', sheetSesudah === true);

  /* Batas jumlah berkas diuji SEBELUM jenis yang tidak didukung, karena
     batas itulah yang lebih dulu berlaku — kalau dibalik, ujinya sebenarnya
     mengukur batas jumlah sambil mengira sedang mengukur jenis berkas. */
  await p.setInputFiles('#aiBerkas', [berkasTxt]);
  await p.waitForTimeout(500);
  const penuh = await p.evaluate(() => ({
    toast: (document.getElementById('toast') || {}).textContent || '',
    jumlah: document.querySelectorAll('.ai-lampiran .ai-lp-chip').length,
  }));
  cek('lebih dari batas berkas ditolak di browser',
    /Maksimal 4/i.test(penuh.toast) && penuh.jumlah === 4, penuh);

  await p.click('.ai-lampiran .ai-lp-x');
  await p.waitForTimeout(200);
  cek('membuang satu berkas menyisakan yang lain',
    (await p.$$('.ai-lampiran .ai-lp-chip')).length === 3);

  await p.setInputFiles('#aiBerkas', [berkasTolak]);
  await p.waitForTimeout(600);
  const tolakan = await p.evaluate(() => ({
    toast: (document.getElementById('toast') || {}).textContent || '',
    jumlah: document.querySelectorAll('.ai-lampiran .ai-lp-chip').length,
  }));
  cek('jenis berkas tak didukung ditolak dengan pesan jelas',
    /belum didukung/i.test(tolakan.toast) && tolakan.jumlah === 3, tolakan);

  await p.fill('#aiIsian', 'Tolong baca berkas ini');
  await p.click('#aiKirim');
  await p.waitForFunction(() => !document.getElementById('aiKirim').disabled, { timeout: 20000 });
  await p.waitForTimeout(400);
  const dikirim = await p.evaluate(() => ({
    sisa: document.querySelectorAll('.ai-lampiran .ai-lp-chip').length,
    kotakSembunyi: document.getElementById('aiLampiran').hidden,
  }));
  cek('kotak lampiran dikosongkan setelah terkirim', dikirim.sisa === 0 && dikirim.kotakSembunyi, dikirim);

  const kirimanServer = server.badanTerakhir || {};
  cek('lampiran ikut terkirim ke server', (kirimanServer.lampiran || []).length === 3, (kirimanServer.lampiran || []).length);
  cek('gambar dikirim sebagai data, berkas teks sebagai teks',
    kirimanServer.lampiran.some((l) => l.jenis === 'gambar' && l.data && !l.teks)
    && kirimanServer.lampiran.some((l) => l.jenis === 'teks' && l.teks && !l.data), kirimanServer.lampiran.map((l) => l.jenis));
  cek('gambar dikecilkan jadi JPEG sebelum dikirim',
    kirimanServer.lampiran.find((l) => l.jenis === 'gambar').mime === 'image/jpeg');
  cek('model & peran pilihan ikut dikirim',
    kirimanServer.model === 'model-cepat' && kirimanServer.personaId === 'pr1', kirimanServer.model);

  console.log('\n=== J. LAMPIRAN LAMA DI RIWAYAT ===');
  const lp = await p.evaluate(() => ({
    gambar: document.querySelectorAll('.ai-lp-gambar').length,
    berkas: document.querySelectorAll('.ai-lp-pesan .ai-lp-chip').length,
    termuat: document.querySelectorAll('.ai-lp-gambar img').length,
    kedaluwarsa: Array.from(document.querySelectorAll('.ai-lp-kosong')).map((x) => x.textContent),
  }));
  cek('gambar lampiran lama digambar di riwayat', lp.gambar === 2, lp);
  cek('gambar yang masih ada berhasil dimuat', lp.termuat === 1, lp.termuat);
  cek('gambar yang sudah lewat umur dikatakan, bukan kotak rusak',
    lp.kedaluwarsa.some((t) => /masa simpan/i.test(t)), lp.kedaluwarsa);
  cek('berkas non-gambar tampil sebagai kartu berkas', lp.berkas === 1, lp.berkas);

  console.log('\n=== K. TOMBOL SUARA ===');
  const suara = await p.evaluate(() => {
    const b = document.getElementById('aiSuara');
    return { ada: !!b, tampil: b && !b.hidden, dukung: !!(window.SpeechRecognition || window.webkitSpeechRecognition) };
  });
  /* Chromium uji coba tidak punya mesin pengenalan suara. Yang diuji justru
     itu: tombolnya HARUS hilang, bukan tampil lalu diam saat ditekan. */
  cek('tombol suara mengikuti dukungan browser', suara.ada && suara.tampil === suara.dukung, suara);

  console.log('\n=== L. LAYAR HP ===');
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

  console.log('\n=== M. TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript sepanjang uji', galat.length === 0, galat.slice(0, 4));

  await b.close();
  server.close();
  console.log('\ntest_ai_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
