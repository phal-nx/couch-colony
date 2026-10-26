'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Session = require('../app/session');
const TvShell = require('../app/tv-shell');
const OverlayView = require('../app/overlay-view');
const Sprites = require('../app/sprites');
const FloorBaker = require('../app/floor-baker');

test('chooseQuick stabilizes picks across refreshes with 4-refresh hysteresis and drops duplicates', () => {
  const state = Session.createQuickState();
  const c = (kind, id, progress, affordable = false) => ({kind, id, name: id, progress, affordable, gain: affordable ? '1' : '0'});
  const initial = [
    [c('unit', 'drone', 0.5)],
    [c('unit', 'drone', 0.5), c('unit', 'queen', 0.3)],
    [c('upgrade', 'hatchery', 0.8)],
    [c('upgrade', 'expansion', 0.4)],
    [c('unit', 'swarmling', 0.2)]
  ];
  let picks = Session.chooseQuick(state, initial);
  assert.deepEqual(picks.map(p => p && p.id), ['drone', 'queen', 'hatchery', 'expansion', 'swarmling']);

  // A new candidate in slot 0 must lead for 4 refreshes in a row before replacing the held pick.
  const challenger = [
    [c('unit', 'nest', 0.9), c('unit', 'drone', 0.5)],
    [c('unit', 'queen', 0.3)],
    [c('upgrade', 'hatchery', 0.8)],
    [c('upgrade', 'expansion', 0.4)],
    [c('unit', 'swarmling', 0.2)]
  ];
  for (let i = 1; i < Session.QUICK_SETTLE; i++) {
    picks = Session.chooseQuick(state, challenger);
    assert.equal(picks[0].id, 'drone', 'held pick stays on refresh ' + i);
  }
  picks = Session.chooseQuick(state, challenger);
  assert.equal(picks[0].id, 'nest', 'challenger replaces held pick on 4th refresh');
});

test('orderAutoBindings ranks higher unit tiers first, upgrades after units, and rotates by cursor', () => {
  const bindings = [
    {type: 'upgrade', id: 'hatchery'},
    {type: 'unit', id: 'drone'},
    {type: 'unit', id: 'queen'}
  ];
  const visibleUnits = [{id: 'drone', tier: 1}, {id: 'queen', tier: 2}];
  const first = Session.orderAutoBindings(bindings, visibleUnits, 0);
  assert.deepEqual(first.ordered.map(b => b.id), ['queen', 'drone', 'hatchery']);
  const rotated = Session.orderAutoBindings(bindings, visibleUnits, 1);
  assert.deepEqual(rotated.ordered.map(b => b.id), ['drone', 'hatchery', 'queen']);
});

test('validateControls prunes hidden bindings and invalid lastPurchase', () => {
  const checked = Session.validateControls(
    [{type: 'unit', id: 'drone'}, {type: 'unit', id: 'overmind6'}],
    {type: 'upgrade', id: 'gone'},
    {visibleUnitIds: ['drone'], visibleUpgradeIds: ['hatchery']}
  );
  assert.equal(checked.bindingsChanged, true);
  assert.deepEqual(checked.bindings, [{type: 'unit', id: 'drone'}]);
  assert.equal(checked.lastChanged, true);
  assert.equal(checked.lastPurchase, null);
});

test('orderAchievements sorts closest open first, then newest earned, then one undiscovered summary row', () => {
  const list = [
    {id: 'a1', name: 'Earned old', earned: true, earnedAt: 100, masked: false},
    {id: 'a2', name: 'Locked 20%', earned: false, masked: false, progress: {value: '2', percent: 0.2}},
    {id: 'a3', name: 'Locked 80%', earned: false, masked: false, progress: {value: '8', percent: 0.8}},
    {id: 'a4', name: 'Earned new', earned: true, earnedAt: 500, masked: false},
    {id: 'a5', name: 'Hidden 1', earned: false, masked: true},
    {id: 'a6', name: 'Hidden 2', earned: false, masked: true}
  ];
  const ordered = Session.orderAchievements(list, null);
  assert.deepEqual(ordered.rows.map(r => r.id), ['a3', 'a2', 'a4', 'a1', '__undiscovered']);
  assert.equal(ordered.rows[4].name, '2 more to discover');
  assert.equal(Session.orderAchievements(list, ordered), ordered, 'reuses cached order when signature matches');
});

