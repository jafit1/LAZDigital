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
  folder: process.env.GDRIVE_FOLDER_ID,
  folderSurat: process.env.GDRIVE_FOLDER_SURAT_ID
});

function driveSiap(){ const e = ENV(); return !!(e.id && e.secret && e.refresh && e.folder); }

/* Kesiapan Drive khusus lampiran Modul_Surat: kredensial dasar harus lengkap,
   dan salah satu dari Folder_Surat atau Folder_Cadangan harus terisi sebagai
   jalan cadangan. Tidak bergantung pada driveSiap() supaya driveSiap() yang
   dipakai api/backup.js tetap tidak terpengaruh variabel baru ini. */
function driveSiapSurat(){
  const e = ENV();
  return !!(e.id && e.secret && e.refresh && (e.folderSurat || e.folder));
}

/* Helper tunggal logika fallback folder lampiran surat: Folder_Surat kalau
   terisi, kalau kosong jatuh ke Folder_Cadangan. Pemanggil (lib/surat/surat.js)
   tidak perlu tahu nama variabel lingkungan ini maupun urutan fallback-nya,
   cukup minta folder tujuan lewat fungsi ini. */
function folderSurat(){ const e = ENV(); return e.folderSurat || e.folder; }

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
    /* Kode galat Google ikut disertakan, bukan hanya error_description.
       "invalid_grant" adalah kata yang dicari pemilik saat refresh token-nya
       dicabut, sedangkan error_description-nya ("Token has been expired or
       revoked.") tidak menyebut kode itu sama sekali. */
    const kode = j && j.error ? String(j.error) : '';
    const jelas = j && j.error_description ? String(j.error_description) : '';
    throw new Error('Google Drive: gagal menukar refresh token ('
      + (kode && jelas ? kode + ': ' + jelas : kode || jelas || ('HTTP ' + res.status)) + ')');
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

/* Unggah berkas biner (lampiran surat). unggah() di atas menyusun badan
   sebagai teks, dan PDF atau JPEG yang dijadikan teks rusak tanpa galat:
   berkasnya tersimpan, tetapi tidak bisa dibuka. Jadi badannya disusun
   sebagai Buffer. */
async function unggahBiner(nama, buf, mime, folder){
  const e = ENV();
  const tujuan = folder || e.folder;
  const token = await tokenAkses();
  const batas = 'laz-batas-' + Date.now();
  const meta = JSON.stringify({ name: nama, parents: [tujuan], mimeType: mime || 'application/octet-stream' });
  const body = Buffer.concat([
    Buffer.from('--' + batas + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n'
      + '--' + batas + '\r\nContent-Type: ' + (mime || 'application/octet-stream') + '\r\n\r\n'),
    buf,
    Buffer.from('\r\n--' + batas + '--'),
  ]);
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + batas },
    body
  });
}

/* Unduh isi berkas sebagai Buffer (untuk lampiran yang tersimpan di Drive). */
async function unduh(id){
  const token = await tokenAkses();
  const res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Google Drive: berkas tidak bisa diambil (HTTP ' + res.status + ')');
  return Buffer.from(await res.arrayBuffer());
}

/* Terjemahkan pesan galat Google yang panjang dan teknis jadi satu kalimat
   pendek plus langkah konkret. Tanpa ini, pemilik hanya melihat kalimat
   seperti "Google Drive API has not been used in project 104483414062
   before or it is disabled", yang tidak memberi tahu harus menyentuh apa. */
function petunjuk(pesan){
  const p = String(pesan || '');
  if (/has not been used in project|it is disabled|SERVICE_DISABLED/i.test(p)) {
    return { ringkas: 'Google Drive API belum diaktifkan di proyek Google Cloud ini.',
      langkah: 'Buka console.cloud.google.com, pilih proyek yang sama, lalu APIs & Services > Library, cari "Google Drive API", tekan Enable. Tunggu 1-2 menit lalu periksa lagi.' };
  }
  if (/invalid_grant/i.test(p)) {
    return { ringkas: 'Refresh token sudah dicabut oleh Google.',
      langkah: 'Buat token baru: node tools/dapatkan-token-drive.js <CLIENT_ID> <CLIENT_SECRET>. Supaya tidak dicabut lagi, ubah status aplikasi di OAuth consent screen menjadi In production.' };
  }
  if (/File not found|not found|404/i.test(p)) {
    return { ringkas: 'Folder ini tidak ditemukan.',
      langkah: 'Buka foldernya di Google Drive, salin ulang ID dari alamat setelah /folders/, lalu samakan dengan isian di Vercel. Pastikan folder belum dipindahkan ke sampah atau ID-nya salah salin.' };
  }
  if (/insufficient|permission|not authorized|403/i.test(p)) {
    return { ringkas: 'Akun pemilik refresh token tidak punya akses ke folder ini.',
      langkah: 'Pastikan folder dibuat oleh akun Google yang sama yang dipakai saat membuat refresh token.' };
  }
  if (/unauthorized|401/i.test(p)) {
    return { ringkas: 'Token ditolak Google.', langkah: 'Buat ulang kredensial OAuth di PANDUAN-CADANGAN.md langkah 2a dan 2b.' };
  }
  return { ringkas: '', langkah: '' };
}

/* Rincian kesiapan Drive untuk diagnosa di layar Perawatan.
   Dulu layar itu hanya bisa tahu "Drive belum" atau "Drive sudah", sehingga
   pemilik yang sudah mengisi semua variabel di Vercel tetap tidak tahu yang
   mana yang kurang, atau apakah refresh token-nya sudah dicabut Google.
   Fungsi ini menjawab itu: variabel mana yang kosong, token masih berlaku
   atau tidak, dan folder tujuan bisa dibuka atau tidak.

   Isi kredensial SENGAJA tidak dikembalikan, hanya "terisi atau kosong".
   Layar ini bisa difoto dan hasilnya ikut membocorkan keadaan produksi. */
