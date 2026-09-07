/* ============================================================
   DAPATKAN REFRESH TOKEN GOOGLE DRIVE — dijalankan SEKALI di komputer Anda.

   Cara pakai:
     node tools/dapatkan-token-drive.js <CLIENT_ID> <CLIENT_SECRET>

   Skrip membuka halaman izin Google di peramban, menangkap kode balasannya
   lewat server kecil di http://localhost:8765, lalu mencetak refresh token
   yang harus Anda salin ke Vercel sebagai GDRIVE_REFRESH_TOKEN.

   Izin yang diminta hanya `drive.file`: aplikasi cuma bisa melihat berkas
   yang ia buat sendiri, tidak bisa membaca berkas Drive Anda yang lain.
   ============================================================ */
const http = require('http');
const { exec } = require('child_process');

const [,, CLIENT_ID, CLIENT_SECRET] = process.argv;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Pemakaian: node tools/dapatkan-token-drive.js <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}
const PORT = 8765;
const REDIRECT = 'http://localhost:' + PORT + '/';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE,
  access_type: 'offline', prompt: 'consent'          /* prompt=consent memastikan refresh_token dikirim */
}).toString();

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  if (!code) { res.writeHead(400); res.end('Tidak ada kode.'); return; }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code' }).toString()
    });
    const j = await r.json();
    if (!j.refresh_token) throw new Error(JSON.stringify(j));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Berhasil.</h2><p>Kembali ke terminal untuk menyalin refresh token. Tab ini boleh ditutup.</p>');
    console.log('\n================ SALIN INI KE VERCEL ================');
    console.log('GDRIVE_CLIENT_ID     = ' + CLIENT_ID);
    console.log('GDRIVE_CLIENT_SECRET = ' + CLIENT_SECRET);
    console.log('GDRIVE_REFRESH_TOKEN = ' + j.refresh_token);
    console.log('=====================================================');
    console.log('Lalu isi GDRIVE_FOLDER_ID dengan ID folder Drive tujuan (lihat PANDUAN-CADANGAN.md).\n');
  } catch (e) {
    res.writeHead(500); res.end('Gagal: ' + e.message);
    console.error('Gagal menukar kode:', e.message);
  }
  setTimeout(() => process.exit(0), 500);
});

srv.listen(PORT, () => {
  console.log('Membuka halaman izin Google di peramban...\nKalau tidak terbuka sendiri, buka tautan ini:\n\n' + url + '\n');
  const cmd = process.platform === 'win32' ? 'start "" "' + url + '"' : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
  exec(cmd, () => {});
});
