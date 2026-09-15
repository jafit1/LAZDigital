/**
 * api/ocr.js — pembacaan kwitansi dengan AI vision untuk LAZDigital.
 *
 * POST /api/ocr   body: { aksi:'status'|'model-list'|'baca', token, gambar, pilihan }
 *
 * Alur: peramban memotret kwitansi, mengirim gambarnya ke sini, lalu server
 * memanggil penyedia AI vision memakai kunci dari environment variable.
 * Kunci TIDAK PERNAH sampai ke peramban — repositori ini publik, jadi kunci
 * hanya boleh hidup di Environment Variables Vercel.
 *
 * OCR_MODEL berisi RANTAI model dipisah koma. Model dicoba berurutan; yang
 * kehabisan kuota (429), sedang sesak (503), atau tidak dikenal kunci ini (404)
 * diistirahatkan dan permintaan langsung dilanjutkan ke model berikutnya —
 * jadi kuota gratis harian yang habis tidak mematikan fitur, ia turun kelas.
 *
 * Hasil bacaan selalu dianggap USULAN: server membersihkan dan mencocokkannya
 * ke daftar pilihan yang sah, dan petugas tetap harus memeriksa sebelum
 * menyimpan. Gambarnya sendiri tidak disimpan di mana pun.
 */
'use strict';

const engine = require('./_engine.js');
const rpc = require('./rpc.js');

/* ─── Setelan dari environment ─── */
const PENYEDIA = String(process.env.OCR_PENYEDIA || 'gemini').toLowerCase().trim();
const KUNCI = String(process.env.OCR_API_KEY || '').trim();

/* Sengaja memakai ALIAS "-latest", bukan nomor versi. Model bernomor punya masa
   pensiun: ia tetap terdaftar di ListModels tetapi panggilannya mulai dibalas
   404, dan fitur ini mati diam-diam sampai ada yang menyadarinya. Alias selalu
   menunjuk ke versi yang masih hidup, jadi tidak perlu disentuh tiap Google
   memensiunkan satu generasi.

   Urutannya dari yang paling murah & kuotanya paling longgar ke yang paling
   pintar; pro hanya terpakai kalau dua di atasnya sedang habis. */
const MODEL_BAWAAN = PENYEDIA === 'openai'
  ? ['gpt-4o-mini']
  : ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];
const RANTAI = (function () {
  const d = String(process.env.OCR_MODEL || '').split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return !!s; })
    .slice(0, 6);
  return d.length ? d : MODEL_BAWAAN;
})();

/* Pagar biaya: berapa kali kwitansi boleh dibaca dalam satu hari. */
const BATAS_HARIAN = Math.max(0, Number(process.env.OCR_BATAS_HARIAN || 300)) || 300;

const AKTIF = !!KUNCI;
const BATAS_GAMBAR = 4 * 1024 * 1024;        /* byte base64, di bawah batas badan Vercel */
const MIME_SAH = ['image/jpeg', 'image/png', 'image/webp'];

/* ─── Daftar pilihan: dikirim peramban supaya tidak kembar dengan app.js,
   tetapi dipangkas di sini supaya prompt tidak bisa digelembungkan. ─── */
function daftarBersih(v, maks) {
  if (!Array.isArray(v)) return [];
  return v.map(function (x) { return String(x == null ? '' : x).slice(0, 60); })
    .filter(function (x) { return !!x; })
    .slice(0, maks || 40);
}

function ambilPilihan(p) {
  p = p || {};
  const sub = {};
  if (p.subJenis && typeof p.subJenis === 'object') {
    Object.keys(p.subJenis).slice(0, 20).forEach(function (k) {
      sub[String(k).slice(0, 60)] = daftarBersih(p.subJenis[k], 20);
    });
  }
  return {
    jenisDana: daftarBersih(p.jenisDana, 20),
    subJenis: sub,
    metode: daftarBersih(p.metode, 20),
    tipeDonatur: daftarBersih(p.tipeDonatur, 20),
  };
}

