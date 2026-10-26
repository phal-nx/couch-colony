# Roach Colony UI specification

This is the design contract for the TV overlay, the habitat, and the phone
controller. It records what the design asks for and what to protect when the two
conflict. Engineering rules (TV safety, saves, testing) live in
[AGENTS.md](../AGENTS.md); names live in [naming.md](naming.md).

## Priorities

When requirements pull against each other, earlier items win.

1. **The video comes first.** The overlay never covers the centre of the
   picture, never steals the remote from the app underneath, and never risks
   burn-in. Anything opaque must earn its space; empty panel area is waste.
2. **Smooth on the TV.** The habitat holds 30 fps on the LG CX. No main-thread
   task over about 30 ms in steady play. Work is bounded no matter how large
   the colony grows.
3. **Readable at a glance from the couch.** Counts, the top tier and what is
   close to affordable can be read in one look, without opening a menu.
4. **Grounded and cohesive.** Natural, muted colour with a few deliberate
   exceptions. Nothing looks like a circus; new art matches what exists.
5. **Purposeful life.** Creatures do recognisable jobs, and the colony visibly
   reacts to what the player does.
6. **Quiet.** Feedback is brief, local and deduplicated. Nothing appears while
   the colony is hidden.

## TV overlay

### Layout

- Controls sit in the bottom-right corner. Compact is 480 px wide; the
  management menu is 560 px with four dense rows and no internal scrolling at
  1920×1080.
- Backgrounds are transparent or lightly tinted. Text carries its own shadow so
  it reads over bright and dark video.
- The centre 60% of the screen stays fully transparent at all times, except in
  Standalone terrarium mode (see Display levels), which paints a soil floor
  and lets roaches use the middle.
- Nothing in the overlay scrolls sideways at any width: not the menu, its
  dialogs or key help, whatever the names, prices, counts or quantity. Only
  the tab strip slides sideways, with no scroll bar, when a late colony has
  more tabs than fit.

### Display levels

| Level | Shows | Remote |
|---|---|---|
| Menu | Management panel, tabs, rows, quantity | The colony owns arrows, OK, Back, numbers |
| Compact | Resource strip, census, + button, quick-buy strip with the hint "?", Catch chip, brief toasts | YouTube keeps the remote |
| Watch | Hot bar, its note, and the Catch chip. Census, stock, + and the stage line hide. Roaches hug the bezel | YouTube keeps the remote |
| Critters | Habitat only, no text | YouTube keeps the remote |
| Standalone | Full terrarium: soil floor, nest on the bottom near centre-left, paths across the screen, frameless top resource/census bar, and a 720 px six-row translucent menu. Not for watching video underneath | Same keys as the level it sits on |
| Hidden | Nothing; production paused | YouTube |

Progress runs in every visible level. Hidden grants nothing on return.

### Remote

- Blue toggles the colony from anywhere. It is the only key that closes it.
- Red catches a golden roach, then an egg case or a molting roach, then a
  visitor, and otherwise forages. Green repeats the last manual purchase, and
  Yellow opens and cycles menus. In compact and critters levels these, and the
  digits 1–9 and 0, reach the colony through the Input Hook while focus stays
  with YouTube. Digits 0–9 are installed.
- In compact and Watch, 1–5 buy the quick picks (see Quick-buy). 6 pauses
  auto-buy when any row is bound, and otherwise repeats the last manual
  purchase. 8 toggles Watch. In critters only the digits do nothing, because
  nothing on screen says what they would buy. Watch is also a button on the
  hot bar and under More.
- 0 shows the hint card (see Hint) in compact and the menu; 0 again closes it.
  In critters only it does nothing.
- In the menu, arrows move spatially (up and down between rows, left and right
  within a row), OK activates, and CH+ and CH− turn pages. 1–4 buy a row; 5
  toggles auto-buy and 8 toggles details on the highlighted row; 6 cycles the
  quantity 1, 10, Max; 7 jumps to the next goal's row; 9 shows help;
  0 shows the hint. Critters only has no key: it is under More and on the
  phone, and C brings the text back. Play and Pause control
  automation and Stop clears it.
- Movies opens Visitors and "..." opens Achievements once their key codes are
  identified; until then they do nothing.
- Back closes a dialog, the hint card or help, then collapses the menu to compact. In compact
  it hands the remote back and never closes the colony.

### Opening

