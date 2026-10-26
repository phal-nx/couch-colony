// Reset progress, under More on the TV: Cancel changes nothing, two deliberate confirmations start a brand-new
// colony with a restorable backup, the habitat starts over, and no key, launch parameter or phone reaches it.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';
const shots = path.resolve('work/reset-progress');
fs.mkdirSync(shots, {recursive: true});
const {fixtureState} = require('../scripts/dev/benchmark-engine.cjs');
const Engine = require('../app/engine.js');
const Reset = require('../app/reset.js');
const PROGRESS = ['phil_roach_colony_ui_milestones_v1', 'phil_roach_colony_ui_visitors_v1', 'phil_roach_colony_ui_catches_v1', 'phil_roach_colony_ui_auto_v1', 'phil_roach_colony_ui_auto_paused_v1', 'phil_roach_colony_ui_last_purchase_v1', 'phil_roach_colony_ui_last_ascension_v1', 'phil_roach_colony_ui_flavor_v1'];

async function open(browser) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  // Daytime keeps the night shift's toast out of the way; the habitat instance is kept for guest checks.
  await page.addInitScript(() => {
    window.RoachMechanicsOptions = {hour: () => 14};
    document.addEventListener('DOMContentLoaded', () => {
      if (!window.RoachHabitat) return;
      var update = RoachHabitat.prototype.update;
      RoachHabitat.prototype.update = function (snapshot) { window.__habitat = this; return update.call(this, snapshot); };
    });
  });
  const state = fixtureState(Engine, 'late');
  await page.goto(base + 'engine.js');
  await page.evaluate(([text, token]) => {
    localStorage.clear();
    localStorage.setItem('phil_roach_colony_v2', text);
    localStorage.setItem('phil_roach_colony_reset_token', token);
    localStorage.setItem('phil_roach_colony_ui_milestones_v1', JSON.stringify({'owned:drone': true, 'achievement:first': true}));
    localStorage.setItem('phil_roach_colony_ui_visitors_v1', JSON.stringify({ladybug: 3, silverfish: 1}));
    localStorage.setItem('phil_roach_colony_ui_catches_v1', JSON.stringify({golden: 4, intruders: 2}));
    localStorage.setItem('phil_roach_colony_ui_auto_v1', JSON.stringify([{type: 'unit', id: 'drone'}]));
    localStorage.setItem('phil_roach_colony_ui_auto_paused_v1', 'true');
    localStorage.setItem('phil_roach_colony_ui_last_purchase_v1', JSON.stringify({type: 'unit', id: 'drone'}));
    localStorage.setItem('phil_roach_colony_ui_last_ascension_v1', '20');
    localStorage.setItem('phil_roach_colony_ui_flavor_v1', '5');
    localStorage.setItem('unrelated_app_key', 'keep');
  }, [JSON.stringify({format: 'roach-colony', version: 2, savedAt: state.clock, state}), Reset.token]);
  await page.goto(base);
  await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot && window.__habitat);
  return page;
}
const stored = page => page.evaluate(() => { var out = {}; for (var i = 0; i < localStorage.length; i++) out[localStorage.key(i)] = localStorage.getItem(localStorage.key(i)); return out; });
const focused = page => page.evaluate(() => document.activeElement.getAttribute('data-focus'));
// Drones keep hatching while the colony runs, so a late colony is recognised by its order of magnitude.
const drones = text => JSON.parse(text).state.state.unittypes.drone.replace(/^[\d.]+e\+/, 'e+');

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    // No remote key, relaunch or launch parameter reaches the reset; only the More dialog does.
    const guarded = await open(browser);
    const relaunch = detail => guarded.evaluate(detail => document.dispatchEvent(new CustomEvent('webOSRelaunch', {detail})), detail);
    for (const params of [{resetProgress: true}, {reset: true}, {action: 'reset'}, {resetSaveToken: 'wrong'}]) await relaunch(params);
    for (const code of [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 403, 404, 405, 413, 415, 19, 33, 34, 67, 80]) await relaunch({remoteKey: code});
    await guarded.keyboard.press('c');
    for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'r', 'Delete', 'Backspace']) await guarded.keyboard.press(key);
    const untouched = await stored(guarded);
    assert.equal(untouched.phil_roach_colony_v2_before_reset, undefined, 'no shortcut starts a reset');
    assert.equal(untouched.phil_roach_colony_ui_catches_v1, JSON.stringify({golden: 4, intruders: 2}));
    assert.notEqual(drones(untouched.phil_roach_colony_v2), '0');
    assert.deepEqual(guarded.errors, []);
    await guarded.close();

    const page = await open(browser);
    const before = await stored(page);
    const lateDrones = drones(before.phil_roach_colony_v2);
    await page.keyboard.press('c');
    await page.locator('[data-view="more"]').click();
    assert.equal(await page.locator('#reset-progress').isVisible(), true);

    // Step one names what is lost and opens on Cancel; Cancel changes nothing.
    await page.locator('#reset-progress').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dialog-title').textContent(), 'Reset progress?');
    const warning = await page.locator('#dialog-description').textContent();
    for (const lost of [/unit and upgrade/, /crumbs, hatchlings, territory and energy/, /mutagen, mutations and ascensions/, /achievements/, /visitor log/, /golden roach and intruder counts/, /auto-buy/, /Green repeats/, /quick-buy/, /milestone/, /backup/]) assert.match(warning, lost);
    assert.equal(await focused(page), 'dialog-cancel', 'the dialog opens on Cancel');
    assert.equal(await page.locator('#dialog-confirm').textContent(), 'Continue');
    await page.screenshot({path: path.join(shots, 'reset-step-1.png'), clip: {x: 1300, y: 160, width: 620, height: 920}});
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.equal(await focused(page), 'reset-progress', 'Cancel returns to the button');
    // The colony keeps running, so only the reset-related slots are compared.
    const afterCancel = await stored(page);
    for (const key of PROGRESS.concat(['phil_roach_colony_reset_token', 'phil_roach_colony_v2_before_reset'])) assert.equal(afterCancel[key], before[key], key + ' is untouched by Cancel');
    assert.equal(drones(afterCancel.phil_roach_colony_v2), lateDrones);

    // Step two opens on Cancel again, so pressing OK twice never erases the colony.
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    assert.equal(await focused(page), 'dialog-confirm');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dialog-title').textContent(), 'Erase this colony?');
    assert.equal(await page.locator('#dialog-confirm').textContent(), 'Reset colony');
    assert.equal(await focused(page), 'dialog-cancel', 'the second step opens on Cancel too');
    await page.screenshot({path: path.join(shots, 'reset-step-2.png'), clip: {x: 1300, y: 160, width: 620, height: 920}});
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.equal((await stored(page)).phil_roach_colony_v2_before_reset, undefined);
    // Back also leaves from either step.
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.equal((await stored(page)).phil_roach_colony_v2_before_reset, undefined);

    // A golden roach is out when the reset lands.
    await page.evaluate(() => window.__habitat.showGolden(true));
    assert.equal(await page.evaluate(() => colonyDiagnostics().habitat.guests.golden), true);
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.equal(await page.evaluate(() => colonyDiagnostics().habitat.chance.ceremony), 'in', 'the old colony files into the nest');
    await page.locator('#milestone:not([hidden])').waitFor();
    assert.equal(await page.locator('#milestone strong').textContent(), 'A new colony begins.');
    await page.screenshot({path: path.join(shots, 'reset-toast.png'), clip: {x: 1300, y: 160, width: 620, height: 920}});

    const after = await stored(page);
    for (const key of PROGRESS) if (key !== 'phil_roach_colony_ui_milestones_v1') assert.equal(after[key], undefined, key + ' is cleared');
    // Milestones are cleared, then the fresh colony's own baseline is recorded without toasts.
    assert.ok(!after.phil_roach_colony_ui_milestones_v1 || !/owned:drone|achievement:/.test(after.phil_roach_colony_ui_milestones_v1));
    assert.equal(drones(after.phil_roach_colony_v2), '0', 'the save is a fresh engine');
    assert.equal(drones(after.phil_roach_colony_v2_before_reset), lateDrones, 'the old colony is kept before the reset');
    assert.equal(after.phil_roach_colony_v2_backup, after.phil_roach_colony_v2_before_reset);
    assert.deepEqual(JSON.parse(after.phil_roach_colony_v2_before_reset).visitors, {ladybug: 3, silverfish: 1}, 'the backup keeps the visitor log');
    assert.equal(after.phil_roach_colony_reset_token, Reset.token, 'the one-time reset receipt is untouched');
    assert.equal(after.unrelated_app_key, 'keep');
    const fresh = await page.evaluate(() => { var d = colonyDiagnostics(); return {ascensions: d.snapshot.ascensions, population: d.snapshot.population, earned: d.snapshot.earnedAchievementCount, auto: d.autoBindings, paused: d.autoPaused, last: d.lastPurchase, menu: d.menu, quick: d.quickPicks.filter(Boolean).length, golden: d.habitat.guests.golden, visitor: d.habitat.guests.visitor, mechanics: d.mechanics}; });
    assert.deepEqual([fresh.ascensions, fresh.population, fresh.earned, fresh.auto, fresh.paused, fresh.last, fresh.menu, fresh.golden, fresh.visitor], ['0', '0', 0, [], false, null, 'units', false, '']);
    assert.equal(fresh.quick, 0);
    assert.equal(await page.locator('#resources [data-resource="meat"] strong').textContent(), '0', 'the new colony opens dormant with no crumbs');
    assert.equal(await page.locator('#census .census-entry').count(), 0, 'the census starts empty');
    await page.locator('[data-view="more"]').click();
    assert.equal(await page.locator('#show-visitors').isVisible(), true);
    await page.locator('#show-visitors').click();
    assert.equal(await page.locator('#visitors .visitor:not(.unfound)').count(), 0, 'the visitor log starts empty');
    await page.locator('#show-journal').click();
    assert.equal(await page.locator('#show-achievements').isVisible(), false, 'no achievements are earned yet');

    // The old castes file out and leave a quiet, dormant nest; foraging and the first drone wake it.
    await page.waitForFunction(() => colonyDiagnostics().habitat.chance.ceremony === '', null, {timeout: 8000});
    assert.deepEqual(await page.evaluate(() => { var h = colonyDiagnostics().habitat; return [h.roles, h.nestLife.dormant, h.nestLife.stage]; }), [[], true, 0], 'no walkers until the first forager');
    await page.locator('[data-view="units"]').click();
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 403, bubbles: true})));
      await page.waitForTimeout(170);
    }
    await page.locator('#items [data-item="drone"] .buy').click();
    await page.waitForFunction(() => colonyDiagnostics().habitat.roles.indexOf('drone') !== -1);
    const habitat = await page.evaluate(() => colonyDiagnostics().habitat);
    assert.deepEqual(habitat.roles.slice().sort(), ['drone', 'hatchling']);
    assert.equal(JSON.parse(habitat.base.key.slice(0, habitat.base.key.lastIndexOf('}') + 1)).stage, 0, 'the nest is baked at its first stage');
    await page.waitForTimeout(500);
    await page.screenshot({path: path.join(shots, 'fresh-colony.png')});

    // A reload stays fresh, and Import brings the old colony back from the before-reset copy.
    await page.reload();
    await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
    assert.equal(await page.evaluate(() => colonyDiagnostics().snapshot.ascensions), '0');
    await page.keyboard.press('c');
    await page.locator('[data-view="more"]').click();
    await page.locator('#import').click();
    await page.locator('#save-text').fill(after.phil_roach_colony_v2_before_reset);
    await page.locator('#dialog-confirm').click();
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.equal(drones((await stored(page)).phil_roach_colony_v2), lateDrones, 'the old colony is restored through Import');
    assert.deepEqual(page.errors, []);
    await page.close();
    console.log('Reset progress checks passed: Cancel changes nothing, two confirmations each opening on Cancel, fresh engine and cleared colony keys, kept backup and reset receipt, fresh habitat, restore through Import, and no key or launch parameter reaches it.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
