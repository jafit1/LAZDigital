# Rencana Implementasi

## Gambaran Umum

Rencana ini mengikuti pendekatan TDD: uji ditulis dan dibuktikan gagal lebih dulu, baru kode produksi disunting sampai uji lulus. Semua perubahan dibatasi ke api/_drive.js (CRLF), lib/surat/surat.js dan lib/surat/api.js (LF), .env.example, dokumen baru PANDUAN-LAMPIRAN-SURAT.md, dan berkas uji baru tools/test_drive_surat_folder.js. Tidak ada berkas baru di direktori api/. Seluruh komentar kode dan dokumentasi memakai Bahasa Indonesia tanpa tanda em dash.

## Tasks

- [x] 1. Uji properti folder Drive khusus surat (gagal dulu)
  - [x] 1.1 Tulis tools/test_drive_surat_folder.js dengan uji Property 1 dan 2
    - Buat berkas baru tools/test_drive_surat_folder.js, mengikuti pola isolasi env sementara (`process.env` disetel dan dikembalikan di akhir uji) dan gaya pelaporan OK/GAGAL yang sudah dipakai uji lain di tools/
    - Uji Property 1: generator acak kombinasi id/secret/refresh/folder/folderSurat (terisi atau kosong), memanggil `driveSiapSurat()` dari api/_drive.js, memverifikasi hasilnya benar jika dan hanya jika Kredensial_Dasar lengkap dan (Folder_Surat terisi atau Folder_Cadangan terisi), minimum 100 iterasi
    - Uji Property 2: generator acak nilai Folder_Surat (terisi/kosong) dengan Kredensial_Dasar dan Folder_Cadangan tetap, memverifikasi hasil `driveSiap()` tidak pernah berubah akibat Folder_Surat, minimum 100 iterasi
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.3, 8.1, 8.2_
    - **Property 1, 2**

  - [x] 1.2 Tambah uji Property 3 dan 4 di tools/test_drive_surat_folder.js
    - Uji Property 3: generator acak nama berkas, isi buffer, mime, memanggil `unggahBiner(nama, buf, mime)` tanpa parameter folder dengan `fetch` global ditiru untuk menangkap body multipart, memverifikasi field `parents` pada metadata JSON sama dengan Folder_Cadangan, minimum 100 iterasi
    - Uji Property 4: generator acak nama berkas, isi buffer, mime, dan folder eksplisit, memanggil `unggahBiner(nama, buf, mime, folder)` dengan `fetch` ditiru, memverifikasi field `parents` sama dengan folder yang diberikan terlepas dari nilai Folder_Cadangan/Folder_Surat, minimum 100 iterasi
    - Jalankan `node tools/test_drive_surat_folder.js` dan pastikan GAGAL karena `driveSiapSurat`/`folderSurat` belum ada dan `unggahBiner` belum menerima parameter folder di api/_drive.js saat ini
    - _Requirements: 2.1, 2.2, 2.3, 8.3_
    - **Property 3, 4**

- [x] 2. Implementasi folder Drive khusus surat di api/_drive.js
  - [x] 2.1 Tambah driveSiapSurat, folderSurat, dan parameter folder di api/_drive.js (CRLF)
    - Sunting api/_drive.js dengan alat yang menjaga akhiran baris CRLF yang sudah ada, jangan tulis ulang seluruh berkas
    - Tambah field `folderSurat: process.env.GDRIVE_FOLDER_SURAT_ID` ke `ENV()`, tanpa mengubah field yang sudah ada
    - Tambah fungsi `driveSiapSurat()` yang mengembalikan benar jika Kredensial_Dasar lengkap dan (`e.folderSurat` atau `e.folder`) terisi
    - Tambah fungsi `folderSurat()` yang mengembalikan `e.folderSurat || e.folder`, dengan komentar Bahasa Indonesia menjelaskan tujuannya sebagai helper tunggal logika fallback
    - Pastikan `driveSiap()` tidak disentuh sama sekali, baik signature maupun isi
    - Ubah `unggahBiner(nama, buf, mime, folder)` menerima parameter keempat opsional; hitung `tujuan = folder || e.folder` dan pakai `tujuan` pada `parents` metadata, sehingga pemanggilan tanpa parameter folder tetap memakai Folder_Cadangan
    - Pastikan `unggah()`, `daftar()`, `hapus()`, `pangkas()`, `unduh()` tidak diubah signature maupun perilakunya
    - Ubah `module.exports` menambahkan `driveSiapSurat` dan `folderSurat` ke daftar yang sudah ada
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_
    - **Property 1, 2, 3, 4**

  - [x] 2.2 Jalankan tools/test_drive_surat_folder.js sampai lulus
    - Jalankan `node tools/test_drive_surat_folder.js`, perbaiki setiap kegagalan sampai Property 1, 2, 3, dan 4 lulus semua
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_
    - **Property 1, 2, 3, 4**

