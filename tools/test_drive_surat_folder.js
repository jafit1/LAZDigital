/* Uji properti folder Google Drive khusus lampiran Surat (api/_drive.js).
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Lampiran Modul Surat & Pengajuan akan naik ke folder Drive tersendiri
 * (GDRIVE_FOLDER_SURAT_ID), terpisah dari folder cadangan basis data
 * (GDRIVE_FOLDER_ID) yang dipakai api/backup.js. Fungsi driveSiap() yang
 * sudah dipakai api/backup.js TIDAK boleh ikut berubah perilakunya hanya
 * karena folder surat ditambahkan, dan fungsi baru driveSiapSurat() harus
 * benar untuk setiap kombinasi kredensial dan folder, bukan cuma pada
 * beberapa contoh yang kebetulan terpikirkan.
 *
 * Berkas ini murni menguji api/_drive.js lewat process.env yang disetel
 * sementara (disetel dan dikembalikan di akhir uji, mengikuti pola
 * tools/_pagar-db.js), tanpa memanggil Google Drive API sungguhan.
 *
 *   node tools/test_drive_surat_folder.js
 */
'use strict';
const path = require('path');
const AKAR = path.join(__dirname, '..');

const VAR_ENV = ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN', 'GDRIVE_FOLDER_ID', 'GDRIVE_FOLDER_SURAT_ID'];
/* Simpan nilai asli supaya bisa dikembalikan di akhir uji, tidak bocor ke uji lain. */
const ASLI = {};
for (const k of VAR_ENV) ASLI[k] = process.env[k];

