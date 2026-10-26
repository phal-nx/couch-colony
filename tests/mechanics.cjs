const test = require('node:test');
const assert = require('node:assert/strict');
const Mechanics = require('../app/mechanics');
const MINUTE = 60000;

function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
function make(options = {}) {
  return Mechanics.create(Object.assign({random: seeded(7), hour: () => 14, visitors: () => ['monarch-butterfly', 'ladybug', 'stag-beetle']}, options));
}
// Feeds visible time in half-second ticks like the colony's simulation timer.
function run(mechanics, ms, territory = 0, crevice = 0) {
  const events = [];
  for (let t = 0; t < ms; t += 500) events.push(...mechanics.tick(500, territory, crevice));
  return events;
}

test('the golden roach appears after 10 to 20 visible minutes, alone, and waits to be caught', () => {
  for (let seed = 1; seed < 40; seed++) {
    const m = make({random: seeded(seed), visitors: () => []});
    const before = run(m, 10 * MINUTE - 500);
    assert.equal(before.filter(e => e.type === 'golden').length, 0);
    const after = run(m, 30 * MINUTE);
    assert.equal(after.filter(e => e.type === 'golden').length, 1, 'never a second golden roach while one waits');
    assert.equal(m.target(), 'golden');
  }
});

test('Red catches the golden roach before a visitor and pays minutes of production', () => {
  const m = make();
  run(m, 21 * MINUTE);
  assert.equal(m.state().golden, true);
  for (let i = 0; i < 2400 && !m.state().visitor; i++) m.tick(500, 0);
  assert.equal(m.state().golden, true, 'the golden roach waits');
  assert.ok(m.state().visitor, 'a visitor is wandering too');
  const first = m.catchOne();
  assert.equal(first.type, 'golden');
  assert.deepEqual(first.rewards, [{resource: 'meat', seconds: 300}, {resource: 'larva', seconds: 120}]);
  const second = m.catchOne();
  assert.equal(second.type, 'visitor');
  assert.equal(second.first, true);
  assert.deepEqual(second.rewards, [{resource: 'meat', seconds: 60}]);
  assert.equal(m.catchOne(), null, 'with nothing on screen Red forages');
  assert.equal(m.target(), '');
});

test('visitors are logged once with a name, then pay a smaller repeat reward', () => {
  const m = make({visitors: () => ['monarch-butterfly']});
  const spawned = run(m, 6 * MINUTE).filter(e => e.type === 'visitor');
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].name, 'Monarch butterfly');
  assert.ok(spawned[0].seconds >= 40 && spawned[0].seconds <= 55);
  assert.equal(m.catchOne().first, true);
  run(m, 6 * MINUTE);
  const repeat = m.catchOne();
  assert.equal(repeat.first, false);
  assert.equal(repeat.sightings, 2);
  assert.deepEqual(repeat.rewards, [{resource: 'meat', seconds: 25}]);
  assert.deepEqual(m.log(), {'monarch-butterfly': 2});
  m.load({'monarch-butterfly': 3, 'Bad Slug': 2, __proto__: 1, ladybug: -1});
  assert.deepEqual(m.log(), {'monarch-butterfly': 3});
});

test('an uncaught visitor wanders off and the next one comes minutes later', () => {
  const m = make();
  const events = run(m, 7 * MINUTE);
  const shown = events.findIndex(e => e.type === 'visitor');
  assert.ok(shown >= 0);
  assert.ok(events.slice(shown).some(e => e.type === 'visitorGone'));
  assert.equal(m.target(), m.state().golden ? 'golden' : '');
});

test('rarer visitors come less often', () => {
  const slugs = Array.from({length: 60}, (_, i) => 'bug-' + i);
  const counts = {common: 0, uncommon: 0, rare: 0};
  const m = make({random: seeded(3), visitors: () => slugs});
  for (let i = 0; i < 400; i++) {
    const spawn = run(m, 7 * MINUTE).filter(e => e.type === 'visitor')[0];
    if (spawn) counts[Mechanics.rarity(spawn.slug)]++;
  }
  const share = {common: 0, uncommon: 0, rare: 0};
  slugs.forEach(slug => share[Mechanics.rarity(slug)]++);
  assert.ok(counts.rare / share.rare < counts.common / share.common, JSON.stringify(counts));
});

