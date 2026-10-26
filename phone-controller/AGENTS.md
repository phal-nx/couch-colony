# `phone-controller/` Agent Instructions (TV Relay Bridge & Phone Controller SPA)

This directory contains two distinct runtime environments:
1. **The TV Relay Bridge** (`phone-controller/bridge.js`, `phone-controller/websocket.js`, `phone-controller/run.sh`, `phone-controller/inputhook-watchdog.sh`, `phone-controller/init.d/70-roach-colony-controller`).
2. **The Phone Web App** (`phone-controller/public/index.html`, `phone-controller/public/phone.js`, `phone-controller/public/phone.css`, `phone-controller/public/manifest.webmanifest`).

## 1. TV Relay Bridge Rules (`bridge.js` & `websocket.js`)

- **Runtime target**: The TV's built-in `/usr/bin/node` **v8.12.0** (V8 6.2).
  - Use strict ES5 (`'use strict'`, `var`, `function`).
  - Zero external npm dependencies (only built-in Node modules: `crypto`, `fs`, `http`, `os`, `path`, `child_process`).
  - Forbidden APIs: `fs.promises`, `Object.fromEntries`, optional chaining (`?.`), nullish coalescing (`??`), `globalThis`, `BigInt`, ES modules.
- **Security & Authority Invariants**:
  - The bridge is a stateless/cached relay. It **never** simulates the colony, **never** writes the colony save, and **never** executes shell commands other than `/usr/bin/luna-send` to launch `com.phil.roachcolony` on an explicit `show` command.
  - Validate `Host` and `Origin` headers on all phone HTTP and WebSocket requests (`hostAllowed`, `originAllowed`).
  - Accept the game page WebSocket connection (`:8643/game`) **only** from loopback (`127.0.0.1` / `::1`) with a valid 64-hex-char per-boot `key` from `/tmp/roach-colony-controller/game-key`.
  - Enforce operation whitelists (`OPS = ['forage', 'catch', 'buy', 'buyLast', 'auto', 'autoPause', 'ascend', 'respec', 'display', 'show', 'hide']`, `CATCHES = ['golden', 'intruder', 'egg', 'molt', 'dung', 'visitor']`). **Never** allow `reset` or `resetProgress` over the bridge.
  - Opening or reconnecting a phone must **never** launch or resume a hidden colony; only an explicit `show` command does, and `show` must be idempotent when the colony is already open.

## 2. Phone Web App Rules (`phone-controller/public/`)

- **Shared Theme**: `bridge.js` serves `app/theme.js` at `/theme.js` (and `scripts/tv/controller.py` bundles `app/theme.js` into `public/theme.js`). Use `window.RoachTheme` (`compact`, `magnitude`, `partProgress`, `itemProgress`) rather than duplicating number or log-10 progress math in `phone.js`.
- **Layout & Touch Targets**:
  - Must render with zero horizontal overflow at `375×812` and `390×844` viewports (`tests/controller.cjs` verifies `scrollWidth <= innerWidth` across every screen and sheet).
  - Interactive buttons in `phone.js` must maintain a bounding box height of at least `36 px` (and `>= 44 px` for primary touch targets) as audited by `tests/controller.cjs`.
  - Destructive or major progression actions on the phone (`Forget` paired phone, `Ascend`, `Respec`) require a two-tap confirmation (`Confirm forget`, `Confirm ascend`, `Confirm respec`).
- **Verification**:
  - Run `npm run test:controller` after any change to `phone-controller/`, `app/controller-link.js`, or `app/theme.js`.
