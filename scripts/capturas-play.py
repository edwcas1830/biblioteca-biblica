"""Láminas para la ficha de Google Play (p21): cada captura del emulador (play-*.png de vista-tienda.cjs) con un
título grande arriba, en los colores de la app, y el teléfono con esquinas redondeadas y sombra. 1080 x 1920.
Uso: python scripts/capturas-play.py <carpeta con play-*.png> <carpeta de salida>
"""
import pathlib
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FUENTES = RAIZ / "app" / "fonts"
TEXTOS = {
    "1-biblia": ("Tu Biblia, sin anuncios", "Lee, resalta y escucha, con o sin internet"),
    "2-hoy": ("Tu momento con Dios, cada día", "Versículo del día y 4 pasos cortos"),
    "3-diccionario": ("Diccionario griego y hebreo", "En español, con números Strong"),
    "4-estudio": ("Estudio a profundidad", "Mapas, líneas de tiempo y personas"),
    "5-temas": ("¿Qué dice la Biblia sobre…?", "44 temas con sus pasajes clave"),
    "6-memorizar": ("Guarda la Palabra en tu corazón", "Memoriza con repaso espaciado"),
    "7-referencias": ("Referencias cruzadas", "Un versículo te lleva a otro"),
    "8-ia": ("IA que cita tu Biblia", "Pregunta y revisa cada cita"),
}
W, H = 1080, 1920
VERDE, CUERO, MARFIL, LATON = (48, 57, 47), (92, 65, 52), (246, 239, 226), (212, 183, 118)


def fondo():
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(VERDE[i] * (1 - t) + CUERO[i] * t) for i in range(3)))
    return im


def ajustar(d, texto, fuente, ancho):
    """Parte el texto en líneas que caben en el ancho."""
    palabras, lineas, actual = texto.split(), [], ""
    for p in palabras:
        prueba = (actual + " " + p).strip()
        if d.textlength(prueba, font=fuente) <= ancho:
            actual = prueba
        else:
            lineas.append(actual)
            actual = p
    lineas.append(actual)
    return lineas


def lamina(captura, titulo, subtitulo):
    im = fondo()
    d = ImageDraw.Draw(im)
    f_titulo = ImageFont.truetype(str(FUENTES / "literata.ttf"), 76)
    f_sub = ImageFont.truetype(str(FUENTES / "inter.ttf"), 40)
    y = 120
    for linea in ajustar(d, titulo, f_titulo, W - 160):
        d.text((W / 2, y), linea, font=f_titulo, fill=MARFIL, anchor="ma")
        y += 92
    y += 14
    d.text((W / 2, y), subtitulo, font=f_sub, fill=LATON, anchor="ma")
    y += 90
    # Teléfono: la captura escalada al alto disponible, con esquinas redondeadas, borde y sombra.
    tel = Image.open(captura).convert("RGB")
    alto = H - y - 60
    escala = min(alto / tel.height, (W - 220) / tel.width)
    tel = tel.resize((int(tel.width * escala), int(tel.height * escala)), Image.LANCZOS)
    x0 = (W - tel.width) // 2
    radio = 46
    mascara = Image.new("L", tel.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, tel.width - 1, tel.height - 1], radius=radio, fill=255)
    sombra = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sombra).rounded_rectangle([x0 + 6, y + 18, x0 + tel.width + 6, y + tel.height + 18], radius=radio, fill=150)
    sombra = sombra.filter(ImageFilter.GaussianBlur(24))
    im.paste(Image.new("RGB", (W, H), (20, 18, 16)), (0, 0), sombra)
    marco = 12
    ImageDraw.Draw(im).rounded_rectangle([x0 - marco, y - marco, x0 + tel.width + marco, y + tel.height + marco], radius=radio + marco, fill=(28, 26, 24))
    im.paste(tel, (x0, y), mascara)
    return im


def main():
    origen, destino = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    destino.mkdir(parents=True, exist_ok=True)
    hechas = 0
    for clave, (titulo, sub) in TEXTOS.items():
        archivo = next(origen.glob(f"*play-{clave}.png"), None)
        if not archivo:
            continue
        lamina(archivo, titulo, sub).save(destino / f"play-{clave}.png", optimize=True)
        hechas += 1
    print(f"{hechas} láminas en {destino}")


if __name__ == "__main__":
    main()
