/* Uji deteksi nama kantor layanan yang BERTUMPUK.
 *
 * KENAPA BENTUK INI PERLU DIJAGA SENDIRI, PADAHAL SUDAH ADA PEMERIKSA SALAH
 * KETIK.
 *
 * Pemeriksa yang lama mencari salah ketik: dua nama yang panjangnya mirip dan
 * berbeda satu dua huruf. Ia bekerja dengan jarak edit, dan jarak edit itu
 * menyerah begitu selisih panjang dua nama lebih dari tiga huruf — nilainya
 * dikembalikan 99, yang artinya "jauh". Maka tiga nama ini, yang sebenarnya
 * satu kantor yang sama:
 *
 *     ULL Masjid  ·  ULL Masjid Baiturrahman  ·  ULL Masjid Baiturrahman Aceh
 *
 * tidak pernah dilaporkan sebagai kembar. Diukur dengan kode aslinya: jarak
 * ketiga pasangannya 99, 99, dan 99.
 *
 * Akibatnya justru lebih parah daripada salah ketik biasa. Pencocokan nama
 * memilih padanan TERPANJANG yang cocok, jadi satu kantor yang sama bisa
 * terbelah: setorannya masuk ke satu nama, uang mukanya ke nama kedua, dan
 * LPJ-nya ke nama ketiga. Yang terlihat di menu Saldo KLL adalah satu kantor
 * bersaldo positif besar tanpa LPJ, dan satu kantor bersaldo minus besar
 * tanpa uang muka. Dua-duanya salah, tidak ada galat, dan angkanya terpakai
 * untuk menghitung hak kantor layanan.
 *
 * Bentuk kedua yang ikut lolos: nama yang sama persis kecuali awalannya —
 * "Masjid Baiturrahman Aceh" di samping "ULL Masjid Baiturrahman Aceh".
 * Pemeriksa lama sengaja melewati pasangan beda jenis supaya KLL tidak pernah
 * diusulkan bergabung dengan ULL, dan aturan itu ikut menutupi kasus ini.
 *
 * Yang TIDAK boleh terjadi juga diuji: "KLL Sedayu" dan "KLL Sedayu 2" memang
 * dua kantor berbeda, jadi ia boleh dilaporkan untuk diperiksa orang tetapi
 * tidak pernah digabung sendiri oleh mesin.
 *
 *   node tools/test_kantor_kembar.js
 */
'use strict';
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 220)); }
};

const TOKEN = 'tok-uji';
const HARI = new Date().toISOString().slice(0, 10);
const TAHUN = HARI.slice(0, 4);
const TGL = TAHUN + '-03-05';

/* Nama-nama di bawah ini diambil apa adanya dari data sungguhan yang
   dilaporkan bermasalah, termasuk dua ejaan Qawiyah/Qowwiyah. */
