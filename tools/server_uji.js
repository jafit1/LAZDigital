/* Server lokal kecil untuk menguji halaman publik: melayani berkas statis
   dan meneruskan /api/rpc ke engine memakai basis data di memori. */
const http=require('http'), fs=require('fs'), path=require('path');
const engine=require('./_engine.js');
let DB=JSON.parse(fs.readFileSync(process.env.DBFILE||'db-publik.json','utf8'));
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};

/* ---- jembatan ke endpoint gaya Vercel (api/wa.js, api/wa-dispatch.js) ----
   Keduanya membaca basis data lembaga lewat rpc._internal.muat(), yang di sini
   membaca berkas data/laz-db-local.json. Jadi setiap perubahan DB di memori
   dicerminkan ke berkas itu supaya token login terlihat oleh /api/wa. */
const DBLOKAL=path.join(process.cwd(),'data','laz-db-local.json');
function cerminkanDB(){
  try{ fs.mkdirSync(path.dirname(DBLOKAL),{recursive:true}); fs.writeFileSync(DBLOKAL,JSON.stringify(DB)); }catch(e){}
  try{ fs.writeFileSync('/tmp/laz-db-cache.json',JSON.stringify(DB)); }catch(e){}
}
cerminkanDB();
function bacaBadan(req){ return new Promise(r=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>r(b)); }); }
async function lewatkan(handler, req, res, badan){
  try{ req.body = badan ? JSON.parse(badan) : {}; }catch(e){ req.body={}; }
  res.status=function(c){ this.statusCode=c; return this; };
  res.json=function(o){ this.setHeader('Content-Type','application/json'); this.end(JSON.stringify(o)); };
  try{ await handler(req,res); }
  catch(e){ if(!res.writableEnded){ res.statusCode=500; res.end(JSON.stringify({__error:String(e&&e.message||e)})); } }
}

const srv=http.createServer(async (req,res)=>{
  if(req.url.startsWith('/api/wa-dispatch')){
    const b=await bacaBadan(req); return lewatkan(require('./wa-dispatch.js'), req, res, b);
  }
  if(req.url.startsWith('/api/wa-webhook')){
    const b=await bacaBadan(req); return lewatkan(require('./wa-webhook.js'), req, res, b);
  }
  if(req.url.startsWith('/api/wa')){
    const b=await bacaBadan(req); return lewatkan(require('./wa.js'), req, res, b);
  }
  if(req.url.startsWith('/api/rpc')&&req.method==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',async()=>{
      try{
        const {fn,args}=JSON.parse(b||'{}');
        const out=await engine.runRPC(DB,fn,args||[],{ip:'127.0.0.1',ua:req.headers['user-agent']||''});
        DB=out.db; cerminkanDB();
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({result:out.result}));
      }catch(e){ res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({__error:e.message})); }
    });
    return;
  }
  if(req.url.startsWith('/api/backup')&&req.method==='POST'){
    let b=''; req.on('data',c=>b+=c);
    req.on('end',()=>{
      const {aksi}=JSON.parse(b||'{}');
      const stub={
        daftar:{ salinan:[{nama:'harian-2026-09-05',waktu:'2026-09-05T19:00:00Z',ukuran:120000},{nama:'sebelum-pulih',waktu:'2026-09-04T10:00:00Z',ukuran:118000}],
                 drive:[{id:'f1',name:'laz-cadangan-2026-09-05_0200.json',size:'120000',createdTime:'2026-09-05T19:00:05Z'}],
                 driveSiap:true, driveGalat:'', cronSiap:true, tempat:'Redis',
                 status:{waktu:'2026-09-05T19:00:00Z',jenis:'harian',oleh:'cron',nama:'harian-2026-09-05',redis:{ok:true},drive:{ok:true},peringatan:[]},
                 ukuranDB:300000, batasPeringatan:819200 },
        cadangkan:{ jenis:'manual', oleh:'superadmin', nama:'manual-2026-09-06_1030', redis:{ok:true}, drive:{ok:true}, peringatan:[] },
        ambil:{ nama:'harian-2026-09-05', isi:'{"sheets":{}}' },
        pulihkan:{ ok:true, diganti:['Penghimpunan (1)'] }
      };
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({result:stub[aksi]||{}}));
    });
    return;
  }
  let f=req.url.split('?')[0]; if(f==='/')f='/index.html';
  const p=path.join(__dirname,f);
  if(fs.existsSync(p)&&fs.statSync(p).isFile()){
    res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'text/plain'});
    res.end(fs.readFileSync(p));
  } else { res.writeHead(404);res.end('nope'); }
});
const PORT=Number(process.env.PORT||8123);
srv.listen(PORT,()=>console.log('siap di '+PORT));
module.exports={srv};
