#!/usr/bin/env python3
"""Draw the phone controller's home-screen icons from the hissing roach in art/sheets/.

The roach is cropped to its pixels, set on a small native grid over a slightly lighter burrow disc (so its dark legs
read against the ground), and scaled up by a whole number with nearest-neighbour so every pixel stays square.
Writes phone-controller/public/icons/ (180 px apple-touch-icon, 192 and 512 px manifest icons) and a review copy in work/.
"""
from pathlib import Path

from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[2]
SHEET = PROJECT / 'art/sheets/creatures-native-64.png'
ROACH = (3, 0)
CELL = 64
OUT = PROJECT / 'phone-controller/public/icons'
GROUND = (0x12, 0x10, 0x0c, 255)
DISC = (0x24, 0x1e, 0x16, 255)
# The roach spans at most this share of the icon, which leaves iOS's rounded corners clear.
FILL = 0.8
SIZES = {'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512}


def icon(roach, size):
    scale = int(size * FILL // roach.width)
    grid = -(-size // scale)
    canvas = Image.new('RGBA', (grid, grid), GROUND)
    radius = grid * 0.42
    centre = (grid - 1) / 2
    ImageDraw.Draw(canvas).ellipse((centre - radius, centre - radius, centre + radius, centre + radius), fill=DISC)
    canvas.alpha_composite(roach, ((grid - roach.width) // 2, (grid - roach.height) // 2))
    big = canvas.resize((grid * scale, grid * scale), Image.NEAREST)
    offset = (grid * scale - size) // 2
    return big.crop((offset, offset, offset + size, offset + size)).convert('RGB')


def main():
    sheet = Image.open(SHEET).convert('RGBA')
    column, row = ROACH
    cell = sheet.crop((column * CELL, row * CELL, (column + 1) * CELL, (row + 1) * CELL))
    roach = cell.crop(cell.getchannel('A').getbbox())
    OUT.mkdir(parents=True, exist_ok=True)
    review = PROJECT / 'work/phone-icons'
    review.mkdir(parents=True, exist_ok=True)
    for name, size in SIZES.items():
        image = icon(roach, size)
        image.save(OUT / name, optimize=True)
        image.save(review / name)
        print(f'{OUT.relative_to(PROJECT) / name}: {size}x{size}')


if __name__ == '__main__':
    main()
