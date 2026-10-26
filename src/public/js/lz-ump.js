/* js/lz-ump.js: logika Pengajuan UMP Kantor Layanan (halaman /ump.html).
 *
 * Permintaan pemilik (26 Oktober 2026): fitur tersendiri bagi Kantor Layanan
 * untuk membuat pengajuan UMP, mengisi rincian yang diajukan, dan hasil akhirnya
 * berupa PDF. Penyimpanan TIDAK ke server: isian ikut penyimpanan browser
 * (localStorage) masing-masing Kantor Layanan. Acuan: UMP.pdf, dua formulir
 * yang bisa diajukan sendiri-sendiri:
 *   F-08-C  usulan pendistribusian infak tidak terikat (non amil) skema UMP,
 *           per pilar, dengan kolom jumlah dan asnaf.
 *   F-08-D  pengajuan operasional KLL, sembilan baris biaya.
 * Rekening tujuan: VA BPD DIY Syariah (pilihan teratas, nomornya dikonfirmasi
 * keuangan lewat WhatsApp, jadi tidak diisi) atau rekening lain yang ditulis.
 * Tanda tangan pemohon: basah (ditandatangani di kertas) atau digital
 * (digambar di layar atau foto yang latar putihnya dihapus otomatis).
 *
 * Kertasnya digambar di kanvas lalu dirakit LZPdf, jadi PDF langsung menjadi
 * berkas yang bisa disimpan atau dibagikan ke WhatsApp, sama di semua perangkat,
 * tanpa dialog cetak. Berkas ini tanpa DOM dan tanpa jaringan: kanvas diberikan
 * pemanggil, sehingga semua bisa diuji di Node dengan kanvas tiruan. */
