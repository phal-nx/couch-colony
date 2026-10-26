'use strict';
const _ = require('./vendor/lodash');
const Decimal = require('./vendor/decimal');
const moment = require('./vendor/moment');
const seedrandom = require('./vendor/seedrandom');
const registerCore = require('./core.generated');
const spreadsheet = require('./data.generated.json');
const SOURCE_COMMIT = '06b4f404aa324a0b454348508cfa63d5c0f1ff54';
const NativeDate = Date;
const LIMIT = new Decimal('1e100000');

function failure(message, cause) {
  const error = new Error('[SWARM] engine: ' + message);
  if (cause) error.cause = cause;
  return error;
}
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) throw failure('invalid clock');
  return value;
}
function trimmed(value) { return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }
const TINY=new Decimal('0.001'), THOUSAND=new Decimal(1000), MILLION=new Decimal(1e6), BILLION=new Decimal(1e9), TRILLION=new Decimal(1e12);
function format(value) {
  const n = value instanceof Decimal ? value : new Decimal(value);
  if (!n.isFinite()) throw failure('nonfinite presentation value');
  if (n.isZero()) return '0';
  const size = n.abs();
  if (size.lessThan(TINY)) return n.toExponential(2).replace(/\.00e/, 'e').replace(/(\.\d)0e/, '$1e');
  if (size.lessThan(THOUSAND)) return n.isInteger() ? n.toFixed(0) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  if (size.lessThan(MILLION)) return trimmed(n.dividedBy(THOUSAND).toFixed(2)) + 'K';
  if (size.lessThan(BILLION)) return trimmed(n.dividedBy(MILLION).toFixed(2)) + 'M';
  if (size.lessThan(TRILLION)) return trimmed(n.dividedBy(BILLION).toFixed(2)) + 'B';
  return n.toExponential(2).replace(/\.00e/, 'e').replace(/(\.\d)0e/, '$1e');
}
const PLAIN_TEXT=new Map();
// Snapshots strip the same spreadsheet labels and descriptions every second. The cap keeps
// the cache bounded if a caller ever passes changing text.
function plain(value) {
  const key=String(value || '');
  let text=PLAIN_TEXT.get(key);
  if (text === undefined) {
    if (PLAIN_TEXT.size >= 2048) PLAIN_TEXT.clear();
    text=key.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
    PLAIN_TEXT.set(key,text);
  }
  return text;
}
// maxCostMet divides by the logarithm of a fixed price factor on every quote. Remember that
// Decimal result per factor; the dynamic numerator is still computed each time.
function cacheLogarithm(value) {
  const log=value.log;
  let base10;
  Object.defineProperty(value,'log',{value:function(base) { return arguments.length ? log.apply(this,arguments) : base10 || (base10=log.call(this)); }});
}
// A new colony opens dormant, like Cookie Clicker: no starting stock and no production until the
// player forages their way to a first purchase. The hatchery's larva output is held at zero by
// its prod stat, so counts, rates and rewards all read zero without touching the reified anchor.
const STARTING_STOCK=['invisiblehatchery','meat','larva','freeRespec'];
const ZERO=new Decimal(0), ONE=new Decimal(1);
function createRuntime(now, state, opening) {
  const clock = {now: timestamp(now)};
  function ClockDate(value) { return new NativeDate(arguments.length ? value : clock.now); }
  ClockDate.now = () => clock.now;
  ClockDate.parse = NativeDate.parse;
  ClockDate.UTC = NativeDate.UTC;
  ClockDate.prototype = NativeDate.prototype;
  const values = Object.create(null);
  const factories = Object.create(null);
  const events = Object.create(null);
  const scope = {
    $on(name, fn) { (events[name] || (events[name] = [])).push(fn); return () => {}; },
    $emit(name, value) { (events[name] || []).slice().forEach(fn => fn({name}, value)); },
    $broadcast(name, value) { this.$emit(name, value); }
  };
  const registry = {
    factory(name, deps, fn) { factories[name] = {deps,fn}; return registry; },
    service(name, deps, fn) { factories[name] = {deps,fn}; return registry; },
    value(name, value) { values[name] = value; return registry; }
  };
  function get(name) {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    const factory = factories[name];
    if (!factory) throw failure('missing core dependency ' + name);
    values[name] = factory.fn.apply(null, factory.deps.map(get));
    return values[name];
  }
  const session = {state: state || {
    unittypes:{}, upgrades:{}, date:{}, options:{}, statistics:{}, achievements:{}, watched:{}, skippedMillis:0,
    version:{started:'1.1.17',saved:'1.1.17'}
  }, save() {}};
  if (!state) {
    ['started','restarted','saved','loaded','reified','closed'].forEach(key => session.state.date[key] = new ClockDate());
    // The original reset initializes these spreadsheet-defined starting units.
  }
  Object.assign(values, {
    session, spreadsheet:{data:spreadsheet}, UNIT_LIMIT:LIMIT,
    $log:{debug(){},warn(){},error(){}}, $rootScope:scope,
    $filter:() => format,
    util:{assert(value) { if (!value) throw failure(Array.prototype.slice.call(arguments,1).map(String).join(' ')); return value; }, error() { throw failure(Array.prototype.join.call(arguments,' ')); },sum(ns) { return _.sum(ns); }},
    kongregate:{reportStats(){}}, loginApi:{saveCommand(){}}, mtx:{}
  });
  const seededMath = Object.create(Math);
  seededMath.seedrandom = seedrandom;
  registerCore({module(){return registry;}}, _, Decimal, {factorial(n){let result=1;for(let i=2;i<=n;i++) result*=i;return result;}}, moment, seededMath, ClockDate);
  // Ascension and imports rebuild every unit, upgrade and Cache through _init, so prototype
  // overrides follow them automatically.
  const Cache=get('Cache'), origOnTick=Cache.prototype.onTick, origOnRespec=Cache.prototype.onRespec;
  Cache.prototype.onTick=function() {
    this._unitVisTick={};
    this._upgradeVisTick={};
    return origOnTick.call(this);
  };
  Cache.prototype.invalidateUnitStats=function(unitName) {
    if (this.stats) delete this.stats[unitName];
    if (this.eachCost) delete this.eachCost[unitName];
    if (this.eachProduction) delete this.eachProduction[unitName];
    this.producerPathProdEach={};
    this.unitCap={};
    delete this._ascendCost;
  };
  Cache.prototype.invalidateStats=function() {
    this.stats={};
    this.eachCost={};
    this.eachProduction={};
    this.upgradeTotalCost={};
    this.producerPathProdEach={};
    this.unitCap={};
    delete this._ascendCost;
    delete this._upgradeLevels;
  };
  // Separate stat-cache invalidation from count-only updates so reify() and ordinary unit
  // purchases do not wipe and rebuild all 58 unit stat/cost/production tables 6 times in a row.
  Cache.prototype.onUpdate=function() {
    this.onPeriodic();
    this.onTick();
    this.tinyUrl={};
    if (!this.stats) this.invalidateStats();
    this.producerPathCoefficients={};
    this.unitRawCount={};
    this.unitCapPercent={};
    this.upgradeEstimateSecsUntilBuyableCacheSafe={};
    delete this._ascendCost;
  };
  Cache.prototype.onRespec=function() {
    this.invalidateStats();
    return origOnRespec.call(this);
  };
  const Unit=get('Unit'), initUnit=Unit.prototype._init, unitStats=Unit.prototype.stats;
  Unit.prototype._init=function() {
    const result=initUnit.apply(this,arguments);
    this._plainLabel=plain(this.type.label);
    this._plainDesc=plain(this.type.description);
    this._prodTargets=this.prod.map(p=>({id:p.unit.name,name:plain(p.unit.type.label)}));
    return result;
  };
  Unit.prototype.stats=function() {
    const stats=unitStats.call(this);
    // stats() is cached per update, so this marks the cached entry; waking clears the cache.
    if (opening.dormant && this.name === 'invisiblehatchery') stats.prod=ZERO;
    return stats;
  };
  // Unit.stat() in upstream constructs two new Decimals on every lookup (~3,500 calls per purchase).
  // Decimal instances are immutable, so return the cached stat or shared ZERO/ONE directly.
  Unit.prototype.stat=function(key, default_) {
    const s=this.stats()[key];
    if (s !== undefined) return s instanceof Decimal ? s : new Decimal(s);
    if (default_ === 0) return ZERO;
    if (default_ === 1) return ONE;
    if (default_ !== undefined) return default_ instanceof Decimal ? default_ : new Decimal(default_);
    throw failure('no such stat ' + this.name + ' ' + key);
  };
  // Upstream _getCap() returns undefined for the 57 uncapped units, which misses CoffeeScript's
  // `!= null` cache check in unitCap and forces this.stats() on every unit.count() call.
  Unit.prototype._getCap=function() {
    if (this._canHaveCap === undefined) {
      this._canHaveCap=(this.upgrades && this.upgrades.list.some(up=>up.effect.some(e=>e.stat === 'capBase'))) ||
                       (this.affectedBy && this.affectedBy.some(e=>e.stat === 'capBase'));
    }
    if (!this._canHaveCap) return undefined;
    const cached=this.game.cache.unitCap[this.name];
    if (cached !== undefined) return cached || undefined;
    if (this.hasStat('capBase')) {
      const ret=this.stat('capBase').times(this.stat('capMult', 1)).plus(this.stat('capFlat', 0));
      this.game.cache.unitCap[this.name]=ret;
      return ret;
    }
    this.game.cache.unitCap[this.name]=false;
    return undefined;
  };
  Unit.prototype.isVisible=function() {
    if (this.unittype.disabled) return false;
    if (this.game.cache.unitVisible[this.name]) return true;
    const tickVis=this.game.cache._unitVisTick || (this.game.cache._unitVisTick={});
    if (tickVis[this.name] !== undefined) return tickVis[this.name];
    const vis=this._isVisible();
    if (vis) this.game.cache.unitVisible[this.name]=true;
    else tickVis[this.name]=false;
    return vis;
  };
  Unit.prototype._setCount=function(val) {
    this.game.session.state.unittypes[this.name]=val instanceof Decimal ? val : new Decimal(val);
    if (this.effect && this.effect.length) {
      for (let i=0;i<this.effect.length;i++) {
        if (this.effect[i].unit) this.game.cache.invalidateUnitStats(this.effect[i].unit.name);
      }
    }
    this.game.cache.onUpdate();
  };
  // Unit.spent() in upstream loops over all 58 units and calls u.count() even when costeach is 0.
  // Skip units that do not cost this resource.
  Unit.prototype.spent=function(ignores) {
    ignores=ignores || {};
    let ret=ZERO;
    const units=this.game._units.list;
    for (let i=0;i<units.length;i++) {
      const u=units[i], c=u.costByName[this.name];
      if (c && c.val && !c.val.isZero()) ret=ret.plus(u.count().times(c.val));
    }
    const upgrades=this.game._upgrades.list;
    for (let j=0;j<upgrades.length;j++) {
      const u=upgrades[j];
      if (u.costByName[this.name] && ignores[u.name] == null) {
        const costs=u.sumCost(u.count(),0);
        for (let k=0;k<costs.length;k++) if (costs[k].unit.name === this.name) { ret=ret.plus(costs[k].val); break; }
      }
    }
    return ret;
  };
  // Short-circuit ProducerPath.coefficient when the ancestor floor count is zero, avoiding
  // prodEach() across all 210+ paths for unowned high-tier units.
  const ProducerPath=get('ProducerPath');
  ProducerPath.prototype.coefficient=function(count) {
    if (count == null) count=this.first().parent.rawCount();
    const floored=count.floor();
    if (floored.isZero()) return ZERO;
    return floored.times(this.prodEach());
  };
  const ProducerPaths=get('ProducerPaths');
  ProducerPaths.prototype.count=function(secs) {
    const coeffs=this.getCoefficients();
    let ret=coeffs[0] || ZERO;
    if (coeffs.length <= 1 || !secs) return ret;
    const s=secs instanceof Decimal ? secs : new Decimal(secs);
    if (s.isZero()) return ret;
    let fact=1;
    for (let degree=1;degree<coeffs.length;degree++) {
      fact*=degree;
      const coeff=coeffs[degree];
      if (!coeff.isZero()) ret=ret.plus(coeff.times(degree === 1 ? s : Decimal.pow(secs,degree)).dividedBy(fact));
    }
    return ret;
  };
  const Effect=get('Effect'), origCalcStats=Effect.prototype.calcStats;
  Effect.prototype.calcStats=function(stats, schema, level) {
    if (level === undefined) level=this.parent.count();
    if (level.isZero()) {
      const t=this.type.name;
      if (t === 'multStat' || t === 'expStat' || t === 'asympStat' || t === 'logStat' || t === 'multStatPerAchievementPoint') {
        if (stats[this.stat] === undefined) stats[this.stat]=ONE;
        if (schema) schema[this.stat]='mult';
        return stats;
      }
      if (t === 'addStat') {
        if (stats[this.stat] === undefined) stats[this.stat]=ZERO;
        if (schema) schema[this.stat]='add';
        return stats;
      }
      if (t === 'suffix') {
        this.unit.suffix='';
        if (stats.empower === undefined) stats.empower=ZERO;
        return stats;
      }
    }
    return origCalcStats.call(this,stats,schema,level);
  };
  const Upgrade=get('Upgrade'), initUpgrade=Upgrade.prototype._init;
  Upgrade.prototype._init=function() {
    const result=initUpgrade.apply(this,arguments);
    this.cost.forEach(cost=>cacheLogarithm(cost.factor));
    this._affectsUpgradeCost=this.effect.some(e=>e.stat && e.stat.indexOf('upgradecost') === 0);
    return result;
  };
  Upgrade.prototype.count=function() {
    const raw=this.game.session.state.upgrades[this.name];
    if (raw == null) return ZERO;
    const val=raw instanceof Decimal ? raw : new Decimal(raw);
    return this.type.maxlevel ? Decimal.min(this.type.maxlevel,val) : val;
  };
  Upgrade.prototype.isVisible=function() {
    if (this.type.disabled) return false;
    if (!this.unit.isVisible() && !this.unit.unittype.disabled) return false;
    if (this.type.maxlevel != null && this.count().greaterThanOrEqualTo(this.type.maxlevel)) return false;
    if (this.game.cache.upgradeVisible[this.name]) return true;
    const tickVis=this.game.cache._upgradeVisTick || (this.game.cache._upgradeVisTick={});
    if (tickVis[this.name] !== undefined) return tickVis[this.name];
    const vis=this._isVisible();
    if (vis) this.game.cache.upgradeVisible[this.name]=true;
    else tickVis[this.name]=false;
    return vis;
  };
  Upgrade.prototype._setCount=function(val) {
    this.game.session.state.upgrades[this.name]=val instanceof Decimal ? val : new Decimal(val);
    delete this.game.cache._upgradeLevels;
    if (this._affectsUpgradeCost) this.game.cache.upgradeTotalCost={};
    else if (this.game.cache.upgradeTotalCost) delete this.game.cache.upgradeTotalCost[this.name];
    const statUnits=this._statUnits || (this._statUnits=this.game._units.list.filter(u=>u.upgrades.list.indexOf(this) !== -1));
    for (let i=0;i<statUnits.length;i++) this.game.cache.invalidateUnitStats(statUnits[i].name);
    this.game.cache.onUpdate();
  };
  if (!state) get('unittypes').list.forEach(type => session.state.unittypes[type.name] = new Decimal(opening.dormant && (type.name === 'meat' || type.name === 'larva') ? 0 : type.init || 0));
  const game = get('game');
  scope.$on('achieve', ()=>game.cache.invalidateUnitStats('invisiblehatchery'));
  // Game.withSave calls reify() before and after fn(). When no time or skippedMillis elapsed
  // between the two calls (every ordinary purchase), the second reify() would recompute all 58
  // producer-path polynomials from a cold cache for secs=0.
  const origReify=game.reify.bind(game);
  game.reify=function(skipSeconds) {
    if (!skipSeconds && this.diffMillis() === 0 && this.skippedMillis === 0 && this.session.state.date.reified && this.now && this.session.state.date.reified.getTime() === this.now.getTime()) {
      this.cache.onUpdate();
      return;
    }
    return origReify(skipSeconds);
  };
  get('statistics');
  const listener=get('achievementslistener');
  // Skip already-earned achievements and unrelated upgrades on every purchase command.
  listener.achieveUpgrade=function(upgradename) {
    const list=this.game._achievements.list;
    for (let i=0;i<list.length;i++) {
      const achieve=list[i];
      if (achieve.isEarned()) continue;
      for (let j=0;j<achieve.requires.length;j++) {
        const req=achieve.requires[j];
        if (!req.event && req.upgrade && req.val && (!upgradename || req.upgrade.name === upgradename)) {
          if (req.upgrade.count().greaterThanOrEqualTo(req.val)) achieve.earn();
        }
      }
    }
  };
  listener.achieveUnit=function(unitname, rawcount) {
    const list=this.game._achievements.list;
    for (let i=0;i<list.length;i++) {
      const achieve=list[i];
      if (achieve.isEarned()) continue;
      for (let j=0;j<achieve.requires.length;j++) {
        const req=achieve.requires[j];
        if (!req.event && req.unit && req.val) {
          let count;
          if (rawcount) count=req.unit.count();
          else {
            const twinnum=req.unit.statistics().twinnum;
            if (!twinnum) continue;
            count=twinnum instanceof Decimal ? twinnum : new Decimal(twinnum);
          }
          if (count.greaterThanOrEqualTo(req.val)) achieve.earn();
        }
      }
    }
  };
  const commands=get('commands');
  // This facade does not expose upstream undo, which depends on its legacy encoded storage.
  commands._setUndo=function() {};
  return {clock, session, game, commands, scope, opening};
}
// Whether a colony has anything beyond the starting stock: a roach, an upgrade, mutagen, an ascension.
function hasProgress(state) {
  return Object.keys(state.upgrades).some(id=>!state.upgrades[id].isZero()) ||
    Object.keys(state.unittypes).some(id=>STARTING_STOCK.indexOf(id) === -1 && !state.unittypes[id].isZero());
}
// The saved opening is {awake:true} or {awake:false,forages:n}. A save without one predates the
// opening; like a save that claims dormancy, it stays awake once it owns anything, and otherwise
// keeps its stock and waits for its first purchase.
function readOpening(input, state) {
  const saved=input.opening;
  if (saved !== undefined) {
    assertObject(saved,'opening');
    if (typeof saved.awake !== 'boolean' || Object.keys(saved).some(key=>key !== 'awake' && key !== 'forages')) throw failure('invalid opening');
    if (saved.awake ? saved.forages !== undefined : !Number.isSafeInteger(saved.forages) || saved.forages < 0) throw failure('invalid opening forages');
  }
  const awake=(saved !== undefined && saved.awake) || hasProgress(state);
  return {dormant:!awake,forages:awake ? 0 : saved ? saved.forages : 0};
}
// The first purchase wakes the nest for good. The purchase has just reified, so production starts
// from now with no catch-up.
function wakeNest(r) {
  r.game.reify();
  r.opening.dormant=false;
  r.opening.forages=0;
  if (r.game.cache && r.game.cache.invalidateUnitStats) r.game.cache.invalidateUnitStats('invisiblehatchery');
  r.game.cache.onUpdate();
}
function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('invalid ' + label);
}
function cloneJson(value) {
  let copy;
  try { copy = JSON.parse(JSON.stringify(value)); } catch (error) { throw failure('state must be JSON serializable', error); }
  function scan(node, depth) {
    if (depth > 20) throw failure('state nesting exceeds limit');
    if (typeof node === 'number' && !Number.isFinite(node)) throw failure('invalid number');
    if (node && typeof node === 'object') Object.keys(node).forEach(key => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw failure('unsafe state key');
      scan(node[key], depth + 1);
    });
  }
  scan(copy, 0);
  return copy;
}
function validateState(input, runtime) {
  assertObject(input, 'engine state');
  if (input.engine !== 'swarm-coffee' || input.version !== 2 || input.sourceCommit !== SOURCE_COMMIT) throw failure('unsupported engine state version');
  timestamp(input.clock);
  if (input.timePolicy !== undefined) {
    assertObject(input.timePolicy,'active time policy');
    if (input.timePolicy.activeOnly !== true || typeof input.timePolicy.paused !== 'boolean') throw failure('invalid active time policy');
    timestamp(input.timePolicy.wallAnchor);
  }
  const state = cloneJson(input.state);
  assertObject(state, 'core state');
  const game = runtime.game;
  for (const pair of [['unittypes',game.units()],['upgrades',game.upgrades()]]) {
    const key = pair[0], resources = pair[1];
    assertObject(state[key], key);
    Object.keys(state[key]).forEach(id => {
      if (!Object.prototype.hasOwnProperty.call(resources,id)) throw failure('unknown ' + key + ' id ' + id);
      const raw = state[key][id];
      if (typeof raw !== 'string' || raw.length > 200 || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) throw failure('invalid decimal count ' + id);
      const value = new Decimal(raw);
      if (!value.isFinite() || value.isNegative() || value.greaterThan(LIMIT)) throw failure('count outside engine limits ' + id);
      if (key === 'upgrades' && (!value.isInteger() || (resources[id].type.maxlevel && value.greaterThan(resources[id].type.maxlevel)))) throw failure('invalid upgrade level ' + id);
      if (key === 'unittypes' && ['ascension','freeRespec','nexus','mtxEnergy','crystal'].includes(id) && !value.isInteger()) throw failure('fractional discrete count ' + id);
      if (key === 'upgrades') resources[id].cost.forEach(cost=>{if(cost.factor.greaterThan(1) && value.greaterThan(Math.ceil(100001/Math.log10(cost.factor.toNumber())))) throw failure('upgrade level exceeds finite economy ' + id);});
      if (key === 'unittypes' && id === 'nexus' && value.greaterThan(5)) throw failure('nexus count exceeds the five unlocks');
      state[key][id] = value;
    });
  }
  game.unitlist().forEach(unit => { if (state.unittypes[unit.name] === undefined) throw failure('missing unit count ' + unit.name); });
  assertObject(state.date, 'dates');
  ['started','restarted','saved','reified','closed'].forEach(key => {if (state.date[key] === undefined) throw failure('missing date ' + key);});
  Object.keys(state.date).forEach(key => {state.date[key] = new NativeDate(timestamp(state.date[key]));});
  if (state.date.reified.getTime() !== input.clock || state.date.started > state.date.reified || state.date.restarted > state.date.reified || (state.date.foraged && state.date.foraged > state.date.reified)) throw failure('inconsistent time anchor');
  assertObject(state.achievements, 'achievements');
  Object.keys(state.achievements).forEach(id => {if (!game.achievement(id) || typeof state.achievements[id] !== 'number' || !Number.isFinite(state.achievements[id]) || state.achievements[id] < 0) throw failure('invalid achievement ' + id);});
  assertObject(state.statistics,'statistics');
  ['byUnit','byUpgrade'].forEach((key,index) => {
    assertObject(state.statistics[key], 'statistics.' + key);
    Object.keys(state.statistics[key]).forEach(id => {
      if (!(index ? game.upgrades() : game.units())[id]) throw failure('unknown statistics resource');
      const row=state.statistics[key][id];assertObject(row,'statistics row');
      if (!Number.isSafeInteger(row.clicks) || row.clicks < 0 || !Number.isSafeInteger(row.elapsedFirst) || row.elapsedFirst < 0 || row.elapsedFirst > input.clock - state.date.started.getTime()) throw failure('invalid statistics metadata');
      Object.keys(row).forEach(field => {if (!['clicks','num','twinnum','elapsedFirst'].includes(field)) throw failure('unknown statistics field'); const value=new Decimal(row[field]);if(!value.isFinite() || value.isNegative() || value.greaterThan(LIMIT)) throw failure('invalid statistics value');});
    });
  });
  if (!Number.isSafeInteger(state.statistics.clicks) || state.statistics.clicks < 0) throw failure('invalid click count');
  if (!Number.isSafeInteger(state.skippedMillis) || state.skippedMillis < 0) throw failure('invalid skipped time');
  assertObject(state.watched,'watched upgrades');
  Object.keys(state.watched).forEach(id => {if (!game.upgrade(id) || (typeof state.watched[id] !== 'boolean' && (!Number.isFinite(state.watched[id]) || Math.abs(state.watched[id]) > 1e6))) throw failure('invalid watched upgrade');});
  return {state,opening:readOpening(input,state)};
}