const drive = require(path.join(AKAR, 'api', '_drive.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

/* Nilai acak "terisi" atau "kosong" untuk satu variabel lingkungan. */
function nilaiAcak() {
  return Math.random() < 0.5 ? '' : ('nilai-acak-' + Math.random().toString(36).slice(2, 10));
}
function terisi(v) { return !!v; }

function setEnv(id, secret, refresh, folder, folderSurat) {
  process.env.GDRIVE_CLIENT_ID = id;
  process.env.GDRIVE_CLIENT_SECRET = secret;
  process.env.GDRIVE_REFRESH_TOKEN = refresh;
  process.env.GDRIVE_FOLDER_ID = folder;
  process.env.GDRIVE_FOLDER_SURAT_ID = folderSurat;
}

console.log('\n=== PROPERTY 1: driveSiapSurat() mengikuti folder surat atau folder cadangan ===');
/* Untuk semua kombinasi Kredensial_Dasar (lengkap/tidak) dan nilai
   Folder_Surat serta Folder_Cadangan (terisi/kosong), driveSiapSurat()
   harus benar jika dan hanya jika Kredensial_Dasar lengkap DAN
   (Folder_Surat terisi ATAU Folder_Cadangan terisi). */
{
  const ITERASI = 150;
  let semuaBenar = true;
  let contohGagal = null;
  for (let i = 0; i < ITERASI; i++) {
    const id = nilaiAcak(), secret = nilaiAcak(), refresh = nilaiAcak();
    const folder = nilaiAcak(), folderSurat = nilaiAcak();
    setEnv(id, secret, refresh, folder, folderSurat);

    const kredensialLengkap = terisi(id) && terisi(secret) && terisi(refresh);
    const harapan = !!(kredensialLengkap && (terisi(folderSurat) || terisi(folder)));
    const hasil = typeof drive.driveSiapSurat === 'function' ? drive.driveSiapSurat() : undefined;

    if (hasil !== harapan) {
      semuaBenar = false;
      contohGagal = { id, secret, refresh, folder, folderSurat, harapan, hasil };
      break;
    }
  }
  cek('driveSiapSurat() benar jika dan hanya jika kredensial lengkap dan (folder surat atau folder cadangan terisi), ' + ITERASI + ' iterasi acak', semuaBenar, contohGagal);
}

console.log('\n=== PROPERTY 2: driveSiap() tidak berubah akibat Folder_Surat ===');
/* Kredensial_Dasar dan Folder_Cadangan tetap (dipilih sekali, lengkap dan
   folder cadangan terisi, supaya driveSiap() mestinya tetap benar), lalu
   Folder_Surat diacak terisi/kosong pada setiap iterasi. Hasil driveSiap()
   tidak boleh pernah berubah akibat nilai Folder_Surat. */
{
  const ID_TETAP = 'id-tetap-1a2b3c';
  const SECRET_TETAP = 'secret-tetap-4d5e6f';
  const REFRESH_TETAP = 'refresh-tetap-7g8h9i';
  const FOLDER_TETAP = 'folder-cadangan-tetap-j0k1l2';

  const ITERASI = 150;
  let semuaSama = true;
  let contohGagal = null;
  let hasilPertama = null;
  for (let i = 0; i < ITERASI; i++) {
    const folderSurat = nilaiAcak();
    setEnv(ID_TETAP, SECRET_TETAP, REFRESH_TETAP, FOLDER_TETAP, folderSurat);
    const hasil = drive.driveSiap();
    if (hasilPertama === null) hasilPertama = hasil;
    if (hasil !== hasilPertama) {
      semuaSama = false;
      contohGagal = { folderSurat, hasilPertama, hasil };
      break;
    }
  }
  cek('driveSiap() tetap benar untuk kredensial lengkap dan folder cadangan terisi, berapa pun nilai folder surat, ' + ITERASI + ' iterasi acak', semuaSama && hasilPertama === true, contohGagal || { hasilPertama });

  /* Ulangi dengan kredensial tidak lengkap: driveSiap() mestinya tetap
     salah berapa pun nilai Folder_Surat, membuktikan Folder_Surat juga
     tidak bisa "menolong" driveSiap() jadi benar. */
  let semuaSamaKurang = true;
  let contohGagalKurang = null;
  let hasilPertamaKurang = null;
  for (let i = 0; i < ITERASI; i++) {
    const folderSurat = nilaiAcak();
    setEnv('', SECRET_TETAP, REFRESH_TETAP, FOLDER_TETAP, folderSurat);
    const hasil = drive.driveSiap();
    if (hasilPertamaKurang === null) hasilPertamaKurang = hasil;
    if (hasil !== hasilPertamaKurang) {
      semuaSamaKurang = false;
      contohGagalKurang = { folderSurat, hasilPertamaKurang, hasil };
      break;
    }
  }
  cek('driveSiap() tetap salah untuk kredensial tidak lengkap, berapa pun nilai folder surat, ' + ITERASI + ' iterasi acak', semuaSamaKurang && hasilPertamaKurang === false, contohGagalKurang || { hasilPertamaKurang });
}

/* Generator nilai acak untuk Property 3 dan 4. */
function namaBerkasAcak() {
  const basis = ['surat', 'lampiran', 'berkas', 'dokumen'];
  const ekstensi = ['pdf', 'jpg', 'png', 'docx'];
  return basis[Math.floor(Math.random() * basis.length)] + '-' + Math.random().toString(36).slice(2, 10)
    + '.' + ekstensi[Math.floor(Math.random() * ekstensi.length)];
}
function bufferAcak() {
  const panjang = 1 + Math.floor(Math.random() * 64);
  const byte = [];
  for (let i = 0; i < panjang; i++) byte.push(Math.floor(Math.random() * 256));
  return Buffer.from(byte);
}
function mimeAcak() {
  const list = ['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'];
  return list[Math.floor(Math.random() * list.length)];
}
function folderAcak() {
  return 'folder-acak-' + Math.random().toString(36).slice(2, 12);
}

/* Ambil metadata JSON (bagian pertama body multipart) dari body yang
 * dikirim unggahBiner ke Google Drive. Metadata selalu satu baris (hasil
 * JSON.stringify, newline di dalam nilai sudah lolos-escape jadi "\n"
 * literal dua karakter, bukan baris baru sungguhan), jadi aman diambil
 * dengan pola "setelah baris kosong, sampai sebelum batas berikutnya". */
function metaDariBodyMultipart(body) {
  const teks = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  const cocok = teks.match(/\r\n\r\n(\{[^\r\n]*\})\r\n--/);
  if (!cocok) return null;
  try { return JSON.parse(cocok[1]); } catch (e) { return null; }
}

/* Tiruan global.fetch: membalas permintaan token OAuth dan permintaan
 * unggah multipart tanpa pernah menyentuh Google Drive sungguhan. Body
 * permintaan unggah ditangkap ke dalam bodyTertangkap supaya uji bisa
 * memeriksa field `parents` pada metadatanya. */
let bodyTertangkap = null;
async function fetchTiru(url, opt) {
  const u = String(url);
  if (u.indexOf('oauth2.googleapis.com/token') !== -1) {
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({ access_token: 'token-tiruan' }),
      json: async () => ({ access_token: 'token-tiruan' })
    };
  }
  bodyTertangkap = opt && opt.body;
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ id: 'id-tiruan', name: 'nama-tiruan' })
  };
}

