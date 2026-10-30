// tools/test_pengajuan.js - uji komprehensif modul Pengajuan LAZDigital
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');

const engine = require('../api/_engine.js');
const skema = require('../lib/laz-skema.js');
const pengajuanLib = require('../lib/pengajuan/pengajuan');
const pengajuanApi = require('../lib/pengajuan/api');
const media = require('../api/media');

function muatPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (_) { /* coba berikutnya */ }
  }
  return null;
}
const pw = muatPlaywright();
const CHROMIUM = pw ? require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) : null;

let totalCek = 0;
let gagalCek = 0;

function cek(label, kondisi, ekstra) {
  totalCek++;
  if (kondisi) {
    console.log('  OK   | ' + label);
  } else {
    gagalCek++;
    console.error('  GAGAL| ' + label + (ekstra !== undefined ? ' -> ' + JSON.stringify(ekstra) : ''));
  }
}

const SANDI = 'Admin12345';
let DB = null;
pengajuanApi._uji.aturDasar(async () => DB);

async function rpcLaz(fn, args) {
  const o = await engine.runRPC(DB, fn, args, { ip: '127.0.0.1', ua: 'uji' });
  DB = o.db;
  return o.result;
}

function balasan() {
  const r = { statusCode: 200, tubuh: null, kepala: {} };
  r.setHeader = (k, v) => { r.kepala[k] = v; };
  r.end = (t) => {
    try { r.tubuh = JSON.parse(t); } catch (_) { r.tubuh = t; }
    return r;
  };
  return r;
}

