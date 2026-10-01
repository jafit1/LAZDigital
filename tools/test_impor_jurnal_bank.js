/* Uji impor jurnal bank (non tunai): tanggal tidak mundur, dan semua akun
 * "Penerimaan ..." terhitung sebagai penghimpunan, apa pun judul seksinya.
 *
 * KENAPA INI PERLU DIJAGA. Dua kekeliruan ini ditemukan 1 Oktober 2026 saat
 * jurnal bank Januari sampai September dibaca ulang sheet demi sheet.
 *
 * 1. TANGGAL MUNDUR SATU HARI. Berkas yang diunggah lewat tombol Impor dibaca
 *    SheetJS di peramban dengan cellDates:true. Di zona WIB, sel bertanggal
 *    1 Maret keluar sebagai objek Date pukul 23:59:48 tanggal 28 Februari
 *    (sisa selisih jam lokal historis Jakarta). app.js lalu mengambil
 *    getDate() apa adanya. Akibatnya SEMUA 2.169 baris mundur sehari, dan 86
 *    di antaranya pindah ke bulan sebelumnya, jadi rekap bulanan tidak cocok
 *    dengan jurnal. Jalur tautan Google Sheets tidak kena karena dibaca server
 *    Vercel yang berzona UTC, dan itu sebabnya kekeliruannya lama tersembunyi.
 *
 * 2. PENERIMAAN DI SEKSI YANG TIDAK DIKENAL HILANG. Seksi "PERSEDIAAN"
 *    (barang bantuan kemanusiaan yang diterima, Rp 161.947.850 dalam 7 baris)
 *    dan "TRANSAKSI BANK BDW" (Rp 3.816.635 dalam 3 baris) dilewati, padahal
 *    akun kreditnya jelas "Penerimaan Infak Terikat - ...". Sementara itu
 *    zakat fitrah beras di seksi "PENERIMAAN PERSEDIAAN" ikut dihitung, jadi
 *    barang yang satu dihitung dan yang lain tidak. Pemilik memutuskan:
 *    semua penerimaan barang dihitung penghimpunan. Total penghimpunan web
 *    kurang Rp 165.764.485 dari jurnal.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_impor_jurnal_bank.js
 */
'use strict';
process.env.TZ = 'Asia/Jakarta';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const pg = require(path.join(AKAR, 'lib', 'laz-pg.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, g = 0;
const cek = (n, s, i) => {
  if (s) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, i === undefined ? '' : String(JSON.stringify(i)).slice(0, 300)); }
};

const TOKEN = 'tok-uji-impor-bank';
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
      return keluar.result;
    } catch (e) {
      const perlu = pg.lembarDari(e);
      if (perlu) { for (const n of diminta) minta.add(n); minta.add(perlu); continue; }
      throw e;
    } finally { engine._setLambat(null); }
  }
  throw new Error('Tidak selesai setelah 24 putaran.');
}

