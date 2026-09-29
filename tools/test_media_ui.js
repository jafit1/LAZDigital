/* Uji tampilan modul Media di peramban sungguhan.
 *
 * KENAPA TAMPILANNYA DIUJI, PADAHAL ATURANNYA SUDAH DIUJI DI TEMPAT LAIN.
 * test_media_fitur.js membuktikan server menolak yang harus ditolak. Berkas
 * ini membuktikan hal yang berbeda dan sama pentingnya: bahwa tiga jenis orang
 * yang membuka halaman yang SAMA melihat tiga hal yang berbeda, dan tidak ada
 * satu pun dari mereka melihat tombol yang akan menolaknya.
 *
 * Tombol yang terlihat tetapi menolak saat ditekan bukan sekadar jelek. Ia
 * mengajari orang bahwa aplikasi ini tidak bisa dipercaya, dan sesudah itu
 * mereka kembali memakai WhatsApp.
 *
 * Yang diperiksa:
 *   - menu yang muncul untuk pemohon, tim media, dan koordinator berbeda
 *   - pemohon tidak melihat tombol "Mulai kerjakan"
 *   - tim media yang bukan bidangnya tidak melihat tombol itu juga
 *   - linimasa menggambar siapa dan kapan, bukan cuma nama langkahnya
 *   - halaman tidak meluber ke samping di layar HP
 *
 *   node tools/test_media_ui.js
 */
'use strict';
const fs = require('fs');
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
const LUAR = path.join(AKAR, 'potret');

const HARI = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const BESOK = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10);
const KEMARIN = new Date(Date.now() - 2 * 86400e3).toISOString().slice(0, 10);
const DRIVE = 'https://drive.google.com/file/d/1AbC/view';

const JENIS = [
  { kode: 'foto', label: 'Foto', bidang: 'foto', contoh: 'Dokumentasi kegiatan' },
  { kode: 'video', label: 'Video', bidang: 'video', contoh: 'Liputan kegiatan' },
  { kode: 'flyer', label: 'Flyer / Poster', bidang: 'desain', contoh: 'Pengumuman kegiatan' },
  { kode: 'banner', label: 'Banner / Spanduk', bidang: 'desain', contoh: 'Backdrop panggung' },
  { kode: 'lainnya', label: 'Lainnya', bidang: '', bebas: true, contoh: 'Tuliskan sendiri' },
];
const LABEL_BIDANG = { foto: 'Foto', video: 'Video', desain: 'Desain Grafis' };
const LABEL_LANGKAH = {
  diajukan: 'Permohonan diajukan', diambil: 'Mulai dikerjakan tim media',
  dikirim: 'Hasil dikirim', revisi: 'Pemohon meminta revisi',
  dibagi: 'Dibagikan koordinator ke sebuah bidang',
};

const B = (o) => ({
  id: o.id, nomor: o.nomor, judul: o.judul, jenis: o.jenis,
  jenisLabel: (JENIS.find((j) => j.kode === o.jenis) || {}).label || o.jenis,
  bidang: o.bidang, status: o.status, statusLabel: o.status,
  pemohonId: o.pemohonId, pemohonNama: o.pemohonNama, pemohonKantor: '',
  pengerjaId: o.pengerjaId || '', pengerjaNama: o.pengerjaNama || '',
  deadline: o.deadline, sisaHari: o.sisaHari, terlambat: !!o.terlambat,
  jumlahRevisi: o.jumlahRevisi || 0, jumlahHasil: (o.hasil || []).length,
  hasilTerakhir: (o.hasil || []).length ? o.hasil[o.hasil.length - 1].tautan : '',
  dibuat: o.dibuat || new Date().toISOString(), diubah: o.diubah || new Date().toISOString(),
});

