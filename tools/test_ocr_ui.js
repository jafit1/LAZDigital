/* Auto-isi formulir penghimpunan dari hasil baca kwitansi.

   Server uji menjalankan api/ocr.js yang sesungguhnya; hanya panggilan keluar
   ke penyedia AI yang ditiru (OCR_PALSU=1), jadi izin, batas ukuran, dan
   pembersihan nilai tetap dilewati sungguhan. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const PORT=8231, DBF='db-kll2-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC','base64');

(async()=>{
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,
   {PORT:String(PORT),DBFILE:DBF,SETUP_ADMIN_PASSWORD:'uji12345',OCR_PALSU:'1'}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const A='http://localhost:'+PORT;

 /* mengatur jawaban AI tiruan untuk permintaan berikutnya */
 const aturAI=(o)=>fetch(A+'/uji/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});

 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:1440,height:960}});
 const p=await ctx.newPage();
 const errs=[];
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource|manifest/i.test(m.text()))errs.push('console: '+m.text());});
 const jauh=()=>p.mouse.move(1350,900);

 await p.goto(A+'/index.html'); await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1500);
 await jauh();

 /* Merekam badan permintaan ke /api/ocr supaya bisa diperiksa isinya. */
 await p.evaluate(()=>{
   window.__ocrKirim=[];
   const asli=window.fetch;
   window.fetch=function(u,o){
     if(String(u).indexOf('/api/ocr')>=0 && o && o.body) window.__ocrKirim.push(String(o.body));
     return asli.apply(this,arguments);
   };
 });

 async function fotoBaru(){
   await p.evaluate(()=>{ if(document.getElementById('modalBg').classList.contains('show')) closeModal(); });
   await p.evaluate(()=>scanBuka());
   await p.waitForSelector('#scanBerkas',{state:'attached',timeout:8000});
   await p.setInputFiles('#scanBerkas',{name:'kwitansi.png',mimeType:'image/png',buffer:PNG});
 }
 const nilai=(id)=>p.evaluate(x=>{const n=document.getElementById(x);return n?n.value:null;},id);
 const kelasFld=(id)=>p.evaluate(x=>{const n=document.getElementById(x);const f=n&&n.closest('.fld');return f?f.className:null;},id);

 console.log('=== A. FITUR DIKENALI AKTIF ===');
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(2000); await jauh();
 const st=await p.evaluate(()=>fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({aksi:'status',token:TOKEN})}).then(r=>r.json()));
 cek('endpoint /api/ocr menjawab status', !!(st&&st.result), st);
 cek('fitur dilaporkan aktif', st.result.aktif===true, st.result);
 cek('kunci tidak ikut ke peramban', JSON.stringify(st).indexOf('kunci-uji-lokal')<0, st);

 console.log('\n=== B. ISI OTOMATIS SETELAH FOTO ===');
 await aturAI({status:200,isi:{
   tanggal:'12/01/2026', namaDonatur:'Ahmad Fauzi', tipeDonatur:'Perorangan',
   jumlah:'Rp 1.500.000,-', jenisDana:'Zakat', subJenis:'Zakat Mal',
   program:'Beasiswa Yatim', metode:'Tunai', telepon:'0812-3456-7890',
   alamat:'Jl. Bantul 10', keterangan:'lunas', raguRagu:['alamat']
 }});
 await fotoBaru();
 await p.waitForSelector('#spStatus.ok',{timeout:15000});

 /* Select & tanggal digantikan tombol buatan sendiri yang biasanya baru
    disegarkan penyegar berkala (800 ms). Diperiksa SEKETIKA di sini. */
 const segera=await p.evaluate(()=>{
   const bung=(id,kls)=>{const n=document.getElementById(id);const w=n&&n.previousSibling;
     const b=w&&w.querySelector?w.querySelector(kls):null;return b?b.textContent.trim():null;};
   return {sel:bung('f_jenisDana','.select-enhanced-btn'), sub:bung('f_subJenis','.select-enhanced-btn'),
     tgl:bung('f_tanggal','.datepicker-enhanced-btn')};
 });
 cek('label dropdown jenis dana ikut berubah seketika', segera.sel==='Zakat', segera);
 cek('label sub jenis ikut berubah seketika', segera.sub==='Zakat Mal', segera);
 cek('label tanggal ikut berubah seketika', /2026/.test(segera.tgl||''), segera);

 cek('tanggal terisi dari kwitansi', await nilai('f_tanggal')==='2026-01-12', await nilai('f_tanggal'));
 cek('nama donatur terisi', await nilai('f_namaDonatur')==='Ahmad Fauzi', await nilai('f_namaDonatur'));
 cek('jenis dana terpilih', await nilai('f_jenisDana')==='Zakat', await nilai('f_jenisDana'));
 cek('sub jenis ikut terpilih sesuai jenisnya', await nilai('f_subJenis')==='Zakat Mal', await nilai('f_subJenis'));
 cek('metode "Tunai" jadi Cash/Tunai', await nilai('f_metode')==='Cash/Tunai', await nilai('f_metode'));
 cek('tipe donatur terpilih', await nilai('f_tipeDonatur')==='Perorangan', await nilai('f_tipeDonatur'));
 cek('program terisi', await nilai('f_program')==='Beasiswa Yatim', await nilai('f_program'));
 cek('telepon terisi bersih', await nilai('f_telepon')==='081234567890', await nilai('f_telepon'));
 cek('jumlah terisi dengan pemisah ribuan', await nilai('f_jumlah')==='1.500.000', await nilai('f_jumlah'));
 cek('terbilang ikut diperbarui',
   await p.evaluate(()=>/satu juta lima ratus ribu/i.test(document.getElementById('f_jumlah_words').textContent)),
   await p.evaluate(()=>document.getElementById('f_jumlah_words').textContent));

 console.log('\n=== C. PENANDAAN KOLOM ===');
 cek('kolom hasil AI ditandai', /terisi-ai/.test(await kelasFld('f_namaDonatur')), await kelasFld('f_namaDonatur'));
 cek('kolom yang AI ragu ditandai berbeda', /ragu-ai/.test(await kelasFld('f_alamat')), await kelasFld('f_alamat'));
 cek('kolom yang yakin tidak ikut ditandai ragu', !/ragu-ai/.test(await kelasFld('f_namaDonatur')), await kelasFld('f_namaDonatur'));
 const warna=await p.evaluate(()=>{
   const n=document.getElementById('f_namaDonatur');
   return {latar:getComputedStyle(n).backgroundColor, lencana:getComputedStyle(n.closest('.fld').querySelector('label'),'::after').content};
 });
 cek('kolomnya berwarna, bukan sekadar kelas', warna.latar!=='rgba(0, 0, 0, 0)' && warna.latar!=='rgb(255, 255, 255)', warna);
 cek('labelnya diberi lencana AI', /AI/.test(warna.lencana||''), warna.lencana);
 await p.waitForTimeout(1200);   /* beri kesempatan penyegar berkala jalan sekali */
 const warnaBtn=await p.evaluate(()=>{
   const bg=(id,kls)=>{const n=document.getElementById(id);const w=n&&n.previousSibling;
     const b=w&&w.querySelector?w.querySelector(kls):null;return b?getComputedStyle(b).backgroundColor:null;};
   return {sel:bg('f_jenisDana','.select-enhanced-btn'), tgl:bg('f_tanggal','.datepicker-enhanced-btn'),
     polos:bg('f_statusBayar','.select-enhanced-btn')};
 });
 cek('tombol dropdown hasil AI ikut berwarna', warnaBtn.sel && warnaBtn.sel!==warnaBtn.polos, warnaBtn);
 cek('tombol tanggal hasil AI ikut berwarna (gaya sebarisnya tertimpa)',
   warnaBtn.tgl && warnaBtn.tgl!==warnaBtn.polos, warnaBtn);
 cek('kolom yang tidak diisi AI tetap polos', !!warnaBtn.polos, warnaBtn);

 await p.fill('#f_namaDonatur','Ahmad Fauzi Rahman'); await p.waitForTimeout(400);
 cek('tanda hilang begitu petugas mengetik', !/terisi-ai/.test(await kelasFld('f_namaDonatur')), await kelasFld('f_namaDonatur'));
 cek('kolom lain tetap bertanda', /terisi-ai/.test(await kelasFld('f_program')), await kelasFld('f_program'));

 console.log('\n=== D. BARIS STATUS ===');
 const bar=await p.evaluate(()=>{
   const s=document.getElementById('spStatus');
   return {teks:s.textContent.trim(), kelas:s.className, adaUlang:!!s.querySelector('.sp-ulang'),
     diAtasGambar:s.getBoundingClientRect().bottom<=document.getElementById('spGambar').getBoundingClientRect().top+2};
 });
 cek('status menyebut jumlah isian terbaca', /\d+ isian terbaca/.test(bar.teks), bar.teks);
 cek('status mengingatkan untuk memeriksa', /periksa/i.test(bar.teks), bar.teks);
 cek('ada tombol baca ulang', bar.adaUlang, bar);
 cek('statusnya di atas foto, bukan menutupi', bar.diAtasGambar, bar);

 console.log('\n=== E. GAMBAR YANG DIKIRIM ===');
 const kirim=await p.evaluate(()=>window.__ocrKirim.filter(x=>x.indexOf('"baca"')>=0));
 cek('permintaan baca terkirim sekali', kirim.length===1, kirim.length);
 cek('gambarnya dikirim sebagai JPEG', kirim[0].indexOf('data:image/jpeg')>=0, kirim[0].slice(0,80));
 cek('PNG galeri dikecilkan jadi JPEG dulu', kirim[0].indexOf('data:image/png')<0);
 cek('daftar pilihan ikut dikirim', kirim[0].indexOf('Cash/Tunai')>=0 && kirim[0].indexOf('Zakat Mal')>=0);
 cek('badannya tetap wajar (< 3 MB)', kirim[0].length<3*1024*1024, Math.round(kirim[0].length/1024)+' KB');

 console.log('\n=== F. NILAI DI LUAR DAFTAR TIDAK DIPAKSAKAN ===');
 await p.evaluate(()=>scanLepas()); await p.waitForTimeout(300);
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1800);
 await aturAI({status:200,isi:{namaDonatur:'Budi', jenisDana:'Kripto', metode:'Barter', jumlah:250000}});
 await fotoBaru();
 await p.waitForSelector('#spStatus.ok',{timeout:15000});
 cek('jenis dana ngawur tidak masuk formulir', await nilai('f_jenisDana')!=='Kripto', await nilai('f_jenisDana'));
 cek('metode ngawur tidak masuk formulir', await nilai('f_metode')!=='Barter', await nilai('f_metode'));
 cek('yang sah tetap terisi', await nilai('f_namaDonatur')==='Budi' && await nilai('f_jumlah')==='250.000',
   {n:await nilai('f_namaDonatur'), j:await nilai('f_jumlah')});

 console.log('\n=== G. KETIKAN PETUGAS TIDAK DITIMPA ===');
 await p.evaluate(()=>scanLepas()); await p.waitForTimeout(300);
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1800);
 await aturAI({status:200,tunda:2500,isi:{namaDonatur:'Nama Dari AI', program:'Program AI', jumlah:99000}});
 await fotoBaru();
 await p.waitForSelector('#spStatus.baca',{timeout:8000});
 cek('status "membaca" muncul selama menunggu',
   await p.evaluate(()=>/Membaca/i.test(document.getElementById('spStatus').textContent)),
   await p.evaluate(()=>document.getElementById('spStatus').textContent));
 cek('ada penanda berputar', await p.evaluate(()=>!!document.querySelector('#spStatus .sp-putar')));
 await p.fill('#f_namaDonatur','Ditulis Petugas');
 await p.waitForSelector('#spStatus.ok',{timeout:15000});
 cek('nama yang sudah diketik petugas TIDAK ditimpa AI',
   await nilai('f_namaDonatur')==='Ditulis Petugas', await nilai('f_namaDonatur'));
 cek('kolom yang belum disentuh tetap diisi', await nilai('f_program')==='Program AI', await nilai('f_program'));
 cek('kolom yang dilindungi tidak ikut ditandai AI',
   !/terisi-ai/.test(await kelasFld('f_namaDonatur')), await kelasFld('f_namaDonatur'));

 console.log('\n=== H. BACA ULANG & KEGAGALAN ===');
 await aturAI({status:200,isi:{namaDonatur:'Hasil Baca Ulang'}});
 await p.click('#spStatus .sp-ulang');
 await p.waitForSelector('#spStatus.ok',{timeout:15000}); await p.waitForTimeout(300);
 cek('baca ulang menimpa hasil sebelumnya',
   await nilai('f_namaDonatur')==='Hasil Baca Ulang', await nilai('f_namaDonatur'));

 await aturAI({status:200,isi:{}});
 await p.click('#spStatus .sp-ulang');
 await p.waitForSelector('#spStatus.kosong',{timeout:15000});
 cek('kwitansi tak terbaca disampaikan halus, bukan galat merah',
   await p.evaluate(()=>/isi manual|tidak ada isian/i.test(document.getElementById('spStatus').textContent)),
   await p.evaluate(()=>document.getElementById('spStatus').textContent));
 cek('fotonya tetap dipertahankan untuk disalin manual', await p.evaluate(()=>!!SCAN.foto));

 await aturAI({status:429});
 await p.click('#spStatus .sp-ulang');
 await p.waitForSelector('#spStatus.gagal',{timeout:15000});
 cek('galat penyedia tampil di panel, tidak menghentikan formulir',
   await p.evaluate(()=>!!document.getElementById('f_namaDonatur')));
 cek('pesannya menyebut kuota', await p.evaluate(()=>/kuota/i.test(document.getElementById('spStatus').textContent)),
   await p.evaluate(()=>document.getElementById('spStatus').textContent));

 console.log('\n=== I. MELEPAS KWITANSI ===');
 /* 429 barusan mengistirahatkan seluruh rantai model — dilupakan dulu */
 await aturAI({lupakan:true, status:200, isi:{namaDonatur:'Terakhir', program:'Terakhir'}});
 await p.click('#spStatus .sp-ulang');
 await p.waitForSelector('#spStatus.ok',{timeout:15000});
 await p.evaluate(()=>scanLepas()); await p.waitForTimeout(400);
 cek('panel hilang', await p.evaluate(()=>!document.getElementById('himpunKerja').classList.contains('ada-scan')));
 cek('semua penanda AI ikut dibersihkan',
   await p.evaluate(()=>document.querySelectorAll('.fld.terisi-ai,.fld.ragu-ai').length===0),
   await p.evaluate(()=>document.querySelectorAll('.fld.terisi-ai').length));
 cek('isian yang sudah terlanjur masuk tetap ada (tidak ikut terhapus)',
   await nilai('f_program')==='Terakhir', await nilai('f_program'));

 console.log('\n=== J. KUOTA MODEL UTAMA HABIS ===');
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1800);
 await aturAI({lupakan:true, status:200, isi:{}, perModel:{
   'gemini-flash-latest':{status:429},
   'gemini-flash-lite-latest':{status:200, isi:{namaDonatur:'Lewat Cadangan', jumlah:125000}}
 }});
 await fotoBaru();
 await p.waitForSelector('#spStatus.ok',{timeout:20000});
 cek('formulir tetap terisi walau kuota model utama habis',
   await nilai('f_namaDonatur')==='Lewat Cadangan', await nilai('f_namaDonatur'));
 const cad=await p.evaluate(()=>document.getElementById('spStatus').textContent);
 cek('petugas diberi tahu yang dipakai model cadangan', /model cadangan/i.test(cad), cad);
 cek('nama model cadangannya disebut', /flash-lite/i.test(cad), cad);
 const stAda=await p.evaluate(()=>fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({aksi:'status',token:TOKEN})}).then(r=>r.json()));
 cek('status melaporkan model yang sedang istirahat',
   !!(stAda.result.istirahat||{})['gemini-flash-latest'], stAda.result);
 cek('rantai model dilaporkan ke peramban', (stAda.result.rantai||[]).length>=2, stAda.result);

 await aturAI({lupakan:true, status:200, isi:{namaDonatur:'Normal Lagi'}, perModel:{}});
 await p.evaluate(()=>scanLepas()); await p.waitForTimeout(300);
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1800);
 await fotoBaru();
 await p.waitForSelector('#spStatus.ok',{timeout:20000});
 cek('kembali normal: tidak lagi menyebut cadangan',
   !/model cadangan/i.test(await p.evaluate(()=>document.getElementById('spStatus').textContent)),
   await p.evaluate(()=>document.getElementById('spStatus').textContent));

 console.log('\n=== K. SEMUA MODEL HABIS ===');
 await aturAI({lupakan:true, status:429, isi:{}, perModel:{}});
 await p.click('#spStatus .sp-ulang');
 await p.waitForSelector('#spStatus.gagal',{timeout:20000});
 const habis=await p.evaluate(()=>document.getElementById('spStatus').textContent);
 cek('pesan menyebut semua model habis', /semua model/i.test(habis), habis);
 cek('pesan memberi tahu kapan kuota pulih', /pulih|WIB|Pasifik/i.test(habis), habis);
 cek('pesan menyarankan isi manual', /manual/i.test(habis), habis);
 cek('formulir tetap bisa dipakai manual', await p.evaluate(()=>!!document.getElementById('f_namaDonatur')));
 cek('foto tetap ada sebagai penuntun', await p.evaluate(()=>!!SCAN.foto));

 console.log('\n=== L. DI LAYAR HP ===');
 await aturAI({lupakan:true, status:200, isi:{}, perModel:{}});
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(700);
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1800);
 await aturAI({status:200,isi:{namaDonatur:'Uji HP', jumlah:50000}});
 await fotoBaru();
 await p.waitForSelector('#spStatus.ok',{timeout:15000});
 const hp=await p.evaluate(()=>{
   const s=document.getElementById('spStatus');
   const u=s.querySelector('.sp-ulang').getBoundingClientRect();
   return {muat:s.getBoundingClientRect().right<=window.innerWidth+1,
     tombolBesar:u.height>=30, luber:document.documentElement.scrollWidth>window.innerWidth+2};
 });
 cek('baris status muat di layar HP', hp.muat, hp);
 cek('tombol baca ulang cukup besar untuk jempol', hp.tombolBesar, hp);
 cek('halaman tidak melebar', hp.luber===false, hp);
 cek('isian tetap masuk di HP', await nilai('f_namaDonatur')==='Uji HP', await nilai('f_namaDonatur'));

 console.log('\n=== M. FOTO TETAP TIDAK IKUT TERSIMPAN ===');
 await p.setViewportSize({width:1440,height:960}); await p.waitForTimeout(500);
 const simpan=await p.evaluate(()=>{
   const asli=window.fetch; let badan=null;
   window.fetch=function(u,o){ if(String(u).indexOf('/api/rpc')>=0 && o&&o.body) badan=String(o.body); return asli.apply(this,arguments); };
   return new Promise(res=>{
     document.getElementById('f_jumlah').value='100.000';
     const fr=document.getElementById('f_fundraising'); if(fr) fr.value='Kantor';
     saveHimpun('');
     setTimeout(()=>{ window.fetch=asli; res({ada:badan?badan.indexOf('data:image')>=0:null, panjang:badan?badan.length:0}); },1800);
   });
 });
 cek('gambar kwitansi tidak ikut disimpan ke basis data', simpan.ada===false, simpan);
 cek('badan simpan tetap ramping (< 4 KB)', simpan.panjang<4096, simpan.panjang);

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_ocr_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
