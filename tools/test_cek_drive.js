/* Uji diagnosis kesiapan Google Drive (api/_drive.js rincianDrive).
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * "Drive belum jalan" adalah laporan yang tidak berguna kalau tidak tahu
 * YANG MANA penyebabnya. Di produksi, driveSiapSurat() bernilai false membuat
 * lib/surat/surat.js diam-diam menyimpan lampiran ke basis data tanpa galat
 * apa pun, jadi pemilik yang sudah mengisi semua variabel di Vercel punya
 * alasan kuat untuk mengira Drive-nya rusak.
 * rincianDrive() dibuat supaya layar bisa menjawab tiga hal: variabel mana
 * yang kosong, apakah refresh token masih berlaku, dan apakah folder tujuan
 * bisa dibuka.
 *
 * Yang paling penting dijaga di sini adalah sifat KEBOCORAN. Hasil
 * rincianDrive() dikirim ke peramban dan bisa difoto, jadi nilai kredensial
 * tidak boleh ikut keluar, hanya status terisi atau kosong.
 *
 * Berkas ini murni menguji api/_drive.js lewat process.env yang disetel
 * sementara (dikembalikan di akhir uji) dan fetch tiruan, tanpa menyentuh
 * Google Drive sungguhan.
 *
 *   node tools/test_cek_drive.js
 */
'use strict';
const path = require('path');
const AKAR = path.join(__dirname, '..');

const VAR_ENV = ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN', 'GDRIVE_FOLDER_ID', 'GDRIVE_FOLDER_SURAT_ID'];
const ASLI = {};
for (const k of VAR_ENV) ASLI[k] = process.env[k];

