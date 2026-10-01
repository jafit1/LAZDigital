/* Uji Impor Jurnal per Berkas: aturan nama kantor dan pemeriksaan awal.
 *
 * KENAPA INI PERLU DIJAGA. Semuanya ditemukan 1 Oktober 2026 saat jurnal Kas
 * dan Bank September dibaca baris demi baris bersama pemilik.
 *
 * ATURAN KANTOR yang ditetapkan pemilik:
 *   - keterangan memuat KLL, ULL, KL, atau UL -> milik kantor itu;
 *     "Kantor Layanan" dan "Unit Layanan" yang ditulis lengkap juga.
 *     Dulu "UL" dan tulisan lengkap tidak dikenali, sehingga setoran
 *     "Unit Layanan Masjid Baiturrahman Aceh" Rp 8.125.000 jatuh ke Daerah;
 *   - selain itu milik Lazismu Daerah, walaupun menyebut nama kecamatan;
 *   - nama kantor = nama yang terdaftar, kata di belakangnya keterangan;
 *   - nama yang tidak jelas ("ULL Masjid" cocok dengan banyak masjid) TIDAK
 *     ditebak. Pemilik memilihnya sekali, lalu pilihannya diingat sebagai
 *     nama lain (alias) untuk impor berikutnya.
 *
 * PEMERIKSAAN AWAL: hal yang dulu baru ketahuan berbulan-bulan kemudian
 * sekarang dilaporkan sebelum data disimpan, masing-masing dengan usulan:
 *   - tanggal di luar bulan berkas (dua baris Juni di sheet September);
 *   - keterangan hanya nama kantor tanpa KLL/ULL ("Infak Umum Bantul Kota"
 *     Rp 28.896.200 yang ternyata setoran KLL Bantul Kota);
 *   - nama kantor tidak terdaftar ("KLL Imoghiri", "ULL Masjid");
 *   - pilar akun bertentangan dengan keterangan (ambulan di akun Pendidikan);
 *   - uang masuk ke rekening jenis dana lain (zakat ke rekening infak);
 *   - nominal sangat kecil (transfer uji Rp 10);
 *   - baris kembar di dalam berkas;
 *   - berkas bank yang hanya berisi sebagian seksi.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_impor_berkas.js
 */
'use strict';
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
  try { const o = await engine.runRPC(db, fn, args, { ip: '10.1.1.1' }); return { ok: true, hasil: o.result, db: o.db }; }
  catch (e) { return { ok: false, galat: e.message, db }; }
}
const SANDI = 'Contoh1234';
const B = (rows) => rows.map((r) => r.join('\t')).join('\n');
const pasang = (tgl, debet, kredit, n, ket) => [[tgl, debet, String(n), '', ket], [tgl, kredit, '', String(n), ket]];

