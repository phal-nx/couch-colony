/* Couch Colony phone controller. The TV game is the only authority: this page
   shows its latest snapshot and sends single commands, never queued ones.
   Counts arrive as formatted strings; progress and ETAs are display estimates
   computed in log space, never exact arithmetic on colony counts. */
(function () {
  'use strict';
  var CREDENTIAL = 'roach_controller_credential_v1';
  var PREFERENCES = 'roach_controller_view_v2';
  var SVG = 'http://www.w3.org/2000/svg';
  var theme = window.RoachTheme;
  var socket = null;
  var credential = read(CREDENTIAL);
  var everConnected = false;
  var status = 'connecting';
  var session = '';
  var data = null;
  var stale = true;
  var freshAt = 0;
  var screen = 'colony';
  var tabs = {unit: '', upgrade: ''};
  var quantity = 1;
  var icons = {};
  // Icons can be replaced after first paint (the illustrated sheet loads late), so cards key on a version.
  var iconVersions = {};
  var phones = [];
  var pending = {};
  var redTarget = '';
  var awaitingFresh = false;
  var retryDelay = 1000;
  var retryTimer = null;
  var toastTimer = null;
  var waitingNews = '';
  var revoked = false;
  var sheetId = '';
  var hintOpen = false;
  var confirmForget = '';
  var confirmEvo = '';
  var pendingFocus = '';
  var cards = {};
  var signatures = {};
  // iOS gives a home-screen web app its own storage, so it pairs on its own;
  // the camera opens pairing links in Safari, so it takes a pasted link instead.
  var standalone = window.navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  function el(id) { return document.getElementById(id); }
  function make(tag, className, content) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }
  function text(element, value) {
    value = String(value === undefined || value === null ? '' : value);
    if (element.textContent !== value) element.textContent = value;
  }
  function read(key) { try { return window.localStorage.getItem(key) || ''; } catch (error) { return ''; } }
  function write(key, value) {
    try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch (error) { /* Private browsing keeps this session only. */ }
  }
  function rid() {
    var bytes = new Uint8Array(12);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  // Whole-number strings get a compact form; the game's formatted values pass through.
  function compact(value) {
    if (theme && theme.compact) return theme.compact(value);
    var raw = String(value === undefined || value === null ? '' : value);
    if (!/^\d+$/.test(raw) || raw.length <= 4) return raw;
    raw = raw.replace(/^0+(?=\d)/, '');
    var group = Math.floor((raw.length - 1) / 3);
    if (group > 4) return raw.charAt(0) + (raw.slice(1, 3).replace(/0+$/, '') ? '.' + raw.slice(1, 3).replace(/0+$/, '') : '') + 'e' + (raw.length - 1);
    var lead = raw.length - group * 3;
    var decimals = raw.slice(lead, lead + Math.max(0, 3 - lead)).replace(/0+$/, '');
    return raw.slice(0, lead) + (decimals ? '.' + decimals : '') + ['', 'K', 'M', 'B', 'T'][group];
  }
  var SUFFIX = {K: 3, M: 6, B: 9, T: 12, Q: 15, Qa: 15, Qi: 18, Sx: 21, Sp: 24, Oc: 27, No: 30, Dc: 33};
  // log10 of a formatted amount such as "6.56M", "3.8e18" or "1e+300"; null when unreadable.
  function magnitude(value) {
    if (theme && theme.magnitude) return theme.magnitude(value);
    var match = /^([\d.]+)(?:e\+?(-?\d+))?\s*([A-Z][a-z]?)?$/.exec(String(value || '').replace(/,/g, '').trim());
    if (!match) return null;
    var base = parseFloat(match[1]);
    if (!(base >= 0) || (match[3] && SUFFIX[match[3]] === undefined)) return null;
    if (base === 0) return -Infinity;
    return Math.log(base) / Math.LN10 + (match[2] ? Number(match[2]) : 0) + (match[3] ? SUFFIX[match[3]] : 0);
  }
  function duration(seconds) {
    if (seconds < 1) return 'any moment';
    if (seconds < 90) return '~ ' + Math.ceil(seconds) + ' s';
    if (seconds < 5400) return '~ ' + Math.round(seconds / 60) + ' min';
    if (seconds < 86400) return '~ ' + Math.round(seconds / 3600) + ' h';
    return 'over a day';
  }
  // Progress (0..1) and an ETA toward one cost part from the stock and rate already shown.
  function partProgress(part) {
    if (theme && theme.partProgress) return theme.partProgress(part);
    var have = magnitude(part.have);
    var need = magnitude(part.need);
    if (have === null || need === null) return {known: false, short: false, pct: 0, eta: null};
    if (have >= need) return {known: true, short: false, pct: 1, eta: 0};
    var ratio = Math.pow(10, have - need);
    var rate = magnitude(part.rate);
    var eta = null;
    if (rate !== null && rate > -Infinity) {
      var left = need + Math.log(1 - ratio) / Math.LN10 - rate;
      eta = left > 8 ? Infinity : Math.pow(10, left);
    }
    return {known: true, short: true, pct: ratio, eta: eta};
  }
  function itemProgress(costs) {
    if (theme && theme.itemProgress) return theme.itemProgress(costs);
    var pct = 1;
    var eta = 0;
    var unknown = false;
    (costs || []).forEach(function (part) {
      var progress = partProgress(part);
      if (!progress.short) return;
      pct = Math.min(pct, progress.pct);
      if (progress.eta === null) unknown = true;
      else eta = Math.max(eta, progress.eta);
    });
    return {pct: pct, eta: unknown ? null : eta};
  }
  function etaText(progress) {
    if (progress.pct >= 1) return 'ready';
    return progress.eta === null ? '' : duration(progress.eta);
  }
  // Pixel bars light whole segments only, so a block appears once its share is fully earned.
  // Each bar holds its segments from the start; data-segments sets how many (10 by default).
  function setBar(bar, pct) {
    if (!bar.firstChild || bar.firstChild.tagName !== 'I') segment(bar);
    var value = Math.max(0, Math.min(100, Math.floor(pct * 100 + 1e-6)));
    if (bar.getAttribute('aria-valuenow') === String(value)) return;
    bar.setAttribute('aria-valuenow', String(value));
    var segments = bar.children;
    var lit = Math.floor(value * segments.length / 100);
    for (var i = 0; i < segments.length; i++) segments[i].className = i < lit ? 'on' : '';
  }
  function segment(bar) {
    var count = Number(bar.getAttribute('data-segments')) || 10;
    bar.textContent = '';
    for (var i = 0; i < count; i++) bar.appendChild(make('i'));
    return bar;
  }
  // Restarts a one-shot CSS animation by alternating two class names, then clears them.
  function flash(element, name, ms) {
    if (!element) return;
    var first = !element.classList.contains(name + '-a');
    element.classList.remove(name + '-a', name + '-b');
    element.classList.add(name + (first ? '-a' : '-b'));
    clearTimeout(element[name + 'Timer']);
    element[name + 'Timer'] = setTimeout(function () { element.classList.remove(name + '-a', name + '-b'); }, ms);
  }
  // Pixel icons arrive as data URLs: units keyed by id, everything else by '#' + atlas slug.
  function iconKey(entry) { return entry.kind === 'unit' ? entry.id : entry.icon ? '#' + entry.icon : ''; }
  function picture(key, className) {
    var image = make('img', className);
    image.alt = '';
    image.src = icons[key];
    return image;
  }
  function metaKey(name) { return data && data.meta && data.meta[name] ? '#' + data.meta[name] : ''; }
  function renderMetaIcons() {
    Array.prototype.forEach.call(document.querySelectorAll('img[data-meta]'), function (image) {
      var source = icons[metaKey(image.getAttribute('data-meta'))] || '';
      if (source && image.getAttribute('src') !== source) image.src = source;
      image.hidden = !source;
    });
  }
  function bar(className) {
    var element = make('div', 'bar ' + (className || ''));
    element.setAttribute('role', 'progressbar');
    element.setAttribute('aria-valuemin', '0');
    element.setAttribute('aria-valuemax', '100');
    return segment(element);
  }
  function resource(id) { return data && (data.resources || []).filter(function (entry) { return entry.id === id; })[0]; }
  function ago(time) {
    var seconds = Math.max(0, (Date.now() - time) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.round(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.round(seconds / 3600) + ' h ago';
    return Math.round(seconds / 86400) + ' days ago';
  }
  function svgIcon(paths) {
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) {
      var path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  // ---- Toast ----
  // Colony news never covers the answer to a tap; it waits for that toast to finish.
  function toast(message, warn, news) {
    var box = el('toast');
    if (news && !box.hidden && !box.classList.contains('news')) { waitingNews = message; return; }
    box.textContent = '';
    if (!warn && !news) {
      var check = svgIcon(['M5 12.5l4.5 4.5L19 7.5']);
      check.setAttribute('width', '16');
      check.setAttribute('height', '16');
      box.appendChild(check);
    }
    box.appendChild(document.createTextNode(message));
    box.className = 'toast' + (warn ? ' warn' : news ? ' news' : '');
    box.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    // The toast slides out briefly before it hides; a new one in the meantime replaces it.
    toastTimer = setTimeout(function () {
      box.classList.add('leaving');
      toastTimer = setTimeout(function () {
        box.hidden = true;
        box.classList.remove('leaving');
        var next = waitingNews;
        waitingNews = '';
        if (next) toast(next, false, true);
      }, 200);
    }, warn || news ? 3200 : 1800);
  }

  // ---- Connection ----
  function live() { return status === 'live' && socket && socket.readyState === 1; }
  function send(message) {
    if (!socket || socket.readyState !== 1) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
  function view() {
    if (screen === 'colony') return {list: 'unit', tab: tabs.unit, quantity: quantity};
    if (screen === 'upgrades') return {list: 'upgrade', tab: tabs.upgrade, quantity: 1};
    return {list: screen === 'achievements' || screen === 'visitors' ? screen : 'more', tab: '', quantity: 1};
  }
  function key() { var current = view(); return current.list + '|' + current.tab + '|' + current.quantity; }
  function sendView() { send({t: 'view', view: view(), visible: !document.hidden}); }
  function deviceName() {
    var agent = navigator.userAgent;
    var name = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Android/.test(agent) ? 'Android phone' : 'Phone';
    return standalone ? name + ' (Home Screen)' : name;
  }
  function showPairing(message) {
    credential = '';
    status = 'unpaired';
    el('pairing-message').hidden = !message;
    text(el('pairing-message'), message || '');
    render();
  }
  function pair(token) {
    status = 'pairing';
    render();
    var request = new XMLHttpRequest();
    request.open('POST', '/api/pair');
    request.setRequestHeader('Content-Type', 'application/json');
    request.timeout = 10000;
    request.onload = function () {
      var body = {};
      try { body = JSON.parse(request.responseText); } catch (error) { /* Handled below. */ }
      if (request.status === 200 && body.credential) {
        credential = body.credential;
        revoked = false;
        write(CREDENTIAL, credential);
        toast('Paired as ' + body.name);
        connect();
      } else showPairing(body.error || 'Pairing failed. Open Phone controller on the TV for a new code.');
    };
    request.onerror = request.ontimeout = function () { showPairing('Could not reach the TV. Check that this phone is on the same Wi-Fi.'); };
    request.send(JSON.stringify({token: token, name: deviceName()}));
  }
  function pairFromInput() {
    var value = el('pair-code-input').value.trim();
    var token = /[?&]pair=([A-Za-z0-9_-]+)/.exec(value) || /^([A-Za-z0-9_-]{8,64})$/.exec(value);
    if (!token) { showPairing('That is not a pairing link. Copy the whole link, or type the code after pair= on the TV.'); return; }
    el('pair-code-input').value = '';
    el('pair-code-input').blur();
    pair(token[1]);
  }
  function connect() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (!credential || revoked) return;
    var current;
    try { current = socket = new WebSocket('ws://' + location.host + '/ws'); } catch (error) { reconnectLater(); return; }
    socket.onopen = function () {
      retryDelay = 1000;
      send({t: 'hello', credential: credential, visible: !document.hidden, view: view()});
    };
    socket.onmessage = function (event) { if (socket === current) receive(event.data); };
    socket.onclose = function () {
      if (socket !== current) return;
      socket = null;
      // Anything in flight is unknown now; the next fresh state decides what happened.
      Object.keys(pending).forEach(function (id) { clearTimeout(pending[id].timer); });
      if (Object.keys(pending).length) awaitingFresh = true;
      pending = {};
      if (revoked) return;
      status = 'reconnecting';
      render();
      reconnectLater();
    };
  }
  function reconnectLater() {
    if (retryTimer || document.hidden) return;
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(15000, retryDelay * 2);
  }
  function receive(raw) {
    var message;
    try { message = JSON.parse(raw); } catch (error) { return; }
    if (message.t === 'welcome') {
      everConnected = true;
      merge(message.icons);
    } else if (message.t === 'status') {
      session = message.session || '';
      status = message.game === 'live' ? 'live' : 'paused';
      if (status !== 'live') stale = true;
      render();
    } else if (message.t === 'state') {
      if (message.key === key()) accept(message.data, message.stale);
    } else if (message.t === 'catalog') {
      merge(message.icons);
    } else if (message.t === 'phones') {
      phones = message.phones || [];
      render();
    } else if (message.t === 'result') {
      result(message);
    } else if (message.t === 'revoked') {
      revoked = true;
      write(CREDENTIAL, '');
      showPairing('This phone is not paired, or it was forgotten. Open Phone controller on the TV to pair again.');
    } else if (message.t === 'event') {
      // The colony's own notifications: achievements, guests, the night shift.
      toast(message.title + (message.text ? ' · ' + message.text : ''), false, true);
    } else if (message.t === 'error') {
      toast(message.message, true);
    }
  }
  function merge(images) { Object.keys(images || {}).forEach(function (id) { if (icons[id] !== images[id]) iconVersions[id] = (iconVersions[id] || 0) + 1; icons[id] = images[id]; }); }
  function accept(next, isStale) {
    if (!next) return;
    data = next;
    stale = !!isStale;
    if (!isStale) { awaitingFresh = false; freshAt = Date.now(); }
    var list = next.list === 'unit' ? 'unit' : next.list === 'upgrade' ? 'upgrade' : '';
    if (list && next.tab && tabs[list] !== next.tab && view().list === list) {
      // The game chose the first category for this list; follow it.
      tabs[list] = next.tab;
      savePreferences();
      sendView();
    }
    render();
    if (pendingFocus) {
      var node = shownCard(pendingFocus);
      if (node) {
        node.scrollIntoView({block: 'center'});
        flash(node, 'wash', 500);
        pendingFocus = '';
      }
    }
  }

  // ---- Commands ----
  function command(op, extra, busyKey) {
    if (op !== 'show' && op !== 'hide' && !live()) { toast(status === 'reconnecting' ? 'Reconnecting to the TV…' : 'Open the colony to play.', true); return; }
    if (awaitingFresh && op !== 'show' && op !== 'hide') { toast('Checking the colony before another try…', true); send({t: 'refresh'}); return; }
    busyKey = busyKey || op;
    if (busy(busyKey)) return;
    var id = rid();
    var message = {t: 'cmd', rid: id, session: session, op: op};
    Object.keys(extra || {}).forEach(function (name) { message[name] = extra[name]; });
    if (!send(message)) { toast('Reconnecting to the TV…', true); return; }
    pending[id] = {busy: busyKey, op: op, timer:setTimeout(function () {
      if (!pending[id]) return;
      delete pending[id];
      awaitingFresh = true;
      toast('No answer yet. Checking the colony before you try again…', true);
      send({t: 'refresh'});
      render();
    }, 10000)};
    render();
  }
  function busy(busyKey) { return Object.keys(pending).some(function (id) { return pending[id].busy === busyKey; }); }
  function result(message) {
    var entry = pending[message.rid];
    if (!entry) return;
    clearTimeout(entry.timer);
    delete pending[message.rid];
    if (message.uncertain || message.code === 'session') { awaitingFresh = true; send({t: 'refresh'}); }
    if (message.code === 'session') session = message.session || session;
    toast(message.message || (message.ok ? 'Done.' : 'That did not work.'), !message.ok);
    if (message.data && message.key === key()) accept(message.data, false);
    else render();
    if (message.ok) acknowledge(entry.op, message.bought);
  }
  // One short answer per success: the bought card washes and its count pops with a tick of
  // vibration, and a forage tosses a few crumbs off the Forage button.
  function acknowledge(op, bought) {
    if (op === 'forage') flash(el('forage-crumbs'), 'toss', 700);
    if (!bought) return;
    ['unit', 'ready', 'saving'].forEach(function (mode) {
      var built = cards[mode + bought.kind + ':' + bought.id];
      if (!built || !built.element.parentNode) return;
      flash(built.element, 'wash', 500);
      flash(built.owned, 'pop', 320);
    });
    if (navigator.vibrate) navigator.vibrate(8);
  }

  // ---- Colony ----
  function renderResources(container, ids, focus) {
    var list = ids.map(resource).filter(Boolean);
    list.forEach(function (entry, index) {
      var tile = container.children[index];
      if (!tile) {
        tile = make('button', 'resource');
        tile.type = 'button';
        tile.appendChild(make('span', 'label'));
        tile.appendChild(make('span', 'amount display num'));
        tile.appendChild(make('span', 'rate num'));
        tile.onclick = function () { openSheet(tile.getAttribute('data-id')); };
        container.appendChild(tile);
      }
      tile.setAttribute('data-id', entry.id);
      tile.classList.toggle('focus', entry.id === focus);
      tile.setAttribute('aria-label', entry.label + ' ' + entry.amount + ', details');
      text(tile.children[0], entry.label);
      text(tile.children[1], compact(entry.amount));
      text(tile.children[2], entry.rate && entry.rate !== '0' ? '+' + entry.rate + '/s' : '');
    });
    while (container.children.length > list.length) container.removeChild(container.lastChild);
  }
  function third() { return tabs.unit === 'energy' ? 'energy' : 'territory'; }
  function renderLeader() {
    // Until the first forager there is no leader, only the goal that wakes the nest.
    el('leader').onclick = function () { if (data && data.leader) focusCard('unit', (data.leader.next || data.leader).id); };
    var goal = data && data.dormant ? data.goal || '' : '';
    el('goal').hidden = !goal;
    text(el('goal'), goal);
    var leader = data && data.leader;
    el('leader').hidden = !leader;
    if (!leader) return;
    var image = el('leader-icon');
    if (icons[leader.id] && image.getAttribute('src') !== icons[leader.id]) image.src = icons[leader.id];
    image.hidden = !icons[leader.id];
    text(el('leader-count'), compact(leader.count));
    text(el('leader-name'), leader.label);
    var rateEl = el('leader-rate');
    if (rateEl) {
      text(rateEl, leader.rate ? '+' + compact(leader.rate) + '/s' : '');
      rateEl.hidden = !leader.rate;
    }
    text(el('leader-next'), leader.next ? 'Next: ' + leader.next.label : 'The most advanced roach so far');
    var next = leader.next && (data.items || []).filter(function (item) { return item.kind === 'unit' && item.id === leader.next.id; })[0];
    var progress = next ? itemProgress(next.costs) : null;
    text(el('leader-eta'), progress ? etaText(progress) : '');
    el('leader-bar').hidden = !progress;
    if (progress) {
      setBar(el('leader-bar'), progress.pct);
      el('leader-bar').setAttribute('aria-label', 'Progress to the next ' + leader.next.label);
    }
  }
  // The TV's key 0 hint, folded under the goal or leader card until tapped. A dormant colony's goal is
  // already on screen, so the hint leaves it out.
  function renderHint() {
    var hint = data && data.hint;
    el('hint').hidden = !hint;
    if (!hint) return;
    el('hint-body').hidden = !hintOpen;
    el('hint-toggle').setAttribute('aria-expanded', String(hintOpen));
    text(el('hint-text'), hint.text);
    var goal = hint.goal && !data.dormant ? 'Next goal: ' + hint.goal : '';
    text(el('hint-goal'), goal);
    el('hint-goal').hidden = !goal;
    el('hint-goal').onclick = function () {
      var target = data && data.hint && data.hint.target;
      if (!target) return;
      if (target.kind === 'ascend') {
        choose({screen: 'more'});
        var evolution = el('evolution');
        if (evolution && !evolution.hidden) evolution.scrollIntoView({block: 'center'});
        return;
      }
      focusCard(target.kind, target.id);
    };
  }
  function renderTabs(container, list, chips) {
    var entries = data && data.list === list ? data.tabs || [] : [];
    container.hidden = entries.length <= 1 && !chips;
    var counts = chips ? (data && data.list === list ? (data.items || []).filter(function (item) { return item.available; }).length : 0) : 0;
    var signature = JSON.stringify(entries);
    if (container.getAttribute('data-signature') !== signature) {
      container.setAttribute('data-signature', signature);
      container.textContent = '';
      entries.forEach(function (tab) {
        var button = make('button', '', tab.label);
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('data-tab', tab.id);
        if (chips) button.appendChild(make('span', 'count num'));
        button.onclick = function () { choose({tab: tab.id}); };
        container.appendChild(button);
      });
    }
    Array.prototype.forEach.call(container.children, function (button) {
      var on = button.getAttribute('data-tab') === tabs[list];
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', String(on));
      if (chips) text(button.lastChild, on && counts ? counts : '');
    });
  }
  function glyph(entry) {
    var box = make('div', 'glyph');
    box.setAttribute('aria-hidden', 'true');
    if (icons[iconKey(entry)]) box.appendChild(picture(iconKey(entry)));
    else box.appendChild(svgIcon(entry.verb ? ['M13 2L4 14h7l-1 8 9-12h-7l1-8z'] : ['M12 19V5M6 11l6-6 6 6']));
    return box;
  }
  function buyLabel(entry) {
    if (!entry.available) return 'Not yet';
    if (entry.verb) return entry.verb;
    if (entry.kind === 'upgrade') return 'Upgrade';
    return (quantity === 'max' ? 'Max ' : 'Buy ') + compact(entry.qtyLabel);
  }
  function buy(entry, id) {
    if (!entry.available) {
      toast(entry.note || 'Not enough yet: ' + (entry.costs || []).map(function (part) { return part.label; }).join(' + '), true);
      return;
    }
    command('buy', {kind: entry.kind, id: entry.id, quantity: entry.kind === 'upgrade' ? 1 : quantity}, 'buy:' + id);
  }
  // A card's elements are built once per shape and then updated in place, so a tap is
  // never lost to the once-a-second refresh replacing the button under the finger.
  function card(entry, mode) {
    var id = entry.kind + ':' + entry.id;
    var shape = JSON.stringify([entry.kind, !!entry.verb, entry.available, (entry.costs || []).length, iconVersions[iconKey(entry)] || 0,!!entry.effect, !!entry.brief]);
    var existing = cards[mode + id];
    var built = existing && existing.shape === shape ? existing : createCard(entry, mode, id);
    built.shape = shape;
    if (existing && existing !== built && existing.element.parentNode) existing.element.parentNode.replaceChild(built.element, existing.element);
    cards[mode + id] = built;
    updateCard(built, entry, mode, id);
    return built.element;
  }
  function createCard(entry, mode, id) {
    var built = {entry: entry, chips: []};
    var article = make('article', 'card' + (mode === 'saving' ? ' saving' : mode === 'ready' ? ' upgrade' : ''));
    article.setAttribute('data-id', id);
    built.element = article;
    built.action = make('button', 'buy');
    built.action.type = 'button';
    built.action.onclick = function () { buy(built.entry, id); };
    built.auto = make('button', 'auto', 'Auto');
    built.auto.type = 'button';
    built.auto.appendChild(make('span', 'track'));
    built.auto.onclick = function () { command('auto', {kind: built.entry.kind, id: built.entry.id}, 'auto:' + id); };
    built.impact = make('span', 'impact num');
    built.impact.hidden = true;
    built.tools = make('div', 'card-tools');
    built.producerBtn = make('button', 'meta-btn producer-btn');
    built.producerBtn.type = 'button';
    built.producerBtn.onclick = function () {
      var p = built.entry.bottleneck && built.entry.bottleneck.producer;
      if (p) focusCard(p.kind, p.id);
    };
    built.pinBtn = make('button', 'meta-btn pin-btn');
    built.pinBtn.type = 'button';
    built.pinBtn.onclick = function () { command('pin', {kind: built.entry.kind, id: built.entry.id}, 'pin:' + id); };
    built.reserveBtn = make('button', 'meta-btn reserve-btn');
    built.reserveBtn.type = 'button';
    built.reserveBtn.onclick = function () { command('reserve', {kind: built.entry.kind, id: built.entry.id}, 'reserve:' + id); };
    built.tools.appendChild(built.producerBtn);
    built.tools.appendChild(built.pinBtn);
    built.tools.appendChild(built.reserveBtn);
    built.title = make('h3');
    built.owned = make('span', 'owned num');
    var title = make('div', 'card-title');
    title.appendChild(built.title);
    title.appendChild(built.owned);
    if (mode === 'saving') {
      var top = make('div', 'saving-top');
      if (icons[iconKey(entry)]) title.insertBefore(picture(iconKey(entry), 'saving-icon'), title.firstChild);
      top.appendChild(title);
      built.eta = make('span', 'eta num');
      top.appendChild(built.eta);
      article.appendChild(top);
      article.appendChild(built.impact);
      built.needs = make('span', 'needs num');
      article.appendChild(built.needs);
      built.bar = bar('thin quiet');
      article.appendChild(built.bar);
      article.appendChild(built.auto);
      article.appendChild(built.tools);
      return built;
    }
    var head = make('div', 'card-top');
    head.appendChild(glyph(entry));
    var words = make('div', 'card-words');
    words.appendChild(title);
    if (mode === 'ready') {
      built.effect = make('span', 'effect');
      built.brief = make('span', 'brief');
      words.appendChild(built.effect);
      words.appendChild(built.impact);
      words.appendChild(built.brief);
    } else {
      built.line = make('span', 'card-line');
      words.appendChild(built.line);
      words.appendChild(built.impact);
    }
    head.appendChild(words);
    if (mode !== 'ready') head.appendChild(built.action);
    article.appendChild(head);
    var costs = make('div', mode === 'ready' ? 'upgrade-actions' : 'card-costs');
    (entry.costs || []).forEach(function () {
      var element = make('span', 'chip num');
      built.chips.push(element);
      costs.appendChild(element);
    });
    costs.appendChild(make('span', 'spacer'));
    costs.appendChild(built.auto);
    if (mode === 'ready') costs.appendChild(built.action);
    article.appendChild(costs);
    if (!entry.available && mode !== 'ready') {
      built.bar = bar('thin quiet');
      article.appendChild(built.bar);
    }
    article.appendChild(built.tools);
    return built;
  }
  function updateCard(built, entry, mode, id) {
    built.entry = entry;
    var progress = itemProgress(entry.costs);
    var working = busy('buy:' + id);
    text(built.title, entry.label);
    text(built.owned, mode === 'unit' && entry.verb ? '' : entry.kind === 'upgrade' ? 'Lv ' + compact(entry.owned) : '× ' + compact(entry.owned) + (entry.rate && entry.rate !== '0' ? ' · +' + compact(entry.rate) + '/s' : ''));
    built.action.className = 'buy' + (entry.available ? '' : ' not-yet') + (working ? ' busy' : '');
    text(built.action, working ? '…' : buyLabel(entry));
    built.action.disabled = working || !live() || awaitingFresh;
    built.action.setAttribute('aria-label', entry.available ? buyLabel(entry) + ' ' + entry.label : entry.label + ' is not affordable yet');
    built.auto.classList.toggle('on', !!entry.auto);
    built.auto.setAttribute('aria-pressed', String(!!entry.auto));
    built.auto.setAttribute('aria-label', 'Auto-buy ' + entry.label);
    built.auto.disabled = !live() || busy('auto:' + id);
    if (built.line) text(built.line, entry.production || entry.effect || entry.brief);
    if (built.effect) { text(built.effect, entry.effect); built.effect.hidden = !entry.effect; }
    if (built.brief) { text(built.brief, entry.brief); built.brief.hidden = !entry.brief; }
    if (built.impact) {
      var imp = entry.impact ? entry.impact.charAt(0).toUpperCase() + entry.impact.slice(1) : '';
      text(built.impact, imp);
      built.impact.hidden = !imp;
    }
    if (built.eta) text(built.eta, etaText(progress));
    if (built.needs) text(built.needs, (entry.effect ? entry.effect + ' · ' : '') + 'needs ' + (entry.costs || []).map(function (part) { return part.label; }).join(' + '));
    built.chips.forEach(function (element, index) {
      var part = entry.costs[index];
      var short = partProgress(part).short;
      element.className = 'chip num' + (short ? ' short' : '');
      text(element, short ? compact(part.have) + ' / ' + part.label : part.label);
    });
    if (built.bar) {
      setBar(built.bar, progress.pct);
      built.bar.setAttribute('aria-label', 'Progress toward ' + entry.label);
    }
    var producer = !entry.available && entry.bottleneck && entry.bottleneck.short && entry.bottleneck.producer ? entry.bottleneck.producer : null;
    if (built.producerBtn) {
      text(built.producerBtn, producer ? 'Produced by ' + producer.label : '');
      built.producerBtn.hidden = !producer;
    }
    var isPinned = !!(data && data.pin && (data.pin.kind || data.pin.type) === entry.kind && data.pin.id === entry.id);
    var isReserved = !!(data && data.reserve && (data.reserve.kind || data.reserve.type) === entry.kind && data.reserve.id === entry.id);
    if (built.pinBtn) {
      built.pinBtn.hidden = !!entry.verb;
      built.pinBtn.classList.toggle('on', isPinned);
      built.pinBtn.setAttribute('aria-pressed', String(isPinned));
      text(built.pinBtn, isPinned ? 'Pinned' : 'Pin');
      built.pinBtn.disabled = !live() || busy('pin:' + id);
    }
    if (built.reserveBtn) {
      built.reserveBtn.hidden = !!entry.verb;
      built.reserveBtn.classList.toggle('on', isReserved);
      built.reserveBtn.setAttribute('aria-pressed', String(isReserved));
      text(built.reserveBtn, isReserved ? 'Saving toward' : 'Save toward');
      built.reserveBtn.disabled = !live() || busy('reserve:' + id);
    }
    if (built.tools) {
      built.tools.hidden = built.producerBtn.hidden && built.pinBtn.hidden && built.reserveBtn.hidden;
    }
  }
  function fill(container, entries, mode) {
    var keep = {};
    entries.forEach(function (entry, index) {
      var element = card(entry, mode);
      keep[mode + entry.kind + ':' + entry.id] = true;
      if (container.children[index] !== element) container.insertBefore(element, container.children[index] || null);
    });
    while (container.children.length > entries.length) container.removeChild(container.lastChild);
    Object.keys(cards).forEach(function (name) { if (name.indexOf(mode) === 0 && !keep[name]) delete cards[name]; });
  }
  var EXPEDITION_SPECS = [
    {id: 'pantry', label: 'Pantry recon', detail: '90s · +2m crumbs, +45s hatchlings'},
    {id: 'baseboard', label: 'Baseboard survey', detail: '2m · +2.5m territory, +1m crumbs'},
    {id: 'cellar', label: 'Deep pipe trek', detail: '2.5m · +2m hatchlings, +35s energy, visitor'}
  ];
  function reserveLabel(res) {
    if (!res) return '';
    if (res.label) return res.label;
    var rKind = res.kind || res.type;
    if (theme) return rKind === 'upgrade' ? theme.upgradeLabel(res.id, res.name) : theme.label(res.id, res.name);
    return res.name || res.id;
  }
  function renderEventChoice(containerId) {
    var box = el(containerId);
    if (!box) return;
    var choice = data && data.eventChoice;
    box.hidden = !choice;
    if (!choice) return;
    var sig = JSON.stringify([choice, live(), awaitingFresh, busy('eventChoice')]);
    if (box.getAttribute('data-signature') === sig) return;
    box.setAttribute('data-signature', sig);
    box.textContent = '';
    var head = make('div', 'panel-head');
    var titled = make('div', 'titled');
    var icon = make('img', 'status-icon');
    icon.src = 'ui-art/status_choice.png';
    icon.width = 24;
    icon.height = 24;
    icon.alt = '';
    titled.appendChild(icon);
    titled.appendChild(make('h2', '', choice.title || 'Chance event'));
    head.appendChild(titled);
    box.appendChild(head);
    var actions = make('div', 'event-choice-actions');
    var defBtn = make('button', 'choice-btn default-choice', choice.defaultLabel || 'Catch now');
    defBtn.type = 'button';
    defBtn.disabled = !live() || awaitingFresh || busy('eventChoice');
    defBtn.onclick = function () { command('eventChoice', {choice: 'default'}, 'eventChoice'); };
    var altBtn = make('button', 'choice-btn alt-choice', choice.altLabel || 'Incubate');
    altBtn.type = 'button';
    altBtn.disabled = !live() || awaitingFresh || busy('eventChoice');
    altBtn.onclick = function () { command('eventChoice', {choice: 'nursery'}, 'eventChoice'); };
    actions.appendChild(defBtn);
    actions.appendChild(altBtn);
    box.appendChild(actions);
  }
  function renderReserveBanner(containerId) {
    var box = el(containerId);
    if (!box) return;
    var res = data && data.reserve && data.reserve.id ? data.reserve : null;
    box.hidden = !res;
    if (!res) return;
    var sig = JSON.stringify([res, live(), awaitingFresh, busy('reserve:clear')]);
    if (box.getAttribute('data-signature') === sig) return;
    box.setAttribute('data-signature', sig);
    box.textContent = '';
    var info = make('div', 'reserve-info');
    var icon = make('img', 'status-icon');
    icon.src = 'ui-art/status_reserve.png';
    icon.width = 24;
    icon.height = 24;
    icon.alt = '';
    info.appendChild(icon);
    var pct = typeof res.progress === 'number' ? ' (' + Math.floor(res.progress * 100) + '%)' : '';
    var copy = make('span', '', 'Saving toward ');
    copy.appendChild(make('b', '', reserveLabel(res)));
    if (pct) copy.appendChild(document.createTextNode(pct));
    info.appendChild(copy);
    box.appendChild(info);
    var clear = make('button', 'small-button clear-reserve', 'Clear reserve');
    clear.type = 'button';
    clear.disabled = !live() || awaitingFresh || busy('reserve:clear');
    clear.onclick = function () { command('reserve', {kind: '', id: ''}, 'reserve:clear'); };
    box.appendChild(clear);
  }
  function renderQuick() {
    var container = el('phone-quick');
    if (!container) return;
    var picks = data && Array.isArray(data.quick) ? data.quick : [];
    container.hidden = !picks.length;
    picks.forEach(function (pick, index) {
      var btn = container.children[index];
      if (!btn) {
        btn = make('button', 'quick-btn');
        btn.type = 'button';
        var pinImg = make('img', 'quick-pin');
        pinImg.src = 'ui-art/status_pin.png';
        pinImg.width = 16;
        pinImg.height = 16;
        pinImg.alt = 'Pinned';
        btn.appendChild(pinImg);
        btn.appendChild(make('span', 'quick-label'));
        btn.appendChild(make('span', 'quick-badge num'));
        btn.onclick = function () {
          var s = Number(btn.getAttribute('data-slot'));
          command('quickBuy', {slot: s}, 'quick:' + s);
        };
        container.appendChild(btn);
      }
      btn.setAttribute('data-slot', String(pick.slot));
      btn.setAttribute('data-id', pick.kind + ':' + pick.id);
      btn.classList.toggle('affordable', !!pick.affordable);
      btn.classList.toggle('pinned', !!pick.pinned);
      btn.children[0].hidden = !pick.pinned;
      text(btn.children[1], pick.label);
      var badge = pick.affordable ? '×' + (pick.gain || '1') : Math.floor((pick.progress || 0) * 100) + '%';
      text(btn.children[2], badge);
      btn.disabled = !live() || awaitingFresh || busy('quick:' + pick.slot);
      btn.setAttribute('aria-label', (pick.pinned ? 'Pinned: ' : '') + pick.label + ' ' + badge);
    });
    while (container.children.length > picks.length) container.removeChild(container.lastChild);
  }
  function renderColony() {
    renderResources(el('resources'), ['meat', 'larva', third()], tabs.unit === third() ? third() : '');
    renderLeader();
    renderHint();
    renderEventChoice('colony-event-choice');
    renderReserveBanner('colony-reserve');
    renderQuick();
    renderTabs(el('tabs'), 'unit', false);
    Array.prototype.forEach.call(el('quantity').children, function (button) {
      var on = button.getAttribute('data-quantity') === String(quantity);
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    var items = data && data.list === 'unit' ? data.items || [] : [];
    fill(el('units'), items, 'unit');
    el('units-empty').hidden = !data || data.list !== 'unit' || items.length > 0;
  }

  // ---- Upgrades ----
  function renderUpgrades() {
    var inline = el('inline-resources');
    var ids = ['meat', 'larva', 'territory'];
    if (tabs.upgrade === 'energy' || tabs.upgrade === 'mutagen') ids.push(tabs.upgrade);
    var parts = ids.map(resource).filter(Boolean);
    var signature = JSON.stringify(parts);
    if (signatures.inline !== signature) {
      signatures.inline = signature;
      inline.textContent = '';
      parts.forEach(function (entry) {
        var span = make('span');
        span.appendChild(make('b', '', compact(entry.amount)));
        span.appendChild(document.createTextNode(' ' + entry.label.toLowerCase()));
        span.onclick = function () { openSheet(entry.id); };
        inline.appendChild(span);
      });
    }
    renderTabs(el('groups'), 'upgrade', true);
    var items = data && data.list === 'upgrade' ? data.items || [] : [];
    var ready = items.filter(function (item) { return item.available; });
    var saving = items.filter(function (item) { return !item.available; });
    fill(el('ready'), ready, 'ready');
    fill(el('saving'), saving, 'saving');
    el('ready-label').hidden = !ready.length;
    el('saving-label').hidden = !saving.length;
    el('upgrades-empty').hidden = !data || data.list !== 'upgrade' || items.length > 0;
  }

  // ---- More ----
  function renderExpeditions() {
    var exp = data && data.expedition && data.expedition.id ? data.expedition : null;
    var activeBox = el('expedition-active');
    var optionsBox = el('expedition-options');
    if (!activeBox || !optionsBox) return;
    if (exp) {
      var secs = Math.max(0, Math.ceil((exp.remainingMs || 0) / 1000));
      text(el('expedition-status'), exp.label + ' · ' + secs + 's left');
      activeBox.hidden = false;
      optionsBox.hidden = true;
      var pct = exp.totalMs > 0 ? Math.max(0, Math.min(1, 1 - (exp.remainingMs || 0) / exp.totalMs)) : 0;
      setBar(el('expedition-bar'), pct);
      el('expedition-cancel').disabled = !live() || awaitingFresh || busy('expedition');
    } else {
      text(el('expedition-status'), 'Visible-time treks');
      activeBox.hidden = true;
      optionsBox.hidden = false;
      var expSig = JSON.stringify([live(), awaitingFresh, busy('expedition')]);
      if (signatures.expeditions !== expSig) {
        signatures.expeditions = expSig;
        optionsBox.textContent = '';
        EXPEDITION_SPECS.forEach(function (spec) {
          var btn = make('button', 'expedition-btn');
          btn.type = 'button';
          btn.setAttribute('data-expedition', spec.id);
          btn.disabled = !live() || awaitingFresh || busy('expedition');
          btn.appendChild(make('span', 'exp-title', spec.label));
          btn.appendChild(make('small', 'exp-detail', spec.detail));
          btn.onclick = function () { command('expedition', {action: 'start', id: spec.id}, 'expedition'); };
          optionsBox.appendChild(btn);
        });
      }
    }
  }
  function renderActivityAndRecords() {
    var activity = data && Array.isArray(data.activity) ? data.activity : [];
    var actList = el('activity-list');
    if (actList) {
      var actSig = JSON.stringify([activity, Math.floor(Date.now() / 60000)]);
      if (signatures.activity !== actSig) {
        signatures.activity = actSig;
        actList.textContent = '';
        if (!activity.length) {
          var emptyLi = make('li', 'empty-row');
          emptyLi.appendChild(make('span', 'sub', 'No recent events recorded yet.'));
          actList.appendChild(emptyLi);
        } else {
          activity.slice(0, 6).forEach(function (item) {
            var li = make('li', 'activity-row');
            var copy = make('div', 'activity-copy');
            copy.appendChild(make('strong', '', item.title || 'Colony event'));
            if (item.text) copy.appendChild(make('span', 'sub', item.text));
            li.appendChild(copy);
            if (item.t) li.appendChild(make('span', 'when num', ago(item.t)));
            actList.appendChild(li);
          });
        }
      }
    }
    var records = data && data.records;
    var recSummary = el('records-summary');
    var recRuns = el('records-runs');
    if (recSummary && recRuns) {
      var recSig = JSON.stringify(records || null);
      if (signatures.records !== recSig) {
        signatures.records = recSig;
        recSummary.textContent = '';
        recRuns.textContent = '';
        var best = records && records.bestMutagen && records.bestMutagen !== '0' ? compact(records.bestMutagen) : '—';
        var fastest = records && records.fastestMs > 0 ? duration(records.fastestMs / 1000) : '—';
        var caste = records && records.highestCaste ? (theme ? theme.label(records.highestCaste, records.highestCaste) : records.highestCaste) : '—';
        [
          ['Best mutagen', best],
          ['Fastest run', fastest],
          ['Highest caste', caste]
        ].forEach(function (pair) {
          var stat = make('div', 'record-stat');
          stat.appendChild(make('span', 'label', pair[0]));
          stat.appendChild(make('strong', 'num', pair[1]));
          recSummary.appendChild(stat);
        });
        var runs = records && Array.isArray(records.runs) ? records.runs : [];
        runs.slice(0, 5).forEach(function (run) {
          var li = make('li', 'record-run');
          var casteName = run.highestCaste ? (theme ? theme.label(run.highestCaste, run.highestCaste) : run.highestCaste) : '';
          var left = '+' + compact(run.mutagen || '0') + ' mutagen' + (casteName ? ' · ' + casteName : '');
          li.appendChild(make('span', '', left));
          li.appendChild(make('span', 'when num', run.durationMs > 0 ? duration(run.durationMs / 1000) : ''));
          recRuns.appendChild(li);
        });
      }
    }
    var support = data && data.support;
    var supBody = el('support-body');
    if (supBody) {
      var supSig = JSON.stringify([support, session, status]);
      if (signatures.support !== supSig) {
        signatures.support = supSig;
        supBody.textContent = '';
        var lines = [];
        if (support && typeof support === 'object') {
          Object.keys(support).forEach(function (k) {
            var val = support[k];
            if (val !== null && val !== undefined && typeof val !== 'object') lines.push(k + ': ' + String(val));
          });
        } else if (typeof support === 'string' && support) {
          lines.push(support);
        }
        if (!lines.length) {
          lines.push('Status: ' + status + (session ? ' · session ' + session : ''));
        }
        lines.push('Credentials & save data: [redacted]');
        lines.forEach(function (line) {
          supBody.appendChild(make('p', 'support-line num', line));
        });
      }
    }
  }
  function renderMore() {
    renderEventChoice('more-event-choice');
    renderReserveBanner('more-reserve');
    var display = data && data.display;
    var levels = el('levels');
    levels.hidden = !(display && display.levels && display.levels.length);
    if (!levels.hidden) {
      var levelSignature = JSON.stringify([display, live()]);
      if (signatures.levels !== levelSignature) {
        signatures.levels = levelSignature;
        levels.textContent = '';
        display.levels.forEach(function (level) {
          var button = make('button', level.id === display.current ? 'on' : '');
          button.type = 'button';
          button.setAttribute('role', 'radio');
          button.setAttribute('aria-checked', String(level.id === display.current));
          button.disabled = !live();
          button.appendChild(make('span', '', level.label));
          button.appendChild(make('small', '', level.hint || ''));
          button.onclick = function () { command('display', {level: level.id}); };
          levels.appendChild(button);
        });
      }
    }
    el('more-show').disabled = status === 'live' || !socket;
    el('more-hide').disabled = status !== 'live';
    var auto = data && data.auto || {paused: false, targets: []};
    var autoStatusText = auto.paused ? 'paused' : auto.state === 'waiting' && auto.reason ? auto.reason.toLowerCase() : 'running while shown';
    text(el('auto-summary'), auto.targets.length ? auto.targets.length + (auto.targets.length === 1 ? ' target · ' : ' targets · ') + autoStatusText : 'Turn on Auto on any card to add a target.');
    text(el('auto-pause'), auto.paused ? 'Resume' : 'Pause');
    el('auto-pause').setAttribute('aria-pressed', String(auto.paused));
    el('auto-pause').hidden = !auto.targets.length;
    el('auto-pause').disabled = !live();
    var targetSignature = JSON.stringify(auto.targets);
    if (signatures.targets !== targetSignature) {
      signatures.targets = targetSignature;
      el('auto-targets').textContent = '';
      auto.targets.forEach(function (target) {
        var row = make('li');
        var info = make('div', 'auto-target-info');
        info.appendChild(make('span', '', target.label));
        info.appendChild(make('span', 'kind', ' · ' + (target.kind === 'unit' ? 'Unit' : 'Upgrade')));
        row.appendChild(info);
        var toggle = make('button', 'auto on', 'Auto');
        toggle.type = 'button';
        toggle.setAttribute('aria-pressed', 'true');
        toggle.setAttribute('aria-label', 'Auto-buy ' + target.label);
        toggle.appendChild(make('span', 'track'));
        toggle.onclick = function () { command('auto', {kind: target.kind, id: target.id}, 'auto:' + target.kind + ':' + target.id); };
        row.appendChild(toggle);
        el('auto-targets').appendChild(row);
      });
    }
    var prestige = data && data.prestige;
    var actions = el('evo-actions');
    el('evolution').hidden = !(prestige && prestige.unlocked);
    if (actions) actions.hidden = !(prestige && prestige.unlocked);
    if (prestige && prestige.unlocked) {
      text(el('evo-h'), prestige.available ? prestige.label + ' is ready' : prestige.label);
      text(el('evo-ready'), prestige.available ? 'Ready' : '');
      var ascent = prestige.preview;
      text(el('evo-text'), ascent ? 'Ascend now for +' + ascent.gain + ' mutagen. ' + ascent.energy + (ascent.banked ? ' (' + ascent.banked + ')' : '') : 'Start a new colony for ' + prestige.reward + '. It costs ' + prestige.cost + '. Units and ordinary upgrades reset; mutations and achievements stay.');
      text(el('evo-next'), (ascent ? ascent.keeps + (ascent.next ? ' ' + ascent.next : '') + ' ' : '') + 'Begin it from the Evolution menu on the TV.');
      var planner = ascent && ascent.planner;
      var plannerBox = el('evo-planner');
      if (plannerBox) {
        var thresholds = planner && Array.isArray(planner.thresholds) ? planner.thresholds : [];
        var warpImpact = planner && planner.warpImpact ? planner.warpImpact : '';
        plannerBox.hidden = !warpImpact && !thresholds.length;
        if (el('evo-warp')) {
          text(el('evo-warp'), warpImpact);
          el('evo-warp').hidden = !warpImpact;
        }
        if (el('evo-thresholds')) {
          var threshSig = JSON.stringify(thresholds);
          if (signatures.thresholds !== threshSig) {
            signatures.thresholds = threshSig;
            el('evo-thresholds').textContent = '';
            thresholds.forEach(function (t) {
              el('evo-thresholds').appendChild(make('li', 'num', t.label + ' ' + t.level + ' → +' + t.gain + ' mutagen'));
            });
          }
        }
      }
      var ascendBtn = el('evo-ascend');
      var respecBtn = el('evo-respec');
      var respecInfo = prestige.respec;
      if (ascendBtn) {
        text(ascendBtn, confirmEvo === 'ascend' ? 'Confirm ascend' : 'Ascend');
        ascendBtn.disabled = !prestige.available || !live() || awaitingFresh || busy('ascend');
        ascendBtn.onclick = function () {
          if (confirmEvo !== 'ascend') { confirmEvo = 'ascend'; render(); return; }
          confirmEvo = '';
          command('ascend');
        };
      }
      if (respecBtn) {
        respecBtn.hidden = !(respecInfo && respecInfo.unlocked);
        text(respecBtn, confirmEvo === 'respec' ? 'Confirm respec' : 'Respec');
        respecBtn.disabled = !(respecInfo && respecInfo.available) || !live() || awaitingFresh || busy('respec');
        respecBtn.onclick = function () {
          if (confirmEvo !== 'respec') { confirmEvo = 'respec'; render(); return; }
          confirmEvo = '';
          command('respec');
        };
      }
    }
    renderExpeditions();
    renderActivityAndRecords();
    var achieved = data && data.achieved || {earned: 0, total: 0};
    text(el('ach-earned'), achieved.earned);
    text(el('ach-total'), achieved.total);
    setBar(el('ach-bar'), achieved.total ? achieved.earned / achieved.total : 0);
    var phoneSignature = JSON.stringify([phones, confirmForget, Math.floor(Date.now() / 60000)]);
    if (signatures.phones !== phoneSignature) {
      signatures.phones = phoneSignature;
      el('phones').textContent = '';
      phones.forEach(function (phone) {
        var row = make('li', 'phone-row');
        var words = make('div');
        words.appendChild(make('span', '', phone.self ? 'This phone' : phone.name));
        words.appendChild(make('span', 'when', phone.connected && !phone.self ? 'Connected now' : 'Paired ' + ago(phone.pairedAt)));
        row.appendChild(words);
        var forget = make('button', 'forget', confirmForget === phone.id ? 'Confirm' : 'Forget');
        forget.type = 'button';
        forget.setAttribute('aria-label', (confirmForget === phone.id ? 'Confirm forgetting ' : 'Forget ') + (phone.self ? 'this phone' : phone.name));
        forget.onclick = function () {
          if (confirmForget !== phone.id) { confirmForget = phone.id; render(); return; }
          confirmForget = '';
          send({t: 'forget', id: phone.id});
        };
        row.appendChild(forget);
        el('phones').appendChild(row);
      });
    }
  }
  function renderVisitorPanel() {
    var count = data && data.visitorCount;
    el('visitor-panel').hidden = !(count && count.total);
    if (!count || !count.total) return;
    text(el('visitors-found'), count.found);
    text(el('visitors-total'), count.total);
    setBar(el('visitors-bar'), count.found / count.total);
    var keepsakes = data && Array.isArray(data.keepsakes) ? data.keepsakes : [];
    var moreKs = el('more-keepsakes');
    if (moreKs) {
      var unlockedCount = keepsakes.filter(function (k) { return k.unlocked; }).length;
      moreKs.hidden = !keepsakes.length;
      text(moreKs, keepsakes.length ? 'Keepsakes unlocked: ' + unlockedCount + ' / ' + keepsakes.length : '');
    }
  }
  function renderVisitors() {
    var keepsakes = data && Array.isArray(data.keepsakes) ? data.keepsakes : [];
    var ksPanel = el('keepsakes-panel');
    if (ksPanel) {
      ksPanel.hidden = !keepsakes.length;
      if (keepsakes.length) {
        var unlocked = keepsakes.filter(function (k) { return k.unlocked; }).length;
        text(el('keepsakes-count'), unlocked + ' / ' + keepsakes.length);
        var ksSig = JSON.stringify(keepsakes);
        if (signatures.keepsakes !== ksSig) {
          signatures.keepsakes = ksSig;
          var ksList = el('keepsakes-list');
          ksList.textContent = '';
          keepsakes.forEach(function (k) {
            var li = make('li', 'keepsake-row' + (k.unlocked ? ' unlocked' : ' locked'));
            li.appendChild(make('strong', '', k.label));
            li.appendChild(make('span', 'sub', k.unlocked ? 'Unlocked · ' + k.condition : k.condition));
            ksList.appendChild(li);
          });
        }
      }
    }
    var entries = data && data.list === 'visitors' ? data.visitors || [] : [];
    var signature = JSON.stringify([entries, entries.map(function (entry) { return iconVersions['visitor:' + entry.id] || 0; })]);
    if (signatures.visitors === signature) return;
    signatures.visitors = signature;
    var grid = el('visitor-grid');
    grid.textContent = '';
    entries.forEach(function (entry) {
      var cell = make('div', 'visitor' + (entry.seen ? '' : ' unfound') + (entry.rarity ? ' rarity-' + entry.rarity : ''));
      var picture = make('div', 'visitor-picture');
      var icon = icons['visitor:' + entry.id];
      if (entry.seen && icon) {
        var image = make('img');
        image.alt = '';
        image.src = icon;
        picture.appendChild(image);
      } else picture.textContent = entry.seen ? '' : '?';
      cell.appendChild(picture);
      cell.appendChild(make('span', '', entry.seen ? entry.name : 'Not yet seen'));
      var subtitle = entry.seen > 0 ? (entry.rarity ? entry.rarity + (entry.seen > 1 ? ' · ' + entry.seen + '×' : '') : (entry.seen > 1 ? 'seen ' + entry.seen + '×' : '')) : '';
      if (subtitle) cell.appendChild(make('small', 'num', subtitle));
      if (entry.seen && entry.note) cell.appendChild(make('p', 'visitor-note', entry.note));
      grid.appendChild(cell);
    });
  }
  // The Forage button follows Red: it names whatever Red would catch right now and otherwise forages.
  function renderRed() {
    redTarget = live() && data && data.catchable || '';
    var label = redTarget && data && data.catchLabel ? data.catchLabel
      : redTarget === 'golden' ? 'Catch golden roach' : redTarget === 'intruder' ? 'Repel ' + (data.catchName || 'house spider').toLowerCase()
      : redTarget === 'egg' ? 'Hatch egg case' : redTarget === 'molt' ? 'Catch molting roach' : redTarget === 'dung' ? 'Claim soil ball'
      : redTarget === 'visitor' ? 'Catch ' + (data.catchName || 'visitor').toLowerCase() : 'Forage';
    var button = el('forage');
    button.classList.toggle('red', !!redTarget);
    button.setAttribute('aria-label', label);
    text(el('forage-label'), label);
    button.disabled = !live() || awaitingFresh;
  }
  function renderAchievements() {
    var entries = data && data.list === 'achievements' ? data.achievements || [] : [];
    var trophy = metaKey('achievement');
    var signature = JSON.stringify([entries, iconVersions[trophy] || 0]);
    if (signatures.achievements === signature) return;
    signatures.achievements = signature;
    var list = el('achievement-list');
    list.textContent = '';
    entries.forEach(function (entry) {
      var row = make('div', 'achievement-row' + (entry.earned ? '' : ' locked'));
      if (icons[trophy]) row.appendChild(picture(trophy, 'row-icon'));
      row.appendChild(make('span', 'badge', entry.earned ? 'Earned' : 'Locked'));
      row.appendChild(make('strong', '', entry.name));
      row.appendChild(make('p', '', entry.description));
      if (typeof entry.progress === 'number') {
        var meter = bar('achievement-bar');
        meter.setAttribute('aria-label', 'Progress toward ' + entry.name);
        setBar(meter, entry.progress);
        row.appendChild(meter);
      }
      list.appendChild(row);
    });
  }

  // ---- Resource sheet ----
  function openSheet(id) { sheetId = id; render(); }
  function renderSheet() {
    var entry = sheetId && resource(sheetId);
    el('sheet').hidden = !entry;
    if (!entry) return;
    text(el('sheet-title'), entry.label);
    var source = icons['#' + entry.icon];
    if (source && el('sheet-icon').getAttribute('src') !== source) el('sheet-icon').src = source;
    el('sheet-icon').hidden = !source;
    text(el('sheet-rate'), entry.rate && entry.rate !== '0' ? '+' + entry.rate + '/s' : 'not growing');
    text(el('sheet-amount'), compact(entry.amount));
    text(el('sheet-cap'), entry.cap ? 'of ' + entry.cap + ' max' : '');
    var spends = (data.items || []).filter(function (item) {
      return (item.costs || []).some(function (part) { return part.id === entry.id; });
    }).slice(0, 5);
    var container = el('sheet-spends');
    container.textContent = '';
    if (!spends.length) container.appendChild(make('p', 'earned', 'Nothing on the list you are viewing uses it.'));
    spends.forEach(function (item) {
      var part = item.costs.filter(function (cost) { return cost.id === entry.id; })[0];
      var progress = partProgress(part);
      var box = make('div', 'spend');
      var top = make('div', 'spend-top');
      top.appendChild(make('b', '', item.label));
      top.appendChild(make('span', 'eta num' + (progress.short ? '' : ' ready'), progress.short ? (progress.eta === null ? '' : duration(progress.eta)) : 'ready'));
      box.appendChild(top);
      box.appendChild(make('span', 'need num', progress.short ? compact(part.have) + ' of ' + part.label : part.label + ' · have plenty'));
      if (item.impact) box.appendChild(make('span', 'impact num', item.impact.charAt(0).toUpperCase() + item.impact.slice(1)));
      var meter = bar('thin ' + (progress.short ? 'quiet' : 'good'));
      setBar(meter, progress.short ? progress.pct : 1);
      box.appendChild(meter);
      if (!item.verb) {
        var itemKey = item.kind + ':' + item.id;
        var isPinned = !!(data && data.pin && (data.pin.kind || data.pin.type) === item.kind && data.pin.id === item.id);
        var isReserved = !!(data && data.reserve && (data.reserve.kind || data.reserve.type) === item.kind && data.reserve.id === item.id);
        var tools = make('div', 'card-tools');
        var pinBtn = make('button', 'meta-btn pin-btn' + (isPinned ? ' on' : ''), isPinned ? 'Pinned' : 'Pin');
        pinBtn.type = 'button';
        pinBtn.disabled = !live() || busy('pin:' + itemKey);
        pinBtn.onclick = function (ev) { ev.stopPropagation(); command('pin', {kind: item.kind, id: item.id}, 'pin:' + itemKey); };
        var resBtn = make('button', 'meta-btn reserve-btn' + (isReserved ? ' on' : ''), isReserved ? 'Saving toward' : 'Save toward');
        resBtn.type = 'button';
        resBtn.disabled = !live() || busy('reserve:' + itemKey);
        resBtn.onclick = function (ev) { ev.stopPropagation(); command('reserve', {kind: item.kind, id: item.id}, 'reserve:' + itemKey); };
        tools.appendChild(pinBtn);
        tools.appendChild(resBtn);
        box.appendChild(tools);
      }
      box.onclick = function () { focusCard(item.kind, item.id); };
      container.appendChild(box);
    });
    var makers = (data.producers || {})[entry.id] || [];
    var earned = makers.length ? 'Made by ' + makers.join(', ') + '.' : 'Nothing in the colony makes it yet; upgrades and abilities add it.';
    if (entry.id === 'meat') earned += ' Forage here or Red on the remote adds a burst.';
    text(el('sheet-earned'), earned);
  }

  // ---- Screens ----
  function render() {
    var mode = !credential ? 'pairing' : status === 'pairing' ? 'pairing' : !socket || socket.readyState !== 1 || status === 'connecting' || status === 'reconnecting' ? 'reconnecting' : status !== 'live' ? 'paused' : 'live';
    el('pairing').hidden = mode !== 'pairing';
    el('reconnecting').hidden = mode !== 'reconnecting';
    el('paused').hidden = mode !== 'paused';
    ['colony', 'upgrades', 'more', 'achievements', 'visitors'].forEach(function (name) { el(name).hidden = mode !== 'live' || screen !== name; });
    el('bottom').hidden = mode !== 'live';
    el('action-bar').hidden = screen !== 'colony';
    el('nav').classList.toggle('ruled', screen !== 'colony');
    document.body.className = mode !== 'live' ? '' : screen === 'colony' ? 'with-actions' : 'with-nav';
    document.body.setAttribute('data-status', mode);
    if (mode === 'reconnecting') text(el('reconnect-title'), everConnected ? 'Reconnecting to the TV' : 'Connecting to the TV');
    if (mode === 'paused') {
      var crumbs = resource('meat');
      text(el('last-seen'), freshAt ? 'Last seen ' + ago(freshAt) + (crumbs ? ' · ' + compact(crumbs.amount) + ' ' + crumbs.label.toLowerCase() : '') : '');
      el('show').disabled = busy('show');
    }
    if (mode !== 'live') { el('sheet').hidden = true; return; }
    Array.prototype.forEach.call(el('nav').children, function (button) {
      var name = button.getAttribute('data-screen');
      var on = name === screen || name === 'more' && (screen === 'achievements' || screen === 'visitors');
      button.classList.toggle('on', on);
      if (on) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
      if (name === 'upgrades') button.hidden = !(data && data.upgrades);
    });
    if (screen === 'colony') renderColony();
    else if (screen === 'upgrades') renderUpgrades();
    else if (screen === 'more') { renderMore(); renderVisitorPanel(); }
    else if (screen === 'visitors') renderVisitors();
    else renderAchievements();
    renderRed();
    renderMetaIcons();
    var last = data && data.last;
    text(el('last-label'), last ? last.label + ' × ' + (quantity === 'max' ? 'Max' : quantity) : 'Nothing yet');
    el('buy-last').disabled = !live() || !last || awaitingFresh;
    renderSheet();
  }
  // The visible card for a kind:id. A hidden screen can still hold an older copy.
  function shownCard(targetId) {
    var nodes = document.querySelectorAll('[data-id="' + targetId + '"]');
    var i;
    for (i = 0; i < nodes.length; i++) if (nodes[i].offsetParent) return nodes[i];
    return null;
  }
  function focusCard(kind, id) {
    if (!kind || !id) return;
    var targetId = kind + ':' + id;
    var wanted = kind === 'upgrade' ? 'upgrades' : 'colony';
    sheetId = '';
    // Energy abilities already sit on the colony screen, so a visible card stays put.
    if (screen !== wanted && !shownCard(targetId)) {
      choose({screen: wanted});
      pendingFocus = targetId;
      return;
    }
    render();
    var node = shownCard(targetId);
    if (!node) { pendingFocus = targetId; return; }
    node.scrollIntoView({block: 'center'});
    flash(node, 'wash', 500);
    pendingFocus = '';
  }
  function savePreferences() { write(PREFERENCES, JSON.stringify({screen: screen === 'achievements' || screen === 'visitors' ? 'more' : screen, tabs: tabs, quantity: quantity})); }
  function choose(change) {
    if (change.screen) screen = change.screen;
    if (change.tab !== undefined) tabs[view().list] = change.tab;
    if (change.quantity !== undefined) quantity = change.quantity;
    sheetId = '';
    confirmEvo = '';
    pendingFocus = '';
    if (data && data.list !== view().list) data = {list: '', catchable: data.catchable, catchName: data.catchName, catchLabel: data.catchLabel, visitorCount: data.visitorCount, resources: data.resources, upgrades: data.upgrades, auto: data.auto, last: data.last, prestige: data.prestige, achieved: data.achieved, display: data.display, leader: data.leader, dormant: data.dormant, goal: data.dormant ? data.goal : '', producers: data.producers, meta: data.meta, quick: data.quick, pin: data.pin, reserve: data.reserve, eventChoice: data.eventChoice, expedition: data.expedition, keepsakes: data.keepsakes, records: data.records, activity: data.activity, support: data.support, items: [], tabs: data.tabs};
    savePreferences();
    sendView();
    render();
    window.scrollTo(0, 0);
  }

  el('show').onclick = function () { command('show'); };
  if (el('expedition-cancel')) el('expedition-cancel').onclick = function () { command('expedition', {action: 'cancel', id: ''}, 'expedition'); };
  el('pair-code-go').onclick = pairFromInput;
  el('pair-code-input').onkeydown = function (event) { if (event.keyCode === 13) pairFromInput(); };
  if (standalone) {
    el('pair-code').hidden = false;
    text(el('pair-step'), 'Point the Camera at it, press and hold the link it shows, choose Copy Link, and paste it here. Or type the code after pair= under the QR code.');
  }
  el('more-show').onclick = function () { command('show'); };
  el('hide').onclick = function () { command('hide'); };
  el('more-hide').onclick = function () { command('hide'); };
  // Sends what the button showed when tapped, never a target that appeared since.
  el('forage').onclick = function () { if (redTarget) command('catch', {kind: redTarget}, 'red'); else command('forage', {}, 'red'); };
  el('buy-last').onclick = function () { command('buyLast', {quantity: quantity}); };
  el('hint-toggle').onclick = function () { hintOpen = !hintOpen; renderHint(); };
  el('auto-pause').onclick = function () { command('autoPause', {paused: !(data && data.auto && data.auto.paused)}); };
  el('show-achievements').onclick = function () { choose({screen: 'achievements'}); };
  el('achievements-back').onclick = function () { choose({screen: 'more'}); };
  el('show-visitors').onclick = function () { choose({screen: 'visitors'}); };
  el('visitors-back').onclick = function () { choose({screen: 'more'}); };
  el('sheet-close').onclick = function () { sheetId = ''; render(); };
  Array.prototype.forEach.call(el('quantity').children, function (button) {
    button.onclick = function () {
      var value = button.getAttribute('data-quantity');
      choose({quantity: value === 'max' ? 'max' : Number(value)});
    };
  });
  Array.prototype.forEach.call(el('nav').children, function (button) {
    button.onclick = function () { choose({screen: button.getAttribute('data-screen')}); };
  });
  document.addEventListener('keydown', function (event) { if (event.keyCode === 27 && sheetId) { sheetId = ''; render(); } });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { sendView(); return; }
    if (!socket && credential && !revoked) { retryDelay = 1000; connect(); }
    else { sendView(); send({t: 'refresh'}); }
  });
  // "Last seen" and the paired-phone ages keep moving without new data.
  setInterval(function () { if (status !== 'live' || screen === 'more') render(); }, 30000);

  try {
    var saved = JSON.parse(read(PREFERENCES) || '{}');
    if (['colony', 'upgrades', 'more'].indexOf(saved.screen) !== -1) screen = saved.screen;
    if (saved.tabs && typeof saved.tabs === 'object') ['unit', 'upgrade'].forEach(function (list) { if (typeof saved.tabs[list] === 'string') tabs[list] = saved.tabs[list]; });
    if (saved.quantity === 10 || saved.quantity === 'max') quantity = saved.quantity;
  } catch (error) { /* Defaults apply. */ }
  var token = /[?&]pair=([A-Za-z0-9_-]+)/.exec(location.search);
  if (token) {
    // The pairing token is single-use; keep it out of history and bookmarks.
    history.replaceState(null, '', location.pathname);
    pair(token[1]);
  } else if (credential) { render(); connect(); }
  else showPairing();
}());
