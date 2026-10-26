/* Game side of the phone controller. The colony page stays the only authority:
   phones send colony operations through the TV bridge, and this file runs them
   through the same functions the remote keys use. With no phone watching it
   does no quote work; without the bridge it retries quietly with backoff. */
(function (root) {
  'use strict';
  var DEFAULT_PORT = 8643;
  var GONE = {
    golden: 'The golden roach got away.',
    intruder: 'The intruder has already retreated.',
    egg: 'The egg case is gone.',
    molt: 'The molting roach got away.',
    dung: 'The dung beetle rolled away.',
    visitor: 'The visitor wandered off.'
  };

  function start(api) {
    var theme = root.RoachTheme;
    var socket = null;
    var connected = false;
    var key = '';
    var port = DEFAULT_PORT;
    var attempts = 0;
    var retryTimer = null;
    var pageId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var opens = 0;
    var session = pageId + '.0';
    var visible = false;
    var views = [];
    var timer = null;
    var described = {};
    var iconsSent = {};
    var names = {};
    var results = {};
    var resultOrder = [];
    var tabsCache = null;
    var panelOpen = false;
    var pairing = null;
    var pairingTimer = null;
    var phones = [];
    var confirmForget = '';
    var stats = {states: 0, stateMs: 0, commands: 0, commandMs: 0, connects: 0, events: 0};
    var events = [];
    var eventTimer = null;
    var EVENT_GAP = 1500;
    // Resend icons once the illustrated critters replace the procedural ones.
    root.addEventListener('roachcritters', function () { iconsSent = {}; });

    function send(message) {
      if (!socket || socket.readyState !== 1) return false;
      socket.send(JSON.stringify(message));
      return true;
    }
    function viewKey(view) { return view.list + '|' + view.tab + '|' + view.quantity; }
    function cleanView(view) {
      view = view && typeof view === 'object' ? view : {};
      return {
        list: ['unit', 'upgrade', 'more', 'achievements', 'evolution', 'visitors'].indexOf(view.list) !== -1 ? view.list : 'unit',
        tab: typeof view.tab === 'string' && /^[A-Za-z0-9_]{0,32}$/.test(view.tab) ? view.tab : '',
        quantity: view.quantity === 10 || view.quantity === 'max' ? view.quantity : 1
      };
    }
    function connect() {
      if (!key || socket || !root.WebSocket) return;
      try { socket = new root.WebSocket('ws://127.0.0.1:' + port + '/game'); } catch (error) { socket = null; retry(); return; }
      var current = socket;
      socket.onopen = function () { send({t: 'hello', key: key, session: session, visible: visible}); };
      socket.onmessage = function (event) { if (socket === current) receive(event.data); };
      socket.onerror = function () { /* Bridge absence is normal; onclose schedules a quiet retry. */ };
      socket.onclose = function (event) {
        if (socket !== current) return;
        socket = null;
        connected = false;
        views = [];
        updateTimer();
        renderPanel();
        // A newer colony page took over; this one retries only slowly so two pages never trade places.
        if (event.code === 4000) attempts = 6;
        retry();
      };
    }
    function retry() {
      if (retryTimer || !key) return;
      var delay = Math.min(60000, 1000 * Math.pow(2, Math.min(attempts++, 6))) * (0.75 + Math.random() * 0.5);
      retryTimer = setTimeout(function () { retryTimer = null; connect(); }, delay);
    }
    function reconnect() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      attempts = 0;
      if (socket) { var old = socket; socket = null; connected = false; try { old.close(); } catch (error) { /* Already closed. */ } }
      connect();
    }
    function receive(text) {
      var message;
      try { message = JSON.parse(text); } catch (error) { return; }
      if (!message || typeof message.t !== 'string') return;
      if (message.t === 'welcome') {
        connected = true;
        attempts = 0;
        stats.connects++;
        described = {};
        iconsSent = {};
        phones = message.phones || [];
        renderPanel();
        if (panelOpen) send({t: 'pair'});
      } else if (message.t === 'watch') {
        views = (message.views || []).slice(0, 4).map(cleanView);
        updateTimer();
      } else if (message.t === 'refresh') {
        if (api.open()) sendState(cleanView(message.view));
      } else if (message.t === 'flush') {
        if (api.flush) api.flush();
        send({t: 'flushed', id: message.id});
      } else if (message.t === 'cmd') {
        command(message);
      } else if (message.t === 'pair') {
        pairing = message;
        renderPanel();
        if (pairingTimer) clearTimeout(pairingTimer);
        if (message.ttl) pairingTimer = setTimeout(renderPanel, Math.min(message.ttl, 600000) + 50);
      } else if (message.t === 'paired') {
        pairing = {used: String(message.name || 'a phone')};
        renderPanel();
      } else if (message.t === 'phones') {
        phones = message.phones || [];
        renderPanel();
      }
    }
    function updateTimer() {
      var wanted = connected && views.length && api.open();
      if (wanted && !timer) timer = setInterval(tick, 1000);
      if (!wanted && timer) { clearInterval(timer); timer = null; }
    }
    function tick() {
      if (!api.open()) { updateTimer(); return; }
      // A bridge that has not drained the last second's update gets the next one instead.
      if (socket && socket.bufferedAmount > 65536) return;
      views.forEach(sendState);
    }
    function sendState(view) {
      var built = build(view, Date.now());
      if (built) send({t: 'state', key: viewKey(view), session: session, data: built.data, catalog: built.catalog, icons: built.icons});
    }
    function hasTab(kind, tab) {
      return (tabsCache || []).some(function (entry) { return entry.id === tab && (!entry.kinds || entry.kinds.indexOf(kind) !== -1); });
    }
    function label(id, name) { return theme.text(theme.label(id, name)); }
    function targetLabel(kind, id) { return names[kind + ':' + id] || label(id, id); }
    function production(entry, description) {
      if (entry && entry.production !== undefined) return entry.production ? theme.text(entry.production) : '';
      var match = /Produces ([^.]*(?:\.\d[^.]*)*)\./.exec(description || '');
      return match ? theme.text(match[1]) : '';
    }
    function itemLabel(kind, id, name) { return kind === 'upgrade' ? theme.text(theme.upgradeLabel(id, name)) : label(id, name); }
    // Energy-tab upgrades other than outlets are one-shot abilities the phone shows as "Use".
    function ability(entry) { return entry.kind === 'upgrade' && entry.tab === 'energy' && !/^nexus\d/.test(entry.id); }
    function formatCostEntry(id, amount) {
      return theme.costText([{id: id, amount: amount}]).replace(/^(\S+ )(.)/, function (all, count, first) { return count + first.toLowerCase(); });
    }
    // Uses structured snapshot costs when present; falls back to string parsing for mock snapshots.
    function costParts(entry, batch, stock) {
      var list = batch ? entry.batchCosts : entry.costs;
      if (Array.isArray(list) && list.length) {
        return list.map(function (cost) {
          var id = cost.id || (cost.name && stock.ids[String(cost.name).toLowerCase()]) || '';
          var has = id && stock.have[id];
          if (!has) return {id: '', label: theme.text(cost.amount + ' ' + (cost.name || id)), need: String(cost.amount || ''), have: '', rate: ''};
          return {id: id, label: formatCostEntry(id, cost.amount), need: String(cost.amount), have: has.amount, rate: has.rate || ''};
        });
      }
      var raw = batch ? entry.batchCost : entry.cost;
      return String(raw || '').split(' + ').filter(Boolean).map(function (part) {
        var match = /^(\S+) (.+)$/.exec(part);
        var id = match && stock.ids[match[2].toLowerCase()];
        if (!id) return {id: '', label: theme.text(part), need: match ? match[1] : '', have: '', rate: ''};
        return {id: id, label: formatCostEntry(id, match[1]), need: match[1], have: stock.have[id].amount, rate: stock.have[id].rate || ''};
      });
    }
    function upgradeText(description) {
      if (theme.upgradeText) return theme.upgradeText(description);
      var whole = String(description || '').trim();
      var match = /^([^]*?[.)])\s+([^.()]*:[^]*?)\.?$/.exec(whole);
      var effect = match ? match[2] : '';
      var brief = ((match ? match[1] : whole).match(/^[^.]+(?:\.\d[^.]*)*\.?/) || [''])[0].trim();
      return {brief: brief, effect: effect ? effect.charAt(0).toUpperCase() + effect.slice(1) : ''};
    }
    // Picture key for a resource, upgrade or meta id. Twin, faster and empower upgrades
    // each carry their own unit, so the phone does not reuse one egg or one leg for all of them.
    function slug(kind, id) {
      var critters = root.RoachCritters;
      if (kind === 'upgrade') {
        var mark = /(?:twin|prod|empower)$/.exec(id);
        if (mark) {
          var unit = id.slice(0, id.length - mark[0].length);
          if (critters && critters.units && critters.units[unit]) return unit + '+' + mark[0];
        }
      }
      var map = critters && critters[kind === 'meta' ? 'meta' : kind + 's'];
      return map && map[id] || '';
    }
    function build(view, now) {
      var game = api.game();
      if (!game) return null;
      var started = Date.now();
      var sprites = root.RoachSprites || root.RoachHabitat;
      // Each picture goes out once per connection: units by id, everything else as '#' + slug.
      // Icons are drawn at their 64 px cell size so phones can show them crisply at 32 px.
      function attach(key, kind, id) {
        if (iconsSent[key] || !sprites) return;
        iconsSent[key] = true;
        try {
          var canvas = kind === 'unit' ? sprites.iconCanvas && sprites.iconCanvas(id, 64) : sprites.iconFor && sprites.iconFor(kind, id, 64);
          if (canvas) { icons = icons || {}; icons[key] = canvas.toDataURL('image/png'); }
        } catch (error) { /* The phone falls back to a plain marker. */ }
      }
      function pictured(kind, id) {
        var name = slug(kind, id);
        if (name) attach('#' + name, kind, id);
        return name;
      }
      var kind = view.list === 'unit' || view.list === 'upgrade' ? view.list : '';
      var tab = view.tab;
      if (kind && !hasTab(kind, tab)) {
        tabsCache = game.snapshot(now, {includeItems: false, includeAchievements: false}).tabs || [];
        if (!hasTab(kind, tab)) tab = (tabsCache.filter(function (entry) { return !entry.kinds || entry.kinds.indexOf(kind) !== -1; })[0] || {id: ''}).id;
      }
      // The colony's energy tab lists its abilities beside its units.
      var quoteKind = kind === 'unit' && tab === 'energy' ? undefined : kind || undefined;
      var snap = game.snapshot(now, {quantity: view.quantity, includeItems: !!kind, kind: quoteKind, tab: kind && tab ? tab : undefined, includeAchievements: view.list === 'achievements', includeMenu: true, includeRates: true, includeAscension: view.list === 'more' || view.list === 'evolution', includeHint: view.list === 'unit'});
      tabsCache = snap.tabs || tabsCache;
      var auto = api.autoState();
      var bound = {};
      auto.bindings.forEach(function (entry) { bound[entry.type + ':' + entry.id] = true; });
      var catalog = null;
      var icons = null;
      var stock = {ids: {}, have: {}};
      var producers = {};
      (snap.visibleUnits || []).forEach(function (entry) {
        names['unit:' + entry.id] = label(entry.id, entry.name);
        stock.ids[String(entry.name).toLowerCase()] = entry.id;
        stock.have[entry.id] = {amount: entry.count};
        if (entry.owned) (entry.productionTargets || []).forEach(function (target) {
          var list = producers[target.id] || (producers[target.id] = []);
          if (list.length < 4) list.push(theme.plural(entry.id, entry.name));
        });
      });
      (snap.resources || []).forEach(function (entry) {
        stock.ids[String(entry.name).toLowerCase()] = entry.id;
        stock.have[entry.id] = {amount: entry.amount, rate: entry.rate};
      });
      // Units paid as costs (a matriarch costs brood mothers) get their stock and production rate too.
      (snap.visibleUnits || []).forEach(function (entry) {
        if (stock.have[entry.id] || !entry.velocity) return;
        stock.ids[String(entry.name).toLowerCase()] = entry.id;
        stock.have[entry.id] = {amount: entry.count, rate: entry.velocity};
      });
      var items = (snap.items || []).filter(function (entry) { return entry.visible !== false; }).reverse().map(function (entry) {
        var id = entry.kind + ':' + entry.id;
        var text = itemLabel(entry.kind, entry.id, entry.name);
        var description = theme.text(entry.description);
        names[id] = text;
        if (described[id] !== description) {
          catalog = catalog || {};
          catalog[id] = {label: text, description: description, source: theme.source(entry.id, entry.name) || ''};
          described[id] = description;
        }
        if (entry.kind === 'unit') attach(entry.id, 'unit', entry.id);
        var available = entry.batchAvailable === undefined ? entry.available : entry.batchAvailable;
        var words = entry.kind === 'upgrade' ? upgradeText(description) : {brief: '', effect: ''};
        var batch = entry.batchQuantity !== undefined && entry.batchQuantity !== '0' && entry.batchQuantity !== '1';
        return {
          kind: entry.kind, id: entry.id, label: text, tier: entry.tier || 0, owned: entry.owned,
          rate: entry.kind === 'unit' && entry.velocity && entry.velocity !== '0' ? entry.velocity : '',
          verb: ability(entry) ? 'Use' : '',
          costs: costParts(entry, batch, stock),
          next: entry.batchQuantity === '0',
          qty: entry.batchQuantity === undefined ? '1' : entry.batchQuantity,
          qtyLabel: entry.batchQuantityLabel === undefined ? '1' : entry.batchQuantityLabel,
          gainLabel: entry.batchOwnedGain && entry.batchOwnedGain !== entry.batchQuantity ? entry.batchOwnedGainLabel : '',
          available: !!available, note: theme.text(entry.batchMessage || ''),
          production: entry.kind === 'unit' ? production(entry, description) : '',
          effect: words.effect, brief: words.brief,
          impact: entry.impact ? theme.text(entry.impact) : '',
          bottleneck: entry.bottleneck ? {
            id: entry.bottleneck.id,
            label: label(entry.bottleneck.id, entry.bottleneck.name),
            short: !!entry.bottleneck.short,
            producer: entry.bottleneck.producer ? {
              kind: entry.bottleneck.producer.kind,
              id: entry.bottleneck.producer.id,
              label: itemLabel(entry.bottleneck.producer.kind, entry.bottleneck.producer.id, entry.bottleneck.producer.name)
            } : null
          } : null,
          icon: entry.kind === 'unit' ? '' : pictured(entry.kind, entry.id),
          auto: !!bound[id]
        };
      });
      // The leader is the most advanced owned roach of the main brood chain, which feeds
      // neither territory nor energy.
      var chain = (snap.visibleUnits || []).filter(function (entry) {
        var targets = entry.productionTargets || [];
        return entry.tier > 0 && targets.length && targets.every(function (target) { return target.id !== 'territory' && target.id !== 'energy'; });
      }).sort(function (a, b) { return a.tier - b.tier; });
      var owned = chain.filter(function (entry) { return entry.owned; });
      var top = owned[owned.length - 1];
      var after = top && chain.filter(function (entry) { return entry.tier > top.tier; })[0];
      if (top) attach(top.id, 'unit', top.id);
      var last = api.lastPurchase();
      var prestige = snap.prestige;
      var autoInfo = api.autoStatus ? api.autoStatus() : null;
      var quick = (api.quickPicks ? api.quickPicks() : []).filter(Boolean).map(function (pick, slot) {
        if (pick.kind === 'unit') attach(pick.id, 'unit', pick.id);
        return {
          slot: typeof pick.slot === 'number' ? pick.slot : slot,
          kind: pick.kind,
          id: pick.id,
          label: itemLabel(pick.kind, pick.id, pick.name),
          affordable: !!pick.affordable,
          progress: pick.progress,
          gain: pick.gain ? theme.short(pick.gain) : '',
          pinned: !!pick.pinned,
          icon: pick.kind === 'unit' ? '' : pictured(pick.kind, pick.id)
        };
      });
      var data = {
        list: view.list, tab: tab, quantity: view.quantity,
        resources: (snap.resources || []).map(function (entry) { return {id: entry.id, label: theme.label(entry.id, entry.name), amount: entry.amount, rate: entry.rate, cap: entry.cap || '', icon: pictured('resource', entry.id)}; }),
        meta: {achievement: pictured('meta', 'achievement'), visitors: pictured('meta', 'visitors'), ascension: pictured('meta', 'ascension'), goldenRoach: pictured('meta', 'goldenRoach')},
        population: snap.population,
        tabs: kind ? (snap.tabs || []).filter(function (entry) { return !entry.kinds || entry.kinds.indexOf(kind) !== -1; }).map(function (entry) { return {id: entry.id, label: theme.tabLabel(entry.id, entry.label)}; }) : [],
        upgrades: (snap.visibleUpgradeIds || []).length > 0,
        items: items,
        quick: quick,
        pin: api.pinState ? api.pinState() : null,
        reserve: api.reserveState ? api.reserveState() : null,
        eventChoice: api.eventChoice ? api.eventChoice() : null,
        expedition: api.expeditionState ? api.expeditionState() : null,
        leader: top ? {id: top.id, label: theme.plural(top.id, top.name, top.countExact), count: top.count, rate: top.velocity && top.velocity !== '0' ? top.velocity : '', next: after ? {id: after.id, label: label(after.id, after.name)} : null} : null,
        producers: producers,
        auto: {
          paused: auto.paused,
          state: autoInfo ? autoInfo.state : (!auto.bindings.length ? 'off' : auto.paused ? 'paused' : 'running'),
          reason: autoInfo && autoInfo.reason ? theme.text(autoInfo.reason) : '',
          count: autoInfo && typeof autoInfo.count === 'number' ? autoInfo.count : auto.bindings.length,
          targets: auto.bindings.map(function (entry) { return {kind: entry.type, id: entry.id, label: targetLabel(entry.type, entry.id)}; })
        },
        last: last ? {kind: last.type, id: last.id, label: targetLabel(last.type, last.id)} : null,
        prestige: prestige ? {
          unlocked: !!prestige.unlocked,
          available: !!prestige.available,
          cost: theme.text(prestige.cost),
          reward: theme.text(prestige.reward),
          label: theme.label('ascension', 'ascension'),
          preview: prestige.preview ? {
            gain: prestige.preview.gain,
            energy: theme.text(prestige.preview.energy),
            keeps: theme.text(prestige.preview.keeps),
            next: theme.text(prestige.preview.next),
            banked: prestige.preview.banked ? theme.text(prestige.preview.banked) : '',
            planner: prestige.preview.planner ? {
              thresholds: (prestige.preview.planner.thresholds || []).map(function (t) {
                return {id: t.id, label: theme.upgradeLabel(t.id, t.name), level: t.level, gain: t.gain};
              }),
              warpImpact: theme.text(prestige.preview.planner.warpImpact || '')
            } : null
          } : null,
          respec: snap.respec ? {unlocked: !!snap.respec.unlocked, available: !!snap.respec.available, cost: theme.text(snap.respec.cost)} : null
        } : null,
        achieved: {earned: snap.earnedAchievementCount || 0, total: snap.coverage ? snap.coverage.playableAchievements : 0}
      };
      // The colony's guest achievements count and list beside the source's.
      var feats = api.feats ? api.feats() : [];
      data.achieved.earned += feats.filter(function (entry) { return entry.earned; }).length;
      data.achieved.total += feats.length;
      // Display levels exist only when the colony page offers them.
      if (api.display) data.display = api.display();
      // A dormant nest shows its goal on every view, as the TV does under the footer.
      data.dormant = !!snap.dormant;
      if (view.list === 'more' || data.dormant) data.goal = theme.text(snap.nextGoal || '');
      if (view.list === 'more') {
        data.records = api.records ? api.records() : null;
        data.activity = api.activity ? api.activity() : [];
        data.keepsakes = api.keepsakes ? api.keepsakes() : [];
        data.support = api.supportInfo ? api.supportInfo() : null;
      }
      // The colony screen's Hint: the TV's key 0 card, the original tutorial step and the next goal.
      if (snap.hint) data.hint = {text: theme.text(snap.hint.text), goal: theme.text(snap.nextGoal || ''), target: snap.nextGoalTarget || null};
      // Red's current target, so the phone's Red button reads and acts like Red.
      var redInfo = api.redTarget ? api.redTarget() : null;
      if (redInfo) {
        data.catchable = redInfo.kind;
        if (redInfo.name) data.catchName = redInfo.name;
        if (redInfo.label) data.catchLabel = redInfo.label;
      } else {
        if (api.catchable) data.catchable = api.catchable();
        if (data.catchable === 'visitor' && api.visitorName) data.catchName = api.visitorName();
      }
      if (api.visitors) {
        var visitors = api.visitors();
        data.visitorCount = {found: visitors.filter(function (entry) { return entry.seen; }).length, total: visitors.length};
        if (view.list === 'visitors') {
          if (api.keepsakes) data.keepsakes = api.keepsakes();
          data.visitors = visitors.map(function (entry) {
            var id = 'visitor:' + entry.slug;
            if (entry.seen && !iconsSent[id] && sprites && sprites.critterCanvas) {
              iconsSent[id] = true;
              try {
                var canvas = sprites.critterCanvas(entry.slug, 48);
                if (canvas) { icons = icons || {}; icons[id] = canvas.toDataURL('image/png'); }
              } catch (error) { /* The phone shows the name without a picture. */ }
            }
            return {
              id: entry.slug,
              name: entry.seen ? entry.name : '',
              seen: entry.seen,
              rarity: entry.seen && root.RoachMechanics && root.RoachMechanics.rarity ? root.RoachMechanics.rarity(entry.slug) : '',
              note: root.RoachMechanics && root.RoachMechanics.visitorNote && entry.seen ? root.RoachMechanics.visitorNote(entry.slug) : '',
              firstSeen: entry.firstSeen || 0
            };
          });
        }
      }
      if (view.list === 'achievements') {
        data.achievements = (snap.achievements || []).concat(feats).map(function (entry) {
          return {id: entry.id, name: theme.text(theme.achievementLabel(entry.id, entry.name)), description: theme.text(entry.description), earned: !!entry.earned, progress: !entry.earned && entry.progress && typeof entry.progress.percent === 'number' ? entry.progress.percent : null};
        });
      }
      stats.states++;
      stats.stateMs += Date.now() - started;
      return {data: data, catalog: catalog, icons: icons};
    }
    function quote(kind, id, quantity, now) {
      var snap = api.game().snapshot(now, {quantity: quantity, ids: [id], kind: kind, includeAchievements: false, includeMenu: false});
      return (snap.items || []).filter(function (entry) { return entry.kind === kind && entry.id === id; })[0] || null;
    }
    function goneMessage(kind) {
      if (root.RoachMechanics && root.RoachMechanics.goneMessage) return root.RoachMechanics.goneMessage(kind);
      return GONE[kind] || 'Nothing to catch now.';
    }
    function run(message) {
      var now = Date.now();
      if (message.op === 'hide') {
        // The result goes out before the colony closes so the phone hears it first.
        if (api.open()) setTimeout(api.hide, 0);
        return {ok: true, message: 'Colony paused and saved.'};
      }
      if (!api.open()) return {ok: false, code: 'paused', message: 'Open the colony to play.'};
      if (message.session !== session) return {ok: false, code: 'session', message: 'The colony was reopened. Refreshing…'};
      if (message.op === 'catch') {
        // The phone names the target its button showed. If that one is gone by now, nothing happens,
        // so a late tap never forages or catches something the player did not see.
        var activeKind = api.redTarget ? api.redTarget().kind : (api.catchable ? api.catchable() : '');
        if (!activeKind || activeKind !== message.kind) return {ok: false, message: goneMessage(message.kind)};
        var caught = api.red();
        return {ok: !!(caught && caught.ok), message: theme.text(caught ? caught.message : 'Action failed.')};
      }
      if (message.op === 'forage') {
        var foraged = api.act('forage', '', 1, false, now);
        return {ok: !!(foraged && foraged.ok), message: theme.text(foraged ? foraged.message : 'Action failed.')};
      }
      if (message.op === 'buy' || message.op === 'buyLast') {
        var target = message.op === 'buy' ? {type: message.kind, id: message.id} : api.lastPurchase();
        if (!target) return {ok: false, message: 'Buy a unit or upgrade first.'};
        var entry = quote(target.type, target.id, message.quantity, now);
        if (!entry) return {ok: false, message: 'That is not available yet.'};
        var text = itemLabel(target.type, entry.id, entry.name);
        var available = entry.batchAvailable === undefined ? entry.available : entry.batchAvailable;
        if (!available) return {ok: false, code: 'unaffordable', message: theme.text(entry.batchMessage || 'Not enough for ' + text + ' yet. Next costs ' + entry.cost + '.')};
        var result = api.act(target.type, target.id, message.quantity, false, now);
        if (!result || !result.ok) return {ok: false, message: theme.text(result ? result.message : 'Action failed.')};
        var count = entry.batchQuantity || '1';
        var level = /^\d{1,9}$/.test(entry.ownedExact || '') && /^\d{1,9}$/.test(count) ? Number(entry.ownedExact) + Number(count) : 0;
        return {
          ok: true,
          message: ability(entry) ? 'Used ' + text + '.' : target.type === 'upgrade' ? (level ? text + ' → Lv ' + level : 'Bought ' + text + (count === '1' ? '' : ' × ' + entry.batchQuantityLabel)) + '.' : 'Bought ' + entry.batchQuantityLabel + ' ' + theme.plural(entry.id, entry.name, count) + '.',
          bought: {kind: target.type, id: target.id, quantity: count, label: entry.batchQuantityLabel}
        };
      }
      if (message.op === 'auto') {
        var item = quote(message.kind, message.id, 1, now);
        if (!item) return {ok: false, message: 'That is not available yet.'};
        var toggled = api.toggleAuto(message.kind, message.id);
        var name = itemLabel(message.kind, item.id, item.name);
        return {ok: toggled.ok, message: toggled.ok ? 'Auto-buy ' + (toggled.enabled ? 'on' : 'off') + ' for ' + name + '.' : toggled.message};
      }
      if (message.op === 'autoPause') {
        api.setAutoPaused(message.paused === true);
        return {ok: true, message: message.paused ? 'Auto-buy paused.' : 'Auto-buy resumed.'};
      }
      if (message.op === 'ascend' || message.op === 'respec') {
        var evo = api.act(message.op, '', 1, false, now);
        return {ok: !!(evo && evo.ok), message: theme.text(evo ? evo.message : 'Action failed.')};
      }
      if (message.op === 'display') {
        // Optional hooks: display() -> {levels: [{id, label, hint}], current}, setDisplay(id).
        if (!api.setDisplay || !api.display) return {ok: false, message: 'This colony version has no display levels.'};
        var level = (api.display().levels || []).filter(function (entry) { return entry.id === message.level; })[0];
        if (!level) return {ok: false, message: 'That display level is not available.'};
        var shown = api.setDisplay(level.id);
        return shown && shown.ok === false ? {ok: false, message: shown.message || 'That display level is not available.'} : {ok: true, message: 'The TV shows ' + level.label + '.'};
      }
      if (message.op === 'quickBuy') {
        if (!api.quickBuy) return {ok: false, message: 'Quick buy is not available.'};
        var picks = api.quickPicks ? api.quickPicks() : [];
        var pick = picks[message.slot];
        var qRes = api.quickBuy(message.slot);
        if (qRes && typeof qRes === 'object' && qRes.ok !== undefined) {
          return {
            ok: !!qRes.ok,
            message: theme.text(qRes.message || (qRes.ok ? 'Bought ' + (pick ? itemLabel(pick.kind, pick.id, pick.name) : 'item') + '.' : 'Not enough yet.')),
            bought: qRes.bought || (qRes.purchase ? {kind: qRes.purchase.kind, id: qRes.purchase.id, quantity: qRes.purchase.quantity, label: qRes.purchase.quantityLabel} : null)
          };
        }
        if (!pick) return {ok: false, message: 'Nothing to buy on ' + (Number(message.slot) + 1) + ' yet.'};
        var pLabel = itemLabel(pick.kind, pick.id, pick.name);
        return {ok: !!pick.affordable, message: pick.affordable ? 'Bought ' + pLabel + '.' : 'Not enough for ' + pLabel + ' yet.'};
      }
      if (message.op === 'pin') {
        if (!api.togglePin) return {ok: false, message: 'Pinning is not available.'};
        var pinned = api.togglePin(message.kind, message.id);
        if (pinned && typeof pinned === 'object' && pinned.ok !== undefined) {
          return {ok: !!pinned.ok, message: theme.text(pinned.message || (pinned.ok ? 'Pin updated.' : 'Could not pin item.'))};
        }
        var pinNow = api.pinState ? api.pinState() : pinned;
        var pinLabel = message.id ? targetLabel(message.kind, message.id) : '';
        return {ok: true, message: pinNow && pinNow.id ? 'Pinned ' + (pinLabel || itemLabel(pinNow.kind, pinNow.id, pinNow.name)) + ' to slot 1.' : 'Unpinned quick slot.'};
      }
      if (message.op === 'reserve') {
        if (!api.toggleReserve) return {ok: false, message: 'Reserve is not available.'};
        var reserved = api.toggleReserve(message.kind, message.id);
        if (reserved && typeof reserved === 'object' && reserved.ok !== undefined) {
          return {ok: !!reserved.ok, message: theme.text(reserved.message || (reserved.ok ? 'Reserve updated.' : 'Could not update reserve.'))};
        }
        var resNow = api.reserveState ? api.reserveState() : reserved;
        var resLabel = message.id ? targetLabel(message.kind, message.id) : '';
        return {ok: true, message: resNow && resNow.id ? 'Saving toward ' + (resLabel || itemLabel(resNow.kind, resNow.id, resNow.name)) + '.' : 'Reserve cleared.'};
      }
      if (message.op === 'eventChoice') {
        if (!api.chooseEvent) return {ok: false, message: 'No active event choice.'};
        var chosen = api.chooseEvent(message.choice);
        if (!chosen) return {ok: false, message: 'The event has already ended.'};
        if (typeof chosen === 'object' && chosen.ok !== undefined) {
          return {ok: !!chosen.ok, message: theme.text(chosen.message || (chosen.ok ? 'Choice applied.' : 'The event has already ended.'))};
        }
        return {ok: true, message: theme.text(chosen.message || chosen.title || 'Choice applied.')};
      }
      if (message.op === 'expedition') {
        if (message.action === 'cancel') {
          if (!api.cancelExpedition) return {ok: false, message: 'No expedition to cancel.'};
          var cancelled = api.cancelExpedition();
          if (cancelled && typeof cancelled === 'object' && cancelled.ok !== undefined) {
            return {ok: !!cancelled.ok, message: theme.text(cancelled.message || (cancelled.ok ? 'Expedition cancelled.' : 'No active expedition.'))};
          }
          return {ok: !!cancelled, message: cancelled ? 'Expedition cancelled.' : 'No active expedition.'};
        }
        if (!api.startExpedition) return {ok: false, message: 'Expeditions are not available.'};
        var startedExp = api.startExpedition(message.id);
        if (startedExp && typeof startedExp === 'object' && startedExp.ok !== undefined) {
          return {ok: !!startedExp.ok, message: theme.text(startedExp.message || (startedExp.ok ? 'Expedition started.' : 'Could not start expedition.'))};
        }
        return {ok: !!startedExp, message: startedExp ? (startedExp.label || 'Expedition') + ' started.' : 'An expedition is already underway.'};
      }
      return {ok: false, message: 'Unsupported command.'};
    }
    function command(message) {
      if (typeof message.rid !== 'string') return;
      var started = Date.now();
      var result = results[message.rid];
      if (!result) {
        var outcome;
        try { outcome = run(message); } catch (error) { outcome = {ok: false, message: 'Action failed.'}; }
        var view = cleanView(message.view);
        result = {t: 'result', rid: message.rid, ok: outcome.ok, message: outcome.message, code: outcome.code || '', bought: outcome.bought || null, key: viewKey(view), session: session};
        if (api.open()) {
          var built = build(view, Date.now());
          if (built) { result.data = built.data; result.catalog = built.catalog; result.icons = built.icons; }
        }
        results[message.rid] = result;
        resultOrder.push(message.rid);
        if (resultOrder.length > 128) delete results[resultOrder.shift()];
        stats.commands++;
        stats.commandMs += Date.now() - started;
      }
      send(result);
    }
    // Notifications for phones: a few at most, one every EVENT_GAP, dropped when nobody listens.
    function flushEvents() {
      eventTimer = null;
      var next = events.shift();
      if (!next) return;
      if (send({t: 'event', title: next.title, text: next.text})) stats.events++;
      if (events.length) eventTimer = setTimeout(flushEvents, EVENT_GAP);
    }
    function event(title, text) {
      if (!connected) return;
      if (events.length >= 4) events.shift();
      events.push({title: String(title || '').slice(0, 60), text: String(text || '').slice(0, 160)});
      if (!eventTimer) eventTimer = setTimeout(flushEvents, 0);
    }
    function status() {
      var now = api.open();
      if (now === visible) return;
      visible = now;
      // Every reopening is a new session, so a command aimed at the old one is refused.
      if (visible) session = pageId + '.' + (++opens);
      send({t: 'status', session: session, visible: visible});
      updateTimer();
    }
    function params(options) {
      var nextPort = Number(options.controllerPort);
      if (nextPort > 0 && nextPort < 65536 && Math.floor(nextPort) === nextPort && nextPort !== port) { port = nextPort; if (key) reconnect(); }
      if (typeof options.controllerKey === 'string' && /^[0-9a-f]{64}$/.test(options.controllerKey) && (options.controllerKey !== key || !connected)) {
        key = options.controllerKey;
        reconnect();
      }
    }

    function el(tag, className, text) {
      var element = root.document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function drawCode(url) {
      var code = root.qrcode(0, 'M');
      code.addData(url, 'Byte');
      code.make();
      var count = code.getModuleCount();
      var scale = 5;
      var canvas = el('canvas', 'pair-code');
      canvas.width = canvas.height = (count + 8) * scale;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Pairing code for ' + url);
      var context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000';
      for (var row = 0; row < count; row++) {
        for (var column = 0; column < count; column++) {
          if (code.isDark(row, column)) context.fillRect((column + 4) * scale, (row + 4) * scale, scale, scale);
        }
      }
      return canvas;
    }
    function when(time) {
      var minutes = Math.round((Date.now() - time) / 60000);
      return minutes < 1 ? 'just now' : minutes < 60 ? minutes + ' min ago' : minutes < 1440 ? Math.round(minutes / 60) + ' h ago' : Math.round(minutes / 1440) + ' days ago';
    }
    function renderPanel() {
      var panel = api.panel;
      if (!panelOpen || !panel) return;
      var focused = root.document.activeElement && root.document.activeElement.getAttribute('data-focus');
      panel.textContent = '';
      if (!key) { panel.appendChild(el('p', '', 'The phone controller service has not started on this TV. After it is installed, close and reopen the colony with Blue.')); return; }
      if (!connected) { panel.appendChild(el('p', '', attempts > 1 ? 'The phone controller service is not answering. The colony keeps working without it.' : 'Connecting to the phone controller service…')); return; }
      if (pairing && pairing.url && pairing.expiresAt > Date.now()) {
        panel.appendChild(drawCode(pairing.url));
        panel.appendChild(el('p', 'pair-url', pairing.url));
        panel.appendChild(el('p', 'muted', 'Scan with a phone on this Wi-Fi, or type the address. The code works once and expires in 5 minutes.'));
      } else if (pairing && pairing.used) {
        panel.appendChild(el('p', '', 'Paired ' + pairing.used + '. Select New code to pair another phone.'));
      } else {
        panel.appendChild(el('p', '', pairing && pairing.error ? pairing.error : 'Select New code to show a pairing code.'));
      }
      if (!phones.length) return;
      panel.appendChild(el('h3', '', 'Paired phones'));
      phones.forEach(function (phone) {
        var row = el('div', 'paired-phone');
        row.appendChild(el('span', '', phone.name + ' · ' + (phone.connected ? 'connected' : 'seen ' + when(phone.lastSeen))));
        var forget = el('button', '', confirmForget === phone.id ? 'Confirm forget' : 'Forget');
        forget.setAttribute('data-focus', 'forget-' + phone.id);
        forget.onclick = function () {
          if (confirmForget !== phone.id) { confirmForget = phone.id; renderPanel(); return; }
          confirmForget = '';
          send({t: 'forget', id: phone.id});
        };
        row.appendChild(forget);
        panel.appendChild(row);
      });
      if (focused) {
        var again = panel.querySelector('[data-focus="' + focused + '"]');
        if (!again && focused.indexOf('forget-') === 0) again = panel.querySelector('button') || root.document.getElementById('dialog-cancel');
        if (again) again.focus();
      }
    }

    return {
      params: params,
      status: status,
      event: event,
      openPairing: function () {
        panelOpen = true;
        pairing = null;
        confirmForget = '';
        send({t: 'pair'});
        send({t: 'phones'});
        renderPanel();
      },
      closePairing: function () {
        if (!panelOpen) return;
        panelOpen = false;
        pairing = null;
        if (pairingTimer) clearTimeout(pairingTimer);
        send({t: 'pair-cancel'});
        if (api.panel) api.panel.textContent = '';
      },
      diagnostics: function () {
        return {connected: connected, session: session, visible: visible, watching: views.length, timer: !!timer, cachedResults: resultOrder.length, attempts: attempts, stats: JSON.parse(JSON.stringify(stats))};
      }
    };
  }
  root.RoachControllerLink = {start: start};
}(window));
