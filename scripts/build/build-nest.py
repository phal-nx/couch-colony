#!/usr/bin/env python3
"""Pack the pixel-art nest into app/nest-sprites.js and trace the tunnels the colony walks inside it.

Reads art/nest/: six 300x230 stage bitmaps, nine compact overlays registered to stage 4 (manifest.json), and
layout.json, which is authored by hand: where each overlay sits on each stage, and hints for the tracer.

The tracer finds the dark interior of each stage, thins it to a one-pixel medial axis, finds chambers as the wide
parts of that interior (their largest inscribed circle), and routes a polyline along the axis from the entrance to
every chamber. The result is art/nest/paths.json, embedded in the app alongside the bitmaps.

Review images go to work/nest-qa/. When a trace is wrong, correct it in layout.json (bridges across ladders, extra
chambers, chambers to drop), never here, and run the script again.
"""
import base64
import heapq
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

PROJECT = Path(__file__).resolve().parents[2]
ART = PROJECT / 'art/nest'
QA = PROJECT / 'work/nest-qa'
# Interior pixels are darker than this (0.3 R + 0.59 G + 0.11 B); soil, stones and props are lighter.
DARK = 65
# Dark specks and outlines smaller than this are not rooms.
MIN_AREA = 30
# A chamber is a part of the interior at least this many pixels from every wall; narrower parts are tunnels.
CHAMBER = 6
# Polylines keep every bend that strays more than this from a straight run.
TOLERANCE = 1.2
CROSS = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)


def rgba(name):
    return np.asarray(Image.open(ART / name).convert('RGBA'))


def thin(mask):
    """Zhang-Suen thinning, vectorised over the whole image per sub-iteration."""
    img = np.pad(mask.astype(np.uint8), 1)
    while True:
        changed = False
        for step in (0, 1):
            p = img
            n = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
            core = p[1:-1, 1:-1]
            b = sum(n)
            a = sum((n[i] == 0) & (n[(i + 1) % 8] == 1) for i in range(8))
            if step == 0:
                c = (n[0] * n[2] * n[4] == 0) & (n[2] * n[4] * n[6] == 0)
            else:
                c = (n[0] * n[2] * n[6] == 0) & (n[0] * n[4] * n[6] == 0)
            remove = (core == 1) & (b >= 2) & (b <= 6) & (a == 1) & c
            if remove.any():
                changed = True
                img = img.copy()
                img[1:-1, 1:-1][remove] = 0
        if not changed:
            return img[1:-1, 1:-1].astype(bool)


def simplify(points, tolerance):
    """Ramer-Douglas-Peucker."""
    if len(points) < 3:
        return points
    a, b = np.array(points[0], float), np.array(points[-1], float)
    span = b - a
    length = np.hypot(*span) or 1.0
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = abs(span[0] * (points[i][1] - a[1]) - span[1] * (points[i][0] - a[0])) / length
        if d > worst:
            worst, index = d, i
    if worst <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def route(skeleton, clearance, start, goal):
    """Cheapest 8-connected walk along the skeleton; steps near walls cost more, so routes keep to the middle."""
    h, w = skeleton.shape
    best = {start: 0.0}
    back = {}
    queue = [(0.0, start)]
    while queue:
        cost, here = heapq.heappop(queue)
        if here == goal:
            break
        if cost > best[here]:
            continue
        y, x = here
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if (dy or dx) and 0 <= ny < h and 0 <= nx < w and skeleton[ny, nx]:
                    step = (1.4142 if dy and dx else 1.0) * (1 + 2.0 / max(clearance[ny, nx], 1))
                    if cost + step < best.get((ny, nx), 1e18):
                        best[(ny, nx)] = cost + step
                        back[(ny, nx)] = here
                        heapq.heappush(queue, (cost + step, (ny, nx)))
    if goal not in back and goal != start:
        return None
    path = [goal]
    while path[-1] != start:
        path.append(back[path[-1]])
    return [[int(x), int(y)] for y, x in reversed(path)]


def nearest(mask, x, y):
    ys, xs = np.nonzero(mask)
    i = int(np.argmin((xs - x) ** 2 + (ys - y) ** 2))
    return int(ys[i]), int(xs[i])


def walkable(image, hints):
    alpha = image[..., 3] > 0
    lum = image[..., 0] * 0.3 + image[..., 1] * 0.59 + image[..., 2] * 0.11
    dark = alpha & (lum < hints.get('dark', DARK))
    # Opening drops the one-pixel outlines and soil speckle; small light flecks on chamber floors are filled back.
    room = ndi.binary_opening(dark, CROSS)
    holes = ndi.binary_fill_holes(room) & ~room
    labels, count = ndi.label(holes)
    sizes = ndi.sum(holes, labels, range(1, count + 1))
    room |= np.isin(labels, np.flatnonzero(sizes < 40) + 1)
    labels, count = ndi.label(room)
    sizes = ndi.sum(room, labels, range(1, count + 1))
    room = np.isin(labels, np.flatnonzero(sizes >= MIN_AREA) + 1)
    # Ladders, ramps and props the colony climbs over are bridged by hand as thick strokes.
    canvas = Image.fromarray(room.astype(np.uint8) * 255)
    draw = ImageDraw.Draw(canvas)
    for bridge in hints.get('bridges', []):
        draw.line([tuple(p) for p in bridge['points']], fill=255, width=bridge.get('width', 5))
    return (np.asarray(canvas) > 0) & alpha


