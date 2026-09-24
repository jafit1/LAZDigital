/* ai.js — modul AI Asisten untuk LAZDigital.
 *
 * Berdiri sendiri seperti blast.js dan fund.js: berbagi styles.css dan pola
 * yang sama, tetapi memanggil API-nya sendiri (/api/ai dan /api/ai-stream).
 *
 * DUA HAL YANG MEMBEDAKAN HALAMAN INI DARI HALAMAN LAIN:
 * 1. Percakapan DIPAKAI BERSAMA. Tidak ada "percakapan saya" — semua akun yang
 *    diberi akses modul ini melihat, membuka, dan melanjutkan percakapan yang
 *    sama. Karena itu tiap pesan memperlihatkan siapa penulisnya.
 * 2. Jawaban datang mengalir (SSE), bukan sekali jadi. Jadi di sini ada satu
 *    jalur khusus yang tidak memakai rpc(): lihat kirimPesan().
 */
'use strict';

// ============================================================ inti
const $ = (s, induk = document) => induk.querySelector(s);
const $$ = (s, induk = document) => Array.from(induk.querySelectorAll(s));
const H = (t) => String(t === undefined || t === null ? '' : t)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const negara = {
  pengguna: null, izin: [], superadmin: false, halaman: 'chat',
  persona: [], penyediaAktif: null, adaPenyedia: false, pengetahuan: null,
  daftarModel: [], pilihan: { penyediaId: '', model: '' },
  aturLampiran: { simpanHari: 30, maksPerPesan: 4, gambarBoleh: [] },
  lampiran: [],               // berkas yang sudah dibaca, menunggu dikirim
  sesiId: '', sesi: null, daftarSesi: [],
  personaId: '', mengalir: false, kontrol: null, railBuka: false,
};

function tokenLaz() { try { return localStorage.getItem('laz_token') || ''; } catch (_) { return ''; } }

async function rpc(tindakan, data = {}) {
  const res = await fetch('/api/ai', {
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
function fmtWaktu(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const kini = Date.now();
  const selisih = (kini - d.getTime()) / 1000;
  if (selisih < 60) return 'baru saja';
  if (selisih < 3600) return `${Math.floor(selisih / 60)} menit lalu`;
  if (selisih < 86400) return `${Math.floor(selisih / 3600)} jam lalu`;
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const inisial = (n) => String(n || '?').trim().charAt(0).toUpperCase() || '?';

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
const rangka = (n = 5) => `<div style="display:grid;gap:8px;padding:4px 0">${Array.from({ length: n }, () =>
  '<div class="rangka" style="height:46px;border-radius:12px"></div>').join('')}</div>`;
function kosong(pesan, ikon = '✨') {
  return `<div style="text-align:center;padding:40px 20px;color:var(--muted)">
    <div style="font-size:34px;margin-bottom:10px">${ikon}</div>
    <p style="font-size:13.5px;max-width:360px;margin:0 auto;line-height:1.6">${H(pesan)}</p></div>`;
}
const galatKotak = (pesan) => `<div class="card" style="border-color:var(--red);color:var(--red)">
  <strong>Gagal memuat.</strong> <span style="color:var(--text2)">${H(pesan)}</span></div>`;

/* Bentuk ikon ditulis UTUH di sini, lengkap dengan fill dan stroke-nya
   sendiri — tidak mewarisi apa pun dari luar kecuali warnanya. Ikon lama
   digambar dengan garis setebal 1,8 px dan mengandalkan currentColor; di
   beberapa peramban dan tingkat perbesaran hasilnya tombol putih kosong
   tanpa gambar apa pun, dan tidak ada yang tahu itu tombol apa. Sekarang
   bentuknya PADAT, jadi kalaupun garisnya tidak tergambar, bulatannya tetap
   terlihat. */
function svgTema(gelap) {
  var isi = gelap
    ? '<circle cx="12" cy="12" r="4.6" fill="currentColor"/>'
      + '<g stroke="currentColor" stroke-width="2.1" stroke-linecap="round">'
      + '<path d="M12 2.4v2.3"/><path d="M12 19.3v2.3"/><path d="M4.2 4.2l1.7 1.7"/>'
      + '<path d="M18.1 18.1l1.7 1.7"/><path d="M2.4 12h2.3"/><path d="M19.3 12h2.3"/>'
      + '<path d="M4.2 19.8l1.7-1.7"/><path d="M18.1 5.9l1.7-1.7"/></g>'
    : '<path fill="currentColor" d="M20.4 14.9A8.6 8.6 0 0 1 9.1 3.6 8.7 8.7 0 1 0 20.4 14.9z"/>';
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">' + isi + '</svg>';
}
var judulTema = function (gelap) { return gelap ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'; };

const tombolTema = () => `
  <button class="tn-icon kepala-tema" id="tombolTema" type="button"
          title="${judulTema(temaGelap())}" aria-label="${judulTema(temaGelap())}">${svgTema(temaGelap())}</button>`;

/* Ikonnya harus ikut berganti SAAT DITEKAN. Tanpa ini ia baru berubah pada
   penggambaran halaman berikutnya, sehingga tombol yang baru saja dipakai
   masih menggambarkan tema lama — dan terbaca seperti tidak berfungsi. */
function segarTema(b) {
  if (!b) return;
  var gelap = temaGelap();
  b.innerHTML = svgTema(gelap);
  b.title = judulTema(gelap);
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
  chat: ikonNav('<path d="M20.5 12a8.5 8.5 0 0 1-12.2 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12z"/>'),
  riwayat: ikonNav('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  tahu: ikonNav('<path d="M5 4.5h9a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2H5z"/><path d="M19 6.5V20"/>'),
  persona: ikonNav('<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
  penyedia: ikonNav('<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01"/><path d="M7 16.5h.01"/>'),
  pakai: ikonNav('<path d="M4 19.5V11"/><path d="M10 19.5V5"/><path d="M16 19.5v-6"/><path d="M21 19.5H3"/>'),
  data: ikonNav('<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>'),
};

const MENU = [
  { kode: 'chat', label: 'Percakapan', izin: 'ai.chat' },
  { kode: 'riwayat', label: 'Riwayat Bersama', izin: 'sesi.lihat' },
  { kode: 'tahu', label: 'Pengetahuan', izin: 'pengetahuan.lihat' },
  { kode: 'persona', label: 'Persona', izin: 'prompt.lihat' },
  { kode: 'data', label: 'Data yang Diketahui', izin: 'ai.chat' },
  { kode: 'pakai', label: 'Penggunaan', izin: 'pakai.lihat' },
  { kode: 'penyedia', label: 'Provider AI', izin: '', khususSuperadmin: true },
];
const menuBoleh = (m) => (m.khususSuperadmin ? negara.superadmin : bisa(m.izin));

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
    b.innerHTML = `<span class="ic">${IKON[m.kode] || IKON.chat}</span><span class="tn-tip">${H(m.label)}</span>`;
    b.onclick = () => { location.hash = '#' + m.kode; };
    nav.appendChild(b);
  });
}
function tandaiMenu(kode) {
  $$('.tn-item').forEach((n) => n.classList.remove('active'));
  const a = $('#nav_' + kode);
  if (a) a.classList.add('active');
}

// ============================================================ penulis jawaban
/* Penyaji Markdown kecil, DITULIS SENDIRI dan bukan pustaka dari CDN.
   Alasannya bukan ideologi: jawaban model adalah teks yang tidak dipercaya, dan
   satu-satunya cara aman menampilkannya adalah MELOLOSKAN SEMUANYA DULU lalu
   menambahkan tag yang kita izinkan sendiri. Pustaka umum bekerja terbalik
   (mengizinkan HTML mentah), dan itu berarti jawaban model bisa menyuntik
   skrip ke halaman yang dibuka seluruh tim. */
function keHtml(teks) {
  const src = String(teks || '');
  const blok = [];

  // 1) Blok kode diamankan lebih dulu supaya isinya tidak ikut diolah.
  let s = src.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, bahasa, isi) => {
    blok.push({ bahasa, isi });
    return `\u0000KODE${blok.length - 1}\u0000`;
  });

  s = H(s);

  // 2) Sebaris demi sebaris: judul, daftar, kutipan, garis.
  const baris = s.split('\n');
  const keluar = [];
  let dalamUl = false, dalamOl = false;
  const tutupDaftar = () => {
    if (dalamUl) { keluar.push('</ul>'); dalamUl = false; }
    if (dalamOl) { keluar.push('</ol>'); dalamOl = false; }
  };
  for (const b of baris) {
    const t = b.trim();
    if (!t) { tutupDaftar(); continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { tutupDaftar(); keluar.push('<hr>'); continue; }
    let m;
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {
      tutupDaftar();
      const n = Math.min(6, m[1].length + 2);
      keluar.push(`<h${n}>${sebaris(m[2])}</h${n}>`);
      continue;
    }
    if ((m = t.match(/^&gt;\s?(.*)$/))) {
      tutupDaftar();
      keluar.push(`<blockquote>${sebaris(m[1])}</blockquote>`);
      continue;
    }
    if ((m = t.match(/^[-*•]\s+(.*)$/))) {
      if (dalamOl) { keluar.push('</ol>'); dalamOl = false; }
      if (!dalamUl) { keluar.push('<ul>'); dalamUl = true; }
      keluar.push(`<li>${sebaris(m[1])}</li>`);
      continue;
    }
    if ((m = t.match(/^(\d+)[.)]\s+(.*)$/))) {
      if (dalamUl) { keluar.push('</ul>'); dalamUl = false; }
      if (!dalamOl) { keluar.push('<ol>'); dalamOl = true; }
      keluar.push(`<li>${sebaris(m[2])}</li>`);
      continue;
    }
    tutupDaftar();
    keluar.push(`<p>${sebaris(t)}</p>`);
  }
  tutupDaftar();

  let html = keluar.join('');
  // 3) Blok kode dikembalikan — isinya diloloskan di sini, bukan sebelumnya.
  html = html.replace(/\u0000KODE(\d+)\u0000/g, (_, i) => {
    const k = blok[Number(i)];
    return `<div class="ai-kode"><div class="ai-kode-bar"><span>${H(k.bahasa || 'teks')}</span>`
      + `<button type="button" class="ai-salin" data-kode="${H(k.isi)}">Salin</button></div>`
      + `<pre><code>${H(k.isi.replace(/\n$/, ''))}</code></pre></div>`;
  });
  return html;
}

/* Penanda dalam satu baris. Dipanggil SETELAH H(), jadi yang ada di sini sudah
   berupa teks aman; yang ditambahkan hanya tag dari daftar kita sendiri. */
function sebaris(t) {
  return String(t)
    .replace(/`([^`]+)`/g, (_, i) => `<code>${i}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// ============================================================ berkas lampiran
/* Seluruh pembacaan berkas dikerjakan DI BROWSER, bukan di server.
   Alasannya praktis, bukan ideologis: Vercel menjalankan fungsi tanpa
   penyimpanan, dengan batas ukuran permintaan dan batas ukuran paket fungsi.
   Mengunggah PDF 20 MB ke sana untuk diambil teksnya berarti membayar lalu
   lintas, waktu, dan ruang paket — padahal yang dibutuhkan model cuma
   teksnya, dan browser sudah sanggup mengambilnya sendiri.
   Yang menyeberang ke server hanya hasilnya: teks, atau gambar yang sudah
   dikecilkan. */

const VENDOR = '/js/vendor/';
const MAKS_SISI_GAMBAR = 1280;
const MAKS_DATA_GAMBAR = 1300000;   // panjang base64
const MAKS_TEKS_BERKAS = 30000;
const MAKS_BYTE_BERKAS = 25 * 1024 * 1024;
const MAKS_HALAMAN_PDF = 40;

/* Pustaka berat (pdf.js, mammoth, SheetJS) baru diunduh saat benar-benar ada
   yang melampirkan jenis berkas itu. Orang yang cuma mengetik pertanyaan tidak
   pernah mengunduh satu byte pun dari sini. */
const skripJanji = {};
function muatSkrip(src) {
  if (skripJanji[src]) return skripJanji[src];
  skripJanji[src] = new Promise((selesai, gagal) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => selesai();
    el.onerror = () => { delete skripJanji[src]; gagal(new Error('Pustaka pembaca berkas gagal dimuat.')); };
    document.head.appendChild(el);
  });
  return skripJanji[src];
}

const fmtUkuran = (b) => {
  const n = Number(b) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
};
const eksDari = (nama) => String(nama || '').split('.').pop().toLowerCase();

/* Gambar dikecilkan SEBELUM dikirim. Foto HP 12 MP itu 4 MB dan tidak membuat
   jawaban model lebih baik — sisi terpanjang 1280 px sudah cukup untuk membaca
   kwitansi, dan hasilnya puluhan kali lebih kecil. */
function kecilkanGambar(berkas) {
  return new Promise((selesai, gagal) => {
    const url = URL.createObjectURL(berkas);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const skala = Math.min(1, MAKS_SISI_GAMBAR / Math.max(img.width, img.height));
      const l = Math.max(1, Math.round(img.width * skala));
      const t = Math.max(1, Math.round(img.height * skala));
      const kanvas = document.createElement('canvas');
      kanvas.width = l; kanvas.height = t;
      const ktx = kanvas.getContext('2d');
      /* Latar putih dulu: PNG berlatar tembus pandang yang langsung dijadikan
         JPEG akan berlatar HITAM, dan tanda tangan atau tulisan gelap di
         atasnya jadi tidak terbaca sama sekali. */
      ktx.fillStyle = '#ffffff';
      ktx.fillRect(0, 0, l, t);
      ktx.drawImage(img, 0, 0, l, t);
      let mutu = 0.82;
      let hasil = kanvas.toDataURL('image/jpeg', mutu);
      while (hasil.length > MAKS_DATA_GAMBAR && mutu > 0.4) {
        mutu -= 0.12;
        hasil = kanvas.toDataURL('image/jpeg', mutu);
      }
      selesai({ mime: 'image/jpeg', data: hasil.split(',')[1], pratinjau: hasil, lebar: l, tinggi: t });
    };
    img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error('Berkas gambar tidak bisa dibaca.')); };
    img.src = url;
  });
}

