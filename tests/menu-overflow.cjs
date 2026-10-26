// Nothing in the TV overlay scrolls sideways at 1920x1080. A real late and very late colony, with every name,
// upgrade, achievement and price stretched far past the longest themed text, is walked through every view,
// tab, page and quantity with each row's Buy focused, plus the More listings, dialogs and key help.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';
const shots = path.resolve('work/menu-overflow');
fs.mkdirSync(shots, {recursive: true});
const {fixtureState} = require('../scripts/dev/benchmark-engine.cjs');
const Engine = require('../app/engine.js');
const stretch = ';(function (t) {' +
  'var label = t.label, upgrade = t.upgradeLabel, achievement = t.achievementLabel, cost = t.costText;' +
  't.label = function (id, name) { return label(id, name) + " of the Deep Ancestral Burrow"; };' +
  't.upgradeLabel = function (id, name) { return upgrade(id, name) + " for Extraordinarily Long Names"; };' +
  't.achievementLabel = function (id, name) { return achievement(id, name) + " Unbelievably Long Achievement"; };' +
  't.costText = function (costs) { return cost(costs) + " + 100 Supercalifragilisticroachexpialidociousness"; };' +
  '}(RoachTheme));';

async function open(browser, fixture, long) {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.addInitScript(() => { window.RoachMechanicsOptions = {hour: () => 14}; });
  if (long) await page.route('**/theme.js', async route => { const response = await route.fetch(); route.fulfill({response, body: (await response.text()) + stretch}); });
  const state = fixtureState(Engine, fixture);
  await page.goto(base + 'engine.js');
  await page.evaluate(text => { localStorage.clear(); localStorage.setItem('phil_roach_colony_v2', text); localStorage.setItem('phil_roach_colony_ui_visitors_v1', JSON.stringify({ladybug: 3, silverfish: 1})); }, JSON.stringify({format: 'roach-colony', version: 2, savedAt: state.clock, state}));
  await page.goto(base);
  await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
  await page.keyboard.press('c');
  return page;
}

// Every scroll container in the overlay (and the panels that guard against one), with each row's Buy focused in turn so the focus brackets count.
// The tab strip is the one deliberate sideways scroller (late colonies have more tabs than fit), and a textarea
// scrolls its own text.
function measure(page, where, rows) {
  return page.evaluate(([where, rows]) => {
    var found = [];
    function check(state) {
      if (document.documentElement.scrollWidth > window.innerWidth) found.push(where + state + ': page ' + document.documentElement.scrollWidth);
      Array.prototype.forEach.call(document.querySelectorAll('#colony, #colony *'), function (node) {
        if (node.id === 'tabs' || node.tagName === 'TEXTAREA' || !node.offsetParent) return;
        // The guarded panels hide sideways overflow, so they are measured whatever their overflow says; labels
        // that clip to an ellipsis on purpose are not scroll containers and are left alone.
        var x = getComputedStyle(node).overflowX;
        var scroller = x === 'auto' || x === 'scroll' || ['menu', 'dialog', 'key-help'].indexOf(node.id) !== -1;
        if (scroller && node.scrollWidth > node.clientWidth) found.push(where + state + ': ' + (node.id || node.className || node.tagName) + ' ' + node.scrollWidth + ' > ' + node.clientWidth);
      });
      var menu = document.getElementById('menu');
      if (rows && menu.scrollHeight > menu.clientHeight + 1) found.push(where + state + ': menu scrolls ' + menu.scrollHeight + ' > ' + menu.clientHeight);
    }
    check('');
    Array.prototype.forEach.call(document.querySelectorAll('#items .buy'), function (buy, index) { buy.focus(); check(' row ' + (index + 1) + ' focused'); });
    return found;
  }, [where, rows]);
}

async function pages(page, where, rows, visit) {
  const found = [];
  for (let index = 0; index < 60; index++) {
    const label = await page.locator('#page-label').textContent();
    found.push(...await measure(page, where + ' ' + label, rows));
    if (visit) await visit(index);
    const next = page.locator('#next');
    if (!(await next.isVisible()) || !(await next.isEnabled())) break;
    await next.click();
  }
  return found;
}

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const found = [];
    for (const [fixture, long] of [['late', false], ['veryLate', true]]) {
      const page = await open(browser, fixture, long);
      const name = fixture + (long ? '-long' : '');
      for (const quantity of ['1', '10', 'max']) {
        await page.locator('[data-view="units"]').click();
        await page.locator('#quantities [data-quantity="' + quantity + '"]').click();
        for (const view of ['units', 'upgrades']) {
          await page.locator('[data-view="' + view + '"]').click();
          const tabs = await page.locator('#tabs button').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-tab')));
          for (const tab of tabs.length ? tabs : [null]) {
            if (tab) await page.locator('[data-tab="' + tab + '"]').click();
            found.push(...await pages(page, [name, quantity, view, tab].join(' '), true, async index => {
              if (index === 0 && quantity === 'max' && tab === tabs[0]) await page.screenshot({path: path.join(shots, name + '-' + view + '-max.png'), clip: {x: 1300, y: 330, width: 620, height: 750}});
            }));
          }
        }
      }
      // Details (8) on a focused row shows the whole price without widening the row.
      await page.locator('[data-view="units"]').click();
      await page.locator('#items .buy').first().focus();
      await page.keyboard.press('8');
      assert.equal(await page.locator('#items article.open .cost').evaluate(cost => cost.scrollHeight <= cost.clientHeight), true, 'an open row shows its whole price');
      found.push(...await measure(page, name + ' details open', false));
      await page.keyboard.press('8');
      if (await page.locator('[data-view="evolution"]').isVisible()) {
        await page.locator('[data-view="evolution"]').click();
        await page.locator('#evolution-details').click();
        found.push(...await measure(page, name + ' evolution', false));
      }
      await page.locator('[data-view="more"]').click();
      found.push(...await measure(page, name + ' more', true));
      await page.screenshot({path: path.join(shots, name + '-more.png'), clip: {x: 1300, y: 330, width: 620, height: 750}});
      for (const listing of ['show-achievements', 'show-visitors']) {
        if (!(await page.locator('#' + listing).isVisible())) continue;
        await page.locator('#' + listing).click();
        found.push(...await pages(page, name + ' ' + listing, false));
        await page.locator('#show-journal').click();
      }
      await page.locator('#export').click();
      found.push(...await measure(page, name + ' export dialog', false));
      await page.locator('#dialog-cancel').click();
      await page.locator('#reset-progress').click();
      found.push(...await measure(page, name + ' reset dialog', false));
      await page.keyboard.press('Escape');
      await page.keyboard.press('9');
      found.push(...await measure(page, name + ' key help', false));
      assert.deepEqual(page.errors, []);
      await page.close();
    }
    assert.deepEqual(found, [], 'nothing in the overlay overflows sideways');
    console.log('Menu overflow checks passed: no sideways scrolling in any view, tab, page, quantity, focused row, listing or dialog, with late and very late colonies and stretched names.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
