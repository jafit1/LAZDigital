/* js/lz-perangkat.js — menandai perangkat yang sedang membuka halaman
 *
 * Menaruh tiga atribut di elemen <html>, dan CSS memakai ketiganya:
 *   data-perangkat = hp | tablet | laptop | desktop
 *   data-sentuh    = ya | tidak
 *   data-arah      = lebar | tinggi     (lanskap / potret)
 *
 * KENAPA TIDAK CUKUP @media SAJA.
 * Media query hanya tahu UKURAN layar, dan ukuran bukan segalanya:
 *  - laptop layar sentuh selebar 1366 px butuh tombol seukuran jempol,
 *    sementara monitor 1366 px dengan tetikus tidak;
 *  - HP dimiringkan jadi selebar tablet, tapi tingginya tinggal 390 px;
 *  - ada yang membuka lewat tablet dengan papan ketik, ada yang dengan jari.
 * Menyimpannya sebagai atribut membuat aturan seperti "kendali minimal 38 px
 * kalau disentuh jari" bisa ditulis sekali di CSS, tanpa menebak dari lebar.
 *
 * DIMUAT DI <head> TANPA defer — DENGAN SENGAJA.
 * Kalau ditunda, halaman sempat tergambar sekali dengan ukuran baku lalu
 * melompat berubah begitu skripnya jalan. Lompatan itu terlihat di tiap
 * pemuatan, dan di HP ia terasa seperti halaman yang rusak sebentar. Berkas
 * ini kecil dan satu domain dengan halamannya, jadi menahannya sesaat jauh
 * lebih murah daripada kedipan itu.
 */
(function () {
  'use strict';

  var akar = document.documentElement;

  /* Batasnya sengaja sama dengan titik putus di styles.css. Kalau berbeda,
     akan ada lebar layar yang atributnya bilang "tablet" sementara CSS sudah
     memakai tata letak laptop — dan gejalanya sangat sulit dilacak. */
  var TITIK = [
    { nama: 'hp', maks: 639 },
    { nama: 'tablet', maks: 1023 },
    { nama: 'laptop', maks: 1439 },
    { nama: 'desktop', maks: Infinity },
  ];

  function lebar() {
    return window.innerWidth || akar.clientWidth || 1024;
  }

  function kelasPerangkat() {
    var w = lebar();
    for (var i = 0; i < TITIK.length; i++) {
      if (w <= TITIK[i].maks) return TITIK[i].nama;
    }
    return 'desktop';
  }

  /* pointer:coarse adalah pertanyaan yang benar — "alat tunjuknya kasar?" —
     bukan "ini HP?". Ia menjawab ya untuk tablet dan laptop sentuh, dan tidak
     untuk HP yang dipasangi tetikus. Yang lain cuma cadangan untuk peramban
     lama yang belum punya media query itu. */
  function jenisSentuh() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return 'ya';
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) return 'tidak';
    } catch (_) { /* peramban lama */ }
    return (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) ? 'ya' : 'tidak';
  }

  function terapkan() {
    var pasang = function (nama, nilai) {
      /* Hanya ditulis bila berubah: menyetel ulang atribut yang sama memicu
         perhitungan gaya ulang, dan ini dipanggil tiap kali jendela diubah. */
      if (akar.getAttribute(nama) !== nilai) akar.setAttribute(nama, nilai);
    };
    pasang('data-perangkat', kelasPerangkat());
    pasang('data-sentuh', jenisSentuh());
    pasang('data-arah', lebar() >= (window.innerHeight || 0) ? 'lebar' : 'tinggi');
  }

  terapkan();

  /* Ditunda sejenak: menyeret tepi jendela memicu puluhan kejadian per detik,
     dan tiap satu di antaranya membaca ukuran tata letak. */
  var jam = null;
  function tunda() {
    clearTimeout(jam);
    jam = setTimeout(terapkan, 120);
  }
  window.addEventListener('resize', tunda, { passive: true });
  window.addEventListener('orientationchange', tunda, { passive: true });

  window.LZ_PERANGKAT = {
    terapkan: terapkan,
    kelas: kelasPerangkat,
    sentuh: jenisSentuh,
    TITIK: TITIK,
  };
})();
