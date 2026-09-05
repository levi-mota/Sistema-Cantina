# Marca

Os arquivos que a aplicação usa ficam em `frontend/public/`. Esta pasta guarda a
origem e os scripts que os produzem, para a marca poder ser refeita.

| Arquivo | O que é |
| --- | --- |
| `logo-original-alagoas.png` | Arte recebida (Maanaim Alagoas, branca sobre transparente) |
| `gerar-logo.py` | Troca "ALAGOAS" por "CANTINA" e gera o logo horizontal |
| `gerar-icone.py` | Desenha o ícone quadrado (favicon e atalho do celular) |

## Como o logo foi feito

A palavra "ALAGOAS" foi apagada e redesenhada como "CANTINA" na mesma caixa
(x 600→1562, base em y 593), com a mesma altura de capitular (136 px) e o
espaçamento distribuído para ocupar exatamente a mesma largura. A fonte é
**Candara negrito itálico**, a mais próxima do original entre as disponíveis no
Windows — o original parece ser Optima ou similar, que não veio junto.

As duas palavras têm sete letras, então o ritmo do lockup ficou igual.

## Por que o ícone não é um recorte do logo

As montanhas do logo são um traço fino: elegante no lockup, **invisível a 16 px**.
E o "M" manuscrito não se separa das letras seguintes, porque a caligrafia é
ligada. O ícone é então uma silhueta **preenchida** com o mesmo ritmo de picos —
derivada da marca, não recortada dela.

Se um dia aparecer o arquivo vetorial (AI, EPS ou SVG) do logo original, vale
refazer o lockup a partir dele: o texto sairia com a fonte correta e o ícone
poderia usar as montanhas reais.

## Refazendo

```bash
backend/.venv/Scripts/python marca/gerar-logo.py
backend/.venv/Scripts/python marca/gerar-icone.py
```
