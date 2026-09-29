/* tools/periksa-kantor.js: menyisir seluruh nama KLL/ULL sekaligus.
 *
 * HANYA MEMBACA. Tidak membuat, mengubah, atau menghapus satu baris pun.
 * Penggabungan tetap dilakukan sendiri lewat Pengaturan -> Periksa Nama
 * Kantor Layanan, supaya ada pratinjau dan tercatat di Log Aktivitas.
 *
 * KENAPA ADA VERSI TERMINALNYA, PADAHAL PANELNYA SUDAH ADA DI WEB.
 * Panel di web menjawab "mana yang bermasalah". Alat ini menjawab pertanyaan
 * yang berbeda: "kalau 49 kantor ini disandingkan semua, mana yang saling
 * bertumpuk". Untuk itu keluarannya harus muat dibaca sekali jalan, bisa
 * disalin ke rapat, dan bisa dibandingkan dengan keluaran minggu depan.
 *
 * Yang dicetak, berurutan dari yang paling menentukan:
 *
 *   1. Kantor yang angkanya mustahil — uang muka tanpa LPJ sama sekali, atau
 *      LPJ tanpa uang muka sama sekali. Itu tanda paling kuat bahwa satu
 *      kantor terbelah ke dua nama: yang satu kebagian uang mukanya, yang
 *      lain kebagian LPJ-nya.
 *   2. Nama yang bertumpuk: satu nama jadi awalan nama lain, atau dua nama
 *      sama persis kecuali awalan KLL/ULL-nya.
 *   3. Nama yang diduga salah ketik.
 *   4. Ejaan yang masih mengendap di baris datanya.
 *   5. Kembar di menu Layanan itu sendiri (nama atau kode yang sama).
 *   6. Seluruh nama beserta jumlah baris dan nilainya.
 *
 * jalankan:
 *   node tools/periksa-kantor.js
 *   node tools/periksa-kantor.js --cari masjid
 *   node tools/periksa-kantor.js --semua        (cetak juga yang sudah beres)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');

function muatEnv() {
  for (const nama of ['.env.local', '.env']) {
    const b = path.join(AKAR, nama);
    if (!fs.existsSync(b)) continue;
    for (const baris of fs.readFileSync(b, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(baris);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}
muatEnv();

const arg = process.argv.slice(2);
const opsi = (n, b) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : b; };
const punya = (n) => arg.indexOf(n) >= 0;
const CARI = String(opsi('--cari', '') || '').toLowerCase();
const SEMUA = punya('--semua');

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error('\nDATABASE_URL belum ada. Isi di .env.local, atau jalankan dari folder proyek.\n');
  process.exit(1);
}

const rp = (n) => { n = Math.round(Number(n) || 0); return (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(n).toLocaleString('id-ID'); };
const pad = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n); };
const kanan = (s, n) => String(s == null ? '' : s).padStart(n);
const judul = (t) => { console.log('\n' + '='.repeat(78)); console.log('  ' + t); console.log('='.repeat(78)); };
const cocok = (s) => !CARI || String(s || '').toLowerCase().indexOf(CARI) >= 0;

(async () => {
  const pg = require(path.join(AKAR, 'lib', 'laz-pg.js'));
  const engine = require(path.join(AKAR, 'api', '_engine.js'));

  console.log('\nMembaca basis data ...');
  const t0 = Date.now();
  const { db } = await pg.muatSemua();
  console.log('terbaca dalam ' + (Date.now() - t0) + ' ms.');

  /* Sesi sementara HANYA DI MEMORI. Tidak pernah disimpan balik: alat ini
     tidak menulis apa pun, dan sesi palsu yang mengendap di basis data adalah
     pintu masuk yang tidak seorang pun ingat pernah membukanya. */
  const TOK = 'periksa-kantor-sementara';
  const barisUser = db.sheets.Users && db.sheets.Users[0];
  const barisSesi = db.sheets.Sessions && db.sheets.Sessions[0];
  if (!barisUser || !barisSesi) { console.error('Tabel Users/Sessions tidak terbaca.'); process.exit(1); }
  const isi = (kepala, nilai) => kepala.map((k) => (nilai[k] === undefined ? '' : nilai[k]));
  db.sheets.Users.push(isi(barisUser, { id: '_periksa', username: '_periksa', nama: 'Alat Periksa',
    role: 'superadmin', permissions: '{}', aktif: 'true', dibuat: new Date().toISOString() }));
  db.sheets.Sessions.push(isi(barisSesi, { token: TOK, userId: '_periksa',
    dibuat: new Date().toISOString(), expiredAt: new Date(Date.now() + 36e5).toISOString() }));

  const panggil = async (fn, args) => (await engine.runRPC(db, fn, args, {})).result;
  const per = await panggil('apiPeriksaLayanan', [TOK]);
  const hariIni = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const saldo = await panggil('apiSaldoLayanan', [TOK, hariIni]);

  /* ---------------- 1. angka yang mustahil ---------------- */
  judul('1. KANTOR YANG ANGKANYA MUSTAHIL');
  console.log('Uang muka keluar tanpa satu pun LPJ, atau LPJ tanpa satu pun uang muka.');
  console.log('Hampir selalu berarti satu kantor terbelah ke dua nama yang berbeda.\n');
  const mustahil = (saldo.daftar || []).filter((x) => x.tipe !== 'Daerah' && cocok(x.layanan))
    .filter((x) => (x.umpKeluar > 0 && x.lpj === 0) || (x.lpj > 0 && x.umpKeluar === 0));
  if (!mustahil.length) console.log('  (tidak ada)');
  else {
    console.log('  ' + pad('KANTOR', 36) + kanan('SETORAN', 16) + kanan('UANG MUKA', 16) + kanan('LPJ', 16) + '  SEBAB');
    mustahil.sort((a, b) => (b.umpKeluar + b.lpj) - (a.umpKeluar + a.lpj)).forEach((x) => {
      const sebab = x.lpj === 0 ? 'uang muka tanpa LPJ' : 'LPJ tanpa uang muka';
      console.log('  ' + pad(x.layanan, 36) + kanan(rp(x.himpun), 16)
        + kanan(rp(x.umpKeluar), 16) + kanan(rp(x.lpj), 16) + '  ' + sebab);
    });
    console.log('\n  ' + mustahil.length + ' kantor. Cari pasangannya di bagian 2 di bawah.');
  }

  /* ---------------- 2. nama yang bertumpuk ---------------- */
  judul('2. NAMA YANG BERTUMPUK');
  console.log('Satu nama jadi awalan nama lain, atau sama persis kecuali awalan KLL/ULL.');
  console.log('Pencocokan memilih padanan TERPANJANG, jadi datanya terbelah tanpa galat.\n');
  const kembar = (per.kembar || []).filter((x) => cocok(x.sedikit) || cocok(x.banyak));
  if (!kembar.length) console.log('  (tidak ada)');
  else {
    kembar.forEach((x, i) => {
      const sebab = x.sebab === 'beda-awalan' ? 'hanya beda awalan KLL/ULL' : 'satu jadi awalan yang lain';
      console.log('  ' + String(i + 1).padStart(2) + '. ' + x.sedikit + '  (' + x.nSedikit + ' baris'
        + (x.terdaftarSedikit ? '' : ', BELUM terdaftar') + ')');
      console.log('      bertumpuk dengan: ' + x.banyak + '  (' + x.nBanyak + ' baris'
        + (x.terdaftarBanyak ? '' : ', BELUM terdaftar') + ')');
      console.log('      dugaan: ' + String(x.yakin).toUpperCase() + '  |  sebab: ' + sebab
        + (x.diMaster ? '  |  KEDUANYA TERDAFTAR di menu Layanan' : ''));
    });
    if (kembar.some((x) => x.diMaster)) {
      console.log('\n  Yang bertanda KEDUANYA TERDAFTAR perlu dua langkah: gabungkan barisnya');
      console.log('  lewat Pengaturan, LALU hapus kantor yang tidak dipakai di menu Kantor');
      console.log('  Layanan. Tanpa langkah kedua, kantor bayangannya menarik data lagi.');
    }
  }

  /* ---------------- 3. diduga salah ketik ---------------- */
  judul('3. NAMA YANG DIDUGA SALAH KETIK');
  const mirip = (per.mirip || []).filter((x) => cocok(x.sedikit) || cocok(x.banyak));
  if (!mirip.length) console.log('  (tidak ada)');
  else {
    console.log('  ' + pad('DIDUGA SALAH KETIK', 34) + kanan('BARIS', 7) + '  '
      + pad('KEMUNGKINAN MAKSUDNYA', 30) + kanan('BARIS', 7) + '  DUGAAN');
    mirip.forEach((x) => {
      console.log('  ' + pad(x.sedikit, 34) + kanan(x.nSedikit, 7) + '  '
        + pad(x.banyak, 30) + kanan(x.nBanyak, 7) + '  ' + x.yakin);
    });
  }

  /* ---------------- 4. ejaan yang masih mengendap ---------------- */
  judul('4. EJAAN YANG MASIH SALAH DI DALAM BARIS DATA');
  console.log('Rekapnya sudah benar karena tertutup pencocokan, tetapi ejaannya masih');
  console.log('tersimpan apa adanya dan akan muncul lagi kalau menu Layanan berubah.\n');
  const rapi = (per.dirapikan || []).filter((x) => cocok(x.mentah) || cocok(x.jadi));
  if (!rapi.length) console.log('  (tidak ada)');
  else {
    console.log('  ' + kanan('BARIS', 7) + '  ' + pad('DITULIS', 40) + 'DIBACA SEBAGAI');
    rapi.slice(0, SEMUA ? rapi.length : 40).forEach((x) => {
      console.log('  ' + kanan(x.n, 7) + '  ' + pad(x.mentah, 40) + x.jadi);
    });
    if (!SEMUA && rapi.length > 40) console.log('  ... ' + (rapi.length - 40) + ' lagi (pakai --semua)');
  }

  /* ---------------- 5. kembar di menu Layanan ---------------- */
  judul('5. KEMBAR DI MENU KANTOR LAYANAN');
  const lay = (db.sheets.Layanan || []).slice(1);
  const kepalaLay = (db.sheets.Layanan || [])[0] || [];
  const kol = (b, n) => b[kepalaLay.indexOf(n)];
  const rataNama = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const perNama = {}, perKode = {};
  lay.forEach((b) => {
    const nm = kol(b, 'nama'), kd = kol(b, 'kode'), tp = kol(b, 'tipe');
    const kn = rataNama(nm); if (kn) (perNama[kn] = perNama[kn] || []).push({ nm, kd, tp });
    const kk = rataNama(kd); if (kk) (perKode[kk] = perKode[kk] || []).push({ nm, kd, tp });
  });
  let adaKembarMaster = 0;
  Object.keys(perNama).forEach((k) => {
    if (perNama[k].length < 2) return;
    if (!perNama[k].some((x) => cocok(x.nm))) return;
    adaKembarMaster++;
    console.log('  NAMA SAMA: ' + perNama[k].map((x) => (x.tp || '?') + ' ' + x.nm).join('   |   '));
  });
  Object.keys(perKode).forEach((k) => {
    if (perKode[k].length < 2) return;
    if (!perKode[k].some((x) => cocok(x.nm))) return;
    adaKembarMaster++;
    console.log('  KODE SAMA (' + perKode[k][0].kd + '): ' + perKode[k].map((x) => x.nm).join('   |   '));
  });
  if (!adaKembarMaster) console.log('  (tidak ada)');

  /* ---------------- 6. seluruh nama ---------------- */
  judul('6. SELURUH NAMA KANTOR DI DATA');
  const baris = (saldo.daftar || []).filter((x) => x.tipe !== 'Daerah' && cocok(x.layanan));
  console.log('  ' + pad('KANTOR', 34) + kanan('SETORAN', 15) + kanan('UANG MUKA', 15)
    + kanan('LPJ', 15) + kanan('BELUM LPJ', 15));
  baris.sort((a, b) => Math.abs(b.belumLPJ) - Math.abs(a.belumLPJ)).forEach((x) => {
    console.log('  ' + pad(x.layanan, 34) + kanan(rp(x.himpun), 15) + kanan(rp(x.umpKeluar), 15)
      + kanan(rp(x.lpj), 15) + kanan(rp(x.belumLPJ), 15));
  });
  console.log('\n  ' + baris.length + ' kantor' + (CARI ? ' (disaring "' + CARI + '")' : '')
    + ' dari ' + (per.total || 0) + ' nama yang muncul di data.');

  judul('LANGKAH BERIKUTNYA');
  console.log('  Semua penggabungan dilakukan di web, bukan di sini:');
  console.log('    Pengaturan -> Periksa Nama Kantor Layanan -> tombol Gabungkan');
  console.log('  Untuk yang tidak muncul di daftar (mis. ULL yang harus dilebur ke KLL');
  console.log('  induknya), pakai formulir "Gabungkan sendiri" di panel yang sama.');
  console.log('  Tiap penggabungan menampilkan pratinjau dulu dan tercatat di Log Aktivitas.');
  console.log('');

  await pg.tutup?.();
  process.exit(0);
})().catch((e) => { console.error('\nGAGAL:', (e && e.stack) || e, '\n'); process.exit(1); });
