/* Pure, headless colony session policies: quick-buy 4-refresh hysteresis
   (QUICK_SETTLE), auto-buy binding rotation and tier ranking, achievement
   ordering, and bounded crash/event journal ring buffer. Testable in Node
   without a DOM. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachSession = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var QUICK_SETTLE = 4;
  var AUTO_MAX = 16;
  var JOURNAL_MAX = 100;
  var JOURNAL_BYTES = 20480;
  var ACTIVITY_MAX = 24;
  var RUNS_MAX = 12;
  var CASTE_ORDER = ['drone','queen','nest','greaterqueen','hive','hivequeen','empress','prophet','goddess','pantheon','pantheon2','pantheon3','pantheon4','pantheon5','overmind','overmind2','overmind3','overmind4','overmind5','overmind6'];
  var UI_KEYS = {
    milestones: 'phil_roach_colony_ui_milestones_v1',
    visitors: 'phil_roach_colony_ui_visitors_v1',
    catches: 'phil_roach_colony_ui_catches_v1',
    journal: 'phil_roach_colony_ui_journal_v1',
    lastPurchase: 'phil_roach_colony_ui_last_purchase_v1',
    auto: 'phil_roach_colony_ui_auto_v1',
    autoPaused: 'phil_roach_colony_ui_auto_paused_v1',
    lastAscension: 'phil_roach_colony_ui_last_ascension_v1',
    flavor: 'phil_roach_colony_ui_flavor_v1',
    standalone: 'phil_roach_colony_ui_standalone_v1',
    pin: 'phil_roach_colony_ui_pin_v1',
    reserve: 'phil_roach_colony_ui_reserve_v1',
    expedition: 'phil_roach_colony_ui_expedition_v1',
    records: 'phil_roach_colony_ui_records_v1',
    activity: 'phil_roach_colony_ui_activity_v1',
    firstSeen: 'phil_roach_colony_ui_first_seen_v1'
  };

  function quickKey(entry) {
    return entry ? entry.kind + ':' + entry.id : '';
  }

  function createQuickState() {
    return {
      picks: [null, null, null, null],
      pending: [null, null, null, null],
      fresh: false
    };
  }

  // Chooses up to 5 quick-buy picks from snapshot.quickSlots with 4-refresh hysteresis.
  function chooseQuick(state, slots, pinnedCandidate) {
    if (!slots) {
      state.fresh = false;
      return state.picks;
    }
    if (!state.fresh) {
      state.picks = [null, null, null, null, null];
      state.pending = [null, null, null, null, null];
      state.fresh = true;
    }
    var pool = [];
    slots.forEach(function (list) { pool = pool.concat(list); });
    pool = pool.map(function (entry, index) { return {entry: entry, index: index}; })
      .sort(function (a, b) { return b.entry.progress - a.entry.progress || a.index - b.index; })
      .map(function (row) { return row.entry; });
    var used = {};
    var hasPin = !!(pinnedCandidate && pinnedCandidate.id);
    if (hasPin) {
      used[quickKey(pinnedCandidate)] = true;
    } else if (state.picks[0] && state.picks[0].pinned) {
      state.picks[0] = null;
      state.pending[0] = null;
    }
    state.picks = slots.map(function (list, slot) {
      if (slot === 0 && hasPin) {
        state.pending[0] = null;
        return Object.assign({}, pinnedCandidate, {pinned: true});
      }
      var open = list.concat(pool).filter(function (entry) { return !used[quickKey(entry)]; });
      var best = open[0] || null;
      var held = state.picks[slot] && open.filter(function (entry) { return quickKey(entry) === quickKey(state.picks[slot]); })[0];
      var pick = best;
      var pending = null;
      if (held && quickKey(held) !== quickKey(best)) {
        var before = state.pending[slot];
        pending = {key: quickKey(best), count: before && before.key === quickKey(best) ? before.count + 1 : 1};
        if (pending.count < QUICK_SETTLE) pick = held;
        else pending = null;
      }
      state.pending[slot] = pending;
      if (pick) used[quickKey(pick)] = true;
      return pick;
    });
    return state.picks;
  }

  // Higher tiers get first claim on shared stock; upgrades follow units.
  function orderAutoBindings(bindings, visibleUnits, cursor) {
    if (!bindings || !bindings.length) return {ordered: [], start: 0};
    var tiers = {};
    (visibleUnits || []).forEach(function (entry) { tiers[entry.id] = Number(entry.tier) || 0; });
    var order = bindings.map(function (entry, index) {
      return {
        type: entry.type,
        id: entry.id,
        rank: entry.type === 'unit' ? 1 + (tiers[entry.id] || 0) : 0,
        index: index
      };
    });
    order.sort(function (a, b) { return b.rank - a.rank || a.index - b.index; });
    var start = (cursor || 0) % order.length;
    return {
      ordered: order.slice(start).concat(order.slice(0, start)),
      start: start
    };
  }

  function inspectAuto(bindings, paused, reserve, snapshot, lastHoldReason) {
    var list = Array.isArray(bindings) ? bindings : [];
    var ordered = orderAutoBindings(list, snapshot && snapshot.visibleUnits, 0).ordered;
    return {
      state: !list.length ? 'off' : paused ? 'paused' : (reserve || lastHoldReason) ? 'waiting' : 'running',
      count: list.length,
      next: ordered[0] || null,
      reserve: reserve || null,
      reason: paused ? 'Paused' : lastHoldReason ? lastHoldReason : reserve ? 'Saving toward ' + reserve.id : list.length ? 'Running' : 'Off'
    };
  }

  function reserveProgress(reserve, snapshot) {
    if (!reserve || !reserve.id || !snapshot) return null;
    var rKind = reserve.kind || reserve.type;
    var found = null;
    var items = snapshot.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === reserve.id && (!rKind || items[i].kind === rKind)) {
        found = items[i];
        break;
      }
    }
    if (!found && snapshot.pinnedCandidate && snapshot.pinnedCandidate.id === reserve.id && (!rKind || snapshot.pinnedCandidate.kind === rKind)) {
      found = snapshot.pinnedCandidate;
    }
    if (!found && Array.isArray(snapshot.quickSlots)) {
      for (var s = 0; s < snapshot.quickSlots.length && !found; s++) {
        var slotList = snapshot.quickSlots[s] || [];
        for (var j = 0; j < slotList.length; j++) {
          if (slotList[j].id === reserve.id && (!rKind || slotList[j].kind === rKind)) {
            found = slotList[j];
            break;
          }
        }
      }
    }
    if (!found) return null;
    var available = !!(found.available !== undefined ? found.available : found.affordable);
    var progress = typeof found.progress === 'number' ? found.progress : (available ? 1 : 0);
    return {
      kind: found.kind || rKind || 'unit',
      id: found.id,
      name: found.name || found.id,
      available: available,
      progress: progress,
      costs: found.costs || []
    };
  }

  function validateControls(bindings, lastPurchase, snapshot) {
    if ((!bindings || !bindings.length) && !lastPurchase) {
      return {bindings: bindings || [], lastPurchase: lastPurchase, bindingsChanged: false, lastChanged: false};
    }
    if (!snapshot || !snapshot.visibleUnitIds || !snapshot.visibleUpgradeIds) {
      return {bindings: bindings, lastPurchase: lastPurchase, bindingsChanged: false, lastChanged: false};
    }
    function valid(entry) {
      return (entry.type === 'unit' ? snapshot.visibleUnitIds : snapshot.visibleUpgradeIds).indexOf(entry.id) !== -1;
    }
    var kept = (bindings || []).filter(valid);
    var nextLast = lastPurchase && valid(lastPurchase) ? lastPurchase : null;
    return {
      bindings: kept,
      lastPurchase: nextLast,
      bindingsChanged: kept.length !== (bindings || []).length,
      lastChanged: nextLast !== lastPurchase
    };
  }

  // Closest locked goals first, then latest earned, then one summary row for undiscovered ones.
  function orderAchievements(list, cache) {
    var signature = list.map(function (entry) {
      return entry.id + (entry.earned ? '+' : entry.masked ? '?' : entry.progress ? entry.progress.value : '');
    }).join();
    if (cache && signature === cache.signature) return cache;
    var ranked = list.map(function (entry, index) { return {entry: entry, index: index}; });
    var open = ranked.filter(function (row) { return !row.entry.earned && !row.entry.masked; });
    open.sort(function (a, b) {
      return (b.entry.progress ? b.entry.progress.percent || 0 : -1) - (a.entry.progress ? a.entry.progress.percent || 0 : -1) || a.index - b.index;
    });
    var earned = ranked.filter(function (row) { return row.entry.earned; });
    earned.sort(function (a, b) { return (b.entry.earnedAt || 0) - (a.entry.earnedAt || 0) || a.index - b.index; });
    var hidden = list.length - open.length - earned.length;
    var rows = open.concat(earned).map(function (row) { return row.entry; });
    if (hidden) rows.push({id: '__undiscovered', name: hidden + ' more to discover', description: 'Keep growing the colony to reveal them.', summary: true});
    return {signature: signature, rows: rows};
  }

  function pageIds(ids, page, size) {
    var ordered = (ids || []).slice().reverse();
    var current = Math.min(page, Math.max(0, Math.ceil(ordered.length / size) - 1));
    return ordered.slice(current * size, current * size + size);
  }

  function appendJournal(journal, lvl, cat, msg, detail, now) {
    var entry = {t: now || Date.now(), lvl: lvl, cat: cat, msg: String(msg || '').slice(0, 180)};
    if (detail !== undefined) {
      try {
        var textDetail = typeof detail === 'string' ? detail : JSON.stringify(detail);
        entry.d = textDetail.slice(0, 260);
      } catch (error) { /* Ignore unserializable detail. */ }
    }
    journal.push(entry);
    if (journal.length > JOURNAL_MAX) journal.splice(0, journal.length - JOURNAL_MAX);
    return entry;
  }

  function recordActivity(list, kind, title, text, now) {
    var target = Array.isArray(list) ? list : [];
    var entry = {
      t: typeof now === 'number' && isFinite(now) ? Math.floor(now) : Date.now(),
      kind: String(kind || 'event').slice(0, 32),
      title: String(title || '').slice(0, 80),
      text: String(text || '').slice(0, 160)
    };
    target.unshift(entry);
    if (target.length > ACTIVITY_MAX) target.length = ACTIVITY_MAX;
    return target;
  }

  function parseMagnitude(value) {
    var s = String(value || '0').trim();
    if (!s || s === '0') return {exp: -Infinity, mantissa: 0};
    var sci = /^(\d+(?:\.\d*)?|\.\d+)e([+-]?\d+)$/i.exec(s);
    if (sci) {
      var m = parseFloat(sci[1]);
      if (!m || !isFinite(m)) return {exp: -Infinity, mantissa: 0};
      var shift = Math.floor(Math.log(m) / Math.LN10);
      return {exp: parseInt(sci[2], 10) + shift, mantissa: m / Math.pow(10, shift)};
    }
    var plainMatch = /^(\d+)(?:\.(\d*))?([KMB])?$/i.exec(s);
    if (plainMatch) {
      var intDigits = plainMatch[1].replace(/^0+/, '');
      var fracDigits = plainMatch[2] || '';
      var suffix = (plainMatch[3] || '').toUpperCase();
      var suffixExp = suffix === 'K' ? 3 : suffix === 'M' ? 6 : suffix === 'B' ? 9 : 0;
      if (!intDigits) {
        var nz = fracDigits.search(/[1-9]/);
        if (nz === -1) return {exp: -Infinity, mantissa: 0};
        var sig = fracDigits.slice(nz, nz + 15);
        return {exp: suffixExp - nz - 1, mantissa: parseFloat(sig.charAt(0) + '.' + sig.slice(1))};
      }
      var lead = (intDigits + fracDigits).slice(0, 15);
      return {exp: intDigits.length - 1 + suffixExp, mantissa: parseFloat(lead.charAt(0) + '.' + lead.slice(1))};
    }
    return {exp: -Infinity, mantissa: 0};
  }

  function isGreaterMutagen(candidate, current) {
    var a = parseMagnitude(candidate);
    var b = parseMagnitude(current);
    if (a.exp !== b.exp) return a.exp > b.exp;
    return a.mantissa > b.mantissa;
  }

  function recordAscensionRun(records, runInfo) {
    var rec = records && typeof records === 'object' && !Array.isArray(records)
      ? records
      : {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''};
    if (!Array.isArray(rec.runs)) rec.runs = [];
    if (typeof rec.bestMutagen !== 'string') rec.bestMutagen = String(rec.bestMutagen || '0');
    if (typeof rec.fastestMs !== 'number' || !isFinite(rec.fastestMs) || rec.fastestMs < 0) rec.fastestMs = 0;
    if (typeof rec.highestCaste !== 'string') rec.highestCaste = '';

    var info = runInfo || {};
    var mutagen = String(info.mutagen !== undefined ? info.mutagen : info.reward !== undefined ? info.reward : '0');
    var durationMs = Math.max(0, Math.floor(Number(info.durationMs !== undefined ? info.durationMs : info.ms !== undefined ? info.ms : info.elapsedMs) || 0));
    var caste = String(info.highestCaste || info.caste || info.topUnit || '');
    var at = typeof info.at === 'number' && isFinite(info.at) ? Math.floor(info.at) : typeof info.now === 'number' && isFinite(info.now) ? Math.floor(info.now) : Date.now();

    var entry = {at: at, mutagen: mutagen, durationMs: durationMs, highestCaste: caste};
    if (info.ascension !== undefined) entry.ascension = String(info.ascension);
    rec.runs.unshift(entry);
    if (rec.runs.length > RUNS_MAX) rec.runs.length = RUNS_MAX;

    if (isGreaterMutagen(mutagen, rec.bestMutagen)) rec.bestMutagen = mutagen;
    if (durationMs > 0 && (!rec.fastestMs || durationMs < rec.fastestMs)) rec.fastestMs = durationMs;
    if (caste) {
      var newIdx = CASTE_ORDER.indexOf(caste);
      var oldIdx = CASTE_ORDER.indexOf(rec.highestCaste);
      if (!rec.highestCaste || (newIdx !== -1 && newIdx >= oldIdx) || oldIdx === -1) {
        rec.highestCaste = caste;
      }
    }
    return rec;
  }

  // Attaches overlay meta methods when a test harness replaces RoachSave.Store with a minimal mock.
  function ensureMetaStore(store, storage) {
    if (store && typeof store.loadMeta === 'function' && typeof store.savePin === 'function') return store;
    var target = store || {};
    function readRaw(key) {
      try { return storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null; }
      catch (error) { return null; }
    }
    function writeRaw(key, value) {
      try { if (storage && typeof storage.setItem === 'function') storage.setItem(key, String(value)); return true; }
      catch (error) { return false; }
    }
    function removeRaw(key) {
      try { if (storage && typeof storage.removeItem === 'function') storage.removeItem(key); return true; }
      catch (error) { return false; }
    }
    function cleanRef(v) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      var k = v.kind || v.type;
      if (['unit', 'upgrade'].indexOf(k) === -1 || typeof v.id !== 'string' || !v.id) return null;
      return {kind: k, id: v.id};
    }
    target.loadMeta = function () {
      var milestoneSeen = {}, lastPurchase = null, autoBindings = [], autoPaused = false, lastAscension = '', flavorIndex = 0, journal = [], visitors = {}, catches = {};
      var pinnedQuick = null, reserve = null, expedition = null, records = {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''}, activity = [], firstSeen = {};
      removeRaw(UI_KEYS.standalone);
      try {
        var rawM = JSON.parse(readRaw(UI_KEYS.milestones) || '{}');
        if (rawM && typeof rawM === 'object' && !Array.isArray(rawM)) milestoneSeen = rawM;
      } catch (error) { milestoneSeen = {}; }
      try {
        lastPurchase = JSON.parse(readRaw(UI_KEYS.lastPurchase) || 'null');
        if (lastPurchase && (['unit', 'upgrade'].indexOf(lastPurchase.type) === -1 || typeof lastPurchase.id !== 'string')) lastPurchase = null;
        if (lastPurchase && [1, 10, 'max'].indexOf(lastPurchase.quantity) === -1) delete lastPurchase.quantity;
        var savedAuto = JSON.parse(readRaw(UI_KEYS.auto) || '[]');
        autoPaused = readRaw(UI_KEYS.autoPaused) === 'true';
        lastAscension = readRaw(UI_KEYS.lastAscension) || '';
        flavorIndex = Math.max(0, parseInt(readRaw(UI_KEYS.flavor), 10) || 0);
        if (Array.isArray(savedAuto)) autoBindings = savedAuto.filter(function (entry) { return entry && ['unit', 'upgrade'].indexOf(entry.type) !== -1 && typeof entry.id === 'string'; }).slice(0, AUTO_MAX);
      } catch (error) { lastPurchase = null; autoBindings = []; }
      try {
        var savedJ = JSON.parse(readRaw(UI_KEYS.journal) || '[]');
        if (Array.isArray(savedJ)) journal = savedJ.slice(-JOURNAL_MAX);
      } catch (error) { journal = []; }
      try {
        var savedV = JSON.parse(readRaw(UI_KEYS.visitors) || '{}');
        if (savedV && typeof savedV === 'object' && !Array.isArray(savedV)) visitors = savedV;
      } catch (error) { visitors = {}; }
      try {
        var savedC = JSON.parse(readRaw(UI_KEYS.catches) || '{}');
        if (savedC && typeof savedC === 'object' && !Array.isArray(savedC)) catches = savedC;
      } catch (error) { catches = {}; }
      try { pinnedQuick = cleanRef(JSON.parse(readRaw(UI_KEYS.pin) || 'null')); } catch (error) { pinnedQuick = null; }
      try { reserve = cleanRef(JSON.parse(readRaw(UI_KEYS.reserve) || 'null')); } catch (error) { reserve = null; }
      try {
        var rawE = JSON.parse(readRaw(UI_KEYS.expedition) || 'null');
        if (rawE && typeof rawE === 'object' && typeof rawE.id === 'string' && rawE.remainingMs > 0) {
          expedition = {id: rawE.id, label: String(rawE.label || ''), remainingMs: Math.floor(rawE.remainingMs), totalMs: Math.floor(rawE.totalMs || rawE.remainingMs)};
        }
      } catch (error) { expedition = null; }
      try {
        var rawR = JSON.parse(readRaw(UI_KEYS.records) || 'null');
        if (rawR && typeof rawR === 'object' && !Array.isArray(rawR)) {
          records = {
            runs: Array.isArray(rawR.runs) ? rawR.runs.slice(0, RUNS_MAX) : [],
            bestMutagen: typeof rawR.bestMutagen === 'string' ? rawR.bestMutagen : '0',
            fastestMs: typeof rawR.fastestMs === 'number' && rawR.fastestMs >= 0 ? Math.floor(rawR.fastestMs) : 0,
            highestCaste: typeof rawR.highestCaste === 'string' ? rawR.highestCaste : ''
          };
        }
      } catch (error) { records = {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''}; }
      try {
        var rawA = JSON.parse(readRaw(UI_KEYS.activity) || '[]');
        if (Array.isArray(rawA)) activity = rawA.slice(0, ACTIVITY_MAX);
      } catch (error) { activity = []; }
      try {
        var rawF = JSON.parse(readRaw(UI_KEYS.firstSeen) || '{}');
        if (rawF && typeof rawF === 'object' && !Array.isArray(rawF)) firstSeen = rawF;
      } catch (error) { firstSeen = {}; }
      return {milestoneSeen: milestoneSeen, lastPurchase: lastPurchase, autoBindings: autoBindings, autoPaused: autoPaused, lastAscension: lastAscension, flavorIndex: flavorIndex, journal: journal, visitors: visitors, catches: catches, pinnedQuick: pinnedQuick, reserve: reserve, expedition: expedition, records: records, activity: activity, firstSeen: firstSeen};
    };
    target.saveMilestones = function (seen) { return writeRaw(UI_KEYS.milestones, JSON.stringify(seen || {})); };
    target.saveVisitors = function (log) { return writeRaw(UI_KEYS.visitors, JSON.stringify(log || {})); };
    target.saveCatches = function (tally) { return writeRaw(UI_KEYS.catches, JSON.stringify(tally || {golden: 0, intruders: 0})); };
    target.saveLastPurchase = function (p) { return p ? writeRaw(UI_KEYS.lastPurchase, JSON.stringify(p)) : removeRaw(UI_KEYS.lastPurchase); };
    target.saveAuto = function (b, paused) {
      if (b !== undefined) writeRaw(UI_KEYS.auto, JSON.stringify(b));
      if (paused !== undefined) writeRaw(UI_KEYS.autoPaused, String(!!paused));
      return true;
    };
    target.saveLastAscension = function (r) { return writeRaw(UI_KEYS.lastAscension, String(r || '')); };
    target.saveFlavorIndex = function (i) { return writeRaw(UI_KEYS.flavor, String(i || 0)); };
    target.savePin = function (p) { var c = cleanRef(p); return c ? writeRaw(UI_KEYS.pin, JSON.stringify(c)) : removeRaw(UI_KEYS.pin); };
    target.saveReserve = function (r) { var c = cleanRef(r); return c ? writeRaw(UI_KEYS.reserve, JSON.stringify(c)) : removeRaw(UI_KEYS.reserve); };
    target.saveExpedition = function (e) { return e && e.id && e.remainingMs > 0 ? writeRaw(UI_KEYS.expedition, JSON.stringify(e)) : removeRaw(UI_KEYS.expedition); };
    target.saveRecords = function (r) { return writeRaw(UI_KEYS.records, JSON.stringify(r || {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''})); };
    target.saveActivity = function (a) { return writeRaw(UI_KEYS.activity, JSON.stringify(Array.isArray(a) ? a.slice(0, ACTIVITY_MAX) : [])); };
    target.saveFirstSeen = function (f) { return writeRaw(UI_KEYS.firstSeen, JSON.stringify(f || {})); };
    target.flushJournal = function (entries) {
      if (!Array.isArray(entries)) return false;
      try {
        var raw = JSON.stringify(entries);
        while (raw.length > JOURNAL_BYTES && entries.length > 10) {
          entries.splice(0, Math.max(1, Math.floor(entries.length / 4)));
          raw = JSON.stringify(entries);
        }
        return writeRaw(UI_KEYS.journal, raw);
      } catch (error) { return false; }
    };
    target.clearMeta = function () {
      [UI_KEYS.lastPurchase, UI_KEYS.auto, UI_KEYS.autoPaused, UI_KEYS.lastAscension, UI_KEYS.flavor, UI_KEYS.milestones, UI_KEYS.visitors, UI_KEYS.catches, UI_KEYS.pin, UI_KEYS.reserve, UI_KEYS.expedition, UI_KEYS.records, UI_KEYS.activity, UI_KEYS.firstSeen].forEach(removeRaw);
    };
    target.refundMatriarchOnce = function () { return false; };
    return target;
  }

  return {
    QUICK_SETTLE: QUICK_SETTLE,
    AUTO_MAX: AUTO_MAX,
    JOURNAL_MAX: JOURNAL_MAX,
    ACTIVITY_MAX: ACTIVITY_MAX,
    RUNS_MAX: RUNS_MAX,
    quickKey: quickKey,
    createQuickState: createQuickState,
    chooseQuick: chooseQuick,
    orderAutoBindings: orderAutoBindings,
    inspectAuto: inspectAuto,
    reserveProgress: reserveProgress,
    validateControls: validateControls,
    orderAchievements: orderAchievements,
    pageIds: pageIds,
    appendJournal: appendJournal,
    recordActivity: recordActivity,
    recordAscensionRun: recordAscensionRun,
    ensureMetaStore: ensureMetaStore
  };
}));
