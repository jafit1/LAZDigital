@echo off
setlocal
title LAZ Digital - Uji sebelum deploy
cd /d "%~dp0"
chcp 65001 >nul

REM Semua uji jalan di komputer ini dengan data palsu. Data sungguhan tidak
REM disentuh. Daftar ujinya ada di tools\jalankan-uji.js (bukan di sini lagi):
REM uji dijalankan bersamaan dan hanya yang gagal yang dicetak rinci.
REM
REM   uji-sebelum-deploy.bat            semua uji
REM   uji-sebelum-deploy.bat impor      hanya uji yang namanya memuat "impor"
REM   uji-sebelum-deploy.bat --urut     satu per satu, kalau ada yang aneh

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Unduh di https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Memasang dependensi, sekali saja...
  call npm install
)

node tools\jalankan-uji.js %*
set HASIL=%errorlevel%

if not "%HASIL%"=="0" goto gagal
if not "%~1"=="" goto selesai
echo   Langkah berikutnya:
echo     1. Pastikan variabel di Vercel sudah terisi ^(lihat .env.example^)
echo     2. Jalankan deploy.bat
goto selesai
:gagal
echo   Perbaiki yang GAGAL, lalu jalankan ulang ujinya saja, misalnya:
echo     node tools\test_impor_berkas.js
:selesai
echo.
pause
exit /b %HASIL%