def trace(stage, image, hints, entrance):
    room = walkable(image, hints)
    ey, ex = nearest(room, *entrance)
    labels, _ = ndi.label(room, structure=np.ones((3, 3)))
    connected = labels == labels[ey, ex]
    stray = room & ~connected
    clearance = ndi.distance_transform_edt(connected)
    skeleton = thin(connected)
    ey, ex = nearest(skeleton, ex, ey)
    # Chambers: each wide core of the interior, centred on its largest inscribed circle.
    core = clearance >= hints.get('chamber', CHAMBER)
    for extra in hints.get('chambers', []):
        core[extra[1], extra[0]] = True
    labels, count = ndi.label(core)
    chambers = []
    for k in range(1, count + 1):
        part = np.where(labels == k, clearance, 0)
        cy, cx = np.unravel_index(int(np.argmax(part)), part.shape)
        chambers.append({'x': int(cx), 'y': int(cy), 'r': int(clearance[cy, cx]), 'core': k})
    # The entrance hole is wide enough to look like a room; anything the hand-written hints name is dropped too.
    drop = hints.get('drop', []) + [[int(ex), int(ey)]]
    chambers = [c for c in chambers if not any(np.hypot(c['x'] - d[0], c['y'] - d[1]) <= 10 for d in drop)]
    chambers.sort(key=lambda c: (c['x'], c['y']))
    # Every pixel belongs to the chamber whose wide core is nearest, so an overlay anywhere in a long room finds it.
    _, (iy, ix) = ndi.distance_transform_edt(labels == 0, return_indices=True)
    owner = {c['core']: i for i, c in enumerate(chambers)}
    region = np.vectorize(lambda k: owner.get(k, -1))(labels[iy, ix])
    for c in chambers:
        del c['core']
    tunnels = []
    for c in chambers:
        goal = nearest(skeleton, c['x'], c['y'])
        walk = route(skeleton, clearance, (ey, ex), goal)
        if walk is None:
            raise ValueError('stage %d: chamber at %d,%d is not reachable from the entrance' % (stage, c['x'], c['y']))
        walk.append([c['x'], c['y']])
        tunnels.append(simplify(walk, TOLERANCE))
    return {'entrance': [int(ex), int(ey)], 'chambers': chambers, 'tunnels': tunnels}, region, connected, skeleton, stray


def overlay_box(spec, name, offset):
    o = spec[name]
    return o['x'] + offset[0], o['y'] + offset[1], o['width'], o['height']


def tag(paths, region, inside, placed, spec):
    """A chamber holds the overlay that stands in its part of the interior; overlays outside the nest hold none."""
    near = ndi.binary_dilation(inside, iterations=3)
    for c in paths['chambers']:
        c['kind'] = 'plain'
    for kind, name, offset in placed:
        x, y, w, h = overlay_box(spec, name, offset)
        fx, fy = x + w // 2, min(229, y + h - 3)
        i = region[fy, fx]
        if near[fy, fx] and i >= 0 and paths['chambers'][i]['kind'] == 'plain':
            paths['chambers'][i]['kind'] = kind


def placements(anchors):
    """Overlays that can appear on a stage, each with its offset from the stage-4 registration."""
    out = []
    for kind, group in (('egg', 'eggs'), ('crumb', 'crumbs')):
        if anchors.get(group):
            out.append((kind, group + '-large', anchors[group]))
    for offset in anchors.get('nexus', [])[:1]:
        out.append(('nexus', 'nexus', offset))
    return out


