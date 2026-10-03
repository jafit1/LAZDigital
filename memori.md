# memori.md — Memori proyek untuk model/sesi lain

Ditulis 3 Oktober 2026. Tujuan berkas ini: supaya model AI lain yang
melanjutkan proyek ini langsung paham konteks tanpa membaca ulang seluruh
riwayat obrolan.

**Baca `CLAUDE.md` dulu.** Itu sumber kebenaran untuk aturan, arsitektur, dan
daftar uji, dan dijaga tetap sinkron dengan kode. `AGENTS.md` cuma menunjuk ke
sana. Berkas ini (`memori.md`) BUKAN pengganti `CLAUDE.md`, isinya cuma dua
hal yang tidak punya tempat di sana: ringkasan riwayat kerja, dan daftar
tugas yang sudah direkomendasikan tapi belum dikerjakan.

---

## 1. Aturan yang paling sering dilupakan (ringkas, detail di CLAUDE.md)

- **Data asli cuma dibaca, tidak boleh disimpan/diubah**: berkas Excel milik
  pemilik (jurnal, bank, kas) yang pernah dilihat selama sesi kerja. Kalau
  diminta memproses berkas asli lagi, baca saja, jangan tulis ke berkas itu
  dan jangan simpan isinya ke mana pun.
- **Repo ini PUBLIK** (`jafit1/LAZDigital`). Nama donatur/penerima asli
  TIDAK BOLEH masuk kode, komentar, atau berkas uji. Pakai nama fiktif.
- **Jawab dalam Bahasa Indonesia, tanpa tanda em dash** (pemilik menyebutnya
  "simbol AI"). Pakai koma atau titik sebagai gantinya.
- **Setiap perbaikan atau fitur baru butuh uji yang terbukti gagal dulu**
  sebelum kode diperbaiki, lalu didaftarkan di `DAFTAR` pada
  `tools/jalankan-uji.js` DAN di tabel uji pada `CLAUDE.md` bagian 7.
- **Vercel Hobby: 10 dari 12 serverless function terpakai.** Jangan menambah
  berkas baru di `api/`, kalau perlu fungsi baru, tumpangkan di berkas yang
  sudah ada (seperti `surat.*` yang menumpang di `api/media.js`).
- **Akhiran baris berbeda per berkas** (CRLF vs LF), lihat tabelnya di
  `CLAUDE.md` bagian 3.3 sebelum menyunting berkas apa pun.
- **Ukur dulu, jangan menebak.** Setiap klaim "lambat" atau "lebih cepat"
  harus dibuktikan dengan angka sebelum dan sesudah.
- Direktori proyek di komputer pemilik: `D:\Project\LAZDigital` (Windows).
  Alur kerja transfer berkas: tulis di sandbox, `device_stage_files` untuk
  membandingkan dengan isi asli di komputer pemilik, baru
  `device_commit_files` dengan `expectedMtimeMs` supaya tidak menimpa
  perubahan yang belum sempat ditarik.

---

## 2. Riwayat kerja (ringkasan, dari yang terlama ke terbaru)

Fitur-fitur ini sudah dikerjakan dan sudah terkirim ke
`D:\Project\LAZDigital` (kode terakhir dikirim, belum tentu sudah dideploy
pemilik ke Vercel):

- Impor jurnal, modul Media, pemecahan izin Dashboard, deteksi kantor
  kembar (KLL/ULL) beserta rincian transaksinya, pembersihan broadcast lama
  (Fonnte), peringatan cadangan, lima celah keamanan (lihat CLAUDE.md 3.10).
- Saldo KLL, urutan menu, test runner (`tools/jalankan-uji.js`), layar
  impor yang difokuskan ke tanggal/nama KLL-ULL yang rancu, opsi massal
  rekap/jurnal, link harian publik, search + styling `lz-ui` pada link KLL.
- Fokus kotak impor, link publik donatur dan KLL/ULL yang disederhanakan
  tampilannya (ringkas, tidak banyak teks).
- **Surat & Pengajuan** (modul baru, `lib/surat/`, `src/public/surat.js`,
  `src/public/lacak.html`): surat masuk/keluar berdisposisi, pengajuan
  bantuan/sponsorship/proposal dengan tahapan progres, kompresi gambar,
  tawaran kompres PDF atau simpan sebagai tautan, opsi Google Drive untuk
  lampiran, halaman lacak publik tanpa login.
