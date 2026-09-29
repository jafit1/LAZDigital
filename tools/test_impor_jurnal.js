/* Uji impor jurnal: tidak ada baris yang hilang tanpa keterangan.
 *
 * TIGA KEGAGALAN YANG DIJAGA DI SINI, DAN KETIGANYA PERNAH TERJADI.
 *
 * 1. IMPOR BERHENTI DENGAN PESAN YANG SEBENARNYA BUKAN KEGAGALAN.
 *    Di layar: "Gagal memproses teks: Tabel "Penghimpunan" belum dimuat."
 *    Padahal pesan itu sinyal internal ke api/rpc.js supaya tabelnya dimuat
 *    lalu dijalankan ulang; pemuatan bertahap memang dirancang begitu. Yang
 *    terjadi, satu catch di api/_engine.js membungkusnya jadi pesan lain dan
 *    membuang medan perluLembar, sehingga pengulangannya tidak pernah terjadi.
 *    Yang gagal bukan datanya, melainkan cara galatnya dibungkus.
 *
 * 2. BARIS HILANG TANPA NOMOR. Berkas jurnal berisi 13.151 baris, yang
 *    tercatat 6.439, dan tidak ada satu pun keterangan tentang sisanya.
 *    Sebagian memang tidak boleh diimpor (penyusutan bukan uang berpindah),
 *    sebagian lagi memang salah (nominalnya kosong). Keduanya dulu sama-sama
 *    diam, dan bedanya baru ketahuan saat saldo rekening tidak cocok
 *    berbulan-bulan kemudian.
 *
 * 3. SALAH TANGGAL DI BARIS UANG MUKA TIDAK PERNAH DILAPORKAN. Pemeriksa
 *    anomali hanya menyisir penghimpunan dan penyaluran, padahal uang muka dan
 *    mutasi antar rekening sama-sama menggerakkan saldo.
 *
 * Datanya BUATAN, bukan salinan jurnal lembaga: repositori ini publik.
 * Bentuknya ditiru dari berkas sungguhan — pasangan debet/kredit, judul seksi,
 * satu baris tanpa nominal, satu baris beda tanggal.
 *
 *   node tools/test_impor_jurnal.js
 */
'use strict';
const engine = require('../api/_engine.js');
const pg = require('../lib/laz-pg.js');
const skema = require('../lib/laz-skema.js');

let ok = 0, g = 0;
const cek = (n, s, i) => {
  if (s) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, i === undefined ? '' : String(JSON.stringify(i)).slice(0, 280)); }
};

const TOKEN = 'tok-uji-impor';
function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [
    ['id', 'username', 'nama', 'password', 'role', 'permissions', 'aktif', 'layanan', 'dibuat'],
    ['u1', 'admin', 'Admin Uji', 'x', 'superadmin', '{}', 'true', '', new Date().toISOString()],
  ];
  s.Sessions = [
    ['token', 'userId', 'dibuat', 'expiredAt', 'ip', 'ua'],
    [TOKEN, 'u1', new Date().toISOString(), new Date(Date.now() + 864e5).toISOString(), '', ''],
  ];
  return { sheets: s, props: {} };
}

/* Menjalankan seperti lib/laz-pg.js jalankanRPC: hanya Users, Sessions, dan
   Settings yang dimuat di awal; tabel lain menyusul lewat galat PerluLembar.
   Inilah jalur yang dulu buntu. */
async function jalankan(fn, args) {
  const minta = new Set(pg._internal.DASAR);
  for (let putaran = 1; putaran <= 24; putaran++) {
    const db = dbBaru();
    const diminta = [];
    engine._setLambat({
      lengkap: new Set(minta),
      diminta,
      minta(n) { if (!diminta.includes(n)) diminta.push(n); throw new pg.PerluLembar(n); },
    });
    try {
      const keluar = await engine.runRPC(db, fn, args, {});
      if (diminta.length) { for (const n of diminta) minta.add(n); continue; }
      return { hasil: keluar.result, putaran };
    } catch (e) {
      const perlu = pg.lembarDari(e);
      if (perlu) { for (const n of diminta) minta.add(n); minta.add(perlu); continue; }
      throw e;
    } finally { engine._setLambat(null); }
  }
  throw new Error('Tidak selesai setelah 24 putaran.');
}

/* Jurnal buatan. Bentuknya sama dengan berkas sungguhan: kolom
   tanggal, akun, debet, kredit, uraian; dipisah tab. */
