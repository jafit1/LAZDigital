/* Uji: kolom F jurnal bank dibaca sebagai fundraising untuk penghimpunan
 * DAN pentasyarufan. "Kantor" berarti Lazismu Daerah Bantul, nama orang
 * dipakai apa adanya (Renata, Sherli). Bila transaksi sudah ada dan yang
 * berubah hanya nama fundraising, baris lama diperbarui - bukan dilewati
 * sebagai duplikat dan bukan ditambah sebagai baris baru.
 *
 *   node tools/test_impor_fr_kolom_f.js
 */
'use strict';
process.env.TZ = 'Asia/Jakarta';
const engine = require('../api/_engine.js');
const pg = require('../lib/laz-pg.js');
const skema = require('../lib/laz-skema.js');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 400)); }
};

const TOKEN = 'tok-fr-kolom-f';
const kolom = (n) => (skema.TABEL[n].kolom || []).map((x) => x[0]);

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [kolom(n)];
  s.Users.push(['u1', 'admin', 'x', 'y', 'Admin Uji', 'superadmin', '{}', 'true', new Date().toISOString(), '']);
  /* Engine masih memakai bentuk lama (dibuat/expiredAt), bukan bentuk
     PostgreSQL (expired). Samakan dengan uji impor lainnya. */
  s.Sessions = [['token', 'userId', 'dibuat', 'expiredAt', 'ip', 'ua'],
    [TOKEN, 'u1', new Date().toISOString(), new Date(Date.now() + 864e5).toISOString(), '', '']];
  return { sheets: s, props: {} };
}

/* RPC dengan SATU database yang sama di seluruh putaran, supaya baris yang
   sudah disimpan benar-benar terbaca oleh pemanggilan berikutnya. */
let DB = dbBaru();
async function rpc(fn, args) {
  const minta = new Set(pg._internal.DASAR);
  for (let putaran = 1; putaran <= 30; putaran++) {
    const diminta = [];
    engine._setLambat({
      lengkap: new Set(minta),
      jumlah: {},
      diminta,
      minta(n) { if (!diminta.includes(n)) diminta.push(n); throw new pg.PerluLembar(n); },
    });
    try {
      const keluar = await engine.runRPC(DB, fn, args, {});
      if (diminta.length) { for (const n of diminta) minta.add(n); continue; }
      return keluar.result;
    } catch (e) {
      const perlu = pg.lembarDari(e);
      if (perlu) { for (const n of diminta) minta.add(n); minta.add(perlu); continue; }
      throw e;
    } finally { engine._setLambat(null); }
  }
  throw new Error('RPC tidak selesai.');
}

/* rpc() di atas sengaja mengulang saat ada lembar baru diminta supaya hasil
   parse lengkap. Untuk penyimpanan, mengulang berarti menyisipkan dua kali,
   jadi pakai rpcSekali(): hanya mengulang bila benar-benar ada PerluLembar. */
async function rpcSekali(fn, args) {
  const minta = new Set(pg._internal.DASAR);
  for (let putaran = 1; putaran <= 30; putaran++) {
    const diminta = [];
    engine._setLambat({
      lengkap: new Set(minta),
      jumlah: {},
      diminta,
      minta(n) { if (!diminta.includes(n)) diminta.push(n); throw new pg.PerluLembar(n); },
    });
    try {
      const keluar = await engine.runRPC(DB, fn, args, {});
      return keluar.result;
    } catch (e) {
      const perlu = pg.lembarDari(e);
      if (perlu) { for (const n of diminta) minta.add(n); minta.add(perlu); continue; }
      throw e;
    } finally { engine._setLambat(null); }
  }
  throw new Error('RPC sekali tidak selesai.');
}

function tsv(baris) { return baris.map((r) => r.join('\t')).join('\n'); }