(async () => {
  console.log('=== A. UNGGAH BERKAS DI PERAMBAN: TANGGAL TIDAK MUNDUR (zona WIB) ===');
  /* Fungsi pembaca sel diambil APA ADANYA dari src/public/app.js. */
  const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
  const awal = app.indexOf('var p2 = function(n)');
  const akhir = app.indexOf('if (typeof c === \'number\') return String(c);', awal);
  let sel = null;
  if (awal > 0 && akhir > awal) {
    const blok = app.slice(awal, app.indexOf('};', akhir) + 2);
    sel = new Function(blok + '\nreturn sel;')();
  }
  cek('fungsi pembaca sel ditemukan di app.js', typeof sel === 'function');
  let XLSX = null;
  try { XLSX = require(path.join(AKAR, 'node_modules', 'xlsx')); } catch (e) { /* lewati */ }
  const TGL = ['2026-01-01', '2026-01-31', '2026-02-28', '2026-03-01', '2026-06-30', '2026-09-30'];
  if (XLSX && sel) {
    /* Buku kerja buatan dengan sel tanggal sungguhan (tipe tanggal Excel),
       ditulis lalu dibaca ulang seperti tombol Impor membacanya. */
    /* Excel menyimpan tanggal sebagai nomor seri hari, bukan jam lokal.
       Karena itu sel ditulis sebagai nomor seri berformat tanggal, persis
       seperti berkas buatan Excel, bukan sebagai objek Date dari Node. */
    const seri = (t) => (Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
    const ws = XLSX.utils.aoa_to_sheet(TGL.map(() => ['', 'Bank Contoh', 100000, '', 'uraian']));
    TGL.forEach((t, i) => { ws['A' + (i + 1)] = { t: 'n', v: seri(t), z: 'yyyy-mm-dd' }; });
    const wb0 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb0, ws, '1');
    const buf = XLSX.write(wb0, { type: 'array', bookType: 'xlsx' });
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets['1'], { header: 1, raw: true, defval: '' });
    const hasil = aoa.map((r) => sel(r[0]));
    cek('tanggal hasil unggah sama dengan tanggal di Excel', JSON.stringify(hasil) === JSON.stringify(TGL), hasil);
  } else if (sel) {
    console.log('  (SheetJS tidak ada di node_modules, bagian buku kerja dilewati)');
  }
  if (sel) {
    /* Bentuk persis yang keluar dari SheetJS di WIB: 12 detik sebelum tengah malam. */
    cek('Date 23:59:48 terbaca sebagai hari berikutnya', sel(new Date(2026, 1, 28, 23, 59, 48)) === '2026-03-01', sel(new Date(2026, 1, 28, 23, 59, 48)));
    cek('Date tengah malam tepat tetap hari itu', sel(new Date(2026, 2, 1, 0, 0, 0)) === '2026-03-01', sel(new Date(2026, 2, 1)));
    cek('Date siang hari tetap hari itu', sel(new Date(2026, 2, 1, 14, 20, 0)) === '2026-03-01');
  }

  console.log('\n=== B. PENERIMAAN DI SEKSI LAIN TETAP TERHITUNG ===');
  const B = [
    ['', 'PENERIMAAN INFAK UMUM VIA BANK', '', '', ''],
    ['2026-01-05', 'Bank Contoh Infak - 1111111111', '250000', '', 'Infak Hamba Allah'],
    ['2026-01-05', 'Penerimaan Infak Umum', '', '250000', 'Infak Hamba Allah'],

    ['', 'PERSEDIAAN', '', '', ''],
    ['2026-01-12', 'Persediaan Barang Kemanusiaan', '7500000', '', 'Bantuan barang dari Donatur Karangan'],
    ['2026-01-12', 'Penerimaan Infak Terikat - Kemanusiaan', '', '7500000', 'Bantuan barang dari Donatur Karangan'],

    ['', 'PENERIMAAN PERSEDIAAN', '', '', ''],
    ['2026-03-20', 'Persediaan Beras Zakat Fitrah', '450000', '', 'Zakat fitrah beras Keluarga Contoh'],
    ['2026-03-20', 'Penerimaan Zakat Fitrah', '', '450000', 'Zakat fitrah beras Keluarga Contoh'],

    ['', 'TRANSAKSI BANK CONTOH', '', '', ''],
    ['2026-01-15', 'Bank Contoh Umum 2222222222', '1200000', '', 'Dana kelembagaan Mitra Karangan'],
    ['2026-01-15', 'Penerimaan Infak Terikat - Kelembagaan', '', '1200000', 'Dana kelembagaan Mitra Karangan'],
    ['2026-01-15', 'Administrasi Bank Infak', '5000', '', 'Biaya transfer'],
    ['2026-01-15', 'Bank Contoh Umum 2222222222', '', '5000', 'Biaya transfer'],
    ['2026-01-31', 'Bank Contoh Umum 2222222222', '87654', '', 'Bagi hasil Januari'],
    ['2026-01-31', 'Penerimaan Bagi Hasil Rek Infak', '', '87654', 'Bagi hasil Januari'],

    ['', 'BAGI HASIL BANK', '', '', ''],
    ['2026-01-31', 'Bank Contoh Zakat - 3333333333', '12345', '', 'Bagi hasil zakat Januari'],
    ['2026-01-31', 'Penerimaan Bagi Hasil Rek Zakat', '', '12345', 'Bagi hasil zakat Januari'],
  ];
  const TSV = B.map((r) => r.join('\t')).join('\n');
  const r = await jalankan('apiParseImportText', [TOKEN, TSV, 'himpun']);
  const H = (r && r.himpunValid) || [];
  const jml = (a) => a.reduce((s, y) => s + (Number(y.jumlah) || 0), 0);
  const cari = (n) => H.find((x) => Number(x.jumlah) === n);
  cek('dikenali sebagai jurnal', r && r.isJurnal === true);
  cek('total penghimpunan = semua akun Penerimaan di jurnal',
    jml(H) === 250000 + 7500000 + 450000 + 1200000 + 87654 + 12345, { total: jml(H), n: H.length, isi: H.map((x) => x.jumlah) });

  const brg = cari(7500000);
  cek('barang bantuan di seksi PERSEDIAAN terhitung penghimpunan', !!brg, H.map((x) => x.jumlah));
  cek('jenis dananya Infak Terikat pilar Kemanusiaan',
    brg && brg.jenisDana === 'Infak' && brg.subJenis === 'Infak Terikat' && /Kemanusiaan/i.test(brg.pilar || ''), brg);
  cek('zakat fitrah beras (PENERIMAAN PERSEDIAAN) tetap terhitung', !!cari(450000));
  const fit = cari(450000);
  cek('barang kemanusiaan dicatat dengan metode yang sama dengan zakat fitrah beras',
    brg && fit && brg.metode === fit.metode, [brg && brg.metode, fit && fit.metode]);

  const lbg = cari(1200000);
  cek('penerimaan di seksi TRANSAKSI BANK terhitung penghimpunan', !!lbg, H.map((x) => x.jumlah));
  cek('jenis dananya Infak Terikat', lbg && lbg.subJenis === 'Infak Terikat', lbg);
  cek('bagi hasil di seksi TRANSAKSI BANK terhitung penghimpunan', !!cari(87654));
  cek('bagi hasil di seksi BAGI HASIL BANK tetap terhitung', !!cari(12345));
  cek('biaya administrasi bank TIDAK ikut jadi penghimpunan', !cari(5000));
  cek('akun Penerimaan tidak terhitung dua kali', H.length === 6, H.length);

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + g + ' gagal.');
  if (g) { console.log('\nJANGAN dideploy: impor jurnal bank masih menggeser tanggal atau melewatkan penerimaan.\n'); process.exit(1); }
  console.log('\ntest_impor_jurnal_bank.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
