/* Sisir semua halaman di tiga ukuran layar, laporkan yang meluber. */
const {chromium}=require('/opt/node-tools/node_modules/playwright');
const {spawn}=require('child_process');
const PORT=8215;
const UKURAN=[{n:'HP 390',w:390,h:844},{n:'Tablet 820',w:820,h:1180},{n:'Laptop 1440',w:1440,h:900}];
const HAL=['dashboard','penghimpunan','pentasyarufan','saldo','kll','donatur','laporan','users','settings','log'];
(async()=>{
 const srv=spawn(process.execPath,['server_uji.js'],{env:Object.assign({},process.env,{PORT:String(PORT),DBFILE:'db-kll2-uji.json',SETUP_ADMIN_PASSWORD:'uji12345'}),stdio:'ignore'});
 await new Promise(r=>setTimeout(r,2500));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1440,height:900}});
 const A='http://localhost:'+PORT;
 await p.goto(A+'/index.html'); await p.waitForSelector('#loginView:not(.hidden)');
 await p.fill('#lUser','superadmin'); await p.fill('#lPass','uji12345'); await p.click('#loginBtn');
 await p.waitForSelector('#appView:not(.hidden)'); await p.waitForTimeout(1500);
 const temuan=[];
 for(const u of UKURAN){
   await p.setViewportSize({width:u.w,height:u.h}); await p.waitForTimeout(600);
   await p.mouse.move(u.w-10,u.h-10);
   for(const hal of HAL){
     await p.evaluate(x=>go(x),hal); await p.waitForTimeout(1500);
     const r=await p.evaluate(()=>{
       const doc=document.documentElement;
       const luber=doc.scrollWidth>window.innerWidth+2;
       // elemen yang keluar dari lebar layar
       const nakal=[];
       document.querySelectorAll('#content *').forEach(el=>{
         const b=el.getBoundingClientRect();
         if(b.width===0) return;
         if(b.right>window.innerWidth+2 || b.left<-2){
           const g=getComputedStyle(el);
           if(g.overflowX==='auto'||g.overflowX==='scroll') return;      // memang digulung
           let par=el.parentElement, digulung=false;
           while(par&&par!==document.body){const pg=getComputedStyle(par);
             if(pg.overflowX==='auto'||pg.overflowX==='scroll'){digulung=true;break;} par=par.parentElement;}
           if(digulung) return;
           nakal.push((el.tagName.toLowerCase()+'.'+(el.className||'').toString().split(' ').slice(0,2).join('.'))
             +' ['+Math.round(b.left)+'→'+Math.round(b.right)+']');
         }
       });
       return {luber, doc:doc.scrollWidth, win:window.innerWidth, nakal:[...new Set(nakal)].slice(0,6)};
     });
     if(r.luber||r.nakal.length) temuan.push({ukuran:u.n,hal,...r});
   }
 }
 console.log(JSON.stringify(temuan,null,1));
 console.log('TOTAL TEMUAN:',temuan.length);
 await b.close(); srv.kill(); process.exit(0);
})();
