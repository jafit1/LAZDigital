/* Menu Saldo KLL & ULL: pencarian, alur uang per kantor, rincian setoran /
   uang muka / LPJ, tab Hak Amil di Pengaturan, dan akun pengurus KLL yang
   hanya melihat kantornya sendiri. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const PORT=8181, DBF='db-kll-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,300));}};
/* "Rp 2.987.062,5" -> 2987062 (bagian desimal diabaikan) */
const angka=s=>{const m=String(s).match(/-?[\d.]+/);return m?Number(m[0].replace(/\./g,'')):0;};
const minus=s=>/[−-]\s*Rp/.test(String(s))?-1:1;
const nilai=s=>angka(s)*minus(s);
(async()=>{
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{PORT:String(PORT),DBFILE:DBF}),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1440,height:1000}});
 const errs=[];p.on('pageerror',e=>errs.push(String(e.message)));
 const masuk=async(u,pw)=>{
   await p.evaluate(()=>{ try{ localStorage.clear(); sessionStorage.clear(); }catch(e){} }).catch(()=>{});
   await p.goto('http://localhost:'+PORT+'/index.html');
   await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
   await p.fill('#lUser',u); await p.fill('#lPass',pw); await p.click('#loginBtn');
   await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1400);
 };
 await masuk('superadmin','uji12345');

 console.log('=== A. MENU SALDO KLL & ULL ===');
 cek('menu "Saldo KLL & ULL" ada di navigasi', await p.evaluate(()=>{const n=document.getElementById('nav_kll');return !!n && /Saldo KLL & ULL/.test(n.title);}));
 await p.evaluate(()=>{ KLL_TGL='2026-08-31'; KLL_BUKA=''; KLL_CARI=''; go('kll'); }); await p.waitForTimeout(1800);
 const isi=await p.evaluate(()=>document.getElementById('kllBody').innerText);
 cek('halaman tergambar dengan 4 kartu ringkas', /Setoran KLL & ULL/i.test(isi) && /Hak amil/i.test(isi) && /Masih di daerah/i.test(isi) && /Belum LPJ/i.test(isi), isi.slice(0,200));
 cek('persentase hak amil disebutkan', /Hak amil: .*%/.test(isi), (isi.match(/Hak amil:[^\n]*/)||[])[0]);
 const baris=await p.evaluate(()=>[...document.querySelectorAll('#kllTabel .kll-baris')].map(x=>x.innerText.replace(/\n/g,' | ')));
 cek('daftar kantor layanan tergambar', baris.length>=5, baris.length);
 /* Label kini berada di kepala kolom, tidak diulang tiap baris — itulah yang
    membuat angkanya bisa dibandingkan antar kantor. Yang diperiksa: kepala
    kolom memuat labelnya, dan tiap baris membawa lima angka di kolomnya. */
 const kepala = await p.evaluate(()=>{const e=document.querySelector('.kll-kepala');return e?e.innerText:'';});
 cek('kepala kolom menyebut setoran / hak amil / uang muka / belum LPJ / masih di daerah',
   /setoran/i.test(kepala)&&/hak amil/i.test(kepala)&&/uang muka/i.test(kepala)&&/belum lpj/i.test(kepala)&&/masih di daerah/i.test(kepala), kepala);
 cek('tiap baris membawa lima angka di kolomnya',
   await p.evaluate(()=>[...document.querySelectorAll('#kllTabel .kll-baris')].every(r=>r.querySelectorAll('.kll-n').length===5)));
 cek('baris hanya berisi KLL/ULL (Daerah dipisah)', baris.every(t=>/^(KLL|ULL)\b/.test(t.trim())), baris.map(t=>t.split(' |')[0]).slice(0,8));
 cek('Penghimpunan Daerah ditampilkan terpisah', /Penghimpunan Daerah/.test(isi));
 const urut=baris.map(t=>angka((t.match(/Rp[^|]*$/)||[''])[0]));
 cek('urut sisa saldo terbesar di atas', urut.every((n,i)=>i===0||urut[i-1]>=n), urut.slice(0,6));

 console.log('\n=== B. PENCARIAN ===');
 await p.fill('#kllCari','srandakan'); await p.waitForTimeout(600);
 const cari1=await p.evaluate(()=>[...document.querySelectorAll('#kllTabel .kll-baris')].map(x=>x.querySelector('.kll-nama b').textContent.trim()));
 cek('pencarian menyaring daftar kantor', cari1.length>0 && cari1.every(t=>/srandakan/i.test(t)), cari1);
 cek('jumlah hasil pencarian ditampilkan', /dari \d+ kantor/.test(await p.evaluate(()=>document.getElementById('kllTabel').innerText)));
 await p.fill('#kllCari','zzz tidak ada'); await p.waitForTimeout(600);
 cek('pencarian tanpa hasil memberi pesan jelas', /Tidak ada kantor yang cocok/.test(await p.evaluate(()=>document.getElementById('kllTabel').innerText)));
 await p.fill('#kllCari',''); await p.waitForTimeout(600);
 cek('pencarian dikosongkan kembali menampilkan semua', (await p.evaluate(()=>document.querySelectorAll('#kllTabel .kll-baris').length))===baris.length);
 cek('kotak pencarian tidak kehilangan fokus saat mengetik', await p.evaluate(()=>document.activeElement && document.activeElement.id==='kllCari'));

 console.log('\n=== C. RINCIAN SATU KANTOR ===');
 const iSrd=await p.evaluate(()=>[...document.querySelectorAll('#kllTabel .kll-baris')].findIndex(x=>/Srandakan/i.test(x.querySelector('.kll-nama b').textContent)));
 await p.click('#kllTabel .kll-baris >> nth='+iSrd); await p.waitForTimeout(1800);
 const rinci=await p.evaluate(()=>{const e=document.querySelector('#kllTabel .saldo-buku');return e?e.innerText:'';});
 cek('klik kantor membuka rinciannya', rinci.length>150, rinci.slice(0,120));
 cek('alur uang ditampilkan: setoran, hak amil, saldo KLL, uang muka, masih di daerah',
   /Setoran/i.test(rinci)&&/Hak amil/i.test(rinci)&&/Saldo KLL/i.test(rinci)&&/Uang muka/i.test(rinci)&&/Masih di daerah/i.test(rinci), rinci.slice(0,220));
 cek('kalimat penutup menjelaskan sisa yang belum LPJ', /belum LPJ/i.test(rinci) && /sudah di-LPJ-kan/i.test(rinci));
 cek('tiga tabel rincian: setoran, uang muka, LPJ', /Setoran \(\d+\)/.test(rinci) && /Uang muka \(\d+\)/.test(rinci) && /LPJ \/ penyaluran \(\d+\)/.test(rinci), rinci.match(/\w+[^\n(]*\(\d+\)/g));
 const kolom=await p.evaluate(()=>{const t=document.querySelector('#kllTabel .saldo-buku table');return t?[...t.querySelectorAll('thead th')].map(x=>x.innerText):[];});
 cek('tabel setoran memuat kolom hak amil & bersih', kolom.some(k=>/hak amil/i.test(k)) && kolom.some(k=>/bersih/i.test(k)), kolom);
 const angkaAlur=await p.evaluate(()=>[...document.querySelectorAll('#kllTabel .kll-alur-k')].map(x=>x.innerText.replace(/\n/g,' | ')));
 const nAlur=angkaAlur.map(t=>nilai((t.match(/[−-]?\s*Rp[^|]*/)||[''])[0]));
 cek('saldo KLL = setoran − hak amil', Math.abs((nAlur[0]-nAlur[1])-nAlur[2])<=1, {nAlur});
 cek('masih di daerah = saldo KLL − uang muka', Math.abs((nAlur[2]-nAlur[3])-nAlur[4])<=1, {nAlur});
 await p.click('#kllTabel .kll-baris >> nth='+iSrd); await p.waitForTimeout(500);
 cek('klik lagi menutup rinciannya', await p.evaluate(()=>!document.querySelector('#kllTabel .saldo-buku')));

 console.log('\n=== D. TABEL KLL DI MENU SALDO ===');
 await p.evaluate(()=>{ SALDO_TGL='2026-08-31'; SALDO_LAY_CARI=''; go('saldo'); }); await p.waitForTimeout(1800);
 cek('ada kotak pencarian di tabel KLL/ULL', await p.evaluate(()=>!!document.getElementById('saldoLayCari')));
 const nSemua=await p.evaluate(()=>document.querySelectorAll('#saldoLayTabel tbody tr').length);
 await p.fill('#saldoLayCari','sanden'); await p.waitForTimeout(600);
 const hasil=await p.evaluate(()=>[...document.querySelectorAll('#saldoLayTabel tbody tr')].map(x=>x.innerText.split('\t')[0]));
 cek('pencarian di menu Saldo menyaring kantor', hasil.length>0 && hasil.length<nSemua && hasil.every(t=>/sanden/i.test(t)), hasil);
 cek('tombol menuju menu Saldo KLL & ULL tersedia', await p.evaluate(()=>[...document.querySelectorAll('#saldoBody button')].some(b=>/Saldo KLL/.test(b.innerText))));
 await p.evaluate(()=>{const r=document.querySelector('#saldoLayTabel tbody tr'); if(r) r.click();}); await p.waitForTimeout(2000);
 cek('klik baris kantor membuka menu KLL pada kantor itu',
   await p.evaluate(()=>!!document.getElementById('kllBody') && !!document.querySelector('#kllTabel .saldo-buku')));

 console.log('\n=== E. PENGATURAN HAK AMIL ===');
 await p.evaluate(()=>go('settings')); await p.waitForTimeout(1200);
 await p.evaluate(()=>setTab('hakamil')); await p.waitForTimeout(1400);
 const ha=await p.evaluate(()=>document.getElementById('haBody').innerText);
 cek('tab Hak Amil tergambar', /Zakat/.test(ha) && /Infak/.test(ha), ha.slice(0,120));
 cek('kotak persen tersedia untuk tiap jenis dana', (await p.evaluate(()=>document.querySelectorAll('#haBody .ha-persen').length))>=5);
 await p.evaluate(()=>{ document.getElementById('ha_Infak').value='20'; document.getElementById('ha_kecuali').value='Kemanusiaan'; haSimpan(); });
 await p.waitForTimeout(1600);
 cek('pengaturan tersimpan & dimuat ulang', await p.evaluate(()=>document.getElementById('ha_Infak').value==='20' && /Kemanusiaan/.test(document.getElementById('ha_kecuali').value)));
 await p.evaluate(()=>{ document.getElementById('ha_Infak').value='150'; haSimpan(); }); await p.waitForTimeout(900);
 cek('persen di luar 0-100 ditolak di layar', /antara 0 dan 100/.test(await p.evaluate(()=>document.getElementById('toast').innerText)));
 await p.evaluate(()=>{ KLL_TGL='2026-08-31'; go('kll'); }); await p.waitForTimeout(1800);
 cek('pengecualian tampil di halaman KLL', /dikecualikan: Kemanusiaan/.test(await p.evaluate(()=>document.getElementById('kllBody').innerText)));

 console.log('\n=== F. AKUN PENGURUS KLL ===');
 await p.evaluate(()=>go('users')); await p.waitForTimeout(1400);
 const tblU=await p.evaluate(()=>document.querySelector('#content table').innerText);
 cek('kolom Kantor ada di daftar pengguna', /Kantor/i.test(tblU) && /KLL Srandakan/.test(tblU), tblU.slice(0,220));
 await p.evaluate(()=>{const u=CACHE.users.find(x=>x.username==='srandakan'); formUser(u.id);}); await p.waitForTimeout(900);
 cek('form pengguna punya pilihan kantor & terisi', await p.evaluate(()=>{const s=document.getElementById('u_layanan');return !!s && s.value==='KLL Srandakan';}));
 cek('pilihan kantor memuat daftar KLL/ULL terdaftar', (await p.evaluate(()=>document.getElementById('u_layanan').options.length))>=5);
 await p.evaluate(()=>closeModal());
 await masuk('srandakan','Srandakan26');
 await p.evaluate(()=>{ KLL_TGL='2026-08-31'; go('kll'); }); await p.waitForTimeout(1800);
 const isiP=await p.evaluate(()=>document.getElementById('kllBody').innerText);
 const barisP=await p.evaluate(()=>[...document.querySelectorAll('#kllTabel .kll-baris')].map(x=>x.querySelector('.kll-nama b').textContent.trim()));
 cek('pengurus KLL hanya melihat kantornya sendiri', barisP.length===1 && /Srandakan/i.test(barisP[0]), barisP);
 cek('judul menyebut kantor yang dibatasi', /Kantor: KLL Srandakan/.test(isiP), isiP.slice(0,120));
 cek('pengurus tidak melihat tombol atur hak amil', !(await p.evaluate(()=>[...document.querySelectorAll('#content button')].some(b=>/Atur hak amil/.test(b.innerText)))));
 await p.evaluate(()=>{ const i=[...document.querySelectorAll('#kllTabel .kll-baris')][0]; if(i) i.click(); }); await p.waitForTimeout(1600);
 cek('pengurus tetap bisa membuka rincian kantornya', await p.evaluate(()=>!!document.querySelector('#kllTabel .saldo-buku table')));

 console.log('\n=== G. TAMPILAN HP ===');
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(700);
 const l=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,win:window.innerWidth}));
 cek('halaman KLL tidak melebar di HP', l.doc<=l.win+2, l);
 cek('tanpa galat JavaScript', errs.length===0, errs.slice(0,3));
 await p.setViewportSize({width:1440,height:1000});
 await p.screenshot({path:'kll-menu.png',fullPage:true});
 console.log('\ntest_kll_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
