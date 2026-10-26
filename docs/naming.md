# Couch Colony naming

Couch Colony runs the Swarm Simulator economy unchanged. Only the words change, and
they all change in `app/theme.js`. Source ids, costs, saves and the pinned source tree
stay exactly as upstream wrote them. This page records what the player reads, what it
used to say, and why.

## Inventory

Player-facing text reaches the screen from four places.

| Source | What it contains | State before this pass |
|---|---|---|
| `app/swarm/data.generated.json` units | 58 rows, 52 the player can see: labels, plurals, descriptions | 7 main-chain names and 2 resources themed; 13 main-chain tiers, all 11 territory units, 3 energy units, 10 mutations and every description still zerg |
| `data.generated.json` upgrades | 87 visible upgrades and abilities: labels, a few descriptions | None themed. "faster drones", "twin queens", "construct nexus", "swarmwarp", "mutate bats" all leaked |
| `data.generated.json` achievements | 114 playable titles and generated descriptions ("Hatch 100 drones") | Descriptions partly themed through `meat`/`larva` swaps; titles untouched |
| `app/swarm/adapter.js` | Cost lines (`100 drone`), purchase messages (`Purchased queen.`), `describeUpgrade` copy, `nextGoal`, prestige and respec copy, unit production lines | Cost lines used the singular source label for every amount; prose mentioned meat, larvae, hatcheries, nexus and Swarmwarp |
| `app/colony.js` and `index.html` | Buttons, dialogs, hints, milestones | Already colony-themed apart from "Ascend to a new nest?" |

The confusing cases this pass had to resolve:

- **"Nest" was a unit counted as roaches.** The census adds it to "roaches in all" and the
  habitat draws it as a roach carrying an egg, yet the label described a place. The same was
  true of "Hive".
- **"Roach" was a territory unit inside a roach colony.** "300 roaches in all" and "Hatch 100
  roaches" meant different things.
- **Old names leaked through costs and messages.** A Nest queen cost "100 drone", buying one
  said "Purchased queen.", and "Twin queens" sat next to "Nest queen".
- **Lowercase source labels.** Titles such as "faster drones" and "queen me" rendered in
  lowercase.
- **Pluralisation.** The adapter writes `format(amount) + ' ' + singular label`, which gave
  "810 meat + 100 drone".
- **Meaningless Latin.** Arachnomorph, culicimorph, chilopodomorph and lepidoptera hid ordinary
  bugs behind words nobody can read from a couch.

## Identity

The first seven main-chain tiers are roach castes, so "roaches in all" stays true and every
census sprite is a roach. Above the empress the names stay close to Swarm Simulator's own:
Neuroprophet and Elder sage, then Pantheon I–IV, the Council mind and Overmind I–VI. Allied
household critters hold the territory, and nexuses supply energy as they do in the source.

### Main chain (20 tiers)

| Tier | Source id | Source label | Now | Why |
|---|---|---|---|---|
| 1 | `drone` | drone | Forager roach | |
| 2 | `queen` | queen | Nest queen | |
| 3 | `nest` | nest | Brood mother | It is drawn and counted as a roach carrying an egg. It produces queens |
| 4 | `greaterqueen` | greater queen | Colony matriarch | |
| 5 | `hive` | hive | Grand brooder | Also a roach with eggs. "Grand" pairs it with tier 6 |
| 6 | `hivequeen` | hive queen | Grand matriarch | Reads as larger than Colony matriarch |
| 7 | `empress` | hive empress | Roach empress | |
| 8 | `prophet` | neuroprophet | Neuroprophet | Source name |
| 9 | `goddess` | hive neuron | Elder sage | "Hive" now means the Grand brooder, so the source name cannot stay |
| 10–13 | `pantheon`–`pantheon4` | neural cluster, hive network, lesser hive mind, hive mind | Pantheon, Pantheon II–IV | Matches the source ids. Numbered steps read as a progression, and most source labels contain "hive" |
| 14 | `pantheon5` | arch-mind | Council mind | The source describes several minds merging into one greater being |
| 15–20 | `overmind`–`overmind6` | overmind, overmind II–VI | Overmind, Overmind II–VI | Source names. Plural "Overminds II" instead of "overmind IIs" |

