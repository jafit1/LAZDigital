/* Uji Pengajuan UMP Kantor Layanan (src/public/js/lz-ump.js, ump-ui.js, ump.html,
 * apiDaftarKantorUmp). Menjaga: formulir C dan D dipilih sendiri-sendiri, baris
 * Nomor tidak ada di kop, VA BPD DIY Syariah pilihan bawaan tanpa nomor, rekening
 * manual wajib lengkap, tanda tangan basah atau digital (PNG bening yang sah saja),
 * latar putih foto tanda tangan dihapus, kertas tetap satu A4 per formulir,
 * pesan WhatsApp, penyimpanan hanya localStorage dan tahan rusak, daftar kantor
 * hanya lewat token link KLL/ULL tanpa data pribadi kantor, dan isian pengajuan
 * tidak pernah dikirim ke server.
 *   node tools/test_ump.js */
'use strict';
const fs = require('fs'), path = require('path');
const AKAR = path.join(__dirname, '..');
global.window = {};
require('../src/public/js/lz-ump.js');
const U = window.LZUmp;
let lulus = 0, gagal = 0;
function cek(n, ok, info) { if (ok) lulus++; else { gagal++; console.log('GAGAL:', n, info === undefined ? '' : JSON.stringify(info).slice(0, 300)); } }

/* Kanvas tiruan: mencatat teks, gambar, dan transform. Lebar huruf ditaksir
   0,52 x ukuran huruf, sedikit lebih lebar dari Calibri supaya uji tinggi
   halaman berada di sisi aman. */
function kanvas(w, h) {
  const k = { width: w, height: h, teks: [], gambar: [], tf: [] };
  let px = 10;
  const c = {
    set font(f) { this._f = f; px = Number((/([\d.]+)px/.exec(f) || [0, 10])[1]); }, get font() { return this._f; },
    measureText: (t) => ({ width: String(t).length * px * 0.52 }),
    fillText: (t, x, y) => k.teks.push({ t, x, y, f: c._f }), drawImage: (...a) => k.gambar.push(a),
    setTransform: (...a) => k.tf.push(a), fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}
  };
  k.getContext = () => c;
  return k;
}
const teks = (k) => k.teks.map((x) => x.t).join(' ').replace(/\s+/g, ' ');
const buat = (s, ttd) => U.halamanKanvas(s, kanvas, ttd);

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
cek('bawaan: VA, tanda tangan basah, belum ada formulir', b0.profil.rek === 'va' && b0.ttd.jenis === 'basah' && !b0.form.c && !b0.form.d);

let s = isi();
cek('tanpa formulir dipilih: ditolak', U.periksa(s).galat.some((g) => g.id === 'f_c'));
s.form.d = true;
cek('D dipilih tanpa jumlah: ditolak', U.periksa(s).galat.some((g) => g.id === 'd_0'));
s.d[7].jumlah = 1000000;
let p = U.periksa(s);
cek('hanya D: lolos', p.galat.length === 0 && p.ada.d && !p.ada.c, p.galat);
s.c[0].jumlah = 5000;
let hal = buat(s), t = teks(hal[0]);
cek('C berisi jumlah tapi tidak dipilih: satu halaman D saja', hal.length === 1 && /F-08-D/.test(t) && !/F-08-C/.test(t));
cek('kop tanpa baris Nomor', !/Nomor|diisi Admin Daerah/.test(t), t.slice(0, 200));
cek('kop memakai nama KLL', /Judul : FORMULIR PENGAJUAN OPERASIONAL KLL KLL : KLL Pajangan/.test(t), t.slice(0, 200));
cek('VA tercetak tanpa nomor', /melalui Virtual Account \(VA\) BPD DIY Syariah KLL Pajangan/.test(t) && !/no rekening/.test(t));
cek('baris jumlah diformat', /BBM AMIL Rp\. 1\.000\.000,00/.test(t));
cek('tanggal di kolom pemohon', /26 Oktober 2026/.test(t));
cek('tanda tangan basah: tidak ada gambar', hal[0].gambar.length === 0);

s.profil.rek = 'manual';
p = U.periksa(s);
cek('manual kosong: bank, nomor, atas nama dilaporkan', ['u_bank', 'u_rekening', 'u_atasnama'].every((id) => p.galat.some((g) => g.id === id)));
Object.assign(s.profil, { bank: 'Bank Contoh', rekening: 'abc', atasNama: 'Lazismu KLL Pajangan' });
cek('rekening bukan angka ditolak', U.periksa(s).galat.some((g) => g.id === 'u_rekening'));
s.profil.rekening = '1234567890';
t = teks(buat(s)[0]);
cek('manual tercetak lengkap', /no rekening 1234567890 atas nama Lazismu KLL Pajangan/.test(t));