- **Perbaikan performa seluruh aplikasi** (2 Oktober 2026, sesi paling
  baru): penyebabnya diukur dulu baru diperbaiki. Hasil (diukur di mesin
  sandbox, data tiruan 15 ribu/5 ribu/3 ribu baris):
  - Tabel Pentasyarufan: layar beku 17,8 detik menjadi 0,33 detik (gambar
    tabel bertahap 100 baris, sisanya lewat `IntersectionObserver`).
  - Mengetik di kotak cari: 1,1-1,5 detik per huruf menjadi tidak ada
    hambatan (saring di atas data yang sudah dihitung sekali, debounce 80
    ms, bukan saring ulang di DOM).
  - Baca ulang di server (hasil bacaan diingat, `INGAT` di
    `lib/laz-pg.js`): Dashboard 585→3 ms, Saldo 263→5 ms, Donatur
    519→10 ms, ListPenghimpunan 212→74 ms. Kena cache kalau buku besar
    tidak berubah (penanda `laz:cver`), izin tetap dicek hidup tiap kali.
  - `surat.daftar`: 404 kueri `kv.get` jadi paling banyak 4 (dikumpulkan
    lewat `pipeline`/MGET baru di `lib/kv-postgres.js`).
  - Boot aplikasi: tidak lagi menunggu font Google atau pustaka xlsx dari
    CDN (`xlsx.full.min.js` sekarang dilayani lokal, versi 0.18.5).
  - Dokumentasi di `CLAUDE.md` bagian 5 dan 8 sudah diperbarui dengan
    arsitektur dan jebakan baru ini.
  - Satu uji lama yang goyah (`test_sidebar_gerak.js`, ambang waktu 45 ms
    terlalu ketat saat CPU sibuk) sudah dikuatkan jadi 80 ms dan diukur
    sampai 3 kali, diverifikasi dengan 12 proses paralel di mesin 2 inti.
  - Seluruh rangkaian uji (`tools/jalankan-uji.js`, termasuk yang butuh
    PostgreSQL) lulus semua sebelum dikirim.

---

## 3. Tugas yang DIREKOMENDASIKAN tapi BELUM dibuat

### A. Risiko performa (dari sesi 2 Oktober 2026), status per 3 Oktober 2026

**Sudah dikerjakan 3 Oktober 2026:** nomor 1 (respons besar), nomor 4 (xlsx 0.18.5),
dan B1 di bawah (Kompres PDF). Nomor 2 diukur lalu sengaja tidak diubah. Rinciannya:

- **A1 selesai.** Daftar Penghimpunan dan Pentasyarufan dikirim padat: 15.000 baris
  7,72 MB menjadi 3,73 MB, di bawah batas 4,5 MB. Dijaga `tools/test_daftar_padat.js`
  dan `test_performa_ui.js`. Bukan paging di server, karena pencarian dan saringan
  klien bekerja di atas SEMUA baris. Kalau data kelak melewati sekitar 18.000 baris
  (3,73 MB x 18/15 ≈ batas 4,5 MB), barulah paging server diperlukan.
- **A2 diukur, tidak diubah.** Membuka 15.000 baris Penghimpunan terukur 580 ms (tiga
  kali ukur: 596, 582, 578; Pentasyarufan 4.000 baris 405 sampai 538 ms), termasuk
  navigasi dan boot. Membuat HTML hanya untuk baris yang digambar menghemat paling banyak
  sebagian dari itu, di berkas `app.js` 600 KB. Tidak sepadan.
- **A4 selesai.** `tools/test_xlsx_lokal.js`: 8 fungsi `XLSX.*` yang dipakai aplikasi
  semuanya ada di 0.18.5.

Sisa yang masih terbuka dari daftar lama (nomor 3, 5, 6) tetap seperti tertulis di bawah.


1. **Respons ListPenghimpunan bisa sekitar 7,8 MB pada 15 ribu baris.**
   Vercel membatasi respons fungsi sekitar 4,5 MB. Belum diverifikasi
   apakah gzip menyelamatkan ini di produksi. Kalau data pemilik sudah
   sebesar itu atau mendekati, perlu dibuatkan paging di server (kirim per
   halaman, bukan semua baris sekali jalan). Ini pekerjaan terpisah, belum
   disentuh sama sekali.
2. **`fdate`, `rp`, dan HTML per baris masih dibangun untuk SEMUA baris**
   begitu data datang dari server, bukan cuma yang digambar duluan. Cukup
   cepat di CPU biasa, tapi kalau jumlah baris naik jauh lebih banyak dari
   15 ribu, ini layak dibuat malas (bangun HTML hanya untuk baris yang
   benar-benar akan digambar).
3. **Perubahan font non-blocking dan boot di `DOMContentLoaded` belum diukur
   di jaringan lambat sungguhan** (3G/4G, bukan di sandbox). Baru diukur di
   kondisi jaringan cepat/lokal.
4. **Pustaka xlsx diturunkan dari CDN 0.20.3 ke lokal 0.18.5.** Uji impor
   sudah dijalankan ulang dengan versi ini dan lulus, tapi belum ada
   pemeriksaan sengaja mencari fitur yang cuma ada di 0.20.3 dan tidak ada
   di 0.18.5.
5. **Baca pertama setelah tulis nyata masih dihitung ulang** (sekitar 0,5
   detik di sandbox). Bisa dipercepat lagi kalau pemilik merasa masih
   terasa, tapi belum dikerjakan karena belum ada laporan ini mengganggu.
6. **Cold start Vercel Hobby tidak bisa dihilangkan** dari sisi kode. Ini
   catatan batasan platform, bukan tugas yang bisa diselesaikan.

