"""Orpheus, re-cut. Rubens's couple (Prado, 1636-38) replaces the tiny figures of Corot's grove;
Leighton's embrace is cut again at full resolution.

Run from the repository root:  python -I art/tools/orpheus.py
"""
import sys

sys.path.insert(0, 'art/tools')
import numpy as np
from PIL import Image, ImageDraw
from rembg import new_session
from scipy.ndimage import binary_erosion, gaussian_filter

import cutlib as C

SRC = 'art/src/'
OUT = 'public/art/orpheus/'
session = new_session('isnet-general-use')


def poly(size, box, pts, origin=(0, 0)):
    """A mask on an image of `size`, the points given as 0..1 inside `box` (in source pixels)."""
    x0, y0, x1, y1 = box
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(x0 + (x1 - x0) * x - origin[0], y0 + (y1 - y0) * y - origin[1]) for x, y in pts], fill=255)
    return np.asarray(m) > 128


def rubens():
    src = Image.open(SRC + 'orpheus-rubens.jpg').convert('RGB')
    box = (40, 200, 1460, 2240)
    org = box[:2]
    crop = src.crop(box)
    size = crop.size
    rgb = np.asarray(crop).copy()

    TOP = (40, 240, 800, 1000)
    LOW = (40, 1300, 1420, 2200)

    # Pluto's foot lies across her drapery: paint it out with the drapery just above it
    foot = poly(size, LOW, [(0.69, 0.355), (0.75, 0.31), (0.81, 0.235), (0.87, 0.22), (0.875, 0.42), (0.77, 0.455), (0.70, 0.43)], org)
    soft = gaussian_filter(foot.astype(np.float32), 5)[..., None]
    shift = int(0.21 * (LOW[3] - LOW[1]))
    donor = np.roll(rgb, shift, axis=0)
    rgb = (rgb * (1 - soft) + donor * soft).astype(np.uint8)

    base = C.rembg_mask(crop, session)
    head = poly(size, TOP, [
        (0.135, 0.19), (0.10, 0.125), (0.12, 0.09), (0.17, 0.07), (0.24, 0.06), (0.31, 0.075), (0.36, 0.10),
        (0.43, 0.09), (0.435, 0.06), (0.465, 0.05), (0.475, 0.10), (0.52, 0.14), (0.545, 0.21), (0.60, 0.22),
        (0.63, 0.24), (0.70, 0.225), (0.76, 0.20), (0.80, 0.185), (0.805, 0.23), (0.765, 0.26), (0.76, 0.31),
        (0.71, 0.345), (0.665, 0.36), (0.66, 0.39), (0.70, 0.46), (0.55, 0.5), (0.3, 0.5), (0.25, 0.42),
        (0.20, 0.395), (0.18, 0.37), (0.165, 0.31), (0.148, 0.285), (0.16, 0.24),
    ], org)
    hand = poly(size, TOP, [(0.30, 0.42), (0.24, 0.44), (0.14, 0.52), (0.09, 0.58), (0.07, 0.66), (0.10, 0.76), (0.16, 0.80), (0.25, 0.79), (0.30, 0.74)], org)
    rear = poly(size, LOW, [
        (0.26, 0.05), (0.50, 0.02), (0.50, 0.30), (0.52, 0.38), (0.60, 0.50), (0.70, 0.55), (0.71, 0.65),
        (0.66, 0.70), (0.60, 0.68), (0.54, 0.60), (0.50, 0.45), (0.41, 0.30), (0.36, 0.33), (0.32, 0.32), (0.26, 0.18),
    ], org)
    pluto = poly(size, LOW, [(0.865, -0.05), (1.1, -0.05), (1.1, 1.2), (0.80, 1.2), (0.80, 0.60), (0.835, 0.54), (0.86, 0.44), (0.875, 0.30), (0.875, 0.15)], org)
    # the steps between their legs
    gap = poly(size, LOW, [(0.27, 0.42), (0.36, 0.34), (0.44, 0.36), (0.50, 0.47), (0.53, 0.62), (0.545, 0.74), (0.455, 0.80), (0.27, 0.86)], org)
    # his leg and hers stand on the dark steps: the steps are not figure
    steps = poly(size, LOW, [(0, 0.83), (0.09, 0.83), (0.2, 0.86), (0.28, 0.82), (0.44, 0.84), (0.5, 0.875), (0.62, 0.84), (0.72, 0.79), (0.86, 0.80), (1.1, 0.80), (1.1, 1.2), (0, 1.2)], org)

    couple = ((base | head | hand | rear) & ~pluto & ~steps & ~gap)
    couple = C.keep_large(couple, 0.05)
    C.save(C.trim(C.finish(rgb, couple)), OUT + 'couple.webp', 1600)

    # Orpheus alone: everything on his side of her
    Z = (100, 240, 1420, 2200)
    his = poly(size, Z, [
        (-0.1, -0.1), (0.42, -0.1), (0.42, 0.10), (0.385, 0.14), (0.37, 0.20), (0.385, 0.33), (0.40, 0.40), (0.44, 0.45),
        (0.462, 0.49), (0.455, 0.52), (0.41, 0.525), (0.37, 0.515), (0.345, 0.50), (0.325, 0.585), (0.22, 0.592), (0.205, 0.65), (0.2, 0.75), (0.26, 1.1), (-0.1, 1.1),
    ], org)
    solo = C.keep_large(couple & his, 0.05)
    C.save(C.trim(C.finish(rgb, solo)), OUT + 'orpheus.webp', 1600)


