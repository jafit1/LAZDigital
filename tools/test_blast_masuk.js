/* Uji: pintu pesan masuk WhatsApp (api/blast-masuk.js) tidak boleh menerima
 * kiriman dari sembarang orang.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Pintu ini menerima kiriman dari penyedia WhatsApp (Fonnte atau Meta) setiap
 * kali ada pesan masuk ke nomor lembaga. Sebelum perbaikan ini, ia tidak
 * memeriksa pengirimnya sama sekali. Alamatnya bisa dibaca di repositori yang
 * PUBLIK, jadi siapa pun bisa mengirim POST ke sana dan:
 *   - memasukkan pesan palsu ke kotak masuk amil atas nama nomor mana pun
 *     ("saya donatur, tolong kirim ke rekening ini");
 *   - membanjiri daftar kontak dengan nomor karangan;
 *   - mengirim "STOP" atas nama nomor donatur sungguhan, sehingga donatur itu
 *     masuk daftar hitam dan diam-diam tidak lagi menerima broadcast.
 *
 * Gateway WhatsApp mandiri milik lembaga TIDAK lewat pintu ini (ia memakai
 * api/blast-agen.js yang dijaga BLAST_AGEN_TOKEN), jadi pintu ini boleh
 * tertutup secara bawaan. Ia hanya dibuka kalau BLAST_MASUK_KUNCI disetel, dan
 * penyedia harus menyertakan kunci itu di alamat (?kunci=...) atau di header
 * x-masuk-kunci. Kunci di alamat dipilih karena Fonnte tidak bisa menambah
 * header sendiri.
 *
 *   node tools/test_blast_masuk.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const AKAR = path.join(__dirname, '..');

/* Basis data broadcast disimpan di folder sementara, bukan di .data proyek. */
const KERJA = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-masuk-'));
process.chdir(KERJA);
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.BLAST_MASUK_KUNCI;
process.env.META_VERIFY_TOKEN = 'verifikasi-uji';

const db = require(path.join(AKAR, 'lib', 'blast', 'db'));
const kontakLib = require(path.join(AKAR, 'lib', 'blast', 'kontak'));
const masuk = require(path.join(AKAR, 'api', 'blast-masuk.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200)); }
};

function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.tubuh = o; r.writableEnded = true; return r; };
  r.end = (s) => { try { r.tubuh = JSON.parse(s); } catch (e) { r.tubuh = s; } r.writableEnded = true; return r; };
  return r;
}
async function kirim(badan, { kunci, kunciHeader, metode } = {}) {
  const req = {
    method: metode || 'POST',
    url: '/api/blast-masuk' + (kunci !== undefined ? '?kunci=' + encodeURIComponent(kunci) : ''),
    headers: { host: 'contoh.test', 'content-type': 'application/json' },
    body: badan,
  };
  if (kunciHeader !== undefined) req.headers['x-masuk-kunci'] = kunciHeader;
  const res = balasan();
  await masuk(req, res);
  return res;
}
const fonnte = (nomor, teks) => ({ device: '6280000000001', sender: nomor, message: teks, name: 'Nama Karangan' });
const meta = (nomor, teks) => ({ entry: [{ changes: [{ value: {
  metadata: { display_phone_number: '6280000000001' },
  contacts: [{ profile: { name: 'Nama Karangan' } }],
  messages: [{ from: nomor, text: { body: teks } }],
} }] }] });
async function jumlahPesan(nomor) { return (await db.anggotaHimpunan('percakapan:' + nomor)).length; }