### Territory chain (11): allied critters

The habitat already draws these as different animals: spiders have eight legs, the
centipede is segmented, wasps have stingers. Calling them roach castes would contradict the
sprites. They are the house's other pests, and the colony pays them in crumbs and hatchlings
to hold its turf. That also stops "roach" from naming two things.

| Source id | Before | Now | Why |
|---|---|---|---|
| `swarmling` | swarmling | Silverfish | Small, quick, common in damp corners |
| `stinger` | stinger | Fire ant | Matches the striped sprite with a stinger |
| `spider` | arachnomorph | House spider | |
| `mosquito` | culicimorph | Mosquito | |
| `locust` | locust | Cricket | A household locust |
| `roach` | roach | Hissing roach | A hard-shelled foreign roach, which matches the source text ("nearly impossible to kill"). It no longer collides with the colony |
| `giantspider` | giant arachnomorph | Wolf spider | The bigger, hairier spider |
| `centipede` | chilopodomorph | House centipede | |
| `wasp` | wasp | Wasp | Kept |
| `devourer` | devourer | Stag beetle | The sprite has mandibles |
| `goon` | goon | Rhino beetle | The sprite is armored |

### Energy and resources

| Source id | Before | Now | Why |
|---|---|---|---|
| `meat` | Crumbs | Crumbs (one Crumb) | Kept |
| `larva` | Hatchlings | Hatchlings (one Hatchling) | Kept |
| `cocoon` | cocoon | Egg case | Roaches really do lay egg cases. Cocooned larvae are banked, and so are eggs |
| `territory` | Territory | Territory | Kept |
| `energy` | Energy | Energy | Kept. It is generic and clear |
| `nexus` | nexus | Nexus (plural Nexuses) | Source name. The upgrade is "Build a nexus" |
| `nightbug` | nightbug | Firefly | The sprite glows |
| `moth` | lepidoptera | Moth | Drawn to the screen glow |
| `bat` | bat | Bat | Kept |
| `mutagen` | Mutagen | Mutagen | Kept |
| `premutagen` | mutagen (inactive) | Pending mutagen | Matches the wording the adapter already uses |
| `hatchery` (upgrade) | hatchery | Egg chamber | |
| `expansion` (upgrade) | expansion | Crevice | The colony spreads into another crack in the wall |

Tabs get their own names through `tabLabel`: Roaches, Brood, Territory, Energy and Mutations.
The phone uses it; the TV menu still names tabs with `label`. `label('meat')` stays "Crumbs"
for the resource bar.

### Upgrades, abilities and mutations

Pattern upgrades follow the unit names automatically:

- `{unit}prod` becomes "Faster {plural}", as in Faster forager roaches.
- `{unit}twin` becomes "Twin {plural}", as in Twin nest queens.
- `{unit}empower` becomes "Empower {plural}", as in Empower hissing roaches.

| Source id | Before | Now |
|---|---|---|
| `larvarush` | larva rush | Hatchling rush |
| `meatrush` | meat rush | Crumb rush |
| `territoryrush` | territory rush | Territory rush |
| `swarmwarp` | swarmwarp | Time warp |
| `clonelarvae` | clone larvae | Clone hatchlings |
| `clonearmy` | house of mirrors | House of mirrors |
| `cocooning` | cocooning | Egg cases |
| `nexus1`–`5` | construct nexus | Build a nexus |
| `mutatehatchery` / `mutanthatchery` | mutate hatcheries / hatchery mutation | Mutate brood / Brood mutation |
| `mutatebat` / `mutantbat` | mutate bats / bat mutation | Mutate power / Power mutation (it powers every ability, not bats) |
| `mutateswarmwarp` / `mutantswarmwarp` | mutate swarmwarps / warp mutation | Mutate time / Time mutation |
| `mutatenexus` / `mutantnexus` | mutate lepidoptera / lepidoptera mutation | Mutate energy / Energy mutation (it raises energy generation) |
| `mutatemeat` / `mutantmeat` | mutate meat / meat mutation | Mutate crumbs / Crumb mutation |
| clone, rush, meta, frequency, territory | (unchanged wording) | Capitalised only |

