'use strict';
// Roach Colony phone controller bridge. Runs as root on the TV under Node 8.12.
// It relays a fixed set of colony operations between paired phones and the
// game page. It never simulates the colony, never writes the colony save and
// never runs anything except luna-send to launch this one app.
var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');
var ws = require('./websocket');

var env = process.env;
function integer(value, fallback) {
  var parsed = parseInt(value, 10);
  return parsed > 0 && parsed < 65536 ? parsed : fallback;
}
var config = {
  port: integer(env.ROACH_CONTROLLER_PORT, 8642),
  gamePort: integer(env.ROACH_CONTROLLER_GAME_PORT, 8643),
  bind: env.ROACH_CONTROLLER_BIND || '0.0.0.0',
  dataDir: env.ROACH_CONTROLLER_DATA || path.join(__dirname, 'data'),
  keyFile: env.ROACH_CONTROLLER_KEY_FILE || '/tmp/roach-colony-controller/game-key',
  lunaSend: env.ROACH_CONTROLLER_LUNA_SEND || '/usr/bin/luna-send',
  advertisedHost: env.ROACH_CONTROLLER_HOST || '',
  gameOrigins: String(env.ROACH_CONTROLLER_GAME_ORIGINS || '').split(',').filter(Boolean),
  appId: 'com.phil.roachcolony',
  publicDir: path.join(__dirname, 'public')
};
var themeFile = [path.join(config.publicDir, 'theme.js'), path.join(__dirname, '..', 'app', 'theme.js')].filter(function (file) { return fs.existsSync(file); })[0];
// The phone shares the TV's menu art; the installer copies it into public/, a checkout serves it from app/.
var UI_ART = [
  'ui_border_9slice', 'tab_units', 'tab_upgrades', 'tab_more', 'qty_1', 'qty_10', 'qty_max',
  'progress_cap_left', 'progress_cap_right', 'progress_segment_full', 'progress_segment_empty',
  'status_play', 'status_pause', 'status_wait', 'status_stop', 'status_pin', 'status_goal',
  'status_inspect', 'status_history', 'status_expedition', 'status_choice', 'status_reserve',
  'status_guide', 'capsule_red', 'capsule_green', 'capsule_yellow', 'capsule_blue'
];
function uiArtFile(name) {
  return [path.join(config.publicDir, 'ui-art', name + '.png'), path.join(__dirname, '..', 'app', 'ui-art', name + '.png')].filter(function (file) { return fs.existsSync(file); })[0];
}

var PAIR_TTL = 5 * 60 * 1000;
var MAX_PHONES = 8;
var MAX_PHONE_SOCKETS = 3;
var MAX_VIEWS = 4;
var COMMAND_TIMEOUT = 8000;
var SLOW_CLIENT_BYTES = 32 * 1024;
var LISTS = ['unit', 'upgrade', 'more', 'achievements', 'evolution', 'visitors'];
var OPS = ['forage', 'catch', 'buy', 'buyLast', 'quickBuy', 'pin', 'reserve', 'eventChoice', 'expedition', 'auto', 'autoPause', 'ascend', 'respec', 'display', 'show', 'hide'];
// Red's targets; a catch names the one the phone showed.
var CATCHES = ['golden', 'intruder', 'egg', 'molt', 'dung', 'visitor'];
// Colony notifications relayed to phones: short text, at most a few in any ten seconds.
var EVENT_BURST = 4;
var EVENT_WINDOW = 10000;
var eventTimes = [];

