/* app.js — antarmuka Blast Uyeee
   Tanpa langkah build: seluruh tampilan dirakit di sisi klien dan
   seluruh data diambil lewat satu pintu /api/blast. */

// ============================================================ perkakas kecil
const $ = (s, induk = document) => induk.querySelector(s);
const $$ = (s, induk = document) => Array.from(induk.querySelectorAll(s));

const H = (teks) => String(teks === undefined || teks === null ? '' : teks)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const negara = { pengguna: null, izin: [], setelan: null, status: null, halaman: 'dasbor' };

/* Token LAZDigital. Blast menumpang sesi yang sama, jadi petugas cukup
   masuk sekali di LAZDigital dan halaman ini ikut terbuka. Kalau tokennya
   tidak ada, berarti belum masuk — dikembalikan ke halaman utama, bukan
   menampilkan borang masuk kedua. */
function tokenLaz() {
  try { return localStorage.getItem('laz_token') || ''; } catch (e) { return ''; }
}

async function rpc(tindakan, data = {}) {
  const res = await fetch('/api/blast', {
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

const bisa = (izin) => negara.izin.includes('*') || negara.izin.includes(izin);

/* Toast, modal, dan dialog konfirmasi memakai kerangka yang sama persis dengan
   halaman utama LAZDigital — elemen dan nama kelas yang sama, bukan tiruan.
   Yang paling cepat membuat sebuah halaman terasa "bukan bagian dari aplikasi
   ini" justru bagian-bagian kecil begini: posisi toast, lengkung sudut modal,
   dan letak tombolnya. */
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
  modal(judul, `<p class="muted" style="font-size:13.5px">${H(pesan)}</p>`, (el) => {
    $('#kBatal').onclick = tutupModal;
    $('#kYa').onclick = async () => { tutupModal(); await saatYa(); };
  }, `<button class="btn" id="kBatal" type="button">Batal</button>
      <button class="btn btn-danger" id="kYa" type="button">${H(labelYa)}</button>`);
}

const fmtAngka = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtRupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
function fmtWaktu(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtJarak(iso) {
  if (!iso) return '—';
  const detik = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (detik < 60) return 'baru saja';
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  return fmtWaktu(iso);
}

/* Warna lencana memakai kosakata .badge LAZDigital, bukan palet sendiri.
   "diserahkan" adalah status baru: pesan sudah diberikan ke gateway tetapi
   WhatsApp belum mengonfirmasi — sengaja dibedakan warnanya dari "terkirim"
   supaya tidak terbaca sebagai sudah sampai. */
const LENCANA_STATUS = {
  antre: '',
  diserahkan: 'purple',
  terkirim: 'blue',
  sampai: 'green',
  dibaca: 'green',
  gagal: 'red',
  dibatalkan: '',
  masuk: 'amber',
  tersambung: 'green',
  terputus: 'red',
  menunggu: 'amber',
  memindai: 'amber',
};
/* Centang WhatsApp, digambar sendiri supaya artinya sama persis dengan yang
   dilihat donatur di HP-nya: satu centang = sampai di server, dua centang =
   sampai di HP, dua centang biru = sudah dibaca. */
function centang(jumlah, biru) {
  const warna = biru ? '#2196f3' : 'currentColor';
  const satu = (geser) => `<path d="M1.5 ${geser} 4 ${geser + 2.5} 9 ${geser - 2.5}" />`;
  return `<svg viewBox="0 0 ${jumlah > 1 ? 14 : 11} 12" width="${jumlah > 1 ? 16 : 13}" height="12" fill="none"
    stroke="${warna}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    style="vertical-align:-1px" aria-hidden="true">
    ${satu(7)}${jumlah > 1 ? '<path d="M5.5 7 8 9.5 13 4.5" />' : ''}</svg>`;
}
const CENTANG = { terkirim: centang(1, false), sampai: centang(2, false), dibaca: centang(2, true) };
const persen = (bagian, dari) => (dari > 0 ? Math.round((bagian / dari) * 100) + '%' : '—');

const lencana = (teks) => `<span class="badge ${LENCANA_STATUS[teks] || ''}">${CENTANG[teks] ? CENTANG[teks] + ' ' : ''}${H(teks)}</span>`;

const kartu = (isi, kelas = '') => `<section class="card ${kelas}">${isi}</section>`;

function kosong(pesan, ikon = '\u{1F5C2}\uFE0F') {
  return `<div class="empty"><div class="big">${ikon}</div><p>${H(pesan)}</p></div>`;
}
function galatKotak(pesan) {
  return `<div class="card" style="border-color:var(--red);background:var(--red-bg);color:var(--red)">
    <strong style="display:block;margin-bottom:4px">Tidak dapat memuat data</strong>${H(pesan)}</div>`;
}
const rangka = (n = 5) => `<div style="display:grid;gap:8px;padding:4px 0">${Array.from({ length: n }, () =>
  '<div class="rangka" style="height:40px"></div>').join('')}</div>`;

/* Judul halaman memakai .page-head, bentuk yang sama dengan seluruh halaman
   LAZDigital, supaya tinggi dan jaraknya tidak meleset saat berpindah. */
const kepalaHalaman = (judul, keterangan, aksi = '') =>
  `<div class="page-head"><div><h2>${H(judul)}</h2>${keterangan ? `<div class="desc">${H(keterangan)}</div>` : ''}</div>${aksi}</div>`;

// ============================================================ menu & kerangka
/* Ikon satu keluarga SVG garis (stroke currentColor), sama seperti menu
   LAZDigital. Emoji tidak dipakai: bentuknya berbeda di tiap sistem operasi,
   warnanya tidak ikut tema, dan berdampingan dengan ikon garis akan terlihat
   seperti dua aplikasi yang ditempel. */
function ikonNav(isi) {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" '
    + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + isi + '</svg>';
}
const IKON = {
  dasbor: ikonNav('<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>'),
  perangkat: ikonNav('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
  kirim: ikonNav('<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8z"/>'),
  massal: ikonNav('<path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l6 4.5V6L7 10.5H4.5A1.5 1.5 0 0 0 3 12"/><path d="M17 9.5a4 4 0 0 1 0 5"/><path d="M19.5 7a7.5 7.5 0 0 1 0 10"/>'),
  antrean: ikonNav('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  kontak: ikonNav('<circle cx="9.5" cy="8" r="3.2"/><path d="M3.5 19.5a6 6 0 0 1 12 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 14.4a6 6 0 0 1 3 5.1"/>'),
  templat: ikonNav('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9.5 12h5"/><path d="M9.5 16h5"/>'),
  webhook: ikonNav('<path d="M10 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L11 7.5"/><path d="M14 10.5a3.5 3.5 0 0 0-5 0L6.5 13a3.5 3.5 0 0 0 5 5l1.5-1.5"/>'),
  pengguna: ikonNav('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  audit: ikonNav('<path d="M12 3l7.5 3v5.5c0 4.3-3 8.2-7.5 9.5-4.5-1.3-7.5-5.2-7.5-9.5V6z"/><path d="m9.2 12.2 2 2 3.6-3.6"/>'),
  setelan: ikonNav('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3.4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
};

const MENU = [
  { kode: 'dasbor', label: 'Dasbor', izin: 'dasbor' },
  { kode: 'perangkat', label: 'Perangkat', izin: 'perangkat.lihat' },
  { kode: 'kirim', label: 'Kirim Pesan', izin: 'pesan.kirim' },
  { kode: 'massal', label: 'Kiriman Massal', izin: 'massal.kelola' },
  { kode: 'antrean', label: 'Pesan & Antrean', izin: 'pesan.lihat' },
  { kode: 'kontak', label: 'Kontak', izin: 'kontak.lihat' },
  { kode: 'templat', label: 'Templat Pesan', izin: 'pesan.lihat' },
  { kode: 'webhook', label: 'Webhook', izin: 'setelan.lihat' },
  { kode: 'pengguna', label: 'Tim & Petugas', izin: 'pengguna.lihat' },
  { kode: 'audit', label: 'Catatan Audit', izin: 'audit.lihat' },
  { kode: 'setelan', label: 'Pengaturan', izin: 'setelan.lihat' },
];

function gambarMenu() {
  const nav = $('#nav');
  nav.innerHTML = '';
  MENU.filter((m) => bisa(m.izin)).forEach((m) => {
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

/* ================= perkakas komposer: penanda nama & lampiran =============
 *
 * Penggantian {{nama}} per kontak sebenarnya sudah jalan sejak awal — tiap
 * pesan diisi dengan nama kontaknya masing-masing saat masuk antrean. Yang
 * tidak ada adalah sesuatu yang MEMBERITAHU petugas bahwa penandanya ada.
 * Tanpa itu, fiturnya sama saja dengan tidak ada.
 */
const PENANDA = [
  { tulis: '{{nama}}', jelas: 'nama kontak' },
  { tulis: '{{kantor}}', jelas: 'kantor kontak' },
];

const kepingPenanda = () => `
  <div class="row" style="gap:6px;margin-top:6px;align-items:center">
    <span class="muted" style="font-size:11.5px">Sisipkan:</span>
    ${PENANDA.map((p) => `<button type="button" class="keping" data-sisip="${p.tulis}" title="Diganti dengan ${p.jelas} tiap penerima">${p.tulis}</button>`).join('')}
  </div>`;

/* Petugas menyusun kalimatnya dulu, baru memutuskan di mana namanya muncul:
   "Assalamualaikum {{nama}}, terima kasih…". Jadi penandanya harus masuk TEPAT
   di posisi kursor, bukan ditempel di ujung pesan. */
function sisipDiKursor(area, penanda) {
  const teks = area.value || '';
  const a = (area.selectionStart == null) ? teks.length : area.selectionStart;
  const b = (area.selectionEnd == null) ? a : area.selectionEnd;
  area.value = teks.slice(0, a) + penanda + teks.slice(b);
  const posBaru = a + penanda.length;
  area.focus();
  try { area.setSelectionRange(posBaru, posBaru); } catch (e) { /* peramban lama */ }
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

function pasangKeping(el, area) {
  $$('[data-sisip]', el).forEach((b) => {
    b.onclick = () => sisipDiKursor(area, b.dataset.sisip);
  });
}

const JENIS_LAMPIRAN = '.pdf,.jpg,.jpeg,.png,.webp,.mp4,.mp3,.doc,.docx,.xls,.xlsx';
const BATAS_LAMPIRAN_MB = 3;

const kotakLampiran = (idAwalan) => `
  <div class="field">
    <label>Lampiran <span class="muted" style="font-weight:400">(opsional)</span></label>
    <input type="file" id="${idAwalan}Berkas" accept="${JENIS_LAMPIRAN}">
    <input type="hidden" name="berkasId" id="${idAwalan}BerkasId">
    <div class="muted" id="${idAwalan}BerkasKet" style="font-size:11.5px;margin-top:4px">
      PDF, gambar, Word, Excel, MP4, MP3 &middot; maksimal ${BATAS_LAMPIRAN_MB} MB.
    </div>
  </div>`;

/* Mengunggah lampiran begitu dipilih, bukan saat tombol kirim ditekan.
   Unggahan yang menumpang tombol kirim membuat satu klik bisa menggantung
   setengah menit tanpa penjelasan, dan kalau gagal, pesannya ikut hilang. */
function pasangLampiran(el, idAwalan) {
  const pilih = $('#' + idAwalan + 'Berkas', el);
  const simpan = $('#' + idAwalan + 'BerkasId', el);
  const ket = $('#' + idAwalan + 'BerkasKet', el);
  if (!pilih) return;
  const bawaan = ket.innerHTML;

  pilih.onchange = async () => {
    const f = pilih.files && pilih.files[0];
    simpan.value = '';
    if (!f) { ket.innerHTML = bawaan; return; }
    if (f.size > BATAS_LAMPIRAN_MB * 1024 * 1024) {
      ket.innerHTML = `<span style="color:var(--red)">Berkas ${(f.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${BATAS_LAMPIRAN_MB} MB. Kecilkan dulu, atau cukup tulis tautannya di dalam pesan.</span>`;
      pilih.value = '';
      return;
    }
    ket.textContent = 'Mengunggah ' + f.name + '…';
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = () => rej(new Error('Berkas tidak terbaca'));
        r.readAsDataURL(f);
      });
      const h = await rpc('berkas.unggah', { nama: f.name, tipe: f.type || 'application/octet-stream', base64 });
      simpan.value = h.berkas.id;
      ket.innerHTML = `Siap dikirim: <strong>${H(h.berkas.nama)}</strong> (${Math.max(1, Math.round(h.berkas.byte / 1024))} KB)`;
    } catch (e) {
      simpan.value = '';
      pilih.value = '';
      ket.innerHTML = `<span style="color:var(--red)">${H(e.message)}</span>`;
    }
  };
}

/* Layar pemindaian QR.
 *
 * Sebelumnya layar ini sekali tembak: begitu tombol ditekan, ia menanyakan QR
 * lalu langsung menyerah. Padahal QR-nya belum ada — perintahnya baru dititipkan
 * dan gateway baru mengambilnya beberapa detik kemudian. Akibatnya petugas
 * menekan tombol berkali-kali, dan setiap tekanan membuka sambungan baru yang
 * MEMBATALKAN QR sebelumnya, jadi pemindaian tidak pernah selesai.
 *
 * Sekarang perintahnya dikirim SEKALI, lalu layar ini hanya menanyakan keadaan
 * sampai QR-nya datang — dan berhenti sendiri begitu tersambung.
 */
async function bukaLayarQR(id, gantiNomor) {
  let berhenti = false;
  /* muatUlang() hanya ada di dalam halaman Perangkat, sedangkan fungsi ini
     berdiri di luar. Jadi penyegarannya lewat wadah halaman yang sedang
     terbuka — dan kalau petugas keburu pindah halaman, tidak terjadi apa-apa. */
  const segarkan = () => {
    const wadah = $('#isiHalaman');
    if (wadah && negara.halaman === 'perangkat') halaman.perangkat.gambar(wadah).catch(() => {});
  };
  const tutupDanBerhenti = () => { berhenti = true; tutupModal(); segarkan(); };

  modal(gantiNomor ? 'Ganti nomor WhatsApp' : 'Sambungkan WhatsApp', `
    <div id="qrIsi" style="text-align:center;padding:8px 0">
      <div class="rangka" style="width:264px;height:264px;margin:0 auto;border-radius:var(--radius)"></div>
      <p class="muted" id="qrPesan" style="margin-top:14px">Menghubungi gateway…</p>
    </div>`, null,
    '<button class="btn" id="qrTutup" type="button">Tutup</button>');
  $('#qrTutup').onclick = tutupDanBerhenti;

  const tulis = (isiHtml, pesan) => {
    const w = $('#qrIsi');
    if (!w) { berhenti = true; return; }   // modal sudah ditutup petugas
    w.innerHTML = isiHtml + `<p class="muted" id="qrPesan" style="margin-top:14px;font-size:12px">${H(pesan)}</p>`;
  };

  try {
    await rpc(gantiNomor ? 'perangkat.gantiNomor' : 'perangkat.sambung', { id });
  } catch (e) {
    tulis('', e.message);
    return;
  }

  const mulai = Date.now();
  const BATAS_MS = 3 * 60 * 1000;   // QR WhatsApp berganti tiap ~20 detik; 3 menit sudah lebih dari cukup
  while (!berhenti) {
    await new Promise((r) => setTimeout(r, 2000));
    if (berhenti) return;
    let h;
    try { h = await rpc('perangkat.periksa', { id }); } catch (e) { continue; }
    if (berhenti) return;

    if (h.status === 'tersambung') {
      tulis('<div style="font-size:40px">✓</div>',
        h.nomor ? `Tersambung sebagai ${h.nomor}.` : 'Tersambung.');
      toast('Perangkat tersambung.', 'sukses');
      setTimeout(tutupDanBerhenti, 1400);
      return;
    }
    if (h.qr) {
      tulis(`<img src="${H(h.qr)}" alt="Kode QR" style="display:block;margin:0 auto;max-width:100%;border:1px solid var(--border);border-radius:var(--radius)">`,
        'Buka WhatsApp di ponsel → Perangkat Tertaut → Tautkan Perangkat, lalu pindai kode ini.');
    } else if (Date.now() - mulai > 25000) {
      tulis('<div class="rangka" style="width:264px;height:264px;margin:0 auto;border-radius:var(--radius)"></div>',
        h.keterangan || 'Gateway belum menjawab. Pastikan jendela gateway di komputer kantor masih terbuka.');
    }

    if (Date.now() - mulai > BATAS_MS) {
      tulis('', 'Sudah tiga menit belum ada yang memindai. Tutup layar ini, lalu coba lagi kalau sudah siap.');
      return;
    }
  }
}

// ============================================================ halaman
const halaman = {};

// ---------------------------------------------------------------- Dasbor
halaman.dasbor = {
  judul: 'Dasbor',
  sub: 'Ringkasan kegiatan komunikasi hari ini',
  async gambar(el) {
    el.innerHTML = rangka(4);
    let d;
    try { d = await rpc('dasbor.ringkas'); } catch (e) { el.innerHTML = galatKotak(e.message); return; }

    /* Judulnya memuat gambar centang, jadi tidak boleh dilolos-HTML — nilainya
       datang dari daftar tetap di atas, bukan dari masukan siapa pun.
       Keterangannya sengaja pendek: enam ubin dalam satu baris hanya terbaca
       kalau tiap barisnya muat tanpa dipotong. */
    const tile = (judul, nilai, catatan, warna) => `
      <div class="stat">
        <div class="lbl">${judul}</div>
        <div class="val"${warna ? ` style="color:${warna}"` : ''}>${H(nilai)}</div>
        <div class="ket">${H(catatan)}</div>
      </div>`;

    const maks = Math.max(1, ...d.grafik.map((g) => g.total));
    const grafik = d.grafik.map((g) => {
      const t = Math.round((g.total / maks) * 100);
      return `<div class="col" style="height:100%" title="${g.tanggal}: ${g.total} pesan">
        <div class="b1" style="height:${Math.max(2, t)}%"></div>
        <span class="lab">${g.tanggal.slice(8)}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="ringkas">
        ${tile('Terkirim hari ini', fmtAngka(d.hariIni.terkirim), `dari ${fmtAngka(d.hariIni.total)} pesan`)}
        ${tile(`${CENTANG.sampai} Sampai di HP`, fmtAngka(d.hariIni.sampai), `${persen(d.hariIni.sampai, d.hariIni.terkirim)} dari terkirim`)}
        ${tile(`${CENTANG.dibaca} Dibaca`, fmtAngka(d.hariIni.dibaca), `${persen(d.hariIni.dibaca, d.hariIni.terkirim)} dari terkirim`, d.hariIni.dibaca ? 'var(--green)' : '')}
        ${tile('Menunggu antrean', fmtAngka(d.antrean.antre), d.antrean.dalamJamKirim ? d.antrean.jamKirim : `di luar jam kirim`, d.antrean.antre ? 'var(--accent)' : '')}
        ${tile('Gagal kirim', fmtAngka(d.keseluruhan.gagal), 'perlu ditinjau', d.keseluruhan.gagal ? 'var(--red)' : '')}
        ${tile('Kontak', fmtAngka(d.kontak.total), 'penerima terdaftar')}
      </div>

      <div class="grid-2">
        ${kartu(`
          <h3>Pesan 14 hari terakhir</h3>
          <div class="desc">Seluruh pesan keluar, termasuk yang masih antre</div>
          <div class="spark">${grafik}</div>`)}

        ${kartu(`
          <h3>Perangkat pengirim</h3>
          <div style="margin-top:12px">
            ${d.perangkat.length ? d.perangkat.map((p) => `
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <span style="width:9px;height:9px;border-radius:50%;flex-shrink:0;background:var(${p.status === 'tersambung' ? '--green' : '--red'})"></span>
                <div style="min-width:0;flex:1">
                  <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(p.nama)}</div>
                  <div class="muted" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(p.nomor || 'nomor belum diisi')} · ${H(p.driver)}</div>
                </div>
                ${lencana(p.status)}
              </div>`).join('') : '<p class="muted">Belum ada perangkat.</p>'}
          </div>
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div class="muted" style="font-size:11.5px">Perkiraan biaya bulan ini</div>
            <div style="font-size:17px;font-weight:700${d.biaya.peringatan ? ';color:var(--red)' : ''}">${fmtRupiah(d.biaya.perkiraanBulanIni)}</div>
            ${d.biaya.peringatan ? '<div style="font-size:11.5px;color:var(--red);margin-top:4px">Saldo pengiriman menipis — segera isi ulang.</div>' : ''}
          </div>`)}
      </div>

      ${kartu(`<div class="row" style="align-items:center;flex-wrap:nowrap">
        <div style="flex:1;min-width:0">
          <h3>Jalankan antrean sekarang</h3>
          <div class="desc" style="margin-bottom:0">Biasanya berjalan otomatis. Tombol ini untuk memaksa satu putaran.</div>
        </div>
        <button id="prosesAntrean" class="btn btn-primary">Proses sekarang</button>
      </div>`)}

      <div id="kotakKesiapan"></div>`;

    if (bisa('setelan.lihat')) gambarKesiapan($('#kotakKesiapan', el));

    const tombol = $('#prosesAntrean', el);
    if (tombol) tombol.onclick = async () => {
      tombol.disabled = true; tombol.textContent = 'Memproses…';
      try {
        const { laporan } = await rpc('antrean.proses');
        toast(`Diproses ${laporan.diproses}, terkirim ${laporan.terkirim}, gagal ${laporan.gagal}.`, 'sukses');
        halaman.dasbor.gambar(el);
      } catch (e) { toast(e.message, 'galat'); tombol.disabled = false; tombol.textContent = 'Proses sekarang'; }
    };
  },
};

// Daftar periksa sebelum aplikasi dipakai sungguhan
async function gambarKesiapan(wadah) {
  if (!wadah) return;
  let d;
  try { d = await rpc('sistem.kesiapan'); } catch (_) { return; }
  const kurang = d.butir.filter((b) => !b.lolos);
  if (!kurang.length) {
    wadah.innerHTML = kartu(`<div class="row" style="align-items:center;gap:10px;flex-wrap:nowrap">
      <span style="font-size:20px">✅</span>
      <div>
        <div style="font-weight:700;color:var(--green)">Siap dipakai</div>
        <div class="muted" style="font-size:11.5px">Seluruh daftar periksa sebelum dipakai sungguhan sudah terpenuhi.</div>
      </div>
    </div>`);
    return;
  }
  wadah.innerHTML = kartu(`
    <h3>Sebelum dipakai sungguhan
      ${d.siapDeploy
        ? '<span class="badge green">syarat wajib terpenuhi</span>'
        : '<span class="badge red">ada syarat wajib yang belum</span>'}</h3>
    <ul style="list-style:none;display:grid;gap:12px;margin-top:14px">
      ${kurang.map((b) => `<li style="display:flex;gap:10px">
        <span style="flex-shrink:0">${b.wajib ? '⛔' : '⚠️'}</span>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:600">${H(b.label)}${b.wajib ? '' : ' <span class="muted" style="font-weight:400;font-size:11.5px">(tidak wajib)</span>'}</div>
          <div class="muted" style="font-size:12px">${H(b.saran)}</div>
        </div></li>`).join('')}
    </ul>
    <div class="muted" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:11.5px">${H(d.catatanCron)}</div>`);
}

// ---------------------------------------------------------------- Perangkat
halaman.perangkat = {
  judul: 'Perangkat',
  sub: 'Nomor WhatsApp yang dipakai mengirim',
  async gambar(el) {
    el.innerHTML = rangka(3);
    let d;
    try { d = await rpc('perangkat.daftar'); } catch (e) { el.innerHTML = galatKotak(e.message); return; }
    const bolehUbah = bisa('perangkat.ubah');

    el.innerHTML = `
      <div class="row" style="align-items:center;margin-bottom:16px;flex-wrap:nowrap">
        <p class="muted" style="flex:1;min-width:0">${d.baris.length} perangkat terdaftar</p>
        ${bolehUbah ? '<button id="tambahPerangkat" class="btn btn-primary">+ Tambah perangkat</button>' : ''}
      </div>
      ${d.baris.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">${d.baris.map((p) => `
        <section class="card" style="margin-bottom:0">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:var(--accent-soft);font-size:17px;flex-shrink:0">📱</div>
            <div style="min-width:0;flex:1">
              <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(p.nama)}</div>
              <div class="muted" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(p.nomor || 'nomor belum diisi')}</div>
            </div>
            ${lencana(p.status)}
          </div>
          <dl style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;font-size:12px">
            <div><dt class="muted">Pengirim</dt><dd style="font-weight:600">${H(p.driver)}</dd></div>
            <div><dt class="muted">Terpakai hari ini</dt><dd style="font-weight:600">${fmtAngka(p.terpakaiHariIni)}</dd></div>
          </dl>
          ${p.keterangan ? `<p class="muted" style="margin-top:10px;font-size:11.5px">${H(p.keterangan)}</p>` : ''}
          <div class="row" style="gap:8px;margin-top:14px">
            <button data-periksa="${p.id}" class="btn btn-sm">Periksa</button>
            ${bolehUbah ? `
              <button data-sambung="${p.id}" class="btn btn-sm btn-primary">Sambungkan</button>
              <button data-putus="${p.id}" class="btn btn-sm">Putuskan</button>
              <button data-gantinomor="${p.id}" data-nama="${H(p.nama)}" class="btn btn-sm">Ganti nomor</button>
              <button data-ubah="${p.id}" class="btn btn-sm">Ubah</button>
              <button data-hapus="${p.id}" class="btn btn-sm btn-danger">Hapus</button>` : ''}
          </div>
        </section>`).join('')}</div>`
      : kartu(kosong('Belum ada perangkat pengirim. Tambahkan satu untuk mulai mengirim pesan.', '📱'))}`;

    const muatUlang = () => halaman.perangkat.gambar(el);

    const formPerangkat = (p = null) => {
      modal(p ? 'Ubah perangkat' : 'Tambah perangkat', `
        <form id="fp">
          <div class="field">
            <label>Nama perangkat</label>
            <input name="nama" required value="${H(p ? p.nama : '')}" placeholder="mis. Nomor Layanan Donasi">
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Nomor WhatsApp</label>
              <input name="nomor" value="${H(p ? p.nomor : '')}" placeholder="08xxxxxxxxxx">
            </div>
            <div class="field">
              <label>Pengirim</label>
              <select name="driver">
                ${d.driver.map((v) => `<option value="${v.nama}" ${p && p.driver === v.nama ? 'selected' : ''}>${H(v.label)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Token <span class="muted" style="font-weight:400">(kosongkan bila tidak diubah)</span></label>
            <input name="token" type="password" placeholder="${p && p.token ? '••••••••' : 'token Fonnte / Meta'}">
            <div class="muted" style="font-size:11.5px;margin-top:4px">Mode sandbox tidak memerlukan token.</div>
          </div>
          <div class="field">
            <label>Keterangan</label>
            <input name="keterangan" value="${H(p ? p.keterangan : '')}">
          </div>
        </form>`, (wadah) => {
        $('#fpBatal').onclick = tutupModal;
        $('#fp', wadah).onsubmit = async (ev) => {
          ev.preventDefault();
          const f = new FormData(ev.target);
          const data = Object.fromEntries(f.entries());
          if (p) data.id = p.id;
          try {
            await rpc('perangkat.simpan', data);
            tutupModal(); toast('Perangkat tersimpan.', 'sukses'); muatUlang();
          } catch (e) { toast(e.message, 'galat'); }
        };
      }, `<button type="button" id="fpBatal" class="btn">Batal</button>
          <button type="submit" form="fp" class="btn btn-primary">Simpan</button>`);
    };

    const tombolTambah = $('#tambahPerangkat', el);
    if (tombolTambah) tombolTambah.onclick = () => formPerangkat();

    $$('[data-ubah]', el).forEach((b) => b.onclick = () => formPerangkat(d.baris.find((x) => x.id === b.dataset.ubah)));
    $$('[data-periksa]', el).forEach((b) => b.onclick = async () => {
      try {
        const h = await rpc('perangkat.periksa', { id: b.dataset.periksa });
        toast(`Status: ${h.status}. ${h.keterangan || ''}`.trim(), h.status === 'tersambung' ? 'sukses' : 'ingat');
        muatUlang();
      } catch (e) { toast(e.message, 'galat'); }
    });
    $$('[data-sambung]', el).forEach((b) => b.onclick = () => bukaLayarQR(b.dataset.sambung, false));
    $$('[data-gantinomor]', el).forEach((b) => b.onclick = () => konfirmasi(
      'Ganti nomor WhatsApp?',
      `Sesi nomor lama akan dikeluarkan dari perangkat "${b.dataset.nama}", lalu muncul QR untuk nomor baru. `
      + 'Pesan yang masih antre tetap menunggu dan akan dikirim lewat nomor yang baru.',
      async () => { await bukaLayarQR(b.dataset.gantinomor, true); }, 'Ya, ganti nomor'));
    $$('[data-putus]', el).forEach((b) => b.onclick = () => konfirmasi(
      'Putuskan perangkat?',
      'Pesan yang masih antre akan menunggu sampai perangkat tersambung kembali.',
      async () => {
        try { await rpc('perangkat.putus', { id: b.dataset.putus }); toast('Perangkat diputuskan.', 'ingat'); muatUlang(); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, putuskan'));
    $$('[data-hapus]', el).forEach((b) => b.onclick = () => konfirmasi(
      'Hapus perangkat?',
      'Tindakan ini tidak dapat dibatalkan. Riwayat pesannya tetap tersimpan.',
      async () => {
        try { const h = await rpc('perangkat.hapus', { id: b.dataset.hapus }); toast(h.pesan, 'sukses'); muatUlang(); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, hapus'));
  },
};

// ---------------------------------------------------------------- Kirim pesan
halaman.kirim = {
  judul: 'Kirim Pesan',
  sub: 'Satu pesan ke satu nomor',
  async gambar(el) {
    el.innerHTML = rangka(3);
    let perangkat, templat;
    try {
      [perangkat, templat] = await Promise.all([rpc('perangkat.daftar'), rpc('templat.daftar')]);
    } catch (e) { el.innerHTML = galatKotak(e.message); return; }

    el.innerHTML = `
      <div class="grid-2">
        ${kartu(`
          <form id="fk">
            <div class="grid-2">
              <div class="field">
                <label>Perangkat pengirim</label>
                <select name="perangkatId" required>
                  ${perangkat.baris.map((p) => `<option value="${p.id}">${H(p.nama)} — ${H(p.status)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Nomor tujuan</label>
                <input name="nomor" required placeholder="08xxxxxxxxxx" inputmode="tel">
              </div>
            </div>
            <div class="field">
              <div class="row" style="align-items:center;gap:8px;flex-wrap:nowrap">
                <label style="margin-bottom:0;white-space:nowrap">Isi pesan</label>
                <span style="margin-left:auto;width:220px;max-width:58%">
                <select id="pilihTemplat">
                  <option value="">— pakai templat —</option>
                  ${templat.baris.map((t) => `<option value="${t.id}">${H(t.nama)}</option>`).join('')}
                </select>
                </span>
              </div>
              <textarea name="teks" rows="9" required placeholder="Assalamu'alaikum {{nama}}, ..."></textarea>
              ${kepingPenanda()}
              <div class="muted" style="font-size:11.5px;margin-top:4px">Penanda diganti sendiri dengan data kontak penerima. Kontak tanpa nama disapa &ldquo;Bapak/Ibu&rdquo;.</div>
            </div>
            ${kotakLampiran('fk')}
            <button class="btn btn-primary btn-block">Masukkan ke antrean kirim</button>
          </form>`)}

        ${kartu(`
          <h3>Pratinjau</h3>
          <div style="margin-top:14px;border-radius:var(--radius);background:#e6ddd4;padding:14px">
            <div id="pratinjau" style="margin-left:auto;max-width:85%;border-radius:var(--radius);border-top-right-radius:4px;background:#d9fdd3;padding:10px 14px;font-size:13px;color:#1f2937;white-space:pre-wrap;overflow-wrap:break-word">Isi pesan akan tampil di sini…</div>
          </div>
          <div style="margin-top:16px;border-radius:var(--radius);background:var(--accent-soft);padding:14px;font-size:12px;color:var(--text2)">
            <div style="font-weight:700;color:var(--accent-d);margin-bottom:4px">Ingat</div>
            Pesan dikirim dengan jeda aman dan hanya pada jam kirim yang diatur. Nomor di daftar hitam akan ditolak.
          </div>`)}
      </div>`;

    const area = $('[name=teks]', el);
    const pratinjau = $('#pratinjau', el);
    /* Pratinjau memakai contoh nama sungguhan, bukan menampilkan {{nama}} mentah:
       yang perlu dilihat petugas adalah kalimat yang AKAN diterima donatur. */
    const perbarui = () => {
      const isi = area.value || '';
      pratinjau.textContent = isi
        ? isi.replace(/\{\{\s*nama\s*\}\}/g, 'Bapak Budi').replace(/\{\{\s*kantor\s*\}\}/g, 'KLL Sewon')
        : 'Isi pesan akan tampil di sini…';
    };
    area.addEventListener('input', perbarui);
    pasangKeping(el, area);
    pasangLampiran(el, 'fk');

    $('#pilihTemplat', el).onchange = (ev) => {
      const t = templat.baris.find((x) => x.id === ev.target.value);
      if (t) { area.value = t.isi; perbarui(); }
    };

    $('#fk', el).onsubmit = async (ev) => {
      ev.preventDefault();
      const tombol = ev.target.querySelector('button');
      tombol.disabled = true; tombol.textContent = 'Mengantre…';
      try {
        const data = Object.fromEntries(new FormData(ev.target).entries());
        const h = await rpc('pesan.kirim', data);
        toast(h.catatan, 'sukses');
        ev.target.reset(); perbarui();
      } catch (e) { toast(e.message, 'galat'); }
      tombol.disabled = false; tombol.textContent = 'Masukkan ke antrean kirim';
    };
  },
};

// ---------------------------------------------------------------- Massal
halaman.massal = {
  judul: 'Kiriman Massal',
  sub: 'Kirim ke satu segmen kontak sekaligus',
  async gambar(el) {
    el.innerHTML = rangka(4);
    let perangkat, templat, kontak, daftar;
    try {
      [perangkat, templat, kontak, daftar] = await Promise.all([
        rpc('perangkat.daftar'), rpc('templat.daftar'),
        rpc('kontak.daftar', { perHalaman: 1 }), rpc('massal.daftar'),
      ]);
    } catch (e) { el.innerHTML = galatKotak(e.message); return; }

    el.innerHTML = `
      <div class="grid-2">
        ${kartu(`
          <form id="fm">
            <div class="field">
              <label>Nama kiriman</label>
              <input name="nama" required placeholder="mis. Ajakan zakat Ramadan 1447">
            </div>
            <div class="grid-2">
              <div class="field">
                <label>Perangkat pengirim</label>
                <select name="perangkatId" required>
                  ${perangkat.baris.map((p) => `<option value="${p.id}">${H(p.nama)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Segmen penerima</label>
                <select name="segmen">
                  <option value="">Semua kontak (${fmtAngka(kontak.total)})</option>
                  ${kontak.segmen.map((s) => `<option value="${s.kode}">${H(s.label)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field">
              <div class="row" style="align-items:center;gap:8px;flex-wrap:nowrap">
                <label style="margin-bottom:0;white-space:nowrap">Isi pesan</label>
                <span style="margin-left:auto;width:220px;max-width:58%">
                <select id="pilihTemplat2">
                  <option value="">— pakai templat —</option>
                  ${templat.baris.map((t) => `<option value="${t.id}">${H(t.nama)}</option>`).join('')}
                </select>
                </span>
              </div>
              <textarea name="teks" rows="8" required placeholder="Assalamu'alaikum {{nama}}, ..."></textarea>
              ${kepingPenanda()}
              <div class="muted" style="font-size:11.5px;margin-top:4px">Tiap penerima menerima namanya sendiri. Kontak tanpa nama disapa &ldquo;Bapak/Ibu&rdquo;.</div>
            </div>
            ${kotakLampiran('fm')}
            <div style="border-radius:var(--radius);background:var(--accent-soft);padding:14px;font-size:12px;color:var(--text2);margin-bottom:12px">
              Kontak yang sudah berhenti berlangganan atau masuk daftar hitam otomatis dilewati. Sertakan kalimat cara berhenti pada pesan ajakan.
            </div>
            <button class="btn btn-primary btn-block">Jalankan kiriman</button>
          </form>`)}

        ${kartu(`
          <h3>Riwayat kiriman</h3>
          <div style="margin-top:14px;display:grid;gap:12px;max-height:28rem;overflow-y:auto">
            ${daftar.baris.length ? daftar.baris.map((m) => `
              <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px">
                <div style="display:flex;align-items:flex-start;gap:8px">
                  <p style="font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(m.nama)}</p>
                  ${m.status === 'berjalan' ? `<button data-henti="${m.id}" class="btn btn-ghost btn-sm" style="flex-shrink:0;color:var(--red)">hentikan</button>` : ''}
                </div>
                <p class="muted" style="font-size:11.5px">${fmtJarak(m.dibuat)} · ${fmtAngka(m.jumlah)} penerima</p>
                <div class="row" style="gap:6px;margin-top:8px">
                  <span class="badge grey">antre ${m.statistik.antre}</span>
                  <span class="badge blue">terkirim ${m.statistik.terkirim}</span>
                  <span class="badge green">dibaca ${m.statistik.dibaca}</span>
                  ${m.statistik.gagal ? `<span class="badge red">gagal ${m.statistik.gagal}</span>` : ''}
                </div>
              </div>`).join('') : '<p class="muted">Belum ada kiriman massal.</p>'}
          </div>`)}
      </div>`;

    $('#pilihTemplat2', el).onchange = (ev) => {
      const t = templat.baris.find((x) => x.id === ev.target.value);
      if (t) $('[name=teks]', el).value = t.isi;
    };
    pasangKeping(el, $('[name=teks]', el));
    pasangLampiran(el, 'fm');

    $$('[data-henti]', el).forEach((b) => b.onclick = () => konfirmasi(
      'Hentikan kiriman?', 'Pesan yang belum terkirim akan dibatalkan. Yang sudah terkirim tidak dapat ditarik.',
      async () => {
        try { const h = await rpc('massal.hentikan', { id: b.dataset.henti }); toast(h.pesan, 'ingat'); halaman.massal.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, hentikan'));

    $('#fm', el).onsubmit = async (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(ev.target).entries());
      konfirmasi('Jalankan kiriman massal?',
        'Pesan akan dikirim bertahap dengan jeda aman. Pastikan isi pesan sudah benar — pesan yang sudah terkirim tidak dapat ditarik.',
        async () => {
          try {
            const h = await rpc('massal.kirim', data);
            toast(h.catatan, 'sukses');
            halaman.massal.gambar(el);
          } catch (e) { toast(e.message, 'galat'); }
        }, 'Ya, kirim');
    };
  },
};

// ---------------------------------------------------------------- Antrean
halaman.antrean = {
  judul: 'Pesan & Antrean',
  sub: 'Seluruh pesan keluar dan masuk',
  saring: { status: '', cari: '', halaman: 1 },
  async gambar(el) {
    const s = halaman.antrean.saring;
    el.innerHTML = `
      <div class="table-wrap">
        <div class="toolbar">
          <input id="cari" class="search" value="${H(s.cari)}" placeholder="Cari nomor, nama, atau isi pesan…">
          <select id="status" style="width:auto">
            ${['', 'antre', 'terkirim', 'sampai', 'dibaca', 'gagal', 'dibatalkan', 'masuk']
              .map((v) => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${v || 'Semua status'}</option>`).join('')}
          </select>
        </div>
        <div id="tabel">${rangka(6)}</div>
      </div>`;

    $('#status', el).onchange = (ev) => { s.status = ev.target.value; s.halaman = 1; halaman.antrean.gambar(el); };
    let jeda;
    $('#cari', el).oninput = (ev) => {
      clearTimeout(jeda);
      jeda = setTimeout(() => { s.cari = ev.target.value; s.halaman = 1; halaman.antrean.gambar(el); }, 350);
    };

    let d;
    try { d = await rpc('pesan.daftar', s); } catch (e) { $('#tabel', el).innerHTML = galatKotak(e.message); return; }

    const bolehUbah = bisa('pesan.kirim');
    const halamanTotal = Math.max(1, Math.ceil(d.total / d.perHalaman));

    $('#tabel', el).innerHTML = d.baris.length ? `
      <table>
        <thead>
          <tr>
            <th>Penerima</th>
            <th>Isi</th>
            <th>Status</th>
            <th>Waktu</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${d.baris.map((p) => `
            <tr>
              <td>
                <div style="font-weight:600">${H(p.nama || p.nomor)}</div>
                <div class="muted" style="font-size:11.5px">${H(p.nomor)} ${p.arah === 'masuk' ? '· masuk' : ''}</div>
              </td>
              <td style="max-width:20rem">
                <div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(p.isi.teks)}</div>
                ${p.galatTerakhir ? `<div style="font-size:11.5px;color:var(--red);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(p.galatTerakhir)}</div>` : ''}
              </td>
              <td>${lencana(p.status)}</td>
              <td class="muted" style="font-size:11.5px;white-space:nowrap">${fmtJarak(p.dibuat)}</td>
              <td class="actions-cell" style="justify-content:flex-end">
                ${bolehUbah && p.status === 'antre' ? `<button data-batal="${p.id}" class="btn btn-ghost btn-sm" style="color:var(--red)">batalkan</button>` : ''}
                ${bolehUbah && ['gagal', 'dibatalkan'].includes(p.status) ? `<button data-ulang="${p.id}" class="btn btn-ghost btn-sm">ulangi</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="toolbar" style="border-bottom:none;border-top:1px solid var(--border)">
        <p class="muted" style="flex:1;font-size:11.5px">${fmtAngka(d.total)} pesan · halaman ${d.halaman} dari ${halamanTotal}</p>
        <button id="sebelum" ${d.halaman <= 1 ? 'disabled' : ''} class="btn btn-sm">Sebelumnya</button>
        <button id="sesudah" ${d.halaman >= halamanTotal ? 'disabled' : ''} class="btn btn-sm">Berikutnya</button>
      </div>` : kosong('Belum ada pesan yang cocok dengan saringan ini.', '📭');

    const sb = $('#sebelum', el); if (sb) sb.onclick = () => { s.halaman--; halaman.antrean.gambar(el); };
    const ss = $('#sesudah', el); if (ss) ss.onclick = () => { s.halaman++; halaman.antrean.gambar(el); };

    $$('[data-batal]', el).forEach((b) => b.onclick = async () => {
      try { await rpc('pesan.batal', { id: b.dataset.batal }); toast('Pesan dibatalkan.', 'ingat'); halaman.antrean.gambar(el); }
      catch (e) { toast(e.message, 'galat'); }
    });
    $$('[data-ulang]', el).forEach((b) => b.onclick = async () => {
      try { await rpc('pesan.ulangi', { id: b.dataset.ulang }); toast('Pesan dimasukkan ke antrean lagi.', 'sukses'); halaman.antrean.gambar(el); }
      catch (e) { toast(e.message, 'galat'); }
    });
  },
};

// ---------------------------------------------------------------- Kontak
halaman.kontak = {
  judul: 'Kontak',
  sub: 'Daftar kontak milik aplikasi ini',
  saring: { cari: '', segmen: '', halaman: 1 },
  async gambar(el) {
    const s = halaman.kontak.saring;
    const bolehUbah = bisa('kontak.ubah');
    el.innerHTML = `
      <div class="table-wrap">
        <div class="toolbar">
          <input id="cariK" class="search" value="${H(s.cari)}" placeholder="Cari nama, nomor, atau kantor…">
          <select id="segmenK" style="width:auto"></select>
          ${bolehUbah ? `
            <button id="imporK" class="btn">Impor</button>
            <button id="eksporK" class="btn">Ekspor</button>
            <button id="tambahK" class="btn btn-primary">+ Kontak</button>` : ''}
        </div>
        <div id="tabelK">${rangka(6)}</div>
      </div>`;

    let d;
    try { d = await rpc('kontak.daftar', s); } catch (e) { $('#tabelK', el).innerHTML = galatKotak(e.message); return; }

    $('#segmenK', el).innerHTML = `<option value="">Semua segmen</option>` +
      d.segmen.map((x) => `<option value="${x.kode}" ${s.segmen === x.kode ? 'selected' : ''}>${H(x.label)}</option>`).join('');
    $('#segmenK', el).onchange = (ev) => { s.segmen = ev.target.value; s.halaman = 1; halaman.kontak.gambar(el); };
    let jeda;
    $('#cariK', el).oninput = (ev) => {
      clearTimeout(jeda);
      jeda = setTimeout(() => { s.cari = ev.target.value; s.halaman = 1; halaman.kontak.gambar(el); }, 350);
    };

    const halamanTotal = Math.max(1, Math.ceil(d.total / d.perHalaman));
    const labelSegmen = (kode) => (d.segmen.find((x) => x.kode === kode) || {}).label || kode;

    $('#tabelK', el).innerHTML = d.baris.length ? `
      <table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Nomor</th>
            <th>Segmen</th>
            <th>Kantor</th>
            <th>Kiriman</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${d.baris.map((k) => `
            <tr>
              <td style="font-weight:600">${H(k.nama)}${k.anonim ? ' <span class="muted" style="font-weight:400;font-size:11.5px">(anonim)</span>' : ''}</td>
              <td class="muted">${H(k.nomor)}</td>
              <td><div class="row" style="gap:4px">${(k.segmen || []).map((x) =>
                `<span class="badge grey">${H(labelSegmen(x))}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
              <td class="muted" style="font-size:11.5px">${H(k.kantor || '—')}</td>
              <td>${k.daftarHitam
                ? '<span class="badge red">daftar hitam</span>'
                : k.langganan ? '<span class="badge green">berlangganan</span>' : '<span class="badge grey">berhenti</span>'}</td>
              <td class="actions-cell" style="justify-content:flex-end">
                ${bolehUbah ? `
                  <button data-ubahk="${k.id}" class="btn btn-ghost btn-sm">ubah</button>
                  <button data-hapusk="${k.id}" class="btn btn-ghost btn-sm" style="color:var(--red)">hapus</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="toolbar" style="border-bottom:none;border-top:1px solid var(--border)">
        <p class="muted" style="flex:1;font-size:11.5px">${fmtAngka(d.total)} kontak · halaman ${d.halaman} dari ${halamanTotal}</p>
        <button id="sebelumK" ${d.halaman <= 1 ? 'disabled' : ''} class="btn btn-sm">Sebelumnya</button>
        <button id="sesudahK" ${d.halaman >= halamanTotal ? 'disabled' : ''} class="btn btn-sm">Berikutnya</button>
      </div>` : kosong('Belum ada kontak. Tambahkan satu per satu atau impor dari CSV.', '👥');

    const sb = $('#sebelumK', el); if (sb) sb.onclick = () => { s.halaman--; halaman.kontak.gambar(el); };
    const ss = $('#sesudahK', el); if (ss) ss.onclick = () => { s.halaman++; halaman.kontak.gambar(el); };

    const formKontak = (k = null) => modal(k ? 'Ubah kontak' : 'Tambah kontak', `
      <form id="fkk">
        <div class="grid-2">
          <div class="field">
            <label>Nama</label>
            <input name="nama" required value="${H(k ? k.nama : '')}">
          </div>
          <div class="field">
            <label>Nomor WhatsApp</label>
            <input name="nomor" required value="${H(k ? k.nomor : '')}" inputmode="tel">
          </div>
        </div>
        <div class="field">
          <label>Segmen</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${d.segmen.map((x) => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400;margin-bottom:0">
              <input type="checkbox" name="segmen" value="${x.kode}" ${k && (k.segmen || []).includes(x.kode) ? 'checked' : ''} style="width:auto">
              ${H(x.label)}</label>`).join('')}
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label>Kantor layanan</label>
            <input name="kantor" value="${H(k ? k.kantor : '')}" placeholder="mis. KLL Sewon">
          </div>
          <div class="field">
            <label>Surel</label>
            <input name="surel" type="email" value="${H(k ? k.surel : '')}">
          </div>
        </div>
        <div class="field">
          <label>Catatan</label>
          <textarea name="catatan" rows="2">${H(k ? k.catatan : '')}</textarea>
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400">
            <input type="checkbox" name="anonim" ${k && k.anonim ? 'checked' : ''} style="width:auto">
            Donatur ingin tetap anonim
          </label>
        </div>
      </form>`, (wadah) => {
      $('#fkkBatal').onclick = tutupModal;
      $('#fkk', wadah).onsubmit = async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = {
          nama: f.get('nama'), nomor: f.get('nomor'), kantor: f.get('kantor'),
          surel: f.get('surel'), catatan: f.get('catatan'),
          anonim: f.get('anonim') === 'on',
          segmen: f.getAll('segmen'),
        };
        if (k) data.id = k.id;
        try { await rpc('kontak.simpan', data); tutupModal(); toast('Kontak tersimpan.', 'sukses'); halaman.kontak.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      };
    }, `<button type="button" id="fkkBatal" class="btn">Batal</button>
        <button type="submit" form="fkk" class="btn btn-primary">Simpan</button>`);

    const tb = $('#tambahK', el); if (tb) tb.onclick = () => formKontak();
    $$('[data-ubahk]', el).forEach((b) => b.onclick = () => formKontak(d.baris.find((x) => x.id === b.dataset.ubahk)));
    $$('[data-hapusk]', el).forEach((b) => b.onclick = () => konfirmasi('Hapus kontak?',
      'Riwayat pesannya tetap tersimpan, tetapi kontak ini tidak lagi masuk kiriman massal.',
      async () => {
        try { await rpc('kontak.hapus', { id: b.dataset.hapusk }); toast('Kontak dihapus.', 'sukses'); halaman.kontak.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, hapus'));

    const ti = $('#imporK', el);
    if (ti) ti.onclick = () => modal('Impor kontak', `
      <p class="muted">Tempel isi berkas CSV, atau pilih berkasnya. Baris pertama sebaiknya berisi nama kolom: <code>nama, nomor, kantor, segmen</code>.</p>
      <div class="field" style="margin-top:12px"><input type="file" id="berkasK" accept=".csv,.txt"></div>
      <div class="field">
        <textarea id="teksK" rows="9" placeholder="nama,nomor,kantor&#10;Budi,081234567890,KLL Sewon" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace"></textarea>
      </div>`, (wadah) => {
      $('#fiBatal').onclick = tutupModal;
      $('#berkasK', wadah).onchange = (ev) => {
        const berkas = ev.target.files[0];
        if (!berkas) return;
        const pembaca = new FileReader();
        pembaca.onload = () => { $('#teksK', wadah).value = pembaca.result; };
        pembaca.readAsText(berkas);
      };
      $('#fiJalan').onclick = async () => {
        const tombol = $('#fiJalan');
        tombol.disabled = true; tombol.textContent = 'Mengimpor…';
        try {
          const { hasil } = await rpc('kontak.impor', { teks: $('#teksK', wadah).value });
          tutupModal();
          toast(`${hasil.baru} kontak baru, ${hasil.diperbarui} diperbarui, ${hasil.dilewati} dilewati.`, 'sukses');
          halaman.kontak.gambar(el);
        } catch (e) { toast(e.message, 'galat'); tombol.disabled = false; tombol.textContent = 'Impor'; }
      };
    }, `<button type="button" id="fiBatal" class="btn">Batal</button>
        <button type="button" id="fiJalan" class="btn btn-primary">Impor</button>`);

    const te = $('#eksporK', el);
    if (te) te.onclick = async () => {
      try {
        const { csv, jumlah } = await rpc('kontak.ekspor');
        const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `kontak-blast-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        toast(`${jumlah} kontak diekspor.`, 'sukses');
      } catch (e) { toast(e.message, 'galat'); }
    };
  },
};

// ---------------------------------------------------------------- Templat
halaman.templat = {
  judul: 'Templat Pesan',
  sub: 'Naskah siap pakai untuk kiriman berulang',
  async gambar(el) {
    el.innerHTML = rangka(4);
    let d;
    try { d = await rpc('templat.daftar'); } catch (e) { el.innerHTML = galatKotak(e.message); return; }
    const bolehUbah = bisa('pesan.kirim');

    el.innerHTML = `
      <div class="row" style="align-items:center;margin-bottom:16px;flex-wrap:nowrap">
        <p class="muted" style="flex:1;min-width:0">${d.baris.length} templat</p>
        ${bolehUbah ? '<button id="tambahT" class="btn btn-primary">+ Templat</button>' : ''}
      </div>
      ${d.baris.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">${d.baris.map((t) => `
        <section class="card" style="margin-bottom:0;display:flex;flex-direction:column">
          <div style="font-weight:700">${H(t.nama)}</div>
          <p class="muted" style="margin-top:8px;flex:1;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical">${H(t.isi)}</p>
          ${bolehUbah ? `<div class="row" style="gap:8px;margin-top:14px">
            <button data-ubaht="${t.id}" class="btn btn-sm">Ubah</button>
            <button data-hapust="${t.id}" class="btn btn-sm btn-danger">Hapus</button>
          </div>` : ''}
        </section>`).join('')}</div>` : kartu(kosong('Belum ada templat pesan.', '📝'))}`;

    const formT = (t = null) => modal(t ? 'Ubah templat' : 'Templat baru', `
      <form id="ft">
        <div class="field">
          <label>Nama templat</label>
          <input name="nama" required value="${H(t ? t.nama : '')}">
        </div>
        <div class="field">
          <label>Isi</label>
          <textarea name="isi" rows="10" required>${H(t ? t.isi : '')}</textarea>
          <div class="muted" style="font-size:11.5px;margin-top:4px">Variabel: <code>{{nama}}</code>, <code>{{kantor}}</code>, <code>{{lembaga}}</code></div>
        </div>
      </form>`, (wadah) => {
      $('#ftBatal').onclick = tutupModal;
      $('#ft', wadah).onsubmit = async (ev) => {
        ev.preventDefault();
        const data = Object.fromEntries(new FormData(ev.target).entries());
        if (t) data.id = t.id;
        try { await rpc('templat.simpan', data); tutupModal(); toast('Templat tersimpan.', 'sukses'); halaman.templat.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      };
    }, `<button type="button" id="ftBatal" class="btn">Batal</button>
        <button type="submit" form="ft" class="btn btn-primary">Simpan</button>`);

    const tb = $('#tambahT', el); if (tb) tb.onclick = () => formT();
    $$('[data-ubaht]', el).forEach((b) => b.onclick = () => formT(d.baris.find((x) => x.id === b.dataset.ubaht)));
    $$('[data-hapust]', el).forEach((b) => b.onclick = () => konfirmasi('Hapus templat?', 'Templat ini tidak lagi muncul saat menyusun pesan.',
      async () => {
        try { await rpc('templat.hapus', { id: b.dataset.hapust }); toast('Templat dihapus.', 'sukses'); halaman.templat.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, hapus'));
  },
};

// ---------------------------------------------------------------- Webhook
halaman.webhook = {
  judul: 'Webhook',
  sub: 'Kejadian yang diteruskan ke sistem lain',
  async gambar(el) {
    el.innerHTML = rangka(5);
    let d, s;
    try { [d, s] = await Promise.all([rpc('webhook.riwayat', { batas: 60 }), rpc('setelan.ambil')]); }
    catch (e) { el.innerHTML = galatKotak(e.message); return; }
    const w = s.setelan.webhook;

    el.innerHTML = `
      <div class="grid-2">
        ${kartu(`
          <h3>Alamat tujuan</h3>
          <div class="desc">Setiap kiriman ditandatangani HMAC-SHA256 pada header <code>X-Blast-Signature</code>.</div>
          <dl style="display:grid;gap:12px;font-size:13px">
            <div><dt class="muted" style="font-size:11.5px">URL</dt><dd style="overflow-wrap:anywhere">${H(w.url || 'belum diisi')}</dd></div>
            <div><dt class="muted" style="font-size:11.5px">Keadaan</dt><dd>${w.aktif ? '<span class="badge green">aktif</span>' : '<span class="badge grey">tidak aktif</span>'}</dd></div>
            <div><dt class="muted" style="font-size:11.5px">Kejadian</dt><dd class="row" style="gap:4px">${(w.kejadian || []).map((k) => `<span class="badge grey">${H(k)}</span>`).join('')}</dd></div>
          </dl>
          <div class="row" style="gap:8px;margin-top:16px">
            ${bisa('setelan.ubah') ? '<button id="ujiW" class="btn btn-primary">Kirim kejadian uji</button>' : ''}
            <a href="#setelan" class="btn" style="text-decoration:none">Ubah di Pengaturan</a>
          </div>`)}

        ${kartu(`
          <h3>Riwayat kejadian</h3>
          <div style="margin-top:14px;display:grid;gap:8px;max-height:30rem;overflow-y:auto">
            ${d.baris.length ? d.baris.map((k) => `
              <button data-lihat='${H(JSON.stringify(k))}' style="width:100%;text-align:left;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);padding:10px 14px;cursor:pointer">
                <div class="row" style="align-items:center;gap:8px;flex-wrap:nowrap">
                  <span style="font-size:13px;font-weight:600">${H(k.jenis)}</span>
                  <span class="badge${k.keadaan === 'gagal' ? ' red' : ' grey'}">${H(k.keadaan)}</span>
                  <span class="muted" style="margin-left:auto;font-size:11px">${fmtJarak(k.waktu)}</span>
                </div>
                ${k.catatan ? `<div style="font-size:11.5px;color:var(--red);margin-top:4px">${H(k.catatan)}</div>` : ''}
              </button>`).join('') : '<p class="muted">Belum ada kejadian.</p>'}
          </div>`)}
      </div>`;

    const uji = $('#ujiW', el);
    if (uji) uji.onclick = async () => {
      try { const h = await rpc('webhook.uji'); toast(h.catatan, 'sukses'); halaman.webhook.gambar(el); }
      catch (e) { toast(e.message, 'galat'); }
    };
    $$('[data-lihat]', el).forEach((b) => b.onclick = () => {
      const k = JSON.parse(b.dataset.lihat);
      modal('Isi kejadian', `<pre style="font-size:11.5px;background:var(--surface2);border-radius:var(--radius);padding:14px;overflow-x:auto">${H(JSON.stringify(k, null, 2))}</pre>`);
    });
  },
};

// ---------------------------------------------------------------- Pengguna
halaman.pengguna = {
  judul: 'Tim & Petugas',
  sub: 'Akun dan hak aksesnya',
  async gambar(el) {
    el.innerHTML = rangka(5);
    let d;
    try { d = await rpc('pengguna.daftar'); } catch (e) { el.innerHTML = galatKotak(e.message); return; }
    const bolehUbah = bisa('pengguna.ubah');

    el.innerHTML = `
      <div class="table-wrap" style="margin-bottom:16px">
        <div class="toolbar">
          <p class="muted" style="flex:1;min-width:0">${d.baris.length} akun</p>
          ${bolehUbah ? '<button id="tambahU" class="btn btn-primary">+ Akun</button>' : ''}
        </div>
        <table>
          <thead>
            <tr><th>Nama</th><th>Pengguna</th><th>Peran</th><th>Kantor</th><th>Terakhir masuk</th><th></th></tr>
          </thead>
          <tbody>
            ${d.baris.map((p) => `
              <tr${p.aktif ? '' : ' style="opacity:.5"'}>
                <td style="font-weight:600">${H(p.nama)}</td>
                <td class="muted">${H(p.username)}</td>
                <td>${H((d.peran[p.peran] || {}).label || p.peran)}</td>
                <td class="muted" style="font-size:11.5px">${H(p.kantor || '—')}</td>
                <td class="muted" style="font-size:11.5px">${fmtJarak(p.masukTerakhir)}</td>
                <td class="actions-cell" style="justify-content:flex-end">
                  ${bolehUbah ? `<button data-ubahu="${p.id}" class="btn btn-ghost btn-sm">ubah</button>
                  <button data-hapusu="${p.id}" class="btn btn-ghost btn-sm" style="color:var(--red)">hapus</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${kartu(`
        <h3>Arti tiap peran</h3>
        <ul class="muted" style="list-style:none;display:grid;gap:4px;font-size:12px">
          ${Object.entries(d.peran).map(([k, v]) => `<li><strong>${H(v.label)}</strong> — ${H(v.keterangan)}</li>`).join('')}
        </ul>`)}`;

    const formU = (p = null) => modal(p ? 'Ubah akun' : 'Akun baru', `
      <form id="fu">
        <div class="grid-2">
          <div class="field"><label>Nama</label>
            <input name="nama" required value="${H(p ? p.nama : '')}"></div>
          <div class="field"><label>Nama pengguna</label>
            <input name="username" ${p ? 'disabled' : 'required'} value="${H(p ? p.username : '')}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Peran</label>
            <select name="peran">
              ${Object.entries(d.peran).map(([k, v]) => `<option value="${k}" ${p && p.peran === k ? 'selected' : ''}>${H(v.label)}</option>`).join('')}
            </select></div>
          <div class="field"><label>Kantor <span class="muted" style="font-weight:400">(untuk peran KLL/ULL)</span></label>
            <input name="kantor" value="${H(p ? p.kantor : '')}" placeholder="mis. KLL Sewon"></div>
        </div>
        <div class="field"><label>${p ? 'Sandi baru (kosongkan bila tidak diganti)' : 'Sandi'}</label>
          <input name="${p ? 'sandiBaru' : 'sandi'}" type="password" ${p ? '' : 'required'}>
          <div class="muted" style="font-size:11.5px;margin-top:4px">Minimal 8 karakter, memuat huruf dan angka.</div></div>
        ${p ? `<div class="field"><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400">
          <input type="checkbox" name="aktif" ${p.aktif ? 'checked' : ''} style="width:auto">Akun aktif</label></div>` : ''}
      </form>`, (wadah) => {
      $('#fuBatal').onclick = tutupModal;
      $('#fu', wadah).onsubmit = async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const data = Object.fromEntries(f.entries());
        if (p) { data.id = p.id; data.aktif = f.get('aktif') === 'on'; }
        try { await rpc('pengguna.simpan', data); tutupModal(); toast('Akun tersimpan.', 'sukses'); halaman.pengguna.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      };
    }, `<button type="button" id="fuBatal" class="btn">Batal</button>
        <button type="submit" form="fu" class="btn btn-primary">Simpan</button>`);

    const tb = $('#tambahU', el); if (tb) tb.onclick = () => formU();
    $$('[data-ubahu]', el).forEach((b) => b.onclick = () => formU(d.baris.find((x) => x.id === b.dataset.ubahu)));
    $$('[data-hapusu]', el).forEach((b) => b.onclick = () => konfirmasi('Hapus akun?',
      'Seluruh sesi akun ini akan dikeluarkan dan akunnya dihapus.',
      async () => {
        try { const h = await rpc('pengguna.hapus', { id: b.dataset.hapusu }); toast(h.pesan, 'sukses'); halaman.pengguna.gambar(el); }
        catch (e) { toast(e.message, 'galat'); }
      }, 'Ya, hapus'));
  },
};

// ---------------------------------------------------------------- Audit
halaman.audit = {
  judul: 'Catatan Audit',
  sub: 'Siapa melakukan apa dan kapan',
  async gambar(el) {
    el.innerHTML = rangka(8);
    let d;
    try { d = await rpc('audit.daftar', { batas: 200 }); } catch (e) { el.innerHTML = galatKotak(e.message); return; }
    el.innerHTML = d.baris.length ? `<div class="table-wrap">
      ${d.baris.map((a) => `
        <div style="padding:10px 14px;border-bottom:1px solid var(--border2);display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;font-size:13px">
          <span style="font-weight:600">${H(a.nama)}</span>
          <span class="badge grey">${H(a.tindakan)}</span>
          <span class="muted" style="font-size:11.5px;margin-left:auto">${fmtWaktu(a.waktu)}</span>
          ${Object.keys(a.rincian || {}).length ? `<div class="muted" style="width:100%;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${H(JSON.stringify(a.rincian))}</div>` : ''}
        </div>`).join('')}</div>` : kartu(kosong('Belum ada catatan audit.', '🛡️'));
  },
};

// ---------------------------------------------------------------- Setelan
halaman.setelan = {
  judul: 'Pengaturan',
  sub: 'Dapat diubah tanpa deploy ulang',
  async gambar(el) {
    el.innerHTML = rangka(6);
    let d;
    try { d = await rpc('setelan.ambil'); } catch (e) { el.innerHTML = galatKotak(e.message); return; }
    const s = d.setelan;
    const bolehUbah = bisa('setelan.ubah');
    const mati = bolehUbah ? '' : 'disabled';

    el.innerHTML = `
      <form id="fs">
        ${kartu(`
          <h3>Identitas lembaga</h3>
          <div class="grid-2">
            <div class="field"><label>Nama lembaga</label><input ${mati} name="lembaga.nama" value="${H(s.lembaga.nama)}"></div>
            <div class="field"><label>Situs / tautan transparansi</label><input ${mati} name="lembaga.situs" value="${H(s.lembaga.situs)}"></div>
          </div>
          <div class="field"><label>Alamat</label><input ${mati} name="lembaga.alamat" value="${H(s.lembaga.alamat)}"></div>`)}

        ${kartu(`
          <h3>Pengirim</h3>
          <div class="desc">Driver bawaan untuk perangkat yang tidak menentukan sendiri.</div>
          <div class="row-3">
            <div class="field"><label>Driver</label>
              <select ${mati} name="pengirim.driver">
                ${['sandbox', 'fonnte', 'meta'].map((v) => `<option value="${v}" ${s.pengirim.driver === v ? 'selected' : ''}>${v}</option>`).join('')}
              </select></div>
            <div class="field"><label>Kode negara</label><input ${mati} name="pengirim.kodeNegara" value="${H(s.pengirim.kodeNegara)}"></div>
            <div class="field" style="display:flex;align-items:flex-end"><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400;padding-bottom:9px;margin-bottom:0">
              <input ${mati} type="checkbox" name="pengirim.efekMengetik" ${s.pengirim.efekMengetik ? 'checked' : ''} style="width:auto">Efek mengetik</label></div>
          </div>`)}

        ${kartu(`
          <h3>Pengaman pengiriman</h3>
          <div class="desc">Jeda, jam kirim, dan batas harian menjaga nomor dari pemblokiran.</div>
          <div class="row-3">
            <div class="field"><label>Jeda minimal (detik)</label><input ${mati} type="number" min="1" name="kirim.jedaMinDetik" value="${s.kirim.jedaMinDetik}"></div>
            <div class="field"><label>Jeda maksimal (detik)</label><input ${mati} type="number" min="1" name="kirim.jedaMaksDetik" value="${s.kirim.jedaMaksDetik}"></div>
            <div class="field"><label>Batas harian per perangkat</label><input ${mati} type="number" min="1" name="kirim.batasHarianPerangkat" value="${s.kirim.batasHarianPerangkat}"></div>
            <div class="field"><label>Jam mulai (WIB)</label><input ${mati} type="number" min="0" max="23" name="kirim.jamMulai" value="${s.kirim.jamMulai}"></div>
            <div class="field"><label>Jam selesai (WIB)</label><input ${mati} type="number" min="1" max="24" name="kirim.jamSelesai" value="${s.kirim.jamSelesai}"></div>
            <div class="field"><label>Pesan per putaran</label><input ${mati} type="number" min="1" max="30" name="kirim.kirimPerPutaran" value="${s.kirim.kirimPerPutaran}"></div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400;margin-top:8px">
            <input ${mati} type="checkbox" name="kirim.hormatiJamKirim" ${s.kirim.hormatiJamKirim ? 'checked' : ''} style="width:auto">
            Hanya kirim pada jam kirim di atas
          </label>`)}

        ${kartu(`
          <h3>Webhook keluar</h3>
          <div class="field"><label>URL tujuan</label><input ${mati} name="webhook.url" value="${H(s.webhook.url)}" placeholder="https://lazdigital.my.id/api/blast-masuk"></div>
          <div class="grid-2">
            <div class="field"><label>Rahasia tanda tangan</label><input ${mati} name="webhook.rahasia" type="password" value="${H(s.webhook.rahasia)}"></div>
            <div class="field" style="display:flex;align-items:flex-end"><label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400;padding-bottom:9px;margin-bottom:0">
              <input ${mati} type="checkbox" name="webhook.aktif" ${s.webhook.aktif ? 'checked' : ''} style="width:auto">Aktifkan</label></div>
          </div>`)}

        ${kartu(`
          <h3>Biaya pengiriman</h3>
          <div class="desc">Dipakai untuk laporan biaya dan peringatan saldo menipis. Ini dana amil — layak dipantau.</div>
          <div class="row-3">
            <div class="field"><label>Biaya per pesan (Rp)</label><input ${mati} type="number" min="0" name="biaya.biayaPerPesan" value="${s.biaya.biayaPerPesan}"></div>
            <div class="field"><label>Saldo tercatat (Rp)</label><input ${mati} type="number" min="0" name="biaya.saldoDicatat" value="${s.biaya.saldoDicatat}"></div>
            <div class="field"><label>Peringatan bila di bawah (Rp)</label><input ${mati} type="number" min="0" name="biaya.peringatanSaldo" value="${s.biaya.peringatanSaldo}"></div>
          </div>`)}

        <div class="form-actions">
          <button type="button" id="gantiSandi" class="btn">Ganti sandi saya</button>
          ${bolehUbah ? '<button class="btn btn-primary">Simpan pengaturan</button>' : ''}
        </div>
      </form>`;

    $('#gantiSandi', el).onclick = () => modal('Ganti sandi', `
      <form id="fg">
        <div class="field"><label>Sandi lama</label><input name="sandiLama" type="password" required></div>
        <div class="field"><label>Sandi baru</label><input name="sandiBaru" type="password" required>
          <div class="muted" style="font-size:11.5px;margin-top:4px">Minimal 8 karakter, memuat huruf dan angka. Sesi lain akan dikeluarkan.</div></div>
      </form>`, (wadah) => {
      $('#fgBatal').onclick = tutupModal;
      $('#fg', wadah).onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          const h = await rpc('auth.gantiSandi', Object.fromEntries(new FormData(ev.target).entries()));
          tutupModal(); toast(h.pesan, 'sukses');
        } catch (e) { toast(e.message, 'galat'); }
      };
    }, `<button type="button" id="fgBatal" class="btn">Batal</button>
        <button type="submit" form="fg" class="btn btn-primary">Ganti</button>`);

    if (bolehUbah) $('#fs', el).onsubmit = async (ev) => {
      ev.preventDefault();
      const setelan = {};
      for (const medan of $$('[name]', ev.target)) {
        if (medan.disabled) continue;
        const jalur = medan.name.split('.');
        let simpul = setelan;
        for (let i = 0; i < jalur.length - 1; i++) simpul = (simpul[jalur[i]] = simpul[jalur[i]] || {});
        let nilai = medan.type === 'checkbox' ? medan.checked : medan.value;
        if (medan.type === 'number') nilai = Number(nilai);
        simpul[jalur[jalur.length - 1]] = nilai;
      }
      try { await rpc('setelan.simpan', { setelan }); toast('Pengaturan tersimpan.', 'sukses'); mulaiStatus(); }
      catch (e) { toast(e.message, 'galat'); }
    };
  },
};

// ============================================================ perute & awal

/* Sidebar yang sama dengan LAZDigital: menciut jadi deretan ikon, dan
   pilihannya diingat antar halaman lewat kunci localStorage yang sama —
   jadi menyempitkan menu di halaman utama ikut berlaku di sini. */
function toggleSidebar() {
  const app = $('#appView');
  if (!app) return;
  app.classList.toggle('collapsed');
  try { localStorage.setItem('sidebar_collapsed', app.classList.contains('collapsed')); } catch (_) { /* mode privat */ }
}
window.toggleSidebar = toggleSidebar;

async function buka(kode) {
  const h = halaman[kode] || halaman.dasbor;
  negara.halaman = halaman[kode] ? kode : 'dasbor';
  tandaiMenu(negara.halaman);
  window.scrollTo({ top: 0 });

  /* Judul halaman digambar di sini, bukan di dalam tiap halaman: satu tempat
     berarti tinggi dan jaraknya pasti sama di kesebelas halaman. Isinya
     dirender ke wadah terpisah supaya halaman tetap bebas menimpa innerHTML
     miliknya sendiri tanpa menghapus judulnya. */
  $('#isi').innerHTML = kepalaHalaman(h.judul, h.sub) + '<div id="isiHalaman"></div>';
  await h.gambar($('#isiHalaman'));
  if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
}

/* Tema memakai kunci dan atribut yang sama dengan halaman utama
   (data-theme + laz_theme), bukan kelas .dark milik Tailwind. Kalau berbeda,
   berpindah dari Dasbor ke Broadcast akan menyalakan layar putih di tengah
   malam — persis hal yang bikin sebuah halaman terasa nyempil. */
function terapkanTema(gelap) {
  document.documentElement.setAttribute('data-theme', gelap ? 'dark' : 'light');
  try { localStorage.setItem('laz_theme', gelap ? 'dark' : 'light'); } catch (_) { /* mode privat */ }
}
function temaGelap() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

function selesaiMemuat() {
  const boot = $('#boot');
  if (boot) boot.style.display = 'none';
  $('#appView').classList.remove('hidden');
}

async function mulaiStatus() {
  const s = await rpc('sistem.status');
  negara.status = s;
  if (s.lembaga) {
    const nama = s.lembaga.singkatan || s.lembaga.nama;
    const brand = $('#brandBox');
    if (brand) brand.title = s.lembaga.nama || nama;
    document.title = `Broadcast — ${nama}`;
  }
  const ld = $('#lencanaDriver');
  if (ld) {
    /* Mode sandbox berarti TIDAK ADA pesan yang benar-benar terkirim. Itu harus
       kelihatan terus-menerus, bukan cuma tertulis di halaman Pengaturan —
       kalau tidak, satu kampanye bisa dijalankan seharian tanpa satu pun
       donatur menerimanya. */
    const sandbox = s.driver === 'sandbox';
    ld.textContent = sandbox ? 'Mode sandbox — tidak benar-benar terkirim'
      : (s.driver === 'mandiri' ? 'Gateway sendiri' : s.driver);
    ld.className = 'badge ' + (sandbox ? 'amber' : 'green');
  }
  return s;
}

(async function mulai() {
  try { terapkanTema(localStorage.getItem('laz_theme') === 'dark'); } catch (_) { /* abaikan */ }
  try {
    if (localStorage.getItem('sidebar_collapsed') === 'true') $('#appView').classList.add('collapsed');
  } catch (_) { /* abaikan */ }

  $('#tombolTema').onclick = () => terapkanTema(!temaGelap());
  $('#tombolKembali').onclick = () => { location.href = '/index.html'; };
  $('#chipPengguna').onclick = () => { location.href = '/index.html'; };
  $('#modalBg').onclick = (e) => { if (e.target.id === 'modalBg') tutupModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupModal(); });

  let s;
  try { s = await mulaiStatus(); } catch (_) { location.href = '/index.html'; return; }
  if (!s.masuk) { location.href = '/index.html'; return; }

  negara.pengguna = s.pengguna;
  negara.izin = s.izin;
  $('#uName').textContent = s.pengguna.nama;
  $('#uRole').textContent = s.pengguna.peran + (s.pengguna.kantor ? ` \u00B7 ${s.pengguna.kantor}` : '');
  $('#uAvatar').textContent = (s.pengguna.nama || 'A').trim().charAt(0).toUpperCase();

  gambarMenu();
  window.addEventListener('hashchange', () => buka(location.hash.slice(1) || 'dasbor'));

  /* Layar pemuatan HARUS hilang walaupun halaman pertama gagal digambar.
     Kalau tidak, satu galat di satu halaman membuat seluruh aplikasi terlihat
     menggantung selamanya, dan pesan galatnya pun tidak sempat terbaca karena
     tertutup layar pemuatan. */
  try {
    await buka(location.hash.slice(1) || 'dasbor');
  } catch (e) {
    $('#isi').innerHTML = kepalaHalaman('Broadcast', '') + galatKotak(e.message || 'Halaman gagal dimuat');
  } finally {
    selesaiMemuat();
  }

  // Penyegaran ringan: hanya dasbor dan antrean yang perlu tampak hidup.
  // Sekalian mendorong antrean — berguna pada paket Vercel Hobby, yang cron
  // bawaannya hanya boleh jalan sekali sehari.
  setInterval(async () => {
    if (document.hidden) return;
    if (!['dasbor', 'antrean'].includes(negara.halaman)) return;
    if ($('#modalBg').classList.contains('show')) return;
    if (bisa('pesan.kirim')) {
      try { await rpc('antrean.proses', { diam: true }); } catch (_) { /* diam saja, ini hanya dorongan */ }
    }
    const wadah = $('#isiHalaman');
    if (wadah) halaman[negara.halaman].gambar(wadah).catch(() => {});
  }, 20000);
})();
