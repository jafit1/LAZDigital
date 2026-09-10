/* Saldo per kantor layanan (KLL/ULL):
     setoran - hak amil = saldo KLL
     saldo KLL - uang muka + dikembalikan = sisa saldo di daerah
     uang muka - LPJ - dikembalikan = belum LPJ
   Termasuk pengaturan persen hak amil, pengecualian setoran tertentu,
   dan pembatasan akses pengurus KLL ke kantornya sendiri. */
const { runRPC } = require('./_engine.js');
let ok = 0, g = 0;
const cek = (n, c, i) => { if (c) { ok++; console.log('  OK   |', n); } else { g++; console.log('  GAGAL|', n, i === undefined ? '' : JSON.stringify(i).slice(0, 320)); } };
const rb = n => Math.round(Number(n) || 0);

(async () => {
  let db = { sheets: {}, props: {} };
  const call = async (fn, a) => { const o = await runRPC(db, fn, a, { ip: '1.1.1.1', ua: 'uji' }); db = o.db; return o.result; };
  await call('setup', []);
  const T = (await call('login', ['superadmin', process.env.SETUP_ADMIN_PASSWORD])).token;
  await call('apiSaveRekening', [T, { namaBank: 'BPD DIY Syariah', nomor: '803211000510', atasNama: 'Lazismu', fundGroup: 'Infak', aktif: true }]);
  await call('apiSaveLayanan', [T, { tipe: 'KLL', kode: 'SRD', nama: 'Srandakan', aktif: true }]);
  await call('apiSaveLayanan', [T, { tipe: 'KLL', kode: 'IMG', nama: 'Imogiri', aktif: true }]);
  await call('apiSaveLayanan', [T, { tipe: 'ULL', kode: 'MSA', nama: 'Masjid Aceh', aktif: true }]);

  const himpun = (tgl, lay, jenis, sub, pilar, n) => call('apiSavePenghimpunan', [T, {
    tanggal: tgl, jenisDana: jenis, subJenis: sub, pilar: pilar, namaDonatur: lay,
    tipeDonatur: /^(KLL|ULL)\b/.test(lay) ? 'Kantor Layanan (KLL)' : 'Perorangan',
    jumlah: n, metode: 'Cash/Tunai', statusBayar: 'Lunas', fundraising: /^(KLL|ULL)\b/.test(lay) ? lay : 'Lazismu Daerah Bantul' }]);

  /* KLL Srandakan: 10jt infak umum + 5jt infak terikat kemanusiaan + 4jt zakat */
  await himpun('2026-03-02', 'KLL Srandakan', 'Infak', 'Infak Umum', '', 10000000);
  await himpun('2026-03-05', 'KLL Srandakan', 'Infak', 'Infak Terikat', 'Kemanusiaan', 5000000);
  await himpun('2026-03-09', 'KLL Srandakan', 'Zakat', 'Zakat Mal', '', 4000000);
  /* KLL Imogiri: 8jt infak umum */
  await himpun('2026-03-11', 'KLL Imogiri', 'Infak', 'Infak Umum', '', 8000000);
  /* ULL Masjid Aceh: 2jt infak umum */
  await himpun('2026-03-12', 'ULL Masjid Aceh', 'Infak', 'Infak Umum', '', 2000000);
  /* daerah (tanpa penanda KLL) */
  await himpun('2026-03-13', 'Hamba Allah', 'Infak', 'Infak Umum', '', 1000000);

  /* uang muka & LPJ lewat impor jurnal */
  const S = t => ['', t, '', '', ''].join('\t');
  const P = (tgl, debet, kredit, n, ket) => [[tgl, debet, String(n), '', ket].join('\t'), [tgl, kredit, '', String(n), ket].join('\t')].join('\n');
  const BANK = 'BPD DIY Syariah - 803211000510';
  const tsv = [
    S('UMP INFAK'),
    P('2026-04-01', 'UMP Infak Sedekah', BANK, 6000000, 'KLL Srandakan Uang Muka Program'),
    P('2026-04-02', 'UMP Infak Sedekah', BANK, 3000000, 'KLL Imogiri Uang Muka Program'),
    S('UMP LPJ INFAK'),
    P('2026-04-20', 'Penyaluran Infak Terikat - Kesehatan', 'UMP Infak Sedekah', 4000000, 'KLL Srandakan kegiatan kesehatan'),
    P('2026-04-21', 'Penyaluran Infak - Sosial', 'UMP Infak Sedekah', 1000000, 'KLL Imogiri kegiatan sosial'),
    S('PENGEMBALIAN UMP'),
    P('2026-04-25', BANK, 'UMP Infak Sedekah', 500000, 'KLL Srandakan pengembalian sisa')
  ].join('\n');
  const p = await call('apiParseImportText', [T, tsv, 'himpun']);
  for (const [k, tp] of [['umpValid', 'ump'], ['salurValid', 'salur'], ['transferValid', 'transfer']]) {
    if (p[k] && p[k].length) await call('apiSaveImportedData', [T, p[k], tp]);
  }
  cek('uang muka & LPJ tercatat atas nama KLL-nya', (p.umpValid || []).length === 3 && (p.salurValid || []).length === 2,
    { ump: (p.umpValid || []).map(x => [x.layanan, x.jenis, x.nominal]), lpj: (p.salurValid || []).map(x => [x.namaPenerima, x.jumlah]) });

  /* ---------- 1. Hak amil bawaan 12,5% ---------- */
  console.log('=== A. SALDO PER KLL (hak amil 12,5%) ===');
  const s1 = await call('apiSaldoLayanan', [T, '2026-12-31']);
  const cari = n => s1.daftar.find(x => x.layanan === n);
  const srd = cari('KLL Srandakan');
  cek('KLL Srandakan terhimpun 19.000.000', rb(srd.himpun) === 19000000, srd);
  cek('hak amil 12,5% dari 19jt = 2.375.000', rb(srd.hakAmil) === 2375000, rb(srd.hakAmil));
  cek('saldo KLL = 19jt - 2.375.000 = 16.625.000', rb(srd.saldoKLL) === 16625000, rb(srd.saldoKLL));
  cek('uang muka keluar 6jt, dikembalikan 500rb, LPJ 4jt', rb(srd.umpKeluar) === 6000000 && rb(srd.umpKembali) === 500000 && rb(srd.lpj) === 4000000, srd);
  cek('sisa saldo di daerah = 16.625.000 - 6jt + 500rb = 11.125.000', rb(srd.sisaSaldo) === 11125000, rb(srd.sisaSaldo));
  cek('belum LPJ = 6jt - 4jt - 500rb = 1.500.000', rb(srd.belumLPJ) === 1500000, rb(srd.belumLPJ));
  const img = cari('KLL Imogiri');
  cek('KLL Imogiri: 8jt, amil 1jt, saldo 7jt, sisa 4jt, belum LPJ 2jt',
    rb(img.hakAmil) === 1000000 && rb(img.saldoKLL) === 7000000 && rb(img.sisaSaldo) === 4000000 && rb(img.belumLPJ) === 2000000, img);
  const ull = cari('ULL Masjid Aceh');
  cek('ULL ikut terhitung & tipenya ULL', ull && ull.tipe === 'ULL' && rb(ull.saldoKLL) === 1750000, ull);
  cek('penghimpunan tanpa penanda masuk baris Daerah', s1.daftar.some(x => x.tipe === 'Daerah' && rb(x.himpun) === 1000000), s1.daftar.map(x => [x.layanan, x.tipe]));
  cek('jumlah kantor layanan dihitung tanpa baris Daerah', s1.jumlahLayanan === 3, s1.jumlahLayanan);
  cek('urut sisa saldo terbesar di atas', s1.daftar.every((x, i) => i === 0 || s1.daftar[i - 1].sisaSaldo >= x.sisaSaldo), s1.daftar.map(x => [x.layanan, rb(x.sisaSaldo)]));
  cek('total = jumlah semua barisnya', rb(s1.total.himpun) === 30000000 && rb(s1.total.hakAmil) === rb(s1.daftar.reduce((a, x) => a + x.hakAmil, 0)), s1.total);

  /* ---------- 2. Ubah persen & pengecualian ---------- */
  console.log('\n=== B. PENGATURAN HAK AMIL ===');
  const sv = await call('apiSaveHakAmil', [T, { persen: { Zakat: 12.5, Infak: 20, Amil: 0 }, kecuali: ['Kemanusiaan'] }]);
  cek('pengaturan tersimpan', sv.ok && sv.persen.Infak === 20 && sv.kecuali[0] === 'Kemanusiaan', sv);
  const s2 = await call('apiSaldoLayanan', [T, '2026-12-31']);
  const srd2 = s2.daftar.find(x => x.layanan === 'KLL Srandakan');
  /* infak umum 10jt x 20% = 2jt; zakat 4jt x 12,5% = 500rb; kemanusiaan 5jt dikecualikan */
  cek('setoran pilar Kemanusiaan tidak dipotong hak amil', rb(srd2.bebasAmil) === 5000000 && rb(srd2.kenaAmil) === 14000000, srd2);
  cek('hak amil jadi 2.500.000 (infak 20% + zakat 12,5%)', rb(srd2.hakAmil) === 2500000, rb(srd2.hakAmil));
  cek('saldo KLL menyesuaikan jadi 16.500.000', rb(srd2.saldoKLL) === 16500000, rb(srd2.saldoKLL));
  cek('identitas: sisa saldo + uang muka - dikembalikan = saldo KLL',
    Math.abs((srd2.sisaSaldo + srd2.umpKeluar - srd2.umpKembali) - srd2.saldoKLL) < 0.01);
  cek('identitas: belum LPJ + LPJ + dikembalikan = uang muka keluar',
    Math.abs((srd2.belumLPJ + srd2.lpj + srd2.umpKembali) - srd2.umpKeluar) < 0.01);
  let tolakP = ''; try { await call('apiSaveHakAmil', [T, { persen: { Infak: 150 } }]); } catch (e) { tolakP = e.message; }
  cek('persen di luar 0-100 ditolak', /antara 0 dan 100/.test(tolakP), tolakP);

  /* ---------- 3. Rincian satu KLL ---------- */
  console.log('\n=== C. RINCIAN SATU KLL ===');
  const d = await call('apiDetailSaldoLayanan', [T, 'KLL Srandakan', '2026-12-31']);
  cek('rincian memuat 3 setoran, 2 baris uang muka, 1 LPJ', d.setoran.length === 3 && d.uangMuka.length === 2 && d.lpj.length === 1,
    { setoran: d.setoran.length, ump: d.uangMuka.length, lpj: d.lpj.length });
  cek('tiap setoran menyebut hak amil & nilai bersihnya',
    d.setoran.every(x => x.jumlah > 0 && x.bersih === x.jumlah - x.hakAmil), d.setoran.map(x => [x.jumlah, x.hakAmil, x.bersih]));
  cek('setoran Kemanusiaan ditandai bebas hak amil',
    d.setoran.some(x => x.pilar === 'Kemanusiaan' && x.bebasAmil && x.hakAmil === 0), d.setoran.map(x => [x.pilar, x.bebasAmil]));
  cek('jumlah setoran di rincian = angka ringkasannya', rb(d.setoran.reduce((a, x) => a + x.jumlah, 0)) === rb(d.ringkas.himpun));
  cek('hak amil di rincian = angka ringkasannya', rb(d.setoran.reduce((a, x) => a + x.hakAmil, 0)) === rb(d.ringkas.hakAmil));
  cek('baris uang muka memuat yang keluar & yang dikembalikan',
    d.uangMuka.some(x => x.jenis === 'Uang muka keluar' && rb(x.jumlah) === 6000000) && d.uangMuka.some(x => x.jenis === 'Dikembalikan' && rb(x.jumlah) === 500000), d.uangMuka);
  cek('baris LPJ memuat programnya', d.lpj[0] && rb(d.lpj[0].jumlah) === 4000000 && /Kesehatan/i.test(d.lpj[0].program || ''), d.lpj);
  cek('semua baris urut tanggal', d.setoran.every((x, i) => i === 0 || d.setoran[i - 1].tanggal <= x.tanggal));
  let tolakK = ''; try { await call('apiDetailSaldoLayanan', [T, '', '2026-12-31']); } catch (e) { tolakK = e.message; }
  cek('tanpa nama kantor ditolak', /belum dipilih/i.test(tolakK), tolakK);

  /* ---------- 4. Batas tanggal ---------- */
  console.log('\n=== D. POSISI PER TANGGAL ===');
  const sMar = await call('apiSaldoLayanan', [T, '2026-03-31']);
  const srdMar = sMar.daftar.find(x => x.layanan === 'KLL Srandakan');
  cek('per 31 Maret: uang muka belum keluar, sisa saldo = saldo KLL',
    rb(srdMar.umpKeluar) === 0 && rb(srdMar.sisaSaldo) === rb(srdMar.saldoKLL) && rb(srdMar.saldoKLL) === 16500000, srdMar);

  /* ---------- 5. Hak akses pengurus KLL ---------- */
  console.log('\n=== E. AKUN PENGURUS KLL ===');
  await call('apiSaveUser', [T, { username: 'srandakan', nama: 'Pengurus Srandakan', password: 'Srandakan26', role: 'staff',
    aktif: true, layanan: 'KLL Srandakan', permissions: { dashboard: { view: true } } }]);
  const T2 = (await call('login', ['srandakan', 'Srandakan26'])).token;
  const me = await call('apiMe', [T2]);
  cek('akun pengurus menyimpan nama kantornya', me.layanan === 'KLL Srandakan', me);
  const s3 = await call('apiSaldoLayanan', [T2, '2026-12-31']);
  cek('pengurus KLL hanya melihat kantornya sendiri', s3.daftar.length === 1 && s3.daftar[0].layanan === 'KLL Srandakan' && s3.dibatasi === 'KLL Srandakan', s3.daftar.map(x => x.layanan));
  cek('totalnya ikut dibatasi ke kantornya', rb(s3.total.himpun) === 19000000, rb(s3.total.himpun));
  const d2 = await call('apiDetailSaldoLayanan', [T2, 'KLL Srandakan', '2026-12-31']);
  cek('pengurus boleh membuka rincian kantornya', d2.setoran.length === 3);
  let tolak = ''; try { await call('apiDetailSaldoLayanan', [T2, 'KLL Imogiri', '2026-12-31']); } catch (e) { tolak = e.message; }
  cek('pengurus TIDAK boleh membuka kantor lain', /IZIN/.test(tolak) && /KLL Srandakan/.test(tolak), tolak);
  let tolakS = ''; try { await call('apiSaveHakAmil', [T2, { persen: { Infak: 5 } }]); } catch (e) { tolakS = e.message; }
  cek('pengurus tidak bisa mengubah persen hak amil', /IZIN/.test(tolakS), tolakS);
  const sAdmin = await call('apiSaldoLayanan', [T, '2026-12-31']);
  cek('admin daerah tetap melihat semua kantor', sAdmin.daftar.length >= 4 && !sAdmin.dibatasi, sAdmin.daftar.length);
  await call('apiSaveUser', [T, { username: 'srandakan', nama: 'Pengurus Srandakan', role: 'staff', aktif: true, layanan: '', permissions: { dashboard: { view: true } },
    id: db.sheets.Users.slice(1).find(r => r[1] === 'srandakan')[0] }]);
  const T3 = (await call('login', ['srandakan', 'Srandakan26'])).token;
  const lepas = await call('apiSaldoLayanan', [T3, '2026-12-31']);
  cek('batas kantor bisa dilepas kembali', !lepas.dibatasi && lepas.daftar.filter(x => x.tipe !== 'Daerah').length >= 3,
    { dibatasi: lepas.dibatasi, n: lepas.daftar.length });

  /* Angka Penghimpunan Daerah adalah izin tersendiri: tanpa izin itu barisnya
     tidak boleh ikut terkirim, bukan sekadar disembunyikan di tampilan. */
  cek('tanpa izin saldodaerah, baris Daerah tidak dikirim',
    !lepas.daftar.some(x => x.tipe === 'Daerah') && lepas.daerah === null && lepas.bolehDaerah === false, lepas.daftar.map(x => x.layanan));
  cek('total tanpa izin = total KLL saja',
    rb(lepas.total.himpun) === rb(lepas.totalKll.himpun), { total: lepas.total.himpun, kll: lepas.totalKll.himpun });
  cek('rincian Penghimpunan Daerah ditolak tanpa izin', await (async () => {
    try { await call('apiDetailSaldoLayanan', [T3, 'Penghimpunan Daerah', '2026-12-31']); return false; }
    catch (e) { return /IZIN/.test(e.message); }
  })());

  await call('apiSaveUser', [T, { username: 'srandakan', nama: 'Pengurus Srandakan', role: 'staff', aktif: true, layanan: '',
    permissions: { dashboard: { view: true }, saldodaerah: { view: true } },
    id: db.sheets.Users.slice(1).find(r => r[1] === 'srandakan')[0] }]);
  const T4 = (await call('login', ['srandakan', 'Srandakan26'])).token;
  const izin = await call('apiSaldoLayanan', [T4, '2026-12-31']);
  cek('dengan izin saldodaerah, baris Daerah ikut terkirim',
    izin.bolehDaerah === true && !!izin.daerah && izin.daftar.some(x => x.tipe === 'Daerah'), izin.daftar.map(x => x.layanan));
  cek('rincian Penghimpunan Daerah boleh dibuka dengan izin',
    !!(await call('apiDetailSaldoLayanan', [T4, 'Penghimpunan Daerah', '2026-12-31'])).ringkas);
  cek('superadmin selalu boleh', (await call('apiSaldoLayanan', [T, '2026-12-31'])).bolehDaerah === true);
  cek('totalKll tidak pernah memuat angka daerah',
    rb(izin.totalKll.himpun) === rb(izin.daftar.filter(x => x.tipe !== 'Daerah').reduce((a, x) => a + x.himpun, 0)), izin.totalKll);

  console.log('\ntest_kll.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