/* ─── Pembersih hasil ─── */
const BULAN = {
  jan: 1, feb: 2, peb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, ags: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

/* Menerima "2026-01-12", "12/01/2026", "12-01-2026", "12 Januari 2026". */
function rapikanTanggal(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return susunTanggal(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let th = m[3];
    if (th.length === 2) th = (Number(th) > 70 ? '19' : '20') + th;
    return susunTanggal(th, m[2], m[1]);
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const bl = BULAN[m[2].slice(0, 3).toLowerCase()];
    if (bl) return susunTanggal(m[3], bl, m[1]);
  }
  return '';
}
function susunTanggal(th, bl, tg) {
  const T = Number(th), B = Number(bl), G = Number(tg);
  if (!T || !B || !G || B < 1 || B > 12 || G < 1 || G > 31) return '';
  if (T < 2000 || T > 2100) return '';
  return T + '-' + String(B).padStart(2, '0') + '-' + String(G).padStart(2, '0');
}

/* "Rp 1.500.000,-" / "1500000" / "1.500.000,00" → 1500000 */
function rapikanJumlah(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.max(0, Math.round(v));
  let s = String(v == null ? '' : v).replace(/rp/gi, '').trim();
  if (!s) return 0;
  s = s.replace(/[,.]\s*-+\s*$/, '');            /* buang akhiran ",-" */
  s = s.replace(/[.,]\d{2}$/, '');               /* buang sen */
  const n = Number(s.replace(/[^\d]/g, ''));
  return isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function teks(v, maks) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, maks || 120);
}

/* Cocokkan ke daftar sah: persis dulu, baru mengandung. Tidak cocok → kosong. */
function cocokkan(v, daftar) {
  const s = teks(v, 60).toLowerCase();
  if (!s || !daftar || !daftar.length) return '';
  for (let i = 0; i < daftar.length; i++) if (String(daftar[i]).toLowerCase() === s) return daftar[i];
  for (let i = 0; i < daftar.length; i++) {
    const d = String(daftar[i]).toLowerCase();
    if (d.indexOf(s) >= 0 || s.indexOf(d) >= 0) return daftar[i];
  }
  return '';
}

function rapikanTelepon(v) {
  const s = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (s.replace(/\D/g, '').length < 8) return '';
  return s.slice(0, 20);
}

