"""Gera dados de teste em cima do que já existe no banco.

Diferente do `seed.py`, que monta uma demonstração do zero, este script **soma**
volume ao banco atual: mantém os usuários, os caixas e os produtos que já estão
lá e acrescenta cadastros, estoque, vendas, turnos, contas e listas de compra
espalhados pelos últimos 90 dias.

Serve para testar as telas com movimento de verdade -- gráficos com curva,
relatórios com números, estoque com itens no limite. Rodar de novo acrescenta
mais um período; nada é apagado.

Uso:  .venv/Scripts/python dados_teste.py [dias] [operadores]
"""

import random
import secrets
import sys
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app import models
from app.core import migracoes
from app.core.database import SessionLocal
from app.services.caixa import conferir
from app.services.documento import _digito
from app.core.security import hash_password
from app.services.estoque import movimentar

# nome, login. Todos entram como USUARIO, com a senha abaixo.
OPERADORES = [
    ("Ana Souza", "ana"),
    ("Bruno Alves", "bruno"),
    ("Carla Dias", "carla"),
    ("Diego Ramos", "diego"),
]
# Sorteada a cada execucao e mostrada uma vez no fim: senha fixa em script de
# teste vira usuario permanente com senha publicada -- e ja aconteceu.
SENHA_OPERADORES = secrets.token_urlsafe(9)

CATEGORIAS = ["Salgados", "Bebidas", "Doces", "Lanches", "Mercearia", "Porções"]

# codigo, nome, categoria, custo, venda, estoque minimo
PRODUTOS = [
    ("SAL001", "Coxinha de frango", "Salgados", "3.20", "6.50", 10),
    ("SAL002", "Pão de queijo", "Salgados", "1.80", "4.00", 15),
    ("SAL003", "Empada de palmito", "Salgados", "3.50", "7.00", 8),
    ("SAL004", "Esfiha de carne", "Salgados", "3.00", "6.00", 10),
    ("SAL005", "Enroladinho de salsicha", "Salgados", "2.40", "5.00", 12),
    ("SAL006", "Torta de frango (fatia)", "Salgados", "4.00", "8.50", 6),
    ("BEB001", "Refrigerante lata 350ml", "Bebidas", "2.60", "5.50", 24),
    ("BEB002", "Suco natural 300ml", "Bebidas", "3.00", "7.00", 10),
    ("BEB003", "Água mineral 500ml", "Bebidas", "1.20", "3.00", 24),
    ("BEB004", "Café expresso", "Bebidas", "1.10", "4.00", 30),
    ("BEB005", "Achocolatado 200ml", "Bebidas", "2.20", "4.50", 18),
    ("BEB006", "Chá gelado 300ml", "Bebidas", "2.40", "5.00", 12),
    ("DOC001", "Brigadeiro", "Doces", "1.50", "3.50", 12),
    ("DOC002", "Bolo de cenoura (fatia)", "Doces", "2.20", "6.00", 6),
    ("DOC003", "Pudim (fatia)", "Doces", "2.80", "6.50", 5),
    ("DOC004", "Cookie de chocolate", "Doces", "1.90", "4.50", 10),
    ("DOC005", "Sonho de creme", "Doces", "2.60", "6.00", 8),
    ("LAN001", "Misto quente", "Lanches", "4.50", "9.50", 5),
    ("LAN002", "Sanduíche natural", "Lanches", "5.00", "11.00", 5),
    ("LAN003", "Hambúrguer simples", "Lanches", "6.50", "14.00", 5),
    ("LAN004", "Tapioca de queijo", "Lanches", "3.80", "9.00", 6),
    ("MER001", "Barra de cereal", "Mercearia", "1.90", "4.50", 10),
    ("MER002", "Salgadinho pacote", "Mercearia", "2.30", "5.50", 12),
    ("MER003", "Chiclete", "Mercearia", "0.60", "1.50", 20),
    ("MER004", "Bala de goma", "Mercearia", "0.80", "2.00", 20),
    ("POR001", "Porção de batata frita", "Porções", "7.00", "16.00", 4),
    ("POR002", "Porção de polenta", "Porções", "6.00", "14.00", 4),
]