/* Tanda tangan digital. */
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
cek('sahTtd: hanya PNG data URL', U.sahTtd(PNG) === PNG && U.sahTtd('javascript:alert(1)') === '' && U.sahTtd('data:image/svg+xml;base64,PHN2Zz4=') === ''
  && U.sahTtd('data:image/png;base64,' + 'A'.repeat(500000)) === '' && U.sahTtd('data:image/png;base64,abc"onerror=x') === '');
s.ttd = { jenis: 'digital', cara: 'gambar', gambar: '' };
cek('digital tanpa gambar: ditolak', U.periksa(s).galat.some((g) => g.id === 'ttd'));
s.ttd.gambar = PNG;
cek('digital dengan gambar: lolos', U.periksa(s).galat.length === 0, U.periksa(s).galat);
const img = { width: 300, height: 100 };
hal = buat(s, img);
cek('digital: gambar tanda tangan ditempel sekali', hal[0].gambar.length === 1 && hal[0].gambar[0][0] === img);
s.ttd.jenis = 'basah';
cek('basah: gambar tersimpan tidak ikut tercetak', buat(s, img)[0].gambar.length === 0);

/* Hapus latar foto: kertas keabuan dan bayangan tipis jadi bening, tinta tetap. */
function foto() {
  const w = 12, h = 10, d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = i % 7 === 0 ? 228 : 246; d.set([v, v, v - 4, 255], i * 4); }
  for (let y = 3; y < 5; y++) for (let x = 2; x < 6; x++) d.set([25, 30, 90, 255], (y * w + x) * 4);
  return { d, w, h };
}
const f = foto(), kotak = U.bersihkanLatar(f.d, f.w, f.h, true);
cek('latar: kotak goresan tepat', kotak && kotak.x === 2 && kotak.y === 3 && kotak.w === 4 && kotak.h === 2, kotak);
cek('latar: kertas dan bayangan tipis bening', f.d[3] === 0 && f.d[(0 * f.w + 7) * 4 + 3] === 0 && f.d[(9 * f.w + 11) * 4 + 3] === 0);
cek('latar: tinta tetap pekat', f.d[(3 * f.w + 2) * 4 + 3] === 255);
const kosong = new Uint8ClampedArray(16 * 4).fill(250);
cek('latar: foto tanpa goresan memberi null', U.bersihkanLatar(kosong, 4, 4, true) === null);

/* Keduanya, ULL, dan satu lembar per formulir. */
s = isi(); s.profil.tipe = 'ULL'; s.profil.kll = 'Masjid Contoh'; s.form.c = true; s.form.d = true;
s.c[0].jumlah = '2.000.000'; s.c[0].asnaf = 'Fakir'; s.c[4].jumlah = 500000; s.d[7].jumlah = 1000000; s.gaji = true;
hal = buat(s);
const tc = teks(hal[0]), td = teks(hal[1]);
cek('keduanya dipilih: dua halaman C lalu D', hal.length === 2 && /F-08-C/.test(tc) && /F-08-D/.test(td));
cek('ULL disebut Unit Layanan', /pelaksana Unit Layanan Lazismu Masjid Contoh/.test(tc) && /KLL : ULL Masjid Contoh/.test(tc));
cek('total C dijumlahkan', /sebesar Rp\. 2\.500\.000 dengan/.test(tc));
cek('delapan pilar dan sembilan biaya tercetak', U.PILAR.every((n) => tc.indexOf(n.toUpperCase()) >= 0) && U.BIAYA.every((n) => td.indexOf(n.toUpperCase()) >= 0));
cek('daftar gaji ada di D', /Daftar Gaji/.test(td));
cek('data biasa: tidak diperkecil', hal.every((k) => k.tf.every((a) => a[0] === 1)), hal.map((k) => k.tf));
const P = U.A4, C = kanvas(1240, 1754);
cek('data biasa: muat di A4', U.gambarHalaman(C.getContext(), s, 'c') <= P.h - P.my);

const w = isi(), W = 'W'.repeat(60); w.form.c = true; w.form.d = true; w.profil.rek = 'manual';
Object.assign(w.profil, { kll: W, bank: W, rekening: '1'.repeat(30), atasNama: W, pemohon: W });
w.c.forEach((r) => { r.jumlah = U.MAKS_RP; r.asnaf = 'Fakir, Miskin, Fi Sabilillah'; r.rincian = 'W'.repeat(48); });
w.d.forEach((r) => { r.jumlah = U.MAKS_RP; r.rincian = 'W'.repeat(48); });
hal = buat(w);
cek('isian terpanjang: diperkecil, tetap dua halaman', hal.length === 2 && hal.every((k) => k.tf.some((a) => a[0] < 1 && a[0] > 0.6)), hal.map((k) => k.tf.map((a) => a[0])));

