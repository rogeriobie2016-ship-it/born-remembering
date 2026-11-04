"""Icarus, re-cut: Gowy's Daedalus with his own wings; the fishermen and the rock from the 1730 engraving,
scissored out with a strip of bare paper; and clouds in layers.

Run from the repository root:  python -I art/tools/icarus.py
"""
import sys

sys.path.insert(0, 'art/tools')
import numpy as np
from PIL import Image, ImageDraw
from rembg import new_session
from scipy.ndimage import binary_dilation, binary_erosion, gaussian_filter

import cutlib as C

SRC = 'art/src/'
OUT = 'public/art/icarus/'
rng = np.random.default_rng(11)


def poly(size, pts):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(x * size[0], y * size[1]) for x, y in pts], fill=255)
    return np.asarray(m) > 128


def _g(k, j):
    """From a zoomed tracing of his legs to the coordinates of the whole crop."""
    return ((675 + 825 * k) / 1500, (460 + 860 * j - 30) / 1430)


LEGS = [_g(*q) for q in [
    (0.12, 0.33), (0.22, 0.36), (0.30, 0.44), (0.33, 0.45), (0.47, 0.445), (0.495, 0.39), (0.52, 0.33), (0.60, 0.285),
    (0.68, 0.19), (0.705, 0.115), (0.76, 0.105), (0.82, 0.135), (0.90, 0.14), (0.945, 0.19), (0.92, 0.215), (0.87, 0.20),
    (0.81, 0.19), (0.78, 0.215), (0.72, 0.29), (0.66, 0.385), (0.61, 0.47), (0.54, 0.57), (0.42, 0.60), (0.33, 0.60),
    (0.32, 0.615), (0.36, 0.655), (0.44, 0.665), (0.46, 0.72), (0.42, 0.77), (0.30, 0.83), (0.20, 0.92), (0.16, 0.985),
    (0.13, 0.98), (0.10, 0.90), (0.10, 0.80), (0.12, 0.70), (0.12, 0.63),
]]


def daedalus():
    session = new_session('isnet-general-use')
    crop = Image.open(SRC + 'icarus-gowy.jpg').convert('RGB').crop((0, 30, 1500, 1460))
    outline = [
        (0.16, 0.42), (0.21, 0.395), (0.27, 0.40), (0.30, 0.43), (0.345, 0.39), (0.40, 0.345), (0.43, 0.31), (0.445, 0.25),
        (0.455, 0.215), (0.52, 0.17), (0.60, 0.14), (0.70, 0.10), (0.80, 0.06), (0.88, 0.033), (0.95, 0.018), (0.93, 0.04),
        (0.87, 0.075), (0.855, 0.105), (0.80, 0.165), (0.72, 0.235), (0.66, 0.27), (0.625, 0.33), (0.58, 0.37), (0.50, 0.41),
        *LEGS,
        (0.50, 0.65), (0.45, 0.66), (0.445, 0.72),
        (0.46, 0.80), (0.43, 0.81), (0.42, 0.74), (0.38, 0.74), (0.36, 0.70), (0.38, 0.65), (0.29, 0.63), (0.24, 0.62),
        (0.25, 0.66), (0.20, 0.70), (0.18, 0.83), (0.10, 0.90), (0.05, 0.95), (0.02, 0.85), (0.0, 0.70), (0.02, 0.63),
        (0.08, 0.60), (0.16, 0.57), (0.16, 0.55), (0.15, 0.50), (0.145, 0.45),
    ]
    p = gaussian_filter(poly(crop.size, outline).astype(np.float32), 4) > 0.5
    r = C.rembg_mask(crop, session)
    # the machine's edge where it is close to the hand's; the hand's everywhere else
    m = (r & binary_dilation(p, iterations=5)) | binary_erosion(p, iterations=7)
    m = C.keep_large(gaussian_filter(m.astype(np.float32), 2.5) > 0.5, 0.05)
    C.save(C.trim(C.finish(np.asarray(crop), m)), OUT + 'daedalus.webp', 1400)


def scissored(src, box, pts, canvas, name, size):
    """Engraving cut with scissors: points in pixels of a `canvas`-sized view of `box`."""
    crop = src.crop(box)
    m = poly(crop.size, [(x / canvas[0], y / canvas[1]) for x, y in pts])
    C.save(C.trim(C.paper_edge(np.asarray(crop), m, width=5, colour=(226, 216, 196))), OUT + name, size)


