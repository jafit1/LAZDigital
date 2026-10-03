/* Uji bentuk padat daftar Penghimpunan dan Pentasyarufan.
 *
 * KENAPA INI PERLU DIJAGA.
 *
 * apiListPenghimpunan mengirim SELURUH baris sebagai objek JSON, dan nama
 * kolomnya diulang di setiap baris. Pada 15.000 baris data tiruan ukurannya
 * 7,29 MB. Vercel membatasi badan respons fungsi sekitar 4,5 MB, jadi pada
 * suatu hari jumlah baris melewati batas itu dan daftar berhenti terbuka
 * dengan galat yang tidak menyebut sebabnya. Setelah impor jurnal Januari
 * sampai September ada 3.675 penghimpunan (sekitar 1,8 MB); batasnya terlewati
 * sekitar 9.000 baris.
 *
 * Bentuk padat mengirim nama kolom SEKALI dan tiap baris sebagai larik tanpa
 * nilai kosong di ujungnya: 7,29 MB menjadi 3,78 MB (hemat 48%), dan bentuk
 * lama masih dilayani untuk pemanggil yang tidak memintanya.
 *
 * Yang harus tetap benar, dan diuji di sini:
 *   1. Setelah dibongkar di klien, hasilnya SAMA PERSIS dengan bentuk lama
 *      (nilai, urutan baris, kolom __row). Selisih satu nilai berarti angka
 *      uang bergeser di layar.
 *   2. Ukurannya benar-benar turun, dan 15.000 baris muat di bawah 4,5 MB.
 *   3. Izin tetap diperiksa paling depan (aturan 3.10): bentuk padat bukan
 *      jalan pintas melewati pemeriksaan.
 *   4. Pintu (rpc.js) mengalihkan hanya dua fungsi itu dan hanya bila diminta;
 *      bacaan padat ikut diingat (BACA) seperti bentuk lamanya.
 *   5. Klien meminta bentuk padat, dan membongkar jawaban yang sudah berupa
 *      larik (server lama, tiruan server di uji lain) tanpa mengubahnya.
 *
 *   node tools/test_daftar_padat.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const util = require('util');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200)); }
};

/* Pembongkar yang dipakai klien DIAMBIL dari app.js, bukan disalin ke sini,
   supaya yang diuji adalah kode yang benar-benar berjalan di peramban. */
function ambilFungsi(sumber, nama) {
  const awal = sumber.indexOf('function ' + nama + '(');
  if (awal < 0) return null;
  let i = sumber.indexOf('{', awal), kedalaman = 0;
  for (; i < sumber.length; i++) {
    if (sumber[i] === '{') kedalaman++;
    else if (sumber[i] === '}') { kedalaman--; if (kedalaman === 0) { i++; break; } }
  }
  return sumber.slice(awal, i);
}
const sumberKlien = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
const kodeBongkar = ambilFungsi(sumberKlien, '_bongkarPadat');
const bongkar = kodeBongkar ? new Function(kodeBongkar + '; return _bongkarPadat;')() : null;

/* ---------------------------------------------------------------- fixture */
const AKUN = [
  { id: 'u_super', nama: 'Superadmin', peran: 'superadmin', izin: {} },
  { id: 'u_himpun', nama: 'Amil Penghimpunan', peran: 'staff', izin: { penghimpunan: { view: true } } },
  { id: 'u_tanpa', nama: 'Amil Tanpa Daftar', peran: 'staff', izin: { dashboard: { view: true } } },
];
const NAMA = ['Karangan Satu', 'Karangan Dua', 'Karangan Tiga', ''];

