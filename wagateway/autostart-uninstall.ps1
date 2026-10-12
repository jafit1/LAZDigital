$ErrorActionPreference = 'SilentlyContinue'
Unregister-ScheduledTask -TaskName 'LAZDigital-WA-Gateway' -Confirm:$false
Write-Output 'Task LAZDigital-WA-Gateway dihapus.'