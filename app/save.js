(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachSave = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRIMARY = 'phil_roach_colony_v2';
  var BACKUP = PRIMARY + '_backup';
  // Routine saves rotate the backup slot, so a reset also keeps its colony here, where only the next reset writes.
  var BEFORE_RESET = PRIMARY + '_before_reset';
  var LEGACY = 'phil_roach_colony_v1';
  var MAX_LENGTH = 2 * 1024 * 1024;
  var JOURNAL_MAX = 100;
  var JOURNAL_BYTES = 20480;

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
    firstSeen: 'phil_roach_colony_ui_first_seen_v1',
    matriarchRefundReceipt: 'phil_roach_colony_refund_greaterqueen_v1',
    beforeMatriarchRefund: 'phil_roach_colony_v2_before_matriarch_refund'
  };

  function failure(message, cause) {
    var error = new Error('[ROACH] persistence: ' + message);
    if (cause) error.cause = cause;
    return error;
  }

  function timestamp(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value &&
      value >= 0 && value <= 8640000000000000;
  }

  function checkTree(value, depth, budget) {
    budget.count += 1;
    if (depth > 32 || budget.count > 20000) throw failure('Save data is too complex.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!isFinite(value)) throw failure('Save contains a nonfinite number.');
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 65536) throw failure('Save contains an oversized value.');
      return;
    }
    if (typeof value !== 'object') throw failure('Save contains an unsupported value.');
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw failure('Save contains an unsafe field.');
      }
      checkTree(value[key], depth + 1, budget);
    });
  }

  function parse(text) {
    if (typeof text !== 'string' || !text.length || text.length > MAX_LENGTH) {
      throw failure('Save must be JSON text no larger than 2 MiB.');
    }
    var envelope;
    try { envelope = JSON.parse(text); }
    catch (error) { throw failure('Save is not valid JSON.', error); }
    checkTree(envelope, 0, {count: 0});
    if (!envelope || envelope.format !== 'roach-colony' || envelope.version !== 2 ||
        !envelope.state || !timestamp(envelope.savedAt) ||
        envelope.savedAt !== envelope.state.clock) {
      throw failure('Save format, version or time anchor is invalid. Prototype saves are not converted.');
    }
    return envelope;
  }

  // The visitor collection rides along in exports as an optional field; older readers ignore it.
  function visitorLog(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var log = {};
    Object.keys(value).slice(0, 200).forEach(function (slug) {
      var count = value[slug];
      if (/^[a-z0-9][a-z0-9_-]{0,47}$/.test(slug) && typeof count === 'number' && Math.floor(count) === count && count > 0) log[slug] = Math.min(9999, count);
    });
    return log;
  }

  // Catch tallies (golden roaches and intruders) ride along in exports as an optional field.
  function catchTally(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var out = {};
    var any = false;
    ['golden', 'intruders'].forEach(function (key) {
      var count = value[key];
      if (typeof count === 'number' && isFinite(count) && Math.floor(count) === count && count >= 0) {
        out[key] = Math.min(9999, count);
        any = true;
      }
    });
    return any ? out : null;
  }

  function itemRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var kind = value.kind || value.type;
    if (['unit', 'upgrade'].indexOf(kind) === -1 || typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(value.id)) return null;
    return {kind: kind, id: value.id};
  }

  function expeditionState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var rem = Math.floor(Number(value.remainingMs));
    var tot = Math.floor(Number(value.totalMs));
    if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(value.id) || !(rem > 0) || !isFinite(rem)) return null;
    return {id: value.id, label: String(value.label || '').slice(0, 64), remainingMs: rem, totalMs: tot > 0 && isFinite(tot) ? tot : rem};
  }

  function defaultRecords() {
    return {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''};
  }

  function cleanRecords(value, allowEmpty) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return allowEmpty ? defaultRecords() : null;
    var runs = [];
    if (Array.isArray(value.runs)) {
      value.runs.slice(0, 12).forEach(function (r) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) return;
        var entry = {
          at: typeof r.at === 'number' && isFinite(r.at) ? Math.floor(r.at) : 0,
          mutagen: typeof r.mutagen === 'string' ? r.mutagen.slice(0, 64) : String(r.mutagen || '0').slice(0, 64),
          durationMs: typeof r.durationMs === 'number' && isFinite(r.durationMs) && r.durationMs >= 0 ? Math.floor(r.durationMs) : 0,
          highestCaste: typeof r.highestCaste === 'string' ? r.highestCaste.slice(0, 48) : ''
        };
        if (r.ascension !== undefined) entry.ascension = String(r.ascension).slice(0, 24);
        runs.push(entry);
      });
    }
    var bestMutagen = typeof value.bestMutagen === 'string' && value.bestMutagen.length <= 200 ? value.bestMutagen : '0';
    var fastestMs = typeof value.fastestMs === 'number' && isFinite(value.fastestMs) && value.fastestMs >= 0 ? Math.floor(value.fastestMs) : 0;
    var highestCaste = typeof value.highestCaste === 'string' ? value.highestCaste.slice(0, 48) : '';
    if (!allowEmpty && !runs.length && bestMutagen === '0' && fastestMs === 0 && !highestCaste) return null;
    return {runs: runs, bestMutagen: bestMutagen, fastestMs: fastestMs, highestCaste: highestCaste};
  }

  function cleanActivity(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    value.slice(0, 24).forEach(function (item) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      out.push({
        t: typeof item.t === 'number' && isFinite(item.t) ? Math.floor(item.t) : 0,
        kind: String(item.kind || 'event').slice(0, 32),
        title: String(item.title || '').slice(0, 80),
        text: String(item.text || '').slice(0, 160)
      });
    });
    return out;
  }

  function firstSeenLog(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var out = {};
    Object.keys(value).slice(0, 200).forEach(function (slug) {
      var ts = value[slug];
      if (/^[a-z0-9][a-z0-9_-]{0,47}$/.test(slug) && typeof ts === 'number' && isFinite(ts) && Math.floor(ts) === ts && ts > 0) {
        out[slug] = ts;
      }
    });
    return out;
  }

  function encode(state, extras) {
    if (!state || !timestamp(state.clock)) throw failure('Engine returned an invalid time anchor.');
    var envelope = {format: 'roach-colony', version: 2, savedAt: state.clock, state: state};
    var visitors = extras && visitorLog(extras.visitors);
    if (visitors) envelope.visitors = visitors;
    var catches = extras && catchTally(extras.catches);
    if (catches) envelope.catches = catches;
    var pin = extras && itemRef(extras.pin || extras.pinnedQuick);
    if (pin) envelope.pin = pin;
    var reserve = extras && itemRef(extras.reserve);
    if (reserve) envelope.reserve = reserve;
    var records = extras && cleanRecords(extras.records, false);
    if (records) envelope.records = records;
    var firstSeen = extras && firstSeenLog(extras.firstSeen);
    if (firstSeen) envelope.firstSeen = firstSeen;
    return JSON.stringify(envelope);
  }

  function validate(text, game, now) {
    if (!timestamp(now)) throw failure('Current time is invalid.');
    var envelope = parse(text);
    var candidate = new game.constructor({now: now, activeTimeOnly: game.activeTimeOnly});
    if (candidate === game || typeof candidate.importState !== 'function') {
      throw failure('Engine does not support independent save validation.');
    }
    candidate.importState(envelope.state, now);
    return candidate;
  }

  function Store(storage) {
    this.storage = storage;
    this.error = '';
    this._archiveSerial = 0;
    this._trusted = {};
  }

  // Each slot remembers the text this store last loaded, validated or wrote there.
  // A shared recent-text cache let the backup check evict the previous save, so
  // every routine save rebuilt a validation engine.
  Store.prototype._trust = function (key, text, game) {
    this._trusted[key] = {text: text, type: game.constructor};
  };

  Store.prototype._checkStored = function (key, text, game, now) {
    var known = this._trusted[key];
    if (known && known.text === text && known.type === game.constructor) return;
    validate(text, game, now);
    this._trust(key, text, game);
  };

  Store.prototype._read = function (key) {
    if (!this.storage || typeof this.storage.getItem !== 'function') {
      throw failure('Local storage is unavailable. Export your colony to keep it.');
    }
    return this.storage.getItem(key);
  };

  Store.prototype._write = function (key, text) {
    this.storage.setItem(key, text);
    if (this._read(key) !== text) throw failure('Local storage did not retain the save.');
  };

  // Overlay metadata writes are best-effort so a full or absent storage never crashes the UI.
  Store.prototype._readMetaRaw = function (key) {
    try { return this.storage && typeof this.storage.getItem === 'function' ? this.storage.getItem(key) : null; }
    catch (error) { return null; }
  };

  Store.prototype._writeMetaRaw = function (key, value) {
    try {
      if (this.storage && typeof this.storage.setItem === 'function') this.storage.setItem(key, String(value));
      return true;
    } catch (error) { return false; }
  };

  Store.prototype._removeMetaRaw = function (key) {
    try {
      if (this.storage && typeof this.storage.removeItem === 'function') this.storage.removeItem(key);
      return true;
    } catch (error) { return false; }
  };

  Store.prototype._preserveInvalid = function (key, text, game, now) {
    if (text === null || typeof text === 'undefined') return;
    try { this._checkStored(key, text, game, now); return; }
    catch (error) {
      // Never replace damaged data until a separate, verified copy exists.
      var archive;
      var existing;
      do {
        this._archiveSerial += 1;
        archive = key + '_corrupt_' + now + '_' + this._archiveSerial;
        existing = this._read(archive);
      } while (existing !== null && typeof existing !== 'undefined');
      this._write(archive, text);
    }
  };

  Store.prototype.load = function (game, now) {
    this.error = '';
    var legacyAvailable = false;
    var errors = [];
    try {
      if (!timestamp(now)) throw failure('Current time is invalid.');
      var legacy = this._read(LEGACY);
      legacyAvailable = legacy !== null && typeof legacy !== 'undefined';
      var keys = [PRIMARY, BACKUP];
      for (var index = 0; index < keys.length; index += 1) {
        var raw = this._read(keys[index]);
        if (raw === null || typeof raw === 'undefined') continue;
        try {
          game.importState(parse(raw).state, now);
          this._trust(keys[index], raw, game);
          return {loaded: true, recovered: index === 1, legacyAvailable: legacyAvailable,
            message: index === 1 ? 'Recovered the validated backup. Damaged saves are preserved.' : 'Colony loaded.'};
        } catch (error) { errors.push(error.message); }
      }
      if (errors.length) this.error = 'Saved colony could not be loaded. Original data is preserved. ' + errors.join(' ');
      return {loaded: false, recovered: false, legacyAvailable: legacyAvailable,
        message: this.error || (legacyAvailable ? 'Prototype save found and preserved. It is not automatically converted.' : 'New colony.')};
    } catch (error) {
      this.error = 'Unable to read local saves. ' + error.message;
      return {loaded: false, recovered: false, legacyAvailable: legacyAvailable, message: this.error};
    }
  };

  Store.prototype.export = function (game, now, extras) {
    if (!timestamp(now)) throw failure('Current time is invalid.');
    // Live exports already satisfy engine invariants. Re-importing each one
    // rebuilt the complete economy on every purchase and save.
    return encode(game.exportState(now), extras);
  };

  Store.prototype.save = function (game, now) {
    this.error = '';
    try {
      var text = this.export(game, now);
      var primary = this._read(PRIMARY);
      var backup = this._read(BACKUP);
      var prior = null;
      if (primary !== null && typeof primary !== 'undefined') {
        try { this._checkStored(PRIMARY, primary, game, now); prior = primary; }
        catch (error) { this._preserveInvalid(PRIMARY, primary, game, now); }
      }
      if (prior !== null) {
        this._preserveInvalid(BACKUP, backup, game, now);
        this._write(BACKUP, prior);
        this._trust(BACKUP, prior, game);
      }
      this._write(PRIMARY, text);
      this._trust(PRIMARY, text, game);
      return true;
    } catch (error) {
      this.error = 'Colony could not be saved. ' + error.message;
      return false;
    }
  };

  Store.prototype.import = function (text, game, now) {
    this.error = '';
    try {
      var candidate = validate(text, game, now);
      var parsed = parse(text);
      var visitors = visitorLog(parsed.visitors);
      var catches = catchTally(parsed.catches);
      var pin = itemRef(parsed.pin);
      var reserve = itemRef(parsed.reserve);
      var records = cleanRecords(parsed.records, false);
      var firstSeen = firstSeenLog(parsed.firstSeen);
      var normalized = encode(candidate.exportState(now));
      var previous = this.export(game, now);
      this._preserveInvalid(PRIMARY, this._read(PRIMARY), game, now);
      this._preserveInvalid(BACKUP, this._read(BACKUP), game, now);
      this._write(BACKUP, previous);
      this._trust(BACKUP, previous, game);
      this._write(PRIMARY, normalized);
      game.importState(parse(normalized).state, now);
      this._trust(PRIMARY, normalized, game);
      return {
        ok: true,
        message: 'Colony imported. The previous colony is retained as the backup.',
        visitors: visitors,
        catches: catches,
        pin: pin,
        reserve: reserve,
        records: records,
        firstSeen: firstSeen
      };
    } catch (error) {
      this.error = 'Colony could not be imported. ' + error.message;
      return {ok: false, message: this.error};
    }
  };

  // Starts a brand-new colony at the player's request. The colony being replaced is written in full, with
  // its visitor log and catch tally, to the backup and before-reset slots first, so Import can bring it back.
  Store.prototype.reset = function (game, now, extras) {
    this.error = '';
    try {
      var previous = this.export(game, now, extras);
      var fresh = new game.constructor({now: now, activeTimeOnly: game.activeTimeOnly});
      var text = encode(fresh.exportState(now));
      this._preserveInvalid(PRIMARY, this._read(PRIMARY), game, now);
      this._preserveInvalid(BACKUP, this._read(BACKUP), game, now);
      this._write(BEFORE_RESET, previous);
      this._write(BACKUP, previous);
      this._trust(BACKUP, previous, game);
      this._write(PRIMARY, text);
      game.importState(parse(text).state, now);
      this._trust(PRIMARY, text, game);
      return {ok: true, message: 'A new colony begins. The previous colony is kept as a backup.'};
    } catch (error) {
      this.error = 'Colony could not be reset. ' + error.message;
      return {ok: false, message: this.error};
    }
  };

  // ---- Overlay Meta (O(1) UI and guest persistence) ----
  Store.prototype.loadMeta = function () {
    var milestoneSeen = {};
    var lastPurchase = null;
    var autoBindings = [];
    var autoPaused = false;
    var lastAscension = '';
    var flavorIndex = 0;
    var journal = [];
    var visitors = {};
    var catches = {};
    var pinnedQuick = null;
    var reserve = null;
    var expedition = null;
    var records = defaultRecords();
    var activity = [];
    var firstSeen = {};

    this._removeMetaRaw(UI_KEYS.standalone);

    try {
      var rawMilestones = JSON.parse(this._readMetaRaw(UI_KEYS.milestones) || '{}');
      if (rawMilestones && typeof rawMilestones === 'object' && !Array.isArray(rawMilestones)) milestoneSeen = rawMilestones;
    } catch (error) { milestoneSeen = {}; }

    try {
      lastPurchase = JSON.parse(this._readMetaRaw(UI_KEYS.lastPurchase) || 'null');
      if (lastPurchase && (['unit', 'upgrade'].indexOf(lastPurchase.type) === -1 || typeof lastPurchase.id !== 'string')) lastPurchase = null;
      if (lastPurchase && [1, 10, 'max'].indexOf(lastPurchase.quantity) === -1) delete lastPurchase.quantity;
      var savedAuto = JSON.parse(this._readMetaRaw(UI_KEYS.auto) || '[]');
      autoPaused = this._readMetaRaw(UI_KEYS.autoPaused) === 'true';
      lastAscension = this._readMetaRaw(UI_KEYS.lastAscension) || '';
      flavorIndex = Math.max(0, parseInt(this._readMetaRaw(UI_KEYS.flavor), 10) || 0);
      if (Array.isArray(savedAuto)) {
        autoBindings = savedAuto.filter(function (entry) {
          return entry && ['unit', 'upgrade'].indexOf(entry.type) !== -1 && typeof entry.id === 'string';
        }).slice(0, 16);
      }
    } catch (error) { lastPurchase = null; autoBindings = []; }

    try {
      var savedJournal = JSON.parse(this._readMetaRaw(UI_KEYS.journal) || '[]');
      if (Array.isArray(savedJournal)) journal = savedJournal.slice(-JOURNAL_MAX);
    } catch (error) { journal = []; }

    try {
      var savedVisitors = JSON.parse(this._readMetaRaw(UI_KEYS.visitors) || '{}');
      if (savedVisitors && typeof savedVisitors === 'object' && !Array.isArray(savedVisitors)) visitors = savedVisitors;
    } catch (error) { visitors = {}; }

    try {
      var savedCatches = JSON.parse(this._readMetaRaw(UI_KEYS.catches) || '{}');
      if (savedCatches && typeof savedCatches === 'object' && !Array.isArray(savedCatches)) catches = savedCatches;
    } catch (error) { catches = {}; }

    try { pinnedQuick = itemRef(JSON.parse(this._readMetaRaw(UI_KEYS.pin) || 'null')); }
    catch (error) { pinnedQuick = null; }

    try { reserve = itemRef(JSON.parse(this._readMetaRaw(UI_KEYS.reserve) || 'null')); }
    catch (error) { reserve = null; }

    try { expedition = expeditionState(JSON.parse(this._readMetaRaw(UI_KEYS.expedition) || 'null')); }
    catch (error) { expedition = null; }

    try { records = cleanRecords(JSON.parse(this._readMetaRaw(UI_KEYS.records) || 'null'), true); }
    catch (error) { records = defaultRecords(); }

    try { activity = cleanActivity(JSON.parse(this._readMetaRaw(UI_KEYS.activity) || '[]')); }
    catch (error) { activity = []; }

    try { firstSeen = firstSeenLog(JSON.parse(this._readMetaRaw(UI_KEYS.firstSeen) || '{}')) || {}; }
    catch (error) { firstSeen = {}; }

    return {
      milestoneSeen: milestoneSeen,
      lastPurchase: lastPurchase,
      autoBindings: autoBindings,
      autoPaused: autoPaused,
      lastAscension: lastAscension,
      flavorIndex: flavorIndex,
      journal: journal,
      visitors: visitors,
      catches: catches,
      pinnedQuick: pinnedQuick,
      reserve: reserve,
      expedition: expedition,
      records: records,
      activity: activity,
      firstSeen: firstSeen
    };
  };

  Store.prototype.saveMilestones = function (seen) {
    return this._writeMetaRaw(UI_KEYS.milestones, JSON.stringify(seen || {}));
  };

  Store.prototype.saveVisitors = function (log) {
    return this._writeMetaRaw(UI_KEYS.visitors, JSON.stringify(log || {}));
  };

  Store.prototype.saveCatches = function (tally) {
    return this._writeMetaRaw(UI_KEYS.catches, JSON.stringify(tally || {golden: 0, intruders: 0}));
  };

  Store.prototype.saveLastPurchase = function (purchase) {
    if (!purchase) return this._removeMetaRaw(UI_KEYS.lastPurchase);
    return this._writeMetaRaw(UI_KEYS.lastPurchase, JSON.stringify(purchase));
  };

  Store.prototype.saveAuto = function (bindings, paused) {
    if (bindings !== undefined) this._writeMetaRaw(UI_KEYS.auto, JSON.stringify(bindings));
    if (paused !== undefined) this._writeMetaRaw(UI_KEYS.autoPaused, String(!!paused));
    return true;
  };

  Store.prototype.saveLastAscension = function (reward) {
    return this._writeMetaRaw(UI_KEYS.lastAscension, String(reward || ''));
  };

  Store.prototype.saveFlavorIndex = function (index) {
    return this._writeMetaRaw(UI_KEYS.flavor, String(index || 0));
  };

  Store.prototype.savePin = function (pin) {
    var clean = itemRef(pin);
    if (!clean) return this._removeMetaRaw(UI_KEYS.pin);
    return this._writeMetaRaw(UI_KEYS.pin, JSON.stringify(clean));
  };

  Store.prototype.saveReserve = function (reserve) {
    var clean = itemRef(reserve);
    if (!clean) return this._removeMetaRaw(UI_KEYS.reserve);
    return this._writeMetaRaw(UI_KEYS.reserve, JSON.stringify(clean));
  };

  Store.prototype.saveExpedition = function (exp) {
    var clean = expeditionState(exp);
    if (!clean) return this._removeMetaRaw(UI_KEYS.expedition);
    return this._writeMetaRaw(UI_KEYS.expedition, JSON.stringify(clean));
  };

  Store.prototype.saveRecords = function (records) {
    return this._writeMetaRaw(UI_KEYS.records, JSON.stringify(cleanRecords(records, true)));
  };

  Store.prototype.saveActivity = function (activity) {
    return this._writeMetaRaw(UI_KEYS.activity, JSON.stringify(cleanActivity(activity)));
  };

  Store.prototype.saveFirstSeen = function (firstSeen) {
    return this._writeMetaRaw(UI_KEYS.firstSeen, JSON.stringify(firstSeenLog(firstSeen) || {}));
  };

  Store.prototype.flushJournal = function (entries) {
    if (!Array.isArray(entries)) return false;
    try {
      var raw = JSON.stringify(entries);
      while (raw.length > JOURNAL_BYTES && entries.length > 10) {
        entries.splice(0, Math.max(1, Math.floor(entries.length / 4)));
        raw = JSON.stringify(entries);
      }
      return this._writeMetaRaw(UI_KEYS.journal, raw);
    } catch (error) { return false; }
  };

  Store.prototype.clearMeta = function () {
    var self = this;
    [
      UI_KEYS.lastPurchase,
      UI_KEYS.auto,
      UI_KEYS.autoPaused,
      UI_KEYS.lastAscension,
      UI_KEYS.flavor,
      UI_KEYS.milestones,
      UI_KEYS.visitors,
      UI_KEYS.catches,
      UI_KEYS.pin,
      UI_KEYS.reserve,
      UI_KEYS.expedition,
      UI_KEYS.records,
      UI_KEYS.activity,
      UI_KEYS.firstSeen
    ].forEach(function (key) { self._removeMetaRaw(key); });
  };

  // One-time refund of the accidentally bought Colony matriarch (greaterqueen) on the TV save:
  // keeps the pre-refund colony in phil_roach_colony_v2_before_matriarch_refund and restores the
  // 10,000 Brood mothers (nest), 6,561,000 crumbs (meat), and 1 hatchling (larva) spent on it.
  Store.prototype.refundMatriarchOnce = function (game, meta, hasPalmSystem) {
    try {
      if (!hasPalmSystem || this._readMetaRaw(UI_KEYS.matriarchRefundReceipt)) return false;
      var refunded = game && typeof game.refundGreaterQueenOnce === 'function' ? game.refundGreaterQueenOnce() : false;
      if (!refunded && game && game._runtime && game._runtime.game && game._runtime.game.unit) {
        var inner = game._runtime.game;
        var gq = inner.unit('greaterqueen');
        if (gq && gq.count().equals(1)) {
          var priorRaw = this._readMetaRaw(PRIMARY);
          if (priorRaw) this._writeMetaRaw(UI_KEYS.beforeMatriarchRefund, priorRaw);
          gq._setCount(0);
          inner.unit('nest')._addCount(10000);
          inner.unit('meat')._addCount(6561000);
          inner.unit('larva')._addCount(1);
          if (inner.session && inner.session.state) {
            if (inner.session.state.statistics && inner.session.state.statistics.byUnit) delete inner.session.state.statistics.byUnit.greaterqueen;
            if (inner.session.state.achievements) delete inner.session.state.achievements.greaterqueen1;
          }
          refunded = true;
        }
      }
      if (!refunded) return false;
      var prior = this._readMetaRaw(PRIMARY);
      if (prior && !this._readMetaRaw(UI_KEYS.beforeMatriarchRefund)) this._writeMetaRaw(UI_KEYS.beforeMatriarchRefund, prior);
      if (meta && meta.milestoneSeen) {
        delete meta.milestoneSeen['owned:greaterqueen'];
        delete meta.milestoneSeen['achievement:greaterqueen1'];
        this.saveMilestones(meta.milestoneSeen);
      }
      if (meta && meta.lastPurchase && meta.lastPurchase.id === 'greaterqueen') {
        meta.lastPurchase = null;
        this.saveLastPurchase(null);
      }
      this._writeMetaRaw(UI_KEYS.matriarchRefundReceipt, String(Date.now()));
      return true;
    } catch (error) { return false; }
  };

  return {
    Store: Store,
    keys: {primary: PRIMARY, backup: BACKUP, beforeReset: BEFORE_RESET, legacy: LEGACY, ui: UI_KEYS},
    maxLength: MAX_LENGTH
  };
}));
