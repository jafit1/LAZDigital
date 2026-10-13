/* Uji format tempel Import Penghimpunan (tanpa kepala kolom), fokus pada
 * ketepatan dana/pilar, pemisahan setor tunai, dan keterbacaan rekening.
 *
 * Uji ini memakai nilai dan nama rekaan; tidak menyalin nama donatur nyata.
 * Baris modelnya meniru format yang dilaporkan pemilik pada 13 Oktober 2026.
 *
 * Yang dijaga:
 *   1. "Infak Umum" tetap umum, pilar kosong; bukan default Sosial Dakwah.
 *   2. Pilar eksplisit seperti Kesehatan dan NTT/Kemanusiaan dipetakan sesuai.
 *   3. Nama "Trismawati" tidak dipotong oleh kata "sma" yang hanya bagian nama.
 *   4. "Stor tunai ... nomor rekening" bukan penerimaan donatur, melainkan
 *      transfer Kas -> rekening bank, satu kali untuk saldo.
 *   5. Nomor rekening yang terdaftar mengunci nama bank dan fundGroup.
 *      Nomor yang tak dikenal ditampilkan sebagai temuan yang perlu keputusan,
 *      tidak diam-diam dimasukkan ke rekening lain.
 *   6. Analisis tidak menulis data; penyimpanan tetap aksi terpisah.
 *
 *   node tools/test_impor_headerless_aman.js
 */
