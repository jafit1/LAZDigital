/* Uji modul Surat & Pengajuan: dari dicatat sampai selesai, lewat pintu
 * /api/media yang sama dengan produksi, dengan izin dari engine yang sama.
 *
 * YANG DIJAGA, DAN KENAPA MUDAH SALAH TANPA TERLIHAT:
 *
 * 1. LANGKAH TIDAK BISA DILOMPATI. Papan kanban bisa menjatuhkan kartu di
 *    kolom mana saja; kalau aturannya cuma di layar, pengajuan bisa "dicairkan"
 *    tanpa pernah disetujui, dan laporan dana keluar ikut keliru.
 * 2. DATA WAJIB TIAP LANGKAH: nominal disetujui, nominal cair tidak melebihi
 *    yang disetujui, alasan penolakan, alasan mundur.
 * 3. LAMPIRAN: batas 2 MB (Vercel menolak kiriman di atas 4,5 MB), jenis
 *    dibaca dari isi berkas, enam lampiran per surat, dan kuota ruang supaya
 *    Supabase 500 MB tidak habis oleh PDF.
 * 4. DISPOSISI: penerima dengan izin "lihat" saja tetap bisa menandai
 *    selesai, tetapi hanya disposisi miliknya.
 * 5. LACAK PUBLIK tidak membocorkan catatan internal, asesmen, atau nama
 *    petugas, dan tidak bisa ditebak ribuan kali.
 *
 *   node tools/test_surat_fitur.js
 */
'use strict';
require('./_pagar-db.js')('Uji modul Surat');
process.env.SURAT_KUOTA_MB = '2.5';

const path = require('path');
const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));
const media = require(path.join(AKAR, 'api', 'media.js'));
const suratApi = require(path.join(AKAR, 'lib', 'surat', 'api.js'));
const S = require(path.join(AKAR, 'lib', 'surat', 'surat.js'));
const db = require(path.join(AKAR, 'lib', 'surat', 'db.js'));

let ok = 0, g = 0;
const cek = (n, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

const SANDI = 'Admin12345';
let DB = null;
suratApi._uji.aturDasar(async () => DB);

async function rpcLaz(fn, args) { const o = await engine.runRPC(DB, fn, args, { ip: '127.0.0.1', ua: 'uji' }); DB = o.db; return o.result; }
function balasan() {
  const r = { statusCode: 200, tubuh: null, kepala: {} };
  r.setHeader = (k, v) => { r.kepala[k] = v; };
  r.end = (t) => { try { r.tubuh = JSON.parse(t); } catch (_) { r.tubuh = t; } return r; };
  return r;
}
async function pintu(tindakan, data, token, ip) {
  const res = balasan();
  await media({ method: 'POST', headers: { 'x-forwarded-for': ip || '10.0.0.1' }, body: { tindakan, data: data || {}, token: token || '' }, on: () => {} }, res);
  return { kode: res.statusCode, ...((res.tubuh && typeof res.tubuh === 'object') ? res.tubuh : { pesan: String(res.tubuh) }) };
}

/* Berkas buatan: PDF dan JPEG kecil yang kepalanya sah. */
const pdf = (n) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(Math.max(0, n - 9), 0x20)]);
const jpg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, n - 4), 1)]);