FORNECEDORES = [
    ("Distribuidora Bom Sabor LTDA", "Bom Sabor", "1133224455", "São Paulo", "SP"),
    ("Bebidas Central S.A.", "Central Bebidas", "1144556677", "Guarulhos", "SP"),
    ("Panificadora Trigo de Ouro", "Trigo de Ouro", "1132147788", "São Paulo", "SP"),
    ("Atacado Pontual Alimentos", "Pontual", "1139998877", "Osasco", "SP"),
]

CLIENTES = [
    "João Pereira", "Ana Clara Martins", "Roberto Nunes", "Fernanda Lima",
    "Escola Municipal Vila Nova", "Creche Passo Firme", "Marcos Andrade",
]

DESPESAS = [
    ("Aluguel do ponto", "Ocupação", "3500.00"),
    ("Energia elétrica", "Utilidades", "820.45"),
    ("Água e esgoto", "Utilidades", "180.30"),
    ("Internet e telefone", "Utilidades", "199.90"),
    ("Folha de pagamento", "Pessoal", "8400.00"),
    ("Gás de cozinha", "Insumos", "310.00"),
    ("Material de limpeza", "Insumos", "245.80"),
    ("Simples Nacional", "Impostos", "1120.00"),
]

RECEBIMENTOS = [
    ("Coffee break reunião de pais", "Eventos", "480.00"),
    ("Lanches da formatura", "Eventos", "1250.00"),
    ("Encomenda de salgados", "Serviços", "320.00"),
    ("Kit lanche excursão", "Eventos", "890.00"),
]

MOTIVOS_QUEBRA = [
    "Erro de troco no pico do intervalo",
    "Conferido com o gerente",
    "Nota de 10 a menos na gaveta",
    "Diferença não identificada",
]


def cpf_valido() -> str:
    base = "".join(random.choice("0123456789") for _ in range(9))
    d1 = _digito(base, list(range(10, 1, -1)))
    return base + d1 + _digito(base + d1, list(range(11, 1, -1)))


def cnpj_valido() -> str:
    base = "".join(random.choice("0123456789") for _ in range(8)) + "0001"
    pesos = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    d1 = _digito(base, pesos)
    return base + d1 + _digito(base + d1, [6] + pesos)


def em(dias_atras: int, hora: int, minuto: int = 0) -> datetime:
    """Um instante de um dia passado, em UTC."""
    alvo = datetime.now(timezone.utc) - timedelta(days=dias_atras)
    return alvo.replace(hour=hora, minute=minuto, second=0, microsecond=0)


def garantir_categorias(db) -> dict[str, models.Categoria]:
    existentes = {c.nome: c for c in db.scalars(select(models.Categoria)).all()}
    for nome in CATEGORIAS:
        if nome not in existentes:
            c = models.Categoria(nome=nome)
            db.add(c)
            existentes[nome] = c
    db.flush()
    return existentes


def garantir_parceiros(db) -> tuple[list, list]:
    fornecedores, clientes = [], []

    for nome, fantasia, telefone, cidade, uf in FORNECEDORES:
        p = db.scalar(select(models.Parceiro).where(models.Parceiro.nome == nome))
        if not p:
            p = models.Parceiro(
                tipo=models.TipoParceiro.FORNECEDOR,
                tipo_pessoa=models.TipoPessoa.JURIDICA,
                nome=nome,
                nome_fantasia=fantasia,
                documento=cnpj_valido(),
                telefone=telefone,
                cidade=cidade,
                uf=uf,
            )
            db.add(p)
        fornecedores.append(p)

    for nome in CLIENTES:
        p = db.scalar(select(models.Parceiro).where(models.Parceiro.nome == nome))
        if not p:
            juridica = "Escola" in nome or "Creche" in nome
            p = models.Parceiro(
                tipo=models.TipoParceiro.CLIENTE,
                tipo_pessoa=models.TipoPessoa.JURIDICA if juridica else models.TipoPessoa.FISICA,
                nome=nome,
                documento=cnpj_valido() if juridica else cpf_valido(),
                telefone=f"119{random.randint(10000000, 99999999)}",
            )
            db.add(p)
        clientes.append(p)

    db.flush()
    return fornecedores, clientes


