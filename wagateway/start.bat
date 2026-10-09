@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM Aman untuk .bat: jangan pakai "&" di teks echo.
echo Menjalankan Gateway WhatsApp LAZDigital...

REM Memuat .env sederhana: KEY=VALUE (tanpa tanda kutip).
REM Karakter ^, !, dan & di nilai masih perlu dibungkus tanda kutip manual,
REM jadi pastikan token dibuat dari huruf dan angka saja.
if exist ".env" (
  for /f "usebackq tokens=1,* delims== eol=#" %%a in (".env") do (
    if not "%%a"=="" set "%%a=%%b"
  )
) else (
  if not defined LAZ_API_URL set LAZ_API_URL=https://lazdigital.my.id/api/blast-agen
  if not defined BLAST_POLL_MS set BLAST_POLL_MS=3000
)
if not defined LAZ_API_URL set LAZ_API_URL=https://lazdigital.my.id/api/blast-agen
if not defined BLAST_POLL_MS set BLAST_POLL_MS=3000
if not defined BLAST_SESI set BLAST_SESI=%CD%\sessions

REM Memastikan folder sesi dan sumber ada.
if not exist "%BLAST_SESI%" mkdir "%BLAST_SESI%"
where git >nul 2>&1
if errorlevel 1 (
  echo [GALAT] Git tidak ditemukan di PATH Windows.
  echo Baileys membutuhkan Git saat npm memasang dependensinya.
  echo Instal Git for Windows dari https://git-scm.com/download/win
  echo Setelah selesai, tutup semua jendela CMD lalu jalankan start.bat lagi.
  goto gagal
)

if not exist "node_modules" (
  echo Menginstal dependensi...
  call npm install
  if errorlevel 1 (
    echo [GALAT] npm install gagal. Dependensi belum lengkap.
    echo Perbaiki galat di atas, lalu jalankan start.bat lagi.
    goto gagal
  )
)

if not exist "node_modules\qrcode" (
  echo [GALAT] Dependensi qrcode belum terpasang.
  echo Jalankan npm install setelah Git tersedia.
  goto gagal
)

if not defined BLAST_AGEN_TOKEN (
  echo [PERINGATAN] BLAST_AGEN_TOKEN kosong. Isi di .env atau environment sebelum menjalankan.
)
if not defined BLAST_PERANGKAT_ID if not defined BLAST_PERANGKAT_NAMA if not defined BLAST_PERANGKAT_NOMOR (
  echo [PERINGATAN] Isi BLAST_PERANGKAT_ID, atau pilih perangkat lewat nama atau nomor di .env.
)
if "%BLAST_AGEN_TOKEN%"=="ganti-dengan-token-yang-sama-di-vercel" (
  echo [GALAT] Ganti token contoh di .env dengan token BLAST_AGEN_TOKEN dari Vercel.
  goto gagal
)
if "%BLAST_PERANGKAT_ID%"=="isi-id-perangkat-dari-menu-pengaturan" set "BLAST_PERANGKAT_ID="
if "%BLAST_PERANGKAT_NAMA%"=="nama-perangkat-di-menu-broadcast" set "BLAST_PERANGKAT_NAMA="
if "%BLAST_PERANGKAT_NOMOR%"=="08xxxxxxxxxx" set "BLAST_PERANGKAT_NOMOR="

echo API        : %LAZ_API_URL%
if defined BLAST_PERANGKAT_ID (
  echo Perangkat  : %BLAST_PERANGKAT_ID%
) else (
  echo Perangkat  : dipilih otomatis lewat API
)
echo Folder sesi: %BLAST_SESI%
echo.

node src/agen.js
if errorlevel 1 goto gagal
goto selesai

:gagal
echo.
echo Gateway berhenti dengan galat. Periksa pesan di atas.
pause
exit /b 1

:selesai
echo.
echo Gateway berhenti normal.
pause
