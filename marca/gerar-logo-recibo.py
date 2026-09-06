"""Gera a versao do logo que vai na bobina termica.

O logo da marca e branco sobre transparente: serve para a tela escura do menu,
mas na impressora termica -- que so imprime preto sobre o papel branco -- ele
sairia invisivel. Aqui ele e invertido para preto sobre branco e reduzido para
384 pontos, a largura util da bobina de 58mm.

    python marca/gerar-logo-recibo.py
"""

from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "frontend" / "public" / "logo-cantina.png"
DESTINO = RAIZ / "frontend" / "public" / "logo-recibo.png"

LARGURA = 384  # pontos da bobina de 58mm a 203 dpi


def gerar() -> None:
    logo = Image.open(ORIGEM).convert("RGBA")

    altura = round(logo.height * LARGURA / logo.width)
    logo = logo.resize((LARGURA, altura), Image.LANCZOS)

    # A arte e branca; o que interessa e o canal alfa, que diz onde ha desenho.
    # Onde ha desenho vira preto, o resto vira branco.
    papel = Image.new("L", logo.size, 255)
    tinta = Image.new("L", logo.size, 0)
    papel.paste(tinta, mask=logo.getchannel("A"))

    # Sem meio-tom: a termica so tem ponto aceso ou apagado, e o cinza vira
    # sujeira. O corte em 128 mantem o traco da caligrafia inteiro.
    papel = papel.point(lambda v: 0 if v < 128 else 255, mode="L")

    papel.convert("RGB").save(DESTINO, optimize=True)
    print(f"{DESTINO.relative_to(RAIZ)} -> {papel.size[0]}x{papel.size[1]}")


if __name__ == "__main__":
    gerar()