test('intruders need territory, retreat within 14 to 18 seconds and grant scaled territory', () => {
  const m = make({visitors: () => []});
  assert.equal(run(m, 40 * MINUTE, 0).filter(e => e.type === 'intruder').length, 0, 'no intruders without territory');
  const events = run(m, 31 * MINUTE, 3);
  const start = events.findIndex(e => e.type === 'intruder');
  assert.ok(start >= 0);
  assert.ok(['spider', 'centipede'].includes(events[start].species));
  assert.ok(events[start].seconds >= 14 && events[start].seconds <= 18);
  const gone = events.findIndex(e => e.type === 'intruderGone');
  const ticks = events.slice(start, gone).length;
  assert.ok(gone > start);
  assert.deepEqual(events[gone].rewards, [{resource: 'territory', seconds: 200}]);
  assert.ok(ticks <= 38, 'the retreat ends within the stated time');
  const rally = make({visitors: () => []});
  let driven = null;
  for (let t = 0; t < 31 * MINUTE && !driven; t += 500) {
    rally.tick(500, 11, 20);
    if (rally.state().golden) rally.catchOne();
    if (rally.target() === 'intruder') driven = rally.catchOne();
  }
  assert.equal(driven.type, 'intruder');
  assert.equal(driven.rewards[0].seconds, 600, 'eleven species and two crevice tens reach the cap');
  assert.deepEqual(driven.rewards[1], {resource: 'larva', seconds: 60});
});

test('the night shift runs only between 22:00 and 06:00 and pays every two visible minutes', () => {
  let hour = 21;
  const m = make({hour: () => hour, visitors: () => []});
  assert.equal(run(m, 60000).filter(e => e.type === 'reward').length, 0);
  hour = 22;
  const night = run(m, 600000);
  assert.deepEqual(night[0], {type: 'night', on: true});
  const bonuses = night.filter(e => e.type === 'reward' && e.source === 'night');
  assert.equal(bonuses.length, 4);
  assert.deepEqual(bonuses[0].rewards, [{resource: 'meat', seconds: 12}]);
  hour = 5;
  assert.equal(run(m, 120000).filter(e => e.type === 'reward' && e.source === 'night').length, 1);
  hour = 6;
  assert.deepEqual(run(m, 30000).filter(e => e.type !== 'golden'), [{type: 'night', on: false}]);
  for (const h of [0, 3, 23]) assert.equal(Mechanics.night(h), true);
  for (const h of [6, 12, 21]) assert.equal(Mechanics.night(h), false);
});

test('hidden time grants nothing: no ticks, no spawns, and hiding sends guests away unrewarded', () => {
  const m = make({hour: () => 23});
  run(m, 21 * MINUTE, 2);
  assert.equal(m.target(), 'golden');
  const before = m.state().elapsed;
  // A long stall between timer ticks counts as at most a second of play.
  m.tick(6 * 3600 * 1000, 2);
  assert.equal(m.state().elapsed, before + 1000);
  assert.equal(m.hide(), true);
  assert.equal(m.target(), '');
  assert.equal(m.catchOne(), null);
  assert.equal(m.state().intruder, null);
  const reopened = m.tick(500, 2);
  assert.deepEqual(reopened.filter(e => e.type === 'night'), [{type: 'night', on: true}]);
  assert.equal(reopened.some(e => e.type === 'reward'), false, 'reopening at night pays nothing until two visible minutes pass');
});

test('display names are humanized slugs', () => {
  assert.equal(Mechanics.humanize('monarch-butterfly'), 'Monarch butterfly');
  assert.equal(Mechanics.humanize('stag_beetle'), 'Stag beetle');
});

