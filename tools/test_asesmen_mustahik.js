/* Uji asesmen mustahik: pilihan survei, skor sesuai XLSX, izin, penyimpanan
   server, dan bentuk ringkasan yang aman. Semua identitas di sini buatan. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!process.env.LAZ_DATA_LOKAL) process.env.LAZ_DATA_LOKAL = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-asesmen-mustahik-'));
require('./_pagar-db.js')('Uji asesmen mustahik');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const media = require(path.join(AKAR, 'api', 'media.js'));
const suratApi = require(path.join(AKAR, 'lib', 'surat', 'api.js'));
let DB;
suratApi._uji.aturDasar(async () => DB);
let ok = 0, gagal = 0;
function cek(n, syarat, info) { if (syarat) { ok++; console.log('  OK   |', n); } else { gagal++; console.log('  GAGAL|', n, info === undefined ? '' : JSON.stringify(info).slice(0, 240)); } }
function balasan() { const r = { statusCode: 200, tubuh: null }; r.setHeader = () => {}; r.end = (s) => { try { r.tubuh = JSON.parse(s); } catch (_) { r.tubuh = s; } }; return r; }
async function pintu(tindakan, data, token) { const r = balasan(); await media({ method: 'POST', headers: {}, body: { tindakan, data: data || {}, token: token || '' }, on: () => {} }, r); return { kode: r.statusCode, ...(r.tubuh || {}) }; }
async function rpc(fn, args) { const r = await engine.runRPC(DB, fn, args || [], {}); DB = r.db; return r.result; }
(async () => {
  const sheets = {}; for (const n of skema.NAMA_TABEL) sheets[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'UjiSandi123!';
  DB = (await engine.runRPC({ sheets, props: {} }, 'setup', [], {})).db;
  const root = (await rpc('login', ['superadmin', 'UjiSandi123!'])).token;
  await rpc('apiSaveUser', [root, { username: 'asesor', nama: 'Admin Uji', password: 'AmanUji123!', role: 'staff', aktif: 'true', permissions: { surat: { view: true, edit: true } } }]);
  const admin = (await rpc('login', ['asesor', 'AmanUji123!'])).token;
  await rpc('apiSaveUser', [root, { username: 'pembaca', nama: 'Pembaca Uji', password: 'AmanUji123!', role: 'staff', aktif: 'true', permissions: { surat: { view: true } } }]);
  const pembaca = (await rpc('login', ['pembaca', 'AmanUji123!'])).token;

  console.log('\n=== A. KATALOG, PENILAIAN, DAN IZIN ===');
  const form = await pintu('surat.asesmenMustahik.form', {}, admin);
  cek('form asesmen hanya satu pilihan survei calon mustahik', form.ok && form.formulir.kode === 'F.Survei', form);
  cek('katalog berisi tepat 31 butir berbobot 1 sampai 5', form.formulir.pertanyaan.length === 31 && form.formulir.pertanyaan.every((q) => q.opsi.length >= 2 && q.opsi.every((o) => [1, 2, 3, 4, 5].includes(o.skor))), form.formulir && form.formulir.pertanyaan.length);
  cek('rentang hasil mencakup skor min-maks form dan batas yang dipilih', form.formulir.hasil[0].min === 32 && form.formulir.hasil[0].max === 63 && form.formulir.hasil[1].min === 64 && form.formulir.hasil[1].max === 88 && form.formulir.hasil[2].min === 89 && form.formulir.hasil[2].max === 155, form.formulir && form.formulir.hasil);
  const noizin = await pintu('surat.asesmenMustahik.simpan', {}, pembaca);
  cek('pengguna tanpa izin ubah tidak dapat menyimpan asesmen', noizin.kode === 403, noizin);
  const takdapatDaftar = await pintu('surat.asesmenMustahik.daftar', {}, pembaca);
  cek('pengguna tanpa izin ubah tidak dapat melihat riwayat', takdapatDaftar.kode === 403, takdapatDaftar);
  const tanpa = await pintu('surat.asesmenMustahik.daftar', {}, '');
  cek('tanpa token tidak dapat melihat riwayat asesmen', tanpa.kode === 401, tanpa);

  console.log('\n=== B. PENYIMPANAN DAN VALIDASI SERVER ===');
  const pertanyaan = form.formulir.pertanyaan;
  const jawaban = Object.fromEntries(pertanyaan.map((q) => [q.id, q.opsi[0].id]));
  const data = { jenis: 'survei-mustahik', tanggal: '2026-10-28', petugas: 'Admin Uji', mustahik: 'Nama Uji Fiktif', alamat: 'Alamat Uji', tujuan: 'Kebutuhan pokok', jawaban, elektronik: [{ nama: 'Televisi', jumlah: 1, status: 'Milik sendiri' }], bantuanLain: [], catatan: 'Catatan Uji' };
  const simpan = await pintu('surat.asesmenMustahik.simpan', data, admin);
  const skorMinimumForm = pertanyaan.reduce((a, q) => a + Math.min(...q.opsi.map((o) => o.skor)), 0);
  cek('asesmen sah tersimpan dengan skor minimum formulir dan hasil batas bawah', simpan.ok && simpan.asesmen.skor === skorMinimumForm && simpan.asesmen.hasil === 'Belum Layak dibantu', { skorMinimumForm, asesmen: simpan.asesmen });
  const skorMaks = Object.fromEntries(pertanyaan.map((q) => [q.id, q.opsi.reduce((a, b) => a.skor > b.skor ? a : b).id]));
  const maks = await pintu('surat.asesmenMustahik.simpan', { ...data, mustahik: 'Mustahik Maks Fiktif', jawaban: skorMaks }, admin);
  cek('skor maksimum 155 masuk Sangat Layak dibantu', maks.ok && maks.asesmen.skor === 155 && maks.asesmen.hasil === 'Sangat Layak dibantu', maks.asesmen);
  cek('server menambahkan identitas admin dan id, tidak mempercayai identitas pengirim', simpan.asesmen && simpan.asesmen.olehNama === 'Admin Uji' && simpan.asesmen.id && simpan.asesmen.mustahik === 'Nama Uji Fiktif', simpan.asesmen);
  const daftar = await pintu('surat.asesmenMustahik.daftar', {}, admin);
  cek('asesmen tersimpan dapat dimuat kembali oleh admin', daftar.ok && daftar.asesmen.length === 2 && daftar.asesmen.some((x) => x.id === simpan.asesmen.id) && daftar.asesmen.some((x) => x.id === maks.asesmen.id), daftar);
  const kurang = await pintu('surat.asesmenMustahik.simpan', { ...data, jawaban: { ...jawaban, [pertanyaan[0].id]: 'nilai-rekaan' } }, admin);
  cek('nilai yang bukan pilihan katalog ditolak server', kurang.kode === 400, kurang);
  const tanpaTujuan = await pintu('surat.asesmenMustahik.simpan', { ...data, tujuan: '' }, admin);
  cek('tujuan/kebutuhan wajib server menolak data kosong', tanpaTujuan.kode === 400, tanpaTujuan);
  const taklengkap = { ...jawaban }; delete taklengkap[pertanyaan[0].id];
  const kosong = await pintu('surat.asesmenMustahik.simpan', { ...data, jawaban: taklengkap }, admin);
  cek('asesmen dengan jawaban belum lengkap ditolak', kosong.kode === 400, kosong);
  const tanggal = await pintu('surat.asesmenMustahik.simpan', { ...data, tanggal: '2026-99-99' }, admin);
  cek('tanggal tak sah ditolak', tanggal.kode === 400, tanggal);
  const sanitasi = await pintu('surat.asesmenMustahik.simpan', { ...data, mustahik: '<script>nama</script>' }, admin);
  cek('teks HTML tersimpan sebagai teks, bukan markup aktif', sanitasi.ok && !/[<>]/.test(sanitasi.asesmen.mustahik), sanitasi.asesmen && sanitasi.asesmen.mustahik);
  await rpc('apiSaveUser', [root, { username: 'adminlain', nama: 'Admin Lain', password: 'LainUji123!', role: 'staff', aktif: 'true', permissions: { surat: { view: true, edit: true } } }]);
  const lain = (await rpc('login', ['adminlain', 'LainUji123!'])).token;
  const beda = await pintu('surat.asesmenMustahik.simpan', { ...data, id: simpan.asesmen.id, mustahik: 'Ubah Tanpa Izin' }, lain);
  cek('admin lain tidak dapat mengubah asesmen pencatat', beda.kode === 403, beda);
  const daftarLain = await pintu('surat.asesmenMustahik.daftar', {}, lain);
  cek('daftar asesmen terikat ke admin pencatat', daftarLain.ok && daftarLain.asesmen.length === 0, daftarLain);
  const hapusLain = await pintu('surat.asesmenMustahik.hapus', { id: simpan.asesmen.id }, lain);
  cek('admin lain tidak dapat menghapus asesmen pencatat', hapusLain.kode === 403, hapusLain);
  const hapus = await pintu('surat.asesmenMustahik.hapus', { id: simpan.asesmen.id }, admin);
  const sesudahHapus = await pintu('surat.asesmenMustahik.daftar', {}, admin);
  cek('pencatat dapat menghapus asesmen dari server', hapus.ok && sesudahHapus.asesmen.length === 2 && !sesudahHapus.asesmen.some((x) => x.id === simpan.asesmen.id), { hapus, tersisa: sesudahHapus.asesmen.map((x) => x.id) });

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exitCode = 1;
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exitCode = 1; });
