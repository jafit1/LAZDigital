# Hasil Impor Jurnal Januari–September 2026

Dijalankan lewat jalur asli aplikasi (`apiParseImportUrl` → `apiSaveImportedData`), urutan
**jurnal kas dulu, baru jurnal bank**, di atas basis data kosong dengan seluruh rekening
terdaftar. Angka di bawah ini adalah yang akan muncul di lazdigital.my.id setelah impor
yang sama dijalankan di sana.

Berkas sumber:

- `Jurnal Penerimaan jan sep 2026.xlsx` — sheet JAN, FEB, MAR, APR, MEI, JUN, JUL, AUG, SEP (9 sheet terbaca)
- `JURNAL BANK JAN SEP 2026.xlsx` — sheet 1–9 (9 sheet terbaca)

---

## 1. Yang masuk

| | Baris | Nilai |
|---|---:|---:|
| Penghimpunan kas | 1.761 | Rp 3.117.106.150 |
| Penghimpunan bank | 1.914 | Rp 4.391.043.377 |
| **Total penghimpunan** | **3.675** | **Rp 7.508.149.527** |
| Pentasyarufan (LPJ + penyaluran langsung + operasional + admin bank) | 3.173 | Rp 7.805.798.667 |
| Uang muka program (UMP) | 469 | Rp 3.913.465.584 |
| Transfer / setor / tarik tunai / mutasi | 265 | Rp 6.898.849.282 |

3 baris transfer dilewati karena identik dengan baris yang sudah ada (anti-dobel bekerja).

**Penghimpunan per dana:** Infak Rp 5.891.014.724 · Zakat Rp 1.206.958.994 · Amil Rp 410.175.809

**Pentasyarufan per sumber dana:** Infak Rp 6.673.413.119 · Amil Rp 705.825.846 · Zakat Rp 426.559.702

**Donatur terdaftar otomatis:** 1.021 nama (KLL/ULL dan nama anonim sudah dikecualikan).

---

## 2. Tujuh rekening bank yang belum terdaftar

Semuanya muncul di jurnal bank tapi belum ada di menu Rekening. Sebelum impor
sungguhan, daftarkan dulu — kalau tidak, transaksinya bisa nyasar ke rekening lain
yang namanya mirip.

| Nama di jurnal | Nomor | Dana |
|---|---|---|
| BCA Syariah Zakat | 0469900880 | Zakat |
| Bank Muammalat Infak | 5670010013 | Infak |
| Bank Muammalat Hidimu | 5670010526 | Infak |
| Bukopin Syariah | 7709009209 | Infak |
| BCA Syariah | 0469900898 | Infak |
| BCA Syariah Umum | 0469900898 | Infak |
| Kum3 Al Istiqomah Amil | 100100407 | Amil |

**Perhatian:** dua baris terakhir dari BCA Syariah memakai **nomor rekening yang sama
(0469900898)** dengan dua nama berbeda. Daftarkan **satu saja** — semua transaksinya
jatuh ke situ. Kalau didaftarkan dua-duanya, yang satu akan selamanya bersaldo nol.

---

## 3. Saldo awal 1 Januari 2026 — angka minimum tiap akun

Saldo awal belum diisi, jadi kas & bank keluar **minus Rp 871.627.262**. Itu wajar:
uang yang sudah ada di rekening per 1 Januari ikut dibelanjakan sepanjang Jan–Sep,
tetapi belum tercatat masuk.

Kolom **paling rendah** adalah titik terendah saldo berjalan sepanjang tahun. Saldo
awal yang benar **tidak boleh lebih kecil dari itu** — kalau lebih kecil, berarti ada
saat di mana rekening tercatat minus, yang tidak mungkin terjadi.

