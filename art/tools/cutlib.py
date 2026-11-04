"""Cut-out helpers. The standard every cut-out in the piece should meet:
a clean mask, a soft edge of 1 to 2 px, and the figure's colour carried past the mask
(so no halo appears when the texture shrinks in the distance).

Run with the rembg venv, from the project root:  python -I art/tools/<script>.py
"""
import numpy as np
from PIL import Image
from scipy.ndimage import (
    binary_closing,
    binary_dilation,
    binary_fill_holes,
    distance_transform_edt,
    gaussian_filter,
    label,
)

FEATHER = 1.0  # gaussian sigma in px: gives a soft edge of about 1.5 px


def keep_large(mask, min_frac=0.03):
    """Drop specks: keep the components at least `min_frac` of the largest."""
    lab, n = label(mask)
    if n == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return np.isin(lab, np.where(sizes >= sizes.max() * min_frac)[0])


def finish(rgb, mask, feather=FEATHER):
    """rgb (H,W,3 uint8) + boolean mask -> RGBA with a soft edge and colour bled outward."""
    alpha = gaussian_filter(mask.astype(np.float32), feather)
    # every pixel outside the mask takes the colour of the nearest pixel well inside it
    core = alpha > 0.9
    if core.any():
        idx = distance_transform_edt(~core, return_distances=False, return_indices=True)
        rgb = rgb[idx[0], idx[1]]
    out = np.dstack([rgb, np.clip(alpha * 255, 0, 255).astype(np.uint8)])
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def trim(img, pad=4):
    bb = img.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bb:
        return img
    w, h = img.size
    return img.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(w, bb[2] + pad), min(h, bb[3] + pad)))


def save(img, path, max_size=None):
    if max_size:
        img.thumbnail((max_size, max_size), Image.LANCZOS)
    # exact=True keeps the bled colour under transparent pixels instead of zeroing it
    img.save(path, quality=86, alpha_quality=100, exact=True, method=5)
    print(path, img.size)


def rembg_mask(img, session, threshold=0.5):
    from rembg import remove

    a = np.asarray(remove(img, session=session).split()[3], dtype=np.float32) / 255
    return binary_fill_holes(keep_large(a > threshold))


def polygon_mask(size, poly):
    """poly in 0..1 coordinates."""
    from PIL import ImageDraw

    w, h = size
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(x * w, y * h) for x, y in poly], fill=255)
    return np.asarray(m) > 128


def bright_figures(gray, threshold=95, close=9, min_frac=0.03):
    """Engraving: lit figures on black. A silhouette from the bright strokes, closed and filled."""
    m = gaussian_filter(gray.astype(np.float32), 1.2) > threshold
    m = binary_closing(m, iterations=close)
    m = binary_fill_holes(m)
    return keep_large(m, min_frac)


def paper_edge(rgb, mask, width=5, colour=(214, 203, 180), feather=FEATHER):
    """A strip of bare paper around the cut, as if scissored from a sheet."""
    outer = binary_dilation(mask, iterations=width)
    out = rgb.copy()
    out[outer & ~mask] = colour
    return finish(out, outer, feather)
