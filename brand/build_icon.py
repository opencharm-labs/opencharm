"""Build the OpenCharm icon set into brand/icon/.

The icon is the device seen from the front. The shell colour fills the whole
square: no border, no padding, no rounding baked in (platforms apply their own
mask). A black screen sits inside. The screen is its own squircle, rounder than
the platform mask (corner about 31% of its width, versus about 22% for the
iOS mask), so the head reads soft and friendly; the rim gets slightly thicker
at the corners, like a cushion. The face is two carets `^ ^` from Geist Mono 800
(outline embedded below, so no font is needed).

Run:  pip install cairosvg pillow && npm run icon:build
"""

import io
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "brand", "icon")
WEB_COPIES = [
    ("icon.svg", "apps/web/src/app/icon.svg"),
    ("apple-touch-icon-180.png", "apps/web/src/app/apple-icon.png"),
    ("favicon.ico", "apps/web/src/app/favicon.ico"),
    ("icon-512.png", "apps/web/public/icon-512.png"),
]

# Geist Mono 800 "^" outline (font units, y up, 1000 upm). Geist is SIL OFL 1.1.
CARET = [
    (86.0, 373.0),
    (223.8, 710.0),
    (377.0, 710.0),
    (514.0, 373.0),
    (389.6, 373.0),
    (282.8, 648.2),
    (318.0, 648.2),
    (211.2, 373.0),
]
CARET_CX, CARET_CY, CARET_W = 300.0, 541.5, 428.0

SCREEN = "#000000"
GLYPH = "#F4F3EE"
PRIMARY = "white"
VARIANTS = {
    # name: (shell, glyphs)
    "white": (
        "#FFFFFF",
        GLYPH,
    ),  # primary: the default white charm; the black screen and face carry it
    "blue": ("#2E5BE6", GLYPH),
    "cobalt": ("#4574FF", GLYPH),
    "lime": ("#BDEB4E", GLYPH),
    "lime-lime": (
        "#BDEB4E",
        "#D6F78A",
    ),  # shell and face in the same identity colour, like the device
    "lilac": ("#B39BFA", GLYPH),
    "sun": ("#FFCD5C", GLYPH),
    "coal": ("#2B2C30", GLYPH),
    "violet": ("#7B3FF2", GLYPH),
    "magenta": ("#E5157A", GLYPH),
    # white shell, face in an identity colour
    "white-lime": ("#FFFFFF", "#D6F78A"),
    "white-cobalt": ("#FFFFFF", "#9DB6FF"),
    "white-lilac": ("#FFFFFF", "#D2C4FF"),
    "white-sun": ("#FFFFFF", "#FFDF93"),
}

S = 1024
SQUIRCLE_N = 5.0  # approximates the iOS / macOS icon mask; default for squircle_pts (previews)
SCREEN_N = 3.5  # the head: rounder than the mask, friendlier
INSET = 0.085 * S  # shell rim visible around the screen (inside the mask)
EYE_W = 0.22 * S  # caret width
EYE_DX = 0.19 * S  # half distance between eyes
EYE_Y = 0.47 * S  # eyes sit a little above the middle


def squircle_pts(size, n=SQUIRCLE_N, steps=720, cx=None, cy=None):
    h = size / 2.0
    cx = h if cx is None else cx
    cy = h if cy is None else cy
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append(
            (
                cx + h * math.copysign(abs(c) ** (2 / n), c),
                cy + h * math.copysign(abs(s) ** (2 / n), s),
            )
        )
    return pts


def path(pts):
    return "M" + " L".join(f"{p[0]:.2f} {p[1]:.2f}" for p in pts) + " Z"


def screen_pts(size, inset, n=SCREEN_N):
    """The head: a squircle filling the square minus the rim."""
    return squircle_pts(size - 2 * inset, n=n, cx=size / 2, cy=size / 2)


def caret_path(cx, cy, width):
    k = width / CARET_W
    return path([(cx + (x - CARET_CX) * k, cy - (y - CARET_CY) * k) for x, y in CARET])


