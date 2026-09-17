/* Uji fitur Fundraising di tingkat server: kepemilikan per-fundraiser, jadwal
   pengambilan, reschedule ke hari kerja, kunjungan kosong, pencocokan dengan
   buku utama, dan pagar hak akses.

   Yang diuji adalah aturan yang harus tetap benar walau siapa pun memanggil
   API-nya langsung — bukan tampilannya.

   jalankan:  node tools/test_fund_fitur.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(path.join(AKAR, '.data'), { recursive: true, force: true });
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const fund = require('../api/fund.js');
const rpc = require('../api/rpc.js');
const sesi = require('../lib/fund/sesi-laz.js');
const donaturLib = require('../lib/fund/donatur.js');

let ok = 0, g = 0;
const cek = (n, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

/* Pengguna palsu — bentuknya sama dengan yang dikembalikan sesi-laz. lihatSemua
   & izin diturunkan dari _laz.permissions.fundraising, persis seperti produksi. */
const U = (id, perm, role) => ({ id, nama: 'User ' + id, peran: 'x', _laz: { id, role: role || 'staff', permissions: { fundraising: perm || {} } } });
const FUND1 = U('u1', { view: true, create: true, edit: true, delete: false });
const FUND2 = U('u2', { view: true, create: true, edit: true });
const KOOR = U('uk', { view: true, create: true, edit: true, delete: true });
const SUPER = U('us', {}, 'superadmin');
const RELAWAN = U('ur', { view: true });

async function jalan(nama, data, pengguna = FUND1) {
  const t = fund.tindakan[nama];
  if (!t) throw new Error('tindakan tidak ada: ' + nama);
  return t.jalankan({ data: data || {}, pengguna, req: { headers: {} }, res: {} });
}
async function tolak(nama, data, pengguna) {
  try { await jalan(nama, data, pengguna); return null; }
  catch (e) { return e.message || String(e); }
}

/* Lewat pintu depan (penangan) untuk menguji pagar izin & auth yang duduk di
   sana, bukan di dalam tiap tindakan. sesi.penggunaLaz dipalsukan. */
const asliPenggunaLaz = sesi.penggunaLaz;
function balasan() {
  const r = { statusCode: 200, tubuh: null };
  r.setHeader = () => {};
  r.end = (t) => { try { r.tubuh = JSON.parse(t); } catch (_) { r.tubuh = t; } return r; };
  return r;
}
async function lewatPintu(nama, data, pengguna) {
  sesi.penggunaLaz = async () => pengguna || null;
  const res = balasan();
  await fund({ method: 'POST', headers: {}, body: { tindakan: nama, data: data || {} },
    on: () => {}, }, res);
  sesi.penggunaLaz = asliPenggunaLaz;
  return res;
}

