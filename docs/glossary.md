# Roach Colony

A transparent idle game overlay for a rooted LG webOS TV (`com.phil.roachcolony`) with a LAN phone controller bridge. The economy is adapted from the pinned GPL-3.0 Swarm Simulator engine; visible-time chance mechanics, cutaway nest progression, and edge-hugging roach simulation live beside it.

## Language

### Economy & Progression

**Dormant Opening**:
The initial state of a brand-new colony where stock is zero and the hatchery produces nothing until the player manually forages and makes a first purchase.
_Avoid_: tutorial lock, cold start, sleep mode

**Main Chain**:
The 20-tier brood lineage (`drone` / Forager roach through `overmind6` / Overmind VI) where each tier produces the tier below it and costs both Crumbs and the lower tier to hatch.
_Avoid_: meat units, brood tree, primary units

**Territory Critter**:
One of the 11 allied household pest species (`swarmling` / Silverfish through `goon` / Rhino beetle) that capture Territory to fund Crevice expansions.
_Avoid_: military unit, warrior, army unit

**Active-Time Policy**:
The clock rule under which production, achievement age, and chance schedules advance only while the colony overlay is visible on the TV, granting zero offline progress while hidden.
_Avoid_: online-only clock, foreground timer

**Snapshot**:
A point-in-time read projection returned by `Game.prototype.snapshot` containing formatted stock, unit/upgrade batch quotes, achievements, quick-buy candidates, and prestige state.
_Avoid_: state dump, view model, game state

**Batch Quote**:
The pre-computed affordability, capped unit gain (including twins), and total cost for a requested purchase quantity (`1`, `10`, `max`, or `share`).
_Avoid_: price check, cost estimate

### Controls, Guests & Overlay

**Display Level**:
One of the five presentation states of the TV app: `menu`, `compact`, `watch`, `critters`, or `hidden` (plus the orthogonal `standalone` terrarium floor mode).
_Avoid_: view mode, screen state, layout mode

**Quick-Buy Strip**:
The compact 5-slot hot bar (`keys 1–5`) beneath the census that stabilizes live candidate picks across refreshes with 4-tick hysteresis (`QUICK_SETTLE`) and shows a segmented fill bar or affordable batch badge.
_Avoid_: shortcut bar, action bar, hotkeys

**Red Target**:
The highest-priority catchable entity currently on screen for the Red button and phone Forage button (`golden` → `intruder` → `egg` / `molt` / `dung` → `visitor`), falling back to manual forage when none is present.
_Avoid_: catch target, clickable event, active bonus

**Chance Event**:
A visible-time habitat occurrence scheduled by `RoachMechanics` (snack drop, egg case, molting roach, or dung beetle) that never overlaps a golden roach or intruder.
_Avoid_: random spawn, mini-game, world event

**Guest Feat**:
A colony-side achievement (`colony:guests1`, `colony:golden1`, `colony:intruder1`, etc.) evaluated from the visitor log and catch tallies outside the upstream Swarm Simulator achievement table, contributing bonus achievement points to the engine.
_Avoid_: custom achievement, overlay badge

**Moment**:
A brief, bounded (≤ 600 ms, whole-pixel stepped) visual feedback animation in the overlay (purchase pop, order-of-magnitude stamp, achievement medal seal, or new-tier reveal) that never runs while hidden or in critters-only level.
_Avoid_: particle effect, UI transition, flair

**Pinned Quick Pick**:
An optional player-reserved quick-buy slot (`slot 0` on `#quick`) bound to a stable unit or upgrade ID (`pinnedQuick`) that bypasses 4-refresh hysteresis while keeping live affordability, progress, and batch gain badges.
_Avoid_: locked shortcut, custom macro

**Save-Toward Reserve**:
An optional player-selected unit or upgrade target (`reserveTarget`) whose single-purchase cost is protected against being spent by `autoBuy` until the reserved target itself is purchased or cleared.
_Avoid_: resource lock, budget cap

**Event Choice**:
An optional non-punitive alternative resolution for an active catchable habitat event (`egg`, `molt`, `dung`), such as incubating an egg case or fortifying turf, offered in the menu (`Field ops`) and on the phone while leaving Red as the immediate default.
_Avoid_: branching quest, QTE

**Scout Expedition**:
An optional visible-time errand (`pantry`, `baseboard`, `cellar`) dispatched from `Field ops` or the phone controller using an existing-seat habitat caravan, paying out resources or a visitor sighting when visible play time completes.
_Avoid_: idle mission, background timer

**Keepsake**:
A cosmetic pixel-art curio (`keepsake_beetle_shell`, `keepsake_cricket_shell`, `keepsake_moth_stone`, `keepsake_snail_shell`) unlocked by visitor and catch milestones and placed beside the cutaway nest or on the standalone terrarium floor.
_Avoid_: trophy item, equippable gear

### Habitat & Rendering

**Seat**:
One of the 64 fixed indices in `RoachHabitat`'s struct-of-arrays entity pool, occupied by a lane walker, errander, ceremony participant, or temporary event prop.
_Avoid_: entity object, actor, sprite instance

**Lane Manners**:
The single-pass sorted-neighbor rules governing walker spacing, doorway queueing, head-on greetings, crumb handoffs, and yielding to higher tiers along the screen bezel.
_Avoid_: collision avoidance, pathfinding, steering

### Persistence & Controller

**Trusted Slot Cache**:
The per-key record in `RoachSave.Store` remembering the exact JSON text last validated or written to `localStorage`, allowing routine saves and backup rotations to skip spinning up a second validation `Game` instance.
_Avoid_: save memo, dirty flag

**Overlay Meta**:
The persisted UI and guest state stored alongside the engine save (visitor sightings log, golden/intruder catch tallies, seen milestone IDs, auto-buy bindings and pause state, last manual purchase, last ascension reward baseline, and bounded crash/event journal).
_Avoid_: local prefs, UI settings, session storage
