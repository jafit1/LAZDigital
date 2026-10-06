# LAZDigital: panduan untuk model AI yang mengerjakan proyek ini

Berkas ini dibaca lebih dulu sebelum menyentuh kode apa pun. Isinya bukan
dokumentasi fitur, melainkan **aturan main dan jebakan yang sudah terbukti
menggigit**. Hampir semua yang tertulis di sini lahir dari kekeliruan nyata
yang pernah lolos ke produksi, bukan dari teori.

---

## 1. Apa ini

Aplikasi pencatatan zakat, infak, dan sedekah untuk **Lazismu Daerah Bantul**.
Dipakai amil sungguhan setiap hari untuk mencatat penerimaan, penyaluran,
saldo kantor layanan, dan laporan bulanan.

- Produksi: **lazdigital.my.id** (Vercel)
- Repositori GitHub: **jafit1/LAZDigital**, dan repositorinya **PUBLIK**
- Folder kerja: `D:\Project\LAZDigital`
- Proyek pendamping: WhatsApp gateway di `D:\Project\Blast Uyeee\wagateway`,
  berjalan di VPS pada `/opt/wagateway`

**Uangnya sungguhan.** Angka di aplikasi ini dipakai untuk membagi hak amil
dan hak kantor layanan. Kesalahan hitung bukan bug tampilan, melainkan uang
yang salah bagi. Karena itu setiap perubahan yang menyentuh angka harus
dibuktikan dengan uji, bukan dengan keyakinan.

---

## 2. Bahasa dan gaya

Ini bukan selera, ini aturan.

| Hal | Aturan |
|---|---|
| Bahasa jawaban ke pengguna | **Bahasa Indonesia** |
| Tanda em dash (—) | **Dilarang** dalam tulisan untuk pengguna. Pemilik menyebutnya "simbol AI". Pakai koma, titik dua, atau tanda kurung. |
| Nama variabel, fungsi, kelas CSS | Bahasa Indonesia (`hitungSaldoLayanan`, `_barisKantor`, `.md-bidang`) |
| Komentar di kode | Bahasa Indonesia, menjelaskan **KENAPA**, bukan APA. Komentar yang bagus di repo ini menceritakan kekeliruan yang pernah terjadi dan angka hasil pengukurannya. |
| Teks di layar | Bahasa manusia, bukan istilah teknis. "Kantor bayangan", bukan "duplicate entity". |

Contoh komentar yang sesuai gaya repo ini:

```js
/* minmax(0,1fr), bukan 1fr. "1fr" sebenarnya minmax(auto,1fr): kolom boleh
   melar melewati jatahnya kalau isinya panjang. Akibatnya empat kartu yang
   seharusnya sama lebar terukur 297, 239, dan 201 piksel. */
```

Angka hasil pengukuran itu penting. Tanpa angka, komentar berikutnya akan
menghapusnya karena "kelihatannya tidak perlu".

---

## 3. Aturan keras

Sepuluh hal di bawah ini kalau dilanggar akan merusak sesuatu, dan sebagian
besar tanpa menimbulkan galat sama sekali.

### 3.1 Repositori ini PUBLIK

Tidak boleh ada rahasia masuk git, termasuk di `vercel.json`. Yang hidup
sebagai environment variable saja: `DATABASE_URL`, `RAHASIA_SESI`,
`CRON_SECRET`, `BLAST_AGEN_TOKEN`, `OCR_API_KEY`, kunci penyedia AI,
`GDRIVE_REFRESH_TOKEN`. Berkas `.env.local`, `laz.json`, `kunci.txt` ada di
`.gitignore` dan harus tetap di sana. Folder `sessions/` milik WhatsApp setara
akses penuh ke WhatsApp lembaga, jangan pernah di-commit.

Saat menulis uji atau contoh data, **jangan memakai data lembaga yang
sebenarnya**. Pakai nama dan angka karangan.

### 3.2 Batas 12 Serverless Function di Vercel

Paket Hobby membatasi **12 fungsi**. Yang dihitung: setiap berkas `.js` di
`api/` yang tidak berawalan garis bawah, termasuk yang di dalam subfolder.

Keadaan sekarang: **10 dari 12**.

```
api/ai.js  api/backup.js  api/blast-agen.js  api/blast-masuk.js  api/blast.js
api/fund.js  api/media.js  api/ocr.js  api/rpc.js  api/cron/blast-antrean.js
```

Berkas `api/_engine.js`, `api/_drive.js` tidak dihitung karena berawalan `_`.

Menambah satu berkas baru di `api/` berarti menambah satu fungsi. Kalau sudah
12, build **gagal** dan yang tampil di log cuma tumpukan peringatan Node
version, bukan pesan yang jelas. Tambahkan tindakan baru sebagai action di
dalam fungsi yang sudah ada (lewat `REGISTRY` di `_engine.js`), bukan sebagai
berkas baru. Dijaga oleh `tools/uji_batas_vercel.js`.

### 3.3 Akhiran baris berbeda per berkas

Repo ini campuran CRLF dan LF. **Mengubahnya diam-diam membuat diff seluruh
berkas dan menyembunyikan perubahan yang sebenarnya.** Periksa dulu sebelum
menulis:

| CRLF | LF |
|---|---|
| `api/rpc.js`, `api/blast.js`, `api/fund.js` | `api/_engine.js`, `api/backup.js`, `api/media.js`, `api/ai.js` |
| `lib/blast/db.js`, `lib/fund/himpunan.js`, `lib/media/db.js` | `lib/laz-pg.js`, `lib/laz-skema.js`, `lib/kv-postgres.js`, `lib/blast/percakapan.js`, `lib/media/permohonan.js` |
| `src/public/app.js`, `src/public/blast.js`, `src/public/fund.js` | `src/public/ai.js`, `src/public/media.js`, `src/public/styles.css` |
| `src/public/js/lz-ui.js`, semua `*.bat` | semua `tools/*.js`, `lib/surat/*.js`, `src/public/surat.js`, `src/public/surat.html`, `src/public/lacak.html`, `src/public/harian.html` |

Cara aman menyunting dengan Python:

```python
import io
s = io.open(p, 'r', newline='', encoding='utf-8').read()   # newline='' menjaga apa adanya
# ... ubah ...
io.open(p, 'w', newline='', encoding='utf-8').write(s)
```

Saat menyusun teks baris baru, gabungkan dengan akhiran baris berkas itu
(`nl.join([...])` dengan `nl = '\r\n'` atau `'\n'`), jangan asal `\n`.

### 3.4 Pemuatan tabel bertahap (`PerluLembar`)

`lib/laz-pg.js` hanya memuat `Users`, `Sessions`, `Settings` di awal. Tabel
lain dimuat saat dibutuhkan: `readAll(SHEETS.X)` melempar galat `PerluLembar`,
`jalankanRPC` menangkapnya, menambah tabel itu, lalu mengulang dari awal
(maksimal 24 putaran).

**Akibatnya yang sering dilupakan:**

- Fungsi API boleh dipanggil ulang beberapa kali dalam satu permintaan. Jangan
  menaruh efek samping yang tidak boleh berulang di dalamnya.
- Menambahkan `readAll` ke jalur yang tadinya tidak membaca tabel itu akan
  menambah satu putaran. Itu wajar, bukan bug.
- **Galat `PerluLembar` tidak boleh dibungkus.** Pernah terjadi: impor
  membungkusnya jadi `new Error('Gagal memproses teks: ' + e.message)`,
  sinyal ulangnya hilang, dan impor berhenti dengan pesan
  `Tabel "Penghimpunan" belum dimuat`. Penjaganya sekarang `_lolosLembar()`
  di `_engine.js` dan `lembarDari()` di `laz-pg.js`.

### 3.5 Izin dijaga di server, bukan disembunyikan di tampilan

Menyembunyikan tombol bukan izin. Setiap tindakan memeriksa
`_requirePerm(token, modul, aksi)` di server. Kalau pagar hanya di layar,
pembagian peran cuma sugesti: id di URL sama gampangnya diketik.

Modul izin sekarang (`MODULES` di `_engine.js`):

```
dashboard, saldo, saldokll, penghimpunan, pentasyarufan, laporan,
rekening, layanan, users, settings, donatur, log, saldodaerah,
broadcast, fundraising, ai, media, surat
```

Aksi: `view`, `create`, `edit`, `delete`. Modul yang hanya masuk akal untuk
dilihat didaftarkan di `MODUL_AKSI` supaya kotak centang lain tidak muncul:
`dashboard`, `saldo`, `saldokll`, `saldodaerah`, `log`.

**Memecah atau mengganti nama modul menyentuh data yang sudah tersimpan.**
Izin tiap akun tersimpan sebagai JSON berisi kunci per modul. Akun lama tidak
punya kunci yang baru, jadi tanpa jembatan mereka kehilangan menu pada hari
deploy padahal tidak ada yang mencabut haknya. Polanya ada di `MODUL_ASAL`
(`_engine.js` dan `app.js`), dan syaratnya ketat: jembatan hanya dipakai kalau
kuncinya **belum pernah ada**, supaya izin yang sudah sengaja dicabut tidak
hidup lagi.

