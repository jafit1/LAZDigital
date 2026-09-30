/* Uji peringatan di panel Cadangan Otomatis.
 *
 * KENAPA SEBUAH LABEL PERLU DIJAGA UJI.
 *
 * Panel Perawatan memerahkan ukuran basis data 2,74 MB dengan kalimat
 * "Mendekati batas 1 MB paket gratis Upstash". Angka 1 MB itu benar pada
 * zamannya: Upstash membatasi 1 MB per permintaan. Tetapi basis datanya sudah
 * pindah ke PostgreSQL berbulan-bulan lalu, dan jatah paket gratis Supabase
 * 500 MB per proyek. Jadi yang terbaca sebagai "hampir penuh, data terancam"
 * sebenarnya pemakaian 0,5 persen.
 *
 * Peringatan palsu lebih berbahaya daripada tidak ada peringatan sama sekali.
 * Sekali orang belajar bahwa yang merah di halaman itu boleh diabaikan, yang
 * merah sungguhan ikut diabaikan — dan di panel inilah nanti muncul kalimat
 * "CADANGAN GAGAL DI SEMUA TUJUAN".
 *
 * Yang lebih penting lagi, dan dulu tidak pernah dikatakan: selama Google
 * Drive belum disetel, salinan cepatnya tersimpan DI DALAM basis data yang
 * sama. Ukuran berkas bukan risikonya; satu-satunya salinan yang sekamar
 * dengan aslinya itulah risikonya.
 *
 *   node tools/test_cadangan_peringatan.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const backup = fs.readFileSync(path.join(AKAR, 'api', 'backup.js'), 'utf8');
const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200)); }
};

/* Ambil angkanya dari kodenya sendiri, bukan disalin ke sini. Kalau disalin,
   ujinya tetap lulus sesudah kodenya diubah. */
function angka(nama) {
  const m = new RegExp('const ' + nama + '\\s*=\\s*([0-9*\\s]+);').exec(backup);
  if (!m) return null;
  try { return Function('"use strict";return (' + m[1] + ')')(); } catch (e) { return null; }
}

console.log('\n=== A. AMBANGNYA MENGIKUTI PENYIMPANAN YANG DIPAKAI ===');
const bRedis = angka('BATAS_PERINGATAN_REDIS');
const bPg = angka('BATAS_PERINGATAN_PG');
cek('ambang Redis masih ada untuk pemasangan lama', bRedis === 800 * 1024, bRedis);
cek('ambang PostgreSQL ada tersendiri', typeof bPg === 'number' && bPg > 0, bPg);
cek('ambang PostgreSQL jauh lebih besar daripada ambang Redis',
  bPg >= bRedis * 100, { redis: bRedis, pg: bPg });
cek('ambangnya di bawah jatah 500 MB, bukan persis di batasnya',
  bPg < 500 * 1024 * 1024, bPg);
cek('ukuran 2,74 MB TIDAK lagi memicu peringatan di PostgreSQL',
  2.74 * 1024 * 1024 < bPg, { ukuran: 2.74 * 1024 * 1024, ambang: bPg });
cek('ambangnya dipilih menurut penyimpanan, bukan satu angka untuk semua',
  /function batasPeringatan\(\)\s*\{\s*return PAKAI_PG\(\)/.test(backup));
cek('nama batas lama yang tanpa cabang sudah tidak ada',
  backup.indexOf('BATAS_PERINGATAN_BYTE') < 0);

console.log('\n=== B. KALIMATNYA MENYEBUT BATAS YANG SUNGGUHAN ===');
cek('label untuk PostgreSQL menyebut Supabase 500 MB',
  /500 MB paket gratis Supabase/.test(backup));
cek('label untuk Redis tetap menyebut Upstash 1 MB',
  /1 MB paket gratis Upstash/.test(backup));
cek('labelnya dikirim ke tampilan', /labelBatas: labelBatas\(\)/.test(backup));
cek('tampilan memakai label dari server, bukan tulisan yang dipatok',
  /d\.labelBatas/.test(app));
cek('tampilan tidak lagi memuat tulisan "1 MB paket gratis Upstash"',
  app.indexOf('1 MB paket gratis Upstash') < 0);

console.log('\n=== C. RISIKO YANG SUNGGUHAN IKUT DIKATAKAN ===');
/* Ini bagian yang paling menentukan. Ukuran berkas bukan bahaya; satu-satunya
   salinan yang berada di dalam basis data yang sama itulah bahayanya. */
cek('server menandai keadaan tanpa salinan di luar', /tanpaSalinanLuar: !drive\.driveSiap\(\)/.test(backup));
cek('dan menuliskannya sebagai peringatan pada tiap cadangan',
  /satu tempat dengan basis datanya/.test(backup));
cek('peringatannya hanya muncul saat Drive memang belum berhasil',
  /status\.redis && status\.redis\.ok && !\(status\.drive && status\.drive\.ok\)/.test(backup));
cek('tampilan menampilkannya di panel', /d\.tanpaSalinanLuar/.test(app));
cek('tampilan menyebut ke mana salinannya sebenarnya pergi',
  /tanpaSalinanLuar[\s\S]{0,400}d\.tempat/.test(app));
cek('dan menunjukkan jalan keluarnya, bukan sekadar menakuti',
  /tanpaSalinanLuar[\s\S]{0,700}PANDUAN-CADANGAN\.md/.test(app));

console.log('\n=== D. PERINGATAN GAGAL TOTAL TIDAK IKUT TERGESER ===');
cek('kalimat cadangan gagal di semua tujuan masih ada',
  /CADANGAN GAGAL DI SEMUA TUJUAN/.test(backup));

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { console.log('\nJANGAN dideploy: peringatan cadangan belum benar.\n'); process.exit(1); }
console.log('\ntest_cadangan_peringatan.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
