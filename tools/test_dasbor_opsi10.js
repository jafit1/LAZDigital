/* Uji dasbor Opsi 10 Hybrid (keputusan pemilik, 25 November 2026).
 * Yang dijaga:
 *  - Kartu "Monitoring Kantor Layanan" (setoran per kantor, tanpa status LPJ) tampil di tata bawaan,
 *    dan tetap tampil bagi yang punya layout tersimpan versi lama (migrasi satu kali ke tata baru).
 *  - Grid: baris berpasangan 62/38 dengan lebar konsisten antar baris (lebar Tren Arus Dana sama dengan
 *    lebar Monitoring Kantor Layanan); empat kartu seperempat benar-benar sebaris; RAPB lebar penuh.
 *  - HP 390: KPI jadi dua kolom (empat kartu, dua baris), kartu non-inti terlipat jadi baris judul
 *    (Tren, Pilar, Monitoring tetap terbuka), tanpa geser samping, tanpa isi meluber.
 *   node tools/test_dasbor_opsi10.js   (memakai tools/potret_dasbor_hp.js, engine asli atas data tiruan) */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const LAY_LAMA = JSON.stringify({ order: ['rekening', 'jenis', 'activity', 'pilar', 'bank', 'ashnaf', 'program', 'fundraising', 'rhimpun', 'rtasyaruf', 'tren', 'rapb'], vis: { bank: false, rekening: false }, size: {}, height: {}, dimensions: { rekening: { pct: 60, height: 300 }, program: { pct: 60, height: 360 } } });
function potret(lebar, lay) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'potret_dasbor_hp.js'), String(lebar), require('os').tmpdir()], { env: Object.assign({}, process.env, { LZ_LAY: lay || '' }), encoding: 'utf8', timeout: 120000 });
  if (r.status === 2) { console.log('Playwright belum ada, dilewati.'); process.exit(2); }
  const m = (r.stdout || '').match(/\{[\s\S]*\}/);
  if (!m) { console.log('GAGAL| potret tidak menghasilkan data', (r.stderr || '').slice(0, 300)); process.exit(1); }
  return JSON.parse(m[0]);
}
let ok = 0, g = 0;
const cek = (n, s, i) => { if (s) { ok++; console.log('  OK   | ' + n); } else { g++; console.log('  GAGAL| ' + n + (i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 400))); } };
const cari = (u, judul) => u.wc.find((w) => w.judul && w.judul.indexOf(judul) >= 0);

/* ===== Desktop 1280: tata Opsi 10 ===== */
const kom = potret(1280);
const gridW = Math.max(...kom.wc.map((w) => w.kiri + w.lebar)) - Math.min(...kom.wc.map((w) => w.kiri));
const tren = cari(kom, 'Tren Arus Dana'), pil = cari(kom, 'Pilar Program'), mon = cari(kom, 'Monitoring Kantor Layanan'), rapb = cari(kom, 'Target & Realisasi RAPB');
cek('Komputer 1280: kartu Monitoring Kantor Layanan ada di tata bawaan', !!mon, kom.wc.map((w) => w.judul));
cek('Komputer 1280: urutan bawaan Tren -> Pilar -> Monitoring', kom.wc[0].judul === 'Tren Arus Dana' && kom.wc[1].judul === 'Pilar Program' && kom.wc[2].judul === 'Monitoring Kantor Layanan', kom.wc.slice(0, 4).map((w) => w.judul));
cek('Komputer 1280: Tren lebih lebar dari Pilar (pasangan 62/38)', tren && pil && tren.lebar > pil.lebar * 1.5, tren && pil && [tren.lebar, pil.lebar]);
cek('Komputer 1280: lebar antar baris konsisten (Tren == Monitoring)', tren && mon && Math.abs(tren.lebar - mon.lebar) <= 6, tren && mon && [tren.lebar, mon.lebar]);
const KUART = ['Penyaluran Berdasarkan Ashnaf', 'Capaian Fundraising', 'Penghimpunan Terbaru', 'Pentasyarufan Terbaru'].map((j) => cari(kom, j));
cek('Komputer 1280: empat kartu seperempat sebaris dan sama lebar',
  KUART.every((w) => w) && new Set(KUART.map((w) => Math.round(w.atas / 4))).size === 1 && Math.max(...KUART.map((w) => w.lebar)) - Math.min(...KUART.map((w) => w.lebar)) <= 6,
  KUART.map((w) => w && [w.judul, w.kiri, w.atas, w.lebar]));