async function bacaPdf(berkas) {
  await muatSkrip(VENDOR + 'pdf.min.js');
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error('Pembaca PDF tidak tersedia.');
  pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js';
  const dok = await pdfjs.getDocument({ data: await berkas.arrayBuffer() }).promise;
  const batas = Math.min(dok.numPages, MAKS_HALAMAN_PDF);
  let teks = '';
  for (let i = 1; i <= batas; i++) {
    const halaman = await dok.getPage(i);
    const isi = await halaman.getTextContent();
    teks += `\n\n[Halaman ${i}]\n` + isi.items.map((x) => x.str).join(' ');
    if (teks.length > MAKS_TEKS_BERKAS) break;
  }
  teks = teks.trim();
  /* PDF hasil pindai (foto yang dibungkus PDF) tidak punya teks sama sekali.
     Diam-diam mengirim berkas kosong akan membuat asisten menjawab ngawur;
     lebih baik katakan apa adanya dan tunjukkan jalan keluarnya. */
  if (!teks) {
    throw new Error('PDF ini tidak memuat teks — kemungkinan hasil pindai/foto. '
      + 'Kirimkan halamannya sebagai gambar (JPG/PNG) supaya bisa dibaca.');
  }
  return { teks, halaman: dok.numPages, terpotong: dok.numPages > batas || teks.length >= MAKS_TEKS_BERKAS };
}

async function bacaDocx(berkas) {
  await muatSkrip(VENDOR + 'mammoth.browser.min.js');
  if (!window.mammoth) throw new Error('Pembaca Word tidak tersedia.');
  const hasil = await window.mammoth.extractRawText({ arrayBuffer: await berkas.arrayBuffer() });
  const teks = String(hasil.value || '').trim();
  if (!teks) throw new Error('Berkas Word ini tidak berisi teks.');
  return { teks: teks.slice(0, MAKS_TEKS_BERKAS), terpotong: teks.length > MAKS_TEKS_BERKAS };
}

async function bacaXlsx(berkas) {
  await muatSkrip(VENDOR + 'xlsx.full.min.js');
  if (!window.XLSX) throw new Error('Pembaca Excel tidak tersedia.');
  const buku = window.XLSX.read(new Uint8Array(await berkas.arrayBuffer()), { type: 'array' });
  let teks = '';
  for (const nama of buku.SheetNames) {
    teks += `\n\n[Sheet: ${nama}]\n` + window.XLSX.utils.sheet_to_csv(buku.Sheets[nama]);
    if (teks.length > MAKS_TEKS_BERKAS) break;
  }
  teks = teks.trim();
  if (!teks) throw new Error('Berkas Excel ini kosong.');
  return { teks: teks.slice(0, MAKS_TEKS_BERKAS), terpotong: teks.length > MAKS_TEKS_BERKAS };
}

async function bacaTeksBiasa(berkas) {
  const teks = (await berkas.text()).trim();
  if (!teks) throw new Error('Berkas ini kosong.');
  return { teks: teks.slice(0, MAKS_TEKS_BERKAS), terpotong: teks.length > MAKS_TEKS_BERKAS };
}

const EKS_TEKS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm',
  'log', 'srt', 'vtt', 'js', 'ts', 'css', 'py', 'sql', 'yml', 'yaml', 'ini', 'env'];

async function bacaBerkas(berkas) {
  const eks = eksDari(berkas.name);
  const mime = berkas.type || '';

  if (mime.startsWith('image/')) {
    if (berkas.size > MAKS_BYTE_BERKAS) throw new Error('Gambar terlalu besar (maksimal 25 MB).');
    const g = await kecilkanGambar(berkas);
    return {
      nama: berkas.name, mime: g.mime, jenis: 'gambar', ukuran: berkas.size,
      data: g.data, pratinjau: g.pratinjau, ket: `${g.lebar}×${g.tinggi}`,
    };
  }

  if (berkas.size > MAKS_BYTE_BERKAS) throw new Error('Berkas terlalu besar (maksimal 25 MB).');

  let hasil;
  if (eks === 'pdf' || mime === 'application/pdf') hasil = await bacaPdf(berkas);
  else if (eks === 'docx') hasil = await bacaDocx(berkas);
  else if (eks === 'xlsx' || eks === 'xls') hasil = await bacaXlsx(berkas);
  else if (EKS_TEKS.includes(eks) || mime.startsWith('text/')) hasil = await bacaTeksBiasa(berkas);
  else if (eks === 'doc') throw new Error('Word format lama (.doc) belum didukung — simpan ulang sebagai .docx.');
  else throw new Error(`Jenis berkas ".${eks}" belum didukung.`);

  return {
    nama: berkas.name, mime: mime || 'text/plain', jenis: 'teks', ukuran: berkas.size,
    teks: hasil.teks, halaman: hasil.halaman || 0, terpotong: Boolean(hasil.terpotong),
    ket: `${fmtAngka(hasil.teks.length)} huruf${hasil.halaman ? ` · ${hasil.halaman} hal` : ''}`,
  };
}

// ------------------------------------------------------------ tampilan lampiran
function pasangLampiran() {
  const isian = $('#aiBerkas');
  const tombol = $('#aiLampirTombol');
  if (!isian || !tombol) return;
  tombol.onclick = () => isian.click();
  isian.onchange = async () => {
    const berkas = Array.from(isian.files || []);
    isian.value = '';           // supaya berkas yang sama bisa dipilih lagi
    await tambahBerkas(berkas);
  };

  const area = $('#aiWrap');
  if (area) {
    const matikan = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover'].forEach((ev) => area.addEventListener(ev, (e) => {
      matikan(e); area.classList.add('seret');
    }));
    ['dragleave', 'dragend'].forEach((ev) => area.addEventListener(ev, (e) => {
      matikan(e); if (e.target === area) area.classList.remove('seret');
    }));
    area.addEventListener('drop', async (e) => {
      matikan(e);
      area.classList.remove('seret');
      await tambahBerkas(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
    });
  }

  /* Tempel langsung dari papan klip — cara tercepat mengirim potongan layar,
     dan yang paling sering dipakai orang tanpa diberi tahu. */
  const teksIsian = $('#aiIsian');
  if (teksIsian) teksIsian.addEventListener('paste', async (e) => {
    const berkas = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (!berkas.length) return;
    e.preventDefault();
    await tambahBerkas(berkas);
  });

  gambarLampiran();
}

async function tambahBerkas(daftar) {
  if (!daftar.length) return;
  const maks = negara.aturLampiran.maksPerPesan || 4;
  for (const berkas of daftar) {
    if (negara.lampiran.length >= maks) {
      toast(`Maksimal ${maks} berkas per pertanyaan.`, 'galat');
      break;
    }
    const baris = { kunci: 'l' + Date.now() + Math.random(), nama: berkas.name, ukuran: berkas.size, memuat: true };
    negara.lampiran.push(baris);
    gambarLampiran();
    try {
      const hasil = await bacaBerkas(berkas);
      Object.assign(baris, hasil, { memuat: false });
    } catch (e) {
      negara.lampiran = negara.lampiran.filter((x) => x !== baris);
      toast(`${berkas.name}: ${e.message}`, 'galat');
    }
    gambarLampiran();
  }
}

function hapusLampiran(kunci) {
  negara.lampiran = negara.lampiran.filter((x) => x.kunci !== kunci);
  gambarLampiran();
}

function gambarLampiran() {
  const kotak = $('#aiLampiran');
  if (!kotak) return;
  kotak.hidden = negara.lampiran.length === 0;
  kotak.innerHTML = negara.lampiran.map((l) => `
    <div class="ai-lp-chip${l.memuat ? ' memuat' : ''}">
      ${l.pratinjau
        ? `<img class="ai-lp-thumb" src="${l.pratinjau}" alt="">`
        : `<span class="ai-lp-ext">${H(eksDari(l.nama).slice(0, 4).toUpperCase() || 'FILE')}</span>`}
      <span class="ai-lp-teks">
        <span class="ai-lp-nama">${H(l.nama)}</span>
        <span class="ai-lp-ket">${l.memuat ? 'membaca…' : H(`${l.ket || ''} · ${fmtUkuran(l.ukuran)}`)}</span>
      </span>
      <button type="button" class="ai-lp-x" data-buang="${H(l.kunci)}" title="Buang" aria-label="Buang ${H(l.nama)}">&times;</button>
    </div>`).join('');
  $$('[data-buang]', kotak).forEach((b) => { b.onclick = () => hapusLampiran(b.dataset.buang); });
}

