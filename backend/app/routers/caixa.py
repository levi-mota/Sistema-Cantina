"""Caixas (terminais) e sessoes: abertura, sangria/suprimento e fechamento.

A cantina pode ter varios caixas. Cada um tem a sua gaveta, o seu turno e o seu
fechamento; um operador opera um caixa por vez, e as vendas dele entram no turno
que ele abriu.
"""

from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.core.deps import DB, CurrentUser, Gestao
from app.services import caixa as servico

router = APIRouter(prefix="/api/caixa", tags=["caixa"])


# --------------------------------------------------------------------------- #
# Terminais
# --------------------------------------------------------------------------- #
@router.get("/terminais", response_model=list[schemas.CaixaTerminalOut])
def listar_terminais(db: DB, usuario: CurrentUser, apenas_ativos: bool = True):
    """Caixas cadastrados, com o turno aberto de cada um (se houver)."""
    stmt = select(models.Caixa)
    if apenas_ativos:
        stmt = stmt.where(models.Caixa.ativo.is_(True))
    terminais = db.scalars(stmt.order_by(models.Caixa.nome)).all()

    abertas = {s.caixa_id: s for s in servico.sessoes_abertas(db)}
    return [
        schemas.CaixaTerminalOut(
            id=t.id,
            nome=t.nome,
            descricao=t.descricao,
            ativo=t.ativo,
            sessao_id=abertas[t.id].id if t.id in abertas else None,
            sessao_operador=(
                abertas[t.id].usuario_abertura.nome
                if t.id in abertas and abertas[t.id].usuario_abertura
                else None
            ),
            sessao_aberta_em=abertas[t.id].aberto_em if t.id in abertas else None,
            minha_sessao=(
                t.id in abertas and abertas[t.id].usuario_abertura_id == usuario.id
            ),
        )
        for t in terminais
    ]


@router.post(
    "/terminais", response_model=schemas.CaixaTerminalOut, status_code=status.HTTP_201_CREATED
)
def criar_terminal(dados: schemas.CaixaIn, db: DB, _: Gestao):
    nome = dados.nome.strip()
    if db.scalar(select(models.Caixa).where(models.Caixa.nome == nome)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ja existe um caixa chamado '{nome}'")
    terminal = models.Caixa(**{**dados.model_dump(), "nome": nome})
    db.add(terminal)
    db.commit()
    db.refresh(terminal)
    return schemas.CaixaTerminalOut.model_validate(terminal)


@router.put("/terminais/{terminal_id}", response_model=schemas.CaixaTerminalOut)
def atualizar_terminal(terminal_id: int, dados: schemas.CaixaIn, db: DB, _: Gestao):
    terminal = db.get(models.Caixa, terminal_id)
    if not terminal:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Caixa nao encontrado")
    if not dados.ativo and servico.sessao_do_caixa(db, terminal_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Feche o turno deste caixa antes de desativa-lo"
        )
    for campo, valor in dados.model_dump().items():
        setattr(terminal, campo, valor)
    db.commit()
    db.refresh(terminal)
    return schemas.CaixaTerminalOut.model_validate(terminal)


# --------------------------------------------------------------------------- #
# Sessoes
# --------------------------------------------------------------------------- #
@router.get("/atual", response_model=schemas.CaixaOut | None)
def atual(db: DB, usuario: CurrentUser):
    """Turno que o operador logado tem aberto, ou `null`."""
    sessao = servico.sessao_do_usuario(db, usuario.id)
    return servico.montar_saida(db, sessao) if sessao else None


@router.get("/abertas", response_model=list[schemas.CaixaOut])
def abertas(db: DB, _: CurrentUser):
    """Todos os turnos abertos agora, para a gerencia acompanhar."""
    return [servico.montar_saida(db, s) for s in servico.sessoes_abertas(db)]


@router.get("/sessoes", response_model=list[schemas.CaixaOut])
def listar(
    db: DB,
    _: CurrentUser,
    caixa_id: int | None = None,
    inicio: date | None = None,
    fim: date | None = None,
    limite: int = 60,
):
    stmt = select(models.CaixaSessao)
    if caixa_id:
        stmt = stmt.where(models.CaixaSessao.caixa_id == caixa_id)
    if inicio:
        stmt = stmt.where(models.CaixaSessao.aberto_em >= datetime.combine(inicio, time.min))
    if fim:
        stmt = stmt.where(models.CaixaSessao.aberto_em <= datetime.combine(fim, time.max))
    sessoes = db.scalars(stmt.order_by(models.CaixaSessao.id.desc()).limit(limite)).all()
    # Sessoes fechadas ja guardam a conferencia congelada; nao recalculamos.
    return [
        servico.montar_saida(db, s, incluir_conferencia=s.status == models.StatusCaixa.ABERTA)
        for s in sessoes
    ]


@router.get("/sessoes/{sessao_id}", response_model=schemas.CaixaOut)
def obter(sessao_id: int, db: DB, _: CurrentUser):
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessao de caixa nao encontrada")
    return servico.montar_saida(db, sessao)


@router.post("/abrir", response_model=schemas.CaixaOut, status_code=status.HTTP_201_CREATED)
def abrir(dados: schemas.AberturaIn, db: DB, usuario: CurrentUser):
    terminal = db.get(models.Caixa, dados.caixa_id)
    if not terminal or not terminal.ativo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Caixa nao encontrado ou inativo")

    ocupado = servico.sessao_do_caixa(db, terminal.id)
    if ocupado:
        operador = ocupado.usuario_abertura.nome if ocupado.usuario_abertura else "outro operador"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"O caixa '{terminal.nome}' ja esta aberto por {operador}",
        )

    minha = servico.sessao_do_usuario(db, usuario.id)
    if minha:
        nome = minha.caixa.nome if minha.caixa else f"#{minha.caixa_id}"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Voce ja tem o caixa '{nome}' aberto. Feche-o antes de abrir outro.",
        )

    sessao = models.CaixaSessao(
        caixa_id=terminal.id,
        usuario_abertura_id=usuario.id,
        valor_abertura=dados.valor_abertura,
        observacao_abertura=dados.observacao,
    )
    db.add(sessao)
    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao)


