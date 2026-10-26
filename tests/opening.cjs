// The dormant opening on the real engine: a new colony starts with nothing, Red forages crumbs and
// hatchlings, the quick strip points at the first forager, and buying it wakes the nest with a quiet toast.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';
const shots = path.resolve('work/opening');
fs.mkdirSync(shots, {recursive: true});

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Daytime keeps the night shift out of the way; habitat cues are recorded and still played.
    await page.addInitScript(() => {
      window.RoachMechanicsOptions = {hour: () => 14};
      window.__cues = [];
      document.addEventListener('DOMContentLoaded', () => {
        var cue = RoachHabitat.prototype.cue;
        RoachHabitat.prototype.cue = function (name) { window.__cues.push(name); return cue.call(this, name); };
      });
    });
    await page.goto(base + '?preview=1');
    await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot && colonyDiagnostics().habitat);
    const red = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 403, bubbles: true})));
    const key = code => page.evaluate(code => document.dispatchEvent(new CustomEvent('webOSRelaunch', {detail: {remoteKey: code}})), code);
    const forage = async times => { for (let i = 0; i < times; i++) { await red(); await page.waitForTimeout(170); } };
    const state = () => page.evaluate(() => {
      var d = colonyDiagnostics(), pick = document.querySelector('#quick .quick-pick:not([hidden])');
      return {
        dormant: d.snapshot.dormant, compact: d.compact,
        stock: d.snapshot.resources.map(function (r) { return r.id + ':' + r.amount + ':' + r.rate; }),
        goal: document.getElementById('next-eta').hidden ? null : document.getElementById('next-eta').textContent,
        picks: Array.prototype.map.call(document.querySelectorAll('#quick .quick-pick:not([hidden])'), function (b) { return b.getAttribute('data-pick'); }),
        short: pick ? pick.classList.contains('short') : null,
        lit: pick ? pick.querySelectorAll('.quick-bar .on').length : null,
        badge: pick ? pick.querySelector('.quick-badge').textContent : null,
        census: document.querySelectorAll('#census .census-entry').length,
        nest: {dormant: d.habitat.nestLife.dormant, stage: d.habitat.nestLife.stage, movers: d.habitat.nestLife.movers, walkers: d.habitat.entities, roles: d.habitat.roles}
      };
    });
    const refreshed = () => page.waitForTimeout(1100);

    // A dormant start: nothing in stock, nothing growing, the goal under the footer and one quick pick.
    await refreshed();
    let now = await state();
    assert.equal(now.compact, true);
    assert.equal(now.dormant, true);
    assert.deepEqual(now.stock, ['meat:0:0', 'larva:0:0']);
    assert.equal(now.goal, 'Press Red to forage. Gather 10 crumbs and 1 hatchling for your first forager roach.');
    assert.deepEqual(now.picks, ['unit:drone']);
    assert.deepEqual([now.short, now.lit, now.badge], [true, 0, '']);
    assert.equal(now.census, 0);
    assert.equal(await page.locator('#stage').textContent(), '', 'no "0 roaches in all" beside the goal');
    assert.deepEqual(now.nest, {dormant: true, stage: 0, movers: 0, walkers: 0, roles: []}, 'a quiet crack of a nest with no walkers');
    await page.waitForTimeout(3000);
    assert.deepEqual((await state()).stock, ['meat:0:0', 'larva:0:0'], 'nothing grows on its own');
    await page.screenshot({path: path.join(shots, 'dormant-start.png')});

    // Mid-harvest: each Red is a crumb, every second one a hatchling that goes into the nest.
    await red();
    assert.match(await page.locator('#message').textContent(), /^Foraged 1 crumb\.$/);
    await page.waitForTimeout(170);
    await red();
    assert.match(await page.locator('#message').textContent(), /^Foraged 1 crumb and 1 hatchling\.$/);
    assert.equal(await page.locator('#resources [data-resource="larva"] strong').getAttribute('class') || '', '', 'forage skips the pop animation');
    assert.deepEqual(await page.evaluate(() => __cues.slice()), []);
    await page.waitForTimeout(170);
    await forage(3);
    await refreshed();
    now = await state();
    assert.deepEqual(now.stock, ['meat:5:0', 'larva:2:0']);
    assert.deepEqual([now.short, now.lit, now.badge], [true, 2, ''], 'the fill bar shows half the crumbs');
    assert.deepEqual([now.nest.dormant, now.nest.movers, now.nest.walkers], [true, 2, 0], 'hatchlings wait inside the nest');
    await page.screenshot({path: path.join(shots, 'mid-harvest.png')});

    // Ten presses afford the first forager; key 1 buys it and wakes the nest.
    await forage(5);
    await refreshed();
    now = await state();
    assert.deepEqual(now.stock, ['meat:10:0', 'larva:5:0']);
    assert.deepEqual([now.short, now.badge], [false, '×1']);
    await key(49);
    assert.equal(await page.evaluate(() => colonyDiagnostics().snapshot.dormant), false);
    await page.locator('#unit-intro:not([hidden])').waitFor();
    assert.equal(await page.locator('#unit-intro strong').textContent(), 'Forager roach');
    await page.locator('#intro-close').click();
    await page.locator('#milestone:not([hidden])').waitFor({timeout: 3000});
    assert.deepEqual([await page.locator('#milestone strong').textContent(), await page.locator('#milestone span').first().textContent()], ['The colony stirs', 'Hatchlings now hatch on their own.']);
    await page.waitForTimeout(400);
    await page.screenshot({path: path.join(shots, 'wake-toast.png')});
    await refreshed();
    now = await state();
    assert.equal(now.goal, null, 'the dormant goal is gone');
    assert.equal(now.nest.dormant, false);
    assert.ok(now.nest.roles.indexOf('drone') !== -1, 'the forager walks out');
    assert.match(now.stock[1], /^larva:\d+:1$/, 'hatchlings now hatch at one a second');
    const queued = await page.evaluate(() => colonyDiagnostics().milestone);
    assert.ok(queued.queued <= 1, 'the forager\'s first-hatch toast is replaced, not repeated');

    // A reload stays awake.
    await page.reload();
    await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
    assert.equal(await page.evaluate(() => colonyDiagnostics().snapshot.dormant), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log('Opening checks passed: dormant start with no stock or growth, goal line, single forager pick with fill bar, crumb and hatchling forages, quiet nest, wake on the first forager with its toast, and a reload that stays awake.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