def svg(shell, glyph, maskable=False, size=S):
    k = size / S
    if maskable:
        # Android/PWA: anything outside the centre 80% circle may be cut, so the
        # whole head (screen) shrinks to fit in it. Scale the design around the centre.
        scale = 0.62
    else:
        scale = 1.0
    head = size * scale
    off = (size - head) / 2
    scr = [(x + off, y + off) for x, y in screen_pts(head, INSET * k * scale)]
    ew, edx = EYE_W * k * scale, EYE_DX * k * scale
    ey = size / 2 + (EYE_Y * k - size / 2) * scale
    left = caret_path(size / 2 - edx, ey, ew)
    right = caret_path(size / 2 + edx, ey, ew)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size:d}" height="{size:d}"'
        f' viewBox="0 0 {size:d} {size:d}">'
        "<title>OpenCharm</title>"
        f'<rect width="{size:d}" height="{size:d}" fill="{shell}"/>'
        f'<path d="{path(scr)}" fill="{SCREEN}"/>'
        f'<path d="{left}" fill="{glyph}"/><path d="{right}" fill="{glyph}"/></svg>\n'
    )


def tray_svg(size=S):
    """The menu-bar icon (desktop charm): only the head, the black screen squircle, with the carets
    cut out. A template image: black and transparent, so macOS tints it for light and dark bars."""
    # The caret outline's two inner points cross over (fine when it's filled solid); cut out of the
    # screen with even-odd, it needs them in order, or a sliver of black stays in each tip.
    simple = CARET[:5] + [CARET[6], CARET[5]] + CARET[7:]

    def cut(cx, cy, width):
        k = width / CARET_W
        return path([(cx + (x - CARET_CX) * k, cy - (y - CARET_CY) * k) for x, y in simple])

    scr = screen_pts(size, 0)
    left = cut(size / 2 - EYE_DX * 1.18, EYE_Y, EYE_W * 1.18)
    right = cut(size / 2 + EYE_DX * 1.18, EYE_Y, EYE_W * 1.18)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size:d}" height="{size:d}"'
        f' viewBox="0 0 {size:d} {size:d}">'
        "<title>OpenCharm</title>"
        f'<path d="{path(scr)} {left} {right}" fill="#000000" fill-rule="evenodd"/></svg>\n'
    )


def main():
    import shutil

    import cairosvg
    from PIL import Image

    shutil.rmtree(OUT, ignore_errors=True)  # generated folder: start clean
    os.makedirs(OUT)

    def png(svg_text, name, px):
        data = cairosvg.svg2png(bytestring=svg_text.encode(), output_width=px, output_height=px)
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        return data

    def write(name, text):
        with open(os.path.join(OUT, name), "w") as f:
            f.write(text)

    os.makedirs(os.path.join(OUT, "variants"), exist_ok=True)
    for name, (shell, glyph) in VARIANTS.items():
        s = svg(shell, glyph)
        write(f"variants/icon-{name}.svg", s)
        png(s, f"variants/icon-{name}-1024.png", 1024)

    shell, glyph = VARIANTS[PRIMARY]
    full, mask = svg(shell, glyph), svg(shell, glyph, maskable=True)
    write("icon.svg", full)
    write("favicon.svg", full)
    write("icon-maskable.svg", mask)
    png(full, "app-store-1024.png", 1024)  # stores apply their own mask
    png(full, "apple-touch-icon-180.png", 180)  # iOS rounds it
    png(mask, "icon-maskable-512.png", 512)  # Android / PWA
    for px in (512, 192, 64, 32, 16):
        png(full, f"icon-{px}.png", px)
    tray = tray_svg()
    write("tray-template.svg", tray)
    png(tray, "tray-template.png", 36)  # 18 pt at 2x: the menu-bar icon (a macOS template image)
    big = Image.open(
        io.BytesIO(cairosvg.svg2png(bytestring=full.encode(), output_width=256, output_height=256))
    )
    # RGBA entries: bundlers (Next.js/Turbopack) refuse ICOs whose PNGs are plain RGB.
    big.convert("RGBA").save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    n = sum(len(fs) for _, _, fs in os.walk(OUT))
    print("wrote", n, "files to", os.path.relpath(OUT, ROOT))
    # The website serves the same files under Next.js's names; copied here so they never drift
    # (tools/checks compares them).
    for src, dst in WEB_COPIES:
        shutil.copyfile(os.path.join(OUT, src), os.path.join(ROOT, dst))
    print("copied", len(WEB_COPIES), "icons into apps/web")


if __name__ == "__main__":
    main()
