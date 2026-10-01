@echo off
setlocal enabledelayedexpansion
title LAZ Digital - Deploy ke GitHub + Vercel
cd /d "%~dp0"

echo ==================================================
echo   LAZ DIGITAL - DEPLOY
echo ==================================================
echo.

REM --- pastikan ini repo git ---
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [BATAL] Folder ini bukan repositori Git.
  goto akhir
)

REM --- PENGAMAN: database lokal tidak boleh ikut ter-push ---
for /f "delims=" %%F in ('git ls-files data 2^>nul') do (
  echo [BATAL] File database ikut terlacak Git: %%F
  echo         Jalankan dulu: git rm -r --cached data
  goto akhir
)

REM --- lihat perubahan ---
git diff --quiet
set DIRTY=%errorlevel%
git diff --cached --quiet
set STAGED=%errorlevel%
git ls-files --others --exclude-standard >"%TEMP%\lazbaru.txt"
for %%A in ("%TEMP%\lazbaru.txt") do set BARU=%%~zA
del "%TEMP%\lazbaru.txt" >nul 2>&1

if "%DIRTY%"=="0" if "%STAGED%"=="0" if "%BARU%"=="0" (
  echo Tidak ada perubahan untuk di-deploy.
  goto akhir
)

echo Perubahan yang akan dikirim:
echo --------------------------------------------------
git status --short
echo --------------------------------------------------
echo.

REM --- pesan commit ---
set "PESAN=%*"
if "%PESAN%"=="" set /p PESAN=Pesan commit (kosongkan untuk pesan otomatis): 
if "%PESAN%"=="" (
  for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set TGL=%%a-%%b-%%c
  for /f "tokens=1-2 delims=:" %%a in ("%time%") do set JAM=%%a:%%b
  set "PESAN=Update !TGL! !JAM!"
)

echo.
echo Commit : "%PESAN%"
echo.

git add -A
if errorlevel 1 goto gagal

REM --- PENGAMAN: berkas sensitif tidak boleh ikut ke repositori PUBLIK ---
REM .gitignore saja tidak cukup: berkas yang dulu terlanjur terlacak, atau nama
REM baru yang belum terdaftar, tetap ikut "git add -A". Daftar yang AKAN
REM di-commit diperiksa di sini, dan kalau ada yang cocok, semuanya dilepas lagi
REM dari staging lalu deploy dibatalkan. Tidak ada yang terkirim.
REM --diff-filter=d: berkas yang sedang DIKELUARKAN dari Git (git rm --cached)
REM tidak ikut diperiksa. Mengeluarkannya justru tujuannya. Tanpa ini, pengaman
REM membatalkan langkah perbaikannya sendiri (terjadi 1 Oktober 2026 saat
REM .data/ai.json dan potret/ dikeluarkan).
set SENSITIF=
for /f "delims=" %%F in ('git diff --cached --name-only --diff-filter=d ^| findstr /i /r /c:"^\.env$" /c:"^\.env\.local" /c:"^\.env\.production" /c:"^\.env\.development" /c:"^data/" /c:"^\.data/" /c:"HASIL-" /c:"laz-db-" /c:"\.db\.json$" /c:"^sessions/" /c:"laz\.json$" /c:"kunci\.txt$" /c:"wa-secrets" /c:"deploy-lazwa\.bat" /c:"^Claude outputs/" /c:"^potret/"') do (
  echo [BATAL] Berkas sensitif akan ikut ter-push: %%F
  set SENSITIF=1
)
if defined SENSITIF (
  git reset -q
  echo.
  echo         Tidak ada yang dikirim. Keluarkan berkas di atas dari Git, misalnya:
  echo           git rm --cached "nama berkas"
  echo         lalu pastikan polanya ada di .gitignore, kemudian jalankan deploy.bat lagi.
  goto akhir
)

git commit -m "%PESAN%"
if errorlevel 1 (
  echo [INFO] Tidak ada yang di-commit.
  goto akhir
)

REM --- pastikan database benar-benar tidak ikut ---
git show --name-only --pretty=format: HEAD | findstr /i /c:"data/laz-db" >nul
if not errorlevel 1 (
  echo.
  echo [PERINGATAN] Commit terakhir memuat file database.
  echo              Batalkan dengan: git reset --soft HEAD~1
  goto akhir
)

echo.
echo Mengirim ke GitHub...
git push origin main
if errorlevel 1 goto gagal

echo.
echo ==================================================
echo   BERHASIL
echo ==================================================
echo Vercel membangun otomatis, biasanya 15-30 detik.
echo Pantau : https://vercel.com/mji-corp-s-projects/laz-vercel/deployments
echo Situs   : https://lazdigital.my.id
echo.
goto akhir

:gagal
echo.
echo [GAGAL] Perintah Git berhenti dengan error. Baca pesan di atas.
echo         Kalau diminta login, isi Personal Access Token GitHub.

:akhir
echo.
pause
