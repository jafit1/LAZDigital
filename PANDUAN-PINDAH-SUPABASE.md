# Pindah ke Supabase: urutan kerja sampai deploy

Panduan ini satu jalur, dari atas ke bawah. Setiap langkah punya cara
memastikan hasilnya benar sebelum lanjut, dan langkah yang mengubah data
sungguhan ditandai **HATI-HATI**.

Yang penting dipahami lebih dulu: **jalan pulangnya selalu ada.** Aplikasi
memilih penyimpanan dari ada tidaknya `DATABASE_URL`. Kalau variabel itu
dihapus dari Vercel, aplikasi kembali memakai Redis seperti sebelum
pemindahan, tanpa perlu mengubah kode apa pun. Redis tidak dihapus dulu.

---

## Alur ringkas

Sepuluh langkah. Tiga di antaranya titik berhenti: jangan lanjut kalau hasilnya
belum benar.

| # | Di mana | Yang dilakukan |
|---|---|---|
| 1 | Komputer | `npm install` |
| 2 | supabase.com | New project, region **Singapore**, simpan Database Password |
| 3 | SQL Editor | tempel isi `sql\01-skema.sql` → Run |
| 4 | SQL Editor | tempel isi `sql\02-keamanan.sql` → Run (RLS, wajib) |
| 5 | Supabase → Vercel | copy **Transaction pooler** (porta **6543**), tulis ke `.env.local` |
| 6 | Komputer | `node tools/cek-postgres.js` → **berhenti**, harus "Sambungan sehat" |
| 7 | Komputer | `node tools/impor-postgres.js --mode induk --lewati-kunci-rusak` → **berhenti**, periksa jumlah barisnya |
| 8 | Komputer | ulangi langkah 7 + `--jalankan`, lalu `node tools/banding-migrasi.js` → **berhenti**, harus 0 berbeda |
| 9 | Vercel | Settings → Environment Variables → `DATABASE_URL` (Production, Preview, Development) |
| 10 | Komputer | `uji-sebelum-deploy.bat` lalu `deploy.bat` |

> **Mode yang dipakai di LAZDigital: `--mode induk`.** Saldo awal 2026 tidak
> pernah diisi di sistem lama, jadi hitungan saldo apa pun dari data lama hanya
> berisi pergerakan sejak 1 Januari, bukan saldo sesungguhnya. Gejalanya jelas:
> rekening bank bersaldo minus. Jadi sisi uangnya dikosongkan sama sekali, dan
> saldo awalnya diisi sendiri lewat Pengaturan > Saldo Awal, dari rekening
> koran.

Perintahnya, urut, untuk ditempel:

```
cd /d D:\Project\LAZDigital
npm install
node tools/cek-postgres.js
node tools/impor-postgres.js --mode induk --lewati-kunci-rusak
node tools/impor-postgres.js --mode induk --lewati-kunci-rusak --jalankan
node tools/banding-migrasi.js
uji-sebelum-deploy.bat
deploy.bat
```

Isi `.env.local` (satu baris, berkasnya sudah di `.gitignore`):

