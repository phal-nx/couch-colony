#!/usr/bin/env python3
"""Draw the native 64px event and mutation icons in art/events/.

Each sprite is hard-alpha RGBA (0 or 255 only) in the earthy palette of
art/sheets/upgrades-native-64.png, with a 1px dark outline and light from the
top-left. Antialiasing is intentionally absent: the critter atlas cuts alpha
at 128, and a soft fringe would become a dirty halo. Existing files in
art/events/ are left alone; this script only rewrites the fourteen names below.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[2]
OUT = PROJECT / 'art/events'
SIZE = 64
NEAREST = getattr(getattr(Image, 'Resampling', Image), 'NEAREST')


def H(value):
    value = value.lstrip('#')
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


# Outline, then the upgrade sheet's earth, amber, moss, rust, slate, violet and bone.
O = H('#050200')
RIM = H('#1d0d05')
SOIL0 = H('#2c1c13')
SOIL1 = H('#4e3123')
SOIL2 = H('#6e4228')
A0 = H('#aa5707')
A1 = H('#cb7302')
A2 = H('#d07b1c')
A3 = H('#e79f41')
A4 = H('#f3b760')
A5 = H('#f9c97f')
M0 = H('#1d2a12')
M1 = H('#2a3c1b')
M2 = H('#6b7a3a')
M3 = H('#8fae6b')
U0 = H('#7a3626')
U1 = H('#ab523a')
S0 = H('#4c5680')
S1 = H('#6e8aa6')
VIOLET = H('#7a64a0')
B0 = H('#a89f8c')
B1 = H('#edd5bb')
B2 = H('#f2ddc6')

EARTH = [SOIL0, SOIL1, SOIL1, SOIL2, SOIL2, SOIL2]
AMBER = [A0, A1, A2, A3, A4, A5]
AMBER_BACK = [A0, A0, A1, A1, A2]
MOSS = [M0, M1, M1, M2, M2, M3]
BONE = [B0, B0, B1, B1, B2, B2]
RUST = [U0, U0, U1, U1]
LIGHT = (-0.55, -0.84)
LIGHT_N = math.hypot(LIGHT[0], LIGHT[1])
LX, LY = LIGHT[0] / LIGHT_N, LIGHT[1] / LIGHT_N
ALLOWED = {
    O, RIM, SOIL0, SOIL1, SOIL2, A0, A1, A2, A3, A4, A5,
    M0, M1, M2, M3, U0, U1, S0, S1, VIOLET, B0, B1, B2,
}


def pick(ramp, t):
    if t < 0:
        t = 0.0
    elif t > 1:
        t = 1.0
    if len(ramp) == 1:
        return ramp[0]
    return ramp[int(round(t * (len(ramp) - 1)))]


def raster(pts):
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).polygon([(float(x), float(y)) for x, y in pts], fill=255)
    return mask.load()


def quad(p0, p1, p2, n=18):
    pts = []
    for i in range(n + 1):
        t = i / float(n)
        u = 1 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


class Icon(object):
    def __init__(self):
        self.p = {}

    def put(self, x, y, color):
        x = int(round(x))
        y = int(round(y))
        if 0 <= x < SIZE and 0 <= y < SIZE and color is not None:
            self.p[(x, y)] = color

    def disc(self, cx, cy, r, color):
        r = max(r, 0.55)
        reach = int(math.ceil(r + 1))
        x0, y0 = int(math.floor(cx)), int(math.floor(cy))
        limit = (r + 0.12) ** 2
        for y in range(y0 - reach, y0 + reach + 2):
            for x in range(x0 - reach, x0 + reach + 2):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= limit:
                    self.put(x, y, color)

    def line(self, x0, y0, x1, y1, color, width=1.4):
        dist = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(math.ceil(dist * 2)))
        for i in range(steps + 1):
            t = i / float(steps)
            self.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2.0, color)

    def ellipse(self, cx, cy, rx, ry, ramp, rot=0.0):
        cos, sin = math.cos(rot), math.sin(rot)
        ext = math.hypot(rx, ry) + 2
        x0, x1 = int(cx - ext), int(cx + ext + 1)
        y0, y1 = int(cy - ext), int(cy + ext + 1)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                lx = dx * cos + dy * sin
                ly = -dx * sin + dy * cos
                if (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) > 1:
                    continue
                gx, gy = lx / (rx * rx), ly / (ry * ry)
                sgx = gx * cos - gy * sin
                sgy = gx * sin + gy * cos
                mag = math.hypot(sgx, sgy) or 1
                dot = (sgx / mag) * LX + (sgy / mag) * LY
                if callable(ramp):
                    color = ramp(lx / rx, ly / ry, dot)
                else:
                    color = pick(ramp, (dot + 1) / 2)
                if color:
                    self.put(x, y, color)

    def fill(self, pts, color):
        pix = raster(pts)
        for y in range(SIZE):
            for x in range(SIZE):
                if pix[x, y]:
                    self.put(x, y, color(x, y) if callable(color) else color)

    def paint_over(self, other):
        """Keep other's pixels only where this icon is already opaque."""
        for key, color in other.p.items():
            if key in self.p:
                self.p[key] = color

    def blit(self, other, ox=0, oy=0):
        for (x, y), color in other.p.items():
            self.put(x + ox, y + oy, color)

    def outline(self):
        """1px ring. The lit side is near-black; the lower-right rim is the brown-black."""
        filled = set(self.p)
        votes = {}
        for x, y in filled:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if (nx, ny) in filled or nx < 0 or ny < 0 or nx >= SIZE or ny >= SIZE:
                    continue
                slot = votes.setdefault((nx, ny), [0, 0])
                if dx > 0 or dy > 0:
                    slot[0] += 1
                else:
                    slot[1] += 1
        for (x, y), (shadow, light) in votes.items():
            if (x, y) not in self.p:
                self.p[(x, y)] = RIM if shadow >= light else O

    def image(self):
        im = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        pix = im.load()
        for (x, y), color in self.p.items():
            pix[x, y] = color + (255,)
        return im


