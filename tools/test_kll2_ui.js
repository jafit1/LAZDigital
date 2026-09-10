/* Halaman Saldo KLL & ULL: saringan + pencarian, keterbacaan angka minus,
   dan bagian Penghimpunan Daerah yang tunduk pada izin pengguna. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const fs=require('fs');
const {runRPC}=require('./_engine.js');
const PORT=8183, DBF='db-kll2-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};

async function buatFixture(){
  let db={sheets:{},props:{}};
  const call=async(f,a)=>{const o=await runRPC(db,f,a,{ip:'1',ua:'uji'});db=o.db;return o.result;};
  await call('setup',[]);
  const T=(await call('login',['superadmin','uji12345'])).token;
  for(const [tipe,nama] of [['KLL','Bantul Kota'],['KLL','Pundong'],['KLL','Sedayu'],['ULL','MTS Kasihan'],['ULL','Masjid Aceh']])
    await call('apiSaveLayanan',[T,{tipe:tipe,nama:nama,kode:'',aktif:true}]);
  await call('apiSaveRekening',[T,{namaBank:'BPD DIY Syariah',nomor:'803211000510',atasNama:'Lazismu',fundGroup:'Infak',aktif:true}]);
  await call('apiSaveHakAmil',[T,{persen:{Zakat:12.5,Infak:12.5,Sedekah:12.5,DSKL:12.5,Amil:0},kecuali:[]}]);
  const setor=(nama,jumlah,tgl)=>call('apiSaveImportedData',[T,[{tanggal:tgl,namaDonatur:nama,jenisDana:'Infak',subJenis:'Infak Umum',pilar:'',jumlah:jumlah,metode:'Transfer Bank',keterangan:'Setoran '+nama,fundraising:'Kantor'}],'himpun']);
  const ump=(nama,nominal,tgl)=>call('apiSaveImportedData',[T,[{tanggal:tgl,jenis:'keluar',layanan:nama,dana:'Infak',akun:'Kas Infak',nominal:nominal,keterangan:'Uang muka '+nama}],'ump']);
  const lpj=(nama,jumlah,tgl)=>call('apiSaveImportedData',[T,[{tanggal:tgl,namaPenerima:nama,program:'Penyaluran Infak - Sosial',ashnaf:'Fisabilillah',sumberDana:'Infak',section:'UMP LPJ INFAK',jumlah:jumlah,metode:'Cash/Tunai',keterangan:'LPJ '+nama,fundraising:'Kantor'}],'salur']);

  await setor('KLL Bantul Kota',50000000,'2026-01-05');   // sisa besar
  await ump('KLL Bantul Kota',10000000,'2026-01-10');
  await lpj('KLL Bantul Kota',4000000,'2026-01-20');      // belum LPJ 6.000.000
  await setor('KLL Pundong',20000000,'2026-02-05');
  await ump('KLL Pundong',17500000,'2026-02-10');         // sisa kecil
  await setor('KLL Sedayu',8000000,'2026-03-05');
  await ump('KLL Sedayu',7000000,'2026-03-06');
  await lpj('KLL Sedayu',7000000,'2026-03-20');           // belum LPJ 0
  await setor('ULL MTS Kasihan',4000000,'2026-04-05');
  await setor('ULL Masjid Aceh',2000000,'2026-05-05');
  /* kantor bersaldo minus: LPJ melebihi uang mukanya */
  await ump('KLL Sedayu',1000000,'2026-06-01');
  await lpj('KLL Sedayu',3000000,'2026-06-05');           // belum LPJ jadi minus
  /* penghimpunan tingkat daerah */
  await setor('Lazismu Daerah Bantul',30000000,'2026-01-08');

  /* pengguna staf: satu tanpa izin saldo daerah, satu dengan izin */
  await call('apiSaveUser',[T,{username:'staf1',nama:'Staf Tanpa Izin',role:'staff',aktif:true,layanan:'',
    password:'Staf1#2026',permissions:{dashboard:{view:true}}}]);
  await call('apiSaveUser',[T,{username:'staf2',nama:'Staf Berizin',role:'staff',aktif:true,layanan:'',
    password:'Staf2#2026',permissions:{dashboard:{view:true},saldodaerah:{view:true}}}]);
  fs.writeFileSync(DBF,JSON.stringify(db));
}