A new colony opens like Cookie Clicker: nothing goes up until the player does
something.

- It starts with 0 crumbs and 0 hatchlings, and the nest is dormant: nothing
  produces on its own, in any visible level, for any length of time.
- Red forages (as do the phone's Forage button and the menu). While dormant,
  each forage brings 1 crumb and every second one also brings 1 hatchling, so
  the first Forager roach (10 crumbs and 1 hatchling) takes ten presses. The
  crumb figure pops as usual; a hatchling also pops the hatchling figure and
  goes into the nest with a little dust at the door.
- The line under the footer, where the next role's wait usually sits, reads
  "Press Red to forage. Gather 10 crumbs and 1 hatchling for your first forager
  roach." The population line stays empty, the quick-buy strip offers only the
  first Forager with its fill bar, the census is empty, and the phone shows the
  same goal in a card where the leader card will be.
- The habitat shows a quiet nest: the first stage with no walkers, and up to
  three of the foraged hatchlings moving inside it. Guests, events and the night
  shift wait until the nest wakes.
- The first purchase (in practice the first Forager) wakes the nest for good.
  The hatchery's 1 hatchling a second starts then, with no catch-up for the
  dormant time. After the Forager's introduction card, the toast "The colony
  stirs" says "Hatchlings now hatch on their own." It takes the place of the
  Forager's first-hatch toast.
- A save that owns anything beyond the starting stock is awake, and an
  ascension never puts the colony back to sleep. A save from before the opening
  that owns nothing keeps its stock and waits for its first purchase.

### Quick-buy

Up to five pick buttons on their own line under the census, left of the + button, each
with its item's 64 px icon (the art fills about 48 px of it) and its key 1–5
as an 18 px keycap, legible from the couch. No prices and no standing ETAs.
The strip shows in compact and Watch, and only for slots that have a pick.
Keycaps 6 (auto-buy, only when something is bound) and 8 (Watch) sit after the picks, then 0 (Hint).

- **Amounts.** A roach slot buys as many as stock allows (Max) and an upgrade
  slot buys one level, whatever the menu's 1, 10 or Max. Green then repeats
  that purchase with the same amount. An affordable pick carries a 15 px bold
  badge on its icon's lower right corner saying what a press gets, such as
  "×24", "×1.2K" or "×1" (three significant figures, never wrapping; 13 px when
  it runs past six characters). The
  engine computes it on each refresh from the source's cached max-affordable
  count, only for listed affordable roaches, as formatted text.
- **Fill bar.** A short pick is dimmed and shows the menu's segmented pixel bar
  under its icon, with five segments lit in fifths of its scarcest cost in
  stock. It hides once the pick is affordable, when the badge takes its place.
- **Purchase.** The icon bumps (the purchase pop), the keycap lights and fades
  in three steps, and the amount bought ("+24") rises from the icon in 3x pixel
  digits, one art pixel per step, fading over 500 ms. The usual purchase hint
  and the habitat's purchase reaction follow.
- **Ready.** When a held pick turns affordable, a soft rim of light behind its
  icon comes and goes once (600 ms). Not on the strip's first showing, nor on
  returning from the menu, critters only or hiding.
- **Note.** One line at the right of the row below the strip, led by the
  slot's keycap. When a slot switches to a different pick it names the new
  item; when a key is pressed on a short pick nothing is bought, the button
  nudges, and the line says "Ready in 12s" (or "3m", "1h 5m", "over a year"),
  or "Not enough yet" when a missing cost has no production. The time is
  worked out only on the press, from current production as an upper bound. The
  line holds for about two seconds and fades over the last 300 ms; the next
  note replaces it.
- A press wakes dimmed text like any key. Hiding, critters only or the menu
  drops every strip moment and the note, and none replays on return.

The picks come from the live colony on every compact refresh (about once a
second). The engine lists candidates for each slot, best first:

1. **Goal**: the next goal's unit or upgrade, then the next main-chain role
   above the top one owned.
2. **Top roach**: affordable main-chain roaches, highest tier first, then the
   rest by how close they are to affordable.
3. **Upgrade**: ordinary upgrades (never abilities or mutations), affordable
   ones first ranked by the roach they improve (main chain above territory,
   higher tier first), then the rest by closeness.
4. **Expansion**: Crevices, the best territory unit (by the same rule as slot
   2) and Forager roaches, whichever is closest to affordable.
5. **Ready burst, or another pick**: an energy ability (hatchling rush, swarm
   warp, meat rush, territory rush) only when it can be cast right now.
   Otherwise the next unit or upgrade the earlier slots did not take. An
   ability that is still charging is never shown.

Closeness is the share of the scarcest cost already in stock. Each slot takes
its first candidate that an earlier slot does not hold; if none is left it
takes whatever is closest to affordable among all candidates, so early colonies
still fill what they can. A held pick changes only when another candidate leads
its slot for four refreshes in a row, or at once when the held pick is no
longer a candidate (bought out, hidden, or taken by an earlier slot). Opening
the menu and returning starts the picks afresh.

### Hint

The original Swarm Simulator's tutorial messages, one per stage of a colony.

- **Text.** The adapter ports the upstream `tutorial.coffee` steps and the
  conditions that choose them (`app/swarm/source/directives/`), with links and
  markup reduced to their words, and computes the step only when a hint is asked
  for. The theme renames the swarm's words (drones become forager roaches, meat
  crumbs, larvae hatchlings) and rewrites sentences that pointed at the web
  game's screens to name Upgrades, the Brood tab and Evolution. Upstream goes
  quiet after five expansions and after later ascensions; three steps in the
  same voice cover the nexus, energy and later ascensions.
