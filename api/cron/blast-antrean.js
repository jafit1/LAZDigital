// api/cron/antrean.js — pemroses antrean yang dipanggil Vercel Cron tiap menit
//
// Dilindungi CRON_SECRET. Vercel mengirim header Authorization: Bearer <CRON_SECRET>
// pada cron bawaannya; pemanggilan manual bisa memakai ?kunci=<CRON_SECRET>.

const { prosesAntrean } = require('../../lib/blast/antrean');
const { sukses, gagal, bandingAman } = require('../../lib/blast/util');

module.exports = async function penangan(req, res) {
  const rahasia = process.env.CRON_SECRET || '';
  if (rahasia) {
    const dariHeader = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
    const url = new URL(req.url, 'http://x');
    const dariUrl = url.searchParams.get('kunci') || '';
    if (!bandingAman(dariHeader, rahasia) && !bandingAman(dariUrl, rahasia)) {
      return gagal(res, 401, 'Kunci cron tidak sah');
    }
  }

  try {
    // Sisakan waktu supaya fungsi tidak ditebas batas waktu Vercel
    const laporan = await prosesAntrean(20000);
    return sukses(res, { laporan, waktu: new Date().toISOString() });
  } catch (e) {
    console.error('[cron] gagal memproses antrean:', e);
    return gagal(res, 500, e.message || 'Gagal memproses antrean');
  }
};
