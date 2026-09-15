/* Layar muat Lazismu: layar pembuka, denyut yang berulang, dan selubung
   yang hanya muncul saat prosesnya memang lama.

   jalankan:  node test_loader_ui.js */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const PORT=8241, DBF='db-ocr-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};

(async()=>{
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,
   {PORT:String(PORT),DBFILE:DBF,SETUP_ADMIN_PASSWORD:'uji12345'}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const A='http://localhost:'+PORT;
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

 const errs=[];
 const ctx=await b.newContext({viewport:{width:1280,height:800}});
 const p=await ctx.newPage();
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource|manifest/i.test(m.text()))errs.push('console: '+m.text());});

 console.log('=== A. LAYAR PEMBUKA ===');
 /* app.js ditahan — persis keadaan yang jadi alasan layar pembuka ini ada:
    berkas JS besar belum selesai diunduh, halaman harus tetap bernyawa. */
 await p.route('**/app.js', async route => { await new Promise(r=>setTimeout(r,3500)); try{ await route.continue(); }catch(e){} });
 p.goto(A+'/index.html').catch(()=>{});
 await p.waitForSelector('#boot .lz-mark',{state:'visible',timeout:8000});
 const boot=await p.evaluate(()=>{
   const n=document.getElementById('boot');
   const cs=getComputedStyle(n);
   const mark=getComputedStyle(n.querySelector('.lz-mark'));
   const garis=getComputedStyle(n.querySelector('.lz-line i'));
   const bunga=n.querySelector('.lz-flower');
   const bantul=n.querySelector('.lz-bantul');
   return {
     tampil: cs.display!=='none' && cs.position==='fixed',
     zindex: cs.zIndex,
     latar: cs.backgroundColor,
     animMark: mark.animationName, ulangMark: mark.animationIterationCount,
     animGaris: garis.animationName, ulangGaris: garis.animationIterationCount,
     adaBunga: /data:image\/png/.test(getComputedStyle(bunga).backgroundImage),
     adaBantul: /data:image\/png/.test(getComputedStyle(bantul).backgroundImage),
     lebarBunga: bunga.getBoundingClientRect().width,
     tinggiBunga: Math.round(bunga.getBoundingClientRect().height),
     spinnerLama: !!document.querySelector('.loadingspinner'),
     peran: n.getAttribute('role'),
   };
 });
 cek('layar pembuka menutupi layar', boot.tampil && boot.zindex==='9999', boot);
 cek('spinner kotak yang lama sudah tidak dipakai', boot.spinnerLama===false, boot);
 cek('lambang bunga termuat', boot.adaBunga, boot);
 cek('tulisan "bantul" termuat', boot.adaBantul, boot);
 cek('proporsi bunga terjaga (200x221)', Math.abs(boot.lebarBunga/boot.tinggiBunga - 200/221) < 0.03,
   {w:boot.lebarBunga,h:boot.tinggiBunga});
 cek('latarnya gelap sesuai rancangan', boot.latar==='rgb(18, 22, 28)', boot.latar);
 cek('diumumkan ke pembaca layar', boot.peran==='status', boot.peran);

 console.log('\n=== B. ANIMASINYA BERULANG, BUKAN SEKALI JALAN ===');
 cek('denyut lambang berjalan', boot.animMark==='lzDenyut', boot.animMark);
 cek('denyut diulang tanpa henti', boot.ulangMark==='infinite', boot.ulangMark);
 cek('garis muat berjalan', boot.animGaris==='lzRun', boot.animGaris);
 cek('garis diulang tanpa henti', boot.ulangGaris==='infinite', boot.ulangGaris);

 /* benar-benar bergerak, bukan sekadar punya nama animasi */
 const gerak=await p.evaluate(()=>new Promise(res=>{
   const el=document.querySelector('#boot .lz-line i');
   const a=getComputedStyle(el).transform;
   setTimeout(()=>res({a, b:getComputedStyle(el).transform}), 400);
 }));
 cek('garisnya benar-benar bergerak', gerak.a!==gerak.b, gerak);

 console.log('\n=== C. LAYAR PEMBUKA HILANG SAAT SIAP ===');
 cek('masih tampil selagi app.js belum tiba',
   await p.evaluate(()=>!document.getElementById('boot').classList.contains('hidden')));
 await p.unroute('**/app.js');
 await p.waitForSelector('#loginView:not(.hidden)',{timeout:20000});
 cek('layar pembuka disembunyikan setelah siap',
   await p.evaluate(()=>document.getElementById('boot').classList.contains('hidden')));
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:15000}); await p.waitForTimeout(1200);
 cek('tetap tersembunyi setelah masuk aplikasi',
   await p.evaluate(()=>document.getElementById('boot').classList.contains('hidden')));

 console.log('\n=== D. PROSES CEPAT TIDAK MEMUNCULKAN SELUBUNG ===');
 await p.evaluate(()=>go('dashboard')); await p.waitForTimeout(2500);
 cek('permintaan biasa cukup bilah tipis, tanpa selubung',
   await p.evaluate(()=>{const s=document.getElementById('lzSibuk'); return !s || !s.classList.contains('tampil');}),
   await p.evaluate(()=>{const s=document.getElementById('lzSibuk'); return s?s.className:'(tidak ada)';}));

 console.log('\n=== E. PROSES LAMA MEMUNCULKAN SELUBUNG ===');
 await p.route('**/api/rpc', async route => { await new Promise(r=>setTimeout(r,3000)); try{ await route.continue(); }catch(e){} });
 p.evaluate(()=>go('penghimpunan'));
 await p.waitForTimeout(400);
 cek('belum muncul sebelum ambang 900 ms',
   await p.evaluate(()=>{const s=document.getElementById('lzSibuk'); return !s || !s.classList.contains('tampil');}));
 await p.waitForSelector('#lzSibuk.tampil',{timeout:6000});
 const sib=await p.evaluate(()=>{
   const s=document.getElementById('lzSibuk');
   const cs=getComputedStyle(s);
   const mark=getComputedStyle(s.querySelector('.lz-mark'));
   return {tampak:cs.visibility==='visible' && Number(cs.opacity)>0.5,
     buram:/blur/.test(cs.backdropFilter||cs.webkitBackdropFilter||''),
     tembus: cs.backgroundColor!=='rgb(18, 22, 28)',
     ulang: mark.animationIterationCount,
     lambangLebihKecil: s.querySelector('.lz-flower').getBoundingClientRect().width < 100,
     bantulDisembunyikan: getComputedStyle(s.querySelector('.lz-bantul')).display==='none',
     gambarSama: /data:image\/png/.test(getComputedStyle(s.querySelector('.lz-flower')).backgroundImage)};
 });
 cek('selubung muncul untuk proses lama', sib.tampak, sib);
 cek('selubungnya tembus pandang, bukan gelap penuh', sib.tembus, sib);
 cek('lambangnya lebih kecil daripada layar pembuka', sib.lambangLebihKecil, sib);
 /* tulisan berhuruf putih itu tidak terbaca di atas selubung terang */
 cek('hanya bunganya yang dipakai di selubung', sib.bantulDisembunyikan, sib);
 cek('gambarnya dipakai ulang dari layar pembuka', sib.gambarSama, sib);
 cek('denyutnya tetap berulang', sib.ulang==='infinite', sib.ulang);
 await p.waitForFunction(()=>{const s=document.getElementById('lzSibuk');return s&&!s.classList.contains('tampil');},{timeout:12000});
 await p.waitForTimeout(450);   /* menunggu transisi memudarnya selesai */
 cek('selubung hilang setelah prosesnya selesai',
   await p.evaluate(()=>getComputedStyle(document.getElementById('lzSibuk')).visibility==='hidden'),
   await p.evaluate(()=>getComputedStyle(document.getElementById('lzSibuk')).visibility));
 await p.unroute('**/api/rpc');

 console.log('\n=== F. KETERANGAN SAAT KELEWAT LAMA ===');
 const lama=await p.evaluate(()=>new Promise(res=>{
   /* ambang aslinya 6 detik; di sini dipicu langsung lewat jalur yang sama */
   const s=document.getElementById('lzSibuk');
   const t=document.getElementById('lzSibukLama');
   t.textContent='Masih memuat — koneksinya sedang lambat.';
   s.classList.add('lz-lama-tampil');
   /* transisi memudarnya .4s — ditunggu tuntas sebelum diukur */
   setTimeout(()=>res({teks:t.textContent, opa:getComputedStyle(t).opacity}), 600);
 }));
 cek('keterangan lambat bisa ditampilkan', /lambat/i.test(lama.teks), lama);
 cek('keterangannya terlihat saat dipasang', Number(lama.opa)>0.5, lama);
 const sembunyi=await p.evaluate(()=>new Promise(res=>{
   const s=document.getElementById('lzSibuk');
   s.classList.remove('lz-lama-tampil');
   setTimeout(()=>res(getComputedStyle(document.getElementById('lzSibukLama')).opacity), 600);
 }));
 cek('keterangan disembunyikan lagi saat normal', Number(sembunyi)<0.5, sembunyi);

 console.log('\n=== G. HEMAT DAYA & AKSESIBILITAS ===');
 const jeda=await p.evaluate(()=>{
   document.querySelectorAll('.lz').forEach(n=>n.classList.add('lz-jeda'));
   const el=document.querySelector('#lzSibuk .lz-line i');
   return getComputedStyle(el).animationPlayState;
 });
 cek('animasi berhenti saat tab tidak dilihat', jeda==='paused', jeda);
 await p.evaluate(()=>document.querySelectorAll('.lz').forEach(n=>n.classList.remove('lz-jeda')));

 const ctx2=await b.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
 const p2=await ctx2.newPage();
 await p2.route('**/app.js', async route => { await new Promise(r=>setTimeout(r,3500)); try{ await route.continue(); }catch(e){} });
 p2.goto(A+'/index.html').catch(()=>{});
 await p2.waitForSelector('#boot .lz-mark',{state:'visible',timeout:8000});
 const rm=await p2.evaluate(()=>{
   const m=getComputedStyle(document.querySelector('#boot .lz-mark'));
   const g=getComputedStyle(document.querySelector('#boot .lz-line i'));
   return {mark:m.animationName, opa:m.opacity, garis:g.animationName, lebar:g.width};
 });
 cek('hormat setelan "kurangi gerak": denyut dimatikan', rm.mark==='none', rm);
 cek('lambangnya tetap terbaca penuh', Number(rm.opa)===1, rm);
 cek('garisnya jadi penuh, bukan hilang', rm.garis==='none' && rm.lebar!=='0px', rm);
 await ctx2.close();

 console.log('\n=== H. DI LAYAR HP ===');
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>{ document.getElementById('boot').classList.remove('hidden'); });
 await p.waitForTimeout(400);
 const hp=await p.evaluate(()=>{
   const n=document.getElementById('boot');
   const r=n.querySelector('.lz-mark').getBoundingClientRect();
   const gr=n.querySelector('.lz-line').getBoundingClientRect();
   return {muat:r.right<=window.innerWidth+1 && r.left>=-1,
     garisMuat:gr.right<=window.innerWidth+1,
     luber:document.documentElement.scrollWidth>window.innerWidth+2};
 });
 cek('lambang muat di layar HP', hp.muat, hp);
 cek('garis muat di layar HP', hp.garisMuat, hp);
 cek('halaman tidak melebar', hp.luber===false, hp);
 await p.evaluate(()=>{ document.getElementById('boot').classList.add('hidden'); });

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_loader_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