def leighton():
    src = Image.open(SRC + 'orpheus-leighton.jpg').convert('RGB')
    w, h = src.size
    m = C.rembg_mask(src.resize((w // 2, h // 2), Image.LANCZOS), session)
    m = np.asarray(Image.fromarray(m).resize((w, h), Image.BILINEAR)) > 0
    m = binary_erosion(m, iterations=3)
    rgb = np.asarray(src)
    # the lyre and its plinth read as a block beside them: they go
    yy, xx = np.nonzero(m)
    x0, x1, y0, y1 = xx.min(), xx.max(), yy.min(), yy.max()
    frame = (x0, y0, x1, y1)
    lyre = poly((w, h), frame, [(-0.1, 0.08), (0.19, 0.08), (0.19, 0.29), (0.03, 0.46), (-0.1, 0.5)])
    plinth = poly((w, h), frame, [(-0.1, 0.55), (0.03, 0.585), (0.13, 0.575), (0.2, 0.70), (0.21, 1.1), (-0.1, 1.1)])
    m = C.keep_large(m & ~lyre & ~plinth, 0.05)
    img = C.finish(rgb, m, feather=1.6)
    # the canvas ends at their knees: there the paint goes into the mist
    a = np.asarray(img).copy()
    ramp = np.clip((y1 - np.arange(h)) / (0.10 * (y1 - y0)), 0, 1) ** 1.4
    a[..., 3] = (a[..., 3] * ramp[:, None]).astype(np.uint8)
    C.save(C.trim(Image.fromarray(a, 'RGBA')), OUT + 'leighton.webp', 1500)


def corot():
    """The grove itself, in pieces: its leaves for 3D crowns, its mourners, its flowering undergrowth."""
    src = Image.open(SRC + 'orpheus-corot.jpg').convert('RGB')
    W, H = src.size
    rng = np.random.default_rng(5)
    a = np.asarray(src).astype(np.float32) / 255

    # crowns: stippled clumps of his foliage, feathered by his own brushwork
    cell = 256
    atlas = np.zeros((cell * 4, cell * 4, 4), np.uint8)
    side = 620
    for i in range(16):
        x = int(rng.uniform(0.40, 0.80) * W)
        y = int(rng.uniform(0.02, 0.38) * H)
        crop = np.asarray(src.crop((x, y, x + side, y + side)).resize((cell, cell), Image.LANCZOS)).astype(np.float32) / 255
        lum = crop.mean(-1)
        detail = lum - gaussian_filter(lum, 4)
        yy, xx = np.mgrid[0:cell, 0:cell] / (cell - 1) * 2 - 1
        ang = np.arctan2(yy, xx)
        r = np.hypot(xx, yy)
        edge = 0.84 + sum(rng.uniform(0.01, 0.035) * np.sin(ang * k + rng.uniform(0, 6.28)) for k in range(2, 9))
        # his pale lights are the sky through the leaves: holes here, too
        v = (edge - r) * 4.5 + detail * 13 - np.clip(lum - 0.42, 0, 1) * 9
        alpha = np.clip(v * 1.5, 0, 1)
        alpha = gaussian_filter(alpha, 0.6)
        col = np.clip(crop ** 0.85 * 1.1, 0, 1)
        col = gaussian_filter(col, (1.0, 1.0, 0))
        col[alpha < 0.4] = np.clip(col[alpha > 0.8].mean(0), 0, 1) if (alpha > 0.8).any() else col[alpha < 0.4]
        atlas[(i // 4) * cell:(i // 4 + 1) * cell, (i % 4) * cell:(i % 4 + 1) * cell] = np.dstack([col * 255, alpha * 255]).astype(np.uint8)
    Image.fromarray(atlas, 'RGBA').save(OUT + 'grove-crown.webp', quality=78, alpha_quality=90, exact=True, method=5)

    # the damp turf of his foreground
    src.crop((int(0.03 * W), int(0.705 * H), int(0.50 * W), int(0.775 * H))).resize((1024, 300), Image.LANCZOS).save(OUT + 'grove-ground.webp', quality=78, method=5)

    # the mourners: dark on pale mist, so the matte is simply how dark they are
    for name, (x0, x1) in {'shades-a': (0.388, 0.448), 'shades-b': (0.452, 0.535)}.items():
        box = (int(x0 * W), int(0.585 * H), int(x1 * W), int(0.745 * H))
        crop = np.asarray(src.crop(box)).astype(np.float32) / 255
        lum = gaussian_filter(crop.mean(-1), 1)
        bg = np.percentile(lum, 88)
        m = np.clip((bg - lum) / (bg * 0.42), 0, 1)
        h, w = m.shape
        yy, xx = np.mgrid[0:h, 0:w] / np.array([h - 1, w - 1])[:, None, None]
        # no hard frame: they thin out towards the sides, and sink into the ground mist at the feet
        win = np.clip(xx / 0.08, 0, 1) * np.clip((1 - xx) / 0.08, 0, 1) * np.clip(yy / 0.05, 0, 1) * np.clip((1 - yy) / 0.28, 0, 1)
        alpha = m * win
        col = np.clip(crop * 0.8, 0, 1)
        out = (np.dstack([col, alpha]) * 255).astype(np.uint8)
        C.save(C.trim(Image.fromarray(out, 'RGBA'), pad=2), OUT + name + '.webp', 700)

    # the undergrowth, with its roses: four tufts
    cell = 384
    atlas = np.zeros((cell * 2, cell * 2, 4), np.uint8)
    for i, cx in enumerate((0.10, 0.20, 0.31, 0.42)):
        w = 0.085 * W
        box = (int(cx * W - w / 2), int(0.775 * H), int(cx * W + w / 2), int(0.775 * H + w * 0.8))
        crop = np.asarray(src.crop(box).resize((cell, cell), Image.LANCZOS)).astype(np.float32) / 255
        lum = crop.mean(-1)
        detail = lum - gaussian_filter(lum, 6)
        yy, xx = np.mgrid[0:cell, 0:cell] / (cell - 1)
        dome = 0.08 + 0.62 * (2 * np.abs(xx - 0.5)) ** 1.7
        v = (yy - dome) * 9 + detail * 18
        alpha = gaussian_filter(np.clip(v, 0, 1), 0.8) * np.clip((1 - np.abs(xx - 0.5) * 2) * 8, 0, 1) * np.clip((1 - yy) * 14, 0, 1)
        col = np.clip(crop ** 0.85 * 1.2, 0, 1)
        atlas[(i // 2) * cell:(i // 2 + 1) * cell, (i % 2) * cell:(i % 2 + 1) * cell] = np.dstack([col * 255, alpha * 255]).astype(np.uint8)
    Image.fromarray(atlas, 'RGBA').save(OUT + 'grove-tufts.webp', quality=80, alpha_quality=90, exact=True, method=5)


def beethoven():
    """Hausleithner's Beethoven: the same outline as before, without its jagged edge."""
    im = np.asarray(Image.open(OUT + 'beethoven.webp').convert('RGBA'))
    big = Image.fromarray(im).resize((im.shape[1] * 2, im.shape[0] * 2), Image.LANCZOS)
    b = np.asarray(big)
    m = gaussian_filter((b[..., 3] > 128).astype(np.float32), 3) > 0.5
    # eat one pixel, so that no background is left at the rim
    m = binary_erosion(m, iterations=3)
    C.save(C.trim(C.finish(b[..., :3], m, feather=1.6)), OUT + 'beethoven.webp', 1300)


if __name__ == '__main__':
    what = sys.argv[1:] or ['rubens', 'leighton', 'corot', 'beethoven']
    for name in what:
        globals()[name]()
