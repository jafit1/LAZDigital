/* Uji kwitansi ke WhatsApp donatur (api/blast.js: kwitansi.kirim, kwitansi.status, kontak.sinkronDonatur).
 *
 * Yang dijaga (dan gampang rusak diam-diam):
 *  1. Kontak donatur TIDAK ganda: "0811...", "62811...", dan "+62811..." satu kontak; nama, catatan, dan grup kontak
 *     yang sudah ada tidak ditimpa, hanya label "Donatur" ditambahkan.
 *  2. Klik dua kali tidak mengirim dua pesan; "Kirim ulang" (paksa) memang mengirim pesan baru.
 *  3. Status diambil dari pesannya: antre = menunggu, sampai = terkirim, gagal = gagal; yang gagal boleh dikirim lagi
 *     tanpa paksa.
 *  4. Kontak yang berhenti berlangganan/diblokir tidak dikirimi; nomor tak sah dan tanpa perangkat ditolak jelas.
 *  5. Hanya yang punya izin mengirim (pesan.kirim) dan mengubah kontak (kontak.ubah) yang boleh; pengurus kantor layanan
 *     tidak bisa menyinkronkan kontak.
 * jalankan:  node tools/test_kwitansi_wa.js
 */
'use strict';
require('./_pagar-db.js')('Uji kwitansi WhatsApp');
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(require('./_folder-data.js')(AKAR), { recursive: true, force: true });
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const db = require('../lib/blast/db');
const kontakLib = require('../lib/blast/kontak');
const antreanLib = require('../lib/blast/antrean');
const { tindakan } = require('../api/blast.js');
const penangan = require('../api/blast.js');
const auth = require('../lib/blast/auth');

let ok = 0, g = 0;
const cek = (n, s, info) => {
  if (s) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};
const REQ = { headers: { host: 'uji.test' }, socket: {} };
const SUPER = { id: 'u_super', nama: 'Superadmin', peran: 'superadmin' };
const jalan = (nama, data, pengguna = SUPER) => tindakan[nama].jalankan({ data: data || {}, pengguna, req: REQ });
const tolak = async (nama, data, pengguna) => { try { await jalan(nama, data, pengguna); return null; } catch (e) { return e.message || String(e); } };

