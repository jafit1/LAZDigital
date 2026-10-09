# Dokumen Desain

## Gambaran Umum

Fitur ini menambahkan folder Google Drive khusus untuk lampiran Modul_Surat, terpisah dari folder cadangan basis data yang sudah dipakai api/backup.js. Perubahan dibatasi ke tiga berkas kode yang sudah ada (api/_drive.js, lib/surat/surat.js, lib/surat/api.js), satu berkas konfigurasi (.env.example), satu dokumen panduan baru, dan uji otomatis. Tidak ada berkas rute Vercel baru yang dibuat, sesuai batas 10-12 Serverless Function paket Hobby.

Prinsip desain utama: **logika pemilihan folder (Folder_Surat atau Folder_Cadangan sebagai jalan cadangan) hanya hidup di satu tempat, yaitu api/_drive.js.** lib/surat/surat.js tidak menduplikasi logika fallback itu; ia memanggil fungsi pembantu yang diexport _drive.js untuk tahu folder mana yang harus dipakai. Ini sesuai Opsi A pada instruksi (parameter folder eksplisit yang dihitung lewat helper yang diexport _drive.js), karena lebih sederhana dan eksplisit dibanding Opsi B (context flag yang membuat _drive.js harus tahu "siapa pemanggilnya").

## Arsitektur

```
                     ┌─────────────────────────┐
                     │   lib/surat/api.js       │
                     │  (drive: !!driveSiapSurat()) │
                     └───────────┬─────────────┘
                                 │ drive (modul _drive.js diteruskan)
                                 ▼
                     ┌─────────────────────────┐
                     │   lib/surat/surat.js     │
                     │ tambahLampiran           │──┐
                     │ ambilLampiran             │  │ drive.driveSiapSurat()
                     │ hapusLampiran             │  │ drive.folderSurat()
                     │ hapus                     │  │ drive.unggahBiner(nama, buf, mime, folder)
                     └───────────┬───────────────┘  │ drive.unduh(id) / drive.hapus(id)
                                 │                   │
                                 ▼                   ▼
                     ┌─────────────────────────────────────┐
                     │          api/_drive.js               │
                     │  ENV() + folder: GDRIVE_FOLDER_ID    │
                     │        + folderSurat: GDRIVE_FOLDER_SURAT_ID │
                     │  driveSiap()        (TIDAK diubah)   │
                     │  driveSiapSurat()   (baru)           │
                     │  folderSurat()      (baru, helper)   │
                     │  unggahBiner(nama, buf, mime, folder?)│
                     │  unggah/daftar/hapus/pangkas (TIDAK diubah)│
                     └───────────┬───────────────────────────┘
                                 │
                                 ▼
                          Google Drive API
                     (Folder_Surat atau Folder_Cadangan)

                     ┌─────────────────────────┐
                     │     api/backup.js        │
                     │ drive.driveSiap()         │ (tetap, tidak diubah)
                     │ drive.unggah/daftar/hapus/pangkas() │ (tanpa parameter folder, tetap ke Folder_Cadangan)
                     └─────────────────────────┘
```

## Komponen dan Interface

### 1. api/_drive.js (CRLF dipertahankan: berkas ini memakai akhiran baris CRLF, semua suntingan harus menjaga itu)

**ENV()**: tambah field baru, tanpa mengubah field yang sudah ada:

```javascript
const ENV = () => ({
  id: process.env.GDRIVE_CLIENT_ID,
  secret: process.env.GDRIVE_CLIENT_SECRET,
  refresh: process.env.GDRIVE_REFRESH_TOKEN,
  folder: process.env.GDRIVE_FOLDER_ID,
  folderSurat: process.env.GDRIVE_FOLDER_SURAT_ID
});
```

**driveSiap()**: signature dan isi SAMA PERSIS seperti sekarang. Tidak disentuh.

```javascript
function driveSiap(){ const e = ENV(); return !!(e.id && e.secret && e.refresh && e.folder); }
```

**driveSiapSurat()**: fungsi baru, memeriksa Kredensial_Dasar DAN (Folder_Surat ATAU Folder_Cadangan):

```javascript
function driveSiapSurat(){
  const e = ENV();
  return !!(e.id && e.secret && e.refresh && (e.folderSurat || e.folder));
}
```

