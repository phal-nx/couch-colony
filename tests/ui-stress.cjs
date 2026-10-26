// Randomised overlap stress for the TV overlay: toasts, the tier reveal, magnitude stamps, the achievement seal,
// purchase pops, the quick-buy strip (badges, fill bars, floats, pulses and its note), the Red chip and the night-shift icon, with burn-in dimming, critters only and
// hiding thrown in at awkward times. Seeded and on a fake clock, so each run is the same. Never contacts the TV.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';
const shots = path.resolve('work/ui-stress');
fs.mkdirSync(shots, {recursive: true});
const args = process.argv.slice(2);
const option = (name, fallback) => { const k = args.indexOf('--' + name); return k >= 0 ? Number(args[k + 1]) : fallback; };
const seeds = option('seeds', 2);
const minutes = option('minutes', 2);

// A scripted colony whose counts grow, with long unit names, achievements and quick picks.
const engine = `
(function () {
 var names = {drone: 'Drone', queen: 'Queen', nest: 'Nest', greaterqueen: 'Greater queen', hive: 'Hive', hivequeen: 'Hive queen', empress: 'Empress', prophet: 'Neuroprophet', swarmling: 'Swarmling', stinger: 'Stinger'};
 var tiers = {drone: 1, queen: 2, nest: 3, greaterqueen: 4, hive: 5, hivequeen: 6, empress: 7, prophet: 8, swarmling: 1, stinger: 2};
 window.__colony = {meat: 900, larva: 40, earned: [], units: {drone: 5, swarmling: 2}};
 function show(n) { if (n < 1000) return String(Math.floor(n)); var e = Math.floor(Math.log(n) / Math.LN10); if (e < 15) { var s = ['K', 'M', 'B', 'T'][Math.floor(e / 3) - 1]; return (n / Math.pow(10, Math.floor(e / 3) * 3)).toFixed(2).slice(0, 4).replace(/\\.$/, '') + s; } return (n / Math.pow(10, e)).toFixed(2) + 'e+' + e; }
 function units() { var c = window.__colony; return Object.keys(c.units).map(function (id) { return {id: id, name: names[id], owned: true, tier: tiers[id], count: show(c.units[id]), countExact: String(Math.floor(c.units[id]))}; }); }
 window.SwarmEngine = {Game: function () {
  this.snapshot = function (now, options) {
   options = options || {};
   var c = window.__colony;
   var list = units();
   // Affordability flips as crumbs grow, so ready pulses, badges, bars and ETAs all come and go.
   var picks = list.slice(0, 4).map(function (u, k) { var affordable = (k + Math.floor(c.meat / 5000)) % 2 === 0; return [{kind: k === 2 ? 'upgrade' : 'unit', id: u.id, name: u.name, affordable: affordable, progress: affordable ? 1 : 0.3 + k * 0.2, gain: !affordable ? '0' : k === 2 ? '1' : show(c.units[u.id] * 7 + 1)}]; });
   return {
    resources: [{id: 'meat', name: 'Meat', amount: show(c.meat), rate: '1'}, {id: 'larva', name: 'Larvae', amount: show(c.larva), rate: '1'}],
    visibleUnitIds: list.map(function (u) { return u.id; }), visibleUnits: list,
    earnedAchievementIds: c.earned.slice(), earnedAchievementCount: c.earned.length, earnedAchievements: c.earned.map(function (id) { return {id: id, name: 'Feat ' + id}; }),
    achievements: [], population: show(c.meat / 3), ascensions: '0', tabs: [{id: 'meat', label: 'Meat'}],
    items: list.map(function (u) { return {id: u.id, kind: 'unit', tab: 'meat', name: u.name, description: 'Works for the colony.', owned: u.count, cost: '1 meat', costs: [{id: 'meat', name: 'Meat', amount: '1'}], batchCosts: [{id: 'meat', name: 'Meat', amount: '1'}], batchQuantity: '1', batchQuantityLabel: '1', batchAvailable: true, available: true, visible: true}; }),
    nextGoal: 'Grow the colony.', hint: options.includeHint ? {step: 2, text: 'You lead a small brood of worker drones.'} : undefined, nextGoalTarget: {kind: 'unit', id: 'drone'}, prestige: {unlocked: false}, quickSlots: options.includeQuick ? picks : undefined
   };
  };
  this.act = function (action) {
   var c = window.__colony;
   if (action.type === 'reward') return {ok: true, reward: {resource: action.resource, amount: '100', amountExact: '100'}};
   if (action.type === 'unit' && c.units[action.id] !== undefined) { c.units[action.id] = c.units[action.id] * 1.6 + 1; return {ok: true, purchase: {id: action.id, kind: 'unit', name: names[action.id], quantity: '1', quantityLabel: '1', spent: []}}; }
   c.meat += 1;
   return {ok: true, message: 'Foraged 1 crumb.'};
  };
  this.autoBuy = function () { return {ok: false}; };
  this.quickEta = function () { return {ready: false, label: Math.floor(Date.now() / 3000) % 2 ? '23h 59m' : ''}; };
  this.exportState = function () { return {}; };
  this.importState = function () {};
 }};
}());`;
const save = `window.RoachSave={Store:function(){this.error='';this.load=function(){return {message:'Fixture save'};};this.save=function(){return true;};this.export=function(){return '{}';};this.import=function(){return {ok:false,message:'No'};};}};`;

