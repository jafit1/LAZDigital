# Panduan Fitur Broadcast WhatsApp — LAZDigital

Fitur broadcast WA sudah tergabung ke aplikasi. Login ikut LAZDigital (tidak ada
login terpisah), tapi data broadcast (kontak, kampanye, log) **terpisah** dari
database utama website — disimpan di key `wab:*` (Redis) atau file `data/wab-local.json`.

Menu **"Broadcast WA"** muncul di sidebar untuk user yang punya izin modul `broadcast`.

---

## 1. Variabel lingkungan (Environment Variables di Vercel)

Buka **Vercel → Project LAZDigital → Settings → Environment Variables**, tambahkan:

### Wajib (pengirim Fonnte)
| Variabel | Isi | Cara dapat |
|---|---|---|
| `PENGIRIM` | `fonnte` | (tetap `fonnte`) |
| `FONNTE_TOKEN` | token device Fonnte | Dashboard Fonnte → Device → **Token** |

### Opsional (pengirim)
| Variabel | Default | Keterangan |
|---|---|---|
| `FONNTE_BASE_URL` | `https://api.fonnte.com` | biarkan kosong kecuali Fonnte ganti alamat |
| `FONNTE_COUNTRY_CODE` | `62` | kode negara untuk normalisasi nomor `08xx` → `628xx` |
| `FONNTE_TYPING` | `false` | `true` untuk efek "sedang mengetik" (lebih natural, lebih lambat) |
| `FONNTE_WEBHOOK_SECRET` | *(kosong)* | kunci rahasia webhook — **isi** dengan teks acak, lihat bagian 3 |

### Anti-spam (bisa juga diatur dari dashboard tab "Setelan", tanpa redeploy)
| Variabel | Default | Keterangan |
|---|---|---|
| `WA_JEDA_MIN_DETIK` | `8` | jeda acak minimum antar pesan (detik) |
| `WA_JEDA_MAX_DETIK` | `25` | jeda acak maksimum antar pesan (detik) |
| `WA_JAM_KIRIM_AKTIF` | `false` | `true` = hanya kirim di jam tertentu |
| `WA_JAM_MULAI` | `08:00` | jam mulai kirim (WIB) |
| `WA_JAM_SELESAI` | `20:00` | jam selesai kirim (WIB) |
| `WA_BATAS_HARIAN` | `0` | batas pesan per hari (`0` = tanpa batas) |

### Sistem dispatch
| Variabel | Default | Keterangan |
|---|---|---|
| `CRON_SECRET` | *(kosong)* | rahasia untuk cron Vercel — **isi** dengan teks acak |
| `WA_MAX_RANTAI` | `20` | maksimal sambungan proses berantai per pemicu |
| `WA_DISPATCH_BUDGET_SECONDS` | `25` | batas waktu satu putaran dispatch (di bawah maxDuration 30/60) |

### (Opsional) kalau mau pakai WhatsApp Cloud API resmi Meta nanti
Ganti `PENGIRIM=meta` lalu isi `META_TOKEN`, `META_PHONE_NUMBER_ID`,
`META_WABA_ID`, `META_VERIFY_TOKEN`, `META_APP_SECRET`. Selama pakai Fonnte,
abaikan grup ini.

> **Redis:** fitur ini memakai `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
> yang **sudah** ada di project. Kalau belum ada, broadcast otomatis jatuh ke
> penyimpanan file lokal (`data/wab-local.json`) — jalan untuk uji, tapi di Vercel
> disarankan tetap pakai Redis karena filesystem serverless tidak permanen.

---

## 2. Beri izin user

Login sebagai superadmin → menu **Manajemen User** → pilih user → centang modul
**Broadcast WhatsApp** (view/create/edit/delete sesuai kebutuhan). Superadmin
otomatis punya akses penuh.

---

## 3. Pasang webhook Fonnte (status terkirim/dibaca & balasan STOP)

1. Tentukan kunci rahasia, mis. `k7fJ2m9Qx`. Isikan ke env `FONNTE_WEBHOOK_SECRET`.
2. URL webhook Anda:
   `https://lazdigital.my.id/api/wa-webhook?kunci=k7fJ2m9Qx`
3. Di dashboard Fonnte → **Device → Webhook**, tempel URL itu pada:
   - **Update Message Status** (agar status ✓✓/dibaca masuk)
   - **Reply Message** (agar balasan **STOP** otomatis masuk daftar Tolak Kirim)

Webhook tidak menyentuh database website sama sekali.

---

## 4. Deploy

```
git add .
git commit -m "Tambah fitur broadcast WhatsApp (Fonnte)"
git push
```

Vercel akan build otomatis. Setelah live, buka aplikasi → menu **Broadcast WA**.

---

## 5. Cara pakai singkat

- **Broadcast Baru:** tulis pesan (pakai `{nama}`, `{nominal}`, dsb.), tempel/unggah
  daftar kontak (CSV: kolom `telepon` wajib, sisanya jadi placeholder), **Periksa &
  kirim**.
- **Riwayat:** pantau progres (antre/terkirim/dibaca/gagal), jeda/lanjut/batalkan.
- **Tolak Kirim:** nomor yang membalas STOP otomatis masuk sini dan dilewati.
- **Setelan:** atur jeda acak, jam kirim, dan batas harian tanpa redeploy.

## Catatan cron Vercel
Pengiriman berjalan langsung saat kampanye dibuat (proses berantai antar fungsi).
Cron `/api/wa-dispatch` (di `vercel.json`) hanya "penyapu" cadangan sekali sehari
untuk antrean yang mungkin tertunda. Paket **Hobby** membatasi cron 1×/hari — sudah
sesuai. Kalau nanti pindah ke paket Pro dan ingin sapuan lebih sering, ubah
`schedule` di `vercel.json`.
