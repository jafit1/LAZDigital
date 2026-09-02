/* ============ STATE & HELPER ============ */
var TOKEN = localStorage.getItem('laz_token') || '';
var ME=null, SETTINGS={}, PERM_META={modules:[],actions:[]}, CACHE={};
var BULAN=['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var BOXES_SPINNER = '<div class="loader-wrap"><div class="loadingspinner"><div id="square1"></div><div id="square2"></div><div id="square3"></div><div id="square4"></div><div id="square5"></div></div></div>';

function getSavedCreds(){ try{var s=localStorage.getItem('laz_creds');return s?JSON.parse(atob(s)):null;}catch(e){return null;} }
function setSavedCreds(u,p){ try{localStorage.setItem('laz_creds',btoa(unescape(encodeURIComponent(JSON.stringify({u:u,p:p})))));}catch(e){} }
function clearSavedCreds(){ try{localStorage.removeItem('laz_creds');}catch(e){} }
var _reloginPromise=null;
function reloginSilently(){
  if(_reloginPromise) return _reloginPromise;
  var c=getSavedCreds(); if(!c) return Promise.resolve(false);
  _reloginPromise = fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:'login',args:[c.u,c.p]})})
    .then(function(r){return r.json();})
    .then(function(j){ var r=j&&j.result; if(r&&r.ok&&r.token){ TOKEN=r.token; localStorage.setItem('laz_token',TOKEN); ME=r.user; return true; } return false; })
    .catch(function(){ return false; });
  _reloginPromise.finally(function(){ setTimeout(function(){ _reloginPromise=null; },0); });
  return _reloginPromise;
}
function gas(fn){ return function(){ var a=[].slice.call(arguments); return _rpcCall(fn,a,false); }; }
function _rpcCall(fn,args,retried){
  __barShow();
  return fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:args})})
    .then(function(r){return r.json();})
    .then(function(j){ __barHide(); if(j&&j.__error){ throw new Error(j.__error); } return j.result; })
    .catch(function(e){
      var m=(e&&e.message)||String(e);
      if(!retried && m.indexOf('AUTH:')>=0 && fn!=='login' && fn!=='logout' && getSavedCreds() && TOKEN){
        return reloginSilently().then(function(ok){
          if(!ok) throw e;
          var na=args.slice(); if(na.length && (na[0]===null || typeof na[0]==='string')) na[0]=TOKEN;
          return _rpcCall(fn,na,true);
        });
      }
      __barHide(); throw e;
    }); }function el(id){
  var modal = document.getElementById('modalBody');
  if (modal && document.getElementById('modalBg') && document.getElementById('modalBg').classList.contains('show')) {
    var found = modal.querySelector('#' + id);
    if (found) return found;
  }
  return document.getElementById(id);
}
function rp(n){return 'Rp '+(Number(n)||0).toLocaleString('id-ID');}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function fdate(d){if(!d)return '-';try{return new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}catch(e){return d;}}
function today(){return new Date().toISOString().slice(0,10);}
function toast(m,err){var t=el('toast');t.textContent=m;t.className='toast show'+(err?' err':'');setTimeout(function(){t.className='toast';},2800);}
function handleErr(e){var m=(e&&e.message)||String(e);if(m.indexOf('AUTH:')>=0){ if(getSavedCreds()){ reloginSilently().then(function(ok){ if(ok){toast('Sesi disegarkan, silakan ulangi');} else {clearSavedCreds();toast('Sesi berakhir, login ulang',true);doLogout();} }); } else { toast('Sesi berakhir, login ulang',true); doLogout(); } return; } toast(m.replace(/^(IZIN:|Error:)\s*/,''),true);}

/* Ikon navigasi: satu keluarga SVG garis (stroke currentColor) supaya seragam.
   Sebelumnya campur karakter teks (◫ ↓ ▤ ☰) dengan emoji berwarna (👤), dan
   "☰" bentrok dengan tombol ciutkan sidebar — dua arti untuk gambar yang sama. */
function navIcon(paths){
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" '
    + 'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
}
var NAV_ICONS={
  dashboard: navIcon('<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>'),
  penghimpunan: navIcon('<path d="M12 3v11"/><path d="m7.5 9.5 4.5 4.5 4.5-4.5"/><path d="M4 18.5h16"/>'),
  pentasyarufan: navIcon('<path d="M12 21V10"/><path d="m7.5 14.5 4.5-4.5 4.5 4.5"/><path d="M4 5.5h16"/>'),
  donatur: navIcon('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  laporan: navIcon('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9.5 12.5h5"/><path d="M9.5 16.5h5"/>'),
  users: navIcon('<circle cx="9.5" cy="8" r="3.2"/><path d="M3.5 19.5a6 6 0 0 1 12 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 14.4a6 6 0 0 1 3 5.1"/>'),
  settings: navIcon('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3.4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
  panel: navIcon('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9.5 4v16"/>'),
  log: navIcon('<path d="M12 8v4l2.5 2.5"/><circle cx="12" cy="12" r="8.5"/>')
};
var MENU=[
  {id:'dashboard',label:'Dashboard',ic:NAV_ICONS.dashboard,mod:'dashboard'},
  {id:'penghimpunan',label:'Penghimpunan',ic:NAV_ICONS.penghimpunan,mod:'penghimpunan'},
  {id:'pentasyarufan',label:'Pentasyarufan',ic:NAV_ICONS.pentasyarufan,mod:'pentasyarufan'},
  {id:'donatur',label:'Donatur',ic:NAV_ICONS.donatur,mod:'penghimpunan'},
  {id:'laporan',label:'Laporan',ic:NAV_ICONS.laporan,mod:'laporan'},
  {id:'users',label:'Manajemen User',ic:NAV_ICONS.users,mod:'users'},
  {id:'settings',label:'Pengaturan',ic:NAV_ICONS.settings,mod:'settings'},
  {id:'log',label:'Log Aktivitas',ic:NAV_ICONS.log,mod:'log'}
];
function canDo(mod,act){ if(!ME)return false; if(ME.role==='superadmin')return true; return !!(ME.permissions[mod]&&ME.permissions[mod][act]); }

/* ============ MASTER DATA (cascading) ============ */
var JENIS_TOP=['Zakat','Infak','Sedekah','Wakaf','Kurban','Fidyah','DSKL'];
var SUBJENIS={
  'Zakat':['Zakat Mal','Zakat Fitrah','Zakat Profesi/Penghasilan','Zakat Perdagangan','Zakat Pertanian','Zakat Emas & Perak','Zakat Simpanan','Setor Tunai'],
  'Infak':['Infak Umum','Infak Terikat','Setor Tunai'],
  'Sedekah':['Sedekah Umum','Sedekah Terikat'],
  'Wakaf':['Wakaf Uang','Wakaf Melalui Uang'],
  'Kurban':['Kurban'],'Fidyah':['Fidyah'],
  'DSKL':['CSR Perusahaan','Bagi Hasil Bank','Dana Sosial Lainnya']
};
var PILAR=['Pendidikan','Kesehatan','Ekonomi & Pemberdayaan','Dakwah & Advokasi','Sosial Kemanusiaan','Lingkungan'];
var KATEGORI_TERIKAT=['Kesehatan','Pendidikan','Sosial Dakwah','DAM','Kemanusiaan','Fidyah','Qurban'];
var METODE=['Cash/Tunai','Transfer Bank','QRIS','E-Wallet','Debit/Kartu'];
var TIPE_DONATUR=['Perorangan','Lembaga/Perusahaan','Hamba Allah','Kantor Layanan (KLL)','Unit Layanan (ULL)'];
var FUNDRAISING_OPTIONS=['Lazismu Daerah Bantul','Sherli','Renata','Ariya','Nur Yulianto','Muzakki'];
function cleanFR(fr) {
  if (!fr || fr === '-' || fr.toLowerCase() === 'tanpa fundraising') return 'Lazismu Daerah Bantul';
  return fr;
}

function isTransferMethod(m){ m=(m||'').toLowerCase(); return m.indexOf('transfer')>=0||m.indexOf('qris')>=0||m.indexOf('wallet')>=0||m.indexOf('debit')>=0||m.indexOf('bank')>=0; }

/* ============ BOOTSTRAP ============ */
window.addEventListener('load',function(){
  if(TOKEN){ gas('apiBootstrap')(TOKEN).then(function(b){ME=b.user;SETTINGS=b.settings;startApp();}).catch(function(){ tryAutoLogin(); }); }
  else { tryAutoLogin(); }
});
function tryAutoLogin(){
  var c=getSavedCreds(); if(!c){ showLogin(); return; }
  reloginSilently().then(function(ok){
    if(ok){ gas('apiBootstrap')(TOKEN).then(function(b){ME=b.user;SETTINGS=b.settings;startApp();}).catch(function(){ showLogin(); }); }
    else showLogin();
  });
}
function showLogin(){ el('boot').classList.add('hidden'); el('appView').classList.add('hidden'); el('loginView').classList.remove('hidden'); try{ var c=getSavedCreds(); if(c&&el('lUser')&&!el('lUser').value){ el('lUser').value=c.u; if(el('lRemember'))el('lRemember').checked=true; } }catch(e){} }
function doLogin(ev){ev.preventDefault();var b=el('loginBtn');b.disabled=true;b.textContent='Memproses...';el('loginErr').textContent='';
  var u=el('lUser').value.trim(), p=el('lPass').value;
  var remember=el('lRemember')?el('lRemember').checked:true;
  gas('login')(u,p).then(function(r){
    if(!r.ok){el('loginErr').textContent=r.msg;b.disabled=false;b.textContent='Masuk';return;}
    TOKEN=r.token;localStorage.setItem('laz_token',TOKEN);ME=r.user;
    if(remember){ setSavedCreds(u,p); } else { clearSavedCreds(); }
    return gas('apiBootstrap')(TOKEN).then(function(bs){SETTINGS=bs.settings;startApp();});
  }).catch(function(e){el('loginErr').textContent=(e.message||e);b.disabled=false;b.textContent='Masuk';});
  return false;}
function doLogout(){if(TOKEN)gas('logout')(TOKEN);localStorage.removeItem('laz_token');clearSavedCreds();TOKEN='';ME=null;location.reload();}
function startApp(){
  el('boot').classList.add('hidden');el('loginView').classList.add('hidden');el('appView').classList.remove('hidden');
  // Default sidebar ciut (ikon saja); klik logo untuk melebarkan.
  if (localStorage.getItem('sidebar_collapsed') !== 'false') {
    el('appView').classList.add('collapsed');
  }
  applyTheme(localStorage.getItem('laz_theme')||SETTINGS.theme||'light');
  applyBranding();
  el('uName').textContent=ME.nama;el('uRole').textContent=ME.role==='superadmin'?'Superadmin':ME.role;
  var av=el('uAvatar');var foto=SETTINGS['uf_'+ME.id]||'';
  if(foto){av.style.backgroundImage='url('+foto+')';av.textContent='';}else{av.style.backgroundImage='';av.textContent=(ME.nama||'?').charAt(0).toUpperCase();}
  function buildNav(){
    var nav=el('nav');nav.innerHTML='';
    MENU.forEach(function(m){if(m.mod&&!canDo(m.mod,'view'))return;var d=document.createElement('button');d.className='tn-item';d.id='nav_'+m.id;d.title=m.label;d.setAttribute('aria-label',m.label);d.innerHTML='<span class="ic">'+m.ic+'</span><span class="tn-tip">'+m.label+'</span>';d.onclick=function(){go(m.id);};nav.appendChild(d);});   // klik menu = langsung buka halamannya, sidebar tidak ikut melebar
    var first=MENU.find(function(m){return !m.mod||canDo(m.mod,'view');});
    go(first?first.id:'dashboard');
  }
  gas('apiGetPermissionMeta')(TOKEN).then(function(meta){PERM_META=meta||{modules:[],actions:[]};buildNav();}).catch(function(){buildNav();});
}
function applyTheme(t){t=(t==='dark')?'dark':'light';document.documentElement.setAttribute('data-theme',t);localStorage.setItem('laz_theme',t);}
/* v8: versi lama menimpa seluruh isi #brandBox, sehingga tombol toggle (☰)
   ikut terhapus, dan nama lembaga ditulis sebagai <span> polos tanpa class —
   jadi tidak bisa disembunyikan saat sidebar diciutkan dan teksnya membungkus
   menutupi logo. Sekarang identitas dan tombol toggle dipisah rapi. */
function applyBranding(){
  var logo=SETTINGS.logoData||'';
  var nm=SETTINGS.namaLembaga||'LAZ Digital';
  var b=el('brandBox'),tb=el('tbBrand');
  if(b){
    var ident = logo
      ? '<img class="logo-img" src="'+logo+'" alt="logo">'
      : '<span class="logo">LZ</span><span class="brand-name">'+esc(nm)+'</span>';
    // Logo merangkap tombol buka/tutup menu — tidak ada tombol panel terpisah lagi.
    b.innerHTML = '<button class="tn-brand-id" type="button" onclick="toggleSidebar()"'
      + ' title="Klik untuk membuka / menutup menu" aria-label="Buka atau tutup menu">'
      + ident + '</button>';
  }
  if(tb) tb.innerHTML = logo ? '<img src="'+logo+'" alt="logo">' : esc(nm);
}
function toggleSidebar(){el('sidebar').classList.toggle('open');el('scrim').classList.toggle('show');}
function closeSidebar(){var s=el('sidebar');if(s)s.classList.remove('open');var sc=el('scrim');if(sc)sc.classList.remove('show');}
var PROF_FOTO=null;
function openProfile(){
  var foto=SETTINGS['uf_'+ME.id]||'';PROF_FOTO=null;
  var b='<div style="text-align:center;margin-bottom:18px"><div class="avatar" id="pfPrev" style="width:88px;height:88px;font-size:32px;margin:0 auto 12px;'+(foto?'background-image:url('+foto+')':'')+'">'+(foto?'':(ME.nama||'?').charAt(0).toUpperCase())+'</div><label class="btn btn-sm" style="cursor:pointer">📷 Ganti Foto<input type="file" accept="image/*" style="display:none" onchange="onProfFoto(event)"></label></div>'+
  '<div class="field"><label>Nama Lengkap</label><input id="pf_nama" value="'+esc(ME.nama)+'"></div>'+
  '<div class="field"><label>Username</label><input value="'+esc(ME.username||'')+'" disabled></div>'+
  '<div class="divider"></div><div class="muted" style="font-size:12.5px;font-weight:600;margin-bottom:10px">Ubah Password (opsional)</div>'+
  '<div class="field"><label>Password Lama</label><input type="password" id="pf_old"></div>'+
  '<div class="row"><div class="field" style="flex:1"><label>Password Baru</label><input type="password" id="pf_new"></div><div class="field" style="flex:1"><label>Ulangi Baru</label><input type="password" id="pf_new2"></div></div>';
  openModal('Pengaturan User', b, '<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveProfile()">Simpan</button>');
}
function onProfFoto(e){var f=e.target.files[0];if(!f)return;resizeImg(f,160,function(data){PROF_FOTO=data;var p=el('pfPrev');p.style.backgroundImage='url('+data+')';p.textContent='';},'jpeg');}
function saveProfile(){
  var nama=el('pf_nama').value.trim();var old=el('pf_old').value;var n1=el('pf_new').value;var n2=el('pf_new2').value;
  if(!nama)return toast('Nama wajib diisi');
  if(n1&&n1!==n2)return toast('Password baru tidak sama');
  var d={nama:nama};if(PROF_FOTO)d.foto=PROF_FOTO;if(n1){d.oldPassword=old;d.newPassword=n1;}
  gas('apiUpdateMyProfile')(TOKEN,d).then(function(){ME.nama=nama;if(PROF_FOTO)SETTINGS['uf_'+ME.id]=PROF_FOTO;PROF_FOTO=null;closeModal();startApp();toast('Profil tersimpan');}).catch(handleErr);
}
function resizeImg(file,max,cb,fmt){var r=new FileReader();r.onload=function(ev){var img=new Image();img.onload=function(){var w=img.width,h=img.height;if(w>h){if(w>max){h=h*max/w;w=max;}}else{if(h>max){w=w*max/h;h=max;}}var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);cb(c.toDataURL(fmt==='jpeg'?'image/jpeg':'image/png',0.85));};img.src=ev.target.result;};r.readAsDataURL(file);}
function go(view){window.REK_HOST='';window.LAY_HOST='';document.querySelectorAll('.tn-item').forEach(function(n){n.classList.remove('active');});var a=el('nav_'+view);if(a)a.classList.add('active');closeSidebar();window.__viewAnim=true;var c=el('content');if(c){c.classList.remove('view-anim','view-enter');c.classList.add('view-leaving');}({dashboard:viewDashboard,penghimpunan:viewPenghimpunan,pentasyarufan:viewPentasyarufan,donatur:viewDonatur,laporan:viewLaporan,rekening:viewRekening,layanan:viewLayanan,users:viewUsers,settings:viewSettings,log:viewLog}[view]||viewDashboard)();}

/* ============ MODAL ============ */
function openModal(t,b,f){el('modalTitle').textContent=t;el('modalBody').innerHTML=b;el('modalFoot').innerHTML=f||'';el('modalBg').classList.add('show');}
function closeModal(){
  el('modalBg').classList.remove('show');
  var mc=el('modalCard'); if(mc) mc.classList.remove('form-modal','import-modal');
}
el('modalBg').addEventListener('click',function(e){if(e.target===el('modalBg'))closeModal();});

/* ============ DASHBOARD ============ */
function viewDashboard(){
  if (typeof window.DASH_SELECTED_MONTH === 'undefined') {
    window.DASH_SELECTED_MONTH = getCurrentMonthString();
    window.DASH_SELECTED_PEKAN = 'Semua';
    window.DASH_SELECTED_HARI = 'Semua';
  }
  var monthEl = el('dashFilterMonth');
  var pekanEl = el('dashFilterPekan');
  var hariEl = el('dashFilterHari');
  if (monthEl) window.DASH_SELECTED_MONTH = monthEl.value;
  if (pekanEl) window.DASH_SELECTED_PEKAN = pekanEl.value;
  if (hariEl) window.DASH_SELECTED_HARI = hariEl.value || 'Semua';

  Promise.all([
    gas('apiDashboard')(TOKEN, window.DASH_SELECTED_MONTH, window.DASH_SELECTED_PEKAN, window.DASH_SELECTED_HARI),
    gas('apiGetRAPBData')(TOKEN, new Date().getFullYear()).catch(function(){ return null; })
  ]).then(function(res){
    var d = res[0];
    d.rapb = res[1];
    CACHE.dash = d;
    renderDashboard(d);
  }).catch(handleErr);
}
function applyDashFilter(){
  var monthEl = el('dashFilterMonth');
  var pekanEl = el('dashFilterPekan');
  var hariEl = el('dashFilterHari');
  window.DASH_SELECTED_MONTH = monthEl ? monthEl.value : 'Semua';
  window.DASH_SELECTED_PEKAN = pekanEl ? pekanEl.value : 'Semua';
  window.DASH_SELECTED_HARI = hariEl ? (hariEl.value || 'Semua') : 'Semua';
  viewDashboard();
}
function resetDashFilter(){
  window.DASH_SELECTED_MONTH = getCurrentMonthString();
  window.DASH_SELECTED_PEKAN = 'Semua';
  window.DASH_SELECTED_HARI = 'Semua';
  viewDashboard();
}
function renderDashboard(d){
  window.DASH=d;
  var pubBtn=canDo('dashboard','view')?'<button class="btn btn-ghost" onclick="openPublicLink()">\uD83D\uDD17 Link Publik</button>':'';
  var editBtn='<button class="btn '+(window.DASH_EDIT?'btn-primary':'btn-ghost')+'" id="dashEditBtn" onclick="toggleDashEdit()">'+(window.DASH_EDIT?'\u2705 Selesai':'\u2699\uFE0F Atur Layout')+'</button>';
  var hr=new Date().getHours();var salam=hr<11?'Selamat pagi':hr<15?'Selamat siang':hr<19?'Selamat sore':'Selamat malam';
  var h='<div class="dash-hero"><div class="dash-hero-in"><div><div class="dh-greet">'+salam+', '+esc((ME&&ME.nama||'').split(' ')[0]||'Sahabat')+' \uD83D\uDC4B</div><div class="dh-sub">Ringkasan amanah '+esc(SETTINGS.namaLembaga||'Lembaga Amil Zakat')+' \u2014 '+new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})+'</div></div><div style="display:flex;gap:10px;flex-wrap:wrap">'+editBtn+pubBtn+'</div></div></div>';
  // Month and Date Filter Controls (moved below public link for better UX)
  var monthsOpts = (d.availableMonths||[]).map(function(m){return '<option value="'+m+'" '+(m===window.DASH_SELECTED_MONTH?'selected':'')+'>'+formatMonthYear(m)+'</option>';}).join('');
  var filterControls = '<div class="dash-filters" style="display:flex;flex-wrap:wrap;gap:10px;margin:16px 0;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;align-items:flex-end">' +
    '<div class="field" style="margin:0;min-width:180px"><label style="font-size:11.5px;margin-bottom:4px;font-weight:600">\uD83D\uDCC5 Bulan</label>' +
    '<select id="dashFilterMonth" onchange="applyDashFilter()" style="padding:8px 12px;font-size:13px;width:100%"><option value="Semua" '+(window.DASH_SELECTED_MONTH==='Semua'?'selected':'')+'>Semua Waktu</option>'+monthsOpts+'</select></div>' +
    '<div class="field" style="margin:0;min-width:150px"><label style="font-size:11.5px;margin-bottom:4px;font-weight:600">\uD83D\uDCC6 Minggu</label>' +
    '<select id="dashFilterPekan" onchange="applyDashFilter()" style="padding:8px 12px;font-size:13px;width:100%"><option value="Semua" '+(window.DASH_SELECTED_PEKAN==='Semua'?'selected':'')+'>Semua</option><option value="1" '+(window.DASH_SELECTED_PEKAN==='1'?'selected':'')+'>Minggu 1 (1-7)</option><option value="2" '+(window.DASH_SELECTED_PEKAN==='2'?'selected':'')+'>Minggu 2 (8-14)</option><option value="3" '+(window.DASH_SELECTED_PEKAN==='3'?'selected':'')+'>Minggu 3 (15-21)</option><option value="4" '+(window.DASH_SELECTED_PEKAN==='4'?'selected':'')+'>Minggu 4 (22-28)</option><option value="5" '+(window.DASH_SELECTED_PEKAN==='5'?'selected':'')+'>Minggu 5 (29-31)</option></select></div>' +
    '<div class="field" style="margin:0;min-width:140px"><label style="font-size:11.5px;margin-bottom:4px;font-weight:600">\uD83D\uDCCD Tanggal</label>' +
    '<input type="date" id="dashFilterHari" onchange="applyDashFilter()" style="padding:8px 12px;font-size:13px;width:100%" value="'+(window.DASH_SELECTED_HARI!=='Semua'?window.DASH_SELECTED_HARI:'')+'"></div>' +
    '<div class="field" style="margin:0;flex:1;text-align:right"><button class="btn btn-ghost btn-sm" onclick="resetDashFilter()">\u21BA Reset Filter</button></div>' +
    '</div>';
  h+=filterControls;
  h+='<div class="kpi-row">'+
     kpiCard('totalHimpun','Total Penghimpunan',rp(d.totalHimpun),'\uD83D\uDCB0','up',d.transaksiHimpun+' transaksi')+
     kpiCard('totalTasyaruf','Total Pentasyarufan',rp(d.totalTasyaruf),'\uD83E\uDD32','down',d.transaksiTasyaruf+' penyaluran')+
     kpiCard('saldo','Saldo Dana',rp(d.saldo),'\u25CE','flat','Dana tersedia')+
     kpiCard('donatur','Donatur & Mustahik',(d.jumlahDonatur)+' / '+(d.jumlahMustahik),'\u2665','flat','orang terbantu')+
     '</div>';
  var lay=getDashLayout();
  var W={
    tren:{t:'Tren 12 Bulan',b:sparkChart(d.series)+'<div class="legend"><span><i style="background:var(--accent)"></i>Penghimpunan</span><span><i style="background:var(--blue)"></i>Pentasyarufan</span></div>'},
    jenis:{t:'Penghimpunan per Jenis Dana',b:previewBars(d.byJenis)},
    ashnaf:{t:'Pentasyarufan per Ashnaf',b:previewBars(d.byAshnaf)},
    program:{t:'Dana per Program',b:previewBars(d.byProgram)},
    fundraising:{t:'Capaian Fundraising',b:previewBars(d.byFundraising)},
    rhimpun:{t:'Penghimpunan Terbaru',b:miniList((d.recentHimpun||[]).slice(0,4),'himpun')},
    rtasyaruf:{t:'Pentasyarufan Terbaru',b:miniList((d.recentTasyaruf||[]).slice(0,4),'tasyaruf')}
  };
  var edit=window.DASH_EDIT?' editing':'';
  var cells=lay.order.filter(function(k){return W[k];}).map(function(k){
    var hidden=lay.vis[k]===false; if(hidden&&!window.DASH_EDIT)return '';
    var size=(lay.size&&lay.size[k])||'half';
    var tools=window.DASH_EDIT?('<div class="w-tools"><button class="w-btn" onclick="dashMove(\''+k+'\',-1)" title="Pindah ke kiri/atas">\u25C4</button><button class="w-btn" onclick="dashMove(\''+k+'\',1)" title="Pindah ke kanan/bawah">\u25BA</button><button class="w-btn" onclick="dashSetSize(\''+k+'\')" title="Ubah ukuran (1/2 atau penuh)">'+(size==='full'?'\u25AC':'\u25AA')+'</button><button class="w-btn wb-del" onclick="dashToggleVis(\''+k+'\')" title="Sembunyikan/Tampilkan">'+(hidden?'\uD83D\uDC41':'\u2715')+'</button></div>'):'';
    var clickAttr=window.DASH_EDIT?'':' onclick="openDashDetail(\''+k+'\')"';
    return '<div class="dash-widget '+(size==='full'?'span-2':'span-1')+(hidden?' is-hidden':'')+'" draggable="'+(window.DASH_EDIT?'true':'false')+'" data-key="'+k+'" ondragstart="dashDragStart(event)" ondragover="dashDragOver(event)" ondrop="dashDrop(event)" ondragend="dashDragEnd(event)"><div class="card dash-card'+(window.DASH_EDIT?'':' clickable')+'"'+clickAttr+'>'+tools+'<h3>'+W[k].t+(window.DASH_EDIT?'':' <span class="more">Detail \u203A</span>')+'</h3>'+W[k].b+'</div></div>';
  });
  h+='<div class="dash-grid'+edit+'" id="dashGrid">'+cells.join('')+'</div>';
  if(window.DASH_EDIT)h+='<div class="dash-edit-hint">\uD83D\uDCA1 Mode Atur Layout aktif \u2014 geser kartu untuk menyusun ulang, gunakan \u25AA/\u25AC untuk ukuran, \u2715 untuk sembunyikan. Klik <b>Selesai</b> untuk menyimpan.</div>';
  el('content').innerHTML=h;
}
function sCard(key,l,v,ic,a){return '<div class="stat" onclick="openDashDetail(\''+key+'\')"><div class="lbl">'+l+' <span class="ic">'+ic+'</span></div><div class="val'+(a?' accent':'')+'">'+v+'</div><div class="tap">Ketuk untuk detail ›</div></div>';}
function previewBars(obj){var k=Object.keys(obj||{});if(!k.length)return '<div class="muted" style="padding:12px 0">Belum ada data.</div>';k.sort(function(a,b){return obj[b]-obj[a];});var mx=obj[k[0]]||1;return k.slice(0,3).map(function(x){return '<div class="bar-row"><div class="name">'+esc(x)+'<span class="num">'+rp(obj[x])+'</span></div><div class="bar-track"><div class="bar-fill" style="width:'+(obj[x]/mx*100)+'%"></div></div></div>';}).join('')+(k.length>3?'<div class="muted" style="font-size:12px;margin-top:6px">+'+(k.length-3)+' lainnya…</div>':'');}
function openDashDetail(key){var d=window.DASH||{};var t='',c='';
  if(key==='saldo'){t='Ringkasan Dana';c='<div class="opt-row"><div class="ot">Total Penghimpunan</div><div style="color:var(--green);font-weight:700">'+rp(d.totalHimpun)+'</div></div><div class="opt-row"><div class="ot">Total Pentasyarufan</div><div style="color:var(--amber);font-weight:700">'+rp(d.totalTasyaruf)+'</div></div><div class="opt-row"><div class="ot">Saldo Dana</div><div style="color:var(--accent);font-weight:700">'+rp(d.saldo)+'</div></div>';}
  else if(key==='donatur'){t='Donatur';c='<div class="opt-row"><div class="ot">Jumlah Donatur</div><div style="font-weight:700">'+d.jumlahDonatur+' orang</div></div>'+barChart(d.byJenis);}
  else if(key==='mustahik'){t='Mustahik';c='<div class="opt-row"><div class="ot">Jumlah Mustahik</div><div style="font-weight:700">'+d.jumlahMustahik+' orang</div></div>'+barChart(d.byAshnaf);}
  else if(key==='tren'){t='Tren 12 Bulan';c=sparkChart(d.series)+'<div class="legend"><span><i style="background:var(--accent)"></i>Penghimpunan</span><span><i style="background:var(--blue)"></i>Pentasyarufan</span></div>';}
  else if(key==='jenis'){t='Penghimpunan per Jenis Dana';c=barChart(d.byJenis);}
  else if(key==='ashnaf'){t='Pentasyarufan per Ashnaf';c=barChart(d.byAshnaf);}
  else if(key==='program'){t='Dana per Program';c=barChart(d.byProgram);}
  else if(key==='fundraising'){t='Capaian Fundraising';c=barChart(d.byFundraising);}
  else if(key==='rhimpun'){t='Penghimpunan Terbaru';c=miniList(d.recentHimpun,'himpun');}
  else if(key==='rtasyaruf'){t='Pentasyarufan Terbaru';c=miniList(d.recentTasyaruf,'tasyaruf');}
  openModal(t,c,'<button class="btn btn-primary" onclick="closeModal()">Tutup</button>');
}
function getDashLayout(){var def={order:['tren','jenis','ashnaf','program','rhimpun','rtasyaruf'],vis:{},size:{tren:'full'}};try{var raw=localStorage.getItem('laz_dashlayout')||SETTINGS.dashLayout||'';if(raw){var s=JSON.parse(raw);if(s&&s.order)return {order:s.order,vis:s.vis||{},size:s.size||{}};}}catch(e){}return def;}
function saveDashLayout(lay){try{localStorage.setItem('laz_dashlayout',JSON.stringify(lay));}catch(e){}if(canDo('settings','edit')){try{gas('apiSaveSettings')(TOKEN,{dashLayout:JSON.stringify(lay)});}catch(e){}}}
function kpiCard(key,label,val,ic,trend,sub){var tc=trend==='up'?'kpi-up':trend==='down'?'kpi-down':'kpi-flat';var ta=trend==='up'?'\u25B2':trend==='down'?'\u25BC':'\u25CF';return '<div class="kpi-card '+tc+'" onclick="openDashDetail(\''+key+'\')"><div class="kpi-ic">'+ic+'</div><div class="kpi-main"><div class="kpi-lbl">'+label+'</div><div class="kpi-val">'+val+'</div><div class="kpi-sub"><span class="kpi-chip">'+ta+'</span> '+sub+'</div></div></div>';}
function toggleDashEdit(){window.DASH_EDIT=!window.DASH_EDIT;if(!window.DASH_EDIT)toast('Tata letak dashboard disimpan \u2713');renderDashboard(window.DASH);}
function dashSetSize(k){var lay=getDashLayout();lay.size=lay.size||{};lay.size[k]=(lay.size[k]==='full')?'half':'full';saveDashLayout(lay);renderDashboard(window.DASH);}
function dashMove(k,dir){var lay=getDashLayout();var o=lay.order.slice();var i=o.indexOf(k);if(i<0)return;var j=i+dir;if(j<0||j>=o.length)return;var t=o[i];o[i]=o[j];o[j]=t;lay.order=o;saveDashLayout(lay);renderDashboard(window.DASH);}
function dashToggleVis(k){var lay=getDashLayout();lay.vis=lay.vis||{};lay.vis[k]=(lay.vis[k]===false)?true:false;saveDashLayout(lay);renderDashboard(window.DASH);}
var _dragKey=null;
function dashDragStart(e){var w=e.target.closest('.dash-widget');if(!w)return;_dragKey=w.getAttribute('data-key');w.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',_dragKey);}catch(x){}}
function dashDragOver(e){e.preventDefault();var w=e.target.closest('.dash-widget');if(!w||w.getAttribute('data-key')===_dragKey)return;document.querySelectorAll('.dash-widget.drop-target').forEach(function(n){n.classList.remove('drop-target');});w.classList.add('drop-target');}
function dashDrop(e){e.preventDefault();var w=e.target.closest('.dash-widget');if(!w||!_dragKey)return;var target=w.getAttribute('data-key');if(target===_dragKey)return;var lay=getDashLayout();var o=lay.order.slice();var fi=o.indexOf(_dragKey),ti=o.indexOf(target);if(fi<0||ti<0)return;o.splice(fi,1);o.splice(ti,0,_dragKey);lay.order=o;saveDashLayout(lay);renderDashboard(window.DASH);}
function dashDragEnd(e){_dragKey=null;document.querySelectorAll('.dash-widget.dragging,.dash-widget.drop-target').forEach(function(n){n.classList.remove('dragging');n.classList.remove('drop-target');});}
function statCard(l,v,ic,a){return '<div class="stat'+(a?' accent':'')+'"><div class="lbl">'+l+'</div><div class="val">'+v+'</div><div class="ic">'+ic+'</div></div>';}
function barChart(obj){var k=Object.keys(obj||{});if(!k.length)return '<div class="muted" style="padding:20px 0">Belum ada data.</div>';k.sort(function(a,b){return obj[b]-obj[a];});var max=Math.max.apply(null,k.map(function(x){return obj[x];}))||1;return k.slice(0,8).map(function(x){return '<div class="bar-row"><div class="name" title="'+esc(x)+'">'+esc(x)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+(obj[x]/max*100)+'%"></div></div><div class="num">'+rp(obj[x])+'</div></div>';}).join('');}
function sparkChart(series){if(!series||!series.length)return '<div class="muted" style="padding:20px 0">Belum ada data.</div>';var max=Math.max.apply(null,series.map(function(s){return Math.max(s.himpun,s.tasyaruf);}))||1;return '<div class="spark">'+series.map(function(s){return '<div class="col"><div class="b1" style="height:'+(s.himpun/max*100)+'%" title="'+rp(s.himpun)+'"></div><div class="b2" style="height:'+(s.tasyaruf/max*100)+'%" title="'+rp(s.tasyaruf)+'"></div><div class="lab">'+s.bulan.slice(2)+'</div></div>';}).join('')+'</div>';}
function miniList(arr,type){if(!arr||!arr.length)return '<div class="muted">Belum ada data.</div>';return arr.map(function(r){var nm=type==='himpun'?(r.namaDonatur||r.program):(r.namaPenerima||r.program);var tag=type==='himpun'?(r.jenisDana||''):(r.ashnaf||'');return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)"><div><div style="font-weight:600;font-size:13.5px">'+esc(nm||'-')+'</div><div class="muted" style="font-size:11.5px">'+esc(tag)+' • '+fdate(r.tanggal)+'</div></div><div style="font-weight:700;font-size:13.5px;color:'+(type==='himpun'?'var(--green)':'var(--amber)')+'">'+rp(r.jumlah)+'</div></div>';}).join('');}

/* ============ PUBLIC LINK ============ */
function openPublicLink(){gas('apiGetPublicLinkInfo')(TOKEN).then(function(info){if(info&&info.token){info.url=location.origin+'/public.html?token='+info.token;}var b='<p class="muted" style="margin-bottom:16px">Bagikan dashboard ringkasan (read-only) ke publik. Data pribadi otomatis disembunyikan.</p>';
  if(info.enabled&&info.url){b+='<div class="field"><label>Link Dashboard Publik (Aktif)</label><div class="link-box"><input id="pubUrl" readonly value="'+esc(info.url)+'"><button class="btn btn-sm btn-primary" onclick="copyPub()">Salin</button></div></div><a class="btn btn-ghost btn-sm" href="'+esc(info.url)+'" target="_blank" style="margin-top:8px">Buka di tab baru ↗</a>';}
  else b+='<p class="muted">Link publik belum dibuat.</p>';
  var f=(info.enabled?'<button class="btn btn-danger" onclick="disablePub()">Nonaktifkan</button>':'')+'<button class="btn btn-primary" onclick="genPub()">'+(info.enabled?'Buat Ulang Link':'Aktifkan & Buat Link')+'</button>';
  openModal('Link Dashboard Publik',b,f);}).catch(handleErr);}
function genPub(){gas('apiGeneratePublicLink')(TOKEN).then(function(){toast('Link publik dibuat');openPublicLink();}).catch(handleErr);}
function disablePub(){gas('apiDisablePublicLink')(TOKEN).then(function(){toast('Link dinonaktifkan');closeModal();}).catch(handleErr);}
function copyPub(){var i=el('pubUrl');i.select();document.execCommand('copy');toast('Link disalin');}

/* ============ PENGHIMPUNAN ============ */
function viewPenghimpunan(){
  Promise.all([gas('apiListPenghimpunan')(TOKEN),gas('apiListRekeningPublic')(TOKEN),gas('apiListLayananPublic')(TOKEN)])
   .then(function(res){
     var sorted = res[0].slice().sort(function(a, b) {
       var da = new Date(a.tanggal + 'T00:00:00');
       var db = new Date(b.tanggal + 'T00:00:00');
       if (da.getTime() !== db.getTime()) return db - da;
       var ta = new Date(a.dibuat || 0);
       var tb = new Date(b.dibuat || 0);
       return tb - ta;
     });
     CACHE.himpun=sorted;CACHE.rekening=res[1];CACHE.layanan=res[2];renderPenghimpunan(sorted);
   }).catch(handleErr);
}
function renderPenghimpunan(rows){
  var h='<div class="page-head"><div><h2>Input Penghimpunan</h2><div class="desc">Catat penerimaan dana — data donatur tampil di bawah</div></div></div>';
  if(canDo('penghimpunan','create'))h+='<div class="card form-card">'
    +'<div class="form-card-h"><h3>Form Penerimaan Dana</h3><span class="form-hint">Ctrl + Enter untuk menyimpan</span></div>'
    +'<div id="himpunFormHost"></div>'
    +'<div class="form-actions"><button class="btn btn-ghost" onclick="formHimpun(\'\',\'himpunFormHost\')">↺ Reset</button>'
    +'<button class="btn btn-primary" onclick="saveHimpun(\'\')">Simpan Penerimaan</button></div></div>';
  var delBtn = canDo('penghimpunan','delete') ? '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(229,72,77,0.3);margin-left:8px" onclick="openDeleteByDateModal(\'himpun\')">🗑️ Hapus Rentang Tanggal</button>' : '';
  h+='<div class="table-wrap"><div class="toolbar"><button class="btn btn-sm btn-ghost" onclick="openImportModal(\'himpun\')">📥 Import Data</button>'+delBtn+'</div>';
  
  var filterHtml = '<div class="filter-panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px;padding:12px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Cari Donatur / Kwitansi</label><input type="text" id="himpunTable_search" placeholder="Cari..." oninput="applyFilters(\'himpunTable\')" style="padding:6px 10px;font-size:12.5px"></div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Tanggal</label><input type="date" id="himpunTable_filter_date" onchange="applyFilters(\'himpunTable\')" style="padding:6px 10px;font-size:12.5px"></div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Jenis Dana</label>' +
      '<select id="himpunTable_filter_type" onchange="applyFilters(\'himpunTable\')" style="padding:6px 10px;font-size:12.5px">' +
        '<option value="">Semua</option>' +
        '<option value="Zakat">Zakat</option>' +
        '<option value="Infak">Infak</option>' +
        '<option value="Shadaqah">Shadaqah</option>' +
        '<option value="Kemanusiaan">Kemanusiaan</option>' +
        '<option value="Wakaf">Wakaf</option>' +
        '<option value="Lainnya">Lainnya</option>' +
      '</select>' +
    '</div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Metode</label>' +
      '<select id="himpunTable_filter_method" onchange="applyFilters(\'himpunTable\')" style="padding:6px 10px;font-size:12.5px">' +
        '<option value="">Semua</option>' +
        '<option value="Cash/Tunai">Cash/Tunai</option>' +
        '<option value="Transfer Bank">Transfer Bank</option>' +
        '<option value="QRIS">QRIS</option>' +
      '</select>' +
    '</div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Fundraising</label><input type="text" id="himpunTable_filter_fr" placeholder="Nama FR..." oninput="applyFilters(\'himpunTable\')" style="padding:6px 10px;font-size:12.5px"></div>' +
  '</div>';
  
  h+= filterHtml;
  h+='<div style="overflow:auto"><table id="himpunTable"><thead><tr><th>No. Kwitansi</th><th>Tanggal</th><th>Donatur</th><th>Jenis / Detail</th><th>Metode</th><th>Jumlah</th><th></th></tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="7"><div class="empty"><div class="big">↓</div>Belum ada penghimpunan.</div></td></tr>';
  rows.forEach(function(r){
    var det=(r.subJenis||r.jenisDana)+((String(r.subJenis).toLowerCase().indexOf('pilar')>=0&&r.pilar)?(' — '+r.pilar):'');
    var frCleaned = cleanFR(r.fundraising);
    var frText = '<div class="muted" style="font-size:11px;margin-top:2px">FR: ' + esc(frCleaned) + '</div>';
    h+='<tr data-tanggal="'+esc(r.tanggal)+'" data-jenis="'+esc(r.jenisDana)+'" data-metode="'+esc(r.metode)+'" data-fr="'+esc(frCleaned)+'"><td><b>'+esc(r.noKwitansi)+'</b></td><td>'+fdate(r.tanggal)+'</td><td><b>'+esc(r.namaDonatur||'-')+'</b>'+frText+'</td><td><span class="badge blue">'+esc(r.jenisDana)+'</span><div class="muted" style="font-size:11px;margin-top:3px">'+esc(det)+'</div></td><td><span class="badge '+(isTransferMethod(r.metode)?'amber':'green')+'">'+esc(r.metode||'-')+'</span></td><td style="font-weight:700;color:var(--green)">'+rp(r.jumlah)+'</td><td><div class="actions-cell"><button class="icon-btn" title="Kwitansi" onclick="cetakKwitansi(\''+r.id+'\')">🧾</button>'+(canDo('penghimpunan','edit')?'<button class="icon-btn" onclick="formHimpun(\''+r.id+'\')">✎</button>':'')+(canDo('penghimpunan','delete')?'<button class="icon-btn" onclick="delHimpun(\''+r.id+'\')">🗑</button>':'')+'</div></td></tr>';
  });
  h+='</tbody></table></div></div>';el('content').innerHTML=h;
  if(canDo('penghimpunan','create'))formHimpun('','himpunFormHost');
}
function setupSearchDropdown(inputId, menuId, suggestions, onSelect) {
  var input = el(inputId);
  var menu = el(menuId);
  if (!input || !menu) return;
  function renderMenu(filterText) {
    var txt = (filterText || '').toLowerCase();
    var filtered = suggestions.filter(function(s) {
      return s.toLowerCase().indexOf(txt) >= 0;
    });
    if (filtered.length === 0) {
      menu.innerHTML = '<div style="padding:8px 12px;color:var(--muted);font-style:italic">Tidak ada hasil cocok</div>';
      return;
    }
    menu.innerHTML = filtered.map(function(item) {
      return '<div class="item" data-value="' + esc(item) + '">' + esc(item) + '</div>';
    }).join('');
    var items = menu.querySelectorAll('.item');
    items.forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var val = this.getAttribute('data-value');
        input.value = val;
        menu.classList.add('hidden');
        if (onSelect) onSelect(val);
        input.dispatchEvent(new Event('input'));
      });
    });
  }
  input.addEventListener('focus', function() {
    renderMenu(this.value);
    menu.classList.remove('hidden');
  });
  input.addEventListener('input', function() {
    renderMenu(this.value);
    menu.classList.remove('hidden');
  });
  function closeOnOutsideClick(e) {
    if (!input.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  }
  if (input._closeListener) {
    document.removeEventListener('click', input._closeListener);
  }
  document.addEventListener('click', closeOnOutsideClick);
  input._closeListener = closeOnOutsideClick;
}
function formHimpun(id,host){
  var r=id?CACHE.himpun.find(function(x){return x.id===id;}):{};
  var jenis=r.jenisDana||'Infak';

  var sec1 = fsec(1,'Transaksi','Kapan diterima dan dana jenis apa',
      fld(2,'Tanggal <b class="req">*</b>','<input type="date" id="f_tanggal" value="'+(r.tanggal||today())+'">',{for:'f_tanggal'})
    + fld(2,'Jenis Dana <b class="req">*</b>',selOpt('f_jenisDana',JENIS_TOP,jenis,'onJenisChange()'))
    + fld(3,'Detail / Sub Jenis <b class="req">*</b>','<span id="subWrap">'+selOpt('f_subJenis',SUBJENIS[jenis]||[],r.subJenis)+'</span>')
    + fld(2,'No. Kwitansi','<input id="f_noKwitansi" value="'+esc(r.noKwitansi||'')+'" placeholder="Otomatis" '+(id?'':'readonly')+'>')
    + fld(3,'Program / Peruntukan','<input id="f_program" value="'+esc(r.program||'')+'" placeholder="cth: Beasiswa Yatim">')
    + '<div class="fld" id="pilarWrap" data-col="4" style="display:none"><label>Pilar Infak Terikat <b class="req">*</b></label>'+selOpt('f_pilar',KATEGORI_TERIKAT,r.pilar)+'</div>'
  );

  var sec2 = fsec(2,'Donatur','Identitas muzakki — nama bisa dipilih dari riwayat',
      fld(2,'Tipe Donatur',selOpt('f_tipeDonatur',TIPE_DONATUR,r.tipeDonatur,'onTipeChange()'))
    + fld(3,'Nama Donatur (Muzakki) <b class="req">*</b>',
        '<div class="custom-dropdown" id="donaturDropdown">'
        + '<input id="f_namaDonatur" placeholder="Ketik nama donatur..." value="'+esc(r.namaDonatur||'')+'" autocomplete="off">'
        + '<div class="custom-dropdown-menu hidden" id="donaturMenu"></div></div>')
    + fld(2,'Telepon / WA','<input id="f_telepon" value="'+esc(r.telepon||'')+'" placeholder="08...">')
    + fld(2,'Email','<input id="f_email" value="'+esc(r.email||'')+'" placeholder="opsional">')
    + fld(3,'Alamat','<input id="f_alamat" value="'+esc(r.alamat||'')+'" placeholder="opsional">')
    + '<div class="fld" id="layWrap" data-col="4" style="display:none"><label>Pilih Kantor / Unit Layanan</label><span id="laySel"></span></div>'
  );

  var sec3 = fsec(3,'Nominal & Pembayaran','Isi jumlah, lalu pilih cara pembayarannya',
      moneyField('f_jumlah',r.jumlah,'Jumlah <b class="req">*</b>')
    + fld(2,'Metode <b class="req">*</b>',selOpt('f_metode',METODE,r.metode,'onMetodeChange()'))
    + fld(2,'Status',selOpt('f_statusBayar',['Lunas','Pending'],r.statusBayar||'Lunas'))
    + fld(4,'Fundraising <b class="req">*</b>',selOpt('f_fundraising',FUNDRAISING_OPTIONS,r.fundraising||'',''))
    + '<div class="fld" id="rekWrap" data-col="4" style="display:none"><label>Rekening Tujuan</label><span id="rekSel"></span></div>'
    + fld(8,'Keterangan','<textarea id="f_keterangan" rows="2" placeholder="Catatan tambahan...">'+esc(r.keterangan||'')+'</textarea>',{cls:'fld-note'})
  );

  var b='<div class="fform">'+sec1+sec2+sec3+'</div>';

  if(host){el(host).innerHTML=b;}
  else{
    openModal(id?'Edit Penghimpunan':'Catat Penghimpunan',b,'<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveHimpun(\''+(id||'')+'\')">Simpan</button>');
    var mc=el('modalCard'); if(mc) mc.classList.add('form-modal');   // modal lebih lega untuk form 12 kolom
  }
  
  var uniqueNames = [];
  (CACHE.himpun || []).forEach(function(x) {
    if (x.namaDonatur && x.namaDonatur !== 'NN' && x.namaDonatur !== 'Setor Tunai' && uniqueNames.indexOf(x.namaDonatur) === -1) {
      uniqueNames.push(x.namaDonatur);
    }
  });
  uniqueNames = ['NN', 'Setor Tunai', 'Bagi Hasil Bank', 'Pengembalian UMP'].concat(uniqueNames.slice(0, 100));
  bindMoney('f_jumlah');
  setupSearchDropdown('f_namaDonatur', 'donaturMenu', uniqueNames, function(val) {
    if (val === 'Setor Tunai') {
      var subSel = el('f_subJenis');
      if (subSel) {
        subSel.value = 'Setor Tunai';
        onSubChange();
      }
    } else if (val === 'NN') {
      var tipeSel = el('f_tipeDonatur');
      if (tipeSel) {
        tipeSel.value = 'Hamba Allah';
      }
    }
  });

  el('f_rekeningId_val')&&0;
  onJenisChange(r.subJenis); onSubChange(r.pilar); onMetodeChange(r.rekeningId); onTipeChange(r.layananId);
}
function onJenisChange(keepSub){var j=el('f_jenisDana').value;el('subWrap').innerHTML=selOpt('f_subJenis',SUBJENIS[j]||[],keepSub,'onSubChange()');onSubChange();var w=el('rekWrap');if(w&&w.style.display!=='none'){var sel=el('f_rekeningId')?el('f_rekeningId').value:'';el('rekSel').innerHTML=rekOptions(sel,j);}}
function onSubChange(keepPilar){
  var s=(el('f_subJenis')&&el('f_subJenis').value)||'';
  var w=el('pilarWrap');
  if(w){
    if(s.toLowerCase().indexOf('terikat')>=0||s.toLowerCase().indexOf('pilar')>=0){
      w.style.display='';
      if(keepPilar)el('f_pilar').value=keepPilar;
    }else w.style.display='none';
  }
  if (s === 'Setor Tunai') {
    if (el('f_namaDonatur')) el('f_namaDonatur').value = 'Setor Tunai';
    if (el('f_tipeDonatur')) el('f_tipeDonatur').value = 'Lembaga/Perusahaan';
    if (el('f_program')) el('f_program').value = 'Setor Tunai';
  }
}
function onMetodeChange(keepRek){
  var m=el('f_metode').value;
  var w=el('rekWrap');
  if(isTransferMethod(m)){
    w.style.display='';
    el('rekSel').innerHTML=rekOptions(keepRek);
  } else {
    w.style.display='none';
  }
  if (m === 'QRIS') {
    if (el('f_namaDonatur') && !el('f_namaDonatur').value) {
      el('f_namaDonatur').value = 'NN';
    }
    if (el('f_tipeDonatur')) {
      el('f_tipeDonatur').value = 'Hamba Allah';
    }
  }
}
function onTipeChange(keepLay){var tp=el('f_tipeDonatur').value;var w=el('layWrap');var tipe=tp.indexOf('KLL')>=0?'KLL':(tp.indexOf('ULL')>=0?'ULL':'');if(tipe){w.style.display='';el('laySel').innerHTML=layOptions(tipe,keepLay);}else w.style.display='none';}
function rekOptions(sel,jDana){var list=CACHE.rekening||[];if(!jDana&&el('f_jenisDana'))jDana=el('f_jenisDana').value;var m=el('f_metode')?el('f_metode').value:'';if(m==='QRIS'){list=list.filter(function(r){var num=String(r.nomor||'');return num.endsWith('742')||num.endsWith('510')||num.endsWith('511');});}else if(jDana){var jd=jDana.toLowerCase();list=list.filter(function(r){var fg=String(r.fundGroup||'').toLowerCase();var rNo=String(r.nomor||'');if(fg===jd)return true;if(jd==='zakat'&&fg==='zakat')return true;if(jd==='zakat'&&(rNo.indexOf('9004')>=0||rNo.indexOf('880')>=0))return true;if(jd==='dskl'&&fg==='amil')return true;var isInfakLike=(jd==='infak'||jd==='sedekah'||jd==='wakaf'||jd==='kurban'||jd==='fidyah');var isRekInfakLike=(fg==='infak'||fg==='sedekah'||fg==='wakaf'||fg==='kurban'||fg==='umum');if(isInfakLike&&isRekInfakLike)return true;return false;});}if(!list.length)return '<select id="f_rekeningId"><option value="">(Belum ada rekening untuk kelompok ini)</option></select>';return '<select id="f_rekeningId">'+'<option value="">- pilih -</option>'+list.map(function(r){var label = r.namaBank+' '+r.nomor+' ('+(r.fundGroup||'Umum')+')';return '<option value="'+esc(r.id)+'" '+(String(sel)===String(r.id)?'selected':'')+'>'+esc(label)+'</option>';}).join('')+'</select>';}
function layOptions(tipe,sel){var list=(CACHE.layanan||[]).filter(function(l){return l.tipe===tipe;});if(!list.length)return '<select id="f_layananId"><option value="">(Belum ada '+tipe+' — tambah di menu KLL/ULL)</option></select>';return '<select id="f_layananId" onchange="onLayPick()">'+'<option value="">- pilih -</option>'+list.map(function(l){return '<option value="'+esc(l.id)+'" data-nama="'+esc(l.nama)+'" '+(String(sel)===String(l.id)?'selected':'')+'>'+esc((l.kode?l.kode+' - ':'')+l.nama)+'</option>';}).join('')+'</select>';}
function onLayPick(){var s=el('f_layananId');var o=s.options[s.selectedIndex];if(o&&o.dataset.nama)el('f_namaDonatur').value=o.dataset.nama;}
function saveHimpun(id){
  var d={tanggal:el('f_tanggal').value,noKwitansi:el('f_noKwitansi').value,jenisDana:el('f_jenisDana').value,subJenis:el('f_subJenis')?el('f_subJenis').value:'',
    pilar:(el('pilarWrap').style.display!=='none'&&el('f_pilar'))?el('f_pilar').value:'',program:el('f_program').value,
    tipeDonatur:el('f_tipeDonatur').value,namaDonatur:el('f_namaDonatur').value,
    layananId:(el('layWrap').style.display!=='none'&&el('f_layananId'))?el('f_layananId').value:'',
    telepon:el('f_telepon').value,email:el('f_email').value,alamat:el('f_alamat').value,jumlah:parseRupiah(el('f_jumlah').value),
    metode:el('f_metode').value,statusBayar:el('f_statusBayar').value,
    rekeningId:(el('rekWrap').style.display!=='none'&&el('f_rekeningId'))?el('f_rekeningId').value:'',keterangan:el('f_keterangan').value,
    fundraising:el('f_fundraising')?el('f_fundraising').value:''};
  if (d.subJenis === 'Setor Tunai') {
    d.namaDonatur = 'Setor Tunai';
    d.tipeDonatur = 'Lembaga/Perusahaan';
    d.bank = d.jenisDana === 'Zakat' ? 'Kas Zakat' : 'Kas Infak';
    d.program = 'Setor Tunai';
  }
  if(d.rekeningId){var rk=(CACHE.rekening||[]).find(function(x){return x.id===d.rekeningId;});if(rk){d.bank=rk.namaBank;d.atasNama=rk.atasNama;}}
  clearFieldErrors('.fform');
  var bad=false;
  if(!d.namaDonatur){markFieldError('f_namaDonatur','Nama donatur wajib diisi');bad=true;}
  if(!d.jumlah){markFieldError('f_jumlah','Jumlah wajib diisi');bad=true;}
  if(!d.fundraising){markFieldError('f_fundraising','Fundraising wajib dipilih');bad=true;}
  if(bad){toast('Lengkapi field yang ditandai',true);return;}
  if(id)d.id=id;
  gas('apiSavePenghimpunan')(TOKEN,d).then(function(saved){closeModal();toast('Penghimpunan tersimpan');viewPenghimpunan();if(!id)setTimeout(function(){confirmDialog({title:'Berhasil Disimpan',message:'Cetak kwitansi sekarang?',okText:'🖨️ Cetak Sekarang',cancelText:'Nanti Saja',icon:'🧾'}).then(function(__ok){if(__ok)cetakKwitansi(saved.id);});},300);}).catch(handleErr);
}
function delHimpun(id){uiConfirm('Hapus data ini?').then(function(__ok){if(!__ok)return;gas('apiDeletePenghimpunan')(TOKEN,id).then(function(){toast('Terhapus');viewPenghimpunan();}).catch(handleErr);});}

/* ============ KWITANSI ============ */
function terbilang(n){n=Math.floor(Math.abs(Number(n))||0);var s=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];function t(x){if(x<12)return s[x];if(x<20)return t(x-10)+' belas';if(x<100)return t(Math.floor(x/10))+' puluh'+(x%10?' '+t(x%10):'');if(x<200)return 'seratus'+(x%100?' '+t(x%100):'');if(x<1000)return t(Math.floor(x/100))+' ratus'+(x%100?' '+t(x%100):'');if(x<2000)return 'seribu'+(x%1000?' '+t(x%1000):'');if(x<1000000)return t(Math.floor(x/1000))+' ribu'+(x%1000?' '+t(x%1000):'');if(x<1000000000)return t(Math.floor(x/1000000))+' juta'+(x%1000000?' '+t(x%1000000):'');return t(Math.floor(x/1000000000))+' miliar'+(x%1000000000?' '+t(x%1000000000):'');}if(n===0)return 'nol';return t(n).replace(/\s+/g,' ').trim();}
function cetakKwitansi(id){gas('apiGetKwitansi')(TOKEN,id).then(function(res){printDoc(buildKwitansiHTML(res.data,res.settings));}).catch(handleErr);}
function buildKwitansiHTML(d,s){
  var det=(d.subJenis||d.jenisDana)+((String(d.subJenis).toLowerCase().indexOf('pilar')>=0&&d.pilar)?' - '+d.pilar:'');
  var verifyUrl = window.location.origin + '/public.html?kwitansi=' + encodeURIComponent(d.noKwitansi || d.id);
  var qrHtml = window.QRCode ? window.QRCode(verifyUrl, { size: 100, colorDark: '#ea6a1e' }).toHTML() : '';
  
  return docShell('Kwitansi '+esc(d.noKwitansi),
    headerHTML(s,'TANDA TERIMA / KWITANSI',d.noKwitansi)+
    '<table class="kv">'+
      rowKV('Telah diterima dari',d.namaDonatur)+
      rowKV('Alamat',d.alamat||'-')+
      rowKV('Jenis Dana',d.jenisDana+' — '+det)+
      (d.program?rowKV('Program',d.program):'')+
      rowKV('Terbilang','<i>'+terbilang(d.jumlah)+' rupiah</i>')+
      rowKV('Metode',(d.metode||'-')+(d.bank?' ('+d.bank+')':''))+
      rowKV('Keterangan',d.keterangan||'-')+
    '</table>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0">'+
      '<div class="amount-box" style="margin:0;font-size:20px">'+rp(d.jumlah)+'</div>'+
      qrHtml+
    '</div>'+
    signHTML(s,d.petugas,'Penyetor','Petugas / Amil')+
    '<div class="note">Kwitansi ini sah sebagai bukti pembayaran yang dapat diverifikasi secara publik via QR Code. Jazakumullah khairan katsiran. ('+(d.statusBayar==='Pending'?'PENDING':'LUNAS')+')</div>'
  );
}

/* ============ PENTASYARUFAN ============ */
var ASHNAF=['Fakir','Miskin','Amil','Muallaf','Riqab (Memerdekakan Budak)','Gharimin (Berhutang)','Fi Sabilillah','Ibnu Sabil'];
var BENTUK=['Uang Tunai','Transfer','Sembako','Beasiswa','Modal Usaha','Bantuan Kesehatan','Bantuan Pendidikan','Bantuan Bencana','Pembangunan','Lainnya'];
function viewPentasyarufan(){gas('apiListPentasyarufan')(TOKEN).then(function(rows){
    var sorted = rows.slice().sort(function(a, b) {
      var da = new Date(a.tanggal + 'T00:00:00');
      var db = new Date(b.tanggal + 'T00:00:00');
      if (da.getTime() !== db.getTime()) return db - da;
      var ta = new Date(a.dibuat || 0);
      var tb = new Date(b.dibuat || 0);
      return tb - ta;
    });
    CACHE.tasyaruf=sorted;renderPentasyarufan(sorted);
  }).catch(handleErr);}
function renderPentasyarufan(rows){
  var h='<div class="page-head"><div><h2>Input Pentasyarufan</h2><div class="desc">Catat penyaluran dana — data mustahik tampil di bawah</div></div></div>';
  if(canDo('pentasyarufan','create'))h+='<div class="card form-card">'
    +'<div class="form-card-h"><h3>Form Penyaluran Dana</h3><span class="form-hint">Ctrl + Enter untuk menyimpan</span></div>'
    +'<div id="tasyarufFormHost"></div>'
    +'<div class="form-actions"><button class="btn btn-ghost" onclick="formTasyaruf(\'\',\'tasyarufFormHost\')">↺ Reset</button>'
    +'<button class="btn btn-primary" onclick="saveTasyaruf(\'\')">Simpan Penyaluran</button></div></div>';
  var delBtn = canDo('pentasyarufan','delete') ? '<button class="btn btn-sm btn-ghost" style="color:var(--red);border-color:rgba(229,72,77,0.3);margin-left:8px" onclick="openDeleteByDateModal(\'tasyaruf\')">🗑️ Hapus Rentang Tanggal</button>' : '';
  h+='<div class="table-wrap"><div class="toolbar"><button class="btn btn-sm btn-ghost" onclick="openImportModal(\'tasyaruf\')">📥 Import Data</button>'+delBtn+'</div>';
  
  var filterHtml = '<div class="filter-panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px;padding:12px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Cari Penerima / Bukti</label><input type="text" id="tasyTable_search" placeholder="Cari..." oninput="applyFilters(\'tasyTable\')" style="padding:6px 10px;font-size:12.5px"></div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Tanggal</label><input type="date" id="tasyTable_filter_date" onchange="applyFilters(\'tasyTable\')" style="padding:6px 10px;font-size:12.5px"></div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Ashnaf</label>' +
      '<select id="tasyTable_filter_type" onchange="applyFilters(\'tasyTable\')" style="padding:6px 10px;font-size:12.5px">' +
        '<option value="">Semua</option>' +
        '<option value="Fakir">Fakir</option>' +
        '<option value="Miskin">Miskin</option>' +
        '<option value="Amil">Amil</option>' +
        '<option value="Muallaf">Muallaf</option>' +
        '<option value="Gharimin (Berhutang)">Gharimin</option>' +
        '<option value="Fi Sabilillah">Fi Sabilillah</option>' +
        '<option value="Ibnu Sabil">Ibnu Sabil</option>' +
      '</select>' +
    '</div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Bentuk Bantuan</label>' +
      '<select id="tasyTable_filter_method" onchange="applyFilters(\'tasyTable\')" style="padding:6px 10px;font-size:12.5px">' +
        '<option value="">Semua</option>' +
        '<option value="Uang Tunai">Uang Tunai</option>' +
        '<option value="Transfer">Transfer</option>' +
        '<option value="Sembako">Sembako</option>' +
        '<option value="Lainnya">Lainnya</option>' +
      '</select>' +
    '</div>' +
    '<div class="field" style="margin:0"><label style="font-size:11px;margin-bottom:4px;font-weight:600">Fundraising</label><input type="text" id="tasyTable_filter_fr" placeholder="Nama FR..." oninput="applyFilters(\'tasyTable\')" style="padding:6px 10px;font-size:12.5px"></div>' +
  '</div>';
  
  h+= filterHtml;
  h+='<div style="overflow:auto"><table id="tasyTable"><thead><tr><th>No. Bukti</th><th>Tanggal</th><th>Penerima</th><th>Ashnaf</th><th>Program</th><th>Jumlah</th><th>Status</th><th></th></tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="8"><div class="empty"><div class="big">↑</div>Belum ada pentasyarufan.</div></td></tr>';
  rows.forEach(function(r){
    var frCleaned = cleanFR(r.fundraising);
    var frText = '<div class="muted" style="font-size:11px;margin-top:2px">FR: ' + esc(frCleaned) + '</div>';
    h+='<tr data-tanggal="'+esc(r.tanggal)+'" data-jenis="'+esc(r.ashnaf)+'" data-metode="'+esc(r.bentukBantuan)+'" data-fr="'+esc(frCleaned)+'"><td><b>'+esc(r.noBukti)+'</b></td><td>'+fdate(r.tanggal)+'</td><td><b>'+esc(r.namaPenerima||'-')+'</b>'+frText+'</td><td><span class="badge purple">'+esc(r.ashnaf)+'</span></td><td>'+esc(r.program||'-')+'</td><td style="font-weight:700;color:var(--amber)">'+rp(r.jumlah)+'</td><td>'+statusBadge(r.statusSalur||'Tersalur')+'</td><td><div class="actions-cell"><button class="icon-btn" onclick="cetakBukti(\''+r.id+'\')">🧾</button>'+(canDo('pentasyarufan','edit')?'<button class="icon-btn" onclick="formTasyaruf(\''+r.id+'\')">✎</button>':'')+(canDo('pentasyarufan','delete')?'<button class="icon-btn" onclick="delTasyaruf(\''+r.id+'\')">🗑</button>':'')+'</div></td></tr>';
  });
  h+='</tbody></table></div></div>';el('content').innerHTML=h;
  if(canDo('pentasyarufan','create'))formTasyaruf('','tasyarufFormHost');}
function statusBadge(s){s=s||'Lunas';var c=s==='Lunas'||s==='Tersalur'?'green':(s==='Pending'?'amber':'blue');return '<span class="badge '+c+'">'+esc(s)+'</span>';}
function formTasyaruf(id,host){
  var r=id?CACHE.tasyaruf.find(function(x){return x.id===id;}):{};

  var sec1 = fsec(1,'Penyaluran','Kapan disalurkan, untuk golongan dan program apa',
      fld(2,'Tanggal <b class="req">*</b>','<input type="date" id="f_tanggal" value="'+(r.tanggal||today())+'">')
    + fld(2,'No. Bukti','<input id="f_noBukti" value="'+esc(r.noBukti||'')+'" placeholder="Otomatis" '+(id?'':'readonly')+'>')
    + fld(2,'Ashnaf <b class="req">*</b>',selOpt('f_ashnaf',ASHNAF,r.ashnaf))
    + fld(2,'Sumber Dana',selOpt('f_sumberDana',JENIS_TOP,r.sumberDana))
    + fld(2,'Bentuk Bantuan',selOpt('f_bentukBantuan',BENTUK,r.bentukBantuan))
    + fld(2,'Program','<input id="f_program" value="'+esc(r.program||'')+'" placeholder="cth: Bedah Rumah">')
  );

  var sec2 = fsec(2,'Penerima','Identitas mustahik penerima manfaat',
      fld(3,'Nama Penerima (Mustahik) <b class="req">*</b>',
        '<div class="custom-dropdown" id="penerimaDropdown">'
        + '<input id="f_namaPenerima" placeholder="Ketik nama penerima..." value="'+esc(r.namaPenerima||'')+'" autocomplete="off">'
        + '<div class="custom-dropdown-menu hidden" id="penerimaMenu"></div></div>')
    + fld(2,'NIK','<input id="f_nik" value="'+esc(r.nik||'')+'" placeholder="opsional">')
    + fld(2,'Telepon / WA','<input id="f_telepon" value="'+esc(r.telepon||'')+'" placeholder="08...">')
    + fld(5,'Alamat','<input id="f_alamat" value="'+esc(r.alamat||'')+'" placeholder="opsional">')
  );

  var sec3 = fsec(3,'Nominal & Penyaluran','Nilai bantuan dan cara penyerahannya',
      moneyField('f_jumlah',r.jumlah,'Jumlah / Nilai <b class="req">*</b>')
    + fld(2,'Metode',selOpt('f_metode',METODE,r.metode))
    + fld(2,'Status',selOpt('f_statusSalur',['Tersalur','Pending'],r.statusSalur||'Tersalur'))
    + fld(4,'Fundraising <b class="req">*</b>',selOpt('f_fundraising',FUNDRAISING_OPTIONS,r.fundraising||'',''))
    + fld(8,'Keterangan','<textarea id="f_keterangan" rows="2" placeholder="Catatan tambahan...">'+esc(r.keterangan||'')+'</textarea>',{cls:'fld-note'})
  );

  var b='<div class="fform">'+sec1+sec2+sec3+'</div>';

  if(host){el(host).innerHTML=b;}
  else{
    openModal(id?'Edit Pentasyarufan':'Catat Pentasyarufan',b,'<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveTasyaruf(\''+(id||'')+'\')">Simpan</button>');
    var mc2=el('modalCard'); if(mc2) mc2.classList.add('form-modal');
  }

  var uniquePenerima = [];
  (CACHE.tasyaruf || []).forEach(function(x) {
    if (x.namaPenerima && x.namaPenerima !== 'Lazismu Daerah Bantul' && uniquePenerima.indexOf(x.namaPenerima) === -1) {
      uniquePenerima.push(x.namaPenerima);
    }
  });
  uniquePenerima = ['Lazismu Daerah Bantul'].concat(uniquePenerima.slice(0, 100));
  setupSearchDropdown('f_namaPenerima', 'penerimaMenu', uniquePenerima);
  bindMoney('f_jumlah');
}
function saveTasyaruf(id){var f=['tanggal','noBukti','ashnaf','sumberDana','program','namaPenerima','nik','telepon','alamat','jumlah','bentukBantuan','metode','statusSalur','keterangan','fundraising'];var d={};f.forEach(function(k){d[k]=el('f_'+k)?el('f_'+k).value:'';});
  d.jumlah=parseRupiah(d.jumlah);
  clearFieldErrors('.fform');
  var bad=false;
  if(!d.namaPenerima){markFieldError('f_namaPenerima','Nama penerima wajib diisi');bad=true;}
  if(!d.jumlah){markFieldError('f_jumlah','Jumlah wajib diisi');bad=true;}
  if(!d.fundraising){markFieldError('f_fundraising','Fundraising wajib dipilih');bad=true;}
  if(bad){toast('Lengkapi field yang ditandai',true);return;}
  if(id)d.id=id;
  gas('apiSavePentasyarufan')(TOKEN,d).then(function(saved){closeModal();toast('Tersimpan');viewPentasyarufan();if(!id)setTimeout(function(){confirmDialog({title:'Berhasil Disimpan',message:'Cetak bukti penyaluran?',okText:'🖨️ Cetak Sekarang',cancelText:'Nanti Saja',icon:'🧾'}).then(function(__ok){if(__ok)cetakBukti(saved.id);});},300);}).catch(handleErr);}
function delTasyaruf(id){uiConfirm('Hapus data ini?').then(function(__ok){if(!__ok)return;gas('apiDeletePentasyarufan')(TOKEN,id).then(function(){toast('Terhapus');viewPentasyarufan();}).catch(handleErr);});}
function cetakBukti(id){gas('apiGetBuktiPentasyarufan')(TOKEN,id).then(function(res){printDoc(buildBuktiHTML(res.data,res.settings));}).catch(handleErr);}
function buildBuktiHTML(d,s){return docShell('Bukti Penyaluran '+esc(d.noBukti),headerHTML(s,'BUKTI PENYALURAN DANA',d.noBukti)+'<table class="kv">'+rowKV('Telah disalurkan kepada',d.namaPenerima)+rowKV('NIK',d.nik||'-')+rowKV('Alamat',d.alamat||'-')+rowKV('Golongan (Ashnaf)',d.ashnaf)+rowKV('Program / Bentuk',(d.program||'-')+' — '+(d.bentukBantuan||'-'))+rowKV('Sumber Dana',d.sumberDana||'-')+rowKV('Terbilang','<i>'+terbilang(d.jumlah)+' rupiah</i>')+rowKV('Keterangan',d.keterangan||'-')+'</table><div class="amount-box">'+rp(d.jumlah)+'</div>'+signHTML(s,d.petugas,'Penerima','Petugas / Amil')+'<div class="note">Bukti ini sah sebagai tanda penyaluran dana sesuai amanah muzakki dan ketentuan syariah.</div>');}

/* ============ DOC/PRINT ============ */
function docShell(title,inner){return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+title+'</title><style>@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap");*{box-sizing:border-box}body{font-family:Inter,sans-serif;color:#16161d;margin:0;padding:34px;background:#fff}.doc{max-width:720px;margin:0 auto;border:1px solid #e3e3e8;border-radius:14px;padding:34px 40px}.dh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #16161d;padding-bottom:16px;margin-bottom:22px}.dh .lg{font-family:Space Grotesk;font-size:22px;font-weight:700}.dh .sm{font-size:12px;color:#6b6b76;margin-top:2px;max-width:330px}.dh .rt{text-align:right}.dh .rt .t{font-family:Space Grotesk;font-weight:700;font-size:15px;letter-spacing:1px}.dh .rt .no{font-size:13px;color:#444;margin-top:4px}table.kv{width:100%;border-collapse:collapse;margin-bottom:18px}table.kv td{padding:7px 0;font-size:14px;vertical-align:top}table.kv td:first-child{width:200px;color:#6b6b76}table.kv td:nth-child(2){width:14px;color:#6b6b76}.amount-box{display:inline-block;background:#f3f3f7;border:1px dashed #16161d;border-radius:10px;padding:10px 22px;font-family:Space Grotesk;font-weight:700;font-size:22px;margin-bottom:26px}.sign{display:flex;justify-content:space-between;margin-top:30px}.sign .col{text-align:center;width:45%;font-size:13px}.sign .sp{height:64px}.sign .nm{border-top:1px solid #16161d;padding-top:6px;font-weight:600}.note{margin-top:26px;font-size:11.5px;color:#6b6b76;border-top:1px solid #eee;padding-top:12px;font-style:italic}@media print{body{padding:0}.doc{border:none}.noprint{display:none}}.bar{text-align:center;margin-top:20px}.bar button{font-family:Inter;background:#16161d;color:#fff;border:none;padding:10px 22px;border-radius:999px;cursor:pointer;font-weight:600}</style></head><body><div class="doc">'+inner+'</div><div class="bar noprint"><button onclick="window.print()">🖨 Cetak / Simpan PDF</button></div></body></html>';}
function headerHTML(s,title,no){var logo=s.logoUrl?'<img src="'+esc(s.logoUrl)+'" style="height:48px;margin-bottom:8px">':'';return '<div class="dh"><div>'+logo+'<div class="lg">'+esc(s.namaLembaga||'Lembaga Amil Zakat')+'</div><div class="sm">'+esc(s.alamat||'')+(s.telepon?' • '+esc(s.telepon):'')+(s.email?' • '+esc(s.email):'')+'</div></div><div class="rt"><div class="t">'+title+'</div><div class="no">No: '+esc(no)+'<br>Tgl: '+fdate(new Date())+'</div></div></div>';}
function rowKV(k,v){return '<tr><td>'+esc(k)+'</td><td>:</td><td><b>'+v+'</b></td></tr>';}
function signHTML(s,petugas,lr,rr){return '';}
function printDoc(html){var w=window.open('','_blank');w.document.open();w.document.write(html);w.document.close();}

/* ============ REKENING ============ */
function viewRekening(){gas('apiListRekening')(TOKEN).then(function(rows){CACHE.rekening=rows;renderRekening(rows);}).catch(handleErr);}
function renderRekening(rows){var add=canDo('rekening','create')?'<button class="btn btn-primary" onclick="formRek()">+ Tambah Rekening</button>':'';
  var h='<div class="page-head"><div><h1>No. Rekening</h1><div class="desc">Daftar rekening bank lembaga untuk penerimaan transfer</div></div>'+add+'</div>';
  h+='<div class="table-wrap"><div style="overflow:auto"><table><thead><tr><th>Bank</th><th>No. Rekening</th><th>Atas Nama</th><th>Peruntukan</th><th>Status</th><th></th></tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="6"><div class="empty"><div class="big">▢</div>Belum ada rekening.</div></td></tr>';
  rows.forEach(function(r){h+='<tr><td><b>'+esc(r.namaBank)+'</b></td><td>'+esc(r.nomor)+'</td><td>'+esc(r.atasNama)+'</td><td>'+esc(r.fundGroup||'Umum')+'</td><td><span class="badge '+(String(r.aktif)!=='false'?'green':'amber')+'">'+(String(r.aktif)!=='false'?'Aktif':'Nonaktif')+'</span></td><td><div class="actions-cell">'+(canDo('rekening','edit')?'<button class="icon-btn" onclick="formRek(\''+r.id+'\')">✎</button>':'')+(canDo('rekening','delete')?'<button class="icon-btn" onclick="delRek(\''+r.id+'\')">🗑</button>':'')+'</div></td></tr>';});
  h+='</tbody></table></div></div>';el(window.REK_HOST||'content').innerHTML=h;}
function formRek(id){var r=id?CACHE.rekening.find(function(x){return x.id===id;}):{};
  var b='<div class="row"><div class="field"><label>Nama Bank *</label><input id="r_namaBank" value="'+esc(r.namaBank||'')+'" placeholder="cth: BSI / BCA / Mandiri"></div><div class="field"><label>No. Rekening *</label><input id="r_nomor" value="'+esc(r.nomor||'')+'"></div></div><div class="field"><label>Atas Nama *</label><input id="r_atasNama" value="'+esc(r.atasNama||'')+'"></div><div class="row"><div class="field"><label>Peruntukan Dana</label>'+selOpt('r_fundGroup',['Umum','Zakat','Infak','Sedekah','Wakaf','Amil','Kurban','DSKL'],r.fundGroup||'Umum')+'</div><div class="field"><label>Status</label>'+selOpt('r_aktif',['true','false'],String(r.aktif!==false&&String(r.aktif)!=='false'))+'</div></div>';
  openModal(id?'Edit Rekening':'Tambah Rekening',b,'<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveRek(\''+(id||'')+'\')">Simpan</button>');}
function saveRek(id){var d={namaBank:el('r_namaBank').value,nomor:el('r_nomor').value,atasNama:el('r_atasNama').value,fundGroup:el('r_fundGroup').value,aktif:el('r_aktif').value};if(!d.namaBank||!d.nomor||!d.atasNama){toast('Bank, nomor & atas nama wajib',true);return;}if(id)d.id=id;gas('apiSaveRekening')(TOKEN,d).then(function(){closeModal();toast('Rekening tersimpan');viewRekening();}).catch(handleErr);}
function delRek(id){uiConfirm('Hapus rekening ini?').then(function(__ok){if(!__ok)return;gas('apiDeleteRekening')(TOKEN,id).then(function(){toast('Terhapus');viewRekening();}).catch(handleErr);});}

/* ============ LAYANAN (KLL/ULL) ============ */
function viewLayanan(){gas('apiListLayanan')(TOKEN).then(function(rows){CACHE.layanan=rows;renderLayanan(rows);}).catch(handleErr);}
function renderLayanan(rows){var add=canDo('layanan','create')?'<button class="btn btn-primary" onclick="formLay()">+ Tambah KLL/ULL</button>':'';
  var h='<div class="page-head"><div><h1>Kantor / Unit Layanan</h1><div class="desc">Daftar Kantor Layanan (KLL) & Unit Layanan (ULL)</div></div>'+add+'</div>';
  h+='<div class="table-wrap"><div class="toolbar"><input class="search" placeholder="Cari nama / kode / wilayah..." oninput="filterTable(this.value,\'layTable\')"></div><div style="overflow:auto"><table id="layTable"><thead><tr><th>Tipe</th><th>Kode</th><th>Nama</th><th>Wilayah</th><th>Penanggung Jawab</th><th>Status</th><th></th></tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="7"><div class="empty"><div class="big">⌖</div>Belum ada KLL/ULL.</div></td></tr>';
  rows.forEach(function(r){h+='<tr><td><span class="badge '+(r.tipe==='KLL'?'blue':'purple')+'">'+esc(r.tipe)+'</span></td><td>'+esc(r.kode||'-')+'</td><td><b>'+esc(r.nama)+'</b></td><td>'+esc(r.wilayah||'-')+'</td><td>'+esc(r.penanggungJawab||'-')+'</td><td><span class="badge '+(String(r.aktif)!=='false'?'green':'amber')+'">'+(String(r.aktif)!=='false'?'Aktif':'Nonaktif')+'</span></td><td><div class="actions-cell">'+(canDo('layanan','edit')?'<button class="icon-btn" onclick="formLay(\''+r.id+'\')">✎</button>':'')+(canDo('layanan','delete')?'<button class="icon-btn" onclick="delLay(\''+r.id+'\')">🗑</button>':'')+'</div></td></tr>';});
  h+='</tbody></table></div></div>';el(window.LAY_HOST||'content').innerHTML=h;}
function formLay(id){var r=id?CACHE.layanan.find(function(x){return x.id===id;}):{tipe:'KLL'};
  var b='<div class="row"><div class="field"><label>Tipe *</label>'+selOpt('l_tipe',['KLL','ULL'],r.tipe||'KLL')+'</div><div class="field"><label>Kode</label><input id="l_kode" value="'+esc(r.kode||'')+'" placeholder="cth: KLL-01"></div></div><div class="field"><label>Nama '+'*</label><input id="l_nama" value="'+esc(r.nama||'')+'" placeholder="cth: Pajangan / Masjid Aceh"></div><div class="row"><div class="field"><label>Wilayah</label><input id="l_wilayah" value="'+esc(r.wilayah||'')+'"></div><div class="field"><label>Penanggung Jawab</label><input id="l_penanggungJawab" value="'+esc(r.penanggungJawab||'')+'"></div></div><div class="row"><div class="field"><label>Telepon</label><input id="l_telepon" value="'+esc(r.telepon||'')+'"></div><div class="field"><label>Status</label>'+selOpt('l_aktif',['true','false'],String(r.aktif!==false&&String(r.aktif)!=='false'))+'</div></div><div class="muted" style="font-size:12px">KLL = Kantor Layanan • ULL = Unit Layanan. Data ini muncul sebagai pilihan donatur di form Penghimpunan.</div>';
  openModal(id?'Edit KLL/ULL':'Tambah KLL/ULL',b,'<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveLay(\''+(id||'')+'\')">Simpan</button>');}
function saveLay(id){var d={tipe:el('l_tipe').value,kode:el('l_kode').value,nama:el('l_nama').value,wilayah:el('l_wilayah').value,penanggungJawab:el('l_penanggungJawab').value,telepon:el('l_telepon').value,aktif:el('l_aktif').value};if(!d.nama){toast('Nama wajib diisi',true);return;}if(id)d.id=id;gas('apiSaveLayanan')(TOKEN,d).then(function(){closeModal();toast('Tersimpan');viewLayanan();}).catch(handleErr);}
function delLay(id){uiConfirm('Hapus data ini?').then(function(__ok){if(!__ok)return;gas('apiDeleteLayanan')(TOKEN,id).then(function(){toast('Terhapus');viewLayanan();}).catch(handleErr);});}

/* ============ LAPORAN (Jurnal + Broadcast) ============ */
var LAP_TAB='himpun';   // tab pertama = rekap penghimpunan per layanan
function viewLaporan(){renderLaporanShell();}
/* ============================================================
   LAPORAN — REKAP PER KANTOR LAYANAN (v9)
   Filter bulan + pencarian layanan. Tiap layanan dibuka jadi
   rincian per pilar/ashnaf, dan tiap pilar bisa dibuka lagi
   menjadi daftar transaksi dengan filter fundraising.
   ============================================================ */
var LAP_SEL = null;                        // layanan yang terbuka
var LAP_PILAR = null;                      // pilar yang terbuka di dalamnya
var LAP_SORT = { key: 'tanggal', dir: -1 };
var LAP_Q = '';                            // cari transaksi
var LAP_QLAY = '';                         // cari nama KLL/ULL
var LAP_MONTH = 'all';                     // 'all' atau 'YYYY-MM'
var LAP_FR = 'all';                        // filter fundraising di detail pilar

function lapDec(v){ try { return decodeURIComponent(v); } catch(e) { return v; } }
function lapEnc(v){ return encodeURIComponent(String(v == null ? '' : v)); }

function lapPilarOf(r){
  if (r.pilar && String(r.pilar).trim()) return String(r.pilar).trim();
  var sub = String(r.subJenis || '').trim();
  if (sub) return sub;
  return String(r.jenisDana || 'Lainnya').trim();
}
function lapKeyOf(r){
  return (window.__lapMode === 'salur') ? (r.ashnaf || 'Lainnya') : lapPilarOf(r);
}
function lapMonthKey(r){ return String(r.tanggal || '').slice(0, 7); }
function lapGroup(rows, keyFn){
  var g = {};
  rows.forEach(function(r){
    var k = keyFn(r) || 'Lainnya';
    if (!g[k]) g[k] = { total: 0, n: 0 };
    g[k].total += Number(r.jumlah) || 0;
    g[k].n++;
  });
  return g;
}
function lapSortedKeys(g){ return Object.keys(g).sort(function(a,b){ return g[b].total - g[a].total; }); }
function lapSum(rows){ return rows.reduce(function(a,r){ return a + (Number(r.jumlah)||0); }, 0); }

/* ---- data terfilter bulan ---- */
function lapRows(){
  var all = window.__lapAll || [];
  if (LAP_MONTH === 'all') return all;
  return all.filter(function(r){ return lapMonthKey(r) === LAP_MONTH; });
}

/* ---- kendali: filter bulan + cari layanan ---- */
function lapFilterBar(){
  var all = window.__lapAll || [];
  var months = {};
  all.forEach(function(r){ var m = lapMonthKey(r); if (m) months[m] = (months[m]||0) + 1; });
  var keys = Object.keys(months).sort().reverse();
  var opt = '<option value="all"' + (LAP_MONTH==='all'?' selected':'') + '>Semua Bulan</option>';
  keys.forEach(function(m){
    var p = m.split('-');
    var label = (BULAN[Number(p[1])] || p[1]) + ' ' + p[0];
    opt += '<option value="' + m + '"' + (LAP_MONTH===m?' selected':'') + '>' + label + '</option>';
  });
  return '<div class="lap-filter">'
    + '<div class="lap-filter-f"><label>Periode</label>'
    + '<select onchange="setLapMonth(this.value)">' + opt + '</select></div>'
    + '<div class="lap-filter-f grow"><label>Cari Kantor Layanan</label>'
    + '<input placeholder="Ketik nama KLL / ULL..." value="' + esc(LAP_QLAY) + '" oninput="setLapQLay(this.value)"></div>'
    + (LAP_MONTH!=='all'||LAP_QLAY ? '<button class="btn btn-sm lap-filter-reset" onclick="lapResetFilter()">Reset</button>' : '')
    + '</div>';
}
function setLapMonth(v){ LAP_MONTH = v; LAP_SEL = null; LAP_PILAR = null; lapRefreshAll(); }
function setLapQLay(v){ LAP_QLAY = v || ''; lapRefreshList(); }
function lapResetFilter(){ LAP_MONTH='all'; LAP_QLAY=''; LAP_SEL=null; LAP_PILAR=null; renderLapRekap(window.__lapMode||'himpun'); }

/* ---- ringkasan ---- */
function lapSummary(rows, mode){
  var sLay = 0, sDae = 0, nLay = {};
  rows.forEach(function(r){
    var k = getLayananNameForTx(r), v = Number(r.jumlah) || 0;
    if (k === LAYANAN_DAERAH) sDae += v; else { sLay += v; nLay[k] = 1; }
  });
  var total = sLay + sDae;
  var pct = total ? Math.round(sLay / total * 100) : 0;
  return '<div class="lap-sum">'
    + '<div class="lap-sum-card big"><div class="lap-sum-lbl">Total ' + (mode==='himpun'?'Penghimpunan':'Pentasyarufan') + '</div>'
    + '<div class="lap-sum-val">' + rp(total) + '</div>'
    + '<div class="lap-sum-sub">' + rows.length + ' transaksi</div></div>'
    + '<div class="lap-sum-card"><div class="lap-sum-lbl">Lewat KLL / ULL</div>'
    + '<div class="lap-sum-val">' + rp(sLay) + '</div>'
    + '<div class="lap-sum-sub">' + pct + '% &middot; ' + Object.keys(nLay).length + ' layanan</div></div>'
    + '<div class="lap-sum-card"><div class="lap-sum-lbl">Penghimpunan Daerah</div>'
    + '<div class="lap-sum-val">' + rp(sDae) + '</div>'
    + '<div class="lap-sum-sub">' + (100 - pct) + '% dari total</div></div>'
    + '</div>';
}

/* ---- daftar layanan ---- */
function lapLayananList(rows){
  var g = lapGroup(rows, function(r){ return getLayananNameForTx(r); });
  var keys = lapSortedKeys(g);
  var q = LAP_QLAY.toLowerCase().trim();
  if (q) {
    /* Cocokkan juga KODE layanan — petugas terbiasa mengetik "SDUA",
       sementara yang tampil sudah jadi nama resminya. */
    var master = CACHE.layanan || [];
    keys = keys.filter(function(k){
      if (k.toLowerCase().indexOf(q) >= 0) return true;
      var l = null;
      for (var i = 0; i < master.length; i++) {
        var lbl = (master[i].tipe ? master[i].tipe + ' ' : '') + master[i].nama;
        if (lbl === k) { l = master[i]; break; }
      }
      return !!(l && String(l.kode || '').toLowerCase().indexOf(q) >= 0);
    });
  }
  if (!keys.length) return '<div class="lap-empty">Tidak ada layanan yang cocok.</div>';
  var max = g[keys[0]] ? g[keys[0]].total : 0;
  var h = '<div class="lap-list">';
  keys.forEach(function(k){
    var it = g[k], isDae = (k === LAYANAN_DAERAH), open = (LAP_SEL === k);
    var w = max ? Math.round(it.total / max * 100) : 0;
    h += '<button class="lap-row' + (open?' open':'') + (isDae?' daerah':'') + '" onclick="setLapSel(\'' + lapEnc(k) + '\')">'
      + '<span class="lap-row-bar" style="width:' + w + '%"></span>'
      + '<span class="lap-row-name">' + esc(k) + '<em>' + it.n + ' transaksi</em></span>'
      + '<span class="lap-row-val">' + rp(it.total) + '</span>'
      + '<span class="lap-row-caret">' + (open?'&#9662;':'&#9656;') + '</span></button>';
    if (open) h += '<div class="lap-detail">' + lapDetail(rows, k) + '</div>';
  });
  return h + '</div>';
}

/* ---- rincian pilar / ashnaf sebuah layanan ---- */
function lapDetail(rows, name){
  var mode = window.__lapMode || 'himpun';
  var sub = rows.filter(function(r){ return getLayananNameForTx(r) === name; });
  var total = lapSum(sub);
  var g = lapGroup(sub, lapKeyOf);
  var keys = lapSortedKeys(g);

  var h = '<div class="lap-detail-head">'
    + '<div><b>' + (mode==='himpun'?'Rincian per pilar':'Rincian per ashnaf') + '</b>'
    + ' <span class="muted">&middot; ' + sub.length + ' transaksi</span></div>'
    + '<div class="lap-detail-total">' + rp(total) + '</div></div>'
    + '<table class="lap-table"><thead><tr>'
    + '<th>' + (mode==='himpun'?'Pilar / Jenis':'Ashnaf') + '</th>'
    + '<th class="num">Transaksi</th><th class="num">Jumlah</th><th class="num">Porsi</th><th></th>'
    + '</tr></thead><tbody>';
  keys.forEach(function(k){
    var pct = total ? Math.round(g[k].total / total * 100) : 0;
    var open = (LAP_PILAR === k);
    h += '<tr class="' + (open?'on':'') + '"><td>' + esc(k) + '</td>'
      + '<td class="num">' + g[k].n + '</td>'
      + '<td class="num strong">' + rp(g[k].total) + '</td>'
      + '<td class="num"><span class="lap-pct"><i style="width:' + pct + '%"></i></span>' + pct + '%</td>'
      + '<td class="num"><button class="lap-mini" onclick="setLapPilar(\'' + lapEnc(k) + '\')">'
      + (open ? 'Tutup' : 'Detail') + '</button></td></tr>';
    if (open) {
      h += '<tr class="lap-sub-row"><td colspan="5">'
        + lapPilarPanel(sub.filter(function(r){ return lapKeyOf(r) === k; }), k, mode)
        + '</td></tr>';
    }
  });
  h += '</tbody><tfoot><tr><td>Total</td><td class="num">' + sub.length + '</td>'
    + '<td class="num strong">' + rp(total) + '</td><td class="num">100%</td><td></td></tr></tfoot></table>';
  return h;
}

/* ---- isi satu pilar: filter fundraising + daftar transaksi ---- */
function lapPilarPanel(rows, pilar, mode){
  var frs = {};
  rows.forEach(function(r){ frs[cleanFR(r.fundraising)] = 1; });
  var frKeys = Object.keys(frs).sort();
  var opt = '<option value="all"' + (LAP_FR==='all'?' selected':'') + '>Semua Fundraising</option>';
  frKeys.forEach(function(f){ opt += '<option value="' + esc(f) + '"' + (LAP_FR===f?' selected':'') + '>' + esc(f) + '</option>'; });

  var list = rows.filter(function(r){ return LAP_FR === 'all' || cleanFR(r.fundraising) === LAP_FR; });
  var q = LAP_Q.toLowerCase().trim();
  if (q) list = list.filter(function(r){
    return [r.namaDonatur, r.namaPenerima, r.program, r.fundraising, r.metode].join(' ').toLowerCase().indexOf(q) >= 0;
  });
  var tot = lapSum(list);

  var head = '<div class="lap-pilar-head">'
    + '<div class="lap-pilar-t">' + esc(pilar) + '</div>'
    + '<div class="lap-pilar-ctl">'
    + '<select onchange="setLapFR(this.value)">' + opt + '</select>'
    + '<input placeholder="Cari nama / program..." value="' + esc(LAP_Q) + '" oninput="setLapQ(this.value)">'
    + '</div>'
    + '<div class="lap-pilar-tot"><span>Total tampil</span><b>' + rp(tot) + '</b>'
    + '<em>' + list.length + ' transaksi</em></div>'
    + '</div>';
  return head + lapDetailTable(list, mode);
}
function setLapPilar(enc){
  var k = lapDec(enc);
  LAP_PILAR = (LAP_PILAR === k) ? null : k;
  LAP_FR = 'all'; LAP_Q = '';
  lapRefreshList();
}
function setLapFR(v){ LAP_FR = v; lapRefreshList(); }
function setLapQ(v){ LAP_Q = v || ''; lapRefreshList(); }

/* ---- tabel transaksi ---- */
function lapDetailTable(list, mode){
  var k = LAP_SORT.key, dir = LAP_SORT.dir;
  list = list.slice().sort(function(a,b){
    var va, vb;
    if (k === 'jumlah') { va = Number(a.jumlah)||0; vb = Number(b.jumlah)||0; }
    else if (k === 'tanggal') { va = String(a.tanggal||''); vb = String(b.tanggal||''); }
    else { va = String(a[k]||'').toLowerCase(); vb = String(b[k]||'').toLowerCase(); }
    return va < vb ? -dir : va > vb ? dir : 0;
  });
  function th(key, label, cls){
    var on = (LAP_SORT.key === key);
    return '<th class="' + (cls||'') + ' sortable' + (on?' on':'') + '" onclick="setLapSort(\'' + key + '\')">'
      + label + '<span class="lap-arw">' + (on ? (LAP_SORT.dir>0?'&#9650;':'&#9660;') : '') + '</span></th>';
  }
  var cols = (mode === 'himpun')
    ? [th('tanggal','Tanggal'), th('namaDonatur','Donatur'), th('program','Program'),
       th('fundraising','Fundraising'), th('metode','Metode'), th('jumlah','Jumlah','num')]
    : [th('tanggal','Tanggal'), th('namaPenerima','Penerima'), th('program','Program'),
       th('fundraising','Fundraising'), th('metode','Metode'), th('jumlah','Jumlah','num')];
  var tot = lapSum(list);
  var h = '<div class="lap-table-wrap"><table class="lap-table sub"><thead><tr>' + cols.join('') + '</tr></thead><tbody>';
  if (!list.length) h += '<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">Tidak ada transaksi cocok.</td></tr>';
  list.forEach(function(r){
    h += '<tr><td>' + fdate(r.tanggal) + '</td>'
      + '<td><b>' + esc((mode==='himpun' ? r.namaDonatur : r.namaPenerima) || '-') + '</b></td>'
      + '<td>' + esc(r.program || '-') + '</td>'
      + '<td>' + esc(cleanFR(r.fundraising)) + '</td>'
      + '<td>' + esc(r.metode || '-') + '</td>'
      + '<td class="num strong">' + rp(r.jumlah) + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td colspan="5">Total ' + list.length + ' transaksi</td>'
    + '<td class="num strong">' + rp(tot) + '</td></tr></tfoot></table></div>';
  return h;
}

/* ---- render parsial ---- */
function lapRefreshList(){
  var host = el('lapList');
  if (!host) { renderLaporanShell(); return; }
  host.innerHTML = lapLayananList(lapRows());
}
function lapRefreshAll(){
  var s = el('lapSum'), l = el('lapList');
  if (!s || !l) { renderLaporanShell(); return; }
  var rows = lapRows();
  s.innerHTML = lapSummary(rows, window.__lapMode || 'himpun');
  l.innerHTML = lapLayananList(rows);
}
function setLapSel(enc){
  var name = lapDec(enc);
  LAP_SEL = (LAP_SEL === name) ? null : name;
  LAP_PILAR = null; LAP_FR = 'all'; LAP_Q = '';
  lapRefreshList();
}
function setLapSort(key){
  if (LAP_SORT.key === key) LAP_SORT.dir = -LAP_SORT.dir;
  else LAP_SORT = { key: key, dir: (key==='jumlah'||key==='tanggal') ? -1 : 1 };
  lapRefreshList();
}

/* ---- pemuat tab ---- */
function renderLapRekap(mode){
  window.__lapMode = mode;
  var host = el('lapBody');
  if (!host) return;
  host.innerHTML = '<div class="lap-empty">Memuat data…</div>';
  var api = (mode === 'himpun') ? 'apiListPenghimpunan' : 'apiListPentasyarufan';
  var need = CACHE.layanan ? Promise.resolve(CACHE.layanan) : gas('apiListLayanan')(TOKEN);
  Promise.all([gas(api)(TOKEN), need]).then(function(res){
    var all = res[0] || [];
    CACHE.layanan = res[1] || [];
    if (mode === 'himpun') CACHE.himpun = all; else CACHE.tasyaruf = all;
    window.__lapAll = all;
    var rows = lapRows();
    host.innerHTML = '<div id="lapSum">' + lapSummary(rows, mode) + '</div>'
      + lapFilterBar()
      + '<div id="lapList" class="swap-in">' + lapLayananList(rows) + '</div>';
  }).catch(handleErr);
}

function renderLaporanShell(){
  var tabs=[['himpun','Detail Penghimpunan'],['salur','Detail Pentasyarufan'],
            ['jurnal','Jurnal Penerimaan'],['broadcast','Broadcast WhatsApp']];
  var h='<div class="page-head"><div><h2>Laporan</h2><div class="desc">Rekap per kantor layanan, jurnal, dan broadcast</div></div></div>';
  h+='<div class="lap-tabs">'+tabs.map(function(t){
    return '<button class="lap-tab'+(LAP_TAB===t[0]?' on':'')+'" data-tab="'+t[0]+'" onclick="setLapTab(\''+t[0]+'\')">'+t[1]+'</button>';
  }).join('')+'</div>';
  h+='<div id="lapBody"></div>';
  el('content').innerHTML=h;
  if(LAP_TAB==='himpun')renderLapRekap('himpun');
  else if(LAP_TAB==='salur')renderLapRekap('salur');
  else if(LAP_TAB==='jurnal')renderJurnalForm();
  else renderBroadcastForm();
}
function setLapTab(t){
  LAP_TAB=t;
  var tabs=document.querySelectorAll('.lap-tabs .lap-tab');
  if(!tabs.length){renderLaporanShell();return;}
  tabs.forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab')===t); });
  var body=el('lapBody'); if(body){ body.classList.remove('swap-in'); void body.offsetWidth; body.classList.add('swap-in'); }
  if(t==='himpun')renderLapRekap('himpun');
  else if(t==='salur')renderLapRekap('salur');
  else if(t==='jurnal')renderJurnalForm();
  else renderBroadcastForm();
}
/* Panel seragam untuk tab Jurnal & Broadcast, mengikuti gaya kartu Laporan. */
function lapPanel(title,desc,inner,actions){
  return '<div class="lap-panel">'
    + '<div class="lap-panel-h"><div class="lap-panel-hd">'
    + '<div class="lap-panel-t">'+title+'</div>'
    + (desc?'<div class="lap-panel-d">'+desc+'</div>':'')
    + '</div></div>'
    + '<div class="lap-panel-b">'+inner+'</div>'
    + (actions?'<div class="lap-panel-a">'+actions+'</div>':'')
    + '</div>';
}

function renderJurnalForm(){
  var now=new Date();
  var yopt='';for(var y=now.getFullYear()+1;y>=now.getFullYear()-3;y--)yopt+='<option '+(y===now.getFullYear()?'selected':'')+'>'+y+'</option>';
  var mopt='';for(var m=1;m<=12;m++)mopt+='<option value="'+m+'" '+((m-1)===now.getMonth()?'selected':'')+'>'+BULAN[m]+'</option>';
  var form='<div class="fgrid">'
    + fld(3,'Bulan','<select id="j_bulan">'+mopt+'</select>')
    + fld(3,'Tahun','<select id="j_tahun">'+yopt+'</select>')
    + '</div>';
  var acts='<button class="btn" onclick="loadJurnal()">Lihat Laporan</button>'
    + '<button class="btn btn-primary" onclick="loadJurnalAndDownload()">Unduh Excel</button>';
  el('lapBody').innerHTML = lapPanel('Jurnal Penerimaan',
      'Pilih periode, lalu tampilkan rinciannya atau unduh sebagai Excel (.xlsx) sesuai format standar Pusat.',
      form, acts)
    + '<div id="jurnalPreview" class="lap-result"></div>';
}

function loadJurnal(){
  var m=el('j_bulan').value,y=el('j_tahun').value;
  el('jurnalPreview').innerHTML=BOXES_SPINNER;
  gas('apiJurnalData')(TOKEN,y,m).then(function(d){
    CACHE.jurnal=d;
    renderJurnalPreview(d);
  }).catch(handleErr);
}

function loadJurnalAndDownload(){
  var m=el('j_bulan').value,y=el('j_tahun').value;
  el('jurnalPreview').innerHTML=BOXES_SPINNER;
  gas('apiJurnalData')(TOKEN,y,m).then(function(d){
    CACHE.jurnal=d;
    renderJurnalPreview(d);
    if(d.count>0) exportJurnalXlsx(d);
    else toast('Tidak ada transaksi pada periode ini',true);
  }).catch(handleErr);
}

/* Nominal di jurnal ditulis polos: tanpa "Rp" dan tanpa titik pemisah ribuan,
   supaya bisa langsung disalin ke berkas jurnal tanpa dirapikan lagi. */
function jn(n){ var v = Number(n); return isFinite(v) ? String(Math.round(v)) : ''; }

function renderJurnalPreview(d){
  if(!d.count){el('jurnalPreview').innerHTML='<div class="card empty"><div class="big">🧾</div>Tidak ada penerimaan pada '+esc(d.periode)+'.</div>';return;}
  var h='<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px"><div><h3>'+esc(d.title)+'</h3><div class="muted" style="font-size:13px">'+esc(d.settings.namaLembaga||'')+' • Periode '+esc(d.periode)+' • '+d.count+' transaksi</div></div><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" style="border:1px solid var(--border)" onclick="copyAllJurnal()">📋 Salin Semua</button><button class="btn btn-primary btn-sm" onclick="exportJurnalXlsx(CACHE.jurnal)">⬇ Unduh .xlsx</button></div></div>';
  h+='<div style="overflow:auto"><table><thead><tr><th>Tanggal</th><th>Akun</th><th>Debit</th><th>Kredit</th><th>Keterangan</th></tr></thead><tbody>';
  d.sections.forEach(function(sec, idx){
    h+='<tr style="background:rgba(255,255,255,.03)"><td colspan="5" style="padding:10px 12px"><div style="display:flex;justify-content:space-between;align-items:center;width:100%"><span style="font-weight:700;font-family:var(--font);letter-spacing:.5px">'+esc(sec.title)+'</span><button class="btn btn-ghost btn-xs" onclick="copySectionJurnal('+idx+')" style="padding:2px 6px;font-size:11px;margin:0;border:1px solid var(--border);border-radius:4px;height:24px;line-height:20px;display:flex;align-items:center;gap:4px">📋 Salin Kategori</button></div></td></tr>';
    sec.lines.forEach(function(l){
      h+='<tr><td>'+esc(l.tanggal)+'</td><td>'+esc(l.akun)+'</td><td class="jnum">'+(l.debit!==''?jn(l.debit):'')+'</td><td class="jnum">'+(l.kredit!==''?jn(l.kredit):'')+'</td><td class="muted">'+esc(l.ket)+'</td></tr>';
    });
    h+='<tr><td></td><td style="font-weight:600">Subtotal</td><td colspan="2" class="jnum" style="font-weight:700;color:var(--green)">'+jn(sec.subtotal)+'</td><td></td></tr>';
  });
  h+='<tr><td></td><td style="font-weight:700;font-family:var(--font)">TOTAL PENERIMAAN</td><td colspan="2" class="jnum" style="font-weight:700;color:var(--primary);font-size:15px">'+jn(d.grandTotal)+'</td><td></td></tr>';
  h+='</tbody></table></div></div>';
  el('jurnalPreview').innerHTML=h;
}

function copySectionJurnal(idx) {
  if (!CACHE.jurnal || !CACHE.jurnal.sections || !CACHE.jurnal.sections[idx]) return;
  var sec = CACHE.jurnal.sections[idx];
  
  var lines = [];
  lines.push('Tanggal\tAkun\tDebit\tKredit\tKeterangan');
  
  sec.lines.forEach(function(l) {
    var row = [
      l.tanggal || '',
      l.akun || '',
      l.debit !== '' ? l.debit : '',
      l.kredit !== '' ? l.kredit : '',
      l.ket || ''
    ];
    lines.push(row.join('\t'));
  });
  
  var text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function() {
    toast('Kategori "' + sec.title + '" berhasil disalin ke clipboard');
  }).catch(function(err) {
    toast('Gagal menyalin data', true);
  });
}

function copyAllJurnal() {
  if (!CACHE.jurnal || !CACHE.jurnal.sections) return;
  
  var lines = [];
  lines.push('Kategori\tTanggal\tAkun\tDebit\tKredit\tKeterangan');
  
  CACHE.jurnal.sections.forEach(function(sec) {
    sec.lines.forEach(function(l) {
      var row = [
        sec.title || '',
        l.tanggal || '',
        l.akun || '',
        l.debit !== '' ? l.debit : '',
        l.kredit !== '' ? l.kredit : '',
        l.ket || ''
      ];
      lines.push(row.join('\t'));
    });
  });
  
  var text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function() {
    toast('Seluruh jurnal berhasil disalin ke clipboard');
  }).catch(function(err) {
    toast('Gagal menyalin data', true);
  });
}
function exportJurnalXlsx(d){
  var wb = XLSX.utils.book_new();
  
  function buildSheetData(viaType) {
    var aoa = [];
    aoa.push([]); // Row 0 empty
    
    var count = 0;
    d.sections.forEach(function(sec) {
      // Check via type based on title or via parameter if present
      var isKas = sec.title.indexOf('VIA KAS') >= 0;
      if ((viaType === 'KAS' && !isKas) || (viaType === 'BANK' && isKas)) {
        return;
      }
      
      if (count > 0) {
        aoa.push([]);
        aoa.push([]);
      }
      
      // Section header row
      aoa.push(['', sec.title, '', '', '']);
      
      // Transaction rows
      sec.lines.forEach(function(l) {
        var dateVal = l.tanggal;
        var parts = dateVal.split('/');
        if (parts.length === 3) {
          dateVal = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
        aoa.push([
          dateVal,
          l.akun,
          l.debit === '' ? null : Number(l.debit),
          l.kredit === '' ? null : Number(l.kredit),
          l.ket
        ]);
      });
      count++;
    });
    
    return aoa;
  }
  
  var aoaTunai = buildSheetData('KAS');
  var aoaTransfer = buildSheetData('BANK');
  
  var wsTunai = XLSX.utils.aoa_to_sheet(aoaTunai, { cellDates: true });
  var wsTransfer = XLSX.utils.aoa_to_sheet(aoaTransfer, { cellDates: true });
  
  var cols = [{wch:14}, {wch:32}, {wch:15}, {wch:15}, {wch:38}];
  wsTunai['!cols'] = cols;
  wsTransfer['!cols'] = cols;
  
  function formatSheet(ws) {
    for (var key in ws) {
      if (!ws[key]) continue;
      if (ws[key].t === 'd') ws[key].z = 'dd/mm/yyyy';
      /* angka ditulis polos: tanpa pemisah ribuan dan tanpa simbol mata uang */
      else if (ws[key].t === 'n') ws[key].z = '0';
    }
  }
  formatSheet(wsTunai);
  formatSheet(wsTransfer);
  
  XLSX.utils.book_append_sheet(wb, wsTunai, 'Tunai');
  XLSX.utils.book_append_sheet(wb, wsTransfer, 'Transfer');
  
  XLSX.writeFile(wb, 'Jurnal Penerimaan ' + d.periode + '.xlsx');
  toast('File jurnal diunduh');
}
function renderBroadcastForm(){
  var e=today();var st=new Date();st.setDate(st.getDate()-6);var sStr=st.toISOString().slice(0,10);
  var form='<div class="fgrid">'
    + fld(3,'Dari Tanggal','<input type="date" id="bc_start" value="'+sStr+'">')
    + fld(3,'Sampai Tanggal','<input type="date" id="bc_end" value="'+e+'">')
    + '</div>';
  var acts='<button class="btn btn-primary" onclick="loadBroadcast()">Buat Laporan</button>';
  el('lapBody').innerHTML = lapPanel('Broadcast WhatsApp',
      'Pilih rentang tanggal bebas. Sistem menyusun ringkasan siap kirim ke donatur.',
      form, acts)
    + '<div id="bcResult" class="lap-result"></div>';
}
function loadBroadcast(){var s=el('bc_start').value,e=el('bc_end').value;if(!s||!e){toast('Lengkapi rentang tanggal',true);return;}el('bcResult').innerHTML=BOXES_SPINNER;
  gas('apiBroadcastReport')(TOKEN,s,e).then(function(d){CACHE.bc=d;renderBroadcastResult(d);}).catch(handleErr);}
function buildBroadcastText(d){
  var s = d.settings || {};
  var nm = s.namaLembaga || 'Kantor Lazismu Daerah Bantul';
  var hb = d.himpunBreakdown || { zakat: 0, infakUmum: 0, infakTerikat: 0, amil: 0, dskl: 0 };
  var sb = d.salurBreakdown || { zakat: 0, infak: 0, amil: 0, dskl: 0 };
  var ub = d.umpBreakdown || { zakat: 0, infakTerikat: 0, infakUmum: 0, amil: 0 };
  
  function fmtVal(n, isUmp) {
    if (!n || n <= 0) return isUmp ? '*Rp-*' : '-';
    return '*' + rp(n) + '*';
  }
  
  var L = [];
  L.push('*Bismillahirrahmanirrahim*');
  L.push('');
  L.push('*Laporan Keuangan ' + nm + '*');
  L.push('*' + d.periodeRaw + '*.');
  L.push('');
  L.push('*📥 Penerimaan Dana*');
  L.push('*Zakat*');
  L.push('* Penerimaan Zakat : ' + fmtVal(hb.zakat, true));
  L.push('');
  L.push('*Infak*');
  L.push('* Infak Umum : ' + fmtVal(hb.infakUmum, true));
  if (hb.infakTerikat > 0) {
    L.push('* Infak Terikat : ' + fmtVal(hb.infakTerikat, true));
  }
  if (hb.amil > 0) {
    L.push('* Amil : ' + fmtVal(hb.amil, true));
  }
  if (hb.dskl > 0) {
    L.push('* DSKL : ' + fmtVal(hb.dskl, true));
  }
  L.push('*Total Penerimaan : ' + rp(d.totalHimpun) + '*');
  L.push('');
  L.push('*📤 Penyaluran Dana*');
  L.push('1. Dana Zakat : ' + fmtVal(sb.zakat, false));
  L.push('2. Dana Infak : ' + fmtVal(sb.infak, false));
  L.push('3. Dana Amil : ' + fmtVal(sb.amil, false));
  if (sb.dskl > 0) {
    L.push('Dana DSKL : ' + fmtVal(sb.dskl, false));
  }
  
  var totalUmp = ub.zakat + ub.infakTerikat + ub.infakUmum + ub.amil;
  L.push('*4. Uang Muka Program*');
  L.push('Zakat : ' + fmtVal(ub.zakat, true));
  L.push('Infak Terikat : ' + fmtVal(ub.infakTerikat, true));
  L.push('Infak Umum : ' + fmtVal(ub.infakUmum, true));
  L.push('Amil : ' + fmtVal(ub.amil, true));
  L.push('*Total Uang Muka Program : ' + (totalUmp > 0 ? rp(totalUmp) : 'Rp-') + '*');
  
  return L.join('\n');
}
function renderBroadcastResult(d){var txt=buildBroadcastText(d);
  var h='<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Teks Broadcast (bisa diedit)</h3><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" onclick="copyBC()">📋 Salin</button><button class="btn btn-primary btn-sm" onclick="waBC()">📲 Kirim via WhatsApp</button></div></div>';
  h+='<textarea id="bcText" style="min-height:330px;font-family:var(--font-body);line-height:1.6">'+esc(txt)+'</textarea>';
  h+='<div class="muted" style="font-size:12px;margin-top:8px">Tips: tanda * membuat teks tebal di WhatsApp. Klik "Kirim via WhatsApp" untuk broadcast ke kontak/grup.</div></div>';
  el('bcResult').innerHTML=h;
}
function copyBC(){var t=el('bcText');t.select();document.execCommand('copy');toast('Teks disalin');}
function waBC(){var t=el('bcText').value;window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank');}

/* ============ USERS ============ */
function viewUsers(){gas('apiListUsers')(TOKEN).then(function(rows){CACHE.users=rows;renderUsers(rows);}).catch(handleErr);}
function renderUsers(rows){var add=canDo('users','create')?'<button class="btn btn-primary" onclick="formUser()">+ Tambah User</button>':'';
  var h='<div class="page-head"><div><h1>Manajemen User</h1><div class="desc">Kelola akun & hak akses (permission) pengguna</div></div>'+add+'</div>';
  h+='<div class="table-wrap"><div style="overflow:auto"><table><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Hak Akses</th><th></th></tr></thead><tbody>';
  rows.forEach(function(u){var act=String(u.aktif)==='true'||u.aktif===true;var pc=u.role==='superadmin'?'Semua akses':countPerm(u.permissions)+' izin';
    h+='<tr><td><b>'+esc(u.nama)+'</b></td><td>'+esc(u.username)+'</td><td>'+(u.role==='superadmin'?'<span class="badge purple">Superadmin</span>':'<span class="badge blue">'+esc(u.role||'staff')+'</span>')+'</td><td><span class="badge '+(act?'green':'amber')+'">'+(act?'Aktif':'Nonaktif')+'</span></td><td class="muted">'+pc+'</td><td><div class="actions-cell">'+(canDo('users','edit')?'<button class="icon-btn" onclick="formUser(\''+u.id+'\')">✎</button>':'')+(canDo('users','delete')?'<button class="icon-btn" onclick="delUser(\''+u.id+'\')">🗑</button>':'')+'</div></td></tr>';});
  h+='</tbody></table></div></div>';el('content').innerHTML=h;}
function countPerm(p){var n=0;p=p||{};Object.keys(p).forEach(function(m){Object.keys(p[m]||{}).forEach(function(a){if(p[m][a])n++;});});return n;}
function permGrid(p){p=p||{};var h='<div style="overflow:auto"><table class="perm-table"><thead><tr><th>Modul</th>'+PERM_META.actions.map(function(a){return '<th>'+a+'</th>';}).join('')+'</tr></thead><tbody>';PERM_META.modules.forEach(function(m){h+='<tr><td>'+m+'</td>'+PERM_META.actions.map(function(a){var ck=(p[m]&&p[m][a])?'checked':'';return '<td><input type="checkbox" style="width:auto" data-mod="'+m+'" data-act="'+a+'" '+ck+'></td>';}).join('')+'</tr>';});h+='</tbody></table></div>';return h;}
function formUser(id){var u=id?CACHE.users.find(function(x){return x.id===id;}):{role:'staff',aktif:true,permissions:{}};
  var b='<div class="row"><div class="field"><label>Nama Lengkap *</label><input id="u_nama" value="'+esc(u.nama||'')+'"></div><div class="field"><label>Username *</label><input id="u_username" value="'+esc(u.username||'')+'"></div></div><div class="row"><div class="field"><label>Password '+(id?'(kosongkan jika tetap)':'*')+'</label><input type="password" id="u_password" placeholder="'+(id?'••••••':'min 6 karakter')+'"></div><div class="field"><label>Role</label>'+selOpt('u_role',['staff','admin','superadmin'],u.role)+'</div></div><div class="field"><label>Status Akun</label>'+selOpt('u_aktif',['true','false'],String(u.aktif===true||String(u.aktif)==='true'))+'</div><div class="divider"></div><label style="font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:8px;display:block">HAK AKSES (Permission) — diabaikan jika role Superadmin</label>'+permGrid(u.permissions);
  openModal(id?'Edit User':'Tambah User',b,'<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveUser(\''+(id||'')+'\')">Simpan</button>');}
function saveUser(id){var perm={};document.querySelectorAll('.perm-table input[type=checkbox]').forEach(function(c){var m=c.dataset.mod,a=c.dataset.act;perm[m]=perm[m]||{};perm[m][a]=c.checked;});var d={nama:el('u_nama').value,username:el('u_username').value.trim(),role:el('u_role').value,aktif:el('u_aktif').value,permissions:perm};var pw=el('u_password').value;if(pw)d.password=pw;if(id)d.id=id;if(!d.nama||!d.username){toast('Nama & username wajib',true);return;}if(!id&&!pw){toast('Password wajib untuk user baru',true);return;}gas('apiSaveUser')(TOKEN,d).then(function(){closeModal();toast('User tersimpan');viewUsers();}).catch(handleErr);}
function delUser(id){uiConfirm('Hapus user ini?').then(function(__ok){if(!__ok)return;gas('apiDeleteUser')(TOKEN,id).then(function(){toast('User dihapus');viewUsers();}).catch(handleErr);});}

/* ============ SETTINGS ============ */
function viewSettings(){gas('apiGetSettings')(TOKEN).then(function(s){SETTINGS=s;renderSettings(s);}).catch(handleErr);}
var SET_TAB='lembaga';
function renderSettings(s){
  var h='<div class="page-head"><div><h2>Pengaturan</h2><div class="desc">Identitas lembaga, rekening, unit layanan & tampilan</div></div></div>';
  var tabSet=['lembaga|Identitas Lembaga','rekening|No. Rekening','layanan|KLL / ULL','tampilan|Tampilan'];
  if(canDo('settings','edit')) tabSet.push('perawatan|Perawatan Data');
  h+='<div class="lap-tabs">'+tabSet.map(function(t){var p=t.split('|');return '<button class="lap-tab'+(SET_TAB===p[0]?' on':'')+'" data-tab="'+p[0]+'" onclick="setTab(\''+p[0]+'\')">'+p[1]+'</button>';}).join('')+'</div><div id="setBody"></div>';
  el('content').innerHTML=h;renderSetTab(s);
}
function setTab(t){
  SET_TAB=t;
  var tabs=document.querySelectorAll('.lap-tabs .lap-tab');
  if(!tabs.length){renderSettings(SETTINGS);return;}
  tabs.forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab')===t); });
  var body=el('setBody'); if(body){ body.classList.remove('swap-in'); void body.offsetWidth; body.classList.add('swap-in'); }
  renderSetTab(SETTINGS);
}
function renderSetTab(s){var host=el('setBody');if(!host)return;
  if(SET_TAB==='rekening'){host.innerHTML='<div id="setRekBody"></div>';window.REK_HOST='setRekBody';window.LAY_HOST='';viewRekening();}
  else if(SET_TAB==='layanan'){host.innerHTML='<div id="setLayBody"></div>';window.LAY_HOST='setLayBody';window.REK_HOST='';viewLayanan();}
  else if(SET_TAB==='perawatan'){window.REK_HOST='';window.LAY_HOST='';host.innerHTML=perawatanHTML();}
  else {
    window.REK_HOST='';window.LAY_HOST='';
    host.innerHTML=(SET_TAB==='tampilan')?tampilanHTML(s):lembagaHTML(s);
    if(SET_TAB!=='tampilan' && typeof salamPreview==='function') salamPreview();
  }
}
function lembagaHTML(s){
  var logo = s.logoData || '';
  var logoBox = '<div class="upload-box" onclick="el(\'logoFile\').click()">'
    + (logo ? '<img class="logo-preview" src="' + logo + '">'
            : '<div class="set-logo-ph">Belum ada logo</div>')
    + '<div class="muted" style="font-size:12px;margin-top:8px">Klik untuk unggah (PNG / JPG)</div></div>'
    + '<input type="file" id="logoFile" accept="image/*" style="display:none" onchange="onLogoUpload(event)">'
    + (logo ? '<button class="btn btn-sm btn-ghost" style="width:100%;margin-top:10px" onclick="removeLogo()">Hapus Logo</button>' : '');

  var ident = '<div class="fgrid">'
    + fld(6,'Nama Lembaga','<input id="s_namaLembaga" value="' + esc(s.namaLembaga||'') + '">')
    + fld(6,'Singkatan','<input id="s_singkatan" value="' + esc(s.singkatan||'') + '">')
    + fld(12,'Alamat','<input id="s_alamat" value="' + esc(s.alamat||'') + '">')
    + fld(4,'Telepon','<input id="s_telepon" value="' + esc(s.telepon||'') + '">')
    + fld(4,'Email','<input id="s_email" value="' + esc(s.email||'') + '">')
    + fld(4,'Website','<input id="s_website" value="' + esc(s.website||'') + '">')
    + '</div>';

  var salam = '<div class="fgrid">'
    + fld(6,'Judul Sambutan','<input id="s_salamJudul" value="' + esc(s.salamJudul || SALAM_DEFAULT) + '" oninput="salamPreview()">')
    + fld(6,'Baris Kedua','<input id="s_salamSub" value="' + esc(s.salamSub || SALAM_SUB_DEFAULT) + '" oninput="salamPreview()">')
    + '<div class="fld" data-col="12"><label>Pratinjau</label>'
    + '<div class="salam-prev"><div class="salam-prev-t" id="salamPrevT"></div>'
    + '<div class="salam-prev-s" id="salamPrevS"></div></div></div>'
    + '<div class="fld" data-col="12"><div class="salam-tags">'
    + ['{waktu}','{nama}','{namaLengkap}','{lembaga}','{tanggal}'].map(function(t){
        return '<button type="button" class="salam-tag" onclick="salamInsert(\'' + t + '\')">' + t + '</button>';
      }).join('')
    + '<span class="salam-hint">Klik untuk menyisipkan ke Judul Sambutan</span></div></div>'
    + '</div>';

  return '<div class="set-grid">'
    + '<div class="set-side">' + setPanel('Logo Lembaga','Tampil di sidebar, kwitansi, dan dokumen cetak', logoBox) + '</div>'
    + '<div class="set-wide">'
      + setPanel('Identitas','Dipakai pada kop kwitansi dan bukti penyaluran', ident,
          canDo('settings','edit') ? '<button class="btn btn-primary" onclick="saveSettings()">Simpan Identitas</button>' : '')
      + setPanel('Kalimat Sambutan','Tampil di bagian atas dashboard', salam,
          canDo('settings','edit') ? '<button class="btn btn-ghost" onclick="salamReset()">Kembalikan Bawaan</button>'
            + '<button class="btn btn-primary" onclick="saveSalam()">Simpan Sambutan</button>' : '')
    + '</div></div>';
}

function salamPreview(){
  var t = el('s_salamJudul'), u = el('s_salamSub');
  var pt = el('salamPrevT'), ps = el('salamPrevS');
  if (pt && t) pt.textContent = salamRender(t.value);
  if (ps && u) ps.textContent = salamRender(u.value);
}
function salamInsert(tag){
  var t = el('s_salamJudul'); if (!t) return;
  var a = t.selectionStart, b = t.selectionEnd;
  t.value = t.value.slice(0, a) + tag + t.value.slice(b);
  t.focus(); t.setSelectionRange(a + tag.length, a + tag.length);
  salamPreview();
}
function salamReset(){
  var t = el('s_salamJudul'), u = el('s_salamSub');
  if (t) t.value = SALAM_DEFAULT;
  if (u) u.value = SALAM_SUB_DEFAULT;
  salamPreview();
}
function saveSalam(){
  var d = { salamJudul: el('s_salamJudul') ? el('s_salamJudul').value : SALAM_DEFAULT,
            salamSub:   el('s_salamSub')   ? el('s_salamSub').value   : SALAM_SUB_DEFAULT };
  gas('apiSaveSettings')(TOKEN, d).then(function(res){
    SETTINGS = res; toast('Kalimat sambutan tersimpan');
  }).catch(handleErr);
}

/* panel pengaturan — bentuknya sama dengan panel di halaman Laporan */
function setPanel(title,desc,inner,actions){
  return '<div class="lap-panel set-panel">'
    + '<div class="lap-panel-h"><div class="lap-panel-t">'+title+'</div>'
    + (desc?'<div class="lap-panel-d">'+desc+'</div>':'')+'</div>'
    + '<div class="lap-panel-b">'+inner+'</div>'
    + (actions?'<div class="lap-panel-a">'+actions+'</div>':'')
    + '</div>';
}

function tampilanHTML(s){
  var th = localStorage.getItem('laz_theme') || s.theme || 'light';
  var lay = getDashLayout();

  var themeBox = '<div class="set-theme">'
    + '<button class="set-theme-opt' + (th==='light'?' on':'') + '" onclick="setTheme(\'light\')">'
    + '<span class="set-theme-prev light"></span><span class="set-theme-t">Terang</span>'
    + '<span class="set-theme-d">Latar terang, aksen coral</span></button>'
    + '<button class="set-theme-opt' + (th==='dark'?' on':'') + '" onclick="setTheme(\'dark\')">'
    + '<span class="set-theme-prev dark"></span><span class="set-theme-t">Gelap</span>'
    + '<span class="set-theme-d">Nyaman untuk malam hari</span></button>'
    + '</div>';

  /* Label widget diambil dari daftar WIDGETS supaya tidak ada yang tampil
     "undefined" ketika muncul widget yang belum terdaftar di peta lama. */
  var rows = lay.order.map(function(k){
    var w = (typeof WIDGETS !== 'undefined' && WIDGETS[k]) ? WIDGETS[k].t : k;
    return '<label class="set-switch"><span class="set-switch-t">' + esc(w) + '</span>'
      + '<span class="switch"><input type="checkbox" data-w="' + k + '" '
      + (lay.vis[k] !== false ? 'checked' : '') + ' onchange="saveDashLayout()"><span class="slider"></span></span></label>';
  }).join('');

  var h = '<div class="set-grid">'
    + '<div class="set-side">'
      + setPanel('Tema Tampilan','Berlaku untuk perangkat ini saja', themeBox)
      + (canDo('dashboard','view')
          ? setPanel('Link Publik','Bagikan ringkasan tanpa perlu login',
              '<button class="btn" style="width:100%" onclick="openPublicLink()">Kelola Link Publik</button>')
          : '')
    + '</div>'
    + '<div class="set-wide">'
      + setPanel('Widget Dashboard','Pilih kartu yang tampil di halaman dashboard','<div class="set-switch-list">' + rows + '</div>')
    + '</div></div>';
  return h;
}

function setTheme(t){applyTheme(t);applyBranding();if(canDo('settings','edit'))gas('apiSaveSettings')(TOKEN,{theme:t}).then(function(s){SETTINGS=s;}).catch(function(){});renderSetTab(SETTINGS);toast('Tema: '+(t==='dark'?'Gelap':'Terang'));}
function onLogoUpload(e){var f=e.target.files[0];if(!f)return;resizeImg(f,240,function(data){gas('apiSaveSettings')(TOKEN,{logoData:data}).then(function(s){SETTINGS=s;applyBranding();renderSetTab(s);toast('Logo tersimpan');}).catch(handleErr);});}
function removeLogo(){gas('apiSaveSettings')(TOKEN,{logoData:''}).then(function(s){SETTINGS=s;applyBranding();renderSetTab(s);toast('Logo dihapus');}).catch(handleErr);}
function saveDashLayout(){var def=getDashLayout();var vis={};document.querySelectorAll('[data-w]').forEach(function(c){vis[c.getAttribute('data-w')]=c.checked;});var obj={order:def.order,vis:vis};localStorage.setItem('laz_dashlayout',JSON.stringify(obj));if(canDo('settings','edit'))gas('apiSaveSettings')(TOKEN,{dashLayout:JSON.stringify(obj)}).then(function(s){SETTINGS=s;}).catch(function(){});toast('Layout disimpan');}
function saveSettings(){var d={};['namaLembaga','singkatan','alamat','telepon','email','website','salamJudul','salamSub'].forEach(function(k){var e=el('s_'+k);if(e)d[k]=e.value;});gas('apiSaveSettings')(TOKEN,d).then(function(s){SETTINGS=s;applyBranding();toast('Pengaturan disimpan');}).catch(handleErr);}

/* ============ SHARED ============ */
/* ============ HELPER FORM v8 (seksi, grid, input nominal) ============ */
function parseRupiah(v){ return Number(String(v==null?'':v).replace(/[^\d]/g,'')) || 0; }
function formatRibuan(v){
  var n = String(v==null?'':v).replace(/[^\d]/g,'');
  if(!n) return '';
  return n.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
/* Bungkus satu kelompok field jadi seksi bernomor. */
function fsec(no,title,desc,inner){
  // v8-compact: judul & deskripsi seksi dihilangkan agar seluruh form muat
  // dalam satu layar; pemisahnya cukup garis tipis antar kelompok.
  return '<section class="fsec"><div class="fgrid">'+inner+'</div></section>';
}
/* Satu field. col = lebar dalam 12 kolom. */
function fld(col,label,control,opt){
  opt = opt || {};
  // satu atribut class saja — versi sebelumnya menulis class dua kali,
  // dan browser memakai yang pertama sehingga opt.cls selalu terabaikan
  return '<div class="fld'+(opt.cls?' '+opt.cls:'')+'"'
    + (opt.id?' id="'+opt.id+'"':'')
    + ' data-col="'+col+'"'
    + (opt.style?' style="'+opt.style+'"':'')
    + '><label'+(opt.for?' for="'+opt.for+'"':'')+'>'+label+'</label>'+control+'</div>';
}
/* Input nominal: prefix Rp, pemisah ribuan otomatis, pintasan nominal, terbilang. */
var QUICK_AMOUNTS=[[50000,'50rb'],[100000,'100rb'],[500000,'500rb'],[1000000,'1jt']];
function moneyField(id,val,label){
  var chips = QUICK_AMOUNTS.map(function(a){
    return '<button type="button" class="qchip" onclick="addMoney(\''+id+'\','+a[0]+')">+'+a[1]+'</button>';
  }).join('');
  return '<div class="fld money-fld" data-col="4">'
    + '<label for="'+id+'">'+label+'</label>'
    + '<div class="money-box"><span class="money-cur">Rp</span>'
    + '<input id="'+id+'" class="money-input" inputmode="numeric" autocomplete="off" placeholder="0" value="'+formatRibuan(val||'')+'">'
    + '<button type="button" class="money-clear" title="Kosongkan" onclick="setMoney(\''+id+'\',0)">&times;</button></div>'
    + '<div class="money-foot"><div class="qchips">'+chips+'</div>'
    + '<div class="money-words" id="'+id+'_words"></div></div></div>';
}
function updateMoneyWords(id){
  var inp=el(id), out=el(id+'_words'); if(!inp||!out) return;
  var n=parseRupiah(inp.value);
  out.textContent = n>0 ? (terbilang(n)+' rupiah') : '';
  out.classList.toggle('on', n>0);
}
function setMoney(id,n){
  var inp=el(id); if(!inp) return;
  inp.value = n>0 ? formatRibuan(n) : '';
  updateMoneyWords(id);
  inp.focus();
}
function addMoney(id,n){
  var inp=el(id); if(!inp) return;
  setMoney(id, parseRupiah(inp.value) + n);
}
function bindMoney(id){
  var inp=el(id); if(!inp) return;
  inp.addEventListener('input',function(){
    var atEnd = this.selectionStart === this.value.length;
    var v = formatRibuan(this.value);
    this.value = v;
    if(atEnd){ try{ this.setSelectionRange(v.length,v.length); }catch(e){} }
    updateMoneyWords(id);
  });
  updateMoneyWords(id);
}
/* Tandai field wajib yang kosong, langsung di tempatnya. */
function clearFieldErrors(hostSel){
  document.querySelectorAll((hostSel||'')+' .fld.err').forEach(function(n){n.classList.remove('err');});
}
function markFieldError(inputId,msg){
  var inp=el(inputId); if(!inp) return;
  var box=inp.closest('.fld'); if(!box) return;
  box.classList.add('err');
  var m=box.querySelector('.fld-msg');
  if(!m){ m=document.createElement('div'); m.className='fld-msg'; box.appendChild(m); }
  m.textContent=msg||'Wajib diisi';
  if(!window.__errScrolled){ window.__errScrolled=true; inp.focus(); box.scrollIntoView({block:'center',behavior:'smooth'});
    setTimeout(function(){window.__errScrolled=false;},600); }
}
/* Ctrl+Enter menyimpan form yang sedang terbuka. */
document.addEventListener('keydown',function(e){
  if(!(e.ctrlKey||e.metaKey) || e.key!=='Enter') return;
  var host=document.querySelector('.fform'); if(!host) return;
  var btn=document.querySelector('.form-actions .btn-primary');
  if(btn){ e.preventDefault(); btn.click(); }
});
function selOpt(id,opts,val,onchange){return '<select id="'+id+'"'+(onchange?' onchange="'+onchange+'"':'')+'>'+opts.map(function(o){return '<option value="'+esc(o)+'" '+(String(val)===String(o)?'selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';}
function filterTable(q,tid){q=(q||'').toLowerCase();document.querySelectorAll('#'+tid+' tbody tr').forEach(function(r){r.style.display=r.textContent.toLowerCase().indexOf(q)>=0?'':'none';});}
function applyFilters(tid) {
  var q = el(tid + '_search') ? el(tid + '_search').value.toLowerCase() : '';
  var dateVal = el(tid + '_filter_date') ? el(tid + '_filter_date').value : '';
  var typeVal = el(tid + '_filter_type') ? el(tid + '_filter_type').value : '';
  var methodVal = el(tid + '_filter_method') ? el(tid + '_filter_method').value : '';
  var frVal = el(tid + '_filter_fr') ? el(tid + '_filter_fr').value.toLowerCase() : '';
  
  var rows = document.querySelectorAll('#' + tid + ' tbody tr');
  rows.forEach(function(row) {
    if (row.cells.length < 2) return;
    var textContent = row.textContent.toLowerCase();
    var rowDate = row.getAttribute('data-tanggal') || '';
    var rowJenis = row.getAttribute('data-jenis') || '';
    var rowMetode = row.getAttribute('data-metode') || '';
    var rowFr = row.getAttribute('data-fr') || '';
    
    var matchSearch = !q || textContent.indexOf(q) >= 0;
    var matchDate = !dateVal || rowDate === dateVal;
    var matchType = !typeVal || rowJenis === typeVal;
    var matchMethod = !methodVal || rowMetode === methodVal;
    var matchFr = !frVal || rowFr.toLowerCase().indexOf(frVal) >= 0;
    
    if (matchSearch && matchDate && matchType && matchMethod && matchFr) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}
function openPassword(){openModal('Ubah Password','<div class="field"><label>Password Lama</label><input type="password" id="p_old"></div><div class="field"><label>Password Baru</label><input type="password" id="p_new"></div><div class="field"><label>Konfirmasi Password Baru</label><input type="password" id="p_new2"></div>','<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="savePassword()">Simpan</button>');}
function savePassword(){var o=el('p_old').value,n=el('p_new').value,n2=el('p_new2').value;if(n.length<6){toast('Password baru minimal 6 karakter',true);return;}if(n!==n2){toast('Konfirmasi tidak cocok',true);return;}gas('apiChangeMyPassword')(TOKEN,o,n).then(function(){closeModal();toast('Password diubah');}).catch(handleErr);}


/* ====== v4: loader, modal konfirmasi, animasi transisi ====== */
function __barEl(){ var b=document.getElementById('topbar-loader'); if(!b){ b=document.createElement('div'); b.id='topbar-loader'; document.body.appendChild(b);} return b; }
var __pending=0;
function __barShow(){ __pending++; __barEl().classList.add('active'); }
function __barHide(){ __pending--; if(__pending<=0){ __pending=0; var b=__barEl(); b.style.width='100%'; setTimeout(function(){ b.classList.remove('active'); b.style.width=''; },250);} }

function confirmDialog(opts){ opts=opts||{}; return new Promise(function(resolve){
  var ov=document.createElement('div'); ov.className='cd-overlay';
  var dg=opts.danger?' danger':'';
  ov.innerHTML='<div class="cd-card'+dg+'" role="dialog" aria-modal="true"><div class="cd-icon">'+(opts.icon||(opts.danger?'⚠️':'❓'))+'</div><div class="cd-title">'+(opts.title||'Konfirmasi')+'</div><div class="cd-msg">'+(opts.message||'')+'</div><div class="cd-actions"><button class="cd-cancel"></button><button class="cd-ok"></button></div></div>';
  document.body.appendChild(ov);
  var card=ov.querySelector('.cd-card');
  ov.querySelector('.cd-cancel').textContent=opts.cancelText||'Batal';
  if(opts.cancelText==='') ov.querySelector('.cd-cancel').style.display='none';
  ov.querySelector('.cd-ok').textContent=opts.okText||'OK';
  function close(val){ card.classList.add('leaving'); ov.style.animation='cdFade .18s reverse forwards'; setTimeout(function(){ try{ov.remove();}catch(e){} resolve(val); },170); }
  ov.querySelector('.cd-ok').onclick=function(){ close(true); };
  ov.querySelector('.cd-cancel').onclick=function(){ close(false); };
  ov.addEventListener('mousedown',function(e){ if(e.target===ov) close(false); });
  function onKey(e){ if(e.key==='Escape'){ document.removeEventListener('keydown',onKey); close(false);} else if(e.key==='Enter'){ document.removeEventListener('keydown',onKey); close(true);} }
  document.addEventListener('keydown',onKey);
  setTimeout(function(){ try{ov.querySelector('.cd-ok').focus();}catch(e){} },60);
}); }
function uiConfirm(msg){ return confirmDialog({title:'Konfirmasi Hapus',message:msg,okText:'Hapus',cancelText:'Batal',danger:true}); }
function uiAlert(msg,title){ return confirmDialog({title:title||'Berhasil',message:msg,okText:'OK',cancelText:'',danger:false,icon:'✅'}); }
/* v8: versi lama memantau elemen #view yang tidak pernah ada di halaman ini,
   sehingga setTimeout-nya berulang tiap 150ms selamanya tanpa hasil. Sekarang
   memantau #content yang benar: begitu isinya diganti oleh salah satu fungsi
   view (sinkron maupun setelah data API tiba), animasi masuk dijalankan.
   Inilah yang membuat perpindahan menu terasa menyatu — sebelumnya animasi
   dijalankan pada konten LAMA, lalu konten baru muncul mendadak tanpa animasi. */
(function(){
  var tries=0;
  function init(){
    var c=document.getElementById('content');
    if(!c){ if(++tries>60) return; setTimeout(init,200); return; }
    /* Animasi masuk hanya untuk PERPINDAHAN MENU. Sebelumnya observer ini
       menyalakan animasi setiap kali isi #content berubah — termasuk saat
       membuka dropdown, mengurutkan tabel, atau berpindah tab — sehingga
       seluruh layar berkedip seolah halaman dimuat ulang. */
    var obs=new MutationObserver(function(){
      if(window.DASH_EDIT) return;
      if(!window.__viewAnim) return;         // bukan perpindahan menu -> diam saja
      window.__viewAnim = false;
      c.classList.remove('view-leaving','view-anim','view-enter');
      void c.offsetWidth;
      c.classList.add('view-anim');
    });
    obs.observe(c,{childList:true});
  }
  init();
})();

/* ============ DEVICE DETECT + INTERACTIVE FX ============ */
function applyDeviceClass(){var w=window.innerWidth;var b=document.body;b.classList.toggle('is-mobile',w<760);b.classList.toggle('is-tablet',w>=760&&w<1100);b.classList.toggle('is-desktop',w>=1100);var coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;b.classList.toggle('is-touch',!!coarse);}
window.addEventListener('resize',applyDeviceClass);
function initBgFx(){
  var cv=document.getElementById('bgfx');if(!cv)return;var ctx=cv.getContext('2d');var W,H,DPR;
  var coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
  var N=coarse?14:34;var pts=[];var mouse={x:-999,y:-999};
  function resize(){DPR=Math.min(window.devicePixelRatio||1,2);W=cv.width=innerWidth*DPR;H=cv.height=innerHeight*DPR;cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';}
  resize();window.addEventListener('resize',resize);
  for(var i=0;i<N;i++)pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25*DPR,vy:(Math.random()-.5)*.25*DPR,r:(Math.random()*2+1)*DPR});
  window.addEventListener('mousemove',function(e){mouse.x=e.clientX*DPR;mouse.y=e.clientY*DPR;});
  window.addEventListener('mouseout',function(){mouse.x=-999;mouse.y=-999;});
  function accent(){return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#ea6a1e';}
  function loop(){
    ctx.clearRect(0,0,W,H);var col=accent();var link=120*DPR;
    for(var i=0;i<pts.length;i++){var p=pts[i];
      var dx=mouse.x-p.x,dy=mouse.y-p.y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<160*DPR&&d>0.1){p.vx+=dx/d*0.02;p.vy+=dy/d*0.02;}
      p.vx*=0.96;p.vy*=0.96;p.x+=p.vx;p.y+=p.vy;
      if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
      p.x=Math.max(0,Math.min(W,p.x));p.y=Math.max(0,Math.min(H,p.y));
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fillStyle=col;ctx.globalAlpha=.35;ctx.fill();
      for(var j=i+1;j<pts.length;j++){var q=pts[j];var ddx=p.x-q.x,ddy=p.y-q.y,dd=Math.sqrt(ddx*ddx+ddy*ddy);if(dd<link){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=col;ctx.globalAlpha=.12*(1-dd/link);ctx.lineWidth=DPR;ctx.stroke();}}
    }
    ctx.globalAlpha=1;requestAnimationFrame(loop);
  }
  loop();
}
function initRipple(){
  document.addEventListener('click',function(e){
    var t=e.target.closest('button,.tn-item,.kpi-card,.card.clickable,.nav-item,.w-btn');if(!t)return;
    var rect=t.getBoundingClientRect();var rp=document.createElement('span');rp.className='ripple';
    var sz=Math.max(rect.width,rect.height);rp.style.width=rp.style.height=sz+'px';
    rp.style.left=(e.clientX-rect.left-sz/2)+'px';rp.style.top=(e.clientY-rect.top-sz/2)+'px';
    var pos=getComputedStyle(t).position;if(pos==='static')t.style.position='relative';
    t.appendChild(rp);setTimeout(function(){rp.remove();},650);
  },true);
}
window.addEventListener('load',function(){applyDeviceClass();try{initBgFx();}catch(e){}try{initRipple();}catch(e){}});

/* ============================================================
   DASHBOARD v6 + ANTIGRAVITY BACKGROUND (overrides above)
   ============================================================ */
/* v8: efek partikel canvas DIMATIKAN.
   Versi lama menjalankan loop requestAnimationFrame selamanya: 46 partikel
   digambar ulang tiap frame se-layar penuh dengan ctx.shadowBlur (operasi
   canvas paling mahal), plus listener mousemove yang memaksa repaint.
   Itu membakar CPU/GPU terus-menerus dan jadi penyebab utama UI terasa berat.
   Latar sekarang murni CSS (gradient fixed + pola titik) — biaya render nol. */
function initBgFx(){
  var c=document.getElementById('bgfx');
  if(c && c.parentNode) c.parentNode.removeChild(c);
}

/* ===== SVG ICON LIBRARY (Minimalist Vector Icons) ===== */
var SVG_ICONS = {
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
  sliders: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',
  arrowUp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>',
  arrowDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>',
  wallet: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"></rect><path d="M16 12h.01"></path><path d="M2 10h20"></path></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  target: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  grip: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1.2" fill="currentColor"></circle><circle cx="9" cy="12" r="1.2" fill="currentColor"></circle><circle cx="9" cy="19" r="1.2" fill="currentColor"></circle><circle cx="15" cy="5" r="1.2" fill="currentColor"></circle><circle cx="15" cy="12" r="1.2" fill="currentColor"></circle><circle cx="15" cy="19" r="1.2" fill="currentColor"></circle></svg>',
  resize: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>'
};

/* ===== DASHBOARD v7 RENDER (Tremor / Stripe Style) ===== */
var WIDGETS={
  rekening:{t:'Tunai & Non Tunai',dot:'#0ea5e9'},
  tren:{t:'Tren Arus Dana',dot:'#ea6a1e'},
  jenis:{t:'Komposisi Jenis Dana',dot:'#f7931e'},
  pilar:{t:'Pilar Program',dot:'#10b981'},
  bank:{t:'Bank & Kas',dot:'#f43f5e'},
  ashnaf:{t:'Penyaluran Berdasarkan Ashnaf',dot:'#8b5cf6'},
  program:{t:'Sebaran Dana',dot:'#3b82f6'},
  fundraising:{t:'Capaian Fundraising',dot:'#ec4899'},
  activity:{t:'Aktivitas Transaksi Terakhir',dot:'#059669'},
  rhimpun:{t:'Penghimpunan Terbaru',dot:'#10b981'},
  rtasyaruf:{t:'Pentasyarufan Terbaru',dot:'#ec4899'},
  rapb:{t:'Target & Realisasi RAPB 2026',dot:'#ea6a1e'}
};
function dashGreeting(){var h=new Date().getHours();return h<11?'Selamat pagi':h<15?'Selamat siang':h<19?'Selamat sore':'Selamat malam';}

/* ===== KALIMAT SAMBUTAN DASHBOARD (bisa diatur di Pengaturan) =====
   Placeholder yang dikenali:
     {waktu}    -> Selamat pagi / siang / sore / malam
     {nama}     -> nama depan pengguna yang login
     {namaLengkap}
     {lembaga}  -> nama lembaga
     {tanggal}  -> tanggal hari ini */
var SALAM_DEFAULT = '{waktu}, {nama}';
var SALAM_SUB_DEFAULT = '{tanggal} • Ringkasan amanah ZISWAF lembaga';

function salamRender(tpl, opt){
  opt = opt || {};
  var nmFull = opt.nama || (ME && ME.nama) || '';
  var nm = String(nmFull).split(' ')[0] || '';
  var lembaga = opt.lembaga || (SETTINGS && SETTINGS.namaLembaga) || '';
  var tgl = opt.tanggal || fdate(new Date());
  return String(tpl == null ? '' : tpl)
    .replace(/\{waktu\}/gi, dashGreeting())
    .replace(/\{namaLengkap\}/gi, nmFull)
    .replace(/\{nama\}/gi, nm)
    .replace(/\{lembaga\}/gi, lembaga)
    .replace(/\{tanggal\}/gi, tgl);
}
function salamText(){ return salamRender((SETTINGS && SETTINGS.salamJudul) || SALAM_DEFAULT); }
function salamSub(tglStr){
  return salamRender((SETTINGS && SETTINGS.salamSub) || SALAM_SUB_DEFAULT, { tanggal: tglStr });
}
function avColor(s){var p=['#ea6a1e','#f7931e','#8b5cf6','#3b82f6','#10b981','#ec4899','#0ea5e9','#f59e0b'];var n=0;s=s||'?';for(var i=0;i<s.length;i++)n+=s.charCodeAt(i);return p[n%p.length];}

function kpiSpark(series,key){
  if(!series||!series.length)return '';
  var vals=series.map(function(s){return s[key]||0;});
  var max=Math.max.apply(null,vals)||1,min=Math.min.apply(null,vals);
  var W=100,H=32,n=vals.length;
  var pts=vals.map(function(v,i){var x=(i/(n-1||1))*W;var y=H-2-((v-min)/((max-min)||1))*(H-4);return x.toFixed(1)+','+y.toFixed(1);});
  var d='M'+pts.join(' L');
  var area=d+' L'+W+','+H+' L0,'+H+' Z';
  var col=key==='himpun'?'#ea6a1e':key==='tasyaruf'?'#3b82f6':'#8b5cf6';
  var gid='sg_'+key+'_'+Math.random().toString(36).slice(2,7);
  return '<svg class="kpi-v2-spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+col+'" stop-opacity=".25"/><stop offset="1" stop-color="'+col+'" stop-opacity="0"/></linearGradient></defs><path d="'+area+'" fill="url(#'+gid+')"/><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

function calcMoM(series,key){
  if(!series||series.length<2)return {pct:'0.0',dir:'flat',text:'0.0% MoM'};
  var cur=series[series.length-1][key]||0;
  var prev=series[series.length-2][key]||0;
  if(prev===0)return {pct:cur>0?'100.0':'0.0',dir:cur>0?'up':'flat',text:cur>0?'+100% MoM':'stabil'};
  var pct=((cur-prev)/prev*100);
  var dir=pct>0?'up':pct<0?'down':'flat';
  var sign=pct>0?'+':'';
  return {pct:Math.abs(pct).toFixed(1),dir:dir,text:sign+pct.toFixed(1)+'% MoM'};
}

function kpiCardV2(key,label,val,icon,accentColor,trend,trendText,sparkHtml){
  var tClass=trend==='up'?'up':trend==='down'?'down':'flat';
  var tArrow=trend==='up'?'▲':trend==='down'?'▼':'●';
  return '<div class="kpi-v2" style="--kpi-accent:'+accentColor+'" onclick="openDashDetail(\''+key+'\')">'+
    '<div class="kpi-v2-top"><div class="kpi-v2-label">'+label+'</div>'+
    '<div class="kpi-v2-icon" style="background:'+accentColor+'">'+icon+'</div></div>'+
    '<div class="kpi-v2-value">'+val+'</div>'+
    '<div class="kpi-v2-bottom"><div class="kpi-v2-trend '+tClass+'">'+tArrow+' '+trendText+'</div>'+(sparkHtml||'')+'</div></div>';
}

function renderDonutChart(obj){
  var keys=Object.keys(obj||{});
  if(!keys.length)return '<div class="muted" style="padding:18px 0;text-align:center">Belum ada data.</div>';
  keys.sort(function(a,b){return obj[b]-obj[a];});
  var total=keys.reduce(function(s,k){return s+obj[k];},0)||1;
  var COLORS=['#ea6a1e','#3b82f6','#8b5cf6','#10b981','#f59e0b','#ec4899','#0ea5e9'];
  var R=58,cx=80,cy=80,sw=16;
  var circ=2*Math.PI*R;
  var offset=0;
  var paths='';var legends='';
  keys.slice(0,7).forEach(function(k,i){
    var pct=obj[k]/total;
    var dash=pct*circ;
    var gap=circ-dash;
    var col=COLORS[i%COLORS.length];
    paths+='<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" '+
      'stroke-dasharray="'+dash.toFixed(2)+' '+gap.toFixed(2)+'" stroke-dashoffset="-'+offset.toFixed(2)+'" '+
      'style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset .8s ease '+(i*0.1)+'s"/>';
    offset+=dash;
    legends+='<div class="donut-legend-item"><div class="donut-legend-dot" style="background:'+col+'"></div>'+
      '<div class="donut-legend-name">'+esc(k)+'</div>'+
      '<div class="donut-legend-val">'+rp(obj[k])+'</div></div>';
  });
  return '<div class="donut-wrap">'+
    '<div class="donut-svg-wrap"><svg viewBox="0 0 160 160">'+paths+'</svg>'+
    '<div class="donut-center"><div class="donut-center-val">'+keys.length+'</div><div class="donut-center-lbl">Pos Dana</div></div></div>'+
    '<div class="donut-legend">'+legends+'</div></div>';
}

function areaChart(series){
  if(!series||!series.length)return '<div class="muted" style="padding:30px 0;text-align:center">Belum ada data.</div>';
  var W=720,H=200,pad=8,n=series.length;
  var all=series.reduce(function(a,s){return Math.max(a,s.himpun,s.tasyaruf);},0)||1;
  function path(key){var pts=series.map(function(s,i){var x=pad+(i/(n-1||1))*(W-2*pad);var y=H-22-((s[key]||0)/all)*(H-40);return [x,y];});
    var d='M'+pts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' L');
    var a=d+' L'+(W-pad)+','+(H-22)+' L'+pad+','+(H-22)+' Z';return {line:d,area:a};}
  var h=path('himpun'),t=path('tasyaruf');
  var grid='';for(var g=0;g<=3;g++){var gy=22+g*((H-44)/3);grid+='<line x1="'+pad+'" y1="'+gy+'" x2="'+(W-pad)+'" y2="'+gy+'" stroke="rgba(100,116,139,.13)" stroke-width="1"/>';}
  var labels=series.map(function(s,i){var x=pad+(i/(n-1||1))*(W-2*pad);return '<text x="'+x.toFixed(1)+'" y="'+(H-6)+'" font-size="9" fill="#94a3b8" text-anchor="middle">'+(s.bulan||'').slice(2)+'</text>';}).join('');
  return '<div class="area-wrap"><svg class="area-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+
    '<defs><linearGradient id="ah" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ea6a1e" stop-opacity=".26"/><stop offset="1" stop-color="#ea6a1e" stop-opacity="0"/></linearGradient>'+
    '<linearGradient id="at" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity=".22"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>'+
    grid+
    '<path d="'+h.area+'" fill="url(#ah)"/><path d="'+t.area+'" fill="url(#at)"/>'+
    '<path d="'+t.line+'" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'+
    '<path d="'+h.line+'" fill="none" stroke="#ea6a1e" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>'+
    labels+'</svg></div>'+
    '<div class="legend"><span><i style="background:#ea6a1e"></i>Penghimpunan</span><span><i style="background:#3b82f6"></i>Pentasyarufan</span></div>';
}
function barsWidget(obj){
  var k=Object.keys(obj||{});if(!k.length)return '<div class="muted" style="padding:18px 0;text-align:center">Belum ada data.</div>';
  k.sort(function(a,b){return obj[b]-obj[a];});
  return k.slice(0,8).map(function(x){
    return '<div class="bar-row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2)"><div class="bar-lb" style="width:auto;flex:1;white-space:normal;overflow:visible;text-overflow:clip;font-size:13px;color:var(--text2)">'+esc(x)+'</div><div class="bar-vl" style="width:auto;text-align:right;flex:0 0 auto;font-weight:600;font-size:13px;color:var(--text)">'+rp(obj[x])+'</div></div>';
  }).join('');
}
function listWidget(arr,type){
  if(!arr||!arr.length)return '<div class="muted" style="padding:18px 0;text-align:center">Belum ada data.</div>';
  return arr.slice(0,6).map(function(r){
    var nm=(type==='himpun'?(r.namaDonatur||r.program):(r.namaPenerima||r.program))||'-';
    var tag=type==='himpun'?(r.jenisDana||''):(r.ashnaf||'');
    var col=avColor(nm);var ini=(nm.trim()[0]||'?').toUpperCase();
    return '<div class="lrow"><div class="lav" style="background:'+col+'">'+ini+'</div><div class="lmain"><div class="lnm">'+esc(nm)+'</div><div class="lsub">'+esc(tag)+' • '+fdate(r.tanggal)+'</div></div><div class="lamt">'+rp(r.jumlah)+'</div></div>';
  }).join('');
}
function formatMonthYear(ym) {
  if (!ym || ym === 'Semua') return 'Semua Waktu';
  var parts = ym.split('-');
  var y = parts[0];
  var m = parseInt(parts[1], 10);
  return BULAN[m] + ' ' + y;
}
function rekeningWidget(byRekening) {
  var cashTotal = 0;
  if (window.DASH && window.DASH.byBank && window.DASH.byBank['Tunai']) {
    cashTotal = window.DASH.byBank['Tunai'];
  }

  var nonTunai = { name: 'Non Tunai', penerimaan: 0, pentasyarufan: 0, accounts: [] };

  Object.keys(byRekening || {}).forEach(function(k) {
    var r = byRekening[k];
    var name = String(r.nama || '').toLowerCase();
    var grp = String(r.bankGroup || '').toLowerCase();
    var isT = name.indexOf('kas') >= 0 || name.indexOf('tunai') >= 0 || name.indexOf('cash') >= 0 ||
               grp.indexOf('kas') >= 0 || grp.indexOf('tunai') >= 0 || grp.indexOf('cash') >= 0;
    if (!isT) {
      nonTunai.penerimaan += (r.penerimaan || 0);
      nonTunai.pentasyarufan += (r.pentasyarufan || 0);
      nonTunai.accounts.push(r);
    }
  });

  var renderTunaiBlock = function() {
    var colorH = 'var(--green)';
    return '<div style="border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--border2);margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,0.02)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-weight:750;font-size:15px;color:var(--text);margin-bottom:4px">Tunai</div>' +
          '<div style="font-size:12px;color:var(--text2)">Total Kas Tunai Terhimpun</div>' +
        '</div>' +
        '<div style="text-align:right;white-space:nowrap;flex:0 0 auto;line-height:1.4">' +
          '<div style="font-size:13px;color:var(--text2)">Total Penerimaan: <span style="font-weight:700;color:' + colorH + '">' + rp(cashTotal) + '</span></div>' +
        '</div>' +
      '</div>' +
      '</div>';
  };

  var renderBlock = function(g, idSuffix) {
    var colorH = 'var(--green)';
    var colorS = 'var(--red)';
    var badgeId = 'tn_detail_' + idSuffix;

    var subHtml = '<div id="' + badgeId + '" style="display:none;background:var(--surface);border-radius:10px;padding:12px;margin-top:12px;flex-direction:column;gap:10px;border:1px solid var(--border)">';
    if (!g.accounts.length) {
      subHtml += '<div class="muted" style="font-size:12px;text-align:center;padding:12px 0">Tidak ada rekening aktif.</div>';
    } else {
      g.accounts.forEach(function(acc) {
        subHtml += '<div style="border-bottom:1px solid var(--border2);padding-bottom:10px;margin-bottom:2px;last-child:margin-bottom:0;last-child:border-bottom:0;last-child:padding-bottom:0">' +
          '<div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:6px">' + esc(acc.nama) + '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);line-height:1.4">' +
            '<span>Penerimaan: <span style="color:' + colorH + ';font-weight:600">' + rp(acc.penerimaan) + '</span></span>' +
            '<span>Penyaluran: <span style="color:' + colorS + ';font-weight:600">' + rp(acc.pentasyarufan) + '</span></span>' +
          '</div>' +
          '</div>';
      });
    }
    subHtml += '</div>';

    return '<div style="border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--border2);margin-bottom:12px;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.02)" class="wc-row-clickable">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="toggleBankDetail(\'' + badgeId + '\')">' +
        '<div>' +
          '<div style="font-weight:750;font-size:15px;color:var(--text);margin-bottom:4px">' + esc(g.name) + ' <span style="font-size:11px;color:var(--text2);font-weight:normal">▼</span></div>' +
          '<div style="font-size:12px;color:var(--text2)">' + g.accounts.length + ' rekening/kas</div>' +
        '</div>' +
        '<div style="text-align:right;white-space:nowrap;flex:0 0 auto;line-height:1.4">' +
          '<div style="font-size:12px;color:var(--text2);margin-bottom:3px">Penerimaan: <span style="font-weight:700;color:' + colorH + '">' + rp(g.penerimaan) + '</span></div>' +
          '<div style="font-size:12px;color:var(--text2)">Penyaluran: <span style="font-weight:700;color:' + colorS + '">' + rp(g.pentasyarufan) + '</span></div>' +
        '</div>' +
      '</div>' +
      subHtml +
      '</div>';
  };

  return renderTunaiBlock() + renderBlock(nonTunai, 'nontunai');
}

function setDashBankMode(mode) {
  window.DASH_BANK_MODE = mode;
  renderDashboard(window.DASH);
}

function toggleBankDetail(id) {
  var elDetail = el(id);
  if (elDetail) {
    elDetail.style.display = elDetail.style.display === 'none' ? 'flex' : 'none';
  }
}

function layananWidget(d) {
  var mode = window.DASH_LAYANAN_MODE || 'himpun';

  var toggleHtml = '<div class="lay-toggle">'
    + '<button class="lay-tg' + (mode === 'himpun' ? ' on' : '') + '" onclick="setDashLayananMode(\'himpun\')">Penerimaan</button>'
    + '<button class="lay-tg' + (mode === 'salur' ? ' on' : '') + '" onclick="setDashLayananMode(\'salur\')">Pentasyarufan</button>'
    + '</div>';

  var dataObj = (mode === 'himpun') ? d.byLayananHimpun : d.byLayananSalur;
  var keys = Object.keys(dataObj || {});

  var sumLay = 0, sumDaerah = 0, nLay = 0;
  keys.forEach(function(k){
    var v = dataObj[k] || 0;
    if (k === LAYANAN_DAERAH || k === 'Lazismu Daerah Bantul') sumDaerah += v;
    else { sumLay += v; if (v > 0) nLay++; }
  });
  var total = sumLay + sumDaerah;
  if (!total) return toggleHtml + '<div class="muted" style="padding:22px 0;text-align:center;font-size:13px">Belum ada data.</div>';

  var pctLay = Math.round(sumLay / total * 100);
  var pctDae = 100 - pctLay;

  /* Fokus ke angka dan proporsinya. Rincian per layanan pindah ke
     menu Laporan supaya widget ini tetap terbaca sekilas. */
  return toggleHtml
    + '<div class="lay-total"><div class="lay-total-lbl">Total ' + (mode === 'himpun' ? 'Penerimaan' : 'Pentasyarufan') + '</div>'
    + '<div class="lay-total-val">' + rp(total) + '</div></div>'
    + '<div class="lay-split">'
    + '<div class="lay-split-bar"><span class="lay-bar-a" style="width:' + pctLay + '%"></span>'
    + '<span class="lay-bar-b" style="width:' + pctDae + '%"></span></div>'
    + '<div class="lay-split-grid">'
    + '<div class="lay-box a"><div class="lay-box-lbl">KLL / ULL</div>'
    + '<div class="lay-box-val">' + rp(sumLay) + '</div>'
    + '<div class="lay-box-sub">' + pctLay + '% &middot; ' + nLay + ' layanan</div></div>'
    + '<div class="lay-box b"><div class="lay-box-lbl">Daerah</div>'
    + '<div class="lay-box-val">' + rp(sumDaerah) + '</div>'
    + '<div class="lay-box-sub">' + pctDae + '% dari total</div></div>'
    + '</div></div>'
    + '<button class="lay-more" onclick="go(\'laporan\')">Lihat rincian per layanan &rarr;</button>';
}

function setDashLayananMode(mode) {
  window.DASH_LAYANAN_MODE = mode;
  /* Ganti isi widget itu saja — merender ulang seluruh dashboard demi satu
     toggle membuat semua kartu berkedip. */
  var host = document.querySelector('.wc[data-id="program"] .wc-b');
  if (host) { host.innerHTML = layananWidget(window.DASH || {}); host.classList.remove('swap-in'); void host.offsetWidth; host.classList.add('swap-in'); }
  else renderDashboard(window.DASH);
}

/* Aturan penentuan KLL/ULL — HARUS sama persis dengan resolveLayananName()
   di api/_engine.js, kalau tidak angka di daftar dan di detail bisa berbeda. */
var LAYANAN_DAERAH = 'Penghimpunan Daerah';
function _layNorm(x){ return String(x==null?'':x).toLowerCase().replace(/\s+/g,' ').trim(); }
function _layWord(hay,needle){
  if(!hay||!needle) return false;
  var i=hay.indexOf(needle);
  while(i>=0){
    var b=i===0?' ':hay.charAt(i-1);
    var a=(i+needle.length>=hay.length)?' ':hay.charAt(i+needle.length);
    if(!/[a-z0-9]/.test(b)&&!/[a-z0-9]/.test(a)) return true;
    i=hay.indexOf(needle,i+1);
  }
  return false;
}
function _lbl(l){ return (l&&l.tipe?l.tipe+' ':'')+(l?l.nama:''); }
/* Kata yang jelas bukan bagian nama layanan — dipakai untuk memotong ekor
   kalimat seperti "KLL Srandakan pekan 2" menjadi "Srandakan". */
var _LAY_STOP = ['pekan','bulan','tanggal','tgl','infak','infaq','zakat','sedekah','shodaqoh',
  'wakaf','kurban','qurban','fidyah','terikat','umum','setoran','setor','transfer','tunai',
  'cash','qris','dari','an','a.n','atas','nama','via','bank','kas','donasi','sumbangan'];

/* Tangkap penanda "KLL <nama>" / "ULL <nama>" / "KL <nama>" dari teks asli
   (bukan versi lowercase) supaya kapitalisasi nama tetap seperti yang diketik. */
function _layFromPrefix(rawText){
  var m = String(rawText || '').match(/\b(KLL|ULL|KL)\b[\s:.\-]*([^|\n]{2,60})/i);
  if (!m) return null;
  var tipe = m[1].toUpperCase();
  if (tipe === 'KL') tipe = 'KLL';
  var words = String(m[2]).replace(/[^A-Za-z0-9'’. ]/g, ' ').split(/\s+/).filter(function(w){ return w; });
  var out = [];
  for (var i = 0; i < words.length && out.length < 4; i++) {
    var w = words[i];
    if (_LAY_STOP.indexOf(w.toLowerCase()) >= 0) break;   // ekor kalimat, berhenti
    if (/^\d+$/.test(w) && out.length) break;             // angka setelah nama = nominal/urutan
    out.push(w);
  }
  if (!out.length) return null;
  /* Samakan kapitalisasi supaya "kll sabrang" dan "KLL Sabrang" tidak menjadi
     dua baris berbeda di rekap. Singkatan yang sudah kapital (SDUA, SD)
     dibiarkan apa adanya. */
  out = out.map(function(w){
    return w === w.toLowerCase() ? (w.charAt(0).toUpperCase() + w.slice(1)) : w;
  });
  return { tipe: tipe, nama: out.join(' ') };
}

function getLayananNameForTx(r, layList, layMap){
  if (!r) return LAYANAN_DAERAH;
  layList = layList || (CACHE.layanan || []);
  if (!layMap) { layMap = {}; layList.forEach(function(l){ if(l&&l.id) layMap[l.id]=l; }); }

  // 1. Referensi eksplisit selalu menang — tidak perlu menebak dari teks.
  if (r.layananId && layMap && layMap[r.layananId]) return _lbl(layMap[r.layananId]);

  var raws = [r.namaDonatur, r.namaPenerima, r.program, r.keterangan]
    .map(function(x){ return String(x == null ? '' : x).trim(); })
    .filter(function(x){ return x.length > 0; });
  if (!raws.length) return LAYANAN_DAERAH;
  var rawBlob = raws.join(' | ');
  var blob = _layNorm(rawBlob);

  // 2. Penanda eksplisit KLL/ULL.
  var pre = _layFromPrefix(rawBlob);
  if (pre) {
    var cand = _layNorm(pre.nama);
    var hit = null;
    layList.forEach(function(l){
      var ln = _layNorm(l && l.nama);
      var kd = _layNorm(l && l.kode);
      // cocok lewat KODE (mis. "SDUA") atau lewat NAMA
      if (kd && kd.length >= 2 && (cand === kd || _layWord(cand, kd))) {
        if (!hit) hit = l;
        return;
      }
      if (!ln || ln.length < 3) return;
      if (_layWord(cand, ln) || cand.indexOf(ln) === 0 || ln.indexOf(cand) === 0) {
        if (!hit || ln.length > _layNorm(hit.nama).length) hit = l;
      }
    });
    if (hit) return _lbl(hit);
    /* Belum terdaftar di master Layanan pun tetap dihitung sebagai KLL/ULL —
       kalau dipaksa masuk "Penghimpunan Daerah", rekapnya justru salah. */
    return pre.tipe + ' ' + pre.nama;
  }

  // 2b. Data lama memakai "Lazismu Daerah Bantul" sebagai nama donatur bawaan.
  //     Itu artinya tingkat daerah — bukan KLL bernama "Bantul".
  if (/lazismu daerah|daerah bantul|penghimpunan daerah/.test(blob)) return LAYANAN_DAERAH;

  /* 3. Tipe donatur yang dipilih sendiri oleh petugas juga penanda tegas. */
  var td = _layNorm(r.tipeDonatur);
  if (td.indexOf('kantor layanan') >= 0 || td.indexOf('unit layanan') >= 0 || td === 'kll' || td === 'ull') {
    var tipeT = (td.indexOf('unit layanan') >= 0 || td === 'ull') ? 'ULL' : 'KLL';
    var namaT = String(r.namaDonatur || r.namaPenerima || '').trim();
    if (namaT) {
      var polos = namaT.replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, '');
      var cT = _layNorm(polos);
      var hitT = null;
      layList.forEach(function(l){
        var ln = _layNorm(l && l.nama), kd = _layNorm(l && l.kode);
        if (kd && kd.length >= 2 && cT === kd) { if (!hitT) hitT = l; return; }
        if (!ln || ln.length < 3) return;
        if (cT === ln || _layWord(cT, ln)) {
          if (!hitT || ln.length > _layNorm(hitT.nama).length) hitT = l;
        }
      });
      if (hitT) return _lbl(hitT);
      return tipeT + ' ' + polos;
    }
  }

  /* 4. Tidak ada penanda KLL/ULL -> penghimpunan tingkat daerah.
        Nama layanan yang kebetulan muncul di dalam nama donatur TIDAK
        dihitung: "SMP N 2 Srandakan" adalah donatur tingkat daerah. */
  return LAYANAN_DAERAH;
}

function formatSubtext(r) {
  var jd = r.jenisDana || '';
  var sub = r.subJenis || '';
  var pil = r.pilar || '';
  var prog = r.program || '';
  
  var displayDana = jd;
  if (jd === 'Infak' && sub.toLowerCase().indexOf('terikat') >= 0) {
    displayDana = 'Infak Terikat';
  } else if (sub) {
    displayDana = sub;
  }
  
  var parts = [displayDana];
  if (pil && pil !== displayDana) {
    parts.push(pil);
  }
  if (prog && prog !== pil && prog !== displayDana) {
    parts.push(prog);
  }
  return parts.join(' - ');
}

function openLayananDetail(layName, mode) {
  var title = 'Detail ' + (mode === 'himpun' ? 'Penerimaan' : 'Penyaluran') + ' - ' + layName;
  var bodyHtml = '<div style="text-align:center;padding:25px 0">' + BOXES_SPINNER + '<div class="muted" style="margin-top:10px">Memuat rincian transaksi...</div></div>';
  openModal(title, bodyHtml, '<button class="btn btn-primary" onclick="closeModal()">Tutup</button>');
  
  var layPromise = CACHE.layanan ? Promise.resolve(CACHE.layanan) : gas('apiListLayanan')(TOKEN);
  var dataPromise = (mode === 'himpun') ? gas('apiListPenghimpunan')(TOKEN) : gas('apiListPentasyarufan')(TOKEN);
  
  Promise.all([layPromise, dataPromise]).then(function(res) {
    CACHE.layanan = res[0];
    var list = res[1];
    
    var filtered = list.filter(function(r) {
      if (window.DASH_SELECTED_MONTH && window.DASH_SELECTED_MONTH !== 'Semua') {
        if (!r.tanggal || r.tanggal.indexOf(window.DASH_SELECTED_MONTH) !== 0) return false;
      }
      
      var txLayName = getLayananNameForTx(r);
      return txLayName === layName;
    });
    
    if (!filtered.length) {
      el('modalBody').innerHTML = '<div class="muted" style="text-align:center;padding:24px 0">Tidak ada rincian transaksi ditemukan untuk rentang waktu terpilih.</div>';
      return;
    }
    
    var col = (mode === 'himpun') ? 'var(--green)' : 'var(--red)';
    var h = '<div style="max-height:400px;overflow-y:auto;padding-right:4px">' +
      '<table style="font-size:12px;width:100%;border-collapse:collapse" class="table-wrap">' +
      '<thead><tr style="border-bottom:2px solid var(--border)">' +
      '<th style="text-align:left;padding:8px">Tgl</th>' +
      '<th style="text-align:left;padding:8px">' + (mode === 'himpun' ? 'Donatur / Program' : 'Program / Keterangan') + '</th>' +
      '<th style="text-align:right;padding:8px">Jumlah</th>' +
      '</tr></thead><tbody>';
      
    filtered.forEach(function(r) {
      var name = '';
      if (mode === 'himpun') {
        var details = formatSubtext(r);
        name = '<b>' + esc(r.namaDonatur || 'KLL/ULL') + '</b>';
        if (details) {
          name += '<br><span style="font-size:11px;color:var(--muted);font-weight:normal">' + esc(details) + '</span>';
        }
      } else {
        name = '<b>' + esc(r.program) + '</b><br><span style="font-size:11px;color:var(--muted);font-weight:normal">' + esc(r.keterangan || '-') + '</span>';
      }
      h += '<tr style="border-bottom:1px solid var(--border2)">' +
        '<td style="padding:8px;white-space:nowrap">' + esc(r.tanggal) + '</td>' +
        '<td style="padding:8px;white-space:normal">' + name + '</td>' +
        '<td style="padding:8px;text-align:right;font-weight:600;color:' + col + '">' + rp(r.jumlah) + '</td>' +
        '</tr>';
    });
    h += '</tbody></table></div>';
    el('modalBody').innerHTML = h;
  }).catch(function(e) {
    el('modalBody').innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">' + esc(e.message || e) + '</div>';
  });
}

function activityFeedWidget(d){
  var mode=window.DASH_ACTIVITY_MODE||'all';
  var tabs='<div class="activity-feed-tabs">'+
    '<button class="activity-feed-tab '+(mode==='all'?'active':'')+'" onclick="setDashActivityMode(\'all\')">Semua</button>'+
    '<button class="activity-feed-tab '+(mode==='himpun'?'active':'')+'" onclick="setDashActivityMode(\'himpun\')">Penerimaan</button>'+
    '<button class="activity-feed-tab '+(mode==='salur'?'active':'')+'" onclick="setDashActivityMode(\'salur\')">Penyaluran</button></div>';
  var items=[];
  if(mode==='all'||mode==='himpun'){
    (d.recentHimpun||[]).forEach(function(r){items.push({type:'himpun',name:r.namaDonatur||r.program||'-',tag:r.jenisDana||'',date:r.tanggal,amount:r.jumlah,status:r.statusBayar||'Lunas'});});
  }
  if(mode==='all'||mode==='salur'){
    (d.recentTasyaruf||[]).forEach(function(r){items.push({type:'salur',name:r.namaPenerima||r.program||'-',tag:r.ashnaf||'',date:r.tanggal,amount:r.jumlah,status:'Tersalurkan'});});
  }
  items.sort(function(a,b){return new Date(b.date||0)-new Date(a.date||0);});
  if(!items.length)return tabs+'<div class="muted" style="padding:20px 0;text-align:center">Belum ada transaksi.</div>';
  var rows=items.slice(0,8).map(function(it){
    var col=avColor(it.name);var ini=(it.name.trim()[0]||'?').toUpperCase();
    var amtCol=it.type==='himpun'?'color:#059669':'color:#3b82f6';
    var badgeCls=it.status==='Lunas'||it.status==='Tersalurkan'?'lunas':'pending';
    return '<div class="activity-row">'+
      '<div class="activity-avatar" style="background:'+col+'">'+ini+'</div>'+
      '<div class="activity-info"><div class="activity-name">'+esc(it.name)+'</div>'+
      '<div class="activity-meta"><span>'+esc(it.tag)+'</span><span>•</span><span>'+fdate(it.date)+'</span>'+
      '<span class="activity-badge '+badgeCls+'">'+esc(it.status)+'</span></div></div>'+
      '<div class="activity-amount" style="'+amtCol+'">'+rp(it.amount)+'</div></div>';
  }).join('');
  return tabs+'<div class="activity-feed">'+rows+'</div>';
}
function setDashActivityMode(m){window.DASH_ACTIVITY_MODE=m;renderDashboard(window.DASH);}

function widgetBody(id,d){
  if(id==='rekening')return rekeningWidget(d.byRekening);
  if(id==='tren')return areaChart(d.series);
  if(id==='jenis')return renderDonutChart(d.byJenis);
  if(id==='pilar')return barsWidget(d.byPilar);
  if(id==='bank')return barsWidget(d.byBank);
  if(id==='ashnaf')return barsWidget(d.byAshnaf);
  if(id==='program')return layananWidget(d);
  if(id==='fundraising')return barsWidget(d.byFundraising);
  if(id==='activity')return activityFeedWidget(d);
  if(id==='rapb')return renderRAPBWidget(d.rapb);
  if(id==='rhimpun')return listWidget(d.recentHimpun,'himpun');
  if(id==='rtasyaruf')return listWidget(d.recentTasyaruf,'tasyaruf');
  return '';
}

function getCurrentMonthString(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);}

window.DASH_DROPDOWN_STEP = 'month';
window.DASH_TEMP_MONTH = '';

function onDashFilterChange(month, pekan, hari) {
  window.DASH_SELECTED_MONTH = month;
  window.DASH_SELECTED_PEKAN = pekan;
  window.DASH_SELECTED_HARI = hari;
  
  document.querySelectorAll('.dropdown-popover').forEach(function(p) {
    p.classList.add('hidden');
  });
  
  gas('apiDashboard')(TOKEN, month, pekan, hari).then(function(d){
    CACHE.dash=d;
    renderDashboard(d);
  }).catch(handleErr);
}

function handleMonthClick(mVal) {
  event.stopPropagation();
  onDashFilterChange(mVal, 'Semua', 'Semua');
}

function handlePekanClick(pVal) {
  event.stopPropagation();
  var mVal = (window.DASH && window.DASH.selectedMonth) || 'Semua';
  onDashFilterChange(mVal, pVal, 'Semua');
}

function handleDropdownBack() {
  event.stopPropagation();
}

function renderMonthDropdownContent() {
  var pop = el('dashMonth_popover');
  if (!pop || !CACHE.dash) return;
  
  var d = CACHE.dash;
  var checkIcon = '<svg height="14" viewBox="0 0 16 16" width="14" xmlns="http://www.w3.org/2000/svg" style="color:var(--accent);margin-right:8px;fill:currentColor"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>';
  var h = '<div class="dropdown-section">';
  
  h += '<div class="dropdown-header">Pilih Bulan</div>';
  var isSelAll = d.selectedMonth === 'Semua';
  h += '<div class="dropdown-item" onclick="handleMonthClick(\'Semua\')">' +
    '<span style="width:20px;display:inline-flex;align-items:center;justify-content:center">' + (isSelAll ? checkIcon : '') + '</span>' +
    '<span>Semua Waktu</span>' +
  '</div>';
  
  if (d.availableMonths && d.availableMonths.length) {
    d.availableMonths.forEach(function(m) {
      var isSel = d.selectedMonth === m;
      h += '<div class="dropdown-item" onclick="handleMonthClick(\'' + esc(m) + '\')">' +
        '<span style="width:20px;display:inline-flex;align-items:center;justify-content:center">' + (isSel ? checkIcon : '') + '</span>' +
        '<span>' + esc(formatMonthYear(m)) + '</span>' +
      '</div>';
    });
  }
  
  h += '</div>';
  pop.innerHTML = h;
}

function renderPekanDropdownContent() {
  var pop = el('dashPekan_popover');
  if (!pop || !CACHE.dash) return;
  
  var d = CACHE.dash;
  var checkIcon = '<svg height="14" viewBox="0 0 16 16" width="14" xmlns="http://www.w3.org/2000/svg" style="color:var(--accent);margin-right:8px;fill:currentColor"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>';
  var h = '<div class="dropdown-section">';
  
  h += '<div class="dropdown-header">Pilih Pekan</div>';
  var isSelSemua = d.selectedPekan === 'Semua' || !d.selectedPekan;
  h += '<div class="dropdown-item" onclick="handlePekanClick(\'Semua\')">' +
    '<span style="width:20px;display:inline-flex;align-items:center;justify-content:center">' + (isSelSemua ? checkIcon : '') + '</span>' +
    '<span>Semua Pekan</span>' +
  '</div>';
  
  for (var w = 1; w <= 5; w++) {
    var wStr = String(w);
    var isSel = d.selectedPekan === wStr;
    var desc = w === 1 ? ' (1-7)' : w === 2 ? ' (8-14)' : w === 3 ? ' (15-21)' : w === 4 ? ' (22-28)' : ' (29-31)';
    h += '<div class="dropdown-item" onclick="handlePekanClick(\'' + wStr + '\')">' +
      '<span style="width:20px;display:inline-flex;align-items:center;justify-content:center">' + (isSel ? checkIcon : '') + '</span>' +
      '<span>Pekan ' + wStr + desc + '</span>' +
    '</div>';
  }
  
  h += '</div>';
  pop.innerHTML = h;
}

function toggleCustomDropdown(popId) {
  event.stopPropagation();
  var pop = el(popId);
  if (pop) {
    var wasHidden = pop.classList.contains('hidden');
    document.querySelectorAll('.dropdown-popover').forEach(function(p) {
      p.classList.add('hidden');
    });
    if (wasHidden) {
      pop.classList.remove('hidden');
      if (popId === 'dashMonth_popover') {
        renderMonthDropdownContent();
      } else if (popId === 'dashPekan_popover') {
        renderPekanDropdownContent();
      }
    }
  }
}

// Click outside to close custom dropdowns
document.addEventListener('click', function(e) {
  var openPopovers = document.querySelectorAll('.dropdown-popover:not(.hidden)');
  openPopovers.forEach(function(pop) {
    var dropdown = pop.closest('.custom-dropdown');
    if (!dropdown || !dropdown.contains(e.target)) {
      pop.classList.add('hidden');
    }
  });
});

function renderRAPBWidget(rapb) {
  if (!rapb || !rapb.targetHimpun) return '';
  var totalTarget=0,totalReal=0;
  var rows='';
  Object.keys(rapb.targetHimpun).forEach(function(k) {
    var tgt = rapb.targetHimpun[k] || 1;
    var rea = rapb.realisasiHimpun[k] || 0;
    totalTarget+=tgt;totalReal+=rea;
    var pct = Math.min(Math.round((rea / tgt) * 100), 100);
    var cls = pct>=80?'high':pct>=50?'mid':'low';
    rows += '<div class="rapb-bar-item">'+
      '<div class="rapb-bar-top"><span class="rapb-bar-label">' + esc(k) + '</span>'+
      '<span class="rapb-bar-pct '+cls+'">' + pct + '%</span></div>'+
      '<div class="rapb-bar-track"><div class="rapb-bar-fill '+cls+'" style="--target-width:'+pct+'%;width:'+pct+'%"></div></div>'+
      '<div class="rapb-bar-amounts"><span>'+rp(rea)+'</span><span>'+rp(tgt)+'</span></div></div>';
  });
  var overallPct=totalTarget?Math.round(totalReal/totalTarget*100):0;
  var gaugeCol=overallPct>=80?'#10b981':overallPct>=50?'#f59e0b':'#ef4444';
  var R2=40,circ2=2*Math.PI*R2,dash2=(overallPct/100)*circ2;
  var gaugeSvg='<svg class="rapb-gauge-svg" viewBox="0 0 100 100">'+
    '<circle cx="50" cy="50" r="'+R2+'" fill="none" stroke="rgba(100,116,139,.1)" stroke-width="8"/>'+
    '<circle cx="50" cy="50" r="'+R2+'" fill="none" stroke="'+gaugeCol+'" stroke-width="8" '+
    'stroke-dasharray="'+dash2.toFixed(2)+' '+(circ2-dash2).toFixed(2)+'" stroke-linecap="round" '+
    'style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dasharray 1.5s ease"/>'+
    '<text x="50" y="47" text-anchor="middle" class="rapb-gauge-center">'+overallPct+'%</text>'+
    '<text x="50" y="62" text-anchor="middle" font-size="9" fill="'+gaugeCol+'" font-weight="600">Tercapai</text></svg>';
  return '<div class="rapb-widget">'+
    '<div class="rapb-header"><div class="rapb-title">' + (typeof SVG_ICONS !== 'undefined' ? SVG_ICONS.target : '') + ' Target & Realisasi RAPB ' + rapb.year + '</div>'+
    '<span class="rapb-badge">Tahun ' + rapb.year + '</span></div>'+
    '<div class="rapb-gauge-area">'+gaugeSvg+'<div class="rapb-bars">'+rows+'</div></div></div>';
}

function renderDashboard(d){
  window.DASH=d;
  var lay=getDashLayout();
  var canView=(typeof canDo!=='function')||canDo('dashboard','view');
  var pubBtn=canView?'<button class="dh-quick-btn" onclick="openPublicLink()">' + SVG_ICONS.link + ' <span>Link Publik</span></button>':'';
  var addHimpunBtn=canDo('penghimpunan','add')?'<button class="dh-quick-btn primary" onclick="go(\'penghimpunan\');setTimeout(openModalAddPenghimpunan,200)">' + SVG_ICONS.plus + ' <span>Penghimpunan</span></button>':'';
  var addSalurBtn=canDo('pentasyarufan','add')?'<button class="dh-quick-btn" onclick="go(\'pentasyarufan\');setTimeout(openModalAddPentasyarufan,200)">' + SVG_ICONS.plus + ' <span>Penyaluran</span></button>':'';
  var edClass=window.DASH_EDIT?'primary':'';
  var editBtn='<button class="dh-quick-btn '+edClass+'" id="dashEditBtn" onclick="toggleDashEdit()">' + SVG_ICONS.sliders + ' <span>' + (window.DASH_EDIT ? 'Selesai' : 'Atur Layout') + '</span></button>';
  var nm=(typeof ME!=='undefined'&&ME&&ME.nama)?ME.nama:'Admin';
  var today=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  var dropdownOptions = [{ value: 'Semua', label: 'Semua Waktu' }];
  if (d.availableMonths && d.availableMonths.length) {
    d.availableMonths.forEach(function(m) {
      dropdownOptions.push({ value: m, label: formatMonthYear(m) });
    });
  }
  
  var selectedVal = d.selectedMonth || 'Semua';
  var selectedOpt = dropdownOptions.find(function(o) { return o.value === selectedVal; }) || dropdownOptions[0];
  
  var monthDropdown = '<div class="custom-dropdown">' +
    '<button id="dashMonth_trigger" class="btn-dropdown" onclick="toggleCustomDropdown(\'dashMonth_popover\')">' +
      '<span>' + esc(selectedOpt.label) + '</span>' +
      '<svg height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg" style="fill:currentColor"><path d="M4.5 6l3.5 3.5L11.5 6H4.5z"/></svg>' +
    '</button>' +
    '<div id="dashMonth_popover" class="dropdown-popover hidden"></div>' +
  '</div>';

  var checkIcon = '<svg height="14" viewBox="0 0 16 16" width="14" xmlns="http://www.w3.org/2000/svg" style="color:var(--accent);margin-right:8px;fill:currentColor"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>';

  var pekanDropdown = '';
  if (selectedVal !== 'Semua') {
    var selPekan = d.selectedPekan || 'Semua';
    var pekanLabel = selPekan === 'Semua' ? 'Semua Pekan' : 'Pekan ' + selPekan;
    pekanDropdown = '<div class="custom-dropdown" style="margin-left:4px">' +
      '<button id="dashPekan_trigger" class="btn-dropdown" onclick="toggleCustomDropdown(\'dashPekan_popover\')">' +
        '<span>' + esc(pekanLabel) + '</span>' +
        '<svg height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg" style="fill:currentColor"><path d="M4.5 6l3.5 3.5L11.5 6H4.5z"/></svg>' +
      '</button>' +
      '<div id="dashPekan_popover" class="dropdown-popover hidden"></div>' +
    '</div>';
  }

  var dayDropdown = '';
  if (selectedVal !== 'Semua' && d.selectedPekan !== 'Semua') {
    var pNum = Number(d.selectedPekan);
    var startDay = (pNum - 1) * 7 + 1;
    var endDay = pNum === 5 ? 31 : pNum * 7;
    
    var parts = selectedVal.split('-');
    var yr = Number(parts[0]), mo = Number(parts[1]);
    var daysInMonth = new Date(yr, mo, 0).getDate();
    if (endDay > daysInMonth) endDay = daysInMonth;
    
    var dayOptions = [{ value: 'Semua', label: 'Semua Hari' }];
    for (var day = startDay; day <= endDay; day++) {
      var dStr = ('0' + day).slice(-2);
      var fullDateStr = selectedVal + '-' + dStr;
      dayOptions.push({ value: fullDateStr, label: 'Tanggal ' + day });
    }
    
    var selectedHariVal = d.selectedHari || 'Semua';
    var selectedHariOpt = dayOptions.find(function(o) { return o.value === selectedHariVal; }) || dayOptions[0];
    
    dayDropdown = '<div class="custom-dropdown" style="margin-left:4px">' +
      '<button id="dashHari_trigger" class="btn-dropdown" onclick="toggleCustomDropdown(\'dashHari_popover\')">' +
        '<span>' + esc(selectedHariOpt.label) + '</span>' +
        '<svg height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg" style="fill:currentColor"><path d="M4.5 6l3.5 3.5L11.5 6H4.5z"/></svg>' +
      '</button>' +
      '<div id="dashHari_popover" class="dropdown-popover hidden">' +
        '<div class="dropdown-section">' +
          '<div class="dropdown-header">Pilih Hari</div>';
          
    dayOptions.forEach(function(opt) {
      var isSelected = opt.value === selectedHariVal;
      dayDropdown += '<div class="dropdown-item" onclick="onDashFilterChange(\'' + esc(selectedVal) + '\',\'' + esc(d.selectedPekan) + '\',\'' + esc(opt.value) + '\')">' +
        '<span style="width:20px;display:inline-flex;align-items:center;justify-content:center">' + (isSelected ? checkIcon : '') + '</span>' +
        '<span>' + esc(opt.label) + '</span>' +
      '</div>';
    });
    
    dayDropdown += '</div></div></div>';
  }

  // Clean minimal header replacing heavy orange hero
  var hero='<div class="dh">' +
    '<div class="dh-content">' +
      '<div class="dh-row">' +
        '<div class="dh-greeting"><div class="dh-hi">'+esc(salamRender((SETTINGS&&SETTINGS.salamJudul)||SALAM_DEFAULT,{nama:nm}))+'</div>'+
        '<div class="dh-sub">'+esc(salamSub(today))+'</div></div>'+
        '<div class="dh-acts">' +
          '<div class="dh-act-row">' + addHimpunBtn + addSalurBtn + pubBtn + editBtn + '</div>' +
          '<div class="dh-act-row">' + monthDropdown + pekanDropdown + dayDropdown + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  var trH=d.transaksiHimpun||0,trT=d.transaksiTasyaruf||0;
  var momH=calcMoM(d.series,'himpun');
  var momT=calcMoM(d.series,'tasyaruf');
  var saldoKas=d.saldo||0;
  var totalPeople=(d.jumlahDonatur||0)+' / '+(d.jumlahMustahik||0);

  var kpis='<div class="kpis-v2">'+
    kpiCardV2('himpun','Total Penghimpunan',rp(d.totalHimpun),SVG_ICONS.arrowUp,'#ea6a1e',momH.dir,momH.text+' ('+trH+' tx)',kpiSpark(d.series,'himpun'))+
    kpiCardV2('tasyaruf','Total Pentasyarufan',rp(d.totalTasyaruf),SVG_ICONS.arrowDown,'#3b82f6',momT.dir,momT.text+' ('+trT+' tx)',kpiSpark(d.series,'tasyaruf'))+
    kpiCardV2('saldo','Saldo Kas & Dana',rp(saldoKas),SVG_ICONS.wallet,'#059669','flat','Dana Siap Salur','')+
    kpiCardV2('donatur','Donatur & Mustahik',totalPeople,SVG_ICONS.users,'#8b5cf6','flat',d.jumlahMustahik+' mustahik terbantu','')+
    '</div>';

  var hint=window.DASH_EDIT?'<div class="edit-hint"><b>Mode Atur Layout Aktif</b> — Tarik <b>tepi atau sudut</b> kartu untuk mengubah lebar dan tinggi ke segala arah — klik ganda pada pegangan untuk mengembalikan ukuran asal. Seret header kartu (<b>⋮⋮</b>) untuk menyusun posisi, dan <b>✕</b> untuk menyembunyikan.</div>':'';

  var cells=lay.order.filter(function(id){return WIDGETS[id]&&(!lay.vis||lay.vis[id]!==false);}).map(function(id){
    var w=WIDGETS[id];
    var sz=(lay.size&&lay.size[id])||'md';
    var hz=(lay.height&&lay.height[id])||'auto';
    
    var asymWeight = 'med';
    if (id === 'tren' || id === 'rekening' || id === 'pilar' || id === 'program' || id === 'fundraising' || id === 'activity' || id === 'rapb') {
      asymWeight = 'large';
    } else {
      asymWeight = 'med';
    }

    /* Panah pindah kiri/kanan dan pill 33/50/66/100% dihapus: posisi kini diatur
       dengan menyeret header, ukuran dengan menarik tepi/sudut kartu.
       Reset ukuran manual: klik ganda pada pegangan resize. */
    var ctr=window.DASH_EDIT?('<div class="wc-ctrls">' +
      '<button class="cbtn hide-btn" title="Sembunyikan kartu" onclick="event.stopPropagation();dashHide(\''+id+'\')">' + SVG_ICONS.close + '</button>' +
    '</div>'):'';
    
    var dim=(lay.dimensions&&lay.dimensions[id])||{};
    var dimStyle='';
    // !important wajib: aturan .dgrid .wc di stylesheet juga memakai !important
    if(dim.pct)dimStyle+='flex: 0 0 calc('+dim.pct+'% - 16px) !important;';
    // tinggi hasil resize dipakai sebagai tinggi pasti, bukan sekadar minimum,
    // supaya kartu bisa dikecilkan lagi setelah pernah dibesarkan
    if(dim.height)dimStyle+='height: '+dim.height+'px !important;min-height: '+dim.height+'px !important;';
    var resizedAttr=(dim.pct||dim.height)?' data-resized="1"':'';

    // pegangan resize (8 arah) dipasang oleh wireDashResize()
    var dragHandle = window.DASH_EDIT ? '<span class="drag-handle" title="Tarik untuk memindahkan posisi">' + SVG_ICONS.grip + '</span>' : '';

    return '<div class="wc" data-asym="'+asymWeight+'" data-size="'+sz+'" data-height="'+hz+'" data-id="'+id+'"'+resizedAttr+' style="'+dimStyle+'" draggable="'+(window.DASH_EDIT?'true':'false')+'">'+
      '<div class="wc-h"><div class="wc-t">'+dragHandle+'<span class="dot" style="background:'+w.dot+'"></span>'+w.t+'</div>'+ctr+'</div>'+
      '<div class="wc-b">'+widgetBody(id,d)+'</div></div>';
  }).join('');

  var hidden=lay.order.filter(function(id){return WIDGETS[id]&&lay.vis&&lay.vis[id]===false;});
  var hiddenBar=(window.DASH_EDIT&&hidden.length)?'<div class="edit-hint" style="background:rgba(100,116,139,.08);border-color:rgba(100,116,139,.2);color:var(--ink2)">Tersembunyi: '+hidden.map(function(id){return '<button class="cbtn" style="width:auto;padding:0 8px;margin:0 3px" onclick="dashShow(\''+id+'\')">+ '+WIDGETS[id].t+'</button>';}).join('')+'</div>':'';

  el('content').innerHTML='<div class="dash-wrap view-anim'+(window.DASH_EDIT?' dash-edit':'')+'">'+hero+kpis+hint+hiddenBar+'<div class="dgrid" id="dgrid">'+cells+'</div></div>';
  if(window.DASH_EDIT){wireDashDrag();wireDashResize();}
  else { playAsymmetricalAnimation(); }
}

function playAsymmetricalAnimation() {
  var grid = el('dgrid');
  if (!grid) return;
  
  var largeEls = grid.querySelectorAll('.wc[data-asym="large"], .asym-large');
  var medEls = grid.querySelectorAll('.wc[data-asym="med"], .asym-med');
  
  largeEls.forEach(function(el) {
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
  });
  medEls.forEach(function(el) {
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateY(14px)';
  });
  
  requestAnimationFrame(function() {
    largeEls.forEach(function(el) {
      el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    
    setTimeout(function() {
      medEls.forEach(function(el) {
        el.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    }, 100);
  });
}

/* ===== flexible layout ===== */
function getDashLayout(){
  var def={
    order:['rekening','jenis','activity','pilar','bank','ashnaf','program','fundraising','rhimpun','rtasyaruf','tren','rapb'],
    vis:{},
    size:{rekening:'full',tren:'full',rapb:'full',jenis:'md',activity:'lg',pilar:'md',bank:'md',ashnaf:'md',program:'md',fundraising:'md',rhimpun:'md',rtasyaruf:'md'},
    height:{rekening:'auto',tren:'auto',rapb:'auto',jenis:'auto',activity:'auto',pilar:'auto',bank:'auto',ashnaf:'auto',program:'auto',fundraising:'auto',rhimpun:'auto',rtasyaruf:'auto'},
    dimensions:{}
  };
  try{
    var raw=localStorage.getItem('laz_dashlayout')||(typeof SETTINGS!=='undefined'&&SETTINGS.dashLayout)||'';
    if(raw){
      var s=(typeof raw==='string')?JSON.parse(raw):raw;
      if(s&&s.order){
        if(s.order.indexOf('rekening') === -1) {
          s.order.unshift('rekening');
        }
        if(s.order.indexOf('fundraising') === -1) {
          s.order.push('fundraising');
        }
        if(s.order.indexOf('pilar') === -1) {
          s.order.push('pilar');
        }
        if(s.order.indexOf('rapb') === -1) {
          s.order.push('rapb');
        }
        var trenIdx = s.order.indexOf('tren');
        if(trenIdx >= 0) {
          s.order.splice(trenIdx, 1);
          s.order.push('tren');
        }
        
        // Populate missing properties
        s.size = s.size || {};
        s.height = s.height || {};
        s.dimensions = s.dimensions || {};
        s.vis = s.vis || {};
        
        def.order.forEach(function(k) {
          if (s.size[k] === undefined) s.size[k] = def.size[k] || 'md';
          if (s.height[k] === undefined) s.height[k] = def.height[k] || 'auto';
        });
        
        return s;
      }
    }
  }catch(e){}
  return def;
}
function saveDashLayout(lay){
  try{localStorage.setItem('laz_dashlayout',JSON.stringify(lay));}catch(e){} 
  if(typeof SETTINGS!=='undefined') {
    SETTINGS.dashLayout=JSON.stringify(lay);
    var d = { dashLayout: JSON.stringify(lay) };
    gas('apiSaveSettings')(TOKEN, d).catch(function(err) {
      console.error('Simpan pengaturan layout gagal:', err);
    });
  }
}
function toggleDashEdit(){window.DASH_EDIT=!window.DASH_EDIT;renderDashboard(window.DASH);}
function dashSetSize(id,sz){
  var lay=getDashLayout();
  lay.size=lay.size||{};
  lay.size[id]=sz;
  if (lay.dimensions && lay.dimensions[id]) {
    delete lay.dimensions[id].pct;
  }
  saveDashLayout(lay);
  renderDashboard(window.DASH);
}
function dashSetHeight(id,hz){var lay=getDashLayout();lay.height=lay.height||{};lay.height[id]=hz;saveDashLayout(lay);renderDashboard(window.DASH);}
function dashMove(id,dir){
  var lay=getDashLayout();
  var o=lay.order.slice();
  var i=o.indexOf(id);
  if(i<0)return;
  var j=i+dir;
  if(j<0||j>=o.length)return;
  var t=o[i];o[i]=o[j];o[j]=t;
  lay.order=o;
  saveDashLayout(lay);
  renderDashboard(window.DASH);
}
function dashHide(id){var lay=getDashLayout();lay.vis=lay.vis||{};lay.vis[id]=false;saveDashLayout(lay);renderDashboard(window.DASH);}
function dashShow(id){var lay=getDashLayout();lay.vis=lay.vis||{};lay.vis[id]=true;saveDashLayout(lay);renderDashboard(window.DASH);}
function wireDashDrag(){
  var grid=el('dgrid');if(!grid)return;
  grid.querySelectorAll('.wc').forEach(function(card){
    var handle=card.querySelector('.drag-handle')||card.querySelector('.wc-h');
    if(!handle)return;
    handle.addEventListener('pointerdown',function(e){
      if(e.target.closest('.cbtn')||e.target.closest('.btn-dropdown')||e.target.closest('.dropdown-popover')||e.target.closest('button')||e.target.closest('a')||e.target.closest('.wc-b')||e.target.closest('.resize-handle')||e.target.closest('.rz')){
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      var rect=card.getBoundingClientRect();
      var offsetX=e.clientX-rect.left;
      var offsetY=e.clientY-rect.top;
      var placeholder=document.createElement('div');
      placeholder.className='wc wc-placeholder';
      placeholder.style.flex=card.style.flex||getComputedStyle(card).flex;
      placeholder.style.minHeight=(card.style.minHeight||rect.height)+'px';
      placeholder.style.height=rect.height+'px';
      card.classList.add('dragging-floating');
      card.style.position='fixed';
      card.style.left=rect.left+'px';
      card.style.top=rect.top+'px';
      card.style.width=rect.width+'px';
      card.style.height=rect.height+'px';
      card.style.zIndex='99999';
      card.style.pointerEvents='none';
      grid.insertBefore(placeholder,card);
      handle.setPointerCapture(e.pointerId);
      function onMove(ev){
        card.style.left=(ev.clientX-offsetX)+'px';
        card.style.top=(ev.clientY-offsetY)+'px';
        var cards=Array.prototype.filter.call(grid.querySelectorAll('.wc'),function(c){return c!==card&&c!==placeholder;});
        var closest=null;var closestDist=Infinity;
        cards.forEach(function(c){
          var r=c.getBoundingClientRect();
          var cx=r.left+r.width/2;
          var cy=r.top+r.height/2;
          var dist=Math.hypot(ev.clientX-cx,ev.clientY-cy);
          if(dist<closestDist){closestDist=dist;closest=c;}
        });
        if(closest&&closest!==placeholder){
          var r=closest.getBoundingClientRect();
          var isAfter=ev.clientX>(r.left+r.width/2)||(Math.abs(ev.clientX-(r.left+r.width/2))<40&&ev.clientY>(r.top+r.height/2));
          if(isAfter){grid.insertBefore(placeholder,closest.nextSibling);}
          else{grid.insertBefore(placeholder,closest);}
        }
      }
      function onUp(ev){
        handle.removeEventListener('pointermove',onMove);
        handle.removeEventListener('pointerup',onUp);
        handle.removeEventListener('pointercancel',onUp);
        card.classList.remove('dragging-floating');
        card.style.position='';card.style.left='';card.style.top='';
        card.style.width='';card.style.height='';card.style.zIndex='';card.style.pointerEvents='';
        if(placeholder.parentNode){
          grid.insertBefore(card,placeholder);
          placeholder.parentNode.removeChild(placeholder);
        }
        var lay=getDashLayout();
        lay.order=Array.prototype.map.call(grid.querySelectorAll('.wc'),function(x){return x.getAttribute('data-id');});
        var hid=getDashLayout().order.filter(function(id){return lay.order.indexOf(id)<0;});
        lay.order=lay.order.concat(hid);
        saveDashLayout(lay);
      }
      handle.addEventListener('pointermove',onMove);
      handle.addEventListener('pointerup',onUp);
      handle.addEventListener('pointercancel',onUp);
    });
  });
}


/* Resize widget bebas ke 8 arah: 4 sisi (atas, bawah, kiri, kanan) + 4 sudut.
   Versi lama hanya punya satu pegangan di sudut kanan-bawah, dan tarikan
   vertikalnya tidak terasa karena CSS mengunci `.dgrid .wc{max-height:420px}`.
   Kartu yang sudah diubah ukurannya sekarang ditandai data-resized="1" supaya
   batas tinggi itu dilepas. */
var RESIZE_DIRS=['n','s','e','w','ne','nw','se','sw'];

function wireDashResize(){
  var grid=el('dgrid');if(!grid)return;
  grid.querySelectorAll('.wc').forEach(function(card){
    card.querySelectorAll('.rz').forEach(function(old){old.remove();});
    var id=card.getAttribute('data-id');

    RESIZE_DIRS.forEach(function(dir){
      var handle=document.createElement('span');
      handle.className='rz rz-'+dir;
      handle.setAttribute('title','Tarik untuk mengubah ukuran — klik ganda untuk mengembalikan ukuran asal');
      card.appendChild(handle);

      // klik ganda pada pegangan = kembalikan kartu ke ukuran otomatis
      handle.addEventListener('dblclick',function(e){
        e.preventDefault();e.stopPropagation();
        var lay=getDashLayout();
        if(lay.dimensions&&lay.dimensions[id])delete lay.dimensions[id];
        saveDashLayout(lay);
        renderDashboard(window.DASH);
      });

      handle.addEventListener('pointerdown',function(e){
        e.preventDefault();e.stopPropagation();
        var startX=e.clientX,startY=e.clientY;
        var gridRect=grid.getBoundingClientRect();
        var rect=card.getBoundingClientRect();
        var startW=rect.width,startH=rect.height;
        var minW=260,minH=140;
        var maxW=gridRect.width;
        var horiz=dir.indexOf('e')>-1||dir.indexOf('w')>-1;
        var vert=dir.indexOf('n')>-1||dir.indexOf('s')>-1;

        card.setAttribute('draggable','false');
        card.setAttribute('data-resized','1');
        card.classList.add('resizing');
        document.body.classList.add('rz-active');
        handle.setPointerCapture(e.pointerId);

        /* Aturan `.dgrid .wc{flex:1 1 340px !important; height:auto !important}`
           mengalahkan style inline biasa — itu sebabnya tarikan lebar dulu tidak
           berpengaruh sama sekali. Inline + !important yang menang. */
        function move(ev){
          var dx=ev.clientX-startX, dy=ev.clientY-startY;
          if(horiz){
            // sisi barat tumbuh saat kursor ditarik ke kiri
            var w=dir.indexOf('w')>-1 ? startW-dx : startW+dx;
            w=Math.max(minW,Math.min(maxW,w));
            card.style.setProperty('flex','0 0 calc('+((w/gridRect.width)*100).toFixed(2)+'% - 16px)','important');
          }
          if(vert){
            var h=dir.indexOf('n')>-1 ? startH-dy : startH+dy;
            h=Math.max(minH,h);
            card.style.setProperty('height',Math.round(h)+'px','important');
            card.style.setProperty('min-height',Math.round(h)+'px','important');
          }
        }
        function done(){
          handle.removeEventListener('pointermove',move);
          handle.removeEventListener('pointerup',done);
          handle.removeEventListener('pointercancel',done);
          card.classList.remove('resizing');
          document.body.classList.remove('rz-active');
          card.setAttribute('draggable','true');
          var gridNow=grid.getBoundingClientRect();
          var cardNow=card.getBoundingClientRect();
          var lay=getDashLayout();lay.dimensions=lay.dimensions||{};
          lay.dimensions[id]={
            pct:((cardNow.width/gridNow.width)*100).toFixed(1),
            height:Math.round(cardNow.height)
          };
          saveDashLayout(lay);
        }
        handle.addEventListener('pointermove',move);
        handle.addEventListener('pointerup',done);
        handle.addEventListener('pointercancel',done);
      });
    });
  });
}

/* ===== DASHBOARD v6 DETAIL POPUP ===== */
function openDashDetail(key){
  var d=window.DASH||{};var t='Detail',c='';
  function row(l,v,col){return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(100,116,139,.12)"><span style="color:var(--ink2,#5b6470);font-size:13px">'+l+'</span><b style="font-size:14px'+(col?';color:'+col:'')+'">'+v+'</b></div>';}
  if(key==='rekening'){t='Saldo per Rekening';c=rekeningWidget(d.byRekening);}
  else if(key==='himpun'){t='Total Penghimpunan';c=row('Total terkumpul',rp(d.totalHimpun),'#0f9d6b')+row('Jumlah transaksi',(d.transaksiHimpun||0))+'<h4 style="margin:16px 0 6px;font-family:var(--head)">Rincian Jenis Dana</h4>'+barsWidget(d.byJenis);}
  else if(key==='tasyaruf'){t='Total Pentasyarufan';c=row('Total tersalurkan',rp(d.totalTasyaruf),'#e5484d')+row('Jumlah penyaluran',(d.transaksiTasyaruf||0))+'<h4 style="margin:16px 0 6px;font-family:var(--head)">Rincian Ashnaf</h4>'+barsWidget(d.byAshnaf);}
  else if(key==='saldo'){t='Saldo Dana';c=row('Total Penghimpunan',rp(d.totalHimpun),'#0f9d6b')+row('Total Pentasyarufan',rp(d.totalTasyaruf),'#e5484d')+row('Saldo akhir',rp(d.saldo),d.saldo>=0?'#0f9d6b':'#e5484d');}
  else if(key==='orang'){t='Donatur & Mustahik';c=row('Jumlah Donatur',(d.jumlahDonatur||0))+row('Jumlah Mustahik',(d.jumlahMustahik||0));}
  else if(key==='tren'){t='Tren Arus Dana (12 bulan)';c=areaChart(d.series);}
  else if(key==='jenis'){t='Jenis Dana Terhimpun';c=barsWidget(d.byJenis);}
  else if(key==='bank'){t='Bank & Kas';c=barsWidget(d.byBank);}
  else if(key==='rhimpun'){t='Penghimpunan Terbaru';c=listWidget(d.recentHimpun,'himpun');}
  else if(key==='rtasyaruf'){t='Pentasyarufan Terbaru';c=listWidget(d.recentTasyaruf,'tasyaruf');}
  if(typeof openModal==='function')openModal(t,c,'<button class="btn btn-primary" onclick="closeModal()">Tutup</button>');
}
function initRipple(){}
 var IMPORT_TEMP_ROWS = [];
var IMPORT_TEMP_TYPE = '';

function openImportModal(type) {
  IMPORT_TEMP_TYPE = type;
  IMPORT_TEMP_ROWS = [];
  window.IMPORT_TEMP_IS_JURNAL = false;
  window.IMPORT_TEMP_HIMPUN_ROWS = [];
  window.IMPORT_TEMP_SALUR_ROWS = [];
  
  var title = type === 'himpun' ? 'Import Penghimpunan Data' : 'Import Pentasyarufan Data';
  
  var bankOptions = '<option value="">(Deteksi Otomatis)</option>';
  if (type === 'himpun' && CACHE.rekening) {
    CACHE.rekening.forEach(function(r) {
      if (String(r.aktif) === 'true') {
        var label = r.namaBank + ' - ' + r.nomor + ' (' + (r.fundGroup || 'Umum') + ')';
        bankOptions += '<option value="' + esc(r.id) + '">' + esc(label) + '</option>';
      }
    });
  }
  
  var b = '<div class="lap-tabs" style="margin-bottom:14px">' +
    '<button class="lap-tab on" id="tab_import_file" onclick="setImportTab(\'file\')">Unggah File</button>' +
    '<button class="lap-tab" id="tab_import_text" onclick="setImportTab(\'text\')">Tempel Teks</button>' +
    '<button class="lap-tab" id="tab_import_link" onclick="setImportTab(\'link\')">Link Spreadsheet</button>' +
    '</div>' +
    '<div id="group_import_file">' +
    '<div class="upload-box" onclick="el(\'import_file\').click()" id="importDrop">' +
    '<div class="imp-drop-t">Pilih file Excel atau CSV</div>' +
    '<div class="imp-drop-d">Buku kas (Tanggal &middot; Uraian &middot; Debet &middot; Kredit &middot; Fundraising) atau jurnal penerimaan berpasangan debet&ndash;kredit &mdash; keduanya dikenali otomatis</div>' +
    '</div>' +
    '<input type="file" id="import_file" accept=".xlsx,.xls,.csv" style="display:none" onchange="onImportFile(event)">' +
    '<div id="importFileInfo" class="imp-file-info"></div>' +
    '</div>' +
    '<div id="group_import_link" class="hidden">' +
    '<p class="muted" style="margin-bottom:12px;font-size:12.5px">Tempelkan tautan (link) Google Sheets yang dibagikan secara publik (anyone with the link can view) atau URL langsung file Excel (.xlsx).</p>' +
    '<div class="field"><label>Link Spreadsheet / Excel *</label>' +
    '<input id="import_url" placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"></div>' +
    '</div>' +
    '<div id="group_import_text" class="hidden">' +
    '<p class="muted" style="margin-bottom:12px;font-size:12.5px">Salin (Copy) sel baris dari Google Sheets atau Excel Anda, lalu tempel (Paste) di kotak di bawah ini.</p>' +
    '<div class="field"><label>Tempel Data Tabel di sini *</label>' +
    '<textarea id="import_text" rows="6" placeholder="Format baris tanpa header:\n10/7/2026\tSehono\t\t\t137.000\tAriya\n10/7/2026\tKLL Daerah\t\t\t50.000\tBudi\n\nAtau format dengan header:\nTanggal\tUraian\tAlamat\tNO HP\tDebet\tKredit\n2/6/2026\tPenjuaan Kulit Kambing DAM\t\t\t8.230.000\t" style="font-family:monospace;font-size:11.5px;width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--border);padding:10px;background:var(--bg)"></textarea></div>' +
    '</div>' +
    '<div class="row" style="margin-top:12px">' +
    '<div class="field"><label>Default Metode Pembayaran</label>' +
    '<select id="import_default_metode">' +
    '<option value="">(Deteksi Otomatis)</option>' +
    '<option value="Cash/Tunai">Cash/Tunai</option>' +
    '<option value="Transfer Bank">Transfer Bank</option>' +
    '<option value="QRIS">QRIS</option>' +
    '</select>' +
    '</div>' +
    (type === 'himpun' ? 
    '<div class="field"><label>Default Rekening Bank</label>' +
    '<select id="import_default_rekening">' +
    bankOptions +
    '</select>' +
    '</div>' : '') +
    '</div>' +
    '<div class="row">' +
    '<div class="field"><label>Default Nama Fundraising (Opsional)</label>' +
    '<input id="import_default_fundraising" placeholder="Masukkan nama fundraising jika tidak didefinisikan di kolom"></div>' +
    '</div>' +
    '<div id="importPreview"></div>';
  
  var f = '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
    '<button class="btn btn-ghost" id="importTarikBtn" onclick="tarikImportData()">Tarik & Analisis Data</button>' +
    '<button class="btn btn-primary hidden" id="importSimpanBtn" onclick="simpanImportData()">Simpan Data</button>';

  openModal(title, b, f);
  var mc = el('modalCard');
  if (mc) mc.classList.add('import-modal');   // ukuran dikunci, tidak ikut berubah saat pindah tab
}

function setImportTab(tab) {
  IMPORT_TAB = tab;
  ['file','text','link'].forEach(function(t){
    var btn = el('tab_import_' + t), grp = el('group_import_' + t);
    if (btn) btn.classList.toggle('on', t === tab);
    if (grp) grp.classList.toggle('hidden', t !== tab);
  });
  el('importPreview').innerHTML = '';
  el('importSimpanBtn').classList.add('hidden');
}
var IMPORT_TAB = 'file';
var IMPORT_FILE_TSV = '';

/* Baca .xlsx / .xls / .csv di browser lalu ubah jadi TSV berheader,
   supaya jalur unggah file dan tempel teks memakai parser yang sama. */
function onImportFile(e){
  var f = e.target.files && e.target.files[0];
  if (!f) return;
  var info = el('importFileInfo');
  info.innerHTML = '<span class="muted">Membaca ' + esc(f.name) + '…</span>';
  var reader = new FileReader();
  reader.onload = function(ev){
    try {
      var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
      var ws = wb.Sheets[wb.SheetNames[0]];
      /* raw:true — tanggal tetap objek Date lalu kita tulis sendiri sebagai
         yyyy-mm-dd. Sebelumnya raw:false menyerahkan format ke Excel dan
         sering keluar "8/2/26"; tahun 2 digit membuat tanggal bisa tertukar
         hari-bulan dan jurnal tidak dikenali sama sekali. */
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      var p2 = function(n){ return ('0' + n).slice(-2); };
      var sel = function(c){
        if (c == null) return '';
        if (c instanceof Date) return c.getFullYear() + '-' + p2(c.getMonth() + 1) + '-' + p2(c.getDate());
        if (typeof c === 'number') return String(c);
        return String(c).trim();
      };
      var baris = aoa.map(function(r){ return r.map(sel); })
                     .filter(function(r){ return r.some(function(c){ return c !== ''; }); })
                     .map(function(r){ return r.join('\t'); });
      IMPORT_FILE_TSV = baris.join('\n');
      info.innerHTML = '<b>' + esc(f.name) + '</b> <span class="muted">&middot; ' + baris.length + ' baris terbaca'
        + (wb.SheetNames.length > 1 ? ' &middot; sheet "' + esc(wb.SheetNames[0]) + '"' : '') + '</span>';
      toast('File terbaca, klik "Tarik & Analisis Data"');
    } catch (err) {
      IMPORT_FILE_TSV = '';
      info.innerHTML = '<span style="color:var(--red)">Gagal membaca file: ' + esc(err.message || err) + '</span>';
    }
  };
  reader.onerror = function(){ info.innerHTML = '<span style="color:var(--red)">Gagal membaca file.</span>'; };
  reader.readAsArrayBuffer(f);
}

function tarikImportData() {
  var isFile = (IMPORT_TAB === 'file');
  var isText = (IMPORT_TAB === 'text');
  var btn = el('importTarikBtn');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  el('importPreview').innerHTML = '<div style="text-align:center;padding:20px 0">' + BOXES_SPINNER + '<div class="muted" style="margin-top:10px;font-size:12.5px">Menganalisis data...</div></div>';
  
  var promise;
  if (isFile) {
    if (!IMPORT_FILE_TSV) {
      btn.disabled = false; btn.textContent = 'Tarik & Analisis Data';
      el('importPreview').innerHTML = '';
      return toast('Pilih file terlebih dahulu', true);
    }
    promise = gas('apiParseImportText')(TOKEN, IMPORT_FILE_TSV, IMPORT_TEMP_TYPE);
  } else if (isText) {
    var text = el('import_text').value.trim();
    if (!text) {
      btn.disabled = false;
      btn.textContent = 'Tarik & Analisis Data';
      el('importPreview').innerHTML = '';
      return toast('Masukkan teks data spreadsheet terlebih dahulu', true);
    }
    promise = gas('apiParseImportText')(TOKEN, text, IMPORT_TEMP_TYPE);
  } else {
    var url = el('import_url').value.trim();
    if (!url) {
      btn.disabled = false;
      btn.textContent = 'Tarik & Analisis Data';
      el('importPreview').innerHTML = '';
      return toast('Masukkan URL link spreadsheet/excel terlebih dahulu', true);
    }
    promise = gas('apiParseImportUrl')(TOKEN, url, IMPORT_TEMP_TYPE);
  }
  
  promise.then(function(res) {
    btn.disabled = false;
    btn.textContent = 'Tarik Ulang';
    
    if (res && res.success) {
      if (res.isJurnal) {
        window.IMPORT_TEMP_IS_JURNAL = true;
        window.IMPORT_TEMP_HIMPUN_ROWS = res.himpunValid;
        window.IMPORT_TEMP_SALUR_ROWS = res.salurValid;
        
        var totalValid = res.himpunValid.length + res.salurValid.length;
        var totalInvalid = res.himpunInvalid.length + res.salurInvalid.length;
        
        var h = '<div class="imp-note">Terbaca sebagai <b>jurnal penerimaan</b>. '
          + 'Jenis dana diambil dari <b>akun kredit</b> di baris pasangannya '
          + '(mis. &ldquo;Penerimaan Infak Terikat - Kemanusiaan&rdquo;), '
          + 'nama donatur diambil dari uraian setelah dibuang ekor jenis dananya. '
          + 'Transaksi KLL/ULL tercatat atas nama layanannya.'
          + ((res.bedaDana || 0) ? ' <b style="color:var(--red)">' + res.bedaDana + ' baris</b> menulis jenis dana berbeda dengan akun kreditnya — ditandai di bawah.' : '')
          + '</div>';
        h += '<div style="margin-bottom:12px;font-weight:600;font-size:13.5px">' +
          'Analisis Jurnal selesai: <span style="color:var(--green)">' + totalValid + ' Baris Valid</span> (Penghimpunan: ' + res.himpunValid.length + ', Pentasyarufan: ' + res.salurValid.length + '), ' +
          '<span style="color:var(--red)">' + totalInvalid + ' Baris Tidak Valid</span> (diabaikan)' +
          '</div>';
          
        h += '<h4 style="margin:12px 0 6px;color:var(--green);font-family:var(--head)">Penghimpunan (Penerimaan)</h4>';
        if (res.himpunValid.length === 0) {
          h += '<div class="muted" style="padding:8px;font-size:12px">Tidak ada data penghimpunan.</div>';
        } else {
          h += '<table style="font-size:11.5px;width:100%;border-collapse:collapse;margin-bottom:14px" class="table-wrap"><thead><tr>' +
            '<th>Tgl</th><th>Donatur</th><th>Jenis / Pilar</th><th>Akun Kredit</th><th>Jumlah</th><th>Metode</th>' +
            '</tr></thead><tbody>';
          res.himpunValid.forEach(function(r, idx) {
            var dupWarn = r.isDuplicate ? '<div style="margin-top:4px"><label style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--red);cursor:pointer;font-weight:700"><input type="checkbox" class="import-dup-chk" data-type="himpun" data-idx="' + idx + '" style="width:14px;height:14px;cursor:pointer;accent-color:var(--red)"> ⚠️ Transaksi Serupa Ada (Centang jika ingin tetap simpan)</label></div>' : '';
            var rowBg = r.isDuplicate ? ' style="background:rgba(239,68,68,0.08);color:var(--red)"' : '';
            var bedaWarn = r.bedaDana ? '<div style="margin-top:3px;font-size:10.5px;color:var(--amber);font-weight:700">⚠️ Uraian menyebut jenis dana lain — mengikuti akun kredit</div>' : '';
            h += '<tr' + rowBg + '>' +
              '<td>' + esc(r.tanggal) + '</td>' +
              '<td><b>' + esc(r.namaDonatur) + '</b>' + dupWarn + bedaWarn + '</td>' +
              '<td>' + esc(r.subJenis + (r.pilar ? ' / ' + r.pilar : '') + (r.program ? ' · ' + r.program : '')) + '</td>' +
              '<td class="muted">' + esc(r.akunKredit || '-') + '</td>' +
              '<td class="jnum" style="font-weight:600;color:' + (r.isDuplicate ? 'var(--red)' : 'var(--green)') + '">' + rp(r.jumlah) + '</td>' +
              '<td>' + esc(r.metode) + '</td>' +
              '</tr>';
          });
          h += '</tbody></table>';
        }
        
        h += '<h4 style="margin:12px 0 6px;color:var(--amber);font-family:var(--head)">Pentasyarufan (Penyaluran / Operasional)</h4>';
        if (res.salurValid.length === 0) {
          h += '<div class="muted" style="padding:8px;font-size:12px">Tidak ada data pentasyarufan.</div>';
        } else {
          h += '<table style="font-size:11.5px;width:100%;border-collapse:collapse" class="table-wrap"><thead><tr>' +
            '<th>Tgl</th><th>Penerima</th><th>Program</th><th>Jumlah</th><th>Metode</th><th>FR</th>' +
            '</tr></thead><tbody>';
          res.salurValid.forEach(function(r, idx) {
            var dupWarn = r.isDuplicate ? '<div style="margin-top:4px"><label style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--red);cursor:pointer;font-weight:700"><input type="checkbox" class="import-dup-chk" data-type="salur" data-idx="' + idx + '" style="width:14px;height:14px;cursor:pointer;accent-color:var(--red)"> ⚠️ Transaksi Serupa Ada (Centang jika ingin tetap simpan)</label></div>' : '';
            var rowBg = r.isDuplicate ? ' style="background:rgba(239,68,68,0.08);color:var(--red)"' : '';
            h += '<tr' + rowBg + '>' +
              '<td>' + esc(r.tanggal) + '</td>' +
              '<td><b>' + esc(r.namaPenerima) + '</b>' + dupWarn + '</td>' +
              '<td>' + esc(r.program) + '</td>' +
              '<td style="font-weight:600;color:' + (r.isDuplicate ? 'var(--red)' : 'var(--amber)') + '">' + rp(r.jumlah) + '</td>' +
              '<td>' + esc(r.metode) + '</td>' +
              '<td class="muted">' + esc(cleanFR(r.fundraising)) + '</td>' +
              '</tr>';
          });
          h += '</tbody></table>';
        }
        
        el('importSimpanBtn').classList.remove('hidden');
        el('importSimpanBtn').textContent = 'Simpan Data Jurnal';
        el('importPreview').innerHTML = h;
      } else {
        IMPORT_TEMP_ROWS = res.valid;
        var h = '<div style="margin-bottom:10px;font-weight:600;font-size:13.5px">' +
          'Analisis selesai: <span style="color:var(--green)">' + res.valid.length + ' Baris Valid</span>, ' +
          '<span style="color:var(--red)">' + res.invalid.length + ' Baris Tidak Valid</span> (diabaikan)' +
          '</div>';
        /* Format buku kas: jelaskan baris apa saja yang sengaja tidak diimpor. */
        if (res.isBukuKas) {
          h = '<div class="imp-note">Terbaca sebagai <b>buku kas</b>. '
            + 'Nominal diambil dari kolom <b>Debet</b>; '
            + '<b>' + (res.dilewatiSetor || 0) + '</b> baris setor tunai (nominal di kolom Kredit) dilewati'
            + ((res.dilewatiKosong || 0) ? ', ' + res.dilewatiKosong + ' baris tanpa nominal diabaikan' : '')
            + '. Fundraising hanya dipakai untuk transaksi tingkat daerah — transaksi KLL/ULL dicatat atas nama layanannya.'
            + '</div>' + h;
        }
        
        if (res.valid.length === 0) {
          h += '<div class="muted" style="text-align:center;padding:12px;border:1px dashed var(--border);border-radius:10px">Tidak ada baris valid yang ditemukan. Periksa apakah nama kolom sesuai (Tanggal, Nama, Jumlah, dll.).</div>';
          el('importSimpanBtn').classList.add('hidden');
        } else {
          h += '<table style="font-size:12px;width:100%;border-collapse:collapse" class="table-wrap"><thead><tr>' +
            '<th>Tgl</th>' +
            '<th>' + (IMPORT_TEMP_TYPE === 'himpun' ? 'Donatur' : 'Penerima') + '</th>' +
            '<th>Jenis / Pilar</th>' +
            '<th>Jumlah</th>' +
            '<th>FR</th>' +
            '</tr></thead><tbody>';
          
          res.valid.forEach(function(r, idx) {
            var name = IMPORT_TEMP_TYPE === 'himpun' ? r.namaDonatur : r.namaPenerima;
            var cat = IMPORT_TEMP_TYPE === 'himpun' ? (r.jenisDana + (r.pilar ? ' / ' + r.pilar : '')) : r.ashnaf;
            var dupWarn = r.isDuplicate ? '<div style="margin-top:4px"><label style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--red);cursor:pointer;font-weight:700"><input type="checkbox" class="import-dup-chk" data-type="regular" data-idx="' + idx + '" style="width:14px;height:14px;cursor:pointer;accent-color:var(--red)"> ⚠️ Transaksi Serupa Ada (Centang jika ingin tetap simpan)</label></div>' : '';
            var rowBg = r.isDuplicate ? ' style="background:rgba(239,68,68,0.08);color:var(--red)"' : '';
            h += '<tr' + rowBg + '>' +
              '<td>' + esc(r.tanggal) + '</td>' +
              '<td><b>' + esc(name) + '</b>' + dupWarn + '</td>' +
              '<td>' + esc(cat) + '</td>' +
              '<td style="font-weight:600;color:' + (r.isDuplicate ? 'var(--red)' : 'var(--green)') + '">' + rp(r.jumlah) + '</td>' +
              '<td class="muted">' + esc(cleanFR(r.fundraising)) + '</td>' +
              '</tr>';
          });
          h += '</tbody></table>';
          
          el('importSimpanBtn').classList.remove('hidden');
          el('importSimpanBtn').textContent = 'Simpan Data';
        }
        el('importPreview').innerHTML = h;
      }
    } else {
      el('importPreview').innerHTML = '<div style="color:var(--red);font-weight:600;text-align:center;padding:10px">' + esc(res.message || 'Gagal menganalisis file') + '</div>';
    }
  }).catch(function(e) {
    btn.disabled = false;
    btn.textContent = 'Tarik & Analisis Data';
    el('importPreview').innerHTML = '<div style="color:var(--red);font-weight:600;text-align:center;padding:10px">' + esc(e.message || e) + '</div>';
  });
}

function simpanImportData() {
  var isJurnal = window.IMPORT_TEMP_IS_JURNAL;
  var rowsHimpun = isJurnal ? window.IMPORT_TEMP_HIMPUN_ROWS : IMPORT_TEMP_ROWS;
  var rowsSalur = isJurnal ? window.IMPORT_TEMP_SALUR_ROWS : [];
  
  if (!rowsHimpun.length && !rowsSalur.length) return;
  
  if (rowsHimpun && rowsHimpun.length) {
    if (isJurnal) {
      rowsHimpun = rowsHimpun.filter(function(r, idx) {
        if (r.isDuplicate) {
          var chk = document.querySelector('input.import-dup-chk[data-type="himpun"][data-idx="' + idx + '"]');
          return chk && chk.checked;
        }
        return true;
      });
    } else if (IMPORT_TEMP_TYPE === 'himpun') {
      rowsHimpun = rowsHimpun.filter(function(r, idx) {
        if (r.isDuplicate) {
          var chk = document.querySelector('input.import-dup-chk[data-type="regular"][data-idx="' + idx + '"]');
          return chk && chk.checked;
        }
        return true;
      });
    }
  }
  
  if (rowsSalur && rowsSalur.length) {
    if (isJurnal) {
      rowsSalur = rowsSalur.filter(function(r, idx) {
        if (r.isDuplicate) {
          var chk = document.querySelector('input.import-dup-chk[data-type="salur"][data-idx="' + idx + '"]');
          return chk && chk.checked;
        }
        return true;
      });
    } else if (IMPORT_TEMP_TYPE === 'salur') {
      rowsSalur = rowsSalur.filter(function(r, idx) {
        if (r.isDuplicate) {
          var chk = document.querySelector('input.import-dup-chk[data-type="regular"][data-idx="' + idx + '"]');
          return chk && chk.checked;
        }
        return true;
      });
    }
  }
  
  if (!rowsHimpun.length && !rowsSalur.length) {
    return toast('Tidak ada data baru/terverifikasi untuk disimpan', true);
  }
  
  var defaultFR = el('import_default_fundraising') ? el('import_default_fundraising').value.trim() : '';
  var defaultMetode = el('import_default_metode') ? el('import_default_metode').value : '';
  var defaultRekeningId = el('import_default_rekening') ? el('import_default_rekening').value : '';
  
  if (rowsHimpun && rowsHimpun.length) {
    rowsHimpun.forEach(function(r) {
      if (defaultFR && !r.fundraising) r.fundraising = defaultFR;
      if (defaultMetode) r.metode = defaultMetode;
      if (defaultRekeningId && CACHE.rekening) {
        var rObj = CACHE.rekening.find(function(x) { return x.id === defaultRekeningId; });
        if (rObj) {
          r.rekeningId = rObj.id;
          r.bank = rObj.namaBank + ' - ' + rObj.nomor + ' (' + rObj.atasNama + ')';
        }
      }
    });
  }
  
  if (rowsSalur && rowsSalur.length) {
    rowsSalur.forEach(function(r) {
      if (defaultFR && !r.fundraising) r.fundraising = defaultFR;
      if (defaultMetode) r.metode = defaultMetode;
      if (defaultRekeningId && CACHE.rekening) {
        var rObj = CACHE.rekening.find(function(x) { return x.id === defaultRekeningId; });
        if (rObj) {
          r.rekeningId = rObj.id;
          r.bank = rObj.namaBank + ' - ' + rObj.nomor + ' (' + rObj.atasNama + ')';
        }
      }
    });
  }
  
  var btn = el('importSimpanBtn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  
  if (isJurnal) {
    var p1 = rowsHimpun.length ? gas('apiSaveImportedData')(TOKEN, rowsHimpun, 'himpun') : Promise.resolve({ count: 0 });
    var p2 = rowsSalur.length ? gas('apiSaveImportedData')(TOKEN, rowsSalur, 'salur') : Promise.resolve({ count: 0 });
    
    Promise.all([p1, p2]).then(function(res) {
      closeModal();
      var totalSaved = (res[0].count || 0) + (res[1].count || 0);
      toast(totalSaved + ' data Jurnal berhasil diimpor!');
      if (IMPORT_TEMP_TYPE === 'himpun') viewPenghimpunan();
      else viewPentasyarufan();
    }).catch(function(e) {
      btn.disabled = false;
      btn.textContent = 'Simpan Ulang';
      handleErr(e);
    });
  } else {
    gas('apiSaveImportedData')(TOKEN, rowsHimpun, IMPORT_TEMP_TYPE).then(function(res) {
      closeModal();
      toast(res.count + ' data berhasil diimpor!');
      if (IMPORT_TEMP_TYPE === 'himpun') viewPenghimpunan();
      else viewPentasyarufan();
    }).catch(function(e) {
      btn.disabled = false;
      btn.textContent = 'Simpan Ulang';
      handleErr(e);
    });
  }
}

function openDeleteByDateModal(type) {
  var title = type === 'himpun' ? 'Hapus Penghimpunan via Rentang Tanggal' : 'Hapus Pentasyarufan via Rentang Tanggal';
  var b = '<p class="muted" style="margin-bottom:12px;color:var(--red);font-size:12.5px;line-height:1.5">⚠️ PERINGATAN: Tindakan ini akan menghapus semua data transaksi secara permanen pada rentang tanggal yang dipilih.</p>' +
    '<div class="row">' +
    '<div class="field"><label>Tanggal Mulai *</label><input type="date" id="del_start_date"></div>' +
    '<div class="field"><label>Tanggal Selesai *</label><input type="date" id="del_end_date"></div>' +
    '</div>';
  
  var f = '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
    '<button class="btn btn-primary" style="background:var(--red);border-color:var(--red)" onclick="eksekusiHapusRentangTanggal(\'' + type + '\')">Ya, Hapus Data</button>';
  
  openModal(title, b, f);
}

function eksekusiHapusRentangTanggal(type) {
  var start = el('del_start_date').value;
  var end = el('del_end_date').value;
  if (!start || !end) return toast('Tanggal mulai dan selesai wajib diisi', true);
  
  uiConfirm('Apakah Anda benar-benar yakin ingin menghapus semua data transaksi dari tanggal ' + fdate(start) + ' sampai ' + fdate(end) + '?').then(function(ok) {
    if (!ok) return;
    
    var body = el('modalBody');
    var footer = el('modalFoot');
    body.innerHTML = '<div style="text-align:center;padding:30px 0">' + BOXES_SPINNER + '<div class="muted" style="margin-top:12px">Sedang menghapus data transaksi... Mohon tunggu.</div></div>';
    footer.innerHTML = '';
    
    gas('apiDeleteByDateRange')(TOKEN, type, start, end).then(function(res) {
      closeModal();
      uiAlert(res.count + ' data transaksi berhasil dihapus!', 'Berhasil').then(function() {
        if (type === 'himpun') viewPenghimpunan();
        else viewPentasyarufan();
      });
    }).catch(function(e) {
      closeModal();
      handleErr(e);
    });
  });
}

/* ================================================================
   DAFTAR PILIHAN (dropdown) — dipasang di <body>, bukan di dalam kartu
   ----------------------------------------------------------------
   Sebelumnya daftar pilihan diletakkan di dalam kartu induknya dengan
   position:absolute. Kartu Laporan (.lap-panel) memakai overflow:hidden,
   jadi daftarnya terpotong di tepi kartu — hanya satu dua pilihan yang
   terlihat dan sulit dipilih. Sekarang daftarnya dipindah ke <body>
   dengan position:fixed, diikatkan ke tombolnya lewat koordinat layar,
   sehingga tidak ada pembungkus yang bisa memotongnya. Tingginya juga
   menyesuaikan ruang yang benar-benar tersedia, dan membuka ke atas
   bila ruang di bawah sempit.
   ================================================================ */
var _POP_DAFTAR = [];

function popUkur(btn, pop){
  var r = btn.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  /* Kalender tidak boleh dipotong lalu digulir — bentuknya harus utuh,
     jadi tingginya dibiarkan apa adanya dan letaknya yang digeser. */
  var kaku = pop.classList.contains('datepicker-enhanced-popover');

  var lebar = Math.min(Math.max(r.width, kaku ? 268 : 210), vw - 16);
  var kiri  = Math.min(Math.max(8, r.left), Math.max(8, vw - lebar - 8));

  pop.style.position = 'fixed';
  pop.style.width = lebar + 'px';
  pop.style.left = kiri + 'px';
  pop.style.right = 'auto';
  pop.style.margin = '0';

  if (kaku){
    pop.style.setProperty('max-height', 'none', 'important');
    var perlu = Math.min(pop.offsetHeight || 340, vh - 16);
    var atas = r.bottom + 6;
    if (atas + perlu > vh - 8) atas = r.top - 6 - perlu;        // coba buka ke atas
    if (atas < 8) atas = Math.max(8, vh - perlu - 8);           // masih mepet: rapatkan ke tepi layar
    pop.style.bottom = 'auto';
    pop.style.top = atas + 'px';
    pop.style.transformOrigin = (atas < r.top ? 'bottom left' : 'top left');
    return;
  }

  var ruangBawah = vh - r.bottom - 14;
  var ruangAtas  = r.top - 14;
  var keAtas = (ruangBawah < 240 && ruangAtas > ruangBawah);
  var tinggi = Math.max(150, Math.min(420, keAtas ? ruangAtas : ruangBawah));

  pop.style.setProperty('max-height', tinggi + 'px', 'important');
  if (keAtas){
    pop.style.top = 'auto';
    pop.style.bottom = (vh - r.top + 6) + 'px';
    pop.style.transformOrigin = 'bottom left';
  } else {
    pop.style.bottom = 'auto';
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.transformOrigin = 'top left';
  }

  var cari = pop.querySelector('.dropdown-search');
  var sec  = pop.querySelector('.dropdown-section');
  if (sec) sec.style.setProperty('max-height', Math.max(90, tinggi - (cari ? 52 : 10)) + 'px', 'important');
}

function popTutupSemua(kecuali){
  document.querySelectorAll('.select-enhanced-popover, .datepicker-enhanced-popover').forEach(function(p){
    if (p !== kecuali) p.classList.add('hidden');
  });
}

function popDaftarkan(btn, pop){
  var ada = false;
  _POP_DAFTAR.forEach(function(x){ if (x.pop === pop) ada = true; });
  if (!ada) _POP_DAFTAR.push({ btn: btn, pop: pop });
}

function popBuka(btn, pop){
  if (pop.parentNode !== document.body) document.body.appendChild(pop);
  popDaftarkan(btn, pop);
  pop.classList.remove('hidden');
  popUkur(btn, pop);
}

/* Buang daftar yatim: tombol pemiliknya sudah hilang dari halaman
   (mis. panel di-render ulang) supaya tidak menumpuk di <body>. */
function popBersihkan(){
  for (var i = _POP_DAFTAR.length - 1; i >= 0; i--){
    var x = _POP_DAFTAR[i];
    if (!document.body.contains(x.btn)){
      if (x.pop.parentNode) x.pop.parentNode.removeChild(x.pop);
      _POP_DAFTAR.splice(i, 1);
    }
  }
}

(function(){
  function ikuti(){
    for (var i = _POP_DAFTAR.length - 1; i >= 0; i--){
      var x = _POP_DAFTAR[i];
      if (!document.body.contains(x.btn)) continue;
      if (!x.pop.classList.contains('hidden')) popUkur(x.btn, x.pop);
    }
  }
  window.addEventListener('scroll', ikuti, true);
  window.addEventListener('resize', ikuti);
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') popTutupSemua(null);
  });
})();

/* Sorot pilihan dengan panah atas/bawah lalu Enter. */
function popSorot(pop, arah){
  var items = [].slice.call(pop.querySelectorAll('.dropdown-item')).filter(function(it){ return it.style.display !== 'none'; });
  if (!items.length) return;
  var kini = -1;
  items.forEach(function(it, i){ if (it.classList.contains('sorot')) kini = i; });
  if (kini < 0) items.forEach(function(it, i){ if (it.classList.contains('active')) kini = i; });
  var next = kini + arah;
  if (next < 0) next = items.length - 1;
  if (next >= items.length) next = 0;
  items.forEach(function(it){ it.classList.remove('sorot'); });
  items[next].classList.add('sorot');
  items[next].scrollIntoView({ block: 'nearest' });
}
function popPilihSorotan(pop){
  var it = pop.querySelector('.dropdown-item.sorot') ||
           [].slice.call(pop.querySelectorAll('.dropdown-item')).filter(function(x){ return x.style.display !== 'none'; })[0];
  if (it) it.click();
}

function enhanceSelects(containerId) {
  var parent = containerId ? (typeof containerId === 'string' ? el(containerId) : containerId) : document;
  if (!parent) return;

  popBersihkan();

  var wrappers = parent.querySelectorAll('.select-enhanced');
  wrappers.forEach(function(w) {
    var sel = w.nextSibling;
    if (!sel || sel.tagName !== 'SELECT') {
      if (w.__pop && w.__pop.parentNode) w.__pop.parentNode.removeChild(w.__pop);
      w.remove();
    }
  });

  var selects = parent.querySelectorAll('select');
  selects.forEach(function(sel) {
    if (sel.id === 'f_rekeningId' && sel.options.length <= 1 && sel.options[0] && sel.options[0].value === '') {
      return;
    }

    var prev = sel.previousSibling;
    if (prev && prev.classList && prev.classList.contains('select-enhanced')) {
      var popLama = prev.__pop;
      var popItems = popLama ? popLama.querySelectorAll('.dropdown-item') : [];
      if (popLama && popItems.length === sel.options.length) {
        /* isi masih sama — cukup segarkan label & tanda pilihan */
        var btnText = prev.querySelector('.select-enhanced-btn span');
        if (btnText && sel.options[sel.selectedIndex]) {
          btnText.textContent = sel.options[sel.selectedIndex].textContent;
        }
        popItems.forEach(function(item, idx) {
          item.classList.toggle('active', sel.selectedIndex === idx);
          item.classList.remove('sorot');
        });
        return;
      }
      if (popLama && popLama.parentNode) popLama.parentNode.removeChild(popLama);
      prev.remove();
    }

    sel.style.display = 'none';

    var container = document.createElement('div');
    container.className = 'custom-dropdown select-enhanced';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-dropdown select-enhanced-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');

    var btnText = document.createElement('span');
    btnText.className = 'sel-teks';
    btnText.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '- pilih -';
    btn.appendChild(btnText);

    var chevron = document.createElement('span');
    chevron.className = 'sel-chev';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    btn.appendChild(chevron);

    var popover = document.createElement('div');
    popover.className = 'dropdown-popover select-enhanced-popover sel-pop hidden';
    popover.setAttribute('role', 'listbox');

    var searchInput = null;
    if (sel.options.length > 6 || sel.id === 'f_rekeningId') {
      var searchDiv = document.createElement('div');
      searchDiv.className = 'dropdown-search';
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Cari…';
      searchInput.className = 'dropdown-search-input';
      searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
      searchDiv.appendChild(searchInput);
      popover.appendChild(searchDiv);
    }

    var section = document.createElement('div');
    section.className = 'dropdown-section';

    for (var i = 0; i < sel.options.length; i++) {
      var opt = sel.options[i];
      var item = document.createElement('div');
      item.className = 'dropdown-item' + (sel.selectedIndex === i ? ' active' : '');
      item.setAttribute('role', 'option');
      item.textContent = opt.textContent;
      item.setAttribute('data-value', opt.value);

      item.addEventListener('click', (function(oIdx, text) {
        return function(e) {
          e.stopPropagation();
          sel.selectedIndex = oIdx;
          btnText.textContent = text;
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, true);
          sel.dispatchEvent(evt);
          if (sel.onchange) sel.onchange();
          popover.classList.add('hidden');
          btn.setAttribute('aria-expanded', 'false');
          section.querySelectorAll('.dropdown-item').forEach(function(x, k){
            x.classList.toggle('active', k === oIdx);
            x.classList.remove('sorot');
          });
        };
      })(i, opt.textContent));

      section.appendChild(item);
    }

    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        var q = e.target.value.toLowerCase().trim();
        var terlihat = 0;
        section.querySelectorAll('.dropdown-item').forEach(function(item) {
          var cocok = item.textContent.toLowerCase().indexOf(q) >= 0;
          item.style.display = cocok ? '' : 'none';
          item.classList.remove('sorot');
          if (cocok) terlihat++;
        });
        var kosong = popover.querySelector('.dropdown-kosong');
        if (!terlihat) {
          if (!kosong) {
            kosong = document.createElement('div');
            kosong.className = 'dropdown-kosong';
            kosong.textContent = 'Tidak ada yang cocok';
            section.appendChild(kosong);
          }
          kosong.style.display = '';
        } else if (kosong) { kosong.style.display = 'none'; }
      });
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); popSorot(popover, 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); popSorot(popover, -1); }
        else if (e.key === 'Enter') { e.preventDefault(); popPilihSorotan(popover); }
      });
    }

    popover.appendChild(section);
    container.appendChild(btn);
    container.__pop = popover;

    sel.parentNode.insertBefore(container, sel);

    btn.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (popover.classList.contains('hidden')) btn.click();
        else popSorot(popover, e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && !popover.classList.contains('hidden')) {
        e.preventDefault(); popPilihSorotan(popover);
      }
    });

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var tertutup = popover.classList.contains('hidden');
      popTutupSemua(popover);
      if (!tertutup) {
        popover.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      popBuka(btn, popover);
      btn.setAttribute('aria-expanded', 'true');
      section.querySelectorAll('.dropdown-item').forEach(function(x){
        x.classList.remove('sorot');
        x.style.display = '';
      });
      var kosong = popover.querySelector('.dropdown-kosong');
      if (kosong) kosong.style.display = 'none';
      /* pilihan yang sedang aktif ditaruh di tengah daftar supaya jelas
         masih ada pilihan di atas maupun di bawahnya */
      var aktif = section.querySelector('.dropdown-item.active');
      if (aktif) aktif.scrollIntoView({ block: 'center' });
      if (searchInput) {
        searchInput.value = '';
        setTimeout(function(){ searchInput.focus(); }, 30);
      }
    });
  });
}

/* v8: dulu blok ini memindai SELURUH DOM tiap 250ms (4x per detik, selamanya)
   walau tidak ada yang berubah — sumber jank yang konstan, terasa saat mengetik
   dan scroll. Sekarang scan hanya jalan kalau DOM benar-benar berubah:
   MutationObserver menandai "kotor", tick 800ms yang mengerjakannya, observer
   dilepas selama proses agar perubahan buatannya sendiri tidak memicu loop. */
var __enhDirty = true, __enhObs = null;
function runEnhancers() {
  if (document.hidden || !__enhDirty) return;
  __enhDirty = false;
  if (__enhObs) __enhObs.disconnect();
  try {
    enhanceSelects();
    enhanceDatePickers();
  } catch(e) {}
  if (__enhObs && document.body) {
    __enhObs.observe(document.body, { childList: true, subtree: true });
  }
}
(function() {
  function start() {
    __enhObs = new MutationObserver(function() { __enhDirty = true; });
    __enhObs.observe(document.body, { childList: true, subtree: true });
    runEnhancers();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  setInterval(runEnhancers, 800);
  // jaring pengaman: paksa satu scan tiap 5 detik kalau ada perubahan yang terlewat
  setInterval(function() { __enhDirty = true; }, 5000);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) { __enhDirty = true; runEnhancers(); }
  });
})();

function formatIndoDate(dStr) {
  if (!dStr) return '- pilih tanggal -';
  var parts = dStr.split('T')[0].split('-');
  if (parts.length === 3) {
    var day = Number(parts[2]);
    var month = Number(parts[1]);
    var year = Number(parts[0]);
    return day + ' ' + (BULAN[month] || '') + ' ' + year;
  }
  return dStr;
}

function renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect) {
  var viewYear = currentViewDate.getFullYear();
  var viewMonth = currentViewDate.getMonth();
  
  var selected = selectedDateStr ? new Date(selectedDateStr) : null;
  
  var header = document.createElement('div');
  header.className = 'calendar-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '10px 14px';
  header.style.borderBottom = '1px solid var(--border)';
  
  var prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'calendar-nav-btn';
  prevBtn.innerHTML = '‹';
  prevBtn.onclick = function(e) {
    e.stopPropagation();
    currentViewDate.setMonth(viewMonth - 1);
    rebuild();
  };
  
  var title = document.createElement('div');
  title.className = 'calendar-title';
  title.style.fontWeight = '700';
  title.style.fontSize = '13.5px';
  title.textContent = (BULAN[viewMonth + 1] || '') + ' ' + viewYear;
  title.style.cursor = 'pointer';
  title.onclick = function(e) {
    e.stopPropagation();
    renderYearPicker(container, selectedDateStr, currentViewDate, onSelect);
  };
  
  var nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'calendar-nav-btn';
  nextBtn.innerHTML = '›';
  nextBtn.onclick = function(e) {
    e.stopPropagation();
    currentViewDate.setMonth(viewMonth + 1);
    rebuild();
  };
  
  header.appendChild(prevBtn);
  header.appendChild(title);
  header.appendChild(nextBtn);
  
  var grid = document.createElement('div');
  grid.className = 'calendar-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '4px';
  grid.style.padding = '10px';
  
  var weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  weekdays.forEach(function(day) {
    var cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = day;
    cell.style.textAlign = 'center';
    cell.style.fontSize = '11px';
    cell.style.fontWeight = '600';
    cell.style.color = 'var(--muted)';
    cell.style.padding = '4px 0';
    grid.appendChild(cell);
  });
  
  var firstDayIdx = new Date(viewYear, viewMonth, 1).getDay();
  var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  
  var prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  for (var i = firstDayIdx - 1; i >= 0; i--) {
    var cell = document.createElement('div');
    cell.className = 'calendar-cell calendar-cell-muted';
    cell.textContent = prevMonthDays - i;
    cell.style.textAlign = 'center';
    cell.style.padding = '6px 0';
    cell.style.fontSize = '12px';
    cell.style.opacity = '0.3';
    grid.appendChild(cell);
  }
  
  for (var day = 1; day <= daysInMonth; day++) {
    var cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.textContent = day;
    cell.style.textAlign = 'center';
    cell.style.padding = '6px 0';
    cell.style.fontSize = '12px';
    cell.style.borderRadius = '6px';
    cell.style.cursor = 'pointer';
    cell.style.fontWeight = '500';
    cell.style.color = 'var(--text)';
    
    var cellDateStr = viewYear + '-' + ('0' + (viewMonth + 1)).slice(-2) + '-' + ('0' + day).slice(-2);
    
    if (selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day) {
      cell.className += ' calendar-cell-selected';
      cell.style.background = 'var(--accent)';
      cell.style.color = '#fff';
      cell.style.fontWeight = '700';
    }
    
    cell.onclick = (function(dStr) {
      return function(e) {
        e.stopPropagation();
        onSelect(dStr);
      };
    })(cellDateStr);
    
    grid.appendChild(cell);
  }
  
  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(grid);
  
  function rebuild() {
    renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect);
  }
}

function renderYearPicker(container, selectedDateStr, currentViewDate, onSelect) {
  var header = document.createElement('div');
  header.className = 'calendar-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '10px 14px';
  header.style.borderBottom = '1px solid var(--border)';
  
  var title = document.createElement('div');
  title.style.fontWeight = '700';
  title.style.fontSize = '13.5px';
  title.textContent = 'Pilih Tahun';
  
  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'calendar-nav-btn';
  backBtn.innerHTML = '←';
  backBtn.onclick = function(e) {
    e.stopPropagation();
    renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect);
  };
  
  header.appendChild(title);
  header.appendChild(backBtn);
  
  var grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
  grid.style.gap = '8px';
  grid.style.padding = '12px';
  grid.style.maxHeight = '180px';
  grid.style.overflowY = 'auto';
  
  var curYear = new Date().getFullYear();
  for (var y = curYear + 5; y >= curYear - 10; y--) {
    var cell = document.createElement('div');
    cell.textContent = y;
    cell.style.textAlign = 'center';
    cell.style.padding = '8px 0';
    cell.style.fontSize = '13px';
    cell.style.cursor = 'pointer';
    cell.style.borderRadius = '6px';
    cell.style.color = 'var(--text)';
    
    if (y === currentViewDate.getFullYear()) {
      cell.style.background = 'var(--accent-soft)';
      cell.style.color = 'var(--accent-d)';
      cell.style.fontWeight = '700';
    }
    
    cell.onclick = (function(yr) {
      return function(e) {
        e.stopPropagation();
        currentViewDate.setFullYear(yr);
        renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect);
      };
    })(y);
    
    grid.appendChild(cell);
  }
  
  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(grid);
}

function enhanceDatePickers(containerId) {
  var parent = containerId ? (typeof containerId === 'string' ? el(containerId) : containerId) : document;
  if (!parent) return;
  
  var wrappers = parent.querySelectorAll('.datepicker-enhanced');
  wrappers.forEach(function(w) {
    var inp = w.nextSibling;
    if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'date') {
      if (w.__pop && w.__pop.parentNode) w.__pop.parentNode.removeChild(w.__pop);
      w.remove();
    }
  });

  var dateInputs = parent.querySelectorAll('input[type="date"]');
  dateInputs.forEach(function(inp) {
    var prev = inp.previousSibling;
    if (prev && prev.classList && prev.classList.contains('datepicker-enhanced')) {
      var btnText = prev.querySelector('.datepicker-enhanced-btn span');
      if (btnText) {
        btnText.textContent = formatIndoDate(inp.value);
      }
      return;
    }
    
    inp.style.display = 'none';
    
    var container = document.createElement('div');
    container.className = 'custom-dropdown datepicker-enhanced';
    container.__pop = null;
    container.style.width = '100%';
    
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-dropdown datepicker-enhanced-btn';
    btn.style.width = '100%';
    btn.style.justifyContent = 'space-between';
    
    btn.style.background = 'var(--surface)';
    btn.style.border = '1px solid var(--border)';
    btn.style.color = 'var(--text)';
    btn.style.padding = '10px 12px';
    btn.style.borderRadius = '10px';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '500';
    btn.style.minWidth = '0';
    
    var btnText = document.createElement('span');
    btnText.textContent = formatIndoDate(inp.value);
    btn.appendChild(btnText);
    
    var calendarIcon = document.createElement('span');
    calendarIcon.innerHTML = '📅';
    calendarIcon.style.fontSize = '13px';
    calendarIcon.style.opacity = '0.6';
    btn.appendChild(calendarIcon);
    
    var popover = document.createElement('div');
    popover.className = 'dropdown-popover datepicker-enhanced-popover hidden';
    popover.style.width = '260px';
    popover.style.left = '0';
    popover.style.right = 'auto';
    popover.style.boxSizing = 'border-box';
    popover.style.padding = '0';
    popover.style.background = 'var(--surface)';
    popover.style.border = '1px solid var(--border)';
    
    container.appendChild(btn);
    container.__pop = popover;

    inp.parentNode.insertBefore(container, inp);

    var currentViewDate = inp.value ? new Date(inp.value) : new Date();
    
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isHidden = popover.classList.contains('hidden');
      document.querySelectorAll('.datepicker-enhanced-popover, .select-enhanced-popover').forEach(function(p) {
        p.classList.add('hidden');
      });
      if (isHidden) {
        popBuka(btn, popover);   /* kalender ikut dipasang di <body> agar tidak terpotong kartu */
        renderCalendarGrid(popover, inp.value, currentViewDate, function(selectedDateStr) {
          inp.value = selectedDateStr;
          btnText.textContent = formatIndoDate(selectedDateStr);
          
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, true);
          inp.dispatchEvent(evt);
          if (inp.onchange) inp.onchange();
          
          popover.classList.add('hidden');
        });
        /* Tinggi kalender baru diketahui setelah gridnya digambar, dan berubah
           lagi saat ganti bulan (5 atau 6 baris), jadi letaknya dihitung ulang
           supaya kotaknya selalu utuh di layar. */
        popUkur(btn, popover);
        if (!popover.__ukurTerpasang) {
          popover.__ukurTerpasang = true;
          popover.addEventListener('click', function(){
            setTimeout(function(){
              if (!popover.classList.contains('hidden')) popUkur(btn, popover);
            }, 0);
          });
        }
      }
    });
  });
}

/* Klik di luar menutup daftar. Daftar sekarang berada di <body>, jadi
   pengecekan tidak bisa lagi lewat .closest('.custom-dropdown') dari
   popovernya — yang diperiksa adalah letak klik itu sendiri. */
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('.select-enhanced-popover, .datepicker-enhanced-popover, .custom-dropdown')) return;
  popTutupSemua(null);
});

/* ============ MUTASI BANK ============ */
window.MUTASI_PARSED_ROWS = [];

function viewMutasi() {
  // tanpa spinner: konten lama tetap tampil meredup & blur sampai data tiba
  gas('apiListMutasi')(TOKEN).then(function(rows) {
    renderMutasi(rows);
  }).catch(handleErr);
}

function renderMutasi(rows) {
  var totalD = 0, totalK = 0;
  rows.forEach(function(r) {
    if (r.tipe === 'D') totalD += Number(r.nominal) || 0;
    else totalK += Number(r.nominal) || 0;
  });

  var h = '<div class="page-head">' +
    '  <div>' +
    '    <h2>Mutasi Rekening Bank</h2>' +
    '    <div class="desc">Riwayat transaksi mutasi bank terimpor untuk audit anti-duplikasi</div>' +
    '  </div>' +
    '  <button class="btn btn-primary" onclick="openImportMutasiModal()">📥 Import File Mutasi</button>' +
    '</div>';

  h += '<div class="stats" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))">' +
    '  <div class="stat"><div class="lbl">Total Penarikan (Debet)</div><div class="val text-danger" style="color:var(--red)">' + rp(totalD) + '</div></div>' +
    '  <div class="stat"><div class="lbl">Total Penerimaan (Kredit)</div><div class="val text-success" style="color:var(--green)">' + rp(totalK) + '</div></div>' +
    '  <div class="stat"><div class="lbl">Total Transaksi</div><div class="val">' + rows.length + ' Baris</div></div>' +
    '</div>';

  h += '<div class="table-wrap">' +
    '  <div class="toolbar">' +
    '    <div class="field" style="margin:0;flex:1"><input type="text" id="mutasi_search" placeholder="Cari deskripsi..." oninput="filterMutasiTable()" style="padding:6px 10px;font-size:12.5px"></div>' +
    '  </div>' +
    '  <div style="overflow:auto">' +
    '    <table id="mutasiTable">' +
    '      <thead>' +
    '        <tr>' +
    '          <th>Tanggal</th>' +
    '          <th>Keterangan / Deskripsi</th>' +
    '          <th>Tipe</th>' +
    '          <th>Nominal</th>' +
    '          <th>Tanggal Impor</th>' +
    '        </tr>' +
    '      </thead>' +
    '      <tbody>';

  if (rows.length === 0) {
    h += '<tr><td colspan="5"><div class="empty"><div class="big">⇄</div>Belum ada data mutasi terimpor. Silakan import berkas baru.</div></td></tr>';
  } else {
    rows.forEach(function(r) {
      var badge = r.tipe === 'D' ? '<span class="badge red">DEBET (Keluar)</span>' : '<span class="badge green">KREDIT (Masuk)</span>';
      var amtColor = r.tipe === 'D' ? 'color:var(--red)' : 'color:var(--green)';
      h += '<tr class="mutasi-row"><td>' + fdate(r.tanggal) + '</td><td><b>' + esc(r.deskripsi) + '</b></td><td>' + badge + '</td><td style="font-weight:700;' + amtColor + '">' + rp(r.nominal) + '</td><td class="muted">' + fdate(r.dibuat) + '</td></tr>';
    });
  }

  h += '      </tbody>' +
    '    </table>' +
    '  </div>' +
    '</div>';

  el('content').innerHTML = h;
}

function filterMutasiTable() {
  var q = el('mutasi_search').value.toLowerCase();
  var rows = document.querySelectorAll('.mutasi-row');
  rows.forEach(function(row) {
    var txt = row.textContent.toLowerCase();
    row.style.display = txt.indexOf(q) >= 0 ? '' : 'none';
  });
}

function openImportMutasiModal() {
  // Dynamically load mammoth, tesseract, and pdf.js if not already loaded
  if (!window.mammoth) {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    document.head.appendChild(s);
  }
  if (!window.pdfjsLib) {
    var s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    document.head.appendChild(s2);
  }
  if (!window.Tesseract) {
    var s3 = document.createElement('script');
    s3.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.5/dist/tesseract.min.js';
    document.head.appendChild(s3);
  }

  window.MUTASI_PARSED_ROWS = [];

  var rekList = CACHE.rekening || [];
  var rekOpts = rekList.map(function(r) {
    return '<option value="' + esc(r.id) + '">' + esc(r.namaBank + ' ' + r.nomor + ' (' + r.atasNama + ')') + '</option>';
  }).join('');

  var frList = window.FUNDRAISING_OPTIONS || ['Lazismu Daerah Bantul'];
  var frOpts = frList.map(function(f) {
    var val = typeof f === 'string' ? f : f.nama;
    return '<option value="' + esc(val) + '">' + esc(val) + '</option>';
  }).join('');

  var b = '<div class="card" style="margin-bottom:12px">' +
    '  <h3 style="margin-bottom:6px">Pilih Berkas Mutasi Bank</h3>' +
    '  <p class="muted" style="font-size:12.5px;margin-bottom:14px">Mendukung format berkas teks (.txt), CSV (.csv), PDF (.pdf), Word (.docx), Excel (.xlsx), atau Foto bukti/mutasi (.png, .jpg, .jpeg).</p>' +
    '  <div class="field">' +
    '    <input type="file" id="mutasi_file_input" accept=".txt,.csv,.pdf,.docx,.xlsx,.png,.jpg,.jpeg" onchange="processMutasiFile()" style="padding:10px">' +
    '  </div>' +
    '  <div class="row" style="display:flex;gap:10px;margin-top:10px">' +
    '    <div class="field" style="flex:1;margin:0"><label style="font-size:11.5px;font-weight:600;margin-bottom:4px">Default Rekening</label>' +
    '      <select id="import_default_rekening" style="padding:6px;font-size:12px;width:100%">' + rekOpts + '</select>' +
    '    </div>' +
    '    <div class="field" style="flex:1;margin:0"><label style="font-size:11.5px;font-weight:600;margin-bottom:4px">Default Fundraising</label>' +
    '      <select id="import_default_fundraising" style="padding:6px;font-size:12px;width:100%">' + frOpts + '</select>' +
    '    </div>' +
    '  </div>' +
    '</div>' +
    '<div id="mutasiParseStatus" style="font-weight:600;margin-bottom:8px"></div>' +
    '<div id="mutasiPreview" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface2)"></div>';

  var f = '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
    '<button class="btn btn-primary hidden" id="mutasiSimpanBtn" onclick="saveMutasiImport()">💾 Simpan Mutasi</button>';

  openModal('Import Mutasi Bank (Multi-format)', b, f);
}

function processMutasiFile() {
  var fileInp = el('mutasi_file_input');
  if (!fileInp || !fileInp.files.length) return;
  var file = fileInp.files[0];

  el('mutasiParseStatus').innerHTML = '⏳ Sedang memproses & mengekstrak data berkas...';
  el('mutasiPreview').innerHTML = '';
  el('mutasiSimpanBtn').classList.add('hidden');

  var reader = new FileReader();

  if (file.name.endsWith('.txt')) {
    reader.onload = function(e) {
      var text = e.target.result;
      handleMutasiTextParsed(text);
    };
    reader.readAsText(file);
  } 
  else if (file.name.endsWith('.csv')) {
    reader.onload = function(e) {
      var text = e.target.result;
      handleMutasiCSV(text);
    };
    reader.readAsText(file);
  } 
  else if (file.name.endsWith('.docx')) {
    reader.onload = function(e) {
      var arrayBuffer = e.target.result;
      window.mammoth.extractRawText({ arrayBuffer: arrayBuffer }).then(function(result) {
        handleMutasiTextParsed(result.value);
      }).catch(function(err) {
        el('mutasiParseStatus').innerHTML = '❌ Gagal membaca dokumen Word: ' + err.message;
      });
    };
    reader.readAsArrayBuffer(file);
  } 
  else if (file.name.endsWith('.pdf')) {
    reader.onload = function(e) {
      var typedarray = new Uint8Array(e.target.result);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      window.pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
        var maxPages = pdf.numPages;
        var countPromises = [];
        for (var j = 1; j <= maxPages; j++) {
          countPromises.push(pdf.getPage(j).then(function(page) {
            return page.getTextContent().then(function(textContent) {
              return textContent.items.map(function(item) {
                return item.str;
              }).join(' ');
            });
          }));
        }
        Promise.all(countPromises).then(function(texts) {
          handleMutasiTextParsed(texts.join('\n'));
        });
      }).catch(function(err) {
        el('mutasiParseStatus').innerHTML = '❌ Gagal membaca file PDF: ' + err.message;
      });
    };
    reader.readAsArrayBuffer(file);
  } 
  else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
    reader.onload = function(e) {
      try {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: 'array' });
        var sheetName = workbook.SheetNames[0];
        var sheet = workbook.Sheets[sheetName];
        var rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        var text = rows.map(function(r) { return r.join(' '); }).join('\n');
        handleMutasiTextParsed(text);
      } catch (err) {
        el('mutasiParseStatus').innerHTML = '❌ Gagal membaca Excel: ' + err.message;
      }
    };
    reader.readAsArrayBuffer(file);
  } 
  else if (file.type.startsWith('image/')) {
    reader.onload = function(e) {
      el('mutasiParseStatus').innerHTML = '⏳ Menjalankan OCR pada gambar (ini perlu waktu)...';
      window.Tesseract.recognize(e.target.result, 'ind', {
        logger: function(m) {
          if (m.status === 'recognizing') {
            el('mutasiParseStatus').innerHTML = '⏳ OCR Gambar: ' + Math.round(m.progress * 100) + '% selesai';
          }
        }
      }).then(function(result) {
        handleMutasiTextParsed(result.data.text);
      }).catch(function(err) {
        el('mutasiParseStatus').innerHTML = '❌ Gagal OCR Gambar: ' + err.message;
      });
    };
    reader.readAsDataURL(file);
  } else {
    el('mutasiParseStatus').innerHTML = '❌ Format berkas tidak didukung.';
  }
}

function handleMutasiTextParsed(text) {
  var extracted = extractMutasiFromText(text);
  window.MUTASI_PARSED_ROWS = extracted;

  if (extracted.length === 0) {
    el('mutasiParseStatus').innerHTML = '⚠️ Berhasil diproses, tetapi tidak menemukan baris mutasi rekening yang cocok.';
    el('mutasiPreview').innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted)">Teks Terbaca:<pre style="text-align:left;font-size:11px;margin-top:10px;overflow:auto;max-height:100px">' + esc(text) + '</pre></div>';
    return;
  }

  el('mutasiParseStatus').innerHTML = '✅ Berhasil mengekstrak ' + extracted.length + ' transaksi!';
  el('mutasiSimpanBtn').classList.remove('hidden');

  var h = '<table style="font-size:12px;width:100%"><thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Tipe</th><th>Nominal</th></tr></thead><tbody>';
  extracted.forEach(function(r) {
    var tipe = r.tipe === 'D' ? '<span style="color:var(--red);font-weight:600">DEBET</span>' : '<span style="color:var(--green);font-weight:600">KREDIT</span>';
    h += '<tr><td>' + r.tanggal + '</td><td>' + esc(r.deskripsi) + '</td><td>' + tipe + '</td><td style="font-weight:700">' + rp(r.nominal) + '</td></tr>';
  });
  h += '</tbody></table>';
  el('mutasiPreview').innerHTML = h;
}

function extractMutasiFromText(text) {
  var rows = [];
  var lines = text.split('\n');
  var regexDate = /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/;
  
  lines.forEach(function(line) {
    var lineClean = line.trim();
    if (!lineClean) return;
    
    var mDate = lineClean.match(regexDate);
    if (!mDate) return;
    var tglRaw = mDate[1];
    
    var tglParts = tglRaw.split(/[\/\-]/);
    var tgl = '';
    if (tglParts.length === 3) {
      var d = tglParts[0], m = tglParts[1], y = tglParts[2];
      if (y.length === 2) y = '20' + y;
      tgl = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
    } else {
      tgl = today();
    }
    
    var contentLine = lineClean.replace(tglRaw, '').trim();
    
    var tipe = 'K';
    var lower = contentLine.toLowerCase();
    if (lower.indexOf('db') >= 0 || lower.indexOf('debet') >= 0 || lower.indexOf('debit') >= 0 || lower.indexOf(' dr') >= 0 || lower.endsWith('d') || lower.endsWith('db')) {
      tipe = 'D';
    } else if (lower.indexOf('cr') >= 0 || lower.indexOf('kredit') >= 0 || lower.endsWith('k') || lower.endsWith('cr')) {
      tipe = 'K';
    }
    
    var amt = 0;
    var matches = contentLine.match(/([\d\.,]+)/g);
    if (matches && matches.length > 0) {
      var candidates = [];
      matches.forEach(function(m) {
        var num = parseFloat(m.replace(/\./g, '').replace(',', '.'));
        if (num > 0 && m.indexOf('/') === -1 && m.indexOf('-') === -1) {
          candidates.push(num);
        }
      });
      if (candidates.length > 0) {
        amt = candidates[candidates.length - 1];
      }
    }
    
    var deskripsi = contentLine.replace(/([\d\.,]+)/g, '').replace(/(db|cr|debet|kredit| dr| cr| d| k)$/i, '').trim();
    // Clean redundant spaces and dividers
    deskripsi = deskripsi.replace(/^-|^\s*-\s*|\s*-\s*$/g, '').trim();
    if (!deskripsi) deskripsi = 'Transaksi Mutasi';
    
    if (tgl && amt > 0) {
      rows.push({
        tanggal: tgl,
        deskripsi: deskripsi,
        tipe: tipe,
        nominal: amt
      });
    }
  });
  
  return rows;
}

function saveMutasiImport() {
  var rows = [];
  var trs = document.querySelectorAll('.mutasi-preview-row');
  var defaultRekeningId = el('import_default_rekening') ? el('import_default_rekening').value : '';
  var defaultFundraising = el('import_default_fundraising') ? el('import_default_fundraising').value : 'Lazismu Daerah Bantul';

  trs.forEach(function(tr) {
    var checked = tr.querySelector('.mutasi-row-check').checked;
    if (!checked) return;

    var tanggal = tr.querySelector('.mutasi-row-date').value;
    var deskripsi = tr.querySelector('.mutasi-row-desc').value.trim();
    var tipe = tr.querySelector('.mutasi-row-type').value; // "HIMPUN" or "SALUR"
    var nominal = parseFloat(tr.querySelector('.mutasi-row-amount').value) || 0;

    if (tanggal && deskripsi && nominal > 0) {
      rows.push({
        tanggal: tanggal,
        deskripsi: deskripsi,
        tipe: tipe,
        nominal: nominal,
        rekeningId: defaultRekeningId,
        fundraising: defaultFundraising
      });
    }
  });

  if (rows.length === 0) {
    toast('Pilih minimal satu transaksi untuk diimpor', true);
    return;
  }

  el('mutasiSimpanBtn').disabled = true;
  el('mutasiSimpanBtn').textContent = '💾 Menyimpan...';

  gas('apiImportMutasiToRecords')(TOKEN, rows).then(function(res) {
    closeModal();
    toast('Mutasi disimpan: ' + res.imported + ' baru ditambahkan ke pembukuan, ' + res.skipped + ' dilewati/duplikat');
    if (typeof viewPenghimpunan === 'function') viewPenghimpunan();
  }).catch(function(err) {
    el('mutasiSimpanBtn').disabled = false;
    el('mutasiSimpanBtn').textContent = '💾 Simpan Mutasi';
    handleErr(err);
  });
}

function toggleSelectAllMutasi() {
  var chkAll = el('mutasi_select_all');
  if (!chkAll) return;
  var checks = document.querySelectorAll('.mutasi-row-check');
  checks.forEach(function(c) {
    c.checked = chkAll.checked;
  });
}

function handleMutasiCSV(text) {
  var extracted = extractMutasiFromCSV(text);
  
  if (extracted.length === 0) {
    var normalizedText = text.replace(/[,;]/g, ' ');
    extracted = extractMutasiFromText(normalizedText);
  }
  
  renderMutasiPreview(extracted, text);
}

function handleMutasiTextParsed(text) {
  var extracted = extractMutasiFromText(text);
  renderMutasiPreview(extracted, text);
}

function renderMutasiPreview(extracted, rawText) {
  window.MUTASI_PARSED_ROWS = extracted;
  
  if (extracted.length === 0) {
    el('mutasiParseStatus').innerHTML = '⚠️ Berhasil diproses, tetapi tidak menemukan baris mutasi rekening yang cocok.';
    el('mutasiPreview').innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted)">Teks Terbaca:<pre style="text-align:left;font-size:11px;margin-top:10px;overflow:auto;max-height:100px">' + esc(rawText) + '</pre></div>';
    return;
  }

  el('mutasiParseStatus').innerHTML = '✅ Berhasil mengekstrak ' + extracted.length + ' transaksi! (Silakan sesuaikan data)';
  el('mutasiSimpanBtn').classList.remove('hidden');

  var h = '<table style="font-size:12px;width:100%">' +
    '  <thead>' +
    '    <tr>' +
    '      <th style="width:30px;text-align:center"><input type="checkbox" id="mutasi_select_all" checked onchange="toggleSelectAllMutasi()"></th>' +
    '      <th style="width:130px">Tanggal</th>' +
    '      <th>Deskripsi / Keterangan</th>' +
    '      <th style="width:180px">Tipe Transaksi</th>' +
    '      <th style="width:110px">Nominal</th>' +
    '    </tr>' +
    '  </thead>' +
    '  <tbody>';

  var donaturs = window.LIST_DONATUR || [];

  extracted.forEach(function(r, idx) {
    var selectHimpun = r.tipe === 'K' ? 'selected' : '';
    var selectSalur = r.tipe === 'D' ? 'selected' : '';
    
    var matchedDonatur = '';
    if (donaturs.length && r.deskripsi) {
      var dDesc = String(r.deskripsi).toLowerCase();
      for (var i = 0; i < donaturs.length; i++) {
        var dName = String(donaturs[i].nama || '').trim();
        if (dName.length > 3 && dDesc.indexOf(dName.toLowerCase()) >= 0) {
          matchedDonatur = dName;
          break;
        }
      }
    }
    
    var autoMatchBadge = matchedDonatur ? '<div style="font-size:10.5px;color:#15803d;margin-top:2px;font-weight:600;display:flex;align-items:center;gap:4px">⚡ Auto-Match Donatur: <span>' + esc(matchedDonatur) + '</span></div>' : '';

    h += '<tr class="mutasi-preview-row" data-idx="' + idx + '">' +
      '  <td style="text-align:center"><input type="checkbox" class="mutasi-row-check" checked></td>' +
      '  <td><input type="date" class="mutasi-row-date" value="' + r.tanggal + '" style="padding:4px;font-size:12px;width:120px"></td>' +
      '  <td><input type="text" class="mutasi-row-desc" value="' + esc(r.deskripsi) + '" style="padding:4px;font-size:12px;width:95%">' + autoMatchBadge + '</td>' +
      '  <td>' +
      '    <select class="mutasi-row-type" style="padding:4px;font-size:12px;width:100%">' +
      '      <option value="HIMPUN" ' + selectHimpun + '>Penghimpunan (Uang Masuk)</option>' +
      '      <option value="SALUR" ' + selectSalur + '>Pentasyarufan (Uang Keluar)</option>' +
      '    </select>' +
      '  </td>' +
      '  <td><input type="number" class="mutasi-row-amount" value="' + r.nominal + '" style="padding:4px;font-size:12px;width:90px;font-weight:700"></td>' +
      '</tr>';
  });

  h += '</tbody></table>';
  el('mutasiPreview').innerHTML = h;
}

function parseCSV(text) {
  var lines = text.split(/\r?\n/);
  var result = [];
  lines.forEach(function(line) {
    var row = [];
    var inQuotes = false;
    var current = '';
    for (var i = 0; i < line.length; i++) {
      var char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current);
    result.push(row);
  });
  return result;
}

function parseExcelOrCSVDate(dateStr) {
  if (!dateStr) return null;
  var s = dateStr.trim().replace(/^"|"$/g, '');
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
  var parts = s.split(/[-/]/);
  if (parts.length === 3) {
    var d = parseInt(parts[0], 10);
    var mStr = parts[1].toLowerCase();
    var y = parseInt(parts[2], 10);
    
    var months = {
      jan:1, feb:2, mar:3, apr:4, mei:5, may:5, jun:6, jul:7, agt:8, aug:8, sep:9, okt:10, oct:10, nov:11, des:12, dec:12
    };
    
    var m = months[mStr.substring(0, 3)] || parseInt(mStr, 10);
    if (d > 0 && m > 0 && y > 0) {
      if (y < 100) y = 2000 + y;
      return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
    }
  }
  
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

function extractMutasiFromCSV(text) {
  var lines = parseCSV(text);
  var headers = null;
  var colIdx = { tgl: -1, ket: -1, deb: -1, kre: -1, tipe: -1, amt: -1 };
  
  for (var i = 0; i < lines.length; i++) {
    var row = lines[i];
    var isHeader = false;
    for (var j = 0; j < row.length; j++) {
      var cell = String(row[j]).toLowerCase().trim();
      if (cell.indexOf('tgl') >= 0 || cell.indexOf('tanggal') >= 0 || cell.indexOf('date') >= 0 || cell === 'tgl') {
        colIdx.tgl = j;
        isHeader = true;
      }
      if (cell.indexOf('keterangan') >= 0 || cell.indexOf('desc') >= 0 || cell.indexOf('uraian') >= 0 || cell === 'keterangan') {
        colIdx.ket = j;
      }
      if (cell.indexOf('debit') >= 0 || cell.indexOf('debet') >= 0 || cell === 'debit') {
        colIdx.deb = j;
      }
      if (cell.indexOf('kredit') >= 0 || cell === 'kredit') {
        colIdx.kre = j;
      }
      if (cell === 'tipe' || cell === 'type' || cell === 'mutasi' || cell === 'status') {
        colIdx.tipe = j;
      }
      if (cell.indexOf('nominal') >= 0 || cell.indexOf('jumlah') >= 0 || cell.indexOf('amount') >= 0 || cell === 'jumlah') {
        colIdx.amt = j;
      }
    }
    if (isHeader && (colIdx.ket >= 0 || colIdx.deb >= 0 || colIdx.amt >= 0)) {
      headers = row;
      lines = lines.slice(i + 1);
      break;
    }
  }
  
  if (!headers && lines.length > 0) {
    for (var i = 0; i < lines.length; i++) {
      var dateVal = parseExcelOrCSVDate(lines[i][0]);
      if (dateVal) {
        colIdx.tgl = 0;
        colIdx.ket = 1;
        if (lines[i].length > 4) {
          colIdx.deb = 2;
          colIdx.kre = 3;
        } else {
          colIdx.amt = 2;
          colIdx.tipe = 3;
        }
        lines = lines.slice(i);
        headers = [];
        break;
      }
    }
  }
  
  var rows = [];
  if (colIdx.tgl >= 0) {
    lines.forEach(function(row) {
      if (row.length <= colIdx.tgl) return;
      var tglStr = row[colIdx.tgl];
      var tgl = parseExcelOrCSVDate(tglStr);
      if (!tgl) return;
      
      var desc = colIdx.ket >= 0 ? String(row[colIdx.ket]).replace(/^"|"$/g, '').trim() : 'Transaksi Mutasi';
      var nominal = 0;
      var tipe = 'K';
      
      var debVal = 0, kreVal = 0;
      if (colIdx.deb >= 0 && colIdx.deb < row.length) {
        debVal = parseFloat(String(row[colIdx.deb]).replace(/[^\d.-]/g, '')) || 0;
      }
      if (colIdx.kre >= 0 && colIdx.kre < row.length) {
        kreVal = parseFloat(String(row[colIdx.kre]).replace(/[^\d.-]/g, '')) || 0;
      }
      
      if (debVal > 0) {
        nominal = debVal;
        tipe = 'D';
      } else if (kreVal > 0) {
        nominal = kreVal;
        tipe = 'K';
      } else if (colIdx.amt >= 0 && colIdx.amt < row.length) {
        nominal = parseFloat(String(row[colIdx.amt]).replace(/[^\d.-]/g, '')) || 0;
        if (colIdx.tipe >= 0 && colIdx.tipe < row.length) {
          var tStr = String(row[colIdx.tipe]).toLowerCase();
          if (tStr.indexOf('db') >= 0 || tStr.indexOf('debit') >= 0 || tStr.indexOf('keluar') >= 0 || tStr === 'd') {
            tipe = 'D';
          }
        }
      }
      
      if (nominal > 0) {
        rows.push({
          tanggal: tgl,
          deskripsi: desc,
          tipe: tipe,
          nominal: nominal
        });
      }
    });
  }
  return rows;
}

/* Selama transisi lebar sidebar, backdrop-filter dimatikan lewat class .nav-anim
   (lihat blok 15 di styles.css) — menghitung ulang blur tiap frame adalah
   penyebab utama animasinya tersendat. */
function markNavAnim() {
  var app = el('appView');
  if (!app) return;
  app.classList.add('nav-anim');
  clearTimeout(window.__navAnimTimer);
  window.__navAnimTimer = setTimeout(function () {
    app.classList.remove('nav-anim');
  }, 340);
}

function toggleSidebar() {
  var app = el('appView');
  if (app) {
    markNavAnim();
    app.classList.toggle('collapsed');
    localStorage.setItem('sidebar_collapsed', app.classList.contains('collapsed'));
  }
}

/* Klik ikon menu saat sidebar ciut ikut melebarkannya, supaya labelnya terbaca.
   Kalau sudah lebar, tidak melakukan apa-apa (klik menu tetap murni navigasi). */
function expandSidebar() {
  var app = el('appView');
  if (app && app.classList.contains('collapsed')) {
    markNavAnim();
    app.classList.remove('collapsed');
    localStorage.setItem('sidebar_collapsed', 'false');
  }
}

function collapseSidebar() {
  var app = el('appView');
  if (app && !app.classList.contains('collapsed')) {
    markNavAnim();
    app.classList.add('collapsed');
    localStorage.setItem('sidebar_collapsed', 'true');
  }
}

/* Klik di area konten menutup sidebar kembali (perilaku drawer).
   Dikecualikan: klik di dalam sidebar itu sendiri, dan di dalam modal /
   dropdown yang mengambang — menutup sidebar di tengah dialog terasa acak.
   Di bawah 1024px sidebar berubah jadi topbar horizontal, jadi dilewati. */
(function () {
  if (window.__sidebarOutsideClick) return;
  window.__sidebarOutsideClick = true;
  document.addEventListener('click', function (e) {
    var app = document.getElementById('appView');
    if (!app || app.classList.contains('hidden') || app.classList.contains('collapsed')) return;
    if (window.innerWidth < 1024) return;
    if (e.target.closest('.topnav')) return;
    if (e.target.closest('.modal-bg, .cd-overlay, .dropdown-popover, .custom-dropdown-menu, .select-enhanced-popover, .datepicker-enhanced-popover')) return;
    collapseSidebar();
  });
})();

function viewDonatur() {
  // tanpa spinner: konten lama tetap tampil meredup & blur sampai data tiba
  
  var layPromise = CACHE.layanan ? Promise.resolve(CACHE.layanan) : gas('apiListLayanan')(TOKEN);
  var crmPromise = gas('apiGetDonaturAnalytics')(TOKEN);
  
  Promise.all([layPromise, crmPromise]).then(function(res) {
    CACHE.layanan = res[0];
    window.LIST_DONATUR = res[1];
    renderDonatur(res[1]);
  }).catch(function() {
    gas('apiListDonatur')(TOKEN).then(function(d) {
      window.LIST_DONATUR = d;
      renderDonatur(d);
    }).catch(handleErr);
  });
}

function renderDonatur(rows) {
  var h = '<div class="page-head">' +
    '  <div>' +
    '    <h2>Database Donatur</h2>' +
    '    <div class="desc">Daftar profil donatur terdaftar serta donatur dari transaksi penghimpunan</div>' +
    '  </div>' +
    '  <button class="btn btn-primary" onclick="openImportDonaturModal()">📥 Impor Donatur (Teks)</button>' +
    '</div>';

  h += '<div class="table-wrap">' +
    '  <div class="toolbar" id="donaturToolbar" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">' +
    '    <div class="field" style="margin:0;flex:2;min-width:200px"><label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Nama / Telepon</label><input type="text" id="donatur_search" placeholder="Cari..." oninput="filterDonaturTable()" style="padding:8px 12px;font-size:13px;width:100%;box-sizing:border-box"></div>' +
    '    <div class="field" style="margin:0;flex:1;min-width:150px">' +
    '      <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Kategori Donatur</label>' +
    '      <select id="donatur_filter_kategori" onchange="onDonaturKategoriChange()" style="padding:8px 12px;font-size:13px;width:100%;box-sizing:border-box">' +
    '        <option value="">Semua Kategori</option>' +
    '        <option value="Perorangan">Perorangan</option>' +
    '        <option value="Lembaga/Perusahaan">Lembaga/Perusahaan</option>' +
    '        <option value="Hamba Allah">Hamba Allah</option>' +
    '        <option value="Kantor Layanan (KLL)">Kantor Layanan (KLL)</option>' +
    '        <option value="Unit Layanan (ULL)">Unit Layanan (ULL)</option>' +
    '      </select>' +
    '    </div>' +
    '    <div class="field" id="kll_ull_dropdown_container" style="display:none;margin:0;flex:1;min-width:180px;position:relative">' +
    '      <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block">Pilih Kantor/Unit Layanan</label>' +
    '      <button id="kll_ull_multi_btn" class="btn btn-ghost" onclick="toggleKllUllDropdown(event)" style="padding:8px 12px;font-size:13px;width:100%;text-align:left;border:1px solid var(--border);border-radius:6px;display:flex;justify-content:space-between;align-items:center;background:var(--surface);box-sizing:border-box">' +
    '        <span>Pilih Layanan (Semua)</span>' +
    '        <span style="font-size:10px">▼</span>' +
    '      </button>' +
    '      <div id="kll_ull_popover" class="hidden" style="position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.18);padding:10px;z-index:10000;margin-top:4px;box-sizing:border-box;min-width:240px">' +
    '        <input type="text" id="kll_ull_search" placeholder="Cari..." oninput="onKllUllSearchInput()" style="padding:6px 10px;font-size:12.5px;width:100%;box-sizing:border-box;margin-bottom:8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text)">' +
    '        <div id="kll_ull_options_list" style="max-height:170px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>' +
    '      </div>' +
    '    </div>' +
    '  </div>';

  h += '  <div style="overflow:auto">' +
    '    <table>' +
    '      <thead>' +
    '        <tr>' +
    '          <th>Nama Donatur</th>' +
    '          <th>Status CRM</th>' +
    '          <th>Kategori</th>' +
    '          <th>Telepon/WA</th>' +
    '          <th>Total Donasi (LTV)</th>' +
    '          <th>Frekuensi</th>' +
    '          <th>Terakhir Donasi</th>' +
    '          <th style="width:80px;text-align:center">Aksi</th>' +
    '        </tr>' +
    '      </thead>' +
    '      <tbody id="donaturTableBody">';
    
  if (rows.length === 0) {
    h += '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Belum ada donatur terdaftar</td></tr>';
  } else {
    rows.sort(function(a, b) { return (b.totalDonasi || 0) - (a.totalDonasi || 0); });
    rows.forEach(function(r) {
      var stBadgeClass = 'blue';
      if (r.status === 'Aktif') stBadgeClass = 'green';
      else if (r.status === 'Pasif') stBadgeClass = 'amber';
      else if (r.status === 'Dormant') stBadgeClass = 'red';
      
      var vipBadge = r.isVip ? '<span class="badge amber" style="margin-left:4px">⭐ VIP</span>' : '';
      var rutinBadge = r.isRutin ? '<span class="badge green" style="margin-left:4px">🔁 Rutin</span>' : '';

      h += '<tr class="donatur-row" data-kategori="' + esc(r.kategori) + '" data-layanan="' + esc((r.layanan || []).join('|').toLowerCase()) + '">' +
        '  <td style="font-weight:600" class="donatur-name-cell">' + esc(r.nama) + vipBadge + rutinBadge + '</td>' +
        '  <td><span class="badge ' + stBadgeClass + '">' + esc(r.status || 'Baru') + '</span></td>' +
        '  <td><span class="badge">' + esc(r.kategori) + '</span></td>' +
        '  <td>' + esc(r.telepon || '-') + '</td>' +
        '  <td style="font-weight:700;color:var(--primary)">' + rp(r.totalDonasi || 0) + '</td>' +
        '  <td>' + (r.jumlahTransaksi || 0) + ' x</td>' +
        '  <td>' + (r.terakhirDonasi ? fdate(r.terakhirDonasi) : '-') + '</td>' +
        '  <td style="text-align:center"><button class="btn btn-ghost btn-sm" onclick="openDonaturDetail(\'' + encodeURIComponent(r.nama) + '\')">👁️ Detail</button></td>' +
        '</tr>';
    });
  }
  
  h += '      </tbody>' +
    '    </table>' +
    '  </div>' +
    '</div>';
    
  el('content').innerHTML = h;
}

function onDonaturKategoriChange() {
  var kat = el('donatur_filter_kategori').value;
  var container = el('kll_ull_dropdown_container');
  var optionsList = el('kll_ull_options_list');
  var pop = el('kll_ull_popover');
  
  if (pop) pop.classList.add('hidden');
  
  if (kat === 'Kantor Layanan (KLL)' || kat === 'Unit Layanan (ULL)') {
    var tipe = kat === 'Kantor Layanan (KLL)' ? 'KLL' : 'ULL';
    
    var layData = CACHE.layanan || [];
    if ((!layData || layData.length === 0) && !window.__layananFetched) {
      window.__layananFetched = true;
      gas('apiListLayanan')(TOKEN).then(function(data) {
        CACHE.layanan = data || [];
        onDonaturKategoriChange();
      }).catch(handleErr);
      return;
    }
    
    var list = layData.filter(function(l) {
      var tVal = String(l.tipe || l.Tipe || '').trim().toUpperCase();
      return tVal === tipe.toUpperCase();
    });
    
    var html = '<label class="kll-ull-option-label" style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;user-select:none;padding:6px 8px;border-radius:4px;transition:background 0.2s;font-weight:600;border-bottom:1px solid var(--border2);margin-bottom:4px">' +
      '  <input type="checkbox" id="kll_ull_select_all" style="width:14px;height:14px;margin:0;padding:0;cursor:pointer;flex-shrink:0" checked onchange="toggleKllUllSelectAll()"> Semua' +
      '</label>';
    
    if (list.length === 0) {
      html += '<span style="font-size:12px;color:var(--muted);padding:8px;display:block">Belum ada data ' + tipe + '</span>';
    } else {
      html += list.map(function(l) {
        return '<label class="kll-ull-option-label" style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;user-select:none;padding:6px 8px;border-radius:4px;transition:background 0.2s">' +
          '  <input type="checkbox" class="kll-ull-chk" value="' + esc(l.nama) + '" checked style="width:14px;height:14px;margin:0;padding:0;cursor:pointer;flex-shrink:0" onchange="onKllUllCheckboxChange()"> ' + esc(l.nama) +
          '</label>';
      }).join('');
    }
    
    optionsList.innerHTML = html;
    container.style.display = 'block';
    updateKllUllButtonText();
  } else {
    container.style.display = 'none';
    optionsList.innerHTML = '';
  }
  filterDonaturTable();
}

function onKllUllCheckboxChange() {
  var chks = document.querySelectorAll('.kll-ull-chk');
  var checkedChks = document.querySelectorAll('.kll-ull-chk:checked');
  var allChk = el('kll_ull_select_all');
  if (allChk) {
    allChk.checked = (chks.length > 0 && chks.length === checkedChks.length);
  }
  updateKllUllButtonText();
  filterDonaturTable();
}

function toggleKllUllSelectAll() {
  var allChk = el('kll_ull_select_all');
  var state = allChk ? allChk.checked : false;
  var chks = document.querySelectorAll('.kll-ull-chk');
  chks.forEach(function(c) {
    c.checked = state;
  });
  updateKllUllButtonText();
  filterDonaturTable();
}

function updateKllUllButtonText() {
  var chks = document.querySelectorAll('.kll-ull-chk:checked');
  var total = document.querySelectorAll('.kll-ull-chk').length;
  var btnSpan = el('kll_ull_multi_btn') ? el('kll_ull_multi_btn').querySelector('span') : null;
  if (!btnSpan) return;
  
  if (total === 0) {
    btnSpan.textContent = 'Tidak Ada Layanan';
  } else if (chks.length === 0) {
    btnSpan.textContent = '0 Terpilih';
  } else if (chks.length === total) {
    btnSpan.textContent = 'Pilih Layanan (Semua)';
  } else {
    btnSpan.textContent = 'Pilih Layanan (' + chks.length + ' terpilih)';
  }
}

function onKllUllSearchInput() {
  var q = el('kll_ull_search').value.toLowerCase();
  var labels = document.querySelectorAll('.kll-ull-option-label');
  labels.forEach(function(lbl) {
    if (lbl.querySelector('#kll_ull_select_all')) return;
    var txt = lbl.textContent.toLowerCase();
    lbl.style.display = txt.indexOf(q) >= 0 ? 'flex' : 'none';
  });
}

function toggleKllUllDropdown(e) {
  if (e) e.stopPropagation();
  var pop = el('kll_ull_popover');
  var btn = el('kll_ull_dropdown_btn');
  if (pop) {
    var willOpen = pop.classList.contains('hidden');
    document.querySelectorAll('.select-enhanced-popover:not(.hidden), .datepicker-enhanced-popover:not(.hidden)').forEach(function(p) { p.classList.add('hidden'); });
    
    if (willOpen && btn) {
      var rect = btn.getBoundingClientRect();
      var spaceBelow = window.innerHeight - rect.bottom;
      var spaceAbove = rect.top;
      
      if (spaceBelow < 240 && spaceAbove > spaceBelow) {
        pop.style.top = 'auto';
        pop.style.bottom = '100%';
        pop.style.marginTop = '0';
        pop.style.marginBottom = '6px';
      } else {
        pop.style.top = '100%';
        pop.style.bottom = 'auto';
        pop.style.marginTop = '6px';
        pop.style.marginBottom = '0';
      }
    }
    
    pop.classList.toggle('hidden');
    if (willOpen) {
      var searchInput = el('kll_ull_search');
      if (searchInput) {
        searchInput.value = '';
        onKllUllSearchInput();
        searchInput.focus();
      }
    }
  }
}

function filterDonaturTable() {
  var q = el('donatur_search') ? el('donatur_search').value.toLowerCase() : '';
  var kat = el('donatur_filter_kategori') ? el('donatur_filter_kategori').value : '';
  var rows = document.querySelectorAll('.donatur-row');
  
  var checkedLayanan = [];
  var totalLayanan = document.querySelectorAll('.kll-ull-chk').length;
  if (kat === 'Kantor Layanan (KLL)' || kat === 'Unit Layanan (ULL)') {
    var chks = document.querySelectorAll('.kll-ull-chk:checked');
    chks.forEach(function(c) {
      checkedLayanan.push(c.value.toLowerCase());
    });
  }
  
  var allSelected = (kat === 'Kantor Layanan (KLL)' || kat === 'Unit Layanan (ULL)') && totalLayanan > 0 && (checkedLayanan.length === totalLayanan);

  rows.forEach(function(row) {
    var nameCell = row.querySelector('.donatur-name-cell');
    var donorNameLower = nameCell ? nameCell.textContent.toLowerCase() : '';
    var txt = row.textContent.toLowerCase();
    var rowKat = row.getAttribute('data-kategori');
    
    var matchSearch = txt.indexOf(q) >= 0;
    var matchKat = !kat || rowKat === kat;
    
    if (matchSearch && matchKat && (kat === 'Kantor Layanan (KLL)' || kat === 'Unit Layanan (ULL)')) {
      // Batasi berdasarkan Kantor/Unit Layanan hanya jika master layanan tersedia
      // DAN pengguna memilih sebagian layanan (bukan semua, bukan kosong).
      // Cocokkan dengan asosiasi layanan asli donatur (data-layanan), bukan nama donatur.
      if (totalLayanan > 0 && !allSelected && checkedLayanan.length > 0) {
        var rowLayanan = (row.getAttribute('data-layanan') || '').split('|').filter(Boolean);
        var matchLayanan = false;
        for (var j = 0; j < checkedLayanan.length; j++) {
          if (rowLayanan.indexOf(checkedLayanan[j]) >= 0) {
            matchLayanan = true;
            break;
          }
        }
        if (!matchLayanan) {
          row.style.display = 'none';
          return;
        }
      }
    }
    
    row.style.display = (matchSearch && matchKat) ? '' : 'none';
  });
}

function openImportDonaturModal() {
  var b = '<div class="field">' +
    '  <label style="font-weight:600">Tempel Daftar Donatur</label>' +
    '  <div class="desc" style="margin-bottom:8px;font-size:12px;color:var(--muted)">Format per baris: <code>Nama, Kategori, Telepon, Alamat</code> atau <code>Nama - Telepon - Alamat</code>.<br>Kategori otomatis dinormalisasi ke Perorangan/Lembaga/KLL/ULL.</div>' +
    '  <textarea id="import_donatur_text" rows="8" placeholder="Contoh:\nAhmad Solikin, Perorangan, 08123456789, Jl. Bantul\nLazismu Piyungan, Kantor Layanan (KLL), 08998765432, Piyungan" style="font-family:monospace;font-size:12px;padding:8px;width:100%"></textarea>' +
    '</div>';
    
  var f = '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
    '<button class="btn btn-primary" id="importDonaturSaveBtn" onclick="saveImportedDonaturText()">📥 Impor Data</button>';
    
  openModal('Impor Database Donatur', b, f);
}

function saveImportedDonaturText() {
  var text = el('import_donatur_text').value;
  if (!text.trim()) {
    toast('Teks input kosong', true);
    return;
  }
  
  el('importDonaturSaveBtn').disabled = true;
  el('importDonaturSaveBtn').textContent = 'Mengimpor...';
  
  gas('apiImportDonaturText')(TOKEN, text).then(function(res) {
    closeModal();
    toast('Berhasil mengimpor ' + res.count + ' donatur baru');
    viewDonatur();
  }).catch(function(err) {
    el('importDonaturSaveBtn').disabled = false;
    el('importDonaturSaveBtn').textContent = '📥 Impor Data';
    handleErr(err);
  });
}

function cleanDonaturNameJS(name) {
  if (!name) return '';
  var s = String(name).trim();
  s = s.replace(/^nn\s*[-.]*\s*/i, '').trim();
  var prefixes = [
    /^(infak umum|infak terikat|zakat profesi|zakat fitrah|zakat mal|penerimaan zakat|penerimaan infak|penerimaan|setor tunai|mutasi)\s*[-.:]*\s*/i
  ];
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < prefixes.length; i++) {
      if (prefixes[i].test(s)) {
        s = s.replace(prefixes[i], '').trim();
        changed = true;
      }
    }
  }
  return s;
}

function openDonaturDetail(namaEncoded) {
  var nama = decodeURIComponent(namaEncoded);
  var donatur = window.LIST_DONATUR.find(function(d) { return d.nama === nama; });
  if (!donatur) return;
  
  var pPromise = CACHE.penghimpunan ? Promise.resolve(CACHE.penghimpunan) : gas('apiListPenghimpunan')(TOKEN);
  
  toast('Memuat riwayat donasi...');
  pPromise.then(function(list) {
    CACHE.penghimpunan = list;
    var cleanTarget = cleanDonaturNameJS(nama).toLowerCase();
    var txs = list.filter(function(tx) {
      var rawName = String(tx.namaDonatur || '').trim().toLowerCase();
      var cName = cleanDonaturNameJS(tx.namaDonatur).toLowerCase();
      if (rawName === nama.toLowerCase() || cName === cleanTarget) return true;
      if (cleanTarget && cName && (cName.indexOf(cleanTarget) >= 0 || cleanTarget.indexOf(cName) >= 0)) return true;
      return false;
    });
    
    var profileHtml = '<div style="margin-bottom:16px;background:var(--surface2);padding:12px;border-radius:8px;border:1px solid var(--border)">' +
      '  <p style="margin: 4px 0"><strong>Nama:</strong> ' + esc(donatur.nama) + '</p>' +
      '  <p style="margin: 4px 0"><strong>Kategori:</strong> ' + esc(donatur.kategori) + '</p>' +
      '  <p style="margin: 4px 0"><strong>Telepon/WA:</strong> ' + esc(donatur.telepon || '-') + '</p>' +
      '  <p style="margin: 4px 0"><strong>Alamat:</strong> ' + esc(donatur.alamat || '-') + '</p>' +
      '  <p style="margin: 4px 0"><strong>Total Donasi:</strong> <strong style="color:var(--accent)">' + rp(donatur.totalDonasi) + '</strong></p>' +
      '</div>';
      
    var tableHtml = '<h4>Riwayat Penghimpunan (' + txs.length + ' Transaksi)</h4>' +
      '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;margin-top:8px">' +
      '  <table style="font-size:12px;width:100%">' +
      '    <thead>' +
      '      <tr>' +
      '        <th>Tanggal</th>' +
      '        <th>Kuitansi</th>' +
      '        <th>Dana/Program</th>' +
      '        <th>Jumlah</th>' +
      '        <th>Metode</th>' +
      '      </tr>' +
      '    </thead>' +
      '    <tbody>';
      
    if (txs.length === 0) {
      tableHtml += '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Belum ada transaksi</td></tr>';
    } else {
      txs.forEach(function(tx) {
        var detailDana = tx.jenisDana;
        if (tx.pilar) detailDana += ' (' + tx.pilar + ')';
        detailDana += ' - ' + tx.program;
        tableHtml += '<tr>' +
          '  <td>' + tx.tanggal + '</td>' +
          '  <td>' + esc(tx.noKwitansi) + '</td>' +
          '  <td>' + esc(detailDana) + '</td>' +
          '  <td style="font-weight:700">' + rp(tx.jumlah) + '</td>' +
          '  <td>' + esc(tx.metode) + '</td>' +
          '</tr>';
      });
    }
    
    tableHtml += '    </tbody>' +
      '  </table>' +
      '</div>';
      
    openModal('Detail Donatur: ' + esc(donatur.nama), profileHtml + tableHtml, '<button class="btn btn-primary" onclick="closeModal()">Tutup</button>');
  }).catch(handleErr);
}

document.addEventListener('click', function(e) {
  var container = el('kll_ull_dropdown_container');
  var pop = el('kll_ull_popover');
  if (container && pop && !pop.classList.contains('hidden')) {
    if (!container.contains(e.target)) {
      pop.classList.add('hidden');
    }
  }
});

/* ================================================================
   LOG AKTIVITAS
   Menjawab dua pertanyaan: siapa yang membuka apa, dan siapa yang
   menambah / mengubah / menghapus data — beserta kolom mana yang
   berubah dari nilai apa ke nilai apa.
   ================================================================ */
var LOG_FILTER = { cari:'', username:'', jenis:'', dari:'', sampai:'', batas:200 };

var LOG_AKSI_META = {
  login:            ['Masuk',              'green'],
  logout:           ['Keluar',             'grey'],
  login_gagal:      ['Gagal masuk',        'red'],
  create:           ['Tambah',             'green'],
  edit:             ['Ubah',               'amber'],
  delete:           ['Hapus',              'red'],
  import:           ['Impor',              'blue'],
  buka:             ['Buka halaman',       'grey'],
  perbaikan_data_lama: ['Perbaikan data',  'amber'],
  hapus_log:        ['Bersihkan log',      'red']
};

function logLabel(aksi){
  aksi = String(aksi || '');
  if (LOG_AKSI_META[aksi]) return LOG_AKSI_META[aksi];
  var kepala = aksi.split('_')[0];
  var meta = LOG_AKSI_META[kepala];
  var ekor = aksi.slice(kepala.length + 1).replace(/_/g, ' ');
  if (meta) return [meta[0] + (ekor ? ' ' + ekor : ''), meta[1]];
  return [aksi.replace(/_/g, ' '), 'grey'];
}

function viewLog(){
  var el0 = el('log_cari');
  if (el0) {
    LOG_FILTER.cari = el0.value;
    LOG_FILTER.username = (el('log_user')||{}).value || '';
    LOG_FILTER.jenis = (el('log_jenis')||{}).value || '';
    LOG_FILTER.dari = (el('log_dari')||{}).value || '';
    LOG_FILTER.sampai = (el('log_sampai')||{}).value || '';
  }
  gas('apiListAudit')(TOKEN, LOG_FILTER).then(renderLog).catch(handleErr);
}

function logRefresh(){
  var host = el('logBody');
  if (!host) { viewLog(); return; }
  LOG_FILTER.cari = (el('log_cari')||{}).value || '';
  LOG_FILTER.username = (el('log_user')||{}).value || '';
  LOG_FILTER.jenis = (el('log_jenis')||{}).value || '';
  LOG_FILTER.dari = (el('log_dari')||{}).value || '';
  LOG_FILTER.sampai = (el('log_sampai')||{}).value || '';
  host.classList.add('lap-memuat');
  gas('apiListAudit')(TOKEN, LOG_FILTER).then(function(d){
    host.classList.remove('lap-memuat');
    host.innerHTML = logTabel(d);
  }).catch(function(e){ host.classList.remove('lap-memuat'); handleErr(e); });
}

function logReset(){
  LOG_FILTER = { cari:'', username:'', jenis:'', dari:'', sampai:'', batas:200 };
  viewLog();
}

function renderLog(d){
  var opsiUser = '<option value="">Semua pengguna</option>' + (d.users||[]).map(function(u){
    return '<option value="'+esc(u)+'"'+(LOG_FILTER.username===u?' selected':'')+'>'+esc(u)+'</option>';
  }).join('');
  var opsiJenis = [['','Semua aktivitas'],['akses','Akses & sesi'],['ubah','Perubahan data']].map(function(o){
    return '<option value="'+o[0]+'"'+(LOG_FILTER.jenis===o[0]?' selected':'')+'>'+o[1]+'</option>';
  }).join('');

  var h = '<div class="page-head"><div><h2>Log Aktivitas</h2>'
    + '<div class="desc">Siapa masuk, siapa membuka halaman apa, dan siapa yang menambah, mengubah, atau menghapus data</div></div>'
    + (canDo('log','delete') ? '<button class="btn btn-ghost" onclick="logBersihkan()">Bersihkan log</button>' : '')
    + '</div>';

  h += '<div class="lap-filter">'
    + '<div class="lap-filter-f grow"><label>Cari</label><input id="log_cari" value="'+esc(LOG_FILTER.cari)+'" placeholder="nama, aksi, nomor bukti, IP…" oninput="logKetik()"></div>'
    + '<div class="lap-filter-f"><label>Pengguna</label><select id="log_user" onchange="logRefresh()">'+opsiUser+'</select></div>'
    + '<div class="lap-filter-f"><label>Jenis</label><select id="log_jenis" onchange="logRefresh()">'+opsiJenis+'</select></div>'
    + '<div class="lap-filter-f"><label>Dari tanggal</label><input type="date" id="log_dari" value="'+esc(LOG_FILTER.dari)+'" onchange="logRefresh()"></div>'
    + '<div class="lap-filter-f"><label>Sampai tanggal</label><input type="date" id="log_sampai" value="'+esc(LOG_FILTER.sampai)+'" onchange="logRefresh()"></div>'
    + '<button class="btn btn-ghost lap-filter-reset" onclick="logReset()">Reset</button>'
    + '</div>';

  h += '<div id="logBody">' + logTabel(d) + '</div>';
  el('content').innerHTML = h;
}

var _logKetikTimer = null;
function logKetik(){
  clearTimeout(_logKetikTimer);
  _logKetikTimer = setTimeout(logRefresh, 280);
}

function logTabel(d){
  var rows = d.rows || [];
  var h = '<div class="log-info">Menampilkan <b>'+rows.length+'</b> dari <b>'+d.total+'</b> catatan yang cocok'
    + ' &middot; tersimpan '+d.tersimpan+' catatan (batas '+d.batasSimpan+', yang terlama otomatis dibuang)</div>';

  h += '<div class="table-wrap"><div style="overflow:auto"><table class="log-tabel"><thead><tr>'
    + '<th>Waktu</th><th>Pengguna</th><th>Aktivitas</th><th>Rincian</th><th>Asal</th>'
    + '</tr></thead><tbody>';

  if (!rows.length) {
    h += '<tr><td colspan="5"><div class="empty"><div class="big">🗒️</div>Tidak ada catatan yang cocok dengan filter ini.</div></td></tr>';
  } else {
    rows.forEach(function(r){
      var m = logLabel(r.aksi);
      var waktu = '-';
      try {
        var t = new Date(r.waktu);
        waktu = t.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})
              + ' <span class="muted">' + t.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) + '</span>';
      } catch(e) {}
      var rincian = '';
      if (r.detail)  rincian += '<div class="log-detail">'+esc(r.detail)+'</div>';
      if (r.ringkas) rincian += '<div class="log-ringkas">'+esc(r.ringkas)+'</div>';
      if (!rincian)  rincian = '<span class="muted">—</span>';
      h += '<tr>'
        + '<td class="log-waktu">'+waktu+'</td>'
        + '<td><b>'+esc(r.username||'-')+'</b></td>'
        + '<td><span class="badge '+m[1]+'">'+esc(m[0])+'</span></td>'
        + '<td>'+rincian+'</td>'
        + '<td class="log-asal"><div>'+esc(r.ip||'-')+'</div>'
          + (r.ua ? '<div class="muted" title="'+esc(r.ua)+'">'+esc(ringkasPeramban(r.ua))+'</div>' : '')
        + '</td>'
        + '</tr>';
    });
  }
  h += '</tbody></table></div></div>';
  return h;
}

/* "Mozilla/5.0 (Windows NT 10.0…) Chrome/140" -> "Chrome di Windows" */
function ringkasPeramban(ua){
  var s = String(ua||'');
  var mesin = /Windows/i.test(s) ? 'Windows'
            : /Android/i.test(s) ? 'Android'
            : /iPhone|iPad|iOS/i.test(s) ? 'iOS'
            : /Mac OS X|Macintosh/i.test(s) ? 'Mac'
            : /Linux/i.test(s) ? 'Linux' : '';
  var app = /Edg\//i.test(s) ? 'Edge'
          : /OPR\/|Opera/i.test(s) ? 'Opera'
          : /Chrome\//i.test(s) ? 'Chrome'
          : /Firefox\//i.test(s) ? 'Firefox'
          : /Safari\//i.test(s) ? 'Safari' : 'Peramban';
  return app + (mesin ? ' di ' + mesin : '');
}

function logBersihkan(){
  if (!confirm('Hapus seluruh catatan log aktivitas? Tindakan ini tidak bisa dibatalkan.')) return;
  gas('apiHapusAudit')(TOKEN).then(function(r){
    toast(r.dihapus + ' catatan dihapus');
    viewLog();
  }).catch(handleErr);
}

/* ================================================================
   PERAWATAN DATA — perbaikan sekali jalan
   ================================================================ */
function perawatanHTML(){
  return '<div class="card set-panel">'
    + '<h3>Perbaikan Data Lama</h3>'
    + '<p class="muted" style="font-size:12.5px;line-height:1.5;margin:6px 0 14px">'
    + 'Aturan rekap dan pilar sudah diperbaiki, tetapi baris yang sudah terlanjur tersimpan masih membawa nilai lama. '
    + 'Alat ini menyisirnya tanpa perlu impor ulang. Dua hal yang disentuh:<br>'
    + '<b>1.</b> Pilar yang jelas keliru — mis. <i>Donasi NTT</i> yang masuk Sosial Dakwah, seharusnya Kemanusiaan. '
    + 'Peruntukan yang tidak dikenali dibiarkan apa adanya supaya pilar dari jurnal tidak ikut tertimpa.<br>'
    + '<b>2.</b> Tautan KLL/ULL yang tidak berdasar — mis. donatur <i>SMP N 2 Srandakan</i> yang tertaut ke KLL Srandakan '
    + 'padahal keterangannya tidak menyebut KLL sama sekali.<br>'
    + 'Nominal, tanggal, dan nama donatur tidak pernah diubah.'
    + '</p>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
    + '<button class="btn btn-primary" onclick="perbaikanPeriksa()">Periksa dulu</button>'
    + '<button class="btn btn-ghost hidden" id="btnTerapkanPerbaikan" onclick="perbaikanTerapkan()">Terapkan perbaikan</button>'
    + '</div>'
    + '<div id="perbaikanHasil" style="margin-top:16px"></div>'
    + '</div>';
}

function perbaikanPeriksa(){
  var host = el('perbaikanHasil');
  host.innerHTML = BOXES_SPINNER;
  el('btnTerapkanPerbaikan').classList.add('hidden');
  gas('apiPerbaikiDataLama')(TOKEN, false).then(function(d){
    host.innerHTML = perbaikanHTML(d);
    if (d.totalBerubah > 0) el('btnTerapkanPerbaikan').classList.remove('hidden');
  }).catch(function(e){ host.innerHTML=''; handleErr(e); });
}

function perbaikanTerapkan(){
  if (!confirm('Terapkan perbaikan pada data yang tampil di pratinjau?')) return;
  var host = el('perbaikanHasil');
  host.innerHTML = BOXES_SPINNER;
  gas('apiPerbaikiDataLama')(TOKEN, true).then(function(d){
    el('btnTerapkanPerbaikan').classList.add('hidden');
    host.innerHTML = '<div class="imp-note">Selesai. <b>'+d.totalBerubah+'</b> baris disesuaikan dari '+d.totalDiperiksa+' baris yang diperiksa. '
      + 'Perubahan ini tercatat di Log Aktivitas.</div>' + perbaikanHTML(d);
    toast(d.totalBerubah + ' baris diperbaiki');
  }).catch(function(e){ host.innerHTML=''; handleErr(e); });
}

function perbaikanHTML(d){
  if (!d.totalBerubah) {
    return '<div class="empty" style="padding:26px"><div class="big">✅</div>'
      + 'Tidak ada yang perlu diperbaiki. '+d.totalDiperiksa+' baris sudah sesuai aturan.</div>';
  }
  var h = '<div class="imp-note">Ditemukan <b>'+d.totalBerubah+'</b> baris yang perlu disesuaikan dari '
    + d.totalDiperiksa+' baris: <b>'+d.pilarUbahTotal+'</b> pilar dan <b>'+d.layananLepasTotal+'</b> tautan layanan.'
    + (d.diterapkan ? '' : ' Belum ada yang disimpan — periksa dulu daftarnya di bawah.')
    + '</div>';

  function tabel(judul, rows, total, kolomDari){
    if (!rows.length) return '';
    var t = '<h4 style="margin:16px 0 8px;font-family:var(--head);font-size:13.5px">'+judul+' <span class="muted">('+total+')</span></h4>'
      + '<div class="table-wrap"><div style="overflow:auto;max-height:320px"><table class="log-tabel"><thead><tr>'
      + '<th>Tanggal</th><th>Donatur</th><th>'+kolomDari+'</th><th>Semula</th><th>Menjadi</th><th>Nominal</th>'
      + '</tr></thead><tbody>';
    rows.forEach(function(r){
      t += '<tr><td>'+esc(r.tanggal||'-')+'</td><td>'+esc(r.donatur||'-')+'</td>'
        + '<td class="muted">'+esc(r.program||'-')+'</td>'
        + '<td><span class="badge red">'+esc(r.dari)+'</span></td>'
        + '<td><span class="badge green">'+esc(r.jadi)+'</span></td>'
        + '<td style="text-align:right;white-space:nowrap">'+rp(r.jumlah)+'</td></tr>';
    });
    t += '</tbody></table></div></div>';
    if (total > rows.length) t += '<div class="muted" style="font-size:12px;margin-top:6px">…dan '+(total-rows.length)+' baris lain (semuanya tetap ikut diperbaiki).</div>';
    return t;
  }

  h += tabel('Pilar yang dibetulkan', d.pilarUbah, d.pilarUbahTotal, 'Peruntukan');
  h += tabel('Tautan layanan yang dilepas ke Penghimpunan Daerah', d.layananLepas, d.layananLepasTotal, 'Peruntukan');
  return h;
}
