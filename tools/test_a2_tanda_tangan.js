/* Uji: tempat, nama kasir, dan nama bagian keuangan di Formulir A2 cukup
 * diisi SEKALI, tersimpan di sistem, dan bisa diganti kapan saja.
 *
 * Sebelumnya tersimpan hanya sebagai efek samping tombol Cetak, lewat
 * apiSaveSettings yang menuntut izin Pengaturan. Petugas tanpa izin itu gagal
 * menyimpan secara diam-diam (catch kosong) dan harus mengetik ulang tiap cetak.
 *
 * Yang dijaga:
 *   1. apiSimpanTandaTanganA2 menyimpan tiga isian ke Settings.
 *   2. Hasilnya ikut terbaca lagi lewat apiBootstrap (dipakai layar).
 *   3. Bisa diganti kapan saja; yang tidak dikirim tidak ikut berubah.
 *   4. Izin: butuh Laporan > ubah. Tanpa izin ditolak.
 *   5. Teks dibersihkan dan dibatasi panjangnya.
 *   6. Layar menyimpan otomatis saat isian berubah dan menampilkan statusnya.
 *
 * Nama dan angka karangan, bukan data lembaga.
 *
 *   node tools/test_a2_tanda_tangan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 240)); }
};

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [['id', 'username', 'passwordHash', 'salt', 'nama', 'role', 'permissions', 'aktif', 'dibuat', 'layanan']];
  s.Sessions = [['token', 'userId', 'expired']];
  s.Settings = [['key', 'value']];
  const besok = new Date(Date.now() + 864e5).toISOString();
  const u = (id, username, role, izin) => [id, username, 'hash', 'garam', 'Nama ' + id, role, JSON.stringify(izin), 'true', new Date().toISOString(), ''];
  s.Users.push(u('u_super', 'superadmin', 'superadmin', {}));
  s.Users.push(u('u_edit', 'petugas.edit', 'staff', { laporan: { view: true, edit: true } }));
  s.Users.push(u('u_lihat', 'petugas.lihat', 'staff', { laporan: { view: true } }));
  ['u_super', 'u_edit', 'u_lihat'].forEach((id) => s.Sessions.push(['tok_' + id, id, besok]));
  return { sheets: s, props: {} };
}
async function jalan(fn, args, db) {
  db = db || dbBaru();
  try {
    const out = await engine.runRPC(db, fn, args, {});
    return { ok: true, hasil: out.result, db: out.db };
  } catch (e) {
    return { ok: false, galat: e.message, db };
  }
}

(async () => {
  console.log('\n=== A. MENYIMPAN DAN MEMBACA KEMBALI ===');
  let r = await jalan('apiSimpanTandaTanganA2', ['tok_u_super', { kota: 'Kabupaten Bantul', kasir: 'Sari Contoh', keuangan: 'Budi Contoh' }]);
  cek('superadmin bisa menyimpan', r.ok, r.galat);
  const db1 = r.db;
  r = await jalan('apiBootstrap', ['tok_u_lihat'], db1);
  const st = (r.hasil && r.hasil.settings) || {};
  cek('tempat terbaca lagi oleh pengguna lain', st.formA2Kota === 'Kabupaten Bantul', st);
  cek('nama kasir terbaca lagi', st.formA2Kasir === 'Sari Contoh', st);
  cek('nama keuangan terbaca lagi', st.formA2Keuangan === 'Budi Contoh', st);

  console.log('\n=== B. DIGANTI KAPAN SAJA ===');
  r = await jalan('apiSimpanTandaTanganA2', ['tok_u_super', { kasir: 'Rina Pengganti' }], db1);
  cek('mengganti satu isian berhasil', r.ok, r.galat);
  r = await jalan('apiBootstrap', ['tok_u_super'], r.db);
  const st2 = (r.hasil && r.hasil.settings) || {};
  cek('kasir berganti', st2.formA2Kasir === 'Rina Pengganti', st2);
  cek('isian yang tidak dikirim tidak ikut berubah', st2.formA2Kota === 'Kabupaten Bantul' && st2.formA2Keuangan === 'Budi Contoh', st2);
  r = await jalan('apiSimpanTandaTanganA2', ['tok_u_super', { keuangan: '' }], db1);
  r = await jalan('apiBootstrap', ['tok_u_super'], r.db);
  cek('boleh dikosongkan', ((r.hasil.settings || {}).formA2Keuangan) === '', r.hasil.settings);

  console.log('\n=== C. IZIN ===');
  r = await jalan('apiSimpanTandaTanganA2', ['tok_u_edit', { kota: 'Bantul' }]);
  cek('pemegang izin Laporan > ubah bisa menyimpan', r.ok, r.galat);
  r = await jalan('apiSimpanTandaTanganA2', ['tok_u_lihat', { kota: 'Bantul' }]);
  cek('hanya izin lihat ditolak', !r.ok && /^IZIN:/.test(r.galat || ''), r.galat);
  r = await jalan('apiSimpanTandaTanganA2', ['', { kota: 'Bantul' }]);
  cek('tanpa token ditolak', !r.ok && /AUTH/.test(r.galat || ''), r.galat);

  console.log('\n=== D. TEKS DIBERSIHKAN ===');
  const panjang = 'A'.repeat(300);
  r = await jalan('apiSimpanTandaTanganA2', ['tok_u_super', { kota: panjang, kasir: '  Sari\n\tContoh\u0000  ', keuangan: 'X' }]);
  cek('simpan teks kotor berhasil', r.ok, r.galat);
  r = await jalan('apiBootstrap', ['tok_u_super'], r.db);
  const st3 = (r.hasil && r.hasil.settings) || {};
  cek('panjang dibatasi 80 huruf', String(st3.formA2Kota || '').length === 80, String(st3.formA2Kota || '').length);
  cek('spasi dirapikan dan karakter kontrol dibuang', st3.formA2Kasir === 'Sari Contoh', st3.formA2Kasir);
  r = await jalan('apiSimpanTandaTanganA2', ['tok_u_super', {}]);
  cek('permintaan kosong ditolak dengan pesan jelas', !r.ok && /simpan/i.test(r.galat || '') && !/tidak dikenal/i.test(r.galat || ''), r.galat);
  r = await jalan('apiSimpanTandaTanganA2', ['tok_u_super', { lg_x: 'curi', kota: 'Bantul' }]);
  r = r.ok ? await jalan('apiGetSettings', ['tok_u_super'], r.db) : r;
  cek('kunci lain yang diselundupkan tidak ikut tersimpan', r.ok && (r.hasil || {}).lg_x === undefined, r.hasil || r.galat);

  console.log('\n=== E. LAYAR MENYIMPAN OTOMATIS ===');
  const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
  const panel = (app.match(/function a2Panel\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  cek('isian tempat, kasir, keuangan menyimpan saat berubah',
    ['a2_kota', 'a2_kasir', 'a2_keuangan'].every((id) => new RegExp('id="' + id + '"[^>]*onchange="a2SimpanTtd\\(\\)"').test(panel)), 'onchange a2SimpanTtd belum terpasang');
  cek('status simpan ditampilkan', /id="a2_ttd_status"/.test(panel), 'tidak ada penanda status');
  cek('penjelasan "cukup sekali" ada', /sekali/i.test(panel), 'tidak ada penjelasan');
  const simpan = (app.match(/function a2SimpanTtd\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  cek('memakai api khusus, bukan apiSaveSettings', /apiSimpanTandaTanganA2/.test(simpan) && !/apiSaveSettings/.test(simpan), simpan.slice(0, 120));
  const cetak = (app.match(/function cetakA2\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  cek('Cetak tidak lagi memakai apiSaveSettings', !/apiSaveSettings/.test(cetak), 'cetakA2 masih memakai apiSaveSettings');

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_a2_tanda_tangan.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
