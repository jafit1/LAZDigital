/* Uji logika fitur Broadcast WhatsApp — tanpa peramban, tanpa jaringan keluar.
   Dijalankan dengan WA_DRY_RUN=true sehingga pengiriman dipalsukan tapi seluruh
   jalur kode (antrean, jeda, kunci, statistik, webhook) tetap dilewati sungguhan.

   jalankan:  WA_DRY_RUN=true SETUP_ADMIN_PASSWORD='uji12345' node test_wa.js
*/
'use strict';
process.env.WA_DRY_RUN = 'true';
process.env.SETUP_ADMIN_PASSWORD = process.env.SETUP_ADMIN_PASSWORD || 'uji12345';
/* jeda 0 supaya antrean habis dalam hitungan milidetik; jam kirim dimatikan
   supaya hasil uji tidak bergantung pada jam berapa ia dijalankan. */
process.env.WA_JEDA_MIN_DETIK = '0';
process.env.WA_JEDA_MAX_DETIK = '0';
process.env.WA_JAM_KIRIM_AKTIF = 'false';
process.env.WA_PREFIX = 'wabuji';

const fs = require('fs'), path = require('path'), http = require('http');

/* ruang kerja bersih: store lokal _wa.js & db lokal rpc.js ada di ./data */
const DATA = path.join(process.cwd(), 'data');
try { fs.rmSync(path.join(DATA, 'wab-local.json'), { force: true }); } catch (e) {}
try { fs.rmSync('/tmp/laz-db-cache.json', { force: true }); } catch (e) {}

const engine = require('./_engine.js');
const rpc = require('./rpc.js');
const wa = require('./_wa.js');

let ok = 0, gagal = 0;
function cek(nama, syarat, info) {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 300)); }
}

/* ---- DB lembaga untuk uji: dipakai rpc._internal.muat() lewat berkas ---- */
let DB = JSON.parse(fs.readFileSync('db-kll2-uji.json', 'utf8'));
function simpanDB() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'laz-db-local.json'), JSON.stringify(DB));
  fs.writeFileSync('/tmp/laz-db-cache.json', JSON.stringify(DB));
}
async function panggil(fn, args) {
  const out = await engine.runRPC(DB, fn, args, { ip: '127.0.0.1', ua: 'uji' });
  DB = out.db; simpanDB(); return out.result;
}

/* ---- pemanggil handler gaya Vercel tanpa server ---- */
function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.tubuh = o; r.writableEnded = true; return r; };
  r.end = (s) => { try { r.tubuh = JSON.parse(s); } catch (e) { r.tubuh = s; } r.writableEnded = true; return r; };
  return r;
}
async function hitWa(body, metode) {
  const req = { method: metode || 'POST', url: '/api/wa', headers: { host: 'contoh.test', 'x-forwarded-proto': 'https' }, body: body };
  const res = balasan(); await require('./wa.js')(req, res); return res;
}
async function hitDispatch(query, body, headers) {
  const req = { method: 'POST', url: '/api/wa-dispatch' + (query || ''), headers: Object.assign({ host: 'contoh.test' }, headers || {}), body: body || {} };
  const res = balasan(); await require('./wa-dispatch.js')(req, res); return res;
}

