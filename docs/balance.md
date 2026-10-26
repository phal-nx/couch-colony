# Roach Colony economy and active-play balance

This document records how Roach Colony adapts the pinned upstream Swarm Simulator economy (`06b4f404aa324a0b454348508cfa63d5c0f1ff54`) for an **active-time TV overlay** where time advances only while the game is visible on screen (`Active-Time Policy`, zero offline progress).

---

## 1. Core Balance Philosophy

Upstream Swarm Simulator was tuned for multi-day background/offline play, where a first ascension takes roughly 190 hours of wall time. Because Roach Colony pauses whenever hidden with Blue and grants zero offline catch-up:
1. **Early progression (Minutes 0–45)** keeps upstream's tight feedback loop after a Cookie Clicker-style **Dormant Opening**.
2. **Mid-to-late tiers, Crevices, Nexuses 4–5, Mutagen gates, and Ascension cost (`applyActiveBalance` in `app/swarm/adapter.js`)** are pulled in so a first ascension lands around **14–17 visible hours** (with engaged active play and upgrades) and **~25–30 visible hours** without unit upgrades.
3. **Visible-time chance mechanics (`app/mechanics.js`)** reward couch attention (Red button catches, Intruder repels, Night shift) with bounded seconds of current production without ever punishing idle watching.

---

## 2. Dormant Opening (`app/swarm/adapter.js`)

A brand-new colony starts with `0` Crumbs (`meat`), `0` Hatchlings (`larva`), and `opening: {dormant: true, forages: 0}`:
- While `opening.dormant` is `true`, `invisiblehatchery`'s `prod` stat is held at `0`, so nothing grows on its own and no guests or chance events spawn.
- Each manual forage (`Red`, phone `Forage`, or menu) grants **`1` Crumb**, and **every 2nd forage** (`(forages + 1) % 2 === 0`) also grants **`1` Hatchling**.
- After **10 presses** (`10` Crumbs, `5` Hatchlings), the player can buy their first **Forager roach** (`drone`, cost: `10` Crumbs + `1` Hatchling).
- The first purchase calls `wakeNest(r)`, permanently setting `opening.dormant = false` and starting the hatchery's base `1` Hatchling/s output from that instant with no catch-up.
- Ascending (`ascend`) never puts the colony back to sleep (`hasProgress(state)` is true whenever any unit, upgrade, mutagen, or ascension is owned), so post-ascension runs start awake with upstream's `35` Crumbs and `10` Hatchlings.

---

## 3. Active-Time Economy Adjustments (`applyActiveBalance`)

Applied in `app/swarm/adapter.js` whenever `activeTimeOnly: true` is active:

| Parameter | Upstream Swarm Simulator | Roach Colony (`activeTimeOnly`) | Reason |
| :--- | :--- | :--- | :--- |
| **Main-chain tiers 1–4** (`drone`..`greaterqueen`) | Base costs & output | Unchanged | Preserves the classic opening and first 45 minutes |
| **Main-chain tiers 5–20** (`hive`..`overmind6`) lower-tier unit sacrifice cost | `1.0×` spreadsheet cost | Tier 5: `0.40×`<br>Tier 6: `0.35×`<br>Tier 7: `0.30×`<br>Tier 8+: `0.25×` | Prevents multi-day promotion walls without offline time |
| **Main-chain tiers 5–20** production output | `1.0×` spreadsheet output | **`1.4×`** per tier | Accelerates polynomial cascade across deep tiers |
| **Crevice (`expansion`)** territory cost factor | `×2.9` per level | **`×2.3`** per level | Allows Crevices to reach level 48+ within ~6–8 visible hours |
| **Territory Critter Twin (`*twin`)** hatchling cost factor | `×50` per level | **`×35`** per level | Keeps allied critter twin upgrades affordable alongside main-chain twins |
| **Nexus (`nexus`)** base energy output | `0.1` energy/s per nexus | **`0.2`** energy/s per nexus | Doubles base energy generation (`1.0/s` at 5 nexuses before Moths/mutations) |
| **Nexus 4 (`nexus4`)** price | `1e8` larva, `15,000` energy | **`1e7` (10M)** larva, **`7,500`** energy | Unlocks Moths (`moth`) mid-run |
| **Nexus 5 (`nexus5`)** price | `1e27` meat, `1e9` larva, `30,000` energy | **`1e23`** meat, **`5e7` (50M)** larva, **`18,000`** energy | Unlocks Bats (`bat`, `+60%` ability power) before first ascension |
| **Pending Mutagen (`premutagen`)** minimum level gates | Egg chamber (`hatchery`): `40`<br>Crevice (`expansion`): `80` | Egg chamber (`hatchery`): **`30`**<br>Crevice (`expansion`): **`48`** | Unlocks pending mutagen around 6–8 visible hours |
| **Ascension energy cost (`ascendCost`)** | \( 5{,}000{,}000 \cdot 1.12^A \cdot 2^{-S / (50000 \cdot M)} \) | \( \lceil 400{,}000 \cdot 1.12^A \cdot 2^{-S / (8000 \cdot M)} \rceil \) | Scales for ~50k–70k total energy generated in a first active run |
| **Manual Forage (`act('forage')`)** | Not in upstream | \(\max(1, \text{meat.velocity()}) \cdot (1 + 0.05 \cdot \text{crevice})\) | Gives Red button spam a scaling crumb return |