const P_FLYER = {
  id: 'pm1', nomor: 'MD-2609-001', judul: 'Flyer Kajian Ahad Pagi', jenis: 'flyer',
  bidang: 'desain', status: 'baru', pemohonId: 'u_pemohon', pemohonNama: 'Rina Humas',
  deadline: BESOK, sisaHari: 3, terlambat: false,
};
const P_FOTO = {
  id: 'pm2', nomor: 'MD-2609-002', judul: 'Dokumentasi penyaluran', jenis: 'foto',
  bidang: 'foto', status: 'selesai', pemohonId: 'u_pemohon', pemohonNama: 'Rina Humas',
  pengerjaId: 'u_foto', pengerjaNama: 'Adi Fotografer', deadline: KEMARIN, sisaHari: -2,
  terlambat: false, jumlahRevisi: 1, hasil: [{ tautan: DRIVE, versi: 1, olehNama: 'Adi Fotografer', waktu: new Date().toISOString(), catatan: 'Sudah diedit' }],
};
const P_VIDEO = {
  id: 'pm3', nomor: 'MD-2609-003', judul: 'Liputan bedah rumah', jenis: 'video',
  bidang: 'video', status: 'baru', pemohonId: 'u_lain', pemohonNama: 'Doni Program',
  deadline: KEMARIN, sisaHari: -2, terlambat: true,
};

const DETAIL = {
  ...B(P_FLYER),
  brief: 'Tema zakat profesi, warna hijau, ada logo Lazismu dan QR donasi di pojok kanan bawah.',
  keterangan: 'Ukuran feed Instagram 1080x1350',
  bahan: 'https://drive.google.com/drive/folders/1xyz',
  hasil: [],
  jejak: [
    { langkah: 'diajukan', oleh: 'u_pemohon', olehNama: 'Rina Humas', waktu: '2026-09-25T02:10:00.000Z', catatan: 'Ukuran feed Instagram' },
  ],
};
const DETAIL_SELESAI = {
  ...B(P_FOTO),
  brief: 'Foto penyaluran di Dusun Gading, minimal 20 frame, ada wide dan close up.',
  keterangan: '', bahan: '',
  hasil: [
    { tautan: DRIVE, versi: 1, olehNama: 'Adi Fotografer', waktu: '2026-09-26T03:00:00.000Z', catatan: 'Versi pertama' },
    { tautan: 'https://drive.google.com/file/d/2Zyx/view', versi: 2, olehNama: 'Adi Fotografer', waktu: '2026-09-27T03:00:00.000Z', catatan: 'Sudah dicerahkan' },
  ],
  jejak: [
    { langkah: 'diajukan', oleh: 'u_pemohon', olehNama: 'Rina Humas', waktu: '2026-09-24T02:00:00.000Z', catatan: '' },
    { langkah: 'diambil', oleh: 'u_foto', olehNama: 'Adi Fotografer', waktu: '2026-09-25T01:00:00.000Z', catatan: '' },
    { langkah: 'dikirim', oleh: 'u_foto', olehNama: 'Adi Fotografer', waktu: '2026-09-26T03:00:00.000Z', catatan: 'Versi pertama' },
    { langkah: 'revisi', oleh: 'u_pemohon', olehNama: 'Rina Humas', waktu: '2026-09-26T08:00:00.000Z', catatan: 'Tolong dicerahkan, yang di dalam rumah terlalu gelap' },
    { langkah: 'dikirim', oleh: 'u_foto', olehNama: 'Adi Fotografer', waktu: '2026-09-27T03:00:00.000Z', catatan: 'Sudah dicerahkan' },
  ],
};

/* Tiga peran, tiga jawaban media.status yang berbeda. */
const PERAN = {
  pemohon: {
    pengguna: { id: 'u_pemohon', nama: 'Rina Humas', peran: 'pemohon', kantor: '' },
    izin: ['media.dasbor', 'permohonan.lihat', 'permohonan.ajukan', 'permohonan.revisi'],
    koordinator: false, bidangSaya: [],
  },
  timFoto: {
    pengguna: { id: 'u_foto', nama: 'Adi Fotografer', peran: 'tim media', kantor: '' },
    izin: ['media.dasbor', 'permohonan.lihat', 'permohonan.ajukan', 'permohonan.revisi', 'kerja.ambil', 'kerja.kirim'],
    koordinator: false, bidangSaya: ['foto'],
  },
  koordinator: {
    pengguna: { id: 'u_koor', nama: 'Koordinator Media', peran: 'koordinator', kantor: '' },
    izin: ['media.dasbor', 'permohonan.lihat', 'permohonan.ajukan', 'permohonan.revisi',
      'kerja.ambil', 'kerja.kirim', 'tim.lihat', 'tim.ubah', 'permohonan.bagi', 'rekap.lihat'],
    koordinator: true, bidangSaya: ['desain'],
  },
};

let peranAktif = 'pemohon';
let detailAktif = DETAIL;

