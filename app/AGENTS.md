# `app/` Agent Instructions (TV Web App & Habitat Renderer)

This directory contains the installable webOS application (`com.phil.roachcolony`). All files in `app/` (except `app/swarm/source/`, `app/swarm/vendor/`, and `app/vivarium*`) are packaged into the TV IPK by `npm run package` and loaded directly via `<script>` tags in `app/index.html`.

## Target Runtime & Syntax Rules

- **Browser target**: **Chromium 68** (V8 6.8, webOS 5.6.2 on LG OLED55CXPUA).
- **Direct browser scripts (`app/*.js` except `app/engine.js`)**: Write in strict **ES5 IIFE** style (`(function (root, factory) { 'use strict'; ... })`) so they run identically in Chromium 68 without transpilation and can be `require()`d in Node tests (`npm test`).
- **Forbidden syntax in `app/*.js`**: No optional chaining (`?.`), nullish coalescing (`??`), logical assignment (`||=`, `&&=`), `Object.fromEntries`, `Array.prototype.flat` / `flatMap`, `String.prototype.replaceAll`, `globalThis`, `BigInt`, or ES module `import`/`export`.
- **`app/engine.js` is a generated artifact**: Never hand-edit `app/engine.js`. Edit `app/swarm/adapter.js` and run `npm run build`.

## Module Boundaries & Seams

1. **`app/theme.js` (`window.RoachTheme`)**:
   - Owns all Swarm Simulator → Roach Colony naming (`label`, `plural`, `upgradeLabel`, `achievementLabel`, `tabLabel`, `costText`, `text`, `effectText`, `upgradeText`) and all number/progress formatting (`short`, `whole`, `shortNumbers`, `compact`, `magnitude`, `partProgress`, `itemProgress`).
   - Do not duplicate regex number formatting or `Math.log10` string parsing in UI modules; call `RoachTheme`.
   - Never pass colony prose that already uses the word "nest" as a home (`"Ascend the colony?"`, `"The colony smells faintly of victory."`) through `theme.text()`, because `theme.text()` translates upstream `nest` to `brood mother`.

2. **`app/mechanics.js` (`window.RoachMechanics`)**:
   - Owns the visible-time chance schedule (`golden`, `visitor`, `intruder`, `chance`: `snack`, `egg`, `molt`, `dung`, and `night`), `Red Target` priority (`target()`, `redTarget()`, `redLabel()`, `goneMessage()`, `describeCatch()`), guest lifecycle dispatch (`step()`), and `Guest Feat` evaluation (`feats()`).
   - Whenever a catchable target is added or modified, update `TARGETS`, `GONE`, `redLabel`, and `describeCatch` here first, and keep `CATCHES` in `phone-controller/bridge.js` aligned.

3. **`app/save.js` (`window.RoachSave`)**:
   - Owns both the validated colony save (`phil_roach_colony_v2`, `_backup`, `_before_reset`, `_corrupt_*`) and all `Overlay Meta` keys (`phil_roach_colony_ui_*`).
   - Never read or write `window.localStorage` directly from `app/colony.js`; use `store.loadMeta()`, `store.saveMilestones()`, `store.saveVisitors()`, `store.saveCatches()`, `store.saveAuto()`, `store.saveLastPurchase()`, `store.saveLastAscension()`, `store.saveFlavorIndex()`, `store.flushJournal()`, and `store.clearMeta()`.
   - Preserve `RoachSession.ensureMetaStore(store, localStorage)` so browser tests that stub `window.RoachSave` with a minimal mock continue to work.

4. **`app/session.js`, `app/tv-shell.js`, `app/overlay-view.js`, `app/colony.js`**:
   - `app/session.js` (`RoachSession`): Pure, DOM-free policies (`chooseQuick` 4-tick hysteresis, `orderAutoBindings`, `validateControls`, `orderAchievements`, `pageIds`, `appendJournal`). Test changes directly in `tests/session.cjs`.
   - `app/tv-shell.js` (`RoachTvShell`): `PalmSystem` `needFocus` management (`createRemoteHold`), spatial D-pad focus (`createFocusController`, `nearestLine`, `scrollTabIntoView`), corner positioning (`positionCorner`), and burn-in pixel shift (`applyShift`).
   - `app/overlay-view.js` (`RoachOverlayView`): DOM creation helpers, segmented pixel bars, 3×5 bitmap `pixelText`, `magnitudeRank`, CSS moment tracker (`createFlashTracker`), and sprite icon cloning.
   - `app/colony.js`: Orchestrates the 500 ms serialized loop (`autoTick` → `payReward` → `persist` → `tickHalfSecond` at 2 Hz / `refresh` at 1 Hz) and exposes `window.colonyDiagnostics()`.

5. **`app/habitat.js`, `app/sprites.js`, `app/floor-baker.js`, `app/nest-art.js`, `app/motes.js`**:
   - `app/habitat.js` runs at 30 fps using 64 pre-allocated struct-of-arrays seats (`MAX_ROACHES = 64`), dirty-rectangle clearing on `this.canvas` over static `this.floor`, and pre-rasterized offscreen `<canvas>` sprite sheets (`creatureSheet`, `critterSheet`).
   - **Standalone test harness invariant**: `tests/habitat.cjs`, `tests/habitat-stress.cjs`, `scripts/dev/habitat-speed.cjs`, and `scripts/dev/bench-habitat.cjs` load `app/habitat.js` in an isolated page without `app/sprites.js` or `app/floor-baker.js`. Any delegation from `habitat.js` to `RoachFloorBaker` or `RoachSprites` must stay optional (`if (root.RoachFloorBaker) ...`), and `RoachHabitat.iconCanvas`, `iconFor`, `critterCanvas`, `redGlyph`, and `creaturesReady` must remain available on `RoachHabitat`.
   - Walkers must never move faster than `2.5×` their species walking speed between visible frames (`node scripts/dev/habitat-speed.cjs`).
