#!/usr/bin/env python3
"""Pack the project's pixel art sheets into the critter atlas used for static icons.

Every sheet in art/sheets/ (a transparent PNG or WebP) sits beside a JSON file of the same name that gives each icon
a slug and which way it faces, plus the game ids it stands for: units (with optional body tints), resources,
upgrades (regular expressions matched against the engine's upgrade ids) and meta icons. A sheet whose JSON names a
"cell" is a native pixel grid: each icon is the cell at "at": [column, row], copied without resampling. Any other
sheet is painted art: each icon is cut out of its "box" by alpha, reduced to true pixels and centred on a cell.
Icons are packed facing right. "visitors": false keeps a sheet's icons out of the visitor pool. A JSON file with a
"dir" and no image beside it names single native 64 px PNGs in that directory (relative to art/sheets/), one per
slug, each read from its "file" or else <slug>.png; the chance-event sprites in art/events/ come in this way.

Writes app/critters.js with the atlas inlined as a data URL, because a file:// image would taint the canvases the
phone controller exports, and work/critters.png with the same atlas for review.

A new sheet without a JSON file gets a draft one with numbered slugs and a labelled contact sheet in work/critters/;
rename the slugs, set each view, and run the script again.
"""
import base64
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

PROJECT = Path(__file__).resolve().parents[2]
SHEETS = PROJECT / 'art/sheets'
UPGRADES = PROJECT / 'app/swarm/data.generated.json'
# The art is drawn on a native 64 px grid, so cells keep it at 1:1.
CELL = 64
# One clear pixel around each icon, so neighbours never bleed into each other when drawn.
FIT = CELL - 2
COLUMNS = 16
SOLID = 128
# Pieces smaller than this (detached antenna and leg tips) join the nearest icon within REACH pixels.
FRAGMENT = 300
REACH = 8
LARGEST_BLOCK = 8
# Share of colour edges that must fall on a block grid before the sheet counts as upscaled by that block.
GRID = 0.7
SATURATION = 1.0
COLOURS = 255
MAPS = ('units', 'tints', 'resources', 'upgrades', 'meta')


def segment(alpha):
    solid = alpha >= SOLID
    labels, count = ndi.label(solid, structure=np.ones((3, 3)))
    sizes = ndi.sum(solid, labels, range(1, count + 1))
    big = np.flatnonzero(sizes >= FRAGMENT) + 1
    owned = np.isin(labels, big)
    distance, (iy, ix) = ndi.distance_transform_edt(~owned, return_indices=True)
    nearest = labels[iy, ix]
    joined = np.where(owned, labels, np.where(solid & (distance <= REACH), nearest, 0))
    parts = []
    for k in big:
        ys, xs = np.nonzero(joined == k)
        parts.append({'box': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1], 'label': int(k)})
    # Reading order: rows by centre height, then left to right.
    parts.sort(key=lambda p: (p['box'][1] + p['box'][3]) / 2)
    rows = []
    for part in parts:
        middle = (part['box'][1] + part['box'][3]) / 2
        if rows and abs(middle - rows[-1][0]) < 45:
            rows[-1][1].append(part)
        else:
            rows.append((middle, [part]))
    return joined, [p for _, row in rows for p in sorted(row, key=lambda p: p['box'][0])]


def block_size(rgb, solid):
    # Upscaled pixel art changes colour only on its block grid; find the largest grid that holds most of the edges.
    pre = rgb * solid[..., None]
    dx = np.abs(np.diff(pre, axis=1)).sum((0, 2))
    dy = np.abs(np.diff(pre, axis=0)).sum((1, 2))
    for k in range(LARGEST_BLOCK, 1, -1):
        offsets = []
        for d in (dx, dy):
            if len(d) < 4 * k or not d.sum():
                break
            share, offset = max((d[o::k].sum() / d.sum(), o) for o in range(k))
            if share < GRID:
                break
            offsets.append((offset + 1) % k)
        else:
            return k, offsets
    return 1, (0, 0)


