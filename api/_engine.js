// ====== Google Apps Script SHIM (Node) ======
const crypto = require('crypto');
let DB = { sheets:{}, props:{} };
const ID_M=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const ID_MS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const TZ = 'Asia/Jakarta';
function _p2(n){return ('0'+n).slice(-2);}
function _formatDate(date,tz,fmt){
  const t=new Date(date.getTime()+7*3600*1000);
  const Y=t.getUTCFullYear(),Mo=t.getUTCMonth(),D=t.getUTCDate(),H=t.getUTCHours(),Mi=t.getUTCMinutes(),S=t.getUTCSeconds();
  return String(fmt)
    .replace(/yyyy/g,Y).replace(/yy/g,String(Y).slice(-2))
    .replace(/MMMM/g,ID_M[Mo]).replace(/MMM/g,ID_MS[Mo]).replace(/MM/g,_p2(Mo+1))
    .replace(/dd/g,_p2(D)).replace(/HH/g,_p2(H)).replace(/mm/g,_p2(Mi)).replace(/ss/g,_p2(S));
}
class Range{
  constructor(arr,r,c,nr,nc){this.a=arr;this.r=r;this.c=c;this.nr=nr;this.nc=nc;}
  getValues(){const o=[];for(let i=0;i<this.nr;i++){const row=this.a[this.r-1+i]||[];const rr=[];for(let j=0;j<this.nc;j++){const v=row[this.c-1+j];rr.push(v!==undefined?v:'');}o.push(rr);}return o;}
  setValues(vals){for(let i=0;i<vals.length;i++){const ri=this.r-1+i;if(!this.a[ri])this.a[ri]=[];for(let j=0;j<vals[i].length;j++)this.a[ri][this.c-1+j]=vals[i][j];}return this;}
  setValue(v){const ri=this.r-1;if(!this.a[ri])this.a[ri]=[];this.a[ri][this.c-1]=v;return this;}
  setFontWeight(){return this;} setBackground(){return this;} setFontColor(){return this;} setNumberFormat(){return this;} setHorizontalAlignment(){return this;}
}
class Sheet{
  constructor(name){this.name=name;}
  _a(){if(!DB.sheets[this.name])DB.sheets[this.name]=[];return DB.sheets[this.name];}
  getName(){return this.name;}
  getLastRow(){return this._a().length;}
  getLastColumn(){let m=0;this._a().forEach(r=>{if(r&&r.length>m)m=r.length;});return m;}
  getDataRange(){return new Range(this._a(),1,1,Math.max(this._a().length,1),Math.max(this.getLastColumn(),1));}
  getRange(r,c,nr,nc){return new Range(this._a(),r,c,nr||1,nc||1);}
  appendRow(arr){this._a().push(arr.slice());return this;}
  deleteRow(r){this._a().splice(r-1,1);return this;}
  setFrozenRows(){return this;} clear(){DB.sheets[this.name]=[];return this;}
}
class Spreadsheet{
  getSheetByName(n){return Object.prototype.hasOwnProperty.call(DB.sheets,n)?new Sheet(n):null;}
  insertSheet(n){DB.sheets[n]=[];return new Sheet(n);}
  getSheets(){return Object.keys(DB.sheets).map(n=>new Sheet(n));}
  deleteSheet(sh){delete DB.sheets[sh.name];}
  getId(){return 'LOCAL';} getUrl(){return process.env.PUBLIC_BASE_URL||'';} getName(){return 'LAZ Digital - Database';}
}
const SpreadsheetApp={ openById(){return new Spreadsheet();}, create(){return new Spreadsheet();}, flush(){} };
const PropertiesService={ getScriptProperties(){return {getProperty(k){return (DB.props&&DB.props[k]!=null)?DB.props[k]:null;},setProperty(k,v){DB.props=DB.props||{};DB.props[k]=v;return this;},deleteProperty(k){if(DB.props)delete DB.props[k];return this;}};} };
const ScriptApp={ getService(){return {getUrl(){return process.env.PUBLIC_BASE_URL||'';}};} };
const Session={ getActiveUser(){return {getEmail(){return '';}};}, getEffectiveUser(){return {getEmail(){return '';}};} };
const Utilities={ getUuid(){return crypto.randomUUID();}, formatDate:_formatDate, sleep(){}, computeDigest(){return [];}, base64Encode(){return '';}, DigestAlgorithm:{MD5:'MD5',SHA_256:'SHA_256'}, Charset:{UTF_8:'UTF_8'} };
const Logger={ log(){} };
// ====== END SHIM ======

/* ===== PORTED Code.gs ===== */
/**************************************************************************
 * LAZ DIGITAL — Backend Google Apps Script  (v2)
 * Tambahan v2: Jurnal Penerimaan, Broadcast WA, Rekening, Layanan (KLL/ULL),
 *              jenis dana bertingkat, metode Cash/Transfer.
 **************************************************************************/
var SHEETS = {
  USERS:'Users', PENGHIMPUNAN:'Penghimpunan', PENTASYARUFAN:'Pentasyarufan',
  SETTINGS:'Settings', SESSIONS:'Sessions', LOG:'AuditLog',
  REKENING:'Rekening', LAYANAN:'Layanan', MUTASI:'Mutasi', DONATUR:'Donatur'
};
var MODULES = ['dashboard','penghimpunan','pentasyarufan','laporan','rekening','layanan','users','settings','donatur'];
var ACTIONS = ['view','create','edit','delete'];

var BULAN = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

var JENIS_TOP=['Zakat','Infak','Sedekah','Wakaf','Kurban','Fidyah','DSKL'];
var SUBJENIS={
  'Zakat':['Zakat Mal','Zakat Fitrah','Zakat Profesi/Penghasilan','Zakat Perdagangan','Zakat Pertanian','Zakat Emas & Perak','Zakat Simpanan','Setor Tunai'],
  'Infak':['Infak Umum','Infak Terikat','Setor Tunai'],
  'Sedekah':['Sedekah Umum','Sedekah Terikat'],
  'Wakaf':['Wakaf Uang','Wakaf Melalui Uang'],
  'Kurban':['Kurban'],'Fidyah':['Fidyah'],
  'DSKL':['CSR Perusahaan','Bagi Hasil Bank','Dana Sosial Lainnya']
};
var METODE=['Cash/Tunai','Transfer Bank','QRIS','E-Wallet','Debit/Kartu'];
var TIPE_DONATUR=['Perorangan','Lembaga/Perusahaan','Hamba Allah','Kantor Layanan (KLL)','Unit Layanan (ULL)'];
var ASHNAF=['Fakir','Miskin','Amil','Muallaf','Riqab (Memerdekakan Budak)','Gharimin (Berhutang)','Fi Sabilillah','Ibnu Sabil'];
var BENTUK=['Uang Tunai','Transfer','Sembako','Beasiswa','Modal Usaha','Bantuan Kesehatan','Bantuan Pendidikan','Bantuan Bencana','Pembangunan','Lainnya'];

/* ===== SETUP ===== */
function setup(){
  var props=PropertiesService.getScriptProperties();
  var ssId=props.getProperty('SS_ID'); var ss;
  if(ssId){ try{ss=SpreadsheetApp.openById(ssId);}catch(e){ss=null;} }
  if(!ss){ ss=SpreadsheetApp.create('LAZ Digital - Database'); props.setProperty('SS_ID',ss.getId()); }

  ensureSheet(ss,SHEETS.USERS,['id','username','passwordHash','salt','nama','role','permissions','aktif','dibuat']);
  ensureSheet(ss,SHEETS.PENGHIMPUNAN,['id','noKwitansi','tanggal','jenisDana','subJenis','pilar','program','namaDonatur','tipeDonatur','layananId','telepon','email','alamat','jumlah','metode','rekeningId','bank','statusBayar','atasNama','keterangan','petugas','dibuat','fundraising']);
  ensureSheet(ss,SHEETS.PENTASYARUFAN,['id','noBukti','tanggal','ashnaf','program','sumberDana','namaPenerima','nik','telepon','alamat','jumlah','bentukBantuan','metode','statusSalur','petugas','keterangan','dibuat','fundraising','rekeningId','bank']);
  ensureSheet(ss,SHEETS.REKENING,['id','namaBank','nomor','atasNama','fundGroup','aktif','dibuat']);
  ensureSheet(ss,SHEETS.LAYANAN,['id','tipe','kode','nama','wilayah','penanggungJawab','telepon','aktif','dibuat']);
  ensureSheet(ss,SHEETS.MUTASI,['id','tanggal','deskripsi','tipe','nominal','dibuat']);
  ensureSheet(ss,SHEETS.DONATUR,['id','nama','kategori','telepon','alamat','email','dibuat']);
  ensureSheet(ss,SHEETS.SETTINGS,['key','value']);
  ensureSheet(ss,SHEETS.SESSIONS,['token','userId','expired']);
  ensureSheet(ss,SHEETS.LOG,['waktu','userId','username','aksi','detail']);

  var defaults={namaLembaga:'Lembaga Amil Zakat',singkatan:'LAZ',alamat:'Alamat lembaga Anda',telepon:'021-0000000',email:'info@laz.org',website:'www.laz.org',logoUrl:'',publicToken:'',publicEnabled:'false'};
  Object.keys(defaults).forEach(function(k){ if(getSetting(k)===null) setSetting(k,defaults[k]); });

  if(readAll(SHEETS.USERS).length===0){
    var allPerm={}; MODULES.forEach(function(m){allPerm[m]={};ACTIONS.forEach(function(a){allPerm[m][a]=true;});});
    var salt=makeId();
    insertRow(SHEETS.USERS,{id:makeId(),username:'superadmin',passwordHash:hashPassword('admin123',salt),salt:salt,nama:'Super Administrator',role:'superadmin',permissions:JSON.stringify(allPerm),aktif:'true',dibuat:new Date().toISOString()});
  }
  return 'Setup selesai. Spreadsheet: '+ss.getUrl()+'\nLogin: superadmin / admin123';
}

function getSS(){ var id=PropertiesService.getScriptProperties().getProperty('SS_ID'); if(!id) throw new Error('Belum di-setup. Jalankan setup() dulu.'); return SpreadsheetApp.openById(id); }
function ensureSheet(ss,name,headers){
  var sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0){
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold'); sh.setFrozenRows(1);
  } else {
    var existing = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] || [];
    var missing = [];
    headers.forEach(function(h){ if(existing.indexOf(h)<0) missing.push(h); });
    if(missing.length>0){
      var nextCol = existing.length + 1;
      sh.getRange(1,nextCol,1,missing.length).setValues([missing]).setFontWeight('bold');
    }
  }
  var def=ss.getSheetByName('Sheet1'); if(def&&ss.getSheets().length>1){try{ss.deleteSheet(def);}catch(e){}}
  return sh;
}

/* ===== ROUTING ===== */
function getWebAppUrl(){ return ScriptApp.getService().getUrl(); }

/* ===== CRUD GENERIK ===== */
function readAll(name){
  var ss = getSS();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    var headers = ['id', 'dibuat'];
    if (name === SHEETS.DONATUR) headers = ['id','nama','kategori','telepon','alamat','email','dibuat'];
    sh = ensureSheet(ss, name, headers);
  }
  var v = sh.getDataRange().getValues();
  if(v.length<2)return [];
  var h=v[0],out=[];
  for(var i=1;i<v.length;i++){
    var o={};
    for(var j=0;j<h.length;j++)o[h[j]]=v[i][j];
    o.__row=i+1;
    out.push(o);
  }
  return out;
}
function insertRow(name,obj){ var sh=getSS().getSheetByName(name); var h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; sh.appendRow(h.map(function(x){return obj[x]!==undefined?obj[x]:'';})); return obj; }
function updateRowById(name,id,obj){ var sh=getSS().getSheetByName(name); var v=sh.getDataRange().getValues(); var h=v[0],ic=h.indexOf('id'); for(var i=1;i<v.length;i++){ if(String(v[i][ic])===String(id)){ h.forEach(function(k,j){if(obj[k]!==undefined)v[i][j]=obj[k];}); sh.getRange(i+1,1,1,h.length).setValues([v[i]]); return true; } } return false; }
function deleteRowById(name,id){ var sh=getSS().getSheetByName(name); var v=sh.getDataRange().getValues(); var ic=v[0].indexOf('id'); for(var i=1;i<v.length;i++){ if(String(v[i][ic])===String(id)){sh.deleteRow(i+1);return true;} } return false; }
function findById(name,id){ var r=readAll(name); for(var i=0;i<r.length;i++) if(String(r[i].id)===String(id)) return r[i]; return null; }
function makeId(){ return Utilities.getUuid().replace(/-/g,'').substring(0,16); }
function getSetting(k){ var r=readAll(SHEETS.SETTINGS); for(var i=0;i<r.length;i++) if(r[i].key===k) return r[i].value; return null; }
function setSetting(k,val){ var sh=getSS().getSheetByName(SHEETS.SETTINGS); var v=sh.getDataRange().getValues(); for(var i=1;i<v.length;i++){if(v[i][0]===k){sh.getRange(i+1,2).setValue(val);return;}} sh.appendRow([k,val]); }
function getAllSettings(){ var o={}; readAll(SHEETS.SETTINGS).forEach(function(r){o[r.key]=r.value;}); return o; }

/* ===== KEAMANAN ===== */
function hashPassword(p,s){ var raw=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s+'::'+p,Utilities.Charset.UTF_8); return raw.map(function(b){return ('0'+(b&0xFF).toString(16)).slice(-2);}).join(''); }
function login(u,p){ var us=readAll(SHEETS.USERS),f=null; for(var i=0;i<us.length;i++){if(String(us[i].username).toLowerCase()===String(u).toLowerCase()){f=us[i];break;}}
  if(!f) return {ok:false,msg:'Username tidak ditemukan'}; if(String(f.aktif)!=='true') return {ok:false,msg:'Akun dinonaktifkan'};
  if(hashPassword(p,f.salt)!==f.passwordHash) return {ok:false,msg:'Password salah'};
  var token=Utilities.getUuid(); insertRow(SHEETS.SESSIONS,{token:token,userId:f.id,expired:new Date(Date.now()+12*36e5).toISOString()}); audit(f.id,f.username,'login',''); return {ok:true,token:token,user:sanitizeUser(f)}; }
function logout(t){ deleteRowBy(SHEETS.SESSIONS,'token',t); return {ok:true}; }
function deleteRowBy(name,col,val){ var sh=getSS().getSheetByName(name); var v=sh.getDataRange().getValues(); var c=v[0].indexOf(col); for(var i=v.length-1;i>=1;i--){if(String(v[i][c])===String(val))sh.deleteRow(i+1);} }
function authUser(t){ if(!t) throw new Error('AUTH: token kosong, login ulang.'); var ss=readAll(SHEETS.SESSIONS),s=null; for(var i=0;i<ss.length;i++)if(ss[i].token===t){s=ss[i];break;}
  if(!s) throw new Error('AUTH: sesi tidak valid, login ulang.'); if(new Date(s.expired)<new Date()){deleteRowBy(SHEETS.SESSIONS,'token',t);throw new Error('AUTH: sesi berakhir, login ulang.');}
  var u=findById(SHEETS.USERS,s.userId); if(!u) throw new Error('AUTH: user tidak ditemukan.'); return u; }
function sanitizeUser(u){ return {id:u.id,username:u.username,nama:u.nama,role:u.role,permissions:typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):(u.permissions||{})}; }
function can(u,m,a){ if(u.role==='superadmin')return true; var p=typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):(u.permissions||{}); return !!(p[m]&&p[m][a]); }
function _requirePerm(t,m,a){ var u=authUser(t); if(!can(u,m,a)) throw new Error('IZIN: tidak punya akses '+a+' pada modul '+m+'.'); return u; }
function audit(id,un,ak,d){ try{insertRow(SHEETS.LOG,{waktu:new Date().toISOString(),userId:id,username:un,aksi:ak,detail:d});}catch(e){} }

/* ===== SESI ===== */
function apiMe(t){ return sanitizeUser(authUser(t)); }
function apiBootstrap(t){ var u=authUser(t); return {user:sanitizeUser(u),settings:getAllSettings(),webAppUrl:getWebAppUrl()}; }
function apiGetPermissionMeta(t){ authUser(t); return {modules:MODULES,actions:ACTIONS}; }

