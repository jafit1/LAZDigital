/* tools/test_kv_massal.js: membaca banyak kunci sekaligus tidak boleh berarti banyak kueri.
 *
 * TEMUAN (2 Oktober 2026, saat pemilik melaporkan web lemot): pipeline() di
 * lib/kv-postgres.js menjalankan perintahnya SATU PER SATU (BEGIN, N perintah,
 * COMMIT), padahal komentarnya menyebut "satu perjalanan". ambilBanyak() di
 * lib/media|fund|ai|surat/db.js memakainya, jadi membuka daftar Surat berisi 400
 * surat memerlukan 404 kueri; 89 ms di laptop tanpa jarak, tetapi di Vercel ke
 * Supabase tiap kueri membayar jarak jaringan sendiri-sendiri (beberapa detik).
 * Hanya modul Broadcast yang sudah memakai MGET.
 *
 * Yang dijaga: (1) jumlah kueri tidak bergantung pada jumlah kunci, (2) hasil
 * dan urutannya sama persis dengan menjalankan satu per satu, termasuk kunci
 * hilang, kedaluwarsa, dan kembar, (3) pipeline campuran GET/SET/SADD tetap
 * berurutan dan atomik, (4) daftar Surat dan Media sungguhan tidak lagi satu
 * kueri per item.
 *
 * Perlu PostgreSQL percobaan di komputer ini (--alamat atau UJI_DATABASE_URL).
 * SELURUH ISI SKEMA public DIHAPUS lebih dulu.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const arg = process.argv.slice(2);
const opsi = (n, b) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : b; };
const ALAMAT = opsi('--alamat', process.env.UJI_DATABASE_URL || '');
if (!ALAMAT) { console.log('  DILEWATI: perlu PostgreSQL untuk percobaan (UJI_DATABASE_URL atau --alamat).'); process.exit(2); }
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(ALAMAT)) { console.error('  DITOLAK: alamatnya bukan komputer ini.'); process.exit(1); }
process.env.DATABASE_URL = ALAMAT;
let Client; try { ({ Client } = require('pg')); } catch (e) { console.error('npm install pg'); process.exit(2); }

let hitung = 0;
const asli = Client.prototype.query;
Client.prototype.query = function (...a) { hitung++; return asli.apply(this, a); };

const kv = require(path.join(AKAR, 'lib', 'kv-postgres.js'));
const dbSurat = require(path.join(AKAR, 'lib', 'surat', 'db.js'));
const S = require(path.join(AKAR, 'lib', 'surat', 'surat.js'));

let lulus = 0, gagal = 0;
function cek(nama, benar, info) {
  if (benar) { lulus++; console.log('  ok    | ' + nama); return; }
  gagal++; console.log('  GAGAL | ' + nama + (info !== undefined ? '\n          ' + String(JSON.stringify(info)).slice(0, 300) : ''));
}
async function dihitung(f) { hitung = 0; const h = await f(); return { h, n: hitung }; }

(async () => {
  const k = new Client({ connectionString: ALAMAT });
  await k.connect();
  await k.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await k.query(fs.readFileSync(path.join(AKAR, 'sql', '01-skema.sql'), 'utf8'));
  await k.end();

  const N = 150;
  for (let i = 0; i < N; i++) await kv.jalan(['SET', 'uji:k' + i, JSON.stringify({ i })]);
  await kv.jalan(['SET', 'uji:basi', '"x"', 'EX', '1']);
  await new Promise((r) => setTimeout(r, 1300));

  console.log('\n================ 1. JUMLAH KUERI TIDAK BERGANTUNG JUMLAH KUNCI ================');
  const kunci = []; for (let i = 0; i < N; i++) kunci.push('uji:k' + i);
  const a = await dihitung(() => kv.pipeline(kunci.map((x) => ['GET', x])));
  cek('pipeline ' + N + ' GET: hasil ' + N + ' nilai', a.h.length === N && JSON.parse(a.h[7]).i === 7);
  cek('pipeline ' + N + ' GET: paling banyak 2 kueri (bukan ' + (N + 2) + ')', a.n <= 2, a.n);
  const kecil = await dihitung(() => kv.pipeline(kunci.slice(0, 5).map((x) => ['GET', x])));
  cek('jumlah kueri sama untuk 5 kunci dan ' + N + ' kunci', kecil.n === a.n, [kecil.n, a.n]);

  console.log('\n================ 2. SAMA PERSIS DENGAN SATU PER SATU ================');
  const campur = ['uji:k3', 'uji:tidak-ada', 'uji:k3', 'uji:basi', 'uji:k149', 'uji:tidak-ada-2'];
  const satuSatu = []; for (const x of campur) satuSatu.push(await kv.jalan(['GET', x]));
  const pipa = await kv.pipeline(campur.map((x) => ['GET', x]));
  cek('urutan, kunci hilang, kedaluwarsa, dan kembar sama dengan GET satu per satu', JSON.stringify(pipa) === JSON.stringify(satuSatu), [pipa, satuSatu]);
  cek('kunci hilang dan kedaluwarsa tetap null di posisinya', pipa[1] === null && pipa[3] === null && pipa[5] === null && pipa[0] === pipa[2], pipa);
  const besar = []; for (let i = 0; i < 2500; i++) besar.push(['GET', 'uji:k' + (i % N)]);
  const pb = await kv.pipeline(besar);
  cek('lebih dari 1000 kunci: dipotong, urutan tetap benar', pb.length === 2500 && pb.every((v, i) => JSON.parse(v).i === i % N));

  console.log('\n================ 3. PIPELINE CAMPURAN TETAP BERURUTAN DAN ATOMIK ================');
  const mix = await kv.pipeline([
    ['SET', 'uji:m1', 'satu'], ['GET', 'uji:m1'], ['GET', 'uji:k1'], ['SADD', 'uji:himp', 'a', 'b'],
    ['SCARD', 'uji:himp'], ['GET', 'uji:m1'], ['GET', 'uji:belum'],
  ]);
  cek('SET lalu GET di pipeline yang sama melihat nilai barunya', mix[0] === 'OK' && mix[1] === 'satu' && mix[5] === 'satu', mix);
  cek('SADD/SCARD di antara GET tetap benar', mix[3] === 2 && mix[4] === 2 && mix[6] === null, mix);
  let galat = null;
  try { await kv.pipeline([['SET', 'uji:atomik', '1'], ['GET', 'uji:k1'], ['PERINTAH-NGAWUR', 'x']]); } catch (e) { galat = e; }
  const sisa = await kv.jalan(['GET', 'uji:atomik']);
  cek('kalau satu perintah gagal, tidak ada yang separuh jadi (dibatalkan semua)', galat && sisa === null, [galat && galat.message, sisa]);

  console.log('\n================ 4. DAFTAR SURAT SUNGGUHAN ================');
  for (let i = 0; i < 120; i++) {
    const id = 'sr' + String(i).padStart(4, '0');
    await dbSurat.simpan('item:' + id, { id, jenis: 'masuk', perihal: 'Karangan ' + i, tanggalTerima: '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), dibuat: '2026-09-01T00:00:00.000Z' });
    await dbSurat.tambahKeHimpunan('indeks', id);
  }
  const s1 = await dihitung(() => S.semua());
  cek('S.semua() mengembalikan 120 surat, terurut terbaru dulu', s1.h.length === 120 && s1.h[0].tanggalTerima >= s1.h[119].tanggalTerima, s1.h.length);
  cek('S.semua() 120 surat: paling banyak 4 kueri (dulu 122)', s1.n <= 4, s1.n);

  console.log('\n  ' + lulus + ' lulus, ' + gagal + ' gagal');
  await kv.tutup();
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
