# Dokumen Kebutuhan

## Pendahuluan

Lampiran modul Surat & Pengajuan saat ini naik ke Google Drive memakai folder cadangan basis data yang sama (GDRIVE_FOLDER_ID), atau jatuh ke penyimpanan basis data (kuota 200 MB) kalau Drive belum siap. Fitur ini memisahkan tujuan unggahan lampiran surat ke folder Google Drive tersendiri (GDRIVE_FOLDER_SURAT_ID), dengan folder cadangan tetap sebagai jalan cadangan kalau folder surat belum disetel, tanpa mengubah perilaku cadangan basis data (api/backup.js) sama sekali.

## Daftar Istilah

- **Modul_Surat**: kumpulan kode di lib/surat/ yang mengelola pencatatan surat, pengajuan, dan lampirannya.
- **Berkas_Drive**: modul api/_drive.js yang menyediakan fungsi pembantu untuk berbicara dengan Google Drive lewat OAuth.
- **Folder_Surat**: folder Google Drive yang ditunjuk oleh variabel lingkungan GDRIVE_FOLDER_SURAT_ID, tujuan unggahan lampiran surat.
- **Folder_Cadangan**: folder Google Drive yang ditunjuk oleh variabel lingkungan GDRIVE_FOLDER_ID, tujuan unggahan cadangan basis data dan jalan cadangan lampiran surat.
- **Kredensial_Dasar**: kombinasi GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, dan GDRIVE_REFRESH_TOKEN yang dibutuhkan untuk mengakses Google Drive.
- **driveSiap**: fungsi di Berkas_Drive yang memeriksa kesiapan Kredensial_Dasar beserta Folder_Cadangan, dipakai oleh api/backup.js dan tidak diubah fitur ini.
- **driveSiapSurat**: fungsi baru di Berkas_Drive yang memeriksa kesiapan Kredensial_Dasar beserta (Folder_Surat ATAU Folder_Cadangan), dipakai oleh Modul_Surat.
- **Penyimpanan_Basis_Data**: cara simpan lampiran surat sebagai teks base64 di dalam basis data, dibatasi kuota 200 MB (SURAT_KUOTA_MB).

## Kebutuhan

### Kebutuhan 1: Fungsi driveSiapSurat terpisah dari driveSiap

**Cerita Pengguna:** Sebagai pengelola sistem, saya ingin pemeriksaan kesiapan Google Drive untuk lampiran surat terpisah dari pemeriksaan kesiapan cadangan basis data, sehingga pengaturan folder surat tidak memengaruhi fitur cadangan.

#### Kriteria Penerimaan

1. THE Berkas_Drive SHALL menyediakan fungsi driveSiapSurat() yang terpisah dari fungsi driveSiap() yang sudah ada.
2. WHEN driveSiapSurat() dipanggil DAN Kredensial_Dasar lengkap DAN Folder_Surat terisi, THE Berkas_Drive SHALL mengembalikan nilai benar (true).
3. WHEN driveSiapSurat() dipanggil DAN Kredensial_Dasar lengkap DAN Folder_Surat kosong DAN Folder_Cadangan terisi, THE Berkas_Drive SHALL mengembalikan nilai benar (true).
4. IF Kredensial_Dasar tidak lengkap, THEN THE Berkas_Drive SHALL mengembalikan nilai salah (false) dari driveSiapSurat() tanpa memeriksa Folder_Surat atau Folder_Cadangan.
5. IF Kredensial_Dasar lengkap DAN Folder_Surat kosong DAN Folder_Cadangan kosong, THEN THE Berkas_Drive SHALL mengembalikan nilai salah (false) dari driveSiapSurat().
6. THE Berkas_Drive SHALL mempertahankan signature dan perilaku fungsi driveSiap() tanpa perubahan, sehingga api/backup.js dan pemanggil lama tidak terdampak.

### Kebutuhan 2: Pemilihan folder tujuan pada operasi unggah, unduh, dan hapus

**Cerita Pengguna:** Sebagai pengelola sistem, saya ingin lampiran surat baru naik ke Folder_Surat (atau Folder_Cadangan sebagai jalan cadangan) sementara cadangan basis data tetap memakai Folder_Cadangan, sehingga kedua jenis berkas tidak tercampur di satu folder yang sama.

