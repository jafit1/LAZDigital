/* Uji "Samakan dengan Rekap": jurnal tetap diimpor, rekap bulanan jadi patokan.
 *
 * KENAPA INI PERLU DIJAGA. 1 Oktober 2026 rekap September pemilik dicocokkan
 * baris per baris dengan jurnal Kas dan Bank. Dari 633 baris penerimaan, 627
 * cocok persis; sisanya yang membuat Daerah web Rp 167.737.430 sementara
 * rekap Rp 147.882.126:
 *   - rekap menyebut "KL Lazismu ..." padahal keterangan jurnal tanpa KLL;
 *   - satu setoran kas KLL Bantul Kota di rekap pecah jadi lima baris di
 *     jurnal (NTT, sumur bor, air bersih, kebencanaan, Palestina);
 *   - pilar beda: kekeringan di jurnal Kemanusiaan, di rekap Lingkungan;
 *     Kelembagaan di rekap Sosial Dakwah;
 *   - nominal beda Rp 2.500, tanggal beda sehari;
 *   - baris yang hanya ada di salah satu sisi.
 * Pemilik memutuskan: rekap jadi patokan, jurnal tetap diimpor supaya setor
 * tunai, mutasi, dan biaya admin bank (yang tidak ada di rekap) tetap
 * menjaga saldo rekening.
 *
 * Yang dijaga: setelah semua usulan diterapkan, angka jurnal sama dengan
 * rekap; biaya admin bank TIDAK ikut dilewati; LPJ uang muka yang di rekap
 * dicatat Daerah tidak dipindah diam-diam (ditanyakan); nama kantor yang tidak
 * terdaftar tidak ditebak.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_samakan_rekap.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, g = 0;
const cek = (n, s, i) => {
  if (s) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, i === undefined ? '' : String(JSON.stringify(i)).slice(0, 320)); }
};
async function rpc(db, fn, args) {
  try { const o = await engine.runRPC(db, fn, args, { ip: '10.2.2.2' }); return { ok: true, hasil: o.result, db: o.db }; }
  catch (e) { return { ok: false, galat: e.message, db }; }
}
const B = (rows) => rows.map((r) => r.join('\t')).join('\n');
const pasang = (tgl, d, k, n, ket) => [[tgl, d, String(n), '', ket], [tgl, k, '', String(n), ket]];

/* Fungsi penerap di layar diambil APA ADANYA dari app.js. */
const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
function ambil(nama) {
  const i = app.indexOf('function ' + nama + '(');
  if (i < 0) return '';
  let d = 0; const j = app.indexOf('{', i);
  for (let k = j; k < app.length; k++) { if (app[k] === '{') d++; else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); } }
  return '';
}

