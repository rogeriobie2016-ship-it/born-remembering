"""The painted hand and the crib's linen, both from Leighton's Orpheus and Eurydice.

The hand is Orpheus's own, the one on her back: the only hand in the collection sharp enough to fill a headset.
Leighton left it deep in shadow, so its darks are lifted; the forearm, already lit, is lifted far less.

Run from the repository root:  python -I art/tools/hands.py
"""
import sys

sys.path.insert(0, 'art/tools')
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, gaussian_filter

import cutlib as C

SRC = 'art/src/orpheus-leighton.jpg'
OUT = 'public/art/crib/'
BOX = (1200, 1500, 2650, 2260)
PALM = (2270, 1900)  # the point the hand turns around
AXIS_DEG = 61.3  # turns the fingers to point straight up
METRES_PER_PX = 0.165 / 480  # wrist to fingertip is 480 px; a hand is about 16.5 cm

OUTLINE = [
    (1240, 1745), (1300, 1785), (1400, 1826), (1500, 1876), (1600, 1925), (1700, 1950), (1800, 1975), (1900, 1994),
    (2000, 2016), (2050, 2022), (2110, 2010), (2115, 1950), (2120, 1890), (2150, 1805), (2180, 1765), (2205, 1725),
    (2230, 1722), (2245, 1710), (2270, 1660), (2295, 1650), (2350, 1610), (2400, 1570), (2440, 1554), (2465, 1557),
    (2474, 1575), (2500, 1575), (2525, 1582), (2536, 1600), (2525, 1617), (2475, 1645), (2430, 1675), (2380, 1730),
    (2360, 1765), (2362, 1785), (2400, 1777), (2460, 1760), (2510, 1747), (2560, 1745), (2575, 1755), (2576, 1775),
    (2560, 1795), (2500, 1815), (2450, 1835), (2410, 1850), (2385, 1890), (2390, 1918), (2425, 1915), (2490, 1906),
    (2545, 1901), (2561, 1915), (2560, 1932), (2540, 1947), (2475, 1962), (2430, 1980), (2400, 2005), (2382, 2050),
    (2340, 2068), (2300, 2098), (2260, 2132), (2220, 2158), (2185, 2178), (2000, 2190), (1800, 2185), (1600, 2172),
    (1500, 2158), (1400, 2135), (1240, 2080),
]


def hand():
    im = Image.open(SRC).convert('RGB').crop(BOX)
    W, H = im.size
    rgb = np.asarray(im).astype(np.float32) / 255
    x = (np.arange(W) + BOX[0])[None, :, None]
    k = np.clip((x - 2030) / 200, 0, 1)
    k = k * k * (3 - 2 * k)
    gamma = 0.95 + (0.56 - 0.95) * k  # the hand comes up out of its shadow, the arm hardly at all
    lifted = rgb ** gamma
    lifted = np.clip(lifted * (1 + k * (np.array([1.05, 0.98, 0.92]) - 1)), 0, 1)
    # the shadow under the hand is olive where it falls on her dress: take the green out of it
    olive = np.clip((lifted[..., 1] / np.maximum(lifted[..., 0], 1e-3) - 0.78) / 0.12, 0, 1) * k[..., 0]
    lifted[..., 1] = lifted[..., 1] * (1 - olive) + lifted[..., 0] * 0.74 * olive
    rgb8 = (lifted * 255).astype(np.uint8)

    pts = [((px - BOX[0]) / W, (py - BOX[1]) / H) for px, py in OUTLINE]
    mask = C.polygon_mask((W, H), pts)
    mask = binary_erosion(gaussian_filter(mask.astype(np.float32), 5) > 0.5, iterations=3)  # polygon corners into curves, and off the edge
    cut = np.asarray(C.finish(rgb8, mask, feather=1.6)).copy()
    # the arm dissolves toward the elbow rather than ending in a straight cut
    fade = np.clip((np.arange(W) + BOX[0] - 1240) / 240, 0, 1)
    cut[..., 3] = (cut[..., 3] * (fade * fade * (3 - 2 * fade))[None, :]).astype(np.uint8)

    out = Image.fromarray(cut, 'RGBA').rotate(AXIS_DEG, Image.BICUBIC, expand=True)
    # where the palm landed
    a = np.radians(AXIS_DEG)
    dx, dy = PALM[0] - BOX[0] - W / 2, PALM[1] - BOX[1] - H / 2
    px = out.width / 2 + dx * np.cos(a) + dy * np.sin(a)
    py = out.height / 2 - dx * np.sin(a) + dy * np.cos(a)
    bb = out.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    bb = (max(0, bb[0] - 4), max(0, bb[1] - 4), min(out.width, bb[2] + 4), min(out.height, bb[3] + 4))
    out = out.crop(bb)
    px, py = px - bb[0], py - bb[1]
    print('hand metres', round(out.width * METRES_PER_PX, 4), round(out.height * METRES_PER_PX, 4), 'palm uv', round(px / out.width, 4), round(1 - py / out.height, 4))
    C.save(out, OUT + 'hand.webp', 1280)


def linen():
    """A sheet: the plain part of her gown, its edges let go unevenly so it lies on nothing in particular."""
    im = Image.open(SRC).convert('RGB').crop((2320, 2540, 3190, 3640))
    W, H = im.size
    rgb = np.asarray(im)
    rng = np.random.default_rng(7)
    n = gaussian_filter(rng.standard_normal((H, W)), 38)
    n /= np.abs(n).max()
    yy, xx = np.mgrid[0:H, 0:W]
    e = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)) / 90.0
    alpha = np.clip(e + n * 0.5 - 0.45, 0, 1)
    alpha = gaussian_filter(alpha * alpha * (3 - 2 * alpha), 2)
    out = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    C.save(Image.fromarray(out.astype(np.uint8), 'RGBA'), OUT + 'linen.webp', 1024)


hand()
linen()
