/**
 * api/wa-dispatch.js — pengirim antrean broadcast.
 *
 * GET|POST /api/wa-dispatch
 *
 * Diizinkan bila salah satu:
 *   - header "Authorization: Bearer <CRON_SECRET>"  (Vercel Cron / cron pihak ke-3)
 *   - body.token = laz_token milik admin yang punya izin broadcast (tombol dashboard)
 *
 * Satu putaran bekerja s.d. WA_DISPATCH_BUDGET_SECONDS lalu, bila antrean
 * masih ada & sempat mengirim, memanggil dirinya sendiri (rantai) — supaya
 * kampanye panjang lanjut tanpa cron per menit. Kunci dispatcher mencegah dobel.
 */
'use strict';

const engine = require('./_engine.js');
const rpc = require('./rpc.js');
const wa = require('./_wa.js');

function samaAman(a, b) {
  const crypto = require('crypto');
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = async (req, res) => {
  const c = wa.cfg();
  let body = req.body; try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  body = body || {};
  const url = new URL(req.url, 'http://x');

  const header = String(req.headers['authorization'] || '');
  const bearer = header.indexOf('Bearer ') === 0 ? header.slice(7) : '';
  let lewatCron = !!c.cronSecret && samaAman(bearer, c.cronSecret);

  if (!lewatCron) {
    // Jalur admin: verifikasi token broadcast
    const token = body.token || url.searchParams.get('token') || '';
    try {
      const r = await rpc._internal.muat();
      engine.cekIzin(r.db, token, 'broadcast', 'create', {});
    } catch (e) {
      res.status(401).json({ __error: 'Tidak berwenang menjalankan pengiriman.' });
      return;
    }
  }

  const budget = Math.min(Number(url.searchParams.get('detik') || c.rate.budgetSeconds), 55);
  const mulai = Date.now();
  let hasil;
  try {
    hasil = await wa.jalankanDispatcher({ budgetMs: budget * 1000, log: (p) => console.log('[wa-dispatch]', p) });
  } catch (e) {
    res.status(500).json({ __error: (e && e.message) || String(e) });
    return;
  }

  // rantai otomatis
  const rantai = Number(url.searchParams.get('rantai') || 0);
  let rantaiBerikut = false;
  const adaSisa = (hasil.antrean && hasil.antrean.total) > 0;
  const adaKemajuan = ((hasil.hitungan && hasil.hitungan.terkirim) || 0) + ((hasil.hitungan && hasil.hitungan.gagal) || 0) > 0;
  if (!hasil.dilewati && adaSisa && adaKemajuan && rantai < c.rate.maxRantai && c.cronSecret) {
    const proto = (req.headers['x-forwarded-proto'] || 'https');
    const host = req.headers['host'];
    if (host) {
      const next = proto + '://' + host + '/api/wa-dispatch?rantai=' + (rantai + 1) + '&detik=' + budget;
      fetch(next, { method: 'POST', headers: { Authorization: 'Bearer ' + c.cronSecret } }).catch(() => {});
      rantaiBerikut = true;
    }
  }

  res.status(200).json({ result: Object.assign({}, hasil, { lamaMs: Date.now() - mulai, pemicu: lewatCron ? 'cron' : 'admin', rantai: rantai, rantaiBerikut: rantaiBerikut }) });
};