async function rincianDrive(){
  const e = ENV();
  const isi = {
    GDRIVE_CLIENT_ID: !!e.id,
    GDRIVE_CLIENT_SECRET: !!e.secret,
    GDRIVE_REFRESH_TOKEN: !!e.refresh,
    GDRIVE_FOLDER_ID: !!e.folder,
    GDRIVE_FOLDER_SURAT_ID: !!e.folderSurat,
  };
  const out = {
    isi,
    driveSiap: driveSiap(),
    driveSiapSurat: driveSiapSurat(),
    /* Id folder tujuan tidak ikut dikembalikan sebagai nilai. Id folder bukan
       rahasia seperti kredensial OAuth, tapi hasil fungsi ini dikirim ke
       peramban dan bisa difoto. Yang dibutuhkan untuk diagnosis adalah
       folder mana yang dipakai, bukan id persisnya. */
    folderDari: e.folderSurat ? 'GDRIVE_FOLDER_SURAT_ID' : (e.folder ? 'GDRIVE_FOLDER_ID' : ''),
    token: null,
    folder: [],
    halangan: [],
    /* siapSurat TIDAK boleh disamakan dengan driveSiapSurat(). Yang itu
       hanya memeriksa variabel ada isinya atau tidak, dan tidak tahu apakah
       token sudah dicabut atau Drive API belum diaktifkan. Dulu layar
       menampilkan "Lampiran surat baru akan naik ke Google Drive" padahal
       unggahannya pasti ditolak Google, jadi pemilik mengira sudah beres
       padahal setiap lampiran gagal diam-diam. */
    siapSurat: false,
  };

  const simpulkan = () => {
    out.siapSurat = out.halangan.length === 0;
    return out;
  };

  if (!(e.id && e.secret && e.refresh)) {
    const kurang = ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN'].filter((n) => !isi[n]);
    out.token = { ok: false, pesan: 'Kredensial OAuth belum lengkap. Masih kosong: ' + kurang.join(', ') + '.' };
    out.halangan.push({ ringkas: 'Kredensial OAuth belum lengkap di Vercel.', langkah: 'Isi ' + kurang.join(', ') + ', lalu Redeploy.' });
    return simpulkan();
  }

  let token = '';
  try {
    token = await tokenAkses();
    out.token = { ok: true };
  } catch (err) {
    /* Pesan paling sering: invalid_grant. Itu berarti refresh token dicabut
       Google (aplikasi berstatus "Testing" dicabut setelah 7 hari tidak
       dipakai, atau kata sandi Google diganti). Perbaikannya di
       PANDUAN-CADANGAN.md langkah 2b. */
    const t = petunjuk(err.message);
    out.token = { ok: false, pesan: err.message, ringkas: t.ringkas || 'Refresh token tidak bisa dipakai.', langkah: t.langkah };
    out.halangan.push({ ringkas: out.token.ringkas, langkah: out.token.langkah });
    return simpulkan();
  }

  for (const [nama, id] of [['GDRIVE_FOLDER_SURAT_ID', e.folderSurat], ['GDRIVE_FOLDER_ID', e.folder]]) {
    if (!id) {
      /* Folder cadangan kosong BUKAN penghalang: fiturnya opsional, dan
         lampiran surat tidak memakainya kalau Folder_Surat sendiri terisi. */
      out.folder.push({ nama, ada: false, opsional: true, ok: true, pesan: 'Kosong di Vercel (opsional, tidak dipakai).' });
      if (nama === 'GDRIVE_FOLDER_SURAT_ID' && !e.folder) {
        out.halangan.push({ ringkas: 'Tidak ada folder tujuan untuk lampiran surat.', langkah: 'Isi GDRIVE_FOLDER_SURAT_ID atau GDRIVE_FOLDER_ID di Vercel, lalu Redeploy.' });
      }
      continue;
    }
    try {
      const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,name,mimeType', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const j = await r.json().catch(() => null);
      const pesan = r.ok ? j.name : ((j && j.error && j.error.message) || ('HTTP ' + r.status));
      const t = r.ok ? { ringkas: '', langkah: '' } : petunjuk(pesan);
      out.folder.push({ nama, ada: true, opsional: false, ok: !!r.ok, pesan, ringkas: t.ringkas, langkah: t.langkah });
      /* Folder lampiran surat yang rusak membuat unggahan pasti gagal.
         Folder cadangan yang rusak tidak menghalangi unggahan surat, karena
         yang dipakai lampiran surat adalah folderSurat() (lihat atas),
         bukan folder cadangan ini. */
      if (!r.ok && (nama === 'GDRIVE_FOLDER_SURAT_ID' || (nama === 'GDRIVE_FOLDER_ID' && !e.folderSurat))) {
        out.halangan.push({ ringkas: t.ringkas || 'Folder tujuan lampiran tidak bisa dibuka.', langkah: t.langkah });
      }
    } catch (err) {
      out.folder.push({ nama, ada: true, opsional: false, ok: false, pesan: err.message });
      if (nama === 'GDRIVE_FOLDER_SURAT_ID' || (nama === 'GDRIVE_FOLDER_ID' && !e.folderSurat)) {
        out.halangan.push({ ringkas: 'Folder tujuan lampiran tidak bisa diperiksa.', langkah: err.message });
      }
    }
  }
  return simpulkan();
}

module.exports = { driveSiap, driveSiapSurat, folderSurat, rincianDrive, tokenAkses, unggah, unggahBiner, unduh, daftar, hapus, pangkas };
