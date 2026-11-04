"""Re-cut of the figures flagged in docs/auditoria-recortes.md, from native-resolution sources.

The method, for every figure: a polygon traced by hand in source pixels says roughly where the figure is;
closed-form matting (pymatting) decides the real edge inside a narrow band around that polygon, from the
painting's own colours; the matte is thresholded and smoothed into a clean mask; cutlib.finish gives the
soft edge and bleeds the figure's colour outward. Extra polygons pin what matting cannot be trusted with
(a dark dress on dark foliage, a neighbour of the same colour).

Run from the project root, with the rembg venv:
    python -I art/tools/recut.py                 # everything
    python -I art/tools/recut.py harpy-right ... # just these
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from pymatting import estimate_alpha_cf
from scipy.ndimage import binary_dilation, binary_erosion, binary_fill_holes, binary_opening, distance_transform_edt, gaussian_filter, label

sys.path.insert(0, 'art/tools')
from cutlib import finish, keep_large, save  # noqa: E402

SRC = 'art/src/'
OUT = 'public/art/'
_cache = {}


def source(name):
    if name not in _cache:
        _cache[name] = np.asarray(Image.open(SRC + name).convert('RGB'))
    return _cache[name]


def poly(shape, pts, offset=(0, 0)):
    """Boolean mask of a polygon given in source pixels, on a crop whose origin is `offset`."""
    h, w = shape[:2]
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).polygon([(x - offset[0], y - offset[1]) for x, y in pts], fill=255)
    return np.asarray(m) > 128


def clean(mask, smooth=1.6, min_frac=0.02):
    """Take the steps out of a mask's edge and drop specks and pinholes."""
    m = gaussian_filter(mask.astype(np.float32), smooth) > 0.5
    m = keep_large(m, min_frac)
    # pinholes only: real gaps (between arm and body, say) are much larger than this
    holes = ~m
    lab, n = label(holes)
    if n:
        sizes = np.bincount(lab.ravel())
        small = np.where(sizes < 150)[0]
        small = small[small != 0]
        m = m | np.isin(lab, small)
    return m


def peel_dark(rgb, mask, thr, steps, regions):
    region = np.any(regions, axis=0)
    lum = gaussian_filter(rgb.astype(np.float32).mean(axis=2), 1.0)
    for _ in range(steps):
        edge = mask & ~binary_erosion(mask)
        mask = mask & ~(edge & (lum < thr) & region)
    # and the knobs that peeling leaves behind
    opened = binary_opening(mask, iterations=5)
    mask = np.where(region, opened, mask)
    return clean(mask, 1.5)


def clone_out(rgb, line, width, shift, off):
    """Paint out a thin thing that crosses a figure (a stay of the rigging). The broad colour is inpainted from both
    sides, the fine texture (crackle, weave) is borrowed from `shift` px away, so no seam and no smooth stripe.
    This is retouching: what lies under the rope is not in the painting."""
    h, w = rgb.shape[:2]
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).line([(x - off[0], y - off[1]) for x, y in line], fill=255, width=width)
    m = np.asarray(m) > 128
    ys, xs = np.where(m)
    pad = 16 + max(abs(shift[0]), abs(shift[1]))
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(h, ys.max() + pad), max(0, xs.min() - pad), min(w, xs.max() + pad)
    crop, mc = rgb[y0:y1, x0:x1].astype(np.float32) / 255, m[y0:y1, x0:x1]
    # normalised convolution: the colour of both banks of the rope, with no overshoot
    keep = (~mc).astype(np.float32)
    sigma = max(3.0, width * 0.55)
    broad = gaussian_filter(crop * keep[..., None], (sigma, sigma, 0)) / np.maximum(gaussian_filter(keep, sigma), 1e-3)[..., None]
    moved = np.roll(crop, (-shift[1], -shift[0]), axis=(0, 1))
    detail = np.clip(moved - gaussian_filter(moved, (2, 2, 0)), -0.08, 0.08)
    soft = gaussian_filter(mc.astype(np.float32), 1.0)[..., None]
    out = crop * (1 - soft) + np.clip(broad + detail, 0, 1) * soft
    rgb = rgb.copy()
    rgb[y0:y1, x0:x1] = np.clip(out * 255, 0, 255).astype(np.uint8)
    return rgb


def wisps(rgb, mask, thresh, polys, off):
    """Inside the polygons keep only warm paint: hair flying against the grey sky, whose gaps are not hers."""
    warm = gaussian_filter(rgb.astype(np.float32), (3, 3, 0))
    warm = warm[..., 0] - warm[..., 2] > thresh
    region = np.any([poly(rgb.shape, p, off) for p in polys], axis=0)
    return mask & (warm | ~region)


def matte(name, box, outline, band=12, fg=(), bg=(), hard=(), fill=True, smooth=3.0, min_frac=0.02, shrink=0.0, denoise=1.2, ropes=(), free=(), add=(), peel=None, sea=0, warm=None):
    """-> (rgb crop, boolean mask). `outline` is the hand trace, in source pixels.

    band   how far either side of the trace matting may move the edge
    fg/bg  polygons pinned as sure figure / sure background
    hard   polygons where the hand trace is final, no matting: inside them the mask is the outline itself
    shrink pull the final edge in by this many px (keeps background-tinted edge pixels out)
    denoise blur given to matting's copy of the image only, so canvas weave and crackle do not make the edge knobbly
    smooth  sigma of the final smoothing of the mask's outline
    ropes   (polyline, width, (dx, dy)): retouch, see clone_out
    free    polygons left wholly to matting (wisps of hair)
    add     polygons simply added to the final mask (an arrow too thin to survive smoothing)
    warm    (threshold, polygons): see wisps
    sea     strip this many px of blue-green edge: the sea, along figures that are themselves red-brown
    peel    (threshold, steps, polygons): inside the polygons, strip near-black edge pixels: what is left of a dark ground
    """
    x0, y0, x1, y1 = box
    rgb = source(name)[y0:y1, x0:x1]
    global _last_box
    _last_box = box
    off = (x0, y0)
    for line, width, shift in ropes:
        rgb = clone_out(rgb, line, width, shift, off)
    rough = poly(rgb.shape, outline, off)
    tri = np.full(rgb.shape[:2], 0.5, dtype=np.float64)
    tri[binary_erosion(rough, iterations=band)] = 1
    tri[~binary_dilation(rough, iterations=band)] = 0
    for p in free:
        tri[poly(rgb.shape, p, off)] = 0.5
    for p in fg:
        tri[poly(rgb.shape, p, off)] = 1
    for p in bg:
        tri[poly(rgb.shape, p, off)] = 0
    soft = gaussian_filter(rgb.astype(np.float64) / 255, (denoise, denoise, 0)) if denoise else rgb.astype(np.float64) / 255
    alpha = estimate_alpha_cf(soft, tri)
    mask = gaussian_filter(alpha, 0.7) > 0.5
    for p in hard:
        h = poly(rgb.shape, p, off)
        mask = np.where(h, rough, mask)
    if fill:
        mask = binary_fill_holes(mask)
    mask = clean(mask, smooth, min_frac)
    if shrink:
        d = gaussian_filter(mask.astype(np.float32), 1.5)
        mask = d > 0.5 + 0.2 * shrink
    if warm:
        mask = binary_opening(wisps(rgb, mask, warm[0], warm[1], off), iterations=4) | (mask & binary_erosion(mask, iterations=30))
        mask = clean(mask, 2.0, min_frac)
    if sea:
        soft_rgb = gaussian_filter(rgb.astype(np.float32), (1, 1, 0))
        blue = soft_rgb[..., 2] - soft_rgb[..., 0] > 2
        for _ in range(sea):
            mask = mask & ~((mask & ~binary_erosion(mask)) & blue)
        mask = clean(mask, 1.5, min_frac)
    if peel:
        mask = peel_dark(rgb, mask, peel[0], peel[1], [poly(rgb.shape, p, off) for p in peel[2]])
    for p in add:
        mask = mask | poly(rgb.shape, p, off)
    return rgb, mask