const B = [
  ['', 'PENERIMAAN ZAKAT VIA KAS', '', '', ''],
  ['2026-01-07', 'Kas Zakat', '808200', '', 'Zakat Mal KLL Bantul Kota'],
  ['2026-01-07', 'Penerimaan Zakat Mal', '', '808200', 'Zakat Mal KLL Bantul Kota'],
  ['2026-01-10', 'Kas Zakat', '156000', '', 'Zakat Mal KLL Sedayu'],
  ['2026-01-10', 'Penerimaan Zakat Mal', '', '156000', 'Zakat Mal KLL Sedayu'],

  ['', 'PENERIMAAN AMIL VIA KAS', '', '', ''],
  /* Dua baris tanpa nominal sama sekali: ini yang harus dilaporkan, bukan
     dibuang diam-diam. Bentuknya diambil dari berkas sungguhan. */
  ['2026-01-02', 'Kas Amil', '', '', ''],
  ['2026-01-02', 'Penerimaan Amil Lain-lain', '', '', ''],

  ['', 'PENERIMAAN INFAK TERIKAT VIA KAS', '', '', ''],
  ['2026-03-13', 'Kas Infak', '5000000', '', 'Infak Terikat Lazismu UMY'],
  /* Pasangan kreditnya kosong: uangnya masuk, tetapi jurnalnya tidak seimbang. */
  ['2026-03-13', 'Penerimaan Infak Terikat - Dana Titipan', '', '', 'Infak Terikat Lazismu UMY'],

  ['', 'UMP AMIL', '', '', ''],
  /* Beda tanggal, dan sengaja di baris UANG MUKA: dulu tidak pernah
     dilaporkan karena pemeriksanya cuma menyisir penghimpunan & penyaluran. */
  ['2026-02-02', 'Uang Muka Program Amil', '2200000', '', 'UMP Amil KLL Imogiri'],
  ['2026-01-02', 'Kas Amil', '', '2200000', 'UMP Amil KLL Imogiri'],

  ['', 'PENYUSUTAN', '', '', ''],
  /* Memang tidak diimpor: tidak ada uang berpindah. Harus dilaporkan sebagai
     "sengaja", supaya tidak tercampur dengan yang perlu diperiksa orang. */
  ['2026-01-31', 'Beban Penyusutan Inventaris', '673972', '', ''],
  ['2026-01-31', 'Akumulasi Penyusutan Inventaris', '', '673972', ''],

  ['', 'SETOR TUNAI', '', '', ''],
  ['2026-01-15', 'Bank Syariah Zakat - 1234567890', '900000', '', 'Setor tunai zakat'],
  ['2026-01-15', 'Kas Zakat', '', '900000', 'Setor tunai zakat'],
];
const TSV = B.map((r) => r.join('\t')).join('\n');