function rapikanEmail(v) {
  const s = teks(v, 80);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

/* ─── Prompt ─── */
function susunPrompt(pil) {
  const jen = pil.jenisDana.join(' | ') || '(bebas)';
  const met = pil.metode.join(' | ') || '(bebas)';
  const tip = pil.tipeDonatur.join(' | ') || '(bebas)';
  const sub = Object.keys(pil.subJenis).map(function (k) {
    return '  ' + k + ': ' + pil.subJenis[k].join(' | ');
  }).join('\n') || '  (bebas)';

  return [
    'Kamu membaca foto KWITANSI PENERIMAAN DANA sebuah lembaga amil zakat di Indonesia (Lazismu).',
    'Kwitansi bisa ditulis tangan, dicetak, atau gabungan keduanya.',
    '',
    'Keluarkan HANYA satu objek JSON dengan kunci berikut (semua boleh string kosong bila tidak terbaca):',
    '{',
    '  "tanggal": "YYYY-MM-DD",',
    '  "namaDonatur": "nama orang atau lembaga yang menyerahkan dana",',
    '  "tipeDonatur": "salah satu dari: ' + tip + '",',
    '  "jumlah": angka rupiah tanpa titik/koma, mis. 1500000,',
    '  "jenisDana": "salah satu dari: ' + jen + '",',
    '  "subJenis": "sesuai jenisDana yang dipilih:",',
    sub,
    '  "program": "program atau peruntukan bila disebut, mis. Beasiswa Yatim",',
    '  "metode": "salah satu dari: ' + met + '",',
    '  "noKwitansi": "nomor kwitansi bila tercetak",',
    '  "telepon": "nomor HP/WA bila ada",',
    '  "alamat": "alamat bila ada",',
    '  "keterangan": "catatan singkat lain yang tertulis",',
    '  "raguRagu": ["daftar nama kunci di atas yang kamu tidak yakin"]',
    '}',
    '',
    'Aturan:',
    '- JANGAN menebak. Kalau tulisan tidak terbaca jelas, kosongkan dan masukkan nama kuncinya ke "raguRagu".',
    '- "jumlah" diambil dari angka rupiah. Kalau ada terbilang (huruf) dan angka berbeda, pakai yang huruf dan tandai ragu.',
    '- Jangan mengarang nama, nominal, atau tanggal yang tidak ada di gambar.',
    '- Balas JSON saja, tanpa penjelasan dan tanpa pagar kode.',
  ].join('\n');
}

/* ─── Klasifikasi galat penyedia ───
   Galat yang bisa diperbaiki dengan MENGGANTI MODEL ditandai .lewati, lengkap
   dengan berapa lama model itu diistirahatkan. Galat kunci/izin tidak ditandai
   karena berganti model tidak menolong apa pun. */
function galatPenyedia(status, j, model) {
  const isi = j ? JSON.stringify(j) : '';
  const asli = (j && j.error && (j.error.message || j.error.type)) || '';
  const bersih = String(asli).split(KUNCI || ' ').join('***').slice(0, 160);
  let e;

  if (status === 401 || status === 403) {
    e = new Error('Kunci AI ditolak penyedia. Periksa OCR_API_KEY di Vercel.');
  } else if (status === 400 && /API_KEY|api key/i.test(isi)) {
    e = new Error('Kunci AI tidak sah. Periksa OCR_API_KEY di Vercel.');
  } else if (status === 429) {
    /* Gemini membedakan kuota harian (RPD) dan per menit (RPM) di detail galat.
       Yang harian baru pulih tengah malam waktu Pasifik; yang per menit cukup
       ditunggu sebentar. Salah menebak berarti model bagus dibuang seharian. */
    const harian = /PerDay|per day|GenerateRequestsPerDay|RequestsPerDay/i.test(isi);
    e = new Error(harian
      ? 'Kuota harian model ' + model + ' habis.'
      : 'Model ' + model + ' sedang dibatasi sementara.');
    e.lewati = true;
    e.lewatiDetik = harian ? detikSampaiResetKuota() : 90;
    e.alasan = harian ? 'kuota harian habis' : 'dibatasi sementara';
  } else if (status === 404) {
    /* Pesan asli Google dibawa apa adanya: ia membedakan "nama modelnya salah"
       dari "versi API-nya tidak mendukung", dan tanpa itu penyebabnya cuma bisa
       ditebak-tebak. */
    e = new Error('Model AI "' + model + '" tidak tersedia untuk kunci ini'
      + (bersih ? ' — ' + bersih : '') + '.');
    e.lewati = true;
    e.lewatiDetik = 6 * 3600;
    e.alasan = 'tidak tersedia untuk kunci ini';
    e.rinci = bersih;
  } else if (status === 503 || status === 500 || status === 502 || status === 504) {
    e = new Error('Model ' + model + ' sedang sibuk (HTTP ' + status + ').');
    e.lewati = true;
    e.lewatiDetik = 120;
    e.alasan = 'sedang sibuk';
  } else {
    e = new Error('Layanan AI menolak permintaan (HTTP ' + status + ')'
      + (bersih ? ': ' + bersih : '') + '.');
  }
  e.status = status;
  return e;
}

/* Kuota harian Gemini pulih tengah malam waktu Pasifik. Dihitung lewat Intl
   supaya ikut benar saat daylight saving bergeser. */
function detikSampaiResetKuota() {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const b = {};
    f.formatToParts(new Date()).forEach(function (p) { b[p.type] = Number(p.value); });
    const jam = (b.hour === 24 ? 0 : b.hour) || 0;
    const lewat = jam * 3600 + (b.minute || 0) * 60 + (b.second || 0);
    const sisa = 86400 - lewat;
    return Math.max(300, Math.min(86400, sisa + 120));   /* beri jeda 2 menit */
  } catch (e) { return 3600; }
}

/* ─── Masa istirahat per model ───
   Redis kalau ada (dibagi seluruh instance Vercel), kalau tidak cukup di
   memori instance ini — tetap menolong dalam satu instance. */
const ISTIRAHAT_MEM = new Map();

