/* Uji bahwa CLAUDE.md masih benar.
 *
 * KENAPA SEBUAH BERKAS TULISAN PERLU DIUJI.
 *
 * CLAUDE.md adalah berkas yang dibaca model berikutnya sebelum menyentuh
 * kode. Kalau isinya basi, ia tidak sekadar tidak menolong: ia menyesatkan
 * dengan penuh percaya diri. Model yang membaca "terpakai 10 dari 12 fungsi"
 * akan menambah berkas baru di api/ tanpa ragu, lalu build gagal. Model yang
 * membaca daftar akhiran baris yang sudah tidak cocok akan mengubah seluruh
 * berkas jadi satu diff raksasa yang menyembunyikan perubahan sebenarnya.
 *
 * Dokumentasi yang salah lebih berbahaya daripada tidak ada dokumentasi,
 * dengan alasan yang sama seperti peringatan palsu di panel cadangan: ia
 * dipercaya justru pada saat tidak boleh dipercaya.
 *
 * Maka angka dan daftar yang gampang basi di CLAUDE.md dicocokkan ke kodenya,
 * bukan dipercaya apa adanya.
 *
 *   node tools/test_panduan_ai.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const P_CLAUDE = path.join(AKAR, 'CLAUDE.md');

let ok = 0, gagal = 0;

const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 220)); }
};

console.log('\n=== A. PANDUANNYA ADA DAN LENGKAP ===');
cek('CLAUDE.md ada di akar proyek', fs.existsSync(P_CLAUDE));
if (!fs.existsSync(P_CLAUDE)) { console.log('\nTidak bisa lanjut.\n'); process.exit(1); }
const teks = fs.readFileSync(P_CLAUDE, 'utf8');
/* Dipakai lagi di bagian D (cocokkan aturan akhiran baris) dan bagian E. */
const baris = teks.split('\n');
cek('AGENTS.md ada dan menunjuk ke CLAUDE.md',
  fs.existsSync(path.join(AKAR, 'AGENTS.md'))
  && /CLAUDE\.md/.test(fs.readFileSync(path.join(AKAR, 'AGENTS.md'), 'utf8')));
for (const bab of ['Bahasa dan gaya', 'Aturan keras', 'Peta berkas', 'Alur kerja wajib',
  'Daftar uji', 'Jebakan yang sudah pernah menggigit', 'Aturan bisnis']) {
  cek('memuat bab "' + bab + '"', teks.indexOf(bab) >= 0);
}

console.log('\n=== B. JUMLAH FUNGSI VERCEL MASIH SEPERTI YANG DITULIS ===');
/* Angka ini yang paling cepat basi, dan akibatnya paling mahal: build gagal
   dengan pesan yang tidak menyebut sebabnya sama sekali. */
const dirApi = path.join(AKAR, 'api');
function hitungFungsi(dir, awalan) {
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_')) continue;
    const penuh = path.join(dir, f);
    if (fs.statSync(penuh).isDirectory()) { n += hitungFungsi(penuh, awalan + f + '/'); continue; }
    if (f.endsWith('.js')) n++;
  }
  return n;
}
const nyata = hitungFungsi(dirApi, '');
const mDoc = /terpakai (\d+)/.exec(teks) || /\*\*(\d+) dari 12\*\*/.exec(teks);
const ditulis = mDoc ? Number(mDoc[1]) : null;
cek('panduan menyebut jumlah fungsi', ditulis !== null, ditulis);
cek('jumlah yang ditulis sama dengan yang ada di folder api/',
  ditulis === nyata, { ditulis, nyata });
cek('jumlahnya memang masih di bawah batas 12', nyata <= 12, nyata);
cek('batas 12 disebut di panduan', /12 (Serverless Function|fungsi)/i.test(teks));

