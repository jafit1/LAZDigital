/**
 * api/_wa.js — INTI fitur WhatsApp Broadcast untuk LAZDigital (CommonJS).
 *
 * Berdiri sendiri dari basis data utama LAZDigital: seluruh datanya di kunci
 * Redis berawalan "wab:" (BUKAN di blob laz:db), jadi banjir webhook status
 * tidak pernah menulis ulang basis data lembaga dan tidak bentrok dengan
 * petugas yang sedang mencatat.
 *
 * Dipakai oleh: api/wa.js (RPC), api/wa-dispatch.js (pengirim), api/wa-webhook.js.
 *
 * Pengirim bisa ditukar lewat env PENGIRIM = 'fonnte' (gateway) atau 'meta'
 * (Cloud API resmi). Anti-spam: jeda acak antar pesan, jam kirim, batas harian.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ================================================================== *
 * KONFIGURASI (dari env)
 * ================================================================== */
function num(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; }

function cfg() {
  return {
    prefix: process.env.WA_PREFIX || 'wab',
    pengirim: (process.env.PENGIRIM || 'fonnte').toLowerCase(),
    fonnte: {
      token: process.env.FONNTE_TOKEN || '',
      baseUrl: (process.env.FONNTE_BASE_URL || 'https://api.fonnte.com').replace(/\/+$/, ''),
      countryCode: process.env.FONNTE_COUNTRY_CODE || '62',
      typing: String(process.env.FONNTE_TYPING || 'true').toLowerCase() !== 'false',
      webhookSecret: process.env.FONNTE_WEBHOOK_SECRET || '',
    },
    meta: {
      token: process.env.WA_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WA_PHONE_NUMBER_ID || '',
      wabaId: process.env.WA_BUSINESS_ACCOUNT_ID || '',
      graphVersion: process.env.WA_GRAPH_VERSION || 'v24.0',
      graphBaseUrl: (process.env.WA_GRAPH_BASE_URL || 'https://graph.facebook.com').replace(/\/+$/, ''),
    },
    rate: {
      jedaMin: Number(process.env.WA_JEDA_MIN_DETIK != null ? process.env.WA_JEDA_MIN_DETIK : 10),
      jedaMax: Number(process.env.WA_JEDA_MAX_DETIK != null ? process.env.WA_JEDA_MAX_DETIK : 20),
      maxAttempts: num(process.env.WA_MAX_ATTEMPTS, 4),
      budgetSeconds: num(process.env.WA_DISPATCH_BUDGET_SECONDS, 45),
      maxRantai: num(process.env.WA_MAX_RANTAI, 20),
    },
    antispam: {
      jamAktif: String(process.env.WA_JAM_KIRIM_AKTIF != null ? process.env.WA_JAM_KIRIM_AKTIF : 'true').toLowerCase() !== 'false',
      jamMulai: process.env.WA_JAM_MULAI || '08:00',
      jamSelesai: process.env.WA_JAM_SELESAI || '20:00',
      batasHarian: num(process.env.WA_BATAS_HARIAN, 0),
    },
    cronSecret: process.env.CRON_SECRET || '',
    dryRun: String(process.env.WA_DRY_RUN || '').toLowerCase() === 'true',
  };
}

/* ================================================================== *
 * PENYIMPANAN — Upstash REST (produksi) atau berkas lokal (tanpa Redis)
 * ================================================================== */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PAKAI_REDIS = !!(REDIS_URL && REDIS_TOKEN);

async function redisCmd(argv) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(argv.map((x) => (x === undefined || x === null ? '' : String(x)))),
    cache: 'no-store',
  });
  const teks = await res.text();
  let j = null;
  try { j = JSON.parse(teks); } catch (e) { throw new Error('Redis balasan tak valid: ' + teks.slice(0, 120)); }
  if (!res.ok || (j && j.error)) throw new Error('Redis gagal: ' + ((j && j.error) || res.status));
  return j.result;
}

/* ---- berkas lokal (mode tanpa Redis) ---- */
const FILE = path.join(process.cwd(), 'data', 'wab-local.json');
let MEM = null, tulisTimer = null;
function muatMem() {
  if (MEM) return MEM;
  MEM = { s: {}, exp: {} };
  try { if (fs.existsSync(FILE)) MEM = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  if (!MEM.s) MEM.s = {}; if (!MEM.exp) MEM.exp = {};
  return MEM;
}
function simpanMem() {
  if (tulisTimer) return;
  tulisTimer = setTimeout(() => {
    tulisTimer = null;
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(MEM)); } catch (e) {}
  }, 100);
  if (tulisTimer.unref) tulisTimer.unref();
}
function hidupMem(key) {
  const m = muatMem();
  if (m.exp[key] && m.exp[key] <= Date.now()) { delete m.s[key]; delete m.exp[key]; }
  return m.s[key];
}

