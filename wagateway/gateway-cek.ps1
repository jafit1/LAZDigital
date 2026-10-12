# Memeriksa apakah gateway sudah jalan. Output: SUDAH atau BELUM.
$ErrorActionPreference = 'SilentlyContinue'
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
     Where-Object { $_.CommandLine -like '*agen.js*' }
if ($p) { Write-Output 'SUDAH' } else { Write-Output 'BELUM' }