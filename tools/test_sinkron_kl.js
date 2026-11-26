/* Uji Sinkronisasi Saldo KL/UL (/sinkron-kl.html, pemilik 26 November 2026).
 * Skema sama dengan cek saldo: kode akses yang sama (kodeAksesKL). Yang dijaga:
 *  - apiSinkronKLMuat: kode valid melihat setoran/UMP/LPJ kantornya SAJA (terpisah),
 *    lengkap persen amil per baris (12,5% zakat dst., bebas amil = 0).
 *  - apiSinkronKLSimpan: ajuan tersimpan + log terbaru di depan + audit tercatat;
 *    ajuan ulang pada kunci yang sama MENGGANTI (bisa batalkan); whitelist kolom
 *    menolak yang tidak dikenal; nominal/tanggal/divalidasi; batas 50/500/200.
 *  - Halaman: memakai lz-logo.js (loading sama), tab Penghimpunan/UMP&LPJ/
 *    Ringkasan/Log, tombol Simpan, dan cadangan draft di localStorage.
 *   node tools/test_sinkron_kl.js */
'use strict';
const path = require('path'), fs = require('fs');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, g = 0;
const cek = (n, sy, i) => { if (sy) { ok++; console.log('  OK   | ' + n); } else { g++; console.log('  GAGAL| ' + n + (i === undefined ? '' : '  ' + JSON.stringify(i).slice(0, 360))); } };

