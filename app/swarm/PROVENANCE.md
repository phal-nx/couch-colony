# Swarm Simulator core port

The gameplay implementation is compiled from the GPL-3.0 Swarm Simulator
CoffeeScript services at commit
`06b4f404aa324a0b454348508cfa63d5c0f1ff54`:
https://github.com/erosson/swarm/tree/06b4f404aa324a0b454348508cfa63d5c0f1ff54

The archive was retrieved using `gh api repos/erosson/swarm/tarball/COMMIT`.
The original service files under `source/` remain unmodified. They implement
units, all production paths, upgrades, effects, deterministic random rewards,
achievements, tabs, statistics and commands. The generated bundle contains
58 unit definitions, 88 upgrade definitions and 121 achievement definitions.
The meat chain includes pantheon through pantheon V and overmind through
overmind VI (original identifier `overmind6`). Territory units, energy
abilities, mutation units and mutation unlocks retain original identifiers.

`source/tables/` contains the complete pinned `tables/src` tree. The build
runs its original spreadsheet encoder against its authoritative unit,
upgrade and achievement data, matching the upstream application's
`swarmSpreadsheetPreload2` integration. It does not use the older checked-in
`v0.2.js` preload or fetch the historical Google spreadsheet. Original
upgrade description templates and service test sources are supplied in
`source/views/` and `source/upstream-tests/` for reference. The original
Angular test suite has not been represented as passing in this standalone
facade; the adapted tests are `tests/swarm-engine.cjs` in the deliverable.

## Tutorial hints

`source/directives/tutorial.coffee` is the original web UI's tutorial directive,
`swarmsim-coffee/app/scripts/directives/tutorial.coffee` at the same pinned commit,
retrieved unmodified with `gh api repos/erosson/swarm/contents/PATH?ref=COMMIT`. It is
an Angular view and is not compiled into the bundle. `adapter.js` ports its message text
(links and markup reduced to their words) and the conditions that choose a step, and
returns them only for a snapshot requested with `includeHint`. Upstream remembers the
first mutagen spawn and the first ascension for one browser session; the port uses
pending mutagen and a first ascension with no mutation unlocked instead. Where upstream
falls silent (five or more expansions before mutagen, and later ascensions) the port
adds three steps of its own for the nexus, energy and later ascensions. The overlay's
theme then renames the swarm's words and rewrites sentences that named the web game's
screens.

## Standalone adaptations

`adapter.js` supplies an explicit dependency registry in place of Angular,
a scoped logical clock, a no-storage session, a small event bus and a factorial
helper. Original commands still emit statistics and achievement events in the
original order. The build records dependency names before minification.
Legacy undo storage, account synchronization, payments and Kongregate reporting
are inert and unavailable through the public API. No network requests are
required. The manual forage adaptation awards at least one crumb or one second of current
meat production per click, whichever is greater, capped at the engine unit limit.
Its 150ms repeat guard is saved with the logical clock.
The visible-play option `new Game({now, activeTimeOnly:true})` starts paused.
`resume(now)` and `pause(now)` separate wall-clock anchors from source logical
dates. Hidden time and reopening a saved session do not accrue production.
The optional v2 `timePolicy` field persists this behavior; importing such a save
always starts paused. Original offline behavior remains available to legacy
callers without the option. Intentional source time-boost abilities still work.
Snapshots accept optional selected quantity, tab and item-kind filters, plus
resource-only and achievement-free modes. Purchase quotes use the source
affordability and geometric price calculations, including twins and partial
batches. One-level quotes reuse the source total price. Compact snapshots skip
purchase quotes and achievement descriptions, and carry only cheap milestone
metadata. Presentation omits actions whose required currency is still hidden.
Crumb and biological stock display uses whole units; fractional source production
and saved Decimal values remain intact. Exact large quote counts use bounded
scientific notation with separate compact labels.
Presentation descriptions translate the original template meanings
into plain text; production and purchasing arithmetic remains upstream code.

The adapter validates complete candidate states before replacement, preserves
Decimal strings and date anchors, clamps backward clock changes, rejects
impossible discrete counters and invalid metadata, and verifies that imported
states can produce a usable snapshot. The hidden `mutatehidden` accounting
upgrade is never offered as a player action. Upgrade Max batches exceeding
1,000 levels reject explicitly and ask the player to use quantity 10, preventing
an unbounded original per-level effect loop from blocking the TV UI.

Seven original achievements require UI events from the original web game:
`changelog`, `import`, `clickme`, `konami`, `debug`, `publictest1` and
`therightquestion`. Their definitions and existing earned state are preserved;
they are excluded from the player-facing achievement list because this overlay
does not implement those original UI event triggers. The remaining
114 definitions use ordinary unit, upgrade or ascension progression.

## Runtime dependencies

Sources are vendored under `vendor/`; license texts are in `../licenses/`:

- Decimal.js 7.1.1, MIT. https://github.com/MikeMcl/decimal.js
- Lodash 4.17.21, MIT. https://github.com/lodash/lodash
- Moment 2.17.1, MIT. https://github.com/moment/moment
- Seedrandom 2.4.2, MIT. https://github.com/davidbau/seedrandom

Lodash uses the upstream repository's tables dependency version, which is a
patch update from the CoffeeScript package's 4.17.10. Seedrandom's core
`seedrandom.js` is sufficient for the original `Math.seedrandom` API; unused
alternative generators are excluded. Moment's original source is preserved
as `moment-original.js`; the build creates `moment.js` with only the dynamic
locale-loading statement removed. English locale and original duration/time
math remain. Decimal uses upstream's default 20 significant digits and
`1e100000` unit limit, with exact string serialization instead of JavaScript
Number conversion.

## Rebuild

From the `roach-colony` deliverable directory, using Node.js and npm:

```sh
npm ci --prefix scripts/build/engine-build
node scripts/build/build-engine.cjs
node --test tests/swarm-engine.cjs
```

The exact build dependency lockfile accompanies the source in
`scripts/build/engine-build/package-lock.json`. Build-time TypeScript table conversion
uses pinned io-ts and fp-ts; these are not runtime dependencies. Compiled
`core.generated.js`, `data.generated.json` and the Chromium 68-compatible
`app/engine.js` are reproducible generated files. The generated runtime bundles
all dependencies locally and exposes only `SwarmEngine.Game` and read-only
format/source metadata; it contains no currency-granting API.
