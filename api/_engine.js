// ====== Google Apps Script SHIM (Node) ======
const crypto = require('crypto');
let DB = { sheets:{}, props:{} };
/* ===== PEMUATAN BERTAHAP (dipakai lib/laz-pg.js) =====
   Mode lama: seluruh basis data ada di memori sebagai satu bongkah, jadi
   setiap lembar selalu lengkap dan LAMBAT tetap null.
   Mode PostgreSQL: yang dimuat lebih dulu hanya baris judul tiap tabel plus
   tiga tabel kecil yang selalu dipakai (Users, Sessions, Settings). Kalau
   engine ternyata butuh isi tabel lain, LAMBAT.minta() melempar galat khusus;
   api/rpc.js menangkapnya, memuat tabel itu, lalu menjalankan ulang. Ini
   satu-satunya cara memuat sesuai kebutuhan di engine yang seluruhnya
   sinkron: tidak ada tempat untuk menunggu jaringan di tengah jalan.

   getLastRow() SENGAJA tidak melempar: ensureSheet() memanggilnya pada setiap
   permintaan hanya untuk bertanya "tabelnya masih kosong?", dan jumlah baris
   sesungguhnya sudah diketahui dari sisi PostgreSQL. Kalau ia melempar,
   setup() akan memaksa seluruh tabel dimuat setiap kali. */
let LAMBAT = null;
function _setLambat(o){ LAMBAT = o || null; }
function _belumLengkap(n){ return !!(LAMBAT && !LAMBAT.lengkap.has(n)); }
function _perluLembar(n){ if (_belumLengkap(n)) LAMBAT.minta(n); }
/* SINYAL PEMUATAN TABEL TIDAK BOLEH DIBUNGKUS.
 *
 * LAMBAT.minta() melempar galat khusus yang artinya bukan "gagal" melainkan
 * "tabel ini belum ada, muat dulu lalu ulangi". api/rpc.js yang menangkapnya.
 * Kalau sebuah catch di berkas ini membungkusnya jadi pesan lain, artinya
 * hilang dan yang sampai ke layar adalah kegagalan yang sebenarnya sudah ada
 * penanganannya. Itu pernah terjadi pada impor jurnal:
 *
 *     Gagal memproses teks: Tabel "Penghimpunan" belum dimuat.
 *
 * Jadi tiap catch yang membungkus pesan memanggil _lolosLembar(e) lebih dulu. */
function _lolosLembar(e){ if (e && (e.perluLembar || /Tabel "[^"]+" belum dimuat/.test(String(e.message||'')))) throw e; }
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
  getLastRow(){const a=this._a(); if(!a.length) return 0; return _belumLengkap(this.name) ? a.length + (LAMBAT.jumlah[this.name]||0) : a.length;}
  getLastColumn(){let m=0;this._a().forEach(r=>{if(r&&r.length>m)m=r.length;});return m;}
  getDataRange(){_perluLembar(this.name);return new Range(this._a(),1,1,Math.max(this._a().length,1),Math.max(this.getLastColumn(),1));}
  getRange(r,c,nr,nc){if(r>1||(nr||1)>1)_perluLembar(this.name);return new Range(this._a(),r,c,nr||1,nc||1);}
  appendRow(arr){this._a().push(arr.slice());return this;}
  deleteRow(r){_perluLembar(this.name);this._a().splice(r-1,1);return this;}
  setFrozenRows(){return this;} clear(){_perluLembar(this.name);DB.sheets[this.name]=[];return this;}
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
  REKENING:'Rekening', LAYANAN:'Layanan', MUTASI:'Mutasi', DONATUR:'Donatur',
  SALDOAWAL:'SaldoAwal', UANGMUKA:'UangMuka', TRANSFER:'Transfer'
};
/* 'saldodaerah' adalah izin tersendiri: angka Penghimpunan Daerah (dana yang
   dihimpun langsung oleh daerah, bukan lewat kantor layanan) sering tidak
   pantas dilihat semua orang, sementara saldo KLL/ULL boleh. Dipisahkan
   sebagai modul supaya diaturnya lewat mekanisme izin yang sama dengan
   fitur lain, bukan lewat saklar tersembunyi. */
/* Dashboard, Saldo Kas & Bank, dan Saldo KLL & ULL dulu satu izin bernama
   'dashboard'. Satu centang membuka ketiganya sekaligus, padahal ketiganya
   menjawab pertanyaan yang berbeda: dashboard memperlihatkan ringkasan, saldo
   kas & bank memperlihatkan isi tiap rekening, dan saldo KLL/ULL
   memperlihatkan uang yang dipegang tiap kantor layanan. Staff yang cuma
   perlu melihat ringkasan jadi ikut melihat saldo rekening. Sekarang tiga
   izin sendiri-sendiri. Akun lama dijembatani MODUL_ASAL di bawah. */
var MODULES = ['dashboard','saldo','saldokll','penghimpunan','pentasyarufan','laporan','rekening','layanan','users','settings','donatur','log','saldodaerah','broadcast','fundraising','ai','media','surat'];
var ACTIONS = ['view','create','edit','delete'];
/* Nama modul & aksi dalam bahasa manusia — tabel izin di Manajemen User dulu
   menampilkan nama teknis apa adanya, sehingga sulit dipakai orang non-teknis. */
var MODUL_LABEL = {
  dashboard:'Dashboard', saldo:'Saldo Kas & Bank', saldokll:'Saldo KLL & ULL',
  penghimpunan:'Penghimpunan', pentasyarufan:'Pentasyarufan',
  laporan:'Laporan & Closing', rekening:'Rekening Bank', layanan:'Kantor Layanan (KLL/ULL)',
  users:'Manajemen User', settings:'Pengaturan & Perawatan', donatur:'Donatur',
  log:'Log Aktivitas', saldodaerah:'Saldo Penghimpunan Daerah', broadcast:'Broadcast WhatsApp',
  fundraising:'Fundraising (Penghimpunan Lapangan)', ai:'AI Asisten',
  media:'Media & Desain', surat:'Surat & Pengajuan'
};
var MODUL_KET = {
  dashboard:'Halaman Dashboard: ringkasan angka, grafik, dan Link Publik. Hanya "lihat" yang dipakai.',
  saldo:'Menu Saldo Kas & Bank: saldo tiap rekening dan buku besar per akun. Hanya "lihat" yang dipakai.',
  saldokll:'Menu Saldo KLL & ULL: uang yang dipegang tiap kantor layanan beserta setoran, uang muka, dan LPJ-nya. Hanya "lihat" yang dipakai. Angka Penghimpunan Daerah masih butuh izin tersendiri di bawah.',
  penghimpunan:'Mencatat, mengubah, dan menghapus penerimaan',
  pentasyarufan:'Mencatat, mengubah, dan menghapus penyaluran',
  laporan:'Laporan, rekap pilar, jurnal, dan closing bulanan',
  rekening:'Daftar rekening bank dan kas',
  layanan:'Daftar kantor layanan KLL/ULL',
  users:'Menambah pengguna dan mengatur izinnya',
  settings:'Pengaturan lembaga, hak amil, cadangan, dan perawatan data',
  donatur:'Basis data donatur',
  log:'Riwayat siapa mengubah apa',
  saldodaerah:'Melihat angka Penghimpunan Daerah di menu Saldo KLL & ULL. Hanya "view" yang dipakai.',
  broadcast:'Mengirim pesan WhatsApp massal ke buku kontak broadcast',
  fundraising:'Modul fundraiser lapangan: database donatur, jadwal pengambilan, pencatatan, dan pencocokan dengan buku utama. Centang "hapus" menjadikannya koordinator yang melihat data semua fundraiser.',
  ai:'AI Asisten: "lihat" membaca percakapan, "tambah" boleh bertanya, "ubah" boleh menyunting pengetahuan & persona, "hapus" boleh menghapus percakapan (percakapan dipakai bersama seluruh tim). Pengaturan provider dan kunci API tetap khusus superadmin.',
  media:'Permohonan desain ke tim media: "lihat" membuka modul dan melihat permohonan, "tambah" boleh mengajukan permohonan dan meminta revisi atas permohonannya sendiri, "ubah" menjadikannya tim media yang mengerjakan, "hapus" menjadikannya koordinator yang membagi bidang, mengatur anggota tim, dan melihat rekap. Bidang foto/video/desain diatur terpisah di halaman Tim Media.',
  surat:'Surat masuk, surat keluar, dan pengajuan bantuan/sponsorship/proposal: "lihat" membuka modul, melihat surat, dan menjawab disposisi untuknya, "tambah" mencatat surat atau pengajuan baru beserta lampirannya, "ubah" memindah progres (asesmen, disetujui, dicairkan) dan membuat disposisi, "hapus" menghapus surat.'
};
/* Aksi yang benar-benar berlaku untuk tiap modul — mencentang "hapus" pada
   modul yang tidak punya aksi hapus hanya membingungkan. */
var MODUL_AKSI = {
  dashboard:['view'], saldo:['view'], saldokll:['view'],
  saldodaerah:['view'], log:['view']
};

/* Jembatan untuk izin yang dulu satu lalu dipecah. Akun lama tidak punya
   kunci 'saldo' / 'saldokll' sama sekali di izinnya, dan tanpa jembatan ini
   mereka kehilangan dua menu begitu pembaruan naik — padahal tidak ada yang
   mencabut haknya. Aturannya sempit dan disengaja: hanya dipakai kalau
   kuncinya BELUM PERNAH ADA. Begitu superadmin menyimpan izin akun itu satu
   kali, kunci barunya tertulis apa adanya dan jembatan ini tidak menyentuh
   akun tersebut lagi — termasuk saat izinnya justru dicabut. */
var MODUL_ASAL = { saldo:'dashboard', saldokll:'dashboard' };

/* Daftar nama fundraising/sumber. Disimpan di Settings (kunci fundraisingList)
   supaya bisa ditambah sendiri lewat menu Pengaturan, bukan terkunci di kode. */
var FUNDRAISING_DEFAULT = ['Lazismu Daerah Bantul','Kantor','Qris','Sherli','Renata','Ariya','Nur Yulianto','Muzakki'];

var BULAN = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

var JENIS_TOP=['Zakat','Infak','Sedekah','Wakaf','Kurban','Fidyah','DSKL','Amil'];
var SUBJENIS={
  'Zakat':['Zakat Mal','Zakat Fitrah','Zakat Profesi/Penghasilan','Zakat Perdagangan','Zakat Pertanian','Zakat Emas & Perak','Zakat Simpanan','Bagi Hasil Bank'],
  'Infak':['Infak Umum','Infak Terikat','Bagi Hasil Bank'],
  'Sedekah':['Sedekah Umum','Sedekah Terikat','Bagi Hasil Bank'],
  'Wakaf':['Wakaf Uang','Wakaf Melalui Uang','Bagi Hasil Bank'],
  'Kurban':['Kurban'],'Fidyah':['Fidyah'],
  'DSKL':['CSR Perusahaan','Bagi Hasil Bank','Dana Sosial Lainnya'],
  'Amil':['Amil','Hak Amil Zakat','Hak Amil Infak','Bagi Hasil Bank']
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

  ensureSheet(ss,SHEETS.USERS,['id','username','passwordHash','salt','nama','role','permissions','aktif','dibuat','layanan']);
  ensureSheet(ss,SHEETS.PENGHIMPUNAN,['id','noKwitansi','tanggal','jenisDana','subJenis','pilar','program','namaDonatur','tipeDonatur','layananId','telepon','email','alamat','jumlah','metode','rekeningId','bank','statusBayar','atasNama','keterangan','petugas','dibuat','fundraising','akunKredit']);
  ensureSheet(ss,SHEETS.PENTASYARUFAN,['id','noBukti','tanggal','ashnaf','program','sumberDana','namaPenerima','nik','telepon','alamat','jumlah','bentukBantuan','metode','statusSalur','petugas','keterangan','dibuat','fundraising','rekeningId','bank','section']);
  ensureSheet(ss,SHEETS.REKENING,['id','namaBank','nomor','atasNama','fundGroup','aktif','dibuat']);
  ensureSheet(ss,SHEETS.LAYANAN,['id','tipe','kode','nama','wilayah','penanggungJawab','telepon','aktif','dibuat']);
  ensureSheet(ss,SHEETS.MUTASI,['id','tanggal','deskripsi','tipe','nominal','dibuat']);
  ensureSheet(ss,SHEETS.DONATUR,['id','nama','kategori','telepon','alamat','email','dibuat']);
  /* Saldo & pergerakan kas — dasar penghitungan saldo berjalan per akun. */
  ensureSheet(ss,SHEETS.SALDOAWAL,['id','tahun','jenis','akun','rekeningId','kasNama','dana','nominal','keterangan','dibuat','oleh']);
  ensureSheet(ss,SHEETS.UANGMUKA,['id','tanggal','jenis','dana','layanan','akun','rekeningId','kasNama','nominal','keterangan','section','petugas','dibuat']);
  ensureSheet(ss,SHEETS.TRANSFER,['id','tanggal','jenis','dariAkun','dariRekeningId','dariKas','keAkun','keRekeningId','keKas','nominal','keterangan','section','petugas','dibuat']);
  ensureSheet(ss,SHEETS.SETTINGS,['key','value']);
  ensureSheet(ss,SHEETS.SESSIONS,['token','userId','expired']);
  ensureSheet(ss,SHEETS.LOG,['waktu','userId','username','aksi','modul','entitasId','ringkas','detail','ip','ua']);

  var defaults={namaLembaga:'Lembaga Amil Zakat',singkatan:'LAZ',alamat:'Alamat lembaga Anda',telepon:'021-0000000',email:'info@laz.org',website:'www.laz.org',logoUrl:'',publicToken:'',publicEnabled:'false',fundraisingList:JSON.stringify(FUNDRAISING_DEFAULT)};
  Object.keys(defaults).forEach(function(k){ if(getSetting(k)===null) setSetting(k,defaults[k]); });

  if(readAll(SHEETS.USERS).length===0){
    var allPerm={}; MODULES.forEach(function(m){allPerm[m]={};ACTIONS.forEach(function(a){allPerm[m][a]=true;});});
    var salt=makeId();
    /* Password admin awal TIDAK ditulis di kode — repositori ini publik.
       Diambil dari env SETUP_ADMIN_PASSWORD; kalau tidak diset, dibuatkan acak
       dan ditampilkan sekali pada pesan hasil setup. */
    var initPw = process.env.SETUP_ADMIN_PASSWORD;
    if (!initPw) {
      try { initPw = require('crypto').randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,12); }
      catch(e) { initPw = 'ubah-password-ini-' + Date.now(); }
    }
    _SETUP_INIT_PW = initPw;
    insertRow(SHEETS.USERS,{id:makeId(),username:'superadmin',passwordHash:hashPassword(initPw,salt),salt:salt,nama:'Super Administrator',role:'superadmin',permissions:JSON.stringify(allPerm),aktif:'true',dibuat:new Date().toISOString()});
  }
  return 'Setup selesai. Spreadsheet: '+ss.getUrl()
    + (_SETUP_INIT_PW ? ('\nLogin: superadmin / '+_SETUP_INIT_PW+'\n(Segera ganti password ini setelah login pertama.)') : '');
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
function legacyHashPassword(p,s){ var raw=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s+'::'+p,Utilities.Charset.UTF_8); return raw.map(function(b){return ('0'+(b&0xFF).toString(16)).slice(-2);}).join(''); }
function hashPassword(p,s){
  if (!p) return '';
  try {
    return crypto.scryptSync(String(p), String(s || 'salt'), 64).toString('hex');
  } catch(e) {
    return legacyHashPassword(p, s);
  }
}
/* ===== PENGAMANAN LOGIN =====
   Percobaan gagal dihitung per username DAN per alamat IP. Setelah 5 kali
   gagal akun dikunci 1 menit, 8 kali 5 menit, 12 kali 30 menit — cukup untuk
   mematahkan tebak-tebakan sandi tanpa mengganggu petugas yang sekadar salah
   ketik. Pesan gagal dibuat seragam supaya tidak membocorkan username mana
   yang ada. */
function _kunciLoginKey(jenis, nilai){ return 'lg_' + jenis + '_' + String(nilai || '').toLowerCase().slice(0, 80); }
function _bacaKunci(key){ try { return JSON.parse(getSetting(key) || 'null') || { n: 0, sampai: 0 }; } catch (e) { return { n: 0, sampai: 0 }; } }
function _sisaKunci(key){ var k = _bacaKunci(key); var sisa = Math.ceil((Number(k.sampai || 0) - Date.now()) / 1000); return sisa > 0 ? sisa : 0; }
function _catatGagalLogin(key){
  var k = _bacaKunci(key); k.n = (Number(k.n) || 0) + 1;
  var detik = k.n >= 12 ? 1800 : k.n >= 8 ? 300 : k.n >= 5 ? 60 : 0;
  k.sampai = detik ? Date.now() + detik * 1000 : 0;
  setSetting(key, JSON.stringify(k));
  return detik;
}
function _hapusKunciLogin(key){ deleteRowBy(SHEETS.SETTINGS, 'key', key); }
function _bersihkanSesiKedaluwarsa(){
  var kini = new Date();
  (readAll(SHEETS.SESSIONS) || []).forEach(function(s){ if (new Date(s.expired) < kini) deleteRowBy(SHEETS.SESSIONS, 'token', s.token); });
}
/* Sandi minimal 8 karakter dan memuat huruf serta angka. */
function _periksaSandi(p){
  p = String(p == null ? '' : p);
  if (p.length < 8) throw new Error('Sandi minimal 8 karakter.');
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) throw new Error('Sandi harus memuat huruf dan angka.');
}
var _PESAN_LOGIN_GAGAL = 'Username atau password salah';

/* Penguncian per USERNAME dulu memakai ambang yang sama ketatnya dengan per
   IP, jadi siapa pun cukup salah sandi 12 kali atas nama "superadmin" untuk
   mengunci superadmin asli 30 menit dari komputer mana pun
   (tools/test_sesi_kuat.js bagian A). Sekarang ambang ketat berlaku per
   (username + IP) dan per IP: penyerang hanya mengunci dirinya sendiri.
   Hitungan per username tetap ada dengan ambang 20 dan 40, supaya tebakan
   yang disebar dari banyak IP tetap terhenti. */
function _catatGagalLonggar(key){
  var k = _bacaKunci(key); k.n = (Number(k.n) || 0) + 1;
  var detik = k.n >= 40 ? 1800 : k.n >= 20 ? 900 : 0;
  k.sampai = detik ? Date.now() + detik * 1000 : 0;
  setSetting(key, JSON.stringify(k));
  return detik;
}
function login(u,p,ingat){
  var ipNya = (_LOG_CTX && _LOG_CTX.ip) || '-';
  var kU = _kunciLoginKey('u', u), kIP = _kunciLoginKey('ip', ipNya), kUI = _kunciLoginKey('ui', String(u||'') + '|' + ipNya);
  var sisa = Math.max(_sisaKunci(kU), _sisaKunci(kIP), _sisaKunci(kUI));
  if (sisa > 0) {
    audit('', String(u||'').slice(0,40), 'login_dikunci', 'masih terkunci ' + sisa + ' detik', {modul:'sesi'});
    return {ok:false, msg:'Terlalu banyak percobaan. Coba lagi dalam ' + (sisa >= 60 ? Math.ceil(sisa/60) + ' menit' : sisa + ' detik') + '.', terkunci: sisa};
  }
  function gagal(alasan){
    var d1 = _catatGagalLogin(kUI), d2 = _catatGagalLogin(kIP), d3 = _catatGagalLonggar(kU);
    audit('', String(u||'').slice(0,40), 'login_gagal', alasan, {modul:'sesi'});
    var kunci = Math.max(d1, d2, d3);
    return {ok:false, msg:_PESAN_LOGIN_GAGAL + (kunci ? ', dikunci ' + (kunci >= 60 ? Math.ceil(kunci/60) + ' menit' : kunci + ' detik') : ''), terkunci: kunci};
  }
  var us=readAll(SHEETS.USERS),f=null; for(var i=0;i<us.length;i++){if(String(us[i].username).toLowerCase()===String(u).toLowerCase()){f=us[i];break;}}
  if(!f){ return gagal('username tidak ditemukan'); }
  if(String(f.aktif)!=='true'){ audit(f.id,f.username,'login_gagal','akun dinonaktifkan',{modul:'sesi'}); return {ok:false,msg:'Akun dinonaktifkan'}; }
  var inputHash = hashPassword(p, f.salt);
  if (inputHash !== f.passwordHash) {
    var legacy = legacyHashPassword(p, f.salt);
    if (legacy === f.passwordHash) {
      // Auto upgrade hash to scrypt
      updateRowById(SHEETS.USERS, f.id, { passwordHash: inputHash });
    } else {
      return gagal('password salah');
    }
  }
  _hapusKunciLogin(kU); _hapusKunciLogin(kIP); _hapusKunciLogin(kUI);
  _bersihkanSesiKedaluwarsa();
  var token=_buatSesi(f); audit(f.id,f.username,'login',ingat===true?'dengan Ingat saya':'',{modul:'sesi'});
  var hasil={ok:true,token:token,user:sanitizeUser(f)};
  if (ingat === true) hasil.ingat = _buatTokenIngat(f.id);
  return hasil; }
/* Token sesi disimpan sebagai HASH (awalan "h:"), bukan apa adanya. Dulu
   siapa pun yang bisa membaca tabel Sessions bisa langsung memakai sesi
   siapa saja. Baris lama yang tersimpan apa adanya tetap diterima oleh
   _cariSesi sampai kedaluwarsa (paling lama 12 jam), supaya tidak ada yang
   terlempar keluar pada hari deploy. Token acak 122 bit, jadi SHA-256 tanpa
   garam sudah cukup: tidak ada yang bisa ditebak dari hash-nya. */
var _AWALAN_SESI = 'h:';
function _hashSesi(t){ return _AWALAN_SESI + crypto.createHash('sha256').update(String(t)).digest('hex'); }
function _buatSesi(f){ var token=Utilities.getUuid(); insertRow(SHEETS.SESSIONS,{token:_hashSesi(token),userId:f.id,expired:new Date(Date.now()+12*36e5).toISOString()}); return token; }
function _cariSesi(t){
  t = String(t || '');
  if (!t || t.indexOf(_AWALAN_SESI) === 0 || t.indexOf(_AWALAN_INGAT) === 0) return null;
  var h = _hashSesi(t), ss = readAll(SHEETS.SESSIONS), warisan = null;
  for (var i = 0; i < ss.length; i++) {
    if (ss[i].token === h) return ss[i];
    if (ss[i].token === t) warisan = ss[i];
  }
  return warisan;
}

/* ===== TOKEN "INGAT SAYA" =====
   Dulu "Ingat saya" menyimpan username dan SANDI ASLI di localStorage
   (laz_creds, cuma dibungkus base64), lalu mengirimnya ulang setiap sesi
   12 jam habis. Sandi di peramban bisa dibaca siapa pun yang membuka DevTools
   di komputer bersama atau oleh satu skrip lewat celah XSS, dan tidak bisa
   dicabut: mengganti sandi di server tidak menghapus salinan di peramban.

   Penggantinya token acak 256 bit yang berlaku 30 hari. Yang disimpan di
   tabel Sessions hanya HASH-nya, dengan awalan "ing:", supaya:
   - tabel Sessions yang bocor tidak memberi token yang bisa dipakai;
   - authUser menolak apa pun yang berawalan "ing:", jadi baris ini tidak
     pernah bisa dipakai sebagai sesi biasa;
   - _matikanSesiLain (ganti sandi) dan pembersihan sesi kedaluwarsa ikut
     menyapu baris ini tanpa kode tambahan, karena bentuknya sama.
   Tidak butuh tabel baru, jadi tidak ada perubahan skema PostgreSQL.

   Token ingat TIDAK diputar setiap dipakai. Memutar lebih ketat, tetapi dua
   tab yang sesinya habis bersamaan akan saling mematikan tokennya, dan amil
   terlempar ke layar masuk tanpa sebab yang bisa ia pahami. */
var _AWALAN_INGAT = 'ing:';
var _UMUR_INGAT_MS = 30 * 864e5;
function _hashIngat(t){ return _AWALAN_INGAT + crypto.createHash('sha256').update(String(t)).digest('hex'); }
function _buatTokenIngat(userId){
  var t = crypto.randomBytes(32).toString('hex');
  insertRow(SHEETS.SESSIONS,{token:_hashIngat(t),userId:userId,expired:new Date(Date.now()+_UMUR_INGAT_MS).toISOString()});
  return t;
}
function _barisIngat(ti){
  ti = String(ti || '');
  if (!ti || ti.indexOf(_AWALAN_INGAT) === 0) return null;
  var h = _hashIngat(ti), ss = readAll(SHEETS.SESSIONS);
  for (var i = 0; i < ss.length; i++) if (ss[i].token === h) return ss[i];
  return null;
}
function loginIngat(ti){
  var tolak = {ok:false, msg:'Sesi tersimpan sudah tidak berlaku. Silakan masuk lagi.'};
  var s = _barisIngat(ti);
  if (!s) return tolak;
  if (new Date(s.expired) < new Date()) { deleteRowBy(SHEETS.SESSIONS,'token',s.token); return tolak; }
  var f = findById(SHEETS.USERS, s.userId);
  if (!f || String(f.aktif) !== 'true') { deleteRowBy(SHEETS.SESSIONS,'token',s.token); return tolak; }
  _bersihkanSesiKedaluwarsa();
  var token = _buatSesi(f);
  audit(f.id,f.username,'login','lewat Ingat saya',{modul:'sesi'});
  return {ok:true, token:token, user:sanitizeUser(f)};
}
function logout(t, ti){
  var u=null; try{ u=authUser(t); }catch(e){}
  var sl = _cariSesi(t); if (sl) deleteRowBy(SHEETS.SESSIONS,'token',sl.token);
  /* Token ingat dicabut kalau pemegangnya memang pemilik sesi ini. Kalau
     sesinya sudah habis (u kosong), memegang token ingat itu sendiri sudah
     bukti kepemilikan, dan mencabutnya tidak merugikan siapa pun. */
  var si = ti ? _barisIngat(ti) : null;
  if (si && (!u || String(si.userId) === String(u.id))) deleteRowBy(SHEETS.SESSIONS,'token',si.token);
  if(u) audit(u.id,u.username,'logout','',{modul:'sesi'});
  return {ok:true};
}
function deleteRowBy(name,col,val){ var sh=getSS().getSheetByName(name); var v=sh.getDataRange().getValues(); var c=v[0].indexOf(col); for(var i=v.length-1;i>=1;i--){if(String(v[i][c])===String(val))sh.deleteRow(i+1);} }
function authUser(t){ if(!t) throw new Error('AUTH: token kosong, login ulang.'); var s=_cariSesi(t);
  if(!s) throw new Error('AUTH: sesi tidak valid, login ulang.'); if(new Date(s.expired)<new Date()){deleteRowBy(SHEETS.SESSIONS,'token',s.token);throw new Error('AUTH: sesi berakhir, login ulang.');}
  var u=findById(SHEETS.USERS,s.userId); if(!u) throw new Error('AUTH: user tidak ditemukan.');
  /* Status aktif diperiksa di SETIAP permintaan, bukan cuma saat login. Dulu
     amil yang dinonaktifkan tetap bisa membaca dan mencatat transaksi lewat
     sesi yang sudah terbuka sampai 12 jam kemudian (tools/test_akun_nonaktif.js:
     9 dari 20 pemeriksaan gagal, termasuk satu setoran yang berhasil tercatat
     oleh akun nonaktif). Aturannya sama dengan login: hanya 'true' yang aktif.
     Karena modul Broadcast, AI, Fundraising, dan Media memeriksa izin lewat
     engine.cekIzin -> authUser, semuanya ikut tertutup dari sini. */
  if(String(u.aktif)!=='true'){ deleteRowBy(SHEETS.SESSIONS,'token',s.token); throw new Error('AUTH: akun dinonaktifkan, hubungi admin.'); }
  return u; }
function sanitizeUser(u){ return {id:u.id,username:u.username,nama:u.nama,role:u.role,layanan:String(u.layanan||''),permissions:typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):(u.permissions||{})}; }
function can(u,m,a){
  if(u.role==='superadmin')return true;
  var p=typeof u.permissions==='string'?JSON.parse(u.permissions||'{}'):(u.permissions||{});
  if(!p[m] && MODUL_ASAL[m] && p[MODUL_ASAL[m]]) return !!p[MODUL_ASAL[m]][a];
  return !!(p[m]&&p[m][a]);
}
function _requirePerm(t,m,a){ var u=authUser(t); if(!can(u,m,a)) throw new Error('IZIN: tidak punya akses '+a+' pada modul '+m+'.'); return u; }
/* Satu catatan aktivitas. `opt` boleh berisi {modul, entitasId, ringkas}.
   IP dan peramban diambil dari konteks permintaan (diisi runRPC). */
function audit(id,un,ak,d,opt){
  opt = opt || {};
  try{
    insertRow(SHEETS.LOG,{
      waktu:new Date().toISOString(),
      userId:id||'', username:un||'', aksi:ak||'',
      modul:opt.modul||'', entitasId:opt.entitasId||'',
      ringkas:opt.ringkas||'', detail:(d==null?'':String(d)),
      ip:(_LOG_CTX&&_LOG_CTX.ip)||'', ua:(_LOG_CTX&&_LOG_CTX.ua)||''
    });
    if (typeof _logPangkas === 'function') _logPangkas();
  }catch(e){}
}

/* ===== SESI ===== */
function apiMe(t){ return sanitizeUser(authUser(t)); }
/* Kunci Settings yang hanya boleh diubah sistem lewat jalurnya sendiri:
   penguncian login (lg_*), token dan saklar dashboard publik, dan foto
   pengguna (uf_*, diubah lewat apiUpdateMyProfile oleh pemiliknya). Dulu
   apiSaveSettings menerima semuanya, jadi pemegang izin Pengaturan bisa
   membuka kunci login orang, mengganti token publik, atau foto orang lain. */
function _kunciSistem(k){ k = String(k); return /^lg_/.test(k) || /^uf_/.test(k) || /^um_/.test(k) || /^lhToken/.test(k) || k === 'publicToken' || k === 'publicEnabled' || k === 'aliasKantor'; }
/* Settings yang boleh dikirim ke peramban. Catatan penguncian login tidak
   pernah dikirim; token publik hanya ke pemegang izin lihat Pengaturan (dan
   lewat apiGetPublicLinkInfo). Dulu apiBootstrap mengirim semuanya ke setiap
   pengguna yang login. */
function _settingsAman(semua, bolehToken){
  var o = {};
  Object.keys(semua || {}).forEach(function(k){
    if (/^lg_/.test(k)) return;
    if (/^lhToken/.test(k)) return;   /* token link harian hanya lewat apiInfoLinkHarian */
    if (!bolehToken && k === 'publicToken') return;
    o[k] = semua[k];
  });
  return o;
}
function apiBootstrap(t){ var u=authUser(t); return {user:sanitizeUser(u),settings:_settingsAman(getAllSettings(), false),webAppUrl:getWebAppUrl()}; }
function apiGetPermissionMeta(t){ authUser(t); return {modules:MODULES, actions:ACTIONS, label:MODUL_LABEL, ket:MODUL_KET, aksi:MODUL_AKSI}; }

/* ===== PENGHIMPUNAN ===== */
/* Nomor urut diambil dari nomor TERBESAR yang sudah ada, bukan dari JUMLAH
   baris. Dengan menghitung jumlah, satu transaksi yang dihapus membuat nomor
   berikutnya mengulang nomor yang masih terpakai, jadi ada dua kwitansi bernomor sama,
   dan yang menemukannya biasanya auditor. Sejak tabelnya di PostgreSQL, nomor
   kembar juga ditolak oleh indeks unik, jadi kekeliruan ini muncul sebagai
   "gagal menyimpan" alih-alih diam-diam lolos. */
function _nomorUrutTerakhir(nama, kolom, awalan){
  var maks = 0;
  readAll(nama).forEach(function(r){
    var v = String(r[kolom] || '');
    if (v.indexOf(awalan) !== 0) return;
    var n = parseInt(v.slice(awalan.length).replace(/[^0-9]/g, ''), 10);
    if (isFinite(n) && n > maks) maks = n;
  });
  return maks;
}
function generateNoKwitansi(){ var ym=Utilities.formatDate(new Date(),TZ,'yyyyMM'); var awalan='KW/'+ym+'/'; return awalan+('0000'+(_nomorUrutTerakhir(SHEETS.PENGHIMPUNAN,'noKwitansi',awalan)+1)).slice(-4); }
function apiListPenghimpunan(t){ _requirePerm(t,'penghimpunan','view'); return readAll(SHEETS.PENGHIMPUNAN).sort(function(a,b){ var tA=String(a.tanggal||''), tB=String(b.tanggal||''); if(tA!==tB) return tB.localeCompare(tA); return new Date(b.dibuat||0)-new Date(a.dibuat||0); }); }
async function apiSavePenghimpunan(t,d){ var u=_requirePerm(t,'penghimpunan',d.id?'edit':'create');
  d.fundraising = cleanFundraisingName(d.fundraising);
  var oldMonth = '';
  if(d.id){
    var oldRow = findById(SHEETS.PENGHIMPUNAN, d.id);
    if (oldRow) oldMonth = getMonthFromDate(oldRow.tanggal);
  }
  var newMonth = getMonthFromDate(d.tanggal);
  var res;
  if(d.id){
    updateRowById(SHEETS.PENGHIMPUNAN,d.id,d);
    audit(u.id,u.username,'edit_penghimpunan',d.noKwitansi||d.id,
      {modul:'penghimpunan',entitasId:d.id,ringkas:ringkasPerubahan(oldRow,d)});
    res = findById(SHEETS.PENGHIMPUNAN,d.id);
  }
  else {
    d.id=makeId(); d.noKwitansi=d.noKwitansi||generateNoKwitansi(); d.petugas=u.nama; d.dibuat=new Date().toISOString();
    insertRow(SHEETS.PENGHIMPUNAN,d);
    audit(u.id,u.username,'create_penghimpunan',d.noKwitansi||d.id,
      {modul:'penghimpunan',entitasId:d.id,
       ringkas:(d.namaDonatur||'-')+' · '+(d.jenisDana||'')+' '+(d.subJenis||'')+' · Rp '+(Number(d.jumlah)||0).toLocaleString('id-ID')});
    res = findById(SHEETS.PENGHIMPUNAN,d.id);
  }
  /* Penyumbangnya ikut terdaftar di tabel Donatur (KLL/ULL & anonim dilewati). */
  try {
    var _layD = []; try { _layD = readAll(SHEETS.LAYANAN) || []; } catch(e){}
    daftarkanDonatur(d, _layD, _petaDonatur());
  } catch(e) {}
  if (newMonth) await syncMonthlySpreadsheet(newMonth);
  if (oldMonth && oldMonth !== newMonth) await syncMonthlySpreadsheet(oldMonth);
  return res;
}
async function apiDeletePenghimpunan(t,id){ var u=_requirePerm(t,'penghimpunan','delete');
  var oldRow = findById(SHEETS.PENGHIMPUNAN, id);
  var oldMonth = oldRow ? getMonthFromDate(oldRow.tanggal) : '';
  deleteRowById(SHEETS.PENGHIMPUNAN,id);
  audit(u.id,u.username,'delete_penghimpunan',(oldRow&&oldRow.noKwitansi)||id,
    {modul:'penghimpunan',entitasId:id,
     ringkas:oldRow?((oldRow.namaDonatur||'-')+' · '+(oldRow.tanggal||'')+' · Rp '+(Number(oldRow.jumlah)||0).toLocaleString('id-ID')):''});
  if (oldMonth) await syncMonthlySpreadsheet(oldMonth);
  return {ok:true};
}
function apiGetKwitansi(t,id){ _requirePerm(t,'penghimpunan','view'); return {data:findById(SHEETS.PENGHIMPUNAN,id),settings:getAllSettings()}; }

/* ===== PENTASYARUFAN ===== */
function generateNoBukti(){ var ym=Utilities.formatDate(new Date(),TZ,'yyyyMM'); var awalan='BPT/'+ym+'/'; return awalan+('0000'+(_nomorUrutTerakhir(SHEETS.PENTASYARUFAN,'noBukti',awalan)+1)).slice(-4); }
function apiListPentasyarufan(t){ _requirePerm(t,'pentasyarufan','view'); return readAll(SHEETS.PENTASYARUFAN).sort(function(a,b){ var tA=String(a.tanggal||''), tB=String(b.tanggal||''); if(tA!==tB) return tB.localeCompare(tA); return new Date(b.dibuat||0)-new Date(a.dibuat||0); }); }
async function apiSavePentasyarufan(t,d){ var u=_requirePerm(t,'pentasyarufan',d.id?'edit':'create');
  d.fundraising = cleanFundraisingName(d.fundraising);
  var oldMonth = '';
  if(d.id){
    var oldRow = findById(SHEETS.PENTASYARUFAN, d.id);
    if (oldRow) oldMonth = getMonthFromDate(oldRow.tanggal);
  }
  var newMonth = getMonthFromDate(d.tanggal);
  var res;
  if(d.id){
    updateRowById(SHEETS.PENTASYARUFAN,d.id,d);
    audit(u.id,u.username,'edit_pentasyarufan',d.noBukti||d.id,
      {modul:'pentasyarufan',entitasId:d.id,ringkas:ringkasPerubahan(oldRow,d)});
    res = findById(SHEETS.PENTASYARUFAN,d.id);
  }
  else {
    d.id=makeId(); d.noBukti=d.noBukti||generateNoBukti(); d.petugas=u.nama; d.dibuat=new Date().toISOString();
    insertRow(SHEETS.PENTASYARUFAN,d);
    audit(u.id,u.username,'create_pentasyarufan',d.noBukti||d.id,
      {modul:'pentasyarufan',entitasId:d.id,
       ringkas:(d.namaPenerima||'-')+' · '+(d.program||'')+' · Rp '+(Number(d.jumlah)||0).toLocaleString('id-ID')});
    res = findById(SHEETS.PENTASYARUFAN,d.id);
  }
  if (newMonth) await syncMonthlySpreadsheet(newMonth);
  if (oldMonth && oldMonth !== newMonth) await syncMonthlySpreadsheet(oldMonth);
  return res;
}
async function apiDeletePentasyarufan(t,id){ var u=_requirePerm(t,'pentasyarufan','delete');
  var oldRow = findById(SHEETS.PENTASYARUFAN, id);
  var oldMonth = oldRow ? getMonthFromDate(oldRow.tanggal) : '';
  deleteRowById(SHEETS.PENTASYARUFAN,id);
  audit(u.id,u.username,'delete_pentasyarufan',(oldRow&&oldRow.noBukti)||id,
    {modul:'pentasyarufan',entitasId:id,
     ringkas:oldRow?((oldRow.namaPenerima||'-')+' · '+(oldRow.tanggal||'')+' · Rp '+(Number(oldRow.jumlah)||0).toLocaleString('id-ID')):''});
  if (oldMonth) await syncMonthlySpreadsheet(oldMonth);
  return {ok:true};
}
function apiGetBuktiPentasyarufan(t,id){ _requirePerm(t,'pentasyarufan','view'); return {data:findById(SHEETS.PENTASYARUFAN,id),settings:getAllSettings()}; }

/* ===== REKENING ===== */
function apiListRekening(t){ _requirePerm(t,'rekening','view'); return readAll(SHEETS.REKENING); }
function apiListRekeningPublic(t){ authUser(t); return readAll(SHEETS.REKENING).filter(function(r){return String(r.aktif)!=='false';}); }
function apiSaveRekening(t,d){ var baru=!d.id; var u=_requirePerm(t,'rekening',baru?'create':'edit');
  var lama = baru ? null : findById(SHEETS.REKENING,d.id);
  if(!baru){ updateRowById(SHEETS.REKENING,d.id,d); } else { d.id=makeId(); d.dibuat=new Date().toISOString(); insertRow(SHEETS.REKENING,d); }
  audit(u.id,u.username,(baru?'create_rekening':'edit_rekening'),d.namaBank||'',
    {modul:'rekening',entitasId:d.id||'',
     ringkas: baru ? ((d.namaBank||'')+' '+(d.nomor||'')).trim() : ringkasPerubahan(lama,d)}); return {ok:true}; }
function apiDeleteRekening(t,id){ var u=_requirePerm(t,'rekening','delete'); var rk=findById(SHEETS.REKENING,id); deleteRowById(SHEETS.REKENING,id);
  audit(u.id,u.username,'delete_rekening',(rk&&rk.namaBank)||id,{modul:'rekening',entitasId:id,ringkas:rk?((rk.namaBank||'')+' '+(rk.nomor||'')):''}); return {ok:true}; }

/* ===== FUNDRAISING (daftar sumber, dikelola dari menu Pengaturan) ===== */
function _bacaFundraising(){
  var raw = getSetting('fundraisingList');
  var arr = null;
  if(raw){ try{ arr = JSON.parse(raw); }catch(e){ arr = null; } }
  if(!arr || !arr.length) arr = FUNDRAISING_DEFAULT.slice();
  var set={}, out=[];
  arr.forEach(function(n){ n=String(n==null?'':n).trim(); if(!n) return;
    var k=n.toLowerCase(); if(!set[k]){ set[k]=1; out.push(n); } });
  return out;
}
function _tulisFundraising(list){ setSetting('fundraisingList', JSON.stringify(list)); }

/* Dipakai formulir penghimpunan, jadi cukup butuh login — bukan izin settings. */
function apiListFundraising(t){ authUser(t); return _bacaFundraising(); }

function apiSaveFundraising(t,nama,namaLama){
  var u=_requirePerm(t,'settings','edit');
  nama=String(nama==null?'':nama).trim();
  if(!nama) throw new Error('Nama fundraising tidak boleh kosong');
  if(nama.length>60) throw new Error('Nama fundraising terlalu panjang');
  var list=_bacaFundraising();
  var lama=String(namaLama==null?'':namaLama).trim();
  var bentrok=list.some(function(n){
    return n.toLowerCase()===nama.toLowerCase() && n.toLowerCase()!==lama.toLowerCase(); });
  if(bentrok) throw new Error('Nama "'+nama+'" sudah ada di daftar');
  var aksi='tambah', dipakai=0;
  if(lama){
    var idx=-1;
    list.forEach(function(n,i){ if(n.toLowerCase()===lama.toLowerCase()) idx=i; });
    if(idx<0) throw new Error('Nama lama tidak ditemukan');
    list[idx]=nama; aksi='ubah';
    /* Ikut perbarui transaksi lama supaya rincian sumber di Closing tidak pecah. */
    readAll(SHEETS.PENGHIMPUNAN).forEach(function(r){
      if(String(r.fundraising||'').trim().toLowerCase()===lama.toLowerCase()){
        updateRowById(SHEETS.PENGHIMPUNAN,r.id,{fundraising:nama}); dipakai++; }
    });
  } else list.push(nama);
  _tulisFundraising(list);
  audit(u.id,u.username,(lama?'edit_fundraising':'create_fundraising'),nama,
    {modul:'settings',entitasId:nama,ringkas:(lama?(lama+' -> '+nama+(dipakai?(' ('+dipakai+' transaksi ikut diperbarui)'):'')):nama)});
  return {ok:true,aksi:aksi,daftar:list,transaksiDiperbarui:dipakai};
}

function apiDeleteFundraising(t,nama){
  var u=_requirePerm(t,'settings','delete');
  nama=String(nama==null?'':nama).trim();
  var list=_bacaFundraising();
  var sisa=list.filter(function(n){ return n.toLowerCase()!==nama.toLowerCase(); });
  if(sisa.length===list.length) throw new Error('Nama tidak ada di daftar');
  if(!sisa.length) throw new Error('Daftar fundraising tidak boleh kosong');
  /* Transaksi lama TIDAK diubah — namanya tetap tersimpan apa adanya. */
  var dipakai=readAll(SHEETS.PENGHIMPUNAN).filter(function(r){
    return String(r.fundraising||'').trim().toLowerCase()===nama.toLowerCase(); }).length;
  _tulisFundraising(sisa);
  audit(u.id,u.username,'delete_fundraising',nama,
    {modul:'settings',entitasId:nama,ringkas:nama+(dipakai?(' (masih dipakai '+dipakai+' transaksi)'):'')});
  return {ok:true,daftar:sisa,masihDipakai:dipakai};
}

/* Berapa transaksi memakai tiap nama — untuk peringatan sebelum hapus. */
function apiPemakaianFundraising(t){
  _requirePerm(t,'settings','view');
  var pakai={};
  readAll(SHEETS.PENGHIMPUNAN).forEach(function(r){
    var n=String(r.fundraising||'').trim(); if(!n) return;
    pakai[n]=(pakai[n]||0)+1; });
  return {daftar:_bacaFundraising(),pemakaian:pakai};
}

/* ===== LAYANAN (KLL/ULL) ===== */
function apiListLayanan(t){ _requirePerm(t,'layanan','view'); return readAll(SHEETS.LAYANAN); }
function apiListLayananPublic(t){ authUser(t); return readAll(SHEETS.LAYANAN).filter(function(r){return String(r.aktif)!=='false';}); }
function apiSaveLayanan(t,d){ var baru=!d.id||!findById(SHEETS.LAYANAN,d.id); var u=_requirePerm(t,'layanan',baru?'create':'edit');
  var lama = baru ? null : findById(SHEETS.LAYANAN,d.id);
  if(!baru){ updateRowById(SHEETS.LAYANAN,d.id,d); } else { d.id=d.id||makeId(); d.dibuat=d.dibuat||new Date().toISOString(); insertRow(SHEETS.LAYANAN,d); }
  audit(u.id,u.username,(baru?'create_layanan':'edit_layanan'),d.nama||'',
    {modul:'layanan',entitasId:d.id||'',
     ringkas: baru ? ((d.tipe||'')+' '+(d.nama||'')+(d.kode?' ('+d.kode+')':'')).trim() : ringkasPerubahan(lama,d)}); return {ok:true}; }
function apiDeleteLayanan(t,id){ var u=_requirePerm(t,'layanan','delete'); var lm=findById(SHEETS.LAYANAN,id); deleteRowById(SHEETS.LAYANAN,id);
  audit(u.id,u.username,'delete_layanan',(lm&&lm.nama)||id,{modul:'layanan',entitasId:id,ringkas:lm?_layLabel(lm):''}); return {ok:true}; }

/* ===== USER MGMT ===== */
function apiListUsers(t){ _requirePerm(t,'users','view'); return readAll(SHEETS.USERS).map(sanitizeUser); }
/* ===== PENJAGA PENGELOLAAN AKUN =====
   Dulu apiSaveUser menyalin `role` dan `permissions` dari permintaan apa
   adanya, dan satu-satunya pemeriksaan adalah "punya izin users:edit?".
   Akibatnya admin kantor yang cuma diberi hak mengelola akun petugas bisa
   mengangkat dirinya sendiri jadi superadmin, mengganti sandi superadmin, atau
   mencentang izin Pengaturan untuk dirinya. Uji tools/test_eskalasi_user.js
   membuktikannya: sebelum penjaga ini ada, 19 dari 30 pemeriksaannya gagal,
   termasuk baris Users yang perannya benar-benar berubah jadi superadmin.

   Aturannya:
   - Selain superadmin, tidak ada yang boleh membuat, mengangkat, menyunting,
     atau menghapus akun superadmin.
   - Selain superadmin, orang hanya boleh MEMBERI izin yang ia sendiri punya.
     Mencabut selalu boleh. Izin lama yang tidak diubah dibiarkan, supaya
     admin tetap bisa sekadar membetulkan nama petugas yang izinnya lebih
     luas tanpa ditolak.
   - Superadmin aktif terakhir tidak boleh diturunkan atau dinonaktifkan.
     Kalau terjadi, tidak ada lagi yang bisa membuka menu Pengguna. */
function _izinObj(p){
  if (typeof p === 'string') { try { return JSON.parse(p || '{}') || {}; } catch (e) { return {}; } }
  return (p && typeof p === 'object') ? p : {};
}
/* Nilai izin dipaksa jadi boolean. can() membaca dengan !!, jadi "ya" atau 1
   dari permintaan buatan tangan akan terhitung true; kalau tidak dirapikan di
   sini, penjaga di bawah (yang memeriksa === true) bisa dilewati. */
function _izinBersih(p){
  var o = _izinObj(p), out = {};
  Object.keys(o).forEach(function(m){
    if (!o[m] || typeof o[m] !== 'object') return;
    out[m] = {};
    Object.keys(o[m]).forEach(function(a){ out[m][a] = !!o[m][a]; });
  });
  return out;
}
/* Izin yang BERLAKU pada akun lama, termasuk lewat jembatan MODUL_ASAL.
   Tanpa jembatan ini, menyimpan ulang akun lama (yang saldo-nya menumpang
   izin dashboard) dianggap "memberi izin saldo baru" dan ditolak. */
function _punyaIzinLama(lama, m, a){
  if (lama[m]) return !!lama[m][a];
  var asal = MODUL_ASAL[m];
  return !!(asal && lama[asal] && lama[asal][a]);
}
function _jagaPemberianIzin(aktor, lama, baru){
  if (aktor.role === 'superadmin') return;
  lama = _izinObj(lama);
  Object.keys(baru).forEach(function(m){
    Object.keys(baru[m]).forEach(function(a){
      if (baru[m][a] !== true) return;              /* mencabut: selalu boleh */
      if (_punyaIzinLama(lama, m, a)) return;       /* sudah ada, tidak diubah */
      if (!can(aktor, m, a)) throw new Error('IZIN: Anda tidak bisa memberi izin "' + a + '" pada modul ' + (MODUL_LABEL[m] || m) + ' karena Anda sendiri tidak memilikinya.');
    });
  });
}
function _jumlahSuperAktifLain(kecualiId){
  return readAll(SHEETS.USERS).filter(function(x){
    return x.role === 'superadmin' && String(x.aktif) === 'true' && String(x.id) !== String(kecualiId);
  }).length;
}

function apiSaveUser(t,d){ d = d || {}; var a=_requirePerm(t,'users',d.id?'edit':'create');
  var aSuper = a.role === 'superadmin';
  var izinBaru = _izinBersih(d.permissions);
  if(d.id){ var ex=findById(SHEETS.USERS,d.id); if(!ex) throw new Error('User tidak ditemukan');
    if(!aSuper && ex.role==='superadmin') throw new Error('IZIN: hanya superadmin yang boleh mengubah akun superadmin.');
    if(!aSuper && d.role==='superadmin') throw new Error('IZIN: hanya superadmin yang boleh mengangkat akun menjadi superadmin.');
    var peranBaru = d.role!==undefined ? d.role : ex.role;
    var aktifBaru = d.aktif!==undefined ? String(d.aktif) : String(ex.aktif);
    if(ex.role==='superadmin' && String(ex.aktif)==='true' && (peranBaru!=='superadmin' || aktifBaru!=='true') && _jumlahSuperAktifLain(ex.id)===0)
      throw new Error('Ini satu-satunya Superadmin aktif. Angkat superadmin lain lebih dulu sebelum menurunkan atau menonaktifkan akun ini.');
    if(d.username && String(d.username).toLowerCase()!==String(ex.username).toLowerCase()
       && readAll(SHEETS.USERS).some(function(x){ return String(x.id)!==String(ex.id) && String(x.username).toLowerCase()===String(d.username).toLowerCase(); }))
      throw new Error('Username sudah dipakai');
    _jagaPemberianIzin(a, ex.permissions, izinBaru);
    var up={nama:d.nama,role:peranBaru,permissions:JSON.stringify(izinBaru),aktif:aktifBaru}; if(d.layanan!==undefined) up.layanan=(peranBaru==='superadmin')?'':String(d.layanan||'').trim(); if(d.username)up.username=d.username; if(d.password){_periksaSandi(d.password);var s=makeId();up.salt=s;up.passwordHash=hashPassword(d.password,s);} var lamaU=findById(SHEETS.USERS,d.id); updateRowById(SHEETS.USERS,d.id,up);
    /* Ganti sandi ATAU dinonaktifkan: semua sesi dan token "Ingat saya" milik
       akun itu dimatikan saat itu juga. Menyunting akun yang tetap aktif tanpa
       ganti sandi sengaja tidak menendang pemiliknya keluar. */
    if(d.password || aktifBaru!=='true') _matikanSesiLain(d.id, null);
    audit(a.id,a.username,'edit_user',d.username||d.id,{modul:'users',entitasId:d.id,
      ringkas:ringkasPerubahan(lamaU,up)+(d.password?(ringkasPerubahan(lamaU,up)?' | ':'')+'password diganti':'')}); }
  else { if(!aSuper && d.role==='superadmin') throw new Error('IZIN: hanya superadmin yang boleh membuat akun superadmin.');
    _jagaPemberianIzin(a, {}, izinBaru);
    if(readAll(SHEETS.USERS).some(function(x){return String(x.username).toLowerCase()===String(d.username).toLowerCase();})) throw new Error('Username sudah dipakai'); if(!d.password) throw new Error('Sandi wajib diisi untuk pengguna baru.'); _periksaSandi(d.password); var s2=makeId(); insertRow(SHEETS.USERS,{id:makeId(),username:d.username,passwordHash:hashPassword(d.password,s2),salt:s2,nama:d.nama,role:d.role||'staff',permissions:JSON.stringify(izinBaru),aktif:d.aktif!==undefined?String(d.aktif):'true',dibuat:new Date().toISOString(),layanan:(d.role==='superadmin')?'':String(d.layanan||'').trim()}); audit(a.id,a.username,'create_user',d.username,{modul:'users',ringkas:(d.nama||'')+' · peran '+(d.role||'staff')}); }
  return {ok:true}; }
function apiDeleteUser(t,id){ var a=_requirePerm(t,'users','delete'); var tg=findById(SHEETS.USERS,id); if(tg&&tg.role==='superadmin'){ if(a.role!=='superadmin') throw new Error('IZIN: hanya superadmin yang boleh menghapus akun superadmin.'); var sup=readAll(SHEETS.USERS).filter(function(x){return x.role==='superadmin'&&String(x.aktif)==='true';}); if(sup.length<=1) throw new Error('Tidak bisa menghapus satu-satunya Superadmin.'); } deleteRowById(SHEETS.USERS,id); _matikanSesiLain(id, null); audit(a.id,a.username,'delete_user',(tg&&tg.username)||id,{modul:'users',entitasId:id,ringkas:tg?((tg.nama||'')+' · peran '+(tg.role||'')):''}); return {ok:true}; }
/* Setelah sandi diganti, semua sesi lain milik pengguna itu dimatikan —
   kalau sandi diganti karena dicurigai bocor, pemegang sesi lama ikut keluar. */
function _matikanSesiLain(userId, kecualiToken){
  (readAll(SHEETS.SESSIONS) || []).forEach(function(s){
    var dikecualikan = kecualiToken && (s.token === kecualiToken || s.token === _hashSesi(kecualiToken));
    if (String(s.userId) === String(userId) && !dikecualikan) deleteRowBy(SHEETS.SESSIONS, 'token', s.token);
  });
}
function apiChangeMyPassword(t,o,n){ var u=authUser(t); if(hashPassword(o,u.salt)!==u.passwordHash) throw new Error('Password lama salah'); _periksaSandi(n); var s=makeId(); updateRowById(SHEETS.USERS,u.id,{salt:s,passwordHash:hashPassword(n,s)}); _matikanSesiLain(u.id, t); audit(u.id,u.username,'ganti_sandi','',{modul:'sesi',ringkas:'sesi lain dimatikan'}); return {ok:true}; }

function apiUpdateMyProfile(t,d){
  var u=authUser(t);
  var up={};
  if(d.nama) up.nama=String(d.nama).trim();
  if(d.newPassword){ if(hashPassword(d.oldPassword||'',u.salt)!==u.passwordHash) throw new Error('Password lama salah'); var s=makeId(); up.salt=s; up.passwordHash=hashPassword(d.newPassword,s); }
  if(Object.keys(up).length) updateRowById(SHEETS.USERS,u.id,up);
  if(d.foto!==undefined){ if((''+d.foto).length>48000) throw new Error('Ukuran foto terlalu besar'); setSetting('uf_'+u.id, d.foto); }
  /* Urutan menu kiri milik akun ini sendiri (permintaan pemilik 1 Oktober
     2026). Disimpan sebagai Settings um_<id> yang dikirim ke peramban, jadi
     isinya dijaga ketat: hanya daftar id menu berhuruf kecil. Tanpa saringan
     ini, siapa pun yang login bisa menitipkan teks sembarang ke Settings yang
     dibaca peramban semua orang. Daftar kosong = kembali ke urutan bawaan. */
  if(d.urutanMenu!==undefined){
    var um=d.urutanMenu;
    if(!Array.isArray(um) || um.length>40 || um.some(function(x){ return typeof x!=='string' || !/^[a-z]{1,24}$/.test(x); }))
      throw new Error('Urutan menu tidak sah.');
    var unik=[]; um.forEach(function(x){ if(unik.indexOf(x)<0) unik.push(x); });
    setSetting('um_'+u.id, unik.length ? JSON.stringify(unik) : '');
  }
  return {ok:true};
}

/* ===== SETTINGS ===== */
function apiGetSettings(t){ _requirePerm(t,'settings','view'); return _settingsAman(getAllSettings(), true); }
function apiSaveSettings(t,d){
  var u=_requirePerm(t,'settings','edit');
  d = d || {};
  var terlarang = Object.keys(d).filter(_kunciSistem);
  if (terlarang.length) throw new Error('IZIN: pengaturan ' + terlarang.join(', ') + ' hanya diubah oleh sistem lewat menunya sendiri.');
  var lama=getAllSettings();
  Object.keys(d).forEach(function(k){setSetting(k,d[k]);});
  audit(u.id,u.username,'edit_settings',Object.keys(d).join(', '),
    {modul:'settings',ringkas:ringkasPerubahan(lama,d)});
  return _settingsAman(getAllSettings(), true);
}
/* Menyalakan, membuat ulang, dan mematikan tautan publik mengubah apa yang
   bisa dilihat orang luar, jadi butuh izin ubah Pengaturan. Dulu izin lihat
   Dashboard saja sudah cukup (tools/test_keamanan_lanjutan.js bagian A).
   Melihat tautannya untuk dibagikan tetap cukup dengan izin Dashboard. */
function apiGeneratePublicLink(t){ _requirePerm(t,'settings','edit'); var x=Utilities.getUuid().replace(/-/g,''); setSetting('publicToken',x); setSetting('publicEnabled','true'); return {token:x,url:getWebAppUrl()+'?page=public&token='+x}; }
function apiDisablePublicLink(t){ _requirePerm(t,'settings','edit'); setSetting('publicEnabled','false'); return {ok:true}; }
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

  /* `filterHari` boleh berupa satu tanggal (seperti dulu) atau {dari, sampai}.
     Rentang tanggal berdiri sendiri: bila diisi, ia yang menentukan dan
     pilihan bulan/pekan tidak ikut menyempitkan. Versi lama hanya menerapkan
     saringan tanggal saat bulan juga dipilih, sehingga memilih tanggal saja
     tidak berpengaruh apa-apa. */
  var rDari = '', rSampai = '';
  if (filterHari && typeof filterHari === 'object'){
    rDari   = String(filterHari.dari   || '').slice(0,10);
    rSampai = String(filterHari.sampai || '').slice(0,10);
  }
  var pakaiRentang = !!(rDari && rSampai);
  if (pakaiRentang && rDari > rSampai){ var _tk = rDari; rDari = rSampai; rSampai = _tk; }

  if (pakaiRentang) {
    filterPrefix = null;
    H = H_all.filter(function(r) { return _dalamRentang(r.tanggal, rDari, rSampai); });
    T = T_all.filter(function(r) { return _dalamRentang(r.tanggal, rDari, rSampai); });
  } else if (filterPrefix) {
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

  /* Setor tunai = perpindahan kas -> bank, BUKAN penghimpunan. Data lama yang
     terlanjur menyimpannya dikecualikan dari seluruh hitungan dashboard. */
  H = H.filter(function(r){ return !_isSetorTunaiHimpun(r); });

  var tH = 0, tT = 0, byJenis = {}, byFundraising = {}, byAshnaf = {}, byBank = {}, byPilar = {};
  var byProgramSalur = {};   /* penyaluran dikelompokkan per program/kegiatan */
  
  var layMap = {};
  var layList = [];
  try {
    layList = readAll(SHEETS.LAYANAN) || [];
    layList.forEach(function(l) {
      if (l && l.id) layMap[l.id] = l;
    });
  } catch (e) {}

  var byLayananHimpun = {};
  var byLayananSalur = {};
  var laySum = { layanan: 0, daerah: 0, layananCount: 0, daerahCount: 0 };
  
  layList.forEach(function(l) {
    if (l && l.nama && String(l.aktif) !== 'false') {
      var name = (l.tipe ? l.tipe + ' ' : '') + l.nama;
      byLayananHimpun[name] = 0;
      byLayananSalur[name] = 0;
    }
  });
  byLayananHimpun[LAYANAN_DAERAH] = 0;
  byLayananSalur[LAYANAN_DAERAH] = 0;

  /* Rincian tiap kantor/unit layanan: penghimpunan dipecah per pilar,
     pentasyarufan per program. Hanya angka gabungan — nama donatur maupun
     mustahik tidak ikut, supaya aman dipakai halaman publik. */
  var detailLayanan = {};
  function _dlSlot(key){
    if(!detailLayanan[key]) detailLayanan[key] = {
      himpun:{ total:0, n:0, rinci:{} },
      tasyaruf:{ total:0, n:0, rinci:{} }
    };
    return detailLayanan[key];
  }
  /* Label pilar penghimpunan: pilar -> sub jenis -> jenis dana. */
  function _pilarHimpun(r){
    if (r.pilar && String(r.pilar).trim()) return String(r.pilar).trim();
    var sub = String(r.subJenis || '').trim();
    if (sub) return sub;
    return String(r.jenisDana || 'Lainnya').trim();
  }

  H.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    tH += n;
    byJenis[r.jenisDana || 'Lainnya'] = (byJenis[r.jenisDana || 'Lainnya'] || 0) + n;
    
    // Rekap KLL/ULL — tunai maupun non tunai; tanpa penanda -> Penghimpunan Daerah
    var finalKey = resolveLayananName(r, layList, layMap);
    byLayananHimpun[finalKey] = (byLayananHimpun[finalKey] || 0) + n;
    if (finalKey === LAYANAN_DAERAH) { laySum.daerah += n; laySum.daerahCount++; }
    else { laySum.layanan += n; laySum.layananCount++; }

    var slotH = _dlSlot(finalKey);
    slotH.himpun.total += n; slotH.himpun.n++;
    var pKey = _pilarHimpun(r);
    slotH.himpun.rinci[pKey] = (slotH.himpun.rinci[pKey] || 0) + n;
    
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
    var progT = String(r.program || '').trim() || 'Lainnya';
    byProgramSalur[progT] = (byProgramSalur[progT] || 0) + n;
    
    // Grouping Fundraising untuk Pentasyarufan
    var frNameT = cleanFundraisingName(r.fundraising);
    byFundraising[frNameT] = (byFundraising[frNameT] || 0) + n;

    // Rekap KLL/ULL untuk pentasyarufan — aturan pencocokan sama persis
    var finalKey = resolveLayananName(r, layList, layMap);
    byLayananSalur[finalKey] = (byLayananSalur[finalKey] || 0) + n;

    var slotT = _dlSlot(finalKey);
    slotT.tasyaruf.total += n; slotT.tasyaruf.n++;
    var sKey = String(r.program || '').trim() || String(r.ashnaf || '').trim() || 'Lainnya';
    slotT.tasyaruf.rinci[sKey] = (slotT.tasyaruf.rinci[sKey] || 0) + n;
  });
  
  // Calculate byRekening (Saldo per Rekening)
  var byRekening = {};

  // Label untuk transaksi non-tunai yang rekeningnya tidak terisi / tidak dikenal.
  // Tanpa ini, uang masuk via bank bisa hilang dari dashboard.
  function _labelRekLepas(r) {
    var b = String(r.bank || '').trim();
    if (b) return b;
    var m = String(r.metode || '').trim();
    if (/qris/i.test(m)) return 'QRIS (rekening belum dipilih)';
    if (/wallet|e-?wallet/i.test(m)) return 'E-Wallet (rekening belum dipilih)';
    return 'Transfer Bank (rekening belum dipilih)';
  }

  // Cocokkan label bebas ke rekening terdaftar. Nomor kosong TIDAK boleh dianggap cocok
  // (bug lama: ''.indexOf() mengembalikan 0 sehingga semua label ikut tercocokkan).
  function _cariRekMirip(peta, label) {
    var hit = null;
    var lab = String(label || '');
    Object.keys(peta).forEach(function(k) {
      if (hit) return;
      var rek = peta[k];
      if (rek.nama === lab) { hit = k; return; }
      var no = String(rek.nomor || '').trim();
      if (no && lab.indexOf(no) >= 0) { hit = k; return; }
      var nb = String(rek.nama || '').split(' - ')[0].trim();
      if (nb && lab.trim().toLowerCase() === nb.toLowerCase()) { hit = k; }
    });
    return hit;
  }

  var listRek = readAll(SHEETS.REKENING) || [];
  
  // 1. Initialize active bank accounts
  listRek.forEach(function(r) {
    if (String(r.aktif) !== 'false') {
      var label = r.namaBank + ' - ' + r.nomor;
      var grp = getBankGroupName(r.namaBank);
      byRekening[r.id] = { id: r.id, nama: label, nomor: r.nomor, bankGroup: grp, penerimaan: 0, pentasyarufan: 0, saldo: 0, trx: 0 };
    }
  });
  
  // 2. Aggregate Penghimpunan (Receipts) - Only bank/transfer transactions go to byRekening
  H.forEach(function(r) {
    var n = Number(r.jumlah) || 0;
    var method = String(r.metode || '').toLowerCase();
    var isCash = !(method.indexOf('transfer') >= 0 || method.indexOf('bank') >= 0 || method.indexOf('debit') >= 0 || method.indexOf('wallet') >= 0 || method.indexOf('qris') >= 0);

    if (!isCash && r.rekeningId && byRekening[r.rekeningId]) {
      byRekening[r.rekeningId].penerimaan += n; byRekening[r.rekeningId].trx = (byRekening[r.rekeningId].trx || 0) + 1;
      byRekening[r.rekeningId].saldo += n;
    } else if (!isCash) {
      // Transaksi non-tunai tanpa rekeningId yang cocok tetap WAJIB masuk hitungan.
      // Sebelumnya baris seperti ini hilang total dari dashboard (hanya kas yang terbaca).
      var label = _labelRekLepas(r);
      var grp = getBankGroupName(label);
      var matchedId = _cariRekMirip(byRekening, label);
      if (matchedId) {
        byRekening[matchedId].penerimaan += n; byRekening[matchedId].trx = (byRekening[matchedId].trx || 0) + 1;
        byRekening[matchedId].saldo += n;
      } else {
        if (!byRekening[label]) {
          byRekening[label] = { id: label, nama: label, nomor: '', bankGroup: grp, penerimaan: 0, pentasyarufan: 0, saldo: 0, trx: 0, lepas: true };
        }
        byRekening[label].penerimaan += n; byRekening[label].trx = (byRekening[label].trx || 0) + 1;
        byRekening[label].saldo += n;
      }
    }
    // Cash transactions are tracked in byBank but NOT in byRekening
  });

  // 3. Aggregate Pentasyarufan (Expenditures) - Only bank/transfer transactions
  T.forEach(function(r) {
    /* LPJ uang muka = pertanggungjawaban, uangnya sudah keluar saat uang muka
       diberikan; bukan pergerakan rekening, jadi tidak masuk daftar rekening. */
    if (/^UMP\s+LPJ/i.test(String(r.section || ''))) return;
    var n = Number(r.jumlah) || 0;
    var method = String(r.metode || '').toLowerCase();
    var isCash = !(method.indexOf('transfer') >= 0 || method.indexOf('bank') >= 0 || method.indexOf('debit') >= 0 || method.indexOf('wallet') >= 0 || method.indexOf('qris') >= 0);

    if (!isCash && r.rekeningId && byRekening[r.rekeningId]) {
      byRekening[r.rekeningId].pentasyarufan += n; byRekening[r.rekeningId].trx = (byRekening[r.rekeningId].trx || 0) + 1;
      byRekening[r.rekeningId].saldo -= n;
    } else if (!isCash) {
      var label = _labelRekLepas(r);
      var grp = getBankGroupName(label);
      var matchedId = _cariRekMirip(byRekening, label);
      if (matchedId) {
        byRekening[matchedId].pentasyarufan += n; byRekening[matchedId].trx = (byRekening[matchedId].trx || 0) + 1;
        byRekening[matchedId].saldo -= n;
      } else {
        if (!byRekening[label]) {
          byRekening[label] = { id: label, nama: label, nomor: '', bankGroup: grp, penerimaan: 0, pentasyarufan: 0, saldo: 0, trx: 0, lepas: true };
        }
        byRekening[label].pentasyarufan += n; byRekening[label].trx = (byRekening[label].trx || 0) + 1;
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
  
  /* Saldo berjalan sampai AKHIR periode yang dipilih (bukan selisih arus
     periode itu saja): saldo awal tahun + semua pergerakan sejak 1 Januari. */
  var _sampaiSaldo = '';
  if (rSampai) _sampaiSaldo = rSampai;
  else if (filterHari && typeof filterHari === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(filterHari)) _sampaiSaldo = filterHari;
  else if (filterPrefix && /^\d{4}-\d{2}$/.test(filterPrefix)) _sampaiSaldo = _akhirBulan(filterPrefix);
  else _sampaiSaldo = _hariIni();
  if (_sampaiSaldo > _hariIni()) _sampaiSaldo = _hariIni();
  var saldoPosisi = hitungSaldo(_sampaiSaldo);

  return {
    totalHimpun: tH,
    totalTasyaruf: tT,
    saldo: saldoPosisi.totalKasBank,
    arusBersih: tH - tT,
    saldoPosisi: saldoPosisi,
    jumlahDonatur: uniq(H, 'namaDonatur'),
    jumlahMustahik: uniq(T, 'namaPenerima'),
    transaksiHimpun: H.length,
    transaksiTasyaruf: T.length,
    byJenis: byJenis,
    byLayananHimpun: byLayananHimpun,
    byLayananSalur: byLayananSalur,
    detailLayanan: detailLayanan,
    layananSummary: laySum,
    byLayanan: byLayananHimpun, // backward compatibility
    byFundraising: byFundraising,
    byAshnaf: byAshnaf,
    byBank: byBank,
    byPilar: byPilar,
    byProgram: byProgramSalur,
    byRekening: byRekening,
    series: series,
    availableMonths: availableMonths,
    selectedMonth: filterMonth || 'Semua',
    recentHimpun: H.slice().sort(function(a, b) {
      var tA = String(a.tanggal || ''), tB = String(b.tanggal || '');
      if (tA !== tB) return tB.localeCompare(tA);
      return new Date(b.dibuat || 0) - new Date(a.dibuat || 0);
    }).slice(0, 15),
    recentTasyaruf: T.slice().sort(function(a, b) {
      var tA = String(a.tanggal || ''), tB = String(b.tanggal || '');
      if (tA !== tB) return tB.localeCompare(tA);
      return new Date(b.dibuat || 0) - new Date(a.dibuat || 0);
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
    selectedPekan: pakaiRentang ? 'Semua' : (filterPekan || 'Semua'),
    selectedHari: (filterHari && typeof filterHari === 'object') ? 'Semua' : (filterHari || 'Semua'),
    selectedRentang: pakaiRentang ? { dari: rDari, sampai: rSampai } : null,
    labelRentang: pakaiRentang ? _labelRentang(rDari, rSampai) : '',
    settings: getAllSettings()
  };
}
function mk(d){try{return Utilities.formatDate(new Date(d),TZ,'yyyy-MM');}catch(e){return 'NA';}}
function uniq(rows,k){var s={};rows.forEach(function(r){if(r[k])s[String(r[k]).toLowerCase()]=1;});return Object.keys(s).length;}
function apiDashboard(t, filterMonth, filterPekan, filterHari){ _requirePerm(t,'dashboard','view'); return buildDashboard(filterMonth, filterPekan, filterHari); }
/* Halaman publik: hanya angka ringkasan, tanpa identitas siapa pun.
   `bulan` boleh diisi 'YYYY-MM' untuk melihat satu periode, atau kosong
   / 'Semua' untuk akumulasi sejak awal pencatatan. */
function apiPublicDashboard(t, bulan){
  if(getSetting('publicEnabled')!=='true') throw new Error('Dashboard publik dinonaktifkan.');
  if(t!==getSetting('publicToken')) throw new Error('Token tidak valid.');
  var pilih = (bulan && /^\d{4}-\d{2}$/.test(String(bulan))) ? String(bulan) : 'Semua';
  var d = buildDashboard(pilih);
  d.recentHimpun = (d.recentHimpun||[]).map(function(r){return {tanggal:r.tanggal,program:r.program,jenisDana:r.jenisDana,jumlah:r.jumlah};});
  d.recentTasyaruf = (d.recentTasyaruf||[]).map(function(r){return {tanggal:r.tanggal,program:r.program,ashnaf:r.ashnaf,jumlah:r.jumlah};});
  /* Pengaturan disaring: token publik dan data internal lain tidak ikut terkirim
     ke peramban pengunjung. */
  var s = d.settings || {};
  d.settings = {
    namaLembaga: s.namaLembaga||'', singkatan: s.singkatan||'', alamat: s.alamat||'',
    telepon: s.telepon||'', email: s.email||'', website: s.website||'', logoData: s.logoData||s.logoUrl||''
  };
  d.periodeDipilih = pilih;
  return d;
}

/* ============================================================
   LINK PENGHIMPUNAN HARIAN (pemilik, 2 Oktober 2026)
   ------------------------------------------------------------
   Dua link baca-saja, terpisah dari Dashboard Publik:
   - donatur: semua penghimpunan satu hari, dengan nama donatur, nominal,
     jenis dana, fundraiser, dan metode. Setoran KLL/ULL diberi tanda
     kantornya. Nama lengkap, kecuali yang memang anonim.
   - kantor : hanya setoran KLL/ULL, untuk semua kantor dalam satu link,
     plus ringkasan per kantor hari ini dan bulan berjalan.
   Yang dikirim ke pengunjung dipilih satu per satu (daftar izin, bukan
   daftar larangan): telepon, email, alamat, keterangan, kwitansi, rekening,
   dan petugas tidak pernah ikut, termasuk kalau kelak ada kolom baru.
   ============================================================ */
var _LH_KUNCI = { donatur: 'lhTokenDonatur', kantor: 'lhTokenKantor' };
function _lhInfo(jenis){ var x = getSetting(_LH_KUNCI[jenis]) || ''; return { jenis: jenis, aktif: !!x, token: x }; }
function _lhJenisSah(jenis){ if (!_LH_KUNCI[jenis]) throw new Error('Jenis link tidak dikenal.'); return jenis; }
function apiInfoLinkHarian(t){ _requirePerm(t, 'dashboard', 'view'); return { donatur: _lhInfo('donatur'), kantor: _lhInfo('kantor') }; }
function apiBuatLinkHarian(t, jenis){
  var u = _requirePerm(t, 'settings', 'edit'); _lhJenisSah(jenis);
  setSetting(_LH_KUNCI[jenis], Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  audit(u.id, u.username, 'link_harian_buat', jenis, { modul: 'settings', ringkas: 'link penghimpunan harian ' + jenis + ' dibuat ulang' });
  return _lhInfo(jenis);
}
function apiMatikanLinkHarian(t, jenis){
  var u = _requirePerm(t, 'settings', 'edit'); _lhJenisSah(jenis);
  setSetting(_LH_KUNCI[jenis], '');
  audit(u.id, u.username, 'link_harian_matikan', jenis, { modul: 'settings', ringkas: 'link penghimpunan harian ' + jenis + ' dimatikan' });
  return _lhInfo(jenis);
}
/* "Hamba Allah", "NN", "anonim", kosong: donatur yang memang tidak mau
   namanya tampil. Semua bentuk itu ditampilkan seragam. */
function _lhNama(n){
  var s = String(n == null ? '' : n).trim();
  if (!s || /^(hamba\s*allah|h\.?\s*a\.?|n\.?\s*n\.?|anonim|anonymous|tanpa\s*nama|-+)$/i.test(s)) return 'Hamba Allah';
  return s;
}
function apiPenghimpunanHarian(token, tanggal){
  token = String(token == null ? '' : token);
  var jenis = '';
  if (token.length >= 24) {
    if (token === getSetting('lhTokenDonatur')) jenis = 'donatur';
    else if (token === getSetting('lhTokenKantor')) jenis = 'kantor';
  }
  if (!jenis) throw new Error('Link tidak valid atau sudah dimatikan.');
  var hari = _hariIni();
  var tgl = String(tanggal == null ? '' : tanggal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl) || isNaN(new Date(tgl + 'T00:00:00Z').getTime()) || tgl > hari) tgl = hari;
  var bulan = tgl.slice(0, 7);

  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; });
  var tipeDari = function(nama){
    if (nama === LAYANAN_DAERAH) return 'Daerah';
    return /^ull\b/i.test(nama) ? 'ULL' : 'KLL';
  };
  var ringkas = { total: 0, n: 0, perMetode: {}, perDana: {} };
  var bulanIni = { total: 0, n: 0 };
  var perKantor = {};
  if (jenis === 'kantor') layList.forEach(function(l){
    if (String(l.aktif) === 'false') return;
    var nm = _layLabel(l);
    perKantor[_norm(nm)] = { kantor: nm, tipe: tipeDari(nm), hariIni: 0, bulanIni: 0, n: 0 };
  });
  var baris = [];
  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    var tg = String(r.tanggal == null ? '' : r.tanggal).slice(0, 10);
    if (tg.slice(0, 7) !== bulan || tg > tgl) return;
    if (/batal|belum/i.test(String(r.statusBayar || ''))) return;
    var n = Number(r.jumlah) || 0;
    var kantor = resolveLayananName(r, layList, layMap);
    var tipe = tipeDari(kantor);
    if (jenis === 'kantor' && tipe === 'Daerah') return;
    bulanIni.total += n; bulanIni.n++;
    var kk = _norm(kantor);
    if (jenis === 'kantor') {
      var pk = perKantor[kk] || (perKantor[kk] = { kantor: kantor, tipe: tipe, hariIni: 0, bulanIni: 0, n: 0 });
      pk.bulanIni += n;
      if (tg === tgl) { pk.hariIni += n; pk.n++; }
    }
    if (tg !== tgl) return;
    var metode = String(r.metode || '').trim() || 'Lainnya';
    var dana = String(r.subJenis || r.jenisDana || '').trim();
    ringkas.total += n; ringkas.n++;
    ringkas.perMetode[metode] = (ringkas.perMetode[metode] || 0) + n;
    var dk = String(r.jenisDana || 'Lainnya').trim() || 'Lainnya';
    ringkas.perDana[dk] = (ringkas.perDana[dk] || 0) + n;
    /* Jam hanya kalau dicatat pada hari yang sama; baris hasil impor jurnal
       dibuat belakangan, jadi jamnya bukan jam donasi. */
    var jam = '';
    var dib = r.dibuat ? new Date(r.dibuat) : null;
    if (dib && !isNaN(dib.getTime())) {
      var w = new Date(dib.getTime() + 7 * 3600e3).toISOString();
      if (w.slice(0, 10) === tg) jam = w.slice(11, 16);
    }
    baris.push({
      nama: _lhNama(r.namaDonatur), jumlah: n, dana: dana, pilar: String(r.pilar || ''),
      fundraising: String(r.fundraising || '').trim(), metode: metode,
      kantor: tipe === 'Daerah' ? '' : kantor, tipe: tipe, jam: jam, urut: r.dibuat ? String(r.dibuat) : ''
    });
  });
  baris.sort(function(a, b){ return (b.urut || '').localeCompare(a.urut || ''); });
  baris = baris.slice(0, 1000).map(function(x){ delete x.urut; return x; });
  var s = getAllSettings();
  var out = {
    jenis: jenis, tanggal: tgl, hariIni: hari, bulan: bulanIni, ringkas: ringkas, baris: baris,
    lembaga: { namaLembaga: s.namaLembaga || '', singkatan: s.singkatan || '', telepon: s.telepon || '', website: s.website || '', logoData: s.logoData || s.logoUrl || '' },
    diperbarui: new Date().toISOString()
  };
  if (jenis === 'kantor') out.perKantor = Object.keys(perKantor).map(function(k){ return perKantor[k]; })
    .sort(function(a, b){ return b.hariIni - a.hariIni || b.bulanIni - a.bulanIni || (a.kantor < b.kantor ? -1 : 1); });
  return out;
}

/* ============================================================
   SALDO BERJALAN — per akun (rekening bank & kas), per dana, uang muka
   ------------------------------------------------------------
   Saldo per akun  = saldo awal tahun + masuk - keluar (sampai tanggal T)
     masuk : penghimpunan ke akun itu, transfer masuk, pengembalian UMP
     keluar: penyaluran dari akun itu (kecuali LPJ — LPJ bukan uang keluar,
             uangnya sudah keluar saat UMP diberikan), transfer keluar, UMP keluar
   Saldo per dana  = jumlah akun-akun milik dana itu + uang muka belum LPJ
   Uang muka (UMP) = awal tahun + keluar - LPJ - kembali
   Identitas yang selalu berlaku: saldo dana = saldo kas & bank + UMP.
   ============================================================ */
var KAS_DANA = ['Zakat','Infak','Amil'];
function _danaKas(jenisDana){
  var j = String(jenisDana || '').toLowerCase();
  if (j === 'zakat') return 'Zakat';
  if (j === 'amil')  return 'Amil';
  return 'Infak';                       /* infak, sedekah, wakaf, kurban, fidyah, dskl */
}
function _danaRekening(fundGroup){
  var f = String(fundGroup || '').toLowerCase();
  if (f === 'zakat') return 'Zakat';
  if (f === 'amil')  return 'Amil';
  if (f === 'dskl')  return 'DSKL';
  return 'Infak';                       /* infak, sedekah, wakaf, kurban, umum */
}
/* Semua akun kas: rekening bank terdaftar + tiga kas tunai. */
function daftarAkunKas(){
  var out = [];
  (readAll(SHEETS.REKENING) || []).forEach(function(r){
    if (String(r.aktif) === 'false') return;
    out.push({ kode:'rek:' + r.id, jenis:'rekening', rekeningId:r.id, kasNama:'', dana:_danaRekening(r.fundGroup),
      label:(r.namaBank || '') + ' - ' + (r.nomor || ''), nomor:String(r.nomor || '') });
  });
  KAS_DANA.forEach(function(d){ out.push({ kode:'kas:' + d, jenis:'kas', rekeningId:'', kasNama:'Kas ' + d, dana:d, label:'Kas ' + d, nomor:'' }); });
  return out;
}
/* Kenali label akun dari jurnal ("BPD DIY Syariah - 803211000510", "Kas Infak"). */
function akunDariLabel(label, listRek){
  var t = String(label || '').trim();
  /* "Kas Zakat/Infak/Amil" dan turunannya ("Kas Kemanusiaan" = kas infak
     terikat kemanusiaan) sama-sama kas dana; dananya ditentukan dari namanya. */
  var mk = t.match(/^kas\s+(.+)$/i);
  if (mk) { var d = _danaKas(mk[1]); return { rekeningId:'', kasNama:'Kas ' + d, dana:d, label:'Kas ' + d, dikenal:true }; }
  var m = t.match(/(\d{6,})\s*$/);
  var num = m ? m[1].replace(/^0+/, '') : '';
  var hit = null;
  (listRek || []).forEach(function(x){
    if (hit) return;
    var dbNo = String(x.nomor || '').replace(/\D/g,'').replace(/^0+/,'');
    if (num && dbNo && dbNo === num) hit = x;
  });
  if (!hit && t) (listRek || []).forEach(function(x){
    if (hit) return;
    var nm = String(x.namaBank || '').toLowerCase();
    if (nm && t.toLowerCase().indexOf(nm) === 0 && !/\d{6,}/.test(t)) hit = x;
  });
  if (hit) return { rekeningId:hit.id, kasNama:'', dana:_danaRekening(hit.fundGroup), label:(hit.namaBank||'') + ' - ' + (hit.nomor||''), dikenal:true };
  /* Persediaan barang, piutang, dan aktiva bukan rekening yang perlu didaftarkan:
     dikenali sebagai akun bukan-uang supaya tidak dilaporkan sebagai akun asing. */
  if (_akunNonKas(t)) return { rekeningId:'', kasNama:'', dana:'', label:t, dikenal:true, nonKas:true };
  return { rekeningId:'', kasNama:'', dana:'', label:t, dikenal:false };
}
function _kodeAkun(rekeningId, kasNama){ if (rekeningId) return 'rek:' + rekeningId; if (kasNama) return 'kas:' + _danaKas(String(kasNama).replace(/^kas\s+/i,'')); return ''; }
function _akhirBulan(ym){ var p = String(ym).split('-'); var d = new Date(Number(p[0]), Number(p[1]), 0); return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2); }
function _hariIni(){ var d = new Date(Date.now() + 7*3600*1000); return d.toISOString().slice(0,10); }

/* Nama kantor layanan disatukan walau ejaannya beda huruf besar/kecil
   ("KLL SDUA Bantul" dan "KLL Sdua Bantul" adalah kantor yang sama). */
function _kunciLayanan(nama){
  var n = String(nama || '').replace(/\s+/g, ' ').trim();
  return { k: n.toLowerCase(), nama: n };
}
function hitungSaldo(sampai){
  sampai = (sampai && /^\d{4}-\d{2}-\d{2}$/.test(String(sampai))) ? String(sampai) : _hariIni();
  var tahun = sampai.slice(0,4), awalTahun = tahun + '-01-01';
  var dalam = function(t){ t = String(t || '').slice(0,10); return t >= awalTahun && t <= sampai; };

  var akun = {};
  daftarAkunKas().forEach(function(a){ akun[a.kode] = { kode:a.kode, jenis:a.jenis, label:a.label, dana:a.dana, rekeningId:a.rekeningId, kasNama:a.kasNama, awal:0, masuk:0, keluar:0, saldo:0 }; });
  /* akun yang muncul di data tapi tidak terdaftar (rekening nonaktif / tak dikenal) */
  function slot(kode, label, dana){
    if (!kode) kode = 'lain:' + (label || '?');
    if (!akun[kode]) akun[kode] = { kode:kode, jenis:'lain', label:label || kode, dana:dana || '', rekeningId:'', kasNama:'', awal:0, masuk:0, keluar:0, saldo:0, tidakTerdaftar:true };
    return akun[kode];
  }

  var ump = {}; KAS_DANA.forEach(function(d){ ump[d] = { awal:0, keluar:0, lpj:0, kembali:0, sisa:0 }; });
  var umpLay = {};
  var adaSaldoAwal = false;

  /* saldo awal tahun */
  (readAll(SHEETS.SALDOAWAL) || []).forEach(function(r){
    if (String(r.tahun) !== tahun) return;
    var n = Number(r.nominal) || 0;
    adaSaldoAwal = true;
    if (r.jenis === 'ump') { var d = _danaKas(r.dana); ump[d].awal += n; return; }
    var a = slot(_kodeAkun(r.rekeningId, r.kasNama) || ('lain:' + r.akun), r.akun, r.dana);
    a.awal += n;
  });

  /* penghimpunan -> masuk ke rekening / kas dana */
  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    if (!dalam(r.tanggal)) return;
    /* donasi barang (masuk ke persediaan) bukan uang masuk */
    if (!r.rekeningId && _akunNonKas(r.bank)) return;
    var n = Number(r.jumlah) || 0;
    var kode = r.rekeningId ? ('rek:' + r.rekeningId) : ('kas:' + _danaKas(r.jenisDana));
    slot(kode, r.bank || ('Kas ' + _danaKas(r.jenisDana)), _danaKas(r.jenisDana)).masuk += n;
  });
  /* pentasyarufan -> keluar dari rekening / kas dana; LPJ bukan uang keluar */
  (readAll(SHEETS.PENTASYARUFAN) || []).forEach(function(r){
    if (!dalam(r.tanggal)) return;
    var n = Number(r.jumlah) || 0;
    var dana = _danaKas(r.sumberDana);
    if (/^UMP\s+LPJ/i.test(String(r.section || ''))) {
      ump[dana].lpj += n;
      var lay = _kunciLayanan(String(r.namaPenerima || '').trim() || 'Lainnya');
      umpLay[lay.k] = umpLay[lay.k] || { layanan:lay.nama, dana:dana, keluar:0, lpj:0, kembali:0 };
      umpLay[lay.k].lpj += n;
      return;
    }
    /* penyaluran berupa barang mengurangi persediaan, bukan kas */
    if (!r.rekeningId && _akunNonKas(r.bank)) return;
    var kode = r.rekeningId ? ('rek:' + r.rekeningId) : ('kas:' + dana);
    slot(kode, r.bank || ('Kas ' + dana), dana).keluar += n;
  });
  /* uang muka */
  (readAll(SHEETS.UANGMUKA) || []).forEach(function(r){
    if (!dalam(r.tanggal)) return;
    var n = Number(r.nominal) || 0, d = _danaKas(r.dana);
    if (!r.rekeningId && _akunNonKas(r.akun || r.kasNama)) return;
    var kode = _kodeAkun(r.rekeningId, r.kasNama);
    var a = slot(kode, r.akun, d);
    var lay = _kunciLayanan(String(r.layanan || '').trim() || 'Lainnya');
    umpLay[lay.k] = umpLay[lay.k] || { layanan:lay.nama, dana:d, keluar:0, lpj:0, kembali:0 };
    if (r.jenis === 'kembali') { a.masuk += n; ump[d].kembali += n; umpLay[lay.k].kembali += n; }
    else { a.keluar += n; ump[d].keluar += n; umpLay[lay.k].keluar += n; }
  });
  /* transfer antar akun */
  var transferTotal = 0;
  (readAll(SHEETS.TRANSFER) || []).forEach(function(r){
    if (!dalam(r.tanggal)) return;
    var n = Number(r.nominal) || 0; transferTotal += n;
    /* satu sisi boleh berupa akun bukan uang (persediaan/piutang): uang masuk
       ke rekening tanpa ada rekening lain yang berkurang. */
    if (!(!r.dariRekeningId && _akunNonKas(r.dariAkun || r.dariKas))) slot(_kodeAkun(r.dariRekeningId, r.dariKas), r.dariAkun, '').keluar += n;
    if (!(!r.keRekeningId && _akunNonKas(r.keAkun || r.keKas))) slot(_kodeAkun(r.keRekeningId, r.keKas), r.keAkun, '').masuk += n;
  });

  var perAkun = Object.keys(akun).map(function(k){ var a = akun[k]; a.saldo = a.awal + a.masuk - a.keluar; return a; })
    .sort(function(x,y){ return (x.jenis === 'kas') - (y.jenis === 'kas') || (x.dana > y.dana ? 1 : -1) || (x.label > y.label ? 1 : -1); });

  var perDana = {};
  perAkun.forEach(function(a){
    var d = a.dana || 'Lainnya';
    perDana[d] = perDana[d] || { dana:d, awal:0, masuk:0, keluar:0, saldoKas:0, ump:0, saldoDana:0 };
    perDana[d].awal += a.awal; perDana[d].masuk += a.masuk; perDana[d].keluar += a.keluar; perDana[d].saldoKas += a.saldo;
  });
  var totalKas = 0, totalUmp = 0;
  KAS_DANA.forEach(function(d){
    ump[d].sisa = ump[d].awal + ump[d].keluar - ump[d].lpj - ump[d].kembali;
    perDana[d] = perDana[d] || { dana:d, awal:0, masuk:0, keluar:0, saldoKas:0, ump:0, saldoDana:0 };
    perDana[d].ump = ump[d].sisa;
  });
  Object.keys(perDana).forEach(function(d){ perDana[d].saldoDana = perDana[d].saldoKas + (perDana[d].ump || 0); totalKas += perDana[d].saldoKas; totalUmp += (perDana[d].ump || 0); });

  var umpPerLayanan = Object.keys(umpLay).map(function(k){ var x = umpLay[k]; x.sisa = x.keluar - x.lpj - x.kembali; return x; })
    .filter(function(x){ return x.keluar || x.lpj || x.kembali; })
    .sort(function(a,b){ return b.sisa - a.sisa; });

  return {
    tanggal: sampai, tahun: tahun, adaSaldoAwal: adaSaldoAwal,
    perAkun: perAkun, perDana: perDana,
    totalKasBank: totalKas, totalUmp: totalUmp, totalDana: totalKas + totalUmp,
    ump: { perDana: ump, perLayanan: umpPerLayanan, totalTransfer: transferTotal },
    catatan: adaSaldoAwal ? '' : 'Saldo awal tahun ' + tahun + ' belum diisi (Pengaturan > Saldo Awal); angka ini baru menghitung pergerakan sejak 1 Januari.'
  };
}

/* ================= SALDO PER KANTOR LAYANAN (KLL / ULL) =================
   Alur uang satu KLL/ULL:
     setoran (penghimpunan atas nama KLL)      -> disetor ke daerah
     - hak amil (persen, sebagian setoran bisa dikecualikan)
     = SALDO KLL                                 hak KLL yang dititipkan di daerah
     - uang muka program (UMP) yang sudah diambil (+ yang dikembalikan)
     = SISA SALDO DI DAERAH                      masih tersimpan di kas/bank daerah
     UMP - LPJ - dikembalikan
     = BELUM LPJ                                 uangnya ada di tangan KLL
   ======================================================================= */
var HAK_AMIL_BAWAAN = { Zakat: 12.5, Infak: 12.5, Sedekah: 12.5, DSKL: 12.5, Amil: 0 };

function _bacaHakAmil(){
  var persen = {}, kecuali = [];
  try { persen = JSON.parse(getSetting('hakAmilPersen') || 'null') || {}; } catch (e) { persen = {}; }
  try { kecuali = JSON.parse(getSetting('hakAmilKecuali') || 'null') || []; } catch (e) { kecuali = []; }
  var out = {};
  Object.keys(HAK_AMIL_BAWAAN).forEach(function(k){
    var v = Number(persen[k]);
    out[k] = isFinite(v) && v >= 0 && v <= 100 ? v : HAK_AMIL_BAWAAN[k];
  });
  Object.keys(persen).forEach(function(k){
    if (out[k] === undefined) { var v = Number(persen[k]); if (isFinite(v) && v >= 0 && v <= 100) out[k] = v; }
  });
  return { persen: out, kecuali: (kecuali || []).map(function(x){ return String(x || '').trim(); }).filter(function(x){ return x; }) };
}
function apiHakAmil(t){ authUser(t); return _bacaHakAmil(); }
function apiSaveHakAmil(t, d){
  var u = _requirePerm(t, 'settings', 'edit');
  d = d || {};
  var persen = {};
  Object.keys(d.persen || {}).forEach(function(k){
    var v = Number(d.persen[k]);
    if (!isFinite(v) || v < 0 || v > 100) throw new Error('Persentase hak amil ' + k + ' harus antara 0 dan 100.');
    persen[String(k).trim()] = v;
  });
  var kecuali = (d.kecuali || []).map(function(x){ return String(x || '').trim(); }).filter(function(x){ return x; });
  setSetting('hakAmilPersen', JSON.stringify(persen));
  setSetting('hakAmilKecuali', JSON.stringify(kecuali));
  audit(u.id, u.username, 'edit_hak_amil', '', { modul:'settings',
    ringkas: Object.keys(persen).map(function(k){ return k + ' ' + persen[k] + '%'; }).join(', ') + (kecuali.length ? ' · dikecualikan: ' + kecuali.join(', ') : '') });
  return { ok:true, persen:persen, kecuali:kecuali };
}

/* Satu penerimaan dikecualikan dari hak amil bila sub jenis / pilar / program-nya
   ada di daftar pengecualian (mis. "Infak Terikat Kemanusiaan" murni disalurkan). */
function _bebasHakAmil(r, kecuali){
  if (!kecuali || !kecuali.length) return false;
  var kandidat = [r.subJenis, r.pilar, r.program, (r.subJenis || '') + ' ' + (r.pilar || '')]
    .map(function(x){ return _norm(x); }).filter(function(x){ return x; });
  for (var i = 0; i < kecuali.length; i++) {
    var k = _norm(kecuali[i]);
    if (!k) continue;
    for (var j = 0; j < kandidat.length; j++) if (kandidat[j] === k) return true;
  }
  return false;
}

/* Nama KLL/ULL pada baris uang muka & LPJ.
   Dulu nama ini dipakai apa adanya, tanpa dicocokkan ke master Layanan sama
   sekali — sehingga satu LPJ yang salah ketik ("KLL Banguntapaan Utara")
   membentuk kantor bayangan dengan setoran nol dan "belum LPJ" minus,
   sementara kantor aslinya kelebihan hitungan sebesar angka yang sama. */
function _layananUmp(nama, layList){
  var s = String(nama || '').trim();
  if (!s) return LAYANAN_DAERAH;
  if (/lazismu daerah|daerah bantul|penghimpunan daerah/i.test(s)) return LAYANAN_DAERAH;
  var dekat = _padanLayanan(s, layList || readAll(SHEETS.LAYANAN) || []);
  return dekat ? dekat.label : s;
}

function hitungSaldoLayanan(sampai){
  sampai = (sampai && /^\d{4}-\d{2}-\d{2}$/.test(String(sampai))) ? String(sampai) : _hariIni();
  var tahun = sampai.slice(0,4), awalTahun = tahun + '-01-01';
  var dalam = function(t){ t = String(t || '').slice(0,10); return t >= awalTahun && t <= sampai; };
  var cfg = _bacaHakAmil();
  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; });

  var rekap = {}, urut = [];
  function slot(nama){
    var k = _norm(nama);
    if (!rekap[k]) {
      var tipe = /^ull\b/i.test(nama) ? 'ULL' : /^kll\b/i.test(nama) ? 'KLL' : 'Daerah';
      rekap[k] = { layanan: String(nama), tipe: tipe, ejaan: {}, himpun:0, kenaAmil:0, bebasAmil:0, hakAmil:0,
        saldoKLL:0, umpKeluar:0, umpKembali:0, lpj:0, sisaSaldo:0, belumLPJ:0, nHimpun:0, nUmp:0, nLpj:0 };
      urut.push(k);
    }
    /* Ejaan yang ditampilkan adalah yang paling sering dipakai di data, bukan
       yang kebetulan terbaca lebih dulu — kalau tidak, menu Saldo KLL dan
       panel Periksa Nama Kantor bisa menyebut kantor yang sama dengan dua
       tulisan berbeda, dan itu terbaca seperti dua kantor. */
    var e = String(nama);
    rekap[k].ejaan[e] = (rekap[k].ejaan[e] || 0) + 1;
    if (rekap[k].ejaan[e] > (rekap[k].ejaan[rekap[k].layanan] || 0)) rekap[k].layanan = e;
    return rekap[k];
  }

  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    if (!dalam(r.tanggal)) return;
    var n = Number(r.jumlah) || 0;
    var s = slot(resolveLayananName(r, layList, layMap));
    s.himpun += n; s.nHimpun++;
    if (_bebasHakAmil(r, cfg.kecuali)) { s.bebasAmil += n; return; }
    var d = String(r.jenisDana || 'Infak').trim();
    var p = cfg.persen[d];
    if (p === undefined) p = cfg.persen.Infak || 0;
    /* hak amil dibulatkan ke rupiah utuh per transaksi, seperti pencatatan manual */
    s.kenaAmil += n; s.hakAmil += Math.round(n * p / 100);
  });

  (readAll(SHEETS.UANGMUKA) || []).forEach(function(r){
    if (!dalam(r.tanggal)) return;
    var n = Number(r.nominal) || 0;
    var s = slot(_layananUmp(r.layanan, layList));
    if (r.jenis === 'kembali') s.umpKembali += n; else { s.umpKeluar += n; s.nUmp++; }
  });

  (readAll(SHEETS.PENTASYARUFAN) || []).forEach(function(r){
    if (!dalam(r.tanggal)) return;
    if (!/^UMP\s+LPJ/i.test(String(r.section || ''))) return;
    var n = Number(r.jumlah) || 0;
    var s = slot(_layananUmp(r.namaPenerima, layList));
    s.lpj += n; s.nLpj++;
  });

  /* Kantor yang belum terdaftar di menu Layanan tidak punya nama acuan, jadi
     salah ketiknya tidak bisa disandarkan ke mana pun. Untuk itu baris rekap
     yang ejaannya HANYA berbeda pada huruf kembar disatukan di sini —
     "Banguntapaan Utara" dan "Banguntapan Utara" meratakan menjadi kunci yang
     sama persis. Aturannya sengaja seketat itu: bukan kemiripan, melainkan
     bentuk yang identik setelah huruf berulang diratakan, supaya dua kantor
     yang memang berbeda tidak pernah tergabung. Ejaan yang dipakai adalah
     yang datanya paling banyak. */
  var gabung = {}, urutG = [];
  urut.forEach(function(k){
    var s = rekap[k];
    var kg = _ratakanHuruf(s.layanan);
    if (!gabung[kg]) { gabung[kg] = s; urutG.push(kg); return; }
    var t = gabung[kg];
    Object.keys(s.ejaan || {}).forEach(function(e){ t.ejaan[e] = (t.ejaan[e] || 0) + s.ejaan[e]; });
    var juara = t.layanan;
    Object.keys(t.ejaan).forEach(function(e){ if (t.ejaan[e] > t.ejaan[juara]) juara = e; });
    t.layanan = juara;
    ['himpun','kenaAmil','bebasAmil','hakAmil','umpKeluar','umpKembali','lpj','nHimpun','nUmp','nLpj']
      .forEach(function(f){ t[f] += s[f]; });
  });

  /* Kalau kantornya terdaftar di menu Layanan, nama resmi itulah yang dipakai —
     ejaan di jurnal boleh berantakan, tampilan tidak boleh. */
  var resmiRata = {};
  layList.forEach(function(l){ if (l && l.nama) resmiRata[_ratakanHuruf(_layLabel(l))] = _layLabel(l); });
  urutG.forEach(function(k){ if (resmiRata[k]) gabung[k].layanan = resmiRata[k]; delete gabung[k].ejaan; });

  var daftar = urutG.map(function(k){
    var s = gabung[k];
    s.saldoKLL  = s.himpun - s.hakAmil;
    s.sisaSaldo = s.saldoKLL - s.umpKeluar + s.umpKembali;
    s.belumLPJ  = s.umpKeluar - s.lpj - s.umpKembali;
    return s;
  }).sort(function(a,b){ return b.sisaSaldo - a.sisaSaldo; });

  var kosong = function(){ return { himpun:0, kenaAmil:0, bebasAmil:0, hakAmil:0, saldoKLL:0, umpKeluar:0, umpKembali:0, lpj:0, sisaSaldo:0, belumLPJ:0 }; };
  var total = kosong(), totalKll = kosong();
  daftar.forEach(function(s){
    Object.keys(total).forEach(function(f){ total[f] += s[f]; });
    if (s.tipe !== 'Daerah') Object.keys(totalKll).forEach(function(f){ totalKll[f] += s[f]; });
  });
  var barisDaerah = daftar.filter(function(s){ return s.tipe === 'Daerah'; })[0] || null;

  return { tanggal: sampai, tahun: tahun, persen: cfg.persen, kecuali: cfg.kecuali,
    daftar: daftar, total: total, totalKll: totalKll, daerah: barisDaerah,
    jumlahLayanan: daftar.filter(function(s){ return s.tipe !== 'Daerah'; }).length };
}

/* Pengurus KLL hanya boleh melihat kantornya sendiri. Kosong = boleh semua. */
function _layananSaya(u){ return String((u && u.layanan) || '').trim(); }
function _bolehLihatLayanan(u, nama){
  var milik = _layananSaya(u);
  if (!milik) return true;
  return _norm(milik) === _norm(nama);
}

function apiSaldoLayanan(t, sampai){
  var u = _requirePerm(t, 'saldokll', 'view');
  var hasil = hitungSaldoLayanan(sampai);

  /* Penghimpunan Daerah disaring DI SERVER, bukan sekadar disembunyikan di
     tampilan — kalau hanya disembunyikan, angkanya tetap terkirim ke peramban
     dan siapa pun bisa membacanya. */
  hasil.bolehDaerah = can(u, 'saldodaerah', 'view');
  if (!hasil.bolehDaerah) {
    hasil.daftar = hasil.daftar.filter(function(s){ return s.tipe !== 'Daerah'; });
    hasil.daerah = null;
    hasil.total = hasil.totalKll;
  }

  var milik = _layananSaya(u);
  if (milik) {
    hasil.daftar = hasil.daftar.filter(function(s){ return _norm(s.layanan) === _norm(milik); });
    var total = { himpun:0, kenaAmil:0, bebasAmil:0, hakAmil:0, saldoKLL:0, umpKeluar:0, umpKembali:0, lpj:0, sisaSaldo:0, belumLPJ:0 };
    hasil.daftar.forEach(function(s){ Object.keys(total).forEach(function(f){ total[f] += s[f]; }); });
    hasil.total = total;
    hasil.jumlahLayanan = hasil.daftar.length;
    hasil.totalKll = total;
    hasil.daerah = null;
    hasil.bolehDaerah = false;   /* pengurus satu kantor tidak melihat angka daerah */
    hasil.dibatasi = milik;
  }
  return hasil;
}

/* Rincian satu KLL/ULL: setoran, uang muka, dan LPJ-nya baris per baris. */
function apiDetailSaldoLayanan(t, nama, sampai){
  var u = _requirePerm(t, 'saldokll', 'view');
  nama = String(nama || '').trim();
  if (!nama) throw new Error('Kantor layanan belum dipilih.');
  if (_norm(nama) === _norm(LAYANAN_DAERAH) && !can(u, 'saldodaerah', 'view')) {
    throw new Error('IZIN: tidak punya akses melihat Saldo Penghimpunan Daerah.');
  }
  if (!_bolehLihatLayanan(u, nama)) throw new Error('IZIN: hanya boleh melihat ' + _layananSaya(u) + '.');
  sampai = (sampai && /^\d{4}-\d{2}-\d{2}$/.test(String(sampai))) ? String(sampai) : _hariIni();
  var tahun = sampai.slice(0,4), awalTahun = tahun + '-01-01';
  var dalam = function(x){ x = String(x || '').slice(0,10); return x >= awalTahun && x <= sampai; };
  var cfg = _bacaHakAmil();
  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; });
  /* Cocok kalau namanya sama, ATAU sama setelah huruf kembar diratakan —
     sejalan dengan penggabungan di rekap, supaya kartu rincian memuat
     baris yang sama persis dengan angka di ringkasannya. */
  var namaRata = _ratakanHuruf(nama);
  var sama = function(x){ return _norm(x) === _norm(nama) || _ratakanHuruf(x) === namaRata; };

  var setoran = [], uangMuka = [], lpj = [];
  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    if (!dalam(r.tanggal) || !sama(resolveLayananName(r, layList, layMap))) return;
    var n = Number(r.jumlah) || 0;
    var bebas = _bebasHakAmil(r, cfg.kecuali);
    var d = String(r.jenisDana || 'Infak').trim();
    var p = cfg.persen[d]; if (p === undefined) p = cfg.persen.Infak || 0;
    setoran.push({ tanggal:String(r.tanggal).slice(0,10), jenis:(r.subJenis || r.jenisDana || ''), pilar:r.pilar || '',
      donatur:r.namaDonatur || '', metode:r.metode || '', jumlah:n,
      bebasAmil:bebas, persen: bebas ? 0 : p, hakAmil: bebas ? 0 : Math.round(n * p / 100), bersih: bebas ? n : n - Math.round(n * p / 100) });
  });
  (readAll(SHEETS.UANGMUKA) || []).forEach(function(r){
    if (!dalam(r.tanggal) || !sama(_layananUmp(r.layanan, layList))) return;
    uangMuka.push({ tanggal:String(r.tanggal).slice(0,10), jenis:r.jenis === 'kembali' ? 'Dikembalikan' : 'Uang muka keluar',
      dana:r.dana || '', akun:r.akun || '', keterangan:r.keterangan || '', jumlah:Number(r.nominal) || 0 });
  });
  (readAll(SHEETS.PENTASYARUFAN) || []).forEach(function(r){
    if (!dalam(r.tanggal) || !/^UMP\s+LPJ/i.test(String(r.section || '')) || !sama(_layananUmp(r.namaPenerima, layList))) return;
    lpj.push({ tanggal:String(r.tanggal).slice(0,10), program:r.program || '', ashnaf:r.ashnaf || '',
      dana:r.sumberDana || '', keterangan:r.keterangan || '', jumlah:Number(r.jumlah) || 0 });
  });
  var urutTgl = function(a,b){ return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0; };
  setoran.sort(urutTgl); uangMuka.sort(urutTgl); lpj.sort(urutTgl);

  var ring = hitungSaldoLayanan(sampai).daftar.filter(function(s){ return sama(s.layanan); })[0]
    || { layanan:nama, tipe:'KLL', himpun:0, kenaAmil:0, bebasAmil:0, hakAmil:0, saldoKLL:0, umpKeluar:0, umpKembali:0, lpj:0, sisaSaldo:0, belumLPJ:0 };
  return { layanan:nama, tanggal:sampai, tahun:tahun, ringkas:ring, persen:cfg.persen, kecuali:cfg.kecuali,
    setoran:setoran, uangMuka:uangMuka, lpj:lpj };
}

/* ================================================================
   RINCIAN PENGHIMPUNAN DAERAH
   ================================================================
   "Daerah" adalah seluruh dana yang di dalamnya TIDAK ada KLL maupun ULL —
   dihimpun langsung oleh daerah. Semua yang berpenanda kantor layanan,
   termasuk hak amil yang dipotong darinya, bukan bagian dari angka ini.

   Yang ditampilkan bukan alur uang muka seperti pada kantor layanan (daerah
   menyalurkan langsung, tidak lewat uang muka), melainkan: berapa yang
   terhimpun, berapa hak amilnya, dan sisanya — dana siap salur — dipecah
   per pilar. Bisa disaring per bulan dan per pilar; pencarian dilakukan di
   server supaya tetap menemukan baris yang tidak ikut terkirim ke peramban.

   Parameter:
     sampai  tanggal batas (posisi saldo)
     bulan   'YYYY-MM' untuk satu bulan saja; kosong = sejak awal tahun
     pilar   nama pilar/jenis untuk menyaring; kosong = semua
     cari    kata kunci nama donatur / keterangan / program
     batas   jumlah baris rincian yang dikirim (sisanya cukup dihitung)
*/
function apiRincianDaerah(t, sampai, bulan, pilar, cari, batas){
  var u = _requirePerm(t, 'saldokll', 'view');
  if (!can(u, 'saldodaerah', 'view')) throw new Error('IZIN: tidak punya akses melihat Saldo Penghimpunan Daerah.');
  if (_layananSaya(u)) throw new Error('IZIN: pengurus kantor layanan tidak melihat angka daerah.');

  sampai = (sampai && /^\d{4}-\d{2}-\d{2}$/.test(String(sampai))) ? String(sampai) : _hariIni();
  bulan = /^\d{4}-\d{2}$/.test(String(bulan || '')) ? String(bulan) : '';
  pilar = String(pilar || '').trim();
  cari  = _norm(cari || '');
  batas = Math.max(20, Math.min(500, Number(batas) || 200));

  var tahun = sampai.slice(0, 4), awalTahun = tahun + '-01-01';
  var cfg = _bacaHakAmil();
  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; });

  /* Satu baris daerah = penghimpunan yang nama layanannya jatuh ke "Penghimpunan
     Daerah". Perhitungan hak amilnya persis sama dengan di rekap KLL supaya
     kedua halaman tidak pernah berbeda serupiah pun. */
  var amilBaris = function(r){
    if (_bebasHakAmil(r, cfg.kecuali)) return 0;
    var d = String(r.jenisDana || 'Infak').trim();
    var p = cfg.persen[d]; if (p === undefined) p = cfg.persen.Infak || 0;
    return Math.round((Number(r.jumlah) || 0) * p / 100);
  };
  /* Label kelompok: pilar bila ada (itu yang diminta), kalau tidak pakai
     jenis penerimaannya supaya tidak ada uang yang jatuh ke "lain-lain". */
  var kelompok = function(r){
    var pl = String(r.pilar || '').trim();
    if (pl) return { nama: pl, tipe: 'pilar' };
    return { nama: String(r.subJenis || r.jenisDana || 'Lain-lain').trim(), tipe: 'jenis' };
  };

  var semua = [];
  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    var tgl = String(r.tanggal || '').slice(0, 10);
    if (tgl < awalTahun || tgl > sampai) return;
    if (_norm(resolveLayananName(r, layList, layMap)) !== _norm(LAYANAN_DAERAH)) return;
    var g = kelompok(r);
    var a = amilBaris(r);
    semua.push({
      tanggal: tgl, bulan: tgl.slice(0, 7),
      jenis: String(r.subJenis || r.jenisDana || ''), pilar: String(r.pilar || ''),
      grup: g.nama, grupTipe: g.tipe,
      donatur: String(r.namaDonatur || ''), metode: String(r.metode || ''),
      keterangan: String(r.keterangan || r.program || ''),
      jumlah: Number(r.jumlah) || 0, hakAmil: a, bersih: (Number(r.jumlah) || 0) - a
    });
  });
  semua.sort(function(a, b){ return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0; });

  var jum = function(arr){
    var o = { setoran: 0, hakAmil: 0, saldo: 0, n: 0 };
    arr.forEach(function(x){ o.setoran += x.jumlah; o.hakAmil += x.hakAmil; o.saldo += x.bersih; o.n++; });
    return o;
  };

  /* Daftar bulan & pilar dibangun dari SELURUH data tahun ini, bukan dari
     hasil saringan — kalau tidak, memilih satu bulan akan menghapus pilihan
     bulan lainnya dari daftarnya sendiri. */
  var perBulan = {}, urutBulan = [];
  var perPilar = {}, urutPilar = [];
  semua.forEach(function(x){
    if (!perBulan[x.bulan]) { perBulan[x.bulan] = []; urutBulan.push(x.bulan); }
    perBulan[x.bulan].push(x);
    if (!perPilar[x.grup]) { perPilar[x.grup] = { rows: [], tipe: x.grupTipe }; urutPilar.push(x.grup); }
    perPilar[x.grup].rows.push(x);
  });

  var pilihan = semua.filter(function(x){
    if (bulan && x.bulan !== bulan) return false;
    if (pilar && _norm(x.grup) !== _norm(pilar)) return false;
    return true;
  });
  var hasilCari = !cari ? pilihan : pilihan.filter(function(x){
    return _norm(x.donatur).indexOf(cari) >= 0 || _norm(x.keterangan).indexOf(cari) >= 0
        || _norm(x.jenis).indexOf(cari) >= 0 || _norm(x.grup).indexOf(cari) >= 0;
  });

  /* Kumulatif = posisi saldo sampai akhir bulan yang dipilih (kalau tidak ada
     bulan dipilih, sampai tanggal laporan). Berdampingan dengan angka bulan
     berjalan supaya "waktu itu ada berapa" dan "bulan itu dapat berapa"
     bisa dijawab sekaligus tanpa salah baca. */
  var batasKumulatif = bulan ? (bulan + '-31') : sampai;
  var kum = jum(semua.filter(function(x){ return x.tanggal <= batasKumulatif && (!pilar || _norm(x.grup) === _norm(pilar)); }));

  return {
    tanggal: sampai, tahun: tahun, bulan: bulan, pilar: pilar, cari: cari || '',
    persen: cfg.persen, kecuali: cfg.kecuali,
    ringkas: jum(pilihan),
    kumulatif: kum,
    tahunPenuh: jum(semua),
    perBulan: urutBulan.sort().map(function(b){ var o = jum(perBulan[b]); o.bulan = b; return o; }),
    perPilar: urutPilar.map(function(k){ var o = jum(perPilar[k].rows); o.pilar = k; o.tipe = perPilar[k].tipe; return o; })
                       .sort(function(a, b){ return b.saldo - a.saldo; }),
    /* rincian yang benar-benar dikirim dibatasi; jumlah sebenarnya tetap dilaporkan */
    baris: hasilCari.slice(0, batas),
    totalBaris: hasilCari.length,
    dipotong: Math.max(0, hasilCari.length - batas),
    totalCari: cari ? jum(hasilCari) : null
  };
}

/* Buku mutasi satu akun (rekening / kas): semua pergerakan dalam rentang,
   urut tanggal, dengan saldo berjalan. Saldo awal periode = saldo awal tahun
   + pergerakan sebelum tanggal `dari`. */
function bukuAkun(kode, dari, sampai){
  sampai = (sampai && /^\d{4}-\d{2}-\d{2}$/.test(String(sampai))) ? String(sampai) : _hariIni();
  var tahun = sampai.slice(0,4);
  dari = (dari && /^\d{4}-\d{2}-\d{2}$/.test(String(dari))) ? String(dari) : (tahun + '-01-01');
  if (dari.slice(0,4) !== tahun) dari = tahun + '-01-01';
  var akunInfo = null;
  daftarAkunKas().forEach(function(a){ if (a.kode === kode) akunInfo = a; });
  var isRek = kode.indexOf('rek:') === 0, isKas = kode.indexOf('kas:') === 0;
  var rekeningId = isRek ? kode.slice(4) : '', kasDana = isKas ? kode.slice(4) : '';
  /* Penentuan akun harus sama persis dengan hitungSaldo():
     rekening -> rek:<id>; kas -> dari nama kas ("Kas Zakat") bila ada,
     kalau tidak dari jenis dana; jenisDana null = tanpa cadangan (transfer). */
  var cocok = function(rId, kNama, jenisDana){
    if (isRek) return String(rId || '') === rekeningId;
    if (isKas) {
      if (rId) return false;
      if (_akunNonKas(kNama)) return false;
      var k = kNama ? _kodeAkun('', kNama) : (jenisDana === null ? '' : 'kas:' + _danaKas(jenisDana));
      return k === kode;
    }
    return false;
  };
  var gerak = [];
  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    if (String(r.tanggal||'').slice(0,4) !== tahun) return;
    if (!r.rekeningId && _akunNonKas(r.bank)) return;      /* donasi barang, bukan uang */
    if (!cocok(r.rekeningId, '', r.jenisDana)) return;
    gerak.push({ tanggal:String(r.tanggal).slice(0,10), urut:r.dibuat||'', jenis:'Penerimaan', keterangan:(r.namaDonatur||'') + (r.jenisDana ? ' · ' + r.jenisDana + (r.subJenis ? ' / ' + r.subJenis : '') : ''), ref:r.noKwitansi||'', masuk:Number(r.jumlah)||0, keluar:0 });
  });
  (readAll(SHEETS.PENTASYARUFAN) || []).forEach(function(r){
    if (String(r.tanggal||'').slice(0,4) !== tahun) return;
    if (/^UMP\s+LPJ/i.test(String(r.section||''))) return;
    if (!r.rekeningId && _akunNonKas(r.bank)) return;      /* penyaluran barang */
    if (!cocok(r.rekeningId, '', r.sumberDana)) return;
    gerak.push({ tanggal:String(r.tanggal).slice(0,10), urut:r.dibuat||'', jenis:'Penyaluran', keterangan:(r.namaPenerima||'') + (r.program ? ' · ' + r.program : ''), ref:r.noBukti||'', masuk:0, keluar:Number(r.jumlah)||0 });
  });
  (readAll(SHEETS.UANGMUKA) || []).forEach(function(r){
    if (String(r.tanggal||'').slice(0,4) !== tahun) return;
    if (!r.rekeningId && _akunNonKas(r.akun || r.kasNama)) return;
    if (!cocok(r.rekeningId, r.kasNama, r.dana)) return;
    var n = Number(r.nominal)||0;
    gerak.push({ tanggal:String(r.tanggal).slice(0,10), urut:r.dibuat||'', jenis: r.jenis === 'kembali' ? 'Uang muka kembali' : 'Uang muka keluar', keterangan:(r.layanan||'') + (r.keterangan ? ' · ' + r.keterangan : ''), ref:'', masuk: r.jenis === 'kembali' ? n : 0, keluar: r.jenis === 'kembali' ? 0 : n });
  });
  (readAll(SHEETS.TRANSFER) || []).forEach(function(r){
    if (String(r.tanggal||'').slice(0,4) !== tahun) return;
    var n = Number(r.nominal)||0;
    var lbl = r.jenis === 'setor' ? 'Setor tunai' : r.jenis === 'tarik' ? 'Tarik tunai' : 'Mutasi';
    if (cocok(r.dariRekeningId, r.dariKas, null)) gerak.push({ tanggal:String(r.tanggal).slice(0,10), urut:r.dibuat||'', jenis:lbl + ' keluar', keterangan:'ke ' + (r.keAkun||'') + (r.keterangan ? ' · ' + r.keterangan : ''), ref:'', masuk:0, keluar:n });
    if (cocok(r.keRekeningId, r.keKas, null)) gerak.push({ tanggal:String(r.tanggal).slice(0,10), urut:r.dibuat||'', jenis:lbl + ' masuk', keterangan:'dari ' + (r.dariAkun||'') + (r.keterangan ? ' · ' + r.keterangan : ''), ref:'', masuk:n, keluar:0 });
  });
  gerak.sort(function(a,b){ return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : (a.urut < b.urut ? -1 : 1); });

  var awalTahun = 0;
  (readAll(SHEETS.SALDOAWAL) || []).forEach(function(r){ if (String(r.tahun) === tahun && r.jenis !== 'ump' && _kodeAkun(r.rekeningId, r.kasNama) === kode) awalTahun += Number(r.nominal)||0; });
  var saldo = awalTahun, awalPeriode = awalTahun, baris = [], masuk = 0, keluar = 0;
  gerak.forEach(function(g){
    if (g.tanggal > sampai) return;
    saldo += g.masuk - g.keluar;
    if (g.tanggal < dari) { awalPeriode = saldo; return; }
    masuk += g.masuk; keluar += g.keluar;
    baris.push({ tanggal:g.tanggal, jenis:g.jenis, keterangan:g.keterangan, ref:g.ref, masuk:g.masuk, keluar:g.keluar, saldo:saldo });
  });
  return { kode:kode, akun: akunInfo ? akunInfo.label : kode, dana: akunInfo ? akunInfo.dana : '', dari:dari, sampai:sampai,
    awalTahun:awalTahun, awalPeriode:awalPeriode, masuk:masuk, keluar:keluar, saldoAkhir:saldo, baris:baris, jumlah:baris.length };
}
function apiMutasiAkun(t, kode, dari, sampai){ _requirePerm(t, 'saldo', 'view'); if (!kode) throw new Error('Akun belum dipilih.'); return bukuAkun(String(kode), dari, sampai); }

function apiSaldo(t, sampai){ _requirePerm(t, 'saldo', 'view'); return hitungSaldo(sampai); }

/* ---- saldo awal per tahun ---- */
function apiListSaldoAwal(t, tahun){
  _requirePerm(t, 'settings', 'view');
  tahun = String(tahun || new Date().getFullYear());
  var ada = {};
  (readAll(SHEETS.SALDOAWAL) || []).forEach(function(r){ if (String(r.tahun) === tahun) ada[r.jenis === 'ump' ? ('ump:' + _danaKas(r.dana)) : _kodeAkun(r.rekeningId, r.kasNama)] = r; });
  var baris = daftarAkunKas().map(function(a){ var r = ada[a.kode]; return { kode:a.kode, jenis:a.jenis, label:a.label, dana:a.dana, rekeningId:a.rekeningId, kasNama:a.kasNama, nominal: r ? Number(r.nominal) || 0 : 0, keterangan: r ? (r.keterangan || '') : '' }; });
  var umpAwal = KAS_DANA.map(function(d){ var r = ada['ump:' + d]; return { kode:'ump:' + d, jenis:'ump', label:'Uang muka ' + d + ' belum di-LPJ', dana:d, nominal: r ? Number(r.nominal) || 0 : 0, keterangan: r ? (r.keterangan || '') : '' }; });
  var tahunAda = {}; (readAll(SHEETS.SALDOAWAL) || []).forEach(function(r){ tahunAda[r.tahun] = 1; });
  return { tahun: tahun, akun: baris, ump: umpAwal, tahunTersedia: Object.keys(tahunAda).sort() };
}
function apiSaveSaldoAwal(t, tahun, baris){
  var u = _requirePerm(t, 'settings', 'edit');
  tahun = String(tahun || '');
  if (!/^\d{4}$/.test(tahun)) throw new Error('Tahun tidak sah.');
  if (!Array.isArray(baris)) throw new Error('Data saldo awal tidak sah.');
  /* ganti seluruh baris tahun itu */
  (readAll(SHEETS.SALDOAWAL) || []).forEach(function(r){ if (String(r.tahun) === tahun) deleteRowById(SHEETS.SALDOAWAL, r.id); });
  var akunMap = {}; daftarAkunKas().forEach(function(a){ akunMap[a.kode] = a; });
  var total = 0, n = 0;
  baris.forEach(function(b){
    var nominal = Number(b.nominal) || 0;
    if (!nominal) return;
    if (b.jenis === 'ump') {
      insertRow(SHEETS.SALDOAWAL, { id:makeId(), tahun:tahun, jenis:'ump', akun:'UMP ' + _danaKas(b.dana), rekeningId:'', kasNama:'', dana:_danaKas(b.dana), nominal:nominal, keterangan:String(b.keterangan || ''), dibuat:new Date().toISOString(), oleh:u.username });
    } else {
      var a = akunMap[b.kode]; if (!a) return;
      insertRow(SHEETS.SALDOAWAL, { id:makeId(), tahun:tahun, jenis:a.jenis, akun:a.label, rekeningId:a.rekeningId, kasNama:a.kasNama, dana:a.dana, nominal:nominal, keterangan:String(b.keterangan || ''), dibuat:new Date().toISOString(), oleh:u.username });
      total += nominal;
    }
    n++;
  });
  audit(u.id, u.username, 'saldo_awal', 'tahun ' + tahun, { modul:'settings', ringkas: n + ' akun, total kas & bank Rp ' + total.toLocaleString('id-ID') });
  return { ok:true, tahun:tahun, jumlah:n, totalKasBank:total };
}
function apiListUangMuka(t){ _requirePerm(t, 'laporan', 'view'); return (readAll(SHEETS.UANGMUKA) || []).sort(function(a,b){ return String(b.tanggal).localeCompare(String(a.tanggal)); }); }
function apiListTransfer(t){ _requirePerm(t, 'laporan', 'view'); return (readAll(SHEETS.TRANSFER) || []).sort(function(a,b){ return String(b.tanggal).localeCompare(String(a.tanggal)); }); }

/* ===== REKAP KLL / ULL =====
   Satu sumber kebenaran untuk menentukan sebuah transaksi milik Kantor Layanan
   (KLL) / Unit Layanan (ULL) mana. Transaksi tanpa penanda apa pun masuk ke
   penghimpunan tingkat daerah.

   Versi lama mencocokkan dengan `a.indexOf(b)>=0 || b.indexOf(a)>=0` terhadap
   string fallback 'Lazismu Daerah Bantul'. Akibatnya layanan bernama "Bantul"
   selalu cocok dengan fallback itu, sehingga transaksi daerah tersedot ke KLL
   tersebut. Di sisi pentasyarufan lebih parah: `ln.indexOf(nameP)` bernilai 0
   ketika nama penerima kosong, jadi cocok ke layanan mana pun. */
var LAYANAN_DAERAH = 'Penghimpunan Daerah';

function _layLabel(l){ return (l && l.tipe ? l.tipe + ' ' : '') + (l ? l.nama : ''); }
function _norm(x){ return String(x == null ? '' : x).toLowerCase().replace(/\s+/g, ' ').trim(); }

/* Nama layanan harus muncul sebagai kata utuh, bukan potongan kata. */
function _containsWord(haystack, needle){
  if (!haystack || !needle) return false;
  var i = haystack.indexOf(needle);
  while (i >= 0) {
    var before = i === 0 ? ' ' : haystack.charAt(i - 1);
    var after = (i + needle.length >= haystack.length) ? ' ' : haystack.charAt(i + needle.length);
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    i = haystack.indexOf(needle, i + 1);
  }
  return false;
}

/* Kata yang jelas bukan bagian nama layanan — dipakai untuk memotong ekor
   kalimat seperti "KLL Srandakan pekan 2" menjadi "Srandakan". */
var _LAY_STOP = ['pekan','bulan','tanggal','tgl','infak','infaq','zakat','sedekah','shodaqoh',
  'wakaf','kurban','qurban','fidyah','terikat','umum','setoran','setor','transfer','tunai',
  'cash','qris','dari','an','a.n','atas','nama','via','bank','kas','donasi','sumbangan',
  /* ekor kalimat pada jurnal uang muka & LPJ: "KLL Pundong Uang Muka Program",
     "KLL Imogiri kegiatan sosial" — bukan bagian dari nama kantornya */
  'uang','muka','program','progaram','ump','lpj','pengembalian','sisa','kegiatan',
  'pentasharufan','pentasyarufan','penyaluran','bantuan','honor','fee','biaya',
  'pembayaran','pembelian','operasional','support','subsidi',
  /* nama program/kampanye yang sering ditempel di belakang nama kantor:
     "KLL Bantul Kota NTT", "KLL Srandakan NTT" — kantornya sama, yang beda
     hanya peruntukan donasinya, jadi tidak boleh jadi kantor tersendiri */
  'ntt','palestina','aceh','sumatera','kekeringan','gempa','bencana',
  'ramadhan','ramadan','idul','fitri','adha','mal','profesi','penghasilan',
  'pertanian','perdagangan','emas','perak','simpanan','fitrah','dskl','amil'];

/* Tangkap penanda "KLL <nama>" / "ULL <nama>" / "KL <nama>" dari teks asli
   (bukan versi lowercase) supaya kapitalisasi nama tetap seperti yang diketik. */
/* Master Layanan untuk jalur impor. Dibaca lewat readAll seperti yang lain,
   jadi pemuatan bertahap tetap berlaku: kalau tabelnya belum dimuat, galat
   PerluLembar dilempar dan putaran berikutnya membawanya. Dibungkus supaya
   pemanggilnya tidak perlu tahu itu. */
function _layMaster(){
  try { return readAll(SHEETS.LAYANAN) || []; }
  catch (e) { if (e && (e.perluLembar || /belum dimuat/.test(String(e.message || '')))) throw e; return []; }
}

/* NAMA LAIN (ALIAS) KANTOR yang dipilih orang di layar impor.
   "ULL Masjid" cocok dengan belasan kantor berawalan "Masjid", jadi tidak
   boleh ditebak (lihat _padanLayanan). Tetapi pemilik TAHU yang dimaksud
   adalah ULL Masjid Baiturrahman Aceh. Pilihannya disimpan sekali di
   Settings (kunci aliasKantor) supaya impor bulan berikutnya tidak
   menanyakannya lagi. Kuncinya "tipe nama" yang sudah dinormalkan, isinya
   { id, tipe, nama } kantor terdaftar. */
function _aliasKantor(){
  try {
    var v = getSetting('aliasKantor');
    var o = v ? JSON.parse(v) : {};
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) {
    if (e && (e.perluLembar || /belum dimuat/.test(String(e.message || '')))) throw e;
    return {};
  }
}
var _ID_DAERAH = '__DAERAH__';
var _PILIHAN_DAERAH = { id: '__DAERAH__', tipe: '', nama: 'Penghimpunan Daerah', label: 'Bukan kantor, masuk Daerah' };
/* Mitra yang ikut dihitung di kelompok KLL seperti di rekap pemilik, tetapi
   sengaja TIDAK didaftarkan di menu Layanan karena bukan KLL di bawah
   Lazismu Daerah Bantul (Lazismu Kota Yogyakarta, kerja sama program,
   1 Oktober 2026). Diingat supaya tidak ditanyakan setiap bulan. */
var _ID_SENDIRI = '__SENDIRI__';
var _PILIHAN_SENDIRI = { id: '__SENDIRI__', tipe: '', nama: '', label: 'Nama sendiri, tidak didaftarkan (jangan tanya lagi)' };
function _kunciAlias(tipe, nama){ return String(tipe || '').toLowerCase() + ' ' + _norm(nama); }

function _layFromPrefix(rawText, layList){
  /* Penanda kantor yang diakui pemilik (1 Oktober 2026): KLL, ULL, KL, UL,
     dan tulisan lengkap "Kantor Layanan" / "Unit Layanan". Dulu "UL" dan
     tulisan lengkap tidak dikenali, sehingga setoran "Infak Umum Unit
     Layanan Masjid Baiturrahman Aceh" Rp 8.125.000 di jurnal kas September
     jatuh ke Penghimpunan Daerah. */
  var m = String(rawText || '').match(/\b(KLL|ULL|KL|UL|Kantor\s+Layanan|Unit\s+Layanan)\b[\s:.\-]*([^|\n]{2,60})/i);
  if (!m) return null;
  var tipe = m[1].toUpperCase().replace(/\s+/g, ' ');
  if (tipe === 'KL' || tipe === 'KANTOR LAYANAN') tipe = 'KLL';
  if (tipe === 'UL' || tipe === 'UNIT LAYANAN') tipe = 'ULL';
  var words = String(m[2]).replace(/[^A-Za-z0-9'’. ]/g, ' ').split(/\s+/).filter(function(w){ return w; });

  /* DAFTAR LAYANAN MENANG ATAS DAFTAR KATA BERHENTI.
     _LAY_STOP memuat 'aceh', 'palestina', 'ntt' dan sebangsanya karena nama
     kampanye sering ditempel di belakang nama kantor: "KLL Srandakan Aceh"
     adalah KLL Srandakan yang menghimpun untuk Aceh, bukan kantor bernama
     "Srandakan Aceh". Aturan itu benar — sampai ada kantor yang namanya
     memang memuat kata itu.

     "ULL Masjid Baiturrahman Aceh" adalah nama kantornya, apa adanya. Dengan
     aturan lama ia terpotong jadi "ULL Masjid Baiturrahman", dan yang lebih
     buruk, "ULL Masjid Aceh Uang Muka Program Infak" terpotong jadi "ULL
     Masjid". Dua kantor bayangan lahir dari satu kata, tidak satu pun
     terdaftar di menu Layanan, dan masing-masing membawa sebagian uang muka
     dan LPJ kantor aslinya. Diukurnya: uang muka Rp 105 juta duduk di satu
     nama sementara LPJ-nya duduk di nama lain, lalu yang satu tampak positif
     besar dan yang lain minus besar.

     Jadi sebelum kata berhenti dipakai, deretan kata terpanjang yang SAMA
     PERSIS dengan sebuah kantor terdaftar dicoba lebih dulu. Bukan tebakan:
     yang diterima hanya yang cocok bulat-bulat dengan master Layanan. Kalau
     tidak ada yang cocok, jalur lama di bawah tetap berlaku. */
  if (layList && layList.length) {
    for (var n = Math.min(words.length, 8); n >= 1; n--) {
      var calon = _norm(words.slice(0, n).join(' '));
      if (!calon) continue;
      var pas = null;
      for (var q = 0; q < layList.length; q++) {
        var l = layList[q];
        if (!l || !l.nama) continue;
        if (l.tipe && String(l.tipe).toUpperCase() !== tipe) continue;
        if (_norm(l.nama) === calon) { pas = l; break; }
      }
      if (pas) return { tipe: tipe, nama: String(pas.nama), terdaftar: true };
    }
  }

  /* Belum cocok dengan nama terdaftar: coba nama lain yang pernah dipilih
     orang. Deretan kata terpanjang dulu, sama seperti di atas. */
  var alias = _aliasKantor();
  if (Object.keys(alias).length) {
    for (var na = Math.min(words.length, 8); na >= 1; na--) {
      var a = alias[_kunciAlias(tipe, words.slice(0, na).join(' '))];
      /* Nama yang dipilih orang sebagai "bukan kantor": milik Daerah. */
      if (a && a.daerah) return null;
      if (a && a.sendiri) return { tipe: String(a.tipe || tipe).toUpperCase(), nama: String(a.nama), terdaftar: false, sendiri: true };
      if (a && a.nama) return { tipe: String(a.tipe || tipe).toUpperCase(), nama: String(a.nama), terdaftar: true, alias: true, id: a.id };
    }
  }

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

/* ================================================================
   PENCOCOKAN NAMA KANTOR LAYANAN YANG SALAH KETIK
   ================================================================
   Nama KLL/ULL di jurnal ditulis tangan, jadi salah ketik satu huruf
   sudah cukup untuk melahirkan kantor bayangan: "KLL Banguntapaan
   Utara" berdiri sendiri di samping "KLL Banguntapan Utara", dan
   uang yang seharusnya menjadi hak satu kantor terbelah dua. Ini
   bukan kesalahan kecil — angkanya dipakai untuk membagi dana.

   Karena itu setiap nama dicocokkan ke master Layanan dengan tiga
   lapis: sama persis, sama setelah huruf kembar diratakan
   ("banguntapaan" -> "banguntapan"), lalu jarak edit kecil. Kalau
   tidak ada yang cukup dekat, namanya tetap dipakai apa adanya
   supaya tidak ada uang yang diam-diam pindah kantor. */

/* "banguntapaan" -> "banguntapan": huruf yang berulang diratakan satu,
   sekaligus membuang tanda baca. Salah ketik paling sering di sini. */
function _ratakanHuruf(x){
  return _norm(x).replace(/[^a-z0-9 ]/g, '').replace(/(.)\1+/g, '$1');
}

/* Jarak edit Levenshtein, dibatasi supaya tidak boros pada nama panjang. */
function _jarakEdit(a, b){
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 3) return 99;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a.charAt(i-1) === b.charAt(j-1) ? 0 : 1));
    }
    for (j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/* Berapa banyak salah ketik yang masih dianggap nama yang sama.
   Nama pendek harus lebih ketat: "KLL Sedayu" dan "KLL Sedayu 2"
   memang dua kantor berbeda, sedangkan pada nama panjang satu-dua
   huruf meleset hampir pasti salah ketik. */
function _batasSalahKetik(panjang){
  if (panjang >= 14) return 2;
  if (panjang >= 8) return 1;
  return 0;
}

/* Cari padanan terdekat sebuah nama kantor di master Layanan.
   Mengembalikan { lay, label, jarak, cara } atau null. */
function _padanLayanan(nama, layList){
  var mentah = String(nama || '').trim();
  if (!mentah) return null;
  layList = layList || [];
  /* awalan KLL/ULL dibuang dulu supaya yang dibandingkan hanya nama kantornya */
  var tipe = /^\s*ull\b/i.test(mentah) ? 'ULL' : /^\s*(kll|kl)\b/i.test(mentah) ? 'KLL' : '';
  var inti = mentah.replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, '').trim();
  var nInti = _norm(inti), rInti = _ratakanHuruf(inti);
  if (!nInti) return null;

  var terbaik = null;
  layList.forEach(function(l){
    if (!l || !l.nama) return;
    var nLay = _norm(l.nama), rLay = _ratakanHuruf(l.nama);
    if (!nLay) return;
    /* tipe berbeda (KLL vs ULL) bukan kantor yang sama */
    if (tipe && l.tipe && String(l.tipe).toUpperCase() !== tipe) return;
    var jarak = null, cara = '';
    if (nInti === nLay) { jarak = 0; cara = 'sama'; }
    else if (rInti && rInti === rLay) { jarak = 0.5; cara = 'huruf kembar'; }
    else {
      var d = _jarakEdit(rInti, rLay);
      if (d <= _batasSalahKetik(Math.max(rInti.length, rLay.length))) { jarak = d; cara = 'salah ketik ' + d + ' huruf'; }
    }
    if (jarak === null) return;
    if (!terbaik || jarak < terbaik.jarak) terbaik = { lay: l, label: _layLabel(l), jarak: jarak, cara: cara };
  });
  if (terbaik) return terbaik;

  /* Lapisan terakhir: NAMA YANG TERPOTONG.
     Baris yang sudah telanjur tersimpan dengan nama terpotong ("ULL Masjid
     Baiturrahman" untuk kantor "Masjid Baiturrahman Aceh") tidak bisa
     ditolong jarak edit — selisih panjangnya terlalu jauh, jaraknya
     dikembalikan 99. Padahal namanya bukan salah ketik, melainkan potongan
     awal nama yang benar.

     Syaratnya sengaja diperketat sampai tidak ada ruang menebak: potongannya
     harus berhenti di batas kata, dan harus ada TEPAT SATU kantor terdaftar
     yang namanya diawali potongan itu. Begitu ada dua, ia dibiarkan apa
     adanya — "ULL Masjid" cocok dengan belasan kantor bermula "Masjid", dan
     menebak salah satu berarti memindahkan uang ke kantor yang keliru. Yang
     seperti itu digabungkan sendiri lewat Pengaturan. */
  var cocokAwalan = [];
  layList.forEach(function(l){
    if (!l || !l.nama) return;
    if (tipe && l.tipe && String(l.tipe).toUpperCase() !== tipe) return;
    var rLay = _ratakanHuruf(l.nama);
    if (!rLay || rLay === rInti) return;
    if (rLay.indexOf(rInti + ' ') === 0) cocokAwalan.push(l);
  });
  if (cocokAwalan.length === 1 && rInti.length >= 4) {
    return { lay: cocokAwalan[0], label: _layLabel(cocokAwalan[0]), jarak: 1.5,
      cara: 'nama terpotong' };
  }
  return null;
}

/* Nama kantor yang sudah dipakai di data, sebagai daftar master cadangan
   ketika sebuah kantor belum didaftarkan di menu Layanan sama sekali. */
function _layananTerpakai(){
  var pakai = {};
  var tambah = function(n){
    var s = String(n || '').trim();
    if (!s || !/^(KLL|ULL)\b/i.test(s)) return;
    var k = _norm(s);
    if (!pakai[k]) pakai[k] = { nama: s.replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, ''), tipe: s.slice(0,3).toUpperCase(), n: 0 };
    pakai[k].n++;
  };
  (readAll(SHEETS.UANGMUKA) || []).forEach(function(r){ tambah(r.layanan); });
  (readAll(SHEETS.PENTASYARUFAN) || []).forEach(function(r){ if (/^UMP\s+LPJ/i.test(String(r.section || ''))) tambah(r.namaPenerima); });
  return Object.keys(pakai).map(function(k){ return pakai[k]; });
}

function resolveLayananName(r, layList, layMap){
  if (!r) return LAYANAN_DAERAH;
  layList = layList || [];

  // 1. Referensi eksplisit selalu menang — tidak perlu menebak dari teks.
  if (r.layananId && layMap && layMap[r.layananId]) return _layLabel(layMap[r.layananId]);

  var raws = [r.namaDonatur, r.namaPenerima, r.program, r.keterangan]
    .map(function(x){ return String(x == null ? '' : x).trim(); })
    .filter(function(x){ return x.length > 0; });
  if (!raws.length) return LAYANAN_DAERAH;
  var rawBlob = raws.join(' | ');
  var blob = _norm(rawBlob);

  // 2. Penanda eksplisit KLL/ULL.
  var pre = _layFromPrefix(rawBlob, layList);
  if (pre) {
    var cand = _norm(pre.nama);
    var hit = null;
    layList.forEach(function(l){
      var ln = _norm(l && l.nama);
      var kd = _norm(l && l.kode);
      // cocok lewat KODE (mis. "SDUA") atau lewat NAMA
      if (kd && kd.length >= 2 && (cand === kd || _containsWord(cand, kd))) {
        if (!hit) hit = l;
        return;
      }
      if (!ln || ln.length < 3) return;
      if (_containsWord(cand, ln) || cand.indexOf(ln) === 0 || ln.indexOf(cand) === 0) {
        if (!hit || ln.length > _norm(hit.nama).length) hit = l;
      }
    });
    if (hit) return _layLabel(hit);
    /* Belum ada yang cocok persis: mungkin hanya salah ketik. Kalau ada nama
       terdaftar yang cukup dekat, pakai nama terdaftar itu — kalau tidak,
       biarkan apa adanya supaya tidak ada uang yang pindah kantor diam-diam. */
    var dekat = _padanLayanan(pre.tipe + ' ' + pre.nama, layList);
    if (dekat) return dekat.label;
    /* Belum terdaftar di master Layanan pun tetap dihitung sebagai KLL/ULL —
       kalau dipaksa masuk "Penghimpunan Daerah", rekapnya justru salah. */
    return pre.tipe + ' ' + pre.nama;
  }

  // 2b. Data lama memakai "Lazismu Daerah Bantul" sebagai nama donatur bawaan.
  //     Itu artinya tingkat daerah — bukan KLL bernama "Bantul".
  if (/lazismu daerah|daerah bantul|penghimpunan daerah/.test(blob)) return LAYANAN_DAERAH;

  /* 3. Tipe donatur yang dipilih sendiri oleh petugas juga penanda tegas.
        Namanya boleh ditulis tanpa awalan, mis. tipe "Kantor Layanan (KLL)"
        dengan nama "Srandakan". */
  var td = _norm(r.tipeDonatur);
  if (td.indexOf('kantor layanan') >= 0 || td.indexOf('unit layanan') >= 0 || td === 'kll' || td === 'ull') {
    var tipeT = (td.indexOf('unit layanan') >= 0 || td === 'ull') ? 'ULL' : 'KLL';
    var namaT = String(r.namaDonatur || r.namaPenerima || '').trim();
    if (namaT) {
      var cT = _norm(namaT.replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, ''));
      var hitT = null;
      layList.forEach(function(l){
        var ln = _norm(l && l.nama), kd = _norm(l && l.kode);
        if (kd && kd.length >= 2 && cT === kd) { if (!hitT) hitT = l; return; }
        if (!ln || ln.length < 3) return;
        if (cT === ln || _containsWord(cT, ln)) {
          if (!hitT || ln.length > _norm(hitT.nama).length) hitT = l;
        }
      });
      if (hitT) return _layLabel(hitT);
      var dekatT = _padanLayanan(tipeT + ' ' + namaT, layList);
      if (dekatT) return dekatT.label;
      return tipeT + ' ' + namaT.replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, '');
    }
  }

  /* 3c. Nama donatur yang SAMA PERSIS dengan nama sebuah kantor terdaftar,
         hanya awalan KLL/ULL-nya yang lupa ditulis.

         Ini bukan tebakan: yang dibandingkan seluruh namanya, bukan sepotong
         di dalamnya, jadi aturan di nomor 4 di bawah tetap utuh — "SMP N 2
         Srandakan" tidak pernah sama persis dengan "Srandakan". Tanpa langkah
         ini, satu kwitansi yang ditulis "Masjid Baiturrahman Aceh" (tanpa ULL)
         jatuh ke Penghimpunan Daerah, sementara kwitansi sebelah yang ditulis
         lengkap masuk ke ULL-nya. Kantor yang sama lalu tampak "0 setoran"
         padahal setorannya ada, dan selisihnya muncul sebagai saldo minus
         yang tidak bisa dijelaskan siapa pun. */
  var _donat = _norm(String(r.namaDonatur || r.namaPenerima || '').trim());
  if (_donat && _donat.length >= 4) {
    var _pas = null;
    layList.forEach(function(l){
      if (!l || !l.nama || _pas) return;
      if (_norm(l.nama) === _donat) _pas = l;
    });
    if (_pas) return _layLabel(_pas);
  }

  /* 4. Tidak ada penanda KLL/ULL -> penghimpunan tingkat daerah.
        Nama layanan yang kebetulan muncul di dalam nama donatur TIDAK
        dihitung: "SMP N 2 Srandakan" adalah donatur tingkat daerah,
        bukan KLL Srandakan; "Jamaah Masjid At Tauhid - Kekeringan Dlingo"
        juga daerah, bukan KLL Dlingo. */
  return LAYANAN_DAERAH;
}

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

/* `rentang` (opsional) = {dari, sampai} dalam 'yyyy-mm-dd'. Bila diisi, jurnal
   disusun untuk rentang tanggal bebas, bukan satu bulan penuh. */
function _getJurnalData(year, month, rentang) {
  var listRek = readAll(SHEETS.REKENING) || [];
  var layMap={}; readAll(SHEETS.LAYANAN).forEach(function(l){layMap[l.id]=l;});

  var pakaiRentang = !!(rentang && rentang.dari && rentang.sampai);
  var rDari = pakaiRentang ? String(rentang.dari).slice(0,10) : '';
  var rSampai = pakaiRentang ? String(rentang.sampai).slice(0,10) : '';

  function dalamPeriode(r){
    if(!r.tanggal) return false;
    if (pakaiRentang) return _dalamRentang(r.tanggal, rDari, rSampai);
    var d=new Date(r.tanggal);
    return d.getFullYear()===year&&(d.getMonth()+1)===month;
  }

  var himpunRows=readAll(SHEETS.PENGHIMPUNAN).filter(dalamPeriode);
  var salurRows=readAll(SHEETS.PENTASYARUFAN).filter(dalamPeriode);
  
  function catTerikat(r){ var s=(r.pilar||r.subJenis||'').replace(/infak/ig,'').replace(/terikat/ig,'').replace(/[-•]/g,' ').trim(); return s||'Umum'; }
  var _layList = readAll(SHEETS.LAYANAN) || [];
  /* Aturan keterangan jurnal: "{jenisDana} {subJenis} {namaDonatur/KLL/ULL} | Fr: {fundraising}".
     Label donatur memakai nama KLL/ULL bila transaksi memang milik salah satu
     layanan — termasuk saat penandanya hanya tertulis di keterangan. */
  function donorLabel(r){
    if(r.layananId&&layMap[r.layananId]){var l=layMap[r.layananId];return (l.tipe==='ULL'?'ULL ':'KLL ')+l.nama;}
    var resolved = resolveLayananName(r, _layList, layMap);
    if (resolved !== LAYANAN_DAERAH) return resolved;
    return r.namaDonatur||r.namaLayanan||'-';
  }
  
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
    /* Bagi hasil bank punya seksi dan akun kredit sendiri, mengikuti berkas
       acuan: "Penerimaan Bagi Hasil Rek {Dana}". Dananya tetap dana rekening
       asalnya, jadi saldo Zakat/Infak/Amil ikut bertambah sebagaimana mestinya. */
    var _bagiHasil = sl.indexOf('bagi hasil') >= 0;
    if (_bagiHasil) {
      var _bhDana = jl.indexOf('zakat')>=0 ? 'Zakat'
                  : jl.indexOf('amil')>=0  ? 'Amil'
                  : jl.indexOf('wakaf')>=0 ? 'Wakaf'
                  : (jl.indexOf('infak')>=0||jl.indexOf('infaq')>=0||jl.indexOf('sedekah')>=0)
                      ? (r.pilar ? 'Infak Terikat' : 'Infak')
                      : (r.jenisDana||'Lainnya');
      var _bhKat = (_bhDana === 'Infak Terikat' && r.pilar) ? (' ' + jpBersih(r.pilar)) : '';
      groupLabel = 'BAGI HASIL';
      debitBase  = _bhDana.replace(/\s*terikat\s*$/i, '');
      creditAcc  = 'Penerimaan Bagi Hasil Rek ' + _bhDana + _bhKat;
      ketPrefix  = 'Bagi Hasil Bank';
    }
    else if(jl.indexOf('zakat')>=0){
      groupLabel='ZAKAT';
      debitBase='Zakat';
      var cleanSub = r.subJenis ? String(r.subJenis).replace(/^zakat\s+/i, '') : '';
      creditAcc='Penerimaan Zakat'+(cleanSub?(' '+cleanSub):'');
      ketPrefix=r.subJenis||'Zakat';
    }
    else if(jl.indexOf('amil')>=0){ groupLabel='AMIL'; debitBase='Amil'; creditAcc='Penerimaan Amil'+(r.pilar?' '+r.pilar:''); ketPrefix='Amil'; }
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
      if (groupLabel === 'BAGI HASIL') secKey = 'BAGI HASIL';
      else if (groupLabel === 'BAGI HASIL BANK') secKey = 'BAGI HASIL BANK';
      else if (groupLabel === 'PENGEMBALIAN UMP') secKey = 'PENGEMBALIAN UMP';
      else secKey = 'PENERIMAAN '+groupLabel+' VIA '+via;
    }
    
    var debitAcc = getCleanBankName(r, via);
    if (!debitAcc || debitAcc === 'Kas') {
      debitAcc = (via==='BANK'?'Bank ':'Kas ')+debitBase;
    }
    
    /* Keterangan jurnal: {Nama Donatur / KLL / ULL} {Jenis Dana}[ {Peruntukan}]
       Nama petugas fundraising sengaja TIDAK dicantumkan di jurnal.

       Khusus INFAK/SEDEKAH TERIKAT keterangannya berhenti di "Infak Terikat".
       Pilar dan peruntukannya (Kesehatan, Ambulan, Bencana NTT, ...) tetap
       tersimpan di basis data dan tetap muncul di Laporan — hanya tidak ikut
       dicetak di jurnal supaya kolomnya ringkas dan seragam. */
    var _terikat = /terikat/i.test(ketPrefix);
    var ket;
    if (_bagiHasil) {
      /* Keterangan bagi hasil menyebut dana dan rekening asalnya, bukan nama donatur. */
      ket = jpBersih(String(r.keterangan||'').trim() || ('Bagi hasil bank ' + debitBase.toLowerCase()));
    } else if (_terikat) {
      ket = jpBersih(donorLabel(r) + ' ' + ketPrefix);
    } else {
      var _peruntukan = String(r.program||'').trim();
      if (/^(penerimaan|setor tunai)/i.test(_peruntukan)) _peruntukan = '';
      if (_peruntukan && jpNorm(_peruntukan) === jpNorm(ketPrefix)) _peruntukan = '';
      ket = jpBersih(donorLabel(r) + ' ' + ketPrefix + (_peruntukan ? ' ' + _peruntukan : ''));
      var _catatan = String(r.keterangan||'').trim();
      if (_catatan && jpInti(ket).indexOf(jpInti(_catatan)) < 0) ket += ' — ' + _catatan;
    }
    
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
  
  /* Urutan kelompok mengikuti berkas jurnal acuan:
     Zakat -> Infak Umum -> Infak Terikat -> Amil -> Wakaf. */
  var order=[
    'PENERIMAAN ZAKAT VIA KAS', 'PENERIMAAN ZAKAT VIA BANK',
    'PENERIMAAN INFAK UMUM VIA KAS', 'PENERIMAAN INFAK UMUM VIA BANK',
    'PENERIMAAN INFAK TERIKAT VIA KAS', 'PENERIMAAN INFAK TERIKAT VIA BANK',
    'PENERIMAAN AMIL VIA KAS', 'PENERIMAAN AMIL VIA BANK',
    'PENERIMAAN WAKAF VIA KAS', 'PENERIMAAN WAKAF VIA BANK',
    'BAGI HASIL', 'BAGI HASIL BANK', 'PENGEMBALIAN UMP',
    'SETOR TUNAI',
    /* --- Pentasyarufan --- */
    'UMP ZAKAT', 'UMP INFAK', 'UMP AMIL',
    'PENYALURAN ZAKAT', 'PENYALURAN INFAK UMUM', 'PENYALURAN INFAK TERIKAT',
    'PENGELUARAN OPERASIONAL VIA BANK', 'PENGELUARAN OPERASIONAL VIA KAS',
    'OPERASIONAL AMIL VIA BANK', 'OPERASIONAL AMIL VIA KAS',
    'BIAYA ADMINISTRASI BANK',
    'UMP LPJ ZAKAT', 'UMP LPJ INFAK', 'UMP LPJ AMIL'
  ];
  
  var keys=Object.keys(secMap).sort(function(a,b){var ia=order.indexOf(a),ib=order.indexOf(b);return (ia<0?99:ia)-(ib<0?99:ib);});
  var sections=keys.map(function(k){return secMap[k];}); var grand=0; sections.forEach(function(s){grand+=s.subtotal;});
  
  var totalCount = himpunRows.length + salurRows.length;
  return {
    title: 'JURNAL TRANSAKSI',
    periode: pakaiRentang ? _labelRentang(rDari, rSampai) : ((BULAN[month]||'')+' '+year),
    bulan: month,
    tahun: year,
    dari: rDari,
    sampai: rSampai,
    modeRentang: pakaiRentang,
    sections: sections,
    grandTotal: grand,
    count: totalCount,
    settings: getAllSettings()
  };
}

/* Label periode untuk rentang bebas: "5 – 20 Agustus 2026" bila masih satu
   bulan, "28 Juli – 3 Agustus 2026" bila beda bulan, lengkap dengan tahun
   di kedua sisi bila tahunnya juga berbeda. */
function _labelRentang(dari, sampai){
  var a = String(dari||'').split('-'), b = String(sampai||'').split('-');
  if (a.length < 3 || b.length < 3) return (dari||'') + ' – ' + (sampai||'');
  var ta = Number(a[0]), ba = Number(a[1]), ha = Number(a[2]);
  var tb = Number(b[0]), bb = Number(b[1]), hb = Number(b[2]);
  if (dari === sampai) return ha + ' ' + BULAN[ba] + ' ' + ta;
  if (ta === tb && ba === bb) return ha + ' – ' + hb + ' ' + BULAN[bb] + ' ' + tb;
  if (ta === tb) return ha + ' ' + BULAN[ba] + ' – ' + hb + ' ' + BULAN[bb] + ' ' + tb;
  return ha + ' ' + BULAN[ba] + ' ' + ta + ' – ' + hb + ' ' + BULAN[bb] + ' ' + tb;
}

/* `rentang` opsional: {dari, sampai}. Bila diisi, bulan & tahun diabaikan. */
function apiJurnalData(t,year,month,rentang){
  _requirePerm(t,'laporan','view');
  if (rentang && rentang.dari && rentang.sampai){
    var dari = String(rentang.dari).slice(0,10), sampai = String(rentang.sampai).slice(0,10);
    if (!_tglSah(dari) || !_tglSah(sampai)) throw new Error('Tanggal awal dan tanggal akhir harus diisi.');
    if (dari > sampai) throw new Error('Tanggal awal tidak boleh melewati tanggal akhir.');
    return _getJurnalData(0, 0, { dari: dari, sampai: sampai });
  }
  return _getJurnalData(Number(year), Number(month));
}

/* Membangun berkas Excel jurnal satu bulan SAAT DIMINTA dan mengembalikannya
   sebagai data URL. Tidak disimpan ke database.

   Versi lama menyimpan hasilnya sebagai base64 di Settings pada SETIAP simpan
   transaksi. Karena seluruh database hidup di satu kunci Redis yang dibaca-
   tulis tiap permintaan, setiap bulan menambah satu berkas Excel utuh ke
   payload itu — sampai suatu saat melewati batas ukuran permintaan Upstash
   dan semua penulisan gagal. */
async function bangunJurnalXlsx(filterMonth) {
  if (!filterMonth || filterMonth === 'Semua') return '';
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
  return 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + base64;
}

/* Dipanggil setelah setiap simpan transaksi (nama dipertahankan agar semua
   pemanggil lama tetap berlaku). Kini hanya membersihkan berkas Excel lama
   yang terlanjur tersimpan di Settings — sekali saja, lalu ditandai. */
async function syncMonthlySpreadsheet(filterMonth) {
  if (DB && DB.props && DB.props._xlsxDibersihkan) return;
  var sisa = (readAll(SHEETS.SETTINGS) || []).filter(function(r){
    return /^sheet_(data|url|updated)_/.test(String(r.key || ''));
  });
  sisa.forEach(function(r){ deleteRowBy(SHEETS.SETTINGS, 'key', r.key); });
  if (DB && DB.props) DB.props._xlsxDibersihkan = true;
  if (sisa.length) console.log('Dibersihkan ' + sisa.length + ' berkas Excel lama dari database');
}

/* ===== BROADCAST WHATSAPP ===== */
function apiBroadcastReport(t,start,end){
  _requirePerm(t,'laporan','view');
  var s=new Date(start); s.setHours(0,0,0,0); var e=new Date(end); e.setHours(23,59,59,999);
  function inRange(r){ if(!r.tanggal)return false; var d=new Date(r.tanggal); return d>=s&&d<=e; }
  var H=readAll(SHEETS.PENGHIMPUNAN).filter(inRange), T=readAll(SHEETS.PENTASYARUFAN).filter(inRange);

  /* ----------------------------------------------------------------
     Pengelompokan harus MENYELURUH: setiap rupiah wajib masuk tepat
     satu keranjang, supaya rincian yang ditampilkan selalu berjumlah
     sama dengan totalnya.

     Versi lama memakai pencocokan persis (g === 'zakat') dan tidak
     punya keranjang cadangan pada cabang uang muka program, sehingga
     penyaluran ber-sumberDana selain Zakat/Infak/Amil ikut terhitung
     di total tetapi hilang dari rinciannya — itulah yang membuat
     penjumlahan broadcast tidak pernah cocok.
     ---------------------------------------------------------------- */
  function bcJenis(r){
    var g = _norm(r.jenisDana), sub = _norm(r.subJenis);
    var terikat = sub.indexOf('terikat') >= 0;
    if (g.indexOf('zakat') >= 0) return 'zakat';
    if (g.indexOf('infa') >= 0 || g.indexOf('sedekah') >= 0 || g.indexOf('shodaqoh') >= 0)
      return terikat ? 'infakTerikat' : 'infakUmum';
    if (g.indexOf('amil') >= 0) return 'amil';
    if (g.indexOf('wakaf') >= 0) return 'wakaf';
    if (g.indexOf('kurban') >= 0 || g.indexOf('qurban') >= 0) return 'kurban';
    if (g.indexOf('fidyah') >= 0) return 'fidyah';
    if (g.indexOf('dskl') >= 0) return 'dskl';
    return 'lainnya';
  }
  function bcSumber(r){
    var sd = _norm(r.sumberDana);
    if (sd.indexOf('zakat') >= 0) return 'zakat';
    if (sd.indexOf('infa') >= 0 || sd.indexOf('sedekah') >= 0) return 'infak';
    if (sd.indexOf('amil') >= 0) return 'amil';
    if (sd.indexOf('wakaf') >= 0) return 'wakaf';
    if (sd.indexOf('kurban') >= 0 || sd.indexOf('qurban') >= 0) return 'kurban';
    if (sd.indexOf('dskl') >= 0) return 'dskl';
    return 'lainnya';
  }
  function jumlahPeta(p){ var t=0; Object.keys(p).forEach(function(k){ t += p[k]||0; }); return t; }

  var tH = 0;
  var himpunBreakdown = { zakat:0, infakUmum:0, infakTerikat:0, amil:0, wakaf:0, kurban:0, fidyah:0, dskl:0, lainnya:0 };
  H.forEach(function(r){
    var n = Number(r.jumlah) || 0;
    tH += n;
    himpunBreakdown[bcJenis(r)] += n;
  });

  var salurBreakdown = { zakat:0, infak:0, amil:0, wakaf:0, kurban:0, dskl:0, lainnya:0 };
  var umpBreakdown   = { zakat:0, infakTerikat:0, infakUmum:0, amil:0, lainnya:0 };
  var tT = 0;

  T.forEach(function(r){
    var n = Number(r.jumlah) || 0;
    tT += n;
    var prog = _norm(r.program), ket = _norm(r.keterangan);
    var isUmp = (prog.indexOf('ump') >= 0 || prog.indexOf('uang muka') >= 0
              || ket.indexOf('ump') >= 0 || ket.indexOf('lpj') >= 0 || ket.indexOf('pertanggungjawaban') >= 0);
    var sumber = bcSumber(r);

    if (isUmp) {
      if (sumber === 'zakat') umpBreakdown.zakat += n;
      else if (sumber === 'infak') {
        if (prog.indexOf('terikat') >= 0 || ket.indexOf('terikat') >= 0) umpBreakdown.infakTerikat += n;
        else umpBreakdown.infakUmum += n;
      }
      else if (sumber === 'amil') umpBreakdown.amil += n;
      else umpBreakdown.lainnya += n;          /* keranjang cadangan — dulu tidak ada */
    } else {
      salurBreakdown[sumber] = (salurBreakdown[sumber] || 0) + n;
    }
  });

  var totalUmp = jumlahPeta(umpBreakdown);
  var totalSalurLangsung = jumlahPeta(salurBreakdown);

  function fmtTgl(d){return Utilities.formatDate(d,TZ,'dd MMMM yyyy');}
  var pRaw = start === end ? fmtTgl(s) : fmtTgl(s) + ' s/d ' + fmtTgl(e);

  return {
    periode: fmtTgl(s)+' s/d '+fmtTgl(e),
    periodeRaw: pRaw,
    totalHimpun: tH,
    totalTasyaruf: tT,
    totalUmp: totalUmp,
    totalSalurLangsung: totalSalurLangsung,
    saldo: tH - tT,
    himpunBreakdown: himpunBreakdown,
    salurBreakdown: salurBreakdown,
    umpBreakdown: umpBreakdown,
    /* Selisih harus nol. Dikirim apa adanya supaya ketidakcocokan
       terlihat di layar, bukan diam-diam menempel di salah satu baris. */
    cek: {
      himpun: tH - jumlahPeta(himpunBreakdown),
      tasyaruf: tT - (totalSalurLangsung + totalUmp)
    },
    donatur: uniq(H,'namaDonatur'),
    mustahik: uniq(T,'namaPenerima'),
    trxHimpun: H.length,
    trxTasyaruf: T.length,
    settings: getAllSettings()
  };
}
/* ===== IMPOR LEWAT URL: JANGAN MENJANGKAU JARINGAN INTERNAL =====
   Server dulu mau mengambil alamat apa saja atas permintaan pengguna yang
   login, termasuk localhost, jaringan privat, dan 169.254.169.254 (alamat
   metadata cloud yang di banyak penyedia memberi kredensial server). Itu
   namanya SSRF. Uji tools/test_keamanan_lanjutan.js bagian C membuktikan
   server benar-benar mencoba menghubungi alamat-alamat itu.
   Aturannya: hanya https, nama host tidak boleh localhost atau berujung
   .local/.internal, dan SEMUA alamat IP hasil DNS-nya harus publik. Setiap
   pengalihan (redirect) diperiksa ulang dengan aturan yang sama, karena
   situs publik bisa saja mengalihkan ke alamat internal. */
var _BATAS_UNDUH_IMPOR = 20 * 1024 * 1024;
function _ipPrivat(ip){
  ip = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  var m4 = ip.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m4) {
    var a = +m4[1], b = +m4[2];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (ip.indexOf(':') >= 0) {
    if (ip === '::' || ip === '::1') return true;
    if (/^::ffff:/.test(ip)) return true;                 /* bentuk hex IPv4-dalam-IPv6 */
    if (/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)) return true;
    return false;
  }
  return false;
}
async function _periksaUrlImpor(alamat){
  var u;
  try { u = new URL(String(alamat)); } catch (e) { throw new Error('URL impor tidak dikenali.'); }
  if (u.protocol !== 'https:') throw new Error('URL impor tidak diizinkan: hanya alamat https yang boleh dipakai.');
  var host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) throw new Error('URL impor tidak diizinkan: alamat itu menunjuk ke jaringan internal.');
  var daftar;
  if (require('net').isIP(host)) daftar = [host];
  else {
    try { daftar = (await require('dns').promises.lookup(host, { all: true })).map(function(x){ return x.address; }); }
    catch (e) { throw new Error('Alamat ' + host + ' tidak bisa ditemukan.'); }
  }
  if (!daftar.length || daftar.some(_ipPrivat)) throw new Error('URL impor tidak diizinkan: alamat itu menunjuk ke jaringan internal.');
  return u;
}
async function _ambilUrlImpor(alamat){
  var kini = String(alamat);
  for (var loncat = 0; loncat <= 5; loncat++) {
    await _periksaUrlImpor(kini);
    var res = await fetch(kini, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      kini = new URL(res.headers.get('location'), kini).toString();
      continue;
    }
    if (!res.ok) throw new Error('Status HTTP ' + res.status);
    var panjang = Number(res.headers.get('content-length') || 0);
    if (panjang > _BATAS_UNDUH_IMPOR) throw new Error('Berkas terlalu besar (lebih dari 20 MB).');
    var buf = await res.arrayBuffer();
    if (buf.byteLength > _BATAS_UNDUH_IMPOR) throw new Error('Berkas terlalu besar (lebih dari 20 MB).');
    return buf;
  }
  throw new Error('Terlalu banyak pengalihan alamat.');
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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  /* Urutan hari-bulan-tahun; tahun 2 digit dianggap 20xx.
     Bila angka pertama > 12 sudah pasti hari, bila angka kedua > 12
     berarti berkas memakai urutan bulan-hari (ekspor Excel gaya AS). */
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (m) {
    var a1 = parseInt(m[1], 10), a2 = parseInt(m[2], 10);
    var year = parseInt(m[3], 10); if (year < 100) year += 2000;
    var day = a1, month = a2;
    if (a1 <= 12 && a2 > 12) { day = a2; month = a1; }
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

/* Nama fundraiser. Sebelumnya SEMUA nama di luar 6 nama baku dipaksa jadi
   "Lazismu Daerah Bantul" — itu menghapus rincian sumber (Kantor, Qris,
   Muh Ariyanto, dll) yang dibutuhkan Closing Bulanan. Sekarang nama apa pun
   dipertahankan apa adanya; hanya yang KOSONG yang default ke daerah, dan
   beberapa alias baku dirapikan kapitalnya agar tidak terpecah. */
function cleanFundraisingName(name) {
  var s = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  if (!s) return 'Lazismu Daerah Bantul';
  var alias = {
    'lazismu daerah bantul': 'Lazismu Daerah Bantul',
    'daerah': 'Lazismu Daerah Bantul',
    'kantor': 'Kantor',
    'sherli': 'Sherli', 'renata': 'Renata', 'ariya': 'Ariya',
    'nur yulianto': 'Nur Yulianto', 'muzakki': 'Muzakki'
  };
  var low = s.toLowerCase();
  if (alias[low]) return alias[low];
  return s;
}

/* Nama petugas fundraising TIDAK ditulis di jurnal — yang tertulis di uraian
   adalah nama donatur. Karena itu nama petugas hanya diakui bila:
     a. ditandai tegas   : "... via Sherli", "oleh Renata", "Fr: Ariya"
     b. seluruh nama donaturnya memang persis nama petugas itu
   Pencocokan potongan kata dilarang: "Sariyati" bukan petugas "Ariya",
   "Hafidz Ariyadi" bukan "Ariya". Daftarnya diambil dari Pengaturan >
   Fundraising, bukan daftar tetap di kode. */
function extractFundraisingFromText(text) {
  if (!text) return '';
  var s = String(text).trim();
  var norm = jpNorm(s);
  var donor = jpNorm(s
    .replace(/^\s*(infa[kq]|zakat|sedekah|wakaf|kurban|qurban|fidyah|amil|dskl)\b/i, '')
    .replace(/^[^a-zA-Z0-9]*(umum|terikat|mal|fitrah|profesi|penghasilan|perdagangan|pertanian|uang)\b/i, ''));
  var daftar = [];
  try { daftar = _bacaFundraising(); } catch (e) { daftar = FUNDRAISING_DEFAULT.slice(); }
  for (var i = 0; i < daftar.length; i++) {
    var nm = String(daftar[i] || '').trim();
    var n = jpNorm(nm);
    if (!n) continue;
    if (new RegExp('\\b(?:via|oleh|fr|petugas|fundraiser)\\s+' + n + '\\b').test(norm)) return nm;
    if (donor === n) return nm;
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
  /* tahun 2 digit ikut diterima: berkas Excel kerap tampil "8/2/26" */
  return /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2}(\d{2})?$/.test(str)
      || /^\d{4}-\d{2}-\d{2}/.test(str)
      || /^\d{1,2}[\/\- ][A-Za-z]{3,}[\/\- ]\d{2}(\d{2})?$/.test(str);
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

/* Layanan hanya diambil bila teksnya memang menulis KLL / ULL.
   Versi lama mencocokkan nama layanan di mana pun ia muncul, sehingga
   donatur "SMP N 2 Srandakan" ikut terekap ke KLL Srandakan. */
function extractLayananFromText(text, listLayanan) {
  if (!text) return null;
  var pre = _layFromPrefix(String(text), readAll(SHEETS.LAYANAN) || []);
  if (!pre) return null;
  /* Aturan cocoknya satu dengan jalur penghimpunan (_layCocokNama), supaya
     nama yang cocok dengan banyak kantor tidak ditebak di salah satu jalur. */
  return _layCocokNama(pre, listLayanan);
}

/* Deteksi pilar dari teks peruntukan. Aturannya disamakan dengan
   pembacaan buku kas, dan pencocokannya memakai batas kata — versi lama
   memakai potongan huruf ("sd", "tk", "sma") sehingga nama donatur
   seperti "SMP N 2 Srandakan" ikut terbaca sebagai pilar Pendidikan. */
function detectPilarFromText(text) {
  if (!text) return '';
  var s = ' ' + String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  function ada(re){ return re.test(s); }

  if (ada(/\bpalestin\w*\b|\bgaza\b|\bntt\b|\bnusa tenggara timur\b/)) return 'Kemanusiaan';
  if (ada(/\bkekeringan\b|\bdropping air\b/)) return 'Sosial Dakwah';
  if (ada(/\bkesehatan\b|\bambulan\w*\b|\bklinik\b|\bberobat\b|\bdonor darah\b|\bsakit\b|\bobat\b/)) return 'Kesehatan';
  if (ada(/\bpendidikan\b|\bsekolah\b|\bbeasiswa\b|\bppdb\b|\bpesantren\b|\bpondok\b|\bmadrasah\b|\bsantri\b|\bguru\b|\bgtt\b|\bptt\b|\bsdua\b|\bsd\b|\bsmp\b|\bsma\b|\bsmk\b|\btk\b|\baba\b|\buad\b|\bkuliah\b/)) return 'Pendidikan';
  if (ada(/\bkemanusiaan\b|\bbencana\b|\bgempa\b|\bbanjir\b|\bkebakaran\b|\blongsor\b|\btsunami\b|\berupsi\b|\bpengungsi\b|\bsumatera\b/)) return 'Kemanusiaan';
  if (ada(/\bqurban\b|\bkurban\b|\bdam hadyu\b|\bjagalmu\b/)) return 'Qurban';
  if (ada(/\bumkm\b|\busaha\b|\bmodal\b|\bekonomi\b/)) return 'Ekonomi';
  if (ada(/\blingkungan\b|\bsampah\b/)) return 'Lingkungan';
  if (ada(/\bkeagamaan\b|\bmuadzin\b/)) return 'Keagamaan';
  return 'Sosial Dakwah';
}

/* ================================================================
   JURNAL PENERIMAAN — pembacaan berbasis AKUN KREDIT
   ----------------------------------------------------------------
   Berkas jurnal ditulis berpasangan:
     baris 1 (debet)  : tanggal | nama rekening bank | jumlah |        | uraian
     baris 2 (kredit) : tanggal | Penerimaan ...     |        | jumlah | uraian
   Baris kredit sudah menyebut jenis dananya secara tegas
   ("Penerimaan Zakat Mal", "Penerimaan Infak Terikat - Kemanusiaan"),
   jadi itulah yang dipakai — bukan menebak dari nomor rekening.
   Cara lama menebak lewat potongan nomor ("9004", "880") membuat
   rekening Infak Umum 1011959004 dan 0469988000 ikut terbaca Zakat.
   ================================================================ */
function jpBersih(x){ return String(x==null?'':x).replace(/\s+/g,' ').trim(); }
/* Nama pilar di akun kredit ditulis berbeda-beda antar bulan
   ("Infak Terikat - Sosial" Jan-Mar, "- Sosial Dakwah" sejak Mar). Disamakan
   supaya laporan tidak memecah satu pilar menjadi dua baris. Nama kategori
   di luar empat pilar (Qurban, Fidyah, DAM, dsb.) dibiarkan apa adanya. */
function jpPilarBaku(x){
  var s = jpBersih(x), l = jpNorm(s);
  if (!l) return s;
  if (l === 'sosial' || l === 'dakwah' || l === 'sosial dakwah' || l === 'dakwah sosial') return 'Sosial Dakwah';
  if (l === 'kemanusiaan' || l === 'bencana' || l === 'sosial kemanusiaan') return 'Kemanusiaan';
  if (l === 'pendidikan') return 'Pendidikan';
  if (l === 'kesehatan') return 'Kesehatan';
  return s;
}
function jpNorm(x){ return String(x==null?'':x).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
/* Sisa kata setelah istilah jenis dana dibuang — dipakai untuk menguji apakah
   catatan bebas benar-benar membawa keterangan baru atau hanya mengulang. */
function jpInti(x){
  return jpNorm(x).replace(/\b(zakat|infak|infaq|sedekah|wakaf|amil|dskl|terikat|umum|penerimaan|mal|fitrah|pertanian|profesi|penghasilan|perdagangan|simpanan|emas|perak|uang)\b/g,' ').replace(/\s+/g,' ').trim();
}

/* Cocokkan ekor akun zakat ke daftar sub jenis resmi. */
function jpSubZakat(sisa){
  var t = jpBersih(sisa);
  if (!t) return 'Zakat Mal';
  if (!/^zakat\b/i.test(t)) t = 'Zakat ' + t;
  var opsi = (typeof SUBJENIS !== 'undefined' && SUBJENIS['Zakat']) ? SUBJENIS['Zakat'] : [];
  var c = jpNorm(t).replace(/ /g,'');
  for (var i=0;i<opsi.length;i++) if (jpNorm(opsi[i]).replace(/ /g,'') === c) return opsi[i];
  for (var j=0;j<opsi.length;j++) if (c && jpNorm(opsi[j]).replace(/ /g,'').indexOf(c) === 0) return opsi[j];
  return t;
}

/* Akun kredit -> jenis dana, sub jenis, dan pilar. */
/* Akun neraca yang BUKAN uang: persediaan barang, piutang, aktiva tetap, dan
   akumulasi/beban penyusutan. Barang masuk & barang tersalur tetap dicatat
   sebagai penghimpunan/penyaluran (memang donasi), tetapi tidak boleh menambah
   atau mengurangi saldo kas & bank. */
/* Daftar nama akun bank/kas yang muncul di jurnal tetapi belum terdaftar di
   Pengaturan > No. Rekening. Uangnya tetap dicatat, tetapi tidak bisa
   ditempelkan ke rekening manapun sehingga saldonya bisa salah tempat —
   karena itu ditampilkan sebagai peringatan sebelum impor. */
/* Label yang memang berbentuk rekening bank: mengandung nomor rekening.
   Kas dana, akun UMP, persediaan, dan akun beban bukan rekening. */
function _tampakRekening(label){
  var t = String(label || '').trim();
  if (!t || /^kas\b/i.test(t) || /^ump\b/i.test(t) || _akunNonKas(t)) return false;
  return /\d{6,}/.test(t);
}
function _kumpulAkunAsing(hasil, listRek){
  var set = {}, out = [];
  var tambah = function(label){
    var t = String(label || '').trim();
    if (!t || !_tampakRekening(t)) return;
    if (akunDariLabel(t, listRek).dikenal) return;   /* sudah terdaftar */
    var k = t.toLowerCase();
    if (!set[k]) { set[k] = 1; out.push(t); }
  };
  (hasil.himpunRows || []).concat(hasil.salurRows || []).forEach(function(r){ if (!r.rekeningId) tambah(r.bank); });
  (hasil.umpRows || []).forEach(function(r){ tambah(r.akun); });
  (hasil.transferRows || []).forEach(function(r){ tambah(r.dariAkun); tambah(r.keAkun); });
  return out;
}

function _akunNonKas(label){
  var s = String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return false;
  return /^persediaan\b/.test(s) || /^piutang\b/.test(s) || /^utang\b/.test(s)
      || /^(akumulasi|beban)\s+penyusutan\b/.test(s)
      || /^(aktiva|aset)\b/.test(s) || /^inventaris\b/.test(s);
}

/* Judul seksi ditulis berbeda-beda antar bulan (dan kadang salah ketik).
   Semua varian disamakan ke satu nama baku supaya klasifikasinya tidak
   bergantung pada ejaan penulis jurnal. */
function jpSeksiBaku(sec){
  var s = String(sec == null ? '' : sec).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return s;
  s = s.replace(/\bOPESIONAL\b/g, 'OPERASIONAL').replace(/\bPENYALIRAN\b/g, 'PENYALURAN');
  var m;
  if ((m = s.match(/^UMP\s+LPJ\s+(ZAKAT|INFAK|AMIL)\b/))) return 'UMP LPJ ' + m[1];
  if ((m = s.match(/^PENYALURAN\s+UMP\s+(ZAKAT|INFAK|AMIL)\b/))) return 'UMP LPJ ' + m[1];
  if ((m = s.match(/^UMP\s+(ZAKAT|INFAK|AMIL)\b/))) return 'UMP ' + m[1];
  if (/^PENGEMBALIAN\s+(UMP|UANG\s+MUKA)\b/.test(s)) return 'PENGEMBALIAN UMP';
  if (/^SETOR\s+TUNAI\b/.test(s)) return 'SETOR TUNAI';
  if (/^TARIK\s+TUNAI\b/.test(s)) return 'TARIK TUNAI';
  if (/^MUTASI\s+(DANA|BANK|KAS|ANTAR)\b/.test(s)) return 'MUTASI DANA';
  /* uang masuk yang bukan donasi: hasil penjualan barang & pelunasan piutang */
  if (/^PENJUALAN\b/.test(s) || /^PELUNASAN\s+PIUTANG\b/.test(s)) return 'MUTASI DANA';
  if (/^PENYUSUTAN\b/.test(s)) return 'PENYUSUTAN';
  if (/^BIAYA\s+ADMINISTRASI\b/.test(s)) return 'BIAYA ADMINISTRASI BANK';
  if (/^BAGI\s+HASIL\b/.test(s)) return 'BAGI HASIL BANK';
  if (/^OPERASIONAL\s+AMIL\s+VIA\s+KAS\b/.test(s)) return 'OPERASIONAL AMIL VIA KAS';
  if (/^OPERASIONAL\s+AMIL\b/.test(s)) return 'OPERASIONAL AMIL VIA BANK';
  if (/^PENGELUARAN\s+OPERASIONAL\s+VIA\s+KAS\b/.test(s)) return 'PENGELUARAN OPERASIONAL VIA KAS';
  if (/^PENGELUARAN\s+OPERASIONAL\b/.test(s)) return 'PENGELUARAN OPERASIONAL VIA BANK';
  if (/^PENYALURAN\s+ZAKAT\b/.test(s)) return 'PENYALURAN ZAKAT';
  if (/^PENYALURAN\s+(INFAK|INFAQ|SEDEKAH)\s+TERIKAT\b/.test(s)) return 'PENYALURAN INFAK TERIKAT';
  if (/^PENYALURAN\s+(INFAK|INFAQ|SEDEKAH)\b/.test(s)) return 'PENYALURAN INFAK UMUM';
  if (/^PENYALURAN\s+PERSEDIAAN\b/.test(s)) return 'PENYALURAN PERSEDIAAN';
  return s;
}

/* Kantor terdaftar untuk hasil _layFromPrefix. Urutannya: id alias, nama
   atau kode yang sama persis, lalu nama terdaftar yang menjadi AWAL nama
   tertulis ("Bambanglipuro Nusa Tenggara Timur" -> Bambanglipuro, ekornya
   keterangan). Yang sebaliknya, nama tertulis menjadi awal nama terdaftar
   ("Masjid" untuk "Masjid Baiturrahman Aceh"), hanya diterima kalau
   kantornya TEPAT SATU. Dulu yang terpanjang yang diambil, jadi "ULL Masjid"
   diam-diam masuk ke masjid dengan nama terpanjang. */
function _layCocokNama(pre, listLayanan){
  if (!pre) return null;
  var daftar = (listLayanan || []).filter(function(l){
    return l && l.nama && (!l.tipe || !pre.tipe || String(l.tipe).toUpperCase() === pre.tipe);
  });
  if (pre.id) { for (var i = 0; i < daftar.length; i++) if (daftar[i].id === pre.id) return daftar[i]; }
  var c = jpNorm(pre.nama), hit = null, awalan = [];
  daftar.forEach(function(l){
    var ln = jpNorm(l.nama), kd = jpNorm(l.kode);
    if (kd && kd.length >= 2 && c === kd) { if (!hit) hit = l; return; }
    if (!ln || ln.length < 3) return;
    if (c === ln || c.indexOf(ln + ' ') === 0) {
      if (!hit || ln.length > jpNorm(hit.nama).length) hit = l;
    } else if (ln.indexOf(c + ' ') === 0) awalan.push(l);
  });
  if (hit) return hit;
  return awalan.length === 1 ? awalan[0] : null;
}

function jpDanaDariAkun(akunKredit){
  var s = jpBersih(akunKredit).replace(/^penerimaan\s+/i,'');
  var low = s.toLowerCase();
  var out = { jenisDana:'', subJenis:'', pilar:'' };

  var mT = s.match(/^(infa[kq]|sedekah)\s+terikat\s*(?:[-–—:]\s*)?(.*)$/i);
  if (mT){
    out.jenisDana = /sedekah/i.test(mT[1]) ? 'Sedekah' : 'Infak';
    out.subJenis  = out.jenisDana + ' Terikat';
    out.pilar     = jpPilarBaku(mT[2]);
    return out;
  }
  var mU = s.match(/^(infa[kq]|sedekah)\s+umum\b/i);
  if (mU){
    out.jenisDana = /sedekah/i.test(mU[1]) ? 'Sedekah' : 'Infak';
    out.subJenis  = out.jenisDana + ' Umum';
    return out;
  }
  if (/^zakat\b/i.test(s)){
    out.jenisDana = 'Zakat';
    out.subJenis  = jpSubZakat(s);
    return out;
  }
  if (/^amil\b/i.test(s)){
    out.jenisDana = 'Amil';
    out.subJenis  = 'Amil';
    out.pilar     = jpPilarBaku(s.replace(/^amil\s*(?:[-–—:]\s*)?/i,''));
    return out;
  }
  if (/^wakaf\b/i.test(s)){
    out.jenisDana = 'Wakaf';
    out.subJenis  = jpBersih(s) || 'Wakaf Uang';
    return out;
  }
  /* Bagi hasil bank mengikuti dana rekening asalnya, sesuai akun kreditnya:
       "Bagi Hasil Rek Zakat"                       -> Zakat
       "Bagi Hasil Rek Amil"                        -> Amil
       "Bagi Hasil Rek Infak Terikat Kemanusiaan"   -> Infak terikat, pilar Kemanusiaan
       "Bagi Hasil Bank" (tanpa asal dana)          -> DSKL
     Sub jenisnya selalu "Bagi Hasil Bank" supaya mudah dipisah di laporan. */
  if (low.indexOf('bagi hasil') >= 0){
    out.subJenis = 'Bagi Hasil Bank';
    var asal = jpBersih(s.replace(/^.*?bagi\s+hasil\s*/i, '')
                         .replace(/^(bank|rek(?:ening)?)\s+/i, '')
                         .replace(/^(bank|rek(?:ening)?)$/i, ''));
    var mBT = asal.match(/^(infa[kq]|sedekah)\s+terikat\s*(?:[-–—:]\s*)?(.*)$/i);
    if (mBT){
      out.jenisDana = /sedekah/i.test(mBT[1]) ? 'Sedekah' : 'Infak';
      out.terikat   = true;
      out.pilar     = jpPilarBaku(mBT[2]);
    }
    else if (/^zakat\b/i.test(asal))    out.jenisDana = 'Zakat';
    else if (/^amil\b/i.test(asal))     out.jenisDana = 'Amil';
    else if (/^wakaf\b/i.test(asal))    out.jenisDana = 'Wakaf';
    else if (/^sedekah\b/i.test(asal))  out.jenisDana = 'Sedekah';
    else if (/^infa[kq]\b/i.test(asal)) out.jenisDana = 'Infak';
    else                                out.jenisDana = 'DSKL';
    return out;
  }
  if (/^(infa[kq]|sedekah)\b/i.test(s)){
    out.jenisDana = /sedekah/i.test(s) ? 'Sedekah' : 'Infak';
    out.subJenis  = out.jenisDana + ' Umum';
    return out;
  }
  out.jenisDana = jpBersih(s.split(' ')[0]) || 'Infak';
  out.subJenis  = jpBersih(s) || out.jenisDana;
  return out;
}

/* Pisahkan uraian jadi nama donatur + peruntukan.
   "KLL Imogiri Infak Terikat Ambulan" -> nama "KLL Imogiri", program "Ambulan"
   "Ahmad Solikin Zakat Mal"           -> nama "Ahmad Solikin", program ""      */
function jpPecahUraian(uraian, dana){
  var t = jpBersih(uraian);
  if (!t) return { nama:'', program:'' };
  /* Frasa panjang diuji lebih dulu supaya "Infak Terikat Beasiswa Mentari"
     tidak terpotong jadi peruntukan "Terikat Beasiswa Mentari". */
  var kandidat = [];
  if (dana && dana.subJenis) kandidat.push(dana.subJenis);
  kandidat = kandidat.concat(['Infak Terikat','Infaq Terikat','Sedekah Terikat',
    'Infak Umum','Infaq Umum','Sedekah Umum']);
  if (dana && dana.jenisDana) kandidat.push(dana.jenisDana);
  kandidat = kandidat.concat(['Zakat','Infak','Infaq','Sedekah',
    'Wakaf','Amil','Kurban','Qurban','Fidyah']);
  for (var i=0;i<kandidat.length;i++){
    var kata = jpBersih(kandidat[i]);
    if (!kata) continue;
    var pola = kata.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
    var re, m;
    try { re = new RegExp('\\b' + pola + '\\b','i'); } catch(e){ continue; }
    m = t.match(re);
    if (m && m.index > 0){
      return { nama: jpBersih(t.slice(0, m.index)), program: jpBersih(t.slice(m.index + m[0].length)) };
    }
  }
  return { nama:t, program:'' };
}

/* Metode pembayaran dari nama akun debet / uraian. */
function jpMetode(akunDebet, uraian, seksi){
  var a = String(akunDebet||'').toLowerCase(), u = String(uraian||'').toLowerCase();
  if (/\bqris\b/.test(a) || /\bqris\b/.test(u)) return 'QRIS';
  if (String(seksi||'').toUpperCase().indexOf('VIA KAS') >= 0) return 'Cash/Tunai';
  if (/(^|[^a-z])kas([^a-z]|$)/.test(a) || a.indexOf('tunai') >= 0) return 'Cash/Tunai';
  return 'Transfer Bank';
}

/* Cari rekening terdaftar: nomor dulu (paling pasti), baru nama bank. */
function jpCariRekening(namaAkun, listRek){
  var s = jpBersih(namaAkun);
  if (!s || !listRek || !listRek.length) return null;
  var digit = s.replace(/\D/g,'').replace(/^0+/,'');
  if (digit.length >= 5){
    for (var i=0;i<listRek.length;i++){
      var no = String(listRek[i].nomor||'').replace(/\D/g,'').replace(/^0+/,'');
      if (no && no === digit) return listRek[i];
    }
  }
  var low = s.toLowerCase(), hit = null, panjang = 0;
  for (var j=0;j<listRek.length;j++){
    var nb = String(listRek[j].namaBank||'').toLowerCase().trim();
    if (nb && nb.length >= 4 && low.indexOf(nb) >= 0 && nb.length > panjang){ hit = listRek[j]; panjang = nb.length; }
  }
  return hit;
}

/* Judul seksi mana yang berisi penerimaan. Dulu daftarnya harus cocok persis,
   sehingga berkas berjudul "BAGI HASIL" (bukan "BAGI HASIL BANK") terbaca nol baris. */
function jpSeksiHimpun(sec){
  var s = String(sec || '').toUpperCase().trim();
  if (!s) return false;
  if (s.indexOf('BAGI HASIL') === 0) return true;
  if (s.indexOf('PENERIMAAN') === 0) return true;
  /* PENGEMBALIAN UMP bukan penerimaan: itu sisa uang muka yang kembali —
     dicatat sebagai pergerakan uang muka, bukan penghimpunan. */
  /* SETOR TUNAI sengaja TIDAK dihitung penghimpunan: itu perpindahan uang
     kas (yang sudah tercatat di Jurnal Kas) ke rekening bank, bukan
     penerimaan baru dari donatur — kalau dihitung akan dobel. */
  return false;
}

/* Seksi yang isinya dicatat sebagai penyaluran atau operasional. Daftarnya
   harus sama dengan cabang PENTASYARUFAN di transformJurnalToImportData. */
function jpSeksiSalur(sec){
  return /^(OPERASIONAL AMIL VIA (BANK|KAS)|PENGELUARAN OPERASIONAL VIA (BANK|KAS)|PENYALURAN (ZAKAT|INFAK TERIKAT|INFAK UMUM|PERSEDIAAN)|UMP (LPJ )?(ZAKAT|INFAK|AMIL)|BIAYA ADMINISTRASI BANK)$/
    .test(String(sec || '').toUpperCase().trim());
}

/* Kumpulkan baris yang tanggal debet & kreditnya beda (kemungkinan salah ketik),
   untuk ditampilkan sebagai peringatan sebelum data disimpan. */
/* Baris yang tanggal debet dan kreditnya berbeda. Satu pasangan jurnal
 * mencatat satu perpindahan uang, jadi dua tanggal berarti salah satunya salah
 * ketik, dan yang salah biasanya menyeberang bulan: debet 02-02 sementara
 * kreditnya 01-02 di dalam sheet Januari.
 *
 * UMP DAN TRANSFER IKUT DISISIR, dan itu perbaikan. Dulu hanya penghimpunan
 * dan penyaluran yang diperiksa, padahal uang muka dan mutasi antar rekening
 * sama-sama menggerakkan saldo. Pada berkas jurnal bank setahun milik
 * pengelola, satu-satunya salah tanggal justru ada di baris UMP Amil, dan
 * dengan aturan lama ia lolos tanpa sepatah kata pun. */
function _kumpulAnomaliTgl(himpun, salur, ump, transfer){
  var out = [];
  /* kumpulan + idx adalah ALAMAT barisnya, dan itu yang membuat tanggalnya
     bisa dibetulkan langsung di layar Periksa Data. Tanpa alamat, daftar ini
     cuma bisa memberi tahu ada yang salah lalu menyuruh orang membuka Excel,
     membetulkan di sana, dan mengunggah ulang seluruh berkas. */
  function sisir(rows, jenis, kumpulan){
    (rows || []).forEach(function(r, i){
      if (r && r.tglBeda){
        out.push({
          jenis: jenis,
          kumpulan: kumpulan,
          idx: i,
          nama: r.namaDonatur || r.namaPenerima || r.layanan || r.dariAkun || '-',
          tglDebet: r.tglBeda.debet,
          tglKredit: r.tglBeda.kredit,
          jumlah: r.jumlah || r.nominal || 0,
          keterangan: r.keterangan || ''
        });
      }
    });
  }
  sisir(himpun, 'Penghimpunan', 'himpun');
  sisir(salur, 'Pentasyarufan', 'salur');
  sisir(ump, 'Uang Muka', 'ump');
  sisir(transfer, 'Perpindahan', 'transfer');
  return out;
}

function transformJurnalToImportData(rawRows, listRek, listLayanan) {
  var himpunRows = [];
  var salurRows = [];
  var umpRows = [];        /* uang muka program: keluar / kembali */
  var transferRows = [];   /* setor tunai, tarik tunai, mutasi antar rekening */
  var currentSection = '';

  /* Seksi perpindahan uang internal & UANG MUKA — bukan penerimaan donatur
     maupun penyaluran aktual, jadi tidak diimpor:
       SETOR TUNAI  : kas disetor ke bank (sudah tercatat di Jurnal Kas)
       MUTASI DANA / MUTASI BANK : pemindahan dana antar rekening (mis. hak amil)
       TARIK TUNAI  : penarikan tunai dari bank
       UMP ZAKAT/INFAK/AMIL : UANG MUKA program yang diberikan ke KLL/ULL —
         BUKAN penyaluran. Penyaluran nyata dicatat lewat LPJ (UMP LPJ ...),
         yang mengelompokkan per program sebenarnya. Kalau UMP advance dihitung
         juga, akan dobel dengan LPJ. */
  /* PENYUSUTAN hanya jurnal beban vs akumulasi penyusutan — tidak ada uang
     yang berpindah dan bukan penyaluran, jadi tidak diimpor. */
  var skipSections = ['PENYUSUTAN'];

  /* Seksi PERGERAKAN KAS — bukan penerimaan donatur, bukan penyaluran, tapi
     tetap menggerakkan uang sehingga wajib tercatat agar saldo per rekening
     benar. Arah uang selalu: dari akun KREDIT ke akun DEBET.
       UMP ZAKAT/INFAK/AMIL : uang muka keluar dari rekening/kas ke KLL/ULL
       PENGEMBALIAN UMP     : uang muka kembali ke rekening/kas
       SETOR TUNAI          : kas -> bank      TARIK TUNAI : bank -> kas
       MUTASI DANA / BANK   : rekening -> rekening (mis. hak amil) */
  function _seksiUmpKeluar(sec){ return /^UMP\s+(ZAKAT|INFAK|AMIL)$/i.test(sec); }
  function _seksiTransfer(sec){ return /^(SETOR TUNAI|TARIK TUNAI|MUTASI DANA|MUTASI BANK|MUTASI KAS)$/i.test(sec); }

  /* Sebagian berkas jurnal — misalnya rekap bagi hasil bulanan — hanya berisi
     pasangan debet/kredit tanpa judul seksi sama sekali. Berkas seperti itu
     harus tetap terbaca, jadi baris tanpa seksi diproses HANYA bila memang
     tidak ada satu pun judul seksi di sepanjang berkas. Dengan begitu berkas
     jurnal berseksi tetap berperilaku persis seperti sebelumnya. */
  var adaSeksi = false;
  for (var s0 = 0; s0 < rawRows.length; s0++) {
    if (rawRows[s0] && getSectionHeader(rawRows[s0])) { adaSeksi = true; break; }
  }

  /* TIDAK ADA BARIS YANG BOLEH HILANG TANPA KETERANGAN.
   *
   * Fungsi ini menolak baris di belasan tempat dengan `continue`, dan tiap
   * penolakan itu benar sendiri-sendiri: baris kredit memang pasangannya
   * baris debet, seksi PENYUSUTAN memang bukan uang berpindah. Yang salah
   * adalah diamnya. Pengelola menyerahkan berkas berisi 13.151 baris; kalau
   * yang tercatat 6.439, tiga puluh delapan sisanya lenyap tanpa ada yang
   * tahu nomornya, dan ketahuannya baru saat saldo rekening tidak cocok
   * berbulan-bulan kemudian.
   *
   * Jadi tiap baris yang BENAR-BENAR dipakai ditandai, dan di ujung fungsi
   * sisanya dikumpulkan beserta alasannya. Ditandai di tempat pemakaian,
   * bukan ditebak dari hasilnya: menebak berarti daftar yang dilewati ikut
   * salah setiap kali aturannya berubah. */
  var dipakai = {};
  var seksiBaris = {};

  for (var i = 0; i < rawRows.length; i++) {
    var r = rawRows[i];
    if (!r) continue;

    // Check if it's a section header
    var secHeader = getSectionHeader(r);
    if (secHeader) {
      currentSection = jpSeksiBaku(secHeader);
      continue;
    }

    seksiBaris[i] = currentSection;
    if (skipSections.indexOf(currentSection) >= 0) continue;
    if (!currentSection && adaSeksi) continue;

    /* ---- pergerakan kas: UMP & transfer ---- */
    if (_seksiUmpKeluar(currentSection) || /^PENGEMBALIAN UMP$/i.test(currentSection) || _seksiTransfer(currentSection)) {
      if (!(r.length >= 3 && isValidDateStringOrObject(r[0]))) continue;
      var pDebet = parseAmount(r[2]), pKredit = parseAmount(r[3]);
      if (!(pDebet > 0 && pKredit === 0)) continue;          /* hanya baris debet; kredit = pasangannya */
      var pNext = rawRows[i+1];
      if (!pNext || !isValidDateStringOrObject(pNext[0]) || !(parseAmount(pNext[3]) > 0)) continue;
      var pTgl = parseImportDate(r[0]);
      /* Tanggal pasangannya. Sama alasannya dengan baris penghimpunan:
         dua tanggal untuk satu perpindahan berarti salah satunya salah ketik. */
      var pTglK = parseImportDate(pNext[0]);
      var pBeda = (pTglK && pTglK !== pTgl) ? { debet: pTgl, kredit: pTglK } : null;
      var akunDebet = String(r[1] || '').trim(), akunKredit = String(pNext[1] || '').trim();
      var pUraian = String(r[4] || pNext[4] || '').trim();
      var aD = akunDariLabel(akunDebet, listRek), aK = akunDariLabel(akunKredit, listRek);

      if (_seksiUmpKeluar(currentSection)) {
        /* debet = akun UMP (aset), kredit = rekening/kas yang mengeluarkan uang */
        var dUmp = /ZAKAT/i.test(currentSection) ? 'Zakat' : /AMIL/i.test(currentSection) ? 'Amil' : 'Infak';
        var layU = (typeof _layFromPrefix === 'function') ? _layFromPrefix(pUraian, _layMaster()) : null;
        var layNama = layU ? (layU.tipe + ' ' + layU.nama) : (extractLayananFromText(pUraian, listLayanan) ? _layLabel(extractLayananFromText(pUraian, listLayanan)) : '');
        umpRows.push({ tanggal:pTgl, tglBeda:pBeda, jenis:'keluar', dana:dUmp, layanan:layNama || 'Lainnya',
          akun:aK.label, rekeningId:aK.rekeningId, kasNama:aK.kasNama, nominal:pDebet,
          keterangan:pUraian, section:currentSection, akunDikenal:aK.dikenal });
      } else if (/^PENGEMBALIAN UMP$/i.test(currentSection)) {
        /* debet = rekening/kas yang menerima uang kembali, kredit = akun UMP */
        var dK = /zakat/i.test(akunKredit) ? 'Zakat' : /amil/i.test(akunKredit) ? 'Amil' : 'Infak';
        var layK = (typeof _layFromPrefix === 'function') ? _layFromPrefix(pUraian, _layMaster()) : null;
        umpRows.push({ tanggal:pTgl, tglBeda:pBeda, jenis:'kembali', dana:dK, layanan: layK ? (layK.tipe + ' ' + layK.nama) : 'Lainnya',
          akun:aD.label, rekeningId:aD.rekeningId, kasNama:aD.kasNama, nominal:pDebet,
          keterangan:pUraian, section:currentSection, akunDikenal:aD.dikenal });
      } else {
        var jT = /SETOR/i.test(currentSection) ? 'setor' : /TARIK/i.test(currentSection) ? 'tarik' : 'mutasi';
        transferRows.push({ tanggal:pTgl, tglBeda:pBeda, jenis:jT,
          dariAkun:aK.label, dariRekeningId:aK.rekeningId, dariKas:aK.kasNama,
          keAkun:aD.label, keRekeningId:aD.rekeningId, keKas:aD.kasNama,
          nominal:pDebet, keterangan:pUraian, section:currentSection,
          akunDikenal: aK.dikenal && aD.dikenal });
      }
      dipakai[i] = 1; dipakai[i + 1] = 1;
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
        /* Anomali tanggal: baris debet dan baris kredit pasangannya seharusnya
           bertanggal sama. Kalau beda (mis. debet 28-09 tapi kredit 28-08),
           kemungkinan salah ketik — ditandai agar bisa diperiksa saat impor. */
        var _tglPasangan = '';
        var nextRow = rawRows[i+1];
        if (nextRow && isValidDateStringOrObject(nextRow[0])) {
          var nextDebet = parseAmount(nextRow[2]);
          var nextKredit = parseAmount(nextRow[3]);
          if (nextKredit > 0 && nextDebet === 0) {
            bankAccName = String(nextRow[1] || '').trim();
            _tglPasangan = parseImportDate(nextRow[0]);
          }
        }
        
        var _tglBeda = (_tglPasangan && _tglPasangan !== dateStr)
          ? { debet: dateStr, kredit: _tglPasangan } : null;
        dipakai[i] = 1;
        if (bankAccName || _tglPasangan) dipakai[i + 1] = 1;

        /* Akun kredit baris pasangannya — dipakai untuk menentukan jenis dana,
           sekaligus untuk mengenali penerimaan pada berkas tanpa judul seksi. */
        var _akunKredit = '';
        var _nx = rawRows[i+1];
        if (_nx && parseAmount(_nx[3]) > 0 && !parseAmount(_nx[2])) _akunKredit = String(_nx[1] || '').trim();

        // Match bank account
        /* Seksi yang judulnya bukan "PENERIMAAN ..." tetap boleh berisi
           penerimaan. Jurnal bank Jan-Sep 2026 menaruh barang bantuan
           kemanusiaan di seksi "PERSEDIAAN" (7 baris, Rp 161.947.850) dan
           kiriman ke rekening BDW di "TRANSAKSI BANK BDW" (3 baris,
           Rp 3.816.635). Dulu keduanya dilewati, padahal akun kreditnya
           jelas "Penerimaan ...", sementara beras zakat fitrah di seksi
           "PENERIMAAN PERSEDIAAN" ikut terhitung. Pemilik memutuskan semua
           penerimaan dihitung. Jadi di seksi yang bukan penyaluran, akun
           kredit "Penerimaan ..." sudah cukup sebagai tanda. */
        var isHimpunSec = currentSection
          ? (jpSeksiHimpun(currentSection) ||
             (!jpSeksiSalur(currentSection) && /^penerimaan\b/i.test(_akunKredit)))
          : /^penerimaan\b/i.test(_akunKredit);
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
        /* Pencocokan lewat NAMA bank hanya boleh dipakai bila labelnya memang
           tidak menyebut nomor rekening. Kalau nomornya ada tetapi tidak ada di
           daftar (mis. "BCA Syariah Zakat - 0469900880" sementara yang
           terdaftar 0469988000), rekeningnya memang belum terdaftar — jangan
           dipaksakan ke rekening lain yang kebetulan senama, karena uangnya
           akan masuk ke rekening yang salah. */
        if (!matchedRek && !/\d{6,}/.test(lookupName)) {
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
        if (isHimpunSec) {
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

          /* --- Jenis dana dibaca dari AKUN KREDIT (baris pasangannya) --- */
          var _dana = _akunKredit ? jpDanaDariAkun(_akunKredit) : null;
          var _pecah = jpPecahUraian(uraian, _dana);
          var _namaBersih = _pecah.nama || uraian;

          /* KLL / ULL memakai aturan pencocokan yang sama dengan rekap dashboard,
             dijalankan atas nama yang SUDAH dibersihkan dari ekor jenis dana. */
          var _pre = (typeof _layFromPrefix === 'function') ? _layFromPrefix(_namaBersih, _layMaster()) : null;
          var _layHit = matchedLay;
          if (_pre && !_layHit) _layHit = _layCocokNama(_pre, listLayanan);
          if (_layHit) {
            layananId = _layHit.id;
            namaDonatur = (String(_layHit.tipe).toUpperCase() === 'ULL' ? 'ULL ' : 'KLL ') + _layHit.nama;
            tipeDonatur = (String(_layHit.tipe).toUpperCase() === 'ULL') ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)';
          } else if (_pre) {
            namaDonatur = _pre.tipe + ' ' + _pre.nama;
            tipeDonatur = (_pre.tipe === 'ULL') ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)';
          } else {
            namaDonatur = _namaBersih;
          }

          if (_dana && _dana.jenisDana) {
            jDana   = _dana.jenisDana;
            sJenis  = _dana.subJenis;
            pilar   = _dana.pilar;
            program = _pecah.program || '';
            if (jDana === 'Infak' && sJenis === 'Infak Terikat' && !pilar) {
              pilar = detectPilarFromText(program || uraian);
            } else if (_dana.terikat && !pilar) {
              /* Bagi hasil terikat: pakai penebak tegas supaya pilar tidak
                 dikarang saat uraiannya memang tidak menyebut pilar apa pun. */
              pilar = (typeof detectPilarTegas === 'function')
                ? detectPilarTegas(uraian) : '';
            }
          }

          /* Bagi hasil bank: pemberinya bank, bukan donatur perorangan.
             Nama rekening dipakai sebagai identitas pemberi supaya jelas
             bagi hasil itu berasal dari rekening yang mana. */
          if (_dana && _dana.subJenis === 'Bagi Hasil Bank') {
            namaDonatur = matchedRek
              ? (matchedRek.namaBank + ' - ' + matchedRek.nomor)
              : (accName || 'Bagi Hasil Bank');
            tipeDonatur = 'Lembaga/Perusahaan';
            program     = 'Bagi Hasil Bank';
            layananId   = '';
          }

          /* Tandai bila tulisan di uraian bertentangan dengan akun kredit,
             misalnya uraian menulis "Infak Terikat" tetapi akun kreditnya
             "Penerimaan Infak Umum". Akun kredit tetap yang dipakai; barisnya
             hanya diberi tanda agar bisa diperiksa sebelum disimpan. */
          var _bedaDana = false;
          if (_dana && _dana.jenisDana) {
            var _uN = ' ' + jpNorm(uraian) + ' ';
            var _adaTerikat = _uN.indexOf(' terikat ') >= 0;
            /* Untuk bagi hasil, sifat terikat ada di akun kreditnya, bukan di sub jenis. */
            var _danaTerikat = (_dana.subJenis === 'Bagi Hasil Bank')
              ? !!_dana.terikat
              : /terikat/i.test(_dana.subJenis);
            if (_adaTerikat !== _danaTerikat) _bedaDana = true;
            var _pokok = ['zakat','infak','infaq','sedekah','wakaf','amil'].filter(function(k){ return _uN.indexOf(' '+k+' ') >= 0; });
            var _jd = _dana.jenisDana.toLowerCase();
            if (_pokok.length && _jd !== 'dskl' && _pokok.indexOf(_jd) < 0 && !(_jd === 'infak' && _pokok.indexOf('infaq') >= 0)) _bedaDana = true;
          }

          var uraianLower = uraian.toLowerCase();
          var isZakatAcc = false;

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
          } else if (_dana && _dana.jenisDana) {
            /* sudah pasti dari akun kredit, tidak perlu menebak dari seksi */
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
          
          var metode = jpMetode(accName, uraian, currentSection);
                    
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
            /* Transaksi KLL/ULL dicatat atas nama layanannya; nama petugas
               fundraising hanya untuk transaksi tingkat daerah. */
            fundraising: layananId || _pre
              ? namaDonatur
              : cleanFundraisingName(extractFundraisingFromText(uraian)),
            akunKredit: _akunKredit,
            bedaDana: _bedaDana,
            tglBeda: _tglBeda
          });
        }
        
        // PENTASYARUFAN
        else if (
          currentSection === 'OPERASIONAL AMIL VIA BANK' ||
          currentSection === 'OPERASIONAL AMIL VIA KAS' ||
          currentSection === 'PENGELUARAN OPERASIONAL VIA BANK' ||
          currentSection === 'PENGELUARAN OPERASIONAL VIA KAS' ||
          currentSection === 'PENYALURAN ZAKAT' ||
          currentSection === 'PENYALURAN INFAK TERIKAT' ||
          currentSection === 'PENYALURAN INFAK UMUM' ||
          currentSection === 'PENYALURAN PERSEDIAAN' ||
          currentSection === 'UMP ZAKAT' ||
          currentSection === 'UMP INFAK' ||
          currentSection === 'UMP AMIL' ||
          currentSection === 'UMP LPJ ZAKAT' ||
          currentSection === 'UMP LPJ INFAK' ||
          currentSection === 'UMP LPJ AMIL' ||
          currentSection === 'BIAYA ADMINISTRASI BANK'
        ) {
          var sumberDana = 'Infak';
          var ashnaf = 'Fi Sabilillah';
          var program = accName;
          var namaPenerima = 'Lazismu Daerah Bantul';
          /* LPJ (pertanggungjawaban UMP) = penyaluran AKTUAL oleh KLL/ULL, jadi
             dicatat atas nama KLL/ULL-nya (nama ada di keterangan). Penyaluran &
             operasional langsung tingkat daerah tetap DAERAH walau nama KLL
             kebetulan disebut. (UMP advance sendiri sudah dilewati di skip.) */
          var _isKLLsec = /^UMP\s+LPJ\s+(ZAKAT|INFAK|AMIL)$/i.test(currentSection)
                       || /^UMP\s+(ZAKAT|INFAK|AMIL)$/i.test(currentSection);
          if (_isKLLsec) {
            var _pre = (typeof _layFromPrefix === 'function') ? _layFromPrefix(uraian, _layMaster()) : null;
            var _lay = extractLayananFromText(uraian, listLayanan);
            if (_lay) namaPenerima = (String(_lay.tipe).toUpperCase() === 'ULL' ? 'ULL ' : 'KLL ') + _lay.nama;
            else if (_pre) namaPenerima = _pre.tipe + ' ' + _pre.nama;
          }

          if (currentSection === 'OPERASIONAL AMIL VIA BANK' || currentSection === 'OPERASIONAL AMIL VIA KAS' ||
              currentSection === 'PENGELUARAN OPERASIONAL VIA BANK' || currentSection === 'PENGELUARAN OPERASIONAL VIA KAS') {
            /* Pengeluaran operasional lembaga: dibebankan ke dana Amil. */
            sumberDana = 'Amil';
            ashnaf = 'Amil';
            namaPenerima = 'Lazismu Daerah Bantul';
          } else if (currentSection === 'PENYALURAN PERSEDIAAN') {
            /* penyaluran barang: dananya mengikuti akun penyalurannya
               ("Penyaluran Zakat - Fakir Miskin" -> Zakat) */
            sumberDana = /zakat/i.test(accName) ? 'Zakat' : /amil/i.test(accName) ? 'Amil' : 'Infak';
            if (sumberDana === 'Zakat') ashnaf = 'Fakir Miskin';
          } else if (currentSection === 'PENYALURAN ZAKAT' || currentSection === 'UMP ZAKAT' || currentSection === 'UMP LPJ ZAKAT') {
            sumberDana = 'Zakat';
            /* ashnaf dibaca dari nama akun "Penyaluran Zakat - Fakir Miskin". */
            var _zEkor = accName.split(/[-–—]/).slice(1).join(' ').trim();
            ashnaf = fuzzyMatch(_zEkor || accName, ASHNAF, 'Fakir');
          } else if (currentSection === 'UMP AMIL' || currentSection === 'UMP LPJ AMIL') {
            sumberDana = 'Amil';
            ashnaf = 'Amil';
          } else if (currentSection === 'PENYALURAN INFAK TERIKAT' || currentSection === 'PENYALURAN INFAK UMUM' ||
                     currentSection === 'UMP INFAK' || currentSection === 'UMP LPJ INFAK') {
            sumberDana = 'Infak';
            ashnaf = 'Fi Sabilillah';
          } else if (currentSection === 'BIAYA ADMINISTRASI BANK') {
            /* Dana dibaca dari nama akun debet ("Administrasi Bank Infak/Zakat/
               Terikat") agar biaya membebani dana yang benar. Akun debet aslinya
               dipertahankan sebagai program supaya jurnal tereproduksi persis. */
            var _al = accName.toLowerCase();
            if (_al.indexOf('zakat') >= 0) sumberDana = 'Zakat';
            else if (_al.indexOf('infa') >= 0 || _al.indexOf('sedekah') >= 0) sumberDana = 'Infak';
            else sumberDana = 'Amil';
            ashnaf = 'Amil';
            program = accName || 'Biaya Administrasi Bank';
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
            bank: bankLabel,
            /* Seksi asal disimpan agar jurnal dapat dikelompokkan persis
               seperti berkas sumber, tanpa menebak dari nama akun. */
            section: currentSection,
            tglBeda: _tglBeda
          });
        }
      }
    }
  }
  
  /* Sisir ulang: baris yang tampak seperti data (bertanggal dan bernominal)
     tetapi tidak pernah dipakai. Alasannya diturunkan dari keadaannya, bukan
     dikarang, supaya yang membaca tahu harus berbuat apa. */
  var dilewati = [];
  for (var w = 0; w < rawRows.length; w++) {
    if (dipakai[w]) continue;
    var rw = rawRows[w];
    if (!rw || getSectionHeader(rw)) continue;
    var adaTgl = rw.length >= 3 && isValidDateStringOrObject(rw[0]);
    var dw = parseAmount(rw[2]), kw = parseAmount(rw[3]);
    var adaNama = String(rw[1] || '').trim();
    if (!adaTgl && !dw && !kw) continue;           /* baris kosong / hiasan */
    if (!adaNama && !dw && !kw) continue;
    var sk = seksiBaris[w] || '';
    /* URUTAN ALASAN PENTING. Yang menyangkut SEKSI diperiksa lebih dulu,
       karena seksi yang memang tidak diimpor akan selalu terlihat seperti
       "baris debet tanpa pasangan" juga, dan alasan kedua itu menakut-nakuti
       tanpa sebab: penyusutan memang bukan uang berpindah. */
    var sebab, sengaja = false;
    if (skipSections.indexOf(sk) >= 0) { sebab = 'Seksi ' + sk + ' memang tidak diimpor (tidak ada uang berpindah)'; sengaja = true; }
    else if (!sk && adaSeksi) sebab = 'Berada di luar semua judul seksi';
    else if (!adaTgl) sebab = 'Tanggalnya kosong atau tidak terbaca';
    else if (!dw && !kw) sebab = 'Nominalnya kosong di kolom debet maupun kredit';
    else if (kw > 0 && !dw) sebab = 'Baris kredit tanpa pasangan debet di atasnya';
    else if (dw > 0 && !kw) sebab = 'Baris debet tanpa pasangan kredit di bawahnya';
    else sebab = 'Bentuk barisnya tidak dikenali';
    dilewati.push({
      baris: w + 1,
      seksi: sk,
      tanggal: adaTgl ? parseImportDate(rw[0]) : String(rw[0] || ''),
      akun: adaNama,
      debet: dw, kredit: kw,
      keterangan: String(rw[4] || '').trim(),
      sebab: sebab,
      /* sengaja = aturan yang memang begitu, bukan data yang perlu dibetulkan.
         Dipisahkan supaya daftar yang perlu diperiksa orang tidak tenggelam
         di antara puluhan baris penyusutan yang memang dilewati. */
      sengaja: sengaja
    });
  }

  return {
    himpunRows: himpunRows,
    salurRows: salurRows,
    umpRows: umpRows,
    transferRows: transferRows,
    dilewati: dilewati,
    jumlahBarisSumber: rawRows.length,
    seksiDitemukan: (function(){ var o = {}, a = []; Object.keys(seksiBaris).forEach(function(k){ var v = seksiBaris[k]; if (v && !o[v]) { o[v] = 1; a.push(v); } }); return a; })()
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

async function apiParseImportUrl(t, url, type, opsi) {
  authUser(t);
  if (!url) throw new Error('URL tidak boleh kosong.');
  
  var downloadUrl = convertGoogleSheetUrl(url);
  var listRek = readAll(SHEETS.REKENING) || [];
  var listLayanan = readAll(SHEETS.LAYANAN) || [];
  
  /* Diperiksa di LUAR try di bawah, supaya penolakan tidak tersamar menjadi
     "Gagal membaca Spreadsheet". */
  await _periksaUrlImpor(downloadUrl);
  try {
    var buffer = await _ambilUrlImpor(downloadUrl);
    
    var XLSX = require('xlsx');
    var workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
    /* Workbook setahun biasanya satu sheet per bulan: semua sheet yang tampak
       seperti jurnal digabung berurutan. Sheet lain (rekap, catatan) dilewati.
       Bila tak satu pun dikenali, kembali ke sheet pertama seperti dulu. */
    var rawRows = [], sheetTerbaca = [];
    workbook.SheetNames.forEach(function(nm){
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[nm], { header: 1, defval: '' });
      if (checkIsJurnalPenerimaan(rows)) { rawRows = rawRows.concat(rows); sheetTerbaca.push(nm); }
    });
    if (!sheetTerbaca.length) { rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }); sheetTerbaca = [workbook.SheetNames[0]]; }
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
      
      return _lengkapiTemuan({
        success: true,
        isJurnal: true,
        himpunValid: himpunValid,
        himpunInvalid: himpunInvalid,
        salurValid: salurValid,
        salurInvalid: salurInvalid,
        bedaDana: himpunValid.filter(function(x){ return x.bedaDana; }).length,
        anomaliTanggal: _kumpulAnomaliTgl(himpunValid, salurValid, resultJurnal.umpRows, resultJurnal.transferRows),
        dilewati: resultJurnal.dilewati || [],
        jumlahBarisSumber: resultJurnal.jumlahBarisSumber || 0,
        sheetTerbaca: (typeof sheetTerbaca !== 'undefined') ? sheetTerbaca : [],
        umpValid: resultJurnal.umpRows || [],
        transferValid: resultJurnal.transferRows || [],
        akunAsing: _kumpulAkunAsing(resultJurnal, listRek),
        akunTakDikenal: (resultJurnal.umpRows || []).concat(resultJurnal.transferRows || []).filter(function(x){ return x.akunDikenal === false; }).length
          + (resultJurnal.himpunRows || []).concat(resultJurnal.salurRows || []).filter(function(x){ return !x.rekeningId && _tampakRekening(x.bank); }).length,
        totalCount: resultJurnal.himpunRows.length + resultJurnal.salurRows.length + (resultJurnal.umpRows || []).length + (resultJurnal.transferRows || []).length
      }, opsi, listLayanan, resultJurnal);
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
    _lolosLembar(e);
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

/* ================================================================
   FORMAT BUKU KAS  (Tanggal | Uraian | ... | Debet | Kredit | Saldo | Fundraising)
   Aturan yang berlaku baik untuk unggah file maupun tempel teks:
   - Baris yang nominalnya ada di kolom KREDIT adalah setor tunai ke bank
     (pemindahan kas, bukan penerimaan baru) -> DILEWATI.
   - Uraian berbentuk "<Nama atau KLL/ULL> - <Pilar>".
   - Fundraising hanya berlaku untuk penghimpunan tingkat daerah; transaksi
     milik KLL/ULL memakai nama layanannya sendiri.
   ================================================================ */
var BK_FR_ALIAS = { 'nur y':'Nur Yulianto', 'nury':'Nur Yulianto', 'yulianto':'Nur Yulianto' };

function bkNorm(v){ return String(v == null ? '' : v).toLowerCase().replace(/\s+/g,' ').trim(); }
function bkAngka(v){
  if (v == null) return 0;
  var s = String(v).replace(/[^\d,.-]/g,'').trim();
  if (!s) return 0;
  // 1.234.567,89  ->  1234567.89
  if (s.indexOf(',') >= 0 && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    s = s.replace(/\./g,'').replace(',', '.');
  } else {
    s = s.replace(/,/g,'');
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g,'');
  }
  var n = Number(s);
  return isNaN(n) ? 0 : n;
}
function bkKapital(s){
  return String(s||'').split(' ').map(function(w){
    return w === w.toLowerCase() ? (w.charAt(0).toUpperCase() + w.slice(1)) : w;
  }).join(' ').trim();
}
function bkFundraising(v){
  var raw = bkNorm(v);
  if (!raw) return '';
  if (BK_FR_ALIAS[raw]) return BK_FR_ALIAS[raw];
  var kanon = bkKapital(raw);
  // samakan dengan daftar resmi bila ada yang cocok
  var opsi = ['Sherli','Renata','Ariya','Nur Yulianto','Muzakki','Lazismu Daerah Bantul'];
  for (var i = 0; i < opsi.length; i++) {
    if (bkNorm(opsi[i]) === raw || bkNorm(opsi[i]).indexOf(raw) === 0) return opsi[i];
  }
  return kanon;
}

/* Apakah kumpulan header ini berformat buku kas? */
function isBukuKasHeader(headers){
  var h = (headers || []).map(bkNorm);
  var ada = function(x){ return h.some(function(k){ return k.indexOf(x) >= 0; }); };
  return ada('uraian') && (ada('debet') || ada('debit')) && ada('kredit');
}

/* Pilar & jenis dana dari teks kategori setelah tanda "-" */
function bkKlasifikasi(kategori, namaLengkap){
  var k = bkNorm(kategori);
  var semua = bkNorm(namaLengkap + ' ' + kategori);
  var out = { jenisDana:'Infak', subJenis:'Infak Umum', pilar:'', program: String(kategori||'').trim() };

  if (/zakat/.test(semua)) {
    out.jenisDana = 'Zakat';
    if (/fitrah/.test(semua)) out.subJenis = 'Zakat Fitrah';
    else if (/profesi|penghasilan/.test(semua)) out.subJenis = 'Zakat Profesi/Penghasilan';
    else if (/perdagangan|dagang/.test(semua)) out.subJenis = 'Zakat Perdagangan';
    else if (/pertanian/.test(semua)) out.subJenis = 'Zakat Pertanian';
    else if (/emas|perak/.test(semua)) out.subJenis = 'Zakat Emas & Perak';
    else out.subJenis = 'Zakat Mal';
    out.pilar = '';
    return out;
  }
  if (/wakaf/.test(semua)) { out.jenisDana='Wakaf'; out.subJenis='Wakaf'; return out; }
  if (/fidyah|fidiah/.test(semua)) { out.jenisDana='Fidyah'; out.subJenis='Fidyah'; return out; }
  if (/\bqurban\b|\bkurban\b/.test(semua)) { out.jenisDana='Kurban'; out.subJenis='Kurban'; return out; }
  if (/\bamil\b/.test(semua)) { out.jenisDana='DSKL'; out.subJenis='Amil'; return out; }

  if (!k || /infak umum|infaq umum|umum|saldo/.test(k)) { out.subJenis='Infak Umum'; out.pilar=''; return out; }

  /* Aturan yang ditegaskan pengguna, diuji lebih dulu supaya tidak
     tertimpa aturan umum di bawahnya:
       - donasi Palestina dan NTT  -> Kemanusiaan
       - kekeringan                -> Sosial Dakwah                       */
  if (/palestin|gaza|\bntt\b|nusa tenggara timur/.test(k)) {
    out.subJenis='Infak Terikat'; out.pilar='Kemanusiaan'; return out;
  }
  if (/kekeringan|dropping air/.test(k)) {
    out.subJenis='Infak Terikat'; out.pilar='Sosial Dakwah'; return out;
  }

  var peta = [
    [/kesehatan|sehat|ambulan|klinik|berobat|donor darah/, 'Kesehatan'],
    [/pendidikan|sekolah|beasiswa|pondok|pesantren|sdua|madrasah|guru|santri/, 'Pendidikan'],
    [/kemanusiaan|bencana|palestin|gempa|banjir|kebakaran|longsor|tsunami|erupsi|pengungsi/, 'Kemanusiaan'],
    [/dam\b|kulit|kambing/, 'DAM'],
    [/filantropis/, 'Pendidikan/Filanatropis'],
    [/dakwah|sosial|masjid|musholla|mushola|pembangunan|takmir|yatim|dhuafa|lansia/, 'Sosial Dakwah']
  ];
  for (var i = 0; i < peta.length; i++) {
    if (peta[i][0].test(k)) { out.subJenis='Infak Terikat'; out.pilar=peta[i][1]; return out; }
  }
  /* Kategori tak dikenal tetap dicatat sebagai terikat dengan pilar Sosial Dakwah
     (aturan lama), teks aslinya disimpan di program agar tidak hilang. */
  out.subJenis = 'Infak Terikat';
  out.pilar = 'Sosial Dakwah';
  return out;
}

/* Ubah satu baris buku kas menjadi baris penghimpunan. Mengembalikan null
   untuk baris yang harus dilewati (setor tunai / tanpa nominal debet). */
function bkBarisKeHimpun(row, listLayanan, layMap){
  var n = {};
  Object.keys(row).forEach(function(k){ n[bkNorm(k).replace(/[^a-z0-9]/g,'')] = row[k]; });
  var ambil = function(keys){
    for (var i=0;i<keys.length;i++) if (n[keys[i]] !== undefined && n[keys[i]] !== '') return n[keys[i]];
    return '';
  };

  var kredit = bkAngka(ambil(['kredit','credit','keluar']));
  var debet  = bkAngka(ambil(['debet','debit','masuk']));
  var uraian = String(ambil(['uraian','keterangan','deskripsi','description']) || '').trim();

  if (kredit > 0) return { skip: 'setor', uraian: uraian, jumlah: kredit };
  if (!(debet > 0)) return { skip: 'kosong', uraian: uraian, jumlah: 0 };
  if (!uraian) return { skip: 'kosong', uraian: '', jumlah: debet };

  // pecah "Nama - Kategori" pada tanda hubung PERTAMA
  var nama = uraian, kategori = '';
  var m = uraian.match(/^(.*?)\s+-\s+(.*)$/);
  if (m) { nama = m[1].trim(); kategori = m[2].trim(); }

  // KLL / ULL memakai aturan pencocokan yang sama dengan rekap dashboard
  var pre = (typeof _layFromPrefix === 'function') ? _layFromPrefix(nama, _layMaster()) : null;
  var layananId = '', tipeDonatur = 'Perorangan', namaDonatur = nama, adalahLayanan = false;
  if (pre) {
    adalahLayanan = true;
    var hit = null, cand = bkNorm(pre.nama);
    (listLayanan || []).forEach(function(l){
      var ln = bkNorm(l.nama), kd = bkNorm(l.kode);
      if (kd && kd.length >= 2 && cand === kd) { if (!hit) hit = l; return; }
      if (ln && ln.length >= 3 && (cand === ln || cand.indexOf(ln) === 0 || ln.indexOf(cand) === 0)) {
        if (!hit || ln.length > bkNorm(hit.nama).length) hit = l;
      }
    });
    if (hit) {
      layananId = hit.id;
      namaDonatur = (hit.tipe ? hit.tipe + ' ' : '') + hit.nama;
      tipeDonatur = (String(hit.tipe).toUpperCase() === 'ULL') ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)';
    } else {
      namaDonatur = pre.tipe + ' ' + pre.nama;
      tipeDonatur = (pre.tipe === 'ULL') ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)';
    }
  }

  var kls = bkKlasifikasi(kategori, nama);

  /* Fundraising hanya untuk transaksi tingkat daerah. Transaksi KLL/ULL
     dicatat atas nama layanannya, bukan petugas fundraising. */
  var fr = adalahLayanan ? namaDonatur : bkFundraising(ambil(['fundraising','fr','petugas','amil']));

  return {
    tanggal: parseImportDate(ambil(['tanggal','tgl','date'])),
    namaDonatur: namaDonatur,
    tipeDonatur: tipeDonatur,
    layananId: layananId,
    jenisDana: kls.jenisDana,
    subJenis: kls.subJenis,
    pilar: kls.pilar,
    program: kls.program,
    jumlah: debet,
    metode: 'Cash/Tunai',
    statusBayar: 'Lunas',
    alamat: String(ambil(['alamat']) || ''),
    telepon: String(ambil(['nohp','hp','telepon','telp','wa']) || ''),
    email: '',
    keterangan: uraian,
    fundraising: fr || 'Lazismu Daerah Bantul',
    bank: 'Kas'
  };
}

/* Proses seluruh tabel buku kas. */
function parseBukuKas(json, listLayanan){
  var layMap = {};
  (listLayanan || []).forEach(function(l){ if (l && l.id) layMap[l.id] = l; });
  var valid = [], dilewati = { setor: [], kosong: [] };
  (json || []).forEach(function(row){
    var r = bkBarisKeHimpun(row, listLayanan, layMap);
    if (!r) return;
    if (r.skip) { (dilewati[r.skip] || dilewati.kosong).push(r); return; }
    valid.push(r);
  });
  return { valid: valid, dilewati: dilewati };
}

/* ================================================================
   IMPOR JURNAL PER BERKAS: PEMERIKSAAN SEBELUM DISIMPAN
   ================================================================
   Lahir 1 Oktober 2026 dari pembacaan ulang jurnal Kas dan Bank September
   bersama pemilik. Semua yang di bawah ini dulu baru ketahuan saat rekap
   bulanan tidak cocok dengan rekap manual, berminggu-minggu sesudah data
   disimpan:
     - dua baris bertanggal Juni di sheet September (Rp 2.224.500 hilang
       dari rekap September);
     - "Infak Umum Bantul Kota" Rp 28.896.200 yang ternyata setoran KLL
       Bantul Kota, hanya lupa ditulis "KLL";
     - "KLL Imoghiri" dan "ULL Masjid" yang melahirkan kantor bayangan;
     - "Infak Ambulan" Rp 10.000.000 di akun Infak Terikat Pendidikan;
     - zakat yang masuk ke rekening infak umum;
     - dua transfer uji Rp 10;
     - berkas Bank_09 yang ternyata hanya berisi seksi zakat.
   Tidak ada yang diubah otomatis. Setiap temuan membawa alamat barisnya dan,
   kalau jelas, usulan perbaikan; layar impor yang menerapkannya setelah
   orang memilih. Prinsipnya sama dengan pencocokan kantor: kalau ragu,
   tanyakan, jangan memindahkan uang berdasarkan tebakan. */
var _NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function _namaBulanIso(b){ var m = String(b || '').match(/^(\d{4})-(\d{2})$/); return m ? _NAMA_BULAN[Number(m[2]) - 1] + ' ' + m[1] : String(b || ''); }
function _rpTeks(n){ return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }

/* Pilar yang TEGAS disebut di keterangan. Sengaja sempit: hanya kata yang
   tidak mungkin berarti lain. "Kekeringan" dan "NTT" tidak dimasukkan
   karena di jurnal pemilik keduanya sah di akun Kemanusiaan. */
function _pilarTegasKet(teks){
  var s = ' ' + String(teks || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  if (/ ambulan\w* | kesehatan | klinik | berobat | donor darah /.test(s)) return 'Kesehatan';
  if (/ beasiswa | pendidikan /.test(s)) return 'Pendidikan';
  if (/ qurban | kurban /.test(s)) return 'Qurban';
  return '';
}

/* Nama kantor tertulis ("KLL Imoghiri") terdaftar atau tidak. */
function _pecahNamaKantor(nama){
  var m = String(nama || '').trim().match(/^(KLL|ULL|KL|UL)\b[\s:.\-]*(.+)$/i);
  if (!m) return null;
  var tipe = m[1].toUpperCase(); if (tipe === 'KL') tipe = 'KLL'; if (tipe === 'UL') tipe = 'ULL';
  return { tipe: tipe, inti: m[2].trim() };
}
function _kantorTerdaftar(nama, lay){
  var p = _pecahNamaKantor(nama);
  if (!p) return true;
  var al = _aliasKantor()[_kunciAlias(p.tipe, p.inti)];
  if (al && (al.sendiri || al.daerah)) return true;
  var n = _norm(p.inti);
  return lay.some(function(l){ return _norm(l.nama) === n && (!l.tipe || String(l.tipe).toUpperCase() === p.tipe); });
}

function _temuanJurnal(res, opsi, listLayanan, hasilJurnal){
  opsi = opsi || {};
  var out = [];
  var kump = { himpun: res.himpunValid || [], salur: res.salurValid || [], ump: res.umpValid || [], transfer: res.transferValid || [] };
  var lay = (listLayanan || []).filter(function(l){ return l && l.nama; });
  function info(k, i){
    var r = kump[k][i];
    return { kumpulan: k, idx: i, tanggal: r.tanggal, jumlah: Number(r.jumlah != null ? r.jumlah : r.nominal) || 0,
      nama: k === 'himpun' ? r.namaDonatur : k === 'salur' ? r.namaPenerima : (r.layanan || ''),
      keterangan: String(r.keterangan || '').slice(0, 100) };
  }
  function tambah(o){ o.id = 't' + (out.length + 1); out.push(o); }

  /* 1. Tanggal di luar bulan berkas. */
  var bulan = /^\d{4}-\d{2}$/.test(String(opsi.bulan || '')) ? String(opsi.bulan) : '';
  if (bulan) {
    var akhir = new Date(Number(bulan.slice(0, 4)), Number(bulan.slice(5, 7)), 0).getDate();
    Object.keys(kump).forEach(function(k){
      kump[k].forEach(function(r, i){
        var tg = String(r.tanggal || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tg) || tg.slice(0, 7) === bulan) return;
        var hari = Number(tg.slice(8, 10));
        var usul = hari >= 1 && hari <= akhir ? bulan + '-' + tg.slice(8, 10) : '';
        tambah({ jenis: 'luarBulan', tingkat: 'perlu', judul: 'Tanggal di luar ' + _namaBulanIso(bulan),
          pesan: 'Tercatat ' + tg + ', padahal berkas ini untuk ' + _namaBulanIso(bulan) + '. Kalau dibiarkan, transaksi ini masuk rekap ' + _namaBulanIso(tg.slice(0, 7)) + '.',
          baris: [info(k, i)], usulan: usul ? { tanggal: usul } : null });
      });
    });
  }

  /* 2. Keterangan yang isinya hanya nama kantor, tanpa KLL/ULL. Aturan
     pemilik: tanpa KLL/ULL berarti milik Daerah, walaupun menyebut nama
     kecamatan. Karena itu yang ditandai hanya yang SISA keterangannya,
     setelah kata jenis dana dibuang, persis sama dengan nama kantor
     terdaftar. "SMK Muh 1 Bambanglipuro" tidak ditandai. */
  if (lay.length) {
    kump.himpun.forEach(function(r, i){
      if (r.layananId || /KLL|ULL/.test(String(r.tipeDonatur || ''))) return;
      var sisa = _norm(String(r.keterangan || '').replace(/\b(infa[kq]|zakat|ma+l|umum|terikat|sedekah|shodaqoh|fitrah|profesi|penghasilan)\b/gi, ' '));
      if (!sisa) return;
      var cocok = lay.filter(function(l){ return _norm(l.nama) === sisa; });
      if (cocok.length !== 1) return;
      var l = cocok[0], label = _layLabel(l);
      tambah({ jenis: 'kantorTanpaAwalan', tingkat: 'perlu', judul: 'Nama kantor tanpa KLL/ULL',
        pesan: 'Keterangan "' + r.keterangan + '" hanya berisi nama ' + label + '. Tanpa tulisan KLL/ULL, transaksi ini masuk Penghimpunan Daerah. Kalau ini setoran ' + label + ', pindahkan.',
        baris: [info('himpun', i)], usulan: { layananId: l.id, tipe: String(l.tipe || '').toUpperCase(), nama: l.nama, label: label } });
    });
  }

  /* 3. Nama kantor yang tidak terdaftar. Satu temuan per nama, karena
     memilih kantornya sekali berlaku untuk semua barisnya dan diingat
     untuk impor berikutnya. */
  if (lay.length) {
    var grup = {}, urut = [];
    function catat(nama, k, i){
      if (!nama || _kantorTerdaftar(nama, lay)) return;
      var key = _norm(nama);
      if (!grup[key]) { grup[key] = { nama: String(nama).trim(), baris: [] }; urut.push(key); }
      grup[key].baris.push(info(k, i));
    }
    kump.himpun.forEach(function(r, i){ if (/KLL|ULL/.test(String(r.tipeDonatur || '')) && !r.layananId) catat(r.namaDonatur, 'himpun', i); });
    kump.salur.forEach(function(r, i){ if (/^(KLL|ULL)\s/i.test(String(r.namaPenerima || ''))) catat(r.namaPenerima, 'salur', i); });
    kump.ump.forEach(function(r, i){ if (/^(KLL|ULL)\s/i.test(String(r.layanan || ''))) catat(r.layanan, 'ump', i); });
    urut.forEach(function(key){
      var gr = grup[key], p = _pecahNamaKantor(gr.nama);
      var pd = _padanLayanan(gr.nama, lay);
      var pilihan = [_PILIHAN_DAERAH, _PILIHAN_SENDIRI].concat(lay.filter(function(l){ return !l.tipe || String(l.tipe).toUpperCase() === p.tipe; })
        .map(function(l){ return { id: l.id, tipe: String(l.tipe || p.tipe).toUpperCase(), nama: l.nama, label: _layLabel(l) }; })
        .sort(function(a, b){ return a.nama.localeCompare(b.nama); }));
      var total = gr.baris.reduce(function(a, b){ return a + b.jumlah; }, 0);
      tambah({ jenis: 'kantorTakTerdaftar', tingkat: 'perlu', judul: 'Kantor "' + gr.nama + '" tidak terdaftar',
        pesan: gr.baris.length + ' transaksi (' + _rpTeks(total) + ') memakai nama ini. '
          + (pd ? 'Paling dekat: ' + pd.label + ' (' + pd.cara + ').' : 'Namanya cocok dengan lebih dari satu kantor atau tidak mirip kantor mana pun, jadi tidak ditebak.')
          + ' Pilihan Anda diingat untuk impor berikutnya.',
        nama: gr.nama, baris: gr.baris, pilihan: pilihan,
        usulan: pd ? { layananId: pd.lay.id, tipe: String(pd.lay.tipe || p.tipe).toUpperCase(), nama: pd.lay.nama, label: pd.label } : null });
    });
  }

  /* 4. Pilar akun bertentangan dengan keterangan. */
  kump.himpun.forEach(function(r, i){
    if (r.subJenis !== 'Infak Terikat' || !r.pilar) return;
    var kata = _pilarTegasKet(r.keterangan);
    if (!kata || kata === r.pilar) return;
    tambah({ jenis: 'pilarTakCocok', tingkat: 'perlu', judul: 'Pilar ' + r.pilar + ', keterangan menyebut ' + kata,
      pesan: 'Akun kreditnya "' + (r.akunKredit || r.pilar) + '", tetapi keterangannya "' + r.keterangan + '".',
      baris: [info('himpun', i)], usulan: { pilar: kata } });
  });

  /* 5. Uang masuk ke rekening atau kas jenis dana lain. Hanya diberitahukan:
     yang salah bisa jurnalnya, bisa juga memang ditransfer donatur ke
     rekening yang keliru. */
  kump.himpun.forEach(function(r, i){
    if (/bagi hasil/i.test(String(r.subJenis || ''))) return;
    var lb = String(r.bank || '');
    var danaRek = /zakat/i.test(lb) ? 'Zakat' : /\bamil\b/i.test(lb) ? 'Amil' : /infa[kq]/i.test(lb) ? 'Infak' : '';
    if (!danaRek || danaRek === r.jenisDana) return;
    tambah({ jenis: 'rekeningBedaDana', tingkat: 'info', judul: r.jenisDana + ' masuk ke ' + lb,
      pesan: 'Jenis dananya ' + r.jenisDana + ', tetapi uangnya tercatat masuk ke ' + lb + '. Periksa apakah donatur salah rekening atau jurnalnya yang keliru.',
      baris: [info('himpun', i)], usulan: null });
  });

  /* 6. Nominal sangat kecil, biasanya transfer uji. */
  ['himpun', 'salur'].forEach(function(k){
    kump[k].forEach(function(r, i){
      var n = Number(r.jumlah) || 0;
      if (n > 0 && n < 1000) tambah({ jenis: 'nominalKecil', tingkat: 'info', judul: 'Nominal sangat kecil (' + _rpTeks(n) + ')',
        pesan: 'Biasanya transfer uji coba. Lewati kalau memang bukan donasi.', baris: [info(k, i)], usulan: { lewati: true } });
    });
  });

  /* 7. Baris kembar di dalam berkas yang sama. */
  ['himpun', 'salur'].forEach(function(k){
    var g = {}, u = [];
    kump[k].forEach(function(r, i){
      var key = [r.tanggal, Math.round(Number(r.jumlah) || 0), _norm(r.keterangan), k === 'himpun' ? r.akunKredit : r.program].join('|');
      if (!g[key]) { g[key] = []; u.push(key); }
      g[key].push(i);
    });
    u.forEach(function(key){
      if (g[key].length < 2) return;
      var b = g[key].map(function(i){ return info(k, i); });
      tambah({ jenis: 'dobelDalamBerkas', tingkat: 'info', judul: g[key].length + ' baris kembar (' + _rpTeks(b[0].jumlah) + ')',
        pesan: 'Tanggal, nominal, dan keterangannya sama persis. Bisa memang beberapa donasi, bisa juga tercatat dua kali. Cocokkan dengan bukti.',
        baris: b, usulan: { lewatiKecualiPertama: true } });
    });
  });

  /* 8. Kelengkapan dan jenis berkas. */
  var seksi = (hasilJurnal && hasilJurnal.seksiDitemukan) || [];
  var nH = kump.himpun.length, nKas = kump.himpun.filter(function(r){ return /tunai|cash/i.test(String(r.metode || '')); }).length;
  if (opsi.jenis === 'bank') {
    if (!kump.salur.length && !kump.ump.length && seksi.length) {
      tambah({ jenis: 'berkasTakLengkap', tingkat: 'perlu', judul: 'Berkas bank tampak tidak lengkap',
        pesan: 'Berkas ini hanya berisi seksi ' + seksi.join(', ') + '. Tidak ada penyaluran, uang muka, maupun penerimaan lain. Kalau ini potongan jurnal, impor juga sisanya dari berkas lengkapnya.',
        baris: [], usulan: null });
    }
    if (nH >= 4 && nKas > nH / 2) tambah({ jenis: 'jenisBerkas', tingkat: 'perlu', judul: 'Isinya tampak jurnal kas',
      pesan: nKas + ' dari ' + nH + ' penerimaan tercatat tunai, padahal yang dipilih Jurnal Bank. Periksa berkasnya.', baris: [], usulan: null });
  } else if (opsi.jenis === 'kas') {
    if (nH >= 4 && nKas < nH / 2) tambah({ jenis: 'jenisBerkas', tingkat: 'perlu', judul: 'Isinya tampak jurnal bank',
      pesan: (nH - nKas) + ' dari ' + nH + ' penerimaan tercatat lewat bank, padahal yang dipilih Jurnal Kas. Periksa berkasnya.', baris: [], usulan: null });
  }
  return out;
}

function _lengkapiTemuan(hasil, opsi, listLayanan, hasilJurnal){
  try {
    hasil.temuan = _temuanJurnal(hasil, opsi, listLayanan, hasilJurnal);
  } catch (e) {
    if (e && (e.perluLembar || /belum dimuat/.test(String(e.message || '')))) throw e;
    hasil.temuan = [];
    hasil.temuanGalat = String(e && e.message || e);
  }
  hasil.seksiDitemukan = (hasilJurnal && hasilJurnal.seksiDitemukan) || [];
  hasil.opsiBerkas = opsi || null;
  return hasil;
}

/* Nama lain kantor: dipilih orang di layar impor, diingat untuk impor
   berikutnya. Butuh izin ubah Layanan, karena efeknya sama dengan
   menggabungkan nama kantor. Lintas jenis (KLL ke ULL) ditolak: aturan
   rumah ini, penggabungan lintas jenis hanya lewat formulir manual. */
function apiSimpanAliasKantor(t, nama, layananId){
  var u = _requirePerm(t, 'layanan', 'edit');
  var p = _pecahNamaKantor(nama);
  if (!p || !p.inti) throw new Error('Nama harus diawali KLL atau ULL, misalnya "ULL Masjid".');
  if (layananId === _ID_SENDIRI) {
    var as = _aliasKantor(), tws = p.tipe + ' ' + p.inti;
    as[_kunciAlias(p.tipe, p.inti)] = { sendiri: true, tipe: p.tipe, nama: p.inti, tertulis: tws, oleh: u.username, waktu: new Date().toISOString() };
    setSetting('aliasKantor', JSON.stringify(as));
    audit(u.id, u.username, 'alias_kantor', tws + ' -> nama sendiri', { modul: 'layanan', ringkas: '"' + tws + '" dihitung di kelompok ' + p.tipe + ' tanpa didaftarkan' });
    return { ok: true, tertulis: tws, label: tws };
  }
  if (layananId === _ID_DAERAH) {
    var al = _aliasKantor(), tw = p.tipe + ' ' + p.inti;
    al[_kunciAlias(p.tipe, p.inti)] = { daerah: true, tipe: p.tipe, nama: LAYANAN_DAERAH, tertulis: tw, oleh: u.username, waktu: new Date().toISOString() };
    setSetting('aliasKantor', JSON.stringify(al));
    audit(u.id, u.username, 'alias_kantor', tw + ' -> Daerah', { modul: 'layanan', ringkas: '"' + tw + '" dibaca sebagai milik Daerah, bukan kantor' });
    return { ok: true, tertulis: tw, label: 'Daerah' };
  }
  var l = findById(SHEETS.LAYANAN, layananId);
  if (!l) throw new Error('Kantor tujuan tidak ditemukan di daftar Layanan.');
  var lt = String(l.tipe || '').toUpperCase() || p.tipe;
  if (lt !== p.tipe) throw new Error('"' + nama + '" adalah ' + p.tipe + ', tidak bisa diarahkan ke ' + lt + ' ' + l.nama + '.');
  var alias = _aliasKantor();
  var tertulis = p.tipe + ' ' + p.inti;
  alias[_kunciAlias(p.tipe, p.inti)] = { id: l.id, tipe: lt, nama: l.nama, tertulis: tertulis, oleh: u.username, waktu: new Date().toISOString() };
  setSetting('aliasKantor', JSON.stringify(alias));
  audit(u.id, u.username, 'alias_kantor', tertulis + ' -> ' + lt + ' ' + l.nama, { modul: 'layanan', ringkas: '"' + tertulis + '" dibaca sebagai ' + lt + ' ' + l.nama });
  return { ok: true, tertulis: tertulis, label: lt + ' ' + l.nama };
}
function apiDaftarAliasKantor(t){
  _requirePerm(t, 'layanan', 'view');
  var a = _aliasKantor();
  return Object.keys(a).map(function(k){ var x = a[k]; return { tertulis: x.tertulis || k, id: x.daerah ? _ID_DAERAH : x.sendiri ? _ID_SENDIRI : x.id, daerah: !!x.daerah, sendiri: !!x.sendiri, tipe: x.daerah ? '' : x.tipe, nama: x.nama, oleh: x.oleh || '', waktu: x.waktu || '' }; })
    .sort(function(x, y){ return String(x.tertulis).localeCompare(String(y.tertulis)); });
}
function apiHapusAliasKantor(t, nama){
  var u = _requirePerm(t, 'layanan', 'edit');
  var p = _pecahNamaKantor(nama);
  if (!p) throw new Error('Nama tidak dikenal.');
  var a = _aliasKantor(), k = _kunciAlias(p.tipe, p.inti);
  if (!a[k]) return { ok: true, ada: false };
  delete a[k];
  setSetting('aliasKantor', JSON.stringify(a));
  audit(u.id, u.username, 'hapus_alias_kantor', p.tipe + ' ' + p.inti, { modul: 'layanan' });
  return { ok: true, ada: true };
}

/* ================================================================
   SAMAKAN DENGAN REKAP BULANAN
   ================================================================
   Pemilik membuat rekap bulanan sendiri (sheet HIMPUN, UMP, PENYALURAN
   DAERAH, pengeluaran amil, SALUR KLL) dan memutuskan (1 Oktober 2026):
   REKAP JADI PATOKAN, tetapi jurnal tetap diimpor, karena hanya jurnal yang
   memuat setor tunai, mutasi antar rekening, dan biaya admin bank, yang
   menjaga saldo kas dan rekening tetap benar.

   Rekap September dicocokkan baris per baris dengan jurnal: 627 dari 633
   penerimaan cocok persis. Sisanya yang membuat Daerah web Rp 167.737.430
   padahal rekap Rp 147.882.126. Fungsi ini menghasilkan temuan berusulan,
   tidak mengubah apa pun sendiri; layar impor yang menerapkannya.

   Prinsip yang tidak boleh dilanggar:
   - LPJ uang muka KLL yang di rekap dicatat Daerah TIDAK dipindah
     otomatis: memindahkannya mengubah sisa "belum LPJ" kantor itu. Ditanyakan
     (rekapRancu).
   - Nama kantor rekap yang tidak terdaftar tidak ditebak. Kalau jurnal
     sudah menunjuk kantor terdaftar, jurnal yang dipakai.
   - Biaya admin bank tidak pernah diusulkan dilewati walau tidak ada di
     rekap: ia menggerakkan saldo rekening. */
function _rkTeks(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function _rkKas(melalui){
  var s = _rkTeks(melalui);
  if (!s) return false;
  if (/\d{6,}/.test(s)) return false;
  return !/\b(bank|bsi|bca|bpd|bni|bri|muamalat|mandiri|bdw|btn|cimb|qris|transfer)\b/i.test(s);
}
function _rkCocokBerkas(melalui, jenis){
  if (jenis === 'kas') return _rkKas(melalui);
  if (jenis === 'bank') return !_rkKas(melalui);
  return true;
}
/* Kepala kolom dicari, bukan nama sheet: nama sheet rekap tidak tetap
   ("Sheet5" untuk pengeluaran amil). */
function _bacaRekap(sheets){
  var out = { himpun: [], salur: [], ump: [] };
  (sheets || []).forEach(function(sh){
    var rows = (sh && sh.rows) || [];
    for (var h = 0; h < Math.min(rows.length, 6); h++) {
      var H = (rows[h] || []).map(function(c){ return _rkTeks(c).toUpperCase(); });
      var kol = function(re){ for (var i = 0; i < H.length; i++) if (re.test(H[i])) return i; return -1; };
      var cT = kol(/^(TANGGAL|TGL)$/), cJ = kol(/^JUMLAH$/);
      if (cT < 0 || cJ < 0) continue;
      var jenis = '', c = {};
      if (kol(/^PROGRAM PENERIMAAN/) >= 0 && kol(/^NAMA$/) >= 0) {
        jenis = 'himpun'; c = { nama: kol(/^NAMA$/), ket: kol(/^KETERANGAN/), prog: kol(/^PROGRAM PENERIMAAN/), via: kol(/^MELALUI/), kasir: kol(/^KASIR/) };
      } else if (kol(/^AKUN DEBET/) >= 0 && kol(/^AKUN KREDIT/) >= 0) {
        jenis = 'ump'; c = { ket: kol(/^URAIAN/), via: kol(/^AKUN KREDIT/) };
      } else if (kol(/^NAMA PENERIMA/) >= 0) {
        jenis = 'salur'; c = { nama: kol(/^NAMA PENERIMA/), prog: kol(/^PROGRAM PENYALURAN/), ket: kol(/^KET/), via: kol(/^MELALUI/) };
      } else if (kol(/PENGELUARAN AMIL|AKUN PENGELUARAN/) >= 0) {
        jenis = 'amil'; c = { ket: kol(/^URAIAN/), prog: kol(/^AKUN PENGELUARAN/), via: kol(/^MELALUI/) };
      }
      if (!jenis) continue;
      var ambil = function(r, i){ return i >= 0 ? _rkTeks(r[i]) : ''; };
      for (var i = h + 1; i < rows.length; i++) {
        var r = rows[i] || [];
        /* Baris total di bawah tabel ("", "", "", "", 1120940787) tidak
           bertanggal. parseImportDate("") mengembalikan tanggal HARI INI,
           jadi tanpa penjaga ini total satu bulan ikut terbaca sebagai satu
           transaksi baru bernilai sebesar seluruh rekap. */
        if (!_rkTeks(r[cT])) continue;
        var tgl = parseImportDate(r[cT]);
        var jml = parseAmount(r[cJ]);
        if (!tgl || !(jml > 0)) continue;
        var o = { sheet: String(sh.nama || ''), baris: i + 1, tanggal: tgl, jumlah: jml,
                  nama: ambil(r, c.nama), ket: ambil(r, c.ket), prog: ambil(r, c.prog), via: ambil(r, c.via), kasir: ambil(r, c.kasir) };
        if (jenis === 'himpun') out.himpun.push(o);
        else if (jenis === 'ump') out.ump.push(o);
        else { o.sumber = jenis === 'amil' ? 'AMIL' : (/^(KLL|ULL|KL|UL|Kantor\s+Layanan|Unit\s+Layanan)\b/i.test(o.nama) ? 'KANTOR' : 'DAERAH'); out.salur.push(o); }
      }
      break;
    }
  });
  return out;
}
/* "KL Lazismu Sewon Selatam" -> { tipe:'KLL', inti:'Sewon Selatam', lay: KLL Sewon Selatan }.
   null kalau namanya bukan nama kantor (milik Daerah). */
function _rkKantor(nama, lay){
  var m = _rkTeks(nama).match(/^(KLL|ULL|KL|UL|Kantor\s+Layanan|Unit\s+Layanan)\b[\s:.\-]*(.*)$/i);
  if (!m) return null;
  var tipe = /^(ULL|UL|Unit)/i.test(m[1]) ? 'ULL' : 'KLL';
  var inti = m[2].replace(/^Lazismu\s+/i, '').trim();
  if (!inti) return null;
  /* Rekap menulis "KL Lazismu Kota Yogyakarta" untuk kiriman dari Lazismu
     lain; pemilik memutuskan itu milik Daerah (1 Oktober 2026). Pilihan
     "bukan kantor" disimpan sebagai nama lain bertanda daerah. */
  var al = _aliasKantor(), kata = inti.split(/\s+/);
  for (var na = kata.length; na >= 1; na--) { var ax = al[_kunciAlias(tipe, kata.slice(0, na).join(' '))]; if (ax && ax.daerah) return null; if (ax) break; }
  var pre = _layFromPrefix(tipe + ' ' + inti, lay);
  var l = pre ? _layCocokNama(pre, lay) : null;
  if (l && _norm(l.nama) !== _norm(inti) && !pre.terdaftar && !pre.alias) l = null;
  if (!l) { var pd = _padanLayanan(tipe + ' ' + inti, lay); if (pd && pd.cara !== 'nama terpotong') l = pd.lay; }
  return { tipe: tipe, inti: inti, lay: l || null };
}
/* Jenis dana dan pilar dari kolom PROGRAM rekap. Kalau programnya tidak
   jelas, null: jurnal yang dipakai. */
function _rkDana(ket, prog){
  var p = _norm(prog), k = _norm(ket);
  if (/zakat/.test(p) || (!p && /^zakat/.test(k))) return { jenisDana: 'Zakat' };
  if (/tanpa pembatasan/.test(p)) return { jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '' };
  var pil = /bencana|\baid\b|kemanusiaan/.test(p) ? 'Kemanusiaan'
    : /lingkungan/.test(p) ? 'Lingkungan'
    : /kesehatan|ambulan|clinic|klinik/.test(p) ? 'Kesehatan'
    : /pendidikan|sekolah|filant|beasiswa/.test(p) ? 'Pendidikan'
    : /sosial dakwah|masjid|dakwah/.test(p) ? 'Sosial Dakwah'
    : /ekonomi/.test(p) ? 'Ekonomi'
    : /qurban|kurban/.test(p) ? 'Qurban' : '';
  if (pil) return { jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: pil };
  if (!p && /^infa[kq] umum/.test(k)) return { jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '' };
  return null;
}
var _RK_KATA_UMUM = { kl:1, kll:1, ull:1, ul:1, lazismu:1, infak:1, infaq:1, terikat:1, umum:1, zakat:1, mal:1, maal:1, unit:1, layanan:1, kantor:1, dan:1, untuk:1, dari:1 };
function _rkKata(s){ return _norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function(w){ return w && !_RK_KATA_UMUM[w]; }); }
/* Seberapa banyak kata nama rekap muncul di teks jurnal (0..1). */
function _rkMirip(nama, teks){
  var a = _rkKata(nama); if (!a.length) return 0.5;
  var b = ' ' + _rkKata(teks).join(' ') + ' ';
  var n = a.filter(function(w){ return b.indexOf(' ' + w + ' ') >= 0 || (w.length >= 5 && b.indexOf(' ' + w.slice(0, w.length - 1)) >= 0); }).length;
  return n / a.length;
}
function _rkHari(a, b){ return Math.abs((new Date(a) - new Date(b)) / 864e5); }
/* Mencocokkan baris rekap R dengan baris jurnal J. Mengembalikan pasangan
   { r, j:[indeks jurnal], cara } dan sisa di kedua sisi. */
function _rkCocokkan(R, J, teksJ, opsi){
  opsi = opsi || {};
  var pakai = {}, pasang = [], sisaR = [];
  var cari = function(r, syarat){
    var terbaik = -1, skor = -1;
    J.forEach(function(j, i){
      if (pakai[i] || !syarat(j, i)) return;
      var m = _rkMirip(r.nama || r.ket, teksJ(j)) - _rkHari(r.tanggal, j.tanggal) * 0.01;
      if (m > skor) { skor = m; terbaik = i; }
    });
    return terbaik;
  };
  var jml = function(j){ return Number(j.jumlah != null ? j.jumlah : j.nominal) || 0; };
  var lapis = [
    function(r){ return cari(r, function(j){ return j.tanggal === r.tanggal && Math.abs(jml(j) - r.jumlah) < 1; }); },
    function(r){ return cari(r, function(j){ return Math.abs(jml(j) - r.jumlah) < 1 && _rkHari(j.tanggal, r.tanggal) <= (opsi.hari || 4); }); },
    function(r){ return cari(r, function(j){ return j.tanggal === r.tanggal && Math.abs(jml(j) - r.jumlah) <= Math.max(5000, r.jumlah * 0.002) && _rkMirip(r.nama || r.ket, teksJ(j)) >= 0.5; }); }
  ];
  var antre = R.slice();
  lapis.forEach(function(f, li){
    var lagi = [];
    antre.forEach(function(r){ var i = f(r); if (i >= 0) { pakai[i] = 1; pasang.push({ r: r, j: [i], cara: li }); } else lagi.push(r); });
    antre = lagi;
  });
  /* Satu baris rekap = gabungan beberapa baris jurnal pada tanggal yang sama
     untuk nama yang sama (setoran kas KLL Bantul Kota di rekap, lima baris
     per peruntukan di jurnal). */
  antre.forEach(function(r){
    var calon = [];
    J.forEach(function(j, i){ if (!pakai[i] && j.tanggal === r.tanggal && _rkMirip(r.nama || r.ket, teksJ(j)) >= 0.99) calon.push(i); });
    var total = calon.reduce(function(a, i){ return a + jml(J[i]); }, 0);
    var pilih = null;
    if (calon.length >= 2 && Math.abs(total - r.jumlah) < 1) pilih = calon;
    else if (calon.length >= 2 && calon.length <= 16) {
      for (var mask = 1; mask < (1 << calon.length) && !pilih; mask++) {
        var t = 0, a = [];
        for (var b = 0; b < calon.length; b++) if (mask & (1 << b)) { t += jml(J[calon[b]]); a.push(calon[b]); }
        if (a.length >= 2 && Math.abs(t - r.jumlah) < 1) pilih = a;
      }
    }
    if (pilih) { pilih.forEach(function(i){ pakai[i] = 1; }); pasang.push({ r: r, j: pilih, cara: 3 }); }
    else sisaR.push(r);
  });
  var sisaJ = []; J.forEach(function(j, i){ if (!pakai[i]) sisaJ.push(i); });
  return { pasang: pasang, sisaR: sisaR, sisaJ: sisaJ };
}

function _samakanRekap(jurnal, rekap, opsi, listLayanan, listRek){
  opsi = opsi || {};
  var lay = (listLayanan || []).filter(function(l){ return l && l.nama; });
  var H = (jurnal && jurnal.himpun) || [], S = (jurnal && jurnal.salur) || [], U = (jurnal && jurnal.ump) || [];
  var dalam = function(r){ return !r._lewati && (!opsi.bulan || String(r.tanggal || '').slice(0, 7) === opsi.bulan || true); };
  var RH = rekap.himpun.filter(function(r){ return _rkCocokBerkas(r.via, opsi.jenis); });
  /* Penyaluran dan uang muka TIDAK dipilah lewat kolom MELALUI. Jurnal bank
     pemilik ikut memuat seksi "PENGELUARAN OPERASIONAL VIA KAS" dan LPJ
     tunai, sedangkan jurnal kas tidak memuat penyaluran sama sekali. Dipilah
     lewat MELALUI, 297 penyaluran tunai September "hilang" dari berkas bank
     dan "baru" di berkas kas sekaligus. Jadi: berkas yang tidak memuat
     penyaluran tidak dibandingkan penyalurannya; berkas yang memuatnya
     dibandingkan dengan SEMUA penyaluran rekap, dan yang hanya ada di rekap
     baru ditambahkan kalau jalurnya (kas/bank) sesuai berkas. */
  var adaSalur = S.some(function(r){ return !r._lewati; }), adaUmp = U.some(function(r){ return !r._lewati; });
  var RS = adaSalur ? rekap.salur.slice() : [];
  var RU = adaUmp ? rekap.ump.slice() : [];
  var out = [], no = 0;
  var tambah = function(o){ o.id = 'r' + (++no); out.push(o); };
  var info = function(k, i){
    var r = (k === 'himpun' ? H : k === 'salur' ? S : U)[i];
    return { kumpulan: k, idx: i, tanggal: r.tanggal, jumlah: Number(r.jumlah != null ? r.jumlah : r.nominal) || 0,
      nama: k === 'himpun' ? r.namaDonatur : k === 'salur' ? r.namaPenerima : r.layanan, keterangan: String(r.keterangan || '').slice(0, 100) };
  };
  var grup = {};
  var catat = function(jenis, kunci, judul, pesan, b, ubah, tingkat){
    var key = jenis + '|' + kunci;
    if (!grup[key]) { grup[key] = { jenis: jenis, tingkat: tingkat || 'perlu', judul: judul, pesan: pesan, baris: [], usulan: { perBaris: [] } }; }
    grup[key].baris.push(b);
    grup[key].usulan.perBaris.push({ kumpulan: b.kumpulan, idx: b.idx, ubah: ubah });
  };
  /* Jurnal dan rekap sama-sama menunjuk kantor TERDAFTAR, tetapi berbeda.
     Rekap September memuat 14 baris LPJ berlabel "KL Lazismu Pundong" yang
     keterangannya sendiri menulis "KLL Imogiri" dan "KLL Srandakan" (sel
     nama yang ikut tersalin ke bawah). Mengikuti labelnya berarti
     memindahkan Rp 49 juta LPJ Imogiri dan Srandakan ke Pundong. Jadi:
     kalau keterangan rekap sendiri menyebut kantor jurnal, rekapnya yang
     keliru dan jurnal dipakai (dicatat sebagai catatan). Selain itu
     ditanyakan, tidak diterapkan otomatis. */
  var _rkKantorBentrok = function(r, namaJ, labelR, b, ubah){
    var intiJ = String(namaJ || '').replace(/^(KLL|ULL)\s+/i, '');
    if (_rkMirip(intiJ, r.ket) >= 0.99) {
      catat('rekapCatatan', 'bentrok:' + _norm(r.nama) + '>' + _norm(namaJ), 'Rekap menulis "' + r.nama + '", keterangannya ' + namaJ,
        'Label nama di rekap tidak sama dengan keterangannya sendiri. Jurnal (' + namaJ + ') yang dipakai; betulkan rekapnya.', b, {}, 'info');
      return;
    }
    tambah({ jenis: 'rekapRancu', tingkat: 'perlu', judul: 'Jurnal ' + namaJ + ', rekap ' + labelR,
      pesan: '"' + (b.keterangan || '') + '" ' + _rpTeks(b.jumlah) + '. Jurnal dan rekap menunjuk kantor terdaftar yang berbeda. Memindahkannya mengubah saldo dan sisa LPJ kedua kantor.',
      baris: [b], usulan: { perBaris: [{ kumpulan: b.kumpulan, idx: b.idx, ubah: ubah }] } });
  };
  var rekLabel = function(via){
    var d = String(via || '').replace(/\D/g, '').replace(/^0+/, '');
    var hit = null;
    if (d.length >= 6) (listRek || []).forEach(function(x){ var n = String(x.nomor || '').replace(/\D/g, '').replace(/^0+/, ''); if (n && n === d) hit = x; });
    return hit;
  };
  var labelDana = function(r){ return r.subJenis === 'Infak Terikat' ? 'Infak Terikat ' + (r.pilar || '(tanpa pilar)') : (r.subJenis || r.jenisDana); };
  var kantorTak = {};

  /* ---------- PENERIMAAN ---------- */
  var idxH = []; H.forEach(function(r, i){ if (dalam(r)) idxH.push(i); });
  var JH = idxH.map(function(i){ return H[i]; });
  var hH = _rkCocokkan(RH, JH, function(j){ return (j.keterangan || '') + ' ' + (j.namaDonatur || ''); }, { hari: 4 });
  hH.pasang.forEach(function(p){
    var r = p.r, iJ = p.j.map(function(x){ return idxH[x]; });
    var rk = _rkKantor(r.nama, lay);
    iJ.forEach(function(i){
      var j = H[i], b = info('himpun', i);
      var kantorJ = /ULL/.test(String(j.tipeDonatur || '')) ? 'ULL' : /KLL/.test(String(j.tipeDonatur || '')) ? 'KLL' : '';
      if (!rk && kantorJ) {
        catat('rekapKantor', 'daerah', 'Rekap mencatat Daerah, jurnal mencatat kantor',
          'Di rekap nama donaturnya bukan KL/UL, jadi transaksi ini milik Lazismu Daerah.', b,
          { layananId: '', tipeDonatur: 'Perorangan', namaDonatur: r.nama, fundraising: r.nama });
      } else if (rk && rk.lay && rk.lay.id !== j.layananId) {
        var lt = String(rk.lay.tipe || rk.tipe).toUpperCase(), label = lt + ' ' + rk.lay.nama;
        var ubahK = { layananId: rk.lay.id, tipeDonatur: lt === 'ULL' ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)', namaDonatur: label, fundraising: label };
        if (j.layananId) _rkKantorBentrok(r, j.namaDonatur, label, b, ubahK);
        else catat('rekapKantor', rk.lay.id, 'Rekap mencatat ' + label,
          'Rekap menyebut "' + r.nama + '", jurnal mencatat ' + (kantorJ ? j.namaDonatur : 'Daerah') + '. Disamakan dengan rekap.', b, ubahK);
      } else if (rk && !rk.lay && !j.layananId) {
        var nm = rk.tipe + ' ' + rk.inti;
        catat('rekapKantor', 'tak:' + _norm(nm), 'Rekap mencatat ' + nm,
          'Rekap menyebut "' + r.nama + '" sebagai kantor, jurnal tanpa KLL/ULL. Kantornya belum terdaftar, jadi pilih di temuan "tidak terdaftar".', b,
          { layananId: '', tipeDonatur: rk.tipe === 'ULL' ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)', namaDonatur: nm, fundraising: nm });
        var kk = _norm(nm), alS = _aliasKantor()[_kunciAlias(rk.tipe, rk.inti)];
        if (alS && alS.sendiri) return;
        if (!kantorTak[kk]) kantorTak[kk] = { nama: nm, tipe: rk.tipe, baris: [] };
        kantorTak[kk].baris.push(b);
      }
      if (p.j.length === 1) {
        if (r.tanggal !== j.tanggal) catat('rekapTanggal', 'h', 'Tanggal disamakan dengan rekap', 'Jurnal dan rekap mencatat tanggal berbeda untuk transaksi yang sama.', b, { tanggal: r.tanggal, tglBeda: null }, 'info');
        if (Math.abs(r.jumlah - Number(j.jumlah)) >= 1) catat('rekapJumlah', 'h' + i, 'Nominal beda: jurnal ' + _rpTeks(j.jumlah) + ', rekap ' + _rpTeks(r.jumlah),
          '"' + r.nama + '" ' + r.tanggal + '. Disamakan dengan rekap.', b, { jumlah: r.jumlah });
        var d = _rkDana(r.ket, r.prog);
        if (d && !(d.jenisDana === 'Zakat' && j.jenisDana === 'Zakat') && !/bagi hasil/i.test(String(j.subJenis || ''))) {
          var baru = { jenisDana: d.jenisDana, subJenis: d.subJenis || j.subJenis, pilar: d.pilar != null ? d.pilar : j.pilar };
          if (baru.jenisDana !== j.jenisDana || baru.subJenis !== j.subJenis || (baru.pilar || '') !== (j.pilar || '')) {
            var dari = labelDana(j), ke = labelDana(baru);
            catat('rekapDana', dari + '>' + ke, dari + ' menjadi ' + ke, 'Jenis dana dan pilar diambil dari kolom program di rekap.', b, baru);
          }
        }
      }
    });
  });
  hH.sisaJ.forEach(function(x){
    var i = idxH[x], j = H[i];
    tambah({ jenis: 'rekapHanyaJurnal', tingkat: 'perlu', judul: 'Tidak ada di rekap: ' + _rpTeks(j.jumlah),
      pesan: '"' + (j.keterangan || j.namaDonatur) + '" ' + j.tanggal + ' tercatat di jurnal tetapi tidak di rekap. Dilewati supaya sama dengan rekap.',
      baris: [info('himpun', i)], usulan: { lewati: true } });
  });
  hH.sisaR.forEach(function(r){
    var rk = _rkKantor(r.nama, lay), d = _rkDana(r.ket, r.prog) || { jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '' };
    var kas = _rkKas(r.via), rek = kas ? null : rekLabel(r.via);
    var nama = rk ? (rk.lay ? String(rk.lay.tipe || rk.tipe).toUpperCase() + ' ' + rk.lay.nama : rk.tipe + ' ' + rk.inti) : r.nama;
    var baris = { tanggal: r.tanggal, jenisDana: d.jenisDana, subJenis: d.subJenis || (d.jenisDana === 'Zakat' ? 'Zakat Mal' : 'Infak Umum'), pilar: d.pilar || '',
      program: '', namaDonatur: nama, tipeDonatur: rk ? (rk.tipe === 'ULL' ? 'Unit Layanan (ULL)' : 'Kantor Layanan (KLL)') : 'Perorangan',
      layananId: rk && rk.lay ? rk.lay.id : '', telepon: '', email: '', alamat: '', jumlah: r.jumlah,
      metode: kas ? 'Cash/Tunai' : 'Transfer Bank', rekeningId: rek ? rek.id : '', bank: rek ? (rek.namaBank + ' - ' + rek.nomor) : (kas ? 'Kas' : r.via),
      statusBayar: 'Lunas', keterangan: _rkTeks(r.ket + ' ' + r.nama), fundraising: nama, akunKredit: '', dariRekap: true };
    tambah({ jenis: 'rekapHanyaRekap', tingkat: 'perlu', judul: 'Hanya ada di rekap: ' + _rpTeks(r.jumlah) + ' ' + r.nama,
      pesan: r.tanggal + ', ' + r.ket + ' (sheet ' + r.sheet + ' baris ' + r.baris + '). Tidak ada di jurnal ' + (opsi.jenis || '') + '. Ditambahkan supaya sama dengan rekap.',
      baris: [], usulan: { tambah: [{ kumpulan: 'himpun', baris: baris }] } });
  });

  /* ---------- PENYALURAN ---------- */
  var admin = function(r){ return /^BIAYA ADMINISTRASI BANK$/i.test(String(r.section || '')) || /administrasi bank/i.test(String(r.program || '')); };
  var idxS = []; S.forEach(function(r, i){ if (dalam(r) && !admin(r)) idxS.push(i); });
  var JS = idxS.map(function(i){ return S[i]; });
  var hS = _rkCocokkan(RS, JS, function(j){ return (j.keterangan || '') + ' ' + (j.namaPenerima || ''); }, { hari: 5 });
  hS.pasang.forEach(function(p){
    var r = p.r;
    p.j.map(function(x){ return idxS[x]; }).forEach(function(i){
      var j = S[i], b = info('salur', i);
      var lpj = /^UMP\s+LPJ/i.test(String(j.section || ''));
      var kantorJ = /^(KLL|ULL)\s/i.test(String(j.namaPenerima || ''));
      if (r.sumber === 'KANTOR') {
        var rk = _rkKantor(r.nama, lay);
        if (rk && rk.lay) {
          var label = String(rk.lay.tipe || rk.tipe).toUpperCase() + ' ' + rk.lay.nama;
          var kJ = kantorJ ? _rkKantor(j.namaPenerima, lay) : null;
          if (_norm(j.namaPenerima) !== _norm(label)) {
            if (kJ && kJ.lay) _rkKantorBentrok(r, j.namaPenerima, label, b, { namaPenerima: label, fundraising: label });
            else catat('rekapKantor', 's' + rk.lay.id, 'Rekap mencatat penyaluran ' + label,
              'Rekap menyebut "' + r.nama + '", jurnal mencatat ' + (j.namaPenerima || 'Daerah') + '.', b, { namaPenerima: label, fundraising: label });
          }
        }
      } else if (r.sumber === 'DAERAH' && kantorJ) {
        var ubah = { namaPenerima: r.nama || 'Lazismu Daerah Bantul', fundraising: '' };
        if (lpj) tambah({ jenis: 'rekapRancu', tingkat: 'perlu', judul: 'LPJ ' + j.namaPenerima + ', rekap mencatat Daerah',
          pesan: '"' + j.keterangan + '" ' + _rpTeks(j.jumlah) + ' ada di seksi LPJ uang muka ' + j.namaPenerima + ', tetapi rekap mencatatnya penyaluran Daerah ke "' + r.nama + '". Kalau ikut rekap, sisa belum-LPJ kantor itu bertambah.',
          baris: [b], usulan: { perBaris: [{ kumpulan: 'salur', idx: i, ubah: ubah }] } });
        else catat('rekapKantor', 'sdaerah', 'Rekap mencatat penyaluran Daerah', 'Rekap mencatatnya di penyaluran Daerah.', b, ubah);
      } else if (r.sumber === 'AMIL' && !lpj && !/amil/i.test(String(j.sumberDana || ''))) {
        catat('rekapDana', 'amil', 'Sumber dana ' + (j.sumberDana || '-') + ' menjadi Amil',
          'Rekap mencatatnya sebagai pengeluaran amil ("' + r.prog + '").', b, { sumberDana: 'Amil', ashnaf: 'Amil' });
      }
      if (p.j.length === 1) {
        if (r.tanggal !== j.tanggal) catat('rekapTanggal', 's', 'Tanggal disamakan dengan rekap', 'Jurnal dan rekap mencatat tanggal berbeda untuk transaksi yang sama.', b, { tanggal: r.tanggal, tglBeda: null }, 'info');
        if (Math.abs(r.jumlah - Number(j.jumlah)) >= 1) catat('rekapJumlah', 's' + i, 'Nominal beda: jurnal ' + _rpTeks(j.jumlah) + ', rekap ' + _rpTeks(r.jumlah),
          '"' + (r.ket || r.nama) + '" ' + r.tanggal + '. Disamakan dengan rekap.', b, { jumlah: r.jumlah });
      }
    });
  });
  hS.sisaJ.forEach(function(x){
    var i = idxS[x], j = S[i];
    tambah({ jenis: 'rekapHanyaJurnal', tingkat: 'perlu', judul: 'Penyaluran tidak ada di rekap: ' + _rpTeks(j.jumlah),
      pesan: '"' + j.keterangan + '" ' + j.tanggal + '. Dilewati supaya sama dengan rekap.', baris: [info('salur', i)], usulan: { lewati: true } });
  });
  var salurLain = hS.sisaR.filter(function(r){ return !_rkCocokBerkas(r.via, opsi.jenis); });
  if (salurLain.length) tambah({ jenis: 'rekapCatatan', tingkat: 'info', judul: salurLain.length + ' penyaluran rekap tidak ditemukan di berkas ini',
    pesan: 'Jalurnya ' + (opsi.jenis === 'kas' ? 'bank' : 'kas') + ', jadi tidak ditambahkan dari berkas ini (' + _rpTeks(salurLain.reduce(function(a, r){ return a + r.jumlah; }, 0)) + '). Periksa saat mengimpor berkas yang memuatnya.',
    baris: [], usulan: null });
  hS.sisaR.filter(function(r){ return _rkCocokBerkas(r.via, opsi.jenis); }).forEach(function(r){
    var kas = _rkKas(r.via), rek = kas ? null : rekLabel(r.via);
    var rk = r.sumber === 'KANTOR' ? _rkKantor(r.nama, lay) : null;
    var nama = rk ? (rk.lay ? String(rk.lay.tipe || rk.tipe).toUpperCase() + ' ' + rk.lay.nama : rk.tipe + ' ' + rk.inti) : (r.nama || 'Lazismu Daerah Bantul');
    var baris = { tanggal: r.tanggal, ashnaf: r.sumber === 'AMIL' ? 'Amil' : 'Fi Sabilillah', sumberDana: r.sumber === 'AMIL' ? 'Amil' : 'Infak',
      program: r.prog || r.ket, namaPenerima: nama, nik: '', telepon: '', alamat: '', jumlah: r.jumlah, bentukBantuan: kas ? 'Tunai' : 'Transfer',
      metode: kas ? 'Cash/Tunai' : 'Transfer Bank', statusSalur: 'Tersalur', keterangan: r.ket || r.nama, fundraising: rk ? nama : '',
      rekeningId: rek ? rek.id : '', bank: rek ? (rek.namaBank + ' - ' + rek.nomor) : (kas ? 'Kas' : r.via), section: 'REKAP', dariRekap: true };
    /* Ditanyakan satu per satu, tidak ikut "Samakan semua": jurnal bank
       pemilik memuat penyaluran tunai juga, jadi penyaluran yang tidak ada
       di berkas ini bisa saja ada di berkas yang lain, dan menambahkannya
       berarti mencatatnya dua kali. */
    tambah({ jenis: 'rekapHanyaRekap', tingkat: 'perlu', tanya: true, judul: 'Penyaluran hanya ada di rekap: ' + _rpTeks(r.jumlah),
      pesan: r.tanggal + ', "' + (r.ket || r.nama) + '" (sheet ' + r.sheet + ' baris ' + r.baris + '). Tambahkan hanya kalau tidak ada di berkas jurnal lain bulan ini.',
      baris: [], usulan: { tambah: [{ kumpulan: 'salur', baris: baris }] } });
  });

  /* ---------- UANG MUKA: hanya dibandingkan ---------- */
  var idxU = []; U.forEach(function(r, i){ if (!r._lewati && r.jenis !== 'kembali') idxU.push(i); });
  var hU = _rkCocokkan(RU.map(function(r){ return { tanggal: r.tanggal, jumlah: r.jumlah, nama: r.ket }; }), idxU.map(function(i){ return U[i]; }),
    function(j){ return (j.keterangan || '') + ' ' + (j.layanan || ''); }, { hari: 4 });
  if (hU.sisaR.length || hU.sisaJ.length) tambah({ jenis: 'rekapUmp', tingkat: 'info', judul: 'Uang muka beda dengan rekap',
    pesan: hU.sisaR.length + ' uang muka hanya ada di rekap (' + _rpTeks(hU.sisaR.reduce(function(a, r){ return a + r.jumlah; }, 0)) + '), '
      + hU.sisaJ.length + ' hanya ada di jurnal. Uang muka tidak diubah otomatis; periksa jurnalnya.',
    baris: hU.sisaJ.map(function(x){ return info('ump', idxU[x]); }), usulan: null });

  Object.keys(grup).forEach(function(k){
    var gr = grup[k];
    var total = gr.baris.reduce(function(a, b){ return a + b.jumlah; }, 0);
    if (gr.baris.length > 1) gr.judul += ' (' + gr.baris.length + ' baris, ' + _rpTeks(total) + ')';
    tambah(gr);
  });
  Object.keys(kantorTak).forEach(function(k){
    var kt = kantorTak[k];
    tambah({ jenis: 'kantorTakTerdaftar', tingkat: 'perlu', judul: 'Kantor "' + kt.nama + '" tidak terdaftar',
      pesan: kt.baris.length + ' transaksi dari rekap memakai nama ini. Pilih kantor yang dimaksud, atau daftarkan dulu di menu Layanan. Pilihan Anda diingat untuk impor berikutnya.',
      nama: kt.nama, baris: kt.baris, usulan: null,
      pilihan: [_PILIHAN_DAERAH, _PILIHAN_SENDIRI].concat(lay.filter(function(l){ return !l.tipe || String(l.tipe).toUpperCase() === kt.tipe; })
        .map(function(l){ return { id: l.id, tipe: String(l.tipe || kt.tipe).toUpperCase(), nama: l.nama, label: _layLabel(l) }; })
        .sort(function(a, b){ return a.nama.localeCompare(b.nama); })) });
  });

  var sumR = function(a){ return a.reduce(function(x, r){ return x + r.jumlah; }, 0); };
  var sumJ = function(a){ return a.reduce(function(x, r){ return x + (Number(r.jumlah) || 0); }, 0); };
  out.unshift({ id: 'r0', jenis: 'rekapRingkas', tingkat: 'info', judul: 'Perbandingan dengan rekap',
    pesan: 'Rekap' + (opsi.jenis ? ' (penerimaan ' + (opsi.jenis === 'kas' ? 'tunai' : 'non tunai') + ')' : '') + ': penerimaan ' + _rpTeks(sumR(RH)) + ' (' + RH.length + ' baris)'
      + (adaSalur ? ', penyaluran ' + _rpTeks(sumR(RS)) + ' (' + RS.length + ' baris). ' : '. Berkas ini tidak memuat penyaluran, jadi penyaluran rekap dibandingkan saat berkas yang memuatnya diimpor. ')
      + 'Jurnal: penerimaan ' + _rpTeks(sumJ(JH)) + ' (' + JH.length + ' baris), penyaluran ' + _rpTeks(sumJ(JS)) + ' (' + JS.length + ' baris, tanpa biaya admin bank). '
      + (hH.pasang.length + hS.pasang.length) + ' transaksi cocok. Terapkan semua usulan di bawah supaya sama dengan rekap.',
    baris: [], usulan: null, angka: _rkAngka(RH, adaSalur ? RS : null, lay, hH.pasang.length + hS.pasang.length) });
  return out;
}

/* Angka rekap untuk tabel perbandingan di layar impor (pemilik, 2 Oktober
   2026: "kalau ada rekap, fokus perbandingan antara keduanya"). Hanya sisi
   rekap yang dihitung di sini; sisi jurnal dihitung di peramban dari baris
   yang sedang di layar, supaya selisihnya ikut mengecil setiap kali satu
   usulan diterapkan. Pembagian Daerah/KLL/ULL memakai aturan yang sama
   dengan usulan kantor (_rkKantor), jadi selisih nol berarti usulannya
   sudah diterapkan semua. */
function _rkAngka(RH, RS, lay, cocok){
  var h = { Daerah: 0, KLL: 0, ULL: 0, total: 0, n: 0 };
  (RH || []).forEach(function(r){
    var rk = _rkKantor(r.nama, lay);
    var k = rk ? (rk.lay ? String(rk.lay.tipe || rk.tipe).toUpperCase() : rk.tipe) : 'Daerah';
    if (k !== 'KLL' && k !== 'ULL') k = 'Daerah';
    h[k] += Number(r.jumlah) || 0; h.total += Number(r.jumlah) || 0; h.n++;
  });
  var s = RS ? { total: RS.reduce(function(a, r){ return a + (Number(r.jumlah) || 0); }, 0), n: RS.length } : null;
  return { himpun: h, salur: s, cocok: cocok || 0 };
}

async function apiSamakanRekap(t, jurnal, sheets, opsi){
  _requirePerm(t, 'penghimpunan', 'create');
  var rekap = _bacaRekap(sheets);
  if (!rekap.himpun.length && !rekap.salur.length && !rekap.ump.length)
    throw new Error('Rekap tidak dikenali. Pastikan ada sheet berkolom TANGGAL, NAMA, KETERANGAN, PROGRAM PENERIMAAN, JUMLAH, MELALUI.');
  var listLayanan = readAll(SHEETS.LAYANAN) || [];
  var listRek = readAll(SHEETS.REKENING) || [];
  return { temuan: _samakanRekap(jurnal || {}, rekap, opsi || {}, listLayanan, listRek),
           jumlahRekap: { himpun: rekap.himpun.length, salur: rekap.salur.length, ump: rekap.ump.length } };
}

async function apiParseImportText(t, text, type, opsi) {
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
      
      return _lengkapiTemuan({
        success: true,
        isJurnal: true,
        himpunValid: himpunValid,
        himpunInvalid: himpunInvalid,
        salurValid: salurValid,
        salurInvalid: salurInvalid,
        bedaDana: himpunValid.filter(function(x){ return x.bedaDana; }).length,
        anomaliTanggal: _kumpulAnomaliTgl(himpunValid, salurValid, resultJurnal.umpRows, resultJurnal.transferRows),
        dilewati: resultJurnal.dilewati || [],
        jumlahBarisSumber: resultJurnal.jumlahBarisSumber || 0,
        umpValid: resultJurnal.umpRows || [],
        transferValid: resultJurnal.transferRows || [],
        akunAsing: _kumpulAkunAsing(resultJurnal, listRek),
        akunTakDikenal: (resultJurnal.umpRows || []).concat(resultJurnal.transferRows || []).filter(function(x){ return x.akunDikenal === false; }).length
          + (resultJurnal.himpunRows || []).concat(resultJurnal.salurRows || []).filter(function(x){ return !x.rekeningId && _tampakRekening(x.bank); }).length,
        totalCount: resultJurnal.himpunRows.length + resultJurnal.salurRows.length + (resultJurnal.umpRows || []).length + (resultJurnal.transferRows || []).length
      }, opsi, listLayanan, resultJurnal);
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
    
    // Format buku kas (Tanggal | Uraian | Debet | Kredit | ... | Fundraising)
    var headersAwal = String(text).split(/\r?\n/)[0].split('\t').map(function(x){ return x.trim(); });
    if (type === 'himpun' && isBukuKasHeader(headersAwal)) {
      var bk = parseBukuKas(parseTSV(text), listLayanan);
      markDuplicates(bk.valid, []);
      return {
        success: true,
        isJurnal: false,
        isBukuKas: true,
        valid: bk.valid,
        invalid: [],
        dilewatiSetor: bk.dilewati.setor.length,
        dilewatiKosong: bk.dilewati.kosong.length,
        totalCount: bk.valid.length
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
    _lolosLembar(e);
    throw new Error('Gagal memproses teks: ' + (e.message || String(e)));
  }
}

async function apiSaveImportedData(t, rows, type) {
  var u = authUser(t);
  if (!Array.isArray(rows) || !rows.length) throw new Error('Tidak ada data untuk diimpor.');

  /* Pergerakan kas (uang muka & transfer) disimpan ke tabelnya sendiri —
     tidak menyentuh penghimpunan/pentasyarufan, hanya saldo per akun. */
  if (type === 'ump' || type === 'transfer') {
    _requirePerm(t, 'pentasyarufan', 'create');
    var sheetK = type === 'ump' ? SHEETS.UANGMUKA : SHEETS.TRANSFER;
    /* Anti-dobel: baris dengan tanggal, jenis, nominal, akun & keterangan yang
       sama persis dianggap sudah pernah diimpor. */
    var sidik = function(r){ return [r.tanggal, r.jenis, Math.round(Number(r.nominal)||0), r.akun || (r.dariAkun + '>' + r.keAkun), String(r.keterangan||'').trim().toLowerCase()].join('|'); };
    var ada = {}; (readAll(sheetK) || []).forEach(function(r){ ada[sidik(r)] = 1; });
    var nK = 0, nDobel = 0;
    rows.forEach(function(row){
      var b = {}; Object.keys(row).forEach(function(k){ if (k !== 'akunDikenal' && k !== 'isDuplicate') b[k] = row[k]; });
      var sd = sidik(b);
      if (ada[sd]) { nDobel++; return; }
      ada[sd] = 1;
      b.id = makeId(); b.petugas = u.nama; b.dibuat = new Date().toISOString();
      insertRow(sheetK, b); nK++;
    });
    audit(u.id, u.username, 'import_' + type, nK + ' data berhasil diimpor' + (nDobel ? ', ' + nDobel + ' dilewati (sudah ada)' : ''));
    return { ok:true, count:nK, dilewati:nDobel };
  }

  _requirePerm(t, type === 'himpun' ? 'penghimpunan' : 'pentasyarufan', 'create');
  var isHimpun = type === 'himpun';
  var sheetName = isHimpun ? SHEETS.PENGHIMPUNAN : SHEETS.PENTASYARUFAN;
  
  var currentRows = readAll(sheetName);
  var savedCount = 0;

  var monthsToSync = {};
  var _petaImp = isHimpun ? _petaDonatur() : null;
  var _layImp = [];
  if (isHimpun) { try { _layImp = readAll(SHEETS.LAYANAN) || []; } catch (e) {} }
  
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
    /* Donatur ikut terdaftar dari impor juga. Peta & daftar layanan dibaca
       sekali di luar loop supaya impor ratusan baris tetap ringan. */
    if (isHimpun) { try { daftarkanDonatur(row, _layImp, _petaImp); } catch (e) {} }
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
  var data = await bangunJurnalXlsx(mStr);       /* dibangun saat diminta, tidak disimpan */
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

/* Membersihkan nama donatur dari awalan jenis dana dan penanda anonim.

   Versi lama memeriksa penanda anonim SEBELUM awalan dikupas dan tidak pernah
   memeriksanya lagi sesudahnya, sehingga "Infak Umum NN" tersimpan sebagai
   donatur bernama "NN" dan "Infak Terikat NN Mursi" jadi "NN Mursi". Nama itu
   berubah lagi bila fungsinya dijalankan dua kali, jadi daftar donatur dan isi
   tabel bisa berbeda. Sekarang pengupasan diulang sampai stabil, penanda anonim
   ikut dikupas, dan pemeriksaannya dilakukan pada hasil akhir — hasilnya sama
   berapa kali pun fungsi ini dipanggil. */
var _DONATUR_ANONIM = ['nn', 'hamba allah', 'hambaallah', 'anonim', 'tanpa nama'];

function cleanDonaturName(name) {
  if (!name) return '';
  var s = String(name).trim();

  var prefixes = [
    /^(infak umum|infak terikat|zakat profesi|zakat fitrah|zakat mal|penerimaan zakat|penerimaan infak|penerimaan|setor tunai|mutasi)\s*[-.:]*\s*/i,
    /* penanda anonim di depan nama asli: "NN Mursi", "NN - Budi", "NN." */
    /^(nn|hamba allah|hambaallah|anonim|tanpa nama)\b[\s\-.:]*/i
  ];

  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < prefixes.length; i++) {
      if (prefixes[i].test(s)) {
        var next = s.replace(prefixes[i], '').trim();
        if (next !== s) { s = next; changed = true; }
      }
    }
  }

  var low = s.toLowerCase();
  if (!low) return '';
  if (_DONATUR_ANONIM.indexOf(low) >= 0) return '';
  if (low === 'infak umum' || low === 'infak terikat' || low === 'zakat' || low === 'infak' || low === 'dskl') return '';

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

/* ===== PENDAFTARAN DONATUR DARI PENGHIMPUNAN =====
   Setiap penerimaan yang dicatat ikut mendaftarkan penyumbangnya ke tabel
   Donatur, lengkap dengan alamat dan nomor telepon. Kantor Layanan (KLL) dan
   Unit Layanan (ULL) sengaja DILEWATI: itu kantor sendiri, bukan penyumbang. */
function _kategoriLayanan(kat) {
  var k = String(kat || '');
  return k.indexOf('Kantor Layanan') >= 0 || k.indexOf('Unit Layanan') >= 0;
}

/* Peta nama -> baris donatur, supaya impor massal tidak membaca sheet berulang. */
function _petaDonatur() {
  var peta = {};
  (readAll(SHEETS.DONATUR) || []).forEach(function(r) {
    var n = String(r.nama || '').trim().toLowerCase();
    if (n) peta[n] = r;
  });
  return peta;
}

/* Mendaftarkan / melengkapi satu donatur dari sebuah baris penghimpunan.
   Mengembalikan 'baru', 'lengkap' (data kosong terisi), atau '' bila dilewati. */
function daftarkanDonatur(row, layList, peta) {
  if (!row) return '';
  var nama = cleanDonaturName(row.namaDonatur);
  if (!nama) return '';                                   // NN / Hamba Allah / anonim
  var kategori = detectKategoriDonatur(nama, row.tipeDonatur, row.layananId, layList || []);
  if (_kategoriLayanan(kategori)) return '';              // KLL / ULL dikecualikan

  var key = nama.toLowerCase();
  var tel = String(row.telepon || '').trim();
  var alm = String(row.alamat || '').trim();
  var eml = String(row.email || '').trim();

  var ada = peta[key];
  if (ada) {
    /* Lengkapi yang masih kosong saja — jangan menimpa data yang sudah diisi
       petugas dengan nilai kosong dari transaksi berikutnya. */
    var ubah = {};
    if (!String(ada.telepon || '').trim() && tel) ubah.telepon = tel;
    if (!String(ada.alamat  || '').trim() && alm) ubah.alamat  = alm;
    if (!String(ada.email   || '').trim() && eml) ubah.email   = eml;
    if (!String(ada.kategori || '').trim() && kategori) ubah.kategori = kategori;
    if (!Object.keys(ubah).length) return '';
    updateRowById(SHEETS.DONATUR, ada.id, ubah);
    Object.keys(ubah).forEach(function(k) { ada[k] = ubah[k]; });
    return 'lengkap';
  }

  var baru = {
    id: makeId(), nama: nama, kategori: kategori,
    telepon: tel, alamat: alm, email: eml,
    dibuat: new Date().toISOString()
  };
  insertRow(SHEETS.DONATUR, baru);
  peta[key] = baru;
  return 'baru';
}

/* Mendaftarkan donatur dari transaksi penghimpunan yang sudah terlanjur
   tersimpan (mis. hasil impor sebelum fitur ini ada).
   terapkan=false hanya menghitung, tidak menulis apa pun. */
function apiSinkronDonatur(t, terapkan) {
  var u = _requirePerm(t, 'penghimpunan', terapkan ? 'edit' : 'view');
  var layList = [];
  try { layList = readAll(SHEETS.LAYANAN) || []; } catch (e) {}
  var rows = readAll(SHEETS.PENGHIMPUNAN) || [];
  var peta = _petaDonatur();

  var baru = 0, lengkap = 0, dilewatiLayanan = 0, dilewatiAnonim = 0;
  var contoh = [];
  var sudah = {};

  rows.forEach(function(r) {
    var nama = cleanDonaturName(r.namaDonatur);
    if (!nama) { dilewatiAnonim++; return; }
    var kategori = detectKategoriDonatur(nama, r.tipeDonatur, r.layananId, layList);
    if (_kategoriLayanan(kategori)) { dilewatiLayanan++; return; }

    var key = nama.toLowerCase();
    if (!terapkan) {
      if (!peta[key] && !sudah[key]) {
        sudah[key] = 1; baru++;
        if (contoh.length < 8) contoh.push({
          nama: nama, kategori: kategori,
          telepon: String(r.telepon || '').trim(),
          alamat: String(r.alamat || '').trim()
        });
      }
      return;
    }
    var hasil = daftarkanDonatur(r, layList, peta);
    if (hasil === 'baru') {
      baru++;
      if (contoh.length < 8) contoh.push({
        nama: nama, kategori: kategori,
        telepon: String(r.telepon || '').trim(),
        alamat: String(r.alamat || '').trim()
      });
    } else if (hasil === 'lengkap') lengkap++;
  });

  if (terapkan) {
    audit(u.id, u.username, 'sinkron_donatur',
      baru + ' donatur baru, ' + lengkap + ' dilengkapi',
      { modul: 'donatur', ringkas: 'KLL/ULL dilewati: ' + dilewatiLayanan + ', anonim: ' + dilewatiAnonim });
  }
  return {
    diterapkan: !!terapkan, baru: baru, dilengkapi: lengkap,
    dilewatiLayanan: dilewatiLayanan, dilewatiAnonim: dilewatiAnonim,
    totalTransaksi: rows.length, contoh: contoh
  };
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
  
  /* Kantor Layanan (KLL) & Unit Layanan (ULL) bukan penyumbang — mereka kantor
     sendiri, jadi tidak ikut ditampilkan sebagai donatur. */
  var _donaturArr = Object.values(donaturMap).filter(function(o) {
    return !_kategoriLayanan(o.kategori);
  });
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
var _SETUP_INIT_PW = '';
function hashPassword(p,salt){
  if (!p) return '';
  try {
    return crypto.scryptSync(String(p), String(salt || 'salt'), 64).toString('hex');
  } catch(e) {
    return crypto.createHash('sha256').update(String(salt)+'::'+String(p)).digest('hex');
  }
}
/* ================================================================
   PERBAIKAN DATA LAMA (sekali jalan)
   ----------------------------------------------------------------
   Aturan rekap dan pilar sudah diperbaiki, tetapi kolom `pilar` dan
   `layananId` tersimpan di basis data, jadi baris yang terlanjur masuk
   masih membawa nilai lama. Fungsi ini menyisirnya tanpa impor ulang.

   Dua hal yang disentuh, dan hanya kalau memang jelas keliru:
     1. pilar  — hanya diganti bila teks peruntukannya cocok TEGAS dengan
                 satu kata kunci (mis. "Donasi NTT" -> Kemanusiaan).
                 Peruntukan yang tidak dikenali dibiarkan apa adanya,
                 supaya pilar dari jurnal (yang diambil dari akun kredit,
                 mis. "SOS" -> Pendidikan) tidak ikut tertimpa.
     2. layananId — dilepas bila tidak ada penanda KLL/ULL sama sekali
                 dan tipe donaturnya juga bukan Kantor/Unit Layanan.
   Selalu bisa dijalankan dalam mode periksa dulu (tanpa menyimpan).
   ================================================================ */

/* Sama seperti detectPilarFromText, tetapi mengembalikan '' bila tidak ada
   kata kunci yang benar-benar cocok — bukan menebak 'Sosial Dakwah'. */
function detectPilarTegas(text){
  if (!text) return '';
  var s = ' ' + String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  var peta = [
    [/\bpalestin\w*\b|\bgaza\b|\bntt\b|\bnusa tenggara timur\b/, 'Kemanusiaan'],
    [/\bkekeringan\b|\bdropping air\b/, 'Sosial Dakwah'],
    [/\bkesehatan\b|\bambulan\w*\b|\bklinik\b|\bberobat\b|\bdonor darah\b/, 'Kesehatan'],
    [/\bpendidikan\b|\bsekolah\b|\bbeasiswa\b|\bpesantren\b|\bpondok\b|\bmadrasah\b|\bsantri\b|\bsdua\b/, 'Pendidikan'],
    [/\bkemanusiaan\b|\bbencana\b|\bgempa\b|\bbanjir\b|\bkebakaran\b|\blongsor\b|\btsunami\b|\berupsi\b|\bpengungsi\b/, 'Kemanusiaan'],
    [/\bqurban\b|\bkurban\b/, 'Qurban'],
    [/\bumkm\b|\bmodal usaha\b|\bekonomi\b/, 'Ekonomi'],
    [/\blingkungan\b|\bsampah\b/, 'Lingkungan']
  ];
  for (var i = 0; i < peta.length; i++) if (peta[i][0].test(s)) return peta[i][1];
  return '';
}

function _pdAdaPenandaLayanan(r){
  var teks = [r.namaDonatur, r.namaPenerima, r.program, r.keterangan]
    .map(function(x){ return String(x == null ? '' : x); }).join(' | ');
  if (_layFromPrefix(teks)) return true;
  var td = _norm(r.tipeDonatur);
  return td.indexOf('kantor layanan') >= 0 || td.indexOf('unit layanan') >= 0 || td === 'kll' || td === 'ull';
}

/* ===== CADANGAN & HAPUS DATA PER RENTANG TANGGAL ===== */

/* Tanggal disimpan sebagai 'yyyy-mm-dd' sehingga perbandingan teks sudah tepat. */
function _tglSah(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s == null ? '' : s).slice(0,10)); }
function _dalamRentang(tgl, dari, sampai){
  var t = String(tgl == null ? '' : tgl).slice(0,10);
  if (!_tglSah(t)) return false;
  if (dari && t < dari) return false;
  if (sampai && t > sampai) return false;
  return true;
}

/* Cadangan seluruh data untuk diunduh dan disimpan sendiri.
   Sesi login tidak ikut (tidak berguna saat dipulihkan) dan kata sandi
   dikosongkan — berkas cadangan bisa berpindah tangan, hash kata sandi
   tidak boleh ikut berpindah. */
/* Membangun isi cadangan dari basis data yang sedang dimuat. Tanpa sesi —
   dipakai oleh cron cadangan harian (api/backup.js) dan oleh apiCadanganDB. */
function buatCadangan(oleh){
  var hasil = { versi:1, dibuat:new Date().toISOString(), oleh:oleh||'sistem', sheets:{}, props:{} };

  Object.keys((DB && DB.sheets) || {}).forEach(function(nama){
    if (nama === SHEETS.SESSIONS) return;
    hasil.sheets[nama] = (DB.sheets[nama] || []).map(function(r){ return (r || []).slice(); });
  });

  var us = hasil.sheets[SHEETS.USERS];
  if (us && us.length){
    var kol = [];
    (us[0] || []).forEach(function(nm, i){ if (/password|sandi|hash|salt/i.test(String(nm))) kol.push(i); });
    for (var i = 1; i < us.length; i++) kol.forEach(function(c){ us[i][c] = ''; });
  }

  /* Properti kecil ikut; berkas Excel bulanan yang tersimpan sebagai base64
     dilewati supaya berkas cadangan tidak membengkak percuma. */
  Object.keys((DB && DB.props) || {}).forEach(function(k){
    if (k === '_aksesTerakhir') return;
    var v = DB.props[k];
    if (typeof v === 'string' && v.length > 20000) return;
    hasil.props[k] = v;
  });

  var jml = {};
  Object.keys(hasil.sheets).forEach(function(n){ jml[n] = Math.max(0, hasil.sheets[n].length - 1); });
  hasil.ringkas = {
    baris: jml,
    ukuran: JSON.stringify(hasil).length,
    tanpa: ['Sessions', 'kata sandi pengguna', 'berkas Excel bulanan']
  };
  return hasil;
}

function apiCadanganDB(t){
  var u = _requirePerm(t, 'settings', 'edit');
  var hasil = buatCadangan(u.username);
  var jml = hasil.ringkas.baris;
  audit(u.id, u.username, 'cadangan_db', 'unduh cadangan',
    { modul:'settings', ringkas:'Penghimpunan '+(jml[SHEETS.PENGHIMPUNAN]||0)+' baris · Pentasyarufan '+(jml[SHEETS.PENTASYARUFAN]||0)+' baris' });
  return hasil;
}

/* Cek izin tanpa efek samping — dipakai api/backup.js sebelum menjalankan
   perintah manual (cadangkan/pulihkan) atas nama pengguna yang login. */
function apiCekIzin(t, modul, aksi){ var u=_requirePerm(t, modul, aksi); return { ok:true, username:u.username, role:u.role }; }

/* Status cadangan terakhir, dicatat oleh api/backup.js ke props. */
function apiStatusCadangan(t){
  _requirePerm(t, 'settings', 'view');
  return (DB && DB.props && DB.props._cadanganTerakhir) || null;
}
function catatStatusCadangan(st){ if (DB && DB.props) DB.props._cadanganTerakhir = st; }

/* ===== PULIHKAN CADANGAN =====
   Hanya superadmin. Mengganti seluruh data transaksi & master dari berkas
   cadangan, TETAPI akun pengguna dan sesi yang sedang berjalan dibiarkan:
   cadangan sengaja tidak memuat kata sandi, jadi menimpa Users hanya akan
   mengunci semua orang keluar. Salinan keadaan SEBELUM pemulihan disimpan
   oleh api/backup.js sebagai cadangan tersendiri (nama "sebelum-pulih"),
   bukan di dalam basis data, supaya ukurannya tidak menggelembung. */
function apiPulihkanDB(t, cadangan, konfirmasi){
  var u = authUser(t);
  if (u.role !== 'superadmin') throw new Error('IZIN: hanya superadmin yang boleh memulihkan basis data.');
  if (konfirmasi !== 'PULIHKAN') throw new Error('Ketik PULIHKAN untuk mengonfirmasi.');
  if (typeof cadangan === 'string') { try { cadangan = JSON.parse(cadangan); } catch (e) { throw new Error('Berkas cadangan bukan JSON yang sah.'); } }
  if (!cadangan || !cadangan.sheets || typeof cadangan.sheets !== 'object') throw new Error('Berkas cadangan tidak dikenali (tidak ada bagian sheets).');
  if (!cadangan.sheets[SHEETS.PENGHIMPUNAN]) throw new Error('Berkas cadangan tidak memuat data Penghimpunan.');

  var lindungi = {}; lindungi[SHEETS.USERS] = 1; lindungi[SHEETS.SESSIONS] = 1;

  var diganti = [];
  Object.keys(cadangan.sheets).forEach(function(n){
    if (lindungi[n]) return;
    var rows = cadangan.sheets[n];
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0])) return;
    DB.sheets[n] = rows.map(function(r){ return (r || []).slice(); });
    diganti.push(n + ' (' + (rows.length - 1) + ')');
  });
  /* Properti kecil ikut dipulihkan; penanda internal dan status tetap milik sekarang. */
  Object.keys(cadangan.props || {}).forEach(function(k){
    if (/^_/.test(k)) return;
    DB.props[k] = cadangan.props[k];
  });
  setup();                                     /* pastikan skema kolom terbaru */
  audit(u.id, u.username, 'pulihkan_db', 'dari cadangan ' + (cadangan.dibuat || '?'),
    { modul:'settings', ringkas: diganti.join(', ') });
  return { ok:true, diganti: diganti, dariTanggal: cadangan.dibuat || '' };
}

/* Hapus penghimpunan / pentasyarufan pada rentang tanggal tertentu.
   Selalu dijalankan dua tahap: `terapkan:false` hanya menghitung dan
   merinci, `terapkan:true` baru menghapus. Rentang harian maupun bulanan
   sama-sama dinyatakan sebagai tanggal awal dan tanggal akhir. */
async function apiHapusRentang(t, d){
  var u = _requirePerm(t, 'settings', 'delete');
  d = d || {};
  var dari   = String(d.dari   == null ? '' : d.dari).slice(0,10);
  var sampai = String(d.sampai == null ? '' : d.sampai).slice(0,10);
  if (!_tglSah(dari) || !_tglSah(sampai)) throw new Error('Tanggal awal dan tanggal akhir harus diisi.');
  if (dari > sampai) throw new Error('Tanggal awal tidak boleh melewati tanggal akhir.');

  var ambil = {};
  ambil[SHEETS.PENGHIMPUNAN] = (d.himpun !== false);
  ambil[SHEETS.PENTASYARUFAN] = (d.salur !== false);
  if (!ambil[SHEETS.PENGHIMPUNAN] && !ambil[SHEETS.PENTASYARUFAN])
    throw new Error('Pilih minimal satu jenis data yang akan dihapus.');

  var terapkan = (d.terapkan === true);
  var out = {
    dari:dari, sampai:sampai, diterapkan:terapkan,
    himpun:{ jumlah:0, nominal:0 }, salur:{ jumlah:0, nominal:0 },
    perBulan:{}, contoh:[], bulanTersentuh:{}
  };

  function sisir(sheet, kunci){
    if (!ambil[sheet]) return;
    var rows = readAll(sheet) || [];
    rows.forEach(function(r){
      if (!_dalamRentang(r.tanggal, dari, sampai)) return;
      var n = Number(r.jumlah) || 0;
      out[kunci].jumlah += 1;
      out[kunci].nominal += n;
      var bln = String(r.tanggal).slice(0,7);
      out.bulanTersentuh[bln] = true;
      var b = out.perBulan[bln] || (out.perBulan[bln] = { bulan:bln, himpunJml:0, himpunRp:0, salurJml:0, salurRp:0 });
      b[kunci + 'Jml'] += 1;
      b[kunci + 'Rp']  += n;
      if (out.contoh.length < 12) out.contoh.push({
        jenis: (kunci === 'himpun' ? 'Penghimpunan' : 'Pentasyarufan'),
        tanggal: String(r.tanggal).slice(0,10),
        nama: r.namaDonatur || r.namaPenerima || '-',
        bukti: r.noKwitansi || r.noBukti || '-',
        jumlah: n
      });
    });
  }
  sisir(SHEETS.PENGHIMPUNAN, 'himpun');
  sisir(SHEETS.PENTASYARUFAN, 'salur');

  out.totalBaris   = out.himpun.jumlah + out.salur.jumlah;
  out.totalNominal = out.himpun.nominal + out.salur.nominal;
  out.daftarBulan  = Object.keys(out.perBulan).sort().map(function(k){ return out.perBulan[k]; });

  if (!terapkan || out.totalBaris === 0) return out;

  /* Penghapusan dari belakang supaya nomor baris yang belum diproses tidak bergeser. */
  function buang(sheet){
    if (!ambil[sheet]) return 0;
    var sh = getSS().getSheetByName(sheet);
    if (!sh) return 0;
    var v = sh.getDataRange().getValues();
    var ct = (v[0] || []).indexOf('tanggal');
    if (ct < 0) return 0;
    var n = 0;
    for (var i = v.length - 1; i >= 1; i--){
      if (_dalamRentang(v[i][ct], dari, sampai)){ sh.deleteRow(i + 1); n++; }
    }
    return n;
  }
  out.terhapusHimpun = buang(SHEETS.PENGHIMPUNAN);
  out.terhapusSalur  = buang(SHEETS.PENTASYARUFAN);
  /* Pergerakan kas (uang muka & transfer) ikut dibersihkan bersama
     pentasyarufan, supaya impor ulang periode yang sama tidak menggandakan
     saldo per rekening. */
  if (ambil[SHEETS.PENTASYARUFAN]) { ambil[SHEETS.UANGMUKA] = true; ambil[SHEETS.TRANSFER] = true; }
  out.terhapusUmp      = buang(SHEETS.UANGMUKA);
  out.terhapusTransfer = buang(SHEETS.TRANSFER);
  out.terhapus = out.terhapusHimpun + out.terhapusSalur + out.terhapusUmp + out.terhapusTransfer;

  audit(u.id, u.username, 'hapus_rentang', dari + ' s/d ' + sampai,
    { modul:'settings',
      ringkas: out.terhapusHimpun + ' penghimpunan + ' + out.terhapusSalur + ' pentasyarufan dihapus · Rp '
             + (out.totalNominal || 0).toLocaleString('id-ID') });

  var bulan = Object.keys(out.bulanTersentuh);
  for (var i = 0; i < bulan.length; i++) await syncMonthlySpreadsheet(bulan[i]);
  return out;
}

/* Setor tunai adalah perpindahan uang kas -> bank, BUKAN penghimpunan. Impor
   sekarang sudah melewatinya, tetapi data lama (diimpor sebelum aturan ini)
   mungkin masih menyimpannya sebagai penghimpunan. Alat ini menyisirnya:
   preview lalu hapus. */
function _isSetorTunaiHimpun(r){
  var sj = _norm(r.subJenis), nd = _norm(r.namaDonatur), pr = _norm(r.program);
  return sj === 'setor tunai' || nd === 'setor tunai' || pr === 'setor tunai';
}
async function apiBersihkanSetorTunai(t, terapkan){
  var u = _requirePerm(t, 'settings', 'delete');
  var rows = readAll(SHEETS.PENGHIMPUNAN) || [];
  var kena = rows.filter(_isSetorTunaiHimpun);
  var nominal = kena.reduce(function(a, b){ return a + (Number(b.jumlah) || 0); }, 0);
  var contoh = kena.slice(0, 12).map(function(r){
    return { tanggal: String(r.tanggal || '').slice(0,10), nama: r.namaDonatur || '-',
             jenis: (r.jenisDana || '') + ' / ' + (r.subJenis || ''),
             bukti: r.noKwitansi || '-', jumlah: Number(r.jumlah) || 0 };
  });

  var out = { diterapkan: !!terapkan, jumlah: kena.length, nominal: nominal, contoh: contoh };
  if (!terapkan || !kena.length) return out;

  var bulan = {};
  kena.forEach(function(r){ var m = getMonthFromDate(r.tanggal); if (m) bulan[m] = true; deleteRowById(SHEETS.PENGHIMPUNAN, r.id); });
  out.terhapus = kena.length;
  audit(u.id, u.username, 'bersih_setor_tunai', kena.length + ' baris setor tunai dihapus',
    { modul: 'settings', ringkas: kena.length + ' baris · Rp ' + nominal.toLocaleString('id-ID') });
  var keys = Object.keys(bulan);
  for (var i = 0; i < keys.length; i++) await syncMonthlySpreadsheet(keys[i]);
  return out;
}

/* ================================================================
   PERAWATAN 1 — NAMA KANTOR LAYANAN YANG BERCABANG
   ================================================================
   Mendaftar semua nama KLL/ULL yang benar-benar muncul di data, lalu
   menandai mana yang tidak ada di master Layanan berikut tebakan
   padanannya. Angka per kantor dipakai untuk membagi dana, jadi satu
   salah ketik yang tidak ketahuan berarti satu kantor kehilangan
   haknya dan satu kantor bayangan menyimpannya. */
function apiPeriksaLayanan(t, simpanPatokan){
  var _u = _requirePerm(t, 'settings', simpanPatokan ? 'edit' : 'view');
  var layList = readAll(SHEETS.LAYANAN) || [];
  var resmi = {}; layList.forEach(function(l){ if (l && l.nama) resmi[_norm(_layLabel(l))] = _layLabel(l); });

  /* kumpulkan nama beserta dari sumber mana saja ia muncul */
  var pakai = {};
  /* Dikelompokkan dengan kunci yang SAMA seperti rekap KLL (bentuk setelah
     huruf kembar diratakan), supaya panel pemeriksaan dan angka di menu
     Saldo KLL tidak pernah bercerita berbeda. Ejaan yang ditampilkan adalah
     yang paling banyak dipakai di data. */
  var catat = function(nama, sumber, nominal){
    var s = String(nama || '').trim();
    if (!s || s === LAYANAN_DAERAH) return;
    var k = _ratakanHuruf(s);
    if (!pakai[k]) pakai[k] = { nama: s, ejaan: {}, himpun:0, nHimpun:0, ump:0, nUmp:0, lpj:0, nLpj:0 };
    pakai[k].ejaan[s] = (pakai[k].ejaan[s] || 0) + 1;
    if (pakai[k].ejaan[s] > (pakai[k].ejaan[pakai[k].nama] || 0)) pakai[k].nama = s;
    pakai[k][sumber] += Number(nominal) || 0;
    pakai[k]['n' + sumber.charAt(0).toUpperCase() + sumber.slice(1)]++;
  };
  var layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; });

  /* Ejaan yang masih salah di dalam baris data tetapi sudah tertutup oleh
     pencocokan mirip saat menampilkan. Rekapnya sudah benar, tetapi ejaannya
     masih mengendap — dan akan muncul kembali kalau master Layanan berubah.
     Jadi tetap dilaporkan supaya bisa dibereskan sekali untuk selamanya. */
  var rapi = {};
  var catatRapi = function(mentah, jadi){
    var m = String(mentah || '').trim();
    if (!m) return;
    if (!/^(KLL|ULL|KL)\b/i.test(m)) {
      /* Nama tanpa awalan KLL/ULL biasanya nama donatur biasa, dan melaporkan
         semuanya cuma jadi kebisingan. Satu perkecualian yang aman: kalau
         nama mentahnya SAMA PERSIS dengan nama kantor tujuan setelah awalan
         dibuang — "Masjid Baiturrahman Aceh" untuk "ULL Masjid Baiturrahman
         Aceh". Itu bukan donatur bernama mirip, itu nama kantor yang lupa
         awalannya, dan ia akan menggigit lagi begitu master Layanan berubah. */
      var jd = String(jadi || '');
      if (!/^(KLL|ULL)\b/i.test(jd)) return;
      var intiM = _ratakanHuruf(m);
      var intiJ = _ratakanHuruf(jd.replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, ''));
      if (!intiM || intiM !== intiJ) return;
    }
    if (_norm(m) === _norm(jadi)) return;
    var k = _norm(m);
    if (!rapi[k]) rapi[k] = { mentah: m, jadi: jadi, n: 0 };
    rapi[k].n++;
  };

  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    var nm = resolveLayananName(r, layList, layMap);
    catat(nm, 'himpun', r.jumlah); catatRapi(r.namaDonatur, nm);
  });
  (readAll(SHEETS.UANGMUKA) || []).forEach(function(r){
    var nm = _layananUmp(r.layanan, layList);
    catat(nm, 'ump', r.nominal); catatRapi(r.layanan, nm);
  });
  (readAll(SHEETS.PENTASYARUFAN) || []).forEach(function(r){
    if (!/^UMP\s+LPJ/i.test(String(r.section || ''))) return;
    var nm = _layananUmp(r.namaPenerima, layList);
    catat(nm, 'lpj', r.jumlah); catatRapi(r.namaPenerima, nm);
  });

  /* master Layanan juga dikunci dengan bentuk yang sama */
  var resmiRata = {}; Object.keys(resmi).forEach(function(k){ resmiRata[_ratakanHuruf(resmi[k])] = resmi[k]; });
  var daftar = Object.keys(pakai).map(function(k){
    var x = pakai[k];
    x.terdaftar = !!resmiRata[k];
    if (resmiRata[k]) x.nama = resmiRata[k];
    delete x.ejaan;
    x.usul = '';
    x.alasan = '';
    if (!x.terdaftar) {
      var dekat = _padanLayanan(x.nama, layList);
      if (dekat) { x.usul = dekat.label; x.alasan = dekat.cara; }
      else {
        /* tidak ada di master sama sekali: cari nama lain yang sudah dipakai
           di data dan mirip, supaya dua ejaan liar pun bisa disatukan */
        var lawan = null;
        Object.keys(pakai).forEach(function(k2){
          if (k2 === k) return;
          var y = pakai[k2];
          var d = _jarakEdit(_ratakanHuruf(x.nama), _ratakanHuruf(y.nama));
          if (d > _batasSalahKetik(Math.max(_ratakanHuruf(x.nama).length, _ratakanHuruf(y.nama).length))) return;
          /* yang datanya lebih banyak dianggap ejaan yang benar */
          var berat = function(z){ return z.nHimpun + z.nUmp + z.nLpj; };
          if (berat(y) > berat(x) && (!lawan || berat(y) > berat(lawan))) lawan = y;
        });
        if (lawan) { x.usul = lawan.nama; x.alasan = 'ejaan lain yang lebih banyak dipakai'; }
      }
    }
    return x;
  });

  /* yang bermasalah ditaruh di atas */
  daftar.sort(function(a, b){
    if (a.terdaftar !== b.terdaftar) return a.terdaftar ? 1 : -1;
    return (b.himpun + b.ump + b.lpj) - (a.himpun + a.ump + a.lpj);
  });
  var bermasalah = daftar.filter(function(x){ return !x.terdaftar; });
  var dirapikan = Object.keys(rapi).map(function(k){ return rapi[k]; })
    .sort(function(a, b){ return b.n - a.n; });

  /* Pasangan nama yang MIRIP satu sama lain, sekalipun keduanya sudah
     terdaftar. Pencocokan otomatis sengaja dibuat ketat supaya tidak pernah
     menggabungkan dua kantor yang memang berbeda; sisanya justru harus
     dilihat manusia. Yang paling menandakan salah ketik adalah timpangnya
     jumlah baris: "KLL Pundong" 733 baris berdampingan dengan "KLL Pundonvg"
     1 baris hampir pasti bukan dua kantor. */
  var berat = function(z){ return z.nHimpun + z.nUmp + z.nLpj; };
  var mirip = [];
  for (var i = 0; i < daftar.length; i++) {
    for (var j = i + 1; j < daftar.length; j++) {
      var A = daftar[i], B = daftar[j];
      if (!/^(KLL|ULL)\b/i.test(A.nama) || !/^(KLL|ULL)\b/i.test(B.nama)) continue;
      /* KLL dan ULL adalah dua jenis kantor yang berbeda — jangan pernah
         diusulkan bergabung hanya karena namanya mirip */
      if (A.nama.slice(0, 3).toUpperCase() !== B.nama.slice(0, 3).toUpperCase()) continue;
      /* bandingkan tanpa awalan, supaya panjang namanya yang dinilai */
      var ra = _ratakanHuruf(String(A.nama).replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, ''));
      var rb2 = _ratakanHuruf(String(B.nama).replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, ''));
      if (Math.max(ra.length, rb2.length) < 6) continue;
      var d = _jarakEdit(ra, rb2);
      /* jarak 3 sudah terlalu longgar: "Piyungan" dan "Pajangan" hanya
         berjarak 3 padahal dua kantor yang benar-benar berbeda */
      if (d < 1 || d > 2) continue;
      var besar = berat(A) >= berat(B) ? A : B;
      var kecil = besar === A ? B : A;
      mirip.push({
        banyak: besar.nama, nBanyak: berat(besar),
        sedikit: kecil.nama, nSedikit: berat(kecil),
        jarak: d,
        nominal: kecil.himpun + kecil.ump + kecil.lpj,
        /* makin timpang, makin besar kemungkinan salah ketik */
        yakin: berat(besar) >= berat(kecil) * 10 ? 'tinggi' : berat(besar) >= berat(kecil) * 3 ? 'sedang' : 'rendah'
      });
    }
  }
  mirip.sort(function(a, b){
    var urutan = { tinggi: 0, sedang: 1, rendah: 2 };
    if (urutan[a.yakin] !== urutan[b.yakin]) return urutan[a.yakin] - urutan[b.yakin];
    return a.nSedikit - b.nSedikit;
  });

  /* ================= NAMA YANG BERTUMPUK =================
     Daftar `mirip` di atas hanya menangkap SALAH KETIK: dua nama yang
     panjangnya mirip dan berbeda satu dua huruf. Ia buta terhadap bentuk
     duplikat yang justru paling sering lahir dari daftar Layanan yang
     diketik dua kali, dan bentuk itu jauh lebih merusak:

       "ULL Masjid"  -  "ULL Masjid Baiturrahman"  -  "ULL Masjid Baiturrahman Aceh"

     Ketiganya satu kantor yang sama, tetapi _jarakEdit menyerah pada
     pasangan mana pun di antaranya (selisih panjangnya lebih dari tiga
     huruf, jadi jaraknya dikembalikan 99) sehingga tidak satu pun pernah
     dilaporkan. Padahal akibatnya paling parah: pencocokan nama memilih
     padanan TERPANJANG yang cocok, jadi setoran jatuh ke satu nama, uang
     muka ke nama kedua, dan LPJ ke nama ketiga. Yang terlihat di menu
     Saldo KLL adalah satu kantor bersaldo positif besar tanpa LPJ dan satu
     kantor bersaldo minus besar tanpa uang muka — dua-duanya salah, dan
     tidak ada satu pun galat yang memberi tahu.

     Bentuk kedua: nama yang sama persis tetapi awalannya berbeda atau
     hilang — "Masjid Baiturrahman Aceh" di samping "ULL Masjid Baiturrahman
     Aceh". Pemeriksaan `mirip` sengaja melewati pasangan beda jenis supaya
     KLL tidak pernah diusulkan bergabung dengan ULL, dan aturan itu ikut
     menutupi kasus ini.

     Keduanya DILAPORKAN, tidak pernah digabung sendiri: "KLL Sedayu" dan
     "KLL Sedayu 2" juga berbentuk awalan, dan itu dua kantor yang memang
     berbeda. Yang memutuskan tetap orang; timpangnya jumlah baris dan
     status terdaftar disediakan sebagai bahan pertimbangannya. */
  var _inti = function(n){ return _ratakanHuruf(String(n).replace(/^\s*(KLL|ULL|KL)\b[\s:.\-]*/i, '')); };
  var _jenisNama = function(n){ return /^\s*ull\b/i.test(n) ? 'ULL' : /^\s*(kll|kl)\b/i.test(n) ? 'KLL' : '(tanpa awalan)'; };

  /* Kantor yang terdaftar tetapi belum punya satu baris pun ikut disertakan:
     duplikat di master Layanan harus ketahuan sebelum ada uang yang telanjur
     masuk ke nama yang salah, bukan sesudahnya. */
  var semua = daftar.map(function(x){
    return { nama: x.nama, terdaftar: !!x.terdaftar, baris: berat(x),
      nominal: x.himpun + x.ump + x.lpj };
  });
  var sudahAda = {}; semua.forEach(function(x){ sudahAda[_norm(x.nama)] = true; });
  layList.forEach(function(l){
    var lab = _layLabel(l);
    if (!lab || sudahAda[_norm(lab)]) return;
    sudahAda[_norm(lab)] = true;
    semua.push({ nama: lab, terdaftar: true, baris: 0, nominal: 0 });
  });

  var kembar = [];
  for (var ia = 0; ia < semua.length; ia++) {
    for (var ib = ia + 1; ib < semua.length; ib++) {
      var X = semua[ia], Y = semua[ib];
      var ix = _inti(X.nama), iy = _inti(Y.nama);
      if (!ix || !iy) continue;
      var jx = _jenisNama(X.nama), jy = _jenisNama(Y.nama);
      var sebab = '';
      if (ix === iy) {
        /* nama intinya sama persis: yang beda cuma awalannya */
        if (jx === jy) continue;                 // sudah ditangani penyatuan ejaan
        sebab = 'beda-awalan';
      } else {
        if (jx !== jy) continue;                 // beda jenis, jangan ditebak
        var pendek = ix.length < iy.length ? ix : iy;
        var panjang = pendek === ix ? iy : ix;
        if (pendek.length < 4) continue;         // "ull m" bukan petunjuk apa pun
        if (panjang.indexOf(pendek + ' ') !== 0) continue;
        sebab = 'awalan';
      }
      var besarK = X.baris >= Y.baris ? X : Y;
      var kecilK = besarK === X ? Y : X;
      kembar.push({
        sebab: sebab,
        banyak: besarK.nama, nBanyak: besarK.baris, terdaftarBanyak: besarK.terdaftar,
        sedikit: kecilK.nama, nSedikit: kecilK.baris, terdaftarSedikit: kecilK.terdaftar,
        nominal: kecilK.nominal,
        /* Kalau DUA-DUANYA terdaftar, yang kembar adalah master Layanan-nya,
           bukan cuma ketikan di jurnal — itu perlu dikatakan terpisah karena
           menggabungkan barisnya saja tidak menghapus kantor bayangannya. */
        diMaster: besarK.terdaftar && kecilK.terdaftar,
        /* Dugaan, bukan vonis. Nama yang intinya sama persis hampir pasti satu
           kantor. Nama yang berbentuk awalan jauh lebih longgar: "KLL Sedayu"
           memang awalan "KLL Sedayu 2", dan itu dua kantor. Yang dipakai
           sebagai petunjuk adalah timpangnya jumlah baris — nama yang tidak
           dipakai sama sekali di samping nama yang dipakai ratusan kali hampir
           selalu pendaftaran nyasar, bukan kantor kedua. */
        yakin: sebab === 'beda-awalan' ? 'tinggi'
          : (kecilK.baris === 0 && besarK.baris > 0) ? 'tinggi'
          : (besarK.baris >= kecilK.baris * 10 && besarK.baris > 0) ? 'sedang'
          : 'rendah'
      });
    }
  }
  kembar.sort(function(a, b){
    var ur = { tinggi: 0, sedang: 1, rendah: 2 };
    if (ur[a.yakin] !== ur[b.yakin]) return ur[a.yakin] - ur[b.yakin];
    if (a.diMaster !== b.diMaster) return a.diMaster ? -1 : 1;
    return (b.nBanyak + b.nSedikit) - (a.nBanyak + a.nSedikit);
  });

  /* ============ APA YANG BERUBAH SEJAK PEMERIKSAAN TERAKHIR ============
     Membetulkan kwitansi satu per satu itu pekerjaan berjam-jam, dan yang
     paling melelahkan bukan menyuntingnya melainkan tidak tahu apakah
     suntingan tadi benar-benar mengenai sasaran. Daftar ini selalu dihitung
     ulang dari data, jadi baris yang sudah dibetulkan memang langsung hilang
     — tetapi "hilang" tidak terlihat oleh orang yang sedang menatap layar
     yang sama untuk kelima kalinya.

     Maka hasil pemeriksaan disimpan sebagai patokan, dan pemeriksaan
     berikutnya mengatakan apa yang berubah: nama yang sudah bersih, nama
     yang baru muncul, dan nama yang jumlah barisnya bergeser. Patokannya
     hanya ditulis kalau pemeriksaannya memang diminta menyimpan — melihat
     saja tidak boleh mengubah apa pun. */
  var patokanLama = null;
  try { patokanLama = JSON.parse(getSetting('periksaKantorPatokan') || 'null'); } catch (e) { patokanLama = null; }
  var sekarang = {};
  semua.forEach(function(x){ sekarang[_norm(x.nama)] = { nama: x.nama, baris: x.baris }; });

  var perubahan = null;
  if (patokanLama && patokanLama.nama) {
    var beres = [], baruMuncul = [], bergeser = [];
    Object.keys(patokanLama.nama).forEach(function(k){
      var lamaX = patokanLama.nama[k];
      var kiniX = sekarang[k];
      if (!kiniX) { if (lamaX.baris > 0) beres.push({ nama: lamaX.nama, baris: lamaX.baris }); return; }
      if (kiniX.baris === lamaX.baris) return;
      if (kiniX.baris === 0 && lamaX.baris > 0) { beres.push({ nama: lamaX.nama, baris: lamaX.baris }); return; }
      bergeser.push({ nama: kiniX.nama, dari: lamaX.baris, ke: kiniX.baris });
    });
    Object.keys(sekarang).forEach(function(k){
      if (patokanLama.nama[k]) return;
      if (!sekarang[k].baris) return;
      baruMuncul.push({ nama: sekarang[k].nama, baris: sekarang[k].baris });
    });
    var urutBaris = function(a, b){ return (b.baris || 0) - (a.baris || 0); };
    perubahan = {
      waktu: patokanLama.waktu || '',
      beres: beres.sort(urutBaris),
      baru: baruMuncul.sort(urutBaris),
      bergeser: bergeser.sort(function(a, b){ return Math.abs(b.ke - b.dari) - Math.abs(a.ke - a.dari); }),
      adaPerubahan: !!(beres.length || baruMuncul.length || bergeser.length)
    };
  }
  if (simpanPatokan) {
    try {
      setSetting('periksaKantorPatokan', JSON.stringify({ waktu: new Date().toISOString(), nama: sekarang }));
    } catch (e) { /* patokan itu kenyamanan, bukan data lembaga: gagal pun jalan terus */ }
  }

  return {
    total: daftar.length,
    terdaftar: daftar.length - bermasalah.length,
    bermasalah: bermasalah.length,
    adaUsul: bermasalah.filter(function(x){ return x.usul; }).length,
    daftar: daftar,
    dirapikan: dirapikan,
    mirip: mirip,
    kembar: kembar,
    perubahan: perubahan,
    /* Semua nama yang dikenal, untuk formulir gabung manual di Pengaturan:
       ada kasus yang tidak boleh ditebak mesin sama sekali, mis. sebuah ULL
       yang memang harus dilebur ke KLL induknya. */
    semuaNama: semua.map(function(x){ return { nama: x.nama, baris: x.baris, terdaftar: x.terdaftar }; })
      .sort(function(a, b){ return a.nama.localeCompare(b.nama, 'id'); })
  };
}

/* Gabungkan satu nama kantor ke nama lain: baris datanya ditulis ulang,
   bukan sekadar disamakan saat menampilkan. Selalu bisa dipratinjau dulu. */
/* Baris-baris yang berada di bawah sebuah nama kantor.
   SATU pencocokan dipakai dua tempat: layar rincian dan penggabungan. Kalau
   keduanya memakai aturan sendiri-sendiri, orang memeriksa satu daftar lalu
   menggabungkan daftar yang lain — dan selisihnya baru ketahuan berbulan-bulan
   kemudian, waktu angkanya sudah dipakai membagi hak kantor layanan. */
function _barisKantor(dari, layList, layMap){
  layList = layList || (readAll(SHEETS.LAYANAN) || []);
  if (!layMap) { layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; }); }
  /* Cocokkan DUA-DUANYA: nama hasil olahan (yang tampil di rekap) dan nama
     mentah yang tersimpan di baris. Kalau hanya yang tampil, ejaan salah yang
     kebetulan sudah tertutup pencocokan mirip tetap mengendap di data dan
     akan muncul lagi begitu master Layanan berubah. */
  var d = _norm(dari);
  var samaDari = function(olah, mentah){
    if (_norm(olah) === d) return true;
    var m = String(mentah || '').trim();
    if (!m) return false;
    if (_norm(m) === d) return true;
    /* nama mentah sering berupa kalimat ("... Oleh Kll Banguntapaan Utara") */
    var pre = _layFromPrefix(m, layList);
    return !!pre && _norm(pre.tipe + ' ' + pre.nama) === d;
  };

  var kena = { himpun: [], ump: [], lpj: [] };
  (readAll(SHEETS.PENGHIMPUNAN) || []).forEach(function(r){
    if (!samaDari(resolveLayananName(r, layList, layMap), r.namaDonatur)) return;
    kena.himpun.push({ id:r.id, tanggal:String(r.tanggal||'').slice(0,10), nama:r.namaDonatur || '',
      jumlah:Number(r.jumlah)||0, bukti:r.noKwitansi || '', dana:r.jenisDana || '',
      rinci:r.subJenis || '', program:r.program || '', keterangan:r.keterangan || '',
      fundraising:r.fundraising || '', metode:r.metode || '', taut:!!r.layananId });
  });
  (readAll(SHEETS.UANGMUKA) || []).forEach(function(r){
    if (!samaDari(_layananUmp(r.layanan, layList), r.layanan)) return;
    kena.ump.push({ id:r.id, tanggal:String(r.tanggal||'').slice(0,10), nama:r.layanan || '',
      jumlah:Number(r.nominal)||0, bukti:'', dana:r.dana || '', rinci:r.jenis || '',
      program:'', keterangan:r.keterangan || '', fundraising:'', metode:r.kasNama || '' });
  });
  (readAll(SHEETS.PENTASYARUFAN) || []).forEach(function(r){
    if (!/^UMP\s+LPJ/i.test(String(r.section || ''))) return;
    if (!samaDari(_layananUmp(r.namaPenerima, layList), r.namaPenerima)) return;
    kena.lpj.push({ id:r.id, tanggal:String(r.tanggal||'').slice(0,10), nama:r.namaPenerima || '',
      jumlah:Number(r.jumlah)||0, bukti:r.noBukti || '', dana:r.sumberDana || '',
      rinci:r.ashnaf || '', program:r.program || '', keterangan:r.keterangan || '',
      fundraising:r.fundraising || '', metode:r.metode || '' });
  });
  return kena;
}

/* Rincian baris di balik sebuah nama kantor, untuk dilihat sebelum memutuskan.
   Angka saja tidak cukup: yang menentukan sebuah uang muka sebenarnya milik
   kantor mana adalah keterangannya ("ULL Masjid Aceh Uang Muka Program
   Infak"), bukan jumlahnya. */
function apiRincianLayananNama(t, nama, batas){
  _requirePerm(t, 'settings', 'view');
  nama = String(nama || '').trim();
  if (!nama) throw new Error('Nama kantor belum dipilih.');
  batas = Math.max(1, Math.min(Number(batas) || 60, 300));

  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; });
  var kena = _barisKantor(nama, layList, layMap);

  var susun = function(arr, sumber){
    return arr.map(function(x){ x.sumber = sumber; return x; });
  };
  var semua = susun(kena.himpun, 'himpun')
    .concat(susun(kena.ump, 'ump'), susun(kena.lpj, 'lpj'))
    .sort(function(a, b){ return String(a.tanggal).localeCompare(String(b.tanggal)); });

  var jumlahkan = function(arr){ return arr.reduce(function(a, b){ return a + b.jumlah; }, 0); };
  return {
    nama: nama,
    terdaftar: layList.some(function(l){ return l && l.nama && _norm(_layLabel(l)) === _norm(nama); }),
    jumlah: { himpun: kena.himpun.length, ump: kena.ump.length, lpj: kena.lpj.length },
    nominal: { himpun: jumlahkan(kena.himpun), ump: jumlahkan(kena.ump), lpj: jumlahkan(kena.lpj) },
    baris: semua.slice(0, batas),
    terpotong: Math.max(0, semua.length - batas),
    /* Nama-nama mentah yang benar-benar tertulis di baris itu, beserta berapa
       kali. Inilah yang paling menolong menebak asalnya: kalau semua barisnya
       tertulis "ULL Masjid Aceh ...", kantornya hampir pasti yang beraceh. */
    ejaanMentah: (function(){
      var e = {};
      semua.forEach(function(x){ var k = String(x.nama || '').trim(); if (k) e[k] = (e[k] || 0) + 1; });
      return Object.keys(e).map(function(k){ return { nama: k, n: e[k] }; })
        .sort(function(a, b){ return b.n - a.n; });
    })()
  };
}

function apiGabungLayanan(t, dari, ke, terapkan){
  var u = _requirePerm(t, 'settings', 'edit');
  dari = String(dari || '').trim(); ke = String(ke || '').trim();
  if (!dari || !ke) throw new Error('Nama asal dan nama tujuan harus diisi.');
  if (_norm(dari) === _norm(ke)) throw new Error('Nama asal dan tujuan sama.');

  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ layMap[l.id] = l; });
  var tujuanLay = layList.filter(function(l){ return _norm(_layLabel(l)) === _norm(ke); })[0] || null;
  var kena = _barisKantor(dari, layList, layMap);

  var jml = kena.himpun.length + kena.ump.length + kena.lpj.length;
  var out = {
    diterapkan: !!terapkan, dari: dari, ke: ke, jumlah: jml,
    rincian: { himpun: kena.himpun.length, ump: kena.ump.length, lpj: kena.lpj.length },
    nominal: {
      himpun: kena.himpun.reduce(function(a,b){ return a + b.jumlah; }, 0),
      ump: kena.ump.reduce(function(a,b){ return a + b.jumlah; }, 0),
      lpj: kena.lpj.reduce(function(a,b){ return a + b.jumlah; }, 0)
    },
    contoh: kena.himpun.concat(kena.ump, kena.lpj).slice(0, 12)
  };
  if (!terapkan || !jml) return out;

  /* Penghimpunan: kalau kantor tujuan ada di master, tautkan lewat id — itu
     penanda paling kuat dan tidak bisa rusak lagi oleh salah ketik. */
  kena.himpun.forEach(function(x){
    var patch = {};
    if (tujuanLay) patch.layananId = tujuanLay.id;
    var r = findById(SHEETS.PENGHIMPUNAN, x.id);
    if (r && /^(KLL|ULL|KL)\b/i.test(String(r.namaDonatur || ''))) patch.namaDonatur = ke;
    if (Object.keys(patch).length) updateRowById(SHEETS.PENGHIMPUNAN, x.id, patch);
  });
  kena.ump.forEach(function(x){ updateRowById(SHEETS.UANGMUKA, x.id, { layanan: ke }); });
  kena.lpj.forEach(function(x){ updateRowById(SHEETS.PENTASYARUFAN, x.id, { namaPenerima: ke }); });

  audit(u.id, u.username, 'gabung_layanan', dari + ' -> ' + ke,
    { modul:'settings', ringkas: jml + ' baris (' + out.rincian.himpun + ' setoran, ' + out.rincian.ump + ' uang muka, ' + out.rincian.lpj + ' LPJ)' });
  out.terubah = jml;
  return out;
}

/* ================================================================
   PERAWATAN 2 — TRANSAKSI KEMBAR
   ================================================================
   Impor yang dijalankan dua kali, atau berkas yang memuat bulan yang
   sama dua kali, meninggalkan baris kembar persis. Yang dicocokkan
   adalah isi yang menentukan uangnya: tanggal, nominal, nama, akun,
   dan keterangan. Baris pertama dipertahankan, salinannya dibuang. */
function _sidikDobel(sheet, r){
  var b = function(x){ return _norm(x); };
  if (sheet === SHEETS.PENGHIMPUNAN) {
    return [String(r.tanggal||'').slice(0,10), Math.round(Number(r.jumlah)||0), b(r.namaDonatur),
            b(r.jenisDana) + '/' + b(r.subJenis) + '/' + b(r.pilar), b(r.rekeningId), b(r.keterangan)].join('|');
  }
  if (sheet === SHEETS.PENTASYARUFAN) {
    return [String(r.tanggal||'').slice(0,10), Math.round(Number(r.jumlah)||0), b(r.namaPenerima),
            b(r.program), b(r.sumberDana), b(r.section), b(r.rekeningId), b(r.keterangan)].join('|');
  }
  if (sheet === SHEETS.UANGMUKA) {
    return [String(r.tanggal||'').slice(0,10), Math.round(Number(r.nominal)||0), b(r.jenis),
            b(r.layanan), b(r.dana), b(r.akun), b(r.keterangan)].join('|');
  }
  return [String(r.tanggal||'').slice(0,10), Math.round(Number(r.nominal)||0), b(r.jenis),
          b(r.dariAkun) + '>' + b(r.keAkun), b(r.keterangan)].join('|');
}

async function apiPeriksaDobel(t, terapkan){
  var u = _requirePerm(t, 'settings', terapkan ? 'delete' : 'view');
  var target = [
    { sheet: SHEETS.PENGHIMPUNAN, label: 'Penghimpunan', nilai: 'jumlah', nama: 'namaDonatur' },
    { sheet: SHEETS.PENTASYARUFAN, label: 'Pentasyarufan', nilai: 'jumlah', nama: 'namaPenerima' },
    { sheet: SHEETS.UANGMUKA, label: 'Uang muka', nilai: 'nominal', nama: 'layanan' },
    { sheet: SHEETS.TRANSFER, label: 'Transfer', nilai: 'nominal', nama: 'keterangan' }
  ];
  var hasil = [], contoh = [], totalBaris = 0, totalNominal = 0, bulan = {};

  target.forEach(function(tg){
    var rows = readAll(tg.sheet) || [];
    var lihat = {}, buang = [];
    rows.forEach(function(r){
      var k = _sidikDobel(tg.sheet, r);
      if (lihat[k]) buang.push(r); else lihat[k] = r;
    });
    var nom = buang.reduce(function(a, b){ return a + (Number(b[tg.nilai]) || 0); }, 0);
    hasil.push({ tabel: tg.label, jumlah: buang.length, nominal: nom });
    totalBaris += buang.length; totalNominal += nom;
    buang.slice(0, 6).forEach(function(r){
      contoh.push({ tabel: tg.label, tanggal: String(r.tanggal||'').slice(0,10),
        nama: String(r[tg.nama] || '-'), jumlah: Number(r[tg.nilai]) || 0,
        keterangan: String(r.keterangan || '').slice(0, 60) });
    });
    if (terapkan) buang.forEach(function(r){
      var m = getMonthFromDate(r.tanggal); if (m) bulan[m] = true;
      deleteRowById(tg.sheet, r.id);
    });
  });

  var out = { diterapkan: !!terapkan, jumlah: totalBaris, nominal: totalNominal, perTabel: hasil, contoh: contoh };
  if (terapkan && totalBaris) {
    audit(u.id, u.username, 'hapus_dobel', totalBaris + ' baris kembar dihapus',
      { modul:'settings', ringkas: hasil.filter(function(x){ return x.jumlah; }).map(function(x){ return x.tabel + ' ' + x.jumlah; }).join(', ') });
    var keys = Object.keys(bulan);
    for (var i = 0; i < keys.length; i++) await syncMonthlySpreadsheet(keys[i]);
    out.terhapus = totalBaris;
  }
  return out;
}

/* ================================================================
   PERAWATAN 3 — MULAI DARI NOL UNTUK DATA TRANSAKSI
   ================================================================
   Kadang menambal satu per satu lebih mahal daripada mengulang impor
   dari berkas jurnal yang memang sudah rapi. Yang dihapus HANYA data
   transaksi; pengguna, rekening, kantor layanan, pengaturan, hak amil
   dan saldo awal tetap utuh supaya impor ulang langsung jatuh ke
   tempat yang benar. Hanya superadmin, harus mengetik konfirmasi,
   dan salinan keadaan sebelumnya dikembalikan bersama hasilnya. */
function apiResetTransaksi(t, konfirmasi, ikutDonatur){
  var u = authUser(t);
  if (u.role !== 'superadmin') throw new Error('IZIN: hanya superadmin yang boleh mengosongkan data transaksi.');
  if (String(konfirmasi) !== 'KOSONGKAN') throw new Error('Ketik KOSONGKAN untuk mengonfirmasi.');

  var sasaran = [SHEETS.PENGHIMPUNAN, SHEETS.PENTASYARUFAN, SHEETS.UANGMUKA, SHEETS.TRANSFER, SHEETS.MUTASI];
  if (ikutDonatur) sasaran.push(SHEETS.DONATUR);

  var sebelum = buatCadangan(u.username + ' (sebelum kosongkan)');
  var dihapus = {};
  sasaran.forEach(function(nm){
    var rows = (DB.sheets && DB.sheets[nm]) || [];
    dihapus[nm] = Math.max(0, rows.length - 1);
    if (rows.length) DB.sheets[nm] = [rows[0].slice()];   /* baris judul dipertahankan */
  });
  /* berkas Excel bulanan hasil sinkronisasi ikut dibuang supaya tidak
     menampilkan angka lama yang sudah tidak punya datanya */
  Object.keys((DB && DB.props) || {}).forEach(function(k){
    if (/^sheetBulan|^xlsxBulan|^_excel/.test(k)) delete DB.props[k];
  });

  var total = Object.keys(dihapus).reduce(function(a, k){ return a + dihapus[k]; }, 0);
  audit(u.id, u.username, 'kosongkan_transaksi', total + ' baris transaksi dihapus',
    { modul:'settings', ringkas: Object.keys(dihapus).map(function(k){ return k + ' ' + dihapus[k]; }).join(', ') });
  return { ok:true, total: total, dihapus: dihapus, dipertahankan: [SHEETS.USERS, SHEETS.REKENING, SHEETS.LAYANAN, SHEETS.SETTINGS, SHEETS.SALDOAWAL].concat(ikutDonatur ? [] : [SHEETS.DONATUR]), cadangan: sebelum };
}

function apiPerbaikiDataLama(t, terapkan){
  var u = _requirePerm(t, 'settings', 'edit');
  var rows = readAll(SHEETS.PENGHIMPUNAN) || [];
  var layMap = {}; (readAll(SHEETS.LAYANAN) || []).forEach(function(l){ if (l && l.id) layMap[l.id] = l; });

  var pilarUbah = [], layananLepas = [];

  rows.forEach(function(r){
    var perubahan = {};

    // 1. pilar
    if (String(r.subJenis || '').toLowerCase().indexOf('terikat') >= 0) {
      var dasar = String(r.program || '').trim() || String(r.keterangan || '').trim();
      var baru = detectPilarTegas(dasar);
      if (baru && baru !== String(r.pilar || '').trim()) {
        perubahan.pilar = baru;
        pilarUbah.push({
          id: r.id, tanggal: r.tanggal, donatur: r.namaDonatur,
          program: r.program || '', dari: r.pilar || '(kosong)', jadi: baru,
          jumlah: Number(r.jumlah) || 0
        });
      }
    }

    // 2. layananId yang tidak punya dasar
    if (r.layananId && !_pdAdaPenandaLayanan(r)) {
      perubahan.layananId = '';
      layananLepas.push({
        id: r.id, tanggal: r.tanggal, donatur: r.namaDonatur,
        dari: layMap[r.layananId] ? _layLabel(layMap[r.layananId]) : r.layananId,
        jadi: LAYANAN_DAERAH, jumlah: Number(r.jumlah) || 0
      });
    }

    if (terapkan && Object.keys(perubahan).length) updateRowById(SHEETS.PENGHIMPUNAN, r.id, perubahan);
  });

  var total = pilarUbah.length + layananLepas.length;
  if (terapkan && total) {
    audit(u.id, u.username, 'perbaikan_data_lama', total + ' baris disesuaikan', {
      modul: 'settings',
      ringkas: pilarUbah.length + ' pilar dibetulkan, ' + layananLepas.length + ' tautan layanan dilepas'
    });
  }

  return {
    diterapkan: !!terapkan,
    totalDiperiksa: rows.length,
    totalBerubah: total,
    pilarUbah: pilarUbah.slice(0, 300),
    pilarUbahTotal: pilarUbah.length,
    layananLepas: layananLepas.slice(0, 300),
    layananLepasTotal: layananLepas.length
  };
}

/* ================================================================
   LOG AKTIVITAS
   ----------------------------------------------------------------
   Mencatat siapa masuk, siapa membuka apa, dan siapa yang menambah,
   mengubah, atau menghapus data — lengkap dengan ringkasan kolom mana
   yang berubah. Basis datanya satu kunci Redis yang ditulis utuh tiap
   permintaan, jadi jumlah barisnya dibatasi agar tidak membengkak.
   ================================================================ */
var LOG_MAKS_BAWAAN = 1500;
var _LOG_CTX = { ip: '', ua: '' };

function auditKonteks(ctx){ _LOG_CTX = { ip: (ctx && ctx.ip) || '', ua: (ctx && ctx.ua) || '' }; }

function _logMaks(){
  var n = parseInt(getSetting('logMaks') || '', 10);
  return (isFinite(n) && n >= 200 && n <= 20000) ? n : LOG_MAKS_BAWAAN;
}

/* Buang catatan terlama bila sudah melewati batas. */
function _logPangkas(){
  try{
    var sh = getSS().getSheetByName(SHEETS.LOG);
    if (!sh) return;
    var batas = _logMaks();
    var jml = sh.getLastRow() - 1;
    if (jml <= batas + 100) return;
    var buang = jml - batas;
    for (var i = 0; i < buang; i++) sh.deleteRow(2);   // baris 1 = header
  }catch(e){}
}

/* Ringkas perubahan antar dua baris: kolom mana yang berubah, dari apa ke apa. */
function ringkasPerubahan(lama, baru){
  if (!lama) return '';
  var lewati = { id:1, dibuat:1, petugas:1, passwordHash:1, salt:1 };
  var out = [];
  Object.keys(baru || {}).forEach(function(k){
    if (lewati[k]) return;
    var a = String(lama[k] == null ? '' : lama[k]).trim();
    var b = String(baru[k] == null ? '' : baru[k]).trim();
    if (a === b || (!a && !b)) return;
    var pot = function(x){ return x.length > 60 ? x.slice(0, 57) + '…' : (x || '(kosong)'); };
    out.push(k + ': ' + pot(a) + ' → ' + pot(b));
  });
  return out.join(' | ').slice(0, 700);
}

/* Modul yang dianggap "membuka halaman". Dicatat paling sering sekali
   tiap beberapa menit per pengguna supaya log tidak dibanjiri. */
var _LOG_AKSES = {
  apiDashboard:'dashboard', apiListPenghimpunan:'penghimpunan', apiListPentasyarufan:'pentasyarufan',
  apiListDonatur:'donatur', apiJurnalData:'laporan', apiBroadcastReport:'laporan',
  apiListUsers:'users', apiListRekening:'rekening', apiListLayanan:'layanan',
  apiGetSettings:'settings', apiListMutasi:'mutasi', apiListAudit:'log',
  apiSaldo:'saldo', apiSaldoLayanan:'saldokll',
  apiGetRAPBData:'laporan', apiGetDonaturAnalytics:'donatur'
};
var _LOG_AKSES_JEDA = 5 * 60 * 1000;

function _catatAkses(fn, token){
  var modul = _LOG_AKSES[fn];
  if (!modul || !token) return;
  var u = null;
  try { u = authUser(token); } catch(e) { return; }
  try{
    var props = (DB && DB.props) || {};
    var peta = {};
    try { peta = JSON.parse(props._aksesTerakhir || '{}') || {}; } catch(e) { peta = {}; }
    var kunci = u.id + '|' + modul;
    var kini = Date.now();
    if (peta[kunci] && (kini - peta[kunci]) < _LOG_AKSES_JEDA) return;
    peta[kunci] = kini;
    /* jaga peta tetap kecil */
    var kunciSemua = Object.keys(peta);
    if (kunciSemua.length > 400) {
      kunciSemua.sort(function(a,b){ return peta[a] - peta[b]; });
      kunciSemua.slice(0, kunciSemua.length - 300).forEach(function(k){ delete peta[k]; });
    }
    props._aksesTerakhir = JSON.stringify(peta);
    if (DB) DB.props = props;
    audit(u.id, u.username, 'buka_' + modul, '', { modul: modul });
  }catch(e){}
}

function apiListAudit(t, opsi){
  _requirePerm(t, 'log', 'view');
  opsi = opsi || {};
  var rows = (readAll(SHEETS.LOG) || []).slice();
  rows.reverse();   // terbaru dulu

  var q = String(opsi.cari || '').toLowerCase().trim();
  var user = String(opsi.username || '').trim();
  var jenis = String(opsi.jenis || '').trim();   // 'akses' | 'ubah' | ''
  var dari = String(opsi.dari || '').trim();
  var sampai = String(opsi.sampai || '').trim();

  var hasil = rows.filter(function(r){
    var aksi = String(r.aksi || '');
    if (user && String(r.username || '') !== user) return false;
    if (jenis === 'akses' && aksi.indexOf('buka_') !== 0 && aksi !== 'login' && aksi !== 'logout' && aksi !== 'login_gagal') return false;
    if (jenis === 'ubah' && !/^(create|edit|delete|import|save|perbaikan)/.test(aksi)) return false;
    var tgl = String(r.waktu || '').slice(0, 10);
    if (dari && tgl < dari) return false;
    if (sampai && tgl > sampai) return false;
    if (q) {
      var blob = [r.username, r.aksi, r.modul, r.entitasId, r.ringkas, r.detail, r.ip].join(' ').toLowerCase();
      if (blob.indexOf(q) < 0) return false;
    }
    return true;
  });

  var batas = Math.min(Math.max(parseInt(opsi.batas, 10) || 200, 20), 1000);
  var daftarUser = {};
  rows.forEach(function(r){ if (r.username) daftarUser[r.username] = true; });

  return {
    total: hasil.length,
    tersimpan: rows.length,
    batasSimpan: _logMaks(),
    users: Object.keys(daftarUser).sort(),
    rows: hasil.slice(0, batas)
  };
}

/* Hanya superadmin. Dulu pemegang izin "hapus log" bisa menghapus seluruh
   jejak, termasuk jejak perbuatannya sendiri sesaat sebelumnya. Log yang bisa
   dihapus orang yang diawasinya bukan pengawasan. */
function apiHapusAudit(t){
  var u = authUser(t);
  if (u.role !== 'superadmin') throw new Error('IZIN: hanya superadmin yang boleh membersihkan log aktivitas.');
  var sh = getSS().getSheetByName(SHEETS.LOG);
  var jml = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
  if (sh) { for (var i = 0; i < jml; i++) sh.deleteRow(2); }
  audit(u.id, u.username, 'hapus_log', jml + ' catatan dihapus', { modul: 'log' });
  return { ok: true, dihapus: jml };
}

/* ================================================================
   LAPORAN HARIAN
   ----------------------------------------------------------------
   Rekap satu tanggal: seluruh penerimaan dan penyaluran hari itu
   beserta ringkasannya, siap dicetak sebagai lembar pertanggung-
   jawaban harian.
   ================================================================ */
function _lhTanggalSama(nilai, tgl){
  return String(nilai || '').split('T')[0] === tgl;
}

function _lhJumlah(peta, kunci, n){
  var k = String(kunci || '').trim() || 'Lainnya';
  peta[k] = (peta[k] || 0) + n;
}

/* ===== CLOSING BULANAN =====
   Rekap satu bulan bergaya "REKAP LAZISMU SE BANTUL":
     - SE BANTUL   : seluruh transaksi (daerah + KLL/ULL)
     - LAZISMU DAERAH : hanya transaksi tingkat daerah (tanpa penanda KLL/ULL)
     - KLL/ULL     : selisih SE BANTUL - DAERAH
   Plus rincian sumber/fundraising (penghimpunan daerah per fundraiser) dan
   rincian satu fundraiser dipecah per peruntukan/pilar (mis. "Detail Kantor").

   Penghimpunan dikelompokkan: Zakat, Infak Terikat, Infak Umum, Amil, dan
   Bagi Hasil (zakat/infak terikat/infak/amil). Penyaluran: Zakat, Infak
   Terikat, Infak Umum, Amil. Terikat/umum penyaluran dibaca dari seksi/
   keterangan (sinyal yang tersedia di jurnal). */
function _closingKatH(r){
  var jl = _norm(r.jenisDana), sl = _norm(r.subJenis), ak = _norm(r.akunKredit);
  var bh = sl.indexOf('bagi hasil') >= 0;
  if (jl.indexOf('zakat') >= 0) return bh ? 'bhZakat' : 'zakat';
  if (jl.indexOf('amil')  >= 0) return bh ? 'bhAmil'  : 'amil';
  if (jl.indexOf('infa') >= 0 || jl.indexOf('sedekah') >= 0){
    if (bh) return (ak.indexOf('terikat') >= 0) ? 'bhInfakTerikat' : 'bhInfak';
    var terikat = sl.indexOf('terikat') >= 0 || (!!String(r.pilar||'').trim() && sl.indexOf('umum') < 0);
    return terikat ? 'infakTerikat' : 'infakUmum';
  }
  return 'lain';
}
function _closingKatT(r){
  var sd = _norm(r.sumberDana), sec = _norm(r.section), prog = _norm(r.program), ket = _norm(r.keterangan);
  if (sd.indexOf('zakat') >= 0) return 'zakat';
  if (sd.indexOf('amil')  >= 0) return 'amil';
  if (sd.indexOf('infa') >= 0 || sd.indexOf('sedekah') >= 0){
    var terikat = sec.indexOf('terikat') >= 0 || prog.indexOf('terikat') >= 0 || ket.indexOf('terikat') >= 0;
    return terikat ? 'infakTerikat' : 'infakUmum';
  }
  return 'lain';
}

function apiClosingBulanan(t, bulan){
  _requirePerm(t, 'laporan', 'view');
  var prefix = /^\d{4}-\d{2}$/.test(String(bulan || '')) ? String(bulan) : null;
  if (!prefix) throw new Error('Pilih bulan yang valid (YYYY-MM).');

  var inBulan = function(r){ return r.tanggal && String(r.tanggal).slice(0,7) === prefix; };
  var H = (readAll(SHEETS.PENGHIMPUNAN) || []).filter(inBulan);
  var T = (readAll(SHEETS.PENTASYARUFAN) || []).filter(inBulan);
  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ if (l && l.id) layMap[l.id] = l; });

  function isDaerah(r){ return resolveLayananName(r, layList, layMap) === LAYANAN_DAERAH; }

  function kosongH(){ return { zakat:0, infakTerikat:0, infakUmum:0, amil:0, bhZakat:0, bhInfakTerikat:0, bhInfak:0, bhAmil:0, lain:0, total:0 }; }
  function kosongT(){ return { zakat:0, infakTerikat:0, infakUmum:0, amil:0, lain:0, total:0 }; }

  var seBantul = { penghimpunan: kosongH(), penyaluran: kosongT() };
  var daerah   = { penghimpunan: kosongH(), penyaluran: kosongT() };

  /* Bagi hasil bank adalah pendapatan lembaga (kas/bank), BUKAN penghimpunan
     tingkat daerah dari fundraiser. Karena itu bagi hasil dihitung di SE BANTUL
     tetapi TIDAK dimasukkan ke blok DAERAH — sesuai rekap manual. */
  function _isBagiHasil(r){ return /bagi hasil/i.test(String(r.subJenis || '')); }
  /* Bagi hasil dari rekening BDW (Bank BDW / BDW Umum / BDW Kebencanaan) tidak
     dihitung di rekap, sesuai patokan rekap manual. */
  function _bagiHasilBDW(r){
    if (!_isBagiHasil(r)) return false;
    var blob = _norm((r.bank || '') + ' ' + (r.namaDonatur || '') + ' ' + (r.akunKredit || ''));
    return /\bbdw\b/.test(blob);
  }

  H.forEach(function(r){
    if (_bagiHasilBDW(r)) return;          // dikecualikan dari rekap
    if (_isSetorTunaiHimpun(r)) return;    // setor tunai bukan penghimpunan
    var k = _closingKatH(r), n = Number(r.jumlah) || 0;
    seBantul.penghimpunan[k] += n; seBantul.penghimpunan.total += n;
    if (isDaerah(r) && !_isBagiHasil(r)){ daerah.penghimpunan[k] += n; daerah.penghimpunan.total += n; }
  });
  /* Penyaluran closing = penyaluran AKTUAL: LPJ (per program) + penyaluran
     langsung daerah + operasional amil. TIDAK termasuk:
       - UMP advance (uang muka; sudah dilewati saat impor, tetapi disaring
         lagi di sini agar data lama pun aman),
       - Biaya Administrasi Bank (biaya bank, bukan distribusi ke mustahik). */
  function _skipPenyaluranClosing(r){
    var sec = String(r.section || '').toUpperCase();
    if (/^UMP\s+(ZAKAT|INFAK|AMIL)$/.test(sec)) return true;
    if (sec === 'BIAYA ADMINISTRASI BANK') return true;
    if (/administrasi bank/i.test(r.program || '')) return true;
    return false;
  }

  /* Penyaluran hasil impor jurnal (punya kolom section) milik kantor hanya
     kalau tercatat atas nama kantor (namaPenerima "KLL ..."/"ULL ...").
     Dulu keterangan ikut dibaca, sehingga "Gaji Amil Kll Pundong" yang
     dibayar Daerah dari rekening Amil terhitung penyaluran KLL Pundong,
     padahal rekap pemilik mencatatnya pengeluaran Daerah (September 2026,
     5 baris, Rp 8.020.000). Data lama tanpa section tetap memakai cara lama. */
  function salurDaerah(r){
    if (String(r.section || '').trim()) return !/^(KLL|ULL|KL|UL)\b/i.test(String(r.namaPenerima || '').trim());
    return isDaerah(r);
  }
  T.forEach(function(r){
    if (_skipPenyaluranClosing(r)) return;
    var k = _closingKatT(r), n = Number(r.jumlah) || 0;
    seBantul.penyaluran[k] += n; seBantul.penyaluran.total += n;
    if (salurDaerah(r)){ daerah.penyaluran[k] += n; daerah.penyaluran.total += n; }
  });

  // KLL/ULL = SE BANTUL - DAERAH
  function selisih(a, b){ var o = {}; Object.keys(a).forEach(function(k){ o[k] = a[k] - b[k]; }); return o; }
  var kll = {
    penghimpunan: selisih(seBantul.penghimpunan, daerah.penghimpunan),
    penyaluran: selisih(seBantul.penyaluran, daerah.penyaluran)
  };

  // Detail Sumber/Fundraising: penghimpunan DAERAH per nama fundraising (mentah).
  // Bagi hasil dikecualikan agar JUMLAH-nya = total penghimpunan daerah.
  var frPeta = {};
  H.forEach(function(r){
    if (!isDaerah(r) || _isBagiHasil(r)) return;
    var nama = String(r.fundraising || '').trim() || 'Lainnya';
    frPeta[nama] = (frPeta[nama] || 0) + (Number(r.jumlah) || 0);
  });
  var detailFundraising = Object.keys(frPeta).map(function(k){ return { nama: k, jumlah: frPeta[k] }; })
    .sort(function(a, b){ return b.jumlah - a.jumlah; });
  var totalFundraising = detailFundraising.reduce(function(a, b){ return a + b.jumlah; }, 0);

  // Rincian per fundraiser (default 'Kantor') dipecah per peruntukan/pilar.
  var pilihanKantor = '';
  detailFundraising.forEach(function(f){ if (!pilihanKantor && /kantor/i.test(f.nama)) pilihanKantor = f.nama; });
  function rincianFundraiser(namaFr){
    if (!namaFr) return { fundraiser: '', rincian: [], total: 0 };
    var peta = {};
    H.forEach(function(r){
      if (!isDaerah(r) || _isBagiHasil(r)) return;
      if (_norm(r.fundraising) !== _norm(namaFr)) return;
      var per = String(r.pilar || '').trim() || String(r.program || '').trim() || String(r.subJenis || r.jenisDana || 'Lainnya').trim();
      peta[per] = (peta[per] || 0) + (Number(r.jumlah) || 0);
    });
    var rincian = Object.keys(peta).map(function(k){ return { peruntukan: k, jumlah: peta[k] }; })
      .sort(function(a, b){ return b.jumlah - a.jumlah; });
    return { fundraiser: namaFr, rincian: rincian, total: rincian.reduce(function(a, b){ return a + b.jumlah; }, 0) };
  }

  return {
    bulan: prefix,
    periode: (BULAN[Number(prefix.split('-')[1])] || '') + ' ' + prefix.split('-')[0],
    seBantul: seBantul,
    daerah: daerah,
    kll: kll,
    detailFundraising: detailFundraising,
    totalFundraising: totalFundraising,
    daftarFundraiser: detailFundraising.map(function(f){ return f.nama; }),
    detailKantor: rincianFundraiser(pilihanKantor),
    jumlahTransaksi: { himpun: H.length, salur: T.length },
    settings: getAllSettings()
  };
}

/* Rincian satu fundraiser tertentu (untuk mengganti "Detail Kantor" di layar). */
function apiClosingRincianFundraiser(t, bulan, namaFr){
  var full = apiClosingBulanan(t, bulan);
  var prefix = full.bulan;
  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ if (l && l.id) layMap[l.id] = l; });
  var H = (readAll(SHEETS.PENGHIMPUNAN) || []).filter(function(r){ return r.tanggal && String(r.tanggal).slice(0,7) === prefix; });
  var peta = {};
  H.forEach(function(r){
    if (resolveLayananName(r, layList, layMap) !== LAYANAN_DAERAH) return;
    if (/bagi hasil/i.test(String(r.subJenis || ''))) return;
    if (_norm(r.fundraising) !== _norm(namaFr)) return;
    var per = String(r.pilar || '').trim() || String(r.program || '').trim() || String(r.subJenis || r.jenisDana || 'Lainnya').trim();
    peta[per] = (peta[per] || 0) + (Number(r.jumlah) || 0);
  });
  var rincian = Object.keys(peta).map(function(k){ return { peruntukan: k, jumlah: peta[k] }; })
    .sort(function(a, b){ return b.jumlah - a.jumlah; });
  return { fundraiser: namaFr, rincian: rincian, total: rincian.reduce(function(a, b){ return a + b.jumlah; }, 0) };
}

function apiLaporanHarian(t, tanggal){
  _requirePerm(t, 'laporan', 'view');
  var tgl = String(tanggal || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw new Error('Tanggal tidak valid.');

  var layList = readAll(SHEETS.LAYANAN) || [];
  var layMap = {}; layList.forEach(function(l){ if (l && l.id) layMap[l.id] = l; });
  var listRek = readAll(SHEETS.REKENING) || [];
  var rekMap = {}; listRek.forEach(function(r){ if (r && r.id) rekMap[r.id] = r; });

  function namaRek(r){
    if (r.rekeningId && rekMap[r.rekeningId]) {
      var k = rekMap[r.rekeningId];
      return k.namaBank + ' - ' + k.nomor;
    }
    return String(r.bank || '').trim();
  }

  var himpun = (readAll(SHEETS.PENGHIMPUNAN) || [])
    .filter(function(r){ return _lhTanggalSama(r.tanggal, tgl); })
    .map(function(r){
      /* Transaksi KLL/ULL dicatat atas nama layanannya, bukan petugas
         fundraising — aturan yang sama dipakai di rekap dan impor.
         cleanFundraisingName() akan memaksa nama di luar daftar petugas
         menjadi "Lazismu Daerah Bantul", jadi jangan dipakai di sini. */
      var _lay = resolveLayananName(r, layList, layMap);
      var _fr = (_lay !== LAYANAN_DAERAH) ? _lay : cleanFundraisingName(r.fundraising);
      return {
        noKwitansi: r.noKwitansi || '-',
        namaDonatur: r.namaDonatur || '-',
        layanan: _lay,
        jenisDana: r.jenisDana || '-',
        subJenis: r.subJenis || '',
        pilar: r.pilar || '',
        program: r.program || '',
        metode: r.metode || '-',
        bank: namaRek(r),
        fundraising: _fr,
        petugas: r.petugas || '-',
        keterangan: r.keterangan || '',
        jumlah: Number(r.jumlah) || 0
      };
    })
    .sort(function(a,b){ return String(a.noKwitansi).localeCompare(String(b.noKwitansi)); });

  var salur = (readAll(SHEETS.PENTASYARUFAN) || [])
    .filter(function(r){ return _lhTanggalSama(r.tanggal, tgl); })
    .map(function(r){
      return {
        noBukti: r.noBukti || '-',
        namaPenerima: r.namaPenerima || '-',
        ashnaf: r.ashnaf || '-',
        program: r.program || '-',
        sumberDana: r.sumberDana || '-',
        bentukBantuan: r.bentukBantuan || '',
        metode: r.metode || '-',
        bank: namaRek(r),
        petugas: r.petugas || '-',
        keterangan: r.keterangan || '',
        jumlah: Number(r.jumlah) || 0
      };
    })
    .sort(function(a,b){ return String(a.noBukti).localeCompare(String(b.noBukti)); });

  var rk = {
    himpunTotal: 0, salurTotal: 0,
    perJenis: {}, perMetode: {}, perLayanan: {}, perFundraising: {},
    perAshnaf: {}, perProgram: {}, perSumber: {},
    petugasHimpun: {}, petugasSalur: {}
  };

  himpun.forEach(function(r){
    rk.himpunTotal += r.jumlah;
    var labelJenis = r.jenisDana + (r.subJenis && r.subJenis !== r.jenisDana ? ' — ' + r.subJenis : '');
    _lhJumlah(rk.perJenis, labelJenis, r.jumlah);
    _lhJumlah(rk.perMetode, r.metode, r.jumlah);
    _lhJumlah(rk.perLayanan, r.layanan, r.jumlah);
    _lhJumlah(rk.perFundraising, r.fundraising, r.jumlah);
    _lhJumlah(rk.petugasHimpun, r.petugas, r.jumlah);
  });
  salur.forEach(function(r){
    rk.salurTotal += r.jumlah;
    _lhJumlah(rk.perAshnaf, r.ashnaf, r.jumlah);
    _lhJumlah(rk.perProgram, r.program, r.jumlah);
    _lhJumlah(rk.perSumber, r.sumberDana, r.jumlah);
    _lhJumlah(rk.petugasSalur, r.petugas, r.jumlah);
  });

  return {
    tanggal: tgl,
    himpun: himpun,
    salur: salur,
    ringkas: {
      himpunTotal: rk.himpunTotal, himpunCount: himpun.length,
      salurTotal: rk.salurTotal, salurCount: salur.length,
      selisih: rk.himpunTotal - rk.salurTotal,
      perJenis: rk.perJenis, perMetode: rk.perMetode, perLayanan: rk.perLayanan,
      perFundraising: rk.perFundraising, perAshnaf: rk.perAshnaf,
      perProgram: rk.perProgram, perSumber: rk.perSumber,
      petugasHimpun: rk.petugasHimpun, petugasSalur: rk.petugasSalur
    },
    settings: getAllSettings()
  };
}

var REGISTRY={};
REGISTRY['apiListMutasi']=apiListMutasi;
REGISTRY['apiSaveMutasiRows']=apiSaveMutasiRows;
REGISTRY['apiImportMutasiToRecords']=apiImportMutasiToRecords;
REGISTRY['apiListDonatur']=apiListDonatur;
REGISTRY['apiImportDonaturText']=apiImportDonaturText;
REGISTRY['apiSinkronDonatur']=apiSinkronDonatur;
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
/* ===== API PUBLIC KWITANSI VERIFICATION ===== */
/* Samarkan nama donatur pada hasil verifikasi publik.
   Nomor kwitansi berurutan dan halaman ini terbuka untuk siapa saja, jadi nama
   utuh akan mudah dipanen. Pemegang kwitansi tetap bisa mengenali namanya. */
function _samarkanNama(nama){
  return String(nama||'').split(/\s+/).filter(Boolean).map(function(k,i){
    if (i === 0 || k.length <= 2) return k;
    return k.charAt(0) + '•'.repeat(Math.max(k.length - 1, 1));
  }).join(' ') || '-';
}

/* Nomor kwitansi berurutan (KW/202609/0001, 0002, ...), jadi siapa pun bisa
   menyisir semuanya. Dulu setiap nomor mengembalikan NOMINAL donasi. Sekarang
   nominal dan metode hanya dikirim kalau kode acak dari QR kwitansi (10 huruf
   pertama id-nya) ikut cocok, atau kalau yang dimasukkan id-nya sendiri.
   Kwitansi lama yang QR-nya belum membawa kode tetap bisa dicek keabsahannya,
   hanya tanpa nominal. */
function apiVerifyKwitansi(noKwitansi, kode){
  if(!noKwitansi) return { valid:false, msg:'Nomor kwitansi tidak boleh kosong' };
  var rows = readAll(SHEETS.PENGHIMPUNAN);
  var kw = String(noKwitansi).trim().toUpperCase();
  var lewatId = false;
  var found = rows.find(function(r){
    if (String(r.noKwitansi || '').trim().toUpperCase() === kw) return true;
    if (String(r.id || '').trim().toUpperCase() === kw) { lewatId = true; return true; }
    return false;
  });
  if(!found) return { valid:false, msg:'Nomor Kwitansi "' + noKwitansi + '" tidak ditemukan di database' };
  var kodeAsli = String(found.id || '').slice(0, 10).toLowerCase();
  var lengkap = lewatId || (kodeAsli.length === 10 && String(kode || '').trim().toLowerCase() === kodeAsli);
  
  var settings = getAllSettings();
  var hasil = {
    valid: true,
    lengkap: lengkap,
    data: {
      noKwitansi: found.noKwitansi,
      tanggal: found.tanggal,
      jenisDana: found.jenisDana,
      subJenis: found.subJenis,
      pilar: found.pilar,
      namaDonatur: _samarkanNama(found.namaDonatur),
      jumlah: found.jumlah,
      metode: found.metode,
      statusBayar: found.statusBayar || 'Lunas'
    },
    lembaga: settings.namaLembaga || 'Lazismu Bantul'
  };
  if (!lengkap) { delete hasil.data.jumlah; delete hasil.data.metode; }
  return hasil;
}

/* ===== API RAPB TARGET & REALISASI ===== */
function apiGetRAPBData(t, year){
  if(t) _requirePerm(t, 'dashboard', 'view');
  year = Number(year) || new Date().getFullYear();
  
  var allHimpun = readAll(SHEETS.PENGHIMPUNAN);
  var allTasyaruf = readAll(SHEETS.PENTASYARUFAN);
  
  // Default RAPB targets per pilar if not set
  var targetHimpun = { Zakat: 500000000, Infak: 350000000, Wakaf: 100000000, Kurban: 200000000, DSKL: 50000000 };
  var targetPilar = { Pendidikan: 250000000, Kesehatan: 200000000, 'Ekonomi & Pemberdayaan': 150000000, 'Dakwah & Advokasi': 200000000, 'Sosial Kemanusiaan': 200000000 };
  
  try {
    var customT = getSetting('rapb_target_' + year);
    if(customT) {
      var parsed = JSON.parse(customT);
      if(parsed.himpun) targetHimpun = parsed.himpun;
      if(parsed.pilar) targetPilar = parsed.pilar;
    }
  } catch(e){}

  var realisasiHimpun = { Zakat:0, Infak:0, Wakaf:0, Kurban:0, DSKL:0 };
  var realisasiPilar = { Pendidikan:0, Kesehatan:0, 'Ekonomi & Pemberdayaan':0, 'Dakwah & Advokasi':0, 'Sosial Kemanusiaan':0 };

  allHimpun.forEach(function(r){
    var d = new Date(r.tanggal || 0);
    if(d.getFullYear() === year){
      var j = r.jenisDana || 'Infak';
      var n = Number(r.jumlah) || 0;
      if(realisasiHimpun[j] !== undefined) realisasiHimpun[j] += n;
      else realisasiHimpun.Infak += n;
      
      var p = r.pilar || 'Sosial Kemanusiaan';
      if(realisasiPilar[p] !== undefined) realisasiPilar[p] += n;
    }
  });

  return {
    year: year,
    targetHimpun: targetHimpun,
    realisasiHimpun: realisasiHimpun,
    targetPilar: targetPilar,
    realisasiPilar: realisasiPilar
  };
}

function apiSaveRAPBTarget(t, year, data){
  _requirePerm(t, 'settings', 'edit');
  year = Number(year) || new Date().getFullYear();
  setSetting('rapb_target_' + year, JSON.stringify(data));
  return { ok: true };
}

/* ===== API DONATUR CRM 360° ANALYTICS ===== */
function apiGetDonaturAnalytics(t){
  _requirePerm(t, 'penghimpunan', 'view');
  var donaturs = readAll(SHEETS.DONATUR);
  var himpuns = readAll(SHEETS.PENGHIMPUNAN);
  
  var statsMap = {};
  himpuns.forEach(function(h){
    var name = String(h.namaDonatur || '').trim();
    if(!name || name.toLowerCase() === 'hamba allah') return;
    if(!statsMap[name]){
      statsMap[name] = { total: 0, count: 0, lastDate: '', phone: h.telepon || '', email: h.email || '' };
    }
    statsMap[name].total += Number(h.jumlah) || 0;
    statsMap[name].count += 1;
    var dStr = String(h.tanggal || '');
    if(dStr > statsMap[name].lastDate) statsMap[name].lastDate = dStr;
  });

  var now = new Date();
  var result = donaturs.map(function(d){
    var name = String(d.nama || '').trim();
    var st = statsMap[name] || { total: 0, count: 0, lastDate: d.dibuat || '', phone: d.telepon || '', email: d.email || '' };
    
    var lastD = st.lastDate ? new Date(st.lastDate) : new Date(0);
    var diffDays = Math.floor((now - lastD) / (1000 * 3600 * 24));
    
    var status = 'Aktif';
    if(st.count === 0) status = 'Baru';
    else if(diffDays > 180) status = 'Dormant';
    else if(diffDays > 90) status = 'Pasif';
    
    var isVip = st.total >= 5000000;
    var isRutin = st.count >= 3;

    return {
      id: d.id,
      nama: d.nama,
      kategori: d.kategori || 'Perorangan',
      telepon: d.telepon || st.phone,
      email: d.email || st.email,
      totalDonasi: st.total,
      jumlahTransaksi: st.count,
      terakhirDonasi: st.lastDate,
      hariSebabDonasi: diffDays,
      status: status,
      isVip: isVip,
      isRutin: isRutin
    };
  });

  return result;
}

REGISTRY['setup']=setup;
REGISTRY['loginIngat']=loginIngat;
REGISTRY['apiVerifyKwitansi']=apiVerifyKwitansi;
REGISTRY['apiGetRAPBData']=apiGetRAPBData;
REGISTRY['apiSaveRAPBTarget']=apiSaveRAPBTarget;
REGISTRY['apiGetDonaturAnalytics']=apiGetDonaturAnalytics;
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
REGISTRY['apiSaldo']=apiSaldo;
REGISTRY['apiMutasiAkun']=apiMutasiAkun;
REGISTRY['apiSaldoLayanan']=apiSaldoLayanan;
REGISTRY['apiDetailSaldoLayanan']=apiDetailSaldoLayanan;
REGISTRY['apiHakAmil']=apiHakAmil;
REGISTRY['apiSaveHakAmil']=apiSaveHakAmil;
REGISTRY['apiListSaldoAwal']=apiListSaldoAwal;
REGISTRY['apiSaveSaldoAwal']=apiSaveSaldoAwal;
REGISTRY['apiListUangMuka']=apiListUangMuka;
REGISTRY['apiListTransfer']=apiListTransfer;
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
REGISTRY['apiListFundraising']=apiListFundraising;
REGISTRY['apiSaveFundraising']=apiSaveFundraising;
REGISTRY['apiDeleteFundraising']=apiDeleteFundraising;
REGISTRY['apiPemakaianFundraising']=apiPemakaianFundraising;
REGISTRY['apiChangeMyPassword']=apiChangeMyPassword;
REGISTRY['apiMe']=apiMe;
REGISTRY['apiGetPermissionMeta']=apiGetPermissionMeta;
REGISTRY['apiPublicDashboard']=apiPublicDashboard;
REGISTRY['apiInfoLinkHarian']=apiInfoLinkHarian;
REGISTRY['apiBuatLinkHarian']=apiBuatLinkHarian;
REGISTRY['apiMatikanLinkHarian']=apiMatikanLinkHarian;
REGISTRY['apiPenghimpunanHarian']=apiPenghimpunanHarian;
REGISTRY['apiParseImportUrl']=apiParseImportUrl;
REGISTRY['apiParseImportText']=apiParseImportText;
REGISTRY['apiSimpanAliasKantor']=apiSimpanAliasKantor;
REGISTRY['apiDaftarAliasKantor']=apiDaftarAliasKantor;
REGISTRY['apiHapusAliasKantor']=apiHapusAliasKantor;
REGISTRY['apiSamakanRekap']=apiSamakanRekap;
REGISTRY['apiPerbaikiDataLama']=apiPerbaikiDataLama;
REGISTRY['apiBersihkanSetorTunai']=apiBersihkanSetorTunai;
REGISTRY['apiPeriksaLayanan']=apiPeriksaLayanan;
REGISTRY['apiRincianLayananNama']=apiRincianLayananNama;
REGISTRY['apiGabungLayanan']=apiGabungLayanan;
REGISTRY['apiPeriksaDobel']=apiPeriksaDobel;
REGISTRY['apiResetTransaksi']=apiResetTransaksi;
REGISTRY['apiRincianDaerah']=apiRincianDaerah;
REGISTRY['apiCadanganDB']=apiCadanganDB;
REGISTRY['apiCekIzin']=apiCekIzin;
REGISTRY['apiStatusCadangan']=apiStatusCadangan;
REGISTRY['apiPulihkanDB']=apiPulihkanDB;
REGISTRY['apiHapusRentang']=apiHapusRentang;
REGISTRY['apiListAudit']=apiListAudit;
REGISTRY['apiLaporanHarian']=apiLaporanHarian;
REGISTRY['apiClosingBulanan']=apiClosingBulanan;
REGISTRY['apiClosingRincianFundraiser']=apiClosingRincianFundraiser;
REGISTRY['apiHapusAudit']=apiHapusAudit;
REGISTRY['apiSaveImportedData']=apiSaveImportedData;
async function runRPC(db, fn, args, ctx){
  DB = db || {sheets:{},props:{}};
  if(!DB.sheets) DB.sheets={}; if(!DB.props) DB.props={};
  auditKonteks(ctx);
  setup(); // Always run setup to keep table schemas and defaults up to date
  if(!REGISTRY[fn]) throw new Error('Fungsi tidak dikenal: '+fn);
  var result = await REGISTRY[fn].apply(null, args||[]);
  /* Catat "siapa membuka apa" setelah fungsinya berhasil, supaya panggilan
     yang gagal izin tidak ikut tercatat sebagai kunjungan. */
  try{ _catatAkses(fn, (args && args[0]) || ''); }catch(e){}
  return { result: result, db: DB };
}
/* buatCadangan & catatStatusCadangan dipakai api/backup.js di luar sesi
   pengguna. Keduanya bekerja pada DB yang sedang dimuat lewat runRPC. */
module.exports = { runRPC, _setLambat, buatCadangan: function(db, oleh){ DB = db; return buatCadangan(oleh); },
  catatStatusCadangan: function(db, st){ DB = db; catatStatusCadangan(st); return db; },
  catatAkses: function(db, fn, token, ctx){ DB = db || {sheets:{},props:{}}; if(!DB.sheets)DB.sheets={}; if(!DB.props)DB.props={}; try{auditKonteks(ctx||{});}catch(e){} setup(); _catatAkses(fn, token); return db; },
  cekIzin: function(db, token, modul, aksi, ctx){ DB = db || {sheets:{},props:{}}; if(!DB.sheets)DB.sheets={}; if(!DB.props)DB.props={}; try{auditKonteks(ctx||{});}catch(e){} setup(); return sanitizeUser(_requirePerm(token, modul, aksi)); } };