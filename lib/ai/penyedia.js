// lib/ai/penyedia.js — daftar provider AI dan tiga adapter penyambungnya
//
// TIGA BENTUK, BUKAN SATU PER LAYANAN.
// Hampir semua layanan meniru bentuk OpenAI (/chat/completions), jadi satu
// adapter 'openai' sudah melayani OpenRouter, Groq, DeepSeek, Together, dan
// Ollama/LM Studio lokal sekaligus. Yang benar-benar berbeda bentuknya hanya
// Anthropic dan Gemini, dan keduanya dapat adapter sendiri.
//
// KUNCI API TIDAK PERNAH KELUAR DARI SINI.
// ambilAman() menyamarkannya sebelum dikirim ke tampilan. Yang memakai kunci
// asli hanya aliran() yang berjalan di server.

const db = require('./db');
const util = require('../blast/util');
const { id, sekarang, bersihkanTeks } = util;

const KUNCI = (i) => `penyedia:${i}`;
const DAFTAR = 'penyedia:daftar';
const AKTIF = 'penyedia:aktif';

const BENTUK = {
  openai: {
    label: 'OpenAI-compatible',
    keterangan: 'OpenAI, OpenRouter, Groq, DeepSeek, Together, Ollama/LM Studio lokal — apa pun yang meniru /chat/completions.',
    contohUrl: 'https://api.openai.com/v1',
    contohModel: 'gpt-4o-mini',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    keterangan: 'API resmi Anthropic.',
    contohUrl: 'https://api.anthropic.com',
    contohModel: 'claude-sonnet-4-20250514',
  },
  gemini: {
    label: 'Google Gemini',
    keterangan: 'Google AI Studio / Generative Language API.',
    contohUrl: 'https://generativelanguage.googleapis.com',
    contohModel: 'gemini-2.0-flash',
  },
};

// ------------------------------------------------------------------ simpanan
async function semua() {
  const ids = await db.anggotaHimpunan(DAFTAR);
  if (!ids.length) return [];
  return (await db.ambilBanyak(ids.map(KUNCI))).filter(Boolean);
}

async function ambil(penyediaId) {
  return db.ambil(KUNCI(penyediaId));
}

/* Bentuk yang aman dikirim ke tampilan: kunci diganti tanda bintang dan hanya
   empat huruf terakhirnya ditampilkan, supaya superadmin masih bisa mengenali
   kunci mana yang terpasang tanpa kuncinya ikut terkirim ke browser. */
function amankan(p) {
  if (!p) return null;
  const k = String(p.kunci || '');
  return {
    ...p,
    kunci: undefined,
    kunciTerpasang: Boolean(k),
    kunciEkor: k ? k.slice(-4) : '',
  };
}

async function daftarAman() {
  const aktif = await db.ambil(AKTIF);
  return {
    baris: (await semua()).map(amankan).sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id')),
    aktif: aktif || '',
    bentuk: BENTUK,
  };
}

function bersihkanUrl(u) {
  const s = bersihkanTeks(u, 200).trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) throw new util.GalatAplikasi('Alamat provider harus diawali http:// atau https://');
  return s;
}

async function simpan(data, pengguna) {
  const lama = data.id ? await ambil(data.id) : null;
  if (data.id && !lama) throw new util.GalatAplikasi('Provider tidak ditemukan', 404);

  const bentuk = BENTUK[data.bentuk] ? data.bentuk : (lama ? lama.bentuk : 'openai');
  const nama = bersihkanTeks(data.nama, 60) || (lama ? lama.nama : '');
  if (!nama) throw new util.GalatAplikasi('Nama provider wajib diisi.');

  const url = data.url !== undefined ? bersihkanUrl(data.url) : (lama ? lama.url : '');
  if (!url) throw new util.GalatAplikasi('Alamat (base URL) provider wajib diisi.');

  /* Kunci: string kosong berarti "jangan ubah", bukan "hapus". Mengosongkan
     kotak isian saat menyunting nama provider tidak boleh diam-diam mencabut
     kuncinya — kalau mau dicabut, ada tombolnya sendiri. */
  let kunci = lama ? lama.kunci : '';
  if (typeof data.kunci === 'string' && data.kunci.trim()) kunci = data.kunci.trim();
  if (data.cabutKunci === true) kunci = '';

  const p = {
    id: lama ? lama.id : id('pv_'),
    nama,
    bentuk,
    url,
    kunci,
    model: bersihkanTeks(data.model, 80) || (lama ? lama.model : '') || BENTUK[bentuk].contohModel,
    suhu: Math.max(0, Math.min(2, Number(data.suhu !== undefined ? data.suhu : (lama ? lama.suhu : 0.4)) || 0)),
    maksToken: Math.max(64, Math.min(32000, Number(data.maksToken !== undefined ? data.maksToken : (lama ? lama.maksToken : 2048)) || 2048)),
    catatan: bersihkanTeks(data.catatan, 300),
    dibuat: lama ? lama.dibuat : sekarang(),
    diubah: sekarang(),
    olehNama: pengguna ? pengguna.nama : '',
  };
  await db.simpan(KUNCI(p.id), p);
  await db.tambahKeHimpunan(DAFTAR, p.id);

  /* Provider pertama otomatis jadi yang aktif — kalau tidak, superadmin
     menambahkan provider lalu bertanya-tanya kenapa chat masih bilang
     "belum ada provider". */
  if (!(await db.ambil(AKTIF))) await db.simpan(AKTIF, p.id);
  return amankan(p);
}

