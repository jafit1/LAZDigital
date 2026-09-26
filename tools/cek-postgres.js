/* tools/cek-postgres.js: memeriksa sambungan ke PostgreSQL sebelum apa pun
 * dipindahkan, dan sebelum dideploy.
 *
 * Hanya MEMBACA. Tidak membuat, mengubah, atau menghapus apa pun.
 *
 * Yang diperiksa, berurutan dari yang paling sering jadi penyebab gagal:
 *
 *   1. Pustaka pg sudah terpasang.
 *   2. Alamatnya ada dan bentuknya benar.
 *   3. Portanya 6543 (transaction pooler), bukan 5432 (sambungan langsung).
 *      Ini yang paling mahal kalau terlewat: di Vercel, sambungan langsung
 *      kehabisan jatah sambungan dan gejalanya "kadang gagal kadang tidak",
 *      jenis masalah yang paling sulit dilacak, dan yang baru muncul setelah
 *      dipakai beramai-ramai, bukan saat dicoba sendiri.
 *   4. Sambungannya berhasil, dan berapa lama satu perjalanan bolak-balik.
 *   5. Ke-17 tabel sudah ada, beserta jumlah barisnya.
 *   6. Riwayat pemindahan (tabel migrasi), kalau sudah pernah diimpor.
 *
 * jalankan:
 *   node tools/cek-postgres.js
 *   node tools/cek-postgres.js --alamat "postgres://..."
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
const ALAMAT = opsi('--alamat', process.env.DATABASE_URL || process.env.POSTGRES_URL || '');

let masalah = 0, peringatan = 0;
const ok = (t) => console.log('  ok        | ' + t);
const buruk = (t, saran) => { masalah++; console.log('  MASALAH   | ' + t); if (saran) console.log('              -> ' + saran); };
const hati = (t, saran) => { peringatan++; console.log('  PERHATIAN | ' + t); if (saran) console.log('              -> ' + saran); };

/* Alamat memuat sandi basis data. Yang ditampilkan hanya bagian yang aman:
   repositori ini publik, dan keluaran alat sering ikut ditempel ke mana-mana. */
function alamatAman(a) {
  try {
    const u = new URL(a);
    return u.protocol + '//' + u.username + ':***@' + u.hostname + ':' + (u.port || '(bawaan)') + u.pathname;
  } catch (e) { return '(bentuk alamat tidak bisa dibaca)'; }
}

const TABEL = ['Users', 'Rekening', 'Layanan', 'Donatur', 'Settings', 'Penghimpunan',
  'Pentasyarufan', 'UangMuka', 'Transfer', 'Mutasi', 'SaldoAwal', 'Sessions',
  'AuditLog', 'kv', 'kv_set', 'cadangan', 'migrasi'];

