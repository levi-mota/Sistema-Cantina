"""Ícone do sistema: garfo e faca sobre a cor da marca.

O logo do lockup é caligráfico e as montanhas são um traço fino -- bonito no
nome completo, ilegível a 16 px. O ícone é então um símbolo próprio, de comida,
que é o que a cantina faz: garfo e faca cheios, brancos sobre o laranja.

O nome "Maanaim Cantina" continua no login e no menu expandido; o ícone entra
onde só cabe um quadrado (aba do navegador, atalho do celular, menu recolhido).
"""

from pathlib import Path

from PIL import Image, ImageDraw

DESTINO = Path(__file__).resolve().parents[1] / "frontend" / "public"
LARANJA = (249, 126, 18, 255)
BRANCO = (255, 255, 255, 255)
ESCALA = 10  # desenha grande e reduz: bordas suaves sem serrilhado

# Geometria em coordenadas de 0 a 100, compartilhada pelo PNG e pelo SVG
DENTES = [(26, 20, 31.5, 42), (34.5, 20, 40, 42), (43, 20, 48.5, 42)]
CABECA_GARFO = (26, 36, 48.5, 50)
CABO_GARFO = (33, 46, 41.5, 82)
LAMINA = [(58, 30), (66, 20), (72, 30), (72, 54), (58, 54)]
BASE_LAMINA = (58, 40, 72, 56)
CABO_FACA = (61, 52, 69.5, 82)


def desenhar(lado: int) -> Image.Image:
    grande = lado * ESCALA
    im = Image.new("RGBA", (grande, grande), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def e(v: float) -> float:
        return v / 100 * grande

    d.rounded_rectangle(
        [(0, 0), (grande - 1, grande - 1)], radius=int(grande * 0.22), fill=LARANJA
    )

    for x1, y1, x2, y2 in DENTES:
        d.rounded_rectangle([(e(x1), e(y1)), (e(x2), e(y2))], radius=e(2.5), fill=BRANCO)
    for caixa, raio in ((CABECA_GARFO, 6), (CABO_GARFO, 4), (BASE_LAMINA, 5), (CABO_FACA, 4)):
        x1, y1, x2, y2 = caixa
        d.rounded_rectangle([(e(x1), e(y1)), (e(x2), e(y2))], radius=e(raio), fill=BRANCO)
    d.polygon([(e(x), e(y)) for x, y in LAMINA], fill=BRANCO)

    return im.resize((lado, lado), Image.LANCZOS)


def montar_svg() -> str:
    def retangulo(caixa: tuple[float, float, float, float], raio: float) -> str:
        x1, y1, x2, y2 = caixa
        return (
            f'<rect x="{x1}" y="{y1}" width="{x2 - x1:.1f}" height="{y2 - y1:.1f}"'
            f' rx="{raio}" fill="#fff" />'
        )

    formas = [retangulo(d, 2.5) for d in DENTES]
    formas += [
        retangulo(CABECA_GARFO, 6),
        retangulo(CABO_GARFO, 4),
        retangulo(BASE_LAMINA, 5),
        retangulo(CABO_FACA, 4),
        '<polygon points="' + " ".join(f"{x},{y}" for x, y in LAMINA) + '" fill="#fff" />',
    ]
    corpo = "\n  ".join(formas)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n'
        '  <rect width="100" height="100" rx="22" fill="#f97e12" />\n'
        f"  {corpo}\n"
        "</svg>\n"
    )


if __name__ == "__main__":
    grande = desenhar(512)
    grande.save(DESTINO / "icone-cantina.png")
    desenhar(180).save(DESTINO / "apple-touch-icon.png")
    desenhar(32).save(DESTINO / "favicon-32.png")
    grande.save(DESTINO / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    (DESTINO / "favicon.svg").write_text(montar_svg(), encoding="utf-8")
    print("ícone gerado em 512, 180, 32, .ico e .svg")