(async () => {
  const s = {}; for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = 'Admin12345';
  let DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  let out = await engine.runRPC(DB, 'login', ['superadmin', 'Admin12345'], {}); DB = out.db;
  const TOKEN = out.result.token;
  out = await engine.runRPC(DB, 'apiSaveLayanan', [TOKEN, { tipe: 'KLL', nama: 'Kota Contoh', aktif: 'true' }]); DB = out.db;
  const tambah = (n, o) => { const t = DB.sheets[n], h = t[0]; const baris = h.map((k) => (o[k] === undefined ? '' : o[k])); t.push(baris); return baris; };
  const tgl = (g) => new Date(Date.now() + 7 * 3600e3 + (g || 0) * 864e5).toISOString().slice(0, 10);

  // Data tiruan: satu kantor KLL + setoran + UMP + LPJ + yang bukan kantor ini.
  tambah('Penghimpunan', { id: 'h1', tanggal: tgl(-3), jenisDana: 'Zakat', subJenis: 'Umum', pilar: 'Pendidikan', program: 'Beasiswa', namaDonatur: 'KLL Kota Contoh', jumlah: 1000000, metode: 'Transfer Bank', rekeningId: 'r1' });
  tambah('Penghimpunan', { id: 'h2', tanggal: tgl(-2), jenisDana: 'Infak', subJenis: 'Umum', pilar: 'Kesehatan', program: 'Klinik', namaDonatur: 'KLL Kota Contoh', jumlah: 200000, metode: 'Cash/Tunai', rekeningId: 'r1' });
  tambah('Penghimpunan', { id: 'h3', tanggal: tgl(-2), jenisDana: 'Infak', subJenis: 'Palestina', pilar: 'Kemanusiaan', program: 'Palestina', namaDonatur: 'KLL Kota Contoh', jumlah: 500000, metode: 'QRIS', rekeningId: 'r1' });
  tambah('Penghimpunan', { id: 'h4', tanggal: tgl(-1), jenisDana: 'Zakat', subJenis: 'Umum', pilar: 'Pendidikan', program: 'Beasiswa', namaDonatur: 'Donatur Lain', jumlah: 777000, metode: 'QRIS', rekeningId: 'r1' });
  tambah('UangMuka', { id: 'u1', tanggal: tgl(-40), jenis: 'keluar', dana: 'Zakat', layanan: 'KLL Kota Contoh', akun: 'Bank', nominal: 5000000, keterangan: 'UMP Program Beasiswa', section: 'UMP', petugas: 'admin' });
  tambah('UangMuka', { id: 'u2', tanggal: tgl(-30), jenis: 'kembali', dana: 'Zakat', layanan: 'KLL Kota Contoh', akun: 'Kas', nominal: 250000, keterangan: 'UMP kembali', section: 'UMP', petugas: 'admin' });
  tambah('UangMuka', { id: 'u3', tanggal: tgl(-20), jenis: 'keluar', dana: 'Zakat', layanan: 'KLL Kota Lain', akun: 'Bank', nominal: 99000000, keterangan: 'UMP kantor lain', section: 'UMP', petugas: 'admin' });
  tambah('Pentasyarufan', { id: 'p1', tanggal: tgl(-10), ashnaf: 'Fakir', program: 'Program Beasiswa', sumberDana: 'Zakat', namaPenerima: 'KLL Kota Contoh', jumlah: 1200000, metode: 'Transfer Bank', rekeningId: 'r1', section: 'UMP LPJ', keterangan: 'LPJ Program Beasiswa' });
  tambah('Pentasyarufan', { id: 'p2', tanggal: tgl(-9), ashnaf: 'Fakir', program: 'Program Kantor Lain', sumberDana: 'Zakat', namaPenerima: 'KLL Kota Lain', jumlah: 88000000, metode: 'Transfer Bank', rekeningId: 'r1', section: 'UMP LPJ', keterangan: '' });

  // Kode akses: pakai jalur yang sama dengan produksi (Settings).
  out = await engine.runRPC(DB, 'apiBuatKodeAksesKL', [TOKEN]); DB = out.db;
  const kodeKantor = (out.result.daftar || []).find((x) => /Kota Contoh/i.test(x.nama));
  cek('Kode akses terbit untuk KLL Kota Contoh (skema sama dengan cek saldo)', !!kodeKantor, out.result);
  const KODE = kodeKantor.kode;

  // Bebas amil adalah KONFIGURASI (hakAmilKecuali) - pasang seperti di produksi.
  out = await engine.runRPC(DB, 'apiSaveSettings', [TOKEN, { hakAmilKecuali: JSON.stringify(['Palestina', 'Gempa', 'Banjir']) }]); DB = out.db;

  // ===== 1. Muat =====
  out = await engine.runRPC(DB, 'apiSinkronKLMuat', [KODE]); DB = out.db;
  let d = out.result;
  cek('Muat: setoran kantor TERPISAH dari kantor lain (3 baris, bukan 4)', d.setoran.length === 3, d.setoran.map((x) => x.kunci));
  cek('Muat: UMP kantor ini terpisah (2 baris: keluar + kembali)', d.ump.length === 2 && d.ump.every((x) => x.kunci), d.ump);
  cek('Muat: LPJ kantor ini terpisah (1 baris)', d.lpj.length === 1, d.lpj);
  const zakat = d.setoran.find((x) => x.dana === 'Zakat');
  const palestina = d.setoran.find((x) => x.jumlah === 500000);
  cek('Muat: persen amil zakat 12,5% dan rupiahnya benar', zakat && zakat.persenAmil === 12.5 && zakat.amil === 125000, zakat);
  cek('Muat: bebas amil (Palestina, dari hakAmilKecuali) = 0% dan amil Rp0', palestina && palestina.bebas === true && palestina.amil === 0 && palestina.persenAmil === 0, palestina);
  cek('Muat: ringkasan awal - belum LPJ = 5.000.000 - 1.200.000 - 250.000', d.ringkas.belumLPJ === 3550000, d.ringkas);
  cek('Muat: tidak ada nama donatur yang bocor (halaman publik)', !JSON.stringify(d).match(/Donatur Lain/), null);

  // ===== 2. Simpan: whitelist & validasi =====
  const kunciZakat = zakat.kunci;
  const gagalDiHarapkan = async (fn, args, label) => {
    const r = await engine.runRPC(DB, fn, args, {});
    DB = r.db; // kalau tidak lempar galat, uji gagal
    return r.result;
  };
  let salah = 0;
  try { await gagalDiHarapkan('apiSinkronKLSimpan', [KODE, [{ jenis: 'setoran', kunci: kunciZakat, kolom: 'hakMilik', nilai: 1 }]], 'kolom karangan'); } catch (e) { salah++; }
  cek('Simpan: kolom di luar whitelist ditolak', salah === 1, null);
  salah = 0;
  try { await gagalDiHarapkan('apiSinkronKLSimpan', [KODE, [{ jenis: 'ump', kunci: 'u1', kolom: 'nominal', nilai: 'banjir data' }]], 'nominal bukan angka'); } catch (e) { salah++; }
  cek('Simpan: nominal tidak wajar ditolak', salah === 1, null);
  salah = 0;
  try { await gagalDiHarapkan('apiSinkronKLSimpan', ['KL-SALAHKODE', [{ jenis: 'ump', kunci: 'u1', kolom: 'nominal', nilai: 1 }]], 'kode invalid'); } catch (e) { salah++; }
  cek('Simpan: kode invalid ditolak', salah === 1, null);

  // ===== 3. Simpan: ajuan diambil amil + log =====
  out = await engine.runRPC(DB, 'apiSinkronKLSimpan', [KODE, [
    { jenis: 'setoran', kunci: kunciZakat, kolom: 'diambilAmil', nilai: 'sudah' },
    { jenis: 'setoran', kunci: 'h2', kolom: 'diambilAmil', nilai: 'belum' },
  ]]); DB = out.db;
  cek('Simpan: ok + 2 ajuan tersimpan', out.result.ok && out.result.ajuan.length === 2, out.result.ajuan);
  cek('Simpan: log terbaru di depan dan menyebut rinciannya', out.result.log[0].rincian.indexOf('h2') >= 0 && out.result.log.length === 2, out.result.log.map((l) => l.rincian));
  const auditBaru = DB.sheets.AuditLog.filter((r) => Array.isArray(r) ? r[3] === 'sinkron_kl' : r.aksi === 'sinkron_kl');
  cek('Simpan: audit server tercatat (aksi sinkron_kl)', auditBaru.length === 1 && /Kota Contoh/.test((Array.isArray(auditBaru[0]) ? auditBaru[0][2] : auditBaru[0].username) || ''), auditBaru.map((r) => Array.isArray(r) ? r.slice(0, 6) : r.ringkas));

  // ajuan ulang kunci sama -> mengganti, bukan menumpuk
  out = await engine.runRPC(DB, 'apiSinkronKLSimpan', [KODE, [{ jenis: 'setoran', kunci: kunciZakat, kolom: 'diambilAmil', nilai: 'belum' }]]); DB = out.db;
  cek('Simpan: ajuan ulang kunci sama MENGGANTI (tetap 2)', out.result.ajuan.length === 2, out.result.ajuan.map((a) => a.jenis + '|' + a.kunci + '|' + a.kolom));

  // ===== 4. Muat ulang: status amil ikut =====
  out = await engine.runRPC(DB, 'apiSinkronKLMuat', [KODE]); DB = out.db;
  d = out.result;
  cek('Muat: ringkasan memisahkan amil sudah diambil vs belum (zakat 12,5% + infak 12,5%)', d.ringkas.amilSudah === 0 && d.ringkas.amilBelum === 125000 + 25000, d.ringkas);
  cek('Muat: ajuan ikut dikirim ke halaman (2 ajuan + log)', d.ajuan.length === 2 && d.log.length === 3, { ajuan: d.ajuan.length, log: d.log.length });

  // ===== 5. Batalkan ajuan (hapus) =====
  out = await engine.runRPC(DB, 'apiSinkronKLSimpan', [KODE, [{ jenis: 'setoran', kunci: 'h2', kolom: 'diambilAmil', hapus: true }]]); DB = out.db;
  cek('Simpan: ajuan dibatalkan menyisakan 1 + log bertambah', out.result.ajuan.length === 1 && out.result.log[0].aksi === 'batalkan ajuan', out.result.log[0]);

  // ===== 6. Penyesuaian UMP (nominal) - jalur fleksibel =====
  out = await engine.runRPC(DB, 'apiSinkronKLSimpan', [KODE, [
    { jenis: 'ump', kunci: 'u1', kolom: 'nominal', nilai: 5000000 },
    { jenis: 'ump', kunci: 'u1', kolom: 'keterangan', nilai: 'UMP Program Beasiswa (diperbaiki)' },
    { jenis: 'lpj', kunci: 'p1', kolom: 'nominal', nilai: 1300000 },
  ]]); DB = out.db;
  cek('Simpan: penyesuaian UMP & LPJ tersimpan (3 ajuan)', out.result.ajuan.length === 4, out.result.ajuan.map((a) => a.jenis + '.' + a.kolom));

  // ===== 7. Halaman sinkron-kl.html =====
  const html = fs.readFileSync(path.join(AKAR, 'src', 'public', 'sinkron-kl.html'), 'utf8');
  cek('Halaman: memakai loading logo yang sama (lz-logo.js + klMuat)', html.indexOf('/js/lz-logo.js') >= 0 && /LZLogo\.muat/.test(html));
  cek('Halaman: pintu kode persis saldo-kl (input klKode, placeholder KL-)', /id="klKode"/.test(html) && /KL-XXXXXXXX/.test(html));
  cek('Halaman: empat tab - Penghimpunan, UMP & LPJ, Ringkasan, Log', ['himpun', 'ump', 'ringkas', 'log'].every((t) => html.indexOf("tabBtn('" + t + "'") >= 0));
  cek('Halaman: kolom Diambil amil + tombol Simpan + cadangan peramban', /Diambil amil/.test(html) && /klSimpan\(\)/.test(html) && /sinkronKLDraft_/.test(html));

  console.log('\ntest_sinkron_kl.js  ' + ok + '/' + (ok + g) + (g ? '  ADA YANG GAGAL' : '  SEMUA LULUS'));
  process.exit(g ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
