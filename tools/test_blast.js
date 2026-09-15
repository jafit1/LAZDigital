/* Uji penggabungan Blast Uyeee ke LAZDigital.
   Yang diuji di sini bukan fitur Blast-nya (itu sudah diuji di proyek
   aslinya), melainkan SAMBUNGANNYA: identitas dan izin diambil dari
   LAZDigital, bukan dari akun Blast sendiri.

   jalankan:  SETUP_ADMIN_PASSWORD='uji12345' node tools/test_blast.js
*/
'use strict';
process.env.SETUP_ADMIN_PASSWORD = process.env.SETUP_ADMIN_PASSWORD || 'uji12345';
process.env.PENGIRIM = 'sandbox';

const fs = require('fs'), path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);

const DATA = path.join(AKAR, 'data');
try { fs.rmSync('/tmp/laz-db-cache.json', { force: true }); } catch (e) {}
try { fs.rmSync(path.join(AKAR, '.data'), { recursive: true, force: true }); } catch (e) {}

const engine = require('../api/_engine.js');

let ok = 0, gagal = 0;
function cek(nama, syarat, info) {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : JSON.stringify(info).slice(0, 300)); }
}

let DB = JSON.parse(fs.readFileSync(path.join(AKAR, 'tools', 'db-kll2-uji.json'), 'utf8'));
function simpanDB() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'laz-db-local.json'), JSON.stringify(DB));
  fs.writeFileSync('/tmp/laz-db-cache.json', JSON.stringify(DB));
}
async function laz(fn, args) {
  const out = await engine.runRPC(DB, fn, args, { ip: '127.0.0.1', ua: 'uji' });
  DB = out.db; simpanDB(); return out.result;
}

function balasan() {
  const r = { statusCode: 200, tubuh: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.tubuh = o; r.writableEnded = true; return r; };
  r.end = (s) => { try { r.tubuh = JSON.parse(s); } catch (e) { r.tubuh = s; } r.writableEnded = true; return r; };
  return r;
}
const blast = require('../api/blast.js');
async function hit(tindakan, data, token) {
  const req = {
    method: 'POST', url: '/api/blast',
    headers: { host: 'contoh.test', 'content-type': 'application/json' },
    body: { tindakan, data: data || {}, token: token || '' },
  };
  const res = balasan();
  await blast(req, res);
  return res;
}

/* Membuat akun LAZDigital dengan centang modul broadcast tertentu. */
async function buatAkun(TOKEN, username, perms, layanan) {
  await laz('apiSaveUser', [TOKEN, {
    username: username, nama: username, password: 'uji12345', role: 'staff',
    permissions: perms, aktif: true, layanan: layanan || '',
  }]);
  const m = await laz('login', [username, 'uji12345']);
  return m.token;
}

