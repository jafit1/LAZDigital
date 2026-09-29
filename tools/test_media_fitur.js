/* Uji modul Media: permohonan desain dari diajukan sampai dipakai.
 *
 * YANG DIJAGA DI SINI, DAN KENAPA TIAP BUTIRNYA MUDAH SALAH TANPA TERLIHAT:
 *
 * 1. PEMBAGIAN BIDANG ADALAH ATURAN, BUKAN TATA LETAK. Kotak masuk tim foto
 *    memang cuma menggambar permohonan foto, tetapi tombolnya memanggil alamat
 *    server dengan sebuah id, dan id permohonan video sama gampangnya diketik.
 *    Kalau pagarnya cuma di layar, pembagian tim cuma sugesti.
 *
 * 2. TAUTAN HASIL HARUS BENAR-BENAR GOOGLE DRIVE. Kotak isian yang menerima
 *    apa saja akan menerima jalur D:\Desain\flyer.psd, dan itu terlihat persis
 *    seperti pekerjaan yang sudah selesai sampai ada yang mengkliknya.
 *
 * 3. HASIL LAMA TIDAK BOLEH HILANG SAAT REVISI. Kalau ditimpa, tim media
 *    kehilangan bukti bahwa versi pertama pernah dikirim tepat waktu.
 *
 * 4. JEJAK HANYA BERTAMBAH. "Kenapa ini baru dikerjakan seminggu kemudian"
 *    adalah pertanyaan yang pasti datang di rapat evaluasi, dan jawabannya
 *    harus ada di data, bukan di ingatan.
 *
 * 5. REVISI HANYA OLEH PEMOHONNYA. Kalau siapa pun boleh, satu staff yang
 *    kurang suka desain orang lain bisa mengembalikan pekerjaan yang sudah
 *    diterima pemiliknya.
 *
 * 6. BIDANG DIBEKUKAN SAAT DIAJUKAN. Tanpa itu, memindahkan Flyer ke bidang
 *    lain suatu hari akan memindahkan ratusan pekerjaan lama secara surut.
 *
 *   node tools/test_media_fitur.js
 */
'use strict';
require('./_pagar-db.js')('Uji modul Media');

const media = require('../api/media.js');
const sesi = require('../lib/media/sesi-laz');
const db = require('../lib/media/db');
const pmLib = require('../lib/media/permohonan');
const timLib = require('../lib/media/tim');
const jenisLib = require('../lib/media/jenis');

let ok = 0, g = 0;
const cek = (n, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { g++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300)); }
};

/* Pengguna palsu, bentuknya sama dengan yang dikembalikan sesi-laz. */
const U = (id, perm, role, nama) => ({
  id, nama: nama || ('User ' + id), peran: 'x', kantor: '',
  _laz: { id, role: role || 'staff', permissions: { media: perm || {} } },
});
const STAFF = U('s1', { view: true, create: true }, 'staff', 'Rina Humas');
const STAFF2 = U('s2', { view: true, create: true }, 'staff', 'Doni Program');
const TIM_FOTO = U('tf', { view: true, create: true, edit: true }, 'staff', 'Adi Fotografer');
const TIM_VIDEO = U('tv', { view: true, create: true, edit: true }, 'staff', 'Bima Videografer');
const TIM_DESAIN = U('td', { view: true, create: true, edit: true }, 'staff', 'Cahya Desainer');
const KOOR = U('ko', { view: true, create: true, edit: true, delete: true }, 'staff', 'Koordinator Media');
const SUPER = U('su', {}, 'superadmin', 'Superadmin');
const PENGAMAT = U('pg', { view: true }, 'staff', 'Pengamat');

async function jalan(nama, data, pengguna = STAFF) {
  const t = media.tindakan[nama];
  if (!t) throw new Error('tindakan tidak ada: ' + nama);
  return t.jalankan({ data: data || {}, pengguna, req: { headers: {} }, res: {} });
}
async function tolak(nama, data, pengguna) {
  try { await jalan(nama, data, pengguna); return null; }
  catch (e) { return e.message || String(e); }
}

const asliPenggunaLaz = sesi.penggunaLaz;
function balasan() {
  const r = { statusCode: 200, tubuh: null };
  r.setHeader = () => {};
  r.end = (t) => { try { r.tubuh = JSON.parse(t); } catch (_) { r.tubuh = t; } return r; };
  return r;
}
async function lewatPintu(nama, data, pengguna) {
  sesi.penggunaLaz = async () => pengguna || null;
  const res = balasan();
  await media({ method: 'POST', headers: {}, body: { tindakan: nama, data: data || {} }, on: () => {} }, res);
  sesi.penggunaLaz = asliPenggunaLaz;
  return res;
}