(async () => {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  let db = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  let r = await rpc(db, 'login', ['superadmin', SANDI]); db = r.db;
  const T = r.hasil.token;
  const lay = {};
  for (const [tipe, nama] of [['KLL', 'Bantul Kota'], ['KLL', 'Imogiri'], ['KLL', 'Bambanglipuro'],
    ['ULL', 'Masjid Baiturrahman Aceh'], ['ULL', 'Masjid Al Ikhlas']]) {
    r = await rpc(db, 'apiSaveLayanan', [T, { tipe, nama, aktif: 'true' }]); db = r.db;
    if (!r.ok) { console.log('gagal menyiapkan layanan', r.galat); process.exit(1); }
  }
  const tl = db.sheets.Layanan, hl = tl[0];
  tl.slice(1).forEach((x) => { lay[x[hl.indexOf('nama')]] = x[hl.indexOf('id')]; });
  r = await rpc(db, 'apiSaveRekening', [T, { namaBank: 'Bank Contoh Infak Umum', nomor: '1234567890', atasNama: 'Lazismu', fundGroup: 'Infak', aktif: 'true' }]);
  if (r.ok) db = r.db;
  r = await rpc(db, 'apiSaveUser', [T, { username: 'staf.uji', nama: 'Staf Uji', role: 'staff', password: SANDI,
    permissions: { penghimpunan: { view: true, create: true } } }]); db = r.db;
  r = await rpc(db, 'login', ['staf.uji', SANDI]); db = r.db;
  const TS = r.hasil.token;

  const KAS = 'Kas Infak', KZ = 'Kas Zakat';
  const baris = [
    ['', 'PENERIMAAN INFAK UMUM VIA KAS', '', '', ''],
    ...pasang('2026-09-02', KAS, 'Penerimaan Infak Umum', 4130000, 'Infak Umum Unit Layanan Masjid Baiturrahman Aceh Infak Umum'),
    ...pasang('2026-09-03', KAS, 'Penerimaan Infak Umum', 500000, 'Infak Umum UL Masjid Baiturrahman Aceh'),
    ...pasang('2026-09-04', KAS, 'Penerimaan Infak Umum', 2000000, 'Infak Umum SMK Muh 1 Bambanglipuro'),
    ...pasang('2026-09-30', KAS, 'Penerimaan Infak Umum', 28896200, 'Infak Umum Bantul Kota'),
    ...pasang('2026-09-11', KAS, 'Penerimaan Infak Umum', 3000000, 'Infak Umum KLL Imoghiri'),
    ...pasang('2026-09-12', KAS, 'Penerimaan Infak Umum', 150000, 'Infak Umum ULL Masjid'),
    ...pasang('2026-09-18', KAS, 'Penerimaan Infak Umum', 50000, 'Infak Umum NN Sumur'),
    ...pasang('2026-09-18', KAS, 'Penerimaan Infak Umum', 50000, 'Infak Umum NN Sumur'),
    ['', 'PENERIMAAN ZAKAT VIA KAS', '', '', ''],
    ...pasang('2026-09-05', KZ, 'Penerimaan Zakat Mal', 750000, 'Zakat Mal Kantor Layanan Imogiri'),
    ...pasang('2026-06-07', KZ, 'Penerimaan Zakat Mal', 120000, 'Zakat Mal Donatur Karangan'),
    ['', 'PENERIMAAN INFAK TERIKAT VIA KAS', '', '', ''],
    ...pasang('2026-09-24', KAS, 'Penerimaan Infak Terikat - Pendidikan', 10000000, 'KLL Bantul Kota Infak Ambulan'),
    ...pasang('2026-09-25', KAS, 'Penerimaan Infak Terikat - Kemanusiaan', 1500000, 'Infak Terikat KLL Bambanglipuro Nusa Tenggara Timur'),
    ['', 'PENERIMAAN ZAKAT VIA BANK', '', '', ''],
    ...pasang('2026-09-20', 'Bank Contoh Infak Umum - 1234567890', 'Penerimaan Zakat Mal', 250000, 'Donatur Kedua Zakat Maal'),
    ...pasang('2026-09-21', 'Bank Contoh Infak Umum - 1234567890', 'Penerimaan Zakat Mal', 10, 'NN Zakat Maal'),
  ];
  const opsi = { bulan: '2026-09', jenis: 'kas' };
  r = await rpc(db, 'apiParseImportText', [T, B(baris), 'himpun', opsi]);
  const res = r.hasil || {};
  const H = res.himpunValid || [];
  const cari = (n) => H.find((x) => Math.round(x.jumlah) === n) || {};
  const tem = res.temuan || [];
  const temu = (jenis, f) => tem.filter((x) => x.jenis === jenis && (!f || f(x)));
  const baris_ = (x) => (x.baris || []).map((b) => b.kumpulan + ':' + b.idx);
  const idxDari = (n) => 'himpun:' + H.indexOf(cari(n));
  cek('berkas terbaca sebagai jurnal', r.ok && res.isJurnal === true, r.galat);

  console.log('\n=== A. ATURAN KANTOR ===');
  cek('"Unit Layanan" ditulis lengkap -> ULL Masjid Baiturrahman Aceh',
    cari(4130000).layananId === lay['Masjid Baiturrahman Aceh'] && /ULL/.test(cari(4130000).tipeDonatur), cari(4130000));
  cek('"UL" -> ULL', cari(500000).layananId === lay['Masjid Baiturrahman Aceh'], cari(500000));
  cek('"Kantor Layanan" ditulis lengkap -> KLL Imogiri', cari(750000).layananId === lay.Imogiri, cari(750000));
  cek('nama kantor diikuti keterangan kampanye tetap kantor terdaftar',
    cari(1500000).layananId === lay.Bambanglipuro, cari(1500000));
  cek('menyebut nama kecamatan tanpa KLL/ULL tetap milik Daerah',
    !cari(2000000).layananId && cari(2000000).tipeDonatur === 'Perorangan', cari(2000000));
  cek('nama tanpa awalan TIDAK dipindah diam-diam (menunggu keputusan)',
    !cari(28896200).layananId, cari(28896200));

  console.log('\n=== B. PEMERIKSAAN AWAL ===');
  cek('hasil memuat daftar temuan', Array.isArray(res.temuan), Object.keys(res));
  const tBantul = temu('kantorTanpaAwalan');
  cek('keterangan yang isinya hanya nama kantor ditandai', tBantul.length === 1 && baris_(tBantul[0])[0] === idxDari(28896200), tBantul);
  cek('usulannya KLL Bantul Kota', tBantul[0] && tBantul[0].usulan && tBantul[0].usulan.layananId === lay['Bantul Kota'], tBantul[0]);
  cek('sekolah di wilayah KLL tidak ikut ditandai', !tem.some((x) => baris_(x).indexOf(idxDari(2000000)) >= 0 && x.jenis === 'kantorTanpaAwalan'));

  const tTak = temu('kantorTakTerdaftar');
  const imog = tTak.find((x) => /Imoghiri/.test(x.nama));
  cek('"KLL Imoghiri" ditandai tidak terdaftar', !!imog, tTak.map((x) => x.nama));
  cek('usulannya KLL Imogiri', imog && imog.usulan && imog.usulan.layananId === lay.Imogiri, imog);
  const msj = tTak.find((x) => /^ULL Masjid$/.test(x.nama));
  cek('"ULL Masjid" ditandai tidak terdaftar', !!msj, tTak.map((x) => x.nama));
  cek('"ULL Masjid" TIDAK ditebak karena cocok dengan lebih dari satu masjid', msj && !msj.usulan, msj);
  cek('pilihan kantornya hanya ULL', msj && msj.pilihan && msj.pilihan.filter((p) => !/^__/.test(p.id)).length >= 2 && msj.pilihan.filter((p) => !/^__/.test(p.id)).every((p) => p.tipe === 'ULL'), msj && msj.pilihan);
  cek('ada pilihan "Bukan kantor, masuk Daerah" di urutan pertama', msj && msj.pilihan[0] && msj.pilihan[0].id === '__DAERAH__', msj && msj.pilihan[0]);

  const tBln = temu('luarBulan');
  cek('tanggal di luar bulan berkas ditandai', tBln.length === 1 && baris_(tBln[0])[0] === idxDari(120000), tBln);
  cek('usulannya tanggal yang sama di bulan berkas', tBln[0] && tBln[0].usulan && tBln[0].usulan.tanggal === '2026-09-07', tBln[0]);

  const tPil = temu('pilarTakCocok');
  cek('ambulan di akun Pendidikan ditandai', tPil.length === 1 && baris_(tPil[0])[0] === idxDari(10000000), tPil);
  cek('usulannya pilar Kesehatan', tPil[0] && tPil[0].usulan && tPil[0].usulan.pilar === 'Kesehatan', tPil[0]);
  cek('NTT di akun Kemanusiaan tidak ditandai', !tPil.some((x) => baris_(x).indexOf(idxDari(1500000)) >= 0));

  const tRek = temu('rekeningBedaDana');
  cek('zakat masuk rekening infak ditandai', tRek.some((x) => baris_(x).indexOf(idxDari(250000)) >= 0), tRek);

  const tKcl = temu('nominalKecil');
  cek('nominal Rp 10 ditandai', tKcl.length === 1 && baris_(tKcl[0])[0] === idxDari(10), tKcl);

  const tDbl = temu('dobelDalamBerkas');
  cek('baris kembar di dalam berkas ditandai sekali, memuat dua baris', tDbl.length === 1 && tDbl[0].baris.length === 2, tDbl);

  cek('tiap temuan punya judul dan pesan yang bisa dibaca', tem.every((x) => x.judul && x.pesan && !/—/.test(x.judul + x.pesan)), tem.filter((x) => !x.judul || !x.pesan || /—/.test(x.judul + x.pesan)));
  cek('baris yang wajar tidak ditandai apa pun',
    !tem.some((x) => baris_(x).indexOf(idxDari(4130000)) >= 0 || baris_(x).indexOf(idxDari(750000)) >= 0), tem.map((x) => [x.jenis, baris_(x)]));

  console.log('\n=== C. BERKAS BANK YANG TIDAK LENGKAP ===');
  const bankSaja = [
    ['', 'PENERIMAAN ZAKAT VIA BANK', '', '', ''],
    ...pasang('2026-09-20', 'Bank Contoh Infak Umum - 1234567890', 'Penerimaan Zakat Mal', 300000, 'KLL Imogiri Zakat Maal'),
    ...pasang('2026-09-21', 'Bank Contoh Infak Umum - 1234567890', 'Penerimaan Zakat Mal', 400000, 'Donatur Ketiga Zakat Maal'),
  ];
  r = await rpc(db, 'apiParseImportText', [T, B(bankSaja), 'himpun', { bulan: '2026-09', jenis: 'bank' }]);
  const tLeng = ((r.hasil || {}).temuan || []).filter((x) => x.jenis === 'berkasTakLengkap');
  cek('berkas bank yang hanya berisi zakat ditandai tidak lengkap', tLeng.length === 1 && /ZAKAT/i.test(tLeng[0].pesan), tLeng);
  r = await rpc(db, 'apiParseImportText', [T, B(bankSaja), 'himpun']);
  cek('tanpa pilihan jenis berkas, pemeriksaan kelengkapan tidak dipaksakan',
    !((r.hasil || {}).temuan || []).some((x) => x.jenis === 'berkasTakLengkap'));

  console.log('\n=== D. NAMA LAIN (ALIAS) KANTOR DIINGAT ===');
  r = await rpc(db, 'apiSimpanAliasKantor', [TS, 'ULL Masjid', lay['Masjid Baiturrahman Aceh']]);
  cek('akun tanpa izin ubah Layanan tidak boleh menyimpan alias', !r.ok && /IZIN|izin/.test(r.galat || ''), r.galat || r.hasil);
  r = await rpc(db, 'apiSimpanAliasKantor', [T, 'ULL Masjid', 'id-tidak-ada']);
  cek('alias ke kantor yang tidak ada ditolak', !r.ok, r.hasil);
  r = await rpc(db, 'apiSimpanAliasKantor', [T, 'ULL Masjid', lay['Masjid Baiturrahman Aceh']]); db = r.db;
  cek('superadmin menyimpan alias "ULL Masjid"', r.ok, r.galat);
  r = await rpc(db, 'apiSimpanAliasKantor', [T, 'KLL Imoghiri', lay.Imogiri]); db = r.db;
  r = await rpc(db, 'apiParseImportText', [T, B(baris), 'himpun', opsi]);
  const H2 = (r.hasil || {}).himpunValid || [];
  const c2 = (n) => H2.find((x) => Math.round(x.jumlah) === n) || {};
  cek('impor berikutnya: "ULL Masjid" langsung jadi ULL Masjid Baiturrahman Aceh',
    c2(150000).layananId === lay['Masjid Baiturrahman Aceh'] && c2(150000).namaDonatur === 'ULL Masjid Baiturrahman Aceh', c2(150000));
  cek('impor berikutnya: "KLL Imoghiri" langsung jadi KLL Imogiri', c2(3000000).layananId === lay.Imogiri, c2(3000000));
  cek('keduanya tidak lagi ditandai', !((r.hasil || {}).temuan || []).some((x) => x.jenis === 'kantorTakTerdaftar'),
    ((r.hasil || {}).temuan || []).filter((x) => x.jenis === 'kantorTakTerdaftar'));
  r = await rpc(db, 'apiDaftarAliasKantor', [T]);
  cek('daftar alias bisa dilihat', r.ok && (r.hasil || []).length === 2, r.hasil || r.galat);
  r = await rpc(db, 'apiHapusAliasKantor', [T, 'ULL Masjid']); db = r.db;
  r = await rpc(db, 'apiParseImportText', [T, B(baris), 'himpun', opsi]);
  cek('alias yang dihapus tidak berlaku lagi',
    !(((r.hasil || {}).himpunValid || []).find((x) => Math.round(x.jumlah) === 150000) || {}).layananId);

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + g + ' gagal.');
  if (g) { console.log('\nJANGAN dideploy: aturan kantor atau pemeriksaan awal impor jurnal belum benar.\n'); process.exit(1); }
  console.log('\ntest_impor_berkas.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