### 3.6 Jangan mengarang kelas CSS

Kelas yang ditulis di JS tetapi tidak ada di `styles.css` tidak menimbulkan
galat apa pun. Halamannya tetap terbuka, dan yang muncul cuma tampilan yang
"agak aneh". Pernah terjadi: `.lbl`, `.inp`, `.tabel`, `.tabel-bungkus` dipakai
35 kali di modul Media dan tidak satu pun ada isinya.

Pakai komponen yang sudah ada:

| Kebutuhan | Komponen rumah |
|---|---|
| Field form | `.fgrid` + `.fld[data-col="N"]` + `<label>` |
| Keterangan di bawah field | `.fld-ket` (merah untuk kesalahan: `.fld-msg`) |
| Baris pilihan bercentang | `.penerima` + `.penerima-baris` + `.pilih-nama` + `.pilih-ket` |
| Tabel | `<div class="tabel-geser"><table>` (bukan kelas sendiri) |
| Kartu angka dashboard | `.kpis-v2` + `.kpi-v2` |
| Widget dashboard | `.dgrid` + `.wc` + `.wc-h` + `.wc-t .dot` + `.wc-b` |
| Tanggal dan dropdown | `src/public/js/lz-ui.js` (jangan pakai bawaan peramban) |

Dijaga oleh bagian R di `tools/test_media_fitur.js`, yang membandingkan setiap
kelas di `media.js` dengan isi `styles.css`.

### 3.7 Ukur, jangan membaca

Aturan CSS dan pencocokan nama adalah dua tempat yang paling sering "tertulis
benar tetapi tidak berlaku". Tidak ada galat, dan yang terjadi cuma tampilan
atau angka yang meleset. **Yang menemukan selalu pengukuran.**

- Untuk tampilan: `getBoundingClientRect`, `getComputedStyle`, bandingkan
  angkanya di beberapa lebar layar. Alat yang sudah ada: `tools/ukur-media.js`,
  `tools/ukur-sisi.js`, `tools/ukur-percakapan.js`.
- Untuk data: jalankan kode produksinya atas data tiruan yang bentuknya sama
  dengan yang sungguhan, lalu bandingkan angka keluarannya.
- Sebelum mengukur waktu kueri PostgreSQL, jalankan
  `VACUUM FULL ANALYZE kv` lebih dulu. Tabel yang kembung karena uji berulang
  pernah membuat satu kueri terukur 746 ms padahal sebenarnya 48 ms.

### 3.8 Setiap perbaikan ditemani uji yang terbukti gagal dulu

Bukan sekadar menambah uji. Buktikan dulu ujinya **gagal tanpa perbaikan**,
baru pasang perbaikannya. Uji yang lulus di dua-duanya tidak menjaga apa pun.

Simpan ujinya sebagai berkas tetap di `tools/`, dan daftarkan di `DAFTAR`
pada `tools/jalankan-uji.js` (pelari yang dipanggil `uji-sebelum-deploy.bat`).

Uji dijalankan **bersamaan**, jadi uji baru tidak boleh menulis ke tempat yang
dipakai uji lain. Penyimpanan lokal Broadcast/Fundraising/AI/Media sudah
mengikuti `LAZ_DATA_LOKAL` (folder sementara per uji); kalau uji perlu
menghapus folder datanya, pakai `require('./_folder-data.js')(AKAR)`, jangan
`path.join(AKAR, '.data')`. Uji yang terpaksa berbagi berkas proyek dijadikan
satu kelompok di `aturGrup()` supaya bergiliran.

### 3.9 `&` di dalam `echo` pada berkas .bat

`echo --- Fitur Media & Desain ---` membuat Windows menganggap `Desain` sebagai
perintah, lalu muncul `'Desain' is not recognized as an internal or external
command`. Pakai kata "dan" di `echo` berkas .bat, jangan `&` (atau tulis `^&`).
Label uji sekarang ada di `tools/jalankan-uji.js`, jadi aturan ini tinggal
berlaku untuk `echo` di .bat.

### 3.10 Keamanan akun, sesi, dan pintu dari luar

Lima celah ini ditutup pada 30 September 2026. Semuanya lahir dari pola yang
sama: pemeriksaan ada, tetapi di tempat yang salah atau terlambat. Jangan
membukanya lagi tanpa sengaja.

- **Hanya superadmin yang menyentuh superadmin.** `apiSaveUser` dan
  `apiDeleteUser` menolak siapa pun selain superadmin yang membuat, mengangkat,
  menyunting, atau menghapus akun superadmin. Selain superadmin, orang hanya
  boleh MEMBERI izin yang ia sendiri punya (mencabut selalu boleh). Superadmin
  aktif terakhir tidak bisa diturunkan. Dulu 19 dari 30 pemeriksaan gagal dan
  admin kantor benar-benar bisa mengangkat dirinya jadi superadmin.
- **Peramban tidak pernah menyimpan sandi.** "Ingat saya" memakai token acak
  30 hari (`laz_ingat`). Di tabel `Sessions` yang tersimpan hanya hash-nya
  dengan awalan `ing:`, dan `authUser` menolak apa pun yang berawalan `ing:`.
  Token ditukar lewat `loginIngat`. Gagal jaringan saat menukar BUKAN alasan
  memanggil `doLogout()`: hanya penolakan tegas (`ok:false`) yang boleh.
- **`authUser` memeriksa `aktif` di setiap permintaan**, bukan cuma saat
  login. Menonaktifkan atau menghapus akun mematikan semua sesi dan token
  ingatnya. Modul lain ikut tertutup karena memeriksa lewat `engine.cekIzin`.
- **`/api/blast-masuk` tertutup secara bawaan.** Hanya terbuka kalau
  `BLAST_MASUK_KUNCI` disetel dan penyedia menyertakannya (`?kunci=` atau
  header `x-masuk-kunci`). Gateway mandiri tidak lewat sini.
- **`/api/backup` memeriksa izin sebelum memuat atau menyimpan apa pun.**
  Pemulihan menolak selain superadmin dan konfirmasi selain `PULIHKAN`
  SEBELUM titik batal `sebelum-pulih` disentuh.

Gelombang kedua pada hari yang sama (`tools/test_keamanan_lanjutan.js`):

- **Tautan dashboard publik** hanya bisa dinyalakan atau dimatikan pemegang
  izin ubah Pengaturan. Melihat tautannya cukup izin Dashboard.
- **Settings ke peramban disaring** lewat `_settingsAman()`: `lg_*` tidak
  pernah dikirim, `publicToken` hanya ke pemegang izin lihat Pengaturan.
  `apiSaveSettings` menolak kunci milik sistem (`_kunciSistem()`: `lg_*`,
  `uf_*`, `um_*`, `lhToken*`, `publicToken`, `publicEnabled`, `aliasKantor`).
  Urutan menu kiri (`um_<id>`) hanya ditulis lewat `apiUpdateMyProfile`
  `urutanMenu`, berisi daftar id menu berhuruf kecil saja.
- **Impor lewat URL** hanya https, dan setiap alamat IP hasil DNS harus
  publik, termasuk sesudah pengalihan (`_periksaUrlImpor`, `_ambilUrlImpor`,
  `redirect: 'manual'`). Batas unduhan 20 MB.
- **Log aktivitas** hanya bisa dibersihkan superadmin.
- **Verifikasi kwitansi publik** hanya mengirim nominal kalau kode acak di QR
  (10 huruf pertama `id`) ikut cocok. Nomor saja cuma menyatakan sah.
- **Header keamanan** dipasang di rute pertama `vercel.json` (`continue: true`).
  Kamera, mikrofon, dan GPS sengaja diizinkan untuk situs sendiri karena
  dipakai OCR, AI Asisten, dan Fundraising.
- **`deploy.bat` membatalkan deploy** kalau ada berkas sensitif di daftar yang
  akan di-commit, dan melepasnya lagi dari staging. Berkas yang sedang
  dikeluarkan (`git rm --cached`) tidak ikut diperiksa (`--diff-filter=d`).
- **Penguncian login** ketat per (username + IP) dan per IP; per username saja
  hanya longgar (20 dan 40 kali). Dulu penyerang bisa mengunci superadmin
  asli dari luar dengan 12 tebakan.
- **Token sesi disimpan sebagai hash** berawalan `h:` (`_hashSesi`,
  `_cariSesi`). Uji dan alat JANGAN mengambil token dari tabel Sessions;
  ambil dari hasil `login`. Baris lama yang apa adanya tetap diterima sampai
  kedaluwarsa.

