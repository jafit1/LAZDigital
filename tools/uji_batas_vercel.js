/* Menghitung jumlah Serverless Function sebelum deploy.
 *
 * KENAPA INI ADA.
 * Vercel menghitung SETIAP berkas .js di dalam folder api/ yang namanya tidak
 * diawali garis bawah sebagai satu Serverless Function — termasuk yang ada di
 * dalam subfolder seperti api/cron/. Paket Hobby membatasi 12 per deploy.
 *
 * Kalau lewat satu saja, yang gagal bukan fiturnya, melainkan SELURUH deploy:
 * perubahan lain yang ikut dalam dorongan yang sama pun tidak jadi naik, dan
 * situs tetap memakai versi lama. Kegagalannya hanya terlihat di log Vercel —
 * di komputer sendiri semuanya tampak beres, git push berhasil, dan baru
 * beberapa menit kemudian ketahuan bahwa tidak ada yang berubah di situs.
 *
 * Satu perintah kecil sebelum berangkat jauh lebih murah daripada menebak-nebak
 * kenapa perubahan tidak muncul.
 *
 * jalankan:  node tools/uji_batas_vercel.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const DIR_API = path.join(AKAR, 'api');
const BATAS = 12;          // paket Hobby; paket Pro jauh lebih longgar

function kumpulkan(dir, awalan = 'api') {
  const hasil = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const jalur = `${awalan}/${d.name}`;
    if (d.isDirectory()) { hasil.push(...kumpulkan(path.join(dir, d.name), jalur)); continue; }
    if (!d.name.endsWith('.js')) continue;
    /* Berkas berawalan "_" adalah penolong bersama (_engine, _wa, _drive),
       bukan alamat — Vercel memperlakukannya begitu, dan server.js juga. */
    if (d.name.startsWith('_')) continue;
    hasil.push(jalur);
  }
  return hasil.sort();
}

if (!fs.existsSync(DIR_API)) {
  console.error('Folder api/ tidak ditemukan. Jalankan dari dalam folder proyek.');
  process.exit(1);
}

const fungsi = kumpulkan(DIR_API);
const sisa = BATAS - fungsi.length;

console.log(`Serverless Function di folder api/: ${fungsi.length} dari batas ${BATAS}`);
fungsi.forEach((f) => console.log('   ', f));
console.log('');

if (fungsi.length > BATAS) {
  console.log(`  GAGAL| kelebihan ${fungsi.length - BATAS} fungsi — Vercel akan MENOLAK seluruh deploy.`);
  console.log('');
  console.log('  Yang bisa dilakukan:');
  console.log('   - gabungkan endpoint yang bersaudara ke satu berkas, lalu pindahkan');
  console.log('     logikanya ke lib/ (contohnya lib/ai/alir.js yang menumpang api/ai.js);');
  console.log('   - atau hapus endpoint yang sudah tidak dipakai.');
  process.exit(1);
}

console.log(`  OK   | masih muat, sisa ${sisa} fungsi.`);
if (sisa <= 1) {
  console.log('  CATATAN: tinggal sedikit. Endpoint berikutnya sebaiknya menumpang');
  console.log('           berkas yang sudah ada, bukan jadi berkas baru di api/.');
}
process.exit(0);