/* ---- antarmuka store seragam ---- */
const store = {
  async ping() { return PAKAI_REDIS ? redisCmd(['PING']) : 'PONG'; },
  async get(k) { if (PAKAI_REDIS) return redisCmd(['GET', k]); const v = hidupMem(k); return v == null ? null : v; },
  async set(k, v, opt) {
    opt = opt || {};
    if (PAKAI_REDIS) {
      const c = ['SET', k, String(v)];
      if (opt.ttl) c.push('EX', opt.ttl);
      if (opt.nx) c.push('NX');
      return (await redisCmd(c)) === 'OK';
    }
    const m = muatMem();
    if (opt.nx && hidupMem(k) != null) return false;
    m.s[k] = String(v);
    if (opt.ttl) m.exp[k] = Date.now() + opt.ttl * 1000; else if (!opt.keepTtl) delete m.exp[k];
    simpanMem(); return true;
  },
  async del() {
    const keys = Array.prototype.slice.call(arguments).flat();
    if (PAKAI_REDIS) return keys.length ? redisCmd(['DEL'].concat(keys)) : 0;
    const m = muatMem(); let n = 0; keys.forEach((k) => { if (m.s[k] != null) { delete m.s[k]; delete m.exp[k]; n++; } }); simpanMem(); return n;
  },
  async mget(keys) {
    if (!keys.length) return [];
    if (PAKAI_REDIS) return redisCmd(['MGET'].concat(keys));
    return keys.map((k) => { const v = hidupMem(k); return v == null ? null : v; });
  },
  async incrby(k, by) {
    if (PAKAI_REDIS) return redisCmd(['INCRBY', k, by || 1]);
    const m = muatMem(); const n = (Number(hidupMem(k)) || 0) + (by || 1); m.s[k] = String(n); simpanMem(); return n;
  },
  async expire(k, ttl) {
    if (PAKAI_REDIS) return (await redisCmd(['EXPIRE', k, ttl])) === 1;
    const m = muatMem(); if (hidupMem(k) == null) return false; m.exp[k] = Date.now() + ttl * 1000; simpanMem(); return true;
  },
  async hset(k, obj) {
    const flat = []; Object.keys(obj).forEach((f) => { flat.push(f, String(obj[f])); });
    if (!flat.length) return true;
    if (PAKAI_REDIS) { await redisCmd(['HSET', k].concat(flat)); return true; }
    const m = muatMem(); const h = JSON.parse(hidupMem(k) || '{}'); Object.keys(obj).forEach((f) => { h[f] = String(obj[f]); }); m.s[k] = JSON.stringify(h); simpanMem(); return true;
  },
  async hgetall(k) {
    if (PAKAI_REDIS) {
      const r = await redisCmd(['HGETALL', k]); if (!r) return {};
      if (Array.isArray(r)) { const o = {}; for (let i = 0; i < r.length; i += 2) o[r[i]] = r[i + 1]; return o; }
      return r;
    }
    return JSON.parse(hidupMem(k) || '{}');
  },
  async hincrby(k, f, by) {
    if (PAKAI_REDIS) return redisCmd(['HINCRBY', k, f, by || 1]);
    const m = muatMem(); const h = JSON.parse(hidupMem(k) || '{}'); h[f] = String((Number(h[f]) || 0) + (by || 1)); m.s[k] = JSON.stringify(h); simpanMem(); return Number(h[f]);
  },
  async rpush(k) {
    const vals = Array.prototype.slice.call(arguments, 1).flat().map(String);
    if (!vals.length) return 0;
    if (PAKAI_REDIS) return redisCmd(['RPUSH', k].concat(vals));
    const m = muatMem(); const a = JSON.parse(hidupMem(k) || '[]'); a.push.apply(a, vals); m.s[k] = JSON.stringify(a); simpanMem(); return a.length;
  },
  async lpush(k) {
    const vals = Array.prototype.slice.call(arguments, 1).flat().map(String);
    if (!vals.length) return 0;
    if (PAKAI_REDIS) return redisCmd(['LPUSH', k].concat(vals));
    const m = muatMem(); const a = JSON.parse(hidupMem(k) || '[]'); a.unshift.apply(a, vals); m.s[k] = JSON.stringify(a); simpanMem(); return a.length;
  },
  async lpop(k, count) {
    if (PAKAI_REDIS) { const r = await redisCmd(['LPOP', k, count || 1]); return r == null ? [] : (Array.isArray(r) ? r : [r]); }
    const m = muatMem(); const a = JSON.parse(hidupMem(k) || '[]'); const out = a.splice(0, count || 1); m.s[k] = JSON.stringify(a); simpanMem(); return out;
  },
  async lrange(k, s, e) {
    if (PAKAI_REDIS) return (await redisCmd(['LRANGE', k, s, e])) || [];
    const a = JSON.parse(hidupMem(k) || '[]'); const n = a.length;
    let i = s < 0 ? Math.max(n + s, 0) : s, j = e < 0 ? n + e : Math.min(e, n - 1);
    return j < i ? [] : a.slice(i, j + 1);
  },
  async llen(k) {
    if (PAKAI_REDIS) return (await redisCmd(['LLEN', k])) || 0;
    return JSON.parse(hidupMem(k) || '[]').length;
  },
  async ltrim(k, s, e) {
    if (PAKAI_REDIS) { await redisCmd(['LTRIM', k, s, e]); return true; }
    const a = await this.lrange(k, s, e); const m = muatMem(); m.s[k] = JSON.stringify(a); simpanMem(); return true;
  },
  async zadd(k, entries) {
    if (!entries.length) return true;
    if (PAKAI_REDIS) { const flat = []; entries.forEach((e) => flat.push(e.score, e.member)); await redisCmd(['ZADD', k].concat(flat)); return true; }
    const m = muatMem(); const a = JSON.parse(hidupMem(k) || '[]');
    entries.forEach((e) => { const i = a.findIndex((x) => x.member === String(e.member)); if (i >= 0) a[i].score = Number(e.score); else a.push({ member: String(e.member), score: Number(e.score) }); });
    a.sort((x, y) => x.score - y.score || x.member.localeCompare(y.member)); m.s[k] = JSON.stringify(a); simpanMem(); return true;
  },
  async zrangebyscore(k, min, max, limit) {
    if (PAKAI_REDIS) { const c = ['ZRANGEBYSCORE', k, min, max]; if (limit) c.push('LIMIT', 0, limit); return (await redisCmd(c)) || []; }
    const a = JSON.parse(hidupMem(k) || '[]'); let r = a.filter((x) => x.score >= min && x.score <= max).map((x) => x.member); if (limit) r = r.slice(0, limit); return r;
  },
  async zrange(k, s, e, opt) {
    opt = opt || {};
    if (PAKAI_REDIS) { const c = ['ZRANGE', k, s, e]; if (opt.rev) c.push('REV'); return (await redisCmd(c)) || []; }
    let a = JSON.parse(hidupMem(k) || '[]'); if (opt.rev) a = a.slice().reverse();
    const n = a.length; let i = s < 0 ? Math.max(n + s, 0) : s, j = e < 0 ? n + e : Math.min(e, n - 1);
    return j < i ? [] : a.slice(i, j + 1).map((x) => x.member);
  },
  async zrem(k) {
    const members = Array.prototype.slice.call(arguments, 1).flat().map(String);
    if (PAKAI_REDIS) return members.length ? redisCmd(['ZREM', k].concat(members)) : 0;
    const m = muatMem(); const a = JSON.parse(hidupMem(k) || '[]'); const buang = new Set(members); const sisa = a.filter((x) => !buang.has(x.member)); m.s[k] = JSON.stringify(sisa); simpanMem(); return a.length - sisa.length;
  },
  async zcard(k) { if (PAKAI_REDIS) return (await redisCmd(['ZCARD', k])) || 0; return JSON.parse(hidupMem(k) || '[]').length; },
  async sadd(k) {
    const members = Array.prototype.slice.call(arguments, 1).flat().map(String);
    if (PAKAI_REDIS) return members.length ? redisCmd(['SADD', k].concat(members)) : 0;
    const m = muatMem(); const set = new Set(JSON.parse(hidupMem(k) || '[]')); let n = 0; members.forEach((x) => { if (!set.has(x)) { set.add(x); n++; } }); m.s[k] = JSON.stringify([...set]); simpanMem(); return n;
  },
  async srem(k) {
    const members = Array.prototype.slice.call(arguments, 1).flat().map(String);
    if (PAKAI_REDIS) return members.length ? redisCmd(['SREM', k].concat(members)) : 0;
    const m = muatMem(); const set = new Set(JSON.parse(hidupMem(k) || '[]')); let n = 0; members.forEach((x) => { if (set.delete(x)) n++; }); m.s[k] = JSON.stringify([...set]); simpanMem(); return n;
  },
  async sismember(k, mm) { if (PAKAI_REDIS) return (await redisCmd(['SISMEMBER', k, mm])) === 1; return new Set(JSON.parse(hidupMem(k) || '[]')).has(String(mm)); },
  async smembers(k) { if (PAKAI_REDIS) return (await redisCmd(['SMEMBERS', k])) || []; return JSON.parse(hidupMem(k) || '[]'); },
};

const P = () => cfg().prefix;
const K = {
  kampanye: (id) => `${P()}:kampanye:${id}`,
  indeksKampanye: () => `${P()}:kampanye:indeks`,
  statKampanye: (id) => `${P()}:kampanye:${id}:stat`,
  penerima: (kid, rid) => `${P()}:penerima:${kid}:${rid}`,
  daftarPenerima: (kid) => `${P()}:penerima:${kid}:daftar`,
  antrean: () => `${P()}:antrean`,
  antreanTertunda: () => `${P()}:antrean:tunda`,
  kunciDispatch: () => `${P()}:kunci:dispatch`,
  jedaGlobal: () => `${P()}:jeda-global`,
  jedaNomor: (t) => `${P()}:jeda:${t}`,
  wamid: (id) => `${P()}:wamid:${id}`,
  optout: () => `${P()}:optout`,
  kontak: (id) => `${P()}:kontak:${id}`,
  indeksKontak: () => `${P()}:kontak:indeks`,
  pesan: (id) => `${P()}:pesan:${id}`,
  indeksPesan: () => `${P()}:pesan:indeks`,
  setelan: () => `${P()}:setelan`,
  kirimHarian: (tgl) => `${P()}:kirim-harian:${tgl}`,
  logWebhook: () => `${P()}:log:webhook`,
  daftarKontak: (id) => `${P()}:daftar-kontak:${id}`,
  indeksDaftarKontak: () => `${P()}:daftar-kontak:indeks`,
};

async function getJson(k) { const v = await store.get(k); if (v == null || v === '') return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return null; } }
async function setJson(k, v, opt) { return store.set(k, JSON.stringify(v), opt); }
async function mgetJson(keys) { if (!keys.length) return []; const r = await store.mget(keys); return r.map((v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return null; } }); }

/* ================================================================== *
 * UTIL
 * ================================================================== */
function buatId(prefix) { return (prefix || '') + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function tidur(ms) { return new Promise((r) => setTimeout(r, ms)); }
function potong(s, n) { s = String(s == null ? '' : s); return s.length > (n || 500) ? s.slice(0, n || 500) + '…' : s; }
function bagi(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }
function samaAman(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a)), bb = Buffer.from(String(b == null ? '' : b));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}
function normalisasiTelepon(mentah, kode) {
  kode = kode || '62';
  if (mentah == null) return { ok: false, alasan: 'kosong' };
  let s = String(mentah).trim(); if (!s) return { ok: false, alasan: 'kosong' };
  s = s.replace(/[\s\-().]/g, '');
  if (/e\+?\d+$/i.test(s)) return { ok: false, alasan: 'terbaca notasi ilmiah Excel, format kolom sebagai teks' };
  if (s[0] === '+') s = s.slice(1);
  if (s.slice(0, 2) === '00') s = s.slice(2);
  if (!/^\d+$/.test(s)) return { ok: false, alasan: 'ada karakter bukan angka' };
  if (s[0] === '0') s = kode + s.slice(1);
  else if (s.slice(0, kode.length) !== kode && s.length <= 12) s = kode + s;
  if (s.length < 8 || s.length > 15) return { ok: false, alasan: 'panjang nomor tidak wajar (' + s.length + ' digit)' };
  return { ok: true, telepon: s };
}
async function petaBerbatas(items, batas, fn) {
  const hasil = new Array(items.length); let idx = 0;
  const pekerja = new Array(Math.min(batas, items.length)).fill(0).map(async () => {
    while (true) { const i = idx++; if (i >= items.length) return; hasil[i] = await fn(items[i], i); }
  });
  await Promise.all(pekerja); return hasil;
}