*(Above, \(A\) is ascension count, \(S\) is `ascendEnergySpent()`, and \(M\) is `mutagen.stat('ascendCost', 1)`.)*

### Optimal Energy Spending Before Ascension
Because \( C(S) = 400{,}000 \cdot 1.12^A \cdot 2^{-S / 8000} \), total energy required to ascend \( E_{\text{total}}(S) = S + C(S) \) is minimized when:
\[
\frac{dC}{dS} = -1 \implies C^*(S) = \frac{8000}{\ln 2} \approx \mathbf{11{,}542\text{ energy}}
\]
Every energy point spent on **Nexus 2–5**, **Fireflies (`nightbug`)**, **Moths (`moth`)**, **Bats (`bat`)**, and **Energy abilities (`larvarush`, `swarmwarp`, `meatrush`, `territoryrush`)** counts toward \(S\) (`Unit.prototype.spent` sums all unit and upgrade energy expenditures). Spending energy down until `ascendCost` reaches `~11,500–12,500` (rather than stopping as soon as `ascendCost` drops below the `30K–50K` energy cap) saves roughly 3 hours on the first ascension.

---

## 4. Chance Events & Active Rewards (`app/mechanics.js` & `adapter._reward`)

All chance events run on visible time only, pause while hidden, and never spawn while the nest is dormant. Rewards are paid through `game.act({type: 'reward', resource, seconds})` as:
\[
\text{reward} = \lfloor \text{unit.velocity()} \times \min(3600,\ \text{seconds} \times (1 + 0.01 \times \text{crevice})) \rfloor
\]