def garantir_produtos(db, categorias, fornecedores, usuario_id: int) -> list:
    produtos = list(db.scalars(select(models.Produto)).all())
    existentes = {p.codigo for p in produtos if p.codigo}

    for codigo, nome, categoria, custo, venda, minimo in PRODUTOS:
        if codigo in existentes:
            continue
        p = models.Produto(
            codigo=codigo,
            nome=nome,
            categoria_id=categorias[categoria].id,
            fornecedor_id=random.choice(fornecedores).id,
            unidade="UN",
            preco_custo=Decimal(custo),
            preco_venda=Decimal(venda),
            estoque_minimo=Decimal(minimo),
        )
        db.add(p)
        db.flush()
        movimentar(
            db,
            produto=p,
            tipo=models.TipoMovimento.ENTRADA,
            quantidade=Decimal(minimo * random.randint(3, 6)),
            custo_unitario=p.preco_custo,
            motivo="Carga inicial",
            usuario_id=usuario_id,
        )
        produtos.append(p)

    db.flush()
    return produtos


def garantir_operadores(db, quantidade: int) -> list:
    """Cria os operadores que faltam e devolve a equipe que opera os caixas.

    O administrador entra na escala junto: numa cantina pequena quem administra
    também fica no balcão, e assim os dois caixas do mesmo dia nunca caem na
    mesma pessoa.
    """
    equipe = [db.scalar(select(models.Usuario).order_by(models.Usuario.id))]

    for nome, login in OPERADORES[:quantidade]:
        usuario = db.scalar(select(models.Usuario).where(models.Usuario.usuario == login))
        if not usuario:
            usuario = models.Usuario(
                nome=nome,
                usuario=login,
                senha_hash=hash_password(SENHA_OPERADORES),
                perfil=models.Perfil.USUARIO,
            )
            db.add(usuario)
            print(f"  operador criado: {login}")
        equipe.append(usuario)

    db.flush()
    return equipe


def redistribuir_turnos(db, equipe) -> None:
    """Espalha entre a equipe os turnos que hoje pertencem a uma pessoa só.

    Sem isso, o histórico gerado antes de existirem operadores deixaria o
    relatório de quebras com uma linha só. As vendas e os movimentos de caixa
    acompanham o dono do turno, senão a venda ficaria no nome de quem não
    estava na gaveta.
    """
    if len(equipe) < 2:
        return

    donos = {
        d for (d,) in db.execute(select(models.CaixaSessao.usuario_abertura_id).distinct()).all()
    }
    if len(donos) > 1:
        return  # o histórico já tem mais de um operador

    sessoes = db.scalars(
        select(models.CaixaSessao).order_by(models.CaixaSessao.aberto_em, models.CaixaSessao.id)
    ).all()

    # O turno aberto fica com quem já o abriu: mexer nele confundiria o PDV.
    ajustadas = 0
    for indice, sessao in enumerate(s for s in sessoes if s.status == models.StatusCaixa.FECHADA):
        novo = equipe[indice % len(equipe)]
        if sessao.usuario_abertura_id == novo.id:
            continue
        sessao.usuario_abertura_id = novo.id
        if sessao.usuario_fechamento_id is not None:
            sessao.usuario_fechamento_id = novo.id
        db.execute(
            models.Venda.__table__.update()
            .where(models.Venda.caixa_sessao_id == sessao.id)
            .values(usuario_id=novo.id)
        )
        db.execute(
            models.MovimentoCaixa.__table__.update()
            .where(models.MovimentoCaixa.sessao_id == sessao.id)
            .values(usuario_id=novo.id)
        )
        ajustadas += 1

    if ajustadas:
        db.flush()
        print(f"  {ajustadas} turno(s) do histórico redistribuídos entre a equipe")


