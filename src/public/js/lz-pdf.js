/* Penulis PDF kecil tanpa pustaka luar: satu gambar JPEG per halaman, ukuran halaman bebas (bawaan A5 mendatar).
 * Dipakai Cetak Kwitansi (Laporan) supaya PDF-nya langsung jadi berkas, bukan lewat dialog cetak peramban.
 *   LZPdf.buat(daftarJpegDataUrl, { lebar, tinggi, margin }) -> Promise<Blob>
 * Satuan titik (1/72 inci). A5 mendatar = 595.28 x 419.53. Gambar diskalakan utuh (tidak terpotong) dan ditaruh di tengah. */
(function () {
  'use strict';
  if (window.LZPdf) return;
  var A5 = { lebar: 595.28, tinggi: 419.53, margin: 12 };

  function dataUrlKeBytes(u) {
    var b = atob(String(u).split(',')[1] || '');
    var a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  /* Lebar dan tinggi piksel dibaca dari penanda SOFn di dalam JPEG, supaya tidak perlu memuat gambarnya lagi. */
  function ukuranJpeg(b) {
    var i = 2;
    while (i < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      var m = b[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    throw new Error('Gambar JPEG tidak dikenali');
  }
  function f(n) { return (Math.round(n * 100) / 100).toString(); }

  function buat(daftar, opsi) {
    opsi = Object.assign({}, A5, opsi || {});
    return new Promise(function (selesai, gagal) {
      try {
        var bagian = [], panjang = 0, offset = [];
        var enc = new TextEncoder();
        function tulis(x) { var u = typeof x === 'string' ? enc.encode(x) : x; bagian.push(u); panjang += u.length; }
        function objek(n, isi) { offset[n] = panjang; tulis(n + ' 0 obj\n'); isi(); tulis('\nendobj\n'); }
        var n = daftar.length;
        if (!n) throw new Error('Tidak ada halaman');
        /* Nomor objek: 1 katalog, 2 daftar halaman, lalu tiap halaman memakai 3 objek (halaman, isi, gambar). */
        tulis('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
        objek(1, function () { tulis('<< /Type /Catalog /Pages 2 0 R >>'); });
        var kids = []; for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
        objek(2, function () { tulis('<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>'); });
        for (var k = 0; k < n; k++) {
          var jpg = dataUrlKeBytes(daftar[k]), uk = ukuranJpeg(jpg);
          var maxW = opsi.lebar - opsi.margin * 2, maxH = opsi.tinggi - opsi.margin * 2;
          var sk = Math.min(maxW / uk.w, maxH / uk.h), w = uk.w * sk, h = uk.h * sk;
          var x = (opsi.lebar - w) / 2, y = (opsi.tinggi - h) / 2;
          var nh = 3 + k * 3, nc = nh + 1, ng = nh + 2;
          var isi = 'q ' + f(w) + ' 0 0 ' + f(h) + ' ' + f(x) + ' ' + f(y) + ' cm /Im0 Do Q';
          objek(nh, function () { tulis('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(opsi.lebar) + ' ' + f(opsi.tinggi) + '] /Resources << /XObject << /Im0 ' + ng + ' 0 R >> >> /Contents ' + nc + ' 0 R >>'); });
          objek(nc, function () { tulis('<< /Length ' + isi.length + ' >>\nstream\n' + isi + '\nendstream'); });
          objek(ng, function () {
            tulis('<< /Type /XObject /Subtype /Image /Width ' + uk.w + ' /Height ' + uk.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
            tulis(jpg); tulis('\nendstream');
          });
        }
        var total = 3 + n * 3, xref = panjang;
        tulis('xref\n0 ' + total + '\n0000000000 65535 f \n');
        for (var o = 1; o < total; o++) tulis(('0000000000' + offset[o]).slice(-10) + ' 00000 n \n');
        tulis('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
        selesai(new Blob(bagian, { type: 'application/pdf' }));
      } catch (e) { gagal(e); }
    });
  }
  window.LZPdf = { buat: buat, A5: A5 };
})();
