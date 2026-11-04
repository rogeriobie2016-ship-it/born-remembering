"""The chapters, as paintings. For each chapter:

  zoetrope/card-<scene>.webp   a card for the chapter list: its painting, with its figure collaged in front
  zoetrope/panels.webp         6x3 atlas: the paintings alone, the back wall of each arch of the sculpture
  zoetrope/figures.webp        6x3 atlas: the figures alone, standing in the arches and on the moving band

Run from the repository root:  python -I art/tools/zoetrope.py
"""
import os
import sys

sys.path.insert(0, 'art/tools')
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

SRC = 'art/src/'
ART = 'public/art/'
OUT = ART + 'zoetrope/'
os.makedirs(OUT, exist_ok=True)

CELL = (408, 680)
CARD = (480, 800)

# scene, painting, (centre x, centre y, zoom), figures: [(cut-out, height share, x share, y share of the foot)]
CHAPTERS = [
    ('sphinx', ART + 'sphinx/gorge.webp', (0.5, 0.5, 1.0), [('sphinx/sphinx', 0.8, 0.5, 0.97)]),
    ('prologue', SRC + 'primavera.jpg', (0.13, 0.32, 1.7), [('garden/graces', 0.7, 0.5, 0.96)]),
    ('crib', SRC + 'hector-hayez.jpg', (0.7, 0.45, 1.4), [('crib/hector', 0.82, 0.5, 0.98)]),
    ('icarus', SRC + 'icarus-gowy.jpg', (0.72, 0.82, 1.5), [('icarus/icarus', 0.42, 0.5, 0.72)]),
    ('sirens', SRC + 'sirens-waterhouse.jpg', (0.3, 0.5, 1.0), [('sirens/sirens-climbing', 0.52, 0.5, 0.92)]),
    ('orpheus', SRC + 'orpheus-corot.jpg', (0.25, 0.45, 1.25), [('orpheus/couple', 0.72, 0.5, 0.97)]),
    ('beethoven', SRC + 'beethoven-vision.jpg', (0.4, 0.35, 1.25), [('orpheus/beethoven', 0.46, 0.5, 0.96)]),
    ('medusa', SRC + 'medusa-burnejones.jpg', (0.5, 0.42, 1.1), [('medusa/shield', 0.42, 0.5, 0.86)]),
    ('persephone', SRC + 'persephone-crane.jpg', (0.13, 0.5, 1.0), [('persephone/maidens', 0.42, 0.5, 0.95)]),
    ('hades', SRC + 'charon-dore.jpg', (0.62, 0.42, 1.25), [('persephone/proserpine', 0.72, 0.5, 1.0)]),
    ('eros', SRC + 'psyche-box-waterhouse.jpg', (0.5, 0.42, 1.15), [('psyche/rapture', 0.9, 0.5, 0.99)]),
    ('choice', SRC + 'david-andromache.jpg', (0.5, 0.4, 1.1), [('crib/amphora', 0.46, 0.5, 0.95)]),
    ('endHold', SRC + 'hector-fright.jpg', (0.5, 0.5, 1.0), [('crib/andromache-face', 0.5, 0.5, 0.98)]),
    ('endLetGo', SRC + 'argus-engraving.jpg', (0.5, 0.5, 1.1), [('endings/argos', 0.34, 0.5, 0.96)]),
    ('afterlife', SRC + 'styx-patinir.jpg', (0.5, 0.45, 1.05), [('afterlife/elysium-lyre', 0.74, 0.5, 0.99)]),
    ('finale', SRC + 'elysium-schwabe-large.jpg', (0.5, 0.3, 1.25), [
        ('sirens/sirens-climbing', 0.26, 0.76, 0.5), ('icarus/icarus', 0.26, 0.26, 0.42), ('garden/graces', 0.42, 0.28, 0.98), ('orpheus/couple', 0.42, 0.72, 0.98),
    ]),
]


def painting(path, centre, size):
    cx, cy, zoom = centre
    im = Image.open(path).convert('RGB')
    W, H = im.size
    aspect = size[0] / size[1]
    h = min(H, W / aspect) / zoom
    w = h * aspect
    x0 = min(max(0, cx * W - w / 2), W - w)
    y0 = min(max(0, cy * H - h / 2), H - h)
    crop = im.crop((int(x0), int(y0), int(x0 + w), int(y0 + h))).resize(size, Image.LANCZOS)
    return ImageEnhance.Color(crop).enhance(1.25)


def figures(items, size):
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    for name, share, x, y in items:
        fig = Image.open(ART + name + '.webp').convert('RGBA')
        h = size[1] * share
        w = h * fig.width / fig.height
        if w > size[0] * 0.94:
            w = size[0] * 0.94
            h = w * fig.height / fig.width
        fig = fig.resize((int(w), int(h)), Image.LANCZOS)
        layer.alpha_composite(fig, (max(0, int(x * size[0] - w / 2)), max(0, int(y * size[1] - h))))
    return layer


def shadow(layer, blur, opacity):
    a = np.asarray(layer.split()[3]).astype(np.float32)
    im = Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(im).astype(np.float32) * opacity
    out = np.zeros(a.shape + (4,), np.uint8)
    out[..., 3] = a.astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def vignette(size, strength):
    h, w = size[1], size[0]
    y, x = np.mgrid[0:h, 0:w]
    d = np.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2))
    a = np.clip((d - 0.55) / 0.85, 0, 1) ** 1.5 * strength * 255
    # and the foot of the card goes dark, for its name
    foot = np.clip((y / h - 0.66) / 0.34, 0, 1) ** 1.3 * 235
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 3] = np.maximum(a, foot).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main():
    cols, rows = 6, 3
    panels = Image.new('RGB', (cols * CELL[0], rows * CELL[1]))
    figs = Image.new('RGBA', (cols * CELL[0], rows * CELL[1]), (0, 0, 0, 0))
    for i, (scene, path, centre, items) in enumerate(CHAPTERS):
        at = ((i % cols) * CELL[0], (i // cols) * CELL[1])
        panels.paste(painting(path, centre, CELL), at)
        figs.paste(figures(items, CELL), at)

        card = painting(path, centre, CARD).convert('RGBA')
        layer = figures(items, CARD)
        card.alpha_composite(shadow(layer, 12, 0.55), (0, 8))
        card.alpha_composite(layer)
        card.alpha_composite(vignette(CARD, 0.72))
        card.convert('RGB').save(OUT + f'card-{scene}.webp', quality=80, method=5)
    panels.save(OUT + 'panels.webp', quality=78, method=5)
    figs.save(OUT + 'figures.webp', quality=82, alpha_quality=95, exact=True, method=5)
    print('ok', panels.size)

    # a contact sheet, for looking at
    if len(sys.argv) > 1:
        sheet = Image.new('RGB', (cols * 300, rows * 500), (20, 20, 20))
        for i, ch in enumerate(CHAPTERS):
            c = Image.open(OUT + f'card-{ch[0]}.webp').resize((296, 493))
            sheet.paste(c, ((i % cols) * 300 + 2, (i // cols) * 500 + 3))
        sheet.save(sys.argv[1], quality=82)


if __name__ == '__main__':
    main()