// Installed before the page loads: a log of moments (class changes) and animation starts, and the checks.
function monitor(seed) {
  let state = seed >>> 0;
  window.__random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__hour = 14;
  window.RoachMechanicsOptions = {random: () => window.__random(), hour: () => window.__hour, minute: 1000};
  const MOMENT = /\b(stamp|reveal|seal|bump|roll|arrive|hop|nudge|rise|keylit|ready|beckon|note)-[ab]\b/;
  window.__added = new Map();
  window.__played = {};
  window.__violations = [];
  const seen = {};
  window.__violate = (kind, detail) => { if (seen[kind]) { seen[kind]++; return; } seen[kind] = 1; window.__violations.push({kind, at: Date.now(), detail}); };
  window.__counts = seen;
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(list => list.forEach(m => {
      const name = (typeof m.target.className === 'string' ? m.target.className : '').match(MOMENT);
      if (!name || (m.oldValue || '').indexOf(name[0]) >= 0) return;
      window.__added.set(m.target, Date.now());
      window.__played[name[1]] = (window.__played[name[1]] || 0) + 1;
      const d = window.colonyDiagnostics && colonyDiagnostics();
      if (d && (d.closed || d.critters || document.hidden)) window.__violate('moment started while hidden or critters only', name[0]);
    })).observe(document.body, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class']});
  });
  // A moment's animation starts with its class; one that starts again later is a replay.
  document.addEventListener('animationstart', event => {
    const name = /^(stamp|reveal|seal|bump|roll|arrive|hop|nudge|rise|keylit|ready|beckon|note)/.exec(event.animationName);
    if (!name) return;
    // A moment's class may sit on the parent of what animates (a quick pick hops its icon).
    const owner = window.__added.has(event.target) ? event.target : event.target.parentElement;
    if (!window.__added.has(owner) || window.__realAge(owner) > 700) window.__violate('moment replayed after it was hidden', event.animationName);
  }, true);
  const realAdded = new Map();
  window.__realAge = target => { const t = realAdded.get(target); return t === undefined ? Infinity : performance.now() - t; };
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(list => list.forEach(m => {
    const name = (typeof m.target.className === 'string' ? m.target.className : '').match(MOMENT);
    if (name && (m.oldValue || '').indexOf(name[0]) < 0) realAdded.set(m.target, performance.now());
  })).observe(document.body, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class']}));

  // A toast's start is when it is unhidden, not when a later check first sees it.
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => { if (!document.getElementById('milestone').hidden) window.__toastAt = Date.now(); }).observe(document.getElementById('milestone'), {attributes: true, attributeFilter: ['hidden']}));
  let lastToast = '', lastStart = -1e9, lastWasCatch = false;
  const box = e => { const r = e.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; };
  const shown = e => !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  window.__check = () => {
    const d = colonyDiagnostics();
    const toast = document.getElementById('milestone');
    const visible = shown(toast);
    if (d.milestone.queued > 4) window.__violate('more than four toasts queued', d.milestone.queued);
    if (visible && (d.closed || d.critters || document.hidden)) window.__violate('toast shown while hidden or critters only');
    const hint = document.getElementById('hint-card');
    if (shown(hint) && (d.closed || d.critters || document.hidden)) window.__violate('hint shown while hidden or critters only');
    if (shown(hint) && visible) window.__violate('hint card and toast at once');
    const text = visible ? toast.textContent : '';
    if (visible && text !== lastToast) {
      const now = window.__toastAt || Date.now();
      const isCatch = /caught|hatched|New visitor/i.test(text);
      // Spacing applies to everything but a catch, which goes first because the player pressed Red.
      if (!isCatch && now - lastStart < 12000 - 1) window.__violate('toasts closer than twelve seconds', {gap: now - lastStart, text, previous: lastToast});
      if (d.dimmed) window.__violate('toast shown on a dimmed overlay', text);
      lastStart = now; lastWasCatch = isCatch;
    }
    lastToast = text;
    if (!d.compact || d.critters || d.closed) return;
    // The compact footprint: nothing overlaps, and nothing pokes out of its 480 px except the + button.
    const colony = box(document.getElementById('colony'));
    const parts = [];
    // A sliding census slot or hopping pick is mid-moment; its resting place is checked once it lands.
    const moving = e => e.getAnimations().some(a => a.playState === 'running') || (e.parentElement && e.parentElement.getAnimations().some(a => a.playState === 'running'));
    const add = (name, e) => { if (shown(e) && !moving(e)) parts.push([name, box(e)]); };
    add('night', document.getElementById('night-shift'));
    add('chip', document.getElementById('red-cue'));
    add('stage', document.getElementById('stage'));
    // Each pick is one part; inside it the badge and fill bar stay within the pick and clear of the keycap.
    document.querySelectorAll('.quick-pick:not([hidden])').forEach((p, k) => {
      add('quick' + k, p);
      if (!shown(p) || moving(p)) return;
      const pick = box(p), keycap = box(p.querySelector('.keycap'));
      const icon = p.querySelector('.quick-icon');
      if (!moving(icon) && overlap(keycap, box(icon))) window.__violate('quick keycap over its icon', {keycap, icon: box(icon)});
      p.querySelectorAll('.quick-badge, .quick-bar').forEach(e => {
        if (!shown(e)) return;
        const r = box(e), part = e.classList.contains('quick-badge') ? 'badge' : 'bar';
        if (r.left < pick.left - 0.5 || r.right > pick.right + 0.5 || r.top < pick.top - 0.5 || r.bottom > pick.bottom + 0.5) window.__violate('quick ' + part + ' outside its pick', {r, pick});
        if (overlap(r, keycap)) window.__violate('quick ' + part + ' over its keycap', {r, keycap});
        if (part === 'badge' && (e.scrollWidth > e.clientWidth + 0.5 || r.bottom - r.top > 18)) window.__violate('quick badge wraps or clips', e.textContent);
      });
    });
    add('hint', document.getElementById('quick-hint'));
    add('note', document.getElementById('quick-note'));
    document.querySelectorAll('.census-entry').forEach((e, k) => add('census' + k, e));
    add('eta', document.getElementById('next-eta'));
    for (let a = 0; a < parts.length; a++) {
      const [name, r] = parts[a];
      if (r.left < colony.left - 0.5 || r.right > colony.right + 0.5) window.__violate('outside the 480 px footprint: ' + name.replace(/\d+$/, ''), {r, colony});
      for (let b = a + 1; b < parts.length; b++) if (overlap(r, parts[b][1])) window.__violate('footer overlap: ' + name.replace(/\d+$/, '') + ' / ' + parts[b][0].replace(/\d+$/, ''), {a: r, b: parts[b][1]});
    }
    const noteText = document.querySelector('#quick-note:not([hidden]) span:last-child');
    if (noteText && noteText.scrollWidth > noteText.clientWidth + 0.5) window.__violate('quick note clipped', noteText.textContent);
    const span = document.querySelector('#red-cue:not([hidden]) span');
    if (span && span.scrollWidth > span.clientWidth + 0.5) window.__violate('Red chip text clipped', span.textContent);
    document.querySelectorAll('.census-text .label').forEach(l => { if (l.scrollWidth > l.clientWidth + 0.5) window.__violate('census label clipped', l.textContent); });
  };
}

