/* Layar /ump.html. Logika dan kertas A4 ada di lz-ump.js; berkas ini
   menggambar tiga langkah (kantor dan formulir, rincian, tanda tangan dan
   kirim), menyimpan ke browser, lalu membuat PDF (LZPdf) untuk disimpan atau
   dibagikan ke WhatsApp. Satu-satunya panggilan server: daftar nama kantor
   (apiDaftarKantorUmp), dengan token link saja. Isian tidak dikirim. */
(function () {
  'use strict';
  var U = window.LZUmp, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  var TOKEN = new URLSearchParams(location.search).get('t') || '';
  var hari = (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
  var S = U.muat(null, hari), KANTOR = [], LEMBAGA = {}, LANGKAH = 1, pewaktu = 0, pewaktuPdf = 0, CACHE = { kunci: '', blob: null };
  var CEK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 5 8.6 9.6 3.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var IKON_UNDUH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
  var IKON_WA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3Z"/></svg>';
  var LANGKAH_ID = { 1: ['u_kantor', 'f_c', 'u_bank', 'u_rekening', 'u_atasnama', 'u_pemohon', 'u_tanggal'], 2: ['c_0', 'd_0'], 3: ['ttd'] };

  function panggil(fn, args) {
    return fetch('/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn: fn, args: args }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.__error) throw new Error(j.__error); return j.result; });
  }
  function tutupMuat() { $('boot').classList.add('hidden'); MUAT.selesai(); $('root').classList.remove('hidden'); }
  function galat(pesan) {
    tutupMuat();
    $('root').innerHTML = '<div class="up-galat"><b>Halaman tidak bisa dibuka</b>' + esc(pesan) + '<br>Minta link terbaru ke petugas Lazismu.</div>';
  }
  function status(t) { var e = $('u_status'); if (e) e.textContent = t; }
  function simpanNanti() {
    clearTimeout(pewaktu);
    pewaktu = setTimeout(function () { status(U.simpan(S) ? 'Tersimpan di browser ini' : 'Penyimpanan browser tidak tersedia'); }, 400);
    if (LANGKAH === 3) siapkanNanti();
  }

  function opsi(jenis, nama, id, nilai, pilih, judul, ket) {
    return '<label class="up-opsi"><input type="' + jenis + '" name="' + nama + '" id="' + id + '" value="' + nilai + '"' + (pilih ? ' checked' : '') + '>'
      + '<span class="up-tanda' + (jenis === 'radio' ? ' bulat' : '') + '">' + CEK + '</span>'
      + '<span><b>' + judul + '</b><span class="k">' + ket + '</span></span></label>';
  }
  function isian(id, label, p, nilai, attr, lebar) {
    return '<div class="field' + (lebar ? ' lebar' : '') + '"><label for="' + id + '">' + label + '</label>'
      + '<input id="' + id + '" data-p="' + p + '" value="' + esc(nilai) + '" autocomplete="off" ' + (attr || '') + '></div>';
  }
  function aksi(kiri, kanan) {
    return '<div class="up-err" id="um_err" role="alert" tabindex="-1"></div>'
      + '<div class="up-aksi"><span class="up-status kiri" id="u_status" role="status"></span>' + (kiri || '') + kanan + '</div>';
  }

  function kerangka() {
    var nama = LEMBAGA.namaLembaga || 'Lazismu';
    $('root').innerHTML = '<div class="up-head"><div class="up-atas"><div class="up-id"><div class="up-logo lh-logo lz-logo-kepala">' + LZLogo.statis(nama) + '</div>'
      + '<div><div class="up-nama">Pengajuan UMP</div><div class="up-sub">' + esc(nama) + '</div></div></div>'
      + '<button class="up-tema kepala-tema" type="button" title="' + LZTema.judul(LZTema.gelap()) + '" aria-label="' + LZTema.judul(LZTema.gelap()) + '">' + LZTema.svg() + '</button></div>'
      + '<div class="up-langkah"><div class="up-lk" id="lk1"><i>1</i><span>Kantor dan formulir</span></div>'
      + '<div class="up-lk" id="lk2"><i>2</i><span>Rincian</span></div>'
      + '<div class="up-lk" id="lk3"><i>3</i><span>Tanda tangan</span></div></div></div>'
      + '<div id="umIsi"></div>'
      + '<div class="up-kaki">Isian dan tanda tangan tersimpan hanya di browser ini dan tidak dikirim ke server.<br>Menghapus data browser ikut menghapus isian.</div>';
  }

  function langkah1() {
    var p = S.profil, kini = p.kll ? p.tipe + '|' + p.kll : '', ada = false;
    var o = KANTOR.map(function (k) {
      var v = k.tipe + '|' + k.nama; if (v === kini) ada = true;
      return '<option value="' + esc(v) + '"' + (v === kini ? ' selected' : '') + '>' + esc(k.tipe + ' ' + k.nama) + '</option>';
    }).join('');
    if (kini && !ada) o = '<option value="' + esc(kini) + '" selected>' + esc(U.labelKantor(p)) + '</option>' + o;
    return '<section class="up-kartu"><h2>Kantor layanan</h2><p class="up-ket">Nama diambil dari data Lazismu. Ketik untuk mencari.</p>'
      + '<div class="up-grid"><div class="field lebar"><label for="u_kantor">Nama KL/ULL</label><select id="u_kantor" data-selalu-cari="1">'
      + '<option value="">Pilih kantor layanan</option>' + o + '</select></div>'
      + isian('u_pemohon', 'Nama pemohon', 'pemohon', p.pemohon, 'maxlength="60"')
      + '<div class="field"><label for="u_tanggal">Tanggal pengajuan</label><input type="date" id="u_tanggal" value="' + esc(S.tanggal) + '"></div></div></section>'
      + '<section class="up-kartu"><h2>Formulir yang diajukan</h2><p class="up-ket">Pilih satu atau keduanya. Yang tidak dipilih tidak ikut dibuat.</p><div class="up-pilih">'
      + opsi('checkbox', 'form', 'f_c', 'c', S.form.c, '<span class="up-kode">F-08-C</span>Usulan UMP Program', 'Infak tidak terikat (non amil) per pilar, dengan asnaf.')
      + opsi('checkbox', 'form', 'f_d', 'd', S.form.d, '<span class="up-kode">F-08-D</span>Operasional KLL', 'Sembilan pos biaya operasional kantor dan lampiran daftar gaji.')
      + '</div></section>'
      + '<section class="up-kartu"><h2>Rekening tujuan</h2><p class="up-ket">Tempat dana UMP ditransfer.</p><div class="up-pilih">'
      + opsi('radio', 'rek', 'r_va', 'va', p.rek !== 'manual', 'VA ' + U.VA_BANK + '<span class="up-saran">Disarankan</span>', 'Nomor VA dikonfirmasi bagian keuangan lewat WhatsApp.')
      + opsi('radio', 'rek', 'r_manual', 'manual', p.rek === 'manual', 'Rekening lain', 'Tulis bank, nomor, dan nama pemilik rekening.')
      + '</div><div class="up-manual up-grid' + (p.rek === 'manual' ? '' : ' hidden') + '" id="um_manual">'
      + isian('u_bank', 'Nama bank', 'bank', p.bank, 'maxlength="60"')
      + isian('u_rekening', 'Nomor rekening', 'rekening', p.rekening, 'maxlength="30" inputmode="numeric"')
      + isian('u_atasnama', 'Atas nama', 'atasNama', p.atasNama, 'maxlength="60"', true)
      + '</div></section>'
      + aksi('', '<button type="button" class="btn btn-primary" data-ke="2">Lanjut ke rincian</button>');
  }

  function baris(j, i, n) {
    var r = S[j][i], id = j + '_' + i, a = ' data-j="' + j + '" data-i="' + i + '"';
    return '<div class="up-baris ' + j + (r.jumlah ? ' isi' : '') + '" id="b_' + id + '"><span class="up-no">' + (i + 1) + '</span><div class="up-nm">' + esc(n) + '</div>'
      + '<div class="up-rp"><input id="' + id + '"' + a + ' data-f="jumlah" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Jumlah ' + esc(n) + '" value="' + (r.jumlah ? U.fmt(r.jumlah) : '') + '"></div>'
      + (j === 'c' ? '<input id="' + id + '_a"' + a + ' data-f="asnaf" list="dl_asnaf" maxlength="30" autocomplete="off" placeholder="Asnaf" aria-label="Asnaf ' + esc(n) + '" value="' + esc(r.asnaf) + '">' : '')
      + '<div class="up-rc"><input' + a + ' data-f="rincian" maxlength="48" autocomplete="off" placeholder="Rincian program (opsional)" aria-label="Rincian ' + esc(n) + '" value="' + esc(r.rincian) + '"></div></div>';
  }
  function kartuForm(j, kode, judul, ket, daftar, tambahan) {
    return '<section class="up-kartu"><h2><span class="up-kode">' + kode + '</span>' + judul + '</h2><p class="up-ket">' + ket + '</p>'
      + daftar.map(function (n, i) { return baris(j, i, n); }).join('') + (tambahan || '')
      + '<div class="up-total"><span>Total diajukan</span><b id="tot_' + j + '">Rp ' + U.fmt(U.total(S[j])) + '</b></div></section>';
  }
  function ringkas() {
    var p = S.profil, rek = p.rek === 'manual' ? p.bank + ' ' + p.rekening : 'VA ' + U.VA_BANK;
    return '<section class="up-kartu"><div class="up-ringkas"><div><b>' + esc(U.labelKantor(p)) + '</b>'
      + '<div class="up-status">' + esc(p.pemohon) + ' &middot; ' + esc(U.tanggalPanjang(S.tanggal)) + ' &middot; ' + esc(rek) + '</div></div>'
      + '<button type="button" class="btn btn-sm" data-ke="1">Ubah</button></div></section>';
  }
  function langkah2() {
    return ringkas()
      + (S.form.c ? kartuForm('c', 'F-08-C', 'Usulan UMP Program', 'Isi jumlah pada pilar yang diajukan. Pilar yang kosong tetap tercetak kosong.', U.PILAR) : '')
      + (S.form.d ? kartuForm('d', 'F-08-D', 'Operasional KLL', 'Isi jumlah pada pos biaya yang diajukan.', U.BIAYA,
        '<label class="up-cek"><input type="checkbox" id="u_gaji"' + (S.gaji ? ' checked' : '') + '> Lampirkan daftar gaji</label>') : '')
      + aksi('<button type="button" class="btn" data-ke="1">Kembali</button>', '<button type="button" class="btn btn-primary" data-ke="3">Lanjut ke tanda tangan</button>')
      + '<datalist id="dl_asnaf">' + U.ASNAF.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
  }
  function langkah3() {
    var t = S.ttd, dig = t.jenis === 'digital', ungg = t.cara === 'unggah';
    return ringkas()
      + '<section class="up-kartu"><h2>Tanda tangan pemohon</h2><p class="up-ket">Pilih cara pemohon menandatangani formulir.</p><div class="up-pilih">'
      + opsi('radio', 'ttdj', 't_basah', 'basah', !dig, 'Tanda tangan basah', 'Kolom tanda tangan dibiarkan kosong. Cetak PDF, lalu tanda tangani di kertas.')
      + opsi('radio', 'ttdj', 't_digital', 'digital', dig, 'Tanda tangan digital', 'Tanda tangan langsung menempel di kolom pemohon pada PDF.')
      + '</div><div class="up-manual' + (dig ? '' : ' hidden') + '" id="ttd" tabindex="-1">'
      + '<div class="up-seg" role="radiogroup" aria-label="Cara tanda tangan digital">'
      + '<label><input type="radio" name="ttdc" value="gambar"' + (ungg ? '' : ' checked') + '><span>Tanda tangan di layar</span></label>'
      + '<label><input type="radio" name="ttdc" value="unggah"' + (ungg ? ' checked' : '') + '><span>Unggah foto</span></label></div>'
      + '<div id="ttd_gambar"' + (ungg ? ' hidden' : '') + '><div class="up-pad" id="ttd_pad"><canvas id="ttd_kanvas" aria-label="Area tanda tangan. Gambar dengan jari, stylus, atau mouse."></canvas>'
      + '<span class="up-pad-garis" aria-hidden="true"></span><span class="up-pad-teks" aria-hidden="true">Tanda tangan di sini</span></div>'
      + '<div class="up-pad-aksi"><span class="up-status">Gunakan jari, stylus, atau mouse. Tersimpan otomatis.</span><button type="button" class="btn btn-sm" id="ttd_hapus">Hapus</button></div></div>'
      + '<div id="ttd_unggah"' + (ungg ? '' : ' hidden') + '>'
      + '<label class="up-zona" id="ttd_zona"><input type="file" id="ttd_file" accept="image/*">'
      + '<b>Pilih foto tanda tangan</b><span>JPG atau PNG. Latar putih kertas dihapus otomatis, yang tersisa hanya goresan tinta.</span></label>'
      + '<div class="up-tips"><b>Supaya hasilnya bersih</b><ol>'
      + '<li>Tanda tangani kertas putih polos (tanpa garis) dengan pulpen hitam atau biru.</li>'
      + '<li>Foto di tempat terang, tanpa bayangan tangan atau HP di atas kertas.</li>'
      + '<li>Foto tegak lurus dari atas, dekatkan sampai tanda tangan memenuhi foto.</li>'
      + '<li>Periksa hasilnya di bawah. Kalau masih ada noda atau bayangan, foto ulang.</li></ol></div>'
      + '<p class="up-status" id="ttd_info" role="status"></p><div class="up-hasil' + (ungg && t.gambar ? '' : ' hidden') + '" id="ttd_hasil">'
      + (ungg && t.gambar ? '<img src="' + t.gambar + '" alt="Hasil tanda tangan tanpa latar">' : '') + '</div></div></div></section>'
      + '<section class="up-kartu"><h2>Simpan atau kirim</h2><p class="up-ket">PDF A4 dibuat di perangkat ini, satu halaman per formulir. '
      + 'Kirim lewat WhatsApp: di HP muncul menu bagikan, pilih WhatsApp lalu kontak atau grup tujuan. Di laptop, PDF terunduh lalu WhatsApp terbuka; lampirkan berkas itu di chat.</p>'
      + '<div class="up-kirim"><button type="button" class="btn up-besar" id="u_pdf">' + IKON_UNDUH + '<span>Simpan PDF</span></button>'
      + '<button type="button" class="btn btn-primary up-besar" id="u_wa">' + IKON_WA + '<span>Kirim lewat WhatsApp</span></button></div></section>'
      + aksi('', '<button type="button" class="btn" data-ke="2">Kembali</button>');
  }

  function gambar(gulir) {
    $('umIsi').innerHTML = LANGKAH === 1 ? langkah1() : LANGKAH === 2 ? langkah2() : langkah3();
    [1, 2, 3].forEach(function (n) { $('lk' + n).className = 'up-lk' + (n === LANGKAH ? ' on' : n < LANGKAH ? ' lewat' : ''); });
    if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
    if (LANGKAH === 3) { pasangPad(); pasangZona(); siapkanNanti(); }
    if (gulir) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  /* Isian yang disembunyikan penyelaras (select, tanggal) difokuskan lewat tombol penggantinya. */
  function fokus(id) {
    var e = $(id);
    if (e && e.style.display === 'none' && e.previousSibling && e.previousSibling.querySelector) e = e.previousSibling.querySelector('button') || e;
    if (e) { e.focus(); if (e.scrollIntoView) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function tampilGalat(g) {
    var box = $('um_err');
    box.innerHTML = '<b>Belum lengkap</b><ul>' + g.map(function (x) { return '<li><a href="#' + x.id + '" data-fokus="' + x.id + '">' + esc(x.pesan) + '</a></li>'; }).join('') + '</ul>';
    box.focus();
  }
  /* Galat langkah 1 sampai n. Kalau ada yang tertinggal di langkah sebelumnya, pindah ke sana. */
  function galatSampai(n) {
    var semua = U.periksa(S).galat;
    for (var k = 1; k <= n; k++) {
      var g = semua.filter(function (x) { return LANGKAH_ID[k].indexOf(x.id) >= 0; });
      if (g.length) { if (k !== LANGKAH) { LANGKAH = k; gambar(true); } tampilGalat(g); return true; }
    }
    return false;
  }
  function totalBaru(j) {
    var t = $('tot_' + j); if (!t) return;
    t.textContent = 'Rp ' + U.fmt(U.total(S[j]));
    t.classList.remove('naik'); void t.offsetWidth; t.classList.add('naik');
  }
  /* ---------------------------------------------------------------- tanda tangan */
  /* Pangkas ke goresan, perkecil (paling besar 600 x 240), simpan sebagai PNG bening. */
  function jadiPng(sumber, w, h, foto) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.drawImage(sumber, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h), kotak = U.bersihkanLatar(d.data, w, h, foto);
    if (!kotak) return '';
    x.putImageData(d, 0, 0);
    var pad = 4, sx = Math.max(0, kotak.x - pad), sy = Math.max(0, kotak.y - pad);
    var sw = Math.min(w - sx, kotak.w + pad * 2), sh = Math.min(h - sy, kotak.h + pad * 2);
    var k = Math.min(1, 600 / sw, 240 / sh), o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(sw * k)); o.height = Math.max(1, Math.round(sh * k));
    o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
    return U.sahTtd(o.toDataURL('image/png'));
  }
  function setTtd(g) { S.ttd.gambar = g; CACHE.kunci = ''; simpanNanti(); }

  function pasangPad() {
    var kv = $('ttd_kanvas'); if (!kv) return;
    var wadah = $('ttd_pad'), x = kv.getContext('2d'), r = window.devicePixelRatio || 1, gores = false, ada = false, akhir = null;
    function ukur() {
      kv.width = Math.round(wadah.clientWidth * r); kv.height = Math.round(wadah.clientHeight * r);
      x.setTransform(r, 0, 0, r, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 2.4; x.strokeStyle = '#111827';
      ada = false; wadah.classList.remove('terisi');
      if (S.ttd.gambar && S.ttd.cara === 'gambar') {
        var im = new Image();
        im.onload = function () {
          var sk = Math.min(wadah.clientWidth * 0.86 / im.width, wadah.clientHeight * 0.7 / im.height, 1);
          x.drawImage(im, (wadah.clientWidth - im.width * sk) / 2, (wadah.clientHeight - im.height * sk) / 2, im.width * sk, im.height * sk);
          ada = true; wadah.classList.add('terisi');
        };
        im.src = S.ttd.gambar;
      }
    }
    function titik(e) { var b = kv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    kv.addEventListener('pointerdown', function (e) {
      e.preventDefault(); kv.setPointerCapture(e.pointerId); gores = true; akhir = titik(e);
      x.beginPath(); x.arc(akhir.x, akhir.y, 1.2, 0, Math.PI * 2); x.fillStyle = '#111827'; x.fill();
      if (!ada) { ada = true; wadah.classList.add('terisi'); }
    });
    kv.addEventListener('pointermove', function (e) {
      if (!gores) return;
      var p = titik(e), m = { x: (akhir.x + p.x) / 2, y: (akhir.y + p.y) / 2 };
      x.beginPath(); x.moveTo(akhir.x, akhir.y); x.quadraticCurveTo(akhir.x, akhir.y, m.x, m.y); x.lineTo(p.x, p.y); x.stroke(); akhir = p;
    });
    function selesai() {
      if (!gores) return; gores = false;
      setTtd(jadiPng(kv, kv.width, kv.height, false));
    }
    kv.addEventListener('pointerup', selesai); kv.addEventListener('pointercancel', selesai);
    $('ttd_hapus').onclick = function () { x.clearRect(0, 0, kv.width, kv.height); ada = false; wadah.classList.remove('terisi'); setTtd(''); };
    ukur();
    var lebar = wadah.clientWidth;
    window.addEventListener('resize', function () { if ($('ttd_kanvas') === kv && wadah.clientWidth !== lebar) { lebar = wadah.clientWidth; ukur(); } });
  }

  function pasangZona() {
    var inp = $('ttd_file'); if (!inp) return;
    var zona = $('ttd_zona');
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('di-atas'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('di-atas'); });
    zona.addEventListener('drop', function (e) { e.preventDefault(); zona.classList.remove('di-atas'); if (e.dataTransfer.files[0]) olah(e.dataTransfer.files[0]); });
    inp.addEventListener('change', function () { if (inp.files[0]) olah(inp.files[0]); inp.value = ''; });
  }
  function olah(f) {
    var info = $('ttd_info');
    if (!/^image\//.test(f.type)) { info.textContent = 'Berkas ini bukan gambar. Pilih foto JPG atau PNG.'; return; }
    if (f.size > 15 * 1024 * 1024) { info.textContent = 'Foto lebih dari 15 MB. Pilih foto yang lebih kecil.'; return; }
    info.textContent = 'Menghapus latar putih...';
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
      var g = jadiPng(im, Math.max(1, Math.round(im.naturalWidth * k)), Math.max(1, Math.round(im.naturalHeight * k)), true);
      if (!g) { info.textContent = 'Goresan tanda tangan tidak terlihat di foto ini. Gunakan pulpen gelap di kertas putih, lalu foto ulang.'; return; }
      setTtd(g);
      $('ttd_hasil').innerHTML = '<img src="' + g + '" alt="Hasil tanda tangan tanpa latar">';
      $('ttd_hasil').classList.remove('hidden');
      info.textContent = 'Latar sudah dihapus. Begini tanda tangan akan menempel di PDF.';
    };
    im.onerror = function () { URL.revokeObjectURL(url); info.textContent = 'Foto tidak bisa dibaca. Coba foto lain.'; };
    im.src = url;
  }

  /* ---------------------------------------------------------------- PDF dan WhatsApp */
  function muatGambar(src) {
    return new Promise(function (ok) { if (!src) return ok(null); var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  }
  function kunciPdf() { return JSON.stringify(S); }
  /* PDF dibuat lebih dulu begitu langkah 3 dibuka dan setiap isian berubah, supaya
     tombol Bagikan memanggil navigator.share saat ketukan masih "segar": Safari
     menolak share() yang menunggu pekerjaan lama sesudah ketukan. */
  function buatPdf() {
    var k = kunciPdf();
    if (CACHE.kunci === k && CACHE.blob) return Promise.resolve(CACHE.blob);
    var s = JSON.parse(k);
    return muatGambar(s.ttd.jenis === 'digital' ? s.ttd.gambar : '').then(function (img) {
      var hal = U.halamanKanvas(s, function (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, img);
      return LZPdf.buat(hal.map(function (c) { return c.toDataURL('image/jpeg', 0.92); }), { lebar: 595.28, tinggi: 841.89, margin: 0 });
    }).then(function (b) { if (kunciPdf() === k) { CACHE.kunci = k; CACHE.blob = b; } return b; });
  }
  function siapkanNanti() {
    clearTimeout(pewaktuPdf);
    pewaktuPdf = setTimeout(function () { if (LANGKAH === 3 && !U.periksa(S).galat.length) buatPdf().catch(function () {}); }, 600);
  }
  function unduh(blob) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = U.namaBerkas(S); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  }
  function sibuk(btn, ya) { btn.disabled = ya; btn.classList.toggle('memuat', ya); }

  function simpanPdf(btn) {
    if (galatSampai(3)) return;
    sibuk(btn, true);
    buatPdf().then(function (b) { unduh(b); status('PDF tersimpan: ' + U.namaBerkas(S)); })
      .catch(function (e) { status('PDF gagal dibuat: ' + (e && e.message || e)); })
      .then(function () { sibuk(btn, false); });
  }
  function kirimWa(btn) {
    if (galatSampai(3)) return;
    var pesan = U.pesanWa(S), nama = U.namaBerkas(S);
    function bagikan(blob) {
      var f = new File([blob], nama, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        return navigator.share({ files: [f], title: nama, text: pesan }).then(function () { status('Dibagikan. Pastikan terkirim di WhatsApp.'); }, function (e) {
          if (e && e.name === 'AbortError') return status('Batal dibagikan.');
          cadangan(blob);
        });
      }
      cadangan(blob);
    }
    /* Peramban tanpa berbagi berkas (umumnya laptop): unduh lalu buka WhatsApp dengan pesan siap kirim. */
    var jendela = null;
    function cadangan(blob) {
      unduh(blob);
      var url = 'https://wa.me/?text=' + encodeURIComponent(pesan + '\n(' + nama + ')');
      if (jendela && !jendela.closed) jendela.location.href = url; else window.open(url, '_blank', 'noopener');
      status('PDF terunduh. Lampirkan berkas ' + nama + ' di chat WhatsApp yang terbuka.');
    }
    if (CACHE.kunci === kunciPdf() && CACHE.blob) return bagikan(CACHE.blob);
    var bisaBerkas = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }));
    if (!bisaBerkas) jendela = window.open('', '_blank');
    sibuk(btn, true);
    buatPdf().then(bagikan).catch(function (e) { if (jendela) jendela.close(); status('PDF gagal dibuat: ' + (e && e.message || e)); })
      .then(function () { sibuk(btn, false); });
  }

  /* ---------------------------------------------------------------- isian dan tombol */
  function ubah(e) {
    var t = e.target, d = t.dataset || {};
    if (t.id === 'ttd_file') return;
    if (d.f) {
      var r = S[d.j][Number(d.i)];
      if (d.f === 'jumlah') {
        var dari = t.value.length - (t.selectionEnd == null ? t.value.length : t.selectionEnd);
        r.jumlah = U.angka(t.value);
        t.value = /\d/.test(t.value) ? U.fmt(r.jumlah) : '';
        var pos = Math.max(0, t.value.length - dari);
        if (document.activeElement === t) t.setSelectionRange(pos, pos);
        $('b_' + d.j + '_' + d.i).classList.toggle('isi', r.jumlah > 0);
        totalBaru(d.j);
      } else r[d.f] = t.value;
    } else if (d.p) S.profil[d.p] = t.value;
    else if (t.id === 'u_kantor') { var k = t.value.split('|'); S.profil.tipe = k[0] === 'ULL' ? 'ULL' : 'KLL'; S.profil.kll = k.slice(1).join('|'); }
    else if (t.id === 'u_tanggal') S.tanggal = t.value;
    else if (t.name === 'form') S.form[t.value] = t.checked;
    else if (t.name === 'rek') { S.profil.rek = t.value; $('um_manual').classList.toggle('hidden', t.value !== 'manual'); if (t.value === 'manual') fokus('u_bank'); }
    else if (t.name === 'ttdj') { S.ttd.jenis = t.value; $('ttd').classList.toggle('hidden', t.value !== 'digital'); if (t.value === 'digital') pasangUlangPad(); }
    else if (t.name === 'ttdc') {
      /* Ganti cara: tanda tangan cara lain dibuang supaya yang tercetak selalu yang terlihat. */
      if (S.ttd.cara !== t.value) { S.ttd.cara = t.value; S.ttd.gambar = ''; }
      $('ttd_gambar').hidden = t.value !== 'gambar'; $('ttd_unggah').hidden = t.value !== 'unggah';
      $('ttd_hasil').classList.add('hidden'); $('ttd_info').textContent = '';
      if (t.value === 'gambar') pasangUlangPad();
    }
    else if (t.id === 'u_gaji') S.gaji = t.checked;
    else return;
    var box = $('um_err'); if (box && box.innerHTML) box.innerHTML = '';
    simpanNanti();
  }
  /* Kanvas yang baru terlihat (sebelumnya tersembunyi) diukur ulang. */
  function pasangUlangPad() {
    var p = $('ttd_pad'); if (!p) return;
    p.innerHTML = '<canvas id="ttd_kanvas" aria-label="Area tanda tangan. Gambar dengan jari, stylus, atau mouse."></canvas><span class="up-pad-garis" aria-hidden="true"></span><span class="up-pad-teks" aria-hidden="true">Tanda tangan di sini</span>';
    pasangPad();
  }

  function klik(e) {
    var t = e.target.closest ? e.target.closest('button, a[data-fokus]') : null;
    if (!t) return;
    if (t.dataset.fokus) { e.preventDefault(); fokus(t.dataset.fokus); return; }
    if (t.dataset.ke) {
      var ke = Number(t.dataset.ke);
      if (ke > LANGKAH && galatSampai(ke - 1)) return;
      U.simpan(S); LANGKAH = ke; gambar(true);
    } else if (t.id === 'u_pdf') simpanPdf(t);
    else if (t.id === 'u_wa') kirimWa(t);
  }

  if (!TOKEN) { galat('Alamatnya tidak lengkap.'); return; }
  panggil('apiDaftarKantorUmp', [TOKEN]).then(function (d) {
    KANTOR = d.kantor || []; LEMBAGA = d.lembaga || {};
    tutupMuat(); kerangka(); gambar();
    $('root').addEventListener('input', ubah);
    $('root').addEventListener('change', ubah);
    $('root').addEventListener('click', klik);
  }).catch(function (e) { galat(e.message || String(e)); });
})();
