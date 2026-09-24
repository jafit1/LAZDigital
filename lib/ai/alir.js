// lib/ai/alir.js — percakapan yang mengalir (Server-Sent Events)
//
// DULU INI BERKAS TERSENDIRI di api/ai-stream.js. Dipindah ke lib/ karena
// Vercel paket Hobby hanya mengizinkan 12 Serverless Function per deploy, dan
// folder api/ sudah pas di angka itu — satu berkas tambahan di sana membuat
// SELURUH deploy gagal, bukan cuma fiturnya. Di lib/ ia hanya modul biasa yang
// ikut menumpang fungsi api/ai.js, jadi jumlah fungsinya tidak bertambah.
//
// Bentuk balasannya memang berbeda dari tindakan lain (SSE, bukan JSON sekali
// kirim), jadi api/ai.js memanggilnya lewat jalur tersendiri, bukan lewat tabel
// tindakan biasa.
//
// TIGA HAL YANG MUDAH TERLEWAT DAN SENGAJA DIKERJAKAN DI SINI:
// 1. Jawaban yang TERPUTUS di tengah tetap disimpan dan ditandai `terpotong`.
//    Percakapan ini dipakai bersama; jawaban setengah yang hilang tanpa jejak
//    membuat orang berikutnya membaca riwayat yang tidak masuk akal.
// 2. Denyut (heartbeat) tiap 15 detik. Proxy dan CDN memutus sambungan yang
//    diam terlalu lama, dan model yang sedang "berpikir" panjang memang diam.
// 3. Galat SEBELUM aliran dimulai dilempar kembali ke pemanggil supaya dibalas
//    sebagai JSON biasa (ada kode HTTP-nya); galat SESUDAH aliran dimulai hanya
//    bisa dikirim sebagai bingkai SSE, karena kepala balasan sudah terlanjur
//    terkirim dengan status 200.

const util = require('../blast/util');
const penyediaLib = require('./penyedia');
const percakapan = require('./percakapan');
const { prompt, gabungPengetahuan } = require('./pustaka');
const ringkas = require('./ringkas');
const pakai = require('./pakai');

const { GalatAplikasi } = util;

/* Riwayat yang ikut dikirim ke provider. Bukan seluruh sesi: sesi bersama bisa
   berisi ratusan pesan, dan mengirim semuanya berarti membayar ulang seluruh
   riwayat sebagai token pada setiap pertanyaan. */
const MAKS_RIWAYAT = 24;
const MAKS_HURUF_RIWAYAT = 24000;
const DETIK_DENYUT = 15;

const IDENTITAS = [
  'Kamu adalah "Asisten Lazismu", asisten AI yang dipasang di dalam aplikasi',
  'LAZDigital milik Lazismu Daerah Bantul (lembaga amil zakat, infak, sedekah).',
  'Jawab dalam bahasa Indonesia yang ringkas, sopan, dan mudah dipahami amil.',
  'Gunakan istilah yang lazim di lembaga zakat: muzaki, mustahik, ashnaf, pilar,',
  'penghimpunan, pentasyarufan, amil, fundraising.',
  'Bila kamu tidak tahu atau datanya tidak ada padamu, katakan terus terang —',
  'jangan mengarang angka. Angka lembaga hanya boleh diambil dari blok DATA',
  'RINGKAS di bawah bila ada; di luar itu, katakan bahwa datanya perlu dibuka',
  'sendiri di menu terkait.',
].join('\n');

/* Prompt sistem = jati diri + persona pilihan + pengetahuan lembaga + angka.
   Disusun di satu fungsi supaya "otak" asisten punya satu tempat untuk dibaca
   dan diubah, bukan tersebar di beberapa tempat pemanggilan. */
