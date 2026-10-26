'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Save = require('../app/save.js');
const {primary, backup, legacy} = Save.keys;
let passed = 0;

function test(name, run) {
  run();
  passed += 1;
  console.log('ok ' + name);
}

class Storage {
  constructor(values = {}) { this.values = {...values}; this.fail = null; }
  getItem(key) { if (this.fail === 'read') throw Error('storage blocked'); return this.values[key] === undefined ? null : this.values[key]; }
  setItem(key, value) {
    if (this.fail === 'write' || this.fail === key) throw Error('quota exceeded');
    if (this.fail !== 'silent') this.values[key] = String(value);
  }
  removeItem() { throw Error('Persistence must never delete saves'); }
  clear() { throw Error('Persistence must never clear storage'); }
}

class Game {
  constructor({now}) { this.clock = now; this.amount = 0; }
  exportState(now) {
    this.amount += Math.max(0, now - this.clock);
    this.clock = Math.max(now, this.clock);
    return {engine: 'test', version: 2, clock: this.clock, amount: this.amount};
  }
  importState(state, now) {
    if (state.engine !== 'test' || state.version !== 2 || !Number.isSafeInteger(state.clock) ||
        !Number.isFinite(state.amount) || state.amount < 0) throw Error('invalid engine state');
    this.amount = state.amount + Math.max(0, now - state.clock);
    this.clock = Math.max(state.clock, now);
  }
}

function fixture(amount, clock = 1000) {
  const game = new Game({now: clock});
  game.amount = amount;
  return new Save.Store(new Storage()).export(game, clock);
}