async function open(browser, seed) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  await page.addInitScript(monitor, seed);
  await page.route('**/engine.js', route => route.fulfill({contentType: 'application/javascript', body: engine}));
  await page.route('**/save.js', route => route.fulfill({contentType: 'application/javascript', body: save}));
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.clock.install();
  await page.goto(base + '?preview=1');
  await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
  return page;
}
const key = (page, code) => page.evaluate(code => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: code, bubbles: true})), code);
const toggle = page => page.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch', {detail: {remoteToggle: true}})));

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const failures = [];
  const played = {};
  try {
    // A purchase pop caught by critters only, the menu closing or Blue does not replay when the text returns.
    for (const [label, away, back] of [['critters', p => p.evaluate(() => document.getElementById('critters-only').click()), p => key(p, 67)], ['hide', p => key(p, 406), p => toggle(p)]]) {
      const page = await open(browser, 7);
      await page.clock.runFor(2000);
      await page.evaluate(() => { window.__colony.units.drone = 990; });
      await page.clock.runFor(1500);
      await key(page, 49);
      await away(page);
      await page.waitForTimeout(900);
      await back(page);
      await page.clock.runFor(1500);
      await page.waitForTimeout(900);
      const v = await page.evaluate(() => window.__violations);
      if (v.length || page.errors.length) failures.push({scenario: label, violations: v, errors: page.errors});
      console.log(label + ': ' + JSON.stringify(v));
      await page.close();
    }
    for (let seed = 1; seed <= seeds; seed++) {
      const page = await open(browser, seed);
      const random = () => page.evaluate(() => window.__random());
      const steps = minutes * 60 * 4;
      for (let step = 0; step < steps; step++) {
        await page.clock.runFor(250);
        await page.evaluate(() => window.__check());
        // Most of the time time just passes; now and then something awkward happens.
        if (step % 4) continue;
        const r = await random();
        if (r < 0.14) await key(page, 403);
        else if (r < 0.24) await key(page, 49 + Math.floor((r - 0.14) * 40));
        else if (r < 0.3) await key(page, 404);
        else if (r < 0.36) await page.evaluate(r => { const c = window.__colony; const ids = Object.keys(c.units); c.units[ids[Math.floor(r * 97) % ids.length]] *= 12; c.meat *= 15; }, r);
        else if (r < 0.4) await page.evaluate(() => { const c = window.__colony; const next = ['queen', 'nest', 'greaterqueen', 'hive', 'hivequeen', 'empress', 'prophet', 'stinger'].filter(id => c.units[id] === undefined)[0]; if (next) c.units[next] = 1; });
        else if (r < 0.44) await page.evaluate(() => { window.__colony.earned.push('feat' + window.__colony.earned.length); });
        else if (r < 0.455) await key(page, 48);
        else if (r < 0.47) await page.evaluate(() => document.getElementById('critters-only').click());
        else if (r < 0.5) await key(page, 67);
        else if (r < 0.53) { await key(page, 406); await page.clock.runFor(1500); await toggle(page); }
        else if (r < 0.56) await page.evaluate(() => { window.__hour = window.__hour === 14 ? 23 : 14; });
        else if (r < 0.58) await key(page, 57);
        else if (r < 0.62) await page.clock.runFor(61000);
      }
      const result = await page.evaluate(() => ({violations: window.__violations, counts: window.__counts, toasts: colonyDiagnostics().milestone, played: window.__played}));
      Object.keys(result.played).forEach(name => { played[name] = (played[name] || 0) + result.played[name]; });
      console.log('seed ' + seed + ': ' + JSON.stringify(result.counts));
      for (const v of result.violations) console.log('  ' + v.kind + ' ' + JSON.stringify(v.detail || ''));
      if (seed === 1) await page.screenshot({path: path.join(shots, 'end.png'), clip: {x: 1300, y: 760, width: 620, height: 320}});
      if (result.violations.length || page.errors.length) failures.push({seed, violations: result.violations, errors: page.errors});
      await page.close();
    }
    // The seeds together must actually have thrown the strip's moments into the mix.
    ['rise', 'keylit', 'ready', 'note'].forEach(name => { if (!played[name]) failures.push({never: name}); });
  } finally { await browser.close(); }
  assert.deepEqual(failures, [], 'The overlay keeps every invariant under overlapping moments');
  console.log('UI stress passed: toasts spaced and capped, catches first, nothing over the footprint, no moment while hidden or replayed after.');
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
