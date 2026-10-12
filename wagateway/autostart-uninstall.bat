@echo off
REM Menghapus Task Scheduler agar gateway tidak lagi jalan otomatis.
setlocal
cd /d "%~dp0"
echo Menghapus Task: LAZDigital-WA-Gateway
powershell -NoProfile -ExecutionPolicy Bypass -File "autostart-uninstall.ps1"
echo.
echo Selesai. Gateway tidak akan lagi jalan otomatis.
pause