test('browser global loads without Node and without localStorage side effects', () => {
  const context = {self: {}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/save.js'), 'utf8'), context);
  assert.equal(typeof context.self.RoachSave.Store, 'function');
});

test('fresh and legacy-only stores preserve the prototype without conversion', () => {
  const storage = new Storage({[legacy]: 'prototype-state'});
  const store = new Save.Store(storage);
  const game = new Game({now: 1000});
  const result = store.load(game, 1000);
  assert.equal(result.loaded, false);
  assert.equal(result.legacyAvailable, true);
  assert.equal(store.save(game, 1000), true);
  assert.equal(storage.values[legacy], 'prototype-state');
  assert.equal(storage.values[backup], undefined);
});

test('save rotates only a validated primary into the backup', () => {
  const old = fixture(10);
  const storage = new Storage({[primary]: old});
  const store = new Save.Store(storage);
  const game = new Game({now: 1000});
  game.amount = 55;
  assert.equal(store.save(game, 1000), true);
  assert.equal(storage.values[backup], old);
  assert.equal(JSON.parse(storage.values[primary]).state.amount, 55);
});

test('recover backup without overwriting the corrupt primary, then archive before saving', () => {
  const good = fixture(10);
  const storage = new Storage({[primary]: '{broken', [backup]: good});
  const store = new Save.Store(storage);
  const game = new Game({now: 1000});
  const result = store.load(game, 2000);
  assert.equal(result.loaded, true);
  assert.equal(result.recovered, true);
  assert.equal(game.amount, 1010);
  assert.equal(storage.values[primary], '{broken');
  assert.equal(store.save(game, 2000), true);
  assert.equal(storage.values[backup], good);
  assert.ok(Object.keys(storage.values).some(key => key.indexOf(primary + '_corrupt_') === 0 && storage.values[key] === '{broken'));
});

test('invalid primary and backup leave the running colony and originals untouched', () => {
  const storage = new Storage({[primary]: fixture(1).replace('"amount":1', '"amount":-1'), [backup]: 'null'});
  const before = {...storage.values};
  const game = new Game({now: 1000}); game.amount = 22;
  const store = new Save.Store(storage);
  assert.equal(store.load(game, 1000).loaded, false);
  assert.equal(game.amount, 22);
  assert.deepEqual(storage.values, before);
  assert.ok(store.error);
});

test('corrupt backup is archived before a good primary rotates over it', () => {
  const storage = new Storage({[primary]: fixture(10), [backup]: 'broken-backup'});
  assert.equal(new Save.Store(storage).save(new Game({now: 1000}), 1000), true);
  assert.ok(Object.keys(storage.values).some(key => key.indexOf(backup + '_corrupt_') === 0 && storage.values[key] === 'broken-backup'));
});

test('storage failures and silent dropped writes are explicit', () => {
  for (const mode of ['read', 'write', 'silent']) {
    const storage = new Storage(); storage.fail = mode;
    const store = new Save.Store(storage);
    assert.equal(store.save(new Game({now: 1000}), 1000), false, mode);
    assert.ok(store.error, mode);
  }
  const absent = new Save.Store(null);
  assert.equal(absent.load(new Game({now: 1000}), 1000).loaded, false);
  assert.ok(absent.error);
  assert.equal(JSON.parse(absent.export(new Game({now: 1000}), 1000)).savedAt, 1000);
});

test('failed corrupt-data archival never overwrites the original', () => {
  const storage = new Storage({[primary]: '{broken'}); storage.fail = 'write';
  assert.equal(new Save.Store(storage).save(new Game({now: 1000}), 1000), false);
  assert.equal(storage.values[primary], '{broken');
});

test('exports carry the visitor collection as an optional field that imports return cleaned', () => {
  const game = new Game({now: 1000});
  const store = new Save.Store(new Storage());
  const text = store.export(game, 1000, {visitors: {'monarch-butterfly': 2, 'Bad Slug': 1, ladybug: -1, moth: 1.5}});
  assert.deepEqual(JSON.parse(text).visitors, {'monarch-butterfly': 2});
  assert.equal(JSON.parse(store.export(game, 1000)).visitors, undefined, 'routine saves stay unchanged');
  const result = new Save.Store(new Storage()).import(text, new Game({now: 1000}), 1000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.visitors, {'monarch-butterfly': 2});
  const plain = new Save.Store(new Storage()).import(fixture(5), new Game({now: 1000}), 1000);
  assert.equal(plain.ok, true);
  assert.equal(plain.visitors, null, 'a save without a collection leaves the current one alone');
});
test('import retains the active state as backup and advances offline income exactly once', () => {
  const storage = new Storage({[primary]: fixture(999)});
  const store = new Save.Store(storage);
  const game = new Game({now: 1000}); game.amount = 77;
  assert.equal(store.import(fixture(10), game, 2000).ok, true);
  assert.equal(game.amount, 1010);
  assert.equal(JSON.parse(storage.values[backup]).state.amount, 1077);
  assert.equal(JSON.parse(storage.values[primary]).state.amount, 1010);
  assert.equal(new Save.Store(storage).load(game, 2000).loaded, true);
  assert.equal(game.amount, 1010);
  assert.equal(new Save.Store(storage).load(game, 2500).loaded, true);
  assert.equal(game.amount, 1510);
});

test('future imports and clock rollback cannot award the same interval twice', () => {
  const storage = new Storage();
  const store = new Save.Store(storage);
  const game = new Game({now: 1000});
  assert.equal(store.import(fixture(10, 5000), game, 1000).ok, true);
  assert.equal(store.save(game, 2000), true);
  const exported = JSON.parse(storage.values[primary]);
  assert.equal(exported.savedAt, 5000);
  assert.equal(exported.state.amount, 10);
  assert.equal(store.load(game, 6000).loaded, true);
  assert.equal(game.amount, 1010);
});

test('bad imports, timestamp mismatches and oversized inputs reject atomically', () => {
  const storage = new Storage({[primary]: fixture(22)});
  const store = new Save.Store(storage);
  const game = new Game({now: 1000}); game.amount = 22;
  const unsafe = JSON.parse(fixture(1)); unsafe.state.amount = -1;
  const badClock = JSON.parse(fixture(1)); badClock.savedAt += 1;
  const deep = JSON.parse(fixture(1));
  let child = deep.state;
  for (let i = 0; i < 40; i += 1) child = child.deep = {};
  const before = {...storage.values};
  const inputs = ['', '{', 'null', '{}', ' '.repeat(Save.maxLength + 1), JSON.stringify(unsafe),
    JSON.stringify(badClock), JSON.stringify(deep), fixture(1).replace('"amount":1', '"__proto__":{},"amount":1')];
  for (const input of inputs) {
    assert.equal(store.import(input, game, 1000).ok, false);
    assert.equal(game.amount, 22);
    assert.deepEqual(storage.values, before);
  }
});

test('import that cannot persist never replaces the running colony', () => {
  const storage = new Storage({[primary]: fixture(22)}); storage.fail = primary;
  const game = new Game({now: 1000}); game.amount = 22;
  assert.equal(new Save.Store(storage).import(fixture(1), game, 1000).ok, false);
  assert.equal(game.amount, 22);
  assert.equal(JSON.parse(storage.values[primary]).state.amount, 22);
  assert.equal(JSON.parse(storage.values[backup]).state.amount, 22);
});

test('load imports once and routine saves never reconstruct or re-import the economy', () => {
  let constructions = 0;
  let imports = 0;
  class CountGame extends Game {
    constructor(options) { super(options); constructions += 1; }
    importState(state, now) { imports += 1; super.importState(state, now); }
  }
  const storage = new Storage({[primary]: fixture(10)});
  const game = new CountGame({now: 1000});
  const store = new Save.Store(storage);
  constructions = 0;
  assert.equal(store.load(game, 2000).loaded, true);
  assert.equal(constructions, 0);
  assert.equal(imports, 1);
  imports = 0;
  const original = storage.values[primary];
  assert.equal(store.save(game, 2000), true);
  assert.equal(storage.values[backup], original);
  for (let index = 1; index <= 20; index += 1) assert.equal(store.save(game, 2000 + index), true);
  assert.equal(constructions, 0);
  assert.equal(imports, 0);
  assert.equal(JSON.parse(storage.values[primary]).state.amount, 1030);
});

test('an existing backup is validated once, then routine saves trust their own rotation', () => {
  let constructions = 0;
  class CountGame extends Game {
    constructor(options) { super(options); constructions += 1; }
  }
  const storage = new Storage({[primary]: fixture(10), [backup]: fixture(5)});
  const game = new CountGame({now: 1000});
  const store = new Save.Store(storage);
  assert.equal(store.load(game, 1000).loaded, true);
  constructions = 0;
  assert.equal(store.save(game, 1001), true);
  assert.equal(constructions, 1);
  for (let index = 2; index <= 20; index += 1) assert.equal(store.save(game, 1000 + index), true);
  assert.equal(store.export(game, 1021).length > 0, true);
  assert.equal(store.save(game, 1022), true);
  assert.equal(constructions, 1);
  const corrupt = fixture(3).replace('"amount":3', '"amount":-3');
  storage.values[backup] = corrupt;
  assert.equal(store.save(game, 1023), true);
  assert.equal(constructions, 2);
  assert.ok(Object.keys(storage.values).some(key => key.indexOf(backup + '_corrupt_') === 0 && storage.values[key] === corrupt));
});

test('changed storage bypasses validation cache and preserves newly corrupt data', () => {
  const storage = new Storage({[primary]: fixture(10)});
  const game = new Game({now: 1000});
  const store = new Save.Store(storage);
  assert.equal(store.load(game, 1000).loaded, true);
  assert.equal(store.save(game, 1000), true);
  const corrupt = fixture(12).replace('"amount":12', '"amount":-12');
  storage.values[primary] = corrupt;
  assert.equal(store.save(game, 1000), true);
  assert.equal(JSON.parse(storage.values[backup]).state.amount, 10);
  assert.ok(Object.keys(storage.values).some(key => key.indexOf(primary + '_corrupt_') === 0 && storage.values[key] === corrupt));
});

const Swarm = require('../app/engine.js');
// The source's own opening: 35 meat, 10 larva and an awake hatchery. A new game opens dormant with neither.
function classic(options) {
  const game = new Swarm.Game(options);
  const state = game.exportState(options.now);
  state.state.unittypes.meat = '35';
  state.state.unittypes.larva = '10';
  state.opening = {awake: true};
  game.importState(state, options.now);
  return game;
}

test('real Swarm save restores a day of source production and does not duplicate it on reopen', () => {
  const start = 1000000;
  const later = start + 86400000;
  const source = classic({now: start});
  assert.equal(source.act({type: 'unit', id: 'drone', quantity: 1}, start).ok, true);
  const storage = new Storage({[legacy]: 'untouched prototype'});
  assert.equal(new Save.Store(storage).save(source, start), true);
  const expected = source.exportState(later);
  const loaded = new Swarm.Game({now: later});
  const store = new Save.Store(storage);
  assert.equal(store.load(loaded, later).loaded, true);
  assert.deepEqual(loaded.exportState(later).state.unittypes, expected.state.unittypes);
  assert.equal(store.save(loaded, later), true);
  const reopened = new Swarm.Game({now: later});
  assert.equal(new Save.Store(storage).load(reopened, later).loaded, true);
  assert.deepEqual(reopened.exportState(later).state.unittypes, expected.state.unittypes);
  assert.equal(storage.values[legacy], 'untouched prototype');
});

test('real Swarm decimal precision, achievements, and permanent progression survive import and recovery', () => {
  const now = 1000000;
  const source = classic({now});
  assert.equal(source.act({type: 'unit', id: 'drone', quantity: 1}, now).ok, true);
  const state = source.exportState(now);
  assert.equal(state.state.achievements.drone1, 0);
  state.state.unittypes.meat = '9007199254740993.125';
  state.state.unittypes.mutagen = '12345678901234567890.125';
  state.state.unittypes.ascension = '3';
  state.state.unittypes.freeRespec = '5';
  source.importState(state, now);
  const storage = new Storage();
  const store = new Save.Store(storage);
  const text = store.export(source, now);
  assert.equal(JSON.parse(text).state.state.unittypes.meat, '9007199254740993.125');
  const target = new Swarm.Game({now});
  assert.equal(store.import(text, target, now).ok, true);
  assert.deepEqual(target.exportState(now).state.unittypes, source.exportState(now).state.unittypes);
  assert.deepEqual(target.exportState(now).state.achievements, source.exportState(now).state.achievements);
  assert.deepEqual(target.exportState(now).state.statistics, source.exportState(now).state.statistics);
  assert.equal(store.save(target, now), true);
  storage.values[primary] = '{damaged';
  const recovered = new Swarm.Game({now});
  assert.equal(store.load(recovered, now).recovered, true);
  assert.deepEqual(recovered.exportState(now).state.unittypes, source.exportState(now).state.unittypes);
});

test('real Swarm semantic corruption and astronomical decimals reject before replacement', () => {
  const now = 1000000;
  const game = new Swarm.Game({now});
  const storage = new Storage();
  const store = new Save.Store(storage);
  const original = store.export(game, now);
  const mutations = [
    state => { delete state.state.unittypes.drone; },
    state => { state.state.unittypes.meat = '1e999999999999999999999'; },
    state => { state.state.unittypes.meat = '-1'; },
    state => { state.state.date.reified -= 1; },
    state => { state.state.upgrades.hatchery = '1.5'; },
    state => { state.state.upgrades.hatchery = '1e100000'; },
    state => { state.state.upgrades.droneprod = '1e100000'; },
    state => { state.state.unittypes.freeRespec = '0.5'; },
    state => { state.state.unittypes.ascension = '0.5'; },
    state => { state.state.unittypes.nexus = '1e100000'; },
    state => { state.state.statistics.byUnit.drone = {clicks: '1', num: '1', twinnum: '1', elapsedFirst: 0}; }
  ];
  for (const mutate of mutations) {
    const envelope = JSON.parse(original);
    mutate(envelope.state);
    assert.equal(store.import(JSON.stringify(envelope), game, now).ok, false, mutate.toString());
    assert.deepEqual(JSON.parse(store.export(game, now)).state, JSON.parse(original).state);
    assert.deepEqual(storage.values, {});
  }
});

test('real Swarm future anchor stays intact through imports, saves and system clock rollback', () => {
  const now = 1000000;
  const future = now + 86400000;
  const source = classic({now: future});
  assert.equal(source.act({type: 'unit', id: 'drone', quantity: 1}, future).ok, true);
  const storage = new Storage();
  const store = new Save.Store(storage);
  const text = store.export(source, future);
  const target = new Swarm.Game({now});
  assert.equal(store.import(text, target, now).ok, true);
  assert.equal(store.save(target, now + 1000), true);
  const envelope = JSON.parse(storage.values[primary]);
  assert.equal(envelope.savedAt, future);
  assert.equal(envelope.state.clock, future);
  assert.equal(envelope.state.state.date.reified, future);
  assert.equal(envelope.state.state.unittypes.meat, JSON.parse(text).state.state.unittypes.meat);
  assert.equal(store.load(target, future + 1000).loaded, true);
  const expected = source.exportState(future + 1000);
  assert.deepEqual(target.exportState(future + 1000).state.unittypes, expected.state.unittypes);
});


test('legacy file import into active-only colony never awards offline growth and reload stays paused', () => {
  const start = 1000000, later = start + 86400000;
  const old = classic({now: start});
  assert.equal(old.act({type: 'unit', id: 'drone', quantity: 1}, start).ok, true);
  const oldText = new Save.Store(new Storage()).export(old, start);
  const storage = new Storage(), store = new Save.Store(storage);
  const active = new Swarm.Game({now: later, activeTimeOnly: true});
  assert.equal(store.import(oldText, active, later).ok, true);
  assert.equal(active.paused, true);
  let saved = JSON.parse(storage.values[primary]);
  assert.equal(saved.savedAt, start);
  assert.equal(saved.state.timePolicy.activeOnly, true);
  assert.equal(saved.state.timePolicy.paused, true);
  assert.equal(saved.state.state.unittypes.meat, '25');
  assert.equal(saved.state.state.unittypes.larva, '9');
  active.resume(later);
  active.pause(later + 1000);
  assert.equal(store.save(active, later + 1000), true);
  saved = JSON.parse(storage.values[primary]);
  assert.equal(saved.state.state.unittypes.meat, '26');
  assert.equal(saved.state.state.unittypes.larva, '10');
  const reopened = new Swarm.Game({now: later + 86400000, activeTimeOnly: true});
  assert.equal(new Save.Store(storage).load(reopened, later + 86400000).loaded, true);
  assert.equal(reopened.paused, true);
  assert.deepEqual(reopened.exportState(later + 86400000).state.unittypes, saved.state.state.unittypes);
  reopened.resume(later + 86400000);
  assert.equal(reopened.exportState(later + 86401000).state.unittypes.meat, '27');
});

test('a player reset starts a fresh engine and keeps the old colony restorable through import', () => {
  const start = 1000000;
  const game = classic({now: start, activeTimeOnly: true});
  game.resume(start);
  assert.equal(game.act({type: 'unit', id: 'drone', quantity: 1}, start).ok, true);
  const storage = new Storage(), store = new Save.Store(storage);
  assert.equal(store.save(game, start + 1000), true);
  const before = store.export(game, start + 2000, {visitors: {ladybug: 2}});
  const result = store.reset(game, start + 2000, {visitors: {ladybug: 2}});
  assert.equal(result.ok, true);
  assert.equal(storage.values[Save.keys.beforeReset], before);
  assert.equal(storage.values[backup], before);
  const fresh = new Swarm.Game({now: start + 2000, activeTimeOnly: true}).exportState(start + 2000).state;
  assert.deepEqual(game.exportState(start + 2000).state.unittypes, fresh.unittypes);
  assert.deepEqual(JSON.parse(storage.values[primary]).state.state.unittypes, fresh.unittypes);
  // The new colony opens dormant with no stock, and an import of the old one is awake again.
  assert.deepEqual(JSON.parse(storage.values[primary]).state.opening, {awake: false, forages: 0});
  assert.equal(fresh.unittypes.meat, '0');
  // Routine saves rotate the backup slot but never the before-reset copy.
  assert.equal(store.save(game, start + 3000), true);
  assert.equal(store.save(game, start + 4000), true);
  assert.equal(storage.values[Save.keys.beforeReset], before);
  const restored = store.import(storage.values[Save.keys.beforeReset], game, start + 5000);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.visitors, {ladybug: 2});
  assert.equal(game.exportState(start + 5000).state.unittypes.drone, '1');
  assert.deepEqual(game.exportState(start + 5000).opening, {awake: true});
});

