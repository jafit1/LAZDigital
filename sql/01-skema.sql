-- ============================================================
-- LAZ Digital: skema PostgreSQL
--
-- Menggantikan satu bongkah JSON di Redis (kunci laz:db) dengan tabel
-- sungguhan. Yang berubah bukan sekadar tempat penyimpanan:
--
--   dulu  : membuka daftar Penghimpunan = mengunduh 2,75 MB lalu menyaringnya
--           di aplikasi; menyimpan satu transaksi = menulis ulang 2,75 MB
--   kini  : WHERE tanggal BETWEEN ... mengembalikan baris yang diminta saja,
--           dan menyimpan satu transaksi adalah satu INSERT
--
-- ATURAN YANG DIPEGANG DI BERKAS INI
--
-- 1. UANG MEMAKAI numeric, BUKAN float. Tipe pecahan biner tidak bisa
--    menyimpan 0,1 secara tepat, dan selisih sepersekian sen yang menumpuk
--    di laporan keuangan zakat bukan hal yang bisa dijelaskan ke siapa pun.
--    numeric(18,2) menampung sampai 9.999 triliun rupiah dengan tepat.
--
-- 2. TANGGAL MEMAKAI date, BUKAN text. Ini yang membuat "laporan Januari"
--    menjadi satu rentang berindeks alih-alih membandingkan potongan teks.
--    Pemindahannya menolak baris yang tanggalnya tidak bisa dibaca, bukan
--    menyimpannya sebagai NULL diam-diam.
--
-- 3. TIDAK ADA FOREIGN KEY KE Rekening DAN Layanan. Data lama memuat
--    rekeningId yang rekeningnya sudah dihapus, dan itu bukan kesalahan yang
--    boleh menggagalkan pemindahan. Hubungannya dijaga lewat indeks dan
--    pemeriksaan, bukan lewat penolakan.
--
-- 4. NAMA KOLOM PERSIS SAMA dengan nama kunci di JSON lama (camelCase, jadi
--    perlu tanda kutip di SQL). Disamakan dengan sengaja: api/_engine.js
--    membaca r.namaDonatur, r.jenisDana, dan seratusan nama lain. Mengubahnya
--    jadi snake_case berarti menyentuh ribuan baris kode yang tidak ada
--    hubungannya dengan pemindahan ini, dan tiap sentuhan itu risiko.
--
-- jalankan:  psql "<alamat>" -f sql/01-skema.sql
-- Aman diulang: semuanya IF NOT EXISTS.
-- ============================================================