def fechar_turnos_pendentes(db, operador) -> None:
    """Fecha turnos que já estavam abertos antes desta geração.

    Um caixa aceita um turno aberto por vez, e um operador também. Se o banco
    já tinha um turno aberto (alguém testando), ele precisa ser fechado antes
    -- senão sobram dois abertos, situação que a API nunca produziria.
    """
    abertos = db.scalars(
        select(models.CaixaSessao).where(
            models.CaixaSessao.status == models.StatusCaixa.ABERTA
        )
    ).all()
    for sessao in abertos:
        conferencia = conferir(db, sessao)
        sessao.status = models.StatusCaixa.FECHADA
        sessao.fechado_em = datetime.now(timezone.utc)
        sessao.usuario_fechamento_id = operador.id
        sessao.valor_esperado = conferencia.valor_esperado
        sessao.valor_informado = conferencia.valor_esperado
        sessao.diferenca = Decimal("0.00")
        sessao.observacao_fechamento = "Fechado ao gerar dados de teste"
    if abertos:
        db.flush()
        print(f"  {len(abertos)} turno(s) que estavam abertos foram fechados antes")


def garantir_caixas(db) -> list:
    caixas = list(db.scalars(select(models.Caixa).order_by(models.Caixa.id)).all())
    if len(caixas) < 2:
        segundo = models.Caixa(nome="Caixa 2", descricao="Balcão do pátio (pico do intervalo)")
        db.add(segundo)
        db.flush()
        caixas.append(segundo)
    return caixas


def gerar_movimento(db, dias: int, produtos, caixas, equipe, clientes) -> None:
    """Turnos e vendas espalhados pelos últimos `dias` dias."""
    documentos = [cpf_valido() for _ in range(6)]
    formas = [models.FormaPagamento.DINHEIRO, models.FormaPagamento.PIX]

    for dias_atras in range(dias - 1, -1, -1):
        dia_semana = (datetime.now(timezone.utc) - timedelta(days=dias_atras)).weekday()
        if dia_semana == 6:
            continue  # domingo fechado

        # Movimento maior no meio da semana; sábado mais fraco
        peso = 0.6 if dia_semana == 5 else random.uniform(0.9, 1.4)
        turnos = [(caixas[0], 7, 13)]
        if peso > 1.1 and len(caixas) > 1:
            turnos.append((caixas[1], 13, 19))

        for indice, (caixa, inicio, fim) in enumerate(turnos):
            # Reveza a equipe: no mesmo dia, cada caixa fica com uma pessoa.
            operador = equipe[(dias_atras + indice) % len(equipe)]
            aberto = dias_atras == 0 and caixa is caixas[0]
            sessao = models.CaixaSessao(
                caixa_id=caixa.id,
                status=models.StatusCaixa.ABERTA,
                usuario_abertura_id=operador.id,
                aberto_em=em(dias_atras, inicio),
                valor_abertura=Decimal("100.00"),
                observacao_abertura="Abertura do turno",
            )
            db.add(sessao)
            db.flush()

            for _ in range(int(random.randint(6, 18) * peso)):
                forma = random.choices(formas, weights=[55, 45])[0]
                cliente = random.choice(clientes) if random.random() < 0.06 else None
                documento = (
                    cliente.documento
                    if cliente
                    else (random.choice(documentos) if random.random() < 0.2 else None)
                )
                venda = models.Venda(
                    cliente_id=cliente.id if cliente else None,
                    documento_cliente=documento,
                    usuario_id=operador.id,
                    caixa_sessao_id=sessao.id,
                    forma_pagamento=forma,
                    criado_em=em(dias_atras, random.randint(inicio, fim - 1), random.randint(0, 59)),
                )
                db.add(venda)
                db.flush()

                subtotal = Decimal("0")
                for produto in random.sample(produtos, random.randint(1, 4)):
                    quantidade = Decimal(random.randint(1, 3))
                    if Decimal(str(produto.estoque_atual)) < quantidade:
                        movimentar(
                            db,
                            produto=produto,
                            tipo=models.TipoMovimento.ENTRADA,
                            quantidade=Decimal(str(produto.estoque_minimo or 10)) * 4,
                            custo_unitario=produto.preco_custo,
                            motivo="Reposição do fornecedor",
                            usuario_id=operador.id,
                        )
                    preco = Decimal(str(produto.preco_venda))
                    total = preco * quantidade
                    subtotal += total
                    db.add(
                        models.VendaItem(
                            venda_id=venda.id,
                            produto_id=produto.id,
                            descricao=produto.nome,
                            quantidade=quantidade,
                            preco_unitario=preco,
                            custo_unitario=Decimal(str(produto.preco_custo)),
                            total=total,
                        )
                    )
                    movimentar(
                        db,
                        produto=produto,
                        tipo=models.TipoMovimento.SAIDA,
                        quantidade=quantidade,
                        motivo=f"Venda #{venda.id}",
                        venda_id=venda.id,
                        usuario_id=operador.id,
                    )

                venda.subtotal = subtotal
                venda.total = subtotal
                if forma == models.FormaPagamento.DINHEIRO:
                    recebido = Decimal(max(5 * round(float(subtotal) / 5 + 0.5), 5))
                    venda.valor_recebido = recebido
                    venda.troco = recebido - subtotal
                else:
                    venda.valor_recebido = subtotal

            # Sangria quando a gaveta enche
            if random.random() < 0.25:
                db.add(
                    models.MovimentoCaixa(
                        sessao_id=sessao.id,
                        tipo=models.TipoMovimentoCaixa.SANGRIA,
                        valor=Decimal(random.choice([50, 100, 150])),
                        motivo="Retirada para o cofre",
                        usuario_id=operador.id,
                        criado_em=em(dias_atras, fim - 1),
                    )
                )
            db.flush()

            if aberto:
                continue  # o turno de hoje fica aberto, para o PDV funcionar

            conferencia = conferir(db, sessao)
            sorteio = random.random()
            if sorteio < 0.7:
                quebra = Decimal("0.00")
            elif sorteio < 0.92:
                quebra = Decimal(str(-round(random.uniform(0.5, 12), 2)))
            else:
                quebra = Decimal(str(round(random.uniform(0.5, 6), 2)))

            sessao.status = models.StatusCaixa.FECHADA
            sessao.fechado_em = em(dias_atras, fim)
            sessao.usuario_fechamento_id = operador.id
            sessao.valor_esperado = conferencia.valor_esperado
            sessao.valor_informado = conferencia.valor_esperado + quebra
            sessao.diferenca = quebra
            if quebra != 0:
                sessao.observacao_fechamento = random.choice(MOTIVOS_QUEBRA)


