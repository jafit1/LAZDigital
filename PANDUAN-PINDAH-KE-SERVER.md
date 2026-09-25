# Pindah dari Vercel + Upstash ke server sendiri + PostgreSQL

Keputusan yang sudah diambil: **VPS cloud** sebagai server, **PostgreSQL** sebagai
basis data. Dokumen ini rencana lengkapnya — apa yang dikerjakan, urutannya,
apa yang bisa salah, dan bagaimana mundur kalau perlu.

---

## 1. Kenapa Redis penuh — dan kenapa memangkas saja tidak cukup

Penyebabnya ada di satu baris rancangan, bukan di banyaknya data.

Seluruh buku besar disimpan sebagai **satu bongkah JSON** di kunci `laz:db`
(lihat `api/rpc.js`). Tiga belas tabel — Penghimpunan, Pentasyarufan, Mutasi,
Donatur, AuditLog, dan seterusnya — semuanya di dalam satu nilai string.

Akibatnya berlapis:

| Akibat | Penjelasan |
|---|---|
| **Semua harus muat di RAM** | Redis menyimpan data di memori. Jatah gratis Upstash 256 MB, dan harga paket berbayar dihitung per GB RAM — bukan per GB disk yang harganya seperseratusnya. |
| **Tiap simpan menulis ulang semuanya** | Menyimpan satu transaksi Rp 50.000 berarti mengunduh seluruh buku besar, mengubah satu baris, lalu mengunggahnya kembali. Buku 5 MB berarti 10 MB lalu lintas untuk satu transaksi. |
| **Lebar pita cepat habis** | Jatah gratis 10 GB/bulan. Buku besar 5 MB berarti jatah itu habis setelah sekitar 2.000 kali buka halaman. |
| **Tidak bisa dicari** | Laporan apa pun harus mengunduh seluruh buku besar lalu menyaringnya di memori aplikasi. Tidak ada indeks, tidak ada `WHERE`, tidak ada `SUM`. |
| **Makin lambat seiring waktu** | Tahun 2027 buku besarnya dua kali lipat, dan semua di atas ikut dua kali lipat. |

Yang juga menumpuk, tapi bukan akar masalah:

- `ai:lampiran:*` — gambar mentah, sampai 1,4 MB per berkas, berumur 30 hari.
- `ai:sesi:*` — percakapan AI, disimpan selamanya, hingga 300 pesan per sesi.
- `AuditLog` di dalam `laz:db` — bertambah tiap klik, tidak pernah dipangkas.
- `Sessions` di dalam `laz:db` — token login yang sudah kedaluwarsa tetap tinggal.

**Kesimpulannya:** memangkas membeli waktu berminggu-minggu, bukan
menyelesaikan. Yang menyelesaikan adalah memindahkan buku besar ke basis data
yang menyimpan di disk dan bisa mengubah satu baris tanpa menyentuh yang lain.

Ukur dulu sebelum percaya paragraf di atas:

```
node tools/ukur-redis.js
```

Alat itu hanya membaca — tidak mengubah apa pun — dan menunjukkan mana yang
sebenarnya memenuhi: buku besar, lampiran, atau yang lain.

---

## 2. Arsitektur tujuan

```
                        Internet
                           │
                    ┌──────▼──────┐
                    │    Caddy    │  TLS otomatis (Let's Encrypt)
                    │  :80 :443   │  lazdigital.my.id
                    └──────┬──────┘
                           │
                  ┌────────▼────────┐
                  │  LAZ Digital    │  node server.js
                  │  (Node 22)      │  api/* jadi rute, sudah ada
                  └───┬─────────┬───┘
                      │         │
         ┌────────────▼──┐   ┌──▼──────────────┐
         │  PostgreSQL   │   │  Berkas / MinIO │
         │  data di disk │   │  lampiran, foto │
         └───────────────┘   └─────────────────┘
```

**Redis tidak lagi dipakai sama sekali.** Hal-hal yang selama ini butuh masa
kedaluwarsa (sesi login, antrean broadcast, kunci idempoten, pembatas laju)
pindah ke satu tabel PostgreSQL bernama `kv` yang punya kolom `kedaluwarsa`,
plus satu penyapu yang jalan tiap menit. Satu komponen lebih sedikit untuk
dipasang, dijaga, dan dicadangkan — dan untuk beban sebesar ini, PostgreSQL
lebih dari cukup cepat.

