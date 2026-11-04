"""Before/after sheets for cut-outs: before (from git HEAD) on the left, after (working tree) on the right, each half on
magenta and half on white, to expose halos and leftovers. Written to docs/recortes/<folder>-<name>.jpg.

Run from the project root, with the rembg venv:
    python -I art/tools/beforeafter.py sirens/ulysses orpheus/orpheus ...
    python -I art/tools/beforeafter.py                                  # the cut-outs re-cut by recut.py
"""
import io
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = 'docs/recortes/'
MAX_W = 1400
PANEL_H = 900
LABEL_H = 34
GAP = 12
MAGENTA = (255, 0, 255, 255)
WHITE = (255, 255, 255, 255)
DEFAULT = """sirens/ulysses sirens/siren-rope sirens/sirens-climbing sirens/harpy-a sirens/harpy-b sirens/harpy-left sirens/harpy-mast
sirens/harpy-right garden/mercury garden/flora garden/cupid garden/hora crib/amphora crib/andromache-face afterlife/elysium-lyre
endings/argos sphinx/sphinx medusa/stone-graces medusa/stone-mercury medusa/stone-siren""".split()


def font(size):
    try:
        return ImageFont.truetype('arial.ttf', size)
    except OSError:
        return ImageFont.load_default()


def before(name):
    """The cut-out as committed at HEAD, or None if there is none."""
    r = subprocess.run(['git', 'show', f'HEAD:public/art/{name}.webp'], capture_output=True)
    if r.returncode or not r.stdout:
        return None
    return Image.open(io.BytesIO(r.stdout)).convert('RGBA')


def after(name):
    path = f'public/art/{name}.webp'
    return Image.open(path).convert('RGBA') if os.path.exists(path) else None


def panel(img, title, box_w, box_h):
    """box_w x box_h: left half magenta, right half white, the cut centred across the seam."""
    p = Image.new('RGBA', (box_w, box_h + LABEL_H), (28, 28, 28, 255))
    bg = Image.new('RGBA', (box_w, box_h), WHITE)
    bg.paste(Image.new('RGBA', (box_w // 2, box_h), MAGENTA), (0, 0))
    if img is not None:
        s = min(box_w / img.width, box_h / img.height, 1.0)
        size = (max(1, round(img.width * s)), max(1, round(img.height * s)))
        scaled = img.resize(size, Image.LANCZOS, reducing_gap=3.0) if s < 1 else img
        bg.alpha_composite(scaled, ((box_w - size[0]) // 2, (box_h - size[1]) // 2))
        title += f'  {img.width}x{img.height}'
    else:
        title += '  (none)'
    p.paste(bg, (0, LABEL_H))
    ImageDraw.Draw(p).text((8, 7), title, fill=(240, 240, 240), font=font(18))
    return p


def sheet(name):
    b, a = before(name), after(name)
    if a is None and b is None:
        print(name, ': nothing to show')
        return
    box_w = (MAX_W - GAP) // 2
    # shrink the panels to the cuts' shape, so a tall figure does not sit in a wide empty sheet
    aspects = [i.width / i.height for i in (b, a) if i is not None]
    box_w = min(box_w, max(420, round(max(aspects) * PANEL_H)))
    box_h = min(PANEL_H, max(320, round(box_w / max(aspects))))
    left = panel(b, 'BEFORE', box_w, box_h)
    right = panel(a, 'AFTER', box_w, box_h)
    out = Image.new('RGB', (box_w * 2 + GAP, box_h + LABEL_H), (28, 28, 28))
    out.paste(left.convert('RGB'), (0, 0))
    out.paste(right.convert('RGB'), (box_w + GAP, 0))
    os.makedirs(OUT, exist_ok=True)
    path = OUT + name.replace('/', '-') + '.jpg'
    out.save(path, quality=80)
    print(path, out.size)


if __name__ == '__main__':
    for n in sys.argv[1:] or DEFAULT:
        sheet(n.removesuffix('.webp').removeprefix('public/art/'))