test('TvShell, OverlayView, Sprites and FloorBaker expose clean headless interfaces', () => {
  assert.deepEqual(TvShell.parseParams('{"params":{"remoteKey":403}}'), {remoteKey: 403});
  assert.equal(OverlayView.magnitudeRank('12.3K'), 1);
  assert.equal(OverlayView.magnitudeRank('5.1M'), 2);
  assert.equal(OverlayView.magnitudeRank('2.35e70'), 12);
  assert.equal(Sprites.creaturesReady(), false);
  assert.equal(typeof FloorBaker.paintMark, 'function');
  assert.equal(typeof FloorBaker.paintProp, 'function');
});

test('chooseQuick pins slot 0 immediately when pinnedCandidate is provided and deduplicates slots 1..4', () => {
  const state = Session.createQuickState();
  const c = (kind, id, progress, affordable = false) => ({kind, id, name: id, progress, affordable, gain: affordable ? '1' : '0'});
  const slots = [
    [c('unit', 'drone', 0.5)],
    [c('unit', 'drone', 0.5), c('unit', 'queen', 0.3)],
    [c('upgrade', 'hatchery', 0.8)],
    [c('upgrade', 'expansion', 0.4)],
    [c('unit', 'swarmling', 0.2)]
  ];
  Session.chooseQuick(state, slots);
  // Pinning hatchery places it in slot 0 immediately without waiting 4 ticks, and slot 2 skips hatchery
  const pinned = Session.chooseQuick(state, slots, c('upgrade', 'hatchery', 0.8));
  assert.equal(pinned[0].id, 'hatchery');
  assert.equal(pinned[0].pinned, true);
  assert.equal(pinned.filter(p => p && p.id === 'hatchery').length, 1, 'pinned item is not duplicated in other slots');

  // Unpinning restores normal slot 0 immediately
  const unpinned = Session.chooseQuick(state, slots, null);
  assert.equal(unpinned[0].id, 'drone');
  assert.equal(unpinned[0].pinned, undefined);
});

test('inspectAuto, reserveProgress, recordActivity and recordAscensionRun policies', () => {
  const bindings = [{type: 'unit', id: 'drone'}, {type: 'unit', id: 'queen'}];
  const snapshot = {
    visibleUnits: [{id: 'drone', tier: 1}, {id: 'queen', tier: 2}],
    items: [{kind: 'unit', id: 'queen', name: 'Nest queen', available: false, progress: 0.65, costs: [{id: 'meat', amount: '810'}]}]
  };
  assert.equal(Session.inspectAuto([], false, null, snapshot, '').state, 'off');
  assert.equal(Session.inspectAuto(bindings, true, null, snapshot, '').state, 'paused');
  const waiting = Session.inspectAuto(bindings, false, {kind: 'unit', id: 'queen'}, snapshot, 'Saving for queen');
  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.next.id, 'queen');
  assert.equal(waiting.reason, 'Saving for queen');

  const prog = Session.reserveProgress({kind: 'unit', id: 'queen'}, snapshot);
  assert.deepEqual(prog, {
    kind: 'unit',
    id: 'queen',
    name: 'Nest queen',
    available: false,
    progress: 0.65,
    costs: [{id: 'meat', amount: '810'}]
  });

  // Activity ring buffer capped at 24, newest first
  const activity = [];
  for (let i = 1; i <= 30; i++) Session.recordActivity(activity, 'buy', 'Bought ' + i, 'Detail ' + i, 1000 + i);
  assert.equal(activity.length, 24);
  assert.equal(activity[0].title, 'Bought 30');
  assert.equal(activity[23].title, 'Bought 7');

  // Ascension recordbook capped at 12 runs, tracking bestMutagen, fastestMs, highestCaste
  let records = null;
  for (let i = 1; i <= 15; i++) {
    records = Session.recordAscensionRun(records, {
      at: 1000 * i,
      mutagen: String(i * 100),
      durationMs: 50000 - i * 1000,
      highestCaste: i === 10 ? 'empress' : 'queen'
    });
  }
  assert.equal(records.runs.length, 12);
  assert.equal(records.bestMutagen, '1500');
  assert.equal(records.fastestMs, 35000);
  assert.equal(records.highestCaste, 'empress');
});