Lampiran dan foto **tidak** disimpan di dalam basis data. Ia ke disk server
(atau MinIO kalau nanti perlu). Alasannya sama seperti alasan Redis penuh:
data besar yang jarang dibaca tidak boleh menumpang di tempat yang mahal.

### Yang ikut membaik begitu pindah

- **Batas 12 fungsi Vercel hilang.** Modul tidak perlu lagi didempetkan jadi
  satu berkas; `api/wa.js` dan `api/_wa.js` boleh hidup terpisah.
- **Batas waktu fungsi hilang.** Impor besar, laporan tahunan, dan pemrosesan
  antrean tidak lagi harus selesai dalam 10 detik.
- **Cron jadi cron sungguhan.** `systemd timer` di server, bukan Vercel Cron.
- **`server.js` sudah siap.** Berkas itu sudah memetakan `api/*` jadi rute
  persis seperti Vercel, jadi aplikasinya tinggal dijalankan.

---

## 3. Tahap 0 — tahan dulu (kerjakan minggu ini)

Tujuannya satu: pastikan Redis tidak penuh sebelum pemindahannya siap.

### 3.1 Ukur

```
node tools/ukur-redis.js
```

Simpan hasilnya. Angka ini yang menentukan seberapa mendesak sisanya.

### 3.2 Pastikan cadangan benar-benar jalan

Sebelum memangkas apa pun, buktikan cadangan harian ke Google Drive masih
hidup — lihat `PANDUAN-CADANGAN.md`. Cadangan yang tidak pernah diperiksa sama
dengan tidak ada cadangan.

### 3.3 Pangkas

```
node tools/rapikan-redis.js                    # simulasi, tidak menghapus apa pun
node tools/rapikan-redis.js --jalankan         # setelah angkanya masuk akal
```

Empat pekerjaannya: memangkas AuditLog (yang dibuang **dipindah ke berkas**,
bukan dihilangkan), membuang token login kedaluwarsa, menghapus lampiran AI
yatim, dan menghapus sesi AI yatim.

Bawaannya hanya mensimulasikan. Cadangan ditulis ke `data/cadangan-rapikan-*.json`
sebelum perintah hapus pertama dikirim, dan penulisan buku besar memakai
pengunci versi yang sama dengan aplikasi — kalau ada petugas menyimpan
transaksi di detik yang sama, alatnya berhenti alih-alih menimpanya.

Jalankan di luar jam kerja.

### 3.4 Kalau masih mepet

Naikkan sementara ke paket Upstash berbayar (Pay as You Go, $0,25/GB) selama
masa pemindahan. Biaya sebulan dua jauh lebih murah daripada mengebut migrasi
basis data keuangan.

---

## 4. Tahap 1 — siapkan VPS

### Ukuran yang dibutuhkan

2 vCPU, 4 GB RAM, 50–80 GB NVMe. Itu lapang untuk puluhan pengguna serentak
dan buku besar bertahun-tahun.

### Lokasi

Pilih **Jakarta atau Singapura**. Server Eropa/Amerika lebih murah tapi tiap
klik menanggung 150–200 ms perjalanan — terasa di formulir yang dipakai
sehari-hari.

Kisaran harga per bulan untuk kelas ini (September 2026; harga berubah, cek
sendiri sebelum memutuskan):

| Penyedia | Lokasi | Kisaran |
|---|---|---|
| Biznet Gio | Jakarta | ~Rp 100rb+ |
| DomaiNesia Cloud VPS | Jakarta (IIX) | ~Rp 160rb |
| IDCloudHost / Niagahoster | Jakarta / Singapura | ~Rp 200rb+ |
| DigitalOcean / Vultr / Linode | Singapura | ~$12–24 (~Rp 190–380rb) |

Bandingkan dengan Upstash: paket Fixed 1 GB saja $20/bulan (~Rp 320rb), dan itu
belum termasuk apa pun selain basis data.

### Yang dipasang

Docker + Docker Compose, empat layanan: Caddy, aplikasi, PostgreSQL 16, dan
penyapu cron. Semuanya satu berkas `docker-compose.yml` dan satu `Caddyfile`;
TLS diurus Caddy sendiri tanpa konfigurasi.

