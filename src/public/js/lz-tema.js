/* Pengganti tema terang/gelap yang dipakai semua halaman modul (Surat, AI, Broadcast, Fundraising, Media).
   Dulu tiap halaman menyalin fungsi dan tombolnya sendiri: ikonnya bergeser ke tepi kanan tombol (padding kiri 20 px
   dari aturan .tn-item) dan pergantian tema terjadi seketika. Di sini satu tempat:
   - ikon matahari/bulan satu SVG yang berubah bentuk (bulan sabit meluncur keluar, sinar tumbuh), dikendalikan CSS
     lewat html[data-theme], jadi tidak perlu digambar ulang dan tidak ada yang berkedip;
   - peralihan tema berupa lingkaran yang melebar dari tombol dan membuka halaman bertema baru UTUH (View Transitions,
     lihat gantiSapu); peramban lama memakai lingkaran latar saja. Pengguna yang meminta gerak dikurangi mendapat
     pergantian langsung. */
(function () {
  'use strict';
  var nomor = 0;
  var gelap = function () { return document.documentElement.getAttribute('data-theme') === 'dark'; };
  var judul = function (g) { return g ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'; };

  function svg() {
    var id = 'lz-bulan-' + (++nomor);
    var sinar = '';
    for (var i = 0; i < 8; i++) sinar += '<line x1="12" y1="1.8" x2="12" y2="4.4" transform="rotate(' + (i * 45) + ' 12 12)"/>';
    return '<svg class="lz-tema-ikon" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" focusable="false">'
      + '<mask id="' + id + '"><rect width="24" height="24" fill="#fff"/><circle class="t-potong" cx="12" cy="12" r="6.4" fill="#000"/></mask>'
      + '<circle class="t-inti" cx="12" cy="12" r="7.6" fill="currentColor" mask="url(#' + id + ')"/>'
      + '<g class="t-sinar" stroke="currentColor" stroke-width="2" stroke-linecap="round">' + sinar + '</g></svg>';
  }

  function simpan(g) {
    document.documentElement.setAttribute('data-theme', g ? 'dark' : 'light');
    try { localStorage.setItem('laz_theme', g ? 'dark' : 'light'); } catch (_) { /* mode privat */ }
    var daftar = document.querySelectorAll('.kepala-tema');
    for (var i = 0; i < daftar.length; i++) {
      daftar[i].title = judul(g);
      daftar[i].setAttribute('aria-label', judul(g));
    }
  }

  /* Lingkaran warna tema baru yang melebar dari tombol sampai menutupi layar (pola "circular reveal ringan": hanya SATU
     elemen dianimasikan, tanpa View Transitions yang memotret seluruh halaman).
     Latar halaman ini bukan warna datar tapi lapisan gradien di body::before, jadi:
     - #lz-tema-dasar menahan latar LAMA di tempatnya (tema sudah berganti, kalau tidak latar baru langsung muncul),
     - #lz-tema-lingkar melukis latar BARU (warna dasar + gradien yang sama) dan yang tumbuh adalah potongannya
       (clip-path circle), bukan elemennya. Pernah dicoba transform scale: gambar gradiennya ikut mengecil jadi persegi
       kecil di dalam lingkaran, dan melompat saat dilepas.
     Isi halaman (kartu, teks, garis) berganti warna lewat transisi 0,5 detik (html.lz-tema-halus). */
  var DURASI = 900;
  function latar() {
    var b = document.body;
    return { warna: getComputedStyle(b).backgroundColor, gambar: getComputedStyle(b, '::before').backgroundImage };
  }
  function bersihkan() {
    var d = document.getElementById('lz-tema-dasar'), l = document.getElementById('lz-tema-lingkar');
    if (d) d.remove();
    if (l) l.remove();
    document.documentElement.classList.remove('lz-tema-halus');
  }

  var sedang = false, animKini = null;

  /* SAPUAN SELURUH HALAMAN (View Transitions). Cara di bawahnya (lingkaran latar + isi berganti 0,5 detik) punya cacat
     yang terlihat: hanya LATAR yang disapu lingkaran, sementara kartu, teks, garis, dan bilah menu berganti warna sendiri
     serentak di mana pun letaknya. Terukur di test_tema_ui.js pada 370 ms: kartu di kiri bawah sudah gelap (jumlah RGB
     100) padahal latar di sebelahnya masih terang (693), jadi isi halaman "mendahului" lingkarannya.
     Dengan View Transitions peramban memotret halaman lama, memasang tema baru, lalu yang dibuka lingkaran adalah
     potret halaman BARU utuh: latar dan isi berganti tepat saat lingkaran menyentuhnya. Satu elemen semu dianimasikan,
     isi halaman tidak dihitung ulang tiap frame. Peramban tanpa fitur ini (Safari < 18, Firefox lama) memakai cara lama.

     Klik beruntun: tema TUJUAN dicatat di `tujuan`. Pembaruan DOM pada View Transitions berjalan tak serempak (sesudah
     potret diambil), jadi pada klik kedua data-theme bisa masih tema lama; tanpa catatan ini dua klik cepat sama-sama
     memilih gelap dan tema tersangkut. Transisi yang sedang berjalan dilewati peramban sendiri, dan pembaruannya tetap
     dijalankan, jadi urutannya tetap benar. */
  var vtKini = null, tujuan = null;
  function gantiSapu(g, x, y, radius) {
    var root = document.documentElement;
    tujuan = g;
    root.classList.add('lz-tema-vt');
    var vt = document.startViewTransition(function () { simpan(g); });
    vtKini = vt;
    vt.ready.then(function () {
      var pusat = ' at ' + x + 'px ' + y + 'px)';
      root.animate(
        { clipPath: ['circle(0px' + pusat, 'circle(' + radius + 'px' + pusat] },
        { duration: DURASI, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () { /* dilewati oleh klik berikutnya */ });
    var lepas = function () {
      if (vtKini !== vt) return;
      vtKini = null; tujuan = null;
      root.classList.remove('lz-tema-vt');
    };
    vt.finished.then(lepas, lepas);
  }

  function ganti(tombol) {
    /* Klik lagi saat lingkaran masih melebar: animasi yang berjalan diselesaikan seketika (tema sudah terpasang),
       lalu klik ini berlaku. Menolak klik itu membuat tombol terasa mati dan tema tersangkut di keadaan yang tidak
       diminta (uji Broadcast menekan dua kali berturut-turut dan mengharapkan kembali ke terang). */
    if (sedang && animKini) { try { animKini.cancel(); } catch (_) { /* sudah selesai */ } }
    sedang = false;
    var g = tujuan !== null ? !tujuan : !gelap();
    var root = document.documentElement;
    var kurangi = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (kurangi || !Element.prototype.animate || !document.body) { simpan(g); return; }

    var r = (tombol || document.body).getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var w = window.innerWidth, h = window.innerHeight;
    var radius = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));

    if (typeof document.startViewTransition === 'function') { gantiSapu(g, x, y, radius); return; }

    sedang = true;
    bersihkan();

    var lama = latar();
    var dasar = document.createElement('div');
    dasar.id = 'lz-tema-dasar';
    dasar.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-color:' + lama.warna
      + ';background-image:' + lama.gambar + ';';
    document.body.insertBefore(dasar, document.body.firstChild);

    root.classList.add('lz-tema-halus');
    simpan(g);
    var baru = latar();

    var lingkar = document.createElement('div');
    lingkar.id = 'lz-tema-lingkar';
    lingkar.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;'
      + 'background-color:' + baru.warna + ';background-image:' + baru.gambar + ';';
    dasar.after(lingkar);

    var pusat = ' at ' + x + 'px ' + y + 'px)';
    var anim = lingkar.animate(
      [{ clipPath: 'circle(0px' + pusat }, { clipPath: 'circle(' + radius + 'px' + pusat }],
      { duration: DURASI, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
    );
    animKini = anim;
    var selesai = function () { if (animKini === anim) { animKini = null; sedang = false; bersihkan(); } };
    anim.onfinish = selesai;
    anim.oncancel = selesai;
  }

  /* Tahap tangkap di document: berjalan sebelum onclick bawaan tiap halaman, yang sudah tidak diperlukan. */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.kepala-tema') : null;
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ganti(t);
  }, true);

  /* Tombol yang cukup menulis <button class="kepala-tema" data-lz-tema> (layar login, halaman pelacakan): ikon dan judul
     diisi di sini, jadi halaman itu tidak perlu menyalin SVG-nya. */
  function isiOtomatis() {
    var daftar = document.querySelectorAll('[data-lz-tema]');
    for (var i = 0; i < daftar.length; i++) {
      if (daftar[i].querySelector('.lz-tema-ikon')) continue;
      daftar[i].classList.add('kepala-tema');
      daftar[i].innerHTML = svg();
      daftar[i].title = judul(gelap());
      daftar[i].setAttribute('aria-label', judul(gelap()));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', isiOtomatis); else isiOtomatis();

  window.LZTema = { svg: svg, ganti: ganti, gelap: gelap, judul: judul };
})();