async function hapus(penyediaId) {
  const p = await ambil(penyediaId);
  if (!p) throw new util.GalatAplikasi('Provider tidak ditemukan', 404);
  await db.hapus(KUNCI(penyediaId));
  await db.keluarDariHimpunan(DAFTAR, penyediaId);
  if ((await db.ambil(AKTIF)) === penyediaId) {
    const sisa = await semua();
    await db.simpan(AKTIF, sisa.length ? sisa[0].id : '');
  }
  return p;
}

async function aturAktif(penyediaId) {
  const p = await ambil(penyediaId);
  if (!p) throw new util.GalatAplikasi('Provider tidak ditemukan', 404);
  await db.simpan(AKTIF, penyediaId);
  return amankan(p);
}

/* Provider yang dipakai percakapan: yang diminta, atau yang sedang aktif. */
async function untukDipakai(penyediaId) {
  if (penyediaId) {
    const p = await ambil(penyediaId);
    if (p) return p;
  }
  const aktifId = await db.ambil(AKTIF);
  if (aktifId) {
    const p = await ambil(aktifId);
    if (p) return p;
  }
  const sisa = await semua();
  return sisa[0] || null;
}

// ------------------------------------------------------------------ adapter
/* Pembaca SSE yang sama untuk ketiga bentuk. Balasan datang sebagai potongan
   byte yang TIDAK selalu berhenti tepat di akhir baris, jadi sisa potongan
   disimpan dan disambung ke potongan berikutnya. Tanpa itu, satu token
   sesekali hilang atau JSON-nya gagal diurai di tengah kalimat. */
async function bacaSSE(res, saatBaris) {
  const pembaca = res.body.getReader();
  const dekoder = new TextDecoder();
  let sisa = '';
  for (;;) {
    const { done, value } = await pembaca.read();
    if (done) break;
    sisa += dekoder.decode(value, { stream: true });
    let n;
    while ((n = sisa.indexOf('\n')) >= 0) {
      const baris = sisa.slice(0, n).replace(/\r$/, '');
      sisa = sisa.slice(n + 1);
      if (baris) await saatBaris(baris);
    }
  }
  if (sisa.trim()) await saatBaris(sisa.trim());
}

function dataDari(baris) {
  if (!baris.startsWith('data:')) return null;
  const isi = baris.slice(5).trim();
  if (!isi || isi === '[DONE]') return isi === '[DONE]' ? '[DONE]' : null;
  try { return JSON.parse(isi); } catch (_) { return null; }
}

async function pastikanOk(res, nama) {
  if (res.ok) return;
  let teks = '';
  try { teks = await res.text(); } catch (_) {}
  /* Pesan galat provider sering memuat kunci atau jejak internal. Dipangkas,
     dan yang dikirim ke tampilan cukup kode + potongan pendeknya. */
  let ringkas = teks.slice(0, 300);
  try {
    const j = JSON.parse(teks);
    ringkas = (j.error && (j.error.message || j.error.type)) || j.message || ringkas;
  } catch (_) { /* biarkan apa adanya */ }
  throw new util.GalatAplikasi(`${nama} menolak (${res.status}): ${String(ringkas).slice(0, 220)}`, 502);
}

/* Satu bentuk pemanggilan untuk ketiganya.
   pesan: [{peran:'user'|'assistant', isi}]  — peran 'system' TIDAK dicampur ke
   sini; ia dikirim lewat medan sistem tersendiri karena Anthropic dan Gemini
   memang memisahkannya, dan mencampurnya membuat jawaban ketiganya berbeda. */
