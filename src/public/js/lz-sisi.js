/* js/lz-sisi.js — perilaku bilah menu samping, satu tempat untuk semua halaman
 *
 * Dua pekerjaan, keduanya kecil, keduanya dulu tidak ada di tiga halaman.
 *
 * 1. MENUTUP TANPA HARUS MENCARI TOMBOLNYA — klik di mana saja di luar bilah,
 *    atau tekan Esc. Perilaku ini dulu ditulis di dalam app.js, jadi hanya
 *    berlaku di halaman utama; Broadcast, Fundraising, dan AI Asisten memakai
 *    bilah yang sama persis tetapi tidak punya jalan keluarnya.
 *    Dikecualikan: klik di dalam modal, dropdown, dan pemilih tanggal yang
 *    mengambang — menutup bilah di tengah dialog terasa acak, dan lebih buruk
 *    lagi, ia memindahkan hal-hal di belakang dialog yang sedang tidak dilihat.
 *    Hanya di layar >= 1024px; di bawah itu bilahnya berubah jadi bilah atas.
 *
 * 2. MENGUKUR JARAK LOGO KE TENGAH PANEL. Saat bilah dibuka, logo lembaga
 *    berpindah ke tengah panel; saat ciut ia menepi ke kiri sejajar ikon menu.
 *    Perpindahannya memakai transform supaya tidak memicu perhitungan ulang
 *    tata letak (lihat bagian 55 di styles.css) — dan transform butuh ANGKA,
 *    sementara jarak ke tengah bergantung pada lebar logo yang diunggah
 *    lembaga. CSS tidak bisa menghitungnya sendiri, jadi diukur di sini lalu
 *    ditaruh sebagai --u-logo-x. Sekali saat halaman siap, sekali lagi kalau
 *    logonya baru selesai dimuat, dan kalau jendela diubah ukurannya.
 *
 * Yang SENGAJA tidak dikerjakan berkas ini: menentukan keadaan awal bilah
 * (ciut atau terbuka). Itu tetap urusan masing-masing halaman seperti
 * sebelumnya — app.js, ai.js, blast.js, dan fund.js sudah membacanya dari
 * localStorage dengan caranya sendiri.
 *
 * Berkas ini berdiri sendiri: tidak memanggil apa pun dari skrip halaman.
 * Keempat halaman memuatnya lewat <script defer> sebelum skripnya sendiri.
 */
(function () {
  'use strict';

  if (window.__lzSisi) return;
  window.__lzSisi = true;
  /* Penanda lama di app.js. Disetel di sini supaya blok warisan di sana
     berhenti sendiri dan penanganannya tidak terpasang dua kali. */
  window.__sidebarOutsideClick = true;

  var KUNCI = 'sidebar_collapsed';
  var LEBAR_BILAH_SAMPING = 1024;
  var MENGAMBANG = '.modal-bg, .cd-overlay, .dropdown-popover, .custom-dropdown-menu,'
    + ' .select-enhanced-popover, .datepicker-enhanced-popover, .ai-menu, .menu-pop';

  function app() { return document.getElementById('appView'); }

  function simpan(ciut) {
    /* Ditunda sampai animasinya selesai. localStorage.setItem menulis ke
       cakram secara sinkron — ia menahan utas tampilan beberapa milidetik,
       dan kalau dipanggil bersamaan dengan pergantian class, milidetik itu
       jatuh tepat di frame pertama animasi. Frame pertama justru yang paling
       terasa kalau tersendat. */
    clearTimeout(window.__lzSisiTimer);
    window.__lzSisiTimer = setTimeout(function () {
      try { localStorage.setItem(KUNCI, ciut ? 'true' : 'false'); } catch (e) { /* mode privat */ }
    }, 360);
  }

  function ciutkan() {
    var a = app();
    if (!a || a.classList.contains('collapsed')) return;
    a.classList.add('collapsed');
    simpan(true);
  }

  function bukakan() {
    var a = app();
    if (!a || !a.classList.contains('collapsed')) return;
    a.classList.remove('collapsed');
    simpan(false);
  }

  function gantikan() {
    var a = app();
    if (!a) return;
    a.classList.toggle('collapsed');
    simpan(a.classList.contains('collapsed'));
  }

  function bilahSamping() {
    return window.innerWidth >= LEBAR_BILAH_SAMPING;
  }

  /* --- jarak logo ke tengah panel ------------------------------------- */
  /* offsetWidth dipakai, bukan getBoundingClientRect: yang pertama mengukur
     kotak tata letaknya dan tidak terpengaruh transform, yang kedua ikut
     terskala. Kalau yang kedua dipakai, tiap pengukuran akan memakai hasil
     pengukuran sebelumnya dan angkanya mengecil terus. */
  function ukurLogo() {
    var a = app();
    if (!a) return;
    var img = a.querySelector('.tn-brand .logo-img');
    var nav = a.querySelector('.topnav');
    if (!img || !nav) return;

    var lebarLogo = img.offsetWidth;
    if (!lebarLogo) return;                 // gambarnya belum dimuat

    var gaya = getComputedStyle(nav);
    var lebarPanel = nav.offsetWidth - parseFloat(gaya.paddingLeft || 0) - parseFloat(gaya.paddingRight || 0);
    /* Saat bilah sedang ciut, nav.offsetWidth adalah lebar RELnya, bukan lebar
       panel terbuka — jadi lebar terbukanya diambil dari variabelnya. */
    if (a.classList.contains('collapsed')) {
      var sisi = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u-sisi'));
      if (sisi) lebarPanel = sisi - parseFloat(gaya.paddingLeft || 0) - parseFloat(gaya.paddingRight || 0);
    }

    var geser = Math.max(0, Math.round((lebarPanel - lebarLogo) / 2));
    a.style.setProperty('--u-logo-x', geser + 'px');
  }

  function pantauLogo() {
    var a = app();
    if (!a) return;
    ukurLogo();
    var img = a.querySelector('.tn-brand .logo-img');
    if (img && !img.complete) img.addEventListener('load', ukurLogo, { once: true });

    /* Logonya digambar ulang tiap applyBranding() dipanggil — saat lembaga
       mengganti logo, misalnya. Pengamat ini yang menangkapnya; tanpa itu
       logo baru akan memakai jarak milik logo lama. */
    var kotak = document.getElementById('brandBox');
    if (kotak && window.MutationObserver) {
      new MutationObserver(function () {
        var b = a.querySelector('.tn-brand .logo-img');
        if (b && !b.complete) b.addEventListener('load', ukurLogo, { once: true });
        ukurLogo();
      }).observe(kotak, { childList: true, subtree: true });
    }
  }

  function pasang() {
    pantauLogo();

    document.addEventListener('click', function (e) {
      var a = app();
      if (!a || a.classList.contains('hidden') || a.classList.contains('collapsed')) return;
      if (!bilahSamping()) return;
      if (e.target.closest('.topnav')) return;
      if (e.target.closest(MENGAMBANG)) return;
      ciutkan();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.keyCode !== 27) return;
      if (!bilahSamping()) return;
      var a = app();
      if (!a || a.classList.contains('hidden') || a.classList.contains('collapsed')) return;
      /* Saat ada dialog terbuka, Esc sudah punya arti di sana. */
      if (document.querySelector('.modal-bg.show, .modal-bg.open, .modal-bg.tampil')) return;
      ciutkan();
    });

    var jam = null;
    window.addEventListener('resize', function () {
      clearTimeout(jam);
      jam = setTimeout(ukurLogo, 140);
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pasang);
  } else {
    pasang();
  }

  window.LZSisi = { ciutkan: ciutkan, bukakan: bukakan, gantikan: gantikan, ukurLogo: ukurLogo };
})();
