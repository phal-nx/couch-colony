const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const modulePath = path.resolve(__dirname, '../app/habitat.js');
const creaturesPath = path.resolve(__dirname, '../app/creature-sprites.js');
const motesPath = path.resolve(__dirname, '../app/motes.js');
// Walkers, props and motes are cut from the creature sheet, which decodes asynchronously.
const addHabitat = async page => {
  await page.addScriptTag({path:creaturesPath});
  await page.addScriptTag({path:motesPath});
  await page.addScriptTag({path:modulePath});
  await page.waitForFunction(() => RoachHabitat.creaturesReady());
  // What the viewer sees: the floor layer with the moving canvas over it.
  await page.evaluate(() => {
    window.composite = (x, y, w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(habitat.floor, -x, -y);
      g.drawImage(habitat.canvas, -x, -y);
      return g.getImageData(0, 0, w, h);
    };
  });
};
const output = path.resolve('work/habitat-qa');
fs.mkdirSync(output, {recursive:true});
const large = {
  populationExact:'1e100000',
  visibleUnits:[
    {id:'drone',tier:1,owned:true,countExact:'1e+80'}, {id:'queen',tier:2,owned:true,countExact:'72'},
    {id:'greaterqueen',tier:4,owned:true,countExact:'1e+40'}, {id:'swarmling',tier:1,owned:true,countExact:'1e+60'},
    {id:'roach',tier:6,owned:true,countExact:'9000'}, {id:'wasp',tier:9,owned:true,countExact:'5'},
    {id:'overmind',tier:15,owned:true,countExact:'1e+12'}, {id:'meat',tier:0,owned:true,countExact:'1e+1000'}
  ],
  resources:[{id:'meat',amount:'1e1000'},{id:'larva',amount:'1e1000'},{id:'territory',amount:'1e1000'}]
};
const meatChain = 'drone queen nest greaterqueen hive hivequeen empress prophet goddess pantheon pantheon2 pantheon3 pantheon4 pantheon5 overmind overmind2 overmind3 overmind4 overmind5 overmind6'.split(' ');
const territoryChain = 'swarmling stinger spider mosquito locust roach giantspider centipede wasp devourer goon'.split(' ');
const energyChain = ['nightbug','moth','bat'];
const lateUpgrades = {
  hatchery:'140', expansion:'85', nexus1:'1', nexus2:'1', nexus3:'1', nexus4:'1', nexus5:'1', achievementbonus:'12',
  dronetwin:'30', queentwin:'22', nesttwin:'15', greaterqueentwin:'9', hivetwin:'6', overmindprod:'40', overmind6prod:'3',
  swarmlingtwin:'5', roachempower:'2', waspempower:'1', mutatehidden:'1', mutatehatchery:'4', mutatemeat:'3', mutatenexus:'2'
};
const everything = {
  populationExact:'1e100000',
  visibleUnits:meatChain.map((id,i)=>({id,tier:i+1,owned:true,countExact:'1e+'+(400-i*15)})).concat(territoryChain.map((id,i)=>({id,tier:i+1,owned:true,countExact:'1e+'+(90-i)}))),
  resources:large.resources,
  upgradeLevels:lateUpgrades
};
const early = {
  populationExact:'42',
  visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'38'},{id:'queen',tier:2,owned:true,countExact:'4'}],
  resources:[{id:'meat',amount:'1800'},{id:'larva',amount:'12'},{id:'territory',amount:'30'}],
  upgradeLevels:{hatchery:'3', dronetwin:'1'}
};
const colourDistance = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const results = [];
  try {
    for (const size of [{width:1920,height:1080},{width:3840,height:2160}]) {
      const page = await browser.newPage({viewport:size});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent('<style>html,body{margin:0;background:transparent}canvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}</style><canvas id="world"></canvas>');
      await addHabitat(page);
      await page.evaluate(() => { window.habitat = new RoachHabitat(document.querySelector('canvas')); });
      // A dormant colony shows a quiet nest at its first stage with no walkers, even with hatchlings in stock.
      await page.evaluate(() => habitat.update({dormant:true,populationExact:'0',visibleUnits:[{id:'drone',tier:1,owned:false,countExact:'0'}],resources:[{id:'meat',amount:'4'},{id:'larva',amount:'2'}]}));
      let state = await page.evaluate(() => habitat.diagnostics());
      assert.deepEqual([state.entities, state.targetEntities, state.roles, state.nestLife.dormant, state.nestLife.stage], [0, 0, [], true, 0]);
      assert.ok(state.base.width > 0, 'the dormant nest is drawn');
      await page.evaluate(snapshot => habitat.update(snapshot), {populationExact:'1', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'1'},{id:'queen',tier:2,owned:false,countExact:'0'}], resources:[]});
      state = await page.evaluate(() => habitat.diagnostics());
      assert.equal(state.nestLife.dormant, false);
      assert.equal(state.entities, 1);
      assert.deepEqual(state.roles, ['drone']);
      await page.evaluate(() => habitat.update({populationExact:'1',visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'1'}],resources:[{id:'larva',amount:'10'}]}));
      state = await page.evaluate(() => habitat.diagnostics());
      assert.deepEqual(state.allocation,{drone:1,hatchling:3},'A first adult is not duplicated by the brood display');
      await page.evaluate(() => habitat.update({populationExact:'3',visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'2'},{id:'queen',tier:2,owned:true,countExact:'1'}],resources:[]}));
      assert.deepEqual((await page.evaluate(() => habitat.diagnostics())).allocation,{queen:1,drone:2},'Small colonies are shown at their true size');

      await page.evaluate(snapshot => { habitat.update(snapshot); habitat.draw(0); }, large);
      state = await page.evaluate(() => habitat.diagnostics());
      assert.equal(state.entities, 64);
      assert.deepEqual(Object.keys(state.allocation).sort(), ['drone','greaterqueen','hatchling','overmind','queen','roach','swarmling','wasp'],'Every owned unit type is represented and non-units are ignored');
      assert.equal(state.roles[0],'overmind');
      assert.equal(state.lead,'overmind');
      const others = Object.keys(state.allocation).filter(id => id !== 'overmind').map(id => state.allocation[id]);
      assert.equal(state.allocation.overmind, 13,'A group shows one representative per order of magnitude');
      assert(state.allocation.queen === 2 && state.allocation.roach === 4, JSON.stringify(state.allocation) + 'Smaller groups are not inflated to fill the budget');
      assert(others.some(count => count > state.allocation.overmind),'A lower tier with more orders of magnitude may field more');
      assert(state.allocation.wasp <= 5,'A unit is never shown with more representatives than are owned');
      assert(state.allocation.drone > state.allocation.queen,'A lower tier with a vastly larger count earns a larger share');
      assert(state.territoryPatches >= 24 && state.territoryPatches <= 56,'Claimed ground and crumbs are many varied marks, bounded in number');
      assert(state.base.width > 0 && state.base.x < state.backingWidth * 0.2 && state.base.y > state.backingHeight * 0.8 - state.base.height,'The nest sits in the bottom-left corner');
      assert.equal(await page.evaluate(() => habitat.baseY + habitat.groundHeight()), state.backingHeight, 'the painted soil sits on the bottom edge');
      const modes = await page.evaluate(() => {
        const tv = {inset: habitat.minInset, lane: habitat.laneMax, count: habitat.diagnostics().entities, centre: habitat.inCentre(habitat.canvas.width / 2, habitat.canvas.height / 2, 0)};
        habitat.setQuiet(true);
        const quiet = {inset: habitat.minInset, lane: habitat.laneMax, quiet: habitat.quiet, count: habitat.diagnostics().entities};
        habitat.setStandalone(true);
        const terrarium = {standalone: habitat.standalone, quiet: habitat.quiet, lane: habitat.laneMax, centre: habitat.inCentre(habitat.canvas.width / 2, habitat.canvas.height / 2, 0), grounded: habitat.baseY + habitat.groundHeight() === habitat.canvas.height, placed: habitat.baseX === Math.round((habitat.canvas.width - habitat.baseCanvas.width) * 0.38)};
        habitat.setQuiet(true);
        const quietWhileTerrarium = habitat.quiet;
        habitat.setStandalone(false);
        habitat.setQuiet(false);
        return {tv, quiet, terrarium, quietWhileTerrarium, restored: habitat.diagnostics().entities};
      });
      assert.equal(modes.tv.centre, true, 'the TV overlay keeps the middle clear');
      assert.deepEqual([modes.quiet.quiet, modes.quiet.inset, modes.quiet.lane], [true, 14, 42], 'quiet watching hugs a 42px bezel');
      assert.ok(modes.quiet.count < modes.tv.count && modes.quiet.count >= 4, 'quiet watching fields fewer walkers');
      assert.equal(modes.terrarium.standalone, true);
      assert.equal(modes.terrarium.quiet, false, 'a terrarium is not the dim TV edge');
      assert.ok(modes.terrarium.lane > modes.tv.lane, 'standalone lanes cross the floor');
      assert.equal(modes.terrarium.centre, false, 'standalone roaches may cross the middle');
      assert.equal(modes.terrarium.grounded, true);
      assert.equal(modes.terrarium.placed, true, 'the terrarium nest sits left of centre on the floor');
      assert.equal(modes.quietWhileTerrarium, false, 'quiet does not apply over a terrarium');
      assert.equal(modes.restored, state.entities, 'leaving standalone restores the TV crowd');
      assert.equal(state.backingWidth, 1920, 'Native pixels at 1080p and a whole-number stretch of the same layout at 4K');
      assert.equal(state.backingHeight, 1080);
      assert.equal(state.targetFps, 30);

      const rich = await page.evaluate(snapshot => { habitat.update(snapshot); return habitat.diagnostics(); }, everything);
      assert.equal(rich.entities, 64);
      assert.equal(rich.lead,'overmind6');
      assert(rich.roles.length <= 13,'At most twelve adult kinds plus hatchlings are cached');
      assert(rich.roles.some(id => territoryChain.includes(id)) && rich.roles.some(id => meatChain.includes(id)),'A late colony mixes unit families');
      assert(Object.keys(rich.allocation).every(id => id === 'overmind6' || rich.allocation[id] < rich.allocation.overmind6));
      assert(rich.atlasBytes <= rich.atlasBudgetBytes,'Sprite atlases stay within their memory budget');

      // Simulate a minute of movement to cover lane drift, wobble, pauses and escorts before checking the frame.
      await page.evaluate(() => { for (let i = 0; i < 1800; i++) habitat.draw(1 / 30); });
      const pixels = await page.evaluate(() => {
        const ctx = habitat.ctx, w = habitat.canvas.width, h = habitat.canvas.height;
        const image = composite(0,0,w,h).data;
        const b = habitat.diagnostics().base;
        let center = 0, total = 0, nest = 0;
        const edges = [0,0,0,0];
        for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
          if (!image[(y*w+x)*4+3]) continue;
          total++;
          if (x>=b.x && x<b.x+b.width && y>=b.y && y<b.y+b.height) nest++;
          if (x>w*.2 && x<w*.8 && y>h*.2 && y<h*.8) center++;
          if (y<h*.2) edges[0]++;
          if (x>w*.8) edges[1]++;
          if (y>h*.8) edges[2]++;
          if (x<w*.2) edges[3]++;
        }
        // The nest is a fixed-size corner bitmap; coverage limits everything that scales with the colony.
        return {center,total,edges,nest,coverage:(total-nest)/(w*h)};
      });
      assert.equal(pixels.center, 0, 'Central 60% of each dimension must be fully transparent');
      assert(pixels.edges.every(count => count>100), 'Colony should occupy every screen edge');
      assert(pixels.coverage<0.04, 'Rendered marks should cover less than 4% of the viewport: ' + JSON.stringify(pixels));
      assert.equal(rich.base.nexus, 5);
      assert.equal(rich.base.mutations, 3,'The hidden mutation unlock is not counted as a mutation');
      assert(rich.base.banners >= 9,'Unit upgrades plant pennants');
      const baseAlpha = await page.evaluate(() => {
        const b = habitat.diagnostics().base;
        const data = composite(b.x, b.y, b.width, b.height).data;
        let opaque = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
        return opaque / (b.width * b.height);
      });
      assert(baseAlpha > 0.15,'The nest is drawn in its corner');
      assert(await page.evaluate(() => Array.from(habitat.phase.subarray(0, habitat.count)).every(value => value >= 0 && value < 1)),'Lap positions stay normalised');

      // Chance-event guests borrow entity seats, so the cap holds with all three on screen at night.
      const guests = await page.evaluate(() => {
        const original = RoachHabitat.critterCanvas;
        RoachHabitat.critterCanvas = (slug, px) => { const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'); x.fillStyle = '#c84'; x.fillRect(px * 0.1, px * 0.3, px * 0.6, px * 0.4); x.fillStyle = '#222'; x.fillRect(px * 0.7, px * 0.4, px * 0.2, px * 0.2); return c; };
        const bakes = habitat.diagnostics().base.bakes;
        habitat.showGolden(true); habitat.showVisitor('monarch-butterfly', 45, -1); habitat.showIntruder('spider', 10); habitat.setNight(true); habitat.setNight(true);
        const during = habitat.diagnostics();
        const start = performance.now();
        for (let i = 0; i < 150; i++) habitat.draw(1 / 30);
        const frameMs = (performance.now() - start) / 150;
        const mid = habitat.diagnostics();
        const ctx = habitat.ctx, w = habitat.canvas.width, h = habitat.canvas.height, image = composite(0, 0, w, h).data;
        let center = 0;
        for (let y = Math.ceil(h * .2); y < h * .8; y++) for (let x = Math.ceil(w * .2); x < w * .8; x++) if (image[(y * w + x) * 4 + 3]) center++;
        for (let i = 0; i < 180; i++) habitat.draw(1 / 30);
        const after = habitat.diagnostics();
        habitat.showIntruder(null); habitat.showVisitor(null); habitat.showGolden(false); habitat.setNight(false);
        const cleared = habitat.diagnostics();
        habitat.showGolden(true); habitat.setActive(false);
        const hidden = habitat.diagnostics();
        habitat.setActive(true);
        RoachHabitat.critterCanvas = original;
        return {bakes, during, mid, after, cleared, hidden, center, frameMs};
      });
      assert.equal(guests.during.entities, 64, 'Guests take seats from the colony instead of adding a 65th entity');
      assert.deepEqual(guests.during.guests, {golden: true, goldenAt: guests.during.guests.goldenAt, visitor: 'monarch-butterfly', intruder: 'spider', intruderAt: guests.during.guests.intruderAt, night: true});
      assert.equal(guests.during.base.bakes, guests.bakes + 1, 'The night shift re-bakes the nest once, at the boundary');
      assert(guests.mid.events.chasing > 0 && guests.mid.events.chasing <= 4, 'A few territory critters converge on the intruder');
      assert.equal(guests.after.events.chasing, 0, 'Critters return to their jobs once the intruder retreats');
      assert.equal(guests.center, 0, 'Guests keep the centre of the picture clear');
      assert.equal(guests.cleared.entities, 64);
      assert.deepEqual(guests.cleared.guests, {golden: false, goldenAt: null, visitor: '', intruder: '', intruderAt: null, night: false});
      assert.equal(guests.hidden.guests.golden, false, 'Hiding sends guests away');
      console.log(JSON.stringify({guestFrameMs: guests.frameMs}));

      // One cached Red capsule marks what Red catches now: the golden roach first, else the visitor.
      const red = await page.evaluate(() => {
        const original = RoachHabitat.critterCanvas;
        RoachHabitat.critterCanvas = (slug, px) => { const c = document.createElement('canvas'); c.width = c.height = px; c.getContext('2d').fillRect(px * 0.2, px * 0.3, px * 0.6, px * 0.4); return c; };
        const glyph = RoachHabitat.redGlyph(2);
        const pixels = glyph.getContext('2d').getImageData(0, 0, glyph.width, glyph.height).data;
        const colours = {};
        let soft = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] !== 0 && pixels[i + 3] !== 255) soft++;
          if (pixels[i + 3]) colours[pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]] = true;
        }
        const ctx = habitat.ctx;
        const drawImage = ctx.drawImage;
        let marks = 0;
        ctx.drawImage = function (source) { if (source === glyph) marks++; return drawImage.apply(this, arguments); };
        const frame = () => { marks = 0; habitat.draw(1 / 30); return marks; };
        habitat.showGolden(true); habitat.showVisitor('monarch-butterfly', 45, 1);
        for (let i = 0; i < 90; i++) habitat.draw(1 / 30);
        const both = {marks: frame(), cue: habitat.diagnostics().redCue, golden: habitat.diagnostics().guests.goldenAt};
        habitat.showGolden(false);
        for (let i = 0; i < 30; i++) habitat.draw(1 / 30);
        const visitor = {marks: frame(), cue: habitat.diagnostics().redCue, top: habitat.visitor.y};
        habitat.showVisitor(null);
        const none = {marks: frame(), cue: habitat.diagnostics().redCue};
        ctx.drawImage = drawImage;
        RoachHabitat.critterCanvas = original;
        return {size: [glyph.width, glyph.height], shared: habitat.redSprite === glyph && RoachHabitat.redGlyph(2) === glyph, soft, colours: Object.keys(colours).length, both, visitor, none};
      });
      assert.deepEqual(red.size, [32, 16], 'The capsule is the 16x8 art at exactly 2x');
      assert(red.shared, 'The habitat and the overlay chip share one cached glyph');
      assert.equal(red.soft, 0, 'The glyph has hard pixel edges');
      assert(red.colours <= 4, 'The glyph keeps its small muted palette');
      assert.equal(red.both.marks, 1, 'With a golden roach and a visitor out, only one Red cue is drawn');
      assert(Math.abs(red.both.cue[0] + 16 - red.both.golden[0]) <= 1 && red.both.cue[1] + 16 < red.both.golden[1], 'The cue sits above the golden roach Red catches first');
      assert.equal(red.visitor.marks, 1, 'A visitor alone carries the cue');
      assert(red.visitor.cue[1] > red.visitor.top, 'Along the top edge the cue sits below the visitor');
      assert.deepEqual([red.none.marks, red.none.cue], [0, null], 'Nothing catchable, nothing drawn');

      const icons = await page.evaluate(() => {
        const a = RoachHabitat.iconCanvas('queen', 32), b = RoachHabitat.iconCanvas('queen', 32), c = RoachHabitat.iconCanvas('queen', 48), d = RoachHabitat.iconCanvas('not-a-unit', 32);
        const data = a.getContext('2d').getImageData(0,0,32,32).data;
        let opaque = 0, left = 32, right = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) { opaque++; const x = (i >> 2) % 32; left = Math.min(left, x); right = Math.max(right, x); }
        return {same:a === b, sized:a.width === 32 && a.height === 32 && c.width === 48, distinct:a !== c, fallback:d instanceof HTMLCanvasElement && d.width === 32, opaque, facesRight:right - 16 > 16 - left};
      });
      assert.deepEqual(icons,{same:true,sized:true,distinct:true,fallback:true,opaque:icons.opaque,facesRight:true});
      assert(icons.opaque > 60,'Icons are drawn');

      // Census-sized icons: the mean colour of each main-chain tier must differ clearly from its neighbours.
      const tierColours = await page.evaluate(ids => ids.map(id => {
        const data = RoachHabitat.iconCanvas(id, 28).getContext('2d').getImageData(0,0,28,28).data;
        let r = 0, g = 0, b = 0, n = 0;
        // Only the lit colour counts; the shared dark outline and heads say nothing about the tier.
        for (let i = 0; i < data.length; i += 4) if (data[i+3] > 200 && Math.max(data[i], data[i+1], data[i+2]) > 100) { r += data[i]; g += data[i+1]; b += data[i+2]; n++; }
        return [r/n, g/n, b/n];
      }), meatChain);
      const queenIndex = meatChain.indexOf('queen');
      const matriarchIndex = meatChain.indexOf('greaterqueen');
      assert(colourDistance(tierColours[queenIndex], tierColours[matriarchIndex]) > 60,'Nest queen and Colony matriarch are distinguishable at census size: ' + JSON.stringify(tierColours.map(c => c.map(Math.round))));
      for (let i = 1; i < meatChain.length; i++) {
        assert(colourDistance(tierColours[i-1], tierColours[i]) > 50, `${meatChain[i-1]} and ${meatChain[i]} icons must not look alike`);
      }

      // The nest bitmap repaints only when a displayed log-scale step changes, not on every update. Hidden, so no
      // work crew holds a new look back; the crew's delay is tested on its own below.
      const rebake = await page.evaluate(() => {
        habitat.setActive(false);
        const snap = levels => ({populationExact:'500', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'480'},{id:'queen',tier:2,owned:true,countExact:'20'}], resources:[{id:'meat',amount:'5000'},{id:'territory',amount:'90'}], upgradeLevels:levels});
        habitat.setExclusions([]);
        habitat.update(snap({hatchery:'10'}));
        const start = habitat.diagnostics();
        for (let i = 0; i < 60; i++) { habitat.update(snap({hatchery:'10'})); habitat.setExclusions([]); habitat.draw(1/30); }
        habitat.update(snap({hatchery:'12'}));
        const sameStep = habitat.diagnostics();
        habitat.update(snap({hatchery:'100'}));
        const hundred = habitat.diagnostics();
        habitat.update(snap({hatchery:'1e+400', expansion:'7'}));
        const huge = habitat.diagnostics();
        // Controls moving into the bottom-left push the nest to a free corner and re-bake the ground around it.
        habitat.setExclusions([{left:0,top:innerHeight*0.6,right:innerWidth*0.4,bottom:innerHeight}]);
        const moved = habitat.diagnostics();
        for (let i = 0; i < 20; i++) habitat.setExclusions([{left:0,top:innerHeight*0.6,right:innerWidth*0.4,bottom:innerHeight}]);
        const settled = habitat.diagnostics();
        habitat.setExclusions([]);
        return {start, sameStep, hundred, huge, moved, settled};
      });
      assert.equal(rebake.start.base.hatchery, 4);
      assert.equal(rebake.sameStep.base.bakes, rebake.start.base.bakes,'Identical or same-step updates never repaint the nest');
      assert.equal(rebake.sameStep.groundBakes, rebake.start.groundBakes,'Routine updates never repaint the ground');
      assert.equal(rebake.hundred.base.hatchery, 7,'Ten and a hundred hatcheries look different');
      assert.equal(rebake.hundred.base.bakes, rebake.start.base.bakes + 1);
      assert.equal(rebake.huge.base.hatchery, 12,'Huge levels are read without overflowing');
      assert.equal(rebake.huge.base.bakes, rebake.start.base.bakes + 2);
      assert(rebake.moved.base.y < rebake.start.base.y,'The nest leaves a corner the controls cover');
      assert.equal(rebake.moved.groundBakes, rebake.huge.groundBakes + 1);
      assert.equal(rebake.settled.groundBakes, rebake.moved.groundBakes);
      assert.equal(rebake.settled.base.bakes, rebake.moved.base.bakes,'Moving the nest does not repaint it');

      await page.evaluate(snapshot => { habitat.update(snapshot); habitat.setActive(true); }, large);
      await page.waitForTimeout(1200);
      await page.screenshot({path:path.join(output, `habitat-${size.width}.png`), omitBackground:true});
      await page.evaluate(() => habitat.setActive(false));
      const pausedFrames = await page.evaluate(() => habitat.diagnostics().frames);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => habitat.diagnostics().frames),pausedFrames);
      assert.equal(await page.evaluate(() => habitat.canvas.style.visibility),'hidden');
      await page.evaluate(() => {
        habitat.setActive(true);
        Object.defineProperty(document, 'hidden', {configurable:true,value:true});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await page.evaluate(() => habitat.diagnostics().active),false);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => habitat.diagnostics().frames),pausedFrames);
      await page.evaluate(() => {
        Object.defineProperty(document,'hidden',{configurable:true,value:false});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(160);
      assert((await page.evaluate(() => habitat.diagnostics().frames))>pausedFrames);
      await page.evaluate(() => habitat.setActive(false));
      const perf = await page.evaluate(snapshot => {
        habitat.update(snapshot);
        const durations=[];
        for (let i=0;i<300;i++) { const start=performance.now();habitat.draw(1/30);durations.push(performance.now()-start); }
        durations.sort((a,b)=>a-b);
        return {meanMs:durations.reduce((a,b)=>a+b,0)/durations.length,p95Ms:durations[Math.floor(durations.length*.95)],maxMs:durations[durations.length-1]};
      },everything);
      await page.evaluate(() => {
        habitat.setExclusions([{left:0,top:0,right:innerWidth/2,bottom:innerHeight/3}]);
        habitat.draw(1/30);
      });
      const excludedAlpha = await page.evaluate(() => {
        const pixels=composite(0,0,Math.floor(habitat.canvas.width/2),Math.floor(habitat.canvas.height/3)).data;
        let total=0;for(let i=3;i<pixels.length;i+=4) total+=pixels[i];return total;
      });
      assert.equal(excludedAlpha,0,'Controls exclusion must remain transparent');
      const stress = await page.evaluate(snapshots => {
        const atlases = new Set();
        for(let i=0;i<2000;i++) {
          const snapshot = snapshots[i%2];
          snapshot.populationExact=i%3?'1e100000':'1';
          habitat.update(snapshot);
          Object.keys(habitat.atlases).forEach(id => atlases.add(habitat.atlases[id].atlas));
          habitat.draw(1/30);
        }
        habitat.update(Object.assign({},snapshots[1],{populationExact:'1e100000'}));
        return Object.assign(habitat.diagnostics(),{liveAtlases:Array.from(atlases).filter(atlas => atlas.width).length});
      },[large,everything]);
      assert.equal(stress.entities,64);
      assert(stress.liveAtlases <= 13,'Atlases for kinds that left the scene are released');
      assert(stress.atlasBytes <= stress.atlasBudgetBytes);
      assert(stress.groundBytes <= 1024*384*4 + 260*200*4,'Ground sheet and nest stay within their fixed bound');
      assert(stress.canvasBytes <= 2*1920*1080*4 + stress.atlasBudgetBytes + 1024*384*4 + 300*230*4 + 4*64*64*4 + 16*128*128*4 + 16*16*4 + 1920*80*4 + 4*54*54*16*4 + 3*20*20*16*4 + stress.creatureSheetBytes,'Total canvas memory stays bounded');
      const adaptive = await page.evaluate(() => {
        habitat.active=true;
        habitat.lastFrame=1;
        habitat.lastPaint=1;
        let now=1;
        const tick = step => { now+=step; habitat.tick(now); cancelAnimationFrame(habitat.request); habitat.request=null; };
        // Late callbacks with cheap draws: main-thread work elsewhere must not cost the colony its quality.
        for(let i=0;i<400;i++) tick(300);
        const congested = habitat.diagnostics();
        // Expensive draws of the habitat's own do step quality down.
        const draw = habitat.draw;
        const clock = performance.now;
        let extra = 0;
        performance.now = () => clock.call(performance) + extra;
        habitat.draw = function (delta) { draw.call(this, delta); extra += 25; };
        for(let i=0;i<300;i++) tick(70);
        const lean = habitat.diagnostics();
        habitat.draw = draw;
        delete performance.now;
        // A long cheap stretch steps quality back up instead of staying lean for the rest of the session.
        for(let i=0;i<2400;i++) tick(70);
        habitat.setActive(false);
        return {congested, lean, recovered:habitat.diagnostics()};
      });
      assert(adaptive.congested.lateFrames >= 400);
      assert.equal(adaptive.congested.quality,'full','Late frames alone never lower quality');
      assert.equal(adaptive.congested.targetFps,30);
      assert.equal(adaptive.lean.quality,'lean');
      assert.equal(adaptive.lean.entities,32);
      assert.equal(adaptive.lean.targetFps,15);
      assert.equal(adaptive.recovered.quality,'full');
      assert.equal(adaptive.recovered.entities,64);
      assert.equal(adaptive.recovered.targetFps,30);
      await page.evaluate(() => habitat.destroy());
      assert.equal(await page.evaluate(() => habitat.diagnostics().active),false);
      assert.deepEqual(errors,[]);
      results.push({viewport:size,initial:state,rich,pixels,drawSubmission:perf,afterStress:stress,adaptive});
      await page.close();
    }
    // Purchase feedback is driven by snapshot diffs; frames are drawn by hand so the event clock is deterministic.
    const ev = await browser.newPage({viewport:{width:1920,height:1080}});
    const evErrors = [];
    ev.on('pageerror', error => evErrors.push(error.message));
    await ev.setContent('<style>html,body{margin:0;height:100%;background:linear-gradient(160deg,#3a3f47,#5a5a5a 55%,#2d3036)}canvas{position:fixed;left:0;top:0;width:100%;height:100%}#panel{position:fixed;right:24px;bottom:24px;width:480px;height:150px;background:rgba(14,12,10,.72);border-radius:12px;color:#eee;font:24px sans-serif;padding:16px;box-sizing:border-box}</style><canvas></canvas><div id="panel">Roach Colony</div>');
    await addHabitat(ev);
    const shoot = name => ev.screenshot({path:path.join(output, name)});
    const events = await ev.evaluate(() => {
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true);
      cancelAnimationFrame(habitat.request);
      habitat.request = null;
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      const snap = (drones, extra) => Object.assign({populationExact:String(drones + 40), visibleUnits:[{id:'drone',tier:1,owned:true,countExact:String(drones)},{id:'queen',tier:2,owned:true,countExact:'30'},{id:'swarmling',tier:1,owned:true,countExact:'12'},{id:'stinger',tier:2,owned:true,countExact:'6'},{id:'greaterqueen',tier:4,owned:false,countExact:'0'},{id:'nest',tier:3,owned:false,countExact:'0'}], resources:[{id:'meat',amount:'1e6'},{id:'larva',amount:'40'},{id:'territory',amount:'900'}], upgradeLevels:{hatchery:'3', expansion:'2'}}, extra || {});
      const run = (seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) habitat.draw(1/30); };
      const ev = () => habitat.diagnostics().events;
      const out = {};
      let maxEntities = 0;
      const track = () => { maxEntities = Math.max(maxEntities, habitat.diagnostics().entities); };
      habitat.update(snap(200)); run(1); track();
      out.baseline = ev();
      habitat.update(snap(200)); run(1);
      out.steady = ev();
      habitat.update(snap(800)); run(0.3); track();
      out.jump = ev();
      habitat.update(snap(2000)); run(0.3);
      habitat.update(snap(5000)); run(0.3);
      out.rapid = ev();
      run(2);
      habitat.update(snap(12000)); track();
      out.afterGap = ev();
      run(0.6);
      out.midEmergence = ev();
      return {out, maxEntities};
    });
    assert.equal(events.out.baseline.emergences, 0, 'The first update only sets a baseline');
    assert.equal(events.out.baseline.rebaselines, 1);
    assert.equal(events.out.steady.emergences, 0, 'Unchanged counts are not purchases');
    assert.equal(events.out.jump.emergences, 1, 'A count jump causes one emergence');
    // Earlier emergers still filing out of the door are ahead of the burst in the queue.
    const burst = events.out.jump.emerging - events.out.steady.emerging;
    assert(burst > 0 && burst <= 3, 'A few representatives walk out of the nest: ' + JSON.stringify([events.out.steady.emerging, events.out.jump.emerging]));
    assert.equal(events.out.rapid.emergences, 1, 'Rapid repeated jumps within the gap coalesce');
    assert.equal(events.out.rapid.coalesced, 2);
    assert.equal(events.out.afterGap.emergences, 2, 'A jump after the gap bursts again');
    await shoot('event-emergence-1920.png');
    await ev.screenshot({path:path.join(output, 'event-emergence-nest.png'), clip:{x:0, y:700, width:620, height:380}});
    const parade = await ev.evaluate(() => {
      const base = habitat.diagnostics().events;
      const snap = (owned) => ({populationExact:'12100', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'12000'},{id:'queen',tier:2,owned:true,countExact:'30'},{id:'swarmling',tier:1,owned:true,countExact:'12'},{id:'stinger',tier:2,owned:true,countExact:'6'},{id:'nest',tier:3,owned:owned.includes('nest'),countExact:owned.includes('nest')?'1':'0'},{id:'greaterqueen',tier:4,owned:owned.includes('greaterqueen'),countExact:owned.includes('greaterqueen')?'1':'0'},{id:'spider',tier:3,owned:owned.includes('spider'),countExact:owned.includes('spider')?'1':'0'}], resources:[{id:'meat',amount:'1e6'},{id:'larva',amount:'40'},{id:'territory',amount:'900'}], upgradeLevels:{hatchery:'3', expansion:'2'}});
      const run = (seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) habitat.draw(1/30); };
      habitat.update(snap([])); run(0.5);
      habitat.update(snap(['nest'])); run(3);
      const first = habitat.diagnostics().events;
      habitat.update(snap(['nest','greaterqueen'])); run(0.2);
      habitat.update(snap(['nest','greaterqueen','spider'])); run(0.2);
      const queued = habitat.diagnostics().events;
      return {base, first, queued};
    });
    assert.equal(parade.first.parades - parade.base.parades, 1, 'A newly owned unit triggers exactly one parade');
    assert.equal(parade.first.parading, 1);
    assert.equal(parade.queued.parades, parade.first.parades, 'Only one parade runs at a time');
    assert.equal(parade.queued.queuedParades, 1, 'One more parade is queued');
    assert.equal(parade.queued.droppedParades, 1, 'Further parades are dropped');
    await shoot('event-parade-1920.png');
    const later = await ev.evaluate(() => {
      const snap = (levels) => ({populationExact:'12100', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'12000'},{id:'queen',tier:2,owned:true,countExact:'30'},{id:'swarmling',tier:1,owned:true,countExact:'12'},{id:'stinger',tier:2,owned:true,countExact:'6'},{id:'nest',tier:3,owned:true,countExact:'1'},{id:'greaterqueen',tier:4,owned:true,countExact:'1'},{id:'spider',tier:3,owned:true,countExact:'1'}], resources:[{id:'meat',amount:'1e6'},{id:'larva',amount:'40'},{id:'territory',amount:'900'}], upgradeLevels:levels});
      const run = (seconds, each) => { for (let i = 0; i < Math.round(seconds * 30); i++) { habitat.draw(1/30); if (each) each(); } };
      const centre = () => {
        const w = habitat.canvas.width, h = habitat.canvas.height;
        const data = composite(Math.ceil(w*.2), Math.ceil(h*.2), Math.floor(w*.6), Math.floor(h*.6)).data;
        let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) n++; return n;
      };
      let maxEntities = 0, centrePixels = 0;
      // Updates keep arriving about once a second while the parade walks its lap; the queued one follows.
      const firstEnds = habitat.paradeUntil, firstSeconds = habitat.paradeUntil - habitat.clock;
      for (let s = 0; s < 240 && habitat.clock < firstEnds + 1; s++) { habitat.update(snap({hatchery:'3', expansion:'2'})); run(1, () => { maxEntities = Math.max(maxEntities, habitat.count); }); if (s % 8 === 0) centrePixels += centre(); }
      const queuedStarted = habitat.diagnostics().events;
      run(9.5); habitat.update(snap({hatchery:'3', expansion:'2'})); run(0.2);
      habitat.update(snap({hatchery:'3', expansion:'3'})); run(2.5);
      const caravan = habitat.diagnostics().events;
      centrePixels += centre();
      return {queuedStarted, caravan, maxEntities, centrePixels, firstSeconds};
    });
    assert.equal(later.queuedStarted.parades, parade.first.parades + 1, 'The queued parade starts once the first ends');
    // A lap walked at no more than twice the new tier's own pace takes most of a minute or more.
    assert(later.firstSeconds > 30 && later.firstSeconds < 180, 'A parade lasts as long as walking its lap: ' + later.firstSeconds);
    assert.equal(later.caravan.caravans, 1, 'An expansion level rise triggers a caravan');
    assert(later.caravan.caravanning > 0 && later.caravan.caravanning <= 6, 'A caravan is short and capped');
    assert.equal(later.caravan.pulses >= 1, true, 'The upgraded nest feature pulses');
    await shoot('event-caravan-1920.png');
    const ended = await ev.evaluate(() => {
      // Arriving members re-enter the nest and come back out through the door one at a time, behind the work crew
      // that the same expansion sent in.
      let frames = 0;
      // A caravan walks in from beyond the far edge at its slowest member's pace, so it takes as long as that walk.
      for (; frames < 60 * 30 && (habitat.clock < habitat.caravanUntil + 0.5 || habitat.diagnostics().events.emerging); frames++) habitat.draw(1/30);
      const d = habitat.diagnostics();
      const w = habitat.canvas.width, h = habitat.canvas.height;
      const data = composite(Math.ceil(w*.2), Math.ceil(h*.2), Math.floor(w*.6), Math.floor(h*.6)).data;
      let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) n++;
      return {events:d.events, entities:d.entities, centre:n, seconds:frames / 30};
    });
    assert.equal(ended.events.caravanning, 0, 'The caravan ends within its lifetime');
    assert.equal(ended.events.emerging, 0, 'Caravan and crew members have walked back out onto the lane within a minute');
    console.log(JSON.stringify({caravanDrainedSeconds:ended.seconds}));
    assert(events.maxEntities <= 64 && later.maxEntities <= 64 && ended.entities <= 64, 'Events never add entities beyond the budget');
    assert.equal(later.centrePixels + ended.centre, 0, 'The centre stays transparent during events');
    const guarded = await ev.evaluate(([large, everything]) => {
      const before = habitat.diagnostics().events;
      // A save load or import: many units and upgrades appear at once.
      habitat.update(everything); habitat.draw(1/30);
      const imported = habitat.diagnostics().events;
      habitat.setActive(false);
      habitat.update(Object.assign({}, everything, {visibleUnits: everything.visibleUnits.map(u => Object.assign({}, u, {countExact: u.countExact.replace('e+', 'e+1')}))}));
      const hidden = habitat.diagnostics().events;
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.update(everything);
      const reopened = habitat.diagnostics().events;
      const durations = [];
      const time = () => { const start = performance.now(); habitat.draw(1/30); durations.push(performance.now() - start); };
      for (let i = 0; i < 300; i++) time();
      const quietMs = durations.reduce((a, b) => a + b, 0) / durations.length;
      durations.length = 0;
      habitat.burstAt = -1e9; habitat.caravanUntil = 0; habitat.paradeUntil = 0;
      habitat.burst(['overmind6'], ['nexus5']); habitat.startCaravan(); habitat.parade('goddess');
      for (let i = 0; i < 150; i++) time();
      const busyMs = durations.reduce((a, b) => a + b, 0) / durations.length;
      habitat.destroy();
      return {before, imported, hidden, reopened, quietMs, busyMs};
    }, [large, everything]);
    assert.equal(guarded.imported.emergences + guarded.imported.parades + guarded.imported.caravans, guarded.before.emergences + guarded.before.parades + guarded.before.caravans, 'An import-sized change is not a purchase');
    assert.equal(guarded.imported.rebaselines, guarded.before.rebaselines + 1);
    assert.equal(guarded.hidden.emergences, guarded.imported.emergences, 'No events while hidden');
    assert.equal(guarded.reopened.emergences, guarded.imported.emergences, 'Reopening sets a fresh baseline');
    // Standing jobs over 75 visible seconds of a mid-game colony with every job's species present.
    const jobs = await ev.evaluate(() => {
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      const snap = drones => ({populationExact:'1e9', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:drones},{id:'queen',tier:2,owned:true,countExact:'5000'},{id:'swarmling',tier:1,owned:true,countExact:'1000000'},{id:'stinger',tier:2,owned:true,countExact:'2000'},{id:'nightbug',tier:1,owned:true,countExact:'900'},{id:'moth',tier:2,owned:true,countExact:'300'},{id:'bat',tier:3,owned:true,countExact:'40'}], resources:[{id:'meat',amount:'1e7',rate:'1e5'},{id:'larva',amount:'500',rate:'30'},{id:'territory',amount:'1e5',rate:'10'}], upgradeLevels:{hatchery:'20', expansion:'12', nexus1:'1', nexus2:'1'}});
      habitat.update(snap('100000000'));
      const start = habitat.diagnostics().jobs;
      const w = habitat.canvas.width, h = habitat.canvas.height;
      const centre = () => { const data = composite(Math.ceil(w*.2), Math.ceil(h*.2), Math.floor(w*.6), Math.floor(h*.6)).data; let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) n++; return n; };
      let centrePixels = 0, carried = 0, offRoute = 0, maxEntities = 0, insetOut = 0;
      const route = habitat.routes.forage;
      for (let f = 0; f < 75 * 30; f++) {
        habitat.draw(1/30);
        if (f % 30 === 29) habitat.update(snap('100000000'));
        if (f % 15) continue;
        maxEntities = Math.max(maxEntities, habitat.count);
        for (let i = 0; i < habitat.count; i++) {
          if (habitat.job[i] !== 1 || habitat.role[i]) continue;
          let along = (habitat.phase[i] - route.a) * route.dir; along -= Math.floor(along);
          if (along > route.span + 0.02 && along < 0.98) offRoute++;
          if (habitat.jobState[i] === 2) carried++;
          if (habitat.inset[i] < 24 || habitat.inset[i] > habitat.laneMax) insetOut++;
        }
        if (f % 150 === 0) centrePixels += centre();
      }
      const mid = habitat.diagnostics();
      habitat.update(snap('900000000')); habitat.draw(1/30);
      const dispatched = habitat.diagnostics();
      // A slow runner's round trip takes about 25 s, and it may first wait for whoever is in the nest doorway.
      for (let f = 0; f < 30 * 30; f++) { habitat.draw(1/30); if (f % 30 === 29) habitat.update(snap('900000000')); }
      const after = habitat.diagnostics();
      const durations = [];
      for (let i = 0; i < 300; i++) { const t = performance.now(); habitat.draw(1/30); durations.push(performance.now() - t); }
      return {start, mid, dispatched, after, centrePixels, carried, offRoute, maxEntities, insetOut, route:{a:route.a, b:route.b, span:route.span, dir:route.dir}, drawMs:durations.reduce((a, b) => a + b, 0) / durations.length};
    });
    assert(jobs.start.forage >= 1 && jobs.start.claim >= 1 && jobs.start.tend >= 1 && jobs.start.hover >= 1 && jobs.start.sweep >= 1, 'Every job is staffed: ' + JSON.stringify(jobs.start));
    assert(jobs.start.forage <= 5 && jobs.start.claim <= 5 && jobs.start.tend <= 3 && jobs.start.hover <= 4 && jobs.start.sweep <= 2, 'Job quotas are bounded');
    assert(jobs.route.dir === -1 && jobs.route.span > 0.1 && jobs.route.span < 0.3, 'Foragers run along the bottom edge from the nest toward the controls: ' + JSON.stringify(jobs.route));
    assert.equal(jobs.offRoute, 0, 'Foragers stay on the supply line');
    assert.equal(jobs.insetOut, 0, 'Foragers stay inside the lane band');
    assert(jobs.carried > 0, 'Foragers come home carrying crumbs');
    assert(jobs.start.trail, 'The supply line has a pheromone trail');
    assert(jobs.mid.events.lays >= 2, 'Tending queens lay hatchlings periodically');
    assert(jobs.mid.events.processions >= 1, 'The lead walks a procession about once a minute');
    assert.equal(jobs.dispatched.events.runners, 1, 'A purchase sends one runner');
    assert.equal(jobs.dispatched.jobs.runner, 1);
    assert.equal(jobs.after.jobs.runner, 0, 'The runner returns and resumes roaming');
    assert(jobs.maxEntities <= 64, 'Jobs never add entities');
    assert.equal(jobs.centrePixels, 0, 'The centre stays transparent while the colony works');
    await shoot('jobs-1920.png');
    console.log(JSON.stringify({jobDrawMs:jobs.drawMs, jobs:jobs.after.jobs}));
    assert.deepEqual(evErrors, []);
    await ev.close();
    console.log(JSON.stringify({eventDrawMs:{quiet:guarded.quietMs, busy:guarded.busyMs}}));

    // Deliberate behaviours: promotions, the nursery line, work crews, startle and scatter, frontier guards.
    // Frames are drawn by hand; review images go to work/habitat-qa/behaviour-*.png.
    const bh = await browser.newPage({viewport:{width:1920,height:1080}});
    const bhErrors = [];
    bh.on('pageerror', error => bhErrors.push(error.message));
    await bh.setContent('<style>html,body{margin:0;height:100%;background:linear-gradient(160deg,#3a3f47,#5a5a5a 55%,#2d3036)}canvas{position:fixed;left:0;top:0;width:100%;height:100%}#panel{position:fixed;right:24px;bottom:24px;width:480px;height:150px;background:rgba(14,12,10,.72);border-radius:12px;color:#eee;font:24px sans-serif;padding:16px;box-sizing:border-box}</style><canvas></canvas><div id="panel">Roach Colony</div>');
    for (const name of ['nest-sprites.js', 'nest-art.js', 'critters.js']) await bh.addScriptTag({path:path.resolve(__dirname, '../app', name)});
    await addHabitat(bh);
    const enlarge = async (point, name, size = 160) => {
      const clip = {x:Math.max(0, Math.min(1920 - size, Math.round(point[0] - size / 2))), y:Math.max(0, Math.min(1080 - size, Math.round(point[1] - size / 2))), width:size, height:size};
      const png = await bh.screenshot({clip});
      const view = await browser.newPage({viewport:{width:size * 4, height:size * 4}});
      await view.setContent(`<body style="margin:0;background:#000"><img src="data:image/png;base64,${png.toString('base64')}" style="width:${size * 4}px;height:${size * 4}px;image-rendering:pixelated"></body>`);
      await view.screenshot({path:path.join(output, name)});
      await view.close();
    };
    const bhShot = name => bh.screenshot({path:path.join(output, name)});
    const promotion = await bh.evaluate(() => {
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      window.bsnap = (queens, levels) => ({populationExact:'1e9', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'100000'},{id:'queen',tier:2,owned:true,countExact:queens || '5000'},{id:'swarmling',tier:1,owned:true,countExact:'1000000'},{id:'stinger',tier:2,owned:true,countExact:'200000'}], resources:[{id:'meat',amount:'1e7',rate:'1e5'},{id:'larva',amount:'500',rate:'30'},{id:'territory',amount:'1e200',rate:'10'}], upgradeLevels:levels || {hatchery:'3', expansion:'2'}});
      // Every frame: entity budget, the centre (sampled), and when each nursing hatchling leaves the line.
      window.watch = {maxEntities:0, centre:0, frames:0, nurseEnds:[], nursing:new Map()};
      const w = habitat.canvas.width, h = habitat.canvas.height;
      window.run = seconds => {
        for (let f = 0; f < Math.round(seconds * 30); f++) {
          habitat.draw(1/30);
          watch.maxEntities = Math.max(watch.maxEntities, habitat.diagnostics().entities);
          for (let i = 0; i < habitat.count; i++) {
            if (habitat.role[i] === 24) watch.nursing.set(i, true);
            else if (watch.nursing.get(i)) { watch.nursing.delete(i); watch.nurseEnds.push({clock:habitat.clock, phase:habitat.phase[i], id:habitat.kinds[habitat.kind[i]].id}); }
          }
          if (++watch.frames % 15) continue;
          const data = composite(Math.ceil(w*.2), Math.ceil(h*.2), Math.floor(w*.6), Math.floor(h*.6)).data;
          for (let k = 3; k < data.length; k += 4) if (data[k]) watch.centre++;
        }
      };
      const roleOf = (role) => { const out = []; for (let i = 0; i < habitat.count; i++) if (habitat.role[i] === role) out.push({i, id:habitat.kinds[habitat.kind[i]].id, start:habitat.roleStart[i]}); return out; };
      window.roleOf = roleOf;
      habitat.update(bsnap()); run(1);
      habitat.update(bsnap()); run(1);
      const before = habitat.diagnostics().events;
      // Queens bought with drones: a spike in the queen count.
      habitat.update(bsnap('50000')); run(1/30);
      const entering = roleOf(20), emerging = roleOf(1).filter(r => r.id === 'queen');
      const clock = habitat.clock;
      const jump = habitat.diagnostics().events;
      return {before, jump, entering, emerging, clock};
    });
    assert.equal(promotion.jump.promotions - promotion.before.promotions, 1, 'Buying a higher main-chain tier is one promotion');
    assert(promotion.entering.length >= 1 && promotion.entering.length <= 3 && promotion.entering.every(r => r.id === 'drone'), 'A few of the tier below walk into the nest: ' + JSON.stringify(promotion.entering));
    assert(promotion.emerging.length >= 1 && promotion.emerging.every(r => r.start > promotion.clock + 1), 'The new tier comes out only after them: ' + JSON.stringify(promotion));
    await bh.evaluate(() => run(0.9));
    let entrance = await bh.evaluate(() => [habitat.baseX + habitat.entryX, habitat.baseY + habitat.entryY]);
    await bhShot('behaviour-promotion-1920.png');
    await enlarge(entrance, 'behaviour-promotion-in-4x.png', 200);
    // The new queen is next through the door once the drones have gone in.
    const promotedOut = await bh.evaluate(() => { const out = () => roleOf(1).filter(r => r.id === 'queen' && r.start <= habitat.clock); for (let f = 0; f < 150 && !out().length; f++) run(1/30); return {out:out().length, inside:roleOf(20).length, clock:habitat.clock}; });
    await enlarge(entrance, 'behaviour-promotion-out-4x.png', 200);
    assert(promotedOut.out >= 1 && promotedOut.inside >= 1, 'The new queen walks out while the drones are still inside: ' + JSON.stringify(promotedOut));
    const nursery = await bh.evaluate(() => {
      run(11.6 - habitat.clock);
      const live = roleOf(24);
      const queen = habitat.layQueen;
      const at = habitat.restPoint(queen, {});
      const promotionDone = roleOf(20).length;
      const drones = habitat.diagnostics().events;
      return {live, queen:queen >= 0 ? habitat.kinds[habitat.kind[queen]].id : '', queenJob:habitat.job[queen], at:[at.x, at.y], events:drones, promotionDone};
    });
    assert.equal(nursery.events.nursery, 1, 'A laying queen leads a nursery line');
    assert(nursery.live.length >= 1 && nursery.live.length <= 3 && nursery.live.every(r => r.id === 'hatchling'), 'Hatchlings follow her in a short line: ' + JSON.stringify(nursery.live));
    assert(nursery.queen === 'queen' && nursery.queenJob === 5, 'The line follows a tending queen');
    // For the review image only, the queen is moved to the right of her circle, where the whole line is on screen.
    const lineAt = await bh.evaluate(() => {
      const q = habitat.layQueen, keep = habitat.travel[q];
      habitat.travel[q] = 0.15; habitat.restUntil[q] = 0; habitat.draw(0);
      const at = habitat.restPoint(q, {});
      window.restoreQueen = () => { habitat.travel[q] = keep; };
      return [at.x - 10, at.y - 20];
    });
    await bhShot('behaviour-nursery-1920.png');
    await enlarge(lineAt, 'behaviour-nursery-4x.png', 160);
    await bh.evaluate(() => restoreQueen());
    const nurseryEnd = await bh.evaluate(() => {
      run(16);
      const f = habitat.routes.forage;
      return {ends:watch.nurseEnds, forageA:f.a, live:roleOf(24).length, entering:roleOf(20).length};
    });
    assert.equal(nurseryEnd.live, 0, 'The whole line has peeled off');
    assert.equal(nurseryEnd.entering, 0, 'Promoted-away drones have come back out to work');
    assert.equal(nurseryEnd.ends.length, nursery.live.length, 'Every hatchling leaves the line');
    // They leave the line 3.5 s apart and walk to the trail at their own pace, so they arrive one at a time.
    for (let k = 1; k < nurseryEnd.ends.length; k++) assert(nurseryEnd.ends[k].clock - nurseryEnd.ends[k - 1].clock >= 1, 'Hatchlings peel off one at a time: ' + JSON.stringify(nurseryEnd.ends));
    assert(nurseryEnd.ends.every(e => Math.abs(e.phase - nurseryEnd.forageA) < 0.01), 'Each joins the supply trail at the nest end');
    // A nest upgrade with a new look sends a crew, and the nest re-bakes when it is through the door.
    const crew = await bh.evaluate(() => {
      const bakes = () => habitat.diagnostics().base.bakes;
      const before = bakes();
      const start = habitat.clock;
      habitat.update(bsnap('50000', {hatchery:'30', expansion:'2'}));
      const held = {bakes:bakes(), events:habitat.diagnostics().events};
      let rebakedAt = -1, sawInside = false;
      const members = roleOf(21).map(r => r.i);
      for (let f = 0; f < 8 * 30 && rebakedAt < 0; f++) {
        run(1/30);
        if (f === 40) window.crewShot = members.map(i => habitat.restPoint(i, {})).map(p => [p.x, p.y]);
        if (bakes() > before) rebakedAt = habitat.clock - start;
        else sawInside = sawInside || roleOf(21).length === members.length;
      }
      const after = habitat.diagnostics().events;
      // A member still walking at the timeout carries on in and comes back out.
      let drained = false;
      for (let f = 0; f < 10 * 30 && !drained; f++) { run(1/30); drained = roleOf(21).length === 0; }
      // A crew that never reaches the door: the new look appears at the timeout.
      run(4);
      habitat.update(bsnap('50000', {hatchery:'300', expansion:'2'}));
      const stuck = roleOf(21);
      for (const r of stuck) habitat.roleStart[r.i] += 100;
      const before2 = bakes(), start2 = habitat.clock;
      let timedOutAt = -1;
      for (let f = 0; f < 8 * 30 && timedOutAt < 0; f++) { run(1/30); if (bakes() > before2) timedOutAt = habitat.clock - start2; }
      return {before, held, rebakedAt, sawInside, members:members.length, after, drained, stuck:stuck.length, timedOutAt, timeouts:habitat.diagnostics().events.crewTimeouts};
    });
    assert.equal(crew.held.bakes, crew.before, 'The nest keeps its old look while the crew is on its way');
    assert(crew.held.events.crewHolding && crew.members >= 3 && crew.members <= 5, 'A crew of three to five sets out: ' + JSON.stringify(crew));
    assert(crew.rebakedAt > 0.9 && crew.rebakedAt <= 6 + 1/30, 'The new look appears when the crew arrives: ' + crew.rebakedAt);
    assert(crew.drained, 'Every member walks in, a straggler after the new look has appeared');
    assert(crew.stuck >= 3 && Math.abs(crew.timedOutAt - 6) < 0.05, 'A crew never holds the nest past its timeout: ' + JSON.stringify(crew));
    assert.equal(crew.timeouts, crew.after.crewTimeouts + 1);
    // Review images of a crew walking in, staged again and drawn to mid-walk.
    const crewAt = await bh.evaluate(() => {
      run(3);
      habitat.update(bsnap('50000', {hatchery:'3000', expansion:'2'}));
      run(0.8);
      const live = roleOf(21);
      // Where the member with the longest walk is, found by moving its lane spot for a moment.
      const r = live.reduce((a, b) => habitat.crewWalk(b.i) > habitat.crewWalk(a.i) ? b : a), keep = habitat.phase[r.i];
      const u = Math.max(0, Math.min(1, (habitat.clock - r.start) / habitat.crewWalk(r.i)));
      habitat.phase[r.i] = keep + habitat.crewGap(r.i) * u;
      const at = habitat.restPoint(r.i, {});
      habitat.phase[r.i] = keep;
      return {live:live.length, at:[at.x, at.y]};
    });
    assert(crewAt.live >= 3, 'A third crew forms for the next upgrade');
    await bhShot('behaviour-crew-1920.png');
    await enlarge(crewAt.at, 'behaviour-crew-4x.png', 200);
    // Startle: bounded radius, a cooldown, never into the centre; an arriving intruder startles too.
    const scatter = await bh.evaluate(() => {
      run(25);
      const w = habitat.canvas.width, h = habitat.canvas.height;
      // A roamer held still on the bottom edge, startled from just below so it would dash toward the centre.
      let pick = -1;
      for (let i = 0; i < habitat.count && pick < 0; i++) if (!habitat.role[i] && !habitat.job[i] && habitat.leader[i] < 0 && i !== habitat.lead) pick = i;
      habitat.phase[pick] = habitat.nearestPhase(habitat.inset[pick], w * 0.45, h);
      habitat.pauseUntil[pick] = habitat.elapsed + 10; habitat.nextPause[pick] = habitat.elapsed + 20;
      run(1/30);
      const p = habitat.restPoint(pick, {});
      const before = habitat.diagnostics().events.scatters;
      const n = habitat.startle(p.x, p.y + 40);
      const scattering = roleOf(22).map(r => {
        const rest = habitat.restPoint(r.i, {}), aim = habitat.scatterAim(r.i, {});
        return {d:Math.hypot(rest.x - p.x, rest.y - p.y - 40), moved:Math.hypot(aim.x - rest.x, aim.y - rest.y), centre:habitat.inCentre(aim.x, aim.y, 0)};
      });
      const again = habitat.startle(p.x, p.y + 40);
      run(3);
      const settled = roleOf(22).length;
      const afterEvents = habitat.diagnostics().events;
      // An intruder's arrival, with a roamer moved next to its hold point.
      run(20);
      habitat.showIntruder('spider', 10);
      const v = habitat.intruder;
      let near = -1;
      for (let i = 0; i < habitat.count && near < 0; i++) if (!habitat.role[i] && !habitat.job[i] && habitat.leader[i] < 0 && i !== habitat.lead) near = i;
      habitat.phase[near] = habitat.nearestPhase(habitat.inset[near], v.sx, v.sy);
      habitat.pauseUntil[near] = habitat.elapsed + 10; habitat.nextPause[near] = habitat.elapsed + 20;
      const beforeIntruder = habitat.diagnostics().events.scatters;
      run(4);
      const intruderScatters = habitat.diagnostics().events.scatters - beforeIntruder;
      run(8);
      habitat.showIntruder(null);
      return {n, before, scattering, again, settled, scatters:afterEvents.scatters - before, intruderScatters, at:[p.x, p.y]};
    });
    assert(scatter.n >= 1 && scatter.n <= 8, 'Roaches near the source scatter, at most eight: ' + JSON.stringify(scatter));
    assert(scatter.scattering.every(s => s.d <= 150), 'Only roaches within the radius scatter');
    assert(scatter.scattering.every(s => !s.centre && s.moved <= 34 + 1e-6), 'A scatter is short and never enters the centre: ' + JSON.stringify(scatter.scattering));
    assert.equal(scatter.again, 0, 'A second startle within the cooldown does nothing');
    assert.equal(scatter.scatters, 1);
    assert.equal(scatter.settled, 0, 'Scattered roaches settle back to their jobs');
    assert.equal(scatter.intruderScatters, 1, 'An arriving intruder startles the roaches near it');
    // Frontier guards: sentries stand still at the outermost posts and are relieved by marchers.
    const guards = await bh.evaluate(() => {
      const c = habitat.routes.claim;
      const posts = Math.min(5, 1 + Math.floor(habitat.territory / 4));
      let maxGuards = 0, offPost = 0, moved = 0, wrongPost = 0, centre = 0;
      const last = new Map();
      for (let s = 0; s < 150; s++) {
        habitat.update(bsnap('50000', {hatchery:'3000', expansion:'2'}));
        for (let f = 0; f < 30; f++) {
          run(1/30);
          const guards = roleOf(23);
          maxGuards = Math.max(maxGuards, guards.length);
          for (const g of guards) {
            const k = habitat.roleIndex[g.i];
            let post = c.a + c.dir * c.span * (k + 1) / posts; post -= Math.floor(post);
            if (Math.abs(habitat.phase[g.i] - post) > 1e-6) offPost++;
            if (k < posts - 3) wrongPost++;
            const key = g.i + ':' + g.start;
            if (last.has(key) && last.get(key) !== habitat.phase[g.i]) moved++;
            last.set(key, habitat.phase[g.i]);
            const p = habitat.restPoint(g.i, {});
            if (habitat.inCentre(p.x, p.y, 0)) centre++;
          }
        }
      }
      const live = roleOf(23).map(r => { const p = habitat.restPoint(r.i, {}); return [p.x, p.y]; });
      return {maxGuards, offPost, moved, wrongPost, centre, live, events:habitat.diagnostics().events, claimers:habitat.diagnostics().jobs.claim, posts};
    });
    assert(guards.maxGuards >= 1 && guards.maxGuards <= 3 && guards.maxGuards < guards.claimers, 'A few claimers stand guard while others march: ' + JSON.stringify(guards));
    assert.equal(guards.offPost + guards.wrongPost + guards.centre, 0, 'Guards stand exactly at the outermost claim posts');
    assert.equal(guards.moved, 0, 'A guard stands still for its whole shift');
    assert(guards.events.guardShifts >= 1, 'Guards swap shifts with marchers: ' + JSON.stringify(guards.events));
    await bhShot('behaviour-guards-1920.png');
    await enlarge(guards.live[0], 'behaviour-guards-4x.png', 200);
    // Closing ends every behaviour at once, holds no nest look back, and nothing starts while hidden.
    const hiddenRun = await bh.evaluate(() => {
      habitat.layAt = habitat.clock; habitat.nurseNext = 0; habitat.startleAt = -1e9;
      run(2);
      habitat.update(bsnap('50000', {hatchery:'30000', expansion:'2'}));
      run(0.5);
      const busy = habitat.diagnostics().events;
      const bakes = habitat.diagnostics().base.bakes;
      habitat.setActive(false);
      const closed = habitat.diagnostics();
      habitat.update(bsnap('500000', {hatchery:'300000', expansion:'20'}));
      habitat.update(bsnap('5000000', {hatchery:'3000000', expansion:'200'}));
      const whileHidden = habitat.diagnostics();
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.update(bsnap('5000000', {hatchery:'3000000', expansion:'200'}));
      const reopened = habitat.diagnostics().events;
      return {busy, bakes, closed:closed.events, closedBakes:closed.base.bakes, whileHidden:whileHidden.events, reopened};
    });
    const live = e => e.entering + e.crewing + e.scattering + e.guards + e.nursing;
    assert(live(hiddenRun.busy) > 0 && hiddenRun.busy.crewHolding, 'Behaviours are under way before closing: ' + JSON.stringify(hiddenRun.busy));
    assert.equal(live(hiddenRun.closed), 0, 'Closing ends every behaviour');
    assert(!hiddenRun.closed.crewHolding && hiddenRun.closedBakes === hiddenRun.bakes + 1, 'Closing shows the held nest look at once');
    for (const key of ['promotions', 'crews', 'scatters', 'nursery', 'guardShifts']) {
      assert.equal(hiddenRun.whileHidden[key], hiddenRun.closed[key], 'Nothing happens while hidden: ' + key);
      assert.equal(hiddenRun.reopened[key], hiddenRun.closed[key], 'Reopening sets a fresh baseline: ' + key);
    }
    const budget = await bh.evaluate(() => ({maxEntities:watch.maxEntities, centre:watch.centre}));
    assert(budget.maxEntities <= 64, 'Behaviours borrow seats and never add entities');
    assert.equal(budget.centre, 0, 'The centre stays transparent through every behaviour');
    assert.deepEqual(bhErrors, []);
    await bh.close();

    // Review screenshots over a dim, video-like backdrop with a stand-in control panel.
    const qa = await browser.newPage({viewport:{width:1920,height:1080}});
    const qaErrors = [];
    qa.on('pageerror', error => qaErrors.push(error.message));
    await qa.setContent('<style>html,body{margin:0;height:100%;background:linear-gradient(160deg,#4a4f57,#707070 55%,#3d4046)}canvas{position:fixed;left:0;top:0;width:100%;height:100%}#panel{position:fixed;right:24px;bottom:24px;background:rgba(14,12,10,.72);border-radius:12px;color:#eee;font:24px sans-serif;padding:16px;box-sizing:border-box}</style><canvas></canvas><div id="panel">Roach Colony</div>');
    await addHabitat(qa);
    const qaStats = {};
    for (const [name, snapshot, panel] of [['early', early, [480,150]], ['late', everything, [560,600]]]) {
      qaStats[name] = await qa.evaluate(([snapshot, panel]) => {
        if (window.habitat) habitat.destroy();
        const box = document.getElementById('panel');
        box.style.width = panel[0] + 'px';
        box.style.height = panel[1] + 'px';
        window.habitat = new RoachHabitat(document.querySelector('canvas'));
        habitat.update(snapshot);
        habitat.setExclusions([box.getBoundingClientRect()]);
        for (let i = 0; i < 900; i++) habitat.draw(1/30);
        const d = habitat.diagnostics();
        return {entities:d.entities, marks:d.territoryPatches, base:d.base, atlasBytes:d.atlasBytes, groundBytes:d.groundBytes, canvasBytes:d.canvasBytes};
      }, [snapshot, panel]);
      await qa.evaluate(() => habitat.setActive(true));
      await qa.waitForTimeout(400);
      await qa.screenshot({path:path.join(output, `colony-${name}-1920.png`)});
      const nest = qaStats[name].base;
      const ratio = 1;
      await qa.screenshot({path:path.join(output, `colony-${name}-nest.png`), clip:{x:0, y:Math.max(0, nest.y * ratio - 120), width:Math.min(1920, (nest.x + nest.width) * ratio + 240), height:Math.min(1080, 1080 - Math.max(0, nest.y * ratio - 120))}});
      await qa.evaluate(() => habitat.setActive(false));
    }
    await qa.evaluate(ids => {
      habitat.destroy();
      document.querySelectorAll('style').forEach(style => style.remove());
      document.body.style.cssText = 'margin:0;background:#5f6166';
      document.body.innerHTML = '<div id="sheet" style="display:flex;flex-wrap:wrap;gap:10px;padding:16px;font:14px sans-serif;color:#eee"></div>';
      ids.forEach(id => {
        const cell = document.createElement('div');
        cell.style.cssText = 'width:220px;display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(0,0,0,.18);border-radius:8px;padding:6px';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px';
        const small = RoachHabitat.iconCanvas(id, 28);
        // The census size, magnified 3x without smoothing so its pixels can be reviewed.
        const zoom = document.createElement('canvas');
        zoom.width = zoom.height = 84;
        const zctx = zoom.getContext('2d');
        zctx.imageSmoothingEnabled = false;
        zctx.drawImage(small, 0, 0, 84, 84);
        row.appendChild(small);
        row.appendChild(zoom);
        row.appendChild(RoachHabitat.iconCanvas(id, 72));
        cell.appendChild(row);
        cell.appendChild(document.createTextNode(id));
        document.getElementById('sheet').appendChild(cell);
      });
    }, ['hatchling'].concat(meatChain, territoryChain, energyChain));
    await qa.screenshot({path:path.join(output, 'icons.png'), fullPage:true});
    assert.deepEqual(qaErrors, []);
    await qa.close();
    console.log(JSON.stringify(qaStats, null, 2));

    // Mapped units take their DOM icon from the critter atlas once it loads; walkers and unmapped icons stay procedural.
    const critterMap = fs.readFileSync(path.resolve(__dirname, '../app/critters.js'), 'utf8');
    const sheetBytes = Buffer.from(/image: 'data:image\/png;base64,([^']+)'/.exec(critterMap)[1], 'base64');
    const sample = (id, size) => { const data = RoachHabitat.iconCanvas(id, size).getContext('2d').getImageData(0, 0, size, size).data; return Array.from(data); };
    const pixels = (canvas) => Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    const reference = await browser.newPage();
    await reference.setContent('<body></body>');
    await reference.addScriptTag({path:modulePath});
    const procedural = await reference.evaluate(`(${sample})('drone', 30)`);
    const proceduralSpider = await reference.evaluate(`(${sample})('spider', 30)`);
    await reference.close();
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    // A same-origin URL held back until the first icons are drawn; the app itself inlines the atlas.
    await page.route('https://roach.test/**', async route => {
      if (route.request().url().endsWith('.png')) { await gate; return route.fulfill({contentType:'image/png', body:sheetBytes}); }
      return route.fulfill({contentType:'text/html', body:'<body></body>'});
    });
    await page.goto('https://roach.test/');
    await page.addScriptTag({content:critterMap + `;RoachCritters.image='/critters.png';window.critterEvents=0;addEventListener('roachcritters',function(){critterEvents++;});`});
    await addHabitat(page);
    const before = await page.evaluate(`window.early = RoachHabitat.iconCanvas('drone', 30); window.earlyVisitor = RoachHabitat.critterCanvas('ladybug', 48); ({drone: (${sample})('drone', 30), visitor: (${pixels})(earlyVisitor)})`);
    assert.deepEqual(before.drone, procedural, 'Icons are procedural until the atlas has loaded');
    assert(before.visitor.every(value => value === 0), 'Atlas icons stay blank until the atlas has loaded');
    release();
    await page.waitForFunction(() => window.critterEvents === 1);
    const after = await page.evaluate(`(function () {
      var cell = RoachCritters.cell, pixels = ${pixels}, flipped = true, doubled = true;
      var one = pixels(RoachHabitat.critterCanvas('ladybug', cell)), two = pixels(RoachHabitat.critterCanvas('ladybug', cell * 2)), left = pixels(RoachHabitat.critterCanvas('ladybug', cell, true));
      for (var y = 0; y < cell; y++) for (var x = 0; x < cell; x++) for (var c = 0; c < 4; c++) {
        if (left[(y * cell + x) * 4 + c] !== one[(y * cell + cell - 1 - x) * 4 + c]) flipped = false;
        if (two[(2 * y * cell * 2 + 2 * x + 1) * 4 + c] !== one[(y * cell + x) * 4 + c]) doubled = false;
      }
      var names = Object.keys(RoachCritters.units).map(function (id) { return RoachCritters.units[id]; }).concat(RoachCritters.visitors);
      return {same: RoachHabitat.iconCanvas('drone', 30) === early, sameVisitor: RoachHabitat.critterCanvas('ladybug', 48) === earlyVisitor, drone: (${sample})('drone', 30), spider: (${sample})('spider', 30),
        half: pixels(RoachHabitat.critterCanvas('ladybug', cell / 2)), pantheon: pixels(RoachHabitat.iconCanvas('pantheon', cell)), pantheon2: pixels(RoachHabitat.iconCanvas('pantheon2', cell)),
        markedUpgrade: (function () { var twin = RoachHabitat.iconFor('upgrade', 'dronetwin', 32), other = RoachHabitat.iconFor('upgrade', 'queentwin', 32), faster = RoachHabitat.iconFor('upgrade', 'droneprod', 32); return !!(twin && other && faster && twin !== other && twin !== faster); })(), resource: RoachHabitat.iconFor('resource', 'meat', 32) === RoachHabitat.critterCanvas(RoachCritters.resources.meat, 32),
        meta: !!RoachHabitat.iconFor('meta', 'achievement', 32), unknown: RoachHabitat.iconFor('upgrade', 'not-an-upgrade', 32), unit: RoachHabitat.iconFor('unit', 'wasp', 48) === RoachHabitat.iconCanvas('wasp', 48),
        mapped: ['resources', 'upgrades', 'meta'].reduce(function (all, key) { return all.concat(Object.keys(RoachCritters[key]).map(function (id) { return RoachCritters[key][id]; })); }, []).filter(function (name) { return !RoachCritters.icons[name]; }),
        className: early.className, controller: RoachHabitat.iconCanvas('wasp', 48).toDataURL('image/png').length, flipped: flipped, doubled: doubled,
        missing: names.filter(function (name) { return !RoachCritters.icons[name]; }), visitorsOpaque: pixels(earlyVisitor).filter(function (v, i) { return i % 4 === 3 && v === 255; }).length};
    })()`);
    assert(after.same && after.sameVisitor, 'Cached icons are repainted in place');
    let changed = 0, partial = 0, opaque = 0;
    for (let i = 3; i < after.drone.length; i += 4) {
      if (Math.abs(after.drone[i] - procedural[i]) > 40) changed++;
      if (after.drone[i] > 0 && after.drone[i] < 255) partial++;
      if (after.drone[i] > 200) opaque++;
    }
    assert(changed > 60, 'The forager icon comes from the atlas');
    assert(opaque > 150, 'The forager icon is drawn');
    assert.equal(partial, 0, 'Icons drawn below the cell size keep hard edges');
    assert.equal(after.className, 'pixel-art');
    assert.notDeepEqual(after.spider, proceduralSpider, 'The spider icon comes from the atlas');
    assert.equal(after.half.filter((v, i) => i % 4 === 3 && v > 0 && v < 255).length, 0, 'Half-size atlas icons keep hard edges');
    assert(after.half.filter((v, i) => i % 4 === 3 && v === 255).length > 100, 'Half-size atlas icons are drawn');
    assert.notDeepEqual(after.pantheon2, after.pantheon, 'Numbered tiers are tinted');
    assert.deepEqual(after.pantheon2.filter((v, i) => i % 4 === 3), after.pantheon.filter((v, i) => i % 4 === 3), 'A tint keeps the silhouette');
    assert(after.markedUpgrade && after.resource && after.meta && after.unit, 'Twin and faster upgrades keep their own unit icon, and every other icon kind resolves');
    assert.equal(after.unknown, null, 'Ids without art have no icon');
    assert.deepEqual(after.mapped, [], 'Every mapped resource, upgrade and meta icon has an atlas cell');
    assert(after.controller > 500, 'The phone controller receives the atlas icon');
    assert(after.flipped, 'Mirrored atlas icons are exact horizontal flips');
    assert(after.doubled, 'Atlas icons scale by whole pixels without smoothing');
    assert.deepEqual(after.missing, [], 'Every mapped unit and visitor has an atlas cell');
    assert(after.visitorsOpaque > 400, 'Visitor icons are drawn once the atlas loads');
    assert.deepEqual(pageErrors, []);
    await page.close();
    assert(sheetBytes.toString('base64').length <= 900 * 1024, 'The critter atlas data URL stays under 900 KB');
    // The walking sprites, the mote pool and the nest's interior life, in a page with every app art module.
    const finalQa = path.resolve('work/final-qa');
    fs.mkdirSync(finalQa, {recursive:true});
    const art = await browser.newPage({viewport:{width:1920,height:1080}});
    const artErrors = [];
    art.on('pageerror', error => artErrors.push(error.message));
    await art.setContent('<style>html,body{margin:0;height:100%;background:linear-gradient(160deg,#2c3036,#45474c 55%,#25282d)}canvas{position:fixed;left:0;top:0;width:100%;height:100%}#panel{position:fixed;right:24px;bottom:24px;width:480px;height:150px;background:rgba(14,12,10,.72);border-radius:12px;color:#eee;font:24px sans-serif;padding:16px;box-sizing:border-box}</style><canvas></canvas><div id="panel">Roach Colony</div>');
    for (const name of ['nest-sprites.js', 'nest-art.js', 'critters.js']) await art.addScriptTag({path:path.resolve(__dirname, '../app', name)});
    await addHabitat(art);
    const sprites = await art.evaluate(() => {
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      const c = RoachCreatures;
      const sheet = document.createElement('canvas');
      sheet.width = c.width; sheet.height = c.height;
      // The decoded sheet, read back through a canvas so its pixels can be compared with the baked atlases.
      const image = new Image(); image.src = c.image;
      return new Promise(resolve => { image.onload = () => {
        sheet.getContext('2d').drawImage(image, 0, 0);
        const sheetPixels = sheet.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const ids = Object.keys(c.strips).filter(id => !/^mini-/.test(id));
        let fromArt = 0, rotations = 0, opaque = 0;
        const cell = (pixels, width, x, y) => (y * width + x) * 4;
        for (const id of ids.concat(Object.keys(c.tints))) {
          const record = habitat.guestAtlas(id, {speed: 30});
          const tile = record.tile, a = record.atlas, data = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
          const strip = c.strips[id] || c.strips[c.tints[id].base];
          let same = true, turned = true;
          for (let f = 0; f < 4; f++) for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
            const east = cell(data, a.width, f * tile + x, y);
            if (!c.tints[id]) for (let k = 0; k < 4; k++) if (data[east + k] !== sheetPixels[cell(sheetPixels, c.width, strip.x + f * tile + x, strip.y + y) + k]) same = false;
            // A quarter turn clockwise maps (x, y) to (tile - 1 - y, x).
            const south = cell(data, a.width, f * tile + tile - 1 - y, tile + x);
            const west = cell(data, a.width, f * tile + tile - 1 - x, 2 * tile + tile - 1 - y);
            const north = cell(data, a.width, f * tile + y, 3 * tile + tile - 1 - x);
            for (let k = 0; k < 4; k++) if (data[east + k] !== data[south + k] || data[east + k] !== data[west + k] || data[east + k] !== data[north + k]) turned = false;
            if (data[east + 3] === 255) opaque++;
            else if (data[east + 3]) turned = false;
          }
          if (same && !c.tints[id]) fromArt++;
          if (turned) rotations++;
        }
        resolve({ids: ids.length + Object.keys(c.tints).length, plain: ids.length, fromArt, rotations, opaque});
      }; });
    });
    assert.equal(sprites.fromArt, sprites.plain, 'Every walker atlas is cut pixel for pixel from the art strip');
    assert.equal(sprites.rotations, sprites.ids, 'Each atlas holds four exact quarter turns with hard alpha, tinted tiers included');
    assert(sprites.opaque > 10000);

    const walk = await art.evaluate(([everything]) => {
      habitat.destroy();
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      habitat.update(everything);
      const ctx = habitat.ctx, original = ctx.drawImage, atlases = new Set();
      for (const id in habitat.atlases) atlases.add(habitat.atlases[id].atlas);
      habitat.moverRecords.forEach(record => atlases.add(record.atlas));
      let blits = 0, fractional = 0, scaled = 0, smooth = 0, dirs = new Set(), rotated = 0;
      ctx.drawImage = function (source, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (atlases.has(source)) {
          blits++;
          if ([sx, sy, dx, dy, dw, dh].some(v => v !== Math.round(v))) fractional++;
          if (dw % sw || dw !== dh) scaled++;
          if (ctx.imageSmoothingEnabled) smooth++;
          dirs.add(sy / sh);
          const m = ctx.getTransform();
          if (m.a !== 1 || m.b || m.c || m.d !== 1 || m.e || m.f) rotated++;
        }
        return original.apply(this, arguments);
      };
      for (let i = 0; i < 1200; i++) habitat.draw(1 / 30);
      ctx.drawImage = original;
      const d = habitat.diagnostics();
      return {blits, fractional, scaled, smooth, rotated, dirs: Array.from(dirs).sort(), spriteBytes: d.spriteBytes, atlasBytes: d.atlasBytes, budget: d.atlasBudgetBytes, kinds: Object.keys(habitat.atlases).sort(), plan: d.roles.slice().sort(), entities: d.entities, movers: d.nestLife.movers, sheetBytes: d.creatureSheetBytes};
    }, [everything]);
    assert(walk.blits > 30000, 'Walkers are drawn from the baked atlases');
    assert.equal(walk.fractional, 0, 'Every walker lands on whole pixels');
    assert.equal(walk.scaled, 0, 'Walkers are only ever drawn at whole-number scales');
    assert.equal(walk.smooth, 0, 'Walkers are drawn without smoothing');
    assert.equal(walk.rotated, 0, 'Nothing is rotated per draw');
    assert(walk.dirs.every(function (dir) { return dir === (dir | 0) && dir >= 0 && dir < 8; }) && walk.dirs.indexOf(0) !== -1 && walk.dirs.some(function (dir) { return dir >= 4; }), 'Walkers use a compass point or the diagonal beside it, and a diagonal shows up on the bowed lanes: ' + walk.dirs);
    assert.deepEqual(walk.kinds, walk.plan, 'Atlases are baked only for the species on screen');
    assert(walk.atlasBytes <= walk.budget && walk.spriteBytes <= walk.budget + 600 * 1024, 'Baked sprite memory stays bounded: ' + walk.spriteBytes);
    assert(walk.sheetBytes <= 1200 * 1024, 'The decoded creature sheet stays small');
    assert(walk.entities <= 64 && walk.movers >= 2 && walk.movers <= 10, 'Nest movers are extra, capped, and never take lane seats');

    // A single walker on bare ground: every opaque atlas pixel reaches the screen unchanged.
    const exact = await art.evaluate(() => {
      habitat.destroy();
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.update({populationExact:'1', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'1'}], resources:[]});
      habitat.motes.setCap(0);
      habitat.showGolden(true);
      habitat.movers = 0;
      const ctx = habitat.ctx, original = ctx.drawImage, calls = [];
      ctx.drawImage = function (source, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (source === habitat.guestAtlases.golden.atlas || source === habitat.atlases.drone.atlas) calls.push({source, sx, sy, sw, dx, dy, dw});
        return original.apply(this, arguments);
      };
      habitat.draw(1 / 30);
      ctx.drawImage = original;
      let checked = 0, wrong = 0;
      const scales = [];
      for (const call of calls) {
        const k = call.dw / call.sw;
        scales.push(k);
        const cellData = call.source.getContext('2d').getImageData(call.sx, call.sy, call.sw, call.sw).data;
        const screen = ctx.getImageData(call.dx, call.dy, call.dw, call.dw).data;
        for (let y = 0; y < call.dw; y++) for (let x = 0; x < call.dw; x++) {
          const a = ((y / k | 0) * call.sw + (x / k | 0)) * 4, b = (y * call.dw + x) * 4;
          if (cellData[a + 3] !== 255) continue;
          checked++;
          for (let c = 0; c < 4; c++) if (cellData[a + c] !== screen[b + c]) { wrong++; break; }
        }
      }
      return {checked, wrong, scales: scales.sort()};
    });
    assert.deepEqual(exact.scales, [1, 2], 'The golden roach is drawn at 1:1 and the small lead forager at exactly 2x');
    assert(exact.checked > 500 && exact.wrong === 0, 'Opaque sprite pixels map 1:1 to the screen: ' + JSON.stringify(exact));

    // The mote pool: bounded, cleared on hide, and never inside the centre of the picture.
    const pool = await art.evaluate(() => {
      const m = habitat.motes, w = habitat.canvas.width, h = habitat.canvas.height;
      m.setCap(64);
      for (let i = 0; i < 50; i++) m.emit(RoachMotes.DUST, 40, h - 40, 10, 40, -1.5, 3, 2);
      const capped = m.stats().live;
      m.clear();
      m.emit(RoachMotes.EMBER, 40, h - 40, 60, 20, 0, 0, 0);
      const ambient = m.stats().live;
      m.clear();
      m.emit(RoachMotes.CRUMB, w / 2, h / 2, 5, 10, 0, 1, 2);
      m.step(1 / 30, w, h);
      const centre = m.stats().live;
      // Embers thrown hard toward the middle die at the centre's edge.
      for (let k = 0; k < 20; k++) m.emit(RoachMotes.EMBER, w * 0.19, h * 0.5, 1, 600, 0, 0, 2);
      let inside = 0;
      for (let f = 0; f < 30; f++) { m.step(1 / 30, w, h); for (let i = 0; i < m.count; i++) if (m.x[i] > w * .2 && m.x[i] < w * .8 && m.y[i] > h * .2 && m.y[i] < h * .8) inside++; }
      m.emit(RoachMotes.DUST, 40, h - 40, 10, 40, -1.5, 3, 2);
      habitat.setActive(false);
      const hidden = m.stats().live;
      const hiddenCue = habitat.cue('forage');
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      return {capped, ambient, centre, inside, hidden, hiddenCue, max: RoachMotes.MAX};
    });
    assert.equal(pool.capped, 64, 'Events fill the pool only up to its cap');
    assert.equal(pool.ambient, 32, 'Ambient motes leave half the pool for events');
    assert.equal(pool.centre, 0, 'A mote in the centre of the picture is removed at once');
    assert.equal(pool.inside, 0, 'No mote ever lives inside the centre');
    assert.equal(pool.hidden, 0, 'Hiding the colony clears every mote');
    assert.equal(pool.hiddenCue, false, 'Cues do nothing while hidden');

    // A late colony at night with the real nest art, its interior movers, and the feedback cues.
    const night = await art.evaluate(async ([everything]) => {
      habitat.destroy();
      const state = {stage:5, hatchery:12, expansion:12, nexus:5, mutation:2, crumbs:12, pennants:[]};
      await new Promise(resolve => { (function poll() { if (RoachNestArt.ready(state)) resolve(); else setTimeout(poll, 20); })(); });
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      habitat.update(Object.assign({}, everything, {resources: everything.resources.map(r => Object.assign({rate: r.id === 'meat' ? '1e900' : '1e20'}, r))}));
      habitat.setNight(true);
      const paths = RoachNestArt.paths(state, 1);
      const b = habitat.diagnostics().base;
      const near = (m) => {
        const t = paths.tunnels[m.tunnel], chamber = paths.chambers[m.tunnel];
        if (!m.dir) return Math.abs(m.y - chamber.y) <= 1 && Math.abs(m.x - chamber.x) <= chamber.r;
        let best = Infinity;
        for (let k = 1; k < t.length; k++) {
          const [ax, ay] = t[k - 1], [bx, by] = t[k], len = Math.hypot(bx - ax, by - ay) || 1;
          const u = Math.max(0, Math.min(1, ((m.x - ax) * (bx - ax) + (m.y - ay) * (by - ay)) / (len * len)));
          best = Math.min(best, Math.hypot(m.x - ax - u * (bx - ax), m.y - ay - u * (by - ay)));
        }
        return best <= 1.5;
      };
      let off = 0, outside = 0, samples = 0, maxMovers = 0, maxEntities = 0;
      const moverMs = [];
      const draw = habitat.drawMovers;
      habitat.drawMovers = function (delta) { const s = performance.now(); draw.call(this, delta); moverMs.push(performance.now() - s); };
      for (let f = 0; f < 90 * 30; f++) {
        habitat.draw(1 / 30);
        if (f % 10) continue;
        const d = habitat.diagnostics();
        maxEntities = Math.max(maxEntities, d.entities);
        maxMovers = Math.max(maxMovers, d.nestLife.movers);
        for (const m of habitat.nestMovers()) {
          samples++;
          if (!near(m)) off++;
          if (m.x < 0 || m.y < 0 || m.x > b.width || m.y > b.height) outside++;
        }
      }
      habitat.drawMovers = draw;
      const d = habitat.diagnostics();
      return {off, outside, samples, maxMovers, maxEntities, handoffs: d.nestLife.handoffs, emitted: d.motes.emitted, kinds: d.motes.kinds, moverMs: moverMs.reduce((a, b) => a + b, 0) / moverMs.length, base: b, tunnels: d.nestLife.tunnels};
    }, [everything]);
    assert(night.samples > 1000 && night.off === 0, 'Nest movers stay on the traced tunnels and chamber floors: ' + JSON.stringify(night));
    assert.equal(night.outside, 0, 'Nest movers stay inside the nest bitmap');
    assert(night.maxMovers >= 2 && night.maxMovers <= 10 && night.maxEntities <= 64, 'Movers are capped and lane entities stay within 64');
    assert(night.emitted > 20, 'Foragers and the night shift emit motes');
    console.log(JSON.stringify({nestMoverMs: night.moverMs, handoffs: night.handoffs, motes: night.emitted}));
    await art.screenshot({path:path.join(finalQa, 'late-colony-1920.png')});
    const nest = night.base;
    await art.evaluate(() => { habitat.cue('ascend'); habitat.cue('milestone'); for (let i = 0; i < 4; i++) habitat.draw(1 / 30); });
    await art.screenshot({path:path.join(finalQa, 'nest-interior-x1.png'), clip:{x:nest.x, y:nest.y, width:nest.width, height:nest.height}});
    const zoom = async (name, clip, scale = 3) => {
      const png = await art.screenshot({clip});
      const view = await browser.newPage({viewport:{width:clip.width * scale, height:clip.height * scale}});
      await view.setContent(`<body style="margin:0"><img src="data:image/png;base64,${png.toString('base64')}" style="width:${clip.width * scale}px;image-rendering:pixelated"></body>`);
      await view.screenshot({path:path.join(finalQa, name)});
      await view.close();
    };
    await zoom('nest-interior-x3.png', {x:nest.x, y:nest.y, width:nest.width, height:nest.height});
    await zoom('walkers-top-x3.png', {x:600, y:0, width:600, height:180});
    await zoom('walkers-left-x3.png', {x:0, y:300, width:240, height:420});
    // A mid-game colony with foragers on the supply line: crumbs set down at the entrance are carried inside.
    const supply = await art.evaluate(() => {
      const snap = {populationExact:'1e9', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'100000000'},{id:'queen',tier:2,owned:true,countExact:'5000'},{id:'swarmling',tier:1,owned:true,countExact:'1000000'},{id:'nightbug',tier:1,owned:true,countExact:'900'}], resources:[{id:'meat',amount:'1e7',rate:'1e5'},{id:'larva',amount:'500',rate:'30'},{id:'territory',amount:'1e5',rate:'10'}], upgradeLevels:{hatchery:'20', expansion:'12', nexus1:'1'}};
      habitat.update(snap);
      const before = habitat.diagnostics().nestLife.handoffs;
      let carriers = 0;
      for (let f = 0; f < 150 * 30; f++) { habitat.draw(1 / 30); if (f % 30 === 29) habitat.update(snap); if (f % 10 === 0) carriers += habitat.nestMovers().filter(m => m.cargo).length; }
      return {handoffs: habitat.diagnostics().nestLife.handoffs - before, carriers};
    });
    assert(supply.handoffs > 0 && supply.carriers > 0, 'Foragers hand crumbs to inner workers at the entrance: ' + JSON.stringify(supply));
    // Red's forage cue at the far end of the supply line, a purchase's dust puff at the entrance, and a parade's embers.
    const cueAt = await art.evaluate(() => {
      habitat.motes.clear();
      habitat.cues = {};
      const ok = habitat.cue('forage');
      const at = {x: habitat.ahead.x, y: habitat.ahead.y};
      habitat.draw(1 / 30); habitat.draw(1 / 30); habitat.draw(1 / 30);
      return {ok, live: habitat.motes.stats().live, x: at.x, y: at.y};
    });
    assert(cueAt.ok && cueAt.live >= 4, 'Red\'s forage cue scatters crumbs at the far end of the supply line');
    await zoom('cue-forage-x3.png', {x:Math.max(0, Math.round(cueAt.x) - 100), y:Math.min(1080 - 140, Math.round(cueAt.y) - 90), width:200, height:140});
    const puffAt = await art.evaluate(() => {
      habitat.motes.clear();
      habitat.burstAt = -1e9;
      habitat.burst(['drone'], []);
      for (let i = 0; i < 5; i++) habitat.draw(1 / 30);
      return {x: habitat.baseX + habitat.entryX, y: habitat.baseY + habitat.entryY, dust: habitat.motes.stats().kinds[RoachMotes.DUST]};
    });
    assert(puffAt.dust >= 5, 'A purchase puffs dust out of the nest entrance');
    await zoom('purchase-dust-x3.png', {x:Math.max(0, Math.round(puffAt.x) - 110), y:Math.round(puffAt.y) - 100, width:220, height:Math.min(140, 1080 - Math.round(puffAt.y) + 100)});
    // Ambient nest dust: about one speck per 1.5 s near the nest at full and balanced quality, none at lean or while hidden.
    const nestDust = await art.evaluate(() => {
      const run = (level, seconds) => {
        habitat.motes.clear();
        habitat.level = level;
        habitat.motes.setCap([64, 40, 20][level]);
        const before = habitat.diagnostics().nestDust.spawned;
        const b = habitat.diagnostics().base, w = habitat.canvas.width, h = habitat.canvas.height;
        let maxLive = 0, far = 0, inside = 0;
        for (let f = 0; f < seconds * 30; f++) {
          habitat.draw(1 / 30);
          const m = habitat.motes;
          for (let k = 0; k < m.count; k++) {
            if (m.kind[k] !== RoachMotes.SPECK) continue;
            if (m.x[k] < b.x - 40 || m.x[k] > b.x + b.width + 40 || m.y[k] < b.y - 40 || m.y[k] > b.y + b.height + 40) far++;
            if (m.x[k] > w * .2 && m.x[k] < w * .8 && m.y[k] > h * .2 && m.y[k] < h * .8) inside++;
          }
          maxLive = Math.max(maxLive, habitat.diagnostics().nestDust.live);
        }
        const d = habitat.diagnostics().nestDust;
        return {on: d.on, spawned: d.spawned - before, maxLive, far, inside};
      };
      const full = run(0, 30), balanced = run(1, 30), lean = run(2, 30);
      habitat.level = 0;
      habitat.motes.setCap(64);
      habitat.setActive(false);
      const before = habitat.nestDust;
      habitat.draw(1 / 30); habitat.draw(2);
      const hidden = {spawned: habitat.nestDust - before, live: habitat.motes.stats().live};
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      return {full, balanced, lean, hidden};
    });
    assert(nestDust.full.on && nestDust.full.spawned >= 15 && nestDust.full.spawned <= 26, 'Nest dust spawns about once per 1.5 s at full quality: ' + JSON.stringify(nestDust));
    assert(nestDust.balanced.on && nestDust.balanced.spawned >= 15, 'Nest dust stays on at balanced quality');
    assert(!nestDust.lean.on && nestDust.lean.spawned === 0, 'Nest dust is off at lean quality');
    assert(nestDust.full.maxLive <= 4 && nestDust.full.far === 0 && nestDust.full.inside === 0, 'Nest dust is sparse, stays by the nest and never enters the centre');
    assert.deepEqual(nestDust.hidden, {spawned: 0, live: 0}, 'No nest dust while hidden');
    const lap = await art.evaluate(() => {
      habitat.motes.clear();
      habitat.paradeUntil = 0;
      const lead = habitat.kinds[habitat.kind[habitat.lead]].id;
      habitat.role[habitat.lead] = 0;
      habitat.parade(lead);
      for (let i = 0; i < 75; i++) habitat.draw(1 / 30);
      let x = 0, y = 0;
      for (let k = 0; k < habitat.motes.count; k++) if (habitat.motes.kind[k] === RoachMotes.EMBER) { x = habitat.motes.x[k]; y = habitat.motes.y[k]; }
      return {embers: habitat.motes.stats().kinds[RoachMotes.EMBER], x, y};
    });
    assert(lap.embers >= 3, 'A parade leaves an ember trail');
    await zoom('parade-embers-x3.png', {x:Math.max(0, Math.min(1920 - 240, Math.round(lap.x) - 120)), y:Math.max(0, Math.min(1080 - 160, Math.round(lap.y) - 80)), width:240, height:160});
    // The floor layer holds the ground, trail and nest and is repainted only after one of them re-bakes; the moving
    // layer clears just last frame's rectangles, which must match a full clear and redraw pixel for pixel.
    const layers = await art.evaluate(([everything]) => {
      const original = RoachHabitat.critterCanvas;
      RoachHabitat.critterCanvas = (slug, px) => { const c = document.createElement('canvas'); c.width = c.height = px; c.getContext('2d').fillStyle = '#c84'; c.getContext('2d').fillRect(0, px * 0.3, px, px * 0.4); return c; };
      habitat.update(everything);
      habitat.setNight(true); habitat.showGolden(true); habitat.showVisitor('monarch-butterfly', 45, 1); habitat.showIntruder('spider', 10);
      habitat.draw(1 / 30);
      const paints = () => habitat.diagnostics().floorPaints;
      const start = paints();
      for (let i = 0; i < 300; i++) { habitat.draw(1 / 30); if (i % 30 === 29) habitat.update(everything); }
      const routine = paints();
      const bakesBefore = habitat.diagnostics().groundBakes;
      habitat.update(Object.assign({}, everything, {resources: everything.resources.map(r => r.id === 'territory' ? {id: 'territory', amount: '1e10'} : r)}));
      const bakes = habitat.diagnostics().groundBakes - bakesBefore;
      const pending = paints();
      habitat.draw(1 / 30); habitat.draw(1 / 30);
      const afterGround = paints();
      habitat.setNight(false); habitat.draw(1 / 30);
      const afterNest = paints();
      const w = habitat.canvas.width, h = habitat.canvas.height;
      const fullBefore = habitat.diagnostics().fullClears;
      const pixels = canvas => canvas.getContext('2d').getImageData(0, 0, w, h).data;
      let checks = 0, stale = 0;
      for (let round = 0; round < 12; round++) {
        if (round === 4) habitat.parade(habitat.kinds[habitat.kind[habitat.lead]].id);
        if (round === 8) habitat.cue('ascend');
        for (let i = 0; i < 20; i++) habitat.draw(1 / 30);
        // A still frame through the dirty rectangles, then the same frame after a full clear.
        habitat.draw(0);
        const dirty = pixels(habitat.canvas);
        habitat.overflow = true;
        habitat.draw(0);
        const full = pixels(habitat.canvas);
        for (let k = 0; k < full.length; k++) if (dirty[k] !== full[k]) stale++;
        checks++;
      }
      const overflows = habitat.diagnostics().fullClears - fullBefore - checks;
      // An exclusion over the bottom edge, where walkers, motes and ground marks all are, stays clear on both layers.
      const zone = {left: 500, top: h - 200, right: 1400, bottom: h};
      habitat.setExclusions([zone, document.getElementById('panel').getBoundingClientRect()]);
      let excluded = 0, centre = 0;
      for (let i = 0; i < 90; i++) {
        habitat.draw(1 / 30);
        if (i % 15) continue;
        for (const canvas of [habitat.floor, habitat.canvas]) {
          const g = canvas.getContext('2d');
          const a = g.getImageData(zone.left, zone.top, zone.right - zone.left, zone.bottom - zone.top).data;
          for (let k = 3; k < a.length; k += 4) if (a[k]) excluded++;
          const c = g.getImageData(Math.ceil(w * .2), Math.ceil(h * .2), Math.floor(w * .6), Math.floor(h * .6)).data;
          for (let k = 3; k < c.length; k += 4) if (c[k]) centre++;
        }
      }
      const floorPixels = pixels(habitat.floor);
      let floorOpaque = 0;
      for (let k = 3; k < floorPixels.length; k += 4) if (floorPixels[k]) floorOpaque++;
      RoachHabitat.critterCanvas = original;
      habitat.showGolden(false); habitat.showVisitor(null); habitat.showIntruder(null);
      return {start, routine, bakes, pending, afterGround, afterNest, checks, stale, overflows, excluded, centre, floorOpaque, inDom: habitat.floor.parentNode === habitat.canvas.parentNode && habitat.floor.nextSibling === habitat.canvas};
    }, [everything]);
    assert(layers.inDom, 'The floor layer sits directly under the moving canvas');
    assert.equal(layers.routine, layers.start, 'Frames and routine updates never repaint the floor: ' + JSON.stringify(layers));
    assert.equal(layers.bakes, 1, 'The territory step re-bakes the ground');
    assert.equal(layers.pending, layers.routine, 'A re-bake repaints the floor on the next frame, not during the update');
    assert.equal(layers.afterGround, layers.pending + 1, 'A ground re-bake repaints the floor exactly once');
    assert.equal(layers.afterNest, layers.afterGround + 1, 'A nest re-bake repaints the floor exactly once');
    assert(layers.floorOpaque > 5000, 'The floor holds the ground marks and the nest: ' + JSON.stringify(layers));
    assert.equal(layers.stale, 0, 'Clearing last frame\'s rectangles leaves the same pixels as a full clear: ' + JSON.stringify(layers));
    assert.equal(layers.overflows, 0, 'A late colony with every guest fits the dirty rectangle list');
    assert.equal(layers.excluded, 0, 'Exclusions stay transparent on both layers');
    assert.equal(layers.centre, 0, 'The centre stays transparent on both layers');
    // Chance events with the real event sprites: a snack drop, an egg case, a molting roach, a nuptial flight and the
    // ascension ceremony. Each borrows seats within the cap, keeps the centre clear and leaves nothing behind.
    await art.waitForFunction(() => { const c = RoachHabitat.critterCanvas('event_egg_case', 64); return c.getContext('2d').getImageData(0, 0, 64, 64).data.some((v, k) => k % 4 === 3 && v); });
    const chance = await art.evaluate(([everything, early]) => {
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      habitat.update(everything);
      for (let i = 0; i < 60; i++) habitat.draw(1 / 30);
      const w = habitat.canvas.width, h = habitat.canvas.height;
      const d = () => habitat.diagnostics();
      let centre = 0, peak = 0;
      const frames = (n, check) => {
        for (let i = 0; i < n; i++) {
          habitat.draw(1 / 30);
          peak = Math.max(peak, d().entities);
          if (i % 45) continue;
          const c = habitat.canvas.getContext('2d').getImageData(Math.ceil(w * .2), Math.ceil(h * .2), Math.floor(w * .6), Math.floor(h * .6)).data;
          for (let k = 3; k < c.length; k += 4) if (c[k]) centre++;
          if (check) check();
        }
      };
      const sprite = name => RoachHabitat.critterCanvas('event_' + name, 64);
      const ctx = habitat.ctx, drawImage = ctx.drawImage;
      const drawn = {};
      ctx.drawImage = function (source) { for (const name in drawn) if (source === sprite(name) || source === RoachHabitat.critterCanvas('event_' + name, 64, true)) drawn[name]++; return drawImage.apply(this, arguments); };
      const out = {};
      // Snack: lands at the edge, foragers carry it home in pieces, and the bonus is the page's job.
      const handoff = habitat.handoff;
      let handoffs = 0;
      habitat.handoff = function () { handoffs++; return handoff.apply(this, arguments); };
      drawn.snack_chip = 0;
      out.snackShown = habitat.showChance('snack', 'snack_chip', 30);
      const snack = d();
      let bites = [];
      frames(30 * 29, () => bites.push(d().chance.bite));
      out.snack = {entities: snack.entities, at: snack.chance.at, carrying: snack.chance.carrying, seats: snack.chance.seats, bites, handoffs, drawn: drawn.snack_chip};
      habitat.endChance('snack', false);
      out.snackAfter = {chance: d().chance, entities: d().entities, phases: Array.from(habitat.phase.subarray(0, habitat.count)).every(v => v >= 0 && v < 1)};
      habitat.handoff = handoff;
      // Egg case: tucked in a corner under the Red cue, hatched by Red into hatchlings.
      drawn.egg_case = 0;
      out.eggShown = habitat.showChance('egg', 'egg_case', 75);
      frames(30);
      out.egg = {at: d().chance.at, cue: d().redCue, catchable: d().chance.catchable, base: d().base, drawn: drawn.egg_case};
      habitat.showGolden(true);
      frames(5);
      out.eggWithGolden = {cue: d().redCue, golden: d().guests.goldenAt};
      habitat.showGolden(false);
      habitat.endChance('egg', true);
      out.hatching = d().chance.hatching;
      // Each walks from the egg case to its own lane at a hatchling's pace.
      for (let s = 0; s < 8 && (s < 3 || d().chance.hatching); s++) frames(30);
      out.hatched = {chance: d().chance.kind, hatching: d().chance.hatching, events: d().events.hatched, cue: d().redCue};
      // Left alone, two carriers take it into the nest along the lane.
      habitat.showChance('egg', 'egg_case', 75);
      const placed = d().chance.at;
      habitat.endChance('egg', false);
      const trail = [];
      const original = ctx.drawImage;
      ctx.drawImage = function (source, x, y) { if (source === sprite('egg_case') && arguments.length === 3) trail.push([x + 32, y + 32]); return original.apply(this, arguments); };
      frames(30 * 2);
      const carrying = d().chance.carrying;
      // They walk to it and carry it home at their own pace, so a far one takes a while.
      for (let s = 0; s < 120 && d().chance.kind; s++) frames(30);
      ctx.drawImage = original;
      out.carried = {placed, carrying, moved: trail.some(p => Math.abs(p[0] - placed[0]) + Math.abs(p[1] - placed[1]) > 40), cue: d().redCue, chance: d().chance.kind, left: d().chance.carrying};
      // Molting roach: pale beside the nest with its husk; uncaught it darkens and walks off; the husk stays a while.
      drawn.molting_roach = drawn.molt_husk = 0;
      out.moltShown = habitat.showChance('molt', 'molting_roach', 50);
      frames(20);
      out.molt = {at: d().chance.at, husk: d().chance.husk, seats: d().chance.seats, entities: d().entities, cue: d().redCue, base: d().base, drawn: [drawn.molting_roach, drawn.molt_husk]};
      habitat.endChance('molt', false);
      frames(30 * 7);
      out.molted = {chance: d().chance.kind, husk: !!d().chance.husk, seats: d().chance.seats, cue: d().redCue};
      frames(30 * 21);
      out.husked = {husk: d().chance.husk, seats: d().chance.seats, entities: d().entities};
      habitat.showChance('molt', 'molting_roach', 50);
      habitat.endChance('molt', true);
      // It hurries in at twice the pace it would walk off at.
      for (let s = 0; s < 8 && d().chance.kind; s++) frames(30);
      out.moltCaught = {chance: d().chance.kind, husk: !!d().chance.husk};
      // Nuptial flight: only at night, at most once in five minutes, three flyers off the near edge.
      habitat.setNight(false);
      out.dayFlight = habitat.nuptialFlight();
      habitat.setNight(true);
      drawn.winged_roach_1 = drawn.winged_roach_2 = 0;
      out.nightFlight = habitat.nuptialFlight();
      out.flight = {seats: d().chance.seats - (d().chance.husk ? 1 : 0), entities: d().entities, again: habitat.nuptialFlight()};
      frames(30 * 5);
      out.flown = {flight: d().chance.flight, seats: d().chance.seats - (d().chance.husk ? 1 : 0), frames: [drawn.winged_roach_1, drawn.winged_roach_2]};
      habitat.setNight(false);
      ctx.drawImage = drawImage;
      // Ascension ceremony: the colony files in, the reset colony waits, the nest returns to its first stage and a
      // fresh pair walks out.
      const lateBase = d().base.key;
      out.ceremonyStarted = habitat.ascendCeremony();
      const filing = d().chance.filing;
      habitat.update(early);
      const held = {allocation: d().allocation, base: d().base.key};
      frames(30 * 2.3);
      const opened = {ceremony: d().chance.ceremony, allocation: d().allocation, base: d().base.key, emerging: d().events.emerging, waiting: d().chance.waiting};
      frames(30 * 2);
      out.ceremony = {lateBase, filing, held, opened, after: {ceremony: d().chance.ceremony, waiting: d().chance.waiting, filing: d().chance.filing}};
      // Hiding drops every event and applies a held ascension at once.
      habitat.update(everything);
      frames(30);
      habitat.showChance('egg', 'egg_case', 75);
      habitat.endChance('egg', false);
      habitat.setNight(true); habitat.flightNext = 0; habitat.nuptialFlight();
      habitat.setActive(false);
      out.hidden = {chance: d().chance, entities: d().entities, roles: Array.from(habitat.role.subarray(0, habitat.count)).filter(Boolean).length};
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.ascendCeremony();
      habitat.update(early);
      habitat.setActive(false);
      out.hiddenCeremony = {ceremony: d().chance.ceremony, allocation: d().allocation};
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.setNight(false);
      out.centre = centre;
      out.peak = peak;
      out.size = [w, h];
      return out;
    }, [everything, early]);
    const [cw, ch] = chance.size;
    const corner = ([x, y]) => (x < cw * 0.2 || x > cw * 0.8) && (y < ch * 0.2 || y > ch * 0.8);
    const edge = ([x, y]) => x < cw * 0.2 || x > cw * 0.8 || y < ch * 0.2 || y > ch * 0.8;
    const nearNest = ([x, y], base, reach) => x > base.x - reach && x < base.x + base.width + reach && y > base.y - reach && y < base.y + base.height + reach;
    assert.equal(chance.centre, 0, 'Chance events keep the centre of the picture clear');
    assert(chance.peak <= 64, 'Events borrow seats instead of adding entities: ' + chance.peak);
    assert.equal(chance.snackShown, true);
    assert(edge(chance.snack.at), 'The snack lands at a screen edge: ' + chance.snack.at);
    assert.equal(chance.snack.entities, 64);
    assert.equal(chance.snack.seats, 1);
    assert(chance.snack.carrying >= 2 && chance.snack.carrying <= 6, 'A few foragers swarm the snack: ' + chance.snack.carrying);
    assert(chance.snack.bites.every((b, k, list) => !k || b >= list[k - 1]) && chance.snack.bites[chance.snack.bites.length - 1] >= 7, 'The snack shrinks in whole steps: ' + chance.snack.bites);
    // A late colony's carriers are slow high tiers walking at their own pace, so only a piece or two is home in time.
    assert(chance.snack.handoffs >= 1, 'Carriers set pieces down at the nest door: ' + chance.snack.handoffs);
    assert(chance.snack.drawn > 0, 'The snack sprite is drawn');
    assert.equal(chance.snackAfter.chance.kind, '');
    assert.equal(chance.snackAfter.chance.carrying, 0, 'The carriers walk on once the snack is home');
    assert(chance.snackAfter.phases, 'Released carriers keep normalised lap positions');
    assert.equal(chance.eggShown, true);
    assert(corner(chance.egg.at) && !nearNest(chance.egg.at, chance.egg.base, 40), 'The egg case is tucked in a corner away from the nest: ' + chance.egg.at);
    assert(chance.egg.catchable && chance.egg.drawn > 0);
    assert(chance.egg.cue && Math.abs(chance.egg.cue[0] + 16 - chance.egg.at[0]) <= 1 && chance.egg.cue[1] < chance.egg.at[1], 'The Red cue sits over the egg case: ' + chance.egg.cue);
    assert(Math.abs(chance.eggWithGolden.cue[0] + 16 - chance.eggWithGolden.golden[0]) <= 1, 'A golden roach takes the cue from the egg case');
    assert(chance.hatching >= 1 && chance.hatching <= 3, 'A few hatchlings come out of a hatched egg case');
    assert.deepEqual([chance.hatched.chance, chance.hatched.hatching, chance.hatched.events, chance.hatched.cue], ['', 0, 1, null], 'Hatchlings join the lane and the cue goes');
    assert.equal(chance.carried.carrying, 2, 'Two carriers fetch an uncaught egg case');
    assert(chance.carried.moved, 'They carry it along the lane');
    assert.deepEqual([chance.carried.chance, chance.carried.left, chance.carried.cue], ['', 0, null], 'It goes into the nest and they return to work');
    assert.equal(chance.moltShown, true);
    assert(nearNest(chance.molt.at, chance.molt.base, 260) && chance.molt.husk, 'The molting roach rests near the nest with its husk: ' + JSON.stringify(chance.molt));
    assert.equal(chance.molt.seats, 2);
    assert.equal(chance.molt.entities, 64);
    assert(chance.molt.drawn[0] > 0 && chance.molt.drawn[1] > 0, JSON.stringify(chance.molt));
    assert(chance.molt.cue && Math.abs(chance.molt.cue[0] + 16 - chance.molt.at[0]) <= 1, 'The Red cue sits over the molting roach');
    assert.deepEqual(chance.molted, {chance: '', husk: true, seats: 1, cue: null}, 'Uncaught, it walks off and leaves the husk');
    assert.deepEqual([chance.husked.husk, chance.husked.seats, chance.husked.entities], [null, 0, 64], 'The husk goes after a while and the seat returns');
    assert.deepEqual(chance.moltCaught, {chance: '', husk: true}, 'Caught, it walks into the nest');
    assert.equal(chance.dayFlight, false, 'No nuptial flight by day');
    assert.equal(chance.nightFlight, true);
    assert.deepEqual(chance.flight, {seats: 3, entities: 64, again: false}, 'Three flyers borrow seats, and a second flight waits');
    assert.equal(chance.flown.flight, null);
    assert.equal(chance.flown.seats, 0);
    assert(chance.flown.frames[0] > 0 && chance.flown.frames[1] > 0, 'The wings flap between both frames');
    assert.equal(chance.ceremonyStarted, true);
    assert(chance.ceremony.filing > 20, 'The colony files into the nest: ' + chance.ceremony.filing);
    assert(chance.ceremony.held.allocation.overmind6 > 0 && chance.ceremony.held.base === chance.ceremony.lateBase, 'The reset colony waits while it files in');
    assert.equal(chance.ceremony.opened.ceremony, 'out');
    assert(!chance.ceremony.opened.allocation.overmind6 && chance.ceremony.opened.base !== chance.ceremony.lateBase, 'The nest returns to its first stage');
    assert.equal(chance.ceremony.opened.emerging, 2, 'A fresh pair walks out');
    assert.deepEqual(chance.ceremony.after, {ceremony: '', waiting: 0, filing: 0}, 'Normal play resumes within four seconds');
    assert.deepEqual([chance.hidden.chance.seats, chance.hidden.chance.kind, chance.hidden.chance.flight, chance.hidden.roles], [0, '', null, 0], 'Hiding sends every event away');
    assert.deepEqual([chance.hiddenCeremony.ceremony, !chance.hiddenCeremony.allocation.overmind6], ['', true], 'Hiding applies a held ascension at once');
    assert.deepEqual(artErrors, []);
    await art.close();

    // Lane manners: matched pace, single file at the nest door, greetings, crumb handoffs and giving way.
    const lanes = await browser.newPage({viewport:{width:1920,height:1080}});
    const laneErrors = [];
    lanes.on('pageerror', error => laneErrors.push(error.message));
    await lanes.setContent('<style>html,body{margin:0;height:100%;background:linear-gradient(160deg,#2c3036,#45474c 55%,#25282d)}canvas{position:fixed;left:0;top:0;width:100%;height:100%}#panel{position:fixed;right:24px;bottom:24px;width:480px;height:150px;background:rgba(14,12,10,.72);border-radius:12px;color:#eee;font:24px sans-serif;padding:16px;box-sizing:border-box}</style><canvas></canvas><div id="panel">Roach Colony</div>');
    for (const name of ['nest-sprites.js', 'nest-art.js', 'critters.js']) await lanes.addScriptTag({path:path.resolve(__dirname, '../app', name)});
    await addHabitat(lanes);
    // A 4x enlargement of a square around a point of the habitat, which draws at 1:1 at 1080p.
    const enlargeLane = async (name, point, size = 160) => {
      const clip = {x:Math.max(0, Math.min(1920 - size, Math.round(point.x - size / 2))), y:Math.max(0, Math.min(1080 - size, Math.round(point.y - size / 2))), width:size, height:size};
      const png = await lanes.screenshot({clip});
      const view = await browser.newPage({viewport:{width:size * 4, height:size * 4}});
      await view.setContent(`<body style="margin:0"><img src="data:image/png;base64,${png.toString('base64')}" style="width:${size * 4}px;image-rendering:pixelated"></body>`);
      await view.screenshot({path:path.join(output, name)});
      await view.close();
    };
    await lanes.evaluate(() => {
      window.habitat = new RoachHabitat(document.querySelector('canvas'));
      habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      habitat.setExclusions([document.getElementById('panel').getBoundingClientRect()]);
      // Top income staffs five foragers, so homebound and outbound ones meet on the supply line.
      const snap = {populationExact:'1e9', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'100000000'},{id:'queen',tier:2,owned:true,countExact:'5000'},{id:'swarmling',tier:1,owned:true,countExact:'1000000'},{id:'stinger',tier:2,owned:true,countExact:'2000'},{id:'nightbug',tier:1,owned:true,countExact:'900'}], resources:[{id:'meat',amount:'1e400',rate:'1e400'},{id:'larva',amount:'500',rate:'30'},{id:'territory',amount:'1e5',rate:'10'}], upgradeLevels:{hatchery:'20', expansion:'12', nexus1:'1'}};
      const h = habitat;
      const tile = i => h.kinds[h.kind[i]].tile;
      const t = {snap, frames:0, greetings:[], handoffs:[], badHandoffs:0, stillBroken:0, doorMin:Infinity, doorPairs:0, convoyMin:Infinity, convoyChecks:0, returnMax:0, returning:new Float64Array(64), prevFront:new Int8Array(64).fill(-1), together:new Float64Array(64), convoyGaps:[], waitMoved:0, maxWaiting:0, maxShow:0, centre:0, parted:0, procession:0};
      // Door users: emergers on their way out, and foragers coming in, resting at the door or just leaving it.
      const doorUser = i => {
        // An emerger walks out at its own pace and holds the role until it stands on its lane spot.
        if (h.role[i] === 1) return h.clock >= h.roleStart[i] + h.roleIndex[i] * 0.3;
        if (h.role[i] || h.job[i] !== 1) return false;
        const along = 2 * (h.canvas.width + h.canvas.height - 4 * h.inset[i] - 140) + Math.PI * 70;
        if (h.jobState[i] === 3) return true;
        if (h.jobState[i] === 2) return (h.routes.forage.span - h.travel[i]) * along <= tile(i) * 2 + 6;
        return h.jobState[i] === 0 && h.travel[i] * along <= tile(i) * 1.2;
      };
      let prevState = new Uint8Array(64), prevPhase = new Float64Array(64), prevWait = new Uint8Array(64);
      t.step = () => {
        const before = h.behaviors.greetings, handed = h.behaviors.handoffs;
        prevState.set(h.jobState); prevPhase.set(h.phase); prevWait.set(h.doorWait);
        // As tick() does, so roamers drift between lanes and take their pauses.
        h.elapsed += 1 / 30;
        h.draw(1 / 30);
        if (++t.frames % 30 === 0) h.update(t.snap);
        const b = h.behaviors;
        if (b.greetings > before) {
          const procession = h.lead >= 0 && h.job[h.lead] === 3;
          t.greetings.push({at:h.clock, a:h.greetA, b:h.greetB, phases:[h.phase[h.greetA], h.phase[h.greetB]], busy:h.clock < h.paradeUntil || h.clock < h.caravanUntil || procession || !!h.intruder, resolved:false});
        }
        for (const g of t.greetings) {
          const age = h.clock - g.at;
          if (age < 0.55 && (h.phase[g.a] !== g.phases[0] || h.phase[g.b] !== g.phases[1])) t.stillBroken++;
          if (!g.resolved && age > 2.1) g.resolved = !h.manner[g.a] && !h.manner[g.b] && h.stride[g.a] > 0 && h.stride[g.b] > 0;
        }
        if (b.handoffs > handed) {
          const r = h.routes.forage, from = h.lastHandoff.from, to = h.lastHandoff.to;
          const ok = prevState[from] === 2 && prevState[to] === 0 && h.jobState[from] === 0 && h.jobState[to] === 2 && h.dir[from] === r.dir && h.dir[to] === -r.dir;
          if (!ok) t.badHandoffs++;
          t.handoffs.push({at:h.clock, from, to, resolved:false});
        }
        for (const s of t.handoffs) if (!s.resolved && h.clock - s.at > 0.6) s.resolved = !h.manner[s.from] && !h.manner[s.to] && h.stride[s.from] > 0 && h.stride[s.to] > 0;
        const users = [];
        for (let i = 0; i < h.count; i++) if (doorUser(i)) users.push(i);
        for (let x = 0; x < users.length; x++) for (let y = x + 1; y < users.length; y++) {
          const i = users[x], j = users[y];
          t.doorPairs++;
          t.doorMin = Math.min(t.doorMin, Math.hypot(h.atX[i] - h.atX[j], h.atY[i] - h.atY[j]) / ((tile(i) + tile(j)) / 2));
        }
        let waiting = 0, show = 0;
        for (let i = 0; i < h.count; i++) {
          if (h.doorWait[i]) waiting++;
          if (h.doorWait[i] && h.doorShow[i] && h.role[i] === 1) show++;
          // A forager waiting its turn at the door stands still.
          if (prevWait[i] && h.doorWait[i] && !h.role[i] && h.phase[i] !== prevPhase[i]) t.waitMoved++;
          const f = h.front[i];
          // Once two of a species have walked together for a second they never overlap, and they keep an even gap.
          t.together[i] = f >= 0 && t.prevFront[i] === f ? t.together[i] + 1 / 30 : 0;
          if (t.together[i] >= 1) {
            t.convoyChecks++;
            t.convoyMin = Math.min(t.convoyMin, Math.hypot(h.atX[i] - h.atX[f], h.atY[i] - h.atY[f]) / ((tile(i) + tile(f)) / 2));
            // Pace is matched within two and a half even gaps; further apart each walks at its own speed.
            const ratio = Math.hypot(h.atX[i] - h.atX[f], h.atY[i] - h.atY[f]) / ((tile(i) + tile(f)) * 0.55 + 4);
            if (t.frames % 10 === 0 && ratio <= 2.5) t.convoyGaps.push(ratio);
          }
          t.prevFront[i] = f;
          // A sideways step with nothing left to give way to eases straight back onto the lane.
          t.returning[i] = h.clock >= h.yieldUntil[i] && !h.manner[i] && Math.abs(h.side[i]) > 0.5 ? t.returning[i] + 1 / 30 : 0;
          // As a share of the time a full step back takes at its pace: the side rate, or a slower walker's own speed.
          t.returnMax = Math.max(t.returnMax, t.returning[i] / (26 / Math.min(70, h.speed[i]) + 0.08));
        }
        t.maxWaiting = Math.max(t.maxWaiting, waiting);
        t.maxShow = Math.max(t.maxShow, show);
        if (t.frames % 150 === 0) {
          const w = h.canvas.width, ht = h.canvas.height;
          const data = composite(Math.ceil(w * .2), Math.ceil(ht * .2), Math.floor(w * .6), Math.floor(ht * .6)).data;
          for (let k = 3; k < data.length; k += 4) if (data[k]) t.centre++;
        }
      };
      t.run = (seconds, stop) => { for (let f = 0; f < seconds * 30; f++) { t.step(); if (stop && stop()) return true; } return false; };
      t.pair = () => { const a = h.greetA, b = h.greetB; return {x:(h.atX[a] + h.atX[b]) / 2, y:(h.atY[a] + h.atY[b]) / 2}; };
      window.lane = t;
      h.update(snap);
    });
    // A greeting caught nose to nose, a handoff caught as the pair close in and just after the crumb changes hands.
    const greetAt = await lanes.evaluate(() => lane.run(240, () => habitat.manner[habitat.greetA] === 1 && habitat.clock - lane.greetings[lane.greetings.length - 1].at > 0.3) ? lane.pair() : null);
    assert(greetAt, 'Two roaches meeting head-on stop to greet within four minutes');
    await lanes.screenshot({path:path.join(output, 'behaviors-greeting-1920.png')});
    await enlargeLane('behaviors-greeting-4x.png', greetAt);
    const handAt = await lanes.evaluate(() => {
      const h = habitat;
      const meeting = () => { const i = h.lastHandoff.from, j = h.lastHandoff.to; return i >= 0 && h.manner[i] === 3 && h.manner[j] === 3 && h.clock - (h.mannerUntil[i] - 1.1) > 0.45; };
      return lane.run(300, meeting) ? {x:(h.atX[h.lastHandoff.from] + h.atX[h.lastHandoff.to]) / 2, y:(h.atY[h.lastHandoff.from] + h.atY[h.lastHandoff.to]) / 2} : null;
    });
    assert(handAt, 'A homebound forager meets an outbound one mid-lane and stops to hand over its crumb within five minutes');
    await lanes.screenshot({path:path.join(output, 'behaviors-handoff-1920.png')});
    await enlargeLane('behaviors-handoff-4x.png', handAt);
    await lanes.evaluate(() => lane.run(0.3));
    await enlargeLane('behaviors-handoff-after-4x.png', handAt);
    // Purchases every few seconds send roaches out of the nest while foragers come and go through the same door.
    const doorAt = await lanes.evaluate(() => {
      const h = habitat;
      let shot = null;
      for (let k = 0; k < 30 && !shot; k++) {
        h.burstAt = -1e9; h.burst(['drone'], []);
        lane.run(4, () => { if (h.doorOwner >= 0 && h.role[h.doorOwner] === 1 && h.behaviorDiagnostics().now.waiting >= 2) { shot = {x:h.baseX + h.entryX, y:h.baseY + h.entryY - 40}; return true; } return false; });
      }
      return shot;
    });
    assert(doorAt, 'Roaches queue for the nest door');
    await enlargeLane('behaviors-door-queue-4x.png', doorAt, 200);
    await lanes.screenshot({path:path.join(output, 'behaviors-door-1920.png')});
    const manners = await lanes.evaluate(() => { lane.run(120); lane.run(240, () => lane.greetings.length >= 2); const t = lane; return {greetings:t.greetings.map(g => ({at:g.at, a:g.a, b:g.b, busy:g.busy, resolved:g.resolved})), handoffs:t.handoffs.map(s => ({at:s.at, resolved:s.resolved})), badHandoffs:t.badHandoffs, stillBroken:t.stillBroken, doorMin:t.doorMin, doorPairs:t.doorPairs, convoyMin:t.convoyMin, convoyGap:t.convoyGaps.sort((a, b) => a - b)[t.convoyGaps.length >> 1], convoyChecks:t.convoyChecks, returnMax:t.returnMax, waitMoved:t.waitMoved, maxWaiting:t.maxWaiting, maxShow:t.maxShow, centre:t.centre, seconds:habitat.clock, behaviors:habitat.diagnostics().behaviors}; });
    const greetGaps = manners.greetings.slice(1).map((g, k) => g.at - manners.greetings[k].at);
    assert(manners.greetings.length >= 2, 'Greetings recur: ' + JSON.stringify(manners.greetings));
    assert(greetGaps.every(gap => gap >= 6.6), 'At most one greeting every six and a half seconds: ' + JSON.stringify(greetGaps));
    assert(manners.greetings.length <= manners.seconds / 6.6 + 1, 'Greetings stay occasional');
    assert(manners.greetings.slice(1).every((g, k) => ![g.a, g.b].some(i => i === manners.greetings[k].a || i === manners.greetings[k].b)), 'No roach greets twice in a row');
    assert(manners.greetings.every(g => !g.busy), 'No greetings during a parade, caravan, procession or intruder');
    assert.equal(manners.stillBroken, 0, 'A greeting pair stands still nose to nose');
    assert(manners.greetings.slice(0, -1).every(g => g.resolved), 'Every greeting ends and both roaches walk on');
    assert(manners.handoffs.length >= 1 && manners.badHandoffs === 0, 'A handoff moves the crumb from the homebound forager to the outbound one, and each turns around: ' + JSON.stringify(manners));
    assert(manners.handoffs.slice(1).every((s, k) => s.at - manners.handoffs[k].at >= 14), 'Handoffs are at least fourteen seconds apart');
    assert(manners.handoffs.slice(0, -1).every(s => s.resolved), 'Both foragers walk on after a handoff');
    assert(manners.behaviors.queued > 0 && manners.maxWaiting >= 2, 'Roaches queue at the door: ' + JSON.stringify(manners.behaviors));
    assert(manners.maxShow <= 3, 'Emergences that are only for show queue three deep at most: ' + manners.maxShow);
    assert(manners.doorPairs > 0 && manners.doorMin >= 1, 'Two roaches never overlap in the doorway: ' + manners.doorMin);
    assert.equal(manners.waitMoved, 0, 'A forager waiting its turn stands still');
    // Lanes a little apart converge on the rounded corners, so neighbours there may brush legs but never stack.
    assert(manners.convoyChecks > 100 && manners.convoyMin >= 0.5, 'Members of a group of one species never stack: ' + manners.convoyMin);
    assert(manners.convoyGap >= 0.9 && manners.convoyGap <= 1.5, 'A group keeps even gaps: ' + manners.convoyGap);
    assert(manners.behaviors.yields > 0 && manners.returnMax <= 1, 'Lower tiers step aside and ease back onto the lane once clear: ' + manners.returnMax);
    assert.equal(manners.centre, 0, 'The centre stays transparent');
    console.log(JSON.stringify({laneManners:{seconds:manners.seconds, greetings:manners.greetings.length, handoffs:manners.handoffs.length, behaviors:manners.behaviors, doorMin:manners.doorMin, convoyMin:manners.convoyMin, convoyGap:manners.convoyGap}}));
    // The top tier's procession: walkers ahead of it part to either side and step back once it has passed. The walk
    // pauses once for a picture when someone near the lead is well into its sideways step.
    const partShot = await lanes.evaluate(([everything]) => {
      const h = habitat;
      lane.snap = everything;
      h.update(everything);
      lane.run(5);
      h.role[h.lead] = 0; h.job[h.lead] = 0;
      // A lead right by the door has nowhere to process to, so it starts a stretch of lane away.
      h.phase[h.lead] = (h.routes.forage.a + 0.3) % 1;
      h.processionAt = h.clock;
      lane.returnMax = 0;
      const p = window.parting = {lead:h.lead, parted:0, frames:0, centre:0, shot:null};
      p.walk = untilShot => {
        while (p.frames < 50 * 30) {
          lane.step();
          p.frames++;
          if (h.job[p.lead] !== 3) { if (p.frames > 30) return false; continue; }
          const reach = h.kinds[h.kind[p.lead]].tile * 3;
          for (let i = 0; i < h.count; i++) {
            if (i === p.lead || h.leader[i] === p.lead || h.manner[i] || h.clock >= h.yieldUntil[i] || !h.yieldSide[i]) continue;
            if (Math.hypot(h.atX[i] - h.atX[p.lead], h.atY[i] - h.atY[p.lead]) >= reach) continue;
            p.parted++;
            const clear = Math.hypot(h.atX[i] - h.baseX - h.baseCanvas.width / 2, h.atY[i] - h.baseY - h.baseCanvas.height / 2) > h.baseCanvas.width;
            if (!p.shot && clear && Math.abs(h.side[i]) > 12) p.shot = {x:(h.atX[i] + h.atX[p.lead]) / 2, y:(h.atY[i] + h.atY[p.lead]) / 2};
          }
          if (p.frames % 60 === 0) {
            const w = h.canvas.width, ht = h.canvas.height;
            const data = composite(Math.ceil(w * .2), Math.ceil(ht * .2), Math.floor(w * .6), Math.floor(ht * .6)).data;
            for (let k = 3; k < data.length; k += 4) if (data[k]) p.centre++;
          }
          if (untilShot && p.shot) return true;
        }
        return false;
      };
      return p.walk(true) ? p.shot : null;
    }, [everything]);
    if (partShot) {
      await lanes.screenshot({path:path.join(output, 'behaviors-procession-1920.png')});
      await enlargeLane('behaviors-procession-parting-4x.png', partShot, 240);
    }
    const parting = await lanes.evaluate(() => {
      const p = window.parting;
      p.walk(false);
      lane.run(3);
      return {parted:p.parted, frames:p.frames, centre:p.centre, returnMax:lane.returnMax, processions:habitat.events.processions};
    });
    assert(partShot && parting.processions >= 1 && parting.parted > 0, 'Walkers part for the procession: ' + JSON.stringify(parting));
    assert(parting.returnMax <= 1, 'After the procession passes, everyone eases back onto the lane');
    assert.equal(parting.centre, 0, 'Parting never reaches the centre of the picture');
    // Nothing moves, waits or greets while hidden, and hiding clears every manner.
    const hiddenLanes = await lanes.evaluate(() => {
      const h = habitat;
      lane.run(30, () => h.behaviorDiagnostics().now.yielding > 0 && h.doorOwner >= 0);
      h.setActive(false);
      const phases = Array.from(h.phase.slice(0, h.count));
      const counts = JSON.stringify(h.behaviors);
      const clock = h.clock;
      for (let k = 0; k < 90; k++) h.tick(performance.now() + k * 34);
      const still = Array.from(h.phase.slice(0, h.count)).every((p, i) => p === phases[i]);
      let held = 0;
      for (let i = 0; i < h.count; i++) if (h.manner[i] || h.side[i] || h.doorWait[i] || h.stride[i] !== 1) held++;
      const out = {still, held, sameCounts:JSON.stringify(h.behaviors) === counts, clock:h.clock === clock, door:h.doorOwner, request:h.request};
      h.setActive(true); cancelAnimationFrame(h.request); h.request = null;
      return out;
    });
    assert(hiddenLanes.still && hiddenLanes.clock && hiddenLanes.sameCounts && hiddenLanes.request === null, 'Nothing moves or greets while hidden: ' + JSON.stringify(hiddenLanes));
    assert(hiddenLanes.held === 0 && hiddenLanes.door === -1, 'Hiding clears greetings, handoffs, sideways steps and door turns');
    // A new tier's parade: out of the door with a pulse and glints, a whole step larger in a soft halo, escorts in step
    // behind it, a thicker ember trail as it sets out, and roamers it passes stopping to watch. Review images go to
    // work/habitat-qa/parade-*.png.
    const paradeStart = await lanes.evaluate(() => {
      const h = habitat;
      const mid = owned => ({populationExact:'1e9', visibleUnits:[{id:'drone',tier:1,owned:true,countExact:'100000000'},{id:'queen',tier:2,owned:true,countExact:'5000'},{id:'nest',tier:3,owned:true,countExact:'300'},{id:'greaterqueen',tier:4,owned,countExact:owned ? '1' : '0'},{id:'swarmling',tier:1,owned:true,countExact:'1000000'},{id:'stinger',tier:2,owned:true,countExact:'2000'}], resources:[{id:'meat',amount:'1e7',rate:'1e5'},{id:'larva',amount:'500',rate:'30'},{id:'territory',amount:'1e5',rate:'10'}], upgradeLevels:{hatchery:'20', expansion:'12', nexus1:'1'}});
      lane.snap = mid(false);
      h.update(lane.snap);
      lane.run(20);
      const parades = h.events.parades;
      lane.snap = mid(true);
      h.paradeUntil = 0;
      h.update(lane.snap);
      // This page has owned it before, so the update alone does not count it as new.
      if (h.events.parades === parades) h.parade('greaterqueen');
      const lead = Array.from(h.role.subarray(0, h.count)).findIndex((r, i) => r === 2 && !h.roleIndex[i]);
      const escorts = [];
      for (let i = 0; i < h.count; i++) if (h.role[i] === 2 && h.roleIndex[i]) escorts.push(h.kinds[h.kind[i]].id);
      // The lead's scale, read from its blits.
      const blit = h.blit;
      window.paradeWatch = {scales:{}, saw:0, embers:0, normal:h.scaleOf(lead, h.kinds[h.kind[lead]])};
      h.blit = function (record, dir, frame, x, y, scale) { if (this.seat === lead && this.role[lead] === 2) paradeWatch.scales[scale] = 1; return blit.apply(this, arguments); };
      return {started:h.events.parades - parades, lead, id:lead >= 0 ? h.kinds[h.kind[lead]].id : '', escorts, glowing:h.diagnostics().events.glowing, seconds:h.paradeUntil - h.clock, door:[h.baseX + h.entryX, h.baseY + h.entryY]};
    });
    assert(paradeStart.started === 1 && paradeStart.id === 'greaterqueen', 'Buying a new tier starts its parade: ' + JSON.stringify(paradeStart));
    assert(paradeStart.escorts.length >= 1 && paradeStart.escorts.length <= 3, 'A few escorts walk behind the new tier: ' + JSON.stringify(paradeStart.escorts));
    assert(paradeStart.glowing, 'The nest door pulses as the new tier comes out');
    assert(paradeStart.seconds > 20 && paradeStart.seconds < 200, 'The parade lasts as long as walking one lap: ' + paradeStart.seconds);
    await lanes.evaluate(() => lane.run(0.3));
    await lanes.screenshot({path:path.join(output, 'parade-door-1920.png')});
    await enlargeLane('parade-door-4x.png', {x:paradeStart.door[0], y:paradeStart.door[1] - 30}, 200);
    // On the lane, clear of the nest and the controls, with its escorts out behind it.
    const paradeLap = await lanes.evaluate(() => {
      const h = habitat;
      const lead = () => Array.from(h.role.subarray(0, h.count)).findIndex((r, i) => r === 2 && !h.roleIndex[i]);
      let embers = 0;
      lane.run(3, () => { embers = Math.max(embers, h.motes.stats().kinds[RoachMotes.EMBER]); return false; });
      const found = lane.run(200, () => {
        const i = lead();
        if (i < 0) return false;
        let out = 0;
        for (let k = 0; k < h.count; k++) if (h.role[k] === 2 && h.roleIndex[k] && Math.hypot(h.atX[k] - h.atX[i], h.atY[k] - h.atY[i]) < 220) out++;
        const x = h.atX[i], y = h.atY[i];
        return out >= 1 && y > 900 && x > 600 && x < 1300;
      });
      const i = lead();
      const watching = [];
      for (let k = 0; k < h.count; k++) if (h.saw[k] && h.elapsed < h.pauseUntil[k]) watching.push(k);
      // Framed on the lead and the escorts within reach behind it.
      let sx = 0, sy = 0, n = 0;
      for (let k = 0; k < h.count; k++) if (h.role[k] === 2 && i >= 0 && Math.hypot(h.atX[k] - h.atX[i], h.atY[k] - h.atY[i]) < 220) { sx += h.atX[k]; sy += h.atY[k]; n++; }
      return {found, embers, at:n ? {x:sx / n, y:sy / n - 10} : null, watching:watching.length};
    });
    assert(paradeLap.embers >= 8, 'A thick ember trail as the new tier sets out: ' + paradeLap.embers);
    if (paradeLap.found) {
      await lanes.screenshot({path:path.join(output, 'parade-lap-1920.png')});
      await enlargeLane('parade-lap-4x.png', paradeLap.at, 300);
    }
    // A roamer stopped and turned toward the lead as it passes.
    const paradeWatchAt = await lanes.evaluate(() => {
      const h = habitat;
      let at = null;
      lane.run(120, () => {
        const i = Array.from(h.role.subarray(0, h.count)).findIndex((r, k) => r === 2 && !h.roleIndex[k]);
        if (i < 0) return true;
        for (let k = 0; k < h.count; k++) {
          if (!h.saw[k] || h.elapsed >= h.pauseUntil[k] - 0.6 || h.blocked(h.atX[k], h.atY[k], 10) || h.blocked(h.atX[i], h.atY[i], 10)) continue;
          if (Math.hypot(h.atX[k] - h.atX[i], h.atY[k] - h.atY[i]) < 110) { at = {x:(h.atX[k] + h.atX[i]) / 2, y:(h.atY[k] + h.atY[i]) / 2}; return true; }
        }
        return false;
      });
      return at;
    });
    if (paradeWatchAt) await enlargeLane('parade-watch-4x.png', paradeWatchAt, 220);
    const paradeEnd = await lanes.evaluate(() => {
      const h = habitat;
      let watchers = 0, watchShot = null;
      lane.run(200, () => {
        let parading = 0;
        for (let k = 0; k < h.count; k++) {
          if (h.role[k] === 2) parading++;
          if (!watchShot && h.saw[k] && h.elapsed < h.pauseUntil[k] && h.atY[k] > 200 && h.atY[k] < 880) watchShot = {x:h.atX[k], y:h.atY[k]};
        }
        return !parading;
      });
      for (let k = 0; k < h.count; k++) if (h.saw[k]) watchers++;
      h.blit = RoachHabitat.prototype.blit;
      const centre = composite(Math.ceil(h.canvas.width * .2), Math.ceil(h.canvas.height * .2), Math.floor(h.canvas.width * .6), Math.floor(h.canvas.height * .6)).data.some((v, k) => k % 4 === 3 && v);
      return {watchers, scales:Object.keys(paradeWatch.scales).map(Number), normal:paradeWatch.normal, over:h.clock >= h.paradeUntil, parading:Array.from(h.role.subarray(0, h.count)).filter(r => r === 2).length, centre};
    });
    assert.deepEqual(paradeEnd.scales, [paradeEnd.normal + 1], 'The new tier is drawn a whole step larger while it parades: ' + JSON.stringify(paradeEnd));
    assert(paradeEnd.watchers >= 1, 'Roamers it passes stop to watch: ' + paradeEnd.watchers);
    assert(paradeEnd.over && paradeEnd.parading === 0, 'The parade ends after one lap and everyone walks on');
    assert.equal(paradeEnd.centre, false, 'The parade keeps the centre clear');
    const continuitySuite = await lanes.evaluate(() => {
      const h = habitat;
      h.setActive(true);
      cancelAnimationFrame(h.request);
      h.request = null;
      const snap = {
        populationExact: '1e9',
        visibleUnits: [
          {id: 'drone', tier: 1, owned: true, countExact: '100000'},
          {id: 'queen', tier: 2, owned: true, countExact: '5000'},
          {id: 'roach', tier: 6, owned: true, countExact: '900'},
          {id: 'swarmling', tier: 1, owned: true, countExact: '100000'}
        ],
        resources: [
          {id: 'meat', amount: '1e7', rate: '1e5'},
          {id: 'larva', amount: '500', rate: '30'},
          {id: 'territory', amount: '1e5', rate: '10'}
        ],
        upgradeLevels: {hatchery: '20', expansion: '12', nexus1: '1'}
      };
      h.update(snap);
      for (let f = 0; f < 10; f++) h.draw(1 / 30);

      // 1. Stable entityId across remove(slot) and inspector diagnostics
      const idsBefore = Array.from(h.entityId.subarray(0, h.count));
      const removedId = h.entityId[1];
      const survivingIds = idsBefore.filter((_, idx) => idx !== 1);
      h.remove(1, 'test-remove');
      const idsAfter = new Set(h.entityId.subarray(0, h.count));
      const allSurvived = survivingIds.every(id => idsAfter.has(id)) && !idsAfter.has(removedId);
      const departedRecorded = h.lastDeparted.some(d => d.id === removedId && d.reason === 'test-remove');

      const targetEntityId = h.entityId[0];
      h.setInspector(true, targetEntityId);
      for (let f = 0; f < 8; f++) h.draw(1 / 30);
      const inspById = h.inspectorDiagnostics();
      const inspBySpecies = h.inspectCreature('queen');
      h.setInspector(false);

      // 2. Acting atlases cached separately from this.atlases
      const actSentry = h.actingAtlas('roach-sentry');
      const actLay = h.actingAtlas('queen-lay');
      const actIdle = h.actingAtlas('forager-idle');
      const actDep = h.actingAtlas('forager-deposit');
      const actWriggle = h.actingAtlas('hatchling-wriggle');
      const actingSeparate = !('roach-sentry' in h.atlases) && !!(actSentry && actLay && actIdle && actDep && actWriggle);

      // 3. Natural catches (departingGolden & departingVisitor)
      h.showGolden(true);
      h.showVisitor('pantry_moth', 30, 1);
      h.draw(1 / 30);
      h.showGolden(false);
      h.showVisitor(null);
      const goldenGoneImmediately = !h.golden && !h.diagnostics().guests.golden && !!h.departingGolden;
      const visitorGoneImmediately = !h.visitor && h.diagnostics().guests.visitor === '' && !!h.departingVisitor;
      for (let f = 0; f < 15; f++) h.draw(1 / 30);
      const departingCleared = !h.departingGolden && !h.departingVisitor;

      // 4. Visible manual forage feedback
      h.cues = {};
      h.lastForageFetch = -1e9;
      for (let i = 0; i < h.count; i++) { h.carrying[i] = 0; if (h.job[i] === 1) h.jobState[i] = 0; }
      const foraged = h.cue('forage');
      const carryingNow = Array.from(h.carrying.subarray(0, h.count)).filter(Boolean).length;

      // 5. Standalone landmarks, keepsakes, and personal space
      h.setKeepsakes(['keepsake_beetle_shell', 'keepsake_moth_stone']);
      h.setStandalone(true);
      h.update(snap);
      for (let f = 0; f < 30; f++) h.draw(1 / 30);
      const standaloneLandmarks = (h.landmarks || []).map(l => l.slug);
      h.setStandalone(false);
      h.update(snap);
      h.draw(1 / 30);

      // 6. Quiet retirement and skitterOut
      h.setQuiet(true);
      const retiringCount = Array.from(h.role.subarray(0, h.count)).filter(r => r === 34).length;
      for (let f = 0; f < 60; f++) h.draw(1 / 30);
      h.setQuiet(false);
      let skitterCallback = false;
      const skittered = h.skitterOut(() => { skitterCallback = true; });
      for (let f = 0; f < 16 && h.active; f++) h.draw(1 / 30);
      const closedCleanly = skittered && skitterCallback && !h.active && !h.closing;

      return {
        allSurvived,
        departedRecorded,
        inspById,
        inspBySpecies,
        actingSeparate,
        goldenGoneImmediately,
        visitorGoneImmediately,
        departingCleared,
        foraged,
        carryingNow,
        standaloneLandmarks,
        retiringCount,
        closedCleanly
      };
    });
    assert(continuitySuite.allSurvived && continuitySuite.departedRecorded, 'Surviving seats keep their entityId across remove() and departures are logged');
    assert(continuitySuite.inspById.enabled && continuitySuite.inspById.trail.length >= 6 && continuitySuite.inspBySpecies.species === 'queen', 'Inspector tracks target creature trail and resolves species queries');
    assert(continuitySuite.actingSeparate, 'Acting atlases bake on demand outside habitat.atlases');
    assert(continuitySuite.goldenGoneImmediately && continuitySuite.visitorGoneImmediately && continuitySuite.departingCleared, 'Caught golden roach and visitor clear guest state immediately and scurry off over 0.35s');
    assert(continuitySuite.foraged && continuitySuite.carryingNow >= 1, 'Manual forage cue sends a worker home carrying a crumb');
    assert(continuitySuite.standaloneLandmarks.includes('prop_crumb_depot') && continuitySuite.standaloneLandmarks.includes('prop_nursery_entrance') && continuitySuite.standaloneLandmarks.includes('prop_guard_post') && continuitySuite.standaloneLandmarks.includes('prop_scout_post') && continuitySuite.standaloneLandmarks.includes('keepsake_beetle_shell'), 'Standalone mode stamps landmarks and keepsakes on the floor');
    assert(continuitySuite.retiringCount > 0 && continuitySuite.closedCleanly, 'Quiet retirement and skitterOut complete cleanly');
    assert.deepEqual(laneErrors, []);
    await lanes.close();
    // Walking pace: a mid- and a late-game colony through every errand for five scripted minutes on a fake clock. No
    // drawn roach may move faster than two and a half times its species' walking speed from one frame to the next.
    const speeds = await require('../scripts/dev/habitat-speed.cjs').measure(browser, modulePath, 300);
    for (const kind in speeds) {
      const r = speeds[kind];
      assert.deepEqual(r.errors, [], kind + ' colony page errors');
      assert(r.frames > 8000 && r.events.parades >= 1 && r.events.caravans >= 1 && r.events.crews >= 1 && r.events.promotions >= 1 && r.events.ceremonies === 1, kind + ' colony ran every errand: ' + JSON.stringify(r.events));
      assert.equal(r.violations, 0, kind + ' colony: no roach slides faster than it can walk: ' + JSON.stringify(r.causes));
      assert.equal(r.idViolations, 0, kind + ' colony: entityIds stay unique and survive seat compaction');
      assert.equal(r.speciesSwaps, 0, kind + ' colony: zero in-place species swaps on the same entityId');
      assert(r.continuity && r.continuity.inspectorOk && r.continuity.quietRetireOk && r.continuity.skitterOutOk, kind + ' colony continuity checks pass: ' + JSON.stringify(r.continuity));
    }
    console.log(JSON.stringify({walkingPace:Object.fromEntries(Object.entries(speeds).map(([kind, r]) => [kind, Object.fromEntries(Object.entries(r.worst).sort((a, b) => b[1].ratio - a[1].ratio).slice(0, 5).map(([key, w]) => [key, w.ratio]))]))}));
    fs.writeFileSync(path.join(output,'performance.json'),JSON.stringify({note:'Local Chrome only. Draw submission timings exclude asynchronous GPU/compositor work and do not establish webOS or video playback performance.',results},null,2));
    console.log(JSON.stringify(results.map(r=>({viewport:r.viewport,drawSubmission:r.drawSubmission,coverage:r.pixels.coverage,entities:r.rich.entities,allocation:r.rich.allocation,atlasBytes:r.rich.atlasBytes,bytes:r.rich.canvasBytes})),null,2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
