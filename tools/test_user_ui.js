/* Manajemen User: status aktif, dialog edit, dan tampilan sidebar.

   Tiga hal yang diperiksa:
   1. Status akun terbaca benar — dulu apiListUsers memetakan tiap baris lewat
      sanitizeUser() yang TIDAK membawa kolom 'aktif', jadi semua akun tampil
      "Nonaktif" dan menyimpan dari dialog Edit justru mengunci akunnya.
   2. Dialog Edit User cukup lebar untuk tabel hak akses.
   3. Sidebar menempel ke tepi halaman, dan logonya menyesuaikan lebar. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const fs=require('fs');
const {runRPC}=require('./_engine.js');
const PORT=8211, DBF='db-user-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};

async function buatFixture(){
  let db={sheets:{},props:{}};
  const call=async(f,a)=>{const o=await runRPC(db,f,a,{ip:'1',ua:'uji'});db=o.db;return o.result;};
  await call('setup',[]);
  const T=(await call('login',['superadmin','uji12345'])).token;
  await call('apiSaveLayanan',[T,{tipe:'KLL',nama:'Bantul Kota',kode:'',aktif:true}]);
  await call('apiSaveUser',[T,{username:'nuryulianto',nama:'Nur Yulianto',role:'staff',aktif:true,layanan:'',
    password:'Nur#2026x',permissions:{dashboard:{view:true},penghimpunan:{view:true,create:true}}}]);
  await call('apiSaveUser',[T,{username:'fundraising',nama:'Fundraising',role:'staff',aktif:true,layanan:'',
    password:'Fund#2026x',permissions:{dashboard:{view:true}}}]);
  /* satu akun sengaja dinonaktifkan, supaya perbedaannya kelihatan */
  await call('apiSaveUser',[T,{username:'cuti',nama:'Staf Cuti',role:'staff',aktif:false,layanan:'',
    password:'Cuti#2026x',permissions:{dashboard:{view:true}}}]);
  fs.writeFileSync(DBF,JSON.stringify(db));
}

