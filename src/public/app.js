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

var MENU=[
  {id:'dashboard',label:'Dashboard',ic:'◫',mod:'dashboard'},
  {id:'penghimpunan',label:'Penghimpunan',ic:'↓',mod:'penghimpunan'},
  {id:'pentasyarufan',label:'Pentasyarufan',ic:'↑',mod:'pentasyarufan'},
  {id:'donatur',label:'Donatur',ic:'👤',mod:'penghimpunan'},
  {id:'laporan',label:'Laporan',ic:'▤',mod:'laporan'},
  {id:'users',label:'Manajemen User',ic:'☰',mod:'users'},
  {id:'settings',label:'Pengaturan',ic:'⚙',mod:'settings'}
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
  if (localStorage.getItem('sidebar_collapsed') === 'true') {
    el('appView').classList.add('collapsed');
  }
  applyTheme(localStorage.getItem('laz_theme')||SETTINGS.theme||'light');
  applyBranding();
  el('uName').textContent=ME.nama;el('uRole').textContent=ME.role==='superadmin'?'Superadmin':ME.role;
  var av=el('uAvatar');var foto=SETTINGS['uf_'+ME.id]||'';
  if(foto){av.style.backgroundImage='url('+foto+')';av.textContent='';}else{av.style.backgroundImage='';av.textContent=(ME.nama||'?').charAt(0).toUpperCase();}
  function buildNav(){
    var nav=el('nav');nav.innerHTML='';
    MENU.forEach(function(m){if(m.mod&&!canDo(m.mod,'view'))return;var d=document.createElement('button');d.className='tn-item';d.id='nav_'+m.id;d.title=m.label;d.setAttribute('aria-label',m.label);d.innerHTML='<span class="ic">'+m.ic+'</span><span class="tn-tip">'+m.label+'</span>';d.onclick=function(){go(m.id);};nav.appendChild(d);});
    var first=MENU.find(function(m){return !m.mod||canDo(m.mod,'view');});
    go(first?first.id:'dashboard');
  }
  gas('apiGetPermissionMeta')(TOKEN).then(function(meta){PERM_META=meta||{modules:[],actions:[]};buildNav();}).catch(function(){buildNav();});
}
function applyTheme(t){t=(t==='dark')?'dark':'light';document.documentElement.setAttribute('data-theme',t);localStorage.setItem('laz_theme',t);}
function applyBranding(){var logo=SETTINGS.logoData||'';var nm=SETTINGS.namaLembaga||'LAZ Digital';var b=el('brandBox'),tb=el('tbBrand');if(logo){if(b)b.innerHTML='<img class="logo-img" src="'+logo+'" alt="logo">';if(tb)tb.innerHTML='<img src="'+logo+'" alt="logo">';}else{if(b)b.innerHTML='<span class="logo">LZ</span> <span style="font-family:var(--head);font-weight:700">'+esc(nm)+'</span>';if(tb)tb.innerHTML=esc(nm);}}
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
function go(view){window.REK_HOST='';window.LAY_HOST='';document.querySelectorAll('.tn-item').forEach(function(n){n.classList.remove('active');});var a=el('nav_'+view);if(a)a.classList.add('active');closeSidebar();var c=el('content');if(c){c.classList.remove('view-enter');void c.offsetWidth;c.classList.add('view-enter');}({dashboard:viewDashboard,penghimpunan:viewPenghimpunan,pentasyarufan:viewPentasyarufan,donatur:viewDonatur,laporan:viewLaporan,rekening:viewRekening,layanan:viewLayanan,users:viewUsers,settings:viewSettings}[view]||viewDashboard)();}

/* ============ MODAL ============ */
function openModal(t,b,f){el('modalTitle').textContent=t;el('modalBody').innerHTML=b;el('modalFoot').innerHTML=f||'';el('modalBg').classList.add('show');}
function closeModal(){el('modalBg').classList.remove('show');}
el('modalBg').addEventListener('click',function(e){if(e.target===el('modalBg'))closeModal();});

/* ============ DASHBOARD ============ */
function viewDashboard(){
  if (typeof window.DASH_SELECTED_MONTH === 'undefined') {
    window.DASH_SELECTED_MONTH = getCurrentMonthString();
    window.DASH_SELECTED_PEKAN = 'Semua';
    window.DASH_SELECTED_HARI = 'Semua';
  }
  // Read filter values from DOM if they exist
  var monthEl = el('dashFilterMonth');
  var pekanEl = el('dashFilterPekan');
  var hariEl = el('dashFilterHari');
  if (monthEl) window.DASH_SELECTED_MONTH = monthEl.value;
  if (pekanEl) window.DASH_SELECTED_PEKAN = pekanEl.value;
  if (hariEl) window.DASH_SELECTED_HARI = hariEl.value || 'Semua';

  gas('apiDashboard')(TOKEN, window.DASH_SELECTED_MONTH, window.DASH_SELECTED_PEKAN, window.DASH_SELECTED_HARI).then(function(d){CACHE.dash=d;renderDashboard(d);}).catch(handleErr);
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
  if(canDo('penghimpunan','create'))h+='<div class="card"><h3>Form Penerimaan Dana</h3><div id="himpunFormHost"></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px"><button class="btn btn-ghost" onclick="formHimpun(\'\',\'himpunFormHost\')">↺ Reset</button><button class="btn btn-primary" onclick="saveHimpun(\'\')">💾 Simpan Penerimaan</button></div></div>';
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
  var b='<div class="row">'+
    '<div class="field" style="flex:1 1 150px"><label>Tanggal *</label><input type="date" id="f_tanggal" value="'+(r.tanggal||today())+'"></div>'+
    '<div class="field" style="flex:1 1 150px"><label>Jenis Dana *</label>'+selOpt('f_jenisDana',JENIS_TOP,jenis,'onJenisChange()')+'</div>'+
    '<div class="field" style="flex:1.5 1 200px"><label>Detail / Sub Jenis *</label><span id="subWrap">'+selOpt('f_subJenis',SUBJENIS[jenis]||[],r.subJenis)+'</span></div>'+
    '<div class="field" style="flex:1 1 160px"><label>No. Kwitansi</label><input id="f_noKwitansi" value="'+esc(r.noKwitansi||'')+'" placeholder="Otomatis" '+(id?'':'readonly')+'></div>'+
    '</div>'+
    '<div id="pilarWrap" class="field" style="display:none"><label>Pilar Infak Terikat *</label>'+selOpt('f_pilar',KATEGORI_TERIKAT,r.pilar)+'</div>'+
    '<div class="row">'+
    '<div class="field" style="flex:1 1 160px"><label>Tipe Donatur</label>'+selOpt('f_tipeDonatur',TIPE_DONATUR,r.tipeDonatur,'onTipeChange()')+'</div>'+
    '<div class="field" style="flex:2 1 300px"><label>Nama Donatur (Muzakki) *</label>'+
    '  <div class="custom-dropdown" id="donaturDropdown">'+
    '    <input id="f_namaDonatur" placeholder="Ketik nama donatur..." value="'+esc(r.namaDonatur||'')+'" autocomplete="off">'+
    '    <div class="custom-dropdown-menu hidden" id="donaturMenu"></div>'+
    '  </div>'+
    '</div>'+
    '</div>'+
    '<div id="layWrap" class="field" style="display:none"><label>Pilih Kantor/Unit Layanan</label><span id="laySel"></span></div>'+
    '<div class="row">'+
    '<div class="field" style="flex:2 1 300px"><label>Program / Peruntukan</label><input id="f_program" value="'+esc(r.program||'')+'" placeholder="cth: Beasiswa Yatim"></div>'+
    '<div class="field" style="flex:1 1 180px"><label>Fundraising *</label>'+selOpt('f_fundraising',FUNDRAISING_OPTIONS,r.fundraising||'','')+'</div>'+
    '</div>'+
    '<div class="row">'+
    '<div class="field" style="flex:1.5 1 200px"><label>Jumlah (Rp) *</label><input type="number" id="f_jumlah" value="'+(r.jumlah||'')+'"></div>'+
    '<div class="field" style="flex:1 1 150px"><label>Metode *</label>'+selOpt('f_metode',METODE,r.metode,'onMetodeChange()')+'</div>'+
    '<div class="field" style="flex:1 1 120px"><label>Status</label>'+selOpt('f_statusBayar',['Lunas','Pending'],r.statusBayar||'Lunas')+'</div>'+
    '</div>'+
    '<div id="rekWrap" class="field" style="display:none"><label>Rekening Tujuan</label><span id="rekSel"></span></div>'+
    '<div class="row">'+
    '<div class="field" style="flex:2 1 350px"><label>Alamat</label><input id="f_alamat" value="'+esc(r.alamat||'')+'"></div>'+
    '<div class="field" style="flex:1 1 160px"><label>Telepon/WA</label><input id="f_telepon" value="'+esc(r.telepon||'')+'"></div>'+
    '<div class="field" style="flex:1 1 180px"><label>Email</label><input id="f_email" value="'+esc(r.email||'')+'"></div>'+
    '</div>'+
    '<div class="field"><label>Keterangan</label><textarea id="f_keterangan">'+esc(r.keterangan||'')+'</textarea></div>';
  
  if(host){el(host).innerHTML=b;}else{openModal(id?'Edit Penghimpunan':'Catat Penghimpunan',b,'<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveHimpun(\''+(id||'')+'\')">Simpan</button>');}
  
  var uniqueNames = [];
  (CACHE.himpun || []).forEach(function(x) {
    if (x.namaDonatur && x.namaDonatur !== 'NN' && x.namaDonatur !== 'Setor Tunai' && uniqueNames.indexOf(x.namaDonatur) === -1) {
      uniqueNames.push(x.namaDonatur);
    }
  });
  uniqueNames = ['NN', 'Setor Tunai', 'Bagi Hasil Bank', 'Pengembalian UMP'].concat(uniqueNames.slice(0, 100));
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
    telepon:el('f_telepon').value,email:el('f_email').value,alamat:el('f_alamat').value,jumlah:el('f_jumlah').value,
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
  if(!d.namaDonatur||!d.jumlah){toast('Nama donatur & jumlah wajib diisi',true);return;}
  if(!d.fundraising){toast('Fundraising wajib dipilih',true);return;}
  if(id)d.id=id;
  gas('apiSavePenghimpunan')(TOKEN,d).then(function(saved){closeModal();toast('Penghimpunan tersimpan');viewPenghimpunan();if(!id)setTimeout(function(){confirmDialog({title:'Berhasil Disimpan',message:'Cetak kwitansi sekarang?',okText:'🖨️ Cetak Sekarang',cancelText:'Nanti Saja',icon:'🧾'}).then(function(__ok){if(__ok)cetakKwitansi(saved.id);});},300);}).catch(handleErr);
}
function delHimpun(id){uiConfirm('Hapus data ini?').then(function(__ok){if(!__ok)return;gas('apiDeletePenghimpunan')(TOKEN,id).then(function(){toast('Terhapus');viewPenghimpunan();}).catch(handleErr);});}

