/* tools/_pagar-db.js: pagar supaya uji fitur tidak pernah menyentuh basis data
 * sungguhan.
 *
 * MASALAH YANG DICEGAH. Uji fitur Broadcast, AI, dan Fundraising menulis
 * puluhan kunci percobaan: kampanye palsu, kontak palsu, percakapan palsu. Dulu
 * itu aman, karena tanpa UPSTASH_* mereka otomatis jatuh ke berkas JSON lokal.
 *
 * Sejak pindah ke PostgreSQL, keadaannya berubah: lib/*\/db.js memilih
 * penyimpanan dari ada tidaknya DATABASE_URL. Jadi satu variabel lingkungan
 * yang kebetulan terisi, entah karena di-export di jendela perintah atau karena
 * berkas uji lain membacanya dari .env.local, sudah cukup membuat seluruh data
 * percobaan itu masuk ke basis data lembaga. Tanpa satu pun peringatan, karena
 * dari sudut pandang kodenya semuanya berjalan normal.
 *
 * Yang dilakukan berkas ini: berhenti kalau DATABASE_URL menunjuk ke luar
 * komputer ini. Untuk menguji di atas PostgreSQL sungguhan, pakai
 * UJI_DATABASE_URL yang menunjuk basis data percobaan.
 */
'use strict';

module.exports = function pagarDB(namaUji) {
  const alamat = process.env.UJI_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!alamat) return;                       /* tanpa alamat: berkas JSON lokal, aman */

  const lokal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(alamat);
  if (lokal) {
    process.env.DATABASE_URL = alamat;
    return;
  }

  console.error('\nDIHENTIKAN: ' + (namaUji || 'uji ini') + ' menulis data percobaan,');
  console.error('dan DATABASE_URL menunjuk ke basis data di luar komputer ini.');
  console.error('Kalau diteruskan, kampanye, kontak, dan percakapan palsu akan masuk');
  console.error('ke basis data sungguhan.\n');
  console.error('Pilihan:');
  console.error('  1. Kosongkan DATABASE_URL di jendela perintah ini:');
  console.error('       set DATABASE_URL=');
  console.error('     Ujinya lalu memakai berkas JSON lokal, seperti sebelum pindah.');
  console.error('  2. Tunjuk basis data percobaan di komputer ini:');
  console.error('       set UJI_DATABASE_URL=postgres://postgres@127.0.0.1:5432/laz_uji\n');
  process.exit(1);
};
