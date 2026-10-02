/* Uji untuk pelari uji (tools/jalankan-uji.js) yang dipakai
 * uji-sebelum-deploy.bat.
 *
 * Pemilik minta uji sebelum deploy lebih singkat tetapi tetap memastikan
 * semuanya berfungsi (1 Oktober 2026). Caranya: uji dijalankan bersamaan,
 * dan layar hanya menampilkan satu baris per uji, kecuali yang gagal.
 *
 * Menjalankan bersamaan hanya aman kalau uji tidak saling menimpa data.
 * Dulu setiap uji Broadcast, Fundraising, AI, dan Media menulis ke folder
 * .data yang SAMA, dan sebagian menghapus seluruh folder itu di awal. Kalau
 * dua uji jalan bersamaan, yang satu menghapus data yang sedang dipakai yang
 * lain, dan hasilnya gagal acak yang tidak ada hubungannya dengan kode.
 * Bagian A memastikan tiap penyimpanan lokal menghormati LAZ_DATA_LOKAL,
 * sehingga tiap uji mendapat foldernya sendiri.
 *
 *   node tools/test_jalankan_uji.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const AKAR = path.join(__dirname, '..');
const PELARI = path.join(AKAR, 'tools', 'jalankan-uji.js');
let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};
const sementara = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-pelari-'));
const envBersih = () => {
  const e = Object.assign({}, process.env);
  for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'UJI_DATABASE_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'LAZ_DATA_LOKAL', 'LAZ_UJI_DAFTAR', 'LAZ_UJI_BATAS_DETIK']) delete e[k];
  return e;
};

function jalankanPelari(daftar, argumen, envTambah) {
  return new Promise((selesai) => {
    const env = Object.assign(envBersih(), { LAZ_UJI_DAFTAR: JSON.stringify(daftar) }, envTambah || {});
    const mulai = Date.now();
    const p = spawn(process.execPath, [PELARI].concat(argumen || []), { cwd: AKAR, env });
    let keluaran = '';
    p.stdout.on('data', (c) => { keluaran += c; });
    p.stderr.on('data', (c) => { keluaran += c; });
    p.on('close', (kode) => selesai({ kode, keluaran, detik: (Date.now() - mulai) / 1000 }));
  });
}
function tulisUji(nama, isi) {
  const f = path.join(sementara, nama);
  fs.writeFileSync(f, isi);
  return f;
}

(async () => {
  console.log('\n=== A. PENYIMPANAN LOKAL MENGHORMATI LAZ_DATA_LOKAL ===');
  for (const [modul, berkas] of [['blast', 'blast.json'], ['fund', 'fund.json'], ['ai', 'ai.json'], ['media', 'media.json']]) {
    const folderData = path.join(sementara, 'data-' + modul);
    const kerja = path.join(sementara, 'kerja-' + modul);
    fs.mkdirSync(kerja, { recursive: true });
    const skrip = "const db=require(" + JSON.stringify(path.join(AKAR, 'lib', modul, 'db.js')) + ");"
      + "db.simpan('uji:kunci',{a:1}).then(()=>setTimeout(()=>{},200)).catch(e=>{console.error(e.message);process.exit(1);});";
    const r = spawnSync(process.execPath, ['-e', skrip], { cwd: kerja, env: Object.assign(envBersih(), { LAZ_DATA_LOKAL: folderData }), encoding: 'utf8' });
    cek(modul + ': tersimpan di folder LAZ_DATA_LOKAL', fs.existsSync(path.join(folderData, berkas)), r.stderr);
    cek(modul + ': tidak menulis ke .data di folder kerja', !fs.existsSync(path.join(kerja, '.data')));
  }

  console.log('\n=== B. HANYA SATU BARIS PER UJI YANG LULUS, RINCIAN UNTUK YANG GAGAL ===');
  const lulus = tulisUji('lulus.js', "setTimeout(()=>{console.log('  OK   | satu');console.log('  OK   | dua');},1500);");
  const lulus2 = tulisUji('lulus2.js', "setTimeout(()=>{console.log('  OK   | tiga');},1500);");
  const lulus3 = tulisUji('lulus3.js', "setTimeout(()=>{console.log('  OK   | empat');},1500);");
  const jatuh = tulisUji('gagal.js', "console.log('  OK   | yang ini benar');console.log('  GAGAL| angka penghimpunan meleset 5000');process.exit(1);");
  const lewat = tulisUji('lewati.js', "console.log('  DILEWATI  | DATABASE_URL belum ada');process.exit(2);");
  let h = await jalankanPelari([
    { label: 'Uji lulus pertama', berkas: lulus },
    { label: 'Uji lulus kedua', berkas: lulus2 },
    { label: 'Uji lulus ketiga', berkas: lulus3 },
    { label: 'Uji yang gagal', berkas: jatuh },
    { label: 'Uji yang dilewati', berkas: lewat },
  ], ['--paralel=4']);
  cek('ada yang gagal: kode keluar 1', h.kode === 1, h.kode);
  cek('nama uji yang gagal disebut', /GAGAL.*Uji yang gagal/.test(h.keluaran), h.keluaran);
  cek('baris GAGAL dari dalam ujinya ikut ditampilkan', /angka penghimpunan meleset 5000/.test(h.keluaran), h.keluaran);
  cek('baris OK dari uji tidak dicetak satu per satu', !/yang ini benar/.test(h.keluaran) && !/\| satu/.test(h.keluaran), h.keluaran);
  cek('uji yang lulus tampil satu baris dengan jumlah ceknya', /Uji lulus pertama.*2 cek/.test(h.keluaran), h.keluaran);
  cek('uji yang dilewati disebut beserta alasannya, bukan dianggap gagal',
    /Uji yang dilewati.*dilewati.*DATABASE_URL belum ada/i.test(h.keluaran), h.keluaran);
  cek('disebut tempat log lengkap untuk yang gagal', /log lengkap/i.test(h.keluaran), h.keluaran);
  cek('keluarannya ringkas (kurang dari 25 baris)', h.keluaran.trim().split(/\r?\n/).length < 25, h.keluaran.split(/\r?\n/).length);
  /* Berurutan butuh paling sedikit 4,5 detik (tiga kali 1,5 detik). */
  cek('uji dijalankan bersamaan: tiga uji 1,5 detik selesai kurang dari 3,5 detik', h.detik < 3.5, h.detik);

  h = await jalankanPelari([{ label: 'Uji lulus pertama', berkas: lulus }, { label: 'Uji lulus kedua', berkas: lulus2 }]);
  cek('semua lulus: kode keluar 0', h.kode === 0, h.kode);
  cek('semua lulus: ada pernyataan SEMUA LULUS', /SEMUA LULUS/.test(h.keluaran), h.keluaran);

  h = await jalankanPelari([{ label: 'Uji lulus pertama', berkas: lulus }, { label: 'Uji yang gagal', berkas: jatuh }], ['lulus']);
  cek('kata saringan hanya menjalankan uji yang cocok', h.kode === 0 && !/Uji yang gagal/.test(h.keluaran), h.keluaran);
  cek('lulus sebagian tidak disebut aman untuk deploy', !/aman untuk deploy/.test(h.keluaran) && /jalankan semuanya/i.test(h.keluaran), h.keluaran);

  const macet = tulisUji('macet.js', "setInterval(()=>{},1000);");
  h = await jalankanPelari([{ label: 'Uji yang macet', berkas: macet }], [], { LAZ_UJI_BATAS_DETIK: '2' });
  cek('uji yang macet dihentikan dan dianggap gagal', h.kode === 1 && /Uji yang macet/.test(h.keluaran) && /terlalu lama/i.test(h.keluaran) && h.detik < 8, [h.kode, h.detik, h.keluaran]);

  h = await jalankanPelari([{ label: 'Uji yang hilang', berkas: path.join(sementara, 'tidak-ada.js') }]);
  cek('berkas uji yang tidak ada dianggap gagal, bukan diam-diam dilewati', h.kode === 1 && /Uji yang hilang/.test(h.keluaran), h.keluaran);

  console.log('\n=== C. TIAP UJI MENDAPAT FOLDER DATA SENDIRI ===');
  const periksaFolder = tulisUji('folder.js',
    "const fs=require('fs'),path=require('path');const d=process.env.LAZ_DATA_LOKAL;"
    + "if(!d||!fs.existsSync(d)||fs.readdirSync(d).length){console.log('  GAGAL| folder data tidak kosong atau tidak ada');process.exit(1);}"
    + "if(path.resolve(d).startsWith(path.resolve(" + JSON.stringify(AKAR) + "))){console.log('  GAGAL| folder data di dalam proyek');process.exit(1);}"
    + "fs.writeFileSync(path.join(d,'tanda.txt'),'x');setTimeout(()=>{console.log('  OK   | folder sendiri');},500);");
  h = await jalankanPelari([
    { label: 'Folder A', berkas: periksaFolder }, { label: 'Folder B', berkas: periksaFolder }, { label: 'Folder C', berkas: periksaFolder },
  ], ['--paralel=3']);
  cek('tiga uji bersamaan masing-masing mendapat folder data kosong di luar proyek', h.kode === 0, h.keluaran);

  const catat = tulisUji('catat.js',
    "const fs=require('fs');const f=" + JSON.stringify(path.join(sementara, 'jejak.txt')) + ";"
    + "fs.appendFileSync(f,'mulai '+process.argv[2]+'\\n');setTimeout(()=>{fs.appendFileSync(f,'selesai '+process.argv[2]+'\\n');},400);");
  const pembungkus = (n) => tulisUji('catat-' + n + '.js', "process.argv[2]=" + JSON.stringify(n) + ";require(" + JSON.stringify(catat) + ");");
  h = await jalankanPelari([
    { label: 'Biasa satu', berkas: pembungkus('a') }, { label: 'Sendirian', berkas: pembungkus('s'), sendiri: true },
    { label: 'Biasa dua', berkas: pembungkus('b') },
  ], ['--paralel=3']);
  const jejak = fs.existsSync(path.join(sementara, 'jejak.txt')) ? fs.readFileSync(path.join(sementara, 'jejak.txt'), 'utf8').trim().split('\n') : [];
  const iS = jejak.indexOf('mulai s');
  cek('uji bertanda sendiri baru mulai setelah semua uji lain selesai, dan tidak ditemani',
    h.kode === 0 && iS > 0 && jejak.slice(0, iS).filter((x) => /^selesai/.test(x)).length === 2 && jejak[iS + 1] === 'selesai s', jejak);

  console.log('\n=== C2. PERAMBAN DIBATASI, YANG GAGAL DIULANG SENDIRIAN ===');
  /* Di komputer pemilik (Windows), enam uji bersamaan membuat empat uji
     tampilan gagal karena halamannya tidak terbuka dalam 30 detik, dan uji
     yang di sini 7 detik di sana 58 detik. Uji yang membuka Chromium
     dibatasi jumlahnya, dan yang gagal diulang sekali tanpa teman. */
  fs.writeFileSync(path.join(sementara, 'jejak2.txt'), '');
  const catatPeramban = (n) => tulisUji('peramban-' + n + '.js',
    "const fs=require('fs');const f=" + JSON.stringify(path.join(sementara, 'jejak2.txt')) + ";"
    + "fs.appendFileSync(f,'mulai " + n + "\\n');setTimeout(()=>{fs.appendFileSync(f,'selesai " + n + "\\n');},500);");
  h = await jalankanPelari([
    { label: 'Peramban satu', berkas: catatPeramban('a'), peramban: true }, { label: 'Peramban dua', berkas: catatPeramban('b'), peramban: true },
    { label: 'Peramban tiga', berkas: catatPeramban('c'), peramban: true },
  ], ['--paralel=3', '--peramban=1']);
  const jejak2 = fs.readFileSync(path.join(sementara, 'jejak2.txt'), 'utf8').trim().split('\n');
  const tumpang = jejak2.some((x, i) => /^mulai/.test(x) && jejak2[i + 1] && /^mulai/.test(jejak2[i + 1]));
  cek('uji yang membuka peramban tidak melebihi batas --peramban (1: tidak pernah tumpang tindih)', h.kode === 0 && !tumpang && jejak2.length === 6, jejak2);
  cek('batas peramban disebut di kepala keluaran', /1 peramban/.test(h.keluaran), h.keluaran.split('\n').slice(0, 3));

  const tanda = path.join(sementara, 'sudah-sekali.txt');
  const goyah = tulisUji('goyah.js', "const fs=require('fs');const t=" + JSON.stringify(tanda) + ";"
    + "if(!fs.existsSync(t)){fs.writeFileSync(t,'1');console.log('  GAGAL| halaman tidak terbuka dalam 30 detik');process.exit(1);}"
    + "console.log('  OK   | kali kedua lancar');");
  h = await jalankanPelari([{ label: 'Uji yang goyah', berkas: goyah }, { label: 'Uji lulus pertama', berkas: lulus }]);
  cek('uji yang gagal sekali lalu lulus saat diulang sendirian: hasil akhirnya lulus', h.kode === 0 && /SEMUA LULUS/.test(h.keluaran), h.keluaran);
  cek('ulangannya tetap disebut, tidak disembunyikan', /Uji yang goyah[^\n]*diulang/i.test(h.keluaran) && /halaman tidak terbuka dalam 30 detik/.test(h.keluaran), h.keluaran);
  h = await jalankanPelari([{ label: 'Uji yang gagal', berkas: jatuh }]);
  cek('uji yang tetap gagal saat diulang tetap dianggap gagal', h.kode === 1 && /angka penghimpunan meleset 5000/.test(h.keluaran), h.keluaran);

  console.log('\n=== D. DAFTAR UJI YANG SUNGGUHAN ===');
  const pelari = require(PELARI);
  const daftar = pelari.DAFTAR;
  cek('daftar uji ada isinya', Array.isArray(daftar) && daftar.length >= 40, daftar && daftar.length);
  const hilang = daftar.filter((u) => !fs.existsSync(path.join(AKAR, 'tools', u.berkas)));
  cek('setiap uji di daftar berkasnya ada', hilang.length === 0, hilang);
  const nama = daftar.map((u) => u.berkas);
  cek('tidak ada uji yang terdaftar dua kali', new Set(nama).size === nama.length);
  cek('uji ini sendiri ikut terdaftar', nama.includes('test_jalankan_uji.js'));
  /* Hanya uji yang memuat Playwright yang dihitung peramban. Uji ini sendiri
     menyebut kata peramban di tiruannya, tetapi tidak membuka Chromium. */
  const polaPeramban = new RegExp('require\\([^)]*play' + 'wright|muat' + 'Play' + 'wright');
  const tandaPeramban = (b) => polaPeramban.test(fs.readFileSync(path.join(AKAR, 'tools', b), 'utf8'));
  cek('uji tampilan dikenali sebagai uji peramban', tandaPeramban('test_blast_ui.js') && tandaPeramban('test_skala_ui.js') && tandaPeramban('test_impor_berkas_ui.js'));
  cek('uji pelari ini bukan uji peramban', !tandaPeramban('test_jalankan_uji.js'));
  /* Uji yang mengukur waktu (milidetik hitung tata letak) gagal palsu kalau
     prosesor sedang dibagi dengan uji lain. Terukur: 78 ms lawan batas 45 ms
     saat bersamaan, 15,8 ms saat sendirian. */
  cek('uji pengukur waktu dijalankan sendirian', (daftar.find((u) => u.berkas === 'test_sidebar_gerak.js') || {}).sendiri === true);
  const bat = fs.readFileSync(path.join(AKAR, 'uji-sebelum-deploy.bat'), 'utf8');
  cek('uji-sebelum-deploy.bat memanggil pelari ini', /node\s+tools\\jalankan-uji\.js/.test(bat));
  cek('uji-sebelum-deploy.bat berakhiran CRLF', /\r\n/.test(bat) && !/[^\r]\n/.test(bat));

  /* Dua alat migrasi menulis ke folder data/ proyek yang sama, jadi
     keduanya harus bergiliran. Dengan basis data percobaan PostgreSQL,
     semua uji yang menulis ke sana juga harus bergiliran. */
  const grupTanpaPg = pelari.aturGrup(daftar, {});
  const g = (b, peta) => peta[b];
  cek('dua alat migrasi Redis bergiliran (satu kelompok)',
    g('test_alat_redis.js', grupTanpaPg) && g('test_alat_redis.js', grupTanpaPg) === g('test_ekspor_redis.js', grupTanpaPg));
  cek('tanpa basis data percobaan, uji Broadcast dan Fundraising boleh bersamaan',
    g('test_blast_fitur.js', grupTanpaPg) !== g('test_fund_fitur.js', grupTanpaPg));
  const grupPg = pelari.aturGrup(daftar, { UJI_DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/uji' });
  cek('dengan basis data percobaan, uji yang menulis ke sana bergiliran',
    g('test_blast_fitur.js', grupPg) === g('test_laz_pg.js', grupPg) && g('test_fund_fitur.js', grupPg) === g('test_laz_pg.js', grupPg));

  try { fs.rmSync(sementara, { recursive: true, force: true }); } catch (_) {}
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: pelari uji sebelum deploy belum benar.\n'); process.exit(1); }
  console.log('\ntest_jalankan_uji.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