function dbBaru(nHimpun, nTasy) {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [['id', 'username', 'nama', 'password', 'role', 'permissions', 'aktif', 'layanan', 'dibuat']];
  s.Sessions = [['token', 'userId', 'dibuat', 'expiredAt', 'ip', 'ua']];
  const besok = new Date(Date.now() + 864e5).toISOString();
  for (const a of AKUN) {
    s.Users.push([a.id, a.id, a.nama, 'x', a.peran, JSON.stringify(a.izin), 'true', '', new Date().toISOString()]);
    s.Sessions.push(['tok_' + a.id, a.id, new Date().toISOString(), besok, '', '']);
  }
  const kHimpun = skema.kepala('Penghimpunan'), kTasy = skema.kepala('Pentasyarufan');
  s.Penghimpunan = [kHimpun];
  s.Pentasyarufan = [kTasy];
  const tgl = (i) => '2026-0' + (1 + (i % 9)) + '-' + String(1 + (i % 27)).padStart(2, '0');
  for (let i = 0; i < nHimpun; i++) {
    const b = {
      id: 'h-' + i, noKwitansi: 'KW/2026/' + String(i).padStart(6, '0'), tanggal: tgl(i), jenisDana: 'Infak',
      subJenis: 'Infak Umum', program: 'Program ' + (i % 9), namaDonatur: 'Donatur ' + (i % 3000) + ' ' + NAMA[i % 4],
      tipeDonatur: 'Perorangan', jumlah: 10000 + (i % 500) * 1000, metode: 'Transfer Bank', statusBayar: 'Lunas',
      keterangan: 'Infak Umum Donatur | Fr: -', petugas: 'Petugas Uji', dibuat: tgl(i) + 'T03:00:00.000Z',
    };
    s.Penghimpunan.push(kHimpun.map((k) => (b[k] === undefined ? '' : b[k])));
  }
  for (let i = 0; i < nTasy; i++) {
    const b = {
      id: 't-' + i, noBukti: 'BPT/202609/' + String(i).padStart(4, '0'), tanggal: tgl(i), ashnaf: i % 2 ? 'Fakir' : 'Miskin',
      program: 'Program ' + (i % 9), namaPenerima: 'Penerima ' + i, jumlah: 25000 + (i % 300) * 1000,
      bentukBantuan: 'Uang Tunai', statusSalur: 'Tersalur', petugas: 'Petugas Uji', dibuat: tgl(i) + 'T04:00:00.000Z',
    };
    s.Pentasyarufan.push(kTasy.map((k) => (b[k] === undefined ? '' : b[k])));
  }
  return { sheets: s, props: {} };
}
const jalan = async (db, fn, token) => (await engine.runRPC(db, fn, [token], {})).result;
/* Yang sampai ke klien melewati JSON, jadi yang dibandingkan juga hasil JSON. */
const lewatKabel = (x) => JSON.parse(JSON.stringify(x));

