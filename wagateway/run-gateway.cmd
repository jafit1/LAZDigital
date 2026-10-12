@echo off
REM Dijalankan oleh Task Scheduler lewat start-hidden.vbs.
REM Semua output masuk ke logs\gateway.log, tanpa jendela CMD yang tetap terbuka.
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set LOG=%~dp0logs\gateway.log

REM Cegah dobel instance: satu sesi WhatsApp hanya boleh dipakai satu gateway.
for /f "usebackq delims=" %%S in (`powershell -NoProfile -ExecutionPolicy Bypass -File "gateway-cek.ps1"`) do set STATUS=%%S
if /i "%STATUS%"=="SUDAH" (
  REM Jangan sentuh %LOG% karena file itu sedang dikunci proses yang sedang jalan.
  echo [%date% %time%] Lewati start: gateway sudah berjalan.
  exit /b 0
)

echo [%date% %time%] ===== Gateway dijalankan =====>> "%LOG%"
node --env-file=.env src/agen.js >> "%LOG%" 2>&1
set KODE=%errorlevel%
echo [%date% %time%] ===== Gateway berhenti, exit code %KODE% =====>> "%LOG%"
exit /b %KODE%