const asliMasuk = auth.wajibMasuk;
function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (t) => { try { r.tubuh = JSON.parse(t); } catch (_) { r.tubuh = t; } r.writableEnded = true; return r; };
  return r;
}
async function lewatPintu(nama, data, pengguna) {
  auth.wajibMasuk = async () => pengguna;
  const res = balasan();
  await penangan({ method: 'POST', headers: { host: 'uji.test' }, socket: {}, body: { tindakan: nama, data: data || {} } }, res);
  auth.wajibMasuk = asliMasuk;
  return res;
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64');
const semuaPesan = async () => (await db.ambilBanyak((((await db.ambil('pesan:baru')) || []).map(antreanLib.KUNCI_PESAN)))).filter(Boolean);
const dasar = (o) => Object.assign({ penghimpunanId: 'h1', nama: 'Nurina Aziza', nomor: '0811 2233 4455', alamat: 'Murangan, Sleman', teks: 'Terima kasih Bu Nurina.', base64: PNG, tipe: 'image/png', namaBerkas: 'Kwitansi-KW-1.png' }, o || {});

(async () => {
  console.log('=== A. TANPA PERANGKAT ===');
  let e = await tolak('kwitansi.kirim', dasar());
  cek('tanpa perangkat WhatsApp ditolak dengan penjelasan', /perangkat WhatsApp/i.test(e || ''), e);
  await db.simpan('perangkat:p1', { id: 'p1', nama: 'HP Kantor', nomor: '628111000111', driver: 'sandbox', status: 'tersambung', aktif: true });
  await db.tambahKeHimpunan('perangkat:daftar', 'p1');

  console.log('\n=== B. KIRIM PERTAMA ===');
  e = await tolak('kwitansi.kirim', dasar({ nomor: '12345' }));
  cek('nomor tidak sah ditolak', /tidak sah/i.test(e || ''), e);
  e = await tolak('kwitansi.kirim', dasar({ teks: '  ' }));
  cek('pesan kosong ditolak', /tidak boleh kosong/i.test(e || ''), e);
  e = await tolak('kwitansi.kirim', dasar({ penghimpunanId: '' }));
  cek('tanpa id penghimpunan ditolak', !!e, e);
  const jumlahKontak0 = (await kontakLib.semuaKontak()).length;
  let r = await jalan('kwitansi.kirim', dasar());
  cek('kirim berhasil, masuk antrean', !!r.pesanId && r.status === 'menunggu', r);
  cek('kontak donatur dibuat otomatis', r.kontakBaru === true && (await kontakLib.semuaKontak()).length === jumlahKontak0 + 1, r);
  let k = await kontakLib.cariLewatNomor('081122334455');
  cek('kontak bernomor 62811... dengan nama dan label Donatur', k && k.nomor === '6281122334455' && k.nama === 'Nurina Aziza' && (k.label || []).includes('Donatur') && k.alamat === 'Murangan, Sleman', k);
  let psn = (await semuaPesan()).filter((p) => p.nomor === '6281122334455');
  cek('satu pesan di antrean: teks dan lampiran gambar ikut', psn.length === 1 && /Terima kasih/.test(psn[0].isi.teks) && psn[0].isi.berkasId && psn[0].isi.jenisBerkas === 'gambar', psn.map((p) => p.isi));
  cek('kwitansi diutamakan atas kiriman massal (prioritas 1)', psn[0].prioritas === 1, psn[0].prioritas);

  console.log('\n=== C. KLIK GANDA DAN KIRIM ULANG ===');
  r = await jalan('kwitansi.kirim', dasar());
  cek('klik kedua tidak mengirim lagi: dijawab sudah terkirim/menunggu', r.sudah === true, r);
  cek('masih satu pesan saja', (await semuaPesan()).filter((p) => p.nomor === '6281122334455').length === 1);
  r = await jalan('kwitansi.kirim', dasar({ paksa: true }));
  cek('"Kirim ulang" (paksa) membuat pesan baru', !r.sudah && !!r.pesanId && (await semuaPesan()).filter((p) => p.nomor === '6281122334455').length === 2, r);
  const st1 = (await jalan('kwitansi.status')).peta.h1;
  cek('percobaan tercatat 2', st1 && st1.percobaan === 2, st1);

  console.log('\n=== D. STATUS DIAMBIL DARI PESAN ===');
  const catat = await db.ambil('kwitansi:wa:h1');
  const ubahStatus = async (s) => { const p = await db.ambil(antreanLib.KUNCI_PESAN(catat.pesanId)); p.status = s; await db.simpan(antreanLib.KUNCI_PESAN(catat.pesanId), p); };
  await ubahStatus('antre');
  cek('antre = menunggu', (await jalan('kwitansi.status')).peta.h1.status === 'menunggu');
  await ubahStatus('sampai');
  cek('sampai = terkirim', (await jalan('kwitansi.status')).peta.h1.status === 'terkirim');
  await ubahStatus('dibaca');
  cek('dibaca = terkirim', (await jalan('kwitansi.status')).peta.h1.status === 'terkirim');
  await ubahStatus('gagal');
  cek('gagal = gagal', (await jalan('kwitansi.status')).peta.h1.status === 'gagal');
  r = await jalan('kwitansi.kirim', dasar());
  cek('yang gagal boleh dikirim lagi tanpa paksa', !r.sudah && !!r.pesanId, r);
  cek('penghimpunan lain belum ada di peta (= belum dikirim)', (await jalan('kwitansi.status')).peta.h2 === undefined);

  console.log('\n=== E. KONTAK TIDAK GANDA ===');
  await kontakLib.simpanKontak({ nama: 'Pak Haji Slamet', nomor: '+62 812-9000-1111', catatan: 'Donatur rutin Ramadan', label: ['Ramadan'], kantor: 'KLL Pundong' });
  const sebelum = (await kontakLib.semuaKontak()).length;
  r = await jalan('kwitansi.kirim', dasar({ penghimpunanId: 'h2', nama: 'Slamet', nomor: '0812 9000 1111', alamat: 'Pundong' }));
  const sesudah = await kontakLib.semuaKontak();
  k = await kontakLib.cariLewatNomor('6281290001111');
  cek('kontak yang sudah ada dipakai, tidak dibuat ganda', r.kontakBaru === false && sesudah.length === sebelum, [r.kontakBaru, sebelum, sesudah.length]);
  cek('nama, catatan, kantor, dan label lama TIDAK ditimpa', k.nama === 'Pak Haji Slamet' && k.catatan === 'Donatur rutin Ramadan' && k.kantor === 'KLL Pundong' && k.label.includes('Ramadan'), k);
  cek('label Donatur dan alamat kosong ditambahkan', k.label.includes('Donatur') && k.alamat === 'Pundong', k);
  r = await jalan('kwitansi.kirim', dasar({ penghimpunanId: 'h3', nama: 'Slamet', nomor: '6281290001111' }));
  k = await kontakLib.cariLewatNomor('081290001111');
  cek('penulisan nomor lain (62...) tetap kontak yang sama dan labelnya tidak berlipat', sesudah.length === (await kontakLib.semuaKontak()).length && k.label.filter((x) => x === 'Donatur').length === 1, k.label);

  console.log('\n=== F. YANG BERHENTI / DIBLOKIR ===');
  await kontakLib.simpanKontak({ nama: 'Bu Berhenti', nomor: '0813 5555 6666' });
  let kb = await kontakLib.cariLewatNomor('081355556666'); kb.langganan = false; await db.simpan(kontakLib.KUNCI(kb.id), kb);
  const pesan0 = (await semuaPesan()).length;
  e = await tolak('kwitansi.kirim', dasar({ penghimpunanId: 'h4', nama: 'Bu Berhenti', nomor: '081355556666' }));
  cek('kontak yang berhenti berlangganan tidak dikirimi', /berhenti berlangganan|diblokir/i.test(e || ''), e);
  cek('tidak ada pesan baru dan tidak tercatat terkirim', (await semuaPesan()).length === pesan0 && (await jalan('kwitansi.status')).peta.h4 === undefined);

  console.log('\n=== G. SINKRON KONTAK TANPA KIRIM ===');
  const daftar = [
    { nama: 'Donatur A', nomor: '0821 1111 2222', alamat: 'Bantul' },
    { nama: 'Donatur A ganda', nomor: '+62 821-1111-2222' },
    { nama: 'Donatur B', nomor: '0822 3333 4444' },
    { nama: 'Pak Haji', nomor: '081290001111' },
    { nama: 'Salah', nomor: '123' },
  ];
  r = await jalan('kontak.sinkronDonatur', { daftar });
  cek('2 baru, 2 sudah ada (termasuk ganda di daftar), 1 tidak sah', r.baru === 2 && r.sudahAda === 2 && r.tidakSah === 1, r);
  r = await jalan('kontak.sinkronDonatur', { daftar });
  cek('diulang: tidak ada yang baru, tidak ada kontak ganda', r.baru === 0 && r.sudahAda === 4, r);
  const semua = await kontakLib.semuaKontak();
  cek('tiap nomor tepat satu kontak', new Set(semua.map((x) => x.nomor)).size === semua.length, semua.map((x) => x.nomor));
  e = await tolak('kontak.sinkronDonatur', { daftar: [] });
  cek('daftar kosong ditolak', !!e, e);
  e = await tolak('kontak.sinkronDonatur', { daftar }, { id: 'u_kll', nama: 'KLL', peran: 'kll', kantor: 'KLL Pundong' });
  cek('pengurus kantor layanan tidak bisa menyinkronkan kontak', /kantor layanan/i.test(e || ''), e);

  console.log('\n=== H. HAK AKSES ===');
  let res = await lewatPintu('kwitansi.kirim', dasar({ penghimpunanId: 'h9' }), { id: 'u_kll', nama: 'KLL', peran: 'kll', kantor: 'KLL Pundong' });
  cek('pengurus KLL (tanpa izin kirim) ditolak 403', res.statusCode === 403, res.tubuh);
  res = await lewatPintu('kwitansi.kirim', dasar({ penghimpunanId: 'h9' }), { id: 'u_petugas', nama: 'Petugas', peran: 'petugas' });
  cek('petugas dengan izin kirim boleh', res.statusCode === 200 && res.tubuh && res.tubuh.ok, res.tubuh);
  res = await lewatPintu('kwitansi.status', {}, { id: 'u_kll', nama: 'KLL', peran: 'kll', kantor: 'x' });
  cek('melihat status cukup izin lihat pesan', res.statusCode === 200, res.tubuh);

  console.log('\ntest_kwitansi_wa.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