const LAYANAN = [
  ['l1', 'ULL', '', 'Masjid', '', '', '', 'true', HARI],
  ['l2', 'ULL', '', 'Masjid Baiturrahman', '', '', '', 'true', HARI],
  ['l3', 'ULL', '', 'Masjid Baiturrahman Aceh', '', '', '', 'true', HARI],
  ['l4', 'ULL', '', 'Masjid Sayyidah Qowwiyah KII', '', '', '', 'true', HARI],
  /* Ejaan kedua ikut TERDAFTAR, persis seperti di data sungguhan. Selama ia
     terdaftar, pencocokan tidak pernah membetulkannya sendiri: tiap ejaan
     cocok dengan dirinya, dan dua kantor bayangan hidup berdampingan. */
  ['l4b', 'ULL', '', 'Masjid Sayyidah Qawiyah KII', '', '', '', 'true', HARI],
  ['l5', 'KLL', '', 'Sedayu', '', '', '', 'true', HARI],
  ['l6', 'KLL', '', 'Sedayu 2', '', '', '', 'true', HARI],
  /* Satu kantor yang sama terdaftar dua kali dengan jenis berbeda — kekeliruan
     saat memilih KLL/ULL di formulir, dan sesudahnya tidak kelihatan lagi. */
  ['l6b', 'ULL', '', 'Sedayu 2', '', '', '', 'true', HARI],
  ['l7', 'KLL', '', 'Bantul Kota', '', '', '', 'true', HARI],
];

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  const kol = (t) => skema.TABEL[t].kolom.map((k) => k[0]);
  const baris = (t, obj) => kol(t).map((k) => (obj[k] === undefined ? '' : obj[k]));

  s.Users = [['id', 'username', 'nama', 'password', 'role', 'permissions', 'aktif', 'layanan', 'dibuat'],
    ['u1', 'admin', 'Admin Uji', 'x', 'superadmin', '{}', 'true', '', HARI]];
  s.Sessions = [['token', 'userId', 'dibuat', 'expiredAt', 'ip', 'ua'],
    [TOKEN, 'u1', HARI, new Date(Date.now() + 864e5).toISOString(), '', '']];
  s.Layanan = [kol('Layanan')].concat(LAYANAN);

  /* Setoran ditulis dengan nama terpanjang, seperti di kwitansi sungguhan. */
  s.Penghimpunan = [kol('Penghimpunan'),
    baris('Penghimpunan', { id: 'h1', tanggal: TGL, jenisDana: 'Infak', subJenis: 'Infak Umum',
      namaDonatur: 'ULL Masjid Baiturrahman Aceh', jumlah: 1933000, metode: 'Cash/Tunai',
      fundraising: 'ULL Masjid Baiturrahman Aceh' }),
    baris('Penghimpunan', { id: 'h2', tanggal: TGL, jenisDana: 'Infak', subJenis: 'Infak Terikat',
      namaDonatur: 'Masjid Baiturrahman Aceh', jumlah: 500000, metode: 'Cash/Tunai',
      fundraising: 'ULL Masjid Baiturrahman Aceh' }),
  ];
  /* Uang mukanya ditulis dengan nama yang lebih pendek. */
  s.UangMuka = [kol('UangMuka'),
    baris('UangMuka', { id: 'm1', tanggal: TGL, jenis: 'keluar', dana: 'Infak',
      layanan: 'ULL Masjid', nominal: 5000000, keterangan: 'ULL Masjid Aceh Uang Muka Program Infak' }),
    baris('UangMuka', { id: 'm2', tanggal: TGL, jenis: 'keluar', dana: 'Infak',
      layanan: 'ULL Masjid', nominal: 10000000, keterangan: 'ULL Masjid Aceh Uang Muka Program Infak' }),
  ];
  /* LPJ-nya ditulis dengan ejaan Qawiyah, dan satu lagi atas nama ULL yang
     harus dilebur ke KLL induknya. */
  s.Pentasyarufan = [kol('Pentasyarufan'),
    baris('Pentasyarufan', { id: 'p1', tanggal: TGL, section: 'UMP LPJ',
      namaPenerima: 'ULL Masjid Baiturrahman Aceh', jumlah: 56703600, sumberDana: 'Infak' }),
    baris('Pentasyarufan', { id: 'p2', tanggal: TGL, section: 'UMP LPJ',
      namaPenerima: 'ULL Masjid Sayyidah Qawiyah KII', jumlah: 12115000, sumberDana: 'Infak' }),
    baris('Pentasyarufan', { id: 'p3', tanggal: TGL, section: 'UMP LPJ',
      namaPenerima: 'ULL Masjid Sayyidah Qowwiyah KII', jumlah: 47371700, sumberDana: 'Infak' }),
  ];
  return { sheets: s, props: {} };
}

const jalan = async (fn, args) => (await engine.runRPC(dbBaru(), fn, args, {})).result;
const adaPasangan = (daftar, a, b) => (daftar || []).some((x) =>
  (x.sedikit === a && x.banyak === b) || (x.sedikit === b && x.banyak === a));