Aturan umumnya: **izin diperiksa paling depan**, sebelum membaca basis data,
sebelum menulis apa pun, dan sebelum membuat salinan.

---

## 4. Peta berkas

```
LAZDigital/
├─ api/                      Serverless function (batas 12, terpakai 10)
│  ├─ _engine.js             ~316 KB. Inti aplikasi: seluruh aturan buku besar,
│  │                         izin, laporan, impor jurnal, saldo KLL/ULL.
│  │                         Hasil porting dari Google Apps Script, sinkron
│  │                         penuh, berjalan di atas SHIM ~48 baris di rpc.js.
│  ├─ rpc.js                 Pintu masuk RPC + SHIM getSS()/SpreadsheetApp
│  ├─ backup.js              Cadangan otomatis + pemulihan
│  ├─ blast.js               Broadcast WhatsApp (modul baru)
│  ├─ blast-agen.js          Pintu untuk gateway WhatsApp menarik antrean
│  ├─ blast-masuk.js         Pesan masuk dari gateway
│  ├─ fund.js                Fundraiser lapangan
│  ├─ media.js               Permohonan desain ke tim media
│  ├─ ai.js                  AI Asisten
│  ├─ ocr.js                 Scan kwitansi
│  ├─ _drive.js              Google Drive (tidak dihitung fungsi)
│  └─ cron/blast-antrean.js  Pemroses antrean broadcast
├─ lib/
│  ├─ laz-pg.js              Pemuatan bertahap + jalankanRPC + kunci optimistik
│  ├─ laz-skema.js           Definisi 13 tabel buku besar (TABEL, NAMA_TABEL)
│  ├─ kv-postgres.js         Emulator perintah Redis di atas tabel kv/kv_set
│  ├─ blast/                 db, antrean, kontak, percakapan, siap
│  ├─ fund/                  himpunan, dan lainnya
│  ├─ media/                 db, sesi-laz, jenis, tim, permohonan
│  ├─ surat/                 db, surat (aturan), api (tindakan surat.*)
│  └─ ai/                    db, penyedia, alir
├─ src/public/               Frontend, vanilla JS, tanpa build step
│  ├─ index.html + app.js    Aplikasi utama (~525 KB)
│  ├─ blast.html + blast.js
│  ├─ fund.html + fund.js
│  ├─ ai.html + ai.js
│  ├─ media.html + media.js
│  ├─ surat.html + surat.js  Surat & Pengajuan (lewat /api/media)
│  ├─ lacak.html             Lacak Pengajuan untuk pemohon (tanpa masuk)
│  ├─ styles.css             Satu berkas untuk semua halaman (~279 KB)
│  └─ js/lz-ui.js            Dropdown dan pemilih tanggal bertema
├─ tools/                    Uji dan alat, semuanya LF
├─ sql/01-skema.sql          Skema PostgreSQL
├─ uji-sebelum-deploy.bat    Jalankan SEBELUM deploy
├─ deploy.bat                git add, commit, push (Vercel yang membangun)
└─ vercel.json               Region sin1, maxDuration 30, 2 cron harian (backup, penyapu antrean broadcast; batas Hobby)
```

---

## 5. Arsitektur dan alur data

```
Peramban  ──POST /api/rpc──▶  rpc.js  ──▶  laz-pg.js  ──▶  Supabase PostgreSQL
{fn, args}                      │            (muat tabel       tabel kv / kv_set
                                │             seperlunya)      + 17 tabel buku besar
                                ▼
                         _engine.js runRPC
                         (sinkron, arrays-of-arrays
                          lewat DB.sheets[nama])
```

- **Tabel**: 13 tabel buku besar di `laz-skema.js` (Users, Rekening, Layanan,
  Donatur, Settings, Penghimpunan, Pentasyarufan, UangMuka, Transfer, Mutasi,
  SaldoAwal, Sessions, AuditLog), ditambah 4 tabel infrastruktur di PostgreSQL
  (`kv`, `kv_set`, `cadangan`, `migrasi`). Total 17, itulah angka yang dicetak
  `tools/cek-postgres.js`.
- **Penyimpanan**: Supabase PostgreSQL (pooler porta **6543**, bukan 5432).
  Dulu Upstash Redis, sebagian nama dan komentar masih menyebut "Redis" atau
  "Upstash" sebagai warisan. Jangan percaya tulisan itu begitu saja, periksa
  `pakaiPostgres()`.
- **Bentuk data di memori**: `DB.sheets['Penghimpunan']` = array of array,
  baris pertama kepala kolom. Warisan Apps Script, sengaja dipertahankan
  supaya `_engine.js` tidak perlu ditulis ulang.
- **Tidak ada build step.** Frontend dilayani apa adanya dari `src/public`.
  Tidak ada React, tidak ada bundler.
- **Hasil bacaan diingat** (`INGAT` di `lib/laz-pg.js`, 2 Okt 2026). Sembilan
  fungsi baca murni (daftar `BACA`: Dashboard, ListPenghimpunan,
  ListPentasyarufan, Saldo, SaldoLayanan, DonaturAnalytics, ListDonatur, RAPBData,
  LaporanHarian, semuanya aksi `view`) disimpan per fn + argumen (token ikut) +
  hari WIB. Penanda sah-tidaknya `kunciCache` berasal dari baris kv `laz:cver`
  `{c, v}`: `c` ACAK (bukan nomor versi, nomor bisa berulang setelah DB dibuat
  ulang) dan hanya berubah bila buku besar benar-benar berubah. Tulisan yang
  hanya menyentuh `AuditLog`, `Sessions`, atau props `_aksesTerakhir` tidak
  mengubahnya. Saat kena cache izin tetap dicek hidup (`engine.cekIzin`) dan
  catatan akses tetap ditulis (`engine.catatAkses`). Anggaran memori
  `LAZ_INGAT_MAKS` (bawaan 48e6 karakter, LRU; `0` mematikan). Hasil dikirim
  sebagai JSON mentah (`JsonMentah`, `ctx.izinMentah` dari `api/rpc.js`).
- **`pipeline` di `lib/kv-postgres.js`** mengelompokkan GET berurutan menjadi
  satu MGET (potongan 1000); pipeline semua-GET tanpa transaksi. Dipakai
  `surat.daftar` (404 kueri jadi paling banyak 4).
- **Tabel bertahap di klien** (`tabelBertahap` di `app.js`): Penghimpunan,
  Pentasyarufan, Donatur hanya menggambar 100 baris pertama (`TABEL_BATCH`),
  sisanya dimuat oleh `IntersectionObserver` saat digulir. Pencarian dan
  saringan bekerja di atas SEMUA baris (teks cari `c` sudah dihitung), bukan
  yang tampak saja. `applyFilters` ditunda 80 ms.
- **Daftar besar dikirim padat** (3 Okt 2026). `apiListPenghimpunan` dan
  `apiListPentasyarufan` mengirim objek per baris, jadi 22 nama kolom diulang
  di setiap baris: 15.000 baris terukur 7,72 MB, padahal Vercel membatasi badan
  respons fungsi sekitar 4,5 MB (daftar akan berhenti terbuka pada sekitar 9.000
  baris). Klien (`_rpcCall` di `app.js`) menyertakan `padat:1` untuk dua fungsi
  itu, `api/rpc.js` mengalihkannya lewat peta `engine.FN_PADAT` ke
  `apiListPenghimpunanPadat` / `apiListPentasyarufanPadat` (nama kolom sekali,
  tiap baris larik tanpa teks kosong di ujung, 3,73 MB), dan `_bongkarPadat`
  mengembalikannya jadi objek yang sama persis. Fungsi lama tidak berubah, dan
  jawaban yang sudah berupa larik dilewatkan apa adanya, jadi uji yang meniru
  server tidak ikut rusak. Fungsi padat didaftarkan di `BACA` sendiri (cache
  terpisah) dan di `_LOG_AKSES`. Bukan berkas baru di `api/`. Kalau menambah
  kolom ke tabelnya, tidak ada yang perlu diubah: kolom dibaca dari baris
  pertama. Jangan memangkas nilai selain `''` (angka 0 dan teks "0" sah).
- **Buka aplikasi**: boot jalan di `DOMContentLoaded`, bukan `load` (yang
  menunggu font dan skrip pihak ketiga). Font Google tidak memblokir render;
  xlsx dilayani lokal (`/js/vendor/xlsx.full.min.js`, 0.18.5, `async`) dan
  semua jalur yang memakainya lewat `siapXLSX()`.
