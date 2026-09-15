# Panduan Scan Kwitansi & Pembacaan Otomatis (AI)

Fitur ini ada di menu **Penghimpunan**, tombol **Scan Kwitansi** di kepala formulir.

Alurnya:

1. Petugas memotret kwitansi (atau memilih foto dari galeri).
2. Fotonya muncul di panel samping formulir sebagai penuntun.
3. Foto dikirim ke `/api/ocr`, dibaca AI, lalu hasilnya **mengisi formulir otomatis**.
4. Kolom hasil AI diberi warna hijau dan lencana **AI**; yang AI sendiri ragu diberi
   warna kuning dan lencana **periksa**. Warnanya hilang begitu petugas menyentuh kolom itu.
5. Petugas memeriksa, membetulkan yang perlu, lalu menyimpan.

Foto kwitansinya **tidak pernah disimpan** — tidak ke basis data, tidak ke server.
Ia hidup di peramban saja dan dibuang setelah transaksi tersimpan.

---

## Kalau AI belum disetel

Fitur scan tetap jalan penuh sebagai penuntun manual: foto tampil di samping
formulir, petugas menyalin sambil melihat. Tidak ada pesan galat dan tidak ada
permintaan keluar. Jadi mengaktifkan AI sifatnya opsional.

---

## Menyalakan pembacaan otomatis

### 1. Ambil kunci API

**Google Gemini (disarankan — ada kuota gratis, paling murah):**

1. Buka <https://aistudio.google.com/apikey>
2. **Create API key** → pilih/ buat project → salin kuncinya (diawali `AIza...`)

**OpenAI (alternatif):** <https://platform.openai.com/api-keys> (kunci diawali `sk-...`)

### 2. Isikan ke Vercel

Vercel → project LAZDigital → **Settings** → **Environment Variables** →
tambahkan, untuk *Production*, *Preview*, dan *Development*:

| Nama | Isi | Wajib |
|---|---|---|
| `OCR_API_KEY` | kunci dari langkah 1 | ya |
| `OCR_PENYEDIA` | `gemini` atau `openai` | tidak (bawaan `gemini`) |
| `OCR_MODEL` | mis. `gemini-2.5-flash` | tidak |
| `OCR_BATAS_HARIAN` | mis. `300` | tidak (bawaan 300) |

### 3. Deploy

Jalankan `deploy.bat`. Environment variable baru hanya terbaca oleh deployment
baru — mengisinya saja tidak cukup.

### 4. Cek

Buka Penghimpunan → Scan Kwitansi → foto apa saja. Kalau muncul baris hijau
*"… isian terbaca — mohon periksa"*, fitur sudah hidup.

---

## ⚠️ Kunci API jangan sampai masuk git

Repositori LAZDigital **publik**. Kunci API hanya boleh hidup di:

- Environment Variables Vercel, dan
- berkas `.env.local` di komputer sendiri (sudah ada di `.gitignore`).

Jangan pernah menulisnya di `vercel.json`, di dalam kode, atau di berkas apa pun
yang ikut ter-commit. Kunci yang bocor bisa dipakai orang lain atas tagihan kita.
Kalau terlanjur bocor: cabut kuncinya di dashboard penyedia, buat yang baru.

Peramban tidak pernah memegang kunci ini — halaman hanya memanggil `/api/ocr`
milik sendiri, dan server yang meneruskan ke penyedia AI.

---

## Biaya

Per September 2026, Gemini 2.5 Flash: **US$0,30 per 1 juta token masukan** dan
**US$2,50 per 1 juta token keluaran**, dengan kuota gratis harian untuk pemakaian
ringan.

Satu kwitansi ≈ 2.000 token masuk + 200 token keluar ≈ **US$0,0011**, atau
sekitar **Rp 20 per kwitansi** (kurs ±Rp 17.700).

| Kwitansi / bulan | Perkiraan biaya |
|---|---|
| 300 | ± Rp 6.000 |
| 1.000 | ± Rp 20.000 |
| 5.000 | ± Rp 100.000 |

`OCR_BATAS_HARIAN` adalah pagarnya: kalau dalam sehari sudah lewat batas itu,
pembacaan otomatis berhenti sendiri dan formulir kembali diisi manual. Pagar ini
hanya aktif kalau Redis (Upstash) terpasang.

---

## Yang harus tetap diperiksa petugas

AI membaca tulisan tangan dengan cukup baik, tapi **tidak pernah 100%**. Yang
paling sering meleset dan wajib dilihat ulang:

- **Nominal.** Angka tulisan tangan (1 vs 7, 3 vs 8) dan jumlah nol.
- **Nama muzakki.** Ejaan nama orang tidak bisa ditebak dari konteks.
- **Tanggal**, terutama yang ditulis `5/6/26`.

Kolom yang AI sendiri tidak yakin sudah ditandai kuning, tapi tanda itu bukan
jaminan — yang hijau pun tetap perlu dilirik. Nomor kwitansi sengaja **tidak**
diisi AI karena dibuat otomatis oleh sistem, begitu juga **Fundraising** yang
memang keputusan petugas.

---

## Kalau bermasalah

| Pesan di panel | Artinya |
|---|---|
| *Kunci AI ditolak penyedia* | `OCR_API_KEY` salah atau sudah dicabut. |
| *Model AI "…" tidak ditemukan* | `OCR_MODEL` salah tulis, atau modelnya sudah pensiun. |
| *Kuota AI penyedia sedang penuh* | Kuota gratis habis, atau terlalu cepat beruntun. Tunggu sebentar. |
| *Batas pembacaan hari ini sudah tercapai* | `OCR_BATAS_HARIAN` tercapai. Naikkan kalau memang perlu. |
| *Tulisan belum terbaca* | Fotonya kurang jelas. Coba foto ulang: cahaya cukup, kwitansi rata, penuhi bingkai. |

Tombol **Baca ulang** di panel mengulang pembacaan tanpa perlu foto ulang.

---

## Pengujian

```
node tools/test_ocr.js        # endpoint: izin, batas, pembersihan nilai, kebocoran kunci
node tools/test_ocr_ui.js     # alur auto-isi di peramban
node tools/test_scan_ui.js    # scan tanpa AI (fitur harus tetap jalan)
```

Ketiganya memakai AI tiruan — tidak ada permintaan keluar dan tidak memakai kuota.
