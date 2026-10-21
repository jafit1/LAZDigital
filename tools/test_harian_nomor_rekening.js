/* Uji: Laporan Harian (layar dan PDF) menampilkan NOMOR rekening, bukan cuma
 * nama bank, supaya datanya lengkap.
 *
 * Pemilik (21 Oktober 2026): "pada bagian laporan harian atau cetak harian
 * tampilkan juga nomor rekening untuk metode transfer bank, agar datanya
 * lengkap, pada saat menampilkan PDF juga".
 *
 * Datanya BUATAN. Repositori ini publik.
 *
 *   node tools/test_harian_nomor_rekening.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'app.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '..', 'api', '_engine.js'), 'utf8');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(info).slice(0, 200)); }
};

/* Server harus mengirim nama bank DAN nomor rekening. */
cek('apiLaporanHarian mengirim bank lengkap (nama + nomor)',
  /namaBank \+ ' - ' \+ k\.nomor/.test(engine), 'bank tidak lagi berisi nomor rekening');

/* Ada satu pemisah yang dipakai bersama, bukan potongan terpisah di dua tempat. */
cek('ada pemisah nama bank dan nomor rekening',
  /function lhPisahRekening\(/.test(app), 'tidak ada fungsi pemisah rekening');

const preview = (app.match(/function renderHarianPreview\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
cek('pratinjau layar menampilkan nomor rekening',
  /lhPisahRekening\(/.test(preview) && /nomor/.test(preview), 'nomor rekening tidak tampil di layar');

const cetak = (app.match(/function buildHarianHTML\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
cek('PDF menampilkan nomor rekening',
  /lhPisahRekening\(/.test(cetak) && /nomor/.test(cetak), 'nomor rekening tidak tampil di PDF');

/* Pemisah harus memisahkan pada tanda hubung TERAKHIR: nama bank bisa
 * mengandung tanda hubung ("BPD DIY Syariah - 803211000510"). */
const fn = (app.match(/function lhPisahRekening\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];
cek('pemisah memakai tanda hubung terakhir', /lastIndexOf/.test(fn), 'pemisah tidak aman untuk nama bank ber tanda hubung');

/* Perilaku nyata pemisah, dijalankan di sini: bukan hanya cek bentuk kode. */
const pisah = eval('(' + fn.replace(/^function lhPisahRekening/, 'function') + ')');
const p1 = pisah('Bank BPD DIY Syariah - 803211000510');
cek('nama bank terpisah dari nomor', p1.nama === 'Bank BPD DIY Syariah' && p1.nomor === '803211000510', p1);
const p2 = pisah('Bank BPD-Yogyakarta - 803211000551');
cek('nama bank ber tanda hubung tidak terpotong', p2.nama === 'Bank BPD-Yogyakarta' && p2.nomor === '803211000551', p2);
const p3 = pisah('');
cek('rekening kosong tidak jadi "undefined"', p3.nama === '' && p3.nomor === '', p3);

console.log('\n=== HASIL ===');
console.log(ok + ' lulus, ' + gagal + ' gagal.');
if (gagal) { process.exit(1); }
console.log('\ntest_harian_nomor_rekening.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