s = isi(); s.form.c = true; s.c[0].jumlah = 1; s.profil.kll = 'A/B:C*?';
cek('nama berkas aman', U.namaBerkas(s) === 'Pengajuan UMP KLL ABC 2026-10-26.pdf', U.namaBerkas(s));
const pesan = U.pesanWa(Object.assign(isi(), { form: { c: true, d: true }, c: [{ jumlah: 2500000 }], d: [{ jumlah: 1000000 }] }));
cek('pesan WA: kantor, kedua total, VA, pemohon', /KLL Pajangan, 26 Oktober 2026/.test(pesan) && /F-08-C .*Rp 2\.500\.000/.test(pesan)
  && /F-08-D .*Rp 1\.000\.000/.test(pesan) && /VA BPD DIY Syariah/.test(pesan) && /Pemohon: Pemohon Contoh/.test(pesan));

function gudang(rusak) {
  const m = {};
  return { getItem: (k) => { if (rusak === 'baca') throw new Error('x'); return k in m ? m[k] : null; },
    setItem: (k, v) => { if (rusak === 'tulis') throw new Error('penuh'); m[k] = v; }, m };
}
let g = gudang(); s = isi(); s.form.c = true; s.profil.rek = 'manual'; s.c[1].jumlah = 750000; s.tanggal = '2026-01-01';
s.ttd = { jenis: 'digital', cara: 'unggah', gambar: PNG };
cek('simpan berhasil', U.simpan(s, g) === true);
const m = U.muat(g, '2026-10-26');
cek('muat: isian, formulir, rekening, tanda tangan kembali', m.profil.kll === 'Pajangan' && m.c[1].jumlah === 750000 && m.form.c && !m.form.d
  && m.profil.rek === 'manual' && m.ttd.jenis === 'digital' && m.ttd.cara === 'unggah' && m.ttd.gambar === PNG);
cek('muat: tanggal hari ini, bukan tanggal lama', m.tanggal === '2026-10-26');
cek('simpan gagal tidak melempar', U.simpan(s, gudang('tulis')) === false);
cek('baca gagal: kembali kosong', U.muat(gudang('baca'), '2026-10-26').profil.kll === '');
g = gudang(); g.m[U.KUNCI] = '{rusak';
cek('JSON rusak: kembali kosong', U.muat(g, '2026-10-26').profil.kll === '');
g.m[U.KUNCI] = JSON.stringify({ profil: { kll: 'A'.repeat(500), tipe: 'X', rek: 'aneh' }, form: { c: 'ya' }, ttd: { jenis: 'x', gambar: 'javascript:1' },
  c: [{ jumlah: '-9' }, 'x', null], d: 'bukan', gaji: 'ya' });
const r = U.muat(g, '2026-10-26');
cek('isi diubah tangan: dibersihkan', r.profil.kll.length === 60 && r.profil.tipe === 'KLL' && r.profil.rek === 'va' && r.form.c === false
  && r.ttd.jenis === 'basah' && r.ttd.gambar === '' && r.c[0].jumlah === 0 && r.c.length === 8 && r.d.length === 9 && r.gaji === false);

/* Jaringan: hanya ump-ui.js yang boleh memanggil server, sekali, untuk daftar kantor, dengan token saja. */
const baca = (n) => fs.readFileSync(path.join(AKAR, n), 'utf8');
const logika = baca('src/public/js/lz-ump.js'), ui = baca('src/public/js/ump-ui.js'), html = baca('src/public/ump.html');
cek('lz-ump.js dan ump.html tanpa jaringan', !/fetch\s*\(|XMLHttpRequest|sendBeacon|\/api\//.test(logika + html));
cek('ump-ui.js: satu fetch, hanya apiDaftarKantorUmp dengan token', (ui.match(/fetch\s*\(/g) || []).length === 1
  && (ui.match(/panggil\('/g) || []).length === 1 && /panggil\('apiDaftarKantorUmp', \[TOKEN\]\)/.test(ui) && !/XMLHttpRequest|sendBeacon/.test(ui));
cek('dropdown kantor bisa dicari, LZPdf dimuat', /id="u_kantor" data-selalu-cari="1"/.test(ui) && /lz-ui\.js/.test(html) && /lz-pdf\.js/.test(html));
cek('VA di urutan pertama', ui.indexOf("'r_va'") > 0 && ui.indexOf("'r_va'") < ui.indexOf("'r_manual'"));
cek('WA: bagikan berkas, cadangan wa.me tanpa nomor', /navigator\.share\(\{ files: \[f\]/.test(ui) && /'https:\/\/wa\.me\/\?text='/.test(ui));

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
})().catch((e) => { console.error(e); process.exit(1); });