- **Tombol tema satu tempat** (4 Oktober 2026, `src/public/js/lz-tema.js`): halaman modul (Surat, AI, Broadcast, Fundraising, Media) memuatnya sebelum skrip halaman. Klik pada `.kepala-tema` ditangkap di `document` (tahap tangkap) dan `onclick` lama tidak jalan lagi. Ikon satu SVG yang berubah bentuk lewat CSS `html[data-theme]`, menunjukkan tema TUJUAN. Peralihan memakai lingkaran yang melebar dari tombol. Sejak 5 Oktober 2026 lewat View Transitions (`gantiSapu`): peramban memotret halaman lama, memasang tema baru, lalu `clip-path: circle()` pada `::view-transition-new(root)` membuka potret halaman BARU utuh, jadi latar dan isi berganti tepat saat lingkaran menyentuhnya (keluhan pemilik: "ada bagian yang berubah warnanya dulu sebelum animasi menyentuhnya"; terukur kartu kiri bawah sudah gelap pada 370 ms padahal latarnya masih terang). Selama sapuan `html.lz-tema-vt` mematikan transisi elemen (kecuali ikon tema). Klik beruntun memakai tema TUJUAN (`tujuan`), karena pembaruan DOM View Transitions berjalan sesudah potret diambil. Peramban tanpa View Transitions memakai cara lama: `#lz-tema-dasar` menahan latar lama, `#lz-tema-lingkar` melukis latar baru dan yang dianimasikan `clip-path: circle()` (jangan `transform: scale`, gradiennya ikut mengecil jadi persegi), isi berganti lewat `html.lz-tema-halus` (0,5 detik). Semua halaman utama lain (Penghimpunan, Pentasyarufan, Saldo, Saldo KLL, Donatur, Mutasi, Laporan, Rekening, Layanan, User, Pengaturan, Log) mendapat tombol lewat `pasangTemaKepala()` di akhir `app.js` (diapit penanda `>>> pasangTemaKepala`, dibaca `test_tema_ui.js`): pengamat pada `#content` memindahkan anak kepala selain judul ke `.page-head-aksi` lalu menambah tombol, jadi pembangun HTML tiap tampilan tidak perlu diubah. Dashboard utama juga punya tombolnya (`dh-quick-btn dh-ikon kepala-tema` di `app.js`, baris `temaBtn`; `index.html` memuat `lz-tema.js` sebelum `app.js`). Jangan memberi `padding` atau `justify-content` lewat `.tn-icon` ke tombol ini, itu yang dulu membuat ikon bergeser: aturan sidebar `.app.collapsed .tn-icon` (padding 0 18px, rata kiri, `!important`) mengalahkan `.tn-icon.kepala-tema` saat menu kiri ciut (terukur kiri 21 px, kanan -3 px), jadi aturan tombol ini mengulang selektor `.app`, `.app.collapsed`, dan `.app.collapsed .topnav:hover`. Dijaga `test_tema_ui.js` (menu terbuka, ciut, dasbor, 4 lebar, 2 tema) dan `test_skala_ui.js` (halaman asli). **Warna teks di tema gelap** (5 Oktober 2026): `<button>` tanpa `color` memakai hitam bawaan peramban (nama pengguna di bilah kiri modul tidak terbaca). Ada aturan global `button{color:var(--text)}` di akhir `styles.css`; jangan menulis warna teks tetap (`#111`, `#333`) di CSS atau style inline layar, pakai `var(--text)`/`var(--muted)`. Dokumen cetak (`docShell`, kwitansi) memang berlatar putih sendiri. Dijaga `test_kontras_gelap.js`.
  Halaman di luar menu juga punya tombol (5 Oktober 2026): layar login (`#loginView`) dan `lacak.html` memakai `<button class="lz-tema-pojok kepala-tema" data-lz-tema>` (pojok kanan atas, ikon dan judul diisi `isiOtomatis()` di `lz-tema.js`); `public.html` (`.pub-tema`) dan `harian.html` (`.lh-tema`) memuat `lz-tema.js` di `<head>` tanpa defer dan membuat tombol dengan `LZTema.svg()`. `gantiTema()` lama di dua halaman itu sudah dihapus. Diuji `test_tema_ui.js` (ikon di tengah, satu tombol, ganti tema, tersimpan).
- **Logo bilah menu** (5 Oktober 2026, `src/public/js/lz-logo.js`): pojok kiri atas aplikasi utama dan kelima modul
  memakai logo SVG Lazismu Bantul (22 bagian, dari berkas contoh pemilik), BUKAN logo unggahan Pengaturan (yang itu
  tetap dipakai kwitansi, kop cetak, halaman publik). Markup memuat wadah `<span class="logo-img lz-logo-svg
  lz-logo-tunggu" data-lz-logo>`, skripnya dimuat sebelum `lz-sisi.js`. Logo bergerak (garis digambar, isi masuk,
  cahaya di tema gelap) hanya saat menu pertama kali dibuka di sesi itu: menu dibaca dari `.topnav .tn-item.active`,
  yang sudah diputar dicatat di sessionStorage `lz_logo_dilihat`, dan diputar baru saat logonya benar-benar terlihat
  (IntersectionObserver; di halaman utama bilahnya tersembunyi di balik layar masuk). `applyBranding()` hanya
  memperbarui `aria-label` bila logo sudah ada: menulis ulang innerHTML memutus animasi yang sedang berjalan.
  Ukuran: 48 px (38 px di bawah 1024 px), dan saat bilah ciut 78% (bukan 56% milik logo unggahan 3:1) dengan geseran
  `--lz-logo-x-ciut` yang diukur `lz-logo.js`. Pemilih CSS memakai `#brandBox` supaya menang atas tumpukan aturan
  `.logo-img` di bagian 31 dan 55. Dijaga `test_logo_ui.js`.
- **Kepala dasbor dan menu akun HP** (5 Oktober 2026): Link Harian dan Atur Layout tidak lagi di menu titik
  tiga, tetapi ikon (`dh-sekali`) di samping tombol catat dan periode. Di HP (`html.plat-hp`, di bawah 640 px) ikon
  itu dan tombol tema kepala halaman disembunyikan, dan foto profil (`klikProfil`) membuka menu akun (`#akunMenu`:
  pengaturan akun, Pengaturan aplikasi, Link Publik, Link Harian, Atur layout bila di dasbor, tema). Di layar lebar
  foto profil tetap langsung `openProfile()`. Di HP tombol catat (`dh-catat`) juga disembunyikan; chip periode naik
  sebaris dengan salam (salam 19 px). Dijaga `test_logo_ui.js`.
- **Ikon Link Publik lama dihapus** (pemilik, 5 Oktober 2026): tombolnya tidak ada lagi di kepala dasbor dan menu akun
  HP. Yang tersisa: `openPublicLink()` dan tombol "Kelola Link Publik" di Pengaturan (pengelolaan token), halaman
  `public.html`, dan `apiGetPublicLinkInfo`; `test_keamanan_lanjutan.js` menjaga fungsi itu.
- **Layar loading logo** (5 Oktober 2026, `LZLogo.muat()` di `js/lz-logo.js`, gaya di akhir `styles.css`): logo SVG besar
  berlatar blur (`backdrop-filter`, putih 62% di tema terang, biru malam 62% di gelap; tanpa dukungan blur latarnya
  hampir pekat). Tampil di link publik (`harian.html`, `lacak.html`, `public.html`) hanya saat pertama dibuka per sesi
  (kunci sessionStorage `lz_muat_harian|lacak|publik`), dan di web utama hanya sesudah login lewat formulir
  (`window.__muatSetelahLogin` di `doLogin`, dibaca `startApp`), bukan saat muat ulang atau masuk otomatis. Linimasa 55%
  (sekitar 2,5 detik). Menutup menunggu animasi selesai DAN data siap (`MUAT.selesai()` di halaman publik), pengaman
  9 detik; gerak dikurangi tidak menampilkannya. Selama aktif `html.lz-muat-aktif` menahan animasi logo bilah menu
  (`siapDilihat`), yang baru bergerak sesudah penutup lepas. Kepala halaman publik memakai `LZLogo.statis()` (logo SVG
  baru), bukan logo unggahan Pengaturan. Dijaga `test_muat_logo.js`.
- **Tombol tema di HP** (6 Oktober 2026): di bawah 520 px tombol di `.page-head-aksi` menempel di pojok kanan atas kepala,
  sebaris dengan judul (`position:absolute !important`, `top:-5px`), judul diberi ruang kanan 50 px; tombol lain (Tambah,
  Impor) tetap di baris bawah. Berlaku untuk semua modul. Di aplikasi utama tombolnya memang disembunyikan di HP (ada di
  menu akun). Dijaga `test_tema_ui.js`.
- **Dua modul punya sesi sendiri**: `lib/media/sesi-laz.js` dan padanannya di
  fund/blast/ai memetakan izin LAZDigital ke izin modulnya.

---

## 6. Alur kerja wajib

```
1. Ubah kode
2. node tools/<uji yang relevan>.js     (cepat, sambil mengerjakan)
3. uji-sebelum-deploy.bat               (semuanya, wajib, 1 sampai 2 menit)
4. deploy.bat                           (git add + commit + push)
5. Tunggu Vercel selesai, lalu Ctrl+Shift+R di peramban
```