/* ================================================================== *
 * KONTAK — CSV / TSV / tempelan teks (tanpa dependensi)
 * ================================================================== */
function bacaDelimited(teks, pemisah) {
  const bersih = String(teks).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!pemisah) {
    const baris0 = bersih.split('\n')[0] || '';
    const kand = [[';', (baris0.match(/;/g) || []).length], ['\t', (baris0.match(/\t/g) || []).length], [',', (baris0.match(/,/g) || []).length]];
    kand.sort((a, b) => b[1] - a[1]); pemisah = kand[0][1] > 0 ? kand[0][0] : ',';
  }
  const baris = []; let sel = '', row = [], quot = false;
  for (let i = 0; i < bersih.length; i++) {
    const ch = bersih[i];
    if (quot) { if (ch === '"') { if (bersih[i + 1] === '"') { sel += '"'; i++; } else quot = false; } else sel += ch; continue; }
    if (ch === '"') { quot = true; continue; }
    if (ch === pemisah) { row.push(sel); sel = ''; continue; }
    if (ch === '\n') { row.push(sel); baris.push(row); row = []; sel = ''; continue; }
    sel += ch;
  }
  row.push(sel); baris.push(row);
  return baris.filter((r) => r.some((c) => String(c).trim() !== ''));
}
const KATA_TELP = ['telepon', 'telp', 'nohp', 'nohp', 'hp', 'wa', 'whatsapp', 'phone', 'nomor', 'msisdn'];
function nk(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function petakanKontak(matriks, opsi) {
  opsi = opsi || {};
  if (!matriks || !matriks.length) return { header: [], adaHeader: false, kolomTelepon: 0, headerParameter: [], baris: [], ditolak: [] };
  const norm0 = matriks[0].map(nk);
  const adaHeader = norm0.some((sel) => KATA_TELP.some((kata) => sel.indexOf(nk(kata)) >= 0));
  const header = adaHeader ? matriks[0].map((x, i) => String(x).trim() || ('kolom' + (i + 1))) : matriks[0].map((_, i) => 'kolom' + (i + 1));
  const isi = adaHeader ? matriks.slice(1) : matriks;
  let kolomTelepon = 0;
  if (Number.isInteger(opsi.kolomTelepon)) kolomTelepon = opsi.kolomTelepon;
  else { const nm = header.map(nk); for (const kata of KATA_TELP) { const i = nm.findIndex((s) => s === nk(kata)); if (i >= 0) { kolomTelepon = i; break; } } }
  const baris = [], ditolak = [], ada = new Map();
  isi.forEach((row, idx) => {
    const nb = idx + (adaHeader ? 2 : 1);
    const h = normalisasiTelepon(row[kolomTelepon], opsi.kodeNegara || '62');
    if (!h.ok) { ditolak.push({ baris: nb, isi: String(row[kolomTelepon] == null ? '' : row[kolomTelepon]), alasan: h.alasan }); return; }
    if (ada.has(h.telepon)) { ditolak.push({ baris: nb, isi: h.telepon, alasan: 'kembar dengan baris ' + ada.get(h.telepon) }); return; }
    ada.set(h.telepon, nb);
    const params = row.filter((_, i) => i !== kolomTelepon).map((x) => String(x == null ? '' : x).trim());
    baris.push({ telepon: h.telepon, params: params });
  });
  const headerParameter = header.filter((_, i) => i !== kolomTelepon);
  return { header, adaHeader, kolomTelepon, headerParameter, baris, ditolak };
}

/* ================================================================== *
 * PLACEHOLDER & PESAN
 * ================================================================== */
const RE_PH = /\{\{?\s*([a-zA-Z0-9_ ]+?)\s*\}?\}/g;
function ambilPlaceholder(teks) { const out = []; let m; RE_PH.lastIndex = 0; while ((m = RE_PH.exec(String(teks || '')))) { const n = m[1].trim(); if (n && out.indexOf(n) < 0) out.push(n); } return out; }
function isiPlaceholder(teks, nilai) {
  const peta = new Map(); Object.keys(nilai || {}).forEach((k) => peta.set(nk(k), nilai[k]));
  return String(teks || '').replace(RE_PH, (utuh, nama) => { const v = peta.get(nk(nama)); return (v === undefined || v === null || String(v).trim() === '') ? utuh : String(v); });
}
function periksaPesan(teks, opsi) {
  opsi = opsi || {}; const galat = [], peringatan = []; const isi = String(teks || '');
  const ph = ambilPlaceholder(isi);
  if (!isi.trim()) galat.push('Isi pesan masih kosong.');
  if (isi.length > 60000) galat.push('Isi pesan melebihi 60.000 karakter.');
  const kolom = opsi.kolomTersedia || [];
  if (kolom.length) { const ada = new Set(kolom.map(nk)); const yatim = ph.filter((p) => !ada.has(nk(p))); if (yatim.length) galat.push('Placeholder tanpa pasangan kolom: ' + yatim.map((y) => '{' + y + '}').join(', ') + '. Kolom tersedia: ' + kolom.join(', ') + '.'); }
  if (!/berhenti|stop|unsubscribe/i.test(isi)) peringatan.push('Belum ada cara berhenti. Tambahkan "Balas STOP untuk berhenti" agar tidak mudah diblokir.');
  return { sah: galat.length === 0, galat, peringatan, placeholder: ph };
}

/* ================================================================== *
 * SETELAN ANTI-SPAM (jam kirim & batas harian)
 * ================================================================== */
const OFFSET_WIB = 7 * 60;
function bawaanSetelan() {
  const k = cfg(); const c = k.antispam;
  return {
    platform: k.pengirim,
    jamKirimAktif: c.jamAktif, jamMulai: c.jamMulai, jamSelesai: c.jamSelesai, batasHarian: c.batasHarian,
    jedaMin: k.rate.jedaMin, jedaMax: k.rate.jedaMax,
    fonnteToken: k.fonnte.token, kodeNegara: k.fonnte.countryCode, typing: k.fonnte.typing, webhookSecret: k.fonnte.webhookSecret,
    metaAccessToken: k.meta.token, metaPhoneNumberId: k.meta.phoneNumberId, metaWabaId: k.meta.wabaId,
    metaWebhookVerifyToken: '', metaAppId: '',
  };
}
// Konfigurasi Fonnte efektif: nilai dari Setelan (dashboard) menimpa env.
async function konfFonnte() { const c = cfg(); let s = {}; try { s = await getSetelan(); } catch (e) {} return { token: s.fonnteToken || c.fonnte.token, baseUrl: c.fonnte.baseUrl, countryCode: s.kodeNegara || c.fonnte.countryCode, typing: (s.typing !== undefined ? !!s.typing : c.fonnte.typing), webhookSecret: s.webhookSecret || c.fonnte.webhookSecret }; }
// Konfigurasi Meta efektif: nilai dari Setelan (dashboard) menimpa env.
async function konfMeta() { const c = cfg(); let s = {}; try { s = await getSetelan(); } catch (e) {} return { token: s.metaAccessToken || c.meta.token, phoneNumberId: s.metaPhoneNumberId || c.meta.phoneNumberId, wabaId: s.metaWabaId || c.meta.wabaId, webhookVerifyToken: s.metaWebhookVerifyToken || '', appId: s.metaAppId || c.meta.appId || '', graphVersion: c.meta.graphVersion, graphBaseUrl: c.meta.graphBaseUrl }; }
// Platform aktif: dari Setelan, fallback ke env PENGIRIM.
async function platformAktif() { let s = {}; try { s = await getSetelan(); } catch (e) {} return s.platform || cfg().pengirim; }
async function getSetelan() { const t = (await getJson(K.setelan())) || {}; return Object.assign(bawaanSetelan(), t); }
function bersihkanJam(v, fb) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); if (!m) return fb; return String(Math.min(23, +m[1])).padStart(2, '0') + ':' + String(Math.min(59, +m[2])).padStart(2, '0'); }
async function simpanSetelan(patch) {
  const s = await getSetelan();
  const baru = {
    platform: (patch.platform === 'meta' || patch.platform === 'fonnte') ? patch.platform : s.platform,
    jamKirimAktif: patch.jamKirimAktif !== undefined ? !!patch.jamKirimAktif : s.jamKirimAktif,
    jamMulai: bersihkanJam(patch.jamMulai, s.jamMulai),
    jamSelesai: bersihkanJam(patch.jamSelesai, s.jamSelesai),
    batasHarian: Number.isFinite(Number(patch.batasHarian)) ? Math.max(0, Math.floor(Number(patch.batasHarian))) : s.batasHarian,
    jedaMin: Number.isFinite(Number(patch.jedaMin)) ? Math.max(0, Math.min(600, Math.floor(Number(patch.jedaMin)))) : s.jedaMin,
    jedaMax: Number.isFinite(Number(patch.jedaMax)) ? Math.max(0, Math.min(600, Math.floor(Number(patch.jedaMax)))) : s.jedaMax,
    fonnteToken: (typeof patch.fonnteToken === 'string' && patch.fonnteToken.trim()) ? patch.fonnteToken.trim() : s.fonnteToken,
    kodeNegara: (patch.kodeNegara != null && String(patch.kodeNegara).replace(/\D/g, '')) ? String(patch.kodeNegara).replace(/\D/g, '') : s.kodeNegara,
    typing: patch.typing !== undefined ? !!patch.typing : s.typing,
    webhookSecret: (typeof patch.webhookSecret === 'string' && patch.webhookSecret.trim()) ? patch.webhookSecret.trim() : s.webhookSecret,
    metaAccessToken: (typeof patch.metaAccessToken === 'string' && patch.metaAccessToken.trim()) ? patch.metaAccessToken.trim() : s.metaAccessToken,
    metaPhoneNumberId: (typeof patch.metaPhoneNumberId === 'string' && patch.metaPhoneNumberId.trim()) ? patch.metaPhoneNumberId.trim() : s.metaPhoneNumberId,
    metaWabaId: (typeof patch.metaWabaId === 'string' && patch.metaWabaId.trim()) ? patch.metaWabaId.trim() : s.metaWabaId,
    metaWebhookVerifyToken: (typeof patch.metaWebhookVerifyToken === 'string' && patch.metaWebhookVerifyToken.trim()) ? patch.metaWebhookVerifyToken.trim() : s.metaWebhookVerifyToken,
    metaAppId: (typeof patch.metaAppId === 'string' && patch.metaAppId.trim()) ? patch.metaAppId.trim() : s.metaAppId,
  };
  if (baru.jedaMax < baru.jedaMin) baru.jedaMax = baru.jedaMin;
  await setJson(K.setelan(), baru); return baru;
}
function menitWIB(ms) { const w = new Date(ms + OFFSET_WIB * 60000); return w.getUTCHours() * 60 + w.getUTCMinutes(); }
function tanggalWIB(ms) { return new Date((ms || Date.now()) + OFFSET_WIB * 60000).toISOString().slice(0, 10); }
function keMenit(j) { const p = j.split(':'); return (+p[0]) * 60 + (+p[1]); }
function msJamWIB(dasar, jamMenit, tambahHari) {
  const w = new Date(dasar + OFFSET_WIB * 60000); w.setUTCHours(0, 0, 0, 0);
  const tengahUtc = w.getTime() - OFFSET_WIB * 60000;
  return tengahUtc + ((tambahHari || 0) * 1440 + jamMenit) * 60000;
}
function periksaJamKirim(s, ms) {
  ms = ms || Date.now(); if (!s.jamKirimAktif) return { boleh: true };
  const mulai = keMenit(s.jamMulai), selesai = keMenit(s.jamSelesai), kini = menitWIB(ms);
  if (mulai <= selesai) {
    if (kini >= mulai && kini < selesai) return { boleh: true };
    const siap = kini < mulai ? msJamWIB(ms, mulai, 0) : msJamWIB(ms, mulai, 1);
    return { boleh: false, siapPadaMs: siap, alasan: 'di luar jam kirim (' + s.jamMulai + '–' + s.jamSelesai + ' WIB)' };
  }
  if (kini >= mulai || kini < selesai) return { boleh: true };
  return { boleh: false, siapPadaMs: msJamWIB(ms, mulai, 0), alasan: 'di luar jam kirim' };
}
async function terkirimHariIni(ms) { return Number((await store.get(K.kirimHarian(tanggalWIB(ms)))) || 0); }
async function catatKirimHarian(ms) { const k = K.kirimHarian(tanggalWIB(ms)); const n = await store.incrby(k, 1); if (n === 1) await store.expire(k, 172800); return n; }
async function periksaBatasHarian(s, ms) {
  ms = ms || Date.now(); if (!s.batasHarian || s.batasHarian <= 0) return { boleh: true };
  if ((await terkirimHariIni(ms)) < s.batasHarian) return { boleh: true };
  const jamMulai = s.jamKirimAktif ? keMenit(s.jamMulai) : 0;
  return { boleh: false, siapPadaMs: msJamWIB(ms, jamMulai, 1), alasan: 'batas harian ' + s.batasHarian + ' pesan tercapai' };
}

