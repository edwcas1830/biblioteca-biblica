"""Genera todos los íconos desde el logo B1 en vector (app/icono-b1.svg), elegido por Edward el 12-oct-2026.
Renderiza con Chrome sin ventana (sin dependencias nuevas) y recorta con Pillow.
Salidas: Android (mipmap PNG heredados + primer plano), web/PWA (180, 192, 512), PC (app/icon.ico, app/icon.svg)
y el ícono de 512 para la ficha de Google Play.
Uso: python scripts/iconos-b1.py
"""
import pathlib
import re
import subprocess
import tempfile
from PIL import Image, ImageDraw

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SVG = (RAIZ / "app" / "icono-b1.svg").read_text(encoding="utf-8")
NAVEGADOR = r"C:\Program Files\Google\Chrome\Application\chrome.exe"  # Edge sin ventana no guarda capturas aquí
FIGURAS = "\n".join(re.findall(r"<path[^>]*/>", SVG))
DEFS = re.search(r"<defs>.*?</defs>", SVG, re.S).group(0)
FONDO = "#30392F"


def variante(tipo):
    """svg completo (esquinas redondeadas), cuadrado sin esquinas, solo el dibujo (primer plano adaptable)."""
    if tipo == "completo":
        return SVG
    if tipo == "cuadrado":
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{DEFS}<rect width="1024" height="1024" fill="{FONDO}"/>{FIGURAS}</svg>'
    if tipo == "frente":  # zona segura del ícono adaptable de Android: 72 de 108 dp → el dibujo al 80 %
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{DEFS}<g transform="translate(512 525) scale(0.8) translate(-512 -499)">{FIGURAS}</g></svg>'
    raise ValueError(tipo)


def render(tipo, lado, carpeta):
    svg = carpeta / f"{tipo}.svg"
    svg.write_text(variante(tipo), encoding="utf-8")
    html = carpeta / f"{tipo}-{lado}.html"
    html.write_text(f'<html><body style="margin:0;background:transparent"><img src="{svg.as_uri()}" width="{lado}" height="{lado}"></body></html>', encoding="utf-8")
    png = carpeta / f"{tipo}-{lado}.png"
    subprocess.run([NAVEGADOR, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000", f"--user-data-dir={carpeta / 'perfil'}", "--no-first-run",
                    f"--window-size={lado},{lado}", f"--screenshot={png}", html.as_uri()], check=True, capture_output=True, timeout=60)
    return Image.open(png).convert("RGBA").crop((0, 0, lado, lado))


def redondo(im):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
    fuera = Image.new("RGBA", im.size, (0, 0, 0, 0))
    fuera.paste(im, (0, 0), m)
    return fuera


def main():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as t:
        tmp = pathlib.Path(t)
        grande = {k: render(k, 1024, tmp) for k in ("completo", "cuadrado", "frente")}
    res = RAIZ / "mobile" / "android" / "app" / "src" / "main" / "res"
    for carpeta, lado in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        d = res / f"mipmap-{carpeta}"
        grande["completo"].resize((lado, lado), Image.LANCZOS).save(d / "ic_launcher.png")
        redondo(grande["cuadrado"].resize((lado, lado), Image.LANCZOS)).save(d / "ic_launcher_round.png")
        frente = int(lado * 108 / 48)  # el primer plano adaptable mide 108 dp
        grande["frente"].resize((frente, frente), Image.LANCZOS).save(d / "ic_launcher_foreground.png")
    web = RAIZ / "mobile" / "web" / "iconos"
    web.mkdir(parents=True, exist_ok=True)
    grande["cuadrado"].resize((180, 180), Image.LANCZOS).convert("RGB").save(web / "icono-180.png")  # iPhone redondea solo
    grande["completo"].resize((192, 192), Image.LANCZOS).save(web / "icono-192.png")
    grande["cuadrado"].resize((512, 512), Image.LANCZOS).save(web / "icono-512.png")  # «maskable»: sin esquinas
    grande["completo"].save(RAIZ / "app" / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    (RAIZ / "app" / "icon.svg").write_text(SVG, encoding="utf-8")
    play = pathlib.Path(r"C:\Users\edwar\OneDrive\FABRICA\biblia-estudio\play-capturas")
    play.mkdir(parents=True, exist_ok=True)
    grande["cuadrado"].resize((512, 512), Image.LANCZOS).convert("RGB").save(play / "icono-play-512.png")
    # Inicio en Android anterior al 12 (splash.png de cada densidad): fondo verde y el logo al centro.
    for f in res.glob("drawable*/splash.png"):
        w, h = Image.open(f).size
        lado = int(min(w, h) * 0.42)
        fondo = Image.new("RGBA", (w, h), FONDO)
        logo = grande["frente"].resize((lado, lado), Image.LANCZOS)
        fondo.paste(logo, ((w - lado) // 2, (h - lado) // 2), logo)
        fondo.convert("RGB").save(f)
    print("íconos listos")


if __name__ == "__main__":
    main()
