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

  /* Inisialisasi navigasi drawer mobile untuk seluruh halaman */
  function inisialisasiDrawerMobile() {
    var topnav = document.querySelector('.topnav');
    if (!topnav) return;

    /* 1. Pastikan backdrop scrim ada */
    var scrim = document.getElementById('navScrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.id = 'navScrim';
      scrim.className = 'tn-nav-scrim';
      scrim.setAttribute('aria-hidden', 'true');
      document.body.appendChild(scrim);
    }
    scrim.onclick = function () {
      tutupDrawer();
    };

    /* 2. Pastikan tombol hamburger ada di awal .topnav sebelum brand */
    var adaHam = topnav.querySelector('.btn-hamburger');
    if (!adaHam) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-hamburger';
      btn.id = 'btnMenuMobile';
      btn.setAttribute('aria-label', 'Buka menu navigasi');
      btn.title = 'Menu Navigasi';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
      btn.onclick = function (e) {
        e.stopPropagation();
        toggleSidebar();
      };
      var brand = topnav.querySelector('.tn-brand');
      if (brand) {
        topnav.insertBefore(btn, brand);
      } else {
        topnav.insertBefore(btn, topnav.firstChild);
      }
    }

    /* 3. Tutup drawer saat klik tombol menu di HP */
    var nav = topnav.querySelector('.tn-nav');
    if (nav && !nav.__lzNavBound) {
      nav.__lzNavBound = true;
      nav.addEventListener('click', function (e) {
        if (window.innerWidth < 1024 && e.target.closest('.tn-item, .tn-drawer-close')) {
          tutupDrawer();
        }
      });
    }

    /* 4. Tutup drawer dengan tombol Esc */
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
        tutupDrawer();
      }
    });
  }

  function bukaDrawer() {
    var app = document.getElementById('appView') || document.querySelector('.app');
    if (app) app.classList.add('menu-open');
    document.body.classList.add('menu-open');
    var s = document.getElementById('navScrim');
    if (s) s.classList.add('show');
  }

  function tutupDrawer() {
    var app = document.getElementById('appView') || document.querySelector('.app');
    if (app) app.classList.remove('menu-open');
    document.body.classList.remove('menu-open');
    var s = document.getElementById('navScrim');
    if (s) s.classList.remove('show');
  }

  function toggleDrawer() {
    var app = document.getElementById('appView') || document.querySelector('.app');
    var buka = !(app && app.classList.contains('menu-open'));
    if (buka) bukaDrawer();
    else tutupDrawer();
  }

  /* Universal toggleSidebar untuk layar sentuh / mobile vs desktop */
  var toggleLama = window.toggleSidebar;
  window.toggleSidebar = function () {
    if (window.innerWidth < 1024) {
      toggleDrawer();
    } else {
      if (typeof toggleLama === 'function' && toggleLama !== window.toggleSidebar) {
        toggleLama();
      } else {
        var app = document.getElementById('appView') || document.querySelector('.app');
        if (app) app.classList.toggle('collapsed');
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inisialisasiDrawerMobile);
  } else {
    inisialisasiDrawerMobile();
  }
})();