`deploy.bat` hanya mendorong ke GitHub. Vercel yang membangun. Kalau build
gagal, **yang jalan di produksi masih versi lama**, dan gejalanya "perbaikannya
tidak kelihatan" padahal berkasnya sudah benar di komputer. Selalu periksa
status deployment sebelum menyimpulkan kodenya salah.

Untuk WhatsApp gateway: salin `src/wa.js`, `src/agen.js`, `uji_*.js`,
`package.json` ke `/opt/wagateway`, jalankan `npm run uji`, restart layanan,
lalu **tautkan ulang nomor WhatsApp** kalau yang berubah menyangkut riwayat.

---

## 7. Daftar uji

Dijalankan oleh `uji-sebelum-deploy.bat` lewat `tools/jalankan-uji.js`:
bersamaan (3 sampai 5 sekaligus, yang paling lama dimulai lebih dulu), satu
baris per uji, rincian dan alamat log lengkap hanya untuk yang GAGAL. Satu per
satu seperti dulu: `uji-sebelum-deploy.bat --urut`. Sebagian saja:
`uji-sebelum-deploy.bat impor kll` (hasilnya tidak disebut aman untuk deploy).

**Uji yang membuka Chromium dibatasi 2 sekaligus** (3 kalau prosesor 8 inti
ke atas; ubah dengan `--peramban=N`). Di komputer pemilik (Windows) enam
sekaligus membuat uji yang di sini 7 detik jadi 58 detik, dan empat uji
tampilan gagal karena halamannya tidak terbuka dalam 30 detik. **Uji yang
gagal diulang sekali, sendirian, di akhir**; kalau lulus, tetap tertulis
"diulang sendirian dan lulus" beserta sebab gagal pertamanya, jadi tidak
tersembunyi. Yang gagal dua kali, itu kegagalan sungguhan.

Dua uji terlama sudah dipangkas tanpa mengurangi pemeriksaan:
`test_blast_ui.js` 50 jadi 26 detik (menunggu `data-halaman-siap` yang
dipasang `blast.js`, bukan jeda tetap, dan jeda tanya QR dipendekkan lewat
`window.__ujiJedaQr`), `test_skala_ui.js` 50 jadi 29 detik (tiga lebar layar
dibuka bersamaan). Berurutan dulu 248 detik.
Uji yang mengukur waktu (`test_sidebar_gerak.js`, milidetik hitung tata letak)
bertanda `sendiri: true`: dijalankan paling akhir tanpa teman, karena saat
bersamaan terukur 78 ms lawan batas 45 ms (sendirian 15,8 ms). Uji baru yang
menunggu dengan jeda tetap (`waitForTimeout(900)`) cenderung gagal palsu saat
bersamaan; tunggu keadaannya, bukan waktunya.

**Uji tampilan tidak boleh menunggu internet** (4 Oktober 2026). Halaman memuat Google Fonts lewat `<link>` biasa, dan stylesheet yang belum selesai menahan skrip sesudahnya. Saat internet penguji lambat, uji Media gagal "waiting until load" 30 detik, uji Surat kehabisan 20 detik, uji Fundraising gagal pada isi, padahal kodenya benar. Semua `chromium.launch` kini lewat `tools/_luncurkan.js`: sekali per rangkaian ia mencoba menjangkau fonts.googleapis.com; kalau lambat atau putus, host huruf dan CDN digagalkan seketika (`--host-resolver-rules`) dan `jalankan-uji.js` mencetak catatannya. Uji baru yang membuka peramban harus memakai pembungkus itu, dan `goto` memakai `waitUntil: 'domcontentloaded'`.

Uji yang butuh Playwright akan melewati dirinya sendiri dengan kode keluar 2
kalau Playwright belum ada (`npm i -D playwright && npx playwright install
chromium`); pelarinya menampilkannya sebagai LEWAT beserta alasannya.

| Berkas | Menjaga apa |
|---|---|
| `uji_batas_vercel.js` | jumlah fungsi masih di bawah 12 |
| `test_jalankan_uji.js` | pelari uji: tiap uji punya folder data sendiri, uji yang gagal/macet/hilang terhitung gagal, keluaran ringkas, alat migrasi dan basis data percobaan bergiliran |
| `test_agen.js` | sambungan ke gateway WhatsApp, centang, lampiran |
| `test_impor_jurnal.js` | impor jurnal, tidak ada baris hilang diam-diam |
| `test_impor_jurnal_bank.js` | unggah Excel di zona WIB tidak memundurkan tanggal, akun "Penerimaan ..." di seksi mana pun (PERSEDIAAN, TRANSAKSI BANK) terhitung penghimpunan |
| `test_impor_berkas.js`, `test_impor_berkas_ui.js` | aturan kantor (KL/UL, tulisan lengkap, nama lain), temuan sebelum simpan, perbaikan di layar ikut tersimpan, baris dilewati tidak tersimpan, jenis berkas terbaca dari isinya, bagian atas jendela ringkas, pilihan massal rekap/jurnal yang mempertahankan pilihan sendiri, tombol Ubah, tombol bawah sama tinggi dan sejajar (Batal berbingkai di kiri, satu tombol utama), tombol temuan berbingkai, kotak Telusuri sejajar dengan pilihan di sampingnya, fokus tanpa rekap (tanggal dan nama KLL/ULL di depan, sisanya dilipat), fokus dengan rekap (tabel jurnal lawan rekap yang jadi "Sama" setelah disamakan), baris status di kaki jendela, kaki tidak terpotong di lebar 390 |
| `test_samakan_rekap.js` | rekap bulanan jadi patokan: angka jurnal sama dengan rekap setelah disamakan, angka rekap untuk tabel perbandingan cocok dengan itu, biaya admin bank tidak dilewati, LPJ dan label rekap yang bentrok tidak dipindah diam-diam, Closing menghitung gaji KLL yang dibayar Daerah sebagai Daerah |
| `test_tampilan_kll_menu.js` | rekap bulanan tidak wajib tetapi ditawarkan di pratinjau, Saldo KLL ringkas (sisa saldo hijau, belum LPJ bertanda merah), urutan menu kiri per akun (tarik atau panah, tersimpan di server, menu teratas jadi halaman pertama) |
| `test_link_harian.js` | link Penghimpunan Harian (donatur dan KLL/ULL): token terpisah, data pribadi tidak keluar, nama anonim jadi Hamba Allah, tanggal masa depan ditolak, memperbarui sendiri, link mati tertutup, kalender dan dropdown lz-ui (bukan bawaan), kotak cari (kantor/donatur) tidak hilang saat halaman memperbarui diri, tampilan ringkas (angka di kepala, tanpa label kotak, kartu kantor jadi saringan) |
| `test_izin_modul.js` | pemecahan izin Dashboard, akun lama tidak kehilangan menu |
| `test_izin_ui.js` | dialog Edit User, kolom kiri diam saat kanan digulir |
| `test_kantor_kembar.js` | nama KLL/ULL bertumpuk, rincian transaksi, pembanding |
| `test_cadangan_peringatan.js` | peringatan ukuran basis data tidak palsu |
| `test_blast_fitur.js`, `test_blast_ui.js` | broadcast |
| `test_percakapan.js`, `ukur-percakapan.js` | kotak masuk |
| `test_fund_fitur.js`, `test_fundraiser.js`, `test_fund_ui.js` | fundraising |
| `test_media_fitur.js`, `test_media_ui.js` | modul media |
| `test_surat_fitur.js`, `test_surat_ui.js` | modul Surat & Pengajuan: izin per centang, nomor agenda, langkah tidak bisa dilompati (juga di papan), data wajib tiap langkah, disposisi (penerima izin lihat bisa menyelesaikan miliknya), lampiran (2 MB, jenis dari isi berkas, 6 per surat, kuota, Drive, tautan), foto dikompres di peramban, PDF besar ditawari kompres atau tautan, kompres PDF berhasil (pdf.js lokal, 3 halaman) dan percobaan ulang setelah gagal unduh, surat rahasia, lacak publik tanpa catatan internal dan dibatasi 30 kali per 10 menit |
| `test_ingatan_hasil.js` | hasil bacaan buku besar yang diingat (`lib/laz-pg.js`): bacaan kedua tidak memuat tabel transaksi, sama persis dengan hitung ulang, gugur saat ada penulisan (juga dari penulis tanpa penanda), token kedaluwarsa dan izin dicabut tidak dilayani dari ingatan, catatan akses tetap tertulis tanpa menggugurkan ingatan, penanda isi acak, jawaban mentah lewat `api/rpc.js` |
| `test_kv_massal.js` | pipeline kv membaca banyak kunci dengan satu kueri (dulu satu per kunci), hasil dan urutan sama dengan satu per satu, pipeline campuran tetap atomik, daftar Surat tidak lagi satu kueri per surat |
| `test_performa_ui.js` | daftar panjang tetap lancar (10.000 penghimpunan, 4.000 penyaluran, 3.000 donatur): baris di layar dibatasi, saringan benar, gulir memuat sisanya, ketikan tidak membekukan layar; aplikasi terbuka walau server luar (CDN, Google Fonts) tidak menjawab |
| `test_daftar_padat.js` | daftar Penghimpunan dan Pentasyarufan dikirim padat (nama kolom sekali, baris sebagai larik): dibongkar di klien sama persis dengan bentuk lama (nilai, urutan, `__row`, nol dan "0" tidak terpangkas), 15.000 baris 7,72 MB jadi 3,73 MB (di bawah batas respons Vercel 4,5 MB), izin tetap diperiksa paling depan, hanya dua fungsi yang dialihkan `api/rpc.js` dan hanya bila diminta, bacaan padat ikut diingat (`BACA`), klien membongkar jawaban larik tanpa mengubahnya |
| `test_xlsx_lokal.js` | setiap `XLSX.*` yang dipanggil aplikasi ada di salinan lokal 0.18.5 (8 fungsi saat ditulis), baca dan tulis xlsx berfungsi, pemindainya sendiri terbukti menangkap nama yang tidak ada |
| `test_kontras_gelap.js`, `_kontras.js` | teks terbaca di tema gelap: pemindai menghitung rasio kontras tiap teks terhadap latar efektifnya (gradien dinilai dari henti terbaik, latar gambar dilewati) di layar masuk, tiap menu, tab Pengaturan, modal, dan halaman publik; `test_skala_ui.js` memindai tiap menu empat modul, `test_surat_ui.js` memindai Surat dan lacak |
| `test_tema_ui.js` | tombol tema terang/gelap (`js/lz-tema.js`): ikon tepat di tengah tombol (dulu menempel ke kanan, 21 px dari kiri pada tombol 38 px), bentuk bulan/matahari berganti lewat CSS, sapuan lingkaran membuka SELURUH halaman bertema baru lewat View Transitions (kartu yang belum tersentuh lingkaran masih berwarna lama; dulu terukur sudah gelap pada 370 ms), cara lama tetap jalan di peramban tanpa View Transitions, gerak dikurangi berganti langsung, lima halaman modul memuat skripnya |
| `test_logo_ui.js` | logo SVG di bilah menu (`js/lz-logo.js`): 22 bagian, rasio 3840:2574, 48 px (38 px di HP), di tengah panel dan rel, bergerak hanya saat menu pertama kali dibuka di sesi itu, diam saat kembali atau muat ulang, cahaya hanya di tema gelap, gerak dikurangi tidak bergerak, lima modul memuat logonya |
| `test_muat_logo.js` | layar loading logo: tampil sekali per sesi di link publik dan sesudah login di web utama, blur dan latar mengikuti tema, bertahan sampai data datang, tidak menahan layar bila data galat, logo bilah menunggu penutup, gerak dikurangi tanpa penutup, kepala halaman publik memakai logo SVG baru |
| `test_ai_fitur.js`, `test_ai_ui.js` | AI asisten |
| `cek-postgres.js`, `test_laz_pg.js`, `test_cadangan_pg.js`, `test_sesi_modul_pg.js` | PostgreSQL |
| `test_alat_redis.js`, `test_ekspor_redis.js` | alat migrasi warisan |
| `test_ikon.js` | tiap halaman punya ikon, tidak ada alamat basi |
| `test_sidebar_ui.js`, `test_sidebar_gerak.js`, `ukur-sisi.js` | bilah menu |
| `test_skala_ui.js` | tampilan di semua ukuran layar |
| `uji_cek_deploy.js` | apa yang benar-benar sudah sampai di GitHub |
| `test_panduan_ai.js` | panduan ini masih cocok dengan kode (akhiran baris, uji terdaftar, tanpa rahasia) |
| `test_eskalasi_user.js` | admin tidak bisa mengangkat diri jadi superadmin atau membagi izin yang tidak ia punya |
| `test_ingat_saya.js`, `test_ingat_saya_ui.js` | "Ingat saya" tanpa menyimpan sandi, token bisa dicabut, gagal jaringan tidak mengeluarkan orang |
| `test_akun_nonaktif.js` | akun nonaktif atau terhapus langsung kehilangan akses |
| `test_blast_masuk.js` | pintu pesan masuk WhatsApp menolak kiriman tanpa kunci |
| `test_pulihkan_aman.js` | pemulihan cadangan hanya superadmin, titik batal tidak bisa ditimpa orang luar |
| `test_sesi_kuat.js` | penyerang tidak bisa mengunci superadmin dari luar, token sesi tersimpan sebagai hash |
| `test_keamanan_lanjutan.js` | tautan publik, Settings yang disaring, SSRF impor URL, hapus log, kwitansi publik, header, pengaman deploy |

