/* Scan kwitansi + kesesuaian tampilan lintas platform.

   Kamera diuji dengan aliran video buatan Chromium (--use-fake-device-for-
   media-stream), jadi getUserMedia benar-benar dipanggil dan hasil potongannya
   sungguhan — bukan disulap. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const PORT=8219, DBF='db-kll2-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};

(async()=>{
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{PORT:String(PORT),DBFILE:DBF,SETUP_ADMIN_PASSWORD:'uji12345'}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
   args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const ctx=await b.newContext({viewport:{width:1440,height:960},permissions:['camera']});
 const p=await ctx.newPage();
 const errs=[];
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource|manifest/i.test(m.text()))errs.push('console: '+m.text());});
 const A='http://localhost:'+PORT, jauh=()=>p.mouse.move(1350,900);

 await p.goto(A+'/index.html'); await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1500);
 await jauh();

 console.log('=== A. PENGENALAN PLATFORM ===');
 const plat=await p.evaluate(()=>({kelas:document.documentElement.className, p:window.PLATFORM}));
 cek('platform terbaca sebagai desktop', /plat-desktop/.test(plat.kelas) && plat.p.jenis==='desktop', plat);
 cek('dikenali sebagai perangkat tetikus', /plat-tetikus/.test(plat.kelas), plat.kelas);
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(500);
 const platHp=await p.evaluate(()=>({kelas:document.documentElement.className, p:window.PLATFORM}));
 cek('mengecil ke lebar HP: kelasnya ikut berubah', /plat-hp/.test(platHp.kelas) && platHp.p.hp===true, platHp);
 cek('kelas desktop dilepas', !/plat-desktop/.test(platHp.kelas), platHp.kelas);
 await p.setViewportSize({width:820,height:1180}); await p.waitForTimeout(500);
 cek('lebar tablet dikenali sendiri',
   await p.evaluate(()=>window.PLATFORM.jenis==='tablet'),
   await p.evaluate(()=>window.PLATFORM.jenis));
 await p.setViewportSize({width:1440,height:960}); await p.waitForTimeout(600); await jauh();

 console.log('\n=== B. TOMBOL SCAN DI PENGHIMPUNAN ===');
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(2000); await jauh();
 const tbl=await p.evaluate(()=>{
   const b=[...document.querySelectorAll('.form-card-h button')].find(x=>/scan/i.test(x.textContent));
   return {ada:!!b, teks:b?b.textContent.trim():'', svg:b?b.querySelectorAll('svg').length:0,
     adaWadah:!!document.getElementById('himpunKerja'), adaPanel:!!document.getElementById('scanPanel'),
     panelTampil:document.getElementById('scanPanel')?getComputedStyle(document.getElementById('scanPanel')).display!=='none':null};
 });
 cek('tombol Scan Kwitansi ada di kepala form', tbl.ada, tbl);
 cek('tombolnya beringkon kamera', tbl.svg>=1, tbl);
 cek('panel penuntun disiapkan tapi belum tampil', tbl.adaPanel && tbl.panelTampil===false, tbl);

 console.log('\n=== C. KAMERA & BINGKAI ===');
 await p.evaluate(()=>scanBuka());
 await p.waitForSelector('#scanPanggung',{timeout:8000});
 await p.waitForFunction(()=>{const v=document.getElementById('scanVideo');return v&&v.videoWidth>0;},{timeout:15000});
 await p.waitForTimeout(600);
 const kam=await p.evaluate(()=>{
   const v=document.getElementById('scanVideo'), bing=document.getElementById('scanBingkai'),
         pang=document.getElementById('scanPanggung');
   const pr=pang.getBoundingClientRect(), br=bing.getBoundingClientRect();
   return {vw:v.videoWidth, vh:v.videoHeight, siap:pang.classList.contains('siap'),
     pesanTampil:getComputedStyle(document.getElementById('scanPesan')).display!=='none',
     rasio:Math.round((br.width/br.height)*100)/100,
     diDalam:br.left>=pr.left && br.right<=pr.right && br.top>=pr.top && br.bottom<=pr.bottom,
     sudut:bing.querySelectorAll('.sudut').length,
     adaJepret:!!document.getElementById('scanJepret'),
     adaUnggah:!!document.getElementById('scanBerkas'),
     adaBalik:!!document.getElementById('scanBalik')};
 });
 cek('kamera benar-benar menyala', kam.vw>0 && kam.siap===true, kam);
 cek('pesan "menyalakan kamera" hilang setelah siap', kam.pesanTampil===false, kam);
 cek('bingkai berbentuk kwitansi mendatar (±1.45)', Math.abs(kam.rasio-1.45)<=0.06, kam.rasio);
 cek('bingkainya utuh di dalam layar kamera', kam.diDalam, kam);
 cek('empat penanda sudut tergambar', kam.sudut===4, kam);
 cek('tombol jepret, ganti kamera, dan unggah tersedia',
   kam.adaJepret && kam.adaBalik && kam.adaUnggah, kam);

 /* bingkai bisa diputar tegak untuk kwitansi berdiri */
 await p.click('#scanTegak'); await p.waitForTimeout(400);
 const tegak=await p.evaluate(()=>{
   const br=document.getElementById('scanBingkai').getBoundingClientRect();
   return {rasio:Math.round((br.width/br.height)*100)/100,
     label:document.getElementById('scanTegak').textContent.trim()};
 });
 cek('bingkai bisa diubah jadi tegak', tegak.rasio<1, tegak);
 cek('labelnya ikut berubah jadi penawaran sebaliknya', /mendatar/i.test(tegak.label), tegak.label);
 await p.click('#scanTegak'); await p.waitForTimeout(400);

 console.log('\n=== D. JEPRET & POTONG SESUAI BINGKAI ===');
 const ukuran=await p.evaluate(()=>{
   const bing=document.getElementById('scanBingkai').getBoundingClientRect();
   return {rasioBingkai:bing.width/bing.height};
 });
 await p.click('#scanJepret'); await p.waitForTimeout(1200);
 const hasil=await p.evaluate(()=>new Promise(res=>{
   const im=document.getElementById('spImg');
   if(!im) return res({ada:false});
   const selesai=()=>res({ada:true, w:im.naturalWidth, h:im.naturalHeight,
     jpeg:im.src.indexOf('data:image/jpeg')===0, panjang:im.src.length,
     modalTutup:!document.getElementById('modalBg').classList.contains('show'),
     panelTampil:getComputedStyle(document.getElementById('scanPanel')).display!=='none',
     adaScan:document.getElementById('himpunKerja').classList.contains('ada-scan')});
   if(im.complete && im.naturalWidth) selesai(); else im.onload=selesai;
 }));
 cek('foto masuk ke panel penuntun', hasil.ada, hasil);
 cek('modal kamera tertutup sendiri', hasil.modalTutup, hasil);
 cek('panelnya muncul di samping formulir', hasil.panelTampil && hasil.adaScan, hasil);
 cek('hasilnya JPEG, bukan PNG mentah yang berat', hasil.jpeg, hasil.jpeg);
 cek('potongannya mengikuti bentuk bingkai',
   Math.abs((hasil.w/hasil.h)-ukuran.rasioBingkai)<=0.08, {foto:hasil.w/hasil.h, bingkai:ukuran.rasioBingkai});
 cek('sisi terpanjang dibatasi 1600px', Math.max(hasil.w,hasil.h)<=1600, hasil);
 cek('ukurannya wajar untuk peramban (< 900 KB)', hasil.panjang<900000, Math.round(hasil.panjang/1024)+' KB');

 console.log('\n=== E. PANEL PENUNTUN DI SAMPING FORMULIR ===');
 const panel=await p.evaluate(()=>{
   const k=document.getElementById('himpunKerja');
   const sp=document.getElementById('scanPanel'), host=document.getElementById('himpunFormHost');
   const kolom=getComputedStyle(k).gridTemplateColumns.split(' ').length;
   const sr=sp.getBoundingClientRect(), hr=host.getBoundingClientRect();
   return {kolom, sisiKiri:sr.left<hr.left, sejajar:Math.abs(sr.top-hr.top)<40,
     lengket:getComputedStyle(sp).position,
     alat:sp.querySelectorAll('.sp-alat .icon-btn').length,
     formTerlihat:!!document.getElementById('f_namaDonatur')};
 });
 cek('formulir tetap utuh di sampingnya', panel.formTerlihat, panel);
 cek('tersusun dua kolom', panel.kolom===2, panel);
 cek('foto di kiri, formulir di kanan', panel.sisiKiri && panel.sejajar, panel);
 cek('panelnya menempel saat formulir digulung', panel.lengket==='sticky', panel.lengket);
 cek('ada tombol zoom, putar, foto ulang, dan tutup', panel.alat===5, panel.alat);

 const z1=await p.evaluate(()=>getComputedStyle(document.getElementById('spImg')).transform);
 await p.evaluate(()=>scanZoom(1)); await p.waitForTimeout(300);
 const z2=await p.evaluate(()=>getComputedStyle(document.getElementById('spImg')).transform);
 cek('tombol perbesar mengubah tampilan', z1!==z2, {z1,z2});
 await p.evaluate(()=>scanPutar()); await p.waitForTimeout(300);
 cek('tombol putar bekerja', await p.evaluate(()=>SCAN.putar===90), await p.evaluate(()=>SCAN.putar));
 cek('memutar mengembalikan zoom ke awal', await p.evaluate(()=>SCAN.zoom===1));

 console.log('\n=== F. FOTO TIDAK IKUT TERSIMPAN ===');
 const kirim=await p.evaluate(()=>{
   const asli=window.fetch; let badan=null;
   window.fetch=function(u,o){ if(String(u).indexOf('/api/rpc')>=0 && o&&o.body) badan=String(o.body); return asli.apply(this,arguments); };
   return new Promise(res=>{
     document.getElementById('f_namaDonatur').value='Uji Scan';
     document.getElementById('f_jumlah').value='100.000';
     const fr=document.getElementById('f_fundraising'); if(fr) fr.value='Kantor';
     saveHimpun('');
     setTimeout(()=>{ window.fetch=asli; res({badan:badan?badan.slice(0,400):null,
       adaGambar: badan?badan.indexOf('data:image')>=0:null, panjang:badan?badan.length:0}); },1800);
   });
 });
 cek('permintaan simpan terkirim', kirim.badan!==null, kirim);
 cek('tidak ada data gambar ikut dikirim ke server', kirim.adaGambar===false, kirim);
 cek('badan permintaannya tetap ramping (< 4 KB)', kirim.panjang<4096, kirim.panjang);
 await p.waitForTimeout(2200);
 cek('kwitansi penuntun dilepas setelah tersimpan',
   await p.evaluate(()=>SCAN.foto===null), await p.evaluate(()=>SCAN.foto?'masih ada':'null'));

 console.log('\n=== G. UNGGAH BERKAS SEBAGAI GANTI KAMERA ===');
 await p.evaluate(()=>{ if(document.getElementById('modalBg').classList.contains('show')) closeModal(); });
 await p.waitForTimeout(500);
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1800);
 await p.evaluate(()=>scanBuka()); /* input berkasnya sengaja disembunyikan di balik label, jadi cukup tertaut */
 await p.waitForSelector('#scanBerkas',{state:'attached',timeout:8000});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC','base64');
 await p.setInputFiles('#scanBerkas',{name:'kwitansi.png',mimeType:'image/png',buffer:png});
 await p.waitForTimeout(1200);
 cek('foto dari berkas ikut masuk panel',
   await p.evaluate(()=>!!document.getElementById('spImg')), null);
 cek('modal ikut tertutup', await p.evaluate(()=>!document.getElementById('modalBg').classList.contains('show')));
 await p.evaluate(()=>scanLepas()); await p.waitForTimeout(400);
 cek('tombol tutup melepas panelnya',
   await p.evaluate(()=>!document.getElementById('himpunKerja').classList.contains('ada-scan')));

 console.log('\n=== H. DI LAYAR HP ===');
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(700);
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1800);
 await p.evaluate(()=>scanBuka());
 await p.waitForSelector('#scanPanggung',{timeout:8000}); await p.waitForTimeout(900);
 const hp=await p.evaluate(()=>{
   const m=document.getElementById('modalCard').getBoundingClientRect();
   const pang=document.getElementById('scanPanggung').getBoundingClientRect();
   const jep=document.getElementById('scanJepret').getBoundingClientRect();
   return {modalMuat:m.width<=window.innerWidth, panggungMuat:pang.width<=window.innerWidth,
     jepretBesar:jep.width>=52, luber:document.documentElement.scrollWidth>window.innerWidth+2,
     kameraBelakang:SCAN.kamera};
 });
 cek('modal kamera muat di layar HP', hp.modalMuat && hp.panggungMuat, hp);
 cek('tombol jepret cukup besar untuk jempol', hp.jepretBesar, hp);
 cek('halaman tidak melebar', hp.luber===false, hp);
 cek('di HP kamera belakang yang dipilih', hp.kameraBelakang==='environment', hp.kameraBelakang);
 await p.evaluate(()=>{ scanMatikan(); closeModal(); }); await p.waitForTimeout(500);

 /* panel penuntun harus menumpuk, bukan berdampingan, di layar sempit */
 await p.evaluate(()=>{ SCAN.foto='data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='; scanGambarPanel(); });
 await p.waitForTimeout(600);
 const hpPanel=await p.evaluate(()=>{
   const k=document.getElementById('himpunKerja');
   const sp=document.getElementById('scanPanel'), host=document.getElementById('himpunFormHost');
   return {kolom:getComputedStyle(k).gridTemplateColumns.split(' ').length,
     atasBawah:sp.getBoundingClientRect().bottom<=host.getBoundingClientRect().top+8,
     lengket:getComputedStyle(sp).position,
     luber:document.documentElement.scrollWidth>window.innerWidth+2};
 });
 cek('di HP panel menumpuk jadi satu kolom', hpPanel.kolom===1, hpPanel);
 cek('foto di atas, formulir di bawah', hpPanel.atasBawah, hpPanel);
 cek('tidak lagi menempel di HP (layarnya pendek)', hpPanel.lengket==='static', hpPanel.lengket);
 cek('tetap tidak melebar', hpPanel.luber===false, hpPanel);
 await p.evaluate(()=>scanLepas());
 await p.setViewportSize({width:1440,height:960});

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_scan_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
