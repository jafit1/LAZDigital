/* surat.js - modul Surat & Pengajuan untuk LAZDigital.
 *
 * Pemilik (2 Oktober 2026): surat masuk, surat keluar, dan pengajuan
 * bantuan/sponsorship/proposal, dengan progres dari diterima sampai
 * dicairkan, disposisi, dan lampiran yang dikompres sebelum disimpan.
 *
 * Aturan (urutan langkah, data wajib, batas lampiran) ditegakkan server di
 * lib/surat/surat.js. Yang di sini hanya kenyamanan: papan yang bisa
 * digeser, formulir yang menyesuaikan jenis, dan kompresi berkas di peramban
 * supaya yang dikirim ke server sudah kecil.
 *
 * Memanggil /api/media dengan tindakan "surat.*": modul ini menumpang
 * pintu Media supaya tidak menambah fungsi Vercel (batas 12).
 */
'use strict';

const $ = (s, induk = document) => induk.querySelector(s);
const $$ = (s, induk = document) => Array.from(induk.querySelectorAll(s));
const H = (t) => String(t === undefined || t === null ? '' : t)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const N = {
  pengguna: null, izin: {}, jenis: {}, alur: {}, labelStatus: {}, sifat: [], instruksi: [], batas: {},
  drive: false, hariIni: '', lembaga: {}, baris: [], ringkas: {}, akun: null, tampilPengajuan: 'papan', saring: {},
};

function tokenLaz() { try { return localStorage.getItem('laz_token') || ''; } catch (_) { return ''; } }
async function rpc(tindakan, data = {}) {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Laz-Token': tokenLaz() },
    body: JSON.stringify({ tindakan, data, token: tokenLaz() }),
  });
  let hasil;
  try { hasil = await res.json(); } catch (_) { throw new Error(res.status === 413 ? 'Berkas terlalu besar untuk dikirim.' : 'Balasan server tidak dikenali'); }
  if (res.status === 401) { location.href = '/index.html'; throw new Error('Sesi berakhir'); }
  if (!hasil.ok) throw new Error(hasil.pesan || 'Terjadi kesalahan');
  return hasil;
}

