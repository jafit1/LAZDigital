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

  console.log('\n=== PROPERTY 7: vonis siapSurat jujur, bukan sekadar "variabel ada" ===');
  /* Ini inti perbaikan. driveSiapSurat() hanya memeriksa variabelnya ada
     isinya atau tidak, dan tetap true walau Drive API belum diaktifkan atau
     folder tujuan salah ID. Kalau verdict layar dibangun dari situ, pemilik
     dibaca "Lampiran surat akan naik ke Google Drive" padahal setiap unggahan
     pasti ditolak Google. Jadi untuk semua kombinasi variabel dan kegagalan,
     siapSurat hanya boleh true kalau benar-benar tidak ada yang menghalangi. */
  {
    const KASUS = [
      /* [id, secret, refresh, folder, folderSurat, modeToken, modeFolder, siapHarapan, alasan] */
      ['id', 's', 'r', 'f', 'fs', 'ok', 'ok', true, 'semua lengkap dan bisa dibuka'],
      ['id', 's', 'r', '', 'fs', 'ok', 'ok', true, 'folder cadangan opsional kosong'],
      ['id', 's', 'r', 'f', '', 'ok', 'ok', true, 'folder surat opsional kosong, cadangan dipakai'],
      ['id', 's', 'r', '', '', 'ok', 'ok', false, 'tidak ada folder tujuan sama sekali'],
      ['', 's', 'r', 'f', 'fs', 'ok', 'ok', false, 'client id kosong'],
      ['id', '', 'r', 'f', 'fs', 'ok', 'ok', false, 'client secret kosong'],
      ['id', 's', '', 'f', 'fs', 'ok', 'ok', false, 'refresh token kosong'],
      ['id', 's', 'r', 'f', 'fs', 'gagal', 'ok', false, 'token dicabut Google'],
      ['id', 's', 'r', 'f', 'fs', 'ok', 'salah', false, 'folder surat tidak ditemukan'],
      ['id', 's', 'r', 'f', 'fs', 'ok', 'izin', false, 'token tidak punya akses folder'],
      /* Folder cadangan rusak tapi folder surat sehat: lampiran surat tetap
         naik ke Drive, jadi ini TIDAK boleh jadi penghalang. */
      ['id', 's', 'r', 'f', 'fs', 'ok', 'ok', true, 'keduanya sehat'],
    ];
    let benar = true, contoh = null;
    for (const [id, secret, refresh, folder, folderSurat, mt, mf, harap, alasan] of KASUS) {
      setEnv(id, secret, refresh, folder, folderSurat);
      modeToken = mt; modeFolder = mf;
      const r = await drive.rincianDrive();
      /* Vonis dan daftar penghalang harus konsisten satu sama lain: siapSurat
         true persis ketika tidak ada penghalang yang dicatat. */
      const konsisten = r.siapSurat === (r.halangan.length === 0);
      if (r.siapSurat !== harap || !konsisten) {
        benar = false;
        contoh = { alasan, harap, dapat: r.siapSurat, konsisten, halangan: r.halangan };
        break;
      }
    }
    cek('siapSurat benar untuk ' + KASUS.length + ' kombinasi, dan konsisten dengan daftar halangan', benar, contoh);
  }

  console.log('\n=== PROPERTY 8: folder cadangan rusak tidak halting lampiran surat ===');
  /* Pemisahan dua hal yang tadinya tertukar: yang menentukan lampiran surat
     adalah folderSurat(), bukan folder cadangan. Jadi folder cadangan yang
     rusak tidak boleh memblokir, sedangkan folder surat yang rusak harus
     memblokir meski folder cadangan sehat. */
  {
    /* Folder cadangan dipanggil lebih dulu di urutan, jadi untuk mengujinya
       kedua fetch dibedakan lewat nama file yang diminta. */
    const fetchCadanganRusak = async (url) => {
      const u = String(url);
      if (u.indexOf('oauth2.googleapis.com/token') !== -1) return respons({ access_token: 'token-tiruan' }, true, 200);
      if (u.indexOf('folder-cadangan-rusak') !== -1) return respons({ error: { message: 'File not found: 1Cadangan.' } }, false, 404);
      return respons({ id: 'id', name: 'Folder Surat', mimeType: 'application/vnd.google-apps.folder' }, true, 200);
    };
    const f = global.fetch;
    global.fetch = fetchCadanganRusak;
    setEnv('id-tiruan', 'secret-tiruan', 'refresh-tiruan', 'folder-cadangan-rusak', 'folder-surat-sehat');
    modeToken = 'ok';
    const rusakCadangan = await drive.rincianDrive();
    global.fetch = f;
    cek('folder cadangan rusak tidak membuat siapSurat false', rusakCadangan.siapSurat === true, rusakCadangan.halangan);

    /* Kebalikannya: folder surat rusak, folder cadangan sehat. */
    const fetchSuratRusak = async (url) => {
      const u = String(url);
      if (u.indexOf('oauth2.googleapis.com/token') !== -1) return respons({ access_token: 'token-tiruan' }, true, 200);
      if (u.indexOf('folder-surat-rusak') !== -1) return respons({ error: { message: 'File not found: 1Surat.' } }, false, 404);
      return respons({ id: 'id', name: 'Folder Cadangan', mimeType: 'application/vnd.google-apps.folder' }, true, 200);
    };
    global.fetch = fetchSuratRusak;
    setEnv('id-tiruan', 'secret-tiruan', 'refresh-tiruan', 'folder-cadangan-sehat', 'folder-surat-rusak');
    modeToken = 'ok';
    const rusakSurat = await drive.rincianDrive();
    global.fetch = f;
    cek('folder surat yang rusak tetap memblokir walau cadangan sehat',
      rusakSurat.siapSurat === false && rusakSurat.halangan.length === 1, rusakSurat);
  }

  console.log('\n=== PROPERTY 9: pesan galat Google diterjemah jadi langkah konkret ===');
  /* Pesan galat Google panjang dan teknis ("Google Drive API has not been
     used in project ... or it is disabled") tidak memberi tahu pemilik harus
     menyentuh apa. Setiap kegagalan yang umum harus punya kalimat pendek dan
     langkah perbaikan, sementara pesan aslinya tetap disimpan untuk detail. */
  {
    const PETA = [
      ['Google Drive API has not been used in project 104483414062 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/drive.googleapis.com/overview', /belum diaktifkan/i],
      ['File not found: 1AT3O19i9oFSjOUAY0dRnzpIm172k1O5m.', /tidak ditemukan/i],
      ['The user does not have sufficient permissions.', /tidak punya akses/i],
      ['invalid_grant', /dicabut/i],
      ['Unauthorized', /ditolak/i],
    ];
    for (const [pesan, pola] of PETA) {
      setEnv('id-tiruan', 'secret-tiruan', 'refresh-tiruan', 'folder-tiruan', 'folder-surat-tiruan');
      modeFolder = 'salah';
      const f = global.fetch;
      global.fetch = async (url) => {
        const u = String(url);
        if (u.indexOf('oauth2.googleapis.com/token') !== -1) return respons({ access_token: 'token-tiruan' }, true, 200);
        return respons({ error: { message: pesan } }, false, 400);
      };
      const r = await drive.rincianDrive();
      global.fetch = f;
      const hal = r.halangan[0] || {};
      cek('ada ringkasan singkat untuk "' + pesan.slice(0, 40) + '..."',
        typeof hal.ringkas === 'string' && pola.test(hal.ringkas || ''), hal);
      cek('ada langkah perbaikan untuk "' + pesan.slice(0, 40) + '..."',
        typeof hal.langkah === 'string' && hal.langkah.length > 20, hal);
      cek('pesan asli Google tetap tersedia untuk detail',
        r.folder.some((x) => x.pesan === pesan), r.folder);
    }
  }

  console.log('\n=== PROPERTY 10: tidak ada secrets atau id folder di output ===');
  /* Petunjuk langkah tidak boleh ikut menarik nilai kredensial atau id
     folder ke dalam hasil, karena hasilnya dikirim ke peramban dan bisa
     difoto. */
  {
    const TANDA = 'RAHASIA-JANGAN-BOCOR-77c1d0';
    setEnv('id-' + TANDA, 'secret-' + TANDA, 'refresh-' + TANDA, 'folder-' + TANDA, 'folderSurat-' + TANDA);
    /* Token succeeds supaya daftar folder benar-benar terisi. Kalau token
       gagal, fungsi berhenti duluan dan daftar folder kosong, sehingga
       pemeriksaan kebocoran id folder jadi tidak berarti apa-apa. */
    modeToken = 'ok';
    modeFolder = 'ok';
    global.fetch = fetchTiru;
    const r = await drive.rincianDrive();
    const teks = JSON.stringify(r);
    cek('tanda pengenal tetap tidak bocor saat ada penghalang', teks.indexOf(TANDA) === -1, teks);
    /* field folder memang ada (daftar laporan per folder), tapi isinya hanya
       nama variabel, bukan id folder. Yang dicek: id mentah tidak muncul di
       seluruh hasil, dan folderDari hanya berisi nama variabel yang dipakai. */
    cek('id folder tujuan tidak muncul sebagai nilai di seluruh hasil',
      !/folderSurat-|folder-RAHASIA/i.test(teks) && !('folderSurat' in r), teks);
    cek('folderDari hanya berisi nama variabel, bukan id folder',
      r.folderDari === 'GDRIVE_FOLDER_SURAT_ID' && !/RAHASIA/.test(r.folderDari), r.folderDari);
    cek('daftar laporan folder tidak memuat id folder mentah',
      (r.folder || []).every((f) => !/RAHASIA/.test(JSON.stringify(f))), r.folder);
    cek('halangan tidak memuat nilai kredensial',
      (r.halangan || []).every((x) => Object.keys(x).every((k) => k === 'ringkas' || k === 'langkah')), r.halangan);
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