def debug_overlay(rgb, mask, out):
    """With RECUT_DEBUG=<dir>: the source crop with the mask's edge in red and a grid in source pixels."""
    d = os.environ.get('RECUT_DEBUG')
    if not d:
        return
    im = rgb.copy()
    im[mask ^ binary_erosion(mask, iterations=1)] = (255, 0, 0)
    pil = Image.fromarray(im)
    draw = ImageDraw.Draw(pil)
    x0, y0 = _last_box[:2]
    step = 50
    for gx in range((x0 // step + 1) * step, x0 + pil.width, step):
        draw.line([(gx - x0, 0), (gx - x0, pil.height)], fill=(0, 255, 255))
        draw.text((gx - x0 + 2, 2), str(gx), fill=(255, 255, 0))
    for gy in range((y0 // step + 1) * step, y0 + pil.height, step):
        draw.line([(0, gy - y0), (pil.width, gy - y0)], fill=(0, 255, 255))
        draw.text((2, gy - y0 + 2), str(gy), fill=(255, 255, 0))
    pil.save(os.path.join(d, out.replace('/', '-') + '.png'))


def export(rgb, mask, out, max_size=1600, feather=0.65, fade=None):
    """Finish and save (sigma 0.65 measures 1.7 to 2 px from 10% to 90% alpha). Scales colour and mask BEFORE finish(): cutlib.save(max_size) goes through
    premultiplied alpha, which throws away the colour bled under fully transparent pixels.

    fade: optional float array (0..1, same size as mask) multiplied into the alpha, for a deliberately soft base.
    """
    debug_overlay(rgb, mask, out)
    ys, xs = np.where(mask)
    pad = 8
    y0, y1 = max(0, ys.min() - pad), min(mask.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(mask.shape[1], xs.max() + pad)
    rgb, mask = rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    if fade is not None:
        fade = fade[y0:y1, x0:x1]
    h, w = mask.shape
    s = min(1.0, max_size / max(h, w))
    if s < 1:
        size = (round(w * s), round(h * s))
        rgb = np.asarray(Image.fromarray(rgb).resize(size, Image.LANCZOS))
        m = Image.fromarray((mask * 255).astype(np.uint8)).resize(size, Image.LANCZOS)
        mask = np.asarray(m) > 127
        if fade is not None:
            fade = np.asarray(Image.fromarray((fade * 255).astype(np.uint8)).resize(size, Image.LANCZOS)) / 255.0
    img = finish(rgb, mask, feather)
    if fade is not None:
        a = np.asarray(img.split()[3], dtype=np.float32) * fade
        img.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
    path = OUT + out + '.webp'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    save(img, path)
    print('   ', os.path.getsize(path) // 1024, 'KB')


# ---------- Waterhouse, Ulysses and the Sirens: the bird-Sirens, one by one ----------
WH = 'sirens-waterhouse.jpg'


def harpy_right():
    outline = [
        # the near (left) wing, dark over the sail
        (3108, 334), (3146, 322), (3184, 337), (3199, 416), (3219, 445), (3254, 474), (3289, 521), (3307, 559),
        # along the top of the far wing, out to the fingers
        (3371, 556), (3453, 533), (3500, 492), (3547, 463), (3606, 416), (3653, 363), (3688, 307), (3761, 263),
        (3802, 293), (3822, 300), (3812, 330), (3830, 345), (3815, 380), (3832, 395), (3815, 430), (3799, 474), (3776, 521), (3711, 574), (3641, 615),
        (3594, 650), (3530, 738), (3547, 750), (3571, 802), (3606, 826), (3647, 861), (3606, 902), (3576, 943),
        # tail, talons
        (3547, 972), (3506, 987), (3459, 984), (3418, 966), (3401, 940), (3377, 955), (3348, 949), (3341, 914),
        (3330, 896), (3357, 855), (3354, 814), (3330, 761), (3295, 708), (3266, 668), (3243, 650),
        # the face
        (3216, 659), (3203, 645), (3196, 641), (3173, 632), (3163, 615), (3150, 585), (3155, 527), (3120, 474),
        (3102, 416), (3078, 363),
    ]
    # the wing runs off the painting at the right edge: its end is shaped here into feather tips
    tips = [(3840, 240), (3770, 258), (3803, 282), (3815, 300), (3808, 340), (3815, 370), (3822, 400), (3817, 430), (3840, 470)]
    # the cliff seen between the top feathers
    gaps = [[(3693, 305), (3690, 328), (3725, 298), (3748, 268), (3705, 285)], [(3765, 272), (3792, 280), (3778, 303), (3765, 312)]]
    rgb, mask = matte(WH, (3040, 230, 3840, 1010), outline, band=12, bg=[tips, *gaps], sea=6)
    export(rgb, mask, 'sirens/harpy-right')


def harpy_a():
    # flying right: tail with the white bars at the left, her head at the right. The left Siren's wing crosses
    # below her and the middle Siren's wing is behind her face.
    outline = [
        (728, 621), (816, 588), (874, 593), (932, 588), (1018, 578), (1104, 571), (1162, 562), (1210, 552), (1251, 542),
        (1253, 514), (1277, 504), (1316, 499), (1354, 504), (1388, 518), (1412, 542), (1402, 559), (1409, 593), (1400, 600),
        (1395, 614), (1390, 636), (1368, 638), (1325, 646), (1301, 653), (1282, 665), (1253, 691), (1200, 720), (1175, 735),
        (1152, 722), (1037, 733), (893, 742), (858, 725), (869, 696), (855, 672), (826, 648), (759, 646),
    ]
    rgb, mask = matte(WH, (700, 470, 1450, 780), outline, band=7, sea=6)
    export(rgb, mask, 'sirens/harpy-a')


def harpy_b():
    # her left wing runs behind the other Siren's face: it stops short of it, the end shaped into feather tips
    outline = [
        (1420, 549), (1455, 552), (1496, 569), (1520, 512), (1550, 472), (1600, 470), (1650, 482), (1690, 466),
        (1735, 462), (1755, 490), (1790, 532), (1806, 569), (1861, 575), (1902, 566), (1960, 575), (2047, 584), (2146, 584),
        (2151, 604), (2209, 607), (2238, 630), (2235, 662), (2215, 703), (2180, 703), (2128, 737), (2047, 732), (1960, 726),
        (1890, 714), (1844, 723), (1803, 732), (1751, 749), (1751, 778), (1751, 813), (1798, 824), (1774, 848), (1769, 877),
        (1728, 888), (1714, 929), (1682, 929), (1676, 900), (1653, 923), (1629, 917), (1597, 911), (1589, 877), (1540, 886),
        (1510, 880), (1480, 866), (1455, 850), (1502, 807), (1548, 790), (1551, 766), (1508, 755), (1496, 749), (1438, 730), (1415, 722),
        (1426, 700), (1412, 680), (1428, 650), (1414, 625), (1428, 600), (1414, 575),
    ]
    ropes = [
        ([(1503, 760), (1540, 700), (1580, 645), (1615, 560), (1650, 480)], 12, (22, 10)),  # the stay across her
        ([(2146, 610), (2128, 680), (2110, 745)], 14, (-28, 0)),  # and across her wing
    ]
    hair = [(1500, 440), (1800, 440), (1810, 575), (1700, 560), (1520, 560)]  # her hair, flying up against the sky
    rgb, mask = matte(WH, (1380, 430, 2260, 950), outline, band=8, ropes=ropes, sea=6, warm=(26, [hair]))
    export(rgb, mask, 'sirens/harpy-b')


def harpy_left():
    # the biggest, over the prow. Her left wing runs off the painting: its end is shaped into feather tips
    outline = [
        (22, 770), (87, 782), (173, 803), (251, 825), (300, 800), (290, 760), (285, 720), (300, 680), (340, 650), (400, 625),
        (440, 645), (500, 660), (540, 690), (555, 734), (607, 747), (641, 795), (645, 786), (702, 773), (780, 751), (901, 740),
        (1037, 734), (1127, 721), (1150, 745), (1160, 783), (1207, 783), (1210, 790), (1200, 804), (1171, 847), (1110, 840),
        (1100, 850), (1098, 900), (1092, 951), (1075, 1055), (1066, 1089), (1040, 1098), (1014, 1037), (960, 1005), (930, 985),
        (915, 951), (850, 935), (800, 950), (760, 965), (700, 985), (640, 995), (590, 1005), (540, 1020), (535, 1052), (589, 1098),
        (589, 1159), (575, 1185), (540, 1200), (505, 1230), (490, 1255), (478, 1270), (450, 1268), (420, 1280), (395, 1288),
        (360, 1302), (330, 1302), (322, 1285), (285, 1270), (250, 1250), (205, 1222), (184, 1200), (172, 1180), (215, 1150),
        (260, 1118), (295, 1098), (302, 1075), (293, 1056), (260, 1063), (191, 1037), (104, 1020), (52, 1020), (34, 1015),
        (16, 990), (30, 955), (12, 925), (28, 890), (10, 860), (26, 830), (8, 800),
    ]
    tips = [(0, 730), (22, 770), (8, 800), (26, 830), (10, 860), (28, 890), (12, 925), (30, 955), (16, 990), (34, 1015), (0, 1040)]
    sea_gap = [(1153, 763), (1207, 770), (1207, 783), (1160, 783)]
    hair = [(270, 600), (560, 600), (560, 720), (420, 740), (270, 790)]  # her hair, flying up against the sky
    rgb, mask = matte(WH, (0, 590, 1260, 1320), outline, band=6, bg=[tips, sea_gap], sea=6, warm=(26, [hair]))
    export(rgb, mask, 'sirens/harpy-left')


def harpy_mast():
    # The mast stands in front of her and splits her in two, and a stay runs down beside it, so only what lies clear
    # of both is kept: her head and her left wing. Her right wing, on the far side of the mast, is left in the painting.
    outline = [
        (2449, 322), (2452, 296), (2472, 274), (2501, 267), (2526, 275), (2532, 300), (2530, 345), (2527, 400), (2523, 470),
        (2518, 540), (2512, 610), (2506, 680), (2495, 692),
        # back along Ulysses' shoulder and cap, then the left wing
        (2487, 687), (2449, 640), (2439, 611), (2415, 588), (2392, 583), (2368, 540), (2351, 497), (2334, 412), (2331, 369),
        (2339, 350), (2368, 355), (2396, 369), (2437, 386), (2449, 374),
    ]
    ropes = [([(2368, 340), (2356, 420), (2344, 497), (2340, 520)], 14, (18, 0))]
    rgb, mask = matte(WH, (2300, 240, 2570, 720), outline, band=3, ropes=ropes)
    export(rgb, mask, 'sirens/harpy-mast')


def ulysses():
    # the whole man: the mast behind him is easy to read, his one visible leg runs to the foot, so the base is his foot
    outline = [
        (2355, 608), (2389, 588), (2420, 588), (2439, 608), (2447, 640), (2452, 658), (2465, 685), (2470, 694), (2497, 716),
        (2524, 730), (2549, 735), (2550, 813), (2569, 825), (2596, 843), (2612, 878), (2659, 883), (2683, 880), (2702, 914),
        (2702, 933), (2696, 964), (2671, 979), (2649, 979), (2631, 939), (2609, 923), (2597, 917), (2570, 900), (2555, 893),
        (2547, 902), (2550, 933), (2553, 995), (2566, 1050), (2597, 1087), (2649, 1140), (2628, 1161), (2609, 1186),
        (2572, 1199), (2550, 1205), (2550, 1273), (2549, 1335), (2544, 1396), (2538, 1433), (2532, 1449), (2547, 1483),
        (2541, 1495), (2473, 1495), (2467, 1483), (2492, 1458), (2504, 1433), (2507, 1396), (2504, 1335), (2489, 1260),
        (2482, 1205), (2473, 1192), (2464, 1168), (2455, 1130), (2451, 1056), (2448, 1001), (2451, 970), (2417, 973),
        (2411, 902), (2412, 865), (2407, 838), (2380, 802), (2394, 771), (2398, 730), (2353, 708), (2344, 694), (2337, 678),
        (2346, 638),
    ]
    ropes = [([(2515, 720), (2502, 829), (2485, 964), (2473, 1087), (2464, 1205)], 18, (28, 0))]
    rgb, mask = matte(WH, (2300, 560, 2730, 1510), outline, band=4, ropes=ropes, sea=8)
    export(rgb, mask, 'sirens/ulysses')


# ---------- Draper, Ulysses and the Sirens ----------
DR = 'sirens-draper.jpg'


def sirens_climbing():
    outline = [
        (1200, 554), (1249, 554), (1290, 595), (1298, 652), (1281, 685), (1322, 725), (1371, 766), (1420, 790), (1452, 831),
        (1477, 880), (1501, 953), (1497, 986), (1509, 1018), (1542, 1067), (1538, 1083), (1513, 1067), (1526, 1165), (1550, 1205),
        (1591, 1238), (1640, 1287), (1672, 1336), (1713, 1393), (1762, 1397), (1758, 1441), (1753, 1482), (1762, 1507),
        (1770, 1539), (1835, 1580), (1876, 1596), (1802, 1596), (1697, 1564), (1599, 1523), (1501, 1490), (1436, 1466),
        (1371, 1441), (1339, 1393), (1306, 1344), (1290, 1311), (1330, 1287), (1339, 1254), (1290, 1291), (1225, 1279),
        (1168, 1246), (1119, 1205), (1070, 1189), (1054, 1157), (1078, 1140), (1119, 1157), (1151, 1189), (1200, 1222),
        (1249, 1230), (1229, 1189), (1176, 1157), (1151, 1124), (1151, 1083), (1127, 1035), (1086, 1018), (1080, 995),
        (1045, 982), (1000, 975), (960, 978), (900, 985), (860, 995), (845, 1005), (830, 1020), (815, 1040), (805, 1047),
        (790, 1040), (760, 1042), (735, 1032), (738, 1022), (760, 1012), (801, 1006), (842, 978),
        (899, 945), (964, 937), (1046, 949), (1082, 961), (1094, 953), (1094, 937), (1119, 912), (1143, 896), (1200, 900),
        (1212, 855), (1200, 799), (1172, 750), (1155, 701), (1176, 680), (1163, 660), (1139, 656), (1151, 611), (1147, 595),
        (1163, 579), (1176, 563),
    ]
    gaps = [
        # between the upper Siren's arm and her body: the rower's drape and a gilded leaf of the ship
        [(1267, 864), (1295, 872), (1313, 906), (1315, 945), (1311, 991), (1288, 1025), (1257, 1014), (1249, 983), (1259, 945), (1267, 906)],
        # between her thigh and the lower Siren's back
        [(1392, 1072), (1415, 1102), (1418, 1145), (1445, 1175), (1411, 1164), (1376, 1145), (1365, 1118), (1376, 1095)],
    ]
    elbow = [(1293, 1283), (1337, 1257), (1337, 1291), (1302, 1304)]
    rgb, mask = matte(DR, (700, 530, 1900, 1630), outline, band=4, denoise=1.5, bg=gaps, fg=[elbow], fill=False)
    export(rgb, mask, 'sirens/sirens-climbing')


def siren_rope():
    outline = [
        # a stretch of the rope, her upper hand, the raised arm along its outer edge
        (1768, 152), (1790, 148), (1835, 200), (1853, 210), (1879, 227), (1907, 247), (1953, 293), (1999, 333), (2021, 381),
        (2030, 410), (2035, 450), (2032, 480), (2020, 510), (2020, 550), (2012, 585), (1988, 650), (1975, 700), (1960, 745), (1985, 790), (2030, 815),
        (2060, 830), (2070, 860), (2020, 890), (1985, 925), (1990, 990), (1975, 1040), (1985, 1080), (1995, 1140), (1985, 1180),
        (1950, 1192), (1945, 1170), (1950, 1130), (1925, 1110), (1885, 1085), (1850, 1070), (1800, 1072), (1740, 1065),
        (1690, 1050), (1664, 1035), (1623, 969), (1640, 940), (1623, 904), (1603, 855), (1591, 811), (1607, 790), (1680, 750),
        (1737, 733), (1780, 720), (1815, 690), (1840, 650), (1870, 600), (1855, 560), (1832, 520), (1820, 470), (1820, 430),
        (1827, 402),
        # her streaming hair
        (1800, 395), (1755, 375), (1770, 355), (1745, 330), (1705, 307), (1720, 302), (1760, 310), (1810, 330), (1852, 350),
        (1865, 330), (1875, 300), (1875, 265), (1860, 250), (1840, 237), (1825, 222), (1820, 200),
    ]
    hair = [(1830, 405), (1755, 385), (1690, 300), (1760, 295), (1860, 335), (1850, 365)]
    sky = [[(1909, 328), (1940, 356), (1896, 358)]]
    # the top of the arm burns out into the pale sky: the traced edge stands, and so does the rope's
    arm = [(1760, 140), (1800, 140), (2060, 300), (2060, 460), (1990, 400), (1850, 240), (1810, 200)]
    rgb, mask = matte(DR, (1570, 110, 2074, 1210), outline, band=6, denoise=1.5, free=[hair], bg=sky, hard=[arm], fill=False)
    export(rgb, mask, 'sirens/siren-rope')


# ---------- Botticelli, Primavera ----------
PR = 'primavera.jpg'


def mercury():
    outline = [
        # staff and raised hand, the arm's outer edge, the cloak over his shoulder
        (240, 425), (252, 425), (258, 451), (279, 482), (291, 509), (299, 568), (294, 600), (287, 639), (279, 709), (270, 772), (263, 804), (279, 827),
        (303, 859), (326, 894), (365, 890), (420, 898), (440, 921), (450, 904), (444, 890),
        # his face and hair
        (420, 880), (416, 866), (456, 827), (475, 808), (522, 796), (540, 785), (585, 762), (592, 790), (601, 835), (616, 843), (632, 890), (644, 921), (632, 961),
        (609, 1008), (616, 1047), (601, 1090), (616, 1118), (648, 1188), (695, 1259), (722, 1329), (707, 1381), (640, 1421),
        # the cloak on his right, then down his legs
        (593, 1472), (609, 1523), (593, 1609), (605, 1664), (593, 1742), (562, 1719), (530, 1758), (507, 1742), (510, 1758),
        (499, 1852), (514, 1915), (518, 1978), (514, 2040), (518, 2064), (507, 2103), (495, 2135), (475, 2174), (460, 2213),
        (456, 2268), (467, 2280), (456, 2303), (428, 2323), (397, 2323), (387, 2291), (401, 2252), (412, 2213), (420, 2158),
        (424, 2135), (412, 2080), (416, 2033), (432, 2025), (428, 1978), (432, 1899), (420, 1836), (412, 1742), (405, 1746),
        (357, 1734), (357, 1742), (330, 1797), (318, 1868), (334, 1962), (346, 2017), (354, 2052), (361, 2103), (373, 2268),
        (342, 2284), (283, 2311), (248, 2338), (208, 2338), (205, 2327), (232, 2299), (267, 2276), (291, 2213), (295, 2158),
        (279, 2127), (263, 2103), (259, 2076), (271, 2068), (248, 2001), (232, 1923), (220, 1860), (228, 1758), (232, 1734),
        (224, 1711), (185, 1766), (173, 1821), (154, 1825), (154, 1813), (169, 1758), (177, 1680), (177, 1648), (201, 1578),
        (181, 1491), (201, 1350), (224, 1314), (244, 1204), (267, 1078), (259, 992), (267, 953), (263, 945), (232, 890),
        (201, 839), (191, 796), (201, 733), (228, 658), (259, 639), (265, 637), (254, 635), (248, 576), (232, 537), (228, 482),
        (236, 440), (240, 425),
    ]
    # the cloak and the legs stand on the black of the grove: strip what the matte leaves of it (not on his hair, nor the sword strap)
    ground = [[(130, 1100), (300, 1100), (300, 1900), (130, 1900)], [(570, 1400), (760, 1400), (760, 1790), (610, 1790)],
              [(130, 1800), (760, 1800), (760, 2030), (130, 2030)]]  # not the boots, as dark as the ground: those stay as traced
    rgb, mask = matte(PR, (130, 400, 760, 2360), outline, band=4, fill=False, peel=(58, 12, ground))
    export(rgb, mask, 'garden/mercury')


def flora():
    # Chloris' hands and arm cross her on her right: the outline goes round them
    outline = [
        (2530, 738), (2558, 762), (2600, 797), (2625, 812), (2639, 861), (2635, 903), (2635, 931), (2656, 952), (2674, 966),
        (2670, 1002), (2678, 1030), (2692, 1050), (2713, 1072), (2748, 1121), (2759, 1156), (2744, 1167), (2706, 1170),
        (2678, 1185), (2674, 1227), (2685, 1255), (2706, 1283), (2769, 1332), (2766, 1371), (2727, 1424), (2692, 1452),
        (2737, 1466), (2762, 1551), (2759, 1606), (2757, 1650), (2714, 1654), (2693, 1640), (2652, 1637), (2652, 1668),
        (2679, 1679), (2672, 1724), (2700, 1710), (2725, 1724), (2756, 1724), (2777, 1710), (2812, 1717), (2860, 1710),
        (2916, 1752), (2926, 1794), (2923, 1828), (2881, 1811), (2832, 1794), (2749, 1773), (2756, 1828), (2812, 1870),
        (2839, 1919), (2848, 1995), (2880, 1992), (2920, 1988), (2945, 2002), (2986, 2016), (2944, 2065), (2880, 2082), (2860, 2094), (2865, 2110), (2902, 2128), (2874, 2176),
        (2812, 2190), (2784, 2169), (2770, 2218), (2721, 2274), (2672, 2305), (2652, 2295), (2679, 2246), (2665, 2239),
        (2631, 2218), (2603, 2204), (2589, 2274), (2585, 2336), (2572, 2380), (2561, 2405),
        (2549, 2421), (2533, 2432), (2521, 2440), (2508, 2448), (2495, 2451), (2488, 2444), (2477, 2438), (2475, 2427), (2481, 2415),
        (2499, 2402), (2511, 2383),
        (2526, 2364), (2537, 2288), (2554, 2183), (2533, 2128), (2533, 2079), (2547, 2051), (2537, 1961), (2519, 1940),
        (2498, 2023), (2477, 2065), (2457, 2051), (2401, 2030), (2422, 1981), (2411, 1898), (2401, 1808), (2390, 1710),
        (2380, 1658), (2335, 1640), (2317, 1627), (2324, 1578), (2338, 1550), (2347, 1494), (2375, 1424), (2385, 1354),
        (2336, 1290), (2290, 1255), (2269, 1213), (2283, 1170), (2308, 1149), (2294, 1100), (2280, 1072), (2297, 1044),
        (2340, 1037), (2382, 1037), (2378, 1012), (2424, 998), (2452, 959), (2491, 945), (2463, 910), (2449, 868), (2459, 819),
        (2487, 769), (2509, 741),
    ]
    # her fringed hems on the black of the grove (the outline elsewhere is hair and sleeve, whose dark is hers)
    ground = [[(2760, 1700), (3010, 1700), (3010, 2320), (2600, 2320), (2600, 2120), (2760, 2120)],
              [(2380, 1880), (2560, 1880), (2560, 2100), (2380, 2100)],
              [(2240, 1020), (2340, 1020), (2340, 1110), (2240, 1110)]]
    rgb, mask = matte(PR, (2240, 720, 3010, 2500), outline, band=5, denoise=1.0, fill=False, peel=(50, 10, ground))
    export(rgb, mask, 'garden/flora')


def cupid():
    # his wings run into the frame of the painting: their top edge is a gentle curve drawn by hand
    outline = [
        (1729, 142), (1761, 128), (1779, 131), (1788, 117), (1806, 101), (1833, 99), (1815, 81), (1815, 66), (1860, 61),
        (1950, 60), (2050, 62), (2165, 58), (2171, 58), (2073, 122), (2028, 162), (2001, 174), (2042, 167), (2091, 169),
        (2100, 160), (2119, 144), (2141, 135), (2155, 126), (2182, 119), (2203, 133), (2207, 149), (2171, 162), (2155, 176),
        (2123, 199), (2114, 221), (2087, 244), (2119, 258), (2155, 264), (2196, 267), (2241, 273), (2250, 307), (2266, 344),
        (2255, 348), (2241, 330), (2227, 316), (2164, 314), (2096, 326), (2051, 326), (2001, 326), (1978, 339), (1937, 344),
        (1901, 330), (1865, 301), (1838, 280), (1799, 298), (1751, 348), (1733, 355), (1711, 362), (1697, 344), (1688, 321),
        (1702, 310), (1724, 323), (1747, 298), (1783, 258), (1765, 273), (1747, 262), (1722, 239), (1702, 221), (1702, 194),
        (1711, 162),
    ]
    arrow = [(1742, 255), (1745, 258), (1569, 491), (1565, 488)]
    gap = [(1812, 276), (1832, 272), (1842, 284), (1830, 294), (1808, 292)]  # sky between his arm and his chest
    rgb, mask = matte(PR, (1545, 50, 2290, 500), outline, band=5, denoise=0.8, smooth=2.0, bg=[gap], add=[arrow])
    export(rgb, mask, 'garden/cupid')


def hora():
    # Birth of Venus: the Hora with the mantle she holds out, whole
    outline = [
        (2350, 269), (2381, 273), (2400, 296), (2435, 300), (2488, 319), (2519, 331), (2581, 327), (2688, 331), (2827, 350),
        (2904, 385), (2919, 392), (2950, 365), (2996, 358), (3050, 361), (3088, 388), (3115, 435), (3127, 458), (3123, 477),
        (3142, 496), (3196, 535), (3227, 550), (3281, 565), (3311, 581), (3335, 627), (3373, 673), (3442, 704), (3473, 719),
        (3504, 742), (3542, 773), (3565, 804), (3596, 823), (3565, 842), (3558, 904), (3519, 919), (3515, 927), (3533, 967),
        (3547, 1013), (3563, 1073), (3590, 1110), (3623, 1133), (3663, 1137), (3700, 1140), (3735, 1150), (3762, 1188), (3762, 1215),
        (3750, 1232), (3706, 1222), (3676, 1210), (3654, 1227), (3646, 1251), (3669, 1296), (3678, 1312), (3676, 1358), (3646, 1387),
        (3609, 1388), (3583, 1373), (3576, 1388), (3509, 1388), (3469, 1399), (3443, 1421), (3431, 1451), (3443, 1462), (3454, 1492),
        (3461, 1521), (3457, 1551), (3446, 1588), (3431, 1625), (3394, 1651), (3370, 1664), (3394, 1668), (3431, 1671), (3476, 1688),
        (3506, 1699), (3539, 1736), (3546, 1770), (3561, 1803), (3594, 1862), (3606, 1892), (3641, 1904), (3720, 1917), (3720, 1931), (3685, 1944), (3725, 1953), (3725, 1966), (3681, 2001),
        (3636, 1979), (3565, 1979), (3539, 2001), (3495, 2024), (3539, 2086), (3583, 2152), (3583, 2179), (3521, 2200),
        (3503, 2187), (3499, 2157), (3450, 2068), (3415, 2019), (3362, 1980), (3308, 1957), (3255, 1984), (3189, 1988),
        (3140, 1962), (3100, 1931), (3060, 1935), (3025, 1970), (3043, 2015), (3074, 2068), (3065, 2081), (3007, 2095),
        (2972, 2139), (2945, 2174), (2901, 2187), (2888, 2170), (2910, 2139), (2941, 2108), (2963, 2059), (2972, 1979),
        (2937, 1962), (2919, 1926), (2919, 1909), (2897, 1869), (2848, 1882), (2808, 1891), (2802, 1851), (2808, 1776),
        (2799, 1625), (2759, 1599), (2711, 1501), (2706, 1377), (2702, 1253), (2681, 1119), (2658, 1119), (2610, 1100), (2581, 1073),
        (2588, 1019), (2604, 992), (2631, 961), (2642, 942), (2661, 988), (2688, 1004), (2735, 988), (2765, 961), (2769, 927),
        (2750, 888), (2704, 865), (2642, 858), (2604, 865), (2565, 915), (2527, 927), (2481, 915), (2458, 896), (2430, 860),
        (2411, 830), (2411, 780), (2419, 758), (2446, 688), (2473, 619), (2488, 558), (2481, 511), (2454, 442), (2419, 396),
        (2388, 358), (2365, 350), (2335, 327), (2331, 296),
    ]
    # the dark foliage behind her hair and the dark ground under the dress
    ground = [[(3060, 370), (3230, 370), (3230, 530), (3120, 470)], [(3370, 1440), (3760, 1440), (3760, 2040), (3370, 2040)],
              [(2960, 1880), (3400, 1880), (3400, 2040), (2960, 2040)]]
    rgb, mask = matte('venus.jpg', (2300, 240, 3800, 2230), outline, band=5, fill=False, peel=(62, 8, ground))
    export(rgb, mask, 'garden/hora')


def elysium_lyre():
    # Schwabe, The Elysian Fields: her hair falls to the ground around a dark dress; the veil over her shoulder is translucent in the painting
    outline = [
        (602, 149), (572, 156), (539, 190), (512, 242), (494, 299), (467, 340), (445, 385), (419, 437), (404, 490), (389, 550),
        (377, 625), (366, 700), (359, 775), (355, 850), (352, 940), (352, 1000), (332, 1008), (299, 1032), (312, 1114), (309, 1279),
        (324, 1345), (349, 1398), (373, 1435), (386, 1526), (398, 1649), (410, 1715), (427, 1760), (443, 1790), (470, 1815),
        (451, 1855), (456, 1875), (497, 1879), (558, 1875), (661, 1879), (711, 1905), (826, 1912), (990, 1908), (1146, 1908),
        (1072, 1846), (990, 1748), (933, 1649), (892, 1550), (842, 1419), (817, 1304), (785, 1156), (767, 992), (749, 775),
        (737, 625), (726, 475), (719, 325), (715, 250), (700, 190), (655, 160),
    ]
    grass = [(450, 1801), (483, 1807), (494, 1817), (483, 1836), (456, 1851), (449, 1850)]  # the wedge between her hem and her foot
    veil = [(374, 640), (370, 680), (366, 730), (364, 830), (360, 890), (358, 980), (330, 980), (330, 640)]  # foliage along the veil's edge
    rgb, mask = matte('elysium-schwabe-large.jpg', (270, 130, 1190, 1937), outline, band=4, bg=[grass, veil], fill=False)
    export(rgb, mask, 'afterlife/elysium-lyre')


def argos():
    # Landseer: lit head and foreleg against the pale drape, matted; his hindquarters are near-black on near-black,
    # so that stretch of the edge is the line where the dark mass meets drape and floor, by hand
    outline = [
        (600, 412), (608, 387), (640, 362), (679, 354), (717, 352), (733, 362), (771, 354), (783, 362), (783, 379), (750, 400),
        (733, 412), (708, 450), (704, 492), (712, 533), (708, 600), (700, 667), (704, 695), (752, 744), (795, 773), (785, 798),
        (731, 798), (688, 814), (672, 816), (650, 846), (645, 878), (618, 884), (615, 851), (588, 846), (545, 843), (500, 850),
        (430, 845), (405, 810), (403, 750), (410, 703), (450, 667), (492, 600), (550, 525), (592, 500), (604, 458),
    ]
    dark = [(380, 680), (470, 680), (560, 800), (590, 900), (380, 900)]
    # three small red rings in the scan, on the black of his flank
    specks = [([(456, 783), (460, 783)], 12, (0, -16)), ([(407, 773), (411, 773)], 8, (16, 0)), ([(553, 645), (557, 645)], 7, (0, 12))]
    rgb, mask = matte('landseer.jpg', (360, 330, 830, 910), outline, band=4, hard=[dark], fill=False, ropes=specks)
    export(rgb, mask, 'endings/argos')


def bottom_fade(shape, base, off, reach):
    """0 on and below the polyline `base` (closed downward), rising to 1 `reach` px above it: where a bust has to end."""
    h, w = shape[:2]
    pts = list(base) + [(base[-1][0], off[1] + h + 5), (base[0][0], off[1] + h + 5)]
    below = poly(shape, pts, off)
    d = distance_transform_edt(~below)
    return np.clip(d / reach, 0, 1) ** 1.5


def andromache_tischbein():
    # the painting that gives crib/hector; she looks down. Soft source: her face is 150 px wide and out of focus in this scan.
    outline = [
        (1250, 627), (1192, 637), (1150, 679), (1129, 733), (1125, 783), (1137, 850), (1108, 900), (1075, 950), (1054, 992),
        (1042, 1042), (1040, 1070), (1420, 1070), (1404, 954), (1400, 917), (1375, 867), (1400, 829), (1375, 775), (1342, 708),
        (1300, 646),
    ]
    box = (1010, 600, 1450, 1090)
    rgb, mask = matte('hector-tischbein.jpg', box, outline, band=4, denoise=0)
    # Hector's arm crosses her chest: the bust has to end there, softly
    fade = bottom_fade(mask.shape, [(1030, 1040), (1200, 1035), (1300, 1020), (1345, 990), (1420, 930)], box[:2], 40)
    export(rgb, mask, 'crib/andromache-face', fade=fade)


def andromache_hayez():
    # sharper by far than the Tischbein, and against a plain wall, but she looks up and away, at Hector
    outline = [
        (2005, 916), (2034, 899), (2083, 888), (2133, 892), (2175, 909), (2200, 945), (2207, 1005), (2230, 1050), (2260, 1097),
        (2296, 1147), (2328, 1193), (2338, 1246), (2345, 1317), (2345, 1400), (2048, 1400), (2048, 1288), (2080, 1246), (2080, 1210),
        (2076, 1161), (2066, 1129), (2048, 1111), (2037, 1097), (2016, 1076), (2009, 1047), (1997, 1005), (1998, 962),
    ]
    box = (1970, 860, 2380, 1420)
    rgb, mask = matte('hector-hayez.jpg', box, outline, band=4, denoise=0.6)
    fade = bottom_fade(mask.shape, [(2030, 1250), (2100, 1300), (2200, 1345), (2360, 1370)], box[:2], 45)
    export(rgb, mask, 'crib/andromache-face', fade=fade)


def amphora():
    # dark clay on a pale photo backdrop: the silhouette is read directly, then pulled in so no backdrop tint survives
    rgb = source('amphora.jpg')
    gray = gaussian_filter(rgb.astype(np.float32).mean(axis=2), 2.0)
    limit = poly(rgb.shape, [(1020, 390), (1960, 390), (2120, 620), (2150, 1100), (2500, 1400), (2500, 1900), (2150, 2750),
                             (1830, 3150), (1830, 3430), (1120, 3430), (1120, 3150), (800, 2750), (480, 1900), (480, 1400),
                             (780, 1100), (800, 620)])
    bg = gray > 125
    lab, _ = label(bg)
    # backdrop = bright regions touching the corners, and the two holes of the handles
    seeds = [lab[0, 0], lab[0, -1], lab[3000, 50], lab[3000, -50], lab[837, 1105], lab[837, 1880]]
    backdrop = np.isin(lab, [i for i in seeds if i])
    plinth = poly(rgb.shape, [(1000, 3385), (1200, 3392), (1500, 3400), (1800, 3392), (2000, 3385), (2000, 3722), (1000, 3722)])
    mask = limit & ~backdrop & ~plinth
    mask = keep_large(mask, 0.2)
    mask = binary_fill_holes(mask) & ~np.isin(lab, [i for i in seeds[4:] if i])
    mask = clean(mask, 4.0)
    mask = binary_erosion(mask, iterations=4)
    global _last_box
    _last_box = (0, 0, *rgb.shape[1::-1])
    export(rgb, mask, 'crib/amphora')


def sphinx():
    # Moreau: the pair. The spear leaves Oedipus' body at his waist and stands clear of his leg, so it is added apart
    outline = [
        (1329, 781), (1431, 819), (1527, 867), (1601, 893), (1644, 936), (1655, 947), (1676, 840), (1697, 813), (1703, 797),
        (1703, 701), (1708, 691), (1735, 689), (1740, 701), (1729, 765), (1724, 808), (1735, 851), (1767, 925), (1804, 1011),
        (1847, 1107), (1885, 1197), (1897, 1326), (1913, 1423), (1893, 1471), (1836, 1486), (1800, 1488), (1771, 1463), (1751, 1439),
        (1715, 1375), (1690, 1350), (1700, 1399), (1700, 1504), (1691, 1560), (1660, 1620), (1630, 1670), (1595, 1720), (1578, 1780),
        (1575, 1870), (1560, 1905), (1530, 1930), (1505, 1925), (1497, 1908), (1480, 1960), (1455, 2020), (1449, 2037), (1440, 2200),
        (1430, 2350), (1406, 2492), (1381, 2640), (1394, 2701), (1461, 2788), (1529, 2935), (1603, 3046), (1652, 3108), (1689, 3169),
        (1738, 3231), (1751, 3280), (1701, 3311), (1628, 3305), (1609, 3268), (1578, 3169), (1541, 3095), (1505, 3028), (1452, 3006),
        (1450, 3130), (1442, 3230), (1447, 3269), (1500, 3308), (1541, 3354), (1572, 3428), (1492, 3452), (1425, 3471), (1381, 3487),
        (1335, 3478), (1253, 3473), (1268, 3434), (1268, 3415), (1161, 3429), (1093, 3449), (1016, 3468), (943, 3478), (938, 3458),
        (953, 3395), (1016, 3386), (1084, 3352), (1137, 3318), (1151, 3221), (1142, 3143), (1122, 3046), (1103, 2978), (1108, 2940),
        (1088, 2920), (1093, 2872), (1074, 2785), (1069, 2755), (1079, 2726), (1069, 2659), (1054, 2581), (1025, 2474), (1016, 2402),
        # the lion's hind leg and the tail, out and back
        (1006, 2397), (933, 2397), (892, 2387), (861, 2314), (830, 2262), (780, 2255), (746, 2268), (760, 2300), (798, 2366), (871, 2438), (900, 2511), (897, 2573),
        (850, 2610), (800, 2660), (822, 2690), (838, 2730), (825, 2780), (803, 2802), (780, 2785), (760, 2741), (740, 2700), (722, 2650),
        (705, 2605), (715, 2563), (757, 2558), (798, 2573), (830, 2558), (850, 2542), (861, 2480), (819, 2418), (757, 2335), (705, 2272),
        (653, 2251), (591, 2231), (549, 2200), (518, 2168), (492, 2106), (477, 1981), (477, 1919), (508, 1857), (523, 1789), (570, 1732),
        (622, 1696), (653, 1686), (612, 1649), (549, 1628), (523, 1602), (466, 1504), (451, 1452), (401, 1245), (375, 1128), (359, 1021),
        # the wing, feather by feather
        (364, 968), (428, 968), (364, 904), (343, 787), (348, 669), (385, 691), (439, 723), (449, 691), (471, 723), (476, 627), (497, 541),
        (513, 579), (540, 712), (551, 467), (583, 422), (597, 509), (609, 456), (641, 440), (647, 541), (668, 557), (663, 637), (663, 712),
        (700, 829), (748, 947), (791, 1053), (844, 1160), (855, 1224), (860, 1117), (890, 1117), (919, 1139), (961, 1128), (1025, 1160),
        (1089, 1192),
        # her profile, the gap between the two faces, his profile
        (1125, 1200), (1128, 1225), (1138, 1250), (1143, 1262), (1202, 1250), (1242, 1271), (1265, 1265), (1298, 1256), (1313, 1240),
        (1319, 1225), (1345, 1205), (1374, 1190), (1366, 1181), (1349, 1181), (1332, 1166), (1328, 1153), (1298, 1143), (1286, 1126),
        (1265, 1128), (1250, 1122), (1217, 1085), (1169, 1021), (1153, 968), (1127, 936), (1132, 925), (1175, 861), (1228, 813), (1281, 787),
    ]
    belly = [(798, 1930), (861, 1924), (944, 1940), (996, 1950), (998, 2231), (965, 2200), (923, 2106), (882, 2054), (819, 2013), (798, 1997)]
    spear = [(1588, 1680), (1554, 1956), (1534, 2142), (1496, 2500), (1465, 2750), (1444, 3000), (1453, 3000), (1484, 2750), (1514, 2500),
             (1556, 2142), (1578, 1956), (1614, 1680)]
    rgb, mask = matte('sphinx-moreau.jpg', (320, 400, 1940, 3510), outline, band=5, bg=[belly], add=[spear], fill=False)
    export(rgb, mask, 'sphinx/sphinx')


# ---------- the medusa statues: the same alpha, the colour turned to warm marble ----------
TINT = np.array([0xcf, 0xc8, 0xbc], dtype=np.float32)


def marble(src, out, seed):
    a = np.asarray(Image.open(OUT + src + '.webp').convert('RGBA'), dtype=np.float32)
    rgb, alpha = a[..., :3] / 255, a[..., 3]
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    inside = alpha > 200
    lo, hi = np.percentile(lum[inside], [2, 98])
    t = np.clip((lum - lo) / (hi - lo), 0, 1) ** 0.85  # lifted contrast
    # carved stone keeps a little grain, and the painting's weave reads as that
    rng = np.random.default_rng(seed)
    t = t + gaussian_filter(rng.standard_normal(t.shape), 0.6) * 0.035
    level = 0.34 + 0.60 * np.clip(t, 0, 1)
    colour = TINT[None, None, :] * level[..., None]
    # slight blue in the shadows
    colour += (1 - np.clip(t, 0, 1))[..., None] ** 2 * np.array([-7, -2, 8], dtype=np.float32)
    # alpha as it stands; the colour under its transparent pixels goes through the same recipe, so the bleed survives
    img = Image.fromarray(np.dstack([np.clip(colour, 0, 255), alpha]).astype(np.uint8), 'RGBA')
    save(img, OUT + out + '.webp')
    print('   ', os.path.getsize(OUT + out + '.webp') // 1024, 'KB')


def stone_graces():
    marble('garden/graces', 'medusa/stone-graces', 1)


def stone_mercury():
    marble('garden/mercury', 'medusa/stone-mercury', 2)


def stone_siren():
    marble('sirens/siren-rope', 'medusa/stone-siren', 3)


def garden_meadow():
    """The flowered ground of the Primavera, from the strip below everyone's feet: laid in rows, like a mille-fleurs."""
    src = Image.open('art/src/primavera.jpg').convert('RGB')
    strip = np.asarray(src.crop((300, 2392, 2500, 2482))).astype(np.float32)
    h, w = strip.shape[:2]
    rows = 12
    size = 1280
    out = np.zeros((rows * (h - 16), size, 3), np.float32)
    weight = np.zeros(out.shape[:2] + (1,), np.float32)
    rng = np.random.default_rng(9)
    ramp = np.minimum(np.minimum(np.arange(h), h - 1 - np.arange(h)) / 12, 1)[:, None, None].astype(np.float32)
    for i in range(rows):
        x = int(rng.uniform(0, w - size))
        piece = strip[:, x:x + size]
        if rng.random() < 0.5:
            piece = piece[:, ::-1]
        y = i * (h - 16)
        for dy in range(h):
            yy = (y + dy) % out.shape[0]
            out[yy] += piece[dy] * ramp[dy, 0]
            weight[yy] += ramp[dy, 0]
    out = out / np.maximum(weight, 1e-3)
    Image.fromarray(out.astype(np.uint8)).save('public/art/garden/meadow.webp', quality=82, method=5)
    print('meadow', out.shape)


def stone_orpheus():
    marble('orpheus/orpheus', 'medusa/stone-orpheus', 4)


CUTS = {
    'sphinx': sphinx,
    'andromache-face': andromache_hayez,
    'andromache-tischbein': andromache_tischbein,  # the alternative, not run by default: softer, but she looks down
    'amphora': amphora,
    'elysium-lyre': elysium_lyre,
    'argos': argos,
    'hora': hora,
    'mercury': mercury,
    'flora': flora,
    'cupid': cupid,
    'ulysses': ulysses,
    'sirens-climbing': sirens_climbing,
    'siren-rope': siren_rope,
    'harpy-right': harpy_right,
    'harpy-a': harpy_a,
    'harpy-b': harpy_b,
    'harpy-left': harpy_left,
    'harpy-mast': harpy_mast,
    # derived from the cuts above, so these run last
    'stone-graces': stone_graces,
    'stone-mercury': stone_mercury,
    'stone-siren': stone_siren,
    'stone-orpheus': stone_orpheus,
    'garden-meadow': garden_meadow,
}

if __name__ == '__main__':
    names = sys.argv[1:] or [n for n in CUTS if n != 'andromache-tischbein']
    for n in names:
        print(n)
        CUTS[n]()
