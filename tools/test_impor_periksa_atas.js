/* Uji: panel "Perlu diperiksa" di paling atas layar impor jurnal, dengan
 * pengubahan manual langsung di baris yang dicurigai.
 *
 * Pemilik (22 Oktober 2026): "kalau ada yang dicurigai belum sesuai tampilkan
 * di bagian paling atas agar saya mudah mendeteksi dan juga bisa langsung
 * mengubahnya manual".
 *
 * Sebelumnya temuan tersebar: kartu kantor di fokus, "Pemeriksaan lain" yang
 * terlipat, penanda kuning kecil di tabel, tabel tanggal. Footer menyebut "3
 * temuan belum diputuskan" tanpa menunjukkan di mana.
 *
 * Fungsi aslinya diambil dari app.js dan dijalankan apa adanya, bukan ditiru.
 * Datanya BUATAN, repositori ini publik.
 *
 *   node tools/test_impor_periksa_atas.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 260)); }
};

function ambil(nama) {
  const i = app.indexOf('function ' + nama + '(');
  if (i < 0) return '';
  let d = 0; const j = app.indexOf('{', i);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  return '';
}
const daftar = app.slice(app.indexOf('var JENIS_TOP'), app.indexOf('var METODE'));
const kode = daftar + '\n' + ['imporKumpulCurigai', 'imporTerapkanManual', 'imporPasangKantor', 'imporJadikanDaerah'].map(ambil).join('\n')
  + '\nreturn { kumpul: typeof imporKumpulCurigai === "function" ? imporKumpulCurigai : null, terapkan: typeof imporTerapkanManual === "function" ? imporTerapkanManual : null };';
const F = new Function(kode)();

console.log('\n=== A. FUNGSI ADA ===');
cek('imporKumpulCurigai ada', !!F.kumpul);
cek('imporTerapkanManual ada', !!F.terapkan);
if (!F.kumpul || !F.terapkan) { console.log('\n=== HASIL ===\n' + ok + ' lulus, ' + gagal + ' gagal.'); process.exit(1); }

const bikin = () => {
  const himpun = [
    { tanggal: '2026-10-01', namaDonatur: 'Normal Satu', jumlah: 1000000, jenisDana: 'Zakat', subJenis: 'Zakat Mal', pilar: '' },
    { tanggal: '2026-10-02', namaDonatur: 'Beda Dana', jumlah: 200000, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '', bedaDana: true },
    { tanggal: '2026-10-03', namaDonatur: 'KLL Imogiri', jumlah: 300000, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '' },
    { tanggal: '2026-10-04', namaDonatur: 'KLL Imogiri', jumlah: 400000, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '' },
    { tanggal: '2026-10-05', namaDonatur: 'NN', jumlah: 500, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '' },
    { tanggal: '2026-10-06', namaDonatur: 'Sudah Ada', jumlah: 700000, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '', isDuplicate: true },
    { tanggal: '2026-10-07', namaDonatur: 'Dilewati', jumlah: 800000, jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: '', _lewati: true },
  ];
  const salur = [
    { tanggal: '2026-10-08', namaPenerima: 'Penerima Satu', jumlah: 900000, program: 'Beasiswa', tglBeda: { debet: '2026-10-08', kredit: '2026-09-08' } },
  ];
  const res = {
    temuan: [
      { id: 't1', jenis: 'kantorTakTerdaftar', tingkat: 'perlu', judul: 'Kantor "KLL Imogiri" tidak terdaftar', pesan: 'x',
        baris: [{ kumpulan: 'himpun', idx: 2 }, { kumpulan: 'himpun', idx: 3 }] },
      { id: 't2', jenis: 'nominalKecil', tingkat: 'info', judul: 'Nominal sangat kecil (Rp 500)', pesan: 'y', baris: [{ kumpulan: 'himpun', idx: 4 }] },
      { id: 't3', jenis: 'rekapJumlah', tingkat: 'perlu', judul: 'Nominal beda dengan rekap', pesan: 'z', baris: [{ kumpulan: 'himpun', idx: 0 }] },
      { id: 't4', jenis: 'berkasTakLengkap', tingkat: 'perlu', judul: 'Berkas bank tampak tidak lengkap', pesan: 'w', baris: [] },
      { id: 't5', jenis: 'luarBulan', tingkat: 'perlu', judul: 'Tanggal di luar Oktober', pesan: 'v', baris: [{ kumpulan: 'himpun', idx: 6 }] },
      { id: 't6', jenis: 'pilarTakCocok', tingkat: 'perlu', status: 'dibiarkan', judul: 'Sudah diputuskan', pesan: 'u', baris: [{ kumpulan: 'himpun', idx: 0 }] },
    ],
    anomaliTanggal: [{ jenis: 'Pentasyarufan', kumpulan: 'salur', idx: 0, tglDebet: '2026-10-08', tglKredit: '2026-09-08' }],
  };
  return { res, peta: { himpun, salur, ump: [], transfer: [] } };
};

console.log('\n=== B. YANG DICURIGAI DIKUMPULKAN ===');
let { res, peta } = bikin();
let hasil = F.kumpul(res, peta);
const kunci = (hasil.baris || []).map((x) => x.kumpulan + ':' + x.idx);
cek('hasilnya memuat daftar baris dan daftar umum', Array.isArray(hasil.baris) && Array.isArray(hasil.umum), Object.keys(hasil));
cek('baris dari temuan "perlu" masuk', kunci.includes('himpun:2') && kunci.includes('himpun:3'), kunci);
cek('baris dari temuan "info" (nominal kecil) masuk', kunci.includes('himpun:4'), kunci);
cek('baris beda jenis dana masuk', kunci.includes('himpun:1'), kunci);
cek('baris anomali tanggal masuk', kunci.includes('salur:0'), kunci);
cek('baris normal tidak masuk', !kunci.includes('himpun:0'), kunci);
cek('baris duplikat tidak masuk (sudah ada bar "Lewati semua")', !kunci.includes('himpun:5'), kunci);
cek('baris yang dilewati tidak masuk', !kunci.includes('himpun:6'), kunci);
cek('temuan rekap tidak masuk (punya bagian perbandingan sendiri)', !kunci.includes('himpun:0'), kunci);
cek('temuan yang sudah diputuskan tidak masuk', !(hasil.baris || []).some((x) => (x.temuan || []).includes('t6')), hasil.baris);
cek('temuan tanpa baris masuk ke daftar umum', (hasil.umum || []).some((t) => t.id === 't4'), hasil.umum);
const imogiri = (hasil.baris || []).find((x) => x.kumpulan === 'himpun' && x.idx === 2) || {};
cek('alasan menyebut temuannya', (imogiri.alasan || []).some((a) => /tidak terdaftar/.test(a)), imogiri);
const urutan = (hasil.baris || []).map((x) => x.berat);
cek('yang berat (perlu/anomali) di depan yang info', urutan.indexOf(false) === -1 || urutan.lastIndexOf(true) < urutan.indexOf(false), urutan);

console.log('\n=== C. MENGUBAH MANUAL ===');
({ res, peta } = bikin());
let item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 1);
let sah = F.terapkan(item, { tanggal: '2026-10-12', nama: 'Hamba Allah', jenisDana: 'Zakat', subJenis: 'Zakat Mal', pilar: '', jumlah: 250000 }, peta, res);
const r1 = peta.himpun[1];
cek('mengembalikan true', sah === true, sah);
cek('tanggal berubah', r1.tanggal === '2026-10-12', r1.tanggal);
cek('nama berubah', r1.namaDonatur === 'Hamba Allah', r1.namaDonatur);
cek('jenis dan sub jenis berubah', r1.jenisDana === 'Zakat' && r1.subJenis === 'Zakat Mal', r1);
cek('jumlah berubah', r1.jumlah === 250000, r1.jumlah);
cek('penanda beda dana dilepas', r1.bedaDana === false, r1.bedaDana);
cek('baris ditandai sudah diperiksa', r1._diperiksa === true);
cek('baris itu tidak muncul lagi di daftar curiga',
  !F.kumpul(res, peta).baris.some((x) => x.kumpulan === 'himpun' && x.idx === 1), F.kumpul(res, peta).baris.map((x) => x.kumpulan + ':' + x.idx));

({ res, peta } = bikin());
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
F.terapkan(item, { tanggal: 'bukan-tanggal', nama: '', jenisDana: 'Ngawur', subJenis: 'Ngawur', pilar: 'Ngawur', jumlah: -5 }, peta, res);
const r2 = peta.himpun[2];
cek('tanggal tidak sah ditolak (nilai lama dipertahankan)', r2.tanggal === '2026-10-03', r2.tanggal);
cek('nama kosong ditolak', r2.namaDonatur === 'KLL Imogiri', r2.namaDonatur);
cek('jenis dana di luar daftar ditolak', r2.jenisDana === 'Infak', r2.jenisDana);
cek('pilar di luar daftar ditolak', r2.pilar === '', r2.pilar);
cek('jumlah nol atau minus ditolak', r2.jumlah === 300000, r2.jumlah);

({ res, peta } = bikin());
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
F.terapkan(item, { jenisDana: 'Zakat' }, peta, res);
cek('ganti jenis dana: sub jenis yang tak cocok direset ke yang sah', peta.himpun[2].jenisDana === 'Zakat' && peta.himpun[2].subJenis === 'Zakat Mal', peta.himpun[2]);
({ res, peta } = bikin());
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
F.terapkan(item, { jenisDana: 'Infak', subJenis: 'Infak Terikat', pilar: 'Kesehatan' }, peta, res);
cek('infak terikat boleh memakai pilar', peta.himpun[2].subJenis === 'Infak Terikat' && peta.himpun[2].pilar === 'Kesehatan', peta.himpun[2]);
({ res, peta } = bikin());
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
F.terapkan(item, { jenisDana: 'Infak', subJenis: 'Infak Umum', pilar: 'Kesehatan' }, peta, res);
cek('pilar dibuang bila bukan infak terikat', peta.himpun[2].pilar === '', peta.himpun[2]);

console.log('\n=== C2. PINDAH KANTOR LANGSUNG ===');
({ res, peta } = bikin());
res.daftarKantor = [{ id: 'l9', tipe: 'KLL', nama: 'Imogiri', label: 'KLL Imogiri' }];
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
peta.himpun[2].namaDonatur = 'Imogiri Infak';
sah = F.terapkan(item, { kantor: 'l9' }, peta, res);
const rk = peta.himpun[2];
cek('pindah kantor berhasil', sah === true, item.galat);
cek('layananId terisi', rk.layananId === 'l9', rk);
cek('tipe donatur jadi KLL, bukan Perorangan', /KLL/.test(rk.tipeDonatur || ''), rk.tipeDonatur);
cek('nama ikut jadi KLL Imogiri', rk.namaDonatur === 'KLL Imogiri', rk.namaDonatur);
({ res, peta } = bikin());
res.daftarKantor = [{ id: 'l9', tipe: 'KLL', nama: 'Imogiri', label: 'KLL Imogiri' }];
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
sah = F.terapkan(item, { kantor: 'tidak-ada' }, peta, res);
cek('kantor yang tidak ada di daftar ditolak, baris tidak berubah', sah === false && peta.himpun[2].layananId === undefined && peta.himpun[2].namaDonatur === 'KLL Imogiri', item.galat);
({ res, peta } = bikin());
res.daftarKantor = [{ id: 'l9', tipe: 'KLL', nama: 'Imogiri', label: 'KLL Imogiri' }];
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
sah = F.terapkan(item, { kantor: '__DAERAH__' }, peta, res);
cek('pilih Daerah: tanda KLL dibuang dari nama', sah === true && peta.himpun[2].namaDonatur === 'Imogiri' && !peta.himpun[2].layananId, peta.himpun[2]);
({ res, peta } = bikin());
item = F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'himpun' && x.idx === 2);
sah = F.terapkan(item, { kantor: '' }, peta, res);
cek('kantor kosong berarti tidak diubah', sah === true && peta.himpun[2].namaDonatur === 'KLL Imogiri', peta.himpun[2]);

console.log('\n=== D. TEMUAN IKUT SELESAI BILA SEMUA BARISNYA DIPERIKSA ===');
({ res, peta } = bikin());
const t1 = res.temuan.find((t) => t.id === 't1');
F.terapkan(F.kumpul(res, peta).baris.find((x) => x.idx === 2), { nama: 'KLL Imogiri' }, peta, res);
cek('satu dari dua baris diperiksa: temuan masih menunggu', !t1.status, t1.status);
F.terapkan(F.kumpul(res, peta).baris.find((x) => x.idx === 3), { nama: 'KLL Imogiri' }, peta, res);
cek('semua baris diperiksa: temuan jadi diterapkan', t1.status === 'diterapkan', t1.status);
cek('ditandai diputuskan sendiri', t1.oleh === 'sendiri', t1.oleh);
cek('status menyebut diubah manual', /manual/i.test(t1.statusTeks || ''), t1.statusTeks);

console.log('\n=== E. ANOMALI TANGGAL ===');
({ res, peta } = bikin());
F.terapkan(F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'salur'), { tanggal: '2026-10-08' }, peta, res);
cek('anomali tanggal ditandai beres', res.anomaliTanggal[0].beres === true, res.anomaliTanggal[0]);
cek('penanda beda tanggal dilepas dari baris', peta.salur[0].tglBeda === null, peta.salur[0].tglBeda);
({ res, peta } = bikin());
F.terapkan(F.kumpul(res, peta).baris.find((x) => x.kumpulan === 'salur'), { tanggal: 'rusak' }, peta, res);
cek('tanggal rusak tidak menandai anomali beres', !res.anomaliTanggal[0].beres, res.anomaliTanggal[0]);

console.log('\n=== F. DI LAYAR ===');
const gambar = ambil('imporGambarJurnal');
const iPanel = gambar.indexOf('imporPanelPeriksa(res)');
cek('imporGambarJurnal memasang panel', iPanel >= 0, 'panel tidak dipasang');
cek('panel di paling atas: sebelum "Terbaca sebagai"', iPanel >= 0 && iPanel < gambar.indexOf('Terbaca sebagai'), iPanel);
cek('panel di paling atas: sebelum blok temuan', iPanel >= 0 && iPanel < gambar.indexOf('imporBlokTemuan(res)'), iPanel);
const panel = ambil('imporPanelPeriksa');
cek('fungsi panel ada', !!panel);
cek('nama dan isian lewat esc() (anti XSS)', /esc\(/.test(panel) && !/\+\s*r\.namaDonatur\s*\+/.test(panel), 'ada nilai mentah');
cek('tombol Ubah dipasang setelah digambar (dipanggil di dalam imporGambarJurnal)', /imporPasangPeriksa\(\);/.test(gambar), 'imporPasangPeriksa tidak dipanggil di imporGambarJurnal');

console.log('\n=== G. "SUDAH BENAR" TANPA UBAHAN ===');
({ res, peta } = bikin());
const tb1 = res.temuan.find((t) => t.id === 't1');
F.terapkan(F.kumpul(res, peta).baris.find((x) => x.idx === 2), {}, peta, res);
F.terapkan(F.kumpul(res, peta).baris.find((x) => x.idx === 3), {}, peta, res);
cek('semua baris ditandai benar tanpa mengubah: temuan jadi dibiarkan', tb1.status === 'dibiarkan', tb1.status);
cek('statusnya tidak berbohong soal "diubah manual"', !/diubah manual/.test(tb1.statusTeks || ''), tb1.statusTeks);
cek('nilai barisnya tidak berubah', peta.himpun[2].namaDonatur === 'KLL Imogiri' && peta.himpun[2].jumlah === 300000, peta.himpun[2]);

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) process.exit(1);
console.log('\ntest_impor_periksa_atas.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
