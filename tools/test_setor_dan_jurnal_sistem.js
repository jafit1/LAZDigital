/* Uji: (A) setor tunai ke bank terbaca dan terlihat jelas di layar impor.
 *       (B) impor jurnal per berkas bisa memakai jurnal yang SUDAH masuk
 *           sistem (pilih bulan), tanpa berkas.
 *
 * (A) Pemilik (21 Oktober 2026): "saya impor data itu ga tercatat setor
 * tunainya, buat agar tercatat". Terbaca: seksi SETOR TUNAI jadi baris
 * transfer (Kas -> rekening), bukan penerimaan. Tapi di layar rinciannya
 * tertutup di dalam <details> dan ringkasannya hanya menyebut "transfer
 * antar akun", sehingga owner's看不到 "Setor tunai" secara eksplisit.
 *
 * (B) "berkas jurnal ada opsi jurnal yang sudah masuk sistem tinggal
 * menentukan bulan apa jadi tidak wajib memakai file" — jurnal dibangun
 * dari data yang sudah tercatat, lalu jalan yang sama (cocokkan rekap,
 * simpan) tanpa berkas.
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_setor_dan_jurnal_sistem.js
 */
'use strict';
const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const pg = require(path.join(AKAR, 'lib', 'laz-pg.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const fs = require('fs');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

function dbBaru() {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  s.Users = [
    ['id', 'username', 'passwordHash', 'salt', 'nama', 'role', 'permissions', 'aktif', 'dibuat', 'layanan'],
    ['u1', 'admin', 'x', 'garam', 'Admin Uji', 'superadmin', '{}', 'true', new Date().toISOString(), ''],
  ];
  s.Sessions = [['token', 'userId', 'expired'], ['tok', 'u1', new Date(Date.now() + 864e5).toISOString()]];
  s.Rekening = [
    ['id', 'namaBank', 'nomor', 'atasNama', 'fundGroup', 'aktif', 'dibuat'],
    ['r1', 'Bank BDW', '1240201548', 'Lazismu Contoh', 'Zakat', 'true', new Date().toISOString()],
  ];
  return { sheets: s, props: {} };
}
async function jalankan(fn, args, db) {
  db = db || dbBaru();
  const minta = new Set(pg._internal.DASAR);
  for (let p = 1; p <= 24; p++) {
    const diminta = [];
    engine._setLambat({
      lengkap: new Set(minta), jumlah: {}, diminta,
      minta(n) { if (!diminta.includes(n)) diminta.push(n); throw new pg.PerluLembar(n); },
    });
    try {
      const k = await engine.runRPC(db, fn, args, {});
      if (diminta.length) { for (const n of diminta) minta.add(n); continue; }
      return { hasil: k.result, db: k.db };
    } catch (e) {
      const perlu = pg.lembarDari(e);
      if (perlu) { for (const n of diminta) minta.add(n); minta.add(perlu); continue; }
      return { galat: e.message, db };
    } finally { engine._setLambat(null); }
  }
}

/* Baris jurnal bank: pasangan debet/kredit. */
const JURNAL = [
  ['', 'PENERIMAAN ZAKAT VIA BANK', '', '', ''],
  ['2026-10-02', 'Bank BDW - 1240201548', '3000000', '', 'Hamba Allah - Zakat Mal'],
  ['2026-10-02', 'Penerimaan Zakat Mal', '', '3000000', 'Hamba Allah - Zakat Mal'],
  ['', 'SETOR TUNAI', '', '', ''],
  ['2026-10-02', 'Bank BDW - 1240201548', '1500000', '', 'Setor Tunai Kas Zakat'],
  ['2026-10-02', 'Kas Zakat', '', '1500000', 'Setor Tunai Kas Zakat'],
].map((r) => r.join('\t')).join('\n');

(async () => {
  console.log('\n=== A. SETOR TUNAI TERBACA DAN TERSIMPAN ===');
  let r = await jalankan('apiParseImportText', ['tok', JURNAL, 'himpun', { bulan: '2026-10', jenis: 'bank' }]);
  cek('impor berjalan', !r.galat, r.galat);
  const parsed = r.hasil;
  const transfer = (parsed && parsed.transferValid) || [];
  const setor = transfer.filter((t) => t.jenis === 'setor');
  cek('setor tunai jadi baris transfer', setor.length === 1, transfer.length);
  if (setor.length) {
    cek('arah: dari kas ke rekening', setor[0].dariKas === 'Kas Zakat' && /1240201548/.test(setor[0].keAkun), setor[0]);
    cek('nominalnya benar', Number(setor[0].nominal) === 1500000, setor[0].nominal);
    cek('rekening tujuannya terdaftar (dikenal)', setor[0].akunDikenal === true, setor[0].akunDikenal);
  }
  cek('setor-tunedanya tidak masuk penghimpunan (bukan donasi)',
    (parsed.himpunValid || []).length === 1, (parsed.himpunValid || []).length);

  const bersih = transfer.map((t) => { const o = {}; Object.keys(t).forEach((k) => { if (k.charAt(0) !== '_') o[k] = t[k]; }); return o; });
  r = await jalankan('apiSaveImportedData', ['tok', bersih, 'transfer'], r.db);
  cek('transfer tersimpan', !r.galat && r.hasil.count === 1, r.galat || r.hasil);
  const tBaris = (r.db.sheets.Transfer || []).length - 1;
  cek('baris transfer ada di tabel Transfer', tBaris === 1, tBaris);

  console.log('\n=== B. JURNAL DARI SISTEM (TANPA BERKAS) ===');
  /* Simpan penerimaannya supaya sistem punya data bulan ini. */
  const himpun = (parsed.himpunValid || []);
  const himpunBersih = himpun.map((t) => { const o = {}; Object.keys(t).forEach((k) => { if (k.charAt(0) !== '_') o[k] = t[k]; }); return o; });
  r = await jalankan('apiSaveImportedData', ['tok', himpunBersih, 'himpun'], r.db);
  cek('penerimaan tersimpan (sumber jurnal sistem)', !r.galat, r.galat);

  r = await jalankan('apiJurnalSistem', ['tok', 2026, 10], r.db);
  cek('apiJurnalSistem tersedia', !r.galat, r.galat);
  if (!r.galat) {
    cek('mengembalikan teks jurnal', typeof r.hasil.tsv === 'string' && r.hasil.tsv.length > 0, r.hasil);
    cek('jurnal memuat seksi SETOR TUNAI', /SETOR TUNAI/.test(r.hasil.tsv), r.hasil.tsv.slice(0, 200));
    /* Jurnal dari sistem harus bisa dibaca importer yang sama. */
    r = await jalankan('apiParseImportText', ['tok', r.hasil.tsv, 'himpun', { bulan: '2026-10', jenis: 'bank' }]);
    cek('jurnal dari sistem bisa diimpor balik (terbaca)', !r.galat, r.galat);
    cek('jurnal dari sistem menghasilkan penerimaan', (r.hasil && r.hasil.himpunValid || []).length >= 1, r.hasil && (r.hasil.himpunValid || []).length);
  }

  console.log('\n=== C. LAYAR: SETOR TUNAI TERLIHAT, OPSI JURNAL SISTEM ADA ===');
  const app = fs.readFileSync(path.join(AKAR, 'src', 'public', 'app.js'), 'utf8');
  const gambar = (app.match(/function imporGambarJurnal\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  cek('ringkasan pergerakan kas menyebut setor, tarik, dan mutasi',
    /setor/i.test(gambar) && /tarik/i.test(gambar) && /mutasi/i.test(gambar), 'ringkasan tidak menyebut jenisnya');
  cek('rincian pergerakan kas terbuka (tidak tertutup)',
    /<details[^>]*\bopen\b[^>]*><summary>Rincian pergerakan kas/.test(gambar), 'rincian masih tertutup di dalam details');

  const sumber = (app.match(/function imporSumberJurnalHTML\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  cek('pilihan sumber jurnal ada (berkas / sistem)', /sistem/i.test(sumber) && /berkas/i.test(sumber), 'belum ada pilihan sumber');
  cek('pemilih sumber dipakai di modal Impor Jurnal per Berkas',
    /imporSumberJurnalHTML\(\)/.test(app) && /IMPORT_MODE === 'berkas' \? imporSumberJurnalHTML\(\) : ''/.test(app),
    'pemilih sumber tidak dipasang di modal');
  const opsi = (app.match(/function imporOpsiBerkasHTML\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  cek('opsi jurnal dari sistem menyediakan bulan & tahun',
    /impb_bulan/.test(opsi) && /impb_tahun/.test(opsi), 'pilihan bulan/tahun tidak ada');

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) process.exit(1);
  console.log('\ntest_setor_dan_jurnal_sistem.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('GAGAL TOTAL:', e.stack || e); process.exit(1); });
