/* Uji kotak masuk berbentuk percakapan.
 *
 * YANG DIJAGA DI SINI, DAN KENAPA TIAP BUTIRNYA PERNAH SALAH ATAU MUDAH SALAH:
 *
 * 1. SATU BARIS PER KONTAK, bukan satu baris per pesan. Ini permintaan aslinya
 *    dan juga yang paling mudah rusak tanpa terlihat: begitu pengelompokannya
 *    memakai medan yang salah (kontakId yang bisa null, atau nomor yang belum
 *    dinormalkan), daftarnya kembali jadi satu baris per pesan dan kelihatan
 *    "cuma agak panjang" — bukan seperti galat.
 *
 * 2. PESAN TERAKHIR YANG MUNCUL DI BARISNYA HARUS BENAR-BENAR YANG TERAKHIR,
 *    dan urutannya menurut waktu pesan, bukan waktu status terakhir berubah.
 *    Kalau centang "dibaca" yang datang sejam kemudian ikut menggeser urutan,
 *    percakapan kemarin melompat ke puncak tanpa ada pesan baru.
 *
 * 3. HITUNGAN BELUM DIBACA hanya menghitung pesan MASUK, dan lunas begitu
 *    percakapannya dibuka atau dibalas. Angka yang tidak pernah turun membuat
 *    petugas berhenti mempercayainya sama sekali.
 *
 * 4. KONTAK YANG DIBLOKIR: tetap bisa dibalas kalau dia yang menyapa lebih
 *    dulu, tidak bisa dikirimi kalau tidak. Dua-duanya harus benar; yang
 *    pertama supaya petugas tidak pindah ke WhatsApp pribadi, yang kedua
 *    supaya permintaan berhenti tetap dihormati.
 *
 * 5. UTAS GRUP TIDAK BISA DIKIRIMI dari kotak balasan. Satu kotak tulis di
 *    layar grup adalah cara mengirim ke ratusan orang tanpa jeda aman, tanpa
 *    batas harian, dan tanpa daftar penerima.
 *
 * 6. DENYUT NAIK setiap ada perubahan pesan. Kalau tidak, layar percakapan
 *    tidak pernah tahu ada pesan masuk dan "realtime"-nya tinggal nama.
 *
 * 7. PENGURUS KLL hanya melihat percakapan kantornya, dan tidak bisa membuka
 *    utas grup — grup memotong kantor.
 *
 * jalankan:  node tools/test_percakapan.js
 */
'use strict';
require('./_pagar-db.js')('Uji percakapan Broadcast');
const fs = require('fs');
const path = require('path');
const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(path.join(AKAR, '.data'), { recursive: true, force: true });

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const db = require('../lib/blast/db');
const kontakLib = require('../lib/blast/kontak');
const antreanLib = require('../lib/blast/antrean');
const percakapanLib = require('../lib/blast/percakapan');
const { tindakan } = require('../api/blast.js');

let ok = 0, gagal = 0;
const cek = (n, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else { gagal++; console.log('  GAGAL|', n, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 320)); }
};

const REQ = { headers: { host: 'uji.test' }, socket: {} };
const SUPER = { id: 'u_super', nama: 'Superadmin', peran: 'superadmin' };
const KLL = { id: 'u_kll', nama: 'Pengurus Sewon', peran: 'kll', kantor: 'KLL Sewon' };

async function jalan(nama, data, pengguna = SUPER) {
  const t = tindakan[nama];
  if (!t) throw new Error('tindakan tidak ada: ' + nama);
  return t.jalankan({ data: data || {}, pengguna, req: REQ });
}
async function tolak(nama, data, pengguna) {
  try { await jalan(nama, data, pengguna); return null; }
  catch (e) { return e.message || String(e); }
}

/* Waktu ditulis SENDIRI, tidak dibiarkan "sekarang" semuanya. Urutan utas dan
   perhitungan belum dibaca sama-sama bergantung pada selisih waktu, dan
   sepuluh pesan yang lahir pada milidetik yang sama tidak membuktikan apa pun
   soal urutan. */