// Guest feats live outside the source achievement list. Their points still feed Accomplished ancestry.
function bindFeatPoints(game) {
  if (game.setBonusAchievementPoints) return;
  let bonus=0;
  const earned=game.achievementPoints.bind(game);
  game.achievementPoints=function() { return earned()+bonus; };
  game.setBonusAchievementPoints=function(points) {
    const next=Math.max(0, Math.min(1000, Math.floor(Number(points)) || 0));
    if (next !== bonus) {
      bonus=next;
      if (game.cache && game.cache.invalidateUnitStats) game.cache.invalidateUnitStats('invisiblehatchery');
    }
  };
}
function forgetCache(game, id) {
  const cache=game.cache;
  if (!cache) return;
  ['eachCost','eachProduction','totalProduction','velocity','stats'].forEach(key => { if (cache[key]) delete cache[key][id]; });
}
// Active-time colonies only. Early meat tiers and the first three nexuses stay on the upstream curve.
// Later meat tiers, the last two nexuses, mutagen gates and ascension energy are pulled in so a first
// ascension lands near 30 visible hours instead of the upstream ~190.
function applyActiveBalance(game) {
  const sacrifice=tier => tier <= 5 ? 0.4 : tier === 6 ? 0.35 : tier === 7 ? 0.3 : 0.25;
  game.unitlist().forEach(unit => {
    if (unit.tab && unit.tab.name === 'meat' && (unit.type.tier || 0) >= 5) {
      const scale=sacrifice(unit.type.tier);
      unit.cost.forEach(cost => {
        if (cost.unit.name !== 'meat' && cost.unit.name !== 'larva') cost.val=cost.val.times(scale);
      });
      unit.prod.forEach(prod => { prod.val=prod.val.times('1.4'); });
      forgetCache(game, unit.name);
    }
    if (unit.name === 'nexus') {
      unit.prod.forEach(prod => { if (prod.unit.name === 'energy') prod.val=new Decimal('0.2'); });
      forgetCache(game, 'nexus');
      forgetCache(game, 'energy');
    }
  });
  const prices={
    nexus4:{larva:1e7, energy:7500},
    nexus5:{meat:1e23, larva:5e7, energy:18000}
  };
  Object.keys(prices).forEach(id => {
    const upgrade=game.upgrade(id);
    Object.keys(prices[id]).forEach(resource => {
      const cost=upgrade.costByName[resource];
      if (cost) cost.val=new Decimal(prices[id][resource]);
    });
  });
  const expansion=game.upgrade('expansion').costByName.territory;
  if (expansion) expansion.factor=new Decimal('2.3');
  game.upgradelist().forEach(upgrade => {
    if (!/twin$/.test(upgrade.name) || !upgrade.unit.prod.some(prod => prod.unit.name === 'territory')) return;
    const larva=upgrade.costByName.larva;
    if (larva && larva.factor.equals(50)) larva.factor=new Decimal(35);
  });
  const mutant=game.unit('mutanteach');
  if (mutant && mutant.effect) mutant.effect.forEach(effect => {
    if (effect.stat === 'random.minlevel.hatchery') effect.val=30;
    if (effect.stat === 'random.minlevel.expansion') effect.val=48;
  });
  forgetCache(game, 'invisiblehatchery');
  const ascend=game.ascendCost.bind(game);
  game.ascendCost=function(opts) {
    if ((!opts || opts.spent === undefined) && game.cache && game.cache._ascendCost) return game.cache._ascendCost;
    const spent=opts && opts.spent !== undefined ? new Decimal(opts.spent) : game.ascendEnergySpent();
    const penalty=Decimal.pow('1.12', game.unit('ascension').count());
    // A first colony generates on the order of 70k energy by 30 visible hours. The cost has to
    // fall under the nexus cap with that much spent, which the upstream 5M / 50k curve never does.
    const velocity=new Decimal(8000).times(game.unit('mutagen').stat('ascendCost', 1));
    const res=penalty.times('400000').dividedBy(Decimal.pow(2, spent.dividedBy(velocity))).ceil();
    if ((!opts || opts.spent === undefined) && game.cache) game.cache._ascendCost=res;
    return res;
  };
  game._sourceAscendCost=ascend;
}

