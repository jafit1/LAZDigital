/* Uji cek-deploy.js — alat penjawab "kenapa deploy.bat bilang tidak ada
   perubahan?".

   "Tidak ada perubahan" punya empat sebab yang sangat berbeda dan terlihat
   sama dari layar deploy.bat. Alat yang menebak sama saja dengan tidak ada,
   jadi keempatnya dipalsukan di repositori sementara lalu vonisnya diperiksa.

   jalankan:  node tools/uji_cek_deploy.js
*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SUMBER = path.join(__dirname, '..', 'cek-deploy.js');
let ok = 0, g = 0;
const cek = (n, c, i) => { if (c) { ok++; console.log('  OK   |', n); } else { g++; console.log('  GAGAL|', n, i === undefined ? '' : String(i).slice(-400)); } };

const BERKAS = [
  'api/blast.js', 'api/blast-agen.js', 'api/cron/blast-antrean.js',
  'lib/blast/pengirim/mandiri.js', 'lib/blast/antrean.js',
  'src/public/blast.html', 'src/public/blast.js', 'src/public/styles.css',
  'src/public/js/lz-ui.js', 'src/public/app.js',
];

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/* Repositori palsu lengkap dengan "GitHub"-nya sendiri berupa repo bare lokal,
   supaya keadaan "sudah commit tapi belum push" bisa benar-benar dibuat. */
function repoBaru() {
  const akar = fs.mkdtempSync(path.join(os.tmpdir(), 'ujideploy-'));
  const asal = path.join(akar, 'asal.git');
  const kerja = path.join(akar, 'kerja');
  fs.mkdirSync(asal); git(asal, 'init', '-q', '--bare', '-b', 'main');
  fs.mkdirSync(kerja); git(kerja, 'init', '-q', '-b', 'main');
  git(kerja, 'config', 'user.email', 'uji@contoh.test');
  git(kerja, 'config', 'user.name', 'Uji');
  for (const b of BERKAS) {
    const p = path.join(kerja, b);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'isi awal\n');
  }
  fs.copyFileSync(SUMBER, path.join(kerja, 'cek-deploy.js'));
  git(kerja, 'add', '-A'); git(kerja, 'commit', '-qm', 'awal');
  git(kerja, 'remote', 'add', 'origin', asal);
  git(kerja, 'push', '-q', '-u', 'origin', 'main');
  return { akar, kerja };
}

function jalankan(kerja) {
  try {
    return execFileSync(process.execPath, [path.join(kerja, 'cek-deploy.js')],
      { cwd: kerja, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
}

const sampah = [];
function skenario(nama, siapkan, harap, tidakBoleh) {
  const { akar, kerja } = repoBaru();
  sampah.push(akar);
  siapkan(kerja);
  const keluar = jalankan(kerja);
  cek(nama, harap.test(keluar), keluar);
  if (tidakBoleh) cek(nama + ' — tanpa pesan "fatal" yang bikin panik', !tidakBoleh.test(keluar), keluar);
  return keluar;
}

console.log('=== VONIS HARUS MENYEBUT SEBAB YANG BENAR ===');

skenario('semuanya sudah terkirim', () => {}, /Semua sudah terkirim ke GitHub/, /fatal:/);

skenario('ada perubahan yang belum di-commit',
  (k) => fs.writeFileSync(path.join(k, 'src/public/blast.js'), 'berubah\n'),
  /belum dikirim/);

skenario('sudah di-commit tetapi belum di-push', (k) => {
  fs.writeFileSync(path.join(k, 'src/public/blast.js'), 'berubah\n');
  git(k, 'add', '-A'); git(k, 'commit', '-qm', 'perubahan');
}, /belum sampai ke GitHub/);

skenario('berkas penting diabaikan .gitignore', (k) => {
  git(k, 'rm', '-q', '--cached', 'src/public/blast.js');
  fs.writeFileSync(path.join(k, '.gitignore'), 'src/public/blast.js\n');
  git(k, 'add', '.gitignore'); git(k, 'commit', '-qm', 'abaikan');
  git(k, 'push', '-q', 'origin', 'main');
}, /diabaikan \.gitignore/);

skenario('berkas ada di folder tetapi belum masuk Git', (k) => {
  git(k, 'rm', '-q', '--cached', 'api/blast-agen.js');
  git(k, 'commit', '-qm', 'lepas');
  git(k, 'push', '-q', 'origin', 'main');
}, /belum pernah masuk Git/);

console.log('\n=== LAPORANNYA BISA DIBACA ===');
const { akar, kerja } = repoBaru();
sampah.push(akar);
const keluar = jalankan(kerja);
cek('menyebut cabang dan commit terakhir', /Cabang\s+:/.test(keluar) && /Commit terakhir:/.test(keluar), keluar);
cek('menyebut tujuan push', /Tujuan push\s+:/.test(keluar), keluar);
cek('mengingatkan bahwa folder gateway bukan bagian repo ini', /wagateway/.test(keluar), keluar);

const bukanRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'bukanrepo-'));
sampah.push(bukanRepo);
fs.copyFileSync(SUMBER, path.join(bukanRepo, 'cek-deploy.js'));
cek('di luar repositori: menjelaskan, bukan menumpahkan galat Git',
  /bukan repositori Git/.test(jalankan(bukanRepo)));

sampah.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
console.log('\nuji_cek_deploy.js  ' + ok + '/' + (ok + g) + (g ? '  ADA GAGAL' : '  SEMUA LULUS'));
process.exit(g ? 1 : 0);