def unblock(rgb, solid, k, offsets):
    # Each block becomes the commonest colour among its solid pixels, so outlines stay their true colour.
    ox, oy = offsets
    h, w = (solid.shape[0] - oy) // k, (solid.shape[1] - ox) // k
    out = np.zeros((h, w, 3), np.float32)
    keep = np.zeros((h, w), bool)
    for y in range(h):
        for x in range(w):
            area = solid[oy + y * k:oy + (y + 1) * k, ox + x * k:ox + (x + 1) * k]
            if area.sum() * 2 < k * k:
                continue
            colours = rgb[oy + y * k:oy + (y + 1) * k, ox + x * k:ox + (x + 1) * k][area].round().astype(int)
            values, counts = np.unique(colours, axis=0, return_counts=True)
            out[y, x], keep[y, x] = values[counts.argmax()], True
    return out, keep


def shrink(rgb, solid, scale):
    # Painted sheets have no pixel grid; area-average premultiplied colour, then cut alpha hard so no fringe survives.
    h, w = solid.shape
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    rgba = np.dstack([rgb * solid[..., None], solid * 255.0]).clip(0, 255).astype(np.uint8)
    small = np.asarray(Image.fromarray(rgba, 'RGBA').resize(size, Image.BOX)).astype(np.float32)
    a = small[..., 3] / 255
    return small[..., :3] / np.maximum(a, 1e-4)[..., None], a >= 0.5


