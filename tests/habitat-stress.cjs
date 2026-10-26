// Randomised overlap stress for the habitat: every behaviour that borrows seats, triggered by a seeded schedule at
// awkward times, with invariants checked every frame. The default run is a fast deterministic subset for the suite;
// `node tests/habitat-stress.cjs --seeds 20 --minutes 10` explores longer. Local Chrome only; never contacts the TV.
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');

const args = process.argv.slice(2);
const option = (name, fallback) => { const k = args.indexOf('--' + name); return k >= 0 ? Number(args[k + 1]) : fallback; };
const seeds = option('seeds', 3);
const minutes = option('minutes', 2);
const firstSeed = option('seed', 1);

const habitatFile = args.includes('--habitat') ? path.resolve(args[args.indexOf('--habitat') + 1]) : null;
const app = name => name === 'habitat.js' && habitatFile ? habitatFile : path.resolve(__dirname, '../app', name);

// Runs inside the page. Returns {violations, stats}.
function drive([seed, seconds, traceSlot]) {
  const h = habitat;
  // Deterministic randomness and time: Math.random drives the habitat's own choices, performance.now its purchase
  // detection, and both follow the simulated clock.
  let state = seed >>> 0;
  const rand = () => { state = (state + 0x6d2b79f5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rand;
  let fakeMs = 1000;
  performance.now = () => fakeMs;
  const pick = list => list[rand() * list.length | 0];
  const DT = 1 / 30;
  const meat = 'drone queen nest greaterqueen hive hivequeen empress prophet goddess pantheon pantheon2 pantheon3 pantheon4 pantheon5 overmind overmind2 overmind3 overmind4 overmind5 overmind6'.split(' ');
  const territory = 'swarmling stinger spider mosquito locust roach giantspider centipede wasp devourer goon'.split(' ');
  const energy = ['nightbug', 'moth', 'bat'];
  // The colony: owned counts as log10 magnitudes, grown a little each update and spiked by purchases.
  const colony = {units: {drone: 1.5, queen: 0.6, swarmling: 1}, levels: {hatchery: 1, dronetwin: 1}, larva: 2};
  const sci = mag => Math.pow(10, mag - Math.floor(mag)).toFixed(3) + 'e+' + Math.floor(mag);
  const snapshot = () => {
    const visibleUnits = [];
    const all = meat.concat(territory, energy);
    for (const id of all) {
      const mag = colony.units[id];
      const owned = mag !== undefined;
      const exact = !owned ? '0' : mag < 2 ? String(Math.max(1, Math.round(Math.pow(10, mag)))) : sci(mag);
      visibleUnits.push({id, tier: (meat.indexOf(id) + 1) || (territory.indexOf(id) + 1) || (energy.indexOf(id) + 1), owned, countExact: exact});
    }
    const levels = {};
    for (const id in colony.levels) levels[id] = String(Math.round(colony.levels[id]));
    const pop = Math.max(0, ...Object.values(colony.units));
    return {populationExact: sci(pop), visibleUnits, upgradeLevels: levels,
      resources: [{id: 'meat', amount: sci(pop + 2), rate: sci(pop)}, {id: 'larva', amount: colony.larva > 0 ? sci(colony.larva) : '0', rate: sci(Math.max(0, colony.larva - 1))}, {id: 'territory', amount: sci(colony.units.swarmling || 0)}]};
  };
  const grow = () => { for (const id in colony.units) colony.units[id] += 0.0005; };
  const purchase = () => {
    const owned = Object.keys(colony.units);
    const r = rand();
    if (r < 0.25) {
      // A new tier above the top one owned in some chain.
      const chain = pick([meat, meat, territory, energy]);
      const next = chain.find(id => colony.units[id] === undefined);
      if (next) colony.units[next] = 0.3 + rand();
    } else if (r < 0.6) colony.units[pick(owned)] += 0.3 + rand() * 0.6;
    else {
      const id = pick(['hatchery', 'expansion', 'nexus1', 'nexus2', 'nexus3', 'mutatemeat', 'mutatehatchery', 'dronetwin', 'queenprod', 'swarmlingtwin']);
      colony.levels[id] = (colony.levels[id] || 0) * 3 + 1;
    }
  };
  const shrink = () => {
    // A reset-like shrink: an ascension or a load of an early save.
    colony.units = {drone: 0.5 + rand(), queen: rand() < 0.5 ? 0.3 : undefined};
    if (colony.units.queen === undefined) delete colony.units.queen;
    colony.levels = {};
    colony.larva = rand() < 0.5 ? 0 : 1;
  };
  const late = () => {
    // Half the time a mid colony, whose drones forage and queens tend; otherwise a late one led by a high tier.
    const tiers = rand() < 0.5 ? 3 + (rand() * 3 | 0) : 6 + (rand() * 14 | 0);
    colony.units = {};
    for (let k = 0; k < tiers; k++) colony.units[meat[k]] = (tiers < 6 ? 40 : 400) - k * (tiers < 6 ? 6 : 15);
    for (let k = 0; k < (tiers < 6 ? 2 : 4) + rand() * 5; k++) colony.units[territory[k]] = 90 - k;
    if (rand() < 0.5) for (const id of energy) colony.units[id] = 20;
    colony.levels = {hatchery: 140, expansion: 85, nexus1: 1, nexus2: 1, nexus3: 1, mutatemeat: 3, dronetwin: 30, swarmlingtwin: 5};
    colony.larva = 100;
  };

  const ROLE = {1: 'emerge', 2: 'parade', 3: 'caravan', 4: 'chase', 20: 'enter', 21: 'crew', 22: 'scatter', 23: 'guard', 24: 'nurse', 30: 'carry', 31: 'hatch', 32: 'file', 33: 'wait', 34: 'retire', 35: 'dung'};
  // Generous bounds, in visible seconds, for how long a seat may hold a role, manner or door turn. Parades and caravans
  // last as long as walking them takes, so they are held to the habitat's own end time for them instead.
  const LIMIT = {emerge: 45, chase: 25, enter: 14, crew: 14, scatter: 3, guard: 240, nurse: 25, carry: 70, hatch: 4, file: 5, wait: 5, retire: 5, dung: 45, manner: 4, door: 40};
  const CAPS = [64, 48, 32];
  const violations = [];
  const seen = {};
  const violate = (kind, detail) => { if (seen[kind] === undefined) { seen[kind] = 0; violations.push({kind, at: +h.clock.toFixed(2), detail}); } seen[kind]++; };
  // Per seat: role, when it took it, and when its manner and door turn began. Seats move under remove(), so these are
  // keyed by slot and reset whenever the slot's state changes.
  const held = [];
  for (let i = 0; i < 64; i++) held.push({role: 0, since: 0, manner: 0, mannerSince: 0, door: 0, doorSince: 0, conflict: 0, offJob: -1});
  let crewSince = -1, ceremonySince = -1, flightSince = -1, carrySince = -1, leaveSince = -1;
  let lastSnapshot = null;
  let pendingCheck = false;
  const stats = {trace: [], frames: 0, ms: [], peakSeats: 0, peakRoles: 0, peakAt: 0, events: {}, trailChecks: 0, centreChecks: 0, overlapMs: []};
  const count = name => { stats.events[name] = (stats.events[name] || 0) + 1; };
  const w = h.canvas.width, ht = h.canvas.height;
  const ctx = h.ctx;
  const panel = document.getElementById('panel').getBoundingClientRect();

  const doorState = () => {
    const o = h.doorOwner;
    let waiting = 0;
    for (let i = 0; i < h.count; i++) if (h.doorWait[i]) waiting++;
    return {owner: o, waiting, freeAt: +(h.doorFreeAt - h.clock).toFixed(2), left: h.doorLeft < 0 ? -1 : +(h.clock - h.doorLeft).toFixed(2), ownerRole: o >= 0 ? ROLE[h.role[o]] : '', ownerJob: o >= 0 ? h.job[o] : -1, ownerState: o >= 0 ? h.jobState[o] : -1, ownerStride: o >= 0 ? h.stride[o] : -1, ownerTravel: o >= 0 ? +h.travel[o].toFixed(3) : -1, ownerAge: o >= 0 ? +(h.clock - h.roleStart[o]).toFixed(2) : 0, span: +h.routes.forage.span.toFixed(3)};
  };
  const check = () => {
    const n = h.count;
    if (n > 64) violate('seats over 64', n);
    if (n + h.guests() > CAPS[h.level]) violate('seats over the quality cap', {seats: n, guests: h.guests(), level: h.level});
    let roles = 0, walkingOut = 0;
    for (let i = 0; i < n; i++) {
      const s = held[i];
      const role = h.role[i];
      const name = ROLE[role];
      if (role) roles++;
      if (role !== s.role) { if (i === traceSlot) stats.trace.push([+h.clock.toFixed(2), name || 0, !!h.ceremony]); s.role = role; s.since = h.clock; }
      else if (role && h.clock - s.since > (role === 2 ? h.paradeUntil - s.since + 1 : role === 3 ? h.caravanUntil - s.since + 1 : LIMIT[name]) && !(role === 1 && h.doorWait[i])) violate('role held too long: ' + name, {slot: i, seconds: +(h.clock - s.since).toFixed(1), roleStart: h.roleStart[i], index: h.roleIndex[i], job: h.job[i], doorWait: h.doorWait[i], ceremony: !!h.ceremony, door: doorState()});
      if (h.manner[i] !== s.manner) { s.manner = h.manner[i]; s.mannerSince = h.clock; }
      else if (s.manner && h.clock - s.mannerSince > LIMIT.manner) violate('manner held too long: ' + s.manner, {slot: i, partner: h.partner[i], seconds: +(h.clock - s.mannerSince).toFixed(1)});
      if (!!h.doorWait[i] !== !!s.door) { s.door = h.doorWait[i]; s.doorSince = h.clock; }
      else if (s.door && h.clock - s.doorSince > LIMIT.door) violate('door queue never drains', {slot: i, role: name, seconds: +(h.clock - s.doorSince).toFixed(1), ticket: h.doorTicket[i], door: doorState()});
      // Conflicts that survive a whole frame: a role and a lane manner, a sideways step or a door turn at once.
      const conflict = role && (h.manner[i] || h.side[i] || (h.doorWait[i] && role !== 1)) ? 1 : 0;
      if (conflict && s.conflict) violate('role with a lane manner', {slot: i, role: name, manner: h.manner[i], side: h.side[i], doorWait: h.doorWait[i]});
      s.conflict = conflict;
      if (h.manner[i]) {
        const p = h.partner[i];
        if (p < 0 || p >= n || h.partner[p] !== i) violate('manner without a partner', {slot: i, manner: h.manner[i], partner: p});
      }
      if ((role === 32 || role === 33) && !h.ceremony) violate('ceremony role outside a ceremony', {slot: i, role: name, roleStart: h.roleStart[i], job: h.job[i]});
      if (role === 23 && h.job[i] !== 2) { if (s.offJob < 0) s.offJob = h.clock; else if (h.clock - s.offJob > 1) violate('guard that is not a claimer', {slot: i, job: h.job[i]}); } else s.offJob = -1;
      if (!(h.phase[i] >= 0 && h.phase[i] < 1) || !isFinite(h.atX[i]) || !isFinite(h.atY[i]) || !isFinite(h.inset[i])) violate('position not finite', {slot: i, phase: h.phase[i], x: h.atX[i], inset: h.inset[i]});
      // An emerger walks out only once it holds the door, so at most one is on its way out.
      if (role === 1) {
        const t = (h.clock - h.roleStart[i] - h.roleIndex[i] * 0.3) / 1.3;
        if (t >= 0 && t < 1) walkingOut++;
      }
    }
    // Seats past the count are gone; whoever is spawned there later starts fresh.
    for (let i = n; i < 64; i++) { const s = held[i]; s.role = s.manner = s.door = s.conflict = 0; s.offJob = -1; }
    if (walkingOut > 1) violate('more than one roach walking out of the door', walkingOut);
    if (h.doorOwner >= n) violate('door owner past the seats', h.doorOwner);
    if (h.partner.some((p, i) => i >= n && h.manner[i])) violate('manner on a freed seat');
    if (n > stats.peakSeats) stats.peakSeats = n;
    if (roles > stats.peakRoles) { stats.peakRoles = roles; stats.peakAt = +h.clock.toFixed(1); }
    // Bounded lifetimes of the habitat-wide holds.
    if (h.crew) { if (crewSince < 0) crewSince = h.clock; if (h.clock - crewSince > 6.2) violate('nest re-bake held past the crew timeout', +(h.clock - crewSince).toFixed(2)); } else crewSince = -1;
    if (h.ceremony) { if (ceremonySince < 0) ceremonySince = h.clock; if (h.clock - ceremonySince > 4.2) violate('ceremony never ends'); pendingCheck = true; }
    else {
      ceremonySince = -1;
      if (pendingCheck && lastSnapshot && h.snapshot !== lastSnapshot) violate('held ascension snapshot not applied');
      pendingCheck = false;
    }
    if (h.flight) { if (flightSince < 0) flightSince = h.clock; if (h.clock - flightSince > 4.5) violate('nuptial flight never lands'); } else flightSince = -1;
    const c = h.chance;
    if (c && c.carry) { if (carrySince < 0) carrySince = h.clock; if (h.clock > c.carryAt + c.carryTime + 1 || h.clock - carrySince > LIMIT.carry) violate('egg case carried forever'); } else carrySince = -1;
    if (c && c.leave) { if (leaveSince < 0) leaveSince = h.clock; if (h.clock - leaveSince > 8) violate('molting roach never leaves'); } else leaveSince = -1;
    if (h.husk && isFinite(h.husk.until) && h.clock - h.husk.until > 1.2) violate('husk never fades');
  };

  // Every pixel on the moving layer must lie inside a rectangle this frame recorded, or the next wipe leaves a trail.
  const trails = () => {
    if (h.overflow) return;
    stats.trailChecks++;
    const mask = new Uint8Array(w * ht);
    const d = h.dirty;
    for (let k = 0; k < h.touched; k++) {
      const x0 = Math.max(0, d[k * 4]), y0 = Math.max(0, d[k * 4 + 1]), x1 = Math.min(w, d[k * 4 + 2]), y1 = Math.min(ht, d[k * 4 + 3]);
      for (let y = y0; y < y1; y++) mask.fill(1, y * w + x0, y * w + Math.max(x0, x1));
    }
    const data = ctx.getImageData(0, 0, w, ht).data;
    let stray = 0, sx = -1, sy = -1;
    for (let p = 0, q = 3; p < mask.length; p++, q += 4) if (data[q] && !mask[p]) { stray++; if (sx < 0) { sx = p % w; sy = p / w | 0; } }
    if (stray) violate('pixels outside the dirty rectangles (trail)', {stray, x: sx, y: sy});
  };
  const centre = () => {
    stats.centreChecks++;
    const x0 = Math.ceil(w * 0.2), y0 = Math.ceil(ht * 0.2);
    const data = ctx.getImageData(x0, y0, Math.floor(w * 0.6), Math.floor(ht * 0.6)).data;
    for (let q = 3; q < data.length; q += 4) if (data[q]) { const p = (q - 3) / 4, cw = Math.floor(w * 0.6); violate('drawn inside the centre 60%', near(x0 + p % cw, y0 + (p / cw | 0))); break; }
    const pd = ctx.getImageData(Math.ceil(panel.left), Math.ceil(panel.top), Math.floor(panel.width), Math.floor(panel.height)).data;
    for (let q = 3; q < pd.length; q += 4) if (pd[q]) { violate('drawn over the controls'); break; }
  };
  // What was drawn near a point, to name the culprit of a centre violation.
  // Every blit this frame, with the slot being drawn when it can be told.
  let blits = [];
  const blit = h.blit;
  if (traceSlot >= 0) {
    const step = h.stepCeremony;
    h.stepCeremony = function () { const opened = this.ceremony.opened; step.apply(this, arguments); if (opened !== (this.ceremony && this.ceremony.opened)) stats.trace.push([+h.clock.toFixed(2), this.ceremony ? 'opened' : 'ended', h.count, h.role[traceSlot]]); };
    const asc = h.ascendCeremony;
    h.ascendCeremony = function () { const ok = asc.apply(this, arguments); stats.trace.push([+h.clock.toFixed(2), 'ascend ' + ok, h.count]); return ok; };
    const act = h.setActive;
    h.setActive = function (on) { act.apply(this, arguments); stats.trace.push([+h.clock.toFixed(2), 'active ' + on, h.count, h.role[traceSlot]]); };
  }
  let drawing = -1;
  const drawRole = h.drawRole;
  h.drawRole = function (i) { drawing = i; const out = drawRole.apply(this, arguments); drawing = -1; return out; };
  h.blit = function (record, dir, frame, x, y, scale) { blits.push([x | 0, y | 0, record.id, new Error().stack.split('\n')[2].trim().split(' ')[1], drawing >= 0 ? {slot: drawing, role: ROLE[h.role[drawing]], job: h.job[drawing], age: +(h.clock - h.roleStart[drawing]).toFixed(2), index: h.roleIndex[drawing], phase: +h.phase[drawing].toFixed(3), inset: h.inset[drawing] | 0, travel: +h.travel[drawing].toFixed(2)} : null]); return blit.apply(this, arguments); };
  const near = (x, y) => {
    const out = {x, y, seats: []};
    for (let i = 0; i < h.count; i++) if (Math.abs(h.atX[i] - x) < 60 && Math.abs(h.atY[i] - y) < 60) out.seats.push({slot: i, kind: h.kinds[h.kind[i]].id, role: ROLE[h.role[i]], job: h.job[i], at: [h.atX[i] | 0, h.atY[i] | 0]});
    if (h.intruder) out.intruder = [h.intruder.x | 0, h.intruder.y | 0];
    if (h.visitor) out.visitor = true;
    if (h.flight) out.flight = true;
    if (h.chance) out.chance = [h.chance.kind, h.chance.x, h.chance.y];
    out.motes = h.motes.count;
    out.blits = blits.filter(b => Math.abs(b[0] - x) < 80 && Math.abs(b[1] - y) < 80);
    return out;
  };
  const hiddenClean = label => {
    const bad = [];
    for (let i = 0; i < h.count; i++) if (h.role[i] || h.manner[i] || h.doorWait[i] || h.side[i] || h.stride[i] !== 1) bad.push({slot: i, role: ROLE[h.role[i]], manner: h.manner[i], door: h.doorWait[i]});
    if (bad.length || h.chance || h.husk || h.flight || h.ceremony || h.crew || h.golden || h.visitor || h.intruder || h.doorOwner >= 0) violate('hiding leaves state behind (' + label + ')', {seats: bad.slice(0, 4), chance: !!h.chance, ceremony: !!h.ceremony, crew: !!h.crew, guests: h.guests()});
  };
  const frame = () => {
    fakeMs += DT * 1000;
    blits = [];
    const t0 = window.realNow();
    h.draw(DT);
    const ms = window.realNow() - t0;
    stats.ms.push(ms);
    stats.frames++;
    check();
    let roles = 0;
    for (let i = 0; i < h.count; i++) if (h.role[i] || h.manner[i] || h.doorWait[i]) roles++;
    if (roles >= 12 || h.ceremony || (h.chance && h.intruder)) stats.overlapMs.push(ms);
    if (stats.frames % 7 === 0) trails();
    if (stats.frames % 11 === 0) centre();
  };
  const update = () => { grow(); lastSnapshot = snapshot(); h.update(lastSnapshot); };

  h.setExclusions([panel]);
  late(); update();
  for (let k = 0; k < 30; k++) frame();
  stats.initial = {allocation: h.diagnostics().allocation, target: h.targetCount, jobs: h.jobDiagnostics()};
  let chanceEnd = -1, chanceKind = '';
  let nextUpdate = h.clock + 1;
  const end = h.clock + seconds;
  while (h.clock < end) {
    frame();
    if (chanceEnd >= 0 && h.clock >= chanceEnd) {
      if (h.chance && h.chance.kind === chanceKind) h.endChance(chanceKind, chanceKind !== 'snack' && rand() < 0.5);
      chanceEnd = -1;
    }
    if (h.clock >= nextUpdate) { nextUpdate = h.clock + 0.9 + rand() * 0.3; update(); }
    if (rand() > 0.03) continue;
    // About one event a second, chosen to overlap with whatever is running.
    const r = rand();
    if (r < 0.2) { purchase(); update(); count('purchase'); }
    else if (r < 0.25) { h.startleAt = -1e9; purchase(); purchase(); update(); count('burst'); }
    else if (r < 0.27) { h.greetNext = h.handoffNext = h.clock; count('manners now'); }
    else if (r < 0.3) {
      // A handoff starts between two foragers, and sometimes the allocation shrinks in the same frame, moving seats.
      let home = -1, out = -1;
      for (let i = 0; i < h.count; i++) if (!h.role[i] && !h.manner[i] && h.job[i] === 1) { if (h.jobState[i] === 2 && home < 0) home = i; else if (h.jobState[i] === 0 && out < 0) out = i; }
      if (home >= 0 && out >= 0) {
        h.travel[home] = h.travel[out] = h.routes.forage.span * 0.5;
        h.handoffNext = h.clock;
        if (h.handOver(home, out)) count('handoff');
        if (rand() < 0.5) { colony.units.queen = (colony.units.queen || 1) + 0.5; for (const id of Object.keys(colony.units).slice(3)) delete colony.units[id]; update(); count('handoff shrink'); }
      }
    }
    else if (r < 0.34) { h.layAt = h.clock; h.nurseNext = 0; count('lay'); }
    else if (r < 0.37) { h.processionAt = h.clock; count('procession'); }
    else if (r < 0.40) { const lead = h.lead >= 0 ? h.kinds[h.kind[h.lead]].id : ''; if (lead) h.queueParade(lead); count('parade'); }
    else if (r < 0.45) { h.showGolden(!h.golden); count('golden'); }
    else if (r < 0.5) { h.showVisitor(h.visitor ? null : pick(['monarch_butterfly', 'ladybug', 'garden_snail']), 8 + rand() * 30, rand() < 0.5 ? 1 : -1); count('visitor'); }
    else if (r < 0.56) { h.startleAt = -1e9; h.showIntruder(h.intruder ? null : pick(['spider', 'centipede']), 5 + rand() * 12); count('intruder'); }
    else if (r < 0.66) {
      if (!h.chance) {
        const kind = pick(['snack', 'egg', 'molt']);
        const art = kind === 'snack' ? pick(['snack_chip', 'snack_cereal_ring', 'snack_pizza_crust']) : kind === 'egg' ? 'egg_case' : 'molting_roach';
        const secs = 6 + rand() * 30;
        if (h.showChance(kind, art, secs)) { chanceKind = kind; chanceEnd = h.clock + (kind === 'snack' ? secs : rand() * secs); count('chance ' + kind); }
      } else if (chanceEnd < 0 || rand() < 0.5) { h.endChance(h.chance.kind, rand() < 0.5); chanceEnd = -1; count('end chance'); }
    }
    else if (r < 0.69) { h.setNight(true); h.flightNext = 0; if (h.nuptialFlight()) count('flight'); }
    else if (r < 0.71) { h.setNight(!h.night); count('night'); }
    else if (r < 0.75) {
      if (h.ascendCeremony()) {
        count('ascend');
        h.cue('ascend');
        // The engine has already reset; the page refreshes during the ceremony and the snapshot is held.
        shrink();
        update();
        if (rand() < 0.5) { for (let k = 0; k < 30; k++) frame(); purchase(); update(); }
      }
    }
    else if (r < 0.8) {
      // Hide in the middle of everything, refresh while hidden, and come back.
      h.setActive(false);
      hiddenClean('on hide');
      const clock = h.clock, phases = Array.from(h.phase.subarray(0, h.count));
      for (let k = 0; k < 20; k++) { fakeMs += 34; h.tick(fakeMs); }
      if (rand() < 0.5) update();
      hiddenClean('after an update while hidden');
      if (h.clock !== clock || (h.count === phases.length && Array.from(h.phase.subarray(0, h.count)).some((p, i) => p !== phases[i]) && false)) violate('advanced while hidden');
      fakeMs += 10000;
      h.setActive(true); cancelAnimationFrame(h.request); h.request = null;
      count('hide');
    }
    else if (r < 0.85) { h.level = rand() * 3 | 0; h.reconcile(); h.motes.setCap([64, 40, 20][h.level]); count('quality ' + h.level); }
    else if (r < 0.9) { if (rand() < 0.5) shrink(); else late(); update(); count('allocation jump'); }
    else if (r < 0.93) { h.cue(pick(['forage', 'milestone'])); count('cue'); }
    else { h.startleAt = -1e9; h.startle(h.baseX + h.entryX, h.baseY + h.entryY); count('startle'); }
  }
  h.setActive(false);
  hiddenClean('at the end');
  h.setActive(true); cancelAnimationFrame(h.request); h.request = null;
  const sorted = stats.ms.slice().sort((a, b) => a - b);
  const overlap = stats.overlapMs.slice().sort((a, b) => a - b);
  const q = (list, f) => list.length ? +list[Math.min(list.length - 1, Math.floor(list.length * f))].toFixed(2) : 0;
  return {violations, counts: seen, stats: {trace: stats.trace.slice(-30), initial: stats.initial, frames: stats.frames, p50: q(sorted, 0.5), p95: q(sorted, 0.95), max: q(sorted, 1), overlapFrames: overlap.length, overlapP95: q(overlap, 0.95), overlapMax: q(overlap, 1), peakSeats: stats.peakSeats, peakRoles: stats.peakRoles, peakAt: stats.peakAt, trailChecks: stats.trailChecks, centreChecks: stats.centreChecks, events: stats.events, behaviors: h.behaviors, habitatEvents: h.events}};
}

// Deterministic overlaps that once broke, each set up directly. Returns a list of failures.
function scenarios() {
  const h = habitat;
  const failures = [];
  const expect = (ok, label, detail) => { if (!ok) failures.push({label, detail}); };
  const frames = n => { for (let k = 0; k < n; k++) h.draw(1 / 30); };
  const unit = (id, tier, count) => ({id, tier, owned: true, countExact: count});
  const colony = (units, extra) => Object.assign({populationExact: '1e+40', visibleUnits: units, upgradeLevels: {hatchery: '3'}, resources: [{id: 'meat', amount: '1e+40', rate: '1e+30'}, {id: 'larva', amount: '1e+20', rate: '1e+10'}, {id: 'territory', amount: '1e+30'}]}, extra);
  const mid = colony([unit('drone', 1, '1e+40'), unit('queen', 2, '1e+30'), unit('nest', 3, '1e+20'), unit('swarmling', 1, '1e+30'), unit('spider', 3, '1e+20'), unit('stinger', 2, '1e+20'), unit('nightbug', 1, '1e+20')]);
  const small = colony([unit('drone', 1, '1e+40'), unit('queen', 2, '1e+30')]);
  const fresh = () => { h.setActive(false); h.setActive(true); cancelAnimationFrame(h.request); h.request = null; h.update(mid); frames(60); };

  // A handoff whose carrier is moved to another seat by a reallocation still completes.
  fresh();
  const last = h.count - 1;
  let out = -1, other = -1;
  for (let i = 0; i < last; i++) { if (h.role[i] || i === h.lead || h.layQueen === i) continue; if (out < 0) out = i; else if (other < 0 && h.leader[i] < 0) other = i; }
  h.role[last] = h.role[out] = 0;
  h.job[last] = h.job[out] = 1;
  h.jobState[last] = 2; h.jobState[out] = 0;
  h.travel[last] = h.travel[out] = h.routes.forage.span * 0.5;
  h.handoffNext = 0;
  const handoffs = h.behaviors.handoffs;
  const started = h.handOver(last, out);
  h.remove(other);
  frames(90);
  expect(started && h.behaviors.handoffs === handoffs + 1 && !h.manner[other] && !h.manner[out], 'A moved carrier still hands its crumb over', {started, handoffs: h.behaviors.handoffs - handoffs, manners: [h.manner[other], h.manner[out]]});

  // A promotion's new roach waits for the door like any emerger, so only one walks out at a time.
  fresh();
  let outAtOnce = 0, promotions = h.events.promotions;
  for (let round = 0; round < 6; round++) {
    h.burstAt = -1e9; h.startleAt = -1e9;
    h.burst(['queen'], []);
    for (let k = 0; k < 45; k++) {
      h.draw(1 / 30);
      let out = 0;
      for (let i = 0; i < h.count; i++) if (h.role[i] === 1) { const t = (h.clock - h.roleStart[i] - h.roleIndex[i] * 0.3) / 1.3; if (t >= 0 && t < 1) out++; }
      outAtOnce = Math.max(outAtOnce, out);
    }
  }
  expect(h.events.promotions > promotions && outAtOnce <= 1, 'Promoted roaches take turns at the door', {promotions: h.events.promotions - promotions, outAtOnce});

  // Roaches stopped nose to nose or handing over a crumb are left to finish before any role takes them.
  fresh();
  const greeters = [];
  for (let i = 0; i < h.count && greeters.length < 2; i++) if (!h.role[i] && h.kinds[h.kind[i]].id === 'hatchling') greeters.push(i);
  let taken = -1;
  if (greeters.length === 2) {
    h.pair(greeters[0], greeters[1], 1, 0.6);
    h.nurseNext = 0;
    h.startNursery(0);
    h.startleAt = -1e9;
    h.startle(h.atX[greeters[0]], h.atY[greeters[0]]);
    taken = h.role[greeters[0]] || h.role[greeters[1]];
  }
  expect(taken === 0, 'A greeting is not interrupted by the nursery line or a startle', {taken, greeters});

  // A work crew comes out through a door whose show queue is full.
  fresh();
  const roamers = [];
  for (let i = 0; i < h.count && roamers.length < 5; i++) if (!h.role[i] && !h.job[i] && i !== h.lead && h.leader[i] < 0) roamers.push(i);
  for (const i of roamers.slice(0, 3)) h.emerge(i, 0);
  h.assume(roamers[3], 21, 0); h.assume(roamers[4], 21, 1);
  h.crew = {start: h.clock, due: h.clock, size: 2};
  frames(30 * 40);
  let crew = 0;
  for (let i = 0; i < h.count; i++) if (h.role[i] === 21) crew++;
  expect(!h.crew && !crew, 'Crew members leave the nest even when the door queue is full', {crew, holding: !!h.crew});

  // A seat freed by a smaller allocation keeps no role for whoever is spawned there next.
  fresh();
  for (let i = 0; i < h.count; i++) if (!/^(drone|queen|hatchling)$/.test(h.kinds[h.kind[i]].id)) h.assume(i, 32, 0);
  const before = h.count;
  h.update(colony([unit('drone', 1, '3')]));
  let stale = 0;
  for (let i = h.count; i < before; i++) if (h.role[i] || h.job[i] || h.manner[i] || h.doorWait[i]) stale++;
  expect(!stale, 'A respawned seat starts without a role', {stale});

  // Nothing is sent out of the door while hidden, even by a refresh that reassigns jobs.
  fresh();
  h.showGolden(true); h.showIntruder('centipede', 10); h.setNight(true); h.flightNext = 0; h.nuptialFlight();
  h.setActive(false);
  let roles = 0;
  for (let i = 0; i < h.count; i++) if (h.role[i] || h.doorWait[i]) roles++;
  for (const snapshot of [small, mid, colony([unit('drone', 1, '1e+60'), unit('swarmling', 1, '1e+50')]), mid]) {
    h.update(snapshot);
    for (let i = 0; i < h.count; i++) if (h.role[i] || h.doorWait[i]) roles++;
  }
  h.setActive(true); cancelAnimationFrame(h.request); h.request = null;
  h.setNight(false);
  expect(!roles, 'No role is taken while hidden', {roles});

  // An intruder of an owned species outlives that species leaving the colony.
  fresh();
  h.showIntruder('spider', 10);
  h.update(small);
  let threw = '';
  try { frames(60); } catch (error) { threw = error.message; }
  h.showIntruder(null);
  expect(!threw, 'An intruder keeps its sprite when its species leaves the allocation', threw);

  // A refresh that arrives after the ceremony's doors close is applied, not dropped.
  fresh();
  h.ascendCeremony();
  h.update(small);
  frames(75);
  const late = colony([unit('drone', 1, '1e+3')]);
  h.update(late);
  frames(75);
  expect(!h.ceremony && h.snapshot === late, 'A refresh held after the doors close is applied when the ceremony ends', {ceremony: !!h.ceremony});
  // Whatever Red catches now is drawn last, over a warm halo and under the Red capsule; nothing else gets a halo.
  fresh();
  const order = [];
  const drawImage = h.ctx.drawImage;
  h.ctx.drawImage = function (source) { order.push(source); return drawImage.apply(this, arguments); };
  const lastDraws = () => { order.length = 0; h.draw(1 / 30); return order.slice(-3); };
  const isHalo = source => Object.values(h.catchGlow.sizes).includes(source);
  const visitor = RoachHabitat.critterCanvas('monarch_butterfly', 64);
  h.showVisitor('monarch_butterfly', 40, 1);
  frames(150);
  let tail = lastDraws();
  const visitorLast = isHalo(tail[0]) && tail[2] === h.redSprite && !!h.chanceDiagnostics().halo;
  h.showGolden(true);
  frames(5);
  tail = lastDraws();
  const goldenLast = isHalo(order[order.length - 6] || null) || order.slice(-6).some(isHalo);
  const goldenTop = tail[2] === h.redSprite && order.indexOf(h.visitor.right) < order.lastIndexOf(h.golden.record.atlas);
  const haloCount = order.filter(isHalo).length;
  h.showGolden(false); h.showVisitor(null);
  frames(2);
  const none = !h.chanceDiagnostics().halo;
  h.ctx.drawImage = drawImage;
  expect(visitorLast && goldenLast && goldenTop && haloCount === 1 && none, 'Red\'s target is drawn last over a halo, and only it has one', {visitorLast, goldenLast, goldenTop, haloCount, none, visitor: !!visitor});
  return failures;
}

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const failures = [];
  try {
    const open = async errors => {
      const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent('<style>html,body{margin:0;height:100%;background:transparent}canvas{position:fixed;left:0;top:0;width:100%;height:100%}#panel{position:fixed;right:24px;bottom:24px;width:480px;height:150px}</style><canvas></canvas><div id="panel"></div>');
      for (const name of ['nest-sprites.js', 'nest-art.js', 'critters.js', 'creature-sprites.js', 'motes.js', 'habitat.js']) await page.addScriptTag({path: app(name)});
      await page.waitForFunction(() => RoachHabitat.creaturesReady() && RoachHabitat.critterCanvas('event_egg_case', 64).getContext('2d').getImageData(0, 0, 64, 64).data.some((v, k) => k % 4 === 3 && v));
      await page.evaluate(() => {
        window.realNow = performance.now.bind(performance);
        window.habitat = new RoachHabitat(document.querySelector('canvas'));
        habitat.setActive(true); cancelAnimationFrame(habitat.request); habitat.request = null;
      });
      return page;
    };
    const scenarioErrors = [];
    const scenarioPage = await open(scenarioErrors);
    const broken = await scenarioPage.evaluate(scenarios);
    for (const f of broken) console.log('  scenario: ' + f.label + ' ' + JSON.stringify(f.detail || ''));
    if (broken.length || scenarioErrors.length) failures.push({scenarios: broken, errors: scenarioErrors});
    await scenarioPage.close();
    for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
      const errors = [];
      const page = await open(errors);
      const result = await page.evaluate(drive, [seed, minutes * 60, option('trace', -1)]);
      if (result.stats.trace.length) console.log('  trace: ' + JSON.stringify(result.stats.trace));
      console.log(JSON.stringify({seed, violations: result.violations.length, counts: result.counts, stats: result.stats}));
      for (const v of result.violations) console.log('  seed ' + seed + ': ' + v.kind + ' at ' + v.at + 's ' + JSON.stringify(v.detail || ''));
      if (errors.length) console.log('  page errors: ' + errors.join('; '));
      if (result.violations.length || errors.length) failures.push({seed, violations: result.violations, errors});
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(failures, [], 'Overlapping habitat behaviours keep every invariant');
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