/* Lampiran yang sudah tersimpan, digambar di dalam gelembung pesan. */
function lampiranPesanHtml(pesan) {
  const l = pesan.lampiran || [];
  if (!l.length) return '';
  return `<div class="ai-lp-pesan">${l.map((x) => (x.jenis === 'gambar'
    ? `<figure class="ai-lp-gambar" data-gambar="${H(x.id)}" data-ada="${x.adaBerkas ? '1' : '0'}">
         <div class="ai-lp-kosong">${x.adaBerkas ? 'memuat gambar…' : 'gambar sudah lewat masa simpan'}</div>
         <figcaption>${H(x.nama)}</figcaption>
       </figure>`
    : `<div class="ai-lp-chip tenang">
         <span class="ai-lp-ext">${H(eksDari(x.nama).slice(0, 4).toUpperCase() || 'FILE')}</span>
         <span class="ai-lp-teks">
           <span class="ai-lp-nama">${H(x.nama)}</span>
           <span class="ai-lp-ket">${H(`${fmtAngka(x.panjangTeks || String(x.teks || '').length)} huruf terbaca`
             + (x.halaman ? ` · ${x.halaman} hal` : '') + (x.terpotong ? ' · dipotong' : ''))}</span>
         </span>
       </div>`)).join('')}</div>`;
}

/* Gambar diambil satu per satu setelah gelembungnya tergambar, bukan ikut
   dalam balasan sesi. Kalau ikut, membuka percakapan berisi sepuluh foto
   berarti mengunduh beberapa megabyte sebelum satu huruf pun terlihat. */
async function muatGambarPesan() {
  for (const el of $$('.ai-lp-gambar[data-ada="1"]')) {
    if (el.dataset.sudah === '1') continue;
    el.dataset.sudah = '1';
    try {
      const h = await rpc('lampiran.ambil', { id: el.dataset.gambar });
      const kosong = $('.ai-lp-kosong', el);
      if (!h.ada) { if (kosong) kosong.textContent = h.pesan || 'gambar tidak tersedia'; continue; }
      const img = document.createElement('img');
      img.src = `data:${h.mime};base64,${h.data}`;
      img.alt = ($('figcaption', el) || {}).textContent || 'lampiran';
      img.loading = 'lazy';
      if (kosong) kosong.replaceWith(img);
      img.onclick = () => window.open(img.src, '_blank', 'noopener');
    } catch (_) {
      const kosong = $('.ai-lp-kosong', el);
      if (kosong) kosong.textContent = 'gambar gagal dimuat';
    }
  }
}

// ============================================================ suara
/* Pengenalan suara bawaan browser: tidak ada rekaman yang keluar dari
   perangkat lewat kita, tidak ada kunci API, tidak ada biaya. Harganya:
   Safari dan sebagian browser HP tidak punya ini. Di situ tombolnya
   DISEMBUNYIKAN, bukan ditampilkan lalu diam saat ditekan. */
let mesinSuara = null;
function pasangSuara() {
  const tombol = $('#aiSuara');
  if (!tombol) return;
  const Mesin = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Mesin) { tombol.hidden = true; return; }
  tombol.hidden = false;

  const isian = $('#aiIsian');
  let jalan = false;
  let sebelum = '';

  const berhenti = () => {
    jalan = false;
    tombol.classList.remove('merekam');
    tombol.title = 'Bicara';
  };

  tombol.onclick = () => {
    if (jalan) { if (mesinSuara) mesinSuara.stop(); return; }
    const m = new Mesin();
    mesinSuara = m;
    m.lang = 'id-ID';
    m.continuous = true;
    m.interimResults = true;
    sebelum = isian.value.trim();

    m.onstart = () => { jalan = true; tombol.classList.add('merekam'); tombol.title = 'Berhenti merekam'; };
    m.onerror = (e) => {
      berhenti();
      toast(e.error === 'not-allowed'
        ? 'Izin mikrofon ditolak. Aktifkan di setelan situs browser.'
        : 'Pengenalan suara gagal: ' + (e.error || 'tidak diketahui'), 'galat');
    };
    m.onend = berhenti;
    m.onresult = (ev) => {
      let teks = '';
      for (let i = 0; i < ev.results.length; i++) teks += ev.results[i][0].transcript;
      /* Ditambahkan ke apa yang SUDAH diketik, bukan menimpanya — orang sering
         mengetik separuh lalu melanjutkannya dengan suara. */
      isian.value = (sebelum ? sebelum + ' ' : '') + teks.trim();
      isian.dispatchEvent(new Event('input'));
    };
    try { m.start(); } catch (_) { berhenti(); }
  };
}

// ============================================================ pemilih model
function modelSekarang() {
  const d = negara.daftarModel || [];
  if (!d.length) return null;
  const p = negara.pilihan;
  return d.find((m) => m.penyediaId === p.penyediaId && m.model === p.model)
    || d.find((m) => m.baku) || d[0];
}

function gambarChipModel() {
  const nama = $('#aiModelNama');
  const tombol = $('#aiModelTombol');
  if (!nama || !tombol) return;
  const m = modelSekarang();
  const persona = negara.persona.find((x) => x.id === negara.personaId);
  nama.textContent = m ? m.model : 'belum ada model';
  tombol.title = m
    ? `${m.model} — lewat ${m.penyediaNama}` + (persona ? ` · peran: ${persona.judul}` : '')
    : 'Belum ada provider AI yang dipasang';
  tombol.classList.toggle('ada-peran', Boolean(persona));
}

function tutupMenu() {
  const bg = $('#aiMenuBg');
  if (bg) bg.hidden = true;
}

function pasangMenuModel() {
  const tombol = $('#aiModelTombol');
  const bg = $('#aiMenuBg');
  if (!tombol || !bg) return;
  tombol.onclick = (e) => { e.stopPropagation(); bukaMenuModel(); };
  bg.onclick = (e) => { if (e.target === bg) tutupMenu(); };
  gambarChipModel();
}

function bukaMenuModel() {
  const bg = $('#aiMenuBg');
  const menu = $('#aiMenu');
  const tombol = $('#aiModelTombol');
  if (!bg || !menu) return;

  const sekarang = modelSekarang();
  const perPenyedia = {};
  (negara.daftarModel || []).forEach((m) => {
    (perPenyedia[m.penyediaNama] = perPenyedia[m.penyediaNama] || []).push(m);
  });

  const bagianModel = Object.keys(perPenyedia).length
    ? Object.keys(perPenyedia).map((nama) => `
        <div class="ai-menu-grup">${H(nama)}</div>
        ${perPenyedia[nama].map((m) => `
          <button type="button" class="ai-menu-item${sekarang && m.penyediaId === sekarang.penyediaId && m.model === sekarang.model ? ' pilih' : ''}"
                  data-model="${H(m.model)}" data-penyedia="${H(m.penyediaId)}"${m.siap ? '' : ' disabled'}>
            <span class="ai-menu-utama">${H(m.model)}</span>
            <span class="ai-menu-ket">${m.siap ? '' : 'kunci API belum diisi · '}${m.dukungGambar ? 'bisa baca gambar' : 'teks saja'}</span>
          </button>`).join('')}`).join('')
    : `<div class="ai-menu-kosong">Belum ada provider AI.${negara.superadmin ? ' Tambahkan di menu Provider AI.' : ' Hubungi superadmin.'}</div>`;

  const bagianPeran = `
    <button type="button" class="ai-menu-item${negara.personaId ? '' : ' pilih'}" data-persona="">
      <span class="ai-menu-utama">Asisten umum</span>
      <span class="ai-menu-ket">tanpa peran khusus</span>
    </button>
    ${negara.persona.map((x) => `
      <button type="button" class="ai-menu-item${x.id === negara.personaId ? ' pilih' : ''}" data-persona="${H(x.id)}">
        <span class="ai-menu-utama">${H((x.ikon ? x.ikon + ' ' : '') + x.judul)}</span>
        <span class="ai-menu-ket">${H(String(x.isi || '').replace(/\s+/g, ' ').slice(0, 70))}</span>
      </button>`).join('')}`;

  menu.innerHTML = `<div class="ai-menu-judul">Model</div>${bagianModel}`
    + `<div class="ai-menu-judul">Peran</div>${bagianPeran}`;

  bg.hidden = false;
  /* Ditempatkan tepat di atas tombolnya, dan dijaga agar tidak keluar layar.
     Di layar sempit ia melebar penuh lewat CSS. */
  const r = tombol.getBoundingClientRect();
  menu.style.left = Math.max(10, Math.min(r.left, window.innerWidth - 310)) + 'px';
  menu.style.bottom = Math.max(10, window.innerHeight - r.top + 8) + 'px';

  $$('[data-model]', menu).forEach((b) => {
    b.onclick = () => {
      negara.pilihan = { penyediaId: b.dataset.penyedia, model: b.dataset.model };
      gambarChipModel();
      tutupMenu();
      if (negara.sesiId) {
        rpc('sesi.ubah', { id: negara.sesiId, penyediaId: b.dataset.penyedia, model: b.dataset.model }).catch(() => {});
      }
    };
  });
  $$('[data-persona]', menu).forEach((b) => {
    b.onclick = () => {
      negara.personaId = b.dataset.persona;
      gambarChipModel();
      tutupMenu();
      if (negara.sesiId) rpc('sesi.ubah', { id: negara.sesiId, personaId: negara.personaId }).catch(() => {});
    };
  });
}

// ============================================================ HALAMAN: CHAT
const CONTOH = [
  { ikon: '\u{1F4CA}', teks: 'Ringkas penghimpunan dan pentasyarufan bulan terakhir, lalu sebutkan yang perlu diperhatikan.' },
  { ikon: '\u{1F4D6}', teks: 'Jelaskan 8 ashnaf penerima zakat beserta contoh penyalurannya di tingkat daerah.' },
  { ikon: '\u{1F4AC}', teks: 'Buatkan draf pesan WhatsApp yang sopan untuk mengingatkan muzaki tentang zakat bulanan.' },
  { ikon: '\u{1F4DD}', teks: 'Susun kerangka laporan penyaluran triwulan untuk pimpinan daerah.' },
];

const halaman = {};