(async () => {
  console.log('\n================ PEMERIKSAAN POSTGRESQL ================\n');

  let Client;
  try { ({ Client } = require('pg')); ok('pustaka pg terpasang'); }
  catch (e) {
    buruk('pustaka pg belum terpasang', 'jalankan: npm install');
    console.log('\n' + masalah + ' masalah. Berhenti di sini.\n');
    process.exit(1);
  }

  /* Keluar dengan kode 2 (DILEWATI), bukan 1 (GAGAL): selama belum pindah ke
     PostgreSQL, tidak adanya DATABASE_URL memang keadaan yang benar, dan
     uji-sebelum-deploy.bat tidak boleh menganggapnya kegagalan. Yang dianggap
     gagal adalah alamat yang ADA tapi tidak bisa dipakai. */
  if (!ALAMAT) {
    console.log('  DILEWATI  | DATABASE_URL belum ada, jadi belum ada yang bisa diperiksa.');
    console.log('              Kalau memang belum pindah ke PostgreSQL, ini wajar.');
    console.log('              Kalau sudah punya alamatnya, buat berkas .env.local di folder');
    console.log('              proyek, isinya satu baris:');
    console.log('              DATABASE_URL=postgresql://postgres.xxxx:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres\n');
    process.exit(2);
  }
  ok('alamat ditemukan: ' + alamatAman(ALAMAT));

  let porta = '', tuanRumah = '', pengguna = '';
  try {
    const u = new URL(ALAMAT);
    porta = u.port; tuanRumah = u.hostname; pengguna = decodeURIComponent(u.username || '');
  } catch (e) {
    buruk('bentuk alamatnya tidak bisa dibaca', 'salin ulang dari Supabase, jangan diedit tangan');
  }

  if (/supabase/.test(tuanRumah) && porta === '5432') {
    hati('memakai porta 5432 (sambungan langsung)',
      'ambil yang porta 6543. Di Supabase: tombol Connect -> tab Direct ->\n'
      + '                 kotak "Shared pooler" (namanya Shared pooler, itulah transaction pooler-nya).\n'
      + '                 Sambungan langsung akan kehabisan jatah begitu dipakai beramai-ramai di Vercel.');
  } else if (porta === '6543') {
    ok('porta 6543 (transaction pooler), benar untuk Vercel');
  } else if (porta) {
    ok('porta ' + porta);
  }

  /* Nama pengguna adalah penanda paling jelas string mana yang tersalin.
     Shared pooler memakai postgres.<kode-proyek>; sambungan langsung memakai
     postgres saja. Galat "password authentication failed for user postgres"
     hampir selalu berarti yang tersalin string yang salah, bukan sandinya yang
     keliru, dan pesan bawaan PostgreSQL tidak pernah menyebutkan itu. */
  if (/supabase/.test(tuanRumah)) {
    if (/^postgres\.[a-z0-9]+$/i.test(pengguna)) {
      ok('nama pengguna ' + pengguna + ' (shared pooler, benar)');
    } else if (pengguna === 'postgres') {
      buruk('nama penggunanya "postgres" saja, bukan "postgres.<kode-proyek>"',
        'yang tersalin string Direct connection, bukan Shared pooler.\n'
        + '                 Ambil dari tombol Connect -> tab Direct -> kotak "Shared pooler" (porta 6543).');
    } else if (pengguna) {
      hati('nama penggunanya "' + pengguna + '", di luar dugaan',
        'shared pooler seharusnya postgres.<kode-proyek>');
    }
  }

  /* Penanda contoh yang belum diganti. Disebut apa yang ditemukan, supaya jelas
     bagian mana dari alamatnya yang perlu diperbaiki. */
  const penanda = ['[YOUR-PASSWORD]', 'YOUR-PASSWORD', '[SANDI]', 'SANDI', '[', '<']
    .find((x) => ALAMAT.includes(x));
  if (penanda) {
    buruk('alamatnya masih memuat penanda contoh: ' + penanda,
      'ganti SELURUH bagian itu, termasuk kurung sikunya, dengan Database Password\n'
      + '                 proyek Supabase. Kalau sandinya lupa: Project Settings -> Database ->\n'
      + '                 Reset database password.');
  }

  const klien = new Client({
    connectionString: ALAMAT,
    ssl: /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(ALAMAT) ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  });

  const mulai = Date.now();
  try {
    await klien.connect();
  } catch (e) {
    const p = String(e.message || e);
    buruk('tidak bisa menyambung: ' + p, tebakSebab(p));
    console.log('\n' + masalah + ' masalah. Berhenti di sini.\n');
    process.exit(1);
  }
  const lamaSambung = Date.now() - mulai;
  ok('tersambung dalam ' + lamaSambung + ' ms');

  try {
    const t0 = Date.now();
    const v = await klien.query('SELECT version()');
    const pp = Date.now() - t0;
    ok('satu perjalanan bolak-balik ' + pp + ' ms · ' + String(v.rows[0].version).split(' ').slice(0, 2).join(' '));
    if (pp > 400) {
      hati('perjalanannya lambat (' + pp + ' ms)',
        'kalau region Supabase-nya bukan Singapura, dasbor akan terasa berat. Region tidak bisa diubah setelah proyek dibuat.');
    }

    console.log('\n---------------- tabel ----------------');
    const ada = await klien.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const punya = new Set(ada.rows.map((r) => r.table_name));
    const kurang = TABEL.filter((t) => !punya.has(t));

    if (kurang.length === TABEL.length) {
      buruk('belum ada satu pun tabel',
        'di Supabase: SQL Editor -> New query -> tempel seluruh isi sql\\01-skema.sql -> Run');
    } else if (kurang.length) {
      buruk('tabel yang belum ada: ' + kurang.join(', '),
        'jalankan ulang sql\\01-skema.sql di SQL Editor. Berkas itu aman diulang.');
    } else {
      ok('ke-' + TABEL.length + ' tabel sudah ada');

      const hitung = TABEL.filter((t) => t !== 'migrasi')
        .map((t) => "SELECT '" + t + "' AS t, count(*)::int AS n FROM \"" + t + '"').join(' UNION ALL ');
      const h = await klien.query(hitung);
      const peta = {};
      h.rows.forEach((r) => { peta[r.t] = Number(r.n); });
      const isi = Object.entries(peta).filter(([, n]) => n > 0);
      if (!isi.length) {
        console.log('  (semua tabel masih kosong: belum diimpor)');
      } else {
        isi.forEach(([t, n]) => console.log('    ' + t.padEnd(16) + String(n).padStart(8) + ' baris'));
      }

      /* RLS: ini pemeriksaan keamanan, bukan kerapian. Supabase membuka skema
         public sebagai REST API yang bisa dipakai siapa pun pemegang anon key,
         dan anon key memang ditempel di halaman web jadi bukan rahasia. Tanpa
         RLS, nama dan nomor telepon donatur serta hash sandi pengguna bisa
         diambil dari luar dengan satu perintah curl. */
      console.log('\n---------------- keamanan ----------------');
      const rls = await klien.query(
        "SELECT count(*)::int AS semua, count(*) FILTER (WHERE rowsecurity)::int AS nyala "
        + "FROM pg_tables WHERE schemaname='public'");
      const { semua, nyala } = rls.rows[0];
      if (nyala === semua) {
        ok('Row Level Security menyala di ' + nyala + ' dari ' + semua + ' tabel');
      } else if (nyala === 0) {
        buruk('Row Level Security MATI di semua tabel: datanya bisa dibaca dari luar',
          'jalankan sql\\02-keamanan.sql di SQL Editor Supabase');
      } else {
        buruk('Row Level Security baru menyala di ' + nyala + ' dari ' + semua + ' tabel',
          'jalankan sql\\02-keamanan.sql di SQL Editor Supabase (aman diulang)');
      }

      const peranLuar = await klien.query(
        "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
      if (peranLuar.rows.length) {
        const terbuka = [];
        for (const t of TABEL) {
          if (!punya.has(t)) continue;
          const r = await klien.query(
            'SELECT has_table_privilege($1, format($2, $3::text), $4) AS boleh',
            ['anon', 'public.%I', t, 'SELECT']);
          if (r.rows[0].boleh) terbuka.push(t);
        }
        if (terbuka.length) {
          buruk('REST API Supabase masih boleh membaca: ' + terbuka.join(', '),
            'jalankan sql\\02-keamanan.sql');
        } else {
          ok('REST API Supabase tidak punya akses ke satu tabel pun');
        }
      }

      if (peta.Users === 0) {
        console.log('\n  Catatan: tabel Users masih kosong. Itu wajar sebelum impor.');
        console.log('  Kalau nanti dideploy dengan Users kosong, aplikasi membuat akun');
        console.log('  superadmin baru sendiri dan sandinya acak. Impor dulu.');
      }
    }

    if (punya.has('migrasi')) {
      const m = await klien.query('SELECT waktu, mode, berkas, potong FROM migrasi ORDER BY id DESC LIMIT 3');
      console.log('\n---------------- riwayat pemindahan ----------------');
      if (!m.rows.length) console.log('  belum pernah diimpor');
      else m.rows.forEach((r) => console.log('  ' + new Date(r.waktu).toISOString().slice(0, 16).replace('T', ' ')
        + '  mode ' + r.mode + (r.potong ? '  potong ' + new Date(r.potong).toISOString().slice(0, 10) : '')
        + (r.berkas ? '  dari ' + r.berkas : '')));
    }
  } finally {
    await klien.end();
  }

  console.log('\n================ KESIMPULAN ================');
  if (masalah) {
    console.log(masalah + ' masalah' + (peringatan ? ', ' + peringatan + ' perhatian' : '') + '. Bereskan dulu sebelum lanjut.\n');
    process.exit(1);
  }
  console.log('Sambungan sehat' + (peringatan ? ', tapi ada ' + peringatan + ' hal yang perlu diperhatikan di atas' : '') + '.');
  console.log('Langkah berikutnya: node tools/impor-postgres.js --mode kosong --potong <tanggal>');
  console.log('(tanpa --jalankan dulu: itu simulasi, angkanya dicocokkan dengan dasbor)\n');
})().catch((e) => { console.error('\nGAGAL: ' + (e && e.message || e) + '\n'); process.exit(1); });

/* Pesan galat pg jarang menyebut penyebabnya dalam bahasa manusia. */
function tebakSebab(p) {
  if (/password authentication failed/i.test(p)) return 'sandinya salah. Ambil ulang Connection string dari Supabase, atau reset Database Password.';
  if (/ENOTFOUND|getaddrinfo/i.test(p)) return 'nama servernya tidak ditemukan. Periksa salinan alamatnya, atau proyek Supabase-nya sedang dihentikan (dinyalakan dari dasbor Supabase).';
  if (/ETIMEDOUT|timeout/i.test(p)) return 'tidak ada jawaban. Bisa jaringan, bisa proyek Supabase sedang tidur setelah 7 hari tanpa aktivitas. Buka dasbor Supabase dan nyalakan.';
  if (/ECONNREFUSED/i.test(p)) return 'sambungan ditolak. Periksa portanya (6543 untuk transaction pooler).';
  if (/does not exist/i.test(p)) return 'nama basis datanya salah. Di Supabase namanya "postgres".';
  if (/self signed|certificate/i.test(p)) return 'masalah sertifikat TLS. Pastikan alamatnya dari Supabase apa adanya, tanpa tambahan sslmode.';
  return 'salin pesan galat di atas apa adanya kalau perlu ditelusuri.';
}
