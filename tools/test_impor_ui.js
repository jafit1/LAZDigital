/* Tata letak modal impor: bagian pengantar harus ringkas, tiga pilihan bawaan
   sejajar satu baris, dan pratinjau mendapat sisa tinggi terbesar. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const fs=require('fs');
const PORT=8179, DBF='db-saldo-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};

/* Jurnal contoh: potongan jurnal bank asli (13 baris penerimaan) ditambah
   satu pasangan biaya administrasi, supaya kedua tabel pratinjau muncul. */
const TSV=require('./contoh_jurnal.json');

(async()=>{
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{PORT:String(PORT),DBFILE:DBF}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1440,height:900}});
 const errs=[];
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource/i.test(m.text()))errs.push('console: '+m.text());});

 await p.goto('http://localhost:'+PORT+'/index.html');
 await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1200);

 console.log('=== A. BENTUK MODAL ===');
 await p.evaluate(()=>{ go('penghimpunan'); }); await p.waitForTimeout(1200);
 await p.evaluate(()=>openImportModal('himpun')); await p.waitForTimeout(700);
 cek('modal impor terbuka', await p.evaluate(()=>!!document.querySelector('.modal.import-modal')));
 cek('tanpa galat JavaScript saat membuka', errs.length===0, errs.slice(0,2));

 const u=await p.evaluate(()=>{
   const q=s=>document.querySelector(s);
   const r=s=>{const e=q(s);return e?e.getBoundingClientRect():null;};
   return {drop:r('.imp-drop'), atas:r('.imp-atas'), body:r('.modal.import-modal .modal-body'),
           prev:r('#importPreview'), opsi:r('.imp-opsi'),
           nOpsi:document.querySelectorAll('.imp-opsi > .field').length,
           kolom:getComputedStyle(q('.imp-opsi')).gridTemplateColumns};
 });
 cek('kotak pilih berkas ramping (< 70px)', u.drop.height<70, Math.round(u.drop.height));
 cek('seluruh bagian pengantar < 200px', u.atas.height<200, Math.round(u.atas.height));
 cek('tiga pilihan bawaan ada semua', u.nOpsi===3, u.nOpsi);
 cek('ketiganya sejajar satu baris', u.kolom.split(' ').length===3, u.kolom);
 cek('pilihan bawaan tingginya satu baris (< 90px)', u.opsi.height<90, Math.round(u.opsi.height));
 cek('pratinjau dapat lebih dari separuh tinggi modal', u.prev.height > u.body.height*0.5,
   {prev:Math.round(u.prev.height), body:Math.round(u.body.height)});
 cek('ada penanda pratinjau kosong', await p.evaluate(()=>!!document.querySelector('.imp-kosong')));
 cek('modal tidak melebihi lebar layar', u.body.width<=1440, Math.round(u.body.width));

 console.log('\n=== B. TINGGI TETAP SAAT PINDAH TAB ===');
 const tinggi=[];
 for(const t of ['file','text','link','file']){
   await p.evaluate(x=>setImportTab(x),t); await p.waitForTimeout(350);
   tinggi.push(Math.round(await p.evaluate(()=>document.querySelector('.modal.import-modal .modal-body').getBoundingClientRect().height)));
 }
 cek('tinggi modal sama di semua tab', new Set(tinggi).size===1, tinggi);
 const at=await p.evaluate(()=>{
   const r=document.querySelector('.imp-atas').getBoundingClientRect();
   return Math.round(r.height);
 });
 cek('bagian pengantar tetap ringkas di tab teks', at<230, at);

 console.log('\n=== C. PRATINJAU DENGAN DATA ===');
 await p.evaluate(x=>{ setImportTab('text'); el('import_text').value=x; }, TSV);
 await p.waitForTimeout(300);
 await p.evaluate(()=>tarikImportData());
 await p.waitForSelector('.imp-tbl',{timeout:15000}); await p.waitForTimeout(600);
 const d=await p.evaluate(()=>{
   const q=s=>document.querySelector(s);
   const prev=q('#importPreview');
   const th=q('.imp-tbl th');
   return {nTabel:document.querySelectorAll('.imp-tbl').length,
           nBaris:document.querySelectorAll('.imp-tbl tbody tr').length,
           lengket:th?getComputedStyle(th).position:'',
           stat:document.querySelectorAll('.imp-stat-i').length,
           judul:document.querySelectorAll('.imp-h4').length,
           tinggiPrev:Math.round(prev.getBoundingClientRect().height),
           gulirPrev:prev.scrollHeight>prev.clientHeight,
           badanGulir:(()=>{const m=q('.modal.import-modal .modal-body');return m.scrollHeight>m.clientHeight+2;})()};
 });
 cek('dua tabel pratinjau tergambar', d.nTabel===2, d.nTabel);
 cek('baris data terbaca', d.nBaris>=3, d.nBaris);
 cek('kepala tabel lengket saat digulir', d.lengket==='sticky', d.lengket);
 cek('ringkasan angka tergambar', d.stat>=2, d.stat);
 cek('judul tiap bagian ada', d.judul===2, d.judul);
 cek('yang bergulir hanya pratinjau, bukan seluruh badan modal', d.badanGulir===false);
 cek('pratinjau masih > 300px saat berisi data', d.tinggiPrev>300, d.tinggiPrev);
 cek('tombol simpan muncul', await p.evaluate(()=>!el('importSimpanBtn').classList.contains('hidden')));
 await p.screenshot({path:'impor-baru.png'});

 console.log('\n=== D. LAYAR KECIL ===');
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(600);
 const m=await p.evaluate(()=>{
   const q=s=>document.querySelector(s);
   return {opsi:getComputedStyle(q('.imp-opsi')).gridTemplateColumns.split(' ').length,
           lebarModal:Math.round(q('.modal.import-modal').getBoundingClientRect().width),
           docW:document.documentElement.scrollWidth, winW:window.innerWidth,
           prev:Math.round(q('#importPreview').getBoundingClientRect().height)};
 });
 cek('di HP pilihan bawaan menumpuk satu kolom', m.opsi===1, m.opsi);
 cek('modal tidak melebar keluar layar', m.docW<=m.winW+2, m);
 cek('pratinjau tetap kebagian ruang di HP', m.prev>200, m.prev);
 await p.screenshot({path:'impor-hp.png'});
 await p.setViewportSize({width:1440,height:900});

 console.log('\n=== E. IMPOR PENTASYARUFAN ===');
 await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
 const n0=errs.length;
 await p.evaluate(()=>{ go('pentasyarufan'); }); await p.waitForTimeout(1200);
 await p.evaluate(()=>openImportModal('salur')); await p.waitForTimeout(700);
 const s2=await p.evaluate(()=>({n:document.querySelectorAll('.imp-opsi > .field').length,
   kolom:getComputedStyle(document.querySelector('.imp-opsi')).gridTemplateColumns.split(' ').length,
   drop:Math.round(document.querySelector('.imp-drop').getBoundingClientRect().height)}));
 cek('impor pentasyarufan: 2 pilihan bawaan (tanpa rekening)', s2.n===2, s2);
 cek('impor pentasyarufan: pilihan tetap sejajar', s2.kolom===3, s2.kolom);
 cek('impor pentasyarufan: kotak berkas ramping', s2.drop<70, s2.drop);
 cek('impor pentasyarufan tanpa galat', errs.length===n0, errs.slice(n0,n0+2));

 console.log('\n=== F. IMPOR MUTASI BANK ===');
 await p.evaluate(()=>closeModal()); await p.waitForTimeout(400);
 const n1=errs.length;
 await p.evaluate(()=>openImportMutasiModal()); await p.waitForTimeout(800);
 const mu=await p.evaluate(()=>{
   const q=s=>document.querySelector(s);
   const r=s=>{const e=q(s);return e?Math.round(e.getBoundingClientRect().height):null;};
   return {drop:r('.imp-drop'), atas:r('.imp-atas'), prev:r('#mutasiPreview'),
           body:r('.modal.import-modal .modal-body'),
           kolom:getComputedStyle(q('.imp-opsi')).gridTemplateColumns.split(' ').length,
           kosong:!!q('#mutasiPreview .imp-kosong'),
           kartuLama:!!q('.modal .card h3')};
 });
 cek('mutasi: kotak berkas ramping', mu.drop<70, mu.drop);
 cek('mutasi: pengantar padat (< 180px)', mu.atas<180, mu.atas);
 cek('mutasi: dua pilihan bawaan sejajar', mu.kolom===2, mu.kolom);
 cek('mutasi: pratinjau dapat sisa tinggi terbesar', mu.prev > mu.body*0.5, mu);
 cek('mutasi: ada penanda pratinjau kosong', mu.kosong);
 cek('mutasi: kartu pengantar lama sudah tidak ada', mu.kartuLama===false);
 cek('mutasi: tanpa galat', errs.length===n1, errs.slice(n1,n1+2));

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_impor_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
