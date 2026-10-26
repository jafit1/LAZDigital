/* Uji Pengajuan UMP Kantor Layanan (src/public/js/lz-ump.js, ump-ui.js, ump.html,
 * apiDaftarKantorUmp). Menjaga: formulir C dan D dipilih sendiri-sendiri, VA BPD
 * DIY Syariah sebagai pilihan bawaan tanpa nomor, rekening manual wajib lengkap,
 * nominal dan teks dibersihkan, isian di-escape, penyimpanan hanya localStorage
 * dan tahan rusak, daftar kantor hanya lewat token link KLL/ULL dan tanpa data
 * pribadi kantor, serta isian pengajuan tidak pernah dikirim ke server.
 *   node tools/test_ump.js */
'use strict';
const fs = require('fs'), path = require('path');
const AKAR = path.join(__dirname, '..');
global.window = {};
require('../src/public/js/lz-ump.js');
const U = window.LZUmp;
let lulus = 0, gagal = 0;
function cek(n, ok, info) { if (ok) lulus++; else { gagal++; console.log('GAGAL:', n, info === undefined ? '' : info); } }

cek('angka: titik ribuan dibaca', U.angka('1.500.000') === 1500000);
cek('angka: sampah dan minus jadi 0', U.angka('abc') === 0 && U.angka(-5) === 0 && U.angka('-9') === 0 && U.angka(null) === 0);
cek('angka: dibatasi maksimum', U.angka('99999999999999') === U.MAKS_RP);
cek('fmt: ribuan', U.fmt(1234567) === '1.234.567' && U.fmt(0) === '0');
cek('tanggal 30 Februari ditolak', U.sahTanggal('2026-02-30') === '' && U.sahTanggal('besok') === '');
cek('tanggal panjang', U.tanggalPanjang('2026-10-26') === '26 Oktober 2026');

function isi() {
  const s = U.baru('2026-10-26');
  Object.assign(s.profil, { kll: 'Pajangan', tipe: 'KLL', pemohon: 'Pemohon Contoh' });
  return s;
}
const b0 = U.baru('2026-10-26');
cek('bawaan: VA terpilih, belum ada formulir dipilih', b0.profil.rek === 'va' && !b0.form.c && !b0.form.d);

let s = isi();
cek('tanpa formulir dipilih: ditolak', U.periksa(s).galat.some(g => g.id === 'f_c'));
s.form.d = true;
cek('D dipilih tanpa jumlah: ditolak', U.periksa(s).galat.some(g => g.id === 'd_0'));
s.d[7].jumlah = 1000000;
let p = U.periksa(s);
cek('hanya D: lolos, C tidak ikut', p.galat.length === 0 && p.ada.d && !p.ada.c, JSON.stringify(p.galat));
cek('VA: bank dan rekening tidak wajib', !p.galat.some(g => /u_bank|u_rekening|u_atasnama/.test(g.id)));
s.c[0].jumlah = 5000;
let h = U.bangunHTML(s);
cek('C berisi jumlah tapi tidak dipilih: tidak tercetak', !/F-08-C/.test(h) && /F-08-D/.test(h));
cek('VA tercetak tanpa nomor', /Virtual Account \(VA\) BPD DIY Syariah<\/b> KLL Pajangan/.test(h) && !/no rekening/.test(h));
cek('kop memakai nama KLL', /<b>KLL Pajangan<\/b>/.test(h));

s.profil.rek = 'manual';
p = U.periksa(s);
cek('manual kosong: bank, nomor, atas nama dilaporkan', ['u_bank', 'u_rekening', 'u_atasnama'].every(id => p.galat.some(g => g.id === id)));
Object.assign(s.profil, { bank: 'Bank Contoh', rekening: 'abc', atasNama: 'Lazismu KLL Pajangan' });
cek('rekening bukan angka ditolak', U.periksa(s).galat.some(g => g.id === 'u_rekening'));
s.profil.rekening = '1234567890';
h = U.bangunHTML(s);
cek('manual tercetak lengkap', /no rekening <b>1234567890<\/b> atas nama <b>Lazismu KLL Pajangan<\/b>/.test(h));

