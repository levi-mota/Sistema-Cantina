# Marca

Os arquivos que a aplicação usa ficam em `frontend/public/`. Esta pasta guarda a
origem e os scripts que os produzem, para a marca poder ser refeita.

| Arquivo | O que é |
| --- | --- |
| `logo-original-alagoas.png` | Arte recebida (Maanaim Alagoas, branca sobre transparente) |
| `gerar-logo.py` | Troca "ALAGOAS" por "CANTINA" e gera o logo horizontal |
| `gerar-icone.py` | Desenha o ícone quadrado (favicon e atalho do celular) |
| `gerar-logo-recibo.py` | Inverte o logo para preto sobre branco, na largura da bobina |

## Como o logo foi feito

A palavra "ALAGOAS" foi apagada e redesenhada como "CANTINA" na mesma caixa
(x 600→1562, base em y 593), com a mesma altura de capitular (136 px) e o
espaçamento distribuído para ocupar exatamente a mesma largura. A fonte é
**Candara negrito itálico**, a mais próxima do original entre as disponíveis no
Windows — o original parece ser Optima ou similar, que não veio junto.

As duas palavras têm sete letras, então o ritmo do lockup ficou igual.

## Por que o logo do recibo é outro arquivo

A arte da marca é branca sobre transparente: perfeita na tela escura do menu e
invisível na impressora térmica, que só imprime preto sobre o papel branco. O
`gerar-logo-recibo.py` inverte a imagem e a reduz para 384 pontos, a largura útil
da bobina de 58mm, sem meio-tom -- a térmica só tem ponto aceso ou apagado, e o
cinza sairia como sujeira.

## Por que o ícone não é um recorte do logo

Nada do lockup funciona como ícone pequeno: as montanhas são um traço fino que
**some a 16 px**, e o "M" manuscrito não se separa das letras seguintes, porque
a caligrafia é ligada.

O ícone é então um símbolo próprio — **garfo e faca**, que é o que a cantina faz.
Formas cheias, brancas sobre o laranja da marca, legíveis de 512 a 16 px.

A divisão fica assim:

| Onde | O que aparece |
| --- | --- |
| Tela de login e menu expandido | O logo completo, com o nome Maanaim Cantina |
| Aba do navegador, atalho do celular, menu recolhido | O ícone de garfo e faca |

Se um dia aparecer o arquivo vetorial (AI, EPS ou SVG) do logo original, vale
refazer o lockup a partir dele: o texto sairia com a fonte correta.

## Refazendo

```bash
backend/.venv/Scripts/python marca/gerar-logo.py
backend/.venv/Scripts/python marca/gerar-icone.py
```
