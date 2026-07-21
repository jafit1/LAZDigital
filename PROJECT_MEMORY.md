# LAZ Digital — Project Memory & Architecture Guide

File ini berisi rangkuman arsitektur, teknologi, database, dan petunjuk teknis proyek LAZ Digital untuk memudahkan AI Agent atau developer berikutnya membaca codebase ini.

---

## 1. Project Path & Workspace
- **Lokal Workspace**: `C:\Users\2024\.gemini\antigravity\scratch\laz-vercel`
- **Produksi URL**: `https://lazdigital.my.id` (Vercel deployment)

---

## 2. Tech Stack & Architecture
Proyek ini menggunakan arsitektur Serverless dengan Single-Page Application (SPA) frontend.
- **Frontend**: Single-Page App (SPA) menggunakan HTML5, Vanilla JavaScript, dan CSS Modern di folder `src/public`.
- **Backend (API)**: Node.js serverless functions di Vercel. Endpoint utama adalah `api/index.js` yang meneruskan panggilan ke engine `api/_engine.js` (dan duplikatnya di `src/api/_engine.js`).
- **Database**: 
  - **Google Sheets** sebagai database utama (dihubungkan via API Google Apps Script).
  - **Upstash Redis** untuk penyimpanan token sesi, cache, dan data spreadsheet (.xlsx) base64 untuk bypass vercel blob storage limit.

---

## 3. Struktur Database (Google Sheets)
Tabel-tabel diinisialisasi secara otomatis oleh fungsi `setup()` di backend ke spreadsheet target:
1. **Users**: Manajemen otentikasi user dan perizinan modular.
2. **Penghimpunan**: Pencatatan uang masuk (Zakat, Infak, Sedekah, Wakaf, Kurban, Fidyah, DSKL).
3. **Pentasyarufan**: Pencatatan uang keluar (penyaluran manfaat per asnaf/program).
4. **Rekening**: Rekening bank dan kas aktif lembaga.
5. **Layanan**: Data Kantor Layanan (KLL) dan Unit Layanan (ULL).
6. **Mutasi**: Log audit mutasi bank terimpor untuk menghindari entri ganda.
7. **Donatur**: Database profil donatur yang diimpor atau terdaftar secara mandiri.
8. **Settings**: Konfigurasi parameter lembaga dan branding.

---

## 4. Workflows & Fitur Utama

### A. Impor Mutasi Rekening & Mapping
- **Lokasi Kode**: Fungsi `apiImportMutasiToRecords` di backend dan pembaca CSV di frontend (`src/public/app.js`).
- **Fungsi**: Membaca file mutasi (CSV dari BPD DIY, BCA, BSI, Muamalat, dll), menampilkan form pratinjau yang interaktif (bisa dicentang, diedit nominal/tanggal/deskripsi, dan dialokasikan tipenya apakah Penghimpunan/Pentasyarufan) sebelum disimpan ke pembukuan secara realtime.

### B. Database Donatur
- **Lokasi Kode**: Fungsi `apiListDonatur` dan `apiImportDonaturText`.
- **Fungsi**: Mengelompokkan donatur secara cerdas dengan membersihkan prefiks transaksi (seperti "Infak Umum", "Zakat Profesi"). Menyediakan form impor massal dari teks polos. Menyediakan filter multi-select KLL/ULL dinamis di frontend untuk menampilkan donatur per wilayah layanan.

### C. Sidebar Menu Collapsible
- **Lokasi Kode**: Layout `src/public/index.html` dan CSS `src/public/styles.css`.
- **Fungsi**: Menu navigasi utama diletakkan di sebelah kiri secara vertikal (Sidebar). Pengguna dapat menyembunyikan (collapse) sidebar menjadi ikon saja via tombol toggle **☰**. Status collapse disimpan di `localStorage` perangkat.

---

## 5. Deployment & Sinkronisasi File
- **Sinkronisasi**: File backend di `api/_engine.js` harus selalu identik dengan `src/api/_engine.js`. Lakukan copy-paste / sinkronisasi setiap kali mengedit backend.
- **Deploy Command**: Jalankan perintah `npx vercel --prod --yes` di root directory proyek.
