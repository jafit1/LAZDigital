# Gateway WhatsApp LAZDigital

Gateway ini menghubungkan WhatsApp Web mandiri ke `api/blast-agen` LAZDigital. Gateway menarik pekerjaan dari LAZDigital, sehingga tidak memerlukan webhook masuk dari internet.

## Menjalankan lokal di Windows

1. Salin `.env.example` menjadi `.env`, lalu isi `LAZ_API_URL`, `BLAST_AGEN_TOKEN`, dan `BLAST_PERANGKAT_ID`.
2. Klik dua kali `start.bat`, atau jalankan `npm install` lalu `npm start`.
3. QR pertama tersimpan sebagai `qr.png` di folder sesi. Pindai dari WhatsApp > Perangkat tertaut.

`start.bat` membuat folder sesi bila belum ada dan memasang dependensi bila `node_modules` belum tersedia. Instalasi pertama memerlukan Node.js dan Git for Windows. Jangan commit `.env`, `sessions/`, atau `qr.png`.

## Deploy ke Botkeep

Botkeep lebih cocok daripada Prisma Compute untuk gateway ini karena dokumentasinya menyediakan runtime aplikasi Node.js yang dirancang untuk operasi terus-menerus dan menyediakan persistent volume. Sesi WhatsApp tetap harus diarahkan ke volume persisten.

Botkeep menerima GitHub atau ZIP. Untuk pengujian pertama, gunakan ZIP agar `.env`, token, `sessions`, `node_modules`, dan `qr.png` tidak ikut terkirim.

### Membuat ZIP bersih di Windows

Jalankan PowerShell dari folder ini:

```powershell
$tujuan = Join-Path $env:TEMP 'wagateway-botkeep'
Remove-Item $tujuan -Recurse -Force -ErrorAction SilentlyContinue
New-Item $tujuan -ItemType Directory | Out-Null
Copy-Item package.json,package-lock.json,README.md,botkeep.env.example $tujuan
Copy-Item src $tujuan -Recurse
Compress-Archive -Path (Join-Path $tujuan '*') -DestinationPath (Join-Path (Get-Location) 'wagateway-botkeep.zip') -Force
```

Isi ZIP harus memiliki `package.json` di akar, bukan di dalam folder tambahan. Jangan masukkan `.env`, `sessions`, `node_modules`, atau `qr.png`.

### Pengaturan di Botkeep

Buat workload baru:

- Runtime: **Node.js**
- Sumber: unggah `wagateway-botkeep.zip`
- Start command: `npm start`
- Environment:
  - `LAZ_API_URL=https://lazdigital.my.id/api/blast-agen`
  - `BLAST_AGEN_TOKEN`, token yang sama dengan Vercel
  - `BLAST_AGEN_NAMA=gateway-botkeep`
  - `BLAST_PERANGKAT_ID`, ID perangkat Gateway sendiri dari LAZDigital
  - `BLAST_POLL_MS=3000`
  - `BLAST_SESI=/data/sessions`

Sediakan persistent volume yang dipasang pada:

```text
/data
```

Dengan begitu sesi WhatsApp tersimpan di `/data/sessions`. Jika panel Botkeep memakai lokasi volume yang berbeda, ubah `BLAST_SESI` mengikuti lokasi mount yang ditampilkan panel.

Alokasi gratis yang disebut dokumentasi adalah total 1 GB RAM, 1 vCore, dan 1 GB storage untuk maksimal dua workload. Untuk gateway Baileys, alokasikan resource yang cukup dan pantau Console setelah deploy.

### Setelah deploy

1. Periksa Console dan log runtime.
2. Tunggu sampai muncul QR.
3. Buka tampilan perangkat di LAZDigital untuk memindai QR, atau ambil `qr.png` dari volume jika panel menyediakan Files.
4. Setelah WhatsApp tersambung, jangan jalankan gateway lokal bersamaan menggunakan sesi yang sama.
5. Uji kirim satu pesan percobaan dan periksa statusnya di LAZDigital.

Botkeep menyatakan workload dapat berjalan terus-menerus, tetapi tidak menjanjikan SLA 100 persen. Simpan salinan kode dan sesi secara aman di luar Botkeep. Jangan menaruh token atau kredensial di ZIP, GitHub, log, atau pesan dukungan.

## Kontrak yang dipakai

Gateway menjalankan tindakan `halo`, `lapor-perangkat`, `ambil`, `berkas`, `lapor`, `lapor-status`, dan `masuk` pada endpoint `api/blast-agen`. Status pesan baru menjadi terkirim setelah `sendMessage` berhasil mengembalikan id WhatsApp.
