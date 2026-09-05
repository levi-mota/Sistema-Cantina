@echo off
rem Atalho para dupla-clique: chama o script PowerShell de mesmo nome.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dados-teste.ps1" %*
pause