(async () => {
  console.log('\n=== A. PEMBONGKAR DI KLIEN ADA ===');
  cek('app.js punya _bongkarPadat', !!bongkar);
  cek('fungsi padat Penghimpunan terdaftar di engine', typeof engine.runRPC === 'function' && !!engine.FN_PADAT && engine.FN_PADAT.apiListPenghimpunan === 'apiListPenghimpunanPadat', engine.FN_PADAT);
  cek('fungsi padat Pentasyarufan terdaftar di engine', !!engine.FN_PADAT && engine.FN_PADAT.apiListPentasyarufan === 'apiListPentasyarufanPadat', engine.FN_PADAT);

  console.log('\n=== B. HASIL DIBONGKAR SAMA PERSIS DENGAN BENTUK LAMA ===');
  for (const [lama, padat, label] of [
    ['apiListPenghimpunan', 'apiListPenghimpunanPadat', 'Penghimpunan'],
    ['apiListPentasyarufan', 'apiListPentasyarufanPadat', 'Pentasyarufan'],
  ]) {
    let a, b, galat = '';
    try {
      a = lewatKabel(await jalan(dbBaru(400, 300), lama, 'tok_u_super'));
      b = lewatKabel(await jalan(dbBaru(400, 300), padat, 'tok_u_super'));
    } catch (e) { galat = e.message; }
    cek(label + ': bentuk padat bisa dipanggil', !galat, galat);
    cek(label + ': jawaban padat punya kolom dan baris', !!b && !Array.isArray(b) && Array.isArray(b.kolom) && Array.isArray(b.baris), b && Object.keys(b));
    const c = bongkar && b ? bongkar(b) : null;
    cek(label + ': jumlah baris sama (' + (a ? a.length : '?') + ')', !!c && !!a && c.length === a.length, c && c.length);
    cek(label + ': isi dan urutan baris sama persis', !!c && !!a && util.isDeepStrictEqual(c, a));
    cek(label + ': kolom __row ikut terbawa', !!c && c.length > 0 && c[0].__row !== undefined, c && c[0]);
  }

  console.log('\n=== C. BATAS: TABEL KOSONG DAN NILAI KOSONG DI UJUNG ===');
  {
    const kosong = lewatKabel(await jalan(dbBaru(0, 0), 'apiListPenghimpunanPadat', 'tok_u_super').catch((e) => ({ galat: e.message })));
    cek('tabel kosong tetap larik kosong, bukan objek', Array.isArray(kosong) && kosong.length === 0, kosong);
    const d = dbBaru(5, 0);
    d.sheets.Penghimpunan[1] = d.sheets.Penghimpunan[0].map(() => '');   /* baris yang SEMUA kolomnya kosong */
    const a = lewatKabel(await jalan(dbBaru(5, 0), 'apiListPenghimpunan', 'tok_u_super'));
    const p = lewatKabel(await jalan(d, 'apiListPenghimpunanPadat', 'tok_u_super').catch((e) => ({ galat: e.message })));
    cek('baris yang semua kolomnya kosong tidak merusak bentuk padat', !!bongkar && !p.galat && bongkar(p).length === 5, p.galat);
    {
      /* Nol dan teks "0" bukan nilai kosong: kalau ikut terpangkas, jumlah Rp 0
         berubah jadi teks kosong dan penjumlahan di layar ikut bergeser. */
      const d2 = dbBaru(3, 0);
      const kolJumlah = d2.sheets.Penghimpunan[0].indexOf('jumlah');
      const kolPilar = d2.sheets.Penghimpunan[0].indexOf('pilar');
      d2.sheets.Penghimpunan[1][kolJumlah] = 0;
      d2.sheets.Penghimpunan[1][kolPilar] = '0';
      const p2 = lewatKabel(await jalan(d2, 'apiListPenghimpunanPadat', 'tok_u_super').catch((e) => ({ galat: e.message })));
      const rr = !p2.galat && bongkar ? bongkar(p2).find((x) => x.id === 'h-0') : null;
      cek('jumlah 0 tetap angka 0 setelah dibongkar', !!rr && rr.jumlah === 0 && typeof rr.jumlah === 'number', rr && rr.jumlah);
      cek('teks "0" tetap "0" setelah dibongkar', !!rr && rr.pilar === '0', rr && rr.pilar);
    }
  }

  console.log('\n=== D. UKURAN: 15.000 BARIS ===');
  {
    const db1 = dbBaru(15000, 0), db2 = dbBaru(15000, 0);
    const lama = JSON.stringify(await jalan(db1, 'apiListPenghimpunan', 'tok_u_super'));
    let padat = '';
    try { padat = JSON.stringify(await jalan(db2, 'apiListPenghimpunanPadat', 'tok_u_super')); } catch (e) { padat = ''; }
    cek('bentuk lama melewati batas Vercel 4,5 MB (bukti masalahnya nyata): ' + (lama.length / 1e6).toFixed(2) + ' MB', lama.length > 4.5e6);
    cek('bentuk padat di bawah 4,5 MB: ' + (padat.length / 1e6).toFixed(2) + ' MB', padat.length > 0 && padat.length < 4.5e6);
    cek('bentuk padat paling sedikit 35% lebih kecil', padat.length > 0 && padat.length < lama.length * 0.65, [lama.length, padat.length]);
  }

  console.log('\n=== E. IZIN DIPERIKSA PALING DEPAN ===');
  for (const [fn, boleh, label] of [
    ['apiListPenghimpunanPadat', 'tok_u_himpun', 'Penghimpunan'],
    ['apiListPentasyarufanPadat', 'tok_u_super', 'Pentasyarufan'],
  ]) {
    let r1 = '', r2 = '', r3 = '';
    try { await jalan(dbBaru(3, 3), fn, 'tok_u_tanpa'); r1 = 'lolos'; } catch (e) { r1 = e.message; }
    try { await jalan(dbBaru(3, 3), fn, 'tok_palsu'); r2 = 'lolos'; } catch (e) { r2 = e.message; }
    try { await jalan(dbBaru(3, 3), fn, boleh); r3 = 'lolos'; } catch (e) { r3 = e.message; }
    cek(label + ': akun tanpa izin lihat ditolak (IZIN)', /^IZIN:/.test(r1), r1);
    cek(label + ': token palsu ditolak (AUTH)', /AUTH:/.test(r2), r2);
    cek(label + ': akun berizin dilayani', r3 === 'lolos', r3);
  }
  {
    let galat = '';
    try { await jalan(dbBaru(3, 3), 'apiListPentasyarufanPadat', 'tok_u_himpun'); } catch (e) { galat = e.message; }
    cek('izin Penghimpunan tidak membuka daftar Pentasyarufan', /^IZIN:/.test(galat), galat);
  }

  console.log('\n=== F. PINTU: HANYA DUA FUNGSI, HANYA BILA DIMINTA, DAN DIINGAT ===');
  const rpc = fs.readFileSync(path.join(AKAR, 'api', 'rpc.js'), 'utf8');
  const pg = fs.readFileSync(path.join(AKAR, 'lib', 'laz-pg.js'), 'utf8');
  cek('rpc.js membaca penanda padat dari permintaan', /body\.padat/.test(rpc));
  cek('rpc.js mengalihkan lewat peta engine.FN_PADAT, bukan daftar sendiri', /engine\.FN_PADAT/.test(rpc));
  cek('laz-pg.js mengingat bacaan padat Penghimpunan (BACA)', /apiListPenghimpunanPadat:\s*\['penghimpunan',\s*'view'\]/.test(pg));
  cek('laz-pg.js mengingat bacaan padat Pentasyarufan (BACA)', /apiListPentasyarufanPadat:\s*\['pentasyarufan',\s*'view'\]/.test(pg));
  cek('catatan "siapa membuka apa" mengenali dua fungsi baru', (() => {
    const src = fs.readFileSync(path.join(AKAR, 'api', '_engine.js'), 'utf8');
    return /apiListPenghimpunanPadat:'penghimpunan'/.test(src) && /apiListPentasyarufanPadat:'pentasyarufan'/.test(src);
  })());
  cek('FN_PADAT hanya memuat dua fungsi', !!engine.FN_PADAT && Object.keys(engine.FN_PADAT).length === 2, engine.FN_PADAT);
  cek('tidak ada berkas baru di api/ (batas 12 fungsi Vercel)', (() => {
    const hitung = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? hitung(path.join(d, e.name)) : (e.name.endsWith('.js') && e.name[0] !== '_' ? 1 : 0)), 0);
    return hitung(path.join(AKAR, 'api')) <= 12;
  })());

  console.log('\n=== G. KLIEN ===');
  cek('klien meminta bentuk padat untuk Penghimpunan dan Pentasyarufan', /_FN_PADAT\s*=\s*\{[^}]*apiListPenghimpunan[^}]*apiListPentasyarufan[^}]*\}/.test(sumberKlien) || /_FN_PADAT\s*=\s*\{[^}]*apiListPentasyarufan[^}]*apiListPenghimpunan[^}]*\}/.test(sumberKlien));
  cek('klien menyertakan padat:1 di badan permintaan', /padat\s*:\s*1/.test(sumberKlien));
  cek('hasil panggilan melewati pembongkar sebelum dipakai', /_bongkarPadat\(\s*j\.result\s*\)/.test(sumberKlien));
  if (bongkar) {
    const larik = [{ a: 1 }, { a: 2 }];
    cek('jawaban yang sudah berupa larik dikembalikan apa adanya', bongkar(larik) === larik);
    cek('null dan angka dikembalikan apa adanya (fungsi lain tidak terganggu)', bongkar(null) === null && bongkar(7) === 7 && bongkar(undefined) === undefined);
    cek('objek hasil biasa (tanpa kolom/baris) tidak disentuh', (() => { const o = { ok: true, token: 'x' }; return bongkar(o) === o; })());
    const h = bongkar({ kolom: ['a', 'b', 'c'], baris: [[1, 'x', 'y'], [2], []] });
    cek('nilai yang dipangkas di ujung dipulihkan jadi teks kosong', util.isDeepStrictEqual(h, [{ a: 1, b: 'x', c: 'y' }, { a: 2, b: '', c: '' }, { a: '', b: '', c: '' }]), h);
  }

  console.log('\n' + 'test_daftar_padat.js  ' + ok + '/' + (ok + gagal) + (gagal ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.log('GAGAL TOTAL:', e && e.stack || e); process.exit(1); });
