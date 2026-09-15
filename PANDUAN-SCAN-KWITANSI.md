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
| `OCR_MODEL` | rantai model dipisah koma — lihat bagian di bawah | tidak |
| `OCR_BATAS_HARIAN` | mis. `300` | tidak (bawaan 300) |

### 3. Deploy

Jalankan `deploy.bat`. Environment variable baru hanya terbaca oleh deployment
baru — mengisinya saja tidak cukup.

### 4. Cek

Buka Penghimpunan → Scan Kwitansi → foto apa saja. Kalau muncul baris hijau
*"… isian terbaca — mohon periksa"*, fitur sudah hidup.

---

## Rantai model & pergantian otomatis

`OCR_MODEL` berisi **daftar model dipisah koma**, dicoba berurutan dari kiri.
Bawaannya:

```
gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.5-pro
```

Urutannya sengaja dari yang paling murah dan kuotanya paling longgar ke yang
paling pintar. Kalau model pertama menjawab:

| Jawaban penyedia | Yang dilakukan sistem | Lama istirahat |
|---|---|---|
| **429** kuota harian habis | pindah ke model berikutnya | sampai tengah malam waktu Pasifik |
| **429** terlalu cepat (per menit) | pindah ke model berikutnya | 90 detik |
| **503 / 500** model sibuk | pindah ke model berikutnya | 2 menit |
| **404** model tak dikenal kunci ini | pindah ke model berikutnya | 6 jam |
| **401 / 403** kunci ditolak | **berhenti** — ganti model tidak menolong | — |

Model yang sedang istirahat **tidak dicoba lagi** sampai waktunya habis, jadi
setelah kuota flash habis, permintaan berikutnya langsung ke model cadangan
tanpa membuang satu panggilan. Kalau Redis terpasang, ingatan ini dibagi ke
seluruh instance Vercel; kalau tidak, hanya berlaku per instance.

Saat model cadangan yang dipakai, baris status di panel menyebutkannya —
misalnya *"9 isian terbaca — mohon periksa sebelum disimpan. Dibaca model
cadangan gemini-2.5-flash-lite."*

Kalau **semua** model habis, fitur tidak error keras: baris status menjelaskan
kuota habis dan kapan pulih, foto tetap ditampilkan, formulir tetap bisa diisi
manual.

### Melihat model apa saja yang didukung kunci Anda

Model yang tersedia berbeda-beda per kunci dan per project. Untuk melihat
daftar sebenarnya, jalankan dari Console peramban (F12) saat sudah login:

```js
fetch('/api/ocr',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({aksi:'model-list',token:TOKEN})}).then(r=>r.json()).then(console.log)
```

Hasilnya menyebut `tersedia` (semua model yang bisa dipakai kunci itu),
`rantaiSah` (model di `OCR_MODEL` yang memang ada), dan `rantaiTidakDikenal`
(yang salah tulis atau tidak didukung). Model yang tidak dikenal tidak
merusak apa-apa — ia dilewati otomatis — tapi lebih baik dibuang dari daftar.

### Catatan biaya

Selama masih di **free tier**, semua model gratis sampai batas hariannya, jadi
rantai panjang justru menguntungkan. Begitu pindah ke **paid tier**, urutan ini
penting: `gemini-2.5-pro` jauh lebih mahal daripada `flash`. Kalau sudah
berbayar dan ingin biaya tetap rata, cukup isi `OCR_MODEL=gemini-2.5-flash`
saja.

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
| *Kunci AI ditolak penyedia* | `OCR_API_KEY` salah atau sudah dicabut. Ganti model tidak menolong. |
| *Kuota semua model AI sedang habis* | Seluruh rantai kehabisan kuota gratis. Pulih tengah malam waktu Pasifik (± 14.00–15.00 WIB). Tambah model ke `OCR_MODEL`, atau isi manual dulu. |
| *Tidak ada model AI yang bisa dipakai: … (tidak tersedia untuk kunci ini)* | Semua model di `OCR_MODEL` salah tulis atau tidak didukung kunci itu. Jalankan `model-list` di atas. |
| *Batas pembacaan hari ini sudah tercapai* | `OCR_BATAS_HARIAN` tercapai. Naikkan kalau memang perlu. |
| *Tulisan belum terbaca* | Fotonya kurang jelas. Coba foto ulang: cahaya cukup, kwitansi rata, penuhi bingkai. |
| *Dibaca model cadangan …* | Bukan masalah — model utama sedang istirahat, pembacaan tetap jalan. |

Tombol **Baca ulang** di panel mengulang pembacaan tanpa perlu foto ulang.

---

## Pengujian

```
node tools/test_ocr.js        # endpoint: izin, batas, pembersihan nilai, kebocoran kunci
node tools/test_ocr_ui.js     # alur auto-isi di peramban
node tools/test_scan_ui.js    # scan tanpa AI (fitur harus tetap jalan)
```

Ketiganya memakai AI tiruan — tidak ada permintaan keluar dan tidak memakai kuota.
