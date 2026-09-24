/* Uji lambang & ikon situs LAZ Digital.
 *
 * KENAPA UJI INI ADA.
 * Ikon tab adalah satu-satunya bagian tampilan yang tidak pernah kelihatan
 * rusak saat dikembangkan: kalau berkasnya tidak ada, peramban diam saja dan
 * menggambar lembaran kosong. Persis itu yang terjadi selama berbulan-bulan —
 * manifest.json menunjuk ke https://lazdigital.my.id/favicon.ico, berkas yang
 * tidak pernah ada di repo ini, dan tidak ada yang sadar karena tidak ada
 * pesan galat di mana pun.
 *
 * Jadi yang dijaga di sini hal-hal yang diam-diam bisa hilang:
 *  1. Tiap halaman punya <link rel="icon"> yang menunjuk berkas yang SUNGGUH
 *     ada di src/public.
 *  2. Tidak ada lagi favicon emoji data:URI. Emoji digambar oleh fon sistem,
 *     jadi bentuknya berbeda di tiap komputer dan tidak bisa diwarnai.
 *  3. Alamat ikon selalu relatif. Alamat absolut ke lazdigital.my.id membuat
 *     pratinjau Vercel dan server lokal menarik ikon dari situs produksi —
 *     atau gagal sama sekali kalau berkasnya memang tidak ada.
 *  4. Berkas SVG-nya memang gambar: ada viewBox, ada jalur, ada warna.
 *  5. PNG ubinnya berukuran persis seperti yang dijanjikan manifest. Android
 *     menolak diam-diam kalau ukuran yang tertulis tidak cocok dengan isinya.
 *
 * Tidak butuh Playwright — semuanya dibaca langsung dari berkas.
 *
 * jalankan:  node tools/test_ikon.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');

let ok = 0, gagal = 0;
const yangGagal = [];
function cek(nama, syarat, info) {
  if (syarat) { ok++; return; }
  gagal++;
  const ket = info === undefined ? '' : String(JSON.stringify(info)).slice(0, 220);
  yangGagal.push(nama + '  ->  ' + ket);
  console.log('  GAGAL|', nama, ket);
}

/* Alamat di HTML ditulis dari akar situs ("/ikon/x.svg"); di cakram ia ada di
   src/public/ikon/x.svg. Satu fungsi supaya penerjemahannya tidak diulang. */
function keBerkas(alamat) {
  return path.join(PUBLIK, alamat.replace(/^\//, '').split('?')[0]);
}

// ---------------------------------------------------------------- halaman
const HALAMAN = ['index.html', 'public.html', 'broadcast.html', 'blast.html', 'fund.html', 'ai.html'];

console.log('=== A. TIAP HALAMAN PUNYA IKON ===');
const dipakai = new Set();
for (const nama of HALAMAN) {
  const berkas = path.join(PUBLIK, nama);
  if (!fs.existsSync(berkas)) { cek(nama + ': ada', false, 'berkas tidak ditemukan'); continue; }
  const html = fs.readFileSync(berkas, 'utf8');

  const ikon = /<link[^>]+rel="icon"[^>]*>/i.exec(html);
  cek(nama + ': punya <link rel="icon">', !!ikon);
  if (!ikon) continue;

  const alamat = /href="([^"]+)"/i.exec(ikon[0]);
  cek(nama + ': ikonnya punya href', !!alamat, ikon[0].slice(0, 120));
  if (!alamat) continue;
  const href = alamat[1];

  cek(nama + ': ikonnya bukan emoji data:URI', !/^data:/i.test(href), href);
  cek(nama + ': alamatnya relatif, bukan ke domain luar', href.startsWith('/'), href);
  cek(nama + ': berkas ikonnya ada di cakram', fs.existsSync(keBerkas(href)), href);
  dipakai.add(href);

  const sentuh = /<link[^>]+rel="apple-touch-icon"[^>]*href="([^"]+)"/i.exec(html);
  cek(nama + ': punya apple-touch-icon', !!sentuh);
  if (sentuh) cek(nama + ': berkas apple-touch-icon-nya ada', fs.existsSync(keBerkas(sentuh[1])), sentuh[1]);

  /* Tab tanpa judul menampilkan alamat URL-nya — dan alamat itu yang muncul
     juga saat halaman disimpan sebagai penanda. */
  cek(nama + ': punya <title>', /<title>[^<]{3,}<\/title>/i.test(html));
}

/* Tiap modul sebaiknya dikenali dari tabnya. Broadcast lama dan Broadcast baru
   memang sengaja memakai lambang yang sama — fungsinya satu. */
console.log('\n=== B. TIAP MODUL PUNYA LAMBANGNYA SENDIRI ===');
cek('ada lebih dari satu lambang yang dipakai', dipakai.size >= 3, [...dipakai]);