@router.post("/movimentos", response_model=schemas.CaixaOut, status_code=status.HTTP_201_CREATED)
def lancar_movimento(dados: schemas.MovimentoCaixaIn, db: DB, usuario: CurrentUser):
    """Sangria (retirada) ou suprimento (reforco) na gaveta do proprio turno."""
    sessao = servico.exigir_sessao_do_usuario(db, usuario.id)

    if dados.tipo == models.TipoMovimentoCaixa.SANGRIA:
        disponivel = servico.conferir(db, sessao).valor_esperado
        if Decimal(str(dados.valor)) > disponivel:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Sangria maior que o disponivel na gaveta (R$ {disponivel})",
            )

    db.add(
        models.MovimentoCaixa(
            sessao_id=sessao.id,
            tipo=dados.tipo,
            valor=dados.valor,
            motivo=dados.motivo,
            usuario_id=usuario.id,
        )
    )
    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao)


@router.post("/fechar", response_model=schemas.CaixaOut)
def fechar(dados: schemas.FechamentoIn, db: DB, usuario: CurrentUser):
    """Confere o valor contado contra o esperado e congela a quebra do turno."""
    sessao = servico.exigir_sessao_do_usuario(db, usuario.id)
    conferencia = servico.conferir(db, sessao)

    informado = Decimal(str(dados.valor_informado))
    sessao.valor_informado = informado
    sessao.valor_esperado = conferencia.valor_esperado
    sessao.diferenca = informado - conferencia.valor_esperado
    sessao.observacao_fechamento = dados.observacao
    sessao.usuario_fechamento_id = usuario.id
    sessao.fechado_em = datetime.now(timezone.utc)
    sessao.status = models.StatusCaixa.FECHADA

    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao, incluir_conferencia=False)


@router.post("/sessoes/{sessao_id}/fechar-forcado", response_model=schemas.CaixaOut)
def fechar_forcado(sessao_id: int, dados: schemas.FechamentoIn, db: DB, gestor: Gestao):
    """Fecha o turno de outro operador (esqueceu de fechar, saiu do turno).

    Restrito a gerencia: e uma conferencia feita por terceiro, entao fica
    registrado quem fechou.
    """
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessao de caixa nao encontrada")
    if sessao.status == models.StatusCaixa.FECHADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este turno ja esta fechado")

    conferencia = servico.conferir(db, sessao)
    informado = Decimal(str(dados.valor_informado))
    sessao.valor_informado = informado
    sessao.valor_esperado = conferencia.valor_esperado
    sessao.diferenca = informado - conferencia.valor_esperado
    sessao.observacao_fechamento = dados.observacao
    sessao.usuario_fechamento_id = gestor.id
    sessao.fechado_em = datetime.now(timezone.utc)
    sessao.status = models.StatusCaixa.FECHADA

    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao, incluir_conferencia=False)


@router.post("/sessoes/{sessao_id}/reabrir", response_model=schemas.CaixaOut)
def reabrir(sessao_id: int, db: DB, _: Gestao):
    """Reabre um turno fechado por engano. Restrito a gerencia."""
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessao de caixa nao encontrada")
    if sessao.status == models.StatusCaixa.ABERTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta sessao ja esta aberta")

    if servico.sessao_do_caixa(db, sessao.caixa_id):
        nome = sessao.caixa.nome if sessao.caixa else f"#{sessao.caixa_id}"
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"O caixa '{nome}' ja tem um turno aberto"
        )
    if servico.sessao_do_usuario(db, sessao.usuario_abertura_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "O operador deste turno ja tem outro caixa aberto",
        )

    sessao.status = models.StatusCaixa.ABERTA
    sessao.fechado_em = None
    sessao.usuario_fechamento_id = None
    sessao.valor_informado = None
    sessao.valor_esperado = None
    sessao.diferenca = None
    db.commit()
    db.refresh(sessao)
    return servico.montar_saida(db, sessao)
