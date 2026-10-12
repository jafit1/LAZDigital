# Memori Proyek — Gateway WhatsApp LAZDigital

Dokumen ini dibuat agar model/agen lain dapat memahami konteks proyek tanpa meminta pengguna mengulang semuanya.

**Terakhir diperbarui:** 2026-10-09
**Folder proyek:** `D:\LAZDigital\wagateway`
**Bahasa komunikasi pengguna:** Bahasa Indonesia

## Tujuan utama

Menjalankan gateway WhatsApp mandiri berbasis Baileys yang menghubungkan WhatsApp Web ke API LAZDigital pada:

```text
https://lazdigital.my.id/api/blast-agen
```

Gateway menarik pekerjaan dari API, mengirim pesan melalui WhatsApp, lalu mengirim status kembali ke LAZDigital. Gateway bukan aplikasi balasan otomatis dan tidak menerima webhook publik untuk pesan masuk.

Kebutuhan penting:

- Sesi WhatsApp harus persisten sampai pengguna memutuskan sesi.
- Gateway tidak boleh mengaku pesan terkirim sebelum `sendMessage` Baileys berhasil mengembalikan ID pesan.
- Grup diabaikan.
- Token dan sesi WhatsApp tidak boleh dimasukkan ke ZIP, GitHub, dokumentasi publik, log, atau chat.

## Status saat ini

- Gateway lokal berada di `D:\LAZDigital\wagateway`.
- Dependensi lokal sudah terpasang dan berhasil diperiksa:
  - `@whiskeysockets/baileys`
  - `pino`
  - `qrcode`
- Node.js lokal: v24.20.0.
- `node --check src/agen.js` berhasil.
- Perangkat Gateway sudah tersimpan di `sessions\perangkat.json`.
- `.env` lokal sudah tersedia dan berisi konfigurasi asli. Jangan menyalin isi token ke dokumen ini.
- Uji menjalankan gateway berhasil mencapai:

```text
Health server aktif di 0.0.0.0:3333
QR tersedia di sessions\qr.png
```

Jika QR belum dipindai, file QR berada di:

```text
D:\LAZDigital\wagateway\sessions\qr.png
```

## Cara menjalankan lokal

Cara yang benar di Windows:

1. Buka atau klik dua kali:

```text
D:\LAZDigital\wagateway\start.bat
```

2. Biarkan jendela CMD tetap terbuka.
3. Jika QR muncul, pindai melalui WhatsApp > Perangkat tertaut.

Perintah manual yang juga benar:

```bat
cd /d D:\LAZDigital\wagateway
node --env-file=.env src/agen.js
```

Jangan memakai `node src/agen.js` secara langsung karena Node tidak otomatis membaca `.env`.

`start.bat` saat ini:

- memastikan `.env` ada;
- membuat folder `sessions`;
- menjalankan `npm ci --ignore-scripts` jika `node_modules` belum ada;
- menjalankan `node --env-file=.env src/agen.js`.

## File penting

- `src/agen.js` — implementasi gateway Baileys.
- `start.bat` — launcher lokal Windows.
- `.env` — konfigurasi lokal dan token asli; rahasia, jangan dibaca lalu ditulis ulang ke dokumentasi.
- `.env.example` — template konfigurasi tanpa rahasia.
- `sessions/whatsapp` — kredensial sesi WhatsApp; sangat sensitif, jangan dibagikan.
- `sessions/perangkat.json` — ID perangkat LAZDigital yang dipilih.
- `sessions/qr.png` — QR login sementara; jangan dibagikan.
- `README.md` — panduan operasional.
- `package.json` dan `package-lock.json` — dependensi dan script.
- `PROJECT_MEMORY.md` — dokumen konteks ini.

## Konfigurasi environment

Variabel yang dipakai:

```env
LAZ_API_URL=https://lazdigital.my.id/api/blast-agen
BLAST_AGEN_TOKEN=<token asli, jangan ditulis di dokumen>
BLAST_AGEN_NAMA=<nama agen>
BLAST_PERANGKAT_ID=<ID perangkat Gateway sendiri>
BLAST_POLL_MS=3000
SERVER_PORT=3333
BLAST_SESI=./sessions
```

Untuk Botkeep, environment diberikan melalui panel, bukan `.env` di ZIP. Gunakan `BLAST_SESI=/data/sessions` jika volume persisten dipasang pada `/data`.

## Kontrak API gateway

Tindakan yang dipakai pada `/api/blast-agen`:

- `halo`
- `lapor-perangkat`
- `ambil`
- `berkas`
- `lapor`
- `lapor-status`
- `masuk`

Header autentikasi yang digunakan gateway adalah `X-Agen-Token`. Jangan menulis nilai tokennya di file memori.

## Riwayat deployment Botkeep

Botkeep dicoba sebagai alternatif hosting. Dua workload/server sempat dibuat:

- `WA-Broadcast`
- `wa-blast`

Keduanya mengalami status `Starting` terus-menerus. Panel menampilkan:

```text
Another operation is already in progress for this server.
```

Server tidak dapat dihentikan, dihapus, atau diubah dari panel. Ini tampak sebagai operasi backend Botkeep yang macet, bukan masalah yang dapat diperbaiki dari kode lokal. Jangan membuat workload tambahan sebelum operasi tersebut dibersihkan. Hubungi dukungan Botkeep/Discord dan minta pending operation serta server lock dibersihkan.

Jangan mengirim token, `.env`, folder `sessions`, atau QR kepada dukungan.

## ZIP Botkeep

Beberapa ZIP pernah dibuat di folder proyek, termasuk:

- `wagateway-botkeep.zip`
- `wagateway-botkeep-clean.zip`
- `wagateway-botkeep-final.zip`
- `wagateway-botkeep-fix.zip`
- `wagateway-botkeep-final2.zip`

ZIP bersih hanya boleh berisi source, `package.json`, `package-lock.json`, README, dan contoh environment. Jangan memasukkan `.env`, `sessions`, `node_modules`, `qr.png`, atau token.

Struktur ZIP yang benar:

```text
package.json
package-lock.json
README.md
botkeep.env.example
src/agen.js
```

Botkeep memakai `npm start`, yang berjalan sebagai `node src/agen.js`. Di Botkeep, environment disuntikkan oleh platform sehingga tidak membutuhkan `--env-file`. Untuk lokal, tetap gunakan `start.bat` atau `node --env-file=.env src/agen.js`.

## Hal yang harus dihindari

- Jangan menghapus `sessions` sebelum pengguna memang ingin memutuskan/mereset WhatsApp.
- Jangan menjalankan gateway lokal dan Botkeep bersamaan menggunakan sesi WhatsApp yang sama.
- Jangan mengubah token hanya karena gateway gagal sebelum membaca log.
- Jangan meminta pengguna mengirim token atau isi `.env` ke chat.
- Jangan menganggap status `Starting` Botkeep dapat diperbaiki dengan membuat server baru; server sebelumnya sudah macet dan pengguna diminta menghubungi dukungan.

## Langkah lanjutan yang aman

1. Pastikan gateway lokal dapat berjalan dengan `start.bat`.
2. Pindai QR dari `sessions\qr.png` jika belum tersambung.
3. Uji satu pesan dari LAZDigital dan periksa statusnya.
4. Jika ingin melanjutkan Botkeep, tunggu dukungan membersihkan lock terlebih dahulu.
5. Untuk hosting yang andal, pertimbangkan VPS dengan proses persisten (`systemd` atau PM2) dan volume/disk persisten.

## Menjalankan otomatis di Windows

Gateway dapat berjalan otomatis setiap laptop dinyalakan lewat Task Scheduler.
Task yang dipakai bernama `LAZDigital-WA-Gateway`.

Berkas pendukung:

- `autostart-install.bat` / `.ps1` — memasang task.
- `autostart-uninstall.bat` / `.ps1` — mencabut task.
- `autostart-status.bat` / `.ps1` — memeriksa status task, proses, dan log.
- `run-gateway.cmd` — penjalan gateway, output masuk ke `logs\gateway.log`.
- `start-hidden.vbs` — menjalankan tanpa jendela CMD.
- `gateway-cek.ps1` — mendeteksi proses gateway agar tidak ada dua instance.

Catatan:

- Task memicu `AtLogOn`, jadi berjalan setelah user login, bukan tepat saat mesin dinyalakan.
- Task sudah restart otomatis 5 kali bila gateway berhenti.
- Jalur "sudah berjalan" tidak boleh menulis ke `logs\gateway.log` karena file itu sedang dikunci proses yang berjalan.
- Satu sesi WhatsApp hanya boleh dipakai satu gateway; jangan jalankan `start.bat` manual bersamaan dengan task.

## Port health check

Gateway membuka `/health` pada `0.0.0.0:3333`. Port ini diatur lewat `SERVER_PORT` di `.env`.
Nilainya bukan endpoint webhook, hanya penanda proses aktif.