**folderSurat()**: helper baru yang diexport, dipakai lib/surat/surat.js untuk menghitung folder tujuan tanpa menduplikasi logika fallback:

```javascript
/* Folder tujuan lampiran surat: Folder_Surat kalau terisi, jalan cadangan ke
   Folder_Cadangan kalau kosong. Pemanggil (lib/surat/surat.js) tidak perlu
   tahu nama variabel lingkungan ini, ia cukup minta folder tujuan. */
function folderSurat(){ const e = ENV(); return e.folderSurat || e.folder; }
```

**unggahBiner(nama, buf, mime, folder)**: tambah parameter keempat opsional di akhir, supaya pemanggilan lama (kalau ada, saat ini tidak dipanggil di luar lib/surat/surat.js) tidak berubah:

```javascript
async function unggahBiner(nama, buf, mime, folder){
  const e = ENV();
  const tujuan = folder || e.folder;
  const token = await tokenAkses();
  const batas = 'laz-batas-' + Date.now();
  const meta = JSON.stringify({ name: nama, parents: [tujuan], mimeType: mime || 'application/octet-stream' });
  const body = Buffer.concat([
    Buffer.from('--' + batas + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n'
      + '--' + batas + '\r\nContent-Type: ' + (mime || 'application/octet-stream') + '\r\n\r\n'),
    buf,
    Buffer.from('\r\n--' + batas + '--'),
  ]);
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + batas },
    body
  });
}
```

Perhatikan: `folder` tidak diberikan → `tujuan = e.folder` (Folder_Cadangan), identik dengan perilaku sebelum perubahan ini. api/backup.js tidak memanggil unggahBiner sama sekali (ia memakai unggah() untuk teks JSON), jadi perubahan ini tidak menyentuhnya; tetap dicatat di sini karena Kebutuhan 2.2 meminta itu dinyatakan eksplisit.

**unduh(id) dan hapus(id)**: TIDAK diubah. Keduanya bekerja berdasarkan id berkas Drive saja; sebuah berkas yang sudah diunggah ke folder manapun tetap bisa diunduh atau dihapus hanya dengan id-nya, karena Drive API tidak memerlukan parent folder untuk operasi GET/DELETE berdasarkan file id. Ini dicatat eksplisit di sini supaya tidak ada perubahan tak sengaja pada dua fungsi ini.

**unggah(), daftar(), pangkas()**: TIDAK diubah signature maupun perilaku. Dipakai eksklusif oleh api/backup.js, tetap memakai e.folder (Folder_Cadangan).

**module.exports**: tambah driveSiapSurat dan folderSurat:

```javascript
module.exports = { driveSiap, driveSiapSurat, folderSurat, tokenAkses, unggah, unggahBiner, unduh, daftar, hapus, pangkas };
```

### 2. lib/surat/surat.js (LF dipertahankan)

**tambahLampiran(id, data, oleh, drive)**: ganti pemeriksaan dan sertakan folder tujuan:

```javascript
if (drive && drive.driveSiapSurat && drive.driveSiapSurat()) {
  const folder = drive.folderSurat();
  const f = await drive.unggahBiner(r.nomor.replace(/\//g, '-') + ' ' + nama, buf, mime, folder);
  Object.assign(l, { simpan: 'drive', driveId: f.id });
} else {
  // ... jalur basis data, tidak berubah
}
```

Rasional: `drive.folderSurat()` menghitung Folder_Surat atau Folder_Cadangan sebagai jalan cadangan di dalam _drive.js (satu-satunya tempat yang tahu nama variabel lingkungan), lalu surat.js meneruskannya sebagai parameter eksplisit ke unggahBiner. surat.js sendiri tidak pernah membaca process.env langsung, sehingga pemisahan tanggung jawab yang sudah ada tetap terjaga (surat.js tidak tahu detail transport Drive, hanya tahu "drive" sebagai modul yang disuntikkan lewat parameter, pola yang sama seperti driveSiap() sebelumnya).

**ambilLampiran(id, lid, drive)**: ganti pemanggilan drive.unduh(l.driveId) tidak perlu pemeriksaan driveSiap/driveSiapSurat karena sudah dijalankan hanya ketika `l.simpan === 'drive'`, artinya lampiran itu memang pernah berhasil diunggah ke Drive sebelumnya. Baris ini TIDAK berubah:

```javascript
if (l.simpan === 'drive') {
  const buf = await drive.unduh(l.driveId);
  return { lampiran: l, isi: buf.toString('base64') };
}
```

**hapusLampiran(id, lid, drive)**: ganti pemeriksaan drive.driveSiap() menjadi drive.driveSiapSurat() sebelum memanggil drive.hapus():

```javascript
if (l.simpan === 'drive' && drive && drive.driveSiapSurat()) { try { await drive.hapus(l.driveId); } catch (_) { /* tetap dilepas dari surat */ } }
```

Catatan desain: pemeriksaan driveSiapSurat() di sini sebenarnya hanya menjaga agar `drive` modul tidak dipanggil kalau kredensial dasar sudah tidak lengkap (misalnya token kedaluwarsa dan env dikosongkan admin). Operasi hapus tetap berdasarkan id, bukan folder, jadi hasilnya sama baik Folder_Surat atau Folder_Cadangan dipakai saat unggah. try/catch yang sudah ada menjaga penghapusan surat tidak gagal total kalau Drive API bermasalah.

**hapus(id, drive)**: pola sama seperti hapusLampiran, ganti driveSiap() menjadi driveSiapSurat() pada baris di dalam perulangan lampiran:

```javascript
async function hapus(id, drive) {
  const r = await ambil(id);
  for (const l of r.lampiran || []) {
    if (l.simpan === 'db') await db.hapus('berkas:' + l.id);
    if (l.simpan === 'drive' && drive && drive.driveSiapSurat()) { try { await drive.hapus(l.driveId); } catch (_) { /* abaikan */ } }
  }
  await db.hapus('item:' + r.id);
  await db.keluarDariHimpunan('indeks', r.id);
}
```

### 3. lib/surat/api.js (LF dipertahankan)

Dua tempat field `drive` dibangun, ganti `drive.driveSiap()` menjadi `drive.driveSiapSurat()`:

```javascript
T['surat.status'] = async (p) => ({
  // ...
  drive: !!(drive && drive.driveSiapSurat()), hariIni: S.hariIni(), lembaga: await lembaga(),
});
```

```javascript
T['surat.ruang'] = async () => ({ pakai: await S.pakaiRuang(), kuota: S.KUOTA, drive: !!(drive && drive.driveSiapSurat()) });
```

Pemanggilan `S.tambahLampiran(d.id, d, p, drive)`, `S.ambilLampiran(d.id, d.lid, drive)`, `S.hapusLampiran(d.id, d.lid, drive)`, `S.hapus(d.id, drive)` di T['surat.lampiran.*'] dan T['surat.hapus'] TIDAK perlu diubah. Mereka cukup meneruskan modul `drive` apa adanya, keputusan driveSiap vs driveSiapSurat sudah dipindahkan ke dalam surat.js.

### 4. .env.example

Tambahkan baris baru tepat di bawah `GDRIVE_FOLDER_ID=`, di blok Google Drive yang sudah ada:

```
# ID folder tujuan: bagian setelah /folders/ pada alamat folder di Drive
GDRIVE_FOLDER_ID=

# Folder Drive KHUSUS untuk lampiran modul Surat & Pengajuan, terpisah dari
# folder cadangan di atas (lihat PANDUAN-LAMPIRAN-SURAT.md). Kosongkan untuk
# memakai folder cadangan (GDRIVE_FOLDER_ID) sebagai jalan cadangan.
GDRIVE_FOLDER_SURAT_ID=
```

### 5. PANDUAN-LAMPIRAN-SURAT.md (dokumen baru)

Struktur isi (Bahasa Indonesia, tanpa em dash, mengikuti gaya PANDUAN-CADANGAN.md):

