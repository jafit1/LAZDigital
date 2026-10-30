/* lz-pengajuan.js - Modul Pengajuan Permohonan & Bantuan LAZDigital
 *
 * Skema: Hari, Tanggal, Pemohon, Alamat, Keperluan, Hasil Asesment, Status, Tanggal Pentasyarufan, Jenis Bantuan.
 * Fitur:
 *   - Tabel Daftar Pengajuan lengkap dengan filter & pencarian
 *   - Kalender Detail interaktif (pemetaan tanggal pengajuan dan pentasyarufan)
 *   - Rekapan khusus admin yang diizinkan (statistik lengkap, ekspor Excel & TSV)
 *   - Upload berkas proposal ke Google Drive (atau basis data aman)
 *   - Modul Asesmen Mustahik (F.Survei 31 Butir) terintegrasi dan saling terhubung
 */
'use strict';

(function() {
  const NAMA_HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const STATE = {
    rute: 'daftar',
    pengguna: null,
    izin: { lihat: true, tambah: false, ubah: false, hapus: false },
    drive: false,
    daftar: [],
    ringkasan: null,
    daftarAsesmen: [],
    saring: {
      cari: '',
      status: 'semua',
      jenisBantuan: 'semua',
      bulanTahun: ''
    },
    kalender: {
      tahun: new Date().getFullYear(),
      bulan: new Date().getMonth(), // 0 - 11
      tglPilih: ''
    },
    memuat: false
  };

  const IKON = {
    daftar: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    kalender: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    rekapan: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    asesmen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    proposal: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    hapus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    excel: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m9 13 4 5"/><path d="m13 13-4 5"/></svg>'
  };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rp(n) {
    return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  }
  function hitungHari(tglStr) {
    if (!tglStr) return '';
    const d = new Date(tglStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return NAMA_HARI[d.getDay()] || '';
  }
  function formatTglIndo(tglStr) {
    if (!tglStr) return '-';
    const p = tglStr.split('-');
    if (p.length !== 3) return tglStr;
    const bIdx = parseInt(p[1], 10) - 1;
    return `${parseInt(p[2], 10)} ${NAMA_BULAN[bIdx] ? NAMA_BULAN[bIdx].slice(0, 3) : p[1]} ${p[0]}`;
  }
  function toast(pesan, merah = false) {
    const t = el('toast');
    if (!t) return alert(pesan);
    t.textContent = pesan;
    t.className = 'toast show' + (merah ? ' toast--danger' : '');
    setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  async function rpc(tindakan, data = {}) {
    const token = localStorage.getItem('laz_token') || sessionStorage.getItem('laz_token') || '';
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-laz-token': token },
      body: JSON.stringify({ token, tindakan, data })
    });
    const j = await res.json().catch(() => ({ ok: false, pesan: 'Respon server tidak valid' }));
    if (!j.ok) {
      throw new Error(j.pesan || 'Terjadi kesalahan sistem');
    }
    return j;
  }

  function openModal(judul, htmlBody, htmlFoot = '') {
    el('modalTitle').textContent = judul;
    el('modalBody').innerHTML = htmlBody;
    el('modalFoot').innerHTML = htmlFoot;
    el('modalBg').classList.add('show');
    if (window.enhanceSelects) window.enhanceSelects(el('modalBody'));
  }
  function closeModal() {
    el('modalBg').classList.remove('show');
  }
  window.tutupModal = closeModal;

  async function inisialisasi() {
    try {
      const res = await rpc('pengajuan.status');
      STATE.pengguna = res.pengguna;
      STATE.izin = res.izin || {};
      STATE.drive = !!res.drive;

      if (el('uName')) el('uName').textContent = res.pengguna.nama || 'Pengguna';
      if (el('uRole')) el('uRole').textContent = res.pengguna.peran || 'Staff';
      if (el('uAvatar')) el('uAvatar').textContent = (res.pengguna.nama || 'A')[0].toUpperCase();

      pasangMenu();
      await muatData();

      window.addEventListener('hashchange', tanganiHash);
      tanganiHash();

      el('boot').classList.add('hidden');
      el('appView').classList.remove('hidden');
    } catch (e) {
      el('boot').innerHTML = `<div style="text-align:center;padding:30px">
        <h3 style="color:var(--red);margin-bottom:8px">Gagal Membuka Modul Pengajuan</h3>
        <p class="muted">${esc(e.message)}</p>
        <button class="btn btn-primary" onclick="location.href='/'" style="margin-top:14px">Kembali ke Beranda</button>
      </div>`;
    }
  }

  function pasangMenu() {
    const menu = [
      { kode: 'daftar', label: 'Daftar Pengajuan', ikon: IKON.daftar },
      { kode: 'kalender', label: 'Kalender Detail', ikon: IKON.kalender },
      { kode: 'rekapan', label: 'Rekapan Admin', ikon: IKON.rekapan },
      { kode: 'asesmen', label: 'Asesmen Mustahik (F.Survei)', ikon: IKON.asesmen },
    ];

    const nav = el('nav');
    nav.innerHTML = menu.map((m) => `
      <button class="tn-item" id="nav_${m.kode}" type="button" title="${esc(m.label)}" aria-label="${esc(m.label)}" onclick="location.hash='#${m.kode}'">
        <span class="ic">${m.ikon}</span>
        <span class="tn-tip">${esc(m.label)}</span>
      </button>
    `).join('');

    const btnKembali = el('tombolKembali');
    if (btnKembali) {
      btnKembali.onclick = () => { location.href = '/'; };
    }
  }

  function tanganiHash() {
    const h = (location.hash || '#daftar').replace(/^#/, '');
    const rute = ['daftar', 'kalender', 'rekapan', 'asesmen'].includes(h) ? h : 'daftar';
    STATE.rute = rute;

    document.querySelectorAll('.tn-item').forEach((n) => {
      n.classList.toggle('active', n.id === 'nav_' + rute);
    });

    gambarHalaman();
  }

  async function muatData() {
    try {
      const res = await rpc('pengajuan.daftar', STATE.saring);
      STATE.daftar = res.daftar || [];
      STATE.ringkasan = res.ringkasan || null;

      // Ambil riwayat asesmen mustahik untuk referensi relasi
      try {
        const resAs = await rpc('pengajuan.asesmenMustahik.daftar');
        STATE.daftarAsesmen = resAs.asesmen || [];
      } catch (_) {}
    } catch (e) {
      toast('Gagal memuat data: ' + e.message, true);
    }
  }

  // ------------------------------------------------------------------
  // RENDER UTAMA
  // ------------------------------------------------------------------
  function gambarHalaman() {
    const wadah = el('isi');
    if (!wadah) return;

    if (STATE.rute === 'daftar') {
      wadah.innerHTML = gambarDaftarHTML();
      pasangEventDaftar();
    } else if (STATE.rute === 'kalender') {
      wadah.innerHTML = gambarKalenderHTML();
      pasangEventKalender();
    } else if (STATE.rute === 'rekapan') {
      wadah.innerHTML = gambarRekapanHTML();
      pasangEventRekapan();
    } else if (STATE.rute === 'asesmen') {
      wadah.innerHTML = '<div id="asesmenHost"></div>';
      if (window.LZAsesmenMustahik && typeof window.LZAsesmenMustahik.gambar === 'function') {
        window.LZAsesmenMustahik.gambar(
          el('asesmenHost'),
          { pengguna: STATE.pengguna, izin: STATE.izin, hariIni: new Date().toISOString().slice(0, 10) },
          rpc
        );
      } else {
        wadah.innerHTML = '<div class="card" style="margin:20px 0;padding:24px;text-align:center"><p class="muted">Memuat formulir asesmen mustahik...</p></div>';
      }
    }
  }

  // ==================================================================
  // 1. TAB DAFTAR PENGAJUAN
  // ==================================================================
  function gambarDaftarHTML() {
    const list = STATE.daftar;
    const canTambah = STATE.izin.tambah || STATE.pengguna.peran === 'superadmin';

    let h = `
    <div class="page-head">
      <div>
        <h2>Daftar Pengajuan Permohonan & Bantuan</h2>
        <div class="muted" style="font-size:12px">Kelola permohonan, proposal, status, asesmen, dan tanggal pentasyarufan</div>
      </div>
      <div class="page-head-aksi">
        <button class="btn btn-ghost btn-sm" id="btnSalinTSV" type="button" title="Salin TSV">Salin TSV</button>
        <button class="btn btn-ghost btn-sm" id="btnUnduhExcel" type="button" title="Unduh Excel">${IKON.excel} Excel</button>
        ${canTambah ? `<button class="btn btn-ghost btn-sm" id="btnBukaImpor" type="button" title="Impor dari Google Spreadsheet / Berkas">${IKON.proposal} Impor Spreadsheet</button>` : ''}
        ${canTambah ? `<button class="btn btn-primary btn-sm" id="btnTambahPengajuan" type="button">${IKON.plus} Catat Pengajuan</button>` : ''}
      </div>
    </div>`;

    // Filter toolbar
    h += `
    <div class="toolbar" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <div class="field" style="margin:0;flex:2;min-width:200px">
        <input type="text" id="pjCari" class="input" placeholder="Cari pemohon, alamat, keperluan, jenis..." value="${esc(STATE.saring.cari)}" style="height:32px;font-size:12.5px;width:100%">
      </div>
      <div class="field" style="margin:0;flex:1;min-width:140px">
        <select id="pjFilterStatus" class="input" style="height:32px;font-size:12.5px;width:100%">
          <option value="semua">Semua Status (${list.length})</option>
          <option value="Masuk" ${STATE.saring.status === 'Masuk' ? 'selected' : ''}>Masuk</option>
          <option value="Diproses" ${STATE.saring.status === 'Diproses' ? 'selected' : ''}>Diproses</option>
          <option value="Disetujui" ${STATE.saring.status === 'Disetujui' ? 'selected' : ''}>Disetujui</option>
          <option value="Ditasyarufkan" ${STATE.saring.status === 'Ditasyarufkan' ? 'selected' : ''}>Ditasyarufkan</option>
          <option value="Ditolak" ${STATE.saring.status === 'Ditolak' ? 'selected' : ''}>Ditolak</option>
        </select>
      </div>
      <div class="field" style="margin:0;flex:1.2;min-width:160px">
        <select id="pjFilterJenis" class="input" style="height:32px;font-size:12.5px;width:100%">
          <option value="semua">Semua Jenis Bantuan</option>
          <option value="Pendidikan" ${STATE.saring.jenisBantuan === 'Pendidikan' ? 'selected' : ''}>Pendidikan</option>
          <option value="Kesehatan" ${STATE.saring.jenisBantuan === 'Kesehatan' ? 'selected' : ''}>Kesehatan</option>
          <option value="Ekonomi & Pemberdayaan" ${STATE.saring.jenisBantuan === 'Ekonomi & Pemberdayaan' ? 'selected' : ''}>Ekonomi & Pemberdayaan</option>
          <option value="Sosial Kemanusiaan" ${STATE.saring.jenisBantuan === 'Sosial Kemanusiaan' ? 'selected' : ''}>Sosial Kemanusiaan</option>
          <option value="Dakwah & Advokasi" ${STATE.saring.jenisBantuan === 'Dakwah & Advokasi' ? 'selected' : ''}>Dakwah & Advokasi</option>
          <option value="Lingkungan" ${STATE.saring.jenisBantuan === 'Lingkungan' ? 'selected' : ''}>Lingkungan</option>
          <option value="Zakat Mal" ${STATE.saring.jenisBantuan === 'Zakat Mal' ? 'selected' : ''}>Zakat Mal</option>
          <option value="Infak Terikat" ${STATE.saring.jenisBantuan === 'Infak Terikat' ? 'selected' : ''}>Infak Terikat</option>
          <option value="Infak Umum" ${STATE.saring.jenisBantuan === 'Infak Umum' ? 'selected' : ''}>Infak Umum</option>
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" id="btnResetSaring" type="button" style="height:32px">Reset</button>
    </div>`;

    // Tabel Pengajuan
    h += `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
        <table class="pj-table" style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
          <thead>
            <tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
              <th style="padding:9px 10px;width:65px">Hari</th>
              <th style="padding:9px 10px;width:95px">Tanggal</th>
              <th style="padding:9px 10px;min-width:140px">Pemohon</th>
              <th style="padding:9px 10px;min-width:150px">Alamat</th>
              <th style="padding:9px 10px;min-width:160px">Keperluan</th>
              <th style="padding:9px 10px;width:135px">Hasil Asesment</th>
              <th style="padding:9px 10px;width:105px">Status</th>
              <th style="padding:9px 10px;width:110px">Tgl Pentasyarufan</th>
              <th style="padding:9px 10px;min-width:130px">Jenis Bantuan</th>
              <th style="padding:9px 10px;width:105px;text-align:center">Proposal & Aksi</th>
            </tr>
          </thead>
          <tbody>`;

    if (!list.length) {
      h += `<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--muted)">Belum ada data pengajuan permohonan.</td></tr>`;
    } else {
      list.forEach((r) => {
        const hari = r.hari || hitungHari(r.tanggal);
        const tgl = formatTglIndo(r.tanggal);
        const tglSalur = r.tanggalPentasyarufan ? formatTglIndo(r.tanggalPentasyarufan) : '-';

        let badgeStatus = 'badge-muted';
        if (r.status === 'Disetujui' || r.status === 'Ditasyarufkan') badgeStatus = 'green';
        else if (r.status === 'Diproses') badgeStatus = 'amber';
        else if (r.status === 'Ditolak') badgeStatus = 'red';

        let badgeAsesmen = 'badge-muted';
        if (/sangat layak/i.test(r.hasilAsesmen)) badgeAsesmen = 'green';
        else if (/layak/i.test(r.hasilAsesmen)) badgeAsesmen = 'blue';
        else if (/belum layak/i.test(r.hasilAsesmen)) badgeAsesmen = 'red';

        h += `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 10px;font-weight:600;color:var(--text2)">${esc(hari)}</td>
          <td style="padding:8px 10px;white-space:nowrap">${esc(tgl)}</td>
          <td style="padding:8px 10px">
            <div style="font-weight:700;color:var(--text)">${esc(r.pemohon)}</div>
            ${r.telepon ? `<div class="muted" style="font-size:11px">${esc(r.telepon)}</div>` : ''}
          </td>
          <td style="padding:8px 10px;color:var(--text2);line-height:1.35;max-width:200px">${esc(r.alamat)}</td>
          <td style="padding:8px 10px;line-height:1.35;max-width:220px">
            <div>${esc(r.keperluan)}</div>
            ${r.nominalDiajukan ? `<div class="muted" style="font-size:11px;margin-top:2px">Nominal: <b>${rp(r.nominalDiajukan)}</b></div>` : ''}
          </td>
          <td style="padding:8px 10px">
            <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">
              ${r.asesmenId ? `
                <button type="button" class="badge ${badgeAsesmen}" style="font-size:10px;cursor:pointer;border:none;text-align:left" title="Lihat lembar hasil survei resmi" onclick="LZPengajuan.lihatAsesmen('${esc(r.asesmenId)}')">
                  ✓ ${esc(r.hasilAsesmen || 'Layak')}
                </button>
              ` : `
                <span class="badge ${badgeAsesmen}" style="font-size:10.5px">${esc(r.hasilAsesmen || 'Belum Diasesmen')}</span>
                <button type="button" class="btn btn-xs btn-ghost" style="font-size:9.5px;padding:1px 5px" onclick="LZPengajuan.mulaiAsesmenUntukPengajuan('${esc(r.id)}')">
                  + Asesmen
                </button>
              `}
            </div>
          </td>
          <td style="padding:8px 10px">
            <span class="badge ${badgeStatus}" style="font-size:10.5px">${esc(r.status)}</span>
          </td>
          <td style="padding:8px 10px;white-space:nowrap">
            ${esc(tglSalur)}
            ${r.nominalDisetujui ? `<div style="font-size:11px;color:var(--green);font-weight:700">${rp(r.nominalDisetujui)}</div>` : ''}
          </td>
          <td style="padding:8px 10px">
            <span class="badge badge-muted" style="font-size:10.5px;background:var(--surface2)">${esc(r.jenisBantuan)}</span>
          </td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap">
            <div style="display:flex;gap:4px;justify-content:center;align-items:center">
              ${r.proposal ? `
                <button type="button" class="btn btn-xs btn-ghost" title="Unduh Proposal: ${esc(r.proposal.nama)}" onclick="LZPengajuan.unduhProposal('${esc(r.id)}')">
                  ${IKON.proposal}
                </button>
              ` : ''}
              <button type="button" class="btn btn-xs btn-ghost" title="Sunting" onclick="LZPengajuan.bukaFormEdit('${esc(r.id)}')">
                ${IKON.edit}
              </button>
              ${STATE.izin.hapus || STATE.pengguna.peran === 'superadmin' ? `
                <button type="button" class="btn btn-xs btn-ghost text-danger" title="Hapus" onclick="LZPengajuan.hapusPengajuan('${esc(r.id)}')">
                  ${IKON.hapus}
                </button>
              ` : ''}
            </div>
          </td>
        </tr>`;
      });
    }

    h += `</tbody></table></div></div>`;
    return h;
  }

  function pasangEventDaftar() {
    const inpCari = el('pjCari');
    if (inpCari) {
      let tmr = null;
      inpCari.oninput = () => {
        clearTimeout(tmr);
        tmr = setTimeout(async () => {
          STATE.saring.cari = inpCari.value.trim();
          await muatData();
          gambarHalaman();
        }, 300);
      };
    }

    const selStatus = el('pjFilterStatus');
    if (selStatus) {
      selStatus.onchange = async () => {
        STATE.saring.status = selStatus.value;
        await muatData();
        gambarHalaman();
      };
    }

    const selJenis = el('pjFilterJenis');
    if (selJenis) {
      selJenis.onchange = async () => {
        STATE.saring.jenisBantuan = selJenis.value;
        await muatData();
        gambarHalaman();
      };
    }

    const btnReset = el('btnResetSaring');
    if (btnReset) {
      btnReset.onclick = async () => {
        STATE.saring = { cari: '', status: 'semua', jenisBantuan: 'semua', bulanTahun: '' };
        await muatData();
        gambarHalaman();
      };
    }

    const btnTambah = el('btnTambahPengajuan');
    if (btnTambah) {
      btnTambah.onclick = () => bukaFormTambah();
    }

    const btnExcel = el('btnUnduhExcel');
    if (btnExcel) btnExcel.onclick = unduhExcel;

    const btnTSV = el('btnSalinTSV');
    if (btnTSV) btnTSV.onclick = salinTSV;

    const btnImpor = el('btnBukaImpor');
    if (btnImpor) btnImpor.onclick = bukaModalImpor;
  }

  // ==================================================================
  // 2. TAB KALENDER DETAIL
  // ==================================================================
  function gambarKalenderHTML() {
    const k = STATE.kalender;
    const thn = k.tahun;
    const bln = k.bulan;
    const namaBln = NAMA_BULAN[bln];

    const tglPertama = new Date(thn, bln, 1);
    const hariMulai = tglPertama.getDay();
    const jmlHari = new Date(thn, bln + 1, 0).getDate();

    const mapMasuk = {};
    const mapSalur = {};

    STATE.daftar.forEach((r) => {
      if (r.tanggal) {
        mapMasuk[r.tanggal] = (mapMasuk[r.tanggal] || []).concat(r);
      }
      if (r.tanggalPentasyarufan) {
        mapSalur[r.tanggalPentasyarufan] = (mapSalur[r.tanggalPentasyarufan] || []).concat(r);
      }
    });

    let h = `
    <div class="page-head">
      <div>
        <h2>Kalender Detail Pengajuan & Pentasyarufan</h2>
        <div class="muted" style="font-size:12px">Pantau permohonan masuk dan jadwal pentasyarufan per hari</div>
      </div>
      <div class="page-head-aksi">
        <button class="btn btn-ghost btn-sm" id="btnKalPrev">&larr; Bulan Sebelumnya</button>
        <button class="btn btn-ghost btn-sm" id="btnKalKini">Bulan Ini</button>
        <button class="btn btn-ghost btn-sm" id="btnKalNext">Bulan Berikutnya &rarr;</button>
      </div>
    </div>`;

    h += `
    <div class="card" style="margin-bottom:14px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:var(--surface2)">
      <div style="font-size:16px;font-weight:800;color:var(--text)">${namaBln} ${thn}</div>
      <div style="display:flex;gap:12px;font-size:11.5px">
        <span><span class="badge blue" style="font-size:10px;margin-right:4px">●</span> Pengajuan Masuk</span>
        <span><span class="badge green" style="font-size:10px;margin-right:4px">●</span> Pentasyarufan</span>
      </div>
    </div>`;

    h += `
    <div class="card" style="padding:10px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(7, 1fr);gap:4px;text-align:center;font-size:12px">`;

    NAMA_HARI.forEach((namaH) => {
      h += `<div style="font-weight:700;padding:6px 0;color:var(--muted)">${namaH}</div>`;
    });

    for (let i = 0; i < hariMulai; i++) {
      h += `<div style="min-height:75px;background:var(--surface2);opacity:0.3;border-radius:6px"></div>`;
    }

    const tglHariIni = new Date().toISOString().slice(0, 10);

    for (let d = 1; d <= jmlHari; d++) {
      const mm = String(bln + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const strTgl = `${thn}-${mm}-${dd}`;

      const listM = mapMasuk[strTgl] || [];
      const listS = mapSalur[strTgl] || [];
      const isHariIni = strTgl === tglHariIni;
      const isPilih = strTgl === k.tglPilih;

      h += `
      <div class="pj-kal-sel" data-tgl="${strTgl}" style="min-height:78px;padding:5px;border-radius:6px;border:1px solid ${isPilih ? 'var(--accent)' : 'var(--border)'};background:${isPilih ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface)'};cursor:pointer;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:${isHariIni ? '800' : '600'};color:${isHariIni ? 'var(--accent)' : 'var(--text)'};${isHariIni ? 'text-decoration:underline' : ''}">${d}</span>
          ${isHariIni ? '<span class="badge amber" style="font-size:9px;padding:1px 4px">Hari Ini</span>' : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">
          ${listM.length ? `<span class="badge blue" style="font-size:9.5px;padding:1px 4px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${listM.length} Masuk</span>` : ''}
          ${listS.length ? `<span class="badge green" style="font-size:9.5px;padding:1px 4px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${listS.length} Salur</span>` : ''}
        </div>
      </div>`;
    }

    h += `</div></div>`;

    const tglAktif = k.tglPilih || tglHariIni;
    const rincianM = mapMasuk[tglAktif] || [];
    const rincianS = mapSalur[tglAktif] || [];

    h += `
    <div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div>
          <h3 style="margin:0;font-size:15px;color:var(--text)">Rincian Tanggal: ${esc(hitungHari(tglAktif))}, ${esc(formatTglIndo(tglAktif))}</h3>
          <div class="muted" style="font-size:11.5px">Total ${rincianM.length} pengajuan masuk dan ${rincianS.length} pentasyarufan pada tanggal ini</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" onclick="LZPengajuan.bukaFormTambah('${esc(tglAktif)}')">+ Catat di Tanggal Ini</button>
      </div>`;

    if (!rincianM.length && !rincianS.length) {
      h += `<div class="muted" style="text-align:center;padding:24px;font-size:12.5px">Tidak ada agenda pengajuan maupun pentasyarufan di tanggal ini.</div>`;
    } else {
      if (rincianM.length) {
        h += `<div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:var(--blue)">● Pengajuan Masuk (${rincianM.length}):</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">`;
        rincianM.forEach((item) => {
          h += `
          <div class="card" style="padding:10px 14px;background:var(--surface2);border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-weight:700;font-size:13px">${esc(item.pemohon)} <span class="badge badge-muted" style="font-size:10px">${esc(item.jenisBantuan)}</span></div>
              <div style="font-size:12px;color:var(--text2);margin-top:2px">${esc(item.keperluan)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="badge ${item.status === 'Disetujui' ? 'green' : 'amber'}" style="font-size:11px">${esc(item.status)}</span>
              <button class="btn btn-xs btn-ghost" onclick="LZPengajuan.bukaFormEdit('${esc(item.id)}')">Buka</button>
            </div>
          </div>`;
        });
        h += `</div>`;
      }

      if (rincianS.length) {
        h += `<div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:var(--green)">● Pentasyarufan Bantuan (${rincianS.length}):</div>
        <div style="display:flex;flex-direction:column;gap:8px">`;
        rincianS.forEach((item) => {
          h += `
          <div class="card" style="padding:10px 14px;background:var(--surface2);border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-weight:700;font-size:13px">${esc(item.pemohon)} <span class="badge green" style="font-size:10px">${rp(item.nominalDisetujui)}</span></div>
              <div style="font-size:12px;color:var(--text2);margin-top:2px">Bantuan: ${esc(item.jenisBantuan)} · ${esc(item.keperluan)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="btn btn-xs btn-ghost" onclick="LZPengajuan.bukaFormEdit('${esc(item.id)}')">Buka</button>
            </div>
          </div>`;
        });
        h += `</div>`;
      }
    }

    h += `</div>`;
    return h;
  }

  function pasangEventKalender() {
    el('btnKalPrev').onclick = () => {
      let b = STATE.kalender.bulan - 1;
      let t = STATE.kalender.tahun;
      if (b < 0) { b = 11; t--; }
      STATE.kalender.bulan = b;
      STATE.kalender.tahun = t;
      gambarHalaman();
    };

    el('btnKalKini').onclick = () => {
      STATE.kalender.bulan = new Date().getMonth();
      STATE.kalender.tahun = new Date().getFullYear();
      STATE.kalender.tglPilih = new Date().toISOString().slice(0, 10);
      gambarHalaman();
    };

    el('btnKalNext').onclick = () => {
      let b = STATE.kalender.bulan + 1;
      let t = STATE.kalender.tahun;
      if (b > 11) { b = 0; t++; }
      STATE.kalender.bulan = b;
      STATE.kalender.tahun = t;
      gambarHalaman();
    };

    document.querySelectorAll('.pj-kal-sel').forEach((cell) => {
      cell.onclick = () => {
        STATE.kalender.tglPilih = cell.dataset.tgl;
        gambarHalaman();
      };
    });
  }

  // ==================================================================
  // 3. TAB REKAPAN ADMIN
  // ==================================================================
  function gambarRekapanHTML() {
    const r = STATE.ringkasan || {
      totalPengajuan: STATE.daftar.length,
      totalDiajukan: 0,
      totalDisetujui: 0,
      perStatus: {},
      perJenis: {},
      perAsesmen: {}
    };

    let h = `
    <div class="page-head">
      <div>
        <h2>Rekapan Pengajuan & Penyaluran Bantuan</h2>
        <div class="muted" style="font-size:12px">Ringkasan statistik permohonan, status, jenis bantuan, dan kelayakan mustahik</div>
      </div>
      <div class="page-head-aksi">
        <button class="btn btn-ghost btn-sm" id="btnRekapExcel">${IKON.excel} Unduh Excel</button>
      </div>
    </div>`;

    h += `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:18px">
      <div class="card" style="padding:14px;border-left:4px solid var(--accent)">
        <div class="muted" style="font-size:12px">Total Pengajuan Masuk</div>
        <div style="font-size:24px;font-weight:800;color:var(--text);margin-top:4px">${r.totalPengajuan}</div>
      </div>
      <div class="card" style="padding:14px;border-left:4px solid var(--amber)">
        <div class="muted" style="font-size:12px">Sedang Diproses</div>
        <div style="font-size:24px;font-weight:800;color:var(--amber);margin-top:4px">${(r.perStatus && r.perStatus.Diproses) || 0}</div>
      </div>
      <div class="card" style="padding:14px;border-left:4px solid var(--green)">
        <div class="muted" style="font-size:12px">Disetujui / Ditasyarufkan</div>
        <div style="font-size:24px;font-weight:800;color:var(--green);margin-top:4px">${((r.perStatus && r.perStatus.Disetujui) || 0) + ((r.perStatus && r.perStatus.Ditasyarufkan) || 0)}</div>
      </div>
      <div class="card" style="padding:14px;border-left:4px solid var(--red)">
        <div class="muted" style="font-size:12px">Ditolak / Belum Memenuhi</div>
        <div style="font-size:24px;font-weight:800;color:var(--red);margin-top:4px">${(r.perStatus && r.perStatus.Ditolak) || 0}</div>
      </div>
    </div>`;

    h += `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px;margin-bottom:18px">
      <div class="card" style="padding:16px">
        <h4 style="margin:0 0 10px;font-size:13.5px">Total Nominal Dana Diajukan</h4>
        <div style="font-size:22px;font-weight:800;color:var(--blue)">${rp(r.totalDiajukan || 0)}</div>
        <div class="muted" style="font-size:11.5px;margin-top:4px">Akumulasi estimasi permohonan dari seluruh pemohon</div>
      </div>
      <div class="card" style="padding:16px">
        <h4 style="margin:0 0 10px;font-size:13.5px">Total Nominal Dana Disetujui / Ditasyarufkan</h4>
        <div style="font-size:22px;font-weight:800;color:var(--green)">${rp(r.totalDisetujui || 0)}</div>
        <div class="muted" style="font-size:11.5px;margin-top:4px">Realisasi dana bantuan yang telah disetujui / ditasyarufkan</div>
      </div>
    </div>`;

    h += `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:14px">
      <div class="card" style="padding:16px">
        <h4 style="margin:0 0 12px;font-size:13.5px">Distribusi Berdasarkan Jenis Bantuan</h4>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid var(--border)"><th style="padding:6px 0;text-align:left">Program / Pilar</th><th style="padding:6px 0;text-align:right">Jumlah</th></tr></thead>
          <tbody>`;
    Object.keys(r.perJenis || {}).forEach((j) => {
      const jml = r.perJenis[j] || 0;
      h += `<tr><td style="padding:6px 0;border-bottom:1px solid var(--border)">${esc(j)}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid var(--border);font-weight:700">${jml}</td></tr>`;
    });
    h += `</tbody></table></div>

      <div class="card" style="padding:16px">
        <h4 style="margin:0 0 12px;font-size:13.5px">Distribusi Berdasarkan Hasil Asesmen</h4>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid var(--border)"><th style="padding:6px 0;text-align:left">Kelayakan Mustahik</th><th style="padding:6px 0;text-align:right">Jumlah</th></tr></thead>
          <tbody>`;
    Object.keys(r.perAsesmen || {}).forEach((a) => {
      const jml = r.perAsesmen[a] || 0;
      h += `<tr><td style="padding:6px 0;border-bottom:1px solid var(--border)">${esc(a)}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid var(--border);font-weight:700">${jml}</td></tr>`;
    });
    h += `</tbody></table></div>
    </div>`;

    return h;
  }

  function pasangEventRekapan() {
    const btn = el('btnRekapExcel');
    if (btn) btn.onclick = unduhExcel;
  }

  // ==================================================================
  // 4. FORM TAMBAH / SUNTING PENGAJUAN
  // ==================================================================
  function bukaFormTambah(tglBawaan = '') {
    const tgl = tglBawaan || new Date().toISOString().slice(0, 10);
    const item = {
      tanggal: tgl,
      hari: hitungHari(tgl),
      pemohon: '',
      telepon: '',
      alamat: '',
      keperluan: '',
      hasilAsesmen: 'Belum Diasesmen',
      asesmenId: '',
      asesmenSkor: 0,
      status: 'Masuk',
      tanggalPentasyarufan: '',
      jenisBantuan: 'Sosial Kemanusiaan',
      nominalDiajukan: '',
      nominalDisetujui: '',
      catatan: '',
      proposal: null
    };
    tampilkanFormModal('Catat Pengajuan Permohonan Baru', item, true);
  }

  async function bukaFormEdit(id) {
    try {
      const res = await rpc('pengajuan.detail', { id });
      const item = res.pengajuan;
      tampilkanFormModal('Sunting Pengajuan Permohonan', item, false);
    } catch (e) {
      toast('Gagal mengambil data: ' + e.message, true);
    }
  }

  function tampilkanFormModal(judul, item, isBaru) {
    const driveReady = STATE.drive;
    const listAsesmen = STATE.daftarAsesmen || [];

    const htmlBody = `
    <form id="fPengajuan" onsubmit="return false">
      <input type="hidden" id="pjInpAsesmenId" value="${esc(item.asesmenId || '')}">
      <input type="hidden" id="pjInpAsesmenSkor" value="${item.asesmenSkor || 0}">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">Tanggal Pengajuan *</label>
          <input type="date" id="pjInpTanggal" class="input" value="${esc(item.tanggal)}" required style="width:100%">
        </div>
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">Hari (Otomatis)</label>
          <input type="text" id="pjInpHari" class="input" value="${esc(item.hari || hitungHari(item.tanggal))}" readonly style="width:100%;background:var(--surface2);font-weight:700">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-bottom:12px">
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">Nama Pemohon *</label>
          <input type="text" id="pjInpPemohon" class="input" placeholder="Nama individu / keluarga / lembaga" value="${esc(item.pemohon)}" required style="width:100%">
        </div>
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">No. Telepon / WhatsApp</label>
          <input type="text" id="pjInpTelepon" class="input" placeholder="08xxxxxxxxxx" value="${esc(item.telepon || '')}" style="width:100%">
        </div>
      </div>

      <div class="field" style="margin-bottom:12px">
        <label style="font-weight:700;font-size:12px">Alamat Lengkap *</label>
        <textarea id="pjInpAlamat" class="input" rows="2" placeholder="Dusun, RT/RW, Kelurahan/Desa, Kapanewon" required style="width:100%">${esc(item.alamat)}</textarea>
      </div>

      <div class="field" style="margin-bottom:12px">
        <label style="font-weight:700;font-size:12px">Keperluan Permohonan *</label>
        <textarea id="pjInpKeperluan" class="input" rows="2" placeholder="Rincian kebutuhan bantuan yang diajukan..." required style="width:100%">${esc(item.keperluan)}</textarea>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-bottom:12px">
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">Jenis Bantuan / Program *</label>
          <select id="pjInpJenis" class="input" style="width:100%">
            ${['Pendidikan','Kesehatan','Ekonomi & Pemberdayaan','Sosial Kemanusiaan','Dakwah & Advokasi','Lingkungan','Zakat Mal','Infak Terikat','Infak Umum'].map((j) => `
              <option value="${esc(j)}" ${item.jenisBantuan === j ? 'selected' : ''}>${esc(j)}</option>
            `).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">Nominal Diajukan (Rp)</label>
          <input type="number" id="pjInpNominal" class="input" placeholder="Contoh: 1500000" value="${item.nominalDiajukan || ''}" style="width:100%">
        </div>
      </div>

      <!-- Hubungkan Asesmen Mustahik -->
      <div class="card" style="padding:12px;background:var(--surface2);border-radius:10px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label style="font-weight:700;font-size:12px;margin:0">Hubungkan Hasil Asesmen Mustahik</label>
          <button type="button" class="btn btn-xs btn-primary" onclick="LZPengajuan.bukaAsesmenUntukForm()">+ Isi Asesmen Baru</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="field" style="margin:0">
            <select id="pjPilihAsesmenTersimpan" class="input" style="width:100%;font-size:11.5px">
              <option value="">-- Hubungkan dari Riwayat Asesmen --</option>
              ${listAsesmen.map((as) => `
                <option value="${esc(as.id)}" ${item.asesmenId === as.id ? 'selected' : ''}>
                  ${esc(as.mustahik)} (${esc(as.hasil)} - Skor ${as.skor})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="field" style="margin:0">
            <input type="text" id="pjInpAsesmen" class="input" placeholder="Hasil kelayakan" value="${esc(item.hasilAsesmen || 'Belum Diasesmen')}" style="width:100%;font-size:11.5px">
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-bottom:12px">
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">Status Pengajuan</label>
          <select id="pjInpStatus" class="input" style="width:100%">
            <option value="Masuk" ${item.status === 'Masuk' ? 'selected' : ''}>Masuk</option>
            <option value="Diproses" ${item.status === 'Diproses' ? 'selected' : ''}>Diproses</option>
            <option value="Disetujui" ${item.status === 'Disetujui' ? 'selected' : ''}>Disetujui</option>
            <option value="Ditasyarufkan" ${item.status === 'Ditasyarufkan' ? 'selected' : ''}>Ditasyarufkan</option>
            <option value="Ditolak" ${item.status === 'Ditolak' ? 'selected' : ''}>Ditolak</option>
          </select>
        </div>
        <div class="field" style="margin:0">
          <label style="font-weight:700;font-size:12px">Nominal Disetujui (Rp)</label>
          <input type="number" id="pjInpNomDisetujui" class="input" placeholder="Contoh: 1000000" value="${item.nominalDisetujui || ''}" style="width:100%">
        </div>
      </div>

      <div class="field" style="margin-bottom:12px">
        <label style="font-weight:700;font-size:12px">Tanggal Pentasyarufan (Bila Disetujui/Diserahkan)</label>
        <input type="date" id="pjInpTglSalur" class="input" value="${esc(item.tanggalPentasyarufan || '')}" style="width:100%">
      </div>

      <!-- Berkas Proposal & Google Drive -->
      <div class="card" style="padding:12px;background:var(--surface2);border-radius:10px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label style="font-weight:700;font-size:12px;margin:0">Berkas Proposal</label>
          <span class="badge ${driveReady ? 'green' : 'amber'}" style="font-size:10px">
            ${driveReady ? '✓ Google Drive Terhubung' : 'Penyimpanan Basis Data'}
          </span>
        </div>

        ${item.proposal ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface);border-radius:6px;border:1px solid var(--border);margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="ic">${IKON.proposal}</span>
              <div>
                <div style="font-weight:700;font-size:12px">${esc(item.proposal.nama)}</div>
                <div class="muted" style="font-size:10.5px">${Math.round(item.proposal.ukuran / 1024)} KB · ${item.proposal.simpan === 'drive' ? 'Google Drive' : 'Lokal'}</div>
              </div>
            </div>
            <div style="display:flex;gap:6px">
              <button type="button" class="btn btn-xs btn-ghost" onclick="LZPengajuan.unduhProposal('${esc(item.id)}')">Unduh</button>
              <button type="button" class="btn btn-xs btn-ghost text-danger" onclick="LZPengajuan.hapusProposal('${esc(item.id)}')">&times; Hapus</button>
            </div>
          </div>
        ` : ''}

        <div class="field" style="margin:0">
          <input type="file" id="pjInpFileProposal" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" style="font-size:12px;width:100%">
          <div class="muted" style="font-size:10.5px;margin-top:4px">
            Pilih berkas proposal (PDF, Word, Excel, Gambar; maks 5 MB). Otomatis masuk ke Google Drive.
          </div>
        </div>
      </div>

      <div class="field" style="margin:0">
        <label style="font-weight:700;font-size:12px">Catatan Tambahan</label>
        <textarea id="pjInpCatatan" class="input" rows="2" placeholder="Catatan internal pengurus / mustahik..." style="width:100%">${esc(item.catatan || '')}</textarea>
      </div>
    </form>`;

    const htmlFoot = `
      <button class="btn btn-ghost" type="button" onclick="LZPengajuan.tutupModal()">Batal</button>
      <button class="btn btn-primary" type="button" id="btnSimpanPengajuan">${isBaru ? 'Simpan Pengajuan' : 'Simpan Perubahan'}</button>
    `;

    openModal(judul, htmlBody, htmlFoot);

    // Otomatis hitung hari saat tanggal berubah
    const inpTgl = el('pjInpTanggal');
    const inpHari = el('pjInpHari');
    if (inpTgl && inpHari) {
      inpTgl.onchange = () => {
        inpHari.value = hitungHari(inpTgl.value);
      };
    }

    // Hubungkan pilihan asesmen tersimpan
    const selAsesmen = el('pjPilihAsesmenTersimpan');
    if (selAsesmen) {
      selAsesmen.onchange = () => {
        const asId = selAsesmen.value;
        const target = listAsesmen.find((x) => x.id === asId);
        if (target) {
          el('pjInpAsesmenId').value = target.id;
          el('pjInpAsesmenSkor').value = target.skor || 0;
          el('pjInpAsesmen').value = `${target.hasil} (Skor ${target.skor})`;
        }
      };
    }

    el('btnSimpanPengajuan').onclick = async () => {
      await simpanDataForm(item.id, isBaru);
    };
  }

  async function simpanDataForm(id, isBaru) {
    const tgl = el('pjInpTanggal').value;
    const pemohon = el('pjInpPemohon').value.trim();
    const alamat = el('pjInpAlamat').value.trim();
    const keperluan = el('pjInpKeperluan').value.trim();

    if (!tgl) return toast('Tanggal pengajuan wajib diisi', true);
    if (!pemohon) return toast('Nama pemohon wajib diisi', true);
    if (!alamat) return toast('Alamat pemohon wajib diisi', true);
    if (!keperluan) return toast('Keperluan permohonan wajib diisi', true);

    const payload = {
      tanggal: tgl,
      hari: el('pjInpHari').value || hitungHari(tgl),
      pemohon: pemohon,
      telepon: el('pjInpTelepon').value.trim(),
      alamat: alamat,
      keperluan: keperluan,
      jenisBantuan: el('pjInpJenis').value,
      nominalDiajukan: Number(el('pjInpNominal').value) || 0,
      hasilAsesmen: el('pjInpAsesmen').value,
      asesmenId: el('pjInpAsesmenId') ? el('pjInpAsesmenId').value : '',
      asesmenSkor: el('pjInpAsesmenSkor') ? Number(el('pjInpAsesmenSkor').value) || 0 : 0,
      status: el('pjInpStatus').value,
      tanggalPentasyarufan: el('pjInpTglSalur').value || '',
      nominalDisetujui: Number(el('pjInpNomDisetujui').value) || 0,
      catatan: el('pjInpCatatan').value.trim(),
    };

    const fileInp = el('pjInpFileProposal');
    if (fileInp && fileInp.files && fileInp.files[0]) {
      const file = fileInp.files[0];
      if (file.size > 5 * 1024 * 1024) {
        return toast('Ukuran berkas melebihi 5 MB', true);
      }
      const b64 = await bacaFileBase64(file);
      payload.berkasProposal = {
        nama: file.name,
        mime: file.type || 'application/octet-stream',
        ukuranAsli: file.size,
        isi: b64
      };
    }

    const btn = el('btnSimpanPengajuan');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    try {
      if (isBaru) {
        const res = await rpc('pengajuan.simpan', payload);
        toast(res.pesan || 'Pengajuan berhasil disimpan');
      } else {
        payload.id = id;
        const res = await rpc('pengajuan.ubah', payload);
        toast(res.pesan || 'Perubahan berhasil disimpan');
      }
      closeModal();
      await muatData();
      gambarHalaman();
    } catch (e) {
      toast('Gagal: ' + e.message, true);
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
    }
  }

  function bacaFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result;
        const b64 = String(res).split(',')[1] || '';
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function hapusPengajuan(id) {
    if (!confirm('Yakin ingin menghapus data pengajuan ini?')) return;
    try {
      const res = await rpc('pengajuan.hapus', { id });
      toast(res.pesan || 'Data pengajuan dihapus');
      await muatData();
      gambarHalaman();
    } catch (e) {
      toast('Gagal menghapus: ' + e.message, true);
    }
  }

  async function unduhProposal(id) {
    try {
      const res = await rpc('pengajuan.proposal.ambil', { id });
      const prop = res.proposal;
      if (!prop) throw new Error('Proposal tidak ditemukan');

      if (prop.simpan === 'drive' && prop.url && !res.isi) {
        window.open(prop.url, '_blank');
        return;
      }

      if (res.isi) {
        const blob = b64KeBlob(res.isi, prop.mime || 'application/pdf');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = prop.nama || 'proposal.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      toast('Gagal mengunduh berkas proposal: ' + e.message, true);
    }
  }

  async function hapusProposal(id) {
    if (!confirm('Hapus berkas proposal ini?')) return;
    try {
      const res = await rpc('pengajuan.proposal.hapus', { id });
      toast(res.pesan || 'Berkas proposal dihapus');
      closeModal();
      await muatData();
      gambarHalaman();
    } catch (e) {
      toast('Gagal menghapus proposal: ' + e.message, true);
    }
  }

  function b64KeBlob(b64, mime) {
    const byteChars = atob(b64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mime });
  }

  // ==================================================================
  // 5. PENGHUBUNG ASESMEN MUSTAHIK DENGAN PENGAJUAN
  // ==================================================================
  function bukaAsesmenUntukForm() {
    const pemohon = el('pjInpPemohon') ? el('pjInpPemohon').value.trim() : '';
    const alamat = el('pjInpAlamat') ? el('pjInpAlamat').value.trim() : '';
    const keperluan = el('pjInpKeperluan') ? el('pjInpKeperluan').value.trim() : '';

    closeModal();
    location.hash = '#asesmen';

    setTimeout(() => {
      const host = el('asesmenHost');
      if (host && window.LZAsesmenMustahik) {
        const btnBaru = host.querySelector('[data-aksi="baru"]');
        if (btnBaru) {
          btnBaru.click();
          setTimeout(() => {
            const inpTujuan = el('amTujuan');
            if (inpTujuan) inpTujuan.value = keperluan || 'Bantuan Kebutuhan Pokok';
            const btnLanjut = host.querySelector('[data-aksi="lanjut"]');
            if (btnLanjut) {
              btnLanjut.click();
              setTimeout(() => {
                const inpNama = host.querySelector('[data-kunci="mustahik"]');
                if (inpNama && pemohon) inpNama.value = pemohon;
                const inpAlm = host.querySelector('[data-kunci="alamat"]');
                if (inpAlm && alamat) inpAlm.value = alamat;
              }, 60);
            }
          }, 60);
        }
      }
    }, 100);
  }

  function mulaiAsesmenUntukPengajuan(pengajuanId) {
    const item = STATE.daftar.find((x) => x.id === pengajuanId);
    if (!item) return;

    location.hash = '#asesmen';
    setTimeout(() => {
      const host = el('asesmenHost');
      if (host && window.LZAsesmenMustahik) {
        const btnBaru = host.querySelector('[data-aksi="baru"]');
        if (btnBaru) {
          btnBaru.click();
          setTimeout(() => {
            const inpTujuan = el('amTujuan');
            if (inpTujuan) inpTujuan.value = item.keperluan || 'Bantuan Kebutuhan Pokok';
            const btnLanjut = host.querySelector('[data-aksi="lanjut"]');
            if (btnLanjut) {
              btnLanjut.click();
              setTimeout(() => {
                const inpNama = host.querySelector('[data-kunci="mustahik"]');
                if (inpNama) inpNama.value = item.pemohon;
                const inpAlm = host.querySelector('[data-kunci="alamat"]');
                if (inpAlm) inpAlm.value = item.alamat;
              }, 60);
            }
          }, 60);
        }
      }
    }, 100);
  }

  function lihatAsesmen(asesmenId) {
    location.hash = '#asesmen';
    setTimeout(() => {
      const host = el('asesmenHost');
      if (host) {
        const btnLihat = host.querySelector(`[data-aksi="lihat:${asesmenId}"]`);
        if (btnLihat) btnLihat.click();
      }
    }, 100);
  }

  // ==================================================================
  // 6. EKSPOR DATA (EXCEL & TSV)
  // ==================================================================
  function bangunAoaPengajuan() {
    const list = STATE.daftar;
    const header = ['Hari', 'Tanggal', 'Pemohon', 'No Telepon', 'Alamat', 'Keperluan', 'Hasil Asesment', 'Status', 'Tanggal Pentasyarufan', 'Jenis Bantuan', 'Nominal Diajukan', 'Nominal Disetujui', 'Proposal', 'Catatan'];
    const rows = [header];

    list.forEach((r) => {
      rows.push([
        r.hari || hitungHari(r.tanggal),
        r.tanggal,
        r.pemohon,
        r.telepon || '',
        r.alamat,
        r.keperluan,
        r.hasilAsesmen || 'Belum Diasesmen',
        r.status,
        r.tanggalPentasyarufan || '',
        r.jenisBantuan,
        Number(r.nominalDiajukan) || 0,
        Number(r.nominalDisetujui) || 0,
        r.proposal ? r.proposal.nama : '',
        r.catatan || ''
      ]);
    });
    return rows;
  }

  function unduhExcel() {
    if (!window.XLSX) {
      return alert('Pustaka Excel belum siap. Silakan refresh halaman.');
    }
    const aoa = bangunAoaPengajuan();
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Pengajuan');
    const namaBerkas = 'Rekap_Pengajuan_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    window.XLSX.writeFile(wb, namaBerkas);
    toast('Berkas Excel berhasil diunduh.');
  }

  function salinTSV() {
    const aoa = bangunAoaPengajuan();
    const tsv = aoa.map((row) => row.map((cell) => String(cell == null ? '' : cell).replace(/\t|\n|\r/g, ' ')).join('\t')).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(() => {
        toast('Data pengajuan disalin ke clipboard (format TSV/Excel).');
      });
    } else {
      alert('Salin teks berikut:\n\n' + tsv.slice(0, 400) + '...');
    }
  }

  // ==================================================================
  // 7. IMPOR DARI GOOGLE SPREADSHEET / EXCEL / CSV
  // ==================================================================
  function bukaModalImpor() {
    STATE.dataImporPreview = [];

    const defaultUrl = 'https://docs.google.com/spreadsheets/d/1_rtfT67OQDmE5d4uGOfExeZUqM5btYYXy-ZnHNumrew/edit?gid=0#gid=0';

    const htmlBody = `
    <div style="font-size:12px;margin-bottom:12px;color:var(--text2)">
      Impor daftar pengajuan langsung dari Google Spreadsheet resmi LAZISMU atau berkas Excel (.xlsx / .csv).
    </div>

    <div class="card" style="padding:12px 14px;background:var(--surface2);border-radius:10px;margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text)">1. Tautan Google Spreadsheet:</div>
      <div style="display:flex;gap:8px">
        <input type="text" id="pjInpUrlSpreadsheet" class="input" placeholder="https://docs.google.com/spreadsheets/d/..." value="${esc(defaultUrl)}" style="flex:1;font-size:12px">
        <button type="button" class="btn btn-primary btn-sm" id="btnTarikSpreadsheet" onclick="LZPengajuan.tarikSpreadsheet()">Tarik Data</button>
      </div>
      <div class="muted" style="font-size:11px;margin-top:5px">
        Kolom terbaca otomatis: <i>No, Hari, Tanggal, Pemohon, Alamat, Keperluan, Hasil Asesment, Keterangan, Status, Tanggal Pentasyarufan, Jenis Bantuan</i>.
      </div>
    </div>

    <div class="card" style="padding:12px 14px;background:var(--surface2);border-radius:10px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text)">2. Atau Unggah Berkas Excel / CSV:</div>
      <input type="file" id="pjInpBerkasExcel" accept=".xlsx,.xls,.csv" onchange="LZPengajuan.prosesBerkasLokal(this.files)" style="font-size:12px;width:100%">
    </div>

    <div id="pjAreaPratinjauImpor">
      <div class="muted" style="text-align:center;padding:24px;border:1px dashed var(--border);border-radius:8px;font-size:12px">
        Belum ada data ditarik. Klik <b>Tarik Data</b> atau pilih berkas Excel/CSV untuk melihat pratinjau.
      </div>
    </div>
    `;

    const htmlFoot = `
      <button class="btn btn-ghost" type="button" onclick="LZPengajuan.tutupModal()">Batal</button>
      <button class="btn btn-primary" type="button" id="btnProsesImporSimpan" disabled onclick="LZPengajuan.simpanDataImpor()">Impor ke Sistem</button>
    `;

    openModal('Impor Pengajuan dari Google Spreadsheet / Berkas', htmlBody, htmlFoot);
  }

  async function tarikSpreadsheet() {
    const inp = el('pjInpUrlSpreadsheet');
    const url = inp ? inp.value.trim() : '';
    if (!url) return toast('Masukkan tautan Google Spreadsheet.', true);

    const btn = el('btnTarikSpreadsheet');
    if (btn) { btn.disabled = true; btn.textContent = 'Menarik Data...'; }

    const area = el('pjAreaPratinjauImpor');
    if (area) area.innerHTML = '<div class="muted" style="text-align:center;padding:24px">⏳ Mengambil dan membaca data dari Google Spreadsheet...</div>';

    try {
      const res = await rpc('pengajuan.imporSpreadsheet', { url, simpanLangsung: false });
      const baris = res.baris || [];
      STATE.dataImporPreview = baris;
      tampilkanPratinjauImpor(baris);
    } catch (e) {
      if (area) {
        area.innerHTML = `<div class="card" style="padding:14px;border-color:var(--red);color:var(--red);font-size:12px">
          <b>Gagal membaca spreadsheet:</b> ${esc(e.message)}
          <div class="muted" style="margin-top:6px;font-size:11px">Pastikan dokumen spreadsheet memiliki hak akses "Siapa saja yang memiliki link dapat melihat" (Viewer).</div>
        </div>`;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Tarik Data'; }
    }
  }

  function prosesBerkasLokal(files) {
    if (!files || !files.length) return;
    const file = files[0];
    const reader = new FileReader();

    const area = el('pjAreaPratinjauImpor');
    if (area) area.innerHTML = '<div class="muted" style="text-align:center;padding:24px">⏳ Membaca isi berkas...</div>';

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        if (!window.XLSX) throw new Error('Pustaka pembaca berkas Excel belum siap.');
        const wb = window.XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        const parsed = parseMatrixSpreadsheetKlien(matrix);
        STATE.dataImporPreview = parsed;
        tampilkanPratinjauImpor(parsed);
      } catch (err) {
        if (area) {
          area.innerHTML = `<div class="card" style="padding:14px;border-color:var(--red);color:var(--red);font-size:12px">
            <b>Gagal membaca berkas:</b> ${esc(err.message)}
          </div>`;
        }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function parseMatrixSpreadsheetKlien(matrix) {
    if (!Array.isArray(matrix) || !matrix.length) return [];
    let headerIdx = -1;
    const colMap = {};

    for (let i = 0; i < matrix.length; i++) {
      const row = (matrix[i] || []).map((c) => String(c || '').toLowerCase().trim());
      if (row.includes('pemohon') && (row.includes('tanggal') || row.includes('keperluan'))) {
        headerIdx = i;
        row.forEach((colName, cIdx) => {
          colMap[colName] = cIdx;
        });
        break;
      }
    }

    if (headerIdx === -1) {
      throw new Error('Kolom tidak cocok. Pastikan ada baris judul dengan kolom Pemohon, Tanggal, dan Keperluan.');
    }

    const hasil = [];
    for (let i = headerIdx + 1; i < matrix.length; i++) {
      const row = matrix[i] || [];
      const pemohon = String(row[colMap['pemohon']] || '').trim();
      if (!pemohon || pemohon.toLowerCase() === 'pemohon') continue;

      const tglRaw = row[colMap['tanggal']] || '';
      let tgl = String(tglRaw).trim();
      if (tgl.includes('/')) {
        const p = tgl.split('/');
        if (p.length === 3) tgl = `${p[2]}-${String(p[1]).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`;
      } else if (/\b(october|oktober)\b/i.test(tgl)) {
        const m = tgl.match(/^(\d{1,2})\s+[A-Za-z]+\s+(\d{4})$/);
        if (m) tgl = `${m[2]}-10-${String(m[1]).padStart(2,'0')}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) tgl = new Date().toISOString().slice(0, 10);

      const tglSalurRaw = row[colMap['tanggal pentasyarufan']] || '';
      let tglSalur = String(tglSalurRaw).trim();
      if (tglSalur.includes('/')) {
        const p = tglSalur.split('/');
        if (p.length === 3) tglSalur = `${p[2]}-${String(p[1]).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`;
      } else if (/\b(october|oktober)\b/i.test(tglSalur)) {
        const m = tglSalur.match(/^(\d{1,2})\s+[A-Za-z]+\s+(\d{4})$/);
        if (m) tglSalur = `${m[2]}-10-${String(m[1]).padStart(2,'0')}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tglSalur)) tglSalur = '';

      const stRaw = String(row[colMap['status']] || '').toLowerCase().trim();
      let status = 'Masuk';
      if (stRaw.includes('acc') || stRaw.includes('setuju')) status = 'Disetujui';
      else if (stRaw.includes('sudah') || stRaw.includes('cair')) status = tglSalur ? 'Ditasyarufkan' : 'Disetujui';
      else if (stRaw.includes('sedang') || stRaw.includes('proses')) status = 'Diproses';
      else if (stRaw.includes('tidak') || stRaw.includes('tolak')) status = 'Ditolak';

      const keperluan = String(row[colMap['keperluan']] || '').trim();
      const jenisBantuanRaw = String(row[colMap['jenis bantuan']] || '').trim();
      const keterangan = String(row[colMap['keterangan']] || '').trim();

      hasil.push({
        tanggal: tgl,
        hari: row[colMap['hari']] || hitungHari(tgl),
        pemohon: pemohon,
        alamat: String(row[colMap['alamat']] || 'Alamat pemohon').trim(),
        keperluan: keperluan || 'Permohonan bantuan',
        hasilAsesmen: String(row[colMap['hasil asesment']] || 'Belum Diasesmen').trim(),
        status: status,
        tanggalPentasyarufan: tglSalur,
        jenisBantuan: /pendidikan|spp/i.test(keperluan + jenisBantuanRaw) ? 'Pendidikan' : /kesehatan|obat|operasi/i.test(keperluan + jenisBantuanRaw) ? 'Kesehatan' : 'Sosial Kemanusiaan',
        nominalDiajukan: 0,
        nominalDisetujui: 0,
        catatan: [keterangan, jenisBantuanRaw ? `Bantuan: ${jenisBantuanRaw}` : ''].filter(Boolean).join(' | ')
      });
    }
    return hasil;
  }

  function tampilkanPratinjauImpor(baris) {
    const area = el('pjAreaPratinjauImpor');
    const btnSimpan = el('btnProsesImporSimpan');
    if (!area) return;

    if (!baris || !baris.length) {
      area.innerHTML = '<div class="muted" style="text-align:center;padding:24px">Tidak ditemukan data pengajuan yang valid di spreadsheet.</div>';
      if (btnSimpan) { btnSimpan.disabled = true; btnSimpan.textContent = 'Impor ke Sistem'; }
      return;
    }

    let h = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700;font-size:12.5px;color:var(--green)">
        ✓ Ditemukan ${baris.length} baris data pengajuan siap diimpor:
      </div>
    </div>
    <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
      <table style="width:100%;font-size:11px;border-collapse:collapse;text-align:left">
        <thead>
          <tr style="background:var(--surface2);position:sticky;top:0;border-bottom:1px solid var(--border)">
            <th style="padding:6px 8px">No</th>
            <th style="padding:6px 8px">Tanggal</th>
            <th style="padding:6px 8px">Pemohon</th>
            <th style="padding:6px 8px">Keperluan</th>
            <th style="padding:6px 8px">Hasil Asesment</th>
            <th style="padding:6px 8px">Status</th>
            <th style="padding:6px 8px">Tgl Salur</th>
          </tr>
        </thead>
        <tbody>`;

    baris.slice(0, 50).forEach((r, idx) => {
      h += `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:5px 8px">${idx + 1}</td>
        <td style="padding:5px 8px;white-space:nowrap">${esc(r.tanggal)}</td>
        <td style="padding:5px 8px;font-weight:700">${esc(r.pemohon)}</td>
        <td style="padding:5px 8px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.keperluan)}</td>
        <td style="padding:5px 8px">${esc(r.hasilAsesmen)}</td>
        <td style="padding:5px 8px"><span class="badge ${r.status === 'Disetujui' || r.status === 'Ditasyarufkan' ? 'green' : 'amber'}" style="font-size:9.5px">${esc(r.status)}</span></td>
        <td style="padding:5px 8px;white-space:nowrap">${esc(r.tanggalPentasyarufan || '-')}</td>
      </tr>`;
    });

    if (baris.length > 50) {
      h += `<tr><td colspan="7" style="text-align:center;padding:6px;color:var(--muted)">... dan ${baris.length - 50} data lainnya</td></tr>`;
    }

    h += `</tbody></table></div>`;
    area.innerHTML = h;

    if (btnSimpan) {
      btnSimpan.disabled = false;
      btnSimpan.textContent = `Impor ${baris.length} Data ke Sistem`;
    }
  }

  async function simpanDataImpor() {
    const baris = STATE.dataImporPreview || [];
    if (!baris.length) return toast('Tidak ada data untuk diimpor.', true);

    const btn = el('btnProsesImporSimpan');
    if (btn) { btn.disabled = true; btn.textContent = 'Mengimpor ke sistem...'; }

    try {
      const res = await rpc('pengajuan.imporBaris', { baris });
      toast(res.pesan || `Berhasil mengimpor ${baris.length} data pengajuan.`);
      closeModal();
      await muatData();
      gambarHalaman();
    } catch (e) {
      toast('Gagal mengimpor: ' + e.message, true);
      if (btn) { btn.disabled = false; btn.textContent = `Impor ${baris.length} Data ke Sistem`; }
    }
  }

  window.LZPengajuan = {
    inisialisasi,
    bukaFormTambah,
    bukaFormEdit,
    hapusPengajuan,
    unduhProposal,
    hapusProposal,
    bukaAsesmenUntukForm,
    mulaiAsesmenUntukPengajuan,
    lihatAsesmen,
    bukaModalImpor,
    tarikSpreadsheet,
    prosesBerkasLokal,
    simpanDataImpor,
    tutupModal: closeModal,
    _state: STATE
  };

  document.addEventListener('DOMContentLoaded', inisialisasi);
})();
