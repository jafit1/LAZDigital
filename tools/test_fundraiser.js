/* Uji halaman Fundraiser dan pencocokan otomatis.
 *
 * YANG DIJAGA DI SINI ADALAH UANG ORANG, jadi yang paling banyak diperiksa
 * justru keadaan-keadaan yang TIDAK boleh dicocokkan sendiri oleh mesin.
 *
 * 1. TUNGGAL DUA ARAH. Dua donatur bernama sama yang menyetor nominal sama di
 *    minggu yang sama adalah keadaan yang benar-benar terjadi di lembaga zakat,
 *    terutama pada nama yang umum. Kalau mesin memilih salah satu, uang si A
 *    tercatat sebagai uang si B, dan yang paling berbahaya: TOTALNYA TETAP
 *    BENAR. Laporan terlihat seimbang, jadi tidak ada yang pernah curiga.
 *
 * 2. SATU KWITANSI SEKALI PAKAI. Satu baris buku kas tidak boleh jadi bukti
 *    bagi dua setoran berbeda, walaupun keduanya sama persis.
 *
 * 3. CAP "OTOMATIS". Hasil mesin harus bisa dipisahkan dari pekerjaan petugas,
 *    karena kesalahan mesin datang berombongan dan hanya bisa diurai kalau
 *    jejaknya ada.
 *
 * 4. PENYARING TIDAK BOLEH MEMPERLUAS. Fundraiser biasa yang mengirimkan id
 *    rekannya harus tetap melihat datanya sendiri. Kalau penyaringnya dipercaya
 *    begitu saja, satu parameter sudah cukup untuk membaca setoran orang lain.
 *
 * jalankan:  node tools/test_fundraiser.js
 */
'use strict';
require('./_pagar-db.js')('Uji Fundraiser');
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(path.join(AKAR, '.data'), { recursive: true, force: true });

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const db = require('../lib/fund/db');
const donaturLib = require('../lib/fund/donatur');
const himpunanLib = require('../lib/fund/himpunan');
const akunLib = require('../lib/fund/akun');
const pencocok = require('../lib/fund/pencocok');
const fundraiserLib = require('../lib/fund/fundraiser');
const rpc = require('../api/rpc.js');
const { tindakan } = require('../api/fund.js');

