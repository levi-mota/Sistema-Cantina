<#
.SYNOPSIS
    Gera dados de teste (vendas, turnos, estoque, contas) no banco atual.

.DESCRIPTION
    Diferente do recriar-banco, este script NAO apaga nada: ele soma movimento
    ao que ja existe, mantendo usuarios, caixas e produtos. Serve para encher o
    sistema e testar as telas com numero de verdade.

    Rodar de novo acrescenta mais um periodo.

.PARAMETER Dias
    Quantos dias para tras gerar (padrao 90).

.PARAMETER Operadores
    Quantos operadores criar, alem do administrador (padrao 3). Eles entram na
    escala dos caixas e aparecem no relatorio de quebras.

.EXAMPLE
    .\dados-teste.ps1
    .\dados-teste.ps1 -Dias 30
    .\dados-teste.ps1 -Operadores 4
#>
[CmdletBinding()]
param(
    [int]$Dias = 90,
    [int]$Operadores = 3
)

. (Join-Path $PSScriptRoot "_comum.ps1")

# Ferramentas Python escrevem informacao em stderr; sem isso o PowerShell 5.1
# trataria essas linhas como erro fatal.
$ErrorActionPreference = "Continue"

if (-not (Test-Path $PythonVenv)) {
    Escrever-Erro "O ambiente ainda nao foi preparado. Rode primeiro: .\preparar.ps1"
    exit 1
}

Escrever-Titulo "Gerando dados de teste"
Escrever-Aviso "Nada e apagado: os dados novos somam ao que ja existe"

# O banco fica travado enquanto a API estiver no ar.
if (Parar-Servicos) {
    Escrever-Passo "Encerrei os servicos que estavam usando o banco"
    Start-Sleep -Seconds 2
}

Push-Location $Backend
$env:PYTHONIOENCODING = "utf-8"
& $PythonVenv dados_teste.py $Dias $Operadores
$codigo = $LASTEXITCODE
Pop-Location

if ($codigo -ne 0) { Escrever-Erro "Falha ao gerar os dados"; exit 1 }

Escrever-Ok "Dados gerados"
Write-Host "  Suba o sistema com  " -NoNewline -ForegroundColor Gray
Write-Host ".\iniciar.ps1" -ForegroundColor White
Write-Host ""