(async () => {
  const d = await jalan('apiPeriksaLayanan', [TOKEN]);

  console.log('\n=== A. DUPLIKAT BERBENTUK AWALAN TERDETEKSI ===');
  cek('daftar "kembar" ikut dikembalikan', Array.isArray(d.kembar), Object.keys(d));
  cek('ULL Masjid vs ULL Masjid Baiturrahman terdeteksi',
    adaPasangan(d.kembar, 'ULL Masjid', 'ULL Masjid Baiturrahman'),
    (d.kembar || []).map((x) => x.sedikit + ' <> ' + x.banyak));
  cek('ULL Masjid vs ULL Masjid Baiturrahman Aceh terdeteksi',
    adaPasangan(d.kembar, 'ULL Masjid', 'ULL Masjid Baiturrahman Aceh'));
  cek('ULL Masjid Baiturrahman vs ...Aceh terdeteksi',
    adaPasangan(d.kembar, 'ULL Masjid Baiturrahman', 'ULL Masjid Baiturrahman Aceh'));
  const pAwalan = (d.kembar || []).filter((x) => x.sebab === 'awalan');
  cek('sebabnya disebut "awalan"', pAwalan.length >= 3, (d.kembar || []).map((x) => x.sebab));

  console.log('\n=== B. SATU KANTOR TERDAFTAR DUA KALI DENGAN JENIS BERBEDA ===');
  /* "KLL Sedayu 2" dan "ULL Sedayu 2" adalah satu kantor yang terdaftar dua
     kali karena jenisnya salah pilih di formulir. Pemeriksa salah ketik
     sengaja melewati pasangan beda jenis — supaya KLL tidak pernah diusulkan
     bergabung dengan ULL — dan aturan itu ikut menutupi kekeliruan ini. */
  cek('KLL Sedayu 2 vs ULL Sedayu 2 terdeteksi',
    adaPasangan(d.kembar, 'KLL Sedayu 2', 'ULL Sedayu 2'),
    (d.kembar || []).map((x) => x.sebab + ': ' + x.sedikit + ' <> ' + x.banyak));
  const pBeda = (d.kembar || []).filter((x) => x.sebab === 'beda-awalan');
  cek('sebabnya dibedakan dari duplikat awalan', pBeda.length >= 1, pBeda.length);

  /* Ejaan mentah yang tidak berawalan sudah dibereskan lebih dulu oleh
     pencocokan nama, jadi ia TIDAK muncul sebagai kantor kedua. Yang harus
     terjadi: ejaannya tetap dilaporkan supaya bisa dibersihkan di datanya. */
  const mentah = (d.dirapikan || []).map((x) => x.mentah || x.dari || JSON.stringify(x));
  cek('ejaan "Masjid Baiturrahman Aceh" tanpa awalan dilaporkan sebagai ejaan yang masih salah',
    mentah.some((x) => /Masjid Baiturrahman Aceh/.test(String(x))), mentah);

  console.log('\n=== C. KEMBAR DI MASTER LAYANAN DITANDAI TERSENDIRI ===');
  /* Kalau dua-duanya terdaftar, menggabungkan barisnya saja tidak cukup:
     kantor bayangannya masih ada di menu Layanan dan akan menarik data lagi
     pada pencatatan berikutnya. Itu harus dikatakan, bukan dibiarkan ditebak. */
  const diMaster = (d.kembar || []).filter((x) => x.diMaster);
  cek('pasangan yang dua-duanya terdaftar ditandai', diMaster.length >= 3, diMaster.length);
  cek('yang ditandai itu ditaruh paling atas',
    (d.kembar || []).length === 0 || d.kembar[0].diMaster === true,
    (d.kembar || []).slice(0, 3).map((x) => [x.sedikit, x.diMaster]));

  console.log('\n=== D. SALAH KETIK YANG DUA-DUANYA TERDAFTAR ===');
  cek('Qawiyah vs Qowwiyah muncul di daftar mirip',
    adaPasangan(d.mirip, 'ULL Masjid Sayyidah Qawiyah KII', 'ULL Masjid Sayyidah Qowwiyah KII'),
    (d.mirip || []).map((x) => x.sedikit + ' <> ' + x.banyak));

  console.log('\n=== E. KANTOR BERSAUDARA DILAPORKAN, BUKAN DIGABUNG SENDIRI ===');
  /* "KLL Sedayu" dan "KLL Sedayu 2" memang dua kantor. Ia BOLEH muncul supaya
     diperiksa orang, tetapi tidak boleh ada mekanisme yang menyatukannya
     tanpa klik. Yang diperiksa: penggabungan hanya terjadi lewat pemanggilan
     tegas dengan terapkan=true. */
  cek('Sedayu vs Sedayu 2 ikut dilaporkan untuk diperiksa',
    adaPasangan(d.kembar, 'KLL Sedayu', 'KLL Sedayu 2'));
  const sebelum = await jalan('apiSaldoLayanan', [TOKEN, HARI]);
  const namaSebelum = sebelum.daftar.map((x) => x.layanan).sort();
  const pratinjau = await jalan('apiGabungLayanan', [TOKEN, 'KLL Sedayu', 'KLL Sedayu 2', false]);
  cek('pratinjau tidak menulis apa pun', pratinjau.diterapkan === false, pratinjau);
  const sesudah = await jalan('apiSaldoLayanan', [TOKEN, HARI]);
  cek('rekap tidak berubah sesudah pratinjau',
    namaSebelum.join('|') === sesudah.daftar.map((x) => x.layanan).sort().join('|'));

  console.log('\n=== F. ULL BOLEH DILEBUR KE KLL BILA DIMINTA TEGAS ===');
  /* Usulan otomatis sengaja tidak pernah menyeberangkan ULL ke KLL. Tetapi
     ada kasus administrasi yang memang begitu, dan formulir gabung manual
     harus bisa melakukannya — kalau tidak, satu-satunya jalan keluar adalah
     menyunting basis data langsung. */
  /* Yang diperiksa daftar `mirip` — pengusul salah ketik. Daftar `kembar`
     memang boleh menyebut pasangan beda jenis, sebab di situ justru itu
     temuannya ("satu kantor terdaftar dua kali dengan jenis berbeda"), dan
     ia melaporkan, tidak mengusulkan ejaan pengganti. */
  const usul = (d.mirip || []).filter((x) =>
    String(x.sedikit).slice(0, 3).toUpperCase() !== String(x.banyak).slice(0, 3).toUpperCase());
  cek('pengusul salah ketik tidak pernah menyeberangkan ULL ke KLL', usul.length === 0, usul);
  const lintas = await jalan('apiGabungLayanan',
    [TOKEN, 'ULL Masjid Sayyidah Qowwiyah KII', 'KLL Bantul Kota', false]);
  cek('pratinjau lintas jenis tetap dilayani, bukan ditolak', lintas.jumlah > 0, lintas);
  cek('pratinjaunya menyebut berapa baris dan berapa nilainya',
    lintas.rincian.lpj === 1 && lintas.nominal.lpj === 47371700, lintas);
  cek('yang ikut terbawa hanya baris kantor itu, bukan ejaan tetangganya',
    lintas.jumlah === 1, lintas);

  console.log('\n=== G. DAFTAR NAMA UNTUK FORMULIR GABUNG MANUAL ===');
  cek('semuaNama dikembalikan', Array.isArray(d.semuaNama), typeof d.semuaNama);
  const nm = (d.semuaNama || []).map((x) => x.nama);
  cek('memuat kantor yang belum punya satu baris pun',
    nm.indexOf('KLL Bantul Kota') >= 0, nm);
  cek('memuat kedua ejaan yang berdampingan',
    nm.indexOf('ULL Masjid Sayyidah Qawiyah KII') >= 0 && nm.indexOf('ULL Masjid Sayyidah Qowwiyah KII') >= 0, nm);
  cek('tiap baris membawa jumlah barisnya untuk bahan pertimbangan',
    (d.semuaNama || []).every((x) => typeof x.baris === 'number'), (d.semuaNama || [])[0]);
  cek('urut menurut abjad supaya gampang dicari',
    nm.join('|') === nm.slice().sort((a, b) => a.localeCompare(b, 'id')).join('|'), nm);

  console.log('\n=== H. TAMPILAN MENGGAMBAR BAGIAN BARUNYA ===');
  const fs = require('fs');
  const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
  cek('ada bagian "Nama yang bertumpuk"', /Nama yang bertumpuk/.test(app));
  cek('tombol Gabungkan dipasang di bagian itu',
    /kembar\.forEach[\s\S]{0,1200}gabungKantor\(/.test(app));
  cek('ada formulir gabung manual', /function gabungManualHTML/.test(app) && /function gabungKantorManual/.test(app));
  cek('formulirnya memakai pola form rumah .fld',
    /function gabungManualHTML[\s\S]{0,1500}class="fld"/.test(app));
  cek('pasangan yang kembarnya ada di menu Layanan diberi tahu cara membereskannya',
    /hapus kantor yang tidak dipakai lewat menu/i.test(app));

  console.log('\n=== J. DUGAAN, BUKAN VONIS ===');
  /* Dengan 49 kantor, daftar pasangan bisa panjang. Yang menentukan berguna
     atau tidaknya daftar itu adalah urutannya: yang hampir pasti keliru harus
     di atas, yang cuma kebetulan berbentuk awalan di bawah. */
  cek('tiap pasangan membawa tingkat dugaannya',
    (d.kembar || []).every((x) => ['tinggi', 'sedang', 'rendah'].indexOf(x.yakin) >= 0),
    (d.kembar || []).map((x) => x.yakin));
  const bedaAwalan = (d.kembar || []).filter((x) => x.sebab === 'beda-awalan');
  cek('nama yang intinya sama persis selalu dugaan tinggi',
    bedaAwalan.every((x) => x.yakin === 'tinggi'), bedaAwalan.map((x) => [x.sedikit, x.yakin]));
  const sedayu = (d.kembar || []).filter((x) =>
    (x.sedikit === 'KLL Sedayu' && x.banyak === 'KLL Sedayu 2') ||
    (x.sedikit === 'KLL Sedayu 2' && x.banyak === 'KLL Sedayu'));
  cek('kantor bersaudara yang sama-sama kosong tidak dinaikkan jadi dugaan sedang',
    sedayu.length === 1 && sedayu[0].yakin !== 'sedang', sedayu);
  const urut = (d.kembar || []).map((x) => ({ tinggi: 0, sedang: 1, rendah: 2 }[x.yakin]));
  cek('daftarnya urut dari dugaan terkuat',
    urut.every((v, i) => i === 0 || urut[i - 1] <= v), (d.kembar || []).map((x) => x.yakin));

  console.log('\n=== I. SETORAN YANG LUPA AWALAN TIDAK LAGI JATUH KE DAERAH ===');
  /* Ini keluhan aslinya: "setorannya jelas ada, kok kantornya minus". Satu
     kwitansi ditulis "Masjid Baiturrahman Aceh" tanpa ULL, dan seluruh
     nilainya berpindah ke Penghimpunan Daerah. Kwitansi sebelahnya yang
     ditulis lengkap masuk ke ULL-nya. Kantornya lalu tampak nol setoran
     sementara LPJ-nya tetap tercatat, dan selisihnya muncul sebagai saldo
     minus yang tidak bisa dijelaskan siapa pun. */
  const saldo = await jalan('apiSaldoLayanan', [TOKEN, HARI]);
  const cari = (n) => saldo.daftar.filter((x) => x.layanan === n)[0] || null;
  const ull = cari('ULL Masjid Baiturrahman Aceh');
  const daerah = saldo.daftar.filter((x) => x.tipe === 'Daerah')[0] || null;
  cek('ULL Masjid Baiturrahman Aceh punya barisnya', !!ull, saldo.daftar.map((x) => x.layanan));
  cek('kedua kwitansi masuk ke kantornya, bukan terbelah',
    !!ull && ull.nHimpun === 2, ull && { n: ull.nHimpun, himpun: ull.himpun });
  cek('nilainya utuh 1.933.000 + 500.000',
    !!ull && ull.himpun === 2433000, ull && ull.himpun);
  cek('tidak ada yang nyasar ke Penghimpunan Daerah',
    !daerah || daerah.himpun === 0, daerah && { nama: daerah.layanan, himpun: daerah.himpun });
  /* Pagar yang tidak boleh ikut longgar: nama kantor yang cuma NUMPANG di
     dalam nama donatur tetap tidak menarik uangnya ke kantor itu. */
  cek('nama kantor yang cuma numpang di dalam nama donatur tetap tidak menarik',
    !cari('KLL Sedayu') || cari('KLL Sedayu').nHimpun === 0, cari('KLL Sedayu'));

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: deteksi kantor kembar belum benar.\n'); process.exit(1); }
  console.log('\ntest_kantor_kembar.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