/* ================================================================== *
 * PENGIRIM — Fonnte & Meta
 * ================================================================== */
async function kirimFonnte(opsi) {
  const c = cfg(); const f = await konfFonnte();
  if (c.dryRun) return { ok: true, wamid: 'fonnte.DRYRUN-' + buatId(), mentah: { dryRun: true } };
  if (!f.token) return { ok: false, kelas: 'tahan', pesan: 'Token Fonnte belum diisi (atur di tab Setelan)', jedaDetik: 0, mentah: null };
  const teks = String(opsi.teks || '').trim();
  if (!teks && !opsi.lampiranUrl) return { ok: false, kelas: 'permanen', pesan: 'Isi pesan kosong', jedaDetik: 0, mentah: null };
  const body = { target: String(opsi.to), message: teks, countryCode: f.countryCode, typing: f.typing, connectOnly: true, sequence: true };
  if (opsi.lampiranUrl) { body.url = opsi.lampiranUrl; if (opsi.lampiranNama) body.filename = opsi.lampiranNama; }
  let res, teksRes, json;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 25000);
    res = await fetch(f.baseUrl + '/send', { method: 'POST', headers: { Authorization: f.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    clearTimeout(t); teksRes = await res.text(); try { json = JSON.parse(teksRes); } catch (e) {}
  } catch (e) {
    return { ok: false, kelas: 'sementara', pesan: 'Gangguan jaringan ke Fonnte: ' + (e.name === 'AbortError' ? 'waktu tunggu habis' : e.message), jedaDetik: 10, mentah: null };
  }
  const id = json && (Array.isArray(json.id) ? json.id[0] : json.id);
  if (res.ok && json && json.status === true && id) return { ok: true, wamid: 'fonnte:' + id, mentah: json };
  return Object.assign({ ok: false, mentah: json || potong(teksRes, 300) }, golongkanFonnte(res ? res.status : 0, json, teksRes));
}
function golongkanFonnte(status, json, teks) {
  const alasan = String((json && (json.reason || json.detail)) || potong(teks, 200) || 'tanpa keterangan');
  const tahan = [[/token invalid|unauthorized/i, 'Token Fonnte tidak sah'], [/quota|kuota/i, 'Kuota Fonnte habis'], [/expired|kedaluwarsa/i, 'Masa aktif perangkat berakhir'], [/disconnect|not connected/i, 'Perangkat terputus — scan ulang QR di Fonnte'], [/banned|blocked|diblokir/i, 'Nomor diblokir WhatsApp']];
  for (const t of tahan) if (t[0].test(alasan)) return { kelas: 'tahan', kode: null, pesan: t[1] + ' (' + alasan + ')', jedaDetik: 0 };
  const smt = [[/url unreachable/i, 20], [/rate|too many|limit/i, 60], [/pending|process/i, 15]];
  for (const s of smt) if (s[0].test(alasan)) return { kelas: 'sementara', kode: null, pesan: alasan, jedaDetik: s[1] };
  if (status === 429) return { kelas: 'sementara', kode: 429, pesan: 'Dibatasi laju (429): ' + alasan, jedaDetik: 45 };
  if (status >= 500) return { kelas: 'sementara', kode: status, pesan: 'Fonnte HTTP ' + status, jedaDetik: 20 };
  return { kelas: 'permanen', kode: null, pesan: alasan, jedaDetik: 0 };
}
async function infoFonnte() {
  const f = await konfFonnte(); if (!f.token) throw new Error('Token Fonnte belum diisi (atur di tab Setelan)');
  const res = await fetch(f.baseUrl + '/device', { method: 'POST', headers: { Authorization: f.token, 'Content-Type': 'application/json' }, body: '{}' });
  const json = await res.json().catch(() => null);
  if (!res.ok || (json && json.status === false)) throw new Error((json && json.reason) || ('HTTP ' + res.status));
  const d = (json && (json.data || json)) || {};
  return { jenis: 'fonnte', nomor: d.device || null, nama: d.name || null, paket: d.package || null, tersambung: String(d.device_status || '').toLowerCase().indexOf('connect') === 0, kuota: Number.isFinite(Number(d.quota)) ? Number(d.quota) : null, kedaluwarsa: d.expired || null, mentah: json };
}
/* Meta — template atau teks bebas (kalau platform=meta). */
async function kirimMeta(opsi) {
  const c = cfg(); const m = await konfMeta();
  if (c.dryRun) return { ok: true, wamid: 'wamid.DRYRUN-' + buatId(), mentah: { dryRun: true } };
  if (!m.token || !m.phoneNumberId) return { ok: false, kelas: 'tahan', pesan: 'Meta Access Token / Phone Number ID belum diisi (atur di Setelan)', jedaDetik: 0, mentah: null };
  const url = m.graphBaseUrl + '/' + m.graphVersion + '/' + m.phoneNumberId + '/messages';
  let payload;
  if (opsi.namaTemplate) {
    // mode template
    const comps = [];
    if (opsi.paramBody && opsi.paramBody.length) comps.push({ type: 'body', parameters: opsi.paramBody.map((v) => ({ type: 'text', text: String(v || '-').slice(0, 1024) })) });
    payload = { messaging_product: 'whatsapp', to: String(opsi.to), type: 'template', template: { name: opsi.namaTemplate, language: { code: opsi.bahasa || 'id' } } };
    if (comps.length) payload.template.components = comps;
  } else {
    // mode teks bebas
    const teks = String(opsi.teks || '').trim();
    if (!teks && !opsi.lampiranUrl) return { ok: false, kelas: 'permanen', pesan: 'Isi pesan kosong', jedaDetik: 0, mentah: null };
    if (opsi.lampiranUrl) {
      // kirim dokumen/gambar
      const ext = String(opsi.lampiranUrl).split('.').pop().toLowerCase();
      const mimeMap = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
      const mime = mimeMap[ext] || 'application/octet-stream';
      const tipe = ['jpg','jpeg','png'].includes(ext) ? 'image' : (ext === 'mp4' ? 'video' : 'document');
      payload = { messaging_product: 'whatsapp', to: String(opsi.to), type: tipe };
      payload[tipe] = { link: opsi.lampiranUrl };
      if (tipe === 'document' && opsi.lampiranNama) payload[tipe].filename = opsi.lampiranNama;
      if (teks) payload[tipe].caption = teks;
    } else {
      payload = { messaging_product: 'whatsapp', to: String(opsi.to), type: 'text', text: { body: teks } };
    }
  }
  let res, json, teks;
  try {
    res = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + m.token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    teks = await res.text(); try { json = JSON.parse(teks); } catch (e) {}
  } catch (e) { return { ok: false, kelas: 'sementara', pesan: 'Gangguan jaringan ke Meta: ' + e.message, jedaDetik: 5, mentah: null }; }
  if (res.ok && json && json.messages && json.messages[0]) return { ok: true, wamid: json.messages[0].id, mentah: json };
  const err = (json && json.error) || {};
  const kelas = (res.status >= 500 || res.status === 429) ? 'sementara' : 'permanen';
  return { ok: false, kelas, kode: err.code || null, pesan: (err.error_data && err.error_data.details) || err.message || ('HTTP ' + res.status), jedaDetik: kelas === 'sementara' ? 30 : 0, mentah: json };
}
async function pakaiPesanBebas() { return (await platformAktif()) !== 'meta' || !!(await konfMeta()).token; }
async function kirim(opsi) { return (await platformAktif()) === 'meta' ? kirimMeta(opsi) : kirimFonnte(opsi); }
async function infoPengirim() {
  if ((await platformAktif()) === 'meta') return infoMeta();
  return infoFonnte();
}
async function infoMeta() {
  const m = await konfMeta();
  if (!m.token || !m.phoneNumberId) return { jenis: 'meta', nomor: null, nama: null, paket: null, tersambung: false, kuota: null, kedaluwarsa: null, alasan: 'Access Token / Phone Number ID belum diisi', mentah: null };
  try {
    const res = await fetch(m.graphBaseUrl + '/' + m.graphVersion + '/' + m.phoneNumberId + '?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier', { headers: { Authorization: 'Bearer ' + m.token } });
    const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
    return { jenis: 'meta', nomor: j.display_phone_number || null, nama: j.verified_name || null, paket: j.messaging_limit_tier || null, tersambung: true, kualitas: j.quality_rating || null, kuota: null, kedaluwarsa: null, mentah: j };
  } catch (e) {
    return { jenis: 'meta', nomor: null, nama: null, paket: null, tersambung: false, kuota: null, kedaluwarsa: null, alasan: e.message, mentah: null };
  }
}

/* ================================================================== *
 * KAMPANYE
 * ================================================================== */
const ST_PENERIMA = { ANTRE: 'antre', TERKIRIM: 'terkirim', DITERIMA: 'diterima', DIBACA: 'dibaca', GAGAL: 'gagal', DILEWATI: 'dilewati', DIBATALKAN: 'dibatalkan' };
const TINGKAT = { antre: 0, dilewati: 1, dibatalkan: 1, terkirim: 2, diterima: 3, dibaca: 4, gagal: 5 };
const ST_KAMPANYE = { BERJALAN: 'berjalan', DITAHAN: 'ditahan', SELESAI: 'selesai', DIBATALKAN: 'dibatalkan' };

async function saringOptout(daftar) { const semua = new Set(await store.smembers(K.optout())); const tertolak = daftar.filter((t) => semua.has(t)); return { tertolak }; }

async function buatKampanye(o) {
  const kid = buatId('k_'); const now = Date.now(); const mode = o.mode === 'template' ? 'template' : 'pesan';
  const { tertolak } = await saringOptout(o.penerima.map((p) => p.telepon)); const setT = new Set(tertolak);
  const kampanye = {
    id: kid, nama: o.nama || ('Broadcast ' + new Date(now).toLocaleString('id-ID')),
    status: o.langsungJalan === false ? ST_KAMPANYE.DITAHAN : ST_KAMPANYE.BERJALAN,
    mode, pengirim: o.pengirim || cfg().pengirim,
    pesan: mode === 'pesan' ? { teks: String(o.pesan.teks || ''), lampiranUrl: o.pesan.lampiranUrl || null, lampiranNama: o.pesan.lampiranNama || null, pesanId: o.pesan.pesanId || null } : null,
    template: mode === 'template' ? { nama: o.template.nama, bahasa: o.template.bahasa, kategori: o.template.kategori || null, variabel: o.template.variabel || [] } : null,
    dibuatOleh: o.dibuatOleh || 'admin', dibuatPada: now, diperbaruiPada: now, jumlahPenerima: o.penerima.length, catatanTahan: null,
  };
  const rows = [], pekerjaan = [];
  o.penerima.forEach((p, i) => {
    const rid = String(i + 1).padStart(6, '0'); const dilewati = setT.has(p.telepon);
    rows.push({ id: rid, kid, telepon: p.telepon, nama: p.nama || null, params: p.params || [], kolom: mode === 'pesan' ? (p.kolom || {}) : null, bernama: null, status: dilewati ? ST_PENERIMA.DILEWATI : ST_PENERIMA.ANTRE, wamid: null, coba: 0, kodeGalat: null, pesanGalat: dilewati ? 'Nomor ada di daftar tolak kirim' : null, waktu: { dibuat: now, dikirim: null, diterima: null, dibaca: null, gagal: dilewati ? now : null } });
    if (!dilewati) pekerjaan.push({ kid, rid, telepon: p.telepon, coba: 0 });
  });
  await setJson(K.kampanye(kid), kampanye);
  await store.zadd(K.indeksKampanye(), [{ member: kid, score: now }]);
  for (const grup of bagi(rows, 80)) { await Promise.all(grup.map((r) => setJson(K.penerima(kid, r.id), r))); await store.rpush(K.daftarPenerima(kid), grup.map((r) => r.id)); }
  const dilewatiN = rows.filter((r) => r.status === ST_PENERIMA.DILEWATI).length;
  await store.hset(K.statKampanye(kid), { total: rows.length, antre: rows.length - dilewatiN, terkirim: 0, diterima: 0, dibaca: 0, gagal: 0, dilewati: dilewatiN, dibatalkan: 0 });
  if (kampanye.status === ST_KAMPANYE.BERJALAN && pekerjaan.length) for (const g of bagi(pekerjaan, 200)) await store.rpush(K.antrean(), g.map((x) => JSON.stringify(x)));
  return { kampanye, jumlahDilewati: dilewatiN, jumlahAntre: pekerjaan.length };
}
async function ambilStat(kid) {
  const h = await store.hgetall(K.statKampanye(kid)); const g = (x) => Number(h[x] || 0);
  const s = { total: g('total'), antre: g('antre'), terkirim: g('terkirim'), diterima: g('diterima'), dibaca: g('dibaca'), gagal: g('gagal'), dilewati: g('dilewati'), dibatalkan: g('dibatalkan') };
  s.selesai = s.terkirim + s.diterima + s.dibaca + s.gagal + s.dilewati + s.dibatalkan;
  s.persen = s.total > 0 ? Math.round((s.selesai / s.total) * 100) : 0; return s;
}
async function ambilKampanye(kid) { return getJson(K.kampanye(kid)); }
async function daftarKampanye(limit) {
  const ids = await store.zrange(K.indeksKampanye(), 0, (limit || 30) - 1, { rev: true }); if (!ids.length) return [];
  const list = await mgetJson(ids.map((id) => K.kampanye(id))); const out = [];
  for (let i = 0; i < ids.length; i++) if (list[i]) out.push(Object.assign({}, list[i], { stat: await ambilStat(ids[i]) }));
  return out;
}
async function daftarPenerima(kid, opsi) {
  opsi = opsi || {}; const s = await store; const kunci = K.daftarPenerima(kid);
  const semua = await store.lrange(kunci, 0, -1);
  let ids = semua;
  const limit = opsi.limit || 200, offset = opsi.offset || 0;
  let baris = await mgetJson(ids.map((rid) => K.penerima(kid, rid)));
  baris = baris.filter(Boolean);
  if (opsi.status) baris = baris.filter((b) => b.status === opsi.status);
  const total = baris.length;
  return { total, baris: baris.slice(offset, offset + limit) };
}
async function ubahStatusPenerima(kid, rid, statusBaru, tambahan, opsi) {
  tambahan = tambahan || {}; opsi = opsi || {};
  const kunci = K.penerima(kid, rid); const baris = await getJson(kunci); if (!baris) return null;
  const lama = baris.status; const turun = TINGKAT[statusBaru] !== undefined && TINGKAT[lama] !== undefined && TINGKAT[statusBaru] <= TINGKAT[lama];
  if (!opsi.paksa && turun) { if (Object.keys(tambahan).length) { Object.assign(baris, tambahan, { waktu: Object.assign({}, baris.waktu, tambahan.waktu || {}) }); await setJson(kunci, baris); } return baris; }
  const waktu = Object.assign({}, baris.waktu, tambahan.waktu || {});
  Object.assign(baris, tambahan, { status: statusBaru, waktu });
  await setJson(kunci, baris);
  if (lama !== statusBaru) { await store.hincrby(K.statKampanye(kid), lama, -1); await store.hincrby(K.statKampanye(kid), statusBaru, 1); }
  return baris;
}
async function catatWamid(wamid, kid, rid) { await store.set(K.wamid(wamid), kid + ':' + rid, { ttl: 2592000 }); }
async function cariWamid(wamid) { const v = await store.get(K.wamid(wamid)); if (!v) return null; const p = String(v).split(':'); return p[0] && p[1] ? { kid: p[0], rid: p[1] } : null; }
async function simpanKampanye(k) { k.diperbaruiPada = Date.now(); await setJson(K.kampanye(k.id), k); return k; }
async function buangPekerjaanKampanye(kid) {
  const siap = await store.lrange(K.antrean(), 0, -1); const sisa = siap.filter((m) => { try { return JSON.parse(m).kid !== kid; } catch (e) { return false; } });
  if (sisa.length !== siap.length) { await store.del(K.antrean()); if (sisa.length) await store.rpush(K.antrean(), sisa); }
  const tunda = await store.zrange(K.antreanTertunda(), 0, -1); const buang = tunda.filter((m) => { try { return JSON.parse(m).kid === kid; } catch (e) { return true; } });
  if (buang.length) await store.zrem(K.antreanTertunda(), buang);
}
async function aksiKampanye(kid, aksi) {
  const k = await ambilKampanye(kid); if (!k) return null;
  if (aksi === 'tahan') { if (k.status === ST_KAMPANYE.SELESAI || k.status === ST_KAMPANYE.DIBATALKAN) return k; k.status = ST_KAMPANYE.DITAHAN; k.catatanTahan = 'Ditahan manual'; return simpanKampanye(k); }
  if (aksi === 'batalkan') {
    k.status = ST_KAMPANYE.DIBATALKAN; await simpanKampanye(k); await buangPekerjaanKampanye(kid);
    const ids = await store.lrange(K.daftarPenerima(kid), 0, -1);
    for (const g of bagi(ids, 100)) { const rows = await mgetJson(g.map((rid) => K.penerima(kid, rid))); for (const r of rows) if (r && r.status === ST_PENERIMA.ANTRE) await ubahStatusPenerima(kid, r.id, ST_PENERIMA.DIBATALKAN, { pesanGalat: 'Kampanye dibatalkan' }, { paksa: true }); }
    return k;
  }
  if (aksi === 'lanjutkan') {
    if (k.status !== ST_KAMPANYE.DITAHAN) return k; k.status = ST_KAMPANYE.BERJALAN; k.catatanTahan = null; await simpanKampanye(k);
    await buangPekerjaanKampanye(kid); const ids = await store.lrange(K.daftarPenerima(kid), 0, -1); const pk = [];
    for (const g of bagi(ids, 100)) { const rows = await mgetJson(g.map((rid) => K.penerima(kid, rid))); for (const r of rows) if (r && r.status === ST_PENERIMA.ANTRE) pk.push({ kid, rid: r.id, telepon: r.telepon, coba: r.coba || 0 }); }
    for (const g of bagi(pk, 200)) await store.rpush(K.antrean(), g.map((x) => JSON.stringify(x))); return k;
  }
  if (aksi === 'ulangi-gagal') {
    const ids = await store.lrange(K.daftarPenerima(kid), 0, -1); const pk = [];
    for (const g of bagi(ids, 100)) { const rows = await mgetJson(g.map((rid) => K.penerima(kid, rid))); for (const r of rows) if (r && r.status === ST_PENERIMA.GAGAL) { await ubahStatusPenerima(kid, r.id, ST_PENERIMA.ANTRE, { coba: 0, kodeGalat: null, pesanGalat: null }, { paksa: true }); pk.push({ kid, rid: r.id, telepon: r.telepon, coba: 0 }); } }
    if (pk.length) { k.status = ST_KAMPANYE.BERJALAN; k.catatanTahan = null; await simpanKampanye(k); for (const g of bagi(pk, 200)) await store.rpush(K.antrean(), g.map((x) => JSON.stringify(x))); }
    return k;
  }
  return k;
}
async function tahanKampanye(kid, catatan) { const k = await ambilKampanye(kid); if (!k) return; if (k.status === ST_KAMPANYE.SELESAI || k.status === ST_KAMPANYE.DIBATALKAN) return; k.status = ST_KAMPANYE.DITAHAN; k.catatanTahan = catatan; await simpanKampanye(k); }
async function segarkanSelesai(kid) { const k = await ambilKampanye(kid); if (!k || k.status !== ST_KAMPANYE.BERJALAN) return; const s = await ambilStat(kid); if (s.antre <= 0) { k.status = ST_KAMPANYE.SELESAI; k.selesaiPada = Date.now(); await simpanKampanye(k); } }

/* ================================================================== *
 * DISPATCHER
 * ================================================================== */
function siapkanPengiriman(k, baris) {
  if (k.mode === 'pesan') {
    const p = k.pesan || {}; const nilai = Object.assign({}, baris.kolom || {}, { telepon: baris.telepon, nama: (baris.kolom && baris.kolom.nama) || baris.nama || '' });
    return { to: baris.telepon, teks: isiPlaceholder(p.teks, nilai), lampiranUrl: p.lampiranUrl || null, lampiranNama: p.lampiranNama || null };
  }
  const t = k.template || {}; const jml = (t.variabel || []).length;
  return { to: baris.telepon, namaTemplate: t.nama, bahasa: t.bahasa, paramBody: jml ? (baris.params || []).slice(0, jml) : [] };
}
function backoff(coba, dasar) { const d = Math.max(dasar || 5, 1); const e = Math.min(d * Math.pow(2, Math.max(coba - 1, 0)), 600); return Math.round((e + Math.random() * Math.min(e * 0.2, 15)) * 1000); }

async function prosesSatu(pekerjaan, log) {
  const c = cfg(); const kid = pekerjaan.kid, rid = pekerjaan.rid;
  const k = await ambilKampanye(kid); if (!k) return 'dilewati';
  if (k.status !== ST_KAMPANYE.BERJALAN) return 'dilewati';
  const baris = await getJson(K.penerima(kid, rid)); if (!baris || baris.status !== ST_PENERIMA.ANTRE) return 'dilewati';

  const setelan = await getSetelan();
  const jam = periksaJamKirim(setelan); if (!jam.boleh) { await store.zadd(K.antreanTertunda(), [{ member: JSON.stringify(pekerjaan), score: jam.siapPadaMs }]); return 'ditunda'; }
  const harian = await periksaBatasHarian(setelan); if (!harian.boleh) { await store.zadd(K.antreanTertunda(), [{ member: JSON.stringify(pekerjaan), score: harian.siapPadaMs }]); return 'ditunda'; }

  // jeda per nomor (6 detik)
  const bolehNomor = await store.set(K.jedaNomor(baris.telepon), '1', { nx: true, ttl: 6 });
  if (!bolehNomor) { await store.zadd(K.antreanTertunda(), [{ member: JSON.stringify(pekerjaan), score: Date.now() + 6000 }]); return 'ditunda'; }

  // jeda acak antar pesan (anti-spam utama) — diatur dari dashboard (Setelan)
  const jMin = Number.isFinite(setelan.jedaMin) ? setelan.jedaMin : c.rate.jedaMin;
  const jMax = Number.isFinite(setelan.jedaMax) ? setelan.jedaMax : c.rate.jedaMax;
  if (jMin > 0) {
    const detik = Math.max(1, Math.round(jMin + Math.random() * Math.max(jMax - jMin, 0)));
    const dapat = await store.set(K.jedaGlobal(), String(Date.now()), { nx: true, ttl: detik });
    if (!dapat) { await store.del(K.jedaNomor(baris.telepon)); await store.zadd(K.antreanTertunda(), [{ member: JSON.stringify(pekerjaan), score: Date.now() + Math.max(1000, (jMin / 2) * 1000) }]); return 'ditunda'; }
  }

  const hasil = await kirim(siapkanPengiriman(k, baris)); const coba = (pekerjaan.coba || 0) + 1;
  if (hasil.ok) {
    await catatKirimHarian(); await catatWamid(hasil.wamid, kid, rid);
    await ubahStatusPenerima(kid, rid, ST_PENERIMA.TERKIRIM, { wamid: hasil.wamid, coba, kodeGalat: null, pesanGalat: null, waktu: { dikirim: Date.now() } });
    return 'terkirim';
  }
  await store.del(K.jedaNomor(baris.telepon));
  if (hasil.kelas === 'tahan') { await tahanKampanye(kid, hasil.pesan + ' (kode ' + (hasil.kode || '-') + ')'); await store.zadd(K.antreanTertunda(), [{ member: JSON.stringify(pekerjaan), score: Date.now() + 60000 }]); if (log) log('KAMPANYE DITAHAN ' + kid + ': ' + hasil.pesan); return 'ditahan'; }
  if (hasil.kelas === 'sementara' && coba < c.rate.maxAttempts) {
    await ubahStatusPenerima(kid, rid, ST_PENERIMA.ANTRE, { coba, kodeGalat: hasil.kode, pesanGalat: 'Percobaan ' + coba + ' gagal (sementara): ' + hasil.pesan }, { paksa: true });
    await store.zadd(K.antreanTertunda(), [{ member: JSON.stringify(Object.assign({}, pekerjaan, { coba })), score: Date.now() + backoff(coba, hasil.jedaDetik) }]); return 'ditunda';
  }
  await ubahStatusPenerima(kid, rid, ST_PENERIMA.GAGAL, { coba, kodeGalat: hasil.kode, pesanGalat: hasil.pesan, waktu: { gagal: Date.now() } });
  if (log) log('GAGAL ' + rid + ' kode=' + (hasil.kode || '-') + ' ' + hasil.pesan); return 'gagal';
}

async function promosikanTertunda(batas) {
  const siap = await store.zrangebyscore(K.antreanTertunda(), 0, Date.now(), batas || 200); if (!siap.length) return 0;
  await store.rpush(K.antrean(), siap); await store.zrem(K.antreanTertunda(), siap); return siap.length;
}
async function ukuranAntrean() { const siap = await store.llen(K.antrean()); const tunda = await store.zcard(K.antreanTertunda()); return { siap, tunda, total: siap + tunda }; }

async function jalankanDispatcher(opsi) {
  opsi = opsi || {}; const c = cfg(); const budgetMs = opsi.budgetMs || c.rate.budgetSeconds * 1000; const tenggat = Date.now() + budgetMs; const log = opsi.log;
  const nilaiKunci = process.pid + '-' + Date.now();
  const dapat = await store.set(K.kunciDispatch(), nilaiKunci, { nx: true, ttl: Math.ceil(budgetMs / 1000) + 10 });
  if (!dapat) return { dilewati: true, alasan: 'Dispatcher lain sedang berjalan', hitungan: {} };
  const hitungan = { terkirim: 0, gagal: 0, ditunda: 0, dilewati: 0, ditahan: 0 }; const tersentuh = new Set();
  const setelanD = await getSetelan(); const jedaMinD = Number.isFinite(setelanD.jedaMin) ? setelanD.jedaMin : c.rate.jedaMin;
  const paralel = jedaMinD > 0 ? 1 : 3;
  try {
    while (Date.now() < tenggat) {
      await promosikanTertunda(500);
      const pk = await store.lpop(K.antrean(), paralel);
      const jobs = pk.map((m) => { try { return typeof m === 'string' ? JSON.parse(m) : m; } catch (e) { return null; } }).filter(Boolean);
      if (!jobs.length) { const u = await ukuranAntrean(); if (u.total === 0) break; await tidur(Math.min(1000, Math.max(tenggat - Date.now(), 0))); continue; }
      const hasil = await petaBerbatas(jobs, paralel, (p) => { tersentuh.add(p.kid); return prosesSatu(p, log); });
      hasil.forEach((h) => { hitungan[h] = (hitungan[h] || 0) + 1; });
      if (paralel === 1 && hasil[0] === 'terkirim' && Date.now() < tenggat) await tidur(Math.min((jedaMinD * 1000) / 2, Math.max(tenggat - Date.now(), 0)));
    }
  } finally { const skg = await store.get(K.kunciDispatch()); if (skg === nilaiKunci) await store.del(K.kunciDispatch()); }
  for (const kid of tersentuh) await segarkanSelesai(kid);
  return { dilewati: false, hitungan, antrean: await ukuranAntrean() };
}

/* ================================================================== *
 * WEBHOOK FONNTE
 * ================================================================== */
async function verifikasiKunci(searchParams) {
  const f = await konfFonnte(); if (!f.webhookSecret) return { sah: false, alasan: 'Kunci webhook belum diisi (atur di tab Setelan)' };
  const kunci = searchParams.get('kunci') || searchParams.get('key') || '';
  return samaAman(kunci, f.webhookSecret) ? { sah: true } : { sah: false, alasan: 'kunci tidak cocok' };
}
function petakanStatusFonnte() {
  const teks = Array.prototype.slice.call(arguments).filter(Boolean).join(' ').toLowerCase(); if (!teks) return null;
  if (/\b(read|dibaca|seen)\b/.test(teks)) return ST_PENERIMA.DIBACA;
  if (/\b(deliver|delivered|diterima|received)\b/.test(teks)) return ST_PENERIMA.DITERIMA;
  if (/\b(fail|failed|gagal|error|reject|rejected|expired)\b/.test(teks)) return ST_PENERIMA.GAGAL;
  if (/\b(sent|terkirim|success|server)\b/.test(teks)) return ST_PENERIMA.TERKIRIM;
  return null;
}
const KATA_BERHENTI = ['stop', 'berhenti', 'unsubscribe', 'batal langganan', 'jangan kirim'];
async function prosesWebhookFonnte(payload) {
  const ring = { status: 0, masuk: 0, optout: 0, takDikenal: 0, statusTakDikenal: [], kampanye: [] }; const kset = new Set();
  if (payload && payload.id !== undefined && (payload.status !== undefined || payload.state !== undefined)) {
    const st = petakanStatusFonnte(payload.status, payload.state);
    if (!st) ring.statusTakDikenal.push(potong('status=' + payload.status + ' state=' + payload.state, 120));
    else {
      const tgt = await cariWamid('fonnte:' + payload.id);
      if (!tgt) ring.takDikenal++;
      else {
        const now = Date.now(); const tmb = { waktu: {} };
        if (st === ST_PENERIMA.TERKIRIM) tmb.waktu.dikirim = now;
        if (st === ST_PENERIMA.DITERIMA) tmb.waktu.diterima = now;
        if (st === ST_PENERIMA.DIBACA) tmb.waktu.dibaca = now;
        if (st === ST_PENERIMA.GAGAL) { tmb.waktu.gagal = now; tmb.pesanGalat = potong('Fonnte gagal (status: ' + payload.status + ', state: ' + payload.state + ')', 300); }
        await ubahStatusPenerima(tgt.kid, tgt.rid, st, tmb); ring.status++; kset.add(tgt.kid);
      }
    }
  }
  const dari = payload && (payload.sender || payload.from || payload.pengirim);
  const isi = payload && (payload.message !== undefined ? payload.message : (payload.text !== undefined ? payload.text : payload.pesan));
  if (dari && isi !== undefined) {
    ring.masuk++; const teks = String(isi).trim().toLowerCase(); const h = normalisasiTelepon(dari, (await konfFonnte()).countryCode);
    if (h.ok && KATA_BERHENTI.some((kata) => teks === kata || teks.indexOf(kata) === 0)) { await store.sadd(K.optout(), [h.telepon]); ring.optout++; }
  }
  for (const kid of kset) await segarkanSelesai(kid);
  ring.kampanye = [...kset]; return ring;
}
async function catatLogWebhook(payload, catatan) {
  await store.rpush(K.logWebhook(), JSON.stringify(Object.assign({ pada: Date.now() }, catatan, { isi: potong(JSON.stringify(payload), 3000) })));
  await store.ltrim(K.logWebhook(), -100, -1);
}

/* ================================================================== *
 * WEBHOOK META (WhatsApp Business API)
 * ================================================================== */
const PETA_STATUS_META = { sent: ST_PENERIMA.TERKIRIM, delivered: ST_PENERIMA.DITERIMA, read: ST_PENERIMA.DIBACA, failed: ST_PENERIMA.GAGAL };
async function prosesWebhookMeta(payload) {
  const ring = { status: 0, takDikenal: 0, kampanye: [] }; const kset = new Set();
  if (!payload || !Array.isArray(payload.entry)) return ring;
  for (const entry of payload.entry) {
    if (!entry.changes || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      if (Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          const status = PETA_STATUS_META[st.status];
          if (!status) { ring.takDikenal++; continue; }
          const tgt = await cariWamid(st.id);
          if (!tgt) { ring.takDikenal++; continue; }
          const now = Date.now(); const tmb = { waktu: {} };
          if (status === ST_PENERIMA.TERKIRIM) tmb.waktu.dikirim = now;
          if (status === ST_PENERIMA.DITERIMA) tmb.waktu.diterima = now;
          if (status === ST_PENERIMA.DIBACA) tmb.waktu.dibaca = now;
          if (status === ST_PENERIMA.GAGAL) {
            tmb.waktu.gagal = now;
            if (st.errors && st.errors[0]) tmb.pesanGalat = potong('Meta error: ' + (st.errors[0].message || st.errors[0].code), 300);
          }
          await ubahStatusPenerima(tgt.kid, tgt.rid, status, tmb);
          ring.status++; kset.add(tgt.kid);
        }
      }
    }
  }
  for (const kid of kset) await segarkanSelesai(kid);
  ring.kampanye = [...kset]; return ring;
}

