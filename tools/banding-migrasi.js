/* tools/banding-migrasi.js: membuktikan hasil impor, bukan mengira-ngira.
 *
 * Membandingkan dua sisi dengan cara yang sama persis:
 *
 *   sisi lama : berkas ekspor Redis
 *   sisi baru : isi PostgreSQL, dibaca kembali lalu disusun ulang ke bentuk
 *               lembar yang dikenali api/_engine.js
 *
 * Lalu SALDO DIHITUNG DI KEDUA SISI DENGAN FUNGSI YANG SAMA (apiSaldo milik
 * aplikasinya sendiri). Ini pemeriksaan yang sesungguhnya. Mencocokkan jumlah
 * baris saja tidak cukup: baris bisa lengkap sementara angkanya jatuh ke akun
 * yang keliru, dan itu justru kesalahan yang paling mungkin terjadi. Saldo
 * per dana yang sama di kedua sisi berarti uangnya mendarat di tempat yang
 * benar, bukan sekadar terbawa.
 *
 * Khusus mode "kosong", yang dibandingkan hasil akhirnya: sisi lama punya
 * ribuan transaksi dan nol saldo awal; sisi baru punya nol transaksi dan
 * saldo awal hasil hitungan. Saldo akhirnya WAJIB sama. Kalau berbeda, ada
 * akun yang salah tempat, dan itu ketahuan di sini, bukan tiga bulan lagi
 * saat ada yang bertanya kenapa kas Infak kurang.
 *
 * Hanya membaca. Tidak menulis apa pun, di kedua sisi.
 *
 * jalankan:
 *   node tools/banding-migrasi.js --alamat "postgres://..." --potong 2026-09-26
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const DIR = path.join(AKAR, 'data');

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
const ALAMAT = opsi('--alamat', process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
const POTONG = opsi('--potong', new Date().toISOString().slice(0, 10));
if (!ALAMAT) { console.error('\nPakai --alamat "postgres://..." atau setel DATABASE_URL.\n'); process.exit(2); }

function berkasTerbaru() {
  if (!fs.existsSync(DIR)) return null;
  const d = fs.readdirSync(DIR).filter((f) => /^ekspor-redis-.*\.json$/.test(f)).sort();
  return d.length ? path.join(DIR, d[d.length - 1]) : null;
}
const bArg = opsi('--berkas', null);
const BERKAS = bArg ? (path.isAbsolute(bArg) ? bArg : path.join(AKAR, bArg)) : berkasTerbaru();
if (!BERKAS || !fs.existsSync(BERKAS)) { console.error('\nBerkas ekspor tidak ditemukan.\n'); process.exit(2); }

let Client;
try { ({ Client } = require('pg')); } catch (e) { console.error('\nnpm install pg\n'); process.exit(2); }

const engine = require(path.join(AKAR, 'api', '_engine.js'));
const rupiah = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

let ok = 0, beda = 0;
const selisih = [];
function cek(nama, sama, kiri, kanan) {
  if (sama) { ok++; console.log('  cocok  | ' + nama); return; }
  beda++;
  selisih.push({ nama, lama: kiri, baru: kanan });
  console.log('  BEDA   | ' + nama + '   lama=' + kiri + '  baru=' + kanan);
}

/* Menjalankan apiSaldo di atas sebuah objek basis data, dengan sesi sementara
   yang hanya ada di memori. Dipakai untuk KEDUA sisi supaya rumusnya identik. */
async function saldoDari(db, potong) {
  const salinan = JSON.parse(JSON.stringify(db));
  const kepalaU = (salinan.sheets.Users || [[]])[0] || [];
  const iId = kepalaU.indexOf('id'), iRole = kepalaU.indexOf('role');
  const barisU = (salinan.sheets.Users || []).slice(1);
  const su = barisU.find((b) => String(b[iRole]).toLowerCase() === 'superadmin') || barisU[0];
  if (!su) throw new Error('tidak ada pengguna, saldo tidak bisa dihitung');
  const token = 'banding-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  salinan.sheets.Sessions = [['token', 'userId', 'expired'],
    [token, su[iId], new Date(Date.now() + 3600e3).toISOString()]];
  const r = await engine.runRPC(salinan, 'apiSaldo', [token, potong], {});
  return r.result;
}