test('guest achievements track the visitor log, golden catches and intruders, and survive a reload', () => {
  const slugs = Array.from({length: 30}, (_, i) => 'bug-' + i);
  const commons = slugs.filter(slug => Mechanics.rarity(slug) === 'common');
  const m = make({visitors: () => slugs});
  const byId = list => Object.fromEntries(list.map(entry => [entry.id.replace('colony:', ''), entry]));
  let feats = byId(m.feats(slugs));
  assert.deepEqual(Object.keys(feats), ['guests1', 'guests10', 'guestscommon', 'guestsall', 'golden1', 'golden10', 'intruder1', 'intruder5']);
  assert.ok(Object.values(feats).every(entry => !entry.earned && entry.progress.value === '0'));
  assert.equal(feats.guestscommon.progress.max, String(commons.length));
  assert.equal(feats.guestsall.progress.label, 'visitors');

  m.load(Object.fromEntries(commons.map(slug => [slug, 1])));
  feats = byId(m.feats(slugs));
  assert.equal(feats.guests1.earned, true);
  assert.equal(feats.guests1.progress, null);
  assert.equal(feats.guestscommon.earned, true);
  assert.equal(feats.guestsall.earned, false);
  assert.equal(feats.guestsall.progress.value, String(commons.length));
  assert.equal(byId(m.feats(slugs.concat('bug-new'))).guestsall.progress.max, '31', 'new art reopens the full set');

  run(m, 21 * MINUTE);
  assert.equal(m.catchOne().type, 'golden');
  const events = run(m, 40 * MINUTE, 2);
  const repelled = events.filter(e => e.type === 'intruderGone').length;
  assert.ok(repelled > 0);
  m.hide();
  assert.deepEqual(m.tally(), {golden: 1, intruders: repelled});
  feats = byId(m.feats(slugs));
  assert.equal(feats.golden1.earned, true);
  assert.equal(feats.golden10.progress.value, '1');
  assert.equal(feats.intruder1.earned, true);

  const reloaded = make();
  reloaded.loadTally(JSON.parse(JSON.stringify(m.tally())));
  assert.deepEqual(reloaded.tally(), m.tally());
  reloaded.loadTally({golden: 'x', intruders: -4, extra: 9});
  assert.deepEqual(reloaded.tally(), {golden: 0, intruders: 0});
  assert.deepEqual(make().feats([]).map(entry => entry.id), ['colony:golden1', 'colony:golden10', 'colony:intruder1', 'colony:intruder5'], 'visitor goals wait for visitor art');
});

// Runs visible time until the next habitat event, catching any golden roach as soon as it shows.
function nextChance(mechanics, territory = 0) {
  for (let t = 0; t < 45 * MINUTE; t += 500) {
    const events = mechanics.tick(500, territory);
    if (mechanics.state().golden) mechanics.catchOne();
    const found = events.find(e => e.type === 'chance');
    if (found) return found;
  }
  return null;
}

test('habitat events come one at a time every 10 to 20 visible minutes, never beside a golden roach or an intruder', () => {
  const kinds = {snack: 0, egg: 0, molt: 0};
  for (let seed = 1; seed < 30; seed++) {
    const m = make({random: seeded(seed), visitors: () => []});
    const first = nextChance(m);
    assert.ok(first, 'an event arrives');
    const at = m.state().elapsed;
    assert.ok(at >= 10 * MINUTE && at <= 21.5 * MINUTE, 'first event at ' + at / MINUTE + ' minutes');
    kinds[first.kind]++;
    assert.equal(m.state().golden, false);
    // While it is out, neither the golden roach, an intruder nor a second event starts.
    const during = run(m, first.seconds * 1000 - 500, 3);
    assert.equal(during.filter(e => ['chance', 'golden', 'intruder'].includes(e.type)).length, 0);
    const end = run(m, 1000, 3).find(e => e.type === 'chanceGone');
    assert.ok(end, 'it leaves on time');
    const gap = m.state().chanceAt - m.state().elapsed;
    assert.ok(gap >= 10 * MINUTE - 1000 && gap <= 20 * MINUTE, 'the next one is 10 to 20 minutes away');
  }
  assert.ok(kinds.snack && kinds.egg && kinds.molt, 'all three kinds come up: ' + JSON.stringify(kinds));
});