/* ================================================================== *
 * PESAN (pustaka)
 * ================================================================== */
async function simpanPesan(o) {
  const id = o.id || buatId('p_'); const now = Date.now(); const lama = o.id ? await getJson(K.pesan(o.id)) : null;
  const row = { id, nama: (String(o.nama || '').trim() || 'Tanpa nama'), teks: String(o.teks || ''), lampiranUrl: o.lampiranUrl || null, lampiranNama: o.lampiranNama || null, dibuat: (lama && lama.dibuat) || now, diperbarui: now, dipakai: (lama && lama.dipakai) || 0 };
  await setJson(K.pesan(id), row); await store.zadd(K.indeksPesan(), [{ member: id, score: now }]); return row;
}
async function daftarPesan() { const ids = await store.zrange(K.indeksPesan(), 0, 99, { rev: true }); if (!ids.length) return []; return (await mgetJson(ids.map((id) => K.pesan(id)))).filter(Boolean); }
async function hapusPesan(id) { await store.del(K.pesan(id)); await store.zrem(K.indeksPesan(), id); return true; }
async function catatPemakaian(id) { const r = await getJson(K.pesan(id)); if (!r) return; r.dipakai = (r.dipakai || 0) + 1; await setJson(K.pesan(id), r); }

/* ================================================================== *
 * OPT-OUT & KONTAK (buku kontak)
 * ================================================================== */
