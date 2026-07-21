# 📋 MEMORY FILE — LAZ Digital (Lazismu Bantul)

> **Untuk:** Melanjutkan pengembangan di AI model atau platform lain.
> **Terakhir diperbarui:** 2026-07-07

---

## 🌐 IDENTITAS PROYEK

| Item | Nilai |
|------|-------|
| **Nama Proyek** | LAZ Digital — Sistem Penghimpunan & Pentasyarufan Lazismu Bantul |
| **URL Live** | https://lazdigital.my.id |
| **Platform Deploy** | Vercel (free/hobby plan) |
| **Vercel Project** | `mji-corp-s-projects/laz-vercel` |
| **Direktori Lokal** | `C:\Users\2024\.gemini\antigravity\scratch\laz-vercel\src` |
| **Login Default** | username: `superadmin` · password: `admin123` |

---

## 🗂️ STRUKTUR FILE UTAMA

```
src/
├── api/
│   ├── _engine.js       ← BACKEND UTAMA: semua logika bisnis, RPC, DB ops (~1020 baris)
│   └── rpc.js           ← HTTP handler: load/save DB dari Upstash Redis REST API + /tmp cache
├── public/
│   ├── index.html       ← Entry point HTML
│   ├── app.js           ← FRONTEND UTAMA: semua UI, render, API calls (~115KB)
│   ├── styles.css       ← Styling lengkap (~33KB)
│   └── public.html      ← Halaman publik donatur (read-only)
├── vercel.json          ← Routing config (semua POST /api → rpc.js)
├── .env.local           ← Env vars lokal (JANGAN commit ke Git publik)
└── package.json         ← deps: xlsx (tidak perlu @vercel/blob lagi)
```

---

## 🔑 ENVIRONMENT VARIABLES

| Variabel | Keterangan |
|----------|------------|
| `UPSTASH_REDIS_REST_URL` | URL REST API dari konsol Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Token otentikasi REST API Upstash Redis |
| `DB_SECRET` | (Opsional) Secret pengaman tambahan |
| `PUBLIC_BASE_URL` | URL publik aplikasi (untuk link publik donatur) |

Database disimpan di **Upstash Redis** di bawah key tunggal:
`laz:db`
(REST API dipanggil secara asinkron tanpa menggunakan library npm tambahan untuk keringanan serverless function)

---

## 🗄️ SKEMA DATABASE (JSON / Google Sheets-like)

Database = objek JSON: `{ sheets: {...}, props: {...} }`

### Sheet: `Penghimpunan`
| Kolom | Keterangan |
|-------|------------|
| `id` | UUID unik |
| `noKwitansi` | Format: KW/TAHUN/XXXXXX |
| `tanggal` | ISO YYYY-MM-DD |
| `jenisDana` | Zakat / Infak / Sedekah / Wakaf / Kurban / Fidyah / DSKL |
| `subJenis` | Zakat Mal / Infak Umum / Infak Terikat / dll. |
| `pilar` | Kesehatan / Pendidikan / Sosial Dakwah / Kemanusiaan / DAM / Fidyah / Qurban / Pendidikan/Filanatropis |
| `program` | Nama program (sama dengan pilar untuk terikat) |
| `namaDonatur` | Nama donatur / muzakki |
| `tipeDonatur` | Perorangan / Lembaga/Perusahaan / Hamba Allah / Kantor Layanan (KLL) / Unit Layanan (ULL) |
| `layananId` | ID referensi ke sheet Layanan (KLL/ULL) |
| `telepon`, `email`, `alamat` | Kontak donatur |
| `jumlah` | Nominal (number) |
| `metode` | Cash/Tunai / Transfer Bank / QRIS / E-Wallet / Debit/Kartu |
| `rekeningId` | ID referensi ke sheet Rekening |
| `bank` | Nama bank (dari rekeningId) |
| `statusBayar` | Lunas / Pending |
| `keterangan` | Catatan tambahan |
| `fundraising` | Nama petugas fundraising |
| `dibuat` | ISO timestamp pembuatan |

### Sheet: `Pentasyarufan`
| Kolom | Keterangan |
|-------|------------|
| `id`, `noBukti` | ID & nomor bukti |
| `tanggal` | ISO date |
| `ashnaf` | Fakir / Miskin / Amil / Muallaf / Riqab / Gharimin / Fi Sabilillah / Ibnu Sabil |
| `program` | Nama program penyaluran |
| `sumberDana` | Sumber dana yang disalurkan |
| `namaPenerima`, `nik`, `telepon`, `alamat` | Data penerima |
| `jumlah` | Nominal |
| `bentukBantuan` | Uang Tunai / Sembako / Beasiswa / Modal Usaha / dll. |
| `statusSalur` | Sudah Disalurkan / Pending |
| `petugas`, `keterangan`, `fundraising` | Petugas & catatan |

