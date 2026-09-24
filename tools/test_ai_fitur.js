/* Uji fitur AI Asisten di tingkat server.
 *
 * Yang diuji di sini adalah hal-hal yang harus tetap benar walau siapa pun
 * memanggil API-nya langsung — bukan tampilannya:
 *   - kunci API tidak pernah keluar dari server;
 *   - hanya superadmin yang boleh menyentuh provider;
 *   - percakapan benar-benar DIPAKAI BERSAMA (bukan per akun);
 *   - blok data yang disuapkan ke model tidak memuat data pribadi;
 *   - jawaban yang terputus tetap tersimpan dan ditandai;
 *   - pemakaian token tercatat.
 *
 * Provider sungguhan tidak dipanggil: ada server tiruan yang berbicara SSE
 * seperti API bentuk OpenAI.
 *
 * jalankan:  node tools/test_ai_fitur.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const AKAR = path.join(__dirname, '..');
process.chdir(AKAR);
fs.rmSync(path.join(AKAR, '.data'), { recursive: true, force: true });
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const ai = require('../api/ai.js');
const aiStream = require('../lib/ai/alir.js');
const rpc = require('../api/rpc.js');
const sesi = require('../lib/ai/sesi-laz.js');
const penyediaLib = require('../lib/ai/penyedia.js');
const percakapan = require('../lib/ai/percakapan.js');
const { pengetahuan, prompt, gabungPengetahuan, BATAS_PENGETAHUAN } = require('../lib/ai/pustaka.js');
const ringkas = require('../lib/ai/ringkas.js');
const pakai = require('../lib/ai/pakai.js');

let ok = 0, g = 0;
const yangGagal = [];
const cek = (n, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', n); }
  else {
    g++;
    const ket = info === undefined ? '' : String(JSON.stringify(info)).slice(0, 300);
    yangGagal.push(ket ? `${n}  ->  ${ket}` : n);
    console.log('  GAGAL|', n, ket);
  }
};

// ------------------------------------------------------------ pengguna palsu
const U = (id, perm, role) => ({
  id, nama: 'User ' + id, peran: 'x',
  _laz: { id, nama: 'User ' + id, role: role || 'staff', permissions: { ai: perm || {} } },
});
const ANI = U('u1', { view: true, create: true, edit: true });
const BUDI = U('u2', { view: true, create: true, edit: true });
const PEMBACA = U('u3', { view: true });
const PENGELOLA = U('u4', { view: true, create: true, edit: true, delete: true });
const SUPER = U('us', {}, 'superadmin');

async function jalan(nama, data, pengguna = ANI) {
  const t = ai.tindakan[nama];
  if (!t) throw new Error('tindakan tidak ada: ' + nama);
  return t.jalankan({ data: data || {}, pengguna, req: { headers: {} }, res: {} });
}
async function tolak(nama, data, pengguna) {
  try { await jalan(nama, data, pengguna); return null; }
  catch (e) { return e.message || String(e); }
}

const asliPenggunaLaz = sesi.penggunaLaz;
function resPalsu() {
  const r = { statusCode: 200, kepala: {}, potongan: [], writableEnded: false };
  r.setHeader = (k, v) => { r.kepala[String(k).toLowerCase()] = v; };
  r.flushHeaders = () => {};
  r.write = (t) => { r.potongan.push(String(t)); return true; };
  r.end = (t) => { if (t) r.potongan.push(String(t)); r.writableEnded = true; return r; };
  r.teks = () => r.potongan.join('');
  return r;
}
function reqPalsu(body) {
  const h = {};
  return {
    method: 'POST', headers: {}, body,
    on: (ev, fn) => { (h[ev] = h[ev] || []).push(fn); },
    picu: (ev) => (h[ev] || []).forEach((fn) => fn()),
  };
}
/* Lewat PINTU DEPAN (penangan), bukan lewat .jalankan — pagar superadmin dan
   pagar izin memang duduk di penangan, satu tempat. Menguji lewat .jalankan
   akan lulus walau pagarnya dicopot. */
async function lewatPintu(nama, data, pengguna) {
  sesi.penggunaLaz = async () => pengguna || null;
  const res = resPalsu();
  await ai(reqPalsu({ tindakan: nama, data: data || {} }), res);
  sesi.penggunaLaz = asliPenggunaLaz;
  try { return { res, tubuh: JSON.parse(res.teks()) }; }
  catch (_) { return { res, tubuh: null }; }
}

