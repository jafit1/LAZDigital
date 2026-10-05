/* Uji skala & kerapatan tampilan di SELURUH halaman, pada banyak lebar layar.
 *
 * Yang dijaga di sini ada tiga, dan ketiganya gampang rusak diam-diam:
 *
 * 1. TIDAK ADA YANG MELUBER KE SAMPING. Gulir mendatar di aplikasi seperti ini
 *    selalu berarti ada yang salah — dan di HP ia membuat seluruh halaman
 *    terasa geser-geser sendiri saat disentuh.
 * 2. TIDAK ADA YANG TERLALU BESAR. Judul, angka ringkasan, dan bilah menu
 *    punya langit-langit per lebar layar. Inilah yang jadi keluhan: di laptop
 *    semuanya satu nomor kebesaran, jadi baris yang terlihat sekali pandang
 *    jadi sedikit.
 * 3. TIDAK ADA YANG TERLALU KECIL. Ini pasangan wajib nomor 2 — tanpa lantai,
 *    "merapatkan" akan berakhir jadi teks yang tidak terbaca. Teks isi tidak
 *    boleh di bawah 12,5 px dan judul halaman tidak boleh di bawah 19 px.
 *
 * Plus: atribut perangkat memang terpasang, dan kendali membesar saat dibuka
 * dengan jari.
 *
 * jalankan:  node tools/test_skala_ui.js
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
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');

const HARI = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const lok = { lat: -7.8879, lng: 110.3288, alamat: 'Jl. Sudirman, Bantul' };

/* Isi secukupnya supaya kerangka tiap halaman benar-benar tergambar. Yang
   diuji di sini tata letaknya, bukan datanya — jadi cukup satu-dua baris. */
const JAWABAN = {
  // ---- Broadcast
  'sistem.status': {
    masuk: true, driver: 'mandiri',
    pengguna: { id: 'u1', nama: 'Ahmad Maruf', peran: 'superadmin', kantor: '' },
    izin: ['dasbor.lihat', 'kontak.lihat', 'pesan.lihat', 'kirim.lihat', 'templat.lihat',
      'perangkat.lihat', 'audit.lihat', 'pengaturan.lihat', 'inbox.lihat', 'inbox.balas'],
    akses: { webhook: true, audit: true },
    lembaga: { nama: 'LAZISMU Daerah Bantul', singkatan: 'Lazismu Bantul' },
  },
  'dasbor.ringkas': {
    hariIni: { total: 20, terkirim: 18, sampai: 15, dibaca: 9, gagal: 2, antre: 3 },
    keseluruhan: { total: 640, terkirim: 600, sampai: 540, dibaca: 300, gagal: 12, antre: 7 },
    grafik: [], perangkat: [], terakhir: [],
  },
  // ---- Fundraising
  'fund.status': {
    pengguna: { id: 'u1', nama: 'Ahmad Maruf', peran: 'koordinator', kantor: '' },
    izin: ['fund.dasbor', 'donatur.lihat', 'donatur.ubah', 'ambil.catat', 'himpunan.lihat',
      'cocok.lihat', 'laporan.lihat', 'akun.lihat'],
    lihatSemua: true, upstash: true,
    akun: { namaTampil: 'Ahmad Maruf', namaFundraising: 'Tim Bantul Kota', foto: '', telepon: '', catatan: '' },
  },
  // ---- AI
  'ai.status': {
    pengguna: { id: 'u1', nama: 'Ahmad Maruf', peran: 'pengelola' },
    izin: ['ai.chat', 'sesi.lihat', 'sesi.kirim', 'pengetahuan.lihat', 'prompt.lihat', 'pakai.lihat'],
    superadmin: true, adaPenyedia: true,
    penyediaAktif: { id: 'pv1', nama: 'Tiruan', model: 'model-uji', bentuk: 'openai', dukungGambar: true },
    model: [{ penyediaId: 'pv1', penyediaNama: 'Tiruan', bentuk: 'openai', model: 'model-uji', utama: true, dukungGambar: true, siap: true, baku: true }],
    lampiran: { simpanHari: 30, maksPerPesan: 4, gambarBoleh: [] },
    persona: [], pengetahuan: { jumlah: 0, terpotong: false }, upstash: true,
  },
  'sesi.daftar': { baris: [] },
  /* Kotak masuk percakapan. Layar ini yang paling gawat kalau ukurannya
     meleset: ia dua kolom, tingginya dipatok ke tinggi layar, dan di dalamnya
     ada kotak tulis yang harus tetap terlihat. Di layar 360 px salah satu saja
     yang kelewat lebar sudah membuat halamannya bisa digeser ke samping. */
  'inbox.daftar': {
    denyut: 3, belumDibaca: 2,
    baris: [
      { kunci: 'nomor:628111000111', jenis: 'kontak', nomor: '628111000111', nama: 'Budi Santosa',
        kantor: 'KLL Sewon', diblokir: false, jumlah: 3, masuk: 2, belumDibaca: 2,
        waktu: new Date().toISOString(), cuplikan: 'Bisa minta rincian penyaluran zakat bulan ini?',
        arahTerakhir: 'masuk', statusTerakhir: 'masuk' },
      { kunci: 'grup:Panitia Qurban', jenis: 'grup', grup: 'Panitia Qurban', nama: 'Panitia Qurban',
        nomor: '', anggota: 24, jumlah: 3, dibalas: 5, belumDibaca: 0,
        waktu: new Date().toISOString(), cuplikan: 'Kajian Ahad pukul 08.00 di kantor daerah.',
        arahTerakhir: 'keluar', statusTerakhir: 'berjalan' },
    ],
  },
  'inbox.denyut': { denyut: 3 },
  'inbox.utas': {
    nomor: '628111000111', nama: 'Budi Santosa', kantor: 'KLL Sewon', diblokir: false,
    grup: ['Pengurus Harian'],
    pesan: [
      { id: 'm1', arah: 'keluar', teks: 'Kwitansi zakat Bapak sudah kami kirim lewat surel.',
        status: 'dibaca', waktu: new Date(Date.now() - 3600000).toISOString(), namaMassal: '' },
      { id: 'm2', arah: 'masuk', teks: 'Bisa minta rincian penyaluran zakat bulan ini?',
        status: 'masuk', waktu: new Date().toISOString() },
    ],
  },
};

