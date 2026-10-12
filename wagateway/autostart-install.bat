@echo off
REM Memasang gateway agar otomatis berjalan setiap laptop dinyalakan.
REM Jalankan sekali. Tidak perlu admin.
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo [GALAT] .env tidak ditemukan. Gateway tidak bisa jalan otomatis.
  goto gagal
)
if not exist "node_modules\@whiskeysockets\baileys" (
  echo [GALAT] Dependensi Baileys belum ada. Jalankan start.bat sekali sampai berhasil.
  goto gagal
)
if not exist "logs" mkdir "logs"

echo Memasang Task Scheduler: LAZDigital-WA-Gateway
powershell -NoProfile -ExecutionPolicy Bypass -File "autostart-install.ps1"
if errorlevel 1 goto gagal

echo.
echo Selesai. Mulai sekarang gateway akan:
echo   - jalan otomatis setiap kamu login ke Windows
echo   - jalan tanpa jendela CMD yang mengganggu
echo   - otomatis diulang kalau gateway berhenti atau crash
echo.
echo YANG PERLU KAMU LAKUKAN SEKARANG:
echo   1. Jalankan start.bat sekali, pindai QR di sessions\qr.png
echo      (pindai QR cukup satu kali, sesi tersimpan permanen)
echo   2. Kalau QR sudah pernah dipindai, jendela ini boleh ditutup.
echo.
echo Cek status : autostart-status.bat
echo Log        : logs\gateway.log
echo Matikan    : autostart-uninstall.bat
pause
exit /b 0

:gagal
echo.
echo Pemasangan gagal. Periksa pesan di atas.
pause
exit /b 1