let ok = 0, gagal = 0;
const cek = (n, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { gagal++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

const REQ = { headers: { host: 'uji.test' }, socket: {} };

/* Dua akun: satu pengawas yang melihat semua, satu penggalang biasa.
   _laz meniru bentuk pengguna LAZDigital, karena itulah yang dibaca
   lib/fund/sesi-laz.js untuk memutuskan lihatSemua. */
const BOS = {
  id: 'u_bos', nama: 'Koordinator', peran: 'koordinator',
  _laz: { id: 'u_bos', role: 'staff', nama: 'Koordinator', permissions: { fundraising: { view: true, create: true, edit: true, delete: true } } },
};
const SLAMET = {
  id: 'u_slamet', nama: 'Slamet', peran: 'penggalang',
  _laz: { id: 'u_slamet', role: 'staff', nama: 'Slamet', permissions: { fundraising: { view: true, create: true, edit: true } } },
};
const RINA = {
  id: 'u_rina', nama: 'Rina', peran: 'penggalang',
  _laz: { id: 'u_rina', role: 'staff', nama: 'Rina', permissions: { fundraising: { view: true, create: true, edit: true } } },
};

async function jalan(nama, data, pengguna = BOS) {
  const t = tindakan[nama];
  if (!t) throw new Error('tindakan tidak ada: ' + nama);
  return t.jalankan({ data: data || {}, pengguna, req: REQ });
}
async function tolak(nama, data, pengguna) {
  try { await jalan(nama, data, pengguna); return null; }
  catch (e) { return e.message || String(e); }
}

/* Buku Penghimpunan LAZDigital ditiru di sini. rpc._internal.muat() adalah satu
   satunya pintu yang dipakai api/fund.js untuk membacanya, jadi cukup pintu itu
   yang diganti — tanpa menyiapkan seluruh basis data LAZDigital. */
const BUKU = [['id', 'tanggal', 'namaDonatur', 'jumlah', 'jenisDana', 'fundraising', 'noKwitansi']];
const muatAsli = rpc._internal.muat;
rpc._internal.muat = async () => ({
  db: { sheets: { Penghimpunan: BUKU, Users: USERS } },
  teks: '', ver: 1,
});
function bukuTambah(baris) { BUKU.push(baris); }

const USERS = [
  ['id', 'username', 'nama', 'role', 'permissions', 'aktif', 'layanan'],
  ['u_bos', 'koordinator', 'Koordinator', 'staff', JSON.stringify({ fundraising: { view: true, create: true, edit: true, delete: true } }), 'true', ''],
  ['u_slamet', 'slamet', 'Slamet Riyadi', 'staff', JSON.stringify({ fundraising: { view: true, create: true, edit: true } }), 'true', ''],
  ['u_rina', 'rina', 'Rina Wati', 'staff', JSON.stringify({ fundraising: { view: true, create: true } }), 'true', ''],
  /* Akun yang dibuatkan tetapi belum pernah menyetor. Justru ini yang harus
     terlihat: akun menganggur adalah kabar, bukan baris yang pantas hilang. */
  ['u_baru', 'baru', 'Fundraiser Baru', 'staff', JSON.stringify({ fundraising: { view: true, create: true } }), 'true', ''],
  /* Superadmin memegang seluruh centang. Ia TIDAK boleh muncul sebagai
     fundraiser berangka nol hanya karena itu. */
  ['u_super', 'superadmin', 'Super Administrator', 'superadmin', JSON.stringify({}), 'true', ''],
  /* Akun tanpa centang fundraising sama sekali. */
  ['u_lain', 'lain', 'Orang Lain', 'staff', JSON.stringify({ broadcast: { view: true } }), 'true', ''],
];

let urut = 0;
async function buatSetoran(pemilikPengguna, { nama, jumlah, tanggal }) {
  urut++;
  /* Lokasi wajib diisi saat menyimpan donatur, jadi diberi koordinat Bantul
     apa adanya. Yang sedang diuji bukan petanya. */
  const { donatur } = await donaturLib.simpanDonatur({
    nama,
    telepon: '08122' + String(1000000 + urut),
    lokasi: { lat: -7.888, lng: 110.328, alamat: 'Bantul' },
  }, pemilikPengguna.id);
  return himpunanLib.catatKunjungan(
    { donaturId: donatur.id, jumlah, peruntukan: 'Zakat', tanggal },
    { pengguna: pemilikPengguna, namaFundraising: pemilikPengguna.nama, status: 'diambil' });
}

/* Uji ini boleh dijalankan di atas PostgreSQL percobaan (lihat _pagar-db.js).
   Berbeda dengan berkas JSON lokal yang dihapus di atas, basis data tidak
   kosong dengan sendirinya: menjalankan uji dua kali berarti donatur dan
   setoran dari jalan pertama masih ada, angkanya berlipat, dan yang merah
   adalah ujinya — bukan kodenya. Jadi kunci modul ini dibersihkan dulu. */
async function kosongkanFund() {
  if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL)) return;
  const pg = require('../lib/kv-postgres.js');
  const klien = await pg.ambilKolam().connect();
  try {
    await klien.query("DELETE FROM kv WHERE kunci LIKE 'fund:%'");
    await klien.query("DELETE FROM kv_set WHERE kunci LIKE 'fund:%'");
  } finally { klien.release(); }
}