1. Judul dan ringkasan tujuan: memisahkan lampiran surat dari cadangan basis data di Google Drive.
2. Tabel atau penjelasan perilaku fallback: Folder_Surat kosong -> otomatis pakai Folder_Cadangan -> kedua folder kosong -> lampiran baru disimpan di basis data (sampai kuota SURAT_KUOTA_MB penuh).
3. Langkah membuat folder Drive baru khusus lampiran surat (serupa langkah 2c PANDUAN-CADANGAN.md: buka Drive, buat folder baru, ambil ID dari alamat).
4. Langkah mengisi GDRIVE_FOLDER_SURAT_ID di Vercel (Settings -> Environment Variables -> Redeploy).
5. Catatan bahwa kredensial OAuth (GDRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN) dipakai bersama dengan fitur cadangan, tidak perlu dibuat ulang; cukup ikuti PANDUAN-CADANGAN.md langkah 2a dan 2b kalau belum pernah disetel.
6. Catatan migrasi manual: lampiran lama yang sudah tersimpan di Folder_Cadangan sebelum fitur ini tidak berpindah folder secara otomatis. Langkah manual (opsional): buka Folder_Cadangan di Drive, cari berkas berawalan nomor surat (nama berkas memakai format "<nomor surat yang garis miringnya diganti strip> <nama lampiran>"), pindahkan manual ke Folder_Surat lewat antarmuka Drive (drag atau klik kanan -> Pindahkan ke). driveId yang tersimpan di basis data TIDAK perlu diubah, karena drive.unduh(id) dan drive.hapus(id) bekerja berdasarkan id berkas, bukan lokasi folder, sehingga pemindahan folder di Drive tidak mengubah id berkas.
7. Catatan bahwa fitur cadangan basis data (PANDUAN-CADANGAN.md) tidak terdampak sama sekali oleh variabel baru ini.

## Model Data

Tidak ada perubahan skema basis data. Struktur objek lampiran (`l`) pada array `lampiran` milik satu catatan surat tetap:

```
{ id, nama, oleh, waktu, simpan: 'drive'|'db'|'tautan', mime, ukuran, ukuranAsli,
  driveId? (hanya saat simpan === 'drive'), url? (hanya saat simpan === 'tautan') }
```

Tidak ada field baru ditambahkan ke objek lampiran. Lokasi folder Drive tempat berkas berada tidak dicatat di objek ini (dan tidak perlu, karena operasi unduh/hapus berdasarkan driveId saja). Ini konsisten dengan Kebutuhan 3.4 dan 3.5.

## Penanganan Galat

- **driveSiapSurat() salah saat tambah lampiran**: surat.js jatuh ke jalur Penyimpanan_Basis_Data yang sudah ada (cek kuota SURAT_KUOTA_MB), sama seperti perilaku driveSiap() salah sebelumnya. Tidak ada galat baru.
- **unggahBiner gagal (galat jaringan/API Drive)**: dilempar sebagai Error dari driveFetch(), ditangkap oleh pembungkus try/catch di lib/surat/api.js (blok `catch (e)` pada `tangani()`), dikirim ke klien sebagai galat 500 dengan pesan. Tidak berubah dari perilaku sekarang.
- **hapus/hapusLampiran gagal menghapus dari Drive**: sudah dibungkus try/catch yang mengabaikan galat (komentar "tetap dilepas dari surat" / "abaikan"). Perilaku ini dipertahankan, hanya kondisi pemicunya (driveSiap -> driveSiapSurat) yang berubah.
- **GDRIVE_FOLDER_SURAT_ID disetel tapi kredensial dasar tidak lengkap**: driveSiapSurat() mengembalikan false (Kebutuhan 1.4), surat.js jatuh ke Penyimpanan_Basis_Data, sama seperti kasus Folder_Surat kosong.
- **api/backup.js**: tidak ada jalur galat baru. driveSiap() dan unggah/daftar/hapus/pangkas tidak diubah; GDRIVE_FOLDER_SURAT_ID tidak pernah dibaca oleh backup.js.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Kesiapan Drive surat mengikuti folder surat atau folder cadangan

Untuk semua kombinasi Kredensial_Dasar (lengkap atau tidak) dan nilai Folder_Surat serta Folder_Cadangan (terisi atau kosong), driveSiapSurat() mengembalikan nilai benar jika dan hanya jika Kredensial_Dasar lengkap DAN (Folder_Surat terisi ATAU Folder_Cadangan terisi).

**Validates: Requirements 1.2, 1.3, 1.4, 1.5**

### Property 2: driveSiap tidak berubah oleh keberadaan folder surat