const T0 = Date.UTC(2026, 8, 20, 3, 0, 0);
const jam = (n) => new Date(T0 + n * 3600000).toISOString();
/* Sebagian pemeriksaan di bawah membandingkan waktu pesan dengan waktu
   percakapannya ditandai dibaca, dan keduanya dicatat dalam milidetik. Tanpa
   jeda sekejap di antaranya, keduanya bisa jatuh pada milidetik yang sama dan
   yang gagal adalah ujinya, bukan kodenya. Dipakai waktu SUNGGUHAN, bukan
   waktu di masa depan: pesan bertanggal besok akan terlihat belum dibaca
   selamanya, dan itu keadaan yang tidak pernah ada di kenyataan. */
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const barusan = async () => { await tidur(6); return new Date().toISOString(); };

async function pesanLangsung(p) {
  const pesan = {
    id: p.id,
    perangkatId: p.perangkatId || 'p_uji',
    nomor: p.nomor,
    nama: p.nama || '',
    kontakId: p.kontakId || null,
    isi: { teks: p.teks || '' },
    arah: p.arah || 'keluar',
    status: p.status || (p.arah === 'masuk' ? 'masuk' : 'terkirim'),
    dibuat: p.waktu,
    massalId: p.massalId || null,
  };
  if (pesan.arah !== 'masuk') pesan.dikirim = p.waktu;
  if (p.sampai) pesan.sampai = p.sampai;
  if (p.dibaca) pesan.dibaca = p.dibaca;
  await antreanLib.simpanPesan(pesan);
  await antreanLib.catatKeDaftar(pesan.id);
  if (pesan.arah === 'masuk') await db.tambahKeHimpunan(`percakapan:${pesan.nomor}`, pesan.id);
  return pesan;
}

