// api/cron/antrean.js — pemroses antrean yang dipanggil Vercel Cron tiap menit
//
// Dilindungi CRON_SECRET. Vercel mengirim header Authorization: Bearer <CRON_SECRET>
// pada cron bawaannya; pemanggilan manual bisa memakai ?kunci=<CRON_SECRET>.

const { prosesAntrean } = require('../../lib/blast/antrean');
const { sukses, gagal, bandingAman } = require('../../lib/blast/util');

module.exports = async function penangan(req, res) {
  const rahasia = String(process.env.CRON_SECRET || '');

  /* CRON_SECRET yang kosong berarti tidak ada penjaga sama sekali.
   *
   * Versi lama memakai `if (rahasia) { ...tolak... }`, jadi ketika variabelnya
   * kosong seluruh blok itu dilewati dan antrean DIPROSES tanpa syarat apa
   * pun. Endpoint ini menjalankan pengiriman WhatsApp ke nomor donatur, jadi
   * "lupa mengisi variabel" berakhir menjadi siapa pun bisa memicu kiriman
   * hanya dengan membuka alamatnya. Keadaan yang paling mungkin justru yang
   * tidak diharapkan itu: variabel terhapus saat environment dirapikan, atau
   * diisi hanya di Preview sementara Production-nya kosong.
   *
   * Karena itu keadaan kosong diperlakukan sebagai "belum siap", sama dengan
   * api/backup.js yang menjawab 500 "CRON_SECRET belum disetel" alih-alih
   * menjalankan apa pun. 503 dipakai karena kondisinya hilang sendiri setelah
   * variabelnya diisi, jadi bukan kesalahan permintaan. */
  if (!rahasia) {
    return gagal(res, 503,
      'CRON_SECRET belum disetel di Vercel. Antrean tidak dijalankan. Setel variabelnya lalu Redeploy.');
  }

  const dariHeader = String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '');
  const url = new URL(req.url, 'http://x');
  const dariUrl = url.searchParams.get('kunci') || '';
  if (!bandingAman(dariHeader, rahasia) && !bandingAman(dariUrl, rahasia)) {
    return gagal(res, 401, 'Kunci cron tidak sah');
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