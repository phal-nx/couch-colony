// The compact census never clips a label or leaves the footprint: entries keep their longest word, and a third
// that will not fit steps aside until it does. Drives the real page with a scripted colony. Never contacts the TV.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';

const engine = `
(function () {
 window.__census = [];
 window.SwarmEngine = {Game: function () {
  this.snapshot = function () {
   var units = window.__census.map(function (u) { return {id: u.id, name: u.id, owned: true, tier: u.tier, count: u.count, countExact: '1', productionTargets: u.territory ? [{id: 'territory'}] : []}; });
   return {resources: [{id: 'meat', name: 'Meat', amount: '1', rate: '1'}], visibleUnitIds: units.map(function (u) { return u.id; }), visibleUnits: units,
    earnedAchievementIds: [], earnedAchievementCount: 0, earnedAchievements: [], achievements: [], population: '1', ascensions: '0', tabs: [], items: [], nextGoal: '', prestige: {unlocked: false}};
  };
  this.act = function () { return {ok: false}; };
  this.autoBuy = function () { return {ok: false}; };
  this.exportState = function () { return {}; };
  this.importState = function () {};
 }};
}());`;
const save = `window.RoachSave={Store:function(){this.error='';this.load=function(){return {message:'Fixture save'};};this.save=function(){return true;};this.export=function(){return '{}';};this.import=function(){return {ok:false,message:'No'};};}};`;

// [entries, whether all three should show]. Labels come from the theme: Forager roach, Nest queen, Neuroprophet,
// Roach empress, Grand matriarch, Silverfish, House centipede. The real labels all fit three across.
const cases = [
  [[['queen', 2, '12'], ['drone', 1, '340'], ['swarmling', 1, '8', true]], true],
  [[['hivequeen', 6, '1.19e14'], ['empress', 7, '77.7M'], ['swarmling', 1, '2.35K', true]], true],
  [[['prophet', 8, '2.35e70'], ['empress', 7, '2.35e70'], ['centipede', 3, '2.35e70', true]], true],
  // An unthemed unit keeps its source name, so a long single word stands in for a future long label.
  [[['prophet', 8, '2.35e70'], ['empress', 7, '2.35e70'], ['Megacentipedeswarmlord', 3, '2.35e70', true]], false],
  // Once it fits again, the third comes back.
  [[['prophet', 8, '12'], ['empress', 7, '12'], ['Megacentipede', 3, '12', true]], true]
];

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    await page.route('**/engine.js', route => route.fulfill({contentType: 'application/javascript', body: engine}));
    await page.route('**/save.js', route => route.fulfill({contentType: 'application/javascript', body: save}));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?preview=1');
    await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
    for (const [entries, allShown] of cases) {
      await page.evaluate(list => { window.__census = list.map(([id, tier, count, territory]) => ({id, tier, count, territory})); }, entries);
      await page.waitForFunction(ids => Array.prototype.map.call(document.querySelectorAll('.census-entry'), e => e.getAttribute('data-unit')).sort().join() === ids, entries.map(e => e[0]).sort().join(), {timeout: 5000});
      await page.waitForTimeout(1200);
      const seen = await page.evaluate(() => {
        const colony = document.getElementById('colony').getBoundingClientRect();
        const shown = Array.prototype.filter.call(document.querySelectorAll('.census-entry'), e => !e.hidden);
        return {
          shown: shown.length,
          clipped: shown.map(e => e.querySelector('.label')).filter(l => l.scrollWidth > l.clientWidth + 0.5).map(l => l.textContent),
          outside: shown.filter(e => e.getBoundingClientRect().left < colony.left - 0.5).length
        };
      });
      const names = entries.map(e => e[0]).join(', ');
      assert.deepEqual(seen.clipped, [], 'No census label is clipped: ' + names);
      assert.equal(seen.outside, 0, 'The census stays inside the footprint: ' + names);
      assert.equal(seen.shown, allShown ? 3 : 2, (allShown ? 'All three fit: ' : 'The third steps aside: ') + names);
    }
    assert.deepEqual(errors, []);
    console.log('Census fit: ' + cases.length + ' cases passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
