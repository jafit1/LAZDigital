@echo off
REM Menghapus sisa broadcast lama (era Fonnte) supaya jumlah Serverless
REM Function turun dari 13 ke 10, di bawah batas 12 paket Vercel Hobby.
REM Sudah diperiksa: tidak ada berkas aktif yang memanggilnya lagi.
setlocal
cd /d "%~dp0"

echo.
echo === Menghapus sisa broadcast lama (Fonnte) ===
echo.

git rm -f --ignore-unmatch "api/wa.js"
git rm -f --ignore-unmatch "api/_wa.js"
git rm -f --ignore-unmatch "api/wa-webhook.js"
git rm -f --ignore-unmatch "api/wa-dispatch.js"
git rm -f --ignore-unmatch "src/public/broadcast.html"
git rm -f --ignore-unmatch "tools/test_wa.js"
git rm -f --ignore-unmatch "tools/test_broadcast_ui.js"

echo.
echo === Sisa fungsi di folder api ===
echo.
for %%F in (api\*.js) do @echo %%~nxF
echo (berkas berawalan _ tidak dihitung Vercel)
echo.
echo Selesai. Berikutnya jalankan: uji-sebelum-deploy.bat lalu deploy.bat
echo.
pause
