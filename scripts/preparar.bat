@echo off
rem Atalho para dupla-clique: chama o script PowerShell de mesmo nome.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar.ps1" %*
pause