### Pagar yang tidak boleh dilewat

- SSH hanya dengan kunci, login kata sandi dimatikan, port 22 dibatasi.
- Firewall: hanya 80, 443, dan SSH yang terbuka. **PostgreSQL tidak boleh
  terbuka ke internet** — ia hanya mendengar di jaringan Docker.
- Rahasia (`RAHASIA_SESI`, `OCR_API_KEY`, kunci penyedia AI, `BLAST_AGEN_TOKEN`)
  tinggal di berkas `.env` di server dengan izin `600`. Repositori ini publik —
  tidak satu pun dari itu boleh masuk git.
- Pembaruan keamanan otomatis (`unattended-upgrades`).

### Cadangan — ini bagian yang paling sering dilupakan

Tiga lapis, dan yang ketiga yang paling penting:

1. `pg_dump` tiap malam ke disk server, disimpan 14 hari.
2. Hasilnya dikirim ke Google Drive — jalur OAuth-nya **sudah ada** di proyek
   ini (`GDRIVE_*` di `.env.example`), tinggal dipakai ulang.
3. **Sekali sebulan, pulihkan cadangan itu ke basis data kosong dan buka
   aplikasinya.** Cadangan yang tidak pernah dicoba dipulihkan belum tentu
   cadangan.

---

## 5. Tahap 2 — pindahkan penyimpanannya, bentuk datanya tetap

Ini langkah yang menghilangkan batas ukuran, dan sengaja dibuat sekecil
mungkin.

Buku besar tetap satu bongkah JSON — hanya tempatnya yang berubah dari Redis
ke satu baris PostgreSQL:

```sql
CREATE TABLE buku_besar (
  id      int PRIMARY KEY DEFAULT 1,
  isi     jsonb NOT NULL,
  versi   bigint NOT NULL DEFAULT 0,
  diubah  timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
```

Yang disentuh di kode hanya empat fungsi di `api/rpc.js` — `bacaRedis`,
`tulisRedis`, `muat`, `tulisLokal`. Pengunci versinya diterjemahkan langsung:

```sql
UPDATE buku_besar SET isi = $1, versi = versi + 1, diubah = now()
WHERE id = 1 AND versi = $2;
```

`rowCount = 0` berarti ada yang mendahului — persis arti `return 0` dari skrip
Lua yang sekarang, jadi logika pengulangan di atasnya tidak perlu diubah sama
sekali.

Modul lain (`lib/ai/db.js`, `lib/blast/db.js`, `lib/fund/db.js`) kebetulan
sudah berbentuk penyimpan kunci-nilai dengan masa kedaluwarsa. Ketiganya
dilayani satu tabel:

```sql
CREATE TABLE kv (
  kunci       text PRIMARY KEY,
  nilai       jsonb NOT NULL,
  kedaluwarsa timestamptz
);
CREATE INDEX kv_kedaluwarsa ON kv (kedaluwarsa) WHERE kedaluwarsa IS NOT NULL;
```

Antarmukanya (`ambil`, `simpan`, `hapus`, `ambilBanyak`) tidak berubah, jadi
seluruh kode modul di atasnya tidak perlu disentuh.

**Apa yang belum membaik di tahap ini:** menyimpan satu transaksi masih menulis
ulang seluruh buku besar. Bedanya sekarang ia menulis ke disk, bukan ke RAM
berbayar, dan lewat jaringan lokal, bukan internet. Batas ukurannya hilang;
soal keanggunan diselesaikan di tahap 3.

**Perpindahan datanya:** satu skrip ekspor dari Redis ke berkas JSON, satu
skrip impor ke PostgreSQL, dan satu skrip pembanding yang menghitung ulang
jumlah baris tiap tabel serta total nominal Penghimpunan dan Pentasyarufan di
kedua sisi. Kalau satu angka saja berbeda, pemindahan dibatalkan.

---

## 6. Tahap 3 — pecah tabel yang berat jadi tabel sungguhan

Dikerjakan **satu tabel per kali**, setelah aplikasi sudah tenang di server
baru. Urutannya menurut yang paling berat:

