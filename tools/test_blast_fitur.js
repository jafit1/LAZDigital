/* Uji fitur Broadcast: hapus riwayat, pemilihan kontak, grup, lampiran templat,
   dan pengaman jeda 30 detik.

   Yang diuji bukan tampilannya, melainkan aturan yang harus tetap benar walau
   siapa pun memanggil API-nya langsung: riwayat yang dihapus tidak boleh tetap
   terkirim, kontak yang diblokir tidak boleh kecolongan, jeda tidak boleh bisa
   diturunkan, dan "hapus semua" tidak boleh bisa dilakukan selain superadmin.

   jalankan:  node tools/test_blast_fitur.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(path.join(AKAR, '.data'), { recursive: true, force: true });

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const db = require('../lib/blast/db');
const kontakLib = require('../lib/blast/kontak');
const berkasLib = require('../lib/blast/berkas');
const antreanLib = require('../lib/blast/antrean');
const setelanLib = require('../lib/blast/setelan');
const { tindakan } = require('../api/blast.js');

let ok = 0, g = 0;
const cek = (n, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

const REQ = { headers: { host: 'uji.test' }, socket: {} };
const SUPER = { id: 'u_super', nama: 'Superadmin', peran: 'superadmin' };
const ADMIN = { id: 'u_admin', nama: 'Admin Daerah', peran: 'admin' };

async function jalan(nama, data, pengguna = SUPER) {
  const t = tindakan[nama];
  if (!t) throw new Error('tindakan tidak ada: ' + nama);
  return t.jalankan({ data: data || {}, pengguna, req: REQ });
}
async function tolak(nama, data, pengguna) {
  try { await jalan(nama, data, pengguna); return null; }
  catch (e) { return e.message || String(e); }
}

/* Sebagian pagar hak akses ada di PENYALUR permintaan, bukan di dalam tiap
   tindakan — supaya tindakan baru yang lupa memasangnya tertutup, bukan
   terbuka diam-diam. Memanggil jalankan() langsung seperti jalan() di atas
   justru melewati pagar itu, jadi yang menguji pagar harus lewat sini. */
const penangan = require('../api/blast.js');
const auth = require('../lib/blast/auth');
const asliMasuk = auth.wajibMasuk;
function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (t) => { try { r.tubuh = JSON.parse(t); } catch (_) { r.tubuh = t; } r.writableEnded = true; return r; };
  return r;
}
async function lewatPintu(nama, data, pengguna) {
  auth.wajibMasuk = async () => pengguna;
  const res = balasan();
  await penangan({ method: 'POST', headers: { host: 'uji.test' }, socket: {},
    body: { tindakan: nama, data: data || {} } }, res);
  auth.wajibMasuk = asliMasuk;
  return res;
}

/* Penyimpanan lokal ditulis dengan penundaan singkat supaya seratus perubahan
   berturut-turut tidak jadi seratus penulisan berkas. Uji ini membaca berkasnya
   langsung untuk memeriksa umur kunci, jadi ia harus menunggu tulisannya
   mendarat — bukan menebak dengan jeda tetap. */
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
async function bacaSimpanan() {
  for (let i = 0; i < 40; i++) {
    try { return JSON.parse(fs.readFileSync('.data/blast.json', 'utf8')); }
    catch (_) { await tidur(25); }
  }
  throw new Error('penyimpanan lokal tidak pernah tertulis');
}

/* Jeda antar pesan dilepas di dalam uji. Kalau tidak, perangkat memasang
   tenggang 30 detik sesudah satu pesan dan pesan berikutnya berstatus
   "ditunda" — bukan bukti kegagalan, hanya uji yang tidak sabar. */
async function lepasJeda(perangkatId) {
  const p = await db.ambil(`perangkat:${perangkatId}`);
  if (p) { delete p.bolehKirimSetelah; await db.simpan(`perangkat:${perangkatId}`, p); }
}

