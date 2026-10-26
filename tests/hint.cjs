// Key 0's hint on the real engine: the first hint on a brand-new colony, the card's toggle, timeout and
// dismissal in compact (keys from the Input Hook) and the menu, More's Hint button, the strip's "?" fitting
// the footer, and nothing in critters only. Never contacts the TV.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';
const shots = path.resolve('work/hint');
fs.mkdirSync(shots, {recursive: true});

const FIRST = 'Welcome to Couch Colony. From a few crumbs and hatchlings, grow a sprawling colony of roaches.';
const GOAL = 'Next goal: Press Red to forage. Gather 10 crumbs and 1 hatchling for your first forager roach.';

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // The goal pick's pulse is a one-shot animation; each start is recorded with the pick it played on.
    await page.addInitScript(() => {
      window.RoachMechanicsOptions = {hour: () => 14};
      window.__beckoned = [];
      document.addEventListener('animationstart', event => { if (/^beckon/.test(event.animationName)) window.__beckoned.push(event.target.getAttribute('data-pick')); }, true);
    });
    await page.clock.install();
    await page.goto(base + '?preview=1');
    await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
    const relaunchKey = code => page.evaluate(code => document.dispatchEvent(new CustomEvent('webOSRelaunch', {detail: {remoteKey: code}})), code);
    const keydown = code => page.evaluate(code => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: code, bubbles: true})), code);
    const card = () => page.evaluate(() => {
      var c = document.getElementById('hint-card'), r = c.getBoundingClientRect();
      return {shown: !c.hidden, text: c.querySelector('p').textContent, goal: c.querySelector('.hint-goal').textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right, size: getComputedStyle(c.querySelector('p')).fontSize};
    });
    const box = selector => page.evaluate(selector => { var r = document.querySelector(selector).getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; }, selector);

    // A brand-new colony opens with its first hint, and the goal's quick pick pulses once.
    await page.clock.runFor(1200);
    let now = await card();
    assert.equal(now.shown, true, 'the first hint appears on its own');
    assert.ok(now.text.indexOf(FIRST) === 0, now.text);
    assert.doesNotMatch(now.text, /swarmsim|http|Swarm Simulator|drone|larva|meat/i);
    assert.equal(now.goal, GOAL);
    assert.equal(now.size, '21px', 'legible from the couch');
    await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => window.__beckoned), ['unit:drone'], 'the goal pick pulses once');
    const colony = await box('#colony');
    now = await card();
    assert.ok(now.bottom <= colony.top - 9 && now.left >= colony.left - 0.5 && now.right <= colony.right + 0.5, 'the card sits above the controls ' + JSON.stringify([now, colony]));
    await page.waitForTimeout(300);
    await page.screenshot({path: path.join(shots, 'compact-hint.png'), clip: {x: 1300, y: 440, width: 620, height: 640}});

    // The "?" and its 0 keycap close the strip inside the 480 px footprint, clear of every pick and the + button.
    const hint = await box('#quick-hint'), plus = await box('#plus');
    const picks = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#quick .quick-pick:not([hidden])'), p => { var r = p.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; }));
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    assert.ok(hint.left >= colony.left && hint.right <= colony.right, 'inside the footprint');
    assert.ok(!overlap(hint, plus) && picks.every(p => !overlap(p, hint) && p.right <= hint.left), 'after the picks, clear of the + button');
    assert.equal(await page.locator('#quick-hint .keycap').textContent(), '0');

    // It stays about ten seconds.
    await page.clock.runFor(8000);
    assert.equal((await card()).shown, true);
    await page.clock.runFor(2500);
    assert.equal((await card()).shown, false, 'gone after ten seconds');

    // Key 0 through the Input Hook toggles it; any other key closes it and still does its job.
    await relaunchKey(48);
    assert.equal((await card()).shown, true);
    await relaunchKey(48);
    assert.equal((await card()).shown, false, '0 again closes it');
    await relaunchKey(48);
    await relaunchKey(403);
    assert.equal((await card()).shown, false, 'Red dismisses it');
    assert.match(await page.locator('#message').textContent(), /^Foraged 1 crumb\.$/, 'and still forages');
    await page.locator('#quick-hint').click();
    assert.equal((await card()).shown, true, 'the strip\'s ? opens it too');
    await keydown(461);
    assert.equal((await card()).shown, false, 'Back dismisses it');

    // The first hint shows once: a reload of the still-dormant colony stays quiet.
    await page.reload();
    await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
    await page.clock.runFor(1500);
    assert.equal(await page.evaluate(() => colonyDiagnostics().snapshot.dormant), true);
    assert.equal((await card()).shown, false, 'never again unless 0 is pressed');
    await page.screenshot({path: path.join(shots, 'strip.png'), clip: {x: 1380, y: 900, width: 540, height: 180}});

    // In the menu, 0 and More's Hint button (which replaced the old Next goal button) show the card above it.
    await keydown(405);
    assert.equal(await page.evaluate(() => colonyDiagnostics().compact), false);
    await page.keyboard.press('0');
    now = await card();
    assert.equal(now.shown, true);
    assert.ok(now.top >= 0 && now.bottom <= (await box('#menu')).top, 'above the menu and on screen');
    await page.waitForTimeout(300);
    await page.screenshot({path: path.join(shots, 'menu-hint.png'), clip: {x: 1200, y: 0, width: 720, height: 1080}});
    await page.keyboard.press('ArrowDown');
    assert.equal((await card()).shown, false, 'navigating dismisses it');
    await page.evaluate(() => { document.querySelector('[data-view="more"]').click(); });
    assert.equal(await page.locator('#goal-details').count(), 0);
    await page.locator('#show-hint').focus();
    await page.keyboard.press('Enter');
    assert.equal((await card()).shown, true, 'OK on Hint shows it');
    await page.keyboard.press('Enter');
    assert.equal((await card()).shown, false, 'and OK again closes it');
    await page.locator('#show-hint').click();
    assert.equal((await card()).shown, true);
    await keydown(461);
    assert.equal((await card()).shown, false, 'Back closes the card before the menu');
    assert.equal(await page.evaluate(() => colonyDiagnostics().compact), false);

    // Critters only shows no text: the card closes and 0 opens nothing.
    await page.locator('#show-hint').click();
    await page.locator('#critters-only').click();
    assert.deepEqual([await page.evaluate(() => colonyDiagnostics().critters), (await card()).shown], [true, false]);
    await relaunchKey(48);
    assert.equal((await card()).shown, false, 'no hint in critters only');
    await keydown(67);
    // Hiding closes it, and it does not come back with the colony.
    await relaunchKey(48);
    assert.equal((await card()).shown, true);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch', {detail: {remoteToggle: true}})));
    assert.equal((await card()).shown, false);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch', {detail: {remoteToggle: true}})));
    await page.clock.runFor(1500);
    assert.equal((await card()).shown, false, 'nothing reappears on reopening');
    assert.deepEqual(errors, []);
    await page.close();
    console.log('Hint checks passed: first hint once on a new colony with the goal pick pulsing, the ? in the footer, ten-second card, 0 toggles in compact and the menu, any key or Back dismisses, More\'s Hint button, and nothing in critters only or hidden.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