/* ===== PENGHIMPUNAN ===== */
function generateNoKwitansi(){ var ym=Utilities.formatDate(new Date(),TZ,'yyyyMM'); var n=0; readAll(SHEETS.PENGHIMPUNAN).forEach(function(r){if(String(r.noKwitansi).indexOf('KW/'+ym)===0)n++;}); return 'KW/'+ym+'/'+('0000'+(n+1)).slice(-4); }
function apiListPenghimpunan(t){ _requirePerm(t,'penghimpunan','view'); return readAll(SHEETS.PENGHIMPUNAN).sort(function(a,b){return new Date(b.dibuat)-new Date(a.dibuat);}); }
async function apiSavePenghimpunan(t,d){ var u=_requirePerm(t,'penghimpunan',d.id?'edit':'create');
  d.fundraising = cleanFundraisingName(d.fundraising);
  var oldMonth = '';
  if(d.id){
    var oldRow = findById(SHEETS.PENGHIMPUNAN, d.id);
    if (oldRow) oldMonth = getMonthFromDate(oldRow.tanggal);
  }
  var newMonth = getMonthFromDate(d.tanggal);
  var res;
  if(d.id){ updateRowById(SHEETS.PENGHIMPUNAN,d.id,d); audit(u.id,u.username,'edit_penghimpunan',d.id); res = findById(SHEETS.PENGHIMPUNAN,d.id); }
  else { d.id=makeId(); d.noKwitansi=d.noKwitansi||generateNoKwitansi(); d.petugas=u.nama; d.dibuat=new Date().toISOString(); insertRow(SHEETS.PENGHIMPUNAN,d); audit(u.id,u.username,'create_penghimpunan',d.id); res = findById(SHEETS.PENGHIMPUNAN,d.id); }
  if (newMonth) await syncMonthlySpreadsheet(newMonth);
  if (oldMonth && oldMonth !== newMonth) await syncMonthlySpreadsheet(oldMonth);
  return res;
}
async function apiDeletePenghimpunan(t,id){ var u=_requirePerm(t,'penghimpunan','delete');
  var oldRow = findById(SHEETS.PENGHIMPUNAN, id);
  var oldMonth = oldRow ? getMonthFromDate(oldRow.tanggal) : '';
  deleteRowById(SHEETS.PENGHIMPUNAN,id); audit(u.id,u.username,'delete_penghimpunan',id);
  if (oldMonth) await syncMonthlySpreadsheet(oldMonth);
  return {ok:true};
}
function apiGetKwitansi(t,id){ _requirePerm(t,'penghimpunan','view'); return {data:findById(SHEETS.PENGHIMPUNAN,id),settings:getAllSettings()}; }

/* ===== PENTASYARUFAN ===== */
function generateNoBukti(){ var ym=Utilities.formatDate(new Date(),TZ,'yyyyMM'); var n=0; readAll(SHEETS.PENTASYARUFAN).forEach(function(r){if(String(r.noBukti).indexOf('BPT/'+ym)===0)n++;}); return 'BPT/'+ym+'/'+('0000'+(n+1)).slice(-4); }
function apiListPentasyarufan(t){ _requirePerm(t,'pentasyarufan','view'); return readAll(SHEETS.PENTASYARUFAN).sort(function(a,b){return new Date(b.dibuat)-new Date(a.dibuat);}); }
async function apiSavePentasyarufan(t,d){ var u=_requirePerm(t,'pentasyarufan',d.id?'edit':'create');
  d.fundraising = cleanFundraisingName(d.fundraising);
  var oldMonth = '';
  if(d.id){
    var oldRow = findById(SHEETS.PENTASYARUFAN, d.id);
    if (oldRow) oldMonth = getMonthFromDate(oldRow.tanggal);
  }
  var newMonth = getMonthFromDate(d.tanggal);
  var res;
  if(d.id){ updateRowById(SHEETS.PENTASYARUFAN,d.id,d); audit(u.id,u.username,'edit_pentasyarufan',d.id); res = findById(SHEETS.PENTASYARUFAN,d.id); }
  else { d.id=makeId(); d.noBukti=d.noBukti||generateNoBukti(); d.petugas=u.nama; d.dibuat=new Date().toISOString(); insertRow(SHEETS.PENTASYARUFAN,d); audit(u.id,u.username,'create_pentasyarufan',d.id); res = findById(SHEETS.PENTASYARUFAN,d.id); }
  if (newMonth) await syncMonthlySpreadsheet(newMonth);
  if (oldMonth && oldMonth !== newMonth) await syncMonthlySpreadsheet(oldMonth);
  return res;
}
async function apiDeletePentasyarufan(t,id){ var u=_requirePerm(t,'pentasyarufan','delete');
  var oldRow = findById(SHEETS.PENTASYARUFAN, id);
  var oldMonth = oldRow ? getMonthFromDate(oldRow.tanggal) : '';
  deleteRowById(SHEETS.PENTASYARUFAN,id); audit(u.id,u.username,'delete_pentasyarufan',id);
  if (oldMonth) await syncMonthlySpreadsheet(oldMonth);
  return {ok:true};
}
function apiGetBuktiPentasyarufan(t,id){ _requirePerm(t,'pentasyarufan','view'); return {data:findById(SHEETS.PENTASYARUFAN,id),settings:getAllSettings()}; }

/* ===== REKENING ===== */
function apiListRekening(t){ _requirePerm(t,'rekening','view'); return readAll(SHEETS.REKENING); }
function apiListRekeningPublic(t){ authUser(t); return readAll(SHEETS.REKENING).filter(function(r){return String(r.aktif)!=='false';}); }
function apiSaveRekening(t,d){ var u=_requirePerm(t,'rekening',d.id?'edit':'create');
  if(d.id){ updateRowById(SHEETS.REKENING,d.id,d); } else { d.id=makeId(); d.dibuat=new Date().toISOString(); insertRow(SHEETS.REKENING,d); }
  audit(u.id,u.username,'save_rekening',d.namaBank||''); return {ok:true}; }
function apiDeleteRekening(t,id){ var u=_requirePerm(t,'rekening','delete'); deleteRowById(SHEETS.REKENING,id); audit(u.id,u.username,'delete_rekening',id); return {ok:true}; }

/* ===== LAYANAN (KLL/ULL) ===== */
function apiListLayanan(t){ _requirePerm(t,'layanan','view'); return readAll(SHEETS.LAYANAN); }
function apiListLayananPublic(t){ authUser(t); return readAll(SHEETS.LAYANAN).filter(function(r){return String(r.aktif)!=='false';}); }
function apiSaveLayanan(t,d){ var u=_requirePerm(t,'layanan',d.id?'edit':'create');
  if(d.id){ updateRowById(SHEETS.LAYANAN,d.id,d); } else { d.id=makeId(); d.dibuat=new Date().toISOString(); insertRow(SHEETS.LAYANAN,d); }
  audit(u.id,u.username,'save_layanan',d.nama||''); return {ok:true}; }
function apiDeleteLayanan(t,id){ var u=_requirePerm(t,'layanan','delete'); deleteRowById(SHEETS.LAYANAN,id); audit(u.id,u.username,'delete_layanan',id); return {ok:true}; }

/* ===== USER MGMT ===== */
function apiListUsers(t){ _requirePerm(t,'users','view'); return readAll(SHEETS.USERS).map(sanitizeUser); }
function apiSaveUser(t,d){ var a=_requirePerm(t,'users',d.id?'edit':'create');
  if(d.id){ var ex=findById(SHEETS.USERS,d.id); if(!ex) throw new Error('User tidak ditemukan'); var up={nama:d.nama,role:d.role,permissions:JSON.stringify(d.permissions||{}),aktif:String(d.aktif)}; if(d.username)up.username=d.username; if(d.password){var s=makeId();up.salt=s;up.passwordHash=hashPassword(d.password,s);} updateRowById(SHEETS.USERS,d.id,up); audit(a.id,a.username,'edit_user',d.username||d.id); }
  else { if(readAll(SHEETS.USERS).some(function(x){return String(x.username).toLowerCase()===String(d.username).toLowerCase();})) throw new Error('Username sudah dipakai'); var s2=makeId(); insertRow(SHEETS.USERS,{id:makeId(),username:d.username,passwordHash:hashPassword(d.password||'password123',s2),salt:s2,nama:d.nama,role:d.role||'staff',permissions:JSON.stringify(d.permissions||{}),aktif:d.aktif!==undefined?String(d.aktif):'true',dibuat:new Date().toISOString()}); audit(a.id,a.username,'create_user',d.username); }
  return {ok:true}; }
function apiDeleteUser(t,id){ var a=_requirePerm(t,'users','delete'); var tg=findById(SHEETS.USERS,id); if(tg&&tg.role==='superadmin'){ var sup=readAll(SHEETS.USERS).filter(function(x){return x.role==='superadmin'&&String(x.aktif)==='true';}); if(sup.length<=1) throw new Error('Tidak bisa menghapus satu-satunya Superadmin.'); } deleteRowById(SHEETS.USERS,id); audit(a.id,a.username,'delete_user',id); return {ok:true}; }
function apiChangeMyPassword(t,o,n){ var u=authUser(t); if(hashPassword(o,u.salt)!==u.passwordHash) throw new Error('Password lama salah'); var s=makeId(); updateRowById(SHEETS.USERS,u.id,{salt:s,passwordHash:hashPassword(n,s)}); return {ok:true}; }

function apiUpdateMyProfile(t,d){
  var u=authUser(t);
  var up={};
  if(d.nama) up.nama=String(d.nama).trim();
  if(d.newPassword){ if(hashPassword(d.oldPassword||'',u.salt)!==u.passwordHash) throw new Error('Password lama salah'); var s=makeId(); up.salt=s; up.passwordHash=hashPassword(d.newPassword,s); }
  if(Object.keys(up).length) updateRowById(SHEETS.USERS,u.id,up);
  if(d.foto!==undefined){ if((''+d.foto).length>48000) throw new Error('Ukuran foto terlalu besar'); setSetting('uf_'+u.id, d.foto); }
  return {ok:true};
}

/* ===== SETTINGS ===== */
function apiGetSettings(t){ _requirePerm(t,'settings','view'); return getAllSettings(); }
function apiSaveSettings(t,d){ var u=_requirePerm(t,'settings','edit'); Object.keys(d).forEach(function(k){setSetting(k,d[k]);}); audit(u.id,u.username,'edit_settings',''); return getAllSettings(); }
function apiGeneratePublicLink(t){ _requirePerm(t,'dashboard','view'); var x=Utilities.getUuid().replace(/-/g,''); setSetting('publicToken',x); setSetting('publicEnabled','true'); return {token:x,url:getWebAppUrl()+'?page=public&token='+x}; }
function apiDisablePublicLink(t){ _requirePerm(t,'dashboard','view'); setSetting('publicEnabled','false'); return {ok:true}; }
function apiGetPublicLinkInfo(t){ _requirePerm(t,'dashboard','view'); var x=getSetting('publicToken')||''; return {enabled:getSetting('publicEnabled')==='true',token:x,url:x?(getWebAppUrl()+'?page=public&token='+x):''}; }
/* ===== DASHBOARD ===== */
function getBankGroupName(name) {
  var n = String(name || '').trim();
  var lower = n.toLowerCase();
  if (lower.indexOf('bpd') >= 0) return 'BPD DIY Syariah';
  if (lower.indexOf('bca') >= 0) return 'BCA Syariah';
  if (lower.indexOf('bsi') >= 0 || lower.indexOf('syariah mandiri') >= 0) return 'BSI';
  if (lower.indexOf('jateng') >= 0) return 'Bank Jateng';
  if (lower.indexOf('kas') >= 0 || lower.indexOf('tunai') >= 0 || lower.indexOf('cash') >= 0) return 'Kas Tunai';
  if (lower.indexOf('qris') >= 0) return 'QRIS';
  var parts = n.split(' - ')[0].split(' ');
  if (parts.length > 2) return parts.slice(0, 2).join(' ');
  return parts.join(' ');
}