/* Bentuk lembar (larik-of-larik, baris pertama judul kolom) yang dipahami
   engine. Nama kolom dan penerjemahan nilainya diambil dari lib/laz-skema.js,
   satu definisi yang sama dengan yang dipakai aplikasi saat berjalan. Kalau
   berkas ini menyalin daftarnya sendiri, ia bisa membuktikan kecocokan yang
   tidak berlaku lagi di aplikasi. */
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
function keLembar(tabel, baris) {
  const kepala = skema.kepala(tabel);
  const tipe = skema.tipeKolom(tabel);
  return [kepala].concat(baris.map((r) => kepala.map((k) => skema.keMesin(tipe[k], r[k]))));
}
const KEPALA = {};
skema.NAMA_TABEL.forEach((t) => { KEPALA[t] = skema.kepala(t); });
(async () => {
  console.log('\nMembandingkan sisi lama dan sisi baru, per ' + POTONG + '.');
  console.log('Berkas lama: ' + path.basename(BERKAS) + '\n');

  const ekspor = JSON.parse(fs.readFileSync(BERKAS, 'utf8'));
  if (!ekspor.kunci || !ekspor.kunci['laz:db']) { console.error('laz:db tidak ada di ekspor.\n'); process.exit(1); }
  const dbLama = JSON.parse(ekspor.kunci['laz:db'].nilai);

  const klien = new Client({ connectionString: ALAMAT });
  await klien.connect();
  try {
    const mig = await klien.query('SELECT mode, berkas, potong FROM migrasi ORDER BY id DESC LIMIT 1');
    const mode = mig.rows.length ? mig.rows[0].mode : '?';
    console.log('Impor terakhir: mode ' + mode + (mig.rows.length ? ', dari ' + mig.rows[0].berkas : '') + '\n');

    /* Susun ulang isi PostgreSQL jadi bentuk lembar. */
    const dbBaru = { sheets: {}, props: {} };
    for (const [tabel, kepala] of Object.entries(KEPALA)) {
      const r = await klien.query('SELECT * FROM "' + tabel + '"');
      dbBaru.sheets[tabel] = keLembar(tabel, r.rows);
    }

    console.log('================ JUMLAH BARIS ================');
    for (const tabel of Object.keys(KEPALA)) {
      if (tabel === 'Sessions') continue;          // sengaja tidak dibawa
      const lama = Math.max(0, ((dbLama.sheets || {})[tabel] || []).length - 1);
      const baru = Math.max(0, dbBaru.sheets[tabel].length - 1);
      const tabelTransaksi = ['Penghimpunan', 'Pentasyarufan', 'UangMuka', 'Transfer', 'Mutasi', 'AuditLog'];
      if (mode === 'induk' && (tabelTransaksi.includes(tabel) || tabel === 'SaldoAwal')) {
        cek(tabel + ' sengaja dikosongkan', baru === 0, lama, baru);
      } else if (mode === 'kosong' && tabelTransaksi.includes(tabel)) {
        cek(tabel + ' sengaja dikosongkan', baru === 0, lama, baru);
      } else if (mode === 'kosong' && tabel === 'SaldoAwal') {
        cek('SaldoAwal berisi saldo pindahan', baru > 0, lama, baru);
      } else {
        cek(tabel, lama === baru, lama, baru);
      }
    }

    if (mode === 'induk') {
      /* Di mode induk tidak ada angka uang yang dibawa, jadi saldonya memang
         TIDAK boleh sama dengan sisi lama. Yang dibuktikan di sini justru
         sebaliknya: sisi baru benar-benar nol, supaya tidak ada sisa angka yang
         terbawa diam-diam. */
      console.log('\n================ SALDO ================');
      console.log('Mode induk: tidak ada angka uang yang dibawa. Yang diperiksa justru');
      console.log('bahwa sisi baru benar-benar nol.\n');
      const sNol = await saldoDari(dbBaru, POTONG);
      cek('total kas & bank nol', Math.round(Number(sNol.totalKasBank) || 0) === 0, '-', rupiah(sNol.totalKasBank));
      cek('total uang muka program nol', Math.round(Number(sNol.totalUmp) || 0) === 0, '-', rupiah(sNol.totalUmp));
      cek('total dana nol', Math.round(Number(sNol.totalDana) || 0) === 0, '-', rupiah(sNol.totalDana));
      cek('saldo awal memang belum diisi', sNol.adaSaldoAwal === false, '-', String(sNol.adaSaldoAwal));

      console.log('\n================ HASIL ================');
      console.log(ok + ' cocok, ' + beda + ' berbeda.');
      if (beda) {
        console.log('\nYANG BERBEDA:');
        selisih.forEach((x, i) => console.log('  ' + (i + 1) + '. ' + x.nama + '  lama=' + x.lama + '  baru=' + x.baru));
        process.exitCode = 1;
      } else {
        console.log('\nData induk terbawa lengkap, dan sisi uangnya benar-benar bersih.');
        console.log('Langkah berikutnya setelah deploy: Pengaturan > Saldo Awal, isi per');
        console.log('rekening dan per kas dari rekening koran.\n');
      }
      return;
    }

    console.log('\n================ SALDO ================');
    console.log('Dihitung di kedua sisi dengan apiSaldo, fungsi aplikasinya sendiri.\n');
    const sLama = await saldoDari(dbLama, POTONG);
    const sBaru = await saldoDari(dbBaru, POTONG);

    const bulat = (n) => Math.round(Number(n) || 0);
    cek('total kas & bank', bulat(sLama.totalKasBank) === bulat(sBaru.totalKasBank),
      rupiah(sLama.totalKasBank), rupiah(sBaru.totalKasBank));
    cek('total uang muka program', bulat(sLama.totalUmp) === bulat(sBaru.totalUmp),
      rupiah(sLama.totalUmp), rupiah(sBaru.totalUmp));
    cek('total dana', bulat(sLama.totalDana) === bulat(sBaru.totalDana),
      rupiah(sLama.totalDana), rupiah(sBaru.totalDana));

    console.log('\n--- per dana ---');
    const danaSemua = [...new Set(Object.keys(sLama.perDana).concat(Object.keys(sBaru.perDana)))].sort();
    for (const d of danaSemua) {
      const a = (sLama.perDana[d] || {}).saldoDana || 0;
      const b = (sBaru.perDana[d] || {}).saldoDana || 0;
      cek('dana ' + d, bulat(a) === bulat(b), rupiah(a), rupiah(b));
    }

    console.log('\n--- per akun ---');
    const petaLama = {}; sLama.perAkun.forEach((a) => { petaLama[a.kode] = a; });
    const petaBaru = {}; sBaru.perAkun.forEach((a) => { petaBaru[a.kode] = a; });
    const kodeSemua = [...new Set(Object.keys(petaLama).concat(Object.keys(petaBaru)))].sort();
    for (const k of kodeSemua) {
      const a = petaLama[k] ? petaLama[k].saldo : 0;
      const b = petaBaru[k] ? petaBaru[k].saldo : 0;
      if (!a && !b) continue;                       // dua-duanya nol, tidak menarik
      cek(k + '  (' + ((petaLama[k] || petaBaru[k]).label || '') + ')', bulat(a) === bulat(b), rupiah(a), rupiah(b));
    }

    if (mode === 'penuh') {
      console.log('\n================ TOTAL NOMINAL ================');
      for (const [tabel, kolom] of [['Penghimpunan', 'jumlah'], ['Pentasyarufan', 'jumlah'],
        ['UangMuka', 'nominal'], ['Transfer', 'nominal'], ['Mutasi', 'nominal']]) {
        const kepala = ((dbLama.sheets || {})[tabel] || [[]])[0] || [];
        const i = kepala.indexOf(kolom);
        const lama = i < 0 ? 0 : (dbLama.sheets[tabel] || []).slice(1)
          .reduce((n, b) => n + (Number(String(b[i]).replace(/[^0-9.-]/g, '')) || 0), 0);
        const r = await klien.query('SELECT COALESCE(SUM("' + kolom + '"),0) AS s FROM "' + tabel + '"');
        const baru = Number(r.rows[0].s);
        cek(tabel + '.' + kolom, Math.round(lama) === Math.round(baru), rupiah(lama), rupiah(baru));
      }
    }

    console.log('\n================ HASIL ================');
    console.log(ok + ' cocok, ' + beda + ' berbeda.');
    if (beda) {
      console.log('\nYANG BERBEDA:');
      selisih.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s.nama + '  lama=' + s.lama + '  baru=' + s.baru));
      console.log('\nJANGAN dipakai dulu. Selisih sekecil apa pun di sini berarti ada uang');
      console.log('yang mendarat di akun yang keliru.\n');
      process.exitCode = 1;
    } else {
      console.log('\nSemua cocok. Sisi baru menghasilkan angka yang sama persis dengan sisi lama.\n');
    }
  } finally {
    await klien.end();
  }
})().catch((e) => { console.error('\nGAGAL:', e.message, '\n'); process.exit(1); });