Untuk semua nilai Folder_Surat (terisi atau kosong), hasil driveSiap() hanya bergantung pada Kredensial_Dasar dan Folder_Cadangan, tidak pernah berubah akibat nilai Folder_Surat.

**Validates: Requirements 1.6, 5.1, 5.3**

### Property 3: unggahBiner tanpa parameter folder selalu memakai folder cadangan

Untuk semua pemanggilan unggahBiner(nama, buf, mime) tanpa parameter folder, berkas yang terunggah memiliki folder induk (parents) sama dengan Folder_Cadangan, berapa pun nilai Folder_Surat saat itu.

**Validates: Requirements 2.2, 5.2**

### Property 4: unggahBiner dengan parameter folder memakai folder yang diberikan

Untuk semua pemanggilan unggahBiner(nama, buf, mime, folder) dengan parameter folder terisi, berkas yang terunggah memiliki folder induk (parents) sama dengan nilai folder yang diberikan, terlepas dari nilai Folder_Cadangan maupun Folder_Surat saat itu.

**Validates: Requirements 2.1, 2.3**

### Property 5: Lampiran surat baru memilih folder sesuai aturan fallback

Untuk semua pemanggilan tambahLampiran dengan drive tiruan yang driveSiapSurat() mengembalikan benar, folder tujuan yang diteruskan ke unggahBiner sama dengan Folder_Surat jika Folder_Surat terisi, atau sama dengan Folder_Cadangan jika Folder_Surat kosong.

**Validates: Requirements 3.1**

### Property 6: Modul Surat memakai driveSiapSurat, bukan driveSiap

Untuk semua pemanggilan tambahLampiran, ambilLampiran, hapusLampiran, dan hapus dengan drive tiruan yang driveSiap() dan driveSiapSurat() mengembalikan nilai berbeda, keputusan Modul_Surat (naik ke Drive atau tidak; memanggil drive.hapus atau tidak) mengikuti hasil driveSiapSurat(), bukan driveSiap().

**Validates: Requirements 3.2, 3.3**

### Property 7: Status dan ruang Surat melaporkan driveSiapSurat

Untuk semua kombinasi hasil driveSiap() dan driveSiapSurat() yang berbeda, field `drive` pada hasil surat.status dan surat.ruang sama dengan hasil driveSiapSurat(), bukan driveSiap().

**Validates: Requirements 4.1, 4.2**

### Property 8: Cadangan basis data tidak terpengaruh folder surat

Untuk semua nilai GDRIVE_FOLDER_SURAT_ID (terisi atau kosong) selama GDRIVE_FOLDER_ID kosong, driveSiap() tetap mengembalikan nilai salah, sehingga api/backup.js tetap menganggap Drive belum siap untuk cadangan.

**Validates: Requirements 5.3**

## Strategi Pengujian

### Pendekatan Dual

- **Uji unit/contoh** di tools/test_surat_fitur.js (menambah skenario baru) untuk memverifikasi perilaku driveSiapSurat() dengan drive tiruan yang disuntikkan lewat parameter `drive` pada tambahLampiran/ambilLampiran/hapusLampiran/hapus, serta field `drive` pada surat.status dan surat.ruang.
- **Uji berbasis properti** diletakkan di berkas baru tools/test_drive_surat_folder.js, memakai drive tiruan (bukan panggilan sungguhan ke Google API) yang menjalankan driveSiapSurat()/unggahBiner() langsung dari api/_drive.js dengan kombinasi env yang dikendalikan lewat `process.env` sementara (disetel dan dikembalikan di akhir uji, mengikuti pola `_pagar-db.js` yang sudah dipakai uji lain untuk mengisolasi data).

Rasional pemisahan berkas: test_surat_fitur.js sudah panjang dan berfokus pada alur bisnis surat (status, nomor agenda, disposisi, lampiran, dsb) lewat pintu HTTP tiruan `media()`. Uji properti driveSiapSurat()/unggahBiner() murni menyoal api/_drive.js (fungsi murni berbasis env dan parameter), lebih bersih diuji terpisah tanpa perlu memuat seluruh mesin RPC. Property 5 dan 6 (yang menyoal lib/surat/surat.js memanggil drive dengan benar) diuji di test_surat_fitur.js karena memerlukan drive tiruan yang disuntikkan ke tambahLampiran, pola yang sudah ada di berkas itu untuk uji lampiran yang sudah berjalan (lihat bagian lampiran di test_surat_fitur.js yang sudah ada).