(async () => {
  simpanDB();

  console.log('=== A. LUBANG rpc._internal (penyebab seluruh /api/wa balas 500) ===');
  cek('rpc mengekspor _internal', !!rpc._internal, Object.keys(rpc));
  cek('_internal.muat() ada dan bisa dipanggil', typeof (rpc._internal || {}).muat === 'function');
  const dimuat = await rpc._internal.muat();
  cek('_internal.muat() mengembalikan {db} berisi sheet Users', !!(dimuat && dimuat.db && dimuat.db.sheets && dimuat.db.sheets.Users));

  console.log('\n=== B. AUTENTIKASI & IZIN ===');
  const T = (await panggil('login', ['superadmin', 'uji12345'])).token;
  cek('login superadmin berhasil', !!T);

  let r = await hitWa({ aksi: 'perangkat', token: T });
  cek('perangkat: 200 untuk superadmin', r.statusCode === 200 && r.tubuh && r.tubuh.result, r.tubuh);
  cek('perangkat: membawa batas penerima', r.tubuh.result.batasPenerima === wa.BATAS_PENERIMA, r.tubuh.result.batasPenerima);

  r = await hitWa({ aksi: 'perangkat', token: 'token-ngawur' });
  cek('token ngawur ditolak 401', r.statusCode === 401, r);

  r = await hitWa({ aksi: 'perangkat' }, 'GET');
  cek('metode GET ditolak 405', r.statusCode === 405, r);

  r = await hitWa({ aksi: 'aksi-yang-tidak-ada', token: T });
  cek('aksi tak dikenal ditolak 400', r.statusCode === 400, r);

  /* staf tanpa modul broadcast */
  await panggil('apiSaveUser', [T, { username: 'stafwa', nama: 'Staf Tanpa Broadcast', role: 'staff', aktif: true, layanan: '', password: 'Staf#2026', permissions: { dashboard: { view: true } } }]);
  const TS = (await panggil('login', ['stafwa', 'Staf#2026'])).token;
  r = await hitWa({ aksi: 'perangkat', token: TS });
  cek('staf tanpa izin broadcast ditolak 403', r.statusCode === 403, r.tubuh);
  r = await hitWa({ aksi: 'kampanye-buat', token: TS, baris: [{ telepon: '628111' }], pesan: { teks: 'hai' } });
  cek('staf tanpa izin tidak bisa membuat kampanye', r.statusCode === 403, r.statusCode);
  /* diberi view saja: boleh lihat, tidak boleh kirim */
  await panggil('apiSaveUser', [T, { id: DB.sheets.Users.find((x) => x[1] === 'stafwa')[0], username: 'stafwa', nama: 'Staf Lihat', role: 'staff', aktif: true, layanan: '', permissions: { dashboard: { view: true }, broadcast: { view: true } } }]);
  const TS2 = (await panggil('login', ['stafwa', 'Staf#2026'])).token;
  r = await hitWa({ aksi: 'perangkat', token: TS2 });
  cek('izin view broadcast: boleh membaca', r.statusCode === 200, r.statusCode);
  r = await hitWa({ aksi: 'kampanye-buat', token: TS2, baris: [{ telepon: '628111' }], pesan: { teks: 'hai' } });
  cek('izin view saja: tetap tidak boleh mengirim', r.statusCode === 403, r.statusCode);
  r = await hitWa({ aksi: 'koneksi-get', token: TS2 });
  cek('izin view saja: tidak boleh membaca koneksi', r.statusCode === 403, r.statusCode);

  /* Aksi yang ditangani jalankan() tapi lupa didaftarkan di IZIN akan selalu
     dibalas "Aksi tidak dikenal" — dan di halaman galatnya ditelan catch
     kosong, jadi fiturnya mati diam-diam. Ini yang terjadi pada
     'pesan-periksa'. Dijaga supaya tidak terulang. */
  const sumberWa = fs.readFileSync('wa.js', 'utf8');
  const daftarIzin = [...sumberWa.matchAll(/'([a-z-]+)':\s*'(?:view|create|edit|delete)'/g)].map((m) => m[1]);
  const daftarCase = [...new Set([...sumberWa.matchAll(/case '([a-z-]+)'/g)].map((m) => m[1]))];
  const tanpaIzin = daftarCase.filter((c) => daftarIzin.indexOf(c) < 0);
  cek('setiap aksi yang ditangani punya entri izin', tanpaIzin.length === 0, tanpaIzin);
  r = await hitWa({ aksi: 'pesan-periksa', token: T, teks: 'Halo {nama}. Balas STOP untuk berhenti.', kolom: ['nama'] });
  cek('pesan-periksa benar-benar bisa dipanggil dari halaman', r.statusCode === 200 && r.tubuh.result && r.tubuh.result.sah === true, r.tubuh);

  console.log('\n=== C. KUNCI WEBHOOK TIDAK LAGI IKUT TERKIRIM ===');
  await hitWa({ aksi: 'setelan-simpan', token: T, webhookSecret: 'rahasia-uji-123', fonnteToken: 'tok-rahasia-9999' });
  r = await hitWa({ aksi: 'koneksi-get', token: T });
  const kon = r.tubuh.result;
  cek('koneksi-get tidak memuat kunci webhook', !('webhookSecret' in kon) && JSON.stringify(kon).indexOf('rahasia-uji-123') < 0, kon);
  cek('koneksi-get hanya menandai kunci sudah ada', kon.punyaWebhookSecret === true);
  cek('token Fonnte disamarkan', kon.tokenMask.indexOf('9999') >= 0 && kon.tokenMask.indexOf('tok-rahasia') < 0, kon.tokenMask);
  r = await hitWa({ aksi: 'setelan-get', token: T });
  cek('setelan-get juga tidak membocorkan kunci', JSON.stringify(r.tubuh.result).indexOf('rahasia-uji-123') < 0);
  r = await hitWa({ aksi: 'webhook-url', token: T });
  cek('webhook-url merakit URL lengkap di server', /^https:\/\/contoh\.test\/api\/wa-webhook\?kunci=rahasia-uji-123$/.test(r.tubuh.result.url), r.tubuh.result);

  console.log('\n=== D. BATAS PENERIMA MASUK AKAL ===');
  cek('batas bukan lagi 50.000', wa.BATAS_PENERIMA < 50000 && wa.BATAS_PENERIMA >= 1000, wa.BATAS_PENERIMA);
  const kebanyakan = Array.from({ length: wa.BATAS_PENERIMA + 1 }, (_, i) => ({ telepon: '62811' + String(i).padStart(7, '0') }));
  r = await hitWa({ aksi: 'kampanye-buat', token: T, pesan: { teks: 'Halo {nama}. Balas STOP untuk berhenti.' }, kolom: ['nama'], baris: kebanyakan });
  cek('lebih dari batas ditolak dengan pesan jelas', r.statusCode === 400 && /maksimal/i.test(r.tubuh.__error || ''), r.tubuh);
  r = await hitWa({ aksi: 'kampanye-buat', token: T, pesan: { teks: 'Halo' }, baris: [] });
  cek('daftar kosong ditolak', r.statusCode === 400, r.tubuh);

  console.log('\n=== E. KIRIM SATU KAMPANYE SAMPAI TUNTAS (dry run) ===');
  await wa.tambahOptout(['628999999999']);
  const baris = [];
  for (let i = 1; i <= 12; i++) baris.push({ telepon: '62812000000' + String(i).padStart(2, '0'), kolom: { nama: 'Donatur ' + i } });
  baris.push({ telepon: '628999999999', kolom: { nama: 'Sudah STOP' } });
  r = await hitWa({ aksi: 'kampanye-buat', token: T, nama: 'Uji Kirim', pesan: { teks: 'Assalamualaikum {nama}. Balas STOP untuk berhenti.' }, kolom: ['nama'], baris: baris });
  cek('kampanye terbuat', r.statusCode === 200 && !!r.tubuh.result.kampanye, r.tubuh);
  const kid = r.tubuh.result.kampanye.id;
  cek('nomor opt-out langsung dilewati, tidak diantre', r.tubuh.result.jumlahDilewati === 1 && r.tubuh.result.jumlahAntre === 12, r.tubuh.result);

  let putaran = 0;
  while (putaran++ < 10) {
    const d = await hitDispatch('?detik=6', { token: T });
    if ((d.tubuh.result.antrean || {}).total === 0) break;
  }
  r = await hitWa({ aksi: 'kampanye-get', token: T, id: kid });
  const st = r.tubuh.result.stat;
  cek('12 pesan terkirim, 1 dilewati', st.terkirim === 12 && st.dilewati === 1, st);
  cek('tidak ada yang gagal', st.gagal === 0, st);
  cek('kampanye ditandai selesai', r.tubuh.result.kampanye.status === 'selesai', r.tubuh.result.kampanye.status);
  r = await hitWa({ aksi: 'kampanye-recipients', token: T, id: kid, status: 'dilewati' });
  cek('alasan dilewati tercatat', /tolak kirim/i.test(r.tubuh.result.baris[0].pesanGalat || ''), r.tubuh.result.baris[0]);

  console.log('\n=== F. PLACEHOLDER TERISI PER NOMOR ===');
  r = await hitWa({ aksi: 'kampanye-recipients', token: T, id: kid, status: 'terkirim', limit: 3 });
  const contoh = r.tubuh.result.baris[0];
  cek('kolom nama tersimpan per penerima', !!(contoh.kolom && contoh.kolom.nama), contoh.kolom);
  cek('isiPlaceholder mengganti {nama}', wa.isiPlaceholder('Halo {nama}', { nama: 'Budi' }) === 'Halo Budi');
  cek('placeholder tak dikenal dibiarkan apa adanya', wa.isiPlaceholder('Halo {entah}', { nama: 'Budi' }) === 'Halo {entah}');

  console.log('\n=== G. PEMERIKSAAN PESAN ===');
  let p = wa.periksaPesan('Halo {nama}, terima kasih.', { kolomTersedia: ['nama'] });
  cek('pesan tanpa cara berhenti diberi peringatan', p.sah && (p.peringatan || []).some((x) => /stop|berhenti/i.test(x)), p);
  p = wa.periksaPesan('Halo {kolomHantu}. Balas STOP untuk berhenti.', { kolomTersedia: ['nama'] });
  cek('placeholder yang tidak ada kolomnya ditolak/ditandai', !p.sah || (p.peringatan || []).length > 0, p);
  p = wa.periksaPesan('', { kolomTersedia: [] });
  cek('pesan kosong tidak sah', !p.sah, p);

  console.log('\n=== H. NOMOR & KONTAK ===');
  const mat = wa.bacaDelimited('telepon;nama\n08123456789;Ahmad\n+62 812-3456-780;Budi\n12;Salah');
  const pet = wa.petakanKontak(mat, { kodeNegara: '62' });
  cek('header terdeteksi', pet.headerParameter.indexOf('nama') >= 0, pet.headerParameter);
  cek('08xx diubah jadi 62xx', pet.baris[0].telepon === '628123456789', pet.baris[0]);
  cek('format +62 dengan tanda pisah ikut normal', pet.baris[1].telepon === '628123456780', pet.baris[1]);
  cek('nomor terlalu pendek ditolak', pet.ditolak.length === 1, pet.ditolak);

  console.log('\n=== I. WEBHOOK: STATUS & BALASAN STOP ===');
  const kirimWebhook = async (q, badan) => {
    const req = { method: 'POST', url: '/api/wa-webhook' + q, headers: { host: 'contoh.test' }, body: badan };
    const res = balasan(); await require('./wa-webhook.js')(req, res); return res;
  };
  let w = await kirimWebhook('?kunci=salah', { device: 'x' });
  cek('kunci salah ditolak 401', w.statusCode === 401, w.tubuh);
  w = await kirimWebhook('', { device: 'x' });
  cek('tanpa kunci ditolak 401', w.statusCode === 401, w.tubuh);
  w = await kirimWebhook('?kunci=rahasia-uji-123', { sender: '628777000111', message: 'STOP' });
  cek('kunci benar diterima 200', w.statusCode === 200, w.tubuh);
  const optout = await wa.daftarOptout();
  cek('balasan STOP masuk daftar tolak kirim', optout.indexOf('628777000111') >= 0, optout.slice(0, 5));
  w = await kirimWebhook('?kunci=rahasia-uji-123', { sender: '628777000222', message: 'terima kasih' });
  cek('balasan biasa tidak ikut di-optout', (await wa.daftarOptout()).indexOf('628777000222') < 0);

  console.log('\n=== J. ANTI-SPAM ===');
  const s0 = { jamKirimAktif: true, jamMulai: '08:00', jamSelesai: '20:00', batasHarian: 0 };
  const pagi = Date.UTC(2026, 8, 12, 3, 0);   /* 10:00 WIB */
  const malam = Date.UTC(2026, 8, 12, 16, 0); /* 23:00 WIB */
  cek('jam 10 WIB boleh kirim', wa.periksaJamKirim(s0, pagi).boleh === true);
  const tolak = wa.periksaJamKirim(s0, malam);
  cek('jam 23 WIB ditunda', tolak.boleh === false && tolak.siapPadaMs > malam, tolak);
  cek('penundaan mengarah ke jam mulai berikutnya', new Date(tolak.siapPadaMs).getUTCHours() === 1, new Date(tolak.siapPadaMs).toISOString());
  cek('jam kirim mati = selalu boleh', wa.periksaJamKirim({ jamKirimAktif: false }, malam).boleh === true);
  const bh = await wa.periksaBatasHarian({ batasHarian: 0 });
  cek('batas harian 0 = bebas', bh.boleh === true);

  console.log('\n=== K. ANTREAN TERTUNDA & RANTAI DISPATCHER ===');
  cek('adaSiapDalam tersedia', typeof wa.adaSiapDalam === 'function');
  cek('antrean kosong: tidak ada yang jatuh tempo', (await wa.adaSiapDalam(60000)) === false);
  const d2 = (await hitDispatch('?detik=6', { token: T })).tubuh.result;
  cek('dispatcher melaporkan segeraJatuhTempo', 'segeraJatuhTempo' in d2, d2);
  cek('antrean habis: tidak merantai lagi', d2.rantaiBerikut === false, d2);
  cek('dispatcher memberitahu CRON_SECRET belum diisi', d2.cronSiap === false, d2);

  console.log('\n=== L. ANGGARAN WAKTU TIDAK MELEBIHI maxDuration ===');
  const vj = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const durasi = (vj.functions && vj.functions['api/wa-dispatch.js'] && vj.functions['api/wa-dispatch.js'].maxDuration) || 0;
  cek('wa-dispatch punya maxDuration sendiri', durasi >= 60, durasi);
  cek('batas anggaran lebih kecil dari maxDuration', wa.BATAS_BUDGET_DETIK < durasi, { budget: wa.BATAS_BUDGET_DETIK, durasi });
  const lama = (await hitDispatch('?detik=999', { token: T })).tubuh.result.lamaMs;
  cek('minta 999 detik tetap selesai jauh di bawah batas', lama < wa.BATAS_BUDGET_DETIK * 1000, lama);

  console.log('\n=== M. CRON TERPASANG DI vercel.json ===');
  cek('ada blok crons', Array.isArray(vj.crons) && vj.crons.length > 0, vj.crons);
  cek('cron menunjuk ke /api/wa-dispatch', (vj.crons || []).some((c) => c.path === '/api/wa-dispatch'), vj.crons);
  cek('jadwalnya cron 5 ruas yang sah', (vj.crons || []).every((c) => String(c.schedule || '').trim().split(/\s+/).length === 5), vj.crons);
  /* Penjaga: cron cadangan harian sempat terhapus tanpa sengaja saat vercel.json
     ditulis ulang dari salinan lama. Kehilangannya tidak terlihat sampai
     data perlu dipulihkan. */
  cek('cron cadangan harian /api/backup tidak ikut terhapus',
    (vj.crons || []).some((c) => c.path === '/api/backup'), vj.crons);
  cek('perintah install bawaan repo dipertahankan',
    /npm ci/.test(vj.installCommand || ''), vj.installCommand);

  console.log('\n=== N. DISPATCHER TIDAK BISA DIPANGGIL SEMBARANG ORANG ===');
  let dd = await hitDispatch('', {});
  cek('tanpa token ditolak 401', dd.statusCode === 401, dd.tubuh);
  dd = await hitDispatch('', { token: TS2 });
  cek('token tanpa izin create ditolak 401', dd.statusCode === 401, dd.tubuh);

  console.log('\n=== O. TINDAKAN KAMPANYE ===');
  r = await hitWa({ aksi: 'kampanye-buat', token: T, nama: 'Uji Batal', pesan: { teks: 'Halo. Balas STOP untuk berhenti.' }, baris: [{ telepon: '628130000001' }, { telepon: '628130000002' }], langsungJalan: false });
  const kid2 = r.tubuh.result.kampanye.id;
  cek('langsungJalan=false membuat kampanye ditahan', r.tubuh.result.kampanye.status === 'ditahan', r.tubuh.result.kampanye.status);
  await hitWa({ aksi: 'kampanye-aksi', token: T, id: kid2, tindakan: 'batalkan' });
  r = await hitWa({ aksi: 'kampanye-get', token: T, id: kid2 });
  cek('kampanye bisa dibatalkan', r.tubuh.result.kampanye.status === 'dibatalkan', r.tubuh.result.kampanye.status);

  console.log('\n=== P. DATA BROADCAST TERPISAH DARI DATA LEMBAGA ===');
  const isiDB = JSON.stringify(DB);
  cek('tidak ada kunci broadcast yang bocor ke laz:db', isiDB.indexOf('wabuji') < 0 && isiDB.indexOf('628120000001') < 0);
  /* store lokal menulis tertunda 100 ms (timer di-unref), jadi ditunggu dulu */
  await new Promise((r) => setTimeout(r, 400));
  const lokal = JSON.parse(fs.readFileSync(path.join(DATA, 'wab-local.json'), 'utf8'));
  cek('semua kunci broadcast berawalan prefix sendiri', Object.keys(lokal.s).every((k) => k.indexOf('wabuji:') === 0), Object.keys(lokal.s).slice(0, 4));

  console.log('\ntest_wa.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA GAGAL' : '  SEMUA LULUS'));
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
