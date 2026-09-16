@echo off
title LAZ Digital - Cek apa yang sudah sampai di server
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Unduh di https://nodejs.org
  pause & exit /b 1
)
node cek-deploy.js
echo.
pause