async function aliran(p, { sistem, pesan, suhu, maksToken, sinyal }, onToken) {
  const t = {
    openai: aliranOpenAI, anthropic: aliranAnthropic, gemini: aliranGemini,
  }[p.bentuk];
  if (!t) throw new util.GalatAplikasi(`Bentuk provider tidak dikenal: ${p.bentuk}`);
  return t(p, {
    sistem: String(sistem || ''),
    pesan: pesan || [],
    suhu: suhu !== undefined ? suhu : p.suhu,
    maksToken: maksToken || p.maksToken,
    sinyal,
  }, onToken);
}

async function aliranOpenAI(p, o, onToken) {
  const pesan = [];
  if (o.sistem) pesan.push({ role: 'system', content: o.sistem });
  for (const m of o.pesan) pesan.push({ role: m.peran === 'assistant' ? 'assistant' : 'user', content: m.isi });

  const res = await fetch(`${p.url}/chat/completions`, {
    method: 'POST',
    signal: o.sinyal,
    headers: {
      'Content-Type': 'application/json',
      ...(p.kunci ? { Authorization: `Bearer ${p.kunci}` } : {}),
    },
    body: JSON.stringify({
      model: p.model, messages: pesan, stream: true,
      temperature: o.suhu, max_tokens: o.maksToken,
      stream_options: { include_usage: true },
    }),
  });
  await pastikanOk(res, p.nama);

  let masuk = 0, keluar = 0;
  await bacaSSE(res, async (baris) => {
    const d = dataDari(baris);
    if (!d || d === '[DONE]') return;
    const teks = d.choices && d.choices[0] && d.choices[0].delta && d.choices[0].delta.content;
    if (teks) await onToken(teks);
    if (d.usage) { masuk = d.usage.prompt_tokens || masuk; keluar = d.usage.completion_tokens || keluar; }
  });
  return { masuk, keluar };
}

async function aliranAnthropic(p, o, onToken) {
  const res = await fetch(`${p.url}/v1/messages`, {
    method: 'POST',
    signal: o.sinyal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.kunci || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: p.model,
      system: o.sistem || undefined,
      messages: o.pesan.map((m) => ({ role: m.peran === 'assistant' ? 'assistant' : 'user', content: m.isi })),
      max_tokens: o.maksToken, temperature: o.suhu, stream: true,
    }),
  });
  await pastikanOk(res, p.nama);

  let masuk = 0, keluar = 0;
  await bacaSSE(res, async (baris) => {
    const d = dataDari(baris);
    if (!d || d === '[DONE]') return;
    if (d.type === 'content_block_delta' && d.delta && d.delta.text) await onToken(d.delta.text);
    if (d.type === 'message_start' && d.message && d.message.usage) masuk = d.message.usage.input_tokens || masuk;
    if (d.type === 'message_delta' && d.usage) keluar = d.usage.output_tokens || keluar;
  });
  return { masuk, keluar };
}

async function aliranGemini(p, o, onToken) {
  const url = `${p.url}/v1beta/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    signal: o.sinyal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.kunci || '' },
    body: JSON.stringify({
      systemInstruction: o.sistem ? { parts: [{ text: o.sistem }] } : undefined,
      contents: o.pesan.map((m) => ({
        role: m.peran === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.isi }],
      })),
      generationConfig: { temperature: o.suhu, maxOutputTokens: o.maksToken },
    }),
  });
  await pastikanOk(res, p.nama);

  let masuk = 0, keluar = 0;
  await bacaSSE(res, async (baris) => {
    const d = dataDari(baris);
    if (!d || d === '[DONE]') return;
    const bagian = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
    if (bagian) for (const b of bagian) if (b.text) await onToken(b.text);
    if (d.usageMetadata) {
      masuk = d.usageMetadata.promptTokenCount || masuk;
      keluar = d.usageMetadata.candidatesTokenCount || keluar;
    }
  });
  return { masuk, keluar };
}

/* Uji cepat tanpa streaming — dipakai tombol "Uji sambungan". Sengaja memakai
   jalur yang SAMA dengan percakapan sungguhan, supaya "uji berhasil" berarti
   chatnya juga berhasil, bukan sekadar servernya hidup. */
async function uji(p) {
  let keluar = '';
  const mulai = Date.now();
  const pakai = await aliran(p, {
    sistem: 'Jawab sangat singkat dalam bahasa Indonesia.',
    pesan: [{ peran: 'user', isi: 'Sebutkan satu kata: "siap".' }],
    maksToken: 32,
  }, (t) => { keluar += t; });
  return { balasan: keluar.trim().slice(0, 200), ms: Date.now() - mulai, pakai };
}

module.exports = {
  KUNCI, DAFTAR, AKTIF, BENTUK,
  semua, ambil, amankan, daftarAman, simpan, hapus, aturAktif, untukDipakai,
  aliran, uji, bacaSSE, dataDari,
};