- [x] 3. Checkpoint - pastikan uji folder Drive lulus
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Uji Modul Surat memakai driveSiapSurat (gagal dulu)
  - [x] 4.1 Tambah skenario Property 5 dan 6 di tools/test_surat_fitur.js
    - Tambah skenario baru di bagian lampiran yang sudah ada di tools/test_surat_fitur.js, memakai drive tiruan yang disuntikkan lewat parameter `drive` seperti pola yang sudah berjalan di berkas ini
    - Uji Property 5: drive tiruan dengan `driveSiapSurat()` mengembalikan benar, acak Folder_Surat terisi/kosong pada drive tiruan, memanggil `tambahLampiran`, memverifikasi folder yang diteruskan ke `unggahBiner` tiruan sama dengan Folder_Surat jika terisi atau Folder_Cadangan jika kosong, minimum 100 iterasi acak
    - Uji Property 6: drive tiruan dengan `driveSiap()` dan `driveSiapSurat()` ditiru mengembalikan nilai berbeda secara acak dan independen, memanggil `tambahLampiran`, `ambilLampiran`, `hapusLampiran`, dan `hapus`, memverifikasi keputusan Modul_Surat (naik ke Drive atau tidak, memanggil `drive.hapus` atau tidak) mengikuti hasil `driveSiapSurat()` bukan `driveSiap()`, minimum 100 iterasi acak
    - _Requirements: 3.1, 3.2, 3.3, 8.1_
    - **Property 5, 6**

  - [x] 4.2 Tambah skenario Property 7 di tools/test_surat_fitur.js
    - Uji Property 7 (contoh/unit, bukan properti acak): 2-3 skenario konkret memverifikasi field `drive` pada hasil `T['surat.status']` dan `T['surat.ruang']` sama dengan hasil `driveSiapSurat()` drive tiruan, bukan `driveSiap()` (kombinasi: keduanya true, keduanya false, driveSiap false tapi driveSiapSurat true)
    - Jalankan `node tools/test_surat_fitur.js` dan pastikan skenario baru pada 4.1 dan 4.2 GAGAL karena lib/surat/surat.js dan lib/surat/api.js masih memanggil `drive.driveSiap()`
    - _Requirements: 4.1, 4.2_
    - **Property 7**

- [x] 5. Implementasi driveSiapSurat di Modul Surat
  - [x] 5.1 Ubah lib/surat/surat.js memakai driveSiapSurat dan folderSurat (LF)
    - Sunting lib/surat/surat.js dengan alat yang menjaga akhiran baris LF yang sudah ada
    - Ubah `tambahLampiran(id, data, oleh, drive)`: ganti pemeriksaan `drive.driveSiap()` menjadi `drive.driveSiapSurat()`, hitung `const folder = drive.folderSurat()`, teruskan `folder` sebagai parameter keempat ke `drive.unggahBiner(nama, buf, mime, folder)`
    - Ubah `hapusLampiran(id, lid, drive)`: ganti pemeriksaan `drive.driveSiap()` menjadi `drive.driveSiapSurat()` sebelum memanggil `drive.hapus()`, pertahankan try/catch yang mengabaikan galat
    - Ubah `hapus(id, drive)`: ganti pemeriksaan `drive.driveSiap()` menjadi `drive.driveSiapSurat()` pada baris di dalam perulangan lampiran, pertahankan try/catch yang mengabaikan galat
    - Pastikan `ambilLampiran(id, lid, drive)` tidak diubah, karena baris `drive.unduh(l.driveId)` sudah dijalankan hanya ketika `l.simpan === 'drive'` tanpa perlu pemeriksaan driveSiap/driveSiapSurat
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
    - **Property 5, 6**

  - [x] 5.2 Ubah lib/surat/api.js memakai driveSiapSurat (LF)
    - Sunting lib/surat/api.js dengan alat yang menjaga akhiran baris LF yang sudah ada
    - Ubah `T['surat.status']`: ganti `drive: !!(drive && drive.driveSiap())` menjadi `drive: !!(drive && drive.driveSiapSurat())`
    - Ubah `T['surat.ruang']`: ganti `drive: !!(drive && drive.driveSiap())` menjadi `drive: !!(drive && drive.driveSiapSurat())`
    - Pastikan pemanggilan `S.tambahLampiran`, `S.ambilLampiran`, `S.hapusLampiran`, `S.hapus` tidak diubah, karena mereka hanya meneruskan modul `drive` apa adanya
    - _Requirements: 4.1, 4.2_
    - **Property 7**

  - [x] 5.3 Jalankan ulang tools/test_surat_fitur.js dan tools/test_drive_surat_folder.js sampai lulus semua
    - Jalankan `node tools/test_surat_fitur.js` dan `node tools/test_drive_surat_folder.js`, perbaiki setiap kegagalan yang muncul sampai seluruh skenario dan properti pada kedua berkas lulus
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2_
    - **Property 1, 2, 3, 4, 5, 6, 7**