Alat diagnostik yang tidak ikut di `uji-sebelum-deploy.bat` karena menyambung
ke basis data produksi:

- `tools/periksa-kantor.js`: menyisir nama KLL/ULL, hanya membaca.
  `--cari <kata>`, `--rinci "<nama>"`, `--semua`
- `tools/ukur-media.js`: mengukur bentuk UI modul Media di 7 lebar layar

**Ditambahkan 5 Oktober 2026: kwitansi ke WhatsApp donatur.**

- `src/public/js/lz-kwitansi.js` (`LZKwitansi`) menggambar kwitansi di kanvas
  1600x1238 PNG mengikuti blanko Lazismu. Tidak butuh internet. Model cetak
  untuk printer portable BELUM dibuat (ditunda, menunggu printernya siap).
- Blok "KWITANSI KE WHATSAPP DONATUR" di `app.js`: kolom ke-8 "Kwitansi WA"
  di Penghimpunan, popup Kirim/Tidak sesudah simpan, tombol "Sinkron Kontak
  ke Broadcast". Status disimpan di Broadcast (kunci `kwitansi:wa:<id>`),
  bukan di tabel Penghimpunan, jadi skema PostgreSQL tidak berubah.
- Tindakan baru di `api/blast.js`: `kwitansi.kirim` (izin `pesan.kirim`),
  `kwitansi.status` (`pesan.lihat`), `kontak.sinkronDonatur` (`kontak.ubah`).
  Kontak dicari lewat nomor ternormalisasi, tidak pernah digandakan; yang
  sudah ada hanya diberi label Donatur. Kontak berhenti/daftar hitam tidak
  dikirimi. Pengurus kantor layanan tidak boleh menyinkronkan kontak.
- Uji: `test_kwitansi_wa.js` (server), `test_kwitansi_ui.js` (tampilan).
- Teks di kwitansi bisa diubah di Pengaturan, tab Identitas Lembaga: `kwSk` (legalitas di panel kiri, satu baris
  tiap teks) dan `kwPesan` (template ucapan terima kasih WhatsApp; isian `{nama} {jumlah} {jenis} {nomor} {lembaga} {link}
  {tanggal}`). Isi yang sama dengan bawaan tidak disimpan, supaya bawaan versi baru ikut terpakai.
- Penerima di kwitansi = fundraising (`penerima()` di `lz-kwitansi.js`); bila kosong/"Tanpa fundraising"/kantor,
  dipakai nama petugas penginput. `apiGetKwitansi` hanya mengirim 3 angka terakhir rekening (`rekeningAkhir`).
- Gambar kelopak kiri bawah: `src/public/ikon/kwitansi-hias.png` (dimuat saat menggambar; bila gagal dipakai teratai vektor).

---

## 8. Jebakan yang sudah pernah menggigit

Semuanya nyata, semuanya tanpa galat, semuanya ditemukan lewat pengukuran.

**`input{width:100%}` juga mengenai kotak centang.** Di dalam baris flex,
kotaknya terukur 413 px dan tulisan di sebelahnya tinggal 97 px lalu patah dua
baris. Sudah ditambal global di `styles.css`, tetapi pola ini bisa lahir lagi
di properti lain.

**`1fr` sebenarnya `minmax(auto,1fr)`.** Empat kartu yang seharusnya sama lebar
terukur 297, 239, 201 px. Pakai `minmax(0,1fr)`.

**Aturan ber-`!important` di satu modul mengenai modul lain.** Proporsi kartu
KPI dashboard utama (`1.24fr 1fr 1fr 0.84fr !important`) ikut mengenai modul
Media. Pagari dengan `:not()`, bukan `!important` tandingan.

**`position:sticky` mati kalau ada induk ber-`overflow` selain visible.** Dan
`overflow` pada anak tidak berlaku kalau induknya tidak punya tinggi pasti.
`height:100%` pernah terukur 1188 px di dalam wadah 511 px karena tinggi
induknya sendiri lahir dari penyusutan flex.