- **Card.** 0, the strip's "?" and More's Hint button show a pinned card near
  the controls (the toast frame, pin and folded corner), the controls' full
  width: "Hint" with its 0 keycap, the step's text at 21 px and "Next goal:"
  with the goal line at 18 px. It stays about ten seconds; 0 again, Back or any
  other key closes it, and that key still does its job. It closes the key help,
  a unit explanation or a showing toast. Ordinary toasts wait while it shows, as
  they do for the key help, but a catch closes it and goes first. Never while
  hidden or in critters only, and it does not come back on returning.
- **Goal pick.** If the strip holds the next goal's pick, its rim pulses once
  (600 ms) as the card opens.
- **Glyph.** The strip ends with a pixel "?" at 5x and an 18 px 0 keycap,
  narrower than a pick so all five fit the 480 px footprint beside the + button.
- **First hint.** A brand-new (dormant) colony shows its first hint once on its
  own, on the first refresh after it opens, and never again unless 0 is pressed.
  Reset progress clears that record with the milestone history, so the next new
  colony shows it again.

### Red cue

- Whatever Red would catch right now carries the Red capsule: a 16×8 pixel
  drawing of the remote's thin red button, muted red with a dark outline,
  drawn at 2× above the target (below it when the target hugs the top edge).
  Only one target carries it, the one Red takes first. Any future
  Red-catchable guest calls the habitat's one `redCue` function.
- The target is drawn last, over every walker, prop and mote, above a soft
  warm-red halo that pulses gently behind it. Nothing else gets the halo.
- While something is catchable, the footer shows a chip with the same capsule
  and "Catch golden roach", "Hatch egg case", "Catch molting roach" or "Catch"
  and the visitor's name, in place of the population line, which sits below
  the quick-buy strip beside the night-shift icon. The chip is never cut short.
  When Red would only forage, nothing shows. A snack drop needs no Red and
  never takes the chip.
- Both, and the phone's Forage button, read `target()` in `app/mechanics.js`,
  the rule Red itself follows.
- The capsule comes from `app/art/red_key_capsule.png` once it loads; a copy of
  new 16×8 art replaces it without code changes.

### Numbers

- At most three significant figures, truncated rather than rounded: `7.42`,
  `742`, `12.3K`, `10.1M`, `2.35e70`. Large values carry no decimals.
- Whole counts for roaches, hatchlings and crumbs. Huge values never pass
  through a JavaScript number.
- Fixed-width tabular digits so the resource strip never reflows or wraps.

### Census

- Up to three owned units next to the + button, main-chain tiers first, each
  with icon, whole count and short label. A long label wraps between words,
  but no entry shrinks below its longest word, so a label is never clipped.
  If three entries still don't fit the 480 px footprint, the third is hidden
  until they do; nothing pokes past the footprint.
- It leads with the top tier ("72 Nest queens"), not the population total.
  The footer may say "N roaches in all".

### Lists

- Units and upgrades list newest unlock first.
- Every upgrade shows a one-line brief and its effect ("Forager output ×2").
  Full text sits behind the details toggle.