s = isi(); s.profil.tipe = 'ULL'; s.profil.kll = 'Masjid Contoh'; s.form.c = true; s.form.d = true;
s.c[0].jumlah = '2.000.000'; s.c[0].asnaf = 'Fakir'; s.c[4].jumlah = 500000; s.d[7].jumlah = 1000000; s.gaji = true;
h = U.bangunHTML(s);
cek('keduanya dipilih: dua halaman', (h.match(/<section class="hal">/g) || []).length === 2);
cek('ULL disebut Unit Layanan', /pelaksana Unit Layanan Lazismu <b>Masjid Contoh<\/b>/.test(h) && /<b>ULL Masjid Contoh<\/b>/.test(h));
cek('total C dijumlahkan', h.indexOf('<b>Rp. 2.500.000</b>') > 0);
cek('baris diformat', /Rp\. 2\.000\.000,00/.test(h) && /Rp\. 1\.000\.000,00/.test(h));
cek('delapan pilar dan sembilan biaya tercetak', U.PILAR.every(n => h.indexOf(n) > 0) && U.BIAYA.every(n => h.indexOf(U.esc(n)) > 0));
cek('daftar gaji dicentang', /kotak"><svg/.test(h));
cek('bagian Admin dibiarkan kosong', /diisi Admin Daerah/.test(h));

s = isi(); s.form.c = true; s.c[0].jumlah = 1; s.profil.kll = '<img src=x onerror=alert(1)>'; s.c[0].rincian = '<script>x</script>';
h = U.bangunHTML(s);
cek('XSS di-escape', h.indexOf('<img src=x') < 0 && h.indexOf('<script>x') < 0 && /&lt;img/.test(h));

function gudang(rusak) {
  const m = {};
  return { getItem: k => { if (rusak === 'baca') throw new Error('x'); return k in m ? m[k] : null; },
    setItem: (k, v) => { if (rusak === 'tulis') throw new Error('penuh'); m[k] = v; }, m };
}
let g = gudang(); s = isi(); s.form.c = true; s.profil.rek = 'manual'; s.c[1].jumlah = 750000; s.tanggal = '2026-01-01';
cek('simpan berhasil', U.simpan(s, g) === true);
const m = U.muat(g, '2026-10-26');
cek('muat: isian, pilihan formulir, dan jenis rekening kembali', m.profil.kll === 'Pajangan' && m.c[1].jumlah === 750000 && m.form.c && !m.form.d && m.profil.rek === 'manual');
cek('muat: tanggal hari ini, bukan tanggal lama', m.tanggal === '2026-10-26');
cek('simpan gagal tidak melempar', U.simpan(s, gudang('tulis')) === false);
cek('baca gagal: kembali kosong', U.muat(gudang('baca'), '2026-10-26').profil.kll === '');
g = gudang(); g.m[U.KUNCI] = '{rusak';
cek('JSON rusak: kembali kosong', U.muat(g, '2026-10-26').profil.kll === '');
g.m[U.KUNCI] = JSON.stringify({ profil: { kll: 'A'.repeat(500), tipe: 'X', rek: 'aneh' }, form: { c: 'ya' }, c: [{ jumlah: '-9' }, 'x', null], d: 'bukan', gaji: 'ya' });
const r = U.muat(g, '2026-10-26');
cek('isi diubah tangan: dibersihkan', r.profil.kll.length === 60 && r.profil.tipe === 'KLL' && r.profil.rek === 'va' && r.form.c === false
  && r.c[0].jumlah === 0 && r.c.length === 8 && r.d.length === 9 && r.gaji === false);

/* Jaringan: hanya ump-ui.js yang boleh memanggil server, sekali, untuk daftar kantor, dengan token saja. */
const baca = f => fs.readFileSync(path.join(AKAR, f), 'utf8');
const logika = baca('src/public/js/lz-ump.js'), ui = baca('src/public/js/ump-ui.js'), html = baca('src/public/ump.html');
cek('lz-ump.js dan ump.html tanpa jaringan', !/fetch\s*\(|XMLHttpRequest|sendBeacon|\/api\//.test(logika + html));
cek('ump-ui.js: satu fetch, hanya apiDaftarKantorUmp dengan token', (ui.match(/fetch\s*\(/g) || []).length === 1
  && (ui.match(/panggil\('/g) || []).length === 1 && /panggil\('apiDaftarKantorUmp', \[TOKEN\]\)/.test(ui) && !/XMLHttpRequest|sendBeacon/.test(ui));
cek('dropdown kantor bisa dicari', /id="u_kantor" data-selalu-cari="1"/.test(ui) && /lz-ui\.js/.test(html));
cek('VA di urutan pertama', ui.indexOf("'r_va'") > 0 && ui.indexOf("'r_va'") < ui.indexOf("'r_manual'"));

(async () => {
  const engine = require(path.join(AKAR, 'api', '_engine.js'));
  const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
  const sh = {}; for (const n of skema.NAMA_TABEL) sh[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';
  let DB = (await engine.runRPC({ sheets: sh, props: {} }, 'setup', [], {})).db;
  const rpc = async (fn, args) => { const o = await engine.runRPC(DB, fn, args, {}); DB = o.db; return o.result; };
  const salah = async (fn, args) => { try { await rpc(fn, args); return ''; } catch (e) { return e.message; } };
  const T = (await rpc('login', ['superadmin', 'Admin12345'])).token;
  await rpc('apiSaveLayanan', [T, { tipe: 'KLL', nama: 'Pajangan', aktif: 'true', telepon: '081200000000', penanggungJawab: 'PJ Rahasia' }]);
  await rpc('apiSaveLayanan', [T, { tipe: 'ULL', nama: 'Masjid Contoh', aktif: 'true' }]);
  await rpc('apiSaveLayanan', [T, { tipe: 'KLL', nama: 'Tutup Contoh', aktif: 'false' }]);
  cek('sebelum link KLL/ULL dibuat: ditolak', /tidak valid/i.test(await salah('apiDaftarKantorUmp', ['a'.repeat(40)])));
  const lk = await rpc('apiBuatLinkHarian', [T, 'kantor']);
  const ld = await rpc('apiBuatLinkHarian', [T, 'donatur']);
  cek('token donatur ditolak', /tidak valid/i.test(await salah('apiDaftarKantorUmp', [ld.token])));
  cek('token kosong ditolak', /tidak valid/i.test(await salah('apiDaftarKantorUmp', [''])));
  const d = await rpc('apiDaftarKantorUmp', [lk.token]);
  cek('daftar: hanya kantor aktif, KLL dulu', JSON.stringify(d.kantor) === JSON.stringify([{ tipe: 'KLL', nama: 'Pajangan' }, { tipe: 'ULL', nama: 'Masjid Contoh' }]), d.kantor);
  cek('daftar: tanpa telepon dan penanggung jawab', !/0812|Rahasia/.test(JSON.stringify(d)));
  await rpc('apiMatikanLinkHarian', [T, 'kantor']);
  cek('link dimatikan: ditolak', /tidak valid/i.test(await salah('apiDaftarKantorUmp', [lk.token])));

  console.log(lulus + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('test_ump.js  ' + lulus + '/' + lulus + '  SEMUA LULUS');
})().catch(e => { console.error(e); process.exit(1); });