(async () => {
  await db.simpan('perangkat:p_uji', {
    id: 'p_uji', nama: 'Perangkat Uji', nomor: '628111000111',
    driver: 'sandbox', status: 'tersambung', aktif: true,
  });
  await db.tambahKeHimpunan('perangkat:daftar', 'p_uji');

  const kontak = {};
  for (const [nama, nomor, grup, kantor] of [
    ['Budi Santosa', '081234567801', ['Pengurus Harian'], 'KLL Sewon'],
    ['Siti Aminah', '081234567802', ['Pengurus Harian'], 'KLL Kasihan'],
    ['Joko Widodo', '081234567803', [], 'KLL Sewon'],
  ]) {
    const h = await kontakLib.simpanKontak({ nama, nomor, label: grup, kantor });
    kontak[nama] = h.kontak;
  }

  /* Empat pesan bolak-balik dengan Budi. Inilah yang dulu jadi empat baris
     terpisah di riwayat. */
  await pesanLangsung({ id: 'm_1', nomor: '6281234567801', kontakId: kontak['Budi Santosa'].id, arah: 'keluar', teks: 'Assalamualaikum, kwitansi zakat Bapak sudah kami kirim.', status: 'dibaca', waktu: jam(0), sampai: jam(0), dibaca: jam(0) });
  await pesanLangsung({ id: 'm_2', nomor: '6281234567801', kontakId: kontak['Budi Santosa'].id, arah: 'masuk', teks: 'Terima kasih, sudah saya terima.', waktu: jam(1) });
  await pesanLangsung({ id: 'm_3', nomor: '6281234567801', kontakId: kontak['Budi Santosa'].id, arah: 'keluar', teks: 'Alhamdulillah.', status: 'terkirim', waktu: jam(2) });
  await pesanLangsung({ id: 'm_4', nomor: '6281234567801', kontakId: kontak['Budi Santosa'].id, arah: 'masuk', teks: 'Satu lagi, bisa minta rincian penyalurannya?', waktu: jam(3) });
  /* Satu pesan ke Siti, lebih tua, supaya urutannya bisa dibuktikan. */
  await pesanLangsung({ id: 'm_5', nomor: '6281234567802', kontakId: kontak['Siti Aminah'].id, arah: 'keluar', teks: 'Info kajian Ahad.', status: 'sampai', waktu: jam(-2) });

  console.log('=== A. SATU BARIS PER KONTAK ===');
  let d = await jalan('inbox.daftar');
  cek('empat pesan dengan Budi jadi SATU baris, bukan empat',
    d.baris.filter((b) => b.nomor === '6281234567801').length === 1,
    d.baris.map((b) => b.kunci));
  cek('dua kontak yang pernah berkirim pesan jadi dua baris',
    d.baris.filter((b) => b.jenis === 'kontak').length === 2, d.baris.length);
  cek('barisnya memakai nama kontak, bukan nomor telanjang',
    (d.baris.find((b) => b.nomor === '6281234567801') || {}).nama === 'Budi Santosa');

  const budi = d.baris.find((b) => b.nomor === '6281234567801');
  cek('cuplikannya pesan yang BENAR-BENAR terakhir',
    /rincian penyalurannya/.test(budi.cuplikan), budi.cuplikan);
  cek('arah pesan terakhir ikut terbawa (supaya centang tidak salah tempat)',
    budi.arahTerakhir === 'masuk', budi.arahTerakhir);
  cek('percakapan terbaru di puncak daftar', d.baris[0].nomor === '6281234567801',
    d.baris.map((b) => b.nama));
  cek('jumlah pesan seluruh utas terhitung', budi.jumlah === 4, budi.jumlah);

  console.log('\n=== B. BELUM DIBACA ===');
  cek('dua pesan masuk Budi terhitung belum dibaca', budi.belumDibaca === 2, budi.belumDibaca);
  cek('pesan KELUAR tidak pernah dihitung belum dibaca',
    (d.baris.find((b) => b.nomor === '6281234567802') || {}).belumDibaca === 0);
  cek('jumlah keseluruhan ikut dikembalikan untuk lencana menu', d.belumDibaca === 2, d.belumDibaca);

  await jalan('inbox.tandaiDibaca', { kunci: 'nomor:6281234567801' });
  d = await jalan('inbox.daftar');
  cek('membuka percakapannya membuat hitungannya nol',
    (d.baris.find((b) => b.nomor === '6281234567801') || {}).belumDibaca === 0,
    d.baris.find((b) => b.nomor === '6281234567801'));

  /* Pesan yang datang SESUDAH dibuka harus terhitung lagi. Kalau tanda bacanya
     disimpan sebagai "sudah pernah dibuka" alih-alih waktu, pesan baru tidak
     akan pernah terlihat lagi selamanya. */
  await pesanLangsung({ id: 'm_6', nomor: '6281234567801', kontakId: kontak['Budi Santosa'].id, arah: 'masuk', teks: 'Halo, masih di sana?', waktu: await barusan() });
  d = await jalan('inbox.daftar');
  cek('pesan masuk SESUDAH dibuka terhitung lagi',
    (d.baris.find((b) => b.nomor === '6281234567801') || {}).belumDibaca === 1,
    d.baris.find((b) => b.nomor === '6281234567801'));

  console.log('\n=== C. UTAS SATU KONTAK ===');
  const utas = await jalan('inbox.utas', { kunci: 'nomor:6281234567801' });
  cek('utasnya memuat seluruh pesan bolak-balik', utas.pesan.length === 5, utas.pesan.length);
  cek('urutannya dari yang paling tua ke yang paling baru',
    utas.pesan.map((p) => p.id).join(',') === 'm_1,m_2,m_3,m_4,m_6',
    utas.pesan.map((p) => p.id));
  cek('arah tiap pesan terbawa supaya gelembungnya bisa kiri-kanan',
    utas.pesan.map((p) => p.arah).join(',') === 'keluar,masuk,keluar,masuk,masuk',
    utas.pesan.map((p) => p.arah));
  cek('status pesan keluar terbawa untuk centangnya',
    utas.pesan[0].status === 'dibaca', utas.pesan[0]);
  cek('grup kontaknya ikut, untuk kepala utas', (utas.grup || []).includes('Pengurus Harian'), utas.grup);
  cek('nomor yang tidak pernah berkirim pesan tetap dijawab utas kosong, bukan galat',
    (await jalan('inbox.utas', { kunci: 'nomor:6281234567803' })).pesan.length === 0);

  console.log('\n=== D. GRUP DILIHAT SEBAGAI PERCAKAPAN ===');
  const kirim = await jalan('massal.kirim', {
    nama: 'Kajian Ahad', perangkatId: 'p_uji', teks: 'Kajian Ahad pukul 08.00.',
    grup: ['Pengurus Harian'],
  });
  cek('kiriman massal ke grup terbentuk', Boolean(kirim.massal && kirim.massal.id), kirim.catatan);

  d = await jalan('inbox.daftar');
  const barisGrup = d.baris.find((b) => b.jenis === 'grup');
  cek('grup yang dikirimi broadcast muncul sebagai satu baris percakapan',
    Boolean(barisGrup) && barisGrup.kunci === 'grup:Pengurus Harian', d.baris.map((b) => b.kunci));
  cek('barisnya menyebut jumlah anggota', barisGrup.anggota === 2, barisGrup);
  cek('dan jumlah broadcast yang pernah dikirim ke sana', barisGrup.jumlah === 1, barisGrup);
  cek('cuplikannya isi broadcastnya', /Kajian Ahad pukul/.test(barisGrup.cuplikan), barisGrup.cuplikan);

  const ug = await jalan('inbox.utas', { kunci: 'grup:Pengurus Harian' });
  const gelembungSiar = (ug.isi || []).filter((x) => x.jenis === 'kiriman');
  cek('utas grup berisi broadcastnya sebagai gelembung', gelembungSiar.length === 1, ug.isi);
  cek('lengkap dengan angka penerimanya', gelembungSiar[0].jumlah === 2, gelembungSiar[0]);
  cek('dan rincian statusnya', gelembungSiar[0].statistik
    && typeof gelembungSiar[0].statistik.dibaca === 'number', gelembungSiar[0].statistik);
  cek('grup yang belum pernah dikirimi broadcast ditolak dengan jelas',
    /belum pernah dikirimi/i.test(await tolak('inbox.utas', { kunci: 'grup:Tidak Ada' }) || ''),
    await tolak('inbox.utas', { kunci: 'grup:Tidak Ada' }));

  /* Balasan anggota SESUDAH broadcast ikut masuk utas grupnya. Inilah yang
     membuat "lihat broadcast per grup" ada gunanya: bukan cuma apa yang kita
     kirim, tetapi apa jawabannya. */
  await pesanLangsung({ id: 'm_7', nomor: '6281234567802', kontakId: kontak['Siti Aminah'].id, arah: 'masuk', teks: 'InsyaAllah hadir.', waktu: await barusan() });
  const ug2 = await jalan('inbox.utas', { kunci: 'grup:Pengurus Harian' });
  cek('balasan anggota muncul di utas grupnya',
    (ug2.isi || []).some((x) => x.jenis === 'masuk' && /InsyaAllah hadir/.test(x.teks)), ug2.isi);
  cek('balasan grup membawa nama pengirimnya, bukan cuma nomor',
    ((ug2.isi || []).find((x) => x.jenis === 'masuk' && /InsyaAllah hadir/.test(x.teks)) || {})
      .nama === 'Siti Aminah',
    (ug2.isi || []).filter((x) => x.jenis === 'masuk').map((x) => x.nama));
  d = await jalan('inbox.daftar');
  /* Yang terhitung sebagai balasan grup hanya pesan masuk SESUDAH broadcast
     pertama ke grup itu. Pesan Budi ("Halo, masih di sana?") datang sebelum
     broadcastnya, jadi ia tetap tinggal di percakapannya sendiri dan tidak
     ikut dihitung di sini. Tanpa batas ini, percakapan lama yang tidak ada
     hubungannya dengan broadcast apa pun akan membuat setiap grup terlihat
     punya puluhan balasan yang tidak pernah ada. */
  cek('balasan anggota sesudah broadcast terhitung belum dibaca di barisnya',
    (d.baris.find((b) => b.jenis === 'grup') || {}).belumDibaca === 1,
    d.baris.find((b) => b.jenis === 'grup'));
  cek('pesan anggota yang datang SEBELUM broadcast tidak ikut terhitung',
    (d.baris.find((b) => b.jenis === 'grup') || {}).dibalas === 1,
    d.baris.find((b) => b.jenis === 'grup'));
  /* Tetapi angka totalnya TIDAK boleh menghitungnya dua kali. Balasan yang sama
     muncul di baris kontaknya dan di baris grupnya; kalau dijumlah dua-duanya,
     lencana menu menyebut angka yang tidak pernah cocok dengan kenyataan. */
  const jumlahKontak = d.baris.filter((b) => b.jenis === 'kontak')
    .reduce((n, b) => n + b.belumDibaca, 0);
  cek('angka total tidak menghitung balasan grup dua kali',
    d.belumDibaca === jumlahKontak, { total: d.belumDibaca, kontak: jumlahKontak });

  console.log('\n=== E. MEMBALAS DARI WEB ===');
  const balas = await jalan('inbox.balas', { kunci: 'nomor:6281234567801', teks: 'Siap, kami kirim rinciannya hari ini.' });
  cek('balasan masuk antrean', Boolean(balas.pesan && balas.pesan.id), balas);
  cek('balasan dikirim ke nomor yang benar', balas.pesan.nomor === '6281234567801', balas.pesan.nomor);
  cek('memakai perangkat yang dipakai pada percakapan itu',
    balas.pesan.perangkatId === 'p_uji', balas.pesan.perangkatId);
  cek('prioritasnya di atas kiriman massal', balas.pesan.prioritas === 1, balas.pesan.prioritas);
  d = await jalan('inbox.daftar');
  cek('membalas ikut melunasi hitungan belum dibaca',
    (d.baris.find((b) => b.nomor === '6281234567801') || {}).belumDibaca === 0,
    d.baris.find((b) => b.nomor === '6281234567801'));
  cek('balasan kosong ditolak', /Isi balasannya/i.test(await tolak('inbox.balas',
    { kunci: 'nomor:6281234567801', teks: '   ' }) || ''));

  /* Kotak balasan di utas grup sengaja tidak ada. Kalau suatu saat ada yang
     memanggil tindakannya langsung, jawabannya harus menunjuk Kiriman Massal —
     bukan mengirim ratusan pesan tanpa satu pun pengaman. */
  const balasGrup = await tolak('inbox.balas', { kunci: 'grup:Pengurus Harian', teks: 'Halo semua' });
  cek('membalas ke utas grup ditolak dan diarahkan ke Kiriman Massal',
    /Kiriman Massal/i.test(balasGrup || ''), balasGrup);

  console.log('\n=== F. KONTAK YANG DIBLOKIR ===');
  /* Joko memblokir dan TIDAK pernah menyapa: tidak ada yang perlu dijawab. */
  await jalan('kontak.ubahBlokir', { id: kontak['Joko Widodo'].id, diblokir: true });
  const tolakJoko = await tolak('inbox.balas', { kunci: 'nomor:6281234567803', teks: 'Halo' });
  cek('kontak diblokir yang belum pernah menyapa tidak bisa dikirimi',
    /minta berhenti/i.test(tolakJoko || ''), tolakJoko);

  /* Budi memblokir TETAPI dia yang bertanya. Menolak di sini akan membuat
     petugas menjawab dari WhatsApp pribadinya, di luar catatan lembaga. */
  await jalan('kontak.ubahBlokir', { id: kontak['Budi Santosa'].id, diblokir: true });
  const balasDiblokir = await jalan('inbox.balas',
    { kunci: 'nomor:6281234567801', teks: 'Berikut rinciannya, Pak.' });
  cek('kontak diblokir yang menyapa lebih dulu TETAP bisa dibalas',
    Boolean(balasDiblokir.pesan && balasDiblokir.pesan.id), balasDiblokir);

  console.log('\n=== G. DENYUT (dasar "realtime") ===');
  const sebelum = (await jalan('inbox.denyut')).denyut;
  await pesanLangsung({ id: 'm_8', nomor: '6281234567802', kontakId: kontak['Siti Aminah'].id, arah: 'masuk', teks: 'Satu pertanyaan lagi.', waktu: await barusan() });
  const sesudah = (await jalan('inbox.denyut')).denyut;
  cek('pesan masuk menaikkan denyut', sesudah > sebelum, { sebelum, sesudah });

  /* Yang paling penting: PERUBAHAN STATUS juga menaikkannya. Centang "dibaca"
     tidak menyentuh daftar 'pesan:baru' sama sekali, jadi kalau denyutnya hanya
     naik saat pesan lahir, centang di layar tidak akan pernah berubah sendiri. */
  const p = await db.ambil(antreanLib.KUNCI_PESAN('m_3'));
  p.status = 'dibaca'; p.dibaca = new Date().toISOString();
  await antreanLib.simpanPesan(p);
  const sesudahStatus = (await jalan('inbox.denyut')).denyut;
  cek('perubahan status (centang dibaca) juga menaikkan denyut',
    sesudahStatus > sesudah, { sesudah, sesudahStatus });
  cek('denyut ikut dikembalikan bersama daftarnya, supaya bisa dibandingkan',
    typeof (await jalan('inbox.daftar')).denyut === 'number');

  console.log('\n=== H. PENGURUS KLL DIKUNCI KE KANTORNYA ===');
  const dKll = await jalan('inbox.daftar', {}, KLL);
  const nomorKll = dKll.baris.filter((b) => b.jenis === 'kontak').map((b) => b.nomor);
  cek('hanya percakapan kantornya sendiri yang terlihat',
    nomorKll.includes('6281234567801') && !nomorKll.includes('6281234567802'), nomorKll);
  cek('dan grup tidak ditawarkan sama sekali, karena grup memotong kantor',
    !dKll.baris.some((b) => b.jenis === 'grup'), dKll.baris.map((b) => b.kunci));
  const tolakKll = await tolak('inbox.utas', { kunci: 'nomor:6281234567802' }, KLL);
  cek('membuka percakapan kantor lain ditolak', /bukan milik kantor/i.test(tolakKll || ''), tolakKll);
  const tolakKllGrup = await tolak('inbox.utas', { kunci: 'grup:Pengurus Harian' }, KLL);
  cek('membuka utas grup pun ditolak untuk akun yang dikunci',
    /dikunci ke satu kantor/i.test(tolakKllGrup || ''), tolakKllGrup);

  console.log('\n=== I. PENCARIAN ===');
  const cari = await jalan('inbox.daftar', { cari: 'Siti' });
  cek('mencari nama menyaring daftarnya',
    cari.baris.length === 1 && cari.baris[0].nama === 'Siti Aminah', cari.baris.map((b) => b.nama));
  const cariNomor = await jalan('inbox.daftar', { cari: '081234567801' });
  cek('mencari dengan awalan 0 tetap menemukan nomor yang tersimpan 62…',
    cariNomor.baris.some((b) => b.nomor === '6281234567801'), cariNomor.baris.map((b) => b.nomor));
  const cariIsi = await jalan('inbox.daftar', { cari: 'pertanyaan' });
  cek('mencari isi pesan terakhir juga bekerja',
    cariIsi.baris.some((b) => b.nomor === '6281234567802'), cariIsi.baris.map((b) => b.cuplikan));

  console.log('\n=== J. IZIN TERPISAH ===');
  cek('melihat percakapan memakai izin inbox.lihat, bukan pesan.lihat',
    tindakan['inbox.daftar'].izin === 'inbox.lihat', tindakan['inbox.daftar'].izin);
  cek('membalas memakai izin inbox.balas', tindakan['inbox.balas'].izin === 'inbox.balas');
  const peta = require('../lib/blast/sesi-laz').PETA_IZIN;
  cek('inbox.lihat diturunkan dari centang "view" modul broadcast LAZDigital',
    peta['inbox.lihat'] === 'view', peta['inbox.lihat']);
  cek('inbox.balas diturunkan dari centang "create", bukan "view"',
    peta['inbox.balas'] === 'create', peta['inbox.balas']);

  console.log('\n=== HASIL ===');
  console.log(`${ok} lulus, ${gagal} gagal.`);
  if (gagal) { console.log('\nJANGAN dideploy: kotak masuk percakapan belum benar.\n'); process.exit(1); }
  console.log('\ntest_percakapan.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });
