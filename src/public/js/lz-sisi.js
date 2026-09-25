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

  /* --- sumbu logo -------------------------------------------------- */
  /* Logo harus jatuh di SUMBU YANG SAMA dengan ikon menu di bawahnya: tengah
     rel saat ciut, tengah panel saat dibuka. Dulu jaraknya dihitung dari
     padding dan margin yang ditulis di CSS, dan hasilnya meleset 3,5 px saat
     ciut — cukup untuk terlihat goyah berjajar dengan ikon-ikon di bawahnya.
     Sekarang diukur langsung dari kotak logonya sendiri.

     Dua angka, karena logonya diperkecil saat ciut: geseran yang menengahkan
     logo berukuran penuh tidak menengahkan logo yang tinggal 56%.

     transform:translateX(t) scale(s) dengan titik tumpu kiri-tengah berarti
     tepi kiri tergambar di x0 + t dan lebarnya s*w, jadi titik tengahnya
     x0 + t + s*w/2. Dari situ  t = sasaran - x0 - s*w/2. */
  var SKALA_CIUT = 0.56;   /* samakan dengan bagian 55 di styles.css */

  function ukurLogo() {
    var a = app();
    if (!a) return;
    var img = a.querySelector('.tn-brand .logo-img');
    var nav = a.querySelector('.topnav');
    if (!img || !nav) return;

    /* Diukur dengan transform dimatikan sesaat. getBoundingClientRect ikut
       terskala oleh transform, jadi kalau tidak dimatikan, yang terukur lebar
       logo yang sudah dikecilkan, bukan lebar sebenarnya.

       HARUS dengan tanda penting. Aturan di styles.css memakai !important,
       dan gaya sebaris tanpa penanda yang sama KALAH melawannya — diam-diam,
       tanpa galat. Gejalanya: saat halaman dibuka dalam keadaan ciut, yang
       terukur 56% dari lebar aslinya, dan logonya berakhir jauh meleset.
       Waktu pertama ditulis ini lolos karena halaman ujinya kebetulan selalu
       mulai dalam keadaan terbuka. */
    img.style.setProperty('transition', 'none', 'important');
    img.style.setProperty('transform', 'none', 'important');
    var kotak = img.getBoundingClientRect();
    var kotakNav = nav.getBoundingClientRect();
    var lebar = kotak.width;
    var x0 = kotak.left - kotakNav.left;          /* relatif tepi kiri panel */
    img.style.removeProperty('transform');
    /* Transisi dinyalakan lagi pada frame berikutnya — kalau langsung, nilai
       transform yang baru saja dipulihkan ikut dianimasikan dari "none". */
    requestAnimationFrame(function () { img.style.removeProperty('transition'); });

    if (!lebar) return;                            /* gambarnya belum dimuat */

    var gaya = getComputedStyle(document.documentElement);
    var sisi = parseFloat(gaya.getPropertyValue('--u-sisi')) || kotakNav.width;
    var rel = parseFloat(gaya.getPropertyValue('--u-rail')) || 84;

    /* Dibulatkan ke satu angka di belakang koma, bukan ke bilangan bulat:
       pembulatan ke bilangan bulat menggeser titik tengahnya sampai setengah
       piksel, dan setengah piksel itu yang membuat deretannya terlihat goyah
       di layar ber-DPI tinggi. */
    var bulat = function (n) { return Math.round(n * 10) / 10; };
    a.style.setProperty('--u-logo-x', bulat(sisi / 2 - x0 - lebar / 2) + 'px');
    a.style.setProperty('--u-logo-x-ciut',
      bulat(rel / 2 - x0 - (SKALA_CIUT * lebar) / 2) + 'px');
  }

  /* --- ikon disamakan ukuran optisnya -------------------------------- */
  /* Tiap ikon digambar di kanvas 24x24, tapi isinya berbeda-beda besar: tanda
     dokumen hanya mengisi 11 satuan, roda gigi mengisi 20. Kotaknya sama, jadi
     ikonnya memang sejajar — tapi JARAK ke teks di sebelahnya jadi berbeda
     sampai 4,5 px dari satu baris ke baris lain, dan deretan itu terbaca
     sebagai tidak rapi.
     Di sini tiap ikon diukur lalu diskalakan supaya sisi terpanjangnya sama,
     dengan titik tengah yang sama pula. Perbandingan bentuknya tidak diubah —
     yang bulat tetap bulat — dan ketebalan garisnya dijaga lewat
     vector-effect:non-scaling-stroke di styles.css. */
  var SASARAN = 16.5;      /* satuan viewBox; sisa 24 - 16.5 untuk garis & napas */

  function ratakanSatu(svg) {
    if (!svg || svg.getAttribute('data-lz-rata')) return;
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if (!vb || !vb.width) return;
    var bb;
    try { bb = svg.getBBox(); } catch (e) { return; }
    if (!bb || !bb.width || !bb.height) return;

    var s = SASARAN / Math.max(bb.width, bb.height);
    /* Dibatasi: ikon yang bentuknya memang kecil tidak dipaksa melar sampai
       kehilangan karakternya, dan yang besar tidak dikerdilkan berlebihan. */
    s = Math.max(0.82, Math.min(1.3, s));

    var px = vb.x + vb.width / 2, py = vb.y + vb.height / 2;
    var cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    var bulat = function (n) { return Math.round(n * 1000) / 1000; };

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform',
      'translate(' + bulat(px - cx * s) + ',' + bulat(py - cy * s) + ') scale(' + bulat(s) + ')');
    while (svg.firstChild) g.appendChild(svg.firstChild);
    svg.appendChild(g);
    svg.setAttribute('data-lz-rata', '1');
  }

  function ratakanIkon() {
    var a = app();
    if (!a) return;
    a.querySelectorAll('.tn-item .ic svg, .tn-icon > svg').forEach(ratakanSatu);
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

    /* Menu digambar belakangan — setelah masuk, dan digambar ulang tiap kali
       hak akses berubah. Pengamat ini yang menangkapnya; tanpa itu ikon yang
       baru digambar tidak ikut diratakan. */
    ratakanIkon();
    var navBox = document.getElementById('nav');
    if (navBox && window.MutationObserver) {
      new MutationObserver(ratakanIkon).observe(navBox, { childList: true, subtree: true });
    }
  }

  function pasang() {
    pantauLogo();
    ratakanIkon();

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

  window.LZSisi = { ciutkan: ciutkan, bukakan: bukakan, gantikan: gantikan,
    ukurLogo: ukurLogo, ratakanIkon: ratakanIkon };
})();