test('a snack is hauled home in 30 seconds and pays crumbs then; Red ignores it', () => {
  const m = make({random: () => 0.1, visitors: () => []});
  const snack = nextChance(m);
  assert.equal(snack.kind, 'snack');
  assert.ok(['snack_cereal_ring', 'snack_pizza_crust', 'snack_chip'].includes(snack.art));
  assert.equal(snack.seconds, 30);
  assert.equal(m.target(), '', 'a snack needs no Red');
  assert.equal(m.catchOne(), null);
  const events = run(m, 30500);
  assert.deepEqual(events.filter(e => e.type === 'chanceGone'), [{type: 'chanceGone', kind: 'snack', name: snack.name, rewards: [{resource: 'meat', seconds: 90}]}]);
});

test('Red takes the golden roach, then an egg case or molting roach, then a visitor; uncaught ones leave unrewarded', () => {
  // A roll of 0.5 picks the egg case and 0.9 the molting roach.
  for (const [roll, kind, rewards] of [[0.5, 'egg', [{resource: 'larva', seconds: 120}]], [0.9, 'molt', [{resource: 'meat', seconds: 45}]]]) {
    const m = make({random: () => roll, visitors: () => ['ladybug']});
    const shown = nextChance(m);
    assert.equal(shown.kind, kind);
    assert.ok(shown.seconds >= (kind === 'egg' ? 60 : 45) && shown.seconds <= (kind === 'egg' ? 90 : 60));
    assert.equal(m.target(), kind);
    // With these rolls a visitor wanders in while the egg case waits, but not before the molting roach leaves.
    const until = m.state().elapsed + (shown.seconds - 2) * 1000;
    while (!m.state().visitor && m.state().elapsed < until) m.tick(100, 0);
    assert.equal(!!m.state().visitor, kind === 'egg');
    assert.equal(m.target(), kind, 'a visitor waits behind it');
    assert.deepEqual(m.catchOne(), {type: kind, rewards});
    assert.equal(m.state().chance, null);
    assert.equal(m.target(), kind === 'egg' ? 'visitor' : '');
    // The next one is left alone and goes with nothing.
    const again = nextChance(m);
    assert.equal(again.kind, kind);
    const gone = run(m, again.seconds * 1000 + 500).filter(e => e.type === 'chanceGone');
    assert.deepEqual(gone, [{type: 'chanceGone', kind, name: again.name, rewards: kind === 'egg' ? [{resource: 'larva', seconds: 35}] : null}]);
  }
  // A golden roach already out holds the event back, and Red would take it first.
  const golden = make({random: () => 0.5, visitors: () => []});
  run(golden, 15 * MINUTE + 500);
  assert.equal(golden.state().golden, true);
  assert.equal(golden.state().chance, null, 'an event waits while the golden roach is out');
  assert.equal(golden.target(), 'golden');
  assert.equal(golden.catchOne().type, 'golden');
  assert.equal(run(golden, 1000).filter(e => e.type === 'chance').length, 1, 'and comes once it is caught');
  assert.equal(golden.target(), 'egg');
});

test('hiding sends a habitat event away unrewarded, and hidden time never brings one', () => {
  const m = make({random: () => 0.5, visitors: () => []});
  nextChance(m);
  assert.equal(m.target(), 'egg');
  assert.equal(m.hide(), true);
  assert.equal(m.state().chance, null);
  assert.equal(m.target(), '');
  assert.equal(m.catchOne(), null);
  const at = m.state().chanceAt;
  assert.ok(at >= m.state().elapsed + 10 * MINUTE);
  // A long stall between timer ticks counts as at most a second of play.
  assert.equal(m.tick(30 * MINUTE, 0).some(e => e.type === 'chance'), false);
  m.dropChance();
  assert.equal(m.state().chanceAt, at, 'dropping when nothing is out changes nothing');
});

