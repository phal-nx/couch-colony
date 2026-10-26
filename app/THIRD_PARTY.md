# Third-party notices

Version 0.2.0 uses the GPL-3.0 game engine and progression tables from [Swarm Simulator](https://github.com/swarmsim/swarm/tree/06b4f404aa324a0b454348508cfa63d5c0f1ff54), pinned revision `06b4f404aa324a0b454348508cfa63d5c0f1ff54`. The hint card's tutorial messages and the conditions that choose them are derived from the same revision's web UI tutorial directive, `swarmsim-coffee/app/scripts/directives/tutorial.coffee`, included unmodified as `swarm/source/directives/tutorial.coffee` and ported in `swarm/adapter.js`. Original source, the adapter, generated files, and provenance are included under `swarm/`; the GPL license and dependency notices are included under `licenses/`. The modified application is supplied under GPL-3.0, with retained third-party notices.

The earlier 0.1 prototype used [Felix Orinda's canvas-games](https://github.com/forinda/canvas-games), commit `8dcbd8991c01f98d947f964483f5ed22ca77c7ad`. That three-upgrade engine has been replaced. Its MIT notice is retained for the prototype lineage: Copyright (c) 2026 Felix Orinda, `licenses/canvas-games-MIT.txt`.

The webOS manifest overlay configuration is based on [Webos-EARC-Volume-Overlay](https://github.com/Nikolay1243/Webos-EARC-Volume-Overlay), commit `02b2fa2711ca574732cdfb740d1cf50b75a827cd`. Copyright (c) 2026 eARC Volume Overlay contributors. MIT license in `licenses/webos-overlay-MIT.txt`.

The colony presentation, Canvas artwork, remote controls, test tooling and adaptations were created for this personal TV prototype. No images, fonts, sound or other game assets are taken from the evaluated games.

The phone controller pairing code is drawn with [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4, `qrcode.js`, unmodified from the npm package. Copyright (c) 2009 Kazuhiko Arase. MIT license in `licenses/qrcode-generator-MIT.txt`. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

The critter icons in `critters.js` (the roach castes, the unit insects, the visitors and the resource, upgrade and meta icons) come from native 64 px pixel art sheets made by Phil Leonowens, the owner of this project, kept in `art/sheets/` and used with his permission. `scripts/build/build-critters.py` packs them without resampling; `docs/review/critters.png` is the resulting atlas.

The nest in `nest-sprites.js` (six growth stages and the egg, crumb, nexus, pennant and annex overlays) is pixel art Phil Leonowens generated with Codex for this project, kept in `art/nest/` and used with his permission. `scripts/build/build-nest.py` packs it and traces the tunnels the colony walks inside it into `art/nest/paths.json`.