### Sheet: `Layanan` (KLL/ULL)
| Kolom | Keterangan |
|-------|------------|
| `id`, `tipe` | UUID & tipe: KLL atau ULL |
| `kode` | Kode singkat (misal: SRD, BJN) |
| `nama` | Nama KLL/ULL (misal: Srandakan, Pajangan) |
| `wilayah`, `penanggungJawab`, `telepon`, `aktif` | Detail |

### Sheet: `Rekening`
| Kolom | Keterangan |
|-------|------------|
| `id`, `namaBank`, `nomor`, `atasNama` | Data rekening |
| `fundGroup` | Kelompok dana (Zakat/Infak/dll.) |

### Sheet: `Users`
| Kolom | Keterangan |
|-------|------------|
| `id`, `username`, `passwordHash`, `salt` | Auth data |
| `nama`, `role` | Role: superadmin / staff / readonly |
| `permissions` | JSON: `{"penghimpunan":{"view":true,"create":true,...}}` |

---

## ⚙️ ARSITEKTUR TEKNIS

### Backend (`_engine.js`)
- Diporting dari Google Apps Script ke **Node.js** dengan shim lengkap (SpreadsheetApp, PropertiesService, Utilities, Logger, dll.)
- Pola: `runRPC(db, 'apiFungsiNama', [args...])` → return `{ db, result }`
- Fungsi RPC utama:
  - `apiLogin` / `apiLogout`
  - `apiDashboard` — agregasi semua widget
  - `apiSaveHimpun` / `apiDeleteHimpun` / `apiDeleteHimpunByDateRange`
  - `apiJurnalData` — generate data Jurnal Penerimaan
  - `apiParseImportText` / `apiParseImportUrl` — import & AI parser
  - `apiSaveLayanan` / `apiSaveRekening` / `apiSaveUser`

### Frontend (`app.js`)
- **Vanilla JavaScript murni** — tidak ada React/Vue/Next/dll.
- Komunikasi ke backend via `gas(fn, ...args)` → POST `/api/rpc`
- State global: `TOKEN`, `ME`, `CACHE`, `SETTINGS`
- Dashboard widget: drag-and-drop, layout disimpan di `localStorage`
- Render helper pattern: `renderDashboard()`, `renderTable()`, dll.

### Storage (rpc.js)
- **Upstash Redis** sebagai persistent storage utama (key: `laz:db`).
- **/tmp** sebagai cache lokal serverless function (lebih cepat, tidak persisten antar cold-start).
- Versi basis data dilacak menggunakan increment properti `db.props._ver` pada objek basis data.

---

## 📊 FITUR DASHBOARD (9 Widget)

| Widget ID | Nama Tampilan | Sumber Data |
|-----------|---------------|-------------|
| `kpis` | KPI Cards (Total Himpun/Tasyaruf/dll.) | aggregated |
| `jenis` | Jenis Dana Terhimpun | byJenis |
| `pilar` | Pilar Program | byPilar |
| `bank` | Bank & Kas | byBank (metode) |
| `ashnaf` | Penyaluran Berdasarkan Ashnaf | byAshnaf |
| `program` | Kantor Layanan & ULL | byLayanan |
| `fundraising` | Capaian Fundraising | byFundraising |
| `rhimpun` | Transaksi Masuk Terbaru | recentHimpun |
| `rtasyaruf` | Penyaluran Terbaru | recentTasyaruf |
| `tren` | Tren Arus Dana 12 Bulan | series |


---

## 📥 IMPORT DATA

### Cara Import:
1. Tombol **Import Data** di toolbar tabel Penghimpunan
2. Pilih tab: **File/Link** (Excel/.xlsx/Google Sheets) atau **Tempel Teks** (TSV)
3. Preview baris valid/tidak valid sebelum simpan

### AI Parser — Klasifikasi Pilar Otomatis
Fungsi `mapImportedRow()` di `_engine.js` menganalisis kolom Uraian/Nama:

**Deteksi Tipe Donatur:**
- Diawali `KLL` atau `ULL` → cari di master Layanan → tipeDonatur = KLL/ULL
- Lainnya → Perorangan

**Klasifikasi Dana Utama:**
- `zakat`, `zakatkl`, `zakat mal`, `zakat fitrah`, `zakat profesi` → jenisDana = Zakat
- `wakaf` → Wakaf
- `amil` → Amil (DSKL)
- Default → Infak

**Klasifikasi Pilar Infak Terikat (dari suffix setelah nama donatur):**

