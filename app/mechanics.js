/* Visible-time schedule for the colony's chance events: the golden roach, visiting insects,
   intruders, the night shift and the habitat events (a snack drop, an egg case, a molting roach,
   a dung beetle). It owns no economy and draws nothing; the colony page feeds it visible
   milliseconds and turns its events into habitat calls, toasts and engine rewards.
   Hidden time is never fed in, so nothing spawns or pays out while the colony is hidden. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachMechanics = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Rewards are seconds of current production, paid through the engine's reward action.
  var GOLDEN_REWARDS = [{resource: 'meat', seconds: 300}, {resource: 'larva', seconds: 120}];
  var VISITOR_REWARDS = {
    common: {first: [{resource: 'meat', seconds: 60}], repeat: [{resource: 'meat', seconds: 25}]},
    uncommon: {first: [{resource: 'meat', seconds: 120}, {resource: 'larva', seconds: 45}], repeat: [{resource: 'meat', seconds: 50}, {resource: 'larva', seconds: 20}]},
    rare: {first: [{resource: 'meat', seconds: 240}, {resource: 'larva', seconds: 90}, {resource: 'energy', seconds: 45}], repeat: [{resource: 'meat', seconds: 100}, {resource: 'larva', seconds: 40}, {resource: 'energy', seconds: 20}]}
  };
  // Each engine reward costs a long frame on the TV, so the same ~10% bonus is paid in rare lumps.
  var NIGHT_BONUS = {resource: 'meat', seconds: 12};
  var NIGHT_EVERY = 120000;
  // Habitat events: one at a time, every 10 to 20 visible minutes, never beside a golden roach or an intruder.
  // A snack pays once the foragers have hauled it home; an egg case and a molting roach pay only when Red catches
  // them. Seconds on screen run from low to high.
  var CHANCES = [
    {kind: 'snack', low: 30, high: 30, rewards: [{resource: 'meat', seconds: 90}]},
    {kind: 'egg', low: 60, high: 90, rewards: [{resource: 'larva', seconds: 120}]},
    {kind: 'molt', low: 45, high: 60, rewards: [{resource: 'meat', seconds: 45}]}
  ];
  var DUNG = {kind: 'dung', low: 35, high: 45, art: 'dung_beetle', name: 'dung beetle', caught: [{resource: 'territory', seconds: 180}, {resource: 'meat', seconds: 60}], home: [{resource: 'territory', seconds: 90}]};
  var CHANCE_CHOICES = {
    egg: {
      spec: {kind: 'egg', title: 'Egg case', defaultLabel: 'Hatch now (+2m hatchlings)', altId: 'nursery', altLabel: 'Incubate (+75s hatchlings & crumbs)'},
      altTitle: 'Egg case incubated',
      altRewards: [{resource: 'larva', seconds: 75}, {resource: 'meat', seconds: 75}]
    },
    molt: {
      spec: {kind: 'molt', title: 'Molting roach', defaultLabel: 'Catch now (+45s crumbs)', altId: 'nursery', altLabel: 'Study shell (+45s hatchlings, +30s crumbs)'},
      altTitle: 'Molted shell studied',
      altRewards: [{resource: 'larva', seconds: 45}, {resource: 'meat', seconds: 30}]
    },
    dung: {
      spec: {kind: 'dung', title: 'Dung beetle', defaultLabel: 'Claim ball (+3m territory, +1m crumbs)', altId: 'nursery', altLabel: 'Fortify turf (+4m territory)'},
      altTitle: 'Turf fortified',
      altRewards: [{resource: 'territory', seconds: 240}]
    }
  };
  var EXPEDITIONS = [
    {id: 'pantry', label: 'Pantry recon', seconds: 90, rewards: [{resource: 'meat', seconds: 120}, {resource: 'larva', seconds: 45}]},
    {id: 'baseboard', label: 'Baseboard survey', seconds: 120, rewards: [{resource: 'territory', seconds: 150}, {resource: 'meat', seconds: 60}]},
    {id: 'cellar', label: 'Deep pipe trek', seconds: 150, rewards: [{resource: 'larva', seconds: 120}, {resource: 'energy', seconds: 35}], discoverVisitor: true}
  ];
  var CHANCE_ART = {egg: {art: 'egg_case', name: 'egg case'}, molt: {art: 'molting_roach', name: 'molting roach'}};
  var SNACKS = [{art: 'snack_cereal_ring', name: 'cereal ring'}, {art: 'snack_pizza_crust', name: 'pizza crust'}, {art: 'snack_chip', name: 'potato chip'}];
  var MAX_LOG = 200;
  var TARGETS = ['golden', 'intruder', 'egg', 'molt', 'dung', 'visitor'];
  var GONE = {
    golden: 'The golden roach got away.',
    intruder: 'The intruder has already retreated.',
    egg: 'The egg case is gone.',
    molt: 'The molting roach got away.',
    dung: 'The dung beetle rolled away.',
    visitor: 'The visitor wandered off.'
  };
  // Colony-side achievements for the guests. "count" names what is measured; null max means the whole pool.
  var FEATS = [
    {id: 'guests1', name: 'Guest book', description: 'Log your first visitor.', count: 'visitors', max: 1},
    {id: 'guests10', name: 'Pest friends', description: 'Log 10 different visitors.', count: 'visitors', max: 10},
    {id: 'guestscommon', name: 'Common ground', description: 'Log every common visitor.', count: 'commons', max: null},
    {id: 'guestsall', name: 'Full house', description: 'Log every visitor.', count: 'visitors', max: null},
    {id: 'golden1', name: 'Heart of gold', description: 'Catch a golden roach.', count: 'golden', max: 1},
    {id: 'golden10', name: 'Gold standard', description: 'Catch 10 golden roaches.', count: 'golden', max: 10},
    {id: 'intruder1', name: 'Not in my nest', description: 'See off an intruder.', count: 'intruders', max: 1},
    {id: 'intruder5', name: 'Hold the perimeter', description: 'See off or repel 5 intruders.', count: 'intruders', max: 5}
  ];
  var FEAT_LABELS = {visitors: 'visitors', commons: 'common visitors', golden: 'golden roaches', intruders: 'intruders'};

  function between(random, low, high) { return low + random() * (high - low); }

  // A stable rarity per slug: about six in ten common, three uncommon, one rare.
  function rarity(slug) {
    var hash = 0;
    for (var i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
    var bucket = hash % 10;
    return bucket === 0 ? 'rare' : bucket < 4 ? 'uncommon' : 'common';
  }
  var WEIGHTS = {common: 6, uncommon: 3, rare: 1};

  function humanize(slug) {
    var words = String(slug).replace(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  var RARITY_REWARD_NOTES = {
    common: 'Common: +1m crumbs',
    uncommon: 'Uncommon: +2m crumbs, +45s hatchlings',
    rare: 'Rare: +4m crumbs, +90s hatchlings, +45s energy'
  };

  function visitorNote(slug) {
    var s = String(slug || '').toLowerCase();
    var note = 'Wanders through the baseboard warmth from the house beyond.';
    if (s.indexOf('butterfly') !== -1) note = 'Drifts past the warm glass on powdered wings.';
    else if (s.indexOf('moth') !== -1) note = 'Drawn from the dark baseboard by the screen glow.';
    else if (s.indexOf('beetle') !== -1 || s.indexOf('ladybug') !== -1 || s.indexOf('weevil') !== -1 || s.indexOf('scarab') !== -1) note = 'Clacks along the trim in a lacquered shell.';
    else if (s.indexOf('cricket') !== -1 || s.indexOf('grasshopper') !== -1 || s.indexOf('locust') !== -1 || s.indexOf('katydid') !== -1) note = 'Vaults from shadow to shadow on spring-loaded legs.';
    else if (s.indexOf('bee') !== -1 || s.indexOf('wasp') !== -1 || s.indexOf('hornet') !== -1) note = 'Hums along the molding searching for sweet residue.';
    else if (s.indexOf('ant') !== -1) note = 'Follows an invisible scent trail along the mortar.';
    else if (s.indexOf('dragonfly') !== -1 || s.indexOf('damselfly') !== -1) note = 'Hovers on glassy wings before darting out of reach.';
    else if (s.indexOf('mantis') !== -1) note = 'Waits motionless on the sill with folded forelegs.';
    else if (s.indexOf('spider') !== -1 || s.indexOf('tarantula') !== -1 || s.indexOf('harvestman') !== -1) note = 'Picks its way silently across the dusty corner.';
    else if (s.indexOf('fly') !== -1 || s.indexOf('mosquito') !== -1 || s.indexOf('gnat') !== -1) note = 'Circles the warm air currents near the lamp.';
    var tier = rarity(s);
    return note + ' · ' + (RARITY_REWARD_NOTES[tier] || RARITY_REWARD_NOTES.common);
  }

  function intruderNoun(species) {
    return species === 'centipede' ? 'house centipede' : 'house spider';
  }

  function redLabel(kind, detail) {
    if (kind === 'golden') return 'Catch golden roach';
    if (kind === 'intruder') return 'Repel ' + (detail === 'centipede' || detail === 'house centipede' ? 'house centipede' : 'house spider');
    if (kind === 'egg') return 'Hatch egg case';
    if (kind === 'molt') return 'Catch molting roach';
    if (kind === 'dung') return 'Claim soil ball';
    if (kind === 'visitor') return 'Catch ' + String(detail || 'visitor').toLowerCase();
    return '';
  }

  function goneMessage(kind) {
    return GONE[kind] || 'Nothing to catch now.';
  }

  function describeCatch(caught, gained) {
    if (!caught) return null;
    if (caught.choice === 'nursery' && caught.title) {
      return {
        toast: {id: caught.type, title: caught.title, description: gained ? gained + '.' : 'The nest puts it to work.'},
        urgent: true,
        message: caught.title + '.' + (gained ? ' ' + gained + '.' : '')
      };
    }
    if (caught.type === 'golden') {
      return {
        toast: {id: 'golden', title: 'Golden roach caught', description: gained ? gained + '.' : 'It had nothing on it this time.'},
        urgent: true,
        message: 'Golden roach caught.' + (gained ? ' ' + gained + '.' : '')
      };
    }
    if (caught.type === 'intruder') {
      var who = caught.species === 'centipede' ? 'House centipede' : 'House spider';
      return {
        toast: {id: 'intruder', title: who + ' driven off', description: gained ? gained + '.' : 'The perimeter holds.'},
        urgent: true,
        message: who + ' driven off.' + (gained ? ' ' + gained + '.' : '')
      };
    }
    if (caught.type === 'dung') {
      return {
        toast: {id: 'dung', title: 'Soil ball claimed', description: gained ? gained + '.' : 'The beetle keeps rolling.'},
        urgent: true,
        message: 'Soil ball claimed.' + (gained ? ' ' + gained + '.' : '')
      };
    }
    if (caught.type === 'egg' || caught.type === 'molt') {
      var entry = caught.type === 'egg' ? {id: 'egg', title: 'Egg case hatched', description: gained ? gained + '.' : 'The hatchlings scattered.'}
        : {id: 'molt', title: 'Molting roach caught', description: 'Fresh-shelled, it joins the foragers' + (gained ? ': ' + gained + ' (45 seconds of crumbs).' : '.')};
      return {
        toast: entry,
        urgent: true,
        message: entry.title + '.' + (gained ? ' ' + gained + '.' : '')
      };
    }
    if (caught.type === 'visitor') {
      return {
        toast: caught.first ? {id: 'visitor:' + caught.slug, title: 'New visitor', description: caught.name + (gained ? ' · ' + gained : '')} : null,
        urgent: !!caught.first,
        statusMessage: caught.first ? '' : 'Spotted a ' + caught.name.toLowerCase() + ' again.' + (gained ? ' ' + gained + '.' : ''),
        message: (caught.first ? 'New visitor: ' : 'Logged ') + caught.name + '.' + (gained ? ' ' + gained + '.' : '')
      };
    }
    return null;
  }

  function night(hour) { return hour >= 22 || hour < 6; }

  // options: random() in [0, 1), hour() for the TV's local clock, visitors() listing slugs, minute.
  function create(options) {
    var random = options.random || Math.random;
    var hour = options.hour || function () { return new Date().getHours(); };
    var visitors = options.visitors || function () { return []; };
    var energyOn = options.energy || function () { return false; };
    // Tests may shorten the minute that spacing between guests is measured in.
    var minute = options.minute > 0 ? options.minute : 60000;
    var elapsed = 0;
    var goldenAt = between(random, 10, 20) * minute;
    var visitorAt = between(random, 3, 6) * minute;
    var intruderAt = 0;
    // The first habitat event mirrors the golden roach in the same 10 to 20 minute window: an early golden roach
    // means a late event, so the two spread out.
    var chanceAt = 30 * minute - goldenAt;
    var chance = null;
    var golden = false;
    var visitor = null;
    var intruder = null;
    var nightOn = false;
    var nightAt = 0;
    var log = {};
    var firstSeen = {};
    var tally = {golden: 0, intruders: 0};
    var expedition = null;

    function pickVisitor() {
      var list = visitors() || [];
      var total = 0;
      var i;
      for (i = 0; i < list.length; i++) total += WEIGHTS[rarity(list[i])];
      var roll = random() * total;
      for (i = 0; i < list.length; i++) {
        roll -= WEIGHTS[rarity(list[i])];
        if (roll < 0) return list[i];
      }
      return list[list.length - 1] || '';
    }

    function visitorRewards(slug, first) {
      var table = VISITOR_REWARDS[rarity(slug)] || VISITOR_REWARDS.common;
      var rewards = (first ? table.first : table.repeat).slice();
      return energyOn() ? rewards : rewards.filter(function (reward) { return reward.resource !== 'energy'; });
    }
    function intruderPay(species, crevice, repel) {
      var base = repel ? 140 + 50 * species : 80 + 40 * species;
      var boosted = repel ? base * (1 + 0.15 * Math.floor((crevice || 0) / 10)) : base;
      return Math.min(600, Math.round(boosted));
    }
    function goneRewards(kind) {
      if (kind === 'snack') return CHANCES[0].rewards;
      if (kind === 'egg') return [{resource: 'larva', seconds: 35}];
      if (kind === 'dung') return DUNG.home;
      return null;
    }

    // Advances visible time by ms (capped so a stalled timer never counts as play) and
    // returns the events that came due. territory is the number of territory species owned.
    // crevice is the Crevice upgrade level, used only to scale a Red-key repel.
    function tick(ms, territory, crevice) {
      var events = [];
      ms = Math.max(0, Math.min(1000, Number(ms) || 0));
      elapsed += ms;
      var dark = night(hour());
      if (dark !== nightOn) { nightOn = dark; nightAt = elapsed + NIGHT_EVERY; events.push({type: 'night', on: dark}); }
      else if (nightOn && elapsed >= nightAt) { nightAt = elapsed + NIGHT_EVERY; events.push({type: 'reward', source: 'night', rewards: [NIGHT_BONUS]}); }
      if (!golden && !chance && elapsed >= goldenAt) { golden = true; events.push({type: 'golden'}); }
      if (visitor && elapsed >= visitor.until) {
        visitor = null;
        visitorAt = elapsed + between(random, 3, 6) * minute;
        events.push({type: 'visitorGone'});
      } else if (!visitor && elapsed >= visitorAt) {
        var slug = pickVisitor();
        if (slug) {
          var duration = Math.round(between(random, 40, 55) * 1000);
          visitor = {slug: slug, until: elapsed + duration};
          events.push({type: 'visitor', slug: slug, name: humanize(slug), rarity: rarity(slug), seconds: duration / 1000, dir: random() < 0.5 ? 1 : -1});
        } else visitorAt = elapsed + minute;
      }
      if (intruder && elapsed >= intruder.until) {
        tally.intruders = Math.min(9999, tally.intruders + 1);
        events.push({type: 'intruderGone', species: intruder.species, rewards: [{resource: 'territory', seconds: intruderPay(intruder.territory, intruder.crevice, false)}]});
        intruder = null;
        intruderAt = elapsed + between(random, 12, 22) * minute;
      } else if (!intruder) {
        // The clock only starts once there is territory to defend.
        if (!territory) intruderAt = 0;
        else if (!intruderAt) intruderAt = elapsed + between(random, 12, 22) * minute;
        else if (elapsed >= intruderAt && !chance) {
          var seconds = Math.round(between(random, 14, 18) * 10) / 10;
          intruder = {species: random() < 0.5 ? 'spider' : 'centipede', until: elapsed + seconds * 1000, territory: Math.max(1, Math.min(11, territory)), crevice: Math.max(0, Math.min(500, Math.floor(Number(crevice)) || 0))};
          events.push({type: 'intruder', species: intruder.species, seconds: seconds});
        }
      }
      if (chance && elapsed >= chance.until) {
        var done = chance;
        endChance();
        events.push({type: 'chanceGone', kind: done.kind, name: done.name, rewards: goneRewards(done.kind)});
      } else if (!chance && !golden && !intruder && elapsed >= chanceAt) {
        var dung = territory > 0 && random() < 0.22;
        var pick = dung ? DUNG : CHANCES[Math.min(CHANCES.length - 1, Math.floor(random() * CHANCES.length))];
        var look = pick.kind === 'snack' ? SNACKS[Math.min(SNACKS.length - 1, Math.floor(random() * SNACKS.length))] : pick.kind === 'dung' ? DUNG : CHANCE_ART[pick.kind];
        var length = Math.round(between(random, pick.low, pick.high));
        chance = {kind: pick.kind, name: look.name, until: elapsed + length * 1000};
        events.push({type: 'chance', kind: pick.kind, art: look.art, name: look.name, seconds: length});
      }
      if (expedition && ms > 0) {
        expedition.remainingMs = Math.max(0, expedition.remainingMs - ms);
        if (expedition.remainingMs <= 0) {
          var doneExp = expedition;
          expedition = null;
          var expSpec = null;
          for (var ei = 0; ei < EXPEDITIONS.length; ei++) {
            if (EXPEDITIONS[ei].id === doneExp.id) { expSpec = EXPEDITIONS[ei]; break; }
          }
          if (expSpec) {
            var expRewards = [];
            for (var ri = 0; ri < expSpec.rewards.length; ri++) {
              var rItem = expSpec.rewards[ri];
              if (rItem.resource === 'territory' && !territory) {
                expRewards.push({resource: 'meat', seconds: rItem.seconds});
              } else if (rItem.resource === 'energy' && !energyOn()) {
                continue;
              } else {
                expRewards.push({resource: rItem.resource, seconds: rItem.seconds});
              }
            }
            var discoveredSlug = '';
            if (expSpec.discoverVisitor) {
              discoveredSlug = pickVisitor();
              if (discoveredSlug) {
                if (!log[discoveredSlug] && !firstSeen[discoveredSlug]) firstSeen[discoveredSlug] = Date.now();
                log[discoveredSlug] = Math.min(9999, (log[discoveredSlug] || 0) + 1);
              }
            }
            events.push({type: 'expeditionDone', id: doneExp.id, label: doneExp.label, rewards: expRewards, visitor: discoveredSlug || ''});
          }
        }
      }
      return events;
    }

    function endChance() {
      chance = null;
      chanceAt = elapsed + between(random, 10, 20) * minute;
    }

    // Red's target, in priority order: the golden roach, then an intruder, then an egg case, molting roach
    // or dung beetle, then a visitor, then nothing (forage). A snack needs no Red.
    function target() { return golden ? 'golden' : intruder ? 'intruder' : chance && chance.kind !== 'snack' ? chance.kind : visitor ? 'visitor' : ''; }

    function redTarget() {
      var kind = target();
      var detail = kind === 'visitor' && visitor ? humanize(visitor.slug) : kind === 'intruder' && intruder ? intruderNoun(intruder.species) : '';
      return {
        kind: kind,
        name: detail,
        label: redLabel(kind, detail),
        goneMessage: goneMessage(kind)
      };
    }

    function catchOne(habitat) {
      if (golden) {
        golden = false;
        goldenAt = elapsed + between(random, 10, 20) * minute;
        tally.golden = Math.min(9999, tally.golden + 1);
        if (habitat && habitat.showGolden) habitat.showGolden(false);
        return {type: 'golden', rewards: GOLDEN_REWARDS};
      }
      if (intruder) {
        var driven = intruder;
        intruder = null;
        intruderAt = elapsed + between(random, 12, 22) * minute;
        tally.intruders = Math.min(9999, tally.intruders + 1);
        if (habitat && habitat.repelIntruder) habitat.repelIntruder();
        var rewards = [{resource: 'territory', seconds: intruderPay(driven.territory, driven.crevice, true)}, {resource: 'larva', seconds: 60}];
        if (energyOn()) rewards.push({resource: 'energy', seconds: 30});
        return {type: 'intruder', species: driven.species, rewards: rewards};
      }
      if (chance && chance.kind !== 'snack') {
        var kind = chance.kind;
        var rewards = kind === 'dung' ? DUNG.caught : CHANCES[kind === 'egg' ? 1 : 2].rewards;
        endChance();
        if (habitat && habitat.endChance) habitat.endChance(kind, true);
        return {type: kind, rewards: rewards};
      }
      if (visitor) {
        var slug = visitor.slug;
        var first = !log[slug];
        if (first && !firstSeen[slug]) firstSeen[slug] = Date.now();
        log[slug] = Math.min(9999, (log[slug] || 0) + 1);
        visitor = null;
        visitorAt = elapsed + between(random, 3, 6) * minute;
        if (habitat && habitat.showVisitor) habitat.showVisitor(null);
        return {type: 'visitor', slug: slug, name: humanize(slug), first: first, sightings: log[slug], rarity: rarity(slug), rewards: visitorRewards(slug, first)};
      }
      return null;
    }

    function choice() {
      if (!chance || !CHANCE_CHOICES[chance.kind]) return null;
      var s = CHANCE_CHOICES[chance.kind].spec;
      return {kind: s.kind, title: s.title, defaultLabel: s.defaultLabel, altId: s.altId, altLabel: s.altLabel};
    }

    function chooseOption(optionId, habitat) {
      if (!chance || chance.kind === 'snack') return null;
      if (optionId !== 'nursery') return catchOne(habitat);
      var kind = chance.kind;
      var entry = CHANCE_CHOICES[kind];
      if (!entry) return catchOne(habitat);
      var altRewards = entry.altRewards.map(function (r) { return {resource: r.resource, seconds: r.seconds}; });
      endChance();
      if (habitat && habitat.endChance) habitat.endChance(kind, true);
      return {type: kind, choice: 'nursery', title: entry.altTitle, rewards: altRewards};
    }

    function startExpedition(id) {
      if (expedition) return null;
      var spec = null;
      for (var i = 0; i < EXPEDITIONS.length; i++) {
        if (!id || EXPEDITIONS[i].id === id) { spec = EXPEDITIONS[i]; break; }
      }
      if (!spec) return null;
      var total = spec.seconds * 1000;
      expedition = {id: spec.id, label: spec.label, remainingMs: total, totalMs: total};
      return {id: expedition.id, label: expedition.label, remainingMs: expedition.remainingMs, totalMs: expedition.totalMs};
    }

    function cancelExpedition() {
      if (!expedition) return false;
      expedition = null;
      return true;
    }

    function getExpedition() {
      if (!expedition) return null;
      return {id: expedition.id, label: expedition.label, remainingMs: expedition.remainingMs, totalMs: expedition.totalMs};
    }

    function loadExpedition(saved) {
      expedition = null;
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      var spec = null;
      for (var i = 0; i < EXPEDITIONS.length; i++) {
        if (EXPEDITIONS[i].id === saved.id) { spec = EXPEDITIONS[i]; break; }
      }
      var rem = Math.floor(Number(saved.remainingMs));
      if (!spec || !(rem > 0) || !isFinite(rem)) return;
      var total = spec.seconds * 1000;
      expedition = {id: spec.id, label: spec.label, remainingMs: Math.min(total, rem), totalMs: total};
    }

    // Advances visible time and dispatches guest/event transitions to the habitat, controller link, and reward queue.
    function step(ms, territory, crevice, hooks) {
      hooks = hooks || {};
      var habitat = hooks.habitat;
      var events = tick(ms, territory, crevice);
      events.forEach(function (event) {
        if (event.type === 'golden') {
          if (habitat && habitat.showGolden) habitat.showGolden(true);
          if (hooks.onPhoneEvent) hooks.onPhoneEvent('Golden roach', 'Press Red on the remote or here before it slips away.');
        } else if (event.type === 'visitor') {
          if (!habitat || !habitat.showVisitor || !habitat.showVisitor(event.slug, event.seconds, event.dir, event.rarity)) leave();
        } else if (event.type === 'visitorGone') {
          if (habitat && habitat.showVisitor) habitat.showVisitor(null);
        } else if (event.type === 'chance') {
          if (!habitat || !habitat.showChance || !habitat.showChance(event.kind, event.art, event.seconds)) dropChance();
          else if (event.kind !== 'snack' && hooks.onPhoneEvent) {
            hooks.onPhoneEvent(
              event.kind === 'egg' ? 'Egg case' : event.kind === 'dung' ? 'Dung beetle' : 'Molting roach',
              event.kind === 'dung' ? 'Press Red to claim the soil ball.' : 'Press Red on the remote or here before the colony takes it in.'
            );
          }
        } else if (event.type === 'chanceGone') {
          if (habitat && habitat.endChance) habitat.endChance(event.kind, false);
          if (event.rewards && hooks.onReward) {
            var hauled = event.kind === 'egg' ? {title: 'Egg case carried into the nest', text: 'Two carriers hauled it home.'}
              : event.kind === 'dung' ? {title: 'Soil rolled home', text: 'The beetle reached the claim post.'}
              : {title: 'Snack hauled home', text: 'The foragers carried off a ' + event.name + '.'};
            hooks.onReward({rewards: event.rewards, title: hauled.title, text: hauled.text});
          }
        } else if (event.type === 'intruder') {
          if (habitat && habitat.showIntruder) habitat.showIntruder(event.species, event.seconds);
        } else if (event.type === 'intruderGone') {
          if (habitat && habitat.showIntruder) habitat.showIntruder(null);
          if (hooks.onTallyChanged) hooks.onTallyChanged();
          if (hooks.onReward) hooks.onReward({rewards: event.rewards, title: 'Intruder seen off', text: 'The guards saw off the ' + intruderNoun(event.species) + '.'});
        } else if (event.type === 'night') {
          if (habitat && habitat.setNight) habitat.setNight(event.on);
          if (hooks.onNight) hooks.onNight(event.on);
        } else if (event.type === 'expeditionDone') {
          if (habitat && habitat.startCaravan) habitat.startCaravan();
          if (hooks.onReward) hooks.onReward({rewards: event.rewards, title: event.label + ' complete', text: 'The scouts returned to the nest.'});
        } else if (event.type === 'reward' && hooks.onReward) {
          hooks.onReward({rewards: event.rewards});
        }
      });
      return events;
    }

    // A visitor the habitat cannot draw leaves at once, so Red never catches something unseen.
    function leave() {
      if (!visitor) return;
      visitor = null;
      visitorAt = elapsed + between(random, 3, 6) * minute;
    }

    // A habitat event the habitat cannot place leaves at once, unrewarded.
    function dropChance() {
      if (chance) endChance();
    }

    // Closing the colony sends every guest away unrewarded; the schedule itself keeps its place.
    function hide() {
      var gone = golden || visitor || intruder || chance;
      if (chance) endChance();
      if (golden) goldenAt = elapsed + between(random, 10, 20) * minute;
      if (visitor) visitorAt = elapsed + between(random, 3, 6) * minute;
      if (intruder) intruderAt = elapsed + between(random, 12, 22) * minute;
      golden = false;
      visitor = null;
      intruder = null;
      nightOn = false;
      return !!gone;
    }

    function load(saved) {
      log = {};
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      Object.keys(saved).slice(0, MAX_LOG).forEach(function (slug) {
        var count = Math.floor(Number(saved[slug]));
        if (/^[a-z0-9][a-z0-9_-]{0,47}$/.test(slug) && count > 0) log[slug] = Math.min(9999, count);
      });
    }

    function loadTally(saved) {
      tally = {golden: 0, intruders: 0};
      if (!saved || typeof saved !== 'object') return;
      Object.keys(tally).forEach(function (key) { tally[key] = Math.max(0, Math.min(9999, Math.floor(Number(saved[key])) || 0)); });
    }

    function loadFirstSeen(saved) {
      firstSeen = {};
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      Object.keys(saved).slice(0, MAX_LOG).forEach(function (slug) {
        var ts = Math.floor(Number(saved[slug]));
        if (/^[a-z0-9][a-z0-9_-]{0,47}$/.test(slug) && ts > 0 && isFinite(ts)) firstSeen[slug] = ts;
      });
    }

    function keepsakes(slugs) {
      var visitorCount = 0;
      if (Array.isArray(slugs) && slugs.length) {
        slugs.forEach(function (slug) { if (log[slug]) visitorCount++; });
      } else {
        Object.keys(log).forEach(function (slug) { if (log[slug] > 0) visitorCount++; });
      }
      return [
        {id: 'keepsake_beetle_shell', label: 'Bronze elytra', condition: 'Log your first visitor', unlocked: visitorCount >= 1},
        {id: 'keepsake_cricket_shell', label: 'Molted jumper', condition: 'Log 5 visitors', unlocked: visitorCount >= 5},
        {id: 'keepsake_moth_stone', label: 'Wing-marked stone', condition: 'Catch a golden roach', unlocked: tally.golden >= 1},
        {id: 'keepsake_snail_shell', label: 'Spiral shell', condition: 'See off an intruder', unlocked: tally.intruders >= 1}
      ];
    }

    // Achievement rows in the engine's shape, measured against the visitor pool the habitat can draw.
    // Visitor goals wait for a pool large enough to reach them; ids are prefixed apart from the source's.
    function feats(slugs) {
      slugs = slugs || [];
      var have = {visitors: 0, commons: 0, golden: tally.golden, intruders: tally.intruders};
      var pool = {visitors: slugs.length, commons: 0};
      slugs.forEach(function (slug) {
        var common = rarity(slug) === 'common';
        if (common) pool.commons++;
        if (log[slug]) { have.visitors++; if (common) have.commons++; }
      });
      return FEATS.filter(function (feat) { return !(feat.count in pool) || pool[feat.count] >= (feat.max || 1); }).map(function (feat) {
        var max = feat.max || pool[feat.count];
        var value = Math.min(have[feat.count], max);
        var earned = value >= max;
        return {id: 'colony:' + feat.id, name: feat.name, description: feat.description, earned: earned, earnedAt: 0, masked: false, colony: true,
          progress: earned ? null : {kind: 'colony', label: FEAT_LABELS[feat.count], value: String(value), max: String(max), percent: value / max}};
      });
    }

    function state() {
      return {elapsed: elapsed, golden: golden, visitor: visitor && visitor.slug, intruder: intruder && intruder.species, chance: chance && chance.kind, night: nightOn, goldenAt: goldenAt, visitorAt: visitorAt, intruderAt: intruderAt, chanceAt: chanceAt};
    }

    return {
      tick: tick,
      step: step,
      target: target,
      redTarget: redTarget,
      catchOne: catchOne,
      choice: choice,
      chooseOption: chooseOption,
      startExpedition: startExpedition,
      cancelExpedition: cancelExpedition,
      expedition: getExpedition,
      loadExpedition: loadExpedition,
      expeditions: EXPEDITIONS.slice(),
      describeCatch: describeCatch,
      leave: leave,
      dropChance: dropChance,
      hide: hide,
      load: load,
      loadTally: loadTally,
      loadFirstSeen: loadFirstSeen,
      firstSeen: function () { var copy = {}; for (var slug in firstSeen) copy[slug] = firstSeen[slug]; return copy; },
      keepsakes: keepsakes,
      visitorNote: visitorNote,
      tally: function () { return {golden: tally.golden, intruders: tally.intruders}; },
      feats: feats,
      log: function () { var copy = {}; for (var slug in log) copy[slug] = log[slug]; return copy; },
      state: state
    };
  }

  return {
    create: create,
    humanize: humanize,
    rarity: rarity,
    visitorNote: visitorNote,
    expeditions: EXPEDITIONS.slice(),
    night: night,
    targets: TARGETS.slice(),
    redLabel: redLabel,
    goneMessage: goneMessage,
    describeCatch: describeCatch
  };
}));
