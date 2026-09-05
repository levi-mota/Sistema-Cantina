# Funcoes compartilhadas pelos scripts. Nao execute este arquivo diretamente.

$ErrorActionPreference = "Stop"

$Raiz = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Raiz "backend"
$Frontend = Join-Path $Raiz "frontend"
$PastaExecucao = Join-Path $PSScriptRoot ".run"
$ArquivoPids = Join-Path $PastaExecucao "pids.txt"
$PythonVenv = Join-Path $Backend ".venv\Scripts\python.exe"

function Escrever-Titulo([string]$Texto) {
    Write-Host ""
    Write-Host "  $Texto" -ForegroundColor Cyan
    Write-Host "  $('-' * $Texto.Length)" -ForegroundColor DarkGray
}

function Escrever-Passo([string]$Texto) { Write-Host "  -> $Texto" -ForegroundColor Gray }
function Escrever-Ok([string]$Texto) { Write-Host "  [ok] $Texto" -ForegroundColor Green }
function Escrever-Aviso([string]$Texto) { Write-Host "  [!] $Texto" -ForegroundColor Yellow }
function Escrever-Erro([string]$Texto) { Write-Host "  [x] $Texto" -ForegroundColor Red }

function Obter-Comando([string]$Nome) {
    $comando = Get-Command $Nome -ErrorAction SilentlyContinue
    if ($comando) { return $comando.Source }
    return $null
}

<#
Descobre o Python do sistema. Tenta o launcher "py" antes de "python" porque
no Windows o "python" costuma ser o atalho da Microsoft Store, que nao serve.
#>
function Obter-PythonDoSistema {
    $launcher = Obter-Comando "py"
    if ($launcher) {
        try {
            & $launcher -3 --version | Out-Null
            if ($LASTEXITCODE -eq 0) { return @($launcher, @("-3")) }
        } catch {}
    }
    $python = Obter-Comando "python"
    if ($python) {
        try {
            $versao = & $python --version 2>&1
            if ($LASTEXITCODE -eq 0 -and "$versao" -match "Python 3") { return @($python, @()) }
        } catch {}
    }
    return $null
}

function Testar-Preparado {
    if (-not (Test-Path $PythonVenv)) { return $false }
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) { return $false }
    return $true
}

function Obter-IpDaRede {
    try {
        $config = Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq "Up" } |
            Select-Object -First 1
        if ($config) { return $config.IPv4Address.IPAddress }
    } catch {}
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
            Select-Object -First 1
        if ($ip) { return $ip.IPAddress }
    } catch {}
    return $null
}

function Testar-Porta([int]$Porta) {
    try {
        $conexao = Test-NetConnection -ComputerName "127.0.0.1" -Port $Porta -InformationLevel Quiet -WarningAction SilentlyContinue
        return $conexao
    } catch {
        return $false
    }
}

function Aguardar-Url([string]$Url, [int]$SegundosLimite = 60) {
    $limite = (Get-Date).AddSeconds($SegundosLimite)
    while ((Get-Date) -lt $limite) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }
    return $false
}

# Encerra o processo e os filhos dele. O uvicorn com --reload e o Vite criam
# subprocessos; matar so o pai deixaria as portas presas.
function Parar-Arvore([int]$ProcessoId) {
    try {
        $filhos = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessoId" -ErrorAction SilentlyContinue
        foreach ($filho in $filhos) { Parar-Arvore ([int]$filho.ProcessId) }
    } catch {}
    try {
        Stop-Process -Id $ProcessoId -Force -ErrorAction SilentlyContinue
    } catch {}
}

function Registrar-Pids([int[]]$Pids) {
    if (-not (Test-Path $PastaExecucao)) {
        New-Item -ItemType Directory -Path $PastaExecucao -Force | Out-Null
    }
    $Pids | Set-Content -Path $ArquivoPids -Encoding utf8
}

function Parar-Servicos {
    if (-not (Test-Path $ArquivoPids)) { return $false }
    $encerrou = $false
    foreach ($linha in Get-Content $ArquivoPids) {
        $numero = 0
        if ([int]::TryParse($linha.Trim(), [ref]$numero) -and $numero -gt 0) {
            if (Get-Process -Id $numero -ErrorAction SilentlyContinue) {
                Parar-Arvore $numero
                $encerrou = $true
            }
        }
    }
    Remove-Item $ArquivoPids -ErrorAction SilentlyContinue
    return $encerrou
}
