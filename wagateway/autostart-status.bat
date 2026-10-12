@echo off
REM Menampilkan status Task Scheduler dan proses gateway.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "autostart-status.ps1"
echo.
pause