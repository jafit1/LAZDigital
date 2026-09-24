# Pustaka pihak ketiga yang di-host sendiri

Berkas di folder ini **bukan tulisan kami**. Semuanya salinan build resmi dari
npm, ditaruh di repo ini dan dilayani dari server sendiri.

| Berkas | Asal (npm) | Versi | Dipakai untuk |
|---|---|---|---|
| `pdf.min.js` + `pdf.worker.min.js` | `pdfjs-dist` (Mozilla, Apache-2.0) | 3.11.174 | membaca teks dari PDF yang dilampirkan ke AI Asisten |
| `mammoth.browser.min.js` | `mammoth` (BSD-2-Clause) | 1.8.0 | membaca teks dari berkas Word (.docx) |
| `xlsx.full.min.js` | `xlsx` / SheetJS (Apache-2.0) | ikut versi di `package.json` | membaca isi Excel (.xlsx, .xls) dan CSV |

## Kenapa di-host sendiri, bukan dari CDN

1. **Halaman AI Asisten dibuka seluruh tim.** Skrip dari CDN berarti pihak
   ketiga bisa mengganti isinya kapan saja, dan yang berjalan di browser
   petugas adalah apa pun yang dikirim CDN hari itu. Dari repo sendiri, yang
   berjalan hanya yang ada di sini dan ikut tercatat di Git.
2. **Kantor kadang jaringannya buruk atau memblokir CDN.** Berkas yang
   dilayani dari domain sendiri ikut hidup selama situsnya hidup.
3. Tidak perlu memikirkan hash SRI yang harus diperbarui tiap ganti versi.

## Kenapa tidak dipasang lewat npm saja

Vercel menjalankan `npm ci --omit=dev`, dan hasilnya ada di folder server —
bukan di `src/public/` yang dilayani ke browser. Supaya browser bisa
mengunduhnya, berkasnya memang harus ada di sini.

## Beratnya

Total sekitar 2,9 MB. **Tidak satu pun diunduh saat halaman dibuka** —
`src/public/ai.js` baru memuatnya ketika ada yang benar-benar melampirkan PDF,
Word, atau Excel, dan hanya yang diperlukan saja. Orang yang cuma mengetik
pertanyaan tidak pernah mengunduhnya.

## Cara memperbarui

```
npm i pdfjs-dist@<versi> mammoth@<versi>
```
lalu salin `node_modules/pdfjs-dist/build/pdf.min.js`,
`node_modules/pdfjs-dist/build/pdf.worker.min.js`, dan
`node_modules/mammoth/mammoth.browser.min.js` ke folder ini. Untuk SheetJS,
salin `node_modules/xlsx/dist/xlsx.full.min.js`.

**Versi pdf.js dan pdf.worker.js HARUS sama.** Kalau berbeda, pdf.js menolak
bekerja dengan pesan "API version does not match Worker version", dan gejalanya
di layar cuma "gagal membaca PDF" tanpa sebab yang jelas.
