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

/* Mendorong antrean sampai satu pesan TERTENTU benar-benar diserahkan.
   Satu putaran hanya menyerahkan satu pesan per perangkat lalu memasang jeda,
   dan yang lebih tua didahulukan — jadi menunggu "satu putaran" saja membuat
   ujinya bergantung pada berapa sisa pesan dari bagian sebelumnya. */
async function serahkan(id) {
  for (let i = 0; i < 12; i++) {
    const m = await pesanDi(id);
    if (m && m.status !== 'antre') return m;
    await lepasJeda();
    await antrean.prosesAntrean();
  }
  return pesanDi(id);
}

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

  /* --- TIDAK ADA BALASAN OTOMATIS, APA PUN YANG DITULIS DONATUR -------------
   *
   * Dulu server menjalankan aturan balasan dan mengembalikan jawabannya ke
   * gateway untuk dikirim seketika. Itu dimatikan atas permintaan pengelola:
   * pesan yang masuk ke nomor lembaga dijawab amil, bukan mesin.
   *
   * Yang diuji di sini kata-kata yang DULU memicu jawaban, termasuk jaring
   * pengaman lama yang membalas apa pun yang berbau permohonan bantuan, dan
   * aturan cadangan yang membalas kalimat apa saja. Kalau salah satunya
   * kembali menjawab, uji ini gagal sebelum ada donatur yang menerimanya.
   *
   * Ini juga menjaga dari kemunduran yang paling gampang: menghidupkan lagi
   * cariBalasan "cuma untuk kata kunci tertentu". Tidak ada kata kunci yang
   * dikecualikan; yang dijanjikan adalah tidak ada balasan mesin sama sekali. */
  for (const contoh of [
    'zakat',                       /* dulu: menu layanan zakat */
    'rekening',                    /* dulu: nomor rekening resmi */
    'PETUGAS',                     /* dulu: alih ke petugas */
    'saya butuh bantuan biaya sekolah anak',  /* dulu: jaring pengaman */
    'assalamualaikum pak, mau tanya',         /* dulu: aturan cadangan */
    'halo',
  ]) {
    const jawab = await hit('masuk', {
      perangkatId: PERANGKAT, nomor: '081234567891', teks: contoh, nama: 'Penanya',
    });
    cek(`"${contoh.slice(0, 28)}" tidak dibalas mesin`,
      jawab.tubuh.balas === '' && !jawab.tubuh.tindakan,
      { balas: jawab.tubuh.balas, tindakan: jawab.tubuh.tindakan });
  }

  /* Dan tidak ada pesan keluar yang diam-diam masuk antrean untuk nomor itu.
     Medan 'balas' yang kosong belum membuktikan apa-apa kalau jawabannya
     ternyata diantrekan lewat jalan lain. */
  {
    const antre = await db.anggotaHimpunan(antrean.KUNCI_ANTREAN);
    const isiAntre = (await db.ambilBanyak(antre.map(antrean.KUNCI_PESAN))).filter(Boolean);
    cek('tidak ada pesan keluar yang diantrekan untuk penanya itu',
      !isiAntre.some((x) => x.nomor === '6281234567891'),
      isiAntre.map((x) => x.nomor));
  }

  /* Berkasnya memang sudah tidak ada. Diperiksa supaya tidak diam-diam
     dihidupkan lagi lewat require baru di kemudian hari. */
  {
    const fs = require('fs');
    const path = require('path');
    cek('mesin balasan otomatis sudah tidak ada di kode',
      !fs.existsSync(path.join(__dirname, '..', 'lib', 'blast', 'balasan.js')));
    for (const berkas of ['blast-agen.js', 'blast-masuk.js']) {
      const isi = fs.readFileSync(path.join(__dirname, '..', 'api', berkas), 'utf8');
      cek(`api/${berkas} tidak memanggil cariBalasan lagi`,
        !/cariBalasan\s*\(/.test(isi));
    }
  }

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

  console.log('\n=== M. LAMPIRAN BERKAS ===');
  const berkasLib = require('../lib/blast/berkas');
  const isiPdf = Buffer.from('%PDF-1.4 uji').toString('base64');
  const bk = await berkasLib.simpanBerkas({ nama: 'Panduan Zakat.pdf', tipe: 'application/pdf', base64: isiPdf });
  cek('berkas PDF bisa disimpan', !!bk.id && bk.jenis === 'dokumen', bk);
  cek('ukurannya dicatat', bk.byte > 0, bk.byte);

  let ditolak = '';
  try { await berkasLib.simpanBerkas({ nama: 'virus.exe', tipe: 'application/x-msdownload', base64: isiPdf }); }
  catch (e) { ditolak = e.message; }
  cek('jenis yang tidak didukung ditolak dengan penjelasan', /belum didukung/i.test(ditolak), ditolak);
  cek('penjelasannya menyebut yang boleh', /PDF/i.test(ditolak), ditolak);

  ditolak = '';
  try {
    await berkasLib.simpanBerkas({ nama: 'besar.pdf', tipe: 'application/pdf',
      base64: 'A'.repeat(Math.ceil((berkasLib.BATAS_BYTE + 200000) * 4 / 3)) });
  } catch (e) { ditolak = e.message; }
  cek('berkas kebesaran ditolak, bukan gagal diam-diam', /melebihi batas/i.test(ditolak), ditolak);
  cek('disebut berapa besarnya dan berapa batasnya', /MB.*batas.*MB/i.test(ditolak), ditolak);

  /* Nama berkas ikut ke sistem berkas gateway, jadi tidak boleh bisa keluar
     dari foldernya. */
  const nakal = await berkasLib.simpanBerkas({ nama: '../../etc/passwd', tipe: 'image/png', base64: isiPdf });
  cek('nama berkas yang mencoba keluar folder dijinakkan',
    !nakal.nama.includes('/') && !nakal.nama.includes('..'), nakal.nama);

  /* Lampiran menempel di pesan lewat id, dan gateway menariknya terpisah. */
  await lepasJeda();
  const pLampir = await antrean.antrikan({
    perangkatId: PERANGKAT, nomor: '081666555444',
    isi: { teks: 'Ada lampiran', berkasId: bk.id, namaBerkas: bk.nama, tipeBerkas: bk.tipe },
  });
  await serahkan(pLampir.id);
  r = await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
  const kerja = (r.tubuh.pekerjaan || []).find((k) => k.pesanId === pLampir.id);
  cek('pekerjaan membawa id lampiran', kerja && kerja.berkasId === bk.id, kerja);
  cek('isi berkasnya TIDAK ikut di tiap pekerjaan', kerja && !('base64' in kerja), Object.keys(kerja || {}));

  r = await hit('berkas', { berkasId: bk.id });
  cek('gateway bisa menarik isi lampiran terpisah', !!(r.tubuh.berkas && r.tubuh.berkas.base64), r.tubuh);
  cek('isinya utuh', r.tubuh.berkas.base64 === isiPdf, r.tubuh.berkas.base64);

  r = await hit('berkas', { berkasId: 'f_tidakada' });
  cek('lampiran kedaluwarsa dijawab 404 dengan penjelasan',
    r.statusCode === 404 && /kedaluwarsa/i.test(r.tubuh.pesan || ''), r.tubuh);

  console.log('\n=== N. CENTANG SAMPAI DAN DIBACA ===');
  await lepasJeda();
  const pCentang = await antrean.antrikan({ perangkatId: PERANGKAT, nomor: '081444333222', isi: { teks: 'Centang' } });
  await serahkan(pCentang.id);
  await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
  await hit('lapor', { hasil: [{ pesanId: pCentang.id, status: 'terkirim', idLuar: 'WAXYZ' }] });

  r = await hit('lapor-status', { hasil: [{ idLuar: 'WAXYZ', status: 'sampai' }] });
  m = await pesanDi(pCentang.id);
  cek('centang "sampai" menaikkan status', m.status === 'sampai', m.status);
  cek('waktunya dicatat', !!m.sampai, m.sampai);

  r = await hit('lapor-status', { hasil: [{ idLuar: 'WAXYZ', status: 'dibaca' }] });
  m = await pesanDi(pCentang.id);
  cek('centang "dibaca" menaikkan lagi', m.status === 'dibaca', m.status);

  /* WhatsApp kadang mengirim centang lama menyusul yang baru. */
  r = await hit('lapor-status', { hasil: [{ idLuar: 'WAXYZ', status: 'sampai' }] });
  m = await pesanDi(pCentang.id);
  cek('centang lama tidak menurunkan yang sudah dibaca', m.status === 'dibaca', m.status);
  cek('dan dihitung sebagai diabaikan', r.tubuh.diabaikan === 1, r.tubuh);

  r = await hit('lapor-status', { hasil: [{ idLuar: 'WA-tidak-dikenal', status: 'dibaca' }] });
  /* DITITIPKAN, bukan diabaikan. Dulu centang yang id-nya belum dikenal
     langsung dibuang, dan itu permanen: WhatsApp tidak pernah mengirim tanda
     terima yang sama dua kali. Lihat bagian N2. */
  cek('id WhatsApp yang belum dikenal dititipkan, bukan bikin galat',
    r.tubuh.ok !== false && r.tubuh.dititipkan === 1 && r.tubuh.naik === 0, r.tubuh);

  console.log('\n=== K2. CENTANG TIDAK BOLEH MENYENTUH PESAN MASUK ===');
  /* Sejak pesan masuk ikut menyimpan id WhatsApp-nya (untuk menjaga dari
     pencatatan ganda), sebuah id yang tertukar bisa menaikkan status pesan
     MASUK jadi "sampai" — dan gelembung dari donatur mendadak bercentang,
     seolah kita yang mengirimnya. */
  {
    const rMasuk = await hit('masuk', {
      perangkatId: PERANGKAT, nomor: '081200011122', teks: 'Halo min',
      nama: 'Donatur Uji', idLuar: 'WA-MASUK-1',
    });
    const idMasuk = rMasuk.tubuh.pesanId;
    cek('pesan masuk tercatat', !!idMasuk, rMasuk.tubuh);

    const kembar = await hit('masuk', {
      perangkatId: PERANGKAT, nomor: '081200011122', teks: 'Halo min',
      nama: 'Donatur Uji', idLuar: 'WA-MASUK-1',
    });
    cek('pesan masuk dengan id WhatsApp yang sama tidak dicatat dua kali',
      kembar.tubuh.kembar === true && kembar.tubuh.pesanId === idMasuk, kembar.tubuh);

    const rs = await hit('lapor-status', { hasil: [{ idLuar: 'WA-MASUK-1', status: 'dibaca' }] });
    const mm = await pesanDi(idMasuk);
    cek('centang untuk id pesan MASUK diabaikan', mm.status === 'masuk', mm.status);
    cek('dan dihitung sebagai diabaikan, bukan naik',
      rs.tubuh.naik === 0 && rs.tubuh.diabaikan === 1, rs.tubuh);
  }

  console.log('\n=== N2. CENTANG YANG DATANG MENDAHULUI PESANNYA ===');
  /* URUTAN YANG BENAR-BENAR TERJADI DI LAPANGAN. WhatsApp mengantar tanda
     terima beberapa detik sesudah pesan lepas dari HP, sedangkan laporan
     gateway yang mendaftarkan id WhatsApp-nya baru dikirim setelah seluruh
     rombongan selesai, dan itu bisa setengah menit kemudian atau lebih lama
     lagi kalau jaringannya sempat putus.

     Dulu centang yang belum dikenali langsung dibuang. Akibatnya permanen,
     karena WhatsApp TIDAK PERNAH mengirim tanda terima yang sama dua kali:
     pesan itu bercentang satu selamanya walau di HP penerima sudah dibaca.
     Persis keluhan yang membuat bagian ini ditulis. */
  {
    await lepasJeda();
    const pDulu = await antrean.antrikan({
      perangkatId: PERANGKAT, nomor: '081277788899', isi: { teks: 'Centang duluan' },
    });
    /* Didorong sendiri: kotak keluar perangkat masih berisi sisa bagian
       sebelumnya, dan tindakan 'ambil' hanya mendorong antrean kalau kotaknya
       benar-benar kosong. */
    await serahkan(pDulu.id);
    await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });

    /* Centang tiba LEBIH DULU, sebelum gateway sempat melapor. */
    const rAwal = await hit('lapor-status', { hasil: [{ idLuar: 'WA-DULUAN', status: 'dibaca' }] });
    cek('centang yang belum dikenali DITITIPKAN, bukan dibuang',
      rAwal.tubuh.dititipkan === 1 && rAwal.tubuh.naik === 0, rAwal.tubuh);

    /* Baru kemudian laporan gateway datang dan mendaftarkan id-nya. */
    await hit('lapor', { hasil: [{ pesanId: pDulu.id, status: 'terkirim', idLuar: 'WA-DULUAN' }] });
    const m = await pesanDi(pDulu.id);
    cek('begitu pesannya terdaftar, centang titipan langsung terpasang',
      m.status === 'dibaca', m.status);
    cek('waktunya ikut tercatat', !!m.dibaca, m.dibaca);

    /* Titipan dipakai sekali lalu habis: kalau tertinggal, pesan BERIKUTNYA
       yang kebetulan memakai id yang sama akan langsung dianggap dibaca. */
    const pLain = await antrean.antrikan({
      perangkatId: PERANGKAT, nomor: '081277788800', isi: { teks: 'Pesan lain' },
    });
    await serahkan(pLain.id);
    await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
    await hit('lapor', { hasil: [{ pesanId: pLain.id, status: 'terkirim', idLuar: 'WA-DULUAN' }] });
    const m2 = await pesanDi(pLain.id);
    cek('titipan tidak dipakai ulang oleh pesan berikutnya',
      m2.status === 'terkirim', m2.status);
  }

  console.log('\n=== K3. CERMIN: PESAN YANG LAHIR DI HP ===');
  /* Amil sering membalas langsung dari HP. Tanpa cermin ini, layar Percakapan
     memuat pertanyaan donatur tanpa jawabannya, dan petugas berikutnya
     menjawab pertanyaan yang sudah selesai. */
  {
    const kemarin = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
    const r = await hit('cermin', { pesan: [
      { perangkatId: PERANGKAT, nomor: '081200011122', teks: 'Sudah kami proses ya Pak',
        keluar: true, idLuar: 'WA-HP-1', waktu: new Date().toISOString() },
      { perangkatId: PERANGKAT, nomor: '081200033344', nama: 'Orang Baru',
        teks: 'Assalamualaikum', keluar: false, idLuar: 'WA-HP-2', waktu: kemarin },
    ] });
    cek('dua pesan dari HP tercatat', r.tubuh.dicatat === 2, r.tubuh);

    const semua = (await db.ambil('pesan:baru')) || [];
    const isi = (await db.ambilBanyak(semua.map(antrean.KUNCI_PESAN))).filter(Boolean);
    const keluarHp = isi.find((x) => x.idLuar === 'WA-HP-1');
    const masukHp = isi.find((x) => x.idLuar === 'WA-HP-2');

    cek('pesan yang diketik di HP tercatat sebagai KELUAR',
      keluarHp && keluarHp.arah === 'keluar', keluarHp && keluarHp.arah);
    cek('dan berstatus terkirim, bukan antre',
      keluarHp && keluarHp.status === 'terkirim', keluarHp && keluarHp.status);
    cek('pesan masuk dari HP tercatat sebagai MASUK',
      masukHp && masukHp.arah === 'masuk', masukHp && masukHp.arah);
    cek('waktunya memakai waktu asli dari HP, bukan waktu pencatatan',
      masukHp && masukHp.dibuat === kemarin, masukHp && masukHp.dibuat);

    /* Nomor yang belum pernah ada harus jadi kontak sendiri, kalau tidak
       percakapannya muncul tanpa nama dan tidak bisa dicari. */
    const kontakBaru = await require('../lib/blast/kontak').cariLewatNomor('6281200033344');
    cek('nomor baru dari HP otomatis jadi kontak',
      !!kontakBaru && kontakBaru.nama === 'Orang Baru', kontakBaru && kontakBaru.nama);

    /* Penyelarasan ulang WhatsApp mengirimkan pesan yang sama lagi. */
    const ulang = await hit('cermin', { pesan: [
      { perangkatId: PERANGKAT, nomor: '081200011122', teks: 'Sudah kami proses ya Pak',
        keluar: true, idLuar: 'WA-HP-1', waktu: new Date().toISOString() },
    ] });
    cek('pesan yang sama tidak tercatat dua kali',
      ulang.tubuh.dicatat === 0 && ulang.tubuh.kembar === 1, ulang.tubuh);

    /* Inilah gunanya indeks id: centang untuk pesan yang dikirim dari HP pun
       tetap bisa naik, jadi amil melihat pesan HP-nya sudah dibaca. */
    const rc = await hit('lapor-status', { hasil: [{ idLuar: 'WA-HP-1', status: 'dibaca' }] });
    const sesudah = await pesanDi(keluarHp.id);
    cek('centang pesan yang dikirim dari HP tetap bisa naik jadi dibaca',
      sesudah.status === 'dibaca', { status: sesudah.status, jawab: rc.tubuh });

    /* Riwayat lama tidak boleh mendorong pesan hari ini keluar dari potongan
       daftar yang dibaca layar. */
    const daftarBaru = (await db.ambil('pesan:baru')) || [];
    const posisiLama = daftarBaru.indexOf(masukHp.id);
    const posisiBaru = daftarBaru.indexOf(keluarHp.id);
    cek('pesan lama ditaruh di akhir daftar, pesan baru tetap di depan',
      posisiBaru >= 0 && posisiLama > posisiBaru, { posisiBaru, posisiLama });

    /* Pengaman terakhir: cermin TIDAK boleh menjalankan balasan otomatis.
       Kalau ia menjalankannya, mengimpor riwayat berarti mengirimi ratusan
       donatur jawaban untuk pertanyaan bulan lalu. */
    const antre = (await db.anggotaHimpunan(antrean.KUNCI_ANTREAN));
    const isiAntre = (await db.ambilBanyak(antre.map(antrean.KUNCI_PESAN))).filter(Boolean);
    cek('cermin tidak memicu balasan otomatis',
      !isiAntre.some((x) => x.nomor === '6281200033344'),
      isiAntre.map((x) => x.nomor));

    const kosong = await hit('cermin', { pesan: [{ nomor: 'bukan-nomor', teks: 'x', idLuar: 'WA-X' }] });
    cek('nomor tidak sah diabaikan, bukan bikin galat',
      kosong.tubuh.ok !== false && kosong.tubuh.diabaikan === 1, kosong.tubuh);
  }

  console.log('\n=== K4. RIWAYAT DARI HP TIDAK MENGGANDAKAN CATATAN LAMA ===');
  /* KEADAAN YANG BENAR-BENAR AKAN TERJADI. Untuk menarik percakapan lama,
     amil harus memindai QR ulang, dan WhatsApp lalu mengirimkan riwayat
     berbulan-bulan ke belakang — termasuk pesan yang DULU dikirim lewat
     LAZDigital sendiri.

     Indeks idluar:* tidak menolong di sini: umurnya cuma tujuh hari, karena
     ia dibuat untuk menangkap centang yang menyusul. Jadi pesan lama datang
     tanpa pengenal apa pun, dan tanpa penjaga kedua seluruh percakapan muncul
     dua kali — sekali dari catatan lama, sekali dari HP. */
  {
    await lepasJeda();
    const pLama = await antrean.antrikan({
      perangkatId: PERANGKAT, nomor: '081255566677', isi: { teks: 'Kwitansi sudah kami kirim ya Pak' },
    });
    await serahkan(pLama.id);
    await hit('ambil', { perangkatId: PERANGKAT, maks: 5 });
    await hit('lapor', { hasil: [{ pesanId: pLama.id, status: 'terkirim', idLuar: 'WA-LAMA-1' }] });

    /* Indeksnya sengaja dihapus: inilah keadaan sesudah tujuh hari lewat. */
    await db.hapus('idluar:WA-LAMA-1');

    const m = await pesanDi(pLama.id);
    const r = await hit('cermin', { pesan: [{
      perangkatId: PERANGKAT, nomor: '081255566677',
      teks: 'Kwitansi sudah kami kirim ya Pak', keluar: true,
      /* Id WhatsApp dari riwayat HP berbeda bentuknya, dan waktunya meleset
         beberapa detik dari catatan kita. Dua-duanya normal. */
      idLuar: 'WA-RIWAYAT-BEDA',
      waktu: new Date(new Date(m.dikirim).getTime() + 3000).toISOString(),
    }] });
    cek('pesan yang sudah ada dikenali walau id WhatsApp-nya berbeda',
      r.tubuh.dicatat === 0 && r.tubuh.kembar === 1, r.tubuh);

    /* Yang BUKAN kembar harus tetap masuk. Penjaga yang terlalu galak sama
       buruknya: percakapan jadi bolong tanpa ada yang tahu. */
    const beda = await hit('cermin', { pesan: [{
      perangkatId: PERANGKAT, nomor: '081255566677',
      teks: 'Ini pesan yang benar-benar lain', keluar: true,
      idLuar: 'WA-RIWAYAT-LAIN',
      waktu: new Date(new Date(m.dikirim).getTime() + 3000).toISOString(),
    }] });
    cek('pesan lain pada menit yang sama tetap dicatat',
      beda.tubuh.dicatat === 1, beda.tubuh);

    /* Kembar di dalam SATU rombongan juga harus tertangkap: riwayat kadang
       memuat pesan yang sama dua kali karena penyelarasan bertumpuk. */
    const rombongan = await hit('cermin', { pesan: [
      { perangkatId: PERANGKAT, nomor: '081255566677', teks: 'Halo dua kali',
        keluar: false, idLuar: 'WA-R1', waktu: new Date().toISOString() },
      { perangkatId: PERANGKAT, nomor: '081255566677', teks: 'Halo dua kali',
        keluar: false, idLuar: 'WA-R2', waktu: new Date().toISOString() },
    ] });
    cek('pesan kembar di dalam satu rombongan hanya dicatat sekali',
      rombongan.tubuh.dicatat === 1 && rombongan.tubuh.kembar === 1, rombongan.tubuh);
  }

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
