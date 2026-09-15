/* Uji endpoint api/ocr.js — pembacaan kwitansi oleh AI.
   Tidak ada jaringan keluar: fetch ke penyedia AI diganti tiruan yang tahu
   model mana yang sedang dipanggil, jadi seluruh jalur (izin, batas ukuran,
   prompt, pembersihan hasil, pergantian model saat kuota habis) diuji
   sungguhan tanpa memakai kuota dan tanpa kunci asli.

   jalankan:  SETUP_ADMIN_PASSWORD='uji12345' node test_ocr.js
*/
'use strict';
process.env.SETUP_ADMIN_PASSWORD = process.env.SETUP_ADMIN_PASSWORD || 'uji12345';

const fs = require('fs'), path = require('path');
const DATA = path.join(process.cwd(), 'data');
try { fs.rmSync('/tmp/laz-db-cache.json', { force: true }); } catch (e) {}

const engine = require('./_engine.js');

let ok = 0, gagal = 0;
function cek(nama, syarat, info) {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 300)); }
}

/* ---- DB lembaga untuk uji ---- */
let DB = JSON.parse(fs.readFileSync('db-kll2-uji.json', 'utf8'));
function simpanDB() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'laz-db-local.json'), JSON.stringify(DB));
  fs.writeFileSync('/tmp/laz-db-cache.json', JSON.stringify(DB));
}
async function panggil(fn, args) {
  const out = await engine.runRPC(DB, fn, args, { ip: '127.0.0.1', ua: 'uji' });
  DB = out.db; simpanDB(); return out.result;
}

function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.tubuh = o; r.writableEnded = true; return r; };
  return r;
}

/* Memuat ulang modul dengan environment tertentu. Konstanta ocr.js dibaca
   sekali saat modul dimuat, jadi tiap skenario butuh muatan segar. */
function muatOcr(env) {
  ['OCR_PENYEDIA', 'OCR_API_KEY', 'OCR_MODEL', 'OCR_BATAS_HARIAN'].forEach((k) => { delete process.env[k]; });
  Object.keys(env || {}).forEach((k) => { process.env[k] = env[k]; });
  delete require.cache[require.resolve('./ocr.js')];
  return require('./ocr.js');
}
async function hit(mod, body, metode) {
  const req = { method: metode || 'POST', url: '/api/ocr', headers: { host: 'contoh.test' }, body: body };
  const res = balasan(); await mod(req, res); return res;
}

/* ---- fetch tiruan yang sadar model ---- */
const fetchAsli = global.fetch;
let PANGGILAN = [];
let JAWABAN = null;          /* {status, body} — dipakai bila model tidak ada di PER_MODEL */
let PER_MODEL = {};          /* {namaModel: {status, body}} */
function modelDariUrl(u) {
  const m = String(u).match(/models\/([^:?]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function pasangFetch() {
  global.fetch = async (url, opt) => {
    const s = String(url);
    const model = modelDariUrl(s);
    PANGGILAN.push({ url: s, model: model, opt: opt || {} });
    const j = PER_MODEL[model] || JAWABAN || { status: 200, body: {} };
    return {
      ok: j.status >= 200 && j.status < 300,
      status: j.status,
      json: async () => j.body,
    };
  };
}
function lepasFetch() { global.fetch = fetchAsli; }
function reset() { PANGGILAN = []; PER_MODEL = {}; JAWABAN = null; }

const GAMBAR = 'data:image/jpeg;base64,' + Buffer.from('foto-kwitansi-palsu').toString('base64');
const PILIHAN = {
  jenisDana: ['Zakat', 'Infak', 'Sedekah', 'Wakaf', 'Kurban', 'Fidyah', 'DSKL', 'Amil'],
  subJenis: {
    'Zakat': ['Zakat Mal', 'Zakat Fitrah', 'Zakat Profesi/Penghasilan'],
    'Infak': ['Infak Umum', 'Infak Terikat', 'Bagi Hasil Bank'],
  },
  metode: ['Cash/Tunai', 'Transfer Bank', 'QRIS', 'E-Wallet', 'Debit/Kartu'],
  tipeDonatur: ['Perorangan', 'Lembaga/Perusahaan', 'Hamba Allah', 'Kantor Layanan (KLL)', 'Unit Layanan (ULL)'],
};
function jawabGemini(objek) {
  return { status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(objek) }] } }] } };
}
/* Bentuk galat 429 Gemini: kuota HARIAN vs batas per menit dibedakan detailnya. */
function galat429Harian() {
  return { status: 429, body: { error: { code: 429, message: 'Resource has been exhausted',
    details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } } };
}
function galat429Menit() {
  return { status: 429, body: { error: { code: 429, message: 'Too many requests',
    details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } } };
}
const G404 = { status: 404, body: { error: { message: 'models/x is not found' } } };