def stroke(layer, pts, ramp, radius):
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        dist = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(math.ceil(dist / max(0.45, radius * 0.55))))
        for s in range(steps + 1):
            t = s / float(steps)
            layer.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, radius, ramp)


def stroke_flat(layer, pts, color, width):
    for i in range(len(pts) - 1):
        layer.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], color, width)


def compose(*layers):
    out = Icon()
    for layer in layers:
        if layer is None or not layer.p:
            continue
        layer.outline()
        out.blit(layer)
    return out


def spark(icon, x, y, core=B2, side=A5):
    x, y = int(round(x)), int(round(y))
    if (x, y) in icon.p:
        icon.p[(x, y)] = core
    if (x - 1, y) in icon.p:
        icon.p[(x - 1, y)] = side
    if (x, y - 1) in icon.p:
        icon.p[(x, y - 1)] = side


def helix_layers(cx, y0, y1, amp, turns=2.0, phase=None, radius=1.55):
    """Back strand, rungs, and front strand of an amber double helix."""
    if phase is None:
        phase = math.pi / 2
    back, mid, front = Icon(), Icon(), Icon()
    strands = []
    span = float(y1 - y0)
    for sign in (1, -1):
        pts = []
        for y in range(y0, y1 + 1):
            t = (y - y0) / span * turns * math.tau + phase
            pts.append((cx + math.sin(t) * amp * sign, y, math.cos(t) * sign))
        strands.append(pts)

    def runs(pts, pred):
        run = []
        found = []
        for point in pts:
            if pred(point[2]):
                run.append(point)
            elif run:
                found.append(run)
                run = []
        if run:
            found.append(run)
        return found

    for pts in strands:
        for run in runs(pts, lambda z: z < 0.42):
            stroke(back, [(p[0], p[1]) for p in run], AMBER_BACK, radius)
        for run in runs(pts, lambda z: z > -0.16):
            stroke(front, [(p[0], p[1]) for p in run], AMBER, radius)
    for i, (a, b) in enumerate(zip(strands[0], strands[1])):
        if i % 5 != 2 or abs(a[2]) > 0.62 or abs(a[0] - b[0]) < 7:
            continue
        mid.line(a[0], a[1], b[0], b[1], SOIL0, 1.45)
        mid.put((a[0] + b[0]) / 2, a[1], B1)
        mid.put((a[0] + b[0]) / 2, a[1] - 1, B2)
    return back, mid, front


def sprite(layer, rows, origin_x, origin_y, facing, paint):
    """Stamp a mask. Local +x points at the head; light stays top-left on screen."""
    width = len(rows[0])
    for row in rows:
        if len(row) != width:
            raise ValueError('sprite row is %d wide, expected %d (%r)' % (len(row), width, row))
    if facing > 0:
        minx, maxx = origin_x, origin_x + width - 1
    else:
        minx, maxx = origin_x - width + 1, origin_x
    miny, maxy = origin_y, origin_y + len(rows) - 1
    for ly, row in enumerate(rows):
        for lx, ch in enumerate(row):
            if ch == '.':
                continue
            sx = origin_x + lx * facing
            sy = origin_y + ly
            layer.put(sx, sy, paint(ch, sx, sy, minx, miny, maxx, maxy))


