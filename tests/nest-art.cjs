const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');

const sprites = path.resolve(__dirname, '../app/nest-sprites.js');
const modulePath = path.resolve(__dirname, '../app/nest-art.js');
const colours = ['#e3a838', '#b4522e', '#cc2c44', '#6f9e3c', '#a64ad8', '#2c62e6', '#2aa59a', '#a9b991', '#7a4a2e', '#5b6f8a'];
const bare = stage => ({stage, hatchery: 0, expansion: 0, nexus: 0, mutation: 0, crumbs: 0, pennants: []});
const states = [];
for (let stage = 0; stage <= 5; stage++) {
  for (const f of [0, 0.5, 1]) {
    states.push({stage, hatchery: Math.round(12 * f), expansion: Math.round(12 * f), nexus: Math.round(5 * f), mutation: Math.round(3 * f), crumbs: Math.round(12 * f), pennants: colours.slice(0, Math.round(10 * f)).map(color => ({color}))});
  }
}
const richest = states[states.length - 1];
// Requested habitat scales: 1600-wide backing today (0.704), a native 1080p backing (0.833 at 1600/1920, 1.0), and 4K.
const scales = [800 / 1920, 0.5, 0.704, 1600 / 1920, 1, 1.69];

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({path: sprites});
    await page.addScriptTag({path: modulePath});
    await page.evaluate(() => {
      window.pixels = (state, scale) => {
        const canvas = RoachNestArt.bake(state, scale);
        return {width: canvas.width, height: canvas.height, data: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)};
      };
      // Bitmaps decode asynchronously; a bake is final once everything it shows is ready.
      window.prepare = state => new Promise((resolve, reject) => {
        const started = Date.now();
        (function poll() {
          if (RoachNestArt.ready(state)) resolve();
          else if (Date.now() - started > 5000) reject(new Error('nest art did not decode'));
          else setTimeout(poll, 10);
        })();
      });
      window.differ = (a, b) => {
        let count = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > 24) count++;
        return count / (a.length / 4);
      };
    });

    const blank = await page.evaluate(() => {
      const p = pixels({stage: 3}, 1);
      return p.data.every(v => v === 0) && RoachNestArt.size(1).width === p.width;
    });
    assert(blank, 'Before the art decodes a bake is a blank canvas of the final size');

    for (const scale of scales) {
      const size = await page.evaluate(scale => RoachNestArt.size(scale), scale);
      const door = await page.evaluate(scale => RoachNestArt.entrance(scale), scale);
      const k = size.width / 300;
      assert(k === 0.5 || Number.isInteger(k), `Scale ${scale} draws the art at a whole multiple or half (${k})`);
      assert.equal(size.height, 230 * k);
      assert(door.x > size.width * 0.8 && door.x < size.width && door.y > size.height * 0.75 && door.y < size.height, 'The entrance faces the screen interior along the bottom edge');
      for (const state of states) {
        await page.evaluate(state => prepare(state), state);
        const shot = await page.evaluate(([state, scale]) => {
          const p = pixels(state, scale);
          const alpha = (x, y) => p.data[(y * p.width + x) * 4 + 3];
          let clear = 0;
          for (let i = 3; i < p.data.length; i += 4) if (p.data[i] < 8) clear++;
          let corners = 0;
          const patch = Math.round(p.width * 0.08);
          for (let y = 0; y < patch; y++) for (let x = 0; x < patch; x++) corners += alpha(x, y) + alpha(p.width - 1 - x, y);
          let topRow = 0;
          for (let x = 0; x < p.width; x++) topRow = Math.max(topRow, alpha(x, 0));
          const door = RoachNestArt.entrance(scale, state);
          return {width: p.width, height: p.height, clear: clear / (p.width * p.height), corners, topRow, door: alpha(door.x, door.y)};
        }, [state, scale]);
        const label = `stage ${state.stage} hatchery ${state.hatchery} at scale ${scale.toFixed(3)}`;
        assert.equal(shot.width, size.width, label + ' keeps a constant width');
        assert.equal(shot.height, size.height, label + ' keeps a constant height');
        assert(shot.corners < 40, label + ' leaves both top corners clear');
        assert(shot.topRow < 40, label + ' is not clipped at the top edge');
        assert(shot.clear > (state.stage < 3 ? 0.5 : 0.2), label + ' stays mostly transparent around the art (' + shot.clear.toFixed(2) + ')');
        assert(shot.door > 200, label + ' draws the entrance where entrance() says');
      }
    }

    // Pixel-perfect: at 1x every opaque pixel is the source pixel, and at 2x every source pixel is a solid 2x2 block.
    const exact = await page.evaluate(async () => {
      const out = [];
      for (let stage = 0; stage <= 5; stage++) {
        const image = new Image();
        image.src = RoachNestSprites.stages[stage];
        await image.decode();
        const source = document.createElement('canvas');
        source.width = 300; source.height = 230;
        source.getContext('2d').drawImage(image, 0, 0);
        const want = source.getContext('2d').getImageData(0, 0, 300, 230).data;
        await prepare({stage});
        const one = pixels({stage}, 1).data;
        let wrong = 0, opaque = 0;
        for (let i = 0; i < want.length; i += 4) {
          if (want[i + 3] !== 255) continue;
          opaque++;
          if (one[i] !== want[i] || one[i + 1] !== want[i + 1] || one[i + 2] !== want[i + 2] || one[i + 3] !== 255) wrong++;
        }
        const two = pixels({stage}, 2);
        let blocky = 0;
        for (let y = 0; y < 230; y++) for (let x = 0; x < 300; x++) {
          const a = ((y * 2) * 600 + x * 2) * 4;
          if (two.data[a + 3] !== 255) continue;
          for (const b of [a + 4, a + 2400, a + 2404]) for (let c = 0; c < 4; c++) if (two.data[b + c] !== two.data[a + c]) { blocky++; c = 4; }
        }
        out.push({wrong, opaque, blocky});
      }
      return out;
    });
    exact.forEach((r, stage) => {
      assert(r.opaque > 1000, `stage ${stage} has art`);
      assert.equal(r.wrong, 0, `stage ${stage} is drawn pixel for pixel at 1x`);
      assert.equal(r.blocky, 0, `stage ${stage} is drawn with nearest-neighbour blocks at 2x`);
    });

    await page.evaluate(state => prepare(state), richest);
    const same = await page.evaluate(state => {
      const a = pixels(state, 1).data;
      const b = pixels(JSON.parse(JSON.stringify(state)), 1).data;
      return a.every((value, i) => value === b[i]);
    }, richest);
    assert(same, 'Baking the same state twice gives identical pixels');

    const stages = await page.evaluate(async () => {
      const result = [];
      for (let stage = 0; stage < 5; stage++) {
        await prepare({stage});
        const a = pixels({stage}, 1).data;
        await prepare({stage: stage + 1});
        result.push(differ(a, pixels({stage: stage + 1}, 1).data));
      }
      return result;
    });
    stages.forEach((share, stage) => assert(share > 0.05, `Stage ${stage + 1} looks substantially different from stage ${stage} (${(share * 100).toFixed(1)}% of pixels)`));

    // Each overlay step and combination changes the picture on every stage where it is placed.
    const steps = await page.evaluate(async () => {
      const out = [];
      const changes = async (a, b) => {
        await prepare(a); const x = pixels(a, 1).data;
        await prepare(b); const y = pixels(b, 1).data;
        return x.some((value, i) => value !== y[i]);
      };
      for (let stage = 0; stage <= 5; stage++) {
        const base = {stage, hatchery: 0, expansion: 0, nexus: 0, mutation: 0, crumbs: 0, pennants: []};
        const anchors = RoachNestSprites.anchors[stage];
        const row = {stage, anchors};
        for (const [key, from, to] of [['hatchery', 0, 1], ['hatchery', 4, 5], ['hatchery', 8, 9], ['crumbs', 0, 1], ['crumbs', 4, 5], ['crumbs', 8, 9], ['expansion', 2, 3], ['mutation', 0, 1], ['mutation', 2, 3]]) {
          row[key + from] = await changes(Object.assign({}, base, {[key]: from}), Object.assign({}, base, {[key]: to}));
        }
        row.nexus = [];
        for (let n = 1; n <= 5; n++) row.nexus.push(await changes(Object.assign({}, base, {nexus: n - 1}), Object.assign({}, base, {nexus: n})));
        row.pennant = await changes(base, Object.assign({}, base, {pennants: [{color: '#e3a838'}]}));
        row.dyed = await changes(Object.assign({}, base, {pennants: [{color: '#e3a838'}]}), Object.assign({}, base, {pennants: [{color: '#2c62e6'}]}));
        row.combo = await changes(Object.assign({}, base, {hatchery: 9, crumbs: 9}), Object.assign({}, base, {hatchery: 9, crumbs: 9, nexus: 1, expansion: 3}));
        out.push(row);
      }
      return out;
    });
    for (const row of steps) {
      const a = row.anchors;
      const label = `stage ${row.stage}`;
      for (const key of ['hatchery0', 'hatchery4', 'hatchery8']) assert.equal(row[key], !!a.eggs, `${label}: ${key} changes the eggs exactly where they are placed`);
      for (const key of ['crumbs0', 'crumbs4', 'crumbs8']) assert.equal(row[key], !!a.crumbs, `${label}: ${key} changes the crumbs exactly where they are placed`);
      assert.equal(row.expansion2, !!a.annex, `${label}: the third expansion step adds the annex where it fits`);
      assert(row.mutation0 && row.mutation2, `${label}: mutation tints the nest at every step`);
      row.nexus.forEach((changed, i) => assert.equal(changed, i < a.nexus.length, `${label}: nexus ${i + 1} adds a node while slots remain`));
      assert(row.pennant && row.dyed, `${label}: a pennant is planted and dyed in its unit colour`);
      assert.equal(row.combo, !!(a.annex || a.nexus.length), `${label}: overlays combine`);
    }
    assert(steps.filter(row => row.anchors.eggs && row.anchors.crumbs && row.anchors.nexus.length && row.anchors.annex).length >= 4, 'Mid and late stages show every overlay');

    // Paths: tunnels lead from the entrance to their chamber through the dark interior, at every scale.
    const traced = await page.evaluate(async () => {
      const out = [];
      for (let stage = 0; stage <= 5; stage++) {
        const state = {stage, hatchery: 12, crumbs: 12, nexus: 5, expansion: 0, mutation: 0, pennants: []};
        await prepare(state);
        const p = pixels({stage}, 1);
        const at = (x, y) => { const i = (Math.round(y) * p.width + Math.round(x)) * 4; return {alpha: p.data[i + 3], light: p.data[i] * 0.3 + p.data[i + 1] * 0.59 + p.data[i + 2] * 0.11}; };
        const one = RoachNestArt.paths(state, 1);
        const two = RoachNestArt.paths(state, 2);
        let samples = 0, outside = 0, light = 0, breaks = 0;
        one.tunnels.forEach((walk, t) => {
          const start = walk[0], end = walk[walk.length - 1], chamber = one.chambers[t];
          if (Math.hypot(start[0] - one.entrance.x, start[1] - one.entrance.y) > 1 || Math.hypot(end[0] - chamber.x, end[1] - chamber.y) > 1) breaks++;
          for (let i = 1; i < walk.length; i++) {
            const length = Math.hypot(walk[i][0] - walk[i - 1][0], walk[i][1] - walk[i - 1][1]);
            for (let d = 0; d <= length; d += 0.5) {
              const s = at(walk[i - 1][0] + (walk[i][0] - walk[i - 1][0]) * d / length, walk[i - 1][1] + (walk[i][1] - walk[i - 1][1]) * d / length);
              samples++;
              if (s.alpha < 255) outside++;
              if (s.light > 70) light++;
            }
          }
        });
        const scaled = JSON.stringify(two) === JSON.stringify({
          tunnels: one.tunnels.map(w => w.map(p => [p[0] * 2, p[1] * 2])),
          chambers: one.chambers.map(c => ({x: c.x * 2, y: c.y * 2, r: c.r * 2, kind: c.kind})),
          entrance: {x: one.entrance.x * 2, y: one.entrance.y * 2}
        });
        const plain = RoachNestArt.paths({stage}, 1).chambers.every(c => c.kind === 'plain');
        out.push({stage, tunnels: one.tunnels.length, chambers: one.chambers.map(c => c.kind), entrance: one.entrance, door: RoachNestArt.entrance(1, state), samples, outside, light, breaks, scaled, plain,
          inside: one.chambers.every(c => at(c.x, c.y).alpha === 255 && at(c.x, c.y).light < 70)});
      }
      return out;
    });
    for (const t of traced) {
      const label = `stage ${t.stage} paths`;
      console.log(`${label}: ${t.tunnels} tunnels, chambers ${t.chambers.join(' ')}, ${(100 * t.light / t.samples).toFixed(1)}% of samples over ladders or props`);
      assert(t.tunnels >= 1 && t.tunnels === t.chambers.length, label + ': one tunnel per chamber');
      assert.equal(t.breaks, 0, label + ': each tunnel runs from the entrance to its chamber');
      assert.equal(t.outside, 0, label + ': never leave the art');
      assert(t.light / t.samples < 0.12, label + ': stay in the dark interior apart from bridged ladders');
      assert(t.inside, label + ': chamber centres are in dark interior');
      assert(Math.hypot(t.entrance.x - t.door.x, t.entrance.y - t.door.y) < 6, label + ': start at the drawn entrance');
      assert(t.scaled, label + ': scale with the baked canvas');
      assert(t.plain, label + ': chambers are plain while no overlay stands in them');
    }
    const kinds = traced.flatMap(t => t.chambers);
    for (const kind of ['egg', 'crumb', 'nexus']) assert(kinds.includes(kind), 'Some chamber holds the ' + kind + ' overlay');

    // Memory: only the stage on show stays decoded, with the small overlays it has used.
    const memory = await page.evaluate(async () => {
      await prepare({stage: 5, hatchery: 12, crumbs: 12, nexus: 5, expansion: 12, pennants: [{color: '#e3a838'}]});
      await prepare({stage: 2, hatchery: 1, crumbs: 1});
      return RoachNestArt.decoded();
    });
    console.log(`decoded nest bitmaps: ${memory.bytes} bytes (${memory.names.join(', ')})`);
    assert.deepEqual(memory.names.filter(name => name[0] === '#'), ['#2'], 'Only the stage on show stays decoded');
    assert(memory.bytes < 300 * 230 * 4 + 40000, 'Decoded nest art stays near one stage bitmap');

    // A slow TV: six-fold CPU throttling on the host, median of several bakes of the busiest state.
    await page.evaluate(state => prepare(state), richest);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 6});
    const timing = await page.evaluate(state => {
      const times = [];
      for (let i = 0; i < 11; i++) {
        const start = performance.now();
        const canvas = RoachNestArt.bake(state, 1);
        canvas.getContext('2d').getImageData(0, 0, 1, 1);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return {median: times[5], worst: times[10]};
    }, richest);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
    console.log(`nest bake at 6x throttle: median ${timing.median.toFixed(1)} ms, worst ${timing.worst.toFixed(1)} ms`);
    assert(timing.median < 15, 'The busiest nest bakes in under 15 ms on a six-fold throttled CPU');
    assert.deepEqual(errors, []);
    console.log('nest art ok');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