(async()=>{
 await buatFixture();
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{PORT:String(PORT),DBFILE:DBF,SETUP_ADMIN_PASSWORD:'uji12345'}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1500,height:1000}});
 const errs=[];
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource|manifest/i.test(m.text()))errs.push('console: '+m.text());});
 const A='http://localhost:'+PORT;
 const jauhkan=()=>p.mouse.move(1250,950);

 await p.goto(A+'/index.html'); await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1500);
 await jauhkan();

 console.log('=== A. STATUS AKUN DI DAFTAR USER ===');
 await p.evaluate(()=>go('users')); await p.waitForTimeout(1800); await jauhkan();
 const baris=await p.evaluate(()=>[...document.querySelectorAll('#content tbody tr')].map(tr=>({
   nama:tr.children[0].innerText.trim(),
   status:tr.children[4].innerText.trim(),
   kelas:(tr.children[4].querySelector('.badge')||{}).className||''
 })));
 cek('empat akun tergambar', baris.length===4, baris);
 const sup=baris.find(x=>/Super/i.test(x.nama));
 cek('superadmin tampil Aktif, bukan Nonaktif', sup && sup.status==='Aktif', sup);
 cek('lencananya hijau', sup && /green/.test(sup.kelas), sup);
 const nur=baris.find(x=>/Nur Yulianto/.test(x.nama));
 cek('staf aktif tampil Aktif', nur && nur.status==='Aktif', nur);
 const cuti=baris.find(x=>/Cuti/.test(x.nama));
 cek('akun yang memang dinonaktifkan tetap Nonaktif', cuti && cuti.status==='Nonaktif', cuti);
 cek('lencananya kuning', cuti && /amber/.test(cuti.kelas), cuti);
 cek('tidak semua baris berstatus sama', new Set(baris.map(x=>x.status)).size===2, baris.map(x=>x.status));

 console.log('\n=== B. DIALOG EDIT USER ===');
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#content tbody tr')]
   .find(tr=>/Nur Yulianto/.test(tr.innerText)); b.querySelector('.icon-btn').click();});
 await p.waitForSelector('#modalBg.show',{timeout:8000}); await p.waitForTimeout(700);
 const dlg=await p.evaluate(()=>{
   const m=document.getElementById('modalCard');
   const r=m.getBoundingClientRect();
   const tabel=m.querySelector('.perm-table');
   const geser=m.querySelector('.tabel-geser');
   return {kelas:m.className, lebar:Math.round(r.width), layar:window.innerWidth,
     kolomGrid:getComputedStyle(m.querySelector('.uf-grid')).gridTemplateColumns.split(' ').length,
     tabelLebar:Math.round(tabel.getBoundingClientRect().width),
     wadahLebar:geser?Math.round(geser.getBoundingClientRect().width):0,
     kanan:Math.round(m.querySelector('.uf-kanan').getBoundingClientRect().right),
     modalKanan:Math.round(r.right)};
 });
 cek('dialog memakai lebar khusus', /user-modal/.test(dlg.kelas), dlg.kelas);
 cek('lebarnya jauh di atas 560px bawaan', dlg.lebar>860, dlg);
 cek('tapi tidak melewati lebar layar', dlg.lebar<=dlg.layar, dlg);
 cek('tersusun dua kolom: data akun & hak akses', dlg.kolomGrid===2, dlg.kolomGrid);
 cek('tabel hak akses muat tanpa terpotong', dlg.tabelLebar<=dlg.wadahLebar+2, dlg);
 cek('zona kanan tidak keluar dari dialog', dlg.kanan<=dlg.modalKanan, dlg);

 const st=await p.evaluate(()=>{
   const c=document.getElementById('u_aktif');
   return {tipe:c?c.type:null, tercentang:c?c.checked:null,
     adaTeksMentah:/(^|\s)(true|false)(\s|$)/i.test(document.getElementById('modalBody').innerText),
     judul:(document.querySelector('.uf-status-j')||{}).textContent||''};
 });
 cek('status akun berupa sakelar, bukan dropdown true/false', st.tipe==='checkbox', st);
 cek('sakelarnya menyala untuk akun yang aktif', st.tercentang===true, st);
 cek('tidak ada lagi tulisan mentah "true"/"false"', st.adaTeksMentah===false, st);
 cek('sakelarnya diberi label yang jelas', /akun aktif/i.test(st.judul), st.judul);

 /* Inti bug lama: buka lalu simpan tanpa mengubah apa pun harus TIDAK
    mengunci akunnya. */
 console.log('\n=== C. SIMPAN TANPA MENGUBAH APA PUN ===');
 await p.evaluate(()=>[...document.querySelectorAll('#modalFoot .btn')].find(b=>/simpan/i.test(b.textContent)).click());
 await p.waitForTimeout(2200);
 const sesudah=await p.evaluate(()=>[...document.querySelectorAll('#content tbody tr')]
   .filter(tr=>/Nur Yulianto/.test(tr.innerText)).map(tr=>tr.children[4].innerText.trim())[0]);
 cek('akun tetap Aktif setelah disimpan ulang', sesudah==='Aktif', sesudah);
 const bisaMasuk=await p.evaluate(async()=>{
   const r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({fn:'login',args:['nuryulianto','Nur#2026x']})});
   const j=await r.json(); return j.result||{};
 });
 cek('dan akunnya masih bisa login', bisaMasuk.ok===true, bisaMasuk);

 /* mematikan sakelar memang menonaktifkan */
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#content tbody tr')]
   .find(tr=>/Fundraising/.test(tr.innerText)); b.querySelector('.icon-btn').click();});
 await p.waitForSelector('#modalBg.show',{timeout:8000}); await p.waitForTimeout(600);
 await p.evaluate(()=>document.getElementById('u_aktif').click());
 await p.evaluate(()=>[...document.querySelectorAll('#modalFoot .btn')].find(b=>/simpan/i.test(b.textContent)).click());
 await p.waitForTimeout(2200);
 const ff=await p.evaluate(()=>[...document.querySelectorAll('#content tbody tr')]
   .filter(tr=>/Fundraising/.test(tr.innerText)).map(tr=>tr.children[4].innerText.trim())[0]);
 cek('mematikan sakelar benar-benar menonaktifkan', ff==='Nonaktif', ff);
 const ditolak=await p.evaluate(async()=>{
   const r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({fn:'login',args:['fundraising','Fund#2026x']})});
   const j=await r.json(); return j.result||{};
 });
 cek('akun nonaktif ditolak saat login', ditolak.ok===false && /nonaktif/i.test(ditolak.msg||''), ditolak);

 console.log('\n=== D. SIDEBAR MENEMPEL KE HALAMAN ===');
 await p.evaluate(()=>go('saldo')); await p.waitForTimeout(1500); await jauhkan(); await p.waitForTimeout(400);
 const sb=await p.evaluate(()=>{
   const t=document.querySelector('.topnav'), m=document.querySelector('.main');
   const r=t.getBoundingClientRect(), g=getComputedStyle(t);
   return {kiri:Math.round(r.left), atas:Math.round(r.top), lebar:Math.round(r.width),
     tinggi:Math.round(r.height), layarTinggi:window.innerHeight,
     sudut:g.borderRadius, bayang:g.boxShadow,
     kananGaris:g.borderRightWidth,
     mainKiri:Math.round(m.getBoundingClientRect().left)};
 });
 cek('menempel di tepi kiri layar', sb.kiri===0, sb);
 cek('menempel di tepi atas', sb.atas===0, sb);
 cek('tingginya setinggi layar', Math.abs(sb.tinggi-sb.layarTinggi)<=2, sb);
 cek('sudutnya tidak lagi membulat', /^0px/.test(sb.sudut), sb.sudut);
 cek('tidak lagi berbayang saat diam', sb.bayang==='none', sb.bayang);
 cek('dipisahkan garis, bukan celah', parseFloat(sb.kananGaris)>0, sb.kananGaris);
 cek('konten mulai tepat setelah sidebar', Math.abs(sb.mainKiri-sb.lebar)<=1, sb);

 /* disentuh kursor: melebar sementara DAN berbayang, karena menimpa konten */
 await p.hover('.topnav'); await p.waitForTimeout(500);
 const hov=await p.evaluate(()=>{
   const t=document.querySelector('.topnav'), m=document.querySelector('.main');
   return {lebar:Math.round(t.getBoundingClientRect().width),
     bayang:getComputedStyle(t).boxShadow!=='none',
     mainKiri:Math.round(m.getBoundingClientRect().left)};
 });
 cek('melebar saat kursor menyentuh', hov.lebar>sb.lebar, hov);
 cek('berbayang hanya saat menimpa konten', hov.bayang===true, hov);
 cek('konten tidak ikut bergeser saat sekadar disentuh', hov.mainKiri===sb.mainKiri, {hov,sb});

 /* dipaku terbuka lewat klik logo: konten bergeser, tidak tertimpa */
 await p.click('#brandBox .tn-brand-id'); await jauhkan(); await p.waitForTimeout(700);
 const paku=await p.evaluate(()=>{
   const t=document.querySelector('.topnav'), m=document.querySelector('.main');
   return {lebar:Math.round(t.getBoundingClientRect().width),
     mainKiri:Math.round(m.getBoundingClientRect().left),
     bayang:getComputedStyle(t).boxShadow};
 });
 cek('dipaku terbuka: konten ikut bergeser', Math.abs(paku.mainKiri-paku.lebar)<=1, paku);
 cek('dan tetap tidak berbayang', paku.bayang==='none', paku.bayang);

 console.log('\n=== E. LOGO MENYESUAIKAN LEBAR SIDEBAR ===');
 const logoLebar=await p.evaluate(()=>{
   const im=document.querySelector('.tn-brand .logo-img'), mini=document.querySelector('.logo-mini'),
         nm=document.querySelector('.brand-name');
   return {adaImg:!!im, imgTampil:im?getComputedStyle(im).display!=='none':null,
     miniTampil:mini?getComputedStyle(mini).display!=='none':null,
     namaTampil:nm?getComputedStyle(nm).display!=='none':null};
 });
 cek('saat lebar: identitas penuh tampil', logoLebar.adaImg?logoLebar.imgTampil===true:logoLebar.namaTampil===true, logoLebar);
 cek('lencana ringkas disembunyikan saat lebar', logoLebar.miniTampil!==true, logoLebar);

 /* Tanda yang tampak saat ciut: mana pun dari lencana / logo / nama yang
    benar-benar terlihat. Dua cabang applyBranding diuji dua-duanya. */
 const ukurCiut=()=>p.evaluate(()=>{
   const t=document.querySelector('.topnav');
   const calon=[...document.querySelectorAll('.tn-brand-id > *')]
     .filter(x=>getComputedStyle(x).display!=='none' && x.getBoundingClientRect().width>0);
   const tr=t.getBoundingClientRect();
   const br=calon.length?calon[0].getBoundingClientRect():null;
   return {ciut:document.getElementById('appView').classList.contains('collapsed'),
     tampak:calon.map(x=>x.className), teks:calon.length?calon[0].textContent.trim():'',
     jumlahTampak:calon.length,
     meleset:br?Math.abs((br.left+br.width/2)-(tr.left+tr.width/2)):null,
     meluber:br?(br.right>tr.right+0.5||br.left<tr.left-0.5):null};
 });

 await p.click('#brandBox .tn-brand-id'); await jauhkan(); await p.waitForTimeout(700);
 const tanpaLogo=await ukurCiut();
 cek('kembali ciut', tanpaLogo.ciut===true, tanpaLogo);
 cek('belum ada logo: hanya lencana inisial yang tampak', tanpaLogo.jumlahTampak===1, tanpaLogo);
 cek('lencananya memakai inisial nama lembaga', /^[A-Z]{1,2}$/.test(tanpaLogo.teks), tanpaLogo.teks);
 cek('nama lembaga disembunyikan saat ciut',
   tanpaLogo.tampak.join(' ').indexOf('brand-name')<0, tanpaLogo.tampak);
 cek('posisinya tepat di tengah rel', tanpaLogo.meleset!==null && tanpaLogo.meleset<=1.5, tanpaLogo);
 cek('tidak meluber keluar sidebar', tanpaLogo.meluber===false, tanpaLogo);

 /* keadaan sebenarnya di lapangan: logo wordmark lebar sudah diunggah */
 await p.evaluate(()=>{
   SETTINGS.logoData='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80"><rect width="320" height="80" fill="#F2704F"/></svg>');
   SETTINGS.namaLembaga='Lazismu Bantul';
   applyBranding();
 });
 await jauhkan(); await p.waitForTimeout(500);
 const denganLogo=await ukurCiut();
 cek('ada logo: wordmark lebar tidak dipaksakan masuk',
   denganLogo.tampak.join(' ').indexOf('logo-img')<0, denganLogo.tampak);
 cek('yang tampak lencana ringkasnya',
   denganLogo.jumlahTampak===1 && /logo-mini/.test(denganLogo.tampak[0]), denganLogo);
 cek('inisialnya ikut nama lembaga', denganLogo.teks==='LB', denganLogo.teks);
 cek('tetap di tengah rel', denganLogo.meleset<=1.5, denganLogo);
 cek('tetap tidak meluber', denganLogo.meluber===false, denganLogo);

 /* dilebarkan lagi: wordmark penuh yang muncul, lencana mundur */
 await p.click('#brandBox .tn-brand-id'); await jauhkan(); await p.waitForTimeout(700);
 const lebarLogo=await p.evaluate(()=>{
   const im=document.querySelector('.tn-brand .logo-img'), mini=document.querySelector('.logo-mini');
   const t=document.querySelector('.topnav').getBoundingClientRect();
   const r=im.getBoundingClientRect();
   return {img:getComputedStyle(im).display!=='none', mini:getComputedStyle(mini).display!=='none',
     muat:r.right<=t.right+0.5, lebar:Math.round(r.width)};
 });
 cek('saat lebar: wordmark penuh kembali tampil', lebarLogo.img===true, lebarLogo);
 cek('lencana ringkas mundur', lebarLogo.mini===false, lebarLogo);
 cek('wordmarknya muat di dalam sidebar', lebarLogo.muat===true, lebarLogo);
 await p.click('#brandBox .tn-brand-id'); await jauhkan(); await p.waitForTimeout(600);

 console.log('\n=== F. TAMPILAN HP ===');
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(700);
 for(const m of ['users','saldo']){
   await p.evaluate(x=>go(x),m); await p.waitForTimeout(1300);
   const l=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,win:window.innerWidth}));
   cek('halaman '+m+' tidak melebar di HP', l.doc<=l.win+2, l);
 }
 await p.evaluate(()=>go('users')); await p.waitForTimeout(1400);
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#content tbody tr')]
   .find(tr=>/Nur Yulianto/.test(tr.innerText)); b.querySelector('.icon-btn').click();});
 await p.waitForSelector('#modalBg.show',{timeout:8000}); await p.waitForTimeout(700);
 const hp=await p.evaluate(()=>({
   kolom:getComputedStyle(document.querySelector('.uf-grid')).gridTemplateColumns.split(' ').length,
   lebar:Math.round(document.getElementById('modalCard').getBoundingClientRect().width),
   layar:window.innerWidth}));
 cek('dialog menumpuk jadi satu kolom di HP', hp.kolom===1, hp);
 cek('dialog tetap muat di layar HP', hp.lebar<=hp.layar, hp);
 await p.evaluate(()=>closeModal());
 await p.setViewportSize({width:1500,height:1000});

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_user_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