def engraving():
    src = Image.open(SRC + 'icarus-engraving.jpg').convert('RGB')
    scissored(src, (560, 3250, 1660, 4200), [
        (38, 240), (60, 205), (85, 195), (105, 215), (92, 88), (110, 72), (128, 95), (135, 132), (160, 126), (190, 135),
        (196, 165), (225, 176), (245, 165), (270, 153), (285, 130), (300, 124), (304, 150), (287, 176), (330, 190),
        (366, 215), (366, 245), (352, 265), (430, 272), (450, 240), (420, 210), (370, 196), (408, 164), (445, 176),
        (462, 180), (470, 132), (440, 104), (405, 74), (386, 40), (406, 48), (440, 84), (500, 100), (505, 60), (525, 41),
        (552, 60), (552, 110), (532, 150), (592, 260), (682, 372), (650, 378), (590, 302), (586, 288), (522, 348),
        (470, 372), (540, 388), (420, 398), (300, 392), (180, 400), (60, 392), (36, 372), (34, 345),
    ], (717, 620), 'boat.webp', 1200)
    scissored(src, (2420, 3280, 3300, 4200), [
        (34, 262), (60, 186), (86, 150), (165, 155), (180, 130), (186, 90), (215, 55), (300, 35), (350, 45), (405, 85),
        (420, 130), (440, 200), (441, 290), (446, 400), (440, 470), (300, 480), (150, 476), (30, 470),
    ], (478, 500), 'rock.webp', 1100)


def fbm(n, octaves=6, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    amp = 1.0
    for o in range(octaves):
        s = n / (2 ** (o + 1))
        out += gaussian_filter(r.standard_normal((n, n)).astype(np.float32), s, mode='wrap') * s * amp
        amp *= 0.62
    return (out - out.min()) / (out.max() - out.min())


def clouds():
    """Baroque cumulus: heaped from lit balls, so each swell has a bright top and a blue-grey belly,
    with edges broken by noise and Gowy's canvas in the paint."""
    cell = 512
    atlas = np.zeros((cell * 2, cell * 2, 4), np.uint8)
    canvas = np.asarray(Image.open(SRC + 'icarus-gowy.jpg').convert('L').crop((60, 60, 572, 572))).astype(np.float32) / 255
    canvas = canvas - gaussian_filter(canvas, 14)
    L = np.array([-0.35, -0.72, 0.6])
    L = L / np.linalg.norm(L)
    for i in range(4):
        # displaced coordinates: edges that billow
        dx = (fbm(cell, seed=i + 40) - 0.5) * 70 + (fbm(cell, octaves=3, seed=i + 120) - 0.5) * 14
        dy = (fbm(cell, seed=i + 80) - 0.5) * 70 + (fbm(cell, octaves=3, seed=i + 160) - 0.5) * 14
        yy, xx = np.mgrid[0:cell, 0:cell].astype(np.float32)
        xx += dx
        yy += dy
        z = np.full((cell, cell), -1e9, np.float32)
        nx = np.zeros((cell, cell), np.float32)
        ny = np.zeros((cell, cell), np.float32)
        nz = np.ones((cell, cell), np.float32)
        base = cell * 0.72
        for b in range(110):
            u = rng.uniform(-1, 1)
            cx = cell / 2 + u * cell * 0.36
            top = (1 - u * u) * cell * 0.42
            cy = base - rng.uniform(0, 1) ** 1.2 * top
            r = rng.uniform(0.035, 0.12) * cell * (1.15 - 0.4 * (base - cy) / (cell * 0.42))
            d2 = (xx - cx) ** 2 + (yy - cy) ** 2
            inside = d2 < r * r
            h = np.sqrt(np.maximum(r * r - d2, 0))
            cz = rng.uniform(-30, 30)
            w = inside & (cz + h > z)
            z[w] = (cz + h)[w]
            nx[w] = ((xx - cx) / r)[w]
            ny[w] = ((yy - cy) / r)[w]
            nz[w] = (h / r)[w]
        mask = z > -1e8
        mask &= yy < base + 14  # a flat belly
        lit = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
        lit = gaussian_filter(lit, 4.5)
        lit = np.clip(lit * 0.82 + 0.26, 0, 1)
        shadow = np.array([0.47, 0.54, 0.67], np.float32)
        mid = np.array([0.80, 0.80, 0.80], np.float32)
        light = np.array([1.0, 0.97, 0.88], np.float32)
        k = lit[..., None]
        rgb = np.where(k < 0.55, shadow + (mid - shadow) * (k / 0.55), mid + (light - mid) * ((k - 0.55) / 0.45))
        # the engraver's hatching, only in the shade
        hatch = 0.5 + 0.5 * np.sin((xx * 0.8 + yy) * 0.9)
        rgb *= 1 - (1 - k) * 0.16 * hatch[..., None]
        rgb = np.clip(rgb + canvas[..., None] * 0.5, 0, 1)
        a = gaussian_filter(mask.astype(np.float32), 2.2)
        cellimg = np.dstack([rgb * 255, a * 255]).astype(np.uint8)
        atlas[(i // 2) * cell:(i // 2 + 1) * cell, (i % 2) * cell:(i % 2 + 1) * cell] = cellimg
    Image.fromarray(atlas, 'RGBA').save(OUT + 'clouds.webp', quality=80, alpha_quality=90, exact=True, method=5)
    print('clouds', atlas.shape)


if __name__ == '__main__':
    daedalus()
    engraving()
    clouds()