(async () => {
  await kosongkanFund();
  console.log('=== A. MESIN PENCOCOK (tanpa basis data) ===');
  {
    const fund = [
      { id: 'f1', donaturNama: 'Budi Santosa', jumlah: 250000, tanggal: '2026-09-10', cocok: { sudah: false } },
      { id: 'f2', donaturNama: 'Siti Aminah', jumlah: 100000, tanggal: '2026-09-10', cocok: { sudah: false } },
      { id: 'f3', donaturNama: 'Joko Widodo', jumlah: 75000, tanggal: '2026-09-10', cocok: { sudah: false } },
      { id: 'f4', donaturNama: 'Rina Wati', jumlah: 50000, tanggal: '2026-09-01', cocok: { sudah: false } },
    ];
    const main = [
      { id: 'm1', nama: 'budi  SANTOSA', jumlah: 250000, tanggal: '2026-09-12', noKwitansi: 'KW-1' },
      { id: 'm2', nama: 'Siti Aminah', jumlah: 150000, tanggal: '2026-09-10', noKwitansi: 'KW-2' },
      { id: 'm4', nama: 'Rina Wati', jumlah: 50000, tanggal: '2026-09-20', noKwitansi: 'KW-4' },
    ];
    const h = pencocok.padankan(fund, main);
    cek('nama beda huruf besar dan spasi ganda tetap dianggap sama',
      h.pasangan.length === 1 && h.pasangan[0].fundId === 'f1', h.pasangan);
    cek('nomor kwitansi dibawa sebagai rujukannya',
      h.pasangan[0].ref === 'KW-1', h.pasangan[0]);
    cek('nama ada tetapi nominal beda diberi alasan "nominal"',
      h.alasan.get('f2') === pencocok.ALASAN.NOMINAL, h.alasan.get('f2'));
    cek('nama tidak ada di buku diberi alasan "tidak-ada"',
      h.alasan.get('f3') === pencocok.ALASAN.TIDAK_ADA, h.alasan.get('f3'));
    cek('nama dan nominal cocok tetapi 19 hari terpaut diberi alasan "tanggal"',
      h.alasan.get('f4') === pencocok.ALASAN.TANGGAL, h.alasan.get('f4'));
  }

  console.log('\n=== B. YANG TIDAK BOLEH DICOCOKKAN SENDIRI ===');
  {
    /* Dua setoran sama persis dari nama yang sama. Inilah yang paling",
       berbahaya: kalau mesin memilih salah satu, totalnya TETAP benar. */
    const fund = [
      { id: 'g1', donaturNama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-10', cocok: { sudah: false } },
      { id: 'g2', donaturNama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-11', cocok: { sudah: false } },
    ];
    const main = [{ id: 'n1', nama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-10', noKwitansi: 'KW-A' }];
    const h = pencocok.padankan(fund, main);
    cek('dua setoran memperebutkan satu kwitansi: TIDAK ada yang dicocokkan',
      h.pasangan.length === 0, h.pasangan);
    cek('keduanya ditandai "ganda" supaya diperiksa orang',
      h.alasan.get('g1') === pencocok.ALASAN.GANDA && h.alasan.get('g2') === pencocok.ALASAN.GANDA,
      [h.alasan.get('g1'), h.alasan.get('g2')]);
  }
  {
    /* Satu setoran, dua kwitansi yang sama-sama mungkin. */
    const fund = [{ id: 'g3', donaturNama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-10', cocok: { sudah: false } }];
    const main = [
      { id: 'n2', nama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-10', noKwitansi: 'KW-B' },
      { id: 'n3', nama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-11', noKwitansi: 'KW-C' },
    ];
    const h = pencocok.padankan(fund, main);
    cek('satu setoran dengan dua kemungkinan juga tidak dicocokkan',
      h.pasangan.length === 0 && h.alasan.get('g3') === pencocok.ALASAN.GANDA, h.alasan.get('g3'));
  }
  {
    /* Kwitansi yang SUDAH dipakai catatan lain tidak boleh dipakai lagi. */
    const fund = [
      { id: 'g4', donaturNama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-10', cocok: { sudah: true, ref: 'KW-D' } },
      { id: 'g5', donaturNama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-10', cocok: { sudah: false } },
    ];
    const main = [{ id: 'KW-D', nama: 'Ahmad', jumlah: 100000, tanggal: '2026-09-10', noKwitansi: 'KW-D' }];
    const h = pencocok.padankan(fund, main);
    cek('kwitansi yang sudah terpakai tidak dipakai dua kali',
      h.pasangan.length === 0 && h.alasan.get('g5') === pencocok.ALASAN.TIDAK_ADA, h.alasan.get('g5'));
    cek('yang sudah cocok ditandai "sudah", bukan dihitung ulang',
      h.alasan.get('g4') === pencocok.ALASAN.SUDAH, h.alasan.get('g4'));
  }

  console.log('\n=== C. PENCOCOKAN OTOMATIS DI ATAS DATA SUNGGUHAN ===');
  await akunLib.simpanAkun(SLAMET, { namaTampil: 'Slamet', namaFundraising: 'Slamet' });
  await akunLib.simpanAkun(RINA, { namaTampil: 'Rina', namaFundraising: 'Rina' });

  const s1 = await buatSetoran(SLAMET, { nama: 'Budi Santosa', jumlah: 250000, tanggal: '2026-09-10' });
  const s2 = await buatSetoran(SLAMET, { nama: 'Siti Aminah', jumlah: 100000, tanggal: '2026-09-10' });
  const r1 = await buatSetoran(RINA, { nama: 'Joko Widodo', jumlah: 300000, tanggal: '2026-09-11' });

  bukuTambah(['p1', '2026-09-12', 'Budi Santosa', 250000, 'Zakat', 'Slamet', 'KW-001']);
  bukuTambah(['p2', '2026-09-11', 'Joko Widodo', 300000, 'Zakat', 'Rina', 'KW-002']);
  /* Siti sengaja TIDAK ada di buku: ia harus tersisa sebagai "belum cocok". */

  const hasil = await jalan('cocok.otomatis', {});
  cek('dua yang persis dicocokkan otomatis', hasil.ditandai === 2, hasil);
  cek('sisanya disebut, bukan didiamkan', hasil.sisa === 1, hasil);

  const cocok1 = await himpunanLib.ambil(s1.id);
  cek('penandaannya membawa nomor kwitansi', cocok1.cocok.ref === 'KW-001', cocok1.cocok);
  cek('dan dicap sebagai hasil sistem, bukan orang',
    cocok1.cocok.otomatis === true && cocok1.cocok.oleh === 'Sistem', cocok1.cocok);
  const belum = await himpunanLib.ambil(s2.id);
  cek('yang tidak punya padanan tidak ikut ditandai', belum.cocok.sudah === false, belum.cocok);

  const daftar = await jalan('cocok.daftar', {});
  const barisSiti = daftar.fund.find((f) => f.id === s2.id);
  cek('yang belum cocok diberi ALASAN, bukan dibiarkan kosong',
    barisSiti.alasan === pencocok.ALASAN.TIDAK_ADA && /belum ada di buku/i.test(barisSiti.alasanTeks),
    { alasan: barisSiti.alasan, teks: barisSiti.alasanTeks });
  cek('ringkasannya memisahkan cocok otomatis dan cocok manual',
    daftar.ringkas.cocokOtomatis === 2 && daftar.ringkas.cocokManual === 0, daftar.ringkas);

  /* Dijalankan dua kali tidak boleh menandai ulang apa pun. */
  const ulang = await jalan('cocok.otomatis', {});
  cek('dijalankan dua kali tidak menandai apa-apa lagi', ulang.ditandai === 0, ulang);

  console.log('\n=== D. MEMBATALKAN YANG OTOMATIS SAJA ===');
  await himpunanLib.tandaiCocok(s2.id, 'KW-MANUAL', BOS);
  const manual = await himpunanLib.ambil(s2.id);
  cek('penandaan petugas tidak bercap otomatis', manual.cocok.otomatis === false, manual.cocok);

  const batal = await jalan('cocok.batalOtomatis', {});
  cek('dua penandaan otomatis dibatalkan', batal.dibatalkan === 2, batal);
  cek('penandaan petugas TIDAK ikut terbawa',
    (await himpunanLib.ambil(s2.id)).cocok.sudah === true, (await himpunanLib.ambil(s2.id)).cocok);
  cek('yang otomatis benar-benar kembali jadi belum cocok',
    (await himpunanLib.ambil(s1.id)).cocok.sudah === false);

  console.log('\n=== E. DAFTAR FUNDRAISER ===');
  await jalan('cocok.otomatis', {});   /* kembalikan keadaan tercocokkan */
  const df = await jalan('fundraiser.daftar', {});
  const nama = df.baris.map((b) => b.nama);
  cek('hanya akun yang dicentang fundraising yang masuk',
    !nama.includes('Orang Lain'), nama);
  /* Pengawas tidak ikut: superadmin memegang seluruh centang, dan koordinator
     dicentang 'delete' supaya bisa melihat semua orang. Kalau keduanya ikut,
     daftar penggalang dana selalu diawali dua baris yang tidak pernah
     menggalang apa pun. */
  cek('superadmin tidak ikut muncul sebagai fundraiser berangka nol',
    !nama.includes('Super Administrator'), nama);
  cek('koordinator yang tidak pernah menyetor juga tidak ikut',
    !df.baris.some((b) => b.userId === 'u_bos'), df.baris.map((b) => b.userId));
  cek('akun yang belum pernah menyetor tetap terlihat',
    nama.includes('Fundraiser Baru'), nama);

  const bSlamet = df.baris.find((b) => b.userId === 'u_slamet');
  const bRina = df.baris.find((b) => b.userId === 'u_rina');
  const bBaru = df.baris.find((b) => b.userId === 'u_baru');
  cek('total per orang benar', bSlamet.total === 350000 && bRina.total === 300000,
    { slamet: bSlamet.total, rina: bRina.total });
  cek('yang belum menyetor berangka nol, bukan hilang',
    bBaru && bBaru.total === 0 && bBaru.berhasil === 0, bBaru);
  cek('diurut dari yang paling banyak mengumpulkan',
    df.baris[0].userId === 'u_slamet', df.baris.map((b) => b.userId));
  cek('jumlah yang belum cocok dihitung dalam RUPIAH, bukan cuma baris',
    bSlamet.nilaiBelumCocok === 0 && bSlamet.sudahCocok === 2,
    { nilai: bSlamet.nilaiBelumCocok, cocok: bSlamet.sudahCocok });
  cek('cocok otomatis dibedakan dari manual di tiap baris',
    bSlamet.cocokOtomatis === 1 && bSlamet.cocokManual === 1, bSlamet);
  cek('ringkasan seluruhnya ikut dikembalikan',
    df.ringkas.total === 650000 && df.ringkas.belumMenyetor === 1, df.ringkas);

  console.log('\n=== F. RINCIAN SATU FUNDRAISER ===');
  const detail = await jalan('fundraiser.detail', { userId: 'u_rina' });
  cek('transaksinya keluar', detail.baris.length === 1 && detail.baris[0].id === r1.id, detail.baris.length);
  cek('profilnya ikut', detail.fundraiser.nama === 'Rina', detail.fundraiser.nama);
  cek('angkanya sama dengan yang di daftar', detail.fundraiser.total === 300000, detail.fundraiser);
  cek('fundraiser tanpa id ditolak dengan jelas',
    /mau dilihat/i.test(await tolak('fundraiser.detail', {}) || ''),
    await tolak('fundraiser.detail', {}));

  console.log('\n=== G. PENYARING HANYA BOLEH MEMPERSEMPIT ===');
  {
    const semua = await jalan('himpunan.daftar', {});
    cek('tanpa penyaring, pengawas melihat semuanya', semua.total === 3, semua.total);

    const saring = await jalan('himpunan.daftar', { fundraiser: 'u_rina' });
    cek('penyaring mempersempit ke satu orang',
      saring.total === 1 && saring.baris[0].pemilik === 'u_rina', saring.total);
    cek('dan menyebutkan sedang disaring', saring.disaring === 'u_rina', saring.disaring);

    /* INI PENGAMANNYA. Slamet bukan pengawas; mengirim id Rina tidak boleh
       membuatnya melihat setoran Rina. */
    const curi = await jalan('himpunan.daftar', { fundraiser: 'u_rina' }, SLAMET);
    cek('fundraiser biasa yang mengirim id rekannya tetap melihat datanya sendiri',
      curi.total === 2 && curi.baris.every((b) => b.pemilik === 'u_slamet'),
      curi.baris.map((b) => b.pemilik));

    const lap = await jalan('laporan.ringkas', { fundraiser: 'u_rina' });
    cek('laporan ikut tersaring', lap.ringkas.total === 300000, lap.ringkas);
  }

  console.log('\n=== H. HALAMAN PENGAWAS DITOLAK UNTUK YANG BUKAN PENGAWAS ===');
  cek('fundraiser biasa tidak bisa membuka daftar fundraiser',
    /hanya untuk koordinator/i.test(await tolak('fundraiser.daftar', {}, SLAMET) || ''),
    await tolak('fundraiser.daftar', {}, SLAMET));
  cek('dan tidak bisa membuka rincian orang lain',
    /hanya untuk koordinator/i.test(await tolak('fundraiser.detail', { userId: 'u_rina' }, SLAMET) || ''));
  cek('izin tindakannya memang izin menulis, bukan izin melihat',
    tindakan['cocok.otomatis'].izin === 'cocok.tandai', tindakan['cocok.otomatis'].izin);

  rpc._internal.muat = muatAsli;
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    try { await require('../lib/kv-postgres.js').tutup(); } catch (_) {}
  }
  console.log('\n=== HASIL ===');
  console.log(`${ok} lulus, ${gagal} gagal.`);
  if (gagal) { console.log('\nJANGAN dideploy: pencocokan atau daftar fundraiser belum benar.\n'); process.exit(1); }
  console.log('\ntest_fundraiser.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
