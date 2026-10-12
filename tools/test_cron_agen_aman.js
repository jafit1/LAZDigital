/* Uji: endpoint cron antrean (api/cron/blast-antrean.js) tidak boleh bisa
 * dipicu siapa saja.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * Endpoint ini menjalankan prosesAntrean(), yang menarik pesan Broadcast dari
 * antrean lalu MENYALINKANNYA ke nomor-nomor donatur lewat gateway WhatsApp.
 * Requests-nya tidak perlu login, tidak perlu token, dan tidak punya sesi.
 * Satu-satunya penjaga adalah CRON_SECRET yang dibaca Vercel lewat header
 * Authorization.
 *
 * Bentuk protections yang sekarang:
 *
 *     const rahasia = process.env.CRON_SECRET || '';
 *     if (rahasia) {
 *       ...tolak kalau tidak cocok...
 *     }
 *
 * Kalau CRON_SECRET kosong, seluruh blok itu DILEWATI dan bukanya turun ke
 * prosesAntrean() tanpa syarat apa pun. Jadi tidak cukup bertanya "apakah
 * rahasianya sudah diisi", tapi juga "kalau belum diisi, jangan jalankan
 * apa pun". Keadaan "lupa diisi" persis keadaan yang paling mungkin terjadi:
 * variabelnya terhapus saat environment Vercel dirapikan, atau dipindah ke
 * Preview lalu Production-nya kosong.
 *
 * Bentuk yang sama di api/backup.js sudah benar: dariCron dihitung sebagai
 * "ada rahasia DAN cocok", dan kalau tidak ada rahasia, permintaan tanpa token
 * dijawab 500 "CRON_SECRET belum disetel". Yang dijaga di sini adalah kedua
 * endpoint cron itu tidak berbedaCrypto Newmanapan.
 *
 * Aturan yang dijaga:
 *   A. Tanpa kunci, atau dengan kunci salah, ditolak dan prosesAntrean TIDAK
 *      dipanggil.
 *   B. CRON_SECRET kosong sama sekali: endpoint menolak dengan jelas, bukan
 *      menjalankan antrean tanpa penjaga.
 *   C. Dengan kunci yang benar, endpoint tetap jalan seperti sebelumnya.
 *   D. Kunci lewat query string (?kunci=) tetap diterima, untuk pemanggilan
 *      manual yang sah.
 *
 *   node tools/test_cron_agen_aman.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const AKAR = path.join(__dirname, '..');

/* Folder sendiri: uji ini memanggil prosesAntrean() sungguhan. Antreannya
 * kosong di sini, jadi tidak ada pesan yang bisa dikirim ke siapa pun. */
const KERJA = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-cron-agen-'));
process.env.LAZ_DATA_LOKAL = KERJA;
process.chdir(KERJA);
for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[k];

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 250)); }
};

function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.tubuh = o; r.writableEnded = true; return r; };
  r.end = (s) => { try { r.tubuh = JSON.parse(s); } catch (e) { r.tubuh = s; } r.writableEnded = true; return r; };
  return r;
}

/* Panggil penangan cron. Balikan mencakup apakah prosesAntrean ikut jalan.
 * Cara memastikan: lihat isinya. Kalau ditolak, tubuh jawabannya berisi pesan
 * galat dan tidak ada field "laporan". Kalau lolos, field "laporan" ada. */
async function panggil(url, headers) {
  const jalur = require.resolve(path.join(AKAR, 'api', 'cron', 'blast-antrean.js'));
  /* Cache dibuang lebih dulu: process.env dibaca saat berkas dievaluasi, jadi
     tanpa ini perubahan CRON_SECRET di antara bagian uji tidak terlihat. */
  delete require.cache[jalur];
  const penangan = require(jalur);
  const req = { method: 'GET', url: url || '/api/cron/blast-antrean', headers: Object.assign({ host: 'contoh.test' }, headers || {}) };
  const res = balasan();
  await penangan(req, res);
  const ditolak = res.statusCode === 401 || res.statusCode === 503;
  return { kode: res.statusCode, tubuh: res.tubuh, ditolak };
}