def gerar_financeiro(db, fornecedores, clientes) -> None:
    hoje = date.today()

    for descricao, categoria, valor in DESPESAS:
        for mes in (-1, 0, 1):
            vencimento = hoje.replace(day=min(hoje.day, 28)) + timedelta(days=30 * mes)
            titulo = models.Titulo(
                tipo=models.TipoTitulo.PAGAR,
                descricao=f"{descricao} ({vencimento.strftime('%m/%Y')})",
                categoria=categoria,
                parceiro_id=random.choice(fornecedores).id if categoria == "Mercadorias" else None,
                valor=Decimal(valor),
                vencimento=vencimento,
            )
            if mes == -1:  # o mês passado já foi pago
                titulo.status = models.StatusTitulo.PAGO
                titulo.valor_pago = titulo.valor
                titulo.quitado_em = vencimento
                titulo.forma_pagamento = models.FormaPagamento.PIX
            db.add(titulo)

    # Compras de mercadoria a prazo
    for fornecedor in fornecedores:
        db.add(
            models.Titulo(
                tipo=models.TipoTitulo.PAGAR,
                descricao=f"Compra de mercadorias - {fornecedor.nome_fantasia or fornecedor.nome}",
                categoria="Mercadorias",
                parceiro_id=fornecedor.id,
                valor=Decimal(str(round(random.uniform(400, 2600), 2))),
                vencimento=hoje + timedelta(days=random.randint(-12, 25)),
            )
        )

    for descricao, categoria, valor in RECEBIMENTOS:
        titulo = models.Titulo(
            tipo=models.TipoTitulo.RECEBER,
            descricao=descricao,
            categoria=categoria,
            parceiro_id=random.choice(clientes).id,
            valor=Decimal(valor),
            vencimento=hoje + timedelta(days=random.randint(-8, 20)),
        )
        if random.random() < 0.3:
            titulo.status = models.StatusTitulo.PARCIAL
            titulo.valor_pago = (titulo.valor / 2).quantize(Decimal("0.01"))
        db.add(titulo)