(function (akar) {
  'use strict';
  if (akar.LZUmp) return;

  var KUNCI = 'laz_ump_v1';
  /* Batas atas sepuluh miliar: UMP kantor layanan jauh di bawahnya, dan angka
     lebih panjang membuat kolom jumlah di kertas membungkus. */
  var MAKS_RP = 9999999999;
  var PANJANG = { kll: 60, bank: 60, rekening: 30, atasNama: 60, pemohon: 60, asnaf: 30, rincian: 48 };
  /* Gambar tanda tangan sudah dipangkas dan diperkecil (paling besar 600 x 240),
     PNG-nya biasanya di bawah 60 KB. Yang lebih besar dari ini bukan buatan halaman. */
  var MAKS_TTD = 400000;
  var PILAR = ['Ekonomi', 'Pendidikan', 'Kesehatan', 'Kelembagaan', 'Kemanusiaan', 'Keagamaan', 'Sosial Dakwah', 'Lingkungan'];
  var BIAYA = ['Biaya Pegawai', 'Biaya Sosialisasi, Kajian Rapat Kerja', 'Biaya Tali (Tlp, Air, Listrik)', 'Biaya Perjalanan Dinas',
    'Biaya Administrasi Umum', 'ATK dan Perlengkapan Kantor', 'Biaya Rapat & Konsumsi', 'BBM Amil', 'Operasional Kendaraan Amil'];
  var ASNAF = ['Fakir', 'Miskin', 'Amil', 'Muallaf', 'Riqab', 'Gharimin', 'Fi Sabilillah', 'Ibnu Sabil'];
  var BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var VA_BANK = 'BPD DIY Syariah';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Teks isian: karakter kontrol dibuang, spasi dirapikan, panjang dibatasi. */
  function potong(s, n) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  }
  /* Nominal: hanya angka yang dibaca ("1.500.000" dan "1500000" sama), bulat, 0 sampai MAKS_RP. */
  function angka(v) {
    var t = String(v == null ? '' : v);
    var n = typeof v === 'number' ? v : (/^\s*-/.test(t) ? -1 : Number(t.replace(/[^\d]/g, '')));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(Math.round(n), MAKS_RP);
  }
  function fmt(n) { return String(angka(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function sahTanggal(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
    if (!m) return '';
    var y = Number(m[1]), b = Number(m[2]), t = Number(m[3]);
    var d = new Date(Date.UTC(y, b - 1, t));
    if (y < 2000 || y > 2200 || d.getUTCMonth() !== b - 1 || d.getUTCDate() !== t) return '';
    return m[0];
  }
  function tanggalPanjang(iso) {
    var s = sahTanggal(iso);
    return s ? Number(s.slice(8, 10)) + ' ' + BULAN[Number(s.slice(5, 7))] + ' ' + s.slice(0, 4) : '';
  }
  /* Hanya PNG buatan halaman ini (data URL base64) yang diterima sebagai tanda tangan. */
  function sahTtd(g) {
    g = String(g == null ? '' : g);
    return g.length <= MAKS_TTD && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(g) ? g : '';
  }

  function baru(hari) {
    return {
      profil: { kll: '', tipe: 'KLL', rek: 'va', bank: '', rekening: '', atasNama: '', pemohon: '' },
      form: { c: false, d: false },
      ttd: { jenis: 'basah', cara: 'gambar', gambar: '' },
      tanggal: sahTanggal(hari),
      c: PILAR.map(function () { return { jumlah: 0, asnaf: '', rincian: '' }; }),
      d: BIAYA.map(function () { return { jumlah: 0, rincian: '' }; }),
      gaji: false
    };
  }
  function obj(v) { return (v && typeof v === 'object') ? v : {}; }
  /* Apa pun yang masuk (isian layar, isi penyimpanan yang mungkin rusak atau
     diubah tangan) dijadikan bentuk yang sah sebelum dipakai. */
  function bersihkan(s) {
    var b = baru(''), x = obj(s), p = obj(x.profil), f = obj(x.form), t = obj(x.ttd);
    ['kll', 'bank', 'rekening', 'atasNama', 'pemohon'].forEach(function (k) { b.profil[k] = potong(p[k], PANJANG[k]); });
    b.profil.tipe = p.tipe === 'ULL' ? 'ULL' : 'KLL';
    b.profil.rek = p.rek === 'manual' ? 'manual' : 'va';
    b.form.c = f.c === true; b.form.d = f.d === true;
    b.ttd.jenis = t.jenis === 'digital' ? 'digital' : 'basah';
    b.ttd.cara = t.cara === 'unggah' ? 'unggah' : 'gambar';
    b.ttd.gambar = sahTtd(t.gambar);
    b.tanggal = sahTanggal(x.tanggal);
    b.c.forEach(function (r, i) {
      var y = obj(Array.isArray(x.c) ? x.c[i] : null);
      r.jumlah = angka(y.jumlah); r.asnaf = potong(y.asnaf, PANJANG.asnaf); r.rincian = potong(y.rincian, PANJANG.rincian);
    });
    b.d.forEach(function (r, i) {
      var y = obj(Array.isArray(x.d) ? x.d[i] : null);
      r.jumlah = angka(y.jumlah); r.rincian = potong(y.rincian, PANJANG.rincian);
    });
    b.gaji = x.gaji === true;
    return b;
  }
  function total(baris) {
    var t = 0;
    (baris || []).forEach(function (r) { t += angka(r && r.jumlah); });
    return t;
  }
  /* "KLL Pajangan" untuk kop, "Kantor Layanan Lazismu" untuk kalimat. */
  function labelKantor(p) { return (p.tipe === 'ULL' ? 'ULL ' : 'KLL ') + p.kll; }
  function sebutKantor(p) { return (p.tipe === 'ULL' ? 'Unit Layanan' : 'Kantor Layanan') + ' Lazismu'; }
  function dipilih(s) { return ['c', 'd'].filter(function (j) { return s.form[j]; }); }

  /* Pemeriksaan sebelum PDF dibuat. Galat per isian (id elemen di layar);
     layar memilah mana yang milik langkah yang sedang dibuka. */
  function periksa(state) {
    var s = bersihkan(state), g = [];
    function salah(id, pesan) { g.push({ id: id, pesan: pesan }); }
    if (!s.profil.kll) salah('u_kantor', 'Kantor layanan belum dipilih.');
    if (!s.form.c && !s.form.d) salah('f_c', 'Pilih minimal satu formulir.');
    if (s.profil.rek === 'manual') {
      if (!s.profil.bank) salah('u_bank', 'Nama bank belum diisi.');
      if (!s.profil.rekening) salah('u_rekening', 'Nomor rekening belum diisi.');
      else if (!/^\d[\d .-]{3,}$/.test(s.profil.rekening)) salah('u_rekening', 'Nomor rekening hanya boleh berisi angka.');
      if (!s.profil.atasNama) salah('u_atasnama', 'Nama pemilik rekening belum diisi.');
    }
    if (!s.profil.pemohon) salah('u_pemohon', 'Nama pemohon belum diisi.');
    if (!s.tanggal) salah('u_tanggal', 'Tanggal pengajuan belum diisi.');
    var tc = total(s.c), td = total(s.d);
    if (s.form.c && !tc) salah('c_0', 'F-08-C: isi jumlah pada minimal satu pilar.');
    if (s.form.d && !td) salah('d_0', 'F-08-D: isi jumlah pada minimal satu biaya.');
    if (s.ttd.jenis === 'digital' && !s.ttd.gambar) salah('ttd', 'Tanda tangan digital belum dibuat. Gambar atau unggah dulu, atau pilih tanda tangan basah.');
    return { galat: g, ada: { c: s.form.c, d: s.form.d }, totalC: tc, totalD: td };
  }

  /* Hapus latar foto tanda tangan. data: RGBA (ImageData.data), diubah di tempat.
     foto=true: kecerahan kertas ditaksir dari median piksel (tinta selalu sedikit),
     yang seterang kertas menjadi bening, yang jauh lebih gelap tetap utuh, di
     antaranya memudar supaya tepi goresan halus. foto=false (goresan di layar):
     latar sudah bening, hanya dipangkas. Mengembalikan kotak goresan atau null. */
  function bersihkanLatar(data, w, h, foto) {
    var n = w * h, i, L;
    if (foto) {
      var hist = new Array(256).fill(0), jml = 0;
      for (i = 0; i < n; i++) if (data[i * 4 + 3] > 200) { hist[Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])]++; jml++; }
      var kertas = 255, kum = 0;
      for (L = 0; L < 256; L++) { kum += hist[L]; if (kum >= jml / 2) { kertas = L; break; } }
      var atas = kertas * 0.85, bawah = kertas * 0.45;
      for (i = 0; i < n; i++) {
        var o = i * 4, lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
        var a = Math.max(0, Math.min(1, (atas - lum) / Math.max(1, atas - bawah)));
        if (a < 0.25) a = 0;
        data[o + 3] = Math.round(data[o + 3] * a);
      }
    }
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  /* ---------------------------------------------------------------- kertas A4 di kanvas
     Satuan tata letak milimeter; pena() mengubahnya ke piksel (sekitar 150 dpi).
     Huruf tidak diperkecil lewat transform kanvas supaya tidak kena batas ukuran
     huruf minimum peramban. */
  var A4 = { w: 210, h: 297, mx: 18, my: 13 };
  var PX_MM = 1240 / 210;
  var PT = 0.3528;
  var HURUF = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
  var HURUF_AR = '"Traditional Arabic", "Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif';
  var SALAM = '\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645 \u0648\u0631\u062d\u0645\u0629 \u0627\u0644\u0644\u0647 \u0648\u0628\u0631\u0643\u0627\u062a\u0647';
  var SALAM_PENUTUP = '\u0648' + SALAM;
  var JUDUL = { c: 'FORMULIR USULAN PENDISTRIBUSIAN INFAK TIDAK TERIKAT (NON AMIL) KLL SEKEMA UMP', d: 'FORMULIR PENGAJUAN OPERASIONAL KLL' };

  function pena(c) {
    var K = PX_MM;
    function font(pt, b, ar) { c.font = (b ? '700 ' : '400 ') + (Math.round(pt * PT * K * 10) / 10) + 'px ' + (ar ? HURUF_AR : HURUF); }
    function lebar(t) { return c.measureText(t).width / K; }
    function lh(pt) { return pt * PT * 1.32; }
    function garis(x1, y1, x2, y2, t) { c.lineWidth = (t || 0.25) * K; c.beginPath(); c.moveTo(x1 * K, y1 * K); c.lineTo(x2 * K, y2 * K); c.stroke(); }
    /* runs: [{ t, b }] atau { br: true }. Kata yang lebih lebar dari kolom dipotong per huruf. */
    function bungkus(runs, w, pt) {
      var baris = [[]], lb = 0;
      function akhir() { return baris[baris.length - 1]; }
      function baru() { var l = akhir(); while (l.length && l[l.length - 1].t === ' ') lb -= l.pop().w; baris.push([]); lb = 0; }
      runs.forEach(function (r) {
        if (r.br) { baru(); return; }
        String(r.t).split(/(\s+)/).forEach(function (k) {
          if (!k) return;
          font(pt, r.b);
          if (/^\s+$/.test(k)) { if (akhir().length) { var sw = lebar(' '); akhir().push({ t: ' ', b: r.b, w: sw }); lb += sw; } return; }
          var kw = lebar(k);
          if (lb + kw > w && akhir().length) baru();
          var sisa = k;
          while (sisa) {
            var n = sisa.length;
            while (n > 1 && lebar(sisa.slice(0, n)) > w - lb) n--;
            var pot = sisa.slice(0, n), pw = lebar(pot);
            akhir().push({ t: pot, b: r.b, w: pw }); lb += pw; sisa = sisa.slice(n);
            if (sisa) baru();
          }
        });
      });
      while (baris.length > 1 && !akhir().length) baris.pop();
      return baris;
    }
    /* Menulis baris hasil bungkus mulai dari tepi atas y. Mengembalikan tinggi. */
    function tulis(baris, x, y, w, pt, rata) {
      var h = lh(pt);
      baris.forEach(function (l, i) {
        var lw = l.reduce(function (a, k) { return a + k.w; }, 0);
        var cx = rata === 'tengah' ? x + (w - lw) / 2 : x;
        l.forEach(function (k) { font(pt, k.b); c.fillText(k.t, cx * K, (y + i * h + h * 0.78) * K); cx += k.w; });
      });
      return baris.length * h;
    }
    function paragraf(runs, x, y, w, pt) { return tulis(bungkus(runs, w, pt), x, y, w, pt); }
    function arab(t, x, y, pt) {
      font(pt, false, true); c.direction = 'rtl'; c.textAlign = 'left';
      c.fillText(t, x * K, (y + lh(pt) * 0.8) * K);
      c.direction = 'ltr';
      return lh(pt) * 1.15;
    }
    return { K: K, c: c, font: font, lebar: lebar, lh: lh, garis: garis, bungkus: bungkus, tulis: tulis, paragraf: paragraf, arab: arab };
  }

  function gambarHalaman(c, state, j, ttd) {
    var s = bersihkan(state), p = periksa(s), P = pena(c), K = P.K;
    var x0 = A4.mx, W = A4.w - 2 * A4.mx, y = A4.my, PAD = 0.9, B = 10.5;
    c.fillStyle = '#000'; c.strokeStyle = '#000'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    var t = function (x) { return [{ t: x }]; }, tb = function (x) { return [{ t: x, b: true }]; };
    function tinggi(runs, w, pt, min) { return Math.max(min || 0, P.bungkus(runs, w - 4, pt).length * P.lh(pt) + PAD * 2); }
    function isi(runs, x, yy, w, h, pt, rata, atas) {
      var bs = P.bungkus(runs, w - 4, pt), th = bs.length * P.lh(pt);
      P.tulis(bs, x + 2, atas ? yy + PAD + 0.6 : yy + (h - th) / 2, w - 4, pt, rata);
    }

    /* Kop: kode, nama formulir, lalu Judul dan KLL. */
    var kc = [22, 30, 16, 5, W - 73], kx = [x0]; kc.forEach(function (w, i) { kx.push(kx[i] + w); });
    var jd = tb(JUDUL[j]), kl = tb(labelKantor(s.profil));
    var r1 = tinggi(jd, kc[4], 10, 7), r2 = tinggi(kl, kc[4], 10, 7), kh = r1 + r2;
    isi(tb(j === 'c' ? 'F-08-C' : 'F-08-D'), kx[0], y, kc[0], kh, B, 'tengah');
    isi([{ t: 'FORMULIR', b: true }, { br: true }, { t: 'PENGAJUAN KLL', b: true }], kx[1], y, kc[1], kh, B);
    isi(t('Judul'), kx[2], y, kc[2], r1, B); isi(tb(':'), kx[3], y, kc[3], r1, B, 'tengah'); isi(jd, kx[4], y, kc[4], r1, 10);
    isi(t('KLL'), kx[2], y + r1, kc[2], r2, B); isi(tb(':'), kx[3], y + r1, kc[3], r2, B, 'tengah'); isi(kl, kx[4], y + r1, kc[4], r2, 10);
    for (var i = 1; i < 5; i++) P.garis(kx[i], y, kx[i], y + kh);
    P.garis(kx[2], y + r1, kx[5], y + r1);
    c.lineWidth = 0.5 * K; c.strokeRect(x0 * K, y * K, W * K, kh * K);
    y += kh + 4;

    P.font(B);
    var lh = P.lh(B);
    P.tulis([[{ t: 'Kepada:', w: 0 }]], x0, y, W, B); y += lh;
    P.tulis([[{ t: 'Yth. Ketua Badan Pengurus LAZISMU Bantul', w: 0 }]], x0, y, W, B); y += lh;
    P.font(B); var dw = P.lebar('Di - ');
    P.tulis([[{ t: 'Di - ', w: dw }, { t: 'Bantul', w: P.lebar('Bantul') }]], x0, y, W, B);
    P.garis(x0 + dw, y + lh * 0.9, x0 + dw + P.lebar('Bantul'), y + lh * 0.9, 0.2); y += lh + 2.5;
    y += P.arab(SALAM, x0, y, 11) + 1;

    var jumlah = j === 'c' ? p.totalC : p.totalD;
    y += P.paragraf([{ t: 'Yang bertanda tangan dibawah ini pelaksana ' + sebutKantor(s.profil) + ' ' }, { t: s.profil.kll, b: true },
      { t: ' dengan ini mengusulkan uang muka program untuk pendistribusian dana ZISKA sebesar ' }, { t: 'Rp. ' + fmt(jumlah), b: true },
      { t: ' dengan rincian sebagai berikut :' }], x0, y, W, B) + 2;

    /* Tabel rincian. */
    var cols = j === 'c' ? [9, W - 106, 50, 47] : [9, W - 59, 50], cx = [x0]; cols.forEach(function (w, k) { cx.push(cx[k] + w); });
    var kepala = j === 'c' ? ['NO', 'PILAR / PROGRAM', 'JUMLAH', 'ASNAF'] : ['NO', 'KETERANGAN', 'JUMLAH'];
    var baris = [{ sel: kepala.map(t), tengah: true, min: 8 }];
    (j === 'c' ? PILAR : BIAYA).forEach(function (n, k) {
      var r = s[j][k], lab = [{ t: n.toUpperCase() }];
      if (r.rincian) lab = lab.concat([{ br: true }, { t: r.rincian, kecil: true }]);
      var sel = [t(String(k + 1)), lab, t(r.jumlah ? 'Rp. ' + fmt(r.jumlah) + ',00' : '')];
      if (j === 'c') sel.push(t(r.asnaf));
      baris.push({ sel: sel, min: 7 });
    });
    var yt = y;
    baris.forEach(function (b) {
      var h = b.min;
      b.sel.forEach(function (runs, k) {
        var kecil = runs.some(function (r) { return r.kecil; });
        var hh = kecil ? (P.lh(B) + P.bungkus(runs.slice(2), cols[k] - 4, 8).length * P.lh(8) + PAD * 2) : tinggi(runs, cols[k], B);
        h = Math.max(h, hh);
      });
      b.sel.forEach(function (runs, k) {
        var tengah = b.tengah || k === 0 || k === 2;
        if (runs.some(function (r) { return r.kecil; })) {
          var bs = P.bungkus(runs.slice(2), cols[k] - 4, 8), th = P.lh(B) + bs.length * P.lh(8), ya = y + (h - th) / 2;
          P.tulis(P.bungkus(runs.slice(0, 1), cols[k] - 4, B), cx[k] + 2, ya, cols[k] - 4, B);
          P.tulis(bs, cx[k] + 2, ya + P.lh(B), cols[k] - 4, 8);
        } else isi(runs, cx[k], y, cols[k], h, B, tengah ? 'tengah' : '');
      });
      P.garis(x0, y + h, x0 + W, y + h);
      y += h;
    });
    cx.forEach(function (x) { P.garis(x, yt, x, y); });
    P.garis(x0, yt, x0 + W, yt);
    y += 3;

    if (j === 'd') {
      y += P.paragraf(t('Bersama ini kami lampirkan :'), x0, y, W, B) + 0.8;
      c.lineWidth = 0.25 * K; c.strokeRect((x0 + 1) * K, y * K, 4 * K, 4 * K);
      if (s.gaji) { c.lineWidth = 0.45 * K; c.beginPath(); c.moveTo((x0 + 1.7) * K, (y + 2.2) * K); c.lineTo((x0 + 2.7) * K, (y + 3.2) * K); c.lineTo((x0 + 4.4) * K, (y + 0.9) * K); c.stroke(); }
      P.tulis(P.bungkus(t('Daftar Gaji'), W, B), x0 + 7, y + 2 - P.lh(B) / 2, W, B);
      y += 6;
    }

    var rek = s.profil.rek === 'manual'
      ? [{ t: 'rekening ' }, { t: labelKantor(s.profil), b: true }, { t: ' ' }, { t: s.profil.bank, b: true }, { t: ' dengan no rekening ' },
        { t: s.profil.rekening, b: true }, { t: ' atas nama ' }, { t: s.profil.atasNama, b: true }]
      : [{ t: 'Virtual Account (VA) ' + VA_BANK, b: true }, { t: ' ' + labelKantor(s.profil) }];
    y += P.paragraf([{ t: 'Untuk memudahkan pelaksanaan pendistribusian dana dapat di transfer melalui ' }].concat(rek), x0, y, W, B) + 2;
    y += P.paragraf(t('Demikian permohonan ini kami sampaikan, atas perkenannya kami sampaikan terimakasih'), x0, y, W, B) + 1.5;
    y += P.arab(SALAM_PENUTUP, x0, y, 11) + 2;

    /* Kotak tanda tangan: kiri rekomendasi/catatan admin, kanan pemohon/admin. */
    var kiri = W / 2, lbW = W * 0.17, isiW = W - kiri - lbW, xk = x0 + kiri, xi = xk + lbW, yt2 = y;
    var rekom = [{ t: 'Rekomendasi (diisi oleh Admin):', b: true }, { br: true }, { t: 'Berdasarkan ketentuan persyaratan dasar, maka permohonan:' }, { br: true },
      { t: 'Diterima/ Tidak diterima', b: true }, { t: ' *) lanjut untuk proses pencairan dana' }, { br: true }, { t: '* coret yang tidak sesuai' }];
    function blok(jdl, nama, kiriRuns, gambarTtd, tgl) {
      var hNama = tinggi(t(nama), isiW, B, 7), hTt = 17, hJd = 6;
      var hKiri = P.bungkus(kiriRuns, kiri - 4, B).length * P.lh(B) + 3;
      hTt = Math.max(hTt, hKiri - hJd - hNama);
      var ya = y;
      isi(kiriRuns, x0, ya, kiri, hJd + hNama + hTt, B, '', true);
      isi(tb(jdl), xk, ya, W - kiri, hJd, B);
      isi(t(jdl === 'Pemohon :' ? 'Nama' : 'Nama :'), xk, ya + hJd, lbW, hNama, B);
      isi(t(nama), xi, ya + hJd, isiW, hNama, B);
      isi(t('Tanda tangan/ Tanggal'), xk, ya + hJd + hNama, lbW, hTt, B);
      var yTt = ya + hJd + hNama;
      if (gambarTtd && gambarTtd.width && gambarTtd.height) {
        var mw = isiW - 4, mh = hTt - 5, sk = Math.min(mw / gambarTtd.width, mh / gambarTtd.height);
        var gw = gambarTtd.width * sk, gh = gambarTtd.height * sk;
        c.drawImage(gambarTtd, (xi + (isiW - gw) / 2) * K, (yTt + 0.8) * K, gw * K, gh * K);
      }
      if (tgl) P.tulis(P.bungkus(t(tgl), isiW - 4, 8.5), xi + 2, yTt + hTt - P.lh(8.5) - 0.8, isiW - 4, 8.5);
      P.garis(xk, ya + hJd, x0 + W, ya + hJd); P.garis(xk, yTt, x0 + W, yTt);
      P.garis(xi, ya + hJd, xi, ya + hJd + hNama + hTt);
      y = ya + hJd + hNama + hTt;
      P.garis(x0, y, x0 + W, y);
    }
    blok('Pemohon :', s.profil.pemohon, rekom, s.ttd.jenis === 'digital' ? ttd : null, tanggalPanjang(s.tanggal));
    blok('Admin :', '', tb('Catatan :'), null, '');
    P.garis(xk, yt2, xk, y);
    c.lineWidth = 0.25 * K; c.strokeRect(x0 * K, yt2 * K, W * K, (y - yt2) * K);
    return y;
  }

  /* Satu kanvas per formulir yang dipilih. Isi yang lebih tinggi dari A4
     (teks sangat panjang) diperkecil seperlunya supaya tetap satu lembar. */
  function halamanKanvas(state, buatKanvas, ttd) {
    var s = bersihkan(state), batas = A4.h - A4.my;
    return dipilih(s).map(function (j) {
      var kv = buatKanvas(Math.round(A4.w * PX_MM), Math.round(A4.h * PX_MM)), c = kv.getContext('2d');
      function gambar(z) {
        c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#fff'; c.fillRect(0, 0, kv.width, kv.height);
        var o = A4.my * PX_MM * (1 - z);
        c.setTransform(z, 0, 0, z, A4.mx * PX_MM * (1 - z), o);
        return gambarHalaman(c, s, j, ttd);
      }
      var bawah = gambar(1);
      if (bawah > batas) gambar((batas - A4.my) / (bawah - A4.my));
      c.setTransform(1, 0, 0, 1, 0, 0);
      return kv;
    });
  }
  function namaBerkas(state) {
    var s = bersihkan(state);
    return ('Pengajuan UMP ' + labelKantor(s.profil) + ' ' + s.tanggal).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() + '.pdf';
  }
  function pesanWa(state) {
    var s = bersihkan(state), p = periksa(s), b = ['Assalamu\'alaikum. Pengajuan UMP ' + labelKantor(s.profil) + ', ' + tanggalPanjang(s.tanggal) + ':'];
    if (p.ada.c) b.push('- F-08-C Usulan UMP Program: Rp ' + fmt(p.totalC));
    if (p.ada.d) b.push('- F-08-D Operasional KLL: Rp ' + fmt(p.totalD));
    b.push('Transfer: ' + (s.profil.rek === 'manual' ? s.profil.bank + ' ' + s.profil.rekening + ' a.n. ' + s.profil.atasNama : 'VA ' + VA_BANK));
    b.push('Pemohon: ' + s.profil.pemohon);
    b.push('Berkas PDF terlampir.');
    return b.join('\n');
  }

  /* ---------------------------------------------------------------- penyimpanan (browser saja) */
  function gudang(g) {
    if (g) return g;
    try { return akar.localStorage || null; } catch (e) { return null; }
  }
  /* Tanggal tidak ikut disimpan: pengajuan baru selalu mulai dari hari ini,
     supaya tanggal pengajuan minggu lalu tidak terbawa diam-diam. */
  function simpan(state, g) {
    var st = gudang(g);
    if (!st) return false;
    var s = bersihkan(state);
    s.tanggal = '';
    try { st.setItem(KUNCI, JSON.stringify(s)); return true; } catch (e) { return false; }
  }
  function muat(g, hari) {
    var st = gudang(g), mentah = null;
    try { mentah = st ? st.getItem(KUNCI) : null; } catch (e) { mentah = null; }
    if (!mentah) return baru(hari);
    try {
      var o = bersihkan(JSON.parse(mentah));
      o.tanggal = sahTanggal(hari);
      return o;
    } catch (e) { return baru(hari); }
  }

  akar.LZUmp = {
    KUNCI: KUNCI, MAKS_RP: MAKS_RP, PANJANG: PANJANG, PILAR: PILAR, BIAYA: BIAYA, ASNAF: ASNAF, VA_BANK: VA_BANK, A4: A4, PX_MM: PX_MM,
    esc: esc, angka: angka, fmt: fmt, sahTanggal: sahTanggal, tanggalPanjang: tanggalPanjang, sahTtd: sahTtd, labelKantor: labelKantor,
    baru: baru, bersihkan: bersihkan, total: total, periksa: periksa, bersihkanLatar: bersihkanLatar,
    gambarHalaman: gambarHalaman, halamanKanvas: halamanKanvas, namaBerkas: namaBerkas, pesanWa: pesanWa, simpan: simpan, muat: muat
  };
})(typeof window !== 'undefined' ? window : this);