def lit_amount(sx, sy, minx, miny, maxx, maxy):
    tx = (sx - minx) / float(max(1, maxx - minx))
    ty = (sy - miny) / float(max(1, maxy - miny))
    return tx * 0.62 + ty * 0.38


# Tail at the left of the mask, head and antennae at the right. s = plate seam, t = amber trim.
ROACH = [
    '.......................a..',
    '.....................a.a..',
    '....................a.....',
    '.................hhhh.....',
    '...............hhEeh......',
    '............ttBBBhMm......',
    '..........ttBBBsBBBh......',
    '........ttBBBBsBBBBB......',
    '......ttBBBBBBsBBBBBB.....',
    '......tBBBBBBBsBBBBBB.....',
    '.......BBBBBBBsBBBBB......',
    '........BBBBBBBBBB........',
    '......L....L....L.........',
    '.....L....L....L..........',
    '....L....L....L...........',
    '...LL...LL...LL...........',
]


def roach_ink(ch, sx, sy, minx, miny, maxx, maxy):
    lit = lit_amount(sx, sy, minx, miny, maxx, maxy)
    if ch == 'E':
        return O
    if ch == 's':
        return RIM
    if ch == 't':
        return A5 if lit < 0.34 else A3 if lit < 0.62 else A1
    if ch == 'h':
        return SOIL2 if lit < 0.45 else SOIL1
    if ch == 'M':
        return U1
    if ch == 'm':
        return U0
    if ch == 'a':
        return SOIL2 if lit < 0.4 else SOIL1
    if ch == 'L':
        return SOIL2 if lit < 0.35 else SOIL1 if lit < 0.65 else SOIL0
    if lit < 0.28:
        return SOIL2
    if lit < 0.55:
        return SOIL1
    return SOIL0


def armored_roach(origin_x, origin_y, facing):
    """Hand-placed armored roach. origin is the tail; facing is +1 (right) or -1 (left)."""
    bug = Icon()
    sprite(bug, ROACH, origin_x, origin_y, facing, roach_ink)
    return bug


def shield_pts(cx, top, width, height, inset):
    pts = [
        (cx - width * 0.42, top),
        (cx + width * 0.42, top),
        (cx + width * 0.50, top + height * 0.14),
        (cx + width * 0.46, top + height * 0.46),
        (cx + width * 0.18, top + height * 0.78),
        (cx, top + height),
        (cx - width * 0.18, top + height * 0.78),
        (cx - width * 0.46, top + height * 0.46),
        (cx - width * 0.50, top + height * 0.14),
    ]
    if not inset:
        return pts
    ay = top + height * 0.48
    return [(cx + (x - cx) * (1 - inset), ay + (y - ay) * (1 - inset)) for x, y in pts]


def wing_pts(side):
    # Shoulder, leading edge, then four finger tips with deep membrane notches.
    left = [
        (33, 30), (24, 16), (12, 10), (18, 18), (7, 22), (16, 26),
        (6, 34), (16, 34), (11, 48), (22, 44), (33, 40),
    ]
    if side < 0:
        return left
    return [(64 - x, y) for x, y in left]


def wing_ink(x, y):
    # Dusky membrane: brown chitin with slate flecks, lit along the top edge.
    if y < 18:
        return SOIL2
    if y > 40:
        return SOIL0
    if (x * 3 + y) % 5 == 0:
        return S0
    return SOIL1 if y < 32 else SOIL0


def draw_wings(layer):
    for side in (-1, 1):
        pts = wing_pts(side)
        layer.fill(pts, wing_ink)
        shoulder = pts[0]
        for tip in (pts[2], pts[4], pts[6], pts[8]):
            layer.line(shoulder[0], shoulder[1], tip[0], tip[1], SOIL0, 1.4)
        layer.line(shoulder[0], shoulder[1], pts[2][0], pts[2][1], SOIL2, 1.05)


