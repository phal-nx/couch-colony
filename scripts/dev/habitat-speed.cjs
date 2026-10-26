// Walking-speed audit for the habitat. Drives a mid- and a late-game colony on a fake clock through purchases,
// a new tier's parade, caravans, crews, promotions, an intruder, a snack drop, an egg case, a molting roach,
// quality changes and an ascension, records where every seat is drawn each frame, and reports each visible
// frame-to-frame step faster than RATIO times its species' walking speed. Seats that are not drawn, or drawn at
// alpha 0, are skipped, so a roach that disappears into the nest and comes out elsewhere is not counted.
// Never contacts the TV. Usage: node scripts/dev/habitat-speed.cjs [habitat.js path] [seconds per colony]
const path = require('node:path');

const RATIO = 2.5;
// Whole-pixel rounding of a walker's sideways wobble can add a pixel to any one frame.
const SLACK = 1.5;
const app = path.join(__dirname, '../../app');
const support = ['nest-sprites.js', 'nest-art.js', 'critters.js', 'creature-sprites.js', 'motes.js'].map(name => path.join(app, name));

const meat = 'drone queen nest greaterqueen hive hivequeen empress prophet goddess pantheon pantheon2 pantheon3 pantheon4 pantheon5 overmind overmind2 overmind3 overmind4 overmind5 overmind6'.split(' ');
const territory = 'swarmling stinger spider mosquito locust roach giantspider centipede wasp devourer goon'.split(' ');