- [x] 6. Checkpoint - pastikan semua uji surat dan drive lulus
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Konfigurasi dan dokumentasi
  - [x] 7.1 Tambah GDRIVE_FOLDER_SURAT_ID ke .env.example
    - Tambah baris baru tepat di bawah `GDRIVE_FOLDER_ID=` pada blok Google Drive yang sudah ada di .env.example
    - Sertakan komentar Bahasa Indonesia tanpa em dash yang menjelaskan fungsi variabel ini dan perilaku fallback ke `GDRIVE_FOLDER_ID` ketika kosong
    - Jangan cantumkan nilai rahasia apa pun, hanya nama variabel dan komentar penjelasan
    - _Requirements: 6.1, 6.2_

  - [x] 7.2 Buat dokumen PANDUAN-LAMPIRAN-SURAT.md
    - Buat berkas baru PANDUAN-LAMPIRAN-SURAT.md di root repositori, Bahasa Indonesia tanpa em dash, mengikuti gaya PANDUAN-CADANGAN.md yang sudah ada
    - Tulis judul dan ringkasan tujuan: memisahkan lampiran surat dari cadangan basis data di Google Drive
    - Jelaskan perilaku fallback: Folder_Surat kosong lalu otomatis pakai Folder_Cadangan, kedua folder kosong lalu lampiran baru disimpan di basis data sampai kuota SURAT_KUOTA_MB penuh
    - Tulis langkah membuat folder Drive baru khusus lampiran surat dan mengambil ID dari alamat folder
    - Tulis langkah mengisi GDRIVE_FOLDER_SURAT_ID di Vercel (Settings, Environment Variables, Redeploy)
    - Catat bahwa kredensial OAuth (GDRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN) dipakai bersama fitur cadangan, cukup rujuk PANDUAN-CADANGAN.md langkah 2a dan 2b bila belum pernah disetel
    - Tulis catatan migrasi manual: lampiran lama di Folder_Cadangan tidak berpindah otomatis, jelaskan langkah manual opsional memindahkan berkas lewat antarmuka Drive, dan jelaskan driveId tidak perlu diubah karena unduh/hapus bekerja berdasarkan id berkas
    - Catat bahwa PANDUAN-CADANGAN.md dan fitur cadangan basis data tidak terdampak sama sekali oleh variabel baru ini
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 7.3 Daftarkan test_drive_surat_folder.js ke DAFTAR di tools/jalankan-uji.js
    - Sunting tools/jalankan-uji.js, tambah satu entri baru `{ label: 'Folder Drive khusus lampiran Surat', berkas: 'test_drive_surat_folder.js' }` ke array DAFTAR, ditempatkan tepat setelah entri `test_surat_fitur.js` yang sudah ada
    - _Requirements: 8.4_

- [x] 8. Verifikasi akhir tidak ada regresi
  - [x] 8.1 Verifikasi cadangan basis data (Property 8) tidak terdampak
    - Jalankan `node tools/jalankan-uji.js surat` dan pastikan skenario cadangan basis data (Property 8, driveSiap() tetap salah ketika GDRIVE_FOLDER_SURAT_ID terisi tapi GDRIVE_FOLDER_ID kosong) tetap lulus tanpa perubahan kode api/backup.js
    - _Requirements: 5.1, 5.2, 5.3_
    - **Property 8**

  - [x] 8.2 Jalankan rangkaian uji surat, drive, dan cadangan secara menyeluruh
    - Jalankan `node tools/jalankan-uji.js --paralel=1` untuk minimal rangkaian uji surat, drive, dan cadangan (test_surat_fitur.js, test_drive_surat_folder.js, test_surat_ui.js, test_cadangan_peringatan.js, test_pulihkan_aman.js) untuk memastikan tidak ada regresi di luar lingkup perubahan
    - Perbaiki setiap kegagalan yang muncul sampai seluruh rangkaian lulus
    - _Requirements: 5.1, 5.2, 5.3, 8.4_
    - **Property 8**

## Notes

- Tidak ada tugas bertanda `*` di rencana ini karena setiap tugas uji di sini merupakan bagian wajib dari pendekatan TDD (uji ditulis gagal lebih dulu, lalu dibuat lulus), bukan uji tambahan opsional yang bisa dilewati untuk MVP.
- Property 1 sampai 4 diuji di tools/test_drive_surat_folder.js, berkas baru yang murni menyoal api/_drive.js.
- Property 5 dan 6 diuji sebagai skenario acak baru di tools/test_surat_fitur.js, karena memerlukan drive tiruan yang disuntikkan ke tambahLampiran/ambilLampiran/hapusLampiran/hapus.
- Property 7 dan 8 diuji sebagai contoh/unit (2-3 skenario konkret), bukan iterasi acak, karena keduanya memverifikasi pengkabelan satu baris kode atau non-regresi pada fungsi yang tidak diubah.
- driveSiap() dan perilaku api/backup.js (unggah, daftar, hapus, pangkas tanpa parameter folder) tidak diubah signature maupun hasilnya di seluruh rencana ini.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["5.1", "5.2"] },
    { "id": 7, "tasks": ["5.3"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2"] }
  ]
}
```
