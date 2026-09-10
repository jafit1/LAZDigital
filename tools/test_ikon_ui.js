/* Ikon & keterbacaan tampilan.
   Emoji berwarna digambar oleh sistem operasi, jadi bentuk dan warnanya
   berbeda-beda dan tidak pernah sewarna tulisan di sebelahnya. Uji ini
   menyisir seluruh halaman dan modal untuk memastikan tidak ada yang
   tersisa, dan bahwa penggantinya benar-benar ikon garis yang ikut warna
   teks. Sekaligus memeriksa keterangan halaman tidak kembali memanjang. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const PORT=8185, DBF='db-kll2-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,320));}};

/* Rentang emoji berwarna. Tanda baca tipografi (→ ← ✓ ✕ · —) sengaja TIDAK
   ikut: itu karakter teks biasa yang memang sewarna tulisannya. */
const RE_EMOJI = String.raw`[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]`;

(async()=>{
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{PORT:String(PORT),DBFILE:DBF}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1440,height:1000}});
 const errs=[];
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource/i.test(m.text()))errs.push('console: '+m.text());});

 await p.goto('http://localhost:'+PORT+'/index.html');
 await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1500);

 const emojiDi=async(sel)=>p.evaluate(({sel,re})=>{
   const el=document.querySelector(sel); if(!el) return null;
   const rx=new RegExp(re,'gu');
   const found=[];
   const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
   let n;
   while((n=walk.nextNode())){
     const m=String(n.nodeValue||'').match(rx);
     if(m) found.push(m.join('')+' « '+String(n.nodeValue).trim().slice(0,50));
   }
   return found;
 },{sel,re:RE_EMOJI});

 console.log('=== A. SEMUA MENU BEBAS EMOJI ===');
 const menu=['dashboard','penghimpunan','pentasyarufan','saldo','kll','donatur','laporan','users','settings','log'];
 for(const m of menu){
   await p.evaluate(x=>go(x),m); await p.waitForTimeout(1500);
   const f=await emojiDi('#content');
   cek('menu '+m+' tanpa emoji', f && f.length===0, f);
 }
 cek('sidebar & kepala halaman tanpa emoji', (await emojiDi('body')).length===0, await emojiDi('body'));

 console.log('\n=== B. TAB PENGATURAN ===');
 await p.evaluate(()=>go('settings')); await p.waitForTimeout(1400);
 const tabs=await p.evaluate(()=>[...document.querySelectorAll('#content [onclick*="setTab("]')]
   .map(x=>(x.getAttribute('onclick')||'').match(/setTab\('([^']+)'/)).filter(Boolean).map(m=>m[1]));
 cek('daftar tab terbaca', tabs.length>=5, tabs);
 for(const t of tabs){
   await p.evaluate(x=>setTab(x),t); await p.waitForTimeout(1200);
   const f=await emojiDi('#content');
   cek('tab '+t+' tanpa emoji', f.length===0, f);
 }

 console.log('\n=== C. MODAL ===');
 const modal=async(nama,fn)=>{
   await p.evaluate(fn); await p.waitForTimeout(1000);
   const f=await emojiDi('#modalBg');
   cek('modal '+nama+' tanpa emoji', f && f.length===0, f);
   await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
 };
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1300);
 await modal('impor penghimpunan', ()=>openImportModal('himpun'));
 await p.evaluate(()=>go('users')); await p.waitForTimeout(1300);
 await modal('tambah user', ()=>formUser());
 await p.evaluate(()=>go('settings')); await p.waitForTimeout(1200);
 await modal('impor mutasi bank', ()=>openImportMutasiModal());

 console.log('\n=== D. DIALOG KONFIRMASI ===');
 await p.evaluate(()=>{ confirmDialog({title:'Uji',message:'Contoh',okText:'Ya',cancelText:'Batal',danger:true}); });
 await p.waitForSelector('.cd-card',{timeout:8000}); await p.waitForTimeout(300);
 const dlg=await p.evaluate(({re})=>{
   const ic=document.querySelector('.cd-icon');
   const rx=new RegExp(re,'u');
   return {svg:!!ic.querySelector('svg'), emoji:rx.test(ic.textContent||''),
           w:Math.round(ic.querySelector('svg')?ic.querySelector('svg').getBoundingClientRect().width:0)};
 },{re:RE_EMOJI});
 cek('ikon dialog berupa SVG, bukan emoji', dlg.svg && !dlg.emoji, dlg);
 cek('ukurannya wajar (20–32px)', dlg.w>=20 && dlg.w<=32, dlg.w);
 await p.evaluate(()=>document.querySelector('.cd-cancel').click()); await p.waitForTimeout(400);

 console.log('\n=== E. IKON IKUT WARNA TEKS ===');
 await p.evaluate(()=>go('penghimpunan')); await p.waitForTimeout(1400);
 const ikon=await p.evaluate(()=>{
   const b=[...document.querySelectorAll('.btn svg, .icon-btn svg')];
   if(!b.length) return null;
   return b.slice(0,6).map(sv=>{
     const g=getComputedStyle(sv);
     return {stroke:sv.getAttribute('stroke'), fill:sv.getAttribute('fill'),
             w:Math.round(sv.getBoundingClientRect().width)};
   });
 });
 cek('ada ikon SVG di tombol', !!ikon && ikon.length>0, ikon);
 cek('semua ikon memakai currentColor', ikon.every(x=>x.stroke==='currentColor'), ikon);
 cek('tidak ada ikon berisian warna tetap', ikon.every(x=>x.fill==='none'), ikon);
 cek('ukuran ikon seragam kecil (12–17px)', ikon.every(x=>x.w>=12&&x.w<=17), ikon);

 console.log('\n=== F. KETERANGAN HALAMAN RINGKAS ===');
 const panjang=[];
 for(const m of menu){
   await p.evaluate(x=>go(x),m); await p.waitForTimeout(1300);
   const d=await p.evaluate(()=>{const e=document.querySelector('#content .desc');return e?e.innerText.trim():'';});
   if(d.length>75) panjang.push([m,d.length,d.slice(0,60)]);
 }
 cek('tidak ada keterangan halaman > 75 huruf', panjang.length===0, panjang);

 console.log('\n=== G. PANEL PENGATURAN TIDAK LAGI DINDING TEKS ===');
 await p.evaluate(()=>go('settings')); await p.waitForTimeout(1200);
 await p.evaluate(()=>setTab('perawatan')); await p.waitForTimeout(1600);
 const pn=await p.evaluate(()=>{
   return [...document.querySelectorAll('.set-panel')].map(x=>{
     const d=x.querySelector('.set-det'), s=x.querySelector('.set-det > summary');
     const j=x.querySelector('h3');
     /* Chromium tetap melaporkan ukuran anak <details> yang tertutup (dipakai
        untuk animasi), jadi yang diukur adalah tinggi <details> itu sendiri. */
     return {judul:j?j.innerText.trim().slice(0,28):'', ringkas:s?s.innerText.trim().length:null,
             adaLipatan:!!d, terbuka:d?(d.open || d.getBoundingClientRect().height>60):false};
   });
 });
 cek('tiap panel punya ringkasan pendek', pn.filter(x=>x.ringkas!==null).length>=4, pn);
 cek('ringkasannya < 120 huruf', pn.filter(x=>x.ringkas!==null).every(x=>x.ringkas<120), pn);
 cek('rincian panjangnya dilipat (tertutup saat dibuka pertama)',
   pn.filter(x=>x.adaLipatan).every(x=>!x.terbuka), pn);
 const tinggi=await p.evaluate(()=>document.getElementById('content').scrollHeight);
 cek('halaman perawatan tidak sepanjang gulungan tak berujung (< 3200px)', tinggi<3200, tinggi);
 await p.evaluate(()=>{const d=document.querySelector('.set-det');if(d)d.open=true;}); await p.waitForTimeout(300);
 cek('rincian bisa dibuka saat dibutuhkan',
   await p.evaluate(()=>document.querySelector('.set-det-b').getBoundingClientRect().height>0));

 console.log('\n=== H. KEPING STATUS TANPA EMOJI ===');
 const chip=await p.evaluate(({re})=>{
   const d=document.createElement('div');
   d.innerHTML=_statBeres('12 transaksi terbaca.')+_statAwas('tidak ada yang cocok.')+_statGagal('gagal membaca.');
   document.body.appendChild(d);
   const c=[...d.querySelectorAll('.stat-chip')].map(x=>({t:x.textContent, w:getComputedStyle(x).color}));
   const rx=new RegExp(re,'u');
   const adaEmoji=c.some(x=>rx.test(x.t));
   d.remove();
   return {n:c.length, adaEmoji:adaEmoji, warna:c.map(x=>x.w)};
 },{re:RE_EMOJI});
 cek('tiga keping status tergambar', chip.n===3, chip);
 cek('tanpa emoji', chip.adaEmoji===false, chip);
 cek('warnanya berbeda-beda menurut arti', new Set(chip.warna).size===3, chip.warna);

 console.log('\n=== I. TAMPILAN HP ===');
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(500);
 for(const m of ['dashboard','penghimpunan','kll','settings']){
   await p.evaluate(x=>go(x),m); await p.waitForTimeout(1300);
   const l=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,win:window.innerWidth}));
   cek('halaman '+m+' tidak melebar di HP', l.doc<=l.win+2, l);
 }
 await p.setViewportSize({width:1440,height:1000});

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_ikon_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
