/* Uji dasbor utama di HP: ukuran widget hasil tarik di komputer tidak boleh ikut ke layar sempit.
 * Pemilik (6 Oktober 2026): kartu "Tunai & Non Tunai" dan "Sebaran Dana" di HP hanya selebar 240 px (60% - 16) dengan
 * tinggi terkunci, isinya meluber. Penyebab: dimensions tersimpan ditulis sebagai gaya sebaris ber-!important, menang
 * atas aturan HP di stylesheet. Yang dijaga: di 390 px semua widget selebar layar tanpa tinggi terkunci dan tanpa
 * geser samping; di 1280 px ukuran tersimpan tetap dipakai; angka kartu Tunai turun ke baris sendiri di HP.
 *   node tools/test_dasbor_hp.js   (memakai tools/potret_dasbor_hp.js, engine asli atas data tiruan) */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const LAY = JSON.stringify({ order: ['rekening', 'jenis', 'activity', 'pilar', 'bank', 'ashnaf', 'program', 'fundraising', 'rhimpun', 'rtasyaruf', 'tren', 'rapb'], vis: {}, size: {}, height: {}, dimensions: { rekening: { pct: 60, height: 300 }, program: { pct: 60, height: 360 } } });
function potret(lebar) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'potret_dasbor_hp.js'), String(lebar), require('os').tmpdir()], { env: Object.assign({}, process.env, { LZ_LAY: LAY }), encoding: 'utf8', timeout: 90000 });
  if (r.status === 2) { console.log('Playwright belum ada, dilewati.'); process.exit(2); }
  const m = (r.stdout || '').match(/\{[\s\S]*\}/);
  if (!m) { console.log('GAGAL| potret tidak menghasilkan data', (r.stderr || '').slice(0, 300)); process.exit(1); }
  return JSON.parse(m[0]);
}
let ok = 0, g = 0;
const cek = (n, s, i) => { if (s) { ok++; console.log('  OK   | ' + n); } else { g++; console.log('  GAGAL| ' + n + (i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 300))); } };
const hp = potret(390);
cek('HP 390: tanpa geser samping', hp.scrollW <= 391, hp.scrollW);
cek('HP 390: semua widget selebar layar (>= 360 px) walau ukuran tersimpan 60%', hp.wc.length >= 10 && hp.wc.every((w) => w.lebar >= 360), hp.wc.map((w) => [w.judul, w.lebar]));
const tn = hp.wc.find((w) => /Tunai/.test(w.judul)), sd = hp.wc.find((w) => /Sebaran/.test(w.judul));
cek('HP 390: Tunai & Non Tunai dan Sebaran Dana tidak terkunci setinggi simpanan (300 / 360)', tn && sd && tn.tinggi !== 300 && sd.tinggi !== 360, [tn && tn.tinggi, sd && sd.tinggi]);
cek('HP 390: tidak ada isi yang meluber dari kartu', hp.wc.every((w) => w.luber.length === 0), hp.wc.filter((w) => w.luber.length));
const kom = potret(1280);
const t2 = kom.wc.find((w) => /Tunai/.test(w.judul));
cek('Komputer 1280: ukuran tersimpan tetap dipakai (Tunai & Non Tunai 300 px tinggi, tidak penuh)', t2 && t2.tinggi === 300 && t2.lebar < 1000, t2);
console.log('\ntest_dasbor_hp.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
process.exit(g ? 1 : 0);