function jawaban(t) {
  const p = PERAN[peranAktif];
  const ringkas = { total: 3, baru: 2, diproses: 0, selesai: 1, terlambat: 1, revisi: 1 };
  switch (t) {
    case 'media.status':
      return { ...p, jenis: JENIS, labelBidang: LABEL_BIDANG, labelStatus: {}, labelLangkah: LABEL_LANGKAH, hariIni: HARI, upstash: true };
    case 'dasbor.ringkas': {
      const d = {
        lembaga: ringkas,
        saya: { total: 2, baru: 1, diproses: 0, selesai: 1, terlambat: 0, revisi: 1 },
        kotakSaya: { jumlah: p.bidangSaya.length ? 1 : 0, baru: p.bidangSaya.length ? 1 : 0, terlambat: 0 },
        bidangSaya: p.bidangSaya,
        mendesak: [B(P_FLYER), B(P_VIDEO)],
      };
      /* Bagian pemantauan hanya dikirim ke koordinator, persis seperti
         server sungguhan. Kalau suatu saat ia ikut terkirim ke pemohon,
         uji bagian A di bawah yang akan protes. */
      if (p.koordinator) {
        d.pantau = {
          perBidang: [
            { bidang: 'foto', label: 'Foto', orang: ['Adi Fotografer'], antre: 1, baru: 1, terlambat: 0, kosong: false },
            { bidang: 'video', label: 'Video', orang: [], antre: 1, baru: 1, terlambat: 1, kosong: true },
            { bidang: 'desain', label: 'Desain Grafis', orang: ['Cahya Desainer'], antre: 2, baru: 1, terlambat: 0, kosong: false },
          ],
          belumDibagi: 1,
          perOrang: [
            { userId: 'u_desain', nama: 'Cahya Desainer', bidang: ['Desain Grafis'], sedang: 2, selesai: 5 },
            { userId: 'u_foto', nama: 'Adi Fotografer', bidang: ['Foto'], sedang: 0, selesai: 3 },
          ],
          telat: [B(P_VIDEO)],
        };
      }
      return d;
    }
    case 'permohonan.daftar':
      return { baris: [B(P_FLYER), B(P_VIDEO), B(P_FOTO)], ringkas, kotak: '' };
    case 'permohonan.detail':
      return { permohonan: detailAktif, hariIni: HARI };
    case 'tim.daftar':
      return {
        anggota: [
          { userId: 'u_foto', nama: 'Adi Fotografer', bidang: ['foto'], catatan: '', aktif: true },
          { userId: 'u_desain', nama: 'Cahya Desainer', bidang: ['desain'], catatan: 'Hanya hari kerja', aktif: true },
        ],
        akun: [{ id: 'u_foto', nama: 'Adi Fotografer', username: 'adi' }, { id: 'u_video', nama: 'Bima', username: 'bima' }],
        bidang: LABEL_BIDANG,
        bidangKosong: ['video'],
        jenisPerBidang: { foto: ['foto'], video: ['video'], desain: ['flyer', 'banner'] },
      };
    case 'rekap.ringkas':
      return {
        ringkas,
        perJenis: [{ kunci: 'flyer', label: 'Flyer / Poster', total: 2, selesai: 1, terlambat: 0, revisi: 1 }],
        perBidang: [{ kunci: 'desain', label: 'Desain Grafis', total: 2, selesai: 1, terlambat: 0, revisi: 1 }],
        perPemohon: [{ kunci: 'u_pemohon', label: 'Rina Humas', total: 2, selesai: 1, terlambat: 0, revisi: 1 }],
        perPengerja: [{ kunci: '', label: 'Belum diambil', total: 2, selesai: 0, terlambat: 1, revisi: 0 }],
        baris: [B(P_FLYER), B(P_VIDEO), B(P_FOTO)], dari: '', sampai: '',
      };
    default:
      return {};
  }
}

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/media') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let t = '';
      try { t = JSON.parse(body).tindakan; } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...jawaban(t) }));
    });
    return;
  }
  const nama = req.url.split('?')[0];
  const berkas = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