/* Dasbor Fundraising butuh bentuk datanya, bukan sekadar {ok:true} — kalau
   kosong halamannya menggambar keadaan "belum ada apa-apa", dan yang paling
   ingin diperiksa (kartu ringkas + baris jadwal) justru tidak muncul. */
JAWABAN['dasbor.ringkas.fund'] = {
  tanggal: HARI, tanggalPanjang: 'Kamis, 24 September 2026',
  ringkasHari: { kunjungan: 3, berhasil: 2, kosong: 1, total: 350000 },
  ringkasBulan: { kunjungan: 40, berhasil: 33, kosong: 7, total: 7250000 },
  totalDonatur: 42, belumDikunjungi: 1,
  jadwal: [
    { id: 'd1', nama: 'Budi Santosa', telepon: '628111000111', lokasi: lok, jadwal: { tanggal: HARI, ulang: 'sekali' }, sudahDikunjungi: false, hasilKunjungan: null },
    { id: 'd2', nama: 'Siti Aminah', telepon: '628222000222', lokasi: lok, jadwal: { tanggal: HARI, ulang: 'mingguan' }, sudahDikunjungi: true, hasilKunjungan: { id: 'h2', status: 'diambil', jumlah: 200000, peruntukan: 'Zakat' } },
  ],
};