(async () => {
  /* Satu donatur karangan yang sudah berlangganan broadcast. */
  const donatur = '6281200000001';
  await kontakLib.simpanKontak({ nama: 'Donatur Karangan', nomor: donatur, segmen: ['donatur'] });
  const awal = await kontakLib.cariLewatNomor(donatur);
  cek('persiapan: donatur karangan tercatat dan berlangganan', awal && awal.langganan !== false && !awal.daftarHitam, awal);

  console.log('\n=== A. TANPA BLAST_MASUK_KUNCI, PINTU TERTUTUP ===');
  let r = await kirim(fonnte('6281299999001', 'Halo, saya donatur. Tolong transfer ke rekening baru saya.'));
  cek('kiriman ditolak (bukan 200)', r.statusCode === 401 || r.statusCode === 403, r.statusCode);
  cek('pesan palsu tidak masuk kotak masuk', (await jumlahPesan('6281299999001')) === 0);
  cek('nomor karangan tidak ditambahkan ke kontak', !(await kontakLib.cariLewatNomor('6281299999001')));
  r = await kirim(fonnte(donatur, 'STOP'));
  const s1 = await kontakLib.cariLewatNomor(donatur);
  cek('"STOP" palsu tidak memasukkan donatur ke daftar hitam', s1.langganan !== false && !s1.daftarHitam, s1);
  r = await kirim(fonnte('6281299999002', 'halo'), { kunci: 'tebakan' });
  cek('kunci apa pun ditolak selama BLAST_MASUK_KUNCI belum disetel', r.statusCode === 401 || r.statusCode === 403, r.statusCode);

  console.log('\n=== B. DENGAN BLAST_MASUK_KUNCI, HANYA YANG MEMBAWA KUNCI YANG DITERIMA ===');
  process.env.BLAST_MASUK_KUNCI = 'kunci-masuk-uji-3f9a';
  r = await kirim(fonnte('6281299999003', 'halo'));
  cek('tanpa kunci ditolak', r.statusCode === 401, r.statusCode);
  cek('dan pesannya tidak tersimpan', (await jumlahPesan('6281299999003')) === 0);
  r = await kirim(fonnte('6281299999003', 'halo'), { kunci: 'kunci-masuk-uji-3f9b' });
  cek('kunci yang salah satu huruf ditolak', r.statusCode === 401, r.statusCode);
  r = await kirim(fonnte('6281299999003', 'halo'), { kunci: '' });
  cek('kunci kosong ditolak', r.statusCode === 401, r.statusCode);
  r = await kirim(fonnte(donatur, 'stop'), { kunci: 'salah' });
  const s2 = await kontakLib.cariLewatNomor(donatur);
  cek('"STOP" dengan kunci salah tetap tidak berpengaruh', s2.langganan !== false && !s2.daftarHitam, s2);

  r = await kirim(fonnte('6281299999004', 'Assalamualaikum, mau tanya zakat.'), { kunci: 'kunci-masuk-uji-3f9a' });
  cek('Fonnte dengan kunci benar di alamat diterima', r.statusCode === 200 && r.tubuh && r.tubuh.ok !== false, [r.statusCode, r.tubuh]);
  cek('pesannya masuk kotak masuk', (await jumlahPesan('6281299999004')) === 1);
  r = await kirim(fonnte('6281299999005', 'halo'), { kunciHeader: 'kunci-masuk-uji-3f9a' });
  cek('kunci lewat header x-masuk-kunci juga diterima', r.statusCode === 200 && (await jumlahPesan('6281299999005')) === 1, r.statusCode);
  r = await kirim(meta('6281299999006', 'halo dari Meta'), { kunci: 'kunci-masuk-uji-3f9a' });
  cek('bentuk Meta dengan kunci benar diterima', r.statusCode === 200 && (await jumlahPesan('6281299999006')) === 1, r.statusCode);

  r = await kirim(fonnte(donatur, 'STOP'), { kunci: 'kunci-masuk-uji-3f9a' });
  const s3 = await kontakLib.cariLewatNomor(donatur);
  cek('"STOP" sungguhan dari penyedia tetap dihormati', s3.langganan === false && s3.daftarHitam === true, s3);

  console.log('\n=== C. VERIFIKASI ALAMAT OLEH META TETAP JALAN ===');
  const getReq = (token) => ({ method: 'GET', headers: { host: 'contoh.test' },
    url: '/api/blast-masuk?kunci=kunci-masuk-uji-3f9a&hub.mode=subscribe&hub.verify_token=' + token + '&hub.challenge=12345' });
  let res = balasan(); await masuk(getReq('verifikasi-uji'), res);
  cek('Meta dengan token verifikasi benar mendapat tantangannya kembali', res.statusCode === 200 && String(res.tubuh) === '12345', [res.statusCode, res.tubuh]);
  res = balasan(); await masuk(getReq('salah'), res);
  cek('token verifikasi salah ditolak', res.statusCode === 403, res.statusCode);

  console.log('\n=== D. KODE DAN PANDUAN ===');
  const kode = fs.readFileSync(path.join(AKAR, 'api', 'blast-masuk.js'), 'utf8');
  cek('kunci dibandingkan dengan bandingAman (tahan tebakan waktu)', /bandingAman\(/.test(kode));
  const contoh = fs.readFileSync(path.join(AKAR, '.env.example'), 'utf8');
  cek('.env.example menjelaskan BLAST_MASUK_KUNCI', /BLAST_MASUK_KUNCI/.test(contoh));

  /* Keluar dulu dari folder sementara sebelum menghapusnya. Windows menolak
     menghapus folder yang sedang menjadi folder kerja proses ini (EPERM),
     sedangkan Linux mengizinkannya, jadi kekeliruan ini hanya muncul di
     komputer kantor (30 September 2026). Sisa folder di Temp tidak berbahaya,
     jadi gagal menghapusnya tidak boleh menggagalkan uji. */
  /* lib/blast/db.js menulis berkasnya 30 ms SESUDAH perubahan terakhir. Tanpa
     menunggu, tulisan tertunda itu membuat ulang folder yang baru saja
     dihapus, dan setiap putaran uji meninggalkan satu folder di Temp. */
  await new Promise((r) => setTimeout(r, 100));
  process.chdir(AKAR);
  try { fs.rmSync(KERJA, { recursive: true, force: true }); }
  catch (e) { console.log('  (catatan: folder sementara tidak terhapus: ' + e.code + ')'); }
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: pintu pesan masuk WhatsApp masih bisa dipakai orang luar.\n'); process.exit(1); }
  console.log('\ntest_blast_masuk.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