#### Kriteria Penerimaan

1. THE Berkas_Drive SHALL menyediakan fungsi unggahBiner yang dapat menerima parameter folder tujuan yang dipilih oleh pemanggil.
2. WHERE parameter folder tujuan tidak diberikan oleh pemanggil, THE Berkas_Drive SHALL memakai Folder_Cadangan sebagai folder tujuan unggahBiner, sehingga pemanggilan yang sudah ada di api/backup.js tidak berubah perilakunya.
3. WHEN Modul_Surat memanggil unggahBiner untuk lampiran surat, THE Modul_Surat SHALL menyertakan folder tujuan berupa Folder_Surat jika terisi, atau Folder_Cadangan jika Folder_Surat kosong.
4. THE Berkas_Drive SHALL menyediakan fungsi unduh dan hapus yang tetap menerima identitas berkas Drive (id) sebagai parameter utama, tanpa memerlukan folder tujuan karena kedua operasi tersebut bekerja berdasarkan id berkas, bukan folder.
5. IF api/backup.js memanggil unggah, daftar, hapus, atau pangkas tanpa parameter folder tambahan, THEN THE Berkas_Drive SHALL memproses permintaan tersebut dengan Folder_Cadangan seperti sebelum perubahan ini, tanpa galat dan tanpa perbedaan hasil.

### Kebutuhan 3: Modul Surat memakai driveSiapSurat dan folder surat

**Cerita Pengguna:** Sebagai petugas pencatat surat, saya ingin lampiran surat baru naik ke Google Drive memakai folder surat yang terpisah ketika tersedia, sehingga berkas surat tidak bercampur dengan berkas cadangan basis data di Google Drive.

#### Kriteria Penerimaan

1. WHEN petugas menambahkan lampiran surat baru DAN driveSiapSurat() mengembalikan nilai benar, THE Modul_Surat SHALL mengunggah berkas lampiran ke Google Drive memakai Folder_Surat jika terisi, atau Folder_Cadangan jika Folder_Surat kosong.
2. IF driveSiapSurat() mengembalikan nilai salah, THEN THE Modul_Surat SHALL menyimpan lampiran surat baru ke Penyimpanan_Basis_Data selama kuota masih cukup.
3. THE Modul_Surat SHALL memanggil driveSiapSurat() pada fungsi tambahLampiran, ambilLampiran, hapusLampiran, dan hapus, menggantikan pemanggilan driveSiap() yang dipakai sebelumnya.
4. WHEN petugas mengambil isi lampiran surat yang tersimpan di Google Drive, THE Modul_Surat SHALL mengunduh berkas tersebut memakai identitas berkas Drive yang tersimpan pada data lampiran, tanpa bergantung pada folder tempat berkas berada.
5. WHEN petugas menghapus lampiran surat atau menghapus seluruh surat yang memiliki lampiran tersimpan di Google Drive, THE Modul_Surat SHALL menghapus berkas tersebut dari Google Drive memakai identitas berkas Drive yang tersimpan pada data lampiran.

### Kebutuhan 4: Status kesiapan Drive pada tampilan Surat

**Cerita Pengguna:** Sebagai petugas pencatat surat, saya ingin melihat status kesiapan Google Drive yang relevan dengan folder surat, sehingga saya tahu apakah lampiran baru akan naik ke Drive atau basis data.

#### Kriteria Penerimaan

1. WHEN layar Surat memuat status awal (surat.status), THE Modul_Surat SHALL mengirim nilai field drive yang dihasilkan dari driveSiapSurat(), bukan dari driveSiap().
2. WHEN layar Surat memuat informasi ruang lampiran (surat.ruang), THE Modul_Surat SHALL mengirim nilai field drive yang dihasilkan dari driveSiapSurat(), bukan dari driveSiap().

### Kebutuhan 5: Cadangan basis data tidak terdampak

**Cerita Pengguna:** Sebagai pengelola sistem, saya ingin fitur cadangan basis data (api/backup.js) berjalan tanpa perubahan perilaku setelah fitur folder surat ditambahkan, sehingga cadangan harian dan pemulihan tetap bisa diandalkan.

#### Kriteria Penerimaan