### Achievements

Titles are the source titles in sentence case, puns included, even where the pun named a unit
that has since been renamed ("I wanna be the very nest", "We'll do it hive"). The only change
is `prophet1`, "1. Collect hatchlings", which follows the larva rename. `ACHIEVEMENTS` in the
theme lists titles that the free-text swaps would otherwise rewrite, such as "Queen me" and
"Swarm intelligence".

Generated descriptions are themed by `text()`. "Build your first nest" becomes "Raise your
first brood mother", "Build 5 nexus" becomes "Build 5 nexuses", and "Hatch 100 roaches" becomes
"Hatch 100 hissing roaches".

## Wording guidelines

- **Sentence case everywhere.** Capitalise the first word and leave the rest in lowercase,
  apart from Roman numerals. Inside a sentence, a name is lowercase ("Twin nest queens").
  Cost lines from `costText` keep the label's capital ("100 Forager roaches").
- **Keep names short.** Unit names are 16 characters or fewer and plurals 18 or fewer. The
  longest are Colony matriarch and Colony matriarchs. The tests enforce this.
- **Use the right number.** "1 Hatchling" and "2 Hatchlings", with a decimal "1.00" counted
  as one. Crumbs, Hatchlings and Egg cases read as collectives in the resource bar.
- **Never use these source words in new copy:** meat, larva/larvae, drone, queen (except in
  Nest queen), nest (except in Nest queen), hive, swarm, spell, or the Latin "-morph" names.
  Neuroprophet, Overmind and Nexus are kept source names and are fine. Write "roach" for the colony only, and "hissing roach" for the territory
  unit.
- **Verbs:** Hatch for roaches and critters, Raise for brood mothers and grand brooders, Grow
  for the mind tiers, Build for nexuses, and Claim for crevices and territory. Forage is the Red button.
  Ascend and Ascension stay as they are.
- **Tone:** plain. Late-tier descriptions keep the source text with only the swarm, hive and
  meat words swapped. Do not use real brand names.

## API (`app/theme.js`)

The module has no dependencies, uses ES5 only, and loads as `window.RoachTheme` in the
browser and through `require` in Node.

| Function | Use |
|---|---|
| `label(id, sourceName)` | Display name for a unit or upgrade id. Resources return the collective form ("Crumbs"); unknown ids return `sourceName`, as before |
| `plural(id, sourceName, count?)` | Plural unit name, or singular when `count` is 1 |
| `upgradeLabel(id, sourceName)` | Themed upgrade or ability name |
| `achievementLabel(id, sourceName)` | Themed title in sentence case |
| `tabLabel(id, sourceName)` | Tab name (Roaches, Brood, …) |
| `costText([{id, amount, name?}])` | `"810 Crumbs + 100 Forager roaches + 1 Hatchling"`. `amount` must already be formatted |
| `text(string)` | Free text. Replaces whole words with longest-match-first, matches the source capitalisation, gets number agreement from a preceding formatted number, is idempotent over its own output, and caches up to 1,024 results |
| `source(id, sourceName)` | The source name when it differs from the themed one, otherwise `''` |

`text()` also recognises every source label and the overridden achievement titles as whole
strings. That keeps current `colony.js` callers correct until they switch to the structured
functions.

## Follow-ups for the UI and adapter owners

- `colony.js` should use `tabLabel` for tabs, as the phone does. `aria-label`s and the
  resource `title` tooltip still show raw `entry.name` / `resource.name`. The "Ascend to a new
  nest?" dialog title never passes through the theme.
- The upgrade effect lines in `describeUpgrade` start lowercase after a full stop ("… more
  forager roaches. nest queen production multiplier: ×2."). This comes from the adapter, not
  the theme.

## Decisions

- Ascension, Energy and Territory keep their names.
- "Roaches in all" stays, even though it also counts the territory critters.
- Source puns in achievement titles are kept.
