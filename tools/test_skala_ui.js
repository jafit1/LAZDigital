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
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
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
      'perangkat.lihat', 'audit.lihat', 'pengaturan.lihat'],
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

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = '';
    for await (const c of req) body += c;
    let t = '';
    try { t = JSON.parse(body).tindakan || ''; } catch (_) {}
    /* "dasbor.ringkas" dipakai dua modul dengan bentuk balasan berbeda. */
    if (t === 'dasbor.ringkas' && req.url.includes('/fund')) t = 'dasbor.ringkas.fund';
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
  /* Halaman percakapan sengaja tidak punya judul halaman biasa, jadi satu
     halaman turunan ikut diuji supaya batas ukuran judul & tabel tetap
     terperiksa di modul ini juga. */
  { url: '/ai.html#pakai', nama: 'AI Penggunaan', siap: '.fund-kpi .kpi-v2, .card' },
  /* Halaman utama LAZDigital tanpa sesi yang sah berhenti di layar masuk.
     Itu justru layar yang paling sering dilihat orang di perangkat baru, dan
     ia memakai kerangka gaya yang sama — jadi tetap diperiksa. */
  { url: '/index.html', nama: 'LAZDigital (layar masuk)', siap: 'body' },
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

  for (const hal of HALAMAN) {
    console.log(`\n=== ${hal.nama} (${hal.url}) ===`);
    for (const uk of LEBAR) {
      const ctx = await b.newContext({ viewport: { width: uk.w, height: uk.h } });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => galat.push(`${hal.nama} @${uk.w}: ${e}`));
      await p.addInitScript(() => {
        try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {}
      });
      await p.goto(A + hal.url);
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
          navLebar: nav ? Math.round(nav.getBoundingClientRect().width) : null,
          navCiut: (document.getElementById('appView') || { classList: { contains: () => false } })
            .classList.contains('collapsed'),
          navMendatar: nav ? getComputedStyle(nav).flexDirection === 'row' : null,
          keluarKanan: Array.from(document.querySelectorAll('.card, .kpi-v2, .stat, .table-wrap, .btn'))
            .filter((x) => x.getBoundingClientRect().right > window.innerWidth + 1).length,
        };
      });

      const tag = `${hal.nama} @${uk.w}`;
      cek(`${tag}: perangkat terbaca "${uk.perangkat}"`, u.perangkat === uk.perangkat, u.perangkat);
      cek(`${tag}: arah layar tercatat`, u.arah === (uk.w >= uk.h ? 'lebar' : 'tinggi'), u.arah);
      cek(`${tag}: tidak meluber ke samping`, u.luber, { lebarGulir: u.lebarGulir, layar: uk.w });
      cek(`${tag}: tidak ada elemen terdorong keluar layar`, u.keluarKanan === 0, u.keluarKanan);

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

      await ctx.close();
    }
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
    await p.goto(A + '/fund.html');
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
    await p.goto(A + '/fund.html');
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
