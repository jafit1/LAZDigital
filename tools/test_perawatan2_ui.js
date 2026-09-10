/* Halaman Perawatan Data: panel nama kantor, transaksi kembar, dan
   pengosongan data — dijalankan lewat antarmuka seperti pengguna. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const fs=require('fs');
const {runRPC}=require('./_engine.js');
const PORT=8181, DBF='db-perawatan2-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};
const angka=t=>Number(String(t).replace(/[^\d]/g,''))||0;

async function buatFixture(){
  let db={sheets:{},props:{}};
  const call=async(f,a)=>{const o=await runRPC(db,f,a,{ip:'1',ua:'uji'});db=o.db;return o.result;};
  await call('setup',[]);
  const T=(await call('login',['superadmin','uji12345'])).token;
  await call('apiSaveLayanan',[T,{tipe:'KLL',nama:'Banguntapan Utara',kode:'',aktif:true}]);
  await call('apiSaveLayanan',[T,{tipe:'KLL',nama:'Pundong',kode:'',aktif:true}]);
  await call('apiSaveRekening',[T,{namaBank:'BPD DIY Syariah',nomor:'803211000510',atasNama:'Lazismu',fundGroup:'Infak',aktif:true}]);
  await call('apiSaveHakAmil',[T,{persen:{Zakat:12.5,Infak:12.5,Sedekah:12.5,DSKL:12.5,Amil:0},kecuali:[]}]);
  const setor=(nama,jumlah,tgl)=>call('apiSaveImportedData',[T,[{tanggal:tgl,namaDonatur:nama,jenisDana:'Infak',subJenis:'Infak Umum',pilar:'',jumlah:jumlah,metode:'Transfer Bank',keterangan:'Setoran '+nama,fundraising:'Kantor'}],'himpun']);
  const lpj=(nama,jumlah,tgl)=>call('apiSaveImportedData',[T,[{tanggal:tgl,namaPenerima:nama,program:'Penyaluran Infak - Sosial',ashnaf:'Fisabilillah',sumberDana:'Infak',section:'UMP LPJ INFAK',jumlah:jumlah,metode:'Cash/Tunai',keterangan:'LPJ '+nama,fundraising:'Kantor'}],'salur']);
  await setor('KLL Banguntapan Utara',10000000,'2026-01-06');
  await setor('KLL Pundong',2000000,'2026-02-01');
  await setor('KLL Pundong',750000,'2026-04-05');
  await setor('KLL Pundong',750000,'2026-04-05');            // kembar
  await lpj('KLL Banguntapaan Utara',852000,'2026-01-24');   // salah ketik
  await lpj('KLL Sedayuu',500000,'2026-03-01');              // belum terdaftar
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

 await p.goto('http://localhost:'+PORT+'/index.html');
 await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1200);

 console.log('=== A. REKAP KLL SUDAH BENAR TANPA DISENTUH ===');
 await p.evaluate(()=>go('kll')); await p.waitForTimeout(1600);
 const teksKll=await p.evaluate(()=>document.getElementById('content').innerText);
 cek('tidak ada kantor "Banguntapaan" di menu KLL', !/banguntapaan/i.test(teksKll), (teksKll.match(/KLL \w+/g)||[]).slice(0,8));
 cek('KLL Banguntapan Utara muncul', /Banguntapan Utara/i.test(teksKll));

 console.log('\n=== B. PANEL NAMA KANTOR ===');
 await p.evaluate(()=>{ go('settings'); }); await p.waitForTimeout(1200);
 await p.evaluate(()=>setTab('perawatan')); await p.waitForTimeout(1400);
 cek('panel "Periksa Nama Kantor Layanan" ada', await p.evaluate(()=>!!document.getElementById('namaKantorHasil')));
 cek('panel "Periksa Transaksi Kembar" ada', await p.evaluate(()=>!!document.getElementById('dobelHasil')));
 cek('panel "Kosongkan Data Transaksi" ada', await p.evaluate(()=>!!document.getElementById('kosongkanHasil')));

 await p.evaluate(()=>namaKantorPeriksa());
 await p.waitForFunction(()=>{const e=document.getElementById('namaKantorHasil');return e&&/nama kantor di data/i.test(e.innerText);},{timeout:15000});
 await p.waitForTimeout(400);
 const nk=await p.evaluate(()=>document.getElementById('namaKantorHasil').innerText);
 cek('KLL Sedayuu dilaporkan belum terdaftar', /Sedayuu/.test(nk), nk.slice(0,300));
 cek('ejaan Banguntapaan yang tersimpan dilaporkan', /Banguntapaan/.test(nk), nk.slice(0,400));
 cek('menyebut kantor tujuan yang benar', /Banguntapan Utara/.test(nk));
 cek('ada tombol betulkan/gabungkan', await p.evaluate(()=>[...document.querySelectorAll('#namaKantorHasil button')].some(b=>/betulkan|gabungkan/i.test(b.textContent))));

 console.log('\n=== C. BETULKAN EJAAN LEWAT TOMBOL ===');
 await p.evaluate(()=>{
   const b=[...document.querySelectorAll('#namaKantorHasil button')].find(x=>/betulkan/i.test(x.textContent));
   if(b) b.click();
 });
 await p.waitForSelector('.cd-card',{timeout:10000}); await p.waitForTimeout(400);
 const dlg=await p.evaluate(()=>document.querySelector('.cd-card').innerText);
 cek('dialog menyebut asal dan tujuan', /Banguntapaan/.test(dlg)&&/Banguntapan Utara/.test(dlg), dlg.slice(0,200));
 cek('dialog menyebut nominalnya', /852/.test(dlg), dlg.slice(0,300));
 await p.evaluate(()=>document.querySelector('.cd-ok').click());
 await p.waitForTimeout(2500);
 const nk2=await p.evaluate(()=>document.getElementById('namaKantorHasil').innerText);
 cek('setelah dibetulkan, ejaan Banguntapaan hilang dari laporan', !/Banguntapaan/.test(nk2), nk2.slice(0,300));

 console.log('\n=== D. ANGKA KLL TIDAK BERUBAH SETELAH DIBETULKAN ===');
 await p.evaluate(()=>go('kll')); await p.waitForTimeout(1600);
 const kllData=await p.evaluate(async()=>await gas('apiSaldoLayanan')(TOKEN,'2026-12-31'));
 const bu=kllData.daftar.filter(x=>/Banguntapan Utara/i.test(x.layanan))[0];
 cek('setoran tetap 10.000.000', Math.round(bu.himpun)===10000000, bu.himpun);
 cek('LPJ tetap 852.000', Math.round(bu.lpj)===852000, bu.lpj);
 cek('hanya satu baris Banguntapan', kllData.daftar.filter(x=>/banguntapa+n utara/i.test(x.layanan)).length===1);

 console.log('\n=== E. PANEL TRANSAKSI KEMBAR ===');
 await p.evaluate(()=>{ go('settings'); }); await p.waitForTimeout(1200);
 await p.evaluate(()=>setTab('perawatan')); await p.waitForTimeout(1400);
 await p.evaluate(()=>dobelPeriksa());
 await p.waitForFunction(()=>{const e=document.getElementById('dobelHasil');return e&&e.innerText.trim().length>20;},{timeout:15000});
 await p.waitForTimeout(400);
 const dob=await p.evaluate(()=>document.getElementById('dobelHasil').innerText);
 cek('melaporkan 1 baris kembar', /1 baris kembar/i.test(dob), dob.slice(0,200));
 cek('menyebut nominal 750.000', /750\.000/.test(dob), dob.slice(0,300));
 cek('tombol hapus muncul', await p.evaluate(()=>!document.getElementById('btnHapusDobel').classList.contains('hidden')));
 const himpunSebelum=await p.evaluate(async()=>(await gas('apiListPenghimpunan')(TOKEN)).length);
 await p.evaluate(()=>dobelKonfirmasi());
 await p.waitForSelector('.cd-card',{timeout:10000}); await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector('.cd-ok').click());
 await p.waitForTimeout(2500);
 const himpunSesudah=await p.evaluate(async()=>(await gas('apiListPenghimpunan')(TOKEN)).length);
 cek('satu baris terhapus', himpunSesudah===himpunSebelum-1, {himpunSebelum,himpunSesudah});
 await p.evaluate(()=>dobelPeriksa());
 await p.waitForFunction(()=>{const e=document.getElementById('dobelHasil');return e&&/bersih|Tidak ada/i.test(e.innerText);},{timeout:15000});
 cek('periksa ulang menyatakan sudah bersih', true);

 console.log('\n=== F. KOSONGKAN HARUS DIKETIK DULU ===');
 await p.evaluate(()=>kosongkanKonfirmasi());
 await p.waitForSelector('.cd-card',{timeout:10000}); await p.waitForTimeout(300);
 cek('ada kotak ketik konfirmasi', await p.evaluate(()=>!!document.querySelector('.cd-prompt')));
 cek('tombol lanjut mati sebelum diketik', await p.evaluate(()=>document.querySelector('.cd-ok').disabled===true));
 await p.evaluate(()=>{const i=document.querySelector('.cd-prompt');i.value='kosong';i.dispatchEvent(new Event('input'));});
 cek('kata yang salah tidak menghidupkan tombol', await p.evaluate(()=>document.querySelector('.cd-ok').disabled===true));
 await p.evaluate(()=>{const i=document.querySelector('.cd-prompt');i.value='KOSONGKAN';i.dispatchEvent(new Event('input'));});
 cek('kata yang benar menghidupkan tombol', await p.evaluate(()=>document.querySelector('.cd-ok').disabled===false));
 await p.evaluate(()=>document.querySelector('.cd-cancel').click());
 await p.waitForTimeout(500);
 cek('membatalkan tidak menghapus apa pun', await p.evaluate(async()=>(await gas('apiListPenghimpunan')(TOKEN)).length)===himpunSesudah);

 console.log('\n=== G. KOSONGKAN BENERAN ===');
 const nRek=await p.evaluate(async()=>(await gas('apiListRekening')(TOKEN)).length);
 const nLay=await p.evaluate(async()=>(await gas('apiListLayanan')(TOKEN)).length);
 const hasil=await p.evaluate(async()=>await gas('apiResetTransaksi')(TOKEN,'KOSONGKAN',false));
 cek('melaporkan baris yang dihapus', hasil.total>0, hasil.total);
 cek('penghimpunan kosong', await p.evaluate(async()=>(await gas('apiListPenghimpunan')(TOKEN)).length)===0);
 cek('rekening tetap utuh', await p.evaluate(async()=>(await gas('apiListRekening')(TOKEN)).length)===nRek);
 cek('kantor layanan tetap utuh', await p.evaluate(async()=>(await gas('apiListLayanan')(TOKEN)).length)===nLay);

 console.log('\n=== H. SELURUH APLIKASI TETAP JALAN SETELAH DIKOSONGKAN ===');
 const menu=['dashboard','penghimpunan','pentasyarufan','saldo','kll','donatur','laporan','users','settings','log'];
 for(const m of menu){
   const n0=errs.length;
   await p.evaluate(x=>go(x),m); await p.waitForTimeout(1300);
   const t=await p.evaluate(()=>document.getElementById('content').innerText);
   cek('menu '+m+' tetap tergambar tanpa galat', t.trim().length>40 && errs.length===n0, errs.slice(n0,n0+2));
 }
 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_perawatan2_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
