<#
.SYNOPSIS
    Prepara o ambiente do Sistema Cantina (dependencias, .env e banco).

.DESCRIPTION
    Rode uma vez, depois de clonar o projeto. E seguro rodar de novo: cada etapa
    verifica se ja esta feita antes de trabalhar.

.PARAMETER ComDemo
    Popula o banco com dados de demonstracao (produtos, vendas, contas, caixas).
    Ignorado se o banco ja existir.

.EXAMPLE
    .\preparar.ps1
    .\preparar.ps1 -ComDemo
#>
[CmdletBinding()]
param(
    [switch]$ComDemo
)

. (Join-Path $PSScriptRoot "_comum.ps1")

# Ferramentas Python escrevem informacao em stderr; sem isso o PowerShell 5.1
# trataria essas linhas como erro fatal.
$ErrorActionPreference = "Continue"

Escrever-Titulo "Preparando o Sistema Cantina"

# --- Pre-requisitos -------------------------------------------------------
Escrever-Passo "Verificando pre-requisitos"

$python = Obter-PythonDoSistema
if (-not $python) {
    Escrever-Erro "Python 3 nao encontrado."
    Write-Host "      Instale em https://www.python.org/downloads/ e marque 'Add Python to PATH'." -ForegroundColor Gray
    exit 1
}
$PythonExe = $python[0]
$PythonArgs = $python[1]

$npm = Obter-Comando "npm"
if (-not $npm) {
    Escrever-Erro "Node.js/npm nao encontrado."
    Write-Host "      Instale a versao LTS em https://nodejs.org/" -ForegroundColor Gray
    exit 1
}

$versaoPython = (& $PythonExe @PythonArgs --version) -replace "Python ", ""
$versaoNode = (& node --version) -replace "v", ""
Escrever-Ok "Python $versaoPython e Node $versaoNode"

# --- Backend --------------------------------------------------------------
Escrever-Titulo "Backend"

if (Test-Path $PythonVenv) {
    Escrever-Ok "Ambiente virtual ja existe"
} else {
    Escrever-Passo "Criando o ambiente virtual (.venv)"
    & $PythonExe @PythonArgs -m venv (Join-Path $Backend ".venv")
    if ($LASTEXITCODE -ne 0) { Escrever-Erro "Falha ao criar o ambiente virtual"; exit 1 }
    Escrever-Ok "Ambiente virtual criado"
}

Escrever-Passo "Instalando as dependencias do Python"
& $PythonVenv -m pip install --quiet --upgrade pip
& $PythonVenv -m pip install --quiet -r (Join-Path $Backend "requirements.txt")
if ($LASTEXITCODE -ne 0) { Escrever-Erro "Falha ao instalar as dependencias do backend"; exit 1 }
Escrever-Ok "Dependencias do backend instaladas"

$env_arquivo = Join-Path $Backend ".env"
if (Test-Path $env_arquivo) {
    Escrever-Ok "Arquivo .env ja existe (mantido como esta)"
} else {
    Copy-Item (Join-Path $Backend ".env.example") $env_arquivo
    Escrever-Ok "Arquivo .env criado a partir do .env.example"
    Escrever-Aviso "Antes de usar em producao, troque SECRET_KEY e ADMIN_PASSWORD no backend\.env"
}

# --- Frontend -------------------------------------------------------------
Escrever-Titulo "Frontend"

if (Test-Path (Join-Path $Frontend "node_modules")) {
    Escrever-Ok "Pacotes do Node ja instalados"
} else {
    Escrever-Passo "Instalando os pacotes do Node (pode demorar alguns minutos)"
    Push-Location $Frontend
    & npm install --silent
    $codigo = $LASTEXITCODE
    Pop-Location
    if ($codigo -ne 0) { Escrever-Erro "Falha ao instalar os pacotes do frontend"; exit 1 }
    Escrever-Ok "Pacotes do frontend instalados"
}

# --- Banco ----------------------------------------------------------------
Escrever-Titulo "Banco de dados"

$banco = Join-Path $Backend "cantina.db"
if (Test-Path $banco) {
    Escrever-Passo "Banco existente: aplicando as migracoes pendentes"
    Push-Location $Backend
    # "*> $null" descarta todos os fluxos. Nao use "2>&1" com executavel nativo
    # no PowerShell 5.1: ele transforma cada linha de stderr em erro.
    & $PythonVenv -m alembic upgrade head *> $null
    $codigo = $LASTEXITCODE
    Pop-Location
    if ($codigo -ne 0) {
        Escrever-Aviso "Nao foi possivel migrar agora; a aplicacao tentara de novo ao iniciar"
    } else {
        Escrever-Ok "Banco atualizado"
    }
} elseif ($ComDemo) {
    Escrever-Passo "Criando o banco com dados de demonstracao"
    Push-Location $Backend
    & $PythonVenv seed.py
    Pop-Location
    Escrever-Ok "Banco de demonstracao criado"
} else {
    Escrever-Passo "O banco sera criado no primeiro start, ja com as migracoes aplicadas"
    Escrever-Ok "Nada a fazer agora"
    Write-Host "      Para comecar com dados de exemplo: .\preparar.ps1 -ComDemo" -ForegroundColor DarkGray
}

Escrever-Titulo "Pronto"
Write-Host "  Para abrir o sistema:  " -NoNewline -ForegroundColor Gray
Write-Host ".\iniciar.ps1" -ForegroundColor White
Write-Host ""
