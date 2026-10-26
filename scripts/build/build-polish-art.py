#!/usr/bin/env python3
"""Normalize the generated source sheets in art/source/colony-polish-2026-10-21/
into native binary-alpha pixel art assets for Roach Colony:

1. control_status_source.png (1254x1254, 4x4):
   - Row 0: 16x8 remote button capsules -> app/ui-art/capsule_{red,green,yellow,blue}.png
   - Rows 1-3: 32x32 UI control/status glyphs -> app/ui-art/status_*.png
2. terrarium_props_source.png (1254x1254, 4x4):
   - 16 64x64 props & keepsakes -> art/events/prop_*.png and art/events/keepsake_*.png
3. visitor_motion_source.png (1254x1254, 4x4):
   - 4 species x 4 frames (64x64, pivot-registered across frames) -> art/events/visitor_<slug>_<1..4>.png
4. creature_acting_source.png (1024x1536, 4x6):
   - 6 4-frame acting strips (32px or 48px native, pivot-registered across frames, overhead head-right)
     -> art/creatures/acting/<name>.png

Also outputs a contact sheet to work/polish-art-qa/ for visual inspection on light and dark backgrounds.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

PROJECT = Path(__file__).resolve().parents[2]
PACK = PROJECT / 'art/source/colony-polish-2026-10-21'
UI_ART = PROJECT / 'app/ui-art'
EVENTS_DIR = PROJECT / 'art/events'
ACTING_DIR = PROJECT / 'art/creatures/acting'
QA_DIR = PROJECT / 'work/polish-art-qa'

OUTLINE = np.array([18, 12, 8], dtype=np.uint8)


def extract_clean_subject(cell_rgba, alpha_threshold=120):
    """Isolate the foreground subject in a cell, remove background halo, and return cropped RGBA with binary mask."""
    alpha = cell_rgba[..., 3] >= alpha_threshold
    # Drop tiny disconnected specks (< 16 source pixels)
    labels, count = ndi.label(alpha, structure=np.ones((3, 3)))
    if count > 0:
        sizes = ndi.sum(alpha, labels, range(1, count + 1))
        keep = np.isin(labels, np.flatnonzero(np.asarray(sizes) >= 16) + 1)
        alpha = keep
    if not alpha.any():
        return np.zeros((1, 1, 4), np.uint8), (0, 0, 1, 1)
    ys, xs = np.nonzero(alpha)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    return cell_rgba, (x0, y0, x1, y1)


def downsample_box_binary(crop_rgba, target_w, target_h, alpha_cutoff=115, enforce_outline=True):
    """Downsample a source region onto target_w x target_h using premultiplied area averaging
    followed by hard binary alpha (0 or 255) and a crisp 1px dark outline guard."""
    src_a = (crop_rgba[..., 3] >= 110).astype(np.float32)
    rgb = crop_rgba[..., :3].astype(np.float32)
    pre = np.dstack([rgb * src_a[..., None], src_a * 255.0]).clip(0, 255).astype(np.uint8)
    small = np.asarray(Image.fromarray(pre, 'RGBA').resize((target_w, target_h), Image.BOX)).astype(np.float32)
    a = small[..., 3] / 255.0
    solid = a >= (alpha_cutoff / 255.0)
    out = np.zeros((target_h, target_w, 4), np.uint8)
    if not solid.any():
        return out
    recovered = (small[..., :3] / np.maximum(a[..., None], 1e-4)).clip(0, 255).round().astype(np.uint8)
    out[solid, :3] = recovered[solid]
    out[solid, 3] = 255
    if enforce_outline:
        # Ensure outer 1px boundary pixels aren't washed-out halo pixels
        eroded = ndi.binary_erosion(solid)
        rim = solid & ~eroded
        luma = out[..., 0] * 0.299 + out[..., 1] * 0.587 + out[..., 2] * 0.114
        bright_rim = rim & (luma > 165)
        out[bright_rim, :3] = (out[bright_rim, :3].astype(np.float32) * 0.35 + OUTLINE * 0.65).astype(np.uint8)
    # Quantize solid pixels to 16 crisp palette steps so pixel art stays flat-shaded and compact
    solid_rgb = out[solid, :3]
    if len(solid_rgb) > 0:
        pil_rgb = Image.fromarray(solid_rgb.reshape(1, -1, 3), 'RGB')
        quant = pil_rgb.quantize(16, Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
        out[solid, :3] = np.asarray(quant).reshape(-1, 3)
    return out


def process_control_status(manifest_entry):
    sheet = np.asarray(Image.open(PACK / manifest_entry['file']).convert('RGBA'))
    cells = {(c['row'], c['column']): c for c in manifest_entry['cells']}
    UI_ART.mkdir(parents=True, exist_ok=True)
    saved = []

    capsules = ['capsule_red', 'capsule_green', 'capsule_yellow', 'capsule_blue']
    for col, name in enumerate(capsules):
        c = cells[(0, col)]
        x0, y0, x1, y1 = c['sourceRect']
        cell = sheet[y0:y1, x0:x1]
        _, (bx0, by0, bx1, by1) = extract_clean_subject(cell)
        crop = cell[by0:by1, bx0:bx1]
        # Capsules are 16x8 logical size, matching red_key_capsule.png
        icon = downsample_box_binary(crop, 16, 8, alpha_cutoff=110, enforce_outline=True)
        path = UI_ART / f'{name}.png'
        Image.fromarray(icon, 'RGBA').save(path, optimize=True)
        saved.append((name, icon))

    glyph_rows = [
        ['status_play', 'status_pause', 'status_wait', 'status_stop'],
        ['status_pin', 'status_goal', 'status_inspect', 'status_history'],
        ['status_expedition', 'status_choice', 'status_reserve', 'status_guide'],
    ]
    for r_idx, row_names in enumerate(glyph_rows, start=1):
        for col, name in enumerate(row_names):
            c = cells[(r_idx, col)]
            x0, y0, x1, y1 = c['sourceRect']
            cell = sheet[y0:y1, x0:x1]
            _, (bx0, by0, bx1, by1) = extract_clean_subject(cell)
            crop = cell[by0:by1, bx0:bx1]
            bw, bh = bx1 - bx0, by1 - by0
            scale = min(26.0 / max(1, bw), 26.0 / max(1, bh))
            tw = max(4, min(28, int(round(bw * scale))))
            th = max(4, min(28, int(round(bh * scale))))
            sub = downsample_box_binary(crop, tw, th, alpha_cutoff=110, enforce_outline=True)
            canvas = np.zeros((32, 32, 4), np.uint8)
            ox = (32 - tw) // 2
            oy = (32 - th) // 2
            canvas[oy:oy + th, ox:ox + tw] = sub
            path = UI_ART / f'{name}.png'
            Image.fromarray(canvas, 'RGBA').save(path, optimize=True)
            saved.append((name, canvas))
    return saved


def process_terrarium_props(manifest_entry):
    sheet = np.asarray(Image.open(PACK / manifest_entry['file']).convert('RGBA'))
    cells = {(c['row'], c['column']): c for c in manifest_entry['cells']}
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    prop_rows = [
        ['prop_crumb_depot', 'prop_nursery_entrance', 'prop_guard_post', 'prop_scout_post'],
        ['prop_bottlecap', 'prop_bark_bridge', 'prop_stone_burrow', 'prop_dry_leaves'],
        ['keepsake_beetle_shell', 'keepsake_cricket_shell', 'keepsake_moth_stone', 'keepsake_snail_shell'],
        ['prop_travel_parcel', 'prop_trail_markers', 'prop_resin_stones', 'prop_bark_shelf'],
    ]
    saved = []
    for r_idx, row_names in enumerate(prop_rows):
        for col, name in enumerate(row_names):
            c = cells[(r_idx, col)]
            x0, y0, x1, y1 = c['sourceRect']
            cell = sheet[y0:y1, x0:x1]
            _, (bx0, by0, bx1, by1) = extract_clean_subject(cell)
            crop = cell[by0:by1, bx0:bx1]
            bw, bh = bx1 - bx0, by1 - by0
            scale = min(52.0 / max(1, bw), 52.0 / max(1, bh))
            tw = max(8, min(56, int(round(bw * scale))))
            th = max(8, min(56, int(round(bh * scale))))
            sub = downsample_box_binary(crop, tw, th, alpha_cutoff=115, enforce_outline=True)
            canvas = np.zeros((64, 64, 4), np.uint8)
            ox = (64 - tw) // 2
            oy = (64 - th) // 2
            canvas[oy:oy + th, ox:ox + tw] = sub
            path = EVENTS_DIR / f'{name}.png'
            Image.fromarray(canvas, 'RGBA').save(path, optimize=True)
            saved.append((name, canvas))
    return saved


def process_aligned_row(sheet, row_cells, cell_size, max_footprint, min_margin=2):
    """Extract 4 frames of a row using a shared scale and centroid pivot so the body never jitters across frames."""
    crops = []
    max_w, max_h = 1, 1
    for c in row_cells:
        x0, y0, x1, y1 = c['sourceRect']
        cell = sheet[y0:y1, x0:x1]
        _, (bx0, by0, bx1, by1) = extract_clean_subject(cell)
        crop = cell[by0:by1, bx0:bx1]
        crops.append(crop)
        max_w = max(max_w, bx1 - bx0)
        max_h = max(max_h, by1 - by0)
    allowed = min(max_footprint, cell_size - 2 * min_margin)
    scale = min(float(allowed) / max_w, float(allowed) / max_h)
    frames = []
    for crop in crops:
        bh, bw = crop.shape[:2]
        tw = max(6, min(allowed, int(round(bw * scale))))
        th = max(6, min(allowed, int(round(bh * scale))))
        sub = downsample_box_binary(crop, tw, th, alpha_cutoff=115, enforce_outline=True)
        # Align centroid of solid pixels to center of cell_size x cell_size
        solid = sub[..., 3] > 0
        canvas = np.zeros((cell_size, cell_size, 4), np.uint8)
        if solid.any():
            ys, xs = np.nonzero(solid)
            cx = int(round(xs.mean()))
            cy = int(round(ys.mean()))
            ox = max(min_margin, min(cell_size - min_margin - tw, cell_size // 2 - cx))
            oy = max(min_margin, min(cell_size - min_margin - th, cell_size // 2 - cy))
        else:
            ox = (cell_size - tw) // 2
            oy = (cell_size - th) // 2
        canvas[oy:oy + th, ox:ox + tw] = sub
        frames.append(canvas)
    return frames


def process_visitor_motion(manifest_entry):
    sheet = np.asarray(Image.open(PACK / manifest_entry['file']).convert('RGBA'))
    cells = {(c['row'], c['column']): c for c in manifest_entry['cells']}
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    species = ['pantry_moth', 'stag_beetle', 'camel_cricket', 'firefly']
    saved = []
    for r_idx, slug in enumerate(species):
        row_cells = [cells[(r_idx, col)] for col in range(4)]
        frames = process_aligned_row(sheet, row_cells, cell_size=64, max_footprint=46)
        for f_idx, frame in enumerate(frames, start=1):
            name = f'visitor_{slug}_{f_idx}'
            path = EVENTS_DIR / f'{name}.png'
            Image.fromarray(frame, 'RGBA').save(path, optimize=True)
            saved.append((name, frame))
    return saved


def process_creature_acting(manifest_entry):
    sheet = np.asarray(Image.open(PACK / manifest_entry['file']).convert('RGBA'))
    cells = {(c['row'], c['column']): c for c in manifest_entry['cells']}
    ACTING_DIR.mkdir(parents=True, exist_ok=True)
    # (name, target_size, max_footprint, min_margin)
    rows_spec = [
        ('forager-idle', 32, 24, 3),
        ('forager-deposit', 32, 24, 3),
        ('queen-lay', 48, 38, 4),
        ('hatchling-wriggle', 32, 22, 3),
        ('roach-sentry', 48, 38, 4),
        ('brood-tend', 48, 38, 4),
    ]
    saved = []
    for r_idx, (name, size, footprint, margin) in enumerate(rows_spec):
        row_cells = [cells[(r_idx, col)] for col in range(4)]
        frames = process_aligned_row(sheet, row_cells, cell_size=size, max_footprint=footprint, min_margin=margin)
        strip = np.concatenate(frames, axis=1)
        path = ACTING_DIR / f'{name}.png'
        Image.fromarray(strip, 'RGBA').save(path, optimize=True)
        saved.append((name, strip))
    return saved


def save_qa_sheets(controls, props, visitors, acting):
    QA_DIR.mkdir(parents=True, exist_ok=True)
    for bg_name, bg_rgba in (('dark', (24, 22, 18, 255)), ('light', (218, 212, 198, 255))):
        canvas = Image.new('RGBA', (640, 720), bg_rgba)
        # Draw controls
        x, y = 12, 12
        for name, img in controls:
            pil = Image.fromarray(img, 'RGBA')
            canvas.alpha_composite(pil, (x, y))
            x += 38
            if x > 600:
                x = 12
                y += 38
        y += 44
        x = 12
        for name, img in props:
            pil = Image.fromarray(img, 'RGBA')
            canvas.alpha_composite(pil, (x, y))
            x += 72
            if x > 580:
                x = 12
                y += 72
        y += 76
        x = 12
        for name, img in visitors:
            pil = Image.fromarray(img, 'RGBA')
            canvas.alpha_composite(pil, (x, y))
            x += 72
            if x > 288:
                x = 12
                y += 68
        y = 420
        for name, strip in acting:
            pil = Image.fromarray(strip, 'RGBA')
            canvas.alpha_composite(pil, (320, y))
            y += strip.shape[0] + 6
        canvas.save(QA_DIR / f'polish-art-{bg_name}-1x.png')
        canvas.resize((canvas.width * 3, canvas.height * 3), Image.NEAREST).save(QA_DIR / f'polish-art-{bg_name}-3x.png')


def main():
    manifest = json.loads((PACK / 'manifest.json').read_text())
    by_id = {entry['id']: entry for entry in manifest['files']}
    controls = process_control_status(by_id['control_status'])
    props = process_terrarium_props(by_id['terrarium_props'])
    visitors = process_visitor_motion(by_id['visitor_motion'])
    acting = process_creature_acting(by_id['creature_acting'])
    save_qa_sheets(controls, props, visitors, acting)

    # Verify binary alpha on all outputs
    for group in (controls, props, visitors, acting):
        for name, arr in group:
            alphas = set(np.unique(arr[..., 3]))
            if alphas - {0, 255}:
                raise ValueError(f'{name} has non-binary alpha: {alphas}')
            if 255 not in alphas:
                raise ValueError(f'{name} is completely empty')
    print(f'Normalized {len(controls)} controls, {len(props)} props, {len(visitors)} visitor frames, {len(acting)} acting strips with strict binary alpha.')


if __name__ == '__main__':
    main()
