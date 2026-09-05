"""Popula o banco com dados de demonstracao.

Uso:  .venv/Scripts/python seed.py
"""

import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app import models
from app.core.database import Base, SessionLocal, engine
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
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if db.scalar(select(models.Produto).limit(1)):
        print("Banco ja possui dados. Apague cantina.db para recriar a demo.")
        return

    # --- Funcionarios -----------------------------------------------------
    if not db.scalar(select(models.Usuario).limit(1)):
        db.add(
            models.Usuario(
                nome="Administrador",
                email="admin@cantina.local",
                senha_hash=hash_password("admin123"),
                perfil=models.Perfil.ADMIN,
                cargo="Administrador",
                data_admissao=date(2023, 1, 10),
            )
        )
    equipe = [
        ("Marina Souza", "marina@cantina.local", models.Perfil.GERENTE, "Gerente", "4200.00"),
        ("Diego Lima", "diego@cantina.local", models.Perfil.OPERADOR, "Atendente", "2100.00"),
        ("Paula Reis", "paula@cantina.local", models.Perfil.OPERADOR, "Caixa", "2100.00"),
    ]
    for nome, email, perfil, cargo, salario in equipe:
        db.add(
            models.Usuario(
                nome=nome,
                email=email,
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
            documento="12345678000199",
            telefone="1133224455",
            cidade="Sao Paulo",
            uf="SP",
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.FORNECEDOR,
            tipo_pessoa=models.TipoPessoa.JURIDICA,
            nome="Bebidas Central S.A.",
            nome_fantasia="Central Bebidas",
            documento="98765432000188",
            telefone="1144556677",
            cidade="Guarulhos",
            uf="SP",
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.CLIENTE,
            nome="Joao Pereira",
            documento="12345678901",
            telefone="11988887777",
            limite_credito=Decimal("150.00"),
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.CLIENTE,
            nome="Ana Clara Martins",
            documento="98765432100",
            telefone="11977776666",
            limite_credito=Decimal("200.00"),
        ),
        models.Parceiro(
            tipo=models.TipoParceiro.CLIENTE,
            nome="Escola Municipal Vila Nova",
            tipo_pessoa=models.TipoPessoa.JURIDICA,
            documento="11222333000144",
            limite_credito=Decimal("2000.00"),
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

    # --- Vendas dos ultimos 30 dias --------------------------------------
    formas = [
        models.FormaPagamento.DINHEIRO,
        models.FormaPagamento.PIX,
        models.FormaPagamento.DEBITO,
        models.FormaPagamento.CREDITO,
        models.FormaPagamento.FIADO,
    ]
    pesos = [30, 30, 20, 15, 5]

    for dias_atras in range(29, -1, -1):
        momento_base = datetime.now(timezone.utc) - timedelta(days=dias_atras)
        for _ in range(random.randint(3, 9)):
            forma = random.choices(formas, weights=pesos)[0]
            cliente = random.choice(clientes) if forma == models.FormaPagamento.FIADO else None
            venda = models.Venda(
                cliente_id=cliente.id if cliente else None,
                usuario_id=random.choice(operadores).id,
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
            venda.valor_recebido = subtotal if forma != models.FormaPagamento.FIADO else 0

            if forma == models.FormaPagamento.FIADO and cliente:
                db.add(
                    models.Titulo(
                        tipo=models.TipoTitulo.RECEBER,
                        descricao=f"Venda fiado #{venda.id}",
                        categoria="Vendas",
                        parceiro_id=cliente.id,
                        venda_id=venda.id,
                        valor=subtotal,
                        vencimento=date.today() + timedelta(days=random.randint(-10, 25)),
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
            models.Titulo(
                tipo=models.TipoTitulo.PAGAR,
                descricao=descricao,
                categoria=categoria,
                parceiro_id=random.choice(fornecedores).id
                if categoria == "Mercadorias"
                else None,
                valor=Decimal(valor),
                vencimento=date.today() + timedelta(days=offset),
            )
        )

    db.commit()
    print("Demo criada com sucesso.")
    print("  admin@cantina.local / admin123   (ADMIN)")
    print("  marina@cantina.local / 123456    (GERENTE)")
    print("  diego@cantina.local / 123456     (OPERADOR)")


if __name__ == "__main__":
    executar()
