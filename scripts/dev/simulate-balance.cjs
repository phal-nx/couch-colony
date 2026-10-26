'use strict';
// Active-time progression check. Steps the real engine, buys what it can, and prints when
// the long milestones show up. It never talks to the TV.
const Engine = require('../app/engine');
const HOUR = 3600000;
const STEP = 2 * 60000;
const CHAIN = ['overmind6','overmind5','overmind4','overmind3','overmind2','overmind','pantheon5','pantheon4','pantheon3','pantheon2','pantheon','goddess','prophet','empress','hivequeen','hive','greaterqueen','nest','queen','drone'];
const NEXUS = ['nexus5','nexus4','nexus3','nexus2','nexus1'];
const MARKS = ['drone','queen','nest','greaterqueen','hive','hivequeen','empress'];

function tryBuy(game, type, id, now) {
  return game.act({type, id, quantity: type === 'upgrade' ? 1 : 'share'}, now).ok;
}
function nexusHoldingEnergy(inner) {
  return ['nexus2','nexus3','nexus4','nexus5'].some(id => {
    const upgrade = inner.upgrade(id);
    if (!upgrade.isVisible()) return false;
    return upgrade.totalCost().every(cost => cost.unit.name === 'energy' || cost.unit.count().greaterThanOrEqualTo(cost.val));
  });
}
function spend(game, now) {
  const inner = game._runtime.game;
  const territory = inner.unitlist().filter(unit => unit.prod.some(prod => prod.unit.name === 'territory') && !unit.type.unbuyable)
    .sort((a, b) => (b.type.tier || 0) - (a.type.tier || 0));
  const unitUpgrades = inner.upgradelist().filter(upgrade => upgrade.name === 'achievementbonus' || /(?:prod|twin|empower)$/.test(upgrade.name));
  for (let pass = 0; pass < 8; pass++) {
    let bought = false;
    NEXUS.forEach(id => { if (tryBuy(game, 'upgrade', id, now)) bought = true; });
    if (!nexusHoldingEnergy(inner) && inner.ascendCost().greaterThan(12000)) {
      ['larvarush','meatrush','territoryrush'].forEach(id => { if (tryBuy(game, 'upgrade', id, now)) bought = true; });
    }
    if (tryBuy(game, 'upgrade', 'hatchery', now)) bought = true;
    if (tryBuy(game, 'upgrade', 'expansion', now)) bought = true;
    for (const upgrade of unitUpgrades) if (tryBuy(game, 'upgrade', upgrade.name, now)) bought = true;
    for (const id of ['nightbug','moth','bat']) if (tryBuy(game, 'unit', id, now)) bought = true;
    for (const unit of territory) if (tryBuy(game, 'unit', unit.name, now)) { bought = true; break; }
    for (const id of CHAIN) if (tryBuy(game, 'unit', id, now)) { bought = true; break; }
    if (!bought) return;
  }
}
function wake(game) {
  for (let i = 1; i <= 10; i++) game.act('forage', i);
  game.act({type: 'unit', id: 'drone', quantity: 1}, 11);
}

function run(name, hours, catchShare) {
  const game = new Engine.Game({now:0, activeTimeOnly:true});
  game.resume(0);
  wake(game);
  const seen = {};
  let clock = 0;
  const limit = hours * HOUR;
  while (clock < limit) {
    clock += STEP;
    spend(game, clock);
    if (catchShare && clock % (15 * 60000) === 0) {
      game.act({type:'reward', resource:'meat', seconds:Math.round(120 * catchShare)}, clock);
      game.act({type:'reward', resource:'territory', seconds:Math.round(90 * catchShare)}, clock);
    }
    const inner = game._runtime.game;
    MARKS.forEach(id => {
      if (!seen[id] && inner.unit(id).count().greaterThanOrEqualTo(1)) seen[id] = clock / HOUR;
    });
    if (!seen.energy && inner.unit('energy').isVisible()) seen.energy = clock / HOUR;
    if (!seen.premutagen && inner.unit('premutagen').isVisible()) seen.premutagen = clock / HOUR;
    if (!seen.nexus5 && inner.unit('nexus').count().greaterThanOrEqualTo(5)) seen.nexus5 = clock / HOUR;
    if (!seen.ascend && inner.unit('premutagen').isVisible() && inner.ascendCostPercent().greaterThanOrEqualTo(1)) seen.ascend = clock / HOUR;
    if (clock % (5 * HOUR) === 0) console.log('  ' + name + ' ' + (clock / HOUR) + 'h nexus ' + inner.unit('nexus').count().toString() + ' energy ' + inner.unit('energy').count().toFixed(0) + ' spent ' + inner.ascendEnergySpent().toFixed(0) + ' cost ' + inner.ascendCost().toFixed(0) + ' rush ' + inner.upgrade('larvarush').count().toString() + ' hatchery ' + inner.upgrade('hatchery').count().toString() + ' crevice ' + inner.upgrade('expansion').count().toString());
  }
  const inner = game._runtime.game;
  const line = Object.keys(seen).map(id => id + ' ' + seen[id].toFixed(2) + 'h').join(', ');
  console.log(name + ': ' + (line || 'no milestones') + ' | hatchery ' + inner.upgrade('hatchery').count().toString() + ', crevice ' + inner.upgrade('expansion').count().toString() + ', nexus ' + inner.unit('nexus').count().toString() + ', ascend ' + (seen.ascend ? 'yes' : 'not yet'));
}

const hours = Number(process.argv[2]) || 40;
run('passive', hours, 0);
run('casual', hours, 0.4);
run('active', hours, 0.9);