def draw_hourglass(layer):
    layer.line(24, 19, 31, 32, B1, 1.45)
    layer.line(40, 19, 33, 32, B0, 1.45)
    layer.line(31, 34, 24, 45, B1, 1.45)
    layer.line(33, 34, 40, 45, B0, 1.45)
    layer.fill([(28, 23), (36, 23), (33, 31), (31, 31)], A3)
    layer.fill([(29, 21), (35, 21), (35, 24), (29, 24)], A5)
    layer.fill([(25, 44), (39, 44), (35, 37), (29, 37)], A2)
    layer.fill([(27, 44), (37, 44), (34, 40), (30, 40)], A4)
    layer.line(32, 31, 32, 37, A5, 1.15)
    layer.line(21, 18, 21, 46, SOIL1, 2.0)
    layer.line(43, 18, 43, 46, SOIL0, 2.0)
    layer.line(20, 18, 20, 46, SOIL2, 1.05)
    layer.ellipse(32, 15, 14, 4.1, EARTH)
    layer.ellipse(32, 49, 14, 4.1, EARTH)
    layer.line(20, 13.2, 42, 13.2, A3, 1.15)
    layer.put(26, 22, B2)


def draw_eggs(layer, eggs):
    for cx, cy, rx, ry in eggs:
        for ang in (0.8, 2.4, 4.0, 5.4):
            layer.put(cx + math.cos(ang) * (rx + 1.4), cy + math.sin(ang) * (ry + 1.2), A3)
        layer.ellipse(cx, cy, rx, ry, BONE)
        layer.ellipse(cx - rx * 0.28, cy - ry * 0.32, max(1.2, rx * 0.28), max(1.2, ry * 0.22), [A5, B2])


def draw_larva(layer, head_x, y, facing):
    """Long cream grub: grooved body, distinct head, antennae and three legs."""
    def X(dist):
        return head_x - dist * facing

    layer.ellipse(X(12), y, 8.2, 3.6, BONE)
    layer.line(X(15.2), y - 3.2, X(15.2), y + 3.2, SOIL0, 1.3)
    layer.line(X(8.4), y - 3.4, X(8.4), y + 3.4, RIM, 1.25)
    layer.ellipse(X(2.4), y - 0.5, 3.4, 3.0, BONE)
    layer.put(X(1.2), y - 1.2, O)
    layer.put(X(2.2), y - 1.6, B2)
    layer.line(X(0.2), y - 1.8, X(-3.4), y - 5.4, SOIL1, 1.1)
    layer.line(X(0.6), y - 0.4, X(-2.4), y - 3.0, SOIL0, 1.0)
    layer.disc(X(-0.2), y + 1.0, 1.15, U1)
    for dist, foot in ((4.8, 2.4), (9.4, 1.4), (14.2, 2.6)):
        knee_x = X(dist) + facing * foot
        layer.line(X(dist), y + 3.0, knee_x, y + 7.4, SOIL1, 1.15)
        layer.disc(knee_x, y + 7.4, 0.85, SOIL0)


def draw_banner(layer):
    layer.ellipse(30, 50, 11, 3.6, EARTH)
    layer.ellipse(22, 51, 4.5, 2.4, [SOIL0, SOIL1])
    layer.ellipse(40, 51, 5.5, 2.6, [SOIL0, SOIL1, SOIL2])
    layer.line(30, 48, 30, 14, SOIL1, 2.3)
    layer.line(29, 48, 29, 16, SOIL2, 1.05)
    layer.ellipse(30, 13, 2.3, 2.3, [SOIL1, SOIL2, A3])
    layer.fill([(33, 16), (54, 19), (50, 25), (54, 32), (33, 29)], U1)
    layer.fill([(33, 24), (50, 25), (54, 32), (33, 29)], U0)
    layer.line(33, 16, 54, 19, A4, 1.15)


def draw_mandibles(layer, left, right, width=2.5):
    for pts in (left, right):
        stroke_flat(layer, pts, U0, width)
        highlight = [(x - 1, y - 1) for x, y in pts]
        stroke_flat(layer, highlight, U1, max(1.1, width * 0.45))
        layer.disc(pts[0][0], pts[0][1], width * 0.45, B1)
        layer.disc(pts[-1][0], pts[-1][1], 1.1, B2)


def clover_leaf(layer, cx, cy, angle):
    layer.ellipse(cx, cy, 11.2, 6.5, MOSS, rot=angle)
    layer.line(
        cx - math.cos(angle) * 6, cy - math.sin(angle) * 6,
        cx + math.cos(angle) * 9, cy + math.sin(angle) * 9, M0, 1.15)
    dab = Icon()
    dab.ellipse(cx - 2.2, cy - 2.4, 2.5, 1.5, [M3], rot=angle)
    layer.paint_over(dab)