'use strict';
const path = require('path');
const engine = require(path.join(__dirname, '..', 'api', '_engine.js'));
const skema = require(path.join(__dirname, '..', 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};
const B = (rows) => rows.map((r) => r.join('\t')).join('\n');
const ROWS = [
  ['1/10/2026', 'KLL Pandak Timur - Zakat', '', '', '1.050.000', ''],
  ['1/10/2026', 'KLL Pandak Timur - Infak Umum', '', '', '3.500.000', ''],
  ['1/10/2026', 'KLL Pandak Barat - Kesehatan', '', '', '1.000.000', ''],
  ['1/10/2026', 'KLL Pandak Barat - Donasi NTT', '', '', '400.000', ''],
  ['1/10/2026', 'Warung Contoh Lotek - Infak Umum', '', '', '17.000', 'Ariya'],
  ['2/10/2026', 'Trismawati - Infak Umum', '', '', '150.000', 'Ariya'],
  ['2/10/2026', 'Stor tunai BDW Zakat 1240201548', '', '', '', '13.276.500'],
  ['2/10/2026', 'Stor tunai BDW Infak 1240201273', '', '', '', '76.334.400'],
  ['2/10/2026', 'Stor tunai BDW Kemanusiaan 1240201549', '', '', '', '30.267.200'],
];

(async () => {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Headerless1234';
  let db = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  let r = await engine.runRPC(db, 'login', ['superadmin', 'Headerless1234'], { ip: '127.0.0.1' });
  db = r.db;
  const T = r.result.token;
  const akun = [
    ['Bank BDW Zakat', '1240201548', 'Zakat'],
    ['BDW Umum', '1240201273', 'Infak'],
    ['BDW Kemanusiaan', '1240201549', 'Infak'],
  ];
  for (const [namaBank, nomor, fundGroup] of akun) {
    r = await engine.runRPC(db, 'apiSaveRekening', [T, { namaBank, nomor, atasNama: 'Lazismu Contoh', fundGroup, aktif: 'true' }], { ip: '127.0.0.1' });
    db = r.db;
  }
  for (const nama of ['Pandak Timur', 'Pandak Barat']) {
    r = await engine.runRPC(db, 'apiSaveLayanan', [T, { tipe: 'KLL', nama, aktif: 'true' }], { ip: '127.0.0.1' });
    db = r.db;
  }

  const parse = async (teks) => {
    const x = await engine.runRPC(db, 'apiParseImportText', [T, teks, 'himpun', { bulan: '2026-10', jenis: 'kas' }], { ip: '127.0.0.1' });
    return x.result;
  };
  const out = await parse(B(ROWS));
  const H = out.valid || [];
  const tr = out.transferValid || [];
  const h = (pred) => H.find(pred);
  const tz = h((x) => x.jumlah === 1050000);
  const umum = h((x) => x.jumlah === 3500000);
  const kes = h((x) => x.jumlah === 1000000);
  const ntt = h((x) => x.jumlah === 400000);
  const trisma = h((x) => x.jumlah === 150000);

  console.log('\n=== A. PENERIMAAN DAN PILAR ===');
  cek('baris Zakat terklasifikasi Zakat, tanpa pilar', tz && tz.jenisDana === 'Zakat' && !tz.pilar, tz);
  cek('Infak Umum tetap umum, tidak dipaksa menjadi Sosial Dakwah', umum && umum.subJenis === 'Infak Umum' && !umum.pilar, umum);
  cek('Kesehatan terikat masuk pilar Kesehatan', kes && kes.subJenis === 'Infak Terikat' && kes.pilar === 'Kesehatan', kes);
  cek('NTT/Kemanusiaan masuk pilar Kemanusiaan', ntt && ntt.subJenis === 'Infak Terikat' && ntt.pilar === 'Kemanusiaan', ntt);
  cek('nama Trismawati tetap utuh', trisma && trisma.namaDonatur === 'Trismawati', trisma);
  cek('fundraising Ariya tetap terbaca dari kolom terakhir',
    h((x) => x.jumlah === 17000).fundraising === 'Ariya' && trisma && trisma.fundraising === 'Ariya', H);
  cek('KLL dikenali sebagai kantor layanan', tz && tz.layananId && tz.namaDonatur === 'KLL Pandak Timur', tz);

  console.log('\n=== B. SETOR TUNAI DAN REKENING ===');
  cek('tiga stor tunai dipisahkan dari daftar penghimpunan', tr.length === 3, { transfer: tr.length, himpun: H.length });
  cek('stor tunai tidak ada yang masuk sebagai nama donatur', !H.some((x) => /stor tunai/i.test(x.namaDonatur)), H);
  const z = tr.find((x) => /1240201548/.test(x.keterangan || x.keAkun || ''));
  const i = tr.find((x) => /1240201273/.test(x.keterangan || x.keAkun || ''));
  const k = tr.find((x) => /1240201549/.test(x.keterangan || x.keAkun || ''));
  cek('rekening 1240201548 dipetakan ke Bank BDW Zakat',
    z && z.jenis === 'setor' && /Bank BDW Zakat/.test(z.keAkun) && z.keRekeningId, z);
  cek('rekening 1240201273 dipetakan ke BDW Umum',
    i && i.jenis === 'setor' && /BDW Umum/.test(i.keAkun) && i.keRekeningId, i);
  cek('rekening 1240201549 dipetakan ke BDW Kemanusiaan',
    k && k.jenis === 'setor' && /BDW Kemanusiaan/.test(k.keAkun) && k.keRekeningId, k);
  cek('sumber transfer sesuai pos dana: Kas Zakat / Kas Infak',
    z && /Kas Zakat/.test(z.dariKas || z.dariAkun) && i && /Kas Infak/.test(i.dariKas || i.dariAkun)
      && k && /Kas Infak/.test(k.dariKas || k.dariAkun), { z, i, k });
  cek('nominal setoran dipertahankan tepat',
    z && z.nominal === 13276500 && i && i.nominal === 76334400 && k && k.nominal === 30267200, { z, i, k });

  console.log('\n=== C. REKENING TIDAK DIKENAL MINTA KEPUTUSAN ===');
  const belumDikenal = await parse(B([['2/10/2026', 'Stor tunai BDW Zakat 999999999999', '', '', '', '1.000.000']]));
  cek('rekening yang tak terdaftar tidak diam-diam dianggap donasi',
    (belumDikenal.valid || []).length === 0, belumDikenal.valid);
  cek('rekening tak dikenal dilaporkan sebagai temuan/perlu tindakan',
    (belumDikenal.akunTakDikenal > 0) || (belumDikenal.temuan || []).some((x) => /rekening|akun/i.test(x.judul + ' ' + x.pesan)), belumDikenal);

  console.log('\n=== D. PRATINJAU TIDAK MENULIS ===');
  const lembar = db.sheets.Penghimpunan;
  cek('analisis tidak menambah baris Penghimpunan', lembar.length <= 1, lembar.length);
  cek('hasil pratinjau memisahkan transaksi yang akan disimpan',
    Array.isArray(out.transferValid) && Array.isArray(out.valid), Object.keys(out));
  cek('rekening tak dikenal muncul sebagai temuan yang perlu keputusan',
    (belumDikenal.temuan || []).some((x) => x.jenis === 'rekeningTakDikenal' && x.tingkat === 'perlu'), belumDikenal.temuan);

  console.log('\n=== E. KONTRAK UI: HASIL HEADERLESS TERLIHAT DAN BISA DISIMPAN ===');
  /* Uji ini sengaja membaca sumber app.js. Sebelum perbaikan, cabang headerless
     hanya menggambar tabel valid dan tidak pernah menyimpan transferValid. */
  const app = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
  cek('UI menyimpan transferValid untuk headerless',
    /IMPORT_TEMP_TRANSFER_ROWS\s*=\s*res\.transferValid/.test(app), 'baris penampung transfer belum ada');
  cek('UI menampilkan pergerakan kas pada hasil analisis',
    /transferValid[\s\S]{0,1800}(Pergerakan kas|Setor tunai)/.test(app), 'blok pergerakan kas belum ada');
  cek('UI menampilkan rekening yang belum terdaftar',
    /akunAsing[\s\S]{0,1800}(rekening|terdaftar)/i.test(app), 'peringatan rekening belum ada');
  cek('UI menyimpan transfer headerless lewat aksi transfer',
    /isJurnalAtauHeaderlessTransfer/.test(app), 'cabang simpan masih hanya isJurnal');
  /* Permintaan pemilik 13 Oktober 2026: sebelum menekan Simpan, yang harus
     terlihat adalah nama fundraising, rekening tujuan, dan rincian setiap
     pergerakan kas. Tanpa itu saldo akhir tidak bisa dicocokkan. */
  cek('tabel penghimpunan menampilkan kolom FR',
    /<th>FR<\/th>/.test(app) && /cleanFR\(r\.fundraising\)/.test(app), 'kolom FR belum ada');
  cek('tabel penghimpunan menampilkan rekening tujuan',
    /esc\(r\.bank \|\| '-'\)/.test(app), 'kolom rekening belum ada');
  cek('pergerakan kas dirinci per baris, bukan cuma jumlahnya',
    /res\.transferValid\.(forEach|map)\(/.test(app), 'tabel transfer belum dirinci');
  cek('baris tanpa rekening diberi tahu agar saldo bisa dicocokkan',
    /tanpa rekening tujuan|belum punya rekening/i.test(app), 'peringatan rekening kosong belum ada');

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: pembacaan headerless belum aman.\n'); process.exit(1); }
  console.log('\ntest_impor_headerless_aman.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', e.stack || e); process.exit(1); });
