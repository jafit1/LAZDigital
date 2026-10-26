/* Layar /ump.html. Logika dan dokumen cetak ada di lz-ump.js; berkas ini
   menggambar dua langkah (kantor dan formulir, lalu rincian), menyimpan ke
   browser, dan membuka dokumen. Satu-satunya panggilan server: daftar nama
   kantor (apiDaftarKantorUmp), dengan token link saja. Isian tidak dikirim. */
(function () {
  'use strict';
  var U = window.LZUmp, esc = U.esc;
  function $(id) { return document.getElementById(id); }
  var TOKEN = new URLSearchParams(location.search).get('t') || '';
  var hari = (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
  var S = U.muat(null, hari), KANTOR = [], LEMBAGA = {}, LANGKAH = 1, pewaktu = 0;
  var CEK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 5 8.6 9.6 3.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ID_LANGKAH1 = ['u_kantor', 'f_c', 'u_bank', 'u_rekening', 'u_atasnama', 'u_pemohon', 'u_tanggal'];

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

  function simpanNanti() {
    clearTimeout(pewaktu);
    pewaktu = setTimeout(function () {
      var st = $('u_status');
      if (st) st.textContent = U.simpan(S) ? 'Tersimpan di browser ini' : 'Penyimpanan browser tidak tersedia';
    }, 400);
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

  function kerangka() {
    var nama = LEMBAGA.namaLembaga || 'Lazismu';
    $('root').innerHTML = '<div class="up-head"><div class="up-atas"><div class="up-id"><div class="up-logo lh-logo lz-logo-kepala">' + LZLogo.statis(nama) + '</div>'
      + '<div><div class="up-nama">Pengajuan UMP</div><div class="up-sub">' + esc(nama) + '</div></div></div>'
      + '<button class="up-tema kepala-tema" type="button" title="' + LZTema.judul(LZTema.gelap()) + '" aria-label="' + LZTema.judul(LZTema.gelap()) + '">' + LZTema.svg() + '</button></div>'
      + '<div class="up-langkah"><div class="up-lk" id="lk1"><i>1</i><span>Kantor dan formulir</span></div>'
      + '<div class="up-lk" id="lk2"><i>2</i><span>Rincian pengajuan</span></div></div></div>'
      + '<div id="umIsi"></div>'
      + '<div class="up-kaki">Isian tersimpan hanya di browser ini dan tidak dikirim ke server.<br>Menghapus data browser ikut menghapus isian.</div>';
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
      + '<section class="up-kartu"><h2>Formulir yang diajukan</h2><p class="up-ket">Pilih satu atau keduanya. Yang tidak dipilih tidak ikut dicetak.</p><div class="up-pilih">'
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
      + '<div class="up-err" id="um_err" role="alert" tabindex="-1"></div>'
      + '<div class="up-aksi"><span class="up-status kiri" id="u_status" role="status"></span>'
      + '<button type="button" class="btn btn-primary" id="u_lanjut">Lanjut ke rincian</button></div>';
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
  function langkah2() {
    var p = S.profil, rek = p.rek === 'manual' ? p.bank + ' ' + p.rekening : 'VA ' + U.VA_BANK;
    return '<section class="up-kartu"><div class="up-ringkas"><div><b>' + esc(U.labelKantor(p)) + '</b>'
      + '<div class="up-status">' + esc(p.pemohon) + ' &middot; ' + esc(U.tanggalPanjang(S.tanggal)) + ' &middot; ' + esc(rek) + '</div></div>'
      + '<button type="button" class="btn btn-sm" id="u_kembali">Ubah</button></div></section>'
      + (S.form.c ? kartuForm('c', 'F-08-C', 'Usulan UMP Program', 'Isi jumlah pada pilar yang diajukan. Pilar yang kosong tetap tercetak kosong.', U.PILAR) : '')
      + (S.form.d ? kartuForm('d', 'F-08-D', 'Operasional KLL', 'Isi jumlah pada pos biaya yang diajukan.', U.BIAYA,
        '<label class="up-cek"><input type="checkbox" id="u_gaji"' + (S.gaji ? ' checked' : '') + '> Lampirkan daftar gaji</label>') : '')
      + '<div class="up-err" id="um_err" role="alert" tabindex="-1"></div>'
      + '<div class="up-aksi"><span class="up-status kiri" id="u_status" role="status"></span>'
      + '<button type="button" class="btn" id="u_balik">Kembali</button>'
      + '<button type="button" class="btn btn-primary" id="u_cetak">Buat PDF</button></div>'
      + '<datalist id="dl_asnaf">' + U.ASNAF.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
  }

  function gambar(gulir) {
    $('umIsi').innerHTML = LANGKAH === 1 ? langkah1() : langkah2();
    $('lk1').className = 'up-lk ' + (LANGKAH === 1 ? 'on' : 'lewat');
    $('lk2').className = 'up-lk' + (LANGKAH === 2 ? ' on' : '');
    if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
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
  function totalBaru(j) {
    var t = $('tot_' + j); if (!t) return;
    t.textContent = 'Rp ' + U.fmt(U.total(S[j]));
    t.classList.remove('naik'); void t.offsetWidth; t.classList.add('naik');
  }

  function ubah(e) {
    var t = e.target, d = t.dataset || {};
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
    else if (t.id === 'u_gaji') S.gaji = t.checked;
    else return;
    var box = $('um_err'); if (box && box.innerHTML) box.innerHTML = '';
    simpanNanti();
  }

  function klik(e) {
    var t = e.target.closest ? e.target.closest('button, a[data-fokus]') : null;
    if (!t) return;
    if (t.dataset.fokus) { e.preventDefault(); fokus(t.dataset.fokus); return; }
    if (t.id === 'u_lanjut') {
      var g = U.periksa(S).galat.filter(function (x) { return ID_LANGKAH1.indexOf(x.id) >= 0; });
      if (g.length) return tampilGalat(g);
      U.simpan(S); LANGKAH = 2; gambar(true);
    } else if (t.id === 'u_kembali' || t.id === 'u_balik') { LANGKAH = 1; gambar(true); }
    else if (t.id === 'u_cetak') {
      var p = U.periksa(S);
      if (p.galat.length) return tampilGalat(p.galat);
      $('um_err').innerHTML = '';
      U.simpan(S);
      var w = window.open('', '_blank');
      if (!w) { $('u_status').textContent = 'Pop-up diblokir. Izinkan pop-up untuk halaman ini lalu coba lagi.'; return; }
      w.document.open(); w.document.write(U.bangunHTML(S)); w.document.close();
    }
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
