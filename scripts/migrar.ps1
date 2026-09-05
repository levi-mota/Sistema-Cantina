<#
.SYNOPSIS
    Controla as migracoes de banco (Alembic).

.DESCRIPTION
    O sistema aplica as migracoes pendentes sozinho ao iniciar, entao no uso
    normal voce nao precisa deste script. Ele serve para quando o schema muda:
    criar a migracao nova, conferir em que versao o banco esta ou voltar atras.

.PARAMETER Acao
    aplicar  - aplica as migracoes pendentes (padrao)
    criar    - gera uma migracao nova comparando os modelos com o banco
    status   - mostra a versao atual e o historico
    reverter - desfaz a ultima migracao aplicada
    sql      - imprime o SQL das migracoes pendentes, sem executar

.PARAMETER Mensagem
    Descricao da migracao. Obrigatorio com "criar".

.EXAMPLE
    .\migrar.ps1 status
    .\migrar.ps1 criar -Mensagem "adiciona desconto por item"
    .\migrar.ps1 aplicar
    .\migrar.ps1 reverter
#>
[CmdletBinding()]
param(
    [ValidateSet("aplicar", "criar", "status", "reverter", "sql")]
    [string]$Acao = "aplicar",
    [string]$Mensagem
)

. (Join-Path $PSScriptRoot "_comum.ps1")

if (-not (Test-Path $PythonVenv)) {
    Escrever-Erro "O ambiente ainda nao foi preparado. Rode primeiro: .\preparar.ps1"
    exit 1
}

function Invocar-Alembic([string[]]$Argumentos) {
    Push-Location $Backend
    # O Alembic escreve os INFO em stderr. Com ErrorActionPreference=Stop o
    # PowerShell trataria cada linha como erro fatal, entao afrouxamos aqui.
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # Out-Host manda a saida direto para a tela: se ela voltasse pelo
        # pipeline, o chamador teria de descarta-la junto com o codigo de saida.
        & $PythonVenv -m alembic @Argumentos | Out-Host
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $anterior
        Pop-Location
    }
}

switch ($Acao) {

    "aplicar" {
        Escrever-Titulo "Aplicando migracoes pendentes"
        $codigo = Invocar-Alembic @("upgrade", "head")
        if ($codigo -ne 0) { Escrever-Erro "Falha ao aplicar as migracoes"; exit 1 }
        Escrever-Ok "Banco atualizado"
    }

    "criar" {
        if (-not $Mensagem) {
            Escrever-Erro "Descreva a mudanca com -Mensagem"
            Write-Host '      Ex.: .\migrar.ps1 criar -Mensagem "adiciona campo observacao na venda"' -ForegroundColor Gray
            exit 1
        }
        Escrever-Titulo "Gerando migracao"
        Escrever-Aviso "O banco precisa estar na ultima versao para a comparacao sair certa"
        $codigo = Invocar-Alembic @("revision", "--autogenerate", "-m", $Mensagem)
        if ($codigo -ne 0) { Escrever-Erro "Falha ao gerar a migracao"; exit 1 }
        Escrever-Ok "Migracao criada em backend\migracoes\versions"
        Escrever-Aviso "Revise o arquivo antes de aplicar: o autogenerate erra em renomeacoes"
    }

    "status" {
        Escrever-Titulo "Versao atual do banco"
        $null = Invocar-Alembic @("current", "--verbose")
        Escrever-Titulo "Historico de migracoes"
        $null = Invocar-Alembic @("history", "--indicate-current")
    }

    "reverter" {
        Escrever-Titulo "Revertendo a ultima migracao"
        Escrever-Aviso "Isto pode apagar dados das colunas ou tabelas removidas"
        $resposta = Read-Host "  Digite REVERTER para confirmar"
        if ($resposta -ne "REVERTER") { Escrever-Passo "Cancelado"; exit 0 }
        $codigo = Invocar-Alembic @("downgrade", "-1")
        if ($codigo -ne 0) { Escrever-Erro "Falha ao reverter"; exit 1 }
        Escrever-Ok "Migracao revertida"
    }

    "sql" {
        Escrever-Titulo "SQL das migracoes pendentes (nada foi executado)"
        $null = Invocar-Alembic @("upgrade", "head", "--sql")
    }
}

Write-Host ""
