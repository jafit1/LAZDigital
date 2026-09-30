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

console.log('\n=== D. DAFTAR AKHIRAN BARIS MASIH BENAR ===');
/* Yang diperiksa hanya berkas yang memang disebut di tabelnya. Kalau tabelnya
   bertambah, pemeriksaannya ikut bertambah tanpa berkas ini perlu diubah. */
const crlf = (p) => fs.readFileSync(p, 'utf8').indexOf('\r\n') >= 0;
const baris = teks.split('\n');
let iTabel = baris.findIndex((b) => /^\| CRLF \| LF \|/.test(b));
cek('tabel akhiran baris ada di panduan', iTabel > 0, iTabel);
let salah = [];
if (iTabel > 0) {
  for (let i = iTabel + 2; i < baris.length && baris[i].startsWith('|'); i++) {
    const kolom = baris[i].split('|').slice(1, 3);
    [['CRLF', kolom[0]], ['LF', kolom[1]]].forEach(([mau, isi]) => {
      (String(isi || '').match(/`([^`]+)`/g) || []).forEach((g) => {
        const rel = g.replace(/`/g, '');
        if (rel.indexOf('*') >= 0) return;            // "semua tools/*.js"
        const penuh = path.join(AKAR, rel);
        if (!fs.existsSync(penuh)) { salah.push(rel + ' (tidak ada)'); return; }
        const nyataEol = crlf(penuh) ? 'CRLF' : 'LF';
        if (nyataEol !== mau) salah.push(rel + ' ditulis ' + mau + ' tetapi ' + nyataEol);
      });
    });
  }
}
cek('setiap berkas di tabel itu akhiran barisnya sesuai', salah.length === 0, salah);
cek('semua tools/*.js memang LF',
  fs.readdirSync(path.join(AKAR, 'tools')).filter((f) => f.endsWith('.js'))
    .every((f) => !crlf(path.join(AKAR, 'tools', f))),
  fs.readdirSync(path.join(AKAR, 'tools')).filter((f) => f.endsWith('.js') && crlf(path.join(AKAR, 'tools', f))));

console.log('\n=== E. UJI YANG DISEBUT PANDUAN MEMANG ADA ===');
const bat = fs.readFileSync(path.join(AKAR, 'uji-sebelum-deploy.bat'), 'utf8');
const diBat = (bat.match(/tools\\[a-z_0-9-]+\.js/gi) || []).map((x) => x.replace(/^tools\\/i, ''));
const hilangBerkas = diBat.filter((f) => !fs.existsSync(path.join(AKAR, 'tools', f)));
cek('setiap uji di uji-sebelum-deploy.bat berkasnya ada', hilangBerkas.length === 0, hilangBerkas);
const tidakDiDoc = diBat.filter((f) => teks.indexOf(f) < 0);
cek('uji utama disebut di panduan',
  tidakDiDoc.length <= 6, tidakDiDoc);

console.log('\n=== F. LABEL DI .BAT TIDAK MEMAKAI & ===');
/* echo pada Windows menganggap & sebagai pemisah perintah, jadi label
   "Fitur Media & Desain" mencetak galat 'Desain' is not recognized. */
const labelAmp = bat.split(/\r?\n/).filter((b) => /^call :jalankan/.test(b) && b.indexOf('&') >= 0);
cek('tidak ada label uji yang memakai &', labelAmp.length === 0, labelAmp);
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