def oak_leaf(layer, ox, oy):
    raw = [
        (0, -15), (5, -11), (3, -8), (8, -6), (4, -3), (8, 0), (4, 3),
        (6, 6), (1, 7), (-2, 6), (-6, 4), (-4, 1), (-8, -2), (-4, -5),
        (-7, -8), (-3, -11),
    ]
    before = set(layer.p)
    layer.fill([(ox + x, oy + y) for x, y in raw], A3)
    for key in list(layer.p):
        if key in before:
            continue
        x, y = key
        if x > ox + 1:
            layer.p[key] = A1 if (x + y) % 2 == 0 else U1
        elif y < oy - 6 and (x + y) % 3 == 0:
            layer.p[key] = A5
    layer.line(ox, oy - 13, ox, oy + 6, A0, 1.15)
    layer.line(ox, oy - 6, ox + 5, oy - 4, U0, 1.0)
    layer.line(ox, oy - 1, ox - 5, oy + 1, U0, 1.0)


def gem(layer, cx, cy, rx, ry, body, lit):
    top, right, bot, left = (cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)
    layer.fill([top, right, bot, left], body)
    layer.fill([top, left, (cx, cy)], lit)
    layer.line(top[0], top[1], left[0], left[1], A4, 1.15)
    layer.line(top[0], top[1], right[0], right[1], A2, 1.05)
    layer.put(cx - rx * 0.28, cy - ry * 0.42, B2)


def crumb_pile(layer):
    # Cream and pale gold, so the pile stays separate from the amber helix wrapped around it.
    bread = [A1, A3, A4, A5, B1, B2]
    blobs = (
        (33, 34, 8.4, 6.2), (43, 30, 5.8, 4.6), (23, 32, 5.4, 4.4),
        (37, 44, 7.2, 4.8), (26, 43, 4.4, 3.6), (47, 40, 3.6, 3.0),
        (31, 24, 3.8, 3.0), (16, 46, 2.6, 2.1), (52, 22, 2.4, 1.9),
    )
    for cx, cy, rx, ry in blobs:
        layer.ellipse(cx, cy, rx, ry, bread)
    layer.line(29, 32, 38, 37, A0, 1.1)
    layer.line(35, 41, 43, 33, A0, 1.05)
    layer.line(24, 34, 30, 29, A1, 1.0)
    for x, y in ((30, 36), (40, 31), (34, 45), (25, 33)):
        layer.put(x, y, U0)


def clone_army():
    """Two armored roaches facing a bone-and-amber mirror prism."""
    prism = Icon()
    prism.fill([
        (32, 11), (36, 20), (36, 46), (32, 54), (28, 46), (28, 20),
    ], B0)
    prism.fill([(32, 14), (29, 21), (29, 45), (32, 52)], B2)
    prism.line(32, 16, 32, 50, B1, 1.1)
    prism.line(29, 21, 32, 13, A4, 1.15)
    prism.line(29, 21, 29, 45, A3, 1.05)
    left = armored_roach(2, 22, 1)
    right = armored_roach(61, 22, -1)
    icon = compose(prism, left, right)
    spark(icon, 30, 24, B2, A5)
    spark(icon, 31, 36, A5, B2)
    spark(icon, 30, 46, B2, A4)
    spark(icon, 10, 28, A5, B2)
    spark(icon, 40, 28, A5, B2)
    return icon


def intruder_shield():
    """Chitin face, twig rim, moss and amber bands, crossed mandibles."""
    face = Icon()
    outer = raster(shield_pts(32, 8, 42, 46, 0))
    inner = raster(shield_pts(32, 8, 42, 46, 0.16))
    for y in range(SIZE):
        for x in range(SIZE):
            if not outer[x, y]:
                continue
            t = (x - 12) / 40.0
            if inner[x, y]:
                if 30 <= y <= 34:
                    face.put(x, y, M3 if y == 30 else M2 if y < 33 else M1)
                elif 38 <= y <= 41:
                    face.put(x, y, A4 if y == 38 else A2 if y < 41 else A1)
                elif t < 0.32:
                    face.put(x, y, SOIL2)
                elif t < 0.68:
                    face.put(x, y, SOIL1)
                else:
                    face.put(x, y, SOIL0)
            else:
                face.put(x, y, SOIL2 if t < 0.28 else SOIL0)
    face.ellipse(22, 18, 1.6, 1.4, [SOIL1, SOIL2])
    face.ellipse(42, 18, 1.5, 1.3, [SOIL0, SOIL1])
    face.line(18, 14, 24, 16, SOIL2, 1.15)
    face.line(46, 15, 40, 17, SOIL1, 1.1)
    jaws = Icon()
    draw_mandibles(
        jaws,
        quad((14, 33), (32, 16), (46, 46)),
        quad((50, 33), (32, 16), (18, 46)),
        2.35,
    )
    icon = compose(face, jaws)
    spark(icon, 24, 16, A5, B2)
    return icon