console.log('\n=== C. DAFTAR MODUL IZIN MASIH COCOK ===');
const engine = fs.readFileSync(path.join(AKAR, 'api', '_engine.js'), 'utf8');
const mMod = /var MODULES = \[([^\]]*)\]/.exec(engine);
const modul = mMod ? mMod[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')) : [];
cek('daftar modul terbaca dari _engine.js', modul.length > 5, modul.length);
const hilangDiDoc = modul.filter((m) => teks.indexOf(m) < 0);
cek('setiap modul izin disebut di panduan', hilangDiDoc.length === 0, hilangDiDoc);
cek('modul yang sudah dipecah tidak ditulis sebagai satu',
  teks.indexOf('Dashboard & Saldo') < 0);

console.log('\n=== D. AKHIRAN BARIS SESUAI .gitattributes ===');
/* Dulunya bagian ini membaca tabel per berkas di CLAUDE.md dan hanya memeriksa
 * berkas yang disebut di sana. Dua masalahnya:
 *
 *   1. Berkas yang tidak disebut di tabel tidak pernah diperiksa sama sekali.
 *   2. Tabelnya hanya catatan. Tidak ada yang memaksa git menerapkannya, jadi
 *      setiap orang yang clone dengan core.autocrlf berbeda mendapat akhiran
 *      baris berbeda. Akibatnya 9 berkas .js tercatat CRLF padahal isinya LF,
 *      dan 5 berkas .bat LF padahal test_jalankan_uji mewajibkan CRLF.
 *
 * Sekarang aturannya tinggal di .gitattributes, yang memang memaksa git.
 * Bagian ini memeriksa SELURUH berkas repo, bukan cuma yang disebut di
 * dokumentasi. Jadi kalau nanti ada berkas baru dengan akhiran baris salah,
 * ketahuan tanpa perlu menambah namanya ke mana pun. */
const ATURAN = [
  { pola: /\.(bat|ps1|vbs)$/, mau: 'CRLF' },
  { pola: /\.(js|json|md|css|html|sql)$/, mau: 'LF' },
];
const bacaEol = (p) => {
  const t = fs.readFileSync(p, 'utf8');
  const nCrlf = (t.match(/\r\n/g) || []).length;
  const nLf = (t.match(/[^\r]\n/g) || []).length;
  if (nCrlf && nLf) return 'CAMPUR';
  if (nCrlf) return 'CRLF';
  if (nLf) return 'LF';
  return 'TANPA-BARIS';
};

const berkasAttr = path.join(AKAR, '.gitattributes');
cek('.gitattributes ada', fs.existsSync(berkasAttr), berkasAttr);
if (fs.existsSync(berkasAttr)) {
  const isiAttr = fs.readFileSync(berkasAttr, 'utf8');
  cek('.gitattributes memaksa LF untuk .js', /\*\.js\s+text\s+eol=lf/.test(isiAttr));
  cek('.gitattributes memaksa CRLF untuk .bat', /\*\.bat\s+text\s+eol=crlf/.test(isiAttr));
}

const salahEol = [];
const leukasi = (d) => {
  let isi = [];
  try { isi = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const x of isi) {
    if (x.name === 'node_modules' || x.name === '.git' || x.name === '.data') continue;
    if (x.name === '.gitattributes') continue;
    const p = path.join(d, x.name);
    if (x.isDirectory()) { leukasi(p); continue; }
    const aturan = ATURAN.find((a) => a.pola.test(x.name));
    if (!aturan) continue;
    const nyata = bacaEol(p);
    if (nyata !== aturan.mau && nyata !== 'TANPA-BARIS') {
      salahEol.push(path.relative(AKAR, p).replace(/\\/g, '/') + ' harus ' + aturan.mau + ', nyata ' + nyata);
    }
  }
};
leukasi(AKAR);
cek('seluruh berkas repo mengikuti aturan .gitattributes', salahEol.length === 0, salahEol);

/* CLAUDE.md harus masih menjelaskan aturan ini. Kalau tidak, model berikutnya
 * akan mengubah akhiran baris sambil mengira itu aman. Dicocokkan per baris,
 * bukan satu teks panjang, karena aturan dan hasil ada di sel berbeda pada
 * tabel yang sama. */
const barisAda = (pola) => baris.some((b) => pola.test(b));
cek('CLAUDE.md menyebut aturan LF untuk .js',
  barisAda(/`\*\.js`[^\n]*\|\s*\*\*LF\*\*/));
cek('CLAUDE.md menyebut aturan CRLF untuk .bat',
  barisAda(/`\*\.bat`[^\n]*\|\s*\*\*CRLF\*\*/));
cek('tabel akhiran baris per berkas yang lama sudah dihapus',
  baris.findIndex((b) => /^\| CRLF \| LF \|/.test(b)) < 0);
cek('semua tools/*.js memang LF',
  fs.readdirSync(path.join(AKAR, 'tools')).filter((f) => f.endsWith('.js'))
    .every((f) => bacaEol(path.join(AKAR, 'tools', f)) === 'LF'),
  fs.readdirSync(path.join(AKAR, 'tools'))
    .filter((f) => f.endsWith('.js') && bacaEol(path.join(AKAR, 'tools', f)) !== 'LF'));

console.log('\n=== E. UJI YANG DISEBUT PANDUAN MEMANG ADA ===');
/* Sejak 1 Oktober 2026 daftar uji ada di tools/jalankan-uji.js (dijalankan
   bersamaan); uji-sebelum-deploy.bat tinggal memanggilnya. */
const bat = fs.readFileSync(path.join(AKAR, 'uji-sebelum-deploy.bat'), 'utf8');
const diBat = require('./jalankan-uji.js').DAFTAR.map((u) => u.berkas);
const hilangBerkas = diBat.filter((f) => !fs.existsSync(path.join(AKAR, 'tools', f)));
cek('setiap uji di daftar tools/jalankan-uji.js berkasnya ada', hilangBerkas.length === 0, hilangBerkas);
const tidakDiDoc = diBat.filter((f) => teks.indexOf(f) < 0);
cek('uji utama disebut di panduan',
  tidakDiDoc.length <= 6, tidakDiDoc);

console.log('\n=== F. ECHO DI .BAT TIDAK MEMAKAI & ===');
/* echo pada Windows menganggap & sebagai pemisah perintah, jadi label
   "Fitur Media & Desain" mencetak galat 'Desain' is not recognized. */
const labelAmp = bat.split(/\r?\n/).filter((b) => /^\s*echo\b/i.test(b) && /[^^]&/.test(b));
cek('tidak ada echo di uji-sebelum-deploy.bat yang memakai & telanjang', labelAmp.length === 0, labelAmp);
cek('jebakan ini dicatat di panduan', /`&` di dalam `echo`/.test(teks) || /echo.*&.*\.bat/i.test(teks));

console.log('\n=== G. TIDAK ADA RAHASIA IKUT TERTULIS ===');
/* Repositorinya publik. Panduan yang memuat contoh nyata sebuah kunci sama
   saja dengan membocorkannya, dan bentuk berkasnya membuat orang menyangka
   itu aman karena "cuma dokumentasi". */
const pola = [
  /postgres(ql)?:\/\/[^\s`]*:[^\s`@]{6,}@/i,
  /\bsk-[A-Za-z0-9]{16,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];
const bocor = pola.filter((r) => r.test(teks));
cek('tidak ada alamat basis data, kunci API, atau token di dalam panduan',
  bocor.length === 0, bocor.map(String));
cek('panduan mengingatkan bahwa repo ini publik', /PUBLIK/.test(teks));

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { console.log('\nPanduan AI sudah tidak cocok dengan kodenya. Perbarui CLAUDE.md.\n'); process.exit(1); }
console.log('\ntest_panduan_ai.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
