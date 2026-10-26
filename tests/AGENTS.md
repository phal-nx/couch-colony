# `tests/` Agent Instructions (Test Suites & Verification Harnesses)

All tests in Roach Colony run locally in Node.js (`>= 20`) and headless Google Chrome via Playwright. **Tests must never contact the TV (`192.168.1.86`).**

## Test Suites & When to Run Them

| Command | Files Executed | What It Verifies |
| :--- | :--- | :--- |
| `npm test` | `tests/swarm-engine.cjs`<br>`tests/save.cjs`<br>`tests/reset.cjs`<br>`tests/theme.cjs`<br>`tests/mechanics.cjs`<br>`tests/session.cjs` | Fast headless Node unit tests (~2s total): engine polynomial math, active-time clock, batch quotes, `quickSlots`, `nextGoal`, `tutorial` hints, save validation & `Overlay Meta`, reset token receipt, theme translations & log10 math, chance event scheduling & `Red Target` descriptors, and `RoachSession` hysteresis/auto-buy/achievement policies. |
| `npm run test:browser` | `tests/run-browser.cjs` running:<br>1. `tests/browser.cjs`<br>2. `tests/ui-moments.cjs`<br>3. `tests/menu-overflow.cjs`<br>4. `tests/reset-progress.cjs`<br>5. `tests/ui-stress.cjs`<br>6. `tests/census-fit.cjs`<br>7. `tests/opening.cjs`<br>8. `tests/hint.cjs` | Full-page Playwright verification against an ephemeral local HTTP server: compact/watch/critters/standalone levels, spatial D-pad navigation, quick-buy strip, chance events & Red catches, zero sideways overflow on stretched late-game names, census fit within the 480px footprint, Dormant Opening, and key 0 hints. Pass specific files to run a subset: `node tests/run-browser.cjs tests/browser.cjs tests/census-fit.cjs`. |
| `npm run test:controller` | `tests/controller.cjs` | Spawns `phone-controller/bridge.js`, headless Chrome for the TV game page (with fake `PalmSystem` and `luna-send`), and mobile viewports (`375×812`, `390×844`) over real HTTP + WebSocket. Checks pairing, idempotency, concurrency, reconnects, touch target bounds, and zero horizontal overflow. |
| `npm run test:habitat` | `tests/habitat.cjs`<br>`tests/habitat-stress.cjs` | Standalone canvas verification at 1080p and 4K plus multi-seed overlap stress testing of all 64 seats, lane manners, errands, guests, and ceremonies. |
| `npm run test:nest` | `tests/nest-art.cjs` | Verifies 6-stage cutaway nest baking, upgrade overlays, and interior tunnel/chamber polylines. |
| `node scripts/dev/habitat-speed.cjs` | `scripts/dev/habitat-speed.cjs` | Audits frame-to-frame walker displacements across mid and late colonies to ensure no drawn roach steps faster than `2.5×` its species walking speed. |

## Important Test Harness Conventions

1. **Mock Engine & Save Routes in Browser Tests**:
   - `tests/browser.cjs`, `tests/ui-moments.cjs`, `tests/ui-stress.cjs`, and `tests/census-fit.cjs` intercept `**/engine.js` and `**/save.js` via `page.route(...)` in several scenarios to inject deterministic mock snapshots and minimal `RoachSave.Store` stubs.
   - Any new method called by `app/colony.js` on `game` or `store` must either degrade gracefully when absent (`typeof game.fastCounts === 'function'`) or be provided by `RoachSession.ensureMetaStore(store, localStorage)`.
2. **Isolated Habitat Harnesses**:
   - `tests/habitat.cjs` and `tests/habitat-stress.cjs` inject only `nest-sprites.js`, `nest-art.js`, `critters.js`, `creature-sprites.js`, `motes.js`, and `habitat.js` into a blank page. `app/habitat.js` must not hard-require globals from `app/colony.js`, `app/theme.js`, or `app/sprites.js` without a fallback.
3. **Diagnostic Surface (`window.colonyDiagnostics()`)**:
   - Browser tests inspect internal overlay and habitat state through `window.colonyDiagnostics()`. Preserve all existing keys on its returned object when refactoring `app/colony.js` or `app/habitat.js`.
