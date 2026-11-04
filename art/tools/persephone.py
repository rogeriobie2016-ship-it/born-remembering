"""Cut-outs for Persephone's garden and the pop-up Hades. See cutlib.py for the standard."""
import os
import sys

import numpy as np
from PIL import Image
from rembg import new_session

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cutlib import finish, paper_edge, polygon_mask, rembg_mask, save, trim

SRC = 'art/src/'
OUT = 'public/art/persephone/'
os.makedirs(OUT, exist_ok=True)
session = new_session('isnet-general-use')


def rembg_cut(name, box, out, max_size=1500):
    crop = Image.open(SRC + name).convert('RGB').crop(box)
    mask = rembg_mask(crop, session)
    save(trim(finish(np.asarray(crop), mask)), OUT + out, max_size)


# ---------- Walter Crane, The Fate of Persephone (1877) ----------
crane = Image.open(SRC + 'persephone-crane.jpg').convert('RGB')
# rembg loses the dark horses, so the group is traced by hand (coordinates on a 780x335 view)
TRACE = [(195, 255), (190, 215), (225, 165), (270, 130), (270, 40), (300, 5), (345, 0), (400, 25), (410, 85), (445, 100), (470, 55),
         (510, 42), (555, 65), (590, 50), (640, 40), (690, 25), (690, 60), (680, 95), (700, 190), (700, 320), (615, 335), (570, 330),
         (490, 330), (440, 320), (420, 280), (380, 290), (330, 265), (285, 225), (215, 255)]
mask = polygon_mask(crane.size, [(x / 780, y / 335) for x, y in TRACE])
save(trim(finish(np.asarray(crane), mask, feather=1.6)), OUT + 'rapture.webp', 1500)
rembg_cut('persephone-crane.jpg', (25, 135, 580, 595), 'maidens.webp')
crane.crop((0, 600, 470, 827)).save(OUT + 'meadow.webp', quality=86)
crane.crop((0, 0, 450, 145)).resize((900, 290), Image.LANCZOS).save(OUT + 'orchard.webp', quality=86)

# ---------- Rossetti, Proserpine (1874); Leighton, The Return of Persephone (1891) ----------
rembg_cut('proserpine-rossetti.jpg', (0, 90, 1041, 2010), 'proserpine.webp')
rembg_cut('persephone-leighton.jpg', (486, 430, 1056, 1400), 'return.webp')
rembg_cut('persephone-leighton.jpg', (0, 115, 480, 830), 'demeter.webp')

# ---------- Rubens, The Rape of Proserpina: a plate printed in the book ----------
rubens = Image.open(SRC + 'proserpina-rubens.jpg').convert('RGB')
rubens.thumbnail((1500, 1500), Image.LANCZOS)
rubens.save(OUT + 'rubens-plate.webp', quality=84)

# ---------- Doré, Charon: the layers of paper of the pop-up ----------
dore = Image.open(SRC + 'charon-dore.jpg').convert('RGB').crop((47, 24, 2788, 2268))
W, H = dore.size


def layer(name, poly, max_size=1400):
    rgb = np.asarray(dore)
    mask = polygon_mask((W, H), poly)
    save(trim(paper_edge(rgb, mask, width=7)), OUT + name, max_size)


# back flat: mountains under a black sky, with an uneven scissored top
layer('dore-sky.webp', [(0, 0.02), (0.2, 0.0), (0.45, 0.03), (0.7, 0.0), (1, 0.02), (1, 0.5), (0, 0.5)])
# the slope on the left, with the far procession
layer('dore-hill.webp', [(0, 0.04), (0.1, 0.1), (0.2, 0.2), (0.3, 0.31), (0.42, 0.42), (0.36, 0.47), (0.2, 0.47), (0, 0.5)])
# the crowd on the shore, Charon's oar raised: a lumpy cut around the figures
layer('dore-crowd.webp', [(0, 0.46), (0.08, 0.42), (0.16, 0.41), (0.2, 0.37), (0.24, 0.3), (0.3, 0.27), (0.33, 0.3), (0.3, 0.38), (0.42, 0.42),
                          (0.52, 0.45), (0.6, 0.43), (0.66, 0.38), (0.7, 0.44), (0.78, 0.43), (0.85, 0.48), (0.86, 0.62), (0.7, 0.69), (0.5, 0.72),
                          (0.2, 0.7), (0, 0.7)])
# the near bank with the fallen
layer('dore-bank.webp', [(0, 0.67), (0.12, 0.66), (0.26, 0.7), (0.36, 0.76), (0.46, 0.83), (0.56, 0.92), (0.66, 1), (0, 1)])

# the Styx: Dore's water, for the strips of waves
dore.crop((int(W * 0.62), int(H * 0.66), W, int(H * 0.9))).save(OUT + 'dore-water.webp', quality=84)