const CONTOH = tsv([
  ['', 'PENERIMAAN ZAKAT VIA BANK', '', '', '', ''],
  ['2026-11-01', 'BCA Syariah Zakat - 0469900880', '500000', '', 'Ahmad Solikin Zakat Mall', 'Kantor'],
  ['2026-11-01', 'Penerimaan Zakat Mal', '', '500000', 'Ahmad Solikin Zakat Mall'],
  ['2026-11-02', 'BPD DIY Syariah - 803211000511', '466000', '', 'Kll Banguntapan Utara Zakat Maal', 'Kantor'],
  ['2026-11-02', 'Penerimaan Zakat Mal', '', '466000', 'Kll Banguntapan Utara Zakat Maal'],

  ['', 'PENERIMAAN INFAK UMUM VIA BANK', '', '', '', ''],
  ['2026-11-01', 'BPD DIY Syariah - 803211000510', '100000', '', 'NN Qris Bank Mandiri Infak Umum', 'Renata'],
  ['2026-11-01', 'Penerimaan Infak Umum', '', '100000', 'NN Qris Bank Mandiri Infak Umum'],
  ['2026-11-02', 'BSI Infak Umum - 1011959004', '100000', '', 'Nuarista Indah Safitri Infak Umum', 'Sherli'],
  ['2026-11-02', 'Penerimaan Infak Umum', '', '100000', 'Nuarista Indah Safitri Infak Umum'],

  ['', 'PENYALURAN INFAK UMUM', '', '', '', ''],
  ['2026-11-03', 'Penyaluran Infak - Sosial', '250000', '', 'Bantuan contoh warga', 'Renata'],
  ['2026-11-03', 'BPD DIY Syariah - 803211000510', '', '250000', 'Bantuan contoh warga'],
]);

function sisip(tabel, obj) {
  const h = kolom(tabel);
  DB.sheets[tabel].push(h.map((k) => (obj[k] === undefined ? '' : obj[k])));
}

