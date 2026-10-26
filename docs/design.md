# Roach Colony architecture and design

This document is the architectural map for Roach Colony (`com.phil.roachcolony`). It explains how the modules fit together, what sits behind each seam, how the two-speed TV tick and 30 fps habitat renderer stay within the LG OLED55CXPUA's Chromium 68 budget, and how the TV and LAN phone controller share state without duplicating domain rules.

Read this alongside:
- [`AGENTS.md`](./AGENTS.md): TV safety rules, runtime targets, and verification workflows.
- [`docs/glossary.md`](./docs/glossary.md): Canonical domain vocabulary (`Dormant Opening`, `Main Chain`, `Territory Critter`, `Red Target`, `Seat`, `Lane Manners`, `Trusted Slot Cache`, `Overlay Meta`).
- [`docs/balance.md`](./docs/balance.md): Active-time economy curves, chance event payouts, and pacing mechanics.
- [`docs/ui-spec.md`](./docs/ui-spec.md): Visual and interaction specification for the TV overlay, habitat, and phone controller.
- [`docs/naming.md`](./docs/naming.md): Swarm Simulator to Roach Colony translation table.

---

## 1. System Topology & Script Load Order

Roach Colony runs as a zero-dependency browser application (`app/index.html`) in Chromium 68 on webOS 5.6.2, paired over loopback WebSocket (`127.0.0.1:8643`) to a local Node 8.12 relay bridge (`phone-controller/bridge.js`) that serves paired phones on LAN (`:8642`).

```text
+-----------------------------------------------------------------------------------+
| TV Web App (app/index.html, Chromium 68, 1920x1080 transparent overlay)           |
|                                                                                   |
|  +-----------------------+     +-----------------------+     +-----------------+  |
|  | Layer 1: Engine       |     | Layer 2: Domain/Save  |     | Layer 3: Theme  |  |
|  | app/swarm/adapter.js  |     | app/mechanics.js      |     | app/theme.js    |  |
|  | -> app/engine.js      |     | app/save.js           |     | (RoachTheme)    |  |
|  | (SwarmEngine.Game)    |     | app/reset.js          |     +-----------------+  |
|  +-----------+-----------+     +-----------+-----------+              |           |
|              |                             |                          |           |
|              +--------------+--------------+--------------------------+           |
|                             |                                                     |
|                             v                                                     |
|  +-----------------------------------------------------------------------------+  |
|  | Layer 5: TV Overlay & Session (app/session.js, tv-shell.js, overlay-view.js,|  |
|  |                                app/colony.js)                               |  |
|  +--------------------+-----------------------------------+--------------------+  |
|                       |                                   |                       |
|                       v                                   v                       |
|  +-----------------------------------------+  +--------------------------------+  |
|  | Layer 4: Habitat & Sprites              |  | Layer 6: Controller Link       |  |
|  | app/nest-sprites.js, creature-sprites.js|  | app/qrcode.js                  |  |
|  | app/critters.js, nest-art.js, motes.js  |  | app/controller-link.js         |  |
|  | app/floor-baker.js, habitat.js,         |  | (RoachControllerLink)          |  |
|  | app/sprites.js                          |  +---------------+----------------+  |
|  +-----------------------------------------+                  |                   |
+---------------------------------------------------------------|-------------------+
                                                                | ws://127.0.0.1:8643/game
                                                                v
                                                +-------------------------------+
                                                | TV Bridge (Node 8.12)         |
                                                | phone-controller/bridge.js          |
                                                | phone-controller/websocket.js       |
                                                +---------------+---------------+
                                                                | http + ws://<TV>:8642
                                                                v
                                                +-------------------------------+
                                                | Phone SPA (Mobile Safari)     |
                                                | phone-controller/public/phone.js    |
                                                | + /theme.js                   |
                                                +-------------------------------+
```

