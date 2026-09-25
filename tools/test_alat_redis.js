/* Uji dua alat Redis: tools/ukur-redis.js dan tools/rapikan-redis.js
 *
 * KENAPA ALAT INI DIUJI SEKERAS INI.
 * rapikan-redis.js menghapus data dari basis data keuangan yang sedang
 * dipakai. Kesalahan di situ tidak menghasilkan pesan galat — ia menghasilkan
 * catatan yang hilang, dan baru ketahuan berbulan-bulan kemudian saat ada
 * yang mencari transaksi lama. Jadi yang diperiksa di sini bukan "apakah
 * jalan", melainkan setiap pagar pengamannya:
 *
 *   - tanpa --jalankan, TIDAK SATU PUN perintah tulis boleh sampai ke server;
 *   - cadangan harus sudah ada di cakram SEBELUM perintah hapus pertama;
 *   - AuditLog yang disisakan harus yang TERBARU, bukan yang terlama;
 *   - lampiran yang masih disebut sesi mana pun tidak boleh ikut terhapus;
 *   - kalau ada petugas menyimpan transaksi di saat bersamaan, buku besar
 *     tidak boleh ditimpa dan alatnya harus berhenti dengan status gagal.
 *
 * Servernya palsu: satu HTTP server kecil yang meniru REST Upstash, termasuk
 * endpoint /pipeline dan skrip Lua pengunci versi. Tidak ada jaringan luar,
 * tidak ada kuota terpakai, dan isinya bisa diatur persis seperti yang
 * dibutuhkan tiap kasus uji.
 *
 * jalankan:  node tools/test_alat_redis.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const AKAR = path.join(__dirname, '..');
const DIR_DATA = path.join(AKAR, 'data');

let ok = 0, gagal = 0;
const yangGagal = [];
function cek(nama, syarat, info) {
  if (syarat) { ok++; return; }
  gagal++;
  const ket = info === undefined ? '' : String(JSON.stringify(info)).slice(0, 240);
  yangGagal.push(nama + '  ->  ' + ket);
  console.log('  GAGAL|', nama, ket);
}

/* ---------------- server Upstash palsu ---------------- */
function buatServer(isi, opsi) {
  const o = opsi || {};
  const dicatat = [];            // semua perintah yang diterima
  const TULIS = new Set(['SET', 'DEL', 'EVAL', 'EXPIRE', 'SETEX', 'HSET', 'RPUSH', 'FLUSHDB']);
  let sudahMget = false;

  function jalankan(cmd) {
    const nama = String(cmd[0] || '').toUpperCase();
    dicatat.push(cmd);
    switch (nama) {
      case 'DBSIZE': return Object.keys(isi).length;
      case 'SCAN': {
        const pola = (() => {
          const i = cmd.findIndex((x) => String(x).toUpperCase() === 'MATCH');
          return i >= 0 ? String(cmd[i + 1]) : '*';
        })();
        const re = new RegExp('^' + pola.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return ['0', Object.keys(isi).filter((k) => re.test(k))];
      }
      case 'TYPE': return isi[cmd[1]] === undefined ? 'none' : 'string';
      case 'STRLEN': return String(isi[cmd[1]] === undefined ? '' : isi[cmd[1]]).length;
      case 'MEMORY': return String(isi[cmd[2]] === undefined ? '' : isi[cmd[2]]).length;
      case 'TTL': return o.ttl && o.ttl[cmd[1]] !== undefined ? o.ttl[cmd[1]] : -1;
      case 'GET': return isi[cmd[1]] === undefined ? null : isi[cmd[1]];
      case 'MGET': {
        const hasil = cmd.slice(1).map((k) => (isi[k] === undefined ? null : isi[k]));
        /* Meniru petugas lain yang menyimpan transaksi tepat setelah alat ini
           membaca buku besar: versinya naik di belakang punggungnya. */
        if (o.bentrokSetelahMget && !sudahMget) { sudahMget = true; isi['laz:ver'] = '999'; }
        return hasil;
      }
      case 'DEL': { let n = 0; for (const k of cmd.slice(1)) if (k in isi) { delete isi[k]; n++; } return n; }
      case 'EVAL': {
        const jumlahKeys = Number(cmd[2]);
        const keys = cmd.slice(3, 3 + jumlahKeys);
        const argv = cmd.slice(3 + jumlahKeys);
        const cur = isi[keys[1]] === undefined ? false : isi[keys[1]];
        if ((cur === false && argv[0] === '0') || cur === argv[0]) {
          isi[keys[0]] = argv[1]; isi[keys[1]] = argv[2]; return 1;
        }
        return 0;
      }
      default: throw new Error('perintah tak dikenal: ' + nama);
    }
  }

  const server = http.createServer((req, res) => {
    let badan = '';
    req.on('data', (c) => { badan += c; });
    req.on('end', () => {
      if (String(req.headers.authorization || '') !== 'Bearer TOKEN-UJI') {
        res.writeHead(401); return res.end('{"error":"unauthorized"}');
      }
      let cmd = null;
      try { cmd = JSON.parse(badan || 'null'); } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        if (req.url.replace(/\/+$/, '').endsWith('/pipeline')) {
          res.end(JSON.stringify(cmd.map((c) => ({ result: jalankan(c) }))));
        } else {
          res.end(JSON.stringify({ result: jalankan(cmd) }));
        }
      } catch (e) {
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
  return { server, dicatat, TULIS, isi };
}

/* ---------------- data contoh ---------------- */
function bukuBesar(jumlahLog, jumlahSesi) {
  const log = [['waktu', 'userId', 'username', 'aksi']];
  for (let i = 0; i < jumlahLog; i++) {
    log.push(['2026-01-' + String((i % 28) + 1).padStart(2, '0') + 'T00:00:00.000Z', 'u1', 'superadmin', 'aksi-' + i]);
  }
  const ses = [['token', 'userId', 'expired']];
  for (let i = 0; i < jumlahSesi; i++) {
    /* Separuh sudah kedaluwarsa, separuh masih hidup. */
    const w = i % 2 === 0 ? '2020-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z';
    ses.push(['t' + i, 'u1', w]);
  }
  return {
    sheets: {
      AuditLog: log, Sessions: ses,
      Penghimpunan: [['id', 'tanggal', 'nominal'], ['p1', '2026-01-02', 500000]],
      Users: [['id', 'username'], ['u1', 'superadmin']],
    },
    props: { _ver: 1 },
  };
}

function sesiAi(id, idLampiran) {
  return JSON.stringify({
    id, judul: 'Sesi ' + id,
    pesan: [{ peran: 'user', isi: 'halo', lampiran: idLampiran ? [{ id: idLampiran, nama: 'x.png' }] : [] }],
  });
}

/* HARUS asinkron. Versi pertama memakai execFileSync, dan itu menggantung:
   server Upstash palsu hidup di proses INI, sementara execFileSync menahan
   event loop sampai anaknya selesai — anak yang sedang menunggu jawaban dari
   server yang tidak akan pernah sempat menjawab. Saling menunggu, selamanya. */
function jalankanAlat(berkas, args, port) {
  return new Promise((selesai) => {
    execFile(process.execPath, [path.join(__dirname, berkas)].concat(args || []), {
      env: Object.assign({}, process.env, {
        UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:' + port,
        UPSTASH_REDIS_REST_TOKEN: 'TOKEN-UJI',
      }),
      encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    }, (e, keluar, galat) => {
      selesai({
        keluar: String(keluar || '') + String(galat || ''),
        kode: e ? (e.code === undefined ? -1 : e.code) : 0,
      });
    });
  });
}

function jalankanTanpaKredensial(berkas) {
  return new Promise((selesai) => {
    execFile(process.execPath, [path.join(__dirname, berkas)], {
      env: Object.assign({}, process.env, {
        UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
      }),
      encoding: 'utf8', timeout: 20000,
    }, (e, keluar, galat) => {
      selesai({
        keluar: String(keluar || '') + String(galat || ''),
        kode: e ? (e.code === undefined ? -1 : e.code) : 0,
      });
    });
  });
}

function cadanganBaru(sebelum) {
  return fs.existsSync(DIR_DATA)
    ? fs.readdirSync(DIR_DATA).filter((f) => /^cadangan-rapikan-/.test(f) && !sebelum.has(f))
    : [];
}

(async () => {
  const sebelumnya = new Set(fs.existsSync(DIR_DATA) ? fs.readdirSync(DIR_DATA) : []);
  const bersihkan = [];

  /* ============ A. ukur-redis.js ============ */
  console.log('=== A. ukur-redis.js ===');
  {
    const isi = {
      'laz:db': JSON.stringify(bukuBesar(50, 4)),
      'laz:ver': '7',
      'ai:sesi:daftar': JSON.stringify(['s1']),
      'ai:sesi:s1': sesiAi('s1', 'L1'),
      'ai:lampiran:L1': JSON.stringify({ mime: 'image/png', data: 'x'.repeat(5000) }),
      'blast:kontak:daftar': JSON.stringify([1, 2, 3]),
    };
    const { server, dicatat, TULIS } = buatServer(isi, { ttl: { 'ai:lampiran:L1': 86400 } });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const r = await jalankanAlat('ukur-redis.js', [], port);
    cek('berjalan tanpa galat', r.kode === 0, r.keluar.slice(-300));
    cek('melaporkan jumlah kunci', /Jumlah kunci\s*:\s*6/.test(r.keluar), r.keluar.match(/Jumlah kunci.*/));
    cek('melaporkan persentase jatah', /% dari jatah gratis 256 MB/.test(r.keluar));
    cek('merinci per kelompok', /ai:lampiran/.test(r.keluar) && /laz:db/.test(r.keluar));
    cek('merinci isi buku besar per tabel', /AuditLog/.test(r.keluar) && /Penghimpunan/.test(r.keluar));
    cek('menghitung perkiraan lebar pita', /kali buka halaman per bulan/.test(r.keluar));
    /* Alat ukur tidak boleh mengubah apa pun. */
    cek('tidak mengirim satu pun perintah tulis',
      dicatat.every((c) => !TULIS.has(String(c[0]).toUpperCase())),
      dicatat.filter((c) => TULIS.has(String(c[0]).toUpperCase())).slice(0, 3));
    /* Hemat kuota: jangan sekali-kali memakai KEYS. */
    cek('memakai SCAN, bukan KEYS', dicatat.every((c) => String(c[0]).toUpperCase() !== 'KEYS'));

    const j = await jalankanAlat('ukur-redis.js', ['--json'], port);
    let data = null;
    try { data = JSON.parse(j.keluar); } catch (e) {}
    cek('--json menghasilkan JSON yang sah', !!data, j.keluar.slice(0, 120));
    if (data) cek('--json memuat rincian buku besar', Array.isArray(data.bukuBesar) && data.bukuBesar.length === 4, data.bukuBesar && data.bukuBesar.length);

    server.close();
  }

  /* ============ B. rapikan-redis.js — SIMULASI ============ */
  console.log('\n=== B. rapikan-redis.js — simulasi (tanpa --jalankan) ===');
  {
    const isi = {
      'laz:db': JSON.stringify(bukuBesar(5000, 10)),
      'laz:ver': '7',
      'ai:sesi:daftar': JSON.stringify(['s1']),
      'ai:sesi:s1': sesiAi('s1', 'L1'),
      'ai:sesi:s2': sesiAi('s2', 'L2'),          // yatim: tidak ada di daftar
      'ai:lampiran:L1': JSON.stringify({ data: 'a'.repeat(1000) }),   // dipakai s1
      'ai:lampiran:L9': JSON.stringify({ data: 'b'.repeat(1000) }),   // yatim
    };
    const asli = JSON.parse(JSON.stringify(isi));
    const { server, dicatat, TULIS } = buatServer(isi);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const r = await jalankanAlat('rapikan-redis.js', [], port);
    cek('berjalan tanpa galat', r.kode === 0, r.keluar.slice(-300));
    cek('menyatakan dirinya mode simulasi', /MODE SIMULASI/.test(r.keluar));
    cek('melaporkan rencana pemangkasan AuditLog', /AuditLog\s*:\s*5000 baris -> 3000/.test(r.keluar), r.keluar.match(/AuditLog.*/));
    cek('melaporkan token kedaluwarsa', /Sessions\s*:\s*buang 5 token/.test(r.keluar), r.keluar.match(/Sessions.*/));
    cek('melaporkan lampiran yatim', /Lampiran yatim\s*:\s*1 berkas/.test(r.keluar), r.keluar.match(/Lampiran yatim.*/));
    cek('melaporkan sesi yatim', /Sesi yatim\s*:\s*1 sesi/.test(r.keluar), r.keluar.match(/Sesi yatim.*/));

    /* Inti pagar pertama. */
    cek('TIDAK mengirim satu pun perintah tulis',
      dicatat.every((c) => !TULIS.has(String(c[0]).toUpperCase())),
      dicatat.filter((c) => TULIS.has(String(c[0]).toUpperCase())).slice(0, 3));
    cek('isi basis data sama persis seperti sebelum dijalankan',
      JSON.stringify(isi) === JSON.stringify(asli));
    cek('tidak menulis berkas cadangan saat simulasi', cadanganBaru(sebelumnya).length === 0);

    server.close();
  }

  /* ============ C. rapikan-redis.js — JALANKAN ============ */
  console.log('\n=== C. rapikan-redis.js — dijalankan sungguhan ===');
  {
    const isi = {
      'laz:db': JSON.stringify(bukuBesar(5000, 10)),
      'laz:ver': '7',
      'ai:sesi:daftar': JSON.stringify(['s1']),
      'ai:sesi:s1': sesiAi('s1', 'L1'),
      'ai:sesi:s2': sesiAi('s2', 'L2'),
      'ai:lampiran:L1': JSON.stringify({ data: 'a'.repeat(1000) }),
      'ai:lampiran:L9': JSON.stringify({ data: 'b'.repeat(1000) }),
    };
    const { server, dicatat } = buatServer(isi);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const r = await jalankanAlat('rapikan-redis.js', ['--jalankan'], port);
    cek('berjalan tanpa galat', r.kode === 0, r.keluar.slice(-400));
    cek('menyatakan dirinya mode jalankan', /MODE JALANKAN/.test(r.keluar));

    const baru = cadanganBaru(sebelumnya);
    cek('menulis tepat satu berkas cadangan', baru.length === 1, baru);
    let cad = null;
    if (baru.length === 1) {
      bersihkan.push(path.join(DIR_DATA, baru[0]));
      cad = JSON.parse(fs.readFileSync(path.join(DIR_DATA, baru[0]), 'utf8'));
      cek('cadangan memuat baris AuditLog yang dibuang', Array.isArray(cad.auditlog) && cad.auditlog.length === 2001, cad.auditlog && cad.auditlog.length);
      cek('cadangan memuat token kedaluwarsa', Array.isArray(cad.sessions) && cad.sessions.length === 6, cad.sessions && cad.sessions.length);
      cek('cadangan memuat isi lampiran yang dihapus', !!(cad.lampiran && cad.lampiran['ai:lampiran:L9']));
      cek('cadangan memuat isi sesi yang dihapus', !!(cad.sesi && cad.sesi['ai:sesi:s2']));
    }

    /* Pagar kedua: cadangan harus sudah ada SEBELUM hapus pertama. Kalau
       urutannya terbalik, kegagalan di tengah jalan meninggalkan data yang
       hilang tanpa salinan. */
    const iTulisPertama = dicatat.findIndex((c) => ['DEL', 'EVAL'].includes(String(c[0]).toUpperCase()));
    cek('ada perintah tulis yang benar-benar dikirim', iTulisPertama >= 0);
    cek('baris "Cadangan ditulis" muncul sebelum laporan penghapusan',
      r.keluar.indexOf('Cadangan ditulis') >= 0
      && r.keluar.indexOf('Cadangan ditulis') < r.keluar.indexOf('kunci dihapus'),
      { cadangan: r.keluar.indexOf('Cadangan ditulis'), hapus: r.keluar.indexOf('kunci dihapus') });

    const db = JSON.parse(isi['laz:db']);
    cek('AuditLog tersisa 3000 baris', db.sheets.AuditLog.length - 1 === 3000, db.sheets.AuditLog.length - 1);
    /* Pagar ketiga, dan yang paling mudah salah: yang disisakan harus yang
       TERBARU. Kalau terbalik, yang tersisa justru catatan paling tua dan
       jejak kejadian terakhir hilang. */
    cek('yang disisakan catatan TERBARU, bukan terlama',
      db.sheets.AuditLog[db.sheets.AuditLog.length - 1][3] === 'aksi-4999'
      && db.sheets.AuditLog[1][3] === 'aksi-2000',
      { pertama: db.sheets.AuditLog[1][3], terakhir: db.sheets.AuditLog[db.sheets.AuditLog.length - 1][3] });
    cek('token kedaluwarsa hilang, yang masih hidup tetap ada',
      db.sheets.Sessions.length - 1 === 5 && db.sheets.Sessions.slice(1).every((b) => b[2] === '2099-01-01T00:00:00.000Z'),
      db.sheets.Sessions.length - 1);
    cek('tabel lain tidak tersentuh',
      db.sheets.Penghimpunan.length === 2 && db.sheets.Users.length === 2);
    cek('versi buku besar naik satu', isi['laz:ver'] === '8', isi['laz:ver']);

    cek('lampiran yatim dihapus', !('ai:lampiran:L9' in isi));
    cek('lampiran yang masih dipakai TIDAK dihapus', 'ai:lampiran:L1' in isi);
    cek('sesi yatim dihapus', !('ai:sesi:s2' in isi));
    cek('sesi yang terdaftar TIDAK dihapus', 'ai:sesi:s1' in isi);
    cek('daftar sesi tidak ikut terhapus', 'ai:sesi:daftar' in isi);

    server.close();
  }

  /* ============ D. bentrok dengan petugas lain ============ */
  console.log('\n=== D. ada yang menyimpan transaksi di saat bersamaan ===');
  {
    const isi = {
      'laz:db': JSON.stringify(bukuBesar(5000, 2)),
      'laz:ver': '7',
      'ai:sesi:daftar': JSON.stringify([]),
    };
    const dbSebelum = isi['laz:db'];
    const { server } = buatServer(isi, { bentrokSetelahMget: true });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const r = await jalankanAlat('rapikan-redis.js', ['--jalankan'], port);
    cek('berhenti dengan status gagal', r.kode !== 0, r.kode);
    cek('menjelaskan sebabnya dengan bahasa manusia', /menyimpan transaksi di saat yang sama/.test(r.keluar), r.keluar.slice(-200));
    cek('buku besar TIDAK ditimpa', isi['laz:db'] === dbSebelum);
    const baru = cadanganBaru(sebelumnya);
    for (const f of baru) bersihkan.push(path.join(DIR_DATA, f));
    cek('cadangan tetap ditulis sebelum percobaan tulis', baru.length >= 1, baru);

    server.close();
  }

  /* ============ E. pilihan baris perintah ============ */
  console.log('\n=== E. pilihan baris perintah ===');
  {
    const isi = {
      'laz:db': JSON.stringify(bukuBesar(5000, 4)),
      'laz:ver': '1',
      'ai:sesi:daftar': JSON.stringify([]),
      'ai:sesi:s9': sesiAi('s9', null),
      'ai:lampiran:L9': JSON.stringify({ data: 'c'.repeat(500) }),
    };
    const { server } = buatServer(isi);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const a = await jalankanAlat('rapikan-redis.js', ['--simpan-log', '100'], port);
    cek('--simpan-log mengubah jumlah yang disisakan', /5000 baris -> 100/.test(a.keluar), a.keluar.match(/AuditLog.*/));

    const b = await jalankanAlat('rapikan-redis.js', ['--hanya', 'lampiran'], port);
    cek('--hanya lampiran melewati AuditLog', !/AuditLog/.test(b.keluar), b.keluar.match(/AuditLog.*/));
    cek('--hanya lampiran tetap melaporkan lampiran', /Lampiran yatim/.test(b.keluar));

    server.close();
  }

  /* ============ F. tanpa kredensial ============ */
  console.log('\n=== F. dijalankan tanpa kredensial ===');
  {
    for (const alat of ['ukur-redis.js', 'rapikan-redis.js']) {
      const { keluar, kode } = await jalankanTanpaKredensial(alat);
      /* Kalau .env.local kebetulan ada di komputer ini, alatnya memang akan
         jalan — itu bukan kegagalan uji, jadi kasus ini dilewati. */
      if (fs.existsSync(path.join(AKAR, '.env.local')) || fs.existsSync(path.join(AKAR, '.env'))) {
        cek(alat + ': dilewati, .env.local ada di komputer ini', true);
      } else {
        cek(alat + ': berhenti sopan, bukan menumpahkan tumpukan galat',
          kode === 2 && /belum ada/.test(keluar), { kode, keluar: keluar.slice(0, 120) });
      }
    }
  }

  for (const f of bersihkan) { try { fs.unlinkSync(f); } catch (e) {} }

  if (yangGagal.length) {
    console.log('\nYANG GAGAL:');
    yangGagal.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));
  }
  console.log('\ntest_alat_redis.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
