# Menguji sebelum deploy

Tujuannya satu: menemukan kesalahan di laptop, bukan di lazdigital.my.id yang
sedang dipakai amil. Ada tiga lapis, dari yang paling murah ke yang paling
mendekati keadaan sungguhan. Kerjakan berurutan — kalau lapis 1 gagal, tidak
ada gunanya lanjut ke lapis 2.

---

## Lapis 1 — Uji otomatis (2 menit)

Klik dua kali **`uji-sebelum-deploy.bat`**.

Isinya:

| Uji | Yang dipastikan |
|---|---|
| `tools/test_agen.js` | Pesan tidak diaku terkirim sebelum WhatsApp menerimanya; satu pesan tidak keluar dua kali; pekerjaan tidak hilang kalau gateway mati di tengah jalan; token agen benar-benar mengunci |
| `tools/test_blast_ui.js` | Halaman Broadcast memakai `styles.css` yang sama dengan halaman utama; tidak ada sisa Tailwind; dropdown memakai penyelaras yang sama; tema gelap ikut berpindah; tidak melebar di layar HP |

Uji tampilan butuh Playwright. Kalau belum ada, ia akan **dilewati** (bukan
dianggap gagal). Untuk mengaktifkannya, sekali saja:

```
npm i -D playwright
npx playwright install chromium
```

Data yang dipakai semuanya palsu dan disimpan di `.data/`. Data sungguhan di
Upstash tidak tersentuh.

**Kalau ada yang GAGAL: jangan deploy.** Gulir ke atas, cari baris berawalan
`GAGAL|` — namanya menjelaskan apa yang rusak.

---

## Lapis 2 — Mencoba sendiri di laptop (15 menit)

Uji otomatis memeriksa aturan, bukan rasa. Yang ini memeriksa rasa.

### 2.1 Nyalakan LAZDigital lokal

Klik dua kali **`start-lokal.bat`**, lalu buka `http://localhost:3000`.

Di layar akan tercetak daftar alamat yang terpasang. Pastikan ada
`/api/blast`, `/api/blast-agen`, dan `/api/cron/blast-antrean` — kalau salah
satu tidak muncul, berkasnya belum ada di folder `api/`.

Perhatikan juga baris terakhir:

- *"Tanpa UPSTASH\_\*: data Broadcast disimpan di .data/blast.json"* → aman, ini
  yang diinginkan.
- *"PERHATIAN: UPSTASH\_\* terisi"* → `.env.local` Anda menunjuk ke basis data
  sungguhan. Kosongkan dulu dua baris `UPSTASH_*` di `.env.local` sebelum
  mencoba-coba, kalau tidak percobaan ini akan mengaduk data asli.

### 2.2 Periksa halaman Broadcast

Buka `http://localhost:3000/blast.html`, lalu lihat:

- [ ] Menu kiri, warna, dan huruf **sama** dengan halaman utama — buka
      keduanya berdampingan, bukan bergantian. Beda kecil paling kelihatan
      kalau ditaruh bersebelahan.
- [ ] Klik tombol ganti tema. Gelapnya ikut, dan kalau Anda pindah ke halaman
      utama temanya tetap gelap.
- [ ] Buka satu dropdown (mis. Kiriman Massal → Perangkat pengirim). Bentuknya
      harus sama dengan dropdown di Penghimpunan, bukan dropdown bawaan
      browser.
- [ ] Ciutkan menu lewat tombol logo. Label tombol di bawah ikut menghilang.
- [ ] Kecilkan jendela sampai selebar HP. Tidak ada yang melebar ke samping.
- [ ] Buka kesebelas menunya satu per satu. Tidak ada yang kosong atau
      menampilkan kotak merah.

### 2.3 Sambungkan gateway ke laptop, bukan ke server

Ini bagian terpenting, dan bisa dicoba tanpa menyentuh Vercel sama sekali.

1. Buka `wagateway\laz.json`, ubah `"url"` jadi `http://localhost:3000`, dan
   isi `"token"` dengan teks bebas — misalnya `uji-lokal`.
2. Jalankan LAZDigital lokal dengan token yang sama:
   ```
   set BLAST_AGEN_TOKEN=uji-lokal
   node server.js
   ```
3. Jalankan `wagateway\start.bat`. Di jendelanya harus muncul
   `[agen] tersambung ke http://localhost:3000`.
4. Di LAZDigital → Broadcast → Perangkat, tambah satu perangkat dengan
   pengirim **Gateway sendiri**, lalu klik **Sambungkan**. QR harus muncul
   **di layar LAZDigital** (dikirim balik oleh gateway), bukan cuma di jendela
   gateway.
5. Pindai QR dengan WhatsApp di nomor uji — jangan nomor pribadi.
6. Kirim satu pesan ke nomor Anda sendiri lewat **Kirim Pesan**.

Yang harus terlihat:

- [ ] Status pesan bergerak `antre` → `diserahkan` → `terkirim`. Kalau berhenti
      di `diserahkan`, artinya gateway menarik tapi tidak melapor balik —
      periksa jendela gateway.
- [ ] Pesannya benar-benar sampai di WhatsApp.
- [ ] Matikan gateway, lalu kirim lagi. Pesan harus **tetap di antrean**, bukan
      dinyatakan gagal atau terkirim. Nyalakan gateway lagi — pesannya
      berangkat sendiri.
- [ ] Balas pesan itu dari HP. Balasannya muncul di Pesan & Antrean.

Setelah selesai, kembalikan `"url"` di `laz.json` ke
`https://lazdigital.my.id` dan tokennya ke token asli.

---

## Lapis 3 — Yang memang tidak bisa diuji lokal

Tiga hal ini baru terbukti setelah deploy, jadi urutannya yang dijaga:

1. **Variabel lingkungan Vercel.** Tidak ada cara memeriksanya dari laptop.
   Setelah deploy, buka Broadcast → Dasbor, lihat panel *"Sebelum dipakai
   sungguhan"*. Yang masih merah berarti belum terisi.
2. **Upstash Redis sungguhan.** Lokal memakai berkas, produksi memakai Redis.
   Perilakunya sama, tapi kecepatannya tidak.
3. **WhatsApp sungguhan dari jaringan kantor.** Egress kantor bisa berbeda.

### Cara deploy yang aman

1. Isi variabel di Vercel, tapi **biarkan `PENGIRIM=sandbox`** dulu.
2. `deploy.bat`.
3. Buka lazdigital.my.id → Broadcast. Periksa panel kesiapan, klik-klik semua
   menunya. Lencana kuning *"Mode sandbox"* harus terlihat — artinya tidak ada
   satu pun pesan yang benar-benar keluar.
4. Kalau semua rapi: Broadcast → Pengaturan → ganti pengirim jadi **Gateway
   sendiri**.
5. Kirim ke **nomor Anda sendiri** lebih dulu. Baru setelah itu ke satu-dua
   donatur. Baru setelah itu satu segmen kecil.

Jangan langsung menjalankan kampanye ke seluruh daftar donatur di hari
pertama. Nomor baru yang tiba-tiba mengirim ratusan pesan adalah pola yang
paling cepat diblokir WhatsApp, dan nomor yang sudah diblokir tidak bisa
diminta kembali.

---

## Kalau perlu mengulang setelah berubah

Setiap kali ada perubahan di `lib/blast/`, `api/blast*`, atau
`src/public/blast*`, jalankan lagi **Lapis 1**. Butuh dua menit, dan itulah
yang membedakan "sudah saya cek" dengan "sudah saya jalankan".
