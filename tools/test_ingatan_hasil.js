/* tools/test_ingatan_hasil.js: hasil bacaan buku besar yang diingat (lib/laz-pg.js).
 *
 * KELUHAN PEMILIK (2 Oktober 2026): "web jadi lemot atau delay". Diukur di data
 * tiruan 15.000 penghimpunan: Dashboard 585 ms, Donatur 519 ms, Saldo KLL 357 ms,
 * Saldo 263 ms, daftar Penghimpunan 212 ms, dan itu di laptop tanpa jarak
 * jaringan. Semuanya dihitung ulang tiap halaman dibuka walau tidak ada yang
 * berubah. Sekarang hasilnya diingat dan dijaga penanda isi buku besar.
 *
 * Karena ini angka uang, yang diuji bukan cuma "cepat" tetapi "tidak pernah
 * basi dan tidak pernah melewati izin":
 *   1. bacaan kedua memang tidak memuat tabel transaksi (kecepatannya nyata);
 *   2. hasil yang diingat SAMA PERSIS dengan hasil yang dihitung ulang;
 *   3. satu penulisan (catat penerimaan) langsung menggugurkan ingatan: tidak basi;
 *   4. penulis dari luar yang tidak tahu penanda (instance lama) pun menggugurkan;
 *   5. sesi yang kedaluwarsa tidak dilayani dari ingatan (token diperiksa tiap kali);
 *   6. pengguna tanpa izin tidak mendapat hasil orang lain;
 *   7. catatan "siapa membuka apa" tetap tertulis dan tidak menggugurkan ingatan;
 *   8. jawaban mentah untuk api/rpc.js utuh, dan memori ingatan dibatasi.
 *
 * Perlu PostgreSQL percobaan di komputer ini:
 *   node tools/test_ingatan_hasil.js --alamat "postgres://postgres@127.0.0.1:5432/laz_uji"
 * atau UJI_DATABASE_URL. SELURUH ISI SKEMA public DIHAPUS lebih dulu.
 */
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Jakarta';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const arg = process.argv.slice(2);
const opsi = (n, b) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : b; };
const ALAMAT = opsi('--alamat', process.env.UJI_DATABASE_URL || '');
if (!ALAMAT) {
  console.log('  DILEWATI: perlu PostgreSQL untuk percobaan (UJI_DATABASE_URL atau --alamat).');
  process.exit(2);
}
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(ALAMAT)) {
  console.error('  DITOLAK: alamatnya bukan komputer ini. Uji ini menghapus seluruh isi skema public.');
  process.exit(1);
}
process.env.DATABASE_URL = ALAMAT;
process.env.SETUP_ADMIN_PASSWORD = 'SandiUji#2026';
let Client;
try { ({ Client } = require('pg')); } catch (e) { console.error('npm install pg'); process.exit(2); }

const jejak = [];
let rekam = false;
const queryAsli = Client.prototype.query;
Client.prototype.query = function (...a) {
  if (rekam) jejak.push(String(typeof a[0] === 'string' ? a[0] : (a[0] && a[0].text) || ''));
  return queryAsli.apply(this, a);
};

const engine = require(path.join(AKAR, 'api', '_engine.js'));
const lazpg = require(path.join(AKAR, 'lib', 'laz-pg.js'));

let lulus = 0, gagal = 0;
function cek(nama, benar, tambahan) {
  if (benar) { lulus++; console.log('  ok    | ' + nama); return true; }
  gagal++; console.log('  GAGAL | ' + nama + (tambahan !== undefined ? '\n          ' + String(JSON.stringify(tambahan)).slice(0, 300) : ''));
  return false;
}
async function sql(teks, nilai) {
  const k = new Client({ connectionString: ALAMAT });
  await k.connect();
  try { return (await k.query(teks, nilai)).rows; } finally { await k.end(); }
}
const rpc = (fn, args, ctx) => lazpg.jalankanRPC(engine, fn, args, ctx || {});
/* Hanya pemuatan ISI tabel transaksi yang dihitung; kueri penghitung baris
   menyebut semua nama tabel dalam satu pernyataan. */
const memuatTransaksi = () => jejak.some((s) => /SELECT \* FROM "(Penghimpunan|Pentasyarufan)"/.test(s));
async function dihitung(fn, args, ctx) {
  jejak.length = 0; rekam = true;
  const hasil = await rpc(fn, args, ctx);
  rekam = false;
  return { hasil, jumlahKueri: jejak.length, muatTransaksi: memuatTransaksi() };
}
const himpunan = (nama, jumlah, tgl) => ({
  tanggal: tgl || '2026-04-01', jenisDana: 'Zakat', subJenis: 'Fitrah', pilar: '', program: '',
  namaDonatur: nama, tipeDonatur: 'Perorangan', layananId: '', telepon: '', email: '', alamat: '',
  jumlah, metode: 'Cash', rekeningId: '', bank: '', statusBayar: 'Lunas', atasNama: '', keterangan: '', fundraising: '',
});

