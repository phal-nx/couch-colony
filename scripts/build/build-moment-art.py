#!/usr/bin/env python3
"""Fill the overlay's UI-moment art slots in app/ui-art/.

The slots are magnitude_badge.png (16x16), achievement_medal.png
(32x32) and popup_pin.png (16x16). Each is a native transparent PNG drawn by style.css at whole multiples of its size
with image-rendering: pixelated, so finished art is a plain file copy into app/ui-art/. This script does that copy
from art/incoming/ when a delivered file has the slot's size, and otherwise draws a placeholder
in the palette of art/sheets/ for any slot that is still empty (or every slot with --force). It never replaces
delivered art with a placeholder unless forced.
"""
import sys
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parents[2]
OUT = PROJECT / 'app/ui-art'
INCOMING = PROJECT / 'art/incoming'
SIZES = {'magnitude_badge': (16, 16), 'achievement_medal': (32, 32), 'popup_pin': (16, 16)}

# The near-black outline and amber ramp of the upgrade sheet, plus the spec's bone, rust, moss and slate.
PALETTE = {
    'o': (5, 2, 0), 'd': (73, 38, 17), 'b': (119, 61, 20), 'r': (170, 87, 7), 'a': (208, 123, 28),
    'y': (231, 159, 65), 'l': (243, 183, 96), 'h': (249, 201, 127), 'w': (238, 231, 215),
    'u': (146, 67, 3), 'R': (171, 82, 58), 'S': (122, 54, 38), 'g': (107, 122, 58), 'G': (143, 174, 107),
    's': (111, 117, 112), 'k': (168, 159, 140),
}

def disc(width, height, cx, cy, rings):
    """Rows of a hard-edged disc. rings is [(outer radius, colour key)] from the outside in."""
    rows = []
    for y in range(height):
        row = ''
        for x in range(width):
            d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            key = '.'
            for radius, colour in rings:
                if d <= radius:
                    key = colour
            row += key
        rows.append(row)
    return rows


def put(rows, points, key):
    for x, y in points:
        rows[y][x] = key


def badge():
    """A small ochre tag with one upward chevron: the count just reached a new order of magnitude."""
    rows = [list('.' * 16) for _ in range(16)]
    for y in range(1, 15):
        for x in range(1, 15):
            corner = (x in (1, 14)) and (y in (1, 14))
            if corner:
                continue
            edge = x in (1, 14) or y in (1, 14) or ((x in (2, 13)) and (y in (2, 13)))
            rows[y][x] = 'o' if edge else 'h' if y == 2 else 'a' if y == 13 else 'y'
    for step in range(5):
        put(rows, ((7 - step, 4 + step), (8 + step, 4 + step)), 'w')
        put(rows, ((7 - step, 5 + step), (8 + step, 5 + step)), 'r')
    put(rows, ((7, 5), (8, 5)), 'w')
    return [''.join(r) for r in rows]


def medal():
    """A rust and moss ribbon over an ochre disc with a bone glint: the achievement seal."""
    size = 32
    rows = [list(r) for r in disc(size, size, 16, 19.5, [(11.3, 'o'), (10.3, 'r'), (8.8, 'y'), (5.0, 'l')])]
    for y in range(1, 11):
        shift = y // 3
        for x in range(9 + shift, 15 + shift):
            rows[y][x] = 'o' if x in (9 + shift, 14 + shift) or y == 1 else 'S' if x == 13 + shift else 'R'
        for x in range(17 - shift, 23 - shift):
            rows[y][x] = 'o' if x in (17 - shift, 22 - shift) or y == 1 else 'g' if x == 21 - shift else 'G'
    put(rows, ((10, 15), (11, 14), (9, 16), (9, 17), (12, 14)), 'w')
    put(rows, ((21, 25), (22, 24), (23, 23), (20, 26)), 'a')
    return [''.join(r) for r in rows]


def pin():
    """A rust tack seen from above, with a bone glint and a darker rim."""
    rows = [list(r) for r in disc(16, 16, 8, 8, [(6.4, 'o'), (5.4, 'S'), (4.4, 'R')])]
    put(rows, ((5, 5), (6, 5), (5, 6)), 'w')
    put(rows, ((7, 5), (6, 6)), 'h')
    return [''.join(r) for r in rows]


SLOTS = {
    'magnitude_badge': badge(),
    'achievement_medal': medal(),
    'popup_pin': pin(),
}


def draw(rows):
    width = len(rows[0])
    assert all(len(r) == width for r in rows), rows
    image = Image.new('RGBA', (width, len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), PALETTE[key] + (255,))
    return image


def main():
    force = '--force' in sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    for slot, rows in SLOTS.items():
        path = OUT / (slot + '.png')
        delivered = INCOMING / (slot + '.png')
        if delivered.exists():
            with Image.open(delivered) as art:
                if art.size == SIZES[slot]:
                    art.convert('RGBA').save(path, optimize=True)
                    print('copied', delivered.relative_to(PROJECT), '->', path.relative_to(PROJECT))
                    continue
                print('skipped', delivered.relative_to(PROJECT), 'is %dx%d, expected %dx%d' % (art.size + SIZES[slot]))
        assert (len(rows[0]), len(rows)) == SIZES[slot], slot
        if path.exists() and not force:
            print('kept', path.relative_to(PROJECT))
            continue
        draw(rows).save(path, optimize=True)
        print('wrote', path.relative_to(PROJECT), '%dx%d' % (len(rows[0]), len(rows)))


if __name__ == '__main__':
    main()