// Runs in the page. Hooks blit and remove, so every drawn seat is recorded under the seat it belongs to and seats
// that change index on removal keep their history.
function probeSource() {
  window.installSpeedProbe = (h, ratio, slack) => {
    const ROLE = {0: 'lane', 1: 'emerge', 2: 'parade', 3: 'caravan', 4: 'chase', 20: 'enter', 21: 'crew', 22: 'scatter', 23: 'guard', 24: 'nurse', 30: 'carry', 31: 'hatch', 32: 'file-in', 33: 'wait-in', 34: 'retire', 35: 'dung'};
    const JOB = ['roam', 'forage', 'claim', 'procession', 'runner', 'tend', 'hover', 'sweep'];
    let prev = new Array(64).fill(null);
    let cur = new Array(64).fill(null);
    const speciesById = new Map();
    let idViolations = 0;
    let speciesSwaps = 0;
    const blit = h.blit;
    const name = i => {
      const role = h.role[i];
      if (role) return ROLE[role] || 'role' + role;
      return (h.leader[i] >= 0 ? 'follow' : JOB[h.job[i]]) + (h.job[i] === 1 || h.job[i] === 2 || h.job[i] === 4 ? h.jobState[i] : '');
    };
    h.blit = function (record, dir, frame, x, y, scale) {
      if (this.seat >= 0 && this.ctx.globalAlpha > 0) cur[this.seat] = {x, y, id: record.id, speed: record.spec.speed, what: name(this.seat)};
      return blit.apply(this, arguments);
    };
    const remove = h.remove;
    h.remove = function (slot, reason) {
      const last = this.count - 1;
      const surviving = [];
      for (let k = 0; k < this.count; k++) if (k !== slot) surviving.push(this.entityId[k]);
      remove.call(this, slot, reason);
      const afterIds = new Set(this.entityId.subarray(0, this.count));
      for (const id of surviving) if (!afterIds.has(id)) idViolations++;
      for (const list of [prev, cur]) { list[slot] = slot === last ? null : list[last]; list[last] = null; }
    };
    const worst = {};
    const steps = [];
    let frames = 0;
    let appeared = 0;
    return {
      step(delta) {
        cur.fill(null);
        h.draw(delta);
        frames++;
        const seenInFrame = new Set();
        for (let i = 0; i < h.count; i++) {
          const eid = h.entityId[i];
          const sp = h.kinds[h.kind[i]] ? h.kinds[h.kind[i]].id : '';
          if (!eid || seenInFrame.has(eid)) idViolations++;
          else seenInFrame.add(eid);
          if (eid) {
            if (speciesById.has(eid) && speciesById.get(eid) !== sp) speciesSwaps++;
            else speciesById.set(eid, sp);
          }
        }
        // Where a roach may appear from nowhere: the nest door, a hatching egg case, or beyond the screen edge.
        const ex = h.baseX + h.entryX, ey = h.baseY + h.entryY;
        const appears = p => Math.hypot(p.x - ex, p.y - ey) < 4 || (h.hatchX && Math.hypot(p.x - h.hatchX, p.y - h.hatchY) < 4) || p.x < 0 || p.x > h.canvas.width;
        for (let i = 0; i < h.count; i++) {
          const a = prev[i], b = cur[i];
          if (!a || !b || a.id !== b.id || !delta) continue;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d > ratio * b.speed * delta + slack && appears(b)) { appeared++; continue; }
          const key = a.what === b.what ? b.what : a.what + '>' + b.what;
          const r = Math.max(0, d - slack) / delta / b.speed;
          if (!worst[key] || r > worst[key].ratio) worst[key] = {ratio: +r.toFixed(2), px: +(d / delta).toFixed(0), id: b.id, clock: +h.clock.toFixed(2)};
          if (d > ratio * b.speed * delta + slack) steps.push({clock: +h.clock.toFixed(2), seat: i, id: b.id, key, px: +d.toFixed(1), speed: +(d / delta).toFixed(0), ratio: +(d / delta / b.speed).toFixed(2), from: [a.x | 0, a.y | 0], to: [b.x | 0, b.y | 0]});
        }
        // HABITAT_TRACE=kind:seat:from:to logs one seat frame by frame, for finding the cause of a fast step.
        const t = window.speedTrace;
        if (t && h.clock >= t.from && h.clock <= t.to) {
          const i = t.seat;
          t.log.push([+h.clock.toFixed(3), cur[i] ? [+cur[i].x.toFixed(1), +cur[i].y.toFixed(1), cur[i].what] : null, 'role', h.role[i], h.roleIndex[i], 'job', h.job[i], h.jobState[i], 'lead', h.leader[i], 'ph', +h.phase[i].toFixed(5), 'in', +h.inset[i].toFixed(1), 'side', +h.side[i].toFixed(1), 'stride', +h.stride[i].toFixed(2), 'dir', h.dir[i], 'travel', +h.travel[i].toFixed(4), 'man', h.manner[i], 'age', +(h.clock - h.roleStart[i]).toFixed(3)]);
        }
        const swap = prev; prev = cur; cur = swap;
      },
      report() {
        const causes = {};
        for (const s of steps) {
          const c = causes[s.key] || (causes[s.key] = {count: 0, maxRatio: 0, maxSpeed: 0, ids: {}, sample: null});
          c.count++;
          c.ids[s.id] = 1;
          if (s.ratio > c.maxRatio) { c.maxRatio = s.ratio; c.maxSpeed = s.speed; c.sample = s; }
        }
        for (const key in causes) causes[key].ids = Object.keys(causes[key].ids);
        return {frames, violations: steps.length, idViolations, speciesSwaps, appeared, causes, worst};
      }
    };
  };

  // Snapshots for the two colonies. tier and owned follow the arguments so a scripted purchase is one changed count.
  window.speedColony = (kind, meat, territory) => {
    const late = kind === 'late';
    const state = late ? {
      units: Object.fromEntries(meat.slice(0, 19).map((id, i) => [id, '1e+' + (400 - i * 15)]).concat(territory.slice(0, 10).map((id, i) => [id, '1e+' + (90 - i)])).concat([['nightbug', '900'], ['bat', '40']])),
      levels: {hatchery: '140', expansion: '85', nexus1: '1', nexus2: '1', nexus3: '1', dronetwin: '30', queentwin: '22', mutatehatchery: '4'},
      resources: [{id: 'meat', amount: '1e1000', rate: '1e900'}, {id: 'larva', amount: '1e1000', rate: '1e50'}, {id: 'territory', amount: '1e1000', rate: '1e10'}]
    } : {
      units: {drone: '100000', queen: '5000', nest: '300', swarmling: '1000000', stinger: '200000', spider: '5000'},
      levels: {hatchery: '3', expansion: '2', dronetwin: '2'},
      resources: [{id: 'meat', amount: '1e7', rate: '1e5'}, {id: 'larva', amount: '500', rate: '30'}, {id: 'territory', amount: '1e200', rate: '10'}]
    };
    const ids = meat.concat(territory, ['nightbug', 'moth', 'bat']);
    const tier = id => meat.includes(id) ? meat.indexOf(id) + 1 : territory.includes(id) ? territory.indexOf(id) + 1 : ['nightbug', 'moth', 'bat'].indexOf(id) + 1;
    state.snapshot = () => ({
      populationExact: late ? '1e100000' : '1e9',
      visibleUnits: ids.map(id => ({id, tier: tier(id), owned: !!state.units[id], countExact: state.units[id] || '0'})),
      resources: state.resources,
      upgradeLevels: Object.assign({}, state.levels)
    });
    return state;
  };

  // A scripted session: an update about once a second as the colony page sends them, and an event every so often.
  window.speedScenario = (kind, seconds, ratio, slack, meat, territory) => {
    const h = window.habitat;
    const colony = speedColony(kind, meat, territory);
    const late = kind === 'late';
    const probe = installSpeedProbe(h, ratio, slack);
    const bump = (id, factor) => { const v = colony.units[id]; colony.units[id] = /e\+/.test(v) ? v.replace(/e\+(\d+)/, (m, e) => 'e+' + (Number(e) + factor)) : String(Number(v) * Math.pow(10, factor)); };
    const level = (id, add) => { colony.levels[id] = String(Number(colony.levels[id] || 0) + add); };
    const script = [
      [6, () => bump(late ? 'overmind' : 'drone', 1)],
      [16, () => bump(late ? 'overmind2' : 'queen', 1)],
      [26, () => { colony.units[late ? 'overmind6' : 'greaterqueen'] = '1'; }],
      [44, () => level('expansion', 1)],
      [70, () => h.showIntruder('spider', 10)],
      [84, () => h.showIntruder(null)],
      [90, () => h.showChance('snack', 'snack_cereal_ring', 30)],
      [120, () => h.endChance('snack', false)],
      [130, () => h.showChance('egg', 'egg_case', 20)],
      [140, () => h.endChance('egg', false)],
      [165, () => h.showChance('molt', 'molting_roach', 12)],
      [170, () => h.endChance('molt', false)],
      [182, () => { h.level = 2; h.reconcile(); }],
      [196, () => { h.level = 0; h.reconcile(); }],
      [204, () => level('nexus' + (late ? 4 : 1), 1)],
      [214, () => bump(late ? 'goon' : 'swarmling', 1)],
      [222, () => level('hatchery', late ? 60 : 30)],
      [232, () => { colony.units[late ? 'goon' : 'hive'] = '1'; }],
      [256, () => h.showChance('molt', 'molting_roach', 12)],
      [260, () => h.endChance('molt', true)],
      [268, () => h.showChance('egg', 'egg_case', 20)],
      [272, () => h.endChance('egg', true)],
      [282, () => bump(late ? 'overmind3' : 'nest', 1)]
    ];
    if (late) h.setNight(true);
    h.update(colony.snapshot());
    probe.step(0);
    let next = 0;
    let at = 1;
    const end = Math.max(seconds, 1);
    while (h.clock < end) {
      while (next < script.length && script[next][0] <= h.clock && script[next][0] < end) script[next++][1]();
      if (h.clock >= at) { h.update(colony.snapshot()); at += 1; }
      probe.step(h.level === 2 ? 1 / 15 : 1 / 30);
    }
    // The ascension: the colony files in and a fresh one comes out of the nest.
    if (seconds >= 290) {
      h.ascendCeremony();
      const fresh = speedColony('mid', meat, territory);
      fresh.units = {drone: '20'};
      fresh.levels = {};
      h.update(fresh.snapshot());
      for (let f = 0; f < 10 * 30; f++) { if (f % 30 === 0 && f > 150) h.update(fresh.snapshot()); probe.step(1 / 30); }
    }
    const events = h.diagnostics().events;
    // Exercise opt-in inspector, quiet retirement, and skitterOut continuity.
    h.update(colony.snapshot());
    probe.step(1 / 30);
    h.setInspector(true, 0);
    for (let f = 0; f < 6; f++) probe.step(1 / 30);
    const insp = h.inspectorDiagnostics();
    const inspectorOk = insp.enabled && insp.targetId > 0 && insp.trail.length >= 4 && !!insp.destination;
    h.setInspector(false);
    h.setQuiet(true);
    const retiring = Array.from(h.role.subarray(0, h.count)).filter(r => r === 34).length;
    for (let f = 0; f < 60; f++) probe.step(1 / 30);
    const quietRetireOk = retiring > 0 && h.lastDeparted.some(d => d.reason === 'retired' || d.reason === 'quiet-cap');
    h.setQuiet(false);
    let closedDone = false;
    const skitterStarted = h.skitterOut(() => { closedDone = true; });
    for (let f = 0; f < 16 && h.active; f++) probe.step(1 / 30);
    const skitterOutOk = skitterStarted && closedDone && !h.active;
    h.setActive(true);
    cancelAnimationFrame(h.request);
    h.request = null;
    return Object.assign(probe.report(), {events, continuity: {inspectorOk, quietRetireOk, skitterOutOk, departures: h.lastDeparted.length}});
  };
}

