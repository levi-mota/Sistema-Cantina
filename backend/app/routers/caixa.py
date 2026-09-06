"""Caixas (terminais) e sessões: abertura, sangria/suprimento e fechamento.

A cantina pode ter varios caixas. Cada um tem a sua gaveta, o seu turno e o seu
fechamento; um operador opera um caixa por vez, e as vendas dele entram no turno
que ele abriu.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app import models, schemas
from app.core import tempo
from app.core.deps import DB, CurrentUser, SomenteAdmin
from app.services import caixa as servico

router = APIRouter(prefix="/api/caixa", tags=["caixa"])


def _e_gestor(usuario: models.Usuario) -> bool:
    return usuario.perfil == models.Perfil.ADMIN


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
def criar_terminal(dados: schemas.CaixaIn, db: DB, _: SomenteAdmin):
    nome = dados.nome.strip()
    if db.scalar(select(models.Caixa).where(models.Caixa.nome == nome)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Já existe um caixa chamado '{nome}'")
    terminal = models.Caixa(**{**dados.model_dump(), "nome": nome})
    db.add(terminal)
    db.commit()
    db.refresh(terminal)
    return schemas.CaixaTerminalOut.model_validate(terminal)


@router.put("/terminais/{terminal_id}", response_model=schemas.CaixaTerminalOut)
def atualizar_terminal(terminal_id: int, dados: schemas.CaixaIn, db: DB, _: SomenteAdmin):
    terminal = db.get(models.Caixa, terminal_id)
    if not terminal:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Caixa não encontrado")
    if not dados.ativo and servico.sessao_do_caixa(db, terminal_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Feche o turno deste caixa antes de desativá-lo"
        )
    for campo, valor in dados.model_dump().items():
        setattr(terminal, campo, valor)
    db.commit()
    db.refresh(terminal)
    return schemas.CaixaTerminalOut.model_validate(terminal)


@router.delete("/terminais/{terminal_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_terminal(terminal_id: int, db: DB, _: SomenteAdmin):
    """Apaga o caixa, desde que nunca tenha sido usado.

    Um caixa com turnos guarda a conferência daqueles turnos -- quanto foi
    contado, quanto faltou, quem operou --, que é justamente o registro que o
    módulo existe para manter. Nesse caso o caminho é desativar: ele sai da
    lista de escolha e o histórico continua de pé.
    """
    terminal = db.get(models.Caixa, terminal_id)
    if not terminal:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Caixa não encontrado")

    if servico.sessao_do_caixa(db, terminal_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Feche o turno aberto deste caixa antes de removê-lo"
        )

    turnos = db.scalar(
        select(func.count(models.CaixaSessao.id)).where(
            models.CaixaSessao.caixa_id == terminal_id
        )
    )
    if turnos:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Este caixa tem {turnos} turno(s) registrados e não pode ser apagado. "
            "Desative-o para tirá-lo da lista sem perder o histórico.",
        )

    db.delete(terminal)
    db.commit()


# --------------------------------------------------------------------------- #
# Sessoes
# --------------------------------------------------------------------------- #
@router.get("/atual", response_model=schemas.CaixaOut | None)
def atual(db: DB, usuario: CurrentUser):
    """Turno que o operador logado tem aberto, ou `null`."""
    sessao = servico.sessao_do_usuario(db, usuario.id)
    return servico.montar_saida(db, sessao) if sessao else None


@router.get("/abertas", response_model=list[schemas.CaixaOut])
def abertas(db: DB, usuario: CurrentUser):
    """Turnos abertos agora. A gerência vê todos; o operador, o seu."""
    sessoes = servico.sessoes_abertas(db)
    if not _e_gestor(usuario):
        sessoes = [s for s in sessoes if s.usuario_abertura_id == usuario.id]
    return [servico.montar_saida(db, s) for s in sessoes]


@router.get("/sessoes", response_model=list[schemas.CaixaOut])
def listar(
    db: DB,
    usuario: CurrentUser,
    caixa_id: int | None = None,
    inicio: date | None = None,
    fim: date | None = None,
    limite: int = 60,
):
    stmt = select(models.CaixaSessao)
    # A quebra de caixa de um operador e assunto dele com a gerencia, nao
    # material de conversa entre colegas.
    if not _e_gestor(usuario):
        stmt = stmt.where(models.CaixaSessao.usuario_abertura_id == usuario.id)
    if caixa_id:
        stmt = stmt.where(models.CaixaSessao.caixa_id == caixa_id)
    if inicio:
        stmt = stmt.where(models.CaixaSessao.aberto_em >= tempo.inicio_do_dia(inicio))
    if fim:
        stmt = stmt.where(models.CaixaSessao.aberto_em < tempo.fim_do_dia(fim))
    sessoes = db.scalars(stmt.order_by(models.CaixaSessao.id.desc()).limit(limite)).all()
    # Sessoes fechadas ja guardam a conferencia congelada; nao recalculamos.
    return [
        servico.montar_saida(db, s, incluir_conferencia=s.status == models.StatusCaixa.ABERTA)
        for s in sessoes
    ]


@router.get("/sessoes/{sessao_id}", response_model=schemas.CaixaOut)
def obter(sessao_id: int, db: DB, usuario: CurrentUser):
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao or (not _e_gestor(usuario) and sessao.usuario_abertura_id != usuario.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessão de caixa não encontrada")
    return servico.montar_saida(db, sessao)


@router.post("/abrir", response_model=schemas.CaixaOut, status_code=status.HTTP_201_CREATED)
def abrir(dados: schemas.AberturaIn, db: DB, usuario: CurrentUser):
    terminal = db.get(models.Caixa, dados.caixa_id)
    if not terminal or not terminal.ativo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Caixa não encontrado ou inativo")

    ocupado = servico.sessao_do_caixa(db, terminal.id)
    if ocupado:
        operador = ocupado.usuario_abertura.nome if ocupado.usuario_abertura else "outro operador"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"O caixa '{terminal.nome}' já está aberto por {operador}",
        )

    minha = servico.sessao_do_usuario(db, usuario.id)
    if minha:
        nome = minha.caixa.nome if minha.caixa else f"#{minha.caixa_id}"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Você já tem o caixa '{nome}' aberto. Feche-o antes de abrir outro.",
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
    """Sangria (retirada) ou suprimento (reforco) na gaveta do próprio turno."""
    sessao = servico.exigir_sessao_do_usuario(db, usuario.id)

    if dados.tipo == models.TipoMovimentoCaixa.SANGRIA:
        disponivel = servico.conferir(db, sessao).valor_esperado
        if Decimal(str(dados.valor)) > disponivel:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Sangria maior que o disponível na gaveta (R$ {disponivel})",
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


def _congelar_fechamento(
    db: DB, sessao: models.CaixaSessao, dados: schemas.FechamentoIn, por: models.Usuario
) -> schemas.CaixaOut:
    """Confere o contado contra o esperado e congela a quebra do turno."""
    conferencia = servico.conferir(db, sessao)
    informado = Decimal(str(dados.valor_informado))

    sessao.valor_informado = informado
    sessao.valor_esperado = conferencia.valor_esperado
    sessao.diferenca = informado - conferencia.valor_esperado
    sessao.observacao_fechamento = dados.observacao
    sessao.usuario_fechamento_id = por.id
    sessao.fechado_em = datetime.now(timezone.utc)
    sessao.status = models.StatusCaixa.FECHADA

    db.commit()
    db.refresh(sessao)
    # A conferencia ja esta congelada nas colunas; recalcular seria repeti-la.
    return servico.montar_saida(db, sessao, incluir_conferencia=False)


@router.post("/fechar", response_model=schemas.CaixaOut)
def fechar(dados: schemas.FechamentoIn, db: DB, usuario: CurrentUser):
    """Fecha o próprio turno."""
    sessao = servico.exigir_sessao_do_usuario(db, usuario.id)
    return _congelar_fechamento(db, sessao, dados, usuario)


@router.post("/sessoes/{sessao_id}/fechar-forcado", response_model=schemas.CaixaOut)
def fechar_forcado(sessao_id: int, dados: schemas.FechamentoIn, db: DB, gestor: SomenteAdmin):
    """Fecha o turno de outro operador (esqueceu de fechar, saiu do turno).

    Restrito a gerencia: é uma conferência feita por terceiro, entao fica
    registrado quem fechou.
    """
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessão de caixa não encontrada")
    if sessao.status == models.StatusCaixa.FECHADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este turno já está fechado")
    return _congelar_fechamento(db, sessao, dados, gestor)


@router.post("/sessoes/{sessao_id}/reabrir", response_model=schemas.CaixaOut)
def reabrir(sessao_id: int, db: DB, _: SomenteAdmin):
    """Reabre um turno fechado por engano. Restrito a gerencia."""
    sessao = db.get(models.CaixaSessao, sessao_id)
    if not sessao:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessão de caixa não encontrada")
    if sessao.status == models.StatusCaixa.ABERTA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta sessão já está aberta")

    if servico.sessao_do_caixa(db, sessao.caixa_id):
        nome = sessao.caixa.nome if sessao.caixa else f"#{sessao.caixa_id}"
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"O caixa '{nome}' já tem um turno aberto"
        )
    if servico.sessao_do_usuario(db, sessao.usuario_abertura_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "O operador deste turno já tem outro caixa aberto",
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