**Kata di daftar kata berhenti bisa memotong nama yang sah.** `'aceh'` ada di
`_LAY_STOP` supaya "KLL Srandakan Aceh" terbaca sebagai KLL Srandakan yang
menghimpun untuk Aceh. Aturan itu memotong "ULL Masjid Baiturrahman Aceh" jadi
"ULL Masjid Baiturrahman", melahirkan dua kantor bayangan, dan membelah uang
muka dari LPJ-nya. Sekarang daftar Layanan menang atas daftar kata berhenti.

**Jarak edit menyerah kalau selisih panjang lebih dari 3 huruf** dan
mengembalikan 99. Akibatnya duplikat berbentuk awalan ("ULL Masjid" di dalam
"ULL Masjid Baiturrahman Aceh") tidak pernah terdeteksi oleh pencari salah
ketik. Butuh pemeriksaan tersendiri.

**Daftar yang dilihat harus sama dengan daftar yang diubah.** Sebelum ini,
layar rincian dan fungsi penggabungan memakai pencocokan sendiri-sendiri.
Sekarang satu fungsi `_barisKantor()` dipakai dua-duanya.

**Peringatan palsu lebih berbahaya daripada tidak ada peringatan.** Panel
cadangan memerahkan 2,74 MB dengan kalimat "mendekati batas 1 MB Upstash"
padahal jatah Supabase 500 MB. Sekali orang belajar mengabaikan yang merah,
yang merah sungguhan ikut diabaikan.

**N+1 kueri lewat `kv.get` dalam perulangan.** `surat.daftar` memicu 404
kueri, terasa detik di Vercel padahal 89 ms di lokal. Kumpulkan lewat
`pipeline` (jadi MGET).

**Semua baris masuk DOM.** 10 ribu baris Penghimpunan membekukan layar
17,8 detik dan setiap ketikan di kotak cari 1 detik lebih. Gambar per
potongan, saring di data, bukan di DOM.

**Acara `load` menunggu sumber pihak ketiga.** Font yang macet menahan seluruh
boot aplikasi. Boot di `DOMContentLoaded`, sumber luar jangan memblokir.

**Penanda cache yang berulang.** Nomor versi kembali ke angka lama setelah DB
dibuat ulang, hasil basi dianggap sah. Penanda harus acak.

**Nama modul dan komentar bisa berbohong tentang penyimpanan.** Banyak yang
masih menyebut Redis/Upstash padahal sudah PostgreSQL. Periksa
`pakaiPostgres()`, jangan percaya nama.

---

## 9. Aturan bisnis yang tidak boleh ditebak

- **Hak amil** dipotong dari setoran, persennya per jenis dana, dibulatkan ke
  rupiah utuh **per transaksi** seperti pencatatan manual. Ada daftar
  pengecualian (`_bebasHakAmil`).
- **Saldo KLL/ULL** = setoran - hak amil - uang muka + pengembalian.
  **Belum LPJ** = uang muka - LPJ - pengembalian.
- **Penghimpunan Daerah** adalah kantor semu untuk dana yang dihimpun langsung
  oleh daerah. Izin melihat angkanya terpisah (`saldodaerah`), karena tidak
  semua orang pantas melihatnya.
- **Nama kantor di jurnal ditulis tangan**, jadi salah ketik satu huruf
  melahirkan kantor bayangan yang membawa sebagian dana kantor aslinya.
  Pencocokannya sengaja ketat: sama persis, sama setelah huruf kembar
  diratakan, lalu jarak edit kecil. Kalau ragu, **biarkan apa adanya** dan
  laporkan ke orang. Jangan pernah memindahkan uang berdasarkan tebakan.
- **KLL dan ULL adalah dua jenis kantor berbeda.** Usulan otomatis tidak boleh
  menyeberangkannya. Penggabungan lintas jenis hanya lewat formulir manual
  yang diminta orang secara tegas.
- **Milik kantor atau milik Daerah** (ditetapkan pemilik 1 Oktober 2026):
  keterangan memuat KLL, ULL, KL, UL, atau tulisan lengkap "Kantor Layanan" /
  "Unit Layanan" berarti milik kantor itu. Selain itu milik Lazismu Daerah,
  walaupun menyebut nama kecamatan, PCM, atau sekolah. Nama kantornya adalah
  nama TERDAFTAR yang tertulis paling depan; kata di belakangnya hanya
  keterangan ("KLL Bambanglipuro Nusa Tenggara Timur" = KLL Bambanglipuro).
- **Nama kantor yang tidak jelas tidak ditebak.** "ULL Masjid" cocok dengan
  banyak masjid. Dulu impor diam-diam memilih nama terdaftar yang terpanjang.
  Sekarang (`_layCocokNama`) awalan hanya diterima kalau kantornya tepat satu;
  sisanya muncul sebagai temuan di layar impor, orang memilih, dan pilihannya
  disimpan sebagai nama lain di Settings `aliasKantor` (lihat/hapus di menu
  Layanan, tombol "Nama lain dari jurnal").
  Dua pilihan khusus di depan: "Bukan kantor, masuk Daerah" (`__DAERAH__`)
  dan "Nama sendiri, tidak didaftarkan" (`__SENDIRI__`). Yang kedua untuk
  mitra seperti Lazismu Kota Yogyakarta: pemilik ingin tetap dihitung di
  kelompok KLL seperti rekapnya, tetapi tidak didaftarkan di Layanan karena
  bukan KLL di bawah Lazismu Daerah Bantul (kerja sama program).
- **Impor Jurnal per Berkas**: satu berkas (Kas atau Bank), satu bulan.
  `_temuanJurnal` memeriksa sebelum simpan: tanggal di luar bulan, nama kantor
  tanpa KLL/ULL, kantor tak terdaftar, pilar bertentangan dengan keterangan,
  rekening jenis dana lain, nominal di bawah Rp 1.000, baris kembar, berkas
  bank yang hanya berisi sebagian seksi. Tidak ada yang diubah otomatis.
  Jenis berkas (kas/bank) dipilih otomatis dari judul seksi penerimaan
  ("... VIA BANK" / "... VIA KAS", `imporTebakJenis`): jurnal bank yang
  diimpor sebagai "Jurnal Kas" pernah memberi 538 temuan rekap palsu (yang
  benar 61), karena penerimaan rekap dipilah lewat kolom MELALUI.
  Tiap keputusan temuan bisa dibatalkan ("Ubah", `IMPOR_JEJAK`), dan temuan
  rekap punya pilihan massal "Cocokkan ke rekap" / "Sesuai jurnal" dengan
  "Pertahankan yang sudah saya pilih sendiri" (keputusan per temuan bertanda
  `oleh:'sendiri'` tidak disentuh selama tercentang).
  Fokus layar (pemilik, 2 Oktober 2026, `imporKelompok`): TANPA rekap,
  bagian depan hanya Tanggal (luar bulan, debet/kredit beda) dan Nama
  KLL/ULL (tanpa awalan, rancu, tak terdaftar); pilar, nominal kecil, baris
  kembar, rekening dilipat di "Pemeriksaan lain". DENGAN rekap, bagian depan
  tabel jurnal lawan rekap (Daerah/KLL/ULL/penyaluran; sisi rekap dari
  `_rkAngka` di server, sisi jurnal dihitung langsung dari baris di layar)
  lalu perbedaan per jenis; pemeriksaan jurnal sendiri dilipat. Yang dilipat
  tetap dihitung saat menyimpan. Peringatan "belum diputuskan" tampil di
  baris status kaki jendela (`#imporKakiInfo`), bukan di label tombol.
  Kelas `.imp-chip` sudah dipakai keping berkas; penanda fokus `.imp-fchip`.
- **Rekap bulanan pemilik adalah patokan** (1 Oktober 2026). Jurnal tetap
  diimpor (hanya jurnal yang memuat setor tunai, mutasi, dan biaya admin
  bank), lalu `apiSamakanRekap` mengusulkan kantor, pilar (dari kolom
  PROGRAM), sumber dana, tanggal, dan nominal sesuai rekap, menambah yang
  hanya ada di rekap, dan melewati yang hanya ada di jurnal. Penerimaan
  dipilah kas/bank lewat kolom MELALUI; penyaluran TIDAK, karena jurnal bank
  pemilik memuat pengeluaran tunai juga. Rekap September sendiri memuat
  label yang salah salin ("KL Lazismu Pundong" untuk LPJ yang keterangannya
  KLL Imogiri), jadi kantor terdaftar yang bentrok tidak pernah dipindah
  otomatis.
- **Closing: penyaluran hasil impor jurnal** milik kantor hanya kalau
  `namaPenerima` diawali KLL/ULL. Keterangan tidak lagi dibaca untuk baris
  yang punya `section`, supaya "Gaji Amil Kll Pundong" yang dibayar Daerah
  tetap Daerah seperti di rekap.
