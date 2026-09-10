/* Kantor layanan yang bercabang karena salah ketik, transaksi kembar,
   dan pengosongan data transaksi. Semuanya menyangkut pembagian dana
   antar kantor layanan, jadi tiap angka diuji, bukan hanya "tidak error". */
const { runRPC } = require('./_engine.js');
let ok = 0, g = 0;
const cek = (n, c, i) => { if (c) { ok++; console.log('  OK   |', n); } else { g++; console.log('  GAGAL|', n, i === undefined ? '' : JSON.stringify(i).slice(0, 300)); } };
const rb = n => Math.round(Number(n) || 0);

(async () => {
  let db = { sheets: {}, props: {} };
  const call = async (f, a) => { const o = await runRPC(db, f, a, { ip: '1', ua: 'uji' }); db = o.db; return o.result; };
  await call('setup', []);
  const T = (await call('login', ['superadmin', process.env.SETUP_ADMIN_PASSWORD])).token;

  /* master: dua kantor, satu di antaranya bernama panjang */
  await call('apiSaveLayanan', [T, { tipe: 'KLL', nama: 'Banguntapan Utara', kode: '', aktif: true }]);
  await call('apiSaveLayanan', [T, { tipe: 'KLL', nama: 'Pundong', kode: '', aktif: true }]);
  await call('apiSaveRekening', [T, { namaBank: 'BPD DIY Syariah', nomor: '803211000510', atasNama: 'Lazismu', fundGroup: 'Infak', aktif: true }]);
  await call('apiSaveHakAmil', [T, { persen: { Zakat: 12.5, Infak: 12.5, Sedekah: 12.5, DSKL: 12.5, Amil: 0 }, kecuali: [] }]);

  const setor = async (nama, jumlah, tgl) => call('apiSaveImportedData', [T, [{
    tanggal: tgl, namaDonatur: nama, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '',
    jumlah: jumlah, metode: 'Transfer Bank', keterangan: 'Setoran ' + nama, fundraising: 'Kantor'
  }], 'himpun']);
  const ump = async (nama, nominal, tgl) => call('apiSaveImportedData', [T, [{
    tanggal: tgl, jenis: 'keluar', layanan: nama, dana: 'Infak', akun: 'Kas Infak',
    nominal: nominal, keterangan: 'Uang muka ' + nama
  }], 'ump']);
  const lpj = async (nama, jumlah, tgl) => call('apiSaveImportedData', [T, [{
    tanggal: tgl, namaPenerima: nama, program: 'Penyaluran Infak - Sosial', ashnaf: 'Fisabilillah',
    sumberDana: 'Infak', section: 'UMP LPJ INFAK', jumlah: jumlah, metode: 'Cash/Tunai',
    keterangan: 'LPJ ' + nama, fundraising: 'Kantor'
  }], 'salur']);

  console.log('=== A. SALAH KETIK TIDAK BOLEH MELAHIRKAN KANTOR BAYANGAN ===');
  await setor('KLL Banguntapan Utara', 10000000, '2026-01-06');
  await ump('KLL Banguntapan Utara', 4000000, '2026-01-10');
  /* ejaan salah, huruf "a" kembar — persis kasus yang ditemukan pengguna */
  await lpj('KLL Banguntapaan Utara', 852000, '2026-01-24');

  let s = await call('apiSaldoLayanan', [T, '2026-12-31']);
  let nama = s.daftar.map(x => x.layanan);
  cek('tidak ada kantor "Banguntapaan"', !nama.some(x => /banguntapaan/i.test(x)), nama);
  let bu = s.daftar.filter(x => /Banguntapan Utara/i.test(x.layanan))[0];
  cek('KLL Banguntapan Utara hanya satu baris', s.daftar.filter(x => /banguntapa+n utara/i.test(x.layanan)).length === 1, nama);
  cek('setoran 10.000.000', rb(bu.himpun) === 10000000, bu.himpun);
  cek('hak amil 12,5% = 1.250.000', rb(bu.hakAmil) === 1250000, bu.hakAmil);
  cek('saldo KLL = 8.750.000', rb(bu.saldoKLL) === 8750000, bu.saldoKLL);
  cek('uang muka 4.000.000', rb(bu.umpKeluar) === 4000000, bu.umpKeluar);
  cek('LPJ yang salah ketik ikut ke kantor yang benar', rb(bu.lpj) === 852000, bu.lpj);
  cek('sisa saldo = 8.750.000 - 4.000.000', rb(bu.sisaSaldo) === 4750000, bu.sisaSaldo);
  cek('belum LPJ = 4.000.000 - 852.000', rb(bu.belumLPJ) === 3148000, bu.belumLPJ);
  cek('tidak ada kantor bersaldo negatif akibat salah ketik',
    !s.daftar.some(x => x.belumLPJ < 0 && x.himpun === 0), s.daftar.filter(x => x.belumLPJ < 0).map(x => x.layanan));

  console.log('\n=== B. YANG MEMANG BEDA KANTOR TIDAK BOLEH IKUT DIGABUNG ===');
  await setor('KLL Pundong', 2000000, '2026-02-01');
  s = await call('apiSaldoLayanan', [T, '2026-12-31']);
  cek('KLL Pundong tetap terpisah', s.daftar.some(x => /Pundong/i.test(x.layanan)));
  cek('Pundong tidak tertelan Banguntapan', rb(s.daftar.filter(x => /Pundong/i.test(x.layanan))[0].himpun) === 2000000);

  console.log('\n=== C. ALAT PERIKSA NAMA KANTOR ===');
  await lpj('KLL Sedayuu', 500000, '2026-03-01');   /* tidak ada di master, tidak mirip apa pun */
  let per = await call('apiPeriksaLayanan', [T]);
  cek('daftar nama kantor terbaca', per.total >= 3, per.total);
  const asing = per.daftar.filter(x => !x.terdaftar).map(x => x.nama);
  cek('KLL Sedayuu ditandai belum terdaftar', asing.some(x => /Sedayuu/i.test(x)), asing);
  cek('Banguntapan Utara sudah dianggap terdaftar', per.daftar.some(x => /Banguntapan Utara/i.test(x.nama) && x.terdaftar), per.daftar.map(x => [x.nama, x.terdaftar]));
  const rowSedayu = per.daftar.filter(x => /Sedayuu/i.test(x.nama))[0];
  cek('nominal LPJ-nya ikut dilaporkan', rb(rowSedayu.lpj) === 500000, rowSedayu);

  console.log('\n=== D. GABUNGKAN NAMA KANTOR ===');
  /* Sebelum kantornya didaftarkan, "KLL Sedayuu" berdiri sendiri dan bisa
     digabungkan ke kantor mana pun yang benar. */
  let pra = await call('apiGabungLayanan', [T, 'KLL Sedayuu', 'KLL Pundong', false]);
  cek('pratinjau menemukan 1 baris', pra.jumlah === 1, pra);
  cek('pratinjau belum mengubah apa pun', pra.diterapkan === false);
  cek('pratinjau menyebut nominalnya', rb(pra.nominal.lpj) === 500000, pra.nominal);
  let cek1 = await call('apiSaldoLayanan', [T, '2026-12-31']);
  cek('sebelum diterapkan, KLL Sedayuu masih ada', cek1.daftar.some(x => /Sedayuu/i.test(x.layanan)));

  /* Setelah "Sedayu" didaftarkan di master, pencocokan mirip sudah menutup
     salah ketiknya SAAT MENAMPILKAN — rekapnya langsung benar tanpa disentuh. */
  await call('apiSaveLayanan', [T, { tipe: 'KLL', nama: 'Sedayu', kode: '', aktif: true }]);
  let s2 = await call('apiSaldoLayanan', [T, '2026-12-31']);
  cek('KLL Sedayuu hilang dari rekap tanpa perlu digabung', !s2.daftar.some(x => /Sedayuu/i.test(x.layanan)), s2.daftar.map(x => x.layanan));
  const sed = s2.daftar.filter(x => /Sedayu$/i.test(x.layanan))[0];
  cek('LPJ-nya jatuh ke KLL Sedayu', sed && rb(sed.lpj) === 500000, sed);

  /* Tetapi ejaan salahnya masih tersimpan di barisnya — harus tetap dilaporkan. */
  let per2 = await call('apiPeriksaLayanan', [T]);
  cek('ejaan mentah yang salah tetap dilaporkan', (per2.dirapikan || []).some(x => /Sedayuu/i.test(x.mentah)), per2.dirapikan);
  let jadi = await call('apiGabungLayanan', [T, 'KLL Sedayuu', 'KLL Sedayu', true]);
  cek('ejaan mentah bisa dibetulkan permanen', jadi.terubah === 1, jadi);
  let per3 = await call('apiPeriksaLayanan', [T]);
  cek('setelah dibetulkan, laporan ejaan bersih', !(per3.dirapikan || []).some(x => /Sedayuu/i.test(x.mentah)), per3.dirapikan);
  const sed2 = (await call('apiSaldoLayanan', [T, '2026-12-31'])).daftar.filter(x => /Sedayu$/i.test(x.layanan))[0];
  cek('angkanya tidak berubah setelah dibetulkan', rb(sed2.lpj) === 500000, sed2);
  cek('menolak menggabungkan nama ke dirinya sendiri', await (async () => {
    try { await call('apiGabungLayanan', [T, 'KLL Sedayu', 'KLL Sedayu', true]); return false; } catch (e) { return /sama/i.test(e.message); }
  })());

  console.log('\n=== D2. PASANGAN NAMA YANG MIRIP ===');
  /* KLL Pundong dibuat ramai dulu, supaya timpangnya jumlah baris terlihat */
  for (let i = 0; i < 12; i++) await setor('KLL Pundong', 100000 + i, '2026-05-0' + ((i % 8) + 1));
  /* satu huruf sisipan masih di dalam ambang aman -> dicocokkan otomatis */
  await lpj('KLL Pundonvg', 13592, '2026-05-02');
  /* huruf tertukar pada nama pendek -> di luar ambang aman, harus dilaporkan
     ke manusia, bukan digabung diam-diam */
  await lpj('KLL Pnudong', 25000, '2026-05-03');
  let pm = await call('apiPeriksaLayanan', [T]);
  const pas = (pm.mirip || []);
  cek('pasangan mirip terdeteksi', pas.length >= 1, pas.map(x => [x.sedikit, x.banyak]));
  cek('sisipan satu huruf sudah digabung otomatis (tidak perlu dilaporkan)',
    !pas.some(x => /Pundonvg/i.test(x.sedikit + x.banyak)), pas.map(x => x.sedikit));
  cek('huruf tertukar dilaporkan untuk diputuskan manusia',
    pas.some(x => /Pnudong/i.test(x.sedikit)), pas.map(x => x.sedikit));
  cek('yang sedikit barisnya ditandai sebagai dugaan salah ketik',
    pas.every(x => x.nSedikit <= x.nBanyak), pas.map(x => [x.sedikit, x.nSedikit, x.banyak, x.nBanyak]));
  cek('KLL Pundong disebut sebagai kemungkinan maksudnya',
    pas.some(x => /^KLL Pundong$/i.test(x.banyak)), pas.map(x => x.banyak));
  cek('keyakinan tinggi untuk 1 baris lawan belasan baris',
    pas.some(x => x.yakin === 'tinggi'), pas.map(x => [x.sedikit, x.yakin, x.nSedikit, x.nBanyak]));
  cek('KLL dan ULL tidak pernah dipasangkan',
    pas.every(x => x.sedikit.slice(0, 3).toUpperCase() === x.banyak.slice(0, 3).toUpperCase()), pas);
  /* dua kantor yang memang berbeda tidak boleh muncul sebagai pasangan */
  await call('apiSaveLayanan', [T, { tipe: 'KLL', nama: 'Piyungan', kode: '', aktif: true }]);
  await setor('KLL Piyungan', 1500000, '2026-05-05');
  pm = await call('apiPeriksaLayanan', [T]);
  cek('Piyungan dan Pajangan tidak dianggap mirip',
    !(pm.mirip || []).some(x => /piyungan/i.test(x.sedikit + x.banyak) && /pajangan/i.test(x.sedikit + x.banyak)), pm.mirip);
  const sblm = (await call('apiSaldoLayanan', [T, '2026-12-31'])).daftar.filter(x => /P.?[un]{2}dong/i.test(x.layanan));
  cek('sebelum digabung, ejaan tertukar masih berdiri sendiri', sblm.length === 2, sblm.map(x => x.layanan));
  await call('apiGabungLayanan', [T, 'KLL Pnudong', 'KLL Pundong', true]);
  const ssdh = (await call('apiSaldoLayanan', [T, '2026-12-31'])).daftar.filter(x => /P.?[un]{2}dong/i.test(x.layanan));
  cek('setelah digabung tinggal satu KLL Pundong', ssdh.length === 1, ssdh.map(x => x.layanan));
  cek('nominalnya ikut pindah, tidak hilang', rb(ssdh[0].lpj) === 38592, ssdh[0].lpj);
  cek('laporan pasangan mirip ikut bersih',
    !((await call('apiPeriksaLayanan', [T])).mirip || []).some(x => /Pnudong/i.test(x.sedikit)));

  console.log('\n=== E. TRANSAKSI KEMBAR ===');
  const totalSebelum = (await call('apiListPenghimpunan', [T])).length;
  /* impor yang sama dijalankan dua kali */
  for (let i = 0; i < 2; i++) await setor('KLL Pundong', 750000, '2026-04-05');
  await ump('KLL Pundong', 300000, '2026-04-06');
  await ump('KLL Pundong', 300000, '2026-04-06');
  /* Uang muka & transfer sudah punya penjaga anti-dobel sendiri saat disimpan,
     jadi impor kedua tidak menambah baris. Penghimpunan belum punya penjaga
     seperti itu — di situlah baris kembar benar-benar lahir. */
  cek('impor uang muka yang sama persis tidak menambah baris',
    (await call('apiListUangMuka', [T])).filter(x => x.tanggal === '2026-04-06').length === 1);
  let dob = await call('apiPeriksaDobel', [T, false]);
  cek('menemukan 1 baris penghimpunan kembar', dob.jumlah === 1, dob.perTabel);
  cek('nominal kembar = 750.000', rb(dob.nominal) === 750000, dob.nominal);
  cek('yang kembar ada di tabel Penghimpunan',
    dob.perTabel.filter(x => x.tabel === 'Penghimpunan')[0].jumlah === 1, dob.perTabel);
  cek('pratinjau belum menghapus', (await call('apiListPenghimpunan', [T])).length === totalSebelum + 2);
  let hapus = await call('apiPeriksaDobel', [T, true]);
  cek('1 baris kembar dihapus', hapus.terhapus === 1, hapus);
  cek('sisa penghimpunan benar', (await call('apiListPenghimpunan', [T])).length === totalSebelum + 1);
  cek('memeriksa lagi sudah bersih', (await call('apiPeriksaDobel', [T, false])).jumlah === 0);
  const pun = (await call('apiSaldoLayanan', [T, '2026-12-31'])).daftar.filter(x => /Pundong/i.test(x.layanan))[0];
  /* 2.000.000 + 750.000 (satu salinan sudah dibuang) + 12 setoran uji di bagian D2 */
  const setorD2 = Array.from({ length: 12 }, (_, i) => 100000 + i).reduce((a, b) => a + b, 0);
  cek('setoran Pundong sesuai hitungan, tanpa yang kembar', rb(pun.himpun) === 2750000 + setorD2, { ada: pun.himpun, harus: 2750000 + setorD2 });
  cek('uang muka Pundong tinggal 300.000', rb(pun.umpKeluar) === 300000, pun.umpKeluar);

  console.log('\n=== F. TRANSAKSI YANG MIRIP TAPI BUKAN KEMBAR ===');
  await setor('KLL Pundong', 750000, '2026-04-07');   /* tanggal beda */
  await setor('KLL Pundong', 760000, '2026-04-05');   /* nominal beda */
  cek('beda tanggal / beda nominal tidak dianggap kembar', (await call('apiPeriksaDobel', [T, false])).jumlah === 0);

  console.log('\n=== G. KOSONGKAN DATA TRANSAKSI ===');
  const nRek = (await call('apiListRekening', [T])).length;
  const nLay = (await call('apiListLayanan', [T])).length;
  const amilSebelum = await call('apiHakAmil', [T]);
  cek('menolak tanpa kata konfirmasi', await (async () => {
    try { await call('apiResetTransaksi', [T, 'ya', false]); return false; } catch (e) { return /KOSONGKAN/.test(e.message); }
  })());
  const res = await call('apiResetTransaksi', [T, 'KOSONGKAN', false]);
  cek('melaporkan jumlah baris yang dihapus', res.total > 0, res.total);
  cek('penghimpunan kosong', (await call('apiListPenghimpunan', [T])).length === 0);
  cek('pentasyarufan kosong', (await call('apiListPentasyarufan', [T])).length === 0);
  cek('uang muka kosong', (await call('apiListUangMuka', [T])).length === 0);
  cek('rekening tetap utuh', (await call('apiListRekening', [T])).length === nRek, nRek);
  cek('kantor layanan tetap utuh', (await call('apiListLayanan', [T])).length === nLay, nLay);
  cek('hak amil tetap utuh', JSON.stringify(await call('apiHakAmil', [T])) === JSON.stringify(amilSebelum));
  cek('cadangan sebelum dikosongkan ikut dikembalikan', !!(res.cadangan && res.cadangan.sheets && res.cadangan.sheets.Penghimpunan));
  cek('cadangan memuat baris yang tadi dihapus', res.cadangan.sheets.Penghimpunan.length > 1, res.cadangan.sheets.Penghimpunan.length);
  const kosong = await call('apiSaldoLayanan', [T, '2026-12-31']);
  cek('rekap KLL ikut kosong', kosong.daftar.length === 0, kosong.daftar.length);
  cek('masih bisa login & memakai aplikasi', !!(await call('apiMe', [T])).username);

  console.log('\n=== H. IMPOR ULANG SETELAH DIKOSONGKAN ===');
  await setor('KLL Banguntapan Utara', 10000000, '2026-01-06');
  await ump('KLL Banguntapan Utara', 4000000, '2026-01-10');
  await lpj('KLL Banguntapaan Utara', 852000, '2026-01-24');
  const ulang = (await call('apiSaldoLayanan', [T, '2026-12-31'])).daftar.filter(x => /Banguntapan Utara/i.test(x.layanan))[0];
  cek('angka sama persis seperti sebelum dikosongkan', rb(ulang.himpun) === 10000000 && rb(ulang.belumLPJ) === 3148000, ulang);
  cek('tidak ada baris kembar setelah impor ulang', (await call('apiPeriksaDobel', [T, false])).jumlah === 0);
  cek('tidak ada kantor bayangan setelah impor ulang',
    (await call('apiPeriksaLayanan', [T])).bermasalah === 0, (await call('apiPeriksaLayanan', [T])).daftar.filter(x => !x.terdaftar));

  console.log('\ntest_layanan_bersih.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
