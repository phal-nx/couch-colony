/* Local review screenshots of the chance events over the dimmed preview backdrop, with a real
   late colony. Never contacts the TV. Output: work/mechanics-qa/. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const Engine = require('../app/engine.js');
const {fixtureState} = require('./benchmark-engine.cjs');

const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'work/mechanics-qa');
fs.mkdirSync(out, {recursive: true});
const types = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png'};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, 'app', pathname.replace(/^\/app\/?/, '') || 'index.html');
  if (!file.startsWith(path.join(root, 'app') + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
    response.end(data);
  });
});

// The real visitor atlas: log a few sightings so the Visitors page shows found and unfound cells.
const critters = (() => { const vm = require('vm'); const box = {window: {}}; vm.createContext(box); vm.runInContext(fs.readFileSync(path.join(root, 'app/critters.js'), 'utf8'), box); return box.window.RoachCritters; })();

server.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/app/';
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const report = {note: 'Local Chrome only; draw timings are submission costs and are not TV evidence.'};
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__hour = 14;
      window.RoachMechanicsOptions = {random: () => 0.01, hour: () => window.__hour, minute: 1000};
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'body.preview #preview-scene { filter: brightness(.38) saturate(.8); }';
        document.head.appendChild(style);
      });
    });
    const state = fixtureState(Engine, 'late');
    await page.goto(base + 'engine.js');
    const found = {};
    critters.visitors.filter((slug, i) => i % 5 === 0).slice(0, 23).forEach((slug, i) => { found[slug] = 1 + (i % 3); });
    await page.evaluate(([save, log]) => {
      localStorage.clear();
      localStorage.setItem('phil_roach_colony_v2', save);
      localStorage.setItem('phil_roach_colony_ui_visitors_v1', log);
      localStorage.setItem('phil_roach_colony_ui_milestones_v1', JSON.stringify({}));
    }, [JSON.stringify({format: 'roach-colony', version: 2, savedAt: state.clock, state}), JSON.stringify(found)]);
    await page.clock.install();
    await page.goto(base + '?preview=1');
    await page.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
    const guests = () => page.evaluate(() => colonyDiagnostics().habitat);
    // Let the arrival toasts for the loaded colony pass first.
    await page.clock.runFor(2000);
    // Visitor at ~3 s for 40 s, golden roach at ~10 s, intruder at ~15 s for 8 s.
    await page.clock.runFor(5000);
    let seen = await guests();
    const scale = 1920 / seen.backingWidth;
    // A 4x enlargement of a 120 px square around a habitat point, in backing pixels.
    const enlarge = async (point, name, size = 120, on = page) => {
      const clip = {x: Math.max(0, Math.min(1920 - size, Math.round(point[0] * scale - size / 2))), y: Math.max(0, Math.min(1080 - size, Math.round(point[1] * scale - size / 2))), width: size, height: size};
      const shot = await on.screenshot({clip});
      const zoom = await browser.newPage({viewport: {width: size * 4, height: size * 4}});
      await zoom.setContent('<body style="margin:0;background:#000"><img style="width:' + size * 4 + 'px;height:' + size * 4 + 'px;image-rendering:pixelated" src="data:image/png;base64,' + shot.toString('base64') + '"></body>');
      await zoom.screenshot({path: path.join(out, name)});
      await zoom.close();
    };
    // The compact controls: quick-buy strip, census and, while something is catchable, Red's chip.
    const panel = async (name, on = page) => {
      const box = await on.locator('#colony').boundingBox();
      await on.screenshot({path: path.join(out, name), clip: {x: box.x - 40, y: box.y - 40, width: box.width + 80, height: box.height + 80}});
    };
    report.visitorCue = {redCue: seen.redCue, chip: await page.evaluate(() => colonyDiagnostics().redCue)};
    if (seen.redCue) await enlarge([seen.redCue[0] + seen.redCue[2] / 2, seen.redCue[1] - 16], 'red-cue-visitor-4x.png', 180);
    await panel('compact-visitor-chip.png');
    await page.clock.runFor(4000);
    await page.screenshot({path: path.join(out, 'visitor-walking.png')});
    await page.clock.runFor(2000);
    seen = await guests();
    const [gx, gy] = seen.guests.goldenAt;
    await page.screenshot({path: path.join(out, 'golden-roach.png')});
    await panel('compact-golden-chip.png');
    report.quickPicks = await page.evaluate(() => colonyDiagnostics().quickPicks);
    report.goldenChip = await page.evaluate(() => colonyDiagnostics().redCue);
    await enlarge([gx, gy], 'golden-roach-4x.png');
    for (let i = 0; i < 20 && !(await guests()).guests.intruder; i++) await page.clock.runFor(500);
    await page.clock.runFor(3500);
    seen = await guests();
    report.chasing = seen.events.chasing;
    report.guests = seen.guests;
    report.entitiesWithGuests = seen.entities;
    await page.screenshot({path: path.join(out, 'intruder-chased.png')});
    await enlarge(seen.guests.intruderAt, 'intruder-chased-4x.png', 200);
    await page.clock.runFor(8000);
    // Red catches the golden roach first.
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 403, bubbles: true})));
    await page.clock.runFor(300);
    await page.screenshot({path: path.join(out, 'golden-caught-toast.png')});
    await page.clock.runFor(15000);
    await page.evaluate(() => { window.__hour = 23; });
    await page.clock.runFor(1500);
    await page.screenshot({path: path.join(out, 'night-shift.png')});
    report.night = (await guests()).guests.night;
    await page.evaluate(() => { window.__hour = 14; });
    await page.clock.runFor(1000);
    await page.locator('#plus').click();
    await page.locator('[data-view="more"]').click();
    await page.locator('#show-visitors').click();
    await page.screenshot({path: path.join(out, 'tv-visitors.png')});
    report.visitorsPage = await page.evaluate(() => ({label: document.getElementById('page-label').textContent, cells: document.querySelectorAll('#visitors .visitor').length, scrolls: document.getElementById('menu').scrollHeight > document.getElementById('menu').clientHeight}));
    // Guest achievements sit in the same list; page to the first one still open.
    await page.locator('[data-view="more"]').click();
    await page.locator('#show-achievements').click();
    await page.screenshot({path: path.join(out, 'tv-achievements.png')});
    const rows = () => page.locator('#achievements article').evaluateAll(list => list.map(n => n.querySelector('strong').textContent + ': ' + n.querySelector('span').textContent));
    report.guestAchievements = [];
    for (let i = 0; i < 40; i++) {
      const shown = (await rows()).filter(row => /^(Guest book|Pest friends|Common ground|Full house|Heart of gold|Gold standard|Not in my nest|Hold the perimeter):/.test(row));
      if (shown.length && !report.guestAchievements.length) await page.screenshot({path: path.join(out, 'tv-achievements-guests.png')});
      report.guestAchievements = report.guestAchievements.concat(shown);
      if (await page.locator('#next').isDisabled()) break;
      await page.locator('#next').click();
    }
    // Habitat events, each in a fresh page with the same late colony. The roll picks the kind; Red's chip and cue come
    // from the real schedule (the golden roach is caught as it shows), and the later stages run on the fake clock.
    // The nuptial flight is started directly, since the page starts it only on a milestone during the night shift.
    const ascendable = JSON.parse(JSON.stringify(state));
    Object.assign(ascendable.state.unittypes, {energy: '1e8', premutagen: '100', ascension: '1'});
    const eventPage = async roll => {
      const p = await browser.newPage({viewport: {width: 1920, height: 1080}});
      p.on('pageerror', error => errors.push(error.message));
      await p.addInitScript(roll => {
        window.__hour = 14;
        window.RoachMechanicsOptions = {random: () => roll, hour: () => window.__hour, minute: 1000};
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = 'body.preview #preview-scene { filter: brightness(.38) saturate(.8); }';
          document.head.appendChild(style);
        });
      }, roll);
      // Keeps the colony's habitat reachable for reading event positions and starting the flight.
      await p.route('**/habitat.js', async route => {
        const response = await route.fetch();
        route.fulfill({response, body: (await response.text()) + ';(function(){var H=window.RoachHabitat;function W(c){var h=new H(c);window.__habitat=h;return h;}for(var k in H)W[k]=H[k];W.prototype=H.prototype;window.RoachHabitat=W;})();'});
      });
      await p.goto(base + 'engine.js');
      await p.evaluate(save => { localStorage.clear(); localStorage.setItem('phil_roach_colony_v2', save); localStorage.setItem('phil_roach_colony_ui_milestones_v1', '{}'); }, JSON.stringify({format: 'roach-colony', version: 2, savedAt: ascendable.clock, state: ascendable}));
      await p.clock.install();
      await p.goto(base + '?preview=1');
      await p.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot && window.__habitat);
      return p;
    };
    const red = p => p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 403, bubbles: true})));
    const waitFor = async (p, kind) => {
      for (let i = 0; i < 80; i++) {
        await p.clock.runFor(500);
        const m = await p.evaluate(() => colonyDiagnostics().mechanics);
        if (m.golden) await red(p);
        if (m.chance === kind) return true;
      }
      return false;
    };
    const chance = p => p.evaluate(() => colonyDiagnostics().habitat.chance);
    const door = p => p.evaluate(() => [__habitat.baseX + __habitat.entryX, __habitat.baseY + __habitat.entryY]);
    // Where a carried egg case is now.
    const eggAt = p => p.evaluate(() => { const c = __habitat.chance; if (!c) return null; const v = Math.max(0, Math.min(1, (__habitat.clock - c.carryAt) / c.carryTime)); const q = __habitat.lanePoint(c.phase + c.home * v, c.inset, {}); return [q.x, q.y]; });
    report.events = {};

    const snack = await eventPage(0.1);
    report.events.snackShown = await waitFor(snack, 'snack');
    await snack.clock.runFor(5000);
    let info = await chance(snack);
    report.events.snack = info;
    await snack.screenshot({path: path.join(out, 'snack-drop.png')});
    await enlarge(info.at, 'snack-drop-4x.png', 200, snack);
    await snack.clock.runFor(9000);
    await enlarge(info.at, 'snack-hauling-4x.png', 200, snack);
    await enlarge(await door(snack), 'snack-door-4x.png', 200, snack);
    await snack.clock.runFor(10000);
    await enlarge(info.at, 'snack-late-4x.png', 200, snack);
    report.events.snackLate = await chance(snack);
    for (let i = 0; i < 40 && !/Snack hauled home/.test(await snack.locator('#milestone').textContent()); i++) await snack.clock.runFor(500);
    await panel('snack-toast.png', snack);
    report.events.snackToast = (await snack.locator('#milestone').textContent()).trim().replace(/\s+/g, ' ');
    // Night shift: a nuptial flight lifts out of the nest.
    await snack.evaluate(() => { window.__hour = 23; });
    await snack.clock.runFor(1500);
    report.events.flight = await snack.evaluate(() => __habitat.nuptialFlight());
    await snack.clock.runFor(1100);
    const flight = (await chance(snack)).flight;
    await snack.screenshot({path: path.join(out, 'nuptial-flight.png')});
    await enlarge([flight.x + flight.dir * 40, flight.y - flight.lift * 0.6], 'nuptial-flight-4x.png', 240, snack);
    await snack.clock.runFor(100);
    await enlarge([flight.x + flight.dir * 40, flight.y - flight.lift * 0.6], 'nuptial-flight-b-4x.png', 240, snack);
    await snack.close();

    const egg = await eventPage(0.5);
    report.events.eggShown = await waitFor(egg, 'egg');
    await egg.clock.runFor(1500);
    info = await chance(egg);
    report.events.egg = {chance: info, chip: await egg.evaluate(() => colonyDiagnostics().redCue), cue: await egg.evaluate(() => colonyDiagnostics().habitat.redCue)};
    await egg.screenshot({path: path.join(out, 'egg-case.png')});
    await panel('compact-egg-chip.png', egg);
    await enlarge(info.at, 'egg-case-4x.png', 160, egg);
    await red(egg);
    await egg.clock.runFor(700);
    await enlarge(info.at, 'egg-hatching-4x.png', 200, egg);
    for (let i = 0; i < 20 && !/Egg case hatched/.test(await egg.locator('#milestone').textContent()); i++) await egg.clock.runFor(500);
    await panel('egg-hatched-toast.png', egg);
    report.events.eggToast = (await egg.locator('#milestone').textContent()).trim().replace(/\s+/g, ' ');
    // The next egg case is left alone: two carriers bring it in along the lane.
    report.events.eggAgain = await waitFor(egg, 'egg');
    for (let i = 0; i < 200 && (await egg.evaluate(() => colonyDiagnostics().mechanics.chance)); i++) await egg.clock.runFor(500);
    await egg.clock.runFor(4500);
    report.events.eggCarried = await chance(egg);
    const carried = await eggAt(egg);
    await egg.screenshot({path: path.join(out, 'egg-carried-in.png')});
    if (carried) await enlarge(carried, 'egg-carried-in-4x.png', 200, egg);
    await egg.close();

    const molt = await eventPage(0.9);
    report.events.moltShown = await waitFor(molt, 'molt');
    await molt.clock.runFor(1500);
    info = await chance(molt);
    report.events.molt = {chance: info, chip: await molt.evaluate(() => colonyDiagnostics().redCue)};
    await molt.screenshot({path: path.join(out, 'molting-roach.png')});
    await panel('compact-molt-chip.png', molt);
    const pair = [(info.at[0] + info.husk[0]) / 2, (info.at[1] + info.husk[1]) / 2];
    await enlarge(pair, 'molting-roach-4x.png', 200, molt);
    // Left alone it darkens, walks off and leaves its husk.
    for (let i = 0; i < 200 && (await molt.evaluate(() => colonyDiagnostics().mechanics.chance)); i++) await molt.clock.runFor(500);
    await molt.clock.runFor(1600);
    await enlarge(pair, 'molt-darkening-4x.png', 200, molt);
    await molt.clock.runFor(3200);
    await enlarge(pair, 'molt-walking-off-4x.png', 240, molt);
    await molt.clock.runFor(6000);
    report.events.moltGone = await chance(molt);
    await enlarge(pair, 'molt-husk-4x.png', 200, molt);
    // Ascension: the colony files into the nest, which returns to its first stage, and a fresh pair walks out.
    await molt.locator('#plus').click();
    await molt.locator('[data-view="evolution"]').click();
    await molt.locator('#ascend').click();
    await molt.locator('#dialog-confirm').click();
    await molt.locator('#close').click();
    const nest = await door(molt);
    await molt.clock.runFor(900);
    report.events.ceremonyIn = await chance(molt);
    await molt.screenshot({path: path.join(out, 'ascension-filing-in.png')});
    await enlarge([nest[0] + 60, nest[1] - 60], 'ascension-filing-in-4x.png', 260, molt);
    await molt.clock.runFor(1700);
    report.events.ceremonyOut = await chance(molt);
    const fresh = await door(molt);
    await enlarge([fresh[0] + 30, fresh[1] - 30], 'ascension-fresh-pair-4x.png', 200, molt);
    await molt.clock.runFor(2500);
    report.events.ceremonyDone = await chance(molt);
    await molt.screenshot({path: path.join(out, 'ascension-after.png')});
    await molt.close();

    report.errors = errors;
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
});
