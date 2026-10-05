/* Kwitansi utama LAZDigital: kuitansi bergaya blanko Lazismu (panel kiri putih berlogo dan teratai jingga, badan formulir
 * bergaris di kanan), digambar di kanvas supaya SATU gambar yang sama dipakai untuk dikirim ke WhatsApp donatur, dilihat di layar,
 * dan dicetak. Tidak memuat pustaka luar dan tidak butuh internet (huruf cadangan dipakai bila Google Fonts tidak ada).
 *
 *   LZKwitansi.gambar(data, setelan)  -> Promise<HTMLCanvasElement>   (1600 x 1238 px)
 *   LZKwitansi.png(data, setelan)     -> Promise<{ dataUrl, base64, tipe, nama }>
 *   LZKwitansi.pesan(data, setelan)   -> teks ucapan terima kasih bawaan untuk WhatsApp
 *   LZKwitansi.baca(data)             -> { zakat, infaq, lainnya, jumlah, melalui } (pemetaan jenis dana ke baris blanko)
 *
 * Model kedua (cetak langsung di printer portable) belum dibuat; sengaja ditunda oleh pemilik.
 * Tata letaknya mengikuti blanko kertas Lazismu yang dirapikan. Fax, REG-ID, dan NPWP sengaja dihapus atas permintaan
 * pemilik. Koordinat dalam satuan 1280 x 990, lalu diskalakan ke kanvas. */
