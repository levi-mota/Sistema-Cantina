"""Regras de movimentação de estoque, usadas pelo modulo de estoque e pelo PDV."""

from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app import models

ENTRADAS = {models.TipoMovimento.ENTRADA}
SAIDAS = {models.TipoMovimento.SAIDA, models.TipoMovimento.PERDA}


def movimentar(
    db: Session,
    *,
    produto: models.Produto,
    tipo: models.TipoMovimento,
    quantidade: Decimal,
    custo_unitario: Decimal | None = None,
    motivo: str | None = None,
    venda_id: int | None = None,
    usuario_id: int | None = None,
    permitir_negativo: bool = False,
) -> models.MovimentoEstoque:
    """Aplica um movimento ao produto e registra o histórico (kardex)."""
    quantidade = Decimal(str(quantidade))
    atual = Decimal(str(produto.estoque_atual or 0))

    if tipo in SAIDAS and not permitir_negativo:
        # Conferir em Python e gravar depois abre uma janela entre a leitura e a
        # escrita: dois caixas vendendo a ultima unidade ao mesmo tempo leriam o
        # mesmo saldo e ambos passariam. Quem decide aqui e o banco, numa
        # instrucao so -- se ninguem casa a condicao, nao havia saldo.
        resultado = db.execute(
            update(models.Produto)
            .where(
                models.Produto.id == produto.id,
                models.Produto.estoque_atual >= float(quantidade),
            )
            .values(estoque_atual=models.Produto.estoque_atual - float(quantidade))
            .execution_options(synchronize_session=False)
        )
        if resultado.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Estoque insuficiente para '{produto.nome}': "
                    f"disponível {atual}, solicitado {quantidade}"
                ),
            )
        # O saldo real e o que ficou no banco, nao o que estava em memoria.
        db.refresh(produto)
        novo_saldo = Decimal(str(produto.estoque_atual or 0))
        atual = novo_saldo + quantidade
    else:
        if tipo in ENTRADAS:
            novo_saldo = atual + quantidade
        elif tipo in SAIDAS:
            novo_saldo = atual - quantidade
        else:  # AJUSTE define o saldo absoluto
            novo_saldo = quantidade
        produto.estoque_atual = novo_saldo

    # Entradas recalculam o custo medio ponderado.
    if tipo in ENTRADAS and custo_unitario is not None and novo_saldo > 0:
        custo_atual = Decimal(str(produto.preco_custo or 0))
        total_anterior = custo_atual * max(atual, Decimal("0"))
        total_entrada = Decimal(str(custo_unitario)) * quantidade
        produto.preco_custo = (total_anterior + total_entrada) / novo_saldo

    movimento = models.MovimentoEstoque(
        produto_id=produto.id,
        tipo=tipo,
        quantidade=quantidade,
        saldo_apos=novo_saldo,
        custo_unitario=custo_unitario,
        motivo=motivo,
        venda_id=venda_id,
        usuario_id=usuario_id,
    )
    db.add(movimento)
    return movimento