```
DATABASE_URL=postgresql://postgres.xxxx:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

Kalau ada yang tidak benar setelah hidup: hapus `DATABASE_URL` dari Vercel,
deploy ulang, aplikasi kembali ke Redis.

---

## 0. Apa yang berubah, dalam satu halaman

Sebelum: seluruh basis data adalah **satu bongkah JSON** di kunci Redis
`laz:db`. Membuka dasbor = mengunduh seluruh bongkah. Menyimpan satu kwitansi
= menulis ulang seluruh bongkah. Pada 45 MB dan 4.300 transaksi, satu tab
Broadcast yang ditinggal terbuka sudah cukup menghabiskan kuota 500.000
perintah per bulan, dan itu yang terjadi.

Sesudah: 13 tabel sungguhan di PostgreSQL.

| | dulu | sekarang |
|---|---|---|
| buka daftar Penghimpunan | unduh 2,75 MB, saring di aplikasi | `SELECT` baris yang diminta |
| simpan satu kwitansi | tulis ulang seluruh basis data | satu `INSERT` |
| uang | teks/pecahan biner | `numeric(18,2)` |
| tanggal | teks | `date`, berindeks |
| nomor kwitansi kembar | lolos diam-diam | ditolak indeks unik |
| batas pemakaian | 500.000 perintah/bulan | permintaan tak dibatasi |
| cadangan | 16 salinan = 93% isi Redis | tabel `cadangan`, dipangkas otomatis |

Yang **tidak** berubah: seluruh perhitungan akuntansi di `api/_engine.js`.
Pemindahan ini menyambung di lapisan penyimpanan, bukan menulis ulang rumus
saldo. Itu sengaja: rumus yang sudah benar tidak disentuh sama sekali, dan
buktinya ada di langkah 6.

---

## 1. Buat proyek Supabase

1. Buka [supabase.com](https://supabase.com) → **New project**.
2. Region: **Southeast Asia (Singapore)**, paling dekat, dan sama dengan
   region Vercel yang dipakai (`sin1` di `vercel.json`).
3. Simpan **Database Password** di tempat aman. Sandi ini tidak bisa dilihat
   lagi setelah halamannya ditutup; kalau hilang, harus di-reset.

Paket gratis: 500 MB basis data, 5 GB lalu lintas keluar per bulan,
**permintaan tak dibatasi**, 2 proyek.

> Proyek gratis **dihentikan sementara setelah 7 hari tanpa aktivitas**.
> Aplikasi yang dipakai sehari-hari tidak akan kena, dan cron cadangan harian
> saja sudah cukup menjaganya tetap hidup. Tapi kalau aplikasi benar-benar
> tidak dibuka seminggu, proyeknya perlu dinyalakan lagi dari dasbor Supabase.

---

## 2. Pasang tabelnya

Di dasbor Supabase: **SQL Editor** → **New query** → tempel seluruh isi
`sql/01-skema.sql` → **Run**.

Berkas itu aman dijalankan berulang kali (semuanya `IF NOT EXISTS`), jadi
kalau ragu sudah dijalankan atau belum, jalankan saja lagi.

Memastikan: **Table Editor** harus memperlihatkan 17 tabel: `Users`,
`Rekening`, `Layanan`, `Donatur`, `Settings`, `Penghimpunan`,
`Pentasyarufan`, `UangMuka`, `Transfer`, `Mutasi`, `SaldoAwal`, `Sessions`,
`AuditLog`, `kv`, `kv_set`, `cadangan`, dan `migrasi`.

Jangan berhenti di sini: lanjut ke 2b.

---

## 2b. Nyalakan RLS. Ini bukan pilihan

Supabase memperlihatkan peringatan kuning "RLS disabled" setelah langkah 2.
Peringatan itu benar, dan ini artinya.

Supabase tidak cuma memberi basis data. Ia juga otomatis membuka seluruh skema
`public` sebagai REST API di `https://<proyek>.supabase.co/rest/v1/...`, dan API
itu bisa dipakai siapa pun yang memegang **anon key**. Anon key memang dirancang
untuk ditempel di halaman web, jadi ia bukan rahasia. Di proyek baru, Supabase
juga memberi hak penuh atas tabel di `public` kepada peran `anon`. Tanpa RLS,
satu perintah ini dari komputer mana pun berhasil:

```
curl "https://<proyek>.supabase.co/rest/v1/Donatur?select=*" -H "apikey: <anon key>"
```

Hasilnya seluruh nama, alamat, dan nomor telepon donatur. Tabel `Users`
mengembalikan hash sandi beserta salt-nya. Dan karena haknya penuh, bukan cuma
baca: barisnya bisa diubah dan dihapus dari luar.

Perbaikannya: **SQL Editor → New query → tempel seluruh isi `sql\02-keamanan.sql`
→ Run.** Berkas itu menyalakan RLS di semua tabel tanpa satu pun policy, lalu
mencabut hak `anon` dan `authenticated` atas skema `public` sekalian, termasuk
hak bawaan untuk tabel yang dibuat nanti. Aman diulang.

Kenapa aplikasinya tetap jalan: LAZDigital tidak lewat REST API Supabase. Ia
menyambung langsung ke PostgreSQL sebagai peran `postgres`, dan peran itu
**pemilik** tabelnya. Pemilik tabel melewati RLS. Jadi aplikasi membaca dan
menulis seperti biasa, sementara pintu dari luar tertutup.

Itu sudah dibuktikan, bukan diperkirakan: `tools/test_laz_pg.js` dan
`tools/test_cadangan_pg.js` sekarang memasang `02-keamanan.sql` sebagai bagian
dari penyiapannya, lalu dijalankan sebagai peran pemilik yang **bukan**
superuser. 70 dan 19 pemeriksaan, semuanya lulus, dengan RLS menyala di ke-17
tabel. Di uji yang sama, peran `anon` ditolak dengan `permission denied` di
setiap tabel.

`cek-postgres.js` di langkah berikutnya memeriksa ini juga, jadi kalau langkah
ini terlewat, ia akan memberitahu dan menolak melanjutkan.

