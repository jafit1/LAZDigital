@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM Aman untuk .bat: jangan pakai "&" di teks echo.
echo Menjalankan Gateway WhatsApp LAZDigital...

if not exist ".env" (
  echo [GALAT] Berkas .env tidak ditemukan di folder gateway.
  echo Salin .env.example menjadi .env lalu isi token dan URL API.
  goto gagal
)
REM Memastikan folder sesi default dan sumber ada.
if not exist "sessions" mkdir "sessions"
if not exist "node_modules" (
  echo Menginstal dependensi...
  call npm ci --ignore-scripts
  if errorlevel 1 (
    echo [GALAT] npm install gagal. Dependensi belum lengkap.
    echo Perbaiki galat di atas, lalu jalankan start.bat lagi.
    goto gagal
  )
)

if not exist "node_modules\@whiskeysockets\baileys" (
  echo [GALAT] Dependensi Baileys belum terpasang.
  echo Jalankan npm ci --ignore-scripts dan baca galat yang ditampilkan.
  goto gagal
)
if not exist "node_modules\qrcode" (
  echo [GALAT] Dependensi qrcode belum terpasang.
  echo Jalankan npm ci --ignore-scripts dan baca galat yang ditampilkan.
  goto gagal
)

echo API        : dibaca oleh Node dari .env
echo Perangkat  : dibaca oleh Node dari .env atau sessions/perangkat.json
echo Folder sesi: dibaca oleh Node dari .env atau folder sessions
echo.
echo.

node --env-file=.env src/agen.js
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
