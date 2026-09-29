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

  console.log('\n=== K. KATA "ACEH" TIDAK BOLEH MEMOTONG NAMA KANTOR ===');
  /* Ini akar masalahnya, dan letaknya satu kata.
     _LAY_STOP memuat 'aceh', 'palestina', 'ntt' karena nama kampanye sering
     ditempel di belakang nama kantor: "KLL Srandakan Aceh" adalah KLL
     Srandakan yang menghimpun untuk Aceh. Aturan itu benar sampai ada kantor
     yang namanya memang memuat kata itu. "ULL Masjid Baiturrahman Aceh"
     terpotong jadi "ULL Masjid Baiturrahman", dan "ULL Masjid Aceh Uang Muka
     Program Infak" terpotong jadi "ULL Masjid" — dua kantor bayangan lahir
     dari satu kata, padahal menu Layanan bersih. */
  {
    const dbBersih = () => {
      const t = dbBaru();
      /* master hanya berisi nama yang benar — persis seperti keadaan
         sungguhan yang dilaporkan: "di menu KLL ULL tidak ada bayangan" */
      t.sheets.Layanan = [t.sheets.Layanan[0]].concat([
        ['x1', 'ULL', '', 'Masjid Baiturrahman Aceh', '', '', '', 'true', HARI],
        ['x2', 'ULL', '', 'Masjid Sayyidah Qowwiyah KII', '', '', '', 'true', HARI],
        ['x3', 'KLL', '', 'Srandakan', '', '', '', 'true', HARI],
      ]);
      const kol = (tb) => skema.TABEL[tb].kolom.map((k) => k[0]);
      const br = (tb, o) => kol(tb).map((k) => (o[k] === undefined ? '' : o[k]));
      /* baris yang SUDAH telanjur tersimpan dengan nama terpotong */
      t.sheets.UangMuka = [kol('UangMuka'),
        br('UangMuka', { id: 'u1', tanggal: TGL, jenis: 'keluar', dana: 'Infak',
          layanan: 'ULL Masjid Baiturrahman', nominal: 105754040,
          keterangan: 'ULL Masjid Baiturrahman Aceh Uang Muka Program Infak' }),
        br('UangMuka', { id: 'u2', tanggal: TGL, jenis: 'keluar', dana: 'Infak',
          layanan: 'ULL Masjid', nominal: 15000000,
          keterangan: 'ULL Masjid Aceh Uang Muka Program Infak' })];
      t.sheets.Pentasyarufan = [kol('Pentasyarufan'),
        br('Pentasyarufan', { id: 'q1', tanggal: TGL, section: 'UMP LPJ',
          namaPenerima: 'ULL Masjid Baiturrahman Aceh', jumlah: 56703600, sumberDana: 'Infak' })];
      t.sheets.Penghimpunan = [kol('Penghimpunan'),
        br('Penghimpunan', { id: 'w1', tanggal: TGL, jenisDana: 'Infak',
          namaDonatur: 'ULL Masjid Baiturrahman Aceh', jumlah: 2433000 })];
      return t;
    };
    const r = (await engine.runRPC(dbBersih(), 'apiSaldoLayanan', [TOKEN, HARI], {})).result;
    const ambil = (n) => r.daftar.filter((x) => x.layanan === n)[0] || null;
    const asli = ambil('ULL Masjid Baiturrahman Aceh');
    cek('kantor aslinya ada', !!asli, r.daftar.map((x) => x.layanan));
    cek('uang muka yang namanya terpotong kembali ke kantornya',
      !!asli && asli.umpKeluar === 105754040, asli && asli.umpKeluar);
    cek('LPJ-nya bertemu lagi dengan uang mukanya',
      !!asli && asli.lpj === 56703600, asli && asli.lpj);
    cek('setorannya ikut di kantor yang sama',
      !!asli && asli.himpun === 2433000, asli && asli.himpun);
    cek('belum LPJ-nya jadi angka yang masuk akal, bukan dua angka mustahil',
      !!asli && asli.belumLPJ === 49050440, asli && asli.belumLPJ);
    cek('tidak ada lagi baris "ULL Masjid Baiturrahman" yang berdiri sendiri',
      !ambil('ULL Masjid Baiturrahman'), r.daftar.map((x) => x.layanan));

    /* Yang TIDAK boleh ditebak: "ULL Masjid" cocok dengan dua kantor terdaftar
       sekaligus. Menebak salah satunya berarti memindahkan Rp 15 juta ke
       kantor yang keliru, dan itu jauh lebih buruk daripada membiarkannya
       terlihat menggantung sampai ada orang yang memutuskan. */
    const gantung = ambil('ULL Masjid');
    cek('nama yang cocok dengan lebih dari satu kantor TIDAK ditebak',
      !!gantung && gantung.umpKeluar === 15000000, gantung);
  }

  console.log('\n=== L. NAMA KAMPANYE TETAP BUKAN NAMA KANTOR ===');
  /* Perbaikan di atas tidak boleh membatalkan alasan 'aceh' dimasukkan ke
     daftar kata berhenti. "KLL Srandakan Aceh" harus tetap KLL Srandakan. */
  {
    const t = dbBaru();
    t.sheets.Layanan = [t.sheets.Layanan[0]].concat([
      ['y1', 'KLL', '', 'Srandakan', '', '', '', 'true', HARI],
      ['y2', 'ULL', '', 'Masjid Baiturrahman Aceh', '', '', '', 'true', HARI],
    ]);
    const kol = (tb) => skema.TABEL[tb].kolom.map((k) => k[0]);
    const br = (tb, o) => kol(tb).map((k) => (o[k] === undefined ? '' : o[k]));
    t.sheets.UangMuka = [kol('UangMuka')];
    t.sheets.Pentasyarufan = [kol('Pentasyarufan')];
    /* Lewat jalur pembaca nama, yaitu jalur yang dijaga daftar kata berhenti:
       kwitansi yang ditulis "KLL Srandakan Aceh" adalah KLL Srandakan yang
       menghimpun untuk Aceh, bukan kantor bernama "Srandakan Aceh". */
    t.sheets.Penghimpunan = [kol('Penghimpunan'),
      br('Penghimpunan', { id: 'z1', tanggal: TGL, jenisDana: 'Infak',
        namaDonatur: 'KLL Srandakan Aceh', jumlah: 1000000 }),
      br('Penghimpunan', { id: 'z2', tanggal: TGL, jenisDana: 'Infak',
        namaDonatur: 'ULL Masjid Baiturrahman Aceh Uang Muka Program Infak', jumlah: 2000000 })];
    const r2 = (await engine.runRPC(t, 'apiSaldoLayanan', [TOKEN, HARI], {})).result;
    const nama2 = r2.daftar.map((x) => x.layanan);
    cek('KLL Srandakan Aceh tetap dibaca sebagai KLL Srandakan',
      nama2.indexOf('KLL Srandakan') >= 0, nama2);
    cek('tidak lahir kantor bernama "Srandakan Aceh"',
      !nama2.some((x) => /Srandakan Aceh/i.test(x)), nama2);
    /* Sebaliknya, kantor yang namanya MEMANG memuat kata itu harus utuh. */
    cek('kantor yang namanya memang memuat "Aceh" terbaca utuh',
      nama2.indexOf('ULL Masjid Baiturrahman Aceh') >= 0, nama2);
    cek('dan tidak terpotong jadi "ULL Masjid Baiturrahman"',
      nama2.indexOf('ULL Masjid Baiturrahman') < 0, nama2);
  }

  console.log('\n=== M. RINCIAN TRANSAKSI DI BALIK SEBUAH NAMA ===');
  /* Angka tidak pernah cukup untuk memutuskan sebuah uang muka sebenarnya
     milik kantor mana. Yang menentukan adalah keterangannya: "ULL Masjid
     Aceh Uang Muka Program Infak" menjawabnya, "Rp 15.000.000" tidak. Maka
     rinciannya harus bisa dibuka, lengkap dengan keterangan dan nama yang
     benar-benar tertulis di barisnya. */
  {
    const rinci = await jalan('apiRincianLayananNama', [TOKEN, 'ULL Masjid', 300]);
    cek('rincian mengembalikan barisnya', (rinci.baris || []).length > 0, rinci.jumlah);
    cek('tiap baris menyebut dari mana asalnya',
      rinci.baris.every((x) => ['himpun', 'ump', 'lpj'].indexOf(x.sumber) >= 0),
      rinci.baris.map((x) => x.sumber));
    cek('keterangannya ikut, karena itu yang menjawab kantornya yang mana',
      rinci.baris.some((x) => /Uang Muka Program Infak/i.test(String(x.keterangan || ''))),
      rinci.baris.map((x) => x.keterangan));
    cek('nama yang benar-benar tertulis di baris ikut dibawa',
      rinci.baris.every((x) => typeof x.nama === 'string'), rinci.baris[0]);
    cek('barisnya urut menurut tanggal',
      rinci.baris.every((x, i) => i === 0 || String(rinci.baris[i - 1].tanggal) <= String(x.tanggal)),
      rinci.baris.map((x) => x.tanggal));
    cek('ejaan mentahnya diringkas beserta jumlahnya',
      (rinci.ejaanMentah || []).length > 0 && rinci.ejaanMentah.every((e) => e.n > 0),
      rinci.ejaanMentah);
    cek('status terdaftarnya dikatakan', typeof rinci.terdaftar === 'boolean', rinci.terdaftar);

    /* Yang paling menentukan: daftar yang DILIHAT harus sama persis dengan
       daftar yang akan DIGABUNG. Kalau keduanya memakai pencocokan
       sendiri-sendiri, orang memeriksa satu daftar lalu menggabungkan daftar
       yang lain, dan selisihnya baru ketahuan berbulan-bulan kemudian. */
    const pra = await jalan('apiGabungLayanan', [TOKEN, 'ULL Masjid', 'ULL Masjid Baiturrahman Aceh', false]);
    const totalRinci = rinci.jumlah.himpun + rinci.jumlah.ump + rinci.jumlah.lpj;
    cek('jumlah baris yang dilihat sama dengan yang akan digabung',
      totalRinci === pra.jumlah, { dilihat: totalRinci, digabung: pra.jumlah });
    cek('rinciannya pun sama per jenis',
      rinci.jumlah.himpun === pra.rincian.himpun && rinci.jumlah.ump === pra.rincian.ump
      && rinci.jumlah.lpj === pra.rincian.lpj, { rinci: rinci.jumlah, pra: pra.rincian });
    cek('nominalnya sama',
      rinci.nominal.ump === pra.nominal.ump && rinci.nominal.lpj === pra.nominal.lpj,
      { rinci: rinci.nominal, pra: pra.nominal });

    let tolak = '';
    try { await jalan('apiRincianLayananNama', [TOKEN, '', 300]); }
    catch (e) { tolak = e.message; }
    cek('nama kosong ditolak dengan penjelasan', /belum dipilih/i.test(tolak), tolak);
  }

  console.log('\n=== N. PERUBAHAN SEJAK PEMERIKSAAN TERAKHIR ===');
  /* Membetulkan kwitansi satu per satu itu pekerjaan berjam-jam, dan yang
     melelahkan bukan menyuntingnya melainkan tidak tahu apakah suntingan tadi
     mengenai sasaran. Daftarnya memang selalu dihitung ulang, tetapi "sudah
     hilang" tidak terlihat oleh orang yang menatap layar yang sama untuk
     kelima kalinya. */
  {
    const db = dbBaru();
    const p1 = (await engine.runRPC(db, 'apiPeriksaLayanan', [TOKEN, true], {})).result;
    cek('pemeriksaan pertama belum punya pembanding', p1.perubahan === null, p1.perubahan);

    /* Petugas membetulkan kwitansinya sendiri: satu baris LPJ yang tadinya
       atas nama ejaan Qawiyah diganti jadi ejaan yang benar. */
    const kepala = db.sheets.Pentasyarufan[0];
    const iNama = kepala.indexOf('namaPenerima');
    let diubah = 0;
    db.sheets.Pentasyarufan.slice(1).forEach((b) => {
      if (String(b[iNama]) === 'ULL Masjid Sayyidah Qawiyah KII') {
        b[iNama] = 'ULL Masjid Sayyidah Qowwiyah KII'; diubah++;
      }
    });
    cek('ada kwitansi yang disunting untuk diuji', diubah > 0, diubah);

    const p2 = (await engine.runRPC(db, 'apiPeriksaLayanan', [TOKEN, true], {})).result;
    cek('perubahannya terdeteksi', !!p2.perubahan && p2.perubahan.adaPerubahan, p2.perubahan);
    cek('nama yang sudah bersih disebut namanya',
      (p2.perubahan.beres || []).some((x) => x.nama === 'ULL Masjid Sayyidah Qawiyah KII'),
      (p2.perubahan.beres || []).map((x) => x.nama));
    cek('nama yang jumlah barisnya bertambah ikut dilaporkan',
      (p2.perubahan.bergeser || []).some((x) => x.nama === 'ULL Masjid Sayyidah Qowwiyah KII' && x.ke > x.dari),
      p2.perubahan.bergeser);
    cek('waktu pembandingnya ikut, supaya jelas dibandingkan dengan kapan',
      !!p2.perubahan.waktu, p2.perubahan.waktu);

    const p3 = (await engine.runRPC(db, 'apiPeriksaLayanan', [TOKEN, true], {})).result;
    cek('diperiksa lagi tanpa ada suntingan: dinyatakan tidak ada perubahan',
      !!p3.perubahan && p3.perubahan.adaPerubahan === false, p3.perubahan);

    /* Melihat saja tidak boleh mengubah apa pun. Kalau pemeriksaan tanpa
       simpan ikut menulis patokan, suntingan berikutnya tidak akan pernah
       terlihat sebagai perubahan. */
    const adaPatokan = (d2) => (d2.sheets.Settings || []).slice(1)
      .some((b) => String(b[0]) === 'periksaKantorPatokan');
    const dbB = dbBaru();
    /* Bukan membandingkan seluruh tabel Settings: pemanggilan RPC pertama
       memang menulis setelan bawaan lembaga, dan itu wajar. Yang diperiksa
       satu kunci saja, yaitu patokan pemeriksaan ini. */
    await engine.runRPC(dbB, 'apiPeriksaLayanan', [TOKEN], {});
    cek('memeriksa tanpa menyimpan tidak menulis patokan', !adaPatokan(dbB),
      (dbB.sheets.Settings || []).slice(1).map((b) => b[0]));
    await engine.runRPC(dbB, 'apiPeriksaLayanan', [TOKEN, true], {});
    cek('memeriksa dengan menyimpan barulah menulis patokan', adaPatokan(dbB));
  }

  console.log('\n=== O. TAMPILAN MENYEDIAKAN KEDUANYA ===');
  {
    const fs2 = require('fs');
    const app2 = fs2.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
    cek('ada tombol untuk membuka rincian', /function btnLihat/.test(app2) && /function rincianKantor/.test(app2));
    cek('rinciannya menampilkan kolom keterangan', /rincianKantor[\s\S]{0,3000}Keterangan/.test(app2));
    cek('ada blok perubahan sejak pemeriksaan terakhir', /function perubahanKantorHTML/.test(app2));
    cek('pemeriksaan dari web menyimpan patokannya',
      /apiPeriksaLayanan'\)\(TOKEN, true\)/.test(app2));
    cek('tombol Lihat dipasang di daftar yang bertumpuk',
      /kembar\.forEach[\s\S]{0,1600}btnLihat\(/.test(app2));
    cek('dan di daftar ejaan yang masih salah',
      /rapi\.forEach[\s\S]{0,900}btnLihat\(/.test(app2));
  }

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: deteksi kantor kembar belum benar.\n'); process.exit(1); }
  console.log('\ntest_kantor_kembar.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
