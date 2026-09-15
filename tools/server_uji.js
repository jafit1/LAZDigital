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

/* ---- AI vision tiruan untuk menguji /api/ocr ----
   Kunci palsu diisikan lewat env sebelum ocr.js dimuat, dan fetch ke penyedia
   dibelokkan ke jawaban yang diatur uji lewat POST /uji/ocr. Tidak ada
   permintaan keluar, tidak ada kuota terpakai. */
let OCR_JAWAB={ status:200, isi:{} };   /* jawaban bawaan untuk semua model */
let OCR_PER_MODEL={};                   /* {namaModel:{status,isi,tunda}} */
if(process.env.OCR_PALSU==='1'){
  process.env.OCR_API_KEY=process.env.OCR_API_KEY||'kunci-uji-lokal';
  const fetchAsli=global.fetch;
  global.fetch=async function(u,o){
    const s=String(u);
    if(s.indexOf('generativelanguage.googleapis.com')>=0 || s.indexOf('api.openai.com')>=0){
      const cocok=s.match(/models\/([^:?]+)/);
      const model=cocok?decodeURIComponent(cocok[1]):'';
      const j=OCR_PER_MODEL[model]||OCR_JAWAB;
      if(j.tunda) await new Promise(t=>setTimeout(t,j.tunda));
      let badan;
      if(j.status>=200&&j.status<300){
        badan={ candidates:[{content:{parts:[{text:JSON.stringify(j.isi||{})}]}}] };
      } else if(j.status===429){
        /* bentuk galat kuota HARIAN Gemini, supaya jalur istirahat ikut diuji */
        badan={ error:{ code:429, message:'Resource has been exhausted',
          details:[{ '@type':'type.googleapis.com/google.rpc.QuotaFailure',
            violations:[{ quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
      } else {
        badan={ error:{ message:'tiruan galat '+j.status } };
      }
      return { ok:j.status>=200&&j.status<300, status:j.status, json:async()=>badan };
    }
    return fetchAsli.apply(this,arguments);
  };
}

const srv=http.createServer(async (req,res)=>{
  if(req.url.startsWith('/uji/ocr')&&req.method==='POST'){
    const b=await bacaBadan(req);
    try{
      const p=JSON.parse(b||'{}');
      OCR_PER_MODEL=p.perModel||{};
      delete p.perModel;
      OCR_JAWAB=Object.assign({status:200,isi:{}},p);
      /* uji boleh meminta ingatan istirahat model dilupakan */
      if(p.lupakan){ try{ require('./ocr.js')._internal.lupakanIstirahat(); }catch(e){} }
    }catch(e){}
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,OCR_JAWAB,OCR_PER_MODEL}));
    return;
  }
  if(req.url.startsWith('/api/ocr')){
    const b=await bacaBadan(req); return lewatkan(require('./ocr.js'), req, res, b);
  }
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