def review(stage, image, paths, connected, skeleton, stray, spec, anchors):
    scale = 3
    base = Image.new('RGBA', image.shape[1::-1], (255, 255, 255, 255))
    base.alpha_composite(Image.fromarray(image))
    for group in ('eggs', 'crumbs'):
        if anchors.get(group):
            x, y, w, h = overlay_box(spec, group + '-large', anchors[group])
            base.alpha_composite(Image.open(ART / spec[group + '-large']['path']).convert('RGBA'), (x, y))
    for name, offsets in (('nexus', anchors.get('nexus', [])), ('pennant', anchors.get('pennant', []))):
        for offset in offsets:
            x, y, w, h = overlay_box(spec, name, offset)
            base.alpha_composite(Image.open(ART / spec[name]['path']).convert('RGBA'), (x, y))
    if anchors.get('annex'):
        x, y, w, h = overlay_box(spec, 'side-tunnel-annex', anchors['annex'])
        base.alpha_composite(Image.open(ART / spec['side-tunnel-annex']['path']).convert('RGBA'), (x, y))
    base.resize((base.width * scale, base.height * scale), Image.NEAREST).save(QA / ('stage-%d-dressed.png' % stage))
    tint = np.zeros(image.shape, np.uint8)
    tint[connected] = (60, 160, 255, 70)
    tint[stray] = (255, 60, 60, 110)
    tint[skeleton] = (255, 255, 255, 120)
    base.alpha_composite(Image.fromarray(tint))
    big = base.resize((base.width * scale, base.height * scale), Image.NEAREST)
    draw = ImageDraw.Draw(big)
    colours = {'egg': (255, 240, 200), 'crumb': (255, 170, 40), 'nexus': (255, 80, 200), 'plain': (120, 255, 120)}
    for walk in paths['tunnels']:
        draw.line([(x * scale + 1, y * scale + 1) for x, y in walk], fill=(0, 255, 255), width=2)
        for x, y in walk:
            draw.rectangle([x * scale - 1, y * scale - 1, x * scale + 3, y * scale + 3], fill=(0, 255, 255))
    for i, c in enumerate(paths['chambers']):
        x, y, r = c['x'] * scale + 1, c['y'] * scale + 1, c['r'] * scale
        draw.ellipse([x - r, y - r, x + r, y + r], outline=colours[c['kind']], width=2)
        draw.text((x - 3, y - 6), '%d %s' % (i, c['kind'][0]), fill=colours[c['kind']])
    x, y = paths['entrance']
    draw.rectangle([x * scale - 4, y * scale - 4, x * scale + 5, y * scale + 5], outline=(255, 0, 0), width=2)
    big.save(QA / ('stage-%d-paths.png' % stage))


def palette_png(image):
    """Every stage has at most 255 opaque colours and hard alpha, so an indexed PNG is lossless."""
    solid = image[..., 3] > 0
    colours, index = np.unique(image[..., :3][solid], axis=0, return_inverse=True)
    if len(colours) > 255:
        raise ValueError('%d colours do not fit a palette' % len(colours))
    out = np.zeros(solid.shape, np.uint8)
    out[solid] = index.ravel() + 1
    img = Image.fromarray(out, 'P')
    img.putpalette([0, 0, 0] + colours.ravel().tolist())
    png = io.BytesIO()
    img.save(png, 'PNG', optimize=True, transparency=0)
    return png.getvalue()


def main():
    QA.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ART / 'manifest.json').read_text())
    layout = json.loads((ART / 'layout.json').read_text())
    spec = {o['name']: o for o in manifest['overlays']}
    stages, paths = [], []
    for entry, anchors in zip(manifest['stages'], layout['stages']):
        image = rgba(entry['path']).copy()
        # The art had a few loose specks beside stage 5; only the nest itself ships.
        labels, _ = ndi.label(image[..., 3] > 0, structure=np.ones((3, 3)))
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        image[labels != np.argmax(sizes)] = 0
        traced, region, connected, skeleton, stray = trace(entry['stage'], image, anchors.get('trace', {}), anchors['entrance'])
        tag(traced, region, connected, placements(anchors), spec)
        review(entry['stage'], image, traced, connected, skeleton, stray, spec, anchors)
        paths.append(traced)
        stages.append(palette_png(image))
        print('stage %d: %d chambers %s, %d tunnels, %d stray interior px, %d PNG bytes' % (
            entry['stage'], len(traced['chambers']), ''.join(c['kind'][0] for c in traced['chambers']),
            len(traced['tunnels']), int(stray.sum()), len(stages[-1])))
    (ART / 'paths.json').write_text('{"stages": [\n' + ',\n'.join(json.dumps(p, separators=(',', ':')) for p in paths) + '\n]}\n')
    url = lambda data: 'data:image/png;base64,' + base64.b64encode(data).decode()
    overlays = {}
    for o in manifest['overlays']:
        image = rgba(o['path'])
        overlays[o['name']] = {'x': o['x'], 'y': o['y'], 'w': image.shape[1], 'h': image.shape[0], 'image': url(palette_png(image))}
    pennant = rgba(spec['pennant']['path'])
    # The pennant's cloth is everything right of its pole; it is recoloured per unit at runtime.
    red = (pennant[..., 0].astype(int) - pennant[..., 2] > 60) & (pennant[..., 3] > 0)
    overlays['pennant']['cloth'] = int(np.nonzero(red.any(axis=0))[0].min())
    data = {
        'width': manifest['canvas'][0], 'height': manifest['canvas'][1],
        'stages': [url(png) for png in stages], 'overlays': overlays,
        'anchors': [{k: v for k, v in s.items() if k != 'trace'} for s in layout['stages']], 'paths': paths
    }
    body = json.dumps(data, separators=(',', ':'))
    (PROJECT / 'app/nest-sprites.js').write_text(
        '/* Generated by scripts/build/build-nest.py from the pixel-art nest in art/nest. Do not edit. */\n'
        'window.RoachNestSprites = ' + body + ';\n')
    print('app/nest-sprites.js: %d bytes; stage PNGs %d bytes' % (len(body), sum(len(s) for s in stages)))


if __name__ == '__main__':
    main()