halaman.chat = {
  judul: 'Percakapan',
  penuh: true,
  async gambar(el) {
    el.innerHTML = `
      <div class="ai-wrap" id="aiWrap">
        <aside class="ai-rail" id="aiRail">
          <div class="ai-rail-atas">
            <div class="ai-rail-kepala">
              <span class="ai-rail-judul">Percakapan</span>
              <button type="button" class="ai-alat ai-alat-kecil" id="aiRailTutup"
                      title="Sembunyikan daftar percakapan" aria-label="Sembunyikan daftar percakapan">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M9.5 4.5v15"/><path d="m16.5 9.5-2.5 2.5 2.5 2.5"/></svg>
              </button>
            </div>
            <button type="button" class="btn btn-primary btn-sm ai-baru" id="aiBaru">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              Percakapan baru
            </button>
            <input type="search" id="aiCari" class="ai-cari" placeholder="Cari percakapan…" autocomplete="off">
          </div>
          <div class="ai-rail-daftar" id="aiDaftar">${rangka(4)}</div>
          <div class="ai-rail-kaki muted">Semua percakapan di sini dipakai bersama seluruh tim.</div>
        </aside>
        <div class="ai-rail-tirai" id="aiTirai"></div>

        <section class="ai-utama">
          <div class="ai-kepala">
            <button type="button" class="tn-icon ai-rail-tombol" id="aiRailTombol" title="Daftar percakapan" aria-label="Daftar percakapan">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/></svg>
            </button>
            <div class="ai-kepala-judul" id="aiJudul">Percakapan baru</div>
            <div class="ai-kepala-aksi" id="aiKepalaAksi"></div>
          </div>
          <div class="ai-thread" id="aiThread"></div>
          <div class="ai-komposer-bungkus">
            <div class="ai-komposer" id="aiKomposer">
              <div class="ai-lampiran" id="aiLampiran" hidden></div>
              <textarea id="aiIsian" rows="1" placeholder="Tanyakan apa saja tentang Lazismu, zakat, atau pekerjaan Anda…"
                        aria-label="Pertanyaan"></textarea>
              <div class="ai-komposer-kaki">
                <div class="ai-komposer-kiri">
                  <input type="file" id="aiBerkas" multiple hidden
                         accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.xml,.html,.log,.srt,.vtt">
                  <button type="button" class="ai-alat" id="aiLampirTombol" title="Lampirkan berkas" aria-label="Lampirkan berkas">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5 12.3 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l7-7"/></svg>
                  </button>
                  <button type="button" class="ai-alat" id="aiSuara" title="Bicara" aria-label="Rekam suara" hidden>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/></svg>
                  </button>
                  <button type="button" class="ai-chip-model" id="aiModelTombol" aria-haspopup="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M11 3.5 12.6 8 17 9.6 12.6 11.2 11 15.7 9.4 11.2 5 9.6 9.4 8z"/></svg>
                    <span id="aiModelNama">model</span>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>
                <div class="ai-komposer-kanan">
                  <button type="button" class="btn btn-sm ai-stop" id="aiStop" hidden>Hentikan</button>
                  <button type="button" class="btn btn-primary btn-sm ai-kirim" id="aiKirim" title="Kirim (Enter)" aria-label="Kirim">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="m12 5 7 7-7 7"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <div class="ai-catatan-kecil muted" id="aiCatatanKecil"></div>
          </div>
        </section>
        <div class="ai-menu-bg" id="aiMenuBg" hidden><div class="ai-menu" id="aiMenu" role="menu"></div></div>
      </div>`;

    pasangKomposer();
    pasangRail();
    pantauGeser();
    pasangLampiran();
    pasangSuara();
    pasangMenuModel();
    catatanKecil();
    await muatDaftarSesi();
    await bukaSesi(negara.sesiId || '', { diam: true });
  },
};

function catatanKecil() {
  const el = $('#aiCatatanKecil');
  if (!el) return;
  if (!negara.adaPenyedia) {
    el.innerHTML = negara.superadmin
      ? 'Belum ada provider AI. Buka menu <b>Provider AI</b> untuk memasangnya.'
      : 'Belum ada provider AI yang dipasang. Hubungi superadmin.';
    return;
  }
  el.innerHTML = 'Jawaban AI bisa keliru — periksa angka penting di menu aslinya. '
    + `Berkas yang dilampirkan disimpan ${fmtAngka(negara.aturLampiran.simpanHari)} hari; isi bacaannya tetap bisa dicari setelah itu.`;
}

function pasangKomposer() {
  const isian = $('#aiIsian');
  const kirim = $('#aiKirim');
  const stop = $('#aiStop');
  if (!isian) return;

  /* Kotak isian tumbuh mengikuti isi, sampai batas. Tanpa batas, pertanyaan
     panjang mendorong seluruh percakapan keluar layar di HP. */
  const tumbuh = () => {
    isian.style.height = 'auto';
    isian.style.height = Math.min(isian.scrollHeight, 200) + 'px';
  };
  isian.oninput = tumbuh;
  isian.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      kirim.click();
    }
  };
  kirim.onclick = () => {
    const t = isian.value.trim();
    /* Boleh mengirim tanpa mengetik apa pun asalkan ada berkas — "tolong baca
       ini" sering tidak diketik sama sekali. Yang tidak boleh: mengirim saat
       ada berkas yang masih dibaca, karena isinya belum ada. */
    if (!t && !negara.lampiran.length) return;
    if (negara.lampiran.some((l) => l.memuat)) { toast('Tunggu berkasnya selesai dibaca.', 'galat'); return; }
    isian.value = '';
    tumbuh();
    kirimPesan(t).catch((e) => toast(e.message, 'galat'));
  };
  stop.onclick = () => { if (negara.kontrol) negara.kontrol.abort(); };
  tumbuh();
}

/* Di layar lebar daftar percakapan adalah kolom tetap; di layar sempit ia laci
   yang menutupi. Satu tombol yang sama melayani keduanya, karena bagi yang
   memakainya keduanya adalah hal yang sama: "sembunyikan daftar ini".
   Pilihannya diingat — orang yang sudah menutupnya tidak mau menutupnya lagi
   setiap kali membuka halaman. */
const layarLebar = () => window.matchMedia('(min-width:901px)').matches;

function pasangRail() {
  const bungkus = $('#aiWrap');
  const tombol = $('#aiRailTombol');
  const tirai = $('#aiTirai');
  const tutupRail = () => {
    bungkus.classList.remove('rail-buka');
    if (layarLebar()) {
      bungkus.classList.add('rail-tutup');
      try { localStorage.setItem('ai_rail_tutup', 'true'); } catch (_) {}
    }
  };
  try {
    if (localStorage.getItem('ai_rail_tutup') === 'true') bungkus.classList.add('rail-tutup');
  } catch (_) {}

  if (tombol) tombol.onclick = () => {
    if (bungkus.classList.contains('rail-tutup')) {
      bungkus.classList.remove('rail-tutup');
      try { localStorage.setItem('ai_rail_tutup', 'false'); } catch (_) {}
      return;
    }
    if (layarLebar()) { tutupRail(); return; }
    bungkus.classList.toggle('rail-buka');
  };
  const silang = $('#aiRailTutup');
  if (silang) silang.onclick = tutupRail;
  if (tirai) tirai.onclick = () => bungkus.classList.remove('rail-buka');
  const tutup = () => bungkus.classList.remove('rail-buka');
  const baru = $('#aiBaru');
  if (baru) baru.onclick = () => { tutup(); mulaiSesiBaru(); };
  const cari = $('#aiCari');
  if (cari) {
    cari.oninput = () => {
      clearTimeout(cari._jam);
      cari._jam = setTimeout(() => muatDaftarSesi(cari.value.trim()), 250);
    };
  }
}

async function muatDaftarSesi(cari = '') {
  const el = $('#aiDaftar');
  if (!el) return;
  try {
    const h = await rpc('sesi.daftar', { cari });
    negara.daftarSesi = h.baris || [];
  } catch (e) {
    el.innerHTML = `<div class="muted" style="padding:12px;font-size:12.5px">${H(e.message)}</div>`;
    return;
  }
  if (!negara.daftarSesi.length) {
    el.innerHTML = `<div class="muted" style="padding:14px;font-size:12.5px;line-height:1.6">${
      cari ? 'Tidak ada percakapan yang cocok.' : 'Belum ada percakapan. Mulai satu — nanti terlihat oleh seluruh tim.'}</div>`;
    return;
  }
  el.innerHTML = negara.daftarSesi.map((s) => `
    <button type="button" class="ai-rail-item${s.id === negara.sesiId ? ' aktif' : ''}" data-sesi="${H(s.id)}">
      <div class="ai-rail-judul">${H(s.judul)}</div>
      <div class="ai-rail-meta">${H(s.olehNama || 'tim')} · ${H(fmtWaktu(s.diubah))} · ${fmtAngka(s.jumlahPesan)} pesan</div>
    </button>`).join('');
  $$('.ai-rail-item', el).forEach((b) => {
    b.onclick = () => {
      $('#aiWrap').classList.remove('rail-buka');
      bukaSesi(b.dataset.sesi);
    };
  });
}

function mulaiSesiBaru() {
  negara.sesiId = '';
  negara.sesi = null;
  negara.lampiran = [];
  gambarLampiran();
  gambarChipModel();
  $('#aiJudul').textContent = 'Percakapan baru';
  $$('.ai-rail-item').forEach((b) => b.classList.remove('aktif'));
  gambarKepalaAksi();
  gambarThread();
  const isian = $('#aiIsian');
  if (isian) isian.focus();
}

async function bukaSesi(id, { diam = false } = {}) {
  if (!id) { mulaiSesiBaru(); return; }
  const thread = $('#aiThread');
  if (!diam && thread) thread.innerHTML = `<div class="ai-thread-dalam">${rangka(3)}</div>`;
  try {
    const h = await rpc('sesi.buka', { id });
    negara.sesi = h.sesi;
    negara.sesiId = h.sesi.id;
    negara.personaId = h.sesi.personaId || negara.personaId;
    /* Model mengikuti percakapannya, bukan pilihan terakhir orang ini:
       percakapan dipakai bersama, dan melanjutkan jawaban orang lain dengan
       model yang berbeda diam-diam membuat riwayatnya tidak konsisten. */
    if (h.sesi.model) negara.pilihan = { penyediaId: h.sesi.penyediaId || '', model: h.sesi.model };
    gambarChipModel();
  } catch (e) {
    negara.sesiId = '';
    negara.sesi = null;
    if (!diam) toast(e.message, 'galat');
    mulaiSesiBaru();
    return;
  }
  $('#aiJudul').textContent = negara.sesi.judul;
  $$('.ai-rail-item').forEach((b) => b.classList.toggle('aktif', b.dataset.sesi === negara.sesiId));
  gambarKepalaAksi();
  gambarThread();
  geserKeBawah(true);
}

function gambarKepalaAksi() {
  const el = $('#aiKepalaAksi');
  if (!el) return;
  const tombol = [];
  if (negara.sesiId && bisa('sesi.ubah')) {
    tombol.push('<button type="button" class="tn-icon" id="aiGantiJudul" title="Ganti judul" aria-label="Ganti judul">'
      + '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>');
  }
  if (negara.sesiId && bisa('sesi.hapus')) {
    tombol.push('<button type="button" class="tn-icon" id="aiHapusSesi" title="Hapus percakapan" aria-label="Hapus percakapan">'
      + '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6.5 7 7.5 20h9l1-13"/></svg></button>');
  }
  tombol.push(tombolTema());
  el.innerHTML = tombol.join('');
  const tt = $('#tombolTema', el);
  if (tt) tt.onclick = () => { terapkanTema(!temaGelap()); segarTema(tt); };
  const gj = $('#aiGantiJudul');
  if (gj) gj.onclick = () => tanyaJudul(negara.sesi);
  const hs = $('#aiHapusSesi');
  if (hs) hs.onclick = () => hapusSesi(negara.sesiId);
}

function tanyaJudul(s) {
  modal('Ganti judul percakapan',
    `<div class="field"><label>Judul</label><input id="jdl" maxlength="100" value="${H(s.judul)}"></div>`,
    () => {
      $('#jBatal').onclick = tutupModal;
      $('#jSimpan').onclick = async () => {
        const v = $('#jdl').value.trim();
        tutupModal();
        try {
          await rpc('sesi.ubah', { id: s.id, judul: v });
          $('#aiJudul').textContent = v || s.judul;
          await muatDaftarSesi($('#aiCari') ? $('#aiCari').value.trim() : '');
          toast('Judul diubah.');
        } catch (e) { toast(e.message, 'galat'); }
      };
    },
    '<button class="btn" id="jBatal" type="button">Batal</button>'
    + '<button class="btn btn-primary" id="jSimpan" type="button">Simpan</button>');
}

