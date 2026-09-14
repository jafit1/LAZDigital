/* Uji tampilan halaman /broadcast.html.
   Dua hal yang diperiksa: (1) kerangkanya benar-benar sama dengan halaman
   utama — sidebar ciut otomatis, menu yang sama, tema yang sama; (2) papan
   kerja tab pertama memakai lebar layar dan tidak melebar di HP. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const PORT=8193, DBF='db-kll2-uji.json';
let ok=0,g=0;
const cek=(n,c,i)=>{if(c){ok++;console.log('  OK   |',n);}else{g++;console.log('  GAGAL|',n,i===undefined?'':JSON.stringify(i).slice(0,320));}};

/* rentang emoji berwarna; tanda baca tipografi (→ ✓ ✕ ·) sengaja tidak ikut */
const RE_EMOJI = String.raw`[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]`;

(async()=>{
 require('fs').rmSync('data',{recursive:true,force:true});
 require('fs').rmSync('/tmp/laz-db-cache.json',{force:true});
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{
   PORT:String(PORT), DBFILE:DBF, WA_DRY_RUN:'true',
   WA_JEDA_MIN_DETIK:'0', WA_JEDA_MAX_DETIK:'0', WA_JAM_KIRIM_AKTIF:'false',
   WA_PREFIX:'wabui', SETUP_ADMIN_PASSWORD:'uji12345'
 }),stdio:'ignore'});
 process.on('exit',()=>{try{srv.kill();}catch(e){}});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1440,height:1000}});
 const errs=[];
 p.on('pageerror',e=>errs.push(String(e.message)));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon|net::ERR|Failed to load resource|manifest/i.test(m.text()))errs.push('console: '+m.text());});
 const asal='http://localhost:'+PORT;

 /* ---- masuk lewat halaman utama supaya token asli tersimpan ---- */
 const masuk=async(u,pw)=>{
   await p.goto(asal+'/index.html');
   await p.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
   await p.fill('#lUser',u); await p.fill('#lPass',pw); await p.click('#loginBtn');
   await p.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p.waitForTimeout(1200);
 };
 await masuk('superadmin','uji12345');

 console.log('=== A. MENU BROADCAST DI HALAMAN UTAMA ===');
 const adaMenu=await p.evaluate(()=>!!document.getElementById('nav_broadcast'));
 cek('menu Broadcast WA ada di sidebar utama', adaMenu);
 await p.click('#nav_broadcast');
 await p.waitForURL('**/broadcast.html',{timeout:10000});
 await p.waitForSelector('#appView:not(.hidden)',{timeout:15000});
 await p.waitForTimeout(1400);
 cek('klik menu membawa ke /broadcast.html', p.url().indexOf('/broadcast.html')>0, p.url());

 console.log('\n=== B. KERANGKA SAMA DENGAN HALAMAN UTAMA ===');
 const rangka=await p.evaluate(()=>({
   app:!!document.querySelector('#appView.app'),
   topnav:!!document.querySelector('header.topnav#topnav'),
   brand:!!document.querySelector('.tn-brand #btnBrand'),
   nav:!!document.querySelector('nav.tn-nav#nav'),
   chip:!!document.querySelector('.tn-right .user-chip'),
   keluar:!!document.querySelector('.tn-right .tn-icon'),
   main:!!document.querySelector('main.main #content'),
   gayaTunggal:[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>x.getAttribute('href'))
 }));
 cek('memakai bungkus .app yang sama', rangka.app, rangka);
 cek('memakai header .topnav yang sama', rangka.topnav, rangka);
 cek('logo merangkap tombol buka/tutup menu', rangka.brand, rangka);
 cek('ada nav .tn-nav', rangka.nav, rangka);
 cek('ada kartu user + tombol keluar', rangka.chip&&rangka.keluar, rangka);
 cek('konten di main.main #content', rangka.main, rangka);
 cek('memakai /styles.css yang sama dengan halaman utama',
   rangka.gayaTunggal.some(h=>/\/styles\.css$/.test(h)), rangka.gayaTunggal);

 const menu=await p.evaluate(()=>[...document.querySelectorAll('#nav .tn-item')].map(x=>({id:x.id,label:x.title,aktif:x.classList.contains('active')})));
 cek('semua menu web utama ikut tampil', menu.length>=11, menu.map(x=>x.id));
 cek('menu broadcast ditandai aktif', menu.filter(x=>x.aktif).length===1 && menu.find(x=>x.aktif).id==='nav_broadcast', menu);
 const ikonOk=await p.evaluate(()=>[...document.querySelectorAll('#nav .tn-item svg')].every(s=>s.getAttribute('stroke')==='currentColor'));
 cek('ikon menu memakai currentColor seperti web utama', ikonOk);

 console.log('\n=== C. SIDEBAR CIUT OTOMATIS (auto hide) ===');
 /* Lebarnya tidak dipatok angka: yang diuji adalah SAMA dengan web utama,
    supaya uji ini tidak perlu diubah tiap kali styles.css disetel ulang. */
 /* Saat ciut, mengarahkan kursor ke sidebar memang melebarkannya sementara
    (aturan .app.collapsed .topnav:hover di styles.css). Kursor Playwright
    berhenti di (0,0) — tepat di atas sidebar — jadi harus digeser dulu. */
 const jauhkanKursor=()=>p.mouse.move(1200,600);
 const ukurSidebar=async(hal)=>{
   await p.goto(asal+hal);
   await p.waitForSelector('#appView:not(.hidden)',{timeout:15000}); await p.waitForTimeout(1200);
   await jauhkanKursor();
   await p.evaluate(()=>document.getElementById('appView').classList.add('collapsed'));
   await p.waitForTimeout(450);
   const ciut=await p.evaluate(()=>Math.round(document.querySelector('.topnav').getBoundingClientRect().width));
   await p.evaluate(()=>document.getElementById('appView').classList.remove('collapsed'));
   await p.waitForTimeout(450);
   const lebar=await p.evaluate(()=>Math.round(document.querySelector('.topnav').getBoundingClientRect().width));
   return {ciut, lebar};
 };
 const uUtama=await ukurSidebar('/index.html'), uBc=await ukurSidebar('/broadcast.html');
 cek('lebar sidebar ciut sama persis dengan web utama', uBc.ciut===uUtama.ciut, {utama:uUtama,broadcast:uBc});
 cek('lebar sidebar mengembang sama persis dengan web utama', uBc.lebar===uUtama.lebar, {utama:uUtama,broadcast:uBc});
 cek('ciut memang lebih sempit dari mengembang', uBc.ciut<uBc.lebar, uBc);

 await p.goto(asal+'/broadcast.html');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:15000}); await p.waitForTimeout(1300);
 let sb=await p.evaluate(()=>({ciut:document.getElementById('appView').classList.contains('collapsed')}));
 cek('terbuka pertama kali dalam keadaan ciut', sb.ciut===true, sb);
 const lebarCiut=await p.evaluate(()=>Math.round(document.querySelector('.topnav').getBoundingClientRect().width));
 await p.hover('.topnav'); await p.waitForTimeout(500);
 const lebarSentuh=await p.evaluate(()=>Math.round(document.querySelector('.topnav').getBoundingClientRect().width));
 cek('kursor di atas sidebar memunculkan labelnya sementara, seperti web utama',
   lebarSentuh>lebarCiut, {ciut:lebarCiut,sentuh:lebarSentuh});
 await jauhkanKursor(); await p.waitForTimeout(400);
 cek('kursor menjauh: sidebar ciut lagi sendiri',
   (await p.evaluate(()=>Math.round(document.querySelector('.topnav').getBoundingClientRect().width)))===lebarCiut);
 await p.click('#btnBrand'); await jauhkanKursor(); await p.waitForTimeout(600);
 sb=await p.evaluate(()=>({ciut:document.getElementById('appView').classList.contains('collapsed'),
   lebar:Math.round(document.querySelector('.topnav').getBoundingClientRect().width)}));
 cek('klik logo melebarkan sidebar secara permanen', sb.ciut===false && sb.lebar===uUtama.lebar, sb);
 const tip=await p.evaluate(()=>{const t=document.querySelector('#nav_penghimpunan .tn-tip');return t?getComputedStyle(t).opacity:null;});
 cek('label menu terbaca saat lebar', tip && Number(tip)>0.5, tip);
 await p.click('#content h2'); await p.waitForTimeout(500);
 cek('klik di area konten menciutkan lagi (perilaku drawer)',
   await p.evaluate(()=>document.getElementById('appView').classList.contains('collapsed')));
 const ingat=await p.evaluate(()=>localStorage.getItem('sidebar_collapsed'));
 cek('pilihan ciut/lebar diingat di localStorage, dipakai bersama web utama', ingat==='true', ingat);

 console.log('\n=== D. IDENTITAS & TEMA IKUT WEB UTAMA ===');
 const id=await p.evaluate(()=>({nama:document.getElementById('uName').textContent,
   peran:document.getElementById('uRole').textContent,
   avatar:document.getElementById('uAvatar').textContent,
   tema:document.documentElement.getAttribute('data-theme')}));
 cek('nama user tampil di kartu', id.nama.length>0, id);
 cek('peran tampil sebagai Superadmin', id.peran==='Superadmin', id);
 cek('tema diambil dari pilihan web utama', id.tema==='light'||id.tema==='dark', id);
 await p.evaluate(()=>localStorage.setItem('laz_theme','dark'));
 await p.reload(); await p.waitForSelector('#appView:not(.hidden)',{timeout:15000}); await p.waitForTimeout(1000);
 cek('tema gelap ikut terpakai di halaman broadcast',
   await p.evaluate(()=>document.documentElement.getAttribute('data-theme')==='dark'));
 await p.evaluate(()=>localStorage.setItem('laz_theme','light'));
 await p.reload(); await p.waitForSelector('#appView:not(.hidden)',{timeout:15000}); await p.waitForTimeout(1000);

 console.log('\n=== E. NAVIGASI BALIK KE WEB UTAMA ===');
 await p.click('#nav_penghimpunan');
 await p.waitForURL('**/?hal=penghimpunan',{timeout:10000});
 await p.waitForSelector('#appView:not(.hidden)',{timeout:15000}); await p.waitForTimeout(1500);
 const judul=await p.evaluate(()=>{const h=document.querySelector('#content h2');return h?h.textContent.trim():'';});
 cek('klik Penghimpunan dari broadcast membuka halaman Penghimpunan, bukan Dashboard',
   /penghimpunan/i.test(judul), judul);
 cek('alamat kembali bersih tanpa ?hal=', !(await p.evaluate(()=>location.search)), await p.evaluate(()=>location.search));

 console.log('\n=== F. PAPAN KERJA TAMPILAN AWAL ===');
 await p.goto(asal+'/broadcast.html');
 await p.waitForSelector('#appView:not(.hidden)',{timeout:15000}); await p.waitForTimeout(1400);
 const tata=await p.evaluate(()=>{
   const k=document.querySelector('.bc-kerja'); if(!k) return null;
   const kol=getComputedStyle(k).gridTemplateColumns.split(' ').length;
   const kartu=[...k.querySelectorAll('.card')].map(c=>{
     const r=c.getBoundingClientRect(); const h=c.querySelector('h2');
     return {judul:h?h.textContent.trim():'', atas:Math.round(r.top), kiri:Math.round(r.left), lebar:Math.round(r.width)};
   });
   return {kol, kartu, lebarMain:Math.round(document.querySelector('.main').getBoundingClientRect().width),
           tinggiIsi:document.getElementById('content').scrollHeight, tinggiLayar:window.innerHeight};
 });
 cek('papan kerja dua kolom di layar lebar', tata && tata.kol===2, tata&&tata.kol);
 cek('empat kartu kerja tergambar', tata && tata.kartu.length===4, tata&&tata.kartu.map(x=>x.judul));
 const kiri=tata.kartu.filter(x=>x.kiri<tata.kartu[0].kiri+50), kanan=tata.kartu.filter(x=>x.kiri>=tata.kartu[0].kiri+50);
 cek('alat tulis di kolom kiri, pratinjau & kirim di kanan',
   kiri.length===2 && kanan.length===2, {kiri:kiri.map(x=>x.judul),kanan:kanan.map(x=>x.judul)});
 cek('memakai lebar penuh .main (bukan kolom sempit 1000px)', tata.lebarMain>1100, tata.lebarMain);
 cek('tombol Kirim terlihat tanpa menggulung jauh',
   await p.evaluate(()=>{const r=document.getElementById('kirim').getBoundingClientRect();return r.top<window.innerHeight;}));
 const sisi=await p.evaluate(()=>getComputedStyle(document.querySelector('.bc-sisi')).position);
 cek('kolom kanan menempel saat digulung', sisi==='sticky', sisi);
 const sembunyi=await p.evaluate(()=>{
   const h=document.getElementById('hapusPustaka');
   return {atribut:h.hasAttribute('hidden'), tampil:h.getBoundingClientRect().height>0};
 });
 cek('tombol Hapus pustaka benar-benar tersembunyi sebelum ada pesan dipilih',
   sembunyi.atribut && !sembunyi.tampil, sembunyi);

 console.log('\n=== G. TAB BERFUNGSI ===');
 for(const t of ['daftar','riwayat','tolak','setelan','baru']){
   await p.click('.tab-btn[data-tab='+t+']'); await p.waitForTimeout(900);
   const tampil=await p.evaluate(x=>{const s=document.querySelector('[data-panel='+x+']');return s&&!s.hidden;},t);
   cek('tab '+t+' terbuka', tampil);
 }
 const satu=await p.evaluate(()=>[...document.querySelectorAll('[data-panel]')].filter(x=>!x.hidden).length);
 cek('hanya satu panel tampil pada satu waktu', satu===1, satu);

 console.log('\n=== H. KUNCI WEBHOOK TIDAK ADA DI HALAMAN ===');
 await p.click('.tab-btn[data-tab=setelan]'); await p.waitForTimeout(1500);
 const bocor=await p.evaluate(()=>{
   const ada=[...document.querySelectorAll('input')].map(x=>x.value).join(' ')+' '+document.body.innerText;
   return {teks:ada.indexOf('wa-webhook?kunci=')>=0, secretInfo:(document.getElementById('secretInfo')||{}).textContent};
 });
 cek('URL berkunci tidak dicetak di halaman', bocor.teks===false, bocor);
 cek('hanya menandai kunci terpasang / belum', /kunci webhook|belum ada kunci/i.test(bocor.secretInfo||''), bocor);

 console.log('\n=== H2. PEMILIH JAM KIRIM ===');
 const jam=await p.evaluate(()=>({
   adaInputTime:document.querySelectorAll('input[type=time]').length,
   tombol:document.querySelectorAll('#kotakJam .btn-dropdown').length,
   opsiJam:document.querySelectorAll('#mulaiJ option').length,
   opsiMenit:document.querySelectorAll('#mulaiM option').length,
   nilai:(document.getElementById('mulaiJ')||{}).value+':'+(document.getElementById('mulaiM')||{}).value,
   teksTombol:[...document.querySelectorAll('#kotakJam .btn-dropdown .sel-teks')].map(x=>x.textContent).join('|')
 }));
 cek('tidak ada lagi input type=time bawaan browser', jam.adaInputTime===0, jam);
 cek('dua dropdown per kolom (jam & menit)', jam.tombol===4, jam);
 cek('pilihan jam 24 jam penuh, bukan AM/PM', jam.opsiJam===24, jam);
 cek('menit kelipatan 5', jam.opsiMenit>=12, jam);
 cek('nilai tersimpan terbaca benar', jam.nilai==='08:00', jam);
 cek('tombolnya menampilkan angka jamnya', /08/.test(jam.teksTombol), jam.teksTombol);
 /* Fixture uji menjalankan server dengan jam kirim dimatikan, jadi pilihan
    jamnya memang sengaja diredupkan & tidak bisa diklik. Itu diperiksa dulu,
    baru sakelarnya dinyalakan untuk menguji dropdownnya. */
 const mati=await p.evaluate(()=>{const k=document.getElementById('kotakJam');
   return {redup:k.classList.contains('set-mati'), opacity:getComputedStyle(k).opacity,
           klik:getComputedStyle(k).pointerEvents};});
 cek('jam kirim mati → pilihan jamnya diredupkan', mati.redup && Number(mati.opacity)<1, mati);
 cek('dan tidak bisa diklik selagi mati', mati.klik==='none', mati);
 /* kotak centangnya disembunyikan di balik .switch, jadi diklik lewat elemennya */
 await p.evaluate(()=>document.getElementById('jamAktif').click()); await p.waitForTimeout(400);
 cek('dinyalakan → kembali bisa dipakai',
   await p.evaluate(()=>!document.getElementById('kotakJam').classList.contains('set-mati')));

 await p.click('#kotakJam .btn-dropdown'); await p.waitForTimeout(400);
 const pop=await p.evaluate(()=>{const x=document.querySelector('.select-enhanced-popover');
   return x?{ada:true,item:x.querySelectorAll('.dropdown-item').length}:{ada:false};});
 cek('dropdown jam terbuka pakai gaya halaman sendiri', pop.ada && pop.item===24, pop);
 await p.evaluate(()=>{const it=[...document.querySelectorAll('.select-enhanced-popover .dropdown-item')].find(x=>x.textContent==='06'); if(it) it.click();});
 await p.waitForTimeout(400);
 cek('memilih jam mengubah nilainya', await p.evaluate(()=>document.getElementById('mulaiJ').value==='06'));
 cek('tombolnya ikut berubah jadi 06',
   await p.evaluate(()=>document.querySelector('#kotakJam .btn-dropdown .sel-teks').textContent==='06'));
 /* Tombol dua digit tidak boleh melebar mengikuti kolom — kalau melebar,
    tanda titik dua terdorong ke baris berikutnya dan barisnya pecah. */
 const bentuk=await p.evaluate(()=>{
   const w=document.querySelector('#kotakJam .waktu');
   const b=[...w.querySelectorAll('.btn-dropdown')].map(x=>Math.round(x.getBoundingClientRect().width));
   /* titik dua lebih pendek dari tombolnya, jadi tepi atasnya memang beda.
      Yang menentukan sebaris atau tidak adalah titik tengah vertikalnya. */
   const tengah=[...w.children].filter(x=>x.offsetParent!==null)
     .map(x=>{const r=x.getBoundingClientRect(); return Math.round(r.top+r.height/2);});
   return {lebar:b, tengah:tengah,
           satuBaris:Math.max.apply(null,tengah)-Math.min.apply(null,tengah)<=2,
           lebarKotak:Math.round(w.getBoundingClientRect().width)};
 });
 cek('jam & menit ada di satu baris dengan titik dua di tengah', bentuk.satuBaris, bentuk);
 cek('tombolnya ringkas, tidak selebar kolom', bentuk.lebar.every(x=>x<=120), bentuk);
 /* simpan lalu muat ulang: nilai dari dropdown harus benar-benar tersimpan */
 await p.click('#simpanSetelan'); await p.waitForTimeout(2200);
 await p.click('.tab-btn[data-tab=baru]'); await p.waitForTimeout(500);
 await p.click('.tab-btn[data-tab=setelan]'); await p.waitForTimeout(1800);
 cek('jam hasil pilihan tersimpan di server',
   await p.evaluate(()=>document.getElementById('mulaiJ').value==='06'),
   await p.evaluate(()=>document.getElementById('mulaiJ').value));

 console.log('\n=== H3. TATA LETAK SETELAN RINGKAS ===');
 const set=await p.evaluate(()=>{
   const s=document.querySelector('[data-panel=setelan]');
   const d=s.querySelector('.rinci-perangkat');
   return {kartu:s.querySelectorAll('.card').length,
           tinggi:s.scrollHeight,
           mentahDilipat:!!d && !d.open,
           tinggiMentah:d?Math.round(d.getBoundingClientRect().height):0};
 });
 cek('setelan cukup dua kartu, bukan tiga', set.kartu===2, set);
 cek('keluaran mentah perangkat dilipat', set.mentahDilipat, set);
 cek('lipatan tertutup tidak makan tempat (< 40px)', set.tinggiMentah<40, set);
 cek('seluruh tab setelan muat tanpa gulungan panjang (< 700px)', set.tinggi<700, set.tinggi);

 console.log('\n=== I. KIRIM SUNGGUHAN (dry run) ===');
 await p.click('.tab-btn[data-tab=baru]'); await p.waitForTimeout(700);
 await p.fill('#isiPesan','Assalamualaikum {nama}, terima kasih. Balas STOP untuk berhenti.');
 await p.fill('#tempel','telepon;nama\n08120001001;Ahmad\n08120001002;Budi\n08120001003;Cici');
 await p.click('#prosesTempel'); await p.waitForTimeout(1600);
 const kontak=await p.evaluate(()=>document.getElementById('ringkasKontak').innerText);
 cek('3 nomor terbaca dan dinormalkan', /3 nomor sah/.test(kontak), kontak.slice(0,90));
 cek('chip kolom muncul dari header kontak',
   await p.evaluate(()=>document.querySelectorAll('#chipKolom .chip').length>=1));
 const pra=await p.evaluate(()=>document.getElementById('pra').textContent);
 cek('pratinjau mengisi {nama} dengan data baris pertama', /Ahmad/.test(pra), pra.slice(0,70));
 cek('tombol kirim menyala', await p.evaluate(()=>!document.getElementById('kirim').disabled));
 await p.fill('#namaKampanye','Kampanye Uji UI');
 await p.click('#kirim'); await p.waitForTimeout(600);
 await p.evaluate(()=>[...document.querySelectorAll('#modalFoot .btn')].find(b=>/kirim/i.test(b.textContent)).click());
 await p.waitForTimeout(5000);
 const riwayat=await p.evaluate(()=>({tampil:!document.querySelector('[data-panel=riwayat]').hidden,
   tabel:document.getElementById('tabelKampanye').innerText}));
 cek('setelah kirim pindah ke tab Riwayat', riwayat.tampil, riwayat.tampil);
 cek('kampanye muncul di riwayat', /Kampanye Uji UI/.test(riwayat.tabel), riwayat.tabel.slice(0,120));
 cek('3 penerima tercatat', /3 penerima/.test(riwayat.tabel), riwayat.tabel.slice(0,160));
 const detail=await p.evaluate(()=>document.getElementById('detail').innerText);
 cek('rincian kampanye terbuka otomatis', /Terkirim/i.test(detail), detail.slice(0,120));

 console.log('\n=== I1b. SISIP NAMA DI POSISI KURSOR ===');
 await p.click('.tab-btn[data-tab=baru]'); await p.waitForTimeout(600);
 /* chip {nama} harus tersedia bahkan sebelum kontak diunggah */
 await p.evaluate(()=>{ S.kontak=null; chipKolom(); });
 await p.waitForTimeout(300);
 const chipAwal=await p.evaluate(()=>({
   ada:!!document.querySelector('#chipKolom .chip-nama'),
   teks:(document.querySelector('#chipKolom .chip-nama')||{}).textContent||'',
   jumlah:document.querySelectorAll('#chipKolom .chip').length
 }));
 cek('chip {nama} tersedia walau kontak belum diunggah', chipAwal.ada && chipAwal.teks==='{nama}', chipAwal);

 /* muat kontak dengan judul kolom BUKAN "nama" */
 await p.fill('#tempel','telepon;Nama Donatur;nominal\n08170001001;Rahmat Hidayat;200.000\n08170001002;Sari Wulandari;350.000');
 await p.click('#prosesTempel'); await p.waitForTimeout(1700);
 const baca=await p.evaluate(()=>({
   ringkas:document.getElementById('ringkasKontak').innerText,
   chip:[...document.querySelectorAll('#chipKolom .chip')].map(x=>x.textContent)
 }));
 cek('kolom nama dikenali walau judulnya "Nama Donatur"', /Nama Donatur/.test(baca.ringkas), baca.ringkas.slice(0,140));
 cek('nama kontaknya ikut terbaca dan ditampilkan', /Rahmat Hidayat/.test(baca.ringkas) && /Sari Wulandari/.test(baca.ringkas), baca.ringkas.slice(0,200));
 cek('chip {nama} tetap satu, tidak dobel dengan kolom aslinya',
   baca.chip.filter(x=>x==='{nama}').length===1, baca.chip);
 cek('kolom lain ikut jadi chip', baca.chip.indexOf('{nominal}')>=0, baca.chip);

 /* sisipkan TEPAT di tengah kalimat, bukan di ujung */
 await p.fill('#isiPesan','Assalamualaikum , terima kasih. Balas STOP untuk berhenti.');
 await p.evaluate(()=>{ const ta=document.getElementById('isiPesan');
   const pos='Assalamualaikum '.length; ta.focus(); ta.setSelectionRange(pos,pos);
   ta.dispatchEvent(new Event('click')); });
 await p.waitForTimeout(250);
 await p.click('#chipKolom .chip-nama'); await p.waitForTimeout(600);
 const hasil=await p.evaluate(()=>({
   teks:document.getElementById('isiPesan').value,
   kursor:document.getElementById('isiPesan').selectionStart,
   pra:document.getElementById('pra').textContent
 }));
 cek('placeholder masuk di posisi kursor, bukan di akhir',
   hasil.teks==='Assalamualaikum {nama}, terima kasih. Balas STOP untuk berhenti.', hasil.teks);
 cek('kursor pindah ke belakang sisipan', hasil.kursor==='Assalamualaikum {nama}'.length, hasil.kursor);
 cek('pratinjau langsung memakai nama sungguhan', /Assalamualaikum Rahmat Hidayat,/.test(hasil.pra), hasil.pra.slice(0,80));

 /* sisip di awal teks — dulu selalu meleset ke akhir karena posisi 0 dianggap kosong */
 await p.fill('#isiPesan','apa kabar?');
 await p.evaluate(()=>{ const ta=document.getElementById('isiPesan'); ta.focus(); ta.setSelectionRange(0,0); ta.dispatchEvent(new Event('click')); });
 await p.waitForTimeout(250);
 await p.click('#chipKolom .chip-nama'); await p.waitForTimeout(500);
 cek('sisip di posisi paling awal juga tepat',
   await p.evaluate(()=>document.getElementById('isiPesan').value==='{nama}apa kabar?'),
   await p.evaluate(()=>document.getElementById('isiPesan').value));

 /* menimpa teks yang sedang disorot */
 await p.fill('#isiPesan','Halo SIAPA di sana');
 await p.evaluate(()=>{ const ta=document.getElementById('isiPesan'); ta.focus(); ta.setSelectionRange(5,10); ta.dispatchEvent(new Event('select')); });
 await p.waitForTimeout(250);
 await p.click('#chipKolom .chip-nama'); await p.waitForTimeout(500);
 cek('teks yang disorot diganti placeholder',
   await p.evaluate(()=>document.getElementById('isiPesan').value==='Halo {nama} di sana'),
   await p.evaluate(()=>document.getElementById('isiPesan').value));

 /* kirim sungguhan: {nama} harus terisi walau kolomnya "Nama Donatur" */
 await p.fill('#isiPesan','Assalamualaikum {nama}, laporan sudah terbit. Balas STOP untuk berhenti.');
 await p.fill('#namaKampanye','Uji Sapaan Nama');
 await p.waitForTimeout(900);
 await p.click('#kirim'); await p.waitForTimeout(600);
 await p.evaluate(()=>[...document.querySelectorAll('#modalFoot .btn')].find(b=>/kirim/i.test(b.textContent)).click());
 await p.waitForTimeout(3000);
 const kirimNama=await p.evaluate(()=>document.getElementById('detail').innerText);
 cek('kampanye dengan sapaan terkirim', /Uji Sapaan Nama/.test(kirimNama), kirimNama.slice(0,100));

 console.log('\n=== I2. DAFTAR KONTAK TERSIMPAN ===');
 await p.click('.tab-btn[data-tab=baru]'); await p.waitForTimeout(700);
 await p.fill('#tempel','telepon;nama\n08130002001;Dedi\n08130002002;Eka');
 await p.click('#prosesTempel'); await p.waitForTimeout(1600);
 cek('tombol Simpan ke Daftar Kontak muncul setelah kontak diproses',
   await p.evaluate(()=>!document.getElementById('aksiDaftar').hidden));
 await p.click('#simpanKeDaftar'); await p.waitForTimeout(700);
 const modalDk=await p.evaluate(()=>({judul:(document.getElementById('modalTitle')||{}).textContent||'',
   adaInput:!!document.getElementById('dkNama'), isi:(document.getElementById('dkNama')||{}).value||''}));
 cek('memakai modal halaman sendiri, bukan prompt() bawaan browser',
   /simpan daftar kontak/i.test(modalDk.judul) && modalDk.adaInput, modalDk);
 await p.fill('#dkNama','Donatur Rutin Uji');
 await p.fill('#dkDesc','hasil rekap uji');
 await p.evaluate(()=>[...document.querySelectorAll('#modalFoot .btn')].find(b=>/simpan/i.test(b.textContent)).click());
 await p.waitForTimeout(1800);
 await p.click('.tab-btn[data-tab=daftar]'); await p.waitForTimeout(1600);
 const kartuDk=await p.evaluate(()=>{
   const c=[...document.querySelectorAll('.dk-card')];
   return {n:c.length, teks:c.map(x=>x.innerText.replace(/\s+/g,' ')).join(' | ')};
 });
 cek('daftar tersimpan muncul sebagai kartu', kartuDk.n===1, kartuDk);
 cek('nama, keterangan dan jumlah kontak tercatat',
   /Donatur Rutin Uji/.test(kartuDk.teks) && /hasil rekap uji/.test(kartuDk.teks) && /2 kontak/.test(kartuDk.teks), kartuDk.teks);
 await p.evaluate(()=>document.querySelector('[data-pakai]').click());
 await p.waitForTimeout(1600);
 const dipakai=await p.evaluate(()=>({tab:!document.querySelector('[data-panel=baru]').hidden,
   ringkas:document.getElementById('ringkasKontak').innerText.replace(/\s+/g,' '),
   simpanTersembunyi:document.getElementById('aksiDaftar').hidden}));
 cek('tombol Pakai memuat kontaknya dan kembali ke tab Broadcast Baru',
   dipakai.tab && /Donatur Rutin Uji/.test(dipakai.ringkas), dipakai);
 cek('daftar yang sudah tersimpan tidak menawarkan disimpan ulang', dipakai.simpanTersembunyi===true, dipakai);
 cek('dropdown daftar tersimpan ikut terisi',
   await p.evaluate(()=>document.querySelectorAll('#pilihDaftar option').length===2));

 console.log('\n=== I3. RIWAYAT: 3 BARIS, SISANYA DIGULUNG ===');
 /* buat beberapa kampanye supaya daftarnya lebih dari tiga baris */
 for(let k=0;k<4;k++){
   await p.click('.tab-btn[data-tab=baru]'); await p.waitForTimeout(500);
   await p.fill('#namaKampanye','Kampanye Gulung '+(k+1));
   await p.fill('#tempel','telepon;nama\n0814000'+k+'001;Uji'+k);
   await p.click('#prosesTempel'); await p.waitForTimeout(1400);
   await p.click('#kirim'); await p.waitForTimeout(500);
   await p.evaluate(()=>[...document.querySelectorAll('#modalFoot .btn')].find(b=>/kirim/i.test(b.textContent)).click());
   await p.waitForTimeout(2600);
 }
 await p.click('.tab-btn[data-tab=riwayat]'); await p.waitForTimeout(2200);
 const gul=await p.evaluate(()=>{
   const kotak=document.querySelector('.riwayat-gulung');
   const baris=[...kotak.querySelectorAll('tbody tr')];
   const kepala=kotak.querySelector('thead');
   const tinggi3=Math.ceil(kepala.getBoundingClientRect().height
     + baris.slice(0,3).reduce((a,b)=>a+b.getBoundingClientRect().height,0));
   return {jumlahBaris:baris.length, tinggiKotak:Math.round(kotak.getBoundingClientRect().height),
           tinggi3:tinggi3, bisaGulung:kotak.scrollHeight>kotak.clientHeight+2,
           gaya:getComputedStyle(kotak).overflowY};
 });
 cek('riwayatnya memang lebih dari 3 baris', gul.jumlahBaris>3, gul);
 cek('kotak riwayat dipatok setinggi 3 baris', Math.abs(gul.tinggiKotak-gul.tinggi3)<=4, gul);
 cek('sisanya bisa digulung', gul.bisaGulung && gul.gaya==='auto', gul);
 const lengket=await p.evaluate(()=>{
   const kotak=document.querySelector('.riwayat-gulung');
   const th=kotak.querySelector('thead th');
   kotak.scrollTop=200;
   return {pos:getComputedStyle(th).position, atas:Math.round(th.getBoundingClientRect().top-kotak.getBoundingClientRect().top)};
 });
 cek('kepala tabel tetap lengket saat digulung', lengket.pos==='sticky' && Math.abs(lengket.atas)<=2, lengket);
 await p.evaluate(()=>{document.querySelector('.riwayat-gulung').scrollTop=0;});
 /* kartu rincian harus terlihat tanpa menggulung halaman jauh */
 await p.evaluate(()=>document.querySelector('[data-buka]').click());
 await p.waitForTimeout(1800);
 const rinci=await p.evaluate(()=>{
   const d=document.getElementById('detail');
   return {tampil:!d.hidden, atas:Math.round(d.getBoundingClientRect().top), layar:window.innerHeight};
 });
 cek('kartu rincian muncul di dalam layar, bukan jauh di bawah',
   rinci.tampil && rinci.atas < rinci.layar, rinci);

 console.log('\n=== I4. CENTANG & BALASAN ===');
 const tanda=await p.evaluate(()=>{
   const b=[...document.querySelectorAll('#tabelPenerima tr')];
   const w=b[0]&&b[0].querySelector('.ck-wrap');
   return {baris:b.length, adaWrap:!!w, kelas:w?w.className:'', judul:w?w.getAttribute('title'):'',
           svg:w?w.querySelectorAll('svg path').length:0,
           adaKataDilewati:document.getElementById('detail').innerText.toLowerCase().indexOf('dilewati')>=0,
           ubin:[...document.querySelectorAll('.bc-tile .l')].map(x=>x.textContent)};
 });
 cek('status penerima digambar sebagai centang, bukan kata', tanda.adaWrap, tanda);
 cek('terkirim = satu centang', /ck-abu/.test(tanda.kelas) && tanda.svg===1, tanda);
 cek('centangnya punya keterangan saat disentuh kursor', /belum sampai/i.test(tanda.judul||''), tanda.judul);
 cek('ubin "Dilewati" sudah tidak ada', tanda.ubin.indexOf('Dilewati')<0, tanda.ubin);
 cek('ubin "Dibalas" menggantikannya', tanda.ubin.indexOf('Dibalas')>=0, tanda.ubin);
 cek('kata "dilewati" tidak lagi muncul di rincian', tanda.adaKataDilewati===false, tanda);

 /* kirim balasan lewat webhook, lalu pastikan tampil di tabel */
 const nomorBls=await p.evaluate(()=>document.querySelector('#tabelPenerima td.kode').textContent.trim());
 const kunciWh='rahasia-ui-'+Date.now();
 await p.evaluate(async(k)=>{await fetch('/api/wa',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({aksi:'setelan-simpan',token:localStorage.getItem('laz_token'),webhookSecret:k})});},kunciWh);
 await p.evaluate(async({k,n})=>{await fetch('/api/wa-webhook?kunci='+encodeURIComponent(k),{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({sender:n,message:'Waalaikumsalam, terima kasih infonya'})});},{k:kunciWh,n:nomorBls});
 await p.waitForTimeout(600);
 await p.evaluate(()=>muatPenerima()); await p.waitForTimeout(1500);
 const bls=await p.evaluate(()=>{
   const tr=document.querySelector('#tabelPenerima tr');
   const w=tr.querySelector('.ck-wrap');
   return {kelas:w?w.className:'', svg:w?w.querySelectorAll('svg path').length:0,
           balasan:(tr.querySelector('.bls')||{}).textContent||'',
           teks:(tr.querySelector('.bls-teks')||{}).textContent||''};
 });
 cek('setelah dibalas, centangnya jadi dua & biru', /ck-biru/.test(bls.kelas) && bls.svg===2, bls);
 cek('kolom balasan menandai sudah dibalas', /dibalas/i.test(bls.balasan), bls);
 cek('isi balasannya ikut ditampilkan', /terima kasih infonya/i.test(bls.teks), bls);
 await p.evaluate(()=>muatKampanye()); await p.waitForTimeout(1500);
 cek('jumlah balasan muncul di daftar kampanye',
   await p.evaluate(()=>document.getElementById('tabelKampanye').innerText.length>0
     && !!document.querySelector('#tabelKampanye .bls')));

 console.log('\n=== J. GERBANG IZIN SAAT URL DIBUKA LANGSUNG ===');
 const p2=await b.newPage({viewport:{width:1280,height:900}});
 await p2.goto(asal+'/index.html');
 await p2.waitForSelector('#loginView:not(.hidden)',{timeout:10000});
 await p2.fill('#lUser','staf1'); await p2.fill('#lPass','Staf1#2026'); await p2.click('#loginBtn');
 await p2.waitForSelector('#appView:not(.hidden)',{timeout:10000}); await p2.waitForTimeout(1000);
 cek('staf tanpa izin tidak melihat menu broadcast',
   await p2.evaluate(()=>!document.getElementById('nav_broadcast')));
 await p2.goto(asal+'/broadcast.html'); await p2.waitForTimeout(2200);
 const tolak=await p2.evaluate(()=>({judul:(document.getElementById('modalTitle')||{}).textContent||'',
   appTampil:!document.getElementById('appView').classList.contains('hidden')}));
 cek('URL langsung ditolak dengan pemberitahuan, bukan halaman penuh galat',
   /tidak punya akses/i.test(tolak.judul) && !tolak.appTampil, tolak);
 await p2.evaluate(()=>[...document.querySelectorAll('#modalFoot .btn')][0].click());
 await p2.waitForTimeout(1500);
 cek('lalu dikembalikan ke halaman utama', p2.url().indexOf('broadcast.html')<0, p2.url());
 await p2.close();

 console.log('\n=== K. BEBAS EMOJI & RAPI DI HP ===');
 const emoji=await p.evaluate(({re})=>{
   const rx=new RegExp(re,'gu'); const found=[];
   /* isi <script>/<style> bukan teks yang dilihat pengguna — jangan ikut disisir */
   const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
     return /^(script|style|template)$/i.test(n.parentNode&&n.parentNode.nodeName||'')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}}); let n;
   while((n=w.nextNode())){const m=String(n.nodeValue||'').match(rx); if(m) found.push(m.join('')+' « '+String(n.nodeValue).trim().slice(0,40));}
   return found;
 },{re:RE_EMOJI});
 cek('tidak ada emoji berwarna di halaman', emoji.length===0, emoji);
 for(const t of ['baru','riwayat','setelan']){
   await p.click('.tab-btn[data-tab='+t+']'); await p.waitForTimeout(800);
   await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(600);
   const l=await p.evaluate(()=>({doc:document.documentElement.scrollWidth,win:window.innerWidth}));
   cek('tab '+t+' tidak melebar di HP', l.doc<=l.win+2, l);
   await p.setViewportSize({width:1440,height:1000}); await p.waitForTimeout(400);
 }
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(600);
 await p.click('.tab-btn[data-tab=baru]'); await p.waitForTimeout(700);
 const kolomHp=await p.evaluate(()=>getComputedStyle(document.querySelector('.bc-kerja')).gridTemplateColumns.split(' ').length);
 cek('papan kerja menumpuk jadi satu kolom di HP', kolomHp===1, kolomHp);
 await p.setViewportSize({width:1440,height:1000});

 cek('tidak ada galat JavaScript sepanjang uji', errs.length===0, errs.slice(0,4));
 console.log('\ntest_broadcast_ui.js  '+ok+'/'+(ok+g)+(g?'  ADA GAGAL':'  SEMUA LULUS'));
 await b.close(); srv.kill(); process.exit(g?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
