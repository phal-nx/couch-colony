Roach Colony pixel-art habitat pack
==================================

Generated with built-in imagegen; exact generation prompts are included.

28 base creatures, 112 frames
- Native four-frame strips: animations/<name>.png, left to right.
- Frame durations: suggested 125ms each, 8fps. Four phases loop.
- 32px: hatchling, forager, silverfish, fire ant, firefly.
- 48px: nest queen, brood mother, colony matriarch, grand brooder, grand matriarch, house spider, wolf spider, mosquito, cricket, hissing roach, wasp, stag beetle, moth, bat, golden roach.
- 64px: empress, neuroprophet, elder sage, Pantheon, council mind, Overmind, rhino beetle, house centipede.
- Strict overhead, head right. Flying species have wing cycles.
- Individual frames are also in animations/frames/.
- Three native atlases use one creature per row and four frames per row.
- 28 base designs cover the game's species through the speciesId and tintAliases fields in manifest.json. Council mind maps to pantheon5. Numbered Pantheon and Overmind variants should use body tint/pip differences rather than more source artwork.
- Preview: previews/creatures-animated.gif. Preview grid order follows manifest.animation, four creatures across.

Nest
- Six stages, each EXACTLY 300x230, ground line y205.
- Entrance is at the bottom-right, roughly x270,y195.
- Nine overlays are each EXACTLY 300x230, registered to stage4.
- Eggs and crumbs have exclusive size groups; use one size from each group.
- Compact overlay files preserve the same art, with x/y placement in manifest.json.
- Stage4 example with large eggs, nexus, flag, large crumbs and annex is in previews/stage4-upgraded.png.

Props
- 18 native 16x16 or24x24 transparent props.
- props/atlas.png uses 24px cells, six columns by three rows.
- Smaller 16px props are centered in the atlas's 24px cells.
- Carried crumb, parcel, egg, four crumb variants, three crumb piles, two burrow holes, three grass tufts, two soil clods, claim post.

Rendering / memory
- All source assets are native PNGs with alpha0 or255; no antialiasing.
- Draw at whole pixels with image smoothing disabled.
- Four exact quarter-turn directions preserve the pixel grid.
- All three animation atlases together occupy1,159,168 decoded RGBA bytes (about1.1MiB). Four pre-rotated versions would use about4.4MiB before other artwork.
- Use compact overlays with recorded offsets. Full overlay canvases are supplied for alignment/interchange, but decoding all nine wastes memory.
- Load/bake the active nest stage and upgrade state once, not per frame.
- Keep existing bounded sprite caps and adaptive frame rates.

This is an art handoff. No renderer or economy code was changed and no TV action was performed.