// Opens a page with the habitat and its art, runs both colonies, and returns their reports.
async function measure(browser, habitatPath, seconds) {
  const out = {};
  for (const kind of ['mid', 'late']) {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<style>html,body{margin:0;background:#333}canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas></canvas><div id="panel" style="position:fixed;right:24px;bottom:24px;width:480px;height:150px"></div>');
    for (const file of support.concat(habitatPath)) await page.addScriptTag({path: file});
    await page.waitForFunction(() => RoachHabitat.creaturesReady());
    await page.addScriptTag({content: '(' + probeSource.toString() + ')()'});
    const trace = (process.env.HABITAT_TRACE || '').split(':');
    if (trace[0] === kind) await page.evaluate(t => { window.speedTrace = {seat: +t[1], from: +t[2], to: +t[3], log: []}; }, trace);
    out[kind] = await page.evaluate(([kind, seconds, ratio, slack, meat, territory, offset]) => {
      // Fixed random numbers, so a run can be repeated; HABITAT_SEED picks another sequence.
      let seed = (kind === 'late' ? 7 : 3) + offset * 7919;
      Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      habitat.setActive(true);
      cancelAnimationFrame(habitat.request);
      habitat.request = null;
      return speedScenario(kind, seconds, ratio, slack, meat, territory);
    }, [kind, seconds, RATIO, SLACK, meat, territory, Number(process.env.HABITAT_SEED) || 0]);
    out[kind].errors = errors;
    if (trace[0] === kind) for (const row of await page.evaluate(() => speedTrace.log)) console.log(JSON.stringify(row));
    await page.close();
  }
  return out;
}

module.exports = {measure, RATIO, SLACK};

if (require.main === module) {
  const {chromium} = require('playwright');
  const habitatPath = path.resolve(process.argv[2] || path.join(app, 'habitat.js'));
  const seconds = Number(process.argv[3]) || 300;
  (async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
      const result = await measure(browser, habitatPath, seconds);
      for (const kind in result) {
        const r = result[kind];
        console.log('\n== ' + kind + ' colony: ' + r.frames + ' frames, ' + r.violations + ' steps over ' + RATIO + 'x walking speed, ' + r.idViolations + ' id violations, ' + r.speciesSwaps + ' species swaps, ' + r.appeared + ' appearances at the door, an egg case or the edge' + (r.errors.length ? ', page errors: ' + r.errors.join('; ') : ''));
        const causes = Object.entries(r.causes).sort((a, b) => b[1].maxRatio - a[1].maxRatio);
        for (const [key, c] of causes) console.log('  ' + key.padEnd(22) + String(c.count).padStart(6) + ' frames, max ' + c.maxRatio + 'x (' + c.maxSpeed + ' px/s) ' + c.ids.join(',') + ' e.g. ' + JSON.stringify(c.sample));
        console.log('  fastest visible step per behaviour (x species speed):');
        console.log('  ' + Object.entries(r.worst).sort((a, b) => b[1].ratio - a[1].ratio).map(([key, w]) => key + ' ' + w.ratio + 'x/' + w.px + 'px/s').join(', '));
        console.log('  continuity: ' + JSON.stringify(r.continuity));
        console.log('  events: ' + JSON.stringify(r.events));
        if (r.violations || r.idViolations || r.speciesSwaps || !r.continuity.inspectorOk || !r.continuity.quietRetireOk || !r.continuity.skitterOutOk || r.errors.length) process.exitCode = 1;
      }
    } finally { await browser.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
