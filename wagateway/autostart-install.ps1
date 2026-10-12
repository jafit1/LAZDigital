$ErrorActionPreference = 'Stop'
$akar = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $akar 'start-hidden.vbs'

$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
$t = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$s = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -RestartCount 5 `
      -RestartInterval (New-TimeSpan -Minutes 1) `
      -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName 'LAZDigital-WA-Gateway' `
  -Action $a -Trigger $t -Settings $s `
  -Description 'Gateway WhatsApp LAZDigital, jalan otomatis saat login' -Force | Out-Null

Write-Output 'Task LAZDigital-WA-Gateway terpasang.'