(async () => {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Contoh1234';
  let db = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  let r = await rpc(db, 'login', ['superadmin', 'Contoh1234']); db = r.db;
  const T = r.hasil.token;
  const LAY = {};
  for (const [tipe, nama] of [['KLL', 'Bantul Kota'], ['KLL', 'Imogiri'], ['KLL', 'Bambanglipuro'], ['KLL', 'Sewon Selatan'], ['KLL', 'Pundong'], ['KLL', 'MUSABA'], ['ULL', 'Masjid Baiturrahman Aceh']]) {
    r = await rpc(db, 'apiSaveLayanan', [T, { tipe, nama, aktif: 'true' }]); db = r.db;
  }
  db.sheets.Layanan.slice(1).forEach((x) => { LAY[x[db.sheets.Layanan[0].indexOf('nama')]] = x[db.sheets.Layanan[0].indexOf('id')]; });

  /* ---- Jurnal KAS buatan ---- */
  const kas = [
    ['', 'PENERIMAAN INFAK TERIKAT VIA KAS', '', '', ''],
    ...pasang('2026-09-30', 'Kas Infak', 'Penerimaan Infak Terikat - Kemanusiaan', 600000, 'Infak Terikat KLL Bantul Kota NTT'),
    ...pasang('2026-09-30', 'Kas Infak', 'Penerimaan Infak Terikat - Kemanusiaan', 400000, 'Infak Terikat KLL Bantul Kota Sumur Bor'),
    ...pasang('2026-09-15', 'Kas Infak', 'Penerimaan Infak Terikat - Kemanusiaan', 700000, 'Infak Terikat SMK Contoh Bambanglipuro'),
    ...pasang('2026-09-12', 'Kas Infak', 'Penerimaan Infak Terikat - Kemanusiaan', 100000, 'Donatur Satu Infak Terikat Kekeringan'),
    ...pasang('2026-09-09', 'Kas Infak', 'Penerimaan Infak Terikat - Kelembagaan', 5000000, 'Infak Terikat KLL Bantul Kota Gedung'),
    ...pasang('2026-09-18', 'Kas Infak', 'Penerimaan Infak Terikat - Kemanusiaan', 1500000, 'Infak Terikat KLL Sewon Selatan'),
    ...pasang('2026-09-04', 'Kas Infak', 'Penerimaan Infak Terikat - Pendidikan', 2000000, 'Infak Terikat KLL MUSABA'),
    ['', 'PENERIMAAN INFAK UMUM VIA KAS', '', '', ''],
    ...pasang('2026-09-22', 'Kas Infak', 'Penerimaan Infak Umum', 20000, 'Infak Umum Donatur Dua'),
    ['', 'PENERIMAAN ZAKAT VIA KAS', '', '', ''],
    ...pasang('2026-09-03', 'Kas Zakat', 'Penerimaan Zakat Mal', 2000000, 'Zakat Mal KLL Bantul Kota'),
    ['', 'PENGELUARAN OPERASIONAL VIA KAS', '', '', ''],
    ...pasang('2026-09-14', 'Biaya Konsumsi', 'Kas Amil', 43000, 'Pembelian Snack Kantor'),
  ];
  /* ---- Jurnal BANK buatan ---- */
  const BPD = 'BPD Contoh - 9988776655', AMIL = 'BPD Contoh Amil - 9988776656';
  const bank = [
    ['', 'PENERIMAAN INFAK TERIKAT VIA BANK', '', '', ''],
    ...pasang('2026-09-20', BPD, 'Penerimaan Infak Terikat - Kemanusiaan', 40709013, 'PD Contoh Infak Terikat Nusa Tenggara Timur'),
    ...pasang('2026-09-22', BPD, 'Penerimaan Infak Terikat - Kemanusiaan', 1875000, 'Lazismu Kota Contoh Untuk Sumur Bor'),
    ['', 'BAGI HASIL', '', '', ''],
    ...pasang('2026-09-30', BPD, 'Penerimaan Bagi Hasil Rek Infak', 25106, 'Bagi hasil bank Infak'),
    ['', 'PENYALURAN INFAK UMUM', '', '', ''],
    ...pasang('2026-09-14', 'Penyaluran Infak - Kemanusiaan', AMIL, 23750000, 'Transfer ke LRB Program Sumur Bor'),
    ['', 'UMP LPJ INFAK', '', '', ''],
    ...pasang('2026-09-25', 'Penyaluran Infak - Kesehatan', 'UMP Infak Sedekah', 750000, 'servis mobil ambulan tanggal 24 agustus'),
    ...pasang('2026-09-25', 'Penyaluran Infak - Sosial', 'UMP Infak Sedekah', 700000, 'Kajian AMM Contoh KLL Imogiri'),
    ['', 'UMP LPJ ZAKAT', '', '', ''],
    ...pasang('2026-09-25', 'Penyaluran Zakat - Fakir Miskin', 'UMP Penyaluran Zakat', 900000, 'Pentasyarufan dana donasi dek contoh KLL Bantul Kota'),
    ['', 'PENGELUARAN OPERASIONAL VIA BANK', '', '', ''],
    ...pasang('2026-09-01', 'Gaji Amil', AMIL, 2000000, 'Gaji Amil Kll Pundong Contoh'),
    ['', 'BIAYA ADMINISTRASI BANK', '', '', ''],
    ...pasang('2026-09-14', 'Biaya Administrasi Bank', AMIL, 6500, 'Biaya Admin Transfer Sumur Bor ke LRB'),
    ['', 'UMP INFAK', '', '', ''],
    ...pasang('2026-09-10', 'Uang Muka Program Infak', BPD, 15000000, 'UMP KLL Pundong'),
  ];

  /* ---- Rekap buatan, bentuk sheetnya sama dengan rekap pemilik ---- */
  const rekap = [
    { nama: 'HIMPUN', rows: [
      ['TANGGAL', 'NAMA', 'KETERANGAN', 'PROGRAM PENERIMAAN', 'JUMLAH', 'MELALUI', 'Kasir'],
      ['2026-09-30', 'KL Lazismu Bantul Kota', 'Infak Terikat Kemanusiaan', 'Siaga Bencana', 1000000, 'BANTUL', 'Kantor'],
      ['2026-09-15', 'KL Lazismu Bambanglipuro', 'Infak Terikat Gempa NTT', 'Siaga Bencana', 700000, 'BANTUL', 'Kantor'],
      ['2026-09-12', 'Donatur Satu', 'Infak Terikat Kekeringan', 'Infak Pembatasan Lingkungan Lainnya', 100000, 'BANTUL', 'Kantor'],
      ['2026-09-09', 'KL Lazismu Bantul Kota', 'Infak Terikat Pembangunan', 'Infak Pembatasan Sosial Dakwah Lainnya', 5000000, 'BANTUL', 'Kantor'],
      ['2026-09-18', 'KL Lazismu Sewon Selatam', 'Infak Terikat Gempa NTT', 'Siaga Bencana', 1500000, 'BANTUL', 'Kantor'],
      ['2026-09-04', 'KL Lazismu SMK Muh 1 Bantul', 'Infak Terikat Pendidikan', 'Infak Pembatasan Pendidikan Lainnya', 2000000, 'BANTUL', 'Kantor'],
      ['2026-09-02', 'KL Lazismu Bantul Kota', 'Zakat Mal', 'Tanpa Pembatasan Zakat Maal', 2000000, 'BANTUL', 'Kantor'],
      ['2026-09-22', 'Donatur Tiga', 'Infak Terikat Kekeringan', 'Infak Pembatasan Lingkungan Lainnya', 200000, 'BANTUL', 'Kantor'],
      ['2026-09-20', 'PD Contoh', 'Infak Terikat Gempa NTT', 'Siaga Bencana', 40706513, 'Infaq-BPD (9988776655)', 'Kantor'],
      ['2026-09-22', 'KL Lazismu Kota Contoh', 'Infak Terikat Gempa NTT', 'Siaga Bencana', 1875000, 'Infaq-BPD (9988776655)', 'Kantor'],
      ['', '', '', '', 55081513, '', ''],
    ] },
    { nama: 'UMP', rows: [
      ['TGL', 'URAIAN', 'AKUN DEBET', 'AKUN KREDIT', 'JUMLAH'],
      ['2026-09-10', 'UMP KLL Pundong', 'Uang Muka', 'Bank Infaq-BPD (9988776655)', 15000000],
    ] },
    { nama: 'PENYALURAN DAERAH', rows: [
      ['TGL', 'NAMA PENERIMA', 'ALAMAT', 'PROGRAM PENYALURAN', 'KET Penyaluran', 'JUMLAH', 'MELALUI'],
      ['2026-09-25', 'Dek Contoh', 'Bantul', 'Miskin Pembatasan', 'Pentasyarufan dana donasi dek contoh', 900000, 'Bank Zakat-BPD (9988776654)'],
    ] },
    { nama: 'Sheet5', rows: [
      ['TGL', 'URAIAN PENGELUARAN AMIL', 'AKUN PENGELUARAN AMIL', 'MELALUI', 'JUMLAH'],
      ['2026-09-01', 'Gaji Amil Kll Pundong Contoh', 'Beban Gaji', 'Bank Amil-BPD (9988776656)', 2000000],
      ['2026-09-14', 'Transfer dana sumur bor ke LRB', 'Beban Kegiatan Amil Lainnya', 'Bank Amil-BPD (9988776656)', 23750000],
      ['2026-09-14', 'Pembelian Snack Kantor', 'Beban Konsumsi Pantry', 'BANTUL', 45000],
    ] },
    { nama: 'SALUR KLL', rows: [
      ['TGL', 'NAMA PENERIMA', 'ALAMAT', 'PROGRAM PENYALURAN', 'KET Penyaluran', 'JUMLAH', 'MELALUI'],
      ['2026-09-25', 'KL Lazismu Pundong', 'Pundong', 'Fisabilillah', 'servis mobil ambulan tanggal 24 agustus', 750000, 'Bank Infaq-BPD (9988776655)'],
      /* Label nama tersalin dari baris atas: keterangannya sendiri menyebut KLL Imogiri. */
      ['2026-09-25', 'KL Lazismu Pundong', 'Pundong', 'Fisabilillah', 'Kajian AMM Contoh KLL Imogiri', 700000, 'BANTUL'],
    ] },
  ];

  const peta = (res) => ({ himpun: res.himpunValid, salur: res.salurValid, ump: res.umpValid, transfer: res.transferValid });
  async function urai(teks, jenis) {
    const x = await rpc(db, 'apiParseImportText', [T, B(teks), 'himpun', { bulan: '2026-09', jenis }]);
    return x.hasil;
  }
  const resKas = await urai(kas, 'kas');
  const resBank = await urai(bank, 'bank');
  cek('jurnal kas dan bank terbaca', resKas && resKas.isJurnal && resBank && resBank.isJurnal);

  console.log('\n=== A. REKAP DIBACA DAN DICOCOKKAN, PER BERKAS ===');
  r = await rpc(db, 'apiSamakanRekap', [T, peta(resKas), rekap, { bulan: '2026-09', jenis: 'kas' }]);
  cek('apiSamakanRekap tersedia', r.ok, r.galat);
  const tk = (r.hasil && r.hasil.temuan) || [];
  r = await rpc(db, 'apiSamakanRekap', [T, peta(resBank), rekap, { bulan: '2026-09', jenis: 'bank' }]);
  const tb = (r.hasil && r.hasil.temuan) || [];
  const ada = (arr, jenis, f) => arr.filter((t) => t.jenis === jenis && (!f || f(t)));
  const barisJ = (res, n, k) => (k === 'salur' ? res.salurValid : res.himpunValid).findIndex((x) => Math.round(x.jumlah) === n);
  const menyentuh = (t, k, i) => (t.baris || []).some((b) => b.kumpulan === k && b.idx === i);

  const ringkas = ada(tk, 'rekapRingkas')[0];
  cek('ringkasan perbandingan kas tersedia', !!ringkas && /Rekap/.test(ringkas.pesan), ringkas);
  cek('berkas kas tidak membawa baris rekap milik bank (PD Contoh tidak dianggap hilang)',
    !tk.some((t) => /PD Contoh/.test(JSON.stringify(t.usulan || {}))), tk.map((t) => t.judul));

  console.log('\n=== B. PENERIMAAN DISAMAKAN ===');
  const iBk1 = barisJ(resKas, 600000), iBk2 = barisJ(resKas, 400000);
  cek('satu baris rekap yang pecah jadi dua di jurnal tidak dianggap hilang',
    !ada(tk, 'rekapHanyaJurnal').some((t) => menyentuh(t, 'himpun', iBk1) || menyentuh(t, 'himpun', iBk2))
    && !ada(tk, 'rekapHanyaRekap').some((t) => /1\.000\.000/.test(t.judul)), tk.map((t) => t.judul));
  const iSmk = barisJ(resKas, 700000);
  const tKan = ada(tk, 'rekapKantor').find((t) => menyentuh(t, 'himpun', iSmk));
  cek('keterangan tanpa KLL, rekap bilang KL Bambanglipuro -> diusulkan KLL Bambanglipuro',
    tKan && JSON.stringify(tKan.usulan).includes(LAY.Bambanglipuro), tKan || tk.map((t) => t.judul));
  const tPil = ada(tk, 'rekapDana').find((t) => menyentuh(t, 'himpun', barisJ(resKas, 100000)));
  cek('kekeringan: pilar Kemanusiaan -> Lingkungan sesuai program rekap', tPil && JSON.stringify(tPil.usulan).includes('Lingkungan'), tPil);
  const tKel = ada(tk, 'rekapDana').find((t) => menyentuh(t, 'himpun', barisJ(resKas, 5000000)));
  cek('Kelembagaan -> Sosial Dakwah sesuai program rekap', tKel && JSON.stringify(tKel.usulan).includes('Sosial Dakwah'), tKel);
  const tTgl = ada(tk, 'rekapTanggal').find((t) => menyentuh(t, 'himpun', barisJ(resKas, 2000000) >= 0 ? resKas.himpunValid.findIndex((x) => /Zakat/.test(x.jenisDana)) : -1));
  cek('tanggal beda sehari disamakan dengan rekap', tTgl && JSON.stringify(tTgl.usulan).includes('2026-09-02'), ada(tk, 'rekapTanggal'));
  cek('salah ketik nama di rekap (Sewon Selatam) tidak memindahkan kantor',
    !tk.some((t) => /^rekap/.test(t.jenis) && menyentuh(t, 'himpun', barisJ(resKas, 1500000)) && t.jenis !== 'rekapRingkas'), tk.filter((t) => menyentuh(t, 'himpun', barisJ(resKas, 1500000))).map((t) => t.jenis));
  cek('nama rekap yang tidak terdaftar (SMK Muh 1 Bantul) tidak mengganti kantor terdaftar di jurnal (MUSABA)',
    !ada(tk, 'rekapKantor').some((t) => menyentuh(t, 'himpun', barisJ(resKas, 2000000))));
  const tLewat = ada(tk, 'rekapHanyaJurnal').find((t) => menyentuh(t, 'himpun', barisJ(resKas, 20000)));
  cek('baris yang hanya ada di jurnal diusulkan dilewati', tLewat && tLewat.usulan && tLewat.usulan.lewati === true, tLewat);
  const tTambah = ada(tk, 'rekapHanyaRekap').find((t) => /Donatur Tiga/.test(JSON.stringify(t.usulan || {})));
  cek('baris yang hanya ada di rekap diusulkan ditambahkan', tTambah && tTambah.usulan.tambah && tTambah.usulan.tambah[0].baris.jumlah === 200000, tTambah);
  cek('baris tambahan berbentuk penghimpunan lengkap (Infak Terikat Lingkungan, tunai)',
    tTambah && tTambah.usulan.tambah[0].kumpulan === 'himpun' && tTambah.usulan.tambah[0].baris.pilar === 'Lingkungan' && /Tunai/.test(tTambah.usulan.tambah[0].baris.metode), tTambah && tTambah.usulan.tambah[0]);

  const tJml = ada(tb, 'rekapJumlah').find((t) => menyentuh(t, 'himpun', barisJ(resBank, 40709013)));
  cek('nominal beda Rp 2.500 disamakan dengan rekap', tJml && JSON.stringify(tJml.usulan).includes('40706513'), ada(tb, 'rekapJumlah'));
  const iKota = barisJ(resBank, 1875000);
  cek('rekap bilang KL Lazismu Kota Contoh (tidak terdaftar) -> jadi KLL, dan kantornya ditanyakan',
    ada(tb, 'rekapKantor').some((t) => menyentuh(t, 'himpun', iKota)) && ada(tb, 'kantorTakTerdaftar').some((t) => menyentuh(t, 'himpun', iKota)),
    tb.map((t) => t.jenis + ':' + t.judul));
  cek('bagi hasil yang tidak ada di rekap diusulkan dilewati', ada(tb, 'rekapHanyaJurnal').some((t) => menyentuh(t, 'himpun', barisJ(resBank, 25106))));

  console.log('\n=== C. PENYALURAN DISAMAKAN ===');
  const iLrb = barisJ(resBank, 23750000, 'salur');
  const tAmil = ada(tb, 'rekapDana').find((t) => menyentuh(t, 'salur', iLrb));
  cek('transfer LRB yang di rekap beban Amil -> sumber dana Amil', tAmil && JSON.stringify(tAmil.usulan).includes('"Amil"'), tAmil || tb.map((t) => t.judul));
  const tSrv = ada(tb, 'rekapKantor').find((t) => menyentuh(t, 'salur', barisJ(resBank, 750000, 'salur')));
  cek('LPJ tanpa nama kantor, rekap bilang KL Pundong -> KLL Pundong', tSrv && JSON.stringify(tSrv.usulan).includes('Pundong'), tSrv);
  const tDek = ada(tb, 'rekapRancu').find((t) => menyentuh(t, 'salur', barisJ(resBank, 900000, 'salur')));
  cek('LPJ KLL yang di rekap dicatat Daerah TIDAK dipindah diam-diam, ditanyakan', tDek && tDek.tingkat === 'perlu', tb.filter((t) => menyentuh(t, 'salur', barisJ(resBank, 900000, 'salur'))));
  const iAmm = barisJ(resBank, 700000, 'salur');
  cek('label rekap yang bertentangan dengan keterangannya sendiri tidak memindahkan LPJ KLL Imogiri ke Pundong',
    !tb.some((t) => /^rekap(Kantor|Rancu)$/.test(t.jenis) && menyentuh(t, 'salur', iAmm)), tb.filter((t) => menyentuh(t, 'salur', iAmm)));
  cek('dan dicatat supaya rekapnya dibetulkan', ada(tb, 'rekapCatatan').some((t) => menyentuh(t, 'salur', iAmm)));
  cek('biaya admin bank (tidak ada di rekap) TIDAK diusulkan dilewati',
    !ada(tb, 'rekapHanyaJurnal').some((t) => menyentuh(t, 'salur', barisJ(resBank, 6500, 'salur'))));
  cek('gaji amil KLL yang dibayar Daerah tidak dipindah ke KLL',
    !tb.some((t) => /^rekap(Kantor|Rancu)$/.test(t.jenis) && menyentuh(t, 'salur', barisJ(resBank, 2000000, 'salur'))));
  cek('snack Rp 43.000 di jurnal disamakan dengan rekap Rp 45.000',
    ada(tk, 'rekapJumlah').some((t) => menyentuh(t, 'salur', barisJ(resKas, 43000, 'salur')) && JSON.stringify(t.usulan).includes('45000')), ada(tk, 'rekapJumlah'));
  const tKaj = ada(tk, 'rekapHanyaRekap').find((t) => /Kajian AMM/.test(t.pesan));
  cek('penyaluran rekap yang tidak ada di berkas kas ditanyakan, tidak ikut "Samakan semua" (bisa ada di berkas bank)',
    tKaj && tKaj.tanya === true, tKaj);
  cek('uang muka yang sama dengan rekap tidak ditandai', !ada(tb, 'rekapUmp').length, ada(tb, 'rekapUmp'));
  cek('tidak ada em dash di teks temuan', !/—/.test(JSON.stringify(tk.concat(tb))));

  console.log('\n=== D. SETELAH SEMUA DITERAPKAN, ANGKA SAMA DENGAN REKAP ===');
  const kode = ['imporPasangKantor', 'imporUbahBaris', 'ringkasImporJurnal'].map(ambil);
  cek('fungsi penerap ada di app.js', kode.every(Boolean));
  const ui = new Function('window', kode.join(';\n') + ';return { imporUbahBaris, ringkasImporJurnal };')({});
  const terap = (res, temuan) => {
    const p = peta(res);
    /* Sama dengan tombol "Samakan semua": rancu dan yang ditanyakan tidak ikut. */
    temuan.filter((t) => /^rekap/.test(t.jenis) && t.jenis !== 'rekapRancu' && !t.tanya && t.usulan).forEach((t) => ui.imporUbahBaris(t, t.usulan, p));
    /* Rancu diputuskan ikut rekap, kantor tak terdaftar dibiarkan. */
    temuan.filter((t) => t.jenis === 'rekapRancu').forEach((t) => ui.imporUbahBaris(t, t.usulan, p));
    return p;
  };
  const pk = terap(resKas, tk), pb = terap(resBank, tb);
  const H = pk.himpun.concat(pb.himpun).filter((x) => !x._lewati);
  const totalRekap = 55081513;
  const totalH = H.reduce((a, x) => a + Number(x.jumlah), 0);
  cek('total penghimpunan = total rekap', Math.round(totalH) === totalRekap, [totalH, totalRekap]);
  const Rg = ui.ringkasImporJurnal(H, pk.salur.concat(pb.salur), [], []);
  const daerahRekap = 100000 + 200000 + 40706513;
  cek('Penghimpunan Daerah = Daerah di rekap', Math.round(Rg.totalHimpun.Daerah) === daerahRekap, [Rg.totalHimpun, daerahRekap]);
  /* Angka rekap untuk tabel perbandingan di layar: harus sama dengan angka
     yang dicapai jurnal setelah semua usulan diterapkan, kalau tidak, layar
     akan menampilkan selisih palsu padahal sudah sama dengan rekap. */
  const ak = (ada(tk, 'rekapRingkas')[0] || {}).angka, ab = (ada(tb, 'rekapRingkas')[0] || {}).angka;
  cek('angka rekap terkirim untuk tabel perbandingan (kas dan bank)', !!(ak && ab && ak.himpun && ab.himpun), [ak, ab]);
  cek('angka rekap: total penerimaan kas + bank = total rekap', ak && ab && Math.round(ak.himpun.total + ab.himpun.total) === totalRekap, ak && ab && [ak.himpun, ab.himpun]);
  cek('angka rekap: Daerah kas + bank = Daerah di rekap (sama dengan jurnal yang sudah disamakan)',
    ak && ab && Math.round(ak.himpun.Daerah + ab.himpun.Daerah) === daerahRekap, ak && ab && [ak.himpun, ab.himpun]);
  cek('angka rekap: penyaluran rekap ikut terkirim untuk berkas yang memuat penyaluran', ab && ab.salur && ab.salur.n > 0 && ab.salur.total > 0, ab);
  const salurRekap = 900000 + 2000000 + 23750000 + 45000 + 750000 + 700000;
  cek('penyaluran (tanpa admin bank) = rekap', Math.round(Rg.totalSalur.total) === salurRekap, [Rg.totalSalur.total, salurRekap]);
  cek('biaya admin bank tetap ada untuk saldo rekening', Math.round(Rg.adminBank) === 6500, Rg.adminBank);
  const lrb = pb.salur.find((x) => Math.round(x.jumlah) === 23750000);
  cek('transfer LRB tercatat dana Amil', lrb && lrb.sumberDana === 'Amil', lrb);

  console.log('\n=== E. LAPORAN CLOSING: GAJI KLL YANG DIBAYAR DAERAH TETAP DAERAH ===');
  const simpan = async (rows, ty) => { const x = await rpc(db, 'apiSaveImportedData', [T, rows.filter((y) => !y._lewati).map((y) => { const o = {}; Object.keys(y).forEach((k) => { if (k[0] !== '_') o[k] = y[k]; }); return o; }), ty]); db = x.db; return x; };
  await simpan(pb.salur, 'salur');
  r = await rpc(db, 'apiClosingBulanan', [T, '2026-09']);
  const daerahSalur = r.ok && r.hasil.daerah.penyaluran.total;
  cek('Closing: penyaluran Daerah memuat gaji amil KLL Pundong yang dibayar Daerah dan transfer LRB',
    daerahSalur === 2000000 + 23750000 + 900000, [daerahSalur, r.galat]);

  console.log('\n=== F. "KL LAZISMU KOTA ..." DIPILIH MASUK DAERAH, DIINGAT ===');
  /* Pemilik: KLL Kota Yogyakarta bukan kantor Bantul, kirimannya milik
     Daerah. Dipilih sekali lewat "Bukan kantor, masuk Daerah". */
  cek('pilihan "Bukan kantor, masuk Daerah" tersedia pada nama tak terdaftar',
    ada(tb, 'kantorTakTerdaftar').some((t) => t.pilihan && t.pilihan[0] && t.pilihan[0].id === '__DAERAH__'));
  r = await rpc(db, 'apiSimpanAliasKantor', [T, 'KLL Kota Contoh', '__DAERAH__']); db = r.db;
  cek('nama itu disimpan sebagai milik Daerah', r.ok && r.hasil.label === 'Daerah', r.galat || r.hasil);
  r = await rpc(db, 'apiDaftarAliasKantor', [T]);
  cek('daftar nama lain menandainya milik Daerah', r.ok && r.hasil.some((x) => x.tertulis === 'KLL Kota Contoh' && x.daerah), r.hasil);
  const resBank2 = await urai(bank, 'bank');
  r = await rpc(db, 'apiSamakanRekap', [T, peta(resBank2), rekap, { bulan: '2026-09', jenis: 'bank' }]);
  const tb2 = (r.hasil && r.hasil.temuan) || [];
  const iKota2 = barisJ(resBank2, 1875000);
  cek('rekap "KL Lazismu Kota Contoh" tidak lagi diusulkan jadi KLL',
    !tb2.some((t) => /^(rekapKantor|kantorTakTerdaftar)$/.test(t.jenis) && menyentuh(t, 'himpun', iKota2)), tb2.filter((t) => menyentuh(t, 'himpun', iKota2)).map((t) => t.judul));
  r = await rpc(db, 'apiParseImportText', [T, B([['', 'PENERIMAAN INFAK UMUM VIA KAS', '', '', ''], ...pasang('2026-09-05', 'Kas Infak', 'Penerimaan Infak Umum', 300000, 'Infak Umum KLL Kota Contoh'), ...pasang('2026-09-06', 'Kas Infak', 'Penerimaan Infak Umum', 40000, 'Infak Umum Donatur Lain')]), 'himpun', { bulan: '2026-09', jenis: 'kas' }]);
  const kk = ((r.hasil || {}).himpunValid || []).find((x) => Math.round(x.jumlah) === 300000) || {};
  cek('jurnal "Infak Umum KLL Kota Contoh" juga terbaca milik Daerah', kk.tipeDonatur === 'Perorangan' && !kk.layananId, kk);
  const u = new Function('window', ['imporPasangKantor', 'imporJadikanDaerah', 'imporUbahBaris'].map(ambil).join(';\n') + ';return { imporUbahBaris };')({});
  const pp = { himpun: [{ namaDonatur: 'KLL Kota Contoh', tipeDonatur: 'Kantor Layanan (KLL)', layananId: '', jumlah: 1 }] };
  u.imporUbahBaris({ baris: [{ kumpulan: 'himpun', idx: 0 }] }, { daerah: true }, pp);
  cek('di layar, pilihan Daerah membuang tanda KLL dari baris', pp.himpun[0].tipeDonatur === 'Perorangan' && pp.himpun[0].namaDonatur === 'Kota Contoh', pp.himpun[0]);

  console.log('\n=== G. MITRA DIHITUNG KELOMPOK KLL TANPA DIDAFTARKAN ===');
  /* Pemilik akhirnya memutuskan Lazismu Kota Yogyakarta tetap di kelompok KLL
     seperti rekapnya, tetapi tidak didaftarkan karena bukan KLL Bantul. */
  const jm = B([['', 'PENERIMAAN INFAK UMUM VIA KAS', '', '', ''], ...pasang('2026-09-05', 'Kas Infak', 'Penerimaan Infak Umum', 300000, 'Infak Umum KLL Mitra Contoh'), ...pasang('2026-09-06', 'Kas Infak', 'Penerimaan Infak Umum', 40000, 'Infak Umum Donatur Lain')]);
  r = await rpc(db, 'apiParseImportText', [T, jm, 'himpun', { bulan: '2026-09', jenis: 'kas' }]);
  const tMit = ((r.hasil || {}).temuan || []).find((t) => t.jenis === 'kantorTakTerdaftar');
  cek('nama mitra muncul sebagai tidak terdaftar, dengan pilihan "Nama sendiri"', tMit && tMit.pilihan[1] && tMit.pilihan[1].id === '__SENDIRI__', tMit && tMit.pilihan.slice(0, 2));
  r = await rpc(db, 'apiSimpanAliasKantor', [T, 'KLL Mitra Contoh', '__SENDIRI__']); db = r.db;
  cek('pilihan "Nama sendiri" tersimpan', r.ok, r.galat);
  r = await rpc(db, 'apiParseImportText', [T, jm, 'himpun', { bulan: '2026-09', jenis: 'kas' }]);
  const mm = ((r.hasil || {}).himpunValid || []).find((x) => Math.round(x.jumlah) === 300000) || {};
  cek('impor berikutnya tidak menanyakannya lagi', !((r.hasil || {}).temuan || []).some((t) => t.jenis === 'kantorTakTerdaftar'));
  cek('tetap dihitung kelompok KLL dengan namanya sendiri, tanpa kantor terdaftar',
    /KLL/.test(mm.tipeDonatur) && !mm.layananId && mm.namaDonatur === 'KLL Mitra Contoh', mm);
  r = await rpc(db, 'apiDaftarAliasKantor', [T]);
  cek('daftar nama lain menandainya "nama sendiri"', r.ok && r.hasil.some((x) => x.tertulis === 'KLL Mitra Contoh' && x.sendiri));

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + g + ' gagal.');
  if (g) { console.log('\nJANGAN dideploy: penyamaan dengan rekap belum benar.\n'); process.exit(1); }
  console.log('\ntest_samakan_rekap.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