const RANTAI3 = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];

(async () => {
  simpanDB();
  pasangFetch();

  const masuk = await panggil('login', ['superadmin', 'uji12345']);
  const TOKEN = masuk && masuk.token;

  console.log('=== A. PEMBERSIH NILAI ===');
  const H = muatOcr({ OCR_API_KEY: 'kunci-uji' })._internal;

  cek('tanggal ISO lewat apa adanya', H.rapikanTanggal('2026-01-12') === '2026-01-12', H.rapikanTanggal('2026-01-12'));
  cek('tanggal 12/01/2026 jadi 2026-01-12', H.rapikanTanggal('12/01/2026') === '2026-01-12', H.rapikanTanggal('12/01/2026'));
  cek('tanggal 12-01-2026 jadi 2026-01-12', H.rapikanTanggal('12-01-2026') === '2026-01-12', H.rapikanTanggal('12-01-2026'));
  cek('tanggal "5 Januari 2026" terbaca', H.rapikanTanggal('5 Januari 2026') === '2026-01-05', H.rapikanTanggal('5 Januari 2026'));
  cek('tanggal "17 Agustus 2026" terbaca', H.rapikanTanggal('17 Agustus 2026') === '2026-08-17', H.rapikanTanggal('17 Agustus 2026'));
  cek('tanggal ngawur ditolak jadi kosong', H.rapikanTanggal('kemarin sore') === '', H.rapikanTanggal('kemarin sore'));
  cek('bulan 13 ditolak', H.rapikanTanggal('2026-13-01') === '', H.rapikanTanggal('2026-13-01'));
  cek('tahun 1899 ditolak', H.rapikanTanggal('01/01/1899') === '', H.rapikanTanggal('01/01/1899'));
  cek('tanggal kosong tetap kosong', H.rapikanTanggal('') === '' && H.rapikanTanggal(null) === '');

  cek('jumlah "Rp 1.500.000,-" jadi 1500000', H.rapikanJumlah('Rp 1.500.000,-') === 1500000, H.rapikanJumlah('Rp 1.500.000,-'));
  cek('jumlah "1.500.000,00" jadi 1500000', H.rapikanJumlah('1.500.000,00') === 1500000, H.rapikanJumlah('1.500.000,00'));
  cek('jumlah angka murni lewat', H.rapikanJumlah(250000) === 250000);
  cek('jumlah "250000" jadi angka', H.rapikanJumlah('250000') === 250000, H.rapikanJumlah('250000'));
  cek('jumlah kosong jadi 0', H.rapikanJumlah('') === 0 && H.rapikanJumlah(null) === 0);
  cek('jumlah "Rp50.000" jadi 50000', H.rapikanJumlah('Rp50.000') === 50000, H.rapikanJumlah('Rp50.000'));

  cek('cocokkan persis', H.cocokkan('Infak', PILIHAN.jenisDana) === 'Infak');
  cek('cocokkan beda huruf besar', H.cocokkan('zakat', PILIHAN.jenisDana) === 'Zakat');
  cek('cocokkan sebagian', H.cocokkan('Tunai', PILIHAN.metode) === 'Cash/Tunai', H.cocokkan('Tunai', PILIHAN.metode));
  cek('tidak cocok jadi kosong', H.cocokkan('Kripto', PILIHAN.metode) === '', H.cocokkan('Kripto', PILIHAN.metode));
  cek('nilai kosong jadi kosong', H.cocokkan('', PILIHAN.metode) === '');

  cek('telepon 08 lolos', H.rapikanTelepon('0812-3456-7890') === '081234567890', H.rapikanTelepon('0812-3456-7890'));
  cek('telepon terlalu pendek ditolak', H.rapikanTelepon('123') === '');
  cek('email sah lolos', H.rapikanEmail('a@b.co') === 'a@b.co');
  cek('email ngawur ditolak', H.rapikanEmail('bukan email') === '');
  cek('teks dipangkas panjangnya', H.teks('x'.repeat(500), 40).length === 40);

  cek('JSON polos terbaca', (H.uraikanJSON('{"a":1}') || {}).a === 1);
  cek('JSON berpagar kode terbaca', (H.uraikanJSON('```json\n{"a":2}\n```') || {}).a === 2);
  cek('JSON diselipi kalimat tetap terbaca', (H.uraikanJSON('Ini hasilnya: {"a":3} semoga membantu') || {}).a === 3);
  cek('bukan JSON jadi null', H.uraikanJSON('maaf saya tidak bisa') === null);

  console.log('\n=== B. PILIHAN DARI PERAMBAN DIPANGKAS ===');
  const banyak = { jenisDana: new Array(200).fill('X'), metode: ['a'], tipeDonatur: [], subJenis: {} };
  cek('daftar jenis dana dibatasi 20', H.ambilPilihan(banyak).jenisDana.length <= 20, H.ambilPilihan(banyak).jenisDana.length);
  const panjang = { jenisDana: ['y'.repeat(400)] };
  cek('tiap pilihan dipangkas 60 huruf', H.ambilPilihan(panjang).jenisDana[0].length === 60);
  cek('pilihan bukan larik diabaikan', H.ambilPilihan({ jenisDana: 'bukan larik' }).jenisDana.length === 0);
  cek('pilihan kosong tidak meledak', H.ambilPilihan(null).metode.length === 0);

  const prompt = H.susunPrompt(H.ambilPilihan(PILIHAN));
  cek('prompt memuat daftar jenis dana', prompt.indexOf('Infak') >= 0);
  cek('prompt memuat daftar metode', prompt.indexOf('Cash/Tunai') >= 0);
  cek('prompt memuat sub jenis per jenis', prompt.indexOf('Zakat Fitrah') >= 0);
  cek('prompt melarang menebak', /JANGAN menebak/i.test(prompt));
  cek('prompt meminta JSON saja', /JSON saja/i.test(prompt));

  console.log('\n=== C. METODE & AKSI ===');
  const M = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  let r = await hit(M, {}, 'GET');
  cek('GET ditolak 405', r.statusCode === 405, r.tubuh);
  r = await hit(M, { aksi: 'hapus-semua', token: TOKEN });
  cek('aksi asing ditolak 400', r.statusCode === 400 && /tidak dikenal/i.test(r.tubuh.__error), r.tubuh);

  console.log('\n=== D. IZIN ===');
  r = await hit(M, { aksi: 'baca', token: '', gambar: GAMBAR });
  cek('tanpa token ditolak 401', r.statusCode === 401, r.tubuh);
  r = await hit(M, { aksi: 'baca', token: 'token-palsu-123', gambar: GAMBAR });
  cek('token palsu ditolak 401', r.statusCode === 401, r.tubuh);

  /* pengguna tanpa izin penghimpunan */
  await panggil('apiSaveUser', [TOKEN, {
    username: 'tamuocr', nama: 'Tamu OCR', password: 'uji12345', role: 'staff',
    perms: { dashboard: { view: true } }, aktif: true,
  }]);
  const tamu = await panggil('login', ['tamuocr', 'uji12345']);
  r = await hit(M, { aksi: 'baca', token: tamu.token, gambar: GAMBAR });
  cek('pengguna tanpa izin penghimpunan ditolak 403', r.statusCode === 403, r.tubuh);
  r = await hit(M, { aksi: 'status', token: tamu.token });
  cek('status pun ditolak untuk yang tidak boleh melihat', r.statusCode === 403, r.tubuh);
  r = await hit(M, { aksi: 'model-list', token: tamu.token });
  cek('daftar model juga terlindungi izin', r.statusCode === 403, r.tubuh);

  console.log('\n=== E. STATUS FITUR ===');
  reset();
  const MATI = muatOcr({});
  r = await hit(MATI, { aksi: 'status', token: TOKEN });
  cek('tanpa kunci: status aktif=false', r.tubuh.result && r.tubuh.result.aktif === false, r.tubuh);
  cek('tanpa kunci: nama model tidak dibocorkan', r.tubuh.result.model === '' && r.tubuh.result.rantai.length === 0, r.tubuh);
  r = await hit(MATI, { aksi: 'baca', token: TOKEN, gambar: GAMBAR });
  cek('tanpa kunci: baca dijawab pesan setelan, bukan error mentah', /OCR_API_KEY/.test(r.tubuh.__error || ''), r.tubuh);
  r = await hit(MATI, { aksi: 'model-list', token: TOKEN });
  cek('tanpa kunci: daftar model juga dijawab pesan setelan', /OCR_API_KEY/.test(r.tubuh.__error || ''), r.tubuh);
  cek('tanpa kunci: tidak ada panggilan keluar', PANGGILAN.length === 0, PANGGILAN.length);

  r = await hit(M, { aksi: 'status', token: TOKEN });
  cek('dengan kunci: status aktif=true', r.tubuh.result.aktif === true, r.tubuh);
  cek('dengan kunci: penyedia dilaporkan', r.tubuh.result.penyedia === 'gemini', r.tubuh);
  cek('status TIDAK pernah memuat kunci', JSON.stringify(r.tubuh).indexOf('kunci-uji') < 0, r.tubuh);

  console.log('\n=== F. RANTAI MODEL ===');
  cek('rantai bawaan gemini berisi 3 model', JSON.stringify(M._internal.RANTAI) === JSON.stringify(RANTAI3), M._internal.RANTAI);
  cek('yang paling murah didahulukan', M._internal.RANTAI[0] === 'gemini-2.5-flash', M._internal.RANTAI);
  r = await hit(M, { aksi: 'status', token: TOKEN });
  cek('status melaporkan seluruh rantai', JSON.stringify(r.tubuh.result.rantai) === JSON.stringify(RANTAI3), r.tubuh.result);

  const R2 = muatOcr({ OCR_API_KEY: 'kunci-uji', OCR_MODEL: 'gemini-2.5-flash, gemini-2.5-pro' });
  cek('OCR_MODEL dipisah koma jadi rantai', JSON.stringify(R2._internal.RANTAI) === JSON.stringify(['gemini-2.5-flash', 'gemini-2.5-pro']), R2._internal.RANTAI);
  cek('spasi di sekitar koma dibuang', R2._internal.RANTAI[1] === 'gemini-2.5-pro');
  const R1 = muatOcr({ OCR_API_KEY: 'kunci-uji', OCR_MODEL: 'gemini-2.5-pro' });
  cek('satu model saja tetap sah', JSON.stringify(R1._internal.RANTAI) === JSON.stringify(['gemini-2.5-pro']), R1._internal.RANTAI);
  const RK = muatOcr({ OCR_API_KEY: 'kunci-uji', OCR_MODEL: '  ,  , ' });
  cek('OCR_MODEL kosong kembali ke bawaan', JSON.stringify(RK._internal.RANTAI) === JSON.stringify(RANTAI3), RK._internal.RANTAI);

  console.log('\n=== G. PERGANTIAN MODEL SAAT KUOTA HABIS ===');
  const C = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  PER_MODEL['gemini-2.5-flash'] = galat429Harian();
  PER_MODEL['gemini-2.5-flash-lite'] = jawabGemini({ namaDonatur: 'Pindah Model', jumlah: 10000 });
  r = await hit(C, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('model pertama kehabisan kuota → langsung pindah, bukan gagal',
    r.tubuh.result && r.tubuh.result.isi.namaDonatur === 'Pindah Model', r.tubuh);
  cek('dicoba tepat dua model', PANGGILAN.length === 2, PANGGILAN.map((x) => x.model));
  cek('urutannya sesuai rantai', PANGGILAN[0].model === 'gemini-2.5-flash' && PANGGILAN[1].model === 'gemini-2.5-flash-lite', PANGGILAN.map((x) => x.model));
  cek('hasil menyebut model yang dipakai', r.tubuh.result.model === 'gemini-2.5-flash-lite', r.tubuh.result);
  cek('ditandai sebagai model cadangan', r.tubuh.result.cadangan === true, r.tubuh.result);

  /* model yang kehabisan kuota harian tidak boleh dicoba lagi hari itu */
  PANGGILAN = [];
  r = await hit(C, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('permintaan berikutnya TIDAK menyentuh model yang kuotanya habis',
    PANGGILAN.every((x) => x.model !== 'gemini-2.5-flash'), PANGGILAN.map((x) => x.model));
  cek('langsung ke model cadangan, hemat satu panggilan', PANGGILAN.length === 1, PANGGILAN.map((x) => x.model));
  r = await hit(C, { aksi: 'status', token: TOKEN });
  cek('status melaporkan model yang sedang istirahat',
    /kuota harian/i.test(r.tubuh.result.istirahat['gemini-2.5-flash'] || ''), r.tubuh.result.istirahat);

  console.log('\n=== H. BEDA KUOTA HARIAN vs BATAS PER MENIT ===');
  const P = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  PER_MODEL['gemini-2.5-flash'] = galat429Menit();
  PER_MODEL['gemini-2.5-flash-lite'] = jawabGemini({ namaDonatur: 'Sebentar', jumlah: 5000 });
  r = await hit(P, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('batas per menit juga memicu pindah model', r.tubuh.result.model === 'gemini-2.5-flash-lite', r.tubuh.result);
  r = await hit(P, { aksi: 'status', token: TOKEN });
  cek('alasannya dibedakan dari kuota harian',
    /sementara/i.test(r.tubuh.result.istirahat['gemini-2.5-flash'] || ''), r.tubuh.result.istirahat);
  cek('istirahat harian jauh lebih lama dari yang per menit',
    H.detikSampaiResetKuota() > 90, H.detikSampaiResetKuota());
  cek('hitungan reset kuota masuk akal (5 menit – 24 jam)',
    H.detikSampaiResetKuota() >= 300 && H.detikSampaiResetKuota() <= 86400, H.detikSampaiResetKuota());

  console.log('\n=== I. MODEL TIDAK DIDUKUNG KUNCI (404) ===');
  const N = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  PER_MODEL['gemini-2.5-flash'] = G404;
  PER_MODEL['gemini-2.5-flash-lite'] = G404;
  PER_MODEL['gemini-2.5-pro'] = jawabGemini({ namaDonatur: 'Cuma Pro', jumlah: 7000 });
  r = await hit(N, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('model yang tidak dikenal kunci dilewati, bukan menggagalkan',
    r.tubuh.result && r.tubuh.result.isi.namaDonatur === 'Cuma Pro', r.tubuh);
  cek('seluruh rantai ditelusuri sampai ketemu', PANGGILAN.length === 3, PANGGILAN.map((x) => x.model));
  PANGGILAN = [];
  r = await hit(N, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('model yang tidak ada diingat, tidak dicoba lagi', PANGGILAN.length === 1 && PANGGILAN[0].model === 'gemini-2.5-pro', PANGGILAN.map((x) => x.model));

  console.log('\n=== J. SEMUA MODEL HABIS ===');
  const Z = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  RANTAI3.forEach((m) => { PER_MODEL[m] = galat429Harian(); });
  r = await hit(Z, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('dijawab 200 dengan pesan, bukan crash', r.statusCode === 200 && !!r.tubuh.__error, r.tubuh);
  cek('pesannya menyebut semua model habis', /semua model/i.test(r.tubuh.__error), r.tubuh.__error);
  cek('pesannya memberi tahu kapan kuota pulih', /pulih|WIB|Pasifik/i.test(r.tubuh.__error), r.tubuh.__error);
  cek('pesannya menyarankan isi manual', /manual/i.test(r.tubuh.__error), r.tubuh.__error);
  cek('tiap model dicoba tepat sekali', PANGGILAN.length === 3, PANGGILAN.map((x) => x.model));
  PANGGILAN = [];
  r = await hit(Z, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('saat semua istirahat, tidak ada panggilan keluar sama sekali', PANGGILAN.length === 0, PANGGILAN.length);
  cek('tetap dijawab pesan yang sama jelasnya', /semua model/i.test(r.tubuh.__error || ''), r.tubuh.__error);

  console.log('\n=== K. GALAT YANG TIDAK BISA DIPERBAIKI GANTI MODEL ===');
  const K = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  JAWABAN = { status: 401, body: { error: { message: 'API key not valid: kunci-uji' } } };
  r = await hit(K, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('kunci salah: berhenti di model pertama, tidak membuang kuota', PANGGILAN.length === 1, PANGGILAN.map((x) => x.model));
  cek('kunci salah: pesan menyebut OCR_API_KEY', /OCR_API_KEY/.test(r.tubuh.__error), r.tubuh);
  cek('kunci TIDAK bocor di pesan galat', JSON.stringify(r.tubuh).indexOf('kunci-uji') < 0, r.tubuh);

  const K2 = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  JAWABAN = { status: 500, body: { error: { message: 'boom kunci-uji boom' } } };
  r = await hit(K2, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('500 dianggap sesaat: seluruh rantai dicoba', PANGGILAN.length === 3, PANGGILAN.map((x) => x.model));
  cek('kunci disensor dari pesan penyedia', JSON.stringify(r.tubuh).indexOf('kunci-uji') < 0, r.tubuh);

  const K3 = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  global.fetch = async () => { throw new Error('jaringan putus'); };
  r = await hit(K3, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('jaringan putus dijawab rapi, bukan crash', r.statusCode === 200 && !!r.tubuh.__error, r.tubuh);
  pasangFetch();

  console.log('\n=== L. PEMERIKSAAN GAMBAR ===');
  const G = muatOcr({ OCR_API_KEY: 'kunci-uji' });
  reset();
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: '' });
  cek('gambar kosong ditolak 400', r.statusCode === 400, r.tubuh);
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: 'data:application/pdf;base64,AAAA' });
  cek('PDF ditolak 400', r.statusCode === 400 && /tidak didukung/i.test(r.tubuh.__error), r.tubuh);
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: 'data:image/jpeg;base64,' + 'A'.repeat(5 * 1024 * 1024) });
  cek('gambar kelewat besar ditolak 413', r.statusCode === 413, r.statusCode);
  cek('gambar ditolak tanpa memanggil AI', PANGGILAN.length === 0, PANGGILAN.length);

  console.log('\n=== M. HASIL BACAAN ===');
  reset();
  JAWABAN = jawabGemini({
    tanggal: '12/01/2026', namaDonatur: 'Ahmad Fauzi', tipeDonatur: 'Perorangan',
    jumlah: 'Rp 1.500.000,-', jenisDana: 'zakat', subJenis: 'Zakat Mal',
    program: 'Beasiswa Yatim', metode: 'Tunai', noKwitansi: 'KW-0012',
    telepon: '0812-3456-7890', alamat: 'Bantul', keterangan: 'lunas',
    raguRagu: ['alamat'],
  });
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  const hasil = r.tubuh.result;
  cek('cukup satu panggilan kalau model pertama sehat', PANGGILAN.length === 1, PANGGILAN.length);
  cek('model utama tidak ditandai cadangan', hasil.cadangan === false && hasil.model === 'gemini-2.5-flash', hasil);
  cek('URL menuju Gemini', /generativelanguage\.googleapis\.com/.test(PANGGILAN[0].url), PANGGILAN[0].url);
  cek('kunci dikirim lewat header, bukan query string', PANGGILAN[0].url.indexOf('kunci-uji') < 0
    && PANGGILAN[0].opt.headers['x-goog-api-key'] === 'kunci-uji', PANGGILAN[0].url);
  cek('gambar ikut terkirim', PANGGILAN[0].opt.body.indexOf('inline_data') >= 0);
  cek('suhu nol agar hasilnya stabil', /"temperature":0/.test(PANGGILAN[0].opt.body));

  cek('terbaca = true', hasil.terbaca === true, hasil);
  cek('tanggal dinormalkan', hasil.isi.tanggal === '2026-01-12', hasil.isi.tanggal);
  cek('jumlah jadi angka', hasil.isi.jumlah === 1500000, hasil.isi.jumlah);
  cek('jenis dana dicocokkan ke daftar', hasil.isi.jenisDana === 'Zakat', hasil.isi.jenisDana);
  cek('sub jenis dicocokkan sesuai jenisnya', hasil.isi.subJenis === 'Zakat Mal', hasil.isi.subJenis);
  cek('metode "Tunai" dipetakan ke Cash/Tunai', hasil.isi.metode === 'Cash/Tunai', hasil.isi.metode);
  cek('tipe donatur dicocokkan', hasil.isi.tipeDonatur === 'Perorangan', hasil.isi.tipeDonatur);
  cek('nama donatur apa adanya', hasil.isi.namaDonatur === 'Ahmad Fauzi', hasil.isi.namaDonatur);
  cek('telepon dibersihkan', hasil.isi.telepon === '081234567890', hasil.isi.telepon);
  cek('ragu-ragu diteruskan', hasil.raguRagu.indexOf('alamat') >= 0, hasil.raguRagu);
  cek('balasan tidak memuat kunci', JSON.stringify(r.tubuh).indexOf('kunci-uji') < 0);

  console.log('\n=== N. HASIL AI YANG NAKAL ===');
  JAWABAN = jawabGemini({ jenisDana: 'Kripto', subJenis: 'Zakat Mal', metode: 'Barter', tipeDonatur: 'Alien', jumlah: 'entah' });
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('jenis dana di luar daftar dibuang', r.tubuh.result.isi.jenisDana === '', r.tubuh.result.isi);
  cek('sub jenis ikut dibuang kalau jenisnya tidak sah', r.tubuh.result.isi.subJenis === '', r.tubuh.result.isi);
  cek('metode di luar daftar dibuang', r.tubuh.result.isi.metode === '');
  cek('tipe donatur di luar daftar dibuang', r.tubuh.result.isi.tipeDonatur === '');
  cek('jumlah tak terbaca jadi 0', r.tubuh.result.isi.jumlah === 0);
  cek('semuanya kosong → terbaca=false', r.tubuh.result.terbaca === false, r.tubuh.result);

  JAWABAN = jawabGemini({ namaDonatur: 'x'.repeat(500), keterangan: 'y'.repeat(900), alamat: 'z'.repeat(400) });
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('nama sepanjang apa pun dipangkas', r.tubuh.result.isi.namaDonatur.length === 80, r.tubuh.result.isi.namaDonatur.length);
  cek('keterangan dipangkas', r.tubuh.result.isi.keterangan.length === 200);
  cek('alamat dipangkas', r.tubuh.result.isi.alamat.length === 140);

  JAWABAN = { status: 200, body: { candidates: [{ content: { parts: [{ text: 'Maaf, saya tidak bisa membantu.' }] } }] } };
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('jawaban bukan JSON tidak bikin 500', r.statusCode === 200 && r.tubuh.result.terbaca === false, r.tubuh);

  JAWABAN = jawabGemini({ raguRagu: ['tanggal', 'drop table', 'jumlah'], jumlah: 5000 });
  r = await hit(G, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('raguRagu hanya menerima nama kolom yang ada', r.tubuh.result.raguRagu.indexOf('drop table') < 0
    && r.tubuh.result.raguRagu.indexOf('jumlah') >= 0, r.tubuh.result.raguRagu);

  console.log('\n=== O. DAFTAR MODEL YANG DIDUKUNG KUNCI ===');
  const D = muatOcr({ OCR_API_KEY: 'kunci-uji', OCR_MODEL: 'gemini-2.5-flash,gemini-9.9-khayalan' });
  reset();
  JAWABAN = { status: 200, body: { models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ] } };
  r = await hit(D, { aksi: 'model-list', token: TOKEN });
  cek('model yang tidak bisa generateContent disaring',
    (r.tubuh.result.tersedia || []).indexOf('text-embedding-004') < 0, r.tubuh.result);
  cek('model yang tersedia terdaftar', (r.tubuh.result.tersedia || []).indexOf('gemini-2.5-pro') >= 0, r.tubuh.result);
  cek('awalan "models/" dibuang', (r.tubuh.result.tersedia || []).every((x) => x.indexOf('models/') < 0), r.tubuh.result);
  cek('model rantai yang sah ditandai', (r.tubuh.result.rantaiSah || []).indexOf('gemini-2.5-flash') >= 0, r.tubuh.result);
  cek('model rantai yang tidak dikenal ditandai',
    (r.tubuh.result.rantaiTidakDikenal || []).indexOf('gemini-9.9-khayalan') >= 0, r.tubuh.result);
  cek('daftar model tidak membocorkan kunci', JSON.stringify(r.tubuh).indexOf('kunci-uji') < 0, r.tubuh);

  console.log('\n=== P. PENYEDIA OPENAI ===');
  const O = muatOcr({ OCR_PENYEDIA: 'openai', OCR_API_KEY: 'sk-uji' });
  reset();
  JAWABAN = { status: 200, body: { choices: [{ message: { content: '{"namaDonatur":"Siti","jumlah":75000}' } }] } };
  r = await hit(O, { aksi: 'baca', token: TOKEN, gambar: GAMBAR, pilihan: PILIHAN });
  cek('URL menuju OpenAI', /api\.openai\.com/.test(PANGGILAN[0].url), PANGGILAN[0].url);
  cek('kunci dikirim lewat header Authorization', PANGGILAN[0].opt.headers.Authorization === 'Bearer sk-uji');
  cek('model bawaan openai dipakai', /gpt-4o-mini/.test(PANGGILAN[0].opt.body), PANGGILAN[0].opt.body.slice(0, 80));
  cek('hasil openai terbaca', r.tubuh.result.isi.namaDonatur === 'Siti' && r.tubuh.result.isi.jumlah === 75000, r.tubuh.result.isi);

  const OM = muatOcr({ OCR_PENYEDIA: 'openai', OCR_API_KEY: 'sk-uji', OCR_MODEL: 'gpt-5-mini' });
  reset();
  r = await hit(OM, { aksi: 'status', token: TOKEN });
  cek('OCR_MODEL menimpa bawaan', r.tubuh.result.model === 'gpt-5-mini', r.tubuh.result);

  console.log('\n=== Q. KEAMANAN KODE ===');
  const kode = fs.readFileSync('ocr.js', 'utf8');
  cek('tidak ada kunci API tertulis di kode', !/AIza[0-9A-Za-z_-]{20,}/.test(kode) && !/sk-[A-Za-z0-9]{20,}/.test(kode));
  cek('kunci hanya dibaca dari environment', /process\.env\.OCR_API_KEY/.test(kode));
  cek('izin diperiksa lewat engine.cekIzin', /cekIzin\(/.test(kode));
  cek('modul penghimpunan yang dipakai, bukan modul lain', /'penghimpunan'/.test(kode));

  const appjs = fs.readFileSync('app.js', 'utf8');
  cek('peramban memanggil /api/ocr, bukan penyedia langsung', /'\/api\/ocr'/.test(appjs)
    && appjs.indexOf('generativelanguage.googleapis.com') < 0);
  cek('peramban tidak memegang kunci apa pun', appjs.indexOf('OCR_API_KEY') < 0);
  cek('peramban memberi tahu kalau model cadangan yang dipakai', /model cadangan/i.test(appjs));

  lepasFetch();
  console.log('\ntest_ocr.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exit(gagal ? 1 : 0);
})().catch((e) => { lepasFetch(); console.error(e); process.exit(1); });
