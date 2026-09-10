/**
 * api/wa-webhook.js — penerima webhook Fonnte (status pesan & balasan STOP).
 *
 * GET|POST /api/wa-webhook?kunci=<FONNTE_WEBHOOK_SECRET>
 *
 * Pasang URL ini di dashboard Fonnte pada "Update Message Status" dan
 * "Reply Message". Fonnte tidak menandatangani permintaannya, jadi keasliannya
 * dijaga rahasia di query string. Tidak menyentuh basis data lembaga.
 */
'use strict';

const wa = require('./_wa.js');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const cek = await wa.verifikasiKunci(url.searchParams);

  if (req.method === 'GET') {
    if (!cek.sah) { res.status(401).json({ __error: cek.alasan }); return; }
    res.status(200).json({ ok: true, pesan: 'Webhook Fonnte siap. Pasang URL ini (beserta ?kunci=) di dashboard Fonnte.' });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ __error: 'Method not allowed' }); return; }
  if (!cek.sah) { console.warn('[wa-webhook] ditolak:', cek.alasan); res.status(401).json({ __error: 'Kunci tidak sah' }); return; }

  let payload = req.body;
  try {
    if (typeof payload === 'string') payload = JSON.parse(payload || '{}');
    else if (payload == null) payload = {};
  } catch (e) { res.status(400).json({ __error: 'Badan tidak terbaca' }); return; }

  try {
    const ringkasan = await wa.prosesWebhookFonnte(payload);
    const rk = Object.assign({}, ringkasan); delete rk.kampanye;
    await wa.catatLogWebhook(payload, { sumber: 'fonnte', ringkasan: rk });
    res.status(200).json({ ok: true, ringkasan: ringkasan });
  } catch (e) {
    // Tetap balas 200 supaya Fonnte tidak mengulang-ulang; catat di log server.
    console.error('[wa-webhook] gagal proses:', e);
    res.status(200).json({ ok: false });
  }
};