function hapusSesi(id) {
  konfirmasi('Hapus percakapan ini?',
    'Percakapan dipakai bersama — menghapusnya berarti menghapusnya juga untuk seluruh tim. Tidak bisa dikembalikan.',
    async () => {
      try {
        await rpc('sesi.hapus', { id });
        toast('Percakapan dihapus.');
        mulaiSesiBaru();
        await muatDaftarSesi($('#aiCari') ? $('#aiCari').value.trim() : '');
      } catch (e) { toast(e.message, 'galat'); }
    }, 'Hapus');
}

// ------------------------------------------------------------ gambar thread
function gambarThread() {
  const thread = $('#aiThread');
  if (!thread) return;
  const pesan = (negara.sesi && negara.sesi.pesan) || [];
  if (!pesan.length) {
    thread.innerHTML = `<div class="ai-thread-dalam">${sambutan()}</div>`;
    pasangContoh();
    return;
  }
  thread.innerHTML = `<div class="ai-thread-dalam" id="aiDalam">${pesan.map(gelembung).join('')}</div>`;
  pasangAksiPesan();
  muatGambarPesan();
}

function sambutan() {
  const nama = (negara.pengguna && String(negara.pengguna.nama || '').split(' ')[0]) || '';
  return `<div class="ai-sambut">
    <div class="ai-sambut-tanda">${IKON.chat}</div>
    <h2>Halo${nama ? ', ' + H(nama) : ''}.</h2>
    <p class="muted">Saya Asisten Lazismu. Tanyakan soal zakat, program, atau angka penghimpunan lembaga —
      saya juga bisa membantu menyusun draf surat, pesan, dan laporan.</p>
    <div class="ai-contoh">
      ${CONTOH.map((c) => `<button type="button" class="ai-contoh-item" data-teks="${H(c.teks)}">
        <span class="ai-contoh-ikon">${c.ikon}</span><span>${H(c.teks)}</span></button>`).join('')}
    </div>
  </div>`;
}

function pasangContoh() {
  $$('.ai-contoh-item').forEach((b) => {
    b.onclick = () => {
      const isian = $('#aiIsian');
      isian.value = b.dataset.teks;
      isian.dispatchEvent(new Event('input'));
      isian.focus();
    };
  });
}

function gelembung(p) {
  const asisten = p.peran === 'assistant';
  const nama = asisten ? 'Asisten Lazismu' : (p.olehNama || 'Pengguna');
  const meta = [fmtWaktu(p.waktu)];
  if (asisten && p.model) meta.push(p.model);
  if (p.terpotong) meta.push('terputus');
  return `<article class="ai-pesan ${asisten ? 'dari-ai' : 'dari-orang'}" data-pesan="${H(p.id)}">
    <div class="ai-avatar${asisten ? ' ai-avatar-ai' : ''}">${asisten ? '✨' : H(inisial(nama))}</div>
    <div class="ai-isi-bungkus">
      <div class="ai-pesan-kepala"><span class="ai-nama">${H(nama)}</span><span class="ai-pesan-meta">${H(meta.filter(Boolean).join(' · '))}</span></div>
      <div class="ai-isi">${asisten
        ? keHtml(p.isi)
        : (p.isi ? `<p>${H(p.isi).replace(/\n/g, '<br>')}</p>` : '<p class="muted">(berkas terlampir)</p>')
          + lampiranPesanHtml(p)}</div>
      ${asisten ? `<div class="ai-pesan-aksi">
        <button type="button" class="ai-aksi-kecil" data-salin="1">Salin</button>
        ${bisa('sesi.kirim') ? '<button type="button" class="ai-aksi-kecil" data-ulangi="1">Minta ulang</button>' : ''}
      </div>` : ''}
    </div>
  </article>`;
}

function pasangAksiPesan() {
  $$('.ai-pesan.dari-ai').forEach((art) => {
    const teks = () => {
      const p = ((negara.sesi && negara.sesi.pesan) || []).find((x) => x.id === art.dataset.pesan);
      return p ? p.isi : art.querySelector('.ai-isi').innerText;
    };
    const s = art.querySelector('[data-salin]');
    if (s) s.onclick = () => salin(teks());
    const u = art.querySelector('[data-ulangi]');
    if (u) u.onclick = () => ulangiJawaban();
  });
  $$('.ai-salin').forEach((b) => { b.onclick = () => salin(b.dataset.kode); });
}

function salin(teks) {
  const selesai = () => toast('Disalin.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(String(teks || '')).then(selesai, () => toast('Gagal menyalin.', 'galat'));
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = String(teks || '');
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); selesai(); } catch (_) { toast('Gagal menyalin.', 'galat'); }
  ta.remove();
}

async function ulangiJawaban() {
  if (negara.mengalir || !negara.sesiId) return;
  const pesan = (negara.sesi && negara.sesi.pesan) || [];
  const terakhirOrang = [...pesan].reverse().find((p) => p.peran === 'user');
  if (!terakhirOrang) return;
  try {
    const h = await rpc('sesi.ulangi', { id: negara.sesiId });
    negara.sesi = h.sesi;
    /* Pertanyaan terakhir ikut dibuang dari tampilan supaya tidak tergambar dua
       kali: kirimPesan() akan menuliskannya kembali. */
    negara.sesi.pesan = (negara.sesi.pesan || []).filter((p) => p.id !== terakhirOrang.id);
    gambarThread();
    /* Lampiran lama TIDAK dikirim ulang: berkasnya sudah ada di riwayat sesi
       dan tetap terbaca model dari sana. Mengirim ulang hanya menggandakannya
       di percakapan dan membayar ulang tokennya. */
    await kirimPesan(terakhirOrang.isi, []);
  } catch (e) { toast(e.message, 'galat'); }
}

// ------------------------------------------------------------ geser & alir
let kuncikanBawah = true;
function geserKeBawah(paksa) {
  const t = $('#aiThread');
  if (!t) return;
  if (!paksa && !kuncikanBawah) return;
  t.scrollTop = t.scrollHeight;
}
function pantauGeser() {
  const t = $('#aiThread');
  if (!t || t._dipantau) return;
  t._dipantau = true;
  t.addEventListener('scroll', () => {
    kuncikanBawah = (t.scrollHeight - t.scrollTop - t.clientHeight) < 80;
  }, { passive: true });
}

function setSibukKomposer(sibuk) {
  negara.mengalir = sibuk;
  const kirim = $('#aiKirim');
  const stop = $('#aiStop');
  if (kirim) kirim.disabled = sibuk;
  if (stop) stop.hidden = !sibuk;
  const isian = $('#aiIsian');
  if (isian && !sibuk) isian.focus();
}

/* Inilah satu-satunya jalur yang tidak lewat rpc(): jawabannya datang
   sepotong-sepotong, jadi ia harus dibaca sebagai aliran, bukan JSON sekali
   jadi. Bentuk bingkainya: {"t":"mulai"|"token"|"selesai"|"galat"}. */
async function kirimPesan(teks, lampiranDipakai) {
  if (negara.mengalir) return;
  if (!bisa('sesi.kirim')) { toast('Akun Anda hanya bisa membaca percakapan.', 'galat'); return; }
  if (!negara.adaPenyedia) {
    toast(negara.superadmin ? 'Pasang provider AI dulu di menu Provider AI.' : 'Belum ada provider AI. Hubungi superadmin.', 'galat');
    return;
  }

  pantauGeser();
  kuncikanBawah = true;

  // Gelembung pertanyaan digambar langsung, tanpa menunggu server — menunggu
  // membuat halaman terasa mati tepat pada saat orang paling memperhatikannya.
  /* Lampiran diambil dari kotak isian lalu SEGERA dikosongkan, supaya menekan
     kirim dua kali tidak mengirim berkas yang sama dua kali. */
  const berkas = lampiranDipakai || negara.lampiran.slice();
  if (!lampiranDipakai) { negara.lampiran = []; gambarLampiran(); }

  const dalam = pastikanDalam();
  dalam.insertAdjacentHTML('beforeend', gelembung({
    id: 'sementara', peran: 'user', isi: teks,
    lampiran: berkas.map((l) => ({
      id: 'x', nama: l.nama, jenis: l.jenis, mime: l.mime, adaBerkas: false,
      panjangTeks: String(l.teks || '').length, halaman: l.halaman, terpotong: l.terpotong,
    })),
    olehNama: (negara.pengguna && negara.pengguna.nama) || 'Anda', waktu: new Date().toISOString(),
  }));
  const artAI = document.createElement('article');
  artAI.className = 'ai-pesan dari-ai mengalir';
  artAI.innerHTML = `<div class="ai-avatar ai-avatar-ai">✨</div>
    <div class="ai-isi-bungkus">
      <div class="ai-pesan-kepala"><span class="ai-nama">Asisten Lazismu</span><span class="ai-pesan-meta" id="aiMetaAlir">menyiapkan jawaban…</span></div>
      <div class="ai-isi" id="aiIsiAlir"><div class="ai-denyut"><i></i><i></i><i></i></div></div>
    </div>`;
  dalam.appendChild(artAI);
  geserKeBawah(true);

  const kontrol = new AbortController();
  negara.kontrol = kontrol;
  setSibukKomposer(true);

  let jawaban = '';
  let gambarTertunda = false;
  const isiEl = $('#aiIsiAlir');
  const metaEl = $('#aiMetaAlir');
  const gambarJawaban = () => {
    gambarTertunda = false;
    isiEl.innerHTML = keHtml(jawaban) + '<span class="ai-kursor"></span>';
    geserKeBawah();
  };
  const jadwalGambar = () => {
    if (gambarTertunda) return;
    gambarTertunda = true;
    requestAnimationFrame(gambarJawaban);
  };

  try {
    /* Alamatnya sama dengan rpc() — /api/ai — hanya bentuk balasannya yang
       berbeda, jadi ia tidak bisa memakai rpc() yang menunggu JSON utuh.
       Satu alamat untuk semuanya bukan pilihan gaya: Vercel Hobby membatasi
       jumlah fungsi, dan alamat kedua membuat seluruh deploy gagal. */
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Laz-Token': tokenLaz() },
      signal: kontrol.signal,
      body: JSON.stringify({
        tindakan: 'chat.alir',
        token: tokenLaz(),
        sesiId: negara.sesiId || '',
        pesan: teks,
        personaId: negara.personaId || '',
        penyediaId: (modelSekarang() || {}).penyediaId || '',
        model: (modelSekarang() || {}).model || '',
        lampiran: berkas.map((l) => ({
          nama: l.nama, mime: l.mime, jenis: l.jenis, ukuran: l.ukuran,
          data: l.data, teks: l.teks, halaman: l.halaman, terpotong: l.terpotong,
        })),
      }),
    });

    if (!res.ok) {
      let pesanGalat = `Server menolak (${res.status})`;
      try { const j = await res.json(); if (j && j.pesan) pesanGalat = j.pesan; } catch (_) {}
      if (res.status === 401) { location.href = '/index.html'; return; }
      throw new Error(pesanGalat);
    }

    await bacaAliran(res, (b) => {
      if (b.t === 'mulai') {
        const baru = !negara.sesiId;
        negara.sesiId = b.sesiId;
        $('#aiJudul').textContent = b.judul || 'Percakapan';
        metaEl.textContent = ringkasOtak(b);
        if (baru) muatDaftarSesi($('#aiCari') ? $('#aiCari').value.trim() : '');
      } else if (b.t === 'token') {
        jawaban += b.v;
        jadwalGambar();
      } else if (b.t === 'selesai') {
        jawaban = jawaban || '(jawaban kosong)';
      } else if (b.t === 'galat') {
        if (!b.sebagian) throw new Error(b.pesan);
        toast(b.pesan, 'galat');
      }
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      toast('Dihentikan.');
    } else {
      isiEl.innerHTML = keHtml(jawaban) + `<div class="ai-galat">${H(e.message || 'Gagal menghubungi asisten.')}</div>`;
      metaEl.textContent = 'gagal';
      /* Berkasnya dikembalikan ke kotak isian. Membuangnya karena server
         menolak berarti orangnya harus memilih ulang semua berkas — untuk
         kesalahan yang bukan salahnya. */
      if (!negara.sesiId || !jawaban) { negara.lampiran = berkas.concat(negara.lampiran); gambarLampiran(); }
      setSibukKomposer(false);
      negara.kontrol = null;
      geserKeBawah();
      return;
    }
  }

  setSibukKomposer(false);
  negara.kontrol = null;

  /* Sesi dimuat ulang dari server, bukan ditambal di layar: yang tersimpan
     itulah yang akan dibaca orang berikutnya, termasuk penanda "terputus". */
  try {
    const h = await rpc('sesi.buka', { id: negara.sesiId });
    negara.sesi = h.sesi;
    gambarThread();
    geserKeBawah(true);
    muatDaftarSesi($('#aiCari') ? $('#aiCari').value.trim() : '');
  } catch (_) {
    gambarJawaban();
  }
}