// --------------------------------------------------------------- manifest
console.log('\n=== C. MANIFEST PWA ===');
const manifestBerkas = path.join(PUBLIK, 'manifest.json');
cek('manifest.json ada', fs.existsSync(manifestBerkas));
if (fs.existsSync(manifestBerkas)) {
  let m = null;
  try { m = JSON.parse(fs.readFileSync(manifestBerkas, 'utf8')); } catch (e) { m = null; }
  cek('manifest.json JSON yang sah', !!m);
  if (m) {
    cek('manifest punya daftar icons', Array.isArray(m.icons) && m.icons.length > 0);
    for (const i of (m.icons || [])) {
      cek('ikon manifest relatif: ' + i.src, typeof i.src === 'string' && i.src.startsWith('/'), i.src);
      cek('ikon manifest ada di cakram: ' + i.src, fs.existsSync(keBerkas(i.src || '')), i.src);
    }
    /* Android butuh PNG; SVG boleh ikut, tapi tidak boleh sendirian. */
    cek('ada setidaknya satu ikon PNG', (m.icons || []).some((i) => /\.png$/i.test(i.src || '')));
    cek('ada ikon 512 untuk layar pembuka', (m.icons || []).some((i) => /512/.test(i.sizes || '')));
  }
}

// ------------------------------------------------------------------- SVG
console.log('\n=== D. BERKAS SVG-NYA MEMANG GAMBAR ===');
const SVG = ['lazismu.svg', 'lazismu-putih.svg', 'siar.svg', 'dana.svg', 'ai.svg'];
for (const nama of SVG) {
  const berkas = path.join(PUBLIK, 'ikon', nama);
  if (!fs.existsSync(berkas)) { cek('ikon/' + nama + ': ada', false); continue; }
  const s = fs.readFileSync(berkas, 'utf8');
  cek(nama + ': dibuka tag <svg>', /^\s*<svg[\s>]/.test(s));
  cek(nama + ': ditutup </svg>', /<\/svg>\s*$/.test(s));
  cek(nama + ': punya viewBox', /viewBox="0 0 64 64"/.test(s), s.slice(0, 120));
  /* Tanpa xmlns, SVG yang dimuat lewat <img> atau sebagai favicon tidak
     digambar sama sekali — di dalam <svg> inline ia justru tidak wajib, jadi
     kelalaian ini gampang lolos. */
  cek(nama + ': punya xmlns', /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(s));
  cek(nama + ': punya keterangan untuk pembaca layar', /aria-label="/.test(s));

  const jalur = s.match(/ d="([^"]+)"/g) || [];
  cek(nama + ': isinya jalur gambar, bukan kosong', jalur.length >= 1 && jalur.join('').length > 200, jalur.length);
  cek(nama + ': jalurnya diberi warna', /fill="(#|rgb)/i.test(s));
  /* Ukuran berkas adalah pagar yang paling sederhana terhadap SVG hasil
     ekspor yang penuh metadata editor: ikon seperti ini tidak punya alasan
     melewati beberapa kilobita. */
  cek(nama + ': ringan (< 8 KB)', fs.statSync(berkas).size < 8192, fs.statSync(berkas).size);
}

/* Bunga jingga dan bunga putih harus benar-benar bentuk yang sama — kalau
   suatu saat hanya salah satu yang diubah, yang di layar masuk akan berbeda
   dari yang di tab, dan tidak ada yang akan menyadarinya. */
const jingga = path.join(PUBLIK, 'ikon', 'lazismu.svg');
const putih = path.join(PUBLIK, 'ikon', 'lazismu-putih.svg');
if (fs.existsSync(jingga) && fs.existsSync(putih)) {
  const d = (f) => (/ d="([^"]+)"/.exec(fs.readFileSync(f, 'utf8')) || [, ''])[1];
  cek('bunga putih bentuknya sama persis dengan yang jingga', d(jingga) === d(putih));
}

// ------------------------------------------------------------------- PNG
console.log('\n=== E. UBIN PNG ===');
/* Membaca IHDR langsung: delapan bita pertama tanda PNG, lalu panjang dan
   nama potongan, baru lebar dan tingginya. Lebih jujur daripada percaya pada
   nama berkasnya. */
function ukuranPng(berkas) {
  const b = fs.readFileSync(berkas);
  if (b.length < 24) return null;
  if (b.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { lebar: b.readUInt32BE(16), tinggi: b.readUInt32BE(20) };
}
for (const [nama, sisi] of [['ikon-180.png', 180], ['ikon-192.png', 192], ['ikon-512.png', 512]]) {
  const berkas = path.join(PUBLIK, 'ikon', nama);
  if (!fs.existsSync(berkas)) { cek('ikon/' + nama + ': ada', false); continue; }
  const u = ukuranPng(berkas);
  cek(nama + ': PNG yang sah', !!u);
  if (u) cek(nama + ': ukurannya ' + sisi + '×' + sisi, u.lebar === sisi && u.tinggi === sisi, u);
  cek(nama + ': ukuran berkas wajar (< 200 KB)', fs.statSync(berkas).size < 200000, fs.statSync(berkas).size);
}

// ------------------------------------------------------------ tidak yatim
console.log('\n=== F. TIDAK ADA SISA ALAMAT LAMA ===');
for (const nama of HALAMAN.concat(['manifest.json'])) {
  const berkas = path.join(PUBLIK, nama);
  if (!fs.existsSync(berkas)) continue;
  const s = fs.readFileSync(berkas, 'utf8');
  cek(nama + ': tidak menunjuk favicon.ico yang tidak ada', !/favicon\.ico/.test(s));
  cek(nama + ': tidak menarik ikon dari domain produksi', !/lazdigital\.my\.id\/[^"']*\.(ico|png|svg)/.test(s));
}

if (yangGagal.length) {
  console.log('\nYANG GAGAL:');
  yangGagal.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));
}
console.log('\ntest_ikon.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA GAGAL' : '  SEMUA LULUS'));
process.exitCode = gagal ? 1 : 0;
