// Local habitat draw cost under CPU throttling. Host timing is not TV evidence; use it to compare revisions.
// Usage: node scripts/dev/bench-habitat.cjs [throttle=6] [habitat.js path]
// BENCH_EVENTS=1 adds a snack drop with its carriers, a nuptial flight and the lead's new-tier parade in every
// measured block.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const throttle = Number(process.argv[2]) || 6;
const habitatPath = path.resolve(process.argv[3] || path.join(__dirname, '../../app/habitat.js'));
const app = path.join(__dirname, '../../app');
const scripts = ['nest-sprites.js', 'nest-art.js', 'critters.js', 'creature-sprites.js', 'motes.js'].map(name => path.join(app, name)).filter(file => fs.existsSync(file)).concat(habitatPath);

const meat = 'drone queen nest greaterqueen hive hivequeen empress prophet goddess pantheon pantheon2 pantheon3 pantheon4 pantheon5 overmind overmind2 overmind3 overmind4 overmind5 overmind6'.split(' ');
const territory = 'swarmling stinger spider mosquito locust roach giantspider centipede wasp devourer goon'.split(' ');
const late = {
  populationExact: '1e100000',
  visibleUnits: meat.map((id, i) => ({id, tier: i + 1, owned: true, countExact: '1e+' + (400 - i * 15)}))
    .concat(territory.map((id, i) => ({id, tier: i + 1, owned: true, countExact: '1e+' + (90 - i)})))
    .concat([{id: 'nightbug', tier: 1, owned: true, countExact: '900'}, {id: 'bat', tier: 3, owned: true, countExact: '40'}]),
  resources: [{id: 'meat', amount: '1e1000', rate: '1e900'}, {id: 'larva', amount: '1e1000', rate: '1e50'}, {id: 'territory', amount: '1e1000', rate: '1e10'}],
  upgradeLevels: {hatchery: '140', expansion: '85', nexus1: '1', nexus2: '1', nexus3: '1', dronetwin: '30', queentwin: '22', mutatehatchery: '4'}
};

(async () => {
  const browser = await chromium.launch({headless: true, args: process.env.BENCH_GPU ? [] : ['--disable-gpu', '--disable-accelerated-2d-canvas'], executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    await page.setContent('<style>html,body{margin:0;background:#333}canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas></canvas><div id="panel" style="position:fixed;right:24px;bottom:24px;width:480px;height:150px"></div>');
    for (const file of scripts) await page.addScriptTag({path: file});
    await page.waitForTimeout(500);
    await page.evaluate(snapshot => {
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      // Active so feedback motes are emitted, but frames are drawn by hand.
      habitat.setActive(true);
      cancelAnimationFrame(habitat.request);
      habitat.request = null;
      habitat.update(snapshot);
    }, late);
    await page.waitForTimeout(500);
    // Night fireflies and a golden roach's glints keep the mote pool busy, as in a late evening session.
    await page.evaluate(snapshot => { habitat.update(snapshot); habitat.setNight(true); habitat.showGolden(true); for (let i = 0; i < 300; i++) habitat.draw(1 / 30); }, late);
    if (process.env.BENCH_EVENTS) await page.evaluate(() => {
      habitat.showChance('snack', 'snack_cereal_ring', 600);
      window.benchBlock = () => {
        habitat.flightNext = 0; habitat.nuptialFlight();
        if (habitat.clock >= habitat.paradeUntil && habitat.lead >= 0 && !habitat.role[habitat.lead]) { habitat.paradeUntil = 0; habitat.parade(habitat.kinds[habitat.kind[habitat.lead]].id); }
      };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle});
    const result = await page.evaluate(() => {
      // Five blocks of 120 frames; the quietest block's mean resists background noise on the host.
      const measure = flush => {
        const blocks = [];
        for (let b = 0; b < 5; b++) {
          if (window.benchBlock) benchBlock();
          let total = 0;
          for (let i = 0; i < 120; i++) {
            const start = performance.now();
            habitat.draw(1 / 30);
            // Reading a pixel forces the queued raster work, so clears and blits are counted too.
            if (flush) habitat.ctx.getImageData(0, 0, 1, 1);
            total += performance.now() - start;
          }
          blocks.push(total / 120);
        }
        return {best: Math.min.apply(null, blocks), blocks: blocks.map(v => +v.toFixed(2))};
      };
      const d = habitat.diagnostics();
      return {events: habitat.chanceDiagnostics ? habitat.chanceDiagnostics() : null, submit: measure(false), flushed: measure(true), backing: [d.backingWidth, d.backingHeight], entities: d.entities, atlasBytes: d.atlasBytes, canvasBytes: d.canvasBytes, nestMovers: d.nestLife ? d.nestLife.movers : 0, motes: d.motes || null, nestDust: d.nestDust || null};
    });
    console.log(JSON.stringify(Object.assign({throttle, habitat: path.relative(process.cwd(), habitatPath)}, result), null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
