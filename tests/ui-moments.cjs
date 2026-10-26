// UI moments on the TV overlay: tier reveal, order-of-magnitude stamps, achievement seal, purchase pop
// and the pinned toast card. A small scripted engine lets each check set exact counts.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';
const shots = path.resolve('work/ui-moments');
fs.mkdirSync(shots, {recursive: true});
const engine = `
(function () {
 window.__colony = {meat: '900', larva: '40', earned: [], units: [{id: 'drone', name: 'Drone', tier: 1, count: '5'}]};
 function unit(u) { return {id: u.id, name: u.name, owned: true, tier: u.tier, count: u.count, countExact: u.count}; }
 window.SwarmEngine = {Game: function () {
  this.snapshot = function () {
   var c = window.__colony;
   return {
    resources: [{id: 'meat', name: 'Meat', amount: c.meat, rate: '1'}, {id: 'larva', name: 'Larvae', amount: c.larva, rate: '1'}],
    visibleUnitIds: c.units.map(function (u) { return u.id; }), visibleUnits: c.units.map(unit),
    earnedAchievementIds: c.earned.slice(), earnedAchievementCount: c.earned.length, earnedAchievements: c.earned.map(function (id) { return {id: id, name: 'A growing colony'}; }),
    achievements: [], population: '10', ascensions: '0', tabs: [{id: 'meat', label: 'Meat'}],
    items: c.units.map(function (u) { return {id: u.id, kind: 'unit', tab: 'meat', name: u.name, description: 'Gathers crumbs for the colony.', owned: u.count, cost: '1 meat', costs: [{id: 'meat', name: 'Meat', amount: '1'}], batchCosts: [{id: 'meat', name: 'Meat', amount: '1'}], batchQuantity: '1', batchQuantityLabel: '1', batchAvailable: true, available: true, visible: true}; }),
    nextGoal: 'Grow the colony.', prestige: {unlocked: false}
   };
  };
  this.act = function (action) {
   var u = window.__colony.units.filter(function (entry) { return entry.id === action.id; })[0];
   if (u && action.type === 'unit') { u.count = String(Number(u.count) + 1); return {ok: true, purchase: {id: u.id, kind: 'unit', name: u.name, quantity: '1', quantityLabel: '1', spent: []}}; }
   return {ok: true, message: 'Foraged 1 crumb.'};
  };
  this.autoBuy = function () { return {ok: false}; };
  this.exportState = function () { return {}; };
  this.importState = function () {};
 }};
}());`;
const save = `window.RoachSave={Store:function(){this.error='';this.load=function(){return {message:'Fixture save'};};this.save=function(){return true;};this.export=function(){return '{}';};this.import=function(){return {ok:false,message:'No'};};}};`;

async function open(browser) {
 const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
 await page.addInitScript(() => {
  window.RoachMechanicsOptions = {hour: () => 14, random: () => 0.999};
  // Every class change that starts a moment is logged, so a check can prove one never fired.
  window.__moments = [];
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(list => new Set(list.map(m => m.target)).forEach(target => {
   const name = (typeof target.className === 'string' ? target.className : '').match(/\b(stamp|reveal|seal|bump|roll)-[ab]\b/);
   if (name) window.__moments.push(name[1] + ':' + (target.getAttribute('data-stamp') || target.textContent));
  })).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['class']}));
 });
 await page.route('**/engine.js', route => route.fulfill({contentType: 'application/javascript', body: engine}));
 await page.route('**/save.js', route => route.fulfill({contentType: 'application/javascript', body: save}));
 page.errors = [];
 page.on('pageerror', e => page.errors.push(e.message));
 await page.goto(base + '?preview=1');
 await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
 return page;
}
const set = (page, change) => page.evaluate(change => Object.assign(window.__colony, change), change);
const moments = page => page.evaluate(() => window.__moments.splice(0));
// One colony refresh runs about once a second; two seconds always covers one.
const settle = page => page.waitForTimeout(2000);
// Pins every running CSS animation (pseudo-elements included) at one time for a still frame.
const freeze = (page, pattern, ms) => page.evaluate(([pattern, ms]) => document.getAnimations().filter(a => new RegExp(pattern).test(a.animationName)).forEach(a => { a.pause(); a.currentTime = ms; }), [pattern, ms]);
const clip = (page, selector, pad) => page.locator(selector).evaluate((e, pad) => { const r = e.getBoundingClientRect(); return {x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2}; }, pad);

