/* Uji apiDeleteUangMuka, apiDeleteTransfer, apiSelaraskanJurnal.
 * Jalankan: node tools/test_selaras_jurnal.js
 */
'use strict';
process.env.TZ = 'Asia/Jakarta';
const engine = require('../api/_engine.js');
const pg = require('../lib/laz-pg.js');
const skema = require('../lib/laz-skema.js');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};
const TOKEN = 'tok-selaras';
const kolom = (n) => (skema.TABEL[n].kolom || []).map((x) => x[0]);
const buatBaris = (n, o) => kolom(n).map((k) => (o[k] !== undefined ? o[k] : ''));

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [kolom(n)];
  s.Users.push(['u1', 'admin', 'x', 'y', 'Admin Uji', 'superadmin', '{}', 'true', new Date().toISOString(), '']);
  s.Sessions = [['token', 'userId', 'dibuat', 'expiredAt', 'ip', 'ua'],
    [TOKEN, 'u1', new Date().toISOString(), new Date(Date.now() + 864e5).toISOString(), '', '']];
  s.Penghimpunan.push(buatBaris('Penghimpunan', { id: 'h1', tanggal: '2026-01-07', jenisDana: 'Zakat', program: 'Profesi', namaDonatur: 'KLL Bambanglipuro', jumlah: 250000, keterangan: 'x' }));
  s.Penghimpunan.push(buatBaris('Penghimpunan', { id: 'h2', tanggal: '2026-01-08', jenisDana: 'Infak', subJenis: 'Infak Umum', namaDonatur: 'NN', jumlah: 10000, keterangan: 'y' }));
  s.Penghimpunan.push(buatBaris('Penghimpunan', { id: 'h3', tanggal: '2026-01-09', jenisDana: 'Infak', subJenis: 'Infak Umum', namaDonatur: 'NN', jumlah: 10000, keterangan: 'z' }));
  s.Pentasyarufan.push(buatBaris('Pentasyarufan', { id: 's1', tanggal: '2026-01-21', ashnaf: 'Fi Sabilillah', sumberDana: 'Infak', program: 'Penyaluran Infak - Sosial', namaPenerima: 'Lazismu Daerah Bantul', jumlah: 150000 }));
  s.UangMuka.push(buatBaris('UangMuka', { id: 'u1', tanggal: '2026-02-02', jenis: 'keluar', dana: 'Amil', layanan: 'KLL Imogiri', nominal: 2200000, keterangan: 'dobel' }));
  s.UangMuka.push(buatBaris('UangMuka', { id: 'u2', tanggal: '2026-01-01', jenis: 'keluar', dana: 'Amil', layanan: 'KLL Imogiri', nominal: 2200000, keterangan: 'benar' }));
  s.Transfer.push(buatBaris('Transfer', { id: 't1', tanggal: '2026-05-08', jenis: 'mutasi', dariAkun: 'Muamalat', keAkun: 'BPD 510', nominal: 250000000, keterangan: 'pemindahbukuan' }));
  return { sheets: s, props: {} };
}