- Unaffordable rows stay focusable and show the next single price.
- A price that runs long ends in an ellipsis: after two lines on a unit row
  and after one on an upgrade row, which already spends a line on its brief.
  Details (8) shows the whole price.
- Achievements list visible-locked first (closest to done on top), then earned.
  Hidden ones collapse into one "N more to discover" row.

### Evolution

- Hidden until pending mutagen exists. Once shown, the Evolution view and the
  phone's More screen preview ascending now: the mutagen gained, the energy as
  a percent of the ascension cost (with time to reach it, or a note to spend
  energy when the cost is above the cap), what is kept, and which upcoming egg
  chamber or crevice adds mutagen next and how much.
- The preview is computed only while one of those views is showing it.

### Toasts and notifications

- Milestones, first units, achievements, golden roaches, visitors, intruders,
  hatched egg cases, caught molting roaches, a snack hauled home, the start
  of the night shift and the colony waking from its opening show a brief toast
  near the controls. One
  at a time, a few seconds each, at least twelve seconds apart, never more than
  four queued.
- Toasts appear in compact mode too, including while the phone drives the
  game. A phone purchase never opens the TV menu. Critters-only shows no text;
  toasts wait in the queue until text returns.
- A catch is the one exception to the twelve-second spacing: the player
  pressed Red, so its toast goes first.
- Never while hidden. Deduplicated across sessions.
- Toasts are a small card pinned in place: the menu's packed-soil frame (see
  Menu chrome) with a folded corner and a pixel pin.

### Moments

Short, local feedback. Only transform and opacity animate, each for at most
600 ms, and pixel art moves in whole-pixel steps rather than easing. Nothing
starts while the colony is hidden or showing critters only.

- **New tier.** The first-hatch card shows the unit's 32 px icon at 1x, 2x, then
  3x (120 ms apart) behind a soft rim of light, and its census slot slides in.
- **Order of magnitude.** When a resource or census figure rises into a new
  suffix (K, M, B, T) or a new decade of its exponent (e15, e20, e30, ...), it
  flashes ochre once beside a small badge. The highest rank this showing is
  remembered, so spending below a suffix and regaining it stays quiet, and
  returning from hidden or critters only is never stamped.
- **Achievement.** The toast stamps a medal from 3x through 2x to 1x.
- **Purchase.** The bought row's icon pops a pixel step and its owned count rolls
  up into place; the census does the same when the purchase changed its figure.
- **Quick-buy.** The strip's purchase float, keycap light, ready rim and note
  are described under Quick-buy. The note is the one exception to the 600 ms
  limit: it holds for two seconds, and only its 300 ms fade animates.

### Reset progress

- The last button under More starts the game anew. It is TV only: no remote
  shortcut, launch parameter or phone command reaches it.
- It asks twice, and each step opens with Cancel focused, so it takes two
  deliberate moves to Confirm. The first step lists what is lost: units,
  upgrades and resources; mutagen, mutations and ascensions; achievements,
  including guest ones; the visitor log and golden roach and intruder counts;
  auto-buy, the purchase Green repeats, quick-buy picks and milestone history.
  The second says it is the last step. Back or Cancel leaves either step with
  nothing changed.
- Before it erases anything, the current colony and its visitor log are saved
  in full to the backup slot and to a before-reset slot that routine saves never
  touch, so the colony can be restored by pasting that save into Import.
- The engine is replaced with a fresh game through the save store. Phone
  pairings, the 1, 10 or Max choice, the corner, the display level and the
  one-time reset receipt are kept.
- The habitat drops every guest and role, the ascension ceremony files the old
  colony into the nest, and the menu returns to Units with the toast "A new
  colony begins." The new colony opens dormant (see Opening): a quiet nest at
  its first stage, waiting for Red.

### Burn-in protection

- After about 60 seconds without input or purchases, static text fades to
  roughly 35% opacity. Any key, purchase or toast restores it. While faded,
  and for the whole of Watch mode, walkers tuck to a 42 px bezel, about half
  as many are drawn, and ordinary walkers and motes sit at 55% opacity.
  Anything Red can catch stays fully visible. Buying from the hot bar does
  not leave Watch or this quieter habitat.
- Every few minutes the compact overlay shifts by a few pixels, and by up to
  12 px while faded or in Watch.

## Habitat

### Performance contract

