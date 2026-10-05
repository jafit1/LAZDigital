/* Pembungkus opsi chromium.launch untuk semua uji tampilan.
 *
 * KENAPA ADA. Halaman aplikasi memuat Google Fonts lewat <link rel=stylesheet> biasa, dan stylesheet yang belum
 * selesai menahan skrip sesudahnya. Kalau internet di komputer penguji lambat atau putus, halaman macet puluhan
 * detik: uji Media gagal "waiting until load" 30 detik, uji Surat kehabisan 20 detik menunggu aplikasi terbuka,
 * uji Fundraising gagal pada pemeriksaan isi, padahal kodenya tidak salah. Sambungan internet bukan yang diuji.
 *
 * Cara kerja: sekali per rangkaian uji dicoba menjangkau fonts.googleapis.com. Kalau menjawab cepat, tidak ada yang
 * diubah (huruf asli dipakai, ukuran terukur seperti di produksi). Kalau lambat atau putus, host huruf dan CDN
 * dibuat gagal seketika lewat --host-resolver-rules, jadi halaman memakai huruf cadangan dan terbuka cepat.
 * Hasilnya diwariskan lewat LAZ_UJI_INTERNET supaya tidak dicoba berulang oleh tiap uji. */
'use strict';
const { spawnSync } = require('child_process');

const HOST_LUAR = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];
const KODE_COBA = "const t=Date.now();require('https').get('https://fonts.googleapis.com/css2?family=Inter',{timeout:2500},"
  + "(r)=>{r.resume();process.exit(r.statusCode<500&&Date.now()-t<2000?0:1)}).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))";

function internetBaik() {
  if (process.env.LAZ_UJI_INTERNET) return process.env.LAZ_UJI_INTERNET === 'ok';
  let ok = false;
  try { ok = spawnSync(process.execPath, ['-e', KODE_COBA], { timeout: 4000, stdio: 'ignore' }).status === 0; } catch (_) { ok = false; }
  process.env.LAZ_UJI_INTERNET = ok ? 'ok' : 'mati';
  return ok;
}

module.exports = function luncurkan(opsi) {
  const o = Object.assign({}, opsi || {});
  if (internetBaik()) return o;
  o.args = (o.args || []).concat(['--host-resolver-rules=' + HOST_LUAR.map((h) => 'MAP ' + h + ' ~NOTFOUND').join(', ')]);
  return o;
};
module.exports.internetBaik = internetBaik;