// ---- Media & Desain
JAWABAN['media.status'] = {
  pengguna: { id: 'u1', nama: 'Ahmad Maruf', peran: 'koordinator', kantor: '' },
  izin: ['media.dasbor', 'permohonan.lihat', 'permohonan.ajukan', 'permohonan.revisi',
    'kerja.ambil', 'kerja.kirim', 'tim.lihat', 'tim.ubah', 'permohonan.bagi', 'rekap.lihat'],
  koordinator: true, bidangSaya: ['desain'],
  jenis: [
    { kode: 'foto', label: 'Foto', bidang: 'foto', contoh: 'Dokumentasi kegiatan' },
    { kode: 'flyer', label: 'Flyer / Poster', bidang: 'desain', contoh: 'Pengumuman kegiatan' },
  ],
  labelBidang: { foto: 'Foto', video: 'Video', desain: 'Desain Grafis' },
  labelStatus: {}, labelLangkah: {},
  hariIni: new Date().toISOString().slice(0, 10), upstash: true,
};
JAWABAN['dasbor.ringkas.media'] = {
  lembaga: { total: 12, baru: 3, diproses: 2, selesai: 7, terlambat: 1, revisi: 4 },
  saya: { total: 5, baru: 1, diproses: 1, selesai: 3, terlambat: 0, revisi: 2 },
  kotakSaya: { jumlah: 2, baru: 1, terlambat: 0 },
  bidangSaya: ['desain'],
  mendesak: [{
    id: 'pm1', nomor: 'MD-2609-001', judul: 'Flyer Kajian Ahad Pagi dengan judul yang sengaja panjang sekali',
    jenis: 'flyer', jenisLabel: 'Flyer / Poster', bidang: 'desain', status: 'baru',
    pemohonId: 'u2', pemohonNama: 'Rina Humas', pemohonKantor: '', pengerjaId: '', pengerjaNama: '',
    deadline: new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10),
    sisaHari: 2, terlambat: false, jumlahRevisi: 0, jumlahHasil: 0, hasilTerakhir: '',
    dibuat: new Date().toISOString(), diubah: new Date().toISOString(),
  }],
};

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = '';
    for await (const c of req) body += c;
    let t = '';
    try { t = JSON.parse(body).tindakan || ''; } catch (_) {}
    /* "dasbor.ringkas" dipakai dua modul dengan bentuk balasan berbeda. */
    if (t === 'dasbor.ringkas' && req.url.includes('/fund')) t = 'dasbor.ringkas.fund';
    if (t === 'dasbor.ringkas' && req.url.includes('/media')) t = 'dasbor.ringkas.media';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ...(JAWABAN[t] || {}) }));
  }
  const nama = req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas) || fs.statSync(berkas).isDirectory()) {
    res.writeHead(404); return res.end('x');
  }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

/* Lebar yang benar-benar dipakai orang, bukan angka bulat yang enak dilihat:
   360/390 HP, 768 tablet potret, 1024 tablet lanskap & laptop kecil,
   1280/1366 laptop kantor, 1920 monitor. */
const LEBAR = [
  { w: 360, h: 780, perangkat: 'hp' },
  { w: 390, h: 844, perangkat: 'hp' },
  { w: 768, h: 1024, perangkat: 'tablet' },
  { w: 1024, h: 768, perangkat: 'laptop' },
  { w: 1280, h: 800, perangkat: 'laptop' },
  { w: 1366, h: 768, perangkat: 'laptop' },
  { w: 1920, h: 1080, perangkat: 'desktop' },
];

const HALAMAN = [
  { url: '/blast.html', nama: 'Broadcast', siap: '#appView:not(.hidden)' },
  { url: '/fund.html', nama: 'Fundraising', siap: '#appView:not(.hidden)' },
  { url: '/ai.html', nama: 'AI Asisten', siap: '#appView:not(.hidden)' },
  { url: '/media.html', nama: 'Media & Desain', siap: '#appView:not(.hidden)' },
  /* Halaman percakapan sengaja tidak punya judul halaman biasa, jadi satu
     halaman turunan ikut diuji supaya batas ukuran judul & tabel tetap
     terperiksa di modul ini juga. */
  { url: '/ai.html#pakai', nama: 'AI Penggunaan', siap: '.fund-kpi .kpi-v2, .card' },
  /* Halaman utama LAZDigital tanpa sesi yang sah berhenti di layar masuk.
     Itu justru layar yang paling sering dilihat orang di perangkat baru, dan
     ia memakai kerangka gaya yang sama — jadi tetap diperiksa. */
  { url: '/index.html', nama: 'LAZDigital (layar masuk)', siap: 'body' },
  /* Kotak masuk percakapan diperiksa tersendiri: dua kolom, tinggi dipatok ke
     tinggi layar, dan kotak tulis di dasarnya. Di layar 360 px salah satu saja
     yang kelewat lebar sudah membuat halamannya bisa digeser ke samping, dan
     ini satu-satunya halaman Broadcast yang bentuknya begitu. */
  { url: '/blast.html#percakapan', nama: 'Broadcast Percakapan', siap: '.pc' },
];

