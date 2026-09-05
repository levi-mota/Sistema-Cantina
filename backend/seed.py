"""Popula o banco com dados de demonstracao.

Uso:  .venv/Scripts/python seed.py
"""

import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app import models
from app.core import migracoes
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.services.estoque import movimentar

CATEGORIAS = ["Salgados", "Bebidas", "Doces", "Lanches", "Mercearia"]

PRODUTOS = [
    ("SAL001", "Coxinha de frango", "Salgados", "UN", "3.20", "6.50", 40, 10),
    ("SAL002", "Pao de queijo", "Salgados", "UN", "1.80", "4.00", 60, 15),
    ("SAL003", "Empada de palmito", "Salgados", "UN", "3.50", "7.00", 25, 8),
    ("BEB001", "Refrigerante lata 350ml", "Bebidas", "UN", "2.60", "5.50", 80, 24),
    ("BEB002", "Suco natural 300ml", "Bebidas", "UN", "3.00", "7.00", 30, 10),
    ("BEB003", "Agua mineral 500ml", "Bebidas", "UN", "1.20", "3.00", 100, 24),
    ("BEB004", "Cafe expresso", "Bebidas", "UN", "1.10", "4.00", 200, 30),
    ("DOC001", "Brigadeiro", "Doces", "UN", "1.50", "3.50", 45, 12),
    ("DOC002", "Bolo de cenoura (fatia)", "Doces", "UN", "2.20", "6.00", 20, 6),
    ("LAN001", "Misto quente", "Lanches", "UN", "4.50", "9.50", 18, 5),
    ("LAN002", "Sanduiche natural", "Lanches", "UN", "5.00", "11.00", 12, 5),
    ("MER001", "Barra de cereal", "Mercearia", "UN", "1.90", "4.50", 8, 10),
]


