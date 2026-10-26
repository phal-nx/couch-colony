#!/usr/bin/env python3
"""Pack the walking creatures, props and the habitat's mote sprites into app/creature-sprites.js.

Reads art/creatures/: four-frame strips (overhead, head right) named in manifest.json with the game species they
stand for, and 16/24 px props. Adds half-size strips for the creatures that walk inside the nest, reduced by the
commonest colour of each 2x2 block, and draws the nine mote kinds as pixel art. Everything ships in one PNG data
URL because canvas reads of file:// images can be blocked on webOS. Numbered Pantheon and Overmind tiers are
recoloured at runtime from their base strip (manifest tintAliases), so they cost no extra bytes here.

Review images go to work/creatures-qa/.
"""
import base64
import io
import json
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT = Path(__file__).resolve().parents[2]
ART = PROJECT / 'art/creatures'
QA = PROJECT / 'work/creatures-qa'
FRAMES = 4
# Creatures that also walk the nest's tunnels, drawn at half size there.
MINIS = {
    'drone': 'forager',
    'queen': 'nest-queen',
    'hatchling': 'hatchling',
    'nest': 'brood-mother',
    'goddess': 'elder-sage',
    'nightbug': 'firefly',
}
ACTING = [
    ('forager-idle', 'drone', 32),
    ('forager-deposit', 'drone', 32),
    ('queen-lay', 'queen', 48),
    ('hatchling-wriggle', 'hatchling', 32),
    ('roach-sentry', 'roach', 48),
    ('brood-tend', 'nest', 48),
]
PROPS = [
    'carried-crumb', 'auto-buy-parcel', 'egg',
    'crumb-1', 'crumb-2', 'crumb-3', 'crumb-4',
    'crumb-pile-small', 'crumb-pile-medium', 'crumb-pile-large',
    'burrow-hole-1', 'burrow-hole-2',
    'grass-tuft-1', 'grass-tuft-2', 'grass-tuft-3',
    'soil-clod-1', 'soil-clod-2',
    'territory-claim-post'
]
# Motes: nine kinds, eight frames over each mote's life, 16 px cells. Order matches RoachMotes kinds.
MOTE = 16
MOTE_KINDS = ['dust', 'crumb', 'fleck', 'ember', 'spore', 'glint', 'clod', 'firefly', 'speck']


def rgba(path):
    return np.asarray(Image.open(path).convert('RGBA')).copy()


def reduce_half(frame):
    """Opaque where at least two of a 2x2 block are; the commonest colour wins, ties go to the one nearest the mean."""
    h, w = frame.shape[0] // 2, frame.shape[1] // 2
    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            block = frame[y * 2:y * 2 + 2, x * 2:x * 2 + 2].reshape(4, 4)
            solid = block[block[:, 3] > 127]
            if len(solid) < 2:
                continue
            counts = Counter(tuple(p[:3]) for p in solid)
            mean = solid[:, :3].mean(axis=0)
            best = max(counts, key=lambda c: (counts[c], -np.abs(np.array(c) - mean).sum()))
            out[y, x] = list(best) + [255]
    return out


def trim(strip, size):
    """Crop every frame by the same whole number of empty pixels on all four sides, so quarter turns about the
    centre still cover the art and each walker is a smaller blit."""
    alpha = strip[..., 3].reshape(size, FRAMES, size).max(axis=1) > 0
    ys, xs = np.nonzero(alpha)
    cut = int(min(xs.min(), ys.min(), size - 1 - xs.max(), size - 1 - ys.max()))
    tile = size - 2 * cut
    frames = [strip[cut:cut + tile, f * size + cut:f * size + cut + tile] for f in range(FRAMES)]
    return np.concatenate(frames, axis=1), cut


def hexrgb(value):
    return [int(value[i:i + 2], 16) for i in (1, 3, 5)]


def put(cell, x, y, colour, alpha=255):
    if 0 <= x < MOTE and 0 <= y < MOTE and alpha > 0:
        cell[y, x] = colour + [alpha]


def disc(cell, radius, colour, alpha, cx=7.5, cy=7.5):
    for y in range(MOTE):
        for x in range(MOTE):
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius:
                put(cell, x, y, colour, alpha)


def chunk(cell, shape, colour, outline, alpha, ox=6, oy=6):
    """A tiny hand-placed blob: shape is rows of '#' (fill) and '.' (gap); a dark outline is traced around it."""
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch != '#':
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if not (0 <= yy < len(shape) and 0 <= xx < len(shape[yy]) and shape[yy][xx] == '#'):
                    if not cell[oy + yy, ox + xx, 3]:
                        put(cell, ox + xx, oy + yy, outline, alpha)
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == '#':
                put(cell, ox + x, oy + y, colour, alpha)