const drive = require(path.join(AKAR, 'api', '_drive.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 400)); }
};

function nilaiAcak() {
  return Math.random() < 0.5 ? '' : ('nilai-acak-' + Math.random().toString(36).slice(2, 10));
}
function setEnv(id, secret, refresh, folder, folderSurat) {
  process.env.GDRIVE_CLIENT_ID = id;
  process.env.GDRIVE_CLIENT_SECRET = secret;
  process.env.GDRIVE_REFRESH_TOKEN = refresh;
  process.env.GDRIVE_FOLDER_ID = folder;
  process.env.GDRIVE_FOLDER_SURAT_ID = folderSurat;
}

/* Fetch tiruan. Dua kendali supaya tiap bagian uji bisa mengatur sendiri:
 * tokennya berhasil atau ditolak, dan foldernya ketemu atau tidak. */
let modeToken = 'ok';
let modeFolder = 'ok';
let panggilToken = 0, panggilFolder = 0;

function respons(json, berhasil, status) {
  return {
    ok: berhasil, status: status || (berhasil ? 200 : 400),
    text: async () => JSON.stringify(json),
    json: async () => json
  };
}

async function fetchTiru(url) {
  const u = String(url);
  if (u.indexOf('oauth2.googleapis.com/token') !== -1) {
    panggilToken++;
    if (modeToken !== 'ok') {
      return respons({ error: 'invalid_grant', error_description: 'Token dicabut oleh Google.' }, false, 400);
    }
    return respons({ access_token: 'token-tiruan' }, true, 200);
  }
  panggilFolder++;
  if (modeFolder === 'salah') {
    return respons({ error: { message: 'File not found: 1TidakAda.' } }, false, 404);
  }
  if (modeFolder === 'izin') {
    return respons({ error: { message: 'The user does not have sufficient permissions.' } }, false, 403);
  }
  return respons({ id: 'id-tiruan', name: 'Folder Uji', mimeType: 'application/vnd.google-apps.folder' }, true, 200);
}

(async function utama() {
  const fetchAsli = global.fetch;
  global.fetch = fetchTiru;

  console.log('\n=== PROPERTY 1: rincianDrive() melaporkan isi tiap variabel dengan benar ===');
  /* Untuk semua kombinasi acak kelima variabel, field `isi` harus bernilai
     true kalau dan hanya kalau variabel itu terisi di environment.
     driveSiap dan driveSiapSurat juga harus sama persis dengan cara
     hitungnya di modul, dan folderSurat harus mengikuti urutan fallback. */
  {
    const ITERASI = 120;
    let semuaBenar = true, contohGagal = null;
    for (let i = 0; i < ITERASI; i++) {
      const id = nilaiAcak(), secret = nilaiAcak(), refresh = nilaiAcak();
      const folder = nilaiAcak(), folderSurat = nilaiAcak();
      setEnv(id, secret, refresh, folder, folderSurat);
      modeToken = 'ok';
      const r = await drive.rincianDrive();
      const diharapkan = {
        GDRIVE_CLIENT_ID: !!id,
        GDRIVE_CLIENT_SECRET: !!secret,
        GDRIVE_REFRESH_TOKEN: !!refresh,
        GDRIVE_FOLDER_ID: !!folder,
        GDRIVE_FOLDER_SURAT_ID: !!folderSurat,
      };
      const isiBenar = Object.keys(diharapkan).every((k) => r.isi[k] === diharapkan[k]);
      const siapBenar = r.driveSiap === drive.driveSiap() && r.driveSiapSurat === drive.driveSiapSurat();
      const folderHarapan = folderSurat ? 'GDRIVE_FOLDER_SURAT_ID' : (folder ? 'GDRIVE_FOLDER_ID' : '');
      const tujuanBenar = r.folderDari === folderHarapan;
      if (!isiBenar || !siapBenar || !tujuanBenar) {
        semuaBenar = false;
        contohGagal = { id, secret, refresh, folder, folderSurat, isi: r.isi, diharapkan, siapBenar, folderDari: r.folderDari };
        break;
      }
    }
    cek('isi tiap variabel, driveSiap, driveSiapSurat, dan folderDari akurat, ' + ITERASI + ' iterasi acak', semuaBenar, contohGagal);
  }

  console.log('\n=== PROPERTY 2: hasil TIDAK PERNAH membocorkan nilai kredensial ===');
  /* Nilai kredensial yang dipakai harus muncul di hasil kalau bocor. Karena
     hasil ini dikirim ke peramban dan bisa difoto, nilai aslinya tidak boleh
     ada di dalamnya, hanya true atau false. */
  {
    const TANDA = 'RAHASIA-JANGAN-BOCOR-9f3a2b';
    setEnv('id-' + TANDA, 'secret-' + TANDA, 'refresh-' + TANDA, 'folder-' + TANDA, 'folderSurat-' + TANDA);
    modeToken = 'ok';
    const r = await drive.rincianDrive();
    const teks = JSON.stringify(r);
    cek('tanda pengenal tidak muncul di hasil rincianDrive()', teks.indexOf(TANDA) === -1, teks);
    cek('field isi hanya berisi boolean', Object.keys(r.isi).every((k) => typeof r.isi[k] === 'boolean'), r.isi);
  }

  console.log('\n=== PROPERTY 3: OAuth belum lengkap TIDAK menghubungi Google ===');
  /* Kalau kredensial OAuth belum lengkap, tidak ada gunanya memanggil
     Google: pasti ditolak. Fungsi harus berhenti di awal dan menyebut
     variabel yang masih kosong. */
  {
    setEnv('', 'secret-tiruan', 'refresh-tiruan', 'folder-tiruan', '');
    panggilToken = 0; panggilFolder = 0;
    modeToken = 'ok';
    const r = await drive.rincianDrive();
    cek('tidak memanggil Google saat OAuth belum lengkap', panggilToken === 0 && panggilFolder === 0, { panggilToken, panggilFolder });
    cek('token.ok bernilai false', r.token && r.token.ok === false, r.token);
    cek('pesan menyebut GDRIVE_CLIENT_ID yang kosong', /GDRIVE_CLIENT_ID/.test(r.token.pesan || ''), r.token);
    cek('daftar folder kosong karena belum diuji', Array.isArray(r.folder) && r.folder.length === 0, r.folder);
  }

  console.log('\n=== PROPERTY 4: refresh token ditolak Google (invalid_grant) ===');
  /* Ini penyebab paling sering di produksi: aplikasi OAuth berstatus
     "Testing" dicabut Google setelah 7 hari tidak dipakai. Harus muncul
     sebagai kegagalan token, dan folder TIDAK ikut diperiksa karena tanpa
     token pemeriksaan folder tidak ada artinya. */
  {
    setEnv('id-tiruan', 'secret-tiruan', 'refresh-tiruan', 'folder-tiruan', 'folder-surat-tiruan');
    modeToken = 'gagal';
    panggilToken = 0; panggilFolder = 0;
    const r = await drive.rincianDrive();
    cek('token.ok bernilai false saat ditolak', r.token && r.token.ok === false, r.token);
    cek('pesan invalid_grant diteruskan ke layar', /invalid_grant/.test(r.token.pesan || ''), r.token);
    cek('token ditukar tepat satu kali', panggilToken === 1, { panggilToken });
    cek('folder tidak diperiksa tanpa token', panggilFolder === 0 && r.folder.length === 0, { panggilFolder, folder: r.folder });
  }

  console.log('\n=== PROPERTY 5: folder salah pemilik atau tidak ada ===');
  /* Folder yang bukan milik akun token, atau sudah dihapus, harus dilaporkan
     per folder dan tidak menjatuhkan diagnoses yang lain. */
  for (const mode of ['salah', 'izin']) {
    setEnv('id-tiruan', 'secret-tiruan', 'refresh-tiruan', 'folder-cadangan-tiruan', 'folder-surat-tiruan');
    modeToken = 'ok';
    modeFolder = mode;
    const r = await drive.rincianDrive();
    cek('token tetap dianggap benar saat folder bermasalah (' + mode + ')', r.token.ok === true, r.token);
    cek('laporan memuat dua folder, keduanya gagal saat ' + mode,
      r.folder.length === 2 && r.folder.every((f) => f.ok === false), r.folder);
  }
  {
    /* Folder surat sengaja dikosongkan: itu kondisi yang sah (fitur ini
       tidak wajib), jadi harus dilaporkan "kosong", bukan error Google. */
    setEnv('id-tiruan', 'secret-tiruan', 'refresh-tiruan', 'folder-cadangan-tiruan', '');
    modeToken = 'ok';
    modeFolder = 'salah';
    const r = await drive.rincianDrive();
    const surat = r.folder.find((f) => f.nama === 'GDRIVE_FOLDER_SURAT_ID');
    cek('Folder_Surat kosong dilaporkan sebagai kosong, bukan error Google',
      !!surat && surat.ada === false && /kosong/i.test(surat.pesan || ''), surat);
  }

  console.log('\n=== PROPERTY 6: semua siap, semua hijau ===');
  {
    setEnv('id-tiruan', 'secret-tiruan', 'refresh-tiruan', 'folder-cadangan-tiruan', 'folder-surat-tiruan');
    modeToken = 'ok';
    modeFolder = 'ok';
    const r = await drive.rincianDrive();
    cek('driveSiapSurat() true saat semua terisi', r.driveSiapSurat === true, r);
    cek('token dan kedua folder bisa dipakai',
      r.token.ok === true && r.folder.length === 2 && r.folder.every((f) => f.ok === true), r.folder);
  }

  global.fetch = fetchAsli;
  for (const k of VAR_ENV) {
    if (ASLI[k] === undefined) delete process.env[k];
    else process.env[k] = ASLI[k];
  }

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: diagnosis kesiapan Drive belum benar.\n'); process.exit(1); }
  console.log('\ntest_cek_drive.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch(function (e) {
  console.error('\nUji gagal total:', (e && e.stack) || e);
  process.exit(1);
});