def executar() -> None:
    migracoes.aplicar()
    db = SessionLocal()

    if db.scalar(select(models.Produto).limit(1)):
        print("Banco ja possui dados. Apague cantina.db para recriar a demo.")
        return

    # --- Funcionarios -----------------------------------------------------
    if not db.scalar(select(models.Usuario).limit(1)):
        db.add(
            models.Usuario(
                nome="Administrador",
                usuario="admin",
                senha_hash=hash_password("admin123"),
                perfil=models.Perfil.ADMIN,
                cargo="Administrador",
                data_admissao=date(2023, 1, 10),
            )
        )
    equipe = [
        ("Levi", "levi", models.Perfil.USUARIO, "Atendente", "2100.00"),
    ]
    for nome, login, perfil, cargo, salario in equipe:
        db.add(
            models.Usuario(
                nome=nome,
                usuario=login,
                senha_hash=hash_password("123456"),
                perfil=perfil,
                cargo=cargo,
                salario=Decimal(salario),
                data_admissao=date(2024, 3, 1),
            )
        )
    db.flush()
    operadores = db.scalars(select(models.Usuario)).all()

    # --- Parceiros --------------------------------------------------------
    parceiros = [
        models.Parceiro(
            tipo=models.TipoParceiro.FORNECEDOR,
            tipo_pessoa=models.TipoPessoa.JURIDICA,
            nome="Distribuidora Bom Sabor LTDA",
            nome_fantasia="Bom Sabor",
            documento="12345678000195",
            telefone="1133224455",
            cidade="Sao Paulo",
            uf="SP",
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.FORNECEDOR,
            tipo_pessoa=models.TipoPessoa.JURIDICA,
            nome="Bebidas Central S.A.",
            nome_fantasia="Central Bebidas",
            documento="98765432000198",
            telefone="1144556677",
            cidade="Guarulhos",
            uf="SP",
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.CLIENTE,
            nome="Joao Pereira",
            documento="12345678909",
            telefone="11988887777",
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.CLIENTE,
            nome="Ana Clara Martins",
            documento="98765432100",
            telefone="11977776666",
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.CLIENTE,
            nome="Escola Municipal Vila Nova",
            tipo_pessoa=models.TipoPessoa.JURIDICA,
            documento="11222333000181",
        ),
    ]
    db.add_all(parceiros)
    db.flush()
    fornecedores = [p for p in parceiros if p.tipo == models.TipoParceiro.FORNECEDOR]
    clientes = [p for p in parceiros if p.tipo == models.TipoParceiro.CLIENTE]

    # --- Categorias e produtos -------------------------------------------
    categorias = {nome: models.Categoria(nome=nome) for nome in CATEGORIAS}
    db.add_all(categorias.values())
    db.flush()

    produtos = []
    for codigo, nome, cat, un, custo, venda, qtd, minimo in PRODUTOS:
        produto = models.Produto(
            codigo=codigo,
            nome=nome,
            categoria_id=categorias[cat].id,
            fornecedor_id=random.choice(fornecedores).id,
            unidade=un,
            preco_custo=Decimal(custo),
            preco_venda=Decimal(venda),
            estoque_minimo=Decimal(minimo),
        )
        db.add(produto)
        db.flush()
        movimentar(
            db,
            produto=produto,
            tipo=models.TipoMovimento.ENTRADA,
            quantidade=Decimal(qtd),
            custo_unitario=Decimal(custo),
            motivo="Carga inicial",
            usuario_id=operadores[0].id,
        )
        produtos.append(produto)

    # --- Caixas e turnos --------------------------------------------------
    # Um turno por caixa em cada dia dos ultimos 30 dias, revezando entre os
    # operadores. Os turnos passados sao fechados no final do script, depois
    # que as vendas ja estao vinculadas, para a conferencia bater de verdade.
    caixa_1 = models.Caixa(nome="Caixa 1", descricao="Balcao principal")
    caixa_2 = models.Caixa(nome="Caixa 2", descricao="Balcao do patio (pico do intervalo)")
    db.add_all([caixa_1, caixa_2])
    db.flush()

    # Numa cantina pequena o administrador tambem fica no balcao, entao os dois
    # operam. Com dois nomes, os dois caixas do mesmo dia nunca caem na mesma
    # pessoa -- ninguem opera duas gavetas ao mesmo tempo.
    equipe_caixa = operadores

    turnos_por_dia: dict[int, list[models.CaixaSessao]] = {}
    for dias_atras in range(29, -1, -1):
        dia = datetime.now(timezone.utc) - timedelta(days=dias_atras)
        do_dia = []
        for indice, caixa in enumerate([caixa_1, caixa_2]):
            # O Caixa 2 so abre nos dias de movimento maior.
            if caixa is caixa_2 and dias_atras % 3 == 0:
                continue
            operador = equipe_caixa[(dias_atras + indice) % len(equipe_caixa)]
            sessao = models.CaixaSessao(
                caixa_id=caixa.id,
                status=models.StatusCaixa.ABERTA,
                usuario_abertura_id=operador.id,
                aberto_em=dia.replace(hour=7, minute=30),
                valor_abertura=Decimal("100.00"),
                observacao_abertura="Abertura do turno",
            )
            db.add(sessao)
            do_dia.append(sessao)
        turnos_por_dia[dias_atras] = do_dia
    db.flush()

    # Sangrias em alguns turnos, como acontece quando a gaveta enche.
    for dias_atras, sessoes in turnos_por_dia.items():
        for sessao in sessoes:
            if random.random() < 0.3:
                dia = datetime.now(timezone.utc) - timedelta(days=dias_atras)
                db.add(
                    models.MovimentoCaixa(
                        sessao_id=sessao.id,
                        tipo=models.TipoMovimentoCaixa.SANGRIA,
                        valor=Decimal(random.choice([50, 100, 150])),
                        motivo="Retirada para o cofre",
                        usuario_id=sessao.usuario_abertura_id,
                        criado_em=dia.replace(hour=15, minute=0),
                    )
                )

    # --- Vendas dos ultimos 30 dias --------------------------------------
    formas = [models.FormaPagamento.DINHEIRO, models.FormaPagamento.PIX]
    pesos = [55, 45]

    # A maioria e consumidor diverso; uma parcela informa CPF na nota.
    documentos_avulsos = ["45678912364", "12345678909", "98765432100"]

    for dias_atras in range(29, -1, -1):
        momento_base = datetime.now(timezone.utc) - timedelta(days=dias_atras)
        for _ in range(random.randint(3, 9)):
            forma = random.choices(formas, weights=pesos)[0]
            cliente = random.choice(clientes) if random.random() < 0.08 else None
            documento = (
                cliente.documento
                if cliente
                else (random.choice(documentos_avulsos) if random.random() < 0.25 else None)
            )
            venda = models.Venda(
                cliente_id=cliente.id if cliente else None,
                documento_cliente=documento,
                usuario_id=random.choice(operadores).id,
                caixa_sessao_id=random.choice(turnos_por_dia[dias_atras]).id,
                forma_pagamento=forma,
                criado_em=momento_base.replace(
                    hour=random.randint(8, 18), minute=random.randint(0, 59)
                ),
            )
            db.add(venda)
            db.flush()

            subtotal = Decimal("0")
            for produto in random.sample(produtos, random.randint(1, 4)):
                qtd = Decimal(random.randint(1, 3))
                if Decimal(str(produto.estoque_atual)) < qtd:
                    movimentar(
                        db,
                        produto=produto,
                        tipo=models.TipoMovimento.ENTRADA,
                        quantidade=Decimal(50),
                        custo_unitario=produto.preco_custo,
                        motivo="Reposicao automatica (demo)",
                    )
                preco = Decimal(str(produto.preco_venda))
                total = preco * qtd
                subtotal += total
                db.add(
                    models.VendaItem(
                        venda_id=venda.id,
                        produto_id=produto.id,
                        descricao=produto.nome,
                        quantidade=qtd,
                        preco_unitario=preco,
                        custo_unitario=Decimal(str(produto.preco_custo)),
                        total=total,
                    )
                )
                movimentar(
                    db,
                    produto=produto,
                    tipo=models.TipoMovimento.SAIDA,
                    quantidade=qtd,
                    motivo=f"Venda #{venda.id}",
                    venda_id=venda.id,
                )

            venda.subtotal = subtotal
            venda.total = subtotal
            venda.valor_recebido = subtotal

    # --- Contas a receber (lancadas a mao, fora do PDV) --------------------
    for descricao, valor, offset, cliente in [
        ("Coffee break reuniao de pais", "480.00", 6, clientes[-1]),
        ("Lanches da formatura", "1250.00", -4, clientes[-1]),
        ("Encomenda de salgados", "320.00", 12, clientes[0]),
    ]:
        db.add(
            models.Título(
                tipo=models.TipoTítulo.RECEBER,
                descricao=descricao,
                categoria="Eventos",
                parceiro_id=cliente.id,
                valor=Decimal(valor),
                vencimento=date.today() + timedelta(days=offset),
            )
        )

    # --- Contas a pagar ---------------------------------------------------
    despesas = [
        ("Aluguel do ponto", "Ocupacao", "3500.00", 5),
        ("Energia eletrica", "Utilidades", "820.45", 12),
        ("Compra de mercadorias - Bom Sabor", "Mercadorias", "2140.00", -3),
        ("Internet e telefone", "Utilidades", "199.90", 20),
        ("Folha de pagamento", "Pessoal", "8400.00", 5),
        ("Gas de cozinha", "Insumos", "310.00", -8),
    ]
    for descricao, categoria, valor, offset in despesas:
        db.add(
            models.Título(
                tipo=models.TipoTítulo.PAGAR,
                descricao=descricao,
                categoria=categoria,
                parceiro_id=random.choice(fornecedores).id
                if categoria == "Mercadorias"
                else None,
                valor=Decimal(valor),
                vencimento=date.today() + timedelta(days=offset),
            )
        )

    db.flush()

    # --- Fechamento dos turnos passados -----------------------------------
    # A maioria fecha certo. Um dos operadores erra o troco com mais frequencia,
    # para o relatorio de quebras por operador ter o que mostrar.
    from app.services.caixa import conferir

    descuidado = equipe_caixa[-1].id
    justificativas = [
        "Erro de troco no pico do intervalo",
        "Conferido com o gerente",
        "Nota de 10 a menos na gaveta",
        "Cliente pagou depois; ajustado",
    ]

    for dias_atras, sessoes in turnos_por_dia.items():
        for sessao in sessoes:
            if dias_atras == 0 and sessao.caixa_id == caixa_1.id:
                continue  # o turno de hoje no Caixa 1 fica aberto para o PDV

            conferencia = conferir(db, sessao)
            propenso = sessao.usuario_abertura_id == descuidado
            sorteio = random.random()
            if sorteio < (0.45 if propenso else 0.8):
                quebra = Decimal("0.00")
            elif sorteio < (0.85 if propenso else 0.92):
                quebra = Decimal(str(-round(random.uniform(0.5, 12), 2)))
            else:
                quebra = Decimal(str(round(random.uniform(0.5, 5), 2)))

            dia = datetime.now(timezone.utc) - timedelta(days=dias_atras)
            sessao.status = models.StatusCaixa.FECHADA
            sessao.fechado_em = dia.replace(hour=18, minute=30)
            sessao.usuario_fechamento_id = sessao.usuario_abertura_id
            sessao.valor_esperado = conferencia.valor_esperado
            sessao.valor_informado = conferencia.valor_esperado + quebra
            sessao.diferenca = quebra
            if quebra != 0:
                sessao.observacao_fechamento = random.choice(justificativas)

    db.commit()
    print("Demo criada com sucesso.")
    print("  admin / admin123   (ADMIN - acesso total)")
    print("  levi  / 123456     (USUARIO - PDV e caixa)")


if __name__ == "__main__":
    executar()