/* Langit-langit & lantai. Angka-angka ini adalah janjinya: kalau suatu saat
   ada yang membesarkan judul lagi "supaya kelihatan", ujinya yang protes. */
const BATAS = {
  judul: { min: 18.5, maks: { hp: 20, tablet: 21, laptop: 21, desktop: 22 } },
  /* Lantai angka ringkasan lebih rendah di HP dengan sengaja: di layar 360 px
     kartunya dua kolom, dan "Rp 7.250.000" pada 20 px akan terpotong. 16,5 px
     masih terbaca jelas untuk angka tebal. */
  nilai: { min: { hp: 16.5, tablet: 18, laptop: 18, desktop: 18 }, maks: { hp: 21, tablet: 22, laptop: 22, desktop: 23 } },
  teksIsi: { min: 12.5 },
  sisi: { maks: { laptop: 215, desktop: 230 } },   // hanya berlaku >= 1024px
};

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(CHROMIUM);

  let ok = 0, g = 0;
  const yangGagal = [];
  const galat = [];
  const cek = (n, s, info) => {
    if (s) { ok++; return; }
    g++;
    const ket = info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200);
    yangGagal.push(`${n}  ->  ${ket}`);
    console.log('  GAGAL|', n, ket);
  };

  /* Tiap halaman dibuka di tujuh lebar layar. Dulu satu per satu: 49 kali
     buka halaman, terukur 50 detik dan jadi uji terlama. Sekarang beberapa
     lebar dibuka bersamaan di peramban yang sama (tiap lebar tetap konteks
     sendiri, jadi tidak saling memengaruhi), lalu diperiksa berurutan
     supaya keluarannya tetap rapi. */
  const SEJAJAR = 3;
  const ukurSatu = async (hal, uk) => {
      const ctx = await b.newContext({ viewport: { width: uk.w, height: uk.h } });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => galat.push(`${hal.nama} @${uk.w}: ${e}`));
      await p.addInitScript(() => {
        try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {}
      });
      /* domcontentloaded, bukan load: load menunggu Google Fonts dari internet. Di komputer yang sedang sibuk
         (tiga peramban sekaligus) itu melewati 30 detik dan uji gagal padahal halamannya benar. */
      await p.goto(A + hal.url, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector(hal.siap, { timeout: 15000 });
      await p.waitForTimeout(450);

      const u = await p.evaluate(() => {
        const ukur = (sel) => {
          const e = document.querySelector(sel);
          return e ? parseFloat(getComputedStyle(e).fontSize) : null;
        };
        const nav = document.querySelector('.topnav');
        return {
          perangkat: document.documentElement.getAttribute('data-perangkat'),
          arah: document.documentElement.getAttribute('data-arah'),
          luber: document.documentElement.scrollWidth <= window.innerWidth + 2,
          lebarGulir: document.documentElement.scrollWidth,
          judul: ukur('.page-head h2'),
          nilai: ukur('.kpi-v2-value, .stat .val, .ai-isi'),
          tabel: ukur('table'),
          tombol: ukur('.btn'),
          isian: ukur('input:not([type=checkbox]):not([type=hidden])'),
          tema: (() => {
            const t = document.querySelector('.kepala-tema'); const v = t && t.querySelector('svg');
            if (!t || !v) return null;
            const r = t.getBoundingClientRect(), q = v.getBoundingClientRect();
            return { lebar: Math.round(r.width), tinggi: Math.round(r.height), sel: Math.abs((q.x - r.x) - (r.right - q.right)), selY: Math.abs((q.y - r.y) - (r.bottom - q.bottom)) };
          })(),
          navLebar: nav ? Math.round(nav.getBoundingClientRect().width) : null,
          navCiut: (document.getElementById('appView') || { classList: { contains: () => false } })
            .classList.contains('collapsed'),
          navMendatar: nav ? getComputedStyle(nav).flexDirection === 'row' : null,
          keluarKanan: Array.from(document.querySelectorAll('.card, .kpi-v2, .stat, .table-wrap, .btn'))
            .filter((x) => x.getBoundingClientRect().right > window.innerWidth + 1).length,
        };
      });
      await ctx.close();
      return u;
  };

  for (const hal of HALAMAN) {
    console.log(`\n=== ${hal.nama} (${hal.url}) ===`);
    const hasilUkur = [];
    for (let i = 0; i < LEBAR.length; i += SEJAJAR) {
      hasilUkur.push(...await Promise.all(LEBAR.slice(i, i + SEJAJAR).map((uk) => ukurSatu(hal, uk))));
    }
    LEBAR.forEach((uk, iu) => {
      const u = hasilUkur[iu];

      const tag = `${hal.nama} @${uk.w}`;
      cek(`${tag}: perangkat terbaca "${uk.perangkat}"`, u.perangkat === uk.perangkat, u.perangkat);
      cek(`${tag}: arah layar tercatat`, u.arah === (uk.w >= uk.h ? 'lebar' : 'tinggi'), u.arah);
      cek(`${tag}: tidak meluber ke samping`, u.luber, { lebarGulir: u.lebarGulir, layar: uk.w });
      cek(`${tag}: tidak ada elemen terdorong keluar layar`, u.keluarKanan === 0, u.keluarKanan);

      /* Tombol tema di kepala halaman: ikonnya harus di tengah di keadaan menu terbuka maupun ciut. Pernah menempel
         ke kanan (kiri 21 px, kanan -3 px) karena aturan sidebar `.app.collapsed .tn-icon` mengalahkan aturan tombol. */
      if (!u.tema && !/layar masuk/.test(hal.nama)) cek(`${tag}: tombol tema ada di halaman`, false, 'tidak ada .kepala-tema');
      if (u.tema) cek(`${tag}: ikon tombol tema tepat di tengah`, u.tema.sel <= 1 && u.tema.selY <= 1 && u.tema.lebar === 40 && u.tema.tinggi === 40, u.tema);
      if (u.judul !== null) {
        cek(`${tag}: judul tidak kebesaran`, u.judul <= BATAS.judul.maks[uk.perangkat], u.judul);
        cek(`${tag}: judul tidak kekecilan`, u.judul >= BATAS.judul.min, u.judul);
      }
      if (u.nilai !== null) {
        cek(`${tag}: angka ringkasan tidak kebesaran`, u.nilai <= BATAS.nilai.maks[uk.perangkat], u.nilai);
        cek(`${tag}: angka ringkasan tidak kekecilan`, u.nilai >= BATAS.nilai.min[uk.perangkat], u.nilai);
      }
      for (const [nama, nilai] of [['tabel', u.tabel], ['tombol', u.tombol], ['isian', u.isian]]) {
        if (nilai === null) continue;
        cek(`${tag}: teks ${nama} masih terbaca (>= ${BATAS.teksIsi.min}px)`, nilai >= BATAS.teksIsi.min, nilai);
      }

      /* Di bawah 1024 px bilah menu berubah jadi bilah atas — lebarnya memang
         seluruh layar, jadi batas lebar hanya berlaku di atas itu. */
      /* navLebar 0 berarti bilahnya memang tidak tergambar — layar masuk
         tidak punya menu sama sekali. Itu bukan kegagalan ukuran. */
      if (uk.w >= 1024 && u.navLebar) {
        /* Sejak bilahnya mengambang di atas isi halaman, keadaan bakunya CIUT
           — rel sempit berisi ikon saja. Dua keadaan, dua ukuran yang wajar:
           yang ciut harus muat ikon 22 px beserta jaraknya tanpa jadi rel
           kosong yang boros, yang terbuka harus muat keterangan namanya. */
        if (u.navCiut) {
          cek(`${tag}: rel ikon tidak terlalu sempit`, u.navLebar >= 70, u.navLebar);
          cek(`${tag}: rel ikon tidak boros tempat`, u.navLebar <= 100, u.navLebar);
        } else {
          cek(`${tag}: bilah menu tidak makan tempat berlebihan`,
            u.navLebar <= BATAS.sisi.maks[uk.perangkat], u.navLebar);
          cek(`${tag}: bilah menu masih cukup lebar untuk labelnya`, u.navLebar >= 180, u.navLebar);
        }
      }
    });
  }

  console.log('\n=== SENTUHAN JARI ===');
  {
    const ctx = await b.newContext({
      viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true,
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => galat.push('sentuh: ' + e));
    await p.addInitScript(() => {
      try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {}
    });
    await p.goto(A + '/fund.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
    await p.waitForTimeout(500);
    const s = await p.evaluate(() => {
      const t = document.querySelector('.btn:not(.btn-sm)');
      const kecil = document.querySelector('.btn-sm');
      return {
        sentuh: document.documentElement.getAttribute('data-sentuh'),
        tombol: t ? Math.round(t.getBoundingClientRect().height) : null,
        tombolKecil: kecil ? Math.round(kecil.getBoundingClientRect().height) : null,
        luber: document.documentElement.scrollWidth <= window.innerWidth + 2,
      };
    });
    cek('tablet sentuh dikenali sebagai perangkat sentuh', s.sentuh === 'ya', s.sentuh);
    cek('tombol cukup besar untuk ujung jari (>= 38px)', s.tombol === null || s.tombol >= 38, s.tombol);
    cek('tombol kecil pun masih >= 34px', s.tombolKecil === null || s.tombolKecil >= 34, s.tombolKecil);
    cek('membesarkan kendali tidak membuat halaman meluber', s.luber, s);
    await ctx.close();
  }

  console.log('\n=== TETIKUS (bukan sentuh) ===');
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {}
    });
    await p.goto(A + '/fund.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
    await p.waitForTimeout(400);
    const s = await p.evaluate(() => ({
      sentuh: document.documentElement.getAttribute('data-sentuh'),
      tombol: (() => { const t = document.querySelector('.btn-sm'); return t ? Math.round(t.getBoundingClientRect().height) : null; })(),
    }));
    cek('layar bertetikus tidak ditandai sentuh', s.sentuh === 'tidak', s.sentuh);
    /* Kebalikannya juga harus benar: tanpa jari, kendali TIDAK dibesarkan —
       kalau ikut membesar, layar laptop kehilangan baris tanpa alasan. */
    cek('tanpa jari, tombol kecil tetap rapat', s.tombolKecil === null || s.tombol < 34, s.tombol);
    await ctx.close();
  }

  /* Tema gelap: tiap menu tiap modul dipindai kontras teksnya (pemindai di _kontras.js). Pernah ada nama pengguna di
     bilah kiri yang tetap hitam karena <button> tanpa warna sendiri memakai hitam bawaan peramban. */
  console.log('\n=== KONTRAS TEKS DI TEMA GELAP ===');
  {
    const PINDAI = require('./_kontras.js');
    for (const hal of HALAMAN.filter((h) => /^\/(blast|fund|ai|media)\.html$/.test(h.url))) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage();
      p.on('pageerror', () => { /* data tiruan sengaja secukupnya: menu yang butuh lebih banyak bisa galat, bukan urusan uji ini */ });
      await p.addInitScript(() => { try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'dark'); } catch (_) {} });
      await p.goto(A + hal.url, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector(hal.siap, { timeout: 15000 });
      const jumlah = await p.evaluate(() => document.querySelectorAll('.topnav .tn-item').length);
      for (let i = 0; i < Math.max(jumlah, 1); i++) {
        if (jumlah) await p.evaluate((n) => document.querySelectorAll('.topnav .tn-item')[n].click(), i);
        await p.waitForTimeout(600);
        const nama = await p.evaluate(() => (location.hash || '#awal'));
        const r = await p.evaluate(PINDAI, 2.3);
        cek(`${hal.nama} ${nama}: semua teks terbaca di tema gelap`, r.length === 0, r.slice(0, 3));
      }
      await ctx.close();
    }
  }

  console.log('\n=== TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript di semua halaman & lebar', galat.length === 0, galat.slice(0, 3));

  await b.close();
  server.close();
  if (yangGagal.length) {
    console.log('\nYANG GAGAL:');
    yangGagal.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  }
  console.log('\ntest_skala_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exitCode = g ? 1 : 0;
  setTimeout(() => process.exit(g ? 1 : 0), 400).unref();
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
