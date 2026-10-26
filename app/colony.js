(function () {
  'use strict';
  var panel = document.getElementById('colony');
  var canvas = document.getElementById('world');
  var theme = window.RoachTheme;
  var session = window.RoachSession;
  var tvShell = window.RoachTvShell;
  var overlayView = window.RoachOverlayView;
  var compact = true;
  var closed = false;
  var snapshot = null;
  var game;
  var store;
  var tab = '';
  var view = 'units';
  var details = {};
  var page = 0;
  var quantity = 1;
  var corner = 3;
  var corners = tvShell.CORNERS;
  var deadline = 0;
  var closeTimer = null;
  var wakeTimer = null;
  var simulationTimer = null;
  var lastSave = 0;
  var pendingSave = null;
  var dirtySince = 0;
  var lastSnapshotAt = 0;
  var milestoneSeen = {};
  var milestoneReady = false;
  var milestoneQueue = [];
  var milestoneUntil = 0;
  var milestoneNext = 0;
  var roleIds = [];
  var listBuilds = 0;
  var habitat = null;
  var autoBindings = [];
  var autoCursor = 0;
  var lastAutoAt = 0;
  var lastPurchase = null;
  var introUntil = 0;
  var hintUntil = 0;
  var hintCardUntil = 0;
  var autoPaused = false;
  var started = Date.now();
  var spriteCount = 1;
  var lastListSignature = '';
  var lastTabSignature = '';
  var censusSignature = '';
  var censusIds = null;
  var censusFit = '';
  var magnitudes = {};
  var swept = {};
  var resourceIcons = false;
  var milestoneSignature = '';
  var exclusionSignature = '';
  var quotedIds = [];
  var memory = {};
  var dialogAction = null;
  var dialogReturn = '';
  var saveMessage = 'Progress saves on this device.';
  var critters = false;
  var watchMode = false;
  var standalone = false;
  var dimmed = false;
  var flashTracker = overlayView.createFlashTracker(document);
  var lastInputAt = Date.now();
  var lastShiftAt = Date.now();
  var shiftIndex = 0;
  var shifts = tvShell.SHIFTS;
  var lastAscension = '';
  var achievementOrder = {signature: '', rows: []};
  var flavorIndex = 0;
  var stockIds = ['meat', 'larva', 'territory', 'energy', 'mutagen', 'premutagen', 'cocoon'];
  var flavors = ['The walls hum a little louder tonight.', 'Somewhere behind the fridge, a cheer.', 'Antennae twitch in approval.', 'The crumbs never stood a chance.', 'Six legs, one purpose.', 'Lights off. Colony on.', 'They will outlast us all.', 'A faint skittering of applause.', 'The baseboards are getting crowded.', 'Nobody tell the landlord.', 'Every crack is a doorway now.', 'The colony smells faintly of victory.', 'Survivors since the dinosaurs.', 'More legs than the rug can count.', 'The sink pipes carry the news.', 'A shell polished just for today.', 'The pantry trembles.', 'Small bodies, big ambitions.', 'Under the stove, a new legend.', 'Night shift: fully staffed.'];
  var controllerLink = null;
  var mechanics = null;
  var lastMechanicsAt = 0;
  var pendingRewards = [];
  var nightShift = false;
  var journal = [];
  var journalTimer = null;
  var visitorSignature = '';
  var REWARD_NOUNS = {meat: 'crumbs', larva: 'hatchlings', territory: 'territory', energy: 'energy'};
  var featPoints = -1;
  var cachedFeats = null;
  var cachedFeatSlugsLen = -1;
  var quickButtons = [];
  var quickState = session.createQuickState();
  var quickPicks = quickState.picks;
  var quickIcons = false;
  // Each slot's pick and affordability at the last render, so the strip notices a new pick or one that
  // just became affordable; null after the strip was away, so a return is quiet.
  var quickSeen = null;
  var quickNoteUntil = 0;
  var redCueText = '';
  var stirring = false;
  var closingTimer = null;
  var pinnedQuick = null;
  var reserveTarget = null;
  var lastHoldReason = '';
  var expedition = null;
  var records = {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''};
  var activity = [];
  var firstSeen = {};
  var runStartedAt = Date.now();
  var chronicleSignature = '';
  var inspectorEnabled = false;
  var preview = /(?:\?|&)preview=1(?:&|$)/.test(location.search);
  var standaloneQuery = /(?:\?|&)(?:standalone=1|mode=standalone)(?:&|$)/.test(location.search);
  if (preview) document.body.className = 'preview';

  function el(id) { return document.getElementById(id); }
  function flushJournal() {
    if (journalTimer) { clearTimeout(journalTimer); journalTimer = null; }
    if (store) store.flushJournal(journal);
  }
  function logEvent(lvl, cat, msg, detail) {
    session.appendJournal(journal, lvl, cat, msg, detail);
    if (lvl === 'error') flushJournal();
    else if (!journalTimer) journalTimer = setTimeout(flushJournal, 3000);
  }
  window.addEventListener('error', function (event) {
    var err = event && event.error;
    logEvent('error', 'crash', (event && event.message) || 'Uncaught error', err && err.stack ? String(err.stack).slice(0, 320) : (event && event.filename ? event.filename + ':' + event.lineno : undefined));
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    logEvent('error', 'crash', 'Unhandled rejection: ' + (reason && reason.message ? reason.message : String(reason)), reason && reason.stack ? String(reason.stack).slice(0, 320) : undefined);
  });
  var node = overlayView.node;
  var text = overlayView.text;
  var childWith = overlayView.childWith;
  var segmentBar = overlayView.segmentBar;
  var setSegments = overlayView.setSegments;
  var pixelText = overlayView.pixelText;
  var magnitudeRank = overlayView.magnitudeRank;
  var pixelIcon = overlayView.pixelIcon;
  var unitIcon = overlayView.unitIcon;
  var short = theme.short;
  var whole = theme.whole;
  var shortNumbers = theme.shortNumbers;
  var magnitude = theme.magnitude;
  var effectText = theme.effectText;
  function message(value) {
    el('message').textContent = theme.text(value);
    // The hint floats above the panel so feedback never pushes menu rows out of view. A showing
    // toast holds that spot, so the hint is skipped rather than drawn over it.
    if (el('unit-intro').hidden && el('dialog').hidden && el('milestone').hidden && el('hint-card').hidden) { text(el('local-hint'), theme.text(value)); el('local-hint').hidden = false; hintUntil = Date.now() + 2400; }
  }
  function territorial(entry) {
    return (entry.productionTargets || []).some(function (target) { return target.id === 'territory'; });
  }
  function phrase(list) {
    return theme.costText(list);
  }
  function upgradeName(id, name) { return theme.upgradeLabel ? theme.upgradeLabel(id, name) : theme.text(name); }
  function rowName(entry) { return entry.kind === 'upgrade' ? upgradeName(entry.id, entry.name) : theme.text(theme.label(entry.id, entry.name)); }
  function achievementName(id, name) { return theme.achievementLabel ? theme.achievementLabel(id, name) : theme.text(name); }
  function costLine(entry) {
    if (!entry.costs) return shortNumbers(theme.text(entry.batchCost === undefined ? entry.cost : entry.batchQuantity === '0' ? 'Next: ' + entry.cost : entry.batchCost));
    var next = entry.batchQuantity === '0' || !entry.batchCosts;
    return shortNumbers((entry.batchQuantity === '0' ? 'Next: ' : '') + phrase(next ? entry.costs : entry.batchCosts));
  }
  // When an item has 2+ requirements, the one with the smallest stock-to-cost ratio (in log10 space)
  // is the limiting bottleneck — either what is missing to afford 1, or what caps the current Max batch.
  function limitingCostId(entry) {
    if (!entry || !entry.costs || entry.costs.length <= 1 || !snapshot || !snapshot.resources) return '';
    if (entry.bottleneck && entry.bottleneck.id) return entry.bottleneck.id;
    var worstId = '';
    var worstGap = Infinity;
    for (var i = 0; i < entry.costs.length; i++) {
      var c = entry.costs[i];
      var have = magnitude(stockOf(c.id));
      var need = magnitude(c.amount);
      if (need === null) continue;
      var gap = (have === null ? -1e9 : have === -Infinity ? -1e6 : have) - need;
      if (gap < worstGap) {
        worstGap = gap;
        worstId = c.id;
      }
    }
    return worstId;
  }
  function producerLabel(prod) {
    if (!prod || !prod.id) return '';
    return prod.kind === 'upgrade' ? upgradeName(prod.id, prod.name) : theme.text(theme.label(prod.id, prod.name));
  }
  function renderCost(element, entry, costText) {
    var list = (entry.batchQuantity === '0' || !entry.batchCosts) ? entry.costs : entry.batchCosts;
    var limitId = limitingCostId(entry);
    var prodName = entry && entry.bottleneck && entry.bottleneck.producer ? producerLabel(entry.bottleneck.producer) : '';
    if (!limitId || !list || !list.length) {
      element.removeAttribute('data-cost-sig');
      text(element, costText);
      if (!entry.available && prodName) element.title = 'Missing cost · Produced by ' + prodName;
      else element.removeAttribute('title');
      return;
    }
    if (list.length <= 1) {
      element.removeAttribute('data-cost-sig');
      text(element, costText);
      if (!entry.available && prodName) element.title = 'Missing cost · Produced by ' + prodName;
      else element.removeAttribute('title');
      return;
    }
    element.removeAttribute('title');
    var prefix = entry.batchQuantity === '0' ? 'Next: ' : '';
    var parts = list.map(function (c) { return {id: c.id, text: shortNumbers(phrase([c]))}; });
    var expected = prefix + parts.map(function (p) { return p.text; }).join(' + ');
    if (costText.indexOf(expected) !== 0) {
      element.removeAttribute('data-cost-sig');
      text(element, costText);
      return;
    }
    var tail = costText.slice(expected.length);
    var isAvail = !!entry.available;
    var sig = limitId + '|' + (isAvail ? '1' : '0') + '|' + prodName + '|' + costText;
    if (element.getAttribute('data-cost-sig') === sig) return;
    element.setAttribute('data-cost-sig', sig);
    element.textContent = '';
    if (prefix) element.appendChild(document.createTextNode(prefix));
    parts.forEach(function (part, idx) {
      if (idx > 0) element.appendChild(document.createTextNode(' + '));
      if (part.id === limitId) {
        var span = node('span', 'cost-limiting ' + (isAvail ? 'cost-batch-cap' : 'cost-short'), part.text);
        span.title = (isAvail ? 'Caps Max batch' : 'Missing cost') + (prodName ? ' · Produced by ' + prodName : '');
        element.appendChild(span);
      } else {
        element.appendChild(document.createTextNode(part.text));
      }
    });
    if (tail) element.appendChild(document.createTextNode(tail));
  }
  // Upgrade rows lead with what one more level does; the source description follows.
  function briefText(entry) {
    var gain = (entry.effects || []).map(effectText).join(', ');
    return (gain ? gain + ' · ' : '') + theme.text(entry.description);
  }
  function purchaseText(bought) {
    var used = bought.spent.filter(function (cost) { return stockIds.indexOf(cost.id) === -1; });
    var head = bought.kind === 'upgrade' ? 'Upgraded ' + upgradeName(bought.id, bought.name) + (bought.quantity === '1' ? '' : ' by ' + bought.quantityLabel + ' levels') : 'Hatched ' + phrase([{id: bought.id, name: bought.name, amount: bought.quantityLabel}]);
    return shortNumbers(head + '.' + (used.length ? ' Used ' + phrase(used) + '.' : ''));
  }
  // Closest locked goals first, then the latest earned, then one row for all undiscovered ones.
  // The order is reused until an achievement's state or progress changes.
  function orderedAchievements(list) {
    achievementOrder = session.orderAchievements(list, achievementOrder);
    return achievementOrder.rows;
  }
  function achievementStatus(entry) {
    var progress = entry.progress;
    if (entry.summary) return '';
    if (entry.earned) return 'EARNED';
    if (!progress) return 'LOCKED';
    if (progress.kind === 'colony') return short(progress.value) + ' / ' + short(progress.max) + ' ' + progress.label;
    return short(progress.value) + ' / ' + (progress.kind === 'unit' ? shortNumbers(phrase([{id: progress.id, name: progress.name, amount: progress.max}])) : short(progress.max) + ' ' + upgradeName(progress.id, progress.name));
  }
  function flavorLine() {
    var lines = Array.isArray(theme.flavor) && theme.flavor.length ? theme.flavor : flavors;
    var line = lines[flavorIndex % lines.length];
    flavorIndex = (flavorIndex + 1) % lines.length;
    if (store) store.saveFlavorIndex(flavorIndex);
    return line;
  }
  var flash = flashTracker.flash;
  var stopFlash = flashTracker.stopFlash;
  function stopFlashes() {
    flashTracker.stopAll();
    quickSeen = null;
    quickNoteUntil = 0;
    el('quick-note').hidden = true;
  }
  function stockOf(id) {
    var resource = snapshot.resources.filter(function (entry) { return entry.id === id; })[0];
    if (resource) return resource.amount;
    var unit = (snapshot.visibleUnits || []).filter(function (entry) { return entry.id === id; })[0];
    return unit ? unit.count : undefined;
  }
  // The share of the single next price already in stock, or null when a part cannot be compared.
  function costProgress(costs) {
    if (!costs || !costs.length) return null;
    var fraction = 1;
    for (var i = 0; i < costs.length; i++) {
      var have = magnitude(stockOf(costs[i].id));
      var need = magnitude(costs[i].amount);
      if (have === null || need === null) return null;
      if (have < need) fraction = Math.min(fraction, Math.pow(10, have - need));
    }
    return fraction;
  }
  function achievementProgress(entry) {
    var progress = entry.progress;
    if (entry.earned || entry.summary || !progress) return null;
    if (typeof progress.percent === 'number') return progress.percent;
    var have = magnitude(progress.value);
    var need = magnitude(progress.max);
    return have === null || need === null ? null : have >= need ? 1 : Math.pow(10, have - need);
  }
  // Fixed controls carry a meta icon at their start; it is redrawn when the illustrated sheet arrives.
  function decorate() {
    [['show-achievements', 'achievement'], ['show-visitors', 'visitors'], ['ascend', 'ascension'], ['night-shift', 'nightShift']].forEach(function (pair) {
      var target = el(pair[0]);
      var old = target.querySelector('.sprite-icon');
      var icon = pixelIcon('meta', pair[1], 32);
      if (!icon) return;
      if (old) target.replaceChild(icon, old); else target.insertBefore(icon, target.firstChild);
      target.classList.add('with-icon');
    });
  }
  function pageSize() { return standalone ? 6 : 4; }
  function renderCensus() {
    var entries = (snapshot.visibleUnits || []).filter(function (entry) { return entry.owned && Number(entry.tier) > 0; });
    entries.sort(function (a, b) { return Number(territorial(a)) - Number(territorial(b)) || Number(b.tier) - Number(a.tier); });
    entries = entries.slice(0, standalone ? 6 : 3);
    var container = el('census');
    var signature = (standalone ? '6:' : '3:') + entries.map(function (entry) { return entry.id; }).join(',');
    if (signature !== censusSignature) {
      container.textContent = '';
      entries.forEach(function (entry) {
        var item = node('div', 'census-entry');
        item.setAttribute('data-unit', entry.id);
        // The pixel atlas cell is 64 px; drawing at its true size keeps the art crisp.
        item.appendChild(unitIcon(entry.id, 64));
        var label = node('span', 'census-text');
        var strong = node('strong');
        var rate = node('span', 'rate');
        rate.hidden = true;
        item._strong = strong;
        item._rate = rate;
        label.appendChild(strong);
        label.appendChild(node('span', 'label', theme.label(entry.id, entry.name)));
        label.appendChild(rate);
        item.appendChild(label);
        container.appendChild(item);
        // Only a unit that just joined the census slides in; first paint and icon reloads stay still.
        if (censusIds && censusIds.indexOf(entry.id) === -1) flash(item, 'arrive');
      });
      censusSignature = signature;
      censusIds = entries.map(function (entry) { return entry.id; });
      censusFit = '';
    }
    entries.forEach(function (entry, index) {
      var child = container.children[index];
      var count = child._strong || child.querySelector('strong');
      var rate = child._rate || child.querySelector('.rate');
      var hasVel = !!(entry.velocity && entry.velocity !== '0');
      text(count, whole(entry.count));
      stampMagnitude(count, 'census:' + entry.id);
      if (rate) {
        text(rate, hasVel ? '+' + short(entry.velocity) + '/s' : '');
        if (rate.hidden !== !hasVel) rate.hidden = !hasVel;
      }
    });
    // Three long entries can outgrow the footprint; the lowest-ranked one steps aside rather than clip a label.
    // Measured only when an entry or a count's length changes, and only while the census is laid out.
    var fit = signature + '|' + entries.map(function (entry) { return whole(entry.count).length + ':' + (entry.velocity && entry.velocity !== '0' ? short(entry.velocity).length : 0); }).join();
    var third = !standalone && container.children[2];
    if (third && fit !== censusFit && container.offsetWidth) {
      censusFit = fit;
      third.hidden = false;
      third.hidden = container.firstChild.getBoundingClientRect().left < container.getBoundingClientRect().left - 0.5;
    }
  }
  // UI moments. Each is a one-shot class from flash(): transform and opacity only, stepped where
  // pixel art is involved, and never started while the colony is hidden or showing critters only.
  //
  // The highest rank seen this showing is kept, so spending back under a suffix and earning it
  // again stays quiet. Hiding the colony or its text forgets it, so a return is never stamped.
  function stampMagnitude(element, key) {
    var value = element.textContent;
    var rank = magnitudeRank(value);
    var best = magnitudes[key];
    if (best === undefined || rank > best) magnitudes[key] = rank;
    if (best !== undefined && rank > best) {
      element.setAttribute('data-stamp', value);
      flash(element, 'stamp');
      // A big milestone at night sends a few winged roaches up from the nest.
      if (nightShift && habitat) habitat.nuptialFlight();
    }
    else if (element.getAttribute('data-stamp') !== value && /\bstamp-[ab]\b/.test(element.className)) element.setAttribute('data-stamp', value);
  }
  // Tier reveal: the first-hatch toast shows the new unit's 32 px icon at 1x, 2x and then 3x
  // under a brief rim of light. The census slot slides in through its own arrive flash.
  function revealTier(id) {
    var slot = el('unit-intro').querySelector('.intro-icon');
    var icon = pixelIcon('unit', id, 32);
    slot.textContent = '';
    slot.hidden = !icon;
    if (!icon) return;
    icon.style.width = icon.style.height = '';
    slot.appendChild(icon);
    flash(slot, 'reveal');
  }
  // Achievement seal: an achievement toast stamps a pixel medal down in whole-pixel steps.
  function sealToast(entry) {
    var seal = el('milestone').querySelector('.toast-seal');
    seal.hidden = entry.id.indexOf('achievement:') !== 0;
    if (!seal.hidden) flash(seal, 'seal');
  }
  // Purchase pop: the bought row's icon pops by a pixel step and its owned count rolls in from
  // below; the census entry does the same when the purchase changed its count. Counts are read
  // before the purchase so an unchanged one stays put.
  function purchaseCounts(type, id) {
    var row = compact ? null : childWith(el('items'), 'data-item', id);
    var entry = type === 'unit' ? childWith(el('census'), 'data-unit', id) : null;
    return {row: row && row.querySelector('.owned').textContent, census: entry && entry.querySelector('strong').textContent};
  }
  function popPurchase(type, id, before) {
    var row = compact ? null : childWith(el('items'), 'data-item', id);
    var entry = type === 'unit' ? childWith(el('census'), 'data-unit', id) : null;
    if (row) {
      flash(row.querySelector('.item-head .sprite-icon, .item-head .item-icon'), 'bump');
      if (row.querySelector('.owned').textContent !== before.row) flash(row.querySelector('.owned'), 'roll');
    }
    if (entry && entry.querySelector('strong').textContent !== before.census) {
      flash(entry.firstChild, 'bump');
      flash(entry.querySelector('strong'), 'roll');
    }
  }
  function scheduleSave() {
    if (!dirtySince) dirtySince = Date.now();
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = setTimeout(persist, Math.max(0, Math.min(1200, dirtySince + 5000 - Date.now())));
  }
  function milestones() {
    var ids = snapshot.visibleUnitIds || snapshot.items.filter(function (item) { return item.kind === 'unit'; }).map(function (item) { return item.id; });
    var units = snapshot.visibleUnits || ids.map(function (id) { return {id: id, name: id, owned: true}; });
    // The total population footer line is omitted to keep the strip clean.
    text(el('stage'), '');
    el('stage').hidden = true;
    var allFeats = feats();
    var earnedFeatCount = 0;
    for (var fi = 0; fi < allFeats.length; fi++) if (allFeats[fi].earned) earnedFeatCount++;
    var baseEarnedCount = snapshot.earnedAchievementIds ? snapshot.earnedAchievementIds.length : snapshot.achievements.filter(function (entry) { return entry.earned; }).length;
    // Roles, achievements and ascensions change rarely; skip the event scan until one does.
    var signature = units.map(function (entry) { return entry.id + (entry.owned ? '+' : ''); }).join() + '|' + (baseEarnedCount + earnedFeatCount) + '|' + snapshot.ascensions;
    if (signature === milestoneSignature) {
      if (introUntil && Date.now() >= introUntil) el('unit-intro').hidden = true;
      tickMilestones();
      return;
    }
    var earned = snapshot.earnedAchievementIds || snapshot.achievements.filter(function (entry) { return entry.earned; }).map(function (entry) { return entry.id; });
    var guestFeats = allFeats.filter(function (entry) { return entry.earned; });
    earned = earned.concat(guestFeats.map(function (entry) { return entry.id; }));
    var changed = false;
    units.forEach(function (entry) {
      if (!entry.owned || milestoneSeen['owned:' + entry.id] || ['meat', 'larva', 'territory', 'energy', 'mutagen', 'cocoon'].indexOf(entry.id) !== -1) return;
      milestoneSeen['owned:' + entry.id] = true;
      changed = true;
      if (milestoneReady && nightShift && habitat) habitat.nuptialFlight();
      if (!milestoneReady || critters) return;
      wake();
      var name = theme.label(entry.id, entry.name);
      text(el('unit-intro').querySelector('strong'), name);
      // Compact snapshots carry no unit descriptions, so the first hatch there points at the menu instead.
      var detail = snapshot.items.filter(function (item) { return item.kind === 'unit' && item.id === entry.id; })[0];
      var explanation = theme.text(detail && detail.description || entry.description || 'Your first ' + name + ' just hatched. Press Yellow to see what it makes.');
      explanation = explanation.length > 240 ? explanation.slice(0, 237) + '…' : explanation;
      if (Number(entry.tier) > 1 && !territorial(entry)) explanation += ' Each one is promoted from lower-tier roaches, so their count drops when you buy.';
      text(el('unit-intro').querySelector('p'), explanation);
      el('unit-intro').hidden = false;
      revealTier(entry.id);
      closeHint();
      el('key-help').hidden = true;
      el('milestone').hidden = true;
      milestoneUntil = 0;
      el('local-hint').hidden = true;
      introUntil = Date.now() + 6500;
    });
    roleIds = units.filter(function (entry) { return entry.owned && ['meat', 'larva', 'territory', 'energy', 'mutagen', 'cocoon'].indexOf(entry.id) === -1; }).map(function (entry) { return entry.id; });
    var events = units.filter(function (entry) { return ['meat', 'larva', 'territory', 'energy', 'mutagen', 'cocoon'].indexOf(entry.id) === -1; }).map(function (entry) { return {id: 'unit:' + entry.id, title: 'First hatch', description: theme.label(entry.id, entry.name), flavor: Number(entry.tier) > 0 && !territorial(entry)}; });
    earned.forEach(function (id) {
      var known = (snapshot.earnedAchievements || snapshot.achievements).concat(guestFeats).filter(function (entry) { return entry.id === id; })[0];
      events.push({id: 'achievement:' + id, title: 'Achievement earned', description: known ? achievementName(id, known.name) : snapshot.earnedAchievementLabels && snapshot.earnedAchievementLabels[id] || id, flavor: true});
    });
    if (Number(snapshot.ascensions) > 0) events.push({id: 'ascension:' + snapshot.ascensions, title: 'A new colony begins', description: snapshot.ascensions + ' ascensions'});
    events.forEach(function (entry) {
      if (milestoneSeen[entry.id]) return;
      milestoneSeen[entry.id] = true;
      changed = true;
      if (milestoneReady && milestoneQueue.length < 4) milestoneQueue.push(entry);
      if (milestoneReady && controllerLink) controllerLink.event(theme.text(entry.title), theme.text(entry.description));
    });
    milestoneReady = true;
    milestoneSignature = signature;
    if (introUntil && Date.now() >= introUntil) el('unit-intro').hidden = true;
    if (changed && store) store.saveMilestones(milestoneSeen);
    tickMilestones();
  }
  function tickMilestones() {
    // Critters-only shows no text; queued milestones wait for the compact overlay.
    if (closed || document.hidden || critters) { el('milestone').hidden = true; closeHint(); return; }
    var now = Date.now();
    if (hintUntil && now >= hintUntil) el('local-hint').hidden = true;
    if (hintCardUntil && now >= hintCardUntil) closeHint();
    // A finished toast first plays its short exit, then hides on a later tick.
    if (milestoneUntil && now >= milestoneUntil) {
      if (el('milestone').classList.contains('leaving')) { el('milestone').hidden = true; milestoneUntil = 0; }
      else { el('milestone').classList.add('leaving'); milestoneUntil = now + 300; }
    }
    // The hint card waits out ordinary toasts like the key help, but a catch answers Red at once.
    if (!el('hint-card').hidden && !milestoneUntil && milestoneQueue.length && milestoneQueue[0].urgent) closeHint();
    if (milestoneUntil || now < milestoneNext || !milestoneQueue.length || !el('dialog').hidden || !el('unit-intro').hidden || !el('key-help').hidden || !el('local-hint').hidden || !el('hint-card').hidden) return;
    var entry = milestoneQueue.shift();
    text(el('milestone').querySelector('strong'), theme.text(entry.title));
    text(el('milestone').querySelector('span'), theme.text(entry.description));
    var flavor = el('milestone').querySelector('em');
    text(flavor, entry.flavor ? flavorLine() : '');
    flavor.hidden = !entry.flavor;
    el('milestone').classList.remove('leaving');
    el('milestone').hidden = false;
    sealToast(entry);
    if (habitat && habitat.cue) habitat.cue('milestone');
    wake();
    milestoneUntil = now + 3500;
    milestoneNext = now + 12000;
  }
  // Chance events: notifications reach the phone at once and join the TV toast queue. Direct
  // catches go to the front so Red gets an answer straight away.
  function notify(entry, urgent) {
    if (controllerLink) controllerLink.event(entry.title, entry.description);
    if (milestoneQueue.length >= 4) { if (!urgent) return; milestoneQueue.pop(); }
    if (urgent) { entry.urgent = true; milestoneQueue.unshift(entry); milestoneNext = 0; } else milestoneQueue.push(entry);
    tickMilestones();
  }
  // Rewards run through the engine's reward action and save like any purchase.
  function grant(rewards) {
    var gained = [];
    rewards.forEach(function (reward) {
      try {
        var result = game.act({type: 'reward', resource: reward.resource, seconds: reward.seconds}, Date.now());
        if (result.ok) gained.push('+' + short(result.reward.amount) + ' ' + REWARD_NOUNS[reward.resource]);
      } catch (error) { message('Reward failed: ' + error.message); }
    });
    if (gained.length) { scheduleSave(); lastSnapshotAt = 0; }
    return gained.join(', ');
  }
  // Timed rewards wait their turn so one simulation tick never pays and refreshes at once.
  function payReward() {
    var next = pendingRewards.shift();
    if (!next) return false;
    var gained = grant(next.rewards);
    if (next.title && gained) notify({id: next.title, title: next.title, description: next.text + ' ' + gained + '.'});
    return true;
  }
  function territorySpecies() {
    return (snapshot && snapshot.visibleUnits || []).filter(function (entry) { return entry.owned && territorial(entry); }).length;
  }
  function nightKey() {
    var day = new Date();
    if (day.getHours() < 12) day = new Date(day.getTime() - 86400000);
    return 'night:' + day.getFullYear() + '-' + (day.getMonth() + 1) + '-' + day.getDate();
  }
  function tickMechanics(now) {
    if (!mechanics || !snapshot) return;
    var ms = lastMechanicsAt ? now - lastMechanicsAt : 0;
    lastMechanicsAt = now;
    // A dormant nest stays quiet: no guests, events or night shift until the first forager wakes it.
    if (snapshot.dormant) return;
    var stepEvents = mechanics.step(ms, territorySpecies(), creviceLevels(), {
      habitat: habitat,
      onPhoneEvent: function (title, body) {
        if (controllerLink) controllerLink.event(title, body);
      },
      onReward: function (entry) {
        if (pendingRewards.length < 4) pendingRewards.push(entry);
      },
      onTallyChanged: saveCatches,
      onNight: function (on) {
        nightShift = on;
        el('night-shift').hidden = !nightShift;
        var key = nightKey();
        if (nightShift && !milestoneSeen[key]) {
          Object.keys(milestoneSeen).forEach(function (seen) { if (seen.indexOf('night:') === 0) delete milestoneSeen[seen]; });
          milestoneSeen[key] = true;
          if (store) store.saveMilestones(milestoneSeen);
          notify({id: key, title: 'Night shift', description: 'Fireflies are out and crumbs come in a little faster.'});
        }
      }
    });
    var nextExp = mechanics.expedition ? mechanics.expedition() : null;
    if (expedition && !nextExp) {
      expedition = null;
      if (store && store.saveExpedition) store.saveExpedition(null);
      chronicleSignature = '';
    } else if (nextExp) {
      expedition = nextExp;
    }
    (stepEvents || []).forEach(function (ev) {
      if (ev.type === 'expeditionDone') {
        if (ev.visitor) {
          saveVisitors();
          if (mechanics.firstSeen) {
            firstSeen = mechanics.firstSeen();
            if (store && store.saveFirstSeen) store.saveFirstSeen(firstSeen);
          }
          visitorSignature = '';
        }
        syncKeepsakes();
        recordColonyActivity('expedition', ev.label + ' complete', 'The scouts returned to the nest.');
      } else if (ev.type === 'chance' || ev.type === 'chanceGone') {
        chronicleSignature = '';
      }
    });
    renderRedCue();
    syncFeatPoints();
  }
  function creviceLevels() {
    var levels = snapshot && snapshot.upgradeLevels && snapshot.upgradeLevels.expansion;
    return Math.max(0, Math.floor(Number(levels)) || 0);
  }
  function syncFeatPoints() {
    if (!game || typeof game.setBonusAchievementPoints !== 'function' || !mechanics) return;
    var earned = 0;
    var list = feats();
    for (var i = 0; i < list.length; i++) if (list[i].earned) earned++;
    if (earned === featPoints) return;
    featPoints = earned;
    game.setBonusAchievementPoints(earned * 10);
  }
  function unlockedKeepsakes() {
    if (!mechanics || !mechanics.keepsakes) return [];
    return mechanics.keepsakes(visitorSlugs());
  }
  function syncKeepsakes() {
    if (!habitat || !habitat.setKeepsakes || !mechanics || !mechanics.keepsakes) return;
    var unlocked = unlockedKeepsakes().filter(function (k) { return k.unlocked; }).map(function (k) { return k.id; });
    habitat.setKeepsakes(unlocked);
  }
  function saveCatches() {
    cachedFeats = null;
    syncFeatPoints();
    syncKeepsakes();
    chronicleSignature = '';
    if (store && mechanics) store.saveCatches(mechanics.tally());
  }
  function visitorSlugs() {
    return window.RoachCritters && Array.isArray(RoachCritters.visitors) && window.RoachHabitat && RoachHabitat.critterCanvas ? RoachCritters.visitors : [];
  }
  // Guest achievements live beside the source's in the same list, toasts and phone view.
  function feats() {
    if (!mechanics) return [];
    var slugs = visitorSlugs();
    if (!cachedFeats || cachedFeatSlugsLen !== slugs.length) {
      cachedFeatSlugsLen = slugs.length;
      cachedFeats = mechanics.feats(slugs);
    }
    return cachedFeats;
  }
  function saveVisitors() {
    cachedFeats = null;
    syncFeatPoints();
    syncKeepsakes();
    chronicleSignature = '';
    if (store && mechanics) store.saveVisitors(mechanics.log());
  }
  function formatDuration(ms) {
    var sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (sec < 60) return sec + 's';
    var min = Math.floor(sec / 60);
    var remS = sec % 60;
    if (min < 60) return min + 'm' + (remS ? ' ' + remS + 's' : '');
    var hr = Math.floor(min / 60);
    var remM = min % 60;
    return hr + 'h' + (remM ? ' ' + remM + 'm' : '');
  }
  function whenAgo(ts) {
    if (!ts) return '';
    var sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (sec < 5) return 'now';
    if (sec < 60) return sec + 's ago';
    var min = Math.round(sec / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.round(min / 60);
    return hr < 48 ? hr + 'h ago' : Math.round(hr / 24) + 'd ago';
  }
  function recordColonyActivity(kind, title, textVal) {
    activity = session.recordActivity(activity, kind, theme.text(title), theme.text(textVal), Date.now());
    if (store && store.saveActivity) store.saveActivity(activity);
    chronicleSignature = '';
  }
  function isPinned(kind, id) {
    return !!(pinnedQuick && pinnedQuick.kind === kind && pinnedQuick.id === id);
  }
  function togglePin(kind, id) {
    if (!kind || !id || isPinned(kind, id)) pinnedQuick = null;
    else pinnedQuick = {kind: kind, id: id};
    if (store && store.savePin) store.savePin(pinnedQuick);
    lastListSignature = '';
    chronicleSignature = '';
    refresh();
    return {ok: true, pinned: isPinned(kind, id), pin: pinnedQuick};
  }
  function isReserved(kind, id) {
    return !!(reserveTarget && reserveTarget.kind === kind && reserveTarget.id === id);
  }
  function toggleReserve(kind, id) {
    if (!kind || !id || isReserved(kind, id)) {
      reserveTarget = null;
      lastHoldReason = '';
    } else {
      reserveTarget = {kind: kind, id: id};
    }
    if (store && store.saveReserve) store.saveReserve(reserveTarget);
    lastListSignature = '';
    chronicleSignature = '';
    refresh();
    return {ok: true, reserved: isReserved(kind, id), reserve: reserveTarget};
  }
  function chooseEventOption(optionId) {
    if (!mechanics || !mechanics.chooseOption || closed) return {ok: false, message: 'No active event choice.'};
    var chosen = mechanics.chooseOption(optionId, habitat);
    if (!chosen) return {ok: false, message: 'The event has already ended.'};
    wake();
    var gained = grant(chosen.rewards);
    var described = RoachMechanics.describeCatch(chosen, gained);
    recordColonyActivity('choice', described.toast ? described.toast.title : 'Event choice', described.message);
    if (described.toast) notify(described.toast, described.urgent);
    else if (described.message) message(described.message);
    renderRedCue();
    chronicleSignature = '';
    refresh();
    return {ok: true, message: described.message};
  }
  function startScoutExpedition(id) {
    if (!mechanics || !mechanics.startExpedition || closed) return {ok: false, message: 'Expeditions are unavailable.'};
    if (snapshot && snapshot.dormant) return {ok: false, message: 'Wake the nest before sending scouts.'};
    var startedExp = mechanics.startExpedition(id);
    if (!startedExp) return {ok: false, message: 'An expedition is already underway.'};
    expedition = startedExp;
    if (store && store.saveExpedition) store.saveExpedition(expedition);
    recordColonyActivity('expedition', startedExp.label + ' started', 'Scouts set out along the baseboard.');
    message(startedExp.label + ' underway (' + Math.ceil(startedExp.remainingMs / 1000) + 's).');
    chronicleSignature = '';
    render();
    return {ok: true, expedition: startedExp, message: startedExp.label + ' underway.'};
  }
  function cancelScoutExpedition() {
    if (!mechanics || !mechanics.cancelExpedition) return {ok: false, message: 'No active expedition.'};
    var cancelled = mechanics.cancelExpedition();
    expedition = null;
    if (store && store.saveExpedition) store.saveExpedition(null);
    chronicleSignature = '';
    render();
    return {ok: cancelled, message: cancelled ? 'Expedition recalled.' : 'No active expedition.'};
  }
  function buildSupportDiagnostics() {
    var ctrl = controllerLink ? controllerLink.diagnostics() : null;
    var vis = habitat ? habitat.diagnostics() : null;
    return {
      format: 'roach-colony-diagnostics',
      version: snapshot && snapshot.coverage && snapshot.coverage.sourceCommit ? snapshot.coverage.sourceCommit : '0.4.15',
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      display: !compact ? 'full' : critters ? 'critters' : watchMode ? 'watch' : 'compact',
      standalone: standalone,
      storageOk: !(store && store.error),
      storageError: store ? store.error || '' : '',
      ascensions: snapshot ? snapshot.ascensions : '0',
      population: snapshot ? snapshot.population : '0',
      autoCount: autoBindings.length,
      autoPaused: autoPaused,
      controller: ctrl ? {connected: ctrl.connected, watching: ctrl.watching, attempts: ctrl.attempts} : null,
      habitat: vis ? {entities: vis.entities, targetFps: vis.targetFps, stage: vis.nestLife && vis.nestLife.stage} : null,
      journal: journal.slice(-20)
    };
  }
  // Red catches a golden roach first, then an intruder, then an egg case, molting roach or dung beetle, then a visitor; with none on screen it forages.
  function catchGuest() {
    if (!mechanics || closed) return null;
    var caught = mechanics.catchOne(habitat);
    if (!caught) return null;
    wake();
    var gained = grant(caught.rewards);
    if (caught.type === 'golden' || caught.type === 'intruder') {
      saveCatches();
    } else if (caught.type === 'visitor') {
      saveVisitors();
      if (mechanics.firstSeen) {
        firstSeen = mechanics.firstSeen();
        if (store && store.saveFirstSeen) store.saveFirstSeen(firstSeen);
      }
      visitorSignature = '';
    }
    var described = RoachMechanics.describeCatch(caught, gained);
    recordColonyActivity('catch', described.toast ? described.toast.title : 'Visitor logged', described.message);
    if (described.toast) notify(described.toast, described.urgent);
    else if (described.statusMessage) message(described.statusMessage);
    return {ok: true, message: described.message};
  }
  function red() {
    var result = catchGuest();
    if (result) { renderRedCue(); return result; }
    return act('forage', '');
  }
  // The Catch chip names what Red catches right now, from the same redTarget() Red uses. When Red
  // would forage it shows nothing.
  function renderRedCue() {
    var info = mechanics && !closed && !critters ? mechanics.redTarget() : null;
    var label = info ? info.label : '';
    if (label === redCueText) return;
    redCueText = label;
    var chip = el('red-cue');
    // The habitat only draws from its cached glyph, so the chip can show that same canvas.
    if (label && !chip.firstChild) {
      var sprites = window.RoachSprites || window.RoachHabitat;
      if (sprites && sprites.redGlyph) chip.appendChild(sprites.redGlyph(2));
      chip.appendChild(node('span'));
    }
    if (chip.lastChild) text(chip.lastChild, label);
    chip.hidden = !label;
    el('stage').hidden = true;
  }
  // Away from the colony every guest leaves and the night shift stops until the next visible tick.
  function dismissGuests() {
    lastMechanicsAt = 0;
    pendingRewards = [];
    if (mechanics) mechanics.hide();
    nightShift = false;
    el('night-shift').hidden = true;
    renderRedCue();
  }
  function visitorList() {
    var slugs = visitorSlugs();
    var log = mechanics ? mechanics.log() : {};
    var seenMap = mechanics && mechanics.firstSeen ? mechanics.firstSeen() : firstSeen;
    return slugs.map(function (slug) {
      var count = log[slug] || 0;
      var r = window.RoachMechanics && RoachMechanics.rarity ? RoachMechanics.rarity(slug) : 'common';
      return {
        slug: slug,
        name: RoachMechanics.humanize(slug),
        seen: count,
        rarity: r,
        firstSeen: seenMap && seenMap[slug] ? seenMap[slug] : 0,
        note: count && window.RoachMechanics && RoachMechanics.visitorNote ? RoachMechanics.visitorNote(slug) : ''
      };
    });
  }
  function visitorIcon(slug, size, found) {
    var sprites = window.RoachSprites || window.RoachHabitat;
    var source = sprites && sprites.critterCanvas ? sprites.critterCanvas(slug, size) : null;
    var icon = node('canvas', 'visitor-icon');
    icon.width = icon.height = size;
    icon.setAttribute('aria-hidden', 'true');
    if (!source || !source.width) return icon;
    var ctx = icon.getContext('2d');
    ctx.drawImage(source, 0, 0, size, size);
    if (!found) {
      // Undiscovered visitors show only a dim silhouette.
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'rgba(58,50,40,.85)';
      ctx.fillRect(0, 0, size, size);
    }
    return icon;
  }
  function renderVisitors() {
    var list = visitorList();
    var found = list.filter(function (entry) { return entry.seen; }).length;
    var pages = Math.max(1, Math.ceil(list.length / 18));
    page = Math.min(page, pages - 1);
    el('pagination').hidden = pages === 1;
    text(el('page-label'), (page + 1) + ' / ' + pages + ' · ' + found + ' / ' + list.length + ' found');
    el('previous').disabled = page === 0;
    el('next').disabled = page >= pages - 1;
    var shown = list.slice(page * 18, page * 18 + 18);
    var signature = page + '|' + shown.map(function (entry) { return entry.slug + ':' + entry.seen; }).join();
    if (signature === visitorSignature) return;
    visitorSignature = signature;
    var container = el('visitors');
    container.textContent = '';
    if (!list.length) container.appendChild(node('p', 'empty', 'Visitors appear once the insect sheet is installed.'));
    shown.forEach(function (entry) {
      var cell = node('div', 'visitor' + (entry.seen ? '' : ' unfound'));
      if (entry.seen) cell.classList.add('rarity-' + entry.rarity);
      cell.appendChild(visitorIcon(entry.slug, 44, !!entry.seen));
      cell.appendChild(node('span', '', entry.seen ? entry.name : '?'));
      var note = entry.note || (entry.seen && window.RoachMechanics && RoachMechanics.visitorNote ? RoachMechanics.visitorNote(entry.slug) : '');
      cell.title = entry.seen ? entry.name + ' (' + entry.rarity + ') · seen ' + entry.seen + (entry.seen === 1 ? ' time' : ' times') + (note ? ' — ' + note : '') : 'Not yet seen';
      if (entry.seen && note) {
        cell.onclick = function () { message(entry.name + ': ' + note); };
      }
      container.appendChild(cell);
    });
  }
  function uiGlyph(name, size) {
    var img = node('img', 'ui-glyph pixel-art');
    img.src = 'ui-art/' + name + '.png';
    img.alt = '';
    img.width = img.height = size || 20;
    img.setAttribute('aria-hidden', 'true');
    return img;
  }
  function keepsakeIcon(slug, size, unlocked) {
    var sprites = window.RoachSprites || window.RoachHabitat;
    var source = sprites && sprites.critterCanvas ? sprites.critterCanvas(slug, size) : null;
    var icon = node('canvas', 'keepsake-icon pixel-art');
    icon.width = icon.height = size;
    icon.setAttribute('aria-hidden', 'true');
    if (!source || !source.width) return icon;
    var ctx = icon.getContext('2d');
    ctx.drawImage(source, 0, 0, size, size);
    if (!unlocked) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'rgba(58,50,40,.85)';
      ctx.fillRect(0, 0, size, size);
    }
    return icon;
  }
  function renderChronicle() {
    var pages = 4;
    page = Math.min(page, pages - 1);
    el('pagination').hidden = false;
    var pageTitles = ['Field ops', 'Activity', 'Records & keepsakes', 'Support & inspector'];
    text(el('page-label'), (page + 1) + ' / ' + pages + ' · ' + pageTitles[page]);
    el('previous').disabled = page === 0;
    el('next').disabled = page >= pages - 1;
    var activeChoice = mechanics && mechanics.choice ? mechanics.choice() : null;
    var activeExp = mechanics && mechanics.expedition ? mechanics.expedition() : expedition;
    var resProg = session.reserveProgress(reserveTarget, snapshot);
    var inspInfo = inspectorEnabled && habitat && habitat.inspectorDiagnostics ? habitat.inspectorDiagnostics() : null;
    var sigParts = [page];
    if (page === 0) sigParts.push(activeChoice, activeExp ? activeExp.id + ':' + Math.ceil(activeExp.remainingMs / 1000) : '', reserveTarget, resProg ? Math.floor((resProg.progress || 0) * 100) : -1, snapshot && snapshot.dormant);
    else if (page === 1) sigParts.push(activity.length, activity[0] ? activity[0].t : 0);
    else if (page === 2) sigParts.push(records, unlockedKeepsakes(), Math.floor((Date.now() - runStartedAt) / 5000));
    else sigParts.push(inspectorEnabled, inspInfo && inspInfo.targetId, inspInfo && inspInfo.job, inspInfo && inspInfo.cargo, journal.length, store && store.error);
    var sig = JSON.stringify(sigParts);
    if (sig === chronicleSignature) return;
    var focus = focusKey();
    chronicleSignature = sig;
    var container = el('chronicle');
    container.textContent = '';
    function headingWithGlyph(glyphName, titleText) {
      var h = node('strong', 'with-glyph');
      h.appendChild(uiGlyph(glyphName, 20));
      h.appendChild(document.createTextNode(titleText));
      return h;
    }
    if (page === 0) {
      var choiceBlock = node('div', 'chronicle-block');
      choiceBlock.appendChild(headingWithGlyph('status_choice', activeChoice ? 'Event choice: ' + activeChoice.title : 'Event choice'));
      if (activeChoice) {
        var choiceActions = node('div', 'chronicle-actions');
        var btnDefault = node('button', '', activeChoice.defaultLabel);
        btnDefault.setAttribute('data-focus', 'choice-default');
        btnDefault.onclick = function () { chooseEventOption('default'); };
        var btnAlt = node('button', '', activeChoice.altLabel);
        btnAlt.setAttribute('data-focus', 'choice-nursery');
        btnAlt.onclick = function () { chooseEventOption(activeChoice.altId || 'nursery'); };
        choiceActions.appendChild(btnDefault);
        choiceActions.appendChild(btnAlt);
        choiceBlock.appendChild(choiceActions);
      } else {
        choiceBlock.appendChild(node('p', '', 'When an egg case, molting roach or dung beetle appears, choose its fate here or press Red.'));
      }
      container.appendChild(choiceBlock);

      var expBlock = node('div', 'chronicle-block');
      expBlock.appendChild(headingWithGlyph('status_expedition', activeExp ? 'Scout expedition: ' + activeExp.label : 'Scout expeditions'));
      if (activeExp) {
        var remSec = Math.max(1, Math.ceil(activeExp.remainingMs / 1000));
        expBlock.appendChild(node('p', '', remSec + 's remaining · ticks while visible'));
        var expBar = segmentBar('chronicle-bar', 10);
        setSegments(expBar, activeExp.totalMs > 0 ? Math.max(0, Math.min(1, 1 - activeExp.remainingMs / activeExp.totalMs)) : 0);
        expBlock.appendChild(expBar);
        var expCancelWrap = node('div', 'chronicle-actions');
        var btnCancel = node('button', '', 'Recall scouts');
        btnCancel.setAttribute('data-focus', 'expedition-cancel');
        btnCancel.onclick = function () { cancelScoutExpedition(); };
        expCancelWrap.appendChild(btnCancel);
        expBlock.appendChild(expCancelWrap);
      } else {
        var expActions = node('div', 'chronicle-actions');
        var specs = window.RoachMechanics && Array.isArray(RoachMechanics.expeditions) ? RoachMechanics.expeditions : [];
        specs.forEach(function (spec) {
          var btn = node('button', '', spec.label + ' (' + spec.seconds + 's)');
          btn.setAttribute('data-focus', 'expedition-' + spec.id);
          btn.disabled = !!(snapshot && snapshot.dormant);
          btn.onclick = function () { startScoutExpedition(spec.id); };
          expActions.appendChild(btn);
        });
        expBlock.appendChild(expActions);
      }
      container.appendChild(expBlock);

      var resBlock = node('div', 'chronicle-block');
      resBlock.appendChild(headingWithGlyph('status_reserve', 'Auto-buy reserve & pin'));
      if (reserveTarget || pinnedQuick) {
        var statusParts = [];
        if (pinnedQuick) statusParts.push('Pinned: ' + theme.label(pinnedQuick.id, pinnedQuick.id));
        if (reserveTarget) statusParts.push('Saving toward: ' + (resProg ? rowName(resProg) + ' (' + Math.floor((resProg.progress || 0) * 100) + '%)' : theme.label(reserveTarget.id, reserveTarget.id)));
        resBlock.appendChild(node('p', '', statusParts.join(' · ')));
        var resActions = node('div', 'chronicle-actions');
        if (pinnedQuick) {
          var btnClearPin = node('button', '', 'Clear pin');
          btnClearPin.setAttribute('data-focus', 'clear-pin');
          btnClearPin.onclick = function () { togglePin(null, null); };
          resActions.appendChild(btnClearPin);
        }
        if (reserveTarget) {
          var btnClearRes = node('button', '', 'Clear reserve');
          btnClearRes.setAttribute('data-focus', 'clear-reserve');
          btnClearRes.onclick = function () { toggleReserve(null, null); };
          resActions.appendChild(btnClearRes);
        }
        resBlock.appendChild(resActions);
      } else {
        resBlock.appendChild(node('p', '', 'Open Details (8) on any unit or upgrade row to pin it to slot 1 or save toward its cost.'));
      }
      container.appendChild(resBlock);
    } else if (page === 1) {
      if (!activity.length) {
        container.appendChild(node('p', 'empty', 'No colony activity recorded yet. Catch visitors, complete expeditions, or ascend to log events.'));
      } else {
        activity.slice(0, 4).forEach(function (actItem) {
          var row = node('div', 'activity-row');
          row.appendChild(node('span', '', whenAgo(actItem.t)));
          row.appendChild(headingWithGlyph('status_history', actItem.title));
          row.appendChild(node('p', '', actItem.text));
          container.appendChild(row);
        });
      }
    } else if (page === 2) {
      var recBlock = node('div', 'chronicle-block');
      recBlock.appendChild(headingWithGlyph('status_history', 'Run recordbook'));
      var topNow = records.highestCaste ? theme.label(records.highestCaste, records.highestCaste) : 'Forager roach';
      recBlock.appendChild(node('p', '', 'Current run: ' + formatDuration(Date.now() - runStartedAt) + ' · Ascensions: ' + (snapshot ? snapshot.ascensions : '0') + ' · Highest caste: ' + topNow));
      recBlock.appendChild(node('p', '', 'Best mutagen: ' + (records.bestMutagen && records.bestMutagen !== '0' ? short(records.bestMutagen) : '—') + ' · Fastest run: ' + (records.fastestMs ? formatDuration(records.fastestMs) : '—')));
      if (records.runs && records.runs.length) {
        var latestRun = records.runs[0];
        recBlock.appendChild(node('p', '', 'Last run: +' + short(latestRun.mutagen) + ' mutagen in ' + formatDuration(latestRun.durationMs)));
      }
      container.appendChild(recBlock);

      var ksBlock = node('div', 'chronicle-block');
      ksBlock.appendChild(headingWithGlyph('status_guide', 'Nest keepsakes'));
      var grid = node('div', 'keepsake-grid');
      unlockedKeepsakes().forEach(function (k) {
        var cell = node('div', 'keepsake-cell' + (k.unlocked ? '' : ' locked'));
        cell.appendChild(keepsakeIcon(k.id, 28, !!k.unlocked));
        cell.appendChild(node('span', '', k.label + (k.unlocked ? '' : ' (' + k.condition + ')')));
        cell.title = k.label + ' — ' + k.condition;
        grid.appendChild(cell);
      });
      ksBlock.appendChild(grid);
      container.appendChild(ksBlock);
    } else {
      var sup = buildSupportDiagnostics();
      var supBlock = node('div', 'chronicle-block');
      supBlock.appendChild(headingWithGlyph('status_guide', 'Support & diagnostics'));
      supBlock.appendChild(node('p', '', 'Build: ' + String(sup.version).slice(0, 12) + ' · Storage: ' + (sup.storageOk ? 'OK' : 'Error') + ' · Bridge: ' + (sup.controller && sup.controller.connected ? 'Connected' : 'Standby') + ' · Log: ' + journal.length));
      var supActions = node('div', 'chronicle-actions');
      var btnExportDiag = node('button', '', 'Copy redacted diagnostics');
      btnExportDiag.setAttribute('data-focus', 'export-diagnostics');
      btnExportDiag.onclick = function () {
        openDialog('Support diagnostics', 'Redacted status and recent event log (contains no save data or keys).', 'exportDiagnostics', JSON.stringify(buildSupportDiagnostics(), null, 2));
      };
      supActions.appendChild(btnExportDiag);
      supBlock.appendChild(supActions);
      container.appendChild(supBlock);

      var inspBlock = node('div', 'chronicle-block');
      inspBlock.appendChild(headingWithGlyph('status_inspect', 'Creature inspector'));
      if (inspInfo && inspInfo.enabled && inspInfo.seat >= 0) {
        var destLabel = inspInfo.destination && inspInfo.destination.label ? inspInfo.destination.label : 'lane';
        inspBlock.appendChild(node('p', '', 'Roach #' + inspInfo.targetId + ' (' + theme.label(inspInfo.species, inspInfo.species) + ') · job: ' + inspInfo.job + (inspInfo.cargo ? ' (carrying)' : '') + ' → ' + destLabel));
      } else {
        inspBlock.appendChild(node('p', '', 'Highlights one roach on the habitat floor and traces its route and job.'));
      }
      var inspActions = node('div', 'chronicle-actions');
      var btnToggleInsp = node('button', '', inspectorEnabled ? 'Hide inspector' : 'Inspect creature');
      btnToggleInsp.setAttribute('data-focus', 'toggle-inspector');
      btnToggleInsp.onclick = function () {
        inspectorEnabled = !inspectorEnabled;
        if (habitat && habitat.setInspector) habitat.setInspector(inspectorEnabled);
        chronicleSignature = '';
        renderChronicle();
      };
      inspActions.appendChild(btnToggleInsp);
      if (inspectorEnabled && habitat && habitat.inspectCreature) {
        var btnNextInsp = node('button', '', 'Next creature');
        btnNextInsp.setAttribute('data-focus', 'next-inspector');
        btnNextInsp.onclick = function () {
          var cur = habitat.inspectorDiagnostics ? habitat.inspectorDiagnostics() : null;
          var nextSeat = cur && cur.seat >= 0 && habitat.count > 0 ? (cur.seat + 1) % habitat.count : 0;
          habitat.inspectCreature(nextSeat);
          chronicleSignature = '';
          renderChronicle();
        };
        inspActions.appendChild(btnNextInsp);
      }
      inspBlock.appendChild(inspActions);
      container.appendChild(inspBlock);
    }
    if (focus) focusByKey(focus);
  }
  var focusKey = tvShell.focusKey;
  function focusByKey(key) { return tvShell.focusByKey(panel, key, document); }
  function navigable(scope) { return tvShell.navigable(scope || (el('dialog').hidden ? el('menu') : el('dialog'))); }
  var focusCtrl = tvShell.createFocusController({
    panel: panel,
    el: el,
    getView: function () { return view; },
    onTurnPage: function (step) { turnPage(step); }
  });
  var primaryFocus = focusCtrl.primaryFocus;
  var move = focusCtrl.move;
  function turnPage(step) {
    var button = step > 0 ? el('next') : el('previous');
    if (el('pagination').hidden || button.disabled) return;
    var active = document.activeElement;
    var inList = el('items').contains(active);
    var x = inList ? focusCtrl.columnXForElement(active) : 0;
    var role = inList ? tvShell.itemRole(active) : '';
    page += step;
    lastListSignature = '';
    chronicleSignature = '';
    refresh();
    if (inList) {
      var first = tvShell.nearestLine(navigable(el('items')), -Infinity, true, x);
      if (first && role) {
        var row = first;
        while (row.parentElement && row.parentElement !== el('items')) row = row.parentElement;
        var roleButton = row.querySelector('.' + role);
        if (roleButton) first = roleButton;
      }
      if (first) { first.focus(); focusCtrl.setColumn(first, x); }
    } else if (button.disabled && document.activeElement === button) (step > 0 ? el('previous') : el('next')).focus();
  }
  function persist() {
    if (!store || !game) return;
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = null;
    dirtySince = 0;
    var ok = store.save(game, Date.now());
    if (mechanics && mechanics.expedition && store.saveExpedition) store.saveExpedition(mechanics.expedition());
    lastSave = Date.now();
    if (ok) saveMessage = 'Saved on this device. Export a copy to keep a separate backup.';
    renderSaveStatus();
  }
  function renderSaveStatus() {
    var error = store && store.error;
    var warning = el('save-warning');
    var hideWarning = !error;
    if (warning.hidden !== hideWarning) warning.hidden = hideWarning;
    text(warning, error ? 'Save failed. ' + error + ' Export a backup from More.' : '');
    text(el('save-status'), error ? 'Progress is running, but cannot be saved here. ' + error : saveMessage);
  }
  function pageIds(ids) {
    return session.pageIds(ids, page, pageSize());
  }
  function refresh() {
    if (!game) return;
    try {
      var purchases = !compact && (view === 'units' || view === 'upgrades');
      var options = {quantity: quantity, includeItems: purchases, kind: purchases ? (view === 'units' ? 'unit' : 'upgrade') : undefined, includeAchievements: !compact && tab === '__achievements', includeMenu: !compact, includeRates: !critters, tab: purchases && tab ? tab : undefined, ids: purchases ? quotedIds : undefined, includeEta: compact && !critters, includeQuick: compact && !critters, pinnedQuick: compact && !critters && pinnedQuick ? pinnedQuick : undefined, includeAscension: !compact && view === 'evolution', lastAscensionReward: !compact && lastAscension ? lastAscension : undefined};
      // Price quotes dominate a menu snapshot, so only the visible page is quoted. A changed
      // tab or page needs one more snapshot to quote the rows that are now shown.
      for (var attempt = 0; ; attempt += 1) {
        snapshot = game.snapshot(Date.now(), options);
        if (!purchases || !snapshot.itemIds || attempt === 2) break;
        var tabs = purchaseTabs();
        if (tabs.length && !tabs.some(function (entry) { return entry.id === tab; })) tab = tabs[0].id;
        if (options.tab !== tab) { options.tab = tab; options.ids = []; continue; }
        var wanted = pageIds(snapshot.itemIds);
        if (!wanted.some(function (id) { return options.ids.indexOf(id) === -1; })) break;
        options.ids = wanted;
      }
      if (purchases) quotedIds = options.ids;
      quickPicks = session.chooseQuick(quickState, snapshot.quickSlots, snapshot.pinnedCandidate);
      validateControls();
      lastSnapshotAt = Date.now();
      milestones();
      if (stirring) nestStirs();
      render();
      openingHint();
      if (habitat) { habitat.update(snapshot); updateExclusions(); }
    } catch (error) { logEvent('error', 'refresh', error.message, error.stack); message('Colony update failed: ' + error.message); }
  }
  function act(type, id, requestedQuantity, automatic, now) {
    try {
      var before = !automatic && (type === 'unit' || type === 'upgrade') ? purchaseCounts(type, id) : null;
      var result = game.act({type: type, id: id || '', quantity: type === 'forage' ? 1 : requestedQuantity || quantity}, now || Date.now());
      if (!automatic) {
        var note = result.purchase ? purchaseText(result.purchase) : result.message || (result.ok ? 'The colony is growing.' : 'That action is not available yet.');
        if (type === 'forage' && compact && result.ok && result.meat !== undefined) el('message').textContent = theme.text(note);
        else message(note);
      }
      if (result.ok && (type === 'unit' || type === 'upgrade')) {
        lastPurchase = {type: type, id: id};
        saveLastPurchase();
        logEvent('info', 'buy', type + ':' + id + 'x' + (result.purchase ? result.purchase.quantity : requestedQuantity || quantity), {auto: !!automatic});
      }
      if (result.ok && type === 'ascend' && result.reward) {
        lastAscension = result.reward;
        logEvent('info', 'ascend', 'reward:' + result.reward);
        if (store) store.saveLastAscension(lastAscension);
        var topUnit = '';
        (snapshot && snapshot.visibleUnits || []).forEach(function (u) {
          if (u.owned && !territorial(u) && Number(u.tier) > 0) topUnit = u.id;
        });
        records = session.recordAscensionRun(records, {
          at: Date.now(),
          mutagen: result.reward,
          durationMs: Math.max(0, Date.now() - runStartedAt),
          highestCaste: topUnit,
          ascension: snapshot ? String(Number(snapshot.ascensions || 0) + 1) : '1'
        });
        runStartedAt = Date.now();
        if (store && store.saveRecords) store.saveRecords(records);
        recordColonyActivity('ascend', 'Colony ascended', 'Gained +' + short(result.reward) + ' mutagen.');
      }
      if (result.ok && !automatic) {
        if (type === 'forage') {
          if (pendingSave) clearTimeout(pendingSave);
          pendingSave = setTimeout(persist, 2500);
        } else scheduleSave();
        wake();
      }
      if (result.woke) stirring = true;
      // A compact forage updates the crumb and hatchling figures directly in place without
      // rebuilding the colony, playing a pop animation, or popping up a hint.
      if (type === 'forage' && compact && result.meat !== undefined) {
        if (result.ok) {
          var meatRow = childWith(el('resources'), 'data-resource', 'meat');
          if (meatRow && meatRow.firstChild) text(meatRow.firstChild, short(result.meat));
          if (result.larva !== undefined) {
            var larvaRow = childWith(el('resources'), 'data-resource', 'larva');
            if (larvaRow && larvaRow.firstChild) text(larvaRow.firstChild, whole(result.larva));
          }
          lastSnapshotAt = 0;
        }
        return result;
      }
      // The colony files into the nest before the habitat sees the reset colony.
      if (result.ok && type === 'ascend' && habitat) habitat.ascendCeremony();
      if (!automatic) { refresh(); acknowledge(type, id, result); }
      if (before && result.ok) popPurchase(type, id, before);
      return result;
    } catch (error) { logEvent('error', 'act', type + ':' + (id || '') + ' ' + error.message, error.stack); message('Action failed: ' + error.message); }
  }
  // The first purchase wakes a dormant nest. Its toast stands in for the forager's first-hatch toast and goes
  // straight after the forager's introduction card, so it waits for the refresh that shows that card.
  function nestStirs() {
    stirring = false;
    milestoneSeen['unit:drone'] = true;
    milestoneQueue = milestoneQueue.filter(function (entry) { return entry.id !== 'unit:drone'; });
    notify({id: 'nest-stirs', title: 'The colony stirs', description: 'Hatchlings now hatch on their own.'}, true);
  }
  function saveLastPurchase() {
    if (store) store.saveLastPurchase(lastPurchase);
  }
  // A quick-buy keeps its own amount (Max of a roach, one upgrade level), so Green repeats it as bought.
  function rememberQuantity(result, amount) {
    if (!result || !result.ok || !lastPurchase || amount === undefined) return;
    lastPurchase.quantity = amount;
    saveLastPurchase();
  }
  // Brief, local answers to a manual action: a bought row washes ochre, and a short row nudges its Need more button.
  function acknowledge(type, id, result) {
    if (type === 'ascend' && result.ok) {
      if (habitat && habitat.cue) habitat.cue('ascend');
    } else if (type === 'unit' || type === 'upgrade') {
      var row = compact ? null : childWith(el('items'), 'data-item', id);
      if (!result.ok) { flash(row && row.querySelector('.buy'), 'nudge'); return; }
      flash(row, 'wash');
      if (result.ok && type === 'upgrade' && /^(swarmwarp|larvarush|meatrush|territoryrush|clonelarvae|clonearmy)$/.test(id) && habitat && habitat.cue) habitat.cue(id);
    }
  }
  function boundIndex(type, id) {
    for (var i = 0; i < autoBindings.length; i++) {
      if (autoBindings[i].type === type && autoBindings[i].id === id) return i;
    }
    return -1;
  }
  function validateControls() {
    var checked = session.validateControls(autoBindings, lastPurchase, snapshot);
    if (checked.bindingsChanged) { autoBindings = checked.bindings; saveAuto(); }
    if (checked.lastChanged) { lastPurchase = checked.lastPurchase; saveLastPurchase(); }
    if (snapshot && snapshot.visibleUnitIds && snapshot.visibleUpgradeIds) {
      if (pinnedQuick) {
        var pinPool = pinnedQuick.kind === 'upgrade' ? snapshot.visibleUpgradeIds : snapshot.visibleUnitIds;
        if (pinPool.indexOf(pinnedQuick.id) === -1) { pinnedQuick = null; if (store && store.savePin) store.savePin(null); }
      }
      if (reserveTarget) {
        var resPool = reserveTarget.kind === 'upgrade' ? snapshot.visibleUpgradeIds : snapshot.visibleUnitIds;
        if (resPool.indexOf(reserveTarget.id) === -1) { reserveTarget = null; lastHoldReason = ''; if (store && store.saveReserve) store.saveReserve(null); }
      }
    }
  }
  function toggleAuto(type, id) {
    var index = boundIndex(type, id);
    if (index === -1) {
      if (autoBindings.length >= 16) { message('Auto-buy supports up to 16 targets. Turn one off first.'); return {ok: false, message: 'Auto-buy supports up to 16 targets. Turn one off first.'}; }
      if (!autoBindings.length) lastAutoAt = Date.now();
      autoBindings.push({type: type, id: id});
    } else autoBindings.splice(index, 1);
    if (!autoBindings.length) lastHoldReason = '';
    saveAuto();
    render();
    return {ok: true, enabled: index === -1};
  }
  function setAutoPaused(value) {
    autoPaused = value;
    if (store) store.saveAuto(undefined, autoPaused);
    message(autoPaused ? 'Auto-buy paused.' : 'Auto-buy resumed.');
  }
  function saveAuto() {
    if (store) store.saveAuto(autoBindings, autoPaused);
  }
  function autoTick() {
    if (closed || document.hidden || autoPaused || !el('dialog').hidden || !autoBindings.length || Date.now() - lastAutoAt < 2000) return false;
    lastAutoAt = Date.now();
    // Higher tiers get the first claim on shared stock and upgrades follow units. Each tick
    // starts one place further round, so every binding gets a turn, and buys a tenth of what
    // the first affordable binding can afford.
    var plan = session.orderAutoBindings(autoBindings, snapshot && snapshot.visibleUnits, autoCursor);
    try {
      var result = game.autoBuy(plan.ordered, Date.now(), {reserve: reserveTarget});
      // A purchase leaves the engine caches cold. The next tick presents it so the purchase
      // and the costly snapshot after it never share one frame.
      if (result.ok) {
        lastHoldReason = '';
        autoCursor = plan.start + result.index + 1;
        lastSnapshotAt = 0;
        if (compact && !critters && el('quick-auto') && !el('quick-auto').hidden) flash(el('quick-auto').querySelector('.keycap'), 'keylit');
      } else {
        lastHoldReason = result && result.holdReason ? theme.text(result.holdReason) : '';
      }
      if (result.woke) stirring = true;
    } catch (error) { message('Auto-buy failed: ' + error.message); }
    return true;
  }
  function updateExclusions() {
    if (!habitat) return;
    // Reading rectangles forces layout, so only measure when something that moves them changed.
    var signature = [compact, critters, standalone, el('next-eta').hidden, corner, view, tab, page, lastListSignature, lastTabSignature, censusSignature, el('resources').children.length, window.innerWidth, window.innerHeight].concat(['milestone', 'unit-intro', 'key-help', 'hint-card', 'dialog', 'save-warning'].map(function (id) { return el(id).hidden; })).join('|');
    if (signature === exclusionSignature) return;
    exclusionSignature = signature;
    var rects = [panel];
    if (!el('milestone').hidden) rects.push(el('milestone'));
    if (!el('unit-intro').hidden) rects.push(el('unit-intro'));
    if (!el('key-help').hidden) rects.push(el('key-help'));
    if (!el('hint-card').hidden) rects.push(el('hint-card'));
    if (!el('dialog').hidden) rects.push(el('dialog'));
    habitat.setExclusions(rects.map(function (element) { var rect = element.getBoundingClientRect(); return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}; }));
  }
  function selectTab(id) {
    tab = id;
    page = 0;
    lastListSignature = '';
    refresh();
  }
  function remember() {
    var key = focusKey();
    var prior = memory[view] && memory[view].focus;
    var focus = key === 'close' || (key && key.indexOf('view-') === 0) ? prior : key;
    memory[view] = {tab: tab, page: page, focus: focus};
  }
  function restoreFocus() {
    var key = memory[view] && memory[view].focus;
    if (!key || key === 'close' || key.indexOf('view-') === 0 || !focusByKey(key)) primaryFocus();
  }
  function selectView(id) {
    remember();
    var saved = memory[id] || {};
    view = id;
    if (view === 'more') tab = '__journal';
    else if (view === 'evolution') tab = '__evolution';
    else tab = saved.tab || (tab.indexOf('__') === 0 ? '' : tab);
    page = saved.page || 0;
    lastListSignature = '';
    refresh();
  }
  function paneSpendsResource(resourceId) {
    if (compact) {
      return quickPicks.some(function (pick) {
        return pick && resourceId === 'territory' && (pick.id === 'expansion' || pick.id === 'achievementbonus');
      });
    }
    if (view === 'evolution') return false;
    if (view === 'upgrades' && tab === 'larva' && resourceId === 'territory') {
      var upIds = snapshot.visibleUpgradeIds || [];
      if (upIds.indexOf('expansion') !== -1 || upIds.indexOf('achievementbonus') !== -1) return true;
    }
    if ((view === 'units' || view === 'upgrades') && snapshot.items && tab.indexOf('__') !== 0) {
      var kind = view === 'upgrades' ? 'upgrade' : 'unit';
      return snapshot.items.some(function (item) {
        return item.visible !== false && item.tab === tab && item.kind === kind &&
          (item.costs || []).some(function (c) { return c.id === resourceId; });
      });
    }
    return false;
  }
  function renderResources() {
    var container = el('resources');
    var hasMutagen = !compact && view === 'evolution' && snapshot.resources.some(function (r) { return r.id === 'mutagen'; });
    snapshot.resources.forEach(function (resource, index) {
      var item = container.children[index];
      if (!item) {
        item = node('div', 'resource');
        item._strong = node('strong');
        item._label = node('span', 'label');
        item._rate = node('span', 'rate');
        item.appendChild(item._strong);
        item.appendChild(item._label);
        item.appendChild(item._rate);
        container.appendChild(item);
      }
      var strong = item._strong || item.querySelector('strong');
      var label = item._label || item.querySelector('.label');
      var rate = item._rate || item.querySelector('.rate');
      // The pixel icon sits between figure and label; it is redrawn once the illustrated sheet arrives.
      if (item.getAttribute('data-resource') !== resource.id || resourceIcons) {
        item.setAttribute('data-resource', resource.id);
        var old = item.querySelector('.sprite-icon');
        if (old) item.removeChild(old);
        var icon = pixelIcon('resource', resource.id, 32);
        if (icon) item.insertBefore(icon, label);
      }
      text(strong, resource.id === 'larva' || resource.id === 'cocoon' ? whole(resource.amount) : short(resource.amount));
      stampMagnitude(strong, 'resource:' + resource.id);
      text(label, theme.label(resource.id, resource.name));
      text(rate, short(resource.rate) + ' / sec');
      var resourceTitle = theme.label(resource.id, resource.name);
      if (item.title !== resourceTitle) item.title = resourceTitle;
      var contextual = compact ? paneSpendsResource(resource.id)
        : view === 'evolution' ? resource.id === 'mutagen' || (resource.id === 'energy' && !hasMutagen)
        : (view === 'units' || view === 'upgrades') && (resource.id === tab || paneSpendsResource(resource.id));
      var hide = !standalone && index >= 2 && !contextual;
      if (item.hidden !== hide) item.hidden = hide;
    });
    while (container.children.length > snapshot.resources.length) container.removeChild(container.lastChild);
    resourceIcons = false;
  }
  function purchaseTabs() {
    var kind = view === 'units' ? 'unit' : 'upgrade';
    var tabs = snapshot.tabs.filter(function (entry) { return entry.kinds ? entry.kinds.indexOf(kind) !== -1 : snapshot.items.some(function (item) {
      return item.tab === entry.id && item.kind === kind && item.visible !== false && !(kind === 'unit' && item.id === 'larva' && !item.available);
    }); });
    return tabs.length ? tabs : snapshot.tabs.slice(0, 1);
  }
  function renderTabs() {
    el('tabs').hidden = view !== 'units' && view !== 'upgrades';
    if (el('tabs').hidden) return;
    var tabs = purchaseTabs();
    el('tabs').hidden = tabs.length <= 1;
    if (tabs.length && !tabs.some(function (entry) { return entry.id === tab; })) tab = tabs[0].id;
    var signature = JSON.stringify(tabs);
    if (signature !== lastTabSignature) {
      var focus = focusKey();
      el('tabs').textContent = '';
      tabs.forEach(function (entry) {
        var button = node('button', '', theme.tabLabel(entry.id, entry.label));
        button.setAttribute('role', 'tab');
        button.setAttribute('data-focus', 'tab-' + entry.id);
        button.setAttribute('data-tab', entry.id);
        button.onclick = function () { selectTab(entry.id); };
        el('tabs').appendChild(button);
      });
      lastTabSignature = signature;
      focusByKey(focus);
    }
    Array.prototype.forEach.call(el('tabs').children, function (button) {
      var active = button.getAttribute('data-tab') === tab;
      button.classList.toggle('active', active);
      var selected = String(active);
      if (button.getAttribute('aria-selected') !== selected) button.setAttribute('aria-selected', selected);
      if (active && tvShell.scrollTabIntoView) tvShell.scrollTabIntoView(button);
    });
  }
  function renderList() {
    var journal = tab === '__journal';
    var achievements = tab === '__achievements';
    var visitors = tab === '__visitors';
    var chronicle = tab === '__chronicle';
    var evolution = view === 'evolution';
    var size = pageSize();
    el('items').hidden = journal || achievements || evolution || visitors || chronicle;
    el('achievements').hidden = !achievements;
    el('visitors').hidden = !visitors;
    if (el('chronicle')) el('chronicle').hidden = !chronicle;
    el('colony-settings').classList.toggle('listing', visitors || achievements || chronicle);
    el('show-visitors').hidden = visitors || achievements || chronicle || !visitorList().length;
    if (el('show-chronicle')) el('show-chronicle').hidden = visitors || achievements || chronicle;
    el('colony-settings').hidden = view !== 'more';
    el('evolution').hidden = !evolution;
    el('show-achievements').hidden = achievements || visitors || chronicle || !(snapshot.earnedAchievementCount || snapshot.achievements.some(function (entry) { return entry.earned; }) || feats().some(function (entry) { return entry.earned; }));
    el('show-journal').hidden = !achievements && !visitors && !chronicle;
    if (visitors) { el('buy-options').hidden = true; renderVisitors(); return; }
    if (chronicle) { el('buy-options').hidden = true; renderChronicle(); return; }
    el('buy-options').hidden = view !== 'units' && view !== 'upgrades';
    var ids = !achievements && snapshot.itemIds;
    var allAchievements = achievements ? snapshot.achievements.concat(feats()) : null;
    var entries = achievements ? orderedAchievements(allAchievements) : ids || snapshot.items.filter(function (item) { return item.visible !== false && item.tab === tab && item.kind === (view === 'upgrades' ? 'upgrade' : 'unit'); });
    // The source lists items oldest first; show the latest unlocks on top.
    if (!achievements) entries = entries.slice().reverse();
    var pages = Math.max(1, Math.ceil(entries.length / size));
    page = Math.min(page, pages - 1);
    el('pagination').hidden = journal || evolution || pages === 1;
    text(el('page-label'), (page + 1) + ' / ' + pages + (achievements ? ' · ' + allAchievements.filter(function (a) { return a.earned; }).length + ' / ' + allAchievements.length + ' earned' : ''));
    el('previous').disabled = page === 0;
    el('next').disabled = page >= pages - 1;
    if (journal || evolution) return;
    var visible = entries.slice(page * size, (page + 1) * size);
    if (ids) visible = visible.map(function (id) { return snapshot.items.filter(function (item) { return item.id === id; })[0]; }).filter(Boolean);
    var signature = JSON.stringify([view, tab, page, size, visible.map(function (entry) { return entry.kind + ':' + entry.id; }), details]);
    var focus = focusKey();
    var container = achievements ? el('achievements') : el('items');
    var focusRow = -1;
    var focusRole = '';
    if (signature !== lastListSignature) {
      // Remember the row and control so a rebuilt list keeps the remote's place.
      Array.prototype.forEach.call(container.children, function (row, index) {
        if (!row.contains(document.activeElement)) return;
        focusRow = index;
        focusRole = ['buy', 'auto-toggle', 'details'].filter(function (role) { return document.activeElement.classList.contains(role); })[0] || 'buy';
      });
      container.textContent = '';
      listBuilds++;
    }
    if (!visible.length && signature !== lastListSignature) container.appendChild(node('p', 'empty', 'The colony has no actions here yet. Follow the next goal to unlock more.'));
    visible.forEach(function (entry, index) {
      if (achievements) {
        if (signature === lastListSignature) {
          var current = container.children[index];
          current.classList.toggle('locked', !entry.earned);
          text(current.querySelector('strong'), entry.summary ? entry.name : achievementName(entry.id, entry.name));
          text(current.querySelector('span'), achievementStatus(entry));
          text(current.querySelector('p'), theme.text(entry.description));
          setSegments(current.querySelector('.achievement-bar'), achievementProgress(entry));
          return;
        }
        var achievement = node('article', 'achievement' + (entry.earned ? '' : ' locked'));
        var trophy = entry.id === 'colony:intruder1' || entry.id === 'colony:intruder5' ? pixelIcon('meta', 'intruderShield', 32) || pixelIcon('meta', 'achievement', 32) : pixelIcon('meta', 'achievement', 32);
        if (trophy) achievement.appendChild(trophy);
        achievement.appendChild(node('strong', '',entry.summary ? entry.name : achievementName(entry.id, entry.name)));
        achievement.appendChild(node('span', '', achievementStatus(entry)));
        achievement.appendChild(node('p', '', theme.text(entry.description)));
        var meter = segmentBar('achievement-bar');
        meter.setAttribute('aria-label', 'Progress toward ' + achievementName(entry.id, entry.name));
        setSegments(meter, achievementProgress(entry));
        achievement.appendChild(meter);
        container.appendChild(achievement);
        return;
      }
      var available = entry.batchAvailable === undefined ? entry.available : entry.batchAvailable;
      var batch = entry.batchQuantityLabel ? short(entry.batchQuantityLabel) : entry.batchQuantity === undefined ? (quantity === 'max' ? 'max' : quantity) : whole(entry.batchQuantity);
      var cost = costLine(entry);
      var impactText = entry.kind === 'upgrade' && entry.impact ? ' Impact: ' + shortNumbers(theme.text(entry.impact)) + '.' : '';
      var descriptionText = theme.text(entry.description) + impactText + (entry.batchOwnedGain && entry.batchOwnedGain !== entry.batchQuantity ? ' This purchase adds ' + (entry.batchOwnedGainLabel || whole(entry.batchOwnedGain)) + ' including offspring bonuses.' : '');
      var actionLabel = entry.kind === 'upgrade' ? (quantity === 1 ? 'Upgrade' : 'Upgrade ' + batch) : 'Buy ' + batch;
      if (quantity === 'max' && entry.batchQuantity !== undefined) actionLabel = 'Max ' + batch;
      var article = container.children[index];
      if (signature === lastListSignature && article) {
        // A row that becomes affordable while watched underlines its Buy once per session.
        var opened = available && article.classList.contains('locked') && article.getAttribute('data-quantity') === String(quantity) && !swept[entry.kind + ':' + entry.id];
        article.setAttribute('data-quantity', String(quantity));
        article.classList.toggle('locked', !available);
        if (opened) { swept[entry.kind + ':' + entry.id] = true; flash(article.querySelector('.buy'), 'sweep'); }
        text(article.querySelector('.owned'), '× ' + whole(entry.owned));
        if (entry.kind === 'unit') {
          var rateNode = article.querySelector('.unit-rate');
          if (rateNode) {
            var hasVel = !!(entry.velocity && entry.velocity !== '0');
            text(rateNode, hasVel ? '+' + short(entry.velocity) + '/s' : '');
            if (rateNode.hidden !== !hasVel) rateNode.hidden = !hasVel;
          }
        }
        renderCost(article.querySelector('.cost'), entry, cost);
        setSegments(article.querySelector('.row-bar'), available ? null : costProgress(entry.costs));
        var existing = article.querySelector('.buy');
        text(existing, available ? actionLabel : 'Need more');
        existing.setAttribute('aria-disabled', String(!available));
        existing.setAttribute('aria-label', actionLabel + ' ' + rowName(entry) + ', ' + cost);
        text(article.querySelector('.description'), descriptionText);
        if (entry.kind === 'upgrade') text(article.querySelector('.brief'), briefText(entry));
        var autoButton = article.querySelector('.auto-toggle');
        autoButton.classList.toggle('active', boundIndex(entry.kind, entry.id) !== -1);
        autoButton.setAttribute('aria-pressed', String(boundIndex(entry.kind, entry.id) !== -1));
        var pinBtn = article.querySelector('.pin-toggle');
        if (pinBtn) {
          pinBtn.classList.toggle('active', isPinned(entry.kind, entry.id));
          text(pinBtn, isPinned(entry.kind, entry.id) ? 'Unpin quick-buy' : 'Pin to quick-buy');
        }
        var resBtn = article.querySelector('.reserve-toggle');
        if (resBtn) {
          resBtn.classList.toggle('active', isReserved(entry.kind, entry.id));
          text(resBtn, isReserved(entry.kind, entry.id) ? 'Saving (clear)' : 'Save toward');
        }
        return;
      }
      var expanded = !!details[entry.kind + '-' + entry.id];
      article = node('article', 'item' + (available ? '' : ' locked') + (expanded ? ' open' : ''));
      article.setAttribute('data-item', entry.id);
      article.setAttribute('data-kind', entry.kind);
      article.setAttribute('data-quantity', String(quantity));
      // Every control in a row shares one line so Up/Down keeps a steady column.
      var heading = node('div', 'item-head');
      heading.appendChild(node('span', 'row-number', index + 1));
      if (entry.kind === 'upgrade') {
        var icon = pixelIcon('upgrade', entry.id, 32);
        if (!icon) {
          icon = node('span', 'item-icon upgrade-icon');
          icon.setAttribute('aria-hidden', 'true');
        }
        heading.appendChild(icon);
      } else heading.appendChild(unitIcon(entry.id, 32));
      heading.appendChild(node('h2', '', rowName(entry)));
      var detailButton = node('button', 'details', expanded ? '−' : '+');
      detailButton.setAttribute('aria-label', 'Details for ' + rowName(entry));
      detailButton.title = '8: Toggle details';
      detailButton.setAttribute('data-focus', 'details-' + entry.kind + '-' + entry.id);
      detailButton.setAttribute('aria-expanded', String(expanded));
      detailButton.onclick = function () { details[entry.kind + '-' + entry.id] = !expanded; render(); };
      heading.appendChild(detailButton);
      if (entry.kind === 'unit') {
        var ownedBox = node('span', 'owned-box');
        ownedBox.appendChild(node('span', 'owned', '× ' + whole(entry.owned)));
        var hasUnitVel = !!(entry.velocity && entry.velocity !== '0');
        var unitRate = node('span', 'unit-rate', hasUnitVel ? '+' + short(entry.velocity) + '/s' : '');
        unitRate.hidden = !hasUnitVel;
        ownedBox.appendChild(unitRate);
        heading.appendChild(ownedBox);
      } else {
        heading.appendChild(node('span', 'owned', '× ' + whole(entry.owned)));
      }
      var autoButton = node('button', 'auto-toggle', 'Auto');
      autoButton.title = '5: Toggle auto-buy';
      autoButton.setAttribute('data-focus', 'auto-' + entry.kind + '-' + entry.id);
      autoButton.setAttribute('aria-label', 'Toggle auto-buy for ' + rowName(entry));
      autoButton.setAttribute('aria-pressed', String(boundIndex(entry.kind, entry.id) !== -1));
      autoButton.classList.toggle('active', boundIndex(entry.kind, entry.id) !== -1);
      autoButton.onclick = function () { toggleAuto(entry.kind, entry.id); };
      heading.appendChild(autoButton);
      // Unaffordable rows stay focusable so remote navigation never skips a row.
      var button = node('button', 'buy', available ? actionLabel : 'Need more');
      button.setAttribute('aria-disabled', String(!available));
      button.setAttribute('data-focus', 'buy-' + entry.id);
      button.setAttribute('aria-label', actionLabel + ' ' + rowName(entry) + ', ' + cost);
      button.onclick = function () {
        if (button.getAttribute('aria-disabled') === 'true') {
          var prodHint = entry.bottleneck && entry.bottleneck.producer
            ? ' Need ' + theme.label(entry.bottleneck.id, entry.bottleneck.name) + ' (' + producerLabel(entry.bottleneck.producer) + ').'
            : '';
          message('Not enough yet for ' + theme.label(entry.id, entry.name) + '.' + prodHint);
          flash(button, 'nudge');
        } else act(entry.kind, entry.id);
      };
      heading.appendChild(button);
      article.appendChild(heading);
      if (entry.kind === 'upgrade') {
        var brief = node('p', 'brief', briefText(entry));
        brief.hidden = expanded;
        article.appendChild(brief);
      }
      var costNode = node('div', 'cost');
      renderCost(costNode, entry, cost);
      article.appendChild(costNode);
      var description = node('p', 'description', descriptionText);
      description.hidden = !expanded;
      article.appendChild(description);
      var rowTools = node('div', 'row-tools');
      rowTools.hidden = !expanded;
      var pinButton = node('button', 'pin-toggle' + (isPinned(entry.kind, entry.id) ? ' active' : ''), isPinned(entry.kind, entry.id) ? 'Unpin quick-buy' : 'Pin to quick-buy');
      pinButton.setAttribute('data-focus', 'pin-' + entry.kind + '-' + entry.id);
      pinButton.onclick = function () { togglePin(entry.kind, entry.id); };
      var reserveButton = node('button', 'reserve-toggle' + (isReserved(entry.kind, entry.id) ? ' active' : ''), isReserved(entry.kind, entry.id) ? 'Saving (clear)' : 'Save toward');
      reserveButton.setAttribute('data-focus', 'reserve-' + entry.kind + '-' + entry.id);
      reserveButton.onclick = function () { toggleReserve(entry.kind, entry.id); };
      rowTools.appendChild(pinButton);
      rowTools.appendChild(reserveButton);
      article.appendChild(rowTools);
      var meter = segmentBar('row-bar');
      meter.setAttribute('aria-label', 'Saved toward the next ' + theme.label(entry.id, entry.name));
      setSegments(meter, available ? null : costProgress(entry.costs));
      article.appendChild(meter);
      container.appendChild(article);
    });
    var rebuilt = signature !== lastListSignature;
    lastListSignature = signature;
    if (rebuilt && !focusByKey(focus) && focusRow !== -1 && container.children.length) {
      var row = container.children[Math.min(focusRow, container.children.length - 1)];
      var fallback = row.querySelector('.' + focusRole) || row.querySelector('button');
      if (fallback) fallback.focus();
    }
  }
  function render() {
    if (!snapshot || closed) return;
    var pop = String(snapshot.population);
    // Bound visible work regardless of the arbitrary-precision population.
    var parsed = pop.replace(/,/g, '').match(/^([\d.]+(?:e[+-]?\d+)?)\s*([kmbt]?)/i);
    var scale = {k: 1000, m: 1000000, b: 1000000000, t: 1000000000000};
    var size = parsed ? Number(parsed[1]) * (scale[parsed[2].toLowerCase()] || 1) : 0;
    spriteCount = Math.min(18, Math.max(1, isFinite(size) ? Math.ceil(Math.log(size + 1) / Math.LN2) + 1 : 18));
    if (!compact) {
      if (view === 'evolution' && !(snapshot.prestige && snapshot.prestige.unlocked)) { view = 'units'; tab = ''; }
      renderTabs();
      renderList();
      Array.prototype.forEach.call(el('menu-views').children, function (button) {
        var id = button.getAttribute('data-view');
        button.classList.toggle('active', id === view);
        button.hidden = id === 'evolution' && !(snapshot.prestige && snapshot.prestige.unlocked);
        if (id === 'upgrades' && snapshot.tabs.some(function (entry) { return entry.kinds; })) button.hidden = !snapshot.tabs.some(function (entry) { return entry.kinds && entry.kinds.indexOf('upgrade') !== -1; });
      });
      var prestige = snapshot.prestige || {};
      var ascent = prestige.preview;
      var planner = ascent && ascent.planner;
      var plannerText = '';
      if (planner) {
        if (Array.isArray(planner.thresholds) && planner.thresholds.length) {
          plannerText += ' Next thresholds: ' + planner.thresholds.map(function (t) {
            return upgradeName(t.id, t.name) + ' ' + t.level + ' (+' + t.gain + ')';
          }).join(', ') + '.';
        }
        if (planner.warpImpact) {
          plannerText += ' ' + theme.text(planner.warpImpact) + '.';
        }
      }
      text(el('prestige-description'), shortNumbers(theme.text((prestige.description || 'Grow the colony to unlock ascension.') + plannerText)));
      text(el('ascensions'), snapshot.ascensions + ' ascensions' + (ascent && ascent.banked ? ' · ' + shortNumbers(theme.text(ascent.banked)) : ''));
      var ratio = prestige.rewardRatio ? ' (×' + short(prestige.rewardRatio) + ' vs last ascension)' : '';
      text(el('prestige-cost'), shortNumbers(theme.text(ascent ? 'Ascend now for +' + ascent.gain + ' mutagen' + ratio + '. ' + ascent.energy : (prestige.cost ? 'Cost: ' + prestige.cost + '. ' : '') + (prestige.reward ? 'Reward: +' + prestige.reward + ratio : ''))));
      text(el('prestige-preview'), ascent ? shortNumbers(theme.text(ascent.keeps + (ascent.next ? ' ' + ascent.next : ''))) : '');
      el('prestige-preview').hidden = !ascent;
      el('ascend').disabled = !prestige.available;
      var respec = snapshot.respec;
      el('respec').hidden = respec ? !respec.unlocked : !Number(snapshot.ascensions);
      el('respec').disabled = respec ? !respec.available : false;
    }
    if (!critters) {
      renderResources();
      renderCensus();
      renderEta();
    }
    renderQuick();
    renderRedCue();
    renderSaveStatus();
    text(el('countdown'), deadline ? 'Closes in ' + Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) + 's' : '');
  }
  // Compact quick-buy: keys 1-5 buy five picks chosen from the live colony (docs/ui-spec.md).
  var quickKey = session.quickKey;
  function quickName(pick) { return pick.kind === 'upgrade' ? upgradeName(pick.id, pick.name) : theme.label(pick.id, pick.name); }
  function renderQuick() {
    var strip = el('quick');
    var showing = compact && !critters && !!snapshot.quickSlots && quickPicks.some(Boolean);
    if (strip.hidden !== !showing) strip.hidden = !showing;
    if (quickNoteUntil && (!showing || Date.now() >= quickNoteUntil)) { quickNoteUntil = 0; el('quick-note').hidden = true; stopFlash(el('quick-note')); }
    if (!showing) { quickSeen = null; quickButtons.forEach(quietPick); return; }
    var have = quickButtons.length;
    if (have < quickPicks.length) {
      for (var slot = have; slot < quickPicks.length; slot++) {
        var button = node('button', 'quick-pick');
        button.tabIndex = -1;
        button._keycap = node('span', 'keycap', slot + 1);
        button._icon = node('span', 'quick-icon');
        button._badge = node('span', 'quick-badge');
        button._bar = segmentBar('quick-bar', 5);
        button._rise = node('canvas', 'quick-rise');
        button._rise.setAttribute('aria-hidden', 'true');
        button.appendChild(button._keycap);
        button.appendChild(button._icon);
        button.appendChild(button._badge);
        button.appendChild(button._bar);
        button.appendChild(button._rise);
        button.onclick = quickBuy.bind(null, slot);
        strip.insertBefore(button, el('quick-auto') || el('quick-watch') || el('quick-hint'));
        quickButtons.push(button);
      }
      pixelText(el('quick-hint').querySelector('canvas'), '?');
      paintTvIcon();
    }
    var seen = quickSeen;
    quickSeen = [];
    quickPicks.forEach(function (pick, slot) {
      var button = quickButtons[slot];
      var before = seen && seen[slot];
      quickSeen[slot] = pick && {key: quickKey(pick), affordable: pick.affordable};
      if (!pick) { if (!button.hidden) { quietPick(button); button.hidden = true; } return; }
      if (button.hidden) button.hidden = false;
      if (button.getAttribute('data-pick') !== quickKey(pick) || quickIcons) {
        button.setAttribute('data-pick', quickKey(pick));
        var holder = button._icon;
        holder.textContent = '';
        // The atlas cell's true size keeps the art crisp; its art fills about the middle 48 px, which the CSS shows.
        var icon = pick.kind === 'unit' ? unitIcon(pick.id, 64) : pixelIcon('upgrade', pick.id, 64);
        if (!icon) { icon = node('span', 'item-icon upgrade-icon'); icon.setAttribute('aria-hidden', 'true'); }
        holder.appendChild(icon);
      }
      // A slot that changes pick names its new item; one that just became affordable pulses once.
      if (before && before.key !== quickKey(pick)) quickNote(slot, quickName(pick));
      else if (before && !before.affordable && pick.affordable) flash(button, 'ready');
      var gets = pick.affordable && pick.gain && pick.gain !== '0' ? '×' + short(pick.gain) : '';
      var label = (slot + 1) + ': ' + quickName(pick) + (gets ? ', buys ' + gets.slice(1) : ' (saving up)');
      if (button.title !== label) { button.title = label; button.setAttribute('aria-label', label); }
      button.classList.toggle('short', !pick.affordable);
      button.classList.toggle('pinned', !!pick.pinned);
      var badge = button._badge;
      text(badge, gets);
      if (badge.hidden !== !gets) badge.hidden = !gets;
      badge.classList.toggle('long', gets.length > 6);
      setSegments(button._bar, pick.affordable ? null : pick.progress);
    });
    quickIcons = false;
    var auto = el('quick-auto');
    if (auto) {
      var autoInfo = session.inspectAuto(autoBindings, autoPaused, reserveTarget, snapshot, lastHoldReason);
      auto.hidden = !autoBindings.length;
      auto.classList.toggle('paused', !!autoPaused);
      auto.classList.toggle('waiting', autoInfo.state === 'waiting');
      if (auto.getAttribute('data-state') !== autoInfo.state) auto.setAttribute('data-state', autoInfo.state);
      var autoLabel = '6: Auto-buy (' + autoInfo.count + ') · ' + (autoPaused ? 'paused' : theme.text(autoInfo.reason));
      if (auto.title !== autoLabel) { auto.title = autoLabel; auto.setAttribute('aria-label', autoLabel); }
    }
  }
  // A pick that hides mid-moment would replay it when it shows again, so hiding drops its moments.
  function quietPick(button) {
    [button, button._icon || button.querySelector('.quick-icon'), button._keycap || button.querySelector('.keycap'), button._rise || button.querySelector('.quick-rise')].forEach(stopFlash);
  }
  // The strip's one line of text: a new pick's name, or how long a short pick will take. It holds about two
  // seconds and fades in CSS; the next render after that hides it.
  function quickNote(slot, value) {
    var note = el('quick-note');
    text(note.firstChild, typeof slot === 'number' ? slot + 1 : slot);
    text(note.lastChild, value);
    note.hidden = false;
    quickNoteUntil = Date.now() + 2000;
    flash(note, 'note');
  }
  // The painted CRT; in watch mode its screen glows amber, in standalone it shows the habitat's green.
  var tvArt = new Image();
  tvArt.onload = function () { paintTvIcon(); };
  tvArt.src = 'ui-art/quick_tv_mode.png';
  function paintTvIcon() {
    var button = el('quick-watch');
    var canvas = button && button.querySelector('canvas');
    if (!canvas || !tvArt.complete || !tvArt.naturalWidth) return;
    canvas.width = 32;
    canvas.height = 32;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 32, 32);
    ctx.drawImage(tvArt, 0, 0);
    if (!watchMode && !standalone) return;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = watchMode ? 'rgba(222,168,84,.8)' : 'rgba(97,140,70,.7)';
    ctx.fillRect(8, 16, 11, 10);
    ctx.globalCompositeOperation = 'source-over';
  }
  // A roach slot buys as many as stock allows and an upgrade slot one level, whatever the menu's 1, 10 or Max.
  // A short pick says how long it will take instead. In critters only nothing is shown, so nothing is bought.
  function quickBuy(slot) {
    if (critters) return;
    var pick = quickPicks[slot];
    if (!pick) { message('Nothing to buy on ' + (slot + 1) + ' yet.'); return; }
    var button = quickButtons[slot] || el('quick').querySelectorAll('.quick-pick')[slot];
    var amount = pick.kind === 'unit' ? 'max' : 1;
    // The pick may have become affordable since the last refresh; the ETA asks the colony as it is now.
    var eta = pick.affordable ? null : game.quickEta(pick.kind, pick.id, Date.now());
    if (!eta || eta.ready) {
      var result = act(pick.kind, pick.id, amount);
      rememberQuantity(result, amount);
      if (result && result.ok) {
        if (button) {
          flash(button._icon || button.querySelector('.quick-icon'), 'bump');
          flash(button._keycap || button.querySelector('.keycap'), 'keylit');
          var rise = button._rise || button.querySelector('.quick-rise');
          if (result.purchase) { pixelText(rise, '+' + short(result.purchase.quantityLabel)); flash(rise, 'rise'); }
        }
        return;
      }
      if (!eta) eta = game.quickEta(pick.kind, pick.id, Date.now());
    }
    wake();
    if (eta) quickNote(slot, eta.label ? 'Ready in ' + eta.label : 'Not enough yet');
    if (button) flash(button, 'nudge');
  }
  // The line under the footer: the next role's wait, or while the nest is dormant how to wake it.
  function renderEta() {
    var eta = compact && snapshot.nextEta;
    var goal = compact && !eta && snapshot.dormant && snapshot.nextGoal;
    text(el('next-eta'), eta ? 'Next ' + theme.label(eta.id, eta.name) + ' ~ ' + eta.label : goal ? theme.text(goal) : '');
    if (el('next-eta').hidden !== !(eta || goal)) el('next-eta').hidden = !(eta || goal);
  }
  // Key 0 and More's Hint button: the original tutorial's step for this colony and the next goal, on a pinned
  // card near the controls for ten seconds. The engine works the step out only when asked. The quick pick the
  // goal points at, if the strip holds it, pulses once.
  function showHint() {
    if (closed || document.hidden || critters || !game) return;
    var hinted;
    try { hinted = game.snapshot(Date.now(), {quantity: quantity, includeItems: false, includeAchievements: false, includeHint: true}); }
    catch (error) { message('Hint failed: ' + error.message); return; }
    var card = el('hint-card');
    text(card.querySelector('p'), theme.text(hinted.hint ? hinted.hint.text : ''));
    text(card.querySelector('.hint-goal'), hinted.nextGoal ? 'Next goal: ' + theme.text(hinted.nextGoal) : '');
    card.querySelector('p').hidden = !hinted.hint;
    ['key-help', 'unit-intro', 'milestone', 'local-hint'].forEach(function (id) { el(id).hidden = true; });
    milestoneUntil = 0;
    card.hidden = false;
    hintCardUntil = Date.now() + 10000;
    wake();
    var target = hinted.nextGoalTarget;
    var slot = target && compact ? quickPicks.map(quickKey).indexOf(target.kind + ':' + target.id) : -1;
    if (slot !== -1) flash(el('quick').querySelectorAll('.quick-pick')[slot], 'beckon');
    updateExclusions();
  }
  function toggleHint() { if (el('hint-card').hidden) showHint(); else closeHint(); }
  function closeHint() {
    hintCardUntil = 0;
    if (el('hint-card').hidden) return;
    el('hint-card').hidden = true;
    updateExclusions();
  }
  // A brand-new colony shows its first hint once, on the first refresh after it opens. Reset progress clears
  // the milestone history, so the next new colony shows it again.
  function openingHint() {
    if (!snapshot.dormant || milestoneSeen['hint:opening'] || !simulationTimer || closed || document.hidden || critters) return;
    milestoneSeen['hint:opening'] = true;
    if (store) store.saveMilestones(milestoneSeen);
    showHint();
  }
  function wake() {
    lastInputAt = Date.now();
    if (dimmed) { dimmed = false; panel.classList.remove('dim'); syncQuiet(); }
  }
  function syncQuiet() {
    if (habitat && habitat.setQuiet) habitat.setQuiet((dimmed || watchMode) && !standalone);
  }
  // OLED care: static text dims after a minute without input, and the compact overlay drifts
  // a few pixels every three minutes. Quiet watching drifts further. A transform moves it without a layout.
  function guardBurnIn(now) {
    if (standalone) return;
    if (!dimmed && now - lastInputAt >= 60000) { dimmed = true; panel.classList.add('dim'); syncQuiet(); }
    if (now - lastShiftAt >= 180000) { lastShiftAt = now; shiftIndex = (shiftIndex + 1) % shifts.length; applyShift(); }
  }
  function applyShift() {
    tvShell.applyShift(panel, shiftIndex, compact, dimmed, watchMode, standalone);
  }
  function setWatch(value) {
    watchMode = !!value;
    if (watchMode && standalone) {
      standalone = false;
      document.body.classList.remove('standalone');
      var modeButton = el('standalone-view');
      if (modeButton) modeButton.textContent = 'Standalone view';
      if (habitat && habitat.setStandalone) habitat.setStandalone(false);
      lastListSignature = '';
      censusSignature = null;
      quotedIds = [];
    }
    panel.classList.toggle('watch', watchMode);
    if (watchMode) {
      compact = true;
      critters = false;
      panel.classList.add('compact');
      panel.classList.remove('critters');
      holdRemote(false);
      stopFlashes();
      closeDialog();
      closeHint();
    }
    var watch = el('quick-watch');
    if (watch) watch.setAttribute('aria-label', watchMode ? '8: Leave watch mode' : '8: TV mode');
    paintTvIcon();
    syncQuiet();
    applyShift();
    wake();
    refresh();
  }
  function setStandalone(value) {
    standalone = !!value;
    if (standalone && watchMode) { watchMode = false; panel.classList.remove('watch'); }
    document.body.classList.toggle('standalone', standalone);
    if (standalone && dimmed) { dimmed = false; panel.classList.remove('dim'); }
    var button = el('standalone-view');
    if (button) button.textContent = standalone ? 'TV overlay' : 'Standalone view';
    if (habitat && habitat.setStandalone) habitat.setStandalone(standalone);
    lastListSignature = '';
    censusSignature = null;
    quotedIds = [];
    paintTvIcon();
    syncQuiet();
    applyShift();
    if (game) refresh();
  }
  // Key 8 / LIST / the TV button on the quickbar toggles between normal TV overlay and subtle Watch TV mode.
  // Standalone terrarium mode is only entered from More (or ?standalone=1), and pressing 8 exits it back to TV.
  function cycleTvMode() {
    if (standalone) {
      setStandalone(false);
      setWatch(false);
    } else {
      setWatch(!watchMode);
    }
  }
  // Critters only: the roaches and nest with no text at all. It never holds the remote.
  function setCritters(value) {
    critters = value;
    if (critters && watchMode) { watchMode = false; panel.classList.remove('watch'); }
    magnitudes = {};
    panel.classList.toggle('critters', critters);
    if (critters) {
      stopFlashes();
      ['key-help', 'unit-intro', 'milestone', 'local-hint'].forEach(function (id) { el(id).hidden = true; });
      milestoneUntil = 0;
      closeHint();
    }
    holdRemote(false);
    wake();
    refresh();
  }
  // Compact mode leaves the remote with the app underneath; only the menu takes it.
  var remoteHold = tvShell.createRemoteHold({
    panel: panel,
    isClosed: function () { return closed; },
    isCompact: function () { return compact; }
  });
  var holdRemote = remoteHold.holdRemote;
  function setCompact(value) {
    compact = value;
    if (!compact) { watchMode = false; panel.classList.remove('watch'); }
    holdRemote(!compact);
    wake();
    critters = false;
    panel.classList.remove('critters');
    syncQuiet();
    applyShift();
    panel.classList.toggle('compact', compact);
    el('plus').textContent = compact ? '+' : '−';
    el('plus').title = compact ? 'Yellow or +: Open menu' : 'Close menu';
    el('plus').setAttribute('aria-label', compact ? 'Open colony menu' : 'Close colony menu');
    el('plus').setAttribute('aria-expanded', String(!compact));
    if (compact) {
      stopFlashes();
      closeDialog();
      remember();
      if (panel.contains(document.activeElement)) document.activeElement.blur();
    }
    refresh();
    if (!compact) restoreFocus();
  }
  function position() {
    tvShell.positionCorner(panel, el, corner);
    updateExclusions();
  }
  function closeDialog() {
    el('dialog').hidden = true;
    el('controller-panel').hidden = true;
    if (controllerLink) controllerLink.closePairing();
    el('save-text').value = '';
    dialogAction = null;
    focusByKey(dialogReturn);
  }
  function openDialog(title, description, action, text) {
    dialogReturn = focusKey();
    el('dialog-title').textContent = title;
    el('dialog-description').textContent = theme.text(description);
    el('save-text').hidden = text === undefined;
    el('save-text').readOnly = action === 'export' || action === 'exportDiagnostics';
    el('save-text').value = text || '';
    el('dialog-confirm').textContent = action === 'export' || action === 'exportDiagnostics' ? 'Download copy' : action === 'import' ? 'Import save' : action === 'reset' ? 'Continue' : action === 'resetConfirm' ? 'Reset colony' : 'Confirm';
    el('dialog-cancel').textContent = action === 'export' || action === 'exportDiagnostics' ? 'Close' : 'Cancel';
    el('dialog').hidden = false;
    el('unit-intro').hidden = true;
    el('key-help').hidden = true;
    el('milestone').hidden = true;
    milestoneUntil = 0;
    el('local-hint').hidden = true;
    panel.scrollTop = 0;
    el('dialog').scrollTop = 0;
    dialogAction = action;
    focusByKey(action === 'import' ? 'save-text' : 'dialog-cancel');
    updateExclusions();
  }
  function prestigeDialog(type) {
    var data = snapshot[type === 'ascend' ? 'prestige' : 'respec'] || {};
    openDialog(type === 'ascend' ? 'Ascend the colony?' : 'Respec mutations?', (data.description || 'Reassign your permanent mutations.') + (data.cost ? '\nCost: ' + data.cost : '') + (data.reward ? '\nReward: ' + data.reward : '') + (data.reset ? '\nResets: ' + data.reset : '') + (data.preserve ? '\nKeeps: ' + data.preserve : '') + '\nThis changes your colony. Confirm to continue.', type);
  }
  // Reset progress (More) asks twice, and each step opens on Cancel, so a stray OK never erases a colony.
  // Only this dialog reaches resetProgress: no key, launch parameter or phone command does.
  function resetDialog(second) {
    var back = dialogReturn;
    if (!second) openDialog('Reset progress?', 'Start over with a brand-new colony. This erases:\n· every unit and upgrade, and all crumbs, hatchlings, territory and energy\n· mutagen, mutations and ascensions\n· achievements, including the guest ones\n· the visitor log and the golden roach and intruder counts\n· auto-buy, the purchase Green repeats, quick-buy picks and milestone history\nKept: phone pairings, the 1, 10 or Max choice, corner and display level. A copy of this colony stays on the TV as a backup.', 'reset');
    else {
      openDialog('Erase this colony?', 'Last step. Everything listed before is erased and the colony starts again from the beginning. Choose Reset colony to confirm, or Cancel to keep playing.', 'resetConfirm');
      dialogReturn = back;
    }
  }
  function resetProgress() {
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = null;
    dirtySince = 0;
    var result = store.reset(game, Date.now(), {
      visitors: mechanics ? mechanics.log() : {},
      catches: mechanics ? mechanics.tally() : {},
      pin: pinnedQuick,
      reserve: reserveTarget,
      records: records,
      firstSeen: mechanics && mechanics.firstSeen ? mechanics.firstSeen() : firstSeen
    });
    if (!result.ok) { el('dialog-description').textContent = theme.text(result.message); return; }
    lastSave = Date.now();
    store.clearMeta();
    lastPurchase = null; autoBindings = []; autoPaused = false; autoCursor = 0; lastAscension = ''; flavorIndex = 0;
    pinnedQuick = null; reserveTarget = null; lastHoldReason = ''; expedition = null;
    records = {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''}; activity = []; firstSeen = {}; runStartedAt = Date.now();
    milestoneSeen = {}; milestoneReady = false; milestoneSignature = ''; milestoneQueue = []; milestoneUntil = 0; introUntil = 0;
    el('milestone').hidden = true; el('unit-intro').hidden = true; closeHint();
    dismissGuests();
    if (mechanics) {
      mechanics.load({});
      mechanics.loadTally({});
      if (mechanics.loadFirstSeen) mechanics.loadFirstSeen({});
      if (mechanics.loadExpedition) mechanics.loadExpedition(null);
    }
    syncKeepsakes();
    cachedFeats = null; featPoints = -1; syncFeatPoints();
    magnitudes = {}; swept = {}; details = {}; memory = {};
    quickState = session.createQuickState();
    quickPicks = quickState.picks;
    // Null never matches a signature, so even an empty census or list is redrawn.
    achievementOrder = {signature: null, rows: []}; visitorSignature = ''; chronicleSignature = ''; censusSignature = null; censusIds = null; lastListSignature = '';
    view = 'units'; tab = ''; page = 0;
    // Hiding and showing the habitat drops every guest, role and parade; the ceremony then files the old colony
    // into the nest and brings the new one out on the first nest stage.
    if (habitat) { habitat.setActive(false); habitat.setActive(!closed && !document.hidden); habitat.ascendCeremony(); }
    if (game.resume && !closed && !document.hidden) game.resume(Date.now());
    saveMessage = result.message;
    closeDialog();
    refresh();
    primaryFocus();
    notify({id: 'reset', title: 'A new colony begins.', description: 'The old colony is kept as a backup on this TV.'}, true);
  }
  function close() {
    if (closed) return;
    if (game && game.pause) game.pause(Date.now());
    dismissGuests();
    stopFlashes();
    magnitudes = {};
    persist();
    closed = true;
    el('milestone').hidden = true;
    el('unit-intro').hidden = true;
    el('key-help').hidden = true;
    el('local-hint').hidden = true;
    closeHint();
    panel.hidden = true;
    clearInterval(simulationTimer);
    simulationTimer = null;
    if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
    panel.classList.remove('waking');
    logEvent('info', 'mode', 'close');
    flushJournal();
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
    if (controllerLink) controllerLink.status();
    if (closingTimer) { clearTimeout(closingTimer); closingTimer = null; }
    if (!document.hidden && habitat && typeof habitat.skitterOut === 'function') {
      var finished = false;
      var finishClose = function () {
        if (finished) return;
        finished = true;
        if (closingTimer) { clearTimeout(closingTimer); closingTimer = null; }
        if (closed) {
          if (habitat) habitat.setActive(false);
          if (window.PalmSystem) window.close();
        }
      };
      closingTimer = setTimeout(finishClose, 450);
      if (!habitat.skitterOut(finishClose)) finishClose();
    } else {
      if (habitat) habitat.setActive(false);
      if (window.PalmSystem) window.close();
    }
  }
  var parseParams = tvShell.parseParams;
  // Updates only the visible resource and census counts on the alternate 500 ms beat between
  // full 1 Hz snapshots, so counters step 2x/s without doubling snapshot/render/habitat work.
  function tickHalfSecond() {
    tickMilestones();
    if (closed || document.hidden || critters || !snapshot || !game || typeof game.fastCounts !== 'function') return;
    var resList = el('resources').children;
    var cenList = el('census').children;
    var ids = [];
    var i, id;
    for (i = 0; i < resList.length; i++) {
      if (!resList[i].hidden && (id = resList[i].getAttribute('data-resource'))) ids.push(id);
    }
    if (!watchMode) {
      for (i = 0; i < cenList.length; i++) {
        if (!cenList[i].hidden && (id = cenList[i].getAttribute('data-unit'))) ids.push(id);
      }
    }
    if (!ids.length) return;
    var counts = game.fastCounts(ids, Date.now());
    for (i = 0; i < resList.length; i++) {
      id = resList[i].getAttribute('data-resource');
      if (counts[id] !== undefined && resList[i].firstChild) {
        text(resList[i].firstChild, id === 'larva' || id === 'cocoon' ? whole(counts[id]) : short(counts[id]));
      }
    }
    if (!watchMode) {
      for (i = 0; i < cenList.length; i++) {
        id = cenList[i].getAttribute('data-unit');
        if (counts[id] !== undefined) {
          var cStrong = cenList[i]._strong || cenList[i].querySelector('strong');
          if (cStrong) text(cStrong, whole(counts[id]));
        }
      }
    }
  }
  function startTimers() {
    if (!simulationTimer) simulationTimer = setInterval(function () {
      if (closed || document.hidden) return;
      if (deadline && Date.now() >= deadline) { close(); return; }
      guardBurnIn(Date.now());
      tickMechanics(Date.now());
      // A purchase, a reward, a save and a refresh each take a frame on the TV, so a tick
      // runs at most one of them. Full snapshots run at 1 Hz; the alternate 500 ms beat
      // updates the resource and census figures in place for 2x/s counter steps.
      if (autoTick()) return;
      if (payReward()) return;
      if (Date.now() - lastSave >= 15000) { persist(); return; }
      if (Date.now() - lastSnapshotAt < 900) { tickHalfSecond(); return; }
      refresh();
    }, 500);
  }
  function triggerWakeEntrance() {
    panel.classList.add('waking');
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = setTimeout(function () {
      wakeTimer = null;
      panel.classList.remove('waking');
    }, 750);
    if (habitat) habitat.closing = null;
    if (window.PalmSystem && habitat && habitat.skitterIn && !standalone) habitat.skitterIn();
  }
  function applyParams(input, relaunch) {
    var options = parseParams(input);
    if (controllerLink) controllerLink.params(options);
    // A phone's Show is idempotent: it never toggles or collapses an open colony.
    if (relaunch && options.controllerShow && !closed) return;
    // The Input Hook forwards colony keys here while compact mode leaves focus elsewhere.
    // Do not pulse needFocus here: the window already has needFocus=false, and pulsing it
    // steals and returns compositor focus on every key press.
    if (relaunch && options.remoteKey) { if (!closed) handleKey({keyCode: Number(options.remoteKey), target: document.body, preventDefault: function () {}}); return; }
    // webOS can keep a closed overlay running, so Blue must reopen it rather than close it again.
    if (relaunch && options.remoteToggle && !closed) { close(); return; }
    if (options.close) { close(); return; }
    var opening = closed || !relaunch;
    if (closingTimer) { clearTimeout(closingTimer); closingTimer = null; }
    if (standalone && !standaloneQuery) setStandalone(false);
    closed = false;
    panel.hidden = false;
    if (game && game.resume && !document.hidden) game.resume(Date.now());
    else if (game && game.pause) game.pause(Date.now());
    if (habitat) {
      habitat.closing = null;
      habitat.setActive(!document.hidden);
    }
    var match = corners.indexOf(options.corner);
    if (match !== -1) corner = match;
    position();
    wake();
    setCompact(options.compact !== false);
    if (opening) {
      logEvent('info', 'mode', 'open', {compact: compact, standalone: standalone, watch: watchMode});
      triggerWakeEntrance();
    }
    if (closeTimer) clearTimeout(closeTimer);
    var seconds = Number(options.autoCloseSeconds);
    if (!isFinite(seconds) || seconds <= 0) seconds = 0;
    seconds = Math.min(seconds, 120);
    deadline = seconds ? Date.now() + seconds * 1000 : 0;
    if (seconds) closeTimer = setTimeout(close, seconds * 1000);
    startTimers();
    render();
    if (controllerLink) controllerLink.status();
  }
  el('previous').onclick = function () { turnPage(-1); };
  el('next').onclick = function () { turnPage(1); };
  Array.prototype.forEach.call(el('quantities').children, function (button) {
    button.onclick = function () {
      var value = button.getAttribute('data-quantity');
      quantity = value === 'max' ? value : Number(value);
      Array.prototype.forEach.call(el('quantities').children, function (choice) {
        var active = choice === button;
        choice.classList.toggle('active', active);
        choice.setAttribute('aria-pressed', String(active));
      });
      refresh();
    };
  });
  el('close').onclick = function () { setCompact(true); };
  el('intro-close').onclick = function () { el('unit-intro').hidden = true; updateExclusions(); };
  el('close-overlay').onclick = close;
  el('critters-only').onclick = function () { setCompact(true); setCritters(true); };
  el('watch-mode').onclick = function () { setCompact(true); setWatch(true); };
  el('standalone-view').onclick = function () { setStandalone(!standalone); };
  el('quick-watch').onclick = function () { cycleTvMode(); };
  el('quick-auto').onclick = function () {
    if (!autoBindings.length) return;
    setAutoPaused(!autoPaused);
    var info = session.inspectAuto(autoBindings, autoPaused, reserveTarget, snapshot, lastHoldReason);
    if (!el('quick').hidden) quickNote('6', autoPaused ? 'Auto-buy paused' : theme.text(info.reason));
    renderQuick();
  };
  el('plus').onclick = function () { if (critters) setCritters(false); else setCompact(!compact); };
  Array.prototype.forEach.call(el('menu-views').children, function (button) { button.onclick = function () { selectView(button.getAttribute('data-view')); }; });
  el('show-achievements').onclick = function () { selectTab('__achievements'); focusByKey('show-journal'); };
  el('show-journal').onclick = function () {
    var back = !el('visitors').hidden ? 'show-visitors' : el('chronicle') && !el('chronicle').hidden ? 'show-chronicle' : 'show-achievements';
    selectTab('__journal');
    focusByKey(back);
  };
  el('show-visitors').onclick = function () { visitorSignature = ''; selectTab('__visitors'); focusByKey('show-journal'); };
  if (el('show-chronicle')) {
    el('show-chronicle').onclick = function () { chronicleSignature = ''; selectTab('__chronicle'); focusByKey('show-journal'); };
  }
  el('show-hint').onclick = toggleHint;
  el('quick-hint').onclick = toggleHint;
  el('evolution-details').onclick = function () { el('prestige-description').hidden = !el('prestige-description').hidden; };
  el('ascend').onclick = function () { prestigeDialog('ascend'); };
  el('respec').onclick = function () { prestigeDialog('respec'); };
  el('export').onclick = function () {
    try {
      openDialog('Export colony journal', 'Copy this save text or download a JSON backup on desktop. Keep the complete text to restore your colony.', 'export', store.export(game, Date.now(), {
        visitors: mechanics ? mechanics.log() : {},
        catches: mechanics ? mechanics.tally() : {},
        pin: pinnedQuick,
        reserve: reserveTarget,
        records: records,
        firstSeen: mechanics && mechanics.firstSeen ? mechanics.firstSeen() : firstSeen
      }));
    } catch (error) { message('Export failed: ' + error.message); }
  };
  el('import').onclick = function () { openDialog('Import colony journal', 'Paste a complete exported save below. Import replaces this colony after validation and keeps the previous save as a backup.', 'import', ''); };
  el('dialog-cancel').onclick = closeDialog;
  el('reset-progress').onclick = function () { resetDialog(false); };
  el('phone-controller').onclick = function () {
    openDialog('Phone controller', 'Play from a phone on the same Wi-Fi. Opening the controller never starts the colony; only Show does.', 'controller');
    el('dialog-confirm').textContent = 'New code';
    el('dialog-cancel').textContent = 'Close';
    el('controller-panel').hidden = false;
    if (controllerLink) controllerLink.openPairing();
    else el('controller-panel').textContent = 'The phone controller is not included in this version.';
  };
  el('dialog-confirm').onclick = function () {
    if (dialogAction === 'controller') { if (controllerLink) controllerLink.openPairing(); return; }
    if (dialogAction === 'reset') { resetDialog(true); return; }
    if (dialogAction === 'resetConfirm') { resetProgress(); return; }
    if (dialogAction === 'export' || dialogAction === 'exportDiagnostics') {
      var blob = new Blob([el('save-text').value], {type: 'application/json'});
      var url = URL.createObjectURL(blob);
      var link = node('a'); link.href = url; link.download = dialogAction === 'exportDiagnostics' ? 'roach-colony-diagnostics.json' : 'roach-colony-save.json';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return;
    }
    if (dialogAction === 'import') {
      var result = store.import(el('save-text').value, game, Date.now());
      if (!result.ok) { el('dialog-description').textContent = theme.text(result.message); return; }
      if (result.visitors && mechanics) { mechanics.load(result.visitors); saveVisitors(); visitorSignature = ''; }
      if (result.catches && mechanics) { mechanics.loadTally(result.catches); saveCatches(); }
      if (result.pin !== undefined) { pinnedQuick = result.pin || null; if (store && store.savePin) store.savePin(pinnedQuick); }
      if (result.reserve !== undefined) { reserveTarget = result.reserve || null; if (store && store.saveReserve) store.saveReserve(reserveTarget); }
      if (result.records) { records = result.records; if (store && store.saveRecords) store.saveRecords(records); }
      if (result.firstSeen && mechanics && mechanics.loadFirstSeen) { firstSeen = result.firstSeen; mechanics.loadFirstSeen(firstSeen); if (store && store.saveFirstSeen) store.saveFirstSeen(firstSeen); }
      syncKeepsakes();
      if (pendingSave) clearTimeout(pendingSave);
      pendingSave = null; dirtySince = 0;
      if (game.resume && !closed && !document.hidden) game.resume(Date.now());
      milestoneReady = false; milestoneSignature = ''; milestoneQueue = []; milestoneUntil = 0; el('milestone').hidden = true;
      closeDialog(); lastListSignature = ''; chronicleSignature = ''; saveMessage = result.message; refresh(); message(result.message); return;
    }
    var action = dialogAction;
    closeDialog();
    act(action, '');
  };
  // Remote keys whose DOM keyCodes are not identified yet. Put each code here once it is
  // seen on the TV (unhandledKeys in colonyDiagnostics lists recent unclaimed codes).
  var shortcutKeys = [{key: 'Movies', code: null, page: 'show-visitors'}, {key: '...', code: null, page: 'show-achievements'}];
  var unhandledKeys = [0, 0, 0, 0, 0, 0, 0, 0];
  var unhandledCount = 0;
  function noteUnhandled(code) { unhandledKeys[unhandledCount % unhandledKeys.length] = code; unhandledCount++; }
  function openMorePage(button) {
    if (button === 'show-visitors' && !visitorList().length) { message('No visitors have dropped by yet.'); return; }
    selectView('more');
    el(button).onclick();
    if (compact) setCompact(false); else primaryFocus();
  }
  function focusedRow() {
    var row = view === 'units' || view === 'upgrades' ? document.activeElement.closest('#items article') : null;
    return compact ? null : row;
  }
  // 7 jumps to the row the adapter names as the next goal's target, or opens Evolution when the
  // goal is to ascend. A goal without a row falls back to the main-chain row the compact ETA tracks.
  function followGoal() {
    if (compact) setCompact(false);
    var target = snapshot.nextGoalTarget;
    if (target && target.kind === 'ascend') { selectView('evolution'); focusByKey('ascend'); return; }
    if (!target) {
      var eta = game.snapshot(Date.now(), {quantity: quantity, includeItems: false, includeAchievements: false, includeMenu: false, includeEta: true}).nextEta;
      if (eta) target = {kind: 'unit', id: eta.id};
    }
    var item = target && game.snapshot(Date.now(), {quantity: quantity, includeAchievements: false, includeMenu: false, kind: target.kind, ids: [target.id]}).items.filter(function (entry) { return entry.id === target.id; })[0];
    if (!item) { message(snapshot.nextGoal || 'No goal to follow yet.'); return; }
    // Quote nothing; the id list alone gives the row's page within its tab.
    var listing = game.snapshot(Date.now(), {quantity: quantity, includeAchievements: false, includeMenu: false, kind: target.kind, tab: item.tab, ids: []});
    var ids = (listing.itemIds || listing.items.filter(function (entry) { return entry.tab === item.tab && entry.kind === target.kind; }).map(function (entry) { return entry.id; })).slice().reverse();
    remember();
    view = target.kind === 'unit' ? 'units' : 'upgrades';
    tab = item.tab;
    page = Math.max(0, Math.floor(ids.indexOf(target.id) / pageSize()));
    lastListSignature = '';
    refresh();
    focusByKey('buy-' + target.id);
  }
  function renderKeyHelp() {
    var help = el('key-help');
    if (!help) return;
    var modeLabel = standalone ? 'Standalone terrarium' : watchMode ? 'Watch TV' : compact ? 'Compact overlay' : 'Management menu';
    var targets = window.RoachMechanics && Array.isArray(RoachMechanics.targets) ? RoachMechanics.targets : ['golden', 'intruder', 'egg', 'molt', 'dung', 'visitor'];
    var hasIntruder = targets.indexOf('intruder') !== -1;
    var hasDung = targets.indexOf('dung') !== -1;
    var redLine = 'Red: golden roach' + (hasIntruder ? ', intruder' : '') + (hasDung ? ', egg/molt/dung beetle' : ', egg/molt') + ', visitor, else forage';
    var lines = [
      'Mode: ' + modeLabel + (compact ? ' (1–5 quick-buy · 8 Watch)' : ' (1–4 buy rows · 6 quantity)'),
      redLine,
      '1–4 buy a row; collapsed, 1–5 buy quick picks',
      '5 auto-buy on a row · 8 details, or Watch',
      '6 quantity or auto-buy · 7 goal · 0 hint',
      'CH+ next page · CH− or − previous page',
      'Down past the last row opens the next page',
      'Play/Pause auto-buy · Stop turns it all off',
      'Back: menu to compact, then the remote returns',
      '9 shows this guide · C brings critters text back'
    ];
    var p = help.querySelector('p');
    if (!p) return;
    p.textContent = '';
    lines.forEach(function (line, i) {
      if (i > 0) p.appendChild(document.createElement('br'));
      p.appendChild(document.createTextNode(line));
    });
  }
  function handleKey(event) {
    if (closed || event.defaultPrevented) return;
    wake();
    var code = event.keyCode;
    // A read-only export box must not trap remote arrows.
    var editing = event.target.tagName === 'TEXTAREA' && !event.target.readOnly || event.target.tagName === 'INPUT';
    // The browser preview has no colour keys, so R, G and Y stand in for Red, Green and Yellow.
    if (preview && !editing) code = {82: 403, 71: 404, 89: 405}[code] || code;
    if (code === 461 || code === 27) {
      event.preventDefault();
      if (!el('dialog').hidden) closeDialog();
      else if (!el('hint-card').hidden) closeHint();
      else if (!el('key-help').hidden) el('key-help').hidden = true;
      else if (!el('unit-intro').hidden) el('unit-intro').hidden = true;
      else if (!compact) setCompact(true);
      else if (watchMode) setWatch(false);
      else if (critters) setCritters(false);
      else holdRemote(false);
      return;
    }
    if (code === 406) { event.preventDefault(); close(); return; }
    // Any other key dismisses the hint card and still does its job; 0 and OK on More's Hint button toggle it.
    if (code !== 48 && code !== 96 && !(code === 13 && focusKey() === 'show-hint')) closeHint();
    if (!el('dialog').hidden && (code >= 48 && code <= 57 || code >= 96 && code <= 105 || [403,404,405,415,19,413,33,34,189,109].indexOf(code) !== -1)) {
      if (!editing) event.preventDefault();
      return;
    }
    if (code === 403) { event.preventDefault(); red(); return; }
    if (code === 404) { event.preventDefault(); if (lastPurchase) { var last = lastPurchase; rememberQuantity(act(last.type, last.id, last.quantity), last.quantity); } else message('Buy a unit or upgrade first.'); return; }
    if (code === 405) {
      event.preventDefault();
      if (critters) { setCritters(false); return; }
      var views = snapshot.prestige && snapshot.prestige.unlocked ? ['units', 'upgrades', 'evolution', 'more'] : ['units', 'upgrades', 'more'];
      selectView(compact ? 'upgrades' : views[(views.indexOf(view) + 1) % views.length]);
      setCompact(false);
      return;
    }
    var shortcut = shortcutKeys.filter(function (entry) { return entry.code === code; })[0];
    if (shortcut && el('dialog').hidden) { event.preventDefault(); openMorePage(shortcut.page); return; }
    if (code === 9 && !el('dialog').hidden) {
      var dialogButtons = Array.prototype.filter.call(el('dialog').querySelectorAll('button, textarea'), function (button) { return !button.disabled && button.offsetWidth; });
      var first = dialogButtons[0];
      var last = dialogButtons[dialogButtons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (editing) {
      if (code === 40 && event.target === el('save-text')) {
        var textVal = event.target.value;
        var caret = event.target.selectionStart;
        if (textVal.slice(caret).indexOf('\n') === -1) { event.preventDefault(); move(40); }
      }
      return;
    }
    if (code === 415 || code === 19 || code === 413) {
      if (critters) return;
      event.preventDefault();
      if (code === 413) { autoBindings = []; autoPaused = false; lastHoldReason = ''; saveAuto(); render(); message('Auto-buy is off.'); }
      else setAutoPaused(code === 19);
      return;
    }
    if (code >= 48 && code <= 57 || code >= 96 && code <= 105) {
      if (critters) return;
      event.preventDefault();
      var digit = code >= 96 ? code - 96 : code - 48;
      if (digit === 0) { toggleHint(); return; }
      if (digit === 9) {
        if (el('key-help').hidden) renderKeyHelp();
        el('key-help').hidden = !el('key-help').hidden;
        if (!el('key-help').hidden) { el('unit-intro').hidden = true; el('milestone').hidden = true; milestoneUntil = 0; el('local-hint').hidden = true; }
        updateExclusions(); return;
      }
      if (digit === 6 && !compact) {
        var choices = el('quantities').children;
        for (var i = 0; i < choices.length; i++) if (choices[i].classList.contains('active')) { choices[(i + 1) % choices.length].click(); break; }
        return;
      }
      if (digit === 7) { followGoal(); return; }
      if (compact && digit >= 1 && digit <= 5) { quickBuy(digit - 1); return; }
      if (compact && digit === 6) {
        if (autoBindings.length) {
          setAutoPaused(!autoPaused);
          var info6 = session.inspectAuto(autoBindings, autoPaused, reserveTarget, snapshot, lastHoldReason);
          if (!el('quick').hidden) quickNote('6', autoPaused ? 'Auto-buy paused' : theme.text(info6.reason));
          renderQuick();
        }
        else if (lastPurchase) { var repeat = lastPurchase; rememberQuantity(act(repeat.type, repeat.id, repeat.quantity), repeat.quantity); }
        else message('Set auto-buy from a row, or buy something for Green to repeat.');
        return;
      }
      if (compact && digit === 8) { cycleTvMode(); return; }
      if (digit <= 4) {
        var rows = !compact && (view === 'units' || view === 'upgrades') ? el('items').querySelectorAll('article') : [];
        var row = rows[digit - 1];
        if (!row) { message('Open a unit or upgrade list first.'); return; }
        act(row.getAttribute('data-kind'), row.getAttribute('data-item'));
        return;
      }
      var focused = focusedRow();
      if (!focused) { message('Highlight a unit or upgrade row first.'); return; }
      if (digit === 5) toggleAuto(focused.getAttribute('data-kind'), focused.getAttribute('data-item'));
      else focused.querySelector('.details').click();
      return;
    }
    // CH+ and CH- arrive as PageUp and PageDown on webOS remotes; in compact mode, LIST (-), GUIDE and INFO cycle TV mode.
    if ((code === 33 || code === 34 || code === 189 || code === 109) && !compact) { event.preventDefault(); turnPage(code === 33 ? 1 : -1); return; }
    if (compact && (code === 189 || code === 109 || code === 458 || code === 457)) { event.preventDefault(); cycleTvMode(); return; }
    if (code === 67) { event.preventDefault(); if (critters) setCritters(false); else setCompact(!compact); return; }
    // Any other key in compact mode means the overlay still holds the remote, so hand it back.
    if (compact) { noteUnhandled(code); holdRemote(false); return; }
    if (code === 80) { event.preventDefault(); corner = (corner + 1) % 4; position(); return; }
    if (code >= 37 && code <= 40) { event.preventDefault(); move(code); return; }
    if (code === 13 && document.activeElement.tagName !== 'BUTTON') {
      event.preventDefault();
      primaryFocus();
      return;
    }
    if (code !== 13) noteUnhandled(code);
  }
  document.addEventListener('keydown', handleKey);
  // A compact button that takes focus pulls the magic remote back onto the overlay.
  document.addEventListener('focusin', function () {
    if (!window.PalmSystem || !compact || closed) return;
    var active = document.activeElement;
    if (active && active !== document.body && panel.contains(active)) active.blur();
    holdRemote(false);
  });
  document.addEventListener('visibilitychange', function () { if (!closed) {
    if (game && game.pause && document.hidden) game.pause(Date.now());
    if (game && game.resume && !document.hidden) game.resume(Date.now());
    if (document.hidden) { dismissGuests(); stopFlashes(); closeHint(); magnitudes = {}; }
    if (habitat) habitat.setActive(!document.hidden);
    persist(); if (!document.hidden) refresh();
  } if (controllerLink) controllerLink.status(); });
  window.addEventListener('pagehide', function () { if (!closed) { if (game && game.pause) game.pause(Date.now()); persist(); } flushJournal(); });
  window.addEventListener('resize', function () { position(); updateExclusions(); });
  // The illustrated icons load after the first render; rebuild the rows that copied the procedural ones.
  window.addEventListener('roachcritters', function () { censusSignature = ''; lastListSignature = ''; resourceIcons = true; quickIcons = true; syncKeepsakes(); decorate(); render(); });
  window.webOSRelaunch = function () { applyParams(window.PalmSystem ? window.PalmSystem.launchParams : {}, true); return true; };
  document.addEventListener('webOSRelaunch', function (event) { applyParams(event.detail || {}, true); });
  try {
    if (window.RoachReset) RoachReset.apply(window.localStorage, parseParams(window.PalmSystem ? window.PalmSystem.launchParams : {}).resetSaveToken);
    store = session.ensureMetaStore(new RoachSave.Store({
      getItem: function (key) { return window.localStorage.getItem(key); },
      setItem: function (key, value) { window.localStorage.setItem(key, value); },
      removeItem: function (key) { window.localStorage.removeItem(key); }
    }), window.localStorage);
    var meta = store.loadMeta();
    milestoneSeen = meta.milestoneSeen;
    lastPurchase = meta.lastPurchase;
    autoBindings = meta.autoBindings;
    autoPaused = meta.autoPaused;
    lastAscension = meta.lastAscension;
    flavorIndex = meta.flavorIndex;
    journal = meta.journal;
    pinnedQuick = meta.pinnedQuick || null;
    reserveTarget = meta.reserve || null;
    expedition = meta.expedition || null;
    records = meta.records || {runs: [], bestMutagen: '0', fastestMs: 0, highestCaste: ''};
    activity = Array.isArray(meta.activity) ? meta.activity : [];
    firstSeen = meta.firstSeen || {};
    if (window.RoachHabitat) {
      habitat = new RoachHabitat(canvas);
      var month = new Date().getMonth();
      habitat.season = month === 9 ? 'october' : month === 11 ? 'december' : '';
      habitat.onLog = function (msg, detail) { logEvent('info', 'habitat', msg, detail); };
    }
    if (standaloneQuery) setStandalone(true);
    // Tests may inject random(), hour() and visitors(); the TV uses its own clock.
    var mechanicsOptions = window.RoachMechanicsOptions || {};
    if (window.RoachMechanics) {
      mechanics = RoachMechanics.create({random: mechanicsOptions.random, hour: mechanicsOptions.hour, minute: mechanicsOptions.minute, visitors: mechanicsOptions.visitors || visitorSlugs, energy: function () { return !!(snapshot && snapshot.resources && snapshot.resources.some(function (resource) { return resource.id === 'energy'; })); }});
      mechanics.load(meta.visitors);
      mechanics.loadTally(meta.catches);
      if (mechanics.loadFirstSeen) mechanics.loadFirstSeen(firstSeen);
      if (mechanics.loadExpedition) mechanics.loadExpedition(expedition);
      syncKeepsakes();
    }
    game = new SwarmEngine.Game({now: Date.now(), activeTimeOnly: true});
    var loaded = store.load(game, Date.now());
    var refunded = store.refundMatriarchOnce(game, meta, !!window.PalmSystem);
    lastPurchase = meta.lastPurchase;
    if (loaded.message) saveMessage = loaded.message;
    if (loaded.legacyAvailable) saveMessage += ' An older prototype save is preserved on this device.';
    // Only write immediately on a brand-new colony, backup recovery, or one-time refund;
    // re-saving an unchanged primary save at startup rebuilt a validation engine for the backup slot.
    if (!loaded.loaded || loaded.recovered || refunded) persist();
    else lastSave = Date.now();
  } catch (error) {
    logEvent('error', 'boot', error.message, error.stack);
    el('save-warning').hidden = false;
    el('save-warning').textContent = 'Colony could not start: ' + error.message;
  }
  // Phone commands run through the same operations as the remote keys.
  if (window.RoachControllerLink) controllerLink = RoachControllerLink.start({
    game: function () { return game; },
    open: function () { return !closed && !document.hidden && !!game; },
    act: act,
    red: red,
    redTarget: function () { return mechanics && !closed ? mechanics.redTarget() : {kind: '', name: '', label: '', goneMessage: ''}; },
    catchable: function () { return mechanics && !closed ? mechanics.target() : ''; },
    visitorName: function () { var slug = mechanics && !closed && mechanics.state().visitor; return slug ? RoachMechanics.humanize(slug) : ''; },
    visitors: visitorList,
    feats: feats,
    toggleAuto: toggleAuto,
    setAutoPaused: setAutoPaused,
    quickPicks: function () { return quickPicks.slice(); },
    quickBuy: function (slot) { quickBuy(slot); return {ok: true}; },
    pinState: function () { return pinnedQuick ? {kind: pinnedQuick.kind, id: pinnedQuick.id} : null; },
    togglePin: togglePin,
    reserveState: function () { return session.reserveProgress(reserveTarget, snapshot) || (reserveTarget ? {kind: reserveTarget.kind, id: reserveTarget.id} : null); },
    toggleReserve: toggleReserve,
    eventChoice: function () { return mechanics && !closed && mechanics.choice ? mechanics.choice() : null; },
    chooseEvent: chooseEventOption,
    expeditionState: function () { return mechanics && mechanics.expedition ? mechanics.expedition() : expedition; },
    startExpedition: startScoutExpedition,
    cancelExpedition: cancelScoutExpedition,
    records: function () { return JSON.parse(JSON.stringify(records)); },
    activity: function () { return activity.slice(0, 16); },
    keepsakes: unlockedKeepsakes,
    supportInfo: buildSupportDiagnostics,
    display: function () {
      return {levels: [{id: 'full', label: 'Full', hint: 'Menu with every row; takes the TV remote'}, {id: 'compact', label: 'Compact', hint: 'Stock, census and next goal'}, {id: 'watch', label: 'Watch', hint: 'Hot bar only, roaches on the edge'}, {id: 'critters', label: 'Critters', hint: 'Roaches only, no text'}], current: !compact ? 'full' : critters ? 'critters' : watchMode ? 'watch' : 'compact'};
    },
    setDisplay: function (id) {
      if (closed) return {ok: false, message: 'Open the colony first.'};
      if (id === 'full') setCompact(false);
      else if (id === 'compact') { setWatch(false); setCompact(true); }
      else if (id === 'watch') setWatch(true);
      else if (id === 'critters') { setWatch(false); if (!compact) setCompact(true); setCritters(true); }
      else return {ok: false, message: 'That display level is not available.'};
      return {ok: true};
    },
    hide: close,
    lastPurchase: function () { return lastPurchase && {type: lastPurchase.type, id: lastPurchase.id}; },
    autoState: function () { return {bindings: autoBindings.slice(), paused: autoPaused, info: session.inspectAuto(autoBindings, autoPaused, reserveTarget, snapshot, lastHoldReason)}; },
    panel: el('controller-panel')
  });
  decorate();
  renderKeyHelp();
  applyParams(window.PalmSystem ? window.PalmSystem.launchParams : {});
  window.colonyDiagnostics = function () {
    var visual = habitat ? habitat.diagnostics() : null;
    return {snapshot: snapshot ? JSON.parse(JSON.stringify(snapshot)) : null, storageError: store ? store.error || '' : '', closed: closed, compact: compact, critters: critters, watchMode: watchMode, standalone: standalone, dimmed: dimmed, menu: view, tab: tab, page: page, corner: corners[corner], deadline: deadline, spriteCount: visual ? visual.entities : 0, spriteRoles: roleIds.slice(0, 4), habitat: visual, autoBindings: JSON.parse(JSON.stringify(autoBindings)), autoPaused: autoPaused, autoStatus: session.inspectAuto(autoBindings, autoPaused, reserveTarget, snapshot, lastHoldReason), lastPurchase: lastPurchase && {type: lastPurchase.type, id: lastPurchase.id}, pinnedQuick: pinnedQuick ? {kind: pinnedQuick.kind, id: pinnedQuick.id} : null, reserveTarget: reserveTarget ? {kind: reserveTarget.kind, id: reserveTarget.id} : null, expedition: mechanics && mechanics.expedition ? mechanics.expedition() : expedition, eventChoice: mechanics && mechanics.choice ? mechanics.choice() : null, records: JSON.parse(JSON.stringify(records)), activity: activity.slice(0, 24), keepsakes: unlockedKeepsakes(), support: buildSupportDiagnostics(), listBuilds: listBuilds, pendingSave: !!pendingSave, milestone: {queued: milestoneQueue.length, seen: Object.keys(milestoneSeen).length, showing: !el('milestone').hidden}, animationFps: visual ? visual.targetFps : 0, uptimeSeconds: (Date.now() - started) / 1000, controller: controllerLink ? controllerLink.diagnostics() : null, mechanics: mechanics ? mechanics.state() : null, pendingRewards: pendingRewards.length, nightShift: nightShift, quickPicks: quickPicks.map(function (pick) { return pick && {kind: pick.kind, id: pick.id, affordable: pick.affordable, progress: pick.progress, gain: pick.gain, pinned: !!pick.pinned}; }), redCue: redCueText, unhandledKeys: unhandledKeys.slice(unhandledCount % 8).concat(unhandledKeys.slice(0, unhandledCount % 8)).filter(Boolean), journal: journal.slice(-40)};
  };
}());
