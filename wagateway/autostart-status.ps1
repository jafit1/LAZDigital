# Helper status gateway untuk autostart.
# Dijalankan oleh autostart-status.bat.
$ErrorActionPreference = 'SilentlyContinue'
$akar = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Output '=== Task Scheduler: LAZDigital-WA-Gateway ==='
$t = Get-ScheduledTask -TaskName 'LAZDigital-WA-Gateway'
if (-not $t) {
  Write-Output 'BELUM DIPASANG (jalankan autostart-install.bat)'
} else {
  Write-Output ("State      : " + $t.State)
  Write-Output ("Aktif      : " + $t.Settings.Enabled)
  $i = Get-ScheduledTaskInfo -TaskName 'LAZDigital-WA-Gateway'
  Write-Output ("Run terakhir: " + $i.LastRunTime)
  Write-Output ("Hasil      : " + $i.LastTaskResult)
}

Write-Output ''
Write-Output '=== Proses gateway ==='
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
     Where-Object { $_.CommandLine -like '*agen.js*' }
if (-not $p) {
  Write-Output 'gateway tidak sedang jalan'
} else {
  $p | ForEach-Object { Write-Output ("PID " + $_.ProcessId + " berjalan") }
}

Write-Output ''
Write-Output '=== 8 baris terakhir logs\gateway.log ==='
$log = Join-Path $akar 'logs\gateway.log'
if (Test-Path $log) {
  Get-Content $log -Tail 8
} else {
  Write-Output 'belum ada log'
}