- 30 fps target, stepping down to 20 and 15 only when the habitat's own draw
  cost exceeds its budget, and recovering when it falls.
- At most 64 lane entities (48 at 20 fps and 32 at 15 fps), ten small movers
  inside the nest, a fixed pool of 96 motes, pre-rotated cached atlases within
  a fixed memory budget, baked ground and nest that re-bake only when their
  level changes, and no per-frame text.

### Representation

- One roach per order of magnitude per species, so group size reads as scale.
- The most advanced main-chain tier leads: a larger lead roach with an escort.
- Neighbouring tiers are distinguishable at census size through value, pattern
  and markings as well as hue.
- Palette: browns, ochres, rust, olive, slate and bone. Glow is reserved for a
  few late tiers, nexus nodes and the golden roach.

### Jobs

- Foragers run the bottom edge between the controls and the nest, out on the
  outer lane and home carrying a crumb on the inner lane, along a faint trail.
- Nest queens circle the nest and lay hatchlings that join the trail. At
  most every 30 seconds a laying queen leads up to three hatchlings out in a
  short line behind her; they peel off one at a time onto the supply trail.
- Territory critters march out to a frontier that grows with territory. Up to
  three stand still at the outermost claim posts, facing outward, and a
  marcher passing a post takes over once a guard's half-minute shift is up.
- About once a minute the top tier makes a slow procession with its escort,
  the shorter way round to the nest; a lead already by the door waits.
- Purchases bring roaches out of the nest, and expansions and nexuses send a
  short caravan that walks in from beyond the far side edge at the pace of its
  slowest member.
- A new tier's parade: it comes out of the nest door with a brief pulse and a
  few glints, drawn a whole step larger in a soft warm halo, and walks one lap
  of the inner lane back to the door. Up to three escorts walk in step behind
  it, a little to either side: its own group first, then lower-tier roamers
  from near the door. Its ember trail is thicker for the first three seconds.
  Roamers it passes stop for a moment, turned toward it. The lap is walked at
  twice the slowest member's own pace, so it takes about half a minute for a
  quick tier and up to two minutes for a slow late one.
- Buying a higher main-chain tier spends the tier below, so up to three of
  that tier that can walk to the door within six seconds walk in along the
  lane, and the new roach comes out after them. They come back out a few
  seconds later.
- A nest upgrade that changes the nest's look sends a crew of three to five
  carrying bits of soil and bone along the lane, those that reach the door
  soonest; the new look appears when they are through the door, or after six
  seconds at most, and a straggler walks on in after it.
- An arriving intruder or a big purchase startles roaches within 150 px:
  they freeze, dash a short way outward (never into the centre; a slow walker
  dashes less far), pause and walk back. At most eight at a time, once every
  20 seconds.