### Properti yang diuji dengan iterasi acak (minimum 100 per properti)

- **Property 1 dan 2** (test_drive_surat_folder.js): generator mengacak kombinasi string kosong/terisi untuk id, secret, refresh, folder, folderSurat (contoh: string acak non-kosong atau string kosong), memanggil driveSiapSurat() dan driveSiap() langsung terhadap ENV() yang disetel lewat process.env, memverifikasi hasilnya sesuai tabel kebenaran pada Property 1 dan 2.
- **Property 3 dan 4** (test_drive_surat_folder.js): generator mengacak nama berkas, isi buffer (ukuran dan isi byte acak), mime, dan folder opsional (kadang diberikan kadang tidak), memanggil unggahBiner dengan `driveFetch` yang ditiru (mock fetch global) untuk menangkap body multipart yang dikirim, lalu memverifikasi field `parents` di bagian metadata JSON body sesuai folder yang diharapkan tanpa benar-benar memanggil Google Drive API.
- **Property 5 dan 6** (test_surat_fitur.js, bagian baru): generator mengacak kombinasi driveSiap()/driveSiapSurat() (keduanya fungsi pada objek drive tiruan yang dikembalikan acak true/false secara independen) dan Folder_Surat kosong/terisi pada drive tiruan tersebut, memanggil tambahLampiran/hapus/dst, memverifikasi folder yang diteruskan ke unggahBiner tiruan dan apakah drive.hapus tiruan terpanggil, sesuai aturan di Property 5 dan 6.

### Uji contoh/unit (bukan properti, 1-3 skenario)

- **Property 7** (surat.status dan surat.ruang melaporkan driveSiapSurat): 2-3 kombinasi konkret (keduanya true, keduanya false, driveSiap false tapi driveSiapSurat true) sudah cukup karena ini memverifikasi pengkabelan satu baris kode, bukan logika yang bervariasi menurut input kompleks. Classification: EXAMPLE.
- **Property 8** (cadangan tidak terpengaruh): 1-2 skenario konkret memverifikasi driveSiap() tetap false ketika GDRIVE_FOLDER_SURAT_ID terisi tapi GDRIVE_FOLDER_ID kosong. Classification: EXAMPLE/INTEGRATION ringan karena ini pemeriksaan non-regresi pada fungsi yang TIDAK diubah, iterasi acak tidak menambah nilai di luar yang sudah dicakup Property 2.

### Pendaftaran di tools/jalankan-uji.js

Tambahkan satu baris baru pada array DAFTAR, ditempatkan tepat setelah entri `test_surat_fitur.js` yang sudah ada:

```javascript
{ label: 'Fitur Surat dan Pengajuan', berkas: 'test_surat_fitur.js' },
{ label: 'Folder Drive khusus lampiran Surat', berkas: 'test_drive_surat_folder.js' },
{ label: 'Tampilan Surat dan Pengajuan', berkas: 'test_surat_ui.js' },
```

## Catatan Konsistensi dengan Batasan Proyek

- Tidak ada berkas baru di api/ selain yang sudah ada (api/_drive.js disunting, tidak dibuat baru). Berkas uji baru tools/test_drive_surat_folder.js berada di tools/, bukan api/, sehingga tidak menambah fungsi serverless Vercel.
- api/_drive.js mempertahankan akhiran baris CRLF yang sudah ada di berkas tersebut; suntingan harus memakai alat yang menjaga CRLF, tidak menuliskan ulang seluruh berkas dengan LF.
- lib/surat/surat.js dan lib/surat/api.js mempertahankan akhiran baris LF yang sudah ada.
- PANDUAN-LAMPIRAN-SURAT.md dan seluruh komentar kode baru ditulis dalam Bahasa Indonesia tanpa tanda em dash, mengikuti gaya dokumen dan komentar yang sudah ada di proyek ini.
- driveSiap() dan perilaku api/backup.js (unggah, daftar, hapus, pangkas tanpa parameter folder) tidak diubah signature maupun hasilnya.