(async () => {
  console.log('=== A. KOLOM F DIBACA SEBAGAI FUNDRAISING ===');
  let r = await rpc('apiParseImportText', [TOKEN, CONTOH, 'himpun', { bulan: '2026-11', jenis: 'bank' }]);
  const H = (r && r.himpunValid) || [];
  const S = (r && r.salurValid) || [];
  cek('jurnal dikenali', r && r.isJurnal === true);
  cek('penghimpunan terbaca semua (4 baris)', H.length === 4, H.map((x) => [x.jumlah, x.fundraising]));

  const cari = (n) => H.find((x) => Number(x.jumlah) === n);
  cek('F "Kantor" → Lazismu Daerah Bantul (zakat)', cari(500000) && cari(500000).fundraising === 'Lazismu Daerah Bantul', cari(500000) && cari(500000).fundraising);
  cek('F "Kantor" pada baris KLL juga → Lazismu Daerah Bantul', cari(466000) && cari(466000).fundraising === 'Lazismu Daerah Bantul', cari(466000) && cari(466000).fundraising);
  cek('F "Renata" dipakai apa adanya', cari(100000) && cari(100000).fundraising === 'Renata', cari(100000) && cari(100000).fundraising);
  cek('F "Sherli" dipakai apa adanya', cari(100000) === undefined || H.filter((x) => x.fundraising === 'Sherli').length === 1, H.map((x) => x.fundraising));

  const sal = S.find((x) => Number(x.jumlah) === 250000);
  cek('pentasyarufan terbaca', !!sal, S.map((x) => [x.jumlah, x.keterangan]));
  cek('F "Renata" ikut terbaca di pentasyarufan', sal && sal.fundraising === 'Renata', sal && sal.fundraising);

  console.log('\n=== B. GANTI NAMA FR SAJA: BARIS LAMA DIUPDATE, TIDAK DOBEL ===');
  /* Simpan dulu keadaan awal: FR Renata untuk baris 250rb. */
  await rpcSekali('apiSaveImportedData', [TOKEN, [sal], 'salur']);
  const sebelum = DB.sheets.Pentasyarufan.slice(1);
  cek('baris awal tersimpan', sebelum.length === 1, sebelum.length);

  /* Berkas baru: sama persis, cuma kolom F diganti Sherli. */
  const diubah = tsv([
    ['', 'PENERIMAAN INFAK UMUM VIA BANK', '', '', '', ''],
    ['2026-11-01', 'BPD DIY Syariah - 803211000510', '100000', '', 'Penerimaan penyeimbang', 'Renata'],
    ['2026-11-01', 'Penerimaan Infak Umum', '', '100000', 'Penerimaan penyeimbang'],
    ['', 'PENYALURAN INFAK UMUM', '', '', '', ''],
    ['2026-11-03', 'Penyaluran Infak - Sosial', '250000', '', 'Bantuan contoh warga', 'Sherli'],
    ['2026-11-03', 'BPD DIY Syariah - 803211000510', '', '250000', 'Bantuan contoh warga'],
  ]);
  r = await rpc('apiParseImportText', [TOKEN, diubah, 'himpun', { bulan: '2026-11', jenis: 'bank' }]);
  const S2 = (r && r.salurValid) || [];
  const ubah = S2.find((x) => Number(x.jumlah) === 250000);
  cek('baris dengan FR berubah tidak ditandai duplikat', ubah && !ubah.isDuplicate, ubah);
  cek('baris diberi penanda update', ubah && ubah._frBerubah === true && !!ubah._frUpdateId, ubah && [ubah._frBerubah, ubah._frUpdateId]);
  cek('nama FR lama ikut dikirim ke layar', ubah && ubah._frLama === 'Renata', ubah && ubah._frLama);

  const simpan = await rpcSekali('apiSaveImportedData', [TOKEN, [ubah], 'salur']);
  const sesudah = DB.sheets.Pentasyarufan.slice(1);
  cek('tidak ada baris baru', sesudah.length === 1, sesudah.length);
  cek('id baris tetap', sesudah[0] && sesudah[0][0] === sebelum[0][0], [sesudah[0] && sesudah[0][0], sebelum[0] && sebelum[0][0]]);
  cek('no bukti tetap', sesudah[0] && sesudah[0][1] === sebelum[0][1], [sesudah[0] && sesudah[0][1], sebelum[0] && sesudah[0][1]]);
  cek('fundraising berubah jadi Sherli', sesudah[0] && sesudah[0][kolom('Pentasyarufan').indexOf('fundraising')] === 'Sherli', sesudah[0] && sesudah[0][kolom('Pentasyarufan').indexOf('fundraising')]);
  cek('laporan menyebut 1 FR diperbarui', simpan && simpan.frDiupdate === 1 && simpan.count === 0, simpan);

  /* Berkas ketiga: FR sama dengan yang sekarang → benar-benar duplikat. */
  r = await rpc('apiParseImportText', [TOKEN, tsv([
    ['', 'PENERIMAAN INFAK UMUM VIA BANK', '', '', '', ''],
    ['2026-11-01', 'BPD DIY Syariah - 803211000510', '100000', '', 'Penerimaan penyeimbang', 'Renata'],
    ['2026-11-01', 'Penerimaan Infak Umum', '', '100000', 'Penerimaan penyeimbang'],
    ['', 'PENYALURAN INFAK UMUM', '', '', '', ''],
    ['2026-11-03', 'Penyaluran Infak - Sosial', '250000', '', 'Bantuan contoh warga', 'Sherli'],
    ['2026-11-03', 'BPD DIY Syariah - 803211000510', '', '250000', 'Bantuan contoh warga'],
  ]), 'salur', { bulan: '2026-11', jenis: 'bank' }]);
  const dobel = ((r && r.salurValid) || [])[0];
  cek('FR sama tetap ditandai duplikat biasa', dobel && dobel.isDuplicate === true && !dobel._frBerubah, dobel);

  console.log('\n=== C. HAL YANG SAMA PADA PENGHIMPUNAN ===');
  const him = H.find((x) => Number(x.jumlah) === 500000);
  await rpcSekali('apiSaveImportedData', [TOKEN, [him], 'himpun']);
  const HDB1 = DB.sheets.Penghimpunan.slice(1);
  cek('penghimpunan awal tersimpan', HDB1.length === 1, HDB1.length);
  r = await rpc('apiParseImportText', [TOKEN, tsv([
    ['', 'PENERIMAAN ZAKAT VIA BANK', '', '', '', ''],
    ['2026-11-01', 'BCA Syariah Zakat - 0469900880', '500000', '', 'Ahmad Solikin Zakat Mall', 'Renata'],
    ['2026-11-01', 'Penerimaan Zakat Mal', '', '500000', 'Ahmad Solikin Zakat Mall'],
    ['', 'PENERIMAAN INFAK UMUM VIA BANK', '', '', '', ''],
    ['2026-11-02', 'BPD DIY Syariah - 803211000510', '75000', '', 'Donatur tambahan', 'Renata'],
    ['2026-11-02', 'Penerimaan Infak Umum', '', '75000', 'Donatur tambahan'],
  ]), 'himpun', { bulan: '2026-11', jenis: 'bank' }]);
  const him2 = ((r && r.himpunValid) || [])[0];
  cek('perubahan FR penghimpunan tidak dianggap duplikat', him2 && !him2.isDuplicate && !!him2._frUpdateId, him2);
  await rpcSekali('apiSaveImportedData', [TOKEN, [him2], 'himpun']);
  const HDB2 = DB.sheets.Penghimpunan.slice(1);
  cek('penghimpunan tidak bertambah', HDB2.length === 1, HDB2.length);
  cek('FR penghimpunan jadi Renata', HDB2[0] && HDB2[0][kolom('Penghimpunan').indexOf('fundraising')] === 'Renata', HDB2[0] && HDB2[0][kolom('Penghimpunan').indexOf('fundraising')]);

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_impor_fr_kolom_f.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