| Akun | Saldo 30 Sep | Titik terendah | Tanggal | Saldo awal minimal |
|---|---:|---:|---|---:|
| BSI Infak Terikat – 7591001188 | −1.015.627.382 | −1.520.124.143 | 07 Mei | ≥ 1.520.124.143 |
| BPD DIY Syariah – 803211000510 | −641.093.867 | −747.508.867 | 03 Sep | ≥ 747.508.867 |
| BDW Umum – 1240201273 | −148.895.417 | −600.000.000 | 12 Jan | ≥ 600.000.000 |
| BPD Infak Kemanusiaan – 803211000551 | −414.967.336 | −561.936.700 | 12 Jan | ≥ 561.936.700 |
| BPD DIY Syariah Amil – 803211000541 | 323.849.405 | −128.245.870 | 28 Feb | ≥ 128.245.870 |
| Kas Infak | −85.103.250 | −105.131.550 | 04 Sep | ≥ 105.131.550 |
| BPD DIY Syariah – 803211000511 | 343.078.535 | −86.403.595 | 03 Mar | ≥ 86.403.595 |
| BPD DIY Syariah – 803241001742 | −2.127.507 | −66.771.063 | 14 Mar | ≥ 66.771.063 |
| Muammalat Infak – 5670010013 | 428.715.633 | −38.891.500 | 24 Feb | ≥ 38.891.500 |
| BSI Infak Umum – 1011959004 | 61.882.651 | −27.222.049 | 13 Jul | ≥ 27.222.049 |
| Kas Amil | 6.549.900 | −24.515.300 | 06 Agu | ≥ 24.515.300 |
| BCA Syariah – 0469988000 | 17.146.512 | −21.954.731 | 02 Apr | ≥ 21.954.731 |
| Muammalat Hidimu – 5670010526 | −5.627.500 | −5.627.500 | 12 Mei | ≥ 5.627.500 |
| BCA Syariah – 0469900898 | −1.498.000 | −1.500.000 | 08 Apr | ≥ 1.500.000 |
| Kas Zakat | 32.436.600 | −839.400 | 12 Jan | ≥ 839.400 |
| Bukopin Syariah – 7709009209 | −19.890 | −19.890 | 15 Mar | ≥ 19.890 |
| BSI Zakat – 7591001177 | 50.895.569 | −19.735 | 03 Feb | ≥ 19.735 |
| Kum3 Al Istiqomah Amil – 100100407 | −12.500 | −12.500 | 19 Jun | ≥ 12.500 |
| BCA Konven – 7317989090 | 16.320.279 | 0 | — | — |
| BDW Kebencanaan – 1240201549 | 124.011.296 | 0 | — | — |
| Bank BDW – 1240201548 | 35.062.007 | 0 | — | — |
| BCA Syariah Zakat – 0469900880 | 3.397.000 | 0 | — | — |

**Jumlah saldo awal minimum: Rp 3.936.724.392.** Cocokkan angka riil dari rekening
koran / neraca 31 Desember 2025 dengan kolom terakhir — kalau ada akun yang angka
riilnya lebih kecil dari minimumnya, berarti ada transaksi 2026 yang belum masuk
jurnal atau salah rekening.

---

## 4. Delapan anomali tanggal

Baris-baris ini punya tanggal debet dan kredit yang berbeda. Aplikasi tetap
mengimpornya, tapi sebaiknya diperbaiki di berkas sumber lebih dulu — terutama empat
yang beda bulan.

**Jurnal kas**

| Tanggal debet | Tanggal kredit | Nilai | Keterangan |
|---|---|---:|---|
| 11 Jan | 12 Jan | 300.000 | Infak Kemanusiaan Sumatera Aceh — KLL Srandakan |
| 08 Mei | 12 Mei | 1.052.000 | Infak Terikat KLL Sewon Selatan |
| 12 Mei | 13 Mei | 249.500 | Infak Terikat TK ABA Seropan |
| 20 Mei | 26 Mei | 271.000 | Infak Umum KLL Dlingo |

**Jurnal bank** — tiga di antaranya beda bulan, satu beda tahun-bulan:

