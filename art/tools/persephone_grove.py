"""The walkable garden's plants, cut from the paintings themselves.

  grove-crown.webp   4x4 atlas of foliage clumps from Botticelli's orange grove (Primavera);
                     its oranges are turned to pomegranates, to match the fruit you can pick.
  grove-bark.webp    bark, from Botticelli's trunks (tiles along its length).
  grove-tufts.webp   2x2 atlas of narcissus tufts from Crane's meadow.
  grove-ground.webp  the turf underfoot, from the same bank.

Run from the repository root:  python art/tools/persephone_grove.py
"""
import colorsys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

SRC = 'art/src/'
OUT = 'public/art/persephone/'
rng = np.random.default_rng(7)


def blob(size, lobes=9, seed=0):
    """An irregular round mask: the outline of a clump of leaves."""
    r = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size] / (size - 1) * 2 - 1
    a = np.arctan2(y, x)
    d = np.hypot(x, y)
    edge = 0.72 * np.ones_like(a)
    for k in range(2, lobes):
        edge += r.uniform(0.012, 0.05) * np.sin(a * k + r.uniform(0, 6.28))
    return d < edge


def pomegranates(rgb):
    """Botticelli's oranges, ripened to the fruit of this story."""
    a = rgb.astype(float) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    orange = np.clip((r - b - 0.25) * 4, 0, 1) * np.clip((r - g - 0.08) * 6, 0, 1)
    orange = ndi.gaussian_filter(orange, 1)
    red = np.stack([r * 0.92, g * 0.28, b * 0.42], -1)
    out = a * (1 - orange[..., None]) + red * orange[..., None]
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def lift(rgb, gamma=0.72, gain=1.12, floor=(26, 30, 18)):
    """The grove is nearly black; here it stands in daylight, so its shadows open a little."""
    a = (rgb.astype(float) / 255) ** gamma * gain
    a = a + np.array(floor) / 255 * (1 - a)
    return (np.clip(a, 0, 1) * 255).astype(np.uint8)


def harvest_leaves():
    """Every leaf, sprig and fruit of the grove, each lifted out on its own."""
    src = np.asarray(Image.open(SRC + 'primavera.jpg').convert('RGB'))
    leaves, fruit = [], []
    # the canopy either side of Cupid, below the painting's top edge
    for x0, x1 in ((130, 1430), (2320, 3700)):
        part = src[175:430, x0:x1]
        lum = part.astype(float).mean(-1)
        lab, n = ndi.label(ndi.gaussian_filter(lum, 0.7) > 30)
        for i, box in enumerate(ndi.find_objects(lab)):
            h = box[0].stop - box[0].start
            w = box[1].stop - box[1].start
            m = lab[box] == i + 1
            area = m.sum()
            if not 70 < area < 7000 or max(w, h) > 150:
                continue
            piece = part[box].astype(float) / 255
            mean = piece[m].mean(0)
            if mean[2] > mean[1] * 0.95:  # sky and drapery
                continue
            is_fruit = mean[0] - mean[2] > 0.3 and mean[0] - mean[1] > 0.14 and area > 500
            alpha = ndi.gaussian_filter(np.pad(m, 2).astype(float), 0.7)
            if is_fruit:
                col = lift(pomegranates(part[box]), gamma=0.9, floor=(0, 0, 0))
                col = np.pad(col, ((2, 2), (2, 2), (0, 0)), mode='edge')
                fruit.append(Image.fromarray(np.dstack([col, (alpha * 255).astype(np.uint8)]), 'RGBA'))
            else:
                # leaves: their gold turned a little toward the green of living trees
                col = (lift(part[box], gamma=0.8, gain=1.0, floor=(10, 14, 6)).astype(float) * [0.74, 0.92, 0.56]).astype(np.uint8)
                col = np.pad(col, ((2, 2), (2, 2), (0, 0)), mode='edge')
                leaves.append(Image.fromarray(np.dstack([col, (alpha * 255).astype(np.uint8)]), 'RGBA'))
    return leaves, fruit


