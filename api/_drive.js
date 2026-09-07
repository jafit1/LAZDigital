/* ============================================================
   GOOGLE DRIVE — unggah cadangan
   Memakai OAuth refresh token milik akun Google pengelola, BUKAN service
   account. Alasannya: service account tidak punya kuota penyimpanan Drive
   sendiri, sehingga unggahan ke folder My Drive pribadi ditolak dengan
   "storage quota exceeded". Refresh token bekerja untuk akun Gmail biasa.

   Cakupan izin yang diminta hanya `drive.file`: aplikasi cuma bisa melihat
   dan mengelola berkas yang ia buat sendiri — tidak bisa membaca isi Drive
   Anda yang lain.

   Env yang dibutuhkan (lihat PANDUAN-CADANGAN.md):
     GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN, GDRIVE_FOLDER_ID
   ============================================================ */
const ENV = () => ({
  id: process.env.GDRIVE_CLIENT_ID,
  secret: process.env.GDRIVE_CLIENT_SECRET,
  refresh: process.env.GDRIVE_REFRESH_TOKEN,
  folder: process.env.GDRIVE_FOLDER_ID
});

function driveSiap(){ const e = ENV(); return !!(e.id && e.secret && e.refresh && e.folder); }

async function tokenAkses(){
  const e = ENV();
  const body = new URLSearchParams({
    client_id: e.id, client_secret: e.secret, refresh_token: e.refresh, grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.access_token) {
    throw new Error('Google Drive: gagal menukar refresh token (' + (j && (j.error_description || j.error) || 'HTTP ' + res.status) + ')');
  }
  return j.access_token;
}

async function driveFetch(url, opt){
  const res = await fetch(url, opt);
  const teks = await res.text();
  let j = null; try { j = teks ? JSON.parse(teks) : null; } catch (e) {}
  if (!res.ok) {
    const pesan = (j && j.error && (j.error.message || j.error)) || teks.slice(0, 200) || ('HTTP ' + res.status);
    throw new Error('Google Drive: ' + pesan);
  }
  return j;
}

/* Unggah satu berkas teks (JSON) ke folder cadangan. Mengembalikan {id, name}. */
async function unggah(nama, isi, mime){
  const e = ENV();
  const token = await tokenAkses();
  const batas = 'laz-batas-' + Date.now();
  const meta = JSON.stringify({ name: nama, parents: [e.folder], mimeType: mime || 'application/json' });
  const body =
    '--' + batas + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n' +
    '--' + batas + '\r\nContent-Type: ' + (mime || 'application/json') + '\r\n\r\n' + isi + '\r\n' +
    '--' + batas + '--';
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + batas },
    body
  });
}

/* Daftar berkas cadangan di folder, terbaru dulu. */
async function daftar(awalan){
  const e = ENV();
  const token = await tokenAkses();
  const q = "'" + e.folder + "' in parents and trashed = false and name contains '" + String(awalan || '').replace(/'/g, "\\'") + "'";
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q)
    + '&orderBy=createdTime%20desc&pageSize=200&fields=files(id,name,size,createdTime)';
  const j = await driveFetch(url, { headers: { Authorization: 'Bearer ' + token } });
  return (j && j.files) || [];
}

async function hapus(id){
  const token = await tokenAkses();
  await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id), {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
  });
}

/* Sisakan hanya `simpan` berkas terbaru dengan awalan tertentu. */
async function pangkas(awalan, simpan){
  const semua = await daftar(awalan);
  const buang = semua.slice(Math.max(0, simpan || 30));
  for (const f of buang) { try { await hapus(f.id); } catch (e) { /* dilaporkan di lain waktu */ } }
  return { total: semua.length, dihapus: buang.length };
}

module.exports = { driveSiap, tokenAkses, unggah, daftar, hapus, pangkas };