class Game {
  constructor(options) {
    const now=timestamp(options && options.now !== undefined ? options.now : NativeDate.now());
    this._runtime=createRuntime(now,null,{dormant:true,forages:0});
    this._timePolicy=options && options.activeTimeOnly ? {activeOnly:true,paused:true,wallAnchor:now} : null;
    bindFeatPoints(this._runtime.game);
    if (this._timePolicy) applyActiveBalance(this._runtime.game);
  }
  refundGreaterQueenOnce() {
    const inner=this._runtime && this._runtime.game;
    if (!inner || !inner.unit) return false;
    const gq=inner.unit('greaterqueen');
    if (!gq || !gq.count().equals(1)) return false;
    gq._setCount(0);
    inner.unit('nest')._addCount(10000);
    inner.unit('meat')._addCount(6561000);
    inner.unit('larva')._addCount(1);
    if (inner.session && inner.session.state) {
      if (inner.session.state.statistics && inner.session.state.statistics.byUnit) delete inner.session.state.statistics.byUnit.greaterqueen;
      if (inner.session.state.achievements) delete inner.session.state.achievements.greaterqueen1;
    }
    if (inner.cache) {
      if (typeof inner.cache.invalidateStats === 'function') inner.cache.invalidateStats();
      if (typeof inner.cache.onUpdate === 'function') inner.cache.onUpdate();
    }
    return true;
  }
  setBonusAchievementPoints(points) {
    const inner=this._runtime.game;
    if (typeof inner.setBonusAchievementPoints === 'function') inner.setBonusAchievementPoints(points);
  }
  get activeTimeOnly() { return !!this._timePolicy; }
  get paused() { return !!this._timePolicy && this._timePolicy.paused; }
  _advance(now) {
    const r=this._runtime, wallNow=timestamp(now === undefined ? NativeDate.now() : now);
    if (this._timePolicy) {
      const policy=this._timePolicy;
      // Logical source dates age only during visible play. A clock rollback
      // rebases the next wall interval without rewinding or duplicating game time.
      const elapsed=policy.paused ? 0 : Math.max(0,wallNow-policy.wallAnchor);
      r.clock.now=timestamp(r.clock.now+elapsed);
      policy.wallAnchor=wallNow;
    } else r.clock.now=Math.max(r.clock.now,wallNow);
    r.game.tick(new NativeDate(r.clock.now));
    return r;
  }
  pause(now) {
    const wallNow=timestamp(now === undefined ? NativeDate.now() : now);
    this._advance(wallNow);
    this._timePolicy={activeOnly:true,paused:true,wallAnchor:wallNow};
    return {paused:true,clock:this._runtime.clock.now};
  }
  resume(now) {
    const wallNow=timestamp(now === undefined ? NativeDate.now() : now);
    if (this._timePolicy) this._advance(wallNow);
    this._timePolicy={activeOnly:true,paused:false,wallAnchor:wallNow};
    return {paused:false,clock:this._runtime.clock.now};
  }
  exportState(now) {
    const r=this._advance(now), game=r.game, live=r.session.state;
    // The export holds exactly what the source's reify would store, but the live colony is
    // not reified: that clears every per-update cache, so the refresh after each routine
    // save rebuilt all production paths and stuttered. Counts come from this tick's cache.
    // Production now rebases its floored ancestors at purchases and rewards rather than at
    // every save as well, which shifts long-run counts by about a millionth.
    live.date.saved=new NativeDate(r.clock.now);
    const unittypes={};
    const unitKeys=Object.keys(live.unittypes);
    for (let i=0;i<unitKeys.length;i++) {
      const k=unitKeys[i], v=live.unittypes[k];
      unittypes[k]=v && typeof v.toString === 'function' ? v.toString() : String(v);
    }
    const unitList=game._units.list;
    for (let i=0;i<unitList.length;i++) {
      const u=unitList[i];
      unittypes[u.name]=u.count().toString();
    }
    const upgrades={};
    const upKeys=Object.keys(live.upgrades);
    for (let i=0;i<upKeys.length;i++) {
      const k=upKeys[i], v=live.upgrades[k];
      upgrades[k]=v && typeof v.toString === 'function' ? v.toString() : String(v);
    }
    const date={};
    const dateKeys=Object.keys(live.date);
    for (let i=0;i<dateKeys.length;i++) {
      const k=dateKeys[i];
      date[k]=k === 'reified' ? game.now.getTime() : live.date[k].getTime();
    }
    date.reified=game.now.getTime();
    const copyStatsMap=src=>{
      const out={};
      if (!src) return out;
      const keys=Object.keys(src);
      for (let i=0;i<keys.length;i++) {
        const k=keys[i], row=src[k], copy={};
        const fields=Object.keys(row);
        for (let j=0;j<fields.length;j++) {
          const f=fields[j], v=row[f];
          copy[f]=v instanceof Decimal ? v.toString() : v;
        }
        out[k]=copy;
      }
      return out;
    };
    const state={
      unittypes,
      upgrades,
      date,
      options:Object.assign({},live.options),
      statistics:{
        byUnit:copyStatsMap(live.statistics && live.statistics.byUnit),
        byUpgrade:copyStatsMap(live.statistics && live.statistics.byUpgrade),
        clicks:(live.statistics && live.statistics.clicks) || 0
      },
      achievements:Object.assign({},live.achievements),
      watched:Object.assign({},live.watched),
      skippedMillis:live.skippedMillis+game.diffMillis()-game._realDiffMillis(),
      version:Object.assign({},live.version)
    };
    const exported={engine:'swarm-coffee',version:2,sourceCommit:SOURCE_COMMIT,clock:r.clock.now,state,opening:r.opening.dormant ? {awake:false,forages:r.opening.forages} : {awake:true}};
    if (this._timePolicy) exported.timePolicy=Object.assign({},this._timePolicy);
    return exported;
  }
  importState(input, now) {
    const target=timestamp(now === undefined ? NativeDate.now() : now);
    const valid=validateState(input,this._runtime);
    const activeOnly=this.activeTimeOnly || !!input.timePolicy;
    const candidate=createRuntime(activeOnly ? input.clock : Math.max(input.clock,target),valid.state,valid.opening);
    bindFeatPoints(candidate.game);
    if (activeOnly) applyActiveBalance(candidate.game);
    candidate.game.reify();
    candidate.game.unitlist().forEach(unit=>{const value=unit.count();if(!value.isFinite() || value.isNegative() || value.greaterThan(LIMIT))throw failure('import produced an invalid count');});
    const previous=this._runtime, previousPolicy=this._timePolicy;
    this._runtime=candidate;
    // A persisted running session always reopens paused. Loading is never play.
    this._timePolicy=activeOnly ? {activeOnly:true,paused:true,wallAnchor:target} : null;
    try { this.snapshot(target, {includeItems:false,includeAchievements:false,includeMenu:false}); } catch(error) {this._runtime=previous;this._timePolicy=previousPolicy;throw failure('imported colony cannot be presented',error);}
  }
  act(action, now) {
    if (action === 'forage') action={type:'forage'};
    if (action && action.type === 'reward') return this._reward(action,now);
    if (!action || !['unit','upgrade','ascend','respec','forage'].includes(action.type) || ![1,10,'max','share'].includes(action.quantity === undefined ? 1 : action.quantity) || (['unit','upgrade'].includes(action.type) && typeof action.id !== 'string')) return {ok:false,message:'Invalid action.'};
    if (action.type === 'forage' && action.quantity !== undefined && action.quantity !== 1) return {ok:false,message:'Forage gathers one click at a time.'};
    const r=this._runtime, game=r.game;
    let resource;
    if (action.type === 'unit' || action.type === 'upgrade') {
      if (!Object.prototype.hasOwnProperty.call(action.type === 'unit' ? game.units() : game.upgrades(),action.id)) return {ok:false,message:'Unknown resource.'};
      resource=action.type === 'unit' ? game.unit(action.id) : game.upgrade(action.id);
      if (!resource || (action.type === 'upgrade' && action.id === 'mutatehidden')) return {ok:false,message:'Unknown resource.'};
    }
    this._advance(now);
    if (this.paused) return {ok:false,message:'Show the colony to continue playing.'};
    try {
      if (action.type === 'forage') {
        const meat=game.unit('meat');
        if (meat.count().greaterThanOrEqualTo(LIMIT)) return {ok:false,message:'Crumb storage is full.'};
        // A dormant nest has no production to scale with: each forage brings one crumb, and
        // every second one a hatchling as well. Update the stock and affordability caches directly
        // without reifying all 58 units or wiping velocity/production caches on each click.
        const hatchling=r.opening.dormant && (r.opening.forages+1)%2 === 0;
        const crevice=game.upgrade('expansion').count();
        const reward=Decimal.min(Decimal.max(1,meat.velocity()).times(crevice.times('0.05').plus(1)),LIMIT.minus(meat.count()));
        const addStock=(unit,amount)=>{
          const next=unit.rawCount().plus(amount);
          r.session.state.unittypes[unit.name]=next;
          if (game.cache.unitRawCount) game.cache.unitRawCount[unit.name]=next;
          if (game.cache.unitCount && game.cache.unitCount[unit.name]) game.cache.unitCount[unit.name]=game.cache.unitCount[unit.name].plus(amount);
          if (game.cache.producerPathCoefficients[unit.name]) game.cache.producerPathCoefficients[unit.name][0]=next;
        };
        addStock(meat,reward);
        const larva=game.unit('larva');
        if (hatchling) addStock(larva,1);
        game.cache.unitMaxCostMet={};
        game.cache.upgradeMaxCostMet={};
        game.cache.upgradeIsUpgradable={};
        game.cache.upgradeEstimateSecsUntilBuyablePeriodic={};
        game.cache.upgradeEstimateSecsUntilBuyableCacheSafe={};
        delete game.cache.tutorialStep;
        if (r.opening.dormant) r.opening.forages+=1;
        r.session.state.date.foraged=new NativeDate(r.clock.now);
        r.session.state.statistics.clicks+=1;
        return {ok:true,message:'Foraged '+format(reward)+' crumbs'+(hatchling ? ' and 1 hatchling.' : '.'),hatchling,meat:format(meat.count().floor()),larva:hatchling ? format(larva.count().floor()) : undefined};
      }
      if (resource) {
        if (!resource.isVisible() || !resource.isBuyable()) return {ok:false,message:'Requirements or resource cost are not met.'};
        if (action.type === 'upgrade' && action.quantity === 'max' && resource.maxCostMet().greaterThan(1000)) return {ok:false,message:'This batch exceeds 1,000 upgrades. Use quantity 10 to keep the overlay responsive.'};
        return purchase(r,resource,action.type,action.quantity === undefined ? 1 : action.quantity);
      }
      if (action.type === 'ascend') {
        if (!game.unit('premutagen').isVisible() || game.ascendCostPercent().lessThan(1)) return {ok:false,message:'Ascension requirements are not met.'};
        const reward=game.unit('premutagen').count().toString();
        r.commands.ascend({game});
        return {ok:true,message:'Ascended. Mutagen and permanent progress preserved.',reward};
      }
      if (game.unit('ascension').count().lessThan(1)) return {ok:false,message:'Ascend before respeccing mutations.'};
      if (game.unit('freeRespec').count().greaterThan(0)) r.commands.respecFree({game});
      else if (game.isRespecCostMet()) r.commands.respec({game});
      else return {ok:false,message:'Respec energy cost is not met.'};
      return {ok:true,message:'Mutation points refunded.'};
    } catch (error) { throw failure('action ' + action.type + ' failed',error); }
  }
  // Overlay events (a golden roach, a visitor, an intruder, the night shift) pay out a bounded
  // number of seconds of one resource's current production, added once like a forage.
  _reward(action, now) {
    const label=REWARDS[action.resource];
    if (!label || typeof action.seconds !== 'number' || !(action.seconds > 0) || action.seconds > MAX_REWARD_SECONDS) return {ok:false,message:'Invalid reward.'};
    if (action.resource === 'energy' && action.seconds > 300) return {ok:false,message:'Invalid reward.'};
    const r=this._advance(now), game=r.game;
    if (this.paused) return {ok:false,message:'Show the colony to continue playing.'};
    if (action.resource === 'energy' && !game.unit('energy').isVisible()) return {ok:false,message:'Energy is not available yet.'};
    try {
      const unit=game.unit(action.resource);
      let room=LIMIT.minus(unit.count());
      const cap=unit.capValue();
      if (cap) room=Decimal.min(room,new Decimal(cap).minus(unit.count()));
      const crevice=game.upgrade('expansion').count().toNumber();
      const seconds=Math.min(MAX_REWARD_SECONDS, action.seconds * (1 + crevice * 0.01));
      const reward=Decimal.min(unit.velocity().times(seconds),room).floor();
      if (!reward.greaterThan(0)) return {ok:false,message:room.greaterThan(0) ? 'Nothing to gain yet.' : 'Storage is full.'};
      game.withSave(()=>unit._addCount(reward));
      return {ok:true,message:'Gained '+format(reward)+' '+label+'.',reward:{resource:action.resource,amount:format(reward),amountExact:reward.toString()}};
    } catch (error) { throw failure('reward failed',error); }
  }
  // Auto-buy tries its bindings in the caller's order after one clock advance, so waiting
  // bindings cost a cached affordability check instead of a fresh tick each. The first
  // affordable binding buys its share; index tells the caller which one it was. An earlier
  // upgrade that is only short on larva holds that stock so a later unit cannot drain it.
  autoBuy(bindings, now, options) {
    if (!Array.isArray(bindings) || bindings.length > 16) return {ok:false,message:'Invalid auto-buy list.'};
    options=options || {};
    const r=this._advance(now), game=r.game;
    if (this.paused) return {ok:false,message:'Show the colony to continue playing.'};
    let holdReason='';
    try {
      let reservedResource=null, resKind='', resId='';
      const reserveNeeds={};
      const resSpec=options.reserve;
      if (resSpec && typeof resSpec === 'object') {
        resKind=resSpec.kind || resSpec.type || '';
        resId=typeof resSpec.id === 'string' ? resSpec.id : '';
        if (['unit','upgrade'].includes(resKind) && resId && resId !== 'mutatehidden' && Object.prototype.hasOwnProperty.call(resKind === 'unit' ? game.units() : game.upgrades(),resId)) {
          const candidate=resKind === 'unit' ? game.unit(resId) : game.upgrade(resId);
          if (candidate && candidate.isVisible()) {
            reservedResource=candidate;
            const resCosts=resKind === 'unit' ? candidate.eachCost() : candidate.totalCost();
            for (let i=0;i<resCosts.length;i++) reserveNeeds[resCosts[i].unit.name]=resCosts[i].val;
          }
        }
      }
      if (reservedResource && reservedResource.isBuyable()) {
        for (let i=0;i<bindings.length;i++) {
          const b=bindings[i] || {}, bType=b.type || b.kind;
          if (bType === resKind && b.id === resId) {
            return Object.assign(purchase(r,reservedResource,resKind,'share',false),{index:i});
          }
        }
      }
      let holdLarva=false;
      for (let index=0;index<bindings.length;index++) {
        const binding=bindings[index] || {}, bType=binding.type || binding.kind;
        if (!['unit','upgrade'].includes(bType) || typeof binding.id !== 'string' || binding.id === 'mutatehidden' || !Object.prototype.hasOwnProperty.call(bType === 'unit' ? game.units() : game.upgrades(),binding.id)) continue;
        const resource=bType === 'unit' ? game.unit(binding.id) : game.upgrade(binding.id);
        if (!resource || !resource.isVisible()) continue;
        const costs=bType === 'unit' ? resource.eachCost() : resource.totalCost();
        if (bType === 'upgrade' && onlyShortOn(costs,'larva')) {
          holdLarva=true;
          if (!holdReason) holdReason='Holding hatchlings for ' + plain(resource.type.label);
          continue;
        }
        if (holdLarva && costs.some(cost=>cost.unit.name === 'larva')) continue;
        if (resource.isBuyable()) {
          if (reservedResource && !(bType === resKind && binding.id === resId) && costs.some(cost=>reserveNeeds[cost.unit.name] !== undefined)) {
            let amount=purchaseAmount(resource,bType,'share');
            if (bType === 'unit') {
              for (let c=0;c<costs.length;c++) {
                const need=reserveNeeds[costs[c].unit.name];
                if (need !== undefined) {
                  const free=costs[c].unit.count().minus(need);
                  if (free.lessThanOrEqualTo(0)) { amount=ZERO; break; }
                  amount=Decimal.min(amount,free.dividedBy(costs[c].val).floor());
                }
              }
            } else {
              while (amount.greaterThan(0)) {
                const sum=resource.sumCost(amount);
                const dips=sum.some(c=>reserveNeeds[c.unit.name] !== undefined && c.unit.count().minus(c.val).lessThan(reserveNeeds[c.unit.name]));
                if (!dips) break;
                amount=amount.minus(1);
              }
            }
            if (amount.lessThanOrEqualTo(0)) {
              holdReason='Saving for ' + plain(reservedResource.type.label);
              continue;
            }
            return Object.assign(purchase(r,resource,bType,amount,false),{index});
          }
          return Object.assign(purchase(r,resource,bType,'share',false),{index});
        }
      }
      if (!holdReason && reservedResource) holdReason='Saving for ' + plain(reservedResource.type.label);
    } catch (error) { throw failure('auto-buy failed',error); }
    return {ok:false,message:'Waiting for resources.',holdReason:holdReason || ''};
  }
  // How long until a quick pick is affordable, asked only when its key is pressed while it is short.
  // ready means every cost is in stock now; an empty label means a missing cost has no production.
  quickEta(kind, id, now) {
    const game=this._advance(now).game;
    if (!['unit','upgrade'].includes(kind) || typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(kind === 'unit' ? game.units() : game.upgrades(),id)) return null;
    const resource=kind === 'unit' ? game.unit(id) : game.upgrade(id);
    const wait=costWait(kind === 'unit' ? resource.eachCost() : resource.totalCost());
    if (wait === null) return {ready:false,label:''};
    if (wait.isZero()) return {ready:true,label:''};
    const seconds=wait.lessThan(YEAR) ? wait.ceil().toNumber() : null;
    return {ready:false,label:seconds === null ? 'over a year' : seconds < 60 ? seconds+'s' : duration(seconds)};
  }
  // Lightweight counter read for the alternate 500 ms beat between full 1 Hz snapshots.
  fastCounts(ids, now) {
    const r=this._advance(now), game=r.game, out={};
    if (!Array.isArray(ids)) return out;
    for (let i=0;i<ids.length;i++) {
      const id=ids[i], unit=game.unit(id);
      if (!unit) continue;
      const whole=id !== 'territory' && id !== 'energy' && id !== 'mutagen' && id !== 'premutagen';
      out[id]=format(whole ? unit.count().floor() : unit.count());
    }
    return out;
  }
  snapshot(now, options) {
    options=options || {};
    const quantity=options.quantity === undefined ? 1 : options.quantity;
    if (![1,10,'max'].includes(quantity)) throw failure('invalid snapshot quantity');
    if (options.ids !== undefined && (!Array.isArray(options.ids) || options.ids.some(id=>typeof id !== 'string'))) throw failure('invalid snapshot ids');
    const r=this._advance(now), game=r.game;
    const units=game._units.list, upgrades=game._upgrades.list;
    const visibleUnits=units.filter(unit=>!unit.type.disabled && unit.isVisible() && !unit.type.unbuyable && !unit.type.isBuyHidden && unit.isBuyButtonVisible());
    const visibleUpgrades=upgrades.filter(upgrade=>upgrade.name !== 'mutatehidden' && upgrade.isVisible() && upgrade.cost.every(cost=>cost.unit.isVisible()));
    const items=[], itemIds=[];
    const selected=(resource,kind)=> (!options.tab || resourceTab(resource,kind) === options.tab) && (!options.kind || kind === options.kind);
    // Upgrade quotes need Decimal logarithms. itemIds lists the whole selection so a caller
    // can page through it while quoting only the rows it shows.
    const quoted=resource=>{itemIds.push(resource.name);return !options.ids || options.ids.indexOf(resource.name) !== -1;};
    if (options.includeItems !== false) {
      visibleUnits.filter(unit=>selected(unit,'unit') && quoted(unit)).forEach(unit=> {
        const costs=unit.eachCost();
        const quote=batchQuote(unit,'unit',quantity,costs);
        const floored=unit.count().floor();
        const vel=unit.velocity();
        const available=quote.affordable !== '0';
        items.push(Object.assign({id:unit.name,kind:'unit',tab:unit.tab ? unit.tab.name : 'meat',name:unit._plainLabel || plain(unit.type.label),description:describeUnit(unit),production:unitProduction(unit),velocity:format(vel),tier:unit.type.tier || 0,owned:format(floored),ownedExact:floored.toString(),cost:costText(costs),costs:costList(costs),available,visible:true,bottleneck:bottleneckInfo(game,costs,available)},quote));
      });
      visibleUpgrades.filter(upgrade=>selected(upgrade,'upgrade') && quoted(upgrade)).forEach(upgrade=> {
        const costs=upgrade.totalCost();
        const quote=batchQuote(upgrade,'upgrade',quantity,costs);
        const level=upgrade.count();
        const available=quote.affordable !== '0';
        items.push(Object.assign({id:upgrade.name,kind:'upgrade',tab:upgrade.unit.tab ? upgrade.unit.tab.name : 'larva',name:plain(upgrade.type.label),description:describeUpgrade(upgrade),effects:upgradeEffects(upgrade),impact:upgradeImpact(upgrade),owned:format(level),ownedExact:level.toString(),cost:costText(costs),costs:costList(costs),available,visible:true,bottleneck:bottleneckInfo(game,costs,available)},quote));
      });
    }
    const resources=['meat','larva','territory','energy','premutagen','mutagen','cocoon'].map(id=>game.unit(id)).filter(unit=>unit.isVisible()).map(unit=>({id:unit.name,name:unit._plainLabel || plain(unit.type.label),amount:format(['meat','larva','cocoon'].includes(unit.name) ? unit.count().floor() : unit.count()),rate:format(unit.velocity()),cap:unit.capValue() ? format(unit.capValue()) : ''}));
    let population=ZERO;
    for (let i=0;i<units.length;i++) {
      const unit=units[i];
      if (unit.tab && unit.type.tier > 0 && (!unit.rawCount().isZero() || unit._producerPath.getCoefficients().length > 1)) {
        population=population.plus(unit.count().floor());
      }
    }
    const earnedAchievementIds=Object.keys(r.session.state.achievements).filter(id=>!WEBSITE_ACHIEVEMENTS.includes(id));
    const achievements=options.includeAchievements === false ? [] : game._achievements.list.filter(a=>!WEBSITE_ACHIEVEMENTS.includes(a.name)).map(a=>{
      const unmasked=a.isEarned() || a.isUnmasked();
      return {id:a.name,name:plain(unmasked ? a.type.label : 'Unknown achievement'),description:unmasked ? plain(a.description()) : 'Continue growing to discover this achievement.',earned:a.isEarned(),earnedAt:a.isEarned() ? r.session.state.achievements[a.name] : null,masked:!unmasked,progress:unmasked && !a.isEarned() ? achievementProgress(a) : null};
    });
    const snapshot={
      resources,paused:this.paused,activeTimeOnly:this.activeTimeOnly,dormant:r.opening.dormant,population:format(population),populationExact:population.toString(),ascensions:format(game.unit('ascension').count()),
      items,itemIds,achievements,
      visibleUnitIds:visibleUnits.map(unit=>unit.name),visibleUpgradeIds:visibleUpgrades.map(upgrade=>upgrade.name),upgradeLevels:upgradeLevels(game,upgrades),visibleUnits:visibleUnits.map(unit=>{const floored=unit.count().floor(), vel=options.includeRates ? unit.velocity() : undefined; return {id:unit.name,name:unit._plainLabel || plain(unit.type.label),description:unit._plainDesc || plain(unit.type.description),productionTargets:unit._prodTargets || unit.prod.map(production=>({id:production.unit.name,name:plain(production.unit.type.label)})),tier:unit.type.tier || 0,owned:floored.greaterThanOrEqualTo(1),count:format(floored),countExact:floored.toString(),velocity:vel ? format(vel) : undefined,velocityExact:vel ? vel.toString() : undefined};}),earnedAchievementIds,earnedAchievementCount:earnedAchievementIds.length,earnedAchievements:earnedAchievementIds.map(id=>({id,name:plain(game.achievement(id).type.label)})),
      coverage:{units:units.length,upgrades:upgrades.length,achievements:game._achievements.list.length,playableAchievements:114,sourceCommit:SOURCE_COMMIT}
    };
    if (options.includeEta) snapshot.nextEta=nextEta(game);
    // Only a hint request or a watching phone asks for the tutorial step.
    if (options.includeHint) snapshot.hint=tutorial(game);
    if (options.includeQuick) {
      snapshot.quickSlots=r.opening.dormant ? dormantSlots(visibleUnits) : quickSlots(game,visibleUnits,visibleUpgrades);
      if (options.pinnedQuick !== undefined) {
        snapshot.pinnedCandidate=resolvePinnedQuick(game,visibleUnits,visibleUpgrades,options.pinnedQuick);
      }
    }
    // The compact overlay shows the next goal only while the nest is dormant, and never tabs or
    // ascension. Skipping them avoids ascendCost, which totals every energy purchase.
    if (options.includeMenu === false) return r.opening.dormant ? Object.assign(snapshot,nextGoal(game,null,true)) : snapshot;
    const unlocked=game.unit('premutagen').isVisible();
    const free=game.unit('freeRespec').count();
    const ascendCost=game.ascendCost(), respecCost=ascendCost.times(game.respecCostRate).ceil(), energy=game.unit('energy').count();
    return Object.assign(snapshot,{
      tabs:game.tabs.list.filter(tab=>tab.isVisible()).map(tab=>({id:tab.name,label:plain(tab.leadunit.type.label),kinds:['unit','upgrade'].filter(kind=>(kind === 'unit' ? visibleUnits : visibleUpgrades).some(resource=>resourceTab(resource,kind) === tab.name))})),
      prestige:{unlocked,available:unlocked && energy.greaterThanOrEqualTo(ascendCost),preview:unlocked && options.includeAscension ? ascensionPreview(game,ascendCost) : undefined,cost:format(ascendCost)+' energy',reward:format(game.unit('premutagen').count())+' mutagen',rewardExact:game.unit('premutagen').count().toString(),rewardRatio:rewardRatio(game.unit('premutagen').count(),options.lastAscensionReward),reset:'Meat, larvae, territory, energy, units and ordinary upgrades.',preserve:'Mutagen, mutations, achievements and ascension count.',description:'Ascend to collect pending mutagen. Resets meat, larvae, territory, energy, units and ordinary upgrades. Preserves mutagen, mutations, achievements and ascension count. Every third ascension awards a free respec.'},
      respec:{unlocked:game.unit('ascension').count().greaterThan(0),available:free.greaterThan(0) || energy.greaterThanOrEqualTo(respecCost),cost:free.greaterThan(0) ? '1 free respec ('+format(free)+' available)' : format(respecCost)+' energy',description:'Refund all spent mutation points and reset mutation allocations. Paid respec also resets energy-spending progress toward ascension.'},
    },nextGoal(game,ascendCost,r.opening.dormant));
  }
}
const REWARDS={meat:'crumbs',larva:'hatchlings',territory:'territory',energy:'energy'};
const MAX_REWARD_SECONDS=3600;
const WEBSITE_ACHIEVEMENTS=['changelog','import','clickme','konami','debug','publictest1','therightquestion'];
// Owned upgrade levels let the habitat show built progress without quoting prices.
function upgradeLevels(game,upgrades) {
  if (game.cache && game.cache._upgradeLevels) return game.cache._upgradeLevels;
  const levels={};
  for (let i=0;i<upgrades.length;i++) {
    const upgrade=upgrades[i], count=upgrade.count();
    if (count.greaterThan(0)) levels[upgrade.name]=count.toString();
  }
  if (game.cache) game.cache._upgradeLevels=levels;
  return levels;
}
function resourceTab(resource,kind) { const tab=kind === 'unit' ? resource.tab : resource.unit.tab; return tab ? tab.name : kind === 'unit' ? 'meat' : 'larva'; }
function costText(costs) {
  return costs.length ? costs.map(cost=>format(cost.val)+' '+plain(cost.unit.type.label)).join(' + ') : '0';
}
function costList(costs) {
  return costs.map(cost=>({id:cost.unit.name,name:plain(cost.unit.type.label),amount:format(cost.val)}));
}
// Automation buys a tenth of what is affordable, at least one, so one tick never empties the
// stock a higher tier is waiting on. Upgrade costs grow geometrically, so their cheapest tenth
// costs at most about a tenth of the stock; the ten-level cap matches the menu's batch. Reusing
// the affordability quote avoids a second upgrade logarithm on the TV.
const SHARE=0.1;
function purchaseAmount(resource,kind,quantity) {
  const affordable=resource.maxCostMet();
  if (quantity === 'max') return affordable;
  if (quantity !== 'share') return Decimal.min(quantity,affordable);
  const share=Decimal.max(1,affordable.times(SHARE).floor());
  return Decimal.min(affordable,kind === 'upgrade' ? Decimal.min(10,share) : share);
}
// Automation is silent, so it skips pricing what it spent; that sum is a second upgrade quote.
function purchase(r,resource,kind,quantity,itemized) {
  const opts=kind === 'unit' ? {unit:resource} : {upgrade:resource};
  const amount=quantity instanceof Decimal ? quantity : purchaseAmount(resource,kind,quantity);
  const spent=itemized === false ? [] : costList(kind === 'unit' ? resource.eachCost().map(cost=>({unit:cost.unit,val:cost.val.times(amount)})) : resource.sumCost(amount));
  const before=resource.count().floor();
  if (quantity === 'max') r.commands[kind === 'unit' ? 'buyMaxUnit' : 'buyMaxUpgrade'](opts);
  else {opts.num=amount;r.commands[kind === 'unit' ? 'buyUnit' : 'buyUpgrade'](opts);}
  const gained=resource.count().floor().minus(before), name=plain(resource.type.label || resource.name);
  const woke=r.opening.dormant;
  if (woke) wakeNest(r);
  return {ok:true,message:'Purchased ' + name + '.',woke,purchase:{id:resource.name,kind,name,quantity:gained.toString(),quantityLabel:format(gained),spent}};
}
function batchQuote(resource,kind,quantity,costs) {
  const canBuy=kind !== 'unit' || resource.isBuyButtonVisible();
  // Most locked prices cannot afford even one. Avoid logarithms for those quotes.
  const affordable=canBuy && costs.length && costs.every(cost=>cost.unit.count().greaterThanOrEqualTo(cost.val)) ? Decimal.max(0,resource.maxCostMet()).floor() : new Decimal(0);
  const amount=quantity === 'max' ? affordable : Decimal.min(quantity,affordable);
  const batchCosts=amount.lessThanOrEqualTo(1) ? costs : kind === 'upgrade' ? resource.sumCost(amount) : costs.map(cost=>({unit:cost.unit,val:cost.val.times(amount)}));
  const gain=kind === 'unit' ? resource.capValue(resource.count().plus(amount.times(resource.twinMult()))).floor().minus(resource.count().floor()) : amount;
  const bounded=kind === 'upgrade' && quantity === 'max' && amount.greaterThan(1000);
  return {affordable:affordable.toString(),affordableLabel:format(affordable),batchQuantity:amount.toString(),batchQuantityLabel:format(amount),batchOwnedGain:gain.floor().toString(),batchOwnedGainLabel:format(gain.floor()),batchCost:costText(amount.isZero() ? costs : batchCosts),batchCosts:costList(amount.isZero() ? costs : batchCosts),batchAvailable:affordable.greaterThan(0) && !bounded,batchMessage:bounded ? 'Use quantity 10 for batches above 1,000 upgrades.' : ''};
}