(async()=>{
 await buatFixture();
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{PORT:String(PORT),DBFILE:DBF}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1440,height:1000}});
 const errs=[];
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource/i.test(m.text()))errs.push('console: '+m.text());});
 const masuk=async(u,pw)=>{
   await p.evaluate(()=>{try{localStorage.clear();}catch(e){}});
   await p.goto('http://localhost:'+PORT+'/index.html');
   await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
   await p.fill('#lUser',u); await p.fill('#lPass',pw); await p.click('#loginBtn');
   await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1200);
 };
 const bukaKll=async()=>{ await p.evaluate(()=>{KLL_CARI='';KLL_TIPE='semua';KLL_STATUS='semua';KLL_URUT='sisa';KLL_BUKA='';go('kll');}); await p.waitForSelector('.kll-baris',{timeout:15000}); await p.waitForTimeout(500); };
 const namaBaris=()=>p.evaluate(()=>[...document.querySelectorAll('.kll-baris .kll-nama b')].map(x=>x.textContent.trim()));

 await masuk('superadmin','uji12345');
 await bukaKll();

 console.log('=== A. BENTUK TABEL ===');
 cek('kepala kolom tergambar', await p.evaluate(()=>document.querySelectorAll('.kll-kepala span').length)===7);
 cek('tiap baris punya kolom angka sendiri', await p.evaluate(()=>document.querySelectorAll('.kll-baris')[0].querySelectorAll('.kll-n').length)===5,
   await p.evaluate(()=>document.querySelectorAll('.kll-baris')[0].querySelectorAll('.kll-n').length));
 cek('semua kantor tampil', (await namaBaris()).length===5, await namaBaris());
 const sejajar=await p.evaluate(()=>{
   const kol=[...document.querySelectorAll('.kll-baris')].map(r=>[...r.querySelectorAll('.kll-n')].map(c=>Math.round(c.getBoundingClientRect().right)));
   return kol.every(r=>r.length===kol[0].length && r.every((v,i)=>Math.abs(v-kol[0][i])<=1));
 });
 cek('angka antar baris benar-benar sejajar', sejajar);

 console.log('\n=== B. PENCARIAN ===');
 await p.evaluate(()=>kllCari('pundong')); await p.waitForTimeout(400);
 cek('cari "pundong" menyisakan satu kantor', (await namaBaris()).length===1, await namaBaris());
 cek('jumlah hasil ditampilkan', /Menampilkan/i.test(await p.evaluate(()=>document.getElementById('kllTabel').innerText)));
 await p.evaluate(()=>kllCari('zzz')); await p.waitForTimeout(400);
 cek('pencarian tanpa hasil memberi jalan keluar',
   await p.evaluate(()=>!!document.querySelector('#kllTabel .empty') && /hapus saringan/i.test(document.getElementById('kllTabel').innerText)));
 await p.evaluate(()=>kllReset()); await p.waitForTimeout(500);
 cek('hapus saringan mengembalikan semua kantor', (await namaBaris()).length===5);

 console.log('\n=== C. SARINGAN ===');
 await p.evaluate(()=>kllSaring('tipe','ULL')); await p.waitForTimeout(400);
 let n=await namaBaris();
 cek('saring ULL hanya menampilkan ULL', n.length===2 && n.every(x=>/^ULL/.test(x)), n);
 await p.evaluate(()=>kllSaring('tipe','KLL')); await p.waitForTimeout(400);
 n=await namaBaris();
 cek('saring KLL hanya menampilkan KLL', n.length===3 && n.every(x=>/^KLL/.test(x)), n);
 await p.evaluate(()=>{kllSaring('tipe','semua');kllSaring('status','belumlpj');}); await p.waitForTimeout(400);
 n=await namaBaris();
 /* Bantul Kota (uang muka 10jt, LPJ 4jt) dan Pundong (uang muka 17,5jt, belum LPJ sama sekali).
    Sedayu sudah nol, dua ULL tidak pernah mengambil uang muka. */
 cek('saring "Belum LPJ" hanya kantor yang masih punya kewajiban',
   n.length===2 && n.every(x=>/Bantul Kota|Pundong/.test(x)), n);
 await p.evaluate(()=>kllSaring('status','bersaldo')); await p.waitForTimeout(400);
 cek('saring "Masih ada saldo" menyisakan kantor bersaldo positif',
   (await p.evaluate(()=>[...document.querySelectorAll('.kll-baris')].length))>=3);
 await p.evaluate(()=>kllSaring('status','semua')); await p.waitForTimeout(400);
 cek('tombol saringan yang aktif ditandai', await p.evaluate(()=>document.querySelectorAll('.kll-pil.on').length)===2);

 console.log('\n=== D. URUTAN ===');
 await p.evaluate(()=>kllSaring('urut','nama')); await p.waitForTimeout(400);
 n=await namaBaris();
 cek('urut nama A–Z', JSON.stringify(n)===JSON.stringify(n.slice().sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:1)), n);
 await p.evaluate(()=>kllSaring('urut','setoran')); await p.waitForTimeout(400);
 n=await namaBaris();
 cek('urut setoran terbesar menaruh Bantul Kota di atas', /Bantul Kota/.test(n[0]), n);
 await p.evaluate(()=>kllSaring('urut','sisa')); await p.waitForTimeout(400);

 console.log('\n=== E. ANGKA MINUS TERBACA ===');
 const minus=await p.evaluate(()=>{
   const s=[...document.querySelectorAll('.kll-baris .rp-neg')][0];
   if(!s) return null;
   const g=getComputedStyle(s);
   return {warna:g.color, teks:s.textContent.trim()};
 });
 cek('nilai minus di tabel ditandai merah', !!minus && /^rgb\(2[0-9]{2}|^rgb\(1[89][0-9]/.test(minus.warna), minus);
 cek('nilai minus memakai tanda minus, bukan tanda kurung', !!minus && /^−|^&minus;|^−/.test(minus.teks) || (minus && minus.teks.indexOf('−')===0), minus);
 /* kartu KPI berlatar gradien: pastikan minus memakai keping putih */
 const kpi=await p.evaluate(()=>{
   const c=document.querySelector('.kpi-v2:first-child');
   c.querySelector('.kpi-v2-value').innerHTML='<span class="rp-neg">− Rp 286.265.001</span>';
   const s=c.querySelector('.rp-neg'), g=getComputedStyle(s);
   return {bg:g.backgroundColor, warna:g.color, radius:g.borderRadius};
 });
 cek('minus di kartu gradien memakai latar terang', /rgb\(255, 255, 255\)|rgb\(254/.test(kpi.bg), kpi);
 cek('tulisannya merah di atas latar terang itu', /rgb\(1[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)/.test(kpi.warna), kpi);
 cek('bentuknya keping membulat', parseFloat(kpi.radius)>=8, kpi.radius);

 console.log('\n=== F. PENGHIMPUNAN DAERAH (SUPERADMIN) ===');
 await bukaKll();
 cek('bagian Penghimpunan Daerah tampil untuk superadmin', await p.evaluate(()=>!!document.querySelector('.kll-daerah')));
 cek('angka daerah tidak ikut kartu KPI Setoran KLL & ULL', await p.evaluate(async()=>{
   const d=await gas('apiSaldoLayanan')(TOKEN, KLL_TGL);
   return Math.round(d.totalKll.himpun)===Math.round(d.total.himpun - d.daerah.himpun);
 }));
 cek('daerah tidak ikut dihitung sebagai kantor layanan', await p.evaluate(()=>!document.querySelector('.kll-baris .kll-nama b').textContent.match(/Penghimpunan Daerah/)));
 await p.evaluate(()=>document.querySelector('.kll-daerah .saldo-grup-h').click());
 await p.waitForTimeout(2000);
 cek('rincian daerah bisa dibuka', await p.evaluate(()=>{const e=document.querySelector('.kll-daerah .saldo-buku');return !!e && /Setoran/.test(e.innerText);}));

 console.log('\n=== G. IZIN PENGGUNA ===');
 await masuk('staf1','Staf1#2026');
 await bukaKll();
 cek('staf tanpa izin: bagian daerah tidak ada', await p.evaluate(()=>!document.querySelector('.kll-daerah')));
 cek('staf tanpa izin: angkanya tidak terkirim ke peramban', await p.evaluate(async()=>{
   const d=await gas('apiSaldoLayanan')(TOKEN, KLL_TGL);
   return d.daerah===null && d.bolehDaerah===false && !d.daftar.some(x=>x.tipe==='Daerah');
 }));
 cek('staf tanpa izin: membuka rincian daerah ditolak', await p.evaluate(async()=>{
   try{ await gas('apiDetailSaldoLayanan')(TOKEN,'Penghimpunan Daerah',KLL_TGL); return false; }
   catch(e){ return /IZIN/.test(e.message||String(e)); }
 }));
 cek('staf tanpa izin tetap melihat kantor layanan', (await namaBaris()).length===5);

 await masuk('staf2','Staf2#2026');
 await bukaKll();
 cek('staf berizin: bagian daerah muncul', await p.evaluate(()=>!!document.querySelector('.kll-daerah')));
 cek('staf berizin: saringan tetap berfungsi', await (async()=>{
   await p.evaluate(()=>kllSaring('tipe','ULL')); await p.waitForTimeout(400);
   const x=await namaBaris(); return x.length===2;
 })());

 console.log('\n=== H. TABEL IZIN DI MANAJEMEN USER ===');
 await masuk('superadmin','uji12345');
 await p.evaluate(()=>go('users')); await p.waitForTimeout(1500);
 await p.evaluate(()=>{ if(typeof formUser==='function') formUser(); }); await p.waitForTimeout(900);
 const pg=await p.evaluate(()=>{
   const t=document.querySelector('.perm-table');
   return t? {teks:t.innerText, baris:t.querySelectorAll('tbody tr').length,
              adaDaerah:/Saldo Penghimpunan Daerah/i.test(t.innerText),
              namaTeknis:/saldodaerah/.test(t.innerText),
              strip:t.querySelectorAll('.perm-x').length} : null;
 });
 cek('tabel izin memakai nama yang bisa dibaca, bukan nama teknis',
   pg && pg.adaDaerah && !pg.namaTeknis, pg && pg.teks.slice(0,160));
 cek('modul saldo daerah ada barisnya', pg && pg.baris>=11, pg && pg.baris);
 cek('aksi yang tidak berlaku ditandai garis', pg && pg.strip>0, pg && pg.strip);
 await p.evaluate(()=>permSemua(true)); await p.waitForTimeout(200);
 cek('tombol centang semua bekerja', await p.evaluate(()=>[...document.querySelectorAll('.perm-table input')].every(c=>c.checked)));
 await p.evaluate(()=>permSemua(false)); await p.waitForTimeout(200);
 cek('tombol kosongkan bekerja', await p.evaluate(()=>[...document.querySelectorAll('.perm-table input')].every(c=>!c.checked)));
 await p.evaluate(()=>closeModal());

 console.log('\n=== I. TAMPILAN HP ===');
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(400);
 await bukaKll();
 const hp=await p.evaluate(()=>({
   doc:document.documentElement.scrollWidth, win:window.innerWidth,
   label:getComputedStyle(document.querySelector('.kll-n'),'::before').content,
   kepala:getComputedStyle(document.querySelector('.kll-kepala')).display
 }));
 cek('halaman tidak melebar di HP', hp.doc<=hp.win+2, hp);
 cek('kepala kolom disembunyikan di HP', hp.kepala==='none', hp.kepala);
 cek('tiap angka membawa labelnya sendiri di HP', /Setoran|Hak amil|Uang muka/.test(hp.label||''), hp.label);
 await p.setViewportSize({width:1440,height:1000});

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_kll2_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