function ringkasOtak(b) {
  const o = b.otak || {};
  const bagian = [];
  if (b.penyedia && b.penyedia.model) bagian.push(b.penyedia.model);
  if (o.persona) bagian.push('peran: ' + o.persona);
  if (o.pengetahuan) bagian.push(`${o.pengetahuan} catatan pengetahuan`);
  if (o.data) bagian.push('data lembaga');
  return bagian.join(' · ');
}

function pastikanDalam() {
  let dalam = $('#aiDalam');
  if (!dalam) {
    const thread = $('#aiThread');
    thread.innerHTML = '<div class="ai-thread-dalam" id="aiDalam"></div>';
    dalam = $('#aiDalam');
  }
  return dalam;
}

/* Pembaca SSE sisi browser. Sama seperti di server, potongan byte TIDAK selalu
   berhenti di akhir baris — sisanya disimpan dan disambung. Tanpa ini, sesekali
   ada token yang hilang di tengah kalimat dan tidak ada yang tahu sebabnya. */
async function bacaAliran(res, saatBingkai) {
  const pembaca = res.body.getReader();
  const dekoder = new TextDecoder();
  let sisa = '';
  for (;;) {
    const { done, value } = await pembaca.read();
    if (done) break;
    sisa += dekoder.decode(value, { stream: true });
    let n;
    while ((n = sisa.indexOf('\n')) >= 0) {
      const baris = sisa.slice(0, n).replace(/\r$/, '');
      sisa = sisa.slice(n + 1);
      if (!baris || baris.startsWith(':')) continue;      // denyut & baris kosong
      if (!baris.startsWith('data:')) continue;
      const isi = baris.slice(5).trim();
      if (!isi) continue;
      let b;
      try { b = JSON.parse(isi); } catch (_) { continue; }
      saatBingkai(b);
    }
  }
}

// ============================================================ HALAMAN: RIWAYAT
halaman.riwayat = {
  judul: 'Riwayat Bersama',
  sub: 'Semua percakapan modul ini — terlihat dan bisa dilanjutkan oleh seluruh tim',
  async gambar(el) {
    el.innerHTML = `
      <div class="card">
        <div class="fund-alat" style="margin-bottom:12px">
          <input type="search" id="rwCari" placeholder="Cari judul atau isi percakapan…" style="flex:1;min-width:200px" autocomplete="off">
          <button type="button" class="btn btn-sm" id="rwSegarkan">Segarkan</button>
        </div>
        <div id="rwStrip"></div>
        <div id="rwIsi">${rangka(5)}</div>
      </div>`;
    const muat = async () => {
      const wadah = $('#rwIsi');
      let baris;
      try { baris = (await rpc('sesi.daftar', { cari: $('#rwCari').value.trim() })).baris || []; }
      catch (e) { wadah.innerHTML = galatKotak(e.message); return; }
      if (!baris.length) { wadah.innerHTML = kosong('Belum ada percakapan tersimpan.', '\u{1F4AC}'); $('#rwStrip').innerHTML = ''; return; }

      const bolehHapus = bisa('sesi.hapus');
      $('#rwStrip').innerHTML = bolehHapus
        ? '<div class="strip-tandai"><div class="bilah-tandai" id="bilahTandai" hidden>'
          + '<span class="bt-jumlah" id="btJumlah"></span>'
          + '<button type="button" class="btn btn-sm" id="btBatal">Batal</button>'
          + '<button type="button" class="btn btn-sm btn-danger" id="btHapus">Hapus yang ditandai</button></div></div>'
        : '';

      wadah.innerHTML = `<div class="table-wrap"><table>
        <thead><tr>
          ${bolehHapus ? '<th class="kol-tandai"><input type="checkbox" id="tandaiSemua" aria-label="Tandai semua"></th>' : ''}
          <th>Judul</th><th>Dimulai oleh</th><th class="ta-c">Pesan</th><th>Terakhir</th><th></th>
        </tr></thead><tbody>
        ${baris.map((s) => `<tr>
          ${bolehHapus ? `<td class="kol-tandai"><input type="checkbox" class="tandai" value="${H(s.id)}" aria-label="Tandai baris"></td>` : ''}
          <td><b>${H(s.judul)}</b><div class="muted" style="font-size:11.5px;margin-top:2px">${H(s.cuplikan)}</div></td>
          <td>${H(s.olehNama || '—')}</td>
          <td class="ta-c">${fmtAngka(s.jumlahPesan)}</td>
          <td>${H(fmtWaktu(s.diubah))}</td>
          <td class="ta-r"><button type="button" class="btn btn-sm" data-buka="${H(s.id)}">Buka</button></td>
        </tr>`).join('')}
        </tbody></table></div>`;

      $$('[data-buka]', wadah).forEach((b) => {
        b.onclick = () => { negara.sesiId = b.dataset.buka; location.hash = '#chat'; };
      });

      if (!bolehHapus) return;
      const dipilih = new Set();
      const kotak = $$('.tandai', wadah);
      const semua = $('#tandaiSemua', wadah);
      const bilah = $('#bilahTandai');
      const segarkan = () => {
        bilah.hidden = dipilih.size === 0;
        $('#btJumlah').textContent = `${fmtAngka(dipilih.size)} percakapan ditandai`;
        if (semua) {
          semua.checked = kotak.length > 0 && dipilih.size === kotak.length;
          semua.indeterminate = dipilih.size > 0 && dipilih.size < kotak.length;
        }
      };
      kotak.forEach((k) => { k.onchange = () => { if (k.checked) dipilih.add(k.value); else dipilih.delete(k.value); segarkan(); }; });
      if (semua) semua.onchange = () => {
        kotak.forEach((k) => { k.checked = semua.checked; if (k.checked) dipilih.add(k.value); else dipilih.delete(k.value); });
        segarkan();
      };
      $('#btBatal').onclick = () => { dipilih.clear(); kotak.forEach((k) => { k.checked = false; }); segarkan(); };
      $('#btHapus').onclick = () => {
        const id = Array.from(dipilih);
        if (!id.length) return;
        konfirmasi(`Hapus ${fmtAngka(id.length)} percakapan?`,
          'Percakapan dipakai bersama — ini menghapusnya untuk seluruh tim dan tidak bisa dikembalikan.',
          async () => {
            try {
              const h = await rpc('sesi.hapusBanyak', { id });
              toast(h.pesan || 'Terhapus.');
              if (id.includes(negara.sesiId)) { negara.sesiId = ''; negara.sesi = null; }
              await muat();
            } catch (e) { toast(e.message, 'galat'); }
          }, `Hapus ${fmtAngka(id.length)} percakapan`);
      };
      segarkan();
    };
    $('#rwSegarkan').onclick = muat;
    $('#rwCari').oninput = () => { clearTimeout($('#rwCari')._jam); $('#rwCari')._jam = setTimeout(muat, 280); };
    await muat();
  },
};

// ============================================================ pustaka (pengetahuan & persona)
/* Satu penggambar untuk dua halaman: bentuk datanya memang sama, dan dua
   salinan kode yang sama pasti berbeda suatu saat nanti. */
function halamanPustaka({ nama, judul, sub, tindakan, izinUbah, jelas, contoh, adaIkon }) {
  return {
    judul, sub,
    async gambar(el) {
      const boleh = bisa(izinUbah);
      el.innerHTML = `
        <div class="card">
          <div class="fund-alat" style="margin-bottom:12px">
            <div class="muted" style="flex:1;font-size:12.5px;line-height:1.6">${H(jelas)}</div>
            ${boleh ? `<button type="button" class="btn btn-primary btn-sm" id="pkBaru">Tambah</button>` : ''}
          </div>
          <div id="pkInfo"></div>
          <div id="pkIsi">${rangka(4)}</div>
        </div>`;

      const muat = async () => {
        const wadah = $('#pkIsi');
        let h;
        try { h = await rpc(tindakan.daftar); }
        catch (e) { wadah.innerHTML = galatKotak(e.message); return; }
        const baris = h.baris || [];

        if (h.gabungan) {
          $('#pkInfo').innerHTML = `<div class="ai-info">Gabungan pengetahuan aktif: <b>${fmtAngka(h.gabungan.panjang)}</b> huruf`
            + (h.gabungan.terpotong ? ' — <b style="color:var(--red)">sudah melewati batas dan dipotong.</b> Ringkas beberapa catatan atau matikan yang tidak terpakai.' : '.')
            + ' Teks ini ikut dikirim pada setiap pertanyaan.</div>';
        }

        if (!baris.length) { wadah.innerHTML = kosong(contoh, '\u{1F4DA}'); return; }
        wadah.innerHTML = `<div class="ai-kartu-grid">${baris.map((r) => `
          <article class="ai-kartu${r.aktif === false ? ' mati' : ''}">
            <div class="ai-kartu-kepala">
              <div class="ai-kartu-judul">${adaIkon && r.ikon ? H(r.ikon) + ' ' : ''}${H(r.judul)}</div>
              <span class="badge ${r.aktif === false ? 'grey' : 'green'}">${r.aktif === false ? 'nonaktif' : 'aktif'}</span>
            </div>
            <p class="ai-kartu-isi">${H(String(r.isi).slice(0, 260))}${String(r.isi).length > 260 ? '…' : ''}</p>
            <div class="ai-kartu-kaki">
              <span class="muted">${H(r.olehNama || '—')} · ${H(fmtWaktu(r.diubah))} · ${fmtAngka(String(r.isi).length)} huruf</span>
              ${boleh ? `<span class="ai-kartu-aksi">
                <button type="button" class="btn btn-sm" data-ubah="${H(r.id)}">Ubah</button>
                <button type="button" class="btn btn-sm btn-danger" data-hapus="${H(r.id)}">Hapus</button></span>` : ''}
            </div>
          </article>`).join('')}</div>`;

        $$('[data-ubah]', wadah).forEach((b) => {
          b.onclick = () => formulir(baris.find((x) => x.id === b.dataset.ubah));
        });
        $$('[data-hapus]', wadah).forEach((b) => {
          b.onclick = () => {
            const r = baris.find((x) => x.id === b.dataset.hapus);
            konfirmasi(`Hapus "${r.judul}"?`, 'Catatan ini akan hilang dan tidak bisa dikembalikan.', async () => {
              try { await rpc(tindakan.hapus, { id: r.id }); toast('Dihapus.'); await muat(); }
              catch (e) { toast(e.message, 'galat'); }
            }, 'Hapus');
          };
        });
      };

      const formulir = (r) => {
        const d = r || { judul: '', isi: '', aktif: true, urutan: 100, ikon: '' };
        modal(r ? 'Ubah catatan' : 'Tambah catatan',
          `<div class="field"><label>Judul</label><input id="fJudul" maxlength="100" value="${H(d.judul)}" placeholder="${H(nama === 'tahu' ? 'Mis. Program Pilar Pendidikan 2026' : 'Mis. Penulis Laporan')}"></div>`
          + (adaIkon ? `<div class="field"><label>Ikon (emoji, boleh kosong)</label><input id="fIkon" maxlength="8" value="${H(d.ikon || '')}" placeholder="\u{1F4DD}"></div>` : '')
          + `<div class="field"><label>Isi</label><textarea id="fIsi" rows="9" placeholder="${H(contoh)}">${H(d.isi)}</textarea></div>`
          + `<div class="field ai-field-baris">
               <label class="set-switch"><input type="checkbox" id="fAktif"${d.aktif === false ? '' : ' checked'}><span>Aktif</span></label>
               <span style="flex:1"></span>
               <label style="font-size:12.5px">Urutan <input id="fUrutan" type="number" value="${Number(d.urutan) || 100}" style="width:80px"></label>
             </div>`,
          () => {
            $('#fBatal').onclick = tutupModal;
            $('#fSimpan').onclick = async () => {
              const data = {
                id: r ? r.id : undefined,
                judul: $('#fJudul').value.trim(),
                isi: $('#fIsi').value,
                aktif: $('#fAktif').checked,
                urutan: Number($('#fUrutan').value) || 100,
              };
              if (adaIkon) data.ikon = $('#fIkon').value.trim();
              try {
                await rpc(tindakan.simpan, data);
                tutupModal();
                toast('Tersimpan.');
                await muat();
                if (nama === 'prompt') await muatStatus();
              } catch (e) { toast(e.message, 'galat'); }
            };
          },
          '<button class="btn" id="fBatal" type="button">Batal</button>'
          + '<button class="btn btn-primary" id="fSimpan" type="button">Simpan</button>');
      };

      const baru = $('#pkBaru');
      if (baru) baru.onclick = () => formulir(null);
      await muat();
    },
  };
}