function buildDashboard(filterMonth, filterPekan, filterHari){
  var H_all = readAll(SHEETS.PENGHIMPUNAN), T_all = readAll(SHEETS.PENTASYARUFAN);
  
  // Available Months (all months with any transaction)
  var monthsSet = {};
  H_all.forEach(function(r) {
    var m = mk(r.tanggal);
    if (m && m !== 'NA') monthsSet[m] = true;
  });
  T_all.forEach(function(r) {
    var m = mk(r.tanggal);
    if (m && m !== 'NA') monthsSet[m] = true;
  });
  var availableMonths = Object.keys(monthsSet).sort(function(a, b) {
    return b.localeCompare(a);
  });

  // Calculate series (last 12 months)
  var series = [];
  var bln = {};
  var today = new Date();
  for (var i = 11; i >= 0; i--) {
    var d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    var yyyy = d.getFullYear();
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var mStr = yyyy + '-' + mm;
    bln[mStr] = { himpun: 0, tasyaruf: 0 };
  }
  H_all.forEach(function(r) {
    var m = mk(r.tanggal);
    if (bln[m]) bln[m].himpun += Number(r.jumlah) || 0;
  });
  T_all.forEach(function(r) {
    var m = mk(r.tanggal);
    if (bln[m]) bln[m].tasyaruf += Number(r.jumlah) || 0;
  });
  series = Object.keys(bln).sort().map(function(m) {
    return { bulan: m, himpun: bln[m].himpun, tasyaruf: bln[m].tasyaruf };
  });

  // Filter H and T based on filterMonth
  var filterPrefix = filterMonth && filterMonth !== 'Semua' ? filterMonth : null;
  var H = H_all;
  var T = T_all;
  if (filterPrefix) {
    H = H_all.filter(function(r) { return r.tanggal && String(r.tanggal).indexOf(filterPrefix) === 0; });
    T = T_all.filter(function(r) { return r.tanggal && String(r.tanggal).indexOf(filterPrefix) === 0; });
    
    // Filter Pekan
    if (filterPekan && filterPekan !== 'Semua') {
      var pNum = Number(filterPekan); // 1, 2, 3, 4, 5
      var startDay = (pNum - 1) * 7 + 1;
      var endDay = pNum === 5 ? 31 : pNum * 7;
      
      H = H.filter(function(r) {
        var day = Number(String(r.tanggal).split('T')[0].split('-')[2]);
        return day >= startDay && day <= endDay;
      });
      T = T.filter(function(r) {
        var day = Number(String(r.tanggal).split('T')[0].split('-')[2]);
        return day >= startDay && day <= endDay;
      });
    }
    
    // Filter Hari (Tanggal)
    if (filterHari && filterHari !== 'Semua') {
      H = H.filter(function(r) { return r.tanggal && String(r.tanggal).indexOf(filterHari) === 0; });
      T = T.filter(function(r) { return r.tanggal && String(r.tanggal).indexOf(filterHari) === 0; });
    }
  }

  var tH = 0, tT = 0, byJenis = {}, byFundraising = {}, byAshnaf = {}, byBank = {}, byPilar = {};
  
  var layMap = {};
  var layList = [];
  try {
    layList = readAll(SHEETS.LAYANAN) || [];
    layList.forEach(function(l) {
      if (l && l.id) layMap[l.id] = (l.tipe ? l.tipe + ' ' : '') + l.nama;
    });
  } catch (e) {}

  var byLayananHimpun = {};
  var byLayananSalur = {};
  
  layList.forEach(function(l) {
    if (l && l.nama && String(l.aktif) !== 'false') {
      var name = (l.tipe ? l.tipe + ' ' : '') + l.nama;
      byLayananHimpun[name] = 0;
      byLayananSalur[name] = 0;
    }
  });
  byLayananHimpun['Lazismu Daerah Bantul'] = 0;
  byLayananSalur['Lazismu Daerah Bantul'] = 0;
  
  H.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    tH += n;
    byJenis[r.jenisDana || 'Lainnya'] = (byJenis[r.jenisDana || 'Lainnya'] || 0) + n;
    
    // Grouping KLL/ULL - Fallback to Lazismu Daerah Bantul
    var layName = 'Lazismu Daerah Bantul';
    if (r.layananId && layMap[r.layananId]) {
      layName = layMap[r.layananId];
    } else if (r.program && (String(r.program).indexOf('KLL ') === 0 || String(r.program).indexOf('KL ') === 0 || String(r.program).indexOf('ULL ') === 0)) {
      layName = r.program;
    } else if (r.namaDonatur && (String(r.namaDonatur).indexOf('KLL ') === 0 || String(r.namaDonatur).indexOf('KL ') === 0 || String(r.namaDonatur).indexOf('ULL ') === 0)) {
      layName = r.namaDonatur;
    }
    
    var matchedLay = layList.find(function(l) {
      var ln = l.nama.toLowerCase();
      var lnm = layName.toLowerCase();
      return lnm.indexOf(ln) >= 0 || ln.indexOf(lnm) >= 0;
    });
    var finalKey = matchedLay ? ((matchedLay.tipe ? matchedLay.tipe + ' ' : '') + matchedLay.nama) : 'Lazismu Daerah Bantul';
    byLayananHimpun[finalKey] = (byLayananHimpun[finalKey] || 0) + n;
    
    // Grouping Fundraising
    var frName = cleanFundraisingName(r.fundraising);
    byFundraising[frName] = (byFundraising[frName] || 0) + n;
    
    // Grouping Pilar
    var pLabel = r.pilar ? String(r.pilar).trim() : (r.jenisDana === 'Infak' ? 'Infak Umum' : r.jenisDana);
    byPilar[pLabel] = (byPilar[pLabel] || 0) + n;
    
    // Grouping Bank / Cash / QRIS - separate cash vs bank properly
    var method = String(r.metode || '').toLowerCase();
    var bLabel;
    if (method.indexOf('qris') >= 0) {
      bLabel = 'QRIS';
    } else if (method.indexOf('transfer') >= 0 || method.indexOf('bank') >= 0 || method.indexOf('debit') >= 0 || method.indexOf('wallet') >= 0) {
      bLabel = r.bank ? ('Transfer: ' + r.bank) : 'Transfer Bank';
    } else {
      // Cash/Tunai - no bank info shown
      bLabel = 'Tunai';
    }
    byBank[bLabel] = (byBank[bLabel] || 0) + n;
  });
  
  T.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    tT += n;
    byAshnaf[r.ashnaf || 'Lainnya'] = (byAshnaf[r.ashnaf || 'Lainnya'] || 0) + n;
    
    // Grouping Fundraising untuk Pentasyarufan
    var frNameT = cleanFundraisingName(r.fundraising);
    byFundraising[frNameT] = (byFundraising[frNameT] || 0) + n;

    // Grouping KLL/ULL for Pentasyarufan
    var nameP = String(r.namaPenerima || '').toLowerCase();
    var progP = String(r.program || '').toLowerCase();
    var ketP = String(r.keterangan || '').toLowerCase();
    var matchedLay = layList.find(function(l) {
      var ln = l.nama.toLowerCase();
      return nameP.indexOf(ln) >= 0 || ln.indexOf(nameP) >= 0 || progP.indexOf(ln) >= 0 || ketP.indexOf(ln) >= 0;
    });
    var finalKey = matchedLay ? ((matchedLay.tipe ? matchedLay.tipe + ' ' : '') + matchedLay.nama) : 'Lazismu Daerah Bantul';
    byLayananSalur[finalKey] = (byLayananSalur[finalKey] || 0) + n;
  });
  
  // Calculate byRekening (Saldo per Rekening)
  var byRekening = {};
  var listRek = readAll(SHEETS.REKENING) || [];
  
  // 1. Initialize active bank accounts
  listRek.forEach(function(r) {
    if (String(r.aktif) !== 'false') {
      var label = r.namaBank + ' - ' + r.nomor;
      var grp = getBankGroupName(r.namaBank);
      byRekening[r.id] = { id: r.id, nama: label, nomor: r.nomor, bankGroup: grp, penerimaan: 0, pentasyarufan: 0, saldo: 0 };
    }
  });
  
  // 2. Aggregate Penghimpunan (Receipts) - Only bank/transfer transactions go to byRekening
  H.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    var method = String(r.metode || '').toLowerCase();
    var isCash = !(method.indexOf('transfer') >= 0 || method.indexOf('bank') >= 0 || method.indexOf('debit') >= 0 || method.indexOf('wallet') >= 0 || method.indexOf('qris') >= 0);

    if (!isCash && r.rekeningId && byRekening[r.rekeningId]) {
      byRekening[r.rekeningId].penerimaan += n;
      byRekening[r.rekeningId].saldo += n;
    } else if (!isCash && r.bank) {
      var label = r.bank;
      var grp = getBankGroupName(label);
      var matchedId = null;
      Object.keys(byRekening).forEach(function(k) {
        if (byRekening[k].nama === label || label.indexOf(byRekening[k].nomor) >= 0) {
          matchedId = k;
        }
      });
      if (matchedId) {
        byRekening[matchedId].penerimaan += n;
        byRekening[matchedId].saldo += n;
      } else {
        if (!byRekening[label]) {
          byRekening[label] = { id: label, nama: label, nomor: '', bankGroup: grp, penerimaan: 0, pentasyarufan: 0, saldo: 0 };
        }
        byRekening[label].penerimaan += n;
        byRekening[label].saldo += n;
      }
    }
    // Cash transactions are tracked in byBank but NOT in byRekening
  });

  // 3. Aggregate Pentasyarufan (Expenditures) - Only bank/transfer transactions
  T.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    var method = String(r.metode || '').toLowerCase();
    var isCash = !(method.indexOf('transfer') >= 0 || method.indexOf('bank') >= 0 || method.indexOf('debit') >= 0 || method.indexOf('wallet') >= 0 || method.indexOf('qris') >= 0);

    if (!isCash && r.rekeningId && byRekening[r.rekeningId]) {
      byRekening[r.rekeningId].pentasyarufan += n;
      byRekening[r.rekeningId].saldo -= n;
    } else if (!isCash && r.bank) {
      var label = r.bank;
      var grp = getBankGroupName(label);
      var matchedId = null;
      Object.keys(byRekening).forEach(function(k) {
        if (byRekening[k].nama === label || label.indexOf(byRekening[k].nomor) >= 0) {
          matchedId = k;
        }
      });
      if (matchedId) {
        byRekening[matchedId].pentasyarufan += n;
        byRekening[matchedId].saldo -= n;
      } else {
        if (!byRekening[label]) {
          byRekening[label] = { id: label, nama: label, nomor: '', bankGroup: grp, penerimaan: 0, pentasyarufan: 0, saldo: 0 };
        }
        byRekening[label].pentasyarufan += n;
        byRekening[label].saldo -= n;
      }
    }
    // Cash pentasyarufan tracked in byBank but NOT in byRekening
  });
  
  // If month filter is selected, keep only accounts that have transactions in this month
  if (filterPrefix) {
    var filteredRek = {};
    Object.keys(byRekening).forEach(function(k) {
      var item = byRekening[k];
      if (item.penerimaan > 0 || item.pentasyarufan > 0) {
        filteredRek[k] = item;
      }
    });
    byRekening = filteredRek;
  }
  
  return {
    totalHimpun: tH,
    totalTasyaruf: tT,
    saldo: tH - tT,
    jumlahDonatur: uniq(H, 'namaDonatur'),
    jumlahMustahik: uniq(T, 'namaPenerima'),
    transaksiHimpun: H.length,
    transaksiTasyaruf: T.length,
    byJenis: byJenis,
    byLayananHimpun: byLayananHimpun,
    byLayananSalur: byLayananSalur,
    byLayanan: byLayananHimpun, // backward compatibility
    byFundraising: byFundraising,
    byAshnaf: byAshnaf,
    byBank: byBank,
    byPilar: byPilar,
    byRekening: byRekening,
    series: series,
    availableMonths: availableMonths,
    selectedMonth: filterMonth || 'Semua',
    recentHimpun: H.sort(function(a, b) {
      return new Date(b.dibuat) - new Date(a.dibuat);
    }).slice(0, 15),
    recentTasyaruf: T.sort(function(a, b) {
      return new Date(b.dibuat) - new Date(a.dibuat);
    }).slice(0, 15),
    detailHarian: (function() {
      if (!filterPrefix) return null;
      var detail = {};
      var parts = filterPrefix.split('-');
      var yr = Number(parts[0]), mo = Number(parts[1]);
      var daysInMonth = new Date(yr, mo, 0).getDate();
      for (var d = 1; d <= daysInMonth; d++) {
        var dStr = ('0' + d).slice(-2);
        detail[filterPrefix + '-' + dStr] = 0;
      }
      H.forEach(function(r) {
        if (r.tanggal) {
          var tglStr = String(r.tanggal).split('T')[0];
          if (typeof detail[tglStr] !== 'undefined') {
            detail[tglStr] += Number(r.jumlah) || 0;
          }
        }
      });
      return detail;
    })(),
    detailPekanan: (function() {
      if (!filterPrefix) return null;
      var detail = { 'Minggu 1 (1-7)': 0, 'Minggu 2 (8-14)': 0, 'Minggu 3 (15-21)': 0, 'Minggu 4 (22-28)': 0, 'Minggu 5 (29-31)': 0 };
      H.forEach(function(r) {
        if (r.tanggal) {
          var tglStr = String(r.tanggal).split('T')[0];
          var dateParts = tglStr.split('-');
          var dayNum = Number(dateParts[2]);
          var n = Number(r.jumlah) || 0;
          if (dayNum >= 1 && dayNum <= 7) {
            detail['Minggu 1 (1-7)'] += n;
          } else if (dayNum >= 8 && dayNum <= 14) {
            detail['Minggu 2 (8-14)'] += n;
          } else if (dayNum >= 15 && dayNum <= 21) {
            detail['Minggu 3 (15-21)'] += n;
          } else if (dayNum >= 22 && dayNum <= 28) {
            detail['Minggu 4 (22-28)'] += n;
          } else if (dayNum >= 29) {
            detail['Minggu 5 (29-31)'] += n;
          }
        }
      });
      return detail;
    })(),
    selectedPekan: filterPekan || 'Semua',
    selectedHari: filterHari || 'Semua',
    settings: getAllSettings()
  };
}
function mk(d){try{return Utilities.formatDate(new Date(d),TZ,'yyyy-MM');}catch(e){return 'NA';}}
function uniq(rows,k){var s={};rows.forEach(function(r){if(r[k])s[String(r[k]).toLowerCase()]=1;});return Object.keys(s).length;}
function apiDashboard(t, filterMonth, filterPekan, filterHari){ _requirePerm(t,'dashboard','view'); return buildDashboard(filterMonth, filterPekan, filterHari); }
function apiPublicDashboard(t){ if(getSetting('publicEnabled')!=='true') throw new Error('Dashboard publik dinonaktifkan.'); if(t!==getSetting('publicToken')) throw new Error('Token tidak valid.');
  var d=buildDashboard(); d.recentHimpun=d.recentHimpun.map(function(r){return {tanggal:r.tanggal,program:r.program,jenisDana:r.jenisDana,jumlah:r.jumlah};}); d.recentTasyaruf=d.recentTasyaruf.map(function(r){return {tanggal:r.tanggal,program:r.program,ashnaf:r.ashnaf,jumlah:r.jumlah};}); return d; }

/* ===== JURNAL PENERIMAAN ===== */
function fundGroupOf(jenis,sub){ var j=(jenis||'').toLowerCase(); if(j.indexOf('zakat')>=0)return 'ZAKAT'; if(j.indexOf('amil')>=0)return 'AMIL'; if(j.indexOf('wakaf')>=0)return 'WAKAF'; if(j.indexOf('infak')>=0||j.indexOf('infaq')>=0||j.indexOf('sedekah')>=0||j.indexOf('fidyah')>=0)return 'INFAK'; if(j.indexOf('kurban')>=0)return 'KURBAN'; return 'DSKL'; }
function titleGroup(g){ var map={ZAKAT:'Zakat',INFAK:'Infak',AMIL:'Amil',WAKAF:'Wakaf',KURBAN:'Kurban',DSKL:'DSKL'}; return map[g]||g; }
function isTransfer(m){ m=String(m||'').toLowerCase(); return m.indexOf('transfer')>=0||m.indexOf('bank')>=0||m.indexOf('qris')>=0||m.indexOf('debit')>=0||m.indexOf('wallet')>=0; }

function getMonthFromDate(dStr) {
  if (!dStr) return '';
  var parts = String(dStr).split('T')[0].split('-');
  if (parts.length >= 2) {
    return parts[0] + '-' + parts[1];
  }
  return '';
}

