/* Uji sambungan LAZDigital <-> gateway WhatsApp sendiri.

   Yang diuji di sini bukan Baileys-nya (itu milik gateway), melainkan
   KONTRAK di antara keduanya: pesan tidak boleh diaku terkirim sebelum
   gateway benar-benar mengirimnya, satu pesan tidak boleh keluar dua kali,
   dan pekerjaan tidak boleh hilang kalau gateway mati di tengah jalan.

   jalankan:  node tools/test_agen.js
*/
'use strict';
const fs = require('fs'), path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(path.join(AKAR, '.data'), { recursive: true, force: true });

process.env.BLAST_AGEN_TOKEN = 'token-agen-uji';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const db = require('../lib/blast/db');
const { simpanSetelan } = require('../lib/blast/setelan');
const antrean = require('../lib/blast/antrean');
const mandiri = require('../lib/blast/pengirim/mandiri');
const agen = require('../api/blast-agen.js');

let ok = 0, gagal = 0;
function cek(nama, syarat, info) {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 300)); }
}

function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.tubuh = o; r.writableEnded = true; return r; };
  r.end = (s) => { try { r.tubuh = JSON.parse(s); } catch (e) { r.tubuh = s; } r.writableEnded = true; return r; };
  return r;
}

async function hit(tindakan, data, token) {
  const req = {
    method: 'POST', url: '/api/blast-agen',
    headers: { host: 'contoh.test', 'content-type': 'application/json' },
    body: { tindakan, data: data || {} },
  };
  if (token !== null) req.headers['x-agen-token'] = token || process.env.BLAST_AGEN_TOKEN;
  const res = balasan();
  await agen(req, res);
  return res;
}

const PERANGKAT = 'p_uji1';
async function detak(status, tambahan) {
  return hit('lapor-perangkat', Object.assign({ perangkatId: PERANGKAT, status }, tambahan || {}));
}
async function pesanDi(id) { return db.ambil(antrean.KUNCI_PESAN(id)); }

/* Setelah satu pesan diserahkan, perangkat memasang jeda 10-20 detik supaya
   pengirimannya tidak terlihat seperti mesin. Di dalam uji, jeda itu kita
   lepas sendiri — yang sedang diuji kontrak dengan gateway, bukan jedanya
   (jeda punya ujinya sendiri di test_blast.js). */
async function lepasJeda() {
  const p = await db.ambil(`perangkat:${PERANGKAT}`);
  p.bolehKirimSetelah = 0;
  await db.simpan(`perangkat:${PERANGKAT}`, p);
}
/* Majukan jadwal pesan yang sempat mundur karena percobaan gagal. */
async function majukan(id) {
  const m = await pesanDi(id);
  m.jadwal = new Date(Date.now() - 1000).toISOString();
  await db.simpan(antrean.KUNCI_PESAN(id), m);
}
async function serahkan(id) { await lepasJeda(); await majukan(id); return antrean.prosesAntrean(); }