halaman.tahu = halamanPustaka({
  nama: 'tahu',
  judul: 'Pengetahuan Lembaga',
  sub: 'Fakta tentang Lazismu Daerah Bantul yang ikut dibacakan ke asisten pada setiap pertanyaan',
  tindakan: { daftar: 'pengetahuan.daftar', simpan: 'pengetahuan.simpan', hapus: 'pengetahuan.hapus' },
  izinUbah: 'pengetahuan.ubah',
  jelas: 'Inilah "otak" asisten. Apa pun yang ditulis di sini dianggap benar olehnya — alamat kantor, nama program, rekening resmi, aturan internal, jawaban pertanyaan yang sering masuk.',
  contoh: 'Contoh: "Kantor Lazismu Daerah Bantul buka Senin–Jumat 08.00–15.00. Rekening resmi: … Program pilar pendidikan tahun ini: …"',
  adaIkon: false,
});

halaman.persona = halamanPustaka({
  nama: 'prompt',
  judul: 'Persona & Prompt',
  sub: 'Peran siap pakai yang bisa dipilih saat bertanya — pengubah gaya dan cara kerja asisten',
  tindakan: { daftar: 'prompt.daftar', simpan: 'prompt.simpan', hapus: 'prompt.hapus' },
  izinUbah: 'prompt.ubah',
  jelas: 'Persona hanya berlaku bila dipilih di kotak "Peran" pada halaman Percakapan. Gunakan untuk tugas berulang: menulis surat, meringkas laporan, menyusun caption.',
  contoh: 'Contoh: "Kamu penulis surat resmi lembaga. Gunakan kop bahasa formal, kalimat pendek, dan selalu tutup dengan salam Muhammadiyah."',
  adaIkon: true,
});

// ============================================================ HALAMAN: DATA
halaman.data = {
  judul: 'Data yang Diketahui Asisten',
  sub: 'Persis seperti yang dibacakan ke model — tanpa nama, nomor telepon, atau alamat donatur',
  async gambar(el) {
    el.innerHTML = `<div class="card">${rangka(3)}</div>`;
    let d;
    try { d = await rpc('data.ringkas'); }
    catch (e) { el.innerHTML = galatKotak(e.message); return; }

    if (d.kosong) {
      el.innerHTML = `<div class="card">${kosong(d.galat
        ? `Data belum bisa dibaca: ${d.galat}`
        : 'Belum ada transaksi penghimpunan atau pentasyarufan yang bisa diringkas.', '\u{1F5C4}')}</div>`;
      return;
    }
    el.innerHTML = `
      <div class="card">
        <div class="ai-info">Blok di bawah ini dikirim apa adanya pada setiap pertanyaan.
          Isinya hanya <b>angka dan kategori</b>. Nama donatur, nomor telepon, alamat, dan NIK
          <b>tidak pernah</b> ikut — asisten memang tidak diberi aksesnya.</div>
        <pre class="ai-pra">${H(d.teks)}</pre>
        <div class="muted" style="font-size:12px;margin-top:10px">${fmtAngka(d.teks.length)} huruf · bulan terakhir: ${H(d.bulanTerakhir || '—')}</div>
      </div>`;
  },
};