1. THE api/backup.js SHALL tetap memanggil driveSiap() untuk memeriksa kesiapan Drive, tanpa diubah menjadi driveSiapSurat().
2. THE api/backup.js SHALL tetap mengunggah, mendaftar, menghapus, dan memangkas berkas cadangan di Folder_Cadangan, tanpa dipengaruhi oleh nilai GDRIVE_FOLDER_SURAT_ID.
3. IF GDRIVE_FOLDER_SURAT_ID disetel sedangkan GDRIVE_FOLDER_ID kosong, THEN THE api/backup.js SHALL tetap menganggap Drive belum siap untuk cadangan basis data, sesuai hasil driveSiap() yang tidak berubah.

### Kebutuhan 6: Variabel lingkungan baru dan dokumentasi

**Cerita Pengguna:** Sebagai pengelola sistem, saya ingin variabel lingkungan baru dan cara migrasi lampiran lama terdokumentasi secara terpisah dari panduan cadangan, sehingga pengaturan folder surat mudah ditemukan tanpa tercampur dokumentasi cadangan.

#### Kriteria Penerimaan

1. THE .env.example SHALL mencantumkan variabel GDRIVE_FOLDER_SURAT_ID beserta komentar yang menjelaskan fungsinya dan perilaku fallback ke GDRIVE_FOLDER_ID ketika kosong.
2. THE .env.example SHALL tidak mencantumkan nilai rahasia apa pun untuk variabel baru tersebut, hanya nama variabel dan komentar penjelasan.
3. THE repositori SHALL memuat dokumen baru PANDUAN-LAMPIRAN-SURAT.md yang terpisah dari PANDUAN-CADANGAN.md.
4. THE PANDUAN-LAMPIRAN-SURAT.md SHALL menjelaskan cara menyetel GDRIVE_FOLDER_SURAT_ID dan hubungan fallback-nya dengan GDRIVE_FOLDER_ID.
5. THE PANDUAN-LAMPIRAN-SURAT.md SHALL menjelaskan bahwa lampiran surat yang sudah tersimpan di Folder_Cadangan sebelum fitur ini tidak berpindah folder secara otomatis, beserta langkah migrasi manual yang bisa dilakukan pengelola bila diinginkan.

### Kebutuhan 7: Batasan jumlah fungsi serverless Vercel

**Cerita Pengguna:** Sebagai pengelola sistem, saya ingin perubahan ini tidak menambah jumlah fungsi serverless baru, sehingga proyek tetap dalam batas 10 atau 12 fungsi paket Vercel Hobby.

#### Kriteria Penerimaan

1. THE perubahan fitur ini SHALL tidak menambah berkas baru di dalam direktori api/ selain berkas yang namanya diawali garis bawah (_).
2. THE perubahan fitur ini SHALL menambahkan fungsi driveSiapSurat() dan dukungan parameter folder ke dalam berkas api/_drive.js yang sudah ada, tanpa membuat berkas rute Vercel baru untuk fitur ini.

### Kebutuhan 8: Uji otomatis gagal lebih dulu sebelum perbaikan

**Cerita Pengguna:** Sebagai pengelola sistem, saya ingin ada uji otomatis yang membuktikan fitur ini bekerja dan tidak merusak cadangan basis data, sehingga perubahan ke depan tidak diam-diam merusak perilaku ini.

#### Kriteria Penerimaan

1. THE repositori SHALL memuat uji otomatis yang memeriksa driveSiapSurat() mengembalikan nilai benar ketika Folder_Surat terisi, dan ketika Folder_Surat kosong tetapi Folder_Cadangan terisi.
2. THE repositori SHALL memuat uji otomatis yang memeriksa driveSiapSurat() mengembalikan nilai salah ketika Kredensial_Dasar tidak lengkap, dan ketika kedua folder kosong.
3. THE repositori SHALL memuat uji otomatis yang memeriksa pemanggilan unggahBiner tanpa parameter folder tetap memakai Folder_Cadangan, membuktikan api/backup.js tidak terdampak.
4. THE berkas tools/jalankan-uji.js SHALL mencantumkan uji baru tersebut pada DAFTAR, sehingga ikut berjalan pada rangkaian uji sebelum deploy.
