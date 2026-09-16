/* cek-deploy.js — menjawab "kenapa deploy.bat bilang tidak ada perubahan?"
 *
 * "Tidak ada perubahan" bisa berarti dua hal yang sangat berbeda: semuanya
 * memang sudah terkirim, atau berkasnya ada tetapi Git tidak melihatnya.
 * Keduanya terlihat sama dari layar deploy.bat, jadi diperiksa di sini.
 *
 * jalankan:  node cek-deploy.js     (atau klik dua kali cek-deploy.bat)
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AKAR = __dirname;
const garis = () => console.log('-'.repeat(58));

function git(...args) {
  try {
    /* stderr dibungkam: perintah seperti "rev-parse @{u}" memang wajar gagal
       kalau cabangnya belum punya tujuan push, dan pesan "fatal:" yang muncul
       di tengah laporan cuma bikin panik tanpa guna. */
    return execFileSync('git', args, {
      cwd: AKAR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (e) {
    return null;                       // perintahnya gagal — penelepon yang memutuskan
  }
}

/* Berkas yang menentukan apakah Broadcast berjalan di lazdigital.my.id.
   Kalau salah satu belum terkirim, gateway akan terus gagal menyambung. */
const BERKAS_PENTING = [
  'api/blast.js',
  'api/blast-agen.js',
  'api/cron/blast-antrean.js',
  'lib/blast/pengirim/mandiri.js',
  'lib/blast/antrean.js',
  'src/public/blast.html',
  'src/public/blast.js',
  'src/public/styles.css',
  'src/public/js/lz-ui.js',
  'src/public/app.js',
];

console.log('');
garis();
console.log('  PEMERIKSAAN: APA YANG SUDAH SAMPAI DI SERVER');
garis();
console.log('');

if (!git('rev-parse', '--is-inside-work-tree')) {
  console.log('  Folder ini bukan repositori Git, atau Git belum terpasang.');
  console.log('  Pastikan Anda menjalankannya di D:\\Project\\LAZDigital\n');
  process.exit(1);
}

const cabang = git('rev-parse', '--abbrev-ref', 'HEAD') || '(tidak diketahui)';
const commitTerakhir = git('log', '-1', '--pretty=%h  %ad  %s', '--date=format:%d %b %Y %H:%M') || '(belum ada commit)';
console.log('  Cabang         :', cabang);
console.log('  Commit terakhir:', commitTerakhir);

/* --- 1. Ada yang belum di-commit? ---------------------------------------- */
const belumCommit = (git('status', '--porcelain') || '')
  .split('\n').map((b) => b.trim()).filter(Boolean);

/* --- 2. Ada commit yang belum di-push? ----------------------------------- */
const hulu = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
const belumPush = hulu
  ? (git('log', `${hulu}..HEAD`, '--pretty=%h %s') || '').split('\n').filter(Boolean)
  : null;
console.log('  Tujuan push    :', hulu || '(belum ada, jalankan: git push -u origin ' + cabang + ')');
console.log('');

/* --- 3. Berkas penting: ada di Git, dan isinya sama dengan yang di disk? -- */
const hilang = [];
const beda = [];
const diabaikan = [];
for (const b of BERKAS_PENTING) {
  const lengkap = path.join(AKAR, b.replace(/\//g, path.sep));
  if (!fs.existsSync(lengkap)) { hilang.push(b + '  (berkasnya sendiri tidak ada)'); continue; }
  if (git('check-ignore', '-q', b) !== null) { diabaikan.push(b); continue; }
  const terlacak = git('ls-files', '--error-unmatch', b);
  if (terlacak === null) { hilang.push(b + '  (ada di folder, tetapi belum pernah masuk Git)'); continue; }
  /* Bandingkan isi di disk dengan isi di commit terakhir. */
  const bedaKe = git('diff', 'HEAD', '--name-only', '--', b);
  if (bedaKe) beda.push(b);
}

console.log('  Berkas inti Broadcast:');
console.log('    sudah sama dengan commit terakhir :', BERKAS_PENTING.length - hilang.length - beda.length - diabaikan.length);
if (beda.length) console.log('    masih berbeda (belum di-commit)  :', beda.length);
if (hilang.length) console.log('    belum masuk Git                  :', hilang.length);
if (diabaikan.length) console.log('    diabaikan .gitignore             :', diabaikan.length);
console.log('');

/* --- Vonis --------------------------------------------------------------- */
function vonis(judul, langkah) {
  garis();
  console.log('  ' + judul);
  garis();
  langkah.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
  console.log('');
}

if (diabaikan.length) {
  return vonis('PENYEBAB: berkas penting diabaikan .gitignore', [
    'Berkas ini tidak akan pernah ikut terkirim: ' + diabaikan.join(', '),
    'Buka .gitignore dan cari baris yang mencocokinya, lalu hapus baris itu.',
    'Sesudah itu jalankan deploy.bat lagi.',
  ]);
}

if (hilang.length) {
  return vonis('PENYEBAB: ada berkas yang belum pernah masuk Git', [
    ...hilang,
    'Jalankan: git add -A   lalu deploy.bat lagi.',
  ]);
}

if (belumCommit.length) {
  console.log('  Yang belum di-commit:');
  belumCommit.slice(0, 20).forEach((b) => console.log('    ' + b));
  if (belumCommit.length > 20) console.log(`    ... dan ${belumCommit.length - 20} lainnya`);
  console.log('');
  return vonis('Masih ada perubahan yang belum dikirim', [
    'deploy.bat seharusnya MAU jalan. Kalau tadi ia bilang tidak ada perubahan,',
    'kemungkinan besar ia dijalankan dari folder lain — pastikan yang diklik',
    'adalah deploy.bat di D:\\Project\\LAZDigital, bukan salinan di tempat lain.',
    'Jalankan deploy.bat sekarang.',
  ]);
}

if (belumPush && belumPush.length) {
  return vonis('Sudah di-commit, tetapi belum sampai ke GitHub', [
    `${belumPush.length} commit menunggu dikirim:`,
    ...belumPush.slice(0, 5).map((c) => '   ' + c),
    'Jalankan: git push origin ' + cabang,
    'Kalau diminta login, isikan Personal Access Token GitHub.',
  ]);
}

if (!hulu) {
  return vonis('Cabang ini belum punya tujuan push', [
    'Jalankan sekali: git push -u origin ' + cabang,
    'Sesudah itu deploy.bat bisa dipakai seperti biasa.',
  ]);
}

vonis('Semua sudah terkirim ke GitHub', [
  'Tidak ada perubahan yang tertinggal — "tidak ada perubahan" di deploy.bat memang benar.',
  'Kalau Broadcast di lazdigital.my.id masih belum berubah, berarti Vercel yang',
  'belum selesai membangun, atau build-nya gagal.',
  'Buka https://vercel.com > proyek laz-vercel > Deployments, lihat yang paling atas.',
  'Perlu diingat: perbaikan terakhir ada di folder gateway (D:\\Project\\Blast Uyeee\\',
  'wagateway), dan folder itu BUKAN bagian dari repositori ini — tidak perlu di-deploy,',
  'cukup tutup lalu jalankan ulang start.bat.',
]);