async function tandaiIstirahat(model, detik, alasan) {
  const sampai = Date.now() + detik * 1000;
  ISTIRAHAT_MEM.set(model, { sampai: sampai, alasan: alasan });
  if (!rpc._internal.PAKAI_REDIS) return;
  try {
    await rpc._internal.redis(['SET', 'laz:ocr:istirahat:' + model, alasan || 'istirahat', 'EX', String(Math.round(detik))]);
  } catch (e) { /* gagal menyimpan jangan sampai membatalkan pembacaan */ }
}

async function sedangIstirahat(model) {
  const m = ISTIRAHAT_MEM.get(model);
  if (m && m.sampai > Date.now()) return m.alasan || 'istirahat';
  if (m) ISTIRAHAT_MEM.delete(model);
  if (!rpc._internal.PAKAI_REDIS) return '';
  try {
    const v = await rpc._internal.redis(['GET', 'laz:ocr:istirahat:' + model]);
    return v ? String(v) : '';
  } catch (e) { return ''; }
}

async function petaIstirahat() {
  const out = {};
  for (let i = 0; i < RANTAI.length; i++) {
    const a = await sedangIstirahat(RANTAI[i]);
    if (a) out[RANTAI[i]] = a;
  }
  return out;
}

/* ─── Pemanggilan penyedia ─── */
async function panggilGemini(model, b64, mime, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(model) + ':generateContent';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KUNCI },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 1200 },
    }),
  });
  const j = await res.json().catch(function () { return null; });
  if (!res.ok) throw galatPenyedia(res.status, j, model);
  const c = j && j.candidates && j.candidates[0];
  const parts = (c && c.content && c.content.parts) || [];
  return parts.map(function (p) { return p && p.text ? p.text : ''; }).join('');
}

async function panggilOpenAI(model, b64, mime, prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KUNCI },
    body: JSON.stringify({
      model: model,
      temperature: 0,
      response_format: { type: 'json_object' },
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b64 } },
        ],
      }],
    }),
  });
  const j = await res.json().catch(function () { return null; });
  if (!res.ok) throw galatPenyedia(res.status, j, model);
  return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

function panggilModel(model, b64, mime, prompt) {
  return PENYEDIA === 'openai'
    ? panggilOpenAI(model, b64, mime, prompt)
    : panggilGemini(model, b64, mime, prompt);
}

/* Mencoba seluruh rantai. Berhenti pada model pertama yang berhasil. */
async function bacaDenganRantai(b64, mime, prompt) {
  const dicoba = [], dilewati = {};
  let galatAkhir = null;

  for (let i = 0; i < RANTAI.length; i++) {
    const model = RANTAI[i];
    const alasan = await sedangIstirahat(model);
    if (alasan) { dilewati[model] = alasan; continue; }

    dicoba.push(model);
    try {
      const teksJawab = await panggilModel(model, b64, mime, prompt);
      return { teks: teksJawab, model: model, cadangan: model !== RANTAI[0], dicoba: dicoba, dilewati: dilewati };
    } catch (e) {
      galatAkhir = e;
      if (!e.lewati) throw e;                       /* ganti model tidak menolong */
      dilewati[model] = e.alasan || 'gagal';
      await tandaiIstirahat(model, e.lewatiDetik || 120, e.alasan || 'gagal');
    }
  }

  const habis = new Error(susunPesanHabis(dilewati, galatAkhir));
  habis.semuaHabis = true;
  habis.dilewati = dilewati;
  throw habis;
}

