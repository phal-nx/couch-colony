#!/usr/bin/env python3
"""Build the menu chrome art in app/ui-art/.

app/ui-art/ holds one PNG per art slot, named and sized as in
docs/ui-spec.md. A plain run checks every slot's size and derives what CSS cannot draw from a single file:
built/ui_focus_9slice.png, the focus bracket mirrored into a 24x24 nine-slice. Dropping in final art is a
file copy into app/ui-art/ followed by a plain run.

--placeholders first redraws every slot as a placeholder: native pixel art on a transparent background,
hard 1 px outlines, no anti-aliasing, in the muted soil, bone and ochre of art/sheets/. It overwrites
final art, so use it only before that art arrives. 4x review copies go to work/ui-art/.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

PROJECT = Path(__file__).resolve().parents[2]
OUT = PROJECT / 'app/ui-art'
BUILT = OUT / 'built'
REVIEW = PROJECT / 'work/ui-art'

CLEAR = (0, 0, 0, 0)
INK = (0x14, 0x0c, 0x06, 255)
TINT = (0x17, 0x18, 0x11, 153)
SOIL_DARK = (0x3b, 0x27, 0x17, 225)
SOIL = (0x5c, 0x3d, 0x23, 225)
SOIL_LIGHT = (0x7d, 0x57, 0x31, 225)
GRAIN = (0x9c, 0x77, 0x48, 225)
STONE = (0x8a, 0x80, 0x6c, 255)
STONE_LIGHT = (0xb9, 0xae, 0x95, 255)
BONE = (0xee, 0xdc, 0xb6, 255)
BONE_DIM = (0xc4, 0xb0, 0x8a, 255)
OCHRE = (0xc9, 0x8b, 0x2e, 255)
OCHRE_LIGHT = (0xe4, 0xb4, 0x5c, 255)
OCHRE_DARK = (0x97, 0x68, 0x22, 255)
BROWN = (0x6e, 0x45, 0x24, 255)
BROWN_LIGHT = (0x9a, 0x64, 0x34, 255)
MOSS = (0x7f, 0x9c, 0x55, 255)
MOSS_LIGHT = (0xa9, 0xc2, 0x7a, 255)
TRACK = (0x22, 0x1b, 0x13, 220)
TRACK_LOW = (0x3a, 0x2f, 0x22, 235)

SLOTS = {
    'ui_border_9slice.png': (24, 24),
    'ui_focus_bracket.png': (8, 8),
    'tab_units.png': (32, 32),
    'tab_upgrades.png': (32, 32),
    'tab_evolution.png': (32, 32),
    'tab_more.png': (32, 32),
    'qty_1.png': (32, 32),
    'qty_10.png': (32, 32),
    'qty_max.png': (32, 32),
    'progress_cap_left.png': (8, 8),
    'progress_cap_right.png': (8, 8),
    'progress_segment_full.png': (8, 8),
    'progress_segment_empty.png': (8, 8),
}


def outline(image):
    """Rings every opaque shape with a hard 1 px outline on its four sides."""
    pixels = image.load()
    width, height = image.size
    edge = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] and pixels[nx, ny] != INK:
                    edge.append((x, y))
                    break
    for point in edge:
        pixels[point] = INK
    return image


def border():
    """A thin packed-soil band on the outer 3 px, a stone in each corner, and a dark tint everywhere inside."""
    grains = [SOIL, SOIL_LIGHT, SOIL, GRAIN, SOIL, SOIL_LIGHT, SOIL_DARK, SOIL]
    edge = Image.new('RGBA', (8, 8), TINT)
    for x in range(8):
        edge.putpixel((x, 0), INK)
        edge.putpixel((x, 1), grains[x])
        edge.putpixel((x, 2), SOIL_DARK if x % 3 else SOIL)
        edge.putpixel((x, 3), INK)
    corner = Image.new('RGBA', (8, 8), TINT)
    for i in range(8):
        corner.putpixel((i, 0), INK)
        corner.putpixel((0, i), INK)
        corner.putpixel((i, 1), grains[i])
        corner.putpixel((1, i), grains[(i + 3) % 8])
        corner.putpixel((i, 2), SOIL_DARK)
        corner.putpixel((2, i), SOIL_DARK)
        if i >= 3:
            corner.putpixel((i, 3), INK)
            corner.putpixel((3, i), INK)
    for x in range(1, 5):
        for y in range(1, 5):
            corner.putpixel((x, y), STONE)
    for x in range(1, 4):
        corner.putpixel((x, 1), STONE_LIGHT)
    corner.putpixel((1, 2), STONE_LIGHT)
    for i in range(6):
        corner.putpixel((5, i), INK)
        corner.putpixel((i, 5), INK)
    corner.putpixel((0, 0), CLEAR)
    sheet = Image.new('RGBA', (24, 24), TINT)
    sheet.paste(corner, (0, 0))
    sheet.paste(corner.transpose(Image.FLIP_LEFT_RIGHT), (16, 0))
    sheet.paste(corner.transpose(Image.FLIP_TOP_BOTTOM), (0, 16))
    sheet.paste(corner.transpose(Image.ROTATE_180), (16, 16))
    sheet.paste(edge, (8, 0))
    sheet.paste(edge.transpose(Image.FLIP_TOP_BOTTOM), (8, 16))
    sheet.paste(edge.transpose(Image.ROTATE_90), (0, 8))
    sheet.paste(edge.transpose(Image.ROTATE_270), (16, 8))
    return sheet


def bracket():
    """Top-left bracket: a bone L 2 px thick with arms 6 px long, outlined in ink."""
    image = Image.new('RGBA', (8, 8), CLEAR)
    for i in range(1, 7):
        for t in (1, 2):
            image.putpixel((i, t), BONE)
            image.putpixel((t, i), BONE)
    image.putpixel((1, 1), OCHRE_LIGHT)
    outline(image)
    image.putpixel((0, 0), INK)
    return image


def glyph(draw):
    image = Image.new('RGBA', (32, 32), CLEAR)
    draw(ImageDraw.Draw(image))
    return outline(image)


def units(d):
    """A roach seen from above."""
    for leg in ((11, 12, 6, 9), (11, 17, 5, 17), (11, 21, 6, 26), (20, 12, 25, 9), (20, 17, 26, 17), (20, 21, 25, 26)):
        d.line(leg, fill=BROWN)
    d.line((14, 6, 10, 2), fill=BROWN)
    d.line((17, 6, 21, 2), fill=BROWN)
    d.ellipse((10, 9, 21, 28), fill=BROWN_LIGHT)
    d.rectangle((15, 11, 16, 27), fill=BROWN)
    d.ellipse((12, 5, 19, 10), fill=BROWN)
    d.point([(13, 13), (13, 14), (12, 16)], fill=OCHRE_LIGHT)


def upgrades(d):
    """An ochre arrow rising out of a soil mound."""
    d.polygon([(4, 27), (9, 22), (23, 22), (28, 27)], fill=SOIL[:3] + (255,))
    d.point([(9, 24), (14, 25), (21, 24), (17, 26)], fill=GRAIN[:3] + (255,))
    d.polygon([(16, 4), (24, 12), (19, 12), (19, 21), (13, 21), (13, 12), (8, 12)], fill=OCHRE)
    d.line((16, 6, 21, 11), fill=OCHRE_LIGHT)
    d.line((14, 13, 14, 20), fill=OCHRE_LIGHT)


def evolution(d):
    """A cocoon with a mossy mutation glow."""
    d.ellipse((9, 4, 23, 28), fill=BONE_DIM)
    for y in (9, 14, 19, 24):
        d.line((11, y, 21, y - 1), fill=(0xa8, 0x93, 0x6e, 255))
    d.ellipse((13, 11, 19, 19), fill=MOSS)
    d.point([(15, 13), (16, 13), (15, 14)], fill=MOSS_LIGHT)
    d.line((12, 6, 13, 6), fill=BONE)


def more(d):
    """Three pebbles in a row."""
    for x in (4, 13, 22):
        d.rectangle((x, 13, x + 5, 18), fill=BONE_DIM)
        d.line((x, 13, x + 4, 13), fill=BONE)
        d.point((x, 14), fill=BONE)


def crumb(d, x, y):
    """A 7x5 ochre crumb with a lit top edge."""
    d.rectangle((x, y, x + 6, y + 4), fill=OCHRE)
    d.line((x, y, x + 5, y), fill=OCHRE_LIGHT)
    d.line((x + 1, y + 4, x + 6, y + 4), fill=OCHRE_DARK)


def qty_one(d):
    crumb(d, 12, 13)


def qty_ten(d):
    for x, y in ((7, 18), (17, 18), (12, 11)):
        crumb(d, x, y)


def qty_max(d):
    for x, y in ((3, 22), (12, 22), (21, 22), (7, 15), (17, 15), (12, 8)):
        crumb(d, x, y)


def cap_left():
    """Left cap: a stepped rounded end around the dark track."""
    image = Image.new('RGBA', (8, 8), CLEAR)
    for x in range(8):
        for y in range(1, 7):
            if x >= 2 or (x == 1 and 2 <= y <= 5):
                image.putpixel((x, y), TRACK)
    for x in range(2, 8):
        image.putpixel((x, 0), INK)
        image.putpixel((x, 7), INK)
    image.putpixel((1, 1), INK)
    image.putpixel((1, 6), INK)
    for y in range(2, 6):
        image.putpixel((0, y), INK)
    for x in range(3, 8):
        image.putpixel((x, 1), TRACK_LOW)
    return image


def segment(fill, light, shade):
    """One 8 px cell of the track holding a 6x4 block in rows 2 to 5, outlined top and bottom."""
    image = Image.new('RGBA', (8, 8), CLEAR)
    for x in range(8):
        image.putpixel((x, 0), INK)
        image.putpixel((x, 7), INK)
        for y in range(1, 7):
            image.putpixel((x, y), TRACK)
    for x in range(1, 7):
        for y in range(2, 6):
            image.putpixel((x, y), fill)
        image.putpixel((x, 2), light)
        image.putpixel((x, 5), shade)
    return image


PLACEHOLDERS = {
    'ui_border_9slice.png': border,
    'ui_focus_bracket.png': bracket,
    'tab_units.png': lambda: glyph(units),
    'tab_upgrades.png': lambda: glyph(upgrades),
    'tab_evolution.png': lambda: glyph(evolution),
    'tab_more.png': lambda: glyph(more),
    'qty_1.png': lambda: glyph(qty_one),
    'qty_10.png': lambda: glyph(qty_ten),
    'qty_max.png': lambda: glyph(qty_max),
    'progress_cap_left.png': cap_left,
    'progress_cap_right.png': lambda: cap_left().transpose(Image.FLIP_LEFT_RIGHT),
    'progress_segment_full.png': lambda: segment(OCHRE, OCHRE_LIGHT, OCHRE_DARK),
    'progress_segment_empty.png': lambda: segment(TRACK_LOW, TRACK_LOW, TRACK_LOW),
}


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    review = REVIEW / path.relative_to(OUT)
    review.parent.mkdir(parents=True, exist_ok=True)
    image.resize((image.width * 4, image.height * 4), Image.NEAREST).save(review)
    print(f'{path.relative_to(PROJECT)}: {image.width}x{image.height}')


def focus_nine_slice(corner):
    """Mirrors the top-left bracket into the four corners of a 24x24 nine-slice with clear edges."""
    sheet = Image.new('RGBA', (24, 24), CLEAR)
    sheet.paste(corner, (0, 0))
    sheet.paste(corner.transpose(Image.FLIP_LEFT_RIGHT), (16, 0))
    sheet.paste(corner.transpose(Image.FLIP_TOP_BOTTOM), (0, 16))
    sheet.paste(corner.transpose(Image.ROTATE_180), (16, 16))
    return sheet


def main():
    if '--placeholders' in sys.argv[1:]:
        for name, build in PLACEHOLDERS.items():
            save(build(), OUT / name)
    for name, size in SLOTS.items():
        image = Image.open(OUT / name)
        if image.size != size:
            sys.exit(f'[ROACH] ui art: {name} is {image.width}x{image.height}; the slot is {size[0]}x{size[1]}.')
    save(focus_nine_slice(Image.open(OUT / 'ui_focus_bracket.png').convert('RGBA')), BUILT / 'ui_focus_9slice.png')


if __name__ == '__main__':
    main()