| Event | Cadence (Visible Time) | Red Catch Priority | Active (Red) Reward | Passive (Uncaught / Hauled) Reward |
| :--- | :--- | :--- | :--- | :--- |
| **Golden roach** | Every `10–20 min` (waits until caught or hidden; never overlaps a habitat event) | **1st** (`golden`) | **`300s` Crumbs + `120s` Hatchlings** | None |
| **Intruder** (`spider` / `centipede`) | Every `12–22 min` once Territory critters > 0; stays `14–18s` (never overlaps a habitat event) | **2nd** (`intruder`) | **Repel**: \(\min(600, \text{round}((140 + 50 N_{\text{terr}})(1 + 0.15 \lfloor \text{crevice}/10 \rfloor)))\text{s}\) Territory + **`60s` Hatchlings** (+ **`30s` Energy** once Energy is unlocked) | **Retreat**: \(\min(600, 80 + 40 N_{\text{terr}})\text{s}\) Territory |
| **Egg case** (`egg`) | Part of Habitat Event pool (`10–20 min`, `60–90s` on screen) | **3rd** (`egg`) | **`120s` Hatchlings** | Hauled into nest by 2 carriers after `60–90s`: **`35s` Hatchlings** |
| **Molting roach** (`molt`) | Part of Habitat Event pool (`10–20 min`, `45–60s` on screen) | **3rd** (`molt`) | **`45s` Crumbs** | Walks off after `45–60s`: None |
| **Dung beetle** (`dung`) | `22%` of Habitat Events once Territory critters > 0 (`35–45s` on screen) | **3rd** (`dung`) | **`180s` Territory + `60s` Crumbs** | Reaches claim post after `35–45s`: **`90s` Territory** |
| **Snack drop** (`snack`) | Part of Habitat Event pool (`10–20 min`, `30s` on screen) | Not catchable by Red | N/A (foragers shuttle pieces automatically) | Hauled home after `30s`: **`90s` Crumbs** |
| **Visitor** | Every `3–6 min`, stays `40–55s` (`60%` common, `30%` uncommon, `10%` rare) | **4th** (`visitor`) | **Common**: `60s` Crumbs (1st) / `25s` (repeat)<br>**Uncommon**: `120s` Crumbs + `45s` Hatchlings (1st) / `50s` + `20s` (repeat)<br>**Rare**: `240s` Crumbs + `90s` Hatchlings + `45s` Energy (1st) / `100s` + `40s` + `20s` (repeat) | Wanders off after `40–55s`: None |
| **Night shift** | `22:00–06:00` local TV clock | Automatic | N/A | **`12s` Crumbs** every `2 visible minutes` (`+10%` base crumb rate) |

### Guest Feats & Accomplished Ancestry
`RoachMechanics.feats(slugs)` awards up to **8 Guest Feats** (`guests1`, `guests10`, `guestscommon`, `guestsall`, `golden1`, `golden10`, `intruder1`, `intruder5`). Each earned Guest Feat contributes **10 achievement points** via `game.setBonusAchievementPoints(earned * 10)`, directly boosting the **Accomplished ancestry** (`achievementbonus`) larva production multiplier.

---

## 5. Automation (`autoBuy`) & Quick-Buy (`quickSlots`) Pacing Rules

1. **Auto-Buy Share & Larva Hold (`app/swarm/adapter.js` & `app/session.js`)**:
   - Auto-buy ticks every **2 seconds** while visible (`!closed && !document.hidden && !autoPaused && dialog.hidden`).
   - Bindings are ordered highest unit tier first, with upgrades after units, rotating the starting cursor by 1 after each purchase.
   - Each purchase spends at most a **10% share** (`SHARE = 0.1`, at least 1 unit; at most 10 upgrade levels) so one tick never empties stock needed by a higher tier.
   - **Larva Hold & Save-Toward Reserve Rules**:
     - If an earlier bound upgrade in the rotation (`nexus3..5`, `*twin`) already has all non-`larva` costs met and is only waiting on `larva`, `autoBuy` sets `holdLarva = true` and skips later bindings that cost `larva` so unit auto-buy cannot cap banked hatchlings below the upgrade's threshold.
     - If the player marks a **Save-Toward Reserve** target (`reserve = {kind, id}`), `autoBuy` protects that target's single-purchase cost requirements (`reserveNeeds`) and only spends surplus stock above the reserved threshold (buying the reserved target itself immediately if it is bound and affordable).
2. **Quick-Buy Strip Candidates & Pinning (`quickSlots` in `app/swarm/adapter.js` & `chooseQuick` in `app/session.js`)**:
   - **Pinned Quick Pick (`pinnedQuick`)**: When the player pins a favorite unit or upgrade, it occupies **Slot 1 (`picks[0]`)** with live affordability, progress, and batch gain badges, bypassing 4-refresh hysteresis while deduplicating Slots 2–5.
   - **Slot 1 (Goal)**: `nextGoalTarget` unit/upgrade, then the next unowned main-chain tier (`MAIN_CHAIN[top + 1]`).
   - **Slot 2 (Top Roach)**: Main-chain roaches, affordable highest-tier first, then by progress.
   - **Slot 3 (Upgrade)**: Ordinary upgrades for owned units (plus the next unbuilt `nexus1..5` at `tier: 200`), affordable highest-tier first, then by progress. Never includes upgrades for unowned unit tiers (`count === 0`).
   - **Slot 4 (Expansion)**: `expansion` (Crevice), best territory `*twin`, best `Territory Critter`, and `hatchery` (Egg chamber), sorted by affordability and progress.
   - **Slot 5 (Ready Burst or Next Pick)**: An affordable energy ability (`larvarush`, `swarmwarp`, `meatrush`, `territoryrush`) unless a visible `nexus2..5` has its non-energy costs met and is saving energy; otherwise falls back to the next unused candidate from Slots 2–4.