**Jangan** memakai tombol "Enable RLS" per tabel di dasbor lalu berhenti di
situ. Itu menyalakan RLS tetapi membiarkan hak `anon` tetap ada, dan hasilnya
setengah jalan.

---

## 3. Ambil alamat sambungan

**Project Settings → Database → Connection string → Transaction pooler.**

Bentuknya seperti ini:

```
postgresql://postgres.abcdefghijkl:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

Ganti `[YOUR-PASSWORD]` dengan sandi dari langkah 1.

**Harus porta 6543 (Transaction pooler), bukan 5432 (Direct connection).**
Alasannya bukan selera: di Vercel tiap permintaan bisa dilayani proses yang
berbeda, dan tiap proses membuka sambungannya sendiri. Dengan sambungan
langsung, jatah sambungan habis jauh sebelum penggunanya bertambah banyak,
dan gejalanya muncul sebagai "kadang gagal, kadang tidak", jenis masalah
yang paling sulit dilacak.

Simpan di `.env.local` di komputer sendiri (berkas ini sudah di `.gitignore`;
**jangan** pernah masuk ke git, karena repositori LAZDigital publik):

```
DATABASE_URL=postgresql://postgres.abcdefghijkl:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

---

## 3b. Pastikan sambungannya sehat sebelum menyentuh data

```
npm install
node tools/cek-postgres.js
```

`npm install` perlu sekali saja: `pg` sekarang jadi kebutuhan produksi, bukan
cuma alat bantu.

`cek-postgres.js` hanya membaca, tidak mengubah apa pun. Ia memeriksa hal-hal
yang paling sering jadi penyebab gagal, berurutan: pustaka `pg` sudah terpasang,
alamatnya terbaca, **portanya 6543 dan bukan 5432**, sandinya sudah diisi,
sambungannya berhasil beserta lamanya satu perjalanan bolak-balik, ke-17 tabel
sudah ada beserta jumlah barisnya, dan riwayat impor kalau sudah pernah.

Kalau gagal, pesan galat `pg` diterjemahkan jadi tindakan: sandi salah, nama
server tidak ditemukan, proyek Supabase sedang tidur, porta keliru, dan
seterusnya. Alamat yang ditampilkan sandinya selalu disembunyikan, jadi
keluarannya aman ditempel ke mana pun.

Lanjut hanya kalau baris terakhirnya berbunyi **Sambungan sehat**.

---

## 4. Lengkapi hasil ekspor Redis

Ekspor sebelumnya berhasil mengambil 262 kunci (45,79 MB) termasuk `laz:db`
dan ke-16 cadangan, tapi sekitar 200 kunci kecil milik modul AI/Broadcast/
Fundraising gagal karena kuota Redis habis di tengah jalan. Kunci-kunci itu
tersimpan sebagai penanda galat, bukan sebagai data, dan berkasnya menolak
dipakai sebagai sumber pemindahan selama masih tercemar.

Kuota Upstash berulang tiap bulan, jadi begitu kuotanya kembali:

```
node tools/ekspor-redis.js --lanjut data/ekspor-redis-2026-09-26T06-38-31-341Z.json
```

Perintah itu hanya mengambil yang belum berhasil, dan membersihkan penanda
galat yang lama. Kalau di akhir tidak ada lagi baris **BAHAYA**, berkasnya
siap dipakai.

> Kalau kuotanya belum kembali dan ingin jalan sekarang: pemindahan **tetap
> bisa** dilakukan, karena buku besar (`laz:db`) sudah lengkap terambil.
> Tambahkan `--lewati-kunci-rusak` pada perintah impor, dan kunci-kunci rusak
> itu dibuang, bukan diimpor. Yang hilang hanya riwayat percakapan AI, setelan
> Broadcast, dan daftar kontak, dan semuanya bisa diisi ulang dari aplikasi.
>
> Skrip impornya memeriksa sendiri mana yang tercemar. Kalau yang tercemar
> ternyata `laz:db` atau salah satu cadangannya, `--lewati-kunci-rusak` ditolak
> dan ia tetap berhenti: buku besar tidak boleh dilewati.

---

## 5. Latihan dulu, baru sungguhan. **HATI-HATI**

Skrip impor **selalu** simulasi kalau `--jalankan` tidak disebut. Jalankan
simulasinya dulu dan baca angkanya:

```
node tools/impor-postgres.js --mode kosong --potong 2026-09-30
```

Yang harus diperiksa di keluarannya:

- Daftar **Saldo awal yang dibawa**: angka TOTAL harus sama dengan saldo yang
  terlihat di aplikasi hari itu. Ini pemeriksaan paling penting di seluruh
  panduan ini, dan yang paling mudah dilakukan: buka dasbor aplikasi,
  bandingkan angkanya.
- Tidak ada baris bertanda galat.

`--potong` adalah **tanggal batas**: saldo dihitung sampai tanggal itu, dan
tabel transaksi dimulai bersih setelahnya.

Tanggal itu **tidak boleh lebih awal daripada transaksi terakhir yang sudah
tercatat**. Di mode kosong, transaksi yang tanggalnya sesudah tanggal potong
tidak masuk saldo awal dan tidak masuk tabel transaksi: uangnya hilang begitu
saja. Skrip impornya sekarang menolak jalan kalau itu terjadi, menyebutkan
berapa transaksi dan berapa rupiah yang akan hilang, lalu memberi tanggal
potong yang benar. Kalau memang ingin membuangnya, baru tambahkan
`--abaikan-sisa`.

Jadi pilihan amannya: **tanggal hari ini**, atau tanggal transaksi terakhir.
Akhir bulan yang sudah ditutup hanya cocok kalau memang belum ada transaksi
baru setelahnya.

Kalau angkanya cocok, jalankan sungguhan:

```
node tools/impor-postgres.js --mode kosong --potong 2026-09-30 --jalankan
```

Seluruh isinya masuk dalam **satu transaksi**: kalau gagal di tengah, tidak
ada yang separuh jadi.

---

## 6. Buktikan, jangan percaya

```
node tools/banding-migrasi.js --potong 2026-09-30
```

Skrip ini hanya membaca, di kedua sisi. Ia menyusun ulang isi PostgreSQL
menjadi bentuk lama, lalu **menghitung saldo di kedua sisi dengan `apiSaldo`
yaitu fungsi aplikasinya sendiri**, dan membandingkan totalnya, per dana, dan
**per akun**.

Per akun itu yang menentukan. Jumlah baris yang sama tidak membuktikan apa
pun: baris bisa lengkap sementara uangnya mendarat di akun yang keliru, dan
justru itu kesalahan yang paling mungkin terjadi. Saldo per akun yang sama
persis di kedua sisi membuktikan uangnya mendarat di tempat yang benar.

**Kalau ada satu saja baris `BEDA`, jangan lanjut.** Selisih serupiah di sini
berarti ada uang yang salah tempat, dan enam bulan lagi tidak akan ada yang
bisa menjelaskannya.

---

## 7. Setel di Vercel, lalu deploy

Vercel → proyek LAZDigital → **Settings → Environment Variables**:

| nama | nilai | lingkungan |
|---|---|---|
| `DATABASE_URL` | alamat Transaction pooler dari langkah 3 | Production, Preview, Development |

Biarkan `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` **tetap ada**
(lihat langkah 9).

Lalu:

```
uji-sebelum-deploy.bat
deploy.bat
```

---

## 8. Isi saldo awal, lalu periksa

Di mode induk, sisi uangnya sengaja kosong. Langkah pertama setelah deploy
adalah mengisinya, dan itu dilakukan di aplikasinya sendiri:

**Pengaturan > Saldo Awal**, pilih tahun, lalu isi per rekening dan per kas
memakai angka dari rekening koran dan penutupan tahun lalu, plus uang muka
program yang belum di-LPJ per dana. Setelah itu barulah dasbor menampilkan
saldo yang benar, dan tiap transaksi baru menyambung ke angka itu.

Angka itu harus datang dari rekening koran, bukan dari sistem lama: justru
karena saldo awal 2026 tidak pernah diisi di sana, hitungan lamanya tidak bisa
dijadikan acuan.

---

## 8b. Periksa setelah hidup

Urutannya sengaja: dari yang paling murah ke yang paling menentukan.

1. **Masuk** ke aplikasi. Kalau login berhasil, sambungan dan tabel `Users`
   sudah benar.
2. **Dasbor**: saldo harus sama dengan angka di langkah 5.
3. **Catat satu penerimaan percobaan**, lalu hapus lagi. Yang diuji di sini
   jalur tulis: satu `INSERT`, satu `DELETE`.
4. **Laporan** satu bulan yang ada isinya.
5. **Perawatan → Cadangan → Cadangkan sekarang.** Keterangan tempatnya harus
   berbunyi `PostgreSQL (tabel cadangan)`, dan ukurannya tidak boleh nol.
6. Besok pagi, periksa cadangan harian dari cron sudah masuk.