const BESOK = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const KEMARIN = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
const DRIVE = 'https://drive.google.com/file/d/1AbCdEfGhIjK/view';
const DRIVE2 = 'https://drive.google.com/file/d/2ZyXwVuTsRqP/view';

(async () => {
  /* Bersihkan sisa uji sebelumnya supaya hitungan rekap bisa dipastikan. */
  for (const id of await db.anggotaHimpunan(pmLib.DAFTAR)) {
    await db.hapus(pmLib.KUNCI(id));
    await db.keluarDariHimpunan(pmLib.DAFTAR, id);
  }
  for (const uid of await db.anggotaHimpunan(timLib.DAFTAR)) {
    await db.hapus(timLib.KUNCI(uid));
    await db.keluarDariHimpunan(timLib.DAFTAR, uid);
  }

  console.log('=== A. MENGAJUKAN: YANG WAJIB DIISI ===');
  const sah = { jenis: 'flyer', judul: 'Flyer Kajian Ahad Pagi', brief: 'Tema tentang zakat profesi, warna hijau, ada logo Lazismu dan QR donasi.', deadline: BESOK };
  const p1 = (await jalan('permohonan.ajukan', sah)).permohonan;
  cek('permohonan tersimpan dan dapat nomor', /^MD-\d{4}-\d{3}$/.test(p1.nomor), p1.nomor);
  cek('status awalnya menunggu dikerjakan', p1.status === 'baru', p1.status);
  cek('nama pemohon ikut tersalin, bukan cuma id-nya',
    p1.pemohonNama === 'Rina Humas' && p1.pemohonId === 's1', p1);
  cek('tanpa jenis ditolak', /Jenis media/i.test(await tolak('permohonan.ajukan', { ...sah, jenis: '' })));
  cek('jenis karangan ditolak', /Jenis media/i.test(await tolak('permohonan.ajukan', { ...sah, jenis: 'hologram' })));
  cek('tanpa judul ditolak', /Judul/i.test(await tolak('permohonan.ajukan', { ...sah, judul: '' })));
  cek('brief kosong ditolak', /Brief/i.test(await tolak('permohonan.ajukan', { ...sah, brief: '' })));
  /* "tolong dibuatkan" bukan brief. Kalau diterima, tim media tetap harus
     bertanya lewat WhatsApp dan modul ini tidak mengubah apa pun. */
  cek('brief sependek "asap" ditolak', /Brief/i.test(await tolak('permohonan.ajukan', { ...sah, brief: 'asap' })));
  cek('tanpa deadline ditolak', /dipakai/i.test(await tolak('permohonan.ajukan', { ...sah, deadline: '' })));
  cek('deadline bentuk aneh ditolak', /dipakai/i.test(await tolak('permohonan.ajukan', { ...sah, deadline: '12 Oktober' })));
  cek('tautan bahan yang bukan Drive ditolak',
    /Google Drive/i.test(await tolak('permohonan.ajukan', { ...sah, bahan: 'https://wa.me/628123' })));

  console.log('\n=== B. JENIS MENENTUKAN BIDANG, BUKAN PEMOHON ===');
  const pFoto = (await jalan('permohonan.ajukan', { ...sah, jenis: 'foto', judul: 'Dokumentasi penyaluran' })).permohonan;
  const pVideo = (await jalan('permohonan.ajukan', { ...sah, jenis: 'video', judul: 'Liputan bedah rumah' }, STAFF2)).permohonan;
  cek('flyer jatuh ke bidang desain', p1.bidang === 'desain', p1.bidang);
  cek('foto jatuh ke bidang foto', pFoto.bidang === 'foto', pFoto.bidang);
  cek('video jatuh ke bidang video', pVideo.bidang === 'video', pVideo.bidang);
  cek('banner dan sertifikat juga ke desain',
    jenisLib.bidangUntuk('banner') === 'desain' && jenisLib.bidangUntuk('sertifikat') === 'desain');
  const pLain = (await jalan('permohonan.ajukan', { ...sah, jenis: 'lainnya', judul: 'Maket panggung' })).permohonan;
  cek('jenis "lainnya" sengaja belum punya bidang', pLain.bidang === '', pLain.bidang);
  /* Bidang dibekukan: yang tersimpan adalah nilainya, bukan rumusnya. */
  const mentah = await pmLib.ambil(p1.id);
  cek('bidang tersimpan di catatannya, bukan dihitung ulang tiap dibaca',
    mentah.bidang === 'desain' && mentah.jenisLabel === 'Flyer / Poster', mentah.bidang);

  console.log('\n=== C. TIM MEDIA DAN BIDANGNYA ===');
  await jalan('tim.simpan', { userId: 'tf', nama: 'Adi Fotografer', bidang: ['foto'] }, KOOR);
  await jalan('tim.simpan', { userId: 'tv', nama: 'Bima Videografer', bidang: ['video'] }, KOOR);
  await jalan('tim.simpan', { userId: 'td', nama: 'Cahya Desainer', bidang: ['desain'] }, KOOR);
  cek('bidang tersimpan per orang', (await timLib.bidangPunya('tf')).join() === 'foto');
  /* Satu orang boleh lebih dari satu bidang: yang memegang kamera sering juga
     yang mengedit videonya. */
  const rangkap = await timLib.simpan({ userId: 'tf', nama: 'Adi', bidang: ['foto', 'video'] });
  cek('satu orang boleh memegang lebih dari satu bidang', rangkap.bidang.length === 2, rangkap.bidang);
  await timLib.simpan({ userId: 'tf', nama: 'Adi Fotografer', bidang: ['foto'] });
  /* Bidang karangan dibuang, bukan disimpan apa adanya: kalau tersimpan, orang
     itu memegang bidang yang tidak pernah menerima permohonan apa pun dan dari
     layar terlihat sudah ditugaskan. */
  const salah = await timLib.simpan({ userId: 'tx', nama: 'X', bidang: ['foto', 'ilustrasi3d', 'FOTO'] });
  cek('bidang yang tidak dikenal dibuang, dan yang kembar tidak dobel',
    salah.bidang.join() === 'foto', salah.bidang);
  await timLib.hapus('tx');
  const timStaff = await lewatPintu('tim.simpan', { userId: 'zz', bidang: ['foto'] }, STAFF);
  cek('staff biasa tidak boleh mengatur tim', timStaff.statusCode === 403, timStaff.tubuh);
  const timTim = await lewatPintu('tim.simpan', { userId: 'zz', bidang: ['foto'] }, TIM_FOTO);
  cek('anggota tim media pun tidak boleh mengangkat dirinya ke bidang lain',
    timTim.statusCode === 403, timTim.tubuh);

  console.log('\n=== D. PAGAR BIDANG DITEGAKKAN DI SERVER ===');
  /* Inilah butir yang paling penting di berkas ini. Tim foto memanggil alamat
     server dengan id permohonan video: kalau lolos, pembagian bidang cuma
     tata letak layar. */
  const tolakSilang = await tolak('kerja.ambil', { id: pVideo.id }, TIM_FOTO);
  cek('tim foto TIDAK bisa mengambil permohonan video', /bukan bidang Anda/i.test(tolakSilang || ''), tolakSilang);
  const tolakSilang2 = await tolak('kerja.ambil', { id: pFoto.id }, TIM_VIDEO);
  cek('dan sebaliknya juga', /bukan bidang Anda/i.test(tolakSilang2 || ''), tolakSilang2);
  const belumDitugaskan = U('bt', { view: true, create: true, edit: true });
  cek('anggota tim yang belum ditugaskan bidangnya diberi tahu, bukan ditolak tanpa sebab',
    /belum ditugaskan/i.test(await tolak('kerja.ambil', { id: pFoto.id }, belumDitugaskan) || ''));
  cek('permohonan "lainnya" yang belum dibagi tidak bisa diambil siapa pun',
    /belum dibagikan/i.test(await tolak('kerja.ambil', { id: pLain.id }, TIM_DESAIN) || ''));
  cek('koordinator boleh menembus batas bidang',
    !!(await jalan('kerja.ambil', { id: pVideo.id }, KOOR)).permohonan);

  console.log('\n=== E. KOORDINATOR MEMBAGI YANG BELUM BERBIDANG ===');
  const dibagi = (await jalan('permohonan.bagi', { id: pLain.id, bidang: 'desain' }, KOOR)).permohonan;
  cek('setelah dibagi, bidangnya terisi', dibagi.bidang === 'desain', dibagi.bidang);
  cek('dan tim desain sekarang bisa mengambilnya',
    (await jalan('kerja.ambil', { id: pLain.id }, TIM_DESAIN)).permohonan.status === 'diproses');
  cek('staff biasa tidak boleh membagi',
    /tidak berhak|koordinator/i.test((await lewatPintu('permohonan.bagi', { id: pLain.id, bidang: 'foto' }, STAFF)).tubuh.pesan || ''));
  cek('bidang tujuan karangan ditolak',
    /tidak dikenal/i.test(await tolak('permohonan.bagi', { id: pLain.id, bidang: 'hologram' }, KOOR) || ''));

  console.log('\n=== F. ALUR: AMBIL, KIRIM, REVISI ===');
  const a1 = (await jalan('kerja.ambil', { id: pFoto.id }, TIM_FOTO)).permohonan;
  cek('setelah diambil, status jadi sedang dikerjakan', a1.status === 'diproses', a1.status);
  cek('nama pengerjanya tercatat', a1.pengerjaNama === 'Adi Fotografer', a1.pengerjaNama);
  /* Satu permohonan satu pengerja: tanpa ini dua orang mengerjakan flyer yang
     sama diam-diam, dan ketahuannya cuma saat keduanya mengirim hasil. */
  await timLib.simpan({ userId: 'tf2', nama: 'Eka', bidang: ['foto'] });
  const TIM_FOTO2 = U('tf2', { view: true, create: true, edit: true }, 'staff', 'Eka');
  cek('anggota lain di bidang yang sama tidak bisa merebut yang sedang dikerjakan',
    /Sudah dikerjakan/i.test(await tolak('kerja.ambil', { id: pFoto.id }, TIM_FOTO2) || ''));

  cek('mengirim hasil tanpa mengambil dulu ditolak',
    /Mulai kerjakan/i.test(await tolak('kerja.kirim', { id: p1.id, tautan: DRIVE }, TIM_DESAIN) || ''));
  cek('tautan bukan Drive ditolak',
    /Google Drive/i.test(await tolak('kerja.kirim', { id: pFoto.id, tautan: 'https://contoh.test/x.jpg' }, TIM_FOTO) || ''));
  cek('jalur berkas Windows juga ditolak',
    /Google Drive/i.test(await tolak('kerja.kirim', { id: pFoto.id, tautan: 'D:\\Desain\\flyer.psd' }, TIM_FOTO) || ''));
  cek('tautan http (tanpa s) ditolak',
    /Google Drive/i.test(await tolak('kerja.kirim', { id: pFoto.id, tautan: 'http://drive.google.com/x' }, TIM_FOTO) || ''));
  /* Alamat yang MENGANDUNG kata drive.google.com tetapi bukan miliknya. */
  cek('alamat penipu yang cuma menyerupai Drive ditolak',
    /Google Drive/i.test(await tolak('kerja.kirim', { id: pFoto.id, tautan: 'https://drive.google.com.jahat.test/x' }, TIM_FOTO) || ''));
  cek('docs.google.com diterima', pmLib.tautanDriveSah('https://docs.google.com/document/d/1x/edit'));

  const k1 = (await jalan('kerja.kirim', { id: pFoto.id, tautan: DRIVE, catatan: 'Sudah diedit warna' }, TIM_FOTO)).permohonan;
  cek('setelah hasil dikirim, statusnya selesai', k1.status === 'selesai', k1.status);
  cek('tautan hasil terbaca di daftar', k1.hasilTerakhir === DRIVE, k1.hasilTerakhir);

  console.log('\n=== G. REVISI TIDAK MENGHAPUS HASIL SEBELUMNYA ===');
  cek('revisi tanpa alasan ditolak',
    /bagian mana/i.test(await tolak('permohonan.revisi', { id: pFoto.id, catatan: 'ok' }, STAFF) || ''));
  const rv = (await jalan('permohonan.revisi', { id: pFoto.id, catatan: 'Tolong logonya diperbesar dan warnanya dicerahkan' }, STAFF)).permohonan;
  cek('setelah minta revisi, kembali dikerjakan', rv.status === 'diproses', rv.status);
  cek('jumlah revisinya dihitung', rv.jumlahRevisi === 1, rv.jumlahRevisi);
  await jalan('kerja.kirim', { id: pFoto.id, tautan: DRIVE2, catatan: 'Versi 2' }, TIM_FOTO);
  const det = (await jalan('permohonan.detail', { id: pFoto.id })).permohonan;
  cek('hasil versi pertama TIDAK hilang', det.hasil.length === 2, det.hasil.map((h) => h.versi));
  cek('versi pertama masih menunjuk tautan aslinya',
    det.hasil[0].tautan === DRIVE && det.hasil[1].tautan === DRIVE2, det.hasil.map((h) => h.tautan));
  cek('tiap versi menyimpan siapa yang mengirim dan kapan',
    det.hasil.every((h) => h.olehNama && h.waktu), det.hasil);

  console.log('\n=== H. YANG BOLEH MINTA REVISI HANYA PEMOHONNYA ===');
  cek('staff lain tidak boleh mengembalikan pekerjaan orang',
    /pemohonnya sendiri/i.test(await tolak('permohonan.revisi', { id: pFoto.id, catatan: 'kurang bagus menurut saya' }, STAFF2) || ''));
  cek('koordinator boleh, karena memang tugasnya menilai',
    (await jalan('permohonan.revisi', { id: pFoto.id, catatan: 'Ada salah ketik di nama program' }, KOOR)).permohonan.jumlahRevisi === 2);
  cek('revisi sebelum ada hasil ditolak',
    /setelah hasilnya dikirim/i.test(await tolak('permohonan.revisi', { id: p1.id, catatan: 'belum apa-apa kok' }, STAFF) || ''));

  console.log('\n=== I. JEJAK: JALAN PROSES DARI AWAL SAMPAI AKHIR ===');
  const jejak = (await jalan('permohonan.detail', { id: pFoto.id })).permohonan.jejak;
  const urutan = jejak.map((j) => j.langkah).join(' > ');
  cek('tiap langkah tercatat urut waktu',
    urutan === 'diajukan > diambil > dikirim > revisi > dikirim > revisi', urutan);
  cek('tiap langkah menyebut siapa pelakunya',
    jejak.every((j) => j.olehNama), jejak.map((j) => j.olehNama));
  cek('alasan revisi ikut tersimpan, bukan cuma "direvisi"',
    jejak.filter((j) => j.langkah === 'revisi').every((j) => j.catatan.length > 5),
    jejak.filter((j) => j.langkah === 'revisi').map((j) => j.catatan));
  const waktuUrut = jejak.map((j) => j.waktu);
  cek('waktunya menaik, tidak melompat mundur',
    waktuUrut.every((w, i) => i === 0 || w >= waktuUrut[i - 1]), waktuUrut);

  console.log('\n=== J. DEADLINE DAN KETERLAMBATAN ===');
  const telat = (await jalan('permohonan.ajukan', { ...sah, judul: 'Spanduk yang sudah lewat', jenis: 'banner', deadline: KEMARIN })).permohonan;
  cek('permohonan lewat tanggal ditandai terlambat', telat.terlambat === true, telat);
  cek('sisa harinya negatif', telat.sisaHari < 0, telat.sisaHari);
  cek('yang masih jauh tidak ditandai terlambat', p1.terlambat === false, p1);
  /* Yang sudah selesai tidak pernah "terlambat": pekerjaannya sudah ada, dan
     menandainya merah selamanya cuma membuat rekap terlihat lebih buruk
     daripada kenyataannya. */
  cek('yang sudah selesai tidak dihitung terlambat',
    pmLib.terlambat({ status: 'selesai', deadline: KEMARIN }) === false);

  console.log('\n=== K. URUTAN DAFTAR: YANG MENDESAK DI ATAS ===');
  const daftar = (await jalan('permohonan.daftar', {})).baris;
  const posSelesai = daftar.findIndex((r) => r.status === 'selesai');
  const posBelum = daftar.map((r, i) => (r.status !== 'selesai' ? i : -1)).filter((i) => i >= 0);
  cek('yang belum selesai semua di atas yang sudah selesai',
    posSelesai === -1 || posBelum.every((i) => i < posSelesai), { posSelesai, posBelum });
  const belum = daftar.filter((r) => r.status !== 'selesai').map((r) => r.deadline);
  cek('di antara yang belum selesai, deadline terdekat lebih dulu',
    belum.every((d, i) => i === 0 || d >= belum[i - 1]), belum);

  console.log('\n=== L. KOTAK MASUK: SIAPA MELIHAT APA ===');
  const kotakFoto = (await jalan('permohonan.daftar', { kotak: 'kotak' }, TIM_FOTO)).baris;
  cek('kotak tim foto hanya berisi permohonan foto',
    kotakFoto.every((r) => r.bidang === 'foto'), kotakFoto.map((r) => r.bidang));
  const kotakVideo = (await jalan('permohonan.daftar', { kotak: 'kotak' }, TIM_VIDEO)).baris;
  cek('kotak tim video hanya berisi permohonan video',
    kotakVideo.every((r) => r.bidang === 'video'), kotakVideo.map((r) => r.bidang));
  const punyaSaya = (await jalan('permohonan.daftar', { kotak: 'saya' }, STAFF)).baris;
  cek('kotak "milik saya" hanya berisi yang saya ajukan',
    punyaSaya.every((r) => r.pemohonId === 's1'), punyaSaya.map((r) => r.pemohonId));
  cek('dan bukan milik staff lain',
    !punyaSaya.some((r) => r.id === pVideo.id));

  /* Keputusan pengelola: semua yang boleh membuka modul melihat semua
     permohonan. Diuji supaya perubahan diam-diam ke arah lain ketahuan. */
  const semuaDilihatStaff = (await jalan('permohonan.daftar', {}, STAFF)).baris;
  cek('daftar penuh memperlihatkan permohonan staff lain juga',
    semuaDilihatStaff.some((r) => r.pemohonId === 's2'), semuaDilihatStaff.map((r) => r.pemohonId));

  console.log('\n=== M. DAFTAR TIDAK MEMBAWA BRIEF PENUH ===');
  /* Brief bisa empat ribu huruf. Mengirimnya untuk dua ratus baris membuat
     daftar berat tanpa ada yang membacanya di situ. */
  cek('brief tidak ikut di daftar', daftar.every((r) => r.brief === undefined));
  cek('tetapi ada di halaman detail', typeof det.brief === 'string' && det.brief.length > 10);

  console.log('\n=== N. IZIN DIJAGA DI PINTU DEPAN ===');
  cek('tanpa sesi ditolak 401',
    (await lewatPintu('permohonan.daftar', {}, null)).statusCode === 401);
  const pengamat = await lewatPintu('permohonan.ajukan', sah, PENGAMAT);
  cek('yang cuma boleh melihat tidak bisa mengajukan',
    pengamat.statusCode === 403, pengamat.tubuh);
  const staffKerja = await lewatPintu('kerja.ambil', { id: p1.id }, STAFF);
  cek('staff biasa tidak bisa mengambil pekerjaan tim media',
    staffKerja.statusCode === 403, staffKerja.tubuh);
  const staffRekap = await lewatPintu('rekap.ringkas', {}, STAFF);
  cek('staff biasa tidak bisa membuka rekap', staffRekap.statusCode === 403, staffRekap.tubuh);
  cek('tindakan karangan ditolak 404',
    (await lewatPintu('permohonan.bakar', {}, SUPER)).statusCode === 404);
  cek('superadmin lolos semua pagar',
    (await lewatPintu('rekap.ringkas', {}, SUPER)).statusCode === 200);

  console.log('\n=== O. REKAP UNTUK KOORDINATOR & SUPERADMIN ===');
  const rekap = await jalan('rekap.ringkas', {}, SUPER);
  cek('jumlah totalnya sepadan dengan daftar',
    rekap.ringkas.total === daftar.length, { rekap: rekap.ringkas.total, daftar: daftar.length });
  cek('rekap per jenis terisi', rekap.perJenis.length >= 4, rekap.perJenis.map((x) => x.kunci));
  cek('rekap per bidang terisi', rekap.perBidang.length >= 3, rekap.perBidang.map((x) => x.kunci));
  cek('rekap per pemohon memakai namanya, bukan id',
    rekap.perPemohon.some((x) => x.label === 'Rina Humas'), rekap.perPemohon.map((x) => x.label));
  cek('rekap per pengerja memisahkan yang belum diambil',
    rekap.perPengerja.some((x) => x.label === 'Belum diambil'), rekap.perPengerja.map((x) => x.label));
  cek('revisi ikut terhitung di rekap', rekap.ringkas.revisi >= 2, rekap.ringkas.revisi);
  cek('keterlambatan ikut terhitung', rekap.ringkas.terlambat >= 1, rekap.ringkas.terlambat);

  console.log('\n=== P. BIDANG TANPA PEMEGANG DIPERINGATKAN ===');
  /* Permohonan yang masuk ke bidang tanpa satu pun orang akan diam sampai
     deadline lewat, tanpa ada yang merasa bersalah karena tidak ada yang tahu. */
  await timLib.hapus('tv');
  const tim = await jalan('tim.daftar', {}, KOOR);
  cek('bidang video yang kosong dilaporkan', tim.bidangKosong.includes('video'), tim.bidangKosong);
  cek('bidang yang ada pemegangnya tidak ikut dilaporkan', !tim.bidangKosong.includes('foto'), tim.bidangKosong);
  await timLib.simpan({ userId: 'tv', nama: 'Bima Videografer', bidang: ['video'] });
  cek('setelah diisi lagi, peringatannya hilang',
    !(await jalan('tim.daftar', {}, KOOR)).bidangKosong.includes('video'));

  console.log('\n=== Q. DASBOR PER PERAN ===');
  const dasStaff = await jalan('dasbor.ringkas', {}, STAFF);
  cek('staff melihat angka permohonannya sendiri',
    dasStaff.saya.total > 0 && dasStaff.saya.total < dasStaff.lembaga.total, dasStaff.saya);
  cek('staff yang bukan tim media punya kotak kerja kosong',
    dasStaff.kotakSaya.jumlah === 0 && dasStaff.bidangSaya.length === 0, dasStaff.kotakSaya);
  const dasFoto = await jalan('dasbor.ringkas', {}, TIM_FOTO);
  cek('tim foto melihat kotak kerjanya sendiri',
    dasFoto.bidangSaya.join() === 'foto', dasFoto.bidangSaya);
  cek('daftar mendesak tidak memuat yang sudah selesai',
    dasStaff.mendesak.every((r) => r.status !== 'selesai'), dasStaff.mendesak.map((r) => r.status));

  console.log('\n=== R. TIDAK ADA KELAS KARANGAN DI media.js ===');
  /* Kelas CSS yang ditulis di media.js tetapi tidak pernah didefinisikan di
     styles.css tidak menghasilkan galat apa pun: halamannya tetap terbuka,
     JS-nya tetap jalan, dan yang muncul cuma tampilan yang "agak aneh". Itu
     persis yang terjadi pada .lbl, .inp, .tabel dan .tabel-bungkus — empat
     kelas yang dipakai 35 kali di seluruh form modul ini dan tidak satu pun
     ada isinya, sehingga setiap label dan setiap kotak isian tampil polos
     tanpa gaya. Kekeliruan diam seperti ini hanya ketahuan oleh pemeriksaan,
     bukan oleh membaca. Kelas yang memang cuma pegangan JavaScript
     didaftarkan di bawah supaya tidak ikut diributkan. */
  {
    const fsx = require('fs'), px = require('path');
    const akarx = px.join(__dirname, '..', 'src', 'public');
    const jsMedia = fsx.readFileSync(px.join(akarx, 'media.js'), 'utf8');
    const cssx = fsx.readFileSync(px.join(akarx, 'styles.css'), 'utf8');
    const PEGANGAN_JS = new Set(['tm-ubah', 'tm-hapus', 'tmB', 'md-buka', 'hidden']);
    const dipakai = new Set();
    for (const m of jsMedia.matchAll(/class="([^"$]*)"/g)) {
      for (const k of m[1].split(/\s+/)) if (k) dipakai.add(k);
    }
    const hilang = [...dipakai].filter((k) => !PEGANGAN_JS.has(k)
      && !new RegExp('\\.' + k.replace(/[-]/g, '\\-') + '(?![\\w-])').test(cssx)).sort();
    cek('setiap kelas di media.js punya definisinya di styles.css', hilang.length === 0, hilang);
    cek('jumlah kelas yang diperiksa masuk akal', dipakai.size > 30, dipakai.size);
    /* Yang sudah pernah salah, dijaga namanya. */
    for (const mati of ['lbl', 'inp', 'tabel', 'tabel-bungkus']) {
      cek('kelas "' + mati + '" yang dulu karangan tidak dipakai lagi', !dipakai.has(mati));
    }
  }

  console.log('\n=== HASIL ===');
  console.log(`${ok} lulus, ${g} gagal.`);
  if (g) { console.log('\nJANGAN dideploy: modul Media belum benar.\n'); process.exit(1); }
  console.log('\ntest_media_fitur.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