function _getJurnalData(year, month) {
  var listRek = readAll(SHEETS.REKENING) || [];
  var layMap={}; readAll(SHEETS.LAYANAN).forEach(function(l){layMap[l.id]=l;});
  
  var himpunRows=readAll(SHEETS.PENGHIMPUNAN).filter(function(r){
    if(!r.tanggal)return false;
    var d=new Date(r.tanggal);
    return d.getFullYear()===year&&(d.getMonth()+1)===month;
  });
  
  var salurRows=readAll(SHEETS.PENTASYARUFAN).filter(function(r){
    if(!r.tanggal)return false;
    var d=new Date(r.tanggal);
    return d.getFullYear()===year&&(d.getMonth()+1)===month;
  });
  
  function catTerikat(r){ var s=(r.pilar||r.subJenis||'').replace(/infak/ig,'').replace(/terikat/ig,'').replace(/[-•]/g,' ').trim(); return s||'Umum'; }
  function donorLabel(r){ if(r.layananId&&layMap[r.layananId]){var l=layMap[r.layananId];return (l.tipe==='ULL'?'ULL ':'KLL ')+l.nama;} return r.namaDonatur||r.namaLayanan||'-'; }
  
  function getCleanBankName(r, via) {
    if (via === 'BANK') {
      var matched = listRek.find(function(x){ return x.id === r.rekeningId; });
      if (matched) {
        return matched.namaBank + ' - ' + matched.nomor;
      }
      var cleanBank = String(r.bank || '').trim();
      var cleanM = cleanBank.match(/^([^(]+)/);
      return cleanM ? cleanM[1].trim() : cleanBank;
    } else {
      var matched = listRek.find(function(x){ return x.id === r.rekeningId; });
      if (matched) return matched.namaBank;
      return r.bank || 'Kas';
    }
  }

  var secMap={};
  
  himpunRows.forEach(function(r){
    var via=isTransfer(r.metode)?'BANK':'KAS';
    var jl=(r.jenisDana||'').toLowerCase(), sl=(r.subJenis||'').toLowerCase();
    
    // Check if Setor Tunai
    if (sl.indexOf('setor') >= 0 || jl.indexOf('setor') >= 0) {
      var secKey = 'SETOR TUNAI';
      var debitAcc = getCleanBankName(r, 'BANK');
      var creditAcc = (r.bank && r.bank.toLowerCase().indexOf('kas') >= 0) ? r.bank : ('Kas ' + (r.jenisDana || 'Zakat'));
      var ket = r.keterangan || 'Setor tunai';
      
      var tgl=Utilities.formatDate(new Date(r.tanggal),TZ,'dd/MM/yyyy'); var amt=Number(r.jumlah)||0; var ref=r.noKwitansi||'-';
      secMap[secKey]=secMap[secKey]||{title:secKey,lines:[],subtotal:0};
      secMap[secKey].lines.push({tanggal:tgl,ref:ref,kode:'',akun:debitAcc,debit:amt,kredit:'',ket:ket});
      secMap[secKey].lines.push({tanggal:tgl,ref:ref,kode:'',akun:creditAcc,debit:'',kredit:amt,ket:ket});
      secMap[secKey].subtotal+=amt;
      return;
    }

    var groupLabel, creditAcc, debitBase, ketPrefix;
    if(jl.indexOf('zakat')>=0){
      groupLabel='ZAKAT';
      debitBase='Zakat';
      var cleanSub = r.subJenis ? String(r.subJenis).replace(/^zakat\s+/i, '') : '';
      creditAcc='Penerimaan Zakat'+(cleanSub?(' '+cleanSub):'');
      ketPrefix=r.subJenis||'Zakat';
    }
    else if(jl.indexOf('amil')>=0){ groupLabel='AMIL'; debitBase='Amil'; creditAcc='Penerimaan Amil'; ketPrefix='Amil'; }
    else if(jl.indexOf('wakaf')>=0){ groupLabel='WAKAF'; debitBase='Wakaf'; creditAcc='Penerimaan Wakaf'; ketPrefix='Wakaf'; }
    else if(jl.indexOf('infak')>=0||jl.indexOf('infaq')>=0||jl.indexOf('sedekah')>=0){
      debitBase='Infak';
      var terikat = sl.indexOf('terikat')>=0 || (!!r.pilar && sl.indexOf('umum')<0);
      if(terikat){ var kat=catTerikat(r); groupLabel='INFAK TERIKAT'; creditAcc='Penerimaan Infak Terikat - '+kat; ketPrefix='Infak Terikat'; }
      else { groupLabel='INFAK UMUM'; creditAcc='Penerimaan Infak Umum'; ketPrefix='Infak Umum'; }
    } else { groupLabel=(r.jenisDana||'LAINNYA').toUpperCase(); debitBase=r.jenisDana||'Lainnya'; creditAcc='Penerimaan '+(r.jenisDana||'Lainnya'); ketPrefix=r.jenisDana||'Lainnya'; }
    
    var secKey;
    if (r.section) {
      secKey = r.section;
    } else {
      if (groupLabel === 'BAGI HASIL BANK') secKey = 'BAGI HASIL BANK';
      else if (groupLabel === 'PENGEMBALIAN UMP') secKey = 'PENGEMBALIAN UMP';
      else secKey = 'PENERIMAAN '+groupLabel+' VIA '+via;
    }
    
    var debitAcc = getCleanBankName(r, via);
    if (!debitAcc || debitAcc === 'Kas') {
      debitAcc = (via==='BANK'?'Bank ':'Kas ')+debitBase;
    }
    
    var ket=(ketPrefix+' '+donorLabel(r)).trim();
    if (r.keterangan) ket = r.keterangan;
    
    var tgl=Utilities.formatDate(new Date(r.tanggal),TZ,'dd/MM/yyyy'); var amt=Number(r.jumlah)||0; var ref=r.noKwitansi||'-';
    secMap[secKey]=secMap[secKey]||{title:secKey,lines:[],subtotal:0};
    secMap[secKey].lines.push({tanggal:tgl,ref:ref,kode:'',akun:debitAcc,debit:amt,kredit:'',ket:ket});
    secMap[secKey].lines.push({tanggal:tgl,ref:ref,kode:'',akun:creditAcc,debit:'',kredit:amt,ket:ket});
    secMap[secKey].subtotal+=amt;
  });
  
  salurRows.forEach(function(r){
    var via=isTransfer(r.metode)?'BANK':'KAS';
    
    var secKey;
    if (r.section) {
      secKey = r.section;
    } else {
      var progLower = String(r.program || '').toLowerCase();
      if (progLower.indexOf('administrasi bank') >= 0) {
        secKey = 'BIAYA ADMINISTRASI BANK';
      } else if (r.sumberDana === 'Amil') {
        secKey = via === 'BANK' ? 'OPERASIONAL AMIL VIA BANK' : 'OPERASIONAL AMIL VIA KAS';
      } else if (r.sumberDana === 'Infak') {
        if (progLower.indexOf('terikat') >= 0) secKey = 'PENYALURAN INFAK TERIKAT';
        else if (r.keterangan && r.keterangan.toLowerCase().indexOf('lpj') >= 0) secKey = 'UMP LPJ INFAK';
        else secKey = 'PENYALURAN INFAK UMUM';
      } else if (r.sumberDana === 'Zakat') {
        secKey = 'UMP LPJ ZAKAT';
      } else {
        secKey = 'UMP LPJ ' + String(r.sumberDana || 'INFAK').toUpperCase();
      }
    }
    
    var debitAcc = r.program || 'Penyaluran';
    var creditAcc = getCleanBankName(r, via);
    if (!creditAcc || creditAcc === 'Kas') {
      creditAcc = (via==='BANK'?'Bank ':'Kas ')+(r.sumberDana || 'Infak');
    }
    
    var ket = r.keterangan || (r.program + ' ' + r.namaPenerima);
    
    var tgl=Utilities.formatDate(new Date(r.tanggal),TZ,'dd/MM/yyyy'); var amt=Number(r.jumlah)||0; var ref='-';
    secMap[secKey]=secMap[secKey]||{title:secKey,lines:[],subtotal:0};
    secMap[secKey].lines.push({tanggal:tgl,ref:ref,kode:'',akun:debitAcc,debit:amt,kredit:'',ket:ket});
    secMap[secKey].lines.push({tanggal:tgl,ref:ref,kode:'',akun:creditAcc,debit:'',kredit:amt,ket:ket});
    secMap[secKey].subtotal+=amt;
  });
  
  var order=[
    'PENERIMAAN ZAKAT VIA KAS', 'PENERIMAAN ZAKAT VIA BANK',
    'PENERIMAAN AMIL VIA KAS', 'PENERIMAAN AMIL VIA BANK',
    'PENERIMAAN INFAK TERIKAT VIA KAS', 'PENERIMAAN INFAK TERIKAT VIA BANK',
    'PENERIMAAN INFAK UMUM VIA KAS', 'PENERIMAAN INFAK UMUM VIA BANK',
    'PENERIMAAN WAKAF VIA KAS', 'PENERIMAAN WAKAF VIA BANK',
    'BAGI HASIL BANK', 'PENGEMBALIAN UMP',
    'SETOR TUNAI',
    'BIAYA ADMINISTRASI BANK',
    'OPERASIONAL AMIL VIA BANK', 'OPERASIONAL AMIL VIA KAS',
    'PENYALURAN INFAK TERIKAT', 'PENYALURAN INFAK UMUM',
    'UMP LPJ ZAKAT', 'UMP LPJ INFAK', 'UMP LPJ AMIL'
  ];
  
  var keys=Object.keys(secMap).sort(function(a,b){var ia=order.indexOf(a),ib=order.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
  var sections=keys.map(function(k){return secMap[k];}); var grand=0; sections.forEach(function(s){grand+=s.subtotal;});
  
  var totalCount = himpunRows.length + salurRows.length;
  return {
    title: 'JURNAL TRANSAKSI',
    periode: (BULAN[month]||'')+' '+year,
    bulan: month,
    tahun: year,
    sections: sections,
    grandTotal: grand,
    count: totalCount,
    settings: getAllSettings()
  };
}

function apiJurnalData(t,year,month){
  _requirePerm(t,'laporan','view');
  return _getJurnalData(Number(year), Number(month));
}

async function syncMonthlySpreadsheet(filterMonth) {
  if (!filterMonth || filterMonth === 'Semua') return;
  var parts = filterMonth.split('-');
  if (parts.length < 2) return;
  
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  
  var d = _getJurnalData(year, month);
  if (!d) return;
  
  var XLSX = require('xlsx');
  var wb = XLSX.utils.book_new();
  
  function buildSheetData(viaType) {
    var aoa = [[]];
    var count = 0;
    d.sections.forEach(function(sec) {
      var isKas = sec.title.indexOf('VIA KAS') >= 0;
      if ((viaType === 'KAS' && !isKas) || (viaType === 'BANK' && isKas)) {
        return;
      }
      if (count > 0) {
        aoa.push([]);
        aoa.push([]);
      }
      aoa.push(['', sec.title, '', '', '']);
      sec.lines.forEach(function(l) {
        var dateVal = l.tanggal;
        var tParts = dateVal.split('/');
        if (tParts.length === 3) {
          dateVal = new Date(Number(tParts[2]), Number(tParts[1]) - 1, Number(tParts[0]));
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
  
  var tunaiAoa = buildSheetData('KAS');
  var wsTunai = XLSX.utils.aoa_to_sheet(tunaiAoa);
  XLSX.utils.book_append_sheet(wb, wsTunai, 'Tunai');
  
  var bankAoa = buildSheetData('BANK');
  var wsBank = XLSX.utils.aoa_to_sheet(bankAoa);
  XLSX.utils.book_append_sheet(wb, wsBank, 'Transfer');
  
  var buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  
  var base64 = buf.toString('base64');
  var dataUrl = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + base64;
  setSetting('sheet_data_' + filterMonth, dataUrl);
  setSetting('sheet_url_' + filterMonth, dataUrl);
  setSetting('sheet_updated_' + filterMonth, new Date().toISOString());
  console.log('Synced Monthly Jurnal Spreadsheet for ' + filterMonth + ' (stored as base64)');
}

/* ===== BROADCAST WHATSAPP ===== */
function apiBroadcastReport(t,start,end){
  _requirePerm(t,'laporan','view');
  var s=new Date(start); s.setHours(0,0,0,0); var e=new Date(end); e.setHours(23,59,59,999);
  function inRange(r){ if(!r.tanggal)return false; var d=new Date(r.tanggal); return d>=s&&d<=e; }
  var H=readAll(SHEETS.PENGHIMPUNAN).filter(inRange), T=readAll(SHEETS.PENTASYARUFAN).filter(inRange);
  
  var tH = 0;
  var himpunBreakdown = { zakat: 0, infakUmum: 0, infakTerikat: 0, amil: 0, dskl: 0 };
  H.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    tH += n;
    var g = String(r.jenisDana || '').toLowerCase();
    var sub = String(r.subJenis || '').toLowerCase();
    if (g === 'zakat') {
      himpunBreakdown.zakat += n;
    } else if (g === 'infak' || g === 'infaq') {
      if (sub.indexOf('terikat') >= 0) {
        himpunBreakdown.infakTerikat += n;
      } else {
        himpunBreakdown.infakUmum += n;
      }
    } else if (g === 'amil') {
      himpunBreakdown.amil += n;
    } else {
      himpunBreakdown.dskl += n;
    }
  });

  var salurBreakdown = { zakat: 0, infak: 0, amil: 0, dskl: 0 };
  var umpBreakdown = { zakat: 0, infakTerikat: 0, infakUmum: 0, amil: 0 };
  var tT = 0;
  
  T.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    tT += n;
    var sd = String(r.sumberDana || '').toLowerCase();
    var prog = String(r.program || '').toLowerCase();
    var ket = String(r.keterangan || '').toLowerCase();
    var isUmp = (prog.indexOf('ump') >= 0 || prog.indexOf('uang muka') >= 0 || ket.indexOf('ump') >= 0 || ket.indexOf('lpj') >= 0 || ket.indexOf('pertanggungjawaban') >= 0);
    
    if (isUmp) {
      if (sd === 'zakat') {
        umpBreakdown.zakat += n;
      } else if (sd === 'infak' || sd === 'infaq') {
        if (prog.indexOf('terikat') >= 0 || ket.indexOf('terikat') >= 0) {
          umpBreakdown.infakTerikat += n;
        } else {
          umpBreakdown.infakUmum += n;
        }
      } else if (sd === 'amil') {
        umpBreakdown.amil += n;
      }
    } else {
      if (sd === 'zakat') {
        salurBreakdown.zakat += n;
      } else if (sd === 'infak' || sd === 'infaq') {
        salurBreakdown.infak += n;
      } else if (sd === 'amil') {
        salurBreakdown.amil += n;
      } else {
        salurBreakdown.dskl += n;
      }
    }
  });

  function fmtTgl(d){return Utilities.formatDate(d,TZ,'dd MMMM yyyy');}
  var pRaw = start === end ? fmtTgl(s) : fmtTgl(s) + ' s/d ' + fmtTgl(e);
  
  return { 
    periode: fmtTgl(s)+' s/d '+fmtTgl(e), 
    periodeRaw: pRaw,
    totalHimpun: tH, 
    totalTasyaruf: tT, 
    himpunBreakdown: himpunBreakdown,
    salurBreakdown: salurBreakdown,
    umpBreakdown: umpBreakdown,
    donatur: uniq(H,'namaDonatur'), 
    mustahik: uniq(T,'namaPenerima'), 
    trxHimpun: H.length, 
    trxTasyaruf: T.length, 
    settings: getAllSettings() 
  };
}

function convertGoogleSheetUrl(url) {
  var m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) {
    return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=xlsx';
  }
  return url;
}

function parseAmount(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  var s = String(val).trim();
  if (s.indexOf('.') >= 0 && s.indexOf(',') >= 0) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else if (s.indexOf('.') >= 0) {
    var parts = s.split('.');
    if (parts.length > 2 || parts[parts.length - 1].length === 3) {
      s = s.replace(/\./g, '');
    }
  } else if (s.indexOf(',') >= 0) {
    s = s.replace(/,/g, '.');
  }
  return Number(s.replace(/[^0-9.-]/g, '')) || 0;
}

function parseTSV(text) {
  var lines = String(text).split(/\r?\n/);
  if (lines.length === 0) return [];
  
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) return [];
  
  var headers = lines[0].split('\t').map(function(h) {
    return h.trim();
  });
  
  var result = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = lines[i].split('\t');
    var row = {};
    headers.forEach(function(h, idx) {
      if (h) {
        row[h] = cols[idx] !== undefined ? cols[idx].trim() : '';
      }
    });
    result.push(row);
  }
  return result;
}

function parseImportDate(val) {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    var date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }
  var s = String(val).trim();
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);
    return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
  }
  try {
    var d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch (e) {}
  return s;
}

function fuzzyMatch(val, options, defaultVal) {
  if (!val) return defaultVal;
  var s = String(val).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return defaultVal;
  
  for (var i = 0; i < options.length; i++) {
    var opt = options[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (s === opt || opt.indexOf(s) >= 0 || s.indexOf(opt) >= 0) {
      return options[i];
    }
  }
  
  var hasTerikat = options.indexOf('Infak Terikat') >= 0 ? 'Infak Terikat' : (options.indexOf('Sedekah Terikat') >= 0 ? 'Sedekah Terikat' : '');
  
  var mappings = {
    zakat: 'Zakat', zakatmaal: 'Zakat', zakatharta: 'Zakat', fitrah: 'Zakat', fitri: 'Zakat', penghasilan: 'Zakat', profesi: 'Zakat',
    infaq: 'Infak', infak: 'Infak', sedekah: 'Sedekah', shadaqah: 'Sedekah', wakaf: 'Wakaf', kurban: 'Kurban', qurban: 'Kurban',
    fidyah: 'Fidyah', fidiah: 'Fidyah', dskl: 'DSKL', csr: 'DSKL',
    zakatfitrah: 'Zakat Fitrah', zakatprofesi: 'Zakat Profesi/Penghasilan',
    zakatmal: 'Zakat Mal', harta: 'Zakat Mal', zakatharta: 'Zakat Mal',
    zakatperdagangan: 'Zakat Perdagangan', dagang: 'Zakat Perdagangan',
    zakatpertanian: 'Zakat Pertanian', tani: 'Zakat Pertanian', sawah: 'Zakat Pertanian', kebun: 'Zakat Pertanian',
    zakatemas: 'Zakat Emas & Perak', emas: 'Zakat Emas & Perak', perak: 'Zakat Emas & Perak',
    zakatsimpanan: 'Zakat Simpanan', tabungan: 'Zakat Simpanan', simpanan: 'Zakat Simpanan',
    umum: options.indexOf('Infak Umum') >= 0 ? 'Infak Umum' : (options.indexOf('Sedekah Umum') >= 0 ? 'Sedekah Umum' : 'Infak Umum'),
    terikat: hasTerikat || 'Infak Terikat',
    pendidikan: hasTerikat || 'Bantuan Pendidikan',
    kesehatan: hasTerikat || 'Bantuan Kesehatan',
    kemanusiaan: hasTerikat || 'Bantuan Bencana',
    dakwah: hasTerikat || 'Fi Sabilillah',
    ekonomi: hasTerikat || 'Modal Usaha',
    tunai: 'Cash/Tunai', cash: 'Cash/Tunai', cashtunai: 'Cash/Tunai',
    transfer: 'Transfer Bank', bank: 'Transfer Bank', transferbank: 'Transfer Bank', tf: 'Transfer Bank',
    qris: 'QRIS', barcode: 'QRIS', scan: 'QRIS',
    ewallet: 'E-Wallet', wallet: 'E-Wallet', gopay: 'E-Wallet', ovo: 'E-Wallet', dana: 'E-Wallet', linkaja: 'E-Wallet', shopeepay: 'E-Wallet',
    debit: 'Debit/Kartu', kartu: 'Debit/Kartu', card: 'Debit/Kartu',
    fakir: 'Fakir', miskin: 'Miskin', dhuafa: 'Miskin', amil: 'Amil', petugas: 'Amil', muallaf: 'Muallaf', mualaf: 'Muallaf',
    riqab: 'Riqab (Memerdekakan Budak)', budak: 'Riqab (Memerdekakan Budak)', gharimin: 'Gharimin (Berhutang)', hutang: 'Gharimin (Berhutang)',
    fisabilillah: 'Fi Sabilillah', sabilillah: 'Fi Sabilillah', masjid: 'Fi Sabilillah', musholla: 'Fi Sabilillah', dakwah: 'Fi Sabilillah',
    ibnusabil: 'Ibnu Sabil', musafir: 'Ibnu Sabil', sabil: 'Ibnu Sabil',
    sembako: 'Sembako', makanan: 'Sembako', beras: 'Sembako', beasiswa: 'Beasiswa', sekolah: 'Beasiswa', kuliah: 'Beasiswa',
    modal: 'Modal Usaha', usaha: 'Modal Usaha', bencana: 'Bantuan Bencana', banjir: 'Bantuan Bencana', gempa: 'Bantuan Bencana',
    pembangunan: 'Pembangunan', rehab: 'Pembangunan', mushola: 'Pembangunan'
  };

  for (var key in mappings) {
    if (s.indexOf(key) >= 0 || key.indexOf(s) >= 0) {
      var mappedVal = mappings[key];
      if (options.indexOf(mappedVal) >= 0) return mappedVal;
    }
  }

  return defaultVal;
}

function cleanFundraisingName(name) {
  if (!name) return 'Lazismu Daerah Bantul';
  var clean = String(name).trim().toLowerCase();
  var options = ['lazismu daerah bantul', 'sherli', 'renata', 'ariya', 'nur yulianto', 'muzakki'];
  var originalOptions = ['Lazismu Daerah Bantul', 'Sherli', 'Renata', 'Ariya', 'Nur Yulianto', 'Muzakki'];
  for (var i = 0; i < options.length; i++) {
    if (clean === options[i] || clean.indexOf(options[i]) >= 0 || options[i].indexOf(clean) >= 0) {
      return originalOptions[i];
    }
  }
  for (var i = 0; i < options.length; i++) {
    var parts = options[i].split(' ');
    for (var j = 0; j < parts.length; j++) {
      if (parts[j].length > 3 && clean.indexOf(parts[j]) >= 0) {
        return originalOptions[i];
      }
    }
  }
  return 'Lazismu Daerah Bantul';
}

function extractFundraisingFromText(text) {
  if (!text) return '';
  var clean = String(text).toLowerCase();
  var options = ['lazismu daerah bantul', 'sherli', 'renata', 'ariya', 'nur yulianto', 'muzakki'];
  var originalOptions = ['Lazismu Daerah Bantul', 'Sherli', 'Renata', 'Ariya', 'Nur Yulianto', 'Muzakki'];
  for (var i = 0; i < options.length; i++) {
    var opt = options[i];
    if (clean.indexOf(opt) >= 0) {
      return originalOptions[i];
    }
  }
  return '';
}

function parseUraianDetails(rawUraian, listLayanan) {
  var s = String(rawUraian).trim();
  var donorName = s;
  var suffix = '';
  var matchedLay = null;
  
  var upper = s.toUpperCase();
  var isKLL = upper.indexOf('KLL ') === 0;
  var isULL = upper.indexOf('ULL ') === 0;
  
  if (isKLL || isULL) {
    var cleanS = s.toLowerCase().replace(/kll|ull|kl|lazismu/g, '').replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < listLayanan.length; i++) {
      var l = listLayanan[i];
      var cleanLName = l.nama.toLowerCase().replace(/kll|ull|kl|lazismu/g, '').replace(/[^a-z0-9]/g, '');
      if (cleanS.indexOf(cleanLName) === 0) {
        matchedLay = l;
        donorName = (isKLL ? 'KLL ' : 'ULL ') + l.nama;
        
        var idx = upper.indexOf(l.nama.toUpperCase());
        if (idx >= 0) {
          suffix = s.substring(idx + l.nama.length);
        } else {
          var parts = s.split(/[\-\:]/);
          if (parts.length > 1) {
            suffix = parts.slice(1).join('-').trim();
          } else {
            var words = s.split(/\s+/);
            suffix = words.slice(2).join(' ');
          }
        }
        break;
      }
    }
    
    if (!matchedLay) {
      var parts = s.split(/[\-\:]/);
      if (parts.length > 1) {
        donorName = parts[0].trim();
        suffix = parts.slice(1).join('-').trim();
      } else {
        var words = s.split(/\s+/);
        if (words.length > 2) {
          donorName = words[0] + ' ' + words[1];
          suffix = words.slice(2).join(' ');
        } else {
          donorName = s;
          suffix = '';
        }
      }
    }
  } else {
    var parts = s.split(/[\-\:]/);
    if (parts.length > 1) {
      donorName = parts[0].trim();
      suffix = parts.slice(1).join('-').trim();
    } else {
      var keywords = [
        'infak umum', 'infaq umum', 'infak terikat', 'infaq terikat',
        'kesehatan', 'sehat', 'ambulan', 'klinik', 'sakit', 'obat',
        'pendidikan', 'sekolah', 'beasiswa', 'pondok', 'pesantren', 'asy syifa', 'asy-syifa', 'sdua', 'sd', 'smp', 'sma', 'smk', 'tk', 'aba',
        'kebakaran', 'bencana', 'sosial', 'dakwah', 'kemanusiaan', 'pdm', 'pcm', 'prm', 'kokam',
        'ekonomi', 'usaha', 'modal',
        'zakat', 'sedekah', 'shadaqah', 'fidyah', 'fidiah', 'wakaf'
      ];
      var foundIdx = -1;
      for (var k = 0; k < keywords.length; k++) {
        var kw = keywords[k];
        var idx = s.toLowerCase().indexOf(kw);
        if (idx >= 0 && (foundIdx === -1 || idx < foundIdx)) {
          foundIdx = idx;
        }
      }
      if (foundIdx > 0) {
        donorName = s.substring(0, foundIdx).trim();
        suffix = s.substring(foundIdx).trim();
      } else {
        donorName = s;
        suffix = '';
      }
    }
  }
  
  suffix = suffix.trim().replace(/^[\-\:\s]+/, '').trim();
  
  return {
    donorName: donorName,
    suffix: suffix,
    matchedLay: matchedLay
  };
}