console.log('\n=== PROPERTY 3: unggahBiner() tanpa parameter folder memakai Folder_Cadangan ===');
/* Untuk nama berkas, isi buffer, dan mime acak, memanggil unggahBiner()
   tanpa parameter folder (signature lama, 3 argumen) harus tetap memakai
   Folder_Cadangan (GDRIVE_FOLDER_ID) sebagai parents, persis seperti yang
   dipakai api/backup.js hari ini. */
{
  const fetchAsli = global.fetch;
  global.fetch = fetchTiru;
  const ITERASI = 120;
  let semuaBenar = true;
  let contohGagal = null;
  (async () => {
    for (let i = 0; i < ITERASI; i++) {
      const folderCadangan = folderAcak();
      setEnv('id-tetap', 'secret-tetap', 'refresh-tetap', folderCadangan, nilaiAcak());
      const nama = namaBerkasAcak(), buf = bufferAcak(), mime = mimeAcak();
      bodyTertangkap = null;
      try {
        await drive.unggahBiner(nama, buf, mime);
      } catch (e) {
        semuaBenar = false;
        contohGagal = { nama, mime, folderCadangan, galat: String(e && e.message || e) };
        break;
      }
      const meta = metaDariBodyMultipart(bodyTertangkap);
      const parents = meta && meta.parents;
      const sesuai = Array.isArray(parents) && parents.length === 1 && parents[0] === folderCadangan;
      if (!sesuai) {
        semuaBenar = false;
        contohGagal = { nama, mime, folderCadangan, parents };
        break;
      }
    }
    global.fetch = fetchAsli;
    cek('unggahBiner(nama, buf, mime) tanpa parameter folder memakai Folder_Cadangan sebagai parents, ' + ITERASI + ' iterasi acak', semuaBenar, contohGagal);
    lanjutProperty4();
  })();
}

function lanjutProperty4() {
console.log('\n=== PROPERTY 4: unggahBiner() dengan parameter folder eksplisit mengabaikan Folder_Cadangan/Folder_Surat ===');
/* Untuk nama berkas, isi buffer, mime, dan folder eksplisit acak,
   memanggil unggahBiner(nama, buf, mime, folder) harus memakai folder
   eksplisit tersebut sebagai parents, terlepas dari nilai acak apa pun
   pada Folder_Cadangan dan Folder_Surat saat itu. */
{
  const fetchAsli = global.fetch;
  global.fetch = fetchTiru;
  const ITERASI = 120;
  let semuaBenar = true;
  let contohGagal = null;
  (async () => {
    for (let i = 0; i < ITERASI; i++) {
      const folderEksplisit = folderAcak();
      const folderCadangan = nilaiAcak(), folderSurat = nilaiAcak();
      setEnv('id-tetap', 'secret-tetap', 'refresh-tetap', folderCadangan, folderSurat);
      const nama = namaBerkasAcak(), buf = bufferAcak(), mime = mimeAcak();
      bodyTertangkap = null;
      try {
        await drive.unggahBiner(nama, buf, mime, folderEksplisit);
      } catch (e) {
        semuaBenar = false;
        contohGagal = { nama, mime, folderEksplisit, folderCadangan, folderSurat, galat: String(e && e.message || e) };
        break;
      }
      const meta = metaDariBodyMultipart(bodyTertangkap);
      const parents = meta && meta.parents;
      const sesuai = Array.isArray(parents) && parents.length === 1 && parents[0] === folderEksplisit;
      if (!sesuai) {
        semuaBenar = false;
        contohGagal = { nama, mime, folderEksplisit, folderCadangan, folderSurat, parents };
        break;
      }
    }
    global.fetch = fetchAsli;
    cek('unggahBiner(nama, buf, mime, folder) memakai folder eksplisit sebagai parents terlepas dari Folder_Cadangan/Folder_Surat, ' + ITERASI + ' iterasi acak', semuaBenar, contohGagal);
    selesaiUji();
  })();
}
}

function selesaiUji() {
/* Kembalikan process.env ke nilai aslinya supaya tidak bocor ke uji lain. */
for (const k of VAR_ENV) {
  if (ASLI[k] === undefined) delete process.env[k];
  else process.env[k] = ASLI[k];
}

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { console.log('\nJANGAN dideploy: properti folder Drive khusus surat belum benar.\n'); process.exit(1); }
console.log('\ntest_drive_surat_folder.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
}
