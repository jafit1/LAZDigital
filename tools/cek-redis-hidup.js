/* tools/cek-redis-hidup.js — apakah Redisnya masih bisa DIBACA?
 *
 * Saat jatah perintah bulanan Upstash habis, aplikasinya berhenti menyimpan.
 * Pertanyaan berikutnya jauh lebih penting daripada itu: apakah datanya masih
 * bisa dikeluarkan? Kalau perintah baca masih dilayani, seluruh isi basis data
 * bisa diekspor hari ini juga dan pemindahan jalan terus tanpa membayar.
 * Kalau tidak, satu-satunya jalan keluar adalah menaikkan paket atau menunggu
 * penghitungnya berputar.
 *
 * Alat ini mengirim SATU perintah saja, dan perintah itu cuma membaca. Kalau
 * ternyata masih dilayani, yang terpakai satu dari jatah, bukan seribu.
 *
 * jalankan:  node tools/cek-redis-hidup.js
 *
 * Keluarnya salah satu dari tiga:
 *   BISA DIBACA   -> lanjut ke tools/ekspor-redis.js
 *   TIDAK BISA    -> baca saran yang dicetak
 *   TIDAK JELAS   -> pesan galatnya ditampilkan apa adanya
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');

function muatEnv() {
  for (const nama of ['.env.local', '.env']) {
    const berkas = path.join(AKAR, nama);
    if (!fs.existsSync(berkas)) continue;
    for (const baris of fs.readFileSync(berkas, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(baris);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
}
muatEnv();

const URL_REST = process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
if (!URL_REST || !TOKEN) {
  console.error('\nUPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum ada.');
  console.error('Isi di .env.local (lihat .env.example), atau setel di lingkungan shell.\n');
  process.exit(2);
}

(async () => {
  console.log('\nMengirim satu perintah baca ke Redis...\n');
  let res = null, j = null, galatJaringan = null;
  try {
    res = await fetch(URL_REST, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      /* EXISTS, bukan GET: jawabannya cuma 0 atau 1, jadi kalau buku besarnya
         beberapa megabita ia tidak ikut terunduh dan jatah lebar pita tidak
         ikut terpakai hanya untuk memastikan sambungannya hidup. */
      body: JSON.stringify(['EXISTS', 'laz:db']),
    });
    j = await res.json().catch(() => null);
  } catch (e) {
    galatJaringan = e.message;
  }

  if (galatJaringan) {
    console.log('TIDAK JELAS: tidak sampai ke servernya.');
    console.log('  ' + galatJaringan);
    console.log('\nPeriksa sambungan internet dan alamat UPSTASH_REDIS_REST_URL.\n');
    process.exit(1);
  }

  const pesanGalat = (j && j.error) ? String(j.error) : '';
  if (res.ok && j && !j.error) {
    console.log('BISA DIBACA. Jawaban server: laz:db ' + (j.result ? 'ada' : 'tidak ada') + '.');
    console.log('\nArtinya jatah yang habis hanya menghentikan penulisan, dan seluruh isi');
    console.log('basis data masih bisa dikeluarkan sekarang juga:');
    console.log('\n    node tools/ekspor-redis.js\n');
    process.exit(0);
  }

  if (/max requests limit|limit exceeded|quota/i.test(pesanGalat)) {
    console.log('TIDAK BISA: perintah baca pun sudah ditolak.');
    console.log('  ' + pesanGalat);
    console.log('\nBerarti datanya terkunci sampai salah satu dari ini dilakukan:');
    console.log('  1. Naikkan paket Upstash ke Pay as You Go (butuh kartu). Ini membuka');
    console.log('     kuncinya dalam hitungan menit; setelah data diekspor dan pindah');
    console.log('     selesai, databasenya bisa dihapus supaya tidak ada tagihan lanjutan.');
    console.log('  2. Tunggu penghitung bulanannya berputar. Tanggalnya mengikuti tanggal');
    console.log('     database dibuat, bukan tanggal 1 — lihat di dasbor Upstash.');
    console.log('\nSelama itu aplikasinya tidak bisa dipakai, dan tidak ada data yang hilang');
    console.log('— ia hanya tidak bisa disentuh.\n');
    process.exit(1);
  }

  console.log('TIDAK JELAS: servernya menjawab, tapi dengan galat lain.');
  console.log('  HTTP ' + (res && res.status) + (pesanGalat ? ' — ' + pesanGalat : ''));
  console.log('\nKalau galatnya soal wewenang, periksa UPSTASH_REDIS_REST_TOKEN.\n');
  process.exit(1);
})();