def motes():
    """Eight frames per kind, left to right over the mote's life, with its size and fade baked in."""
    sheet = np.zeros((MOTE * len(MOTE_KINDS), MOTE * 8, 4), np.uint8)
    crumbs = [['##', '###', '.#'], ['.##', '###'], ['##', '##', '#.'], ['###', '.##']]
    clods = [['.##', '###', '##.'], ['##.', '###', '.##'], ['###', '###'], ['.##.', '####', '.##.']]
    star = {1: [(0, 0)], 2: [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]}
    for k, kind in enumerate(MOTE_KINDS):
        for f in range(8):
            cell = np.zeros((MOTE, MOTE, 4), np.uint8)
            t = f / 7
            fade = 1 - t
            if kind == 'dust':
                disc(cell, 2 + 4.5 * t, hexrgb('#9c7a52'), int(190 * fade ** 1.2))
                disc(cell, 1 + 2.5 * t, hexrgb('#c4a274'), int(170 * fade ** 1.2))
            elif kind == 'crumb':
                chunk(cell, crumbs[f % 4], hexrgb('#ead198'), hexrgb('#5a3f1e'), 255 if f < 6 else int(255 * (8 - f) / 3))
            elif kind == 'fleck':
                for x, y in ((7, 7), (8, 7), (7, 8), (8, 8)) if f < 4 else ((7, 7), (8, 8)):
                    put(cell, x, y, hexrgb('#e2d2b4'), int(255 * min(1, fade * 1.6)))
            elif kind == 'ember':
                disc(cell, 3.4 - 1.6 * t, hexrgb('#e0703a'), int(140 * fade))
                disc(cell, 2 - 0.9 * t, hexrgb('#ffe2a8'), int(255 * min(1, fade * 1.5)))
            elif kind == 'spore':
                disc(cell, 2.4 + t, hexrgb('#8cffe0'), int(90 * fade))
                put(cell, 7, 7, hexrgb('#d8fff4'), int(200 * fade))
                put(cell, 8, 8, hexrgb('#d8fff4'), int(140 * fade))
            elif kind == 'glint':
                reach = [1, 2, 3, 4, 4, 3, 2, 1][f]
                colour = hexrgb('#fff1c8')
                for d in range(-reach, reach + 1):
                    put(cell, 7 + d, 7, colour)
                    put(cell, 7, 7 + d, colour)
                if reach > 2:
                    for dx, dy in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
                        put(cell, 7 + dx, 7 + dy, hexrgb('#ffd870'))
            elif kind == 'clod':
                chunk(cell, clods[f % 4], hexrgb('#6e5236'), hexrgb('#2e2016'), 255 if f < 6 else int(255 * (8 - f) / 3))
            elif kind == 'firefly':
                glow = [0, 0.35, 0.75, 1, 1, 0.75, 0.35, 0.1][f]
                disc(cell, 3.2, hexrgb('#c8d070'), int(70 * glow))
                disc(cell, 1.5, hexrgb('#e8f09a'), int(255 * glow))
                if glow >= 0.75:
                    put(cell, 7, 7, hexrgb('#fbffe0'))
            elif kind == 'speck':
                # Ambient nest dust: a faint bone grain with a soil fleck that tumbles round it, fading in and out.
                light = [0.4, 0.8, 1, 1, 0.9, 0.7, 0.45, 0.2][f]
                put(cell, 7, 7, hexrgb('#e2d3b0'), int(220 * light))
                put(cell, *((8, 7), (8, 8), (7, 8), (6, 7))[f % 4], hexrgb('#a68460'), int(200 * light))
            sheet[k * MOTE:(k + 1) * MOTE, f * MOTE:(f + 1) * MOTE] = cell
    return sheet


def shelves(items, width):
    """First-fit shelves, tallest first: each item joins the first shelf with room, or opens a new one."""
    rows, places = [], {}
    for name, image in sorted(items, key=lambda item: (-item[1].shape[0], -item[1].shape[1], item[0])):
        h, w = image.shape[:2]
        for row in rows:
            if row['x'] + w <= width and h <= row['h']:
                break
        else:
            row = {'x': 0, 'y': sum(r['h'] for r in rows), 'h': h}
            rows.append(row)
        places[name] = (row['x'], row['y'])
        row['x'] += w
    return sum(r['h'] for r in rows), places


def skyline(items, width):
    """Skyline bottom-left bin packer, widest/tallest first, minimizing wasted horizontal shelf slack."""
    heights = np.zeros(width, dtype=np.int32)
    places = {}
    for name, image in sorted(items, key=lambda item: (-item[1].shape[1], -item[1].shape[0], item[0])):
        h, w = image.shape[:2]
        best_x = 0
        best_y = 10**9
        for x in range(0, width - w + 1):
            y = int(heights[x:x + w].max())
            if y < best_y:
                best_y = y
                best_x = x
        places[name] = (best_x, best_y)
        heights[best_x:best_x + w] = best_y + h
    return int(heights.max()), places