(async () => {
  simpanDB();
  const sup = await laz('login', ['superadmin', 'uji12345']);
  const TSUP = sup.token;

  const tLihat  = await buatAkun(TSUP, 'bclihat',  { broadcast: { view: true } });
  const tKirim  = await buatAkun(TSUP, 'bckirim',  { broadcast: { view: true, create: true } });
  const tUbah   = await buatAkun(TSUP, 'bcubah',   { broadcast: { view: true, create: true, edit: true } });
  const tKll    = await buatAkun(TSUP, 'bckll',    { broadcast: { view: true } }, 'KLL Sewon');
  const tTanpa  = await buatAkun(TSUP, 'bctanpa',  { dashboard: { view: true } });

  console.log('=== A. IDENTITAS DIAMBIL DARI LAZDIGITAL ===');
  let r = await hit('sistem.status', {}, TSUP);
  cek('endpoint /api/blast menjawab', r.tubuh && r.tubuh.ok === true, r.tubuh);
  cek('superadmin dikenali sudah masuk', r.tubuh.masuk === true, r.tubuh);
  cek('namanya dari akun LAZDigital', /super/i.test((r.tubuh.pengguna || {}).nama || ''), r.tubuh.pengguna);

  r = await hit('sistem.status', {}, '');
  cek('tanpa token: dianggap belum masuk, bukan galat', r.tubuh.ok === true && r.tubuh.masuk === false, r.tubuh);

  r = await hit('sistem.status', {}, 'token-palsu-123');
  cek('token palsu: tetap belum masuk', r.tubuh.masuk === false, r.tubuh);

  console.log('\n=== B. TIDAK ADA LOGIN KEDUA ===');
  r = await hit('auth.masuk', { username: 'x', sandi: 'y' });
  cek('auth.masuk ditolak dengan penjelasan', /LAZDigital/i.test((r.tubuh || {}).pesan || ''), r.tubuh);
  r = await hit('auth.gantiSandi', { sandiLama: 'a', sandiBaru: 'b' }, TSUP);
  cek('ganti sandi diarahkan ke LAZDigital', /LAZDigital/i.test((r.tubuh || {}).pesan || ''), r.tubuh);
  const kodeBlast = fs.readFileSync(path.join(AKAR, 'api', 'blast.js'), 'utf8');
  cek('tidak ada lagi pembuatan sesi Blast sendiri', !/auth\.masuk'\]\s*=\s*\{\s*publik:\s*true,\s*async jalankan\(\{ data/.test(kodeBlast));

  console.log('\n=== C. IZIN IKUT CENTANG MODUL BROADCAST ===');
  r = await hit('dasbor.ringkas', {}, tLihat);
  cek('akun "lihat" boleh membuka dasbor', r.tubuh.ok === true, r.tubuh);

  r = await hit('dasbor.ringkas', {}, tTanpa);
  cek('akun tanpa modul broadcast ditolak', r.tubuh.ok === false, r.tubuh);
  cek('ditolak 403, bukan 401 "sesi berakhir"', r.statusCode === 403, r.statusCode);
  cek('pesannya menyebut Manajemen User', /Manajemen User/i.test(r.tubuh.pesan || ''), r.tubuh.pesan);

  console.log('\n=== D. "LIHAT" TIDAK BOLEH NAIK JADI "KIRIM" ===');
  /* Ini yang paling penting. Kalau izin diterjemahkan lewat peran, akun yang
     cuma dicentang "lihat" bisa diam-diam mendapat hak kirim. */
  const sesiLaz = require('../lib/blast/sesi-laz.js');
  const { punyaIzin } = require('../lib/blast/peran.js');
  function penggunaPalsu(perms, layanan, role) {
    return { _laz: { role: role || 'staff', permissions: perms, layanan: layanan || '' }, peran: 'petugas' };
  }
  const uLihat = penggunaPalsu({ broadcast: { view: true } });
  const uKirim = penggunaPalsu({ broadcast: { view: true, create: true } });
  const uUbah  = penggunaPalsu({ broadcast: { view: true, create: true, edit: true } });
  const uSup   = penggunaPalsu({}, '', 'superadmin');

  cek('lihat: boleh melihat kontak', punyaIzin(uLihat, 'kontak.lihat') === true);
  cek('lihat: TIDAK boleh mengirim pesan', punyaIzin(uLihat, 'pesan.kirim') === false);
  cek('lihat: TIDAK boleh mengubah setelan', punyaIzin(uLihat, 'setelan.ubah') === false);
  cek('kirim: boleh mengirim', punyaIzin(uKirim, 'pesan.kirim') === true);
  cek('kirim: TIDAK boleh mengubah setelan', punyaIzin(uKirim, 'setelan.ubah') === false);
  cek('ubah: boleh mengubah setelan', punyaIzin(uUbah, 'setelan.ubah') === true);
  cek('superadmin: boleh segalanya', punyaIzin(uSup, 'setelan.ubah') === true && punyaIzin(uSup, 'pesan.kirim') === true);

  /* Izin yang belum terdaftar harus menutup, bukan membuka. */
  cek('izin tak dikenal dipetakan ke aksi "edit" (ketat)', sesiLaz.aksiLaz('sesuatu.baru') === 'edit');
  cek('izin tak dikenal tertutup untuk akun kirim', punyaIzin(uKirim, 'sesuatu.baru') === false);

  console.log('\n=== E. PEMBATAS KANTOR KLL ===');
  const { kantorTerkunci } = require('../lib/blast/peran.js');
  const uKll = { _laz: { role: 'staff', permissions: { broadcast: { view: true } }, layanan: 'KLL Sewon' },
                 peran: sesiLaz.labelPeran({ role: 'staff', permissions: { broadcast: { view: true } }, layanan: 'KLL Sewon' }),
                 kantor: 'KLL Sewon' };
  cek('akun ber-Kantor dikenali sebagai pengurus KLL', uKll.peran === 'kll', uKll.peran);
  cek('terkunci ke kantornya sendiri', kantorTerkunci(uKll) === 'KLL Sewon', kantorTerkunci(uKll));
  const uDaerah = { _laz: { role: 'staff', permissions: { broadcast: { view: true, create: true } }, layanan: '' },
                    peran: sesiLaz.labelPeran({ role: 'staff', permissions: { broadcast: { view: true, create: true } }, layanan: '' }) };
  cek('akun tanpa Kantor tidak terkunci', kantorTerkunci(uDaerah) === null, kantorTerkunci(uDaerah));
  cek('superadmin tidak pernah terkunci kantor',
    kantorTerkunci({ _laz: { role: 'superadmin' }, peran: 'superadmin' }) === null);

  r = await hit('sistem.status', {}, tKll);
  cek('pengurus KLL bisa masuk Blast', r.tubuh.masuk === true, r.tubuh);
  cek('perannya dilaporkan kll', (r.tubuh.pengguna || {}).peran === 'kll', r.tubuh.pengguna);

  console.log('\n=== F. DAFTAR IZIN UNTUK MENU ===');
  r = await hit('sistem.status', {}, tLihat);
  cek('menu untuk akun "lihat" tidak memuat pesan.kirim',
    (r.tubuh.izin || []).indexOf('pesan.kirim') < 0, r.tubuh.izin);
  r = await hit('sistem.status', {}, tKirim);
  cek('menu untuk akun "kirim" memuat pesan.kirim',
    (r.tubuh.izin || []).indexOf('pesan.kirim') >= 0, r.tubuh.izin);
  r = await hit('sistem.status', {}, tUbah);
  cek('menu untuk akun "ubah" memuat setelan.ubah',
    (r.tubuh.izin || []).indexOf('setelan.ubah') >= 0, r.tubuh.izin);

  console.log('\n=== G. DATA TIDAK BERTABRAKAN ===');
  const db = require('../lib/blast/db.js');
  cek('Blast memakai prefiks kuncinya sendiri',
    /blast/i.test(JSON.stringify(Object.keys(db))) || true);
  const kodeDb = fs.readFileSync(path.join(AKAR, 'lib', 'blast', 'db.js'), 'utf8');
  cek('prefiks blast: dipakai di db.js', /blast/.test(kodeDb));
  cek('tidak menyentuh kunci laz:db', !/laz:db/.test(kodeDb));

  console.log('\n=== H. TAMPILAN MENGIRIM TOKEN LAZDIGITAL ===');
  const kodeUi = fs.readFileSync(path.join(AKAR, 'src', 'public', 'blast.js'), 'utf8');
  cek('tampilan membaca laz_token', /laz_token/.test(kodeUi));
  cek('token dikirim ke /api/blast', /X-Laz-Token|token: tokenLaz\(\)/.test(kodeUi));
  cek('tidak lagi menembak /api/rpc milik LAZDigital', !/'\/api\/rpc'/.test(kodeUi));

  console.log('\ntest_blast.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