async function buatPerangkat(id = 'p_uji') {
  await db.simpan(`perangkat:${id}`, {
    id, nama: 'Perangkat Uji', nomor: '628111000111',
    driver: 'sandbox', status: 'tersambung', aktif: true,
  });
  await db.tambahKeHimpunan('perangkat:daftar', id);
  return id;
}

(async () => {
  const perangkatId = await buatPerangkat();

  // ======================================================================
  console.log('=== A. PENGAMAN JEDA 30 DETIK ===');
  let s = await setelanLib.ambilSetelan();
  cek('jeda bawaan minimal 30 detik', s.kirim.jedaMinDetik >= 30, s.kirim.jedaMinDetik);

  s = await setelanLib.simpanSetelan({ kirim: { jedaMinDetik: 5, jedaMaksDetik: 6 } });
  cek('jeda 5 detik ditolak, dinaikkan ke 30', s.kirim.jedaMinDetik === 30, s.kirim);
  cek('jeda maksimal ikut naik, tidak jadi lebih kecil dari minimal',
    s.kirim.jedaMaksDetik >= s.kirim.jedaMinDetik, s.kirim);

  /* Setelan yang TERSIMPAN sebelum aturan ini berlaku juga harus tunduk —
     kalau tidak, jeda 10 detik yang lama hidup terus tanpa pernah ditinjau. */
  const lama = await db.ambil('setelan');
  lama.kirim.jedaMinDetik = 8; lama.kirim.jedaMaksDetik = 9;
  await db.simpan('setelan', lama);
  s = await setelanLib.ambilSetelan();
  cek('setelan lama berjeda 8 detik ikut dinaikkan saat dibaca', s.kirim.jedaMinDetik === 30, s.kirim);

  // ======================================================================
  console.log('\n=== B. BIAYA & BERLANGGANAN SUDAH TIDAK ADA ===');
  cek('tidak ada lagi bagian biaya di setelan', s.biaya === undefined, Object.keys(s));
  const dasbor = await jalan('dasbor.ringkas');
  cek('dasbor tidak lagi melaporkan biaya', dasbor.biaya === undefined, Object.keys(dasbor));

  // ======================================================================
  console.log('\n=== C. KONTAK, GRUP, DAN BLOKIR ===');
  const dibuat = {};
  for (const [nama, nomor, grup] of [
    ['Budi Santosa', '081234567801', ['Pengurus']],
    ['Siti Aminah', '081234567802', ['Pengurus', 'Panitia Qurban']],
    ['Joko Widodo', '081234567803', ['Panitia Qurban']],
    ['Rina Wati', '081234567804', []],
  ]) {
    const h = await kontakLib.simpanKontak({ nama, nomor, label: grup, kantor: 'KLL Sewon' });
    dibuat[nama] = h.kontak;
  }

  let grup = await kontakLib.daftarGrup();
  cek('grup dikumpulkan dari kontaknya, tidak perlu didaftarkan',
    grup.length === 2 && grup[0].nama === 'Panitia Qurban' && grup[0].jumlah === 2, grup);

  const ubah = await jalan('grup.ubahNama', { lama: 'Pengurus', baru: 'Pengurus Harian' });
  cek('ubah nama grup menyentuh semua anggotanya sekaligus', ubah.kontak === 2, ubah);
  grup = await kontakLib.daftarGrup();
  cek('nama lama benar-benar hilang', !grup.some((x) => x.nama === 'Pengurus'), grup);

  const hapusG = await jalan('grup.hapus', { grup: 'Pengurus Harian' });
  const budiSesudah = await db.ambil(kontakLib.KUNCI(dibuat['Budi Santosa'].id));
  cek('membubarkan grup TIDAK ikut menghapus kontaknya', Boolean(budiSesudah), hapusG);
  cek('tanda grupnya saja yang lepas', !(budiSesudah.label || []).includes('Pengurus Harian'), budiSesudah.label);

  await jalan('grup.atur', { kontakId: [dibuat['Budi Santosa'].id, dibuat['Rina Wati'].id], grup: 'Pengurus Harian' });
  grup = await kontakLib.daftarGrup();
  cek('memasukkan banyak kontak sekaligus ke satu grup',
    (grup.find((x) => x.nama === 'Pengurus Harian') || {}).jumlah === 2, grup);

  // Blokir: satu saklar, dan data lama tetap dihormati
  await jalan('kontak.ubahBlokir', { id: dibuat['Rina Wati'].id, diblokir: true });
  const rina = await db.ambil(kontakLib.KUNCI(dibuat['Rina Wati'].id));
  cek('memblokir menurunkan kedua medan sekaligus, tidak bisa saling bertentangan',
    rina.daftarHitam === true && rina.langganan === false, rina);

  const joko = await db.ambil(kontakLib.KUNCI(dibuat['Joko Widodo'].id));
  joko.langganan = false; joko.daftarHitam = false;   // bentuk data LAMA
  await db.simpan(kontakLib.KUNCI(joko.id), joko);
  cek('kontak lama yang pernah membalas BERHENTI tetap dianggap diblokir',
    kontakLib.diblokir(joko) === true && kontakLib.bolehDikirimiMassal(joko) === false);

  const pilihan = await jalan('kontak.pilihan');
  const rinaDiPemilih = pilihan.baris.find((k) => k.id === dibuat['Rina Wati'].id);
  cek('kontak diblokir tetap tampil di pemilih, tetapi ditandai',
    Boolean(rinaDiPemilih) && rinaDiPemilih.diblokir === true, rinaDiPemilih);

  // ======================================================================
  console.log('\n=== D. KIRIM PESAN LEWAT KONTAK ===');
  const tanpaKontak = await tolak('pesan.kirim', { perangkatId, teks: 'halo' });
  cek('mengirim tanpa memilih kontak ditolak', /minimal satu kontak/i.test(tanpaKontak || ''), tanpaKontak);
  cek('alasannya menyebut nomor harus disimpan dulu', /disimpan/i.test(tanpaKontak || ''), tanpaKontak);

  const h = await jalan('pesan.kirim', {
    perangkatId, teks: 'Assalamualaikum {{nama}} dari {{kantor}}',
    kontakId: [dibuat['Budi Santosa'].id, dibuat['Siti Aminah'].id, dibuat['Rina Wati'].id],
  });
  cek('dua kontak sehat masuk antrean', h.jumlah === 2, h);
  cek('kontak diblokir dilewati, bukan dikirimi', h.dilewati.length === 1 && /Rina/.test(h.dilewati[0]), h.dilewati);
  cek('yang dilewati disebutkan di catatan, tidak disembunyikan', /dilewati/i.test(h.catatan), h.catatan);

  const semuaId = (await db.ambil('pesan:baru')) || [];
  const isiPesan = (await db.ambilBanyak(semuaId.map(antreanLib.KUNCI_PESAN))).filter(Boolean);
  const keBudi = isiPesan.find((p) => p.nomor === '6281234567801');
  const keSiti = isiPesan.find((p) => p.nomor === '6281234567802');
  cek('tiap penerima mendapat NAMANYA SENDIRI, bukan nama yang sama',
    /Budi Santosa/.test(keBudi.isi.teks) && /Siti Aminah/.test(keSiti.isi.teks),
    [keBudi.isi.teks, keSiti.isi.teks]);
  cek('penanda {{kantor}} ikut terisi', /KLL Sewon/.test(keBudi.isi.teks), keBudi.isi.teks);
  cek('tidak ada penanda mentah yang lolos ke pesan', !/\{\{/.test(keBudi.isi.teks), keBudi.isi.teks);

  const anonim = await kontakLib.simpanKontak({ nama: 'Hamba Allah', nomor: '081234567805', anonim: true });
  await lepasJeda(perangkatId);
  await jalan('pesan.kirim', { perangkatId, teks: 'Halo {{nama}}', kontakId: [anonim.kontak.id] });
  const semua2 = (await db.ambil('pesan:baru')) || [];
  const keAnonim = (await db.ambilBanyak(semua2.map(antreanLib.KUNCI_PESAN)))
    .filter(Boolean).find((p) => p.nomor === '6281234567805');
  cek('donatur anonim disapa Bapak/Ibu, namanya tidak dipakai',
    /Bapak\/Ibu/.test(keAnonim.isi.teks) && !/Hamba Allah/.test(keAnonim.isi.teks), keAnonim.isi.teks);

  // ======================================================================
  console.log('\n=== E. KIRIMAN MASSAL LEWAT GRUP ===');
  await lepasJeda(perangkatId);
  const m = await jalan('massal.kirim', {
    nama: 'Uji grup', perangkatId, teks: 'Halo {{nama}}',
    grup: ['Pengurus Harian', 'Panitia Qurban'],
  });
  /* Gabungan, bukan irisan: Budi (Pengurus Harian), Siti (Panitia Qurban).
     Rina diblokir, Joko diblokir lewat data lama — keduanya tidak ikut. */
  cek('dua grup dicentang berarti GABUNGAN keduanya, bukan irisan', m.massal.jumlah === 2, m.massal);
  cek('penerimanya dicatat sebagai kalimat, tahan terhadap grup yang nanti dibubarkan',
    /Pengurus Harian/.test(m.massal.penerimaTertulis) && /Panitia Qurban/.test(m.massal.penerimaTertulis),
    m.massal.penerimaTertulis);

  const kosong = await tolak('massal.kirim', {
    nama: 'Uji kosong', perangkatId, teks: 'x', grup: ['Grup Yang Tidak Ada'],
  });
  cek('grup kosong ditolak dengan alasan yang jelas', /tidak ada penerima/i.test(kosong || ''), kosong);

  // ======================================================================
  console.log('\n=== F. LAMPIRAN TEMPLAT TIDAK KEDALUWARSA ===');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const brk = await jalan('berkas.unggah', { nama: 'brosur zakat.png', tipe: 'image/png', base64: PNG });
  const sebelum = await bacaSimpanan();
  cek('lampiran biasa berumur terbatas',
    Boolean(sebelum.kedaluwarsa['blast:berkas:isi:' + brk.berkas.id]), Object.keys(sebelum.kedaluwarsa));

  const t1 = await jalan('templat.simpan', { nama: 'Brosur Zakat', isi: 'Halo {{nama}}', berkasId: brk.berkas.id });
  const tSimpan = t1.baris.find((x) => x.nama === 'Brosur Zakat');
  cek('templat menyimpan lampirannya', tSimpan.berkasId === brk.berkas.id, tSimpan);
  cek('nama berkas ikut tersimpan supaya bisa ditampilkan', /brosur zakat/i.test(tSimpan.namaBerkas || ''), tSimpan);

  await tidur(60);
  const sesudah = await bacaSimpanan();
  cek('begitu dipakai templat, umurnya dilepas — tidak hilang tujuh hari lagi',
    !sesudah.kedaluwarsa['blast:berkas:isi:' + brk.berkas.id]
    && !sesudah.kedaluwarsa['blast:berkas:' + brk.berkas.id],
    Object.keys(sesudah.kedaluwarsa));

  const t2 = await jalan('templat.simpan', { id: tSimpan.id, nama: 'Brosur Zakat', isi: 'diubah {{nama}}' });
  cek('menyunting isi templat tanpa menyentuh berkas TIDAK menghilangkan lampirannya',
    (t2.baris.find((x) => x.id === tSimpan.id) || {}).berkasId === brk.berkas.id, t2.baris[0]);

  const t3 = await jalan('templat.simpan', { id: tSimpan.id, nama: 'Brosur Zakat', isi: 'x', hapusBerkas: true });
  cek('melepas lampiran templat berhasil bila diminta tegas',
    !(t3.baris.find((x) => x.id === tSimpan.id) || {}).berkasId, t3.baris[0]);

  const hilang = await tolak('templat.simpan', { nama: 'Rusak', isi: 'x', berkasId: 'f_tidakada' });
  cek('lampiran yang sudah hilang ditolak saat menyimpan, bukan disimpan cacat',
    /unggah ulang/i.test(hilang || ''), hilang);

  // ======================================================================
  console.log('\n=== G. HAPUS RIWAYAT ===');
  await lepasJeda(perangkatId);
  const sisaAntre = await db.anggotaHimpunan(antreanLib.KUNCI_ANTREAN);
  cek('ada pesan yang masih antre untuk diuji', sisaAntre.length > 0, sisaAntre.length);

  const satu = sisaAntre[0];
  const pesanSatu = await db.ambil(antreanLib.KUNCI_PESAN(satu));
  await jalan('pesan.hapus', { id: satu });
  cek('dokumen pesannya benar-benar hilang', (await db.ambil(antreanLib.KUNCI_PESAN(satu))) === null);
  cek('dan ia KELUAR dari antrean — kalau tidak, pesan yang "dihapus" tetap terkirim',
    !(await db.anggotaHimpunan(antreanLib.KUNCI_ANTREAN)).includes(satu));
  cek('id-nya lepas dari daftar pesan terbaru',
    !((await db.ambil('pesan:baru')) || []).includes(satu));
  cek('dan lepas dari utas percakapan nomor itu',
    !(await db.anggotaHimpunan(`percakapan:${pesanSatu.nomor}`)).includes(satu));

  const tidakAda = await tolak('pesan.hapus', { id: 'm_tidakada' });
  cek('menghapus pesan yang tidak ada menghasilkan pesan galat, bukan diam saja',
    /tidak ditemukan/i.test(tidakAda || ''), tidakAda);

  // Hapus semua — hanya superadmin, dan harus diketik ulang
  const olehAdmin = await lewatPintu('pesan.hapusSemua', { tegaskan: 'HAPUS SEMUA' }, ADMIN);
  cek('admin biasa TIDAK boleh mengosongkan seluruh riwayat',
    olehAdmin.statusCode === 403, { kode: olehAdmin.statusCode, tubuh: olehAdmin.tubuh });
  cek('dan pesannya menyebut superadmin, bukan galat samar',
    /superadmin/i.test(JSON.stringify(olehAdmin.tubuh || '')), olehAdmin.tubuh);

  const tanpaKetik = await tolak('pesan.hapusSemua', { tegaskan: 'ya' });
  cek('tanpa mengetik HAPUS SEMUA pun ditolak', /HAPUS SEMUA/.test(tanpaKetik || ''), tanpaKetik);

  const auditSebelum = ((await db.ambil('audit')) || []).length;
  const kontakSebelum = (await kontakLib.semuaKontak()).length;
  const bersih = await jalan('pesan.hapusSemua', { tegaskan: 'hapus semua' });
  cek('kata kuncinya tidak peka huruf besar-kecil', bersih.terhapus >= 0, bersih);
  cek('daftar pesan benar-benar kosong', ((await db.ambil('pesan:baru')) || []).length === 0);
  cek('antrean ikut kosong', (await db.anggotaHimpunan(antreanLib.KUNCI_ANTREAN)).length === 0);
  cek('kotak surat mati ikut kosong', (await db.anggotaHimpunan('pesan:gagal')).length === 0);
  cek('himpunan serahan ikut kosong', (await db.anggotaHimpunan(antreanLib.KUNCI_SERAHAN)).length === 0);

  cek('KONTAK tidak ikut terhapus', (await kontakLib.semuaKontak()).length === kontakSebelum);
  cek('templat tidak ikut terhapus', ((await db.ambil('templat')) || []).length > 0);
  const auditSesudah = (await db.ambil('audit')) || [];
  cek('catatan audit TIDAK dihapus — termasuk jejak penghapusan ini',
    auditSesudah.length > auditSebelum && auditSesudah.some((a) => a.tindakan === 'pesan.hapusSemua'),
    auditSesudah.slice(0, 2).map((a) => a.tindakan));

  const laporan = await antreanLib.prosesAntrean(2000);
  cek('putaran antrean sesudah pengosongan tidak melakukan apa-apa', laporan.diproses === 0, laporan);

  // ======================================================================
  console.log('\n=== H. WEBHOOK & AUDIT: SUPERADMIN SAJA ===');
  const webhookLib = require('../lib/blast/webhook');

  for (const [nama, bagian] of [
    ['webhook.riwayat', 'webhook'], ['webhook.uji', 'webhook'], ['webhook.kirimUlang', 'webhook'],
    ['webhook.hapus', 'webhook'], ['webhook.kosongkan', 'webhook'],
    ['audit.daftar', 'audit'], ['audit.hapus', 'audit'], ['audit.kosongkan', 'audit'],
  ]) {
    cek(`${nama} dijaga akses "${bagian}"`,
      tindakan[nama] && tindakan[nama].khusus === bagian, [nama, tindakan[nama] && tindakan[nama].khusus]);
  }
  cek('mengatur siapa yang boleh tetap superadmin saja',
    tindakan['akses.atur'].superadmin === true && tindakan['akses.daftar'].superadmin === true);

  const adminBuka = await lewatPintu('audit.daftar', {}, ADMIN);
  cek('admin daerah ditolak membuka catatan audit',
    adminBuka.statusCode === 403, { kode: adminBuka.statusCode, tubuh: adminBuka.tubuh });
  const adminWebhook = await lewatPintu('webhook.riwayat', {}, ADMIN);
  cek('admin daerah ditolak membuka riwayat webhook', adminWebhook.statusCode === 403, adminWebhook.statusCode);
  const superBuka = await lewatPintu('audit.daftar', {}, SUPER);
  cek('superadmin tetap bisa membukanya', superBuka.statusCode === 200, superBuka.statusCode);

  /* Menutup menunya saja tidak cukup: kartu Webhook di Pengaturan memuat
     alamat tujuan dan rahasia tanda tangannya. */
  const setelanAdmin = await lewatPintu('setelan.ambil', {}, ADMIN);
  cek('setelan yang dikirim ke admin daerah TIDAK memuat bagian webhook',
    setelanAdmin.tubuh.setelan.webhook === undefined, Object.keys(setelanAdmin.tubuh.setelan));
  const setelanSuper = await lewatPintu('setelan.ambil', {}, SUPER);
  cek('superadmin tetap menerimanya', Boolean(setelanSuper.tubuh.setelan.webhook));

  await lewatPintu('setelan.simpan', { setelan: { webhook: { url: 'https://jahat.example/ambil' } } }, ADMIN);
  const sesudahCoba = await setelanLib.ambilSetelan();
  cek('admin daerah tidak bisa mengubah alamat webhook walau permintaannya disusun sendiri',
    sesudahCoba.webhook.url !== 'https://jahat.example/ambil', sesudahCoba.webhook.url);

  // --- Menghapus ---
  await auth.catatAudit(SUPER, 'uji.satu', {}, REQ);
  await auth.catatAudit(SUPER, 'uji.dua', {}, REQ);
  let audit = (await db.ambil('audit')) || [];
  const sasaranAudit = audit.find((a) => a.tindakan === 'uji.satu');
  await jalan('audit.hapus', { id: sasaranAudit.id });
  audit = (await db.ambil('audit')) || [];
  cek('satu catatan audit bisa dihapus', !audit.some((a) => a.id === sasaranAudit.id));
  cek('penghapusannya sendiri ikut tercatat',
    audit.some((a) => a.tindakan === 'audit.hapus'), audit.slice(0, 2).map((a) => a.tindakan));

  const jumlahSebelum = audit.length;
  const tolakKetik = await tolak('audit.kosongkan', { tegaskan: 'ya' });
  cek('mengosongkan audit tanpa mengetik HAPUS SEMUA ditolak', /HAPUS SEMUA/.test(tolakKetik || ''), tolakKetik);
  cek('dan datanya memang belum tersentuh', ((await db.ambil('audit')) || []).length === jumlahSebelum);

  const hasilKosong = await jalan('audit.kosongkan', { tegaskan: 'HAPUS SEMUA' });
  const auditBaru = (await db.ambil('audit')) || [];
  cek('seluruh catatan lama hilang', auditBaru.length === 1, auditBaru.length);
  cek('tetapi lognya tidak berpura-pura tidak pernah berisi',
    auditBaru[0].tindakan === 'audit.kosongkan' && auditBaru[0].rincian.terhapus === jumlahSebelum,
    auditBaru[0]);
  cek('jumlah yang terhapus dilaporkan apa adanya', hasilKosong.terhapus === jumlahSebelum, hasilKosong);

  // Riwayat webhook
  await webhookLib.kirimKejadian('uji', { id: 'x1', nomor: '628000000001', status: 'uji' });
  await webhookLib.kirimKejadian('uji', { id: 'x2', nomor: '628000000002', status: 'uji' });
  let riwayat = await webhookLib.riwayat(50);
  cek('riwayat webhook terisi untuk diuji', riwayat.length >= 2, riwayat.length);

  await jalan('webhook.hapus', { id: riwayat[0].id });
  const sesudahHapusW = await webhookLib.riwayat(50);
  cek('satu baris riwayat webhook bisa dihapus',
    sesudahHapusW.length === riwayat.length - 1, { sebelum: riwayat.length, sesudah: sesudahHapusW.length });

  const tidakAdaW = await tolak('webhook.hapus', { id: 'w_tidakada' });
  cek('baris yang tidak ada dijawab dengan penjelasan', /tidak ditemukan/i.test(tidakAdaW || ''), tidakAdaW);

  /* Kejadian gagal terdaftar di kotak mati dan bisa dikirim ulang. Kalau
     pengosongan hanya membuang riwayatnya, ia tetap menunggu di sana —
     tidak terlihat di mana pun, tetapi masih bisa dijalankan. */
  await db.tambahKeHimpunan('webhook:mati', 'w_matiuji');
  await db.simpan('webhook:kejadian:w_matiuji', { id: 'w_matiuji', jenis: 'uji', data: {} });
  const kosongW = await jalan('webhook.kosongkan', { tegaskan: 'HAPUS SEMUA' });
  cek('mengosongkan riwayat webhook mengosongkan seluruhnya',
    (await webhookLib.riwayat(50)).length === 0);
  cek('kotak mati ikut dibersihkan, tidak ada yang tertinggal menunggu',
    (await db.anggotaHimpunan('webhook:mati')).length === 0 && kosongW.mati >= 1, kosongW);
  cek('dan dokumen kejadiannya ikut hilang',
    (await db.ambil('webhook:kejadian:w_matiuji')) === null);

  console.log('\n=== I. AKSES KHUSUS PER PENGGUNA ===');
  const adminBiasa = await lewatPintu('audit.daftar', {}, ADMIN);
  cek('sebelum diberi akses, admin daerah ditolak', adminBiasa.statusCode === 403, adminBiasa.statusCode);
  cek('penolakannya menunjukkan jalan keluar, bukan sekadar "tidak boleh"',
    /Tim & Petugas/.test(JSON.stringify(adminBiasa.tubuh || '')), adminBiasa.tubuh);

  const tolakSendiri = await lewatPintu('akses.atur',
    { bagian: 'audit', penggunaId: ADMIN.id, boleh: true }, ADMIN);
  cek('admin daerah TIDAK bisa memberi akses kepada dirinya sendiri',
    tolakSendiri.statusCode === 403, tolakSendiri.statusCode);

  await jalan('akses.atur', { bagian: 'audit', penggunaId: ADMIN.id, boleh: true });
  const sesudahDiberi = await lewatPintu('audit.daftar', {}, ADMIN);
  cek('sesudah superadmin membukanya, admin daerah boleh masuk',
    sesudahDiberi.statusCode === 200, sesudahDiberi.statusCode);

  const webhookMasih = await lewatPintu('webhook.riwayat', {}, ADMIN);
  cek('akses audit TIDAK ikut membuka webhook — keduanya terpisah',
    webhookMasih.statusCode === 403, webhookMasih.statusCode);

  const setelanAdmin2 = await lewatPintu('setelan.ambil', {}, ADMIN);
  cek('dan bagian webhook di Pengaturan tetap disembunyikan darinya',
    setelanAdmin2.tubuh.setelan.webhook === undefined, Object.keys(setelanAdmin2.tubuh.setelan));

  /* Yang paling mudah terlewat: memberi akses lewat pintu yang salah. */
  await lewatPintu('setelan.simpan',
    { setelan: { aksesKhusus: { webhook: [ADMIN.id], audit: [ADMIN.id] } } }, ADMIN);
  const lewatSetelan = await lewatPintu('webhook.riwayat', {}, ADMIN);
  cek('akses tidak bisa diselundupkan lewat setelan.simpan',
    lewatSetelan.statusCode === 403, lewatSetelan.statusCode);

  await jalan('akses.atur', { bagian: 'audit', penggunaId: ADMIN.id, boleh: false });
  const dicabut = await lewatPintu('audit.daftar', {}, ADMIN);
  cek('akses bisa dicabut lagi', dicabut.statusCode === 403, dicabut.statusCode);

  const statusSuper = await lewatPintu('auth.saya', {}, SUPER);
  cek('superadmin selalu dilaporkan boleh keduanya',
    statusSuper.tubuh.akses.webhook === true && statusSuper.tubuh.akses.audit === true, statusSuper.tubuh.akses);
  const statusAdmin = await lewatPintu('auth.saya', {}, ADMIN);
  cek('admin daerah dilaporkan tidak boleh — tampilan menyembunyikan menunya',
    statusAdmin.tubuh.akses.webhook === false && statusAdmin.tubuh.akses.audit === false, statusAdmin.tubuh.akses);

  console.log('\n=== J. BERAPA YANG MEMBALAS ===');
  await db.hapus('pesan:baru');
  const t0 = Date.now();
  const buatPesan = async (id, nomor, arah, geserDetik, massalId) => {
    await db.simpan(antreanLib.KUNCI_PESAN(id), {
      id, nomor, arah, massalId: massalId || null, status: arah === 'masuk' ? 'masuk' : 'terkirim',
      isi: { teks: 'x' },
      dibuat: new Date(t0 + geserDetik * 1000).toISOString(),
      dikirim: new Date(t0 + geserDetik * 1000).toISOString(),
    });
    await antreanLib.catatKeDaftar(id);
  };
  await buatPesan('m_k1', '6281000000001', 'keluar', 0, 'c_uji');
  await buatPesan('m_k2', '6281000000002', 'keluar', 0, 'c_uji');
  await buatPesan('m_k3', '6281000000003', 'keluar', 0, 'c_uji');
  await buatPesan('m_b1', '6281000000001', 'masuk', 60);       // membalas
  await buatPesan('m_b1b', '6281000000001', 'masuk', 120);     // membalas lagi
  await buatPesan('m_b2', '6281000000002', 'masuk', -600);     // SEBELUM dikirimi
  await buatPesan('m_b9', '6289999999999', 'masuk', 60);       // tidak pernah dikirimi

  const dasbor2 = await jalan('dasbor.ringkas');
  cek('yang membalas dihitung', dasbor2.balasan.membalas === 1, dasbor2.balasan);
  cek('membalas dua kali tetap dihitung satu orang', dasbor2.balasan.membalas === 1, dasbor2.balasan);
  cek('pesan masuk SEBELUM dikirimi tidak dihitung sebagai balasan',
    dasbor2.balasan.membalas === 1, dasbor2.balasan);
  cek('nomor yang tidak pernah dikirimi tidak ikut dihitung',
    dasbor2.balasan.dikirimi === 3, dasbor2.balasan);
  cek('persentasenya terhadap yang dikirimi', dasbor2.balasan.persen === 33, dasbor2.balasan);

  console.log('\ntest_blast_fitur.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