cek('Komputer 1280: RAPB memenuhi lebar grid (kartu penuh, tidak menyisakan lubang)', rapb && rapb.lebar >= gridW * 0.9, rapb && [rapb.lebar, gridW]);
cek('Komputer 1280: Pilar sebaris Tren, sama tinggi, dan tidak menggantung kosong',
  pil && tren && Math.abs(pil.tinggi - tren.tinggi) <= 6 && pil.tinggi < 340, pil && tren && [pil.tinggi, tren.tinggi]);
cek('Komputer 1280: tidak ada isi yang meluber dari kartu', kom.wc.every((w) => w.luber.length === 0), kom.wc.filter((w) => w.luber.length));

/* ===== HP 390, tanpa layout tersimpan ===== */
const hp = potret(390);
const kpiAtas = [...new Set(hp.kpi.map((k) => Math.round(k.atas / 4)))];
const kpiKiri = [...new Set(hp.kpi.map((k) => Math.round(k.kiri / 6)))];
cek('HP 390: empat kartu KPI', hp.kpi.length === 4, hp.kpi.map((k) => k.label));
cek('HP 390: KPI tersusun dua kolom (dua baris, dua kolom)', kpiAtas.length === 2 && kpiKiri.length === 2, { atas: kpiAtas, kiri: kpiKiri });
cek('HP 390: kartu Monitoring Kantor Layanan ada', !!cari(hp, 'Monitoring Kantor Layanan'), hp.wc.map((w) => w.judul));
const monHp = cari(hp, 'Monitoring Kantor Layanan'), actHp = cari(hp, 'Aktivitas Transaksi Terakhir'), jnsHp = cari(hp, 'Komposisi Jenis Dana');
cek('HP 390: Tren, Pilar, dan Monitoring terbuka; kartu lain terlipat jadi baris judul',
  monHp && monHp.isiTampil && cari(hp, 'Tren Arus Dana').isiTampil && cari(hp, 'Pilar Program').isiTampil && actHp && !actHp.isiTampil && jnsHp && !jnsHp.isiTampil,
  hp.wc.map((w) => [w.judul, w.isiTampil]));
cek('HP 390: tanpa geser samping', hp.scrollW <= 391, hp.scrollW);
cek('HP 390: semua widget selebar layar', hp.wc.length >= 10 && hp.wc.every((w) => w.lebar >= 358), hp.wc.map((w) => [w.judul, w.lebar]));
cek('HP 390: tidak ada isi yang meluber dari kartu', hp.wc.every((w) => w.luber.length === 0), hp.wc.filter((w) => w.luber.length));

/* ===== HP 390, layout tersimpan versi lama: dimigrasi sekali ke tata baru ===== */
const hpLama = potret(390, LAY_LAMA);
const monLama = cari(hpLama, 'Monitoring Kantor Layanan');
cek('HP 390 (layout lama): Monitoring tetap muncul — tata baru berlaku untuk semua', !!monLama, hpLama.wc.map((w) => w.judul));
cek('HP 390 (layout lama): ukuran tarikan lama tidak ikut menekan kartu', hpLama.wc.every((w) => w.lebar >= 358 && w.tinggi !== 300 && w.tinggi !== 360), hpLama.wc.map((w) => [w.judul, w.lebar, w.tinggi]));
cek('HP 390 (layout lama): tanpa geser samping', hpLama.scrollW <= 391, hpLama.scrollW);

console.log('\ntest_dasbor_opsi10.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
process.exit(g ? 1 : 0);
