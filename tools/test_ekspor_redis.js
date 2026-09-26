/* Uji tools/cek-redis-hidup.js dan tools/ekspor-redis.js
 *
 * Ekspor ini satu-satunya jalan data keluar dari Upstash yang jatahnya sudah
 * habis. Kalau ia salah, yang hilang bukan sebuah fitur melainkan seluruh
 * catatan keuangan. Jadi yang diperiksa di sini bukan "apakah jalan":
 *
 *   - tidak boleh ada satu pun perintah TULIS terkirim;
 *   - semua tipe kunci ikut terbawa, bukan hanya string;
 *   - masa kedaluwarsa tiap kunci ikut tercatat;
 *   - saat jatahnya habis di tengah jalan, yang sudah terambil TETAP tertulis
 *     ke cakram dan bisa dilanjutkan tanpa mengambil ulang;
 *   - cek-redis-hidup membedakan "jatah habis" dari galat lain, karena dua
 *     keadaan itu menuntut tindakan yang berbeda.
 *
 * Servernya palsu: satu HTTP server kecil yang meniru REST Upstash beserta
 * endpoint /pipeline, dan bisa disuruh berhenti melayani setelah sekian
 * perintah untuk menirukan jatah yang habis.
 *
 * jalankan:  node tools/test_ekspor_redis.js
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

const TULIS = new Set(['SET', 'DEL', 'EVAL', 'EXPIRE', 'SETEX', 'HSET', 'RPUSH', 'SADD', 'FLUSHDB', 'SREM']);

function buatServer(isi, opsi) {
  const o = opsi || {};
  const dicatat = [];
  let terpakai = 0;

  function jalankan(cmd) {
    const nama = String(cmd[0] || '').toUpperCase();
    dicatat.push(cmd);
    terpakai++;
    /* !== undefined, bukan sekadar truthy: jatah 0 (menirukan kuota yang sudah
       habis sama sekali) adalah angka yang sah dan tidak boleh dianggap
       "tidak diatur". */
    if (o.jatah !== undefined && terpakai > o.jatah) {
      throw new Error('max requests limit exceeded. Limit: ' + o.jatah + ', Usage: ' + o.jatah);
    }
    const k = cmd[1];
    /* Menirukan perilaku Upstash yang sesungguhnya: di dalam satu /pipeline,
       sebagian perintah dijawab normal dan sebagian lagi dibalas galat. Inilah
       yang dulu terlewat, dan akibatnya pesan galat tersimpan seakan-akan itu
       isinya. */
    if (o.tolakKunci && o.tolakKunci.test(String(k))) {
      throw new Error('max requests limit exceeded. Limit: 500000, Usage: 500000. '
        + 'See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details');
    }
    const v = isi[k];
    switch (nama) {
      case 'EXISTS': return v === undefined ? 0 : 1;
      case 'SCAN': {
        const i = cmd.findIndex((x) => String(x).toUpperCase() === 'MATCH');
        const pola = i >= 0 ? String(cmd[i + 1]) : '*';
        const re = new RegExp('^' + pola.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return ['0', Object.keys(isi).filter((x) => re.test(x))];
      }
      case 'TYPE': return v === undefined ? 'none' : (Array.isArray(v) ? 'set' : 'string');
      case 'GET': return v === undefined ? null : v;
      case 'SMEMBERS': return Array.isArray(v) ? v.slice() : [];
      case 'TTL': return (o.ttl && o.ttl[k] !== undefined) ? o.ttl[k] : -1;
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
      const pipa = req.url.replace(/\/+$/, '').endsWith('/pipeline');
      try {
        if (pipa) {
          /* Galat per perintah, bukan menggagalkan seluruh panggilan. */
          res.end(JSON.stringify(cmd.map((c) => {
            try { return { result: jalankan(c) }; } catch (e) { return { error: e.message }; }
          })));
        } else {
          res.end(JSON.stringify({ result: jalankan(cmd) }));
        }
      } catch (e) {
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
  return { server, dicatat };
}

function jalankanAlat(berkas, args, port) {
  return new Promise((selesai) => {
    execFile(process.execPath, [path.join(__dirname, berkas)].concat(args || []), {
      env: Object.assign({}, process.env, {
        UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:' + port,
        UPSTASH_REDIS_REST_TOKEN: 'TOKEN-UJI',
      }),
      encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    }, (e, keluar, galat) => {
      selesai({
        keluar: String(keluar || '') + String(galat || ''),
        kode: e ? (e.code === undefined ? -1 : e.code) : 0,
      });
    });
  });
}

function berkasEksporBaru(sebelum) {
  return fs.existsSync(DIR_DATA)
    ? fs.readdirSync(DIR_DATA).filter((f) => /^ekspor-redis-/.test(f) && !sebelum.has(f))
    : [];
}

function isiContoh() {
  return {
    'laz:db': JSON.stringify({ sheets: { Penghimpunan: [['id'], ['p1']] }, props: {} }),
    'laz:ver': '42',
    'laz:cadangan:harian-20260925': JSON.stringify({ sheets: {} }),
    'ai:sesi:daftar': JSON.stringify(['s1']),
    'ai:sesi:s1': JSON.stringify({ id: 's1', pesan: [] }),
    'ai:lampiran:L1': JSON.stringify({ data: 'xxxx' }),
    'blast:antrean': ['m1', 'm2', 'm3'],          // himpunan
    'blast:pesan:m1': JSON.stringify({ id: 'm1' }),
    'fund:donatur:daftar': JSON.stringify([]),
  };
}

(async () => {
  const sebelumnya = new Set(fs.existsSync(DIR_DATA) ? fs.readdirSync(DIR_DATA) : []);
  const bersihkan = [];

  /* ============ A. cek-redis-hidup ============ */
  console.log('=== A. cek-redis-hidup.js ===');
  {
    const { server, dicatat } = buatServer(isiContoh());
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const r = await jalankanAlat('cek-redis-hidup.js', [], server.address().port);
    cek('saat sehat: berhenti dengan status 0', r.kode === 0, { kode: r.kode, keluar: r.keluar.slice(0, 160) });
    cek('saat sehat: bilang BISA DIBACA', /BISA DIBACA/.test(r.keluar));
    cek('saat sehat: menunjukkan langkah berikutnya', /ekspor-redis\.js/.test(r.keluar));
    cek('hanya mengirim SATU perintah', dicatat.length === 1, dicatat);
    /* EXISTS, bukan GET: buku besar beberapa megabita tidak ikut terunduh
       hanya untuk memastikan sambungannya hidup. */
    cek('perintahnya EXISTS, bukan GET yang menarik seluruh isi',
      String(dicatat[0][0]).toUpperCase() === 'EXISTS', dicatat[0]);
    server.close();
  }
  {
    const { server } = buatServer(isiContoh(), { jatah: 0 });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const r = await jalankanAlat('cek-redis-hidup.js', [], server.address().port);
    cek('saat jatah habis: berhenti dengan status gagal', r.kode !== 0, r.kode);
    cek('saat jatah habis: bilang TIDAK BISA', /TIDAK BISA/.test(r.keluar), r.keluar.slice(0, 200));
    /* Dua keadaan berbeda menuntut tindakan berbeda, jadi pesannya tidak boleh
       sama. Yang ini harus menyebut kedua jalan keluarnya. */
    cek('saat jatah habis: menyebut naikkan paket dan tunggu reset',
      /Pay as You Go/i.test(r.keluar) && /berputar/i.test(r.keluar));
    cek('saat jatah habis: menegaskan datanya tidak hilang', /tidak ada data yang hilang/i.test(r.keluar));
    server.close();
  }

  /* ============ B. ekspor penuh ============ */
  console.log('\n=== B. ekspor-redis.js — ekspor penuh ===');
  {
    const isi = isiContoh();
    const { server, dicatat } = buatServer(isi, { ttl: { 'ai:lampiran:L1': 86400 } });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const r = await jalankanAlat('ekspor-redis.js', [], server.address().port);
    cek('berjalan tanpa galat', r.kode === 0, r.keluar.slice(-300));

    const baru = berkasEksporBaru(sebelumnya);
    cek('menulis tepat satu berkas ekspor', baru.length === 1, baru);
    if (baru.length === 1) {
      const p = path.join(DIR_DATA, baru[0]);
      bersihkan.push(p);
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      cek('semua kunci terbawa', Object.keys(d.kunci).length === Object.keys(isi).length,
        { ada: Object.keys(d.kunci).length, harusnya: Object.keys(isi).length });
      cek('tidak ada sisa yang belum terambil', d.belumTerambil.length === 0, d.belumTerambil);
      cek('isi buku besar sama persis dengan aslinya', d.kunci['laz:db'].nilai === isi['laz:db']);
      /* Himpunan bukan string. Kalau diambil dengan GET, jawabannya galat dan
         isinya hilang diam-diam — ini yang paling mudah terlewat. */
      cek('kunci bertipe himpunan ikut terbawa utuh',
        d.kunci['blast:antrean'].tipe === 'set'
        && JSON.stringify(d.kunci['blast:antrean'].nilai.slice().sort()) === JSON.stringify(['m1', 'm2', 'm3']),
        d.kunci['blast:antrean']);
      cek('masa kedaluwarsa ikut tercatat', d.kunci['ai:lampiran:L1'].ttl === 86400, d.kunci['ai:lampiran:L1'].ttl);
      cek('kunci tanpa kedaluwarsa tercatat -1', d.kunci['laz:db'].ttl === -1, d.kunci['laz:db'].ttl);
      cek('salinan cadangan di dalam Redis ikut terbawa', !!d.kunci['laz:cadangan:harian-20260925']);
      cek('waktu selesai tercatat', !!d.selesai);
    }
    cek('TIDAK mengirim satu pun perintah tulis',
      dicatat.every((c) => !TULIS.has(String(c[0]).toUpperCase())),
      dicatat.filter((c) => TULIS.has(String(c[0]).toUpperCase())).slice(0, 3));
    cek('memakai SCAN, bukan KEYS', dicatat.every((c) => String(c[0]).toUpperCase() !== 'KEYS'));
    cek('melaporkan jumlah perintah yang dipakai', /Perintah dipakai/.test(r.keluar));
    cek('mengingatkan menyimpan berkasnya di luar Redis', /BUKAN Redis/.test(r.keluar));
    server.close();
  }

  /* ============ C. jatah habis di tengah jalan ============ */
  console.log('\n=== C. jatah habis di tengah ekspor ===');
  {
    const isi = {};
    for (let i = 0; i < 250; i++) isi['laz:baris:' + i] = JSON.stringify({ i });
    /* Jatahnya dipatok supaya SCAN dan satu kelompok pertama lolos, lalu
       kelompok berikutnya ditolak. */
    const { server } = buatServer(isi, { jatah: 302 });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const r = await jalankanAlat('ekspor-redis.js', [], port);
    cek('berhenti dengan status gagal, bukan pura-pura selesai', r.kode !== 0, r.kode);
    cek('menjelaskan bahwa jatahnya habis', /jatah perintah habis/i.test(r.keluar), r.keluar.slice(-400));
    cek('memberi perintah untuk melanjutkan', /--lanjut/.test(r.keluar));

    const baru = berkasEksporBaru(sebelumnya).filter((f) => !bersihkan.some((b) => b.endsWith(f)));
    cek('yang sudah terambil tetap tertulis ke cakram', baru.length === 1, baru);
    if (baru.length === 1) {
      const p = path.join(DIR_DATA, baru[0]);
      bersihkan.push(p);
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      const terambil = Object.keys(d.kunci).length;
      cek('sebagian sudah terambil', terambil > 0 && terambil < 250, terambil);
      cek('sisanya tercatat untuk dilanjutkan', d.belumTerambil.length === 250 - terambil,
        { sisa: d.belumTerambil.length, terambil });
      cek('berkas separuh jalan tetap JSON yang sah', !!d.versi);

      /* Server baru dengan jatah longgar: lanjutan harus menyelesaikan sisanya
         DAN tidak mengambil ulang yang sudah ada. */
      server.close();
      const { server: s2, dicatat: d2 } = buatServer(isi);
      await new Promise((r2) => s2.listen(0, '127.0.0.1', r2));
      const r2 = await jalankanAlat('ekspor-redis.js', ['--lanjut', path.relative(AKAR, p)], s2.address().port);
      cek('lanjutan selesai tanpa galat', r2.kode === 0, r2.keluar.slice(-300));
      const d3 = JSON.parse(fs.readFileSync(p, 'utf8'));
      cek('setelah dilanjutkan semua kunci lengkap', Object.keys(d3.kunci).length === 250, Object.keys(d3.kunci).length);
      cek('lanjutan tidak mengulang SCAN dari nol',
        d2.every((c) => String(c[0]).toUpperCase() !== 'SCAN'),
        d2.filter((c) => String(c[0]).toUpperCase() === 'SCAN').length);
      const diambilUlang = d2.filter((c) => String(c[0]).toUpperCase() === 'TYPE').length;
      cek('lanjutan hanya mengambil yang belum ada', diambilUlang === d.belumTerambil.length,
        { diambilUlang, sisaTadi: d.belumTerambil.length });
      s2.close();
    } else {
      server.close();
    }
  }

  /* ============ C2. SEBAGIAN kunci ditolak di dalam satu pipeline ============ */
  console.log('\n=== C2. sebagian kunci ditolak di tengah pipeline ===');
  {
    const isi = isiContoh();
    /* Semua kunci blast: dan ai: ditolak, sisanya dilayani. Persis pola yang
       terjadi sungguhan: laz:db dan laz:cadangan:* lolos, modul lain tidak. */
    const { server } = buatServer(isi, { tolakKunci: /^(blast|ai):/ });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));

    const r = await jalankanAlat('ekspor-redis.js', [], server.address().port);
    const baru = berkasEksporBaru(sebelumnya).filter((f) => !bersihkan.some((b) => b.endsWith(f)));
    cek('menulis berkas ekspor', baru.length === 1, baru);
    if (baru.length === 1) {
      const p = path.join(DIR_DATA, baru[0]);
      bersihkan.push(p);
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));

      /* Inti perbaikannya: pesan galat TIDAK BOLEH tersimpan sebagai nilai. */
      const tercemar = Object.entries(d.kunci).filter(([, v]) =>
        (v.nilai && v.nilai.__galat) || (v.tipe && v.tipe.__galat)).map(([k]) => k);
      cek('tidak ada pesan galat tersimpan sebagai data', tercemar.length === 0, tercemar.slice(0, 5));
      cek('kunci yang ditolak tidak ikut tersimpan',
        !Object.keys(d.kunci).some((k) => /^(blast|ai):/.test(k)),
        Object.keys(d.kunci).filter((k) => /^(blast|ai):/.test(k)));
      cek('kunci yang berhasil tetap tersimpan utuh',
        !!d.kunci['laz:db'] && d.kunci['laz:db'].nilai === isi['laz:db']);
      cek('yang ditolak masuk daftar belum terambil',
        d.belumTerambil.length > 0 && d.belumTerambil.every((k) => /^(blast|ai):/.test(k)),
        d.belumTerambil);
      cek('berhenti dengan status gagal, bukan mengaku selesai', r.kode !== 0, r.kode);
      cek('menyebut berapa kunci yang belum terambil',
        /kunci belum berhasil diambil/.test(r.keluar), r.keluar.slice(-400));

      /* Berkas tercemar dari versi lama alat ini harus bisa dibersihkan lewat
         --lanjut, supaya tidak perlu mengekspor ulang dari nol. */
      const kotor = JSON.parse(fs.readFileSync(p, 'utf8'));
      kotor.kunci['blast:pesan:m1'] = {
        tipe: { __galat: 'max requests limit exceeded' },
        ttl: -1,
        nilai: { __galat: 'max requests limit exceeded' },
      };
      kotor.belumTerambil = kotor.belumTerambil.filter((k) => k !== 'blast:pesan:m1');
      fs.writeFileSync(p, JSON.stringify(kotor));
      server.close();

      const { server: s2 } = buatServer(isi);
      await new Promise((r2) => s2.listen(0, '127.0.0.1', r2));
      const r2 = await jalankanAlat('ekspor-redis.js', ['--lanjut', path.relative(AKAR, p)], s2.address().port);
      cek('--lanjut memberitahu ada kunci berisi pesan galat',
        /berisi pesan galat, bukan data/.test(r2.keluar), r2.keluar.slice(0, 400));
      const d3 = JSON.parse(fs.readFileSync(p, 'utf8'));
      cek('setelah dilanjutkan semua kunci lengkap dan bersih',
        Object.keys(d3.kunci).length === Object.keys(isi).length
        && !Object.values(d3.kunci).some((v) => v.nilai && v.nilai.__galat),
        { ada: Object.keys(d3.kunci).length, harusnya: Object.keys(isi).length });
      cek('kunci yang tadi tercemar sekarang berisi data sungguhan',
        !!d3.kunci['blast:pesan:m1'] && !d3.kunci['blast:pesan:m1'].nilai.__galat);
      s2.close();
    } else {
      server.close();
    }
  }

  /* ============ D. pilihan --pola ============ */
  console.log('\n=== D. pilihan --pola ===');
  {
    const { server } = buatServer(isiContoh());
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const r = await jalankanAlat('ekspor-redis.js', ['--pola', 'ai:*'], server.address().port);
    cek('berjalan tanpa galat', r.kode === 0, r.keluar.slice(-200));
    const baru = berkasEksporBaru(sebelumnya).filter((f) => !bersihkan.some((b) => b.endsWith(f)));
    if (baru.length === 1) {
      const p = path.join(DIR_DATA, baru[0]);
      bersihkan.push(p);
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      cek('hanya kunci yang cocok yang terbawa',
        Object.keys(d.kunci).every((k) => k.startsWith('ai:')) && Object.keys(d.kunci).length === 3,
        Object.keys(d.kunci));
    } else {
      cek('menulis satu berkas', false, baru);
    }
    server.close();
  }

  /* ============ E. tanpa kredensial ============ */
  console.log('\n=== E. tanpa kredensial ===');
  {
    const adaEnv = fs.existsSync(path.join(AKAR, '.env.local')) || fs.existsSync(path.join(AKAR, '.env'));
    for (const alat of ['cek-redis-hidup.js', 'ekspor-redis.js']) {
      if (adaEnv) { cek(alat + ': dilewati, .env ada di komputer ini', true); continue; }
      const r = await new Promise((selesai) => {
        execFile(process.execPath, [path.join(__dirname, alat)], {
          env: Object.assign({}, process.env, { UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' }),
          encoding: 'utf8', timeout: 20000,
        }, (e, o, g) => selesai({ keluar: String(o || '') + String(g || ''), kode: e ? e.code : 0 }));
      });
      cek(alat + ': berhenti sopan dengan status 2', r.kode === 2 && /belum ada/.test(r.keluar),
        { kode: r.kode, keluar: r.keluar.slice(0, 120) });
    }
  }

  for (const f of bersihkan) { try { fs.unlinkSync(f); } catch (e) {} }

  if (yangGagal.length) {
    console.log('\nYANG GAGAL:');
    yangGagal.forEach((n, i) => console.log('  ' + (i + 1) + '. ' + n));
  }
  console.log('\ntest_ekspor_redis.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