def clover():
    """Three moss leaflets, a dark stem, and one dew glint."""
    plant = Icon()
    plant.line(32, 42, 34, 48, SOIL0, 1.9)
    plant.line(34, 48, 32, 55, SOIL0, 1.7)
    plant.line(31, 43, 32, 54, SOIL2, 1.0)
    junction = (32, 34)
    for angle in (-math.pi / 2, math.radians(128), math.radians(52)):
        clover_leaf(
            plant,
            junction[0] + math.cos(angle) * 10,
            junction[1] + math.sin(angle) * 10,
            angle,
        )
    plant.disc(32, 34, 1.8, M0)
    icon = compose(plant)
    # Dew sits on the upper-left of the top leaflet.
    for dx, dy, color in ((-1, -1, B2), (0, -1, B2), (0, 0, S1), (1, 0, B1)):
        key = (26 + dx, 20 + dy)
        if key in icon.p:
            icon.p[key] = color
    return icon


def acorn():
    """Dark stippled cap, ochre nut, and an autumn oak leaf."""
    art = Icon()
    oak_leaf(art, 16, 26)
    art.line(16, 32, 28, 24, SOIL1, 1.35)
    art.ellipse(40, 40, 11, 12, AMBER)
    for x, y in ((36, 42), (44, 44), (40, 48), (33, 40)):
        art.put(x, y, A0)
    before = set(art.p)
    art.ellipse(40, 29, 12, 8, EARTH)
    for i in range(6):
        ang = math.pi * (0.12 + 0.76 * i / 5.0)
        art.disc(40 + math.cos(ang) * 11, 31 + math.sin(ang) * 6.5, 2.15, SOIL1)
    for key in list(art.p):
        if key not in before and (key[0] + key[1] * 2) % 3 == 0:
            art.p[key] = SOIL0
    art.line(30, 26, 46, 24, SOIL2, 1.15)
    art.disc(40, 20, 1.7, SOIL0)
    art.line(30, 36, 36, 33, A4, 1.05)
    return compose(art)


def mutate_brood():
    """Amber helix intertwined with three glowing cream eggs."""
    back, mid, front = helix_layers(33, 10, 54, 15, turns=2.0)
    eggs = Icon()
    draw_eggs(eggs, ((30, 26, 6.4, 8.2), (44, 36, 5.6, 7.2), (24, 44, 4.6, 6.0)))
    icon = compose(back, mid, eggs, front)
    spark(icon, 27, 22)
    spark(icon, 41, 32)
    spark(icon, 22, 41, B2, A4)
    return icon


def mutate_power():
    """Dusky bat wings behind the helix, with a gold lightning spark."""
    wings = Icon()
    draw_wings(wings)
    back, mid, front = helix_layers(32, 14, 50, 7, turns=2.0, radius=1.45)
    bolt = Icon()
    bolt.fill([
        (46, 8), (38, 8), (34, 22), (40, 21), (28, 46),
        (34, 32), (28, 34), (40, 16),
    ], A4)
    bolt.line(40, 12, 34, 24, A5, 1.35)
    bolt.line(36, 26, 31, 40, A5, 1.25)
    icon = compose(wings, back, mid, front, bolt)
    spark(icon, 42, 12)
    return icon


def mutate_clone():
    """Helix splitting into a mirrored pair of larvae."""
    back, mid, front = helix_layers(32, 8, 30, 10, turns=1.35, radius=1.5)
    larvae = Icon()
    draw_larva(larvae, 11, 44, -1)
    draw_larva(larvae, 52, 44, 1)
    stroke(front, [(26, 30), (24, 36), (26, 41)], AMBER, 1.45)
    stroke(front, [(38, 30), (40, 36), (38, 41)], AMBER, 1.45)
    icon = compose(back, mid, larvae, front)
    spark(icon, 10, 40, B2, A4)
    spark(icon, 53, 40, B2, A4)
    return icon


