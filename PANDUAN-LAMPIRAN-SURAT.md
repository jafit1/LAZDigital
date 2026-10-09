# Panduan Folder Drive Lampiran Surat LAZ Digital

Lampiran pada modul Surat & Pengajuan (surat masuk, surat keluar, pengajuan, dan berkas sejenis) bisa naik ke Google Drive. Panduan ini menjelaskan cara memisahkan tujuan unggahan lampiran surat ke folder Google Drive tersendiri, supaya tidak tercampur dengan folder cadangan basis data yang sudah dipakai fitur di **[PANDUAN-CADANGAN.md](./PANDUAN-CADANGAN.md)**.

Fitur ini **tidak wajib** disetel. Kalau dibiarkan kosong, lampiran surat tetap jalan seperti sebelumnya, hanya saja memakai folder cadangan yang sama.

## Perilaku jalan cadangan (fallback)

Setiap kali ada lampiran surat baru, sistem memilih tempat penyimpanan dengan urutan berikut:

1. **Folder_Surat terisi** (variabel `GDRIVE_FOLDER_SURAT_ID` ada nilainya) → lampiran naik ke folder ini.
2. **Folder_Surat kosong, Folder_Cadangan terisi** (variabel `GDRIVE_FOLDER_ID` ada nilainya) → lampiran otomatis naik ke folder cadangan itu, sama seperti sebelum fitur ini ada.
3. **Kedua folder kosong**, atau kredensial Google belum disetel → lampiran disimpan di basis data (bukan Drive), selama kuota `SURAT_KUOTA_MB` masih cukup.

Urutan ini berjalan otomatis, tidak ada tombol atau saklar tambahan yang perlu diaktifkan.

## Langkah 1 — Buat folder Drive khusus lampiran surat (5 menit)

1. Buka Google Drive dengan akun yang sama yang dipakai untuk fitur cadangan.
2. Buat folder baru, misalnya beri nama *Lampiran Surat LAZ Digital*.
3. Buka foldernya. ID-nya ada di alamat peramban, sama seperti folder cadangan:

```
https://drive.google.com/drive/folders/1XyZaBcDeF...   ←  bagian setelah /folders/ adalah GDRIVE_FOLDER_SURAT_ID
```

## Langkah 2 — Isi di Vercel (5 menit)

**Settings → Environment Variables**, tambahkan satu ini lalu **Redeploy**:

| Nama | Isi |
|---|---|
| `GDRIVE_FOLDER_SURAT_ID` | ID folder dari Langkah 1 |

Setelah redeploy, lampiran surat baru akan naik ke folder ini. Lihat status kesiapan Drive untuk lampiran surat di layar Surat & Pengajuan.

## Kredensial OAuth dipakai bersama fitur cadangan

Fitur ini **tidak memerlukan kredensial Google baru**. `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, dan `GDRIVE_REFRESH_TOKEN` dipakai bersama dengan fitur cadangan basis data.

Kalau ketiga variabel itu belum pernah disetel di proyek ini, ikuti langkah 2a dan 2b di PANDUAN-CADANGAN.md lebih dulu untuk membuat kredensial OAuth dan mendapatkan refresh token. Kalau sudah pernah disetel untuk fitur cadangan, tidak perlu diulang, cukup lanjut ke Langkah 1 dan 2 di atas.

## Migrasi lampiran lama (opsional, manual)

Lampiran surat yang sudah terunggah ke folder cadangan **sebelum** `GDRIVE_FOLDER_SURAT_ID` disetel **tidak berpindah folder secara otomatis**. Sistem tidak memindahkan berkas lama dengan sendirinya.

Kalau ingin merapikan, langkah manualnya (opsional, lewat antarmuka Google Drive, bukan lewat aplikasi):

1. Buka folder cadangan di Drive.
2. Cari berkas lampiran surat. Nama berkasnya memakai format "&lt;nomor surat dengan garis miring diganti strip&gt; &lt;nama lampiran&gt;", jadi mudah dibedakan dari berkas cadangan `laz-cadangan-....json`.
3. Pindahkan berkas yang ditemukan ke folder lampiran surat yang baru dibuat, memakai drag atau klik kanan lalu **Pindahkan ke**.

Pemindahan folder ini **tidak perlu diikuti perubahan apa pun pada basis data**. Unduh dan hapus lampiran bekerja berdasarkan id berkas Drive yang tersimpan pada data surat, bukan berdasarkan folder tempat berkas berada. Jadi walau berkasnya dipindahkan ke folder lain, id-nya tetap sama dan aplikasi tetap bisa mengunduh atau menghapusnya seperti biasa.

## Fitur cadangan tidak terdampak

Menyetel `GDRIVE_FOLDER_SURAT_ID` **tidak mengubah apa pun** pada fitur cadangan basis data. Cadangan harian tetap berjalan memakai folder cadangan (`GDRIVE_FOLDER_ID`) seperti dijelaskan di PANDUAN-CADANGAN.md, tanpa peduli variabel baru ini terisi atau kosong.
