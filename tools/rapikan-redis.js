/* tools/rapikan-redis.js — memangkas isi Redis yang sudah tidak dipakai.
 *
 * TUJUANNYA MENGULUR WAKTU, BUKAN MENYELESAIKAN MASALAH.
 * Selama buku besar masih disimpan sebagai satu bongkah JSON di dalam RAM,
 * ia akan terus tumbuh dan suatu hari penuh lagi. Alat ini membeli waktu
 * supaya pemindahan ke PostgreSQL bisa dikerjakan dengan tenang, bukan
 * dikebut karena aplikasi sudah berhenti menerima simpanan.
 *
 * EMPAT PEKERJAAN, semuanya konservatif:
 *   1. AuditLog dipangkas    — catatan lama dipindah ke berkas, bukan dibuang.
 *   2. Sessions kedaluwarsa  — token yang masa berlakunya sudah lewat; tidak
 *                              ada yang bisa memakainya lagi.
 *   3. Lampiran AI yatim     — gambar mentah yang tidak lagi disebut sesi mana
 *                              pun (sesinya sudah dihapus lebih dulu).
 *   4. Sesi AI yatim         — kunci sesi yang tidak ada di daftar sesi.
 *
 * TIGA PAGAR PENGAMAN, semuanya sengaja merepotkan:
 *   - BAWAANNYA HANYA MENSIMULASIKAN. Tanpa --jalankan tidak ada satu pun
 *     perintah tulis yang dikirim; yang keluar cuma laporan apa yang AKAN
 *     terjadi. Alat yang menghapus data keuangan tidak boleh punya jalan
 *     pintas yang kebetulan terpakai.
 *   - CADANGAN DITULIS LEBIH DULU. Semua yang akan dihapus atau diubah
 *     disimpan utuh ke data/cadangan-rapikan-<waktu>.json sebelum perintah
 *     hapus pertama dikirim. Kalau penulisan cadangan gagal, tidak ada yang
 *     dihapus.
 *   - PENGUNCIAN VERSI. Buku besar ditulis dengan skrip Lua yang sama seperti
 *     api/rpc.js: kalau ada petugas yang menyimpan transaksi di detik yang
 *     sama, penulisan ditolak dan alat ini berhenti — bukan menimpanya.
 *
 * jalankan:
 *   node tools/rapikan-redis.js                       (simulasi, aman)
 *   node tools/rapikan-redis.js --jalankan            (benar-benar memangkas)
 *   node tools/rapikan-redis.js --simpan-log 5000     (jumlah AuditLog disisakan)
 *   node tools/rapikan-redis.js --hanya lampiran      (satu pekerjaan saja)
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
  console.error('\nUPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum ada.\n');
  process.exit(2);
}

const arg = process.argv.slice(2);
const JALANKAN = arg.includes('--jalankan');
const SIMPAN_LOG = (() => {
  const i = arg.indexOf('--simpan-log');
  const n = i >= 0 ? parseInt(arg[i + 1], 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 3000;
})();
const HANYA = (() => {
  const i = arg.indexOf('--hanya');
  return i >= 0 ? String(arg[i + 1] || '') : '';
})();
const mau = (nama) => !HANYA || HANYA === nama;

async function satu(cmd) {
  const res = await fetch(URL_REST, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error('Redis: ' + (j && j.error ? j.error : 'HTTP ' + res.status));
  return j.result;
}

async function banyak(daftar) {
  if (!daftar.length) return [];
  const res = await fetch(URL_REST.replace(/\/+$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(daftar),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(j)) throw new Error('Redis pipeline: HTTP ' + res.status);
  return j.map((x) => (x && x.error ? null : x && x.result));
}

async function semuaKunci(pola) {
  const keluar = [];
  let kursor = '0';
  do {
    const r = await satu(['SCAN', kursor, 'MATCH', pola, 'COUNT', '1000']);
    kursor = String(r[0]);
    for (const k of r[1]) keluar.push(k);
  } while (kursor !== '0' && keluar.length < 200000);
  return keluar;
}

function rapi(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

/* Skrip yang sama dengan api/rpc.js — kalau ada yang menyimpan transaksi di
   detik yang sama, penulisan ini ditolak alih-alih menimpanya. */
const LUA_TULIS_BILA_VERSI_SAMA =
  "local cur = redis.call('GET', KEYS[2]) " +
  "if (cur == false and ARGV[1] == '0') or cur == ARGV[1] then " +
  "  redis.call('SET', KEYS[1], ARGV[2]) " +
  "  redis.call('SET', KEYS[2], ARGV[3]) " +
  "  return 1 " +
  "end " +
  "return 0";