// ------------------------------------------------------------ format
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtTgl(t) { if (!t) return '-'; const p = String(t).slice(0, 10).split('-'); return p.length === 3 ? `${Number(p[2])} ${BULAN[Number(p[1]) - 1]} ${p[0]}` : String(t); }
function fmtWaktu(iso) { if (!iso) return '-'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
const fmtRp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
function fmtUkuran(b) { b = Number(b) || 0; if (b >= 1048576) return (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; return Math.max(1, Math.round(b / 1024)) + ' KB'; }
const pengajuan = (j) => (N.jenis[j] || {}).alur === 'pengajuan';
const alurDari = (j) => N.alur[(N.jenis[j] || {}).alur] || [];

/* Satu langkah satu warna di seluruh modul: orang membaca warnanya dulu. */
const WARNA = {
  diterima: '#3b82f6', disposisi: '#8b5cf6', tindaklanjut: '#f59e0b', selesai: '#16a34a',
  draf: '#94a3b8', dikirim: '#0ea5e9', diproses: '#f59e0b', asesmen: '#8b5cf6',
  disetujui: '#14b8a6', dicairkan: '#16a34a', ditolak: '#ef4444',
};
const SIFAT_LABEL = { biasa: 'Biasa', segera: 'Segera', penting: 'Penting', rahasia: 'Rahasia' };
const KATEGORI = ['Pendidikan', 'Kesehatan', 'Ekonomi', 'Sosial Dakwah', 'Kemanusiaan', 'Lingkungan', 'Lainnya'];

function pil(status) {
  const w = WARNA[status] || '#94a3b8';
  return `<span class="sr-pil" style="--w:${w}">${H(N.labelStatus[status] || status)}</span>`;
}
function pilSifat(s) { return s && s !== 'biasa' ? `<span class="sr-sifat sr-sifat-${H(s)}">${H(SIFAT_LABEL[s] || s)}</span>` : ''; }
function titikLangkah(r) {
  if (r.status === 'ditolak') return '<span class="sr-titik-baris"><i class="tolak"></i></span>';
  let h = '';
  for (let i = 0; i < r.jumlahLangkah; i++) h += `<i class="${i < r.langkahKe ? 'lewat' : i === r.langkahKe ? 'kini' : ''}" style="--w:${WARNA[r.status] || '#94a3b8'}"></i>`;
  return `<span class="sr-titik-baris" title="${H(r.statusLabel)}">${h}</span>`;
}

// ------------------------------------------------------------ toast & modal
function toast(pesan, galat) {
  const t = $('#toast');
  t.textContent = pesan;
  t.className = 'toast show' + (galat ? ' err' : '');
  clearTimeout(toast._j); toast._j = setTimeout(() => { t.className = 'toast'; }, 3000);
}
function modal(judul, isi, kaki, kelas) {
  $('#modalTitle').textContent = judul;
  $('#modalBody').innerHTML = isi;
  $('#modalFoot').innerHTML = kaki || '';
  const kartu = $('#modalCard');
  kartu.className = 'modal' + (kelas ? ' ' + kelas : '');
  $('#modalBg').classList.add('show');
  if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
}
function tutupModal() { $('#modalBg').classList.remove('show'); $('#modalBody').innerHTML = ''; $('#modalFoot').innerHTML = ''; }
window.tutupModal = tutupModal;
async function sibuk(tombol, kerja) {
  const lama = tombol ? tombol.innerHTML : '';
  if (tombol) { tombol.disabled = true; tombol.innerHTML = 'Menyimpan...'; }
  try { return await kerja(); } catch (e) { toast(e.message || String(e), true); return null; }
  finally { if (tombol && document.body.contains(tombol)) { tombol.disabled = false; tombol.innerHTML = lama; } }
}

// ------------------------------------------------------------ ikon & menu
const ik = (isi, u = 20) => `<svg viewBox="0 0 24 24" width="${u}" height="${u}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;
const IKON = {
  dasbor: ik('<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>'),
  masuk: ik('<path d="M3 12h5l1.5 3h5L16 12h5"/><path d="M4.5 6.5 3 12v6h18v-6l-1.5-5.5z"/><path d="M12 3v7"/><path d="m9 7 3 3 3-3"/>'),
  keluar: ik('<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'),
  pengajuan: ik('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>'),
  bantuan: ik('<path d="M12 20s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.7 12 20 12 20z"/>'),
  sponsorship: ik('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  proposal: ik('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>'),
  disposisi: ik('<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8"/><path d="M8 12h5"/>'),
  klip: ik('<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>', 14),
  tambah: ik('<path d="M12 5v14"/><path d="M5 12h14"/>', 16),
  unduh: ik('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>', 15),
  hapus: ik('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>', 15),
  cetak: ik('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>', 15),
  balas: ik('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>', 15),
  salin: ik('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>', 15),
  tautan: ik('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>', 15),
  kanan: ik('<path d="m9 6 6 6-6 6"/>', 15),
  excel: ik('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m9 13 4 5"/><path d="m13 13-4 5"/>', 15),
};
const MENU = [
  { kode: 'dasbor', label: 'Beranda' },
  { kode: 'masuk', label: 'Surat Masuk' },
  { kode: 'keluar', label: 'Surat Keluar' },
  { kode: 'pengajuan', label: 'Pengajuan' },
  { kode: 'disposisi', label: 'Disposisi Saya' },
];
function gambarMenu() {
  const nav = $('#nav');
  nav.innerHTML = MENU.map((m) => `<button class="tn-item" id="nav_${m.kode}" type="button" title="${H(m.label)}" aria-label="${H(m.label)}">`
    + `<span class="ic">${IKON[m.kode]}</span><span class="tn-tip">${H(m.label)}</span>`
    + (m.kode === 'disposisi' ? '<span class="sr-nav-angka" id="angkaDisposisi" hidden></span>' : '') + '</button>').join('');
  MENU.forEach((m) => { $('#nav_' + m.kode).onclick = () => { location.hash = '#' + m.kode; }; });
}
function tandaiMenu(kode) { $$('.tn-item').forEach((n) => n.classList.toggle('active', n.id === 'nav_' + kode)); }
function perbaruiAngkaMenu() {
  const a = $('#angkaDisposisi');
  const n = N.ringkas.disposisiSaya || 0;
  if (a) { a.hidden = !n; a.textContent = n > 9 ? '9+' : String(n); }
}

// ------------------------------------------------------------ data
async function muatDaftar() {
  const d = await rpc('surat.daftar');
  N.baris = d.baris || [];
  N.ringkas = d.ringkas || {};
  perbaruiAngkaMenu();
}
function cocokCari(r, q) {
  if (!q) return true;
  return [r.nomor, r.perihal, r.pengirim, r.tujuan, r.kategori, r.statusLabel].join(' ').toLowerCase().includes(q.toLowerCase());
}

// ------------------------------------------------------------ kerangka halaman
function svgTema(gelap) {
  /* Ikon baru satu SVG yang berubah bentuk lewat CSS (js/lz-tema.js); salinan di bawah hanya cadangan. */
  if (window.LZTema) return window.LZTema.svg();
  return gelap
    ? '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="currentColor"/><g stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M12 2.4v2.3"/><path d="M12 19.3v2.3"/><path d="M4.2 4.2l1.7 1.7"/><path d="M18.1 18.1l1.7 1.7"/><path d="M2.4 12h2.3"/><path d="M19.3 12h2.3"/><path d="M4.2 19.8l1.7-1.7"/><path d="M18.1 5.9l1.7-1.7"/></g></svg>'
    : '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"><path fill="currentColor" d="M20.4 14.9A8.6 8.6 0 0 1 9.1 3.6 8.7 8.7 0 1 0 20.4 14.9z"/></svg>';
}
const temaGelap = () => document.documentElement.getAttribute('data-theme') === 'dark';
function kepala(judul, aksi = '') {
  return `<div class="page-head"><div><h2>${H(judul)}</h2></div><div class="page-head-aksi">${aksi}`
    + `<button class="tn-icon kepala-tema" id="tombolTema" type="button" title="Ganti tema" aria-label="Ganti tema">${svgTema(temaGelap())}</button></div></div>`;
}
const tombolCatat = (jenis) => (N.izin.tambah ? `<button class="btn btn-primary btn-sm" type="button" data-catat="${H(jenis || '')}">${IKON.tambah} Catat${jenis ? ' ' + H((N.jenis[jenis] || {}).label || '') : ''}</button>` : '');

// ============================================================ BERANDA
function kpi(label, nilai, warna, ke) {
  return `<button type="button" class="kpi-v2 kpi-rapat sr-kpi" style="--kpi-accent:${warna}" data-ke="${H(ke || '')}">
    <div class="kpi-v2-top"><div class="kpi-v2-label">${H(label)}</div><div class="kpi-v2-icon" style="background:${warna}"></div></div>
    <div class="kpi-v2-value">${H(nilai)}</div></button>`;
}
function wc(judul, warna, isi, kelas) {
  return `<div class="sr-wc ${kelas || ''}"><div class="sr-wc-h"><span class="dot" style="background:${warna}"></span>${H(judul)}</div><div class="sr-wc-b">${isi}</div></div>`;
}
function barisSurat(r) {
  const siapa = r.jenis === 'keluar' ? (r.tujuan ? 'Kepada ' + r.tujuan : '') : r.pengirim;
  return `<button type="button" class="sr-baris${r.telat ? ' telat' : ''}" data-id="${H(r.id)}">
    <span class="sr-b-ikon" style="--w:${WARNA[r.status] || '#94a3b8'}">${IKON[r.jenis] || IKON.masuk}</span>
    <span class="sr-b-isi">
      <span class="sr-b-judul">${H(r.perihal)} ${pilSifat(r.sifat)}${r.disposisiSaya ? '<span class="sr-baru">Disposisi untuk Anda</span>' : ''}</span>
      <span class="sr-b-sub">${H(r.nomor)} · ${H(siapa || '-')}${r.nominalDiajukan ? ' · ' + fmtRp(r.nominalDisetujui || r.nominalDiajukan) : ''}</span>
    </span>
    <span class="sr-b-kanan">${pil(r.status)}${titikLangkah(r)}
      <span class="sr-b-tgl">${r.telat ? '<b class="sr-merah">Lewat tenggat</b>' : H(fmtTgl(r.tanggalTerima))}${r.jumlahLampiran ? ' · ' + IKON.klip + r.jumlahLampiran : ''}</span></span>
  </button>`;
}
function pasangBaris(el) { $$('.sr-baris', el).forEach((b) => { b.onclick = () => { location.hash = '#s/' + b.dataset.id; }; }); }
const kosong = (ikon, teks, aksi) => `<div class="sr-kosong"><div class="sr-kosong-ikon">${ikon}</div><div>${H(teks)}</div>${aksi || ''}</div>`;

const halaman = {};
halaman.dasbor = {
  judul: 'Surat & Pengajuan',
  aksi: () => tombolCatat(''),
  async gambar(el) {
    await muatDaftar();
    const r = N.ringkas;
    let h = `<div class="kpis-v2 kpi-surat">${kpi('Surat masuk bulan ini', r.masukBulan || 0, '#3b82f6', 'masuk')}`
      + kpi('Pengajuan berjalan', r.pengajuanAktif || 0, '#f59e0b', 'pengajuan')
      + kpi('Disposisi untuk saya', r.disposisiSaya || 0, '#8b5cf6', 'disposisi')
      + kpi('Lewat tenggat', r.telat || 0, '#ef4444', 'masuk') + '</div>';
    const perhatian = N.baris.filter((x) => x.telat || x.disposisiSaya).slice(0, 8);
    const terbaru = N.baris.slice().sort((a, b) => String(b.diubah).localeCompare(String(a.diubah))).slice(0, 8);
    /* Corong pengajuan: berapa yang berhenti di tiap langkah. Batangnya
       dibandingkan dengan langkah terbanyak, bukan dengan total, supaya
       langkah yang sepi tetap terlihat. */
    const alurP = N.alur.pengajuan || [];
    const per = r.perStatus || {};
    const maks = Math.max(1, ...alurP.map((s) => per[s] || 0), per.ditolak || 0);
    const corong = alurP.concat(['ditolak']).map((s) => `<button type="button" class="sr-corong" data-status="${s}">
        <span class="sr-corong-l">${H(N.labelStatus[s])}</span>
        <span class="sr-corong-bar"><i style="width:${((per[s] || 0) / maks * 100).toFixed(1)}%;background:${WARNA[s]}"></i></span>
        <b>${per[s] || 0}</b></button>`).join('');
    const dana = (r.diajukanTahun || r.disetujuiTahun || r.dicairkanTahun)
      ? `<div class="sr-dana">${[['Diajukan', r.diajukanTahun, '#94a3b8'], ['Disetujui', r.disetujuiTahun, '#14b8a6'], ['Dicairkan', r.dicairkanTahun, '#16a34a']].map(([l, v, w]) =>
        `<div class="sr-dana-b"><div class="sr-dana-l">${l}</div><div class="sr-dana-v" style="color:${w}">${fmtRp(v)}</div>
         <div class="sr-dana-bar"><i style="width:${(Number(v) / Math.max(1, r.diajukanTahun, r.disetujuiTahun) * 100).toFixed(1)}%;background:${w}"></i></div></div>`).join('')}</div>`
      : '<p class="muted sr-kecil">Belum ada pengajuan bernominal tahun ini.</p>';
    h += '<div class="sr-grid">'
      + wc('Perlu perhatian', '#ef4444', perhatian.length ? perhatian.map(barisSurat).join('') : kosong('&#10003;', 'Tidak ada yang lewat tenggat atau menunggu disposisi Anda.'))
      + wc('Alur pengajuan', '#f59e0b', corong)
      + wc('Dana pengajuan ' + N.hariIni.slice(0, 4), '#16a34a', dana)
      + wc('Terbaru', '#3b82f6', terbaru.length ? terbaru.map(barisSurat).join('') : kosong(IKON.masuk, 'Belum ada surat tercatat.'))
      + wc('Ruang lampiran', '#8b5cf6', '<div id="srRuang" class="muted sr-kecil">Menghitung...</div>', 'sr-penuh')
      + '</div>';
    el.innerHTML = h;
    pasangBaris(el);
    $$('.sr-kpi', el).forEach((b) => { b.onclick = () => { if (b.dataset.ke) location.hash = '#' + b.dataset.ke; }; });
    $$('.sr-corong', el).forEach((b) => { b.onclick = () => { N.saring.pengajuan = { status: b.dataset.status }; N.tampilPengajuan = 'daftar'; location.hash = '#pengajuan'; }; });
    rpc('surat.ruang').then((u) => {
      const t = $('#srRuang');
      if (!t) return;
      const p = Math.min(100, u.pakai / u.kuota * 100);
      t.innerHTML = `<div class="sr-ruang-bar"><i style="width:${p.toFixed(1)}%;background:${p > 85 ? 'var(--red)' : p > 60 ? 'var(--amber)' : 'var(--green)'}"></i></div>`
        + `<div class="sr-ruang-t"><b>${fmtUkuran(u.pakai)}</b> dari ${fmtUkuran(u.kuota)} terpakai`
        + (u.drive ? ' · lampiran baru disimpan ke Google Drive' : ' · foto dikompres otomatis, PDF besar bisa dikompres atau disimpan sebagai tautan Drive') + '</div>';
    }).catch(() => {});
  },
};

// ============================================================ DAFTAR SURAT
function bilahSaring(kunci, statusDaftar, jenisDaftar) {
  const s = N.saring[kunci] || (N.saring[kunci] = {});
  const chip = (nilai, label, aktif, attr) => `<button type="button" class="sr-chip${aktif ? ' on' : ''}" ${attr}="${H(nilai)}">${H(label)}</button>`;
  return `<div class="sr-bilah">
    <div class="sr-cari">${ik('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 15)}<input type="text" id="srCari" placeholder="Cari nomor, perihal, pengirim" value="${H(s.q || '')}" autocomplete="off"></div>
    ${jenisDaftar ? `<div class="sr-chips">${chip('', 'Semua jenis', !s.jenis, 'data-jenis')}${jenisDaftar.map((j) => chip(j, N.jenis[j].label, s.jenis === j, 'data-jenis')).join('')}</div>` : ''}
    ${statusDaftar.length ? `<div class="sr-chips">${chip('', 'Semua', !s.status, 'data-status')}${statusDaftar.map((st) => chip(st, N.labelStatus[st], s.status === st, 'data-status')).join('')}</div>` : ''}
    <button type="button" class="btn btn-sm sr-ekspor" id="srEkspor">${IKON.excel} Excel</button>
  </div>`;
}
function pasangSaring(el, kunci, gambarUlang) {
  const s = N.saring[kunci];
  const c = $('#srCari', el);
  c.oninput = () => { s.q = c.value; gambarUlang(); };
  $$('[data-status]', el).forEach((b) => { b.onclick = () => { s.status = b.dataset.status; $$('[data-status]', el).forEach((x) => x.classList.toggle('on', x === b)); gambarUlang(); }; });
  $$('[data-jenis]', el).forEach((b) => { b.onclick = () => { s.jenis = b.dataset.jenis; $$('[data-jenis]', el).forEach((x) => x.classList.toggle('on', x === b)); gambarUlang(); }; });
}
function saringBaris(kunci, jenisBoleh) {
  const s = N.saring[kunci] || {};
  return N.baris.filter((r) => jenisBoleh.includes(r.jenis) && (!s.jenis || r.jenis === s.jenis) && (!s.status || r.status === s.status) && cocokCari(r, s.q));
}
function halamanDaftar(jenis) {
  return {
    judul: N.jenis[jenis] ? N.jenis[jenis].label : '',
    aksi: () => tombolCatat(jenis),
    async gambar(el) {
      await muatDaftar();
      el.innerHTML = bilahSaring(jenis, alurDari(jenis)) + '<div id="srHasil"></div>';
      const gambarUlang = () => {
        const isi = saringBaris(jenis, [jenis]);
        $('#srHasil').innerHTML = `<div class="sr-jumlah">${isi.length} surat</div>`
          + (isi.length ? `<div class="sr-daftar">${isi.map(barisSurat).join('')}</div>`
            : kosong(IKON[jenis], N.baris.some((r) => r.jenis === jenis) ? 'Tidak ada yang cocok.' : 'Belum ada ' + N.jenis[jenis].label.toLowerCase() + '.', N.izin.tambah ? tombolCatat(jenis) : ''));
        pasangBaris($('#srHasil'));
        pasangTombolCatat($('#srHasil'));
      };
      pasangSaring(el, jenis, gambarUlang);
      $('#srEkspor').onclick = () => ekspor(saringBaris(jenis, [jenis]), N.jenis[jenis].label);
      gambarUlang();
    },
  };
}
halaman.masuk = halamanDaftar('masuk');
halaman.keluar = halamanDaftar('keluar');

// ============================================================ PENGAJUAN (papan)
const JENIS_P = ['bantuan', 'sponsorship', 'proposal'];
halaman.pengajuan = {
  judul: 'Pengajuan',
  aksi: () => tombolCatat('bantuan').replace('Catat Pengajuan Bantuan', 'Catat Pengajuan'),
  async gambar(el) {
    await muatDaftar();
    const alur = N.alur.pengajuan;
    el.innerHTML = `<div class="sr-tampil"><button type="button" class="${N.tampilPengajuan === 'papan' ? 'on' : ''}" data-t="papan">Papan</button><button type="button" class="${N.tampilPengajuan === 'daftar' ? 'on' : ''}" data-t="daftar">Daftar</button></div>`
      + bilahSaring('pengajuan', N.tampilPengajuan === 'daftar' ? alur.concat(['ditolak']) : [], JENIS_P) + '<div id="srHasil"></div>';
    if (N.tampilPengajuan === 'papan' && N.saring.pengajuan) N.saring.pengajuan.status = '';
    $$('.sr-tampil button', el).forEach((b) => { b.onclick = () => { N.tampilPengajuan = b.dataset.t; halaman.pengajuan.gambar(el); }; });
    const gambarUlang = () => {
      const isi = saringBaris('pengajuan', JENIS_P);
      const wadah = $('#srHasil');
      if (N.tampilPengajuan === 'daftar') {
        wadah.innerHTML = `<div class="sr-jumlah">${isi.length} pengajuan</div>` + (isi.length ? `<div class="sr-daftar">${isi.map(barisSurat).join('')}</div>` : kosong(IKON.pengajuan, 'Tidak ada pengajuan.'));
        pasangBaris(wadah);
        return;
      }
      wadah.innerHTML = '<div class="sr-papan" id="srPapan">' + alur.concat(['ditolak']).map((st) => {
        const kartu = isi.filter((r) => r.status === st);
        const total = kartu.reduce((a, r) => a + (r.nominalDisetujui || r.nominalDiajukan || 0), 0);
        return `<div class="sr-kolom" data-status="${st}" style="--w:${WARNA[st]}">
          <div class="sr-kolom-h"><span>${H(N.labelStatus[st])}</span><b>${kartu.length}</b></div>
          ${total ? `<div class="sr-kolom-t">${fmtRp(total)}</div>` : ''}
          <div class="sr-kolom-isi">${kartu.map(kartuPapan).join('') || '<div class="sr-kolom-kosong">Kosong</div>'}</div></div>`;
      }).join('') + '</div>';
      pasangPapan(wadah);
    };
    pasangSaring(el, 'pengajuan', gambarUlang);
    $('#srEkspor').onclick = () => ekspor(saringBaris('pengajuan', JENIS_P), 'Pengajuan');
    gambarUlang();
  },
};
function kartuPapan(r) {
  const alur = N.alur.pengajuan;
  const lanjut = alur[r.langkahKe + 1];
  return `<div class="sr-kartu${r.telat ? ' telat' : ''}" draggable="${N.izin.ubah ? 'true' : 'false'}" data-id="${H(r.id)}" data-status="${r.status}">
    <div class="sr-kartu-atas"><span class="sr-jenis sr-jenis-${r.jenis}">${H(N.jenis[r.jenis].label.replace('Pengajuan ', ''))}</span>${pilSifat(r.sifat)}</div>
    <div class="sr-kartu-j">${H(r.perihal)}</div>
    <div class="sr-kartu-s">${H(r.pengirim)}</div>
    <div class="sr-kartu-bawah"><b>${r.nominalDisetujui ? fmtRp(r.nominalDisetujui) : r.nominalDiajukan ? fmtRp(r.nominalDiajukan) : ''}</b>
      <span>${r.telat ? '<b class="sr-merah">Lewat tenggat</b>' : H(fmtTgl(r.tanggalTerima))}</span></div>
    ${N.izin.ubah && lanjut && r.status !== 'ditolak' ? `<button type="button" class="sr-lanjut" data-id="${H(r.id)}" data-ke="${lanjut}">${H(N.labelStatus[lanjut])} ${IKON.kanan}</button>` : ''}
  </div>`;
}
/* Papan bisa digeser dengan tetikus, dan tiap kartu punya tombol "lanjut"
   untuk layar sentuh (seret-lepas HTML5 tidak berjalan di ponsel). Kolom
   tujuan yang tidak sah langsung dijelaskan, tidak diam saja. */
function pasangPapan(wadah) {
  $$('.sr-kartu', wadah).forEach((k) => {
    k.onclick = (e) => { if (e.target.closest('.sr-lanjut')) return; location.hash = '#s/' + k.dataset.id; };
    k.ondragstart = (e) => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('seret'); };
    k.ondragend = () => { k.classList.remove('seret'); $$('.sr-kolom', wadah).forEach((c) => c.classList.remove('sasaran')); };
  });
  $$('.sr-lanjut', wadah).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); bukaPindah(b.dataset.id, b.dataset.ke); }; });
  $$('.sr-kolom', wadah).forEach((c) => {
    c.ondragover = (e) => { e.preventDefault(); c.classList.add('sasaran'); };
    c.ondragleave = () => c.classList.remove('sasaran');
    c.ondrop = (e) => {
      e.preventDefault(); c.classList.remove('sasaran');
      const id = e.dataTransfer.getData('text/plain');
      const r = N.baris.find((x) => x.id === id);
      if (!r || r.status === c.dataset.status) return;
      const alur = N.alur.pengajuan, dari = alur.indexOf(r.status), ke = alur.indexOf(c.dataset.status);
      if (c.dataset.status !== 'ditolak' && r.status !== 'ditolak' && Math.abs(ke - dari) !== 1) {
        return toast('Dari ' + r.statusLabel + ' hanya bisa ke ' + (N.labelStatus[alur[dari + 1]] || '-') + (dari > 0 ? ' atau kembali ke ' + N.labelStatus[alur[dari - 1]] : '') + '.', true);
      }
      bukaPindah(id, c.dataset.status);
    };
  });
}

// ============================================================ DISPOSISI SAYA
halaman.disposisi = {
  judul: 'Disposisi Saya',
  async gambar(el) {
    await muatDaftar();
    const isi = N.baris.filter((r) => r.disposisiSaya);
    el.innerHTML = isi.length ? `<div class="sr-jumlah">${isi.length} surat menunggu tindak lanjut Anda</div><div class="sr-daftar">${isi.map(barisSurat).join('')}</div>`
      : kosong('&#10003;', 'Tidak ada disposisi yang menunggu Anda.');
    pasangBaris(el);
  },
};

// ============================================================ DETAIL
let KINI = null;
async function gambarDetail(el, id) {
  const d = await rpc('surat.detail', { id });
  const r = d.surat;
  KINI = r;
  const alur = r.alur;
  const kini = r.status === 'ditolak' ? -1 : alur.indexOf(r.status);
  const waktu = {};
  r.riwayat.forEach((h) => { waktu[h.status] = h.waktu; });
  const stepper = '<div class="sr-step">' + alur.map((s, i) => {
    const lewat = r.status === 'ditolak' ? !!waktu[s] : i <= kini;
    return `<div class="sr-step-i${lewat ? ' lewat' : ''}${i === kini ? ' kini' : ''}" style="--w:${WARNA[s]}">
      <span class="sr-step-b">${lewat && i !== kini ? '&#10003;' : i + 1}</span><span class="sr-step-l">${H(N.labelStatus[s])}</span>
      <span class="sr-step-t">${lewat && waktu[s] ? H(fmtTgl(waktu[s])) : ''}</span></div>`;
  }).join('') + (r.status === 'ditolak' ? `<div class="sr-step-i kini" style="--w:${WARNA.ditolak}"><span class="sr-step-b">&#10005;</span><span class="sr-step-l">Ditolak</span><span class="sr-step-t">${H(fmtTgl(waktu.ditolak))}</span></div>` : '') + '</div>';

  /* Tombol langkah: satu tombol utama untuk maju, sisanya sekunder. */
  let aksi = '';
  if (N.izin.ubah) {
    const lanjut = r.status === 'ditolak' ? null : alur[kini + 1];
    if (lanjut) aksi += `<button type="button" class="btn btn-primary btn-sm" data-pindah="${lanjut}">Lanjut ke ${H(N.labelStatus[lanjut])} ${IKON.kanan}</button>`;
    if (r.status === 'ditolak') aksi += '<button type="button" class="btn btn-sm" data-pindah="diproses">Buka kembali</button>';
    if (kini > 0) aksi += `<button type="button" class="btn btn-sm" data-pindah="${alur[kini - 1]}">Kembalikan</button>`;
    if (pengajuan(r.jenis) && ['diterima', 'diproses', 'asesmen'].includes(r.status)) aksi += '<button type="button" class="btn btn-sm sr-btn-tolak" data-pindah="ditolak">Tolak</button>';
    if (r.jenis === 'masuk' || r.disposisi.length) aksi += `<button type="button" class="btn btn-sm" id="srBuatDisposisi">${IKON.disposisi.replace('width="20" height="20"', 'width="15" height="15"')} Disposisi</button>`;
  }
  if (r.jenis === 'masuk' && N.izin.tambah) aksi += `<button type="button" class="btn btn-sm" id="srBalas">${IKON.balas} Balas</button>`;
  if (r.bolehSunting) aksi += '<button type="button" class="btn btn-sm" id="srSunting">Sunting</button>';
  if (N.izin.hapus) aksi += `<button type="button" class="btn btn-sm sr-btn-tolak" id="srHapus">${IKON.hapus}</button>`;

  const info = [
    [r.jenis === 'keluar' ? 'Tujuan' : pengajuan(r.jenis) ? 'Pemohon' : 'Pengirim', r.jenis === 'keluar' ? r.tujuan : r.pengirim],
    ['Nomor surat', r.nomorSurat], ['Tanggal surat', r.tanggalSurat ? fmtTgl(r.tanggalSurat) : ''],
    [r.jenis === 'keluar' ? 'Tanggal dicatat' : 'Diterima', fmtTgl(r.tanggalTerima)], ['Tenggat', r.tenggat ? fmtTgl(r.tenggat) : ''],
    ['Kontak', r.kontak], ['Alamat', r.alamat], ['Kategori', r.kategori],
    ['Diajukan', r.nominalDiajukan ? fmtRp(r.nominalDiajukan) : ''], ['Disetujui', r.nominalDisetujui ? fmtRp(r.nominalDisetujui) : ''],
    ['Dicairkan', r.nominalCair ? fmtRp(r.nominalCair) + ' (' + fmtTgl(r.tanggalCair) + ')' : ''],
    ['Dikirim', r.tanggalKirim ? fmtTgl(r.tanggalKirim) : ''], ['Balasan untuk', r.balasanDariNomor ? `<a href="#s/${H(r.balasanDari)}">${H(r.balasanDariNomor)}</a>` : ''],
  ].filter((x) => x[1]);
  const infoHtml = '<dl class="sr-info">' + info.map(([k, v]) => `<div><dt>${H(k)}</dt><dd>${k === 'Balasan untuk' ? v : H(v)}</dd></div>`).join('') + '</dl>';

  let asesmen = '';
  if (pengajuan(r.jenis) && (r.asesmen || r.status === 'asesmen')) {
    const a = r.asesmen;
    asesmen = `<div class="card sr-kartu-d"><div class="sr-d-h"><h3>Asesmen</h3>${N.izin.ubah && r.status === 'asesmen' ? `<button type="button" class="btn btn-sm" id="srAsesmen">${a ? 'Ubah hasil' : 'Isi hasil asesmen'}</button>` : ''}</div>`
      + (a ? `<div class="sr-asesmen ${a.hasil === 'layak' ? 'layak' : 'tidak'}"><b>${a.hasil === 'layak' ? 'Layak dibantu' : 'Tidak layak'}</b>${a.rekomendasi ? ' · rekomendasi ' + fmtRp(a.rekomendasi) : ''}
          <div class="sr-kecil muted">${H(fmtTgl(a.tanggal))} · ${H(a.petugas)}</div>${a.catatan ? `<p>${H(a.catatan)}</p>` : ''}</div>`
        : '<p class="muted sr-kecil">Belum diisi. Catat hasil survei atau verifikasi sebelum diputuskan.</p>') + '</div>';
  }
  if (r.alasanTolak) asesmen = `<div class="sr-tolak-kotak"><b>Ditolak:</b> ${H(r.alasanTolak)}</div>` + asesmen;

  const disp = (r.disposisi || []).map((x) => {
    const saya = x.kepada.some((k) => k.id === N.pengguna.id);
    return `<div class="sr-disp${x.status === 'selesai' ? ' selesai' : ''}${saya && x.status !== 'selesai' ? ' saya' : ''}">
      <div class="sr-disp-h"><b>${H(x.dariNama)}</b> &rarr; ${x.kepada.map((k) => H(k.nama)).join(', ')}<span class="muted sr-kecil">${H(fmtWaktu(x.waktu))}</span></div>
      ${x.instruksi.length ? `<div class="sr-instruksi">${x.instruksi.map((i) => `<span>${H(i)}</span>`).join('')}</div>` : ''}
      ${x.catatan ? `<p>${H(x.catatan)}</p>` : ''}
      <div class="sr-disp-k">${x.batas ? `<span class="${x.status !== 'selesai' && x.batas < N.hariIni ? 'sr-merah' : ''}">Batas ${H(fmtTgl(x.batas))}</span>` : ''}
        ${x.status === 'selesai' ? `<span class="sr-ok">Selesai oleh ${H(x.selesaiOleh)}${x.balasan ? ': ' + H(x.balasan) : ''}</span>`
          : (saya || N.izin.ubah) ? `<button type="button" class="btn btn-sm" data-selesai="${H(x.id)}">Tandai selesai</button>` : '<span class="muted">Belum selesai</span>'}
        <button type="button" class="btn btn-sm sr-ikon-btn" data-cetak="${H(x.id)}" title="Cetak lembar disposisi">${IKON.cetak}</button></div>
    </div>`;
  }).join('');

  const lamp = r.rahasiaTertutup ? '<p class="muted sr-kecil">Surat rahasia: isi dan lampiran hanya untuk pencatat dan penerima disposisi.</p>'
    : (r.lampiran.length ? r.lampiran.map((l) => `<div class="sr-lamp">
        <span class="sr-lamp-ikon">${l.simpan === 'tautan' ? IKON.tautan : /image/.test(l.mime) ? 'IMG' : /pdf/.test(l.mime) ? 'PDF' : 'DOC'}</span>
        <span class="sr-lamp-isi"><button type="button" class="sr-lamp-n" data-buka="${H(l.id)}">${H(l.nama)}</button>
          <span class="muted sr-kecil">${l.simpan === 'tautan' ? 'Tautan' : fmtUkuran(l.ukuran) + (l.ukuranAsli > l.ukuran * 1.05 ? ' (asli ' + fmtUkuran(l.ukuranAsli) + ')' : '') + (l.simpan === 'drive' ? ' · Google Drive' : '')}</span></span>
        ${r.bolehSunting ? `<button type="button" class="sr-ikon-btn btn btn-sm" data-hapus-lamp="${H(l.id)}" title="Hapus lampiran">${IKON.hapus}</button>` : ''}</div>`).join('')
      : '<p class="muted sr-kecil">Belum ada lampiran.</p>')
      + (r.bolehSunting && r.lampiran.length < N.batas.maksLampiran ? zonaUnggah() : '');

  const riwayat = r.riwayat.slice().reverse().map((h) => `<div class="sr-rw" style="--w:${WARNA[h.status] || '#94a3b8'}"><i></i><div>
      <b>${H(N.labelStatus[h.status] || h.status)}</b> <span class="muted sr-kecil">${H(fmtWaktu(h.waktu))} · ${H(h.olehNama)}</span>
      ${h.catatan ? `<div class="sr-kecil">${H(h.catatan)}</div>` : ''}</div></div>`).join('');

  const lacak = r.kodeLacak ? `<div class="card sr-kartu-d"><h3>Lacak untuk pemohon</h3>
      <div class="sr-kode"><span>${H(r.kodeLacak)}</span><button type="button" class="btn btn-sm" id="srSalinLacak">${IKON.salin} Salin pesan</button></div>
      <p class="muted sr-kecil">Pemohon membuka halaman Lacak Pengajuan dengan nomor ${H(r.nomor)} dan kode ini. Catatan internal tidak terlihat oleh mereka.</p></div>` : '';

  const balasan = (r.balasan || []).length ? `<div class="card sr-kartu-d"><h3>Balasan</h3>${r.balasan.map((b) => `<a class="sr-tautan-surat" href="#s/${H(b.id)}">${H(b.nomor)} · ${H(b.perihal)} ${pil(b.status)}</a>`).join('')}</div>` : '';

  el.innerHTML = `<div class="sr-detail">
    <div class="sr-d-kiri">
      <div class="card sr-d-kepala">
        <div class="sr-d-atas"><span class="sr-jenis sr-jenis-${r.jenis}">${H(r.jenisLabel)}</span><span class="sr-nomor">${H(r.nomor)}</span>${pilSifat(r.sifat)}${r.telat ? '<span class="sr-sifat sr-sifat-segera">Lewat tenggat</span>' : ''}</div>
        <h2 class="sr-d-judul">${H(r.perihal)}</h2>
        ${stepper}
        ${aksi ? `<div class="sr-aksi">${aksi}</div>` : ''}
      </div>
      ${asesmen}
      <div class="card sr-kartu-d"><h3>Rincian</h3>${infoHtml}${r.ringkasan ? `<div class="sr-ringkasan">${H(r.ringkasan)}</div>` : ''}</div>
      ${(r.disposisi || []).length ? `<div class="card sr-kartu-d"><h3>Disposisi</h3>${disp}</div>` : ''}
    </div>
    <div class="sr-d-kanan">
      <div class="card sr-kartu-d"><h3>Lampiran <span class="muted sr-kecil">${r.lampiran.length}/${N.batas.maksLampiran}</span></h3>${lamp}</div>
      ${lacak}${balasan}
      <div class="card sr-kartu-d"><h3>Riwayat</h3><div class="sr-riwayat">${riwayat}</div></div>
    </div></div>`;
  pasangDetail(el, r);
}
function pasangDetail(el, r) {
  $$('[data-pindah]', el).forEach((b) => { b.onclick = () => bukaPindah(r.id, b.dataset.pindah); });
  const t = (id, f) => { const x = $('#' + id, el); if (x) x.onclick = f; };
  t('srBuatDisposisi', () => bukaDisposisi(r));
  t('srAsesmen', () => bukaAsesmen(r));
  t('srSunting', () => bukaCatat(r.jenis, r));
  t('srBalas', () => bukaCatat('keluar', null, r));
  t('srHapus', () => bukaHapus(r));
  t('srSalinLacak', () => {
    const teks = `Pengajuan Anda tercatat dengan nomor ${r.nomor}. Cek progresnya di ${location.origin}/lacak.html?n=${encodeURIComponent(r.nomor)} dengan kode ${r.kodeLacak}.`;
    salin(teks);
  });
  $$('[data-selesai]', el).forEach((b) => { b.onclick = () => bukaSelesaiDisposisi(r, b.dataset.selesai); });
  $$('[data-cetak]', el).forEach((b) => { b.onclick = () => cetakDisposisi(r, b.dataset.cetak); });
  $$('[data-buka]', el).forEach((b) => { b.onclick = () => bukaLampiran(r, b.dataset.buka); });
  $$('[data-hapus-lamp]', el).forEach((b) => {
    b.onclick = async () => {
      if (b.dataset.yakin !== '1') { b.dataset.yakin = '1'; b.classList.add('sr-btn-tolak'); b.title = 'Klik sekali lagi untuk menghapus'; toast('Klik sekali lagi untuk menghapus lampiran.'); return; }
      await sibuk(b, async () => { await rpc('surat.lampiran.hapus', { id: r.id, lid: b.dataset.hapusLamp }); toast('Lampiran dihapus.'); muatUlangDetail(); });
    };
  });
  pasangZonaUnggah(el, r.id, r.lampiran.length);
}
function muatUlangDetail() { if (KINI) buka('s/' + KINI.id); }
function salin(teks) {
  const ok = () => toast('Disalin. Tempel di WhatsApp untuk pemohon.');
  if (navigator.clipboard) navigator.clipboard.writeText(teks).then(ok).catch(() => prompt('Salin pesan ini:', teks));
  else prompt('Salin pesan ini:', teks);
}

// ------------------------------------------------------------ pindah langkah
function bukaPindah(id, ke) {
  const r = (KINI && KINI.id === id) ? KINI : N.baris.find((x) => x.id === id);
  if (!r) return;
  const alur = alurDari(r.jenis);
  const mundur = r.status !== 'ditolak' && alur.indexOf(ke) < alur.indexOf(r.status) && ke !== 'ditolak';
  const bukaLagi = r.status === 'ditolak';
  let isi = `<div class="sr-pindah"><div class="sr-pindah-alur">${pil(r.status)} <span>&rarr;</span> ${pil(ke)}</div><div class="fgrid">`;
  if (ke === 'disetujui') isi += `<div class="fld" data-col="12"><label>Nominal disetujui${r.jenis === 'proposal' ? ' (boleh kosong untuk proposal non-dana)' : ''}</label><input id="pNominal" inputmode="numeric" placeholder="Rp" value="${H(r.nominalDiajukan ? Math.round((r.asesmen && r.asesmen.rekomendasi) || r.nominalDiajukan).toLocaleString('id-ID') : '')}"></div>`;
  if (ke === 'dicairkan') isi += `<div class="fld" data-col="6"><label>Nominal dicairkan</label><input id="pNominal" inputmode="numeric" value="${H(r.nominalDisetujui ? r.nominalDisetujui.toLocaleString('id-ID') : '')}"></div><div class="fld" data-col="6"><label>Tanggal cair</label><input type="date" id="pTanggal" value="${N.hariIni}"></div>`;
  if (ke === 'dikirim') isi += `<div class="fld" data-col="12"><label>Tanggal dikirim</label><input type="date" id="pTanggal" value="${N.hariIni}"></div>`;
  const wajibCatatan = ke === 'ditolak' || mundur || bukaLagi;
  isi += `<div class="fld" data-col="12"><label>${ke === 'ditolak' ? 'Alasan penolakan' : mundur ? 'Alasan dikembalikan' : bukaLagi ? 'Alasan dibuka kembali' : 'Catatan (opsional)'}</label><textarea id="pCatatan" rows="3" placeholder="${wajibCatatan ? 'Wajib diisi' : 'Misalnya: berkas sudah lengkap'}"></textarea></div></div></div>`;
  modal(ke === 'ditolak' ? 'Tolak pengajuan' : mundur ? 'Kembalikan ke ' + N.labelStatus[ke] : bukaLagi ? 'Buka kembali pengajuan' : 'Lanjut ke ' + N.labelStatus[ke], isi,
    `<button class="btn" type="button" onclick="tutupModal()">Batal</button><button class="btn ${ke === 'ditolak' ? 'btn-danger' : 'btn-primary'}" type="button" id="pSimpan">${ke === 'ditolak' ? 'Tolak' : 'Simpan'}</button>`, 'sr-modal-kecil');
  formatRupiahInput($('#pNominal'));
  $('#pSimpan').onclick = () => sibuk($('#pSimpan'), async () => {
    const angka = $('#pNominal') ? $('#pNominal').value.replace(/\D/g, '') : '';
    const data = { id, ke, catatan: $('#pCatatan').value };
    if (ke === 'disetujui') data.nominalDisetujui = angka;
    if (ke === 'dicairkan') { data.nominalCair = angka; data.tanggalCair = $('#pTanggal').value; }
    if (ke === 'dikirim') data.tanggalKirim = $('#pTanggal').value;
    const h = await rpc('surat.pindah', data);
    tutupModal(); toast(h.pesan);
    if (location.hash.startsWith('#s/')) muatUlangDetail(); else buka(location.hash.slice(1));
  });
}
function formatRupiahInput(inp) {
  if (!inp) return;
  inp.oninput = () => { const n = inp.value.replace(/\D/g, ''); inp.value = n ? Number(n).toLocaleString('id-ID') : ''; };
}

function bukaAsesmen(r) {
  const a = r.asesmen || {};
  modal('Hasil asesmen', `<div class="fgrid">
    <div class="fld" data-col="12"><label>Hasil</label><div class="sr-pilihan">
      <label class="sr-pilih ${a.hasil === 'layak' ? 'on' : ''}"><input type="radio" name="aHasil" value="layak" ${a.hasil === 'layak' ? 'checked' : ''}> Layak dibantu</label>
      <label class="sr-pilih ${a.hasil === 'tidak' ? 'on' : ''}"><input type="radio" name="aHasil" value="tidak" ${a.hasil === 'tidak' ? 'checked' : ''}> Tidak layak</label></div></div>
    <div class="fld" data-col="6"><label>Tanggal survei</label><input type="date" id="aTanggal" value="${H(a.tanggal || N.hariIni)}"></div>
    <div class="fld" data-col="6"><label>Petugas</label><input id="aPetugas" value="${H(a.petugas || N.pengguna.nama)}"></div>
    <div class="fld" data-col="12"><label>Rekomendasi nominal</label><input id="aRek" inputmode="numeric" value="${H(a.rekomendasi ? a.rekomendasi.toLocaleString('id-ID') : '')}" placeholder="Rp"></div>
    <div class="fld" data-col="12"><label>Catatan asesmen</label><textarea id="aCatatan" rows="4" placeholder="Kondisi pemohon, hasil verifikasi berkas, dan sebagainya">${H(a.catatan || '')}</textarea></div></div>`,
  '<button class="btn" type="button" onclick="tutupModal()">Batal</button><button class="btn btn-primary" type="button" id="aSimpan">Simpan</button>', 'sr-modal-kecil');
  formatRupiahInput($('#aRek'));
  $$('.sr-pilih input').forEach((i) => { i.onchange = () => $$('.sr-pilih').forEach((l) => l.classList.toggle('on', l.contains(i) && i.checked)); });
  $('#aSimpan').onclick = () => sibuk($('#aSimpan'), async () => {
    const h = ($$('input[name=aHasil]').find((i) => i.checked) || {}).value || '';
    await rpc('surat.asesmen', { id: r.id, hasil: h, tanggal: $('#aTanggal').value, petugas: $('#aPetugas').value, rekomendasi: $('#aRek').value.replace(/\D/g, ''), catatan: $('#aCatatan').value });
    tutupModal(); toast('Hasil asesmen disimpan.'); muatUlangDetail();
  });
}

// ------------------------------------------------------------ disposisi
async function bukaDisposisi(r) {
  if (!N.akun) { try { N.akun = (await rpc('surat.akun')).akun || []; } catch (e) { return toast(e.message, true); } }
  const isi = `<div class="fgrid">
    <div class="fld" data-col="12"><label>Kepada</label><div class="penerima">
      <input class="penerima-cari" id="dCari" placeholder="Cari nama">
      <div class="penerima-daftar">${N.akun.filter((a) => a.id !== N.pengguna.id).map((a) => `<label class="penerima-baris"><input type="checkbox" value="${H(a.id)}"><span class="pilih-nama">${H(a.nama)}</span><span class="pilih-ket">${H(a.kantor)}</span></label>`).join('') || '<div class="muted sr-kecil" style="padding:10px">Belum ada akun lain yang punya akses modul Surat.</div>'}</div></div></div>
    <div class="fld" data-col="12"><label>Instruksi</label><div class="sr-instruksi-pilih">${N.instruksi.map((i) => `<label><input type="checkbox" value="${H(i)}"><span>${H(i)}</span></label>`).join('')}</div></div>
    <div class="fld" data-col="8"><label>Catatan</label><textarea id="dCatatan" rows="3"></textarea></div>
    <div class="fld" data-col="4"><label>Batas waktu</label><input type="date" id="dBatas" value="${H(r.tenggat || '')}"></div></div>`;
  modal('Disposisi ' + r.nomor, isi, '<button class="btn" type="button" onclick="tutupModal()">Batal</button><button class="btn btn-primary" type="button" id="dKirim">Kirim disposisi</button>');
  $('#dCari').oninput = () => { const q = $('#dCari').value.toLowerCase(); $$('.penerima-baris').forEach((b) => { b.style.display = b.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };
  $('#dKirim').onclick = () => sibuk($('#dKirim'), async () => {
    const kepada = $$('.penerima-baris input:checked').map((i) => i.value);
    const instruksi = $$('.sr-instruksi-pilih input:checked').map((i) => i.value);
    await rpc('surat.disposisi', { id: r.id, kepada, instruksi, catatan: $('#dCatatan').value, batas: $('#dBatas').value });
    tutupModal(); toast('Disposisi dikirim.'); muatUlangDetail();
  });
}
function bukaSelesaiDisposisi(r, did) {
  modal('Tandai disposisi selesai', '<div class="fgrid"><div class="fld" data-col="12"><label>Laporan tindak lanjut (opsional)</label><textarea id="sBalas" rows="3" placeholder="Misalnya: sudah dihadiri, notulen terlampir"></textarea></div></div>',
    '<button class="btn" type="button" onclick="tutupModal()">Batal</button><button class="btn btn-primary" type="button" id="sOk">Selesai</button>', 'sr-modal-kecil');
  $('#sOk').onclick = () => sibuk($('#sOk'), async () => {
    await rpc('surat.disposisi.selesai', { id: r.id, did, balasan: $('#sBalas').value });
    tutupModal(); toast('Disposisi selesai.'); muatUlangDetail();
  });
}
/* Lembar disposisi cetak: bentuk kertas yang biasa ditempel di surat fisik. */
function cetakDisposisi(r, did) {
  const d = r.disposisi.find((x) => x.id === did);
  if (!d) return;
  const L = N.lembaga || {};
  const w = window.open('', '_blank');
  if (!w) return toast('Izinkan jendela baru untuk mencetak.', true);
  const baris = (k, v) => `<tr><td>${H(k)}</td><td>:</td><td>${v}</td></tr>`;
  w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Lembar Disposisi ${H(r.nomor)}</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:0;padding:28px;background:#fff}.lb{max-width:720px;margin:0 auto;border:2px solid #111;padding:22px 26px}
    .kop{text-align:center;border-bottom:3px double #111;padding-bottom:10px;margin-bottom:14px}.kop b{font-size:18px;display:block}.kop span{font-size:12px}
    h1{text-align:center;font-size:16px;letter-spacing:3px;margin:6px 0 16px}table{width:100%;border-collapse:collapse;font-size:13.5px}td{padding:5px 0;vertical-align:top}
    td:first-child{width:150px}td:nth-child(2){width:14px}.kotak{border:1px solid #111;padding:10px 12px;margin-top:14px;min-height:60px;font-size:13.5px}
    .ins{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-top:6px}.ins span:before{content:"\\2610  ";font-size:15px}.ins span.ya:before{content:"\\2611  "}
    .ttd{display:flex;justify-content:flex-end;margin-top:26px;font-size:13px}.ttd div{text-align:center;width:220px}.ttd .sp{height:60px}
    .bar{text-align:center;margin-top:16px}.bar button{padding:9px 20px;border-radius:999px;border:0;background:#111;color:#fff;cursor:pointer}@media print{.bar{display:none}body{padding:0}}</style></head><body>
    <div class="lb"><div class="kop"><b>${H(L.namaLembaga || 'Lazismu')}</b><span>${H(L.alamat || '')}${L.telepon ? ' · ' + H(L.telepon) : ''}</span></div>
    <h1>LEMBAR DISPOSISI</h1><table>
    ${baris('No. agenda', H(r.nomor))}${baris('Asal surat', H(r.pengirim || '-'))}${baris('Nomor surat', H(r.nomorSurat || '-'))}
    ${baris('Tanggal surat', H(r.tanggalSurat ? fmtTgl(r.tanggalSurat) : '-'))}${baris('Diterima', H(fmtTgl(r.tanggalTerima)))}${baris('Perihal', H(r.perihal))}
    ${baris('Sifat', H(SIFAT_LABEL[r.sifat] || 'Biasa'))}${baris('Diteruskan kepada', H(d.kepada.map((k) => k.nama).join(', ')))}${baris('Batas waktu', H(d.batas ? fmtTgl(d.batas) : '-'))}</table>
    <div class="kotak"><b>Instruksi:</b><div class="ins">${N.instruksi.map((i) => `<span class="${d.instruksi.includes(i) ? 'ya' : ''}">${H(i)}</span>`).join('')}</div></div>
    <div class="kotak"><b>Catatan:</b><div>${H(d.catatan || '')}</div></div>
    <div class="ttd"><div>${H(fmtTgl(d.waktu))}<div class="sp"></div><b>${H(d.dariNama)}</b></div></div></div>
    <div class="bar"><button onclick="window.print()">Cetak</button></div></body></html>`);
  w.document.close();
}

function bukaHapus(r) {
  modal('Hapus surat', `<p>Hapus <b>${H(r.nomor)}</b> "${H(r.perihal)}" beserta ${r.lampiran.length} lampirannya? Tidak bisa dikembalikan.</p>`,
    '<button class="btn" type="button" onclick="tutupModal()">Batal</button><button class="btn btn-danger" type="button" id="hYa">Hapus</button>', 'sr-modal-kecil');
  $('#hYa').onclick = () => sibuk($('#hYa'), async () => { await rpc('surat.hapus', { id: r.id }); tutupModal(); toast('Surat dihapus.'); location.hash = '#' + (pengajuan(r.jenis) ? 'pengajuan' : r.jenis); });
}

// ------------------------------------------------------------ lampiran: buka
async function bukaLampiran(r, lid) {
  const l = r.lampiran.find((x) => x.id === lid);
  if (!l) return;
  if (l.simpan === 'tautan') { window.open(l.url, '_blank', 'noopener'); return; }
  toast('Membuka ' + l.nama + '...');
  try {
    const h = await rpc('surat.lampiran.ambil', { id: r.id, lid });
    const bin = atob(h.isi);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: l.mime }));
    if (/^image\//.test(l.mime)) {
      modal(l.nama, `<div class="sr-pratinjau"><img src="${url}" alt="${H(l.nama)}"></div>`,
        `<a class="btn" href="${url}" download="${H(l.nama)}">${IKON.unduh} Unduh</a><button class="btn btn-primary" type="button" onclick="tutupModal()">Tutup</button>`, 'sr-modal-lebar');
    } else if (/pdf/.test(l.mime)) {
      const w = window.open(url, '_blank');
      if (!w) { const a = document.createElement('a'); a.href = url; a.download = l.nama; a.click(); }
    } else { const a = document.createElement('a'); a.href = url; a.download = l.nama; a.click(); }
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------ lampiran: unggah + kompres
/* BATAS DAN KOMPRESI (pemilik: "pastikan kalau upload dokumen berapa
   maksimalnya, dan ada pemrosesan di dalam uploadnya di kompres").
   - Foto selalu dikompres ke JPEG, sisi terpanjang 1800 px lalu turun
     bertahap sampai di bawah 900 KB. Foto ponsel 3 sampai 5 MB biasanya jadi
     250 sampai 450 KB dan tetap terbaca.
   - PDF di bawah 2 MB dikirim apa adanya. Di atasnya ditawari "Kompres PDF":
     tiap halaman digambar ulang sebagai JPEG lalu disusun lagi jadi PDF
     (cocok untuk PDF hasil scan, yang memang isinya gambar). Pustakanya
     (pdf.js dan jsPDF) baru diunduh saat tombolnya ditekan.
   - Kalau masih terlalu besar, atau berkas Word/Excel di atas 2 MB, pilihan
     terakhir: simpan sebagai tautan Google Drive. */
/* pdf.js memakai salinan di server sendiri (src/public/js/vendor, 3.11.174, sama persis dengan yang
   dulu diunduh dari cdnjs), alasannya sama dengan halaman AI: skrip dari CDN berarti pihak ketiga
   bisa mengganti isinya kapan saja, dan kantor yang memblokir CDN membuat Kompres PDF buntu. Hanya
   jsPDF yang masih dari CDN (belum ada salinan lokalnya). Versi pdf.js dan worker-nya HARUS sama. */
const PDFJS = '/js/vendor/pdf.min.js';
const PDFJS_KERJA = '/js/vendor/pdf.worker.min.js';
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const MIME_EKS = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', xls: 'application/vnd.ms-excel' };
function mimeBerkas(f) { const e = String(f.name).split('.').pop().toLowerCase(); return MIME_EKS[e] || f.type || ''; }
function muatSkrip(src) {
  return new Promise((ok, gagal) => {
    /* s.src selalu berbentuk alamat penuh, jadi alamat relatif (salinan lokal) harus diubah dulu;
       tanpa ini skripnya ditambahkan lagi setiap kali Kompres PDF ditekan. */
    const penuh = new URL(src, location.href).href;
    if ($$('script').some((s) => s.src === penuh)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = () => ok(); s.onerror = () => { s.remove(); gagal(new Error('Pustaka kompres PDF tidak bisa diunduh. Periksa internet, atau simpan sebagai tautan.')); };   /* dibuang: yang gagal tidak boleh dianggap sudah termuat pada percobaan berikutnya */
    document.head.appendChild(s);
  });
}
async function kompresGambar(f) {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => gagal(new Error('Gambar tidak bisa dibaca.')); i.src = url; });
    let sisi = 1800, mutu = 0.8, hasil = null;
    for (let i = 0; i < 6; i++) {
      const k = Math.min(1, sisi / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      hasil = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', mutu));
      if (hasil && hasil.size <= 900 * 1024) break;
      mutu = Math.max(0.45, mutu - 0.1); sisi = Math.round(sisi * 0.85);
    }
    /* Kalau hasilnya justru lebih besar (JPEG kecil yang sudah rapat),
       pakai berkas aslinya. */
    if (hasil && hasil.size >= f.size && f.size <= N.batas.maksBerkas) return f;
    return new File([hasil], String(f.name).replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(url); }
}
async function kompresPdf(f, kemajuan) {
  await muatSkrip(PDFJS); await muatSkrip(JSPDF);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_KERJA;
  const doc = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
  if (doc.numPages > 80) throw new Error('PDF ' + doc.numPages + ' halaman terlalu panjang untuk dikompres di sini. Simpan sebagai tautan.');
  let keluar = null;
  for (let p = 1; p <= doc.numPages; p++) {
    kemajuan('Mengompres halaman ' + p + ' dari ' + doc.numPages);
    const hal = await doc.getPage(p);
    const v1 = hal.getViewport({ scale: 1 });
    const skala = Math.min(1.7, 1500 / Math.max(v1.width, v1.height));
    const v = hal.getViewport({ scale: skala });
    const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await hal.render({ canvasContext: x, viewport: v }).promise;
    const jpg = c.toDataURL('image/jpeg', 0.6);
    const arah = v1.width > v1.height ? 'l' : 'p';
    if (!keluar) keluar = new window.jspdf.jsPDF({ orientation: arah, unit: 'pt', format: [v1.width, v1.height], compress: true });
    else keluar.addPage([v1.width, v1.height], arah);
    keluar.addImage(jpg, 'JPEG', 0, 0, v1.width, v1.height);
  }
  return new File([keluar.output('blob')], f.name, { type: 'application/pdf' });
}
function base64(f) {
  return new Promise((ok, gagal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => gagal(new Error('Berkas tidak bisa dibaca.')); r.readAsDataURL(f); });
}
function zonaUnggah() {
  return `<div class="sr-zona" id="srZona" tabindex="0" role="button" aria-label="Tambah lampiran">
      <input type="file" id="srBerkas" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" hidden>
      <div class="sr-zona-ikon">${IKON.klip.replace('width="14" height="14"', 'width="22" height="22"')}</div>
      <div><b>Tarik berkas ke sini</b> atau klik untuk memilih</div>
      <div class="muted sr-kecil">PDF, foto, Word, Excel · maks ${fmtUkuran(N.batas.maksBerkas)} per berkas · foto dikompres otomatis</div>
    </div>
    <button type="button" class="sr-tautan-btn" id="srTambahTautan">${IKON.tautan} Simpan tautan Google Drive</button>
    <div id="srAntre" class="sr-antre"></div>`;
}
function pasangZonaUnggah(el, id, sudah) {
  const z = $('#srZona', el);
  if (!z) return;
  const inp = $('#srBerkas', el);
  z.onclick = () => inp.click();
  z.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  z.ondragover = (e) => { e.preventDefault(); z.classList.add('di-atas'); };
  z.ondragleave = () => z.classList.remove('di-atas');
  z.ondrop = (e) => { e.preventDefault(); z.classList.remove('di-atas'); proses([...e.dataTransfer.files]); };
  inp.onchange = () => { proses([...inp.files]); inp.value = ''; };
  $('#srTambahTautan', el).onclick = () => bukaTautan(id);
  async function proses(daftar) {
    const sisa = N.batas.maksLampiran - sudah;
    if (daftar.length > sisa) { toast('Sisa tempat ' + sisa + ' lampiran. Yang lain tidak diunggah.', true); daftar = daftar.slice(0, sisa); }
    let ada = false;
    for (const f of daftar) { if (await unggahSatu(id, f, $('#srAntre', el))) ada = true; }
    if (ada) muatUlangDetail();
  }
}
/* Satu berkas: kompres kalau bisa, kirim kalau muat, tawarkan pilihan kalau
   tidak. Mengembalikan true kalau tersimpan. */
async function unggahSatu(id, f, antre) {
  const mime = mimeBerkas(f);
  const baris = document.createElement('div');
  baris.className = 'sr-antre-i';
  baris.innerHTML = `<b>${H(f.name)}</b><span class="sr-antre-s">Memeriksa...</span><div class="sr-antre-bar"><i></i></div>`;
  antre.appendChild(baris);
  const status = (t, kelas, persen) => { $('.sr-antre-s', baris).innerHTML = t; baris.className = 'sr-antre-i ' + (kelas || ''); if (persen !== undefined) $('.sr-antre-bar i', baris).style.width = persen + '%'; };
  if (!N.batas.mime.includes(mime)) { status('Jenis berkas tidak didukung. Pakai PDF, foto, Word, atau Excel.', 'gagal'); return false; }
  let berkas = f;
  try {
    if (/^image\//.test(mime)) {
      status('Mengompres foto...', '', 30);
      berkas = await kompresGambar(f);
    }
    if (berkas.size > N.batas.maksBerkas) {
      if (mime === 'application/pdf') {
        status(`PDF ${fmtUkuran(f.size)} melebihi batas ${fmtUkuran(N.batas.maksBerkas)}. Kompres dulu (cocok untuk hasil scan), atau simpan sebagai tautan.`, 'tanya');
        const pilih = await tawarPilihan(baris, '', true);
        if (pilih === 'tautan') { baris.remove(); bukaTautan(id, f.name); return false; }
        if (pilih !== 'kompres') { status('Dibatalkan.', 'gagal'); return false; }
        try { berkas = await kompresPdf(f, (t) => status(t, '', 50)); }
        catch (e) {
          /* Pustaka tidak terunduh atau PDF-nya terkunci: jangan buntu,
             tawarkan jalan terakhirnya. */
          status(H(e.message || String(e)), 'tanya');
          if ((await tawarPilihan(baris, '', false)) === 'tautan') bukaTautan(id, f.name);
          return false;
        }
        if (berkas.size > N.batas.maksBerkas) {
          status(`Sesudah dikompres masih ${fmtUkuran(berkas.size)}. Simpan sebagai tautan Google Drive.`, 'gagal');
          const p2 = await tawarPilihan(baris, '', false);
          if (p2 === 'tautan') { bukaTautan(id, f.name); }
          return false;
        }
      } else {
        status(`${fmtUkuran(berkas.size)} melebihi ${fmtUkuran(N.batas.maksBerkas)}.`, 'gagal');
        const p = await tawarPilihan(baris, '', false);
        if (p === 'tautan') bukaTautan(id, f.name);
        return false;
      }
    }
    status('Mengunggah' + (berkas.size < f.size ? ` (${fmtUkuran(f.size)} &rarr; ${fmtUkuran(berkas.size)})` : '') + '...', '', 75);
    await rpc('surat.lampiran.tambah', { id, nama: berkas === f ? f.name : berkas.name, mime: berkas.type || mime, isi: await base64(berkas), ukuranAsli: f.size });
    const hemat = f.size > berkas.size ? Math.round((1 - berkas.size / f.size) * 100) : 0;
    status(hemat ? `Tersimpan · ${fmtUkuran(f.size)} &rarr; ${fmtUkuran(berkas.size)} (hemat ${hemat}%)` : 'Tersimpan · ' + fmtUkuran(berkas.size), 'ok', 100);
    toast(hemat ? f.name + ' dikompres ' + hemat + '% dan tersimpan.' : f.name + ' tersimpan.');
    return true;
  } catch (e) { status(H(e.message || String(e)), 'gagal'); return false; }
}
function tawarPilihan(baris, teks, bisaKompres) {
  return new Promise((ok) => {
    const k = document.createElement('div');
    k.className = 'sr-tawar';
    k.innerHTML = (teks ? `<span>${H(teks)}</span>` : '') + (bisaKompres ? '<button type="button" class="btn btn-primary btn-sm" data-p="kompres">Kompres PDF</button>' : '')
      + '<button type="button" class="btn btn-sm" data-p="tautan">Simpan sebagai tautan</button><button type="button" class="btn btn-sm" data-p="batal">Batal</button>';
    baris.appendChild(k);
    $$('button', k).forEach((b) => { b.onclick = () => { k.remove(); ok(b.dataset.p); }; });
  });
}
function bukaTautan(id, nama) {
  modal('Simpan tautan', `<div class="fgrid"><div class="fld" data-col="12"><label>Nama lampiran</label><input id="tNama" value="${H(nama || '')}" placeholder="Misalnya: Proposal lengkap"></div>
    <div class="fld" data-col="12"><label>Tautan (Google Drive atau penyimpanan lain)</label><input id="tUrl" placeholder="https://drive.google.com/..."></div>
    <div class="fld-ket" style="grid-column:span 12">Unggah berkasnya ke Google Drive lembaga, pilih "Bagikan" lalu "Salin link", dan tempel di sini. Tidak memakan ruang basis data.</div></div>`,
  '<button class="btn" type="button" onclick="tutupModal()">Batal</button><button class="btn btn-primary" type="button" id="tSimpan">Simpan</button>', 'sr-modal-kecil');
  $('#tSimpan').onclick = () => sibuk($('#tSimpan'), async () => {
    await rpc('surat.lampiran.tambah', { id, nama: $('#tNama').value || 'Tautan', tautan: $('#tUrl').value.trim() });
    tutupModal(); toast('Tautan disimpan.'); muatUlangDetail();
  });
}

// ------------------------------------------------------------ catat / sunting
function bukaCatat(jenis, lama, balasUntuk) {
  jenis = jenis || 'masuk';
  const sunting = !!lama;
  const r = lama || (balasUntuk ? { perihal: 'Balasan: ' + balasUntuk.perihal, tujuan: balasUntuk.pengirim, balasanDari: balasUntuk.id } : {});
  const pilihJenis = sunting ? '' : `<div class="sr-pilih-jenis">${Object.keys(N.jenis).map((j) => `<button type="button" class="${j === jenis ? 'on' : ''}" data-j="${j}">
      <span>${IKON[j]}</span>${H(N.jenis[j].label)}</button>`).join('')}</div>`;
  modal(sunting ? 'Sunting ' + r.nomor : balasUntuk ? 'Balas ' + balasUntuk.nomor : 'Catat surat', pilihJenis + '<div id="cForm"></div>',
    `<button class="btn" type="button" onclick="tutupModal()">Batal</button><button class="btn btn-primary" type="button" id="cSimpan">${sunting ? 'Simpan perubahan' : 'Catat'}</button>`, 'sr-modal-catat');
  const gambarForm = () => {
    const p = pengajuan(jenis), kel = jenis === 'keluar';
    const v = (k) => H(r[k] || '');
    $('#cForm').innerHTML = `<div class="fgrid">
      <div class="fld" data-col="12"><label>Perihal *</label><input id="cPerihal" value="${v('perihal')}" placeholder="${p ? 'Misalnya: Permohonan bantuan biaya sekolah' : 'Misalnya: Undangan rapat koordinasi'}"></div>
      <div class="fld" data-col="${p ? 6 : 8}"><label>${kel ? 'Tujuan *' : p ? 'Pemohon / lembaga *' : 'Pengirim *'}</label><input id="cSiapa" value="${kel ? v('tujuan') : v('pengirim')}"></div>
      <div class="fld" data-col="${p ? 6 : 4}"><label>${p ? 'Kontak (telepon)' : 'Nomor surat'}</label><input id="${p ? 'cKontak' : 'cNomorSurat'}" value="${p ? v('kontak') : v('nomorSurat')}"></div>
      ${p ? `<div class="fld" data-col="12"><label>Alamat</label><input id="cAlamat" value="${v('alamat')}"></div>
        <div class="fld" data-col="6"><label>Kategori</label><select id="cKategori"><option value="">Pilih kategori</option>${KATEGORI.map((k) => `<option ${r.kategori === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="fld" data-col="6"><label>Nominal diajukan</label><input id="cNominal" inputmode="numeric" placeholder="Rp" value="${r.nominalDiajukan ? Number(r.nominalDiajukan).toLocaleString('id-ID') : ''}"></div>
        <div class="fld" data-col="4"><label>Nomor surat</label><input id="cNomorSurat" value="${v('nomorSurat')}"></div>` : ''}
      <div class="fld" data-col="4"><label>Tanggal surat</label><input type="date" id="cTglSurat" value="${v('tanggalSurat')}"></div>
      <div class="fld" data-col="4"><label>${kel ? 'Tanggal dicatat' : 'Tanggal diterima'}</label><input type="date" id="cTglTerima" value="${H(r.tanggalTerima || N.hariIni)}"></div>
      ${p ? '' : `<div class="fld" data-col="4"><label>Sifat</label><select id="cSifat">${N.sifat.map((s) => `<option value="${s}" ${(r.sifat || 'biasa') === s ? 'selected' : ''}>${SIFAT_LABEL[s]}</option>`).join('')}</select></div>`}
      <div class="fld" data-col="4"><label>Tenggat tindak lanjut</label><input type="date" id="cTenggat" value="${v('tenggat')}"></div>
      ${p ? `<div class="fld" data-col="4"><label>Sifat</label><select id="cSifat">${N.sifat.map((s) => `<option value="${s}" ${(r.sifat || 'biasa') === s ? 'selected' : ''}>${SIFAT_LABEL[s]}</option>`).join('')}</select></div>` : ''}
      <div class="fld" data-col="12"><label>Ringkasan isi</label><textarea id="cRingkasan" rows="3" placeholder="Pokok isi surat atau kebutuhan pemohon">${v('ringkasan')}</textarea></div>
      ${sunting ? '' : `<div class="fld" data-col="12"><label>Lampiran (bisa ditambah nanti)</label><div class="sr-zona sr-zona-kecil" id="cZona" tabindex="0" role="button">
        <input type="file" id="cBerkas" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" hidden>
        <div><b>Pilih atau tarik berkas</b> <span class="muted sr-kecil">maks ${fmtUkuran(N.batas.maksBerkas)}, foto dikompres otomatis</span></div></div><div id="cAntreDaftar" class="sr-antre-pra"></div></div>`}
    </div>`;
    formatRupiahInput($('#cNominal'));
    const z = $('#cZona');
    if (z) {
      const inp = $('#cBerkas');
      const tambah = (fs) => { ANTRE_CATAT.push(...fs); gambarAntre(); };
      z.onclick = () => inp.click();
      z.ondragover = (e) => { e.preventDefault(); z.classList.add('di-atas'); };
      z.ondragleave = () => z.classList.remove('di-atas');
      z.ondrop = (e) => { e.preventDefault(); z.classList.remove('di-atas'); tambah([...e.dataTransfer.files]); };
      inp.onchange = () => { tambah([...inp.files]); inp.value = ''; };
      gambarAntre();
    }
    if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
  };
  const ANTRE_CATAT = [];
  const gambarAntre = () => {
    const w = $('#cAntreDaftar');
    if (!w) return;
    w.innerHTML = ANTRE_CATAT.map((f, i) => `<span class="sr-antre-chip">${H(f.name)} <i>${fmtUkuran(f.size)}</i><button type="button" data-i="${i}" aria-label="Lepas">&times;</button></span>`).join('');
    $$('button', w).forEach((b) => { b.onclick = () => { ANTRE_CATAT.splice(Number(b.dataset.i), 1); gambarAntre(); }; });
  };
  $$('.sr-pilih-jenis button').forEach((b) => { b.onclick = () => {
    /* Isian yang sudah diketik dibawa saat berganti jenis. */
    const simpanSementara = ambilIsian(jenis); Object.assign(r, simpanSementara);
    jenis = b.dataset.j; $$('.sr-pilih-jenis button').forEach((x) => x.classList.toggle('on', x === b)); gambarForm();
  }; });
  gambarForm();
  $('#cSimpan').onclick = () => sibuk($('#cSimpan'), async () => {
    const data = Object.assign(ambilIsian(jenis), { jenis });
    if (r.balasanDari) data.balasanDari = r.balasanDari;
    if (sunting) {
      data.id = lama.id;
      await rpc('surat.ubah', data);
      tutupModal(); toast('Perubahan disimpan.'); muatUlangDetail();
      return;
    }
    const h = await rpc('surat.simpan', data);
    const baru = h.surat;
    if (ANTRE_CATAT.length) {
      $('#modalBody').innerHTML = `<p>Tercatat dengan nomor <b>${H(baru.nomor)}</b>. Mengunggah lampiran...</p><div id="cAntre" class="sr-antre"></div>`;
      $('#modalFoot').innerHTML = '';
      for (const f of ANTRE_CATAT.slice(0, N.batas.maksLampiran)) await unggahSatu(baru.id, f, $('#cAntre'));
      await new Promise((t) => setTimeout(t, 600));
    }
    tutupModal();
    toast(h.pesan);
    location.hash = '#s/' + baru.id;
  });
}
function ambilIsian(jenis) {
  const g = (id) => { const e = $('#' + id); return e ? e.value : undefined; };
  const o = { perihal: g('cPerihal'), nomorSurat: g('cNomorSurat'), tanggalSurat: g('cTglSurat'), tanggalTerima: g('cTglTerima'),
    tenggat: g('cTenggat'), sifat: g('cSifat'), ringkasan: g('cRingkasan'), kontak: g('cKontak'), alamat: g('cAlamat'), kategori: g('cKategori') };
  if (jenis === 'keluar') o.tujuan = g('cSiapa'); else o.pengirim = g('cSiapa');
  const n = g('cNominal'); if (n !== undefined) o.nominalDiajukan = n.replace(/\D/g, '');
  Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; });
  return o;
}
function pasangTombolCatat(el) { $$('[data-catat]', el).forEach((b) => { b.onclick = () => bukaCatat(b.dataset.catat || (location.hash === '#pengajuan' ? 'bantuan' : location.hash === '#keluar' ? 'keluar' : 'masuk')); }); }

// ------------------------------------------------------------ ekspor
async function ekspor(baris, judul) {
  const data = baris.map((r) => ({
    'Nomor agenda': r.nomor, Jenis: r.jenisLabel, Tanggal: r.tanggalTerima, Perihal: r.perihal,
    'Pengirim/Tujuan': r.jenis === 'keluar' ? r.tujuan : r.pengirim, Kategori: r.kategori, Sifat: SIFAT_LABEL[r.sifat] || '', Status: r.statusLabel,
    'Nominal diajukan': r.nominalDiajukan || '', 'Nominal disetujui': r.nominalDisetujui || '', 'Nominal cair': r.nominalCair || '',
    Tenggat: r.tenggat, Lampiran: r.jumlahLampiran,
  }));
  if (!data.length) return toast('Tidak ada yang diekspor.', true);
  const nama = judul + ' ' + N.hariIni;
  try {
    await muatSkrip('/js/vendor/xlsx.full.min.js');
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(data), judul.slice(0, 30));
    window.XLSX.writeFile(wb, nama + '.xlsx');
  } catch (_) {
    /* Tanpa SheetJS (internet terputus): CSV tetap bisa dibuka Excel. */
    const kol = Object.keys(data[0]);
    const csv = [kol.join(';')].concat(data.map((d) => kol.map((k) => '"' + String(d[k] === undefined ? '' : d[k]).replace(/"/g, '""') + '"').join(';'))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = nama + '.csv'; a.click();
  }
}

// ============================================================ shell
function terapkanTema(gelap) {
  document.documentElement.setAttribute('data-theme', gelap ? 'dark' : 'light');
  try { localStorage.setItem('laz_theme', gelap ? 'dark' : 'light'); } catch (_) {}
}
function toggleSidebar() {
  const app = $('#appView');
  app.classList.toggle('collapsed');
  try { localStorage.setItem('sidebar_collapsed', app.classList.contains('collapsed') ? 'true' : 'false'); } catch (_) {}
}
window.toggleSidebar = toggleSidebar;
function selesaiMemuat() {
  $('#appView').classList.remove('hidden');
  const boot = $('#boot');
  if (boot) { boot.classList.add('lz-pergi'); setTimeout(() => { boot.style.display = 'none'; }, 500); }
}
let jamSibuk = null;
const mulaiSibuk = () => { clearTimeout(jamSibuk); jamSibuk = setTimeout(() => { const e = $('#sibuk'); if (e) e.classList.add('tampil'); }, 260); };
const selesaiSibuk = () => { clearTimeout(jamSibuk); const e = $('#sibuk'); if (e) e.classList.remove('tampil'); };

let RUTE_SEBELUM = '';
async function buka(rute) {
  document.body.removeAttribute('data-halaman-siap');
  let h, judul, aksi = '';
  if (rute.startsWith('s/')) {
    tandaiMenu('');
    h = { gambar: (el) => gambarDetail(el, rute.slice(2)) };
    judul = 'Surat & Pengajuan';
    /* Kembali ke halaman asal (daftar atau papan), bukan selalu ke Beranda. */
    aksi = '<button type="button" class="btn btn-sm" id="srKembali">&larr; Kembali</button>';
  } else {
    const kode = halaman[rute] ? rute : 'dasbor';
    h = halaman[kode];
    tandaiMenu(kode);
    judul = h.judul; aksi = h.aksi ? h.aksi() : '';
  }
  $('#isi').innerHTML = kepala(judul, aksi) + '<div id="isiHalaman"></div>';
  const tt = $('#tombolTema');
  if (tt) tt.onclick = () => { terapkanTema(!temaGelap()); tt.innerHTML = svgTema(temaGelap()); };
  pasangTombolCatat($('#isi'));
  const kb = $('#srKembali');
  if (kb) kb.onclick = () => { if (history.length > 1 && RUTE_SEBELUM) history.back(); else location.hash = '#dasbor'; };
  if (!rute.startsWith('s/')) RUTE_SEBELUM = rute;
  window.scrollTo({ top: 0 });
  mulaiSibuk();
  try { await h.gambar($('#isiHalaman')); }
  catch (e) { $('#isiHalaman').innerHTML = `<div class="card" style="border-color:var(--red);color:var(--red)"><b>Gagal memuat.</b> <span style="color:var(--text2)">${H(e.message)}</span></div>`; }
  finally { selesaiSibuk(); }
  if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
  document.body.setAttribute('data-halaman-siap', rute || 'dasbor');
}

(async function mulai() {
  try { terapkanTema(localStorage.getItem('laz_theme') === 'dark'); } catch (_) {}
  try { if (localStorage.getItem('sidebar_collapsed') === 'true') $('#appView').classList.add('collapsed'); } catch (_) {}
  $('#tombolKembali').onclick = () => { location.href = '/index.html'; };
  $('#chipPengguna').onclick = () => { location.hash = '#dasbor'; };
  $('#modalBg').onclick = (e) => { if (e.target.id === 'modalBg') tutupModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupModal(); });
  let s;
  try { s = await rpc('surat.status'); } catch (e) {
    selesaiMemuat();
    $('#isi').innerHTML = `<div class="card" style="margin:40px auto;max-width:460px;text-align:center"><b>Modul Surat belum bisa dibuka.</b><p class="muted">${H(e.message)}</p><a class="btn" href="/index.html">Kembali ke LAZDigital</a></div>`;
    return;
  }
  Object.assign(N, { pengguna: s.pengguna, izin: s.izin, jenis: s.jenis, alur: s.alur, labelStatus: s.labelStatus, sifat: s.sifat,
    instruksi: s.instruksi, batas: s.batas, drive: s.drive, hariIni: s.hariIni, lembaga: s.lembaga || {} });
  $('#uName').textContent = s.pengguna.nama;
  const peran = N.izin.ubah ? 'Pengelola surat' : N.izin.tambah ? 'Pencatat' : 'Penerima';
  $('#uRole').textContent = peran;
  $('#uAvatar').textContent = (s.pengguna.nama || 'S').trim().charAt(0).toUpperCase();
  document.title = 'Surat & Pengajuan - LAZ Digital';
  gambarMenu();
  window.addEventListener('hashchange', () => buka(location.hash.slice(1) || 'dasbor'));
  try { await buka(location.hash.slice(1) || 'dasbor'); } finally { selesaiMemuat(); }
})();
