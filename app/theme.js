/* Presentation labels only. Source identifiers and economy remain unchanged. See docs/naming.md. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachTheme = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [id, singular, plural, source singular, source plural]
  var UNITS = [
    ['meat', 'Crumb', 'Crumbs', 'meat', 'meat'],
    ['larva', 'Hatchling', 'Hatchlings', 'larva', 'larvae'],
    ['cocoon', 'Egg case', 'Egg cases', 'cocoon', 'cocoons'],
    ['territory', 'Territory', 'Territory', 'territory', 'territory'],
    ['energy', 'Energy', 'Energy', 'energy', 'energy'],
    ['mutagen', 'Mutagen', 'Mutagen', 'mutagen', 'mutagen'],
    ['premutagen', 'Pending mutagen', 'Pending mutagen', 'mutagen (inactive)', 'mutagen (inactive)'],
    ['nexus', 'Nexus', 'Nexuses', 'nexus', 'nexus'],
    ['ascension', 'Ascension', 'Ascensions', 'ascension', 'ascensions'],
    ['drone', 'Forager roach', 'Forager roaches', 'drone', 'drones'],
    ['queen', 'Nest queen', 'Nest queens', 'queen', 'queens'],
    ['nest', 'Brood mother', 'Brood mothers', 'nest', 'nests'],
    ['greaterqueen', 'Colony matriarch', 'Colony matriarchs', 'greater queen', 'greater queens'],
    ['hive', 'Grand brooder', 'Grand brooders', 'hive', 'hives'],
    ['hivequeen', 'Grand matriarch', 'Grand matriarchs', 'hive queen', 'hive queens'],
    ['empress', 'Roach empress', 'Roach empresses', 'hive empress', 'hive empresses'],
    ['prophet', 'Neuroprophet', 'Neuroprophets', 'neuroprophet', 'neuroprophets'],
    ['goddess', 'Elder sage', 'Elder sages', 'hive neuron', 'hive neurons'],
    ['pantheon', 'Pantheon', 'Pantheons', 'neural cluster', 'neural clusters'],
    ['pantheon2', 'Pantheon II', 'Pantheons II', 'hive network', 'hive networks'],
    ['pantheon3', 'Pantheon III', 'Pantheons III', 'lesser hive mind', 'lesser hive minds'],
    ['pantheon4', 'Pantheon IV', 'Pantheons IV', 'hive mind', 'hive minds'],
    ['pantheon5', 'Council mind', 'Council minds', 'arch-mind', 'arch-minds'],
    ['overmind', 'Overmind', 'Overminds', 'overmind', 'overminds'],
    ['overmind2', 'Overmind II', 'Overminds II', 'overmind II', 'overmind IIs'],
    ['overmind3', 'Overmind III', 'Overminds III', 'overmind III', 'overmind IIIs'],
    ['overmind4', 'Overmind IV', 'Overminds IV', 'overmind IV', 'overmind IVs'],
    ['overmind5', 'Overmind V', 'Overminds V', 'overmind V', 'overmind Vs'],
    ['overmind6', 'Overmind VI', 'Overminds VI', 'overmind VI', 'overmind VIs'],
    ['swarmling', 'Silverfish', 'Silverfish', 'swarmling', 'swarmlings'],
    ['stinger', 'Fire ant', 'Fire ants', 'stinger', 'stingers'],
    ['spider', 'House spider', 'House spiders', 'arachnomorph', 'arachnomorphs'],
    ['mosquito', 'Mosquito', 'Mosquitoes', 'culicimorph', 'culicimorphs'],
    ['locust', 'Cricket', 'Crickets', 'locust', 'locusts'],
    ['roach', 'Hissing roach', 'Hissing roaches', 'roach', 'roaches'],
    ['giantspider', 'Wolf spider', 'Wolf spiders', 'giant arachnomorph', 'giant arachnomorphs'],
    ['centipede', 'House centipede', 'House centipedes', 'chilopodomorph', 'chilopodomorphs'],
    ['wasp', 'Wasp', 'Wasps', 'wasp', 'wasps'],
    ['devourer', 'Stag beetle', 'Stag beetles', 'devourer', 'devourers'],
    ['goon', 'Rhino beetle', 'Rhino beetles', 'goon', 'goons'],
    ['nightbug', 'Firefly', 'Fireflies', 'nightbug', 'nightbugs'],
    ['moth', 'Moth', 'Moths', 'lepidoptera', 'lepidoptera'],
    ['bat', 'Bat', 'Bats', 'bat', 'bats'],
    ['mutanthatchery', 'Brood mutation', 'Brood mutations', 'hatchery mutation', 'hatchery mutations'],
    ['mutantbat', 'Power mutation', 'Power mutations', 'bat mutation', 'bat mutations'],
    ['mutantclone', 'Clone mutation', 'Clone mutations', 'clone mutation', 'clone mutations'],
    ['mutantswarmwarp', 'Time mutation', 'Time mutations', 'warp mutation', 'warp mutations'],
    ['mutantrush', 'Rush mutation', 'Rush mutations', 'rush mutation', 'rush mutations'],
    ['mutanteach', 'Meta-mutation', 'Meta-mutations', 'meta-mutation', 'meta-mutations'],
    ['mutantfreq', 'Mutation frequency', 'Mutation frequency', 'mutation frequency', 'mutation frequency'],
    ['mutantnexus', 'Energy mutation', 'Energy mutations', 'lepidoptera mutation', 'lepidoptera mutations'],
    ['mutantarmy', 'Territory mutation', 'Territory mutations', 'territory mutation', 'territory mutations'],
    ['mutantmeat', 'Crumb mutation', 'Crumb mutations', 'meat mutation', 'meat mutations']
  ];
  // Stock counters read as a collective noun ("Crumbs", not "Crumb") outside counted costs.
  var COLLECTIVE = {meat: 1, larva: 1, cocoon: 1, premutagen: 1};
  // Words that are the same in both numbers, where the bare word should read as a count of one.
  var BARE_SINGULAR = {nexus: 1, premutagen: 1};
  // Source-only countable nouns that are not units.
  var NOUNS = [
    ['Egg chamber', 'Egg chambers', 'hatchery', 'hatcheries'],
    ['Crevice', 'Crevices', 'expansion', 'expansions']
  ];
  // [id, source label, themed label]. Production, twin and empower upgrades follow unit names.
  var UPGRADES = [
    ['hatchery', 'hatchery', 'Egg chamber'],
    ['expansion', 'expansion', 'Crevice'],
    ['achievementbonus', 'accomplished ancestry', 'Accomplished ancestry'],
    ['cocooning', 'cocooning', 'Egg cases'],
    ['nexus1', 'construct nexus', 'Build a nexus'],
    ['nexus2', 'construct nexus', 'Build a nexus'],
    ['nexus3', 'construct nexus', 'Build a nexus'],
    ['nexus4', 'construct nexus', 'Build a nexus'],
    ['nexus5', 'construct nexus', 'Build a nexus'],
    ['larvarush', 'larva rush', 'Hatchling rush'],
    ['swarmwarp', 'swarmwarp', 'Time warp'],
    ['meatrush', 'meat rush', 'Crumb rush'],
    ['territoryrush', 'territory rush', 'Territory rush'],
    ['clonelarvae', 'clone larvae', 'Clone hatchlings'],
    ['clonearmy', 'house of mirrors', 'House of mirrors'],
    ['mutatehatchery', 'mutate hatcheries', 'Mutate brood'],
    ['mutatebat', 'mutate bats', 'Mutate power'],
    ['mutateclone', 'mutate clones', 'Mutate clones'],
    ['mutateswarmwarp', 'mutate swarmwarps', 'Mutate time'],
    ['mutaterush', 'mutate rushes', 'Mutate rushes'],
    ['mutateeach', 'meta-mutation', 'Meta-mutation'],
    ['mutatefreq', 'mutate frequency', 'Mutate frequency'],
    ['mutatenexus', 'mutate lepidoptera', 'Mutate energy'],
    ['mutatearmy', 'mutate territory', 'Mutate territory'],
    ['mutatemeat', 'mutate meat', 'Mutate crumbs']
  ];
  var UPGRADE_PATTERNS = [['prod', 'faster', 'Faster'], ['twin', 'twin', 'Twin'], ['empower', 'empower', 'Empower']];
  var PATTERN_UNITS = {prod: /^(drone|queen|nest|greaterqueen|hive|hivequeen|empress|prophet|goddess|pantheon[2-5]?|overmind[2-6]?)$/, twin: /^(drone|queen|nest|greaterqueen|hive|hivequeen|empress|prophet|goddess|pantheon[2-5]?|overmind[2-6]?|swarmling|stinger|spider|mosquito|locust|roach|giantspider|centipede|wasp|devourer|goon)$/, empower: /^(swarmling|stinger|spider|mosquito|locust|roach|giantspider|centipede|wasp|devourer|goon)$/};
  // [id, source label, themed label]. Source titles shielded from the free-text swaps, in sentence case.
  var ACHIEVEMENTS = [
    ['queen1', 'queen me', 'Queen me'],
    ['nest1', 'I wanna be the very nest', 'I wanna be the very nest'],
    ['hive1', 'we\'ll do it hive', 'We\'ll do it hive'],
    ['hive3', 'hive mind', 'Hive mind'],
    ['hivequeen1', 'too many kinds of queens', 'Too many kinds of queens'],
    ['hivequeen2', 'or just too many queens', 'Or just too many queens'],
    ['hivequeen3', 'no more queens, honest', 'No more queens, honest'],
    ['empress1', 'queen of queens', 'Queen of queens'],
    ['prophet1', '1. collect larvae', '1. Collect hatchlings'],
    ['pantheon43', 'swarm intelligence', 'Swarm intelligence']
  ];
  var TABS = {meat: 'Roaches', larva: 'Brood', territory: 'Territory', energy: 'Energy', mutagen: 'Mutations'};
  // Whole source sentences whose meaning, not just nouns, belonged to the alien swarm.
  var SENTENCES = {
    'All of your swarm\'s creatures eat meat.': 'Every roach in the colony eats crumbs.',
    'The children of your swarm. These young creatures morph into other adult units.': 'The colony\'s young. Hatchlings grow into every other kind of roach.',
    'Drones are the lowest class of worker in your swarm. They continuously gather meat to feed your swarm.': 'The colony\'s humblest workers. Forager roaches scour the floor for crumbs day and night.',
    'Queens rule over your swarm\'s workers.': 'Nest queens lay the eggs that keep forager roaches coming.',
    'Nests provide space and support for your swarm\'s queens.': 'Brood mothers tend the eggs that become nest queens.',
    'Greater queens rule over the lesser queens of very large swarms.': 'Colony matriarchs rule the nest queens of a sprawling colony and raise new brood mothers.',
    'Hives are huge structures crafted from meat and the bodies of thousands of queens. They allow your swarm to grow even faster.': 'Grand brooders are swollen with eggs, each one a future colony matriarch. They let the colony grow even faster.',
    'Hive queens oversee the production of hives in the largest swarms.': 'Grand matriarchs oversee the grand brooders of the largest colonies.',
    'The mightiest creature to rule over your swarm so far.': 'The mightiest roach to rule the colony so far.',
    'Neurons are the building blocks of a greater hive intelligence.': 'Elder sages are the building blocks of a greater colony intelligence.',
    'Groups of neurons begin to exert mild psychic powers, influencing the minds of lesser creatures in your swarm.': 'Groups of elder sages begin to exert mild psychic powers, influencing the minds of lesser creatures in your colony.',
    'Networking your hive\'s neurons allows them to coordinate their actions, much as a single entity would.': 'Networking the colony\'s sages allows them to coordinate their actions, much as a single roach would.',
    'Your neural networks have finally formed a single greater intelligence, primitive though it may be. The psychic powers of lesser hive minds are great enough to directly control several hundred lesser members of your swarm.': 'Your neural networks have finally formed a single greater intelligence, primitive though it may be. It can directly control several hundred roaches.',
    'Mature hive minds control thousands of lesser members of your swarm, and their capacity for intelligent planning is dramatically improved.': 'Mature minds control thousands of roaches, and their capacity for intelligent planning is dramatically improved.',
    'Multiple hive minds merge their collective consciousness into a single greater being.': 'Multiple minds merge their collective consciousness into a single greater being.',
    'The Overmind psychically controls the actions of every member of your swarm, including all of the lesser hive minds. Building more physical manifestations of the Overmind merely increases its influence; all belong to the same being, the same greater intelligence. Your swarm now exists to serve the will of its Overmind.': 'The Overmind psychically controls every roach in the colony, including all of the lesser minds. More of it merely increases its influence; all belong to the same greater intelligence. Your colony now exists to serve the will of its Overmind.',
    'Your swarm\'s smallest and weakest warriors. They use their teeth and claws to attack foes, and can be vicious in large numbers.': 'Small, slippery and quick. Silverfish hold the damp corners in numbers.',
    'Weak flying warriors. They roam in packs, attacking any threats with venomous stingers.': 'Fire ants march in lines and sting anything that wanders onto the colony\'s turf.',
    'Terrifying eight-legged beasts who leap upon their prey, ensnare it in sticky traps, and finally liquify it into a delicious beverage.': 'House spiders string webs across the corners and keep the turf clear of intruders.',
    'These hated creatures feast on the blood of their victims, and spread disease to larger prey they cannot kill outright.': 'Nobody likes mosquitoes, which is exactly why they make good guards.',
    'Groups of hungry locusts devour any creature that makes the mistake of standing in their way.': 'Crickets chirp an alarm at night and kick hard when cornered.',
    'The hard shell of the roach makes it a fearsome opponent; it is nearly impossible to kill.': 'Hard-shelled cousins from far away. Hissing roaches are nearly impossible to move once they settle in.',
    'The larger, and more fearsome, cousin of the arachnomorph.': 'The larger, hairier and much less friendly cousin of the house spider.',
    'Swift wormlike creatures with hundreds of legs and an extremely venomous bite.': 'Fast, many-legged and venomous. House centipedes clear out anything that moves.',
    'An advanced cousin of the stinger, wasps are far more aggressive and much better hunters.': 'Wasps patrol the window frame and hunt far better than fire ants.',
    'Huge burrowing worms, devourers appear from beneath the earth to swallow their prey before it can react.': 'Stag beetles lumber out from under the furniture and settle disputes with their mandibles.',
    'Goons cannot fly on their own, but instead use metal to construct powerful flying exoskeletons that rule the skies.': 'Rhino beetles are armored like tanks. Nothing pushes them off the colony\'s turf.',
    'Multiple roaches hatch from each larva.': 'Multiple hissing roaches hatch from each hatchling.',
    'Allows your larvae to encase themselves within cocoons. Cocooned larvae cannot mutate into other units, and can still be cloned by Clone Larvae. You may cocoon and uncocoon your larvae whenever you wish.': 'Lets hatchlings seal themselves in egg cases. Sealed hatchlings cannot grow into other roaches, but Clone hatchlings still copies them. Seal or release them whenever you like.',
    'Build your first nexus, which generates energy and allows you to cast basic spells.': 'Build your first nexus, which generates energy and unlocks basic abilities.',
    'Build your third nexus, generating even more energy and unlocking more advanced spells.': 'Build your third nexus, generating even more energy and unlocking more advanced abilities.',
    'Build your fourth nexus, generating even more energy and unlocking some of the most advanced spells available to your swarm.': 'Build your fourth nexus, generating even more energy and unlocking some of the most advanced abilities available to your colony.',
    'Build your fifth and final nexus. All spells and abilities are unlocked. Your spellcasters cannot channel energy from more than five nexus; this is the limit of their power.': 'Build your fifth and final nexus. All abilities are unlocked. Your colony cannot channel energy from more than five nexuses; this is the limit of its power.',
    // Tutorial hints whose wording or directions belonged to the original web game's screens.
    'Welcome to Swarm Simulator.': 'Welcome to Couch Colony.',
    'Starting with just a few larvae and a small pile of meat, grow a massive swarm of giant bugs.': 'From a few crumbs and hatchlings, grow a sprawling colony of roaches.',
    'Your brood starts its life with a small pile of meat and a single larva-producing hatchery.': 'Your brood starts its life with one egg chamber, where hatchlings are born.',
    'Larvae mutate into other units.': 'Hatchlings grow into every other kind of roach.',
    'You lead a small brood of worker drones.': 'You lead a small brood of forager roaches.',
    'Use this meat to build more drones and expand your brood.': 'Use these crumbs to hatch more forager roaches and expand your brood.',
    'Once you have plenty of meat, upgrade your hatchery to produce more larvae by selecting \'larvae\' and spending some meat.': 'Once you have plenty of crumbs, spend some on an egg chamber (Upgrades, Brood tab) to hatch more hatchlings.',
    'An arrow appears when you have enough meat to upgrade your hatchery.': 'You have enough crumbs to upgrade your egg chamber. Find it under Upgrades, in the Brood tab.',
    'Select \'larvae\' to expand.': 'Crevices wait under Upgrades, in the Brood tab.',
    'Expansion is the key to growing your swarm rapidly.': 'Crevices are the key to growing your colony rapidly.',
    'Take a look at the mutagen tab.': 'Take a look at Evolution in the menu.'
  };
  // Free-text nouns that are not labels of anything.
  var PHRASES = {
    swarm: 'colony', swarms: 'colonies', swarmwarps: 'time warps', 'larvae rush': 'hatchling rush',
    'meat production': 'crumb production', 'meat chain': 'crumb chain',
    'are constructed from': 'hatch from', 'are created from': 'hatch from'
  };

  var units = {}, upgrades = {}, achievements = {}, exact = {}, words = {};
  function lowerFirst(value) { return value.charAt(0).toLowerCase() + value.slice(1); }
  function upperFirst(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
  function countable(one, many, bare) { return {one: lowerFirst(one), many: lowerFirst(many), bare: lowerFirst(bare)}; }
  function word(key, entry) { if (!words[key]) words[key] = entry; }
  UNITS.forEach(function (row) {
    units[row[0]] = {one: row[1], many: row[2]};
    exact[row[3].toLowerCase()] = row[1];
    if (row[3] !== row[4] || !BARE_SINGULAR[row[0]]) exact[row[4].toLowerCase()] = row[2];
    if (row[3].toLowerCase() === lowerFirst(row[1]) && row[4].toLowerCase() === lowerFirst(row[2])) return;
    // Themed words map to themselves so text() is idempotent over its own output.
    word(row[1].toLowerCase(), countable(row[1], row[2], row[1]));
    word(row[2].toLowerCase(), countable(row[1], row[2], row[2]));
    // "roach" is also our own word for the colony, so only FOREIGN_ROACH renames it in prose.
    if (row[0] === 'roach') return;
    if (row[3] === row[4]) word(row[3].toLowerCase(), countable(row[1], row[2], BARE_SINGULAR[row[0]] ? row[1] : row[2]));
    else {
      word(row[3].toLowerCase(), countable(row[1], row[2], row[1]));
      word(row[4].toLowerCase(), countable(row[1], row[2], row[2]));
    }
  });
  NOUNS.forEach(function (row) {
    word(row[2], countable(row[0], row[1], row[0]));
    word(row[3], countable(row[0], row[1], row[1]));
    word(row[0].toLowerCase(), countable(row[0], row[1], row[0]));
    word(row[1].toLowerCase(), countable(row[0], row[1], row[1]));
  });
  function addUpgrade(id, source, themed) {
    upgrades[id] = themed;
    exact[source.toLowerCase()] = themed;
    word(source.toLowerCase(), {bare: lowerFirst(themed)});
    word(themed.toLowerCase(), {bare: lowerFirst(themed)});
  }
  UPGRADES.forEach(function (row) { addUpgrade(row[0], row[1], row[2]); });
  UNITS.forEach(function (row) {
    UPGRADE_PATTERNS.forEach(function (pattern) {
      if (PATTERN_UNITS[pattern[0]].test(row[0])) addUpgrade(row[0] + pattern[0], pattern[1] + ' ' + row[4], pattern[2] + ' ' + lowerFirst(row[2]));
    });
  });
  ACHIEVEMENTS.forEach(function (row) {
    achievements[row[0]] = row[2];
    if (!exact[row[1].toLowerCase()]) exact[row[1].toLowerCase()] = row[2];
  });
  Object.keys(PHRASES).forEach(function (key) { word(key, {bare: PHRASES[key]}); });

  function escape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function alternation(keys) { return keys.sort(function (a, b) { return b.length - a.length; }).map(escape).join('|'); }
  var SENTENCE_PATTERN = new RegExp(alternation(Object.keys(SENTENCES)), 'g');
  // Boundaries are explicit because \b fails beside punctuation such as "mutagen (inactive)".
  var WORD_PATTERN = new RegExp('(^|[^A-Za-z0-9_\'-])(' + alternation(Object.keys(words)) + ')(?![A-Za-z0-9_-])', 'gi');
  var NUMBER_BEFORE = /(?:^|[^\w.])([+-]?\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?[KMBT]?) $/;
  var NUMBER = /^[+-]?\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?[KMBT]?$/;
  // Source achievements say "Build" for nests and hives, which are now roaches.
  var BUILD = /\b([Bb])uild( your first| \d[\d,.]*(?:e[+-]?\d+)?[KMBT]?) (nests?|hives?)(?![\w-])/g;
  // The territory "roach" is the only source name that is also our own word for the colony.
  var FOREIGN_ROACH = /\b(Hatch \d[\d,.]*(?:e[+-]?\d+)?[KMBT]? |Purchased )(roach(?:es)?)(?![\w-]| empress)/g;

  function isOne(count) { return /^[+-]?1(?:\.0*)?$/.test(String(count).trim()); }
  function matchCase(source, replacement) {
    return source.charAt(0) !== source.charAt(0).toLowerCase() ? upperFirst(replacement) : replacement;
  }
  var cache = Object.create(null), cached = 0;
  function rewrite(input) {
    var whole = input.trim().toLowerCase();
    if (exact[whole]) return exact[whole];
    var output = input.replace(SENTENCE_PATTERN, function (sentence) { return SENTENCES[sentence]; })
      .replace(BUILD, function (all, b, quantity, noun) { return (b === 'B' ? 'Raise' : 'raise') + quantity + ' ' + noun; })
      .replace(FOREIGN_ROACH, function (all, lead, noun) { return lead + 'hissing ' + noun; });
    return output.replace(WORD_PATTERN, function (all, lead, found, offset, string) {
      var entry = words[found.toLowerCase()], replacement = entry.bare;
      if (entry.one) {
        var number = NUMBER_BEFORE.exec(string.slice(Math.max(0, offset + lead.length - 32), offset + lead.length));
        if (number) replacement = isOne(number[1]) ? entry.one : entry.many;
      }
      return lead + matchCase(found, replacement);
    });
  }
  function text(value) {
    var input = String(value || '');
    var output = cache[input];
    if (output === undefined) {
      // Snapshots repeat the same descriptions every refresh; the cap bounds changing input.
      if (cached >= 1024) { cache = Object.create(null); cached = 0; }
      output = cache[input] = rewrite(input);
      cached++;
    }
    return output;
  }
  function label(id, sourceName) {
    var unit = units[id];
    if (unit) return COLLECTIVE[id] ? unit.many : unit.one;
    return upgrades[id] || sourceName || id;
  }
  function plural(id, sourceName, count) {
    var unit = units[id];
    if (!unit) return sourceName || id;
    return count !== undefined && isOne(count) ? unit.one : unit.many;
  }
  var SUFFIX = {K: 3, M: 6, B: 9, T: 12, Q: 15, Qa: 15, Qi: 18, Sx: 21, Sp: 24, Oc: 27, No: 30, Dc: 33};
  // Engine numbers arrive as text such as 1,234.5, 10.12M or 2.35e+70. Truncating them to
  // three significant digits keeps on-screen widths steady without converting huge values.
  function short(value) {
    var raw = String(value === undefined || value === null ? '' : value).replace(/,/g, '');
    var match = /^(-?)(\d+)(?:\.(\d+))?(?:e\+?(-?\d+))?([KMBT]?)$/.exec(raw);
    if (!match) return raw.length > 24 ? raw.slice(0, 21) + '…' : raw;
    var digits = match[2].replace(/^0+(?=\d)/, '');
    var fraction = match[3] || '';
    var exponent = match[4];
    var suffix = match[5];
    if (exponent === undefined && !suffix && digits.length > 3) {
      var group = Math.floor((digits.length - 1) / 3);
      var lead = digits.length - group * 3;
      fraction = digits.slice(lead);
      if (group <= 4) suffix = ['', 'K', 'M', 'B', 'T'][group];
      else { exponent = String(digits.length - 1); fraction = digits.slice(1); lead = 1; }
      digits = digits.slice(0, lead);
    }
    fraction = fraction.slice(0, digits === '0' ? 2 : Math.max(0, 3 - digits.length)).replace(/0+$/, '');
    return match[1] + digits + (fraction ? '.' + fraction : '') + (exponent === undefined ? '' : 'e' + exponent) + suffix;
  }
  function whole(value) {
    var raw = String(value === undefined || value === null ? '' : value).replace(/,/g, '');
    return short(/^\d+\.\d+$/.test(raw) ? raw.split('.')[0] : raw);
  }
  function shortNumbers(value) {
    return String(value === undefined || value === null ? '' : value).replace(/(^|[\s(+])(\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?[KMBT]?)(?=$|[\s),.;])/g, function (all, before, number) { return before + short(number); });
  }
  // Whole-number strings > 4 digits get a compact form; the game's formatted values pass through.
  function compact(value) {
    var raw = String(value === undefined || value === null ? '' : value);
    if (!/^\d+$/.test(raw) || raw.length <= 4) return raw;
    return short(raw);
  }
  // log10 of a formatted amount such as "6.56M", "3.8e18" or "1e+300"; null when unreadable, -Infinity for 0.
  function magnitude(value) {
    var match = /^([\d.]+)(?:e\+?(-?\d+))?\s*([A-Z][a-z]?)?$/.exec(String(value === undefined || value === null ? '' : value).replace(/,/g, '').trim());
    if (!match) return null;
    var base = parseFloat(match[1]);
    if (!(base >= 0) || (match[3] && SUFFIX[match[3]] === undefined)) return null;
    if (base === 0) return -Infinity;
    return Math.log(base) / Math.LN10 + (match[2] ? Number(match[2]) : 0) + (match[3] ? SUFFIX[match[3]] : 0);
  }
  // Progress (0..1) and an ETA toward one cost part {have, need, rate}.
  function partProgress(part) {
    var have = magnitude(part && part.have);
    var need = magnitude(part && part.need);
    if (have === null || need === null) return {known: false, short: false, pct: 0, eta: null};
    if (have >= need) return {known: true, short: false, pct: 1, eta: 0};
    var ratio = Math.pow(10, have - need);
    var rate = magnitude(part && part.rate);
    var eta = null;
    if (rate !== null && rate > -Infinity) {
      var left = need + Math.log(1 - ratio) / Math.LN10 - rate;
      eta = left > 8 ? Infinity : Math.pow(10, left);
    }
    return {known: true, short: true, pct: ratio, eta: eta};
  }
  function itemProgress(costs) {
    var pct = 1;
    var eta = 0;
    var unknown = false;
    (costs || []).forEach(function (part) {
      var progress = partProgress(part);
      if (!progress.short) return;
      pct = Math.min(pct, progress.pct);
      if (progress.eta === null) unknown = true;
      else eta = Math.max(eta, progress.eta);
    });
    return {pct: pct, eta: unknown ? null : eta};
  }
  function effectText(effect) {
    var item = label(effect.id, effect.name);
    var amount = short(effect.amount);
    var countText = units[effect.id] ? (isOne(amount) ? units[effect.id].one : units[effect.id].many).toLowerCase() : String(item).toLowerCase();
    if (effect.stat === 'base') return '+' + amount + ' ' + countText + '/s';
    if (effect.stat === 'gain') return '+' + amount + ' ' + countText + ' now';
    if (effect.stat === 'power') return '×' + amount + ' ability power';
    if (effect.stat === 'capMult' || effect.stat === 'capFlat') return effect.op + amount + ' ' + item + ' capacity';
    return effect.op + amount + ' ' + item + (effect.stat === 'prod' ? ' output' : ' per hatch');
  }
  // Upgrade descriptions end with effects such as "Forager roach production multiplier: ×2"
  // after their last sentence or parenthetical; the phone shows the two separately.
  function upgradeText(description) {
    var wholeText = String(description || '').trim();
    var match = /^([^]*?[.)])\s+([^.()]*:[^]*?)\.?$/.exec(wholeText);
    var effect = match ? match[2] : '';
    var brief = ((match ? match[1] : wholeText).match(/^[^.]+(?:\.\d[^.]*)*\.?/) || [''])[0].trim();
    return {brief: brief, effect: effect ? effect.charAt(0).toUpperCase() + effect.slice(1) : ''};
  }

  return {
    label: label,
    plural: plural,
    upgradeLabel: function (id, sourceName) { return upgrades[id] || (sourceName ? upperFirst(text(sourceName)) : id); },
    achievementLabel: function (id, sourceName) { return achievements[id] || (sourceName ? upperFirst(sourceName) : id); },
    tabLabel: function (id, sourceName) { return TABS[id] || label(id, sourceName); },
    text: text,
    short: short,
    whole: whole,
    shortNumbers: shortNumbers,
    compact: compact,
    magnitude: magnitude,
    partProgress: partProgress,
    itemProgress: itemProgress,
    effectText: effectText,
    upgradeText: upgradeText,
    // costs: [{id, amount, name?}] where amount is already formatted for display.
    costText: function (costs) {
      if (!costs || !costs.length) return '0';
      return costs.map(function (cost) {
        var amount = String(cost.amount);
        var name = units[cost.id] ? (NUMBER.test(amount) && isOne(amount) ? units[cost.id].one : units[cost.id].many) : text(cost.name || cost.id);
        return amount + ' ' + name;
      }).join(' + ');
    },
    source: function (id, sourceName) {
      var themed = units[id] || upgrades[id] ? label(id, sourceName) : '';
      return themed && sourceName && themed.toLowerCase() !== String(sourceName).toLowerCase() ? sourceName : '';
    }
  };
}));