(function () {
  'use strict';
  var K = 1.25, W0 = 1280, H0 = 990;
  var FONT = '"Plus Jakarta Sans","Inter","Segoe UI",Arial,sans-serif';
  var JINGGA = '#f29b3f', JINGGA_TUA = '#ee8a22', TINTA = '#243049', TEKS = '#2b2b2b';
  var BINTANG = new Path2D('M37.364 37.426 C43.726 40.836 51.36 40.836 58.57 35.43 C51.36 30.025 43.726 30.025 37.364 33.435 Z M37.204 33.049 C44.113 30.961 49.512 25.563 50.788 16.643 C41.867 17.919 36.469 23.317 34.382 30.226 Z M33.996 24.204 C37.405 17.543 37.405 9.549 32 2 C26.595 9.549 26.595 17.543 30.004 24.204 Z M29.618 30.226 C27.531 23.317 22.133 17.919 13.212 16.643 C14.488 25.563 19.887 30.961 26.796 33.049 Z M26.636 33.435 C20.274 30.025 12.64 30.025 5.43 35.43 C12.64 40.836 20.274 40.836 26.636 37.426 Z M26.796 37.812 C19.887 39.899 14.488 45.298 13.212 54.218 C22.133 52.942 27.531 47.544 29.618 40.634 Z M30.004 40.794 C26.595 47.156 26.595 54.79 32 62 C37.405 54.79 37.405 47.156 33.996 40.794 Z M34.382 40.634 C36.469 47.544 41.867 52.942 50.788 54.218 C49.512 45.298 44.113 39.899 37.204 37.812 Z');

  function teksAman(v, maks) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, maks || 200); }
  function rpFmt(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function terbilangDari(n) {
    if (typeof window.terbilang === 'function') return window.terbilang(n);
    return '';
  }
  function kapital(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Jenis dana -> baris blanko. Zakat punya baris sendiri. Selain zakat (infak umum/terikat, wakaf, DSKL, ...) langsung
     ditulis namanya sebagai label baris kedua, program/keterangannya di garis sebelahnya. Cara bayar hanya Kas atau Bank. */
  function baca(d) {
    var jenis = teksAman(d.jenisDana, 60), sub = teksAman(d.subJenis, 80), prog = teksAman(d.program, 80);
    var j = jenis.toLowerCase(), bedaSub = sub && sub.toLowerCase() !== j;
    var o = { zakat: null, lain: null, jumlah: Number(d.jumlah) || 0, melalui: '' };
    if (/zakat/.test(j)) o.zakat = { teks: [bedaSub ? sub : '', prog].filter(Boolean).join(' - '), rp: o.jumlah };
    else o.lain = { label: bedaSub ? sub : (jenis || 'Infak'), teks: prog, rp: o.jumlah };
    var m = String(d.metode || '').toLowerCase();
    if (/tunai|cash|kas/.test(m)) o.melalui = 'kas';
    else if (/transfer|bank|qris|rekening|wesel/.test(m)) o.melalui = 'bank';
    return o;
  }

  function bulat(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function kartu(c, x, y, w, h, r, isi, tepi) {
    bulat(c, x, y, w, h, r);
    if (isi) { c.fillStyle = isi; c.fill(); }
    if (tepi) { c.strokeStyle = tepi; c.lineWidth = 1.2; c.stroke(); }
  }
  function tulis(c, t, x, y, font, warna, rata) {
    c.font = font + ' ' + FONT; c.fillStyle = warna; c.textAlign = rata || 'left'; c.textBaseline = 'alphabetic';
    c.fillText(t, x, y);
  }
  /* Tulis satu baris; perkecil hurufnya sampai muat, lalu potong dengan elipsis bila masih terlalu panjang. */
  function muat(c, t, x, y, lebar, berat, ukuran, minimal, warna, rata) {
    t = teksAman(t, 160); if (!t) return;
    var u = ukuran;
    while (u > minimal) { c.font = berat + ' ' + u + 'px ' + FONT; if (c.measureText(t).width <= lebar) break; u -= 1; }
    c.font = berat + ' ' + u + 'px ' + FONT;
    var asli = t;
    while (c.measureText(t).width > lebar && t.length > 4) t = t.slice(0, -2);
    if (t !== asli) t = t.replace(/\s+$/, '') + '…';
    c.fillStyle = warna; c.textAlign = rata || 'left'; c.textBaseline = 'alphabetic';
    c.fillText(t, x, y);
  }
  function eja(c, t, x, y, ukuran, warna, jarak, rata) {
    /* huruf kapital berjarak (label kecil) */
    c.font = '700 ' + ukuran + 'px ' + FONT; c.fillStyle = warna; c.textBaseline = 'alphabetic';
    var lebar = 0, i;
    for (i = 0; i < t.length; i++) lebar += c.measureText(t[i]).width + (i < t.length - 1 ? jarak : 0);
    var x0 = rata === 'center' ? x - lebar / 2 : rata === 'right' ? x - lebar : x;
    c.textAlign = 'left';
    for (i = 0; i < t.length; i++) { c.fillText(t[i], x0, y); x0 += c.measureText(t[i]).width + jarak; }
    return lebar;
  }
  function pecah(c, teks, lebar) {
    var kata = String(teks).split(' '), baris = [], kini = '';
    kata.forEach(function (k) {
      var coba = kini ? kini + ' ' + k : k;
      if (c.measureText(coba).width > lebar && kini) { baris.push(kini); kini = k; } else kini = coba;
    });
    if (kini) baris.push(kini);
    return baris;
  }
  function kelopak(c, x0, y0, x1, y1, lebar, isi) {
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, pj = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / pj * lebar, ny = dx / pj * lebar;
    c.beginPath(); c.moveTo(x0, y0);
    c.quadraticCurveTo(mx + nx, my + ny, x1, y1); c.quadraticCurveTo(mx - nx, my - ny, x0, y0);
    c.closePath(); c.fillStyle = isi; c.fill();
  }
  function bintang(c, x, y, skala, warna) {
    c.save(); c.translate(x, y); c.scale(skala, skala); c.fillStyle = warna; c.fill(BINTANG); c.restore();
  }

  /* ===== Gaya blanko asli Lazismu, dirapikan: panel kiri putih dengan teratai jingga, badan formulir bergaris ===== */
  var PANEL = 335, TINTA_PENA = '#2b2b2b', LABEL = '#3b3b3b', GRS = '#9a9a9a';

  function garis(c, x0, y, x1, warna, tebal) {
    c.fillStyle = warna || GRS; c.fillRect(x0, y, x1 - x0, tebal || 1.3);
  }
  /* isian "tulisan tangan": warna tinta pena, mengecil bila tidak muat */
  function isi(c, t, x, y, lebar, ukuran, berat) {
    muat(c, t, x, y, lebar, berat || 600, ukuran || 22, 12, TINTA_PENA);
  }

  function teratai(c, hias) {
    if (hias && hias.width) {
      /* gambar kelopak dari pemilik, menempel di pojok kiri bawah */
      var w = 461, h = w * hias.height / hias.width;
      c.drawImage(hias, 0, H0 - h, w, h);
      return;
    }
    /* teratai di kiri bawah seperti blanko: kelopak belakang pucat, depan lebih pekat, lalu gelombang dasar */
    var ax = 175, ay = 1005;
    c.save(); c.beginPath(); c.rect(0, 0, 440, H0); c.clip();
    function kelopakSudut(sudut, panjang, lebar, warna) {
      var r = sudut * Math.PI / 180;
      kelopak(c, ax, ay, ax + Math.sin(r) * panjang, ay - Math.cos(r) * panjang, lebar, warna);
    }
    var pucat = 'rgba(253,224,184,.95)', sedang = 'rgba(251,203,137,.92)', pekat = 'rgba(248,178,96,.92)';
    kelopakSudut(-62, 290, 95, pucat);
    kelopakSudut(58, 255, 90, pucat);
    kelopakSudut(-33, 350, 105, pucat);
    kelopakSudut(33, 320, 100, pucat);
    kelopakSudut(0, 385, 105, sedang);
    kelopakSudut(-48, 270, 85, sedang);
    kelopakSudut(48, 270, 85, sedang);
    kelopakSudut(-17, 310, 88, pekat);
    kelopakSudut(17, 300, 88, pekat);
    c.restore();
    /* gelombang dasar jingga */
    var b = c.createLinearGradient(0, 790, 0, H0);
    b.addColorStop(0, '#F7A548'); b.addColorStop(1, '#EE8A22');
    c.beginPath();
    c.moveTo(0, 812);
    c.bezierCurveTo(120, 780, 260, 780, 360, 818);
    c.bezierCurveTo(420, 842, 448, 900, 452, H0);
    c.lineTo(0, H0); c.closePath();
    c.fillStyle = b; c.fill();
  }

  function gambarPanel(c, s) {
    var lembaga = teksAman(s.namaLembaga, 80);
    var daerah = teksAman((s.singkatan || lembaga).replace(/^\s*laz(is)?mu\s*/i, '').replace(/^daerah\s+/i, ''), 24).toLowerCase() || 'bantul';
    var cx = 168;
    /* garis pemisah tegak */
    c.fillStyle = '#7a7a7a'; c.fillRect(PANEL, 28, 1.4, 600);

    var logo = s.__logoImg;
    if (logo && logo.width) {
      var r = Math.min(240 / logo.width, 150 / logo.height);
      c.drawImage(logo, cx - logo.width * r / 2, 150 - logo.height * r / 2, logo.width * r, logo.height * r);
    } else {
      bintang(c, cx + 34, 62, 1.2, JINGGA);
      c.font = '700 60px ' + FONT;
      var a = 'lazis', b = 'mu', wa = c.measureText(a).width, wb = c.measureText(b).width, x0 = cx - (wa + wb) / 2;
      tulis(c, a, x0, 182, '700 60px', '#3a3a3a'); tulis(c, b, x0 + wa, 182, '700 60px', JINGGA);
      tulis(c, daerah, cx, 218, '500 30px', '#4a4a4a', 'center');
    }

    garis(c, 32, 256, 304, '#555', 1.4);
    var legal = String(s.kwSk || SK_BAWAAN).split(/\n/).map(function (x) { return teksAman(x, 50); }).filter(Boolean).slice(0, 5);
    var y = 282;
    legal.forEach(function (t, i) { tulis(c, t, cx, y, (i === 0 ? '700' : '500') + ' 13.5px', '#333', 'center'); y += 19; });
    y += 4;
    garis(c, 32, y, 304, '#555', 1.4);
    y += 26;
    var kantor = 'Kantor ' + ((lembaga || 'Lazismu Daerah Bantul').replace(/^lembaga amil zakat\s*/i, ''));
    muat(c, kantor, cx, y, 270, 700, 13.5, 10, '#333', 'center');
    var alamat = teksAman(s.alamat || 'Jl. Urip Sumoharjo No.4A, Bejen, Bantul, Bantul, Daerah Istimewa Yogyakarta 55711', 200);
    c.font = '500 12.5px ' + FONT;
    pecah(c, alamat, 268).slice(0, 3).forEach(function (t) { y += 18; tulis(c, t, cx, y, '500 12.5px', '#444', 'center'); });
    if (s.telepon) { y += 18; tulis(c, 'Hp: ' + teksAman(s.telepon, 30), cx, y, '500 12.5px', '#444', 'center'); }
    if (s.email) { y += 18; muat(c, 'Email: ' + teksAman(s.email, 60), cx, y, 270, 500, 12.5, 9, '#444', 'center'); }
    if (s.website) { y += 18; tulis(c, teksAman(s.website, 50), cx, y, '700 12.5px', '#333', 'center'); }
    y += 14;
    garis(c, 32, y, 304, '#555', 1.4);

    teratai(c, s.__hias);
    var doa = pecah((c.font = '500 12.5px ' + FONT, c), 'Yā Allah, limpahkanlah pahala kepada mereka atas apa yang telah mereka keluarkan, jadikanlah sebagai penyuci bagi mereka, dan berkahilah sisa harta mereka.', 262);
    doa.forEach(function (t, i) { tulis(c, t, 148, 886 + i * 19, '500 12.5px', '#ffffff', 'center'); });
  }

  function gambarBadan(c, d, s, o) {
    var X = 368, XR = 1232, XL = 552;       /* XL: awal isian sesudah titik dua */
    var pending = String(d.statusBayar || '') === 'Pending';

    /* judul */
    tulis(c, 'KUITANSI', XR, 112, '800 66px', '#363636', 'right');

    /* nomor dan tanggal */
    tulis(c, 'Nomor :', X, 176, '500 20px', LABEL);
    muat(c, d.noKwitansi || '', X + 84, 177, 380, 800, 28, 16, '#222');
    var tg = String(d.tanggal || '').slice(0, 10).split('-'), dd = tg[2] || '', mm = tg[1] || '', yy = (tg[0] || '').slice(-2);
    var kx = XR - 3 * 64 - 2 * 16;
    tulis(c, 'Tanggal :', kx - 10, 176, '500 20px', LABEL, 'right');
    [dd, mm, yy].forEach(function (v, i) {
      var x = kx + i * 80;
      for (var k = 0; k < 2; k++) {
        bulat(c, x + k * 32, 148, 30, 38, 4); c.strokeStyle = '#555'; c.lineWidth = 1.4; c.stroke();
        tulis(c, v.charAt(k) || '', x + k * 32 + 15, 176, '700 23px', TINTA_PENA, 'center');
      }
      if (i < 2) tulis(c, '/', x + 72, 180, '500 26px', '#555', 'center');
    });

    /* basmalah */
    tulis(c, 'Bismillaahirrahmaanirrahiim', (X + XR) / 2, 228, '500 20px', LABEL, 'center');

    /* identitas penyetor */
    tulis(c, 'Dengan ini, Saya', X, 272, '700 20px', LABEL);
    var barisIsian = function (label, y, nilai, ukuran) {
      tulis(c, label, X, y, '500 20px', LABEL); tulis(c, ':', XL - 16, y, '500 20px', LABEL);
      garis(c, XL, y + 6, XR); isi(c, nilai, XL + 8, y + 1, XR - XL - 16, ukuran || 23);
    };
    barisIsian('Nama', 314, d.namaDonatur, 25);
    barisIsian('Alamat', 356, d.alamat);
    barisIsian('Telepon/Hp', 398, d.telepon);

    /* menunaikan, dan cara bayar di baris yang sama */
    tulis(c, 'Menunaikan', X, 452, '700 20px', LABEL);
    var RX = 700, RE = 1048;
    var barisDana = function (label, y, entri, adaLabel) {
      var ket;
      if (label) {
        c.font = '500 20px ' + FONT;
        var lw = Math.min(c.measureText(label).width, 250);
        muat(c, label, X, y, 250, adaLabel ? 700 : 500, 20, 14, LABEL);
        ket = X + lw + 12;
      } else ket = X;
      garis(c, ket, y + 6, RX - 14);
      if (entri && entri.teks) {
        var lb = RX - 22 - ket;
        c.font = '600 16px ' + FONT;
        if (c.measureText(entri.teks).width <= lb) isi(c, entri.teks, ket + 4, y + 1, lb, 16, 600);
        else {
          c.font = '600 13px ' + FONT;
          var dua = pecah(c, entri.teks, lb);
          isi(c, dua[0], ket + 4, y - 15, lb, 13, 600);
          isi(c, dua.slice(1).join(' '), ket + 4, y + 1, lb, 13, 600);
        }
      }
      tulis(c, ': Rp.', RX, y, '500 20px', LABEL);
      garis(c, RX + 56, y + 6, RE);
      if (entri) isi(c, rpFmt(entri.rp), RX + 66, y + 1, RE - RX - 76, 24, 700);
    };
    barisDana('Zakat', 498, o.zakat, !!o.zakat);
    barisDana(o.lain ? o.lain.label : '', 544, o.lain, !!o.lain);

    /* melalui: Kas atau Bank (nama bank dan 3 angka terakhir rekening langsung di sebelahnya) */
    var mx = 700;
    tulis(c, 'Melalui :', mx, 452, '700 20px', LABEL);
    var kotakPilih = function (x, aktif) {
      bulat(c, x, 428, 30, 30, 4); c.strokeStyle = '#555'; c.lineWidth = 1.4; c.stroke();
      if (aktif) {
        c.strokeStyle = TINTA_PENA; c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath();
        c.moveTo(x + 6, 443); c.lineTo(x + 13, 451); c.lineTo(x + 26, 432); c.stroke(); c.lineCap = 'butt';
      }
    };
    kotakPilih(mx + 100, o.melalui === 'kas');
    tulis(c, 'Kas', mx + 140, 452, '500 20px', LABEL);
    var bx = mx + 215;
    kotakPilih(bx, o.melalui === 'bank');
    var bank = teksAman(d.bank, 40), nama = 'Bank';
    if (o.melalui === 'bank' && bank) nama = (/^bank\b/i.test(bank) ? '' : 'Bank ') + bank;
    var akhir = String(d.rekeningAkhir || '').replace(/\D/g, '').slice(-3);
    if (o.melalui === 'bank' && akhir) nama += ' (***' + akhir + ')';
    muat(c, nama, bx + 40, 452, XR - bx - 40, 500, 20, 12, LABEL);
    if (pending) {
      c.save(); c.translate(RE + 38, 618); c.rotate(-0.1);
      bulat(c, 0, -28, 140, 40, 6); c.strokeStyle = '#d33'; c.lineWidth = 2.6; c.stroke();
      tulis(c, 'PENDING', 70, 0, '800 21px', '#d33', 'center'); c.restore();
    }

    /* jumlah: pita lembut */
    var yj = 612;
    bulat(c, RX - 90, yj - 32, RE - RX + 102, 46, 10); c.fillStyle = '#FFF2E3'; c.fill();
    tulis(c, 'Jumlah', RX - 76, yj, '700 20px', LABEL);
    tulis(c, ': Rp.', RX, yj, '700 20px', LABEL);
    isi(c, rpFmt(o.jumlah), RX + 66, yj + 1, RE - RX - 76, 28, 800);

    /* terbilang */
    var yb = 674;
    tulis(c, 'Terbilang', X, yb, '500 20px', LABEL); tulis(c, ':', XL - 16, yb, '500 20px', LABEL);
    garis(c, XL, yb + 6, XR); garis(c, XL, yb + 42, XR);
    var tb = kapital(terbilangDari(o.jumlah)) + (o.jumlah ? ' rupiah' : '');
    c.font = '600 22px ' + FONT;
    var bt = pecah(c, tb, XR - XL - 20);
    c.fillStyle = TINTA_PENA; c.textAlign = 'left';
    if (bt[0]) c.fillText(bt[0], XL + 8, yb + 1);
    if (bt[1]) c.fillText(bt.slice(1).join(' '), XL + 8, yb + 37);

    /* tanda tangan: penerima di kiri, penyetor di kanan, "TTD" di atas tiap nama; cap lembaga ditumpuk di atas TTD dan nama penerima */
    var pcx = 680, scx = 1060, yt = 738;
    tulis(c, 'Penerima,', pcx, yt + 30, '600 19px', LABEL, 'center');
    tulis(c, 'Penyetor,', scx, yt + 30, '600 19px', LABEL, 'center');
    [[pcx, penerima(d)], [scx, d.namaDonatur]].forEach(function (t) {
      eja(c, 'TTD', t[0], yt + 104, 14, '#8a8a8a', 3, 'center');
      tulis(c, '(', t[0] - 128, yt + 140, '400 24px', LABEL, 'center');
      tulis(c, ')', t[0] + 128, yt + 140, '400 24px', LABEL, 'center');
      garis(c, t[0] - 116, yt + 144, t[0] + 116, '#666');
      muat(c, t[1] || '', t[0], yt + 138, 226, 600, 20, 11, TINTA_PENA, 'center');
    });
    cap(c, s, pcx - 52, yt + 112, 214, 116);

    /* pemeriksaan keaslian */
    var url = d.__verifikasi || '';
    if (url) muat(c, 'Periksa keaslian: ' + url, XR, 983, 520, 500, 11.5, 9, '#888', 'right');
  }
  /* Penerima = fundraiser yang mencatat penghimpunan. Bila tidak ada fundraiser perorangan (kosong, "-", "Tanpa
     fundraising", atau atas nama kantor/lembaga/muzakki sendiri), dipakai nama petugas yang menginput. */
  function penerima(d) {
    var fr = teksAman(d.fundraising, 60);
    if (fr && !/^(-|tanpa fundraising|muzakki|kantor|daerah)$/i.test(fr) && !/^lazismu\b|^lembaga\b/i.test(fr)) return fr;
    return teksAman(d.petugas, 60);
  }
  /* Cap kotak bergaya stempel: bingkai ganda membulat, lambang dan nama lembaga di dalamnya; miring sedikit dan
     samar seperti cap sungguhan. Pusatnya (x, y), ukuran w x h. */
  function cap(c, s, x, y, w, h) {
    c.save(); c.translate(x, y); c.rotate(-0.05); c.globalAlpha = 0.6;
    bulat(c, -w / 2, -h / 2, w, h, 8); c.strokeStyle = '#555'; c.lineWidth = 2; c.stroke();
    bulat(c, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 5); c.lineWidth = 1; c.stroke();
    c.globalAlpha = 0.3;   /* isi cap lebih samar dari bingkainya supaya nama di bawahnya tetap terbaca */
    var lg = s.__logoImg;
    if (lg && lg.width) {
      var rl = Math.min((w * 0.7) / lg.width, (h * 0.62) / lg.height);
      c.drawImage(lg, -lg.width * rl / 2, -lg.height * rl / 2, lg.width * rl, lg.height * rl);
    } else {
      bintang(c, -10, -h / 2 + 11, 0.32, JINGGA_TUA);
      c.font = '800 30px ' + FONT;
      var lw = c.measureText('lazis').width, mw = c.measureText('mu').width, lx = -(lw + mw) / 2;
      tulis(c, 'lazis', lx, 10, '800 30px', '#555'); tulis(c, 'mu', lx + lw, 10, '800 30px', JINGGA_TUA);
      tulis(c, daerahDari(s), 0, 30, '600 13px', '#555', 'center');
    }
    c.restore();
  }
  function daerahDari(s) {
    var lembaga = teksAman(s.namaLembaga, 80);
    return teksAman((s.singkatan || lembaga).replace(/^\s*laz(is)?mu\s*/i, '').replace(/^daerah\s+/i, ''), 24).toLowerCase() || 'bantul';
  }

  function muatLogo(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var im = new Image();
      im.onload = function () { ok(im); }; im.onerror = function () { ok(null); };
      im.src = src;
    });
  }
  var HIAS = null;
  function muatHias() {
    /* gambar kelopak di kiri bawah; dimuat sekali, bila gagal dipakai teratai gambar-tangan sebagai cadangan */
    if (HIAS) return Promise.resolve(HIAS);
    return muatLogo('/ikon/kwitansi-hias.png').then(function (im) { if (im) HIAS = im; return im; });
  }
  function tungguHuruf() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var p = Promise.all(['500 20px "Plus Jakarta Sans"', '600 20px "Plus Jakarta Sans"', '700 20px "Plus Jakarta Sans"', '800 20px "Plus Jakarta Sans"']
      .map(function (f) { return document.fonts.load(f).catch(function () {}); }));
    return Promise.race([p, new Promise(function (r) { setTimeout(r, 1200); })]);
  }

  function gambar(data, setelan) {
    var d = data || {}, s = Object.assign({}, setelan || {});
    return Promise.all([tungguHuruf(), muatLogo(s.logoData || ''), muatHias()]).then(function (h) {
      s.__logoImg = h[1]; s.__hias = h[2];
      var cv = document.createElement('canvas');
      cv.width = Math.round(W0 * K); cv.height = Math.round(H0 * K);
      var c = cv.getContext('2d');
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
      c.scale(K, K);
      c.lineJoin = 'round';
      gambarPanel(c, s);
      gambarBadan(c, d, s, baca(d));
      return cv;
    });
  }

  function png(data, setelan) {
    return gambar(data, setelan).then(function (cv) {
      var url = cv.toDataURL('image/png');
      var aman = String((data && data.noKwitansi) || 'kwitansi').replace(/[^A-Za-z0-9._-]+/g, '-');
      return { dataUrl: url, base64: url.replace(/^data:[^,]*,/, ''), tipe: 'image/png', nama: 'Kwitansi-' + aman + '.png' };
    });
  }

  /* Ucapan terima kasih. Teksnya bisa diubah di Pengaturan > Identitas Lembaga (setelan kwPesan); {nama}, {jumlah},
     {jenis}, {nomor}, {lembaga}, {tanggal} diisi di sini supaya petugas melihat teks akhirnya di popup. */
  var TEMPLATE_BAWAAN = 'Assalamu\'alaikum warahmatullahi wabarakatuh.\n\n'
    + 'Yth. Bapak/Ibu {nama},\n\n'
    + 'Jazakumullahu khairan katsiran atas {jenis} sebesar Rp {jumlah} yang telah Bapak/Ibu tunaikan melalui {lembaga}. Semoga Allah menerima amal kebaikan Bapak/Ibu, membersihkan dan menyucikan harta, serta melipatgandakan keberkahannya.\n\n'
    + 'Berikut kami lampirkan kwitansi nomor {nomor} sebagai bukti penerimaan.\n\n'
    + 'Catatan penghimpunan kami terbuka untuk umum dan diperbarui langsung: {link}\n\n'
    + 'Wassalamu\'alaikum warahmatullahi wabarakatuh.\n{lembaga}';
  var SK_BAWAAN = 'Lembaga Amil Zakat Nasional\nSK. Menteri Agama RI\nNo. 463 Tahun 2024\nTanggal 26 Juli 2024';
  function pesan(data, setelan) {
    var d = data || {}, s = setelan || {};
    var lembaga = teksAman(s.namaLembaga, 80) || 'LAZISMU';
    var jenis = teksAman(d.subJenis || d.jenisDana, 60);
    var isi = {
      nama: teksAman(d.namaDonatur, 80) || 'Donatur',
      jumlah: rpFmt(d.jumlah),
      jenis: jenis ? jenis.toLowerCase() : 'donasi',
      nomor: teksAman(d.noKwitansi, 40),
      lembaga: lembaga,
      tanggal: teksAman(d.tanggal, 10)
    };
    var t = String(s.kwPesan || '').trim() || TEMPLATE_BAWAAN;
    isi.link = teksAman(s.__linkDonatur, 300);
    /* Tanpa link aktif, kalimat yang memuat {link} dibuang seluruhnya (beserta baris kosong sesudahnya). */
    if (!isi.link) t = t.replace(/(^|\n)[^\n]*\{link\}[^\n]*\n*/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
    return t.replace(/\{(nama|jumlah|jenis|nomor|lembaga|tanggal|link)\}/g, function (_, k) { return isi[k]; });
  }

  window.LZKwitansi = { gambar: gambar, png: png, pesan: pesan, baca: baca, rp: rpFmt, templateBawaan: TEMPLATE_BAWAAN, skBawaan: SK_BAWAAN };
})();