- **Link Penghimpunan Harian** (2 Oktober 2026, `public/harian.html`,
  `apiPenghimpunanHarian`): dua link baca-saja terpisah dari Dashboard
  Publik, token di Settings `lhTokenDonatur` / `lhTokenKantor` (kunci sistem,
  tidak pernah ikut `_settingsAman`). Link donatur: semua donasi per hari
  dengan nama LENGKAP (pilihan pemilik), kecuali yang memang anonim jadi
  "Hamba Allah"; setoran KLL/ULL bertanda jenis kantornya. Link KLL/ULL:
  satu link untuk semua kantor, hanya setoran kantor. Kolom yang dikirim
  dipilih satu per satu (daftar izin): telepon, email, alamat, keterangan,
  kwitansi, rekening, petugas tidak pernah ikut. Memperbarui sendiri tiap
  15 detik selama yang dilihat hari ini.
  Pembaruan hanya mengganti `#lhIsi`; bilah saring (tanggal, kantor, cari)
  digambar sekali, supaya teks dan fokus kotak cari tidak hilang tiap 15 detik.
  Tampilan dibuat ringkas (pemilik, 2 Oktober 2026: "menarik tapi simple,
  tidak banyak keterangan"): angka utama di kepala halaman, tanggal dan cari
  satu baris tanpa label, daftar dalam satu kartu. Link KLL/ULL tanpa
  dropdown kantor: kartu kantor (yang sudah setor di depan, yang Rp 0
  dilipat) sekaligus jadi saringan.
  Tautan donatur ikut ucapan WA lewat `{link}` (`apiGetKwitansi` mengirim `linkDonatur`; baris `{link}` dibuang
  bila link belum aktif). Tampilan 5 Oktober 2026 mengikuti web utama (pemilik: "buat mirip seperti web utama"):
  angka total di blok gradasi aksen (`--grad-accent`, teks putih), kartu kaca (`--glass-card`). `harian.html` dan
  `lacak.html` memakai pembaca perangkat yang sama dengan aplikasi (`js/lz-perangkat.js`, atribut `data-perangkat`
  hp/tablet/laptop/desktop dan `data-sentuh`): layar sentuh mendapat isian 16 px dan tombol lebih besar, laptop ke
  atas mendapat halaman lebih lebar. JANGAN menulis berkas baru bernama sama: `lz-perangkat.js` sudah dimuat semua
  halaman dan `test_skala_ui.js` memeriksa atributnya. `lacak.html` menyembunyikan isian bila tautan sudah membawa
  nomor dan kode (`?n=&k=`), dan kepala halamannya memuat logo dan nama lembaga dari `surat.lacak` (`lembaga`:
  nama, singkatan, logo saja; alamat dan telepon tidak dikirim).
- **Surat & Pengajuan** (pemilik, 2 Oktober 2026; `lib/surat/`, `src/public/surat.js`):
  surat masuk (Diterima > Didisposisi > Ditindaklanjuti > Selesai), surat
  keluar (Draf > Dikirim > Selesai), dan pengajuan bantuan/sponsorship/
  proposal (Diterima > Diproses > Asesmen > Disetujui > Dicairkan > Selesai,
  atau Ditolak sebelum Disetujui). **Tidak punya berkas di `api/`**: tindakan
  `surat.*` diteruskan `api/media.js` ke `lib/surat/api.js` SEBELUM
  pemeriksaan izin Media, dan izinnya modul `surat` sendiri. Data di `kv`
  berawalan `surat:`; isi lampiran di kunci `surat:berkas:<id>`, terpisah dari
  catatannya supaya daftar tidak ikut mengunduh PDF. Batas: 2 MB per berkas
  (batas Vercel 4,5 MB per kiriman, base64 menambah sepertiga), 6 lampiran
  per surat, kuota `SURAT_KUOTA_MB` (bawaan 200) dari 500 MB Supabase. Foto
  selalu dikompres di peramban ke JPEG di bawah 900 KB; PDF di atas 2 MB
  ditawari "Kompres PDF" (pdf.js dari salinan lokal `js/vendor`, jsPDF dari cdnjs diunduh saat ditekan)
  atau disimpan sebagai tautan. Kalau `GDRIVE_*` disetel, lampiran baru
  masuk Google Drive (`_drive.unggahBiner`), bukan basis data. Kompres PDF
  teruji di `test_surat_ui.js` bagian D dan D2: jalan keluar kalau jsPDF tidak
  terunduh, dan jalur sukses dengan PDF 3 halaman sungguhan yang dibaca pdf.js
  lokal (jsPDF ditiru karena uji tidak boleh keluar ke internet, jadi yang
  belum teruji hanya keluaran PDF akhir dari jsPDF asli). Skrip yang gagal
  diunduh dibuang dari halaman (`muatSkrip`), kalau tidak percobaan kedua
  dianggap sudah termuat lalu error. Halaman `lacak.html`
  (tanpa masuk) hanya menerima nomor + kode lacak 6 huruf dan hanya
  mengembalikan langkah dan tanggalnya. Sejak 5 Oktober 2026 SEMUA jenis surat (masuk, keluar, bantuan, sponsorship,
  proposal) punya kode lacak dan tautan publik `/lacak.html?n=NOMOR&k=KODE` (terisi dan terbuka sendiri); surat
  bersifat rahasia tidak pernah punya kode (dicabut kalau sifatnya diubah jadi rahasia). Surat lama dibuatkan kodenya
  saat pencatat atau pemegang izin ubah membuka detailnya (`S.pastikanKode`). Detail surat menampilkan tautan, tombol
  Salin, Kirim lewat WhatsApp, dan Buka. Kunci JSON jawabannya tetap `pengajuan` (kompatibel).
- **Bidang tim media dibekukan saat permohonan diajukan**, supaya memindahkan
  jenis media suatu hari tidak memindahkan ratusan pekerjaan lama secara surut.

---

## 10. Keadaan sekarang dan pekerjaan tertunda

Per 29 September 2026, dengan tambahan 3 Oktober 2026 di bawah.

**Sudah beres:** impor jurnal, modul Media, pemecahan izin Dashboard, deteksi
kantor kembar beserta rincian transaksinya, pembersihan broadcast lama
(Fonnte), peringatan cadangan, dan (30 September 2026) lima celah keamanan di
bagian 3.10.

**Ditambahkan 3 Oktober 2026:** daftar Penghimpunan dan Pentasyarufan dikirim
padat (bagian 5), Kompres PDF memakai pdf.js lokal dan jalur suksesnya teruji
beserta perbaikan percobaan ulang, dan semua fungsi xlsx yang dipakai terbukti
ada di 0.18.5 (`test_xlsx_lokal.js`). Dicek dan sengaja TIDAK diubah: membangun
HTML per baris hanya untuk baris yang digambar (membuka 15.000 baris terukur
±580 ms di mesin uji, tidak sepadan dengan risikonya di `app.js` 600 KB).

**Perlu dikerjakan pemilik, bukan kode:**

1. **Google Drive untuk cadangan belum disetel.** Semua cadangan tersimpan di
   tabel `cadangan` di dalam Supabase yang sama dengan basis datanya. Kalau
   Supabase-nya bermasalah, tidak ada salinan di tempat lain. Ikuti
   `PANDUAN-CADANGAN.md`.
2. **Tujuh rekening bank** muncul di jurnal tetapi belum terdaftar di menu
   Rekening.
3. **Data yang belum valid di berkas Excel**: jurnal Jafit MAR baris 236
   (kredit kosong untuk Infak Terikat Lazismu UMY, selisih Rp 5.000.000), dan
   empat baris Kas Amil bernominal kosong di FEB dan SEP.
4. **Nama kantor yang masih perlu digabung sendiri**, misalnya "ULL Masjid"
   yang membawa Rp 15.000.000 dan cocok dengan lebih dari satu kantor.

**Catatan lain:**

- `~200` kunci modul hasil migrasi masih perlu diambil ulang dengan
  `ekspor-redis.js --lanjut`
- Lima aturan `balasan` yatim masih ada di basis data produksi
- Proyek Supabase gratis **dijeda setelah 7 hari tanpa aktivitas**. Aplikasi
  ini dipakai harian jadi aman, tetapi perlu diingat saat libur panjang.

---

## 11. Cara memulai satu sesi kerja

1. Baca berkas ini.
2. Jangan menebak keadaan data. Kalau pertanyaannya menyangkut data produksi,
   minta pemilik menjalankan alat diagnostik yang sudah ada
   (`tools/periksa-kantor.js`, `tools/cek-postgres.js`) dan menempelkan
   keluarannya.
3. Sebelum mengubah CSS atau pencocokan nama, ukur dulu keadaan sekarang.
4. Tulis ujinya, buktikan gagal, baru perbaiki.
5. Periksa akhiran baris berkas yang akan disentuh.
6. Jalankan `uji-sebelum-deploy.bat` sampai semuanya lulus.
7. Laporkan ke pemilik dalam Bahasa Indonesia, tanpa em dash, dengan angka
   hasil pengukuran, bukan dengan klaim.