function unitProduction(unit) {
  const production=unit.eachProduction();
  return Object.keys(production).map(id=>{const target=unit.game.unit(id);return format(production[id])+' '+(target._plainLabel || plain(target.type.label))+'/s each';}).join(', ');
}
function describeUnit(unit) {
  let text=unit._plainDesc || plain(unit.type.description);
  const outputs=unitProduction(unit);
  if(outputs) text+=' Produces '+outputs+'.';
  if(unit.twinMult().greaterThan(1)) text+=' Each purchase creates '+format(unit.twinMult())+' units.';
  return text;
}
function describeUpgrade(upgrade) {
  let text=plain(upgrade.type.description);
  if(text==='-') text='';
  const descriptions={mutatehatchery:'Unlocks a mutation that increases larva production.',mutatebat:'Unlocks a mutation that increases the power of all energy abilities.',mutateclone:'Unlocks a mutation that increases the maximum larvae that can be cloned.',mutateswarmwarp:'Unlocks a mutation that increases time gained from swarmwarp.',mutaterush:'Unlocks a mutation that strengthens Larvae Rush, Meat Rush and Territory Rush.',mutateeach:'Unlocks a mutation that increases mutagen awarded per hatchery or expansion spawn.',mutatefreq:'Unlocks a mutation that increases the chance of spawning mutagen from hatcheries and expansions.',mutatenexus:'Unlocks a mutation that increases energy generation and the energy cost of ascending.',mutatearmy:'Unlocks a mutation that increases territory production.',mutatemeat:'Unlocks a mutation that increases production across the entire meat chain.',achievementbonus:'Increases larva production based on achievement points.',hatchery:'Adds 1 larva per second before production multipliers. Higher levels can grant pending mutagen.',expansion:'Increases hatchery production by 10% per level. Higher levels can grant pending mutagen.',swarmwarp:'Advances the entire production chain through time without generating energy.',clonelarvae:'Clones banked larvae, with a limit based on current larva production.',clonearmy:'Clones banked territory units, with a limit based on current production.',larvarush:'Immediately produces larvae based on current larva production.',meatrush:'Immediately produces meat based on current meat production.',territoryrush:'Immediately produces territory based on current territory production.'};
  if(descriptions[upgrade.name]) text=descriptions[upgrade.name];
  if(/^mutate/.test(upgrade.name) && upgrade.name !== 'mutatehidden') text+=' Unlocking a mutation increases the cost of unlocking other mutation powers. Unspent mutagen also produces larvae.';
  const effects=[];
  upgrade.effect.forEach(effect=> {
    const target=effect.unit ? plain(effect.unit.type.label) : plain(upgrade.unit.type.label);
    if (['addStat','multStat','multStatLinear','multStatFixed','setStat'].includes(effect.type.name)) { const vocabulary={base:'base production',prod:'production multiplier',twin:'offspring multiplier',twinbase:'extra offspring per purchase',capMult:'capacity multiplier',capFlat:'extra capacity',upgradecost:'mutation unlock cost',power:'ability power'}; if(vocabulary[effect.stat]) effects.push(target+' '+vocabulary[effect.stat]+': '+(effect.type.name==='addStat'?'+':'×')+format(effect.val)); }
    else if (effect.type.name==='addUnit' || effect.type.name==='addUnitByVelocity' || effect.type.name==='compoundUnit') { const out=effect.outputNext(); if(out !== undefined) effects.push('Next use: +'+format(out)+' '+target); }
    else if(effect.type.name==='skipTime') effects.push('Time advance: '+format(effect.output())+' seconds');
  });
  if (effects.length) {
    let suffix = effects.join('; ');
    if (!text || /[.!?]$/.test(text)) suffix = suffix.charAt(0).toUpperCase() + suffix.slice(1);
    text += (text ? ' ' : '') + suffix + '.';
  }
  return text || 'Improves '+plain(upgrade.unit.type.label)+'.';
}
// Compact previews of one more level. Hidden helper units such as the hatchery are named
// by what they produce.
function upgradeEffects(upgrade) {
  const effects=[];
  upgrade.effect.forEach(effect=>{
    let unit=effect.unit || upgrade.unit;
    const targets=Object.keys(unit.eachProduction());
    if (unit.type.unbuyable && targets.length === 1) unit=unit.game.unit(targets[0]);
    if (['multStat','multStatLinear','multStatFixed'].includes(effect.type.name) && ['prod','twin','capMult','power'].includes(effect.stat)) effects.push({op:'×',stat:effect.stat,id:unit.name,name:plain(unit.type.label),amount:format(effect.val)});
    else if (effect.type.name === 'addStat' && ['base','twinbase','capFlat'].includes(effect.stat)) effects.push({op:'+',stat:effect.stat,id:unit.name,name:plain(unit.type.label),amount:format(effect.val)});
    else if (['addUnit','addUnitByVelocity','compoundUnit'].includes(effect.type.name) && effect.unit && !effect.unit.type.unbuyable) {
      const out=effect.outputNext();
      if (out !== undefined && new Decimal(out).greaterThan(0)) effects.push({op:'+',stat:'gain',id:effect.unit.name,name:plain(effect.unit.type.label),amount:format(out)});
    }
  });
  return effects.slice(0,2);
}
function upgradeImpact(upgrade) {
  for (let i=0;i<upgrade.effect.length;i++) {
    const effect=upgrade.effect[i];
    const rawUnit=effect.unit || upgrade.unit;
    const targets=Object.keys(rawUnit.eachProduction());
    const displayUnit=(rawUnit.type.unbuyable && targets.length === 1) ? rawUnit.game.unit(targets[0]) : rawUnit;
    if (['multStat','multStatLinear','multStatFixed','expStat'].includes(effect.type.name) && effect.stat === 'prod') {
      if (!rawUnit.count().isZero()) {
        const total=rawUnit.totalProduction();
        const curVal=targets[0] && total[targets[0]] ? total[targets[0]] : rawUnit.velocity();
        if (curVal && curVal.greaterThan(0)) {
          return plain(displayUnit.type.label)+' output: '+format(curVal)+'/s \u2192 '+format(curVal.times(effect.val))+'/s';
        }
      }
    } else if (['multStat','multStatLinear','multStatFixed'].includes(effect.type.name) && effect.stat === 'twin') {
      const curTwin=rawUnit.twinMult();
      return 'Each purchase: \u00d7'+format(curTwin)+' \u2192 \u00d7'+format(curTwin.times(effect.val));
    } else if (effect.type.name === 'addStat' && effect.stat === 'base') {
      const total=rawUnit.totalProduction();
      const curVal=targets[0] && total[targets[0]] ? total[targets[0]] : ZERO;
      const delta=new Decimal(effect.val).times(rawUnit.stat('prod',1)).times(rawUnit.count().floor());
      return plain(displayUnit.type.label)+' output: '+format(curVal)+'/s \u2192 '+format(curVal.plus(delta))+'/s';
    }
  }
  return '';
}
function achievementProgress(achievement) {
  const req=achievement.requires[0];
  if (!req || req.event || !req.resource || req.val === undefined) return null;
  const value=achievement.progressVal();
  if (!value) return null;
  const done=Decimal.min(value,req.val).floor(), max=new Decimal(req.val);
  return {id:req.resource.name,kind:req.upgrade ? 'upgrade' : 'unit',name:plain(req.resource.type.label),value:format(done),max:format(max),have:format(done),need:format(max),percent:max.greaterThan(0) ? done.dividedBy(max).toNumber() : 0};
}
function rewardRatio(reward,last) {
  if (typeof last !== 'string' || !/^\d+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(last)) return '';
  const previous=new Decimal(last);
  return previous.greaterThan(0) && reward.greaterThan(0) ? format(reward.dividedBy(previous)) : '';
}
const MAIN_CHAIN=['drone','queen','nest','greaterqueen','hive','hivequeen','empress','prophet','goddess','pantheon','pantheon2','pantheon3','pantheon4','pantheon5','overmind','overmind2','overmind3','overmind4','overmind5','overmind6'];
const TERRITORY_CHAIN=['swarmling','stinger','spider','mosquito','locust','roach','giantspider','centipede','wasp','devourer','goon'];
const QUICK_NONE=new Decimal(0), YEAR=new Decimal(31536000);
function bottleneckInfo(game, costs, available) {
  if (!costs || !costs.length) return null;
  let worst=costs[0];
  if (costs.length > 1) {
    let worstRatio=null;
    for (let i=0;i<costs.length;i++) {
      const cost=costs[i];
      const ratio=cost.val.isZero() ? LIMIT : cost.unit.count().dividedBy(cost.val);
      if (worstRatio === null || ratio.lessThan(worstRatio)) {
        worstRatio=ratio;
        worst=cost;
      }
    }
  }
  const cname=worst.unit.name;
  let producer;
  if (cname === 'meat') {
    producer={kind:'unit',id:'drone',name:plain(game.unit('drone').type.label)};
  } else if (cname === 'larva') {
    const exp=game.upgrade('expansion');
    const useExp=exp.isVisible() && exp.totalCost().every(c=>!c.unit.count().lessThan(c.val));
    producer={kind:'upgrade',id:useExp ? 'expansion' : 'hatchery',name:plain(game.upgrade('hatchery').type.label)};
  } else if (cname === 'territory') {
    let terrId='swarmling';
    for (let i=0;i<TERRITORY_CHAIN.length;i++) {
      const u=game.unit(TERRITORY_CHAIN[i]);
      if (u && !u.count().lessThan(ONE)) terrId=TERRITORY_CHAIN[i];
    }
    producer={kind:'unit',id:terrId,name:plain(game.unit(terrId).type.label)};
  } else if (cname === 'energy') {
    const moth=game.unit('moth');
    producer=moth && moth.isVisible()
      ? {kind:'unit',id:'moth',name:plain(moth.type.label)}
      : {kind:'upgrade',id:'nexus1',name:'nexus'};
  } else {
    const k=MAIN_CHAIN.indexOf(cname);
    const nextId=k !== -1 && MAIN_CHAIN[k+1] && game.unit(MAIN_CHAIN[k+1]).isVisible() ? MAIN_CHAIN[k+1] : cname;
    const pUnit=game.unit(nextId) || worst.unit;
    producer={kind:'unit',id:pUnit.name,name:plain(pUnit.type.label)};
  }
  return {id:cname,name:plain(worst.unit.type.label),short:!available,producer};
}
// True when every cost except `id` is in stock and `id` itself is short. A missing `id` cost is not a shortfall.
function onlyShortOn(costs, id) {
  let short=false;
  for (const cost of costs) {
    const met=!cost.unit.count().lessThan(cost.val);
    if (cost.unit.name === id) { if (!met) short=true; }
    else if (!met) return false;
  }
  return short;
}
// Seconds until every cost is in stock at current production, or null when a missing cost has
// no production. Produced tiers accelerate, so this is an upper bound.
function costWait(costs) {
  let wait=new Decimal(0);
  for (const cost of costs) {
    const missing=cost.val.minus(cost.unit.count());
    if (missing.lessThanOrEqualTo(0)) continue;
    const rate=cost.unit.velocity();
    if (rate.lessThanOrEqualTo(0)) return null;
    wait=Decimal.max(wait,missing.dividedBy(rate));
  }
  return wait;
}
// One more of the top owned main-chain role, or the first of the next role once its lower
// tier is in stock. Only slow waits under a day are reported.
function nextEta(game) {
  let top=-1;
  MAIN_CHAIN.forEach((id,index)=>{if (game.unit(id).count().greaterThanOrEqualTo(1)) top=index;});
  if (top === -1) return null;
  const candidates=[MAIN_CHAIN[top+1],MAIN_CHAIN[top]].filter(id=>id && game.unit(id).isVisible() && game.unit(id).isBuyButtonVisible());
  for (const id of candidates) {
    const unit=game.unit(id);
    const wait=costWait(unit.eachCost());
    if (wait === null) continue;
    if (wait.lessThan(120) || wait.greaterThanOrEqualTo(86400)) continue;
    const seconds=wait.ceil().toNumber(), hours=Math.floor(seconds/3600), minutes=Math.ceil(seconds%3600/60);
    return {id,name:plain(unit.type.label),seconds,label:hours ? hours+'h'+(minutes ? ' '+minutes+'m' : '') : minutes+'m'};
  }
  return null;
}
// What ascending right now would do, for the Evolution view and a phone showing it. Only those
// views ask for it, so compact and purchase refreshes skip the energy estimate and spawn rolls.
function ascensionPreview(game,cost) {
  const percent=game.ascendCostPercent(cost).times(100).floor();
  let energy='Energy ready.';
  if (percent.lessThan(100)) {
    const seconds=game.ascendCostDurationSecs(cost);
    energy='Energy '+percent.toString()+'% of '+brief(cost)+(seconds === undefined ? '; spend energy to lower it.' : seconds > 0 && isFinite(seconds) ? ', full in '+duration(seconds)+'.' : '.');
  }
  const mutagenUnit = game.unit('mutagen');
  const mutagenProd = mutagenUnit && !mutagenUnit.count().isZero() && mutagenUnit.totalProduction().larva;
  const banked = mutagenProd && mutagenProd.greaterThan(0) ? '+' + brief(mutagenProd) + ' larvae/s from banked mutagen' : '';
  return {gain:brief(game.unit('premutagen').count()),percent:percent.toString(),energy,keeps:'Keeps mutagen, mutations and achievements; the rest resets.',next:nextMutagen(game),banked,planner:ascensionPlanner(game,cost)};
}
function ascensionPlanner(game,cost) {
  const thresholds=[];
  const sources=['hatchery','expansion'].map(id=>{
    const upgrade=game.upgrade(id), effect=(upgrade.effectByType.addUnitRand || []).find(entry=>entry.unit.name === 'premutagen');
    return effect ? {id,upgrade,effect} : null;
  }).filter(Boolean);
  for (let step=1; step<=12 && thresholds.length<4; step++) {
    for (let i=0; i<sources.length && thresholds.length<4; i++) {
      const src=sources[i], level=src.upgrade.count().plus(step), out=src.effect.output(level);
      if (out.spawned) thresholds.push({id:src.id,name:plain(src.upgrade.type.label),level:format(level),gain:brief(out.qty)});
    }
  }
  let warpSave='', warpImpact='';
  if (cost.greaterThan(11500) && game.unit('energy').isVisible()) {
    const afterCost=game.ascendCost({spent:game.ascendEnergySpent().plus(2000)});
    const savedEnergy=Decimal.max(0,cost.minus(afterCost));
    if (savedEnergy.greaterThan(0)) {
      warpImpact='Spending 2K energy drops cost by '+brief(savedEnergy)+' energy';
      warpSave=warpImpact;
    }
  }
  return {thresholds,warpSave,warpImpact};
}
// Spawn rolls are seeded by level, so the source's own output() says exactly which upcoming
// hatchery or expansion level adds pending mutagen and how much. A spawn is guaranteed at
// least every eight levels, which bounds the look-ahead.
function nextMutagen(game) {
  const parts=[];
  ['hatchery','expansion'].forEach(id=> {
    const upgrade=game.upgrade(id), effect=(upgrade.effectByType.addUnitRand || []).find(entry=>entry.unit.name === 'premutagen');
    if (!effect) return;
    for (let step=1; step<=8; step++) {
      const level=upgrade.count().plus(step), out=effect.output(level);
      if (out.spawned) {parts.push(plain(upgrade.type.label).toLowerCase()+' '+format(level)+' adds '+brief(out.qty));return;}
    }
  });
  return parts.length ? 'Next mutagen: '+parts.join(', ')+'.' : '';
}
// format() keeps two decimals; the overlay shows at most three significant figures, truncated.
function brief(value) {
  const text=format(value), match=/^(-?)(\d+)\.(\d+)([KMB]?)$/.exec(text);
  if (!match) return text;
  const fraction=match[3].slice(0,Math.max(0,3-match[2].length)).replace(/0+$/,'');
  return match[1]+match[2]+(fraction ? '.'+fraction : '')+match[4];
}
function duration(seconds) {
  if (seconds < 60) return 'under a minute';
  const minutes=Math.ceil(seconds/60), hours=Math.floor(minutes/60), days=Math.floor(hours/24);
  if (days) return days+'d'+(hours%24 ? ' '+hours%24+'h' : '');
  return hours ? hours+'h'+(minutes%60 ? ' '+minutes%60+'m' : '') : minutes+'m';
}
// The sentence and the row it points at, for the menu text and remote key 7. A goal whose
// target is a resource rather than a row has none, so the key falls back to the ETA row.
// Quick-buy passes no ascendCost, which skips the costly ascension check; ascending is no purchase.
function nextGoal(game,ascendCost,dormant) {
  const goal=(text,kind,id)=>({nextGoal:text,nextGoalTarget:kind ? {kind,id} : null});
  const price=unit=>unit.eachCost().map(cost=>format(cost.val)+' '+plain(cost.unit.type.label)).join(' + ');
  if (dormant) return goal('Press Red to forage. Gather '+price(game.unit('drone')).replace(' + ',' and ')+' for your first drone.','unit','drone');
  if (game.unit('drone').count().isZero()) return goal('Hatch your first drone for '+price(game.unit('drone'))+'. It gathers meat continuously.','unit','drone');
  if (!game.unit('queen').isVisible()) return goal('Grow to 10 drones to reveal queens. Hatcheries produce more larvae.','unit','drone');
  if (!game.unit('territory').isVisible()) return goal('Hatch 5 queens to unlock territory. Each queen costs '+price(game.unit('queen'))+'.','unit','queen');
  if (!game.unit('energy').isVisible()) {
    if (game.unit('swarmling').count().isZero() && game.unit('territory').count().isZero() && game.unit('queen').count().lessThan(10)) return goal('Hatch your first swarmling to begin capturing territory.','unit','swarmling');
    if (game.upgrade('expansion').count().isZero() && !game.unit('swarmling').count().isZero()) return goal('Your swarmlings are claiming territory. Build your first expansion once you have enough.','upgrade','expansion');
    if (game.unit('nest').isVisible() && game.unit('nest').count().isZero() && game.upgrade('expansion').count().greaterThanOrEqualTo(3)) return goal('Raise your first nest for '+price(game.unit('nest'))+' to hatch queens automatically.','unit','nest');
    const nexus=game.upgrade('nexus1');
    if (nexus.isVisible()) return goal('Build your first nexus for '+costText(nexus.totalCost())+' to unlock energy and abilities.','upgrade','nexus1');
    const requirement=nexus.requires.map(req=>format(req.val)+' '+plain(req.unit.type.label)).join(' + ');
    return goal('Reach '+requirement+' to reveal your first nexus and generate energy.');
  }
  if (!game.unit('premutagen').isVisible()) {
    const hatchery=game.unit('invisiblehatchery');
    const minH=hatchery.stat('random.minlevel.hatchery'), minE=hatchery.stat('random.minlevel.expansion');
    const curH=game.upgrade('hatchery').count(), curE=game.upgrade('expansion').count();
    const closer=curE.dividedBy(minE).greaterThan(curH.dividedBy(minH)) ? 'expansion' : 'hatchery';
    return goal('Build '+format(curH)+'/'+format(minH)+' hatcheries or '+format(curE)+'/'+format(minE)+' expansions to begin earning pending mutagen.','upgrade',closer);
  }
  if (ascendCost && game.ascendCostPercent(ascendCost).greaterThanOrEqualTo(1)) return goal('Ascension is available. Review the reset and mutagen reward.','ascend','ascend');
  if (ascendCost) {
    const cap=game.unit('energy').capValue();
    if (cap && ascendCost.greaterThan(cap)) return goal('Spend energy on abilities to drop ascension cost ('+brief(ascendCost)+') below your '+brief(cap)+' energy cap.','upgrade','hatchery');
    return goal('Save up '+brief(ascendCost)+' energy ('+game.ascendCostPercent(ascendCost).times(100).floor().toString()+'% ready) to ascend, and grow hatcheries or expansions for more mutagen.','upgrade','hatchery');
  }
  return goal('Spend energy on abilities to lower ascension cost. Grow hatcheries and expansions for more mutagen.','upgrade','hatchery');
}
// The original web game's tutorial messages (source/directives/tutorial.coffee), with its links and
// markup reduced to their words. Upstream remembers the first mutagen spawn and the first ascension for
// one browser session only; pending mutagen and a first ascension with no mutation unlocked stand in
// for them here. Upstream falls silent after five expansions and later ascensions, so the colony's
// own steps carry on in the same voice from the nexus to ascension.
const TUTORIAL={
  1:'Welcome to Swarm Simulator. Starting with just a few larvae and a small pile of meat, grow a massive swarm of giant bugs. Your brood starts its life with a small pile of meat and a single larva-producing hatchery. Larvae mutate into other units. Begin your growth by using your meat and larvae to hatch some drones.',
  2:'You lead a small brood of worker drones. Drones gather meat. Use this meat to build more drones and expand your brood.',
  3:'You lead a small brood of worker drones. Once you have plenty of meat, upgrade your hatchery to produce more larvae by selecting \'larvae\' and spending some meat.',
  11:'An arrow appears when you have enough meat to upgrade your hatchery.',
  4:'You lead a small brood of worker drones. They long for a queen. You must sacrifice many drones to hatch a queen, but once born, your queen will slowly hatch drones without consuming meat or larvae.',
  5:'Hatch more queens to grow your swarm. Hatching drones with the "Twin Drones" upgrade will allow you to rapidly raise more queens.',
  6:'Queens have rapidly grown your swarm, and your growth demands more territory. Begin capturing territory by building military units - swarmlings or stingers.',
  7:'Your warriors have slowly begun securing territory. Continue expanding your military.',
  8:'Your warriors have captured a lot of territory, and soon you can secure your first expansion. Expansions increase larva production. Select \'larvae\' to expand.',
  9:'Expansion is the key to growing your swarm rapidly. Build a large military to expand your territory and produce more larvae. Build more queens and, eventually, nests to produce more meat for your military.',
  10:'Your swarm has grown large enough to ascend - gain even greater power and restart on a new world! Take a look at the mutagen tab.',
  100:'Congratulations on your first ascension! Mutations can make your swarm much more powerful. Mutagen you haven\'t spent yet will produce some larvae - don\'t spend it all right away!',
  nexus:'Your swarm has outgrown its territory. Build a nexus to gather energy, the power behind your swarm\'s greatest abilities.',
  energy:'Your nexus hums with energy. Spend it on abilities when you need a burst of growth, and keep building hatcheries and expansions: one of them will soon bring your first mutagen.',
  ascended:'Each new world grows faster than the last. Spend mutagen on mutations, rebuild your queens and military, and grow past your last ascension for even more mutagen.'
};
function tutorialStep(game) {
  const count=id=>game.unit(id).count(), level=id=>game.upgrade(id).count();
  const ascension=count('ascension');
  if (!ascension.isZero()) return ascension.equals(1) && !game.upgradelist().some(upgrade=>/^mutate/.test(upgrade.name) && upgrade.name !== 'mutatehidden' && !upgrade.count().isZero()) ? 100 : 'ascended';
  if (!count('premutagen').isZero()) return 10;
  if (level('expansion').greaterThanOrEqualTo(5)) return game.unit('energy').isVisible() ? 'energy' : 'nexus';
  if (level('expansion').greaterThan(0)) return 9;
  if (level('hatchery').greaterThan(0)) {
    if (count('queen').greaterThanOrEqualTo(5)) {
      if (count('territory').greaterThan(5)) return 8;
      if (count('territory').greaterThan(0)) return 7;
      return 6;
    }
    if (count('queen').greaterThan(0)) return 5;
  }
  if (count('drone').greaterThanOrEqualTo(10)) {
    if (level('hatchery').greaterThan(0)) return 4;
    if (count('meat').greaterThanOrEqualTo(300)) return 11;
    return 3;
  }
  if (count('drone').greaterThan(0)) return 2;
  return 1;
}
function tutorial(game) {
  const step=tutorialStep(game);
  return {step,text:TUTORIAL[step]};
}