/* ============ KWITANSI ============ */
function terbilang(n){n=Math.floor(Math.abs(Number(n))||0);var s=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];function t(x){if(x<12)return s[x];if(x<20)return t(x-10)+' belas';if(x<100)return t(Math.floor(x/10))+' puluh'+(x%10?' '+t(x%10):'');if(x<200)return 'seratus'+(x%100?' '+t(x%100):'');if(x<1000)return t(Math.floor(x/100))+' ratus'+(x%100?' '+t(x%100):'');if(x<2000)return 'seribu'+(x%1000?' '+t(x%1000):'');if(x<1000000)return t(Math.floor(x/1000))+' ribu'+(x%1000?' '+t(x%1000):'');if(x<1000000000)return t(Math.floor(x/1000000))+' juta'+(x%1000000?' '+t(x%1000000):'');return t(Math.floor(x/1000000000))+' miliar'+(x%1000000000?' '+t(x%1000000000):'');}if(n===0)return 'nol';return t(n).replace(/\s+/g,' ').trim();}
function cetakKwitansi(id){gas('apiGetKwitansi')(TOKEN,id).then(function(res){printDoc(buildKwitansiHTML(res.data,res.settings));}).catch(handleErr);}
function buildKwitansiHTML(d,s){var det=(d.subJenis||d.jenisDana)+((String(d.subJenis).toLowerCase().indexOf('pilar')>=0&&d.pilar)?' - '+d.pilar:'');
  return docShell('Kwitansi '+esc(d.noKwitansi),headerHTML(s,'TANDA TERIMA / KWITANSI',d.noKwitansi)+'<table class="kv">'+rowKV('Telah diterima dari',d.namaDonatur)+rowKV('Alamat',d.alamat||'-')+rowKV('Jenis Dana',d.jenisDana+' — '+det)+(d.program?rowKV('Program',d.program):'')+rowKV('Terbilang','<i>'+terbilang(d.jumlah)+' rupiah</i>')+rowKV('Metode',(d.metode||'-')+(d.bank?' ('+d.bank+')':''))+rowKV('Keterangan',d.keterangan||'-')+'</table><div class="amount-box">'+rp(d.jumlah)+'</div>'+signHTML(s,d.petugas,'Penyetor','Petugas / Amil')+'<div class="note">Kwitansi ini sah sebagai bukti pembayaran. Jazakumullah khairan katsiran. ('+(d.statusBayar==='Pending'?'PENDING':'LUNAS')+')</div>');}

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
  if(canDo('pentasyarufan','create'))h+='<div class="card"><h3>Form Penyaluran Dana</h3><div id="tasyarufFormHost"></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px"><button class="btn btn-ghost" onclick="formTasyaruf(\'\',\'tasyarufFormHost\')">↺ Reset</button><button class="btn btn-primary" onclick="saveTasyaruf(\'\')">💾 Simpan Penyaluran</button></div></div>';
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
function formTasyaruf(id,host){var r=id?CACHE.tasyaruf.find(function(x){return x.id===id;}):{};
  var b='<div class="row"><div class="field" style="flex:1 1 150px"><label>Tanggal *</label><input type="date" id="f_tanggal" value="'+(r.tanggal||today())+'"></div><div class="field" style="flex:1 1 160px"><label>No. Bukti</label><input id="f_noBukti" value="'+esc(r.noBukti||'')+'" placeholder="Otomatis" '+(id?'':'readonly')+'></div></div>'+
    '<div class="row"><div class="field" style="flex:1.5 1 200px"><label>Ashnaf / Golongan *</label>'+selOpt('f_ashnaf',ASHNAF,r.ashnaf)+'</div><div class="field" style="flex:1 1 150px"><label>Sumber Dana</label>'+selOpt('f_sumberDana',JENIS_TOP,r.sumberDana)+'</div></div>'+
    '<div class="row"><div class="field" style="flex:2 1 300px"><label>Program Penyaluran</label><input id="f_program" value="'+esc(r.program||'')+'" placeholder="cth: Bedah Rumah Dhuafa"></div>'+
    '<div class="field" style="flex:1 1 180px"><label>Fundraising *</label>'+selOpt('f_fundraising',FUNDRAISING_OPTIONS,r.fundraising||'','')+'</div></div>'+
    '<div class="row"><div class="field" style="flex:2 1 300px"><label>Nama Penerima (Mustahik) *</label>'+
    '  <div class="custom-dropdown" id="penerimaDropdown">'+
    '    <input id="f_namaPenerima" placeholder="Ketik nama penerima..." value="'+esc(r.namaPenerima||'')+'" autocomplete="off">'+
    '    <div class="custom-dropdown-menu hidden" id="penerimaMenu"></div>'+
    '  </div>'+
    '</div><div class="field" style="flex:1 1 180px"><label>NIK</label><input id="f_nik" value="'+esc(r.nik||'')+'"></div></div>'+
    '<div class="row"><div class="field" style="flex:1 1 160px"><label>Telepon/WA</label><input id="f_telepon" value="'+esc(r.telepon||'')+'"></div><div class="field" style="flex:1 1 160px"><label>Bentuk Bantuan</label>'+selOpt('f_bentukBantuan',BENTUK,r.bentukBantuan)+'</div></div>'+
    '<div class="field" style="width:100%"><label>Alamat</label><input id="f_alamat" value="'+esc(r.alamat||'')+'"></div>'+
    '<div class="row"><div class="field" style="flex:1.5 1 200px"><label>Jumlah/Nilai (Rp) *</label><input type="number" id="f_jumlah" value="'+(r.jumlah||'')+'"></div><div class="field" style="flex:1 1 150px"><label>Metode</label>'+selOpt('f_metode',METODE,r.metode)+'</div><div class="field" style="flex:1 1 120px"><label>Status</label>'+selOpt('f_statusSalur',['Tersalur','Pending'],r.statusSalur||'Tersalur')+'</div></div>'+
    '<div class="field"><label>Keterangan</label><textarea id="f_keterangan">'+esc(r.keterangan||'')+'</textarea></div>';
  
  if(host){el(host).innerHTML=b;}else{openModal(id?'Edit Pentasyarufan':'Catat Pentasyarufan',b,'<button class="btn btn-ghost" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="saveTasyaruf(\''+(id||'')+'\')">Simpan</button>');}

  var uniquePenerima = [];
  (CACHE.tasyaruf || []).forEach(function(x) {
    if (x.namaPenerima && x.namaPenerima !== 'Lazismu Daerah Bantul' && uniquePenerima.indexOf(x.namaPenerima) === -1) {
      uniquePenerima.push(x.namaPenerima);
    }
  });
  uniquePenerima = ['Lazismu Daerah Bantul'].concat(uniquePenerima.slice(0, 100));
  setupSearchDropdown('f_namaPenerima', 'penerimaMenu', uniquePenerima);
}
function saveTasyaruf(id){var f=['tanggal','noBukti','ashnaf','sumberDana','program','namaPenerima','nik','telepon','alamat','jumlah','bentukBantuan','metode','statusSalur','keterangan','fundraising'];var d={};f.forEach(function(k){d[k]=el('f_'+k)?el('f_'+k).value:'';});if(!d.namaPenerima||!d.jumlah||!d.fundraising){toast('Nama penerima, jumlah & Fundraising wajib diisi',true);return;}if(id)d.id=id;
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
var LAP_TAB='jurnal';
function viewLaporan(){renderLaporanShell();}
function renderLaporanShell(){
  var now=new Date();
  var h='<div class="page-head"><div><h1>Laporan</h1><div class="desc">Jurnal penerimaan & broadcast WhatsApp</div></div></div>';
  h+='<div style="display:flex;gap:8px;margin-bottom:20px"><button class="btn '+(LAP_TAB==='jurnal'?'btn-primary':'btn-ghost')+'" onclick="setLapTab(\'jurnal\')">🧾 Jurnal Penerimaan</button><button class="btn '+(LAP_TAB==='broadcast'?'btn-primary':'btn-ghost')+'" onclick="setLapTab(\'broadcast\')">📢 Broadcast WhatsApp</button></div>';
  h+='<div id="lapBody"></div>';
  el('content').innerHTML=h;
  if(LAP_TAB==='jurnal')renderJurnalForm();else renderBroadcastForm();
}
function setLapTab(t){LAP_TAB=t;renderLaporanShell();}
function renderJurnalForm(){
  var now=new Date();var yopt='';for(var y=now.getFullYear()+1;y>=now.getFullYear()-3;y--)yopt+='<option '+(y===now.getFullYear()?'selected':'')+'>'+y+'</option>';
  var mopt='';for(var m=1;m<=12;m++)mopt+='<option value="'+m+'" '+((m-1)===now.getMonth()?'selected':'')+'>'+BULAN[m]+'</option>';
  var h='<div class="card" style="max-width:560px"><h3 style="margin-bottom:6px">Generate Jurnal Penerimaan</h3><p class="muted" style="font-size:13px;margin-bottom:18px">Pilih bulan & tahun, lalu lihat laporan detail atau unduh jurnal dalam format Excel (.xlsx) sesuai standar akuntansi.</p><div class="row"><div class="field"><label>Bulan</label><select id="j_bulan">'+mopt+'</select></div><div class="field"><label>Tahun</label><select id="j_tahun">'+yopt+'</select></div></div><div style="display:flex;gap:12px;margin-top:20px"><button class="btn btn-ghost" style="flex:1;border:1px solid var(--border)" onclick="loadJurnal()">👁 Lihat Laporan</button><button class="btn btn-primary" style="flex:1" onclick="loadJurnalAndDownload()">⬇ Unduh Excel</button></div></div><div id="jurnalPreview" style="margin-top:20px"></div>';
  el('lapBody').innerHTML=h;
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

function renderJurnalPreview(d){
  if(!d.count){el('jurnalPreview').innerHTML='<div class="card empty"><div class="big">🧾</div>Tidak ada penerimaan pada '+esc(d.periode)+'.</div>';return;}
  var h='<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px"><div><h3>'+esc(d.title)+'</h3><div class="muted" style="font-size:13px">'+esc(d.settings.namaLembaga||'')+' • Periode '+esc(d.periode)+' • '+d.count+' transaksi</div></div><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" style="border:1px solid var(--border)" onclick="copyAllJurnal()">📋 Salin Semua</button><button class="btn btn-primary btn-sm" onclick="exportJurnalXlsx(CACHE.jurnal)">⬇ Unduh .xlsx</button></div></div>';
  h+='<div style="overflow:auto"><table><thead><tr><th>Tanggal</th><th>Akun</th><th>Debit</th><th>Kredit</th><th>Keterangan</th></tr></thead><tbody>';
  d.sections.forEach(function(sec, idx){
    h+='<tr style="background:rgba(255,255,255,.03)"><td colspan="5" style="padding:10px 12px"><div style="display:flex;justify-content:space-between;align-items:center;width:100%"><span style="font-weight:700;font-family:var(--font);letter-spacing:.5px">'+esc(sec.title)+'</span><button class="btn btn-ghost btn-xs" onclick="copySectionJurnal('+idx+')" style="padding:2px 6px;font-size:11px;margin:0;border:1px solid var(--border);border-radius:4px;height:24px;line-height:20px;display:flex;align-items:center;gap:4px">📋 Salin Kategori</button></div></td></tr>';
    sec.lines.forEach(function(l){
      h+='<tr><td>'+esc(l.tanggal)+'</td><td>'+esc(l.akun)+'</td><td>'+(l.debit!==''?rp(l.debit):'')+'</td><td>'+(l.kredit!==''?rp(l.kredit):'')+'</td><td class="muted">'+esc(l.ket)+'</td></tr>';
    });
    h+='<tr><td></td><td style="font-weight:600">Subtotal</td><td colspan="2" style="font-weight:700;color:var(--green)">'+rp(sec.subtotal)+'</td><td></td></tr>';
  });
  h+='<tr><td></td><td style="font-weight:700;font-family:var(--font)">TOTAL PENERIMAAN</td><td colspan="2" style="font-weight:700;color:var(--primary);font-size:15px">'+rp(d.grandTotal)+'</td><td></td></tr>';
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
      if (ws[key] && ws[key].t === 'd') {
        ws[key].z = 'dd/mm/yyyy';
      }
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
  var e=today();var s=new Date();s.setDate(s.getDate()-6);var sStr=s.toISOString().slice(0,10);
  var h='<div class="card" style="max-width:560px"><h3 style="margin-bottom:6px">Generate Laporan Broadcast WhatsApp</h3><p class="muted" style="font-size:13px;margin-bottom:18px">Pilih rentang hari bebas. Sistem membuat deskripsi laporan siap kirim/broadcast ke donatur.</p><div class="row"><div class="field"><label>Dari Tanggal</label><input type="date" id="bc_start" value="'+sStr+'"></div><div class="field"><label>Sampai Tanggal</label><input type="date" id="bc_end" value="'+e+'"></div></div><button class="btn btn-primary" onclick="loadBroadcast()">Generate Laporan</button></div><div id="bcResult" style="margin-top:20px"></div>';
  el('lapBody').innerHTML=h;
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
  h+='<div class="tabs">'+['lembaga|Lembaga','rekening|No. Rekening','layanan|KLL / ULL','tampilan|Tampilan'].map(function(t){var p=t.split('|');return '<button class="tab'+(SET_TAB===p[0]?' active':'')+'" onclick="setTab(\''+p[0]+'\')">'+p[1]+'</button>';}).join('')+'</div><div id="setBody"></div>';
  el('content').innerHTML=h;renderSetTab(s);
}
function setTab(t){SET_TAB=t;renderSettings(SETTINGS);}
function renderSetTab(s){var host=el('setBody');if(!host)return;
  if(SET_TAB==='rekening'){host.innerHTML='<div id="setRekBody"></div>';window.REK_HOST='setRekBody';window.LAY_HOST='';viewRekening();}
  else if(SET_TAB==='layanan'){host.innerHTML='<div id="setLayBody"></div>';window.LAY_HOST='setLayBody';window.REK_HOST='';viewLayanan();}
  else {window.REK_HOST='';window.LAY_HOST='';host.innerHTML=(SET_TAB==='tampilan')?tampilanHTML(s):lembagaHTML(s);}
}
function lembagaHTML(s){var logo=s.logoData||'';
  return '<div class="card" style="max-width:760px"><h3>Logo & Identitas Lembaga</h3><div class="desc">Logo tampil penuh di sidebar & dokumen (tanpa teks)</div>'+
   '<div class="upload-box" onclick="el(\'logoFile\').click()">'+(logo?'<img class="logo-preview" src="'+logo+'">':'<div style="font-size:32px;opacity:.4">🏛️</div>')+'<div class="muted" style="font-size:12.5px;margin-top:6px">Klik untuk upload logo (PNG/JPG)</div></div>'+
   '<input type="file" id="logoFile" accept="image/*" style="display:none" onchange="onLogoUpload(event)">'+(logo?'<div style="text-align:center;margin-top:8px"><button class="btn btn-sm" onclick="removeLogo()">Hapus Logo</button></div>':'')+
   '<div class="divider"></div>'+
   '<div class="row"><div class="field" style="flex:1"><label>Nama Lembaga</label><input id="s_namaLembaga" value="'+esc(s.namaLembaga||'')+'"></div><div class="field" style="flex:1"><label>Singkatan</label><input id="s_singkatan" value="'+esc(s.singkatan||'')+'"></div></div>'+
   '<div class="field"><label>Alamat</label><input id="s_alamat" value="'+esc(s.alamat||'')+'"></div>'+
   '<div class="row-3"><div class="field"><label>Telepon</label><input id="s_telepon" value="'+esc(s.telepon||'')+'"></div><div class="field"><label>Email</label><input id="s_email" value="'+esc(s.email||'')+'"></div><div class="field"><label>Website</label><input id="s_website" value="'+esc(s.website||'')+'"></div></div>'+
   (canDo('settings','edit')?'<button class="btn btn-primary" onclick="saveSettings()" style="margin-top:8px">💾 Simpan Identitas</button>':'')+'</div>';
}
function tampilanHTML(s){var th=localStorage.getItem('laz_theme')||s.theme||'light';var lay=getDashLayout();
  var labels={tren:'Tren 12 Bulan',jenis:'Per Jenis Dana',ashnaf:'Per Ashnaf',program:'Per Program',rhimpun:'Penghimpunan Terbaru',rtasyaruf:'Pentasyarufan Terbaru'};
  var rows=lay.order.map(function(k){return '<div class="opt-row"><div><div class="ot">'+labels[k]+'</div></div><label class="switch"><input type="checkbox" data-w="'+k+'" '+(lay.vis[k]!==false?'checked':'')+' onchange="saveDashLayout()"><span class="slider"></span></label></div>';}).join('');
  return '<div class="card" style="max-width:680px"><h3>Tema Tampilan</h3><div class="desc">Pilih tema terang atau gelap</div><div class="row" style="gap:12px">'+
   '<div style="flex:1;border:2px solid '+(th==='light'?'var(--accent)':'var(--border)')+';background:'+(th==='light'?'var(--accent-soft)':'transparent')+';border-radius:12px;padding:16px;cursor:pointer" onclick="setTheme(\'light\')"><div class="ot">☀️ Terang</div><div class="od">Putih bersih, aksen oranye</div></div>'+
   '<div style="flex:1;border:2px solid '+(th==='dark'?'var(--accent)':'var(--border)')+';background:'+(th==='dark'?'var(--accent-soft)':'transparent')+';border-radius:12px;padding:16px;cursor:pointer" onclick="setTheme(\'dark\')"><div class="ot">🌙 Gelap</div><div class="od">Nyaman di mata</div></div>'+
   '</div></div>'+
   '<div class="card" style="max-width:680px"><h3>Layout Dashboard</h3><div class="desc">Atur widget mana yang tampil</div>'+rows+'</div>'+
   (canDo('dashboard','view')?'<div class="card" style="max-width:680px"><h3>Link Publik</h3><div class="desc">Bagikan dashboard tanpa login</div><button class="btn" onclick="openPublicLink()">🔗 Kelola Link Publik</button></div>':'');
}
function setTheme(t){applyTheme(t);applyBranding();if(canDo('settings','edit'))gas('apiSaveSettings')(TOKEN,{theme:t}).then(function(s){SETTINGS=s;}).catch(function(){});renderSetTab(SETTINGS);toast('Tema: '+(t==='dark'?'Gelap':'Terang'));}
function onLogoUpload(e){var f=e.target.files[0];if(!f)return;resizeImg(f,240,function(data){gas('apiSaveSettings')(TOKEN,{logoData:data}).then(function(s){SETTINGS=s;applyBranding();renderSetTab(s);toast('Logo tersimpan');}).catch(handleErr);});}
function removeLogo(){gas('apiSaveSettings')(TOKEN,{logoData:''}).then(function(s){SETTINGS=s;applyBranding();renderSetTab(s);toast('Logo dihapus');}).catch(handleErr);}
function saveDashLayout(){var def=getDashLayout();var vis={};document.querySelectorAll('[data-w]').forEach(function(c){vis[c.getAttribute('data-w')]=c.checked;});var obj={order:def.order,vis:vis};localStorage.setItem('laz_dashlayout',JSON.stringify(obj));if(canDo('settings','edit'))gas('apiSaveSettings')(TOKEN,{dashLayout:JSON.stringify(obj)}).then(function(s){SETTINGS=s;}).catch(function(){});toast('Layout disimpan');}
function saveSettings(){var d={};['namaLembaga','singkatan','alamat','telepon','email','website'].forEach(function(k){var e=el('s_'+k);if(e)d[k]=e.value;});gas('apiSaveSettings')(TOKEN,d).then(function(s){SETTINGS=s;applyBranding();toast('Pengaturan disimpan');}).catch(handleErr);}

/* ============ SHARED ============ */
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
(function(){ function init(){ var v=document.getElementById('view'); if(!v){ setTimeout(init,150); return; } var obs=new MutationObserver(function(){ v.classList.remove('view-anim'); void v.offsetWidth; v.classList.add('view-anim'); }); obs.observe(v,{childList:true}); } init(); })();

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
function initBgFx(){
  var c=document.getElementById('bgfx'); if(!c) return;
  var ctx=c.getContext('2d'), W,H, dpr=Math.min(window.devicePixelRatio||1,2);
  var COLORS=['234,106,30','247,147,30','59,130,246','139,92,246','16,185,129','236,72,153'];
  var N=window.innerWidth<700?22:46, parts=[];
  function rnd(a,b){return a+Math.random()*(b-a);}
  function reset(p,init){p.x=rnd(0,W);p.y=init?rnd(0,H):H+24;p.r=rnd(1.1,3.4);p.sp=rnd(.10,.42);p.sw=rnd(.25,1.0);p.ph=rnd(0,6.28);p.col=COLORS[(Math.random()*COLORS.length)|0];p.a=rnd(.16,.5);}
  function build(){parts=[];for(var i=0;i<N;i++){var p={};reset(p,true);parts.push(p);}}
  function size(){W=window.innerWidth;H=window.innerHeight;c.width=W*dpr;c.height=H*dpr;c.style.width=W+'px';c.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}
  var mx=-999,my=-999;
  window.addEventListener('mousemove',function(e){mx=e.clientX;my=e.clientY;});
  function tick(){
    var dark=document.documentElement.getAttribute('data-theme')==='dark';
    ctx.clearRect(0,0,W,H);
    for(var i=0;i<parts.length;i++){var p=parts[i];
      p.ph+=0.008; p.y-=p.sp; p.x+=Math.sin(p.ph)*p.sw*0.35;
      var dx=p.x-mx,dy=p.y-my,d2=dx*dx+dy*dy;
      if(d2<13000){var d=Math.sqrt(d2)+.5,f=(13000-d2)/13000;p.x+=dx/d*f*1.4;p.y+=dy/d*f*1.4;}
      if(p.y<-24)reset(p,false);
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);
      ctx.fillStyle='rgba('+p.col+','+(dark?p.a*0.95:p.a)+')';
      ctx.shadowColor='rgba('+p.col+',.55)';ctx.shadowBlur=9;ctx.fill();
    }
    ctx.shadowBlur=0;requestAnimationFrame(tick);
  }
  size();build();tick();
  window.addEventListener('resize',function(){size();build();});
}

/* ===== DASHBOARD v6 RENDER ===== */
var WIDGETS={
  rekening:{t:'Tunai & Non Tunai',dot:'#0ea5e9'},
  tren:{t:'Tren Arus Dana',dot:'#ea6a1e'},
  jenis:{t:'Jenis Dana Terhimpun',dot:'#f7931e'},
  pilar:{t:'Pilar Program',dot:'#10b981'},
  bank:{t:'Bank & Kas',dot:'#f43f5e'},
  ashnaf:{t:'Penyaluran Berdasarkan Ashnaf',dot:'#8b5cf6'},
  program:{t:'Kantor Layanan & ULL',dot:'#3b82f6'},
  fundraising:{t:'Capaian Fundraising',dot:'#ec4899'},
  rhimpun:{t:'Penghimpunan Terbaru',dot:'#10b981'},
  rtasyaruf:{t:'Pentasyarufan Terbaru',dot:'#ec4899'}
};
function dashGreeting(){var h=new Date().getHours();return h<11?'Selamat pagi':h<15?'Selamat siang':h<19?'Selamat sore':'Selamat malam';}
function avColor(s){var p=['#ea6a1e','#f7931e','#8b5cf6','#3b82f6','#10b981','#ec4899','#0ea5e9','#f59e0b'];var n=0;s=s||'?';for(var i=0;i<s.length;i++)n+=s.charCodeAt(i);return p[n%p.length];}

function kpiSpark(series,key){
  if(!series||!series.length)return '';
  var vals=series.map(function(s){return s[key]||0;});
  var max=Math.max.apply(null,vals)||1,min=Math.min.apply(null,vals);
  var W=84,H=26,n=vals.length;
  var pts=vals.map(function(v,i){var x=(i/(n-1||1))*W;var y=H-2-((v-min)/((max-min)||1))*(H-4);return x.toFixed(1)+','+y.toFixed(1);});
  var d='M'+pts.join(' L');
  var area=d+' L'+W+','+H+' L0,'+H+' Z';
  var col=key==='himpun'?'#ea6a1e':'#3b82f6';
  var gid='sg_'+key+'_'+Math.random().toString(36).slice(2,7);
  return '<svg class="kpi-spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+col+'" stop-opacity=".28"/><stop offset="1" stop-color="'+col+'" stop-opacity="0"/></linearGradient></defs><path d="'+area+'" fill="url(#'+gid+')"/><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function kpiCard(key,label,val,ic,bg,trend,trv,spark){
  var tc=trend==='up'?'kpi-up':trend==='down'?'kpi-down':'kpi-flat';
  var ta=trend==='up'?'▲':trend==='down'?'▼':'●';
  return '<div class="kpi kpi-'+key+'" onclick="openDashDetail(\''+key+'\')">'+
    '<div class="kpi-top"><div class="kpi-ic" style="background:'+bg+'">'+ic+'</div><div class="kpi-lb">'+label+'</div></div>'+
    '<div class="kpi-val">'+val+'</div>'+
    '<div class="kpi-meta"><span class="kpi-tr '+tc+'">'+ta+' '+trv+'</span>'+(spark||'')+'</div></div>';
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
  
  var toggleHtml = '<div class="dash-toggle-group" style="display:flex;background:var(--border2);padding:4px;border-radius:10px;gap:4px;margin-bottom:16px;border:1px solid var(--border)">' +
    '<button class="dash-toggle-btn ' + (mode === 'himpun' ? 'active' : '') + '" style="flex:1;background:' + (mode === 'himpun' ? 'var(--surface)' : 'transparent') + ';border:none;color:' + (mode === 'himpun' ? 'var(--text)' : 'var(--text2)') + ';font-size:12px;font-weight:600;padding:8px 0;border-radius:8px;cursor:pointer;transition:all 0.15s;box-shadow:' + (mode === 'himpun' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none') + '" onclick="setDashLayananMode(\'himpun\')">📥 Penerimaan</button>' +
    '<button class="dash-toggle-btn ' + (mode === 'salur' ? 'active' : '') + '" style="flex:1;background:' + (mode === 'salur' ? 'var(--surface)' : 'transparent') + ';border:none;color:' + (mode === 'salur' ? 'var(--text)' : 'var(--text2)') + ';font-size:12px;font-weight:600;padding:8px 0;border-radius:8px;cursor:pointer;transition:all 0.15s;box-shadow:' + (mode === 'salur' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none') + '" onclick="setDashLayananMode(\'salur\')">📤 Pentasyarufan</button>' +
    '</div>';
    
  var dataObj = (mode === 'himpun') ? d.byLayananHimpun : d.byLayananSalur;
  var keys = Object.keys(dataObj || {});
  
  if (!keys.length) {
    return toggleHtml + '<div class="muted" style="padding:24px 0;text-align:center;font-size:13px">Belum ada data Kantor Layanan.</div>';
  }
  
  keys.sort(function(a, b) {
    return dataObj[b] - dataObj[a];
  });
  
  var color = (mode === 'himpun' ? 'var(--green)' : 'var(--red)');
  var html = toggleHtml + '<div style="display:flex;flex-direction:column;gap:8px">';
  
  keys.forEach(function(x) {
    var val = dataObj[x] || 0;
    if (val === 0) return;
    
    html += '<div class="wc-row-clickable" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid var(--border);border-radius:12px;background:var(--border2);cursor:pointer;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.02)" onclick="openLayananDetail(\'' + esc(x) + '\', \'' + mode + '\')">' +
      '<div style="font-weight:600;font-size:13.5px;color:var(--text);flex:1;padding-right:12px;white-space:normal;line-height:1.4">' + esc(x) + ' <span style="font-size:10px;color:var(--text2);background:var(--border);padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:500">🔍 Detail</span></div>' +
      '<div style="font-weight:750;font-size:14.5px;color:' + color + ';white-space:nowrap;flex:0 0 auto;text-align:right;line-height:1.4">' + rp(val) + '</div>' +
      '</div>';
  });
  
  html += '</div>';
  return html;
}

function setDashLayananMode(mode) {
  window.DASH_LAYANAN_MODE = mode;
  renderDashboard(window.DASH);
}

function getLayananNameForTx(r) {
  var layMap = {};
  (CACHE.layanan || []).forEach(function(l) {
    layMap[l.id] = (l.tipe ? l.tipe + ' ' : '') + l.nama;
  });
  
  var layName = 'Lazismu Daerah Bantul';
  if (r.layananId && layMap[r.layananId]) {
    layName = layMap[r.layananId];
  } else {
    var pStr = String(r.program || '');
    var dStr = String(r.namaDonatur || r.namaPenerima || '');
    if (pStr.indexOf('KLL ') === 0 || pStr.indexOf('KL ') === 0 || pStr.indexOf('ULL ') === 0) {
      layName = pStr;
    } else if (dStr.indexOf('KLL ') === 0 || dStr.indexOf('KL ') === 0 || dStr.indexOf('ULL ') === 0) {
      layName = dStr;
    }
  }
  
  var matchedLay = (CACHE.layanan || []).find(function(l) {
    var ln = l.nama.toLowerCase();
    var lnm = layName.toLowerCase();
    return lnm.indexOf(ln) >= 0 || ln.indexOf(lnm) >= 0;
  });
  
  return matchedLay ? ((matchedLay.tipe ? matchedLay.tipe + ' ' : '') + matchedLay.nama) : 'Lazismu Daerah Bantul';
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

function widgetBody(id,d){
  if(id==='rekening')return rekeningWidget(d.byRekening);
  if(id==='tren')return areaChart(d.series);
  if(id==='jenis')return barsWidget(d.byJenis);
  if(id==='pilar')return barsWidget(d.byPilar);
  if(id==='bank')return barsWidget(d.byBank);
  if(id==='ashnaf')return barsWidget(d.byAshnaf);
  if(id==='program')return layananWidget(d);
  if(id==='fundraising')return barsWidget(d.byFundraising);
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

function renderDashboard(d){
  window.DASH=d;
  var lay=getDashLayout();
  var canView=(typeof canDo!=='function')||canDo('dashboard','view');
  var pubBtn=canView?'<button class="dh-btn" onclick="openPublicLink()">🔗 Link Publik</button>':'';
  var edClass=window.DASH_EDIT?'on':'';
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

  var hero='<div class="dh">' +
    '<div class="dh-bg"></div>' +
    '<div class="dh-content">' +
      '<div class="dh-row">' +
        '<div><div class="dh-hi">'+dashGreeting()+', '+esc(nm)+' 👋</div>'+
        '<div class="dh-sub">'+today+' • Ringkasan dana lembaga Anda</div></div>'+
        '<div class="dh-acts">' +
          '<div class="dh-act-row">' + pubBtn + '<button class="dh-btn '+edClass+'" id="dashEditBtn" onclick="toggleDashEdit()">⚙ '+(window.DASH_EDIT?'Selesai':'Atur Layout')+'</button></div>' +
          '<div class="dh-act-row">' + monthDropdown + pekanDropdown + dayDropdown + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  var trH=d.transaksiHimpun||0,trT=d.transaksiTasyaruf||0;
  
  var orangCardHtml = '<div style="display:flex;gap:8px;margin:4px 0 2px;font-family:var(--head);letter-spacing:0">' +
    '<div style="flex:1">' +
      '<div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:2px">Donatur</div>' +
      '<div style="font-size:16px;font-weight:750;color:var(--text);white-space:nowrap">' + (d.jumlahDonatur||0) + ' <span style="font-size:10.5px;color:var(--text2);font-weight:normal">jiwa</span></div>' +
    '</div>' +
    '<div style="width:1px;background:rgba(100,116,139,0.15);align-self:stretch"></div>' +
    '<div style="flex:1">' +
      '<div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:2px">Mustahik</div>' +
      '<div style="font-size:16px;font-weight:750;color:var(--text);white-space:nowrap">' + (d.jumlahMustahik||0) + ' <span style="font-size:10.5px;color:var(--text2);font-weight:normal">jiwa</span></div>' +
    '</div>' +
  '</div>';

  var kpis='<div class="kpis">'+
    kpiCard('himpun','Total Penghimpunan',rp(d.totalHimpun),'↑','linear-gradient(135deg,#ea6a1e,#f7931e)','up',trH+' transaksi',kpiSpark(d.series,'himpun'))+
    kpiCard('tasyaruf','Total Pentasyarufan',rp(d.totalTasyaruf),'↓','linear-gradient(135deg,#3b82f6,#60a5fa)','down',trT+' transaksi',kpiSpark(d.series,'tasyaruf'))+
    kpiCard('orang','Donatur / Mustahik',orangCardHtml,'♥','linear-gradient(135deg,#8b5cf6,#a78bfa)','flat','terdaftar','')+
    '</div>';

  var hint=window.DASH_EDIT?'<div class="edit-hint">⚙️ <b>Mode Atur Layout aktif</b> — Seret header kartu untuk memindahkan. Tarik handle <b>↘</b> di kanan bawah untuk mengubah lebar dan tinggi secara bebas. Ukuran tersimpan otomatis. Klik <b>Selesai</b> jika sudah.</div>':'';

  var cells=lay.order.filter(function(id){return WIDGETS[id]&&(!lay.vis||lay.vis[id]!==false);}).map(function(id){
    var w=WIDGETS[id];
    var sz=(lay.size&&lay.size[id])||'md';
    var hz=(lay.height&&lay.height[id])||'auto';
    
    var ctr=window.DASH_EDIT?('<div class="wc-ctrls">' +
      '<button class="cbtn hide-btn" title="Sembunyikan widget" onclick="event.stopPropagation();dashHide(\''+id+'\')">✕</button>' +
    '</div>'):'';
    var dim=(lay.dimensions&&lay.dimensions[id])||{};
    var dimStyle='';
    if(dim.width)dimStyle+='--widget-width:'+Math.round(dim.width)+'px;';
    if(dim.height)dimStyle+='--widget-height:'+Math.round(dim.height)+'px;';
    var resizeHandle=window.DASH_EDIT?'<span class="resize-handle" title="Tarik untuk mengubah ukuran">↘</span>':'';
    
    var dragHandle = window.DASH_EDIT ? '<span class="drag-handle" title="Tarik untuk memindahkan">⋮⋮</span>' : '';
    
    return '<div class="wc" data-size="'+sz+'" data-height="'+hz+'" data-id="'+id+'" style="'+dimStyle+'" draggable="'+(window.DASH_EDIT?'true':'false')+'">'+
      '<div class="wc-h"><div class="wc-t">'+dragHandle+'<span class="dot" style="background:'+w.dot+'"></span>'+w.t+'</div>'+ctr+'</div>'+
      '<div class="wc-b">'+widgetBody(id,d)+'</div>'+resizeHandle+'</div>';
  }).join('');

  var hidden=lay.order.filter(function(id){return WIDGETS[id]&&lay.vis&&lay.vis[id]===false;});
  var hiddenBar=(window.DASH_EDIT&&hidden.length)?'<div class="edit-hint" style="background:rgba(100,116,139,.08);border-color:rgba(100,116,139,.2);color:var(--ink2)">Tersembunyi: '+hidden.map(function(id){return '<button class="cbtn" style="width:auto;padding:0 8px;margin:0 3px" onclick="dashShow(\''+id+'\')">+ '+WIDGETS[id].t+'</button>';}).join('')+'</div>':'';

  el('content').innerHTML='<div class="dash-wrap view-anim'+(window.DASH_EDIT?' dash-edit':'')+'">'+hero+kpis+hint+hiddenBar+'<div class="dgrid" id="dgrid">'+cells+'</div></div>';
  if(window.DASH_EDIT){wireDashDrag();wireDashResize();}
}

/* ===== flexible layout ===== */
function getDashLayout(){
  var def={
    order:['rekening','jenis','pilar','bank','ashnaf','program','fundraising','rhimpun','rtasyaruf','tren'],
    vis:{},
    size:{rekening:'full',tren:'full',jenis:'md',pilar:'md',bank:'md',ashnaf:'md',program:'md',fundraising:'md',rhimpun:'md',rtasyaruf:'md'},
    height:{rekening:'auto',tren:'auto',jenis:'auto',pilar:'auto',bank:'auto',ashnaf:'auto',program:'auto',fundraising:'auto',rhimpun:'auto',rtasyaruf:'auto'},
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
function dashSetSize(id,sz){var lay=getDashLayout();lay.size=lay.size||{};lay.size[id]=sz;saveDashLayout(lay);renderDashboard(window.DASH);}
function dashSetHeight(id,hz){var lay=getDashLayout();lay.height=lay.height||{};lay.height[id]=hz;saveDashLayout(lay);renderDashboard(window.DASH);}
function dashHide(id){var lay=getDashLayout();lay.vis=lay.vis||{};lay.vis[id]=false;saveDashLayout(lay);renderDashboard(window.DASH);}
function dashShow(id){var lay=getDashLayout();lay.vis=lay.vis||{};lay.vis[id]=true;saveDashLayout(lay);renderDashboard(window.DASH);}
function wireDashDrag(){
  var grid=el('dgrid');if(!grid)return;var dragEl=null;
  grid.querySelectorAll('.wc').forEach(function(c){
    c.addEventListener('dragstart',function(e){
      // Limit dragstart to the drag handle or card header (not inside buttons or widgets)
      if (e.target.closest('.cbtn') || e.target.closest('.btn-dropdown') || e.target.closest('.dropdown-popover') || e.target.closest('button') || e.target.closest('a') || e.target.closest('.wc-b')) {
        e.preventDefault();
        return false;
      }
      dragEl=c;
      c.classList.add('drag');
    });
    c.addEventListener('dragend',function(){
      c.classList.remove('drag');
      dragEl=null;
      var lay=getDashLayout();
      lay.order=Array.prototype.map.call(grid.querySelectorAll('.wc'),function(x){return x.getAttribute('data-id');});
      // keep hidden ones in order
      var hid=getDashLayout().order.filter(function(id){return lay.order.indexOf(id)<0;});
      lay.order=lay.order.concat(hid);
      saveDashLayout(lay);
    });
    c.addEventListener('dragover',function(e){
      e.preventDefault();
      if(!dragEl||dragEl===c)return;
      var r=c.getBoundingClientRect();
      var after=(e.clientY-r.top)/(r.height)>.5;
      grid.insertBefore(dragEl,after?c.nextSibling:c);
    });
  });
}


/* Resize widget bebas (native Pointer Events, tanpa ketergantungan CDN). */
function wireDashResize(){
  var grid=el('dgrid');if(!grid)return;
  grid.querySelectorAll('.wc').forEach(function(card){
    var handle=card.querySelector('.resize-handle');if(!handle)return;
    handle.addEventListener('pointerdown',function(e){
      e.preventDefault();e.stopPropagation();
      var startX=e.clientX,startY=e.clientY;
      var rect=card.getBoundingClientRect();
      var gridRect=grid.getBoundingClientRect();
      var startW=rect.width,startH=rect.height;
      var minW=Math.min(280,gridRect.width),minH=180;
      var maxW=gridRect.width;
      card.setAttribute('draggable','false');
      card.classList.add('resizing');
      handle.setPointerCapture(e.pointerId);
      function move(ev){
        var w=Math.max(minW,Math.min(maxW,startW+(ev.clientX-startX)));
        var h=Math.max(minH,startH+(ev.clientY-startY));
        card.style.setProperty('--widget-width',Math.round(w)+'px');
        card.style.setProperty('--widget-height',Math.round(h)+'px');
      }
      function done(ev){
        handle.removeEventListener('pointermove',move);
        handle.removeEventListener('pointerup',done);
        handle.removeEventListener('pointercancel',done);
        card.classList.remove('resizing');
        card.setAttribute('draggable','true');
        var lay=getDashLayout();lay.dimensions=lay.dimensions||{};
        lay.dimensions[card.getAttribute('data-id')]={
          width:Math.round(card.getBoundingClientRect().width),
          height:Math.round(card.getBoundingClientRect().height)
        };
        saveDashLayout(lay);
      }
      handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',done);
      handle.addEventListener('pointercancel',done);
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
  
  var b = '<div style="display:flex;gap:8px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px">' +
    '<button class="tab-btn active" id="tab_import_link" onclick="setImportTab(\'link\')">🔗 Link Spreadsheet / Excel</button>' +
    '<button class="tab-btn" id="tab_import_text" onclick="setImportTab(\'text\')">📋 Copy-Paste Teks</button>' +
    '</div>' +
    '<div id="group_import_link">' +
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
    '<div id="importPreview" style="margin-top:14px;max-height:300px;overflow-y:auto"></div>';
  
  var f = '<button class="btn btn-ghost" onclick="closeModal()">Batal</button>' +
    '<button class="btn btn-ghost" id="importTarikBtn" onclick="tarikImportData()">Tarik & Analisis Data</button>' +
    '<button class="btn btn-primary hidden" id="importSimpanBtn" onclick="simpanImportData()">Simpan Data</button>';
  
  openModal(title, b, f);
}

function setImportTab(tab) {
  var linkTab = el('tab_import_link');
  var textTab = el('tab_import_text');
  var linkGroup = el('group_import_link');
  var textGroup = el('group_import_text');
  
  if (tab === 'link') {
    linkTab.classList.add('active');
    textTab.classList.remove('active');
    linkGroup.classList.remove('hidden');
    textGroup.classList.add('hidden');
  } else {
    linkTab.classList.remove('active');
    textTab.classList.add('active');
    linkGroup.classList.add('hidden');
    textGroup.classList.remove('hidden');
  }
  el('importPreview').innerHTML = '';
  el('importSimpanBtn').classList.add('hidden');
}

function tarikImportData() {
  var isText = el('tab_import_text').classList.contains('active');
  var btn = el('importTarikBtn');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  el('importPreview').innerHTML = '<div style="text-align:center;padding:20px 0">' + BOXES_SPINNER + '<div class="muted" style="margin-top:10px;font-size:12.5px">Menganalisis data...</div></div>';
  
  var promise;
  if (isText) {
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
        
        var h = '<div style="margin-bottom:12px;font-weight:600;font-size:13.5px">' +
          'Analisis Jurnal selesai: <span style="color:var(--green)">' + totalValid + ' Baris Valid</span> (Penghimpunan: ' + res.himpunValid.length + ', Pentasyarufan: ' + res.salurValid.length + '), ' +
          '<span style="color:var(--red)">' + totalInvalid + ' Baris Tidak Valid</span> (diabaikan)' +
          '</div>';
          
        h += '<h4 style="margin:12px 0 6px;color:var(--green);font-family:var(--head)">Penghimpunan (Penerimaan)</h4>';
        if (res.himpunValid.length === 0) {
          h += '<div class="muted" style="padding:8px;font-size:12px">Tidak ada data penghimpunan.</div>';
        } else {
          h += '<table style="font-size:11.5px;width:100%;border-collapse:collapse;margin-bottom:14px" class="table-wrap"><thead><tr>' +
            '<th>Tgl</th><th>Donatur</th><th>Jenis / Pilar</th><th>Jumlah</th><th>Metode</th><th>FR</th>' +
            '</tr></thead><tbody>';
          res.himpunValid.forEach(function(r, idx) {
            var dupWarn = r.isDuplicate ? '<div style="margin-top:4px"><label style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--red);cursor:pointer;font-weight:700"><input type="checkbox" class="import-dup-chk" data-type="himpun" data-idx="' + idx + '" style="width:14px;height:14px;cursor:pointer;accent-color:var(--red)"> ⚠️ Transaksi Serupa Ada (Centang jika ingin tetap simpan)</label></div>' : '';
            var rowBg = r.isDuplicate ? ' style="background:rgba(239,68,68,0.08);color:var(--red)"' : '';
            h += '<tr' + rowBg + '>' +
              '<td>' + esc(r.tanggal) + '</td>' +
              '<td><b>' + esc(r.namaDonatur) + '</b>' + dupWarn + '</td>' +
              '<td>' + esc(r.jenisDana + (r.pilar ? ' / ' + r.pilar : '')) + '</td>' +
              '<td style="font-weight:600;color:' + (r.isDuplicate ? 'var(--red)' : 'var(--green)') + '">' + rp(r.jumlah) + '</td>' +
              '<td>' + esc(r.metode) + '</td>' +
              '<td class="muted">' + esc(cleanFR(r.fundraising)) + '</td>' +
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

function enhanceSelects(containerId) {
  var parent = containerId ? (typeof containerId === 'string' ? el(containerId) : containerId) : document;
  if (!parent) return;
  
  var wrappers = parent.querySelectorAll('.select-enhanced');
  wrappers.forEach(function(w) {
    var sel = w.nextSibling;
    if (!sel || sel.tagName !== 'SELECT') {
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
      var popItems = prev.querySelectorAll('.dropdown-item');
      if (popItems.length === sel.options.length) {
        var btnText = prev.querySelector('.select-enhanced-btn span');
        if (btnText && sel.options[sel.selectedIndex]) {
          btnText.textContent = sel.options[sel.selectedIndex].textContent;
        }
        popItems.forEach(function(item, idx) {
          if (sel.selectedIndex === idx) {
            item.classList.add('active');
            item.style.background = 'var(--accent-soft)';
            item.style.color = 'var(--accent-d)';
          } else {
            item.classList.remove('active');
            item.style.background = '';
            item.style.color = '';
          }
        });
        return;
      } else {
        prev.remove();
      }
    }
    
    sel.style.display = 'none';
    
    var container = document.createElement('div');
    container.className = 'custom-dropdown select-enhanced';
    container.style.width = '100%';
    
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-dropdown select-enhanced-btn';
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
    btnText.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '- pilih -';
    btn.appendChild(btnText);
    
    var chevron = document.createElement('span');
    chevron.innerHTML = '▼';
    chevron.style.fontSize = '8px';
    chevron.style.opacity = '0.6';
    btn.appendChild(chevron);
    
    var popover = document.createElement('div');
    popover.className = 'dropdown-popover select-enhanced-popover hidden';
    popover.style.width = '100%';
    popover.style.left = '0';
    popover.style.right = 'auto';
    popover.style.boxSizing = 'border-box';
    popover.style.maxHeight = '280px';
    popover.style.overflowY = 'auto';
    popover.style.display = 'flex';
    popover.style.flexDirection = 'column';
    
    // Add Search Input if length > 5 or f_rekeningId
    var searchInput = null;
    if (sel.options.length > 5 || sel.id === 'f_rekeningId') {
      var searchDiv = document.createElement('div');
      searchDiv.style.padding = '6px 8px';
      searchDiv.style.borderBottom = '1px solid var(--border)';
      searchDiv.style.position = 'sticky';
      searchDiv.style.top = '0';
      searchDiv.style.background = 'var(--surface)';
      searchDiv.style.zIndex = '10';
      
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Cari...';
      searchInput.className = 'dropdown-search-input';
      searchInput.style.fontSize = '12.5px';
      searchInput.style.padding = '6px 10px';
      searchInput.style.borderRadius = '6px';
      searchInput.style.border = '1px solid var(--border)';
      searchInput.style.width = '100%';
      searchInput.style.boxSizing = 'border-box';
      
      searchInput.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      
      searchDiv.appendChild(searchInput);
      popover.appendChild(searchDiv);
    }
    
    var section = document.createElement('div');
    section.className = 'dropdown-section';
    section.style.overflowY = 'auto';
    section.style.flex = '1';
    
    for (var i = 0; i < sel.options.length; i++) {
      var opt = sel.options[i];
      var item = document.createElement('div');
      item.className = 'dropdown-item';
      item.textContent = opt.textContent;
      item.setAttribute('data-value', opt.value);
      if (sel.selectedIndex === i) {
        item.classList.add('active');
        item.style.background = 'var(--accent-soft)';
        item.style.color = 'var(--accent-d)';
      }
      
      item.addEventListener('click', (function(oIdx, val, text) {
        return function(e) {
          e.stopPropagation();
          sel.selectedIndex = oIdx;
          btnText.textContent = text;
          
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, true);
          sel.dispatchEvent(evt);
          if (sel.onchange) sel.onchange();
          
          popover.classList.add('hidden');
          enhanceSelects(containerId);
        };
      })(i, opt.value, opt.textContent));
      
      section.appendChild(item);
    }
    
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        var query = e.target.value.toLowerCase();
        var items = section.querySelectorAll('.dropdown-item');
        items.forEach(function(item) {
          var text = item.textContent.toLowerCase();
          if (text.indexOf(query) >= 0) {
            item.style.display = '';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }
    
    popover.appendChild(section);
    container.appendChild(btn);
    container.appendChild(popover);
    
    sel.parentNode.insertBefore(container, sel);
    
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isHidden = popover.classList.contains('hidden');
      document.querySelectorAll('.select-enhanced-popover').forEach(function(p) {
        p.classList.add('hidden');
      });
      if (isHidden) {
        popover.classList.remove('hidden');
        if (searchInput) {
          setTimeout(function() {
            searchInput.value = '';
            var items = section.querySelectorAll('.dropdown-item');
            items.forEach(function(item) { item.style.display = ''; });
            searchInput.focus();
          }, 50);
        }
      }
    });
  });
}

// Automatically enhance all selects on the page periodically
setInterval(function() {
  try {
    enhanceSelects();
    enhanceDatePickers();
  } catch(e) {}
}, 250);

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
    container.appendChild(popover);
    
    inp.parentNode.insertBefore(container, inp);
    
    var currentViewDate = inp.value ? new Date(inp.value) : new Date();
    
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isHidden = popover.classList.contains('hidden');
      document.querySelectorAll('.datepicker-enhanced-popover, .select-enhanced-popover').forEach(function(p) {
        p.classList.add('hidden');
      });
      if (isHidden) {
        popover.classList.remove('hidden');
        renderCalendarGrid(popover, inp.value, currentViewDate, function(selectedDateStr) {
          inp.value = selectedDateStr;
          btnText.textContent = formatIndoDate(selectedDateStr);
          
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, true);
          inp.dispatchEvent(evt);
          if (inp.onchange) inp.onchange();
          
          popover.classList.add('hidden');
        });
      }
    });
  });
}

// Click outside to close custom dropdowns and datepickers
document.addEventListener('click', function(e) {
  var openPopovers = document.querySelectorAll('.select-enhanced-popover:not(.hidden), .datepicker-enhanced-popover:not(.hidden)');
  openPopovers.forEach(function(pop) {
    var dropdown = pop.closest('.custom-dropdown');
    if (!dropdown || !dropdown.contains(e.target)) {
      pop.classList.add('hidden');
    }
  });
});

/* ============ MUTASI BANK ============ */
window.MUTASI_PARSED_ROWS = [];

function viewMutasi() {
  el('content').innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div><p style="margin-top:12px">Memuat data mutasi bank...</p></div>';
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

  extracted.forEach(function(r, idx) {
    var selectHimpun = r.tipe === 'K' ? 'selected' : '';
    var selectSalur = r.tipe === 'D' ? 'selected' : '';
    
    h += '<tr class="mutasi-preview-row" data-idx="' + idx + '">' +
      '  <td style="text-align:center"><input type="checkbox" class="mutasi-row-check" checked></td>' +
      '  <td><input type="date" class="mutasi-row-date" value="' + r.tanggal + '" style="padding:4px;font-size:12px;width:120px"></td>' +
      '  <td><input type="text" class="mutasi-row-desc" value="' + esc(r.deskripsi) + '" style="padding:4px;font-size:12px;width:95%"></td>' +
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

function toggleSidebar() {
  var app = el('appView');
  if (app) {
    app.classList.toggle('collapsed');
    localStorage.setItem('sidebar_collapsed', app.classList.contains('collapsed'));
  }
}

function viewDonatur() {
  el('content').innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div><p style="margin-top:12px">Memuat database donatur...</p></div>';
  
  var layPromise = CACHE.layanan ? Promise.resolve(CACHE.layanan) : gas('apiListLayanan')(TOKEN);
  var donPromise = gas('apiListDonatur')(TOKEN);
  
  Promise.all([layPromise, donPromise]).then(function(res) {
    CACHE.layanan = res[0];
    window.LIST_DONATUR = res[1];
    renderDonatur(res[1]);
  }).catch(handleErr);
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
    '          <th>Kategori</th>' +
    '          <th>Telepon/WA</th>' +
    '          <th>Alamat</th>' +
    '          <th>Total Donasi</th>' +
    '          <th>Frekuensi</th>' +
    '          <th>Terakhir Donasi</th>' +
    '          <th style="width:80px;text-align:center">Aksi</th>' +
    '        </tr>' +
    '      </thead>' +
    '      <tbody id="donaturTableBody">';
    
  if (rows.length === 0) {
    h += '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Belum ada donatur terdaftar</td></tr>';
  } else {
    rows.sort(function(a, b) { return b.totalDonasi - a.totalDonasi; });
    rows.forEach(function(r) {
      h += '<tr class="donatur-row" data-kategori="' + esc(r.kategori) + '" data-layanan="' + esc((r.layanan || []).join('|').toLowerCase()) + '">' +
        '  <td style="font-weight:600" class="donatur-name-cell">' + esc(r.nama) + '</td>' +
        '  <td><span class="badge">' + esc(r.kategori) + '</span></td>' +
        '  <td>' + esc(r.telepon || '-') + '</td>' +
        '  <td>' + esc(r.alamat || '-') + '</td>' +
        '  <td style="font-weight:700;color:var(--accent)">' + rp(r.totalDonasi) + '</td>' +
        '  <td>' + r.jumlahTransaksi + ' x</td>' +
        '  <td>' + (r.terakhir ? formatIndoDate(r.terakhir) : '-') + '</td>' +
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
  if (pop) {
    var willOpen = pop.classList.contains('hidden');
    document.querySelectorAll('.select-enhanced-popover:not(.hidden), .datepicker-enhanced-popover:not(.hidden)').forEach(function(p) { p.classList.add('hidden'); });
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