def mutate_time():
    """Helix coiled around a wooden gold hourglass."""
    back, mid, front = helix_layers(32, 10, 54, 16, turns=2.0)
    glass = Icon()
    draw_hourglass(glass)
    icon = compose(back, mid, glass, front)
    spark(icon, 26, 18, B2, A5)
    return icon


def mutate_rush():
    """Jagged amber burst, helix, and three forward chevrons."""
    burst = Icon()
    for i in range(12):
        ang = -math.pi / 2 + i * math.tau / 12
        length = 24 if i % 2 == 0 else 15
        width = 3.4 if i % 2 == 0 else 2.4
        color = A2 if i % 2 == 0 else A0
        ux, uy = math.cos(ang), math.sin(ang)
        px, py = -uy, ux
        burst.fill([
            (30 + ux * length, 32 + uy * length),
            (30 + px * width, 32 + py * width),
            (30 - px * width, 32 - py * width),
        ], color)
    back, mid, front = helix_layers(28, 16, 50, 7, turns=1.7, radius=1.4)
    marks = Icon()
    for tip_x in (44, 50, 56):
        marks.line(tip_x - 6, 26, tip_x, 32, A4, 3.0)
        marks.line(tip_x - 6, 38, tip_x, 32, A4, 3.0)
        marks.line(tip_x - 5, 28, tip_x - 1, 32, A5, 1.25)
        marks.line(tip_x - 5, 36, tip_x - 1, 32, A5, 1.25)
    return compose(burst, back, mid, front, marks)


def mutate_meta():
    """Helix inside a violet-and-gold crystal cluster."""
    back, mid, front = helix_layers(32, 18, 50, 6, turns=1.8, radius=1.4)
    crystals = Icon()
    gem(crystals, 18, 40, 7, 9, VIOLET, A3)
    gem(crystals, 48, 36, 6, 8, A2, A5)
    gem(crystals, 32, 16, 6, 8, A1, A4)
    gem(crystals, 40, 52, 5, 6, VIOLET, B1)
    gem(crystals, 32, 34, 11, 15, VIOLET, A4)
    icon = compose(back, mid, crystals, front)
    spark(icon, 27, 24, B2, A5)
    spark(icon, 46, 30, A5, B2)
    return icon


def mutate_freq():
    """Helix inside moss and ochre spore rings."""
    rings = Icon()
    colors = (M2, A2, M1, A3)
    for index, rx in enumerate((12, 18, 24, 29)):
        ry = rx * 0.78
        color = colors[index]
        inner = 1 - (1.55 / rx)
        for y in range(SIZE):
            for x in range(SIZE):
                dx = (x + 0.5 - 32) / rx
                dy = (y + 0.5 - 32) / ry
                dist = math.hypot(dx, dy)
                if inner <= dist <= 1:
                    rings.put(x, y, M3 if index % 2 == 0 and dx < -0.2 and dy < -0.2 else color)
    back, mid, front = helix_layers(32, 16, 48, 6, turns=1.8, radius=1.35)
    for ang, color in ((0.4, M3), (1.7, A4), (3.1, M3), (4.6, A5), (5.5, A3)):
        front.disc(32 + math.cos(ang) * 21, 32 + math.sin(ang) * 16, 1.15, color)
    return compose(rings, back, mid, front)


def mutate_energy():
    """Helix around a cyan-amber resin sphere and its circuit veins."""
    traces = Icon()
    for pts, color in (
        ([(46, 30), (56, 30), (56, 18)], S1),
        ([(40, 42), (40, 54), (52, 54)], A2),
        ([(24, 24), (14, 24), (14, 14)], S1),
        ([(22, 40), (12, 40), (12, 50)], A1),
    ):
        stroke_flat(traces, pts, color, 1.45)
        traces.disc(pts[-1][0], pts[-1][1], 1.8, A4)
        traces.put(pts[-1][0], pts[-1][1], A5)
    back, mid, front = helix_layers(32, 14, 52, 12, turns=2.0, radius=1.45)

    def resin(nx, ny, dot):
        dist = math.hypot(nx, ny)
        if dist < 0.26:
            return A5 if dot > 0 else A4
        if dist < 0.62:
            return S1 if dot > -0.05 else S0
        if dot > 0.2:
            return A4
        if dot > -0.25:
            return A2
        return A0

    sphere = Icon()
    sphere.ellipse(34, 32, 9.2, 9.2, resin)
    icon = compose(traces, back, mid, sphere, front)
    spark(icon, 31, 28, B2, A5)
    return icon