(async function utama() {
  const RAHASIA = 'rahasia-cron-agen-uji-4d9f';

  console.log('\n=== A. KUNCI DITOLAK SEBELUM ANTREAN DISENTUH ===');
  {
    process.env.CRON_SECRET = RAHASIA;

    let r = await panggil('/api/cron/blast-antrean', {});
    cek('tanpa Authorization ditolak', r.ditolak, r);
    cek('tanpa Authorization tidak menjalankan antrean', !r.tubuh || !r.tubuh.laporan, r.tubuh);

    r = await panggil('/api/cron/blast-antrean', { authorization: 'Bearer ' + RAHASIA.slice(0, -1) + 'x' });
    cek('kunci salah ditolak', r.ditolak, r);
    cek('kunci salah tidak menjalankan antrean', !r.tubuh || !r.tubuh.laporan, r.tubuh);

    r = await panggil('/api/cron/blast-antrean?kunci=' + RAHASIA.slice(0, -1) + 'x', {});
    cek('kunci salah lewat query string ditolak', r.ditolak, r);
  }

  console.log('\n=== B. CRON_SECRET KOSONG: TOLAK, JANGAN JALANKAN ===');
  /* Ini keadaan yang paling mungkin terjadi di produksi: variabel terhapus
     atau belum pernah diisi. Menjalankan antrean tanpa penjaga berarti satu
     permintaan siapa pun bisa memicu pengiriman massal ke donatur. */
  {
    delete process.env.CRON_SECRET;
    let r = await panggil('/api/cron/blast-antrean', {});
    cek('CRON_SECRET kosong tidak dianggap boleh masuk', r.ditolak, r);
    cek('CRON_SECRET kosong tidak menjalankan antrean', !r.tubuh || !r.tubuh.laporan, r.tubuh);
    cek('pesan menyebut CRON_SECRET, bukan galat dalaman',
      r.tubuh && /CRON_SECRET/i.test(String(r.tubuh.pesan || r.tubuh.__error || '')), r.tubuh);

    /* String kosong juga harus dianggap kosong, bukan "rahasia sah". */
    process.env.CRON_SECRET = '';
    r = await panggil('/api/cron/blast-antrean', {});
    cek('CRON_SECRET berisi string kosong juga ditolak', r.ditolak, r);
    cek('string kosong tidak menjalankan antrean', !r.tubuh || !r.tubuh.laporan, r.tubuh);
    delete process.env.CRON_SECRET;
  }

  console.log('\n=== C. KUNCI BENAR TETAP BEKERJA ===');
  /* Perbaikan tidak boleh mematikan cron yang sah. */
  {
    process.env.CRON_SECRET = RAHASIA;
    let r = await panggil('/api/cron/blast-antrean', { authorization: 'Bearer ' + RAHASIA });
    cek('kunci benar tidak ditolak', !r.ditolak, r);
    cek('kunci benar menjalankan antrean', !!(r.tubuh && r.tubuh.laporan), r.tubuh);

    r = await panggil('/api/cron/blast-antrean?kunci=' + RAHASIA, {});
    cek('kunci benar lewat query string diterima', !!(r.tubuh && r.tubuh.laporan), r.tubuh);
  }

  console.log('\n=== D. KEDUA ENDPOINT CRON BERPAKAI ATURAN SAMA ===');
  /* Dua endpoint cron memakai pola berbeda: backup.js menolak dengan 500,
     yang ini akan menolak dengan 503. Yang dijaga hanya kesimpulannya:
     tanpa rahasia yang benar, keduanya tidak menjalankan apa pun. */
  {
    delete process.env.CRON_SECRET;
    const backup = require(path.join(AKAR, 'api', 'backup.js'));
    delete require.cache[require.resolve(path.join(AKAR, 'api', 'backup.js'))];
    const req = { method: 'GET', url: '/api/backup', headers: { host: 'contoh.test' }, body: {} };
    const res = balasan();
    await backup(req, res);
    cek('backup.js juga menolak saat CRON_SECRET kosong',
      res.statusCode === 500 || res.statusCode === 503 || !!(res.tubuh && res.tubuh.__error), [res.statusCode, res.tubuh]);
  }

  console.log('\n=== E. KODE MEMANG MENYAMPINGKAN RAHASIANYA ===');
  {
    /* Perbandingan rahasia ada di lib/blast/util.js (bandingAman), bukan di
       berkas cron itu sendiri: cron memanggilnya, jadi itu yang diperiksa. */
    const util = fs.readFileSync(path.join(AKAR, 'lib', 'blast', 'util.js'), 'utf8');
    cek('bandingAman membandingkan dengan timingSafeEqual', /timingSafeEqual/.test(util));
    cek('bandingAman menolak panjang berbeda sebelum dibandingkan',
      /length\s*!==\s*bb\.length[\s\S]{0,120}timingSafeEqual/.test(util) ||
      /ba\.length\s*!==/.test(util));

    /* Endpoint cron harus memakai bandingAman itu, bukan === biasa. */
    const kode = fs.readFileSync(path.join(AKAR, 'api', 'cron', 'blast-antrean.js'), 'utf8');
    cek('endpoint cron memakai bandingAman', /bandingAman/.test(kode));
    cek('tidak ada perbandingan rahasia pakai === langsung',
      !/rahasia\s*===/.test(kode) && !/===\s*rahasia/.test(kode));
  }

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: endpoint cron antrean bisa dipicu tanpa kunci.\n'); process.exit(1); }
  console.log('\ntest_cron_agen_aman.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch(function (e) {
  console.error('\nUji gagal total:', (e && e.stack) || e);
  process.exit(1);
});