let DB = dbBaru();
async function rpc(fn, args, db) {
  const basis = db || DB;
  const minta = new Set(pg._internal.DASAR);
  for (let putaran = 1; putaran <= 30; putaran++) {
    const diminta = [];
    engine._setLambat({
      lengkap: new Set(minta), jumlah: {}, diminta,
      minta(n) { if (!diminta.includes(n)) diminta.push(n); throw new pg.PerluLembar(n); },
    });
    try {
      const keluar = await engine.runRPC(basis, fn, args, {});
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

const baris = (tabel, id) => {
  const h = DB.sheets[tabel][0];
  const row = DB.sheets[tabel].slice(1).find((r) => String(r[0]) === String(id));
  if (!row) return null;
  const o = {};
  h.forEach((k, i) => { o[k] = row[i]; });
  return o;
};

(async () => {
  /* 1. selaraskan tanggal himpun */
  let r = await rpc('apiSelaraskanJurnal', [TOKEN, [
    { tabel: 'Penghimpunan', id: 'h1', kolom: { tanggal: '2026-01-06' } },
    { tabel: 'Penghimpunan', id: 'h2', kolom: { tanggal: '2026-01-07' } },
    { tabel: 'Penghimpunan', id: 'hx', kolom: { tanggal: '2026-01-07' } },          // tidak ada
    { tabel: 'Penghimpunan', id: 'h3', kolom: { tanggal: '7 Jan 2026' } },           // format salah
    { tabel: 'Lain', id: 'h3', kolom: { tanggal: '2026-01-07' } },                   // tabel tidak dikenal
    { tabel: 'Pentasyarufan', id: 's1', kolom: { tanggal: '2026-01-20', program: 'Penyaluran Infak - Kelembagaan' } },
  ]]);
  cek('selaras: ubah=3', r.ubah === 3, r);
  cek('selaras: dilewati=3', r.dilewati === 3, r);
  cek('h1 tanggal jadi 2026-01-06', baris('Penghimpunan', 'h1').tanggal === '2026-01-06', baris('Penghimpunan', 'h1'));
  cek('h2 tanggal jadi 2026-01-07', baris('Penghimpunan', 'h2').tanggal === '2026-01-07', baris('Penghimpunan', 'h2'));
  cek('h3 tetap 2026-01-09 (format salah ditolak)', baris('Penghimpunan', 'h3').tanggal === '2026-01-09');
  cek('s1 tanggal + program berubah', baris('Pentasyarufan', 's1').tanggal === '2026-01-20'
    && baris('Pentasyarufan', 's1').program === 'Penyaluran Infak - Kelembagaan', baris('Pentasyarufan', 's1'));
  cek('h1 jumlah tidak ikut berubah', Number(baris('Penghimpunan', 'h1').jumlah) === 250000);

  /* 2. klasifikasi himpun lewat daftar putih */
  r = await rpc('apiSelaraskanJurnal', [TOKEN, [
    { tabel: 'Penghimpunan', id: 'h2', kolom: { jenisDana: 'Zakat', subJenis: 'Zakat Profesi/Penghasilan', program: 'Profesi' } },
  ]]);
  cek('klasifikasi h2 berubah', baris('Penghimpunan', 'h2').jenisDana === 'Zakat' && baris('Penghimpunan', 'h2').subJenis === 'Zakat Profesi/Penghasilan', baris('Penghimpunan', 'h2'));
  cek('nama h2 TIDAK bisa diubah lewat selaras (daftar putih)', baris('Penghimpunan', 'h2').namaDonatur === 'NN');

  /* 3. hapus UMP dobel */
  r = await rpc('apiDeleteUangMuka', [TOKEN, 'u1']);
  cek('hapus ump ok', r.ok === true, r);
  cek('u1 hilang, u2 tetap', !baris('UangMuka', 'u1') && !!baris('UangMuka', 'u2'));
  let gagalHapus = null;
  try { await rpc('apiDeleteUangMuka', [TOKEN, 'u1']); } catch (e) { gagalHapus = e.message; }
  cek('hapus ump kedua kali menolak', !!gagalHapus, gagalHapus);

  /* 4. hapus transfer */
  r = await rpc('apiDeleteTransfer', [TOKEN, 't1']);
  cek('hapus transfer ok', r.ok === true, r);
  cek('t1 hilang', !baris('Transfer', 't1'));

  /* 5. hapus massal per id */
  r = await rpc('apiHapusBaris', [TOKEN, { tabel: 'Penghimpunan', ids: ['h1', 'hx', 'h3'] }]);
  cek('hapus massal: hapus=2, hilang=1', r.hapus === 2 && r.hilang === 1, r);
  cek('h1 & h3 hilang, h2 tetap', !baris('Penghimpunan', 'h1') && !baris('Penghimpunan', 'h3') && !!baris('Penghimpunan', 'h2'));
  let gagalTabel = null;
  try { await rpc('apiHapusBaris', [TOKEN, { tabel: 'UangMuka', ids: ['u2'] }]); } catch (e) { gagalTabel = e.message; }
  cek('hapus massal menolak tabel di luar daftar putih', !!gagalTabel, gagalTabel);

  console.log('\n' + ok + ' OK, ' + gagal + ' GAGAL');
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