let ok = 0, g = 0;
const galat = [];
const cek = (n, s, i) => {
  if (s) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, i === undefined ? '' : String(JSON.stringify(i)).slice(0, 240)); }
};

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(LUAR, { recursive: true });
  const b = await chromium.launch(CHROMIUM);

  async function bukaSebagai(peran, rute, opsi = {}) {
    peranAktif = peran;
    const ctx = await b.newContext({ viewport: opsi.viewport || { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => galat.push(peran + ': ' + String(e)));
    await p.addInitScript(() => {
      try { localStorage.setItem('laz_token', 'uji'); localStorage.setItem('laz_theme', 'light'); } catch (_) {}
    });
    await p.goto(A + '/media.html' + (rute ? '#' + rute : ''));
    await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
    await p.waitForTimeout(500);
    return { ctx, p };
  }
  const menu = (p) => p.$$eval('.tn-item', (n) => n.map((x) => x.title));

  console.log('=== A. MENU BERBEDA MENURUT PERAN ===');
  {
    const { ctx, p } = await bukaSebagai('pemohon', '');
    const m = await menu(p);
    cek('pemohon melihat dashboard, ajukan, dan daftar',
      m.includes('Dashboard') && m.includes('Ajukan Desain') && m.includes('Permohonan'), m);
    cek('pemohon TIDAK melihat kotak kerja', !m.includes('Kotak Kerja'), m);
    cek('pemohon TIDAK melihat Tim Media dan Rekap',
      !m.includes('Tim Media') && !m.includes('Rekap'), m);
    const tp = await p.textContent('#isiHalaman');
    cek('pemohon melihat ringkasan permohonannya sendiri', /Permohonan Saya/.test(tp), tp.slice(0, 200));
    cek('pemohon TIDAK melihat bagian pemantauan koordinator',
      !/Beban Bidang/.test(tp) && !/Tim Media/.test(tp), tp.slice(0, 200));
    cek('pemohon punya pintasan ajukan di kepala halaman', !!(await p.$('#pintasAjukan')));
    /* Kartu angkanya memakai komponen dashboard utama, bukan komponen buatan
       sendiri. Kalau suatu saat temanya berubah, halaman ini ikut berubah. */
    cek('kartu angka memakai komponen dashboard utama (.kpi-v2)',
      (await p.$$('.kpis-v2 .kpi-v2')).length === 4, (await p.$$('.kpi-v2')).length);
    cek('widget memakai kerangka dashboard utama (.dgrid .wc)',
      (await p.$$('.dgrid .wc')).length >= 2, (await p.$$('.dgrid .wc')).length);
    await p.screenshot({ path: path.join(LUAR, 'media-pemohon.png'), fullPage: true });
    await ctx.close();
  }
  {
    const { ctx, p } = await bukaSebagai('timFoto', '');
    const m = await menu(p);
    cek('tim media melihat kotak kerjanya', m.includes('Kotak Kerja'), m);
    cek('tim media TIDAK melihat Tim Media dan Rekap',
      !m.includes('Tim Media') && !m.includes('Rekap'), m);
    const teks = await p.textContent('#isiHalaman');
    cek('lencana peran menyebut bidang yang dipegangnya',
      /Foto/i.test(await p.textContent('#lencanaPeran')), await p.textContent('#lencanaPeran'));
    cek('tim media melihat kotak kerjanya', /Kotak Kerja Saya/.test(teks), teks.slice(0, 200));
    cek('tim media TIDAK melihat bagian pemantauan koordinator',
      !/Beban Bidang/.test(teks), teks.slice(0, 200));
    await p.screenshot({ path: path.join(LUAR, 'media-tim.png'), fullPage: true });
    await ctx.close();
  }
  {
    const { ctx, p } = await bukaSebagai('koordinator', '');
    const m = await menu(p);
    cek('koordinator melihat seluruh menu',
      m.includes('Tim Media') && m.includes('Rekap') && m.includes('Kotak Kerja'), m);
    const t = await p.textContent('#isiHalaman');
    cek('dashboard koordinator memperlihatkan beban tiap bidang',
      /Beban Bidang/.test(t) && /Desain Grafis/.test(t), t.slice(0, 200));
    cek('bidang tanpa anggota ditandai di dashboard', /tanpa anggota/.test(t), t.slice(0, 300));
    cek('permohonan yang belum dibagi diperingatkan', /belum dibagi ke bidang/.test(t));
    cek('yang lewat tanggal punya widgetnya sendiri', /Lewat Tanggal/.test(t));
    cek('beban tiap anggota tergambar', /Tim Media/.test(t) && /Cahya Desainer/.test(t));
    cek('koordinator dapat kartu angka lembaga',
      (await p.$$('.kpis-v2 .kpi-v2')).length === 4, (await p.$$('.kpi-v2')).length);
    /* BARIS PERMOHONAN TIDAK BOLEH SALING MENIMPA.
     *
     * Judul dan lencana keduanya <span> di dalam <button>, dan span itu
     * inline: tanpa display:block ia mengalir sebaris dengan lencana di
     * kanannya lalu saling menimpa begitu kolomnya sempit. Ini pernah
     * terjadi, dan di layar terbaca seperti tulisan yang rusak, bukan seperti
     * tata letak yang salah, jadi tidak ada yang tahu apa yang harus
     * dilaporkan. Diukur, bukan dilihat. */
    const baris = await p.evaluate(() => Array.from(document.querySelectorAll('.md-baris')).map((b) => {
      const j = b.querySelector('.md-r-judul');
      const n = b.querySelector('.md-r-kanan');
      const u = b.querySelector('.md-r-sub');
      return {
        timpa: Math.round(j.getBoundingClientRect().right - n.getBoundingClientRect().left),
        subPotong: u.scrollWidth > u.clientWidth + 1,
        subLebar: Math.round(u.getBoundingClientRect().width),
        judulLebar: Math.round(j.getBoundingClientRect().width),
      };
    }));
    cek('judul dan tanggal tidak saling menimpa',
      baris.length > 0 && baris.every((x) => x.timpa <= 0), baris);
    /* KETERANGAN TIDAK BOLEH TERPOTONG. Di situlah nomor permohonan, jenis,
       dan nama pemohon berada; kalau ia diperas oleh tanggal di sebelahnya,
       yang tersisa cuma nomor tanpa perkara. Maka ia diberi barisnya sendiri
       yang membentang penuh, dan lebarnya harus lebih besar daripada judul. */
    cek('keterangan tidak terpotong', baris.every((x) => !x.subPotong), baris);
    cek('keterangan membentang lebih lebar daripada judul',
      baris.every((x) => x.subLebar > x.judulLebar), baris);
    await p.screenshot({ path: path.join(LUAR, 'media-koordinator.png'), fullPage: true });
    await ctx.close();
  }

  console.log('\n=== B. TOMBOL KERJA HANYA UNTUK YANG BERHAK ===');
  detailAktif = DETAIL; // flyer, bidang desain, status baru
  {
    const { ctx, p } = await bukaSebagai('pemohon', 'p/pm1');
    cek('pemohon TIDAK melihat tombol "Mulai kerjakan"', !(await p.$('#akAmbil')));
    cek('dan tidak melihat tombol pindah bidang', !(await p.$('#akBagi')));
    cek('brief terbaca utuh di halaman detail',
      /zakat profesi/i.test(await p.textContent('#isiHalaman')));
    cek('tautan bahan digambar sebagai tautan yang bisa diklik',
      !!(await p.$('a[href*="drive.google.com"]')));
    await p.screenshot({ path: path.join(LUAR, 'media-detail-pemohon.png'), fullPage: true });
    await ctx.close();
  }
  {
    /* Tim FOTO membuka permohonan bidang DESAIN: bukan bidangnya, jadi
       tombolnya tidak boleh ada. Inilah pasangan tampilan dari pagar server. */
    const { ctx, p } = await bukaSebagai('timFoto', 'p/pm1');
    cek('tim foto TIDAK melihat tombol kerja pada permohonan desain', !(await p.$('#akAmbil')));
    await ctx.close();
  }
  {
    const { ctx, p } = await bukaSebagai('koordinator', 'p/pm1');
    cek('koordinator melihat tombol kerja (bidang desain memang miliknya)', !!(await p.$('#akAmbil')));
    cek('koordinator melihat tombol pindah bidang', !!(await p.$('#akBagi')));
    await ctx.close();
  }

  console.log('\n=== C. LINIMASA: SIAPA, KAPAN, DAN KENAPA ===');
  detailAktif = DETAIL_SELESAI;
  {
    const { ctx, p } = await bukaSebagai('pemohon', 'p/pm2');
    const teks = await p.textContent('#isiHalaman');
    cek('kelima langkah tergambar',
      (teks.match(/Permohonan diajukan|Mulai dikerjakan|Hasil dikirim|meminta revisi/g) || []).length >= 5,
      (teks.match(/Permohonan diajukan|Mulai dikerjakan|Hasil dikirim|meminta revisi/g) || []));
    cek('tiap langkah menyebut pelakunya', /Adi Fotografer/.test(teks) && /Rina Humas/.test(teks));
    cek('alasan revisi terbaca apa adanya, bukan cuma kata "revisi"',
      /terlalu gelap/i.test(teks), teks.slice(0, 300));
    cek('kedua versi hasil tetap bisa dibuka',
      (await p.$$('a[href*="drive.google.com"]')).length >= 2);
    cek('pemohon melihat tombol minta revisi pada yang sudah selesai', !!(await p.$('#akRevisi')));
    await p.screenshot({ path: path.join(LUAR, 'media-linimasa.png'), fullPage: true });
    await ctx.close();
  }
  {
    /* Staff lain BUKAN pemohonnya: tidak boleh melihat tombol revisi, sama
       seperti server yang akan menolaknya. */
    const { ctx, p } = await bukaSebagai('timFoto', 'p/pm2');
    cek('staff lain tidak melihat tombol minta revisi', !(await p.$('#akRevisi')));
    await ctx.close();
  }

  console.log('\n=== D. DAFTAR DAN PENANDA MENDESAK ===');
  {
    const { ctx, p } = await bukaSebagai('pemohon', 'semua');
    await p.waitForSelector('.baris-klik', { timeout: 8000 });
    const baris = await p.$$eval('.baris-klik', (n) => n.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    cek('ketiga permohonan tergambar', baris.length === 3, baris.length);
    cek('yang lewat tanggal ditandai dengan kalimat, bukan angka minus',
      baris.some((t) => /Telat 2 hari/.test(t)), baris);
    cek('nomor permohonan ikut terlihat', baris.some((t) => /MD-2609-001/.test(t)), baris);
    /* Baris bisa diklik dengan papan ketik juga, bukan cuma tetikus. */
    cek('baris bisa difokus papan ketik',
      (await p.$$eval('.baris-klik', (n) => n.every((x) => x.getAttribute('tabindex') === '0'))));
    await ctx.close();
  }

  console.log('\n=== E. TIM MEDIA: PERINGATAN BIDANG KOSONG ===');
  {
    const { ctx, p } = await bukaSebagai('koordinator', 'tim');
    const teks = await p.textContent('#isiHalaman');
    cek('bidang tanpa anggota diperingatkan di paling atas',
      /Tanpa anggota/i.test(teks) && /Video/.test(teks), teks.slice(0, 260));
    cek('daftar anggota beserta bidangnya tergambar',
      /Adi Fotografer/.test(teks) && /Cahya Desainer/.test(teks));
    cek('tabel jenis per bidang ikut dijelaskan', /Flyer \/ Poster/.test(teks));
    await p.screenshot({ path: path.join(LUAR, 'media-tim-media.png'), fullPage: true });
    await ctx.close();
  }

  console.log('\n=== F. REKAP ===');
  {
    const { ctx, p } = await bukaSebagai('koordinator', 'rekap');
    const teks = await p.textContent('#isiHalaman');
    cek('rekap per bidang, jenis, pemohon, dan pengerja tergambar',
      /Per Bidang/.test(teks) && /Per Jenis/.test(teks)
      && /Per Pemohon/.test(teks) && /Per Pengerja/.test(teks), teks.slice(0, 260));
    cek('yang belum diambil disebut apa adanya', /Belum diambil/.test(teks));
    /* Rentang tanggal memakai pemilih milik LAZDigital, bukan dua kotak
       tanggal bawaan peramban. */
    cek('rentang tanggal memakai pemilih bertema, bukan kotak bawaan',
      !!(await p.$('#rtMedia_btn')) && (await p.$$('input[type=date]')).length === 0,
      (await p.$$('input[type=date]')).length);
    await p.screenshot({ path: path.join(LUAR, 'media-rekap.png'), fullPage: true });
    await ctx.close();
  }

  console.log('\n=== G. LAYAR HP ===');
  {
    const { ctx, p } = await bukaSebagai('pemohon', 'ajukan', { viewport: { width: 390, height: 844 } });
    const m = await p.evaluate(() => ({
      luber: document.documentElement.scrollWidth <= window.innerWidth + 2,
      adaJenis: !!document.getElementById('fJenis'),
      adaDeadline: !!document.getElementById('fDeadline'),
      lebarIsian: Math.round((document.getElementById('fBrief') || {}).getBoundingClientRect
        ? document.getElementById('fBrief').getBoundingClientRect().width : 0),
    }));
    cek('halaman ajukan tidak meluber ke samping di HP', m.luber, m);
    cek('formulirnya lengkap', m.adaJenis && m.adaDeadline, m);
    cek('kotak brief cukup lebar untuk diketik', m.lebarIsian > 250, m.lebarIsian);
    await p.screenshot({ path: path.join(LUAR, 'media-hp-ajukan.png'), fullPage: true });
    await ctx.close();
  }
  {
    detailAktif = DETAIL_SELESAI;
    const { ctx, p } = await bukaSebagai('pemohon', 'p/pm2', { viewport: { width: 390, height: 844 } });
    const luber = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    cek('halaman detail tidak meluber di HP', luber);
    await p.screenshot({ path: path.join(LUAR, 'media-hp-detail.png'), fullPage: true });
    await ctx.close();
  }

  console.log('\n=== G2. BENTUK UI: DIUKUR, BUKAN DILIHAT SEKILAS ===');
  /* Tiga kekeliruan di bawah ini pernah benar-benar terjadi sekaligus di satu
     modal, dan tidak satu pun menimbulkan galat:

       - input{width:100%} di styles.css juga mengenai kotak centang, jadi
         kotaknya terukur 413px dan tulisan di sebelahnya tinggal 97px lalu
         patah dua baris;
       - aturan proporsi kartu KPI dashboard utama (1.24fr/1fr/1fr/0.84fr,
         ber-!important) ikut mengenai kartu modul ini, jadi empat kartu yang
         isinya setara terukur 297, 239, dan 201 piksel;
       - kartu bidang memakai grid auto-fit, jadi kartu di baris terakhir
         berhenti di tengah dan meninggalkan lubang sampai 236 piksel.

     Ketiganya "terbaca benar" saat kodenya dibaca. Yang menemukan hanya
     getBoundingClientRect. Karena itu yang diperiksa di sini angka, bukan
     ada-tidaknya sebuah kelas. */
  const bentuk = async (p) => p.evaluate(() => {
    const de = document.documentElement;
    const hasil = { meluber: [], kotak: [], kpiBeda: [], angkaBeda: [], bidangSisa: [] };
    document.querySelectorAll('#isi *, .modal-body *').forEach((n) => {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) return;
      let digeser = false;
      for (let a = n.parentElement; a && a !== de; a = a.parentElement) {
        const ax = getComputedStyle(a).overflowX;
        if (ax === 'auto' || ax === 'scroll' || ax === 'hidden') { digeser = true; break; }
      }
      if (!digeser && r.right > de.clientWidth + 1) hasil.meluber.push((n.className || n.tagName) + '@' + Math.round(r.right));
    });
    document.querySelectorAll('input[type=checkbox],input[type=radio]').forEach((c) => {
      const r = c.getBoundingClientRect();
      if (Math.round(r.width) !== 16 || Math.round(r.height) !== 16) hasil.kotak.push([Math.round(r.width), Math.round(r.height)]);
    });
    const perBaris = (induk, ambil) => {
      const baris = {};
      [...induk.children].forEach((c) => {
        const v = ambil(c); if (v === null) return;
        const t = Math.round(c.getBoundingClientRect().top);
        (baris[t] = baris[t] || []).push(v);
      });
      return Object.values(baris);
    };
    document.querySelectorAll('.kpis-v2').forEach((g) => {
      perBaris(g, (c) => Math.round(c.getBoundingClientRect().width))
        .forEach((v) => { if (new Set(v).size > 1) hasil.kpiBeda.push(v); });
    });
    document.querySelectorAll('.md-bidang').forEach((g) => {
      perBaris(g, (c) => { const a = c.querySelector('.md-b-angka'); return a ? Math.round(a.getBoundingClientRect().top) : null; })
        .forEach((v) => { if (new Set(v).size > 1) hasil.angkaBeda.push(v); });
      const anak = [...g.children].filter((c) => c.getBoundingClientRect().width);
      if (anak.length) {
        const gr = g.getBoundingClientRect();
        const atasTerakhir = Math.max(...anak.map((c) => Math.round(c.getBoundingClientRect().top)));
        const akhir = anak.filter((c) => Math.round(c.getBoundingClientRect().top) === atasTerakhir);
        const sisa = Math.round(gr.right - Math.max(...akhir.map((c) => c.getBoundingClientRect().right)));
        if (sisa > 2) hasil.bidangSisa.push(sisa);
      }
    });
    return hasil;
  });

  for (const [peran, lebar] of [['koordinator', 1280], ['koordinator', 390], ['timFoto', 900], ['pemohon', 1600]]) {
    const { ctx, p } = await bukaSebagai(peran, '', { viewport: { width: lebar, height: 900 } });
    const b1 = await bentuk(p);
    cek(peran + ' @' + lebar + ': tidak ada yang melewati tepi layar', b1.meluber.length === 0, b1.meluber);
    cek(peran + ' @' + lebar + ': kartu KPI sebaris sama lebar', b1.kpiBeda.length === 0, b1.kpiBeda);
    cek(peran + ' @' + lebar + ': angka kartu bidang sejajar', b1.angkaBeda.length === 0, b1.angkaBeda);
    cek(peran + ' @' + lebar + ': kartu bidang rapat sampai tepi kanan', b1.bidangSisa.length === 0, b1.bidangSisa);
    await ctx.close();
  }

  {
    const { ctx, p } = await bukaSebagai('koordinator', 'tim');
    await p.click('#tmTambah');
    /* Bukan #tmAkun: lz-ui menggantinya dengan dropdown bertema dan
       menyembunyikan select aslinya, jadi ia tidak pernah 'visible'. */
    await p.waitForSelector('.modal-body .penerima-baris', { timeout: 5000 });
    await p.waitForTimeout(400);
    const b2 = await bentuk(p);
    cek('modal tim: kotak centang berukuran 16x16, tidak melar', b2.kotak.length === 0, b2.kotak);
    const baris = await p.$$eval('.modal-body .penerima-baris', (n) => n.map((l) => {
      const nm = l.querySelector('.pilih-nama'), kt = l.querySelector('.pilih-ket');
      const r = l.getBoundingClientRect();
      return { tinggi: Math.round(r.height),
        namaPotong: nm ? nm.scrollWidth > nm.clientWidth + 1 : null,
        ketPotong: kt ? kt.scrollWidth > kt.clientWidth + 1 : null,
        namaKiri: nm ? Math.round(nm.getBoundingClientRect().left) : null,
        ketKanan: kt ? Math.round(kt.getBoundingClientRect().right) : null,
        barisKanan: Math.round(r.right) };
    }));
    cek('modal tim: tiga baris bidang tergambar', baris.length === 3, baris.length);
    cek('modal tim: tiap baris setinggi satu baris teks, tidak patah dua',
      baris.every((b) => b.tinggi < 44), baris.map((b) => b.tinggi));
    cek('modal tim: nama bidang tidak terpotong', baris.every((b) => b.namaPotong === false), baris);
    cek('modal tim: keterangan jumlah jenis tidak terpotong', baris.every((b) => b.ketPotong === false), baris);
    cek('modal tim: nama semua mulai di kiri yang sama',
      new Set(baris.map((b) => b.namaKiri)).size === 1, baris.map((b) => b.namaKiri));
    cek('modal tim: keterangan semua berakhir di kanan yang sama',
      new Set(baris.map((b) => b.ketKanan)).size === 1, baris.map((b) => b.ketKanan));
    /* Label form memakai pola rumah, jadi ikut berubah kalau tema berubah. */
    const adaFld = await p.$$eval('.modal-body .fld > label', (n) => n.length);
    cek('modal tim: labelnya memakai pola .fld > label milik form rumah', adaFld === 3, adaFld);
    await ctx.close();
  }

  {
    const { ctx, p } = await bukaSebagai('pemohon', 'ajukan');
    const kartu = await p.$$eval('#isi .md-form', (n) => n.length);
    cek('halaman ajukan memakai kartu yang mengikuti lebar, bukan lebar tetap', kartu === 1, kartu);
    const kolom = await p.$$eval('#isi .fgrid .fld', (n) => n.map((f) => f.getAttribute('data-col')));
    cek('field ajukan dibagi kolom, tidak semuanya bertumpuk satu-satu',
      kolom.filter((k) => k === '6').length >= 4, kolom);
    await ctx.close();
  }

  console.log('\n=== H. TIDAK ADA GALAT JS ===');
  cek('tidak ada galat JavaScript sepanjang uji', galat.length === 0, galat.slice(0, 4));

  await b.close();
  server.close();
  console.log('\ntest_media_ui.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); try { server.close(); } catch (_) {} process.exit(1); });