function log() {
  console.log(new Date().toISOString() + ' ' + Array.prototype.join.call(arguments, ' '));
}
function random(bytes) {
  return crypto.randomBytes(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function same(a, b) {
  var left = Buffer.from(String(a));
  var right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function mkdirs(dir) {
  if (fs.existsSync(dir)) return;
  mkdirs(path.dirname(dir));
  fs.mkdirSync(dir, 448);
}

// The game proves it is the local game page with this per-boot key, which
// the bridge passes in its own launch parameters and the Blue script reads.
function gameKey() {
  try {
    var existing = fs.readFileSync(config.keyFile, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch (error) { /* Created below. */ }
  var key = crypto.randomBytes(32).toString('hex');
  mkdirs(path.dirname(config.keyFile));
  fs.writeFileSync(config.keyFile, key + '\n', {mode: 384});
  return key;
}
var key = gameKey();

var phonesFile = path.join(config.dataDir, 'phones.json');
var paired = [];
try {
  var stored = JSON.parse(fs.readFileSync(phonesFile, 'utf8'));
  if (stored && Array.isArray(stored.phones)) paired = stored.phones.filter(function (entry) {
    return entry && typeof entry.id === 'string' && /^[0-9a-f]{64}$/.test(entry.hash);
  }).slice(0, MAX_PHONES);
} catch (error) {
  if (error.code !== 'ENOENT') log('[ROACH] controller: phones file unreadable; starting with no paired phones.', error.message);
}
var saveTimer = null;
function savePhones(now) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!now) { saveTimer = setTimeout(function () { savePhones(true); }, 5000); return; }
  try {
    mkdirs(config.dataDir);
    var temporary = phonesFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({version: 1, phones: paired}, null, 1), {mode: 384});
    fs.renameSync(temporary, phonesFile);
  } catch (error) { log('[ROACH] controller: could not save paired phones.', error.message); }
}
// Paired phones see the same list as the TV, so a lost phone can be forgotten from another.
function phonesChanged() {
  var list = publicPhones();
  sendGame({t: 'phones', phones: list});
  sockets.forEach(function (phone) {
    if (phone.phoneId) phone.send({t: 'phones', phones: list.map(function (entry) { return Object.assign({self: entry.id === phone.phoneId}, entry); })});
  });
}
function publicPhones() {
  return paired.map(function (entry) {
    return {id: entry.id, name: entry.name, pairedAt: entry.pairedAt, lastSeen: entry.lastSeen, connected: sockets.some(function (phone) { return phone.phoneId === entry.id; })};
  });
}

var addressCache = {at: 0, list: []};
function addresses() {
  if (Date.now() - addressCache.at < 10000) return addressCache.list;
  var interfaces = os.networkInterfaces();
  var ranked = [];
  Object.keys(interfaces).forEach(function (name) {
    interfaces[name].forEach(function (entry) {
      if (entry.family === 'IPv4' && !entry.internal) ranked.push({name: name, address: entry.address});
    });
  });
  ranked.sort(function (a, b) { return (/^(eth|wlan)/.test(b.name) ? 1 : 0) - (/^(eth|wlan)/.test(a.name) ? 1 : 0); });
  addressCache = {at: Date.now(), list: ranked.map(function (entry) { return entry.address; })};
  return addressCache.list;
}
function hostAllowed(host) {
  var match = /^([^:]+)(?::(\d+))?$/.exec(String(host || ''));
  if (!match || (match[2] || '80') !== String(config.port)) return false;
  var names = ['localhost', '127.0.0.1'].concat(addresses());
  if (config.advertisedHost) names.push(config.advertisedHost);
  return names.indexOf(match[1].toLowerCase()) !== -1;
}
function originAllowed(request) {
  return request.headers.origin === 'http://' + request.headers.host;
}
function loopback(address) { return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'; }

// ---- Game connection ----
var game = null;
var lastStates = {};
var catalog = {};
var icons = {};
var pending = {};
var pairTokens = {};
var watched = '[]';
var launching = null;
var stats = {commands: 0, results: 0, states: 0, phoneConnections: 0, gameConnections: 0, dropped: 0};

function gameStatus() {
  if (!game) return {t: 'status', game: 'offline', session: ''};
  return {t: 'status', game: game.visible ? 'live' : 'paused', session: game.session};
}
function sendGame(message) { if (game) game.conn.send(JSON.stringify(message)); }
function remember(map, entries, limit) {
  var changed = {};
  var count = 0;
  Object.keys(entries || {}).forEach(function (id) {
    if (typeof entries[id] !== 'object' && typeof entries[id] !== 'string') return;
    if (!map[id] && Object.keys(map).length >= limit) return;
    map[id] = entries[id];
    changed[id] = entries[id];
    count++;
  });
  return count ? changed : null;
}
function absorb(message) {
  var catalogDelta = remember(catalog, message.catalog, 400);
  var iconDelta = remember(icons, message.icons, 320);
  if (catalogDelta || iconDelta) broadcast({t: 'catalog', entries: catalogDelta || {}, icons: iconDelta || {}});
}
function viewKey(view) { return view.list + '|' + view.tab + '|' + view.quantity; }
function normalizeView(view) {
  view = view && typeof view === 'object' ? view : {};
  return {
    list: LISTS.indexOf(view.list) !== -1 ? view.list : 'unit',
    tab: typeof view.tab === 'string' && /^[A-Za-z0-9_]{0,32}$/.test(view.tab) ? view.tab : '',
    quantity: view.quantity === 10 || view.quantity === 'max' ? view.quantity : 1
  };
}
function storeState(key, session, data) {
  if (!lastStates[key] && Object.keys(lastStates).length >= 8) delete lastStates[Object.keys(lastStates)[0]];
  lastStates[key] = {session: session, data: data, at: Date.now()};
}
function updateWatch() {
  var views = [];
  var keys = {};
  sockets.forEach(function (phone) {
    if (!phone.phoneId || !phone.visible || !phone.view || keys[phone.viewKey] || views.length >= MAX_VIEWS) return;
    keys[phone.viewKey] = true;
    views.push(phone.view);
  });
  var text = JSON.stringify(views);
  if (text === watched || !game) { watched = text; return; }
  watched = text;
  sendGame({t: 'watch', views: views});
}
function failPending(message) {
  Object.keys(pending).forEach(function (rid) { settle(rid, {ok: false, uncertain: true, message: message}); });
}
function settle(rid, result) {
  var entry = pending[rid];
  if (!entry) return;
  delete pending[rid];
  clearTimeout(entry.timer);
  entry.phones.forEach(function (phone) { phone.send(Object.assign({t: 'result', rid: rid}, result)); });
}
function handleGame(conn, request) {
  var self = {conn: conn, session: '', visible: false, authed: false};
  var helloTimer = setTimeout(function () { conn.close(1008, 'Hello required'); }, 5000);
  conn.on('message', function (text) {
    var message;
    try { message = JSON.parse(text); } catch (error) { conn.close(1007, 'Invalid JSON'); return; }
    if (!message || typeof message.t !== 'string') return;
    if (!self.authed) {
      if (message.t !== 'hello' || !same(message.key, key) || typeof message.session !== 'string' || message.session.length > 64) {
        log('[ROACH] controller: rejected a game connection with an invalid key.');
        conn.close(1008, 'Invalid key');
        return;
      }
      clearTimeout(helloTimer);
      self.authed = true;
      if (game) { failPending('The colony page was replaced. Checking what happened…'); game.conn.close(4000, 'Replaced'); }
      game = self;
      stats.gameConnections++;
      self.session = message.session;
      self.visible = !!message.visible;
      watched = '';
      conn.send(JSON.stringify({t: 'welcome', phones: publicPhones()}));
      updateWatch();
      broadcast(gameStatus());
      log('[ROACH] controller: game connected', self.visible ? 'visible' : 'paused');
      return;
    }
    if (game !== self) return;
    if (message.t === 'status') {
      if (typeof message.session === 'string' && message.session.length <= 64) self.session = message.session;
      self.visible = !!message.visible;
      if (self.visible) launching = null;
      broadcast(gameStatus());
      if (self.visible) { watched = ''; updateWatch(); }
    } else if (message.t === 'state' && typeof message.key === 'string') {
      stats.states++;
      absorb(message);
      storeState(message.key, message.session, message.data);
      sockets.forEach(function (phone) { if (phone.viewKey === message.key && phone.visible) phone.state(message.key); });
    } else if (message.t === 'result' && typeof message.rid === 'string') {
      stats.results++;
      absorb(message);
      if (message.key && message.data) storeState(message.key, message.session, message.data);
      settle(message.rid, {ok: !!message.ok, message: String(message.message || ''), code: message.code || '', bought: message.bought || null, key: message.key || '', session: message.session || '', data: message.data || null});
    } else if (message.t === 'event' && typeof message.title === 'string' && typeof message.text === 'string') {
      var now = Date.now();
      eventTimes = eventTimes.filter(function (at) { return now - at < EVENT_WINDOW; });
      if (eventTimes.length >= EVENT_BURST || !self.visible) return;
      eventTimes.push(now);
      broadcast({t: 'event', title: message.title.slice(0, 60), text: message.text.slice(0, 160)});
    } else if (message.t === 'pair') {
      if (paired.length >= MAX_PHONES) { conn.send(JSON.stringify({t: 'pair', error: 'Eight phones are paired. Forget one to pair another.'})); return; }
      pairTokens = {};
      var token = random(12);
      pairTokens[token] = Date.now() + PAIR_TTL;
      var hosts = config.advertisedHost ? [config.advertisedHost] : addresses();
      var urls = hosts.map(function (host) { return 'http://' + host + ':' + config.port + '/?pair=' + token; });
      conn.send(JSON.stringify({t: 'pair', url: urls[0] || '', urls: urls, expiresAt: pairTokens[token], ttl: PAIR_TTL}));
    } else if (message.t === 'pair-cancel') {
      pairTokens = {};
    } else if (message.t === 'phones') {
      conn.send(JSON.stringify({t: 'phones', phones: publicPhones()}));
    } else if (message.t === 'forget' && typeof message.id === 'string') {
      forget(message.id);
    }
  });
  conn.on('close', function () {
    clearTimeout(helloTimer);
    if (game !== self) return;
    game = null;
    failPending('Lost contact with the colony. Checking what happened…');
    broadcast(gameStatus());
    log('[ROACH] controller: game disconnected');
  });
}
function forget(id) {
  var before = paired.length;
  paired = paired.filter(function (entry) { return entry.id !== id; });
  if (paired.length === before) return;
  sockets.slice().forEach(function (phone) {
    if (phone.phoneId === id) { phone.send({t: 'revoked'}); phone.conn.close(4001, 'Forgotten'); }
  });
  savePhones(true);
  phonesChanged();
}

// ---- Phone connections ----
var sockets = [];
function broadcast(message) {
  var text = JSON.stringify(message);
  sockets.forEach(function (phone) { if (phone.phoneId) phone.conn.send(text); });
}
// Repeated Shows before the colony reports itself open share one launch.
function launch(phone, rid) {
  if (launching && Date.now() - launching < 3000) { phone.send({t: 'result', rid: rid, ok: true, message: 'Opening the colony…'}); return; }
  launching = Date.now();
  var payload = JSON.stringify({id: config.appId, params: {controllerShow: true, controllerKey: key, controllerPort: config.gamePort, compact: true, corner: 'bottom-right', autoCloseSeconds: 0}});
  childProcess.execFile(config.lunaSend, ['-n', '1', 'luna://com.webos.applicationManager/launch', payload], {timeout: 10000}, function (error, stdout) {
    var ok = !error && !/"returnValue"\s*:\s*false/.test(String(stdout));
    if (!ok) { launching = null; log('[ROACH] controller: launch failed.', error ? error.message : String(stdout).slice(0, 300)); }
    phone.send({t: 'result', rid: rid, ok: ok, message: ok ? 'Opening the colony…' : 'The TV did not open the colony. Try Blue on the remote.'});
  });
}
function validCommand(message) {
  if (typeof message.rid !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(message.rid)) return 'Invalid request.';
  if (OPS.indexOf(message.op) === -1) return 'Unsupported command.';
  if (typeof message.session !== 'string' || message.session.length > 64) return 'Invalid request.';
  if (message.op === 'buy' || message.op === 'auto') {
    if (message.kind !== 'unit' && message.kind !== 'upgrade') return 'Unsupported command.';
    if (typeof message.id !== 'string' || !/^[A-Za-z0-9]{1,48}$/.test(message.id)) return 'Unknown colony item.';
  }
  if (message.op === 'catch' && CATCHES.indexOf(message.kind) === -1) return 'Unsupported command.';
  if ((message.op === 'buy' || message.op === 'buyLast') && [1, 10, 'max'].indexOf(message.quantity) === -1) return 'Invalid quantity.';
  if (message.op === 'quickBuy' && [0, 1, 2, 3, 4].indexOf(message.slot) === -1) return 'Invalid request.';
  if (message.op === 'pin' || message.op === 'reserve') {
    if (['unit', 'upgrade', ''].indexOf(message.kind) === -1) return 'Invalid request.';
    if (typeof message.id !== 'string' || !/^[A-Za-z0-9_]{0,32}$/.test(message.id)) return 'Invalid request.';
  }
  if (message.op === 'eventChoice' && ['default', 'nursery'].indexOf(message.choice) === -1) return 'Invalid request.';
  if (message.op === 'expedition') {
    if (['start', 'cancel'].indexOf(message.action) === -1) return 'Invalid request.';
    var expId = message.action === 'cancel' && message.id === undefined ? '' : message.id;
    if (['pantry', 'baseboard', 'cellar', ''].indexOf(expId) === -1) return 'Invalid request.';
  }
  if (message.op === 'autoPause' && typeof message.paused !== 'boolean') return 'Invalid request.';
  if (message.op === 'display' && (typeof message.level !== 'string' || !/^[a-z]{1,16}$/.test(message.level))) return 'Invalid request.';
  return '';
}
function command(phone, message) {
  var invalid = validCommand(message);
  if (invalid) { phone.send({t: 'result', rid: typeof message.rid === 'string' ? message.rid.slice(0, 64) : '', ok: false, message: invalid}); return; }
  stats.commands++;
  if (message.op === 'show') {
    if (game && game.visible) phone.send({t: 'result', rid: message.rid, ok: true, message: 'The colony is open.'});
    else launch(phone, message.rid);
    return;
  }
  if (message.op === 'hide' && !(game && game.visible)) { phone.send({t: 'result', rid: message.rid, ok: true, message: 'The colony is paused.'}); return; }
  if (!game || !game.visible) { phone.send({t: 'result', rid: message.rid, ok: false, code: 'paused', message: 'Open the colony to play.'}); return; }
  // A repeat of an unanswered request waits for the same answer; the game also
  // returns its cached result for repeats that arrive after it answered.
  var entry = pending[message.rid];
  if (entry) { entry.phones.push(phone); return; }
  pending[message.rid] = {phones: [phone], timer: setTimeout(function () {
    settle(message.rid, {ok: false, uncertain: true, message: 'The colony did not answer. Checking what happened…'});
  }, COMMAND_TIMEOUT)};
  var forwarded = {t: 'cmd', rid: message.rid, session: message.session, op: message.op, view: phone.view || normalizeView({})};
  if (message.kind !== undefined) forwarded.kind = message.kind;
  if (message.id !== undefined) forwarded.id = message.id;
  if (message.quantity !== undefined) forwarded.quantity = message.quantity;
  if (message.paused !== undefined) forwarded.paused = message.paused;
  if (message.level !== undefined) forwarded.level = message.level;
  if (message.slot !== undefined) forwarded.slot = message.slot;
  if (message.choice !== undefined) forwarded.choice = message.choice;
  if (message.action !== undefined) forwarded.action = message.action;
  sendGame(forwarded);
}
function Phone(conn, request) {
  this.conn = conn;
  this.phoneId = '';
  this.visible = true;
  this.view = null;
  this.viewKey = '';
  this.tokens = 20;
  this.refilled = Date.now();
  this.violations = 0;
  this.dirty = '';
  this.address = request.socket.remoteAddress;
  var self = this;
  conn.on('drain', function () { if (self.dirty) self.state(self.dirty); });
}
Phone.prototype.send = function (message) { this.conn.send(JSON.stringify(message)); };
// A slow phone gets the newest snapshot once its socket drains, never a backlog.
Phone.prototype.state = function (key) {
  var entry = lastStates[key];
  if (!entry) return;
  if (this.conn.buffered() > SLOW_CLIENT_BYTES) { this.dirty = key; stats.dropped++; return; }
  this.dirty = '';
  this.send({t: 'state', key: key, session: entry.session, at: entry.at, stale: !(game && game.visible && game.session === entry.session), data: entry.data});
};
Phone.prototype.allow = function () {
  var now = Date.now();
  this.tokens = Math.min(20, this.tokens + (now - this.refilled) / 100);
  this.refilled = now;
  if (this.tokens < 1) {
    if (++this.violations > 50) this.conn.close(1008, 'Too many messages');
    return false;
  }
  this.tokens -= 1;
  return true;
};
Phone.prototype.receive = function (text) {
  if (!this.allow()) { this.send({t: 'error', message: 'Slow down a little.'}); return; }
  var message;
  try { message = JSON.parse(text); } catch (error) { this.conn.close(1007, 'Invalid JSON'); return; }
  if (!message || typeof message !== 'object' || typeof message.t !== 'string') return;
  if (!this.phoneId) {
    if (message.t !== 'hello') { this.conn.close(1008, 'Hello required'); return; }
    var credential = typeof message.credential === 'string' ? message.credential : '';
    var digest = hash(credential);
    var match = paired.filter(function (entry) { return credential.length >= 32 && same(entry.hash, digest); })[0];
    if (!match) { this.send({t: 'revoked'}); this.conn.close(4001, 'Not paired'); return; }
    clearTimeout(this.helloTimer);
    this.phoneId = match.id;
    match.lastSeen = Date.now();
    savePhones();
    this.visible = message.visible !== false;
    this.view = normalizeView(message.view);
    this.viewKey = viewKey(this.view);
    this.send({t: 'welcome', phone: {id: match.id, name: match.name}, catalog: catalog, icons: icons});
    this.send(gameStatus());
    this.state(this.viewKey);
    updateWatch();
    if (game && game.visible) sendGame({t: 'refresh', view: this.view});
    phonesChanged();
    return;
  }
  if (message.t === 'view') {
    this.visible = message.visible !== false;
    this.view = normalizeView(message.view);
    var changed = this.viewKey !== viewKey(this.view);
    this.viewKey = viewKey(this.view);
    updateWatch();
    if (this.visible && changed) this.state(this.viewKey);
    if (this.visible && game && game.visible) sendGame({t: 'refresh', view: this.view});
  } else if (message.t === 'refresh') {
    this.state(this.viewKey);
    if (game && game.visible && this.view) sendGame({t: 'refresh', view: this.view});
  } else if (message.t === 'cmd') {
    command(this, message);
  } else if (message.t === 'forget' && typeof message.id === 'string') {
    forget(message.id);
  } else this.send({t: 'error', message: 'Unsupported message.'});
};

// ---- HTTP ----
var files = {
  '/': {file: path.join(config.publicDir, 'index.html'), type: 'text/html; charset=utf-8'},
  '/index.html': {file: path.join(config.publicDir, 'index.html'), type: 'text/html; charset=utf-8'},
  '/phone.js': {file: path.join(config.publicDir, 'phone.js'), type: 'application/javascript; charset=utf-8'},
  '/phone.css': {file: path.join(config.publicDir, 'phone.css'), type: 'text/css; charset=utf-8'},
  '/theme.js': {file: themeFile, type: 'application/javascript; charset=utf-8'},
  '/manifest.webmanifest': {file: path.join(config.publicDir, 'manifest.webmanifest'), type: 'application/manifest+json; charset=utf-8'},
  '/icons/apple-touch-icon.png': {file: path.join(config.publicDir, 'icons/apple-touch-icon.png'), type: 'image/png', cache: true},
  '/icons/icon-192.png': {file: path.join(config.publicDir, 'icons/icon-192.png'), type: 'image/png', cache: true},
  '/icons/icon-512.png': {file: path.join(config.publicDir, 'icons/icon-512.png'), type: 'image/png', cache: true},
  '/fonts/atkinson-hyperlegible-400.woff2': {file: path.join(config.publicDir, 'fonts/atkinson-hyperlegible-400.woff2'), type: 'font/woff2', cache: true},
  '/fonts/atkinson-hyperlegible-700.woff2': {file: path.join(config.publicDir, 'fonts/atkinson-hyperlegible-700.woff2'), type: 'font/woff2', cache: true},
  '/fonts/bricolage-grotesque.woff2': {file: path.join(config.publicDir, 'fonts/bricolage-grotesque.woff2'), type: 'font/woff2', cache: true}
};
// Not cached for a week like the icons, so replaced art reaches phones at once.
UI_ART.forEach(function (name) { files['/ui-art/' + name + '.png'] = {file: uiArtFile(name), type: 'image/png'}; });
// The Red capsule the TV draws over Red's target; the installer copies it into public/, a checkout serves it from app/art.
files['/art/red_key_capsule.png'] = {file: [path.join(config.publicDir, 'art', 'red_key_capsule.png'), path.join(__dirname, '..', 'app', 'art', 'red_key_capsule.png')].filter(function (file) { return fs.existsSync(file); })[0], type: 'image/png'};
var pairAttempts = [];
function respond(response, status, body, type, headers) {
  response.writeHead(status, Object.assign({
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  }, headers || {}));
  response.end(body);
}
function json(response, status, value) { respond(response, status, JSON.stringify(value)); }
function pair(request, response) {
  var now = Date.now();
  pairAttempts = pairAttempts.filter(function (at) { return now - at < 60000; });
  if (pairAttempts.length >= 10) { json(response, 429, {error: 'Too many pairing attempts. Wait a minute.'}); return; }
  pairAttempts.push(now);
  if (!originAllowed(request) || !/^application\/json\b/.test(String(request.headers['content-type'] || ''))) { json(response, 403, {error: 'Pairing must come from the controller page.'}); return; }
  var body = '';
  var size = 0;
  request.setEncoding('utf8');
  request.on('data', function (chunk) {
    size += Buffer.byteLength(chunk);
    if (size > 1024) { json(response, 413, {error: 'Request too large.'}); request.destroy(); return; }
    body += chunk;
  });
  request.on('end', function () {
    if (size > 1024) return;
    var input;
    try { input = JSON.parse(body); } catch (error) { json(response, 400, {error: 'Invalid request.'}); return; }
    var token = input && typeof input.token === 'string' ? input.token : '';
    var expires = Object.prototype.hasOwnProperty.call(pairTokens, token) ? pairTokens[token] : 0;
    if (!expires || expires < Date.now()) { json(response, 403, {error: 'This pairing code has expired or was already used. Open Phone controller on the TV for a new code.'}); return; }
    delete pairTokens[token];
    if (paired.length >= MAX_PHONES) { json(response, 409, {error: 'Eight phones are paired. Forget one on the TV first.'}); return; }
    var name = typeof input.name === 'string' ? input.name.replace(/[^\w .'()-]/g, '').trim().slice(0, 32) : '';
    var credential = random(32);
    var entry = {id: random(9), name: name || 'Phone', hash: hash(credential), pairedAt: Date.now(), lastSeen: Date.now()};
    paired.push(entry);
    savePhones(true);
    sendGame({t: 'paired', name: entry.name});
    phonesChanged();
    log('[ROACH] controller: paired', entry.name);
    json(response, 200, {id: entry.id, name: entry.name, credential: credential});
  });
}
var server = http.createServer(function (request, response) {
  if (!hostAllowed(request.headers.host)) { respond(response, 421, 'Unknown host', 'text/plain'); return; }
  var url = String(request.url || '').split('?')[0];
  if (request.method === 'POST' && url === '/api/pair') { pair(request, response); return; }
  if (request.method !== 'GET' && request.method !== 'HEAD') { respond(response, 405, 'Method not allowed', 'text/plain'); return; }
  if (url === '/api/health') {
    if (!loopback(request.socket.remoteAddress)) { respond(response, 403, 'Forbidden', 'text/plain'); return; }
    var memory = process.memoryUsage();
    json(response, 200, {ok: true, uptime: Math.round(process.uptime()), node: process.version, port: config.port, game: {connected: !!game, visible: !!(game && game.visible)}, phones: {paired: paired.length, connected: sockets.filter(function (phone) { return phone.phoneId; }).length}, pending: Object.keys(pending).length, cache: {states: Object.keys(lastStates).length, catalog: Object.keys(catalog).length, icons: Object.keys(icons).length}, stats: stats, memory: {rss: memory.rss, heapUsed: memory.heapUsed}});
    return;
  }
  var entry = files[url];
  if (!entry || !entry.file) { respond(response, 404, 'Not found', 'text/plain'); return; }
  fs.readFile(entry.file, function (error, data) {
    if (error) { respond(response, 404, 'Not found', 'text/plain'); return; }
    var headers = entry.cache ? {'Cache-Control': 'max-age=604800'} : {};
    if (url === '/' || url === '/index.html') headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data:; connect-src 'self' ws://" + request.headers.host + "; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
    respond(response, 200, request.method === 'HEAD' ? '' : data, entry.type, headers);
  });
});
server.on('upgrade', function (request, socket, head) {
  socket.on('error', function () { socket.destroy(); });
  if (String(request.url).split('?')[0] !== '/ws' || !hostAllowed(request.headers.host) || !originAllowed(request)) { ws.reject(socket, 403, 'Forbidden'); return; }
  if (sockets.length >= MAX_PHONE_SOCKETS) { ws.reject(socket, 503, 'Busy'); return; }
  var conn = ws.accept(request, socket, head, {maxPayload: 4096});
  if (!conn) return;
  stats.phoneConnections++;
  var phone = new Phone(conn, request);
  phone.helloTimer = setTimeout(function () { if (!phone.phoneId) conn.close(1008, 'Hello required'); }, 5000);
  sockets.push(phone);
  conn.on('message', function (text) { phone.receive(text); });
  conn.on('close', function () {
    clearTimeout(phone.helloTimer);
    var index = sockets.indexOf(phone);
    if (index !== -1) sockets.splice(index, 1);
    Object.keys(pending).forEach(function (rid) {
      pending[rid].phones = pending[rid].phones.filter(function (entry) { return entry !== phone; });
    });
    if (phone.phoneId) { updateWatch(); phonesChanged(); }
  });
});
server.maxConnections = 48;
server.setTimeout(30000);

var gameServer = http.createServer(function (request, response) { respond(response, 404, 'Not found', 'text/plain'); });
gameServer.on('upgrade', function (request, socket, head) {
  socket.on('error', function () { socket.destroy(); });
  var origin = request.headers.origin;
  // webOS gives the installed app's page the origin file://<app id>-webos.
  var originOk = origin === undefined || origin === 'null' || origin === 'file://' || origin === 'file://com.phil.roachcolony-webos' || config.gameOrigins.indexOf(origin) !== -1;
  if (String(request.url).split('?')[0] !== '/game' || !loopback(request.socket.remoteAddress) || !originOk) { ws.reject(socket, 403, 'Forbidden'); return; }
  var conn = ws.accept(request, socket, head, {maxPayload: 2 * 1024 * 1024});
  if (conn) handleGame(conn, request);
});
gameServer.maxConnections = 4;

// Dead Wi-Fi peers can leave half-open sockets; drop anything silent for 75 s.
var keepAlive = setInterval(function () {
  var now = Date.now();
  sockets.forEach(function (phone) {
    if (now - phone.conn.lastActive > 75000) phone.conn.terminate();
    else phone.conn.ping();
  });
  if (game) {
    if (now - game.conn.lastActive > 75000) game.conn.terminate();
    else game.conn.ping();
  }
  Object.keys(pairTokens).forEach(function (token) { if (pairTokens[token] < now) delete pairTokens[token]; });
}, 30000);

function listen(target, port, host, label, callback) {
  target.on('error', function (error) {
    log('[ROACH] controller: ' + label + ' listener failed on ' + host + ':' + port + '.', error.message);
    process.exit(1);
  });
  target.listen(port, host, callback);
}
listen(gameServer, config.gamePort, '127.0.0.1', 'game', function () {
  listen(server, config.port, config.bind, 'phone', function () {
    log('[ROACH] controller: listening on ' + config.bind + ':' + config.port + ' (game socket 127.0.0.1:' + config.gamePort + ', ' + paired.length + ' paired phones, node ' + process.version + ')');
    if (process.send) process.send({ready: true, port: server.address().port, gamePort: gameServer.address().port});
  });
});
function shutdown() {
  clearInterval(keepAlive);
  if (saveTimer) savePhones(true);
  server.close();
  gameServer.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
