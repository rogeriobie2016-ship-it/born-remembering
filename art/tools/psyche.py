"""Eros and Psyche: the paintings, in layers. Each window of the scene is a painting with its figure lifted
out and the gap filled from the painting itself, so the two can come apart in depth when you draw near.

Run from the repository root:  python -I art/tools/psyche.py [only]
"""
import os
import sys

sys.path.insert(0, 'art/tools')
import numpy as np
from PIL import Image, ImageEnhance
from rembg import new_session
from scipy.ndimage import binary_dilation, distance_transform_edt, gaussian_filter

import cutlib as C

SRC = 'art/src/'
OUT = 'public/art/psyche/'
os.makedirs(OUT, exist_ok=True)
session = new_session('isnet-general-use')


def fill_behind(rgb, mask, grow=10, blur=16):
    """The painting with the figure gone: the gap takes the colour of the nearest paint, softened."""
    gap = binary_dilation(mask, iterations=grow)
    idx = distance_transform_edt(gap, return_distances=False, return_indices=True)
    filled = rgb[idx[0], idx[1]].astype(np.float32)
    soft = np.dstack([gaussian_filter(filled[..., i], blur) for i in range(3)])
    k = gaussian_filter(gap.astype(np.float32), 4)[..., None]
    return np.clip(rgb * (1 - k) + soft * k, 0, 255).astype(np.uint8)


def layered(name, src, box=None, keep=None, max_size=1600, back_size=1400):
    """<name>-back.webp and <name>.webp. `keep` (polygon in 0..1 of the crop) limits the mask to the figure."""
    im = Image.open(SRC + src).convert('RGB')
    if box:
        im = im.crop(box)
    rgb = np.asarray(im)
    mask = C.rembg_mask(im, session)
    if keep:
        mask = mask & C.polygon_mask(im.size, keep)
        mask = C.keep_large(mask, 0.05)
    full = C.finish(rgb, mask)
    cut = C.trim(full)
    # where the figure sits in its painting: ErosScene.js needs it to start exactly in place
    bb = full.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    W, H = im.size
    print(name, 'box', [round(max(0, bb[0] - 4) / W, 4), round(max(0, bb[1] - 4) / H, 4), round(min(W, bb[2] + 4) / W, 4), round(min(H, bb[3] + 4) / H, 4)])
    C.save(cut, OUT + name + '.webp', max_size)
    _back(rgb, mask, name, back_size)


def _back(rgb, mask, name, size):
    back = Image.fromarray(fill_behind(rgb, mask))
    back.thumbnail((size, size), Image.LANCZOS)
    back.save(OUT + name + '-back.webp', quality=84, method=5)


def plate(name, src, box=None, size=1200):
    im = Image.open(SRC + src).convert('RGB')
    if box:
        im = im.crop(box)
    im.thumbnail((size, size), Image.LANCZOS)
    im.save(OUT + name + '.webp', quality=84, method=5)
    print(name, im.size)


def mural():
    """Burne-Jones's room, with the arch of the doorway in the wall let through as nothing."""
    from scipy.ndimage import binary_opening

    im = Image.open(SRC + 'psyche-bj-lamp.jpg').convert('RGB')
    rgb = np.asarray(im)
    white = rgb.min(axis=2) > 225
    hole = C.keep_large(binary_opening(white, iterations=2), 0.5)
    hole = binary_dilation(hole, iterations=3)
    out = C.finish(rgb, ~hole, 1.2)
    out = out.resize((out.width * 2, out.height * 2), Image.LANCZOS)
    C.save(out, OUT + 'lamp-mural.webp')


def sleeper():
    """Him, from the same mural: asleep on his wing. Traced by hand, enlarged, the paint left soft."""
    im = Image.open(SRC + 'psyche-bj-lamp.jpg').convert('RGB').crop((30, 40, 420, 240))
    im = im.resize((im.width * 3, im.height * 3), Image.BICUBIC)
    # head, raised arm, chest and the wing he sleeps on: the coverlet in the scene hides the rest
    poly = [(0.555, 0.25), (0.59, 0.262), (0.60, 0.32), (0.635, 0.345), (0.655, 0.42), (0.70, 0.44), (0.72, 0.56),
            (0.66, 0.74), (0.58, 0.86), (0.48, 0.92), (0.38, 0.86), (0.36, 0.70), (0.38, 0.60), (0.40, 0.55), (0.435, 0.50),
            (0.48, 0.47), (0.505, 0.42), (0.525, 0.33)]
    mask = C.polygon_mask(im.size, poly)
    C.save(C.trim(C.finish(np.asarray(im), mask, 7.0), 24), OUT + 'eros.webp')


def night_wood():
    """The dark trees at the back of Waterhouse's painting, gone to moonlight, for the ring around the scene."""
    im = Image.open(SRC + 'psyche-box-waterhouse.jpg').convert('RGB')
    W, H = im.size
    wood = im.crop((0, int(H * 0.0), int(W * 0.62), int(H * 0.2)))
    wood = ImageEnhance.Color(wood).enhance(0.45)
    a = np.asarray(wood, dtype=np.float32) / 255
    a = a ** 0.9 * np.array([0.5, 0.62, 0.9])
    # mirrored, so it wraps without a seam
    a = np.concatenate([a, a[:, ::-1]], axis=1)
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    out.thumbnail((1536, 1536), Image.LANCZOS)
    out.save(OUT + 'night-wood.webp', quality=80, method=5)
    print('night-wood', out.size)


JOBS = {
    'box': lambda: layered('box', 'psyche-box-waterhouse.jpg'),
    'garden': lambda: layered('garden', 'psyche-garden-waterhouse.jpg'),
    'rapture': lambda: layered('rapture', 'psyche-bouguereau.jpg'),
    'fountain': lambda: plate('fountain', 'psyche-bj-fountain.jpg'),
    'olympus': lambda: plate('olympus', 'psyche-bj-olympus.jpg', (0, 560, 6872, 3713), 1800),
    'mural': mural,
    'sleeper': sleeper,
    'cloth': lambda: plate('cloth', 'psyche-bj-lamp.jpg', (40, 20, 112, 200), 512),
    'night': night_wood,
}

if __name__ == '__main__':
    for key in sys.argv[1:] or JOBS:
        JOBS[key]()