// Candidates for the compact quick-buy keys 1–4, best first per slot: the next goal, the top
// main-chain roach, an upgrade, and expansion. The overlay drops duplicates and keeps a pick
// steady (docs/ui-spec.md). Upgrade prices come from the source's cached totalCost, so this
// needs no logarithms. progress is the scarcest cost's share in stock, at most 1, and gain is
// what a key press buys.
function buildQuickCandidate(game,resource,kind) {
  const costs=kind === 'unit' ? resource.eachCost() : resource.totalCost();
  let progress=null;
  for (const cost of costs) {
    const have=cost.unit.count();
    if (!have.lessThan(cost.val)) continue;
    const share=have.e <= cost.val.e-3 ? QUICK_NONE : have.dividedBy(cost.val);
    if (progress === null || share.lessThan(progress)) progress=share;
  }
  const affordable=progress === null;
  return {kind,id:resource.name,name:plain(resource.type.label),affordable,progress:affordable ? 1 : Math.min(0.99,Math.floor(progress.toNumber()*100)/100),resource,costs};
}
function stripQuickCandidate(game,c) {
  if (c._stripped) return c._stripped;
  let gain='0';
  if (c.affordable) {
    if (c.kind === 'upgrade') gain='1';
    else {
      const unit=c.resource, owned=unit.count();
      gain=format(unit.capValue(owned.plus(unit.maxCostMet().times(unit.twinMult()))).floor().minus(owned.floor()));
    }
  }
  c._stripped={kind:c.kind,id:c.id,name:c.name,affordable:c.affordable,progress:c.progress,gain,bottleneck:bottleneckInfo(game,c.costs,c.affordable)};
  return c._stripped;
}
function resolvePinnedQuick(game,visibleUnits,visibleUpgrades,pinned) {
  if (!pinned || typeof pinned !== 'object') return null;
  const kind=pinned.kind || pinned.type;
  const id=pinned.id;
  if (!['unit','upgrade'].includes(kind) || typeof id !== 'string') return null;
  const list=kind === 'unit' ? visibleUnits : visibleUpgrades;
  const resource=list.find(entry=>entry.name === id);
  if (!resource) return null;
  return stripQuickCandidate(game,buildQuickCandidate(game,resource,kind));
}
function quickSlots(game,visibleUnits,visibleUpgrades) {
  // Visible units already passed isBuyButtonVisible. A share under 1% floors to 0, so a stock
  // three or more orders of magnitude short skips the Decimal division.
  const candidate=(resource,kind)=>buildQuickCandidate(game,resource,kind);
  // Affordable ones highest tier first, then the rest by how close they are. Ties keep list
  // order explicitly, since Chromium 68's sort is not stable.
  const ranked=list=>list.map((c,index)=>({c,index})).sort((a,b)=>(b.c.affordable-a.c.affordable) || (a.c.affordable ? b.c.tier-a.c.tier : b.c.progress-a.c.progress) || a.index-b.index).slice(0,3).map(entry=>entry.c);
  // Only main-chain and territory roaches can fill a slot.
  const units={};
  visibleUnits.forEach(unit=> {
    const territorial=unit.prod.some(production=>production.unit.name === 'territory');
    if (territorial || MAIN_CHAIN.indexOf(unit.name) !== -1) units[unit.name]=Object.assign(candidate(unit,'unit'),{tier:unit.type.tier || 0,territorial});
  });
  // An upgrade ranks by the roach it improves, main-chain roaches above territory ones.
  const upgrades={};
  visibleUpgrades.forEach(upgrade=>{
    if (upgrade.type.class !== 'upgrade' || /^mutate/.test(upgrade.name)) return;
    if ((upgrade.unit.type.tier || 0) > 0 && upgrade.unit.count().isZero()) return;
    const nexusStep=/^nexus(\d)$/.exec(upgrade.name);
    // A nexus level the colony already has stays out of the slot, so the next Build a nexus can lead it.
    if (nexusStep && game.unit('nexus').count().greaterThanOrEqualTo(Number(nexusStep[1]))) return;
    const chainIndex=MAIN_CHAIN.indexOf(upgrade.unit.name);
    const tier=nexusStep ? 200 : chainIndex !== -1 ? 100+chainIndex : upgrade.unit.type.tier || 0;
    upgrades[upgrade.name]=Object.assign(candidate(upgrade,'upgrade'),{tier});
  });
  const goal=[];
  const target=nextGoal(game).nextGoalTarget;
  if (target && (target.kind === 'unit' ? units : upgrades)[target.id]) goal.push((target.kind === 'unit' ? units : upgrades)[target.id]);
  let top=-1;
  MAIN_CHAIN.forEach((id,index)=>{if (game.unit(id).count().greaterThanOrEqualTo(1)) top=index;});
  if (units[MAIN_CHAIN[top+1]] && goal.indexOf(units[MAIN_CHAIN[top+1]]) === -1) goal.push(units[MAIN_CHAIN[top+1]]);
  const chain=ranked(MAIN_CHAIN.filter(id=>units[id]).map(id=>units[id]));
  const upgrade=ranked(Object.keys(upgrades).map(id=>upgrades[id]));
  const territory=ranked(Object.keys(units).map(id=>units[id]).filter(c=>c.territorial))[0];
  const twin=ranked(Object.keys(upgrades).filter(id=>/twin$/.test(id) && upgrades[id].resource.unit.prod.some(production=>production.unit.name === 'territory')).map(id=>upgrades[id]))[0];
  const expand=[upgrades.expansion,twin,territory,upgrades.hatchery].filter(Boolean).map((c,index)=>({c,index})).sort((a,b)=>(b.c.affordable-a.c.affordable)||(b.c.progress-a.c.progress)||(a.index-b.index)).map(entry=>entry.c);
  const ABILITIES=['larvarush','swarmwarp','meatrush','territoryrush'];
  const readyAbility=visibleUpgrades.filter(upgrade=>upgrade.type.class === 'ability' && ABILITIES.indexOf(upgrade.name) !== -1).map(upgrade=>candidate(upgrade,'upgrade')).filter(entry=>entry.affordable);
  const savingEnergy=visibleUpgrades.some(upgrade=>/^nexus[2-5]$/.test(upgrade.name) && onlyShortOn(upgrade.totalCost(),'energy'));
  const fifth=readyAbility.length && !savingEnergy ? readyAbility.slice(0,1) : chain.concat(upgrade,expand);
  // What one key press gets: as many of a roach as stock allows (with twins, within its cap), or one
  // upgrade level. Only the listed affordable roaches pay for the source's cached maxCostMet.
  const strip=c=>stripQuickCandidate(game,c);
  return [goal,chain,upgrade,expand,fifth].map(list=>list.map(strip));
}
// A dormant nest offers one pick, its first forager, so the strip points only at the goal.
function dormantSlots(visibleUnits) {
  const drone=visibleUnits.filter(unit=>unit.name === 'drone')[0];
  return [drone ? quickSlots(drone.game,[drone],[])[0] : [],[],[],[],[]];
}

module.exports={Game,SOURCE_COMMIT,format};
