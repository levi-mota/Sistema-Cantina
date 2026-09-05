<#
.SYNOPSIS
    Sobe o backend e o frontend e abre o sistema no navegador.

.DESCRIPTION
    Deixe esta janela aberta enquanto usar o sistema. Ctrl+C encerra os dois
    servicos. Os dois escutam na rede local, entao o celular no mesmo Wi-Fi
    acessa pelo endereco mostrado no final.

.PARAMETER PortaApi
    Porta do backend (padrao 8000).

.PARAMETER PortaWeb
    Porta do frontend (padrao 5173).

.PARAMETER SemNavegador
    Nao abre o navegador automaticamente.

.EXAMPLE
    .\iniciar.ps1
    .\iniciar.ps1 -PortaWeb 3000 -SemNavegador
#>
[CmdletBinding()]
param(
    [int]$PortaApi = 8000,
    [int]$PortaWeb = 5173,
    [switch]$SemNavegador
)

. (Join-Path $PSScriptRoot "_comum.ps1")

Escrever-Titulo "Iniciando o Sistema Cantina"

if (-not (Testar-Preparado)) {
    Escrever-Erro "O ambiente ainda nao foi preparado."
    Write-Host "      Rode primeiro:  .\preparar.ps1" -ForegroundColor Gray
    exit 1
}

# Restos de uma execucao anterior seguram as portas; limpamos antes.
if (Parar-Servicos) {
    Escrever-Aviso "Encerrei uma execucao anterior que ainda estava rodando"
    Start-Sleep -Seconds 2
}

foreach ($par in @(@($PortaApi, "backend"), @($PortaWeb, "frontend"))) {
    if (Testar-Porta $par[0]) {
        Escrever-Erro "A porta $($par[0]) ($($par[1])) ja esta em uso por outro programa."
        Write-Host "      Feche o programa ou escolha outra porta:" -ForegroundColor Gray
        Write-Host "      .\iniciar.ps1 -PortaApi 8001 -PortaWeb 5174" -ForegroundColor Gray
        exit 1
    }
}

if (-not (Test-Path $PastaExecucao)) {
    New-Item -ItemType Directory -Path $PastaExecucao -Force | Out-Null
}
$logApi = Join-Path $PastaExecucao "backend.log"
$logWeb = Join-Path $PastaExecucao "frontend.log"

# --- Backend --------------------------------------------------------------
Escrever-Passo "Subindo a API na porta $PortaApi"
$processoApi = Start-Process -FilePath $PythonVenv `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$PortaApi", "--reload") `
    -WorkingDirectory $Backend `
    -RedirectStandardOutput $logApi -RedirectStandardError "$logApi.err" `
    -WindowStyle Hidden -PassThru

# --- Frontend -------------------------------------------------------------
Escrever-Passo "Subindo a interface na porta $PortaWeb"
$npmCmd = Join-Path (Split-Path (Obter-Comando "node")) "npm.cmd"
if (-not (Test-Path $npmCmd)) { $npmCmd = "npm.cmd" }

$processoWeb = Start-Process -FilePath $npmCmd `
    -ArgumentList @("run", "dev", "--", "--port", "$PortaWeb", "--host") `
    -WorkingDirectory $Frontend `
    -RedirectStandardOutput $logWeb -RedirectStandardError "$logWeb.err" `
    -WindowStyle Hidden -PassThru

Registrar-Pids @($processoApi.Id, $processoWeb.Id)

# --- Espera ---------------------------------------------------------------
Escrever-Passo "Aguardando os servicos responderem"

if (-not (Aguardar-Url "http://127.0.0.1:$PortaApi/api/health" 90)) {
    Escrever-Erro "A API nao subiu. Ultimas linhas do log:"
    if (Test-Path "$logApi.err") { Get-Content "$logApi.err" -Tail 15 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray } }
    Parar-Servicos | Out-Null
    exit 1
}
Escrever-Ok "API respondendo"

if (-not (Aguardar-Url "http://127.0.0.1:$PortaWeb/" 90)) {
    Escrever-Erro "A interface nao subiu. Ultimas linhas do log:"
    if (Test-Path "$logWeb.err") { Get-Content "$logWeb.err" -Tail 15 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray } }
    Parar-Servicos | Out-Null
    exit 1
}
Escrever-Ok "Interface respondendo"

# --- Enderecos ------------------------------------------------------------
Escrever-Titulo "Sistema no ar"
Write-Host "  Neste computador   " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:$PortaWeb" -ForegroundColor White

$ip = Obter-IpDaRede
if ($ip) {
    Write-Host "  No celular         " -NoNewline -ForegroundColor Gray
    Write-Host "http://${ip}:$PortaWeb" -ForegroundColor White
    Write-Host "                     (celular no mesmo Wi-Fi)" -ForegroundColor DarkGray
}
Write-Host "  Documentacao API   " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:$PortaApi/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Logs em scripts\.run\  |  Ctrl+C para encerrar" -ForegroundColor DarkGray
Write-Host ""

if (-not $SemNavegador) { Start-Process "http://localhost:$PortaWeb" }

# --- Mantem em primeiro plano ate o Ctrl+C --------------------------------
try {
    while ($true) {
        Start-Sleep -Seconds 2
        if ($processoApi.HasExited) { Escrever-Erro "A API parou sozinha (veja scripts\.run\backend.log)"; break }
        if ($processoWeb.HasExited) { Escrever-Erro "A interface parou sozinha (veja scripts\.run\frontend.log)"; break }
    }
} finally {
    Write-Host ""
    Escrever-Passo "Encerrando os servicos"
    Parar-Servicos | Out-Null
    Escrever-Ok "Sistema encerrado"
}
