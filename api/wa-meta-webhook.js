/**
 * api/wa-meta-webhook.js — penerima webhook Meta WhatsApp Business API.
 *
 * GET  /api/wa-meta-webhook — verifikasi webhook (hub.mode=subscribe, hub.verify_token, hub.challenge)
 * POST /api/wa-meta-webhook — status update (sent → delivered → read → failed)
 *
 * Meta menandatangani body dengan X-Hub-Signature-256 (HMAC SHA-256 dari App Secret).
 * Kalau App Secret belum diset, verifikasi dilewati (aman asal verify_token cukup kuat).
 */
'use strict';

const crypto = require('crypto');
const wa = require('./_wa.js');

module.exports = async (req, res) => {
  // --- GET: verifikasi webhook subscription ---
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x');
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode !== 'subscribe') { res.status(403).send('Forbidden'); return; }
    const m = await wa.konfMeta();
    if (!m.webhookVerifyToken) { res.status(500).send('Webhook verify token belum diset di Setelan'); return; }
    if (token !== m.webhookVerifyToken) { res.status(403).send('Verify token tidak cocok'); return; }
    res.status(200).send(challenge || 'ok');
    return;
  }

  // --- POST: status update ---
  if (req.method !== 'POST') { res.status(405).json({ __error: 'Method not allowed' }); return; }

  // verifikasi signature kalau App Secret ada
  const m = await wa.konfMeta();
  const appSecret = (process.env.WA_APP_SECRET || '').trim();
  if (appSecret) {
    const sig = req.headers['x-hub-signature-256'] || '';
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
    if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      console.warn('[wa-meta-webhook] signature tidak cocok');
      res.status(401).json({ __error: 'Signature invalid' });
      return;
    }
  }

  let payload = req.body;
  try {
    if (typeof payload === 'string') payload = JSON.parse(payload || '{}');
    else if (payload == null) payload = {};
  } catch (e) { res.status(200).json({ ok: false }); return; }

  try {
    const ringkasan = await wa.prosesWebhookMeta(payload);
    await wa.catatLogWebhook(payload, { sumber: 'meta', ringkasan: ringkasan });
    res.status(200).json({ ok: true, ringkasan: ringkasan });
  } catch (e) {
    console.error('[wa-meta-webhook] gagal proses:', e);
    res.status(200).json({ ok: false });
  }
};