async function susunSistem({ personaId, tanpaData }) {
  const bagian = [IDENTITAS];
  const rincian = { persona: '', pengetahuan: 0, pengetahuanTerpotong: false, data: false };

  if (personaId) {
    const p = await prompt.ambil(personaId);
    if (p && p.aktif !== false && String(p.isi || '').trim()) {
      bagian.push(`PERAN YANG DIMINTA (${p.judul}):\n${p.isi}`);
      rincian.persona = p.judul;
    }
  }

  const tahu = await gabungPengetahuan();
  if (tahu.teks) {
    bagian.push(`PENGETAHUAN LEMBAGA (ditulis sendiri oleh pengurus, anggap benar):\n${tahu.teks}`);
    rincian.pengetahuan = tahu.jumlah;
    rincian.pengetahuanTerpotong = tahu.terpotong;
  }

  if (!tanpaData) {
    /* Angka lembaga tidak boleh menggagalkan percakapan. Kalau basis data
       utama sedang tidak terbaca, asisten tetap bisa menjawab pertanyaan umum —
       ia hanya kehilangan angkanya, dan itu sudah dikatakannya sendiri lewat
       kalimat penutup di lib/ai/ringkas.js. */
    try {
      const r = await ringkas.blokRingkas();
      if (r.teks) { bagian.push(r.teks); rincian.data = true; }
    } catch (e) {
      console.error('[ai-stream] ringkas data gagal:', e.message);
    }
  }

  return { teks: bagian.join('\n\n'), rincian };
}

/* Riwayat untuk provider: paling baru yang dipertahankan, dipotong dari yang
   paling tua — potongan dari ujung baru justru membuang bagian yang sedang
   dibicarakan. */
function riwayatUntukModel(pesan) {
  const ambil = (pesan || []).slice(-MAKS_RIWAYAT);
  const keluar = [];
  let huruf = 0;
  for (let i = ambil.length - 1; i >= 0; i--) {
    const m = ambil[i];
    const isi = String(m.isi || '');
    if (!isi.trim()) continue;
    if (huruf + isi.length > MAKS_HURUF_RIWAYAT && keluar.length) break;
    huruf += isi.length;
    keluar.unshift({ peran: m.peran === 'assistant' ? 'assistant' : 'user', isi });
  }
  /* Provider menolak percakapan yang diawali giliran asisten. Bisa terjadi
     setelah pemotongan di atas kebetulan menyisakan jawaban di posisi awal. */
  while (keluar.length && keluar[0].peran === 'assistant') keluar.shift();
  return keluar;
}

// ---------------------------------------------------------------- alirkan
/* Dipanggil dari api/ai.js setelah badan dibaca dan pengguna dipastikan.
   Pemeriksaan sesi dan izin TIDAK diulang di sini: ia sudah dikerjakan di
   penangan, satu tempat, bersama seluruh tindakan lain. */