(async () => {
  console.log('=== A. DONATUR: WAJIB NAMA, HP, LOKASI ===');
  const lokasi = { lat: -7.88, lng: 110.33, alamat: 'Bantul' };
  const budi = (await jalan('donatur.simpan', { nama: 'Budi Santosa', telepon: '0812 1111 0001', lokasi, grup: ['Rutin', 'Ramadan'] })).donatur;
  cek('donatur tersimpan dengan lokasi', budi.lokasi.lat === -7.88 && budi.pemilik === 'u1', budi.pemilik);
  cek('nomor dinormalkan', budi.telepon === '6281211110001', budi.telepon);
  cek('tanpa lokasi ditolak', /Lokasi wajib/i.test(await tolak('donatur.simpan', { nama: 'X', telepon: '08123456789' })));
  cek('lokasi (0,0) ditolak', /Lokasi wajib/i.test(await tolak('donatur.simpan', { nama: 'X', telepon: '08123456789', lokasi: { lat: 0, lng: 0 } })));
  cek('tanpa nomor ditolak', /HP\/WA/i.test(await tolak('donatur.simpan', { nama: 'X', lokasi })));
  cek('tanpa nama ditolak', /Nama lengkap/i.test(await tolak('donatur.simpan', { telepon: '08123456789', lokasi })));

  console.log('\n=== B. KEPEMILIKAN PER-FUNDRAISER ===');
  const siti = (await jalan('donatur.simpan', { nama: 'Siti', telepon: '08123456700', lokasi }, FUND2)).donatur;
  cek('fundraiser lain punya donatur sendiri', siti.pemilik === 'u2');
  cek('u1 hanya melihat donaturnya', (await jalan('donatur.daftar', {}, FUND1)).total === 1);
  cek('u2 hanya melihat donaturnya', (await jalan('donatur.daftar', {}, FUND2)).total === 1);
  cek('koordinator melihat semua', (await jalan('donatur.daftar', {}, KOOR)).total === 2);
  cek('u1 tidak boleh mengubah donatur u2', /bukan milik/i.test(await tolak('donatur.simpan', { id: siti.id, nama: 'Ubah', telepon: '08123456700', lokasi }, FUND1)));
  cek('u1 tidak boleh menghapus donatur u2', /bukan milik/i.test(await tolak('donatur.hapus', { id: siti.id }, FUND1)));
  cek('koordinator boleh menghapus donatur siapa pun', (await jalan('donatur.hapus', { id: siti.id }, KOOR)).pesan !== undefined);
  await jalan('donatur.simpan', { nama: 'Siti', telepon: '08123456700', lokasi }, FUND2); // kembalikan

  console.log('\n=== C. JADWAL & DASBOR HARI INI ===');
  const HARI = require('../lib/fund/util.js').tglLokal();
  await jalan('donatur.jadwal', { id: budi.id, jadwal: { tanggal: HARI, ulang: 'sekali' } }, FUND1);
  const dash = await jalan('dasbor.ringkas', { tanggal: HARI }, FUND1);
  cek('dasbor menampilkan jadwal hari ini', dash.jadwal.length === 1 && dash.jadwal[0].nama === 'Budi Santosa', dash.jadwal.map((x) => x.nama));
  cek('belum dikunjungi terhitung', dash.belumDikunjungi === 1, dash.belumDikunjungi);

  console.log('\n=== D. DIAMBIL / KOSONG / RESCHEDULE ===');
  cek('diambil tanpa nominal ditolak', /Nominal/i.test(await tolak('ambil.catat', { donaturId: budi.id, peruntukan: 'Zakat', tanggal: HARI }, FUND1)));
  cek('diambil tanpa peruntukan ditolak', /Peruntukan/i.test(await tolak('ambil.catat', { donaturId: budi.id, jumlah: 50000, tanggal: HARI }, FUND1)));
  const amb = await jalan('ambil.catat', { donaturId: budi.id, jumlah: 150000, peruntukan: 'Zakat', tanggal: HARI }, FUND1);
  cek('donasi tercatat', amb.rec.jumlah === 150000 && amb.rec.status === 'diambil', amb.rec.jumlah);
  cek('nama fundraising ikut tercatat (kunci pencocokan)', amb.rec.fundraising === 'User u1', amb.rec.fundraising);
  const dash2 = await jalan('dasbor.ringkas', { tanggal: HARI }, FUND1);
  cek('sesudah diambil, ditandai sudah dikunjungi (tidak lenyap)',
    dash2.jadwal.length === 1 && dash2.jadwal[0].sudahDikunjungi === true, dash2.jadwal[0]);
  cek('total hari ini naik', dash2.ringkasHari.total === 150000, dash2.ringkasHari);

  // kunjungan kosong pada donatur lain
  const doni = (await jalan('donatur.simpan', { nama: 'Doni', telepon: '08123456712', lokasi, jadwal: { tanggal: HARI, ulang: 'sekali' } }, FUND1)).donatur;
  await jalan('ambil.kosong', { donaturId: doni.id, tanggal: HARI }, FUND1);
  const dash3 = await jalan('dasbor.ringkas', { tanggal: HARI }, FUND1);
  const doniK = dash3.jadwal.find((x) => x.nama === 'Doni');
  cek('kunjungan kosong tercatat tanpa nominal', doniK && doniK.hasilKunjungan.status === 'kosong' && doniK.hasilKunjungan.jumlah === 0, doniK && doniK.hasilKunjungan);

  // reschedule (Jumat -> Senin, dsb). Pakai tanggal Sabtu supaya hasil pasti Senin.
  await jalan('donatur.jadwal', { id: doni.id, jadwal: { tanggal: '2026-09-19', ulang: 'sekali' } }, FUND1); // Sabtu
  const rs = await jalan('ambil.reschedule', { donaturId: doni.id }, FUND1);
  cek('reschedule melompati akhir pekan ke Senin', rs.tanggalBaru === '2026-09-21', rs.tanggalBaru);
  const doniBaru = await donaturLib.ambilDonatur(doni.id);
  cek('jadwal donatur ikut berpindah', doniBaru.jadwal.tanggal === '2026-09-21', doniBaru.jadwal);

  console.log('\n=== E. PENCOCOKAN DENGAN BUKU UTAMA ===');
  /* Buku utama LAZDigital dipalsukan lewat rpc.muat: satu baris yang cocok
     dengan donasi Budi (nominal & nama & tanggal), satu baris fundraiser lain. */
  const aslinyaMuat = rpc._internal.muat;
  rpc._internal.muat = async () => ({
    db: { sheets: { Penghimpunan: [
      ['id', 'noKwitansi', 'tanggal', 'jenisDana', 'namaDonatur', 'jumlah', 'fundraising'],
      ['p1', 'KW-001', HARI, 'Zakat', 'Budi Santosa', 150000, 'User u1'],
      ['p2', 'KW-002', HARI, 'Infak', 'Orang Lain', 90000, 'Tim Lain'],
    ] } },
  });
  const cocok = await jalan('cocok.daftar', {}, FUND1);
  rpc._internal.muat = aslinyaMuat;
  cek('sisi fundraising memuat donasi berisi', cocok.fund.length === 1, cocok.fund.length);
  cek('buku utama tersaring ke nama fundraising ini saja', cocok.main.length === 1 && cocok.main[0].noKwitansi === 'KW-001', cocok.main.map((m) => m.noKwitansi));
  cek('padanan otomatis diusulkan (bukan ditandai otomatis)', cocok.fund[0].usul && cocok.fund[0].usul.noKwitansi === 'KW-001' && cocok.fund[0].cocok.sudah === false, cocok.fund[0].usul);
  cek('selisih dihitung', cocok.ringkas.selisih === 0 && cocok.ringkas.belumCocok === 1, cocok.ringkas);

  const tandai = await jalan('cocok.tandai', { id: cocok.fund[0].id, ref: 'KW-001' }, FUND1);
  cek('bisa ditandai cocok', /masuk buku utama/i.test(tandai.pesan));
  const cocok2 = await jalan('cocok.daftar', {}, FUND1);
  cek('sesudah ditandai, belumCocok berkurang', cocok2.ringkas.belumCocok === 0 && cocok2.ringkas.sudahCocok === 1, cocok2.ringkas);

  console.log('\n=== F. BUKU UTAMA TAK TERBACA TIDAK MENGGAGALKAN ===');
  const rusak = rpc._internal.muat;
  rpc._internal.muat = async () => { throw new Error('Upstash mati'); };
  const cocokRusak = await jalan('cocok.daftar', {}, FUND1);
  rpc._internal.muat = rusak;
  cek('halaman cocok tetap jalan saat buku utama gagal', Array.isArray(cocokRusak.fund) && cocokRusak.main.length === 0, cocokRusak.main.length);
  cek('kegagalannya disampaikan, tidak ditelan', /mati/i.test(cocokRusak.galatMain || ''), cocokRusak.galatMain);

  console.log('\n=== G. LAPORAN ===');
  const lap = await jalan('laporan.ringkas', {}, FUND1);
  cek('laporan menjumlah per peruntukan', lap.perPeruntukan.some((x) => x.nama === 'Zakat' && x.jumlah === 150000), lap.perPeruntukan);
  cek('laporan menghitung kunjungan (termasuk kosong)', lap.ringkas.kunjungan >= 2 && lap.ringkas.kosong >= 1, lap.ringkas);

  console.log('\n=== H. PAGAR IZIN LEWAT PINTU DEPAN ===');
  const r1 = await lewatPintu('ambil.catat', { donaturId: budi.id, jumlah: 1000, peruntukan: 'Zakat' }, RELAWAN);
  cek('relawan (view saja) ditolak mencatat donasi', r1.statusCode === 403, r1.tubuh);
  const r2 = await lewatPintu('donatur.daftar', {}, null);
  cek('tanpa login ditolak', r2.statusCode === 401 || r2.statusCode === 403, r2.statusCode);
  const r3 = await lewatPintu('donatur.daftar', {}, FUND1);
  cek('fundraiser sah bisa masuk', r3.statusCode === 200 && r3.tubuh.ok === true, r3.statusCode);
  const r4 = await lewatPintu('fund.status', {}, FUND1);
  cek('fund.status memberi daftar izin untuk menu', r4.tubuh.ok && Array.isArray(r4.tubuh.izin), r4.tubuh.izin);

  console.log('\n=== I. AKUN & NAMA FUNDRAISING ===');
  await jalan('akun.simpan', { namaFundraising: 'Tim Bantul Kota' }, FUND1);
  const amb2 = await jalan('ambil.catat', { donaturId: budi.id, jumlah: 20000, peruntukan: 'Infak', tanggal: HARI }, FUND1);
  cek('catatan baru memakai nama fundraising dari profil', amb2.rec.fundraising === 'Tim Bantul Kota', amb2.rec.fundraising);
  cek('catatan lama tidak berubah surut', amb.rec.fundraising === 'User u1');

  console.log('\ntest_fund_fitur.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