| Tanggal debet | Tanggal kredit | Nilai | Keterangan |
|---|---|---:|---|
| 29 Jan | **29 Nov** | 60.000 | Snack operasional kantor |
| 08 Apr | 09 Apr | 60.000.000 | Pentasyarufan pembangunan |
| 03 Agu | **03 Jul** | 10.000 | Biaya administrasi bank |
| 28 Sep | **28 Agu** | 149.000 | Konsumsi rapat badan pengurus |

---

## 5. Saldo KLL & ULL setelah impor

98 kantor terbaca. Hak amil masih memakai angka bawaan **12,5%** untuk Zakat, Infak,
Sedekah dan DSKL — ubah dulu di **Pengaturan → Hak Amil** kalau persentase yang
sebenarnya berbeda, karena seluruh kolom di bawah ini ikut berubah.

Total seluruh kantor:

| | |
|---|---:|
| Setoran | Rp 7.508.149.525 |
| Hak amil (12,5%) | Rp 887.246.959 |
| Saldo KLL | Rp 6.620.902.566 |
| UMP keluar | Rp 3.913.020.784 |
| UMP kembali | Rp 444.800 |
| LPJ | Rp 3.085.287.313 |
| **Sisa saldo KLL** | **Rp 2.708.326.582** |
| **Saldo belum LPJ** | **Rp 827.288.671** |

Sepuluh kantor dengan sisa saldo terbesar:

| Kantor | Setoran | Saldo KLL | Sisa saldo | Belum LPJ |
|---|---:|---:|---:|---:|
| Penghimpunan Daerah | 2.252.296.251 | 2.018.795.762 | 2.018.795.762 | 0 |
| KLL RS PKU Muh Bantul | 250.400.000 | 219.100.000 | 219.100.000 | 0 |
| KLL Banguntapan Utara | 337.357.456 | 295.187.769 | 125.262.769 | 76.154.345 |
| KLL Pajangan | 185.509.400 | 162.351.975 | 89.546.475 | 20.834.900 |
| KLL Pundong | 713.566.750 | 624.370.886 | 89.364.386 | 272.226.889 |
| KLL Kretek | 460.703.200 | 403.127.798 | 67.977.798 | 64.578.600 |
| KLL Sedayu | 129.990.200 | 113.741.425 | 58.424.425 | 23.265.000 |
| KLL SMK Muh Imogiri | 114.297.000 | 100.009.875 | 55.009.875 | 45.000.000 |
| ULL Masjid Aceh | 79.158.600 | 69.263.774 | 54.263.774 | 15.000.000 |
| KLL Sewon Utara | 166.378.900 | 145.581.537 | 50.365.537 | 76.716.500 |

---

## 6. Urutan untuk dijalankan di lazdigital.my.id

1. **Pengaturan → Rekening**: daftarkan 7 rekening di bagian 2 (BCA Syariah 0469900898 cukup satu).
2. **Pengaturan → Hak Amil**: isi persentase yang sebenarnya dan daftar setoran yang bebas hak amil.
3. **Pengaturan → Saldo Awal 2026**: isi saldo tiap rekening dan tiap kas per 1 Januari 2026, plus uang muka belum LPJ per dana. Pakai tabel bagian 3 sebagai pemeriksa.
4. **Impor jurnal kas** (`Jurnal Penerimaan jan sep 2026.xlsx`) — periksa pratinjau, lalu simpan.
5. **Impor jurnal bank** (`JURNAL BANK JAN SEP 2026.xlsx`) — periksa pratinjau, lalu simpan.
6. Buka menu **Saldo Kas & Bank** dan **Saldo KLL & ULL** untuk mencocokkan.

Kalau langkah 4 dan 5 dijalankan sebelum langkah 3, angkanya tetap benar — saldo awal
bisa diisi belakangan dan saldo langsung menyesuaikan.