(async () => {
 const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  // Stamps fire only when a figure rises into a new suffix or exponent decade.
  const page = await open(browser);
  await moments(page);
  await set(page, {meat: '950'}); await settle(page);
  assert.deepEqual(await moments(page), [], 'ordinary growth stays quiet');
  await set(page, {meat: '1,020'});
  await page.waitForFunction(() => /\bstamp-[ab]\b/.test(document.querySelector('[data-resource="meat"] strong').className), {}, {timeout: 2500});
  assert.equal(await page.locator('[data-resource="meat"] strong').getAttribute('data-stamp'), '1.02K');
  await freeze(page, '^stamp', 60);
  await page.screenshot({path: path.join(shots, 'stamp-resource.png'), clip: await clip(page, '#resources', 50)});
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
  await settle(page); await moments(page);
  await set(page, {meat: '1,900'}); await settle(page);
  await set(page, {meat: '980'}); await settle(page);
  await set(page, {meat: '1,100'}); await settle(page);
  assert.deepEqual(await moments(page), [], 'growth inside a suffix and regaining a lost one stay quiet');
  await set(page, {meat: '2.35e+15'}); await settle(page);
  await set(page, {meat: '9.1e+19'}); await settle(page);
  await set(page, {meat: '1.2e+20'}); await settle(page);
  assert.deepEqual((await moments(page)).filter(m => m.startsWith('stamp')), ['stamp:2.35e15', 'stamp:1.2e20'], 'a new exponent decade stamps, a new exponent inside it does not');
  await set(page, {units: [{id: 'drone', name: 'Drone', tier: 1, count: '999'}]}); await settle(page); await moments(page);
  await set(page, {units: [{id: 'drone', name: 'Drone', tier: 1, count: '1000'}]});
  await page.waitForFunction(() => /\bstamp-[ab]\b/.test(document.querySelector('#census strong').className), {}, {timeout: 2500});
  await freeze(page, '^stamp', 60);
  await page.screenshot({path: path.join(shots, 'stamp-census.png'), clip: await clip(page, '#census', 50)});
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));

  // A first hatch reveals the new unit's icon in whole-pixel steps beside a sliding census slot.
  await settle(page); await moments(page);
  await set(page, {units: [{id: 'drone', name: 'Drone', tier: 1, count: '1000'}, {id: 'queen', name: 'Queen', tier: 2, count: '1'}]});
  await page.waitForFunction(() => !document.getElementById('unit-intro').hidden, {}, {timeout: 2500});
  assert.ok((await moments(page)).includes('reveal:'), 'the reveal plays for a first hatch');
  assert.equal(await page.locator('#unit-intro .intro-icon canvas').evaluate(c => [c.width, c.offsetWidth, getComputedStyle(c).imageRendering].join()), '32,96,pixelated');
  assert.match(await page.locator('#census [data-unit="queen"]').getAttribute('class'), /\barrive-[ab]\b/, 'its census slot slides in');
  const scales = [];
  for (const [frame, ms] of [[0, 40], [1, 160], [2, 280], [3, 420], [4, 599]]) {
   await freeze(page, '^reveal', ms);
   scales.push(await page.locator('#unit-intro .intro-icon').evaluate(e => getComputedStyle(e).transform));
   await page.screenshot({path: path.join(shots, 'reveal-' + frame + '.png'), clip: await clip(page, '#unit-intro', 24)});
  }
  assert.deepEqual(scales.map(t => t === 'none' ? 1 : Math.round(Number(t.slice(7).split(',')[0]) * 3) / 3), [1 / 3, 2 / 3, 1, 1, 1], 'the icon steps 1x, 2x, 3x');
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
  await page.screenshot({path: path.join(shots, 'reveal-toast.png'), clip: {x: 1100, y: 600, width: 820, height: 480}});

  // The milestone card that follows is pinned and carries no seal; an achievement stamps its medal.
  await page.locator('#intro-close').click();
  await page.waitForFunction(() => !document.getElementById('milestone').hidden, {}, {timeout: 3000});
  assert.equal(await page.locator('#milestone .toast-seal').isVisible(), false);
  assert.match(await page.locator('#milestone').evaluate(e => getComputedStyle(e, '::before').backgroundImage), /popup_pin\.png/);
  await page.screenshot({path: path.join(shots, 'pinned-card.png'), clip: await clip(page, '#milestone', 30)});
  const sealed = await open(browser);
  await set(sealed, {earned: ['first']});
  await sealed.waitForFunction(() => !document.getElementById('milestone').hidden, {}, {timeout: 2500});
  assert.equal(await sealed.locator('#milestone strong').textContent(), 'Achievement earned');
  assert.equal(await sealed.locator('#milestone .toast-seal').isVisible(), true);
  assert.ok((await moments(sealed)).includes('seal:'), 'the achievement seal stamps');
  for (const [frame, ms] of [[0, 100], [1, 180], [2, 319]]) {
   await freeze(sealed, '^seal|^toast-in', ms);
   await sealed.screenshot({path: path.join(shots, 'seal-' + frame + '.png'), clip: await clip(sealed, '#milestone', 60)});
  }
  assert.deepEqual(sealed.errors, []); await sealed.close();

  // A purchase pops the row icon and rolls its count; the census follows only when its figure changes.
  await page.keyboard.press('c');
  await page.locator('[data-item="queen"] .buy').click();
  const bought = await moments(page);
  for (const m of ['bump:', 'roll:× 2', 'roll:2']) assert.ok(bought.includes(m), m + ' in ' + bought.join());
  await freeze(page, '^(bump|roll|wash)', 20);
  await page.screenshot({path: path.join(shots, 'purchase-pop.png'), clip: {x: 1300, y: 420, width: 620, height: 660}});
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
  await page.locator('[data-item="drone"] .buy').click();
  const quiet = await moments(page);
  assert.ok(quiet.includes('bump:'), 'the bought row still pops');
  assert.deepEqual(quiet.filter(m => m.startsWith('roll')), [], 'a count that still reads 1K does not roll');
  await page.locator('#close').click();
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 404, bubbles: true})));
  assert.deepEqual(await moments(page), [], 'Green in compact: the census still reads 1K, so nothing moves');
  await page.locator('#plus').click();
  await page.locator('[data-item="queen"] .buy').click();
  await page.locator('#close').click();
  await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
  await moments(page);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 404, bubbles: true})));
  assert.deepEqual((await moments(page)).sort(), ['bump:', 'roll:4'], 'Green in compact pops and rolls the census when its figure changes');
  await settle(page); await moments(page);

  // Critters only and a hidden page start no moment, and coming back is not stamped.
  await page.evaluate(() => document.getElementById('critters-only').click());
  assert.equal(await page.evaluate(() => colonyDiagnostics().critters), true);
  await set(page, {meat: '5.5e+40', units: [{id: 'drone', name: 'Drone', tier: 1, count: '2000000'}, {id: 'queen', name: 'Queen', tier: 2, count: '9'}, {id: 'nest', name: 'Nest', tier: 3, count: '1'}]});
  await settle(page);
  assert.deepEqual(await moments(page), []);
  assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.animationName).length), 0);
  await page.keyboard.press('c');
  await settle(page);
  assert.deepEqual((await moments(page)).filter(m => /^(stamp|reveal)/.test(m)), [], 'returning from critters is not stamped');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange')); });
  await set(page, {meat: '7e+60', units: [{id: 'drone', name: 'Drone', tier: 1, count: '3000000000'}, {id: 'queen', name: 'Queen', tier: 2, count: '9'}, {id: 'nest', name: 'Nest', tier: 3, count: '1'}]});
  await settle(page);
  assert.deepEqual(await moments(page), [], 'nothing moves while hidden');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false}); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(page);
  assert.deepEqual((await moments(page)).filter(m => m.startsWith('stamp')), [], 'returning from hidden is not stamped');
  assert.deepEqual(page.errors, []);
  console.log('UI moment checks passed: stamps only on a new suffix or exponent decade, tier reveal steps, achievement seal, purchase pop and roll, pinned card, nothing while hidden or in critters mode.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
