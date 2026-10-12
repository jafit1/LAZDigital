/* ============================================================
   CEK KESIAPAN GOOGLE DRIVE — cari tahu kenapa lampiran surat
   tidak naik ke Google Drive.

   Cara pakai:
     set GDRIVE_CLIENT_ID=...
     set GDRIVE_CLIENT_SECRET=...
     set GDRIVE_REFRESH_TOKEN=...
     set GDRIVE_FOLDER_ID=...
     set GDRIVE_FOLDER_SURAT_ID=...
     node tools/cek-drive.js

   Atau pakai berkas .env:
     node --env-file=.env tools/cek-drive.js

   Skrip ini hanya MEMBACA dan memeriksa. Tidak mengubah berkas apa pun,
   dan tidak pernah mencetak isi kredensial, hanya panjangnya.
   ============================================================ */
'use strict';

const AKAR = require('path').join(__dirname, '..');
let drive = null;
try { drive = require(AKAR + '/api/_drive.js'); }
catch (e) { console.error('Gagal memuat api/_drive.js: ' + e.message + '\n'); process.exit(2); }

const garis = () => console.log('-'.repeat(66));

const KRED = [
  ['GDRIVE_CLIENT_ID',     'Kredensial OAuth 2a'],
  ['GDRIVE_CLIENT_SECRET', 'Kredensial OAuth 2a'],
  ['GDRIVE_REFRESH_TOKEN', 'Kredensial OAuth 2b'],
  ['GDRIVE_FOLDER_ID',     'Folder cadangan (2c)'],
  ['GDRIVE_FOLDER_SURAT_ID','Folder lampiran surat (opsional)'],
];

console.log('');
garis();
console.log('  PEMERIKSAAN KESIAPAN GOOGLE DRIVE');
garis();
console.log('');

console.log('  Isi environment:');
let kosong = 0;
for (const [nama, asal] of KRED) {
  const v = process.env[nama] || '';
  if (v) {
    console.log('    [TERISI]  ' + nama.padEnd(24) + '(' + String(v.length).padStart(4) + ' karakter)  <- ' + asal);
  } else {
    kosong++;
    console.log('    [KOSONG]  ' + nama.padEnd(24) + '                     <- ' + asal);
  }
}
console.log('');

const foldSurat = process.env.GDRIVE_FOLDER_SURAT_ID || '';
const foldCad   = process.env.GDRIVE_FOLDER_ID || '';

if (kosong === KRED.length) {
  console.log('  HASIL: Tidak ada satu pun variabel GDRIVE_* di environment ini.');
  console.log('  Itu wajar kalau Anda hanya mengisinya di Vercel. Untuk memeriksa');
  console.log('  isi Vercel, jalankan skrip ini dengan --env-file=.env yang sudah diisi.');
  console.log('');
  process.exit(1);
}

garis();
console.log('  RUJUKAN KODE');
garis();
console.log('  driveSiapSurat()      = ' + (drive.driveSiapSurat() ? 'true  (lampiran surat naik ke Drive)' : 'FALSE (lampiran diam-diam jatuh ke basis data)'));
console.log('  folderSurat()         = ' + (drive.folderSurat() || '( kosong, tidak ada tujuan )'));
console.log('  driveSiap()           = ' + (drive.driveSiap() ? 'true  (fitur cadangan naik ke Drive)' : 'FALSE (fitur cadangan tidak memakai Drive)'));
console.log('');

if (!drive.driveSiapSurat()) {
  garis();
  console.log('  PENYEBAB KETEMU: kredensial OAuth belum lengkap.');
  garis();
  if (!(process.env.GDRIVE_CLIENT_ID && process.env.GDRIVE_CLIENT_SECRET && process.env.GDRIVE_REFRESH_TOKEN)) {
    console.log('  GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, dan GDRIVE_REFRESH_TOKEN');
    console.log('  belum lengkap. Tanpa ketiganya, driveSiapSurat() bernilai false dan');
    console.log('  lampiran surat TIDAK naik ke Drive. Lacak surat.js baris 294: begitu');
    console.log('  driveSiapSurat() false, lampiran disimpan ke basis data tanpa galat apa pun.');
    console.log('  Itulah sebabnya tidak ada pesan error padahal Drive-nya tidak jalan.');
  }
  if (!foldSurat && !foldCad) {
    console.log('');
    console.log('  Selain itu, tidak ada folder tujuan sama sekali: GDRIVE_FOLDER_SURAT_ID');
    console.log('  dan GDRIVE_FOLDER_ID keduanya kosong. Lampiran butuh salah satunya.');
  }
  console.log('');
  console.log('  LANGKAH: PANDUAN-CADANGAN.md langkah 2a dan 2b, lalu 2d (isi di Vercel).');
  console.log('  PANDUAN-LAMPIRAN-SURAT.md memakai kredensial yang sama, tidak perlu OAuth baru.');
  console.log('');
  process.exit(1);
}

/* Kredensial lengkap. Sekarang buktikan token-nya benar-benar bisa ditukar. */
(async () => {
  garis();
  console.log('  UJI TOKEN');
  garis();
  let token = '';
  try {
    token = await drive.tokenAkses();
    console.log('  [OK]  Refresh token ditukar jadi access token.');
  } catch (e) {
    console.log('  [GAGAL] ' + e.message);
    console.log('');
    console.log('  Penyebab yang paling sering:');
    console.log('    - Refresh token dicabut. Aplikasi OAuth berstatus "Testing" dicabut');
    console.log('      Google setelah 7 hari tidak dipakai. Ulangi langkah 2b');
    console.log('      (node tools/dapatkan-token-drive.js <CLIENT_ID> <CLIENT_SECRET>).');
    console.log('    - GDRIVE_CLIENT_ID atau SECRET salah ketik, atau bukan pasangan yang sama.');
    console.log('    - Kata sandi Google diganti sehingga token dicabut.');
    console.log('');
    process.exit(1);
  }

  console.log('');
  garis();
  console.log('  UJI FOLDER TUJUAN');
  garis();
  for (const [nama, id] of [['Folder lampiran surat', foldSurat], ['Folder cadangan', foldCad]]) {
    if (!id) { console.log('  [DILEWATI] ' + nama + ' kosong'); continue; }
    try {
      const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,name,mimeType', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        const pesan = (j && j.error && j.error.message) || ('HTTP ' + r.status);
        console.log('  [GAGAL]  ' + nama + ': ' + pesan);
        if (/not found|404/i.test(pesan)) {
          console.log('           ID folder tidak ditemukan. Periksa bagian setelah /folders/');
          console.log('           pada alamat Drive, dan pastikan folder belum dipindahkan ke sampah.');
        }
        if (/insufficient|permission/i.test(pesan)) {
          console.log('           Folder bukan milik akun yang memberi refresh token, atau');
          console.log('           token ini bukan milik akun pemilik folder.');
        }
      } else {
        console.log('  [OK]     ' + nama + ': "' + j.name + '" (' + j.mimeType + ')');
      }
    } catch (e) {
      console.log('  [GAGAL]  ' + nama + ': ' + e.message);
    }
  }

  console.log('');
  garis();
  console.log('  RINGKASAN');
  garis();
  console.log('  Kredensial dan folder siap. Kalau di Vercel lampiran surat masih');
  console.log('  masuk ke basis data, berarti perubahannya belum REDEPLOY, atau env');
  console.log('  yang diisi hanya berlaku untuk Preview dan bukan untuk Production.');
  console.log('');
})();