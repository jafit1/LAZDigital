'use strict';
(function () {
  const $ = (s, p = document) => p.querySelector(s);
  const H = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kunci = (id) => 'laz_asesmen_mustahik_v1_' + String(id || '');
  const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  const tanggalIndo = (t) => { const p = String(t || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][Number(p[1])-1] + ' ' + p[0] : t || '-'; };
  let C, API, induk, lokal = [], server = [], draf = null, editId = '', tab = 'riwayat';
  function bacaLokal() { try { const a = JSON.parse(localStorage.getItem(kunci(C.pengguna.id)) || '[]'); return Array.isArray(a) ? a.filter((x) => x && x.id) : []; } catch (_) { return []; } }
  function simpanLokal(a) { try { localStorage.setItem(kunci(C.pengguna.id), JSON.stringify(a.slice(0, 300))); return true; } catch (_) { return false; } }
  function gabung() { const m = new Map(); lokal.concat(server).forEach((x) => { const s = m.get(x.id); if (!s || String(x.diubah || x.dibuat).localeCompare(String(s.diubah || s.dibuat)) > 0) m.set(x.id, x); }); return [...m.values()].sort((a,b) => String(b.diubah || b.dibuat).localeCompare(String(a.diubah || a.dibuat))); }
  const semuaTanya = () => C.formulir.bagian.flatMap((b) => b.pertanyaan);
  function field(label, key, value, type, required) { return '<label class="am-field"><span>' + H(label) + (required ? ' *' : '') + '</span><input data-kunci="' + H(key) + '" type="' + H(type || 'text') + '" value="' + H(value || '') + '"' + (required ? ' required' : '') + (key === 'petugas' ? ' readonly aria-readonly="true"' : '') + '></label>'; }
  function judul(){ return '<section class="am-kepala card"><div><p class="am-jejak">PENGAJUAN MUSTAHIK</p><h2>Asesmen Mustahik</h2><p>Survei lapangan, penilaian, dan hasil tersimpan di server serta perangkat admin.</p></div><div class="am-angka"><b>' + gabung().length + '</b><span>asesmen tercatat</span></div></section>'; }
  function tombol(isi, aksi, kelas) { return '<button type="button" class="btn ' + (kelas || '') + '" data-aksi="' + aksi + '">' + isi + '</button>'; }
  function gambarRiwayat() {
    const a = gabung();
    return '<div class="am-atas"><div><h3>Riwayat asesmen</h3><p class="muted">Daftar server digabung dengan salinan perangkat ini.</p></div>' + tombol('Asesmen baru','baru','btn-primary') + '</div>'
      + (!a.length ? '<div class="am-kosong card"><b>Belum ada asesmen</b><p>Mulai survei calon mustahik untuk mengisi penilaian.</p>' + tombol('Mulai asesmen','baru','btn-primary') + '</div>' : '<div class="am-riwayat">' + a.map((x) => '<article class="am-item card"><div class="am-item-h"><div><b>' + H(x.mustahik) + '</b><span>' + H(x.tujuan || C.formulir.nama) + ' · ' + H(tanggalIndo(x.tanggal)) + '</span></div><strong>' + H(x.hasil) + '</strong></div><div class="am-item-b"><span>Skor <b>' + Number(x.skor || 0) + ' / ' + Number(C.formulir.skor.max) + '</b></span><span>Petugas <b>' + H(x.olehNama || x.petugas || '') + '</b></span><span>' + (x.sumber === 'perangkat' ? 'Belum tersinkron ke server' : 'Tersimpan di server') + '</span></div><div class="am-item-aksi">' + tombol('Lihat ringkasan','lihat:' + H(x.id)) + (x.olehId === C.pengguna.id ? (x.sumber === 'perangkat' ? tombol('Sinkronkan','kirim:' + H(x.id),'btn-primary') : '') + tombol('Ubah','ubah:' + H(x.id)) + tombol('Hapus','hapus:' + H(x.id),'btn-ghost am-hapus') : '') + '</div></article>').join('') + '</div>');
  }
  function gambarMulai() {
    draf = dataDraf(draf);
    induk.innerHTML = judul() + '<div class="am-atas"><div><h3>Mulai asesmen</h3><p class="muted">Pilih formulir dan tulis kebutuhan yang ingin ditinjau.</p></div>' + tombol('Kembali ke riwayat','riwayat') + '</div>'
      + '<section class="am-mulai card"><label class="am-pilih-form"><input type="radio" name="am_form" value="survei-mustahik" checked><span><b>Survei Calon Mustahik</b><small>Formulir F.Survei, 31 butir penilaian</small></span></label>'
      + '<label class="am-field am-tujuan"><span>Tujuan/kebutuhan asesmen *</span><input id="amTujuan" value="' + H(draf.tujuan) + '" placeholder="Contoh: kebutuhan pokok, pengobatan, pendidikan" required></label>'
      + '<div class="am-footer">' + tombol('Lanjutkan ke survei','lanjut','btn-primary') + '</div></section>';
    ikatTombol();
  }
  function dataDraf(x) {
    const out = Object.assign({ jenis:'survei-mustahik', formulir:C.formulir.kode, tanggal:C.hariIni, tujuan:'', petugas:C.pengguna.nama, mustahik:'', alamat:'', jawaban:{}, elektronik:[], bantuanLain:[], catatan:'' }, x || {});
    return out;
  }
  function gambarForm() {
    draf = dataDraf(draf); const d = draf;
    let h = '<div class="am-atas"><div><h3>Survei Calon Mustahik</h3><p class="muted">Isi data, pilih satu skor untuk setiap butir, lalu periksa hasil.</p></div>' + tombol('Kembali ke riwayat','riwayat') + '</div>'
      + '<div class="am-data card"><div class="am-data-h"><span>F.Survei</span><b>Identitas dan kebutuhan</b></div><div class="am-form-grid">'
      + field('Tanggal survei','tanggal',d.tanggal,'date') + field('Petugas survei','petugas',d.petugas,'text')
      + field('Nama mustahik','mustahik',d.mustahik,'text',true) + field('Tujuan/kebutuhan asesmen','tujuan',d.tujuan,'text')
      + '<label class="am-field am-penuh"><span>Alamat mustahik</span><textarea data-kunci="alamat" rows="2">' + H(d.alamat) + '</textarea></label></div></div>';
    C.formulir.bagian.forEach((b) => {
      h += '<section class="am-bagian"><div class="am-bagian-h"><span>' + H(b.nama) + '</span><b>' + b.pertanyaan.length + ' butir</b></div>';
      b.pertanyaan.forEach((q, i) => {
        const pilihan = d.jawaban[q.id] || '';
        h += '<fieldset class="am-tanya"><legend><span class="am-no">' + H(q.nomor || (semuaTanya().indexOf(q) + 1)) + '</span><span>' + H(q.nama) + '</span></legend><div class="am-opsi">'
          + q.opsi.map((o) => '<label class="am-opsi-item' + (pilihan === o.id ? ' on' : '') + '"><input type="radio" name="am_' + H(q.id) + '" value="' + H(o.id) + '" data-q="' + H(q.id) + '"' + (pilihan === o.id ? ' checked' : '') + '><span>' + H(o.label) + '</span><b>' + o.skor + '</b></label>').join('')
          + '</div></fieldset>';
      }); h += '</section>';
    });
    h += '<section class="am-bagian"><div class="am-bagian-h"><span>Barang elektronik dimiliki</span><b>Opsional</b></div><p class="muted am-bantuan">Isi jumlah dan status untuk barang yang dimiliki.</p><div class="am-elektronik">'
      + C.formulir.barang.map((b) => { const x = (d.elektronik || []).find((z) => z.id === b.id) || {}; return '<div class="am-elektronik-row"><b>' + H(b.nama) + '</b>' + (b.id === 'lain' ? '<input data-barang="lain" data-k="nama" placeholder="Nama barang" value="' + H(x.nama || '') + '">' : '') + '<input type="number" min="0" max="999" inputmode="numeric" data-barang="' + H(b.id) + '" data-k="jumlah" value="' + H(x.jumlah || '') + '" placeholder="Jumlah"><select data-barang="' + H(b.id) + '" data-k="status"><option value="">Status</option>' + ['Milik sendiri','Pemberian','Pinjam'].map((s) => '<option' + (x.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>'; }).join('') + '</div></section>'
      + '<section class="am-bagian"><div class="am-bagian-h"><span>Bantuan dari lembaga lain</span><b>Maksimal 3</b></div><div class="am-bantuan-list">' + [0,1,2].map((i) => { const x = d.bantuanLain[i] || {}; return '<div class="am-bantuan-row"><label class="am-field"><span>Sumber bantuan ' + (i+1) + '</span><input data-bantuan="' + i + '" data-k="sumber" value="' + H(x.sumber || '') + '"></label><label class="am-field"><span>Nominal</span><input data-bantuan="' + i + '" data-k="nominal" type="number" min="0" inputmode="numeric" value="' + H(x.nominal || '') + '"></label></div>'; }).join('') + '</div></section>'
      + '<section class="am-bagian"><label class="am-field"><span>Catatan tambahan untuk mustahik</span><textarea data-kunci="catatan" rows="4">' + H(d.catatan) + '</textarea></label></section>'
      + '<div class="am-footer">' + tombol('Simpan di server dan perangkat','simpan','btn-primary') + '</div>';
    induk.innerHTML = judul() + h;
    induk.querySelectorAll('[data-q]').forEach((e) => e.addEventListener('change', () => { d.jawaban[e.dataset.q] = e.value; e.closest('.am-opsi').querySelectorAll('.am-opsi-item').forEach((x) => x.classList.toggle('on', x.contains(e) && e.checked)); }));
    induk.querySelectorAll('[data-kunci]').forEach((e) => e.addEventListener('input', () => { d[e.dataset.kunci] = e.value; }));
    induk.querySelectorAll('[data-barang]').forEach((e) => e.addEventListener('input', () => ambilRincian(d)));
    induk.querySelectorAll('[data-barang]').forEach((e) => e.addEventListener('change', () => ambilRincian(d)));
    induk.querySelectorAll('[data-bantuan]').forEach((e) => e.addEventListener('input', () => ambilRincian(d)));
    ikatTombol();
  }
  function ambilRincian(d) {
    const barang = new Map(); induk.querySelectorAll('[data-barang]').forEach((e) => { const x = barang.get(e.dataset.barang) || { id:e.dataset.barang }; x[e.dataset.k] = e.value; barang.set(e.dataset.barang, x); });
    d.elektronik = [...barang.values()]; const ba = new Map(); induk.querySelectorAll('[data-bantuan]').forEach((e) => { const i = Number(e.dataset.bantuan), x = ba.get(i) || {}; x[e.dataset.k] = e.value; ba.set(i,x); }); d.bantuanLain = [...ba.values()];
  }
  function lihatRingkasan(x) {
    const jaw = x.jawaban || {};
    const baris = C.formulir.bagian.map((b) => '<section class="am-hasil-b"><h4>' + H(b.nama) + '</h4>' + b.pertanyaan.map((q) => { const o=q.opsi.find((z)=>z.id===jaw[q.id]); return '<div><span>' + H(q.nama) + '</span><b>' + H(o ? o.label : 'Belum diisi') + (o ? ' · ' + o.skor : '') + '</b></div>'; }).join('') + '</section>').join('');
    induk.innerHTML = judul() + '<div class="am-atas"><div><h3>Ringkasan asesmen</h3><p class="muted">' + H(x.mustahik) + ' · ' + H(tanggalIndo(x.tanggal)) + '</p></div>' + tombol('Kembali ke riwayat','riwayat') + '</div>'
      + '<div class="am-hasil card"><div class="am-hasil-angka"><div><span>Skor akhir</span><b>' + Number(x.skor) + '<small> / ' + Number(C.formulir.skor.max) + '</small></b></div><strong>' + H(x.hasil) + '</strong></div><div class="am-hasil-meta"><span>Petugas<b>' + H(x.olehNama || x.petugas) + '</b></span><span>Tujuan<b>' + H(x.tujuan || 'Survei calon mustahik') + '</b></span><span>Alamat<b>' + H(x.alamat || 'Belum dicatat') + '</b></span></div></div>'
      + '<div class="am-rincian">' + baris + '</div>'
      + (x.catatan ? '<section class="am-bagian"><div class="am-bagian-h"><span>Catatan tambahan</span></div><p>' + H(x.catatan) + '</p></section>' : '')
      + '<div class="am-aksi-bawah">' + tombol('Kembali ke riwayat','riwayat') + (x.olehId === C.pengguna.id ? tombol('Ubah asesmen','ubah:' + H(x.id),'btn-primary') : '') + '</div>';
    ikatTombol();
  }
  function ikatTombol() { induk.querySelectorAll('[data-aksi]').forEach((b) => b.addEventListener('click', () => jalankan(b.dataset.aksi,b))); }
  async function jalankan(a,b) {
    if (a === 'baru') { tab='mulai'; editId=''; draf=dataDraf(null); gambarMulai(); return; }
    if (a === 'lanjut') { const t=$('#amTujuan').value.trim(); if(!t){$('#amTujuan').focus();return;} draf.tujuan=t; tab='form'; gambarForm(); return; }
    if (a === 'riwayat') { tab='riwayat'; induk.innerHTML=judul()+gambarRiwayat(); ikatTombol(); return; }
    if (a.startsWith('lihat:')) { const x=gabung().find((z)=>z.id===a.slice(6)); if(x) lihatRingkasan(x); return; }
    if (a.startsWith('kirim:')) { const x=lokal.find((z)=>z.id===a.slice(5)); if(!x)return; b.disabled=true;try{const r=await API('surat.asesmenMustahik.simpan',x);server=[r.asesmen,...server.filter((z)=>z.id!==r.asesmen.id)];lokal=lokal.filter((z)=>z.id!==r.asesmen.id);simpanLokal(lokal);induk.innerHTML=judul()+gambarRiwayat();ikatTombol();}catch(e){b.disabled=false;alert('Belum tersinkron. Data tetap di perangkat ini. '+e.message);}return; }
    if (a.startsWith('ubah:')) { const x=gabung().find((z)=>z.id===a.slice(5)); if(x && x.olehId===C.pengguna.id){editId=x.id;draf=Object.assign({},x);tab='form';gambarForm();} return; }
    if (a.startsWith('hapus:')) { const x=gabung().find((z)=>z.id===a.slice(6)); if(!x||!confirm('Hapus asesmen ' + x.mustahik + '?'))return; if(x.sumber==='perangkat'){lokal=lokal.filter((z)=>z.id!==x.id);simpanLokal(lokal);}else{try{await API('surat.asesmenMustahik.hapus',{id:x.id});server=server.filter((z)=>z.id!==x.id);lokal=lokal.filter((z)=>z.id!==x.id);simpanLokal(lokal);}catch(e){b.disabled=false;alert('Belum terhapus dari server. Asesmen tetap ada. '+e.message);return;}} induk.innerHTML=judul()+gambarRiwayat();ikatTombol();return; }
    if (a === 'simpan') {
      draf.tujuan = induk.querySelector('[data-kunci="tujuan"]').value;
      const nama = induk.querySelector('[data-kunci="mustahik"]');
      if (!nama.value.trim()) { nama.focus(); alert('Nama mustahik wajib diisi.'); return; }
      const terpilih = semuaTanya().filter((q) => q.opsi.some((o) => o.id === draf.jawaban[q.id])).length;
      if (terpilih !== semuaTanya().length) { const pertama=semuaTanya().find((q)=>!q.opsi.some((o)=>o.id===draf.jawaban[q.id])); const input=induk.querySelector('[data-q="'+pertama.id+'"]'); if(input)input.focus(); alert('Lengkapi semua ' + semuaTanya().length + ' penilaian. ' + (semuaTanya().length-terpilih) + ' butir belum dipilih.'); return; }
      ambilRincian(draf);
      b.disabled=true; const lama=b.textContent;b.textContent='Menyimpan…';
      const idBaru = () => 'am_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2,'0')).join('');
      draf.id = draf.id || idBaru();
      const nilai = new Map(semuaTanya().map((q) => [q.id, q.opsi.find((o) => o.id === draf.jawaban[q.id])]));
      const skorLokal = [...nilai.values()].reduce((n, o) => n + (o ? o.skor : 0), 0);
      const lokalSebelumKirim = Object.assign({}, draf, { id:draf.id, skor:skorLokal, hasil:C.formulir.hasil.find((h) => skorLokal >= h.min && skorLokal <= h.max).label, olehId:C.pengguna.id, olehNama:C.pengguna.nama, petugas:C.pengguna.nama, dibuat:draf.dibuat || new Date().toISOString(), diubah:new Date().toISOString(), sumber:'perangkat' });
      lokal = [lokalSebelumKirim, ...lokal.filter((x) => x.id !== lokalSebelumKirim.id)];
      const lokalAman = simpanLokal(lokal);
      try {
        const r=await API('surat.asesmenMustahik.simpan',draf); const tersimpan=Object.assign({},r.asesmen,{sumber:'server'});
        server=[tersimpan,...server.filter((x)=>x.id!==tersimpan.id)]; lokal=[tersimpan,...lokal.filter((x)=>x.id!==tersimpan.id)];
        const perangkat=simpanLokal(lokal); tab='riwayat'; induk.innerHTML=judul()+'<div class="am-sukses card"><b>Asesmen tersimpan di server' + (perangkat && lokalAman ? ' dan perangkat ini.' : ', tetapi salinan perangkat gagal disimpan.') + '</b><p>Skor ' + tersimpan.skor + ' dari ' + Number(C.formulir.skor.max) + ' · ' + H(tersimpan.hasil) + '</p>' + tombol('Lihat ringkasan','lihat:'+tersimpan.id,'btn-primary') + ' ' + tombol('Kembali ke riwayat','riwayat') + '</div>';ikatTombol();
      } catch(e) { const tersimpan=lokalSebelumKirim; alert('Server belum menerima asesmen. Salinan tersimpan di perangkat ini dan dapat disinkronkan saat koneksi pulih. ' + e.message); induk.innerHTML=judul()+'<div class="am-sukses card"><b>Belum tersinkron ke server</b><p>Skor ' + tersimpan.skor + ' dari ' + Number(C.formulir.skor.max) + ' · ' + H(tersimpan.hasil) + '</p>' + tombol('Kembali ke riwayat','riwayat','btn-primary') + '</div>';ikatTombol(); }
    }
  }
  async function muat() { lokal=bacaLokal();
    try { const f=await API('surat.asesmenMustahik.form',{}); C.formulir=f.formulir; try{localStorage.setItem(kunci(C.pengguna.id)+'_form',JSON.stringify(C.formulir));}catch(_){} }
    catch(e) { try{C.formulir=JSON.parse(localStorage.getItem(kunci(C.pengguna.id)+'_form')||'null');}catch(_){} if(!C.formulir)throw e; }
    try { const r=await API('surat.asesmenMustahik.daftar',{});server=(r.asesmen||[]).map((x)=>Object.assign({},x,{sumber:'server'})); } catch(e) { server=[]; }
  
    induk.innerHTML=judul()+gambarRiwayat();ikatTombol();
  }
  function css() { if($('#amGaya'))return; const s=document.createElement('style');s.id='amGaya';s.textContent=`
    .am-kepala{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:22px;margin-bottom:18px;border-radius:18px;background:linear-gradient(110deg,var(--surface),var(--surface2));border:1px solid var(--border)}
    .am-kepala h2{margin:2px 0 6px;font:800 24px var(--head);color:var(--text)}.am-kepala p{margin:0;color:var(--text2);font-size:13px}.am-kepala .am-jejak{font-size:10px;letter-spacing:.1em;font-weight:800;color:var(--accent);margin-bottom:4px}.am-angka{display:grid;text-align:right;flex:none}.am-angka b{font:800 28px var(--head);color:var(--accent-d)}.am-angka span{font-size:12px;color:var(--muted)}
    .am-atas{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:22px 0 12px}.am-atas h3{margin:0;font:700 17px var(--head)}.am-atas p{margin:4px 0 0;font-size:12px}.am-riwayat{display:grid;gap:10px}.am-item{padding:16px 18px}.am-item-h{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.am-item-h>div{display:grid;gap:4px}.am-item-h>div>b{font:700 15px var(--head)}.am-item-h>div>span{font-size:12px;color:var(--muted)}.am-item-h>strong{font-size:13px;color:var(--accent-d);text-align:right}.am-item-b{display:flex;flex-wrap:wrap;gap:8px 24px;padding:12px 0;color:var(--muted);font-size:12px}.am-item-b b{color:var(--text);margin-left:4px}.am-item-aksi{display:flex;gap:8px;border-top:1px solid var(--border);padding-top:10px}.am-hapus{color:var(--red)!important}
    .am-kosong{text-align:center;padding:34px 16px}.am-kosong>b{font:700 17px var(--head)}.am-kosong p{color:var(--text2)}.am-kosong button{min-height:42px}
    .am-data{padding:0;overflow:hidden}.am-data-h{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border)}.am-data-h>span{font-size:11px;font-weight:800;color:var(--accent-d);padding:5px 8px;background:var(--accent-soft);border-radius:7px}.am-data-h>b{font:700 14px var(--head)}.am-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:18px}.am-field{display:grid;gap:6px;min-width:0}.am-field>span{font-size:12px;font-weight:700;color:var(--text2)}.am-field input,.am-field textarea,.am-bantuan-row input,.am-elektronik-row input,.am-elektronik-row select{width:100%;min-width:0;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--text);font:inherit;padding:10px 11px}.am-field input:focus,.am-field textarea:focus,.am-elektronik-row input:focus,.am-elektronik-row select:focus{outline:2px solid var(--accent);outline-offset:1px}.am-penuh{grid-column:1/-1}
    .am-bagian{margin-top:20px}.am-bagian-h{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--border);padding:0 2px 9px;margin-bottom:4px}.am-bagian-h>span{font:700 16px var(--head)}.am-bagian-h>b{font-size:11px;color:var(--muted)}.am-tanya{border:0;border-bottom:1px solid var(--border);padding:12px 2px;margin:0;min-width:0}.am-tanya legend{display:flex;align-items:flex-start;gap:10px;padding:0;width:100%;font-size:13px;font-weight:700;color:var(--text)}.am-no{display:grid;place-items:center;width:24px;height:24px;flex:none;background:var(--accent-soft);border-radius:7px;color:var(--accent-d);font-size:12px}.am-opsi{display:flex;flex-wrap:wrap;gap:7px;margin:9px 0 0 34px}.am-opsi-item{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:7px 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--text2);font-size:12px;cursor:pointer}.am-opsi-item input{accent-color:var(--accent);width:16px;height:16px;margin:0}.am-opsi-item>b{display:grid;place-items:center;width:22px;height:22px;border-radius:6px;background:var(--surface2);font-size:11px;color:var(--text)}.am-opsi-item.on{border-color:var(--accent);background:var(--accent-soft);color:var(--text);box-shadow:inset 0 0 0 1px var(--accent)}
    .am-bantuan{font-size:12px}.am-elektronik{display:grid;gap:6px}.am-elektronik-row{display:grid;grid-template-columns:minmax(130px,1fr) 100px minmax(140px,.8fr);gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid var(--border)}.am-elektronik-row>b{font-size:12px}.am-elektronik-row input,.am-elektronik-row select{padding:8px}.am-bantuan-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.am-bantuan-row{display:grid;gap:8px;padding:12px;border:1px solid var(--border);border-radius:10px}.am-footer,.am-aksi-bawah{display:flex;justify-content:flex-end;margin:20px 0 34px}.am-footer button,.am-aksi-bawah button{min-height:44px}
    .am-hasil{padding:0;overflow:hidden}.am-hasil-angka{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:22px;background:var(--surface2);border-bottom:1px solid var(--border)}.am-hasil-angka>div{display:grid;gap:3px}.am-hasil-angka>div>span{font-size:12px;color:var(--muted)}.am-hasil-angka>div>b{font:800 32px var(--head)}.am-hasil-angka small{font:500 13px var(--body)}.am-hasil-angka>strong{font:700 16px var(--head);color:var(--accent-d);text-align:right}.am-hasil-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:16px 20px}.am-hasil-meta span{font-size:11px;color:var(--muted)}.am-hasil-meta b{display:block;color:var(--text);font-size:13px;margin-top:4px;overflow-wrap:anywhere}.am-rincian{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}.am-hasil-b{padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px}.am-hasil-b h4{font:700 13px var(--head);margin:0 0 8px}.am-hasil-b>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px 0;border-top:1px solid var(--border);font-size:11px}.am-hasil-b>div span{color:var(--text2)}.am-hasil-b>div b{text-align:right;color:var(--text)}.am-sukses{padding:20px;margin-top:20px}.am-sukses>b{font:700 16px var(--head)}.am-sukses p{color:var(--text2)}
    @media(max-width:760px){.am-kepala{padding:16px;align-items:flex-start}.am-kepala h2{font-size:21px}.am-angka b{font-size:24px}.am-form-grid{grid-template-columns:1fr;padding:14px}.am-penuh{grid-column:auto}.am-opsi{margin-left:0}.am-opsi-item{flex:1 1 165px;min-height:44px}.am-bantuan-list{grid-template-columns:1fr}.am-rincian{grid-template-columns:1fr}.am-hasil-meta{grid-template-columns:1fr 1fr}.am-elektronik-row{grid-template-columns:minmax(0,1fr) 78px minmax(110px,.8fr);gap:6px;padding:7px 2px}.am-elektronik-row input,.am-elektronik-row select{font-size:12px;padding:8px 6px}.am-atas{align-items:flex-start}.am-item-h{display:grid}.am-item-h>strong{text-align:left}.am-item-aksi{flex-wrap:wrap}}
    @media(max-width:390px){.am-kepala{display:block}.am-angka{text-align:left;margin-top:12px}.am-elektronik-row{grid-template-columns:minmax(0,1fr) 66px minmax(95px,.8fr)}}
  `;document.head.appendChild(s); }
  window.LZAsesmenMustahik = { async gambar(el, konteks, rpc) { C=konteks;API=rpc;induk=el;css();await muat(); }, _uji:{kunci} };
})();