async function tambahOptout(list) { return list.length ? store.sadd(K.optout(), list) : 0; }
async function hapusOptout(list) { return list.length ? store.srem(K.optout(), list) : 0; }
async function daftarOptout() { return (await store.smembers(K.optout())).sort(); }

async function simpanKontak(o) {
  const h = normalisasiTelepon(o.telepon, (await konfFonnte()).countryCode); if (!h.ok) throw new Error('Nomor tidak sah: ' + h.alasan);
  const id = o.id || ('c_' + h.telepon); const now = Date.now(); const lama = await getJson(K.kontak(id));
  const row = { id, telepon: h.telepon, nama: o.nama || (lama && lama.nama) || null, label: o.label || (lama && lama.label) || [], kolom: o.kolom || (lama && lama.kolom) || {}, sumber: o.sumber || (lama && lama.sumber) || 'manual', dibuat: (lama && lama.dibuat) || now };
  await setJson(K.kontak(id), row); await store.zadd(K.indeksKontak(), [{ member: id, score: now }]); return row;
}
async function daftarKontak(limit) { const ids = await store.zrange(K.indeksKontak(), 0, (limit || 500) - 1, { rev: true }); if (!ids.length) return []; return (await mgetJson(ids.map((id) => K.kontak(id)))).filter(Boolean); }
async function hapusKontak(id) { await store.del(K.kontak(id)); await store.zrem(K.indeksKontak(), id); return true; }

