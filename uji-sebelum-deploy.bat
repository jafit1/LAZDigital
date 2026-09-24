@echo off
setlocal enabledelayedexpansion
title LAZ Digital - Uji sebelum deploy
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo ==================================================
echo   UJI SEBELUM DEPLOY
echo   Semua uji di bawah ini jalan di komputer ini,
echo   memakai data palsu. Data sungguhan tidak disentuh.
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Unduh di https://nodejs.org
  pause & exit /b 1
)
if not exist node_modules (
  echo Memasang dependensi, sekali saja...
  call npm install
)

set GAGAL=0

REM Yang paling depan sengaja yang paling murah dan paling fatal: kalau jumlah
REM fungsi melewati batas Vercel, SELURUH deploy ditolak - bukan cuma satu fitur.
call :jalankan "Batas fungsi Vercel"            tools\uji_batas_vercel.js
call :jalankan "Sambungan ke gateway WhatsApp"  tools\test_agen.js
call :jalankan "Fitur Broadcast"                tools\test_blast_fitur.js
call :jalankan "Tampilan halaman Broadcast"     tools\test_blast_ui.js
call :jalankan "Fitur Fundraising"              tools\test_fund_fitur.js
call :jalankan "Tampilan halaman Fundraising"   tools\test_fund_ui.js
call :jalankan "Fitur AI Asisten"               tools\test_ai_fitur.js
call :jalankan "Tampilan halaman AI Asisten"    tools\test_ai_ui.js
call :jalankan "Apa yang sudah sampai di server" tools\uji_cek_deploy.js

echo.
echo ==================================================
if "%GAGAL%"=="0" (
  echo   SEMUA LULUS - aman untuk deploy.
  echo.
  echo   Langkah berikutnya:
  echo     1. Pastikan variabel di Vercel sudah terisi
  echo        ^(lihat .env.example: BLAST_AGEN_TOKEN, RAHASIA_SESI, PENGIRIM^)
  echo     2. Jalankan deploy.bat
) else (
  echo   ADA %GAGAL% UJI YANG GAGAL - jangan deploy dulu.
  echo   Gulir ke atas untuk melihat baris bertanda GAGAL.
)
echo ==================================================
echo.
pause
exit /b %GAGAL%

:jalankan
echo.
echo --- %~1 ---
if not exist "%~2" (
  echo   DILEWATI^: berkas %~2 tidak ada
  exit /b 0
)
node "%~2"
if errorlevel 2 (
  echo   DILEWATI^: butuh Playwright ^(npm i -D playwright ^&^& npx playwright install chromium^)
  exit /b 0
)
if errorlevel 1 (
  set /a GAGAL+=1
  echo   ^>^>^> GAGAL^: %~1
)
exit /b 0
