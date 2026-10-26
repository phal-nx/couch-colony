'use strict';
// Simulated TV session for the phone controller: the bridge runs on Node
// (Node 8.12 when ROACH_BRIDGE_NODE points at it), the real game page runs in
// headless Chrome with a fake PalmSystem, and a fake luna-send relays Show
// launches back into the page. Nothing here contacts the TV.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const ws = require('../phone-controller/websocket.js');
const Engine = require('../app/engine.js');
const Save = require('../app/save.js');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'work/controller-qa');
fs.mkdirSync(out, {recursive: true});
const runDir = fs.mkdtempSync(path.join(out, 'run-'));
const bridgeNode = process.env.ROACH_BRIDGE_NODE || process.execPath;
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RECEIPT = 'phil_roach_colony_reset_token';
const measurements = {};
const pageErrors = [];
let passed = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function step(name, run) {
  const started = Date.now();
  await run();
  passed += 1;
  console.log('ok ' + name + ' (' + (Date.now() - started) + ' ms)');
}
function freePort() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); });
  });
}
async function waitFor(check, timeout = 8000, label = 'condition') {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error('Timed out waiting for ' + label);
    await sleep(50);
  }
}

// ---- Static app server (same layout as the browser suite) ----
const types = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json'};
function staticServer() {
  const app = path.join(root, 'app');
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/app/storage-fixture') { response.writeHead(200, {'Content-Type': 'text/html'}).end('<!doctype html>'); return; }
    const file = path.resolve(app, pathname.replace(/^\/app\/?/, '') || 'index.html');
    if (!pathname.startsWith('/app/') || !file.startsWith(app + path.sep)) { response.writeHead(404).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
      response.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---- Bridge process ----
const lunaLog = path.join(runDir, 'luna.log');
const fakeLuna = path.join(runDir, 'luna-send');
fs.writeFileSync(fakeLuna, '#!/bin/sh\nprintf "%s\\n" "$4" >> "$FAKE_LUNA_LOG"\necho \'{"returnValue":true}\'\n', {mode: 0o755});
function lunaLaunches() {
  return fs.existsSync(lunaLog) ? fs.readFileSync(lunaLog, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}
const ports = {};
let bridge = null;
let bridgeLog = '';
async function startBridge(appOrigin) {
  bridge = spawn(bridgeNode, [path.join(root, 'phone-controller/bridge.js')], {
    env: {
      ...process.env,
      ROACH_CONTROLLER_PORT: String(ports.phone), ROACH_CONTROLLER_GAME_PORT: String(ports.game),
      ROACH_CONTROLLER_BIND: '127.0.0.1', ROACH_CONTROLLER_DATA: path.join(runDir, 'data'),
      ROACH_CONTROLLER_KEY_FILE: path.join(runDir, 'key/game-key'), ROACH_CONTROLLER_LUNA_SEND: fakeLuna,
      ROACH_CONTROLLER_HOST: '127.0.0.1', ROACH_CONTROLLER_GAME_ORIGINS: appOrigin, FAKE_LUNA_LOG: lunaLog
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const ready = new Promise((resolve, reject) => {
    bridge.stdout.on('data', chunk => { bridgeLog += chunk; if (/listening on/.test(bridgeLog)) resolve(); });
    bridge.stderr.on('data', chunk => { bridgeLog += chunk; });
    bridge.on('exit', code => reject(new Error('Bridge exited ' + code + '\n' + bridgeLog)));
  });
  await ready;
  bridge.removeAllListeners('exit');
}
function stopBridge(signal = 'SIGTERM') {
  return new Promise(resolve => { if (!bridge || bridge.exitCode !== null) { resolve(); return; } bridge.once('exit', resolve); bridge.kill(signal); });
}
function gameKey() { return fs.readFileSync(path.join(runDir, 'key/game-key'), 'utf8').trim(); }
function request(method, pathname, {headers = {}, body} = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port: ports.phone, method, path: pathname, headers}, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({status: response.statusCode, headers: response.headers, text, json: () => JSON.parse(text)}));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const origin = () => 'http://127.0.0.1:' + ports.phone;
async function health() { return (await request('GET', '/api/health')).json(); }

// ---- Phone WebSocket clients ----
function rawSocket(url, headers) {
  return new Promise((resolve, reject) => ws.connect(url, headers, (error, conn) => error ? reject(error) : resolve(conn)));
}
let ridSerial = 0;
async function phone(credential, view = {list: 'unit', tab: '', quantity: 1}, {visible = true} = {}) {
  const conn = await rawSocket('ws://127.0.0.1:' + ports.phone + '/ws', {Origin: origin()});
  const client = {conn, messages: [], waiters: [], session: '', closed: false, game: ''};
  conn.on('message', text => {
    const message = JSON.parse(text);
    if (message.t === 'status') { client.session = message.session; client.game = message.game; }
    client.messages.push(message);
    client.waiters.slice().forEach(waiter => { if (waiter.match(message)) { client.waiters.splice(client.waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(message); } });
  });
  conn.on('close', () => { client.closed = true; });
  client.send = message => conn.send(JSON.stringify(message));
  client.next = (match, timeout = 6000, backlog = false) => new Promise((resolve, reject) => {
    if (backlog !== false) { const found = client.messages.slice(backlog === true ? 0 : backlog).find(match); if (found) { resolve(found); return; } }
    const waiter = {match, resolve, timer: setTimeout(() => reject(new Error('Phone message timeout: ' + match + ' after ' + JSON.stringify(client.messages.slice(-3)).slice(0, 600))), timeout)};
    client.waiters.push(waiter);
  });
  client.command = async (op, extra = {}, rid = 'r' + Date.now().toString(36) + (++ridSerial)) => {
    const reply = client.next(message => message.t === 'result' && message.rid === rid);
    client.send({t: 'cmd', rid, session: client.session, op, ...extra});
    return reply;
  };
  client.fresh = () => { const next = client.next(message => message.t === 'state' && !message.stale); client.send({t: 'refresh'}); return next; };
  client.close = () => new Promise(resolve => { if (client.closed) { resolve(); return; } conn.once('close', resolve); conn.close(1000); });
  const welcome = client.next(message => message.t === 'welcome' || message.t === 'revoked');
  client.send({t: 'hello', credential, visible, view});
  client.welcome = await welcome;
  if (client.welcome.t === 'welcome') await client.next(message => message.t === 'status', 3000, true);
  return client;
}

// ---- Game pages ----
// Saved colonies are awake unless a test asks for the dormant opening.
function saveText(units, upgrades = {}, opening = {awake: true}) {
  const T = Date.now();
  const game = new Engine.Game({now: T, activeTimeOnly: true});
  const state = game.exportState(T);
  Object.assign(state.state.unittypes, units);
  Object.assign(state.state.upgrades, upgrades);
  state.opening = opening;
  game.importState(state, T);
  const values = {};
  const store = new Save.Store({getItem: key => values[key] === undefined ? null : values[key], setItem: (key, value) => { values[key] = String(value); }, removeItem() {}});
  assert.equal(store.save(game, T), true);
  return values[Save.keys.primary];
}
let appBase = '';
let currentGame = null;
async function openGame(browser, {storage = {}, params, init} = {}) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
  const page = await context.newPage();
  // Chance events read the local clock; daytime keeps the night shift out of unrelated checks.
  await page.addInitScript(init || (() => { window.RoachMechanicsOptions = {hour: () => 14}; }));
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(appBase + 'storage-fixture');
  await page.evaluate(values => { localStorage.clear(); Object.keys(values).forEach(key => localStorage.setItem(key, values[key])); }, storage);
  const launch = params || {compact: true, corner: 'bottom-right', autoCloseSeconds: 0, controllerKey: gameKey(), controllerPort: ports.game};
  await page.addInitScript(value => {
    window.PalmSystem = {launchParams: JSON.stringify(value)};
    window.close = function () { window.closeCalls = (window.closeCalls || 0) + 1; };
  }, launch);
  await page.goto(appBase);
  await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
  currentGame = page;
  return page;
}
async function connected(page) {
  await page.waitForFunction(() => colonyDiagnostics().controller && colonyDiagnostics().controller.connected, null, {timeout: 15000});
}
function relaunch(page, params) {
  return page.evaluate(value => {
    window.PalmSystem.launchParams = JSON.stringify(value);
    document.dispatchEvent(new CustomEvent('webOSRelaunch', {detail: value}));
  }, params);
}
const blue = page => relaunch(page, {remoteToggle: true, compact: true, corner: 'bottom-right', autoCloseSeconds: 0});
const diagnostics = page => page.evaluate(() => colonyDiagnostics());
async function savedState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('phil_roach_colony_v2')).state.state);
}
async function exported(page) {
  return page.evaluate(() => {
    document.querySelector('#plus').click();
    document.querySelector('[data-view="more"]').click();
    document.querySelector('#export').click();
    const text = document.querySelector('#save-text').value;
    document.querySelector('#dialog-cancel').click();
    document.querySelector('#close').click();
    return JSON.parse(text).state.state;
  });
}
let lunaSeen = 0;
// Relays the bridge's luna-send launches into the current game page.
const lunaPump = setInterval(async () => {
  const launches = lunaLaunches();
  while (lunaSeen < launches.length) {
    const entry = launches[lunaSeen++];
    if (currentGame && !currentGame.isClosed()) await relaunch(currentGame, entry.params).catch(() => {});
  }
}, 100);
async function pairPhone(game) {
  await game.locator('#plus').click();
  await game.locator('[data-view="more"]').click();
  await game.locator('#phone-controller').click();
  await game.waitForSelector('#controller-panel .pair-url');
  const url = new URL(await game.locator('#controller-panel .pair-url').textContent());
  assert.equal(await game.locator('#controller-panel canvas.pair-code').count(), 1);
  const token = url.searchParams.get('pair');
  return {token, url};
}
async function closeMenu(game) {
  await game.keyboard.press('Escape');
  await game.keyboard.press('Escape');
  assert.equal((await diagnostics(game)).compact, true);
  assert.equal((await diagnostics(game)).closed, false);
}
async function exchange(token, headers = {Origin: origin(), 'Content-Type': 'application/json'}) {
  return request('POST', '/api/pair', {headers, body: JSON.stringify({token, name: 'Test phone'})});
}
function ownedOf(result, id) {
  const item = result.data && result.data.items.find(entry => entry.id === id);
  return item && item.owned;
}

(async () => {
  const appServer = await staticServer();
  appBase = 'http://127.0.0.1:' + appServer.address().port + '/app/';
  ports.phone = await freePort();
  ports.game = await freePort();
  await startBridge('http://127.0.0.1:' + appServer.address().port);
  const nodeVersion = execFileSync(bridgeNode, ['-v']).toString().trim();
  console.log('# bridge runs on node ' + nodeVersion + (nodeVersion === 'v8.12.0' ? ' (TV version)' : ' (set ROACH_BRIDGE_NODE to a Node 8.12 binary to match the TV)'));
  const browser = await chromium.launch({headless: true, executablePath: chromePath});
  const baseStorage = {[RECEIPT]: 'fresh-start-0.3.0', phil_roach_colony_v2_backup: saveText({meat: '5', larva: '5'})};
  let credential = '';
  let second = '';
  let game;
  try {
    await step('pairing issues a single-use code and rejects bad credentials, origins and hosts', async () => {
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText({meat: '1000', larva: '1000'})}});
      await connected(game);
      const before = await diagnostics(game);
      const {token, url} = await pairPhone(game);
      assert.match(url.href, /^http:\/\/127\.0\.0\.1:\d+\/\?pair=[A-Za-z0-9_-]{16}$/);
      await game.screenshot({path: path.join(out, 'tv-pairing.png')});
      assert.equal((await exchange(token, {Origin: 'http://evil.example', 'Content-Type': 'application/json'})).status, 403);
      assert.equal((await exchange('not-a-token')).status, 403);
      const good = await exchange(token);
      assert.equal(good.status, 200);
      credential = good.json().credential;
      assert.equal((await exchange(token)).status, 403, 'pairing codes are single use');
      await game.waitForFunction(() => /Paired Test phone/.test(document.querySelector('#controller-panel').textContent));
      const stored = JSON.parse(fs.readFileSync(path.join(runDir, 'data/phones.json'), 'utf8'));
      assert.equal(stored.phones.length, 1);
      assert.ok(!JSON.stringify(stored).includes(credential), 'only a hash of the credential is stored');
      await game.locator('#dialog-confirm').click();
      await game.waitForSelector('#controller-panel .pair-url');
      second = (await exchange(new URL(await game.locator('#controller-panel .pair-url').textContent()).searchParams.get('pair'))).json().credential;
      await closeMenu(game);
      assert.deepEqual({menu: (await diagnostics(game)).menu}, {menu: 'more'});
      assert.equal(before.closed, false);

      const intruder = await phone('x'.repeat(43));
      assert.equal(intruder.welcome.t, 'revoked');
      await waitFor(() => intruder.closed, 3000, 'invalid credential close');
      assert.equal((await request('GET', '/', {headers: {Host: 'evil.example:' + ports.phone}})).status, 421);
      await assert.rejects(rawSocket('ws://127.0.0.1:' + ports.phone + '/ws', {Origin: 'http://evil.example'}));
      await assert.rejects(rawSocket('ws://127.0.0.1:' + ports.game + '/game', {Origin: 'http://evil.example'}));
      const fakeGame = await rawSocket('ws://127.0.0.1:' + ports.game + '/game', {});
      fakeGame.send(JSON.stringify({t: 'hello', key: '0'.repeat(64), session: 'x', visible: true}));
      await waitFor(() => fakeGame.closed, 3000, 'invalid game key close');
      const page = await request('GET', '/');
      assert.equal(page.status, 200);
      assert.match(page.headers['content-security-policy'], /default-src 'self'/);
      assert.equal(page.headers['referrer-policy'], 'no-referrer');

      const client = await phone(credential);
      assert.equal(client.welcome.t, 'welcome');
      assert.equal(client.game, 'live');
      const phonesList = await client.next(message => message.t === 'phones', 3000, true);
      assert.deepEqual(phonesList.phones.map(entry => entry.self), [true, false]);
      const display = await client.command('display', {level: 'critters'});
      assert.deepEqual([display.ok, display.message], [true, 'The TV shows Critters.']);
      assert.equal((await diagnostics(game)).critters, true);
      assert.equal((await client.command('display', {level: 'compact'})).ok, true);
      assert.deepEqual([(await diagnostics(game)).compact, (await diagnostics(game)).critters], [true, false]);
      assert.equal((await client.command('display', {level: 'huge'})).ok, false);
      assert.equal((await client.command('display', {level: 'Rm -rf'})).message, 'Invalid request.');
      const font = await request('GET', '/fonts/bricolage-grotesque.woff2');
      assert.deepEqual([font.status, font.headers['content-type']], [200, 'font/woff2']);
      const manifest = await request('GET', '/manifest.webmanifest');
      assert.deepEqual([manifest.status, manifest.headers['content-type'], manifest.headers['x-content-type-options']], [200, 'application/manifest+json; charset=utf-8', 'nosniff']);
      assert.deepEqual([manifest.json().display, manifest.json().start_url, manifest.json().icons.length], ['standalone', '/', 2]);
      for (const icon of ['/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png']) {
        const image = await request('GET', icon);
        assert.deepEqual([image.status, image.headers['content-type']], [200, 'image/png'], icon);
      }
      // The phone's share of the menu art, served with an image type from app/ui-art in a checkout.
      const installed = fs.readFileSync(path.join(root, 'scripts/tv/controller.py'), 'utf8');
      for (const name of ['ui_border_9slice', 'tab_units', 'tab_upgrades', 'tab_more', 'qty_1', 'qty_10', 'qty_max', 'progress_cap_left', 'progress_cap_right', 'progress_segment_full', 'progress_segment_empty']) {
        const art = await request('GET', '/ui-art/' + name + '.png');
        assert.deepEqual([art.status, art.headers['content-type'], art.headers['x-content-type-options']], [200, 'image/png', 'nosniff'], name);
        assert.ok(installed.indexOf("'" + name + "'") !== -1, name + ' is in the installer list');
      }
      assert.equal((await request('GET', '/ui-art/tab_units.png', {headers: {Host: 'evil.example:' + ports.phone}})).status, 421);
      for (const blocked of ['/ui-art/../bridge.js', '/ui-art/', '/ui-art/ui_focus_bracket.png', '/ui-art/built/ui_focus_9slice.png']) assert.equal((await request('GET', blocked)).status, 404, blocked);
      assert.equal((await request('GET', '/icons/apple-touch-icon.png', {headers: {Host: 'evil.example:' + ports.phone}})).status, 421);
      assert.equal((await request('GET', '/icons/../bridge.js')).status, 404);
      assert.equal((await request('GET', '/icons/')).status, 404);
      const unsupported = await client.command('shell', {command: 'reboot'});
      assert.deepEqual([unsupported.ok, unsupported.message], [false, 'Unsupported command.']);
      // Reset progress lives only in the TV's More dialog; no phone command reaches it.
      for (const op of ['reset', 'resetProgress']) {
        const refused = await client.command(op, {confirm: true});
        assert.deepEqual([refused.ok, refused.message], [false, 'Unsupported command.'], op + ' is not a phone command');
      }
      assert.equal(await game.evaluate(() => localStorage.getItem('phil_roach_colony_v2_before_reset')), null, 'no reset ran');
      const badKind = await client.command('buy', {kind: 'app', id: 'drone', quantity: 1});
      assert.equal(badKind.ok, false);
      client.send({t: 'launch', id: 'com.webos.app.browser'});
      assert.equal((await client.next(message => message.t === 'error')).message, 'Unsupported message.');
      const flood = [];
      for (let i = 0; i < 60; i++) client.send({t: 'refresh'});
      flood.push(await client.next(message => message.t === 'error' && /Slow down/.test(message.message)));
      assert.ok(flood.length);
      await client.close();
    });

    await step('a phone purchase equals the same remote purchase', async () => {
      const save = saveText({meat: '1000', larva: '1000'});
      await game.context().close();
      const remoteGame = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: save}});
      await connected(remoteGame);
      await remoteGame.locator('#plus').click();
      await remoteGame.locator('[data-quantity="10"]').click();
      await remoteGame.locator('[data-item="drone"] .buy').click();
      const remoteHint = await remoteGame.locator('#local-hint').textContent();
      const remote = await exported(remoteGame);
      await remoteGame.context().close();

      const phoneGame = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: save}});
      game = phoneGame;
      await connected(phoneGame);
      const client = await phone(credential, {list: 'unit', tab: 'meat', quantity: 10});
      const result = await client.command('buy', {kind: 'unit', id: 'drone', quantity: 10});
      assert.equal(result.ok, true, result.message);
      assert.equal(result.message, 'Bought 10 Forager roaches.');
      assert.deepEqual(result.bought, {kind: 'unit', id: 'drone', quantity: '10', label: '10'});
      assert.equal(ownedOf(result, 'drone'), '10');
      const local = await exported(phoneGame);
      assert.equal(local.unittypes.drone, remote.unittypes.drone);
      assert.ok(Math.abs(Number(local.unittypes.meat) - Number(remote.unittypes.meat)) < 25, 'meat spent matches within a few seconds of production');
      assert.ok(Math.abs(Number(local.unittypes.larva) - Number(remote.unittypes.larva)) < 5);
      assert.equal(await phoneGame.locator('#local-hint').textContent(), remoteHint, 'the TV shows its usual brief hint');
      const diag = await diagnostics(phoneGame);
      assert.deepEqual(diag.lastPurchase, {type: 'unit', id: 'drone'}, 'phone purchases share Buy Last with the remote');
      const last = await client.command('buyLast', {quantity: 1});
      assert.equal(last.message, 'Bought 1 Forager roach.');
      await client.close();
    });

    await step('duplicate request ids purchase exactly once', async () => {
      const client = await phone(credential, {list: 'unit', tab: 'meat', quantity: 1});
      const before = Number(ownedOf(await client.fresh(), 'drone'));
      const rid = 'dup' + Date.now();
      const mark = client.messages.length;
      const first = client.next(message => message.t === 'result' && message.rid === rid);
      client.send({t: 'cmd', rid, session: client.session, op: 'buy', kind: 'unit', id: 'drone', quantity: 1});
      client.send({t: 'cmd', rid, session: client.session, op: 'buy', kind: 'unit', id: 'drone', quantity: 1});
      const a = await first;
      // Both answers can arrive in one network read, so the second is looked up in the backlog too.
      const b = await client.next(message => message.t === 'result' && message.rid === rid && message !== a, 6000, mark);
      assert.equal(a.ok, true);
      assert.deepEqual(b, a);
      const third = await client.command('buy', {kind: 'unit', id: 'drone', quantity: 1}, rid);
      assert.deepEqual(third, a);
      const after = await client.fresh();
      assert.equal(Number(ownedOf(after, 'drone')), before + 1);
      await client.close();
    });

    await step('two phones buying at once cannot overspend', async () => {
      await game.context().close();
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText({meat: '50', larva: '1000'})}});
      await connected(game);
      const a = await phone(credential, {list: 'unit', tab: 'meat', quantity: 'max'});
      const b = await phone(second, {list: 'unit', tab: 'meat', quantity: 'max'});
      const results = await Promise.all([
        a.command('buy', {kind: 'unit', id: 'drone', quantity: 'max'}), b.command('buy', {kind: 'unit', id: 'drone', quantity: 'max'}),
        a.command('buy', {kind: 'unit', id: 'drone', quantity: 10}), b.command('buy', {kind: 'unit', id: 'drone', quantity: 10})
      ]);
      const bought = results.filter(result => result.ok).reduce((sum, result) => sum + Number(result.bought.quantity), 0);
      assert.equal(bought, 5, JSON.stringify(results.map(result => result.message)));
      assert.ok(results.some(result => result.code === 'unaffordable'));
      const state = await exported(game);
      assert.equal(state.unittypes.drone, '5');
      assert.ok(Number(state.unittypes.meat) >= 0 && Number(state.unittypes.meat) < 5);
      await a.close();
      await b.close();
    });

    await step('Buy Max reports the real quantity and keeps huge counts as strings', async () => {
      await game.context().close();
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText({meat: '3.5e301', larva: '2e300'})}});
      await connected(game);
      const client = await phone(credential, {list: 'unit', tab: 'meat', quantity: 'max'});
      const quote = await client.fresh();
      const drone = quote.data.items.find(item => item.id === 'drone');
      assert.equal(drone.qty, '2e+300');
      // Icons travel once per picture at their 64 px cell size: units by id, others as '#' + atlas slug.
      assert.equal(quote.data.resources.find(entry => entry.id === 'meat').icon, 'bread_crumb');
      assert.deepEqual(quote.data.meta, {achievement: 'trophy', visitors: 'visitor_log', ascension: 'ascension_shell', goldenRoach: 'golden_roach'});
      const pictures = Object.assign({}, ...client.messages.map(message => message.icons || {}));
      const width = url => Buffer.from(url.split(',')[1], 'base64').readUInt32BE(16);
      assert.equal(width(pictures.drone), 64);
      assert.equal(width(pictures['#bread_crumb']), 64);
      assert.equal(width(pictures['#trophy']), 64);
      const result = await client.command('buy', {kind: 'unit', id: 'drone', quantity: 'max'});
      assert.equal(result.ok, true, result.message);
      assert.equal(result.bought.quantity, '2e+300');
      // Display formatting belongs to the adapter; the protocol only promises compact strings.
      assert.match(result.bought.label, /^2(\.0+)?e\+?300$/);
      assert.equal(result.message, 'Bought ' + result.bought.label + ' Forager roaches.');
      assert.match(ownedOf(result, 'drone'), /^2(\.0+)?e\+?300$/);
      assert.doesNotMatch(JSON.stringify(result.data), /Infinity|NaN/);
      const state = await exported(game);
      assert.equal(state.unittypes.drone, '2e+300');
      await client.close();
    });

    await step('phone navigation and purchases never change the TV menu', async () => {
      await game.context().close();
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText({meat: '1e9', larva: '1e6', queen: '6', territory: '0'})}});
      await connected(game);
      const tvBefore = await diagnostics(game);
      const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
      await context.addInitScript(value => { localStorage.setItem('roach_controller_credential_v1', value); }, credential);
      const handset = await context.newPage();
      handset.on('pageerror', error => pageErrors.push('phone: ' + error.message));
      await handset.goto(origin() + '/');
      await handset.waitForSelector('#units .card .buy:not([disabled])');
      assert.equal(await handset.locator('#status-text').textContent(), 'Live on the TV');
      await handset.locator('#quantity [data-quantity="10"]').tap();
      await handset.waitForFunction(() => /Buy 10/.test(document.querySelector('[data-id="unit:drone"] .buy').textContent));
      await handset.locator('[data-id="unit:drone"] .buy').tap();
      await handset.waitForFunction(() => /Bought 10 /.test(document.querySelector('#toast').textContent));
      await handset.waitForFunction(() => /\bwash-a\b/.test(document.querySelector('.card[data-id="unit:drone"]').className), null, {timeout: 2000});
      await handset.locator('#resources .resource').first().tap();
      await handset.waitForSelector('#sheet:not([hidden]) .spend');
      await handset.locator('#sheet-close').tap();
      await handset.locator('#nav [data-screen="upgrades"]').tap();
      await handset.waitForSelector('#upgrades .card');
      await handset.waitForSelector('#upgrades .card .glyph img');
      await handset.locator('#nav [data-screen="more"]').tap();
      await handset.waitForFunction(() => document.querySelector('#ach-total').textContent.length > 0);
      await handset.waitForSelector('img[data-meta="achievement"]:not([hidden])');
      await handset.locator('#show-achievements').tap();
      await handset.waitForSelector('#achievement-list .achievement-row');
      await handset.locator('#achievements-back').tap();
      await handset.locator('#nav [data-screen="colony"]').tap();
      const tvAfter = await diagnostics(game);
      for (const field of ['compact', 'menu', 'tab', 'page', 'closed', 'corner']) assert.deepEqual(tvAfter[field], tvBefore[field], field);
      assert.equal(await game.locator('#dialog').isVisible(), false);
      assert.equal(await game.locator('#menu').isVisible(), false);
      await context.close();
    });

    await step('Blue closing during a command never executes it later, and old sessions are refused', async () => {
      const client = await phone(credential, {list: 'unit', tab: 'meat', quantity: 1});
      const oldSession = client.session;
      const before = await exported(game);
      const pendingResult = client.command('buy', {kind: 'unit', id: 'drone', quantity: 1});
      await blue(game);
      const raced = await pendingResult;
      await waitFor(async () => (await diagnostics(game)).closed, 3000, 'Blue close');
      const closedSave = await savedState(game);
      // Six queens lay drones until Blue closes, so whole counts can tick up on their own; only an
      // acknowledged purchase guarantees a whole extra drone, and nothing may change once closed.
      if (raced.ok) assert.ok(Number(closedSave.unittypes.drone) - Number(before.unittypes.drone) >= 1);
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.equal((await savedState(game)).unittypes.drone, closedSave.unittypes.drone);
      await client.next(message => message.t === 'status' && message.game === 'paused', 3000, true);
      const refused = await client.command('buy', {kind: 'unit', id: 'drone', quantity: 1});
      assert.deepEqual([refused.ok, refused.message], [false, 'Open the colony to play.']);
      const mark = client.messages.length;
      await blue(game);
      await client.next(message => message.t === 'status' && message.game === 'live', 6000, mark);
      assert.notEqual(client.session, oldSession);
      const stale = await new Promise(resolve => {
        const rid = 'stale' + Date.now();
        client.next(message => message.t === 'result' && message.rid === rid).then(resolve);
        client.send({t: 'cmd', rid, session: oldSession, op: 'buy', kind: 'unit', id: 'drone', quantity: 1});
      });
      assert.equal(stale.code, 'session');
      // Reopening resumes the queens' laying, but a replayed purchase would add a whole drone.
      assert.ok(Number((await exported(game)).unittypes.drone) - Number(closedSave.unittypes.drone) < 1);
      await client.close();
    });

    await step('a command in flight when the game vanishes reports uncertainty and is not replayed', async () => {
      const key = gameKey();
      const fake = await rawSocket('ws://127.0.0.1:' + ports.game + '/game', {});
      fake.send(JSON.stringify({t: 'hello', key, session: 'fake.1', visible: true}));
      const client = await phone(credential);
      await client.next(message => message.t === 'status' && message.session === 'fake.1', 3000, true);
      const commands = [];
      fake.on('message', text => { const message = JSON.parse(text); if (message.t === 'cmd') commands.push(message); });
      const reply = client.command('buy', {kind: 'unit', id: 'drone', quantity: 1});
      await waitFor(() => commands.length === 1, 3000, 'forwarded command');
      fake.terminate();
      const result = await reply;
      assert.equal(result.ok, false);
      assert.equal(result.uncertain, true);
      await client.close();
      // The real game takes over again on its next retry, and nothing is resent.
      await relaunch(game, {controllerKey: key, controllerPort: ports.game});
      await connected(game);
      const resumed = await phone(credential);
      await sleep(1000);
      assert.equal(commands.length, 1);
      await resumed.close();
    });

    await step('hidden time grants no production, and phones never resume the colony', async () => {
      await game.context().close();
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText({meat: '0', larva: '0', drone: '1000'})}});
      await connected(game);
      const client = await phone(credential, {list: 'unit', tab: 'meat', quantity: 1});
      const hidden = await client.command('hide');
      assert.deepEqual([hidden.ok, hidden.message], [true, 'Colony paused and saved.']);
      await waitFor(async () => (await diagnostics(game)).closed, 3000, 'phone hide');
      const launchesBefore = lunaLaunches().length;
      const closedSave = await savedState(game);
      const again = await client.command('hide');
      assert.deepEqual([again.ok, again.message], [true, 'The colony is paused.']);
      // Reconnecting, browsing and refreshing while paused must not open or advance it.
      await client.close();
      const reconnect = await phone(credential, {list: 'unit', tab: 'meat', quantity: 1});
      assert.equal(reconnect.game, 'paused');
      const paused = await reconnect.next(message => message.t === 'state', 3000, true);
      assert.equal(paused.stale, true);
      for (let i = 0; i < 6; i++) { reconnect.send({t: 'view', view: {list: i % 2 ? 'upgrade' : 'unit', tab: '', quantity: 1}, visible: true}); reconnect.send({t: 'refresh'}); await sleep(400); }
      const refused = await reconnect.command('forage');
      assert.equal(refused.message, 'Open the colony to play.');
      assert.equal(lunaLaunches().length, launchesBefore);
      assert.equal((await diagnostics(game)).closed, true);
      const shown = await reconnect.command('show');
      assert.deepEqual([shown.ok, shown.message], [true, 'Opening the colony…']);
      const retried = await reconnect.command('show');
      assert.equal(retried.ok, true);
      await waitFor(async () => !(await diagnostics(game)).closed, 3000, 'Show');
      await reconnect.next(message => message.t === 'status' && message.game === 'live', 3000, true);
      await sleep(300);
      assert.equal((await diagnostics(game)).closed, false, 'a retried Show never hides');
      const launch = lunaLaunches().slice(-1)[0];
      assert.equal(launch.id, 'com.phil.roachcolony');
      assert.equal(launch.params.controllerShow, true);
      assert.equal(launch.params.resetSaveToken, undefined);
      assert.equal(lunaLaunches().length, launchesBefore + 1, 'a retried Show within a few seconds launches once');
      const show = await reconnect.command('show');
      assert.equal(show.message, 'The colony is open.');
      await reconnect.command('hide');
      await waitFor(async () => (await diagnostics(game)).closed, 3000, 'second hide');
      const reopenedSave = await savedState(game);
      const elapsed = reopenedSave.date.reified - closedSave.date.reified;
      assert.ok(elapsed < 2000, 'game time advanced only while visible: ' + elapsed + ' ms of about ' + 3000 + ' ms wall time');
      measurements.hiddenWallMsVsGameMs = {wall: '>3000', game: elapsed};
      const meatRate = 1000; // 1000 drones gather at least one crumb each per second.
      assert.ok(Number(reopenedSave.unittypes.meat) - Number(closedSave.unittypes.meat) < meatRate * 2.5);
      await blue(game);
      await waitFor(async () => !(await diagnostics(game)).closed, 3000, 'Blue reopen');
      await reconnect.close();
    });

    await step('bridge failure leaves the game and remote usable, and the game reconnects quietly', async () => {
      await stopBridge('SIGKILL');
      await game.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 403, bubbles: true})));
      assert.match(await game.locator('#message').textContent(), /^Foraged /);
      await blue(game);
      assert.equal((await diagnostics(game)).closed, true);
      await blue(game);
      assert.equal((await diagnostics(game)).closed, false);
      await game.locator('#plus').click();
      await game.locator('[data-view="more"]').click();
      await game.locator('#phone-controller').click();
      assert.match(await game.locator('#controller-panel').textContent(), /not answering|Connecting/);
      await closeMenu(game);
      assert.doesNotMatch(await game.locator('#local-hint').textContent(), /controller|bridge|connect/i);
      assert.equal(await game.locator('#save-warning').isVisible(), false);
      await sleep(1500);
      await startBridge('http://127.0.0.1:' + (new URL(appBase)).port);
      await connected(game);
      const client = await phone(credential);
      assert.equal(client.game, 'live');
      await client.close();
    });

    await step('a dropped phone connection never replays its purchase', async () => {
      const client = await phone(credential, {list: 'unit', tab: 'meat', quantity: 1});
      const before = Number((await exported(game)).unittypes.drone);
      client.send({t: 'cmd', rid: 'drop' + Date.now(), session: client.session, op: 'buy', kind: 'unit', id: 'drone', quantity: 1});
      client.conn.terminate();
      await sleep(500);
      const again = await phone(credential, {list: 'unit', tab: 'meat', quantity: 1});
      await sleep(2500);
      const after = Number((await exported(game)).unittypes.drone);
      assert.ok(after - before >= 0 && after - before < 2, 'bought at most once: ' + (after - before));
      await again.close();
    });

    await step('forgetting a phone revokes it immediately', async () => {
      const client = await phone(second);
      const list = await (async () => {
        await game.locator('#plus').click();
        await game.locator('[data-view="more"]').click();
        await game.locator('#phone-controller').click();
        await game.waitForSelector('.paired-phone');
        return game.locator('.paired-phone').count();
      })();
      assert.equal(list, 2);
      const forget = game.locator('.paired-phone button').last();
      await forget.click();
      assert.equal(await forget.textContent(), 'Confirm forget');
      await forget.click();
      await client.next(message => message.t === 'revoked', 6000, true);
      await waitFor(() => client.closed, 3000, 'revoked close');
      await game.waitForFunction(() => document.querySelectorAll('.paired-phone').length === 1);
      await closeMenu(game);
      const retry = await phone(second);
      assert.equal(retry.welcome.t, 'revoked');
    });

    await step('saves and the one-time reset receipt stay intact', async () => {
      const keys = await game.evaluate(() => Object.keys(localStorage).sort());
      assert.ok(keys.every(key => /^phil_roach_colony_/.test(key)), keys.join(','));
      assert.equal(await game.evaluate(key => localStorage.getItem(key), RECEIPT), 'fresh-start-0.3.0');
      assert.ok(await game.evaluate(() => localStorage.getItem('phil_roach_colony_v2_backup')));
      assert.deepEqual(fs.readdirSync(path.join(runDir, 'data')).sort(), ['phones.json']);
      assert.ok(lunaLaunches().every(entry => entry.params.resetSaveToken === undefined));
    });

    await step('measure controller cost against the same colony with no phone', async () => {
      await game.context().close();
      const storage = {...baseStorage, phil_roach_colony_v2: saveText({meat: '1e12', larva: '1e8', drone: '1e6', queen: '1e4', nest: '100', territory: '1e6', swarmling: '1e3'})};
      async function scriptSeconds(page, ms) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable');
        const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(entry => [entry.name, entry.value]));
        const a = await metric();
        await sleep(ms);
        const b = await metric();
        return {script: +(b.ScriptDuration - a.ScriptDuration).toFixed(3), task: +(b.TaskDuration - a.TaskDuration).toFixed(3)};
      }
      const disabled = await openGame(browser, {storage, params: {compact: true, corner: 'bottom-right', autoCloseSeconds: 0}});
      const off = await scriptSeconds(disabled, 10000);
      await disabled.context().close();
      game = await openGame(browser, {storage});
      await connected(game);
      const idle = await scriptSeconds(game, 10000);
      const client = await phone(credential, {list: 'unit', tab: 'meat', quantity: 'max'});
      const watching = await scriptSeconds(game, 10000);
      const states = client.messages.filter(message => message.t === 'state').length;
      const latencies = [];
      for (let i = 0; i < 40; i++) {
        const started = process.hrtime.bigint();
        const result = await client.command(i % 2 ? 'forage' : 'buy', i % 2 ? {} : {kind: 'unit', id: 'drone', quantity: 1});
        latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
        assert.ok(result.ok || /shortly/.test(result.message), result.message);
        await sleep(160);
      }
      latencies.sort((a, b) => a - b);
      const link = (await diagnostics(game)).controller.stats;
      const memoryBefore = (await health()).memory;
      for (let i = 0; i < 300; i++) {
        const cycle = await phone(credential, {list: i % 2 ? 'upgrade' : 'unit', tab: '', quantity: 1});
        await cycle.close();
      }
      await sleep(500);
      const memoryAfter = (await health()).memory;
      const status = await health();
      assert.equal(status.phones.connected, 1);
      assert.equal(status.pending, 0);
      await client.close();
      await sleep(300);
      const stopped = (await diagnostics(game)).controller;
      assert.equal(stopped.timer, false, 'no phones means no controller quote work');
      assert.equal(stopped.watching, 0);
      Object.assign(measurements, {
        pageScriptSecondsPer10s: {controllerDisabled: off, bridgeConnectedNoPhones: idle, onePhoneWatchingMaxQuotes: watching},
        statesPushedIn10s: states,
        gameStateBuildMsAverage: +(link.stateMs / link.states).toFixed(2),
        gameCommandMsAverage: +(link.commandMs / link.commands).toFixed(2),
        phoneRoundTripMs: {median: +latencies[20].toFixed(1), p95: +latencies[37].toFixed(1), max: +latencies[39].toFixed(1)},
        bridgeMemoryBefore300Reconnects: memoryBefore,
        bridgeMemoryAfter300Reconnects: memoryAfter,
        bridgeNode: nodeVersion
      });
      assert.ok(memoryAfter.heapUsed - memoryBefore.heapUsed < 8 * 1024 * 1024, 'bridge heap stays bounded across reconnects');
    });

    await step('the phone Forage button follows Red: it names the target, catches it, refuses a vanished one, and forages otherwise', async () => {
      await game.context().close();
      // One visitor with a long name arrives first, then the golden roach; Red takes the golden roach first.
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText({meat: '1000', larva: '100', drone: '50'})}, init: () => { window.testVisitors = ['golden_tortoise_beetle']; window.RoachMechanicsOptions = {random: () => 0.01, hour: () => 14, minute: 1000, visitors: () => window.testVisitors}; }});
      await connected(game);
      const client = await phone(credential);
      // Two phone sizes watch the same colony; the 390 px one is the one tapped.
      const handsets = [];
      for (const viewport of [{width: 390, height: 844}, {width: 375, height: 812}]) {
        const page = await (await browser.newContext({viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2})).newPage();
        page.on('pageerror', error => pageErrors.push('phone: ' + error.message));
        await page.goto(origin() + '/');
        await page.evaluate(value => { localStorage.setItem('roach_controller_credential_v1', value); localStorage.removeItem('roach_controller_view_v2'); }, credential);
        await page.reload();
        handsets.push(page);
      }
      const handset = handsets[0];
      const capsule = await request('GET', '/art/red_key_capsule.png');
      assert.equal(capsule.status, 200);
      assert.equal(capsule.headers['content-type'], 'image/png');
      const label = () => handset.locator('#forage-label').textContent();
      // The label stays on one line, the button keeps a thumb-sized target, and Buy last stays usable.
      const fits = async page => {
        const box = await page.evaluate(() => {
          const button = document.getElementById('forage');
          const text = document.getElementById('forage-label');
          return {height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width, lineHeight: text.getBoundingClientRect().height, buyWidth: document.getElementById('buy-last').getBoundingClientRect().width, capsule: document.querySelector('#forage .capsule').naturalWidth};
        });
        assert.ok(box.height >= 44 && box.width >= 44 && box.buyWidth >= 88, JSON.stringify(box));
        assert.ok(box.lineHeight < 30, 'the label never wraps: ' + JSON.stringify(box));
        return box;
      };
      const shoot = async (name, labelText) => {
        for (const page of handsets) {
          await page.waitForFunction(value => document.getElementById('forage-label').textContent === value, labelText, {timeout: 4000});
          await fits(page);
          const size = page.viewportSize();
          await page.screenshot({path: path.join(out, 'phone-' + size.width + 'x' + size.height + '-' + name + '.png')});
        }
      };

      await client.next(message => message.t === 'state' && message.data.catchable === 'visitor', 20000, true);
      await handset.waitForSelector('#forage.red', {timeout: 4000});
      assert.equal(await label(), 'Catch golden tortoise beetle');
      assert.equal(await handset.locator('#forage').getAttribute('aria-label'), 'Catch golden tortoise beetle');
      assert.equal((await fits(handset)).capsule, 16, 'the Red capsule art loads from the bridge');
      await shoot('red-visitor', 'Catch golden tortoise beetle');
      // At 375 px the longest visitor name ends in an ellipsis instead of squeezing Buy last.
      assert.ok(await handsets[1].evaluate(() => { const text = document.getElementById('forage-label'); return text.scrollWidth > text.clientWidth; }), 'the long visitor name is truncated at 375 px');

      await client.next(message => message.t === 'event' && message.title === 'Golden roach', 20000, true);
      await handset.waitForFunction(() => document.getElementById('forage-label').textContent === 'Catch golden roach', null, {timeout: 4000});
      await shoot('red-golden', 'Catch golden roach');

      // A tap that names a target which has gone does nothing and says so.
      const meatBefore = (await savedState(game)).unittypes.meat;
      const vanished = await client.command('catch', {kind: 'egg'});
      assert.deepEqual([vanished.ok, vanished.message], [false, 'The egg case is gone.']);
      assert.equal((await diagnostics(game)).habitat.guests.golden, true, 'a stale catch leaves the current target alone');
      const unnamed = await client.command('catch');
      assert.deepEqual([unnamed.ok, unnamed.message], [false, 'Unsupported command.']);

      // A tap catches exactly what the button named, like Red.
      await handset.locator('#forage').tap();
      await handset.waitForFunction(() => /^Golden roach caught\./.test(document.getElementById('toast').textContent));
      const told = await client.next(message => message.t === 'event' && message.title === 'Golden roach caught', 6000, true);
      assert.match(told.text, /crumbs/);
      assert.equal((await diagnostics(game)).compact, true, 'a phone catch never opens the TV menu');
      assert.equal((await diagnostics(game)).habitat.guests.golden, false);
      const late = await client.command('catch', {kind: 'golden'});
      assert.deepEqual([late.ok, late.message], [false, 'The golden roach got away.']);

      // The visitor is Red's next target; once it is logged and no other comes, the button forages again.
      await handset.waitForFunction(() => document.getElementById('forage-label').textContent === 'Catch golden tortoise beetle', null, {timeout: 4000});
      await game.evaluate(() => { window.testVisitors = []; });
      const logged = await client.command('catch', {kind: 'visitor'});
      assert.equal(logged.ok, true, logged.message);
      assert.match(logged.message, /Golden tortoise beetle/);
      await handset.waitForSelector('#forage:not(.red)', {timeout: 4000});
      assert.equal(await label(), 'Forage');
      await shoot('forage', 'Forage');
      await handset.locator('#forage').tap();
      await handset.waitForFunction(() => /^Foraged /.test(document.getElementById('toast').textContent));
      assert.ok(Number((await exported(game)).unittypes.meat) > Number(meatBefore));
      for (const page of handsets) await page.context().close();
      await client.close();
    });

    await step('phone screens at 375x812 and 390x844', async () => {
      await game.context().close();
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText(
        {meat: '1e30', larva: '1e12', territory: '1.04e6', energy: '40', nexus: '3', drone: '1.82e6', queen: '18500', nest: '100', greaterqueen: '0', swarmling: '1000', stinger: '100', spider: '12', premutagen: '1240'},
        {nexus1: '1', nexus2: '1', nexus3: '1', hatchery: '62', expansion: '20', dronetwin: '2'}), phil_roach_colony_ui_auto_v1: JSON.stringify([{type: 'unit', id: 'nest'}, {type: 'upgrade', id: 'hatchery'}]), phil_roach_colony_ui_auto_paused_v1: 'true', phil_roach_colony_ui_last_purchase_v1: JSON.stringify({type: 'unit', id: 'nest'})}});
      await connected(game);
      // The ascend-now preview is computed only for a phone looking at More.
      const watcher = await phone(credential, {list: 'unit', tab: '', quantity: 1});
      const listing = await watcher.fresh();
      assert.equal(listing.data.prestige.unlocked, true);
      assert.equal(listing.data.prestige.preview, null);
      watcher.send({t: 'view', view: {list: 'more', tab: '', quantity: 1}, visible: true});
      const ascent = (await watcher.fresh()).data.prestige.preview;
      assert.equal(ascent.gain, '1.24K');
      assert.match(ascent.energy, /^Energy 0% of [\d.]+[KM]?; spend energy to lower it\.$/);
      // Twenty crevices are still short of their first mutagen level, so only egg chambers are named.
      assert.match(ascent.next, /^Next mutagen: egg chamber \d+ adds [\d.]+[KM]?\.$/);
      await watcher.close();
      for (const [width, height] of [[375, 812], [390, 844]]) {
        // Every phone screen fits the handset's width: the page never scrolls sideways (cost chips scroll on purpose).
        const shot = async name => {
          const wide = await handset.evaluate(() => [document.documentElement, document.body].concat(Array.from(document.querySelectorAll('.sheet'))).filter(e => e.scrollWidth > e.clientWidth).map(e => e.id || e.className || e.tagName));
          assert.deepEqual(wide, [], name + ' scrolls sideways at ' + width);
          await handset.screenshot({path: path.join(out, `phone-${width}x${height}-${name}.png`)});
        };
        const context = await browser.newContext({viewport: {width, height}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
        const handset = await context.newPage();
        handset.on('pageerror', error => pageErrors.push('phone: ' + error.message));
        await handset.goto(origin() + '/');
        await handset.waitForSelector('#pairing:not([hidden])');
        await shot('pairing');
        await handset.evaluate(value => { localStorage.setItem('roach_controller_credential_v1', value); localStorage.removeItem('roach_controller_view_v2'); }, credential);
        await handset.reload();
        await handset.waitForSelector('#units .card .buy');
        await handset.waitForFunction(() => document.querySelectorAll('#units .card img').length > 0 && document.fonts.status === 'loaded');
        const overflow = await handset.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, 'no horizontal scroll at ' + width);
        // Auto switches are drawn 30 px tall, as designed, inside a taller hit area.
        const targets = await handset.evaluate(() => Array.from(document.querySelectorAll('button:not(.auto)')).filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().height)));
        assert.ok(targets.every(h => h >= 36), 'touch targets: ' + targets.join(','));
        assert.equal(await handset.evaluate(() => getComputedStyle(document.body).fontFamily.indexOf('Atkinson') !== -1), true);
        // Pixel chrome: nav glyphs load, cards wear the soil frame, and bars light whole segments.
        await handset.waitForFunction(() => Array.from(document.querySelectorAll('#nav img')).every(image => image.complete && image.naturalWidth === 32));
        assert.ok(await handset.evaluate(() => getComputedStyle(document.querySelector('#units .card')).borderImageSource.indexOf('ui_border_9slice') !== -1));
        assert.ok(await handset.evaluate(() => Array.from(document.querySelectorAll('#units .card .bar:not([hidden])')).every(bar => {
          var lit = bar.querySelectorAll('i.on').length;
          return bar.children.length === 10 && lit === Math.floor(Number(bar.getAttribute('aria-valuenow')) / 10);
        })), 'card bars light one segment per whole tenth');
        assert.equal(await handset.locator('#leader-name').textContent() !== '', true);
        await shot('colony');
        await handset.locator('#resources .resource').first().tap();
        await handset.waitForSelector('#sheet:not([hidden])');
        await handset.waitForTimeout(350); // the sheet slides up first
        await shot('resource-sheet');
        await handset.locator('#sheet-close').tap();
        await handset.locator('#tabs [data-tab="territory"]').tap();
        await handset.waitForSelector('#resources .resource.focus[data-id="territory"]');
        await handset.waitForSelector('[data-id="unit:swarmling"]');
        await shot('colony-territory');
        await handset.locator('#tabs [data-tab="energy"]').tap();
        await handset.waitForSelector('#resources .resource.focus[data-id="energy"]');
        await handset.waitForFunction(() => /Use|Not yet/.test((document.querySelector('[data-id="upgrade:larvarush"] .buy') || {}).textContent));
        await shot('colony-energy');
        await handset.locator('#resources .resource[data-id="energy"]').tap();
        await handset.waitForSelector('#sheet:not([hidden]) .spend');
        await handset.waitForTimeout(350);
        await shot('energy-sheet');
        await handset.locator('#sheet-close').tap();
        await handset.locator('#tabs [data-tab="meat"]').tap();
        await handset.locator('#nav [data-screen="upgrades"]').tap();
        await handset.waitForSelector('#upgrades .card');
        await shot('upgrades');
        await handset.locator('#nav [data-screen="more"]').tap();
        await handset.waitForFunction(() => document.querySelector('#phones li') && document.querySelector('#auto-targets li'));
        assert.match(await handset.locator('#levels').textContent(), /Full.*Compact.*Critters/, 'the game offers its display levels');
        assert.equal(await handset.locator('#levels').isVisible(), true, 'display levels appear once the game offers them');
        await handset.waitForFunction(() => /^Ascend now for \+1\.24K mutagen\. Energy /.test(document.querySelector('#evo-text').textContent));
        assert.match(await handset.locator('#evo-next').textContent(), /^Keeps mutagen, mutations and achievements; the rest resets\. Next mutagen: egg chamber \d+ adds .*Begin it from the Evolution menu on the TV\.$/);
        await shot('more');
        await handset.locator('#evolution').screenshot({path: path.join(out, `phone-${width}x${height}-evolution.png`)});
        await handset.screenshot({path: path.join(out, `phone-${width}x${height}-more-full.png`), fullPage: true});
        await handset.locator('#show-achievements').tap();
        await handset.waitForSelector('#achievement-list .achievement-row');
        await shot('achievements');
        await handset.locator('#achievements-back').tap();
        await handset.locator('#nav [data-screen="colony"]').tap();
        await blue(game);
        await handset.waitForSelector('#paused:not([hidden])');
        await shot('paused');
        await handset.locator('#show').tap();
        await handset.waitForSelector('#colony:not([hidden])');
        await stopBridge();
        await handset.waitForSelector('#reconnecting:not([hidden])');
        await shot('reconnecting');
        await startBridge('http://127.0.0.1:' + (new URL(appBase)).port);
        await connected(game);
        await handset.waitForSelector('#colony:not([hidden])', {timeout: 20000});
        await context.close();
      }
      await game.screenshot({path: path.join(out, 'tv-after-phone.png')});
    });

    await step('a dormant colony shows the TV goal and the first hint on the phone until the first forager', async () => {
      await game.context().close();
      game = await openGame(browser, {storage: {...baseStorage, phil_roach_colony_v2: saveText({}, {}, {awake: false, forages: 0})}});
      await connected(game);
      const goal = 'Press Red to forage. Gather 10 crumbs and 1 hatchling for your first forager roach.';
      const client = await phone(credential, {list: 'unit', tab: '', quantity: 1});
      const listing = await client.fresh();
      assert.deepEqual([listing.data.dormant, listing.data.goal, listing.data.leader], [true, goal, null]);
      // The colony screen carries the TV's key 0 hint: the original tutorial step and the next goal.
      assert.match(listing.data.hint.text, /^Welcome to Roach Colony\. From a few crumbs and hatchlings/);
      assert.equal(listing.data.hint.goal, goal);
      // The colony screen's refresh can still be in flight. Wait for the upgrades view itself.
      const switched = client.next(message => message.t === 'state' && !message.stale && message.data && message.data.list === 'upgrade');
      client.send({t: 'view', view: {list: 'upgrade', tab: '', quantity: 1}, visible: true});
      assert.equal((await switched).data.hint, undefined, 'only the colony screen asks for it');
      client.send({t: 'view', view: {list: 'unit', tab: '', quantity: 1}, visible: true});
      const foraged = await client.command('forage');
      assert.deepEqual([foraged.ok, foraged.message], [true, 'Foraged 1 crumb.']);
      const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
      const handset = await context.newPage();
      handset.on('pageerror', error => pageErrors.push('phone: ' + error.message));
      await handset.goto(origin() + '/');
      await handset.evaluate(value => { localStorage.setItem('roach_controller_credential_v1', value); localStorage.removeItem('roach_controller_view_v2'); }, credential);
      await handset.reload();
      await handset.waitForSelector('#goal:not([hidden])', {timeout: 8000});
      assert.equal(await handset.locator('#goal').textContent(), goal);
      assert.equal(await handset.locator('#leader').isHidden(), true);
      assert.deepEqual([await handset.locator('#hint').isVisible(), await handset.locator('#hint-body').isVisible()], [true, false], 'the hint waits folded');
      await handset.locator('#hint-toggle').click();
      assert.match(await handset.locator('#hint-text').textContent(), /^Welcome to Roach Colony\./);
      assert.equal(await handset.locator('#hint-goal').isHidden(), true, 'the goal card above already says it');
      await handset.screenshot({path: path.join(out, 'phone-390x844-dormant.png')});
      // Nine more forages afford the first forager, which wakes the nest; the goal gives way to the leader card.
      for (let i = 0; i < 9; i++) {
        await new Promise(resolve => setTimeout(resolve, 170));
        assert.equal((await client.command('forage')).ok, true);
      }
      const bought = await client.command('buy', {kind: 'unit', id: 'drone', quantity: 1});
      assert.equal(bought.ok, true, bought.message);
      await handset.waitForSelector('#leader:not([hidden])', {timeout: 8000});
      assert.equal(await handset.locator('#goal').isHidden(), true);
      // Awake, the hint moves to the next step and carries the goal itself.
      await handset.waitForFunction(() => /^You lead a small brood of forager roaches\./.test(document.getElementById('hint-text').textContent), null, {timeout: 8000});
      assert.match(await handset.locator('#hint-goal').textContent(), /^Next goal: /);
      await handset.screenshot({path: path.join(out, 'phone-390x844-hint.png')});
      await context.close();
      await client.close();
    });

    await step('a home-screen launch pairs on its own from a pasted link', async () => {
      const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'});
      await context.addInitScript(() => { Object.defineProperty(navigator, 'standalone', {value: true}); });
      const handset = await context.newPage();
      handset.on('pageerror', error => pageErrors.push('phone: ' + error.message));
      await handset.goto(origin() + '/');
      await handset.waitForSelector('#pair-code:not([hidden])');
      assert.match(await handset.locator('#pair-step').textContent(), /Copy Link/);
      await handset.locator('#pair-code-input').fill('not a link');
      await handset.locator('#pair-code-go').tap();
      await handset.waitForSelector('#pairing-message:not([hidden])');
      const {url} = await pairPhone(game);
      await handset.locator('#pair-code-input').fill(url.href);
      await handset.screenshot({path: path.join(out, 'phone-390x844-standalone-pairing.png')});
      await handset.locator('#pair-code-go').tap();
      await handset.waitForSelector('#units .card .buy', {timeout: 10000});
      const stored = JSON.parse(fs.readFileSync(path.join(runDir, 'data/phones.json'), 'utf8'));
      assert.ok(stored.phones.some(entry => entry.name === 'iPhone (Home Screen)'), stored.phones.map(entry => entry.name).join(','));
      await handset.screenshot({path: path.join(out, 'phone-390x844-standalone-colony.png')});
      await context.close();
      await closeMenu(game);
    });

    assert.deepEqual(pageErrors, []);
  } finally {
    clearInterval(lunaPump);
    await browser.close();
    await stopBridge();
    appServer.close();
    fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(measurements, null, 2) + '\n');
    fs.writeFileSync(path.join(out, 'bridge.log'), bridgeLog);
  }
  console.log(JSON.stringify(measurements, null, 2));
  console.log(passed + ' controller scenarios passed. Screenshots and measurements are in ' + path.relative(root, out) + '/.');
})().catch(error => {
  console.error(error);
  console.error(bridgeLog.split('\n').slice(-20).join('\n'));
  process.exitCode = 1;
  clearInterval(lunaPump);
  if (bridge) bridge.kill('SIGKILL');
  setTimeout(() => process.exit(1), 500);
});
