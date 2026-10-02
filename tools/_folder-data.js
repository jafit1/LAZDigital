/* tools/_folder-data.js: folder penyimpanan lokal untuk uji.
 *
 * tools/jalankan-uji.js memberi tiap uji folder sementaranya sendiri lewat
 * LAZ_DATA_LOKAL, supaya uji bisa dijalankan bersamaan tanpa saling menghapus
 * data. Kalau uji dijalankan langsung (node tools/test_x.js), foldernya tetap
 * .data di proyek seperti dulu.
 */
'use strict';
const path = require('path');

module.exports = function folderData(akar) {
  return process.env.LAZ_DATA_LOKAL || path.join(akar, '.data');
};