function susunPesanHabis(dilewati, galatAkhir) {
  const nama = Object.keys(dilewati);
  if (!nama.length) return (galatAkhir && galatAkhir.message) || 'Tidak ada model AI yang bisa dipakai.';
  const adaKuota = nama.some(function (m) { return /kuota/i.test(dilewati[m]); });
  const semuaAsing = nama.every(function (m) { return /tidak tersedia/i.test(dilewati[m]); });

  if (adaKuota) {
    return 'Kuota semua model AI sedang habis: '
      + nama.map(function (m) { return m + ' (' + dilewati[m] + ')'; }).join(', ')
      + '. Kuota gratis harian pulih tengah malam waktu Pasifik (sekitar pukul 14.00–15.00 WIB). Sementara ini isi manual sambil melihat foto.';
  }

  /* Semua model ditolak 404 hampir selalu berarti setelan, bukan gangguan:
     nama model salah, atau kuncinya dari project yang belum mengaktifkan
     Generative Language API. Pesannya menunjuk ke cara memeriksanya. */
  if (semuaAsing) {
    return 'Tidak ada model AI yang cocok untuk kunci ini (' + nama.join(', ') + ').'
      + (galatAkhir && galatAkhir.rinci ? ' Kata penyedia: ' + galatAkhir.rinci + '.' : '')
      + ' Periksa daftar model yang benar-benar didukung kunci ini lewat aksi "model-list", lalu sesuaikan OCR_MODEL di Vercel.';
  }

  return 'Tidak ada model AI yang bisa dipakai: '
    + nama.map(function (m) { return m + ' (' + dilewati[m] + ')'; }).join(', ') + '.';
}

function uraikanJSON(t) {
  let s = String(t || '').trim();
  if (!s) return null;
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  return null;
}

/* ─── Pagar kuota harian sendiri (hanya bila Redis tersedia) ─── */
async function kuotaLewat() {
  if (!rpc._internal.PAKAI_REDIS) return false;
  const hari = new Date().toISOString().slice(0, 10);
  const kunci = 'laz:ocr:' + hari;
  const n = Number(await rpc._internal.redis(['INCR', kunci]));
  if (n === 1) { try { await rpc._internal.redis(['EXPIRE', kunci, 172800]); } catch (e) {} }
  return n > BATAS_HARIAN;
}

/* Model yang ada di daftar penyedia tetapi jelas bukan untuk membaca gambar:
   pembuat gambar, suara, transkripsi, robotika, dan sejenisnya. */
const POLA_BUKAN_VISI = /(-image|-tts|transcribe|robotics|lyria|nano-banana|computer-use|deep-research|embedding|veo|imagen)/i;

/* Gambar 8x8 putih — dipakai aksi 'uji-model' untuk mengetuk tiap model
   sekali dengan biaya paling murah yang mungkin. */
const GAMBAR_UJI = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDs6KKKAP/Z';

/* Mengetuk satu model dan melaporkan APA ADANYA: status HTTP dan kalimat asli
   penyedia. Tanpa ini, model yang ditolak cuma bisa ditebak sebabnya. */
async function ujiSatuModel(model) {
  try {
    const t = await panggilModel(model, GAMBAR_UJI, 'image/jpeg',
      'Balas persis satu kata: OK');
    return { model: model, bisa: true, status: 200, jawab: String(t || '').trim().slice(0, 60) };
  } catch (e) {
    return {
      model: model, bisa: false,
      status: e.status || 0,
      pesan: (e && e.message) || 'gagal',
      bisaDiganti: !!e.lewati,
    };
  }
}

/* ─── Daftar model yang benar-benar didukung kunci ini ─── */
async function daftarModelPenyedia() {
  if (PENYEDIA === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + KUNCI } });
    const j = await res.json().catch(function () { return null; });
    if (!res.ok) throw galatPenyedia(res.status, j, '(daftar)');
    return ((j && j.data) || []).map(function (m) { return String(m.id); }).sort();
  }
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    { headers: { 'x-goog-api-key': KUNCI } });
  const j = await res.json().catch(function () { return null; });
  if (!res.ok) throw galatPenyedia(res.status, j, '(daftar)');
  return ((j && j.models) || [])
    .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
    .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
    .filter(Boolean).sort();
}