(async () => {
  const s = {};
  for (const n of skema.NAMA_TABEL) s[n] = [];
  process.env.SETUP_ADMIN_PASSWORD = SANDI;
  DB = (await engine.runRPC({ sheets: s, props: {} }, 'setup', [], {})).db;
  const SU = (await rpcLaz('login', ['superadmin', SANDI])).token;
  const buatAkun = async (username, nama, surat) => {
    await rpcLaz('apiSaveUser', [SU, { username, nama, password: 'Sandi12345!', role: 'staff', permissions: surat ? { surat } : {}, aktif: 'true' }]);
    return (await rpcLaz('login', [username, 'Sandi12345!'])).token;
  };
  const T_STAF = await buatAkun('staf', 'Rina Sekretariat', { view: true, create: true });
  const T_KABID = await buatAkun('kabid', 'Budi Program', { view: true, create: true, edit: true });
  const T_LIHAT = await buatAkun('lihat', 'Sari Penerima', { view: true });
  const T_LAIN = await buatAkun('lain', 'Dodi Lain', { view: true });
  const T_TANPA = await buatAkun('tanpa', 'Tanpa Akses', null);

  console.log('\n=== A. IZIN ===');
  cek('modul "surat" terdaftar di daftar izin', /'surat'\]/.test(require('fs').readFileSync(path.join(AKAR, 'api', '_engine.js'), 'utf8')));
  let r = await pintu('surat.status', {}, '');
  cek('tanpa token ditolak 401', r.kode === 401, r);
  r = await pintu('surat.status', {}, T_TANPA);
  cek('akun tanpa centang Surat ditolak 403 dengan pesan jelas', r.kode === 403 && /Manajemen User/.test(r.pesan), r);
  r = await pintu('surat.status', {}, T_LIHAT);
  cek('pemegang "lihat" bisa membuka modul', r.ok && r.izin.lihat && !r.izin.tambah, r);
  cek('status memberi batas lampiran 2 MB dan 6 berkas', r.batas && r.batas.maksBerkas === 2097152 && r.batas.maksLampiran === 6, r.batas);
  r = await pintu('surat.simpan', { jenis: 'masuk', perihal: 'Undangan', pengirim: 'PCM Contoh' }, T_LIHAT);
  cek('pemegang "lihat" tidak bisa mencatat surat', r.kode === 403, r);
  r = await pintu('surat.simpan', { jenis: 'masuk', perihal: '', pengirim: 'PCM Contoh' }, T_STAF);
  cek('perihal wajib', r.kode === 400 && /Perihal/.test(r.pesan), r);

  console.log('\n=== B. NOMOR AGENDA DAN SURAT MASUK ===');
  const tahun = S.hariIni().slice(0, 4);
  r = await pintu('surat.simpan', { jenis: 'masuk', perihal: 'Undangan rapat kerja', pengirim: 'PCM Contoh', nomorSurat: '12/PCM/IX/2026', tanggalTerima: tahun + '-10-02', sifat: 'segera' }, T_STAF);
  cek('surat masuk tercatat dengan nomor 001/SM/X/' + tahun, r.ok && r.surat.nomor === '001/SM/X/' + tahun, r.surat && r.surat.nomor);
  const sm = r.surat;
  r = await pintu('surat.simpan', { jenis: 'masuk', perihal: 'Pemberitahuan', pengirim: 'Dinas Contoh', tanggalTerima: tahun + '-10-03' }, T_STAF);
  cek('nomor berikutnya 002', r.surat && r.surat.nomor === '002/SM/X/' + tahun, r.surat && r.surat.nomor);
  const sm2 = r.surat;
  cek('surat masuk mulai di langkah Diterima', sm.status === 'diterima' && sm.riwayat.length === 1);
  cek('surat masuk juga punya kode lacak 6 huruf untuk tautan publik', /^[A-Z2-9]{6}$/.test(sm.kodeLacak || ''), sm.kodeLacak);

  console.log('\n=== C. DISPOSISI ===');
  r = await pintu('surat.akun', {}, T_KABID);
  const akun = r.akun || [];
  cek('daftar penerima disposisi hanya akun yang boleh membuka modul Surat', akun.some((a) => a.nama === 'Sari Penerima') && !akun.some((a) => a.nama === 'Tanpa Akses'), akun.map((a) => a.nama));
  const idSari = (akun.find((a) => a.nama === 'Sari Penerima') || {}).id;
  r = await pintu('surat.disposisi', { id: sm.id, kepada: [idSari], instruksi: ['Tindak lanjuti'], catatan: 'Mohon dihadiri', batas: tahun + '-10-01' }, T_STAF);
  cek('staf tanpa izin ubah tidak bisa mendisposisi', r.kode === 403, r);
  r = await pintu('surat.disposisi', { id: sm.id, kepada: ['tidak-ada'], instruksi: ['Hadiri'] }, T_KABID);
  cek('penerima yang tidak dikenal ditolak', r.kode === 400, r);
  r = await pintu('surat.disposisi', { id: sm.id, kepada: [idSari], instruksi: ['Hadiri', 'Instruksi Karangan'], catatan: 'Mohon dihadiri', batas: tahun + '-10-01' }, T_KABID);
  cek('disposisi tersimpan, instruksi di luar daftar dibuang', r.ok && r.surat.disposisi.length === 1 && r.surat.disposisi[0].instruksi.join() === 'Hadiri', r.surat && r.surat.disposisi);
  cek('disposisi pertama memindah surat masuk ke Didisposisi', r.surat.status === 'disposisi', r.surat.status);
  const did = r.surat.disposisi[0].id;
  r = await pintu('surat.daftar', {}, T_LIHAT);
  const baris = (r.baris || []).find((x) => x.id === sm.id) || {};
  cek('penerima melihat disposisi untuknya di daftar', baris.disposisiSaya === 1 && r.ringkas.disposisiSaya === 1, baris);
  cek('batas disposisi yang lewat ditandai telat', baris.telat === true, baris);
  r = await pintu('surat.disposisi.selesai', { id: sm.id, did, balasan: 'Sudah' }, T_LAIN);
  cek('orang lain tidak bisa menyelesaikan disposisi yang bukan untuknya', r.kode === 403, r);
  r = await pintu('surat.detail', { id: sm.id }, T_LIHAT);
  cek('membuka surat mencatat disposisi sudah dibaca', r.ok && Object.keys(r.surat.disposisi[0].dibaca || {}).length === 1, r.surat && r.surat.disposisi);
  r = await pintu('surat.disposisi.selesai', { id: sm.id, did, balasan: 'Sudah dihadiri' }, T_LIHAT);
  cek('penerima (izin lihat) bisa menandai selesai dengan jawaban', r.ok && r.surat.disposisi[0].status === 'selesai' && r.surat.disposisi[0].balasan === 'Sudah dihadiri', r);

  console.log('\n=== D. ALUR PENGAJUAN ===');
  r = await pintu('surat.simpan', { jenis: 'bantuan', perihal: 'Bantuan biaya sekolah', pengirim: 'Pemohon Contoh', nominalDiajukan: '2.500.000', kategori: 'Pendidikan' }, T_STAF);
  cek('pengajuan bantuan tercatat dengan nomor PB dan kode lacak 6 huruf', r.ok && /^001\/PB\//.test(r.surat.nomor) && /^[A-Z2-9]{6}$/.test(r.surat.kodeLacak || ''), r.surat);
  const pb = r.surat;
  cek('nominal "2.500.000" terbaca 2500000', pb.nominalDiajukan === 2500000, pb.nominalDiajukan);
  r = await pintu('surat.detail', { id: pb.id }, T_LIHAT);
  cek('kode lacak tidak dikirim ke selain pencatat dan pemegang izin "ubah"', r.ok && !r.surat.kodeLacak, r.surat && r.surat.kodeLacak);
  const pindah = (ke, ext, t) => pintu('surat.pindah', Object.assign({ id: pb.id, ke }, ext || {}), t || T_KABID);
  r = await pindah('asesmen');
  cek('tidak bisa melompat dari Diterima ke Asesmen', r.kode === 400 && /hanya bisa lanjut ke Diproses/.test(r.pesan), r);
  r = await pindah('diproses', {}, T_STAF);
  cek('memindah langkah butuh izin ubah', r.kode === 403, r);
  r = await pindah('diproses');
  cek('Diterima ke Diproses', r.ok && r.surat.status === 'diproses', r);
  r = await pindah('asesmen');
  cek('Diproses ke Asesmen', r.ok && r.surat.status === 'asesmen', r);
  r = await pintu('surat.asesmen', { id: pb.id, hasil: '' }, T_KABID);
  cek('hasil asesmen wajib dipilih', r.kode === 400, r);
  r = await pintu('surat.asesmen', { id: pb.id, hasil: 'layak', rekomendasi: '2000000', petugas: 'Petugas Survei', catatan: 'Rumah sederhana, anak dua' }, T_KABID);
  cek('hasil asesmen tersimpan', r.ok && r.surat.asesmen.hasil === 'layak' && r.surat.asesmen.rekomendasi === 2000000, r.surat && r.surat.asesmen);
  r = await pindah('disetujui');
  cek('disetujui tanpa nominal ditolak (bantuan)', r.kode === 400 && /nominal/.test(r.pesan), r);
  r = await pindah('disetujui', { nominalDisetujui: 2000000 });
  cek('Asesmen ke Disetujui dengan nominal', r.ok && r.surat.status === 'disetujui' && r.surat.nominalDisetujui === 2000000, r);
  r = await pindah('ditolak', { catatan: 'berubah pikiran' });
  cek('sesudah disetujui tidak bisa ditolak lagi', r.kode === 400, r);
  r = await pindah('dicairkan', { nominalCair: 2500000 });
  cek('nominal cair melebihi yang disetujui ditolak', r.kode === 400 && /melebihi/.test(r.pesan), r);
  r = await pindah('asesmen');
  cek('mundur satu langkah tanpa alasan ditolak', r.kode === 400 && /alasan/.test(r.pesan), r);
  r = await pindah('dicairkan', { nominalCair: 2000000, tanggalCair: tahun + '-10-05' });
  cek('Disetujui ke Dicairkan', r.ok && r.surat.status === 'dicairkan' && r.surat.nominalCair === 2000000 && r.surat.tanggalCair === tahun + '-10-05', r);
  cek('riwayat mencatat setiap langkah', r.surat.riwayat.map((h) => h.status).join('>') === 'diterima>diproses>asesmen>disetujui>dicairkan', r.surat.riwayat.map((h) => h.status));
  r = await pintu('surat.simpan', { jenis: 'sponsorship', perihal: 'Sponsor jalan sehat', pengirim: 'Panitia Contoh', nominalDiajukan: 5000000 }, T_STAF);
  const sp = r.surat;
  await pintu('surat.pindah', { id: sp.id, ke: 'diproses' }, T_KABID);
  r = await pintu('surat.pindah', { id: sp.id, ke: 'ditolak' }, T_KABID);
  cek('penolakan wajib beralasan', r.kode === 400 && /alasan/.test(r.pesan), r);
  r = await pintu('surat.pindah', { id: sp.id, ke: 'ditolak', catatan: 'Di luar program tahun ini' }, T_KABID);
  cek('pengajuan ditolak dengan alasan', r.ok && r.surat.status === 'ditolak' && r.surat.alasanTolak === 'Di luar program tahun ini', r);
  r = await pintu('surat.pindah', { id: sp.id, ke: 'asesmen', catatan: 'x' }, T_KABID);
  cek('yang ditolak hanya bisa dibuka kembali ke Diproses', r.kode === 400, r);
  r = await pintu('surat.daftar', {}, T_KABID);
  cek('ringkasan: pengajuan aktif 1, disetujui tahun ini Rp 2.000.000, dicairkan Rp 2.000.000, ditolak 1',
    r.ringkas.pengajuanAktif === 1 && r.ringkas.disetujuiTahun === 2000000 && r.ringkas.dicairkanTahun === 2000000 && r.ringkas.ditolakTahun === 1, r.ringkas);

  console.log('\n=== E. LAMPIRAN ===');
  const unggah = (id, buf, mime, nama, t) => pintu('surat.lampiran.tambah', { id, nama: nama || 'berkas', mime, isi: buf.toString('base64'), ukuranAsli: buf.length }, t || T_KABID);
  r = await unggah(sm.id, pdf(40000), 'application/pdf', 'undangan.pdf');
  cek('PDF 40 KB tersimpan di basis data', r.ok && r.surat.lampiran[0].simpan === 'db' && r.surat.lampiran[0].ukuran === 40000, r.surat && r.surat.lampiran);
  const lid = r.surat.lampiran[0].id;
  r = await pintu('surat.lampiran.ambil', { id: sm.id, lid }, T_LIHAT);
  cek('isi lampiran kembali utuh', r.ok && Buffer.from(r.isi, 'base64').equals(pdf(40000)), r.pesan);
  r = await unggah(sm.id, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]), 'application/pdf', 'virus.pdf');
  cek('berkas yang isinya bukan PDF ditolak walau dilabeli PDF', r.kode === 400 && /tidak sesuai/.test(r.pesan), r);
  r = await unggah(sm.id, pdf(100), 'application/x-msdownload', 'a.exe');
  cek('jenis berkas di luar daftar ditolak', r.kode === 400, r);
  r = await unggah(sm.id, pdf(2 * 1024 * 1024 + 10), 'application/pdf', 'besar.pdf');
  cek('berkas di atas 2 MB ditolak dan ditawari kompres atau tautan', r.kode === 413 && /2 MB/.test(r.pesan) && /tautan/i.test(r.pesan), r);
  r = await pintu('surat.lampiran.tambah', { id: sm.id, nama: 'scan besar', tautan: 'http://drive.google.com/x' }, T_KABID);
  cek('tautan tanpa https ditolak', r.kode === 400, r);
  r = await pintu('surat.lampiran.tambah', { id: sm.id, nama: 'scan besar', tautan: 'https://drive.google.com/file/d/abc/view' }, T_KABID);
  cek('tautan Google Drive tersimpan tanpa memakan ruang', r.ok && r.surat.lampiran[1].simpan === 'tautan' && r.surat.lampiran[1].ukuran === 0, r.surat && r.surat.lampiran);
  r = await unggah(sm.id, jpg(1500000), 'image/jpeg', 'foto1.jpg');
  cek('JPEG 1,5 MB tersimpan', r.ok, r.pesan);
  r = await unggah(sm.id, jpg(1500000), 'image/jpeg', 'foto2.jpg');
  cek('kuota ruang (uji: 2,5 MB) ditegakkan dengan pesan "Ruang lampiran penuh"', r.kode === 507 && /Ruang lampiran penuh/.test(r.pesan), r);
  r = await pintu('surat.ruang', {}, T_LIHAT);
  cek('pemakaian ruang dihitung dari lampiran di basis data saja', r.ok && r.pakai === 40000 + 1500000, r);
  for (let i = 0; i < 3; i++) await pintu('surat.lampiran.tambah', { id: sm.id, nama: 't' + i, tautan: 'https://drive.google.com/t' + i }, T_KABID);
  r = await pintu('surat.lampiran.tambah', { id: sm.id, nama: 't7', tautan: 'https://drive.google.com/t7' }, T_KABID);
  cek('lampiran ketujuh ditolak', r.kode === 400 && /6 lampiran/.test(r.pesan), r);
  /* Google Drive: kalau disetel, berkas tidak masuk basis data. */
  const driveTiruan = { driveSiap: () => true, driveSiapSurat: () => true, folderSurat: () => '', unggahBiner: async (n, b) => ({ id: 'drv-' + b.length }), unduh: async () => pdf(300), hapus: async () => {} };
  const rec = await S.buat({ jenis: 'keluar', perihal: 'Balasan undangan', tujuan: 'PCM Contoh', balasanDari: sm.id }, { id: 'x', nama: 'Uji' });
  const rd = await S.tambahLampiran(rec.id, { nama: 'surat.pdf', mime: 'application/pdf', isi: pdf(300).toString('base64') }, { nama: 'Uji' }, driveTiruan);
  cek('kalau Google Drive disetel, lampiran disimpan di Drive, bukan basis data', rd.lampiran[0].simpan === 'drive' && rd.lampiran[0].driveId === 'drv-300' && !(await db.ambil('berkas:' + rd.lampiran[0].id)), rd.lampiran[0]);
  cek('surat keluar mulai di Draf dan tersambung ke surat masuknya', rec.status === 'draf' && rec.balasanDari === sm.id);
  r = await pintu('surat.detail', { id: sm.id }, T_KABID);
  cek('surat masuk menampilkan balasannya', r.ok && r.surat.balasan.length === 1 && r.surat.balasan[0].id === rec.id, r.surat && r.surat.balasan);

  console.log('\n=== E2. LAMPIRAN: driveSiapSurat dan folder surat (Property 5 dan 6) ===');
  /* Berkas PDF kecil, supaya kuota ruang lampiran (2,5 MB untuk uji ini) tidak
     terpengaruh oleh ratusan iterasi acak di bawah ini. */
  const kecil = () => pdf(20);

  /* Property 5: drive tiruan dengan driveSiapSurat() selalu benar, Folder_Surat
     diacak terisi/kosong. Folder yang diteruskan ke unggahBiner harus sama
     dengan Folder_Surat kalau terisi, atau Folder_Cadangan kalau Folder_Surat
     kosong. */
  {
    const ITERASI = 120;
    let semuaBenar = true, contohGagal = null;
    for (let i = 0; i < ITERASI; i++) {
      const folderSuratNilai = Math.random() < 0.5 ? '' : ('folder-surat-' + Math.random().toString(36).slice(2, 10));
      const folderCadanganNilai = 'folder-cadangan-' + Math.random().toString(36).slice(2, 10);
      let folderTertangkap;
      const driveP5 = {
        driveSiap: () => true,
        driveSiapSurat: () => true,
        folderSurat: () => folderSuratNilai || folderCadanganNilai,
        unggahBiner: async (nama, buf, mime, folder) => { folderTertangkap = folder; return { id: 'drv-p5-' + i }; },
        unduh: async () => kecil(),
        hapus: async () => {},
      };
      const harapan = folderSuratNilai || folderCadanganNilai;
      const suratP5 = await S.buat({ jenis: 'masuk', perihal: 'Uji P5 ' + i, pengirim: 'Pemohon Uji' }, { id: 'x', nama: 'Uji' });
      await S.tambahLampiran(suratP5.id, { nama: 'berkas.pdf', mime: 'application/pdf', isi: kecil().toString('base64') }, { nama: 'Uji' }, driveP5);
      if (folderTertangkap !== harapan) {
        semuaBenar = false;
        contohGagal = { i, folderSuratNilai, folderCadanganNilai, harapan, folderTertangkap };
        break;
      }
    }
    cek('Property 5: folder yang diteruskan ke unggahBiner sama dengan Folder_Surat jika terisi atau Folder_Cadangan jika kosong, ' + ITERASI + ' iterasi acak', semuaBenar, contohGagal);
  }

  /* Property 6: drive tiruan dengan driveSiap() dan driveSiapSurat() ditiru
     mengembalikan nilai berbeda secara acak dan independen. Keputusan Modul
     Surat (naik ke Drive atau tidak; memanggil drive.hapus atau tidak) harus
     mengikuti driveSiapSurat(), bukan driveSiap(). */
  {
    const ITERASI = 120;
    let semuaBenar = true, contohGagal = null;
    for (let i = 0; i < ITERASI; i++) {
      /* --- tambahLampiran: keputusan naik ke Drive mengikuti driveSiapSurat --- */
      const siapA = Math.random() < 0.5, siapSuratA = Math.random() < 0.5;
      const driveA = {
        driveSiap: () => siapA,
        driveSiapSurat: () => siapSuratA,
        folderSurat: () => 'folder-p6-' + i,
        unggahBiner: async () => ({ id: 'drv-p6-' + i }),
        unduh: async () => kecil(),
        hapus: async () => {},
      };
      const suratA = await S.buat({ jenis: 'masuk', perihal: 'Uji P6a ' + i, pengirim: 'Pemohon Uji' }, { id: 'x', nama: 'Uji' });
      const hasilTambah = await S.tambahLampiran(suratA.id, { nama: 'berkas.pdf', mime: 'application/pdf', isi: kecil().toString('base64') }, { nama: 'Uji' }, driveA);
      const lampA = hasilTambah.lampiran[0];
      const harapanSimpan = siapSuratA ? 'drive' : 'db';
      if (lampA.simpan !== harapanSimpan) {
        semuaBenar = false;
        contohGagal = { tahap: 'tambahLampiran', i, siapA, siapSuratA, harapanSimpan, hasil: lampA.simpan };
        break;
      }

      /* --- ambilLampiran: tidak bergantung pada driveSiap/driveSiapSurat, hanya pada simpan === 'drive' --- */
      const siapB = Math.random() < 0.5, siapSuratB = Math.random() < 0.5;
      const driveB = {
        driveSiap: () => siapB,
        driveSiapSurat: () => siapSuratB,
        folderSurat: () => 'folder-p6-' + i,
        unggahBiner: async () => ({ id: 'drv-p6-' + i }),
        unduh: async () => kecil(),
        hapus: async () => {},
      };
      const hasilAmbil = await S.ambilLampiran(suratA.id, lampA.id, driveB);
      const isiCocok = lampA.simpan === 'drive' ? Buffer.from(hasilAmbil.isi, 'base64').equals(kecil()) : !!hasilAmbil.isi;
      if (!isiCocok) {
        semuaBenar = false;
        contohGagal = { tahap: 'ambilLampiran', i, siapB, siapSuratB, hasilAmbil };
        break;
      }

      /* --- hapusLampiran: drive.hapus terpanggil mengikuti driveSiapSurat, hanya ketika simpan === 'drive' --- */
      const siapC = Math.random() < 0.5, siapSuratC = Math.random() < 0.5;
      let hapusTerpanggilC = false;
      const driveC = {
        driveSiap: () => siapC,
        driveSiapSurat: () => siapSuratC,
        folderSurat: () => 'folder-p6-' + i,
        unggahBiner: async () => ({ id: 'drv-p6-' + i }),
        unduh: async () => kecil(),
        hapus: async () => { hapusTerpanggilC = true; },
      };
      await S.hapusLampiran(suratA.id, lampA.id, driveC);
      const harapanHapusC = lampA.simpan === 'drive' ? siapSuratC : false;
      if (hapusTerpanggilC !== harapanHapusC) {
        semuaBenar = false;
        contohGagal = { tahap: 'hapusLampiran', i, siapC, siapSuratC, simpan: lampA.simpan, hapusTerpanggilC, harapanHapusC };
        break;
      }

      /* --- hapus: drive.hapus terpanggil pada tiap lampiran 'drive' mengikuti driveSiapSurat --- */
      const siapD = Math.random() < 0.5, siapSuratD = Math.random() < 0.5;
      let hapusTerpanggilD = false;
      const driveD1 = {
        driveSiap: () => true, driveSiapSurat: () => true, folderSurat: () => 'folder-p6-' + i,
        unggahBiner: async () => ({ id: 'drv-p6-hapus-' + i }), unduh: async () => kecil(), hapus: async () => {},
      };
      const suratD = await S.buat({ jenis: 'masuk', perihal: 'Uji P6d ' + i, pengirim: 'Pemohon Uji' }, { id: 'x', nama: 'Uji' });
      await S.tambahLampiran(suratD.id, { nama: 'berkas.pdf', mime: 'application/pdf', isi: kecil().toString('base64') }, { nama: 'Uji' }, driveD1);
      const driveD2 = {
        driveSiap: () => siapD,
        driveSiapSurat: () => siapSuratD,
        folderSurat: () => 'folder-p6-' + i,
        unggahBiner: async () => ({ id: 'drv-p6-' + i }),
        unduh: async () => kecil(),
        hapus: async () => { hapusTerpanggilD = true; },
      };
      await S.hapus(suratD.id, driveD2);
      if (hapusTerpanggilD !== siapSuratD) {
        semuaBenar = false;
        contohGagal = { tahap: 'hapus', i, siapD, siapSuratD, hapusTerpanggilD };
        break;
      }
    }
    cek('Property 6: keputusan naik ke Drive dan pemanggilan drive.hapus mengikuti driveSiapSurat(), bukan driveSiap(), ' + ITERASI + ' iterasi acak', semuaBenar, contohGagal);
  }

  console.log('\n=== E3. STATUS DAN RUANG SURAT: field drive mengikuti driveSiapSurat (Property 7) ===');
  /* lib/surat/api.js men-require modul drive sekali secara statis di awal
     berkas (bukan drive tiruan yang disuntikkan lewat parameter seperti pada
     tambahLampiran dkk), jadi Property 7 di sini diuji lewat variabel
     lingkungan GDRIVE_* sungguhan yang disetel sementara, dibandingkan
     dengan hasil driveSiap()/driveSiapSurat() yang dihitung langsung dari
     api/_drive.js. Kedua fungsi itu membaca process.env setiap kali
     dipanggil (lihat ENV() di dalamnya), jadi perubahan env sesaat sebelum
     memanggil pintu() tetap berlaku walau require() modulnya sendiri sudah
     di-cache Node.js (modul drive yang dipakai lib/surat/api.js dan yang
     diminta langsung di sini adalah objek yang sama). */
  {
    const driveAsli = require(path.join(AKAR, 'api', '_drive.js'));
    const VAR_DRIVE = ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN', 'GDRIVE_FOLDER_ID', 'GDRIVE_FOLDER_SURAT_ID'];
    const envAsli = {};
    for (const k of VAR_DRIVE) envAsli[k] = process.env[k];

    const setEnvDrive = (id, secret, refresh, folder, folderSurat) => {
      process.env.GDRIVE_CLIENT_ID = id;
      process.env.GDRIVE_CLIENT_SECRET = secret;
      process.env.GDRIVE_REFRESH_TOKEN = refresh;
      process.env.GDRIVE_FOLDER_ID = folder;
      process.env.GDRIVE_FOLDER_SURAT_ID = folderSurat;
    };

    /* 2-3 skenario konkret, bukan iterasi acak (lihat design.md: Property 7
       Classification EXAMPLE). */
    const skenario = [
      { nama: 'driveSiap dan driveSiapSurat keduanya benar (kredensial lengkap, Folder_Cadangan dan Folder_Surat terisi)', id: 'id-p7', secret: 'secret-p7', refresh: 'refresh-p7', folder: 'folder-cadangan-p7', folderSurat: 'folder-surat-p7' },
      { nama: 'driveSiap dan driveSiapSurat keduanya salah (kredensial tidak lengkap)', id: '', secret: 'secret-p7', refresh: 'refresh-p7', folder: 'folder-cadangan-p7', folderSurat: 'folder-surat-p7' },
      { nama: 'driveSiap salah tapi driveSiapSurat benar (Folder_Cadangan kosong, Folder_Surat terisi)', id: 'id-p7', secret: 'secret-p7', refresh: 'refresh-p7', folder: '', folderSurat: 'folder-surat-p7' },
    ];

    for (const sk of skenario) {
      setEnvDrive(sk.id, sk.secret, sk.refresh, sk.folder, sk.folderSurat);
      const harapanSiap = driveAsli.driveSiap();
      const harapanSiapSurat = driveAsli.driveSiapSurat();

      r = await pintu('surat.status', {}, T_LIHAT);
      cek('Property 7, surat.status (' + sk.nama + '): field drive sama dengan driveSiapSurat(), bukan driveSiap()', r.ok && r.drive === harapanSiapSurat, { drive: r.drive, harapanSiapSurat, harapanSiap });

      r = await pintu('surat.ruang', {}, T_LIHAT);
      cek('Property 7, surat.ruang (' + sk.nama + '): field drive sama dengan driveSiapSurat(), bukan driveSiap()', r.ok && r.drive === harapanSiapSurat, { drive: r.drive, harapanSiapSurat, harapanSiap });
    }

    /* Kembalikan env ke nilai asli supaya tidak bocor ke bagian uji lain. */
    for (const k of VAR_DRIVE) {
      if (envAsli[k] === undefined) delete process.env[k];
      else process.env[k] = envAsli[k];
    }
  }

  console.log('\n=== F. RAHASIA DAN HAPUS ===');
  r = await pintu('surat.simpan', { jenis: 'masuk', perihal: 'Data pribadi', pengirim: 'Instansi Contoh', sifat: 'rahasia', ringkasan: 'Isi rahasia' }, T_KABID);
  const rh = r.surat;
  await unggah(rh.id, pdf(500), 'application/pdf', 'rahasia.pdf');
  r = await pintu('surat.detail', { id: rh.id }, T_LAIN);
  cek('surat rahasia: isi dan lampiran tertutup bagi yang bukan pencatat/penerima', r.ok && r.surat.rahasiaTertutup && !r.surat.ringkasan && !r.surat.lampiran.length, r.surat);
  cek('surat rahasia tidak punya kode lacak (tidak ada tautan publik)', !rh.kodeLacak, rh.kodeLacak);
  r = await pintu('surat.hapus', { id: sm.id }, T_KABID);
  cek('menghapus butuh izin hapus', r.kode === 403, r);
  r = await pintu('surat.hapus', { id: sm.id }, SU);
  cek('superadmin menghapus surat beserta isi lampirannya', r.ok && !(await db.ambil('item:' + sm.id)) && !(await db.ambil('berkas:' + lid)), r);

  console.log('\n=== G. LACAK PUBLIK ===');
  r = await pintu('surat.lacak', { nomor: pb.nomor, kode: 'SALAH1' }, '', '10.9.9.1');
  cek('kode salah ditolak', r.kode === 404, r);
  r = await pintu('surat.lacak', { nomor: pb.nomor.toLowerCase(), kode: pb.kodeLacak.toLowerCase() }, '', '10.9.9.1');
  cek('lacak tanpa masuk, huruf kecil tetap cocok', r.ok && r.pengajuan.status === 'dicairkan' && r.pengajuan.langkah.filter((x) => x.selesai).length === 5, r);
  const isi = JSON.stringify(r);
  cek('lacak tidak membawa catatan, asesmen, nominal, atau nama petugas', !/Rumah sederhana|Petugas Survei|Budi Program|Rina Sekretariat|2000000|Pemohon Contoh/.test(isi), isi.slice(0, 300));
  cek('lacak membawa nama dan logo lembaga untuk kepala halaman, tanpa alamat dan telepon', r.lembaga && 'namaLembaga' in r.lembaga && 'logoData' in r.lembaga && !('alamat' in r.lembaga) && !('telepon' in r.lembaga), r.lembaga);
  r = await pintu('surat.lacak', { nomor: sp.nomor, kode: sp.kodeLacak }, '', '10.9.9.1');
  cek('pengajuan ditolak terbaca ditolak, tanpa alasan internalnya', r.ok && r.pengajuan.ditolak && !/Di luar program/.test(JSON.stringify(r)), r);
  r = await pintu('surat.lacak', { nomor: sm2.nomor, kode: sm2.kodeLacak }, '', '10.9.9.2');
  cek('surat masuk bisa dilacak publik: jenis, 4 langkah, tanpa pengirim', r.ok && r.pengajuan.jenis === 'masuk' && r.pengajuan.langkah.length === 4 && !/Dinas Contoh/.test(JSON.stringify(r)), r);
  r = await pintu('surat.lacak', { nomor: rh.nomor, kode: 'ABCDEF' }, '', '10.9.9.2');
  cek('surat rahasia tidak bisa dilacak publik', r.kode === 404, r);
  /* Surat lama (dibuat sebelum semua jenis punya kode) dapat kode saat petugas berhak membuka detailnya. */
  { const rek = await db.ambil('item:' + sm2.id); delete rek.kodeLacak; await db.simpan('item:' + sm2.id, rek); }
  r = await pintu('surat.detail', { id: sm2.id }, T_LAIN);
  cek('orang lain di kantor tidak memicu atau melihat kode', r.ok && !r.surat.kodeLacak && !(await db.ambil('item:' + sm2.id)).kodeLacak, r.surat && r.surat.kodeLacak);
  r = await pintu('surat.detail', { id: sm2.id }, SU);
  cek('surat lama dibuatkan kode lacak saat pemegang izin membukanya', r.ok && /^[A-Z2-9]{6}$/.test(r.surat.kodeLacak || ''), r.surat && r.surat.kodeLacak);
  const kodeBaru = r.surat.kodeLacak;
  r = await pintu('surat.detail', { id: sm2.id }, SU);
  cek('kode tidak berubah pada pembukaan berikutnya', r.surat.kodeLacak === kodeBaru, [kodeBaru, r.surat.kodeLacak]);
  r = await pintu('surat.ubah', { id: sm2.id, perihal: 'Pemberitahuan', sifat: 'rahasia' }, SU);
  cek('surat dijadikan rahasia: kode lacak dicabut, tautan lama mati', r.ok && !(await db.ambil('item:' + sm2.id)).kodeLacak && (await pintu('surat.lacak', { nomor: sm2.nomor, kode: kodeBaru }, '', '10.9.9.3')).kode === 404, r);
  let terakhir;
  for (let i = 0; i < 31; i++) terakhir = await pintu('surat.lacak', { nomor: 'X', kode: 'Y' }, '', '10.7.7.7');
  cek('lebih dari 30 percobaan per 10 menit dari satu alamat ditolak', terakhir.kode === 429, terakhir);

  console.log('\n=== H. TANPA FUNGSI VERCEL BARU ===');
  const fs = require('fs');
  cek('tidak ada api/surat.js (menumpang api/media.js)', !fs.existsSync(path.join(AKAR, 'api', 'surat.js')));

  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + g + ' gagal.');
  if (g) { console.log('\nJANGAN dideploy: modul Surat belum benar.\n'); process.exit(1); }
  console.log('\ntest_surat_fitur.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
