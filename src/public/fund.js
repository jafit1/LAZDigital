/* fund.js — modul Fundraising (penghimpunan lapangan) untuk LAZDigital.
 *
 * Berdiri sendiri dari blast.js: keduanya berbagi styles.css dan pola yang
 * sama, tetapi memanggil API yang berbeda (/api/fund) dan tidak boleh saling
 * menyalakan boot masing-masing. Pembantu tampilan sengaja disalin seperlunya
 * ke sini, bukan dibagi lewat berkas ketiga, supaya tiap halaman bisa dibaca
 * utuh tanpa melompat-lompat berkas.
 */
'use strict';

// ============================================================ inti
const $ = (s, induk = document) => induk.querySelector(s);
const $$ = (s, induk = document) => Array.from(induk.querySelectorAll(s));
const H = (t) => String(t === undefined || t === null ? '' : t)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const negara = { pengguna: null, izin: [], lihatSemua: false, akun: null, halaman: 'dasbor' };

function tokenLaz() { try { return localStorage.getItem('laz_token') || ''; } catch (_) { return ''; } }

async function rpc(tindakan, data = {}) {
  const res = await fetch('/api/fund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Laz-Token': tokenLaz() },
    body: JSON.stringify({ tindakan, data, token: tokenLaz() }),
  });
  let hasil;
  try { hasil = await res.json(); } catch (_) { throw new Error('Balasan server tidak dikenali'); }
  if (res.status === 401) { location.href = '/index.html'; throw new Error('Sesi berakhir'); }
  if (!hasil.ok) throw new Error(hasil.pesan || 'Terjadi kesalahan');
  return hasil;
}

const bisa = (izin) => negara.izin.includes(izin);

