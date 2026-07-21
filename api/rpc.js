// LAZ Digital — RPC handler. Storage: Upstash Redis REST API + /tmp cache
const engine = require('./_engine.js');
const fs = require('fs');

const TMP   = '/tmp/laz-db-cache.json';
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const DB_KEY = 'laz:db';

function ver(db){ return (db && db.props && Number(db.props._ver)) || 0; }

/* ─── /tmp helpers ─── */
function readTmp(){
  try{ if(fs.existsSync(TMP)) return JSON.parse(fs.readFileSync(TMP,'utf8')); }catch(e){}
  return null;
}
function writeTmp(db){
  try{ fs.writeFileSync(TMP, JSON.stringify(db)); }catch(e){}
}

/* ─── Upstash Redis REST helpers ─── */
async function redisGet(){
  if(!REDIS_URL || !REDIS_TOKEN) return null;
  try{
    const res = await fetch(`${REDIS_URL}/get/${DB_KEY}`,{
      headers:{ Authorization:`Bearer ${REDIS_TOKEN}` },
      cache:'no-store'
    });
    const j = await res.json();
    if(j && j.result) return JSON.parse(j.result);
  }catch(e){ console.error('redis get', e && e.message); }
  return null;
}

async function redisSet(db){
  if(!REDIS_URL || !REDIS_TOKEN) return;
  try{
    await fetch(REDIS_URL,{
      method:'POST',
      headers:{ Authorization:`Bearer ${REDIS_TOKEN}`, 'Content-Type':'application/json' },
      body: JSON.stringify(['SET', DB_KEY, JSON.stringify(db)])
    });
  }catch(e){ console.error('redis set', e && e.message); }
}

/* ─── load / save ─── */
async function loadDB(){
  const tmp   = readTmp();
  const redis = await redisGet();
  let db;
  if(tmp && redis)      db = ver(tmp) >= ver(redis) ? tmp : redis;
  else                  db = tmp || redis || { sheets:{}, props:{} };
  return db;
}

async function saveDB(db){
  if(!db.props) db.props = {};
  db.props._ver = ver(db) + 1;
  writeTmp(db);
  await redisSet(db);
}

/* ─── HTTP handler ─── */
module.exports = async (req, res) => {
  if(req.method !== 'POST'){ res.status(405).json({ __error:'Method not allowed' }); return; }
  try{
    let body = req.body;
    if(typeof body === 'string') body = JSON.parse(body || '{}');
    body = body || {};
    const fn   = body.fn,  args = body.args || [];
    const db   = await loadDB();
    const out  = await engine.runRPC(db, fn, args);
    await saveDB(out.db);
    res.status(200).json({ result: out.result });
  }catch(err){
    res.status(200).json({ __error: (err && err.message) || String(err) });
  }
};