/* ─── Handler ─── */
const AKSI_IZIN = {
  status: 'view', 'model-list': 'view', 'uji-model': 'view',
  'reset-istirahat': 'edit', baca: 'create',
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ __error: 'Method not allowed' }); return; }
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  body = body || {};

  const aksi = String(body.aksi || 'baca');
  const perlu = AKSI_IZIN[aksi];
  if (!perlu) { res.status(400).json({ __error: 'Aksi tidak dikenal: ' + aksi }); return; }

  /* Autentikasi memakai token LAZDigital yang sama. Membaca kwitansi adalah
     langkah mencatat penghimpunan, jadi izinnya 'create'. */
  const token = body.token || req.headers['x-laz-token'] || '';
  try {
    const r = await rpc._internal.muat();
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    engine.cekIzin(r.db, token, 'penghimpunan', perlu,
      { ip: ip, ua: String(req.headers['user-agent'] || '').slice(0, 160) });
  } catch (e) {
    const pesan = (e && e.message) || String(e);
    const kode = /AUTH:/.test(pesan) ? 401 : (/IZIN:/.test(pesan) ? 403 : 500);
    res.status(kode).json({ __error: pesan });
    return;
  }

  if (aksi === 'status') {
    res.status(200).json({
      result: {
        aktif: AKTIF,
        penyedia: AKTIF ? PENYEDIA : '',
        model: AKTIF ? RANTAI[0] : '',
        rantai: AKTIF ? RANTAI.slice() : [],
        istirahat: AKTIF ? await petaIstirahat() : {},
      },
    });
    return;
  }

  if (!AKTIF) {
    res.status(200).json({ __error: 'Pembacaan otomatis belum disetel. Isi OCR_API_KEY di Environment Variables Vercel.' });
    return;
  }

  if (aksi === 'model-list') {
    try {
      const semua = await daftarModelPenyedia();
      const visi = semua.filter(function (m) { return !POLA_BUKAN_VISI.test(m); });
      /* Alias "-latest" didahulukan di saran, justru supaya rantai tidak perlu
         diperbarui lagi saat Google memensiunkan versi bernomor. */
      const alias = visi.filter(function (m) { return /-latest$/.test(m); });
      const saran = [
        alias.find(function (m) { return /flash-lite-latest/.test(m); }),
        alias.find(function (m) { return /flash-latest/.test(m); }),
        alias.find(function (m) { return /pro-latest/.test(m); }),
      ].filter(Boolean);
      res.status(200).json({
        result: {
          rantai: RANTAI.slice(),
          tersedia: visi,
          visiSaja: visi.length !== semua.length,
          alias: alias,
          saran: saran.length ? [saran[1], saran[0], saran[2]].filter(Boolean) : [],
          rantaiSah: RANTAI.filter(function (m) { return semua.indexOf(m) >= 0; }),
          rantaiTidakDikenal: RANTAI.filter(function (m) { return semua.indexOf(m) < 0; }),
          istirahat: await petaIstirahat(),
          catatan: 'Terdaftar di sini belum tentu bisa dipakai — model yang sudah pensiun tetap terdaftar tapi panggilannya dibalas 404. Pakai aksi "uji-model" untuk memastikan.',
        },
      });
    } catch (e) {
      res.status(200).json({ __error: (e && e.message) || 'Daftar model tidak bisa diambil.' });
    }
    return;
  }

  /* Mengetuk model satu per satu dengan gambar 8x8 — murah, dan hasilnya
     memastikan model mana yang SUNGGUH bisa dipakai, bukan sekadar terdaftar. */
  if (aksi === 'uji-model') {
    const minta = Array.isArray(body.model) ? body.model
      : (body.model ? [String(body.model)] : RANTAI.slice());
    const daftar = minta.map(function (x) { return String(x).trim(); })
      .filter(Boolean).slice(0, 8);
    const hasil = [];
    for (let i = 0; i < daftar.length; i++) hasil.push(await ujiSatuModel(daftar[i]));
    res.status(200).json({
      result: {
        diuji: daftar,
        hasil: hasil,
        bisaDipakai: hasil.filter(function (h) { return h.bisa; }).map(function (h) { return h.model; }),
      },
    });
    return;
  }

  /* Setelah OCR_MODEL dibetulkan, model yang telanjur diistirahatkan tidak
     perlu ditunggu sampai masanya habis. */
  if (aksi === 'reset-istirahat') {
    module.exports._internal.lupakanIstirahat();
    let redisDihapus = 0;
    if (rpc._internal.PAKAI_REDIS) {
      for (let i = 0; i < RANTAI.length; i++) {
        try { redisDihapus += Number(await rpc._internal.redis(['DEL', 'laz:ocr:istirahat:' + RANTAI[i]])) || 0; } catch (e) {}
      }
    }
    res.status(200).json({ result: { ok: true, redisDihapus: redisDihapus, istirahat: await petaIstirahat() } });
    return;
  }

  /* Gambar boleh berupa data URL utuh atau base64 telanjang. */
  const mentah = String(body.gambar || '');
  let mime = 'image/jpeg', b64 = mentah;
  const m = mentah.match(/^data:([a-z/+.-]+);base64,(.*)$/i);
  if (m) { mime = m[1].toLowerCase(); b64 = m[2]; }
  b64 = b64.replace(/\s+/g, '');

  if (!b64) { res.status(400).json({ __error: 'Tidak ada gambar yang dikirim.' }); return; }
  if (MIME_SAH.indexOf(mime) < 0) { res.status(400).json({ __error: 'Format gambar tidak didukung: ' + mime }); return; }
  if (b64.length > BATAS_GAMBAR) { res.status(413).json({ __error: 'Gambar terlalu besar. Foto ulang dengan resolusi lebih kecil.' }); return; }

  try {
    if (await kuotaLewat()) {
      res.status(200).json({ __error: 'Batas pembacaan otomatis hari ini (' + BATAS_HARIAN + ') sudah tercapai. Isi manual dulu.' });
      return;
    }
  } catch (e) { /* pagar kuota gagal jangan sampai mematikan fiturnya */ }

  const pil = ambilPilihan(body.pilihan);
  const prompt = susunPrompt(pil);

  let jawab;
  try {
    jawab = await bacaDenganRantai(b64, mime, prompt);
  } catch (e) {
    res.status(200).json({ __error: (e && e.message) || 'Layanan AI tidak bisa dihubungi.' });
    return;
  }

  const j = uraikanJSON(jawab.teks);
  if (!j) {
    res.status(200).json({ result: { terbaca: false, isi: {}, raguRagu: [], model: jawab.model, cadangan: jawab.cadangan, catatan: 'Jawaban AI tidak bisa dibaca.' } });
    return;
  }

  const jenisDana = cocokkan(j.jenisDana, pil.jenisDana);
  const subDaftar = (jenisDana && pil.subJenis[jenisDana]) || [];
  const isi = {
    tanggal: rapikanTanggal(j.tanggal),
    namaDonatur: teks(j.namaDonatur, 80),
    tipeDonatur: cocokkan(j.tipeDonatur, pil.tipeDonatur),
    jumlah: rapikanJumlah(j.jumlah),
    jenisDana: jenisDana,
    subJenis: cocokkan(j.subJenis, subDaftar),
    program: teks(j.program, 80),
    metode: cocokkan(j.metode, pil.metode),
    noKwitansi: teks(j.noKwitansi, 40),
    telepon: rapikanTelepon(j.telepon),
    email: rapikanEmail(j.email),
    alamat: teks(j.alamat, 140),
    keterangan: teks(j.keterangan, 200),
  };

  const ragu = Array.isArray(j.raguRagu)
    ? j.raguRagu.map(function (x) { return teks(x, 24); }).filter(function (x) { return Object.prototype.hasOwnProperty.call(isi, x); }).slice(0, 15)
    : [];

  const terisi = Object.keys(isi).filter(function (k) { return isi[k] !== '' && isi[k] !== 0; });
  res.status(200).json({
    result: {
      terbaca: terisi.length > 0, isi: isi, raguRagu: ragu, jumlahTerisi: terisi.length,
      model: jawab.model, cadangan: jawab.cadangan,
    },
  });
};

/* Dipakai pengujian. */
module.exports._internal = {
  rapikanTanggal, rapikanJumlah, cocokkan, uraikanJSON, teks,
  rapikanTelepon, rapikanEmail, ambilPilihan, susunPrompt, galatPenyedia,
  detikSampaiResetKuota, susunPesanHabis, RANTAI, POLA_BUKAN_VISI,
  lupakanIstirahat: function () { ISTIRAHAT_MEM.clear(); },
};
