<#
.SYNOPSIS
    Encerra o backend e o frontend iniciados pelo iniciar.ps1.

.DESCRIPTION
    Use quando a janela do iniciar.ps1 foi fechada sem Ctrl+C e os servicos
    continuaram rodando (portas presas).
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot "_comum.ps1")

Escrever-Titulo "Encerrando o Sistema Cantina"

if (Parar-Servicos) {
    Escrever-Ok "Servicos encerrados"
} else {
    Escrever-Passo "Nenhum servico registrado estava rodando"
    Escrever-Aviso "Se alguma porta seguir ocupada, veja quem esta usando com:"
    Write-Host "      netstat -ano | findstr :5173" -ForegroundColor DarkGray
}

Write-Host ""
