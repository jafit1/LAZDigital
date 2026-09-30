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
| `src/public/js/lz-ui.js`, semua `*.bat` | semua `tools/*.js` |

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
broadcast, fundraising, ai, media
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

Simpan ujinya sebagai berkas tetap di `tools/`, dan daftarkan di
`uji-sebelum-deploy.bat`.

### 3.9 `&` di dalam `echo` pada berkas .bat

`echo --- Fitur Media & Desain ---` membuat Windows menganggap `Desain` sebagai
perintah, lalu muncul `'Desain' is not recognized as an internal or external
command`. Pakai kata "dan" pada label di `uji-sebelum-deploy.bat`, jangan `&`.

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
│  └─ ai/                    db, penyedia, alir
├─ src/public/               Frontend, vanilla JS, tanpa build step
│  ├─ index.html + app.js    Aplikasi utama (~525 KB)
│  ├─ blast.html + blast.js
│  ├─ fund.html + fund.js
│  ├─ ai.html + ai.js
│  ├─ media.html + media.js
│  ├─ styles.css             Satu berkas untuk semua halaman (~279 KB)
│  └─ js/lz-ui.js            Dropdown dan pemilih tanggal bertema
├─ tools/                    Uji dan alat, semuanya LF
├─ sql/01-skema.sql          Skema PostgreSQL
├─ uji-sebelum-deploy.bat    Jalankan SEBELUM deploy
├─ deploy.bat                git add, commit, push (Vercel yang membangun)
└─ vercel.json               Region sin1, maxDuration 30, cron backup harian
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
- **Dua modul punya sesi sendiri**: `lib/media/sesi-laz.js` dan padanannya di
  fund/blast/ai memetakan izin LAZDigital ke izin modulnya.

---

## 6. Alur kerja wajib

```
1. Ubah kode
2. node tools/<uji yang relevan>.js     (cepat, sambil mengerjakan)
3. uji-sebelum-deploy.bat               (semuanya, wajib)
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

Dijalankan berurutan oleh `uji-sebelum-deploy.bat`. Uji yang butuh Playwright
akan melewati dirinya sendiri dengan kode keluar 2 kalau Playwright belum ada
(`npm i -D playwright && npx playwright install chromium`).

| Berkas | Menjaga apa |
|---|---|
| `uji_batas_vercel.js` | jumlah fungsi masih di bawah 12 |
| `test_agen.js` | sambungan ke gateway WhatsApp, centang, lampiran |
| `test_impor_jurnal.js` | impor jurnal, tidak ada baris hilang diam-diam |
| `test_izin_modul.js` | pemecahan izin Dashboard, akun lama tidak kehilangan menu |
| `test_izin_ui.js` | dialog Edit User, kolom kiri diam saat kanan digulir |
| `test_kantor_kembar.js` | nama KLL/ULL bertumpuk, rincian transaksi, pembanding |
| `test_cadangan_peringatan.js` | peringatan ukuran basis data tidak palsu |
| `test_blast_fitur.js`, `test_blast_ui.js` | broadcast |
| `test_percakapan.js`, `ukur-percakapan.js` | kotak masuk |
| `test_fund_fitur.js`, `test_fundraiser.js`, `test_fund_ui.js` | fundraising |
| `test_media_fitur.js`, `test_media_ui.js` | modul media |
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

Alat diagnostik yang tidak ikut di `uji-sebelum-deploy.bat` karena menyambung
ke basis data produksi:

- `tools/periksa-kantor.js`: menyisir nama KLL/ULL, hanya membaca.
  `--cari <kata>`, `--rinci "<nama>"`, `--semua`
- `tools/ukur-media.js`: mengukur bentuk UI modul Media di 7 lebar layar

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
- **Bidang tim media dibekukan saat permohonan diajukan**, supaya memindahkan
  jenis media suatu hari tidak memindahkan ratusan pekerjaan lama secara surut.

---

## 10. Keadaan sekarang dan pekerjaan tertunda

Per 29 September 2026.

**Sudah beres:** impor jurnal, modul Media, pemecahan izin Dashboard, deteksi
kantor kembar beserta rincian transaksinya, pembersihan broadcast lama
(Fonnte), peringatan cadangan, dan (30 September 2026) lima celah keamanan di
bagian 3.10.

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