3. **Optional Event Choices & Scout Expeditions (`app/mechanics.js`)**:
   - **Event Choices (`choice()` / `chooseOption('nursery')`)**: While an `egg`, `molt`, or `dung` habitat event is active, Red keeps its immediate default catch (`+120s` hatchlings / `+45s` crumbs / `+180s` territory + `+60s` crumbs), while `Field ops` (TV `More → Field ops` and Phone) offers a non-punitive alternative:
     - `egg` (**Incubate**): `+75s` Hatchlings and `+75s` Crumbs.
     - `molt` (**Study shell**): `+45s` Hatchlings and `+30s` Crumbs.
     - `dung` (**Fortify turf**): `+240s` Territory.
   - **Scout Expeditions (`startExpedition(id)`)**: Optional visible-time caravan errands (never advancing while hidden):
     - `pantry` (**Pantry recon**, `90s` visible time): `+120s` Crumbs + `+45s` Hatchlings.
     - `baseboard` (**Baseboard survey**, `120s` visible time): `+150s` Territory + `+60s` Crumbs (or `+150s` Crumbs before Territory unlocks).
     - `cellar` (**Deep pipe trek**, `150s` visible time): `+120s` Hatchlings + `+35s` Energy (when Energy is unlocked) + logs a visitor discovery.

---

## 6. Milestone Timing Reference (`node scripts/dev/simulate-balance.cjs`)

Typical active-time progression from a fresh Dormant Opening (`t = 0`):

| Milestone | Passive (Upgrades, 0% Catch) | Casual Active (40% Catch) | Engaged Active (85%+ Catch) |
| :--- | :--- | :--- | :--- |
| **Wake nest (`drone` >= 1)** | `5s` (after 10 forages) | `5s` | `5s` |
| **First Egg chamber (`hatchery` 1)** | `~1m` | `~1m` | `~55s` |
| **First Nest queen (`queen` 1)** | `~1m 45s` | `~1m 45s` | `~1m 35s` |
| **Territory & first Silverfish (`swarmling` 1)** | `~3m 15s` | `~3m 05s` | `~3m 05s` |
| **First Crevice (`expansion` 1)** | `~3m 55s` | `~3m 25s` | `~3m 25s` |
| **First Brood mother (`nest` 1)** | `~10m` | `~9m 35s` | `~9m` |
| **First Colony matriarch (`greaterqueen` 1)** | `~43m` | `~42m` | `~41m` |
| **Nexus 1 (`nexus1`, Energy unlocked)** | `~1h 02m` | `~52m` | `~41m` |
| **Nexus 2 (`nexus2`)** | `~2h 15m` | `~2h 05m` | `~1h 35m` |
| **Nexus 3 (`nexus3`) & Grand brooder (`hive` 1)** | `~4h 30m–5h 15m` | `~4h 00m–5h 00m` | `~4h 00m–4h 30m` |
| **Pending Mutagen unlocked (`expansion` 48)** | `~8h 30m` | `~7h 50m` | `~6h 20m–7h 30m` |
| **Nexus 4 (`nexus4`) & Moths (`moth`)** | `~8h 30m–11h` | `~8h 00m–10h 30m` | `~7h 30m–9h 30m` |
| **Nexus 5 (`nexus5`) & Bats (`bat`)** | `~14h 30m` | `~13h 30m` | `~12h 30m` |
| **First Ascension Ready (`energy >= ascendCost`)** | **`~15h–17h`** | **`~14h 30m–16h`** | **`~13h 30m–15h`** |