-- ---------- catatan pemindahan ----------
-- Siapa memindahkan apa, kapan, dari berkas mana. Pertanyaan pertama saat
-- ada angka yang mencurigakan enam bulan lagi adalah "ini datang dari mana",
-- dan tanpa tabel ini jawabannya cuma ingatan orang.
CREATE TABLE IF NOT EXISTS migrasi (
  id          bigserial PRIMARY KEY,
  waktu       timestamptz NOT NULL DEFAULT now(),
  mode        text        NOT NULL,          -- 'kosong' | 'penuh'
  berkas      text,                          -- nama berkas ekspor sumber
  potong      date,                          -- tanggal potong saldo awal
  catatan     jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- ---------- data induk ----------
CREATE TABLE IF NOT EXISTS "Users" (
  "id"            text PRIMARY KEY,
  "username"      text NOT NULL,
  "passwordHash"  text,
  "salt"          text,
  "nama"          text,
  "role"          text,
  -- Hak akses per modul. jsonb, bukan text: supaya nanti bisa ditanya
  -- "siapa saja yang boleh menghapus penghimpunan" tanpa mengunduh semuanya.
  "permissions"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "aktif"         boolean NOT NULL DEFAULT true,
  "dibuat"        timestamptz,
  "layanan"       text
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username ON "Users" (lower("username"));

CREATE TABLE IF NOT EXISTS "Rekening" (
  "id"        text PRIMARY KEY,
  "namaBank"  text,
  "nomor"     text,
  "atasNama"  text,
  "fundGroup" text,
  "aktif"     boolean NOT NULL DEFAULT true,
  "dibuat"    timestamptz
);

CREATE TABLE IF NOT EXISTS "Layanan" (
  "id"               text PRIMARY KEY,
  "tipe"             text,
  "kode"             text,
  "nama"             text,
  "wilayah"          text,
  "penanggungJawab"  text,
  "telepon"          text,
  "aktif"            boolean NOT NULL DEFAULT true,
  "dibuat"           timestamptz
);
CREATE INDEX IF NOT EXISTS layanan_kode ON "Layanan" ("kode");

CREATE TABLE IF NOT EXISTS "Donatur" (
  "id"        text PRIMARY KEY,
  "nama"      text NOT NULL,
  "kategori"  text,
  "telepon"   text,
  "alamat"    text,
  "email"     text,
  "dibuat"    timestamptz
);
-- Pencarian donatur di aplikasi memakai nama, bukan id. Indeks trigram
-- membuat "cari yang mengandung kata" tetap cepat tanpa memindai seluruh
-- tabel; kalau ekstensinya tidak ada, indeks huruf-kecil biasa sudah jauh
-- lebih baik daripada tanpa indeks sama sekali.
CREATE INDEX IF NOT EXISTS donatur_nama ON "Donatur" (lower("nama"));

CREATE TABLE IF NOT EXISTS "Settings" (
  "key"    text PRIMARY KEY,
  "value"  text
);

-- ---------- transaksi ----------
CREATE TABLE IF NOT EXISTS "Penghimpunan" (
  "id"           text PRIMARY KEY,
  "noKwitansi"   text,
  "tanggal"      date NOT NULL,
  "jenisDana"    text,
  "subJenis"     text,
  "pilar"        text,
  "program"      text,
  "namaDonatur"  text,
  "tipeDonatur"  text,
  "layananId"    text,
  "telepon"      text,
  "email"        text,
  "alamat"       text,
  "jumlah"       numeric(18,2) NOT NULL DEFAULT 0,
  "metode"       text,
  "rekeningId"   text,
  "bank"         text,
  "statusBayar"  text,
  "atasNama"     text,
  "keterangan"   text,
  "petugas"      text,
  "dibuat"       timestamptz,
  "fundraising"  text,
  "akunKredit"   text
);
CREATE INDEX IF NOT EXISTS penghimpunan_tanggal   ON "Penghimpunan" ("tanggal");
CREATE INDEX IF NOT EXISTS penghimpunan_rekening  ON "Penghimpunan" ("rekeningId");
CREATE INDEX IF NOT EXISTS penghimpunan_layanan   ON "Penghimpunan" ("layananId");
CREATE INDEX IF NOT EXISTS penghimpunan_donatur   ON "Penghimpunan" (lower("namaDonatur"));
CREATE INDEX IF NOT EXISTS penghimpunan_jenisdana ON "Penghimpunan" ("jenisDana");
-- Nomor kwitansi harus unik, tapi baris lama ada yang kosong. UNIQUE biasa
-- akan menolak baris kedua yang kosong; indeks parsial ini hanya menjaga
-- yang benar-benar terisi.
CREATE UNIQUE INDEX IF NOT EXISTS penghimpunan_kwitansi
  ON "Penghimpunan" ("noKwitansi") WHERE "noKwitansi" IS NOT NULL AND "noKwitansi" <> '';

CREATE TABLE IF NOT EXISTS "Pentasyarufan" (
  "id"             text PRIMARY KEY,
  "noBukti"        text,
  "tanggal"        date NOT NULL,
  "ashnaf"         text,
  "program"        text,
  "sumberDana"     text,
  "namaPenerima"   text,
  "nik"            text,
  "telepon"        text,
  "alamat"         text,
  "jumlah"         numeric(18,2) NOT NULL DEFAULT 0,
  "bentukBantuan"  text,
  "metode"         text,
  "statusSalur"    text,
  "petugas"        text,
  "keterangan"     text,
  "dibuat"         timestamptz,
  "fundraising"    text,
  "rekeningId"     text,
  "bank"           text,
  "section"        text
);
CREATE INDEX IF NOT EXISTS pentasyarufan_tanggal  ON "Pentasyarufan" ("tanggal");
CREATE INDEX IF NOT EXISTS pentasyarufan_rekening ON "Pentasyarufan" ("rekeningId");
CREATE INDEX IF NOT EXISTS pentasyarufan_sumber   ON "Pentasyarufan" ("sumberDana");
-- hitungSaldo() memperlakukan section yang diawali "UMP LPJ" secara khusus
CREATE INDEX IF NOT EXISTS pentasyarufan_section  ON "Pentasyarufan" ("section");
CREATE UNIQUE INDEX IF NOT EXISTS pentasyarufan_bukti
  ON "Pentasyarufan" ("noBukti") WHERE "noBukti" IS NOT NULL AND "noBukti" <> '';

CREATE TABLE IF NOT EXISTS "UangMuka" (
  "id"          text PRIMARY KEY,
  "tanggal"     date NOT NULL,
  "jenis"       text,          -- 'keluar' | 'kembali'
  "dana"        text,
  "layanan"     text,
  "akun"        text,
  "rekeningId"  text,
  "kasNama"     text,
  "nominal"     numeric(18,2) NOT NULL DEFAULT 0,
  "keterangan"  text,
  "section"     text,
  "petugas"     text,
  "dibuat"      timestamptz
);
CREATE INDEX IF NOT EXISTS uangmuka_tanggal ON "UangMuka" ("tanggal");
CREATE INDEX IF NOT EXISTS uangmuka_dana    ON "UangMuka" ("dana");

CREATE TABLE IF NOT EXISTS "Transfer" (
  "id"              text PRIMARY KEY,
  "tanggal"         date NOT NULL,
  "jenis"           text,
  "dariAkun"        text,
  "dariRekeningId"  text,
  "dariKas"         text,
  "keAkun"          text,
  "keRekeningId"    text,
  "keKas"           text,
  "nominal"         numeric(18,2) NOT NULL DEFAULT 0,
  "keterangan"      text,
  "section"         text,
  "petugas"         text,
  "dibuat"          timestamptz
);
CREATE INDEX IF NOT EXISTS transfer_tanggal ON "Transfer" ("tanggal");

CREATE TABLE IF NOT EXISTS "Mutasi" (
  "id"          text PRIMARY KEY,
  "tanggal"     date NOT NULL,
  "deskripsi"   text,
  "tipe"        text,
  "nominal"     numeric(18,2) NOT NULL DEFAULT 0,
  "dibuat"      timestamptz
);
CREATE INDEX IF NOT EXISTS mutasi_tanggal ON "Mutasi" ("tanggal");

-- ---------- saldo awal ----------
-- Inti dari pemindahan "mulai kosong tapi saldo dibawa". Isinya dihitung dari
-- data lama per tanggal potong, lalu tabel transaksi dimulai bersih.
-- hitungSaldo() membacanya per TAHUN, jadi kolom tahun wajib benar.
CREATE TABLE IF NOT EXISTS "SaldoAwal" (
  "id"          text PRIMARY KEY,
  "tahun"       text NOT NULL,
  "jenis"       text,          -- '' untuk kas/bank, 'ump' untuk uang muka program
  "akun"        text,
  "rekeningId"  text,
  "kasNama"     text,
  "dana"        text,
  "nominal"     numeric(18,2) NOT NULL DEFAULT 0,
  "keterangan"  text,
  "dibuat"      timestamptz,
  "oleh"        text
);
CREATE INDEX IF NOT EXISTS saldoawal_tahun ON "SaldoAwal" ("tahun");

-- ---------- sesi & jejak ----------
CREATE TABLE IF NOT EXISTS "Sessions" (
  "token"    text PRIMARY KEY,
  "userId"   text NOT NULL,
  "expired"  timestamptz NOT NULL
);
-- Sesi kedaluwarsa dulu menumpuk di dalam bongkah JSON karena tidak ada yang
-- membersihkannya. Di sini indeksnya membuat pembersihan jadi satu DELETE.
CREATE INDEX IF NOT EXISTS sessions_expired ON "Sessions" ("expired");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         bigserial PRIMARY KEY,
  "waktu"      timestamptz NOT NULL,
  "userId"     text,
  "username"   text,
  "aksi"       text,
  "modul"      text,
  "entitasId"  text,
  "ringkas"    text,
  "detail"     text,
  "ip"         text,
  "ua"         text
);
CREATE INDEX IF NOT EXISTS auditlog_waktu  ON "AuditLog" ("waktu" DESC);
CREATE INDEX IF NOT EXISTS auditlog_entitas ON "AuditLog" ("entitasId");

-- ---------- penyimpan kunci-nilai untuk modul AI / Broadcast / Fundraising ----------
-- Ketiga modul itu memang berbentuk kunci-nilai dengan masa berlaku, dan
-- bentuk itu tidak perlu diubah: tidak ada laporan yang dibuat darinya.
-- Satu tabel ini menggantikan seluruh ai:*, blast:*, dan fund:* di Redis,
-- jadi Redis tidak dibutuhkan lagi sama sekali.
CREATE TABLE IF NOT EXISTS kv (
  kunci        text PRIMARY KEY,
  nilai        text NOT NULL,
  kedaluwarsa  timestamptz,
  diubah       timestamptz NOT NULL DEFAULT now()
);
-- Indeks parsial: hanya baris yang memang berumur yang diindeks, jadi
-- penyapunya murah dan indeksnya kecil.
CREATE INDEX IF NOT EXISTS kv_kedaluwarsa ON kv (kedaluwarsa) WHERE kedaluwarsa IS NOT NULL;

-- Himpunan (SADD/SREM/SMEMBERS milik Redis) jadi barisnya sendiri, bukan
-- larik JSON di dalam satu kolom. Alasannya bukan kerapian: dengan larik JSON,
-- dua petugas yang menambah anggota di saat bersamaan saling menimpa dan satu
-- anggota hilang tanpa jejak. Sebagai baris, keduanya cuma dua INSERT.
CREATE TABLE IF NOT EXISTS kv_set (
  kunci    text NOT NULL,
  anggota  text NOT NULL,
  PRIMARY KEY (kunci, anggota)
);

-- ---------- salinan cadangan ----------
-- Dulu tiap salinan disimpan sebagai satu kunci Redis, dan DAFTARNYA disimpan
-- sebagai satu larik JSON di kunci lain. Akibatnya: 16 salinan menghabiskan
-- 37,85 MB alias 93% isi Redis, di dalam basis data yang sama dengan data yang
-- sedang dicadangkan - jadi kalau basis datanya yang bermasalah, cadangannya
-- ikut. Di sini salinannya jadi baris, daftarnya jadi kueri, dan pemangkasannya
-- satu DELETE. Cadangan lepas-pantai tetap di Google Drive; tabel ini untuk
-- pulih cepat, bukan untuk satu-satunya tempat.
CREATE TABLE IF NOT EXISTS cadangan (
  nama     text PRIMARY KEY,
  jenis    text NOT NULL,                 -- 'harian' | 'manual' | 'sebelum-pulih'
  waktu    timestamptz NOT NULL DEFAULT now(),
  ukuran   integer NOT NULL,
  isi      text NOT NULL
);
CREATE INDEX IF NOT EXISTS cadangan_jenis_waktu ON cadangan (jenis, waktu DESC);

-- Penyapu yang menghapus baris kedaluwarsa. Dipanggil berkala oleh aplikasi
-- atau oleh cron; Redis melakukannya sendiri, PostgreSQL perlu disuruh.
CREATE OR REPLACE FUNCTION sapu_kv() RETURNS integer AS $$
DECLARE n integer;
BEGIN
  DELETE FROM kv WHERE kedaluwarsa IS NOT NULL AND kedaluwarsa < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