(async () => {
  await simpanSetelan({
    pengirim: { driver: 'mandiri' },
    kirim: { jedaMinDetik: 0, jedaMaksDetik: 0, hormatiJamKirim: false, kirimPerPutaran: 10, percobaanMaks: 3 },
  });
  await db.simpan(`perangkat:${PERANGKAT}`, {
    id: PERANGKAT, nama: 'HP Kantor', nomor: '', driver: 'mandiri', status: 'terputus', aktif: true,
  });
  await db.tambahKeHimpunan('perangkat:daftar', PERANGKAT);

  console.log('=== A. PINTU AGEN TERKUNCI ===');
  let r = await hit('halo', {}, 'token-ngawur');
  cek('token salah ditolak 401', r.statusCode === 401, r.statusCode);
  r = await hit('halo', {}, null);
  cek('tanpa token sama sekali ditolak', r.statusCode === 401, r.statusCode);

  const simpanToken = process.env.BLAST_AGEN_TOKEN;
  delete process.env.BLAST_AGEN_TOKEN;
  r = await hit('halo', {}, 'apa-saja');
  cek('token server belum disetel: ditutup, bukan dibuka', r.statusCode === 503, r.statusCode);
  cek('alasannya dijelaskan, bukan "galat"', /BLAST_AGEN_TOKEN/.test((r.tubuh || {}).pesan || ''), r.tubuh);
  process.env.BLAST_AGEN_TOKEN = simpanToken;

  r = await hit('tindakan-karangan', {});
  cek('tindakan tak dikenal ditolak 400', r.statusCode === 400, r.statusCode);

  console.log('\n=== B. GATEWAY MATI: PESAN TIDAK HILANG, TIDAK PULA DIAKU TERKIRIM ===');
  /* Keadaan yang paling mudah menipu: LAZDigital masih mencatat perangkat ini
     "tersambung" dari sesi terakhir, padahal komputer gateway sudah dimatikan.
     Tidak ada detak dari gateway. */
  const pr0 = await db.ambil(`perangkat:${PERANGKAT}`);
  pr0.status = 'tersambung';
  await db.simpan(`perangkat:${PERANGKAT}`, pr0);

  const p1 = await antrean.antrikan({ perangkatId: PERANGKAT, nomor: '081234567890', nama: 'Budi', isi: { teks: 'Halo {{nama}}' } });
  let lap = await antrean.prosesAntrean();
  let m = await pesanDi(p1.id);
  cek('pesan TIDAK diaku terkirim saat gateway mati', m.status !== 'terkirim', m.status);
  cek('pesan tetap menunggu di antrean', m.status === 'antre', m.status);
  cek('alasannya tercatat apa adanya', /tidak terhubung/i.test(m.galatTerakhir || ''), m.galatTerakhir);
  cek('laporan tidak mengaku ada yang terkirim', lap.terkirim === 0, lap);

  console.log('\n=== C. GATEWAY HIDUP: PESAN DISERAHKAN, BELUM TERKIRIM ===');
  await detak('tersambung', { nomor: '628111000111' });
  lap = await serahkan(p1.id);
  m = await pesanDi(p1.id);
  cek('status jadi "diserahkan", bukan "terkirim"', m.status === 'diserahkan', m.status);
  cek('laporan memisahkan diserahkan dari terkirim', lap.diserahkan === 1 && lap.terkirim === 0, lap);
  cek('pesan keluar dari antrean utama',
    !(await db.anggotaHimpunan(antrean.KUNCI_ANTREAN)).includes(p1.id));
  cek('pesan tercatat sebagai serahan yang harus dijaga',
    (await db.anggotaHimpunan(antrean.KUNCI_SERAHAN)).includes(p1.id));
  cek('pesan masuk kotak keluar perangkat',
    (await db.anggotaHimpunan(mandiri.KUNCI_KELUAR(PERANGKAT))).includes(p1.id));

  console.log('\n=== D. SATU PESAN TIDAK BOLEH KELUAR DUA KALI ===');
  r = await hit('ambil', { perangkatId: PERANGKAT, maks: 10 });
  const tarik1 = r.tubuh.pekerjaan;
  cek('tarikan pertama dapat satu pekerjaan', tarik1.length === 1, tarik1);
  cek('penanda {{nama}} sudah diisi sebelum dikirim ke gateway',
    tarik1[0] && tarik1[0].teks === 'Halo Budi', tarik1[0]);
  r = await hit('ambil', { perangkatId: PERANGKAT, maks: 10 });
  cek('tarikan kedua TIDAK mendapat pesan yang sama', r.tubuh.pekerjaan.length === 0, r.tubuh);

  console.log('\n=== E. LAPORAN GATEWAY YANG MENENTUKAN ===');
  r = await hit('lapor', { hasil: [{ pesanId: p1.id, status: 'terkirim', idLuar: 'WA123' }] });
  m = await pesanDi(p1.id);
  cek('barulah status jadi terkirim', m.status === 'terkirim', m.status);
  cek('id pesan WhatsApp ikut tersimpan', m.idLuar === 'WA123', m.idLuar);
  cek('keluar dari daftar serahan',
    !(await db.anggotaHimpunan(antrean.KUNCI_SERAHAN)).includes(p1.id));
  cek('keluar dari kotak keluar perangkat',
    !(await db.anggotaHimpunan(mandiri.KUNCI_KELUAR(PERANGKAT))).includes(p1.id));

  r = await hit('lapor', { hasil: [{ pesanId: p1.id, status: 'gagal', galat: 'ulangan' }] });
  m = await pesanDi(p1.id);
  cek('laporan ulangan diabaikan, status tidak berubah', m.status === 'terkirim', m.status);
  cek('laporan ulangan dihitung sebagai diabaikan', r.tubuh.diabaikan === 1, r.tubuh);

  console.log('\n=== F. GAGAL DI GATEWAY: KEMBALI KE ANTREAN ===');
  const p2 = await antrean.antrikan({ perangkatId: PERANGKAT, nomor: '081222333444', isi: { teks: 'Coba' } });
  await serahkan(p2.id);
  await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
  await hit('lapor', { hasil: [{ pesanId: p2.id, status: 'gagal', galat: 'Nomor tidak terdaftar di WhatsApp' }] });
  m = await pesanDi(p2.id);
  cek('pesan gagal kembali antre, bukan hilang', m.status === 'antre', m.status);
  cek('percobaan bertambah', m.percobaan === 1, m.percobaan);
  cek('galat dari gateway tersimpan apa adanya', /tidak terdaftar/i.test(m.galatTerakhir), m.galatTerakhir);

  r = await hit('lapor', { hasil: [{ pesanId: p2.id, status: 'gagal', sementara: false, galat: 'nomor diblokir' }] });
  cek('pesan yang sudah antre lagi tidak bisa dilapor ulang', r.tubuh.diabaikan === 1, r.tubuh);

  console.log('\n=== G. GATEWAY MATI SETELAH MENARIK: PESAN TIDAK MENGGANTUNG ===');
  const p3 = await antrean.antrikan({ perangkatId: PERANGKAT, nomor: '081999888777', isi: { teks: 'Mandek' } });
  await serahkan(p3.id);
  await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
  m = await pesanDi(p3.id);
  cek('pesan berstatus diserahkan sebelum disapu', m.status === 'diserahkan', m.status);

  // Mundurkan waktu serah melewati ambang, seolah gateway diam 20 menit.
  m.diserahkanPada = new Date(Date.now() - antrean.SERAHAN_KEDALUWARSA_MS - 60000).toISOString();
  await db.simpan(antrean.KUNCI_PESAN(p3.id), m);
  const pulih = await antrean.pulihkanSerahanMandek({ kirim: { percobaanMaks: 3 } });
  m = await pesanDi(p3.id);
  cek('pesan mandek dikembalikan ke antrean', m.status === 'antre', m.status);
  cek('penyapu melaporkan jumlahnya', pulih === 1, pulih);
  cek('dihitung sebagai satu percobaan', m.percobaan === 1, m.percobaan);
  cek('sebabnya dijelaskan', /tidak melapor/i.test(m.galatTerakhir), m.galatTerakhir);

  // Gateway rusak terus-menerus: harus menyerah, bukan berputar selamanya.
  for (let i = 0; i < 3; i++) {
    const s = await pesanDi(p3.id);
    s.status = 'diserahkan';
    s.diserahkanPada = new Date(Date.now() - antrean.SERAHAN_KEDALUWARSA_MS - 60000).toISOString();
    await db.simpan(antrean.KUNCI_PESAN(p3.id), s);
    await db.tambahKeHimpunan(antrean.KUNCI_SERAHAN, p3.id);
    await antrean.pulihkanSerahanMandek({ kirim: { percobaanMaks: 3 } });
  }
  m = await pesanDi(p3.id);
  cek('akhirnya menyerah, tidak berputar selamanya', m.status === 'gagal', m.status);

  console.log('\n=== H. PERINTAH SAMBUNGKAN SAMPAI KE GATEWAY ===');
  await mandiri.sambungkan({ id: PERANGKAT });
  r = await detak('menunggu', { qr: '2@abcdef' });
  cek('gateway menerima perintah sambungkan', r.tubuh.perintah === 'sambungkan', r.tubuh);
  r = await detak('menunggu', { qr: '2@abcdef' });
  cek('perintah tidak terkirim dua kali', !r.tubuh.perintah, r.tubuh);

  const kabar = await db.ambil(mandiri.KUNCI_AGEN(PERANGKAT));
  cek('QR tersimpan untuk ditampilkan ke amil', kabar.qr === '2@abcdef', kabar.qr);
  await detak('tersambung', { nomor: '628111000111' });
  const kabar2 = await db.ambil(mandiri.KUNCI_AGEN(PERANGKAT));
  cek('QR dibuang begitu tersambung (tidak menampilkan kode basi)', kabar2.qr === '', kabar2.qr);
  const pr = await db.ambil(`perangkat:${PERANGKAT}`);
  cek('status perangkat ikut disegarkan untuk layar amil', pr.status === 'tersambung', pr.status);
  cek('nomor pengirim ikut tercatat', pr.nomor === '628111000111', pr.nomor);

  console.log('\n=== I. PERANGKAT MATI DIKENALI, TIDAK DIAM-DIAM "TERSAMBUNG" ===');
  const kabarBasi = await db.ambil(mandiri.KUNCI_AGEN(PERANGKAT));
  kabarBasi.waktu = new Date(Date.now() - mandiri.BATAS_DIAM_MS - 10000).toISOString();
  await db.simpan(mandiri.KUNCI_AGEN(PERANGKAT), kabarBasi);
  const periksa = await mandiri.periksa({ id: PERANGKAT });
  cek('gateway yang lama diam dinyatakan terputus', periksa.status === 'terputus', periksa);
  cek('keterangannya menyebut sejak kapan diam', /detik lalu/.test(periksa.keterangan), periksa.keterangan);

  console.log('\n=== J. PESAN MASUK DARI DONATUR ===');
  await detak('tersambung', { nomor: '628111000111' });
  r = await hit('masuk', { perangkatId: PERANGKAT, nomor: '0812-3456-7890', teks: 'Assalamualaikum', nama: 'Budi' });
  cek('pesan masuk diterima', !!r.tubuh.pesanId, r.tubuh);
  const kontakLib = require('../lib/blast/kontak');
  const kontak = await kontakLib.cariLewatNomor('6281234567890');
  cek('nomor dinormalkan lalu disimpan jadi kontak', !!kontak, kontak);

  r = await hit('masuk', { perangkatId: PERANGKAT, nomor: '081234567890', teks: 'BERHENTI' });
  cek('permintaan berhenti dihormati', r.tubuh.berhenti === true, r.tubuh);
  const kontak2 = await kontakLib.cariLewatNomor('6281234567890');
  cek('langganannya dimatikan', kontak2.langganan === false, kontak2.langganan);
  cek('yang berhenti tidak dibalas otomatis', !r.tubuh.balas, r.tubuh);

  console.log('\n=== K. SALAM PERKENALAN GATEWAY ===');
  r = await hit('halo', { agen: 'pc-kantor' });
  cek('gateway mendapat daftar perangkat miliknya',
    (r.tubuh.perangkat || []).some((p) => p.id === PERANGKAT), r.tubuh.perangkat);
  cek('aturan jeda ikut diberikan dari pusat',
    r.tubuh.aturan && typeof r.tubuh.aturan.jedaMinDetik === 'number', r.tubuh.aturan);
  cek('batas harian ikut diberikan',
    typeof r.tubuh.aturan.batasHarianPerangkat === 'number', r.tubuh.aturan);

  console.log('\n=== K2. GATEWAY MENDORONG ANTREANNYA SENDIRI ===');
  /* Tanpa ini, pesan hanya berpindah dari antrean ke kotak keluar saat cron
     Vercel jalan — dan di paket Hobby itu cuma sekali sehari. Yang menarik
     pekerjaan otomatis juga yang mendorong antrean. */
  await db.hapus('agen:dorong');
  await lepasJeda();
  const pDorong = await antrean.antrikan({ perangkatId: PERANGKAT, nomor: '081555444333', isi: { teks: 'Didorong' } });
  cek('pesan baru memang masih di antrean, belum di kotak keluar',
    !(await db.anggotaHimpunan(mandiri.KUNCI_KELUAR(PERANGKAT))).includes(pDorong.id));

  r = await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
  cek('sekali tarik, pesannya langsung ikut terbawa',
    (r.tubuh.pekerjaan || []).some((k) => k.pesanId === pDorong.id), r.tubuh);
  cek('laporan dorongan ikut dikembalikan untuk ditelusuri', !!r.tubuh.dorong, r.tubuh.dorong);

  /* Dorongan dibatasi sekali tiap 15 detik: dua gateway yang menarik bersamaan
     tidak boleh menjalankan pemrosesan dua kali. */
  await lepasJeda();
  await antrean.antrikan({ perangkatId: PERANGKAT, nomor: '081555444222', isi: { teks: 'Kedua' } });
  r = await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
  cek('tarikan beruntun tidak mendorong dua kali', r.tubuh.dorong === null || r.tubuh.dorong === undefined, r.tubuh.dorong);

  console.log('\n=== L. DRIVER LAMA TIDAK IKUT BERUBAH ===');
  /* Perubahan di antrean.js menambah status 'diserahkan'. Driver yang memang
     mengirim sendiri (sandbox, fonnte, meta) tidak boleh ikut terpengaruh —
     kalau ikut, seluruh riwayat pengiriman lama jadi salah arti. */
  await simpanSetelan({ pengirim: { driver: 'sandbox' } });
  await db.simpan('perangkat:p_sb', { id: 'p_sb', nama: 'Sandbox', driver: 'sandbox', status: 'tersambung', aktif: true });
  await db.tambahKeHimpunan('perangkat:daftar', 'p_sb');
  let pSb = null;
  for (let i = 0; i < 6 && !pSb; i++) {           // sandbox sengaja gagal ~3%
    const m = await antrean.antrikan({ perangkatId: 'p_sb', nomor: '08129999000' + i, isi: { teks: 'uji' } });
    const pr = await db.ambil('perangkat:p_sb'); pr.bolehKirimSetelah = 0; await db.simpan('perangkat:p_sb', pr);
    await antrean.prosesAntrean();
    const st = (await pesanDi(m.id)).status;
    if (st === 'terkirim' || st === 'sampai' || st === 'dibaca') pSb = st;
  }
  cek('driver sandbox tetap langsung "terkirim", bukan "diserahkan"', !!pSb, pSb);

  console.log('\ntest_agen.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
