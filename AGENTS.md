# Roach Colony agent instructions

If `AGENTS.local.md` exists, read it first. It holds the owner's own rules and TV details and is not published.

## Documentation index

Before changing architecture, UI, balance, or controller code, read the relevant reference:

- [`docs/glossary.md`](./docs/glossary.md): Canonical domain glossary (`Dormant Opening`, `Main Chain`, `Territory Critter`, `Active-Time Policy`, `Snapshot`, `Batch Quote`, `Display Level`, `Quick-Buy Strip`, `Red Target`, `Chance Event`, `Guest Feat`, `Moment`, `Seat`, `Lane Manners`, `Trusted Slot Cache`, `Overlay Meta`).
- [`docs/design.md`](./docs/design.md): System topology, script load order, deep modules and seams, and TV/Chromium 68 performance invariants.
- [`docs/balance.md`](./docs/balance.md): Active-time economy adjustments (`applyActiveBalance`), chance event reward tables, optimal energy spending math, and milestone timings.
- [`docs/ui-spec.md`](./docs/ui-spec.md): Visual and interaction contract for the TV overlay, habitat, and phone controller.
- [`docs/naming.md`](./docs/naming.md): Swarm Simulator to Roach Colony translation table.
- Nested directory guides: [`app/AGENTS.md`](./app/AGENTS.md), [`app/swarm/AGENTS.md`](./app/swarm/AGENTS.md), [`phone-controller/AGENTS.md`](./phone-controller/AGENTS.md), [`tests/AGENTS.md`](./tests/AGENTS.md).

## TV and playback

- The game targets rooted LG webOS TVs; it is developed on a CX (webOS 5.6.2,
  Chromium 68). The TV scripts reach it through an `lgtv` SSH host alias, or
  `ROACH_TV_HOST` for telnet.
- Ask the TV's owner before installation, launch, close, remote remapping, or other
  actions that could interrupt what is playing. Read-only inspection is permitted.
- Never reboot the TV. On a Developer Mode root, rebooting can wipe homebrew.
  Do not restart Home or the compositor for this game.
- Installing an IPK does not authorize a test launch. Leave it closed for the
  player's own Blue press unless a launch has been explicitly approved.
- Do not change root telnet access, authentication, unrelated apps, or Home files.
  Use the root helper in `scripts/tv/tv.py` for Luna calls. Never commit
  credentials or live save dumps.
- `--playback-test-approved` records actual prior permission; it is not permission
  by itself. Never reset saves as part of a routine update.
- More has a **Reset progress** button for the player (spec in `docs/ui-spec.md`).
  Agents must never reset saves themselves, never press it in a session with a
  real colony, and never add a key, launch parameter or phone command that reaches it.
  Its colony is kept in `phil_roach_colony_v2_before_reset` (and the backup slot
  until the next save); restoring means pasting that text into Import. It does
  not touch the one-time reset receipt in `app/reset.js`.
- `scripts/tv/blue-toggle-fresh-start.sh` is a deliberately destructive, one-time
  variant. Use it only for an explicitly approved fresh start. Preserve its existing
  token and receipt behavior; changing the token can erase a player's new colony.

## Phone controller bridge

- `phone-controller/` runs on the TV's `/usr/bin/node` v8.12.0: no optional chaining,
  `??`, `fs.promises`, `globalThis` or ES modules, and no dependencies beyond
  Node's own modules. Run `ROACH_BRIDGE_NODE=<node 8.12> npm run test:controller`.
- The bridge relays only the listed colony operations. It must never run shell
  commands other than `luna-send` launching `com.phil.roachcolony`, never simulate
  the colony, and never write the colony save. Keep it LAN-only with Host/Origin,
  size and rate checks; the game socket stays on 127.0.0.1 behind the per-boot key.
- Phones never resume the colony; only an explicit Show does, and Show must stay
  idempotent. Blue keeps its toggle. Phone navigation never changes the TV menu.
- The boot script `phone-controller/init.d/70-roach-colony-controller` calls
  `phone-controller/run.sh start`, which supervises the bridge and also starts
  `phone-controller/inputhook-watchdog.sh`. The watchdog only re-injects the existing
  Input Hook into `lginput2` when that process restarts without it.
- Install or roll back only with approval through `scripts/tv/controller.py`. Rollback
  must leave the game, its saves and the reset receipt untouched.

## Product requirements

- The UI design contract and its priorities are in `docs/ui-spec.md`; read it
  before UI, habitat or phone work.