def gerar_compras(db, produtos, usuario_id: int) -> None:
    criticos = [p for p in produtos if Decimal(str(p.estoque_atual)) <= Decimal(str(p.estoque_minimo))]
    base = criticos or random.sample(produtos, min(6, len(produtos)))

    for titulo, status, dias_atras in (
        ("Compras da semana", models.StatusCompra.CONCLUIDA, 12),
        ("Reposição do mês", models.StatusCompra.ENVIADA, 4),
        ("Lista em aberto", models.StatusCompra.RASCUNHO, 0),
    ):
        lista = models.ListaCompra(
            titulo=titulo,
            status=status,
            comprador=random.choice(["Levi", "Marina", "Comprador da unidade"]),
            usuario_id=usuario_id,
            criado_em=em(dias_atras, 9),
            enviada_em=em(dias_atras, 10) if status != models.StatusCompra.RASCUNHO else None,
            concluida_em=em(max(dias_atras - 2, 0), 15)
            if status == models.StatusCompra.CONCLUIDA
            else None,
        )
        db.add(lista)
        db.flush()
        for produto in random.sample(base, min(len(base), random.randint(3, 7))):
            minimo = Decimal(str(produto.estoque_minimo or 10))
            lista.itens.append(
                models.ItemListaCompra(
                    produto_id=produto.id,
                    quantidade=minimo * 2,
                    custo_estimado=Decimal(str(produto.preco_custo)),
                    estoque_no_momento=Decimal(str(produto.estoque_atual)),
                )
            )


def executar(dias: int = 90, operadores: int = 3) -> None:
    migracoes.aplicar()
    db = SessionLocal()

    operador = db.scalar(select(models.Usuario).order_by(models.Usuario.id))
    if not operador:
        print("Nenhum usuário no banco. Suba a aplicação uma vez para criar o admin.")
        return

    print(f"Gerando dados de teste dos últimos {dias} dias...")
    equipe = garantir_operadores(db, operadores)
    redistribuir_turnos(db, equipe)
    fechar_turnos_pendentes(db, operador)
    categorias = garantir_categorias(db)
    fornecedores, clientes = garantir_parceiros(db)
    produtos = garantir_produtos(db, categorias, fornecedores, operador.id)
    caixas = garantir_caixas(db)

    gerar_movimento(db, dias, produtos, caixas, equipe, clientes)
    gerar_financeiro(db, fornecedores, clientes)
    db.flush()
    gerar_compras(db, produtos, operador.id)

    # Deixa alguns produtos no limite, para o estoque crítico ter o que mostrar
    for produto in random.sample(produtos, min(4, len(produtos))):
        alvo = Decimal(str(produto.estoque_minimo or 5)) - Decimal(random.randint(0, 3))
        atual = Decimal(str(produto.estoque_atual))
        if atual > alvo:
            movimentar(
                db,
                produto=produto,
                tipo=models.TipoMovimento.SAIDA,
                quantidade=atual - max(alvo, Decimal("0")),
                motivo="Consumo interno",
                usuario_id=operador.id,
            )

    db.commit()

    def contar(modelo) -> int:
        return db.query(modelo).count()

    print(f"\nSenha dos operadores desta execução: {SENHA_OPERADORES}")
    print("Anote agora -- ela não volta a aparecer. E desative esses usuários")
    print("antes de o sistema entrar em uso: são contas de teste.")

    print("\nBanco agora tem:")
    for rotulo, modelo in (
        ("produtos", models.Produto),
        ("parceiros", models.Parceiro),
        ("vendas", models.Venda),
        ("itens vendidos", models.VendaItem),
        ("turnos de caixa", models.CaixaSessao),
        ("títulos", models.Titulo),
        ("listas de compra", models.ListaCompra),
        ("movimentos de estoque", models.MovimentoEstoque),
    ):
        print(f"  {rotulo:24} {contar(modelo):>6}")
    db.close()


if __name__ == "__main__":
    dias = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    operadores = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    executar(dias, operadores)