- Nothing slides. A roach never walks faster than twice its own speed on an
  errand, so a trip to a far target takes proportionally longer, the nearest
  roaches are chosen for timed errands, and a roach that must appear
  elsewhere goes into the nest and comes out of the door. Changing lane, a
  sideways step and a role's start or end are walked too. `npm run
  test:habitat` drives a mid- and a late-game colony through every errand
  (`scripts/dev/habitat-speed.cjs`) and fails if any drawn roach moves more than two
  and a half times its species' walking speed from one frame to the next.
- All of these borrow existing seats, run only while the colony is visible,
  and end when it closes.
- Lane manners make the walking look deliberate:
  - A group of one species shares one pace and keeps even gaps.
  - The nest door takes one roach at a time, so emergers and homecoming
    foragers queue and take turns. Emergences that are only for show queue
    at most three deep and are otherwise skipped.
  - Two roaches meeting head-on sometimes stop nose to nose for about half a
    second, then step to their right and walk on. There is at most one
    greeting every six to ten seconds, never the same roach twice in a row,
    and none during a parade, caravan, procession or intruder.
  - Now and then, mid-lane, a homebound forager hands its crumb to an
    outbound one, and each turns around. Handoffs are at least fourteen
    seconds apart.
  - Lower tiers step a little aside for a higher tier and part for the
    procession, then ease back onto their lane.
  - All of it costs one sorted neighbour pass a frame and stops while hidden.

### Nest

- A cutaway soil nest in a free corner, bottom-left by default, growing through
  six clear stages from a crack to a citadel built from salvaged parts. Its
  painted soil sits on the bottom edge of the screen; the bitmap's empty
  margin hangs below it. A dormant colony (see Opening) shows the crack with
  no walkers and up to three hatchlings inside.
- Standalone terrarium mode (`?standalone=1`, `?mode=standalone`, or More's
  Standalone view, remembered on this device) drops the video hole. The nest
  sits on the bottom, left of centre and clear of the controls, and lanes,
  marks and guests use the floor instead of the outer ring. Resources (all
  unlocked currencies) and the census (up to six castes) move to a frameless
  top bar, the menu widens to 720 px with six rows per page and translucent
  chrome instead of the opaque 9-slice fill, burn-in dimming and drift stay
  off, and the canvas does not punch exclusion holes under the HUD or menu.
  More's button switches back to the TV overlay.
- Upgrades are visible on it: egg chambers, tunnels, nexus nodes, pennants,
  mutation tint and a crumb heap.

### Mechanics with visual identity

- **Golden roach.** Metallic gold, larger than a queen, a soft pulse, sparkles
  and the Red capsule. It patrols the innermost lane opposite the supply trail
  and must never be mistaken for an amber Nest queen. It waits until caught or
  the colony closes. Reward: five minutes of crumbs and two of hatchlings.
- **Visitors.** Insects from the visitor sheet wander one edge, flipped left and
  right with a gentle bob, never rotated, under the Red capsule while nothing
  ahead of it in Red's order is out. Red logs them into a collection
  under More, shown as icons with names and dim silhouettes for the unfound.
  Guest achievements (visitors logged, golden roaches caught, an intruder seen
  off) join the source's in the Achievements list, toasts and phone view. They
  are kept by the overlay beside the visitor log, never in the engine save.
- **Intruders.** A spider or centipede creeps in from a free corner away from
  the nest and the golden roach; up to four territory critters ring it and
  walk back to their lane spot when it retreats. Bonus territory scales with
  the territory species owned. There is no losing. Only critters near enough
  to run there within half its stay set out, nearest first.
- **Night shift.** From 22:00 to 06:00 on the TV's clock, fireflies glow
  brighter, nexus nodes warm (one nest re-bake at each boundary), the
  night-shift icon sits in the footer, and every two visible minutes the colony
  gains twelve seconds of crumb production, about 10% more crumbs.
- **Habitat events.** A snack drop, an egg case or a molting roach, one at a
  time, about every 10 to 20 visible minutes (the first mirrors the golden
  roach's arrival in that window, so an early golden roach means a late event).
  None starts while a golden roach or an intruder is out, and neither of those
  starts while an event is out; visitors come and go as usual. Their sprites
  are the native 64 px art from `art/events/`, packed into the critter
  atlas by `scripts/build/build-critters.py` and drawn 1:1, flipped but never rotated.
- **Snack drop.** A cereal ring, pizza crust or potato chip lands on the lane
  at a side or top edge, away from the supply trail's far end. Up to six
  foragers (drones first, then whoever would bring pieces home soonest) walk
  the lane to it at their own pace and shuttle pieces home for 30 seconds, out
  on the outer lane and back on the inner one with a crumb at the head,
  setting each down at the door for an inner worker as foragers do. The
  snack loses an eighth from its nest side at each step, with a spill of
  crumbs. Reward when it is home: ninety seconds of crumbs. No Red.
- **Egg case.** A dark ootheca lies in a lane corner other than the nest's,
  under the Red capsule (after a golden roach). Red hatches it: a burst of
  flecks and up to three hatchlings walk out of it onto the lane. Reward:
  ninety seconds of hatchlings. Left alone for 60 to 90 seconds, two roaches
  walk to it and carry it along the lane into the nest; no reward.
- **Molting roach.** A pale, freshly molted roach rests on the lane beside the
  nest with its empty husk next to it, under the Red capsule. Red catches it
  and it hurries into the nest. Reward: 45 seconds of crumbs, the foragers'
  output, which the toast explains. Left alone for 45 to 60 seconds it darkens
  to roach brown in four steps, walks off along the lane and fades. The husk
  stays twenty seconds after it has gone.
- **Nuptial flight.** During the night shift, when a new tier hatches or a
  count reaches a new suffix or exponent decade, three winged roaches climb
  out of the nest, flapping between their two frames, and fly off the nearer
  side edge. At most once every five visible minutes. Purely visual.
- **Ascension ceremony.** As an ascension succeeds, the roaches near the door
  file into the nest along the lane and the rest fade out where they walk; the
  reset colony waits until the doors close at about two seconds, when the nest
  shows its first stage with a glow and a fresh pair walks out. The others
  follow at four seconds. Purely visual; the engine reset has already happened.
  Reset progress plays the same ceremony.
- Every guest and event prop borrows one of the 64 entity seats (a molting
  roach and its husk take two, a nuptial flight three) and is drawn from
  sprites baked on arrival; carriers, hatchlings and the ceremony are roles on
  existing seats. Nothing spawns, moves or pays out while the colony is hidden,
  and closing it sends every guest and event away unrewarded.

## Icons

- The pixel sheets in `art/sheets/` supply static icons only (census, rows,
  phone, collections and the wandering visitors) and, through `events.json`,
  the habitat event sprites in `art/events/`. The animated walkers come from
  `art/creatures/` through `scripts/build/build-creatures.py` instead. Sheet icons are
  native 64 px pixel art, packed into a 64 px atlas cell without resampling,
  and keep their own colours. Draw them at 64 or 128 px, or at
  32 px, which takes the commonest colour of each 2x2 block. Other sizes
  average down with hard edges and look softer.
- The census uses 64 px icons and rows use 32 px icons. The art fills about
  48 px of its cell, so these match the earlier 48 and 24 px sizes on screen.
- Every unit has sheet art. Pantheon II to IV and Overmind II to VI share one
  drawing each, recoloured to their tier's body colour when the icon is drawn.
- Resources, upgrade families and meta features (achievements, visitors, night
  shift, ascension, the golden roach) have their own icons through
  `RoachHabitat.iconFor(kind, id, size)`.
- Adding art means dropping a sheet into `art/sheets/`, naming its icons in the
  JSON file beside it, and running `scripts/build/build-critters.py`.
- The overlay's UI moments take their art from `app/ui-art/`, one native PNG per
  slot, drawn by `style.css` at whole multiples of its size with
  `image-rendering: pixelated`. Finished art replaces a slot by copying the file
  in; `scripts/build/build-moment-art.py` copies any slot of the right size from
  `art/incoming/` and draws a placeholder only for a slot
  that is still empty.

  | Slot | Native size | Drawn at | Used for |
  |---|---|---|---|
  | `magnitude_badge.png` | 16×16 | 2x, landing at 3x | Order-of-magnitude stamp beside a count |
  | `achievement_medal.png` | 32×32 | 1x, stamping from 3x | Seal on an achievement toast |
  | `popup_pin.png` | 16×16 | 2x | Pin on the milestone and first-hatch cards |

## Menu chrome

The menus share a pixel look with the creatures and nest. All of it is static
images drawn at whole-number scales with `image-rendering: pixelated`; nothing
animates, and nothing changes layout.

- **Frame.** The TV management menu, toasts, key help and unit explanations
  wear a packed-soil nine-slice frame at 2x (a 16 px border, of which about
  6 px is the soil band). Its semi-transparent centre tile is the panel tint, so
  the panels stay light over the video. The menu keeps 560 px, four rows and no
  internal scrolling. The phone's cards, panels, leader card and resource sheet
  wear the same frame at 1x over their own surface colour.
- **Focus.** The focused button shows four bone corner brackets at 2x instead of
  a rounded glow. In a list row the whole row shows the brackets and the focused
  control inside it keeps a square bone edge, so brackets never nest.
- **Glyphs.** Units, Upgrades, Evolution and More carry 32 px glyphs beside
  their words on the TV; the phone's Colony, Upgrades and More sections use the
  units, upgrades and more glyphs. The quantity buttons carry 32 px glyphs
  beside 1, 10 and Max on both.
- **Segmented bars.** Unaffordable rows (toward the single next price) and
  locked achievements show ten 8 px segments between two caps at 1x on the TV.
  The phone's bars use the same art, with ten segments on cards and twenty on
  the leader, achievement and visitor totals. A segment lights only when its
  whole share is earned.

### Art slots

The art lives in `app/ui-art/`, one file per slot. Replacing art is a file copy into that
folder with the same name and size, then `python3 scripts/build/build-ui-art.py`, which
checks every size and rebuilds the derived focus sheet. The bridge serves the
phone's share as `/ui-art/<slot>.png` and `scripts/tv/controller.py` installs it.
`scripts/build/build-ui-art.py --placeholders` redraws stand-in art and overwrites
these files, so it is only for before real art exists.

| Slot | Size | Use |
|---|---|---|
| `ui_border_9slice.png` | 24×24 | Nine-slice of 8 px tiles: corners, edges, semi-transparent centre (TV, phone) |
| `ui_focus_bracket.png` | 8×8 | Top-left focus bracket; mirrored into `built/ui_focus_9slice.png` (TV) |
| `tab_units.png` | 32×32 | Units view; phone Colony section |
| `tab_upgrades.png` | 32×32 | Upgrades view and section |
| `tab_evolution.png` | 32×32 | Evolution view (TV) |
| `tab_more.png` | 32×32 | More view and section |
| `qty_1.png`, `qty_10.png`, `qty_max.png` | 32×32 | Quantity buttons (TV, phone) |
| `progress_cap_left.png`, `progress_cap_right.png` | 8×8 | Bar end caps |
| `progress_segment_empty.png`, `progress_segment_full.png` | 8×8 | Bar segments, unlit and lit |

## Phone controller

### Hosting

- The bridge runs on the TV, starts at boot, and serves the phone page on the
  local network. One household, one or two phones. No laptop, no internet.
- The page can be added to the iPhone Home Screen and opens full screen as
  "Roach Colony", with a pixel-art roach icon drawn by
  `scripts/build/build-phone-icons.py`, a translucent status bar over the ground colour,
  and safe-area padding so the thumb-zone buttons stay clear of the home
  indicator. There is no service worker, because plain HTTP cannot register one.
- iOS keeps Home Screen storage apart from Safari, so the Home Screen app pairs
  on its own as "iPhone (Home Screen)". The Camera opens pairing links in
  Safari, so in that mode the pairing screen takes a pasted link or a typed code.

### Look

- Dark burrow palette: ground `#12100c`, surfaces `#1c1915`, text `#eee7d7`,
  muted `#a89f8c`, ochre accent `#d3a256`, moss `#8fae6b` for covered costs,
  rust `#e39a7b` for shortfalls.
