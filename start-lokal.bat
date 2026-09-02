@echo off
title LAZ Digital - Server Lokal
cd /d "%~dp0"

if not exist node_modules (
  echo Memasang dependensi...
  call npm install
)

echo.
echo ==================================================
echo  LAZ Digital - server lokal
echo  Buka: http://localhost:3000
echo  Tekan Ctrl+C untuk berhenti
echo ==================================================
echo.

node server.js
pause
