"""Gera a marca do sistema a partir do logo original.

Troca a palavra ALAGOAS por CANTINA e produz os arquivos que a aplicacao usa:
o logo horizontal (branco e escuro) e o icone quadrado da aba do navegador.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ORIGEM = Path(r"C:\Users\Levi Mota\Desktop\MAANAIM-ALAGOAS-LOGO BRANCO.png")
DESTINO = Path(r"C:\Users\Levi Mota\Desktop\Sistema cantina\frontend\public")

FONTE = r"C:\Windows\Fonts\Candaraz.ttf"  # Candara negrito italico: o que mais se aproxima

# Medidas lidas do proprio arquivo original
X_INI, X_FIM = 600, 1562
Y_TOPO, Y_BASE = 457, 593
FOLGA_BASE = 14  # o original vinha colado na borda, cortando o arredondado das letras

PALAVRA = "CANTINA"
LARANJA = (249, 126, 18, 255)  # a mesma cor de marca da interface


def fonte_com_altura(caminho: str, alvo: int) -> ImageFont.FreeTypeFont:
    tamanho = alvo
    for _ in range(60):
        fonte = ImageFont.truetype(caminho, tamanho)
        caixa = fonte.getbbox("H")
        atual = caixa[3] - caixa[1]
        if atual == alvo:
            return fonte
        tamanho += 1 if atual < alvo else -1
    return ImageFont.truetype(caminho, tamanho)


def montar_logo() -> Image.Image:
    original = Image.open(ORIGEM).convert("RGBA")
    largura, altura = original.size

    # Canvas com folga embaixo, para o C e o A nao encostarem na borda
    im = Image.new("RGBA", (largura, altura + FOLGA_BASE), (0, 0, 0, 0))
    im.paste(original, (0, 0))

    # Apaga a palavra antiga
    im.paste(
        Image.new("RGBA", (X_FIM - X_INI + 60, im.size[1] - Y_TOPO + 40), (0, 0, 0, 0)),
        (X_INI - 30, Y_TOPO - 20),
    )

    fonte = fonte_com_altura(FONTE, Y_BASE - Y_TOPO)
    larguras = [fonte.getbbox(l)[2] - fonte.getbbox(l)[0] for l in PALAVRA]
    espaco = (X_FIM - X_INI - sum(larguras)) / (len(PALAVRA) - 1)

    desenho = ImageDraw.Draw(im)
    x = float(X_INI)
    for letra, largura in zip(PALAVRA, larguras):
        caixa = fonte.getbbox(letra)
        desenho.text((x - caixa[0], Y_BASE - caixa[3]), letra, font=fonte, fill=(255, 255, 255, 255))
        x += largura + espaco

    return im.crop(im.getbbox())


def versao_escura(logo: Image.Image) -> Image.Image:
    """Mesma marca em grafite, para fundos claros."""
    escura = Image.new("RGBA", logo.size, (29, 28, 26, 255))
    escura.putalpha(logo.getchannel("A"))
    return escura


def montar_icone(logo: Image.Image, lado: int = 512) -> Image.Image:
    """Icone quadrado: o M manuscrito com as montanhas, sobre a cor da marca."""
    marca = logo.crop((0, 0, 760, logo.size[1] - 150))  # o M e as montanhas
    marca = marca.crop(marca.getbbox())

    # Cabe dentro de uma area segura, mantendo a proporcao
    util = int(lado * 0.74)
    escala = min(util / marca.size[0], util / marca.size[1])
    marca = marca.resize(
        (max(int(marca.size[0] * escala), 1), max(int(marca.size[1] * escala), 1)),
        Image.LANCZOS,
    )

    icone = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    canto = ImageDraw.Draw(icone)
    canto.rounded_rectangle([(0, 0), (lado - 1, lado - 1)], radius=int(lado * 0.22), fill=LARANJA)
    icone.alpha_composite(
        marca, ((lado - marca.size[0]) // 2, (lado - marca.size[1]) // 2)
    )
    return icone


if __name__ == "__main__":
    DESTINO.mkdir(parents=True, exist_ok=True)

    logo = montar_logo()
    logo.save(DESTINO / "logo-cantina.png")
    versao_escura(logo).save(DESTINO / "logo-cantina-escuro.png")
    print("logo:", logo.size)

    icone = montar_icone(logo)
    icone.save(DESTINO / "icone-cantina.png")
    icone.resize((180, 180), Image.LANCZOS).save(DESTINO / "apple-touch-icon.png")
    icone.resize((32, 32), Image.LANCZOS).save(DESTINO / "favicon-32.png")
    icone.save(DESTINO / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("icone: 512, 180, 32 e favicon.ico")
