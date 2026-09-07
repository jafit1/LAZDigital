# Panduan Cadangan Otomatis LAZ Digital

Sistem membuat cadangan sendiri setiap hari pukul **02.00 WIB** ke dua tempat:

| Tujuan | Isi | Disimpan | Guna |
|---|---|---|---|
| Salinan cepat (Redis, kunci terpisah dari basis data utama) | seluruh data, tanpa kata sandi & sesi | 14 hari terakhir | pulih dalam hitungan detik dari menu Pengaturan → Perawatan |
| Google Drive lembaga | berkas `laz-cadangan-YYYY-MM-DD_HHmm.json` | 30 berkas terakhir | cadangan lepas-pantai bila Redis-nya sendiri bermasalah |

Cadangan **tidak memuat kata sandi pengguna**. Karena itu saat dipulihkan, akun pengguna yang ada sekarang dibiarkan utuh — tidak ada yang terkunci keluar.

## Langkah 1 — Aktifkan jadwal harian (5 menit)

Jadwalnya sudah ada di `vercel.json`. Yang perlu Anda lakukan hanya memberi kunci rahasia supaya endpoint-nya tidak bisa dipicu orang lain:

1. Buat teks acak panjang, misalnya dari <https://generate-secret.vercel.app/32>.
2. Vercel → proyek LAZDigital → **Settings → Environment Variables** → tambah:
   - `CRON_SECRET` = teks acak tadi
3. **Redeploy** sekali (Deployments → titik tiga → Redeploy).

Setelah itu tab **Pengaturan → Perawatan → Cadangan Otomatis** akan menampilkan "Jadwal harian: aktif". Salinan cepat mulai bekerja sejak malam pertama, tanpa Google Drive sekalipun.

> Paket Hobby Vercel mengizinkan cron sekali sehari — cukup untuk ini.

## Langkah 2 — Sambungkan Google Drive (15 menit, sekali saja)

Cadangan ke Drive memakai **akun Google Anda sendiri** lewat izin OAuth, bukan service account. Service account tidak punya kuota Drive pribadi sehingga unggahannya ditolak; cara ini tidak punya masalah itu.

Izin yang diminta hanya `drive.file`: aplikasi **hanya bisa melihat berkas yang ia buat sendiri**. Ia tidak bisa membaca dokumen, foto, atau berkas Drive Anda yang lain.

### 2a. Buat kredensial OAuth di Google Cloud

1. Buka <https://console.cloud.google.com/> → buat proyek baru (nama bebas, mis. *LAZ Digital Cadangan*).
2. **APIs & Services → Library** → cari **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → pilih **External** → isi nama aplikasi & email Anda → simpan. Di bagian **Test users**, tambahkan alamat Gmail Anda sendiri. (Aplikasi boleh tetap berstatus *Testing*; tidak perlu verifikasi Google karena hanya Anda yang memakainya.)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → tipe **Desktop app** → buat. Catat **Client ID** dan **Client secret**.

### 2b. Dapatkan refresh token

Di komputer Anda, di folder proyek:

```
node tools/dapatkan-token-drive.js <CLIENT_ID> <CLIENT_SECRET>
```

Peramban akan terbuka meminta izin. Masuk dengan akun Gmail yang Anda daftarkan sebagai *test user*, setujui. Terminal akan mencetak `GDRIVE_REFRESH_TOKEN`.

### 2c. Siapkan folder tujuan

Buat folder di Google Drive (mis. *Cadangan LAZ Digital*). Buka foldernya; ID-nya ada di alamat peramban:

```
https://drive.google.com/drive/folders/1AbCdEfGh...   ←  bagian setelah /folders/ adalah GDRIVE_FOLDER_ID
```

### 2d. Isi di Vercel

**Settings → Environment Variables**, tambahkan empat ini lalu **Redeploy**:

| Nama | Isi |
|---|---|
| `GDRIVE_CLIENT_ID` | dari langkah 2a |
| `GDRIVE_CLIENT_SECRET` | dari langkah 2a |
| `GDRIVE_REFRESH_TOKEN` | dari langkah 2b |
| `GDRIVE_FOLDER_ID` | dari langkah 2c |

Uji: buka **Pengaturan → Perawatan → Cadangkan sekarang**. Kalau berhasil, berkas baru muncul di folder Drive dalam beberapa detik.

## Memulihkan data

Hanya **superadmin** yang bisa memulihkan.

- **Dari salinan cepat:** Perawatan → daftar *Salinan cepat* → **Pulihkan** pada tanggal yang diinginkan → ketik `PULIHKAN`.
- **Dari berkas Drive:** unduh berkas `.json`-nya dari Drive → Perawatan → **Pulihkan dari berkas .json**.
- **Salah pulih?** Keadaan tepat sebelum pemulihan selalu disimpan sebagai *"Keadaan sebelum pemulihan terakhir"*. Klik **Batalkan pemulihan** di baris itu.

Pemulihan mengganti seluruh data transaksi dan master. Akun pengguna dan sesi yang sedang berjalan **tidak** disentuh.

## Kalau refresh token kedaluwarsa

Google mencabut refresh token aplikasi berstatus *Testing* setelah **7 hari tidak dipakai**, atau bila Anda mengganti kata sandi Google. Karena cadangan berjalan tiap hari, tokennya terus terpakai dan tidak kedaluwarsa. Bila suatu saat status Drive di Perawatan berubah jadi gagal dengan pesan `invalid_grant`, ulangi **langkah 2b** saja — sekitar 2 menit.

Kalau ingin token yang tidak pernah kedaluwarsa, ubah status aplikasi di OAuth consent screen dari *Testing* menjadi *In production* (Google akan memperingatkan soal verifikasi; untuk cakupan `drive.file` dan pemakaian sendiri itu bisa dilewati).

## Menjalankan di komputer sendiri (tanpa Redis)

Saat memakai `start-lokal.bat`, salinan cadangan masuk ke folder `data/cadangan/` di proyek, dan Drive tetap bisa dipakai kalau empat variabel di atas ada di berkas `.env`.
