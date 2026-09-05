<#
.SYNOPSIS
    Apaga o banco e cria um novo, opcionalmente com dados de demonstracao.

.DESCRIPTION
    Destrutivo: perde tudo o que estiver gravado. Faz um backup do arquivo
    antes de apagar, em backend\cantina.db.backup-<data>.

.PARAMETER ComDemo
    Preenche o banco novo com produtos, vendas, contas e caixas de exemplo.

.PARAMETER SemConfirmacao
    Pula a confirmacao (para uso em automacao).

.EXAMPLE
    .\recriar-banco.ps1 -ComDemo
#>
[CmdletBinding()]
param(
    [switch]$ComDemo,
    [switch]$SemConfirmacao
)

. (Join-Path $PSScriptRoot "_comum.ps1")

# Ferramentas Python escrevem informacao em stderr; sem isso o PowerShell 5.1
# trataria essas linhas como erro fatal.
$ErrorActionPreference = "Continue"

if (-not (Test-Path $PythonVenv)) {
    Escrever-Erro "O ambiente ainda nao foi preparado. Rode primeiro: .\preparar.ps1"
    exit 1
}

Escrever-Titulo "Recriar o banco de dados"
Escrever-Aviso "Todos os dados atuais serao apagados (vendas, estoque, financeiro)"

if (-not $SemConfirmacao) {
    $resposta = Read-Host "  Digite APAGAR para confirmar"
    if ($resposta -ne "APAGAR") { Escrever-Passo "Cancelado"; exit 0 }
}

# O banco fica travado enquanto a API estiver no ar.
if (Parar-Servicos) {
    Escrever-Passo "Encerrei os servicos que estavam usando o banco"
    Start-Sleep -Seconds 2
}

$banco = Join-Path $Backend "cantina.db"
if (Test-Path $banco) {
    $carimbo = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = Join-Path $Backend "cantina.db.backup-$carimbo"
    Copy-Item $banco $backup
    Escrever-Ok "Backup salvo em backend\cantina.db.backup-$carimbo"
}

Get-ChildItem -Path $Backend -Filter "cantina.db*" -File |
    Where-Object { $_.Name -notlike "*.backup-*" } |
    Remove-Item -Force -ErrorAction SilentlyContinue
Escrever-Ok "Banco antigo removido"

Push-Location $Backend
if ($ComDemo) {
    Escrever-Passo "Criando o banco com dados de demonstracao"
    & $PythonVenv seed.py
} else {
    Escrever-Passo "Criando o banco vazio (so as migracoes)"
    & $PythonVenv -m alembic upgrade head
}
$codigo = $LASTEXITCODE
Pop-Location

if ($codigo -ne 0) { Escrever-Erro "Falha ao criar o banco"; exit 1 }
Escrever-Ok "Banco recriado"
Write-Host ""
