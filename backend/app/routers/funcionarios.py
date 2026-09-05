"""Controle de funcionarios: cadastro, perfis de acesso e registro de ponto."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select

from app import models, schemas
from app.core.deps import DB, CurrentUser, Gestao
from app.core.security import hash_password

router = APIRouter(prefix="/api/funcionarios", tags=["funcionarios"])


def _ponto_out(p: models.RegistroPonto) -> schemas.PontoOut:
    return schemas.PontoOut(
        id=p.id,
        usuario_id=p.usuario_id,
        data=p.data,
        entrada=p.entrada,
        saida=p.saida,
        observacao=p.observacao,
        usuario_nome=p.usuario.nome if p.usuario else None,
    )


@router.get("", response_model=list[schemas.UsuarioOut])
def listar(
    db: DB,
    _: Gestao,
    busca: str | None = None,
    ativo: bool | None = None,
):
    stmt = select(models.Usuario)
    if busca:
        alvo = f"%{busca}%"
        stmt = stmt.where(
            or_(models.Usuario.nome.ilike(alvo), models.Usuario.email.ilike(alvo))
        )
    if ativo is not None:
        stmt = stmt.where(models.Usuario.ativo.is_(ativo))
    return db.scalars(stmt.order_by(models.Usuario.nome)).all()


@router.post("", response_model=schemas.UsuarioOut, status_code=status.HTTP_201_CREATED)
def criar(dados: schemas.UsuarioCreate, db: DB, _: Gestao):
    email = dados.email.lower().strip()
    if db.scalar(select(models.Usuario).where(models.Usuario.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ja existe um usuario com este e-mail")

    payload = dados.model_dump(exclude={"senha", "email"})
    usuario = models.Usuario(**payload, email=email, senha_hash=hash_password(dados.senha))
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.get("/{usuario_id}", response_model=schemas.UsuarioOut)
def obter(usuario_id: int, db: DB, _: Gestao):
    usuario = db.get(models.Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funcionario nao encontrado")
    return usuario


@router.put("/{usuario_id}", response_model=schemas.UsuarioOut)
def atualizar(usuario_id: int, dados: schemas.UsuarioUpdate, db: DB, _: Gestao):
    usuario = db.get(models.Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funcionario nao encontrado")

    campos = dados.model_dump(exclude_unset=True)
    if senha := campos.pop("senha", None):
        usuario.senha_hash = hash_password(senha)
    if email := campos.pop("email", None):
        email = email.lower().strip()
        existente = db.scalar(select(models.Usuario).where(models.Usuario.email == email))
        if existente and existente.id != usuario.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "E-mail ja utilizado")
        usuario.email = email

    for campo, valor in campos.items():
        setattr(usuario, campo, valor)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar(usuario_id: int, db: DB, gestor: Gestao):
    usuario = db.get(models.Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funcionario nao encontrado")
    if usuario.id == gestor.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Voce nao pode desativar a si mesmo")
    usuario.ativo = False
    db.commit()


# --------------------------------------------------------------------------- #
# Ponto
# --------------------------------------------------------------------------- #
@router.get("/ponto/registros", response_model=list[schemas.PontoOut])
def listar_ponto(
    db: DB,
    _: Gestao,
    usuario_id: int | None = None,
    inicio: date | None = None,
    fim: date | None = None,
):
    stmt = select(models.RegistroPonto)
    if usuario_id:
        stmt = stmt.where(models.RegistroPonto.usuario_id == usuario_id)
    if inicio:
        stmt = stmt.where(models.RegistroPonto.data >= inicio)
    if fim:
        stmt = stmt.where(models.RegistroPonto.data <= fim)
    registros = db.scalars(stmt.order_by(models.RegistroPonto.data.desc())).all()
    return [_ponto_out(r) for r in registros]


@router.post("/ponto/bater", response_model=schemas.PontoOut)
def bater_ponto(db: DB, usuario: CurrentUser, usuario_id: int | None = Query(default=None)):
    """Registra entrada na primeira batida do dia e saida na segunda."""
    alvo_id = usuario_id or usuario.id
    if alvo_id != usuario.id and usuario.perfil == models.Perfil.OPERADOR:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Voce so pode bater o proprio ponto")

    hoje = date.today()
    registro = db.scalar(
        select(models.RegistroPonto).where(
            models.RegistroPonto.usuario_id == alvo_id,
            models.RegistroPonto.data == hoje,
        )
    )
    agora = datetime.now(timezone.utc)
    if not registro:
        registro = models.RegistroPonto(usuario_id=alvo_id, data=hoje, entrada=agora)
        db.add(registro)
    elif registro.saida is None:
        registro.saida = agora
    else:
        raise HTTPException(status.HTTP_409_CONFLICT, "Entrada e saida ja registradas hoje")

    db.commit()
    db.refresh(registro)
    return _ponto_out(registro)


@router.put("/ponto/{registro_id}", response_model=schemas.PontoOut)
def ajustar_ponto(registro_id: int, dados: schemas.PontoIn, db: DB, _: Gestao):
    registro = db.get(models.RegistroPonto, registro_id)
    if not registro:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registro nao encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(registro, campo, valor)
    db.commit()
    db.refresh(registro)
    return _ponto_out(registro)