def pack(items):
    """The sheet width that wastes the fewest decoded bytes; returns the sheet and each item's corner."""
    width = min(range(256, 1025, 8), key=lambda w: skyline(items, w)[0] * w)
    height, places = skyline(items, width)
    sheet = np.zeros((height, width, 4), np.uint8)
    for name, image in items:
        px, py = places[name]
        sheet[py:py + image.shape[0], px:px + image.shape[1]] = image
    return sheet, places


def main():
    QA.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ART / 'manifest.json').read_text())
    items, strips, acting, props, raw = [], {}, {}, {}, {}
    for a in manifest['animation']:
        image = rgba(ART / a['path'])
        if image.shape != (a['size'], a['size'] * FRAMES, 4) or set(np.unique(image[..., 3])) - {0, 255}:
            raise ValueError('%s is not a %d px four-frame strip with hard alpha' % (a['name'], a['size']))
        raw[a['speciesId']] = image
        trimmed, cut = trim(image, a['size'])
        items.append((a['speciesId'], trimmed))
        strips[a['speciesId']] = {'size': a['size'] - 2 * cut, 'native': a['size'], 'mode': a['mode']}
    by_name = {a['name']: a['speciesId'] for a in manifest['animation']}
    for species, name in MINIS.items():
        source = raw[by_name[name]]
        size = source.shape[0]
        mini, cut = trim(np.concatenate([reduce_half(source[:, f * size:(f + 1) * size]) for f in range(FRAMES)], axis=1), size // 2)
        items.append(('mini-' + species, mini))
        strips['mini-' + species] = {'size': size // 2 - 2 * cut, 'native': size // 2, 'mode': 'walk'}
    for act_name, species_id, act_size in ACTING:
        act_path = ART / 'acting' / (act_name + '.png')
        if act_path.exists():
            image = rgba(act_path)
            if image.shape != (act_size, act_size * FRAMES, 4) or set(np.unique(image[..., 3])) - {0, 255}:
                raise ValueError('%s is not a %d px four-frame strip with hard alpha' % (act_name, act_size))
            trimmed, cut = trim(image, act_size)
            items.append(('act:' + act_name, trimmed))
            acting[act_name] = {'speciesId': species_id, 'size': act_size - 2 * cut, 'native': act_size, 'mode': 'act'}
    for p in manifest['props']:
        if p['name'] in PROPS:
            image = rgba(ART / p['path'])
            items.append(('prop:' + p['name'], image))
            ys, xs = np.nonzero(image[..., 3])
            props[p['name']] = {'size': p['size'], 'box': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]}
    items.append(('motes', motes()))
    sheet, places = pack(items)
    for name, (x, y) in places.items():
        if name.startswith('prop:'):
            props[name[5:]].update({'x': x, 'y': y})
        elif name.startswith('act:'):
            acting[name[4:]].update({'x': x, 'y': y})
        elif name != 'motes':
            strips[name].update({'x': x, 'y': y})
    tints = {}
    for alias, t in manifest['tintAliases'].items():
        base = by_name[t['base']]
        # Council mind has its own drawing for pantheon5, so it needs no recolour.
        if base != alias:
            tints[alias] = {'base': base, 'body': t['body']}
    png = io.BytesIO()
    Image.fromarray(sheet, 'RGBA').save(png, 'PNG', optimize=True)
    data = {
        'frameMs': manifest['frameDurationMs'], 'frames': FRAMES, 'width': sheet.shape[1], 'height': sheet.shape[0],
        'strips': strips, 'acting': acting, 'tints': tints, 'props': props,
        'motes': {'x': places['motes'][0], 'y': places['motes'][1], 'cell': MOTE, 'kinds': MOTE_KINDS},
        'image': 'data:image/png;base64,' + base64.b64encode(png.getvalue()).decode()
    }
    (PROJECT / 'app/creature-sprites.js').write_text(
        '/* Generated by scripts/build/build-creatures.py from the pixel art in art/creatures. Do not edit. */\n'
        'window.RoachCreatures = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    review = Image.new('RGBA', (sheet.shape[1], sheet.shape[0]), (84, 86, 92, 255))
    review.alpha_composite(Image.fromarray(sheet, 'RGBA'))
    review.resize((sheet.shape[1] * 3, sheet.shape[0] * 3), Image.NEAREST).save(QA / 'sheet-x3.png')
    print('app/creature-sprites.js: %d strips, %d props, sheet %dx%d (%d decoded bytes), PNG %d bytes' % (
        len(strips), len(props), sheet.shape[1], sheet.shape[0], sheet.size, len(png.getvalue())))


if __name__ == '__main__':
    main()
