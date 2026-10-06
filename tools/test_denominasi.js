/* Uji denominasi acak Formulir A2 (src/public/js/lz-denominasi.js).
   Menjaga: jumlah selalu pas, tidak ada hitungan negatif, ratusan ditutup koin 200/100,
   kelipatan 1.000 tetap berkoin 500/1.000, uang kertas bervariasi, sesekali ada yang kosong,
   dan hasilnya diingat di layar (A2_ACAK) supaya cetak sama dengan pratinjau. */
const fs = require('fs'), path = require('path');
global.window = {};
require('../src/public/js/lz-denominasi.js');
const D = window.LZDenominasi;
let lulus = 0, gagal = 0;
function cek(nama, ok, info) { if (ok) lulus++; else { gagal++; console.log('GAGAL:', nama, info || ''); } }

/* acak berbiji supaya uji bisa diulang */
function bibit(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const total = [100, 200, 300, 500, 1000, 1500, 2000, 3000, 12700, 50000, 125000, 299700, 1234500, 9252100, 20375000, 29627100, 1001, 99, 150, 12750];
for (let i = 0; i < 400; i++) total.push(Math.floor(Math.random() * 40000) * 100 + (i % 7 === 0 ? 50 : 0));

let kosongAda = false, jenisTerpakai = new Set(), koinSeribuAtauLimaRatus = 0, bulatBerkoin = 0, bulat = 0;
total.forEach(function (t, i) {
  const h = D.acak(t, bibit(i + 1));
  const neg = Object.keys(h).filter(k => h[k] < 0 || !Number.isInteger(h[k]));
  cek('tidak negatif/pecahan ' + t, neg.length === 0, neg.join());
  cek('jumlah pas ' + t, D.jumlah(h) === t, D.jumlah(h));
  cek('sisa hanya bila bukan kelipatan 100 ' + t, h.sisa === t % 100);
  const rat = (t - t % 100) % 1000;
  if (rat > 0 && t >= 1000) cek('ratusan ditutup koin 100/200 ' + t, (h.k100 + h.k200) > 0);
  if (rat >= 300) cek('ratusan>=300 memakai 200 dan 100 ' + t, h.k200 > 0 && h.k100 > 0);
  if (rat === 0 && t % 100 === 0 && t >= 1000) { bulat++; if (h.k500 + h.k1000 > 0) bulatBerkoin++; }
  if (t >= 2000000) {
    ['p100000', 'p50000', 'p20000', 'p10000', 'p5000', 'p2000', 'p1000'].forEach(k => { if (h[k] > 0) jenisTerpakai.add(k); if (h[k] === 0) kosongAda = true; });
  }
});
cek('kelipatan 1.000 selalu berkoin 500/1.000', bulat > 0 && bulatBerkoin === bulat, bulatBerkoin + '/' + bulat);
cek('semua nominal kertas terpakai pada total besar', jenisTerpakai.size === 7, [...jenisTerpakai].join());
cek('sesekali ada nominal kosong', kosongAda);

/* variasi: total sama, hasil berbeda antar bibit; 100rb dan 50rb bukan satu-satunya */
const set = new Set();
for (let s = 1; s <= 30; s++) set.add(JSON.stringify(D.acak(5000000, bibit(s * 77))));
cek('hasil beragam untuk total yang sama', set.size >= 25, set.size);
const tanpa100 = [...set].filter(x => JSON.parse(x).p100000 === 0).length;
cek('100rb sesekali kosong, tidak selalu', tanpa100 > 0 && tanpa100 < 30, tanpa100);

/* ingatan di layar: cetak harus sama dengan pratinjau */
const app = fs.readFileSync(path.join(__dirname, '../src/public/app.js'), 'utf8');
cek('a2Otomatis memakai cache A2_ACAK', /function a2Otomatis[\s\S]{0,300}A2_ACAK\.total\s*!==\s*total/.test(app));
cek('ada tombol acak ulang', /a2AcakUlang/.test(app));
const html = fs.readFileSync(path.join(__dirname, '../src/public/index.html'), 'utf8');
cek('index.html memuat lz-denominasi.js', /lz-denominasi\.js/.test(html));

console.log(gagal ? 'GAGAL ' + gagal : 'LULUS ' + lulus + ' pemeriksaan');
process.exit(gagal ? 1 : 0);