test('redTarget, describeCatch and step unify all six catchable targets and habitat hooks', () => {
  assert.deepEqual(Mechanics.targets, ['golden', 'intruder', 'egg', 'molt', 'dung', 'visitor']);
  assert.equal(Mechanics.redLabel('intruder', 'centipede'), 'Repel house centipede');
  assert.equal(Mechanics.redLabel('dung'), 'Claim soil ball');
  assert.equal(Mechanics.goneMessage('intruder'), 'The intruder has already retreated.');
  assert.equal(Mechanics.goneMessage('dung'), 'The dung beetle rolled away.');

  const calls = [];
  const habitat = {
    showGolden(on) { calls.push(['golden', on]); return true; },
    showVisitor(slug) { calls.push(['visitor', slug]); return true; },
    showIntruder(species) { calls.push(['intruder', species]); return true; },
    repelIntruder() { calls.push(['repel']); return true; },
    showChance(kind) { calls.push(['chance', kind]); return true; },
    endChance(kind, caught) { calls.push(['endChance', kind, caught]); return true; },
    setNight(on) { calls.push(['night', on]); }
  };
  const rewards = [];
  const phoneEvents = [];
  const m = make({random: () => 0.1, hour: () => 23, visitors: () => ['ladybug']});
  for (let t = 0; t < 21 * MINUTE; t += 500) {
    m.step(500, 2, 10, {
      habitat,
      onPhoneEvent: (title, text) => phoneEvents.push({title, text}),
      onReward: entry => rewards.push(entry)
    });
  }
  assert.equal(m.redTarget().kind, 'golden');
  assert.equal(m.redTarget().label, 'Catch golden roach');
  const caught = m.catchOne(habitat);
  const described = Mechanics.describeCatch(caught, '+120 crumbs');
  assert.equal(described.toast.title, 'Golden roach caught');
  assert.equal(described.message, 'Golden roach caught. +120 crumbs.');
  assert.ok(calls.some(c => c[0] === 'golden' && c[1] === true));
  assert.ok(calls.some(c => c[0] === 'golden' && c[1] === false));
  assert.ok(phoneEvents.some(e => e.title === 'Golden roach'));
});

test('event choices, scout expeditions, field guide notes, firstSeen and keepsakes work on visible time', () => {
  // Event choice on egg case
  const m = make({random: () => 0.5, visitors: () => ['monarch-butterfly', 'stag-beetle'], energy: () => true});
  const shown = nextChance(m);
  assert.equal(shown.kind, 'egg');
  const ch = m.choice();
  assert.equal(ch.kind, 'egg');
  assert.equal(ch.altId, 'nursery');
  const ended = [];
  const chosen = m.chooseOption('nursery', {endChance: (k, c) => ended.push([k, c])});
  assert.equal(chosen.type, 'egg');
  assert.equal(chosen.choice, 'nursery');
  assert.deepEqual(chosen.rewards, [{resource: 'larva', seconds: 75}, {resource: 'meat', seconds: 75}]);
  assert.deepEqual(ended, [['egg', true]]);
  assert.equal(m.choice(), null);

  // Scout expeditions tick only with visible time and complete with caravan + rewards
  assert.equal(Mechanics.expeditions.length, 3);
  const started = m.startExpedition('cellar');
  assert.equal(started.id, 'cellar');
  assert.equal(started.remainingMs, 150000);
  assert.equal(m.startExpedition('pantry'), null, 'only one expedition at a time');
  let caravans = 0;
  const expRewards = [];
  for (let t = 0; t < 150000; t += 1000) {
    m.step(1000, 1, 0, {
      habitat: {startCaravan() { caravans++; }},
      onReward: r => expRewards.push(r)
    });
  }
  assert.equal(m.expedition(), null);
  assert.equal(caravans, 1);
  assert.ok(expRewards.some(r => r.title === 'Deep pipe trek complete'));
  assert.ok(Object.keys(m.firstSeen()).length >= 1, 'cellar expedition logs a visitor sighting and firstSeen timestamp');

  // Field notes and keepsakes
  assert.match(Mechanics.visitorNote('monarch-butterfly'), /powdered wings/);
  assert.match(Mechanics.visitorNote('stag-beetle'), /lacquered shell/);
  const ks = m.keepsakes(['monarch-butterfly', 'stag-beetle']);
  assert.equal(ks.length, 4);
  assert.equal(ks.find(k => k.id === 'keepsake_beetle_shell').unlocked, true);
});