In `app/index.html`, modules attach to `window.*` in strict dependency order:
1. `engine.js` (`window.SwarmEngine` — built from `app/swarm/adapter.js`)
2. `save.js` (`window.RoachSave`)
3. `theme.js` (`window.RoachTheme`)
4. `nest-sprites.js` (`window.RoachNestSprites`)
5. `nest-art.js` (`window.RoachNestArt`)
6. `critters.js` (`window.RoachCritters`)
7. `creature-sprites.js` (`window.RoachCreatures`)
8. `motes.js` (`window.RoachMotes`)
9. `floor-baker.js` (`window.RoachFloorBaker`)
10. `habitat.js` (`window.RoachHabitat`)
11. `sprites.js` (`window.RoachSprites`)
12. `reset.js` (`window.RoachReset`)
13. `mechanics.js` (`window.RoachMechanics`)
14. `qrcode.js` (`window.qrcode`)
15. `controller-link.js` (`window.RoachControllerLink`)
16. `session.js` (`window.RoachSession`)
17. `tv-shell.js` (`window.RoachTvShell`)
18. `overlay-view.js` (`window.RoachOverlayView`)
19. `colony.js` (top-level orchestrator; exposes `window.colonyDiagnostics`)

Every pure or headless module (`engine.js`, `save.js`, `theme.js`, `reset.js`, `mechanics.js`, `session.js`, `tv-shell.js`, `overlay-view.js`, `sprites.js`, `floor-baker.js`) uses a UMD-style wrapper so it can be `require()`d directly in Node unit tests (`npm test`) without starting a browser.

---

## 2. Deep Modules & Seams

### 2.1 `SwarmEngine.Game` (`app/swarm/adapter.js` → `app/engine.js`)
- **Role**: Wraps the pinned upstream Swarm Simulator CoffeeScript/TypeScript core (`app/swarm/source/`) in a deterministic, headless container with an `Active-Time Policy` clock and active-play balance curve.
- **Interface**:
  - `new Game({now, activeTimeOnly})`
  - `pause(now)` / `resume(now)`
  - `act(action, now)` (`unit`, `upgrade`, `forage`, `reward`, `ascend`, `respec`)
  - `autoBuy(bindings, now)`
  - `quickEta(kind, id, now)`
  - `fastCounts(ids, now)`
  - `snapshot(now, options)`
  - `exportState(now)` / `importState(input, now)`
  - `setBonusAchievementPoints(points)` / `refundGreaterQueenOnce()`
- **What the seam hides**:
  - Upstream AngularJS-style service registration (`createRuntime`).
  - Targeted cache invalidation (`cache.invalidateStats()` vs count-only `cache.onUpdate()`), zero-floor `ProducerPath` short-circuits, `Unit._getCap` `false` sentinel caching, and non-reifying `exportState` / `act('forage')` paths.
  - Structured item quotes (`costs`, `batchCosts`, `effects`, `production`, `velocity`), `quickSlots` candidate ranking, `nextGoal`, and `tutorial` steps.

### 2.2 `RoachMechanics` (`app/mechanics.js`)
- **Role**: Visible-time state machine for all chance occurrences (`golden`, `visitor`, `intruder`, `chance`: `snack`, `egg`, `molt`, `dung`, and `night` shift), Red button target priority, and `Guest Feat` progress.
- **Interface**:
  - `create(options)` returning `{tick, step, target, redTarget, catchOne, describeCatch, leave, dropChance, hide, load, loadTally, tally, feats, log, state}`
  - Static helpers: `targets`, `redLabel(kind, detail)`, `goneMessage(kind)`, `describeCatch(caught, gained)`, `humanize(slug)`, `rarity(slug)`, `night(hour)`
- **What the seam hides**:
  - Priority order of `Red Target`: `golden` → `intruder` → `egg` / `molt` / `dung` → `visitor` → `''` (forage).
  - Mutual exclusion between golden roaches, intruders, and habitat chance events.
  - Dispatching habitat spawn/clear calls, phone event notifications, and reward queueing via `step(ms, territory, crevice, hooks)`.