1. `AuditLog` — paling aman, paling cepat membesar, tidak ada yang bergantung
   padanya kecuali halaman Log.
2. `Penghimpunan` dan `Pentasyarufan` — inti laporan; begitu jadi tabel
   sungguhan, laporan bisa memakai `SUM` dan `GROUP BY` alih-alih mengunduh
   semuanya.
3. `Mutasi`, `Donatur`, `Transfer`.
4. `Sessions` — pindah ke tabel `kv` dengan masa kedaluwarsa.

`api/_engine.js` bekerja di atas `db.sheets.X` berupa larik baris. Supaya
perubahannya tidak menjalar, tiap tabel yang dipecah tetap disajikan dengan
bentuk yang sama lewat pembungkus tipis, jadi kode di atasnya tidak tahu
bedanya. Tabel yang belum dipecah tetap tinggal di bongkah JSON — keduanya bisa
hidup berdampingan selama masa peralihan.

Selesai tahap ini, menyimpan satu transaksi berarti satu `INSERT`, dan laporan
tahunan berarti satu query.

---

## 7. Hari pindah

Rencana yang bisa dibatalkan di tengah jalan:

| Jam | Langkah |
|---|---|
| H-7 | Server baru sudah jalan penuh dengan salinan data. Tim mencobanya lewat alamat sementara (`baru.lazdigital.my.id`). Semua uji `uji-sebelum-deploy.bat` hijau di sana. |
| H-1 | Turunkan TTL DNS `lazdigital.my.id` jadi 300 detik. Ini yang membuat pembatalan bisa cepat. |
| H, 20.00 | Umumkan jeda. Aplikasi di Vercel disetel **hanya-baca**. |
| H, 20.15 | Ekspor terakhir dari Redis, impor ke PostgreSQL, jalankan skrip pembanding. |
| H, 20.30 | Kalau pembanding cocok: arahkan DNS ke VPS. Kalau tidak: batalkan, buka lagi Vercel, tidak ada yang hilang. |
| H, 21.00 | Periksa dengan tangan: login, simpan satu transaksi uji, buka satu laporan, kirim satu broadcast uji, buka satu sesi AI. |
| H+7 | Vercel dan Upstash **dibiarkan hidup**, tidak dipakai. Ini jaring pengaman. |
| H+30 | Baru setelah sebulan tenang, Upstash dimatikan. |

**Jalan mundur** sampai H+7: arahkan DNS kembali ke Vercel. Data yang masuk
selama di server baru perlu diimpor balik, jadi makin lama makin mahal — itu
sebabnya masa jaganya dipatok tujuh hari, bukan dibiarkan terbuka.

---

## 8. Yang harus diterima kalau pakai server sendiri

Jujur soal ini lebih berguna daripada daftar kelebihan:

- **Uptime jadi tanggung jawab sendiri.** Vercel tidak pernah minta diperhatikan.
  VPS perlu dipantau, dan kalau mati jam 2 pagi, tidak ada yang membangunkannya
  selain orang.
- **Pembaruan keamanan jadi pekerjaan rutin.** Node, PostgreSQL, dan sistem
  operasinya perlu diperbarui berkala.
- **Sertifikat TLS** diurus Caddy otomatis, tapi tetap perlu diperiksa sekali-
  sekali bahwa perpanjangannya jalan.
- **Satu mesin berarti satu titik gagal.** Untuk aplikasi pencatatan internal
  ini biasanya diterima, asal cadangannya benar-benar diuji.

Pasang pemantauan sederhana sejak hari pertama: satu layanan gratis yang
menengok `https://lazdigital.my.id/` tiap 5 menit dan mengirim WhatsApp kalau
mati. Gateway WA milik sendiri sudah ada — pakai itu.

---

## 9. Perkiraan waktu

| Tahap | Perkiraan |
|---|---|
| 0 — ukur & pangkas | setengah hari |
| 1 — siapkan VPS | satu hari |
| 2 — pindah penyimpanan + skrip pindah data | dua sampai tiga hari |
| 3 — pecah tabel berat | satu tabel ≈ setengah hari, dicicil |
| Hari pindah | satu malam |

Tahap 0 sudah bisa dikerjakan sekarang; alatnya ada di `tools/`.
Tahap 1 sampai 3 menunggu VPS-nya ada.
