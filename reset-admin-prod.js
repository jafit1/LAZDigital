/* Reset password superadmin di DATABASE PRODUKSI (Upstash Redis).
 *
 * Kredensial dibaca dari environment variable, tidak ditulis di file ini.
 * Cara pakai (PowerShell):
 *   $env:UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
 *   $env:UPSTASH_REDIS_REST_TOKEN="AX...."
 *   node reset-admin-prod.js Lazismu20m
 *
 * Cara pakai (Command Prompt):
 *   set UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *   set UPSTASH_REDIS_REST_TOKEN=AX....
 *   node reset-admin-prod.js Lazismu20m
 */
const crypto = require('crypto');

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NEWPW = process.argv[2];
const USERNAME = process.argv[3] || 'superadmin';
const DB_KEY = 'laz:db';

if (!URL_ || !TOKEN) {
  console.error('Set dulu UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN.');
  process.exit(1);
}
if (!NEWPW) {
  console.error('Pakai: node reset-admin-prod.js <password-baru> [username]');
  process.exit(1);
}

(async () => {
  // --- ambil database ---
  const res = await fetch(`${URL_}/get/${DB_KEY}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }, cache: 'no-store'
  });
  const j = await res.json();
  if (!j || !j.result) { console.error('Database tidak ditemukan di Redis. Cek URL/token.'); process.exit(1); }
  const db = JSON.parse(j.result);

  const rows = db.sheets && db.sheets.Users;
  if (!rows || rows.length < 2) { console.error('Sheet Users kosong.'); process.exit(1); }

  const head = rows[0];
  const iU = head.indexOf('username');
  const iH = head.indexOf('passwordHash');
  const iS = head.indexOf('salt');

  console.log('Daftar user di produksi:');
  for (let i = 1; i < rows.length; i++) {
    if (Array.isArray(rows[i])) console.log('  -', rows[i][iU]);
  }

  // --- ganti password ---
  let changed = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    if (String(r[iU]).toLowerCase() === String(USERNAME).toLowerCase()) {
      const salt = crypto.randomBytes(12).toString('hex');
      r[iS] = salt;
      r[iH] = crypto.scryptSync(String(NEWPW), salt, 64).toString('hex');
      changed++;
    }
  }
  if (!changed) { console.error(`\nUser "${USERNAME}" tidak ditemukan. Pakai salah satu nama di atas.`); process.exit(1); }

  // --- batalkan semua sesi login lama ---
  let sesi = 0;
  if (db.sheets.Sessions && db.sheets.Sessions.length > 1) {
    sesi = db.sheets.Sessions.length - 1;
    db.sheets.Sessions = [db.sheets.Sessions[0]];
  }

  db.props = db.props || {};
  db.props._ver = (Number(db.props._ver) || 0) + 1;

  // --- simpan balik ---
  const put = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', DB_KEY, JSON.stringify(db)])
  });
  const pj = await put.json();
  if (!pj || pj.error) { console.error('Gagal menyimpan:', pj && pj.error); process.exit(1); }

  console.log(`\nBERHASIL — password "${USERNAME}" diganti.`);
  console.log('Sesi login lama dibatalkan :', sesi);
  console.log('Versi database             :', db.props._ver);
  console.log('\nHapus file ini setelah dipakai, dan jangan pernah commit token ke Git.');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