async function main() {
  console.log('\n' + (JALANKAN
    ? '>>> MODE JALANKAN — data akan benar-benar dipangkas.'
    : '>>> MODE SIMULASI — tidak ada yang dihapus. Tambahkan --jalankan kalau sudah yakin.'));
  console.log('');

  const rencana = { auditlog: null, sessions: null, lampiran: [], sesi: [] };
  const cadangan = { waktu: new Date().toISOString(), auditlog: [], sessions: [], lampiran: {}, sesi: {} };

  /* ---------- buku besar: AuditLog & Sessions ---------- */
  let dbTeks = null, dbVer = '0', db = null;
  if (mau('auditlog') || mau('sessions')) {
    const r = await satu(['MGET', 'laz:db', 'laz:ver']);
    dbTeks = r && r[0];
    dbVer = (r && r[1]) ? String(r[1]) : '0';
    if (dbTeks) {
      try { db = JSON.parse(dbTeks); } catch (e) { throw new Error('laz:db tidak bisa dibaca — dihentikan.'); }
    }
  }

  if (db && mau('auditlog')) {
    const t = db.sheets && db.sheets.AuditLog;
    if (Array.isArray(t) && t.length - 1 > SIMPAN_LOG) {
      /* Baris terbaru ada di BAWAH (lihat engine: catatan ditambahkan dengan
         push), jadi yang disisakan ekor, bukan kepala. */
      const dibuang = t.slice(1, t.length - SIMPAN_LOG);
      cadangan.auditlog = [t[0]].concat(dibuang);
      rencana.auditlog = { sebelum: t.length - 1, sesudah: SIMPAN_LOG, dibuang: dibuang.length,
        hemat: JSON.stringify(dibuang).length };
      db.sheets.AuditLog = [t[0]].concat(t.slice(t.length - SIMPAN_LOG));
    }
  }

  if (db && mau('sessions')) {
    const t = db.sheets && db.sheets.Sessions;
    if (Array.isArray(t) && t.length > 1) {
      const kol = t[0].indexOf('expired');
      const sekarang = Date.now();
      if (kol >= 0) {
        const mati = t.slice(1).filter((b) => {
          const w = Date.parse(b[kol]);
          return Number.isFinite(w) && w < sekarang;
        });
        if (mati.length) {
          cadangan.sessions = [t[0]].concat(mati);
          rencana.sessions = { sebelum: t.length - 1, dibuang: mati.length,
            hemat: JSON.stringify(mati).length };
          const hidup = t.slice(1).filter((b) => {
            const w = Date.parse(b[kol]);
            return !(Number.isFinite(w) && w < sekarang);
          });
          db.sheets.Sessions = [t[0]].concat(hidup);
        }
      }
    }
  }

  /* ---------- lampiran & sesi AI yang yatim ---------- */
  if (mau('lampiran') || mau('sesi')) {
    const kunciSesi = await semuaKunci('ai:sesi:*');
    const kunciLampiran = await semuaKunci('ai:lampiran:*');

    const daftarSesi = await satu(['GET', 'ai:sesi:daftar']);
    let idTerdaftar = [];
    try { idTerdaftar = JSON.parse(daftarSesi) || []; } catch (e) { idTerdaftar = []; }
    const setTerdaftar = new Set(idTerdaftar.map(String));

    /* Semua id lampiran yang MASIH disebut oleh sesi mana pun. Dikumpulkan
       dari sesi yang benar-benar ada, bukan dari daftarnya: sesi yang belum
       sempat masuk daftar tetap punya hak atas lampirannya. */
    const dipakai = new Set();
    const isiSesi = {};
    for (let i = 0; i < kunciSesi.length; i += 100) {
      const potong = kunciSesi.slice(i, i + 100).filter((k) => k !== 'ai:sesi:daftar');
      const nilai = await banyak(potong.map((k) => ['GET', k]));
      potong.forEach((k, j) => {
        isiSesi[k] = nilai[j];
        let s = null;
        try { s = JSON.parse(nilai[j]); } catch (e) { return; }
        for (const p of (s && s.pesan) || []) {
          for (const l of (p && p.lampiran) || []) if (l && l.id) dipakai.add(String(l.id));
        }
      });
    }

    if (mau('lampiran')) {
      for (const k of kunciLampiran) {
        const id = k.slice('ai:lampiran:'.length);
        if (!dipakai.has(id)) rencana.lampiran.push(k);
      }
      if (rencana.lampiran.length) {
        for (let i = 0; i < rencana.lampiran.length; i += 50) {
          const potong = rencana.lampiran.slice(i, i + 50);
          const nilai = await banyak(potong.map((k) => ['GET', k]));
          potong.forEach((k, j) => { cadangan.lampiran[k] = nilai[j]; });
        }
      }
    }

    if (mau('sesi')) {
      for (const k of kunciSesi) {
        if (k === 'ai:sesi:daftar') continue;
        const id = k.slice('ai:sesi:'.length);
        if (!setTerdaftar.has(id)) { rencana.sesi.push(k); cadangan.sesi[k] = isiSesi[k]; }
      }
    }
  }

  /* ---------- laporan ---------- */
  let hemat = 0;
  console.log('---------------- RENCANA ----------------');
  if (rencana.auditlog) {
    hemat += rencana.auditlog.hemat;
    console.log('AuditLog        : ' + rencana.auditlog.sebelum + ' baris -> ' + rencana.auditlog.sesudah
      + '  (buang ' + rencana.auditlog.dibuang + ', hemat ' + rapi(rencana.auditlog.hemat) + ')');
  } else if (mau('auditlog')) {
    console.log('AuditLog        : tidak perlu dipangkas (<= ' + SIMPAN_LOG + ' baris)');
  }
  if (rencana.sessions) {
    hemat += rencana.sessions.hemat;
    console.log('Sessions        : buang ' + rencana.sessions.dibuang + ' token kedaluwarsa'
      + '  (hemat ' + rapi(rencana.sessions.hemat) + ')');
  } else if (mau('sessions')) {
    console.log('Sessions        : tidak ada token kedaluwarsa');
  }
  if (mau('lampiran')) {
    const b = Object.values(cadangan.lampiran).reduce((n, v) => n + String(v || '').length, 0);
    hemat += b;
    console.log('Lampiran yatim  : ' + rencana.lampiran.length + ' berkas  (hemat ' + rapi(b) + ')');
  }
  if (mau('sesi')) {
    const b = Object.values(cadangan.sesi).reduce((n, v) => n + String(v || '').length, 0);
    hemat += b;
    console.log('Sesi yatim      : ' + rencana.sesi.length + ' sesi  (hemat ' + rapi(b) + ')');
  }
  console.log('\nPerkiraan total dibebaskan: ' + rapi(hemat));

  const adaKerja = !!(rencana.auditlog || rencana.sessions || rencana.lampiran.length || rencana.sesi.length);
  if (!adaKerja) { console.log('\nTidak ada yang perlu dirapikan.\n'); return; }

  if (!JALANKAN) {
    console.log('\nSimulasi selesai. Tidak ada yang diubah.');
    console.log('Kalau angkanya masuk akal, ulangi dengan:  node tools/rapikan-redis.js --jalankan\n');
    return;
  }

  /* ---------- cadangan dulu, baru hapus ---------- */
  const dirData = path.join(AKAR, 'data');
  if (!fs.existsSync(dirData)) fs.mkdirSync(dirData, { recursive: true });
  const berkasCadangan = path.join(dirData,
    'cadangan-rapikan-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(berkasCadangan, JSON.stringify(cadangan, null, 2));
  /* Dibaca ulang: kalau cakramnya penuh, writeFileSync bisa lolos tanpa
     menulis seluruhnya, dan cadangan setengah jadi lebih berbahaya daripada
     tidak ada cadangan sama sekali. */
  const uji = JSON.parse(fs.readFileSync(berkasCadangan, 'utf8'));
  if (!uji || uji.waktu !== cadangan.waktu) throw new Error('Cadangan gagal ditulis — dihentikan.');
  console.log('\nCadangan ditulis: ' + berkasCadangan);

  if (db && (rencana.auditlog || rencana.sessions)) {
    const teks = JSON.stringify(db);
    const verBaru = String(Number(dbVer) + 1);
    const ok = await satu(['EVAL', LUA_TULIS_BILA_VERSI_SAMA, '2', 'laz:db', 'laz:ver', dbVer, teks, verBaru]);
    if (Number(ok) !== 1) {
      console.error('\nDIHENTIKAN: ada yang menyimpan transaksi di saat yang sama.');
      console.error('Buku besar TIDAK diubah. Coba lagi saat tidak ada yang memakai aplikasi.\n');
      process.exit(1);
    }
    console.log('Buku besar diperbarui (versi ' + dbVer + ' -> ' + verBaru + ').');
  }

  const hapus = rencana.lampiran.concat(rencana.sesi);
  for (let i = 0; i < hapus.length; i += 100) {
    await banyak(hapus.slice(i, i + 100).map((k) => ['DEL', k]));
  }
  if (hapus.length) console.log(hapus.length + ' kunci dihapus.');

  console.log('\nSelesai. Jalankan node tools/ukur-redis.js untuk melihat hasilnya.\n');
}

main().catch((e) => { console.error('\nGAGAL:', e.message, '\n'); process.exit(1); });