// ============================================================ HALAMAN: PENGGUNAAN
halaman.pakai = {
  judul: 'Penggunaan Token',
  sub: 'Berapa banyak yang dipakai, oleh model dan oleh siapa — agar tagihan tidak jadi kejutan',
  async gambar(el, bulanDiminta) {
    el.innerHTML = `<div class="card">${rangka(4)}</div>`;
    let d;
    try { d = await rpc('pakai.ringkas', bulanDiminta ? { bulan: bulanDiminta } : {}); }
    catch (e) { el.innerHTML = galatKotak(e.message); return; }

    const tabel = (judul, baris) => `
      <div class="card" style="margin-top:14px">
        <h3 style="font-size:15px;margin-bottom:10px">${H(judul)}</h3>
        ${baris.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nama</th><th class="ta-c">Panggilan</th><th class="ta-r">Token masuk</th><th class="ta-r">Token keluar</th></tr></thead>
          <tbody>${baris.map((r) => `<tr><td>${H(r.nama)}</td><td class="ta-c">${fmtAngka(r.panggilan)}</td>
            <td class="ta-r">${fmtAngka(r.masuk)}</td><td class="ta-r">${fmtAngka(r.keluar)}</td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="muted" style="font-size:13px">Belum ada catatan.</div>`}
      </div>`;

    const kpi = (label, nilai, warna, kecil) => `<div class="kpi-v2 kpi-diam" style="--kpi-accent:${warna}">
      <div class="kpi-v2-top"><div class="kpi-v2-label">${H(label)}</div></div>
      <div class="kpi-v2-value">${H(nilai)}</div>
      ${kecil ? `<div class="kpi-v2-nilai-kecil">${H(kecil)}</div>` : ''}</div>`;

    el.innerHTML = `
      <div class="card">
        <div class="fund-alat" style="margin-bottom:12px">
          <label style="font-size:12.5px">Bulan
            <select id="pkBulan" style="margin-left:6px">
              ${(d.daftarBulan.length ? d.daftarBulan : [d.bulan]).map((b) => `<option value="${H(b)}"${b === d.bulan ? ' selected' : ''}>${H(b)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="fund-kpi">
          ${kpi('Panggilan', fmtAngka(d.ringkas.panggilan), 'var(--accent)')}
          ${kpi('Token masuk', fmtAngka(d.ringkas.masuk), 'var(--blue)')}
          ${kpi('Token keluar', fmtAngka(d.ringkas.keluar), 'var(--green)')}
          ${kpi('Total token', fmtAngka(d.ringkas.masuk + d.ringkas.keluar), 'var(--purple)')}
        </div>
      </div>
      ${tabel('Per model', d.perModel)}
      ${tabel('Per pengguna', d.perPengguna)}`;

    /* Ganti bulan menggambar ulang lewat FUNGSI YANG SAMA, bukan lewat jalur
       kedua. Dua jalur penggambaran untuk satu tampilan selalu berakhir
       berbeda — dan yang jarang dipakai itulah yang rusak diam-diam. */
    $('#pkBulan').onchange = (e) => { halaman.pakai.gambar(el, e.target.value); };
  },
};

// ============================================================ HALAMAN: PROVIDER
halaman.penyedia = {
  judul: 'Provider AI',
  sub: 'Khusus superadmin — di sinilah kunci API lembaga disimpan',
  async gambar(el) {
    if (!negara.superadmin) {
      el.innerHTML = `<div class="card">${kosong('Halaman ini hanya untuk superadmin.', '\u{1F512}')}</div>`;
      return;
    }
    el.innerHTML = `<div class="card">${rangka(3)}</div>`;
    let d;
    try { d = await rpc('penyedia.daftar'); }
    catch (e) { el.innerHTML = galatKotak(e.message); return; }

    const bentuk = d.bentuk || {};
    el.innerHTML = `
      <div class="card">
        <div class="ai-info"><b>Kunci API tidak pernah dikirim balik ke layar ini.</b>
          Yang terlihat hanya empat huruf terakhirnya. Kunci disimpan di basis data lembaga,
          bukan di kode program, dan tidak pernah ikut masuk ke repositori.</div>
        <div class="fund-alat" style="margin:12px 0">
          <div class="muted" style="flex:1;font-size:12.5px">Satu provider dipakai sebagai <b>aktif</b>; yang lain jadi cadangan.</div>
          <button type="button" class="btn btn-primary btn-sm" id="pvBaru">Tambah provider</button>
        </div>
        <div id="pvIsi"></div>
      </div>`;

    const gambarDaftar = (dd) => {
      const wadah = $('#pvIsi');
      if (!dd.baris.length) { wadah.innerHTML = kosong('Belum ada provider. Tambahkan satu agar asisten bisa menjawab.', '\u{1F50C}'); return; }
      wadah.innerHTML = `<div class="ai-kartu-grid">${dd.baris.map((p) => `
        <article class="ai-kartu${p.id === dd.aktif ? ' pilih' : ''}">
          <div class="ai-kartu-kepala">
            <div class="ai-kartu-judul">${H(p.nama)}</div>
            <span class="badge ${p.id === dd.aktif ? 'green' : 'grey'}">${p.id === dd.aktif ? 'aktif' : 'cadangan'}</span>
          </div>
          <p class="ai-kartu-isi">${H((bentuk[p.bentuk] && bentuk[p.bentuk].label) || p.bentuk)} · <b>${H(p.model)}</b><br>
            ${(p.modelLain || []).length ? `Model lain: ${H((p.modelLain || []).join(', '))}<br>` : ''}
            ${H(p.url)}<br>
            Kunci: ${p.kunciTerpasang ? `terpasang (…${H(p.kunciEkor)})` : '<b style="color:var(--red)">belum diisi</b>'}
            · suhu ${H(p.suhu)} · maks ${fmtAngka(p.maksToken)} token
            · ${p.dukungGambar === false ? 'teks saja' : 'bisa baca gambar'}</p>
          <div class="ai-kartu-kaki">
            <span class="muted">${H(p.catatan || '')}</span>
            <span class="ai-kartu-aksi">
              ${p.id === dd.aktif ? '' : `<button type="button" class="btn btn-sm" data-aktif="${H(p.id)}">Jadikan aktif</button>`}
              <button type="button" class="btn btn-sm" data-uji="${H(p.id)}">Uji</button>
              <button type="button" class="btn btn-sm" data-ubah="${H(p.id)}">Ubah</button>
              <button type="button" class="btn btn-sm btn-danger" data-hapus="${H(p.id)}">Hapus</button>
            </span>
          </div>
        </article>`).join('')}</div>`;

      $$('[data-aktif]', wadah).forEach((b) => {
        b.onclick = async () => {
          try { const h = await rpc('penyedia.aktif', { id: b.dataset.aktif }); toast(h.pesan); await segarkan(); await muatStatus(); }
          catch (e) { toast(e.message, 'galat'); }
        };
      });
      $$('[data-uji]', wadah).forEach((b) => {
        b.onclick = async () => {
          b.disabled = true; const lama = b.textContent; b.textContent = 'Menguji…';
          try { const h = await rpc('penyedia.uji', { id: b.dataset.uji }); toast(h.pesan); }
          catch (e) { toast(e.message, 'galat'); }
          finally { b.disabled = false; b.textContent = lama; }
        };
      });
      $$('[data-ubah]', wadah).forEach((b) => {
        b.onclick = () => formulir(dd.baris.find((x) => x.id === b.dataset.ubah));
      });
      $$('[data-hapus]', wadah).forEach((b) => {
        b.onclick = () => {
          const p = dd.baris.find((x) => x.id === b.dataset.hapus);
          konfirmasi(`Hapus provider "${p.nama}"?`,
            'Kunci API-nya ikut terhapus. Percakapan lama tetap tersimpan, tetapi tidak bisa dilanjutkan dengan provider ini.',
            async () => {
              try { const h = await rpc('penyedia.hapus', { id: p.id }); toast(h.pesan); await segarkan(); await muatStatus(); }
              catch (e) { toast(e.message, 'galat'); }
            }, 'Hapus provider');
        };
      });
    };

    const segarkan = async () => { const lagi = await rpc('penyedia.daftar'); gambarDaftar(lagi); };

    const formulir = (p) => {
      const d0 = p || { nama: '', bentuk: 'openai', url: '', model: '', suhu: 0.4, maksToken: 2048, catatan: '', modelLain: [], dukungGambar: true };
      modal(p ? `Ubah provider — ${p.nama}` : 'Tambah provider',
        `<div class="field"><label>Nama</label><input id="pvNama" maxlength="60" value="${H(d0.nama)}" placeholder="Mis. OpenRouter Lazismu"></div>
         <div class="field"><label>Bentuk API</label><select id="pvBentuk">
           ${Object.keys(bentuk).map((k) => `<option value="${H(k)}"${k === d0.bentuk ? ' selected' : ''}>${H(bentuk[k].label)}</option>`).join('')}
         </select><div class="muted" id="pvKet" style="font-size:11.5px;margin-top:4px"></div></div>
         <div class="field"><label>Alamat (base URL)</label><input id="pvUrl" value="${H(d0.url)}" placeholder="https://…" autocomplete="off" spellcheck="false"></div>
         <div class="field"><label>Model utama</label><input id="pvModel" value="${H(d0.model)}" autocomplete="off" spellcheck="false"></div>
         <div class="field"><label>Model lain yang boleh dipilih <span class="muted">(pisahkan dengan koma)</span></label>
           <input id="pvModelLain" value="${H((d0.modelLain || []).join(', '))}" autocomplete="off" spellcheck="false">
           <div class="muted" id="pvContohModel" style="font-size:11.5px;margin-top:4px"></div></div>
         <div class="field"><label>Kunci API ${p && p.kunciTerpasang ? `<span class="muted">(terpasang …${H(p.kunciEkor)} — kosongkan bila tidak ingin mengubah)</span>` : ''}</label>
           <input id="pvKunci" type="password" autocomplete="new-password" spellcheck="false" placeholder="${p && p.kunciTerpasang ? '••••••••' : 'sk-…'}"></div>
         <div class="field ai-field-baris">
           <label style="font-size:12.5px">Suhu <input id="pvSuhu" type="number" step="0.1" min="0" max="2" value="${H(d0.suhu)}" style="width:80px"></label>
           <label style="font-size:12.5px">Maks token <input id="pvMaks" type="number" min="64" max="32000" value="${H(d0.maksToken)}" style="width:100px"></label>
         </div>
         <div class="field">
           <label class="set-switch"><input type="checkbox" id="pvGambar"${d0.dukungGambar === false ? '' : ' checked'}>
             <span>Model di provider ini bisa membaca gambar</span></label>
           <div class="muted" style="font-size:11.5px;margin-top:4px">Matikan bila modelnya hanya menerima teks — tanpa ini, foto yang dikirim akan ditolak provider dengan pesan yang membingungkan.</div>
         </div>
         <div class="field"><label>Catatan</label><input id="pvCatatan" maxlength="300" value="${H(d0.catatan || '')}"></div>`,
        () => {
          const sel = $('#pvBentuk');
          const ket = $('#pvKet');
          const perbarui = () => {
            const b = bentuk[sel.value] || {};
            ket.textContent = b.keterangan || '';
            if (!$('#pvUrl').value) $('#pvUrl').placeholder = b.contohUrl || 'https://…';
            if (!$('#pvModel').value) $('#pvModel').placeholder = b.contohModel || '';
            const contoh = $('#pvContohModel');
            if (contoh) contoh.textContent = b.contohModelLain ? `Contoh: ${b.contohModelLain}` : '';
          };
          sel.onchange = perbarui;
          perbarui();
          $('#pvBatal').onclick = tutupModal;
          $('#pvSimpan').onclick = async () => {
            const data = {
              id: p ? p.id : undefined,
              nama: $('#pvNama').value.trim(),
              bentuk: sel.value,
              url: $('#pvUrl').value.trim(),
              model: $('#pvModel').value.trim(),
              suhu: Number($('#pvSuhu').value),
              maksToken: Number($('#pvMaks').value),
              modelLain: $('#pvModelLain').value,
              dukungGambar: $('#pvGambar').checked,
              catatan: $('#pvCatatan').value.trim(),
            };
            const k = $('#pvKunci').value.trim();
            if (k) data.kunci = k;
            try {
              await rpc('penyedia.simpan', data);
              tutupModal();
              toast('Provider disimpan.');
              await segarkan();
              await muatStatus();
            } catch (e) { toast(e.message, 'galat'); }
          };
        },
        '<button class="btn" id="pvBatal" type="button">Batal</button>'
        + '<button class="btn btn-primary" id="pvSimpan" type="button">Simpan</button>');
    };

    $('#pvBaru').onclick = () => formulir(null);
    gambarDaftar(d);
  },
};

// ============================================================ status & kerangka
async function muatStatus() {
  const s = await rpc('ai.status');
  negara.pengguna = s.pengguna;
  negara.izin = s.izin || [];
  negara.superadmin = !!s.superadmin;
  negara.persona = s.persona || [];
  negara.penyediaAktif = s.penyediaAktif;
  negara.adaPenyedia = !!s.adaPenyedia;
  negara.pengetahuan = s.pengetahuan;
  negara.upstash = s.upstash;
  negara.daftarModel = s.model || [];
  if (s.lampiran) negara.aturLampiran = s.lampiran;
  if (!negara.pilihan.model) {
    const baku = negara.daftarModel.find((m) => m.baku) || negara.daftarModel[0];
    if (baku) negara.pilihan = { penyediaId: baku.penyediaId, model: baku.model };
  }

  $('#uName').textContent = s.pengguna.nama;
  $('#uRole').textContent = s.pengguna.peran + (s.superadmin ? ' · superadmin' : '');
  $('#uAvatar').textContent = inisial(s.pengguna.nama);
  /* Nama model TIDAK lagi ditaruh di bilah kiri. Di situ ia terpotong jadi dua
     baris saat bilahnya dilebarkan, hilang sama sekali saat dikuncupkan, dan
     jauh dari tempat orang memilihnya. Sekarang ia jadi tombol di kotak chat —
     terbaca dan bisa diklik untuk berganti. Lencana ini hanya menyala kalau
     ada yang perlu diberitahukan. */
  const ll = $('#lencanaLingkup');
  if (ll) {
    if (!s.adaPenyedia) {
      ll.textContent = 'belum ada provider';
      ll.title = 'Superadmin perlu menambahkan provider AI';
      ll.className = 'badge grey';
      ll.hidden = false;
    } else {
      ll.hidden = true;
    }
  }
  gambarChipModel();
  return s;
}

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

function halamanPertama() {
  const urut = MENU.filter(menuBoleh);
  return urut.length ? urut[0].kode : 'chat';
}

async function buka(kode) {
  const adaDanBoleh = halaman[kode] && menuBoleh(MENU.find((m) => m.kode === kode) || { izin: '' });
  const pakaiKode = adaDanBoleh ? kode : halamanPertama();
  const h = halaman[pakaiKode] || halaman.chat;
  negara.halaman = pakaiKode;
  tandaiMenu(pakaiKode);

  /* Halaman Percakapan memakai seluruh tinggi layar dan mengatur gulirnya
     sendiri; halaman lain memakai tata letak biasa. Saklarnya satu kelas di
     akar aplikasi supaya tidak ada dua aturan padding yang saling menimpa. */
  $('#appView').classList.toggle('ai-penuh', !!h.penuh);

  window.scrollTo({ top: 0 });
  if (h.penuh) {
    $('#isi').innerHTML = '';
  } else {
    $('#isi').innerHTML = kepalaHalaman(h.judul, h.sub) + '<div id="isiHalaman"></div>';
    const tt = $('#tombolTema');
    if (tt) tt.onclick = () => { terapkanTema(!temaGelap()); segarTema(tt); };
  }
  mulaiSibuk();
  try { await h.gambar(h.penuh ? $('#isi') : $('#isiHalaman')); }
  finally { selesaiSibuk(); }
  if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
}

(async function mulai() {
  try { terapkanTema(localStorage.getItem('laz_theme') === 'dark'); } catch (_) {}
  try { if (localStorage.getItem('sidebar_collapsed') === 'true') $('#appView').classList.add('collapsed'); } catch (_) {}

  $('#tombolKembali').onclick = () => { location.href = '/index.html'; };
  $('#chipPengguna').onclick = () => { location.hash = '#pakai'; };
  document.addEventListener('visibilitychange', () => {
    $$('.lz').forEach((el) => el.classList.toggle('lz-jeda', document.hidden));
  });
  $('#modalBg').onclick = (e) => { if (e.target.id === 'modalBg') tutupModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { tutupModal(); tutupMenu(); } });

  try { await muatStatus(); }
  catch (_) { location.href = '/index.html'; return; }

  document.title = 'AI Asisten — LAZ Digital';
  gambarMenu();
  window.addEventListener('hashchange', () => buka(location.hash.slice(1) || 'chat'));

  try { await buka(location.hash.slice(1) || 'chat'); }
  catch (e) { $('#isi').innerHTML = kepalaHalaman('AI Asisten', '') + galatKotak(e.message || 'Halaman gagal dimuat'); }
  finally { selesaiMemuat(); }
})();
