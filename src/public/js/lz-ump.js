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
 *
 * Berkas ini murni logika: tanpa DOM, tanpa jaringan. Satu-satunya panggilan
 * server halaman ini (daftar nama kantor) ada di ump-ui.js dan tidak membawa
 * isian pengajuan. Bagian Admin (nomor, rekomendasi, catatan, tanda tangan
 * admin) dibiarkan kosong: diisi Admin Daerah di kertas. */
(function (akar) {
  'use strict';
  if (akar.LZUmp) return;

  var KUNCI = 'laz_ump_v1';
  /* Batas atas sepuluh miliar: UMP kantor layanan jauh di bawahnya, dan angka
     lebih panjang membuat kolom jumlah di kertas membungkus. */
  var MAKS_RP = 9999999999;
  var PANJANG = { kll: 60, bank: 60, rekening: 30, atasNama: 60, pemohon: 60, asnaf: 30, rincian: 48 };
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

  function baru(hari) {
    return {
      profil: { kll: '', tipe: 'KLL', rek: 'va', bank: '', rekening: '', atasNama: '', pemohon: '' },
      form: { c: false, d: false },
      tanggal: sahTanggal(hari),
      c: PILAR.map(function () { return { jumlah: 0, asnaf: '', rincian: '' }; }),
      d: BIAYA.map(function () { return { jumlah: 0, rincian: '' }; }),
      gaji: false
    };
  }
  /* Apa pun yang masuk (isian layar, isi penyimpanan yang mungkin rusak atau
     diubah tangan) dijadikan bentuk yang sah sebelum dipakai. */
  function bersihkan(s) {
    var b = baru(''), x = (s && typeof s === 'object') ? s : {}, p = (x.profil && typeof x.profil === 'object') ? x.profil : {};
    ['kll', 'bank', 'rekening', 'atasNama', 'pemohon'].forEach(function (k) { b.profil[k] = potong(p[k], PANJANG[k]); });
    b.profil.tipe = p.tipe === 'ULL' ? 'ULL' : 'KLL';
    b.profil.rek = p.rek === 'manual' ? 'manual' : 'va';
    var f = (x.form && typeof x.form === 'object') ? x.form : {};
    b.form.c = f.c === true; b.form.d = f.d === true;
    b.tanggal = sahTanggal(x.tanggal);
    b.c.forEach(function (r, i) {
      var y = (Array.isArray(x.c) && x.c[i] && typeof x.c[i] === 'object') ? x.c[i] : {};
      r.jumlah = angka(y.jumlah); r.asnaf = potong(y.asnaf, PANJANG.asnaf); r.rincian = potong(y.rincian, PANJANG.rincian);
    });
    b.d.forEach(function (r, i) {
      var y = (Array.isArray(x.d) && x.d[i] && typeof x.d[i] === 'object') ? x.d[i] : {};
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
  /* "KLL Pajangan" untuk kop, "Kantor Layanan Lazismu Pajangan" untuk kalimat. */
  function labelKantor(p) { return (p.tipe === 'ULL' ? 'ULL ' : 'KLL ') + p.kll; }
  function sebutKantor(p) { return (p.tipe === 'ULL' ? 'Unit Layanan' : 'Kantor Layanan') + ' Lazismu'; }

  /* Pemeriksaan sebelum dicetak. Galat per isian (id elemen di layar) dan
     formulir yang ikut tercetak: hanya yang dipilih di langkah pertama. */
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
    return { galat: g, ada: { c: s.form.c, d: s.form.d }, totalC: tc, totalD: td };
  }

  /* ---------------------------------------------------------------- dokumen cetak */
  var SALAM = '\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645 \u0648\u0631\u062d\u0645\u0629 \u0627\u0644\u0644\u0647 \u0648\u0628\u0631\u0643\u0627\u062a\u0647';
  var SALAM_PENUTUP = '\u0648' + SALAM;
  var CENTANG = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.6 5.4 4 7.8 8.6 2.2" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function kop(kode, judul, p) {
    return '<table class="kop"><tr>'
      + '<td class="kode" rowspan="3">' + kode + '</td>'
      + '<td class="nama" rowspan="3">FORMULIR<br>PENGAJUAN KLL</td>'
      + '<td class="k">Judul</td><td class="t">:</td><td class="v">' + judul + '</td></tr>'
      + '<tr><td class="k">Nomor</td><td class="t">:</td><td class="v"><small>*diisi Admin Daerah</small></td></tr>'
      + '<tr><td class="k">KLL</td><td class="t">:</td><td class="v"><b>' + esc(labelKantor(p)) + '</b></td></tr></table>';
  }
  function pembuka(s, jumlah) {
    return '<div class="kepada">Kepada:<br>Yth. Ketua Badan Pengurus LAZISMU Bantul<br>Di - <u>Bantul</u></div>'
      + '<p class="ar" lang="ar" dir="rtl">' + SALAM + '</p>'
      + '<p>Yang bertanda tangan dibawah ini pelaksana ' + sebutKantor(s.profil) + ' <b>' + esc(s.profil.kll) + '</b> dengan ini mengusulkan uang muka program '
      + 'untuk pendistribusian dana ZISKA sebesar <b>Rp. ' + fmt(jumlah) + '</b> dengan rincian sebagai berikut :</p>';
  }
  function rekening(s) {
    var p = s.profil, awal = '<p class="rek">Untuk memudahkan pelaksanaan pendistribusian dana dapat di transfer melalui ';
    if (p.rek !== 'manual') return awal + '<b>Virtual Account (VA) ' + VA_BANK + '</b> ' + esc(labelKantor(p)) + '</p>';
    return awal + 'rekening <b>' + esc(labelKantor(p)) + '</b> <b>' + esc(p.bank) + '</b> dengan no rekening <b>' + esc(p.rekening)
      + '</b> atas nama <b>' + esc(p.atasNama) + '</b></p>';
  }
  function penutup() {
    return '<p>Demikian permohonan ini kami sampaikan, atas perkenannya kami sampaikan terimakasih</p>'
      + '<p class="ar" lang="ar" dir="rtl">' + SALAM_PENUTUP + '</p>';
  }
  function tandaTangan(s) {
    return '<table class="ttd">'
      + '<tr><td class="rekom" rowspan="3"><b>Rekomendasi (diisi oleh Admin):</b><br>Berdasarkan ketentuan persyaratan dasar, maka permohonan:<br>'
      + '<b>Diterima/ Tidak diterima</b> *) lanjut untuk proses pencairan dana<br>* coret yang tidak sesuai</td>'
      + '<td class="jd" colspan="2"><b>Pemohon :</b></td></tr>'
      + '<tr><td class="lb">Nama</td><td class="isi">' + esc(s.profil.pemohon) + '</td></tr>'
      + '<tr class="tt"><td class="lb">Tanda tangan/ Tanggal</td><td class="isi tgl">' + esc(tanggalPanjang(s.tanggal)) + '</td></tr>'
      + '<tr><td class="cat" rowspan="3"><b>Catatan :</b></td><td class="jd" colspan="2"><b>Admin :</b></td></tr>'
      + '<tr><td class="lb">Nama :</td><td class="isi"></td></tr>'
      + '<tr class="tt"><td class="lb">Tanda tangan/ Tanggal</td><td class="isi"></td></tr></table>';
  }
  function sel(r) { return r.jumlah ? 'Rp. ' + fmt(r.jumlah) + ',00' : ''; }
  function nama(label, rincian) {
    return '<span class="lb">' + esc(label) + '</span>' + (rincian ? '<span class="rc">' + esc(rincian) + '</span>' : '');
  }

  function halamanC(s, jumlah) {
    var h = '<section class="hal">' + kop('F-08-C', 'FORMULIR USULAN PENDISTRIBUSIAN INFAK TIDAK TERIKAT (NON AMIL) KLL SEKEMA UMP', s.profil)
      + pembuka(s, jumlah)
      + '<table class="rinci c"><thead><tr><th class="no">NO</th><th>PILAR / PROGRAM</th><th>JUMLAH</th><th>ASNAF</th></tr></thead><tbody>';
    PILAR.forEach(function (n, i) {
      var r = s.c[i];
      h += '<tr><td class="no">' + (i + 1) + '</td><td>' + nama(n, r.rincian) + '</td><td class="jml">' + sel(r) + '</td><td class="asn">' + esc(r.asnaf) + '</td></tr>';
    });
    return h + '</tbody></table>' + rekening(s) + penutup() + tandaTangan(s) + '</section>';
  }
  function halamanD(s, jumlah) {
    var h = '<section class="hal">' + kop('F-08-D', 'FORMULIR PENGAJUAN OPERASIONAL KLL', s.profil)
      + pembuka(s, jumlah)
      + '<table class="rinci d"><thead><tr><th class="no">NO</th><th>KETERANGAN</th><th>JUMLAH</th></tr></thead><tbody>';
    BIAYA.forEach(function (n, i) {
      var r = s.d[i];
      h += '<tr><td class="no">' + (i + 1) + '</td><td>' + nama(n, r.rincian) + '</td><td class="jml">' + sel(r) + '</td></tr>';
    });
    return h + '</tbody></table>'
      + '<div class="lamp">Bersama ini kami lampirkan :<div class="cb"><span class="kotak">' + (s.gaji ? CENTANG : '') + '</span>Daftar Gaji</div></div>'
      + rekening(s) + penutup() + tandaTangan(s) + '</section>';
  }

  var GAYA = '@page{size:A4 portrait;margin:13mm 18mm}'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;font-size:10.5pt;line-height:1.3;color:#000;background:#e9eaec}'
    + '.hal{width:210mm;min-height:297mm;margin:12px auto;padding:13mm 18mm;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.16)}'
    + 'p{margin:2.2mm 0}'
    + 'table{border-collapse:collapse;width:100%;table-layout:fixed}'
    + 'td,th{border:0.7pt solid #000;padding:0.9mm 2mm;vertical-align:middle;overflow-wrap:anywhere}'
    + '.kop{border:1.4pt solid #000}'
    + '.kop td.kode{width:22mm;text-align:center;font-weight:700}'
    + '.kop td.nama{width:30mm;font-weight:700;text-align:left}'
    + '.kop td.k{width:16mm}.kop td.t{width:5mm;text-align:center;font-weight:700}'
    + '.kop td.v{font-size:10pt}.kop small{font-size:6.5pt}'
    + '.kepada{margin-top:4mm}'
    + '.ar{text-align:left;font-size:11pt;margin:3mm 0 1.5mm}'
    + 'table.rinci{margin:2mm 0 3mm}'
    + 'table.rinci th{font-weight:400;padding:1.6mm 2mm}'
    + 'table.rinci td{height:7mm}'
    + 'table.rinci td.no,table.rinci th.no{width:9mm;text-align:center}'
    + 'table.rinci.c th:nth-child(3),table.rinci.c td.jml{width:50mm}table.rinci.c th:nth-child(4),table.rinci.c td.asn{width:47mm}'
    + 'table.rinci.d th:nth-child(3),table.rinci.d td.jml{width:50mm}'
    + 'table.rinci td.jml{text-align:center;white-space:nowrap}'
    + '.lb{text-transform:uppercase}'
    + '.rc{display:block;font-size:8pt;line-height:1.15}'
    + '.lamp{margin:1mm 0 2mm}.cb{display:flex;align-items:center;gap:2mm;margin:1mm 0 0 1mm}'
    + '.kotak{display:inline-flex;width:4mm;height:4mm;border:0.8pt solid #000;align-items:center;justify-content:center}'
    + '.kotak svg{width:3.4mm;height:3.4mm}'
    + 'table.ttd{margin-top:3mm}'
    + 'table.ttd td.rekom{width:50%;vertical-align:top;padding:1.5mm 2mm}'
    + 'table.ttd td.cat{vertical-align:top;padding:1.5mm 2mm}'
    + 'table.ttd td.jd{padding:0.8mm 2mm}'
    + 'table.ttd td.lb{width:17%;text-transform:none}'
    + 'table.ttd tr.tt td{height:17mm}'
    + 'table.ttd td.tgl{vertical-align:bottom;font-size:9pt}'
    + '.bar{text-align:center;margin:10px 0 24px}'
    + '.bar button{font:inherit;font-size:10pt;font-weight:700;background:#16161d;color:#fff;border:none;padding:9px 22px;border-radius:999px;cursor:pointer}'
    + '@media print{body{background:#fff}.hal{width:auto;min-height:0;margin:0;padding:0;box-shadow:none;zoom:var(--z,1)}.hal+.hal{break-before:page;page-break-before:always}.bar{display:none}}';

  /* Dokumen lengkap, siap dibuka di tab baru lalu dicetak atau disimpan sebagai PDF. */
  function bangunHTML(state) {
    var s = bersihkan(state), p = periksa(s), hal = '';
    if (p.ada.c) hal += halamanC(s, p.totalC);
    if (p.ada.d) hal += halamanD(s, p.totalD);
    var judul = 'Pengajuan UMP ' + labelKantor(s.profil) + (s.tanggal ? ' ' + s.tanggal : '');
    return '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>' + esc(judul) + '</title><style>' + GAYA + '</style></head><body>'
      + hal
      /* Pengecil otomatis: di layar .hal selebar dan setinggi A4 lengkap dengan
         margin cetak, jadi kalau isinya lebih tinggi dari 297mm, perbandingannya
         dipakai sebagai zoom saat cetak. Data biasa tetap skala 1. */
      + '<script>document.querySelectorAll(".hal").forEach(function(h){var a=h.getBoundingClientRect().width*297/210,r=(a-2)/h.scrollHeight;if(r<1)h.style.setProperty("--z",r.toFixed(3));});<\/script>'
      + '<div class="bar"><button type="button" onclick="window.print()">Cetak / Simpan PDF (A4)</button></div></body></html>';
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
    KUNCI: KUNCI, MAKS_RP: MAKS_RP, PANJANG: PANJANG, PILAR: PILAR, BIAYA: BIAYA, ASNAF: ASNAF, VA_BANK: VA_BANK,
    esc: esc, angka: angka, fmt: fmt, sahTanggal: sahTanggal, tanggalPanjang: tanggalPanjang, labelKantor: labelKantor,
    baru: baru, bersihkan: bersihkan, total: total, periksa: periksa, bangunHTML: bangunHTML, simpan: simpan, muat: muat
  };
})(typeof window !== 'undefined' ? window : this);