Kalau ada yang tidak benar: hapus `DATABASE_URL` dari Vercel, deploy ulang,
dan aplikasi kembali ke Redis. Data di Supabase tetap ada untuk diperiksa
tanpa tekanan.

---

## 9. Yang masih memakai Redis

Satu bagian: **Broadcast versi lama**: `api/wa.js`, `api/_wa.js`,
`api/wa-dispatch.js`, dan halaman `src/public/broadcast.html`. Datanya di
kunci berawalan `wab:`.

Bagian itu belum dipindahkan, dan itu keputusan sadar. Ia memakai bentuk data
yang jauh lebih banyak ragamnya (daftar, tabel hash, himpunan berperingkat),
jadi memindahkannya berarti menulis ulang lapisan penyimpanan yang jauh lebih
besar, pekerjaan yang tidak sepadan untuk halaman yang sudah digantikan
Broadcast baru (`blast.html`), dan yang berkas HTML-nya sendiri sekarang
sedang rusak (lihat catatan di bawah).

Karena buku besar dan ketiga modul lain sudah tidak menyentuh Redis lagi,
pemakaian Redis turun ke hampir nol, dan kuota 500.000 perintah itu berulang
tiap bulan. Jadi membiarkannya di Redis tidak menimbulkan biaya apa pun.

**Kalau Broadcast lama sudah tidak dipakai**, tiga berkas itu plus
`broadcast.html` bisa dihapus, dan dua variabel `UPSTASH_*` bisa dikosongkan.
Itu sekalian membebaskan 3 dari 12 kuota Serverless Function Vercel.

---

## Yang masih perlu diputuskan

- **`src/public/broadcast.html` rusak.** Di dalamnya ada **7 tanda konflik
  penggabungan git** yang belum dibereskan (`<<<<<<< HEAD` … `>>>>>>>`),
  termasuk di dalam blok `<style>`. Halaman itu tidak mungkin tampil benar
  sekarang. Perlu diputuskan: dibereskan, atau dihapus bersama Broadcast lama.
- **Dua kredensial yang pernah ditempel di percakapan** (`BLAST_AGEN_TOKEN`
  dan `ADMIN_KEY` gateway WA) belum dipastikan sudah diganti. Keduanya masih
  perlu diganti.
- **`GDRIVE_REFRESH_TOKEN` milik akun Google yang mana?** Tidak ada berkas
  cadangan LAZDigital yang ditemukan di Drive `ahmadmaruf004@gmail.com` sejak
  1 Agustus. Kalau kaki Drive-nya memang tidak mendarat, cadangan lepas-pantai
  sebetulnya tidak ada, dan itu baru terasa pada hari yang paling buruk untuk
  mengetahuinya.

---

## Menjalankan ujinya sendiri

Dua uji baru butuh PostgreSQL untuk percobaan, dan keduanya **mengosongkan
basis data yang ditunjuk**. Karena itu keduanya sengaja **tidak** membaca
`DATABASE_URL` (isinya alamat produksi) dan menolak alamat yang bukan komputer
sendiri. Tanpa alamat, keduanya dilewati, dan itu sebabnya `uji-sebelum-deploy.bat`
menandainya DILEWATI kalau PostgreSQL belum dipasang di komputer ini.

```
node tools/test_laz_pg.js      --alamat "postgres://postgres@127.0.0.1:5432/laz_uji"
node tools/test_cadangan_pg.js --alamat "postgres://postgres@127.0.0.1:5432/laz_uji2"
```

`cek-postgres.js` berbeda: ia hanya membaca, jadi aman dijalankan terhadap
basis data sungguhan, dan `uji-sebelum-deploy.bat` memanggilnya apa adanya.
Tanpa `DATABASE_URL` ia menandai dirinya DILEWATI, bukan GAGAL, karena selama
belum pindah itu memang keadaan yang benar.

Yang dibuktikan `test_laz_pg.js`: satu hari kerja lengkap: pasang, login,
buat rekening dan layanan, catat saldo awal, catat penerimaan tunai/transfer/
barang, catat penyaluran, ubah, hapus, lihat saldo dan laporan, dijalankan
**dua kali**, sekali lewat jalur lama dan sekali lewat PostgreSQL, lalu hasil
tiap langkah dibandingkan huruf per huruf. 70 pemeriksaan.

Yang dibuktikan `test_cadangan_pg.js`: cadangannya **berisi data sungguhan**
(bukan berkas kosong yang dilaporkan berhasil), dan pemulihan mengembalikan
saldo yang sama persis. 19 pemeriksaan.