/* ================================================================== *
 * DAFTAR KONTAK (grup/kelompok kontak bernama)
 * ================================================================== */
async function simpanDaftarKontak(o) {
  const id = o.id || buatId('dk_');
  const now = Date.now();
  const lama = o.id ? await getJson(K.daftarKontak(o.id)) : null;
  const baris = Array.isArray(o.baris) ? o.baris : [];
  const row = {
    id,
    nama: String(o.nama || '').trim() || 'Tanpa nama',
    deskripsi: o.deskripsi || null,
    header: o.header || [],
    headerParameter: o.headerParameter || [],
    jumlah: baris.length,
    baris: baris,
    dibuat: (lama && lama.dibuat) || now,
    diperbarui: now,
    dipakai: (lama && lama.dipakai) || 0,
  };
  await setJson(K.daftarKontak(id), row);
  await store.zadd(K.indeksDaftarKontak(), [{ member: id, score: now }]);
  return row;
}
async function daftarDaftarKontak(limit) {
  const ids = await store.zrange(K.indeksDaftarKontak(), 0, (limit || 100) - 1, { rev: true });
  if (!ids.length) return [];
  return (await mgetJson(ids.map((id) => K.daftarKontak(id)))).filter(Boolean);
}
async function ambilDaftarKontak(id) { return getJson(K.daftarKontak(id)); }
async function hapusDaftarKontak(id) { await store.del(K.daftarKontak(id)); await store.zrem(K.indeksDaftarKontak(), id); return true; }
async function catatPemakaianDaftar(id) { const r = await getJson(K.daftarKontak(id)); if (!r) return; r.dipakai = (r.dipakai || 0) + 1; await setJson(K.daftarKontak(id), r); }