def saturate(rgb):
    luma = (rgb * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
    return luma + SATURATION * (rgb - luma)


def icon(sheet, joined, parts, name, entry):
    x0, y0, x1, y1 = entry['box']
    # The icon is every segmented part that lies mostly inside its box, which keeps neighbours that overlap it out.
    window = joined[y0:y1, x0:x1]
    solid = np.zeros(window.shape, bool)
    for part in parts:
        inside = (window == part['label']).sum()
        total = (joined == part['label']).sum()
        if inside * 2 > total:
            solid |= window == part['label']
    if not solid.any():
        raise ValueError('%s: no icon inside box %s' % (name, entry['box']))
    ys, xs = np.nonzero(solid)
    rgb = sheet[y0:y1, x0:x1, :3][ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    solid = solid[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    k, offsets = block_size(rgb, solid)
    if k > 1:
        rgb, solid = unblock(rgb, solid, k, offsets)
    if max(solid.shape) > FIT:
        rgb, solid = shrink(rgb, solid, FIT / max(solid.shape))
    if entry['view'] == 'left':
        rgb, solid = rgb[:, ::-1], solid[:, ::-1]
    h, w = solid.shape
    cell = np.zeros((CELL, CELL, 4), np.float32)
    # Walkers stand on the cell floor; insects seen from above sit in the middle.
    top = (CELL - h) // 2 if entry['view'] == 'top' else CELL - 1 - h
    left = (CELL - w) // 2
    cell[top:top + h, left:left + w, :3] = saturate(rgb) * solid[..., None]
    cell[top:top + h, left:left + w, 3] = solid * 255
    return cell, k


def grid_icon(sheet, size, name, entry):
    if size != CELL:
        raise ValueError('%s: cell %d does not match the %d px atlas cell; native art is never resampled' % (name, size, CELL))
    column, row = entry['at']
    cell = sheet[row * size:(row + 1) * size, column * size:(column + 1) * size].copy()
    if cell.shape[:2] != (size, size) or not (cell[..., 3] >= SOLID).any():
        raise ValueError('%s: no icon in cell %s' % (name, entry['at']))
    solid = cell[..., 3] >= SOLID
    cell[..., :3] *= solid[..., None]
    cell[..., 3] = solid * 255
    return cell[:, ::-1] if entry['view'] == 'left' else cell


def draft(path, sheet):
    joined, parts = segment(sheet[..., 3])
    stem = path.stem.replace('-', '_')
    icons = {'%s_%03d' % (stem, i): {'box': p['box'], 'view': 'right'} for i, p in enumerate(parts)}
    lines = ',\n'.join('    %s: %s' % (json.dumps(k), json.dumps(v)) for k, v in icons.items())
    path.with_suffix('.json').write_text('{\n  "units": {},\n  "icons": {\n' + lines + '\n  }\n}\n')
    out = PROJECT / 'work/critters'
    out.mkdir(parents=True, exist_ok=True)
    labelled = Image.new('RGBA', (sheet.shape[1], sheet.shape[0]), (110, 112, 120, 255))
    labelled.alpha_composite(Image.fromarray(sheet.clip(0, 255).astype(np.uint8), 'RGBA'))
    pen = ImageDraw.Draw(labelled)
    for name, entry in icons.items():
        pen.rectangle(entry['box'], outline=(255, 0, 255))
        pen.text((entry['box'][0] + 2, entry['box'][1] + 1), name[-3:], fill=(255, 255, 0))
    labelled.save(out / (path.stem + '-labels.png'))
    print('drafted', path.with_suffix('.json').relative_to(PROJECT), 'with', len(icons), 'icons; name them and run again')


def atlas_png(atlas):
    # Hard-edged icons with at most 255 colours fit a palette PNG with index 0 transparent and lose nothing; more
    # colours than that stay true colour rather than being quantised.
    solid = atlas[..., 3] > 0
    if len(np.unique(atlas[solid][:, :3], axis=0)) > COLOURS:
        png = io.BytesIO()
        Image.fromarray(atlas.clip(0, 255).astype(np.uint8), 'RGBA').save(png, 'PNG', optimize=True)
        return png.getvalue()
    pixels = Image.fromarray(atlas[solid][None, :, :3].clip(0, 255).astype(np.uint8), 'RGB')
    palette = pixels.quantize(COLOURS, Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    rgb = Image.fromarray(atlas[..., :3].clip(0, 255).astype(np.uint8), 'RGB')
    index = np.asarray(rgb.quantize(palette=palette, dither=Image.Dither.NONE)).astype(np.uint8) + 1
    index[~solid] = 0
    out = Image.fromarray(index, 'P')
    colours = palette.getpalette()[:3 * COLOURS]
    out.putpalette([0, 0, 0] + colours + [0, 0, 0] * (255 - COLOURS))
    png = io.BytesIO()
    out.save(png, 'PNG', optimize=True, transparency=0)
    return png.getvalue()


def main():
    sources = sorted(p for p in SHEETS.iterdir() if p.suffix.lower() in ('.png', '.webp'))
    upgrade_ids = sorted(set(u['name'] for u in json.loads(UPGRADES.read_text())['upgrades']['elements']))
    cells, visitors, blocks = {}, [], {}
    maps = {key: {} for key in MAPS}
    folders = sorted(p for p in SHEETS.glob('*.json') if 'dir' in json.loads(p.read_text()))
    for path in sources + folders:
        if path in folders:
            spec, sheet = json.loads(path.read_text()), None
        else:
            sheet = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
            if not path.with_suffix('.json').exists():
                draft(path, sheet)
                continue
            spec = json.loads(path.with_suffix('.json').read_text())
        if 'cell' not in spec and 'dir' not in spec:
            joined, parts = segment(sheet[..., 3])
        for name, entry in spec['icons'].items():
            if name in cells:
                raise ValueError('%s: slug %s is already used by another sheet' % (path.name, name))
            if 'dir' in spec:
                single = np.asarray(Image.open(SHEETS / spec['dir'] / entry.get('file', name + '.png')).convert('RGBA')).astype(np.float32)
                cells[name], k = grid_icon(single, single.shape[1], name, {'at': [0, 0], 'view': entry.get('view', 'right')}), 0
            elif 'cell' in spec:
                cells[name], k = grid_icon(sheet, spec['cell'], name, entry), 0
            else:
                cells[name], k = icon(sheet, joined, parts, name, entry)
            blocks[k] = blocks.get(k, 0) + 1
        for key in MAPS:
            for game_id, value in spec.get(key, {}).items():
                if key == 'tints':
                    if not re.match(r'^#[0-9a-f]{6}$', value) or game_id not in maps['units']:
                        raise ValueError('%s: tint for %s must be #rrggbb on a mapped unit' % (path.name, game_id))
                    maps[key][game_id] = value
                    continue
                if key != 'upgrades':
                    maps[key][game_id] = value
                    continue
                # Upgrade keys are patterns over the engine's ids, expanded here so the game looks ids up directly.
                matched = [u for u in upgrade_ids if re.search(game_id, u)]
                if not matched:
                    raise ValueError('%s: upgrade pattern %s matches no upgrade id' % (path.name, game_id))
                for upgrade in matched:
                    maps[key].setdefault(upgrade, value)
        if spec.get('visitors', True):
            used = set(spec.get('units', {}).values())
            visitors += [n for n, e in spec['icons'].items() if n not in used and e.get('visitor', True)]
    # A map may name a slug from another sheet, so slugs are checked once every sheet is in.
    for key in MAPS[:1] + MAPS[2:]:
        for game_id, name in maps[key].items():
            if name not in cells:
                raise ValueError('%s %s maps to unknown slug %s' % (key, game_id, name))
    names = list(cells)
    rows = (len(names) + COLUMNS - 1) // COLUMNS
    atlas = np.zeros((rows * CELL, COLUMNS * CELL, 4), np.float32)
    boxes = {}
    for i, name in enumerate(names):
        x, y = (i % COLUMNS) * CELL, (i // COLUMNS) * CELL
        atlas[y:y + CELL, x:x + CELL] = cells[name]
        boxes[name] = {'x': x, 'y': y, 'w': CELL, 'h': CELL}
    png = atlas_png(atlas)
    (PROJECT / 'work' / 'critters.png').write_bytes(png)
    compact = lambda value: json.dumps(value, separators=(', ', ': ')).replace('"', '')
    quoted = lambda value: json.dumps(value, separators=(', ', ': ')).replace('"', '\'')
    (PROJECT / 'app/critters.js').write_text(
        '/* Generated by scripts/build/build-critters.py from Phil\'s pixel art sheets in art/sheets. Every icon faces right. */\n'
        'window.RoachCritters = {\n  style: \'pixel\',\n  cell: ' + str(CELL) + ',\n' +
        ''.join('  %s: %s,\n' % (key, quoted(maps[key])) for key in MAPS) +
        '  visitors: ' + json.dumps(visitors, separators=(',', ':')).replace('"', '\'') + ',\n'
        '  icons: {\n' + ',\n'.join('    %s: %s' % (n, compact(c)) for n, c in boxes.items()) + '\n  },\n'
        '  image: \'data:image/png;base64,' + base64.b64encode(png).decode() + '\'\n};\n')
    unmatched = [u for u in upgrade_ids if u not in maps['upgrades']]
    print('%d icons (%d visitors, %d units, %d resources, %d upgrades, %d meta), pixel blocks %s, atlas %dx%d, '
          '%d decoded bytes, %d PNG bytes, %d data URL bytes' % (
              len(names), len(visitors), len(maps['units']), len(maps['resources']), len(maps['upgrades']), len(maps['meta']),
              blocks, atlas.shape[1], atlas.shape[0], atlas.shape[0] * atlas.shape[1] * 4, len(png), len(base64.b64encode(png)) + 22))
    if unmatched:
        print('upgrades without an icon:', ' '.join(unmatched))
    if len(sys.argv) > 1:
        Image.open(io.BytesIO(png)).convert('RGBA').resize((atlas.shape[1] * 2, atlas.shape[0] * 2), Image.NEAREST).save(sys.argv[1])


if __name__ == '__main__':
    main()