(async () => {
  const k = new Client({ connectionString: ALAMAT });
  await k.connect();
  await k.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await k.query(fs.readFileSync(path.join(AKAR, 'sql', '01-skema.sql'), 'utf8'));
  await k.query(fs.readFileSync(path.join(AKAR, 'sql', '02-keamanan.sql'), 'utf8'));
  await k.end();

  await rpc('setup', []);
  const masuk = await rpc('login', ['superadmin', 'SandiUji#2026']);
  const T = masuk.token;
  await rpc('apiSavePenghimpunan', [T, himpunan('Donatur Satu', 100000)]);
  await rpc('apiSavePenghimpunan', [T, himpunan('Donatur Dua', 250000)]);
  lazpg.lupakanIngatan();

  console.log('\n================ 1. KECEPATAN NYATA ================');
  /* Pemanasan: panggilan pertama menulis catatan akses (menggeser nomor versi),
     jadi hasil baru bisa diingat sesudahnya. */
  const a1 = await dihitung('apiDashboard', [T, '', '', '']);
  const a2 = await dihitung('apiDashboard', [T, '', '', '']);
  const a3 = await dihitung('apiDashboard', [T, '', '', '']);
  cek('panggilan pertama memuat tabel transaksi', a1.muatTransaksi);
  cek('panggilan yang sudah diingat TIDAK memuat tabel transaksi', !a3.muatTransaksi, jejak.slice(0, 3));
  cek('panggilan yang sudah diingat cukup satu kueri', a3.jumlahKueri <= 2, a3.jumlahKueri);

  console.log('\n================ 2. SAMA PERSIS DENGAN HITUNG ULANG ================');
  const daftar = [
    ['apiDashboard', [T, '', '', '']], ['apiListPenghimpunan', [T]], ['apiListPentasyarufan', [T]],
    ['apiSaldo', [T, '']], ['apiSaldoLayanan', [T]], ['apiGetDonaturAnalytics', [T]],
    ['apiListDonatur', [T]], ['apiGetRAPBData', [T, 2026]], ['apiLaporanHarian', [T, '2026-04-01']],
  ];
  for (const [fn, args] of daftar) {
    await rpc(fn, args); await rpc(fn, args);
    const diingat = await rpc(fn, args);
    lazpg.lupakanIngatan();
    const segar = await rpc(fn, args);
    cek(fn + ': hasil yang diingat sama persis dengan hitung ulang', JSON.stringify(diingat) === JSON.stringify(segar));
  }

  console.log('\n================ 3. PENULISAN MENGGUGURKAN INGATAN ================');
  await rpc('apiListPenghimpunan', [T]); await rpc('apiListPenghimpunan', [T]);
  const sebelum = (await rpc('apiListPenghimpunan', [T])).length;
  await rpc('apiSavePenghimpunan', [T, himpunan('Donatur Tiga', 75000, '2026-04-02')]);
  const sesudah = await dihitung('apiListPenghimpunan', [T]);
  cek('catat penerimaan baru: daftar langsung bertambah (tidak basi)', sesudah.hasil.length === sebelum + 1, [sebelum, sesudah.hasil.length]);
  cek('dan dihitung dari basis data, bukan dari ingatan', sesudah.muatTransaksi);
  const dash0 = await rpc('apiSaldo', [T, '']); await rpc('apiSaldo', [T, '']);
  await rpc('apiSavePenghimpunan', [T, himpunan('Donatur Empat', 1000, '2026-04-03')]);
  const dash1 = await rpc('apiSaldo', [T, '']);
  cek('saldo ikut berubah setelah penerimaan baru', JSON.stringify(dash0) !== JSON.stringify(dash1));

  /* Penanda isi harus acak: nomor versi berulang kalau basis data dibuat ulang
     dari kosong, dan ingatan proses yang masih hidup akan mengira isi baru sama
     dengan isi lama. Tanpa ini test_laz_pg.js gagal 7 pemeriksaan (dasbor dan
     daftar dilayani dari ingatan skenario sebelumnya yang tokennya kebetulan sama). */
  const c1 = JSON.parse((await sql(`SELECT nilai FROM kv WHERE kunci='laz:cver'`))[0].nilai).c;
  await rpc('apiSavePenghimpunan', [T, himpunan('Donatur Lima', 2000, '2026-04-04')]);
  const c2 = JSON.parse((await sql(`SELECT nilai FROM kv WHERE kunci='laz:cver'`))[0].nilai).c;
  cek('penanda isi bukan nomor versi (tidak berulang saat basis data dibuat ulang)', !/^\d+$/.test(c1) && !/^\d+$/.test(c2), [c1, c2]);
  cek('setiap perubahan isi menghasilkan penanda baru', c1 !== c2, [c1, c2]);

  console.log('\n================ 4. PENULIS TANPA PENANDA (INSTANCE LAMA) ================');
  await rpc('apiListPenghimpunan', [T]); await rpc('apiListPenghimpunan', [T]);
  const n0 = (await rpc('apiListPenghimpunan', [T])).length;
  /* Penulis lama: mengubah data dan menaikkan nomor versi, tanpa menyentuh laz:cver. */
  await sql(`UPDATE "Penghimpunan" SET "namaDonatur"='Diubah Penulis Lama' WHERE "id" = (SELECT "id" FROM "Penghimpunan" LIMIT 1)`);
  await sql(`UPDATE kv SET nilai=(nilai::int+1)::text WHERE kunci='laz:ver'`);
  const n1 = await rpc('apiListPenghimpunan', [T]);
  cek('perubahan dari penulis lama langsung terlihat', n1.some((r) => r.namaDonatur === 'Diubah Penulis Lama') && n1.length === n0);

  console.log('\n================ 5. SESI KEDALUWARSA TIDAK DILAYANI ================');
  await rpc('apiSaldo', [T, '']); await rpc('apiSaldo', [T, '']);
  const ok0 = await dihitung('apiSaldo', [T, '']);
  cek('(sebelumnya) hasil diingat dan dilayani', !ok0.muatTransaksi);
  const sesiBiasa = await rpc('login', ['superadmin', 'SandiUji#2026']);
  await rpc('apiSaldo', [sesiBiasa.token, '']); await rpc('apiSaldo', [sesiBiasa.token, '']);
  await sql(`UPDATE "Sessions" SET "expired" = now() - interval '1 hour'`);   // tanpa menaikkan versi
  let galat = '';
  try { await rpc('apiSaldo', [sesiBiasa.token, '']); } catch (e) { galat = e.message; }
  cek('token yang sudah kedaluwarsa ditolak walau hasilnya masih diingat', /AUTH/.test(galat), galat);

  console.log('\n================ 6. IZIN TIDAK BOCOR ================');
  const T2 = (await rpc('login', ['superadmin', 'SandiUji#2026'])).token;
  const izinMinim = {};
  await rpc('apiSaveUser', [T2, { username: 'amil.uji', nama: 'Amil Uji', role: 'staff', password: 'SandiUji#2026', aktif: true, permissions: izinMinim }]);
  const amil = await rpc('login', ['amil.uji', 'SandiUji#2026']);
  await rpc('apiSaldo', [T2, '']); await rpc('apiSaldo', [T2, '']);
  let tolak = '';
  try { await rpc('apiSaldo', [amil.token, '']); } catch (e) { tolak = e.message; }
  cek('pengguna tanpa izin ditolak walau hasil orang lain sedang diingat', /IZIN/.test(tolak), tolak);
  // izin dicabut sesudah hasil diingat
  const izinSaldo = { saldo: { view: true } };
  await rpc('apiSaveUser', [T2, { id: amil.user.id, username: 'amil.uji', nama: 'Amil Uji', role: 'staff', aktif: true, permissions: izinSaldo }]);
  const amil2 = await rpc('login', ['amil.uji', 'SandiUji#2026']);
  await rpc('apiSaldo', [amil2.token, '']); await rpc('apiSaldo', [amil2.token, '']);
  const masihBisa = await dihitung('apiSaldo', [amil2.token, '']);
  cek('pengguna berizin dilayani dari ingatan', !masihBisa.muatTransaksi && masihBisa.hasil != null);
  await rpc('apiSaveUser', [T2, { id: amil.user.id, username: 'amil.uji', nama: 'Amil Uji', role: 'staff', aktif: true, permissions: {} }]);
  let dicabut = '';
  try { await rpc('apiSaldo', [amil2.token, '']); } catch (e) { dicabut = e.message; }
  cek('izin dicabut: langsung ditolak, tidak dilayani dari ingatan', /IZIN/.test(dicabut), dicabut);

  console.log('\n================ 7. CATATAN "SIAPA MEMBUKA APA" ================');
  const T3 = (await rpc('login', ['superadmin', 'SandiUji#2026'])).token;
  await rpc('apiSaldo', [T3, '']); await rpc('apiSaldo', [T3, '']); await rpc('apiSaldo', [T3, '']);
  const logAwal = Number((await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "aksi"='buka_saldo'`))[0].n);
  // hapus catatan waktu supaya "sudah waktunya" mencatat lagi
  await sql(`UPDATE kv SET nilai = (nilai::jsonb - '_aksesTerakhir')::text WHERE kunci='laz:props'`);
  const ver0 = (await sql(`SELECT nilai FROM kv WHERE kunci='laz:ver'`))[0].nilai;
  const hit = await dihitung('apiSaldo', [T3, '']);
  const logAkhir = Number((await sql(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "aksi"='buka_saldo'`))[0].n);
  const ver1 = (await sql(`SELECT nilai FROM kv WHERE kunci='laz:ver'`))[0].nilai;
  cek('jawaban dari ingatan tetap menulis catatan akses saat sudah waktunya', logAkhir === logAwal + 1, [logAwal, logAkhir]);
  cek('(dan tidak memuat tabel transaksi)', !hit.muatTransaksi);
  cek('catatan akses menaikkan nomor versi', Number(ver1) === Number(ver0) + 1, [ver0, ver1]);
  const lagi = await dihitung('apiSaldo', [T3, '']);
  cek('tetapi ingatan hasil tidak gugur karenanya', !lagi.muatTransaksi);
  // membuka halaman lain (catatan akses baru) tidak menggugurkan hasil lain
  await rpc('apiListPentasyarufan', [T3]);
  const masihSaldo = await dihitung('apiSaldo', [T3, '']);
  cek('membuka halaman lain tidak menggugurkan ingatan Saldo', !masihSaldo.muatTransaksi);

  console.log('\n================ 8. JAWABAN MENTAH & BATAS MEMORI ================');
  await rpc('apiListPenghimpunan', [T3]); await rpc('apiListPenghimpunan', [T3]);
  const mentah = await rpc('apiListPenghimpunan', [T3], { izinMentah: true });
  cek('izinMentah: jawaban berupa JsonMentah', mentah instanceof lazpg.JsonMentah);
  let urai = null; try { urai = JSON.parse('{"result":' + mentah.teks + '}'); } catch (e) {}
  cek('teks mentahnya JSON utuh dan berisi daftar', urai && Array.isArray(urai.result) && urai.result.length >= 3);
  const biasa = await rpc('apiListPenghimpunan', [T3]);
  cek('tanpa izinMentah: jawaban berupa data biasa', Array.isArray(biasa));
  /* Lewat api/rpc.js sungguhan: jawaban yang diingat harus tetap {"result": ...} yang utuh. */
  const rpcHandler = require(path.join(AKAR, 'api', 'rpc.js'));
  const panggil = async (fn, args) => {
    const res = { kode: 0, tajuk: {}, badan: null, statusCode: 0 };
    res.status = (k) => { res.kode = k; return res; };
    res.json = (o) => { res.badan = JSON.stringify(o); };
    res.setHeader = (k, v) => { res.tajuk[k.toLowerCase()] = v; };
    res.end = (t) => { res.badan = t; res.kode = res.kode || res.statusCode; };
    await rpcHandler({ method: 'POST', body: { fn, args }, headers: {}, socket: {} }, res);
    return res;
  };
  await panggil('apiListPenghimpunan', [T3]);
  const lewatRpc = await panggil('apiListPenghimpunan', [T3]);
  let badan = null; try { badan = JSON.parse(lewatRpc.badan); } catch (e) {}
  cek('api/rpc.js: bacaan yang diingat dijawab 200 dengan {"result":[...]}', lewatRpc.kode === 200 && badan && Array.isArray(badan.result) && badan.result.length >= 3, [lewatRpc.kode, String(lewatRpc.badan).slice(0, 80)]);
  cek('api/rpc.js: Content-Type JSON', /application\/json/.test(lewatRpc.tajuk['content-type'] || ''), lewatRpc.tajuk);
  const salahToken = await panggil('apiListPenghimpunan', ['token-ngawur']);
  cek('api/rpc.js: token ngawur tetap dijawab galat AUTH', /AUTH/.test(String(salahToken.badan)), String(salahToken.badan).slice(0, 80));
  const st = lazpg._internal.ingatan();
  cek('memori ingatan terhitung dan di bawah batas', st.huruf > 0 && st.huruf <= 48e6, st);
  cek('hanya fungsi baca murni yang diingat (tidak ada fungsi tulis)', !Object.keys(lazpg._internal.BACA).some((f) => /Save|Delete|Hapus|Import|Login|Reset|Pulih/i.test(f)), Object.keys(lazpg._internal.BACA));

  console.log('\n  ' + lulus + ' lulus, ' + gagal + ' gagal');
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
