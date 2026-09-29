/* media.js - modul Media & Desain untuk LAZDigital.
 *
 * SATU HALAMAN, TIGA WAJAH. Modul ini dipakai tiga jenis orang yang pekerjaan
 * hariannya sama sekali berbeda:
 *
 *   PEMOHON   - staff yang butuh flyer. Ia mengajukan, lalu ingin tahu sudah
 *               sampai mana tanpa harus bertanya lewat japri.
 *   TIM MEDIA - yang mengerjakan. Ia butuh satu kotak berisi pekerjaannya
 *               sendiri, diurut dari yang paling mendesak.
 *   KOORDINATOR / SUPERADMIN - yang menjawab "bulan ini tim media mengerjakan
 *               berapa, dan yang telat berapa".
 *
 * Ketiganya tidak dibuatkan halaman terpisah, melainkan menu yang muncul dan
 * menghilang menurut izin. Alasannya bukan kemalasan: tiga halaman berarti
 * tiga tempat yang harus diingat saat aturan berubah, dan yang ketiga selalu
 * ketinggalan. Yang menegakkan izinnya tetap server; menu yang disembunyikan
 * di sini cuma supaya tidak ada yang menekan pintu yang memang terkunci.
 *
 * Berdiri sendiri dari fund.js dan blast.js: berbagi styles.css dan pola yang
 * sama, tetapi memanggil /api/media dan tidak saling menyalakan boot.
 */
'use strict';

// ============================================================ inti
const $ = (s, induk = document) => induk.querySelector(s);
const $$ = (s, induk = document) => Array.from(induk.querySelectorAll(s));
const H = (t) => String(t === undefined || t === null ? '' : t)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const negara = {
  pengguna: null, izin: [], koordinator: false, bidangSaya: [],
  jenis: [], labelBidang: {}, labelStatus: {}, labelLangkah: {},
  hariIni: '', halaman: 'dasbor', saring: {},
};

function tokenLaz() { try { return localStorage.getItem('laz_token') || ''; } catch (_) { return ''; } }

