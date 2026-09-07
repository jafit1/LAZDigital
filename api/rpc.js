const engine = require('./_engine.js');
const fs = require('fs');
const path = require('path');

/* ============================================================
   PENYIMPANAN
   Di Vercel, Redis (Upstash) adalah SATU-SATUNYA sumber kebenaran.
   Berkas lokal hanya dipakai saat menjalankan aplikasi di komputer
   sendiri tanpa Redis (server.js).

   Versi lama menyimpan salinan di /tmp dan memilih mana yang versinya
   lebih besar. Karena tiap instance Vercel punya /tmp sendiri, kalau
   satu penulisan ke Redis gagal diam-diam, instance itu terus memakai
   salinannya sendiri sementara instance lain memakai Redis — datanya
   bercabang tanpa ada yang tahu. Salinan /tmp dihapus.
   ============================================================ */
const LOCAL_DB_DIR  = path.join(process.cwd(), 'data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'laz-db-local.json');
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const PAKAI_REDIS = !!(REDIS_URL && REDIS_TOKEN);
const DB_KEY  = 'laz:db';
const VER_KEY = 'laz:ver';
const MAKS_ULANG = 4;            /* percobaan ulang bila bentrok dengan pengguna lain */

/* ─── berkas lokal (mode tanpa Redis) ─── */
function bacaLokal(){
  try { if (fs.existsSync(LOCAL_DB_FILE)) return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8')); } catch (e) {}
  return null;
}
function tulisLokal(db){
  if (!fs.existsSync(LOCAL_DB_DIR)) fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(db, null, 2));
}

/* ─── Upstash Redis lewat REST ───
   Setiap balasan diperiksa: HTTP bukan 2xx atau ada field "error" berarti
   GAGAL dan dilempar sebagai galat. Versi lama menelan semuanya, sehingga
   petugas melihat "tersimpan" padahal tidak. */
async function redis(cmd){
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store'
  });
  let j = null;
  try { j = await res.json(); } catch (e) {}
  if (!res.ok || !j || j.error) {
    throw new Error('Penyimpanan gagal (Redis ' + (j && j.error ? j.error : 'HTTP ' + res.status) + ')');
  }
  return j.result;
}

/* Skrip Lua: tulis HANYA bila versi di Redis masih sama dengan yang dibaca.
   Kalau tidak sama, ada pengguna lain yang menulis lebih dulu — kembalikan 0
   supaya pemanggil mengulang dari data terbaru, bukan menimpanya. */
const LUA_TULIS_BILA_VERSI_SAMA =
  "local cur = redis.call('GET', KEYS[2]) " +
  "if (cur == false and ARGV[1] == '0') or cur == ARGV[1] then " +
  "  redis.call('SET', KEYS[1], ARGV[2]) " +
  "  redis.call('SET', KEYS[2], ARGV[3]) " +
  "  return 1 " +
  "end " +
  "return 0";

async function bacaRedis(){
  const r = await redis(['MGET', DB_KEY, VER_KEY]);
  const teks = r && r[0];
  const ver  = (r && r[1]) ? String(r[1]) : '0';
  let db = null;
  if (teks) { try { db = JSON.parse(teks); } catch (e) { throw new Error('Data di Redis rusak, tidak bisa dibaca.'); } }
  return { db: db, teks: teks || '', ver: ver };
}

async function tulisRedis(db, verLama){
  const teks = JSON.stringify(db);
  const verBaru = String(Number(verLama) + 1);
  const hasil = await redis(['EVAL', LUA_TULIS_BILA_VERSI_SAMA, '2', DB_KEY, VER_KEY, verLama, teks, verBaru]);
  return Number(hasil) === 1;
}

/* ─── muat & simpan ─── */
function dbKosong(){ return { sheets: {}, props: {} }; }

async function muat(){
  if (!PAKAI_REDIS) {
    const db = bacaLokal() || dbKosong();
    return { db: db, teks: JSON.stringify(db), ver: '0' };
  }
  const r = await bacaRedis();
  if (!r.db) return { db: dbKosong(), teks: '', ver: r.ver };
  return r;
}

/* Basis data yang masih kosong (baru pertama kali dipasang) diisi lewat
   setup(), lalu langsung disimpan supaya pemasangan awal tidak terulang. */
async function pastikanTerpasang(){
  const r = await muat();
  const perluSetup = !r.db.sheets || !r.db.sheets.Users || r.db.sheets.Users.length <= 1;
  if (!perluSetup) return r;
  const out = await engine.runRPC(r.db, 'setup', [], {});
  if (!PAKAI_REDIS) { tulisLokal(out.db); return { db: out.db, teks: JSON.stringify(out.db), ver: '0' }; }
  const ok = await tulisRedis(out.db, r.ver);
  if (!ok) return muat();               /* instance lain keburu memasang; pakai miliknya */
  return { db: out.db, teks: JSON.stringify(out.db), ver: String(Number(r.ver) + 1) };
}

function ver(db){ return (db && db.props && Number(db.props._ver)) || 0; }

/* ─── HTTP handler ─── */
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ __error: 'Method not allowed' }); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    body = body || {};
    const fn = body.fn, args = body.args || [];
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ctx = {
      ip: fwd || (req.socket && req.socket.remoteAddress) || '',
      ua: String(req.headers['user-agent'] || '').slice(0, 160)
    };

    for (let percobaan = 1; percobaan <= MAKS_ULANG; percobaan++) {
      const r = await pastikanTerpasang();
      /* Beberapa fungsi mengubah objek argumennya (mis. mengisi d.id). Kalau
         percobaan diulang dengan objek yang sama, simpan-baru berubah jadi
         edit dan datanya hilang. Setiap percobaan memakai salinan segar. */
      const argsSalinan = JSON.parse(JSON.stringify(args));
      const out = await engine.runRPC(r.db, fn, argsSalinan, ctx);
      if (!out.db.props) out.db.props = {};

      /* Permintaan yang tidak mengubah apa-apa (mis. membuka dashboard) tidak
         perlu menulis ulang seluruh basis data — hemat kuota dan mengurangi
         peluang bentrok. Dibandingkan SEBELUM _ver dinaikkan. */
      const tanpaPerubahan = JSON.stringify(out.db) === r.teks;
      if (tanpaPerubahan) { res.status(200).json({ result: out.result }); return; }

      out.db.props._ver = ver(out.db) + 1;

      if (!PAKAI_REDIS) { tulisLokal(out.db); res.status(200).json({ result: out.result }); return; }

      const tersimpan = await tulisRedis(out.db, r.ver);
      if (tersimpan) { res.status(200).json({ result: out.result }); return; }

      /* Bentrok: pengguna lain menulis di antara baca dan tulis kita.
         Ulangi dari data terbaru agar perubahan mereka tidak tertimpa. */
      await new Promise(t => setTimeout(t, 60 * percobaan));
    }
    res.status(200).json({ __error: 'Data sedang diubah pengguna lain. Silakan ulangi.' });
  } catch (err) {
    res.status(200).json({ __error: (err && err.message) || String(err) });
  }
};

/* Dipakai api/backup.js dan pengujian. */
module.exports._internal = { muat, tulisRedis, redis, PAKAI_REDIS, DB_KEY, VER_KEY };