test('a reset that cannot keep its backup leaves the colony untouched', () => {
  const game = new Game({now: 1000});
  game.amount = 42;
  const storage = new Storage(), store = new Save.Store(storage);
  assert.equal(store.save(game, 1000), true);
  const saved = storage.values[primary];
  storage.fail = Save.keys.beforeReset;
  const result = store.reset(game, 2000);
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be reset/);
  assert.equal(storage.values[primary], saved);
  assert.equal(game.amount, 1042);
});

test('exports and imports preserve catch tallies alongside visitor logs, and Store owns overlay meta', () => {
  const game = new Game({now: 1000});
  const map = {};
  const metaStorage = {
    getItem: k => map[k] === undefined ? null : map[k],
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: k => { delete map[k]; }
  };
  const store = new Save.Store(metaStorage);
  const text = store.export(game, 1000, {visitors: {ladybug: 3}, catches: {golden: 2, intruders: 5, extra: 9}});
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.visitors, {ladybug: 3});
  assert.deepEqual(parsed.catches, {golden: 2, intruders: 5});

  const imported = store.import(text, new Game({now: 1000}), 1000);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.visitors, {ladybug: 3});
  assert.deepEqual(imported.catches, {golden: 2, intruders: 5});

  store.saveMilestones({'owned:drone': true});
  store.saveVisitors({ladybug: 3});
  store.saveCatches({golden: 2, intruders: 5});
  store.saveLastPurchase({type: 'unit', id: 'drone', quantity: 10});
  store.saveAuto([{type: 'unit', id: 'drone'}], true);
  store.saveLastAscension('120');
  store.saveFlavorIndex(4);
  store.savePin({kind: 'upgrade', id: 'hatchery'});
  store.saveReserve({kind: 'unit', id: 'queen'});
  store.saveExpedition({id: 'pantry', label: 'Pantry recon', remainingMs: 45000, totalMs: 90000});
  store.saveRecords({runs: [{at: 1000, mutagen: '250', durationMs: 3600000, highestCaste: 'empress'}], bestMutagen: '250', fastestMs: 3600000, highestCaste: 'empress'});
  store.saveActivity([{t: 1000, kind: 'buy', title: 'Nest queen', text: '+1'}]);
  store.saveFirstSeen({ladybug: 123456});
  store.flushJournal([{t: 1, lvl: 'info', cat: 'test', msg: 'ok'}]);

  const loadedMeta = store.loadMeta();
  assert.deepEqual(loadedMeta.milestoneSeen, {'owned:drone': true});
  assert.deepEqual(loadedMeta.visitors, {ladybug: 3});
  assert.deepEqual(loadedMeta.catches, {golden: 2, intruders: 5});
  assert.deepEqual(loadedMeta.lastPurchase, {type: 'unit', id: 'drone', quantity: 10});
  assert.deepEqual(loadedMeta.autoBindings, [{type: 'unit', id: 'drone'}]);
  assert.equal(loadedMeta.autoPaused, true);
  assert.equal(loadedMeta.lastAscension, '120');
  assert.equal(loadedMeta.flavorIndex, 4);
  assert.deepEqual(loadedMeta.pinnedQuick, {kind: 'upgrade', id: 'hatchery'});
  assert.deepEqual(loadedMeta.reserve, {kind: 'unit', id: 'queen'});
  assert.deepEqual(loadedMeta.expedition, {id: 'pantry', label: 'Pantry recon', remainingMs: 45000, totalMs: 90000});
  assert.equal(loadedMeta.records.bestMutagen, '250');
  assert.equal(loadedMeta.activity.length, 1);
  assert.deepEqual(loadedMeta.firstSeen, {ladybug: 123456});
  assert.equal(loadedMeta.journal.length, 1);

  const fullExport = store.export(game, 1000, {
    visitors: {ladybug: 3},
    catches: {golden: 2, intruders: 5},
    pin: {kind: 'upgrade', id: 'hatchery'},
    reserve: {kind: 'unit', id: 'queen'},
    records: loadedMeta.records,
    firstSeen: {ladybug: 123456}
  });
  const fullImported = store.import(fullExport, new Game({now: 1000}), 1000);
  assert.equal(fullImported.ok, true);
  assert.deepEqual(fullImported.pin, {kind: 'upgrade', id: 'hatchery'});
  assert.deepEqual(fullImported.reserve, {kind: 'unit', id: 'queen'});
  assert.equal(fullImported.records.bestMutagen, '250');
  assert.deepEqual(fullImported.firstSeen, {ladybug: 123456});

  store.clearMeta();
  const clearedMeta = store.loadMeta();
  assert.deepEqual(clearedMeta.milestoneSeen, {});
  assert.deepEqual(clearedMeta.visitors, {});
  assert.deepEqual(clearedMeta.catches, {});
  assert.equal(clearedMeta.lastPurchase, null);
  assert.deepEqual(clearedMeta.autoBindings, []);
  assert.equal(clearedMeta.autoPaused, false);
  assert.equal(clearedMeta.pinnedQuick, null);
  assert.equal(clearedMeta.reserve, null);
  assert.equal(clearedMeta.expedition, null);
  assert.deepEqual(clearedMeta.activity, []);
  assert.deepEqual(clearedMeta.firstSeen, {});
});

console.log(passed + ' persistence tests passed');