### B. Surat & Pengajuan

1. **Kompres PDF: jalur sukses sudah teruji (3 Okt 2026)** di `test_surat_ui.js`
   bagian D2 dengan PDF 3 halaman sungguhan dan pdf.js lokal (3.11.174, dipindah dari
   cdnjs). Yang MASIH belum teruji: keluaran PDF akhir dari jsPDF asli, karena jsPDF
   tetap dari cdnjs dan di uji ditiru. Menyalin jsPDF 2.5.1 ke `js/vendor` akan
   menutupnya. Ketemu dan diperbaiki sekalian: skrip yang gagal diunduh tertinggal di
   halaman, jadi percobaan kompres kedua dianggap "sudah termuat" lalu error.

### C. Milik pemilik, bukan kode (dari CLAUDE.md bagian 10, per 29 Sept 2026)

1. **Google Drive untuk cadangan belum disetel.** Semua cadangan masih di
   tabel `cadangan` dalam Supabase yang sama dengan basis data utama. Kalau
   Supabase bermasalah, tidak ada salinan di tempat lain. Panduan ada di
   `PANDUAN-CADANGAN.md`.
2. **Tujuh rekening bank** muncul di jurnal tapi belum terdaftar di menu
   Rekening.
3. **Data belum valid di berkas Excel**: jurnal Jafit MAR baris 236 (kredit
   kosong untuk Infak Terikat Lazismu UMY, selisih Rp 5.000.000), dan empat
   baris Kas Amil bernominal kosong di FEB dan SEP.
4. **Nama kantor yang masih perlu digabung manual**, misalnya "ULL Masjid"
   (membawa Rp 15.000.000) yang cocok dengan lebih dari satu kantor.

### D. Catatan/utang teknis lain yang masih menggantung

1. Sekitar 200 kunci modul hasil migrasi masih perlu diambil ulang dengan
   `ekspor-redis.js --lanjut`.
2. Lima aturan `balasan` yatim (tanpa pemilik yang jelas) masih ada di
   basis data produksi.
3. Proyek Supabase gratis dijeda otomatis setelah 7 hari tanpa aktivitas.
   Aplikasi dipakai harian jadi biasanya aman, tapi jadi risiko kalau ada
   libur panjang.

### E. Kebersihan berkas memori lama (temuan baru, 3 Oktober 2026)

`MEMORY.md` dan `PROJECT_MEMORY.md` di akar proyek SUDAH SANGAT USANG: masih
menyebut Upstash Redis dan Google Sheets sebagai basis data (sudah pindah ke
Supabase PostgreSQL sejak lama), masih menyebut path lokal lama
`C:\Users\2024\.gemini\antigravity\scratch\laz-vercel`, dan daftar fiturnya
jauh ketinggalan dari keadaan sekarang. `CLAUDE.md` sudah menjadi sumber
kebenaran dan `AGENTS.md` sudah mengarahkan ke sana, tapi dua berkas usang
ini masih ada di akar proyek dan bisa menyesatkan model lain yang membacanya
tanpa tahu isinya basi. **Belum dihapus atau ditandai usang**, karena itu
keputusan pemilik: tawarkan untuk menghapus keduanya (isinya sudah
sepenuhnya tercakup, dan lebih akurat, di `CLAUDE.md`), atau kalau pemilik
mau menyimpannya sebagai arsip sejarah, beri judul/catatan tegas di baris
pertama bahwa berkas itu usang dan tidak dipakai lagi.

---

### F. Temuan 3 Oktober 2026 yang belum diputuskan pemilik

1. `PANDUAN-BROADCAST.md` menyebut cron `/api/wa-dispatch` yang tidak ada. Sudah
   dikoreksi: antrean didorong gateway dan saat kampanye dibuat, `vercel.json` hanya
   punya cron backup. Menjadwalkan `/api/cron/blast-antrean` sebagai penyapu harian
   BELUM dilakukan karena mengubah perilaku kirim (pesan tertunda bisa terkirim jam
   tak terduga). Keputusan pemilik.
2. `data/ekspor-redis-2026-09-26T....json` (±48 MB) masih di folder proyek. Masuk
   `.gitignore`, tapi berisi data lembaga. Pindahkan atau hapus bila migrasi dianggap
   selesai.
3. Dua panduan pindah server (`PANDUAN-PINDAH-KE-SERVER.md`, `PANDUAN-PINDAH-SUPABASE.md`)
   masih ditulis sebagai rencana dan menyebut Redis sebagai jalan mundur.

## 4. Status pengiriman kode terakhir

Sesi 2 Oktober 2026 (perbaikan performa) sudah terkirim lengkap ke
`D:\Project\LAZDigital` dan diverifikasi diff-nya sebelum ditulis. Pemilik
masih perlu menjalankan `uji-sebelum-deploy.bat` lalu `deploy.bat` di
komputernya sendiri, hard refresh di peramban, dan mencentang izin
"Surat & Pengajuan" untuk akun yang memerlukannya kalau belum.