async function alirkan(req, res, { badan, pengguna }) {
  let mengalir = false;      // kepala SSE sudah terkirim?
  let denyut = null;
  const kontrol = new AbortController();

  const kirim = (obj) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const isiPesan = String(badan.pesan || '').trim();
    if (!isiPesan) throw new GalatAplikasi('Pertanyaan masih kosong.', 400);
    if (isiPesan.length > percakapan.MAKS_ISI) {
      throw new GalatAplikasi(`Pertanyaan terlalu panjang (maksimal ${percakapan.MAKS_ISI.toLocaleString('id-ID')} huruf).`, 400);
    }

    /* Sesi dibuat di sini bila belum ada, bukan lewat panggilan terpisah dari
       tampilan. Kalau dipisah, sesi kosong akan menumpuk di daftar bersama
       setiap kali seseorang membuka halaman lalu berubah pikiran. */
    let s = badan.sesiId ? await percakapan.ambil(badan.sesiId) : null;
    if (badan.sesiId && !s) throw new GalatAplikasi('Percakapan tidak ditemukan', 404);
    if (!s) {
      s = await percakapan.buat({
        penyediaId: badan.penyediaId, personaId: badan.personaId,
      }, pengguna);
    }

    const penyedia = await penyediaLib.untukDipakai(badan.penyediaId || s.penyediaId);
    if (!penyedia) {
      throw new GalatAplikasi('Belum ada provider AI yang dipasang. Superadmin dapat menambahkannya di menu Provider AI.', 400);
    }
    if (!penyedia.kunci && !/localhost|127\.0\.0\.1/.test(penyedia.url)) {
      throw new GalatAplikasi(`Provider "${penyedia.nama}" belum punya kunci API. Superadmin dapat mengisinya di menu Provider AI.`, 400);
    }

    const personaId = badan.personaId !== undefined ? badan.personaId : s.personaId;
    const sistem = await susunSistem({ personaId, tanpaData: badan.tanpaData === true });

    /* Pertanyaan disimpan SEBELUM dikirim ke provider. Bila jawabannya gagal,
       pertanyaannya tetap ada di riwayat dan bisa diulang — bukan hilang
       bersama kegagalan. */
    const simpanTanya = await percakapan.tambahPesan(s.id, {
      peran: 'user', isi: isiPesan,
      olehId: pengguna.id, olehNama: pengguna.nama,
    });
    s = simpanTanya.sesi;

    const riwayat = riwayatUntukModel(s.pesan);

    // ---------------------------------------------------------- mulai SSE
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Nginx/proxy menahan balasan yang belum penuh bila ini tidak dimatikan.
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    mengalir = true;

    kirim({
      t: 'mulai',
      sesiId: s.id,
      judul: s.judul,
      pesanTanya: simpanTanya.pesan,
      penyedia: { nama: penyedia.nama, model: penyedia.model, bentuk: penyedia.bentuk },
      otak: sistem.rincian,
    });

    denyut = setInterval(() => {
      // Komentar SSE (diawali titik dua): menjaga sambungan hidup tanpa
      // menambah apa pun ke jawaban di layar.
      if (!res.writableEnded) res.write(`: detak ${Date.now()}\n\n`);
    }, DETIK_DENYUT * 1000);

    let terputusOlehPembaca = false;
    const saatTutup = () => {
      if (res.writableEnded) return;
      terputusOlehPembaca = true;
      kontrol.abort();
    };
    req.on('close', saatTutup);
    req.on('aborted', saatTutup);

    // ---------------------------------------------------------- jalankan
    let jawaban = '';
    let token = null;
    let galatAliran = '';
    const mulaiMs = Date.now();

    try {
      token = await penyediaLib.aliran(penyedia, {
        sistem: sistem.teks,
        pesan: riwayat,
        sinyal: kontrol.signal,
      }, (potong) => {
        jawaban += potong;
        kirim({ t: 'token', v: potong });
      });
    } catch (e) {
      galatAliran = terputusOlehPembaca
        ? 'Dihentikan.'
        : (e.message || 'Gagal menghubungi provider AI.');
      if (!terputusOlehPembaca) console.error('[ai-alir] aliran gagal:', e);
    }

    clearInterval(denyut); denyut = null;

    /* Jawaban disimpan walau setengah jadi — lihat catatan nomor 1 di kepala
       berkas. Yang tidak disimpan hanyalah kegagalan tanpa satu huruf pun
       jawaban, karena itu bukan jawaban, hanya galat. */
    let pesanJawab = null;
    if (jawaban.trim()) {
      const simpanJawab = await percakapan.tambahPesan(s.id, {
        peran: 'assistant', isi: jawaban,
        model: penyedia.model, penyedia: penyedia.nama,
        token: token || null,
        terpotong: Boolean(galatAliran),
      });
      pesanJawab = simpanJawab.pesan;
    }

    if (token && (token.masuk || token.keluar)) {
      try {
        await pakai.catat({
          model: penyedia.model, penyedia: penyedia.nama,
          penggunaId: pengguna.id, penggunaNama: pengguna.nama,
          masuk: token.masuk, keluar: token.keluar,
        });
      } catch (e) {
        // Pencatatan pemakaian tidak boleh menggagalkan jawaban yang sudah jadi.
        console.error('[ai-alir] catat pemakaian gagal:', e.message);
      }
    }

    if (galatAliran) {
      kirim({ t: 'galat', pesan: galatAliran, sebagian: Boolean(jawaban), pesanJawab, dihentikan: terputusOlehPembaca });
    } else {
      kirim({
        t: 'selesai',
        sesiId: s.id,
        pesanJawab,
        token: token || { masuk: 0, keluar: 0 },
        ms: Date.now() - mulaiMs,
      });
    }
    return res.end();
  } catch (e) {
    if (denyut) clearInterval(denyut);
    /* Belum mengalir berarti kepala balasan belum terkirim, jadi galatnya masih
       bisa dibalas sebagai JSON lengkap dengan kode HTTP — itu tugas pemanggil,
       maka dilempar kembali. Kalau sudah mengalir, satu-satunya jalan tersisa
       adalah bingkai galat di dalam aliran. */
    if (!mengalir) throw e;
    if (e.kode === undefined || e.kode >= 500) console.error('[ai-alir]', e);
    kirim({ t: 'galat', pesan: e.message || 'Terjadi kesalahan di server' });
    return res.end();
  }
}

module.exports = { alirkan, susunSistem, riwayatUntukModel, IDENTITAS, MAKS_RIWAYAT, MAKS_HURUF_RIWAYAT, DETIK_DENYUT };
