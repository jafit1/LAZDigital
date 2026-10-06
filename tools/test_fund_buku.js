/* Uji Fundraising langsung ke buku utama (6 Oktober 2026).
 *
 * Permintaan pemilik: input pengambilan donatur di Fundraising langsung masuk ke sistem utama (Penghimpunan), dengan
 * pilihan Infak Umum / Infak Terikat dan pilar, lalu kwitansi + ucapan terima kasih bisa dikirim ke WhatsApp.
 * Yang dijaga:
 *  A. Catatan lapangan (ambil.catat dengan jenisDana) menulis SATU baris Penghimpunan: jenis, detail, pilar, jumlah,
 *     metode, nama fundraising dari profil fundraiser (kunci pencocokan), dan langsung bertanda cocok (cap "Langsung").
 *  B. Aman diulang: menulis ulang catatan yang sama tidak menggandakan uang.
 *  C. Validasi: dana terikat wajib pilar, jenis/detail harus dari master data, nominal sah.
 *  D. Izin: penggalang hanya punya izin Fundraising, tidak bisa membuka daftar Penghimpunan; memalsukan nama
 *     fundraising lewat panggilan langsung diabaikan; kwitansi hanya untuk baris Fundraising miliknya.
 *  E. Kirim kwitansi WA dari Fundraising: lewat mesin Broadcast yang sama, hanya untuk catatannya sendiri.
 *  F. Master data sama dengan buku utama (app.js dan engine), supaya tidak melenceng diam-diam.
 * jalankan:  node tools/test_fund_buku.js
 */
'use strict';
require('./_pagar-db.js')('Uji Fundraising ke buku utama');
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(require('./_folder-data.js')(AKAR), { recursive: true, force: true });
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';

/* api/rpc.js menaruh buku besar lokal di <cwd>/data/laz-db-local.json, tempat bersama seluruh proyek. Dimuat dari folder
   sementara supaya uji ini tidak berbenturan dengan uji lain atau data yang tersisa dari jalan sebelumnya. */
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'laz-fund-buku-'));
process.chdir(TMP);
const rpc = require('../api/rpc.js');
process.chdir(AKAR);
const fund = require('../api/fund.js');
const blastDb = require('../lib/blast/db');
const himpunanLib = require('../lib/fund/himpunan.js');
const akunLib = require('../lib/fund/akun.js');
const donaturLib = require('../lib/fund/donatur.js');

let ok = 0, g = 0;
const cek = (n, s, info) => { if (s) { ok++; console.log('  OK   |', n); } else { g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); } };

/* Panggil api/rpc.js seperti peramban. */
function panggil(fn, args) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, setHeader() {}, status(k) { this.statusCode = k; return this; }, json(o) { resolve(o); }, end(t) { try { resolve(JSON.parse(t)); } catch (_) { resolve({ __error: 'x' }); } } };
    rpc({ method: 'POST', headers: {}, socket: {}, body: { fn, args } }, res);
  });
}
const hasil = async (fn, args) => { const o = await panggil(fn, args); if (o.__error) throw new Error(o.__error); return o.result; };
const galatRpc = async (fn, args) => { const o = await panggil(fn, args); return o.__error || ''; };

const sesi = require('../lib/fund/sesi-laz.js');
function penggunaDari(user, token) {
  return { id: user.id, nama: user.nama, username: user.username, peran: 'penggalang', kantor: '', _laz: user, __token: token };
}
const REQ = (token) => ({ headers: { host: 'uji.test', 'x-laz-token': token }, socket: {}, body: { token } });
async function jalan(nama, data, p) { return fund.tindakan[nama].jalankan({ data: data || {}, pengguna: p, req: REQ(p.__token), res: {} }); }
async function tolak(nama, data, p) { try { await jalan(nama, data, p); return ''; } catch (e) { return e.message || String(e); } }
const HARI = require('../lib/fund/util.js').tglLokal();