def crown_atlas():
    leaves, fruit = harvest_leaves()
    print('leaves', len(leaves), 'fruit', len(fruit))
    cell = 512
    atlas = Image.new('RGBA', (cell * 4, cell * 4), (0, 0, 0, 0))

    def lay(im, leaf, s, d_pow, d_max):
        piece = leaf.resize((max(2, int(leaf.width * s)), max(2, int(leaf.height * s))), Image.LANCZOS)
        piece = piece.rotate(rng.uniform(0, 360), expand=True, resample=Image.BICUBIC)
        a = rng.uniform(0, 6.283)
        d = rng.uniform(0, 1) ** d_pow * d_max
        x = int(cell / 2 + np.cos(a) * d * cell / 2 - piece.width / 2)
        y = int(cell / 2 + np.sin(a) * d * cell / 2 - piece.height / 2)
        if x >= 0 and y >= 0 and x + piece.width < cell and y + piece.height < cell:
            im.alpha_composite(piece, (x, y))

    for i in range(16):
        # a dark, soft mass to hold the leaves...
        mask = ndi.gaussian_filter(blob(cell, seed=i + 3).astype(float), 5) > 0.5
        mask = ndi.binary_erosion(mask, iterations=36)
        tone = ndi.gaussian_filter(rng.random((cell, cell)), 16)
        tone = (tone - tone.min()) / (tone.max() - tone.min())
        base = np.dstack([14 + tone * 20, 24 + tone * 30, 12 + tone * 14, mask * 255]).astype(np.uint8)
        im = Image.fromarray(base, 'RGBA')
        # ...and Botticelli's leaves laid over it, thickest at the rim, breaking the outline
        for n in range(240):
            lay(im, leaves[int(rng.integers(len(leaves)))], rng.uniform(1.3, 2.3), 0.4, 0.84)
        for n in range(2):
            if fruit:
                lay(im, fruit[int(rng.integers(len(fruit)))], rng.uniform(0.9, 1.2), 0.6, 0.7)
        atlas.paste(im, ((i % 4) * cell, (i // 4) * cell))
    atlas.save(OUT + 'grove-crown.webp', quality=82, exact=True)


def bark():
    src = Image.open(SRC + 'primavera.jpg').convert('RGB')
    # a trunk between Mercury and the Graces, and its neighbour
    crop = np.asarray(src.crop((632, 520, 678, 900)).resize((128, 512), Image.LANCZOS)).astype(float)
    crop = ndi.median_filter(crop, size=(5, 5, 1))
    crop = (crop / 255) ** 0.65 * 1.25
    # the fine bark lines the painting doesn't have at this size
    noise = rng.random((512, 128))
    lines = ndi.gaussian_filter(noise, (24, 0.8))
    lines = (lines - lines.mean()) / lines.std()
    crop = crop * (1 + 0.16 * lines[..., None])
    out = Image.fromarray((np.clip(crop, 0, 1) * 255).astype(np.uint8))
    out.save(OUT + 'grove-bark.webp', quality=82)


def tufts():
    src = Image.open(SRC + 'persephone-crane.jpg').convert('RGB')
    # the daffodil bank along the painting's foot
    boxes = [(150, 650, 330, 800), (60, 660, 240, 810), (235, 655, 415, 805), (170, 650, 350, 800)]
    cell = 384
    atlas = Image.new('RGBA', (cell * 2, cell * 2), (0, 0, 0, 0))
    for i, box in enumerate(boxes):
        crop = src.crop(box).resize((cell, cell), Image.LANCZOS)
        a = np.asarray(crop).astype(float) / 255
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        hi = a.max(-1)
        lo = a.min(-1)
        sat = (hi - lo) / (hi + 1e-3)
        white = (hi > 0.62) & (sat < 0.3)
        yellow = (r > 0.6) & (g > 0.5) & (b < 0.5)
        green = (g >= r * 0.98) & (g > b * 1.08) & (hi > 0.16)
        lab, n = ndi.label(white)
        if n:  # a pale patch bigger than any flower is water
            sizes = ndi.sum(white, lab, range(1, n + 1))
            white = np.isin(lab, np.nonzero(sizes < 2600)[0] + 1)
        mask = white | yellow | green
        mask = ndi.binary_closing(mask, iterations=2)
        mask = ndi.binary_opening(mask, iterations=1)
        lab, n = ndi.label(mask)
        if n:
            sizes = ndi.sum(mask, lab, range(1, n + 1))
            mask = np.isin(lab, np.nonzero(sizes > 90)[0] + 1)
        # it grows from the ground, and thins out at its sides
        y, x = np.mgrid[0:cell, 0:cell] / (cell - 1)
        keep = np.abs(x - 0.5) < 0.47 - 0.05 * np.sin(y * 6 + i)
        # a dome, not a card: low at its edges, highest in the middle
        dome = 0.04 + 0.62 * (2 * np.abs(x - 0.5)) ** 2 + 0.03 * np.sin(x * 19 + i)
        mask &= keep & (y > dome)
        # and the dull dark ground between the stems is not part of it
        mask &= hi > 0.24
        alpha = ndi.gaussian_filter(mask.astype(float), 1.0)
        col = np.asarray(crop)
        im = Image.fromarray(np.dstack([col, (alpha * 255).astype(np.uint8)]), 'RGBA')
        if i == 3:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        atlas.paste(im, ((i % 2) * cell, (i // 2) * cell))
    atlas.save(OUT + 'grove-tufts.webp', quality=84, exact=True)


def ground():
    # the middle of Crane's bank: no water at its top, no stone at its foot
    src = Image.open(OUT + 'meadow.webp').convert('RGB')
    src.crop((0, 48, src.width, 196)).save(OUT + 'grove-ground.webp', quality=86)


if __name__ == '__main__':
    ground()
    crown_atlas()
    bark()
    tufts()
    print('ok')