def mutate_territory():
    """Helix across a rust banner, with beetle mandibles in front."""
    back, mid, front = helix_layers(34, 12, 50, 12, turns=1.8, radius=1.45)
    flag = Icon()
    draw_banner(flag)
    jaws = Icon()
    draw_mandibles(
        jaws,
        quad((16, 40), (8, 50), (28, 56)),
        quad((48, 40), (56, 50), (36, 56)),
        2.15,
    )
    return compose(back, flag, mid, front, jaws)


def mutate_crumbs():
    """Helix wrapped around a glowing crumb cluster."""
    back, mid, front = helix_layers(33, 12, 54, 16, turns=2.0)
    crumbs = Icon()
    crumb_pile(crumbs)
    icon = compose(back, mid, crumbs, front)
    spark(icon, 29, 30)
    spark(icon, 40, 27, A5, B2)
    spark(icon, 34, 40, A5, A4)
    return icon


BUILDERS = [
    ('clone_army.png', clone_army),
    ('intruder_shield.png', intruder_shield),
    ('clover.png', clover),
    ('acorn.png', acorn),
    ('mutate_brood.png', mutate_brood),
    ('mutate_power.png', mutate_power),
    ('mutate_clone.png', mutate_clone),
    ('mutate_time.png', mutate_time),
    ('mutate_rush.png', mutate_rush),
    ('mutate_meta.png', mutate_meta),
    ('mutate_freq.png', mutate_freq),
    ('mutate_energy.png', mutate_energy),
    ('mutate_territory.png', mutate_territory),
    ('mutate_crumbs.png', mutate_crumbs),
]


def validate(path, image):
    if image.size != (SIZE, SIZE) or image.mode != 'RGBA':
        raise SystemExit('%s is %s %s, expected 64x64 RGBA' % (path.name, image.size, image.mode))
    bad = set()
    semi = 0
    opaque = 0
    xs, ys = [], []
    for y in range(SIZE):
        for x in range(SIZE):
            pixel = image.getpixel((x, y))
            if pixel[3] == 0:
                continue
            opaque += 1
            xs.append(x)
            ys.append(y)
            if pixel[3] != 255:
                semi += 1
            if pixel[:3] not in ALLOWED:
                bad.add(pixel[:3])
    if semi or bad or opaque == 0:
        raise SystemExit('%s failed hard-alpha palette check: semi=%d bad=%s' % (path.name, semi, sorted(bad)))
    if min(xs) == 0 or min(ys) == 0 or max(xs) == SIZE - 1 or max(ys) == SIZE - 1:
        raise SystemExit('%s outline is clipped by the frame (%d,%d)-(%d,%d)' % (
            path.name, min(xs), min(ys), max(xs), max(ys)))
    if O not in set(image.getpixel((x, y))[:3] for x, y in zip(xs, ys) if image.getpixel((x, y))[:3] in (O, RIM)):
        # Both outline inks are expected somewhere on the silhouette.
        colors = {image.getpixel((x, y))[:3] for x, y in zip(xs, ys)}
        if O not in colors and RIM not in colors:
            raise SystemExit('%s has no dark outline' % path.name)
    return opaque, (min(xs), min(ys), max(xs), max(ys))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    images = []
    for name, builder in BUILDERS:
        icon = builder()
        image = icon.image()
        path = OUT / name
        image.save(path, 'PNG')
        opaque, box = validate(path, Image.open(path).convert('RGBA'))
        images.append((name, image))
        print('wrote art/events/%s  opaque=%d  bbox=%s' % (name, opaque, box))
    scale = 4
    cols = 7
    pad = 6
    cell = SIZE * scale
    label_h = 12
    sheet = Image.new('RGB', (
        cols * cell + (cols + 1) * pad,
        2 * (cell + label_h) + 3 * pad,
    ), (22, 16, 12))
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(images):
        col, row = index % cols, index // cols
        x = pad + col * (cell + pad)
        y = pad + row * (cell + label_h + pad)
        big = image.resize((cell, cell), NEAREST)
        bg = Image.new('RGBA', (cell, cell), (22, 16, 12, 255))
        bg.alpha_composite(big)
        sheet.paste(bg.convert('RGB'), (x, y))
        draw.text((x, y + cell + 1), name.replace('.png', '').replace('mutate_', 'm_'), fill=(236, 214, 180))
    preview = Path('/tmp/roach-event-icons.png')
    sheet.save(preview)
    print('preview', preview)


if __name__ == '__main__':
    main()
