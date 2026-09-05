"""Icone do sistema: silhueta de montanhas inspirada no logo.

As montanhas do logo original sao um traco fino: bonito no lockup, invisivel a
16 px. O icone aqui e uma versao **preenchida** com o mesmo ritmo de picos --
um pico menor a esquerda, o macico principal ao centro e uma crista a direita.
"""

from pathlib import Path

from PIL import Image, ImageDraw

DESTINO = Path(r"C:\Users\Levi Mota\Desktop\Sistema cantina\frontend\public")
LARANJA = (249, 126, 18, 255)
BRANCO = (255, 255, 255, 255)

# Silhueta em coordenadas de 0 a 100, para servir ao PNG e ao SVG
BASE = 71.0
MONTANHAS = [
    (10, BASE),
    (25, 45),
    (34, 57),
    (41, 49),
    (54, 24),
    (70, 52),
    (78, 44),
    (90, BASE),
]
# Uma faixa fina abaixo, ecoando a crista solta do logo
CRISTA = [(20, 79), (34, 74), (50, 78), (66, 74), (80, 79), (66, 82), (50, 81), (34, 82)]


def desenhar(lado: int) -> Image.Image:
    # Desenha grande e reduz: bordas suaves sem depender de antialias do PIL
    escala = 8
    grande = lado * escala
    im = Image.new("RGBA", (grande, grande), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(
        [(0, 0), (grande - 1, grande - 1)], radius=int(grande * 0.22), fill=LARANJA
    )

    def pontos(lista):
        return [(x / 100 * grande, y / 100 * grande) for x, y in lista]

    d.polygon(pontos(MONTANHAS), fill=BRANCO)
    d.polygon(pontos(CRISTA), fill=BRANCO)
    return im.resize((lado, lado), Image.LANCZOS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#f97e12" />
  <polygon points="{montanhas}" fill="#ffffff" />
  <polygon points="{crista}" fill="#ffffff" />
</svg>
"""


if __name__ == "__main__":
    grande = desenhar(512)
    grande.save(DESTINO / "icone-cantina.png")
    desenhar(180).save(DESTINO / "apple-touch-icon.png")
    desenhar(32).save(DESTINO / "favicon-32.png")
    grande.save(DESTINO / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    def texto(lista):
        return " ".join(f"{x},{y}" for x, y in lista)

    (DESTINO / "favicon.svg").write_text(
        SVG.format(montanhas=texto(MONTANHAS), crista=texto(CRISTA)), encoding="utf-8"
    )
    print("icone gerado em 512, 180, 32, .ico e .svg")