async function pintu(tindakan, data, token, ip) {
  const res = balasan();
  await media({
    method: 'POST',
    headers: { 'x-forwarded-for': ip || '10.0.0.1' },
    body: { tindakan, data: data || {}, token: token || '' },
    on: () => {}
  }, res);
  return {
    kode: res.statusCode,
    ...((res.tubuh && typeof res.tubuh === 'object') ? res.tubuh : { pesan: String(res.tubuh) })
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const srv = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/rpc' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => { b += c; });
    await new Promise((r) => req.on('end', r));
    let j = {}; try { j = JSON.parse(b || '{}'); } catch (_) {}
    res.setHeader('Content-Type', 'application/json');
    try {
      const out = await engine.runRPC(DB, j.fn, j.args || [], { ip: '127.0.0.1', ua: 'uji' });
      DB = out.db;
      res.end(JSON.stringify({ result: out.result }));
    } catch (e) {
      res.end(JSON.stringify({ __error: e.message }));
    }
    return;
  }
  if (url === '/api/media') {
    await media(req, res);
    return;
  }
  if (url.startsWith('/api/')) {
    res.statusCode = 404;
    res.end('{}');
    return;
  }
  const f = path.join(PUBLIK, url === '/' ? 'index.html' : url);
  if (!f.startsWith(PUBLIK) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.statusCode = 404;
    res.end('');
    return;
  }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

(async () => {
  try {
    console.log('\n=== A. PERHITUNGAN HARI DARI TANGGAL ===');
    cek('2026-10-30 adalah hari Jumat', pengajuanLib.hariDariTanggal('2026-10-30') === 'Jumat');
    cek('2026-10-31 adalah hari Sabtu', pengajuanLib.hariDariTanggal('2026-10-31') === 'Sabtu');
    cek('2026-11-01 adalah hari Ahad', pengajuanLib.hariDariTanggal('2026-11-01') === 'Ahad');
    cek('2026-11-02 adalah hari Senin', pengajuanLib.hariDariTanggal('2026-11-02') === 'Senin');
    cek('2026-11-03 adalah hari Selasa', pengajuanLib.hariDariTanggal('2026-11-03') === 'Selasa');
    cek('2026-11-04 adalah hari Rabu', pengajuanLib.hariDariTanggal('2026-11-04') === 'Rabu');
    cek('2026-11-05 adalah hari Kamis', pengajuanLib.hariDariTanggal('2026-11-05') === 'Kamis');
    cek('tanggal kosong menghasilkan hari kosong', pengajuanLib.hariDariTanggal('') === '');

    console.log('\n=== B. CRUD DATA PENGAJUAN (SKEMA LENGKAP) ===');
    const USER_STAF = { id: 'u_staf', nama: 'Staf Program', peran: 'staff', izin: { lihat: true, tambah: true, ubah: true, hapus: false } };

    // Validasi input wajib
    let errNama = null;
    try { await pengajuanLib.buat({ tanggal: '2026-10-30', pemohon: '', alamat: 'Bantul', keperluan: 'Sembako' }, USER_STAF); } catch (e) { errNama = e; }
    cek('tanpa nama pemohon ditolak', !!errNama && /pemohon/i.test(errNama.message));

    let errAlamat = null;
    try { await pengajuanLib.buat({ tanggal: '2026-10-30', pemohon: 'Ahmad', alamat: '', keperluan: 'Sembako' }, USER_STAF); } catch (e) { errAlamat = e; }
    cek('tanpa alamat ditolak', !!errAlamat && /alamat/i.test(errAlamat.message));

    let errKeperluan = null;
    try { await pengajuanLib.buat({ tanggal: '2026-10-30', pemohon: 'Ahmad', alamat: 'Bantul', keperluan: '' }, USER_STAF); } catch (e) { errKeperluan = e; }
    cek('tanpa keperluan ditolak', !!errKeperluan && /keperluan/i.test(errKeperluan.message));

    // Buat data 1 (Kesehatan)
    const p1 = await pengajuanLib.buat({
      tanggal: '2026-10-30',
      pemohon: 'Pak Budi Santoso',
      telepon: '081234567890',
      alamat: 'Dusun Jetis RT 02, Trimulyo, Jetis',
      keperluan: 'Bantuan biaya persalinan sesar',
      hasilAsesmen: 'Layak',
      status: 'Masuk',
      jenisBantuan: 'Kesehatan',
      nominalDiajukan: 2500000,
    }, USER_STAF);

    cek('pengajuan baru berhasil dibuat dengan ID pj_*', /^pj_/.test(p1.id));
    cek('hari dihitung otomatis menjadi Jumat', p1.hari === 'Jumat');
    cek('pemohon tersimpan', p1.pemohon === 'Pak Budi Santoso');
    cek('status awal Masuk', p1.status === 'Masuk');
    cek('jenis bantuan tersimpan', p1.jenisBantuan === 'Kesehatan');

    // Ambil data
    const ambil1 = await pengajuanLib.ambil(p1.id);
    cek('data berhasil diambil kembali', ambil1 && ambil1.pemohon === 'Pak Budi Santoso');

    // Ubah status ke Disetujui & tentukan tanggal pentasyarufan
    const p1Ubah = await pengajuanLib.ubah(p1.id, {
      ...ambil1,
      status: 'Disetujui',
      hasilAsesmen: 'Sangat Layak',
      nominalDisetujui: 2000000,
      tanggalPentasyarufan: '2026-11-05'
    }, USER_STAF);

    cek('status berhasil diubah ke Disetujui', p1Ubah.status === 'Disetujui');
    cek('tanggal pentasyarufan tersimpan', p1Ubah.tanggalPentasyarufan === '2026-11-05');
    cek('nominal disetujui tersimpan', p1Ubah.nominalDisetujui === 2000000);

    // Buat data 2 (Pendidikan)
    const p2 = await pengajuanLib.buat({
      tanggal: '2026-10-31',
      pemohon: 'Ibu Siti Aminah',
      telepon: '08987654321',
      alamat: 'Dusun Karanggede, Guwosari, Pajangan',
      keperluan: 'Bantuan SPP tunggakan sekolah anak SMK',
      hasilAsesmen: 'Layak',
      status: 'Ditasyarufkan',
      tanggalPentasyarufan: '2026-10-31',
      jenisBantuan: 'Pendidikan',
      nominalDiajukan: 1500000,
      nominalDisetujui: 1500000,
    }, USER_STAF);

    cek('pengajuan kedua tersimpan dengan hari Sabtu', p2.hari === 'Sabtu');

    console.log('\n=== C. UPLOAD PROPOSAL & DUKUNGAN GOOGLE DRIVE ===');
    const dummyPdfB64 = Buffer.from('%PDF-1.4 dummy test proposal content').toString('base64');

    // Upload lokal (Drive belum siap)
    const driveOff = { driveSiapSurat: () => false };
    const pWithProp = await pengajuanLib.buat({
      tanggal: '2026-10-30',
      pemohon: 'Masjid Al-Ikhlas',
      alamat: 'Bantul Kota',
      keperluan: 'Proposal sound system masjid',
      jenisBantuan: 'Dakwah & Advokasi',
      hasilAsesmen: 'Layak',
      berkasProposal: {
        nama: 'Proposal_Masjid.pdf',
        mime: 'application/pdf',
        isi: dummyPdfB64
      }
    }, USER_STAF, driveOff);

    cek('proposal terunggah dan metadata tersimpan', !!pWithProp.proposal && pWithProp.proposal.nama === 'Proposal_Masjid.pdf');
    cek('tanpa Drive disimpan di db', pWithProp.proposal.simpan === 'db');

    const isiProp = await pengajuanLib.ambilProposal(pWithProp.id, driveOff);
    cek('isi proposal dapat diambil kembali', isiProp && isiProp.isi === dummyPdfB64);

    // Upload dengan Google Drive tiruan (Drive siap)
    let driveCall = null;
    const driveOn = {
      driveSiapSurat: () => true,
      folderSurat: () => 'folder_surat_id_123',
      unggahBiner: async (judul, buf, mime, folder) => {
        driveCall = { judul, len: buf.length, mime, folder };
        return { id: 'gdrive_file_id_999' };
      },
      unduh: async (id) => Buffer.from('konten dari drive: ' + id),
      hapus: async (id) => true
    };

    const pDrive = await pengajuanLib.buat({
      tanggal: '2026-10-30',
      pemohon: 'Yayasan Bina Umat',
      alamat: 'Sedayu',
      keperluan: 'Proposal renovasi panti asuhan',
      jenisBantuan: 'Sosial Kemanusiaan',
      hasilAsesmen: 'Sangat Layak',
      berkasProposal: {
        nama: 'Proposal_Renovasi.pdf',
        mime: 'application/pdf',
        isi: dummyPdfB64
      }
    }, USER_STAF, driveOn);

    cek('dengan Google Drive, berkas diunggah ke Drive', pDrive.proposal && pDrive.proposal.simpan === 'drive');
    cek('driveId tercatat dari respon Google Drive', pDrive.proposal && pDrive.proposal.driveId === 'gdrive_file_id_999');
    cek('folder tujuan sesuai folderSurat', driveCall && driveCall.folder === 'folder_surat_id_123');
    cek('URL pratinjau Google Drive tersimpan', pDrive.proposal && pDrive.proposal.url.includes('gdrive_file_id_999'));

    console.log('\n=== D. REKAPAN KHUSUS ADMIN ===');
    const semuaData = await pengajuanLib.semua();
    cek('semua data pengajuan dapat dimuat', semuaData.length >= 4);

    const rekap = pengajuanLib.rekapan(semuaData);
    cek('total pengajuan terhitung benar', rekap.totalPengajuan === semuaData.length);
    cek('total dana diajukan terhitung', rekap.totalDiajukan > 0);
    cek('total dana disetujui terhitung', rekap.totalDisetujui > 0);
    cek('breakdown status memuat status Masuk, Disetujui, Ditasyarufkan', rekap.perStatus.Masuk >= 1 && rekap.perStatus.Disetujui >= 1);
    cek('breakdown jenis bantuan memuat Pendidikan & Kesehatan', rekap.perJenis.Pendidikan >= 1 && rekap.perJenis.Kesehatan >= 1);
    cek('breakdown hasil asesmen memuat Layak & Sangat Layak', rekap.perAsesmen['Layak'] >= 1 && rekap.perAsesmen['Sangat Layak'] >= 1);

    console.log('\n=== E. KALENDER DETAIL ===');
    const kal = await pengajuanLib.kalender('2026-10', semuaData);
    cek('kalender periode 2026-10 terbentuk', kal && kal.tahunBulan === '2026-10');
    cek('agenda 2026-10-30 memuat pengajuan masuk', kal.agenda['2026-10-30'] && kal.agenda['2026-10-30'].masuk.length >= 2);
    cek('agenda 2026-10-31 memuat pentasyarufan', kal.agenda['2026-10-31'] && kal.agenda['2026-10-31'].salur.length >= 1);

    console.log('\n=== F. RPC HANDLER & PERMISSION BRIDGE ===');
    const s = {};
    for (const n of skema.NAMA_TABEL) s[n] = [];
    process.env.SETUP_ADMIN_PASSWORD = SANDI;
    DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;

    const SU = (await rpcLaz('login', ['superadmin', SANDI])).token;
    const buatAkun = async (username, nama, perms) => {
      await rpcLaz('apiSaveUser', [SU, { username, nama, password: 'Sandi12345!', role: 'staff', permissions: perms, aktif: 'true' }]);
      return (await rpcLaz('login', [username, 'Sandi12345!'])).token;
    };

    const T_SURAT = await buatAkun('stafsurat', 'Staf Surat', { surat: { view: true, create: true, edit: true } });
    const T_PENGAJUAN = await buatAkun('stafpengajuan', 'Staf Pengajuan', { pengajuan: { view: true, create: true, edit: true, delete: true } });
    const T_NOL = await buatAkun('stafbiasa', 'Staf Biasa', { donatur: { view: true } });

    // 1. Akun tanpa izin ditolak
    const resTolak = await pintu('pengajuan.status', {}, T_NOL);
    cek('akun tanpa izin modul ditolak 403', resTolak.kode === 403 && /akses modul Pengajuan/.test(resTolak.pesan), resTolak);

    // 2. Akun dengan izin surat dijembatani otomatis ke pengajuan
    const resJembatan = await pintu('pengajuan.status', {}, T_SURAT);
    cek('akun izin surat dijembatani dapat membuka pengajuan.status', resJembatan.ok === true && !!resJembatan.daftarStatus, resJembatan);

    // 3. Akun dengan izin pengajuan mandiri bisa membuka
    const resMandiri = await pintu('pengajuan.status', {}, T_PENGAJUAN);
    cek('akun izin pengajuan mandiri dapat membuka pengajuan.status', resMandiri.ok === true && !!resMandiri.daftarStatus, resMandiri);

    // 4. pengajuan.simpan lewat HTTP
    const resSimpan = await pintu('pengajuan.simpan', {
      tanggal: '2026-10-30',
      pemohon: 'Uji RPC Pemohon',
      alamat: 'Alamat Uji RPC',
      keperluan: 'Keperluan Uji RPC',
      jenisBantuan: 'Pendidikan'
    }, T_PENGAJUAN);
    cek('pengajuan.simpan berhasil dipanggil lewat RPC', resSimpan.ok === true && /^pj_/.test(resSimpan.pengajuan.id), resSimpan);

    // 5. pengajuan.daftar lewat HTTP
    const resDaftar = await pintu('pengajuan.daftar', {}, T_PENGAJUAN);
    cek('pengajuan.daftar berhasil dipanggil lewat RPC', resDaftar.ok === true && Array.isArray(resDaftar.daftar), resDaftar);

    // 6. pengajuan.kalender lewat HTTP
    const resKal = await pintu('pengajuan.kalender', { tahunBulan: '2026-10' }, T_PENGAJUAN);
    cek('pengajuan.kalender berhasil dipanggil lewat RPC', resKal.ok === true && !!resKal.agenda, resKal);

    // 7. pengajuan.rekapan lewat HTTP
    const resRekap = await pintu('pengajuan.rekapan', {}, T_PENGAJUAN);
    cek('pengajuan.rekapan berhasil dipanggil lewat RPC', resRekap.ok === true && !!resRekap.rekapan, resRekap);

    // 8. pengajuan.hapus lewat HTTP
    const resHapus = await pintu('pengajuan.hapus', { id: resSimpan.pengajuan.id }, T_PENGAJUAN);
    cek('pengajuan.hapus berhasil dipanggil lewat RPC', resHapus.ok === true && /berhasil dihapus/.test(resHapus.pesan), resHapus);

    if (pw) {
      console.log('\n=== G. UJI TAMPILAN PERAMBAN (PLAYWRIGHT) ===');
      await new Promise((r) => srv.listen(0, '127.0.0.1', r));
      const A = 'http://127.0.0.1:' + srv.address().port;
      const browser = await pw.chromium.launch(CHROMIUM);
      const ctx = await browser.newContext({ timezoneId: 'Asia/Jakarta', viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();

      // Login di halaman utama
      await page.goto(A + '/');
      await page.waitForSelector('#lUser', { state: 'visible', timeout: 20000 });
      await page.fill('#lUser', 'superadmin'); await page.fill('#lPass', SANDI); await page.click('#loginBtn');
      await page.waitForFunction(() => !document.getElementById('appView').classList.contains('hidden'), null, { timeout: 20000 });

      // Verifikasi menu Pengajuan terpisah di bilah navigasi kiri
      const adaMenuPengajuan = await page.waitForSelector('#nav_pengajuan', { state: 'attached', timeout: 10000 }).then(() => true).catch(() => false);
      cek('menu "Pengajuan" terpisah di bilah kiri', adaMenuPengajuan && (await page.getAttribute('#nav_pengajuan', 'title')) === 'Pengajuan');

      const adaMenuSurat = await page.waitForSelector('#nav_surat', { state: 'attached', timeout: 10000 }).then(() => true).catch(() => false);
      cek('menu "Surat" tetap ada di bilah kiri', adaMenuSurat && (await page.getAttribute('#nav_surat', 'title')) === 'Surat');

      // Buka modul Pengajuan
      await page.goto(A + '/pengajuan.html');
      await page.waitForSelector('.pj-table', { timeout: 15000 });
      cek('halaman pengajuan terbuka dan tabel pengajuan muncul', true);

      // Cek kolom tabel
      const headers = await page.evaluate(() => [...document.querySelectorAll('.pj-table th')].map((th) => th.textContent.trim()));
      const wajibHeader = ['Hari', 'Tanggal', 'Pemohon', 'Alamat', 'Keperluan', 'Hasil Asesment', 'Status', 'Tgl Pentasyarufan', 'Jenis Bantuan'];
      cek('kolom tabel memuat 9 data wajib', wajibHeader.every((w) => headers.includes(w)), headers);

      // Buka form tambah
      await page.click('#btnTambahPengajuan');
      await page.waitForSelector('#fPengajuan', { timeout: 5000 });
      cek('modal tambah pengajuan terbuka', true);

      // Ubah tanggal dan cek hari terhitung otomatis
      await page.fill('#pjInpTanggal', '2026-11-04');
      await page.dispatchEvent('#pjInpTanggal', 'change');
      const valHari = await page.inputValue('#pjInpHari');
      cek('input tanggal mengubah hari otomatis menjadi Rabu', valHari === 'Rabu', valHari);

      // Isi form dan simpan
      await page.fill('#pjInpPemohon', 'Ibu Nurhayati');
      await page.fill('#pjInpAlamat', 'Dusun Kasihan RT 04');
      await page.fill('#pjInpKeperluan', 'Bantuan biaya hidup janda dhuafa');
      await page.evaluate(() => {
        const s = document.getElementById('pjInpJenis');
        if (s) { s.value = 'Sosial Kemanusiaan'; s.dispatchEvent(new Event('change')); }
      });
      await page.click('#btnSimpanPengajuan');

      await page.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), null, { timeout: 10000 });
      await page.waitForFunction(() => document.body.innerText.includes('Ibu Nurhayati'), null, { timeout: 10000 });
      cek('data baru tersimpan dan tampil di baris tabel', true);

      // Pindah ke tab Kalender Detail
      await page.click('#nav_kalender');
      await page.waitForSelector('.pj-kal-sel', { timeout: 10000 });
      cek('tab Kalender Detail terbuka dan grid kalender muncul', true);

      // Pindah ke tab Rekapan Admin
      await page.click('#nav_rekapan');
      await page.waitForFunction(() => document.body.innerText.includes('Total Pengajuan Masuk'), null, { timeout: 10000 });
      cek('tab Rekapan Admin terbuka dan kartu KPI statistik tampil', true);

      await browser.close();
      srv.close();
    }

    console.log(`\n=== HASIL AKHIR: ${totalCek - gagalCek} lulus, ${gagalCek} gagal ===`);
    if (gagalCek > 0) process.exit(1);
  } catch (err) {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  }
})();