module.exports = {
  cfg, store, K, PAKAI_REDIS,
  getJson, setJson, mgetJson,
  buatId, normalisasiTelepon, samaAman, tidur,
  bacaDelimited, petakanKontak,
  ambilPlaceholder, isiPlaceholder, periksaPesan,
  getSetelan, simpanSetelan, periksaJamKirim, periksaBatasHarian, terkirimHariIni, catatKirimHarian, tanggalWIB,
  platformAktif, konfFonnte, konfMeta, infoMeta, infoFonnte,
  kirim, infoPengirim, pakaiPesanBebas,
  buatKampanye, ambilKampanye, ambilStat, daftarKampanye, daftarPenerima, aksiKampanye, ubahStatusPenerima,
  jalankanDispatcher, ukuranAntrean, promosikanTertunda,
  verifikasiKunci, prosesWebhookFonnte, prosesWebhookMeta, catatLogWebhook,
  simpanPesan, daftarPesan, hapusPesan, catatPemakaian, ambilPesanById: (id) => getJson(K.pesan(id)),
  tambahOptout, hapusOptout, daftarOptout,
  simpanKontak, daftarKontak, hapusKontak,
  simpanDaftarKontak, daftarDaftarKontak, ambilDaftarKontak, hapusDaftarKontak, catatPemakaianDaftar,
  ST_PENERIMA, ST_KAMPANYE,
};