- Atkinson Hyperlegible for text and Bricolage Grotesque for figures, bundled
  locally. Touch targets at least 44 px.

### Content

- Status line with Show or Hide. Show starts the colony even when it is closed.
- Resource strip: crumbs and hatchlings always, with the third tile following
  the tab (territory or energy). Tapping a resource opens a sheet with amount,
  rate, cap, what spends it (have, need, ETA, progress) and what earns it.
- Leader card for the top tier and the next tier's progress. While the nest is
  dormant there is no leader; a card in its place shows the TV's goal line.
- Tabs for roaches, territory and energy (energy appears once unlocked), plus
  1, 10 or Max.
- Unit cards: icon, owned count, production, cost chips showing have against
  need when short, Auto switch, and a progress bar when unaffordable.
- Forage and Buy last stay in the thumb zone. Short confirmations, no popups
  for routine actions.
- The Forage button is the phone's Red. It reads "Forage" until Red has a
  target, then turns bone-coloured with a red edge, wears the Red capsule
  (served as `/art/red_key_capsule.png`) above its label, and reads "Catch
  golden roach", "Hatch egg case", "Catch molting roach" or "Catch" and the
  visitor's name, in Red's order from `target()`. It grows to fit the label on
  one line, leaving Buy last at least 96 px; a longer visitor name ends in an
  ellipsis. A tap sends what the button showed: a catch names its target, and
  if that target has gone by the time it arrives, nothing happens and the
  phone says so ("The golden roach got away.") rather than foraging.
- Under the goal or leader card, a folded Hint panel holds the TV's key 0 hint:
  the tutorial step and, once the nest is awake, the next goal. Only the Colony
  screen asks the TV for it.
- Upgrades are split into "Ready now" and "Saving up". More holds the TV
  display level, auto-buy, evolution when relevant, achievements, visitors and
  paired phones.
- Toasts mirror the TV's notifications and never cover the answer to a tap.

### Behaviour

- Phone navigation never changes the TV menu.
- Every purchase is acknowledged once; nothing replays after a reconnect.
- Commands while the colony is hidden are refused with "Open the colony to
  play", except Show, and Hide, which just confirms the colony is paused.
- With no phone watching, the game does no extra work for the phone.