(async () => {
  await panggil('setup', []);
  const adm = await hasil('login', ['superadmin', 'Admin12345']);
  const TA = adm.token;
  const izinFr = { fundraising: { view: true, create: true, edit: false, delete: false } };
  await hasil('apiSaveUser', [TA, { username: 'frani', password: 'Rahasia123', nama: 'Rani Penggalang', role: 'staff', aktif: 'true', permissions: izinFr }]);
  await hasil('apiSaveUser', [TA, { username: 'frdua', password: 'Rahasia123', nama: 'Dua Penggalang', role: 'staff', aktif: 'true', permissions: izinFr }]);
  const l1 = await hasil('login', ['frani', 'Rahasia123']);
  const l2 = await hasil('login', ['frdua', 'Rahasia123']);
  const U1 = penggunaDari(Object.assign({ permissions: izinFr }, l1.user), l1.token);
  const U2 = penggunaDari(Object.assign({ permissions: izinFr }, l2.user), l2.token);
  await akunLib.simpanAkun(U1, { namaFundraising: 'Tim Bantul Kota' });
  const lokasi = { lat: -7.88, lng: 110.33, alamat: 'Bantul' };
  const budi = (await jalan('donatur.simpan', { nama: 'Budi Contoh', telepon: '0812 1111 0001', lokasi }, U1)).donatur;
  const baris = async () => (await hasil('apiListPenghimpunan', [TA])).filter((r) => /\(h_/.test(r.keterangan || ''));

  console.log('=== A. CATATAN LAPANGAN MASUK BUKU UTAMA ===');
  const a = await jalan('ambil.catat', { donaturId: budi.id, jumlah: 250000, jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Kesehatan', metode: 'Tunai', catatan: 'minta kwitansi', tanggal: HARI }, U1);
  cek('galat buku kosong dan baris buku dikembalikan', !a.galatBuku && a.buku && a.buku.noKwitansi, a);
  let br = await baris();
  cek('tepat satu baris Penghimpunan lahir', br.length === 1, br.length);
  const r = br[0] || {};
  cek('jenis, detail, pilar, jumlah sesuai pilihan', r.jenisDana === 'Infak' && r.subJenis === 'Infak Terikat' && r.pilar === 'Kesehatan' && Number(r.jumlah) === 250000, r);
  cek('metode Tunai menjadi Cash/Tunai, donatur dan nomor ikut', r.metode === 'Cash/Tunai' && r.namaDonatur === 'Budi Contoh' && /6281211110001|0812/.test(r.telepon), r);
  cek('fundraising memakai nama dari profil fundraiser (kunci pencocokan)', r.fundraising === 'Tim Bantul Kota' && a.rec.fundraising === 'Tim Bantul Kota', [r.fundraising, a.rec.fundraising]);
  cek('petugas tercatat penggalang, nomor kwitansi terbentuk', r.petugas === 'Rani Penggalang' && /^KW\//.test(r.noKwitansi || ''), [r.petugas, r.noKwitansi]);
  cek('catatan lapangan langsung cocok dan bercap Langsung (bukan otomatis)', a.rec.cocok.sudah && a.rec.cocok.langsung && a.rec.cocok.oleh === 'Langsung' && a.rec.cocok.otomatis === false && a.rec.cocok.ref === r.noKwitansi, a.rec.cocok);
  cek('peruntukan di Fundraising menampilkan detail dan pilar', a.rec.peruntukan === 'Infak Terikat · Kesehatan', a.rec.peruntukan);
  const umum = await jalan('ambil.catat', { donaturId: budi.id, jumlah: 50000, jenisDana: 'Infak', subJenis: 'Infak Umum', metode: 'QRIS', tanggal: HARI }, U1);
  const ru = (await baris()).find((x) => x.noKwitansi === umum.buku.noKwitansi) || {};
  cek('Infak Umum tanpa pilar, metode QRIS', ru.subJenis === 'Infak Umum' && !ru.pilar && ru.metode === 'QRIS', ru);
  const zk = await jalan('ambil.catat', { donaturId: budi.id, jumlah: 100000, jenisDana: 'Zakat', subJenis: 'Zakat Mal', metode: 'Transfer', tanggal: HARI }, U1);
  const rz = (await baris()).find((x) => x.noKwitansi === zk.buku.noKwitansi) || {};
  cek('Zakat Mal, metode Transfer menjadi Transfer Bank', rz.jenisDana === 'Zakat' && rz.metode === 'Transfer Bank', rz);
  const lama = await jalan('ambil.catat', { donaturId: budi.id, jumlah: 20000, peruntukan: 'Sedekah', tanggal: HARI }, U1);
  cek('bentuk lama (hanya peruntukan) tetap berdiri sendiri, tidak menulis buku', !lama.buku && !lama.rec.cocok.sudah && (await baris()).length === 3, lama);

  console.log('\n=== B. AMAN DIULANG ===');
  const ulang = await jalan('ambil.tulisBuku', { himpunanId: a.rec.id }, U1);
  cek('menulis ulang catatan yang sama mengembalikan baris yang sama', ulang.buku.noKwitansi === a.buku.noKwitansi && (await baris()).length === 3, ulang.buku);
  cek('catatan lama tanpa jenis dana tidak bisa ditulis otomatis', /tidak punya jenis dana/i.test(await tolak('ambil.tulisBuku', { himpunanId: lama.rec.id }, U1)));
  cek('penggalang lain tidak bisa menulis ulang catatan orang', /bukan milik/i.test(await tolak('ambil.tulisBuku', { himpunanId: a.rec.id }, U2)));

  console.log('\n=== C. VALIDASI ===');
  const dasar = { donaturId: budi.id, jumlah: 10000, metode: 'Tunai', tanggal: HARI };
  cek('dana terikat tanpa pilar ditolak', /pilar/i.test(await tolak('ambil.catat', Object.assign({ jenisDana: 'Infak', subJenis: 'Infak Terikat' }, dasar), U1)));
  cek('pilar di luar daftar ditolak', /pilar/i.test(await tolak('ambil.catat', Object.assign({ jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Hiburan' }, dasar), U1)));
  cek('jenis dana asing ditolak', /jenis dana/i.test(await tolak('ambil.catat', Object.assign({ jenisDana: 'Amil', subJenis: 'Amil' }, dasar), U1)));
  cek('detail yang bukan milik jenisnya ditolak', /detail/i.test(await tolak('ambil.catat', Object.assign({ jenisDana: 'Zakat', subJenis: 'Infak Umum' }, dasar), U1)));
  cek('bagi hasil bank tidak ditawarkan di lapangan', /detail/i.test(await tolak('ambil.catat', Object.assign({ jenisDana: 'Infak', subJenis: 'Bagi Hasil Bank' }, dasar), U1)));
  cek('nominal nol ditolak', /Nominal/i.test(await tolak('ambil.catat', Object.assign({ jenisDana: 'Infak', subJenis: 'Infak Umum' }, dasar, { jumlah: 0 }), U1)));
  cek('yang ditolak tidak meninggalkan baris', (await baris()).length === 3);

  console.log('\n=== D. IZIN ===');
  cek('penggalang tidak bisa membuka daftar Penghimpunan', /IZIN/.test(await galatRpc('apiListPenghimpunan', [l1.token])));
  cek('penggalang tidak bisa menyimpan Penghimpunan lewat jalur biasa', /IZIN/.test(await galatRpc('apiSavePenghimpunan', [l1.token, { tanggal: HARI, jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 1000, metode: 'Cash/Tunai', namaDonatur: 'X' }])));
  const palsu = await hasil('apiFundHimpunkan', [l1.token, { himpunanId: 'h_palsu_1', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 7000, metode: 'Tunai', namaDonatur: 'Z', fundraising: 'Orang Lain Sekali' }]);
  cek('memalsukan nama fundraising lewat panggilan langsung diabaikan (dipakai nama akun)', palsu.row.fundraising === 'Rani Penggalang', palsu.row.fundraising);
  await hasil('apiSaveUser', [TA, { username: 'tanpa', password: 'Rahasia123', nama: 'Tanpa Izin', role: 'staff', aktif: 'true', permissions: { penghimpunan: { view: true, create: true } } }]);
  const l3 = await hasil('login', ['tanpa', 'Rahasia123']);
  cek('akun tanpa izin Fundraising (walau boleh Penghimpunan) ditolak di jalur Fundraising', /IZIN/.test(await galatRpc('apiFundHimpunkan', [l3.token, { himpunanId: 'h_x2', jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 1000 }])));
  const kw = await hasil('apiFundKwitansi', [l1.token, r.id]);
  cek('kwitansi untuk baris Fundraising sendiri terbuka', kw.data && kw.data.noKwitansi === r.noKwitansi && kw.settings, kw.data && kw.data.noKwitansi);
  const keys = Object.keys(kw.settings || {});
  cek('pengaturan di kwitansi tidak membawa token link atau lg_*', !keys.some((k) => /^lhToken|^lg_/.test(k)), keys.filter((k) => /^lhToken|^lg_/.test(k)));
  cek('penggalang lain tidak bisa membuka kwitansi orang', /IZIN/.test(await galatRpc('apiFundKwitansi', [l2.token, r.id])));
  await hasil('apiSavePenghimpunan', [TA, { tanggal: HARI, jenisDana: 'Infak', subJenis: 'Infak Umum', jumlah: 1000, metode: 'Cash/Tunai', namaDonatur: 'Manual', fundraising: 'Kantor' }]);
  const manual = (await hasil('apiListPenghimpunan', [TA])).find((x) => x.namaDonatur === 'Manual');
  cek('baris yang diinput manual (bukan dari Fundraising) tidak bisa dibuka lewat jalur Fundraising', /IZIN/.test(await galatRpc('apiFundKwitansi', [l1.token, manual.id])));
  cek('apiGetKwitansi biasa juga tidak lagi membawa token link atau lg_*', !Object.keys((await hasil('apiGetKwitansi', [TA, manual.id])).settings).some((k) => /^lhToken|^lg_/.test(k)));

  console.log('\n=== E. KIRIM KWITANSI WA DARI FUNDRAISING ===');
  const teks = { teks: 'Terima kasih Pak Budi.', nama: 'Budi Contoh', nomor: '0812 1111 0001' };
  cek('tanpa perangkat WhatsApp ditolak jelas', /perangkat WhatsApp/i.test(await tolak('kwitansi.kirim', Object.assign({ himpunanId: a.rec.id }, teks), U1)));
  await blastDb.simpan('perangkat:p1', { id: 'p1', nama: 'HP Kantor', nomor: '628111000111', driver: 'sandbox', status: 'tersambung', aktif: true });
  await blastDb.tambahKeHimpunan('perangkat:daftar', 'p1');
  const kirim = await jalan('kwitansi.kirim', Object.assign({ himpunanId: a.rec.id }, teks), U1);
  cek('terkirim ke antrean lewat mesin Broadcast, kontak donatur dibuat', kirim.status === 'menunggu' && kirim.kontakId, kirim);
  cek('klik dua kali tidak mengirim dua kali', (await jalan('kwitansi.kirim', Object.assign({ himpunanId: a.rec.id }, teks), U1)).sudah === true);
  cek('penggalang lain tidak boleh mengirim kwitansi catatan orang', /bukan milik/i.test(await tolak('kwitansi.kirim', Object.assign({ himpunanId: a.rec.id }, teks), U2)));
  cek('catatan yang belum masuk buku tidak punya kwitansi untuk dikirim', /belum masuk buku utama/i.test(await tolak('kwitansi.kirim', Object.assign({ himpunanId: lama.rec.id }, teks), U1)));
  cek('izin kirim mengikuti ambil.catat: relawan hanya-lihat ditolak di pintu depan', fund.tindakan['kwitansi.kirim'].izin === 'ambil.catat' && sesi.bolehFund({ _laz: { role: 'staff', permissions: { fundraising: { view: true } } } }, 'ambil.catat') === false);

  console.log('\n=== F. MASTER DATA SAMA DENGAN BUKU UTAMA ===');
  const app = fs.readFileSync(path.join(AKAR, 'src/public/app.js'), 'utf8');
  const eng = fs.readFileSync(path.join(AKAR, 'api/_engine.js'), 'utf8');
  const daftar = (teks, nama) => { const m = teks.match(new RegExp('var ' + nama + '\\s*=\\s*\\[([^\\]]*)\\]')); return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : null; };
  cek('pilar terikat Fundraising = KATEGORI_TERIKAT app.js = engine', JSON.stringify(himpunanLib.PILAR_TERIKAT) === JSON.stringify(daftar(app, 'KATEGORI_TERIKAT')) && JSON.stringify(himpunanLib.PILAR_TERIKAT) === JSON.stringify(daftar(eng, 'KATEGORI_TERIKAT_FR')), [himpunanLib.PILAR_TERIKAT, daftar(app, 'KATEGORI_TERIKAT')]);
  const subApp = (teks, jenis) => { const m = teks.match(new RegExp("'" + jenis + "':\\[([^\\]]*)\\]")); return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : []; };
  for (const j of himpunanLib.JENIS_LAPANGAN) {
    const lap = himpunanLib.SUBJENIS[j];
    cek('detail ' + j + ' ada di buku utama (app.js dan engine)', lap.every((x) => subApp(app, j).includes(x) && subApp(eng, j).includes(x)), [lap, subApp(app, j)]);
  }

  console.log('\ntest_fund_buku.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
