' Menjalankan run-gateway.cmd tanpa jendela CMD yang terlihat.
' Dipakai oleh Task Scheduler agar gateway jalan senyap Background.
Option Explicit
Dim sh, base, cmd
Set sh = CreateObject("WScript.Shell")
base = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
sh.CurrentDirectory = base
cmd = "cmd /c """ & base & "\run-gateway.cmd"""
sh.Run cmd, 0, False