// ------------------------------------------------------------ format
const fmtAngka = (n) => Number(n || 0).toLocaleString('id-ID');
const rupiah = (n) => 'Rp ' + fmtAngka(Math.round(Number(n) || 0));
function fmtWaktu(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtTanggal(tgl) {
  if (!tgl) return '—';
  const p = String(tgl).split('-');
  if (p.length !== 3) return String(tgl);
  return `${Number(p[2])} ${NAMA_BULAN[Number(p[1]) - 1] || p[1]} ${p[0]}`;
}
function tglHariIni() {
  const d = new Date(Date.now() + 7 * 3600 * 1000); // WIB
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------ toast & modal
function toast(pesan, jenis = 'info') {
  const t = $('#toast');
  t.textContent = pesan;
  t.className = 'toast show' + (jenis === 'galat' ? ' err' : '');
  clearTimeout(toast._jam);
  toast._jam = setTimeout(() => { t.className = 'toast'; }, 2800);
}
function modal(judul, isiHtml, saatBuka, kakiHtml) {
  $('#modalTitle').textContent = judul;
  $('#modalBody').innerHTML = isiHtml;
  $('#modalFoot').innerHTML = kakiHtml || '';
  $('#modalBg').classList.add('show');
  if (saatBuka) saatBuka($('#modalBody'));
  if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
  const fokus = $('#modalBody input, #modalBody textarea, #modalBody select');
  if (fokus) fokus.focus();
}
function tutupModal() {
  $('#modalBg').classList.remove('show');
  $('#modalBody').innerHTML = '';
  $('#modalFoot').innerHTML = '';
}
window.tutupModal = tutupModal;
function konfirmasi(judul, pesan, saatYa, labelYa = 'Ya, lanjutkan') {
  modal(judul, `<p class="muted" style="font-size:13.5px;line-height:1.55">${H(pesan)}</p>`, () => {
    $('#kBatal').onclick = tutupModal;
    $('#kYa').onclick = async () => { tutupModal(); await saatYa(); };
  }, `<button class="btn" id="kBatal" type="button">Batal</button>
      <button class="btn btn-danger" id="kYa" type="button">${H(labelYa)}</button>`);
}

// ------------------------------------------------------------ potongan umum
const kartu = (isi, kelas = '') => `<section class="card ${kelas}">${isi}</section>`;
const rangka = (n = 5) => `<div style="display:grid;gap:8px;padding:4px 0">${Array.from({ length: n }, () =>
  '<div class="rangka" style="height:46px;border-radius:12px"></div>').join('')}</div>`;
function kosong(pesan, ikon = '\u{1F4C2}') {
  return `<div style="text-align:center;padding:40px 20px;color:var(--muted)">
    <div style="font-size:34px;margin-bottom:10px">${ikon}</div>
    <p style="font-size:13.5px;max-width:340px;margin:0 auto;line-height:1.6">${H(pesan)}</p></div>`;
}
const galatKotak = (pesan) => `<div class="card" style="border-color:var(--red);color:var(--red)">
  <strong>Gagal memuat.</strong> <span style="color:var(--text2)">${H(pesan)}</span></div>`;

const IKON_MATAHARI = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2"/><path d="M12 19.3v2.2"/><path d="M4.2 4.2l1.6 1.6"/><path d="M18.2 18.2l1.6 1.6"/><path d="M2.5 12h2.2"/><path d="M19.3 12h2.2"/><path d="M4.2 19.8l1.6-1.6"/><path d="M18.2 5.8l1.6-1.6"/>';
const IKON_BULAN = '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>';
/* Yang digambar adalah tema YANG AKAN DIDAPAT, bukan tema yang sedang berlaku:
   tombol bergambar bulan berarti "klik untuk gelap". Ikon lama — lingkaran
   dengan separuh terisi — tidak mengatakan keduanya, dan warnanya var(--text2)
   di atas latar putih membuatnya nyaris tak terlihat. */
const tombolTema = () => `
  <button class="tn-icon kepala-tema" id="tombolTema" type="button"
          title="${temaGelap() ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}"
          aria-label="${temaGelap() ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
         stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${temaGelap() ? IKON_MATAHARI : IKON_BULAN}</svg>
  </button>`;
/* Ikonnya harus ikut berganti SAAT DITEKAN. Tanpa ini ia baru berubah pada
   penggambaran halaman berikutnya, sehingga tombol yang baru saja dipakai
   masih menggambarkan tema lama — dan terbaca seperti tidak berfungsi. */
function segarTema(b) {
  if (!b) return;
  const gelap = temaGelap();
  b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${gelap ? IKON_MATAHARI : IKON_BULAN}</svg>`;
  b.title = gelap ? 'Ganti ke tema terang' : 'Ganti ke tema gelap';
  b.setAttribute('aria-label', b.title);
}
const kepalaHalaman = (judul, keterangan, aksi = '') =>
  `<div class="page-head"><div><h2>${H(judul)}</h2>${keterangan ? `<div class="desc">${H(keterangan)}</div>` : ''}</div>`
  + `<div class="page-head-aksi">${aksi}${tombolTema()}</div></div>`;

// ------------------------------------------------------------ ikon nav
function ikonNav(isi) {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + isi + '</svg>';
}
const IKON = {
  dasbor: ikonNav('<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>'),
  donatur: ikonNav('<circle cx="9.5" cy="8" r="3.2"/><path d="M3.5 19.5a6 6 0 0 1 12 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 14.4a6 6 0 0 1 3 5.1"/>'),
  himpunan: ikonNav('<path d="M12 3v18"/><path d="M16 7a3 3 0 0 0-3-2h-2a2.5 2.5 0 0 0 0 5h2a2.5 2.5 0 0 1 0 5h-2a3 3 0 0 1-3-2"/>'),
  cocok: ikonNav('<path d="M4 12.5 9 17l11-11"/><path d="M4 18.5 5.5 20"/>'),
  laporan: ikonNav('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13v4"/><path d="M12.5 11v6"/><path d="M16 14v3"/>'),
  akun: ikonNav('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  peta: ikonNav('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/>'),
};

const MENU = [
  { kode: 'dasbor', label: 'Dashboard', izin: 'fund.dasbor' },
  { kode: 'donatur', label: 'Donatur', izin: 'donatur.lihat' },
  { kode: 'himpunan', label: 'Penghimpunan', izin: 'himpunan.lihat' },
  { kode: 'cocok', label: 'Cocokkan', izin: 'cocok.lihat' },
  { kode: 'laporan', label: 'Laporan', izin: 'laporan.lihat' },
  { kode: 'akun', label: 'Pengaturan', izin: 'akun.lihat' },
];
const menuBoleh = (m) => bisa(m.izin);

function gambarMenu() {
  const nav = $('#nav');
  nav.innerHTML = '';
  MENU.filter(menuBoleh).forEach((m) => {
    const b = document.createElement('button');
    b.className = 'tn-item';
    b.id = 'nav_' + m.kode;
    b.type = 'button';
    b.title = m.label;
    b.setAttribute('aria-label', m.label);
    b.innerHTML = `<span class="ic">${IKON[m.kode] || IKON.dasbor}</span><span class="tn-tip">${H(m.label)}</span>`;
    b.onclick = () => { location.hash = '#' + m.kode; };
    nav.appendChild(b);
  });
}
function tandaiMenu(kode) {
  $$('.tn-item').forEach((n) => n.classList.remove('active'));
  const a = $('#nav_' + kode);
  if (a) a.classList.add('active');
}

const PERUNTUKAN = ['Zakat', 'Infak', 'Sedekah', 'Zakat Fitrah', 'Fidyah', 'Wakaf', 'Kemanusiaan'];
const METODE = ['Tunai', 'Transfer', 'QRIS'];

// ============================================================ tandai & hapus
/* Versi ringkas dari pola yang sama di Broadcast: tandai beberapa baris lalu
   hapus, plus "hapus semua" bersaringan dengan kata kunci diketik ulang. */
function tandai(kode, boleh) {
  const dipilih = new Set();
  return {
    kode, boleh, dipilih,
    th: boleh ? '<th class="kol-tandai"><input type="checkbox" id="tandaiSemua" aria-label="Tandai semua"></th>' : '',
    td: (id) => (boleh ? `<td class="kol-tandai"><input type="checkbox" class="tandai" value="${H(id)}" aria-label="Tandai baris"></td>` : ''),
    bilah: boleh ? '<div class="bilah-tandai" id="bilahTandai" hidden><span class="bt-jumlah" id="btJumlah"></span>'
      + '<button type="button" class="btn btn-sm" id="btBatal">Batal</button>'
      + '<button type="button" class="btn btn-sm btn-danger" id="btHapus">Hapus yang ditandai</button></div>' : '',
  };
}
function tombolHapusSemua(jumlah, satuan, tersaring) {
  if (!jumlah || !bisa('donatur.hapus')) return '';
  return `<button type="button" class="btn btn-sm tombol-bahaya" id="hapusSemua">`
    + `Hapus ${tersaring ? '' : 'semua '}${fmtAngka(jumlah)} ${H(satuan)}${tersaring ? ' hasil' : ''}</button>`;
}
function stripTandai(t, tombolSemua) {
  const isi = (tombolSemua || '') + (t && t.bilah ? t.bilah : '');
  return isi ? `<div class="strip-tandai">${isi}</div>` : '';
}
function tanyaHapusSemua({ judul, jumlah, satuan, catatan, rincian, saatYa }) {
  const KUNCI = 'HAPUS SEMUA';
  modal(judul,
    `<p style="font-size:13.5px;line-height:1.55"><b>${fmtAngka(jumlah)} ${H(satuan)}</b> akan dihapus. Tidak ada tombol untuk mengembalikannya.</p>`
    + (catatan ? `<p class="muted" style="font-size:12.5px;line-height:1.5">${H(catatan)}</p>` : '')
    + (rincian && rincian.length ? '<ul class="muted" style="font-size:12px;margin:10px 0 0 18px;line-height:1.7">' + rincian.map((x) => `<li>${x}</li>`).join('') + '</ul>' : '')
    + `<div class="field" style="margin-top:12px"><label>Ketik <b>${KUNCI}</b> untuk menegaskan</label>`
    + `<input id="hsTegaskan" autocomplete="off" spellcheck="false" placeholder="${KUNCI}"></div>`,
    () => {
      const isian = $('#hsTegaskan'); const ya = $('#hsYa');
      const periksa = () => { ya.disabled = isian.value.trim().toUpperCase() !== KUNCI; };
      isian.oninput = periksa;
      isian.onkeydown = (ev) => { if (ev.key === 'Enter' && !ya.disabled) { ev.preventDefault(); ya.click(); } };
      periksa();
      $('#hsBatal').onclick = tutupModal;
      ya.onclick = async () => { const k = isian.value.trim().toUpperCase(); tutupModal(); await saatYa(k); };
    },
    `<button class="btn" id="hsBatal" type="button">Batal</button>`
    + `<button class="btn btn-danger" id="hsYa" type="button" disabled>Hapus ${fmtAngka(jumlah)} ${H(satuan)}</button>`);
}
function pasangTandai(el, t, { satuan, tindakanBanyak, muat, semua }) {
  if (!t.boleh) return;
  const kotak = $$('.tandai', el);
  const semuaKotak = $('#tandaiSemua', el);
  const bilah = $('#bilahTandai', el);
  const segarkan = () => {
    if (!bilah) return;
    const n = t.dipilih.size;
    bilah.hidden = n === 0;
    const label = $('#btJumlah', el);
    if (label) label.textContent = `${fmtAngka(n)} ${satuan} ditandai`;
    if (semuaKotak) {
      semuaKotak.checked = kotak.length > 0 && n === kotak.length;
      semuaKotak.indeterminate = n > 0 && n < kotak.length;
    }
  };
  kotak.forEach((k) => {
    k.checked = t.dipilih.has(k.value);
    k.onchange = () => { if (k.checked) t.dipilih.add(k.value); else t.dipilih.delete(k.value); segarkan(); };
  });
  if (semuaKotak) semuaKotak.onchange = () => {
    kotak.forEach((k) => { k.checked = semuaKotak.checked; if (k.checked) t.dipilih.add(k.value); else t.dipilih.delete(k.value); });
    segarkan();
  };
  const batal = $('#btBatal', el);
  if (batal) batal.onclick = () => { t.dipilih.clear(); kotak.forEach((k) => { k.checked = false; }); segarkan(); };
  const hapus = $('#btHapus', el);
  if (hapus) hapus.onclick = () => {
    const id = Array.from(t.dipilih);
    if (!id.length) return;
    konfirmasi(`Hapus ${fmtAngka(id.length)} ${satuan}?`, 'Yang ditandai akan dihapus dan tidak bisa dikembalikan.', async () => {
      try {
        const h = await rpc(tindakanBanyak, { id });
        t.dipilih.clear();
        toast(h.pesan || `${id.length} ${satuan} dihapus.`, h.gagal && h.gagal.length ? 'galat' : 'info');
        await muat();
      } catch (e) { toast(e.message, 'galat'); }
    }, `Hapus ${fmtAngka(id.length)} ${satuan}`);
  };
  const ths = $('#hapusSemua', el);
  if (ths && semua) ths.onclick = () => tanyaHapusSemua({
    judul: semua.judul || `Hapus semua ${satuan}`, jumlah: semua.jumlah, satuan,
    catatan: semua.catatan, rincian: semua.rincian,
    saatYa: async (tegaskan) => {
      try {
        const h = await rpc(semua.tindakan, { ...(semua.data || {}), tegaskan });
        t.dipilih.clear();
        toast(h.pesan || 'Selesai.');
        await muat();
      } catch (e) { toast(e.message, 'galat'); }
    },
  });
  segarkan();
}

// ============================================================ rute ke lokasi
/* MEMBUKA lokasi memakai Google Maps, bukan OpenStreetMap.
   Ini bukan soal selera peta: yang dibutuhkan petugas di lapangan adalah
   BELOKAN — arah jalan, satu arah, kemacetan, dan nama toko/masjid sebagai
   patokan. Di situ Google Maps jauh di depan, dan tautan seperti ini gratis:
   tidak perlu kunci API, tidak ada tagihan, dan di HP ia langsung membuka
   aplikasi Google Maps yang sudah terpasang.
   (Pemilih lokasi saat MENDAFTARKAN donatur tetap memakai peta terbuka —
   menanam peta Google di dalam halaman butuh kunci API berbayar.) */
function tautanRute(lokasi) {
  if (!lokasi || !Number.isFinite(Number(lokasi.lat))) return '';
  const titik = `${Number(lokasi.lat)},${Number(lokasi.lng)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(titik)}&travelmode=driving`;
}
/* Panah arah, bukan lembaran peta: yang ditawarkan tombol ini adalah "antar
   saya ke sana", bukan "lihat gambar peta". */
const IKON_RUTE = '<path d="M3.4 11.2 20.5 3.5 12.8 20.6l-1.9-6.6z"/>';
function tombolRute(lokasi, { kelas = 'btn btn-sm btn-ghost', label = 'Rute' } = {}) {
  const url = tautanRute(lokasi);
  if (!url) return '';
  return `<a class="${kelas} jw-peta" href="${H(url)}" target="_blank" rel="noopener"
     title="Buka rute ke lokasi ini di Google Maps">
     <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">${IKON_RUTE}</svg>
     <span>${H(label)}</span></a>`;
}

// ============================================================ pemilih lokasi
/* Peta OpenStreetMap + Leaflet. Kalau Leaflet tak termuat (CDN diblokir), jatuh
   ke isian koordinat manual + tombol GPS — lokasi tetap wajib, hanya caranya
   yang lebih polos. Pengembalian: objek dengan .nilai() -> {lat,lng,alamat}. */
function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=id`;
  return fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => r.json()).then((j) => (j && j.display_name) || '').catch(() => '');
}
function cariAlamat(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=id&countrycodes=id`;
  return fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => r.json()).catch(() => []);
}

function pemilihLokasi(el, awal) {
  const state = {
    lat: awal && Number.isFinite(awal.lat) ? Number(awal.lat) : null,
    lng: awal && Number.isFinite(awal.lng) ? Number(awal.lng) : null,
    alamat: (awal && awal.alamat) || '',
  };
  const punyaLeaflet = !!window.L;
  const PUSAT = [state.lat != null ? state.lat : -7.8879, state.lng != null ? state.lng : 110.3288]; // Bantul

  el.innerHTML = `
    <div class="field"><label>Lokasi rumah donatur <span style="color:var(--red)">*</span></label>
      <div class="peta-alat">
        <button type="button" class="btn btn-sm" id="lokSaya">${IKON.peta} Lokasi saya</button>
        <input id="lokCari" class="search" placeholder="Cari tempat, atau tempel koordinat / tautan Google Maps…" style="flex:1;min-width:140px" autocomplete="off">
        <a class="btn btn-sm btn-ghost" id="lokGmaps" href="#" target="_blank" rel="noopener"
           title="Cari tempatnya di Google Maps, lalu salin koordinatnya ke sini">Google Maps</a>
      </div>
      <div id="lokSaran" class="lok-saran" hidden></div>
      ${punyaLeaflet
    ? '<div id="peta" class="peta-kotak" role="application" aria-label="Peta pemilih lokasi"></div>'
    : `<div class="grid-2" style="margin-top:8px">
         <div class="field"><label>Latitude</label><input id="lokLat" inputmode="decimal" value="${state.lat != null ? state.lat : ''}"></div>
         <div class="field"><label>Longitude</label><input id="lokLng" inputmode="decimal" value="${state.lng != null ? state.lng : ''}"></div>
       </div>
       <p class="muted" style="font-size:11.5px">Peta tidak termuat — isi koordinat manual atau tekan "Lokasi saya".</p>`}
      <div class="field" style="margin-top:8px"><label>Alamat (boleh diperbaiki manual)</label>
        <input id="lokAlamat" value="${H(state.alamat)}" placeholder="Alamat terisi otomatis dari titik peta"></div>
      <div class="muted" id="lokKoor" style="font-size:11.5px">${state.lat != null ? `Titik: ${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}` : 'Belum ada titik dipilih.'}</div>
      <div class="muted" style="font-size:11.5px;line-height:1.55;margin-top:4px">
        Tidak ketemu di pencarian? Buka Google Maps, tahan titiknya sampai muncul koordinat,
        salin, lalu tempel ke kotak pencarian di atas.
      </div>
    </div>`;

  const koorEl = $('#lokKoor', el);
  const alamatEl = $('#lokAlamat', el);

  /* Deklarasi fungsi, bukan const panah, dan elemennya dicari di dalam.
     pindah() memanggilnya saat peta baru dipasang — sebelum baris-baris di
     bawah dijalankan. Dengan const, pemanggilan itu jatuh ke temporal dead
     zone dan seluruh pemilih lokasi mati dengan ReferenceError. */
  function segarkanGmaps() {
    const g = $('#lokGmaps', el);
    if (!g) return;
    g.href = state.lat != null
      ? `https://www.google.com/maps/search/?api=1&query=${state.lat},${state.lng}`
      : 'https://www.google.com/maps/search/?api=1&query=Bantul';
  }
  let peta = null; let penanda = null;

  function setKoor() {
    koorEl.textContent = state.lat != null ? `Titik: ${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}` : 'Belum ada titik dipilih.';
    const lat = $('#lokLat', el); const lng = $('#lokLng', el);
    if (lat && document.activeElement !== lat) lat.value = state.lat != null ? state.lat : '';
    if (lng && document.activeElement !== lng) lng.value = state.lng != null ? state.lng : '';
  }
  let jamRev;
  function pindah(lat, lng, isiAlamat = true) {
    state.lat = Number(lat); state.lng = Number(lng);
    setKoor();
    if (peta && penanda) { penanda.setLatLng([lat, lng]); }
    segarkanGmaps();
    if (isiAlamat) {
      clearTimeout(jamRev);
      jamRev = setTimeout(async () => {
        const a = await reverseGeocode(lat, lng);
        /* Alamat otomatis tidak menimpa yang sudah diketik petugas. */
        if (a && !alamatEl.value.trim()) { alamatEl.value = a; state.alamat = a; }
      }, 500);
    }
  }

  if (punyaLeaflet) {
    peta = window.L.map($('#peta', el), { zoomControl: true }).setView(PUSAT, state.lat != null ? 16 : 13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(peta);
    penanda = window.L.marker(PUSAT, { draggable: true }).addTo(peta);
    penanda.on('dragend', () => { const p = penanda.getLatLng(); pindah(p.lat, p.lng); });
    peta.on('click', (e) => pindah(e.latlng.lat, e.latlng.lng));
    /* Peta yang dibangun di dalam modal sering salah ukur karena wadahnya baru
       terlihat sesudahnya — dipaksa hitung ulang sekali begitu tampak. */
    setTimeout(() => peta.invalidateSize(), 120);
  } else {
    const lat = $('#lokLat', el); const lng = $('#lokLng', el);
    const baca = () => { if (lat.value && lng.value) pindah(parseFloat(lat.value), parseFloat(lng.value), false); };
    if (lat) lat.onchange = baca;
    if (lng) lng.onchange = baca;
  }

  alamatEl.oninput = () => { state.alamat = alamatEl.value; };

  $('#lokSaya', el).onclick = () => {
    if (!navigator.geolocation) { toast('Perangkat ini tidak mendukung GPS.', 'galat'); return; }
    const btn = $('#lokSaya', el);
    btn.disabled = true; btn.textContent = 'Mencari…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      if (peta) peta.setView([latitude, longitude], 17);
      pindah(latitude, longitude);
      btn.disabled = false; btn.innerHTML = `${IKON.peta} Lokasi saya`;
    }, (err) => {
      btn.disabled = false; btn.innerHTML = `${IKON.peta} Lokasi saya`;
      toast(err.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi di browser.' : 'Gagal mengambil lokasi. Coba lagi atau geser pin manual.', 'galat');
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  const cari = $('#lokCari', el);
  const saran = $('#lokSaran', el);

  /* Jembatan dari Google Maps ke sini. Nominatim bagus untuk alamat, tetapi
     kalah jauh untuk nama tempat ("Masjid Al Hikmah", warung, sekolah) — dan
     patokan itulah yang dipakai orang di lapangan. Daripada memaksakan
     pencarian yang tidak akan menang, tempat dicari di Google Maps lalu
     TITIKNYA dibawa ke sini. Diterima tiga bentuk sekaligus: "-7.88, 110.33",
     tautan ".../@-7.88,110.33,17z", dan "?q=-7.88,110.33". */
  function koordinatDari(teks) {
    const t = String(teks || '');
    const pola = [
      /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
      /[?&](?:q|query|destination|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
      /^\s*(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/,
    ];
    for (const p of pola) {
      const c = t.match(p);
      if (!c) continue;
      const la = parseFloat(c[1]); const lo = parseFloat(c[2]);
      if (Number.isFinite(la) && Number.isFinite(lo)
        && Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lng: lo };
    }
    return null;
  }

  segarkanGmaps();

  let jamCari;
  cari.oninput = () => {
    clearTimeout(jamCari);
    const q = cari.value.trim();

    const titik = koordinatDari(q);
    if (titik) {
      saran.hidden = true;
      if (peta) peta.setView([titik.lat, titik.lng], 18);
      pindah(titik.lat, titik.lng);
      cari.value = '';
      toast('Titik dari Google Maps dipakai.');
      return;
    }

    if (q.length < 3) { saran.hidden = true; return; }
    jamCari = setTimeout(async () => {
      const hasil = await cariAlamat(q);
      if (!Array.isArray(hasil) || !hasil.length) { saran.hidden = true; return; }
      saran.innerHTML = hasil.map((h) => `<button type="button" class="lok-saran-baris" data-lat="${h.lat}" data-lon="${h.lon}">${H(h.display_name)}</button>`).join('');
      saran.hidden = false;
      $$('.lok-saran-baris', saran).forEach((b) => b.onclick = () => {
        const la = parseFloat(b.dataset.lat); const lo = parseFloat(b.dataset.lon);
        if (peta) peta.setView([la, lo], 17);
        alamatEl.value = b.textContent; state.alamat = b.textContent;
        pindah(la, lo, false);
        saran.hidden = true; cari.value = '';
      });
    }, 550);
  };
  cari.onkeydown = (ev) => { if (ev.key === 'Enter') ev.preventDefault(); };

  return {
    nilai: () => ({ lat: state.lat, lng: state.lng, alamat: (alamatEl.value || '').trim() }),
    hancurkan: () => { try { if (peta) peta.remove(); } catch (_) {} },
  };
}

// ============================================================ HALAMAN
const halaman = {};

// ------------------------------------------------------------ Dashboard
halaman.dasbor = {
  judul: 'Dashboard',
  sub: 'Ringkasan penghimpunan dan jadwal pengambilan hari ini',
  async gambar(el) {
    el.innerHTML = rangka(4);
    let d;
    try { d = await rpc('dasbor.ringkas', { tanggal: tglHariIni() }); }
    catch (e) { el.innerHTML = galatKotak(e.message); return; }

    /* Kartu yang SAMA dengan dasbor LAZDigital — bukan kotak buatan sendiri
       yang kebetulan mirip. Strukturnya (.kpi-v2-top / -label / -icon / -value)
       harus persis, karena itulah yang memberi garis aksen, bayangan, dan
       jarak yang sama; menirunya dengan div polos selalu terlihat sepele
       berdampingan dengan halaman utama. */
    const kpi = (label, nilai, warna, ikon, kecil) => `<div class="kpi-v2 kpi-diam" style="--kpi-accent:${warna}">
      <div class="kpi-v2-top"><div class="kpi-v2-label">${H(label)}</div>
        <div class="kpi-v2-icon" style="background:${warna}">${ikon}</div></div>
      <div class="kpi-v2-value">${nilai}</div>
      ${kecil ? `<div class="kpi-v2-nilai-kecil">${H(kecil)}</div>` : ''}</div>`;

    const jadwal = d.jadwal || [];
    const boleh = bisa('ambil.catat');
    const lencanaStatus = (j) => {
      if (!j.sudahDikunjungi) return '<span class="badge amber">belum diambil</span>';
      const h = j.hasilKunjungan;
      return h.status === 'diambil'
        /* Peruntukan disembunyikan di layar HP: lencana yang terlalu panjang
           memaksa nama donatur patah dua baris dan alamatnya terpotong.
           Angkanya yang penting di sini; peruntukan ada di menu Penghimpunan. */
        ? `<span class="badge green">\u2713 ${rupiah(h.jumlah)}${h.peruntukan ? `<span class="jw-untuk">&nbsp;\u00B7 ${H(h.peruntukan)}</span>` : ''}</span>`
        : '<span class="badge grey">kosong</span>';
    };
    const barisJadwal = jadwal.map((j) => {
      const petaBtnAda = Boolean(tautanRute(j.lokasi));
      const aksi = (j.sudahDikunjungi || !boleh) ? '' : `
        <button class="btn btn-sm btn-primary" data-ambil="${j.id}">Diambil</button>
        <button class="btn btn-sm" data-reschedule="${j.id}" title="Pindah ke hari kerja berikutnya">Reschedule</button>
        <button class="btn btn-sm" data-kosong="${j.id}">Kosong</button>`;
      const petaBtn = petaBtnAda ? tombolRute(j.lokasi) : '';
      /* Donatur yang sudah dikunjungi tidak punya tombol aksi lagi. Kalau baris
         aksinya tetap digambar hanya untuk menampung satu tautan "peta", yang
         muncul adalah satu baris kosong melompong di tiap baris yang sudah
         beres — jadi tautannya naik menemani lencana status. */
      return `<div class="jw-baris${j.sudahDikunjungi ? ' jw-beres' : ''}">
        <div class="jw-kepala">
          <div style="min-width:0">
            <div class="jw-nama">${H(j.nama)}</div>
            <div class="jw-sub">${H(j.telepon)}${j.lokasi && j.lokasi.alamat ? ' \u00B7 ' + H(j.lokasi.alamat) : ''}</div>
          </div>
          <span class="jw-status-hp">${lencanaStatus(j)}${aksi ? '' : petaBtn}</span>
        </div>
        <span class="jw-status-desk">${lencanaStatus(j)}</span>
        ${aksi ? `<div class="jw-aksi">${aksi}${petaBtn}</div>` : '<span class="jw-peta-desk">' + petaBtn + '</span>'}
        </div>`;
    }).join('');

    const ikonKpi = (d2) => `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d2}</svg>`;
    el.innerHTML = `
      <div class="fund-kpi">
        ${kpi('Terkumpul hari ini', rupiah(d.ringkasHari.total), 'var(--accent)',
    ikonKpi('<path d="M12 3v18"/><path d="M16.5 7A3 3 0 0 0 13.5 5h-2a2.5 2.5 0 0 0 0 5h2a2.5 2.5 0 0 1 0 5h-2A3 3 0 0 1 8.5 17"/>'),
    `${fmtAngka(d.ringkasHari.berhasil)} donasi \u00B7 ${fmtAngka(d.ringkasHari.kosong)} kosong`)}
        ${kpi('Terkumpul bulan ini', rupiah(d.ringkasBulan.total), '#ea6a1e',
    ikonKpi('<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>'),
    `${fmtAngka(d.ringkasBulan.berhasil)} donasi bulan ini`)}
        ${kpi('Dijadwalkan hari ini', fmtAngka(jadwal.length), '#3b82f6',
    ikonKpi('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>'),
    `dari ${fmtAngka(d.totalDonatur)} donatur`)}
        ${kpi('Belum dikunjungi', fmtAngka(d.belumDikunjungi), '#d97706',
    ikonKpi('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    d.belumDikunjungi ? 'menunggu diambil' : 'semua sudah beres')}
      </div>
      ${kartu(`
        <h3 style="margin-bottom:4px">Jadwal pengambilan</h3>
        <div class="desc">${H(d.tanggalPanjang)}</div>
        ${jadwal.length ? `<div class="jw-daftar">${barisJadwal}</div>`
        : kosong('Tidak ada donatur yang dijadwalkan diambil hari ini. Atur jadwal di menu Donatur.', '\u{1F5D3}\uFE0F')}
      `)}`;

    $$('[data-ambil]', el).forEach((b) => b.onclick = () => bukaAmbil(jadwal.find((x) => x.id === b.dataset.ambil), el));
    $$('[data-kosong]', el).forEach((b) => b.onclick = () => {
      const j = jadwal.find((x) => x.id === b.dataset.kosong);
      konfirmasi('Tandai kunjungan kosong?', `Kunjungan ke ${j.nama} dicatat tanpa donasi. Berguna untuk laporan "sudah dikunjungi tapi belum berdonasi".`, async () => {
        try { const h = await rpc('ambil.kosong', { donaturId: j.id, tanggal: tglHariIni() }); toast(h.pesan); halaman.dasbor.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, kosong');
    });
    $$('[data-reschedule]', el).forEach((b) => b.onclick = () => {
      const j = jadwal.find((x) => x.id === b.dataset.reschedule);
      konfirmasi('Reschedule ke hari kerja berikutnya?', `Jadwal ${j.nama} dipindah ke hari kerja berikutnya (akhir pekan dilewati). Pola berulang akan menjadi sekali pada hari baru.`, async () => {
        try { const h = await rpc('ambil.reschedule', { donaturId: j.id }); toast(h.pesan); halaman.dasbor.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, pindahkan');
    });
  },
};

function bukaAmbil(j, el) {
  modal(`Catat donasi — ${j.nama}`, `
    <form id="fa">
      <div class="field"><label>Nominal donasi <span style="color:var(--red)">*</span></label>
        <input name="jumlah" inputmode="numeric" required placeholder="mis. 150.000" autocomplete="off">
        <div class="muted" id="faHint" style="font-size:12px;margin-top:4px"></div></div>
      <div class="grid-2">
        <div class="field"><label>Peruntukan <span style="color:var(--red)">*</span></label>
          <select name="peruntukan" required>${PERUNTUKAN.map((p) => `<option>${p}</option>`).join('')}</select></div>
        <div class="field"><label>Metode</label>
          <select name="metode">${METODE.map((m) => `<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Catatan (opsional)</label>
        <textarea name="catatan" rows="2" placeholder="mis. minta dikirimi kwitansi"></textarea></div>
    </form>`, (wadah) => {
    const inp = $('[name=jumlah]', wadah);
    const hint = $('#faHint', wadah);
    inp.oninput = () => {
      const n = Number(String(inp.value).replace(/[^\d]/g, ''));
      hint.textContent = n > 0 ? '= ' + rupiah(n) : '';
    };
    $('#faBatal').onclick = tutupModal;
    $('#fa', wadah).onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const jumlah = Number(String(f.get('jumlah')).replace(/[^\d]/g, ''));
      try {
        const h = await rpc('ambil.catat', { donaturId: j.id, jumlah, peruntukan: f.get('peruntukan'), metode: f.get('metode'), catatan: f.get('catatan'), tanggal: tglHariIni() });
        tutupModal(); toast(h.pesan); halaman.dasbor.gambar(el);
      } catch (e) { toast(e.message, 'galat'); }
    };
  }, `<button type="button" id="faBatal" class="btn">Batal</button>
      <button type="submit" form="fa" class="btn btn-primary">Simpan donasi</button>`);
}

// ------------------------------------------------------------ Donatur
halaman.donatur = {
  judul: 'Donatur',
  sub: 'Basis data donatur dan jadwal pengambilannya',
  saring: { cari: '', grup: '', halaman: 1 },
  async gambar(el) {
    const s = halaman.donatur.saring;
    const bolehUbah = bisa('donatur.ubah');
    const t = tandai('donatur', bisa('donatur.hapus'));
    const tersaring = Boolean(s.cari || s.grup);

    el.innerHTML = `
      <div class="table-wrap">
        <div class="toolbar">
          <input id="cariD" class="search" value="${H(s.cari)}" placeholder="Cari nama, nomor, atau alamat…">
          <span style="width:190px;flex:none"><select id="grupD"></select></span>
          ${bolehUbah ? '<button id="tambahD" class="btn btn-primary">+ Donatur</button>' : ''}
        </div>
        <div id="tabelD">${rangka(6)}</div>
      </div>`;

    let d;
    try { d = await rpc('donatur.daftar', s); } catch (e) { $('#tabelD', el).innerHTML = galatKotak(e.message); return; }

    $('#grupD', el).innerHTML = '<option value="">Semua grup</option>'
      + (d.grup || []).map((g) => `<option value="${H(g.nama)}" ${s.grup === g.nama ? 'selected' : ''}>${H(g.nama)} (${g.jumlah})</option>`).join('');
    $('#grupD', el).onchange = (ev) => { s.grup = ev.target.value; s.halaman = 1; halaman.donatur.gambar(el); };
    let jeda;
    $('#cariD', el).oninput = (ev) => { clearTimeout(jeda); jeda = setTimeout(() => { s.cari = ev.target.value; s.halaman = 1; halaman.donatur.gambar(el); }, 300); };

    const halamanTotal = Math.max(1, Math.ceil(d.total / d.perHalaman));
    $('#tabelD', el).innerHTML = d.baris.length ? stripTandai(t, tombolHapusSemua(d.total, 'donatur', tersaring)) + `
      <table><thead><tr>${t.th}<th>Nama</th><th>Nomor</th><th>Grup</th><th>Jadwal</th><th></th></tr></thead>
      <tbody>${d.baris.map((k) => {
        const j = k.jadwal;
        const jadwalTxt = j ? `${fmtTanggal(j.tanggal)}${j.ulang && j.ulang !== 'sekali' ? ' · ' + j.ulang : ''}` : '<span class="muted">—</span>';
        return `<tr>
          ${t.td(k.id)}
          <td style="font-weight:600">${H(k.nama)}${d.lihatSemua ? '' : ''}</td>
          <td class="muted">${H(k.telepon)}</td>
          <td><div class="row" style="gap:4px;flex-wrap:wrap">${(k.grup || []).map((g) => `<span class="badge blue">${H(g)}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
          <td style="font-size:12px">${jadwalTxt}</td>
          <td class="actions-cell" style="white-space:nowrap;text-align:right">
            ${tombolRute(k.lokasi, { kelas: 'btn btn-ghost btn-sm' })}
            ${bolehUbah ? `<button data-jadwal="${k.id}" class="btn btn-ghost btn-sm">jadwal</button>
            <button data-ubahd="${k.id}" class="btn btn-ghost btn-sm">ubah</button>` : ''}
            ${bisa('donatur.hapus') ? `<button data-hapusd="${k.id}" class="btn btn-ghost btn-sm" style="color:var(--red)">hapus</button>` : ''}
          </td></tr>`;
      }).join('')}</tbody></table>
      <div class="toolbar" style="border-bottom:none;border-top:1px solid var(--border)">
        <p class="muted" style="flex:1;font-size:11.5px">${fmtAngka(d.total)} donatur${d.lihatSemua ? ' (semua fundraiser)' : ''} · halaman ${d.halaman} dari ${halamanTotal}</p>
        <button id="sebelumD" ${d.halaman <= 1 ? 'disabled' : ''} class="btn btn-sm">Sebelumnya</button>
        <button id="sesudahD" ${d.halaman >= halamanTotal ? 'disabled' : ''} class="btn btn-sm">Berikutnya</button>
      </div>` : kosong('Belum ada donatur. Tambahkan donatur pertama dengan tombol "+ Donatur".', '👥');

    const sb = $('#sebelumD', el); if (sb) sb.onclick = () => { s.halaman--; halaman.donatur.gambar(el); };
    const ss = $('#sesudahD', el); if (ss) ss.onclick = () => { s.halaman++; halaman.donatur.gambar(el); };
    const tb = $('#tambahD', el); if (tb) tb.onclick = () => formDonatur(null, el);
    $$('[data-ubahd]', el).forEach((b) => b.onclick = () => formDonatur(d.baris.find((x) => x.id === b.dataset.ubahd), el));
    $$('[data-jadwal]', el).forEach((b) => b.onclick = () => formJadwal(d.baris.find((x) => x.id === b.dataset.jadwal), el));
    $$('[data-hapusd]', el).forEach((b) => b.onclick = () => {
      const k = d.baris.find((x) => x.id === b.dataset.hapusd);
      konfirmasi('Hapus donatur?', `${k.nama} dan jadwalnya dihapus. Catatan penghimpunan yang sudah tercatat tetap ada.`, async () => {
        try { await rpc('donatur.hapus', { id: k.id }); toast('Donatur dihapus.'); halaman.donatur.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, hapus');
    });

    pasangTandai(el, t, {
      satuan: 'donatur', tindakanBanyak: 'donatur.hapusBanyak',
      muat: () => halaman.donatur.gambar(el),
      semua: {
        tindakan: 'donatur.hapusSemua', jumlah: d.total,
        data: { cari: s.cari, grup: s.grup },
        judul: tersaring ? 'Hapus semua hasil ini' : 'Hapus seluruh donatur',
        catatan: d.lihatSemua ? 'Sebagai koordinator, ini menghapus donatur milik SEMUA fundraiser yang cocok.' : 'Hanya donatur milik akun Anda.',
        rincian: ['Catatan penghimpunan yang sudah tercatat <strong>tidak</strong> ikut terhapus.'],
      },
    });
  },
};

function formDonatur(k, el) {
  let pemilih = null;
  modal(k ? 'Ubah donatur' : 'Donatur baru', `
    <form id="fd">
      <div class="grid-2">
        <div class="field"><label>Nama lengkap <span style="color:var(--red)">*</span></label>
          <input name="nama" required value="${k ? H(k.nama) : ''}"></div>
        <div class="field"><label>No HP / WA <span style="color:var(--red)">*</span></label>
          <input name="telepon" required inputmode="tel" value="${k ? H(k.telepon) : ''}" placeholder="08xxxxxxxxxx"></div>
      </div>
      <div id="petaWadah"></div>
      <div class="field"><label>Grup (pisahkan dengan koma)</label>
        <input name="grup" value="${k ? H((k.grup || []).join(', ')) : ''}" placeholder="mis. Rutin, Ramadan"></div>
      <div class="field"><label>Catatan (opsional)</label>
        <textarea name="catatan" rows="2">${k ? H(k.catatan || '') : ''}</textarea></div>
    </form>`, (wadah) => {
    pemilih = pemilihLokasi($('#petaWadah', wadah), k ? k.lokasi : null);
    $('#fdBatal').onclick = () => { if (pemilih) pemilih.hancurkan(); tutupModal(); };
    $('#fd', wadah).onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const lok = pemilih.nilai();
      if (lok.lat == null || lok.lng == null) { toast('Tandai lokasi dulu — tekan "Lokasi saya" atau geser pin.', 'galat'); return; }
      const data = {
        nama: f.get('nama'), telepon: f.get('telepon'),
        grup: f.get('grup'), catatan: f.get('catatan'),
        lokasi: { lat: lok.lat, lng: lok.lng, alamat: lok.alamat },
      };
      if (k) data.id = k.id;
      try {
        await rpc('donatur.simpan', data);
        if (pemilih) pemilih.hancurkan();
        tutupModal(); toast(k ? 'Donatur diperbarui.' : 'Donatur ditambahkan.'); halaman.donatur.gambar(el);
      } catch (e) { toast(e.message, 'galat'); }
    };
  }, `<button type="button" id="fdBatal" class="btn">Batal</button>
      <button type="submit" form="fd" class="btn btn-primary">Simpan donatur</button>`);
}

function formJadwal(k, el) {
  const j = k.jadwal || {};
  modal(`Jadwal pengambilan — ${k.nama}`, `
    <form id="fj">
      <div class="grid-2">
        <div class="field"><label>Tanggal</label>
          <input type="date" name="tanggal" value="${j.tanggal || tglHariIni()}"></div>
        <div class="field"><label>Ulang</label>
          <select name="ulang">
            <option value="sekali" ${j.ulang === 'sekali' || !j.ulang ? 'selected' : ''}>Sekali</option>
            <option value="mingguan" ${j.ulang === 'mingguan' ? 'selected' : ''}>Mingguan (hari sama)</option>
            <option value="bulanan" ${j.ulang === 'bulanan' ? 'selected' : ''}>Bulanan (tanggal sama)</option>
          </select></div>
      </div>
      <div class="field"><label>Catatan jadwal (opsional)</label>
        <input name="catatan" value="${H(j.catatan || '')}" placeholder="mis. sore selepas ashar"></div>
      <p class="muted" style="font-size:11.5px">Kosongkan tanggal lalu simpan untuk menghapus jadwal.</p>
    </form>`, (wadah) => {
    $('#fjBatal').onclick = tutupModal;
    $('#fjHapus').onclick = async () => {
      try { await rpc('donatur.jadwal', { id: k.id, jadwal: null }); tutupModal(); toast('Jadwal dihapus.'); halaman.donatur.gambar(el); }
      catch (e) { toast(e.message, 'galat'); }
    };
    $('#fj', wadah).onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const tanggal = f.get('tanggal');
      const jadwal = tanggal ? { tanggal, ulang: f.get('ulang'), catatan: f.get('catatan') } : null;
      try { await rpc('donatur.jadwal', { id: k.id, jadwal }); tutupModal(); toast('Jadwal disimpan.'); halaman.donatur.gambar(el); }
      catch (e) { toast(e.message, 'galat'); }
    };
  }, `<button type="button" id="fjHapus" class="btn" style="color:var(--red)">Hapus jadwal</button>
      <button type="button" id="fjBatal" class="btn">Batal</button>
      <button type="submit" form="fj" class="btn btn-primary">Simpan</button>`);
}

// ------------------------------------------------------------ Penghimpunan
halaman.himpunan = {
  judul: 'Penghimpunan',
  sub: 'Catatan tiap donasi yang diambil di lapangan',
  saring: { dari: '', sampai: '', status: '', cari: '', halaman: 1 },
  async gambar(el) {
    const s = halaman.himpunan.saring;
    el.innerHTML = `
      <div class="table-wrap">
        <div class="toolbar fund-alat" style="flex-wrap:wrap;gap:8px">
          <input id="cariH" class="search" value="${H(s.cari)}" placeholder="Cari donatur / peruntukan…" style="flex:1;min-width:160px">
          <input type="date" id="dariH" class="search" value="${H(s.dari)}" style="width:auto" title="Dari tanggal">
          <input type="date" id="sampaiH" class="search" value="${H(s.sampai)}" style="width:auto" title="Sampai tanggal">
          <span style="width:150px;flex:none"><select id="statusH">
            <option value="">Semua status</option>
            <option value="diambil" ${s.status === 'diambil' ? 'selected' : ''}>Berisi</option>
            <option value="kosong" ${s.status === 'kosong' ? 'selected' : ''}>Kosong</option>
          </select></span>
        </div>
        <div id="tabelH">${rangka(6)}</div>
      </div>`;

    let d;
    try { d = await rpc('himpunan.daftar', s); } catch (e) { $('#tabelH', el).innerHTML = galatKotak(e.message); return; }

    $('#statusH', el).onchange = (ev) => { s.status = ev.target.value; s.halaman = 1; halaman.himpunan.gambar(el); };
    $('#dariH', el).onchange = (ev) => { s.dari = ev.target.value; s.halaman = 1; halaman.himpunan.gambar(el); };
    $('#sampaiH', el).onchange = (ev) => { s.sampai = ev.target.value; s.halaman = 1; halaman.himpunan.gambar(el); };
    let jeda;
    $('#cariH', el).oninput = (ev) => { clearTimeout(jeda); jeda = setTimeout(() => { s.cari = ev.target.value; s.halaman = 1; halaman.himpunan.gambar(el); }, 300); };

    const halamanTotal = Math.max(1, Math.ceil(d.total / d.perHalaman));
    const bolehHapus = bisa('himpunan.hapus');
    $('#tabelH', el).innerHTML = `
      <div class="strip-tandai" style="justify-content:flex-start;gap:16px">
        <span class="bt-jumlah">${fmtAngka(d.ringkas.berhasil)} berisi · ${fmtAngka(d.ringkas.kosong)} kosong</span>
        <span style="font-weight:800;color:var(--accent-d)">${rupiah(d.ringkas.total)}</span>
      </div>` + (d.baris.length ? `
      <table><thead><tr><th>Donatur</th><th>Peruntukan</th><th style="text-align:right">Nominal</th><th>Tanggal</th><th>Cocok</th>${bolehHapus ? '<th></th>' : ''}</tr></thead>
      <tbody>${d.baris.map((r) => `<tr>
        <td><div style="font-weight:600">${H(r.donaturNama)}</div>
          <div class="muted" style="font-size:11px">${H(r.olehNama || '')}${r.fundraising ? ' · ' + H(r.fundraising) : ''}</div></td>
        <td>${r.status === 'kosong' ? '<span class="badge grey">kosong</span>' : H(r.peruntukan)}</td>
        <td style="text-align:right;font-weight:600">${r.status === 'kosong' ? '—' : rupiah(r.jumlah)}</td>
        <td class="muted" style="font-size:12px">${fmtTanggal(r.tanggal)}</td>
        <td>${r.cocok && r.cocok.sudah ? `<span class="badge green" title="Ref ${H(r.cocok.ref)}">✓ ${H(r.cocok.ref || 'cocok')}</span>` : '<span class="muted">—</span>'}</td>
        ${bolehHapus ? `<td class="actions-cell" style="text-align:right"><button data-hapush="${r.id}" class="btn btn-ghost btn-sm" style="color:var(--red)">hapus</button></td>` : ''}
      </tr>`).join('')}</tbody></table>
      <div class="toolbar" style="border-bottom:none;border-top:1px solid var(--border)">
        <p class="muted" style="flex:1;font-size:11.5px">${fmtAngka(d.total)} catatan · halaman ${d.halaman} dari ${halamanTotal}</p>
        <button id="sebelumH" ${d.halaman <= 1 ? 'disabled' : ''} class="btn btn-sm">Sebelumnya</button>
        <button id="sesudahH" ${d.halaman >= halamanTotal ? 'disabled' : ''} class="btn btn-sm">Berikutnya</button>
      </div>` : kosong('Belum ada catatan penghimpunan pada rentang ini.', '📄'));

    const sb = $('#sebelumH', el); if (sb) sb.onclick = () => { s.halaman--; halaman.himpunan.gambar(el); };
    const ss = $('#sesudahH', el); if (ss) ss.onclick = () => { s.halaman++; halaman.himpunan.gambar(el); };
    $$('[data-hapush]', el).forEach((b) => b.onclick = () => {
      const r = d.baris.find((x) => x.id === b.dataset.hapush);
      konfirmasi('Hapus catatan ini?', `Catatan donasi ${r.donaturNama} (${r.status === 'kosong' ? 'kosong' : rupiah(r.jumlah)}) dihapus. Buku utama tidak ikut berubah.`, async () => {
        try { await rpc('himpunan.hapus', { id: r.id }); toast('Catatan dihapus.'); halaman.himpunan.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, hapus');
    });
  },
};

// ------------------------------------------------------------ Cocokkan
halaman.cocok = {
  judul: 'Cocokkan',
  sub: 'Pertemukan catatan fundraising dengan buku penghimpunan utama',
  saring: { dari: '', sampai: '' },
  async gambar(el) {
    const s = halaman.cocok.saring;
    el.innerHTML = rangka(5);
    let d;
    try { d = await rpc('cocok.daftar', s); } catch (e) { el.innerHTML = galatKotak(e.message); return; }

    const r = d.ringkas;
    const selisihWarna = r.selisih === 0 ? 'var(--green,#059669)' : 'var(--red)';
    el.innerHTML = `
      <div class="toolbar fund-alat" style="gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <input type="date" id="dariC" class="search" value="${H(s.dari)}" style="width:auto" title="Dari tanggal">
        <input type="date" id="sampaiC" class="search" value="${H(s.sampai)}" style="width:auto" title="Sampai tanggal">
        <span class="muted" style="font-size:12px">Nama fundraising: <strong>${H(d.namaFundraising || '—')}</strong></span>
      </div>
      ${d.galatMain ? `<div class="card" style="border-color:var(--amber,#d97706)"><strong>Buku utama tidak terbaca:</strong> <span class="muted">${H(d.galatMain)}. Sisi fundraising di bawah tetap berguna.</span></div>` : ''}
      <div class="fund-kpi">
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Total sisi fundraising</div><div style="font-size:20px;font-weight:800">${rupiah(r.totalFund)}</div><div class="muted" style="font-size:11px">${fmtAngka(r.jumlahFund)} catatan</div></div>
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Total di buku utama</div><div style="font-size:20px;font-weight:800">${rupiah(r.totalMain)}</div><div class="muted" style="font-size:11px">${fmtAngka(r.jumlahMain)} baris</div></div>
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Selisih</div><div style="font-size:20px;font-weight:800;color:${selisihWarna}">${rupiah(Math.abs(r.selisih))}</div></div>
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Sudah dicocokkan</div><div style="font-size:20px;font-weight:800">${fmtAngka(r.sudahCocok)}<span class="muted" style="font-size:13px">/${fmtAngka(r.jumlahFund)}</span></div></div>
      </div>
      ${kartu(`
        <h3>Catatan fundraising</h3>
        <div class="desc">Tandai baris yang sudah masuk buku kas resmi. Usulan padanan dari buku utama muncul otomatis, tapi penandaan tetap manual.</div>
        ${d.fund.length ? `<div class="table-wrap"><table><thead><tr><th>Donatur</th><th>Peruntukan</th><th style="text-align:right">Nominal</th><th>Tanggal</th><th>Status</th><th></th></tr></thead>
        <tbody>${d.fund.map((f) => `<tr>
          <td style="font-weight:600">${H(f.donaturNama)}</td>
          <td>${H(f.peruntukan)}</td>
          <td style="text-align:right;font-weight:600">${rupiah(f.jumlah)}</td>
          <td class="muted" style="font-size:12px">${fmtTanggal(f.tanggal)}</td>
          <td>${f.cocok.sudah
      ? `<span class="badge green">✓ ${H(f.cocok.ref || 'cocok')}</span>`
      : (f.usul ? `<span class="badge amber" title="Usulan padanan">usul: ${H(f.usul.noKwitansi || f.usul.id)}</span>` : '<span class="badge grey">belum</span>')}</td>
          <td class="actions-cell" style="text-align:right;white-space:nowrap">
            ${f.cocok.sudah
      ? `<button data-batal="${f.id}" class="btn btn-ghost btn-sm">batal</button>`
      : `<button data-tandai="${f.id}" data-ref="${H(f.usul ? (f.usul.noKwitansi || '') : '')}" class="btn btn-sm btn-primary">tandai cocok</button>`}
          </td></tr>`).join('')}</tbody></table></div>` : kosong('Belum ada catatan berisi pada rentang ini.', '🧾')}
      `)}`;

    $('#dariC', el).onchange = (ev) => { s.dari = ev.target.value; halaman.cocok.gambar(el); };
    $('#sampaiC', el).onchange = (ev) => { s.sampai = ev.target.value; halaman.cocok.gambar(el); };
    $$('[data-tandai]', el).forEach((b) => b.onclick = () => {
      const f = d.fund.find((x) => x.id === b.dataset.tandai);
      modal('Tandai sudah masuk buku utama', `
        <p class="muted" style="font-size:13px">Donasi <strong>${H(f.donaturNama)}</strong> — ${rupiah(f.jumlah)}.</p>
        <div class="field" style="margin-top:10px"><label>No. kwitansi / referensi buku utama</label>
          <input id="cRef" value="${H(b.dataset.ref)}" placeholder="mis. KW-001"></div>`, () => {
        $('#cBatal').onclick = tutupModal;
        $('#cSimpan').onclick = async () => {
          try { await rpc('cocok.tandai', { id: f.id, ref: $('#cRef').value }); tutupModal(); toast('Ditandai cocok.'); halaman.cocok.gambar(el); }
          catch (e) { toast(e.message, 'galat'); }
        };
      }, `<button class="btn" id="cBatal" type="button">Batal</button>
          <button class="btn btn-primary" id="cSimpan" type="button">Tandai cocok</button>`);
    });
    $$('[data-batal]', el).forEach((b) => b.onclick = async () => {
      try { await rpc('cocok.batal', { id: b.dataset.batal }); toast('Penandaan dibatalkan.'); halaman.cocok.gambar(el); }
      catch (e) { toast(e.message, 'galat'); }
    });
  },
};

// ------------------------------------------------------------ Laporan
halaman.laporan = {
  judul: 'Laporan',
  sub: 'Rekap penghimpunan lapangan',
  saring: { dari: '', sampai: '' },
  async gambar(el) {
    const s = halaman.laporan.saring;
    el.innerHTML = rangka(5);
    let d;
    try { d = await rpc('laporan.ringkas', s); } catch (e) { el.innerHTML = galatKotak(e.message); return; }

    const tabelRingkas = (judul, arr, kolom) => kartu(`
      <h3>${H(judul)}</h3>
      ${arr.length ? `<div class="table-wrap"><table><thead><tr><th>${H(kolom)}</th><th style="text-align:right">Jumlah</th></tr></thead>
      <tbody>${arr.map((x) => `<tr><td>${H(x.nama || x.tanggal)}</td><td style="text-align:right;font-weight:600">${rupiah(x.jumlah)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">Belum ada data.</p>'}`);

    el.innerHTML = `
      <div class="toolbar fund-alat" style="gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <input type="date" id="dariL" class="search" value="${H(s.dari)}" style="width:auto" title="Dari tanggal">
        <input type="date" id="sampaiL" class="search" value="${H(s.sampai)}" style="width:auto" title="Sampai tanggal">
        <button id="cetakL" class="btn btn-sm">Cetak / PDF</button>
      </div>
      <div class="fund-kpi">
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Total terkumpul</div><div style="font-size:22px;font-weight:800;color:var(--accent-d)">${rupiah(d.ringkas.total)}</div></div>
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Kunjungan</div><div style="font-size:22px;font-weight:800">${fmtAngka(d.ringkas.kunjungan)}</div></div>
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Berisi</div><div style="font-size:22px;font-weight:800">${fmtAngka(d.ringkas.berhasil)}</div></div>
        <div class="kpi-v2 kpi-diam"><div class="muted" style="font-size:12px">Kosong</div><div style="font-size:22px;font-weight:800">${fmtAngka(d.ringkas.kosong)}</div></div>
      </div>
      <div class="grid-2">
        ${tabelRingkas('Per peruntukan', d.perPeruntukan, 'Peruntukan')}
        ${tabelRingkas('Per hari', d.perHari, 'Tanggal')}
      </div>
      <div class="grid-2">
        ${tabelRingkas(negara.lihatSemua ? 'Per fundraiser' : 'Per nama fundraising', d.perFundraiser, 'Fundraising')}
        ${tabelRingkas('Per petugas', d.perPetugas, 'Petugas')}
      </div>`;

    $('#dariL', el).onchange = (ev) => { s.dari = ev.target.value; halaman.laporan.gambar(el); };
    $('#sampaiL', el).onchange = (ev) => { s.sampai = ev.target.value; halaman.laporan.gambar(el); };
    $('#cetakL', el).onclick = () => window.print();
  },
};

// ------------------------------------------------------------ Pengaturan / Akun
halaman.akun = {
  judul: 'Pengaturan Akun',
  sub: 'Profil fundraiser dan nama fundraising untuk pencocokan',
  async gambar(el) {
    el.innerHTML = rangka(4);
    let d;
    try { d = await rpc('akun.ambil'); } catch (e) { el.innerHTML = galatKotak(e.message); return; }
    const a = d.akun;
    const bolehUbah = bisa('akun.ubah');

    el.innerHTML = kartu(`
      <form id="fak">
        <div class="row" style="gap:16px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <div id="fotoPratinjau" class="avatar" style="width:72px;height:72px;font-size:28px;background-size:cover;background-position:center">${a.foto ? '' : H((a.namaTampil || 'F').charAt(0).toUpperCase())}</div>
          <div style="flex:1;min-width:180px">
            <input type="file" id="fotoInput" accept="image/*" ${bolehUbah ? '' : 'disabled'} style="font-size:12px">
            <div class="muted" style="font-size:11.5px;margin-top:4px">Foto diperkecil otomatis. Kosongkan untuk memakai inisial.</div>
            ${a.foto ? '<button type="button" id="fotoHapus" class="btn btn-ghost btn-sm" style="color:var(--red);margin-top:6px">Hapus foto</button>' : ''}
          </div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Nama tampil</label><input name="namaTampil" value="${H(a.namaTampil)}" ${bolehUbah ? '' : 'disabled'}></div>
          <div class="field"><label>No HP / WA</label><input name="telepon" value="${H(a.telepon)}" ${bolehUbah ? '' : 'disabled'}></div>
        </div>
        <div class="field"><label>Nama fundraising <span class="muted" style="font-weight:400">— kunci pencocokan dengan buku utama</span></label>
          <input name="namaFundraising" value="${H(a.namaFundraising)}" ${bolehUbah ? '' : 'disabled'} placeholder="mis. Tim Bantul Kota">
          <div class="muted" style="font-size:11.5px;margin-top:4px">Harus sama persis dengan nama pada kolom "fundraising" di penghimpunan utama LAZDigital, agar halaman Cocokkan bisa mempertemukannya.</div></div>
        <div class="field"><label>Catatan</label><textarea name="catatan" rows="2" ${bolehUbah ? '' : 'disabled'}>${H(a.catatan || '')}</textarea></div>
      </form>`);

    const pratinjau = $('#fotoPratinjau', el);
    if (a.foto) pratinjau.style.backgroundImage = `url("${a.foto}")`;
    let fotoBaru; // undefined = tak berubah; '' = hapus; dataURL = ganti

    $('#fotoInput', el).onchange = (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      kecilkanGambar(file, 320, 0.8).then((durl) => {
        fotoBaru = durl;
        pratinjau.style.backgroundImage = `url("${durl}")`;
        pratinjau.textContent = '';
      }).catch(() => toast('Gagal membaca gambar.', 'galat'));
    };
    const fh = $('#fotoHapus', el);
    if (fh) fh.onclick = () => { fotoBaru = ''; pratinjau.style.backgroundImage = ''; pratinjau.textContent = H((a.namaTampil || 'F').charAt(0).toUpperCase()); toast('Foto akan dihapus saat disimpan.'); };

    if (bolehUbah) {
      const wrap = document.createElement('div');
      wrap.style.marginTop = '4px';
      wrap.innerHTML = '<button type="button" id="simpanAk" class="btn btn-primary">Simpan profil</button>';
      el.querySelector('.card').appendChild(wrap);
      $('#simpanAk', el).onclick = async () => {
        const f = new FormData($('#fak', el));
        const data = { namaTampil: f.get('namaTampil'), telepon: f.get('telepon'), namaFundraising: f.get('namaFundraising'), catatan: f.get('catatan') };
        if (fotoBaru !== undefined) data.foto = fotoBaru;
        try {
          const h = await rpc('akun.simpan', data);
          negara.akun = h.akun;
          toast(h.pesan || 'Tersimpan.');
          halaman.akun.gambar(el);
        } catch (e) { toast(e.message, 'galat'); }
      };
    }
  },
};

/* Foto diperkecil di sisi tampilan sebelum dikirim: Redis bukan tempat foto 3 MB,
   dan menaikkannya apa adanya membuat tiap muat halaman menyeret satu foto besar. */
function kecilkanGambar(file, maks, mutu) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const skala = Math.min(1, maks / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', mutu));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// ============================================================ shell
function terapkanTema(gelap) {
  document.documentElement.setAttribute('data-theme', gelap ? 'dark' : 'light');
  try { localStorage.setItem('laz_theme', gelap ? 'dark' : 'light'); } catch (_) {}
}
function temaGelap() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

function toggleSidebar() {
  const app = $('#appView');
  app.classList.toggle('collapsed');
  try { localStorage.setItem('sidebar_collapsed', app.classList.contains('collapsed') ? 'true' : 'false'); } catch (_) {}
}
window.toggleSidebar = toggleSidebar;

function selesaiMemuat() {
  const boot = $('#boot');
  $('#appView').classList.remove('hidden');
  if (!boot) return;
  boot.classList.add('lz-pergi');
  setTimeout(() => { boot.style.display = 'none'; }, 500);
}
const JEDA_SIBUK_MS = 260;
let jamSibuk = null;
function mulaiSibuk() { clearTimeout(jamSibuk); jamSibuk = setTimeout(() => { const el = $('#sibuk'); if (el) el.classList.add('tampil'); }, JEDA_SIBUK_MS); }
function selesaiSibuk() { clearTimeout(jamSibuk); const el = $('#sibuk'); if (el) el.classList.remove('tampil'); }

async function buka(kode) {
  const h = halaman[kode] || halaman.dasbor;
  negara.halaman = halaman[kode] ? kode : 'dasbor';
  tandaiMenu(negara.halaman);
  window.scrollTo({ top: 0 });
  $('#isi').innerHTML = kepalaHalaman(h.judul, h.sub) + '<div id="isiHalaman"></div>';
  const tt = $('#tombolTema');
  if (tt) tt.onclick = () => { terapkanTema(!temaGelap()); segarTema(tt); };
  mulaiSibuk();
  try { await h.gambar($('#isiHalaman')); }
  finally { selesaiSibuk(); }
  if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
}

(async function mulai() {
  try { terapkanTema(localStorage.getItem('laz_theme') === 'dark'); } catch (_) {}
  try { if (localStorage.getItem('sidebar_collapsed') === 'true') $('#appView').classList.add('collapsed'); } catch (_) {}

  $('#tombolKembali').onclick = () => { location.href = '/index.html'; };
  $('#chipPengguna').onclick = () => { location.hash = '#akun'; };
  document.addEventListener('visibilitychange', () => {
    $$('.lz').forEach((el) => el.classList.toggle('lz-jeda', document.hidden));
  });
  $('#modalBg').onclick = (e) => { if (e.target.id === 'modalBg') tutupModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupModal(); });

  let s;
  try { s = await rpc('fund.status'); } catch (_) { location.href = '/index.html'; return; }
  negara.pengguna = s.pengguna;
  negara.izin = s.izin || [];
  negara.lihatSemua = !!s.lihatSemua;
  negara.akun = s.akun;

  const nama = (s.akun && s.akun.namaTampil) || s.pengguna.nama;
  $('#uName').textContent = nama;
  $('#uRole').textContent = s.pengguna.peran + (s.lihatSemua ? ' · semua data' : '');
  const av = $('#uAvatar');
  if (s.akun && s.akun.foto) { av.style.backgroundImage = `url("${s.akun.foto}")`; av.style.backgroundSize = 'cover'; av.textContent = ''; }
  else av.textContent = (nama || 'F').trim().charAt(0).toUpperCase();
  /* Lencana cakupan data. Dulu sebuah .badge polos di dalam .tn-right yang
     lebarnya meregang penuh: teksnya menempel di kiri, tingginya cuma beberapa
     piksel, dan saat bilah menu dikuncupkan jadi 78 px ia terpotong di tengah
     kata. Sekarang ia baris berikon — ikonnya tetap terlihat saat dikuncupkan,
     labelnya yang menyingkir, sama seperti butir menu lainnya. */
  const ll = $('#lencanaLingkup');
  if (ll) {
    const semua = !!s.lihatSemua;
    const label = (semua ? 'Semua fundraiser' : 'Data Anda')
      + (s.upstash ? '' : ' · penyimpanan lokal');
    const ikon = semua
      ? '<circle cx="9" cy="8" r="3"/><path d="M3.5 18.5a5.5 5.5 0 0 1 11 0"/><path d="M16 5.4a3 3 0 0 1 0 5.2"/><path d="M17.5 13.6a5.5 5.5 0 0 1 3 4.9"/>'
      : '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/>';
    ll.className = 'lingkup' + (semua ? ' lingkup-luas' : '');
    ll.title = semua
      ? 'Koordinator — melihat data seluruh fundraiser'
      : 'Hanya donatur dan catatan milik akun Anda';
    if (!s.upstash) ll.title += ' · data tersimpan di berkas lokal, bukan Upstash';
    ll.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ikon}</svg>`
      + `<span class="lingkup-teks">${H(label)}</span>`;
  }

  document.title = 'Fundraising — LAZ Digital';
  gambarMenu();
  window.addEventListener('hashchange', () => buka(location.hash.slice(1) || 'dasbor'));

  try { await buka(location.hash.slice(1) || 'dasbor'); }
  catch (e) { $('#isi').innerHTML = kepalaHalaman('Fundraising', '') + galatKotak(e.message || 'Halaman gagal dimuat'); }
  finally { selesaiMemuat(); }
})();