// ------------------------------------------------- server provider tiruan
/* Berbicara seperti /chat/completions bentuk OpenAI dengan stream:true.
   Sengaja memecah tiap bingkai jadi potongan 9 byte: itulah yang membuktikan
   pembaca SSE menyambung sisa potongan dengan benar — bug yang paling mudah
   lolos karena di jaringan cepat potongannya kebetulan rapi. */
function serverTiruan({ token, jedaMs = 0, statusGalat = 0, pesanGalat = '' } = {}) {
  const srv = http.createServer(async (req, res) => {
    let badan = '';
    for await (const p of req) badan += p;
    srv.terakhirBadan = (() => { try { return JSON.parse(badan); } catch (_) { return null; } })();

    if (statusGalat) {
      res.writeHead(statusGalat, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: pesanGalat || 'salah' } }));
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const tulisPelan = (teks) => new Promise((selesai) => {
      let i = 0;
      const langkah = () => {
        if (i >= teks.length) return selesai();
        res.write(teks.slice(i, i + 9));
        i += 9;
        setImmediate(langkah);
      };
      langkah();
    });
    for (const t of token) {
      await tulisPelan(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      if (jedaMs) await new Promise((s) => setTimeout(s, jedaMs));
      if (res.destroyed) return;
    }
    await tulisPelan(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 120, completion_tokens: 7 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  /* Soket dilacak supaya benar-benar bisa diputus saat server ditutup.
     fetch() bawaan Node memakai sambungan keep-alive: srv.close() saja hanya
     berhenti menerima sambungan BARU dan menunggu yang lama selesai — yang
     tidak pernah terjadi. Akibatnya proses uji menggantung, atau (di Windows)
     berhenti dengan "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
     karena process.exit() dipanggil saat soket masih dibereskan. */
  const soket = new Set();
  srv.on('connection', (s) => { soket.add(s); s.on('close', () => soket.delete(s)); });

  return new Promise((selesai) => {
    srv.listen(0, '127.0.0.1', () => selesai({
      srv,
      url: `http://127.0.0.1:${srv.address().port}/v1`,
      tutup: () => new Promise((s) => {
        for (const k of soket) k.destroy();
        soket.clear();
        srv.close(() => s());
      }),
    }));
  });
}

function bingkaiDari(res) {
  return res.teks().split('\n')
    .filter((b) => b.startsWith('data:'))
    .map((b) => { try { return JSON.parse(b.slice(5).trim()); } catch (_) { return null; } })
    .filter(Boolean);
}

/* Lewat PINTU DEPAN juga, sama seperti tindakan lain — sejak streaming
   ditumpangkan ke api/ai.js, pagar sesi dan pagar izinnya memang duduk di
   sana. Memanggil lib/ai/alir.js langsung akan lulus walau pagarnya dicopot. */
async function aliran(body, pengguna, { potongSetelahToken } = {}) {
  sesi.penggunaLaz = async () => pengguna || null;
  const req = reqPalsu({ tindakan: 'chat.alir', ...body });
  const res = resPalsu();

  /* Pemutusan dipicu oleh JUMLAH TOKEN yang sudah sampai, bukan oleh stopwatch.
     Versi sebelumnya memutus setelah 200  md dengan harapan 1-2 token keburu
     datang — di komputer yang lebih lambat bisa saja belum ada satu pun, dan
     ujinya gagal karena mesinnya, bukan karena kodenya. Uji yang kadang merah
     kadang hijau lebih buruk daripada tidak ada ujinya: orang berhenti
     mempercayainya. */
  if (potongSetelahToken) {
    let n = 0;
    const tulisAsli = res.write;
    res.write = (t) => {
      const hasil = tulisAsli(t);
      if (String(t).includes('"t":"token"') && ++n >= potongSetelahToken) {
        setImmediate(() => req.picu('close'));
      }
      return hasil;
    };
  }

  await ai(req, res);
  sesi.penggunaLaz = asliPenggunaLaz;
  return res;
}

// ================================================================== mulai
(async () => {
  console.log('=== A. PROVIDER: KUNCI API TIDAK PERNAH KELUAR ===');
  const p1 = await penyediaLib.simpan({
    nama: 'Tiruan Satu', bentuk: 'openai', url: 'https://contoh.test/v1',
    model: 'gpt-uji', kunci: 'sk-rahasia-sekali-9931',
  }, SUPER);
  cek('kunci tidak ikut kembali dari simpan()', p1.kunci === undefined, p1);
  cek('hanya 4 huruf terakhir yang ditampilkan', p1.kunciEkor === '9931' && p1.kunciTerpasang === true, p1);
  const daftar1 = await penyediaLib.daftarAman();
  cek('daftar tidak memuat kunci sama sekali',
    !JSON.stringify(daftar1).includes('sk-rahasia-sekali-9931'));
  cek('provider pertama otomatis jadi aktif', daftar1.aktif === p1.id, daftar1.aktif);

  /* Mengosongkan kotak kunci saat menyunting nama TIDAK boleh mencabut kunci —
     kalau ia mencabut, superadmin yang sekadar memperbaiki salah ketik nama
     akan mematikan asisten tanpa tahu sebabnya. */
  await penyediaLib.simpan({ id: p1.id, nama: 'Tiruan Satu (ubah)', kunci: '' }, SUPER);
  cek('kunci bertahan saat kotaknya dikosongkan', (await penyediaLib.ambil(p1.id)).kunci === 'sk-rahasia-sekali-9931');
  await penyediaLib.simpan({ id: p1.id, cabutKunci: true }, SUPER);
  cek('cabutKunci benar-benar mencabut', (await penyediaLib.ambil(p1.id)).kunci === '');
  await penyediaLib.simpan({ id: p1.id, kunci: 'sk-rahasia-sekali-9931' }, SUPER);

  console.log('\n=== B. PAGAR SUPERADMIN (di penangan, bukan di tiap tindakan) ===');
  for (const t of ['penyedia.daftar', 'penyedia.simpan', 'penyedia.hapus', 'penyedia.aktif', 'penyedia.uji']) {
    const { res, tubuh } = await lewatPintu(t, { id: p1.id, nama: 'X', url: 'https://a.test', model: 'm' }, PENGELOLA);
    cek(`${t} ditolak untuk non-superadmin`, res.statusCode === 403 && /superadmin/i.test(tubuh.pesan), tubuh);
  }
  const bolehSuper = await lewatPintu('penyedia.daftar', {}, SUPER);
  cek('penyedia.daftar terbuka untuk superadmin', bolehSuper.res.statusCode === 200 && Array.isArray(bolehSuper.tubuh.baris));
  cek('balasan penangan pun tidak memuat kunci', !bolehSuper.res.teks().includes('sk-rahasia-sekali-9931'));

  const tanpaAkun = await lewatPintu('sesi.daftar', {}, null);
  cek('tanpa sesi ditolak 401', tanpaAkun.res.statusCode === 401, tanpaAkun.tubuh);

  console.log('\n=== C. PERCAKAPAN DIPAKAI BERSAMA ===');
  const s1 = await percakapan.buat({}, ANI);
  await percakapan.tambahPesan(s1.id, { peran: 'user', isi: 'Berapa total penghimpunan bulan ini?', olehId: 'u1', olehNama: 'User u1' });
  const dilihatBudi = await jalan('sesi.daftar', {}, BUDI);
  cek('sesi milik Ani terlihat oleh Budi', dilihatBudi.baris.some((x) => x.id === s1.id), dilihatBudi.baris);
  const dibukaBudi = await jalan('sesi.buka', { id: s1.id }, BUDI);
  cek('Budi bisa membuka isi percakapan Ani', dibukaBudi.sesi.pesan.length === 1);
  cek('judul terisi otomatis dari pertanyaan pertama',
    /Berapa total penghimpunan/.test(dibukaBudi.sesi.judul), dibukaBudi.sesi.judul);

  /* Daftar riwayat sengaja TIDAK membawa isi pesan. Kalau suatu saat ada yang
     "menyederhanakan" dengan mengirim seluruh sesi, halaman riwayat akan
     mengunduh seluruh percakapan lembaga hanya untuk menggambar daftar. */
  cek('daftar tidak membawa isi pesan', dilihatBudi.baris.every((x) => x.pesan === undefined), dilihatBudi.baris[0]);
  cek('daftar membawa cuplikan & jumlah', dilihatBudi.baris[0].jumlahPesan === 1 && dilihatBudi.baris[0].cuplikan.length > 0);

  const cariAda = await jalan('sesi.daftar', { cari: 'penghimpunan' }, BUDI);
  const cariTidak = await jalan('sesi.daftar', { cari: 'zzzzzz' }, BUDI);
  cek('pencarian menyaring', cariAda.baris.length === 1 && cariTidak.baris.length === 0);

  console.log('\n=== D. IZIN PER TINDAKAN ===');
  cek('pembaca tidak boleh mengirim',
    (await lewatPintu('sesi.buat', {}, PEMBACA)).res.statusCode === 403);
  cek('pembaca tetap boleh melihat',
    (await lewatPintu('sesi.daftar', {}, PEMBACA)).res.statusCode === 200);
  cek('menghapus sesi butuh izin hapus, bukan ubah',
    (await lewatPintu('sesi.hapus', { id: s1.id }, ANI)).res.statusCode === 403);
  cek('pengelola boleh menghapus',
    (await lewatPintu('sesi.hapus', { id: (await percakapan.buat({}, ANI)).id }, PENGELOLA)).res.statusCode === 200);
  cek('izin yang tidak terdaftar dianggap "edit" (ketat)', sesi.aksiLaz('sesuatu.baru') === 'edit');
  /* Bertanya sekarang menumpang pintu yang sama; pagarnya harus ikut berlaku,
     bukan jadi celah baru. */
  const alirPembaca = await lewatPintu('chat.alir', {}, PEMBACA);
  cek('chat.alir ditolak untuk yang hanya boleh membaca', alirPembaca.res.statusCode === 403, alirPembaca.tubuh);
  const alirTanpaAkun = await lewatPintu('chat.alir', {}, null);
  cek('chat.alir ditolak tanpa sesi', alirTanpaAkun.res.statusCode === 401, alirTanpaAkun.tubuh);
  cek('chat.alir terdaftar sebagai tindakan beraliran', ai.tindakan['chat.alir'].alir === true);

  console.log('\n=== E. PENGETAHUAN & PERSONA ===');
  await jalan('pengetahuan.simpan', { judul: 'Jam kantor', isi: 'Senin sampai Jumat pukul 08.00-15.00 WIB.' }, ANI);
  await jalan('pengetahuan.simpan', { judul: 'Mati', isi: 'Catatan lama yang tidak dipakai.', aktif: false }, ANI);
  const gab = await gabungPengetahuan();
  cek('hanya catatan aktif yang digabung',
    gab.teks.includes('Senin sampai Jumat') && !gab.teks.includes('Catatan lama'), gab.teks);
  cek('judul ikut sebagai kepala bagian', gab.teks.includes('## Jam kantor'));

  const besar = 'x'.repeat(9000);
  const bA = (await jalan('pengetahuan.simpan', { judul: 'Besar A', isi: besar }, ANI)).rec;
  const bB = (await jalan('pengetahuan.simpan', { judul: 'Besar B', isi: besar }, ANI)).rec;
  const gab2 = await gabungPengetahuan();
  cek('gabungan dipotong di batas', gab2.teks.length <= BATAS_PENGETAHUAN, gab2.teks.length);
  cek('pemotongan DIKATAKAN, tidak diam-diam', gab2.terpotong === true);
  /* Yang terpotong adalah catatan di URUTAN BELAKANG — "Jam kantor" hilang di
     balik dua catatan raksasa. Itu memang perilaku yang benar (urutan menentukan
     apa yang bertahan), dan sekaligus alasan medan `urutan` ada. Diuji di sini
     supaya kalau suatu saat pemotongan diubah jadi memotong dari depan, ada yang
     memberi tahu. */
  cek('catatan di urutan belakang yang tersingkir, bukan yang depan',
    gab2.teks.includes('## Besar A') && !gab2.teks.includes('Senin sampai Jumat'));
  await jalan('pengetahuan.hapus', { id: bA.id }, ANI);
  await jalan('pengetahuan.hapus', { id: bB.id }, ANI);

  cek('judul kosong ditolak', /Judul wajib/i.test(await tolak('pengetahuan.simpan', { isi: 'ada isi' })));
  cek('isi kosong ditolak', /Isi wajib/i.test(await tolak('pengetahuan.simpan', { judul: 'ada judul', isi: '   ' })));

  const persona = (await jalan('prompt.simpan', { judul: 'Penulis Surat', isi: 'Tulis surat resmi.', ikon: '\u{1F4DD}' }, ANI)).rec;
  const st = await jalan('ai.status', {}, ANI);
  cek('persona muncul di status', st.persona.some((x) => x.id === persona.id), st.persona);
  cek('status menyebut jumlah pengetahuan', st.pengetahuan.jumlah >= 1, st.pengetahuan);

  console.log('\n=== F. BLOK DATA: TIDAK BOLEH ADA DATA PRIBADI ===');
  /* Buku besar palsu. Dipasang di sini DAN DIBIARKAN TERPASANG sampai akhir —
     lihat catatan di bawah setelah pemeriksaan blok data. */
  const aslinyaMuat = rpc._internal.muat;
  const bukuPalsu = async () => ({
    db: {
      sheets: {
        Penghimpunan: [
          ['tanggal', 'namaDonatur', 'telepon', 'alamat', 'nik', 'jenisDana', 'program', 'jumlah', 'fundraising', 'metode'],
          ['2026-08-03', 'Budi Santosa', '081211110001', 'Jl. Mawar 7 Bantul', '3402011203990001', 'Zakat', 'Pendidikan', 500000, 'Sherli', 'Tunai'],
          ['2026-08-11', 'Siti Aminah', '081233334444', 'Jl. Melati 3', '3402014405000002', 'Infak', 'Kemanusiaan', 250000, 'Kantor', 'Transfer'],
        ],
        Pentasyarufan: [
          ['tanggal', 'namaPenerima', 'ashnaf', 'program', 'jumlah'],
          ['2026-08-20', 'Pak Karto', 'Fakir', 'Bantuan Pangan', 300000],
        ],
      },
      props: {},
    }, teks: '', ver: '0',
  });
  rpc._internal.muat = bukuPalsu;
  const blok = await ringkas.blokRingkas();

  /* SENGAJA TIDAK DIKEMBALIKAN DI SINI.
     Versi sebelumnya mengembalikannya tepat di baris ini, sehingga bagian G
     membaca buku besar yang SUNGGUHAN — yaitu berkas data/laz-db-local.json
     yang kebetulan ada di komputer pengembang. Di komputer lain berkas itu
     tidak ada (datanya di Upstash, dan uji ini memang mematikan Upstash), jadi
     blok data kosong dan uji "rincian otak" gagal — gagal karena isi folder
     komputernya, bukan karena kodenya.
     Uji yang hasilnya tergantung berkas yang tidak ikut dalam repositori bukan
     uji; ia cuma cermin komputer yang menjalankannya. */

  const terlarang = ['Budi Santosa', 'Siti Aminah', 'Pak Karto', '081211110001', '081233334444',
    'Jl. Mawar', 'Jl. Melati', '3402011203990001'];
  const bocor = terlarang.filter((t) => blok.teks.includes(t));
  cek('tidak ada satu pun data pribadi di blok data', bocor.length === 0, bocor);
  cek('angka & kategori tetap ada',
    blok.teks.includes('Zakat') && blok.teks.includes('Fakir') && blok.teks.includes('Sherli')
    && blok.teks.includes('750.000'), blok.teks.slice(0, 400));
  cek('asisten diberi tahu bahwa ia TIDAK punya data pribadi',
    /TIDAK punya akses ke nama donatur/.test(blok.teks));
  /* Kolom baru yang tidak dikenal harus tertutup dengan sendirinya. Inilah
     bedanya daftar IZIN dengan daftar larangan. */
  cek('kolom tak terdaftar tidak pernah terbaca',
    ringkas.KOLOM_HIMPUN.indexOf('nik') === -1 && ringkas.KOLOM_HIMPUN.indexOf('namaDonatur') === -1);

  console.log('\n=== G. ALIRAN JAWABAN (SSE) ===');
  const tiruan = await serverTiruan({ token: ['Total ', 'penghimpunan ', 'bulan ini ', 'Rp 750.000.'] });
  const pv = await penyediaLib.simpan({
    nama: 'Tiruan Lokal', bentuk: 'openai', url: tiruan.url, model: 'model-uji', kunci: 'sk-uji',
  }, SUPER);
  await penyediaLib.aturAktif(pv.id);

  const r1 = await aliran({ pesan: 'Berapa totalnya?' }, ANI);
  const b1 = bingkaiDari(r1);
  const jenis = b1.map((x) => x.t);
  cek('kepala SSE benar', /text\/event-stream/.test(r1.kepala['content-type'] || ''), r1.kepala);
  cek('proxy dilarang menahan balasan', r1.kepala['x-accel-buffering'] === 'no');
  cek('bingkai mulai dikirim lebih dulu', jenis[0] === 'mulai', jenis.slice(0, 3));
  cek('bingkai selesai menutup aliran', jenis[jenis.length - 1] === 'selesai', jenis.slice(-3));
  const teksAlir = b1.filter((x) => x.t === 'token').map((x) => x.v).join('');
  cek('seluruh teks sampai utuh walau potongan byte tidak rapi',
    teksAlir === 'Total penghimpunan bulan ini Rp 750.000.', teksAlir);

  const mulai = b1.find((x) => x.t === 'mulai');
  cek('sesi baru dibuat oleh endpoint ini', Boolean(mulai.sesiId));
  cek('judul otomatis ikut dikirim', /Berapa totalnya/.test(mulai.judul), mulai.judul);
  cek('rincian "otak" dilaporkan ke tampilan',
    mulai.otak && mulai.otak.pengetahuan >= 1 && mulai.otak.data === true, mulai.otak);

  const sesiBaru = await percakapan.ambil(mulai.sesiId);
  cek('pertanyaan & jawaban tersimpan', sesiBaru.pesan.length === 2, sesiBaru.pesan.map((p) => p.peran));
  cek('jawaban ditandai model & provider',
    sesiBaru.pesan[1].model === 'model-uji' && sesiBaru.pesan[1].penyedia === 'Tiruan Lokal');
  cek('jawaban tidak ditandai terpotong', sesiBaru.pesan[1].terpotong === false);

  const badanKeProvider = tiruan.srv.terakhirBadan;
  cek('prompt sistem dikirim sebagai peran system, tidak dicampur',
    badanKeProvider.messages[0].role === 'system', badanKeProvider.messages.map((m) => m.role));
  cek('pengetahuan lembaga ikut ke provider',
    badanKeProvider.messages[0].content.includes('Senin sampai Jumat'));
  cek('stream dinyalakan', badanKeProvider.stream === true);

  const pemakaian = await pakai.ambilBulan(pakai.bulanIni());
  cek('pemakaian token tercatat', pemakaian && pemakaian.masuk === 120 && pemakaian.keluar === 7, pemakaian);
  cek('pemakaian dipecah per pengguna', Boolean(pemakaian.perPengguna['User u1']), pemakaian.perPengguna);
  cek('kunci pemakaian per bulan, bukan satu dokumen abadi', /^pakai:\d{4}-\d{2}$/.test(pakai.KUNCI(pakai.bulanIni())));

  console.log('\n=== H. LANJUT DI SESI YANG SAMA & RIWAYAT ===');
  const r2 = await aliran({ pesan: 'Lanjutkan.', sesiId: mulai.sesiId }, BUDI);
  const mulai2 = bingkaiDari(r2).find((x) => x.t === 'mulai');
  cek('Budi melanjutkan sesi Ani', mulai2.sesiId === mulai.sesiId);
  const badan2 = tiruan.srv.terakhirBadan;
  cek('riwayat sebelumnya ikut dikirim ke model', badan2.messages.length >= 4, badan2.messages.length);
  cek('riwayat tidak pernah diawali giliran asisten',
    badan2.messages.filter((m) => m.role !== 'system')[0].role === 'user');
  const sesiIsi = await percakapan.ambil(mulai.sesiId);
  cek('pesan Budi tercatat atas namanya',
    sesiIsi.pesan.some((p) => p.peran === 'user' && p.olehNama === 'User u2'), sesiIsi.pesan.map((p) => p.olehNama));

  console.log('\n=== I. JAWABAN TERPUTUS TETAP DISIMPAN ===');
  await tiruan.tutup();
  const lambat = await serverTiruan({ token: ['Satu ', 'dua ', 'tiga ', 'empat ', 'lima'], jedaMs: 60 });
  await penyediaLib.simpan({ id: pv.id, url: lambat.url }, SUPER);

  const r3 = await aliran({ pesan: 'Hitung sampai lima.' }, ANI, { potongSetelahToken: 2 });
  const b3 = bingkaiDari(r3);
  const mulai3 = b3.find((x) => x.t === 'mulai');
  const sesi3 = await percakapan.ambil(mulai3.sesiId);
  const jawab3 = sesi3.pesan.find((p) => p.peran === 'assistant');
  cek('dua token pertama sempat sampai', b3.filter((x) => x.t === 'token').length >= 2, b3.map((x) => x.t));
  cek('potongan jawaban tetap tersimpan', Boolean(jawab3 && jawab3.isi.length), jawab3);
  cek('jawaban setengah DITANDAI terpotong', jawab3 && jawab3.terpotong === true, jawab3);
  cek('jawabannya memang belum lengkap', jawab3 && !/lima/.test(jawab3.isi), jawab3 && jawab3.isi);
  await lambat.tutup();

  console.log('\n=== J. PROVIDER MENOLAK ===');
  const marah = await serverTiruan({ statusGalat: 401, pesanGalat: 'Invalid API key' });
  await penyediaLib.simpan({ id: pv.id, url: marah.url }, SUPER);
  const r4 = await aliran({ pesan: 'Halo.' }, ANI);
  const b4 = bingkaiDari(r4);
  const galat4 = b4.find((x) => x.t === 'galat');
  cek('galat provider sampai ke tampilan sebagai bingkai galat', Boolean(galat4), b4.map((x) => x.t));
  cek('pesan galat menyebut kode & sebabnya', /401/.test(galat4.pesan) && /Invalid API key/.test(galat4.pesan), galat4);
  const sesi4 = await percakapan.ambil(b4.find((x) => x.t === 'mulai').sesiId);
  cek('pertanyaan tetap tersimpan walau jawabannya gagal',
    sesi4.pesan.length === 1 && sesi4.pesan[0].peran === 'user', sesi4.pesan);
  cek('tidak ada jawaban kosong yang ikut tersimpan',
    !sesi4.pesan.some((p) => p.peran === 'assistant'));
  await marah.tutup();

  console.log('\n=== K. ULANGI JAWABAN ===');
  const rapi = await serverTiruan({ token: ['Jawaban ', 'baru.'] });
  await penyediaLib.simpan({ id: pv.id, url: rapi.url }, SUPER);
  const sebelum = await percakapan.ambil(mulai.sesiId);
  const nSebelum = sebelum.pesan.length;
  const setelahUlangi = await jalan('sesi.ulangi', { id: mulai.sesiId }, ANI);
  cek('jawaban terakhir dibuang oleh "ulangi"',
    setelahUlangi.sesi.pesan.length === nSebelum - 1
    && setelahUlangi.sesi.pesan[setelahUlangi.sesi.pesan.length - 1].peran === 'user', setelahUlangi.sesi.pesan.length);
  const lagi = await jalan('sesi.ulangi', { id: mulai.sesiId }, ANI);
  cek('memanggil "ulangi" dua kali tidak menghapus pertanyaan',
    lagi.sesi.pesan.length === nSebelum - 1, lagi.sesi.pesan.length);
  await rapi.tutup();

  console.log('\n=== L. BATAS & PEMBERSIHAN ===');
  const panjang = 'a'.repeat(percakapan.MAKS_ISI + 5000);
  const sPanjang = await percakapan.buat({}, ANI);
  await percakapan.tambahPesan(sPanjang.id, { peran: 'user', isi: panjang });
  const dibaca = await percakapan.ambil(sPanjang.id);
  cek('satu pesan raksasa dipangkas, bukan menggagalkan sesi',
    dibaca.pesan[0].isi.length === percakapan.MAKS_ISI, dibaca.pesan[0].isi.length);

  const potongRiwayat = aiStream.riwayatUntukModel(
    Array.from({ length: 60 }, (_, i) => ({ peran: i % 2 ? 'assistant' : 'user', isi: 'pesan ' + i })),
  );
  cek('riwayat ke model dibatasi', potongRiwayat.length <= aiStream.MAKS_RIWAYAT, potongRiwayat.length);
  cek('yang dipertahankan adalah yang TERBARU',
    potongRiwayat[potongRiwayat.length - 1].isi === 'pesan 59', potongRiwayat[potongRiwayat.length - 1]);

  const hapusSemua = await jalan('sesi.hapusBanyak', { id: [sPanjang.id, 'tidak-ada'] }, PENGELOLA);
  cek('hapus banyak melaporkan yang berhasil dan yang gagal',
    hapusSemua.terhapus === 1 && hapusSemua.gagal.length === 1, hapusSemua);
  cek('menandai nol baris ditolak dengan jelas',
    /tidak ada|Tidak ada/i.test(await tolak('sesi.hapusBanyak', { id: [] }, PENGELOLA)));

  console.log('\n=== M. PROMPT SISTEM ===');
  const otak = await aiStream.susunSistem({ personaId: persona.id, tanpaData: true });
  cek('jati diri selalu ada', otak.teks.includes('Asisten Lazismu'));
  cek('persona yang dipilih ikut masuk', otak.teks.includes('Tulis surat resmi.') && otak.rincian.persona === 'Penulis Surat');
  cek('tanpaData benar-benar menahan blok data', otak.rincian.data === false && !otak.teks.includes('DATA RINGKAS'));
  const otak2 = await aiStream.susunSistem({ personaId: '' });
  cek('tanpa persona tetap jalan', otak2.rincian.persona === '' && otak2.teks.includes('Asisten Lazismu'));

  const otakAdaData = await aiStream.susunSistem({ personaId: '' });
  cek('dengan buku besar terisi, blok data ikut masuk',
    otakAdaData.rincian.data === true && otakAdaData.teks.includes('DATA RINGKAS'), otakAdaData.rincian);

  /* Dua keadaan yang pasti terjadi di lapangan: lembaga yang belum punya satu
     pun transaksi, dan Upstash yang sedang tidak bisa dihubungi. Keduanya tidak
     boleh mematikan asisten — ia hanya kehilangan angkanya, dan itu sudah
     dikatakannya sendiri kepada penanya. */
  rpc._internal.muat = async () => ({ db: { sheets: {}, props: {} }, teks: '', ver: '0' });
  const otakKosong = await aiStream.susunSistem({ personaId: '' });
  cek('buku besar kosong: blok data dilewati, percakapan tetap jalan',
    otakKosong.rincian.data === false && otakKosong.teks.includes('Asisten Lazismu'), otakKosong.rincian);

  rpc._internal.muat = async () => { throw new Error('Upstash sedang mati'); };
  const otakRusak = await aiStream.susunSistem({ personaId: '' });
  cek('basis data tak terbaca: percakapan tetap jalan, hanya tanpa angka',
    otakRusak.rincian.data === false && otakRusak.teks.includes('Asisten Lazismu'), otakRusak.rincian);

  rpc._internal.muat = aslinyaMuat;

  console.log('\n=== N. JUMLAH SERVERLESS FUNCTION (batas Vercel Hobby) ===');
  /* Vercel menghitung SETIAP berkas .js di folder api/ yang tidak diawali "_"
     sebagai satu Serverless Function, termasuk yang di dalam subfolder. Paket
     Hobby membatasi 12 per deploy, dan kalau lewat, yang gagal adalah SELURUH
     deploy — situs yang sudah jalan pun tidak ikut diperbarui. Kegagalan itu
     hanya muncul di log Vercel, jauh setelah semuanya terasa beres, jadi
     dihitung di sini sebelum berangkat. */
  const BATAS_FUNGSI = 12;
  const hitungFungsi = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, d) => {
    if (d.isDirectory()) return n + hitungFungsi(path.join(dir, d.name));
    return n + (d.name.endsWith('.js') && !d.name.startsWith('_') ? 1 : 0);
  }, 0);
  const jumlahFungsi = hitungFungsi(path.join(AKAR, 'api'));
  cek(`folder api/ berisi ${jumlahFungsi} fungsi, batas ${BATAS_FUNGSI}`, jumlahFungsi <= BATAS_FUNGSI, jumlahFungsi);
  cek('modul AI hanya menambah SATU fungsi', fs.existsSync(path.join(AKAR, 'api', 'ai.js'))
    && !fs.existsSync(path.join(AKAR, 'api', 'ai-stream.js')));

  console.log(`\n================  ${ok} lulus, ${g} gagal  ================`);
  /* Daftar yang gagal diulang di paling bawah. Keluarannya panjang; tanpa ini
     satu baris GAGAL di tengah gulungan mudah terlewat, dan yang terbaca cuma
     angka ringkasannya. */
  if (yangGagal.length) {
    console.log('\nYANG GAGAL:');
    yangGagal.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  }
  selesaikan(g ? 1 : 0);
})().catch((e) => { console.error('\nGALAT UJI:', e); selesaikan(1); });

/* Keluar tanpa memaksa. process.exit() di tengah pembersihan soket adalah yang
   memicu assertion libuv di Windows, jadi kodenya disetel lalu prosesnya
   dibiarkan berhenti sendiri; pemaksaan hanya dipakai bila setelah setengah
   detik masih ada yang menahan. */
function selesaikan(kode) {
  process.exitCode = kode;
  setTimeout(() => process.exit(kode), 500).unref();
}