function mapImportedRow(row, type) {
  var normalized = {};
  Object.keys(row).forEach(function(k) {
    var nk = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    normalized[nk] = row[k];
  });

  function getVal(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (normalized[keys[i]] !== undefined) {
        return normalized[keys[i]];
      }
    }
    return '';
  }

  var todayDate = new Date().toISOString().slice(0, 10);
  if (type === 'himpun') {
    var rawUraian = getVal(['uraian', 'namadonatur', 'donatur', 'nama', 'muzakki', 'pemberi', 'atasnama']);
    var listLayanan = readAll(SHEETS.LAYANAN) || [];
    var parsed = parseUraianDetails(rawUraian, listLayanan);
    
    var namaDonatur = parsed.donorName;
    var tipeDonatur = 'Perorangan';
    var layananId = '';
    
    if (parsed.matchedLay) {
      layananId = parsed.matchedLay.id;
      tipeDonatur = parsed.donorName.toUpperCase().indexOf('KLL ') === 0 ? 'Kantor Layanan (KLL)' : 'Unit Layanan (ULL)';
    } else if (parsed.donorName.toUpperCase().indexOf('KLL ') === 0 || parsed.donorName.toUpperCase().indexOf('ULL ') === 0) {
      tipeDonatur = parsed.donorName.toUpperCase().indexOf('KLL ') === 0 ? 'Kantor Layanan (KLL)' : 'Unit Layanan (ULL)';
    }
    
    var matchedRek = null;
    var listRek = readAll(SHEETS.REKENING) || [];
    var incomingRekId = getVal(['rekeningid']);
    if (incomingRekId) {
      matchedRek = listRek.find(function(x) { return String(x.id) === String(incomingRekId); });
    }
    if (!matchedRek) {
      var rekNo = String(getVal(['rekeningnomor', 'nomorrekening', 'rekening']) || '').replace(/\D/g, '').replace(/^0+/, '');
      if (rekNo) {
        matchedRek = listRek.find(function(r) {
          var dbNo = String(r.nomor || '').replace(/\D/g, '').replace(/^0+/, '');
          return dbNo === rekNo;
        });
      }
    }
    if (!matchedRek) {
      var bankVal = String(getVal(['bank', 'namabank', 'rekeningbank', 'rekening']) || '').toLowerCase();
      if (bankVal) {
        matchedRek = listRek.find(function(r) {
          var dbName = String(r.namaBank || '').toLowerCase();
          var dbNo = String(r.nomor || '');
          return bankVal.indexOf(dbName) >= 0 || dbName.indexOf(bankVal) >= 0 || bankVal.indexOf(dbNo) >= 0;
        });
      }
    }

    var isZakatAcc = false;
    if (matchedRek) {
      var fg = String(matchedRek.fundGroup || '').toLowerCase();
      var rNo = String(matchedRek.nomor || '');
      if (fg === 'zakat' || rNo.indexOf('9004') >= 0 || rNo.indexOf('880') >= 0) {
        isZakatAcc = true;
      }
    } else {
      var bankValLower = String(getVal(['bank', 'namabank', 'rekeningbank', 'rekening'])).toLowerCase();
      if (bankValLower.indexOf('9004') >= 0 || bankValLower.indexOf('880') >= 0) {
        isZakatAcc = true;
      }
    }

    var jDana = isZakatAcc ? 'Zakat' : 'Infak';
    var sJenis = isZakatAcc ? 'Zakat Mal' : 'Infak Umum';
    var pilar = '';
    var program = isZakatAcc ? 'Penerimaan Zakat' : '';
    
    var upperUraian = String(rawUraian).toUpperCase();
    if (upperUraian.indexOf('ZAKAT') >= 0 || isZakatAcc) {
      jDana = 'Zakat';
      sJenis = 'Zakat Mal';
      if (upperUraian.indexOf('FITRAH') >= 0 || upperUraian.indexOf('FITRI') >= 0) {
        sJenis = 'Zakat Fitrah';
      } else if (upperUraian.indexOf('PROFESI') >= 0 || upperUraian.indexOf('PENGHASILAN') >= 0) {
        sJenis = 'Zakat Profesi/Penghasilan';
      }
      pilar = '';
      program = 'Penerimaan Zakat';
    } else if (upperUraian.indexOf('AMIL') >= 0) {
      jDana = 'Amil';
      sJenis = 'Amil';
      pilar = '';
      program = 'Penerimaan Amil';
    } else if (upperUraian.indexOf('WAKAF') >= 0) {
      jDana = 'Wakaf';
      sJenis = 'Wakaf Uang';
      pilar = '';
      program = 'Penerimaan Wakaf';
    } else {
      var suffixLower = parsed.suffix.toLowerCase();
      if (suffixLower === '' || suffixLower.indexOf('infak umum') >= 0 || suffixLower.indexOf('infaq umum') >= 0) {
        jDana = 'Infak';
        sJenis = 'Infak Umum';
        pilar = '';
        program = 'Infak Umum';
      } else {
        jDana = 'Infak';
        sJenis = 'Infak Terikat';
        
        if (suffixLower.indexOf('kesehatan') >= 0 || suffixLower.indexOf('sehat') >= 0 || suffixLower.indexOf('ambulan') >= 0 || suffixLower.indexOf('klinik') >= 0 || suffixLower.indexOf('sakit') >= 0 || suffixLower.indexOf('obat') >= 0) {
          pilar = 'Kesehatan';
          program = 'Kesehatan';
        } else if (suffixLower.indexOf('pendidikan') >= 0 || suffixLower.indexOf('sekolah') >= 0 || suffixLower.indexOf('beasiswa') >= 0 || suffixLower.indexOf('pondok') >= 0 || suffixLower.indexOf('pesantren') >= 0 || suffixLower.indexOf('asy syifa') >= 0 || suffixLower.indexOf('asy-syifa') >= 0 || suffixLower.indexOf('sdua') >= 0 || suffixLower.indexOf('sd') >= 0 || suffixLower.indexOf('smp') >= 0 || suffixLower.indexOf('sma') >= 0 || suffixLower.indexOf('smk') >= 0 || suffixLower.indexOf('tk') >= 0 || suffixLower.indexOf('aba') >= 0) {
          pilar = 'Pendidikan';
          program = 'Pendidikan';
        } else if (suffixLower.indexOf('kebakaran') >= 0 || suffixLower.indexOf('dakwah') >= 0 || suffixLower.indexOf('sosial') >= 0 || suffixLower.indexOf('pdm') >= 0 || suffixLower.indexOf('pcm') >= 0 || suffixLower.indexOf('prm') >= 0 || suffixLower.indexOf('kokam') >= 0) {
          pilar = 'Sosial Dakwah';
          program = 'Sosial Dakwah';
        } else if (suffixLower.indexOf('kemanusiaan') >= 0 || suffixLower.indexOf('bencana') >= 0) {
          pilar = 'Kemanusiaan';
          program = 'Kemanusiaan';
        } else if (suffixLower.indexOf('dam') >= 0 || suffixLower.indexOf('kulit') >= 0 || suffixLower.indexOf('kambing') >= 0) {
          pilar = 'DAM';
          program = 'DAM';
        } else if (suffixLower.indexOf('fidyah') >= 0 || suffixLower.indexOf('fidiah') >= 0) {
          pilar = 'Fidyah';
          program = 'Fidyah';
        } else if (suffixLower.indexOf('qurban') >= 0 || suffixLower.indexOf('kurban') >= 0) {
          pilar = 'Qurban';
          program = 'Qurban';
        } else if (suffixLower.indexOf('filantropis') >= 0) {
          pilar = 'Pendidikan';
          program = 'Pendidikan';
        } else {
          pilar = 'Sosial Dakwah';
          program = 'Sosial Dakwah';
        }
      }
    }
    
    var rekId = matchedRek ? matchedRek.id : '';
    var bankLabel = matchedRek ? (matchedRek.namaBank + ' - ' + matchedRek.nomor + ' (' + matchedRek.atasNama + ')') : getVal(['bank', 'namabank', 'rekening']);

    var rawMetode = getVal(['metode', 'via', 'pembayaran']);
    var met = '';
    if (rawMetode) {
      met = fuzzyMatch(rawMetode, METODE, '');
    }
    if (!met) {
      var urUpper = String(rawUraian + ' ' + program + ' ' + getVal(['keterangan', 'memo', 'catatan'])).toUpperCase();
      if (urUpper.indexOf('QRIS') >= 0 || urUpper.indexOf('QR ') >= 0 || urUpper.indexOf('Q-RIS') >= 0) {
        met = 'QRIS';
      } else if (matchedRek) {
        met = 'Transfer Bank';
      } else if (urUpper.indexOf('TRANSFER') >= 0 || urUpper.indexOf('TF ') >= 0 || urUpper.indexOf('BI-FAST') >= 0 || urUpper.indexOf('BIFAS') >= 0 || urUpper.indexOf('MBANK') >= 0 || urUpper.indexOf('I-BANK') >= 0 || urUpper.indexOf('SETORAN') >= 0) {
        met = 'Transfer Bank';
      } else {
        met = 'Cash/Tunai';
      }
    }
    
    var rawTipe = getVal(['tipedonatur', 'tipe', 'golongan']);
    if (rawTipe) tipeDonatur = fuzzyMatch(rawTipe, TIPE_DONATUR, tipeDonatur);

    var amt = parseAmount(getVal(['jumlah', 'nilai', 'nominal', 'amount', 'total', 'debet']));

    return {
      tanggal: getVal(['tanggal', 'date', 'tgl']) || todayDate,
      jenisDana: jDana,
      subJenis: sJenis,
      pilar: pilar || getVal(['pilar', 'kategoriterikat', 'pilarprogram']),
      program: program,
      namaDonatur: namaDonatur,
      tipeDonatur: tipeDonatur,
      layananId: layananId,
      telepon: getVal(['telepon', 'nowa', 'notelp', 'phone', 'wa', 'nohp']),
      email: getVal(['email']),
      alamat: getVal(['alamat']),
      jumlah: amt,
      metode: met,
      rekeningId: rekId,
      bank: bankLabel,
      statusBayar: getVal(['statusbayar', 'status']) || 'Lunas',
      keterangan: getVal(['keterangan', 'memo', 'catatan', 'keterangantambahan']),
      fundraising: cleanFundraisingName(getVal(['fundraising', 'namafundraising', 'fr', 'petugasfundraising', 'petugas']))
    };
  } else {
    var rawAshnaf = getVal(['ashnaf', 'golongan', 'kategori', 'pos']);
    var ash = fuzzyMatch(rawAshnaf, ASHNAF, 'Miskin');
    
    var rawBentuk = getVal(['bentukbantuan', 'bentuk', 'jenis']);
    var bntk = fuzzyMatch(rawBentuk, BENTUK, 'Uang Tunai');
    
    var rawMetode = getVal(['metode', 'via', 'pembayaran']);
    var met = fuzzyMatch(rawMetode, METODE, 'Cash/Tunai');
    var amt = parseAmount(getVal(['jumlah', 'nilai', 'nominal', 'amount', 'total']));

    return {
      tanggal: getVal(['tanggal', 'date', 'tgl']) || todayDate,
      ashnaf: ash,
      sumberDana: fuzzyMatch(getVal(['sumberdana', 'sumber', 'dana']), JENIS_TOP, 'Zakat'),
      program: getVal(['program', 'peruntukan', 'keteranganprogram']),
      namaPenerima: getVal(['namapenerima', 'penerima', 'nama', 'mustahik', 'atasnama']),
      nik: getVal(['nik', 'noktp']),
      telepon: getVal(['telepon', 'nowa', 'notelp', 'phone', 'wa', 'nohp']),
      alamat: getVal(['alamat']),
      jumlah: amt,
      bentukBantuan: bntk,
      metode: met,
      statusSalur: getVal(['statussalur', 'status']) || 'Tersalur',
      keterangan: getVal(['keterangan', 'memo', 'catatan', 'keterangantambahan']),
      fundraising: cleanFundraisingName(getVal(['fundraising', 'namafundraising', 'fr', 'petugasfundraising', 'petugas']))
    };
  }
}

function isValidDateStringOrObject(val) {
  if (!val) return false;
  if (val instanceof Date) return true;
  var str = String(val).trim();
  return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str) || /^\d{4}-\d{2}-\d{2}/.test(str);
}

function checkIsJurnalPenerimaan(rawRows) {
  var matchCount = 0;
  for (var i = 0; i < Math.min(rawRows.length - 1, 100); i++) {
    var r1 = rawRows[i];
    var r2 = rawRows[i+1];
    if (r1 && r2 && r1.length >= 4 && r2.length >= 4) {
      var isDate1 = isValidDateStringOrObject(r1[0]);
      var isDate2 = isValidDateStringOrObject(r2[0]);
      if (isDate1 && isDate2) {
        var debet1 = parseAmount(r1[2]);
        var kredit1 = r1[3];
        var debet2 = r2[2];
        var kredit2 = parseAmount(r2[3]);
        if (debet1 > 0 && !kredit1 && !debet2 && kredit2 > 0 && Math.abs(debet1 - kredit2) < 0.01) {
          matchCount++;
          if (matchCount >= 2) return true;
        }
      }
    }
  }
  return false;
}

function getSectionHeader(r) {
  if (!r || r.length < 2) return null;
  var col0 = String(r[0] || '').trim();
  var col1 = String(r[1] || '').trim();
  if (col0 === '' && col1 !== '') {
    var otherHasVal = false;
    for (var i = 2; i < r.length; i++) {
      if (String(r[i] || '').trim() !== '') {
        otherHasVal = true;
        break;
      }
    }
    if (!otherHasVal) {
      return col1.toUpperCase();
    }
  }
  return null;
}

function extractLayananFromText(text, listLayanan) {
  if (!text) return null;
  var s = String(text).toLowerCase();
  
  for (var i = 0; i < listLayanan.length; i++) {
    var l = listLayanan[i];
    var nameLower = String(l.nama || '').toLowerCase();
    var cleanText = s.replace(/[^a-z0-9]/g, '');
    var cleanLName = nameLower.replace(/kll|ull|kl|lazismu/g, '').replace(/[^a-z0-9]/g, '');
    
    if (cleanLName && cleanText.indexOf(cleanLName) >= 0) {
      return l;
    }
  }
  
  var m = s.match(/(kll|ull)\s+([a-z0-9\s]+)/i);
  if (m) {
    var name = m[2].trim();
    var cleanName = name.replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < listLayanan.length; i++) {
      var l = listLayanan[i];
      var cleanLName = String(l.nama || '').toLowerCase().replace(/kll|ull|kl|lazismu/g, '').replace(/[^a-z0-9]/g, '');
      if (cleanLName && cleanName.indexOf(cleanLName) >= 0) {
        return l;
      }
    }
  }
  return null;
}

function detectPilarFromText(text) {
  if (!text) return '';
  var s = String(text).toLowerCase();
  
  if (s.indexOf('ambulan') >= 0 || s.indexOf('sehat') >= 0 || s.indexOf('obat') >= 0 || s.indexOf('sakit') >= 0 || s.indexOf('klinik') >= 0 || s.indexOf('donor darah') >= 0) {
    return 'Kesehatan';
  }
  if (s.indexOf('sekolah') >= 0 || s.indexOf('beasiswa') >= 0 || s.indexOf('ppdb') >= 0 || s.indexOf('gtt') >= 0 || s.indexOf('ptt') >= 0 || s.indexOf('pesantren') >= 0 || s.indexOf('pondok') >= 0 || s.indexOf('asy syifa') >= 0 || s.indexOf('sdua') >= 0 || s.indexOf('sd') >= 0 || s.indexOf('smp') >= 0 || s.indexOf('sma') >= 0 || s.indexOf('smk') >= 0 || s.indexOf('tk') >= 0 || s.indexOf('aba') >= 0 || s.indexOf('guru') >= 0 || s.indexOf('uad') >= 0 || s.indexOf('kuliah') >= 0) {
    return 'Pendidikan';
  }
  if (s.indexOf('bencana') >= 0 || s.indexOf('kebakaran') >= 0 || s.indexOf('kemanusiaan') >= 0 || s.indexOf('palestina') >= 0 || s.indexOf('gempa') >= 0 || s.indexOf('sumatera') >= 0) {
    return 'Kemanusiaan';
  }
  if (s.indexOf('qurban') >= 0 || s.indexOf('kurban') >= 0 || s.indexOf('dam hadyu') >= 0 || s.indexOf('jagalmu') >= 0) {
    return 'Qurban';
  }
  if (s.indexOf('umkm') >= 0 || s.indexOf('usaha') >= 0 || s.indexOf('modal') >= 0 || s.indexOf('ekonomi') >= 0) {
    return 'Ekonomi';
  }
  if (s.indexOf('lingkungan') >= 0 || s.indexOf('sampah') >= 0) {
    return 'Lingkungan';
  }
  if (s.indexOf('keagamaan') >= 0 || s.indexOf('muadzin') >= 0) {
    return 'Keagamaan';
  }
  return 'Sosial Dakwah';
}

function transformJurnalToImportData(rawRows, listRek, listLayanan) {
  var himpunRows = [];
  var salurRows = [];
  var currentSection = '';
  
  var skipSections = [
    'MUTASI BANK', 'UMP ZAKAT', 'UMP INFAK', 'UMP AMIL', 'TARIK TUNAI'
  ];
  
  for (var i = 0; i < rawRows.length; i++) {
    var r = rawRows[i];
    if (!r) continue;
    
    // Check if it's a section header
    var secHeader = getSectionHeader(r);
    if (secHeader) {
      currentSection = secHeader;
      continue;
    }
    
    if (!currentSection || skipSections.indexOf(currentSection) >= 0) {
      continue;
    }
    
    // It's a data row, must have date in col 0
    if (r.length >= 3 && isValidDateStringOrObject(r[0])) {
      var dateStr = parseImportDate(r[0]);
      var accName = String(r[1] || '').trim();
      var debet = parseAmount(r[2]);
      var kredit = parseAmount(r[3]);
      var uraian = String(r[4] || '').trim();
      
      // We only import the Debet row
      if (debet > 0 && kredit === 0) {
        // Look ahead to the next row to find the bank/cash account for pentasyarufan
        var bankAccName = '';
        var nextRow = rawRows[i+1];
        if (nextRow && isValidDateStringOrObject(nextRow[0])) {
          var nextDebet = parseAmount(nextRow[2]);
          var nextKredit = parseAmount(nextRow[3]);
          if (nextKredit > 0 && nextDebet === 0) {
            bankAccName = String(nextRow[1] || '').trim();
          }
        }
        
        // Match bank account
        var isHimpunSec = (
          currentSection === 'PENERIMAAN ZAKAT VIA BANK' ||
          currentSection === 'PENERIMAAN INFAK TERIKAT VIA BANK' ||
          currentSection === 'PENERIMAAN INFAK UMUM VIA BANK' ||
          currentSection === 'PENERIMAAN AMIL VIA BANK' ||
          currentSection === 'BAGI HASIL BANK' ||
          currentSection === 'PENGEMBALIAN UMP' ||
          currentSection === 'PENERIMAAN ZAKAT VIA KAS' ||
          currentSection === 'PENERIMAAN INFAK TERIKAT VIA KAS' ||
          currentSection === 'PENERIMAAN INFAK UMUM VIA KAS' ||
          currentSection === 'PENERIMAAN AMIL VIA KAS' ||
          currentSection === 'SETOR TUNAI'
        );
        var lookupName = isHimpunSec ? accName : (bankAccName || accName);
        var matchedRek = null;
        var rekNum = '';
        var m = lookupName.match(/-?\s*(\d+)$/);
        if (m) {
          rekNum = m[1];
        }
        if (rekNum) {
          var rekNoClean = rekNum.replace(/\D/g, '').replace(/^0+/, '');
          matchedRek = listRek.find(function(x) {
            var dbNo = String(x.nomor || '').replace(/\D/g, '').replace(/^0+/, '');
            return dbNo === rekNoClean;
          });
        }
        if (!matchedRek) {
          var accLower = lookupName.toLowerCase();
          matchedRek = listRek.find(function(x) {
            var dbName = String(x.namaBank || '').toLowerCase();
            var dbNo = String(x.nomor || '').toLowerCase();
            return (dbName && accLower.indexOf(dbName) >= 0) || (dbNo && accLower.indexOf(dbNo) >= 0);
          });
        }
        var rekId = matchedRek ? matchedRek.id : '';
        var bankLabel = matchedRek ? (matchedRek.namaBank + ' - ' + matchedRek.nomor + ' (' + matchedRek.atasNama + ')') : lookupName;
        
        // Match Layanan (KLL/ULL)
        var matchedLay = extractLayananFromText(uraian, listLayanan);
        
        // PENGHIMPUNAN
        if (
          currentSection === 'PENERIMAAN ZAKAT VIA BANK' ||
          currentSection === 'PENERIMAAN INFAK TERIKAT VIA BANK' ||
          currentSection === 'PENERIMAAN INFAK UMUM VIA BANK' ||
          currentSection === 'PENERIMAAN AMIL VIA BANK' ||
          currentSection === 'BAGI HASIL BANK' ||
          currentSection === 'PENGEMBALIAN UMP' ||
          currentSection === 'PENERIMAAN ZAKAT VIA KAS' ||
          currentSection === 'PENERIMAAN INFAK TERIKAT VIA KAS' ||
          currentSection === 'PENERIMAAN INFAK UMUM VIA KAS' ||
          currentSection === 'PENERIMAAN AMIL VIA KAS' ||
          currentSection === 'SETOR TUNAI'
        ) {
          // For PENERIMAAN sections, skip if it's the revenue/category row (usually doesn't have bank name)
          if (accName.toLowerCase().indexOf('penerimaan') >= 0) {
            continue;
          }
          
          var jDana = 'Infak';
          var sJenis = 'Infak Umum';
          var pilar = '';
          var program = '';
          var namaDonatur = uraian;
          var tipeDonatur = 'Perorangan';
          var layananId = '';
          
          if (matchedLay) {
            layananId = matchedLay.id;
            namaDonatur = (matchedLay.tipe === 'KLL' ? 'KLL ' : 'ULL ') + matchedLay.nama;
            tipeDonatur = matchedLay.tipe === 'KLL' ? 'Kantor Layanan (KLL)' : 'Unit Layanan (ULL)';
          } else if (uraian.toUpperCase().indexOf('KLL ') === 0) {
            tipeDonatur = 'Kantor Layanan (KLL)';
          } else if (uraian.toUpperCase().indexOf('ULL ') === 0) {
            tipeDonatur = 'Unit Layanan (ULL)';
          }
          
          var uraianLower = uraian.toLowerCase();
          var isZakatAcc = false;
          if (matchedRek) {
            var fg = String(matchedRek.fundGroup || '').toLowerCase();
            var rNo = String(matchedRek.nomor || '');
            if (fg === 'zakat' || rNo.indexOf('9004') >= 0 || rNo.indexOf('880') >= 0) {
              isZakatAcc = true;
            }
          } else {
            var lookupLower = lookupName.toLowerCase();
            if (lookupLower.indexOf('9004') >= 0 || lookupLower.indexOf('880') >= 0) {
              isZakatAcc = true;
            }
          }
          
          if (currentSection === 'SETOR TUNAI') {
            var cashAccName = '';
            var nextRow = rawRows[i+1];
            if (nextRow && isValidDateStringOrObject(nextRow[0])) {
              cashAccName = String(nextRow[1] || '').trim();
            }
            jDana = cashAccName.toLowerCase().indexOf('zakat') >= 0 ? 'Zakat' : 'Infak';
            sJenis = 'Setor Tunai';
            program = 'Setor Tunai';
            namaDonatur = 'Setor Tunai';
            tipeDonatur = 'Lembaga/Perusahaan';
            bankLabel = cashAccName;
          } else if (currentSection === 'PENERIMAAN ZAKAT VIA BANK' || currentSection === 'PENERIMAAN ZAKAT VIA KAS' || isZakatAcc) {
            jDana = 'Zakat';
            sJenis = 'Zakat Mal';
            if (uraianLower.indexOf('profesi') >= 0 || uraianLower.indexOf('penghasilan') >= 0) {
              sJenis = 'Zakat Profesi/Penghasilan';
            } else if (uraianLower.indexOf('fitrah') >= 0 || uraianLower.indexOf('fitri') >= 0) {
              sJenis = 'Zakat Fitrah';
            }
            program = 'Penerimaan Zakat';
          } else if (currentSection === 'PENERIMAAN INFAK TERIKAT VIA BANK' || currentSection === 'PENERIMAAN INFAK TERIKAT VIA KAS') {
            jDana = 'Infak';
            sJenis = 'Infak Terikat';
            pilar = detectPilarFromText(uraian);
            program = pilar || 'Infak Terikat';
          } else if (currentSection === 'PENERIMAAN INFAK UMUM VIA BANK' || currentSection === 'PENERIMAAN INFAK UMUM VIA KAS') {
            jDana = 'Infak';
            sJenis = 'Infak Umum';
            program = 'Infak Umum';
          } else if (currentSection === 'PENERIMAAN AMIL VIA BANK' || currentSection === 'PENERIMAAN AMIL VIA KAS') {
            jDana = 'Amil';
            sJenis = 'Amil';
            program = 'Penerimaan Amil';
          } else if (currentSection === 'BAGI HASIL BANK') {
            jDana = 'DSKL';
            sJenis = 'Bagi Hasil Bank';
            program = 'Bagi Hasil Bank';
            namaDonatur = 'Bagi Hasil Rekening ' + (matchedRek ? matchedRek.namaBank : accName);
            tipeDonatur = 'Lembaga/Perusahaan';
          } else if (currentSection === 'PENGEMBALIAN UMP') {
            jDana = 'Infak';
            sJenis = 'Infak Umum';
            program = 'Pengembalian UMP';
            namaDonatur = matchedLay ? ((matchedLay.tipe === 'KLL' ? 'KLL ' : 'ULL ') + matchedLay.nama) : 'Pengembalian UMP';
            tipeDonatur = matchedLay ? (matchedLay.tipe === 'KLL' ? 'Kantor Layanan (KLL)' : 'Unit Layanan (ULL)') : 'Perorangan';
          }
          
          var metode = 'Transfer Bank';
          if (currentSection.indexOf('KAS') >= 0 || accName.toLowerCase().indexOf('kas') >= 0) {
            metode = 'Cash/Tunai';
          } else if (accName.toUpperCase().indexOf('QRIS') >= 0) {
            metode = 'QRIS';
          }
          
          himpunRows.push({
            tanggal: dateStr,
            jenisDana: jDana,
            subJenis: sJenis,
            pilar: pilar,
            program: program,
            namaDonatur: namaDonatur,
            tipeDonatur: tipeDonatur,
            layananId: layananId,
            telepon: '',
            email: '',
            alamat: '',
            jumlah: debet,
            metode: metode,
            rekeningId: rekId,
            bank: bankLabel,
            statusBayar: 'Lunas',
            keterangan: uraian,
            fundraising: cleanFundraisingName(extractFundraisingFromText(uraian))
          });
        }
        
        // PENTASYARUFAN
        else if (
          currentSection === 'OPERASIONAL AMIL VIA BANK' ||
          currentSection === 'OPERASIONAL AMIL VIA KAS' ||
          currentSection === 'PENYALURAN INFAK TERIKAT' ||
          currentSection === 'PENYALURAN INFAK UMUM' ||
          currentSection === 'UMP LPJ ZAKAT' ||
          currentSection === 'UMP LPJ INFAK' ||
          currentSection === 'UMP LPJ AMIL' ||
          currentSection === 'BIAYA ADMINISTRASI BANK'
        ) {
          var sumberDana = 'Infak';
          var ashnaf = 'Fi Sabilillah';
          var program = accName;
          var namaPenerima = 'Lazismu Daerah Bantul';
          
          var matchedDest = extractLayananFromText(uraian, listLayanan);
          if (matchedDest) {
            namaPenerima = (matchedDest.tipe === 'KLL' ? 'KLL ' : 'ULL ') + matchedDest.nama;
          }
          
          if (currentSection === 'OPERASIONAL AMIL VIA BANK' || currentSection === 'OPERASIONAL AMIL VIA KAS') {
            sumberDana = 'Amil';
            ashnaf = 'Amil';
          } else if (currentSection === 'PENYALURAN INFAK TERIKAT' || currentSection === 'PENYALURAN INFAK UMUM') {
            sumberDana = 'Infak';
            ashnaf = fuzzyMatch(accName, ASHNAF, 'Fi Sabilillah');
            namaPenerima = 'Lazismu Daerah Bantul';
          } else if (currentSection === 'UMP LPJ ZAKAT') {
            sumberDana = 'Zakat';
            ashnaf = fuzzyMatch(accName, ASHNAF, 'Miskin');
          } else if (currentSection === 'UMP LPJ INFAK') {
            sumberDana = 'Infak';
            ashnaf = fuzzyMatch(accName, ASHNAF, 'Fi Sabilillah');
          } else if (currentSection === 'UMP LPJ AMIL') {
            sumberDana = 'Amil';
            ashnaf = 'Amil';
          } else if (currentSection === 'BIAYA ADMINISTRASI BANK') {
            sumberDana = 'Amil';
            ashnaf = 'Amil';
            program = 'Biaya Administrasi Bank';
            namaPenerima = 'Lazismu Daerah Bantul';
          }
          
          var metode = 'Transfer Bank';
          if (currentSection.indexOf('KAS') >= 0 || accName.toLowerCase().indexOf('kas') >= 0 || (bankAccName && bankAccName.toLowerCase().indexOf('kas') >= 0)) {
            metode = 'Cash/Tunai';
          }
          
          var bentukBantuan = (metode === 'Transfer Bank') ? 'Transfer' : 'Uang Tunai';
          
          salurRows.push({
            tanggal: dateStr,
            ashnaf: ashnaf,
            sumberDana: sumberDana,
            program: program,
            namaPenerima: namaPenerima,
            nik: '',
            telepon: '',
            alamat: '',
            jumlah: debet,
            bentukBantuan: bentukBantuan,
            metode: metode,
            statusSalur: 'Tersalur',
            keterangan: uraian,
            fundraising: cleanFundraisingName(extractFundraisingFromText(uraian)),
            rekeningId: rekId,
            bank: bankLabel
          });
        }
      }
    }
  }
  
  return {
    himpunRows: himpunRows,
    salurRows: salurRows
  };
}

function markDuplicates(himpunList, salurList) {
  var dbHimpun = readAll(SHEETS.PENGHIMPUNAN) || [];
  var dbSalur = readAll(SHEETS.PENTASYARUFAN) || [];
  
  if (himpunList && himpunList.length) {
    himpunList.forEach(function(r) {
      var isDup = dbHimpun.some(function(x) {
        var tglMatch = (x.tanggal === r.tanggal);
        var nameMatch = (String(x.namaDonatur || '').toLowerCase().trim() === String(r.namaDonatur || '').toLowerCase().trim());
        var amtMatch = (Math.abs((Number(x.jumlah) || 0) - (Number(r.jumlah) || 0)) < 0.01);
        var progMatch = (String(x.program || '').toLowerCase().trim() === String(r.program || '').toLowerCase().trim());
        return tglMatch && nameMatch && amtMatch && progMatch;
      });
      if (isDup) {
        r.isDuplicate = true;
      }
    });
  }
  
  if (salurList && salurList.length) {
    salurList.forEach(function(r) {
      var isDup = dbSalur.some(function(x) {
        var tglMatch = (x.tanggal === r.tanggal);
        var nameMatch = (String(x.namaPenerima || '').toLowerCase().trim() === String(r.namaPenerima || '').toLowerCase().trim());
        var amtMatch = (Math.abs((Number(x.jumlah) || 0) - (Number(r.jumlah) || 0)) < 0.01);
        var progMatch = (String(x.program || '').toLowerCase().trim() === String(r.program || '').toLowerCase().trim());
        return tglMatch && nameMatch && amtMatch && progMatch;
      });
      if (isDup) {
        r.isDuplicate = true;
      }
    });
  }
}

async function apiParseImportUrl(t, url, type) {
  authUser(t);
  if (!url) throw new Error('URL tidak boleh kosong.');
  
  var downloadUrl = convertGoogleSheetUrl(url);
  var listRek = readAll(SHEETS.REKENING) || [];
  var listLayanan = readAll(SHEETS.LAYANAN) || [];
  
  try {
    var res = await fetch(downloadUrl);
    if (!res.ok) throw new Error('Status HTTP ' + res.status);
    var buffer = await res.arrayBuffer();
    
    var XLSX = require('xlsx');
    var workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
    var sheetName = workbook.SheetNames[0];
    var sheet = workbook.Sheets[sheetName];
    
    var rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    var isJurnal = checkIsJurnalPenerimaan(rawRows);
    
    if (isJurnal) {
      var resultJurnal = transformJurnalToImportData(rawRows, listRek, listLayanan);
      
      var himpunValid = [];
      var himpunInvalid = [];
      resultJurnal.himpunRows.forEach(function(row) {
        if (row.namaDonatur && row.jumlah > 0) {
          himpunValid.push(row);
        } else {
          himpunInvalid.push(row);
        }
      });
      
      var salurValid = [];
      var salurInvalid = [];
      resultJurnal.salurRows.forEach(function(row) {
        if (row.namaPenerima && row.jumlah > 0) {
          salurValid.push(row);
        } else {
          salurInvalid.push(row);
        }
      });
      
      markDuplicates(himpunValid, salurValid);
      
      return {
        success: true,
        isJurnal: true,
        himpunValid: himpunValid,
        himpunInvalid: himpunInvalid,
        salurValid: salurValid,
        salurInvalid: salurInvalid,
        totalCount: resultJurnal.himpunRows.length + resultJurnal.salurRows.length
      };
    } else {
      // Check for headerless format
      var isHeaderless = detectHeaderlessTSV(rawRows);
      if (isHeaderless) {
        var parsedHL = parseHeaderlessRows(rawRows.map(function(r) {
          return Array.isArray(r) ? r.map(function(c) { return String(c || '').trim(); }) : [];
        }), type, listLayanan);
        
        var validHL = [];
        var invalidHL = [];
        parsedHL.forEach(function(row) {
          var name = type === 'himpun' ? row.namaDonatur : row.namaPenerima;
          if (name && row.jumlah > 0) {
            validHL.push(row);
          } else {
            invalidHL.push(row);
          }
        });
        
        if (type === 'himpun') {
          markDuplicates(validHL, []);
        } else {
          markDuplicates([], validHL);
        }
        
        return {
          success: true,
          isJurnal: false,
          valid: validHL,
          invalid: invalidHL,
          totalCount: parsedHL.length
        };
      }
      
      var json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      var parsed = json.map(function(row) {
        var mapped = mapImportedRow(row, type);
        var tglKey = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'tanggal');
        mapped.tanggal = parseImportDate(tglKey ? row[tglKey] : mapped.tanggal);
        return mapped;
      });
      
      var valid = [];
      var invalid = [];
      parsed.forEach(function(row) {
        var name = type === 'himpun' ? row.namaDonatur : row.namaPenerima;
        if (name && row.jumlah > 0) {
          valid.push(row);
        } else {
          invalid.push(row);
        }
      });
      
      if (type === 'himpun') {
        markDuplicates(valid, []);
      } else {
        markDuplicates([], valid);
      }
      
      return {
        success: true,
        isJurnal: false,
        valid: valid,
        invalid: invalid,
        totalCount: parsed.length
      };
    }
  } catch (e) {
    throw new Error('Gagal membaca Spreadsheet/Excel dari URL: ' + (e.message || String(e)));
  }
}

function detectHeaderlessTSV(rawRows) {
  // Detect if rows have no header: first column looks like a date, and there is a numeric amount column
  if (!rawRows || rawRows.length === 0) return false;
  var firstRow = rawRows[0];
  // Check if the first cell looks like a date (dd/mm/yyyy or dd-mm-yyyy)
  if (!firstRow[0]) return false;
  var datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
  if (!datePattern.test(firstRow[0].trim())) return false;
  // Check that no cell in first row looks like a typical header keyword
  var headerKeywords = ['tanggal', 'nama', 'uraian', 'jumlah', 'nominal', 'debet', 'kredit', 'alamat', 'telepon', 'date', 'amount', 'no'];
  var hasHeaderWord = firstRow.some(function(cell) {
    var cl = String(cell).toLowerCase().replace(/[^a-z]/g, '');
    return headerKeywords.indexOf(cl) >= 0;
  });
  if (hasHeaderWord) return false;
  return true;
}

function parseHeaderlessRows(rawRows, type, listLayanan) {
  // Format: Date \t Name \t (empty/col3) \t (empty/col4) \t Amount \t Fundraising
  // Rules:
  //  - If Name contains KLL or ULL, map to layanan
  //  - Last non-empty string column after amount = fundraising name
  //  - If after KL/name there's a pilar keyword, map to infak terikat pilar
  var results = [];
  rawRows.forEach(function(cols) {
    if (!cols || cols.length === 0) return;
    var dateStr = cols[0] || '';
    var tanggal = parseImportDate(dateStr);
    var rawName = cols[1] || '';
    
    // Find the numeric amount - scan from col index 2 onwards
    var jumlah = 0;
    var amountIdx = -1;
    for (var i = 2; i < cols.length; i++) {
      var amt = parseAmount(cols[i]);
      if (amt > 0) {
        jumlah = amt;
        amountIdx = i;
        break;
      }
    }
    
    // Fundraising = first non-empty cell after the amount column
    var fundraising = '';
    if (amountIdx >= 0) {
      for (var j = amountIdx + 1; j < cols.length; j++) {
        if (cols[j] && cols[j].trim()) {
          fundraising = cols[j].trim();
          break;
        }
      }
    }
    
    // Gather extra text from columns between name and amount (col3, col4 etc) that might contain pilar info
    var extraText = '';
    for (var k = 2; k < (amountIdx >= 0 ? amountIdx : cols.length); k++) {
      if (cols[k] && cols[k].trim()) {
        extraText += ' ' + cols[k].trim();
      }
    }
    extraText = extraText.trim();
    
    if (type === 'himpun') {
      var parsed = parseUraianDetails(rawName, listLayanan);
      var namaDonatur = parsed.donorName;
      var tipeDonatur = 'Perorangan';
      var layananId = '';
      
      if (parsed.matchedLay) {
        layananId = parsed.matchedLay.id;
        tipeDonatur = namaDonatur.toUpperCase().indexOf('KLL') === 0 ? 'Kantor Layanan (KLL)' : 'Unit Layanan (ULL)';
      } else if (namaDonatur.toUpperCase().indexOf('KLL ') === 0 || namaDonatur.toUpperCase().indexOf('ULL ') === 0) {
        tipeDonatur = namaDonatur.toUpperCase().indexOf('KLL ') === 0 ? 'Kantor Layanan (KLL)' : 'Unit Layanan (ULL)';
      }
      
      var jDana = 'Infak';
      var sJenis = 'Infak Umum';
      var pilar = '';
      var program = 'Infak Umum';
      
      // Check for pilar in suffix or extraText
      var pilarSource = (parsed.suffix + ' ' + extraText).toLowerCase();
      if (pilarSource.trim()) {
        var detectedPilar = detectPilarFromText(pilarSource);
        if (detectedPilar) {
          jDana = 'Infak';
          sJenis = 'Infak Terikat';
          pilar = detectedPilar;
          program = detectedPilar;
        }
      }
      
      // Check for zakat, amil, wakaf in name
      var upperName = rawName.toUpperCase();
      if (upperName.indexOf('ZAKAT') >= 0) {
        jDana = 'Zakat'; sJenis = 'Zakat Mal'; pilar = ''; program = 'Penerimaan Zakat';
        if (upperName.indexOf('FITRAH') >= 0 || upperName.indexOf('FITRI') >= 0) sJenis = 'Zakat Fitrah';
        else if (upperName.indexOf('PROFESI') >= 0 || upperName.indexOf('PENGHASILAN') >= 0) sJenis = 'Zakat Profesi/Penghasilan';
      } else if (upperName.indexOf('AMIL') >= 0) {
        jDana = 'Amil'; sJenis = 'Amil'; pilar = ''; program = 'Penerimaan Amil';
      } else if (upperName.indexOf('WAKAF') >= 0) {
        jDana = 'Wakaf'; sJenis = 'Wakaf Uang'; pilar = ''; program = 'Penerimaan Wakaf';
      }
      
      results.push({
        tanggal: tanggal,
        jenisDana: jDana,
        subJenis: sJenis,
        pilar: pilar,
        program: program,
        namaDonatur: namaDonatur,
        tipeDonatur: tipeDonatur,
        layananId: layananId,
        telepon: '',
        email: '',
        alamat: '',
        jumlah: jumlah,
        metode: 'Cash/Tunai',
        rekeningId: '',
        bank: '',
        statusBayar: 'Lunas',
        keterangan: extraText,
        fundraising: cleanFundraisingName(fundraising)
      });
    } else {
      results.push({
        tanggal: tanggal,
        ashnaf: 'Miskin',
        sumberDana: 'Zakat',
        program: extraText || '',
        namaPenerima: rawName,
        nik: '',
        telepon: '',
        alamat: '',
        jumlah: jumlah,
        bentukBantuan: 'Uang Tunai',
        metode: 'Cash/Tunai',
        statusSalur: 'Tersalur',
        keterangan: '',
        fundraising: cleanFundraisingName(fundraising)
      });
    }
  });
  return results;
}

async function apiParseImportText(t, text, type) {
  authUser(t);
  if (!text) throw new Error('Teks tidak boleh kosong.');
  var listRek = readAll(SHEETS.REKENING) || [];
  var listLayanan = readAll(SHEETS.LAYANAN) || [];
  
  try {
    var rawRows = [];
    var lines = String(text).split(/\r?\n/);
    lines.forEach(function(line) {
      if (line.trim() !== '') {
        rawRows.push(line.split('\t').map(c => c.trim()));
      }
    });
    
    var isJurnal = checkIsJurnalPenerimaan(rawRows);
    if (isJurnal) {
      var resultJurnal = transformJurnalToImportData(rawRows, listRek, listLayanan);
      
      var himpunValid = [];
      var himpunInvalid = [];
      resultJurnal.himpunRows.forEach(function(row) {
        if (row.namaDonatur && row.jumlah > 0) {
          himpunValid.push(row);
        } else {
          himpunInvalid.push(row);
        }
      });
      
      var salurValid = [];
      var salurInvalid = [];
      resultJurnal.salurRows.forEach(function(row) {
        if (row.namaPenerima && row.jumlah > 0) {
          salurValid.push(row);
        } else {
          salurInvalid.push(row);
        }
      });
      
      markDuplicates(himpunValid, salurValid);
      
      return {
        success: true,
        isJurnal: true,
        himpunValid: himpunValid,
        himpunInvalid: himpunInvalid,
        salurValid: salurValid,
        salurInvalid: salurInvalid,
        totalCount: resultJurnal.himpunRows.length + resultJurnal.salurRows.length
      };
    }
    
    // Check for headerless TSV (raw copy-paste from simple spreadsheet)
    var isHeaderless = detectHeaderlessTSV(rawRows);
    if (isHeaderless) {
      var parsed = parseHeaderlessRows(rawRows, type, listLayanan);
      
      var valid = [];
      var invalid = [];
      parsed.forEach(function(row) {
        var name = type === 'himpun' ? row.namaDonatur : row.namaPenerima;
        if (name && row.jumlah > 0) {
          valid.push(row);
        } else {
          invalid.push(row);
        }
      });
      
      if (type === 'himpun') {
        markDuplicates(valid, []);
      } else {
        markDuplicates([], valid);
      }
      
      return {
        success: true,
        isJurnal: false,
        valid: valid,
        invalid: invalid,
        totalCount: parsed.length
      };
    }
    
    // Standard header-based TSV
    var json = parseTSV(text);
    var parsed2 = json.map(function(row) {
      var mapped = mapImportedRow(row, type);
      var tglKey = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'tanggal');
      mapped.tanggal = parseImportDate(tglKey ? row[tglKey] : mapped.tanggal);
      return mapped;
    });
    
    var valid2 = [];
    var invalid2 = [];
    parsed2.forEach(function(row) {
      var name = type === 'himpun' ? row.namaDonatur : row.namaPenerima;
      if (name && row.jumlah > 0) {
        valid2.push(row);
      } else {
        invalid2.push(row);
      }
    });
    
    if (type === 'himpun') {
      markDuplicates(valid2, []);
    } else {
      markDuplicates([], valid2);
    }
    
    return {
      success: true,
      isJurnal: false,
      valid: valid2,
      invalid: invalid2,
      totalCount: parsed2.length
    };
  } catch (e) {
    throw new Error('Gagal memproses teks: ' + (e.message || String(e)));
  }
}

async function apiSaveImportedData(t, rows, type) {
  var u = authUser(t);
  _requirePerm(t, type === 'himpun' ? 'penghimpunan' : 'pentasyarufan', 'create');
  
  if (!Array.isArray(rows) || !rows.length) throw new Error('Tidak ada data untuk diimpor.');
  
  var isHimpun = type === 'himpun';
  var sheetName = isHimpun ? SHEETS.PENGHIMPUNAN : SHEETS.PENTASYARUFAN;
  
  var currentRows = readAll(sheetName);
  var savedCount = 0;
  
  var monthsToSync = {};
  
  rows.forEach(function(row) {
    row.fundraising = cleanFundraisingName(row.fundraising);
    row.id = makeId();
    row.petugas = u.nama;
    row.dibuat = new Date().toISOString();
    
    var m = getMonthFromDate(row.tanggal);
    if (m) monthsToSync[m] = true;
    
    if (isHimpun) {
      row.noKwitansi = row.noKwitansi || ('KW/' + row.tanggal.replace(/-/g, '').slice(0, 6) + '/' + ('0000' + (currentRows.length + savedCount + 1)).slice(-4));
      if (row.rekeningId) {
        var rk = (readAll(SHEETS.REKENING) || []).find(function(x) { return String(x.id) === String(row.rekeningId); });
        if (rk) {
          row.bank = rk.namaBank;
          row.atasNama = rk.atasNama;
        }
      }
    } else {
      row.noBukti = row.noBukti || ('BPT/' + row.tanggal.replace(/-/g, '').slice(0, 6) + '/' + ('0000' + (currentRows.length + savedCount + 1)).slice(-4));
    }
    
    insertRow(sheetName, row);
    savedCount++;
  });
  
  var keys = Object.keys(monthsToSync);
  for (var i = 0; i < keys.length; i++) {
    await syncMonthlySpreadsheet(keys[i]);
  }
  
  audit(u.id, u.username, 'import_' + (isHimpun ? 'penghimpunan' : 'pentasyarufan'), savedCount + ' data berhasil diimpor');
  return { ok: true, count: savedCount };
}

async function apiDeleteByDateRange(t, type, startDate, endDate) {
  var u = authUser(t);
  var isHimpun = type === 'himpun';
  var sheetName = isHimpun ? SHEETS.PENGHIMPUNAN : SHEETS.PENTASYARUFAN;
  _requirePerm(t, isHimpun ? 'penghimpunan' : 'pentasyarufan', 'delete');
  
  if (!startDate || !endDate) throw new Error('Tanggal mulai dan selesai harus diisi.');
  
  function dateToInt(d) {
    if (!d) return 0;
    if (d instanceof Date) {
      return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    }
    var s = String(d).trim();
    var m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (m) {
      return parseInt(m[1], 10) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
    }
    var m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m2) {
      return parseInt(m2[3], 10) * 10000 + parseInt(m2[2], 10) * 100 + parseInt(m2[1], 10);
    }
    var dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return 0;
    return dateObj.getFullYear() * 10000 + (dateObj.getMonth() + 1) * 100 + dateObj.getDate();
  }
  
  var startVal = dateToInt(startDate);
  var endVal = dateToInt(endDate);
  
  if (startVal === 0 || endVal === 0) {
    throw new Error('Format rentang tanggal tidak valid.');
  }
  
  var ss = getSS();
  var sh = ss.getSheetByName(sheetName);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return { count: 0 };
  
  var headers = v[0];
  var tglCol = headers.indexOf('tanggal');
  if (tglCol < 0) throw new Error('Kolom tanggal tidak ditemukan.');
  
  var rowsToKeep = [headers];
  var deletedCount = 0;
  
  var monthsToSync = {};
  
  for (var i = 1; i < v.length; i++) {
    var rowDateStr = v[i][tglCol];
    var isDeleted = false;
    if (rowDateStr) {
      var rowVal = dateToInt(rowDateStr);
      if (rowVal >= startVal && rowVal <= endVal) {
        isDeleted = true;
        var m = getMonthFromDate(rowDateStr);
        if (m) monthsToSync[m] = true;
      }
    }
    
    if (isDeleted) {
      deletedCount++;
    } else {
      rowsToKeep.push(v[i]);
    }
  }
  
  sh.clear();
  sh.getRange(1, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);
  if (rowsToKeep.length > 0) {
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  
  var keys = Object.keys(monthsToSync);
  for (var kIdx = 0; kIdx < keys.length; kIdx++) {
    await syncMonthlySpreadsheet(keys[kIdx]);
  }
  
  audit(u.id, u.username, 'delete_range_' + (isHimpun ? 'penghimpunan' : 'pentasyarufan'), deletedCount + ' data dihapus pada rentang ' + startDate + ' s/d ' + endDate);
  return { count: deletedCount };
}
async function apiGetMonthlySpreadsheet(t, year, month) {
  _requirePerm(t, 'laporan', 'view');
  var mStr = year + '-' + ('0' + month).slice(-2);
  var data = getSetting('sheet_data_' + mStr) || '';
  if (!data) {
    await syncMonthlySpreadsheet(mStr);
    data = getSetting('sheet_data_' + mStr) || '';
  }
  return { data: data, url: data, month: mStr };
}

function apiListMutasi(t) {
  _requirePerm(t, 'settings', 'view');
  var rows = readAll(SHEETS.MUTASI) || [];
  return rows.sort(function(a, b) {
    return new Date(b.tanggal || 0) - new Date(a.tanggal || 0);
  });
}

function apiSaveMutasiRows(t, rows) {
  var u = _requirePerm(t, 'settings', 'edit');
  var current = readAll(SHEETS.MUTASI) || [];
  var lookup = {};
  current.forEach(function(row) {
    var key = String(row.tanggal || '') + '|' + String(row.deskripsi || '').trim().toLowerCase() + '|' + Number(row.nominal || 0);
    lookup[key] = true;
  });
  var imported = 0;
  var skipped = 0;
  (rows || []).forEach(function(row) {
    var nominal = Number(row.nominal) || 0;
    if (!row.tanggal || !row.deskripsi || nominal <= 0) {
      skipped++;
      return;
    }
    var key = String(row.tanggal) + '|' + String(row.deskripsi).trim().toLowerCase() + '|' + nominal;
    if (lookup[key]) {
      skipped++;
      return;
    }
    var newRow = {
      id: makeId(),
      tanggal: row.tanggal,
      deskripsi: String(row.deskripsi).trim(),
      tipe: row.tipe === 'D' ? 'D' : 'K',
      nominal: nominal,
      dibuat: new Date().toISOString()
    };
    insertRow(SHEETS.MUTASI, newRow);
    lookup[key] = true;
    imported++;
  });
  audit(u.id, u.username, 'import_mutasi', imported + ' data mutasi berhasil diimpor');
  return { success: true, imported: imported, skipped: skipped };
}

async function apiImportMutasiToRecords(t, rows) {
  var u = _requirePerm(t, 'settings', 'edit');
  var current = readAll(SHEETS.MUTASI) || [];
  var lookup = {};
  current.forEach(function(row) {
    var key = String(row.tanggal || '') + '|' + String(row.deskripsi || '').trim().toLowerCase() + '|' + Number(row.nominal || 0);
    lookup[key] = true;
  });
  
  var imported = 0;
  var skipped = 0;
  var monthsToSync = {};
  var listRek = readAll(SHEETS.REKENING) || [];
  
  for (var i = 0; i < (rows || []).length; i++) {
    var row = rows[i];
    var nominal = Number(row.nominal) || 0;
    if (!row.tanggal || !row.deskripsi || nominal <= 0) {
      skipped++;
      continue;
    }
    var key = String(row.tanggal) + '|' + String(row.deskripsi).trim().toLowerCase() + '|' + nominal;
    if (lookup[key]) {
      skipped++;
      continue;
    }
    
    // Save to Mutasi log to prevent future imports of the same row
    var newMutasiRow = {
      id: makeId(),
      tanggal: row.tanggal,
      deskripsi: String(row.deskripsi).trim(),
      tipe: row.tipe === 'SALUR' ? 'D' : 'K',
      nominal: nominal,
      dibuat: new Date().toISOString()
    };
    insertRow(SHEETS.MUTASI, newMutasiRow);
    lookup[key] = true;
    
    var matchedRek = listRek.find(function(x) { return x.id === row.rekeningId; });
    var bankName = matchedRek ? matchedRek.namaBank : 'Transfer Bank';
    
    var monthStr = getMonthFromDate(row.tanggal);
    if (monthStr) monthsToSync[monthStr] = true;
    
    if (row.tipe === 'HIMPUN') {
      var himpunData = {
        id: makeId(),
        noKwitansi: generateNoKwitansi(),
        tanggal: row.tanggal,
        jenisDana: 'Infak',
        subJenis: 'Infak Umum',
        pilar: '',
        program: String(row.deskripsi).trim(),
        namaDonatur: 'NN',
        tipeDonatur: 'Perorangan',
        layananId: '',
        telepon: '',
        email: '',
        alamat: '',
        jumlah: nominal,
        metode: 'Transfer Bank',
        rekeningId: row.rekeningId || '',
        bank: bankName,
        statusBayar: 'Lunas',
        atasNama: matchedRek ? matchedRek.atasNama : '',
        keterangan: 'Import Mutasi Rekening Bank',
        petugas: u.nama,
        dibuat: new Date().toISOString(),
        fundraising: row.fundraising || 'Lazismu Daerah Bantul'
      };
      insertRow(SHEETS.PENGHIMPUNAN, himpunData);
    } else if (row.tipe === 'SALUR') {
      var salurData = {
        id: makeId(),
        noBukti: generateNoBukti(),
        tanggal: row.tanggal,
        ashnaf: 'Fi Sabilillah',
        program: String(row.deskripsi).trim(),
        sumberDana: 'Infak',
        namaPenerima: 'Lazismu Daerah Bantul',
        nik: '',
        telepon: '',
        alamat: '',
        jumlah: nominal,
        bentukBantuan: 'Transfer',
        metode: 'Transfer Bank',
        rekeningId: row.rekeningId || '',
        bank: bankName,
        statusSalur: 'Tersalur',
        petugas: u.nama,
        keterangan: 'Import Mutasi Rekening Bank',
        dibuat: new Date().toISOString(),
        fundraising: row.fundraising || 'Lazismu Daerah Bantul'
      };
      insertRow(SHEETS.PENTASYARUFAN, salurData);
    }
    imported++;
  }
  
  var keys = Object.keys(monthsToSync);
  for (var kIdx = 0; kIdx < keys.length; kIdx++) {
    await syncMonthlySpreadsheet(keys[kIdx]);
  }
  
  audit(u.id, u.username, 'import_mutasi_to_records', imported + ' transaksi berhasil diproses ke rekening aktif');
  return { success: true, imported: imported, skipped: skipped };
}

function cleanDonaturName(name) {
  if (!name) return '';
  var s = String(name).trim();
  
  var lower = s.toLowerCase();
  if (lower === 'nn' || lower === 'hamba allah' || lower === 'hambaallah' || lower === 'anonim' || lower === 'tanpa nama') return '';
  
  // Strip NN, NN., NN. , NN -, etc.
  s = s.replace(/^nn\s*[-.]*\s*/i, '').trim();
  
  // Robust prefix stripping
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
  
  var finalLower = s.toLowerCase();
  if (!finalLower || finalLower === 'infak umum' || finalLower === 'infak terikat' || finalLower === 'zakat' || finalLower === 'infak' || finalLower === 'dskl') {
    return '';
  }
  
  return s;
}

function normalizeKategoriLabel(t) {
  var k = String(t || '').trim().toLowerCase();
  if (!k) return '';
  if (k.indexOf('kll') >= 0 || k.indexOf('kantor') >= 0) return 'Kantor Layanan (KLL)';
  if (k.indexOf('ull') >= 0 || k.indexOf('unit') >= 0) return 'Unit Layanan (ULL)';
  if (k.indexOf('lembaga') >= 0 || k.indexOf('perusahaan') >= 0 || k.indexOf('instansi') >= 0 || k.indexOf('yayasan') >= 0) return 'Lembaga/Perusahaan';
  if (k.indexOf('hamba') >= 0) return 'Hamba Allah';
  if (k.indexOf('perorangan') >= 0 || k.indexOf('individu') >= 0 || k.indexOf('pribadi') >= 0) return 'Perorangan';
  return '';
}

var LEMBAGA_NAME_RE = /(^|\s)(pt|cv|ud|yayasan|lembaga|perusahaan|sekolah|madrasah|universitas|masjid|mushola|musholla|majelis|instansi|dinas|koperasi|toko|klinik|apotek|smk|sma|smp|sdit|mts|min|man|ponpes|pondok|pesantren|paud|tpq|panti|rsu|puskesmas)(\s|$|\.)/i;

// Tentukan kategori donatur dari data eksplisit (tipeDonatur), layananId, lalu pola nama.
function detectKategoriDonatur(nama, tipeDonatur, layananId, layList) {
  var explicit = normalizeKategoriLabel(tipeDonatur);
  if (explicit && explicit !== 'Perorangan') return explicit;
  var n = String(nama || '').trim();
  var nl = n.toLowerCase();
  layList = layList || [];
  if (layananId) {
    for (var i = 0; i < layList.length; i++) {
      if (String(layList[i].id) === String(layananId)) {
        return layList[i].tipe === 'ULL' ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)';
      }
    }
  }
  if (/^(kll|kl)\s/i.test(n) || nl.indexOf('kantor layanan') === 0) return 'Kantor Layanan (KLL)';
  if (/^ull\s/i.test(n) || nl.indexOf('unit layanan') === 0) return 'Unit Layanan (ULL)';
  for (var j = 0; j < layList.length; j++) {
    var ln = String(layList[j].nama || '').trim().toLowerCase();
    if (!ln || ln.length < 4) continue;
    var re = new RegExp('(^|[^a-z0-9])' + ln.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
    if (re.test(nl)) {
      return layList[j].tipe === 'ULL' ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)';
    }
  }
  if (nl.indexOf('hamba allah') >= 0) return 'Hamba Allah';
  if (LEMBAGA_NAME_RE.test(n)) return 'Lembaga/Perusahaan';
  return 'Perorangan';
}

function resolveLayananNamaForDonatur(nama, layananId, layList) {
  layList = layList || [];
  if (layananId) {
    for (var i = 0; i < layList.length; i++) {
      if (String(layList[i].id) === String(layananId)) return layList[i].nama;
    }
  }
  var nl = String(nama || '').toLowerCase();
  for (var j = 0; j < layList.length; j++) {
    var ln = String(layList[j].nama || '').trim().toLowerCase();
    if (!ln || ln.length < 4) continue;
    if (nl.indexOf(ln) >= 0) return layList[j].nama;
  }
  return '';
}

function apiListDonatur(t) {
  _requirePerm(t, 'penghimpunan', 'view');
  var himp = readAll(SHEETS.PENGHIMPUNAN) || [];
  var regDonatur = readAll(SHEETS.DONATUR) || [];
  var layList = [];
  try { layList = readAll(SHEETS.LAYANAN) || []; } catch (e) {}
  var donaturMap = {};

  regDonatur.forEach(function(row) {
    var cleaned = cleanDonaturName(row.nama);
    if (!cleaned) return;
    var key = cleaned.toLowerCase();
    donaturMap[key] = {
      id: row.id,
      nama: cleaned,
      kategori: detectKategoriDonatur(cleaned, row.kategori, '', layList),
      telepon: row.telepon || '',
      alamat: row.alamat || '',
      email: row.email || '',
      totalDonasi: 0,
      jumlahTransaksi: 0,
      terakhir: '',
      isImported: true,
      _layananSet: {}
    };
    var _regLay = resolveLayananNamaForDonatur(cleaned, row.layananId || '', layList);
    if (_regLay) donaturMap[key]._layananSet[_regLay.toLowerCase()] = true;
  });

  himp.forEach(function(tx) {
    var cleaned = cleanDonaturName(tx.namaDonatur);
    if (!cleaned) return;
    var key = cleaned.toLowerCase();
    var detected = detectKategoriDonatur(cleaned, tx.tipeDonatur, tx.layananId, layList);

    if (!donaturMap[key]) {
      donaturMap[key] = {
        id: '',
        nama: cleaned,
        kategori: detected,
        telepon: tx.telepon || '',
        alamat: tx.alamat || '',
        email: tx.email || '',
        totalDonasi: 0,
        jumlahTransaksi: 0,
        terakhir: '',
        isImported: false,
        _layananSet: {}
      };
    }

    var obj = donaturMap[key];
    if (!obj._layananSet) obj._layananSet = {};
    var _txLay = resolveLayananNamaForDonatur(cleaned, tx.layananId || '', layList);
    if (_txLay) obj._layananSet[_txLay.toLowerCase()] = true;
    if (obj.kategori === 'Perorangan' && detected !== 'Perorangan') obj.kategori = detected;
    obj.totalDonasi += Number(tx.jumlah) || 0;
    obj.jumlahTransaksi++;
    if (tx.tanggal && (!obj.terakhir || tx.tanggal > obj.terakhir)) {
      obj.terakhir = tx.tanggal;
    }
    if (!obj.telepon && tx.telepon) obj.telepon = tx.telepon;
    if (!obj.alamat && tx.alamat) obj.alamat = tx.alamat;
    if (!obj.email && tx.email) obj.email = tx.email;
  });
  
  var _donaturArr = Object.values(donaturMap);
  _donaturArr.forEach(function(o) {
    o.layanan = Object.keys(o._layananSet || {});
    delete o._layananSet;
  });
  return _donaturArr;
}

function apiImportDonaturText(t, text) {
  var u = _requirePerm(t, 'penghimpunan', 'edit');
  if (!text) return { success: false, count: 0 };
  var lines = text.split('\n');
  var count = 0;
  var existing = readAll(SHEETS.DONATUR) || [];
  var existingNames = {};
  existing.forEach(function(r) {
    existingNames[String(r.nama || '').trim().toLowerCase()] = true;
  });
  
  lines.forEach(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return;
    var parts = [];
    if (trimmed.indexOf('|') >= 0) {
      parts = trimmed.split('|');
    } else if (trimmed.indexOf(';') >= 0) {
      parts = trimmed.split(';');
    } else if (trimmed.indexOf(' - ') >= 0) {
      parts = trimmed.split(' - ');
    } else if (trimmed.indexOf('\t') >= 0) {
      parts = trimmed.split('\t');
    } else {
      parts = trimmed.split(',');
    }
    
    var nama = String(parts[0] || '').trim();
    if (!nama) return;
    var key = nama.toLowerCase();
    if (existingNames[key]) return;
    
    var kategori = '';
    var telepon = '';
    var alamat = '';
    var email = '';

    if (parts.length >= 4) {
      kategori = String(parts[1] || '').trim();
      telepon = String(parts[2] || '').trim();
      alamat = String(parts[3] || '').trim();
    } else if (parts.length === 3) {
      // Kolom ke-2 bisa berupa kategori ATAU telepon
      var maybeKat = normalizeKategoriLabel(parts[1]);
      if (maybeKat) {
        kategori = maybeKat;
        alamat = String(parts[2] || '').trim();
      } else {
        telepon = String(parts[1] || '').trim();
        alamat = String(parts[2] || '').trim();
      }
    } else if (parts.length === 2) {
      var maybeKat2 = normalizeKategoriLabel(parts[1]);
      if (maybeKat2) kategori = maybeKat2;
      else telepon = String(parts[1] || '').trim();
    }

    kategori = normalizeKategoriLabel(kategori) || detectKategoriDonatur(nama, '', '', readAll(SHEETS.LAYANAN) || []);
    
    var newDonatur = {
      id: makeId(),
      nama: nama,
      kategori: kategori,
      telepon: telepon,
      alamat: alamat,
      email: email,
      dibuat: new Date().toISOString()
    };
    insertRow(SHEETS.DONATUR, newDonatur);
    existingNames[key] = true;
    count++;
  });
  
  audit(u.id, u.username, 'import_donatur_text', count + ' donatur berhasil diimpor dari daftar teks');
  return { success: true, count: count };
}

// ====== Node overrides ======
function hashPassword(p,salt){ return crypto.createHash('sha256').update(String(salt)+'::'+String(p)).digest('hex'); }
var REGISTRY={};
REGISTRY['apiListMutasi']=apiListMutasi;
REGISTRY['apiSaveMutasiRows']=apiSaveMutasiRows;
REGISTRY['apiImportMutasiToRecords']=apiImportMutasiToRecords;
REGISTRY['apiListDonatur']=apiListDonatur;
REGISTRY['apiImportDonaturText']=apiImportDonaturText;
REGISTRY['apiGetMonthlySpreadsheet']=apiGetMonthlySpreadsheet;
REGISTRY['apiDeleteByDateRange']=apiDeleteByDateRange;
REGISTRY['apiBootstrap']=apiBootstrap;
REGISTRY['login']=login;
REGISTRY['logout']=logout;
REGISTRY['apiUpdateMyProfile']=apiUpdateMyProfile;
REGISTRY['apiDashboard']=apiDashboard;
REGISTRY['apiGetPublicLinkInfo']=apiGetPublicLinkInfo;
REGISTRY['apiGeneratePublicLink']=apiGeneratePublicLink;
REGISTRY['apiDisablePublicLink']=apiDisablePublicLink;
REGISTRY['apiListPenghimpunan']=apiListPenghimpunan;
REGISTRY['apiListRekeningPublic']=apiListRekeningPublic;
REGISTRY['apiListLayananPublic']=apiListLayananPublic;
REGISTRY['apiSavePenghimpunan']=apiSavePenghimpunan;
REGISTRY['apiDeletePenghimpunan']=apiDeletePenghimpunan;
REGISTRY['apiGetKwitansi']=apiGetKwitansi;
REGISTRY['apiListPentasyarufan']=apiListPentasyarufan;
REGISTRY['apiSavePentasyarufan']=apiSavePentasyarufan;
REGISTRY['apiDeletePentasyarufan']=apiDeletePentasyarufan;
REGISTRY['apiGetBuktiPentasyarufan']=apiGetBuktiPentasyarufan;
REGISTRY['apiListRekening']=apiListRekening;
REGISTRY['apiSaveRekening']=apiSaveRekening;
REGISTRY['apiDeleteRekening']=apiDeleteRekening;
REGISTRY['apiListLayanan']=apiListLayanan;
REGISTRY['apiSaveLayanan']=apiSaveLayanan;
REGISTRY['apiDeleteLayanan']=apiDeleteLayanan;
REGISTRY['apiJurnalData']=apiJurnalData;
REGISTRY['apiBroadcastReport']=apiBroadcastReport;
REGISTRY['apiListUsers']=apiListUsers;
REGISTRY['apiSaveUser']=apiSaveUser;
REGISTRY['apiDeleteUser']=apiDeleteUser;
REGISTRY['apiGetSettings']=apiGetSettings;
REGISTRY['apiSaveSettings']=apiSaveSettings;
REGISTRY['apiChangeMyPassword']=apiChangeMyPassword;
REGISTRY['apiMe']=apiMe;
REGISTRY['apiGetPermissionMeta']=apiGetPermissionMeta;
REGISTRY['apiPublicDashboard']=apiPublicDashboard;
REGISTRY['apiParseImportUrl']=apiParseImportUrl;
REGISTRY['apiParseImportText']=apiParseImportText;
REGISTRY['apiSaveImportedData']=apiSaveImportedData;
async function runRPC(db, fn, args){
  DB = db || {sheets:{},props:{}};
  if(!DB.sheets) DB.sheets={}; if(!DB.props) DB.props={};
  setup(); // Always run setup to keep table schemas and defaults up to date
  if(!REGISTRY[fn]) throw new Error('Fungsi tidak dikenal: '+fn);
  var result = await REGISTRY[fn].apply(null, args||[]);
  return { result: result, db: DB };
}
module.exports = { runRPC };