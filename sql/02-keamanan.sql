-- ============================================================
-- LAZ Digital: menutup pintu belakang Supabase
--
-- KENAPA BERKAS INI WAJIB DIJALANKAN
--
-- Supabase tidak cuma memberi basis data. Ia juga otomatis membuka SELURUH
-- skema public sebagai REST API di https://<proyek>.supabase.co/rest/v1/...,
-- dan API itu bisa dipakai siapa pun yang memegang "anon key". Anon key memang
-- dirancang untuk ditempel di halaman web, jadi ia bukan rahasia.
--
-- Di proyek baru, Supabase juga memberi hak penuh atas tabel di skema public
-- kepada peran anon dan authenticated. Artinya, tanpa berkas ini:
--
--     curl "https://<proyek>.supabase.co/rest/v1/Donatur?select=*" \
--          -H "apikey: <anon key>"
--
-- mengembalikan seluruh nama, alamat, dan nomor telepon donatur. Tabel Users
-- mengembalikan hash sandi beserta salt-nya. Dan karena haknya penuh, bukan
-- hanya baca: baris bisa diubah dan dihapus dari luar.
--
-- Itulah arti peringatan kuning "RLS disabled" di dasbor Supabase. Bukan
-- catatan gaya penulisan; itu pemberitahuan bahwa tabelnya terbuka.
--
-- APA YANG DILAKUKAN BERKAS INI
--
-- 1. Menyalakan Row Level Security di semua tabel, TANPA satu pun policy.
--    Tanpa policy, RLS berarti "tidak ada yang boleh apa-apa" bagi peran biasa.
-- 2. Mencabut hak anon dan authenticated atas skema public seluruhnya, jadi
--    REST API-nya tidak punya pintu sama sekali, bahkan untuk mencoba.
-- 3. Mencabut juga hak bawaan untuk tabel yang dibuat di kemudian hari, supaya
--    tabel baru tidak lahir terbuka lagi.
--
-- KENAPA APLIKASINYA TETAP JALAN
--
-- LAZDigital tidak lewat REST API Supabase. Ia menyambung langsung ke
-- PostgreSQL sebagai peran postgres, dan peran itu PEMILIK tabelnya. Pemilik
-- tabel melewati RLS (kecuali dipaksa dengan FORCE ROW LEVEL SECURITY, dan itu
-- tidak dipakai di sini). Jadi aplikasinya membaca dan menulis seperti biasa,
-- sementara pintu dari luar tertutup.
--
-- Ini sudah diuji, bukan diperkirakan: tools/test_laz_pg.js dijalankan di atas
-- basis data yang RLS-nya menyala, sebagai peran pemilik yang BUKAN superuser,
-- dan ke-70 pemeriksaannya tetap lulus.
--
-- jalankan SETELAH sql/01-skema.sql, di SQL Editor Supabase.
-- Aman diulang berapa kali pun.
-- ============================================================

-- ---------- 1. RLS menyala di semua tabel ----------
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ---------- 2. Tutup pintu REST API ----------
-- Dijaga pemeriksaan keberadaan peran: di PostgreSQL biasa (mis. saat menguji
-- di komputer sendiri) peran anon dan authenticated tidak ada, dan berkas ini
-- harus tetap bisa dijalankan di sana tanpa galat.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- ---------- 3. Tabel yang dibuat nanti tidak lahir terbuka ----------
-- ALTER DEFAULT PRIVILEGES hanya berlaku bagi peran yang MEMBUAT objeknya.
-- current_user dipakai, bukan nama peran yang ditulis mati: di SQL Editor
-- Supabase current_user adalah postgres, yaitu peran yang sama yang membuat
-- tabelnya, sedangkan di tempat lain bisa peran lain.
--
-- Blok ini SENGAJA dipisah dari blok di atas. Kalau digabung, satu galat hak
-- akses di sini akan membatalkan pencabutan hak yang sudah berhasil di atas,
-- dan hasilnya terlihat "sudah dijalankan" padahal tabelnya masih terbuka.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', current_user, r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', current_user, r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', current_user, r);
    END IF;
  END LOOP;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Hak bawaan untuk tabel baru tidak bisa diubah oleh peran ini. Pencabutan di langkah 2 dan RLS di langkah 1 tetap berlaku.';
END $$;

-- ---------- 4. Periksa hasilnya ----------
-- Peran anon tidak ada di PostgreSQL biasa, dan has_table_privilege() atas
-- peran yang tidak ada melempar galat. Karena itu pemeriksaannya dibungkus,
-- bukan ditaruh langsung di SELECT.
DO $$
DECLARE sisa text;
DECLARE t record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'Peran anon tidak ada di sini (bukan Supabase). Langkah RLS tetap berlaku.';
    RETURN;
  END IF;
  /* Diperiksa satu per satu di dalam perulangan, BUKAN sebagai satu SELECT
     dengan dua syarat di WHERE. Alasannya: PostgreSQL boleh menilai syarat di
     WHERE dalam urutan apa pun, jadi has_table_privilege() bisa dijalankan
     lebih dulu atas baris pg_tables milik skema lain (pg_tables memuat tabel
     sistem juga) dan berhenti dengan galat "relation public.pg_statistic does
     not exist". Perulangan memastikan penyaringan skemanya terjadi dulu. */
  sisa := NULL;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  LOOP
    IF has_table_privilege('anon', format('public.%I', t.tablename), 'SELECT') THEN
      sisa := coalesce(sisa || ', ', '') || t.tablename;
    END IF;
  END LOOP;
  IF sisa IS NULL THEN
    RAISE NOTICE 'Bagus: peran anon tidak bisa membaca satu tabel pun.';
  ELSE
    RAISE WARNING 'MASIH TERBUKA untuk anon: %', sisa;
  END IF;
END $$;

-- Yang dilihat di tabel hasil: rls_menyala harus true di SEMUA baris, dan
-- jumlah_policy 0. Nol policy itu memang yang diinginkan: tidak ada yang
-- diizinkan lewat, sementara aplikasinya masuk sebagai pemilik tabel.
SELECT
  t.tablename    AS tabel,
  t.rowsecurity  AS rls_menyala,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS jumlah_policy
FROM pg_tables t
WHERE t.schemaname = 'public'
ORDER BY t.tablename;