### 2.3 `RoachSave.Store` (`app/save.js`)
- **Role**: Owns all `localStorage` persistence for both the validated engine save envelope (`phil_roach_colony_v2`, `_backup`, `_before_reset`, `_corrupt_*`) and `Overlay Meta` (`phil_roach_colony_ui_*`).
- **Interface**:
  - Engine save: `load(game, now)`, `save(game, now)`, `export(game, now, extras)`, `import(text, game, now)`, `reset(game, now, extras)`
  - Overlay meta (\(O(1)\) non-validating writes): `loadMeta()`, `saveMilestones(seen)`, `saveVisitors(log)`, `saveCatches(tally)`, `saveLastPurchase(purchase)`, `saveAuto(bindings, paused)`, `saveLastAscension(reward)`, `saveFlavorIndex(index)`, `flushJournal(entries)`, `clearMeta()`, `refundMatriarchOnce(game, meta, hasPalmSystem)`
- **What the seam hides**:
  - `Trusted Slot Cache` (`_trusted[key]`) so routine saves and backup rotations never spin up a second validation `Game` instance unless storage was modified externally.
  - Corruption archival (`_preserveInvalid`) before any overwrite.
  - Sanitization of optional `visitors` and `catches` (`golden` and `intruders` tallies) in exported/imported JSON envelopes.

### 2.4 `RoachTheme` (`app/theme.js`)
- **Role**: Single source of truth for Roach Colony terminology, pluralization, regex prose rewriting, and 3-significant-figure / log-10 number formatting across both the TV and the phone controller.
- **Interface**:
  - Naming: `label`, `plural`, `upgradeLabel`, `achievementLabel`, `tabLabel`, `costText`, `text`, `source`, `effectText`, `upgradeText`
  - Numbers & Progress: `short`, `whole`, `shortNumbers`, `compact`, `magnitude`, `partProgress`, `itemProgress`

### 2.5 TV Overlay Modules (`app/session.js`, `app/tv-shell.js`, `app/overlay-view.js`, `app/colony.js`)
- **`RoachSession` (`app/session.js`)**: Pure, Node-testable policy module for 4-refresh quick-buy hysteresis (`chooseQuick`), tier-ranked auto-buy rotation (`orderAutoBindings`), control validation (`validateControls`), achievement sorting (`orderAchievements`), reverse-chronological paging (`pageIds`), bounded journal ring buffer (`appendJournal`), and mock-store meta fallback (`ensureMetaStore`).
- **`RoachTvShell` (`app/tv-shell.js`)**: Owns `PalmSystem` focus pulsing (`createRemoteHold`), spatial D-pad geometry and role-preserving vertical navigation (`createFocusController`, `nearestLine`, `scrollTabIntoView`), corner positioning (`positionCorner`), and burn-in pixel shifting (`applyShift`).
- **`RoachOverlayView` (`app/overlay-view.js`)**: Owns DOM node helpers, 5/10/20-segment pixel progress bars (`segmentBar`, `setSegments`), 3×5 pixel bitmap text (`pixelText`), order-of-magnitude rank detection (`magnitudeRank`), one-shot CSS moment animation tracking (`createFlashTracker`), and sprite icon cloning (`pixelIcon`, `unitIcon`).
- **`app/colony.js`**: Top-level orchestrator wiring the 500 ms simulation loop, DOM view rendering, remote key codes, and `window.colonyDiagnostics`.

### 2.6 Habitat & Sprite Modules (`app/sprites.js`, `app/floor-baker.js`, `app/nest-art.js`, `app/motes.js`, `app/habitat.js`)
- **`RoachSprites` (`app/sprites.js`)**: Shared seam for DOM and phone icon callers (`iconCanvas`, `iconFor`, `critterCanvas`, `redGlyph`, `copyIcon`, `creaturesReady`, `slug`).
- **`RoachFloorBaker` (`app/floor-baker.js`)**: Paints procedural and sprite-backed ground marks (`trail`, `burrow`, `tufts`, `soil`, `claim`, `crumbs`, `pile`) onto the static offscreen floor canvas.
- **`RoachNestArt` (`app/nest-art.js`)**: Bakes the 6-stage cutaway soil nest with upgrade overlays and computes walkable interior polylines (`paths()`).
- **`RoachMotes` (`app/motes.js`)**: Fixed 96-particle struct-of-arrays pool.
- **`RoachHabitat` (`app/habitat.js`)**: Dual-canvas renderer (`floor` static layer + dirty-rect foreground `canvas`), 64-seat struct-of-arrays walker simulation, `Lane Manners`, errands/ceremonies, and adaptive frame governor (`30 / 20 / 15` fps).