async function rpc(tindakan, data = {}) {
  const res = await fetch('/api/media', {
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
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtTanggal(tgl) {
  if (!tgl) return '-';
  const p = String(tgl).split('-');
  if (p.length !== 3) return String(tgl);
  return `${Number(p[2])} ${NAMA_BULAN[Number(p[1]) - 1] || p[1]} ${p[0]}`;
}
function fmtWaktu(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function tglHariIni() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/* Sisa hari dibaca sebagai kalimat, bukan angka telanjang. "-2" memaksa orang
   berhenti dan berhitung; "Telat 2 hari" tidak. */
function kalimatSisa(r) {
  if (r.status === 'selesai') return '';
  const n = r.sisaHari;
  if (n === null || n === undefined) return '';
  if (n < 0) return `Telat ${Math.abs(n)} hari`;
  if (n === 0) return 'Dipakai hari ini';
  if (n === 1) return 'Besok dipakai';
  return `${n} hari lagi`;
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

// ------------------------------------------------------------ potongan tampilan
function kosongKotak(ikon, pesan) {
  return `<div class="card" style="text-align:center;padding:38px 20px;color:var(--text2)">
    <div style="font-size:34px;margin-bottom:10px">${ikon}</div>
    <p style="font-size:13.5px;max-width:360px;margin:0 auto;line-height:1.6">${H(pesan)}</p></div>`;
}
const galatKotak = (pesan) => `<div class="card" style="border-color:var(--red);color:var(--red)">
  <strong>Gagal memuat.</strong> <span style="color:var(--text2)">${H(pesan)}</span></div>`;

function svgTema(gelap) {
  const isi = gelap
    ? '<circle cx="12" cy="12" r="4.6" fill="currentColor"/>'
      + '<g stroke="currentColor" stroke-width="2.1" stroke-linecap="round">'
      + '<path d="M12 2.4v2.3"/><path d="M12 19.3v2.3"/><path d="M4.2 4.2l1.7 1.7"/>'
      + '<path d="M18.1 18.1l1.7 1.7"/><path d="M2.4 12h2.3"/><path d="M19.3 12h2.3"/>'
      + '<path d="M4.2 19.8l1.7-1.7"/><path d="M18.1 5.9l1.7-1.7"/></g>'
    : '<path fill="currentColor" d="M20.4 14.9A8.6 8.6 0 0 1 9.1 3.6 8.7 8.7 0 1 0 20.4 14.9z"/>';
  return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">' + isi + '</svg>';
}
const judulTema = (gelap) => (gelap ? 'Ganti ke tema terang' : 'Ganti ke tema gelap');
const tombolTema = () => `
  <button class="tn-icon kepala-tema" id="tombolTema" type="button"
          title="${judulTema(temaGelap())}" aria-label="${judulTema(temaGelap())}">${svgTema(temaGelap())}</button>`;
function segarTema(b) {
  if (!b) return;
  const gelap = temaGelap();
  b.innerHTML = svgTema(gelap);
  b.title = judulTema(gelap);
  b.setAttribute('aria-label', b.title);
}
const kepalaHalaman = (judul, keterangan, aksi = '') =>
  `<div class="page-head"><div><h2>${H(judul)}</h2>${keterangan ? `<div class="desc">${H(keterangan)}</div>` : ''}</div>`
  + `<div class="page-head-aksi">${aksi}${tombolTema()}</div></div>`;

/* Lencana status. Warnanya konsisten di seluruh modul: satu arti satu warna,
   supaya orang membaca warnanya lebih dulu dan tulisannya belakangan. */
function lencanaStatus(r) {
  const peta = {
    baru: ['Menunggu', 'var(--amber, #B7791F)', 'rgba(183,121,31,.12)'],
    diproses: ['Dikerjakan', 'var(--blue)', 'var(--blue-bg)'],
    selesai: ['Selesai', 'var(--green)', 'rgba(22,163,74,.12)'],
  };
  const [teks, warna, latar] = peta[r.status] || [r.status, 'var(--text2)', 'var(--surface2)'];
  return `<span class="badge" style="color:${warna};background:${latar};border-color:transparent">${H(teks)}</span>`;
}
function lencanaTelat(r) {
  if (!r.terlambat) return '';
  return `<span class="badge" style="color:var(--red);background:rgba(220,38,38,.12);border-color:transparent">${H(kalimatSisa(r))}</span>`;
}

// ------------------------------------------------------------ ikon & menu
function ikonNav(isi) {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + isi + '</svg>';
}
const IKON = {
  dasbor: ikonNav('<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>'),
  ajukan: ikonNav('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  semua: ikonNav('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>'),
  kotak: ikonNav('<path d="M3 12h5l1.5 3h5L16 12h5"/><path d="M4.5 6.5 3 12v6h18v-6l-1.5-5.5z"/>'),
  tim: ikonNav('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.8 5.8 0 0 1 11 0"/><path d="M16 5.4a3.2 3.2 0 0 1 0 5.2"/><path d="M17.6 14a5.8 5.8 0 0 1 2.9 5.5"/>'),
  rekap: ikonNav('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13v4"/><path d="M12.5 11v6"/><path d="M16 14v3"/>'),
};

const MENU = [
  { kode: 'dasbor', label: 'Dashboard', izin: 'media.dasbor' },
  { kode: 'ajukan', label: 'Ajukan Desain', izin: 'permohonan.ajukan' },
  { kode: 'semua', label: 'Permohonan', izin: 'permohonan.lihat' },
  /* Kotak kerja hanya berarti bagi yang mengerjakan. Ditampilkan berdasarkan
     izin 'kerja.ambil', bukan berdasarkan ada tidaknya bidang: anggota tim
     yang belum ditugaskan tetap harus bisa membuka kotaknya dan membaca
     keterangan kenapa ia kosong. */
  { kode: 'kotak', label: 'Kotak Kerja', izin: 'kerja.ambil' },
  { kode: 'tim', label: 'Tim Media', izin: 'tim.lihat' },
  { kode: 'rekap', label: 'Rekap', izin: 'rekap.lihat' },
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

// ============================================================ DASHBOARD
const halaman = {};

/* Ikon kartu KPI. Bentuknya ditulis utuh, sama seperti di dashboard utama:
   kalau kelas induknya suatu hari berganti, kartunya tidak mendadak jadi
   kotak kosong tanpa gambar. */
function ikonKpi(isi) {
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + isi + '</svg>';
}
const IK = {
  tumpuk: ikonKpi('<path d="M12 3 3 7.5 12 12l9-4.5z"/><path d="M3 12.5 12 17l9-4.5"/>'),
  jam: ikonKpi('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>'),
  kerja: ikonKpi('<path d="M4 8h16v11H4z"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'),
  centang: ikonKpi('<path d="M4 12.5 9 17.5 20 6.5"/>'),
  seru: ikonKpi('<path d="M12 3 22 20H2z"/><path d="M12 9.5v4"/><path d="M12 16.8v.1"/>'),
  ulang: ikonKpi('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16"/><path d="M4 20v-4h4"/>'),
};
const WARNA = { jingga: 'var(--accent)', kuning: 'var(--amber)', biru: 'var(--blue)', hijau: 'var(--green)', merah: 'var(--red)' };

/* Kartu KPI dashboard utama, bentuknya sama persis. Tanpa keterangan kecil di
   bawahnya: labelnya sudah menyebutkan apa yang dihitung, dan kalimat
   penjelas di tiap kartu cuma membuat halaman terbaca seperti buku manual. */
function kpi(label, nilai, ikon, warna, kutak) {
  return `<div class="kpi-v2 kpi-rapat" style="--kpi-accent:${warna}"${kutak ? ` data-ke="${H(kutak)}"` : ''}>
    <div class="kpi-v2-top"><div class="kpi-v2-label">${H(label)}</div>
      <div class="kpi-v2-icon" style="background:${warna}">${ikon}</div></div>
    <div class="kpi-v2-value">${H(nilai)}</div></div>`;
}
/* .kpi-media menandai baris ini milik modul Media. Tanpa penanda itu,
   aturan proporsi 1.24fr/1fr/1fr/0.84fr milik dashboard utama (seksi 16
   styles.css, ber-!important) ikut mengenai kartu di sini dan membuat
   empat kartu yang isinya setara terukur 297, 239, dan 201 piksel. */
const barisKpi = (isi, lima) => `<div class="kpis-v2 kpi-media${lima ? ' is-lima' : ''}">${isi}</div>`;

/* Widget dashboard utama: kepala berbintik warna, lalu isinya. */
function wc(judul, dot, isi, ukuran) {
  return `<div class="wc" data-size="${ukuran || 'md'}">
    <div class="wc-h"><div class="wc-t"><span class="dot" style="background:${dot}"></span>${H(judul)}</div></div>
    <div class="wc-b">${isi}</div></div>`;
}

function pitaStatus(r) {
  const total = Number(r.baru) + Number(r.diproses) + Number(r.selesai);
  if (!total) return '<p class="muted" style="margin:0;font-size:13px">Belum ada permohonan.</p>';
  const p = (n) => (Number(n) / total * 100).toFixed(2) + '%';
  return `<div class="md-pita" role="img" aria-label="${H(`${r.baru} menunggu, ${r.diproses} dikerjakan, ${r.selesai} selesai`)}">
      ${r.baru ? `<i style="width:${p(r.baru)};background:var(--amber)"></i>` : ''}
      ${r.diproses ? `<i style="width:${p(r.diproses)};background:var(--blue)"></i>` : ''}
      ${r.selesai ? `<i style="width:${p(r.selesai)};background:var(--green)"></i>` : ''}
    </div>
    <div class="md-kunci">
      <span><i style="background:var(--amber)"></i>Menunggu ${fmtAngka(r.baru)}</span>
      <span><i style="background:var(--blue)"></i>Dikerjakan ${fmtAngka(r.diproses)}</span>
      <span><i style="background:var(--green)"></i>Selesai ${fmtAngka(r.selesai)}</span>
    </div>`;
}

const WARNA_STATUS = { baru: 'var(--amber)', diproses: 'var(--blue)', selesai: 'var(--green)' };

/* Satu permohonan sebagai satu baris. Status jadi bintik warna, bukan lencana
   bertuliskan: di kolom sempit, dua lencana memakan tempat yang seharusnya
   dipakai nama pemohon. Judulnya di atas, keterangannya di bawah membentang
   penuh, tanggalnya di kanan. */
function barisRingkas(r) {
  const judul = `${r.nomor} · ${r.jenisLabel} · ${r.pemohonNama || '-'}`;
  return `<button type="button" class="md-baris${r.terlambat ? ' is-telat' : ''}" data-id="${H(r.id)}"
      title="${H(r.judul)} — ${H(judul)}">
    <span class="md-r-titik" style="background:${WARNA_STATUS[r.status] || 'var(--muted)'}"
      aria-label="${H(negara.labelStatus[r.status] || r.status)}"></span>
    <span class="md-r-judul">${H(r.judul)}</span>
    <span class="md-r-kanan">${H(r.terlambat ? kalimatSisa(r) : fmtTanggal(r.deadline))}</span>
    <span class="md-r-sub">${H(judul)}</span>
  </button>`;
}
function pasangKlikRingkas(el) {
  $$('.md-baris', el).forEach((b) => { b.onclick = () => { location.hash = '#p/' + b.dataset.id; }; });
}
const kosongKecil = (pesan) => `<p class="muted" style="margin:0;font-size:13px;line-height:1.6">${H(pesan)}</p>`;

halaman.dasbor = {
  judul: 'Media & Desain',
  sub: '',
  aksi: () => (bisa('permohonan.ajukan')
    ? '<button class="btn btn-primary btn-sm" id="pintasAjukan">Ajukan desain</button>' : ''),
  async gambar(el) {
    const d = await rpc('dasbor.ringkas');
    const p = d.pantau;

    /* KARTU ATAS MENGIKUTI PERAN. Yang pertama dilihat orang harus yang bisa
       ia kerjakan hari ini, bukan angka lembaga yang tidak bisa ia sentuh. */
    let atas;
    if (p) {
      atas = barisKpi(
        kpi('Menunggu', fmtAngka(d.lembaga.baru), IK.jam, WARNA.kuning)
        + kpi('Dikerjakan', fmtAngka(d.lembaga.diproses), IK.kerja, WARNA.biru)
        + kpi('Lewat Tanggal', fmtAngka(d.lembaga.terlambat), IK.seru, WARNA.merah)
        + kpi('Selesai', fmtAngka(d.lembaga.selesai), IK.centang, WARNA.hijau));
    } else if (bisa('kerja.ambil')) {
      atas = barisKpi(
        kpi('Kotak Saya', fmtAngka(d.kotakSaya.jumlah), IK.kerja, WARNA.jingga)
        + kpi('Belum Diambil', fmtAngka(d.kotakSaya.baru), IK.jam, WARNA.kuning)
        + kpi('Lewat Tanggal', fmtAngka(d.kotakSaya.terlambat), IK.seru, WARNA.merah)
        + kpi('Selesai', fmtAngka(d.lembaga.selesai), IK.centang, WARNA.hijau));
    } else {
      atas = barisKpi(
        kpi('Permohonan Saya', fmtAngka(d.saya.total), IK.tumpuk, WARNA.jingga)
        + kpi('Berjalan', fmtAngka(d.saya.baru + d.saya.diproses), IK.kerja, WARNA.biru)
        + kpi('Selesai', fmtAngka(d.saya.selesai), IK.centang, WARNA.hijau)
        + kpi('Revisi', fmtAngka(d.saya.revisi), IK.ulang, WARNA.kuning));
    }

    const widget = [];

    if (p && p.telat.length) {
      widget.push(wc('Lewat Tanggal', 'var(--red)',
        p.telat.map(barisRingkas).join(''), 'full'));
    }

    widget.push(wc('Paling Mendesak', 'var(--accent)',
      d.mendesak.length ? d.mendesak.map(barisRingkas).join('')
        : kosongKecil('Tidak ada yang menunggu.'),
      p && p.telat.length ? 'md' : 'full'));

    if (bisa('kerja.ambil')) {
      widget.push(wc('Kotak Kerja Saya', 'var(--blue)',
        negara.bidangSaya.length || negara.koordinator
          ? `<div class="md-bidang">
              <div class="md-bkartu"><div class="md-b-nama"><i></i>Perlu dikerjakan</div>
                <div class="md-b-angka">${fmtAngka(d.kotakSaya.jumlah)}</div></div>
              <div class="md-bkartu"><div class="md-b-nama"><i style="background:var(--amber)"></i>Belum diambil</div>
                <div class="md-b-angka">${fmtAngka(d.kotakSaya.baru)}</div></div>
              <div class="md-bkartu${d.kotakSaya.terlambat ? ' is-kosong' : ''}"><div class="md-b-nama"><i style="background:var(--red)"></i>Lewat tanggal</div>
                <div class="md-b-angka">${fmtAngka(d.kotakSaya.terlambat)}</div></div>
            </div>`
          : kosongKecil('Anda belum ditugaskan ke bidang mana pun. Minta koordinator menambahkan Anda di Tim Media.')));
    }

    if (bisa('permohonan.ajukan')) {
      widget.push(wc('Permohonan Saya', 'var(--accent2)', pitaStatus(d.saya)));
    }

    if (p) {
      widget.push(wc('Beban Bidang', 'var(--purple)',
        `<div class="md-bidang">${p.perBidang.map((b) => `
          <div class="md-bkartu${b.kosong ? ' is-kosong' : ''}">
            <div class="md-b-nama"><i style="background:${b.kosong ? 'var(--red)' : 'var(--accent)'}"></i>${H(b.label)}</div>
            <div class="md-b-angka">${fmtAngka(b.antre)}</div>
            <div class="md-b-ket">${b.kosong ? '<b>tanpa anggota</b>'
              : (b.terlambat ? `<b>${fmtAngka(b.terlambat)} telat</b>` : H(b.orang.join(', ')))}</div>
          </div>`).join('')}</div>`
        + (p.belumDibagi
          ? `<button type="button" class="md-baris" id="kePerluDibagi" style="margin-top:10px;border-color:var(--amber);background:var(--amber-bg)">
              <span class="md-r-titik" style="background:var(--amber)"></span>
              <span class="md-r-judul">${fmtAngka(p.belumDibagi)} belum dibagi ke bidang</span>
              <span class="md-r-kanan" style="color:var(--amber)">Buka</span>
              <span class="md-r-sub">Tidak muncul di kotak siapa pun</span>
            </button>` : '')));

      widget.push(wc('Tim Media', 'var(--green)',
        p.perOrang.length
          ? `<div class="tabel-geser"><table>
              <thead><tr><th>Nama</th><th>Bidang</th><th>Jalan</th><th>Selesai</th></tr></thead>
              <tbody>${p.perOrang.map((o) => `<tr>
                <td style="font-weight:600">${H(o.nama)}</td>
                <td>${o.bidang.length ? o.bidang.map((b) => `<span class="badge">${H(b)}</span>`).join(' ') : '<span class="muted">-</span>'}</td>
                <td${o.sedang ? ' style="color:var(--blue);font-weight:700"' : ''}>${fmtAngka(o.sedang)}</td>
                <td>${fmtAngka(o.selesai)}</td></tr>`).join('')}</tbody></table></div>`
          : kosongKecil('Belum ada anggota tim media.')));

      widget.push(wc('Seluruh Lembaga', 'var(--text2)', pitaStatus(d.lembaga)));
    }

    el.innerHTML = atas + `<div class="dgrid md-dgrid">${widget.join('')}</div>`;
    pasangKlikRingkas(el);
    const kb = $('#kePerluDibagi', el);
    if (kb) kb.onclick = () => { location.hash = '#semua'; };
  },
};

// ============================================================ TABEL & DETAIL
function tabelPermohonan(baris, opsi = {}) {
  if (!baris.length) {
    return kosongKotak('&#128196;', opsi.kosong || 'Belum ada permohonan di sini.');
  }
  const kolomPemohon = !opsi.tanpaPemohon;
  return `<div class="tabel-geser"><table>
    <thead><tr>
      <th>Nomor &amp; judul</th>
      <th>Jenis</th>
      ${kolomPemohon ? '<th>Pemohon</th>' : ''}
      <th>Dipakai</th>
      <th>Status</th>
      ${opsi.ringkas ? '' : '<th>Dikerjakan</th>'}
    </tr></thead><tbody>
    ${baris.map((r) => `<tr class="baris-klik" data-id="${H(r.id)}" tabindex="0" role="button" aria-label="Buka ${H(r.nomor)}">
      <td><div style="font-weight:600">${H(r.judul)}</div>
          <div class="muted" style="font-size:11.5px">${H(r.nomor)}${r.jumlahRevisi ? ` · ${r.jumlahRevisi}x revisi` : ''}</div></td>
      <td>${H(r.jenisLabel)}</td>
      ${kolomPemohon ? `<td>${H(r.pemohonNama || '-')}</td>` : ''}
      <td>${H(fmtTanggal(r.deadline))}<div class="muted" style="font-size:11.5px">${H(kalimatSisa(r))}</div></td>
      <td>${lencanaStatus(r)} ${lencanaTelat(r)}</td>
      ${opsi.ringkas ? '' : `<td>${H(r.pengerjaNama || '-')}</td>`}
    </tr>`).join('')}
    </tbody></table></div>`;
}

function pasangKlikBaris(el) {
  $$('.baris-klik', el).forEach((tr) => {
    const buka = () => { location.hash = '#p/' + tr.dataset.id; };
    tr.onclick = buka;
    tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buka(); } };
  });
}

/* LINIMASA: jalan prosesnya dari awal sampai akhir.
 *
 * Inilah bagian yang diminta paling jelas, dan yang paling mudah dibuat
 * setengah hati. Yang membuatnya berguna bukan daftar statusnya, melainkan
 * SIAPA dan KAPAN di tiap langkah, plus alasan revisi apa adanya. Linimasa
 * yang cuma berbunyi "Diproses - Selesai" tidak menjawab satu pun pertanyaan
 * yang membuat orang membukanya. */
function linimasa(jejak) {
  if (!jejak.length) return '<p class="muted">Belum ada langkah tercatat.</p>';
  const warna = {
    diajukan: 'var(--text2)', diambil: 'var(--blue)',
    dikirim: 'var(--green)', revisi: 'var(--red)', dibagi: 'var(--text2)',
  };
  return `<ol style="list-style:none;padding:0;margin:0">${jejak.map((j, i) => `
    <li style="display:flex;gap:12px;padding-bottom:${i === jejak.length - 1 ? '0' : '16px'};position:relative">
      <div style="flex:0 0 12px;display:flex;flex-direction:column;align-items:center">
        <span style="width:11px;height:11px;border-radius:50%;background:${warna[j.langkah] || 'var(--text2)'};margin-top:4px"></span>
        ${i === jejak.length - 1 ? '' : '<span style="flex:1;width:2px;background:var(--border);margin-top:4px"></span>'}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13.5px">${H(negara.labelLangkah[j.langkah] || j.langkah)}</div>
        <div class="muted" style="font-size:12px">${H(j.olehNama || 'Sistem')} · ${H(fmtWaktu(j.waktu))}</div>
        ${j.catatan ? `<div style="font-size:13px;margin-top:4px;white-space:pre-wrap;background:var(--surface2);border-radius:9px;padding:8px 10px">${H(j.catatan)}</div>` : ''}
      </div>
    </li>`).join('')}</ol>`;
}

async function gambarDetail(el, id) {
  const { permohonan: p } = await rpc('permohonan.detail', { id });
  const sayaPemohon = String(p.pemohonId) === String(negara.pengguna.id);
  const bidangSaya = negara.bidangSaya.includes(p.bidang);
  const bolehKerja = bisa('kerja.ambil') && (bidangSaya || negara.koordinator);

  const aksi = [];
  if (bolehKerja && p.status === 'baru') aksi.push('<button class="btn btn-primary" id="akAmbil">Mulai kerjakan</button>');
  if (bolehKerja && p.status === 'diproses') aksi.push('<button class="btn btn-primary" id="akKirim">Kirim hasil</button>');
  if (p.status === 'selesai' && (sayaPemohon || negara.koordinator) && bisa('permohonan.revisi')) {
    aksi.push('<button class="btn" id="akRevisi">Minta revisi</button>');
  }
  if (negara.koordinator && bisa('permohonan.bagi')) {
    aksi.push('<button class="btn" id="akBagi">Pindahkan bidang</button>');
  }

  const hasil = (p.hasil || []).slice().reverse();

  el.innerHTML = `
    <div style="margin-bottom:12px"><button class="btn btn-sm" id="akKembali">&larr; Kembali</button></div>
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
        <div style="min-width:0">
          <div class="muted" style="font-size:12px">${H(p.nomor)}</div>
          <h3 style="margin:2px 0 6px">${H(p.judul)}</h3>
          <div>${lencanaStatus(p)} ${lencanaTelat(p)}
            <span class="badge">${H(p.jenisLabel)}</span>
            ${p.bidang ? `<span class="badge">Tim ${H(negara.labelBidang[p.bidang] || p.bidang)}</span>`
              : '<span class="badge" style="color:var(--red);border-color:var(--red)">Belum dibagi ke bidang</span>'}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${aksi.join('')}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:16px">
        <div><div class="muted" style="font-size:11.5px">Pemohon</div><div>${H(p.pemohonNama || '-')}${p.pemohonKantor ? `<div class="muted" style="font-size:12px">${H(p.pemohonKantor)}</div>` : ''}</div></div>
        <div><div class="muted" style="font-size:11.5px">Dipakai tanggal</div><div>${H(fmtTanggal(p.deadline))}<div class="muted" style="font-size:12px">${H(kalimatSisa(p) || 'sudah selesai')}</div></div></div>
        <div><div class="muted" style="font-size:11.5px">Dikerjakan</div><div>${H(p.pengerjaNama || 'Belum diambil')}</div></div>
        <div><div class="muted" style="font-size:11.5px">Diajukan</div><div>${H(fmtWaktu(p.dibuat))}</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <h3 style="margin:0 0 8px">Brief</h3>
      <div style="white-space:pre-wrap;font-size:13.5px;line-height:1.65">${H(p.brief)}</div>
      ${p.keterangan ? `<div style="margin-top:12px"><div class="muted" style="font-size:11.5px">Keterangan tambahan</div><div style="white-space:pre-wrap;font-size:13.5px">${H(p.keterangan)}</div></div>` : ''}
      ${p.bahan ? `<div style="margin-top:12px"><div class="muted" style="font-size:11.5px">Bahan dari pemohon</div>
        <a href="${H(p.bahan)}" target="_blank" rel="noopener noreferrer">Buka folder bahan di Google Drive</a></div>` : ''}
    </div>

    <div class="card" style="margin-bottom:14px">
      <h3 style="margin:0 0 8px">Hasil desain</h3>
      ${hasil.length ? hasil.map((h) => `
        <div style="border:1px solid var(--border);border-radius:11px;padding:11px 13px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <a href="${H(h.tautan)}" target="_blank" rel="noopener noreferrer" style="font-weight:600">Buka hasil versi ${H(h.versi)} di Google Drive</a>
            <span class="muted" style="font-size:12px">${H(h.olehNama)} · ${H(fmtWaktu(h.waktu))}</span>
          </div>
          ${h.catatan ? `<div style="font-size:13px;margin-top:5px;color:var(--text2)">${H(h.catatan)}</div>` : ''}
        </div>`).join('')
        : '<p class="muted" style="margin:0;font-size:13.5px">Belum ada hasil yang dikirim.</p>'}
    </div>

    <div class="card">
      <h3 style="margin:0 0 4px">Jalannya proses</h3>
      <div class="muted" style="font-size:12.5px;margin-bottom:14px">Tercatat otomatis, tidak bisa diubah belakangan</div>
      ${linimasa(p.jejak || [])}
    </div>`;

  $('#akKembali').onclick = () => { history.length > 1 ? history.back() : (location.hash = '#semua'); };

  const segar = () => gambarDetail(el, id);

  const bAmbil = $('#akAmbil');
  if (bAmbil) bAmbil.onclick = async () => {
    try { const h = await rpc('kerja.ambil', { id }); toast(h.pesan); await segar(); }
    catch (e) { toast(e.message, 'galat'); }
  };

  const bKirim = $('#akKirim');
  if (bKirim) bKirim.onclick = () => {
    modal('Kirim hasil desain', `
      <p class="fld-ket" style="margin:0 0 12px">Unggah hasilnya ke Google Drive, atur aksesnya supaya bisa dibuka orang lembaga, lalu tempelkan tautannya di sini.</p>
      <div class="fgrid">
        <div class="fld" data-col="12">
          <label for="mTautan">Tautan Google Drive <b class="req">*</b></label>
          <input id="mTautan" placeholder="https://drive.google.com/..." autocomplete="off">
        </div>
        <div class="fld" data-col="12">
          <label for="mCatatan">Catatan untuk pemohon</label>
          <textarea id="mCatatan" rows="3" placeholder="Misalnya: ukuran 1080x1350, sudah termasuk versi story"></textarea>
        </div>
      </div>`,
      null,
      '<button class="btn" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="mKirim">Kirim</button>');
    $('#mKirim').onclick = async () => {
      try {
        const h = await rpc('kerja.kirim', { id, tautan: $('#mTautan').value, catatan: $('#mCatatan').value });
        tutupModal(); toast(h.pesan); await segar();
      } catch (e) { toast(e.message, 'galat'); }
    };
  };

  const bRevisi = $('#akRevisi');
  if (bRevisi) bRevisi.onclick = () => {
    modal('Minta revisi', `
      <p class="fld-ket" style="margin:0 0 12px">Tuliskan bagian mana yang perlu diperbaiki. Catatan ini masuk ke jalannya proses dan terbaca tim media, jadi tidak perlu diulang lewat WhatsApp.</p>
      <div class="fgrid"><div class="fld" data-col="12">
        <label for="mAlasan">Yang perlu diperbaiki <b class="req">*</b></label>
        <textarea id="mAlasan" rows="4" placeholder="Misalnya: logo Lazismu kurang besar, tanggal kegiatan salah ketik"></textarea>
      </div></div>`,
      null,
      '<button class="btn" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="mRevisi">Kirim permintaan</button>');
    $('#mRevisi').onclick = async () => {
      try {
        const h = await rpc('permohonan.revisi', { id, catatan: $('#mAlasan').value });
        tutupModal(); toast(h.pesan); await segar();
      } catch (e) { toast(e.message, 'galat'); }
    };
  };

  const bBagi = $('#akBagi');
  if (bBagi) bBagi.onclick = () => {
    const pil = Object.entries(negara.labelBidang)
      .map(([k, v]) => `<option value="${H(k)}"${k === p.bidang ? ' selected' : ''}>${H(v)}</option>`).join('');
    modal('Pindahkan ke bidang lain', `
      <div class="fgrid"><div class="fld" data-col="12">
        <label for="mBidang">Bidang tujuan</label>
        <select id="mBidang">${pil}</select>
      </div></div>`,
      null,
      '<button class="btn" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="mBagi">Pindahkan</button>');
    $('#mBagi').onclick = async () => {
      try {
        const h = await rpc('permohonan.bagi', { id, bidang: $('#mBidang').value });
        tutupModal(); toast(h.pesan); await segar();
      } catch (e) { toast(e.message, 'galat'); }
    };
  };
}

// ============================================================ AJUKAN
halaman.ajukan = {
  judul: 'Ajukan Desain',
  sub: '',
  async gambar(el) {
    const pilJenis = negara.jenis.map((j) =>
      `<option value="${H(j.kode)}" data-contoh="${H(j.contoh)}">${H(j.label)}</option>`).join('');
    el.innerHTML = `<div class="card md-form">
      <div class="fgrid">
        <div class="fld" data-col="6">
          <label for="fJenis">Jenis media <b class="req">*</b></label>
          <select id="fJenis"><option value="">Pilih jenis</option>${pilJenis}</select>
          <div class="fld-ket" id="fContoh"></div>
        </div>
        <div class="fld" data-col="6">
          <label for="fDeadline">Dipakai tanggal <b class="req">*</b></label>
          <input type="date" id="fDeadline" min="${H(negara.hariIni)}" value="${H(negara.hariIni)}">
          <div class="fld-ket">Tanggal desainnya dipakai, bukan tanggal selesai.</div>
        </div>
        <div class="fld" data-col="12">
          <label for="fJudul">Judul <b class="req">*</b></label>
          <input id="fJudul" maxlength="120" placeholder="Flyer Kajian Ahad Pagi 12 Oktober">
        </div>
        <div class="fld" data-col="12">
          <label for="fBrief">Brief <b class="req">*</b></label>
          <textarea id="fBrief" rows="7" maxlength="4000"
            placeholder="Teks yang harus muncul, suasana atau warna, logo dan foto yang wajib ada, contoh desain yang disukai."></textarea>
        </div>
        <div class="fld" data-col="6">
          <label for="fBahan">Bahan di Google Drive</label>
          <input id="fBahan" placeholder="https://drive.google.com/...">
        </div>
        <div class="fld" data-col="6">
          <label for="fKeterangan">Keterangan</label>
          <input id="fKeterangan" maxlength="500" placeholder="Opsional">
        </div>
      </div>
      <div class="md-form-aksi"><button class="btn btn-primary" id="fKirim">Kirim permohonan</button></div>
    </div>`;

    const sJenis = $('#fJenis');
    sJenis.onchange = () => {
      const o = sJenis.options[sJenis.selectedIndex];
      $('#fContoh').textContent = (o && o.dataset.contoh) || '';
    };

    $('#fKirim').onclick = async () => {
      const data = {
        jenis: $('#fJenis').value,
        judul: $('#fJudul').value,
        brief: $('#fBrief').value,
        deadline: $('#fDeadline').value,
        bahan: $('#fBahan').value,
        keterangan: $('#fKeterangan').value,
      };
      try {
        const h = await rpc('permohonan.ajukan', data);
        toast(h.pesan);
        location.hash = '#p/' + h.permohonan.id;
      } catch (e) { toast(e.message, 'galat'); }
    };
  },
};

// ============================================================ DAFTAR
function bilahSaring(id) {
  const pilJenis = negara.jenis.map((j) => `<option value="${H(j.kode)}">${H(j.label)}</option>`).join('');
  return `<div class="card md-saring">
    <div class="fgrid">
      <div class="fld" data-col="6">
        <label for="${id}Cari">Cari</label>
        <input id="${id}Cari" placeholder="Nomor, judul, atau nama pemohon">
      </div>
      <div class="fld" data-col="3">
        <label for="${id}Status">Status</label>
        <select id="${id}Status">
          <option value="">Semua status</option>
          <option value="baru">Menunggu</option>
          <option value="diproses">Dikerjakan</option>
          <option value="selesai">Selesai</option>
        </select>
      </div>
      <div class="fld" data-col="3">
        <label for="${id}Jenis">Jenis</label>
        <select id="${id}Jenis"><option value="">Semua jenis</option>${pilJenis}</select>
      </div>
    </div>
  </div>`;
}

function pasangSaring(id, muat) {
  let jam = null;
  const jalan = () => { clearTimeout(jam); jam = setTimeout(muat, 220); };
  $('#' + id + 'Cari').oninput = jalan;
  $('#' + id + 'Status').onchange = muat;
  $('#' + id + 'Jenis').onchange = muat;
}

function nilaiSaring(id) {
  return {
    cari: $('#' + id + 'Cari').value,
    status: $('#' + id + 'Status').value,
    jenis: $('#' + id + 'Jenis').value,
  };
}

halaman.semua = {
  judul: 'Permohonan',
  sub: '',
  async gambar(el) {
    el.innerHTML = bilahSaring('sm') + '<div id="smIsi"></div>';
    const muat = async () => {
      const kotak = $('#smIsi');
      kotak.innerHTML = '<p class="muted">Memuat…</p>';
      try {
        const h = await rpc('permohonan.daftar', nilaiSaring('sm'));
        kotak.innerHTML = ringkasStrip(h.ringkas) + tabelPermohonan(h.baris, {
          kosong: 'Tidak ada permohonan yang cocok dengan saringan ini.',
        });
        pasangKlikBaris(kotak);
      } catch (e) { kotak.innerHTML = galatKotak(e.message); }
    };
    pasangSaring('sm', muat);
    await muat();
  },
};

const ringkasStrip = (r) => barisKpi(
  kpi('Total', fmtAngka(r.total), IK.tumpuk, WARNA.jingga)
  + kpi('Menunggu', fmtAngka(r.baru), IK.jam, WARNA.kuning)
  + kpi('Dikerjakan', fmtAngka(r.diproses), IK.kerja, WARNA.biru)
  + kpi('Selesai', fmtAngka(r.selesai), IK.centang, WARNA.hijau)
  + kpi('Lewat Tanggal', fmtAngka(r.terlambat), IK.seru, WARNA.merah), true);

halaman.kotak = {
  judul: 'Kotak Kerja',
  sub: '',
  async gambar(el) {
    if (!negara.bidangSaya.length && !negara.koordinator) {
      el.innerHTML = kosongKotak('&#128100;',
        'Anda belum ditugaskan ke bidang mana pun. Minta koordinator menambahkan Anda di Tim Media.');
      return;
    }
    el.innerHTML = bilahSaring('kt') + '<div id="ktIsi"></div>';
    const muat = async () => {
      const kotak = $('#ktIsi');
      kotak.innerHTML = '<p class="muted">Memuat…</p>';
      try {
        const h = await rpc('permohonan.daftar', { ...nilaiSaring('kt'), kotak: 'kotak' });
        kotak.innerHTML = ringkasStrip(h.ringkas) + tabelPermohonan(h.baris, {
          kosong: 'Tidak ada permohonan di bidang Anda saat ini.',
        });
        pasangKlikBaris(kotak);
      } catch (e) { kotak.innerHTML = galatKotak(e.message); }
    };
    pasangSaring('kt', muat);
    await muat();
  },
};

// ============================================================ TIM MEDIA
halaman.tim = {
  judul: 'Tim Media',
  sub: '',
  async gambar(el) {
    const d = await rpc('tim.daftar');
    const bidang = Object.entries(d.bidang);

    const peringatan = d.bidangKosong.length
      ? `<div class="card" style="border-color:var(--red);margin-bottom:14px;padding:13px 16px">
          <b style="color:var(--red)">Tanpa anggota:</b>
          ${H(d.bidangKosong.map((b) => d.bidang[b] || b).join(', '))}
        </div>` : '';

    const barisTim = d.anggota.length ? d.anggota.map((a) => `
      <tr>
        <td><div style="font-weight:600">${H(a.nama)}</div>
            <div class="muted" style="font-size:11.5px">${H(a.catatan || '')}</div></td>
        <td>${(a.bidang || []).length
          ? a.bidang.map((b) => `<span class="badge">${H(d.bidang[b] || b)}</span>`).join(' ')
          : '<span class="muted">belum ada bidang</span>'}</td>
        <td>${a.aktif === false ? '<span class="badge" style="color:var(--red)">nonaktif</span>' : '<span class="badge" style="color:var(--green)">aktif</span>'}</td>
        <td style="text-align:right">
          <button class="btn btn-sm tm-ubah" data-id="${H(a.userId)}">Ubah</button>
          <button class="btn btn-sm btn-danger tm-hapus" data-id="${H(a.userId)}" data-nama="${H(a.nama)}">Keluarkan</button>
        </td>
      </tr>`).join('') : '';

    el.innerHTML = peringatan
      + `<div class="card" style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
            <h3 style="margin:0">Anggota tim media</h3>
            <button class="btn btn-primary btn-sm" id="tmTambah">Tambah anggota</button>
          </div>
          ${barisTim
            ? `<div class="tabel-geser"><table><thead><tr><th>Nama</th><th>Bidang</th><th>Status</th><th></th></tr></thead><tbody>${barisTim}</tbody></table></div>`
            : kosongKotak('&#128101;', 'Belum ada anggota tim media. Tambahkan dulu, kalau tidak permohonan tidak akan masuk ke kotak siapa pun.')}
        </div>
        <div class="card">
          <h3 style="margin:0 0 8px">Jenis apa masuk bidang mana</h3>
          <div class="muted" style="font-size:12.5px;margin-bottom:10px">Pembagian ini tetap; yang bisa diatur adalah siapa memegang bidangnya.</div>
          ${bidang.map(([k, v]) => `<div style="margin-bottom:8px">
            <b>${H(v)}</b><div class="muted" style="font-size:12.5px">${H((d.jenisPerBidang[k] || []).map((j) => (negara.jenis.find((x) => x.kode === j) || {}).label || j).join(', '))}</div>
          </div>`).join('')}
          <div style="margin-top:8px"><b>Lainnya</b><div class="muted" style="font-size:12.5px">Tidak punya bidang tetap; koordinator yang membagikannya satu per satu.</div></div>
        </div>`;

    const formAnggota = (a) => {
      const pilAkun = d.akun.map((u) =>
        `<option value="${H(u.id)}"${a && a.userId === u.id ? ' selected' : ''}>${H(u.nama)}${u.username ? ` (${H(u.username)})` : ''}</option>`).join('');
      /* Barisnya memakai komponen .penerima/.penerima-baris milik Broadcast,
         bukan baris buatan sendiri: nama kiri yang memendek dengan titik-titik,
         keterangan kanan yang tidak ikut menyusut, dan kotak centang yang tidak
         melar. Satu komponen dipakai dua modul, jadi berubahnya pun sekali. */
      const cek = bidang.map(([k, v]) => `<label class="penerima-baris">
        <input type="checkbox" class="tmB" value="${H(k)}"${a && (a.bidang || []).includes(k) ? ' checked' : ''}>
        <span class="pilih-nama">${H(v)}</span>
        <span class="pilih-ket">${H((d.jenisPerBidang[k] || []).length)} jenis media</span></label>`).join('');
      modal(a ? 'Ubah anggota tim' : 'Tambah anggota tim', `
        <div class="fgrid">
          <div class="fld" data-col="12">
            <label for="tmAkun">Akun LAZDigital <b class="req">*</b></label>
            <select id="tmAkun"${a ? ' disabled' : ''}><option value="">-- pilih akun --</option>${pilAkun}</select>
            <div class="fld-ket">Akun yang sudah ada. Modul ini tidak membuat akun baru.</div>
          </div>
          <div class="fld" data-col="12">
            <label>Bidang yang dipegang</label>
            <div class="penerima">${cek}</div>
            <div class="fld-ket">Boleh lebih dari satu. Yang memegang kamera sering juga yang mengedit videonya.</div>
          </div>
          <div class="fld" data-col="12">
            <label for="tmCatatan">Catatan</label>
            <input id="tmCatatan" maxlength="200" value="${a ? H(a.catatan || '') : ''}" placeholder="Misalnya: hanya hari Sabtu">
          </div>
        </div>`,
        null,
        '<button class="btn" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="tmSimpan">Simpan</button>');
      $('#tmSimpan').onclick = async () => {
        const sel = $('#tmAkun');
        const userId = a ? a.userId : sel.value;
        const nama = a ? a.nama : (sel.options[sel.selectedIndex] || {}).text || '';
        if (!userId) { toast('Pilih akunnya dulu.', 'galat'); return; }
        try {
          const h = await rpc('tim.simpan', {
            userId,
            nama: String(nama).replace(/\s*\([^)]*\)\s*$/, ''),
            bidang: $$('.tmB').filter((c) => c.checked).map((c) => c.value),
            catatan: $('#tmCatatan').value,
          });
          tutupModal(); toast(h.pesan); await halaman.tim.gambar(el);
        } catch (e) { toast(e.message, 'galat'); }
      };
    };

    $('#tmTambah').onclick = () => formAnggota(null);
    $$('.tm-ubah', el).forEach((b) => {
      b.onclick = () => formAnggota(d.anggota.find((x) => x.userId === b.dataset.id));
    });
    $$('.tm-hapus', el).forEach((b) => {
      b.onclick = async () => {
        modal('Keluarkan dari tim media',
          `<p style="font-size:13.5px;line-height:1.6">Keluarkan <b>${H(b.dataset.nama)}</b> dari tim media?
           Permohonan yang pernah ia kerjakan tetap tercatat atas namanya.</p>`,
          null,
          '<button class="btn" onclick="tutupModal()">Batal</button><button class="btn btn-danger" id="tmYa">Keluarkan</button>');
        $('#tmYa').onclick = async () => {
          try {
            const h = await rpc('tim.hapus', { userId: b.dataset.id });
            tutupModal(); toast(h.pesan); await halaman.tim.gambar(el);
          } catch (e) { toast(e.message, 'galat'); }
        };
      };
    });
  },
};

// ============================================================ REKAP
halaman.rekap = {
  judul: 'Rekap',
  sub: '',
  async gambar(el) {
    /* Pemilih rentang yang sama persis dengan halaman Fundraiser dan halaman
       utama, dari js/lz-ui.js. Dua kotak tanggal bawaan peramban sudah
       digantikan kalender bertema oleh enhancer, tetapi rentang butuh dua
       tanggal yang saling terkait, dan itu lebih enak dipilih dalam satu
       kalender: klik tanggal awal, klik tanggal akhir, selesai. */
    const rt = { dari: '', sampai: '' };
    el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
        <span style="width:262px;flex:none">${rentangHTML('rtMedia', '', '', { kosong: 'Semua tanggal' })}</span>
      </div><div id="rkIsi"></div>`;

    const tabelKelompok = (judul, dot, baris, kolom) => wc(judul, dot,
      baris.length ? `<div class="tabel-geser"><table>
          <thead><tr><th>${H(kolom)}</th><th>Total</th><th>Selesai</th><th>Telat</th><th>Revisi</th></tr></thead>
          <tbody>${baris.map((b) => `<tr>
            <td>${H(b.label)}</td><td>${fmtAngka(b.total)}</td><td>${fmtAngka(b.selesai)}</td>
            <td${b.terlambat ? ' style="color:var(--red);font-weight:700"' : ''}>${fmtAngka(b.terlambat)}</td>
            <td>${fmtAngka(b.revisi)}</td></tr>`).join('')}</tbody></table></div>`
        : kosongKecil('Belum ada data pada rentang ini.'));

    const muat = async () => {
      const kotak = $('#rkIsi');
      kotak.innerHTML = '<p class="muted">Memuat…</p>';
      try {
        const d = await rpc('rekap.ringkas', { dari: rt.dari, sampai: rt.sampai });
        kotak.innerHTML = ringkasStrip(d.ringkas)
          + `<div class="dgrid md-dgrid">
              ${tabelKelompok('Per Bidang', 'var(--purple)', d.perBidang, 'Bidang')}
              ${tabelKelompok('Per Jenis', 'var(--blue)', d.perJenis, 'Jenis')}
              ${tabelKelompok('Per Pemohon', 'var(--accent2)', d.perPemohon, 'Pemohon')}
              ${tabelKelompok('Per Pengerja', 'var(--green)', d.perPengerja, 'Nama')}
            </div>`
          + `<div class="card" style="margin-top:16px"><h3 style="margin:0 0 10px">Rincian</h3>${tabelPermohonan(d.baris)}</div>`;
        pasangKlikBaris(kotak);
      } catch (e) { kotak.innerHTML = galatKotak(e.message); }
    };
    rentangPasang('rtMedia', {
      dari: '', sampai: '', bolehKosong: true, kosong: 'Semua tanggal',
      onTerap: (dari, sampai) => {
        if (dari === rt.dari && sampai === rt.sampai) return;
        rt.dari = dari; rt.sampai = sampai;
        muat();
      },
    });
    await muat();
  },
};

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

async function buka(rute) {
  /* Rute #p/<id> membuka satu permohonan. Ditaruh di alamat, bukan disimpan di
     variabel, supaya tautannya bisa disalin ke WhatsApp dan langsung membuka
     permohonan yang dimaksud, bukan halaman depan. */
  if (rute.startsWith('p/')) {
    negara.halaman = 'detail';
    tandaiMenu('');
    window.scrollTo({ top: 0 });
    $('#isi').innerHTML = kepalaHalaman('Permohonan Desain', '') + '<div id="isiHalaman"></div>';
    pasangTombolTema();
    mulaiSibuk();
    try { await gambarDetail($('#isiHalaman'), rute.slice(2)); }
    catch (e) { $('#isiHalaman').innerHTML = galatKotak(e.message || 'Permohonan gagal dimuat'); }
    finally { selesaiSibuk(); }
    if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
    return;
  }

  const bolehDibuka = MENU.filter((m) => bisa(m.izin)).map((m) => m.kode);
  const kode = bolehDibuka.includes(rute) ? rute : (bolehDibuka[0] || 'dasbor');
  const h = halaman[kode] || halaman.dasbor;
  negara.halaman = kode;
  tandaiMenu(kode);
  window.scrollTo({ top: 0 });
  $('#isi').innerHTML = kepalaHalaman(h.judul, h.sub, h.aksi ? h.aksi() : '') + '<div id="isiHalaman"></div>';
  pasangTombolTema();
  const pa = $('#pintasAjukan');
  if (pa) pa.onclick = () => { location.hash = '#ajukan'; };
  mulaiSibuk();
  try { await h.gambar($('#isiHalaman')); }
  catch (e) { $('#isiHalaman').innerHTML = galatKotak(e.message || 'Halaman gagal dimuat'); }
  finally { selesaiSibuk(); }
  if (window.tandaiPerluEnhance) window.tandaiPerluEnhance();
}

function pasangTombolTema() {
  const tt = $('#tombolTema');
  if (tt) tt.onclick = () => { terapkanTema(!temaGelap()); segarTema(tt); };
}

(async function mulai() {
  try { terapkanTema(localStorage.getItem('laz_theme') === 'dark'); } catch (_) {}
  try { if (localStorage.getItem('sidebar_collapsed') === 'true') $('#appView').classList.add('collapsed'); } catch (_) {}

  $('#tombolKembali').onclick = () => { location.href = '/index.html'; };
  $('#chipPengguna').onclick = () => { location.hash = '#dasbor'; };
  document.addEventListener('visibilitychange', () => {
    $$('.lz').forEach((el) => el.classList.toggle('lz-jeda', document.hidden));
  });
  $('#modalBg').onclick = (e) => { if (e.target.id === 'modalBg') tutupModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupModal(); });

  let s;
  try { s = await rpc('media.status'); } catch (_) { location.href = '/index.html'; return; }
  negara.pengguna = s.pengguna;
  negara.izin = s.izin || [];
  negara.koordinator = !!s.koordinator;
  negara.bidangSaya = s.bidangSaya || [];
  negara.jenis = s.jenis || [];
  negara.labelBidang = s.labelBidang || {};
  negara.labelStatus = s.labelStatus || {};
  negara.labelLangkah = s.labelLangkah || {};
  negara.hariIni = s.hariIni || tglHariIni();

  $('#uName').textContent = s.pengguna.nama;
  $('#uRole').textContent = s.pengguna.peran;
  $('#uAvatar').textContent = (s.pengguna.nama || 'M').trim().charAt(0).toUpperCase();

  /* Lencana peran: ikon plus label, dan saat bilah menu dikuncupkan labelnya
     menyingkir sehingga tinggal ikonnya. Bidang yang dipegang ikut disebut,
     karena itulah yang menentukan isi kotak kerja dan paling sering jadi
     sumber pertanyaan "kenapa kotak saya kosong". */
  const ll = $('#lencanaPeran');
  if (ll) {
    const b = negara.bidangSaya.map((x) => negara.labelBidang[x] || x).join(', ');
    const label = negara.koordinator ? 'Koordinator media' : (b || s.pengguna.peran);
    ll.className = 'lingkup' + (negara.koordinator ? ' lingkup-luas' : '');
    ll.title = negara.koordinator
      ? 'Koordinator media: melihat semua, membagi bidang, dan merekap'
      : (b ? `Tim media bidang ${b}` : 'Pemohon: mengajukan permohonan desain');
    if (!s.upstash) ll.title += ' · data tersimpan di berkas lokal, bukan basis data lembaga';
    ll.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"'
      + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="2"/>'
      + '<path d="M3.5 17.5 9 12.5l3.5 3 3-2.5 5 4.5"/></svg>'
      + `<span class="lingkup-teks">${H(label)}</span>`;
    ll.hidden = false;
  }

  document.title = 'Media & Desain - LAZ Digital';
  gambarMenu();
  window.addEventListener('hashchange', () => buka(location.hash.slice(1) || 'dasbor'));

  try { await buka(location.hash.slice(1) || 'dasbor'); }
  catch (e) { $('#isi').innerHTML = kepalaHalaman('Media & Desain', '') + galatKotak(e.message || 'Halaman gagal dimuat'); }
  finally { selesaiMemuat(); }
})();
