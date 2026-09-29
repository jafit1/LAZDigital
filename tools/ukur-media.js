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


/* ===================== ALAT UKUR (bukan uji lulus/gagal) ===================== */
const LEBAR = [390, 600, 768, 900, 1024, 1280, 1600];

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(LUAR, { recursive: true });
  const b = await chromium.launch(CHROMIUM);

  async function buka(peran, rute, w) {
    peranAktif = peran;
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => { try { localStorage.setItem('laz_token','uji'); localStorage.setItem('laz_theme','light'); } catch(_){} });
    await p.goto(A + '/media.html' + (rute ? '#' + rute : ''));
    await p.waitForSelector('#appView:not(.hidden)', { timeout: 15000 });
    await p.waitForTimeout(450);
    return { ctx, p };
  }

  const UKUR = () => {
    const out = { meluber: [], potong: [], kecil: [], kotak: [], kolom: {}, sisa: {} };
    const de = document.documentElement;
    out.scrollX = de.scrollWidth - de.clientWidth;
    const isi = document.getElementById('isiHalaman') || document.getElementById('isi');
    out.isiW = isi ? Math.round(isi.getBoundingClientRect().width) : 0;

    document.querySelectorAll('#isi *, .modal-body *').forEach((n) => {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) return;
      /* Elemen di dalam kotak yang memang bisa digeser (tabel lebar di HP)
         bukan kebocoran: yang bocor adalah yang melewati tepi layar tanpa
         satu pun induk yang bisa menggesernya. */
      let bisaDigeser = false;
      for (let a = n.parentElement; a && a !== de; a = a.parentElement) {
        const ax = getComputedStyle(a).overflowX;
        if (ax === 'auto' || ax === 'scroll' || ax === 'hidden') { bisaDigeser = true; break; }
      }
      if (!bisaDigeser && r.right > de.clientWidth + 1) out.meluber.push((n.className || n.tagName) + ' @' + Math.round(r.right));
      const cs = getComputedStyle(n);
      const adaTeks = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (adaTeks && cs.overflow !== 'visible' && n.scrollWidth > n.clientWidth + 1) {
        out.potong.push({ k: (n.className || n.tagName).toString().slice(0, 40),
          t: n.textContent.trim().slice(0, 28), s: n.scrollWidth, c: n.clientWidth });
      }
    });
    document.querySelectorAll('input[type=checkbox],input[type=radio]').forEach((c) => {
      const r = c.getBoundingClientRect();
      if (Math.round(r.width) !== 16 || Math.round(r.height) !== 16) out.kotak.push([Math.round(r.width), Math.round(r.height)]);
    });
    const grid = (sel) => {
      const g = document.querySelector(sel); if (!g) return null;
      const anak = [...g.children].filter((c) => c.getBoundingClientRect().width);
      if (!anak.length) return null;
      const gr = g.getBoundingClientRect();
      const baris = {};
      anak.forEach((c) => { const r = c.getBoundingClientRect(); (baris[Math.round(r.top)] = baris[Math.round(r.top)] || []).push(r); });
      const kunci = Object.keys(baris);
      const akhir = baris[kunci[kunci.length - 1]];
      const kananTerakhir = Math.max(...akhir.map((r) => r.right));
      return { n: anak.length, perBaris: kunci.map((k) => baris[k].length),
        lebarWadah: Math.round(gr.width),
        sisaKanan: Math.round(gr.right - kananTerakhir),
        lebarKartu: [...new Set(anak.map((c) => Math.round(c.getBoundingClientRect().width)))] };
    };
    out.kolom.kpi = grid('.kpis-v2');
    out.kolom.dgrid = grid('.dgrid');
    out.kolom.bidang = grid('.md-bidang');
    out.kolom.fgrid = grid('.fgrid');
    /* Angka di kartu bidang harus sebaris dengan tetangganya. */
    out.angkaTidakSejajar = [];
    document.querySelectorAll('.md-bidang').forEach((g) => {
      const baris = {};
      [...g.children].forEach((c) => {
        const a = c.querySelector('.md-b-angka'); if (!a) return;
        const t = Math.round(c.getBoundingClientRect().top);
        (baris[t] = baris[t] || []).push(Math.round(a.getBoundingClientRect().top));
      });
      Object.values(baris).forEach((v) => { if (new Set(v).size > 1) out.angkaTidakSejajar.push(v); });
    });
    /* Kartu KPI sebaris harus sama lebar. */
    out.kpiTidakSama = [];
    document.querySelectorAll('.kpis-v2').forEach((g) => {
      const baris = {};
      [...g.children].forEach((c) => { const r = c.getBoundingClientRect(); (baris[Math.round(r.top)] = baris[Math.round(r.top)] || []).push(Math.round(r.width)); });
      Object.values(baris).forEach((v) => { if (new Set(v).size > 1) out.kpiTidakSama.push(v); });
    });
    return out;
  };

  const cetak = (tajuk, u) => {
    console.log('\n' + tajuk);
    console.log('   scrollX=' + u.scrollX + '  isiW=' + u.isiW +
      '  meluber=' + u.meluber.length + '  potong=' + u.potong.length +
      '  kotakSalahUkur=' + u.kotak.length +
      '  angkaTidakSejajar=' + u.angkaTidakSejajar.length +
      '  kpiTidakSama=' + u.kpiTidakSama.length);
    for (const k of ['kpi', 'dgrid', 'bidang', 'fgrid']) {
      const g = u.kolom[k]; if (!g) continue;
      console.log('   ' + k.padEnd(7) + ' wadah=' + String(g.lebarWadah).padStart(4) +
        ' kartu/baris=[' + g.perBaris.join(',') + ']' +
        ' lebarKartu=[' + g.lebarKartu.join(',') + ']' +
        ' sisaKanan=' + g.sisaKanan);
    }
    u.potong.slice(0, 6).forEach((x) => console.log('      POTONG ' + x.k + ' "' + x.t + '" ' + x.c + '<' + x.s));
    u.meluber.slice(0, 6).forEach((x) => console.log('      MELUBER ' + String(x).slice(0, 60)));
  };

  for (const peran of ['pemohon', 'timFoto', 'koordinator']) {
    for (const w of LEBAR) {
      const { ctx, p } = await buka(peran, '', w);
      cetak('### DASHBOARD ' + peran + ' @' + w, await p.evaluate(UKUR));
      await ctx.close();
    }
  }

  console.log('\n\n============ FORM AJUKAN ============');
  for (const w of LEBAR) {
    const { ctx, p } = await buka('pemohon', 'ajukan', w);
    cetak('### AJUKAN @' + w, await p.evaluate(UKUR));
    if (w === 1280) await p.screenshot({ path: path.join(LUAR, 'ukur-ajukan.png'), fullPage: true });
    await ctx.close();
  }

  console.log('\n\n============ MODAL TIM MEDIA ============');
  for (const w of LEBAR) {
    const { ctx, p } = await buka('koordinator', 'tim', w);
    await p.click('#tmTambah');
    await p.waitForTimeout(600);
    cetak('### MODAL TIM @' + w, await p.evaluate(UKUR));
    if (w === 1280 || w === 390) await p.screenshot({ path: path.join(LUAR, 'ukur-modal-' + w + '.png') });
    await ctx.close();
  }

  console.log('\n\n============ BILAH SARING (daftar) ============');
  for (const w of LEBAR) {
    const { ctx, p } = await buka('koordinator', 'daftar', w);
    cetak('### DAFTAR @' + w, await p.evaluate(UKUR));
    await ctx.close();
  }

  await b.close(); server.close();
})();