---

## 3. Performance Architecture & Frame Budget Invariants

The LG CX runs Chromium 68 while decoding YouTube video underneath. To guarantee smooth 30 fps habitat rendering and zero main-thread tasks over ~30 ms in steady play:

1. **Serialized 500 ms Simulation Loop (`app/colony.js`)**:
   - The `simulationTimer` ticks every `500 ms` and executes **at most one** heavy operation per beat:
     ```text
     autoTick()  OR  payReward()  OR  persist() (every 15s)  OR  tickHalfSecond() (2 Hz)  OR  refresh() (1 Hz)
     ```
   - Full `refresh()` (`game.snapshot()` + DOM `render()` + `habitat.update()`) runs at **1 Hz** (`>= 900 ms`).
   - The alternate `500 ms` beat runs `tickHalfSecond()`, which calls `game.fastCounts(ids, now)` and updates only the cached `_strong` text nodes in `#resources` and `#census` with zero DOM queries or layout reads.
2. **Zero-Reify Fast Forage & Targeted Stat Cache Invalidation (`app/swarm/adapter.js`)**:
   - Spamming Red to forage in compact mode mutates `unittypes`, `unitRawCount`, `unitCount`, and `producerPathCoefficients[name][0]` in place and updates the DOM text node directly without calling `game.reify()` or `refresh()`.
   - `cache.onUpdate()` clears only count-dependent caches while preserving `stats`, `eachCost`, `eachProduction`, and `_capCache` across ticks and ordinary unit purchases; `cache.invalidateStats()` runs only when an upgrade or stat-affecting unit changes.
3. **Offscreen Canvas Pre-Rasterization & Dirty Rectangles (`app/habitat.js`)**:
   - Both `creatureImage` and `critterImage` are copied onto offscreen `<canvas>` elements (`creatureSheet`, `critterSheet`) on load so Chromium 68 blits canvas-to-canvas without re-decoding `HTMLImageElement` sources.
   - Walkers use pre-rotated 8-way canvas atlases (`bakeAtlas` + `stampDiagonal`) and `DX`/`DY` lookup tables instead of per-frame canvas transforms or trig.
   - All 64 seats live in pre-allocated typed arrays (`Uint8Array`, `Int8Array`, `Float32Array`, `Float64Array`); foreground rendering clears only `this.dirty` (`Int32Array(384 * 4)`).
4. **Signature-Gated DOM & Layout Reads**:
   - `getBoundingClientRect()` and `offsetWidth` are never called in steady-state ticks; `updateExclusions()` and `renderCensus()` check string signatures before measuring layout, and `focusByKey()` checks `document.activeElement` before querying the DOM.
5. **Art Normalization & Atlas Memory Budgets (`scripts/build/build-polish-art.py`, `scripts/build/build-creatures.py`, `scripts/build/build-critters.py`)**:
   - High-resolution generated source masters (`art/source/colony-polish-2026-10-21/*_source.png`, ~19 MiB decoded) are normalized offline by `scripts/build/build-polish-art.py` into binary-alpha (`0`/`255`), 16-color quantized native assets (`16×8` capsules, `32×32` control glyphs, `64×64` props/keepsakes/visitor frames, and `32px`/`48px` pivot-registered 4-frame acting strips).
   - Skyline bottom-left bin-packing in `scripts/build/build-creatures.py` packs all 34 walking and mini strips, 6 acting strips, 18 props, and 9 mote strips into a `448×606` sheet (`1,085,952` decoded RGBA bytes, down from `1,111,040` baseline bytes and well below the `1,228,800` byte cap).
   - `scripts/build/build-critters.py` packs all 247 static icons, props, keepsakes, and visitor animation frames into `1024×1024` (`877,622` base64 bytes, within the `900 KB` limit).
   - At 6× CPU throttling (`node scripts/dev/bench-habitat.cjs` with 64 entities, 10 nest movers, night shift, and golden roach), frame submission averages **`0.97 ms`** (`1.13 ms` flushed) and total baked atlas memory is **`3,604,992` bytes** (`3.44 MiB` vs `6.0 MiB` budget).