| Kata Kunci Suffix | Pilar | subJenis |
|-------------------|-------|----------|
| `kesehatan`, `sehat` | Kesehatan | Infak Terikat |
| `pendidikan`, `sekolah`, `beasiswa`, `pondok`, `pesantren`, `asy syifa`, `sdua` | Pendidikan | Infak Terikat |
| `kebakaran`, `dakwah`, `sosial` | Sosial Dakwah | Infak Terikat |
| `kemanusiaan`, `bencana` | Kemanusiaan | Infak Terikat |
| `dam`, `kulit`, `kambing` | DAM | Infak Terikat |
| `fidyah`, `fidiah` | Fidyah | Infak Terikat |
| `qurban`, `kurban` | Qurban | Infak Terikat |
| `filantropis` | Pendidikan/Filanatropis | Infak Terikat |
| *(kosong/tidak dikenal)* | — | Infak Umum |
| *(fallback kustom)* | Sosial Dakwah | Infak Terikat |

> **Catatan:** Jika Infak Umum & tidak ada `layananId` → namaDonatur & layananId fallback ke **"Lazismu Daerah Bantul"**

**Deteksi Metode:**
- `transfer`, `tf`, `bank` → Transfer Bank
- `qris`, `qr` → QRIS
- Default → Cash/Tunai

---

## 📄 JURNAL PENERIMAAN (LAPORAN EXCEL)

Format: **2 sheet** sesuai standar Lazismu Pusat.

| Sheet | Isi |
|-------|-----|
| **Tunai** | Semua transaksi via Kas (metode Cash/Tunai) |
| **Transfer** | Semua transaksi via Bank/QRIS/E-Wallet |

**5 Kolom persis:** `Tanggal | Akun | Debet | Kredit | Keterangan`

**Nama Akun (tanpa nomor kwitansi):**
- Debit: `Kas Zakat`, `Kas Infak`, `Bank Zakat`, `Bank Infak`, dll.
- Kredit: `Penerimaan Zakat Mal`, `Penerimaan Infak Umum`, `Penerimaan Infak Terikat - Kesehatan`, dll.
- Keterangan: `{jenisDana} {subJenis} {namaDonatur/KLL/ULL} | Fr: {fundraising}`

**Pengelompokan baris seksi header:**
`PENERIMAAN ZAKAT VIA KAS` → `PENERIMAAN INFAK UMUM VIA KAS` → `PENERIMAAN INFAK TERIKAT VIA BANK` → dll.

---

## 🎨 DESAIN & UI

| Aspek | Detail |
|-------|--------|
| **Font Heading** | Plus Jakarta Sans (700, 800) |
| **Font Body** | Inter (400, 500, 600) |
| **Warna Aksen** | `#ea6a1e` (oranye) + `#f7931e` (oranye muda) |
| **Mode Gelap** | Didukung penuh |
| **Background** | Radial gradient animatif + dot grid subtle |
| **Kartu/Widget** | Glassmorphism — `backdrop-filter: blur(16px)` |
| **Navigasi** | Icon nav atas dengan tooltip |
| **Animasi** | cardIn, hover scale, translateY, hover row list |

---

## 🔐 SISTEM PERMISSION

**Modul:** `dashboard`, `penghimpunan`, `pentasyarufan`, `laporan`, `rekening`, `layanan`, `users`, `settings`

**Aksi per modul:** `view`, `create`, `edit`, `delete`

**Role:** `superadmin` (semua akses), `staff`, `readonly`

---

## 🚀 CARA DEPLOY

```powershell
cd C:\Users\2024\.gemini\antigravity\scratch\laz-vercel\src
vercel --prod --yes
```

---

## ✅ RIWAYAT FITUR YANG SUDAH ADA

- Form penghimpunan lengkap (semua jenis dana)
- Tabel transaksi filter multi-kriteria
- Import data via Excel/Google Sheets link
- Import data via copy-paste TSV
- AI Parser klasifikasi pilar dari deskripsi uraian
- Master data KLL/ULL, Rekening, Fundraising
- Dashboard 9 widget (drag, resize, sembunyikan)
- Hapus data dengan rentang tanggal
- Jurnal Penerimaan Excel 2 sheet (format standar Pusat)
- Nomor kwitansi otomatis
- Cetak kwitansi per transaksi
- Halaman publik donatur (read-only)
- Multi-user dengan permission granular
- Dark mode & Responsive mobile

---

## ⚠️ BUG HISTORIS & SOLUSINYA

| Bug | Solusi |
|-----|--------|
| `isTransferMethod is not defined` saat download jurnal | Ganti ke fungsi `isTransfer()` |
| Nama akun dobel: "Penerimaan Zakat Zakat Mal" | Strip awalan "Zakat " dari subJenis sebelum digabung |
| Hapus data tidak berfungsi | Perbaiki DOM ID modal + tambah await async |
| Import URL mengembalikan `{}` kosong | Ubah rpc.js dan runRPC ke async/await |
| Pilar tidak terbaca di hasil import | Assign `pilar` ke return object di `mapImportedRow` |
| Spinner loading tidak berhenti | Fix SyntaxError di fungsi `saveHimpun` (duplikasi kode) |