(async () => {
  console.log('=== A. IMPOR JALAN LEWAT PEMUATAN BERTAHAP ===');
  let r;
  try {
    const x = await jalankan('apiParseImportText', [TOKEN, TSV, 'himpun']);
    r = x.hasil;
    cek('impor selesai tanpa galat', !!r && r.success === true);
    cek('butuh beberapa putaran pemuatan tabel, lalu berhasil', x.putaran > 1, x.putaran);
  } catch (e) {
    cek('impor selesai tanpa galat', false, e.message);
    console.log('\nJANGAN dideploy: impor jurnal buntu.\n');
    process.exit(1);
  }
  cek('dikenali sebagai jurnal', r.isJurnal === true);

  /* Inilah pesan yang dulu sampai ke layar. Diuji sebagai teks, karena begitu
     pula orang melihatnya. */
  console.log('\n=== B. SINYAL PEMUATAN TABEL TIDAK BOLEH JADI PESAN GAGAL ===');
  const asli = new pg.PerluLembar('Penghimpunan');
  cek('galat aslinya dikenali', pg.lembarDari(asli) === 'Penghimpunan');
  cek('yang sudah dibungkus pun tetap dikenali',
    pg.lembarDari(new Error('Gagal memproses teks: ' + asli.message)) === 'Penghimpunan');
  cek('dibungkus dua lapis juga',
    pg.lembarDari(new Error('x: Gagal memproses teks: ' + asli.message)) === 'Penghimpunan');
  cek('lewat rantai cause juga',
    pg.lembarDari(Object.assign(new Error('lain'), { cause: asli })) === 'Penghimpunan');
  cek('galat biasa TIDAK disalahartikan sebagai sinyal pemuatan',
    pg.lembarDari(new Error('Nominal harus lebih dari nol')) === '');

  console.log('\n=== C. TIDAK ADA BARIS YANG HILANG TANPA KETERANGAN ===');
  const d = r.dilewati || [];
  cek('jumlah baris sumber dilaporkan', r.jumlahBarisSumber === B.length, r.jumlahBarisSumber);
  const sebab = {};
  d.forEach((x) => { sebab[x.sebab] = (sebab[x.sebab] || 0) + 1; });
  cek('baris tanpa nominal dilaporkan, bukan dibuang diam-diam',
    d.some((x) => /Nominalnya kosong/i.test(x.sebab) && x.akun === 'Kas Amil'), Object.keys(sebab));
  cek('pasangan kredit yang kosong ikut dilaporkan',
    d.some((x) => /Nominalnya kosong/i.test(x.sebab) && /Dana Titipan/.test(x.akun)), d.map((x) => x.akun));
  cek('penyusutan dilaporkan sebagai memang dilewati, bukan sebagai kesalahan',
    d.filter((x) => x.sengaja).length === 2
    && d.filter((x) => x.sengaja).every((x) => /PENYUSUTAN/.test(x.sebab)),
    d.filter((x) => x.sengaja));
  cek('yang perlu diperiksa terpisah dari yang disengaja',
    d.filter((x) => !x.sengaja).length === 3, d.filter((x) => !x.sengaja).map((x) => x.akun));
  cek('tiap baris yang dilewati menyebut nomor barisnya',
    d.every((x) => Number(x.baris) > 0), d.map((x) => x.baris));
  /* Yang TIDAK boleh ikut dilaporkan: baris yang memang terpakai. Kalau
     penandanya salah, daftar ini membengkak dan tidak ada yang percaya lagi. */
  cek('baris yang terpakai tidak ikut masuk daftar dilewati',
    !d.some((x) => /Zakat Mal/.test(x.keterangan)), d.map((x) => x.keterangan));

  console.log('\n=== D. SALAH TANGGAL DILAPORKAN, TERMASUK DI UANG MUKA ===');
  const a = r.anomaliTanggal || [];
  cek('satu anomali tanggal ditemukan', a.length === 1, a);
  cek('anomalinya memang baris uang muka', a[0] && a[0].jenis === 'Uang Muka', a[0]);
  cek('kedua tanggalnya disebutkan',
    a[0] && a[0].tglDebet === '2026-02-02' && a[0].tglKredit === '2026-01-02', a[0]);
  /* ALAMAT BARISNYA IKUT DIKIRIM. Tanpa ini tanggalnya tidak bisa dibetulkan
     di layar Periksa Data, dan orang harus membuka Excel lalu mengunggah
     ulang seluruh berkas. */
  cek('alamat barisnya ikut, supaya bisa dibetulkan di layar',
    a[0] && a[0].kumpulan === 'ump' && Number.isInteger(a[0].idx), a[0]);
  const sasaran = (r.umpValid || [])[a[0] ? a[0].idx : -1];
  cek('alamatnya benar-benar menunjuk barisnya',
    sasaran && sasaran.tanggal === '2026-02-02', sasaran);

  console.log('\n=== E. YANG TERBAWA TETAP BENAR ===');
  const jml = (x) => (x || []).reduce((s, y) => s + (Number(y.jumlah) || Number(y.nominal) || 0), 0);
  cek('dua penerimaan zakat terbaca', (r.himpunValid || []).length === 3,
    (r.himpunValid || []).map((x) => x.namaDonatur));
  cek('nilainya sesuai kolom debet', jml(r.himpunValid) === 808200 + 156000 + 5000000, jml(r.himpunValid));
  cek('setor tunai dicatat sebagai perpindahan, bukan penghimpunan',
    (r.transferValid || []).length === 1 && r.transferValid[0].jenis === 'setor', r.transferValid);
  cek('uang muka dicatat tersendiri', (r.umpValid || []).length === 1, r.umpValid);
  cek('penyusutan tidak ikut jadi penyaluran',
    !(r.salurValid || []).some((x) => /Penyusutan/i.test(x.namaPenerima || '')), r.salurValid);

  console.log('\n=== F. LAYAR PERIKSA DATA: DAFTARNYA BISA DITINDAKLANJUTI ===');
  /* Fungsi penggambarnya diambil APA ADANYA dari src/public/app.js lalu
     dijalankan di sini dengan pembantu seadanya. Menyalin ulang isinya ke
     berkas uji akan membuat yang diuji bukan yang dikirim. */
  {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
    const ambil = (nama) => {
      const i = src.indexOf('function ' + nama + '(');
      if (i < 0) throw new Error('fungsi ' + nama + ' tidak ada di app.js');
      let dalam = 0, mulai = src.indexOf('{', i);
      for (let j = mulai; j < src.length; j++) {
        if (src[j] === '{') dalam++;
        else if (src[j] === '}') { dalam--; if (!dalam) return src.slice(i, j + 1); }
      }
      throw new Error('kurung fungsi ' + nama + ' tidak tertutup');
    };

    const dipanggil = [];
    const lingkup = {
      esc: (x) => String(x === undefined || x === null ? '' : x)
        .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      rp: (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID'),
      rpCetak: (n) => Number(n || 0).toLocaleString('id-ID'),
      tglIndo: (t) => String(t || ''),
      el: () => null,
      toast: (m) => dipanggil.push(m),
      document: { querySelectorAll: () => [] },
      window: {},
    };
    const buat = new Function(...Object.keys(lingkup),
      ambil('imporBlokTanggal') + ';' + ambil('imporBlokDilewati') + ';' + ambil('imporBetulkanTanggal')
      + ';return { imporBlokTanggal, imporBlokDilewati, imporBetulkanTanggal, window };');
    const ui = buat(...Object.values(lingkup));

    const htmlTgl = ui.imporBlokTanggal(r);
    cek('blok tanggal memuat kedua tanggalnya', /2026-02-02/.test(htmlTgl) && /2026-01-02/.test(htmlTgl), htmlTgl.slice(0, 120));
    cek('ada isian tanggal yang bisa diubah langsung', /class="imp-tgl-isi"/.test(htmlTgl));
    cek('ada tombol pintas pakai tanggal debet dan kredit',
      (htmlTgl.match(/imp-tgl-cepat/g) || []).length === 2, (htmlTgl.match(/imp-tgl-cepat/g) || []).length);
    cek('alamat barisnya ikut tertulis di tombolnya', /data-k="ump:0"/.test(htmlTgl), htmlTgl.slice(0, 200));

    const htmlLewat = ui.imporBlokDilewati(r);
    cek('blok dilewati menyebut berapa dari berapa',
      new RegExp(String((r.dilewati || []).length) + ' dari ' + String(r.jumlahBarisSumber) + ' baris').test(htmlLewat),
      htmlLewat.slice(0, 160));
    cek('yang perlu diperiksa ditonjolkan', /perlu diperiksa/.test(htmlLewat));
    cek('yang memang dilewati diringkas, tidak dideretkan satu-satu',
      /PENYUSUTAN memang tidak diimpor/.test(htmlLewat), htmlLewat.slice(-260));

    /* PEMBETULANNYA HARUS MENYENTUH OBJEK BARISNYA, bukan salinan di daftar
       anomali. Kalau yang diubah salinannya, layar memperlihatkan tanggal
       yang benar sementara yang tersimpan tetap yang salah. */
    ui.window.IMPORT_TEMP_RES = r;
    ui.window.IMPORT_TEMP_HIMPUN_ROWS = r.himpunValid;
    ui.window.IMPORT_TEMP_SALUR_ROWS = r.salurValid;
    ui.window.IMPORT_TEMP_UMP_ROWS = r.umpValid;
    ui.window.IMPORT_TEMP_TRANSFER_ROWS = r.transferValid;
    ui.imporBetulkanTanggal('ump:0', '2026-01-02');
    cek('tanggal barisnya benar-benar berubah', r.umpValid[0].tanggal === '2026-01-02', r.umpValid[0].tanggal);
    cek('penanda anomalinya ikut dibersihkan', !r.umpValid[0].tglBeda, r.umpValid[0].tglBeda);
    cek('anomalinya ditandai beres', r.anomaliTanggal[0].beres === true, r.anomaliTanggal[0]);
    cek('setelah dibetulkan, daftarnya tidak lagi menuntut perhatian',
      !/kemungkinan salah tanggal/.test(ui.imporBlokTanggal(r)), ui.imporBlokTanggal(r).slice(0, 160));
    cek('tetapi tetap memberi tahu ada yang sudah dibetulkan',
      /sudah dibetulkan/.test(ui.imporBlokTanggal(r)));
    ui.imporBetulkanTanggal('ump:0', 'bukan tanggal');
    cek('tanggal yang tidak lengkap ditolak, bukan disimpan apa adanya',
      r.umpValid[0].tanggal === '2026-01-02' && dipanggil.some((x) => /belum lengkap/i.test(x)), dipanggil);
  }

  console.log('\n=== HASIL ===');
  console.log(`${ok} lulus, ${g} gagal.`);
  if (g) { console.log('\nJANGAN dideploy: impor jurnal belum benar.\n'); process.exit(1); }
  console.log('\ntest_impor_jurnal.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
