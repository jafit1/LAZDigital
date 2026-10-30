'use strict';
(function () {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const H = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kunci = (id) => 'laz_asesmen_mustahik_v1_' + String(id || '');
  const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  const tanggalIndo = (t) => {
    const p = String(t || '').split('-');
    return p.length === 3 ? Number(p[2]) + ' ' + ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][Number(p[1]) - 1] + ' ' + p[0] : (t || '-');
  };

  let C, API, induk, lokal = [], server = [], draf = null, tab = 'riwayat', saringCari = '', saringHasil = '';

  const SARAN_KEBUTUHAN = [
    'Kebutuhan pokok',
    'Biaya pengobatan',
    'Biaya pendidikan',
    'Bedah rumah',
    'Modal usaha',
    'Ibnu Sabil',
    'Bantuan lembaga'
  ];

  function bacaLokal() {
    try {
      const a = JSON.parse(localStorage.getItem(kunci(C.pengguna.id)) || '[]');
      return Array.isArray(a) ? a.filter((x) => x && x.id) : [];
    } catch (_) { return []; }
  }

  function simpanLokal(a) {
    try {
      localStorage.setItem(kunci(C.pengguna.id), JSON.stringify(a.slice(0, 300)));
      return true;
    } catch (_) { return false; }
  }

  function gabung() {
    const m = new Map();
    lokal.concat(server).forEach((x) => {
      const s = m.get(x.id);
      if (!s || String(x.diubah || x.dibuat).localeCompare(String(s.diubah || s.dibuat)) > 0) m.set(x.id, x);
    });
    return [...m.values()].sort((a, b) => String(b.diubah || b.dibuat).localeCompare(String(a.diubah || a.dibuat)));
  }

  const semuaTanya = () => C.formulir.bagian.flatMap((b) => b.pertanyaan);

  function pesanToast(pesan, merah = false) {
    const t = document.getElementById('toast');
    if (t) {
      t.textContent = pesan;
      t.className = 'toast show' + (merah ? ' toast--danger' : '');
      clearTimeout(t._tmr);
      t._tmr = setTimeout(() => { t.className = 'toast'; }, 3200);
      return;
    }
    if (window.toast) {
      window.toast(pesan, merah);
      return;
    }
    alert(pesan);
  }

  function konfirmasiHapus(namaMustahik, onYa) {
    let modalBg = document.getElementById('modalBg');
    let modalTitle = document.getElementById('modalTitle');
    let modalBody = document.getElementById('modalBody');
    let modalFoot = document.getElementById('modalFoot');

    if (!modalBg) {
      modalBg = document.createElement('div');
      modalBg.id = 'amModalKonfirmasiBg';
      modalBg.className = 'modal-bg';
      modalBg.innerHTML = `
        <div class="modal" id="amModalCard" style="max-width:440px">
          <div class="modal-head">
            <h3 id="amModalTitle">Konfirmasi Hapus</h3>
            <button class="close-x" type="button" id="amBtnCloseX">&times;</button>
          </div>
          <div class="modal-body" id="amModalBody"></div>
          <div class="modal-foot" id="amModalFoot"></div>
        </div>
      `;
      document.body.appendChild(modalBg);
      modalTitle = document.getElementById('amModalTitle');
      modalBody = document.getElementById('amModalBody');
      modalFoot = document.getElementById('amModalFoot');
      const closeX = document.getElementById('amBtnCloseX');
      if (closeX) closeX.onclick = () => modalBg.classList.remove('show');
    }

    if (modalTitle) modalTitle.textContent = 'Hapus Asesmen Mustahik';
    if (modalBody) {
      modalBody.innerHTML = `
        <div style="text-align:center;padding:12px 6px 6px">
          <div style="width:52px;height:52px;border-radius:50%;background:rgba(239,68,68,0.12);color:var(--red);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </div>
          <h4 style="margin:0 0 8px;font-size:15px;font-weight:700;color:var(--text)">Yakin ingin menghapus riwayat ini?</h4>
          <p class="muted" style="margin:0;font-size:13px;line-height:1.45">
            Hasil survei dan penilaian untuk <b>${H(namaMustahik)}</b> akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
          </p>
        </div>
      `;
    }
    if (modalFoot) {
      modalFoot.innerHTML = `
        <button class="btn btn-ghost" type="button" id="amBtnBatalHapus">Batal</button>
        <button class="btn btn-danger" type="button" id="amBtnYaHapus">Ya, Hapus Asesmen</button>
      `;
    }

    modalBg.classList.add('show');

    const tutup = () => {
      modalBg.classList.remove('show');
    };

    const btnBatal = document.getElementById('amBtnBatalHapus');
    if (btnBatal) btnBatal.onclick = tutup;

    const btnYa = document.getElementById('amBtnYaHapus');
    if (btnYa) {
      btnYa.onclick = async () => {
        tutup();
        await onYa();
      };
    }
  }

  function kelasHasil(h) {
    if (/Sangat/i.test(h)) return 'am-badge-sangat';
    if (/Belum/i.test(h)) return 'am-badge-belum';
    return 'am-badge-layak';
  }

  function hitungSkorSaatIni(jawaban) {
    let skor = 0, terisi = 0;
    semuaTanya().forEach((q) => {
      const o = q.opsi.find((opt) => opt.id === jawaban[q.id]);
      if (o) { skor += o.skor; terisi++; }
    });
    const hasilObj = C.formulir.hasil.find((x) => skor >= x.min && skor <= x.max) || C.formulir.hasil[0];
    return { skor, terisi, total: semuaTanya().length, hasil: hasilObj.label };
  }

  function judul() {
    const total = gabung().length;
    return '<section class="am-kepala card">'
      + '<div class="am-kepala-isi">'
      + '<span class="am-jejak">SURVEI &amp; PENILAIAN</span>'
      + '<h2>Asesmen Mustahik</h2>'
      + '<p>Survei lapangan calon mustahik, penilaian terstandar, dan penyimpanan ganda server dan perangkat.</p>'
      + '</div>'
      + '<div class="am-angka"><b>' + total + '</b><span>asesmen tercatat</span></div>'
      + '</section>';
  }

  function tombol(isi, aksi, kelas) {
    return '<button type="button" class="btn ' + (kelas || '') + '" data-aksi="' + aksi + '">' + isi + '</button>';
  }

  function field(label, key, value, type, required) {
    return '<label class="am-field"><span>' + H(label) + (required ? ' *' : '') + '</span>'
      + '<input data-kunci="' + H(key) + '" type="' + H(type || 'text') + '" value="' + H(value || '') + '"'
      + (required ? ' required' : '') + (key === 'petugas' ? ' readonly aria-readonly="true"' : '') + '></label>';
  }

  function gambarRiwayat() {
    const semua = gabung();
    const hitung = { total: semua.length, sangat: 0, layak: 0, belum: 0, lokal: 0 };
    semua.forEach((x) => {
      if (/Sangat/i.test(x.hasil)) hitung.sangat++;
      else if (/Belum/i.test(x.hasil)) hitung.belum++;
      else hitung.layak++;
      if (x.sumber === 'perangkat') hitung.lokal++;
    });

    const tersaring = semua.filter((x) => {
      if (saringHasil && saringHasil !== 'semua') {
        if (saringHasil === 'lokal' && x.sumber !== 'perangkat') return false;
        if (saringHasil !== 'lokal' && !x.hasil.toLowerCase().includes(saringHasil.toLowerCase())) return false;
      }
      if (saringCari) {
        const cari = saringCari.toLowerCase();
        const cocok = (x.mustahik || '').toLowerCase().includes(cari)
          || (x.tujuan || '').toLowerCase().includes(cari)
          || (x.alamat || '').toLowerCase().includes(cari)
          || (x.olehNama || x.petugas || '').toLowerCase().includes(cari);
        if (!cocok) return false;
      }
      return true;
    });

    let h = '<div class="am-kpi-grid">'
      + '<div class="am-kpi-item card"><span class="am-kpi-label">Total Asesmen</span><b>' + hitung.total + '</b><small>Semua riwayat</small></div>'
      + '<div class="am-kpi-item am-kpi-sangat card"><span class="am-kpi-label">Sangat Layak</span><b>' + hitung.sangat + '</b><small>Skor 89 - 155</small></div>'
      + '<div class="am-kpi-item am-kpi-layak card"><span class="am-kpi-label">Layak Dibantu</span><b>' + hitung.layak + '</b><small>Skor 64 - 88</small></div>'
      + '<div class="am-kpi-item am-kpi-belum card"><span class="am-kpi-label">Belum Layak</span><b>' + hitung.belum + '</b><small>Skor 32 - 63</small></div>'
      + '</div>';

    h += '<div class="am-toolbar card">'
      + '<div class="am-toolbar-atas">'
      + '<div class="am-cari-box">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
      + '<input type="text" id="amCari" placeholder="Cari nama mustahik, kebutuhan, alamat..." value="' + H(saringCari) + '">'
      + (saringCari ? '<button type="button" class="am-cari-bersih" id="amCariBersih" title="Hapus pencarian">&times;</button>' : '')
      + '</div>'
      + tombol('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><path d="M12 5v14"/><path d="M5 12h14"/></svg> Asesmen baru', 'baru', 'btn-primary am-btn-tambah')
      + '</div>'
      + '<div class="am-filter-chips">'
      + '<button type="button" class="am-chip' + (!saringHasil || saringHasil === 'semua' ? ' on' : '') + '" data-filter="semua">Semua (' + hitung.total + ')</button>'
      + '<button type="button" class="am-chip' + (saringHasil === 'sangat' ? ' on' : '') + '" data-filter="sangat">Sangat Layak (' + hitung.sangat + ')</button>'
      + '<button type="button" class="am-chip' + (saringHasil === 'layak' ? ' on' : '') + '" data-filter="layak">Layak (' + hitung.layak + ')</button>'
      + '<button type="button" class="am-chip' + (saringHasil === 'belum' ? ' on' : '') + '" data-filter="belum">Belum Layak (' + hitung.belum + ')</button>'
      + (hitung.lokal > 0 ? '<button type="button" class="am-chip am-chip-warn' + (saringHasil === 'lokal' ? ' on' : '') + '" data-filter="lokal">Belum Sinkron (' + hitung.lokal + ')</button>' : '')
      + '</div>'
      + '</div>';

    if (!tersaring.length) {
      h += '<div class="am-kosong card">'
        + '<div class="am-kosong-ikon"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 9h6"/><path d="M9 13h4"/></svg></div>'
        + '<b>' + (saringCari || saringHasil ? 'Tidak ada asesmen yang cocok' : 'Belum ada asesmen tersimpan') + '</b>'
        + '<p class="muted">' + (saringCari || saringHasil ? 'Coba ubah kata kunci pencarian atau saringan hasil.' : 'Mulai survei calon mustahik untuk mengisi 31 butir penilaian.') + '</p>'
        + (saringCari || saringHasil ? tombol('Reset saringan', 'reset-filter', 'btn-ghost') : tombol('Mulai asesmen baru', 'baru', 'btn-primary'))
        + '</div>';
    } else {
      h += '<div class="am-riwayat">' + tersaring.map((x) => {
        const clsBadge = kelasHasil(x.hasil);
        const belumSinkron = x.sumber === 'perangkat';
        return '<article class="am-item card' + (belumSinkron ? ' am-item-lokal' : '') + '">'
          + '<div class="am-item-top">'
          + '<div class="am-item-info">'
          + '<h4 class="am-item-nama">' + H(x.mustahik) + '</h4>'
          + '<div class="am-item-tags">'
          + '<span class="am-tag-tujuan">' + H(x.tujuan || C.formulir.nama) + '</span>'
          + '<span class="am-tag-tgl">' + H(tanggalIndo(x.tanggal)) + '</span>'
          + (x.alamat ? '<span class="am-tag-alamat" title="' + H(x.alamat) + '">' + H(x.alamat) + '</span>' : '')
          + '</div>'
          + '</div>'
          + '<div class="am-item-skor-box">'
          + '<div class="am-skor-angka"><b>' + Number(x.skor || 0) + '</b><small> / ' + Number(C.formulir.skor.max) + '</small></div>'
          + '<span class="am-badge ' + clsBadge + '">' + H(x.hasil) + '</span>'
          + '</div>'
          + '</div>'
          + '<div class="am-item-mid">'
          + '<span class="am-meta-petugas">Petugas: <b>' + H(x.olehNama || x.petugas || '-') + '</b></span>'
          + (belumSinkron
            ? '<span class="am-status-pill am-status-lokal"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Belum tersinkron ke server</span>'
            : '<span class="am-status-pill am-status-server"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg> Tersimpan di server</span>')
          + '</div>'
          + '<div class="am-item-aksi">'
          + tombol('Lihat ringkasan', 'lihat:' + H(x.id), 'btn-sm')
          + tombol('Cetak', 'cetak:' + H(x.id), 'btn-sm btn-ghost')
          + (x.olehId === C.pengguna.id || C.pengguna.peran === 'superadmin'
            ? (belumSinkron ? tombol('Sinkronkan', 'kirim:' + H(x.id), 'btn-sm btn-primary') : '')
              + tombol('Ubah', 'ubah:' + H(x.id), 'btn-sm btn-ghost')
              + tombol('Hapus', 'hapus:' + H(x.id), 'btn-sm btn-ghost am-hapus')
            : '')
          + '</div>'
          + '</article>';
      }).join('') + '</div>';
    }

    return h;
  }

  function gambarMulai() {
    draf = dataDraf(draf);
    induk.innerHTML = judul()
      + '<div class="am-atas">'
      + '<div><h3>Mulai asesmen baru</h3><p class="muted">Pilih formulir penilaian dan tentukan kebutuhan yang diajukan pemohon.</p></div>'
      + tombol('&larr; Kembali ke riwayat', 'riwayat', 'btn-ghost')
      + '</div>'
      + '<section class="am-mulai card">'
      + '<div class="am-mulai-kop">'
      + '<div class="am-form-badge">FORMULIR F.SURVEI</div>'
      + '<h4>Survei Calon Mustahik</h4>'
      + '<p class="muted">Instrumen evaluasi calon mustahik dengan 31 butir penilaian terbobot (skor 32 sampai 155).</p>'
      + '</div>'
      + '<div class="am-mulai-body">'
      + '<div class="am-field am-tujuan-box">'
      + '<span>Tujuan / Kebutuhan Bantuan *</span>'
      + '<input id="amTujuan" value="' + H(draf.tujuan) + '" placeholder="Ketik atau pilih saran kebutuhan di bawah..." required autocomplete="off">'
      + '</div>'
      + '<div class="am-saran-wrap">'
      + '<span class="am-saran-label">Pilihan cepat:</span>'
      + '<div class="am-saran-chips">'
      + SARAN_KEBUTUHAN.map((s) => '<button type="button" class="am-saran-btn' + (draf.tujuan === s ? ' on' : '') + '" data-saran="' + H(s) + '">' + H(s) + '</button>').join('')
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="am-footer">'
      + tombol('Batal', 'riwayat', 'btn-ghost')
      + tombol('Lanjutkan ke survei &rarr;', 'lanjut', 'btn-primary')
      + '</div>'
      + '</section>';

    induk.querySelectorAll('[data-saran]').forEach((b) => {
      b.addEventListener('click', () => {
        const inp = $('#amTujuan');
        if (inp) {
          inp.value = b.dataset.saran;
          induk.querySelectorAll('[data-saran]').forEach((x) => x.classList.toggle('on', x === b));
          inp.focus();
        }
      });
    });

    ikatTombol();
  }

  function dataDraf(x) {
    return Object.assign({
      jenis: 'survei-mustahik',
      formulir: C.formulir.kode,
      tanggal: C.hariIni,
      tujuan: '',
      petugas: C.pengguna.nama,
      mustahik: '',
      alamat: '',
      jawaban: {},
      elektronik: [],
      bantuanLain: [],
      catatan: ''
    }, x || {});
  }

  function perbaruiStatusBar(d) {
    const live = hitungSkorSaatIni(d.jawaban);
    const badgeEl = $('#amLiveBadge');
    const skorEl = $('#amLiveSkor');
    const progresEl = $('#amLiveProgres');
    const barEl = $('#amLiveBar');
    if (skorEl) skorEl.textContent = live.skor;
    if (progresEl) progresEl.textContent = live.terisi + ' dari ' + live.total + ' butir';
    if (barEl) barEl.style.width = Math.round((live.terisi / live.total) * 100) + '%';
    if (badgeEl) {
      badgeEl.textContent = live.hasil;
      badgeEl.className = 'am-badge ' + kelasHasil(live.hasil);
    }
  }

  function gambarForm() {
    draf = dataDraf(draf);
    const d = draf;
    const live = hitungSkorSaatIni(d.jawaban);

    let h = '<div class="am-form-header card">'
      + '<div class="am-form-header-kiri">'
      + '<button type="button" class="btn btn-sm btn-ghost" data-aksi="riwayat">&larr; Kembali</button>'
      + '<div>'
      + '<h3>Survei Calon Mustahik</h3>'
      + '<span class="muted">' + H(d.tujuan ? 'Kebutuhan: ' + d.tujuan : 'Formulir F.Survei 31 Butir') + '</span>'
      + '</div>'
      + '</div>'
      + '<div class="am-form-status-box">'
      + '<div class="am-live-info">'
      + '<span class="muted" id="amLiveProgres">' + live.terisi + ' dari ' + live.total + ' butir</span>'
      + '<div class="am-live-angka">Skor: <b id="amLiveSkor">' + live.skor + '</b> <small>/ ' + Number(C.formulir.skor.max) + '</small></div>'
      + '</div>'
      + '<span class="am-badge ' + kelasHasil(live.hasil) + '" id="amLiveBadge">' + live.hasil + '</span>'
      + '<div class="am-live-bar-wrap"><div class="am-live-bar" id="amLiveBar" style="width:' + Math.round((live.terisi / live.total) * 100) + '%"></div></div>'
      + '</div>'
      + '</div>';

    h += '<div class="am-data card">'
      + '<div class="am-data-h">'
      + '<span class="am-sec-badge">BAGIAN 1</span>'
      + '<b>Identitas Pemohon &amp; Petugas</b>'
      + '</div>'
      + '<div class="am-form-grid">'
      + field('Nama mustahik', 'mustahik', d.mustahik, 'text', true)
      + field('Tujuan/kebutuhan asesmen', 'tujuan', d.tujuan, 'text', true)
      + field('Tanggal survei', 'tanggal', d.tanggal, 'date', true)
      + field('Petugas survei', 'petugas', d.petugas, 'text')
      + '<label class="am-field am-penuh"><span>Alamat tempat tinggal</span><textarea data-kunci="alamat" rows="2" placeholder="Alamat lengkap calon mustahik...">' + H(d.alamat) + '</textarea></label>'
      + '</div>'
      + '</div>';

    let nomorGlobal = 1;
    C.formulir.bagian.forEach((b, idxBagian) => {
      h += '<section class="am-bagian card">'
        + '<div class="am-bagian-h">'
        + '<div class="am-sec-title">'
        + '<span class="am-sec-badge">BAGIAN ' + (idxBagian + 2) + '</span>'
        + '<b>' + H(b.nama) + '</b>'
        + '</div>'
        + '<span class="am-sec-count">' + b.pertanyaan.length + ' butir</span>'
        + '</div>'
        + '<div class="am-pertanyaan-list">';

      b.pertanyaan.forEach((q) => {
        const no = q.nomor || nomorGlobal++;
        const pilihan = d.jawaban[q.id] || '';
        h += '<fieldset class="am-tanya' + (pilihan ? ' am-terjawab' : '') + '" id="tanya_' + H(q.id) + '">'
          + '<legend class="am-tanya-legend">'
          + '<span class="am-no">' + no + '</span>'
          + '<span class="am-tanya-teks">' + H(q.nama) + '</span>'
          + '</legend>'
          + '<div class="am-opsi-grid">'
          + q.opsi.map((o) => {
            const aktif = pilihan === o.id;
            return '<label class="am-opsi-item' + (aktif ? ' on' : '') + '">'
              + '<input type="radio" name="am_' + H(q.id) + '" value="' + H(o.id) + '" data-q="' + H(q.id) + '"' + (aktif ? ' checked' : '') + '>'
              + '<span class="am-opsi-label">' + H(o.label) + '</span>'
              + '<span class="am-opsi-skor" title="Skor nilai">' + o.skor + '</span>'
              + '</label>';
          }).join('')
          + '</div>'
          + '</fieldset>';
      });

      h += '</div></section>';
    });

    h += '<section class="am-bagian card">'
      + '<div class="am-bagian-h">'
      + '<div class="am-sec-title"><span class="am-sec-badge">BAGIAN 6</span><b>Barang Elektronik yang Dimiliki</b></div>'
      + '<span class="am-sec-count">Opsional</span>'
      + '</div>'
      + '<p class="muted am-sec-desc">Isi jumlah dan status kepemilikan untuk barang elektronik yang ada di rumah.</p>'
      + '<div class="am-elektronik-table">'
      + '<div class="am-elk-th"><span>Nama Barang</span><span>Jumlah</span><span>Status Kepemilikan</span></div>'
      + C.formulir.barang.map((b) => {
        const x = (d.elektronik || []).find((z) => z.id === b.id) || {};
        return '<div class="am-elk-tr">'
          + '<div class="am-elk-nama">'
          + '<b>' + H(b.nama) + '</b>'
          + (b.id === 'lain' ? '<input data-barang="lain" data-k="nama" placeholder="Sebutkan jenis barang..." value="' + H(x.nama || '') + '">' : '')
          + '</div>'
          + '<div class="am-elk-jml">'
          + '<input type="number" min="0" max="999" inputmode="numeric" data-barang="' + H(b.id) + '" data-k="jumlah" value="' + H(x.jumlah || '') + '" placeholder="0">'
          + '</div>'
          + '<div class="am-elk-status">'
          + '<select data-barang="' + H(b.id) + '" data-k="status">'
          + '<option value="">- Pilih status -</option>'
          + ['Milik sendiri', 'Pemberian', 'Pinjam'].map((s) => '<option' + (x.status === s ? ' selected' : '') + '>' + s + '</option>').join('')
          + '</select>'
          + '</div>'
          + '</div>';
      }).join('')
      + '</div>'
      + '</section>';

    h += '<section class="am-bagian card">'
      + '<div class="am-bagian-h">'
      + '<div class="am-sec-title"><span class="am-sec-badge">BAGIAN 7</span><b>Bantuan dari Lembaga Lain</b></div>'
      + '<span class="am-sec-count">Maksimal 3 sumber</span>'
      + '</div>'
      + '<p class="muted am-sec-desc">Isi jika pemohon sedang menerima bantuan rutin atau insidental dari pihak lain.</p>'
      + '<div class="am-bantuan-list">'
      + [0, 1, 2].map((i) => {
        const x = d.bantuanLain[i] || {};
        return '<div class="am-bantuan-row">'
          + '<div class="am-bantuan-no">' + (i + 1) + '</div>'
          + '<label class="am-field"><span>Nama Lembaga / Pihak Pemberi</span><input data-bantuan="' + i + '" data-k="sumber" placeholder="Contoh: Baznas, Dinsos, Desa" value="' + H(x.sumber || '') + '"></label>'
          + '<label class="am-field"><span>Nominal Bantuan (Rp)</span><input data-bantuan="' + i + '" data-k="nominal" type="number" min="0" inputmode="numeric" placeholder="0" value="' + H(x.nominal || '') + '"></label>'
          + '</div>';
      }).join('')
      + '</div>'
      + '</section>';

    h += '<section class="am-bagian card">'
      + '<div class="am-bagian-h">'
      + '<div class="am-sec-title"><span class="am-sec-badge">BAGIAN 8</span><b>Catatan Tambahan Surveyor</b></div>'
      + '</div>'
      + '<label class="am-field" style="margin-top:14px"><span>Kondisi riil lapangan, rekomendasi khusus, dan pertimbangan lain</span>'
      + '<textarea data-kunci="catatan" rows="4" placeholder="Tuliskan catatan observasi lapangan atau catatan verifikasi penting...">' + H(d.catatan) + '</textarea>'
      + '</label>'
      + '</section>';

    h += '<div class="am-form-bawah card">'
      + '<div class="am-bawah-info">'
      + '<span class="am-bawah-skor">Skor Total: <b id="amBawahSkor">' + live.skor + '</b> / ' + Number(C.formulir.skor.max) + '</span>'
      + '<span class="muted" id="amBawahStatus">' + live.hasil + '</span>'
      + '</div>'
      + '<div class="am-bawah-aksi">'
      + tombol('Batal', 'riwayat', 'btn-ghost')
      + tombol('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan di server dan perangkat', 'simpan', 'btn-primary am-btn-simpan')
      + '</div>'
      + '</div>';

    induk.innerHTML = judul() + h;

    induk.querySelectorAll('[data-q]').forEach((e) => {
      e.addEventListener('change', () => {
        d.jawaban[e.dataset.q] = e.value;
        const fieldset = e.closest('.am-tanya');
        if (fieldset) {
          fieldset.classList.add('am-terjawab');
          fieldset.querySelectorAll('.am-opsi-item').forEach((x) => x.classList.toggle('on', x.contains(e) && e.checked));
        }
        perbaruiStatusBar(d);
        const bawahSkor = $('#amBawahSkor');
        const bawahStatus = $('#amBawahStatus');
        const st = hitungSkorSaatIni(d.jawaban);
        if (bawahSkor) bawahSkor.textContent = st.skor;
        if (bawahStatus) bawahStatus.textContent = st.hasil;
      });
    });

    induk.querySelectorAll('[data-kunci]').forEach((e) => {
      e.addEventListener('input', () => { d[e.dataset.kunci] = e.value; });
    });

    induk.querySelectorAll('[data-barang]').forEach((e) => {
      e.addEventListener('input', () => ambilRincian(d));
      e.addEventListener('change', () => ambilRincian(d));
    });

    induk.querySelectorAll('[data-bantuan]').forEach((e) => {
      e.addEventListener('input', () => ambilRincian(d));
    });

    ikatTombol();
  }

  function ambilRincian(d) {
    const barang = new Map();
    induk.querySelectorAll('[data-barang]').forEach((e) => {
      const x = barang.get(e.dataset.barang) || { id: e.dataset.barang };
      x[e.dataset.k] = e.value;
      barang.set(e.dataset.barang, x);
    });
    d.elektronik = [...barang.values()];

    const ba = new Map();
    induk.querySelectorAll('[data-bantuan]').forEach((e) => {
      const i = Number(e.dataset.bantuan);
      const x = ba.get(i) || {};
      x[e.dataset.k] = e.value;
      ba.set(i, x);
    });
    d.bantuanLain = [...ba.values()];
  }

  function lihatRingkasan(x) {
    const jaw = x.jawaban || {};
    const clsBadge = kelasHasil(x.hasil);

    let h = '<div class="am-atas">'
      + '<div><h3>Ringkasan Hasil Asesmen</h3><p class="muted">' + H(x.mustahik) + ' · Disurvei tanggal ' + H(tanggalIndo(x.tanggal)) + '</p></div>'
      + '<div class="am-atas-aksi">'
      + tombol('&larr; Kembali ke riwayat', 'riwayat', 'btn-ghost')
      + tombol('Cetak formulir', 'cetak:' + H(x.id), 'btn-primary')
      + '</div>'
      + '</div>';

    h += '<div class="am-hasil card">'
      + '<div class="am-hasil-angka">'
      + '<div class="am-hasil-skor-box">'
      + '<span class="am-hasil-label">Skor Penilaian</span>'
      + '<b class="am-hasil-skor">' + Number(x.skor) + '<small> / ' + Number(C.formulir.skor.max) + '</small></b>'
      + '</div>'
      + '<div class="am-hasil-vonis">'
      + '<span class="am-badge ' + clsBadge + ' am-badge-lg">' + H(x.hasil) + '</span>'
      + '<p class="muted am-hasil-keterangan">Ambang skor: 32 - 63 Belum Layak · 64 - 88 Layak · 89 - 155 Sangat Layak</p>'
      + '</div>'
      + '</div>'
      + '<div class="am-hasil-meta">'
      + '<div class="am-meta-cell"><span>Nama Mustahik</span><b>' + H(x.mustahik) + '</b></div>'
      + '<div class="am-meta-cell"><span>Tujuan / Kebutuhan</span><b>' + H(x.tujuan || 'Survei Calon Mustahik') + '</b></div>'
      + '<div class="am-meta-cell"><span>Tanggal Survei</span><b>' + H(tanggalIndo(x.tanggal)) + '</b></div>'
      + '<div class="am-meta-cell"><span>Petugas Survei</span><b>' + H(x.olehNama || x.petugas) + '</b></div>'
      + '<div class="am-meta-cell am-meta-full"><span>Alamat</span><b>' + H(x.alamat || 'Belum dicatat') + '</b></div>'
      + '</div>'
      + '</div>';

    h += '<div class="am-rincian-grid">';
    C.formulir.bagian.forEach((b) => {
      h += '<div class="am-hasil-b card">'
        + '<h4>' + H(b.nama) + '</h4>'
        + '<div class="am-jawaban-table">'
        + b.pertanyaan.map((q) => {
          const o = q.opsi.find((z) => z.id === jaw[q.id]);
          return '<div class="am-jawaban-tr">'
            + '<span class="am-jawaban-q">' + H(q.nama) + '</span>'
            + '<span class="am-jawaban-a">' + H(o ? o.label : 'Belum diisi') + (o ? ' <b class="am-poin">(' + o.skor + ')</b>' : '') + '</span>'
            + '</div>';
        }).join('')
        + '</div>'
        + '</div>';
    });
    h += '</div>';

    const adaElk = (x.elektronik || []).filter((e) => e.jumlah > 0 || e.status);
    const adaBantuan = (x.bantuanLain || []).filter((b) => b.sumber || b.nominal > 0);

    if (adaElk.length || adaBantuan.length || x.catatan) {
      h += '<div class="am-pendukung-grid">';
      if (adaElk.length) {
        h += '<div class="am-pendukung-card card">'
          + '<h4>Barang Elektronik yang Dimiliki</h4>'
          + '<div class="am-pendukung-list">'
          + adaElk.map((e) => '<div><span>' + H(e.nama) + '</span><b>' + (e.jumlah ? e.jumlah + ' unit' : '') + (e.status ? ' (' + e.status + ')' : '') + '</b></div>').join('')
          + '</div></div>';
      }
      if (adaBantuan.length) {
        h += '<div class="am-pendukung-card card">'
          + '<h4>Bantuan dari Pihak Lain</h4>'
          + '<div class="am-pendukung-list">'
          + adaBantuan.map((b) => '<div><span>' + H(b.sumber || 'Bantuan') + '</span><b>' + rupiah(b.nominal) + '</b></div>').join('')
          + '</div></div>';
      }
      if (x.catatan) {
        h += '<div class="am-pendukung-card am-catatan-card card">'
          + '<h4>Catatan Tambahan</h4>'
          + '<p>' + H(x.catatan) + '</p>'
          + '</div>';
      }
      h += '</div>';
    }

    h += '<div class="am-aksi-bawah">'
      + tombol('&larr; Kembali ke riwayat', 'riwayat', 'btn-ghost')
      + tombol('Cetak dokumen', 'cetak:' + H(x.id), 'btn-ghost')
      + (x.olehId === C.pengguna.id || C.pengguna.peran === 'superadmin' ? tombol('Ubah asesmen', 'ubah:' + H(x.id), 'btn-primary') : '')
      + '</div>';

    induk.innerHTML = judul() + h;
    ikatTombol();
  }

  function cetakLembar(x) {
    const w = window.open('', '_blank');
    if (!w) return alert('Izinkan popup untuk mencetak formulir asesmen.');
    const jaw = x.jawaban || {};
    const tanggalTeks = tanggalIndo(x.tanggal);

    let tabelHtml = '';
    C.formulir.bagian.forEach((b) => {
      tabelHtml += '<tr class="kategori"><td colspan="3"><b>' + H(b.nama.toUpperCase()) + '</b></td></tr>';
      b.pertanyaan.forEach((q) => {
        const o = q.opsi.find((z) => z.id === jaw[q.id]);
        tabelHtml += '<tr><td>' + (q.nomor || '') + '</td><td>' + H(q.nama) + '</td><td style="text-align:right"><b>' + H(o ? o.label : '-') + '</b> (' + (o ? o.skor : 0) + ')</td></tr>';
      });
    });

    w.document.write('<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">'
      + '<title>Asesmen ' + H(x.mustahik) + '</title>'
      + '<style>'
      + 'body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#111;margin:20px;line-height:1.4}'
      + '.kop{text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}'
      + '.kop h2{margin:0;font-size:16px;letter-spacing:.5px}.kop h3{margin:2px 0;font-size:13px;font-weight:normal}'
      + '.meta{margin-bottom:14px;border:1px solid #ccc;padding:10px;border-radius:6px}'
      + '.meta-row{display:flex;margin-bottom:4px}.meta-row span{width:160px;color:#555}.meta-row b{flex:1}'
      + 'table{width:100%;border-collapse:collapse;margin-bottom:14px}'
      + 'th,td{border:1px solid #ddd;padding:6px 8px;font-size:11px}'
      + 'th{background:#f4f4f4}.kategori td{background:#fafafa;padding:6px 8px;font-size:11px}'
      + '.skor-box{border:2px solid #111;padding:12px;border-radius:6px;text-align:center;margin:16px 0;background:#fcfcfc}'
      + '.skor-box b{font-size:20px}.skor-box span{display:block;margin-top:4px;font-size:13px;font-weight:bold}'
      + '.ttd{display:flex;justify-content:space-between;margin-top:30px;padding:0 30px}'
      + '.ttd-box{text-align:center;width:200px}.ttd-garis{border-bottom:1px solid #111;margin-top:60px}'
      + '@media print{button{display:none}body{margin:0}}'
      + '</style></head><body>'
      + '<div class="kop">'
      + '<h2>FORMULIR HASIL ASESMEN MUSTAHIK</h2>'
      + '<h3>Lembaga Amil Zakat Infak &amp; Shodaqoh Muhammadiyah (Lazismu) Kabupaten Bantul</h3>'
      + '</div>'
      + '<div class="meta">'
      + '<div class="meta-row"><span>Nama Mustahik:</span><b>' + H(x.mustahik) + '</b></div>'
      + '<div class="meta-row"><span>Tujuan / Kebutuhan:</span><b>' + H(x.tujuan || 'Survei Calon Mustahik') + '</b></div>'
      + '<div class="meta-row"><span>Alamat:</span><b>' + H(x.alamat || '-') + '</b></div>'
      + '<div class="meta-row"><span>Tanggal Survei:</span><b>' + H(tanggalTeks) + '</b></div>'
      + '<div class="meta-row"><span>Petugas Survei:</span><b>' + H(x.olehNama || x.petugas) + '</b></div>'
      + '</div>'
      + '<div class="skor-box">'
      + '<div>Total Skor Evaluasi: <b>' + Number(x.skor) + '</b> dari ' + Number(C.formulir.skor.max) + '</div>'
      + '<span>HASIL: ' + H(x.hasil.toUpperCase()) + '</span>'
      + '</div>'
      + '<table><thead><tr><th style="width:30px">No</th><th>Indikator Penilaian</th><th style="width:260px;text-align:right">Jawaban &amp; Skor</th></tr></thead>'
      + '<tbody>' + tabelHtml + '</tbody></table>'
      + '<div class="ttd">'
      + '<div class="ttd-box"><div>Petugas Survei,</div><div class="ttd-garis"></div><div>(' + H(x.olehNama || x.petugas) + ')</div></div>'
      + '<div class="ttd-box"><div>Mustahik / Pemohon,</div><div class="ttd-garis"></div><div>(' + H(x.mustahik) + ')</div></div>'
      + '</div>'
      + '<div style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">Cetak / Simpan PDF</button></div>'
      + '</body></html>');
    w.document.close();
  }

  function ikatTombol() {
    induk.querySelectorAll('[data-aksi]').forEach((b) => {
      b.addEventListener('click', () => jalankan(b.dataset.aksi, b));
    });

    const cariInp = $('#amCari');
    if (cariInp) {
      cariInp.addEventListener('input', () => {
        saringCari = cariInp.value.trim();
        induk.innerHTML = judul() + gambarRiwayat();
        ikatTombol();
        const inpBaru = $('#amCari');
        if (inpBaru) {
          inpBaru.focus();
          inpBaru.setSelectionRange(inpBaru.value.length, inpBaru.value.length);
        }
      });
    }

    const bersihkan = $('#amCariBersih');
    if (bersihkan) {
      bersihkan.addEventListener('click', () => {
        saringCari = '';
        induk.innerHTML = judul() + gambarRiwayat();
        ikatTombol();
      });
    }

    induk.querySelectorAll('[data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        saringHasil = chip.dataset.filter;
        induk.innerHTML = judul() + gambarRiwayat();
        ikatTombol();
      });
    });
  }

  async function jalankan(a, b) {
    if (a === 'baru') {
      tab = 'mulai';
      draf = dataDraf(null);
      gambarMulai();
      return;
    }
    if (a === 'lanjut') {
      const inp = $('#amTujuan');
      const t = inp ? inp.value.trim() : '';
      if (!t) {
        if (inp) inp.focus();
        pesanToast('Tuliskan atau pilih tujuan kebutuhan asesmen.', true);
        return;
      }
      draf.tujuan = t;
      tab = 'form';
      gambarForm();
      return;
    }
    if (a === 'riwayat' || a === 'reset-filter') {
      tab = 'riwayat';
      if (a === 'reset-filter') { saringCari = ''; saringHasil = ''; }
      induk.innerHTML = judul() + gambarRiwayat();
      ikatTombol();
      return;
    }
    if (a.startsWith('lihat:')) {
      const x = gabung().find((z) => z.id === a.slice(6));
      if (x) lihatRingkasan(x);
      return;
    }
    if (a.startsWith('cetak:')) {
      const x = gabung().find((z) => z.id === a.slice(6));
      if (x) cetakLembar(x);
      return;
    }
    if (a.startsWith('ubah:')) {
      const x = gabung().find((z) => z.id === a.slice(5));
      if (x && (x.olehId === C.pengguna.id || C.pengguna.peran === 'superadmin')) {
        draf = Object.assign({}, x);
        tab = 'form';
        gambarForm();
      }
      return;
    }
    if (a.startsWith('kirim:')) {
      const x = lokal.find((z) => z.id === a.slice(6));
      if (!x) return;
      b.disabled = true;
      try {
        const r = await API('surat.asesmenMustahik.simpan', x);
        server = [r.asesmen, ...server.filter((z) => z.id !== r.asesmen.id)];
        lokal = lokal.filter((z) => z.id !== r.asesmen.id);
        simpanLokal(lokal);
        induk.innerHTML = judul() + gambarRiwayat();
        ikatTombol();
      } catch (e) {
        b.disabled = false;
        alert('Gagal sinkronkan ke server: ' + e.message);
      }
      return;
    }
    if (a.startsWith('hapus:')) {
      const x = gabung().find((z) => z.id === a.slice(6));
      if (!x) return;
      konfirmasiHapus(x.mustahik, async () => {
        if (x.sumber === 'perangkat') {
          lokal = lokal.filter((z) => z.id !== x.id);
          simpanLokal(lokal);
          pesanToast('Asesmen berhasil dihapus dari perangkat.');
        } else {
          try {
            await API('surat.asesmenMustahik.hapus', { id: x.id });
            server = server.filter((z) => z.id !== x.id);
            lokal = lokal.filter((z) => z.id !== x.id);
            simpanLokal(lokal);
            pesanToast('Asesmen berhasil dihapus dari server.');
          } catch (e) {
            pesanToast('Gagal menghapus dari server: ' + e.message, true);
            return;
          }
        }
        induk.innerHTML = judul() + gambarRiwayat();
        ikatTombol();
      });
      return;
    }
    if (a === 'simpan') {
      const nama = induk.querySelector('[data-kunci="mustahik"]');
      if (!nama || !nama.value.trim()) {
        if (nama) { nama.focus(); nama.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        pesanToast('Nama mustahik wajib diisi.', true);
        return;
      }
      const tujuan = induk.querySelector('[data-kunci="tujuan"]');
      if (!tujuan || !tujuan.value.trim()) {
        if (tujuan) { tujuan.focus(); tujuan.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        pesanToast('Tujuan/kebutuhan asesmen wajib diisi.', true);
        return;
      }
      draf.mustahik = nama.value.trim();
      draf.tujuan = tujuan.value.trim();

      const belumJawab = semuaTanya().filter((q) => !q.opsi.some((o) => o.id === draf.jawaban[q.id]));
      if (belumJawab.length > 0) {
        const pertama = belumJawab[0];
        const target = $('#tanya_' + pertama.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pesanToast('Masih ada ' + belumJawab.length + ' butir penilaian yang belum dipilih. Mohon lengkapi seluruh butir.', true);
        return;
      }

      ambilRincian(draf);
      b.disabled = true;
      const teksLama = b.innerHTML;
      b.innerHTML = 'Menyimpan...';

      const idBaru = () => 'am_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
      draf.id = draf.id || idBaru();

      const nilai = new Map(semuaTanya().map((q) => [q.id, q.opsi.find((o) => o.id === draf.jawaban[q.id])]));
      const skorLokal = [...nilai.values()].reduce((n, o) => n + (o ? o.skor : 0), 0);
      const hasilObj = C.formulir.hasil.find((h) => skorLokal >= h.min && skorLokal <= h.max) || C.formulir.hasil[0];

      const lokalSebelumKirim = Object.assign({}, draf, {
        id: draf.id,
        skor: skorLokal,
        hasil: hasilObj.label,
        olehId: C.pengguna.id,
        olehNama: C.pengguna.nama,
        petugas: C.pengguna.nama,
        dibuat: draf.dibuat || new Date().toISOString(),
        diubah: new Date().toISOString(),
        sumber: 'perangkat'
      });

      lokal = [lokalSebelumKirim, ...lokal.filter((x) => x.id !== lokalSebelumKirim.id)];
      const lokalAman = simpanLokal(lokal);

      try {
        const r = await API('surat.asesmenMustahik.simpan', draf);
        const tersimpan = Object.assign({}, r.asesmen, { sumber: 'server' });
        server = [tersimpan, ...server.filter((x) => x.id !== tersimpan.id)];
        lokal = lokal.filter((x) => x.id !== tersimpan.id);
        simpanLokal(lokal);
        tab = 'riwayat';
        induk.innerHTML = judul()
          + '<div class="am-sukses card">'
          + '<div class="am-sukses-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg></div>'
          + '<div class="am-sukses-text">'
          + '<b>Asesmen tersimpan di server' + (lokalAman ? ' dan perangkat ini.' : '.') + '</b>'
          + '<p>Mustahik: <b>' + H(tersimpan.mustahik) + '</b> · Skor ' + tersimpan.skor + ' dari ' + Number(C.formulir.skor.max) + ' (' + H(tersimpan.hasil) + ')</p>'
          + '</div>'
          + '<div class="am-sukses-aksi">'
          + tombol('Lihat ringkasan', 'lihat:' + tersimpan.id, 'btn-primary')
          + tombol('Cetak dokumen', 'cetak:' + tersimpan.id, 'btn-ghost')
          + tombol('Kembali ke riwayat', 'riwayat', 'btn-ghost')
          + '</div>'
          + '</div>';
        ikatTombol();
      } catch (e) {
        b.disabled = false;
        b.innerHTML = teksLama;
        alert('Server belum menerima: ' + e.message + '. Salinan asesmen tetap tersimpan aman di perangkat ini dan dapat disinkronkan saat koneksi pulih.');
        induk.innerHTML = judul()
          + '<div class="am-sukses am-sukses-warn card">'
          + '<div class="am-sukses-text">'
          + '<b>Belum tersinkron ke server</b>'
          + '<p>Asesmen tersimpan di perangkat ini. Skor: ' + lokalSebelumKirim.skor + ' (' + H(lokalSebelumKirim.hasil) + ').</p>'
          + '</div>'
          + tombol('Kembali ke riwayat', 'riwayat', 'btn-primary')
          + '</div>';
        ikatTombol();
      }
    }
  }

  async function muat() {
    lokal = bacaLokal();
    try {
      const f = await API('surat.asesmenMustahik.form', {});
      C.formulir = f.formulir;
      try { localStorage.setItem(kunci(C.pengguna.id) + '_form', JSON.stringify(C.formulir)); } catch (_) {}
    } catch (e) {
      try { C.formulir = JSON.parse(localStorage.getItem(kunci(C.pengguna.id) + '_form') || 'null'); } catch (_) {}
      if (!C.formulir) throw e;
    }
    try {
      const r = await API('surat.asesmenMustahik.daftar', {});
      server = (r.asesmen || []).map((x) => Object.assign({}, x, { sumber: 'server' }));
    } catch (_) { server = []; }

    induk.innerHTML = judul() + gambarRiwayat();
    ikatTombol();
  }

  function css() {
    if ($('#amGaya')) return;
    const s = document.createElement('style');
    s.id = 'amGaya';
    s.textContent = `
      .am-kepala{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:22px 24px;margin-bottom:18px;border-radius:18px;background:linear-gradient(110deg,var(--surface),var(--surface2));border:1px solid var(--border)}
      .am-kepala-isi{min-width:0}.am-kepala h2{margin:2px 0 6px;font:800 24px var(--head);color:var(--text);letter-spacing:-.02em}.am-kepala p{margin:0;color:var(--text2);font-size:13px;line-height:1.5}
      .am-jejak{display:inline-block;font-size:10.5px;letter-spacing:.12em;font-weight:800;color:var(--accent-d);margin-bottom:2px}
      .am-angka{display:grid;text-align:right;flex:none}.am-angka b{font:800 30px var(--head);color:var(--accent-d);line-height:1}.am-angka span{font-size:12px;color:var(--muted);margin-top:2px}

      .am-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}
      .am-kpi-item{padding:14px 18px;display:flex;flex-direction:column;justify-content:center}
      .am-kpi-label{font-size:11.5px;font-weight:700;color:var(--muted)}
      .am-kpi-item b{font:800 24px var(--head);color:var(--text);margin:2px 0}
      .am-kpi-item small{font-size:11px;color:var(--muted)}
      .am-kpi-sangat{border-color:rgba(16,185,129,.35);background:color-mix(in srgb,var(--surface) 92%,#10b981)}
      .am-kpi-sangat b{color:#059669}
      .am-kpi-layak{border-color:rgba(59,130,246,.35);background:color-mix(in srgb,var(--surface) 92%,#3b82f6)}
      .am-kpi-layak b{color:#2563eb}
      .am-kpi-belum{border-color:rgba(245,158,11,.35);background:color-mix(in srgb,var(--surface) 92%,#f59e0b)}
      .am-kpi-belum b{color:#d97706}

      .am-toolbar{padding:14px 18px;margin-bottom:16px}
      .am-toolbar-atas{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:12px}
      .am-cari-box{position:relative;flex:1;max-width:480px}
      .am-cari-box svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
      .am-cari-box input{width:100%;height:38px;padding:0 34px 0 36px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-size:13px}
      .am-cari-box input:focus{outline:2px solid var(--accent);outline-offset:1px}
      .am-cari-bersih{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:none;font-size:18px;color:var(--muted);cursor:pointer;padding:0 6px}
      .am-btn-tambah{display:inline-flex;align-items:center;height:38px;padding:0 16px;font-size:13px;border-radius:10px}
      .am-filter-chips{display:flex;flex-wrap:wrap;gap:6px}
      .am-chip{height:30px;padding:0 12px;border:1px solid var(--border);background:var(--surface2);border-radius:20px;font-size:11.5px;font-weight:700;color:var(--text2);cursor:pointer;transition:.15s}
      .am-chip:hover{border-color:var(--accent);color:var(--text)}
      .am-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
      .am-chip-warn.on{background:var(--amber);border-color:var(--amber);color:#fff}

      .am-riwayat{display:grid;gap:12px}
      .am-item{padding:18px 20px;transition:border-color .15s}
      .am-item:hover{border-color:var(--accent)}
      .am-item-lokal{border-left:4px solid var(--amber)}
      .am-item-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
      .am-item-info{min-width:0}
      .am-item-nama{font:800 16px var(--head);margin:0 0 6px;color:var(--text)}
      .am-item-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12px}
      .am-tag-tujuan{font-weight:700;color:var(--accent-d);background:var(--accent-soft);padding:3px 8px;border-radius:6px}
      .am-tag-tgl{color:var(--muted)}
      .am-tag-alamat{color:var(--text2);max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .am-item-skor-box{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
      .am-skor-angka{font:800 20px var(--head);color:var(--text)}.am-skor-angka small{font-size:12px;color:var(--muted);font-weight:normal}
      .am-badge{display:inline-block;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:.02em}
      .am-badge-lg{padding:5px 12px;font-size:12.5px;border-radius:8px}
      .am-badge-sangat{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}
      .am-badge-layak{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}
      .am-badge-belum{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
      [data-theme="dark"] .am-badge-sangat{background:#064e3b;border-color:#047857;color:#a7f3d0}
      [data-theme="dark"] .am-badge-layak{background:#1e3a8a;border-color:#1d4ed8;color:#bfdbfe}
      [data-theme="dark"] .am-badge-belum{background:#78350f;border-color:#b45309;color:#fde68a}

      .am-item-mid{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;margin-top:10px;border-top:1px dashed var(--border);border-bottom:1px solid var(--border);font-size:12px}
      .am-meta-petugas{color:var(--text2)}.am-meta-petugas b{color:var(--text)}
      .am-status-pill{display:inline-flex;align-items:center;gap:5px;font-weight:700}
      .am-status-server{color:#10b981}.am-status-lokal{color:var(--amber)}
      .am-item-aksi{display:flex;align-items:center;gap:8px;padding-top:12px}
      .am-hapus{color:var(--red)!important}

      .am-kosong{text-align:center;padding:48px 20px}
      .am-kosong-ikon{color:var(--muted);margin-bottom:10px}
      .am-kosong b{font:700 16px var(--head);display:block;margin-bottom:4px}
      .am-kosong p{max-width:360px;margin:0 auto 16px;font-size:13px}

      .am-mulai{max-width:680px;margin:0 auto;padding:0;overflow:hidden}
      .am-mulai-kop{padding:24px;background:var(--surface2);border-bottom:1px solid var(--border)}
      .am-form-badge{display:inline-block;padding:3px 7px;background:var(--accent-soft);color:var(--accent-d);font-size:10.5px;font-weight:800;border-radius:5px;margin-bottom:6px}
      .am-mulai-kop h4{margin:0 0 4px;font:800 19px var(--head);color:var(--text)}
      .am-mulai-kop p{margin:0;font-size:13px}
      .am-mulai-body{padding:24px}
      .am-saran-wrap{margin-top:14px}
      .am-saran-label{display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:8px}
      .am-saran-chips{display:flex;flex-wrap:wrap;gap:6px}
      .am-saran-btn{padding:6px 12px;border:1px solid var(--border);background:var(--surface);border-radius:18px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;transition:.15s}
      .am-saran-btn:hover{border-color:var(--accent);color:var(--text)}
      .am-saran-btn.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-d)}

      .am-form-header{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:16px 20px;margin-bottom:16px;position:sticky;top:70px;z-index:20;background:var(--surface);box-shadow:var(--shadow)}
      .am-form-header-kiri{display:flex;align-items:center;gap:14px}
      .am-form-header-kiri h3{margin:0;font:800 17px var(--head)}
      .am-form-status-box{display:flex;align-items:center;gap:14px;position:relative}
      .am-live-info{display:flex;flex-direction:column;align-items:flex-end;line-height:1.2}
      .am-live-angka{font-size:13px;font-weight:700;color:var(--text)}.am-live-angka b{color:var(--accent-d);font-size:16px}
      .am-live-bar-wrap{position:absolute;bottom:-17px;left:0;right:0;height:3px;background:var(--surface2)}
      .am-live-bar{height:100%;background:var(--accent);transition:width .2s ease}

      .am-data{padding:0;overflow:hidden;margin-bottom:16px}
      .am-data-h,.am-bagian-h{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border);background:var(--surface2)}
      .am-sec-badge{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--accent-soft);color:var(--accent-d);font-size:10px;font-weight:800;margin-right:8px}
      .am-sec-title{font:800 15px var(--head);color:var(--text)}
      .am-sec-count{font-size:12px;color:var(--muted);font-weight:700}
      .am-sec-desc{padding:12px 20px 0;margin:0;font-size:12.5px}

      .am-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:20px}
      .am-field{display:grid;gap:6px;min-width:0}
      .am-field>span{font-size:12px;font-weight:700;color:var(--text2)}
      .am-field input,.am-field textarea{width:100%;min-width:0;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;padding:9px 12px}
      .am-field input:focus,.am-field textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
      .am-penuh{grid-column:1/-1}

      .am-bagian{padding:0;overflow:hidden;margin-bottom:16px}
      .am-pertanyaan-list{display:grid;gap:0}
      .am-tanya{border:0;border-bottom:1px solid var(--border);padding:16px 20px;margin:0;transition:background .15s}
      .am-tanya:last-child{border-bottom:0}
      .am-tanya.am-terjawab{background:color-mix(in srgb,var(--surface) 97%,var(--accent))}
      .am-tanya-legend{display:flex;align-items:flex-start;gap:12px;width:100%;padding:0;margin-bottom:12px}
      .am-no{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--accent-soft);color:var(--accent-d);font:800 12px var(--head);flex:none;margin-top:1px}
      .am-tanya-teks{font:700 14px var(--head);color:var(--text);line-height:1.4}
      .am-opsi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;padding-left:36px}
      .am-opsi-item{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--surface);cursor:pointer;position:relative;transition:.15s}
      .am-opsi-item:hover{border-color:var(--accent)}
      .am-opsi-item input{accent-color:var(--accent);width:16px;height:16px;margin:0;cursor:pointer;flex:none}
      .am-opsi-label{flex:1;font-size:12.5px;color:var(--text2);font-weight:600}
      .am-opsi-skor{padding:2px 7px;border-radius:6px;background:var(--surface2);font-size:11px;font-weight:800;color:var(--muted)}
      .am-opsi-item.on{border-color:var(--accent);background:var(--accent-soft)}
      .am-opsi-item.on .am-opsi-label{color:var(--accent-d)}
      .am-opsi-item.on .am-opsi-skor{background:var(--accent);color:#fff}

      .am-elektronik-table{padding:16px 20px;display:grid;gap:8px}
      .am-elk-th{display:grid;grid-template-columns:minmax(140px,1.5fr) 110px minmax(130px,1fr);gap:10px;font-size:11px;font-weight:700;color:var(--muted);padding-bottom:4px;border-bottom:1px solid var(--border)}
      .am-elk-tr{display:grid;grid-template-columns:minmax(140px,1.5fr) 110px minmax(130px,1fr);gap:10px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border)}
      .am-elk-nama b{font-size:13px;display:block}
      .am-elk-nama input{margin-top:4px;width:100%;height:32px;font-size:12px;border:1px solid var(--border);border-radius:6px;padding:0 8px;background:var(--surface);color:var(--text)}
      .am-elk-jml input{width:100%;height:34px;font-size:13px;border:1px solid var(--border);border-radius:8px;padding:0 8px;background:var(--surface);color:var(--text)}
      .am-elk-status select{width:100%;height:34px;font-size:12.5px;border:1px solid var(--border);border-radius:8px;padding:0 8px;background:var(--surface);color:var(--text)}

      .am-bantuan-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:16px 20px}
      .am-bantuan-row{border:1px solid var(--border);border-radius:12px;padding:14px;display:grid;gap:10px;background:var(--surface)}
      .am-bantuan-no{font:800 12px var(--head);color:var(--accent-d);width:22px;height:22px;border-radius:6px;background:var(--accent-soft);display:grid;place-items:center}

      .am-form-bawah{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 20px;margin-top:20px;position:sticky;bottom:16px;z-index:20;background:var(--surface);box-shadow:var(--shadow)}
      .am-bawah-skor{font:800 18px var(--head);color:var(--text);display:block}.am-bawah-skor b{color:var(--accent-d)}
      .am-bawah-status{font-size:12px}
      .am-bawah-aksi{display:flex;gap:10px}
      .am-btn-simpan{min-height:42px;padding:0 22px;border-radius:10px}

      .am-hasil{padding:0;overflow:hidden;margin-bottom:20px}
      .am-hasil-angka{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px;background:var(--surface2);border-bottom:1px solid var(--border)}
      .am-hasil-label{font-size:12px;font-weight:700;color:var(--muted);display:block;margin-bottom:2px}
      .am-hasil-skor{font:800 36px var(--head);color:var(--text)}.am-hasil-skor small{font-size:14px;color:var(--muted);font-weight:normal}
      .am-hasil-vonis{text-align:right}.am-hasil-keterangan{margin:4px 0 0;font-size:11.5px}
      .am-hasil-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding:18px 24px}
      .am-meta-cell span{font-size:11px;font-weight:700;color:var(--muted);display:block}
      .am-meta-cell b{font-size:13.5px;color:var(--text);display:block;margin-top:2px}
      .am-meta-full{grid-column:1/-1}

      .am-rincian-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}
      .am-hasil-b{padding:16px 20px}
      .am-hasil-b h4{margin:0 0 12px;font:800 14px var(--head);color:var(--text);border-bottom:1px solid var(--border);padding-bottom:8px}
      .am-jawaban-table{display:grid;gap:6px}
      .am-jawaban-tr{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;padding:5px 0;border-bottom:1px dashed var(--border)}
      .am-jawaban-q{color:var(--text2);flex:1}.am-jawaban-a{text-align:right;font-weight:600;color:var(--text)}
      .am-poin{color:var(--accent-d)}

      .am-pendukung-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:20px}
      .am-pendukung-card{padding:16px 20px}
      .am-pendukung-card h4{margin:0 0 10px;font:800 13.5px var(--head);border-bottom:1px solid var(--border);padding-bottom:6px}
      .am-pendukung-list{display:grid;gap:6px;font-size:12px}
      .am-pendukung-list div{display:flex;justify-content:space-between;border-bottom:1px dashed var(--border);padding:4px 0}
      .am-catatan-card{grid-column:1/-1}
      .am-catatan-card p{margin:6px 0 0;font-size:13px;line-height:1.6;color:var(--text2)}

      .am-sukses{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 24px;border-color:rgba(16,185,129,.4);background:color-mix(in srgb,var(--surface) 90%,#10b981)}
      .am-sukses-icon{width:48px;height:48px;border-radius:50%;background:#10b981;color:#fff;display:grid;place-items:center;flex:none}
      .am-sukses-text{flex:1}.am-sukses-text b{font:800 16px var(--head);display:block;margin-bottom:4px}
      .am-sukses-text p{margin:0;font-size:13px;color:var(--text2)}
      .am-sukses-aksi{display:flex;gap:8px}
      .am-sukses-warn{border-color:rgba(245,158,11,.4);background:color-mix(in srgb,var(--surface) 90%,#f59e0b)}

      .am-atas{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:20px 0 14px}
      .am-atas h3{margin:0;font:800 18px var(--head);color:var(--text)}
      .am-atas p{margin:2px 0 0;font-size:12.5px}
      .am-atas-aksi,.am-aksi-bawah{display:flex;align-items:center;gap:8px}
      .am-footer{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px;background:var(--surface2);border-top:1px solid var(--border)}

      @media(max-width:900px){
        .am-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .am-rincian-grid{grid-template-columns:1fr}
        .am-pendukung-grid{grid-template-columns:1fr}
        .am-bantuan-list{grid-template-columns:1fr}
      }
      @media(max-width:640px){
        .am-kepala{flex-direction:column;align-items:flex-start}
        .am-angka{text-align:left;margin-top:6px}
        .am-kpi-grid{grid-template-columns:1fr 1fr;gap:8px}
        .am-toolbar-atas{flex-direction:column;align-items:stretch}
        .am-cari-box{max-width:none}
        .am-form-grid{grid-template-columns:1fr}
        .am-form-header{flex-direction:column;align-items:flex-start;position:static}
        .am-form-status-box{width:100%;justify-content:space-between}
        .am-live-bar-wrap{position:static;margin-top:6px}
        .am-opsi-grid{grid-template-columns:1fr;padding-left:0}
        .am-elk-th{display:none}
        .am-elk-tr{grid-template-columns:1fr;gap:6px;padding:10px 0}
        .am-hasil-angka{flex-direction:column;align-items:flex-start;gap:12px}
        .am-hasil-vonis{text-align:left}
        .am-hasil-meta{grid-template-columns:1fr 1fr;padding:14px}
        .am-form-bawah{flex-direction:column;align-items:stretch;position:static}
        .am-bawah-aksi{flex-direction:column}
        .am-sukses{flex-direction:column;align-items:flex-start}
        .am-sukses-aksi{width:100%;flex-direction:column}
      }
      @media(max-width:390px){
        .am-kpi-grid{grid-template-columns:1fr}
        .am-hasil-meta{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(s);
  }

  window.LZAsesmenMustahik = {
    async gambar(el, konteks, rpc) {
      C = konteks;
      API = rpc;
      induk = el;
      css();
      await muat();
    },
    _uji: { kunci }
  };
})();