- Call it **Roach Colony**, never HDMI Nest.
- Keep controls transparent, legible from the couch, and near the bottom-right.
  Compact width is 480px; management width is 560px with four dense rows.
- Keep the center of the video clear. Roaches and territory occupy screen edges.
  Use bounded cached sprites, capped backing resolution, and adaptive frame rates.
  Increasing population must not create an unbounded number of sprites or timers.
- Progress advances whenever Blue has the game visible, including compact mode.
  Hiding/closing pauses production and achievement age. Reopening grants no offline
  growth. Intentional source time-boost abilities still work.
- Display whole roaches, hatchlings and crumb stock; preserve fractional Decimal
  production and save values internally. Never convert huge counts to JS Number.
- Show selected batch counts and costs, unit production rates (`+X/s`), and
  Territory stock on any pane where an unlocked item spends Territory. Unaffordable
  batches show the next single price. Hide Evolution and currency-dependent choices
  until relevant.
- Major milestones and first-unit explanations stay brief, local to the overlay,
  deduplicated, and quiet. No notifications while the game is hidden.
- Blue toggles globally. Red catches a golden roach, then an intruder, then an egg
  case, molting roach or dung beetle, then a visitor, and otherwise forages, Green
  repeats the last manual purchase, Yellow opens/cycles menus.
  Collapsed (compact) and Watch, keys 1–5 buy the quick picks chosen from live state
  (rule in `docs/ui-spec.md`); they reach the app through `colony-key.sh` like
  the colour keys, and do nothing in critters only. In compact and Watch, 6
  pauses auto-buy when a row is bound and otherwise repeats the last purchase,
  and 8 toggles Watch (hot bar only, quiet edge).
  In the menu, keys 1–4 buy visible rows, 5 toggles auto-buy and 8 details on
  the highlighted row, 6 cycles quantity, 7 jumps to the next goal's row, 9
  shows help, and 0 shows the hint, in compact too (Critters only has no key).
  Play/Pause controls automation and Stop clears it.
  Digits 0–9 reach the app through Input Hook bindings for Linux codes 11 and 2–10
  (`scripts/tv/blue-keybind.json`).
  Bind auto-buy to stable IDs, run only while visible, and wait quietly for funds.
  Movies (Visitors) and ellipsis (Achievements) wait in `shortcutKeys` in
  `app/colony.js` until their codes are identified; `unhandledKeys` in
  `colonyDiagnostics()` lists recent unclaimed key codes.

## Source and verification

- `app/swarm/source/` is pinned upstream Swarm Simulator source. Preserve it and
  the GPL/dependency notices. Adapt in `app/swarm/adapter.js`, not generated code.
- `npm run build` regenerates `app/engine.js`, `core.generated.js`, and table data.
  The browser target is Chromium 68; presentation scripts must work there too.
- Module ownership in `app/`:
  - `app/colony.js`, `app/session.js`, `app/tv-shell.js`, `app/overlay-view.js` own TV UI, session policies, remote focus, and DOM rendering.
  - `app/habitat.js`, `app/sprites.js`, `app/floor-baker.js`, `app/nest-art.js`, `app/motes.js` own canvas rendering, sprite atlases, and DOM icons.
  - `app/mechanics.js` owns visible-time chance events, Red target priority, and guest feats.
  - `app/save.js` owns engine save envelopes and overlay metadata persistence.
  - `app/reset.js` gates the one-time fresh-start reset receipt.
  - `app/theme.js` owns vocabulary translation, 3-sig-fig number formatting, and log10 cost progress.
  - `app/controller-link.js` owns the game-side phone controller WebSocket client.
- Keep routine saves cheap. Do not construct validation engines after every
  purchase. Validate imported/externally changed saves, debounce writes, and flush
  on Blue close and page exit. Preserve backups and explicit storage errors.
- Use `npm test` for engine/save/reset/theme/chance-schedule/session changes,
  `npm run test:browser` for UI and lifecycle changes, `npm run test:habitat` for
  renderer changes, `npm run test:nest` for nest art changes, and
  `npm run test:controller` for phone controller changes.
  Tests and previews must never contact the TV. Host timing is not TV evidence.
- `npm run test:browser` serves this checkout on an ephemeral local port.
- Keep temporary outputs in ignored `work/`, packages in ignored `dist/`, and
  install records in ignored `local/`.
- Commit completed changes on a feature branch. Do not change Git configuration.
