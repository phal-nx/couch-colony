/* Transparent, bounded colony rendering. The engine owns all economy and time. */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2;
  var MAX_ROACHES = 64;
  var MAX_KINDS = 12;
  // Walkers face one of four exact quarter turns (east, south, west, north) or the four diagonals between them.
  var DIRS = 4;
  var SQRT1_2 = Math.SQRT1_2;
  var DX = [1, 0, -1, 0, SQRT1_2, -SQRT1_2, -SQRT1_2, SQRT1_2];
  var DY = [0, 1, 0, -1, SQRT1_2, SQRT1_2, -SQRT1_2, -SQRT1_2];
  var FRAMES = 4;
  // Gait frames per second, independent of the render rate.
  var FRAME_RATE = 1000 / ((root.RoachCreatures && root.RoachCreatures.frameMs) || 125);
  // Swarmwarp speeds the walk cycle only. Position steps stay at the species pace.
  function gaitMul(self) {
    return self.clock < self.warpUntil ? 1.5 : 1;
  }
  var Motes = root.RoachMotes || {};
  // The creature sheet (app/creature-sprites.js) once decoded; walkers, props and motes are cut from it.
  var creatureSheet = null;
  var ATLAS_BUDGET = 6 * 1024 * 1024;
  var FPS = [30, 20, 15];
  var CAPS = [64, 48, 32];
  var QUALITY = ['full', 'balanced', 'lean'];
  var BROOD = 3;
  // Hatchlings drawn inside a dormant nest, one per hatchling held up to this many.
  var DORMANT_BROOD = 3;
  var EDGE_INSET = 24;
  var OUTLINE = '#32261d';
  var MAX_MARKS = 56;
  var SHEET_WIDTH = 1024;
  var SHEET_HEIGHT = 384;
  var BASE_MARGIN = 6;
  var TERRAIN = ['trail', 'trail', 'burrow', 'tufts', 'tufts', 'soil'];
  var CRUMB_COLORS = ['#ead198', '#d9b26a', '#f2dfae', '#c99a55', '#e4c27e'];
  var SOIL_COLORS = ['rgba(150,112,70,.42)', 'rgba(118,86,54,.4)', 'rgba(176,140,96,.36)', 'rgba(96,70,46,.38)'];
  // Purchase feedback: one nest burst per gap, walkers staggered out of the entrance, one parade and one caravan at a time.
  var BURST_GAP = 2;
  var GLOW_SECONDS = 1.4;
  var EMERGE_MAX = 3;
  var CARAVAN_MAX = 6;
  // The quickest any seat walks on purpose, as a multiple of its own speed. A deliberate trip to a far target takes
  // proportionally longer, or a nearer seat or target is chosen, so nothing slides across the screen.
  var HURRY = 2;
  // A new tier's parade: up to PARADE_ESCORT walk behind it PARADE_GAP px apart, roaches within PARADE_WATCH px stop
  // to watch it pass for PARADE_PAUSE s, and its halo is at most PARADE_HALO px across.
  var PARADE_ESCORT = 3;
  var PARADE_GAP = 30;
  var PARADE_WATCH = 120;
  var PARADE_PAUSE = 1.4;
  var PARADE_HALO = 100;
  var PROCESSION_PACE = 1.25;
  var EMERGE = 1;
  var PARADE = 2;
  var CARAVAN = 3;
  // Standing jobs. Lane jobs shuttle between two lap positions (out, rest, back, rest); the rest move freely near the nest.
  var ROAM = 0;
  var FORAGE = 1;
  var CLAIM = 2;
  var PROCESSION = 3;
  var RUNNER = 4;
  var TEND = 5;
  var HOVER = 6;
  var SWEEP = 7;
  var JOB_NAMES = ['roam', 'forage', 'claim', 'procession', 'runner', 'tend', 'hover', 'sweep'];
  var ROLE_NAMES = {0: 'lane', 1: 'emerge', 2: 'parade', 3: 'caravan', 4: 'chase', 20: 'enter', 21: 'crew', 22: 'scatter', 23: 'guard', 24: 'nurse', 30: 'carry', 31: 'hatch', 32: 'file-in', 33: 'wait-in', 34: 'retire', 35: 'dung-watch'};
  var JOBS = {drone: FORAGE, queen: TEND, nightbug: HOVER, moth: HOVER, bat: SWEEP};
  // Rest in seconds at the far end and back at the nest.
  var RESTS = [[0, 0], [1, 1.6], [4, 2], [0, 4], [0.5, 0], [0, 0], [0, 0], [0, 0]];
  // Chance events. Each guest borrows an entity seat, so the scene never exceeds MAX_ROACHES.
  var CHASE = 4;
  var CHASERS = 4;
  var VISITOR_SIZE = 64;
  var SPARK_EVERY = 0.3;
  // Mote budget by quality level; the pool itself never grows past RoachMotes.MAX.
  var MOTE_CAPS = [64, 40, 20];
  // Ambient nest dust: one speck about every NEST_DUST_EVERY seconds, only at quality levels below NEST_DUST_LEVELS.
  var NEST_DUST_EVERY = 1.5;
  var NEST_DUST_LEVELS = 2;
  var CUE_GAP = 400;
  // Tiny half-size roaches walking the nest's tunnels; separate from the 64 lane entities and much cheaper.
  var MOVERS = 10;
  var MOVER_SPEED = 16;
  // Rectangles drawn on the moving layer in one frame; more than this and the next frame clears the whole canvas.
  var DIRTY_MAX = 384;
  // Glows up to this many pixels across are resampled once per whole-pixel size and kept, at most GLOW_SIZES of them.
  var GLOW_CACHED = 128;
  var GLOW_SIZES = 16;

  function def(chain, tier, size, speed, body, head, accent, traits) {
    var spec = {chain: chain, tier: tier, size: size, speed: speed, body: body, head: head, accent: accent, wide: 9, length: 1, legs: 1, antennae: 1, alpha: 0.92};
    for (var key in traits) spec[key] = traits[key];
    return spec;
  }

  // Colours and traits drive DOM icons until the critter atlas loads; walkers are drawn from the strips.
  var SPECIES = {
    hatchling: def('brood', 0, 20, 28, '#e2d2b4', '#c4ae8c', '#f2e8d4', {wide: 7, length: 0.8, legs: 0.75, antennae: 0.7, alpha: 0.72}),
    // Natural insect tones. Neighbouring main-chain tiers alternate light and dark and differ in markings as well as hue.
    drone: def('meat', 1, 30, 60, '#9a7450', '#3e2c1e', '#d8c0a0', {}),
    queen: def('meat', 2, 36, 28, '#c49a52', '#4a3420', '#efdcae', {wide: 12, crown: 1}),
    nest: def('meat', 3, 36, 34, '#7c4026', '#3a1c10', '#d49a70', {wide: 10, egg: 1, stripes: true}),
    greaterqueen: def('meat', 4, 40, 26, '#3c2a22', '#1e1410', '#c8ccd0', {wide: 12, crown: 2, bands: true}),
    hive: def('meat', 5, 40, 30, '#585a32', '#2c2e18', '#c8c890', {wide: 11, egg: 2, stripes: true}),
    hivequeen: def('meat', 6, 44, 24, '#b8702c', '#3a2814', '#f0d49a', {wide: 13, crown: 3, stripes: true}),
    empress: def('meat', 7, 46, 22, '#5a80a2', '#18242c', '#c8d8d0', {wide: 13, crown: 3, mantle: true}),
    prophet: def('meat', 8, 44, 26, '#2e4a34', '#16261a', '#c8dcb8', {wide: 11, spots: true, glossy: true}),
    goddess: def('meat', 9, 46, 22, '#d6ccb0', '#4a3e2c', '#f4ecd4', {wide: 12, halo: 1}),
    swarmling: def('territory', 1, 24, 96, '#9aa080', '#4a5038', '#d8dcc0', {wide: 6, length: 0.85, spots: true}),
    stinger: def('territory', 2, 28, 70, '#8a6048', '#3a281e', '#d8b090', {wide: 8, stinger: true, stripes: true}),
    spider: def('territory', 3, 34, 56, '#6a5646', '#382c22', '#d0bc9c', {form: 'spider', wide: 9}),
    mosquito: def('territory', 4, 32, 84, '#86847a', '#3a3830', '#dedac8', {wide: 5, legs: 1.45, wings: 'thin', proboscis: true}),
    locust: def('territory', 5, 36, 80, '#949a68', '#484c2e', '#dadcae', {wide: 8, length: 1.15, wings: 'long'}),
    roach: def('territory', 6, 38, 64, '#6e4228', '#2c1a12', '#d0a07a', {wide: 11, stripes: true, glossy: true}),
    giantspider: def('territory', 7, 44, 44, '#443c36', '#221e1a', '#d6c09a', {form: 'spider', wide: 11, hairy: true}),
    centipede: def('territory', 8, 50, 50, '#8c4a2a', '#422212', '#e0a878', {form: 'centipede', wide: 5}),
    wasp: def('territory', 9, 40, 76, '#c89a3e', '#342810', '#2a2118', {wide: 8, wings: 'double', stinger: true, bands: true}),
    devourer: def('territory', 10, 46, 40, '#5e3a34', '#2a1614', '#cc9888', {wide: 13, mandibles: true, spots: true}),
    goon: def('territory', 11, 50, 34, '#56606e', '#242a34', '#c0c8d4', {wide: 14, armor: true}),
    nightbug: def('energy', 1, 28, 60, '#3e4630', '#22281a', '#d0d888', {wide: 8, glow: true}),
    moth: def('energy', 2, 36, 70, '#a89880', '#4a4034', '#e6dcc0', {wide: 7, wings: 'broad', antennae: 0.8}),
    bat: def('energy', 3, 44, 76, '#463c40', '#28222a', '#b0a2b0', {form: 'bat'})
  };
  // Late tiers keep a muted tint and a subtle aura so the endgame still feels special without looking garish.
  ['#6f9a7e', '#b49a50', '#6e8aa6', '#a8705a', '#e2dccc'].forEach(function (body, i) {
    SPECIES['pantheon' + (i ? i + 1 : '')] = def('meat', 10 + i, 46 + i, 22, body, '#463a40', '#f4ecd4', {wide: 12, halo: 2, rays: i + 1});
  });
  ['#4c5680', '#4f9a96', '#7a64a0', '#9a4e5e', '#b89a58', '#cfd0d8'].forEach(function (body, i) {
    SPECIES['overmind' + (i ? i + 1 : '')] = def('meat', 15 + i, 48 + i, 20, body, '#262a3c', '#e4e8f0', {wide: 13, neural: i + 1});
  });

  // Metallic and brighter than any caste, larger than a queen, so it is never read as an amber nest queen.
  var GOLDEN = def('golden', 0, 44, 34, '#f4c62e', '#7a4e0c', '#fff6c4', {wide: 11, metal: true, bands: true, alpha: 1});

  // Read scientific notation without converting huge engine decimals to Infinity.
  function magnitude(value) {
    var match = /^([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+)|([KMBT]))?$/i.exec(String(value || '0').replace(/,/g, ''));
    if (!match) return 0;
    var mantissa = Number(match[1].length > 15 ? match[1].slice(0, 15) : match[1] + '.' + (match[2] || '').slice(0, 15));
    if (!(mantissa > 0)) return 0;
    var power = match[3] ? Number(match[3]) : match[4] ? 'KMBT'.indexOf(match[4].toUpperCase()) * 3 + 3 : 0;
    if (match[1].length > 15) power += match[1].length - 15;
    return Math.max(0, Math.min(100000, Math.log(mantissa) / Math.LN10 + power));
  }

  function positive(value) {
    return /[1-9]/.test(String(value || '0').split(/[eE]/)[0]);
  }

  // Log-scale display step for an upgrade level, so 10 and 100 levels look clearly different.
  function step(value) {
    return positive(value) ? Math.min(12, 1 + Math.floor(magnitude(value) * 3)) : 0;
  }

  // Seeded so a re-bake keeps every earlier mark where it was and only adds new ones.
  function random(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One representative per order of magnitude, so a group's size reads as its count; tiny counts show as they are.
  function groupSize(exact, log) {
    var small = /^[0-9]{1,2}$/.test(exact) ? Math.max(1, Number(exact)) : MAX_ROACHES;
    return Math.min(small, MAX_ROACHES, Math.max(2, Math.floor(log) + 1));
  }

  // Upgrade levels are strings; short integers compare exactly and huge ones by magnitude.
  function rose(before, after) {
    if (!positive(after)) return false;
    if (!positive(before)) return true;
    if (/^[0-9]{1,15}$/.test(before) && /^[0-9]{1,15}$/.test(after)) return Number(after) > Number(before);
    return magnitude(after) > magnitude(before) + 1e-9;
  }

  function glowSprite(document, rgb) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(' + rgb + ',.85)');
    gradient.addColorStop(0.45, 'rgba(' + rgb + ',.35)');
    gradient.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    canvas.sizes = {};
    return canvas;
  }


  // The remote's thin red button as a 16x8 pixel capsule (o outline, h highlight, r face, s shade).
  // It marks whatever Red catches now, on the habitat and in the overlay's Catch chip. Each scale
  // is drawn once from this grid, then redrawn from app/art/red_key_capsule.png when that loads,
  // so replacing the file with new art needs no code change.
  var RED_GLYPH = ['..oooooooooooo..', '.ohhhhhhhhhhhho.', 'orrrrrrrrrrrrrro', 'orrrrrrrrrrrrrro', 'orrrrrrrrrrrrrro', 'osssssssssssssso', '.osssssssssssso.', '..oooooooooooo..'];
  var RED_COLORS = {o: '#24100d', h: '#cf7563', r: '#ae4437', s: '#86312a'};
  var RED_SCALE = 2;
  var redGlyphs = {};
  var redArt = null;
  function paintRedGlyph(canvas, scale) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (redArt) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(redArt, 0, 0, canvas.width, canvas.height);
      return;
    }
    for (var y = 0; y < RED_GLYPH.length; y++) {
      for (var x = 0; x < RED_GLYPH[y].length; x++) {
        var color = RED_COLORS[RED_GLYPH[y].charAt(x)];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  function redGlyph(document, scale) {
    if (redGlyphs[scale]) return redGlyphs[scale];
    var view = document.defaultView;
    if (redArt === null && view && view.Image) {
      redArt = false;
      var image = new view.Image();
      image.onload = function () {
        if (image.naturalWidth !== RED_GLYPH[0].length || image.naturalHeight !== RED_GLYPH.length) return;
        redArt = image;
        for (var key in redGlyphs) paintRedGlyph(redGlyphs[key], Number(key));
      };
      image.src = 'art/red_key_capsule.png';
    }
    var canvas = document.createElement('canvas');
    canvas.width = RED_GLYPH[0].length * scale;
    canvas.height = RED_GLYPH.length * scale;
    canvas.className = 'red-glyph pixel-art';
    canvas.setAttribute('aria-hidden', 'true');
    paintRedGlyph(canvas, scale);
    redGlyphs[scale] = canvas;
    return canvas;
  }

  function priority(id) {
    return SPECIES[id].tier + (SPECIES[id].chain === 'meat' ? 100 : 0);
  }

  // Four compass rows, then four diagonals baked once underneath them.
  var FACINGS = 8;
  function atlasCost(size) {
    return FACINGS * FRAMES * size * size * 4;
  }

  // The nearest of the four quarter turns. Kept for guests that stay on a compass point.
  function quarter(angle) {
    return Math.round(angle * 2 / Math.PI) & 3;
  }

  // Rows 0 to 3 are east, south, west, north. Rows 4 to 7 are the diagonals between them,
  // so a path that is not a right angle gets the nearest 45 degree face.
  function facingRow(angle) {
    var step = Math.round(angle * 4 / Math.PI) & 7;
    return (step & 1) ? 4 + (step >> 1) : (step >> 1);
  }

  // The strip for a species, or the base strip of a numbered tier that is recoloured from it.
  function stripFor(id) {
    var c = root.RoachCreatures;
    if (!c) return null;
    return c.strips[id] || (c.tints[id] && c.strips[c.tints[id].base]) || null;
  }

  function tileOf(id) {
    var strip = stripFor(id);
    return strip ? strip.size : SPECIES[id].size;
  }

  // A prop from the creature sheet, centred on a whole pixel. Returns its size, or 0 when nothing was drawn.
  function drawProp(ctx, name, x, y) {
    var p = creatureSheet && root.RoachCreatures.props[name];
    if (!p) return 0;
    ctx.drawImage(creatureSheet, p.x, p.y, p.size, p.size, Math.round(x - p.size / 2), Math.round(y - p.size / 2), p.size, p.size);
    return p.size;
  }


  function oval(ctx, x, y, rx, ry, rotation) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation || 0, 0, TAU);
  }

  function line(ctx, color, width) {
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = width + 2.1; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  function fill(ctx, color, outline) {
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = outline || 2.6; ctx.stroke();
  }

  function dot(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  }

  function paintBat(ctx, s, flap) {
    var reach = 0.78 + flap * 0.22;
    for (var side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(6, side * 5); ctx.lineTo(10, side * 30 * reach); ctx.lineTo(2, side * 25 * reach); ctx.lineTo(-4, side * 36 * reach);
      ctx.lineTo(-9, side * 24 * reach); ctx.lineTo(-17, side * 30 * reach); ctx.lineTo(-12, side * 6); ctx.closePath();
      fill(ctx, s.body, 2);
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(2, side * 6); ctx.lineTo(10, side * 30 * reach); ctx.moveTo(0, side * 6); ctx.lineTo(-4, side * 36 * reach); ctx.moveTo(-3, side * 6); ctx.lineTo(-17, side * 30 * reach); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(15, side * 3); ctx.lineTo(22, side * 9); ctx.lineTo(12, side * 7); ctx.closePath(); fill(ctx, s.head, 1.6);
    }
    oval(ctx, -2, 0, 15, 9); fill(ctx, s.head);
    oval(ctx, 13, 0, 7, 6); fill(ctx, s.body);
    dot(ctx, 17, -2.4, 1.3, s.accent); dot(ctx, 17, 2.4, 1.3, s.accent);
  }

  function paintSpider(ctx, s, phase) {
    var wide = s.wide;
    for (var side = -1; side <= 1; side += 2) {
      for (var leg = 0; leg < 4; leg++) {
        var reach = (1.5 - leg) * 8;
        var sway = Math.sin(phase + leg * 1.7 + side) * 3.5;
        ctx.beginPath();
        ctx.moveTo(6 + reach * 0.3, side * 4);
        ctx.lineTo(8 + reach * 1.3 + sway, side * (wide + 12));
        ctx.lineTo(8 + reach * 2.1 + sway, side * (wide + 22));
        line(ctx, s.body, 1.6);
      }
    }
    oval(ctx, -14, 0, 16, 13); fill(ctx, s.body);
    if (s.hairy) {
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var hair = 0; hair < 14; hair++) {
        var angle = hair / 14 * TAU;
        ctx.moveTo(-14 + Math.cos(angle) * 15, Math.sin(angle) * 12);
        ctx.lineTo(-14 + Math.cos(angle) * 19, Math.sin(angle) * 15.5);
      }
      ctx.stroke();
    }
    ctx.fillStyle = s.accent;
    ctx.beginPath(); ctx.moveTo(-22, -5); ctx.lineTo(-14, 0); ctx.lineTo(-22, 5); ctx.lineTo(-6, 5); ctx.lineTo(-14, 0); ctx.lineTo(-6, -5); ctx.closePath(); ctx.fill();
    oval(ctx, 8, 0, 10, 8); fill(ctx, s.head);
    dot(ctx, 15, -2, 1.4, s.accent); dot(ctx, 15, 2, 1.4, s.accent); dot(ctx, 13.5, -4.5, 1.1, s.accent); dot(ctx, 13.5, 4.5, 1.1, s.accent);
  }

  function paintCentipede(ctx, s, phase) {
    var wide = s.wide;
    var side, segment, x;
    for (segment = 0; segment < 9; segment++) {
      x = 30 - segment * 8;
      var sway = Math.sin(phase + segment * 0.9) * 3;
      for (side = -1; side <= 1; side += 2) {
        ctx.beginPath(); ctx.moveTo(x, side * (wide - 1)); ctx.lineTo(x - 3 + sway * side, side * (wide + 9));
        line(ctx, s.accent, 1.2);
      }
    }
    for (side = -1; side <= 1; side += 2) {
      ctx.beginPath(); ctx.moveTo(-36, side * 2); ctx.lineTo(-43, side * 7); line(ctx, s.accent, 1.2);
      ctx.beginPath(); ctx.moveTo(38, side * 2); ctx.quadraticCurveTo(42, side * 6, 42, side * 13); line(ctx, s.accent, 1.1);
    }
    for (segment = 8; segment >= 0; segment--) {
      oval(ctx, 30 - segment * 8, 0, 5.4, wide + 1); fill(ctx, segment % 2 ? s.body : s.head, 2);
    }
    oval(ctx, 35, 0, 5.5, 5); fill(ctx, s.head, 2);
  }

  // Draw one creature facing +x inside a 96-unit tile centred on the origin, within a 47-unit radius.
  function paint(ctx, s, frame) {
    var phase = frame * Math.PI / 2;
    var flap = Math.cos(phase);
    var wide = s.wide;
    var side, i;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.form === 'bat') return paintBat(ctx, s, flap);
    if (s.form === 'spider') return paintSpider(ctx, s, phase);
    if (s.form === 'centipede') return paintCentipede(ctx, s, phase);
    var back = -5 - (s.length - 1) * 10 - 20 * s.length;
    if (s.neural) {
      ctx.strokeStyle = 'rgba(196,206,228,.4)'; ctx.lineWidth = 1.6;
      oval(ctx, -2, 0, 31, wide + 10); ctx.stroke();
      if (s.neural > 3) { ctx.strokeStyle = 'rgba(196,206,228,.24)'; oval(ctx, -2, 0, 37, wide + 16); ctx.stroke(); }
    }
    if (s.halo > 1) { oval(ctx, -4, 0, 30, wide + 9); ctx.fillStyle = 'rgba(240,228,190,.14)'; ctx.fill(); }
    if (s.glow) { oval(ctx, back + 3, 0, 14, wide + 4); ctx.fillStyle = 'rgba(214,224,140,.22)'; ctx.fill(); }
    if (s.wings === 'broad') {
      for (side = -1; side <= 1; side += 2) {
        ctx.beginPath(); ctx.moveTo(8, side * 3); ctx.lineTo(-2, side * (32 + flap * 3));
        ctx.quadraticCurveTo(-20, side * (30 + flap * 3), -26, side * 12); ctx.lineTo(-14, side * 3); ctx.closePath();
        fill(ctx, s.body, 2);
        dot(ctx, -10, side * 17, 4.2, s.accent); dot(ctx, -10, side * 17, 2, s.head);
      }
    }
    for (side = -1; side <= 1; side += 2) {
      for (i = 0; i < 3; i++) {
        var sway = Math.sin(phase + i * 2 + side) * 4;
        ctx.beginPath();
        ctx.moveTo(9 - i * 9, side * (wide - 2));
        ctx.lineTo(12 - i * 12 + sway, side * (wide + 10 * s.legs));
        ctx.lineTo(4 - i * 13 + sway, side * (wide + 17 * s.legs));
        line(ctx, s.body, 1.5);
      }
      if (s.antennae) {
        ctx.beginPath(); ctx.moveTo(16, side * 4);
        ctx.quadraticCurveTo(27 * s.antennae, side * 14 * s.antennae, 16 + 22 * s.antennae, side * (wide < 7 ? 17 : 11) * s.antennae);
        line(ctx, s.body, 1.3);
      }
    }
    if (s.stinger) {
      ctx.beginPath(); ctx.moveTo(back + 2, -3); ctx.lineTo(back - 10, 0); ctx.lineTo(back + 2, 3); ctx.closePath(); fill(ctx, '#2a1d16', 1.4);
    }
    if (s.egg) {
      var capsule = s.egg > 1 ? 9.5 : 7;
      oval(ctx, back - capsule + 3, 0, capsule, s.egg > 1 ? 5.6 : 4.6); fill(ctx, '#7b4f2c', 2);
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1; ctx.beginPath();
      for (i = 1; i < s.egg * 2 + 2; i++) { var ridge = back + 3 - capsule * 2 * i / (s.egg * 2 + 2); ctx.moveTo(ridge, -3); ctx.lineTo(ridge, 3); }
      ctx.stroke();
    }
    oval(ctx, -5 - (s.length - 1) * 10, 0, 20 * s.length, wide); fill(ctx, s.body);
    if (s.mantle) { oval(ctx, -8, 0, 15, wide - 3.5); ctx.strokeStyle = 'rgba(224,210,170,.75)'; ctx.lineWidth = 2.2; ctx.stroke(); }
    if (s.glossy) { oval(ctx, -9, -wide * 0.38, 10, wide * 0.24); ctx.fillStyle = 'rgba(255,230,200,.32)'; ctx.fill(); }
    if (s.metal) {
      oval(ctx, -7, wide * 0.42, 16, wide * 0.2); ctx.fillStyle = 'rgba(126,72,0,.45)'; ctx.fill();
      oval(ctx, -8, -wide * 0.34, 15, wide * 0.2); ctx.fillStyle = 'rgba(255,252,226,.85)'; ctx.fill();
    }
    if (s.stripes) {
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1.2; ctx.beginPath();
      for (i = -15; i < 5; i += 6) { ctx.moveTo(i, -wide + 2); ctx.lineTo(i + 2, wide - 2); }
      ctx.stroke();
    }
    if (s.bands) {
      ctx.strokeStyle = s.accent; ctx.lineWidth = 3.2; ctx.beginPath();
      for (i = -19; i < 0; i += 7) { ctx.moveTo(i, -wide + 1.5); ctx.lineTo(i, wide - 1.5); }
      ctx.stroke();
    } else {
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-22 * s.length, 0); ctx.lineTo(7, 0); ctx.stroke();
    }
    if (s.spots) { dot(ctx, -16, -3, 1.8, s.accent); dot(ctx, -16, 3, 1.8, s.accent); dot(ctx, -8, 0, 1.8, s.accent); dot(ctx, -1, -4, 1.6, s.accent); dot(ctx, -1, 4, 1.6, s.accent); }
    if (s.armor) {
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1.6;
      for (i = -18; i < 4; i += 7) { ctx.beginPath(); ctx.ellipse(i, 0, 3, wide - 1.5, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
    }
    if (s.glow) { oval(ctx, back + 6, 0, 7, wide * 0.75); ctx.fillStyle = '#d0d888'; ctx.fill(); }
    if (s.crown) { oval(ctx, -6, 0, 15, wide - 4); ctx.strokeStyle = s.accent; ctx.lineWidth = 2; ctx.stroke(); }
    if (s.rays) {
      for (i = 0; i < s.rays; i++) dot(ctx, -22 + i * 6.5, i % 2 ? 3.2 : -3.2, 2.3, '#fff6cc');
    }
    if (s.neural) {
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1; ctx.beginPath();
      for (i = 0; i < s.neural + 2; i++) { var nx = -22 + i * 26 / (s.neural + 1); var ny = i % 2 ? 4 : -4; if (i) ctx.lineTo(nx, ny); else ctx.moveTo(nx, ny); }
      ctx.stroke();
      for (i = 0; i < s.neural + 2; i++) dot(ctx, -22 + i * 26 / (s.neural + 1), i % 2 ? 4 : -4, 1.9, '#eef2ff');
    }
    oval(ctx, 12, 0, 9, wide * 0.78); fill(ctx, s.head);
    if (s.proboscis) { ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(35, 0); line(ctx, s.accent, 1); }
    if (s.mandibles) {
      for (side = -1; side <= 1; side += 2) { ctx.beginPath(); ctx.moveTo(18, side * 4); ctx.quadraticCurveTo(30, side * 12, 32, side * 2); line(ctx, s.accent, 2.2); }
    }
    if (s.armor) { ctx.beginPath(); ctx.moveTo(18, -3.5); ctx.lineTo(29, 0); ctx.lineTo(18, 3.5); ctx.closePath(); fill(ctx, s.accent, 1.6); }
    if (s.crumb) {
      ctx.fillStyle = '#ead198'; ctx.strokeStyle = '#614b29'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(22, -5); ctx.lineTo(30, -3); ctx.lineTo(28, 5); ctx.lineTo(22, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (s.crown) {
      var points = s.crown + 2;
      ctx.fillStyle = s.accent; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = 0; i < points * 2; i++) {
        var angle = i / (points * 2) * TAU;
        var radius = i % 2 ? 4.2 : 8.5;
        ctx.lineTo(12 + Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (s.crown > 1) dot(ctx, 12, 0, 2, s.crown > 2 ? '#8a3a30' : '#4a6080');
    }
    if (s.halo) { oval(ctx, 12, 0, 12, 12); ctx.strokeStyle = 'rgba(240,228,190,.6)'; ctx.lineWidth = 2.2; ctx.stroke(); }
    if (s.wings === 'thin') {
      for (side = -1; side <= 1; side += 2) {
        oval(ctx, -10, side * 7, 17, 3.2, side * (0.45 + flap * 0.18));
        ctx.fillStyle = 'rgba(222,228,238,.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(50,50,50,.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      }
    } else if (s.wings === 'long') {
      for (side = -1; side <= 1; side += 2) {
        oval(ctx, -10, side * 3.5, 24, 6, side * (0.07 + flap * 0.04));
        ctx.fillStyle = 'rgba(176,182,116,.82)'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.strokeStyle = s.accent; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(10, 0); ctx.stroke();
    } else if (s.wings === 'double') {
      for (side = -1; side <= 1; side += 2) {
        ctx.fillStyle = 'rgba(225,232,245,.5)'; ctx.strokeStyle = 'rgba(40,40,40,.5)'; ctx.lineWidth = 0.8;
        oval(ctx, -2, side * 10, 15, 4.5, side * (0.55 + flap * 0.2)); ctx.fill(); ctx.stroke();
        oval(ctx, -8, side * 9, 11, 3.5, side * (0.85 + flap * 0.2)); ctx.fill(); ctx.stroke();
      }
    }
  }

  // An irregular little polygon: a crumb, pebble or clod, never the same shape twice.
  function chip(ctx, x, y, size, color, outline, rand) {
    var sides = 4 + (rand() * 3 | 0);
    var turn = rand() * TAU;
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var angle = turn + i / sides * TAU;
      var reach = size * (0.6 + rand() * 0.6);
      ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 0.8; ctx.stroke(); }
  }

  function crumb(ctx, x, y, size, rand) {
    chip(ctx, x, y, size, CRUMB_COLORS[rand() * CRUMB_COLORS.length | 0], 'rgba(74,52,26,.55)', rand);
  }

  // Larger ground props come from the art, drawn upright on whole pixels; the tiny bits around them stay procedural.
  var PROP_MARKS = {burrow: 1, pile: 1, claim: 1, tufts: 1, soil: 1, crumbs: 1};

  function paintProp(ctx, kind, level, rand) {
    if (kind === 'tufts') {
      drawProp(ctx, 'grass-tuft-' + (1 + (rand() * 3 | 0)), 0, 0);
      return;
    }
    if (kind === 'soil') {
      drawProp(ctx, rand() < 0.5 ? 'soil-clod-1' : 'soil-clod-2', 0, 0);
      return;
    }
    if (kind === 'crumbs') {
      drawProp(ctx, 'crumb-' + (1 + (rand() * 4 | 0)), 0, 0);
      return;
    }
    if (root.RoachFloorBaker && root.RoachFloorBaker.paintProp) {
      root.RoachFloorBaker.paintProp(ctx, kind, level, rand, drawProp);
      return;
    }
    var i, angle;
    if (kind === 'burrow') {
      for (i = 0; i < 6 + level; i++) {
        angle = rand() * TAU;
        chip(ctx, Math.cos(angle) * (9 + rand() * 4), Math.sin(angle) * (7 + rand() * 3), 0.8 + rand() * 1.2, SOIL_COLORS[rand() * 4 | 0], '', rand);
      }
      drawProp(ctx, rand() < 0.5 ? 'burrow-hole-1' : 'burrow-hole-2', 0, 0);
    } else if (kind === 'pile') {
      drawProp(ctx, level > 8 ? 'crumb-pile-large' : level > 4 ? 'crumb-pile-medium' : 'crumb-pile-small', 0, 0);
    } else {
      for (i = 0; i < 4; i++) chip(ctx, (rand() - 0.5) * 12, 6 + rand() * 3, 1 + rand(), SOIL_COLORS[rand() * 4 | 0], '', rand);
      drawProp(ctx, 'territory-claim-post', 0, -2);
    }
  }

  // Claimed ground and dropped crumbs, painted once in a mark's own lane frame (x along the lane).
  function paintMark(ctx, kind, length, thickness, level, rand) {
    if (root.RoachFloorBaker && root.RoachFloorBaker.paintMark) {
      root.RoachFloorBaker.paintMark(ctx, kind, length, thickness, level, rand);
      return;
    }
    var half = length / 2;
    var side = thickness / 2;
    var i, x, y, angle, reach;
    if (kind === 'trail') {

      var wave = rand() * TAU;
      var amp = 1 + rand() * side * 0.5;
      var freq = 0.05 + rand() * 0.06;
      var trails = rand() < 0.4 ? 2 : 1;
      for (var trail = 0; trail < trails; trail++) {
        for (x = -half; x < half; x += 3 + rand() * 4) {
          dot(ctx, x, Math.sin(x * freq + wave) * amp + trail * 4, 0.7 + rand() * 0.8, 'rgba(226,192,120,' + (0.2 + rand() * 0.2).toFixed(2) + ')');
        }
      }
    } else if (kind === 'burrow') {
      x = (rand() - 0.5) * length * 0.4;
      y = (rand() - 0.5) * side * 0.4;
      var hole = Math.min(side - 2, 3.5 + rand() * 2.5 + level * 0.15);
      for (i = 0; i < 8 + level; i++) {
        angle = rand() * TAU;
        reach = hole * (1.3 + rand() * 1.6);
        chip(ctx, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * 0.7, 0.8 + rand() * 1.4, SOIL_COLORS[rand() * 4 | 0], '', rand);
      }
      oval(ctx, x, y, hole, hole * 0.72, rand() - 0.5); ctx.fillStyle = 'rgba(26,17,10,.55)'; ctx.fill();
      ctx.strokeStyle = 'rgba(176,136,88,.4)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(x, y, hole + 1.2, hole * 0.72 + 1, 0, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    } else if (kind === 'tufts') {
      var clumps = 2 + (rand() * 3 | 0);
      ctx.lineWidth = 1.1;
      for (i = 0; i < clumps; i++) {
        x = (rand() - 0.5) * length * 0.8;
        y = (rand() - 0.5) * side;
        ctx.strokeStyle = rand() < 0.5 ? 'rgba(150,164,96,.45)' : 'rgba(124,142,78,.42)';
        ctx.beginPath();
        for (var blade = 4 + (rand() * 4 | 0); blade > 0; blade--) {
          angle = rand() * TAU;
          reach = 3 + rand() * 5;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(angle) * reach * 0.5 + 1, y + Math.sin(angle) * reach * 0.5, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
        }
        ctx.stroke();
      }
    } else if (kind === 'soil') {
      for (i = 6 + (rand() * 8 | 0); i > 0; i--) chip(ctx, (rand() - 0.5) * length * 0.9, (rand() - 0.5) * thickness * 0.8, 1 + rand() * 2.4, SOIL_COLORS[rand() * 4 | 0], '', rand);
    } else if (kind === 'claim') {
      // A small cairn with a stake and a scrap of a flag.
      for (i = 0; i < 7; i++) chip(ctx, (rand() - 0.5) * 9, 3 + (rand() - 0.5) * 6, 1.4 + rand() * 1.4, SOIL_COLORS[rand() * 4 | 0], 'rgba(60,44,28,.5)', rand);
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -9); line(ctx, '#bfa77a', 1.2);
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, -7); ctx.lineTo(0, -5); ctx.closePath(); fill(ctx, 'rgba(170,112,60,.85)', 1);
    } else if (kind === 'crumbs') {
      // Dropped along the forager lane: dense in the middle of the lane, sparse at its edges.
      for (i = 4 + level + (rand() * 4 | 0); i > 0; i--) crumb(ctx, (rand() - 0.5) * length, (rand() + rand() - 1) * side, 0.9 + rand() * 1.6, rand);
    } else {
      oval(ctx, 0, 1, side * 0.9, side * 0.6); ctx.fillStyle = 'rgba(28,18,10,.22)'; ctx.fill();
      for (i = 8 + level * 3; i > 0; i--) {
        var spread = Math.sqrt(rand());
        angle = rand() * TAU;
        crumb(ctx, Math.cos(angle) * spread * side * 0.8, Math.sin(angle) * spread * side * 0.55, 1 + (1 - spread) * 1.8 + rand(), rand);
      }
    }
  }

  // Top-down nest in a 260x200 design space. Every feature maps to a log-scale upgrade step.
  function paintBase(ctx, scale, base, crumbs, night) {
    var cx = 130;
    var cy = 100;
    var r = 24 + base.hatchery * 4.2;
    var rand, i, angle, x, y;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (base.mutations) {
      var aura = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, Math.min(98, r + 26 + base.mutations * 4));
      aura.addColorStop(0, 'rgba(176,112,236,' + (0.14 + base.mutations * 0.04) + ')');
      aura.addColorStop(0.6, 'rgba(110,224,170,' + (0.08 + base.mutations * 0.025) + ')');
      aura.addColorStop(1, 'rgba(110,224,170,0)');
      ctx.fillStyle = aura; ctx.fillRect(0, 0, 260, 200);
    }
    // Expansions claim ground: dashed boundary rings and outlying burrows linked by scent trails.
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(214,178,112,.45)'; ctx.lineWidth = 1.6;
    for (i = 0; i < Math.min(3, Math.ceil(base.expansion / 4)); i++) { oval(ctx, cx, cy, r + 18 + i * 13, (r + 18 + i * 13) * 0.78); ctx.stroke(); }
    ctx.setLineDash([]);
    rand = random(5);
    var outposts = base.expansion ? Math.min(10, base.expansion + 1) : 0;
    var far = Math.min(98, r + 22 + base.expansion * 4);
    for (i = 0; i < outposts; i++) {
      angle = (i + 0.2 + rand() * 0.6) / outposts * TAU;
      var bend = (rand() - 0.5) * 0.8;
      var reach = far * (0.8 + rand() * 0.2);
      x = cx + Math.cos(angle) * reach;
      y = cy + Math.sin(angle) * reach * 0.78;
      for (var t = 0.15; t < 0.9; t += 0.09) {
        var u = 1 - t;
        var mx = cx + Math.cos(angle + bend) * reach * 0.6;
        var my = cy + Math.sin(angle + bend) * reach * 0.47;
        dot(ctx, u * u * cx + 2 * u * t * mx + t * t * x, u * u * cy + 2 * u * t * my + t * t * y, 1.3, 'rgba(232,200,130,.6)');
      }
      for (var clod = 0; clod < 7; clod++) {
        var around = rand() * TAU;
        chip(ctx, x + Math.cos(around) * 6.5, y + Math.sin(around) * 5, 1.4 + rand() * 1.2, SOIL_COLORS[rand() * 4 | 0], '', rand);
      }
      oval(ctx, x, y, 4.6, 3.4); ctx.fillStyle = 'rgba(26,17,10,.8)'; ctx.fill();
      ctx.strokeStyle = 'rgba(176,136,88,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    var soil = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    soil.addColorStop(0, 'rgba(176,132,82,.92)');
    soil.addColorStop(1, 'rgba(112,76,44,.88)');
    oval(ctx, cx, cy, r, r * 0.82); ctx.fillStyle = soil; ctx.fill();
    ctx.strokeStyle = 'rgba(50,36,26,.8)'; ctx.lineWidth = 2; ctx.stroke();
    rand = random(11);
    for (i = 0; i < 10 + base.hatchery * 3; i++) {
      angle = rand() * TAU;
      var at = r * (0.85 + rand() * 0.3);
      chip(ctx, cx + Math.cos(angle) * at, cy + Math.sin(angle) * at * 0.82, 1.2 + rand() * 1.8, rand() < 0.5 ? 'rgba(150,108,66,.85)' : 'rgba(92,62,36,.8)', '', rand);
    }
    // Each hatchery step adds an egg chamber, in an outer ring of eight and then an inner ring.
    var chambers = base.hatchery ? Math.min(14, base.hatchery + 1) : 0;
    var eggs = base.hatchery > 8 ? 3 : base.hatchery > 4 ? 2 : 1;
    for (i = 0; i < chambers; i++) {
      var outer = i < 8;
      var slots = outer ? Math.min(8, chambers) : chambers - 8;
      angle = ((outer ? i : i - 8) + 0.5) / slots * TAU + (outer ? 0 : 0.4);
      x = cx + Math.cos(angle) * r * (outer ? 0.62 : 0.34);
      y = cy + Math.sin(angle) * r * (outer ? 0.62 : 0.34) * 0.82;
      oval(ctx, x, y, 5.6, 4.2, angle); ctx.fillStyle = 'rgba(42,27,16,.85)'; ctx.fill();
      for (var egg = 0; egg < eggs; egg++) {
        var shift = (egg - (eggs - 1) / 2) * 2.6;
        oval(ctx, x + Math.cos(angle) * shift, y + Math.sin(angle) * shift, 2.1, 1.4, angle); ctx.fillStyle = '#f3e6c4'; ctx.fill();
      }
    }
    oval(ctx, cx, cy, 8, 6.4); ctx.fillStyle = '#1c120a'; ctx.fill();
    ctx.strokeStyle = 'rgba(196,150,96,.7)'; ctx.lineWidth = 1.4; ctx.stroke();
    // The crumb stockpile beside the entrance grows with stored crumbs.
    rand = random(31);
    var pile = 4 + crumbs * 1.1;
    var px = cx + r * 0.9 + pile * 0.6;
    var py = cy - r * 0.15;
    for (i = 0; i < crumbs * 4; i++) {
      var spread = Math.sqrt(rand()) * pile;
      angle = rand() * TAU;
      crumb(ctx, px + Math.cos(angle) * spread, py + Math.sin(angle) * spread * 0.7, 1.2 + rand() * 1.6 * (1 - spread / pile * 0.5), rand);
    }
    // Energy nexuses glow along the lower rim, linked once there are two.
    var nodes = [];
    for (i = 0; i < base.nexus; i++) {
      angle = Math.PI * (0.18 + i * 0.16);
      nodes.push(cx + Math.cos(angle) * (r + 12), cy + Math.sin(angle) * (r + 12) * 0.82);
    }
    if (nodes.length > 2) {
      ctx.beginPath();
      for (i = 0; i < nodes.length; i += 2) ctx.lineTo(nodes[i], nodes[i + 1]);
      ctx.strokeStyle = 'rgba(140,240,220,.5)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    for (i = 0; i < nodes.length; i += 2) {
      var reach = night ? 18 : 12;
      var glow = ctx.createRadialGradient(nodes[i], nodes[i + 1], 0, nodes[i], nodes[i + 1], reach);
      glow.addColorStop(0, night ? 'rgba(255,196,110,.85)' : 'rgba(130,255,220,.7)');
      glow.addColorStop(1, night ? 'rgba(255,170,80,0)' : 'rgba(130,255,220,0)');
      ctx.fillStyle = glow; ctx.fillRect(nodes[i] - reach, nodes[i + 1] - reach, reach * 2, reach * 2);
      oval(ctx, nodes[i], nodes[i + 1], 3.4, 3.4); fill(ctx, '#e2fff6', 1.2);
    }
    // Unit upgrades plant a pennant in that unit's own colour along the upper rim.
    for (i = 0; i < base.banners.length; i++) {
      var banner = base.banners[i].split(':');
      var size = 5 + Number(banner[1]) * 0.6;
      angle = Math.PI * (1.08 + i * 0.085);
      x = cx + Math.cos(angle) * (r - 3);
      y = cy + Math.sin(angle) * (r - 3) * 0.82;
      var top = y - 9 - size;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, top); line(ctx, '#e0d2b4', 1.2);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + size * 1.4, top + size * 0.45); ctx.lineTo(x, top + size * 0.9); ctx.closePath();
      fill(ctx, SPECIES[banner[0]].body, 1.2);
    }
  }

  // Pre-rotated atlas from the strip: one column per gait frame, one row per quarter turn, so a walker is one
  // integer blit. Numbered tiers are recoloured here. Null until the creature sheet has decoded.
  function bakeStripAtlas(document, strip, tint, id) {
    if (!creatureSheet || !strip) return null;
    var tile = strip.size;
    var row = document.createElement('canvas');
    row.width = tile * FRAMES;
    row.height = tile;
    var rctx = row.getContext('2d');
    rctx.drawImage(creatureSheet, strip.x, strip.y, tile * FRAMES, tile, 0, 0, tile * FRAMES, tile);
    if (tint) {
      var image = rctx.getImageData(0, 0, row.width, tile);
      // Pips land on the east-facing row before the quarter turns, so each facing stays an exact rotation.
      recolour(image.data, tint.body, id, row.width);
      rctx.putImageData(image, 0, 0);
    }
    var atlas = document.createElement('canvas');
    atlas.width = tile * FRAMES;
    atlas.height = tile * FACINGS;
    var ctx = atlas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (var dir = 0; dir < DIRS; dir++) {
      for (var frame = 0; frame < FRAMES; frame++) {
        // Exact quarter-turn matrices about each cell's centre.
        ctx.setTransform(DX[dir], DY[dir], -DY[dir], DX[dir], frame * tile + tile / 2, dir * tile + tile / 2);
        ctx.drawImage(row, frame * tile, 0, tile, tile, -tile / 2, -tile / 2, tile, tile);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var east = rctx.getImageData(0, 0, row.width, tile);
    for (var diag = 0; diag < 4; diag++) {
      var turned = ctx.createImageData(row.width, tile);
      stampDiagonal(east.data, turned.data, tile, (diag * 2 + 1) * Math.PI / 4);
      ctx.putImageData(turned, 0, tile * (4 + diag));
    }
    row.width = row.height = 0;
    return atlas;
  }

  function bakeAtlas(document, id) {
    var strip = stripFor(id);
    if (!creatureSheet || !strip) return null;
    var tint = root.RoachCreatures && root.RoachCreatures.tints && root.RoachCreatures.tints[id];
    return bakeStripAtlas(document, strip, tint, id);
  }

  // Nearest-neighbour copy of the east-facing frames, turned once. Alpha stays fully on or off.
  function stampDiagonal(src, dst, tile, angle) {
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var mid = tile / 2;
    var stride = tile * FRAMES;
    for (var y = 0; y < tile; y++) {
      var oy = y - mid + 0.5;
      var baseSx = sin * oy + mid - 0.5;
      var baseSy = cos * oy + mid - 0.5;
      var dstRow = y * stride;
      for (var x = 0; x < tile; x++) {
        var ox = x - mid + 0.5;
        var sx = Math.round(cos * ox + baseSx);
        var sy = Math.round(-sin * ox + baseSy);
        if (sx < 0 || sy < 0 || sx >= tile || sy >= tile) {
          for (var f = 0; f < FRAMES; f++) dst[(dstRow + f * tile + x) * 4 + 3] = 0;
          continue;
        }
        var srcBase = sy * stride + sx;
        var dstBase = dstRow + x;
        for (var frame = 0; frame < FRAMES; frame++) {
          var si = (srcBase + frame * tile) * 4;
          var di = (dstBase + frame * tile) * 4;
          dst[di] = src[si];
          dst[di + 1] = src[si + 1];
          dst[di + 2] = src[si + 2];
          dst[di + 3] = src[si + 3] > 127 ? 255 : 0;
        }
      }
    }
  }

  function creatureRecord(document, id) {
    var strip = stripFor(id);
    return {id: id, spec: SPECIES[id] || SPECIES.drone, tile: tileOf(id), flap: !!strip && strip.mode === 'flap', atlas: bakeAtlas(document, id)};
  }

  // Kinds are picked round-robin across the meat, territory and energy chains so a late colony is not one family.
  // Seats fill the smallest unfinished group first, so a tight budget trims only the largest groups and small ones stay honest.
  function allocate(candidates, slots) {
    var chosen = [];
    var bytes = atlasCost(tileOf('hatchling'));
    var queues = [[], [], []];
    var i;
    for (i = 0; i < candidates.length; i++) queues[['meat', 'territory', 'energy'].indexOf(SPECIES[candidates[i].id].chain)].push(candidates[i]);
    var limit = Math.min(slots, MAX_KINDS);
    for (var turn = 0; chosen.length < limit && (queues[0].length || queues[1].length || queues[2].length); turn++) {
      var candidate = queues[turn % 3].shift();
      if (!candidate) continue;
      var cost = atlasCost(tileOf(candidate.id));

      if (bytes + cost > ATLAS_BUDGET) continue;
      bytes += cost;
      chosen.push({id: candidate.id, count: 1, cap: candidate.cap, magnitude: candidate.magnitude, priority: candidate.priority});
    }
    chosen.sort(function (a, b) { return b.priority - a.priority || b.magnitude - a.magnitude; });
    var n = chosen.length;
    for (var seat = n; seat < slots; seat++) {
      var best = -1;
      for (i = 0; i < n; i++) {
        if (chosen[i].count < chosen[i].cap && (best < 0 || chosen[i].count < chosen[best].count)) best = i;
      }
      if (best < 0) break;
      chosen[best].count++;
    }
    // The most advanced owned unit always fields the largest group, unless it simply has fewer members.
    for (;;) {
      var rival = 0;
      for (i = 1; i < n; i++) if (!rival || chosen[i].count > chosen[rival].count) rival = i;
      if (!rival || chosen[rival].count < chosen[0].count || chosen[rival].count < 2 || chosen[0].count >= chosen[0].cap) break;
      chosen[rival].count--;
      chosen[0].count++;
    }
    return chosen;
  }

  // Wide enough that a lap's bow never folds a corner back on itself.
  var LANE_RADIUS = 72;
  function laneLength(width, height, inset) {
    return 2 * Math.max(1, width - inset * 2 - LANE_RADIUS * 2) + 2 * Math.max(1, height - inset * 2 - LANE_RADIUS * 2) + TAU * LANE_RADIUS;
  }

  // A rounded perimeter lane leaves the central viewing area completely clear.
  // Wide corner arcs sweep smoothly through 45 degrees without making straight runs drift sideways.
  function pointOnLane(distance, width, height, inset, out) {
    var radius = LANE_RADIUS;
    var horizontal = Math.max(1, width - inset * 2 - radius * 2);
    var vertical = Math.max(1, height - inset * 2 - radius * 2);
    var arc = Math.PI * radius / 2;
    var length = 2 * horizontal + 2 * vertical + 4 * arc;
    var d = ((distance % length) + length) % length;
    var x = inset + radius;
    var y = inset;
    var angle = 0;
    if (d < horizontal) x += d;
    else if ((d -= horizontal) < arc) { angle = d / radius; x = width - inset - radius + Math.sin(angle) * radius; y = inset + radius - Math.cos(angle) * radius; }
    else if ((d -= arc) < vertical) { x = width - inset; y = inset + radius + d; angle = Math.PI / 2; }
    else if ((d -= vertical) < arc) { angle = d / radius + Math.PI / 2; x = width - inset - radius + Math.sin(angle) * radius; y = height - inset - radius - Math.cos(angle) * radius; }
    else if ((d -= arc) < horizontal) { x = width - inset - radius - d; y = height - inset; angle = Math.PI; }
    else if ((d -= horizontal) < arc) { angle = d / radius + Math.PI; x = inset + radius + Math.sin(angle) * radius; y = height - inset - radius - Math.cos(angle) * radius; }
    else if ((d -= arc) < vertical) { x = inset; y = height - inset - radius - d; angle = Math.PI * 1.5; }
    else { d -= vertical; angle = d / radius + Math.PI * 1.5; x = inset + radius + Math.sin(angle) * radius; y = inset + radius - Math.cos(angle) * radius; }
    out.x = x; out.y = y; out.angle = angle; out.length = length;
    if (angle === 0) { out.cos = 1; out.sin = 0; }
    else if (angle === Math.PI / 2) { out.cos = 0; out.sin = 1; }
    else if (angle === Math.PI) { out.cos = -1; out.sin = 0; }
    else if (angle === Math.PI * 1.5) { out.cos = 0; out.sin = -1; }
    else { out.cos = Math.cos(angle); out.sin = Math.sin(angle); }
    return out;
  }

  function Habitat(canvas) {
    this.canvas = canvas;
    this.minInset = EDGE_INSET;
    this.quiet = false;
    this.standalone = false;
    this.ctx = canvas.getContext('2d', {alpha: true});
    // Ground marks, trail and nest change only when one of them re-bakes, so they are composed onto a floor layer
    // under the canvas. Each frame then clears and draws only the rectangles of things that move.
    this.floor = canvas.ownerDocument.createElement('canvas');
    this.floor.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:0';
    this.floor.setAttribute('aria-hidden', 'true');
    this.floorCtx = this.floor.getContext('2d', {alpha: true});
    this.floorStale = true;
    this.floorPaints = 0;
    if (canvas.parentNode) canvas.parentNode.insertBefore(this.floor, canvas);
    this.dirty = new Int32Array(DIRTY_MAX * 4);
    this.touched = 0;
    this.overflow = true;
    this.fullClears = 0;
    this.sheet = canvas.ownerDocument.createElement('canvas');
    this.patches = new Int16Array(MAX_MARKS * 6);
    this.marks = 0;
    this.groundKey = '';
    this.groundBakes = 0;
    this.baseCanvas = canvas.ownerDocument.createElement('canvas');
    this.baseCanvas.width = this.baseCanvas.height = 0;
    this.base = {hatchery: 0, expansion: 0, nexus: 0, mutations: 0, banners: []};
    this.baseKey = '';
    this.baseBakes = 0;
    this.baseX = 0;
    this.baseY = 0;
    this.entryX = 0;
    this.entryY = 0;
    this.stage = 0;
    // Struct-of-arrays entity storage: fixed capacity, no per-frame allocation.
    this.count = 0;
    this.kind = new Uint8Array(MAX_ROACHES);
    this.leader = new Int8Array(MAX_ROACHES);
    this.fresh = new Uint8Array(MAX_ROACHES);
    this.dir = new Int8Array(MAX_ROACHES);
    // Position is a fraction of the lap, so drifting between lanes of different length never jumps.
    this.phase = new Float64Array(MAX_ROACHES);
    this.speed = new Float32Array(MAX_ROACHES);
    this.lane = new Float32Array(MAX_ROACHES);
    this.drift = new Float32Array(MAX_ROACHES);
    this.inset = new Float32Array(MAX_ROACHES);
    this.spacing = new Float32Array(MAX_ROACHES);
    this.offset = new Float32Array(MAX_ROACHES);
    this.wobble = new Float32Array(MAX_ROACHES);
    this.wobbleRate = new Float32Array(MAX_ROACHES);
    this.gait = new Float32Array(MAX_ROACHES);
    this.pauseUntil = new Float64Array(MAX_ROACHES);
    this.nextPause = new Float64Array(MAX_ROACHES);
    this.turnAt = new Float64Array(MAX_ROACHES);
    this.role = new Uint8Array(MAX_ROACHES);
    this.roleStart = new Float64Array(MAX_ROACHES);
    this.roleIndex = new Uint8Array(MAX_ROACHES);
    this.job = new Uint8Array(MAX_ROACHES);
    this.jobState = new Uint8Array(MAX_ROACHES);
    this.travel = new Float32Array(MAX_ROACHES);
    this.restUntil = new Float64Array(MAX_ROACHES);
    this.pace = new Float32Array(MAX_ROACHES);
    this.freeTargetX = new Float32Array(MAX_ROACHES);
    this.freeTargetY = new Float32Array(MAX_ROACHES);
    this.freeHeading = new Float32Array(MAX_ROACHES);
    this.freeReady = new Uint8Array(MAX_ROACHES);
    this.entityId = new Uint32Array(MAX_ROACHES);
    this.nextEntityId = 1;
    this.departureReason = new Uint8Array(MAX_ROACHES);
    this.lastDeparted = [];
    this.carrying = new Uint8Array(MAX_ROACHES);
    this.prevX = new Float32Array(MAX_ROACHES);
    this.prevY = new Float32Array(MAX_ROACHES);
    this.inspector = {enabled: false, targetId: 0, trail: new Float32Array(32), trailLen: 0, seed: 1};
    this.pilePoints = [];
    this.claimPoints = [];
    this.keepsakes = [];
    this.landmarks = [];
    this.initManners();
    this.routes = {ready: false, forage: {a: 0, b: 0, dir: 1, span: 0, outer: 0, inner: 0}, claim: {a: 0, dir: 1, span: 0, outer: 0, inner: 0}, procession: {dir: 1, span: 0, outer: 0, inner: 0}};
    this.trail = canvas.ownerDocument.createElement('canvas');
    this.trail.width = this.trail.height = 0;
    this.trailKey = '';
    this.trailIncome = null;
    this.scentKey = '';
    this.warpUntil = 0;
    this.trailX = 0;
    this.trailY = 0;
    this.postX = this.postY = -1;
    this.cueFlag = new Uint8Array(MAX_ROACHES);
    this.income = 0;
    this.larvae = 0;
    this.layAt = 8;
    this.processionAt = 45;
    this.warmGlow = glowSprite(canvas.ownerDocument, '255,214,140');
    this.coolGlow = glowSprite(canvas.ownerDocument, '140,255,224');
    this.goldGlow = glowSprite(canvas.ownerDocument, '255,206,72');
    this.fireGlow = glowSprite(canvas.ownerDocument, '214,244,120');
    // A muted warm red behind whatever Red catches now, tying it to the capsule above it.
    this.catchGlow = glowSprite(canvas.ownerDocument, '206,112,78');
    this.haloAt = [0, 0, 0];
    this.haloClock = -1;
    this.redSprite = redGlyph(canvas.ownerDocument, RED_SCALE);
    this.redCueAt = [0, 0];
    this.redCueClock = -1;
    this.glowBytes = 0;
    this.golden = null;
    this.visitor = null;
    this.intruder = null;
    this.departingGolden = null;
    this.departingVisitor = null;
    this.guestAtlases = {};
    this.actingAtlases = {};
    this.closing = null;
    this.lastForageFetch = -1e9;
    this.sparkNext = 0;
    this.night = false;
    this.fireflyNext = 0;
    this.nestDustNext = 0;
    this.nestDust = 0;
    this.motes = root.RoachMotes ? new Motes() : null;
    this.cues = {};
    this.emberNext = 0;
    this.dustNext = 0;
    this.dustDue = false;
    this.layQueen = -1;
    // Nest interior movers: struct-of-arrays, at most MOVERS, walking RoachNestArt.paths polylines.
    this.nestPaths = null;
    this.movers = 0;
    this.moverKind = new Uint8Array(MOVERS);
    this.moverTunnel = new Uint8Array(MOVERS);
    this.moverAt = new Float32Array(MOVERS);
    this.moverDir = new Int8Array(MOVERS);
    this.moverRest = new Float32Array(MOVERS);
    this.moverCargo = new Uint8Array(MOVERS);
    this.moverGait = new Float32Array(MOVERS);
    this.moverX = new Float32Array(MOVERS);
    this.moverY = new Float32Array(MOVERS);
    this.moverRecords = [];
    this.handoffs = 0;
    this.pending = 0;
    // The event clock advances only while frames are drawn, so hidden time never ages an animation.
    this.clock = 0;
    this.skitterStart = 0;
    this.skitterUntil = 0;
    this.watchAt = 0;
    this.watched = {};
    this.levels = {};
    this.seen = {};
    this.burstAt = -1e9;
    this.glowStart = -1e9;
    this.pulse = {x: 0, y: 0, radius: 0, sprite: null};
    this.paradeUntil = 0;
    this.paradeNext = '';
    this.paradeWalk = null;
    // Roamers that have stopped to watch the current parade go by.
    this.saw = new Uint8Array(MAX_ROACHES);
    this.caravanUntil = 0;
    this.caravan = {from: 0, to: 0, speed: 0};
    this.events = {emergences: 0, coalesced: 0, pulses: 0, parades: 0, queuedParades: 0, droppedParades: 0, caravans: 0, rebaselines: 0, runners: 0, lays: 0, processions: 0};
    this.initBehaviours();
    this.initChance();
    this.kinds = [];
    this.atlases = {};
    this.candidates = [];
    this.plan = [];
    this.planKey = '';
    this.lead = -1;
    this.spawned = 0;
    this.exclusions = [];
    this.active = false;
    this.destroyed = false;
    this.request = null;
    this.lastFrame = 0;
    this.lastPaint = 0;
    this.elapsed = 0;
    this.level = 0;
    this.targetCount = 0;
    this.territory = 0;
    this.crumbs = 0;
    this.broodCount = 0;
    this.dormantBrood = -1;
    this.frames = 0;
    this.averageMs = 0;
    this.peakMs = 0;
    this.windowMs = 0;
    this.paintGap = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.recoverAfter = 4;
    this.lateFrames = 0;
    this.point = {};
    this.ahead = {};
    this.snapshot = null;
    // The seat being drawn, so review tools can tell which seat each blit belongs to; -1 outside the seat loop.
    this.seat = -1;
    var self = this;
    this.onFrame = function (now) { self.tick(now); };
    this.onResize = function () { self.resize(); };
    this.onVisibility = function () { self.syncActivity(); };
    // Nest bitmaps decode asynchronously; each one that arrives repaints the nest once.
    this.onNest = function () { self.baseKey = ''; self.bakeBase(); };
    this.onCreatures = function () { self.sheetReady(); };
    this.onCritters = function () {
      if (self.standalone || self.keepsakes.length || self.season) {
        self.baseKey = '';
        self.groundKey = '';
        self.bakeBase();
        self.bakeGround();
      }
    };
    canvas.style.pointerEvents = 'none';
    canvas.setAttribute('aria-hidden', 'true');
    root.addEventListener('resize', this.onResize);
    root.addEventListener('roachnest', this.onNest);
    root.addEventListener('roachcreatures', this.onCreatures);
    root.addEventListener('roachcritters', this.onCritters);
    canvas.ownerDocument.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.sheetReady();
    this.syncActivity();
  }

  // The creature sheet decodes asynchronously; once it is ready every record without an atlas is baked, and the
  // ground re-bakes with its props.
  Habitat.prototype.sheetReady = function () {
    if (!creatureSheet || this.destroyed) return;
    var document = this.canvas.ownerDocument;
    var c = root.RoachCreatures;
    if (this.motes) this.motes.setSheet(creatureSheet, c.motes.x, c.motes.y, c.motes.cell);
    var records = [this.atlases, this.guestAtlases];
    for (var r = 0; r < records.length; r++) {
      for (var id in records[r]) if (!records[r][id].atlas) records[r][id].atlas = bakeAtlas(document, id);
    }
    for (var act in this.actingAtlases) {
      if (!this.actingAtlases[act].atlas && this.actingAtlases[act].strip) {
        this.actingAtlases[act].atlas = bakeStripAtlas(document, this.actingAtlases[act].strip, null, this.actingAtlases[act].id);
      }
    }
    if (!this.moverRecords.length) this.moverRecords = ['drone', 'queen', 'hatchling'].map(function (id) { return creatureRecord(document, 'mini-' + id); });
    this.groundKey = '';
    this.bakeGround();
  };

  Habitat.prototype.actingAtlas = function (actName) {
    var c = root.RoachCreatures;
    var strip = c && c.acting && c.acting[actName];
    if (!strip) return null;
    if (!this.actingAtlases[actName]) {
      var used = 0;
      var k;
      for (k in this.atlases) if (this.atlases[k].atlas) used += this.atlases[k].atlas.width * this.atlases[k].atlas.height * 4;
      for (k in this.actingAtlases) if (this.actingAtlases[k].atlas) used += this.actingAtlases[k].atlas.width * this.actingAtlases[k].atlas.height * 4;
      if (used + atlasCost(strip.size) > ATLAS_BUDGET) return null;
      var speciesId = strip.speciesId || 'drone';
      this.actingAtlases[actName] = {
        id: speciesId,
        act: actName,
        spec: SPECIES[speciesId] || SPECIES.drone,
        tile: strip.size,
        flap: false,
        strip: strip,
        atlas: bakeStripAtlas(this.canvas.ownerDocument, strip, null, speciesId)
      };
    } else if (!this.actingAtlases[actName].atlas && creatureSheet) {
      this.actingAtlases[actName].atlas = bakeStripAtlas(this.canvas.ownerDocument, strip, null, this.actingAtlases[actName].id);
    }
    return this.actingAtlases[actName].atlas ? this.actingAtlases[actName] : null;
  };

  Habitat.prototype.setKeepsakes = function (list) {
    var valid = ['keepsake_beetle_shell', 'keepsake_cricket_shell', 'keepsake_moth_stone', 'keepsake_snail_shell'];
    var next = [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) {
        var slug = String(list[i] || '');
        if (slug && slug.indexOf('keepsake_') !== 0 && valid.indexOf('keepsake_' + slug) >= 0) slug = 'keepsake_' + slug;
        if (valid.indexOf(slug) >= 0 && next.indexOf(slug) < 0) next.push(slug);
      }
    }
    if (next.join(',') === this.keepsakes.join(',')) return;
    this.keepsakes = next;
    this.baseKey = '';
    this.groundKey = '';
    this.bakeBase();
    this.bakeGround();
  };


  // TV overlay keeps walkers in a thin edge band. Quiet mode pulls that band onto the bezel.
  // Standalone terrarium mode opens the floor so paths can cross the middle of the screen.
  Habitat.prototype.layoutLanes = function () {
    var shortSide = Math.min(this.canvas.width, this.canvas.height);
    if (this.standalone) {
      this.minInset = EDGE_INSET;
      this.laneMax = Math.max(EDGE_INSET, Math.min(this.canvas.height * 0.36, shortSide * 0.42));
    } else if (this.quiet) {
      this.minInset = 14;
      this.laneMax = 42;
    } else {
      this.minInset = EDGE_INSET;
      this.laneMax = Math.max(EDGE_INSET, Math.min(this.canvas.height * 0.14, shortSide * 0.2 - 52));
    }
  };

  Habitat.prototype.setQuiet = function (quiet) {
    quiet = !!quiet && !this.standalone;
    if (quiet === !!this.quiet) return;
    this.quiet = quiet;
    for (var i = 0; i < this.count; i++) if (this.role[i] === SCATTER) this.role[i] = 0;
    this.layoutLanes();
    this.groundKey = '';
    this.bakeGround();
    this.planKey = '';
    this.reconcile();
  };

  Habitat.prototype.setStandalone = function (standalone) {
    standalone = !!standalone;
    if (standalone === !!this.standalone) return;
    this.standalone = standalone;
    if (standalone) this.quiet = false;
    for (var s = 0; s < MAX_ROACHES; s++) this.freeReady[s] = 0;
    this.layoutLanes();
    this.baseKey = '';
    this.groundKey = '';
    this.bakeBase();
    this.placeBase();
    this.bakeGround();
    this.planKey = '';
    this.reconcile();
  };

  Habitat.prototype.groundHeight = function () {
    var h = this.baseCanvas.height;
    var art = root.RoachNestArt;
    if (art && art.ground && h) return art.ground(h / 230);
    return h;
  };

  Habitat.prototype.resize = function () {
    var width = Math.max(320, root.innerWidth);
    var height = Math.max(240, root.innerHeight);
    // Native pixels up to 1080p, so the art maps 1:1 to the screen; larger screens get the 1080p-sized layout
    // stretched by a whole factor without smoothing.
    var scale = 1 / Math.max(1, Math.ceil(Math.max(width / 1920, height / 1080) - 1e-9));
    this.scale = scale;
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.canvas.style.imageRendering = scale < 1 ? 'pixelated' : '';
    this.ctx.imageSmoothingEnabled = false;
    this.floor.width = this.canvas.width;
    this.floor.height = this.canvas.height;
    this.floor.style.imageRendering = this.canvas.style.imageRendering;
    this.floorCtx.imageSmoothingEnabled = false;
    this.floorStale = true;
    // Resizing cleared both canvases.
    this.touched = 0;
    this.overflow = false;
    // Lane, sideways wobble and the enlarged lead must all stay outside the central 60%.
    this.layoutLanes();
    this.lastFrame = 0;
    this.lastPaint = 0;
    this.bakeBase();
    this.placeBase();
    this.bakeGround();
  };

  Habitat.prototype.update = function (snapshot) {
    if (this.destroyed || !snapshot || this.holdUpdate(snapshot)) return;
    this.snapshot = snapshot;
    var candidates = [];
    var top = 0;
    (snapshot.visibleUnits || []).forEach(function (unit) {
      var spec = SPECIES[unit.id];
      if (!unit.owned || !spec || spec.chain === 'brood') return;
      var exact = String(unit.countExact || unit.count || '1');
      var tier = Number(unit.tier) > 0 ? Number(unit.tier) : spec.tier;
      var log = magnitude(exact);
      if (spec.chain === 'meat') top = Math.max(top, spec.tier);
      candidates.push({id: unit.id, magnitude: log, cap: groupSize(exact, log), priority: tier + (spec.chain === 'meat' ? 100 : 0)});
    });
    candidates.sort(function (a, b) { return b.priority - a.priority || b.magnitude - a.magnitude; });
    var population = snapshot.populationExact || snapshot.population || '0';
    var populated = positive(population);
    if (populated && !candidates.length) candidates.push({id: 'drone', magnitude: magnitude(population), cap: groupSize(population, magnitude(population)), priority: 1});
    this.targetCount = 0;
    for (var c = 0; c < candidates.length; c++) this.targetCount = Math.min(MAX_ROACHES, this.targetCount + candidates[c].cap);
    this.candidates = candidates;
    this.stage = top >= 15 ? 5 : top >= 10 ? 4 : top >= 6 ? 3 : top >= 4 ? 2 : top >= 2 ? 1 : 0;
    var territory = 0;
    this.crumbs = 0;
    var hatchlings = false;
    for (var i = 0; i < (snapshot.resources || []).length; i++) {
      var resource = snapshot.resources[i];
      // Both grow with the log of the order of magnitude, so early and very late colonies still differ.
      if (resource.id === 'territory' && positive(resource.amount)) territory = Math.min(16, 1 + Math.floor(2 * Math.log(1 + magnitude(resource.amount)) / Math.LN2));
      if (resource.id === 'meat' && positive(resource.amount)) this.crumbs = Math.min(12, 1 + Math.floor(1.4 * Math.log(1 + magnitude(resource.amount)) / Math.LN2));
      if (resource.id === 'larva') hatchlings = positive(resource.amount);
      // Income steps drive forager numbers and pace, and how often a tending queen lays.
      if (resource.id === 'meat') this.income = positive(resource.rate) ? Math.min(12, 1 + Math.floor(1.4 * Math.log(1 + magnitude(resource.rate)) / Math.LN2)) : 0;
      if (resource.id === 'larva') this.larvae = positive(resource.rate) ? Math.min(10, 1 + Math.floor(1.4 * Math.log(1 + magnitude(resource.rate)) / Math.LN2)) : 0;
    }
    // A dormant nest is quiet: no walkers on the lanes, and the hatchlings it holds stay inside it.
    this.dormantBrood = -1;
    if (snapshot.dormant) {
      var larva = (snapshot.resources || []).filter(function (entry) { return entry.id === 'larva'; })[0];
      var held = larva && /^\d+$/.test(larva.amount) ? Number(larva.amount) : hatchlings ? DORMANT_BROOD : 0;
      this.dormantBrood = Math.min(DORMANT_BROOD, held);
      hatchlings = false;
    }
    this.broodCount = hatchlings ? BROOD : 0;
    if (hatchlings) this.targetCount = Math.min(MAX_ROACHES, this.targetCount + this.broodCount);
    var claimed = territory > this.territory && this.territory > 0;
    this.territory = territory;
    this.planCrew(snapshot.upgradeLevels || {});
    this.readUpgrades(snapshot.upgradeLevels || {});
    this.bakeBase();
    this.placeBase();
    this.bakeGround();
    // A new step of territory kicks up soil at the frontier's newest claim post.
    if (claimed && this.postX >= 0) {
      this.puff(Motes.CLOD, this.postX, this.postY, 5, 46, -Math.PI / 2, 2, 2);
      this.puff(Motes.DUST, this.postX, this.postY, 3, 24, -Math.PI / 2, 2, 2);
    }
    this.reconcile();
    this.planMovers(magnitude(population));
    // Quotas follow income and territory even when the allocation itself is unchanged.
    this.assignJobs();
    this.watchEvents(snapshot);
  };

  // Purchases are spikes in a unit's log-count beyond its own recent growth, or rises in upgrade level strings.
  // The first update, the first after hiding or a long gap, and anything that looks like a save load only set a baseline.
  Habitat.prototype.watchEvents = function (snapshot) {
    var now = root.performance.now();
    var dt = (now - this.watchAt) / 1000;
    var quiet = !this.watchAt || dt > 4 || !this.active || this.destroyed || this.canvas.ownerDocument.hidden;
    this.watchAt = now;
    dt = Math.max(0.05, dt);
    var list = snapshot.visibleUnits || [];
    var levels = snapshot.upgradeLevels || {};
    var units = {};
    var copy = {};
    var fresh = [];
    var spikes = [];
    var rises = [];
    var reset = false;
    var i, id;
    for (i = 0; i < list.length; i++) {
      var unit = list[i];
      if (!SPECIES[unit.id] || SPECIES[unit.id].chain === 'brood') continue;
      var prev = this.watched[unit.id];
      var mag = unit.owned ? magnitude(unit.countExact || unit.count || '1') : -1;
      units[unit.id] = {mag: mag, rate: prev ? prev.rate : -1};
      if (!unit.owned) { if (prev && prev.mag >= 0) reset = true; continue; }
      if (!this.seen[unit.id]) { fresh.push(unit.id); continue; }
      if (!prev || prev.mag < 0) continue;
      var d = mag - prev.mag;
      if (prev.rate >= 0 && d > 0.004 && d > prev.rate * dt * 2.5 + 0.002) spikes.push(unit.id);
      else units[unit.id].rate = prev.rate < 0 ? Math.max(0, d / dt) : prev.rate * 0.7 + Math.max(0, d / dt) * 0.3;
    }
    for (id in this.levels) if (!levels[id] || rose(levels[id], this.levels[id])) reset = true;
    for (id in levels) {
      copy[id] = String(levels[id]);
      if (rose(this.levels[id], copy[id])) rises.push(id);
    }
    // A load or import changes many things at once; an ascension makes units unowned or levels fall.
    if (fresh.length > 1 || spikes.length > 4 || rises.length > 4) reset = true;
    this.watched = units;
    this.levels = copy;
    for (id in units) if (units[id].mag >= 0) this.seen[id] = 1;
    if (quiet || reset) { this.events.rebaselines++; return; }
    if (fresh.length) this.queueParade(fresh[0]);
    else if (this.paradeNext && this.clock >= this.paradeUntil) { id = this.paradeNext; this.paradeNext = ''; this.parade(id); }
    for (i = 0; i < rises.length; i++) if (rises[i] === 'expansion' || /^nexus[1-5]$/.test(rises[i])) { this.startCaravan(); break; }
    if (spikes.length || rises.length) this.burst(spikes, rises);
  };

  Habitat.prototype.burst = function (spikes, rises) {
    if (this.clock < this.burstAt + BURST_GAP) { this.events.coalesced++; return; }
    var species = '';
    var feature = '';
    var rank = -1;
    var order = ['other', 'mutation', 'pennant', 'hatchery', 'expansion', 'nexus'];
    var i, match;
    for (i = 0; i < spikes.length; i++) if (!species || priority(spikes[i]) > priority(species)) species = spikes[i];
    for (i = 0; i < rises.length; i++) {
      var id = rises[i];
      match = /^(.+?)(twin|prod|empower)$/.exec(id);
      var kind = /^nexus[1-5]$/.test(id) ? 'nexus' : /^mutate/.test(id) ? 'mutation' : match && SPECIES[match[1]] ? 'pennant' : id === 'hatchery' || id === 'expansion' ? id : 'other';
      if (order.indexOf(kind) <= rank) continue;
      rank = order.indexOf(kind);
      feature = kind === 'pennant' ? 'pennant:' + match[1] : kind;
      if (!spikes.length) species = kind === 'pennant' ? match[1] : kind === 'hatchery' ? 'hatchling' : species;
    }
    if (!this.baseCanvas.width) return;
    this.burstAt = this.clock;
    this.events.emergences++;
    this.glowStart = this.clock;
    this.placePulse(feature);
    this.puff(Motes.DUST, this.baseX + this.entryX, this.baseY + this.entryY, 7, 40, -Math.PI / 2, Math.PI, 2);
    if (feature) this.puff(/^(nexus|mutation)$/.test(feature) ? Motes.SPORE : Motes.EMBER, this.pulseX(), this.pulseY() - 6, 5, 26, -Math.PI / 2, 1.8, 2);
    this.dispatchRunner();
    var picked = species ? this.pick(function (id) { return id === species; }, EMERGE_MAX) : [];
    for (i = 0; i < picked.length; i++) this.emerge(picked[i], i);
    this.afterBurst(species, feature, picked);
    if (this.onLog) this.onLog('burst', {species: species, feature: feature, emerged: picked.length});
  };

  // Feature positions mirror paintBase, in its 260x200 design space.
  Habitat.prototype.placePulse = function (feature) {
    var b = this.base;
    var r = 24 + b.hatchery * 4.2;
    var p = this.pulse;
    var angle;
    p.x = 130; p.y = 100; p.radius = 0; p.sprite = this.warmGlow;
    if (!feature) return;
    this.events.pulses++;
    if (feature === 'hatchery') p.radius = r * 0.8;
    else if (feature === 'expansion' || feature === 'other') p.radius = Math.min(98, r + 30);
    else if (feature === 'mutation') { p.radius = Math.min(98, r + 22); p.sprite = this.coolGlow; }
    else if (feature === 'nexus') {
      angle = Math.PI * (0.18 + Math.max(0, b.nexus - 1) * 0.16);
      p.x += Math.cos(angle) * (r + 12); p.y += Math.sin(angle) * (r + 12) * 0.82; p.radius = 18; p.sprite = this.coolGlow;
    } else {
      var index = -1;
      for (var i = 0; i < b.banners.length; i++) if (b.banners[i].split(':')[0] === feature.slice(8)) index = i;
      p.radius = 16;
      if (index >= 0) {
        angle = Math.PI * (1.08 + index * 0.085);
        p.x += Math.cos(angle) * (r - 3); p.y += Math.sin(angle) * (r - 3) * 0.82 - 12;
      }
    }
  };

  Habitat.prototype.queueParade = function (id) {
    if (this.clock >= this.paradeUntil) { this.parade(id); return; }
    if (this.paradeNext) { this.events.droppedParades++; return; }
    this.paradeNext = id;
    this.events.queuedParades++;
  };

  // A new tier comes out of the nest door with a pulse and a glint, a whole step larger than usual in a soft warm
  // halo, and walks one lap of the inner lane back to the door with up to three escorts in step behind it: its own
  // group first, then the lower-tier roamers nearest the door, who come out of the nest after it. All of them walk at
  // the pace of the slowest, so the lap takes as long as walking it does. The first slot of a kind is its group head.
  Habitat.prototype.parade = function (id) {
    var head = -1;
    var i;
    for (i = 0; i < this.count && head < 0; i++) if (this.kinds[this.kind[i]].id === id) head = i;
    if (head < 0 || this.role[head] || !this.baseCanvas.width) return;
    var self = this;
    var door = this.routes.ready ? this.routes.forage.a : 0;
    var rank = priority(id);
    var own = [];
    var lower = [];
    for (i = 0; i < this.count; i++) {
      if (this.role[i] || this.manner[i] || this.job[i] || i === head) continue;
      if (this.leader[i] === head) own.push(i);
      else if (this.leader[i] < 0 && i !== this.lead && this.kinds[this.kind[i]].spec.chain !== 'brood' && priority(this.kinds[this.kind[i]].id) < rank) lower.push(i);
    }
    lower.sort(function (a, b) { return Math.abs(wrap(door - self.phase[a])) - Math.abs(wrap(door - self.phase[b])); });
    var escort = own.concat(lower).slice(0, PARADE_ESCORT);
    var speed = this.speed[head];
    for (i = 0; i < escort.length; i++) speed = Math.min(speed, this.speed[escort[i]]);
    var record = this.kinds[this.kind[head]];
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var inset = Math.max(this.minInset, this.laneMax - 10);
    var length = laneLength(this.canvas.width, this.canvas.height, inset);
    var phase = this.nearestPhase(inset, ex, ey);
    var spot = pointOnLane(phase * length, this.canvas.width, this.canvas.height, inset, this.ahead);
    var scale = this.scaleOf(head, record) + 1;
    var w = this.paradeWalk = {phase: phase, dir: this.dir[head] < 0 ? -1 : 1, inset: inset, lap: length, speed: speed * HURRY,
      door: Math.sqrt((spot.x - ex) * (spot.x - ex) + (spot.y - ey) * (spot.y - ey)), half: record.tile * scale / 2,
      halo: Math.min(PARADE_HALO, Math.round(record.tile * scale * 1.15))};
    this.assume(head, PARADE, 0);
    for (i = 0; i < escort.length; i++) this.assume(escort[i], PARADE, i + 1);
    this.saw.fill(0);
    this.paradeUntil = this.clock + (w.door + w.lap + w.half + PARADE_GAP * escort.length) / w.speed;
    this.events.parades++;
    // A one-time pulse and a few glints at the door as it steps out.
    this.placePulse('');
    this.glowStart = this.clock;
    this.puff(Motes.GLINT, ex, ey - 6, 5, 26, -Math.PI / 2, 2.2, 2);
  };

  // Where a parading seat is after walking `walked` px of the parade: out of the door to the lane, then round the
  // lap. Escorts walk a little to either side of the lead's line. Returns 0 inside the nest, 1 out of the door, 2 on
  // the lap and -1 once the lap is done.
  Habitat.prototype.paradePoint = function (k, walked, out) {
    var w = this.paradeWalk;
    var width = this.canvas.width;
    var height = this.canvas.height;
    if (walked < 0) return 0;
    if (walked >= w.door + w.lap) return -1;
    if (walked < w.door) {
      var ex = this.baseX + this.entryX;
      var ey = this.baseY + this.entryY;
      pointOnLane(w.phase * w.lap, width, height, w.inset, out);
      var u = walked / w.door;
      out.angle = Math.atan2(out.y - ey, out.x - ex);
      out.x = ex + (out.x - ex) * u;
      out.y = ey + (out.y - ey) * u;
      return 1;
    }
    out.along = w.phase + w.dir * (walked - w.door) / w.lap;
    pointOnLane(out.along * w.lap, width, height, w.inset, out);
    var side = this.paradeSide(k) * Math.min(1, (walked - w.door) / 30);
    out.x -= out.sin * side;
    out.y += out.cos * side;
    if (w.dir < 0) out.angle += Math.PI;
    return 2;
  };

  Habitat.prototype.paradeSide = function (k) {
    return k ? (k % 2 ? 9 : -9) : 0;
  };

  // Roamers the parade's lead passes stop for a moment, turned toward it, once each per parade.
  Habitat.prototype.watchParade = function (x, y, along) {
    for (var j = 0; j < this.count; j++) {
      if (this.saw[j] || this.role[j] || this.manner[j] || this.job[j] || this.leader[j] >= 0 || j === this.lead) continue;
      var dx = this.atX[j] - x;
      var dy = this.atY[j] - y;
      if (dx * dx + dy * dy > PARADE_WATCH * PARADE_WATCH) continue;
      this.saw[j] = 1;
      this.dir[j] = wrap(along - this.phase[j]) < 0 ? -1 : 1;
      this.pauseUntil[j] = this.elapsed + PARADE_PAUSE;
      this.nextPause[j] = this.pauseUntil[j] + 3 + Math.random() * 6;
    }
  };

  // Members come in from beyond the far side edge in a line and walk to the nest at the pace of the slowest, the
  // quickest walkers first.
  Habitat.prototype.startCaravan = function () {
    if (this.clock < this.caravanUntil || !this.baseCanvas.width) return;
    var self = this;
    var walker = function (i) { return self.job[i] <= TEND; };
    var picked = this.pick(function (id) { return SPECIES[id].chain === 'territory'; }, MAX_ROACHES).filter(walker);
    if (!picked.length) picked = this.pick(function (id) { return SPECIES[id].chain !== 'brood'; }, MAX_ROACHES).filter(walker);
    if (!picked.length) return;
    picked.sort(function (a, b) { return self.speed[b] - self.speed[a]; });
    picked.length = Math.min(CARAVAN_MAX, picked.length);
    var c = this.caravan;
    var entrance = this.baseX + this.entryX;
    c.from = entrance < this.canvas.width / 2 ? this.canvas.width + 32 : -32;
    c.to = entrance;
    c.speed = this.speed[picked[picked.length - 1]] * HURRY;
    for (var i = 0; i < picked.length; i++) this.assume(picked[i], CARAVAN, i);
    this.caravanUntil = this.clock + (Math.abs(c.from - c.to) + picked.length * 50) / c.speed;
    this.events.caravans++;
  };

  // Free roamers first, then escorts, then group heads, so formations are disturbed as little as possible.
  Habitat.prototype.pick = function (accept, limit) {
    var led = [];
    var picked = [];
    var i;
    for (i = 0; i < this.count; i++) if (this.leader[i] >= 0) led[this.leader[i]] = 1;
    for (var pass = 0; pass < 3; pass++) {
      for (i = 0; i < this.count && picked.length < limit; i++) {
        if (this.role[i] || this.manner[i] || !accept(this.kinds[this.kind[i]].id)) continue;
        if ((this.leader[i] >= 0 ? 1 : led[i] || i === this.lead ? 2 : 0) === pass) picked.push(i);
      }
    }
    return picked;
  };

  Habitat.prototype.assume = function (slot, role, index) {
    this.role[slot] = role;
    this.roleStart[slot] = this.clock;
    this.roleIndex[slot] = index;
    // A sideways step and the meander become the lane, so a role starts where the roach stands; the meander starts
    // again from the middle afterwards.
    var lateral = this.side[slot] + this.meander(slot);
    if (this.inset[slot] < this.minInset) this.inset[slot] = this.minInset + (this.laneMax - this.minInset) * 0.5;
    else if (lateral) this.toLane(slot, Math.max(this.minInset, this.inset[slot] + lateral), lateral);
    this.side[slot] = 0;
    this.wobble[slot] = 0;
  };

  // A lane walker's gentle sideways meander of a few pixels.
  Habitat.prototype.meander = function (i) {
    return Math.min(3, 0.1 * this.speed[i] / this.wobbleRate[i]) * Math.sin(this.wobble[i]);
  };

  // Moves a seat onto another lane where it stands, side px toward the centre of its own. One lap fraction lands in
  // different places on lanes of different length, so its lap position is found again on the new lane, and a worker's
  // progress along its route is measured again from there.
  Habitat.prototype.toLane = function (slot, inset, side) {
    var width = this.canvas.width;
    var height = this.canvas.height;
    var from = Math.max(this.minInset, this.inset[slot]);
    var p = pointOnLane(this.phase[slot] * laneLength(width, height, from), width, height, from, this.ahead);
    var x = p.x - p.sin * side;
    var y = p.y + p.cos * side;
    var phase = this.phase[slot];
    // On a rounded corner the lanes are not parallel, so the inset is corrected until the lane passes the spot.
    for (var k = 0; k < 3; k++) {
      phase = this.nearestPhase(inset, x, y, phase);
      var q = pointOnLane(phase * laneLength(width, height, inset), width, height, inset, this.ahead);
      var off = (y - q.y) * q.cos - (x - q.x) * q.sin;
      if (Math.abs(off) < 0.5) break;
      inset = Math.max(this.minInset, inset + off);
    }
    // nearestPhase samples a few pixels apart, so the last of that gap is closed along the lane.
    var length = laneLength(width, height, inset);
    q = pointOnLane(phase * length, width, height, inset, this.ahead);
    phase += ((x - q.x) * q.cos + (y - q.y) * q.sin) / length;
    phase -= Math.floor(phase);
    this.phase[slot] = phase;
    this.inset[slot] = inset;
    var job = this.job[slot];
    var state = this.jobState[slot];
    if (!this.routes.ready || (job !== FORAGE && job !== CLAIM && job !== RUNNER) || (state !== 0 && state !== 2)) return;
    var r = job === CLAIM ? this.routes.claim : this.routes.forage;
    var along = (this.phase[slot] - r.a) * r.dir;
    along -= Math.floor(along);
    if (along > (1 + r.span) / 2) along -= 1;
    this.travel[slot] = Math.max(0, Math.min(r.span, state ? r.span - along : along));
  };

  // Re-target a roach to the lane spot nearest the nest entrance, from which it walks out. Flyers that hover or
  // sweep never come out of the nest.
  Habitat.prototype.emerge = function (slot, index) {
    if (this.job[slot] > TEND || this.doorFull(slot)) return;
    this.assume(slot, EMERGE, index);
    this.phase[slot] = this.nearestPhase(this.inset[slot], this.baseX + this.entryX, this.baseY + this.entryY);
    if (this.job[slot] && this.job[slot] < TEND) { this.jobState[slot] = 0; this.travel[slot] = 0; }
    this.awaitDoor(slot);
    // Nothing walks out while the colony is hidden; the roach is simply by the door when it returns.
    if (!this.active || this.destroyed || this.canvas.ownerDocument.hidden) this.role[slot] = this.doorWait[slot] = 0;
  };

  // The lap position nearest a point: a coarse pass, then a fine pass around the best sample. With around, only the
  // fine pass, about that lap position.
  Habitat.prototype.nearestPhase = function (inset, x, y, around) {
    var width = this.canvas.width;
    var height = this.canvas.height;
    var length = laneLength(width, height, inset);
    var best = around || 0;
    var bestDistance = Infinity;
    for (var pass = around === undefined ? 0 : 1; pass < 2; pass++) {
      var centre = best;
      for (var s = 0; s < 48; s++) {
        var at = pass ? centre + (s - 24) / (48 * 24) : s / 48;
        pointOnLane(at * length, width, height, inset, this.ahead);
        var distance = (this.ahead.x - x) * (this.ahead.x - x) + (this.ahead.y - y) * (this.ahead.y - y);
        if (distance < bestDistance) { bestDistance = distance; best = at; }
      }
    }
    return best - Math.floor(best);
  };

  // One integer blit from a record's atlas; scale is a whole number so pixels stay square.
  Habitat.prototype.blit = function (record, dir, frame, x, y, scale) {
    if (!record.atlas) return;
    var tile = record.tile;
    var size = tile * scale;
    var left = (x - size / 2 + 0.5) | 0;
    var top = (y - size / 2 + 0.5) | 0;
    this.ctx.drawImage(record.atlas, frame * tile, dir * tile, tile, tile, left, top, size, size);
    this.touch(left, top, size, size);
  };

  // A short sideways hop that returns to zero, so a mosquito can jink and then keep facing its flight line.
  Habitat.prototype.canSideHop = function (i, x, y) {
    if (this.manner[i] || this.doorWait[i] || this.leader[i] >= 0) return false;
    var dx = x - (this.baseX + this.entryX);
    var dy = y - (this.baseY + this.entryY);
    return dx * dx + dy * dy > 160 * 160;
  };

  Habitat.prototype.sideHop = function (i) {
    var u = (this.elapsed * 0.55 + i * 0.37) % 1;
    if (u > 0.42) return 0;
    return Math.sin(u / 0.42 * Math.PI) * 10;
  };

  // A prop on the moving layer.
  Habitat.prototype.prop = function (name, x, y) {
    var size = drawProp(this.ctx, name, x, y);
    if (size) this.touch(x - size / 2, y - size / 2, size, size);
  };

  // Records a rectangle drawn on the moving layer, with a pixel to spare, so the next frame clears just that.
  Habitat.prototype.touch = function (x, y, w, h) {
    if (this.touched >= DIRTY_MAX) { this.overflow = true; return; }
    var d = this.dirty;
    var o = this.touched++ * 4;
    d[o] = Math.floor(x) - 1;
    d[o + 1] = Math.floor(y) - 1;
    d[o + 2] = Math.ceil(x + w) + 1;
    d[o + 3] = Math.ceil(y + h) + 1;
  };

  // Clears what the last frame drew, or the whole canvas when its rectangles did not all fit.
  Habitat.prototype.wipe = function () {
    var ctx = this.ctx;
    var d = this.dirty;
    if (this.overflow) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.fullClears++;
    } else {
      for (var i = 0; i < this.touched; i++) ctx.clearRect(d[i * 4], d[i * 4 + 1], d[i * 4 + 2] - d[i * 4], d[i * 4 + 3] - d[i * 4 + 1]);
    }
    this.touched = 0;
    this.overflow = false;
  };

  // Clears the controls' rectangles. The floor clears them whole when it is painted; the moving layer clears only
  // where this frame drew into them, which the next wipe covers again. Standalone mode uses translucent chrome over
  // the terrarium floor, so nothing is punched out under the HUD or menu.
  Habitat.prototype.clearExclusions = function (ctx, whole) {
    if (this.standalone) return;
    var d = this.dirty;
    for (var e = 0; e < this.exclusions.length; e++) {
      var r = this.exclusions[e];
      var left = r.left * this.scale - 8;
      var top = r.top * this.scale - 8;
      var right = r.right * this.scale + 8;
      var bottom = r.bottom * this.scale + 8;
      if (whole || this.overflow) { ctx.clearRect(left, top, right - left, bottom - top); continue; }
      for (var i = 0; i < this.touched; i++) {
        var o = i * 4;
        var l = Math.max(left, d[o]);
        var t = Math.max(top, d[o + 1]);
        var w = Math.min(right, d[o + 2]) - l;
        var h = Math.min(bottom, d[o + 3]) - t;
        if (w > 0 && h > 0) ctx.clearRect(l, t, w, h);
      }
    }
  };

  // The lead stands out at twice the size when its art is small; larger art is already big enough at 1:1.
  Habitat.prototype.scaleOf = function (i, record) {
    return i === this.lead && record.tile <= 32 ? 2 : 1;
  };

  // Soft glows are the one thing scaled with smoothing. Common sizes are resampled once and then blitted 1:1, which
  // costs far less per frame than resampling; only the rare large nest pulse is still scaled as it is drawn.
  Habitat.prototype.glow = function (sprite, x, y, size) {
    var ctx = this.ctx;
    size = Math.round(size);
    if (size > GLOW_CACHED) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      ctx.imageSmoothingEnabled = false;
      this.touch(x - size / 2, y - size / 2, size, size);
      return;
    }
    var scaled = sprite.sizes[size];
    if (!scaled) {
      if (this.glowBytes >= GLOW_SIZES * GLOW_CACHED * GLOW_CACHED * 4) {
        this.warmGlow.sizes = {}; this.coolGlow.sizes = {}; this.goldGlow.sizes = {}; this.fireGlow.sizes = {}; this.catchGlow.sizes = {};
        this.glowBytes = 0;
      }
      scaled = sprite.sizes[size] = this.canvas.ownerDocument.createElement('canvas');
      scaled.width = scaled.height = size;
      scaled.getContext('2d').drawImage(sprite, 0, 0, size, size);
      this.glowBytes += size * size * 4;
    }
    var left = Math.round(x - size / 2);
    var top = Math.round(y - size / 2);
    ctx.drawImage(scaled, left, top);
    this.touch(left, top, size, size);
  };

  Habitat.prototype.puff = function (kind, x, y, count, speed, angle, spread, priority) {
    return this.motes && this.active && !this.destroyed && !this.canvas.ownerDocument.hidden ? this.motes.emit(kind, x, y, count, speed, angle, spread, priority) : 0;
  };

  Habitat.prototype.stepGait = function (i, record, x, y, delta, moving, paceMul) {
    var px = this.prevX[i];
    var py = this.prevY[i];
    this.prevX[i] = x;
    this.prevY[i] = y;
    if (record.flap) {
      if (moving) this.gait[i] = (this.gait[i] + delta * FRAME_RATE * gaitMul(this) * (paceMul || 1)) % FRAMES;
      return;
    }
    if (!moving || delta <= 0) return;
    var dist = (px > 0 || py > 0) ? Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) : this.speed[i] * delta * (paceMul || 1);
    if (dist < 0.05) return;
    var stridePx = Math.max(4, record.tile * 0.22);
    this.gait[i] = (this.gait[i] + (dist / stridePx) * gaitMul(this)) % FRAMES;
  };

  // Draws a slot that is emerging, parading or in a caravan. Returns false once its role has ended.
  Habitat.prototype.drawRole = function (i, record, delta) {
    if (this.role[i] >= CARRY) return this.drawChanceRole(i, record, delta);
    if (this.role[i] >= ENTER) return this.drawDeliberate(i, record, delta);
    var role = this.role[i];
    var age = this.clock - this.roleStart[i];
    var width = this.canvas.width;
    var height = this.canvas.height;
    var point = this.point;
    var tile = record.tile;
    var scale = this.scaleOf(i, record);
    var x, y, heading, t;
    if (role === EMERGE) {
      // Out of the door to its spot, a lane spot or a tending queen's place on her circle, at a walk.
      var ex = this.baseX + this.entryX;
      var ey = this.baseY + this.entryY;
      this.restPoint(i, point);
      var dx = point.x - ex;
      var dy = point.y - ey;
      var reach = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      t = (age - this.roleIndex[i] * 0.3) * this.speed[i] * HURRY / reach;
      if (t < 0) return true;
      // It stands a frame on its spot before walking on, so it never covers the last stretch and a lane step at once.
      if ((t - 1) * reach >= this.speed[i] * HURRY * delta) { this.role[i] = 0; return false; }
      t = Math.min(1, t);
      x = ex + dx * t;
      y = ey + dy * t;
      heading = facingRow(Math.atan2(dy, dx));
    } else if (role === PARADE) {
      var k = this.roleIndex[i];
      var w = this.paradeWalk;
      var stage = w ? this.paradePoint(k, age * w.speed - (k ? w.half + PARADE_GAP * k : 0), point) : -1;
      if (stage < 0) {
        // The lap ends by the door, where the roach walks on as usual.
        this.role[i] = 0;
        if (w) {
          this.phase[i] = w.phase;
          this.inset[i] = w.inset;
          this.dir[i] = w.dir;
          if (k) this.toLane(i, w.inset + this.paradeSide(k), this.paradeSide(k));
        }
        return false;
      }
      if (!stage) return true;
      x = point.x;
      y = point.y;
      heading = facingRow(point.angle);
      if (!k) {
        // The lead's own group follows the lap position it has reached.
        this.phase[i] = stage > 1 ? point.along - Math.floor(point.along) : w.phase;
        // An ember trail behind it, thicker as it sets out, rising over the nest art while it comes out of the door.
        if (this.clock >= this.emberNext && this.motes) {
          this.emberNext = this.clock + (age < 3 ? 0.05 : 0.15);
          this.puff(Motes.EMBER, x - DX[heading] * w.half * 0.8, y - DY[heading] * w.half * 0.8, 1, 12, -Math.PI / 2, 1.2, 1);
        }
      }
      if (this.blocked(x, y, tile * 0.55)) {
        this.stepGait(i, record, x, y, delta, true, HURRY);
        this.atX[i] = x;
        this.atY[i] = y;
        return true;
      }
      if (!k) {
        scale++;
        this.ctx.globalAlpha = 0.42 + 0.1 * Math.sin(this.clock * 2.2);
        this.glow(this.warmGlow, x, y, w.halo);
        this.ctx.globalAlpha = 1;
        if (stage > 1) this.watchParade(x, y, point.along);
      }
    } else if (role === CHASE) {
      var guest = this.intruder;
      if (!guest || (guest.repel ? this.clock > guest.repel + 0.7 : age >= guest.seconds)) { this.role[i] = 0; return false; }
      pointOnLane(this.phase[i] * laneLength(width, height, this.inset[i]), width, height, this.inset[i], point);
      // Run out to a ring around the intruder, face it down, then walk back to the same lane spot.
      this.ringPoint(this.roleIndex[i], tile, guest, this.ahead);
      var tx = this.ahead.x;
      var ty = this.ahead.y;
      // An eased run peaks at one and a half times its average pace.
      var run = Math.max(0.3, 1.5 * Math.sqrt((tx - point.x) * (tx - point.x) + (ty - point.y) * (ty - point.y)) / (this.speed[i] * HURRY));
      var leaving = age > guest.seconds - run;
      var v = Math.min(1, age / run, leaving ? (guest.seconds - age) / run : 1);
      v = v * v * (3 - 2 * v);
      x = point.x + (tx - point.x) * v;
      y = point.y + (ty - point.y) * v;
      t = leaving ? Math.atan2(point.y - ty, point.x - tx) : v < 1 ? Math.atan2(ty - point.y, tx - point.x) : Math.atan2(guest.y - y, guest.x - x);
      heading = facingRow(t);
      if (v >= 1 && !leaving) {
        var bob = Math.round(Math.sin(this.clock * Math.PI * 8) * 2);
        var toward = Math.atan2(guest.y - y, guest.x - x);
        x += Math.round(Math.cos(toward) * bob);
        y += Math.round(Math.sin(toward) * bob);
        if (this.dustDue) this.puff(Motes.DUST, x, y + tile * 0.25, 1, 12, -Math.PI / 2, 1.4, 1);
      }
    } else {
      var c = this.caravan;
      var travelled = age * c.speed - this.roleIndex[i] * tile * 0.9;
      if (this.clock > this.caravanUntil) { this.role[i] = 0; return false; }
      // Arriving members enter the nest and walk straight back out onto the lane.
      if (travelled > Math.abs(c.from - c.to)) { this.emerge(i, 0); return true; }
      if (travelled < 0) return true;
      x = c.from + (c.to > c.from ? travelled : -travelled);
      y = this.baseY + this.entryY > height / 2 ? height - this.minInset - (this.laneMax - this.minInset) * 0.3 : this.minInset + (this.laneMax - this.minInset) * 0.3;
      heading = c.to > c.from ? 0 : 2;
      if (this.dustDue) this.puff(Motes.DUST, x - DX[heading] * tile * 0.4, y + tile * 0.2, 1, 14, -Math.PI / 2, 1.6, 1);
    }
    this.stepGait(i, record, x, y, delta, true, HURRY);
    this.atX[i] = x;
    this.atY[i] = y;
    if (!this.blocked(x, y, tile * 0.55)) this.blit(record, heading, this.gait[i] | 0, x, y, scale);
    return true;
  };

  Habitat.prototype.drawGlow = function () {
    var t = (this.clock - this.glowStart) / GLOW_SECONDS;
    var s = this.baseCanvas.width / 260;
    var ctx = this.ctx;
    var p = this.pulse;
    var fade = Math.sin(Math.PI * t);
    ctx.globalAlpha = 0.75 * fade;
    this.glow(this.warmGlow, this.baseX + this.entryX, this.baseY + this.entryY, 44 * s);
    if (p.radius) {
      ctx.globalAlpha = 0.85 * fade * (0.6 + 0.4 * Math.cos(t * TAU * 2));
      this.glow(p.sprite, this.pulseX(), this.pulseY(), p.radius * 2 * s);
    }
    ctx.globalAlpha = 1;
  };

  // The pulsed feature on screen; separate nest artwork has its own layout, so it pulses around the entrance.
  Habitat.prototype.pulseX = function () {
    return this.baseX + (root.RoachNestArt ? this.entryX : this.pulse.x * this.baseCanvas.width / 260);
  };

  Habitat.prototype.pulseY = function () {
    return this.baseY + (root.RoachNestArt ? this.entryY : this.pulse.y * this.baseCanvas.width / 260);
  };

  Habitat.prototype.reconcile = function () {
    var capLimit = CAPS[this.level] - this.guests();
    var total = Math.min(this.targetCount, capLimit);
    if (this.quiet && !this.standalone) total = Math.max(4, Math.floor(total * 0.5));
    var plan = allocate(this.candidates, Math.max(0, total - this.broodCount));
    if (this.broodCount) plan.push({id: 'hatchling', count: Math.min(this.broodCount, total)});
    var key = plan.map(function (entry) { return entry.id + ':' + entry.count; }).join(',');
    if (key === this.planKey) return;
    this.planKey = key;
    this.plan = plan;
    var document = this.canvas.ownerDocument;
    var previous = this.kinds;
    var atlases = {};
    var kinds = plan.map(function (entry) { return entry.id; });
    for (var k = 0; k < kinds.length; k++) {
      atlases[kinds[k]] = this.atlases[kinds[k]] || creatureRecord(document, kinds[k]);
    }
    // An intruder of an owned species borrows that species' record, so it is left for the collector rather than freed.
    for (var id in this.atlases) if (!atlases[id] && this.atlases[id].atlas && !(this.intruder && this.intruder.record === this.atlases[id])) this.atlases[id].atlas.width = this.atlases[id].atlas.height = 0;
    this.atlases = atlases;
    this.kinds = kinds.map(function (id) { return atlases[id]; });
    var have = kinds.map(function () { return 0; });
    var free = [];
    var i;
    // Keep each existing roach in its species where possible so allocation changes never reshuffle the scene.
    for (i = 0; i < this.count; i++) {
      var prevId = previous[this.kind[i]] ? previous[this.kind[i]].id : '';
      var next = kinds.indexOf(prevId);
      if (next < 0 || have[next] >= plan[next].count) {
        free.push(i);
      } else {
        if (this.role[i] === RETIRE) { this.role[i] = 0; this.departureReason[i] = 0; }
        if (!this.entityId[i]) this.entityId[i] = this.nextEntityId++;
        this.kind[i] = next;
        have[next]++;
      }
    }
    var plannedTotal = 0;
    for (k = 0; k < plan.length; k++) plannedTotal += plan[k].count;
    var canRetire = this.active && (this.frames > 0 || this.clock > 0) && !this.ceremony && !this.closing && !this.canvas.ownerDocument.hidden && this.quiet;
    var retireRoom = canRetire ? Math.max(0, Math.min(8, capLimit - plannedTotal)) : 0;
    var removeSlots = [];
    for (i = 0; i < free.length; i++) {
      var fSlot = free[i];
      var fPrevId = previous[this.kind[fSlot]] ? previous[this.kind[fSlot]].id : '';
      var fNext = kinds.indexOf(fPrevId);
      if (retireRoom > 0 && fNext >= 0 && this.role[fSlot] !== FILE_IN && this.role[fSlot] !== WAIT_IN) {
        this.kind[fSlot] = fNext;
        this.departureReason[fSlot] = 0;
        if (this.role[fSlot] !== RETIRE) {
          if (!(this.atX[fSlot] > 0 || this.atY[fSlot] > 0)) {
            this.restPoint(fSlot, this.spot);
            this.atX[fSlot] = this.spot.x;
            this.atY[fSlot] = this.spot.y;
          }
          this.assume(fSlot, RETIRE, 0);
        }
        retireRoom--;
      } else {
        removeSlots.push(fSlot);
      }
    }
    var reason = this.quiet ? 'quiet-cap' : this.level > 0 && total < this.targetCount ? 'quality-cap' : this.guests() > 0 && total < this.targetCount ? 'guest-seat' : 'reconcile';
    removeSlots.sort(function (a, b) { return b - a; });
    for (i = 0; i < removeSlots.length; i++) this.remove(removeSlots[i], reason);
    for (k = 0; k < kinds.length; k++) {
      while (have[k] < plan[k].count) {
        var slot = this.count++;
        this.kind[slot] = k;
        this.entityId[slot] = this.nextEntityId++;
        this.spawn(slot, true);
        have[k]++;
      }
    }
    this.assignGroups();
  };

  // A new slot starts at the next golden-ratio spot with its own stable entityId.
  Habitat.prototype.spawn = function (slot, fresh) {
    var spec = this.kinds[this.kind[slot]].spec;
    this.fresh[slot] = fresh ? 1 : 0;
    if (!this.entityId[slot]) this.entityId[slot] = this.nextEntityId++;
    this.departureReason[slot] = 0;
    this.carrying[slot] = 0;
    this.prevX[slot] = 0;
    this.prevY[slot] = 0;
    if (!fresh) this.role[slot] = 0;
    if (fresh) {
      this.phase[slot] = this.spawned * 0.61803398875 % 1;
      this.dir[slot] = this.spawned % 3 === 0 ? -1 : 1;
      this.turnAt[slot] = 0;
      this.pauseUntil[slot] = 0;
      this.nextPause[slot] = this.elapsed + 2 + Math.random() * 8;
      this.wobble[slot] = Math.random() * TAU;
      this.gait[slot] = Math.random() * FRAMES;
      this.inset[slot] = this.skitterUntil && this.clock < this.skitterUntil ? -18 - (slot % 8) * 10 : 0;
      this.spawned++;
    }
    this.speed[slot] = spec.speed * (0.85 + Math.random() * 0.3);
    this.wobbleRate[slot] = 1.2 + Math.random() * 1.4;
    this.lane[slot] = this.kind[slot] === 0 ? 0.45 + Math.random() * 0.55 : Math.random();
    this.drift[slot] = Math.random() * TAU;
    if (fresh) this.freeReady[slot] = 0;
  };

  Habitat.prototype.remove = function (slot, reason) {
    var departedId = this.entityId[slot];
    var departedSpecies = this.kinds[this.kind[slot]] ? this.kinds[this.kind[slot]].id : '';
    var departedAt = +this.clock.toFixed(2);
    if (departedId) {
      this.lastDeparted.push({id: departedId, species: departedSpecies, reason: reason || 'reconcile', at: departedAt, clock: departedAt});
      if (this.lastDeparted.length > 16) this.lastDeparted.shift();
    }
    var last = --this.count;
    this.moveManners(slot, last);
    if (slot !== last) {
      var fields = ['kind', 'leader', 'fresh', 'dir', 'phase', 'speed', 'lane', 'drift', 'inset', 'spacing', 'offset', 'wobble', 'wobbleRate', 'gait', 'pauseUntil', 'nextPause', 'turnAt', 'role', 'roleStart', 'roleIndex', 'job', 'jobState', 'travel', 'restUntil', 'pace', 'cueFlag', 'saw', 'freeTargetX', 'freeTargetY', 'freeHeading', 'freeReady', 'entityId', 'departureReason', 'carrying', 'prevX', 'prevY'].concat(MANNER_FIELDS);
      if (this.layQueen === last) this.layQueen = slot;
      else if (this.layQueen === slot) this.layQueen = -1;
      for (var f = 0; f < fields.length; f++) this[fields[f]][slot] = this[fields[f]][last];
    } else if (this.layQueen === slot) this.layQueen = -1;
    // The freed seat keeps no role, job or manner for whoever is spawned into it next.
    this.inset[last] = this.role[last] = this.job[last] = this.manner[last] = this.doorWait[last] = this.cueFlag[last] = this.saw[last] = this.freeReady[last] = 0;
    this.entityId[last] = this.departureReason[last] = this.carrying[last] = this.prevX[last] = this.prevY[last] = 0;
    this.partner[last] = -1;
    this.side[last] = this.yieldUntil[last] = 0;
    this.stride[last] = 1;
  };

  Habitat.prototype.skitterIn = function () {
    this.closing = null;
    this.skitterStart = this.clock || 0.001;
    this.skitterUntil = this.skitterStart + 1.8;
    for (var i = 0; i < this.count; i++) {
      this.inset[i] = -18 - (i % 8) * 10;
    }
  };

  Habitat.prototype.skitterOut = function (onDone) {
    if (!this.active || this.destroyed || this.canvas.ownerDocument.hidden || !this.count) {
      this.closing = null;
      if (typeof onDone === 'function') onDone();
      return false;
    }
    this.closing = {start: this.clock, duration: 0.38, onDone: typeof onDone === 'function' ? onDone : null};
    return true;
  };

  Habitat.prototype.setInspector = function (enabled, targetId) {
    this.inspector.enabled = !!enabled;
    if (!this.inspector.enabled) {
      this.inspector.targetId = 0;
      this.inspector.trailLen = 0;
      return this.inspectorDiagnostics();
    }
    if (targetId !== undefined && targetId !== null) {
      return this.inspectCreature(targetId);
    }
    if (!this.inspector.targetId && this.count > 0) {
      this.inspector.targetId = this.entityId[0];
      this.inspector.trailLen = 0;
    }
    return this.inspectorDiagnostics();
  };

  Habitat.prototype.inspectCreature = function (query) {
    var slot = -1;
    var i;
    if (typeof query === 'string' && query) {
      for (i = 0; i < this.count; i++) {
        if (this.kinds[this.kind[i]] && this.kinds[this.kind[i]].id === query) { slot = i; break; }
      }
    } else if (typeof query === 'number') {
      for (i = 0; i < this.count; i++) {
        if (this.entityId[i] === query) { slot = i; break; }
      }
      if (slot < 0 && query >= 0 && query < this.count && (query | 0) === query) slot = query;
    }
    if (slot >= 0 && slot < this.count) {
      var id = this.entityId[slot];
      if (this.inspector.targetId !== id) this.inspector.trailLen = 0;
      this.inspector.targetId = id;
      this.inspector.enabled = true;
    }
    return this.inspectorDiagnostics();
  };

  Habitat.prototype.seatDestination = function (seat) {
    if (seat < 0 || seat >= this.count) return null;
    var role = this.role[seat];
    var job = this.job[seat];
    if (role === ENTER || role === CREW || role === FILE_IN) {
      return {x: Math.round(this.baseX + this.entryX), y: Math.round(this.baseY + this.entryY), label: 'nest-door'};
    }
    if (this.standalone && role === 0 && job < TEND) {
      return {x: Math.round(this.freeTargetX[seat]), y: Math.round(this.freeTargetY[seat]), label: JOB_NAMES[job] || 'roam'};
    }
    if (job === FORAGE && this.routes.ready) {
      if (this.jobState[seat] >= 1 || this.carrying[seat]) {
        return {x: Math.round(this.baseX + this.entryX), y: Math.round(this.baseY + this.entryY), label: 'nest-door'};
      }
      this.lanePoint(this.routes.forage.b, this.routes.forage.outer, this.spot);
      return {x: Math.round(this.spot.x), y: Math.round(this.spot.y), label: 'forage-pile'};
    }
    this.restPoint(seat, this.spot);
    return {x: Math.round(this.spot.x), y: Math.round(this.spot.y), label: JOB_NAMES[job] || 'lane'};
  };

  Habitat.prototype.inspectorDiagnostics = function () {
    var seat = -1;
    var i;
    if (this.inspector.targetId) {
      for (i = 0; i < this.count; i++) {
        if (this.entityId[i] === this.inspector.targetId) { seat = i; break; }
      }
    } else if (this.inspector.enabled && this.count > 0) {
      seat = 0;
      this.inspector.targetId = this.entityId[0];
    }
    var trail = [];
    for (i = 0; i < this.inspector.trailLen; i++) {
      trail.push([Math.round(this.inspector.trail[i * 2]), Math.round(this.inspector.trail[i * 2 + 1])]);
    }
    var cargo = seat >= 0 ? !!(this.carrying[seat] || ((this.job[seat] === FORAGE || this.job[seat] === RUNNER) && (this.jobState[seat] === 1 || this.jobState[seat] === 2))) : false;
    return {
      enabled: !!this.inspector.enabled,
      targetId: seat >= 0 ? this.entityId[seat] : (this.inspector.targetId || 0),
      seat: seat,
      species: seat >= 0 && this.kinds[this.kind[seat]] ? this.kinds[this.kind[seat]].id : '',
      job: seat >= 0 ? (JOB_NAMES[this.job[seat]] || 'roam') : '',
      role: seat >= 0 ? (ROLE_NAMES[this.role[seat]] || 'lane') : '',
      x: seat >= 0 ? Math.round(this.atX[seat]) : 0,
      y: seat >= 0 ? Math.round(this.atY[seat]) : 0,
      cargo: cargo,
      destination: seat >= 0 ? this.seatDestination(seat) : null,
      trail: trail,
      recentDepartures: this.lastDeparted.slice()
    };
  };

  // The first roach of each species leads; a few more trail it as an escort, the rest roam alone.
  Habitat.prototype.assignGroups = function () {
    var first = [];
    var rank = [];
    this.lead = -1;
    for (var i = 0; i < this.count; i++) {
      if (this.role[i] === RETIRE) {
        this.leader[i] = -1;
        this.fresh[i] = 0;
        continue;
      }
      var k = this.kind[i];
      var entry = this.plan[k];
      var spec = this.kinds[k].spec;
      if (first[k] === undefined) {
        first[k] = i;
        rank[k] = 0;
        this.leader[i] = -1;
        if (k === 0 && spec.chain !== 'brood') {
          this.lead = i;
          this.lane[i] = 0.75;
        }
      } else {
        // The top species' escort grows with the order of magnitude it has reached.
        // Species whose job keeps them near the nest work alone rather than in a lane formation.
        var escorts = spec.chain === 'brood' || (k !== 0 && JOBS[this.kinds[k].id] >= TEND) ? 0 : k === 0 ? Math.min(6, 2 + Math.floor(entry.magnitude / 6)) : entry.count > 4 ? 2 : 1;
        rank[k]++;
        if (rank[k] > escorts) this.leader[i] = -1;
        else {
          this.leader[i] = first[k];
          this.spacing[i] = this.kinds[k].tile * 0.8 * rank[k];
          this.offset[i] = (rank[k] % 2 ? 1 : -1) * 7 * Math.ceil(rank[k] / 2);
        }
      }
      if (this.fresh[i] && this.leader[i] >= 0) {
        var leader = this.leader[i];
        this.phase[i] = this.phase[leader] - this.dir[leader] * this.spacing[i] / laneLength(this.canvas.width, this.canvas.height, this.laneMax);
        this.phase[i] -= Math.floor(this.phase[i]);
        this.dir[i] = this.dir[leader];
      }
      this.fresh[i] = 0;
    }
    this.assignJobs();
  };

  Habitat.prototype.jobFor = function (i) {
    if (this.leader[i] >= 0 || i === this.lead || this.role[i] === RETIRE) return ROAM;
    var id = this.kinds[this.kind[i]].id;
    return SPECIES[id].chain === 'territory' ? CLAIM : JOBS[id] || ROAM;
  };

  // Jobs survive reallocation while the slot still qualifies; quotas grow with the log-scale steps that drive them.
  Habitat.prototype.assignJobs = function () {
    var ready = this.routes.ready;
    var quota = [0, ready ? Math.min(5, 1 + Math.floor(Math.max(this.income, this.crumbs) / 3)) : 0, ready ? Math.min(5, 1 + Math.floor(this.territory / 4)) : 0, 1, 1, ready ? 3 : 0, ready ? 4 : 0, 2];
    var used = [0, 0, 0, 0, 0, 0, 0, 0];
    var i, job;
    for (i = 0; i < this.count; i++) {
      if (this.role[i] === RETIRE) { this.job[i] = ROAM; this.pace[i] = 1; continue; }
      job = this.job[i];
      if (!job) continue;
      var keep = job === PROCESSION ? i === this.lead : job === RUNNER ? this.kinds[this.kind[i]].spec.chain !== 'brood' : job === this.jobFor(i) && used[job] < quota[job];
      if (keep) used[job]++;
      else {
        // A queen leaving the nest circle walks on from the lane spot nearest where she stood, not from a stale one.
        if (job === TEND && this.baseCanvas.width) { this.restPoint(i, this.spot); this.phase[i] = this.nearestPhase(Math.max(this.minInset, this.inset[i]), this.spot.x, this.spot.y); }
        this.job[i] = ROAM; this.pace[i] = 1;
      }
    }
    for (i = 0; i < this.count; i++) {
      if (this.role[i] === RETIRE) continue;
      job = this.job[i] ? ROAM : this.jobFor(i);
      if (job && used[job] < quota[job]) { used[job]++; this.startJob(i, job); }
    }
  };

  // A lane job picks up where the slot stands if that is on its route; otherwise the worker walks out of the nest.
  Habitat.prototype.startJob = function (i, job) {
    this.job[i] = job;
    this.jobState[i] = 0;
    this.travel[i] = 0;
    this.restUntil[i] = 0;
    this.pace[i] = job === RUNNER ? 1.8 : job === FORAGE ? 1 + this.income * 0.06 : 1;
    if (job === TEND) this.travel[i] = Math.random() * TAU;
    else if (job === SWEEP) { this.jobState[i] = 1; this.restUntil[i] = this.clock + 6 + Math.random() * 20; this.dir[i] = Math.random() < 0.5 ? 1 : -1; }
    else if (job !== PROCESSION) {
      var r = job === CLAIM ? this.routes.claim : this.routes.forage;
      var along = (this.phase[i] - r.a) * r.dir;
      along -= Math.floor(along);
      if (along <= r.span) this.travel[i] = along;
      else if (!this.role[i]) this.emerge(i, 0);
    }
  };

  // Advances a lane job one frame and returns whether the slot is walking.
  Habitat.prototype.work = function (i, delta, width, height) {
    var job = this.job[i];
    var r = job === CLAIM ? this.routes.claim : job === PROCESSION ? this.routes.procession : this.routes.forage;
    var state = this.jobState[i];
    if (state === 1 || state === 3) {
      if (this.clock < this.restUntil[i]) return false;
      if (state === 3 && (job === RUNNER || job === PROCESSION)) { this.job[i] = ROAM; this.pace[i] = 1; this.carrying[i] = 0; return false; }
      this.jobState[i] = state = (state + 1) & 3;
      if (state === 2 && job === FORAGE && this.carrying[i]) {
        var along = (this.phase[i] - r.a) * r.dir;
        along -= Math.floor(along);
        this.travel[i] = along <= r.span + 0.02 ? Math.max(0, r.span - along) : 0;
      } else {
        this.travel[i] = 0;
      }
      if (state === 0) this.carrying[i] = 0;
    }
    if (!this.stride[i]) return false;
    // Outbound on the outer lane, inbound on the inner one, drifting across between them.
    var target = state === 0 ? r.outer : r.inner;
    var inset = this.inset[i] === 0 ? target : this.inset[i];
    var shift = Math.min(60, this.speed[i] * 0.6) * delta;
    if (inset < this.minInset) {
      if (this.skitterStart && this.clock < this.skitterStart + (i % 12) * 0.06) shift = 0;
      else shift = Math.max(shift, this.speed[i] * 1.15 * delta);
    }
    inset += Math.max(-shift, Math.min(shift, target - inset));
    if (inset === 0) inset = 0.01;
    this.inset[i] = inset;
    var step = this.speed[i] * this.pace[i] * this.stride[i] * delta / laneLength(width, height, inset);
    this.dir[i] = state === 0 ? r.dir : -r.dir;
    this.phase[i] += this.dir[i] * step;
    this.travel[i] += step;
    if (this.travel[i] >= r.span) {
      // Foragers pick a crumb up at the far end and set it down at the nest.
      if (job === FORAGE) {
        this.cueFlag[i] = state ? 2 : 1;
        this.carrying[i] = state ? 0 : 1;
      } else if (job === RUNNER) {
        this.carrying[i] = state ? 0 : 1;
      }
      this.jobState[i] = job === PROCESSION ? 3 : state + 1;

      this.restUntil[i] = this.clock + RESTS[job][state ? 1 : 0];
    }
    return true;
  };

  // Moves a seat's lane inset toward want at a little over half its walking speed, so a change of lane is walked rather
  // than jumped. A seat with no lane yet takes want at once.
  Habitat.prototype.easeInset = function (i, want, delta) {
    var inset = this.inset[i];
    if (inset === 0) {
      this.inset[i] = want;
      return want;
    }
    var step = this.speed[i] * 0.6 * delta;
    if (inset < this.minInset) {
      if (this.skitterStart && this.clock < this.skitterStart + (i % 12) * 0.06) return inset;
      var inStep = Math.max(step, this.speed[i] * 1.15 * delta);
      inset += Math.min(inStep, want - inset);
      if (inset === 0) inset = 0.01;
    } else {
      inset += Math.max(-step, Math.min(step, want - inset));
    }
    this.inset[i] = inset;
    return inset;
  };

  // A tending queen's circle is centred on the entrance, raised or lowered just enough to keep it on screen.
  Habitat.prototype.tendY = function (ey, reach) {
    var half = reach * 0.55 + 20;
    return Math.max(half, Math.min(ey, this.canvas.height - half));
  };

  // Queens circle the nest, night-shift insects hover at its nexus nodes, bats now and then sweep the top edge.
  Habitat.prototype.drawFree = function (i, record, delta) {
    var job = this.job[i];
    var tile = record.tile;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var below = ey > this.canvas.height / 2 ? -1 : 1;
    var alpha = 1;
    var x, y, angle, wave;
    if (!this.baseCanvas.width) return;
    if (job === TEND) {
      if (this.clock >= this.restUntil[i]) this.travel[i] += delta * 0.3 * (0.55 + 0.45 * Math.sin(this.clock * 0.35 + i));
      var reach = Math.max(30, this.baseCanvas.width * 0.42);
      wave = this.travel[i];
      x = ex + Math.cos(wave) * reach;
      y = this.tendY(ey, reach) + Math.sin(wave) * reach * 0.55;
      angle = Math.atan2(Math.cos(wave) * 0.55, -Math.sin(wave));
      if (this.clock < this.restUntil[i]) angle += Math.PI / 2;
    } else if (job === HOVER) {
      var s = this.baseCanvas.width / 260;
      var r = 24 + this.base.hatchery * 4.2;
      var node = this.base.nexus ? i % this.base.nexus : -1;
      var at = Math.PI * (0.18 + node * 0.16);
      x = ex + (node < 0 ? 0 : Math.cos(at) * (r + 12) * s) + Math.sin(this.clock * 1.3 + i * 2) * 14;
      y = ey + (node < 0 ? below * this.baseCanvas.height * 0.42 : Math.sin(at) * (r + 12) * 0.82 * s) + Math.sin(this.clock * 1.7 + i) * 8;
      angle = Math.atan2(Math.cos(this.clock * 1.7 + i) * 13.6, Math.cos(this.clock * 1.3 + i * 2) * 18.2);
      // When its nexus node changes it flies over at a steady pace rather than appearing there.
      if (this.jobState[i]) {
        var hx = x - this.atX[i];
        var hy = y - this.atY[i];
        var far = Math.sqrt(hx * hx + hy * hy);
        var reachable = this.speed[i] * HURRY * delta;
        if (far > reachable) { x = this.atX[i] + hx / far * reachable; y = this.atY[i] + hy / far * reachable; }
      }
      this.jobState[i] = 1;
      if (record.spec.glow) alpha = 0.55 + 0.45 * Math.abs(Math.sin(this.clock * 2.1 + i * 1.3));
      // The night shift lights the fireflies brighter.
      if (record.spec.glow && this.night) {
        this.ctx.globalAlpha = 0.7 * alpha;
        this.glow(this.fireGlow, x, y, tile * 1.6);
      }
    } else {
      if (this.jobState[i] === 1) {
        if (this.clock < this.restUntil[i]) return;
        this.jobState[i] = 0;
        this.travel[i] = 0;
      }
      var across = this.canvas.width + tile * 2;
      this.travel[i] += delta * this.speed[i] * HURRY / across;
      if (this.travel[i] >= 1) { this.jobState[i] = 1; this.restUntil[i] = this.clock + 25 + Math.random() * 30; this.dir[i] = -this.dir[i]; return; }
      x = this.dir[i] > 0 ? -tile + this.travel[i] * across : this.canvas.width + tile - this.travel[i] * across;
      y = this.minInset + 8 + Math.sin(this.travel[i] * Math.PI * 3) * 10;
      angle = this.dir[i] > 0 ? 0 : Math.PI;
    }
    var resting = job === TEND && this.clock < this.restUntil[i];
    this.stepGait(i, record, x, y, delta, !resting, 1);
    this.atX[i] = x;
    this.atY[i] = y;
    if (this.blocked(x, y, tile * 0.55)) return;
    var dir = facingRow(angle);
    var drawRec = record;
    var frame = this.gait[i] | 0;
    if (resting && i === this.layQueen && record.id === 'queen') {
      var layAct = this.actingAtlas('queen-lay');
      if (layAct) {
        drawRec = layAct;
        frame = ((this.clock * 4) | 0) % FRAMES;
      }
    } else if (resting && record.id === 'nest') {
      var tendAct = this.actingAtlas('brood-tend');
      if (tendAct) {
        drawRec = tendAct;
        frame = ((this.clock * 3 + i) | 0) % FRAMES;
      }
    }
    this.ctx.globalAlpha = alpha;
    this.blit(drawRec, dir, frame, x, y, this.scaleOf(i, record));
    this.ctx.globalAlpha = 1;
    // A laying queen sets an egg down behind her while she rests.
    if (resting && i === this.layQueen) this.prop('egg', x - DX[dir] * tile * 0.45, y - DY[dir] * tile * 0.45);
  };

  // A tending queen pauses and a hatchling walks out of the nest, more often as larva production grows.
  Habitat.prototype.lay = function () {
    this.layAt = this.clock + Math.max(5, 24 - this.larvae * 2);
    var queen = -1;
    var hatchling = -1;
    for (var i = 0; i < this.count; i++) {
      if (this.job[i] === TEND && queen < 0) queen = i;
      if (this.kinds[this.kind[i]].id === 'hatchling' && !this.role[i] && !this.manner[i] && hatchling < 0) hatchling = i;
    }
    if (queen < 0 || hatchling < 0) return;
    this.restUntil[queen] = this.clock + 1.5;
    this.layQueen = queen;
    if (!this.startNursery(queen)) this.emerge(hatchling, 0);
    this.puff(Motes.FLECK, this.baseX + this.entryX, this.baseY + this.entryY, 3, 30, -Math.PI / 2, 2, 2);

    this.events.lays++;
  };

  // About once a minute the top-tier lead walks slowly with its escort the shorter way round to the nest and ends its
  // walk there. A lead already close to the door tries again a little later.
  Habitat.prototype.process = function () {
    this.processionAt = this.clock + 50 + Math.random() * 20;
    var i = this.lead;
    if (i < 0 || this.role[i] || this.job[i] || !this.routes.ready) return;
    var r = this.routes.procession;
    var inset = Math.max(this.minInset, Math.min(this.laneMax, this.inset[i]));
    var gap = wrap(this.nearestPhase(inset, this.baseX + this.entryX, this.baseY + this.entryY) - this.phase[i]);
    if (Math.abs(gap) < 0.05) { this.processionAt = this.clock + 10; return; }
    r.dir = gap < 0 ? -1 : 1;
    r.outer = r.inner = inset;
    r.span = Math.abs(gap);
    this.startJob(i, PROCESSION);
    this.pace[i] = PROCESSION_PACE;
    this.events.processions++;
  };

  // ---- Lane manners ----
  // Walkers on the perimeter lanes notice their neighbours. A group of one species walks at one pace with even gaps,
  // the nest door lets one roach through at a time, two roaches meeting head-on now and then stop to touch antennae,
  // a homebound forager sometimes hands its crumb to an outbound one, and lower tiers step aside for higher ones and
  // part for the procession. One pass a frame before anything moves: lane walkers sorted by lap position, each
  // compared only with the neighbours within reach ahead of it. Fixed arrays, no allocation, nothing while hidden.

  var MANNER_FIELDS = ['stride', 'side', 'yieldSide', 'yieldUntil', 'manner', 'mannerUntil', 'partner', 'doorWait', 'doorTicket', 'doorShow', 'atX', 'atY'];
  // Manner states: nose to nose, stepping past after a greeting, handing a crumb over, and turned after the handover.
  var GREET = 1;
  var PASS = 2;
  var SWAP = 3;
  var TURNED = 4;
  var GREET_SECONDS = 0.6;
  var PASS_SECONDS = 1.2;
  // At most one greeting every GREET_GAP to GREET_GAP + GREET_JITTER visible seconds, and one handoff per HANDOFF_GAP.
  var GREET_GAP = 6;
  var GREET_JITTER = 4;
  var HANDOFF_SECONDS = 1.1;
  var HANDOFF_SWAP = 0.6;
  var HANDOFF_GAP = 14;
  var HANDOFF_JITTER = 10;
  // The doorway frees this long after its last user has walked a body length clear.
  var DOOR_GAP = 0.2;
  // Emergences that are only for show wait in a queue of at most this many.
  var DOOR_QUEUE = 3;
  // A door user that stops close to the entrance frees the door after this many seconds anyway.
  var DOOR_LEAVE = 2;
  // Sideways steps ease at SIDE_RATE px/s, or at a slower walker's own speed, reach at most SIDE_MAX px, may go a little
  // past the lane band, and last YIELD_HOLD s after the conflict that caused them.
  var SIDE_RATE = 70;
  var SIDE_MAX = 26;
  var SIDE_IN = 12;
  var SIDE_OUT = 4;
  var YIELD_HOLD = 0.35;
  // Nothing further along the lane than this is compared.
  var REACH = 360;
  var PROCESSION_RANK = 1000;
  var WALKER = 1;
  var PACER = 2;
  var GREETER = 4;

  Habitat.prototype.initManners = function () {
    // How much of its own speed each walker uses this frame: 0 holds it in place, below 1 keeps a group's gaps even.
    this.stride = new Float32Array(MAX_ROACHES).fill(1);
    // Sideways offset in pixels from its lane, positive toward the centre, and the offset it is easing toward.
    this.side = new Float32Array(MAX_ROACHES);
    this.yieldSide = new Float32Array(MAX_ROACHES);
    this.yieldUntil = new Float64Array(MAX_ROACHES);
    this.manner = new Uint8Array(MAX_ROACHES);
    this.mannerUntil = new Float64Array(MAX_ROACHES);
    this.partner = new Int8Array(MAX_ROACHES).fill(-1);
    this.doorWait = new Uint8Array(MAX_ROACHES);
    this.doorTicket = new Float64Array(MAX_ROACHES);
    this.doorShow = new Uint8Array(MAX_ROACHES);
    // Where each walker was last drawn, for review and tests.
    this.atX = new Float32Array(MAX_ROACHES);
    this.atY = new Float32Array(MAX_ROACHES);
    // Per-frame scratch.
    this.order = new Uint8Array(MAX_ROACHES);
    this.orderCount = 0;
    this.sorted = new Uint32Array(MAX_ROACHES);
    this.sortStamp = 0;
    this.walker = new Uint8Array(MAX_ROACHES);
    this.velocity = new Float32Array(MAX_ROACHES);
    this.rank = new Float32Array(MAX_ROACHES);
    this.front = new Int8Array(MAX_ROACHES).fill(-1);
    this.frontGap = new Float32Array(MAX_ROACHES);
    this.kindRank = [];
    this.rankPlan = null;
    this.calm = false;
    this.doorOwner = -1;
    this.doorFreeAt = 0;
    this.doorLeft = -1;
    this.tickets = 0;
    this.greetA = this.greetB = -1;
    this.greetNext = GREET_GAP;
    this.handoffNext = HANDOFF_GAP;
    this.lastHandoff = {from: -1, to: -1, at: 0};
    this.behaviors = {greetings: 0, handoffs: 0, yields: 0, queued: 0};
  };

  // Hiding drops every greeting, handoff, sideways step and door turn; cooldowns restart on the visible clock.
  Habitat.prototype.resetManners = function () {
    this.stride.fill(1);
    this.side.fill(0);
    this.yieldUntil.fill(0);
    this.manner.fill(0);
    this.partner.fill(-1);
    this.doorWait.fill(0);
    this.front.fill(-1);
    this.doorOwner = -1;
    this.doorFreeAt = 0;
    this.doorLeft = -1;
    this.greetA = this.greetB = -1;
    this.greetNext = this.clock + GREET_GAP;
    this.handoffNext = this.clock + HANDOFF_GAP;
  };

  // remove() moves the last slot into a freed one; partners and the door follow it.
  Habitat.prototype.moveManners = function (slot, last) {
    for (var k = 0; k <= last; k++) {
      if (this.partner[k] === slot) this.release(k);
      else if (this.partner[k] === last) this.partner[k] = slot;
    }
    if (this.doorOwner === slot) this.freeDoor();
    else if (this.doorOwner === last) this.doorOwner = slot;
    if (this.greetA === last) this.greetA = slot; else if (this.greetA === slot) this.greetA = -1;
    if (this.greetB === last) this.greetB = slot; else if (this.greetB === slot) this.greetB = -1;
    // The handoff in progress is found by its carrier's slot, so it follows the move too.
    var h = this.lastHandoff;
    if (h.from === last) h.from = slot; else if (h.from === slot) h.from = -1;
    if (h.to === last) h.to = slot; else if (h.to === slot) h.to = -1;
  };

  Habitat.prototype.release = function (i) {
    var p = this.partner[i];
    this.manner[i] = 0;
    this.partner[i] = -1;
    this.yieldUntil[i] = 0;
    if (p >= 0 && this.partner[p] === i) { this.manner[p] = 0; this.partner[p] = -1; this.yieldUntil[p] = 0; }
  };

  Habitat.prototype.freeDoor = function () {
    this.doorOwner = -1;
    this.doorLeft = -1;
    this.doorFreeAt = Math.max(this.doorFreeAt, this.clock + DOOR_GAP);
  };

  // An emergence is only for show when the roach could just as well walk on from where it is; caravan members and
  // workers that must come out to reach their route always queue. With DOOR_QUEUE show emergences already waiting,
  // another is skipped. Marks the slot so later requests can count it.
  Habitat.prototype.doorFull = function (slot) {
    var job = this.job[slot];
    // Caravans, work crews, egg carriers and a colony released after the ascension ceremony are inside the nest and
    // must come out, so they queue without a cap.
    var role = this.role[slot];
    var show = role !== CARAVAN && role !== CREW && role !== CARRY && role !== WAIT_IN && role !== FILE_IN;
    if (show && job && job < TEND && job !== PROCESSION) {
      var r = job === CLAIM ? this.routes.claim : this.routes.forage;
      var along = (this.phase[slot] - r.a) * r.dir;
      show = along - Math.floor(along) <= r.span;
    }
    this.doorShow[slot] = show ? 1 : 0;
    if (!show) return false;
    var waiting = 0;
    for (var i = 0; i < this.count; i++) if (this.doorWait[i] && this.doorShow[i] && this.role[i] === EMERGE && i !== slot) waiting++;
    return waiting >= DOOR_QUEUE;
  };

  // An emerging roach waits inside the nest for its turn at the door.
  Habitat.prototype.awaitDoor = function (slot) {
    // A worker's route counts from the lap position where it starts, which on another lane is not the spot nearest
    // the entrance. Starting there means every forager comes home to the same spot by the door.
    var job = this.job[slot];
    if (job && job < TEND && job !== PROCESSION && this.routes.ready) this.phase[slot] = (job === CLAIM ? this.routes.claim : this.routes.forage).a;
    if (this.doorOwner === slot) this.freeDoor();
    this.doorWait[slot] = 1;
    // The purchase runner carries the parcel, so it goes to the front of the queue.
    this.doorTicket[slot] = job === RUNNER ? -++this.tickets : ++this.tickets;
    this.roleStart[slot] = 1e12;
  };

  Habitat.prototype.manners = function (delta) {
    var count = this.count;
    var clock = this.clock;
    var i, k, s;
    if (this.rankPlan !== this.plan) {
      this.rankPlan = this.plan;
      this.kindRank = this.kinds.map(function (record) { return priority(record.id); });
    }
    var procession = this.lead >= 0 && this.job[this.lead] === PROCESSION && !this.role[this.lead] ? this.lead : -1;
    this.calm = clock >= this.paradeUntil && clock >= this.caravanUntil && procession < 0 && !this.intruder;
    for (i = 0; i < count; i++) this.classify(i, procession);
    // Followers move with their leader.
    for (i = 0; i < count; i++) if (this.walker[i] && this.leader[i] >= 0) this.velocity[i] = this.dir[i] * Math.abs(this.velocity[this.leader[i]]);
    for (i = 0; i < count; i++) if (this.manner[i]) this.advanceManner(i);
    var n = this.sortWalkers();
    var order = this.order;
    var length = laneLength(this.canvas.width, this.canvas.height, (this.minInset + this.laneMax) / 2);
    for (k = 0; k < n; k++) {
      var a = order[k];
      var phaseA = this.phase[a];
      for (s = 1; s < n; s++) {
        var idx = k + s;
        var b = order[idx < n ? idx : idx - n];
        var gap = this.phase[b] - phaseA;
        if (gap < 0) gap += 1;
        gap *= length;
        if (gap > REACH) break;
        this.meet(a, b, gap);
      }
    }
    this.door();
    for (i = 0; i < count; i++) {
      var stride = 1;
      var f = this.front[i];
      if (f >= 0) {
        stride = this.matchPace(i, f);
        // A roamer walking in a group takes no breaks of its own; it stops when the one ahead stops.
        if (!this.job[i] && this.elapsed >= this.nextPause[i] - 0.1) this.nextPause[i] = this.elapsed + 2 + Math.random() * 6;
      }
      // Stepping aside slows a walker a little, the runner hurrying a parcel to the panel too, so the sideways step and
      // its stride together stay a walk.
      if (!this.manner[i] && clock < this.yieldUntil[i]) stride *= 0.65;
      if ((this.manner[i] && this.manner[i] !== PASS) || this.doorWait[i]) stride = 0;
      this.stride[i] = stride;
      var want = clock < this.yieldUntil[i] ? this.yieldSide[i] : 0;
      var step = Math.min(SIDE_RATE, this.speed[i]) * delta;
      this.side[i] += Math.max(-step, Math.min(step, want - this.side[i]));
    }
  };

  // This frame's facts about one slot: whether it walks a lane, may keep pace or greet, how fast it moves and its rank.
  Habitat.prototype.classify = function (i, procession) {
    var flags = 0;
    var v = 0;
    var job = this.job[i];
    this.front[i] = -1;
    this.frontGap[i] = REACH;
    if (this.role[i]) {
      if (this.manner[i]) this.release(i);
      this.side[i] = 0;
      this.yieldUntil[i] = 0;
    } else if (job < TEND) {
      flags = WALKER;
      if (this.leader[i] >= 0) v = 1;
      else if (!job) {
        if (this.elapsed >= this.pauseUntil[i]) v = this.speed[i] * this.stride[i];
        if (i !== this.lead) flags |= PACER | (v ? GREETER : 0);
      } else if (this.jobState[i] === 0 || this.jobState[i] === 2) {
        v = this.speed[i] * this.pace[i] * this.stride[i];
        if (job === FORAGE || job === CLAIM) flags |= PACER | (job === CLAIM && v ? GREETER : 0);
      }
    }
    this.walker[i] = flags;
    this.velocity[i] = this.dir[i] * v;
    this.rank[i] = this.kindRank[this.kind[i]] + (procession >= 0 && (i === procession || this.leader[i] === procession) ? PROCESSION_RANK : 0);
  };

  // Lane walkers by lap position. Last frame's order is nearly sorted, so an insertion sort costs about one pass.
  Habitat.prototype.sortWalkers = function () {
    var order = this.order;
    var phase = this.phase;
    var stamp = ++this.sortStamp;
    var n = 0;
    var i, k, m;
    for (k = 0; k < this.orderCount; k++) {
      i = order[k];
      if (i < this.count && this.walker[i] && this.sorted[i] !== stamp) { this.sorted[i] = stamp; order[n++] = i; }
    }
    for (i = 0; i < this.count; i++) if (this.walker[i] && this.sorted[i] !== stamp) { this.sorted[i] = stamp; order[n++] = i; }
    for (k = 1; k < n; k++) {
      i = order[k];
      for (m = k - 1; m >= 0 && phase[order[m]] > phase[i]; m--) order[m + 1] = order[m];
      order[m + 1] = i;
    }
    this.orderCount = n;
    return n;
  };

  // Two walkers b ahead of a in lap position, gap pixels apart along the lane.
  Habitat.prototype.meet = function (a, b, gap) {
    var lat = this.inset[b] - this.inset[a];
    var tile = this.kinds[this.kind[a]].tile + this.kinds[this.kind[b]].tile;
    var flags = this.walker;
    // The same species on the same job heading the same way within a body width of one lane walks as a group, which also
    // opens a gap before two of them drifting onto one lane would meet side by side.
    if (this.kind[a] === this.kind[b] && this.dir[a] === this.dir[b] && flags[a] & flags[b] & PACER && lat > -tile * 0.5 && lat < tile * 0.5 && this.job[a] === this.job[b] && this.jobState[a] === this.jobState[b]) {
      var back = this.dir[a] > 0 ? a : b;
      if (gap < this.frontGap[back]) { this.frontGap[back] = gap; this.front[back] = back === a ? b : a; }
    }
    var closing = this.velocity[a] - this.velocity[b];
    var heldA = this.manner[a] && this.manner[a] !== PASS;
    var heldB = this.manner[b] && this.manner[b] !== PASS;
    if (closing <= 0 || (heldA && heldB)) return;
    var nose = tile * 0.42;
    if (!this.manner[a] && !this.manner[b] && this.dir[a] > 0 && this.dir[b] < 0 && gap <= nose + 2 && (this.handOver(a, b) || this.greet(a, b, lat))) return;
    var parade = this.rank[a] >= PROCESSION_RANK || this.rank[b] >= PROCESSION_RANK;
    var apart = tile * (parade ? 0.55 : 0.42);
    if (lat >= apart || lat <= -apart || gap > nose + closing * (parade ? 0.9 : 0.6) + (parade ? tile * 0.75 : 6)) return;
    // Who steps aside: anyone walking into a pair that is greeting or handing over, the lower of two tiers, or one
    // of the same tier walking into another standing still, unless the two walk together.
    var low;
    if (heldA || heldB) low = heldA ? b : a;
    else if (this.rank[a] !== this.rank[b]) low = this.rank[a] < this.rank[b] ? a : b;
    else if (this.velocity[a] && this.velocity[b]) return;
    else {
      low = this.velocity[a] ? a : b;
      var high = low === a ? b : a;
      if (this.leader[low] === high || this.leader[high] === low || (this.leader[low] >= 0 && this.leader[low] === this.leader[high]) || this.front[low] === high) return;
    }
    if (!this.manner[low]) this.giveWay(low, low === a ? b : a, apart);
  };

  // The lower tier steps sideways away from the higher one, or across it when the lane band has no room.
  Habitat.prototype.giveWay = function (low, high, apart) {
    var d = this.inset[low] - this.inset[high];
    var sign = d >= 0 ? 1 : -1;
    var need = apart - Math.abs(d);
    var room = sign > 0 ? this.laneMax + SIDE_IN - this.inset[low] : this.inset[low] - this.minInset + SIDE_OUT;
    if (room < need) {
      sign = -sign;
      need = apart + Math.abs(d);
      room = sign > 0 ? this.laneMax + SIDE_IN - this.inset[low] : this.inset[low] - this.minInset + SIDE_OUT;
    }
    if (this.clock >= this.yieldUntil[low]) this.behaviors.yields++;
    this.yieldSide[low] = sign * Math.max(0, Math.min(SIDE_MAX, need, room));
    this.yieldUntil[low] = this.clock + YIELD_HOLD;
  };

  // A roach meeting another head-on stops nose to nose, then each steps to its own right and walks on.
  Habitat.prototype.greet = function (a, b, lat) {
    var flags = this.walker;
    if (!this.calm || this.clock < this.greetNext || !(flags[a] & flags[b] & GREETER) || lat > 12 || lat < -12) return false;
    if (a === this.greetA || a === this.greetB || b === this.greetA || b === this.greetB) return false;
    var mid = (this.inset[a] + this.inset[b]) / 2;
    this.pair(a, b, GREET, GREET_SECONDS);
    this.yieldSide[a] = mid - this.inset[a];
    this.yieldSide[b] = mid - this.inset[b];
    this.greetA = a;
    this.greetB = b;
    this.greetNext = this.clock + GREET_SECONDS + GREET_GAP + Math.random() * GREET_JITTER;
    this.behaviors.greetings++;
    return true;
  };

  // Mid-lane, a forager carrying a crumb home meets one heading out: they close to the lane between them and stop.
  Habitat.prototype.handOver = function (a, b) {
    if (this.clock < this.handoffNext || this.job[a] !== FORAGE || this.job[b] !== FORAGE) return false;
    var home = this.jobState[a] === 2 ? a : this.jobState[b] === 2 ? b : -1;
    var out = home === a ? b : a;
    var span = this.routes.forage.span;
    if (home < 0 || this.jobState[out] !== 0) return false;
    if (this.travel[home] < span * 0.2 || this.travel[home] > span * 0.8 || this.travel[out] < span * 0.2 || this.travel[out] > span * 0.8) return false;
    var mid = (this.inset[home] + this.inset[out]) / 2;
    this.pair(home, out, SWAP, HANDOFF_SECONDS);
    this.yieldSide[home] = mid - this.inset[home];
    this.yieldSide[out] = mid - this.inset[out];
    this.yieldUntil[home] = this.yieldUntil[out] = this.clock + HANDOFF_SWAP;
    this.lastHandoff.from = home;
    this.lastHandoff.to = out;
    this.handoffNext = this.clock + HANDOFF_SECONDS + HANDOFF_GAP + Math.random() * HANDOFF_JITTER;
    return true;
  };

  Habitat.prototype.pair = function (a, b, manner, seconds) {
    this.manner[a] = this.manner[b] = manner;
    this.partner[a] = b;
    this.partner[b] = a;
    this.mannerUntil[a] = this.mannerUntil[b] = this.clock + seconds;
    this.yieldUntil[a] = this.yieldUntil[b] = this.clock + seconds;
  };

  Habitat.prototype.advanceManner = function (i) {
    var p = this.partner[i];
    var state = this.manner[i];
    var clock = this.clock;
    if (p < 0 || this.partner[p] !== i || !this.walker[p]) { this.release(i); return; }
    if (state === GREET) {
      // Antennae twitch: the legs flick between two gait frames while the pair stand still.
      this.gait[i] = (clock * 6 | 0) & 1;
      if (clock < this.mannerUntil[i]) return;
      var mid = (this.inset[i] + this.inset[p]) / 2;
      this.manner[i] = PASS;
      this.mannerUntil[i] = this.yieldUntil[i] = clock + PASS_SECONDS;
      this.yieldSide[i] = mid - this.inset[i] + this.dir[i] * Math.min(SIDE_MAX / 2, (this.kinds[this.kind[i]].tile + this.kinds[this.kind[p]].tile) * 0.2);
    } else if (state === PASS) {
      if (clock >= this.mannerUntil[i]) { this.manner[i] = 0; this.partner[i] = -1; }
    } else if (this.job[i] !== FORAGE || this.job[p] !== FORAGE) {
      this.release(i);
    } else if (state === SWAP && clock >= this.mannerUntil[i] - (HANDOFF_SECONDS - HANDOFF_SWAP)) {
      if (this.lastHandoff.from === i) this.swapCrumb(i, p);
    } else if (state === TURNED && clock >= this.mannerUntil[i]) {
      this.manner[i] = 0;
      this.partner[i] = -1;
    }
  };

  // The crumb changes carrier: the homebound forager turns back out and the outbound one carries it home. Their
  // sideways steps become their lane positions, from which each drifts to its new lane as it walks.
  Habitat.prototype.swapCrumb = function (home, out) {
    var r = this.routes.forage;
    this.travel[home] = r.span - this.travel[home];
    this.travel[out] = r.span - this.travel[out];
    this.jobState[home] = 0;
    this.jobState[out] = 2;
    this.carrying[home] = 0;
    this.carrying[out] = 1;
    this.dir[home] = r.dir;
    this.dir[out] = -r.dir;
    this.toLane(home, this.inset[home] + this.side[home], this.side[home]);
    this.toLane(out, this.inset[out] + this.side[out], this.side[out]);
    this.side[home] = this.side[out] = 0;
    this.yieldUntil[home] = this.yieldUntil[out] = 0;
    this.manner[home] = this.manner[out] = TURNED;
    this.lastHandoff.at = this.clock;
    this.behaviors.handoffs++;
  };

  // Speed that keeps an even gap behind the walker ahead of the same species: its pace at the gap, up to a fifth
  // faster to close one, and slower down to a stop when too close. The gap is measured between where the two were
  // drawn, because one lap fraction lands in different places on lanes of different length.
  Habitat.prototype.matchPace = function (i, front) {
    var own = this.speed[i] * (this.job[i] ? this.pace[i] : 1);
    var lead = this.speed[front] * (this.job[front] ? this.pace[front] : 1);
    var even = (this.kinds[this.kind[i]].tile + this.kinds[this.kind[front]].tile) * 0.55 + 4;
    var dx = this.atX[front] - this.atX[i];
    var dy = this.atY[front] - this.atY[i];
    var gap = Math.sqrt(dx * dx + dy * dy);
    if (gap > even * 2.5) return 1;
    var want = Math.abs(this.velocity[front]) + (gap - even) * 3;
    return Math.max(0, Math.min(Math.max(own, lead) * 1.2, want)) / own;
  };

  // One roach at a time in the doorway. Emerging roaches and foragers coming home take numbered turns; the door
  // frees a moment after its user has walked a body length clear.
  Habitat.prototype.door = function () {
    var width = this.canvas.width;
    var height = this.canvas.height;
    var owner = this.doorOwner;
    var span = this.routes.forage.span;
    var i, tile;
    // An emerger holds the door until it has reached its lane spot, and a forager while it comes in and rests there.
    // After that the door frees once its user has walked a body length clear of the entrance, or after a little
    // while if it stops nearby.
    if (owner >= 0 && this.role[owner] !== EMERGE && !(this.job[owner] === FORAGE && this.jobState[owner] >= 2)) {
      if (this.role[owner]) this.freeDoor();
      else {
        if (this.doorLeft < 0) this.doorLeft = this.clock;
        tile = this.kinds[this.kind[owner]].tile;
        var dx = this.atX[owner] - this.baseX - this.entryX;
        var dy = this.atY[owner] - this.baseY - this.entryY;
        var clear = dx * dx + dy * dy >= tile * tile * 1.2;
        // A worker also drifts sideways onto its outbound lane, which can pass the entrance, so it must have walked a
        // body length along its route as well.
        var job = this.job[owner];
        if (job && job < TEND && job !== PROCESSION) clear = clear && this.travel[owner] * laneLength(width, height, this.inset[owner]) >= tile * 1.2;
        // A roamer keeps walking until it is clear rather than taking a break in the doorway.
        if (!job && this.leader[owner] < 0) { this.pauseUntil[owner] = 0; this.nextPause[owner] = Math.max(this.nextPause[owner], this.elapsed + 1); }
        if (clear || this.clock - this.doorLeft > DOOR_LEAVE) this.freeDoor();
      }
    }
    var next = -1;
    for (i = 0; i < this.count; i++) {
      if (!this.role[i] && this.job[i] === FORAGE && this.jobState[i] === 2 && i !== this.doorOwner && span) {
        tile = this.kinds[this.kind[i]].tile;
        // Two body lengths back, so a forager leaving the door drifts onto the outer lane before it passes.
        if ((span - this.travel[i]) * laneLength(width, height, this.inset[i]) <= tile * 2 + 4) {
          if (!this.doorWait[i]) { this.doorWait[i] = 1; this.doorTicket[i] = ++this.tickets; }
        } else this.doorWait[i] = 0;
      } else if (this.doorWait[i] && this.role[i] !== EMERGE) this.doorWait[i] = 0;
      if (this.doorWait[i] && (next < 0 || this.doorTicket[i] < this.doorTicket[next])) next = i;
    }
    if (next >= 0 && this.doorOwner < 0 && this.clock >= this.doorFreeAt) {
      this.doorOwner = next;
      this.doorWait[next] = 0;
      if (this.role[next] === EMERGE) this.roleStart[next] = this.clock - this.roleIndex[next] * 0.3;
    }
    // Count each roach the first time it is left waiting.
    for (i = 0; i < this.count; i++) if (this.doorWait[i] === 1) { this.doorWait[i] = 2; this.behaviors.queued++; }
  };

  Habitat.prototype.behaviorDiagnostics = function () {
    var now = {greeting: 0, handing: 0, yielding: 0, waiting: 0, pacing: 0};
    for (var i = 0; i < this.count; i++) {
      if (this.manner[i] === GREET) now.greeting++;
      else if (this.manner[i] === SWAP || this.manner[i] === TURNED) now.handing++;
      else if (!this.manner[i] && this.clock < this.yieldUntil[i]) now.yielding++;
      if (this.doorWait[i]) now.waiting++;
      if (this.front[i] >= 0) now.pacing++;
    }
    var b = this.behaviors;
    return {greetings: b.greetings, handoffs: b.handoffs, yields: b.yields, queued: b.queued, door: this.doorOwner >= 0, now: now};
  };

  // ---- Nest interior life ----
  // A few half-size roaches walk the nest's traced tunnels from the entrance to its chambers and back, pausing in
  // each chamber. They are separate from the lane entities, capped at MOVERS, and drawn only with the habitat.

  Habitat.prototype.setNestPaths = function (paths) {
    if (!paths || !paths.tunnels.length) { this.nestPaths = null; this.movers = 0; return; }
    var tunnels = paths.tunnels.map(function (points, i) {
      var cum = [0];
      for (var k = 1; k < points.length; k++) cum.push(cum[k - 1] + Math.sqrt(Math.pow(points[k][0] - points[k - 1][0], 2) + Math.pow(points[k][1] - points[k - 1][1], 2)));
      return {points: points, cum: cum, length: cum[cum.length - 1], chamber: paths.chambers[i]};
    });
    this.nestPaths = {tunnels: tunnels, entrance: paths.entrance};
    for (var m = 0; m < this.movers; m++) {
      if (this.moverTunnel[m] >= tunnels.length) { this.moverTunnel[m] = 0; this.moverAt[m] = 0; this.moverDir[m] = 1; }
      this.moverAt[m] = Math.min(this.moverAt[m], tunnels[this.moverTunnel[m]].length);
    }
  };

  // Two to ten movers with the nest's stage and the colony's size: a queen once queens exist, a hatchling with brood.
  // A dormant nest holds only its foraged hatchlings.
  Habitat.prototype.planMovers = function (log) {
    var dormant = this.dormantBrood >= 0;
    var target = !this.nestPaths ? 0 : dormant ? this.dormantBrood : Math.min(MOVERS, 2 + this.stage + Math.min(3, Math.floor(log / 8)));
    var queens = this.candidates.some(function (c) { return SPECIES[c.id].chain === 'meat' && SPECIES[c.id].tier >= 2; });
    for (var m = 0; m < target; m++) {
      var kind = dormant ? 2 : m === 0 && queens ? 1 : m === 1 && this.broodCount ? 2 : 0;
      if (m < this.movers && this.moverKind[m] === kind) continue;
      this.moverKind[m] = kind;
      if (m >= this.movers) {
        this.moverTunnel[m] = this.chooseTunnel(kind, false);
        this.moverAt[m] = 0;
        this.moverDir[m] = 1;
        this.moverRest[m] = this.clock + m * 1.3;
        this.moverCargo[m] = 0;
        this.moverGait[m] = Math.random() * FRAMES;
      }
    }
    this.movers = target;
  };

  // Queens head for the egg chamber, crumb carriers for the stockpile, and at night workers tend the nexus.
  Habitat.prototype.chooseTunnel = function (kind, cargo) {
    var tunnels = this.nestPaths.tunnels;
    var want = kind === 1 ? 'egg' : cargo ? 'crumb' : this.night && Math.random() < 0.5 ? 'nexus' : '';
    var pick = Math.random() * tunnels.length | 0;
    if (want && (kind === 1 || Math.random() < 0.85)) for (var t = 0; t < tunnels.length; t++) if (tunnels[t].chamber.kind === want) return t;
    return pick;
  };

  // A forager sets its crumb down at the entrance; the next inner worker to reach the door carries it inside.
  Habitat.prototype.handoff = function () {
    if (this.movers) this.pending = Math.min(3, this.pending + 1);
  };

  Habitat.prototype.drawMovers = function (delta) {
    var paths = this.nestPaths;
    if (!paths || !this.baseCanvas.width || !this.moverRecords.length) return;
    var ctx = this.ctx;
    var nw = this.baseCanvas.width;
    var nh = this.baseCanvas.height;
    var c = root.RoachCreatures;
    for (var m = 0; m < this.movers; m++) {
      var tunnel = paths.tunnels[this.moverTunnel[m]];
      var record = this.moverRecords[this.moverKind[m]];
      var half = record.tile / 2;
      var walking = this.clock >= this.moverRest[m];
      var x, y, dir;
      if (walking && this.moverDir[m]) {
        var at = this.moverAt[m] + this.moverDir[m] * MOVER_SPEED * (this.moverKind[m] === 1 ? 0.6 : 1) * delta;
        if (at >= tunnel.length) {
          // Arrived: linger in the chamber, a queen longest; the cargo is set down.
          at = tunnel.length;
          this.moverDir[m] = 0;
          this.moverRest[m] = this.clock + (this.moverKind[m] === 1 ? 6 : 2) + Math.random() * 4;
          this.moverCargo[m] = 0;
        } else if (at <= 0) {
          at = 0;
          if (!this.moverKind[m] && this.pending) { this.pending--; this.moverCargo[m] = 1; this.handoffs++; }
          this.moverTunnel[m] = this.chooseTunnel(this.moverKind[m], !!this.moverCargo[m]);
          this.moverDir[m] = 1;
          this.moverRest[m] = this.clock + 0.5 + Math.random() * 2;
        }
        this.moverAt[m] = at;
      } else if (walking) {
        this.moverDir[m] = -1;
      }
      // Position along the polyline, facing the dominant axis of the current segment.
      var points = tunnel.points;
      var k = 1;
      while (k < points.length - 1 && tunnel.cum[k] < this.moverAt[m]) k++;
      var a = points[k - 1];
      var b = points[k];
      var seg = tunnel.cum[k] - tunnel.cum[k - 1] || 1;
      var t = Math.max(0, Math.min(1, (this.moverAt[m] - tunnel.cum[k - 1]) / seg));
      x = a[0] + (b[0] - a[0]) * t;
      y = a[1] + (b[1] - a[1]) * t;
      dir = quarter(Math.atan2(b[1] - a[1], b[0] - a[0]) + (this.moverDir[m] < 0 ? Math.PI : 0));
      if (!this.moverDir[m]) {
        // Lingering: a slow pace back and forth across the chamber floor.
        var r = Math.max(0, tunnel.chamber.r - half);
        var swing = Math.sin(this.clock * 0.9 + m * 1.7);
        x = tunnel.chamber.x + r * 0.6 * swing;
        y = tunnel.chamber.y;
        dir = Math.cos(this.clock * 0.9 + m * 1.7) >= 0 ? 0 : 2;
      }
      if (walking || !this.moverDir[m]) this.moverGait[m] = (this.moverGait[m] + delta * FRAME_RATE) % FRAMES;
      x = Math.round(x);
      y = Math.round(y);
      this.moverX[m] = x;
      this.moverY[m] = y;
      // Clipped to the nest: a mover whose sprite would leave the nest bitmap is not drawn.
      if (x - half < 0 || y - half < 0 || x + half > nw || y + half > nh) continue;
      var wriggle = this.dormantBrood >= 0 && this.moverKind[m] === 2 ? this.actingAtlas('hatchling-wriggle') : null;
      var miniKey = '';
      if (this.dormantBrood < 0 && !this.moverDir[m] && this.stage >= 3 && creatureSheet && c && c.strips) {
        if (tunnel.chamber.kind === 'egg' && this.moverKind[m] === 1) miniKey = 'mini-nest';
        else if (tunnel.chamber.kind === 'nexus') miniKey = this.stage >= 4 && (m & 1) ? 'mini-goddess' : 'mini-nightbug';
        else if (this.stage >= 4 && m === 2) miniKey = 'mini-goddess';
      }
      var miniStrip = miniKey && c.strips[miniKey] ? c.strips[miniKey] : null;
      if (wriggle && x - wriggle.tile / 2 >= 0 && y - wriggle.tile / 2 >= 0 && x + wriggle.tile / 2 <= nw && y + wriggle.tile / 2 <= nh) {
        this.blit(wriggle, dir, this.moverGait[m] | 0, this.baseX + x, this.baseY + y, 1);
      } else if (miniStrip && x - miniStrip.size / 2 >= 0 && y - miniStrip.size / 2 >= 0 && x + miniStrip.size / 2 <= nw && y + miniStrip.size / 2 <= nh) {
        var ms = miniStrip.size;
        var mx = (this.baseX + x - ms / 2 + 0.5) | 0;
        var my = (this.baseY + y - ms / 2 + 0.5) | 0;
        var mf = this.moverGait[m] | 0;
        ctx.drawImage(creatureSheet, miniStrip.x + mf * ms, miniStrip.y, ms, ms, mx, my, ms, ms);
        this.touch(mx, my, ms, ms);
      } else {
        this.blit(record, dir, this.moverGait[m] | 0, this.baseX + x, this.baseY + y, 1);
      }
      if (this.moverCargo[m] && creatureSheet) {
        var cx = this.baseX + x + DX[dir] * 5 - c.motes.cell / 2;
        var cy = this.baseY + y + DY[dir] * 5 - c.motes.cell / 2;
        ctx.drawImage(creatureSheet, c.motes.x, c.motes.y + c.motes.cell, c.motes.cell, c.motes.cell, cx, cy, c.motes.cell, c.motes.cell);
        this.touch(cx, cy, c.motes.cell, c.motes.cell);
      }
    }
  };

  // Positions of the nest movers in nest-bitmap pixels, for review and tests.
  Habitat.prototype.nestMovers = function () {
    var out = [];
    for (var m = 0; m < this.movers; m++) out.push({x: this.moverX[m], y: this.moverY[m], tunnel: this.moverTunnel[m], at: this.moverAt[m], dir: this.moverDir[m], kind: ['drone', 'queen', 'hatchling'][this.moverKind[m]], cargo: !!this.moverCargo[m]});
    return out;
  };

  // Brief feedback the colony page asks for: 'forage' (Red), 'hatchling' (a forage that brought one home to a
  // dormant nest), 'milestone' (a milestone toast), 'ascend', and the energy abilities swarmwarp, larvarush,
  // clonelarvae, meatrush, territoryrush and clonearmy.
  // Nothing happens while hidden, and repeats within CUE_GAP ms are ignored.
  Habitat.prototype.cue = function (name) {
    var now = root.performance.now();
    if (!this.motes || !this.active || this.destroyed || this.canvas.ownerDocument.hidden || now < (this.cues[name] || -1e9) + CUE_GAP) return false;
    var width = this.canvas.width;
    var height = this.canvas.height;
    var i, k;
    if (name === 'forage' && this.routes.ready) {
      var f = this.routes.forage;
      var inset = (f.outer + f.inner) / 2;
      pointOnLane(f.b * laneLength(width, height, inset), width, height, inset, this.ahead);
      this.puff(Motes.CRUMB, this.ahead.x, this.ahead.y, 4, 70, -Math.PI / 2, 1.6, 2);
      if (this.dormantBrood < 0 && (this.lastForageFetch < 0 || this.clock >= (this.lastForageFetch || 0) + 1.2)) {
        var pickSlot = -1;
        for (i = 0; i < this.count; i++) {
          if (this.role[i] || this.manner[i] || this.doorWait[i] || this.carrying[i]) continue;
          if (this.job[i] === FORAGE && this.jobState[i] === 0) { pickSlot = i; break; }
        }
        if (pickSlot < 0) {
          for (i = 0; i < this.count; i++) {
            if (this.role[i] || this.manner[i] || this.doorWait[i] || this.carrying[i]) continue;
            if (this.job[i] === ROAM && this.kinds[this.kind[i]] && this.kinds[this.kind[i]].id === 'drone') {
              pickSlot = i;
              if (this.leader[i] < 0 && i !== this.lead) break;
            }
          }
        }
        if (pickSlot >= 0) {
          this.lastForageFetch = this.clock;
          this.carrying[pickSlot] = 1;
          this.jobState[pickSlot] = 1;
          if (this.job[pickSlot] === FORAGE) {
            this.restUntil[pickSlot] = this.clock + 0.12;
          } else {
            var falong = (this.phase[pickSlot] - f.a) * f.dir;
            falong -= Math.floor(falong);
            if (this.standalone || (falong <= f.span && this.inset[pickSlot] >= this.minInset && this.inset[pickSlot] <= this.laneMax)) {
              this.job[pickSlot] = FORAGE;
              this.pace[pickSlot] = 1 + this.income * 0.06;
              this.travel[pickSlot] = falong;
              this.restUntil[pickSlot] = this.clock + 0.12;
            }
          }
        }
      }
    } else if (name === 'hatchling' && this.baseCanvas.width) {
      // A little dust at the door as the hatchling goes in; the next update draws it inside the nest.
      this.puff(Motes.DUST, this.baseX + this.entryX, this.baseY + this.entryY, 4, 28, -Math.PI / 2, 1.4, 2);
      this.puff(Motes.GLINT, this.baseX + this.entryX, this.baseY + this.entryY - 6, 2, 18, -Math.PI / 2, 1.6, 2);
    } else if ((name === 'milestone' || name === 'ascend') && this.baseCanvas.width) {
      var x = this.baseX + this.entryX;
      var y = this.baseY + this.entryY;
      if (this.nestPaths) for (var t = 0; t < this.nestPaths.tunnels.length; t++) {
        var chamber = this.nestPaths.tunnels[t].chamber;
        if (this.baseY + chamber.y - chamber.r < y) { x = this.baseX + chamber.x; y = this.baseY + chamber.y - chamber.r; }
      }
      if (name === 'milestone') this.puff(Motes.GLINT, x, y - 8, 3, 26, -Math.PI / 2, 2.4, 2);
      else for (k = 0; k < 20; k++) this.puff(Motes.EMBER, this.baseX + this.baseCanvas.width / 2, this.baseY + this.baseCanvas.height * 0.6, 1, 90, k / 20 * TAU, 0, 2);
    } else if (name === 'swarmwarp' && this.baseCanvas.width) {
      var cx = this.baseX + this.baseCanvas.width / 2;
      var cy = this.baseY + this.baseCanvas.height * 0.55;
      for (k = 0; k < 12; k++) {
        var angle = k / 12 * TAU;
        this.puff(Motes.GLINT, cx, cy, 1, 80, angle, 0, 2);
        this.puff(Motes.SPORE, cx, cy, 1, 56, angle, 0, 2);
      }
      this.glowStart = this.clock;
      this.placePulse('nexus');
      this.warpUntil = this.clock + 1.5;
    } else if ((name === 'larvarush' || name === 'clonelarvae') && this.baseCanvas.width) {
      var doorX = this.baseX + this.entryX;
      var doorY = this.baseY + this.entryY;
      this.puff(Motes.FLECK, doorX, doorY, 6, 36, -Math.PI / 2, 1.8, 2);
      this.puff(Motes.DUST, doorX, doorY, 5, 28, -Math.PI / 2, 1.6, 2);
      for (i = 0, k = 0; i < this.count && k < 3; i++) {
        if (this.role[i]) continue;
        this.emerge(i, k);
        k++;
      }
    } else if (name === 'meatrush' && this.routes.ready) {
      var route = this.routes.forage;
      var band = (route.outer + route.inner) / 2;
      var length = laneLength(width, height, band);
      var phases = [route.a, route.a + route.dir * route.span * 0.5, route.b];
      for (i = 0; i < phases.length; i++) {
        var phase = phases[i] % 1;
        if (phase < 0) phase += 1;
        pointOnLane(phase * length, width, height, band, this.ahead);
        this.puff(Motes.CRUMB, this.ahead.x, this.ahead.y, 4, 56, -Math.PI / 2, 1.6, 2);
      }
    } else if ((name === 'territoryrush' || name === 'clonearmy') && (this.claimPoints.length || this.baseCanvas.width)) {
      var spots = this.claimPoints;
      var limit = Math.min(3, spots.length);
      if (!limit) {
        this.puff(Motes.CLOD, this.baseX + this.entryX, this.baseY + this.entryY, 5, 46, -Math.PI / 2, 2, 2);
        this.puff(Motes.DUST, this.baseX + this.entryX, this.baseY + this.entryY + 4, 4, 32, -Math.PI / 2, 1.8, 2);
      } else for (i = 0; i < limit; i++) {
        this.puff(Motes.CLOD, spots[i].x, spots[i].y, 5, 46, -Math.PI / 2, 2, 2);
        this.puff(Motes.DUST, spots[i].x, spots[i].y + 4, 4, 32, -Math.PI / 2, 1.8, 2);
      }
    } else return false;
    this.cues[name] = now;
    return true;
  };

  // Purchases send one runner from the nest to the panel and back with a parcel; one at a time.

  Habitat.prototype.dispatchRunner = function () {
    var best = -1;
    for (var i = 0; i < this.count; i++) {
      if (this.job[i] === RUNNER) return;
      if (this.role[i] || this.manner[i] || this.job[i] || this.leader[i] >= 0 || i === this.lead || this.kinds[this.kind[i]].spec.chain === 'brood') continue;
      if (best < 0 || this.kinds[this.kind[i]].id === 'drone') best = i;
    }
    if (best < 0 || !this.routes.ready) return;
    this.startJob(best, RUNNER);
    this.emerge(best, 0);
    this.events.runners++;
  };

  // Lap positions of the supply line (nest to the controls along the nest's edge) and the claim march (clockwise from the nest).
  Habitat.prototype.planRoutes = function () {
    var routes = this.routes;
    var width = this.canvas.width;
    var height = this.canvas.height;
    routes.ready = this.baseCanvas.width > 0;
    if (!routes.ready) return;
    var span = this.laneMax - this.minInset;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var left = ex < width / 2;
    var f = routes.forage;
    f.outer = this.minInset + span * 0.12;
    f.inner = this.minInset + span * 0.6;
    var middle = (f.outer + f.inner) / 2;
    var edge = ey > height / 2 ? height - middle : middle;
    var target = left ? width - middle - 35 : middle + 35;
    for (var e = 0; e < this.exclusions.length; e++) {
      var r = this.exclusions[e];
      if (r.top * this.scale - 30 > edge || r.bottom * this.scale + 30 < edge) continue;
      target = left ? Math.min(target, r.left * this.scale - 40) : Math.max(target, r.right * this.scale + 40);
    }
    f.a = this.nearestPhase(middle, ex, ey);
    f.b = this.nearestPhase(middle, target, edge);
    var gap = f.b - f.a;
    gap -= Math.round(gap);
    f.dir = gap < 0 ? -1 : 1;
    f.span = Math.abs(gap);
    var c = routes.claim;
    c.outer = c.inner = this.minInset + span * 0.4;
    c.a = this.nearestPhase(c.outer, ex, ey);
    c.dir = 1;
    c.span = 0.5 * (0.3 + 0.7 * Math.min(1, this.territory / 16));
    this.bakeTrail(Math.min(ex, target), Math.max(ex, target), height - f.inner, height - f.outer, ey > height / 2);
  };

  // A faint pheromone trail along both supply lanes, one cached strip that brightens with income.
  Habitat.prototype.bakeTrail = function (from, to, inner, outer, bottom) {
    var height = this.canvas.height;
    var top = bottom ? inner - 6 : height - outer - 6;
    var key = [Math.round(from), Math.round(to), Math.round(top), Math.round(outer - inner), this.income].join(',');
    if (key === this.trailKey) return;
    this.trailKey = key;
    this.scentKey = '';
    this.floorStale = true;
    this.trailX = Math.round(from);
    this.trailY = Math.round(top);
    this.trail.width = Math.max(0, Math.round(to - from));
    this.trail.height = Math.round(outer - inner) + 12;
    if (!this.trail.width || !this.income) {
      this.trail.width = this.trail.height = 0;
      this.trailIncome = null;
      return;
    }
    this.trailIncome = {x: this.trailX, y: this.trailY, w: this.trail.width, h: this.trail.height};
    var ctx = this.trail.getContext('2d');
    var rand = random(41);
    var alpha = Math.min(0.36, 0.1 + this.income * 0.022);
    for (var lane = 0; lane < 2; lane++) {
      var y = 6 + lane * (outer - inner);
      for (var x = 2; x < this.trail.width - 2; x += 6 + rand() * 6) {
        dot(ctx, x, y + Math.sin(x * 0.05 + lane * 2) * 2.5, 0.8 + rand() * 0.7, 'rgba(226,192,120,' + (alpha * (0.6 + rand() * 0.4)).toFixed(2) + ')');
      }
    }
  };

  // Standalone terrarium mode has no bezel lane, so claims and crumb piles lay a faint scent back to the door.
  Habitat.prototype.paintScentTrails = function () {
    if (!this.standalone || !this.baseCanvas.width) return;
    var points = [];
    var i;
    for (i = 0; i < this.claimPoints.length; i++) points.push(this.claimPoints[i]);
    for (i = 0; i < this.pilePoints.length; i++) points.push(this.pilePoints[i]);
    if (!points.length) return;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var key = [this.trailKey, ex | 0, ey | 0];
    for (i = 0; i < points.length; i++) key.push(points[i].x | 0, points[i].y | 0);
    key = key.join(',');
    if (key === this.scentKey) return;
    this.scentKey = key;
    var minX = ex, maxX = ex, minY = ey, maxY = ey;
    for (i = 0; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      maxX = Math.max(maxX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxY = Math.max(maxY, points[i].y);
    }
    var income = this.trailIncome;
    if (income && income.w && income.h) {
      minX = Math.min(minX, income.x);
      minY = Math.min(minY, income.y);
      maxX = Math.max(maxX, income.x + income.w);
      maxY = Math.max(maxY, income.y + income.h);
    }
    var pad = 4;
    minX = Math.max(0, Math.floor(minX - pad));
    minY = Math.max(0, Math.floor(minY - pad));
    maxX = Math.min(this.canvas.width, Math.ceil(maxX + pad));
    maxY = Math.min(this.canvas.height, Math.ceil(maxY + pad));
    var width = Math.max(1, maxX - minX);
    var height = Math.max(1, maxY - minY);
    var kept = null;
    if (income && income.w && income.h && this.trail.width && this.trail.height) {
      var sx = income.x - this.trailX;
      var sy = income.y - this.trailY;
      if (sx >= 0 && sy >= 0 && sx + income.w <= this.trail.width && sy + income.h <= this.trail.height) {
        kept = this.canvas.ownerDocument.createElement('canvas');
        kept.width = income.w;
        kept.height = income.h;
        kept.getContext('2d').drawImage(this.trail, sx, sy, income.w, income.h, 0, 0, income.w, income.h);
      }
    }
    this.trailX = minX;
    this.trailY = minY;
    this.trail.width = width;
    this.trail.height = height;
    var ctx = this.trail.getContext('2d');
    if (kept) {
      ctx.drawImage(kept, income.x - minX, income.y - minY);
      kept.width = kept.height = 0;
    }
    var color = 'rgba(226,192,120,0.18)';
    for (i = 0; i < points.length; i++) {
      var x0 = points[i].x - minX;
      var y0 = points[i].y - minY;
      var x1 = ex - minX;
      var y1 = ey - minY;
      var steps = Math.max(2, Math.hypot(x1 - x0, y1 - y0) / 8 | 0);
      for (var s = 1; s < steps; s++) {
        var t = s / steps;
        dot(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1.15, color);
      }
    }
    this.floorStale = true;
  };

  Habitat.prototype.readUpgrades = function (levels) {
    var units = {};
    var nexus = 0;
    var mutations = 0;
    for (var id in levels) {
      if (!positive(levels[id])) continue;
      if (/^nexus[1-5]$/.test(id)) nexus++;
      else if (/^mutate/.test(id) && id !== 'mutatehidden') mutations++;
      var match = /^(.+?)(twin|prod|empower)$/.exec(id);
      if (match && SPECIES[match[1]]) units[match[1]] = Math.max(units[match[1]] || 0, step(levels[id]));
    }
    this.base = {
      hatchery: step(levels.hatchery),
      expansion: step(levels.expansion),
      nexus: nexus,
      mutations: Math.min(6, mutations),
      banners: Object.keys(units).sort(function (a, b) { return priority(b) - priority(a); }).slice(0, 10).map(function (unit) { return unit + ':' + units[unit]; })
    };
  };

  // The nest bitmap is repainted only when a displayed step changes, never per update or frame.
  // When the dedicated nest artwork is loaded it paints the nest; the built-in drawing remains the fallback.
  Habitat.prototype.bakeBase = function () {
    // A work crew holds the new look until it is through the door.
    if (this.crew) return;
    var b = this.base;
    var art = root.RoachNestArt;
    var unit = art ? art.size(1) : {width: 260, height: 200};
    var portion = this.standalone ? 0.22 : 0.18;
    var scale = Math.min(this.canvas.width * portion / unit.width, this.canvas.height * portion / unit.height);
    var size = art ? art.size(scale) : {width: Math.round(260 * scale), height: Math.round(200 * scale)};
    var state = art ? {stage: this.stage, hatchery: b.hatchery, expansion: b.expansion, nexus: b.nexus, pennants: b.banners.map(function (banner) { return {color: SPECIES[banner.split(':')[0]].body}; }), mutation: Math.min(3, Math.ceil(b.mutations / 2)), crumbs: this.crumbs, night: this.night} : null;
    var seasonProp = {october: 'event_pumpkin', december: 'event_snow_cluster', spring: 'event_clover', autumn: 'event_acorn'};
    var season = seasonProp[this.season] ? this.season : '';
    var keepsakeKey = !this.standalone && this.keepsakes.length ? this.keepsakes.slice(0, 2).join('+') : '';
    // An empty colony shows no nest, except a dormant one, which shows its quiet first stage.
    var key = this.targetCount > 0 || this.dormantBrood >= 0 ? [art ? JSON.stringify(state) : [b.hatchery, b.expansion, b.nexus, b.mutations, this.crumbs, b.banners.join(' '), this.night].join(','), size.width, size.height, season, keepsakeKey].join(',') : '';
    if (key === this.baseKey) return;
    this.baseKey = key;
    this.floorStale = true;
    this.baseCanvas.width = key ? size.width : 0;
    this.baseCanvas.height = key ? size.height : 0;
    var entrance = art ? art.entrance(scale, state) : {x: 130 * scale, y: 100 * scale};
    this.entryX = entrance.x;
    this.entryY = entrance.y;
    this.setNestPaths(key && art && art.paths ? art.paths(state, scale) : null);
    if (!key) return;
    this.baseBakes++;
    var baseCtx = this.baseCanvas.getContext('2d');
    if (art) baseCtx.drawImage(art.bake(state, scale), 0, 0);
    else paintBase(baseCtx, scale, b, this.crumbs, this.night);
    if (season && Habitat.critterCanvas) {
      var prop = Habitat.critterCanvas(seasonProp[season], 64);
      if (prop && prop.width) baseCtx.drawImage(prop, (this.entryX + 18) | 0, (this.entryY - prop.height * 0.35) | 0);
    }
    if (!this.standalone && this.keepsakes.length && Habitat.critterCanvas) {
      for (var k = 0; k < Math.min(2, this.keepsakes.length); k++) {
        var kp = Habitat.critterCanvas(this.keepsakes[k], 32);
        if (kp && kp.width) {
          var kx = Math.max(2, Math.min(this.baseCanvas.width - 34, (this.entryX + (k ? -38 : 22)) | 0));
          var ky = Math.max(2, Math.min(this.baseCanvas.height - 34, (this.entryY - 12 + k * 6) | 0));
          baseCtx.drawImage(kp, kx, ky);
        }
      }
    }
  };

  // Bottom-left first because the controls default to bottom-right; any corner clear of them will do.
  Habitat.prototype.placeBase = function () {
    var w = this.baseCanvas.width;
    var h = this.baseCanvas.height;
    var ground = this.groundHeight();
    if (this.standalone) {
      this.baseX = Math.round((this.canvas.width - w) * 0.38);
      this.baseY = this.canvas.height - ground;
      return;
    }
    var corners = [[0, 1], [0, 0], [1, 0], [1, 1]];
    for (var c = 0; c < corners.length; c++) {
      var x = corners[c][0] ? this.canvas.width - w - BASE_MARGIN : BASE_MARGIN;
      // Bottom corners sit the painted soil on the screen edge. The bitmap's empty margin hangs below it.
      var y = corners[c][1] ? this.canvas.height - ground : BASE_MARGIN;
      if (!c || !this.overlaps(x, y, x + w, y + h, 8)) { this.baseX = x; this.baseY = y; }
      if (!this.overlaps(this.baseX, this.baseY, this.baseX + w, this.baseY + h, 8)) return;
    }
  };

  Habitat.prototype.overlaps = function (left, top, right, bottom, margin) {
    for (var i = 0; i < this.exclusions.length; i++) {
      var r = this.exclusions[i];
      if (left < r.right * this.scale + margin && right > r.left * this.scale - margin && top < r.bottom * this.scale + margin && bottom > r.top * this.scale - margin) return true;
    }
    return false;
  };

  // Organic marks scattered along the lanes and packed into one sheet; re-baked only when a log-scale level changes.
  Habitat.prototype.bakeGround = function () {
    var width = this.canvas.width;
    var height = this.canvas.height;
    var baseRight = this.baseX + this.baseCanvas.width;
    var baseBottom = this.baseY + this.baseCanvas.height;
    this.planRoutes();
    var key = [this.territory, this.crumbs, width, height, this.baseX, this.baseY, baseRight, baseBottom, !!creatureSheet, !!this.standalone, this.standalone ? this.keepsakes.join('+') : ''].join(',');
    if (key === this.groundKey || !this.sheet) {
      if (this.standalone) this.paintScentTrails();
      return;
    }
    this.groundKey = key;
    this.groundBakes++;
    this.floorStale = true;
    this.pilePoints = [];
    this.claimPoints = [];
    this.landmarks = [];
    var piles = Math.min(this.standalone ? 6 : 4, Math.floor(this.crumbs / 3) + (this.standalone && this.crumbs ? 1 : 0));
    var wanted = [];
    var i, o;
    for (i = 0; i < this.territory * 2; i++) wanted.push({kind: '', seed: 1000 + i, at: i * 0.6180339887 + 0.13, inner: 8, outer: this.laneMax + 6});
    for (i = 0; i < this.crumbs; i++) wanted.push({kind: 'crumbs', seed: 2000 + i, at: i * 0.6180339887 + 0.41, inner: this.minInset, outer: this.laneMax});
    for (i = 0; i < piles; i++) wanted.push({kind: 'pile', seed: 3000 + i, at: i * 0.6180339887 + 0.27, inner: this.minInset + 6, outer: this.laneMax - 6});
    // Claim posts along the territory march; the last one marks the frontier.
    var claim = this.routes.claim;
    var posts = this.routes.ready && this.territory ? Math.min(this.standalone ? 6 : 5, 1 + Math.floor(this.territory / 4)) : 0;
    for (i = 0; i < posts; i++) wanted.push({kind: 'claim', seed: 4000 + i, at: claim.a + claim.dir * claim.span * (i + 1) / posts + 1, inner: claim.outer + 14, outer: claim.outer + 14, postIndex: i, postCount: posts});
    var point = {};
    var fits = [];
    for (i = 0; i < wanted.length; i++) {
      var mark = wanted[i];
      var rand = random(mark.seed);
      mark.kind = mark.kind || TERRAIN[rand() * TERRAIN.length | 0];
      mark.level = mark.kind === 'pile' || mark.kind === 'crumbs' ? this.crumbs : this.territory;
      mark.length = mark.kind === 'claim' ? 22 : mark.kind === 'pile' ? 10 + mark.level * 1.6 : mark.kind === 'crumbs' ? 30 + rand() * 40 : 40 + rand() * 40 + mark.level * 1.5;
      mark.thickness = mark.kind === 'claim' ? 26 : mark.kind === 'pile' ? mark.length : mark.kind === 'crumbs' ? 10 + rand() * 8 : 14 + rand() * 12;
      var inset = mark.inner + rand() * Math.max(0, mark.outer - mark.inner);
      if (this.standalone) {
        if (mark.kind === 'claim') {
          var arc = Math.PI * (0.14 + 0.72 * (mark.postIndex + 0.5) / Math.max(1, mark.postCount));
          var rx = width * (0.26 + 0.16 * ((mark.postIndex % 2) ? 1 : 0.65));
          var ry = height * (0.34 + 0.28 * ((mark.postIndex % 2) ? 0.85 : 0.55));
          mark.x = Math.max(60, Math.min(width - 60, (this.baseX + this.entryX) + Math.cos(arc - Math.PI / 2) * rx));
          mark.y = Math.max(90, Math.min(height - 90, height * 0.82 - Math.sin(arc) * ry));
          mark.angle = 0;
        } else {
          mark.x = 70 + rand() * Math.max(100, width - 140);
          mark.y = 85 + rand() * Math.max(100, height - 155);
          mark.angle = (rand() - 0.5) * Math.PI;
        }
      } else {
        // Claim posts sit exactly on the march route; scattered marks keep their original placement.
        pointOnLane((mark.at % 1) * laneLength(width, height, mark.kind === 'claim' ? inset : 28), width, height, inset, point);
        mark.x = point.x;
        mark.y = point.y;
        mark.angle = point.angle + (rand() - 0.5) * 0.5;
      }
      if (mark.kind === 'claim' && mark.seed === 4000 + posts - 1) { this.postX = mark.x; this.postY = mark.y; }
      mark.rand = rand;
      var cos = Math.abs(Math.cos(mark.angle));
      var sin = Math.abs(Math.sin(mark.angle));
      var hx = mark.length / 2 + 3;
      var hy = mark.thickness / 2 + 3;
      var left = Math.max(0, Math.floor(mark.x - cos * hx - sin * hy));
      var top = Math.max(0, Math.floor(mark.y - sin * hx - cos * hy));
      var right = Math.min(width, Math.ceil(mark.x + cos * hx + sin * hy));
      var bottom = Math.min(height, Math.ceil(mark.y + sin * hx + cos * hy));
      // The centre of the picture (in TV mode) and the nest stay clear of ground marks.
      if (!this.standalone && left < width * 0.8 && right > width * 0.2 && top < height * 0.8 && bottom > height * 0.2) continue;
      if (left < baseRight + 16 && right > this.baseX - 16 && top < baseBottom + 16 && bottom > this.baseY - 16) continue;
      if (mark.kind === 'pile') this.pilePoints.push({x: mark.x, y: mark.y});
      else if (mark.kind === 'claim') this.claimPoints.push({x: mark.x, y: mark.y});
      mark.left = left;
      mark.top = top;
      mark.w = right - left;
      mark.h = bottom - top;
      if (mark.w > 0 && mark.h > 0) fits.push(mark);
    }
    // Shelf-pack tallest first so marks from the side edges do not leave short rows half empty.
    fits.sort(function (a, b) { return b.h - a.h || a.seed - b.seed; });
    var p = this.patches;
    var rowX = 0;
    var rowY = 0;
    var rowHeight = 0;
    var sheetWidth = 0;
    var placed = [];
    for (i = 0; i < fits.length && placed.length < MAX_MARKS; i++) {
      var fit = fits[i];
      if (rowX + fit.w > SHEET_WIDTH) { rowX = 0; rowY += rowHeight; rowHeight = 0; }
      if (rowY + fit.h > SHEET_HEIGHT) break;
      o = placed.length * 6;
      p[o] = rowX; p[o + 1] = rowY; p[o + 2] = fit.w; p[o + 3] = fit.h; p[o + 4] = fit.left; p[o + 5] = fit.top;
      placed.push(fit);
      rowX += fit.w + 1;
      rowHeight = Math.max(rowHeight, fit.h + 1);
      sheetWidth = Math.max(sheetWidth, rowX);
    }
    this.marks = placed.length;
    this.sheet.width = sheetWidth;
    this.sheet.height = rowY + rowHeight;
    var ctx = this.sheet.getContext('2d');
    ctx.lineCap = 'round';
    for (i = 0; i < placed.length; i++) {
      o = i * 6;
      ctx.save();
      ctx.beginPath(); ctx.rect(p[o], p[o + 1], p[o + 2], p[o + 3]); ctx.clip();
      if (creatureSheet && PROP_MARKS[placed[i].kind]) {
        ctx.translate(Math.round(p[o] + placed[i].x - p[o + 4]), Math.round(p[o + 1] + placed[i].y - p[o + 5]));
        paintProp(ctx, placed[i].kind, placed[i].level, placed[i].rand);
      } else {
        ctx.translate(p[o] + placed[i].x - p[o + 4], p[o + 1] + placed[i].y - p[o + 5]);
        ctx.rotate(placed[i].angle);
        paintMark(ctx, placed[i].kind, placed[i].length, placed[i].thickness, placed[i].level, placed[i].rand);
      }
      ctx.restore();
    }
    if (this.standalone && this.baseCanvas.width) {
      var depot = this.pilePoints.length ? this.pilePoints[0] : {x: Math.min(width - 72, this.baseX + this.entryX + 180), y: Math.max(84, this.baseY + this.entryY - 30)};
      var guardAt = this.postX >= 0 ? {x: this.postX, y: this.postY} : (this.claimPoints.length ? this.claimPoints[this.claimPoints.length - 1] : {x: Math.round(width * 0.72), y: Math.round(height * 0.28)});
      this.landmarks = [
        {slug: 'prop_crumb_depot', x: Math.round(depot.x), y: Math.round(depot.y)},
        {slug: 'prop_nursery_entrance', x: Math.max(48, Math.round(this.baseX - 24)), y: Math.max(64, Math.round(this.baseY + this.entryY - 12))},
        {slug: 'prop_guard_post', x: Math.round(guardAt.x), y: Math.round(guardAt.y)},
        {slug: 'prop_scout_post', x: this.baseX + this.entryX < width / 2 ? width - 56 : 56, y: Math.round(height * 0.68)}
      ];
      for (i = 0; i < this.keepsakes.length; i++) {
        this.landmarks.push({
          slug: this.keepsakes[i],
          x: Math.round(width * (0.22 + (i % 4) * 0.18)),
          y: Math.round(height * (0.76 - (i % 2) * 0.14))
        });
      }
    }
    if (this.standalone) this.paintScentTrails();
  };

  Habitat.prototype.setExclusions = function (rectangles) {
    this.exclusions = (rectangles || []).slice(0, 12).map(function (rect) {
      return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
    });
    this.floorStale = true;
    this.placeBase();
    this.bakeGround();
  };

  Habitat.prototype.blocked = function (x, y, margin) {
    return (!this.standalone && this.overlaps(x, y, x, y, margin)) || this.overNest(x, y, margin);
  };

  // Lane walkers keep off the nest art so it reads clearly. The mouth stays open, and so does a short
  // stretch out of it, on whichever side faces away from the nest. The old hole was always down-right
  // of the mouth, so on a bottom-left nest a roach stepping out was hidden at once and looked like it
  // had glitched back inside.
  Habitat.prototype.overNest = function (x, y, margin) {
    var w = this.baseCanvas.width, h = this.baseCanvas.height;
    if (!w || !this.targetCount) return false;
    var left = this.baseX + w * 0.04, top = this.baseY + h * 0.08, right = this.baseX + w * 0.96, bottom = this.baseY + h * 0.92;
    if (x + margin < left || x - margin > right || y + margin < top || y - margin > bottom) return false;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var dx = x - ex;
    var dy = y - ey;
    var ax = ex - (this.baseX + w / 2);
    var ay = ey - (this.baseY + h / 2);
    var reach = Math.sqrt(ax * ax + ay * ay) || 1;
    if (dx * dx + dy * dy < 46 * 46 && dx * ax + dy * ay > -20 * reach) return false;
    return true;
  };

  Habitat.prototype.setActive = function (active) {
    if (!active) this.closing = null;
    this.active = !!active;
    this.syncActivity();
  };

  Habitat.prototype.syncActivity = function () {
    var visible = this.active && !this.destroyed && !this.canvas.ownerDocument.hidden;
    this.canvas.style.visibility = this.floor.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible) {
      if (this.request !== null) root.cancelAnimationFrame(this.request);
      this.request = null;
      this.lastFrame = 0;
      this.lastPaint = 0;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.touched = 0;
      this.overflow = false;
      // Hidden time never plays out a backlog of feedback, and reopening starts a fresh baseline.
      this.closing = null;
      this.departingGolden = null;
      this.departingVisitor = null;
      this.role.fill(0);
      this.departureReason.fill(0);
      this.carrying.fill(0);
      this.endBehaviours();
      this.endChances();
      this.cueFlag.fill(0);
      this.resetManners();
      if (this.motes) this.motes.clear();
      if (this.guests()) { this.golden = this.visitor = this.intruder = null; this.reconcile(); }
      this.paradeNext = '';
      this.paradeUntil = this.caravanUntil = 0;
      this.glowStart = this.burstAt = -1e9;
      this.watchAt = 0;
    } else if (this.request === null) this.request = root.requestAnimationFrame(this.onFrame);
  };

  Habitat.prototype.tick = function (now) {
    this.request = null;
    if (!this.active || this.destroyed || this.canvas.ownerDocument.hidden) { this.syncActivity(); return; }
    var interval = 1000 / FPS[this.level];
    // Accept a refresh slightly early so 30 fps lands on every second 60 Hz vsync instead of slipping to every third.
    if (!this.lastFrame || now - this.lastFrame >= interval - 4) {
      if (this.lastPaint && now - this.lastPaint > interval * 1.8) this.lateFrames++;
      var delta = this.lastPaint ? Math.min(0.25, (now - this.lastPaint) / 1000) : 0;
      if (this.lastPaint) this.paintGap = this.paintGap ? this.paintGap * 0.9 + (now - this.lastPaint) * 0.1 : now - this.lastPaint;
      this.lastPaint = now;
      this.lastFrame = now;
      this.elapsed += delta;
      var start = root.performance.now();
      this.draw(delta);
      var cost = root.performance.now() - start;
      this.averageMs = this.frames ? this.averageMs * 0.95 + cost * 0.05 : cost;
      this.peakMs = Math.max(this.peakMs, cost);
      this.windowMs += cost;
      this.frames++;
      if (this.frames % 48 === 0) this.adapt();
    }
    this.request = root.requestAnimationFrame(this.onFrame);
  };

  // Quality follows the habitat's own draw cost against its frame budget. Late frames do not count:
  // they mostly come from other main-thread work, which drawing fewer roaches would not fix.
  // Step down after two expensive windows; step back up after a cheap stretch that doubles on each relapse.
  Habitat.prototype.adapt = function () {
    var cost = this.windowMs / 48;
    // Measured on the TV: draws of about 8 ms hold 30 fps comfortably, so step down only past 40% of a frame and recover below 30%.
    var bad = cost > 400 / FPS[this.level];
    var good = this.level > 0 && cost < 300 / FPS[this.level - 1];
    this.slowWindows = bad ? this.slowWindows + 1 : 0;
    this.fastWindows = good ? this.fastWindows + 1 : 0;
    this.windowMs = 0;
    if (this.slowWindows >= 2 && this.level < 2) {
      this.level++;
      this.slowWindows = this.fastWindows = 0;
      this.recoverAfter = Math.min(64, this.recoverAfter * 2);
      this.reconcile();
    } else if (this.fastWindows >= this.recoverAfter && this.level > 0) {
      this.level--;
      this.fastWindows = 0;
      this.reconcile();
    }
    if (this.motes) this.motes.setCap(MOTE_CAPS[this.level]);
  };


  Habitat.prototype.drawClosingSeat = function (i, record, delta, width, height, closingAlpha) {
    var tile = record.tile;
    var x = this.atX[i];
    var y = this.atY[i];
    if (!(x > 0 || y > 0)) {
      this.restPoint(i, this.point);
      x = this.point.x;
      y = this.point.y;
    }
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var dex = ex - x;
    var dey = ey - y;
    var doorDist = this.baseCanvas.width ? Math.sqrt(dex * dex + dey * dey) : Infinity;
    var tx, ty;
    if (doorDist <= 90) {
      tx = ex;
      ty = ey;
    } else {
      var dLeft = x + tile;
      var dRight = width - x + tile;
      var dTop = y + tile;
      var dBottom = height - y + tile;
      var best = Math.min(dLeft, dRight, dTop, dBottom);
      tx = best === dLeft ? -tile : best === dRight ? width + tile : x;
      ty = tx !== x ? y : best === dTop ? -tile : height + tile;
    }
    var dx = tx - x;
    var dy = ty - y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var step = this.speed[i] * 1.8 * delta;
    if (dist <= step) { x = tx; y = ty; }
    else if (dist > 0) { x += dx / dist * step; y += dy / dist * step; }
    this.stepGait(i, record, x, y, delta, dist > 0.05, 1.8);
    this.atX[i] = x;
    this.atY[i] = y;
    if (this.blocked(x, y, tile * 0.55) || this.inCentre(x, y, tile * 0.55)) return;
    var dir = facingRow(Math.atan2(dy, dx));
    this.ctx.globalAlpha = (this.quiet ? 0.55 : 1) * closingAlpha;
    this.blit(record, dir, this.gait[i] | 0, x, y, this.scaleOf(i, record));
  };

  Habitat.prototype.drawDepartingGuests = function (width, height) {
    if (this.departingGolden) {
      var dg = this.departingGolden;
      var gAge = this.clock - dg.start;
      if (gAge >= 0.35) {
        this.departingGolden = null;
      } else {
        var gu = gAge / 0.35;
        var dLeft = dg.x, dRight = width - dg.x, dTop = dg.y, dBottom = height - dg.y;
        var minD = Math.min(dLeft, dRight, dTop, dBottom);
        var vx = minD === dLeft ? -1 : minD === dRight ? 1 : 0;
        var vy = vx ? 0 : minD === dTop ? -1 : 1;
        var gx = Math.round(dg.x + vx * gu * 48);
        var gy = Math.round(dg.y + vy * gu * 48);
        var gdir = vx < 0 ? 2 : vx > 0 ? 0 : vy < 0 ? 3 : 1;
        if (!this.blocked(gx, gy, dg.record.tile * 0.6) && !this.inCentre(gx, gy, dg.record.tile * 0.6)) {
          this.ctx.globalAlpha = Math.max(0.1, 1 - gu);
          this.blit(dg.record, gdir, ((gAge * 16) | 0) % FRAMES, gx, gy, 1);
          this.ctx.globalAlpha = 1;
        }
      }
    }
    if (this.departingVisitor) {
      var dv = this.departingVisitor;
      var vAge = this.clock - dv.start;
      if (vAge >= 0.35) {
        this.departingVisitor = null;
      } else {
        var vu = vAge / 0.35;
        var vy2 = Math.round(dv.y + (dv.y < height / 2 ? -vu * 42 : vu * 42));
        var vx2 = Math.round(dv.x + dv.dir * vu * 28);
        var vleft = (vx2 - dv.sprite.width / 2) | 0;
        if (!this.blocked(vx2, vy2 + dv.sprite.height / 2, dv.sprite.width * 0.4) && !this.inCentre(vx2, vy2 + dv.sprite.height / 2, dv.sprite.width * 0.5)) {
          this.ctx.globalAlpha = Math.max(0.1, 1 - vu);
          this.ctx.drawImage(dv.sprite, vleft, vy2);
          this.ctx.globalAlpha = 1;
          this.touch(vleft, vy2, dv.sprite.width, dv.sprite.height);
        }
      }
    }
  };

  Habitat.prototype.drawInspector = function () {
    if (!this.inspector.enabled) return;
    var seat = -1;
    var i;
    for (i = 0; i < this.count; i++) {
      if (this.entityId[i] === this.inspector.targetId) { seat = i; break; }
    }
    if (seat < 0 && !this.inspector.targetId && this.count > 0) {
      seat = 0;
      this.inspector.targetId = this.entityId[0];
    }
    if (seat < 0) return;
    var x = this.atX[seat];
    var y = this.atY[seat];
    if (!(x > 0 || y > 0)) return;
    var tr = this.inspector.trail;
    var len = this.inspector.trailLen;
    if (len < 16) {
      tr[len * 2] = x;
      tr[len * 2 + 1] = y;
      this.inspector.trailLen = ++len;
    } else {
      for (i = 0; i < 30; i++) tr[i] = tr[i + 2];
      tr[30] = x;
      tr[31] = y;
    }
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(244,214,120,0.45)';
    for (i = 0; i < len; i++) {
      var tx = Math.round(tr[i * 2]) - 1;
      var ty = Math.round(tr[i * 2 + 1]) - 1;
      if (this.blocked(tx, ty, 3) || this.inCentre(tx, ty, 3)) continue;
      ctx.fillRect(tx, ty, 2, 2);
      this.touch(tx, ty, 2, 2);
    }
    var tile = this.kinds[this.kind[seat]] ? this.kinds[this.kind[seat]].tile : 26;
    if (!this.blocked(x, y, tile * 0.65) && !this.inCentre(x, y, tile * 0.65)) {
      var rx = Math.round(x - tile / 2 - 2);
      var ry = Math.round(y - tile / 2 - 2);
      var rw = tile + 4;
      ctx.fillStyle = 'rgba(255,224,130,0.85)';
      ctx.fillRect(rx, ry, 3, 2);
      ctx.fillRect(rx + rw - 3, ry, 3, 2);
      ctx.fillRect(rx, ry + rw - 2, 3, 2);
      ctx.fillRect(rx + rw - 3, ry + rw - 2, 3, 2);
      this.touch(rx, ry, rw, rw);
    }
  };

  Habitat.prototype.draw = function (delta) {
    var ctx = this.ctx;
    var width = this.canvas.width;
    var height = this.canvas.height;
    var i;
    this.clock += delta;
    if (this.floorStale) this.paintFloor();
    this.wipe();
    var closingAlpha = 1;
    if (this.closing) {
      var closeAge = this.clock - this.closing.start;
      if (closeAge >= this.closing.duration) {
        var onDone = this.closing.onDone;
        this.closing = null;
        this.setActive(false);
        if (onDone) onDone();
        return;
      }
      if (closeAge > this.closing.duration - 0.1) {
        closingAlpha = Math.max(0.05, (this.closing.duration - closeAge) / 0.1);
      }
    }
    if (this.clock < this.glowStart + GLOW_SECONDS && this.baseCanvas.width) this.drawGlow();
    if (this.clock >= this.layAt) this.lay();
    if (this.clock >= this.processionAt) this.process();
    this.stepBehaviours(delta);
    if (this.night) this.spawnFireflies();
    if (this.level < NEST_DUST_LEVELS) this.spawnNestDust();
    if (this.movers) this.drawMovers(delta);
    this.dustDue = this.clock >= this.dustNext;
    if (this.dustDue) this.dustNext = this.clock + 0.35;
    var elapsed = this.elapsed;
    var point = this.point;
    var span = this.laneMax - this.minInset;
    this.manners(delta);
    // Whatever Red catches now is drawn last, over everything else: the golden roach, then an intruder,
    // then a waiting egg case, molting roach or dung beetle, then a visitor.
    var target = this.golden ? 1 : this.intruder ? 4 : this.chanceCatchable() ? 2 : this.visitor ? 3 : 0;
    this.drawChanceProps(target === 2);
    if (this.quiet) ctx.globalAlpha = 0.55;
    for (i = 0; i < this.count; i++) {
      if (this.quiet) ctx.globalAlpha = 0.55;
      var record = this.kinds[this.kind[i]];
      this.seat = i;
      if (this.closing) {
        this.drawClosingSeat(i, record, delta, width, height, closingAlpha);
        continue;
      }
      if (this.role[i] && this.drawRole(i, record, delta)) continue;
      var job = this.job[i];
      if (job >= TEND) { this.drawFree(i, record, delta); continue; }
      if (this.standalone && this.drawTerrariumSeat(i, record, delta, width, height)) continue;
      var tile = record.tile;
      var leader = this.leader[i];
      var moving;
      var prevInset = this.inset[i];
      var inset;
      var length;
      if (job) {
        moving = this.work(i, delta, width, height);
        inset = this.inset[i];
        length = laneLength(width, height, inset);
      } else if (leader < 0) {
        if (elapsed >= this.nextPause[i]) {
          this.pauseUntil[i] = elapsed + 0.4 + Math.random() * 1.4;
          this.nextPause[i] = this.pauseUntil[i] + 3 + Math.random() * 9;
        }
        moving = elapsed >= this.pauseUntil[i] && this.stride[i] > 0;
        inset = this.easeInset(i, this.minInset + span * (this.lane[i] * 0.8 + 0.1), delta);
        length = laneLength(width, height, inset);
        if (moving) this.phase[i] += this.dir[i] * this.speed[i] * this.stride[i] * delta / length;
        if (this.carrying[i] && this.routes.ready && Math.abs(wrap(this.phase[i] - this.routes.forage.a)) < 0.02) {
          this.carrying[i] = 0;
          this.jobState[i] = 0;
          this.cueFlag[i] = 2;
        }
      } else {
        // Followers chase a point behind their leader, so turns and pauses ripple down the line.
        inset = this.easeInset(i, Math.max(this.minInset, Math.min(this.laneMax, this.inset[leader] + this.offset[i])), delta);
        length = laneLength(width, height, inset);
        var gap = this.phase[leader] - this.dir[leader] * this.spacing[i] / length - this.phase[i];
        gap -= Math.round(gap);
        // Stepping aside slows a follower as it does any walker.
        var step = Math.min(Math.max(this.speed[i], this.speed[leader] * this.pace[leader]) * 1.4, this.speed[i] * 1.45) * Math.min(1, this.stride[i]) * delta / length;
        if (gap > step) gap = step;
        else if (gap < -step) gap = -step;
        moving = gap * length > 0.05 || gap * length < -0.05;
        this.phase[i] += gap;
        this.dir[i] = moving ? (gap > 0 ? 1 : -1) : this.dir[leader];
      }
      this.phase[i] -= Math.floor(this.phase[i]);
      var distance = this.phase[i] * length;
      if (leader < 0 && !job) {
        pointOnLane(distance + this.dir[i] * 24, width, height, inset, this.ahead);
        if (this.blocked(this.ahead.x, this.ahead.y, tile * 0.55) && elapsed > this.turnAt[i]) {
          this.dir[i] = -this.dir[i];
          this.turnAt[i] = elapsed + 2;
        }
      }
      pointOnLane(distance, width, height, inset, point);
      if (moving) {
        this.wobble[i] += delta * this.wobbleRate[i];
      }
      // A gentle sideways meander of a few whole pixels. When a walker is actively shifting lanes
      // or stepping aside to yield, its facing angles 45 degrees into the lane change; a mosquito's
      // hop moves the body without turning it so it keeps facing along the lane.
      var lateral = this.meander(i) + this.side[i];
      var facing = point.angle + (this.dir[i] < 0 ? Math.PI : 0);
      if (moving && (inset !== prevInset || this.side[i] !== 0 || this.clock < this.yieldUntil[i])) {
        var wantSide = this.clock < this.yieldUntil[i] ? this.yieldSide[i] : 0;
        var dRadial = (prevInset !== 0 ? inset - prevInset : 0) + (Math.abs(wantSide - this.side[i]) > 0.2 ? (wantSide > this.side[i] ? 1 : -1) * Math.min(SIDE_RATE, this.speed[i]) * delta : 0);
        if (Math.abs(dRadial) > this.speed[i] * this.stride[i] * delta * 0.35) facing += this.dir[i] * (dRadial > 0 ? Math.PI / 4 : -Math.PI / 4);
      }
      var dir = facingRow(facing);
      var x = point.x - point.sin * lateral;
      var y = point.y + point.cos * lateral;
      this.stepGait(i, record, x, y, delta, moving, this.pace[i] || 1);
      this.atX[i] = x;
      this.atY[i] = y;
      if (this.cueFlag[i]) {
        // Two crumbs scatter at the pick-up; three spill at the nest, where an inner worker carries one inside.
        var drop = this.cueFlag[i] === 2;
        this.puff(Motes.CRUMB, x + DX[dir] * tile * 0.4, y + DY[dir] * tile * 0.4, drop ? 3 : 2, 50, -Math.PI / 2, 2.2, 1);
        if (drop) this.handoff();
        this.cueFlag[i] = 0;
      }
      if (this.blocked(x, y, tile * 0.55)) continue;
      var drawRec = record;
      var frame = this.gait[i] | 0;
      if (!moving && record.id === 'drone') {
        if (this.manner[i] === GREET) {
          var idleAct = this.actingAtlas('forager-idle');
          if (idleAct) {
            drawRec = idleAct;
            frame = ((this.clock * 5 + i) | 0) % FRAMES;
          }
        } else if ((job === FORAGE && this.jobState[i] === 3) || this.manner[i] === SWAP) {
          var depAct = this.actingAtlas('forager-deposit');
          if (depAct) {
            drawRec = depAct;
            frame = ((this.clock * 5 + i) | 0) % FRAMES;
          }
        }
      }
      this.blit(drawRec, dir, frame, x, y, this.scaleOf(i, record));
      // Cargo rides at the head from pick-up at the far end until it is set down at the nest.
      if (((job === FORAGE || job === RUNNER) && (this.jobState[i] === 1 || this.jobState[i] === 2)) || this.carrying[i]) {
        this.prop(job === RUNNER ? 'auto-buy-parcel' : 'carried-crumb', x + DX[dir] * tile * 0.42, y + DY[dir] * tile * 0.42);
      }
    }
    this.seat = -1;
    for (i = this.count - 1; i >= 0; i--) {
      if (this.role[i] === RETIRE && this.departureReason[i]) {
        this.departureReason[i] = 0;
        this.remove(i, 'retired');
      }
    }
    if (this.quiet) ctx.globalAlpha = 1;
    if (this.departingGolden || this.departingVisitor) this.drawDepartingGuests(width, height);
    if (this.intruder && target !== 4) this.drawIntruder(delta, false);
    if (this.visitor && target !== 3) this.drawVisitor(false);
    if (this.flight) this.drawFlight();
    if (this.quiet) ctx.globalAlpha = 0.55;
    if (this.motes) { this.motes.step(delta, width, height); this.motes.draw(ctx, this); }
    if (this.quiet) ctx.globalAlpha = 1;
    if (this.inspector.enabled) this.drawInspector();
    if (target === 1) this.drawGolden(delta);
    else if (target === 4) this.drawIntruder(delta, true);
    else if (target === 2) this.drawCatchable();
    else if (target === 3) this.drawVisitor(true);
    this.clearExclusions(ctx, false);
  };

  Habitat.prototype.paintFloor = function () {
    var ctx = this.floorCtx;
    var p = this.patches;
    this.floorStale = false;
    this.floorPaints++;
    ctx.clearRect(0, 0, this.floor.width, this.floor.height);
    for (var i = 0; i < this.marks; i++) {
      var o = i * 6;
      ctx.drawImage(this.sheet, p[o], p[o + 1], p[o + 2], p[o + 3], p[o + 4], p[o + 5], p[o + 2], p[o + 3]);
    }
    if (this.trail.width) ctx.drawImage(this.trail, this.trailX, this.trailY);
    if (this.standalone && this.landmarks && this.landmarks.length && Habitat.critterCanvas) {
      for (var l = 0; l < this.landmarks.length; l++) {
        var lm = this.landmarks[l];
        var lsprite = Habitat.critterCanvas(lm.slug, 48);
        if (lsprite && lsprite.width) ctx.drawImage(lsprite, (lm.x - lsprite.width / 2) | 0, (lm.y - lsprite.height / 2) | 0);
      }
    }
    if (this.baseCanvas.width) ctx.drawImage(this.baseCanvas, this.baseX, this.baseY);
    this.clearExclusions(ctx, true);
  };

  Habitat.prototype.diagnostics = function () {
    var allocation = {};
    var atlasBytes = 0;
    this.plan.forEach(function (entry) { allocation[entry.id] = entry.count; });
    var spriteBytes = 0;
    var bytes = function (records) { var total = 0; for (var id in records) if (records[id].atlas) total += records[id].atlas.width * records[id].atlas.height * 4; return total; };
    atlasBytes = bytes(this.atlases) + bytes(this.actingAtlases);
    spriteBytes = atlasBytes + bytes(this.guestAtlases) + bytes(this.moverRecords);
    var sheetBytes = creatureSheet ? creatureSheet.width * creatureSheet.height * 4 : 0;
    var motes = this.motes ? this.motes.stats() : null;
    return {active: this.active && !this.destroyed && !this.canvas.ownerDocument.hidden, entities: this.count + this.guests(), guests: {golden: !!this.golden, goldenAt: this.golden ? [this.golden.x | 0, this.golden.y | 0] : null, visitor: this.visitor ? this.visitor.slug : '', intruder: this.intruder ? this.intruder.id : '', intruderAt: this.intruder ? [this.intruder.x | 0, this.intruder.y | 0] : null, night: this.night}, targetEntities: this.targetCount, maximumEntities: MAX_ROACHES, roles: this.plan.map(function (entry) { return entry.id; }), allocation: allocation, lead: this.lead >= 0 ? this.kinds[this.kind[this.lead]].id : '', territoryPatches: this.marks, groundBakes: this.groundBakes, base: {key: this.baseKey, bakes: this.baseBakes, x: this.baseX, y: this.baseY, width: this.baseCanvas.width, height: this.baseCanvas.height, hatchery: this.base.hatchery, expansion: this.base.expansion, nexus: this.base.nexus, mutations: this.base.mutations, banners: this.base.banners.length}, events: this.eventDiagnostics(), lateFrames: this.lateFrames, targetFps: FPS[this.level], achievedFps: this.paintGap ? 1000 / this.paintGap : 0, quality: QUALITY[this.level], frames: this.frames, averageFrameMs: this.averageMs, peakFrameMs: this.peakMs, backingWidth: this.canvas.width, backingHeight: this.canvas.height, floorPaints: this.floorPaints, dirtyRects: this.touched, fullClears: this.fullClears, atlasBytes: atlasBytes, atlasBudgetBytes: ATLAS_BUDGET, groundBytes: (this.sheet.width * this.sheet.height + this.baseCanvas.width * this.baseCanvas.height) * 4, spriteBytes: spriteBytes, creatureSheetBytes: sheetBytes, canvasBytes: (this.canvas.width * this.canvas.height * 2 + this.sheet.width * this.sheet.height + this.baseCanvas.width * this.baseCanvas.height + this.trail.width * this.trail.height + 4 * 64 * 64 + 16 * 16) * 4 + this.glowBytes + spriteBytes + sheetBytes, motes: motes, nestDust: {on: this.level < NEST_DUST_LEVELS && this.baseCanvas.width > 0, live: motes ? motes.kinds[Motes.SPECK] : 0, spawned: this.nestDust}, nestLife: {movers: this.movers, handoffs: this.handoffs, tunnels: this.nestPaths ? this.nestPaths.tunnels.length : 0, stage: this.stage, dormant: this.dormantBrood >= 0}, jobs: this.jobDiagnostics(), chance: this.chanceDiagnostics(), redCue: this.redCueClock === this.clock ? [this.redCueAt[0], this.redCueAt[1], this.redSprite.width, this.redSprite.height] : null, behaviors: this.behaviorDiagnostics()};
  };

  Habitat.prototype.jobDiagnostics = function () {
    var jobs = {carrying: 0, trail: this.trail.width ? [this.trailX, this.trailY, this.trail.width, this.trail.height] : null, forage: {a: this.routes.forage.a, b: this.routes.forage.b, dir: this.routes.forage.dir, span: this.routes.forage.span}, claimSpan: this.routes.claim.span};
    for (var n = 0; n < JOB_NAMES.length; n++) jobs[JOB_NAMES[n]] = 0;
    for (var i = 0; i < this.count; i++) {
      jobs[JOB_NAMES[this.job[i]]]++;
      if (((this.job[i] === FORAGE || this.job[i] === RUNNER) && (this.jobState[i] === 1 || this.jobState[i] === 2)) || this.carrying[i]) jobs.carrying++;
    }
    return jobs;
  };

  Habitat.prototype.eventDiagnostics = function () {
    var roles = [0, 0, 0, 0, 0];
    // A parade counts once, by its lead; escorts are part of it.
    for (var i = 0; i < this.count; i++) if (this.role[i] < roles.length && !(this.role[i] === PARADE && this.roleIndex[i])) roles[this.role[i]]++;
    var events = {emerging: roles[EMERGE], parading: roles[PARADE], caravanning: roles[CARAVAN], chasing: roles[CHASE], paradeQueued: this.paradeNext, glowing: this.clock < this.glowStart + GLOW_SECONDS, clock: this.clock};
    for (var key in this.events) events[key] = this.events[key];
    return this.behaviourDiagnostics(events);
  };

  Habitat.prototype.destroy = function () {
    this.destroyed = true;
    this.syncActivity();
    root.removeEventListener('resize', this.onResize);
    root.removeEventListener('roachnest', this.onNest);
    root.removeEventListener('roachcritters', this.onCritters);
    this.canvas.ownerDocument.removeEventListener('visibilitychange', this.onVisibility);
    this.count = 0;
    root.removeEventListener('roachcreatures', this.onCreatures);
    var records = [this.atlases, this.guestAtlases, this.actingAtlases, this.moverRecords];
    for (var r = 0; r < records.length; r++) for (var id in records[r]) if (records[r][id].atlas) records[r][id].atlas.width = records[r][id].atlas.height = 0;
    this.sheet.width = this.sheet.height = 0;
    this.trail.width = this.trail.height = 0;
    this.baseCanvas.width = this.baseCanvas.height = 0;
    this.canvas.width = this.canvas.height = 0;
    this.floor.width = this.floor.height = 0;
    if (this.floor.parentNode) this.floor.parentNode.removeChild(this.floor);
  };

  // ---- Chance-event guests: the golden roach, a visiting insect and an intruder ----
  // Each is drawn from sprites baked once when it arrives, at integer positions, with no
  // per-draw transforms, and each takes one entity seat from the colony while it is on screen.

  Habitat.prototype.guests = function () {
    return (this.golden ? 1 : 0) + (this.visitor ? 1 : 0) + (this.intruder ? 1 : 0) + this.chanceSeats();
  };

  Habitat.prototype.guestAtlas = function (id, spec) {
    if (this.atlases[id]) return this.atlases[id];
    if (!this.guestAtlases[id]) {
      this.guestAtlases[id] = creatureRecord(this.canvas.ownerDocument, id);
      this.guestAtlases[id].spec = spec;
    }
    return this.guestAtlases[id];
  };

  // The golden roach patrols a short stretch of the innermost lane opposite the supply trail.
  Habitat.prototype.showGolden = function (on) {
    if (!on || this.destroyed) {
      if (this.golden) {
        if (this.active && !this.destroyed && !this.canvas.ownerDocument.hidden && this.golden.x !== undefined) {
          this.departingGolden = {
            x: this.golden.x,
            y: this.golden.y,
            dir: this.golden.dir,
            start: this.clock,
            record: this.golden.record
          };
          this.puff(Motes.GLINT, this.golden.x, this.golden.y, 4, 28, -Math.PI / 2, 2, 2);
        }
        this.golden = null;
        this.reconcile();
      }
      return;
    }
    if (this.golden) return;
    this.departingGolden = null;
    var record = this.guestAtlas('golden', GOLDEN);
    var inset = this.minInset + (this.laneMax - this.minInset) * 0.9;
    var length = laneLength(this.canvas.width, this.canvas.height, inset);
    var base = this.routes.ready ? this.routes.forage.a : 0;
    var centre = base + 0.5;
    var offsets = [0.5, 0.36, 0.64, 0.24, 0.76];
    for (var i = 0; i < offsets.length; i++) {
      pointOnLane(((base + offsets[i]) % 1) * length, this.canvas.width, this.canvas.height, inset, this.ahead);
      if (!this.blocked(this.ahead.x, this.ahead.y, record.tile * 1.4)) { centre = base + offsets[i]; break; }
    }
    centre -= Math.floor(centre);
    pointOnLane(centre * length, this.canvas.width, this.canvas.height, inset, this.ahead);
    this.golden = {record: record, inset: inset, centre: centre, phase: centre, x: this.ahead.x | 0, y: this.ahead.y | 0, dir: Math.random() < 0.5 ? -1 : 1, gait: 0, pauseUntil: 0, nextPause: this.clock + 3};
    this.sparkNext = 0;
    this.reconcile();
  };

  Habitat.prototype.drawGolden = function (delta) {
    var g = this.golden;
    var record = g.record;
    var tile = record.tile;
    var width = this.canvas.width;
    var height = this.canvas.height;
    var length = laneLength(width, height, g.inset);
    if (this.clock >= g.nextPause) { g.pauseUntil = this.clock + 0.8 + Math.random() * 1.4; g.nextPause = g.pauseUntil + 4 + Math.random() * 6; }
    if (this.clock >= g.pauseUntil) {
      g.phase += g.dir * record.spec.speed * delta / length;
      var off = g.phase - g.centre;
      off -= Math.round(off);
      if (off * g.dir > 0.05) g.dir = -g.dir;
      g.phase -= Math.floor(g.phase);
      g.gait = (g.gait + delta * FRAME_RATE) % FRAMES;
    }
    pointOnLane(g.phase * length, width, height, g.inset, this.point);
    var x = g.x = this.point.x | 0;
    var y = g.y = this.point.y | 0;
    if (this.blocked(x, y, tile * 0.6)) return;
    var ctx = this.ctx;
    this.halo(x, y, tile * 2.8);
    var pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.4);
    ctx.globalAlpha = 0.32 + 0.3 * pulse;
    this.glow(this.goldGlow, x, y, (tile * (2 + pulse * 0.3)) | 0);
    ctx.globalAlpha = 1;
    this.blit(record, quarter(this.point.angle + (g.dir < 0 ? Math.PI : 0)), g.gait | 0, x, y, 1);
    // A glint every SPARK_EVERY seconds somewhere on its shell, drifting up as it fades.
    if (this.clock >= this.sparkNext) {
      this.sparkNext = this.clock + SPARK_EVERY;
      this.puff(Motes.GLINT, x + (Math.random() - 0.5) * tile * 1.1, y + (Math.random() - 0.5) * tile * 0.8, 1, 10, -Math.PI / 2, 0.6, 1);
    }
    this.redCue(x, y - tile * 0.8, y + tile * 0.8);
  };

  // A soft warm halo pulsing behind whatever Red catches now. Its size is fixed per target, so the glow cache holds
  // one resampled sprite each and the pulse costs only an alpha change.
  Habitat.prototype.halo = function (x, y, size) {
    size = Math.min(GLOW_CACHED, Math.round(size));
    this.ctx.globalAlpha = 0.6 + 0.25 * Math.sin(this.clock * 3.2);
    this.glow(this.catchGlow, x, y, size);
    this.ctx.globalAlpha = 1;
    this.haloAt[0] = x | 0;
    this.haloAt[1] = y | 0;
    this.haloAt[2] = size;
    this.haloClock = this.clock;
  };

  // The Red cue over whatever Red catches now. Any Red-catchable guest calls this once per frame
  // with its centre x and its top and bottom edges; the capsule bobs above it, or below when
  // the guest hugs the top of the screen.
  Habitat.prototype.redCue = function (x, top, bottom) {
    var sprite = this.redSprite;
    var bob = Math.sin(this.clock * 3) * 2;
    var y = top - sprite.height - 6 >= 2 ? top - sprite.height - 6 + bob : bottom + 6 + bob;
    var left = (x - sprite.width / 2) | 0;
    y = y | 0;
    this.ctx.drawImage(sprite, left, y);
    this.touch(left, y, sprite.width, sprite.height);
    this.redCueAt[0] = left;
    this.redCueAt[1] = y;
    this.redCueClock = this.clock;
  };

  function visitorAnimKey(slug) {
    var s = String(slug || '').toLowerCase().replace(/-/g, '_');
    if (/^(pantry_moth|cream_moth|luna_moth|emperor_moth|tiger_moth|silk_moth|atlas_moth)$/.test(s)) return 'pantry_moth';
    if (/^(stag_beetle|hercules_beetle|rhino_beetle)$/.test(s)) return 'stag_beetle';
    if (/^(camel_cricket|brown_cricket|tan_cricket|black_cricket|brown_field_cricket)$/.test(s)) return 'camel_cricket';
    if (s === 'firefly') return 'firefly';
    return '';
  }

  // A visitor walks the top edge, or the bottom one when the controls sit at the top, as an
  // upright cutout: a right-facing and a mirrored copy are baked once, never rotated.
  Habitat.prototype.showVisitor = function (slug, seconds, dir, rarity) {
    if (!slug || this.destroyed) {
      if (this.visitor) {
        if (this.active && !this.destroyed && !this.canvas.ownerDocument.hidden) {
          var v = this.visitor;
          var vt = Math.max(0, Math.min(1, (this.clock - v.start) / v.seconds));
          var vsprite = v.dir > 0 ? v.right : v.left;
          var vacross = this.canvas.width + vsprite.width * 2;
          var vx = v.x !== undefined ? v.x : (v.dir > 0 ? -vsprite.width + vt * vacross : this.canvas.width + vsprite.width - vt * vacross);
          this.departingVisitor = {
            slug: v.slug,
            sprite: vsprite,
            x: vx,
            y: v.y,
            dir: v.dir,
            start: this.clock
          };
          this.puff(Motes.FLECK, vx, v.y + vsprite.height * 0.4, 3, 24, -Math.PI / 2, 1.8, 2);
        }
        this.visitor = null;
        this.reconcile();
      }
      return false;
    }
    var source = Habitat.critterCanvas ? Habitat.critterCanvas(slug, VISITOR_SIZE) : null;
    if (!source || !source.width) return false;
    this.departingVisitor = null;
    var document = this.canvas.ownerDocument;
    var right = document.createElement('canvas');
    var left = document.createElement('canvas');
    right.width = left.width = source.width;
    right.height = left.height = source.height;
    right.getContext('2d').drawImage(source, 0, 0);
    var mirror = left.getContext('2d');
    mirror.setTransform(-1, 0, 0, 1, source.width, 0);
    mirror.drawImage(source, 0, 0);
    var top = this.minInset - 8;
    var y = this.overlaps(0, top, this.canvas.width, top + source.height, 0) ? this.canvas.height - this.minInset + 8 - source.height : top;
    this.visitor = {slug: slug, animKey: visitorAnimKey(slug), rarity: rarity === 'rare' || rarity === 'uncommon' ? rarity : 'common', right: right, left: left, y: y, dir: dir < 0 ? -1 : 1, start: this.clock, seconds: Math.max(5, Number(seconds) || 45), spark: 0};
    this.reconcile();
    return true;
  };

  // top: the visitor is what Red catches now, drawn last with its halo and the Red cue.
  Habitat.prototype.drawVisitor = function (top) {
    var v = this.visitor;
    var t = (this.clock - v.start) / v.seconds;
    if (t >= 1) return;
    var sprite = v.dir > 0 ? v.right : v.left;
    if (v.animKey && Habitat.critterCanvas && critterSheet) {
      var vframe = 1 + (Math.floor(Math.max(0, this.clock - v.start) * 6) % 4);
      var animSprite = Habitat.critterCanvas('visitor_' + v.animKey + '_' + vframe, VISITOR_SIZE, v.dir < 0);
      if (animSprite && animSprite.width) sprite = animSprite;
    }
    var across = this.canvas.width + sprite.width * 2;
    var x = v.x = v.dir > 0 ? -sprite.width + t * across : this.canvas.width + sprite.width - t * across;
    var slug = String(v.slug || '').toLowerCase();
    var bob = /cricket|grasshopper|katydid|locust|flea|hopper|springtail/.test(slug) ? -Math.abs(Math.sin(this.clock * 4.5)) * 5
      : /butterfly|moth|bee|wasp|hornet|fly|mosquito|gnat|lacewing|dragonfly|damselfly|termite/.test(slug) ? Math.sin(this.clock * 3.6) * 3.5 + Math.cos(this.clock * 1.8) * 1.5
      : Math.sin(this.clock * 2.2) * 2.5;
    var y = v.y + bob;
    if (this.blocked(x, y + sprite.height / 2, sprite.width * 0.4)) return;
    if (top) this.halo(x, y + sprite.height / 2, sprite.width * 1.8);
    this.ctx.drawImage(sprite, (x - sprite.width / 2) | 0, y | 0);
    this.touch((x - sprite.width / 2) | 0, y | 0, sprite.width, sprite.height);
    // Red takes the golden roach first, then an egg case or molting roach, so a visitor carries the cue only on its own.
    if (v.rarity !== 'common' && this.clock >= v.spark) {
      v.spark = this.clock + (v.rarity === 'rare' ? 1.2 : 2.4);
      this.puff(v.rarity === 'rare' ? (Math.sin(this.clock) > 0 ? Motes.GLINT : Motes.SPORE) : Motes.FLECK, x, y + sprite.height * 0.3, 1, 12, -Math.PI / 2, 0.8, 1);
    }
    if (top) this.redCue(x, y, y + sprite.height);
  };

  // An intruder creeps in from a free corner, holds its ground while territory critters
  // ring it, and retreats the way it came.
  Habitat.prototype.showIntruder = function (species, seconds) {
    var i;
    if (!species || this.destroyed || !SPECIES[species]) {
      if (this.intruder) {
        for (i = 0; i < this.count; i++) if (this.role[i] === CHASE) this.role[i] = 0;
        this.intruder = null;
        this.reconcile();
      }
      return;
    }
    var record = this.guestAtlas(species, SPECIES[species]);
    var width = this.canvas.width;
    var height = this.canvas.height;
    var nestRight = this.baseX + this.baseCanvas.width / 2 > width / 2;
    var nestBottom = this.baseY + this.baseCanvas.height / 2 > height / 2;
    var corners = [[1, 0], [0, 0], [1, 1], [0, 1]];
    // Keep clear of the golden roach so the two never share a corner.
    var golden = this.golden;
    if (golden && golden.x !== undefined) corners.sort(function (a, b) { return Math.abs(b[0] * width - golden.x) + Math.abs(b[1] * height - golden.y) - Math.abs(a[0] * width - golden.x) - Math.abs(a[1] * height - golden.y); });
    var pick = null;
    for (i = 0; i < corners.length && !pick; i++) {
      var c = corners[i];
      if (this.baseCanvas.width && c[0] === (nestRight ? 1 : 0) && c[1] === (nestBottom ? 1 : 0)) continue;
      var sx = c[0] ? width - this.laneMax - 70 : this.laneMax + 70;
      var sy = c[1] ? height - this.laneMax : this.laneMax;
      if (!this.blocked(sx, sy, record.tile * 2)) pick = {cx: c[0], cy: c[1], sx: sx, sy: sy};
    }
    if (!pick) return;
    this.intruder = {id: species, record: record, sx: pick.sx, sy: pick.sy, ox: pick.cx ? width + record.tile : -record.tile, oy: pick.cy ? height + record.tile : -record.tile, x: pick.sx, y: pick.sy, start: this.clock, seconds: Math.max(4, Number(seconds) || 10), gait: 0};
    this.reconcile();
    // The territory critters that can reach their own place on the ring at a run within half its stay, nearest first,
    // and only those whose walk there stays clear of the centre; with none that near, the nearest such one sets out
    // anyway and turns back when it has to.
    var self = this;
    var reach = this.intruder.seconds * 0.5;
    var run = function (slot, x, y) {
      var s = self.restPoint(slot, self.spot);
      return 1.5 * Math.sqrt((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y)) / (self.speed[slot] * HURRY);
    };
    var candidates = this.pick(function (id) { return SPECIES[id].chain === 'territory'; }, MAX_ROACHES);
    candidates.sort(function (a, b) { return run(a, pick.sx, pick.sy) - run(b, pick.sx, pick.sy); });
    var chasers = 0;
    for (i = 0; i < candidates.length && chasers < CHASERS; i++) {
      var slot = candidates[i];
      this.ringPoint(chasers, this.kinds[this.kind[slot]].tile, this.intruder, this.ahead);
      if (chasers && run(slot, this.ahead.x, this.ahead.y) > reach) continue;
      if (this.clearPath(slot, this.ahead.x, this.ahead.y)) this.assume(slot, CHASE, chasers++);
    }
  };

  // The k-th chaser's place on the ring around an intruder.
  Habitat.prototype.ringPoint = function (k, tile, guest, out) {
    var around = k * TAU / CHASERS + 0.4;
    out.x = guest.sx + Math.cos(around) * (guest.record.tile * 0.7 + tile * 0.6 + 10);
    out.y = guest.sy + Math.sin(around) * (guest.record.tile * 0.5 + tile * 0.5 + 6);
    return out;
  };

  Habitat.prototype.repelIntruder = function () {
    var v = this.intruder;
    if (!v || v.repel) return;
    v.repel = this.clock;
    this.puff(Motes.CLOD, v.x, v.y, 8, 46, -Math.PI / 2, 2.4, 2);
    this.puff(Motes.DUST, v.x, v.y + 8, 6, 40, -Math.PI / 2, 2, 2);
  };

  Habitat.prototype.drawIntruder = function (delta, top) {
    var v = this.intruder;
    var k, angle, rushing;
    if (v.repel) {
      k = (this.clock - v.repel) / 0.7;
      if (k >= 1) return;
      v.x = v.sx + (v.ox - v.sx) * k;
      v.y = v.sy + (v.oy - v.sy) * k;
      angle = Math.atan2(v.oy - v.sy, v.ox - v.sx);
      rushing = true;
    } else {
      var t = (this.clock - v.start) / v.seconds;
      if (t >= 1) return;
      // It creeps in and out at a steady pace.
      if (t < 0.25) {
        k = t / 0.25;
        v.x = v.ox + (v.sx - v.ox) * k; v.y = v.oy + (v.sy - v.oy) * k;
        angle = Math.atan2(v.sy - v.oy, v.sx - v.ox);
        rushing = true;
      } else if (t < 0.8) {
        v.x = v.sx + Math.sin(this.clock * 3) * 6; v.y = v.sy + Math.cos(this.clock * 2.3) * 4;
        angle = Math.atan2(v.sy - v.oy, v.sx - v.ox) + Math.sin(this.clock * 1.7) * 0.6;
      } else {
        k = (t - 0.8) / 0.2;
        v.x = v.sx + (v.ox - v.sx) * k; v.y = v.sy + (v.oy - v.sy) * k;
        angle = Math.atan2(v.oy - v.sy, v.ox - v.sx);
        rushing = true;
      }
    }
    v.gait = (v.gait + delta * (rushing ? FRAME_RATE : FRAME_RATE / 2)) % FRAMES;
    if (this.blocked(v.x, v.y, v.record.tile * 0.55)) return;
    if (top) this.halo(v.x, v.y, v.record.tile * 2.4);
    this.blit(v.record, quarter(angle), v.gait | 0, v.x | 0, v.y | 0, 1);
    if (top) this.redCue(v.x, v.y - v.record.tile * 0.8, v.y + v.record.tile * 0.8);
  };

  // ---- Night shift ----
  Habitat.prototype.setNight = function (on) {
    on = !!on;
    if (on === this.night) return;
    this.night = on;
    this.bakeBase();
  };

  // At night fireflies drift and blink around the nest, one new light about every half second, from the mote pool.
  Habitat.prototype.spawnFireflies = function () {
    if (this.clock < this.fireflyNext || !this.baseCanvas.width) return;
    this.fireflyNext = this.clock + 0.5 + Math.random() * 0.3;
    var w = this.baseCanvas.width;
    var h = this.baseCanvas.height;
    this.puff(Motes.FIREFLY, this.baseX + w * (0.1 + Math.random() * 0.9), this.baseY + h * (0.15 + Math.random() * 0.6), 1, 8, Math.random() * TAU, TAU, 0);
  };

  // A faint speck of soil drifts out of the nest's opening now and then, so the nest looks alive when idle.
  Habitat.prototype.spawnNestDust = function () {
    if (this.clock < this.nestDustNext || !this.baseCanvas.width) return;
    this.nestDustNext = this.clock + NEST_DUST_EVERY * (0.8 + Math.random() * 0.4);
    var x = this.baseX + this.entryX + (Math.random() - 0.5) * this.baseCanvas.width * 0.14;
    var y = this.baseY + this.entryY - Math.random() * this.baseCanvas.height * 0.06;
    this.nestDust += this.puff(Motes.SPECK, x, y, 1, 7, Math.random() < 0.5 ? 0 : Math.PI, 1.2, 0);
  };

  // ---- Deliberate behaviours: nursery line, promotions, work crews, startle and frontier guards ----
  // Each is a role on an existing seat, so none adds an entity. Positions are derived each frame from the seat's lane
  // spot (or a tending queen's circle) and the clock, so nothing is allocated per frame and hiding simply drops the roles.
  var ENTER = 20;
  var CREW = 21;
  var SCATTER = 22;
  var GUARD = 23;
  var NURSE = 24;
  // Seconds between members of a file setting off.
  var FILE_GAP = 0.35;
  // Promotion: up to three of the tier below that can walk to the door within PROMOTE_REACH seconds go in; the new
  // roach comes out after them; each comes back out ENTER_INSIDE seconds after stepping in.
  var PROMOTE_MAX = 3;
  var PROMOTE_PAUSE = 0.4;
  var PROMOTE_REACH = 6;
  var ENTER_INSIDE = 4;
  // Work crew: members that can reach the door within CREW_TIMEOUT; the nest re-bakes without any still out then.
  var CREW_TIMEOUT = 6;
  // Startle: freeze, dash outward, hold, walk back. Within SCATTER_RADIUS, at most SCATTER_MAX, once per cooldown.
  var SCATTER_RADIUS = 150;
  var SCATTER_MAX = 8;
  var SCATTER_COOLDOWN = 20;
  var SCATTER_REACH = 34;
  var SCATTER_TIMES = [0.45, 0.95, 1.65, 2.65];
  // Frontier guards: up to three sentries at the outermost claim posts, relieved by a marcher every half minute or so.
  var GUARDS = 3;
  var GUARD_SHIFT = 30;
  var GUARD_POLL = 0.5;
  // Nursery: up to three hatchlings in a line behind a laying queen, peeling off one at a time to the supply trail.
  var NURSE_MAX = 3;
  var NURSERY_GAP = 30;
  var NURSE_FOLLOW = 7;
  var NURSE_PEEL_GAP = 3.5;
  var NURSE_SPACING = 22;

  Habitat.prototype.initBehaviours = function () {
    this.spot = {x: 0, y: 0, angle: 0, length: 0, hop: 0};
    this.trip = {x: 0, y: 0, angle: 0, length: 0, hop: 0};
    this.crew = null;
    this.startleAt = -1e9;
    this.startleX = this.startleY = 0;
    this.startled = null;
    this.nurseNext = 0;
    this.nurseLost = 1e9;
    this.guardNext = 0;
    this.guardNeed = 0;
    this.guardA = this.guardSpan = -1;
    var e = this.events;
    e.promotions = e.crews = e.crewTimeouts = e.scatters = e.guardShifts = e.nursery = 0;
  };

  // Closing ends every role (syncActivity clears them); a crew's held nest look is shown straight away.
  Habitat.prototype.endBehaviours = function () {
    this.startled = null;
    this.nurseLost = 1e9;
    this.guardNeed = 0;
    this.guardNext = 0;
    if (this.crew) { this.crew = null; this.bakeBase(); }
  };

  // Where a seat stands when it has no role: its lane spot, or its place on a tending queen's circle.
  Habitat.prototype.restPoint = function (i, out) {
    if (this.job[i] === TEND && this.baseCanvas.width) {
      var reach = Math.max(30, this.baseCanvas.width * 0.42);
      var wave = this.travel[i];
      out.x = this.baseX + this.entryX + Math.cos(wave) * reach;
      out.y = this.tendY(this.baseY + this.entryY, reach) + Math.sin(wave) * reach * 0.55;
      out.angle = Math.atan2(Math.cos(wave) * 0.55, -Math.sin(wave));
      return out;
    }
    if (this.standalone && this.freeReady[i] && this.atX[i] > 0 && this.atY[i] > 0) {
      out.x = this.atX[i];
      out.y = this.atY[i];
      out.angle = this.freeHeading[i];
      return out;
    }
    var inset = Math.max(this.minInset, this.inset[i]);
    return pointOnLane(this.phase[i] * laneLength(this.canvas.width, this.canvas.height, inset), this.canvas.width, this.canvas.height, inset, out);
  };

  // Pick a 2D floor target in standalone terrarium mode based on the species' ecological behavior.
  Habitat.prototype.pickTerrariumTarget = function (i, record, width, height) {
    var id = record.id;
    var spec = record.spec;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var job = this.job[i];
    if (job === FORAGE || id === 'drone') {
      if (this.jobState[i] === 0 && this.pilePoints.length) {
        var pile = this.pilePoints[(i + Math.floor(this.clock)) % this.pilePoints.length];
        this.freeTargetX[i] = pile.x + (Math.random() - 0.5) * 28;
        this.freeTargetY[i] = pile.y + (Math.random() - 0.5) * 28;
      } else if (this.jobState[i] === 2) {
        this.freeTargetX[i] = ex + (Math.random() - 0.5) * 26;
        this.freeTargetY[i] = Math.max(80, ey - 18 - Math.random() * 24);
      } else {
        this.freeTargetX[i] = 90 + Math.random() * (width - 180);
        this.freeTargetY[i] = 100 + Math.random() * (height - 210);
      }
      return;
    }
    if (job === CLAIM && this.claimPoints.length) {
      var post = this.claimPoints[(i + (this.jobState[i] >> 1)) % this.claimPoints.length];
      this.freeTargetX[i] = post.x + (Math.random() - 0.5) * 36;
      this.freeTargetY[i] = post.y + (Math.random() - 0.5) * 36;
      return;
    }
    if (spec.tier >= 3 && spec.chain === 'meat') {
      var angle = Math.PI * (0.15 + Math.random() * 0.7);
      var rad = 95 + Math.random() * Math.min(240, width * 0.22);
      this.freeTargetX[i] = Math.max(80, Math.min(width - 80, ex + Math.cos(angle - Math.PI / 2) * rad * 1.35));
      this.freeTargetY[i] = Math.max(95, Math.min(height - 95, ey - Math.sin(angle) * rad));
      return;
    }
    this.freeTargetX[i] = 80 + Math.random() * Math.max(120, width - 160);
    this.freeTargetY[i] = 90 + Math.random() * Math.max(120, height - 190);
    if (this.overNest(this.freeTargetX[i], this.freeTargetY[i], record.tile)) {
      this.freeTargetY[i] = Math.max(90, this.baseY - 40 - Math.random() * 140);
    }
  };

  // Free 2D terrarium floor AI for standalone mode: instead of marching around a rectangular TV bezel,
  // species roam across the soil floor with distinct movement styles (stalking spiders, slithering centipedes,
  // hopping crickets, darting silverfish, hovering wasps/mosquitoes, and royal court escorts).
  Habitat.prototype.drawTerrariumSeat = function (i, record, delta, width, height) {
    var job = this.job[i];
    if (job === PROCESSION || job === RUNNER) return false;
    var tile = record.tile;
    var spec = record.spec;
    var id = record.id;
    var elapsed = this.elapsed;
    if (!this.freeReady[i] || !(this.atX[i] > 0 && this.atY[i] > 0)) {
      // The vertical step must not be the complement of the horizontal one. Those two
      // fractions sum to 1, so every seat landed on one of two diagonals and stayed
      // there through the opening pause.
      var seed = (i * 0.61803398875 + 0.19) % 1;
      var seedY = (i * 0.41421356237 + 0.31) % 1;
      this.atX[i] = 90 + seed * Math.max(120, width - 180);
      this.atY[i] = 95 + seedY * Math.max(120, height - 210);
      if (this.overNest(this.atX[i], this.atY[i], tile)) this.atY[i] = Math.max(95, this.baseY - 48);
      this.freeHeading[i] = seed * TAU;
      this.freeReady[i] = 1;
      this.pickTerrariumTarget(i, record, width, height);
    }
    var x = this.atX[i];
    var y = this.atY[i];
    var leader = this.leader[i];
    var tx, ty;
    if (leader >= 0 && this.atX[leader] > 0) {
      var rank = Math.max(1, Math.round(this.spacing[i] / Math.max(16, tile * 0.8)));
      var orbit = elapsed * 0.55 + i * 1.7 + rank;
      var dist = tile * 0.95 + rank * 16;
      tx = this.atX[leader] + Math.cos(orbit) * dist;
      ty = this.atY[leader] + Math.sin(orbit) * dist * 0.75;
    } else {
      tx = this.freeTargetX[i];
      ty = this.freeTargetY[i];
    }
    var dx = tx - x;
    var dy = ty - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (leader < 0 && job === FORAGE && this.jobState[i] === 1 && elapsed >= this.pauseUntil[i]) {
      this.jobState[i] = 2;
      this.carrying[i] = 1;
      this.pickTerrariumTarget(i, record, width, height);
      dx = this.freeTargetX[i] - x;
      dy = this.freeTargetY[i] - y;
      d = Math.sqrt(dx * dx + dy * dy);
    } else if (leader < 0 && d < 26) {
      if (job === FORAGE) {
        if (this.jobState[i] === 0) {
          this.cueFlag[i] = 1;
          this.jobState[i] = 2;
          this.carrying[i] = 1;
          this.pauseUntil[i] = elapsed + 0.7;
        } else {
          this.cueFlag[i] = 2;
          this.jobState[i] = 0;
          this.carrying[i] = 0;
          this.pauseUntil[i] = elapsed + 1.0;
        }
      } else if (job === CLAIM) {
        this.jobState[i] = (this.jobState[i] + 2) & 6;
        this.pauseUntil[i] = elapsed + 1.2 + Math.random() * 1.8;
      } else if (spec.form === 'spider') {
        this.pauseUntil[i] = elapsed + 1.4 + Math.random() * 2.4;
      } else if (id === 'locust') {
        this.pauseUntil[i] = elapsed + 0.9 + Math.random() * 1.6;
      } else if (id === 'devourer' || id === 'goon') {
        this.pauseUntil[i] = elapsed + 1.1 + Math.random() * 1.8;
      }
      this.pickTerrariumTarget(i, record, width, height);
      dx = this.freeTargetX[i] - x;
      dy = this.freeTargetY[i] - y;
      d = Math.sqrt(dx * dx + dy * dy);
    }
    if (leader < 0 && elapsed >= this.nextPause[i]) {
      var pauseDur = spec.form === 'spider' ? 1.3 + Math.random() * 1.8 : id === 'locust' ? 0.8 + Math.random() * 1.2 : 0.35 + Math.random() * 0.9;
      this.pauseUntil[i] = elapsed + pauseDur;
      this.nextPause[i] = this.pauseUntil[i] + (spec.form === 'spider' ? 2.2 + Math.random() * 3.5 : 4 + Math.random() * 8);
    }
    var sepX = 0;
    var sepY = 0;
    for (var j = 0; j < this.count; j++) {
      if (j === i || !this.freeReady[j] || this.role[j]) continue;
      var ox = x - this.atX[j];
      var oy = y - this.atY[j];
      var od2 = ox * ox + oy * oy;
      if (od2 > 0.01 && od2 < 24 * 24) {
        var od = Math.sqrt(od2);
        var push = (24 - od) / 24;
        sepX += (ox / od) * push;
        sepY += (oy / od) * push;
      }
    }
    var moving = elapsed >= this.pauseUntil[i] && d > 2;
    var desired = d > 1 ? Math.atan2(dy + sepY * 14, dx + sepX * 14) : this.freeHeading[i];
    if (spec.form === 'centipede') desired += Math.sin(elapsed * 4.2 + i) * 0.52;
    else if (id === 'swarmling' || id === 'stinger') desired += Math.sin(elapsed * 3.4 + i * 2.3) * 0.28;
    else desired += Math.sin(elapsed * 1.3 + this.drift[i]) * 0.16;

    var diff = desired - this.freeHeading[i];
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    var turnRate = (id === 'devourer' || id === 'goon' || spec.tier >= 4 && spec.chain === 'meat') ? 2.4 : 4.8;
    this.freeHeading[i] += Math.max(-turnRate * delta, Math.min(turnRate * delta, diff));

    var pace = 1;
    if (spec.form === 'spider') pace = 1.25;
    else if (id === 'locust') pace = 1.35;
    else if (job === FORAGE) pace = 1 + this.income * 0.04;
    if (leader >= 0) pace = Math.min(1.3, Math.max(0.4, d / 28));

    var dir = facingRow(this.freeHeading[i]);
    var hx = DX[dir];
    var hy = DY[dir];
    var origX = x;
    var origY = y;
    var maxStep = this.speed[i] * 1.85 * delta;
    if (moving || sepX || sepY) {
      var step = moving ? Math.min(d, this.speed[i] * pace * delta) : 0;
      var sepLen = Math.sqrt(sepX * sepX + sepY * sepY);
      var nudge = sepLen > 0 ? Math.min(this.speed[i] * 0.35 * delta, sepLen * 12 * delta) : 0;
      var nx = x + hx * step + (sepLen > 0 ? (sepX / sepLen) * nudge : 0);
      var ny = y + hy * step + (sepLen > 0 ? (sepY / sepLen) * nudge : 0);
      var totDx = nx - origX;
      var totDy = ny - origY;
      var totDist = Math.sqrt(totDx * totDx + totDy * totDy);
      if (totDist > maxStep && totDist > 0) {
        nx = origX + (totDx / totDist) * maxStep;
        ny = origY + (totDy / totDist) * maxStep;
      }
      if (this.overNest(nx, ny, tile * 0.55)) {
        this.freeHeading[i] += Math.PI * 0.65;
        this.pickTerrariumTarget(i, record, width, height);
        dir = facingRow(this.freeHeading[i]);
        hx = DX[dir];
        hy = DY[dir];
      } else {
        x = Math.max(36, Math.min(width - 36, nx));
        y = Math.max(48, Math.min(height - 36, ny));
      }
    }
    this.stepGait(i, record, x, y, delta, moving || !!(sepX || sepY), pace);
    this.atX[i] = x;
    this.atY[i] = y;
    if ((id === 'mosquito' || id === 'wasp') && this.canSideHop(i, x, y)) {
      var hop = this.sideHop(i);
      x -= hy * hop;
      y += hx * hop;
    }
    if (this.cueFlag[i]) {
      var drop = this.cueFlag[i] === 2;
      this.puff(Motes.CRUMB, x + hx * tile * 0.4, y + hy * tile * 0.4, drop ? 3 : 2, 50, -Math.PI / 2, 2.2, 1);
      if (drop) this.handoff();
      this.cueFlag[i] = 0;
    }
    // Keep phase/inset loosely synced with current 2D position so role transitions never jump across the screen.
    this.inset[i] = Math.max(this.minInset, Math.min(this.laneMax, Math.min(x, width - x, y, height - y)));
    this.blit(record, dir, this.gait[i] | 0, x, y, this.scaleOf(i, record));
    if ((job === FORAGE && (this.jobState[i] === 1 || this.jobState[i] === 2)) || this.carrying[i]) {
      this.prop('carried-crumb', x + hx * tile * 0.42, y + hy * tile * 0.42);
    }
    return true;
  };

  Habitat.prototype.inCentre = function (x, y, margin) {
    if (this.standalone) return false;
    var w = this.canvas.width;
    var h = this.canvas.height;
    return x + margin > w * 0.2 && x - margin < w * 0.8 && y + margin > h * 0.2 && y - margin < h * 0.8;
  };

  // Once per frame from draw(): a crew's arrival, an intruder's arrival, a nursery queen's departure and guard shifts.
  Habitat.prototype.stepBehaviours = function (delta) {
    if (this.crew) this.checkCrew();
    var v = this.intruder;
    if (v && this.startled !== v && this.clock - v.start >= v.seconds * 0.25) {
      this.startled = v;
      this.startle(v.sx, v.sy);
    }
    if (this.nurseLost > this.clock && this.clock < this.nurseNext) {
      var q = this.layQueen;
      // A queen still walking out of the door to her circle keeps her line; one called away by any other role does not.
      if (q < 0 || this.job[q] !== TEND || (this.role[q] && this.role[q] !== EMERGE)) this.nurseLost = this.clock;
    }
    this.staffGuards(delta);
  };

  // Whether a seat can walk straight from where it stands to a point without crossing the centre 60%: the segment
  // is clipped against the centre grown by the seat's margin, so no stretch between samples can cut a corner.
  Habitat.prototype.clearPath = function (i, x, y) {
    if (this.standalone) return true;
    var s = this.restPoint(i, this.spot);
    var margin = this.kinds[this.kind[i]].tile * 0.6;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var p = [s.x - x, x - s.x, s.y - y, y - s.y];
    var q = [s.x - (w * 0.2 - margin), w * 0.8 + margin - s.x, s.y - (h * 0.2 - margin), h * 0.8 + margin - s.y];
    var t0 = 0;
    var t1 = 1;
    for (var k = 0; k < 4; k++) {
      if (!p[k]) { if (q[k] < 0) return true; continue; }
      var r = q[k] / p[k];
      if (p[k] < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
      if (t0 > t1) return true;
    }
    return false;
  };

  // Draws a seat in one of the roles above. Returns false once its role has ended.
  Habitat.prototype.drawDeliberate = function (i, record, delta) {
    var role = this.role[i];
    var age = this.clock - this.roleStart[i];
    var s = this.spot;
    var tile = record.tile;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var x, y, heading, u, walking;
    if (role === GUARD) {
      // A sentry stands at its post facing out from the screen's centre; standing costs one lane point and a blit.
      pointOnLane(this.phase[i] * laneLength(this.canvas.width, this.canvas.height, this.inset[i]), this.canvas.width, this.canvas.height, this.inset[i], s);
      x = s.x; y = s.y;
      heading = facingRow(s.angle - Math.PI / 2);
      walking = false;
    } else if (role === ENTER) {
      // Along the lane to the door and in; after a while back out of the door to the lane spot beside it.
      var start = this.roleIndex[i] * FILE_GAP;
      var trip = this.toDoor(i, age - start, s);
      var out = age - start - trip - ENTER_INSIDE;
      var into = age - start;
      if (into >= trip && into - delta < trip) this.puff(Motes.DUST, ex, ey, 4, 28, -Math.PI / 2, 1.6, 1);
      if (out >= 0 && out - delta < 0) this.puff(Motes.FLECK, ex, ey, 3, 24, -Math.PI / 2, 1.4, 1);
      if (out >= s.hop) { this.leaveDoor(i); return false; }
      if (out >= 0) {
        this.toDoor(i, trip - out, s);
        s.angle += Math.PI;
      } else if (into >= trip) return true;
      x = s.x; y = s.y;
      heading = facingRow(s.angle);
      walking = age > start;
    } else if (role === CREW) {
      // Members set out together from wherever they are, so the nearest arrive first. One still on its way when the
      // crew's time is up walks on in and comes back out by itself.
      if (age >= this.toDoor(i, age, s)) {
        if (!this.crew) this.emerge(i, 0);
        return true;
      }
      x = s.x; y = s.y;
      heading = facingRow(s.angle);
      walking = true;
    } else if (role === SCATTER) {
      var times = SCATTER_TIMES;
      if (age >= times[3]) { this.role[i] = 0; return false; }
      this.restPoint(i, s);
      var lx = s.x;
      var ly = s.y;
      this.scatterAim(i, s);
      var tx = s.x;
      var ty = s.y;
      var away = Math.atan2(ly - this.startleY, lx - this.startleX);
      if (age < times[0]) { x = lx; y = ly; heading = facingRow(away + Math.PI); walking = false; }
      else if (age < times[1]) { u = (age - times[0]) / (times[1] - times[0]); u = u * (2 - u); x = lx + (tx - lx) * u; y = ly + (ty - ly) * u; heading = facingRow(away); walking = true; }
      else if (age < times[2]) { x = tx; y = ty; heading = facingRow(away + Math.PI); walking = false; }
      else { u = (age - times[2]) / (times[3] - times[2]); u = u * u * (3 - 2 * u); x = tx + (lx - tx) * u; y = ty + (ly - ty) * u; heading = facingRow(away + Math.PI); walking = true; }
    } else {
      var nurse = this.nursePoint(i, age, delta, s);
      if (nurse < 0) { this.role[i] = 0; return false; }
      if (!nurse) return true;
      x = s.x; y = s.y; heading = facingRow(s.angle);
      walking = s.length > 0;
    }
    this.stepGait(i, record, x, y, delta, walking, role === SCATTER ? 1.6 : 1);
    if (this.blocked(x, y, tile * 0.55)) return true;
    var drawRec = record;
    var frame = this.gait[i] | 0;
    if (role === GUARD) {
      if (record.id === 'roach') {
        var sentryAct = this.actingAtlas('roach-sentry');
        if (sentryAct) {
          drawRec = sentryAct;
          frame = ((this.clock * 3 + i) | 0) % FRAMES;
        } else {
          frame = ((this.clock * 1.5 + i) | 0) % 6 === 0 ? 1 : 0;
        }
      } else {
        frame = ((this.clock * 1.5 + i) | 0) % 6 === 0 ? 1 : 0;
      }
    }
    this.blit(drawRec, heading, frame, x, y, this.scaleOf(i, record));
    if (role === CREW && creatureSheet) {
      // A clod or a pale fleck from the mote sheet rides at the head.
      var m = root.RoachCreatures.motes;
      var row = this.roleIndex[i] % 2 ? 2 : 6;
      var bx = (x + DX[heading] * tile * 0.42 - m.cell / 2) | 0;
      var by = (y + DY[heading] * tile * 0.42 - m.cell / 2) | 0;
      this.ctx.drawImage(creatureSheet, m.x, m.y + row * m.cell, m.cell, m.cell, bx, by, m.cell, m.cell);
      this.touch(bx, by, m.cell, m.cell);
    }
    return true;
  };

  // ---- Promotions ----
  // In the game a higher main-chain tier is bought with the tier below, so a few of that tier walk into the nest
  // and the new roach comes out after them. Runs from burst(), so it shares its purchase detection and gap.
  Habitat.prototype.afterBurst = function (species, feature, picked) {
    var promoted = this.promote(species, picked);
    var lead = this.lead >= 0 ? this.kinds[this.kind[this.lead]].id : '';
    if (promoted || (species && species === lead) || /^(hatchery|expansion|nexus)$/.test(feature)) this.startle(this.baseX + this.entryX, this.baseY + this.entryY);
  };

  Habitat.prototype.promote = function (species, picked) {
    var spec = SPECIES[species];
    if (!spec || spec.chain !== 'meat' || spec.tier < 2 || !picked.length) return false;
    var below = '';
    for (var id in SPECIES) if (SPECIES[id].chain === 'meat' && SPECIES[id].tier === spec.tier - 1) below = id;
    var self = this;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    // Others walk along their lane to the door; a tending queen walks straight in from her circle, so she goes only
    // when that path is clear of the centre.
    var trips = [];
    var going = this.pick(function (id) { return id === below; }, MAX_ROACHES).filter(function (i) {
      trips[i] = self.toDoor(i, 0, self.trip);
      return self.job[i] <= TEND && trips[i] <= PROMOTE_REACH && (self.job[i] !== TEND || self.clearPath(i, ex, ey));
    });
    if (!going.length) return false;
    going.sort(function (a, b) { return trips[a] - trips[b]; });
    going.length = Math.min(PROMOTE_MAX, going.length);
    var delay = 0;
    for (var k = 0; k < going.length; k++) {
      this.assume(going[k], ENTER, k);
      delay = Math.max(delay, k * FILE_GAP + this.toDoor(going[k], 0, this.trip));
    }
    delay += PROMOTE_PAUSE;
    // The new roach waits for the door like any emerger: the file going in has it first, then the new roach is next.
    this.doorFreeAt = Math.max(this.doorFreeAt, this.clock + delay);
    for (k = 0; k < picked.length; k++) if (this.doorWait[picked[k]]) this.doorTicket[picked[k]] = -++this.tickets;
    this.events.promotions++;
    return true;
  };

  // ---- Work crews ----
  // A nest upgrade that changes the nest's look sends a few workers along the lane with bits of material. The nest
  // re-bakes when the last one is through the door, or after CREW_TIMEOUT. Called from update() before readUpgrades.
  Habitat.prototype.planCrew = function (levels) {
    var now = root.performance.now();
    if (this.crew || !this.watchAt || now - this.watchAt > 4000 || !this.active || this.destroyed || this.canvas.ownerDocument.hidden || !this.baseCanvas.width || !this.routes.ready) return;
    var rises = 0;
    var nexus = 0;
    var mutations = 0;
    var id;
    for (id in this.levels) if (!levels[id] || rose(levels[id], this.levels[id])) return;
    for (id in levels) {
      if (rose(this.levels[id], levels[id])) rises++;
      if (!positive(levels[id])) continue;
      if (/^nexus[1-5]$/.test(id)) nexus++;
      else if (/^mutate/.test(id) && id !== 'mutatehidden') mutations++;
    }
    // A load or import changes many levels at once; only a purchase is worth a crew.
    if (!rises || rises > 4) return;
    var b = this.base;
    var size = step(levels.expansion) > b.expansion ? 5 : nexus > b.nexus ? 4 : step(levels.hatchery) > b.hatchery || Math.min(6, mutations) > b.mutations ? 3 : 0;
    if (!size) return;
    var chosen = [];
    var i, k;
    for (i = 0; i < this.count; i++) {
      var job = this.job[i];
      if (this.role[i] || this.manner[i] || i === this.lead || job === RUNNER || job === PROCESSION || job >= TEND || this.kinds[this.kind[i]].spec.chain === 'brood') continue;
      chosen.push(i);
    }
    // Those that can walk to the door before the timeout, soonest first, and up to three in all from a little further.
    var trips = [];
    for (k = 0; k < chosen.length; k++) {
      i = chosen[k];
      if (this.inset[i] < this.minInset) this.inset[i] = (this.routes.forage.outer + this.routes.forage.inner) / 2;
      trips[i] = this.toDoor(i, 0, this.trip);
    }
    chosen.sort(function (a, c) { return trips[a] - trips[c]; });
    var crew = [];
    for (k = 0; k < chosen.length && crew.length < size; k++) if (trips[chosen[k]] <= (crew.length < 3 ? CREW_TIMEOUT * 2 : CREW_TIMEOUT - 0.3)) crew.push(chosen[k]);
    if (!crew.length) return;
    for (k = 0; k < crew.length; k++) this.assume(crew[k], CREW, k);
    this.crew = {start: this.clock, due: this.clock + CREW_TIMEOUT, size: crew.length};
    this.events.crews++;
  };

  // Signed lap fraction from a seat's spot to the nest door along the lane.
  Habitat.prototype.crewGap = function (i) {
    var gap = this.routes.forage.a - this.phase[i];
    return gap - Math.round(gap);
  };

  // Seconds for a seat to walk along its lane to the spot by the nest door.
  Habitat.prototype.crewWalk = function (i) {
    var distance = Math.abs(this.crewGap(i)) * laneLength(this.canvas.width, this.canvas.height, Math.max(this.minInset, this.inset[i]));
    return distance / (this.speed[i] * HURRY);
  };

  // Places a seat t seconds into its walk into the nest: along its lane to the spot by the door, then through the
  // door (a tending queen walks straight in from her circle). Sets out.x, out.y, out.angle (the way it faces) and
  // out.hop (the seconds through the door), and returns the seconds the whole walk takes.
  Habitat.prototype.toDoor = function (i, t, out) {
    var width = this.canvas.width;
    var height = this.canvas.height;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var v = this.speed[i] * HURRY;
    var lane = 0;
    var gap = 0;
    var inset = 0;
    var length = 0;
    if (this.job[i] === TEND) this.restPoint(i, out);
    else {
      inset = Math.max(this.minInset, this.inset[i]);
      length = laneLength(width, height, inset);
      gap = this.crewGap(i);
      lane = Math.abs(gap) * length / v;
      pointOnLane((this.phase[i] + gap) * length, width, height, inset, out);
    }
    out.hop = Math.sqrt((ex - out.x) * (ex - out.x) + (ey - out.y) * (ey - out.y)) / v;
    if (t < lane) {
      pointOnLane((this.phase[i] + gap * Math.max(0, t) / lane) * length, width, height, inset, out);
      if (gap < 0) out.angle += Math.PI;
    } else {
      var k = Math.max(0, Math.min(1, (t - lane) / (out.hop || 1)));
      out.angle = Math.atan2(ey - out.y, ex - out.x);
      out.x += (ex - out.x) * k;
      out.y += (ey - out.y) * k;
    }
    return lane + out.hop;
  };

  // A seat that comes back out of the nest door stays on the lane spot beside it, where a worker's route starts over.
  Habitat.prototype.leaveDoor = function (i) {
    this.role[i] = 0;
    if (this.job[i] === TEND) return;
    this.phase[i] = this.routes.forage.a;
    if (this.job[i] && this.job[i] < TEND) { this.jobState[i] = 0; this.travel[i] = 0; }
  };

  // The crew is through when every member has stepped inside; the timeout covers a member lost to a reallocation.
  Habitat.prototype.checkCrew = function () {
    var inside = true;
    var members = 0;
    var i;
    for (i = 0; i < this.count; i++) {
      if (this.role[i] !== CREW) continue;
      members++;
      if (this.clock - this.roleStart[i] < this.toDoor(i, 0, this.trip)) inside = false;
    }
    var late = this.clock >= this.crew.due;
    if (members && !inside && !late) return;
    if (late && members && !inside) this.events.crewTimeouts++;
    this.crew = null;
    for (i = 0; i < this.count; i++) if (this.role[i] === CREW && this.clock - this.roleStart[i] >= this.toDoor(i, 0, this.trip)) this.emerge(i, this.roleIndex[i] + 2);
    this.bakeBase();
    this.placeBase();
    this.bakeGround();
    this.glowStart = this.clock;
    this.puff(Motes.DUST, this.baseX + this.entryX, this.baseY + this.entryY, 6, 36, -Math.PI / 2, Math.PI, 2);
  };

  // ---- Startle and scatter ----
  // Roaches near an intruder's arrival or a big purchase freeze, dash a short way outward, pause and walk back.
  // Returns how many scattered.
  Habitat.prototype.startle = function (x, y) {
    if (this.clock < this.startleAt + SCATTER_COOLDOWN) return 0;
    var s = this.spot;
    var n = 0;
    for (var i = 0; i < this.count && n < SCATTER_MAX; i++) {
      if (this.role[i] || this.manner[i] || this.job[i] > TEND || this.job[i] === PROCESSION) continue;
      this.restPoint(i, s);
      if ((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) > SCATTER_RADIUS * SCATTER_RADIUS) continue;
      this.assume(i, SCATTER, n++);
    }
    if (!n) return 0;
    this.startleAt = this.clock;
    this.startleX = x;
    this.startleY = y;
    this.events.scatters++;
    return n;
  };

  // The spot a scattering seat dashes to: outward from the source, shortened so it never enters the centre 60%.
  Habitat.prototype.scatterAim = function (i, out) {
    this.restPoint(i, out);
    var dx = out.x - this.startleX;
    var dy = out.y - this.startleY;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var margin = this.kinds[this.kind[i]].tile * 0.6;
    // A slow walker's dash is shorter, so its quick start stays within a hurried pace.
    var most = Math.min(SCATTER_REACH, this.speed[i] * 0.6);
    for (var reach = most; reach > 0; reach -= most / 2) {
      if (!this.inCentre(out.x + dx / d * reach, out.y + dy / d * reach, margin)) { out.x += dx / d * reach; out.y += dy / d * reach; return out; }
    }
    return out;
  };

  // ---- Frontier guards ----
  // A few claimers stand at the outermost claim posts. A marcher passing a post whose guard's shift is over takes
  // its place, and the relieved guard marches on to the frontier and home.
  Habitat.prototype.staffGuards = function (delta) {
    var c = this.routes.claim;
    var length = laneLength(this.canvas.width, this.canvas.height, c.outer);
    if (this.clock >= this.guardNext) { this.guardNext = this.clock + GUARD_POLL; this.planGuards(); }
    if (!this.guardNeed) return;
    var posts = this.guardPosts;
    for (var i = 0; i < this.count; i++) {
      // A marcher on its way out, or resting at the frontier for its last post, walking its lane rather than stepping
      // aside or greeting, so it stops where it stands.
      if (this.role[i] || this.manner[i] || this.job[i] !== CLAIM || this.jobState[i] > 1 || Math.abs(this.inset[i] + this.side[i] + this.meander(i) - c.outer) > 2) continue;
      for (var k = posts - 1; k >= 0; k--) {
        if (!(this.guardNeed & (1 << k)) || (this.jobState[i] && k < posts - 1)) continue;
        // Only a marcher that reached the post this frame takes it, so it never steps back to it.
        var d = this.travel[i] - c.span * (k + 1) / posts;
        if (d >= 0 && d <= this.speed[i] * this.pace[i] * delta / length + 1e-6) { this.takePost(i, k); break; }
      }
    }
  };

  // Which posts need a guard or a relief. Guards stand down when the frontier moves or their job changes.
  Habitat.prototype.planGuards = function () {
    var c = this.routes.claim;
    var posts = this.routes.ready && this.territory ? Math.min(5, 1 + Math.floor(this.territory / 4)) : 0;
    var moved = c.a !== this.guardA || c.span !== this.guardSpan || posts !== this.guardPosts;
    this.guardA = c.a;
    this.guardSpan = c.span;
    this.guardPosts = posts;
    var claimers = 0;
    var staffed = 0;
    var i;
    for (i = 0; i < this.count; i++) if (this.job[i] === CLAIM) claimers++;
    var want = Math.min(GUARDS, posts, claimers - 1);
    for (i = 0; i < this.count; i++) {
      if (this.role[i] !== GUARD) continue;
      var k = this.roleIndex[i];
      if (moved || this.job[i] !== CLAIM || k < posts - want || staffed & (1 << k)) this.leavePost(i);
      else staffed |= 1 << k;
    }
    this.guardNeed = 0;
    for (k = posts - want; k < posts; k++) if (!(staffed & (1 << k))) this.guardNeed |= 1 << k;
    for (i = 0; i < this.count; i++) {
      if (this.role[i] === GUARD && this.clock >= this.roleStart[i] + GUARD_SHIFT + this.roleIndex[i] * 6) this.guardNeed |= 1 << this.roleIndex[i];
    }
  };

  Habitat.prototype.takePost = function (i, k) {
    var c = this.routes.claim;
    var along = c.span * (k + 1) / this.guardPosts;
    for (var g = 0; g < this.count; g++) {
      if (this.role[g] === GUARD && this.roleIndex[g] === k) { this.leavePost(g); this.events.guardShifts++; }
    }
    this.assume(i, GUARD, k);
    this.phase[i] = c.a + c.dir * along;
    this.phase[i] -= Math.floor(this.phase[i]);
    this.inset[i] = c.outer;
    this.travel[i] = along;
    this.guardNeed &= ~(1 << k);
  };

  // The relieved guard carries on outward from its post.
  Habitat.prototype.leavePost = function (i) {
    this.role[i] = 0;
    if (this.job[i] !== CLAIM) return;
    this.jobState[i] = 0;
    this.travel[i] = this.guardPosts ? this.routes.claim.span * (this.roleIndex[i] + 1) / this.guardPosts : 0;
  };

  // ---- Nursery line ----
  // When a queen lays and no line has formed for a while, the hatchlings come out of the nest into a line behind
  // her, follow her round, then peel off one at a time onto the supply trail. Returns false to fall back to lay()'s
  // single hatchling.
  Habitat.prototype.startNursery = function (queen) {
    if (this.clock < this.nurseNext || !this.routes.ready) return false;
    var n = 0;
    for (var i = 0; i < this.count && n < NURSE_MAX; i++) {
      if (this.role[i] || this.manner[i] || this.kinds[this.kind[i]].id !== 'hatchling') continue;
      this.assume(i, NURSE, n++);
      this.atX[i] = this.baseX + this.entryX;
      this.atY[i] = this.baseY + this.entryY;
    }
    if (!n) return false;
    this.nurseNext = this.clock + NURSERY_GAP;
    this.nurseLost = 1e9;
    this.layQueen = queen;
    this.events.nursery++;
    return true;
  };

  // Places a nursing hatchling in out (angle, and length > 0 while it walks). Returns 1 to draw, 0 while it is
  // still inside the nest, and -1 once it has joined the trail. It walks from where it was last placed toward its
  // place in the line, or later toward the trail, at a hurried pace at most, so it never jumps to either.
  Habitat.prototype.nursePoint = function (i, age, delta, out) {
    var k = this.roleIndex[i];
    var q = this.layQueen;
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var start = k * 0.6;
    if (age < start) { this.atX[i] = ex; this.atY[i] = ey; return 0; }
    var peel = Math.max(start + 1, Math.min(NURSE_FOLLOW + k * NURSE_PEEL_GAP, this.nurseLost - this.roleStart[i]));
    var f = this.routes.forage;
    var lost = q < 0 || this.job[q] !== TEND;
    var trail = lost || age >= peel;
    var walking = !lost && !this.role[q] && this.clock >= this.restUntil[q];
    var angle = 0;
    var inset = 0;
    if (trail) {
      // Off to the trail at the hatchling's own roaming lane, so it walks on without a jump.
      var span = this.laneMax - this.minInset;
      inset = this.minInset + span * (this.lane[i] * 0.8 + 0.1);
      this.lanePoint(f.a, inset, out);
    } else {
      // A place on the queen's circle a few body lengths behind her.
      // The circle is squashed, so the step in angle for an even spacing depends on where she is on it.
      var reach = Math.max(30, this.baseCanvas.width * 0.42);
      var at = this.travel[q];
      var wave = at - (k + 1.3) * NURSE_SPACING / (reach * Math.sqrt(Math.sin(at) * Math.sin(at) + 0.3025 * Math.cos(at) * Math.cos(at)));
      out.x = ex + Math.cos(wave) * reach;
      out.y = this.tendY(ey, reach) + Math.sin(wave) * reach * 0.55;
      angle = Math.atan2(Math.cos(wave) * 0.55, -Math.sin(wave));
    }
    var dx = out.x - this.atX[i];
    var dy = out.y - this.atY[i];
    var d = Math.sqrt(dx * dx + dy * dy);
    var step = this.speed[i] * HURRY * delta;
    if (d > step) {
      out.x = this.atX[i] + dx / d * step;
      out.y = this.atY[i] + dy / d * step;
      angle = Math.atan2(dy, dx);
      walking = true;
    } else if (trail) {
      this.phase[i] = f.a;
      this.dir[i] = f.dir;
      this.inset[i] = inset;
      return -1;
    }
    this.atX[i] = out.x;
    this.atY[i] = out.y;
    out.angle = angle;
    out.length = walking ? 1 : 0;
    return 1;
  };

  // Live roles and counts for colonyDiagnostics().habitat.events.
  Habitat.prototype.behaviourDiagnostics = function (events) {
    var live = {entering: 0, crewing: 0, scattering: 0, guards: 0, nursing: 0};
    var names = {};
    names[ENTER] = 'entering'; names[CREW] = 'crewing'; names[SCATTER] = 'scattering'; names[GUARD] = 'guards'; names[NURSE] = 'nursing';
    for (var i = 0; i < this.count; i++) if (names[this.role[i]]) live[names[this.role[i]]]++;
    for (var key in live) events[key] = live[key];
    events.crewHolding = !!this.crew;
    return events;
  };

  // ---- Chance events: snack drop, egg case, molting roach, nuptial flight and the ascension ceremony ----
  // The colony page starts and ends them: showChance and endChance for the scheduled events, nuptialFlight after a
  // night-time milestone and ascendCeremony when the player ascends. Props and flyers take entity seats like the other
  // guests (chanceSeats); carriers, hatchlings and the ceremony's walkers are roles on existing seats. Sprites come
  // from the critter atlas at their native 64 px and are drawn 1:1 at whole pixels. Positions derive from the clock
  // and the lane, so a frame allocates nothing, and hiding drops everything (endChances, from syncActivity).
  var CARRY = 30;
  var HATCH = 31;
  var FILE_IN = 32;
  var WAIT_IN = 33;
  var RETIRE = 34;
  var DUNG_WATCH = 35;
  var CHANCE_PX = 64;
  // The art fills about the middle 48 px of its cell; a snack is bitten away within that box.
  var CHANCE_MARGIN = 8;
  // Carriers walk the lane at CARRY_PACE times their own speed, stand CARRY_PICK at the load and CARRY_DROP at the door.
  var CARRY_PACE = HURRY;
  var CARRY_PICK = 0.6;
  var CARRY_DROP = 1;
  var SNACK_CARRIERS = 6;
  var SNACK_STEPS = 8;
  var EGG_CARRIERS = 2;
  var HATCHLINGS = 3;
  // A molting roach that is not caught darkens in four steps, then walks off along the lane and fades.
  var MOLT_DARKEN = 3;
  var MOLT_WALK = 3.5;
  var MOLT_SPEED = 40;
  var HUSK_STAYS = 20;
  var HUSK_BESIDE = 40;
  var FLYERS = 3;
  var FLIGHT_SECONDS = 3.2;
  var FLIGHT_GAP = 0.45;
  var FLIGHT_COOLDOWN = 300;
  // The ceremony: roaches near enough to walk in through the door before CEREMONY_IN file in, farther ones fade
  // where they walk; at CEREMONY_IN the reset colony is applied and a fresh pair walks out; at CEREMONY_SECONDS the
  // rest follow.
  var CEREMONY_IN = 2.2;
  var CEREMONY_SECONDS = 4;

  function wrap(fraction) {
    return fraction - Math.round(fraction);
  }

  // A darker, roach-brown copy of a pale sprite, baked once when a molting roach starts to leave.
  function darkCopy(document, source) {
    var canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var d = image.data;
    for (var i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      var light = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      d[i] = 34 + light * 118;
      d[i + 1] = 22 + light * 74;
      d[i + 2] = 14 + light * 44;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  Habitat.prototype.initChance = function () {
    this.chance = null;
    this.husk = null;
    this.flight = null;
    this.flightNext = 0;
    this.ceremony = null;
    this.hatchX = this.hatchY = this.hatchPhase = 0;
    this.fileAlpha = 1;
    this.carryPhase = this.carryInset = 0;
    var e = this.events;
    e.snacks = e.eggs = e.hatched = e.molts = e.dungs = e.flights = e.ceremonies = 0;
  };

  Habitat.prototype.chanceSeats = function () {
    return (this.chance ? 1 : 0) + (this.husk ? 1 : 0) + (this.flight ? FLYERS : 0);
  };

  // Whether an egg case or a molting roach is waiting for Red, so the visitor gives up the cue.
  Habitat.prototype.chanceCatchable = function () {
    var c = this.chance;
    return !!c && (c.kind === 'egg' ? !c.carry : c.kind === 'dung' ? !c.leave : c.kind === 'molt' && !c.leave);
  };

  Habitat.prototype.lanePoint = function (phase, inset, out) {
    return pointOnLane(phase * laneLength(this.canvas.width, this.canvas.height, inset), this.canvas.width, this.canvas.height, inset, out);
  };

  // The first of the lap offsets from the nest door where a 64 px prop sits clear of the controls, the nest art and
  // the centre 60%, or -1. With beside, a second prop that far further in from the edge must fit too.
  Habitat.prototype.chanceSpot = function (offsets, inset, beside) {
    for (var k = 0; k < offsets.length; k++) {
      var phase = this.routes.forage.a + offsets[k];
      phase -= Math.floor(phase);
      if (this.clearSpot(phase, inset) && (!beside || this.clearSpot(phase, inset + beside))) return phase;
    }
    return -1;
  };

  Habitat.prototype.clearSpot = function (phase, inset) {
    var p = this.lanePoint(phase, inset, this.ahead);
    return !this.blocked(p.x, p.y, CHANCE_PX * 0.6) && !this.overlaps(p.x, p.y, p.x, p.y, CHANCE_PX * 0.6) && !this.inCentre(p.x, p.y, CHANCE_PX / 2);
  };

  // A lane corner other than the nest's, clear of the controls and the golden roach, nearest the door along the lane.
  Habitat.prototype.cornerSpot = function (inset) {
    var best = -1;
    var bestGap = 2;
    for (var c = 0; c < 4; c++) {
      var phase = this.nearestPhase(inset, c & 1 ? this.canvas.width : 0, c & 2 ? this.canvas.height : 0);
      var p = this.lanePoint(phase, inset, this.ahead);
      var gap = Math.abs(wrap(this.routes.forage.a - phase));
      if (gap < 0.05 || this.blocked(p.x, p.y, CHANCE_PX * 0.6) || this.overlaps(p.x, p.y, p.x, p.y, CHANCE_PX * 0.6) || this.inCentre(p.x, p.y, CHANCE_PX / 2)) continue;
      if (this.golden && this.golden.x !== undefined && Math.abs(this.golden.x - p.x) + Math.abs(this.golden.y - p.y) < 300) continue;
      if (gap < bestGap) { bestGap = gap; best = phase; }
    }
    return best;
  };

  // kind 'snack', 'egg' or 'molt'; art is the event sprite's name. False when it cannot be placed or drawn, so the
  // schedule drops it unseen.
  Habitat.prototype.showChance = function (kind, art, seconds) {
    if (this.destroyed || this.chance || this.ceremony || !this.routes.ready || this.canvas.ownerDocument.hidden || !Habitat.critterCanvas) return false;
    var sprite = Habitat.critterCanvas('event_' + art, CHANCE_PX);
    if (!sprite || !sprite.width) return false;
    if (kind === 'dung') return this.placeDung(art, sprite, seconds);
    var f = this.routes.forage;
    var middle = (f.outer + f.inner) / 2;
    var inset = kind === 'egg' ? this.minInset + (this.laneMax - this.minInset) * 0.3 : middle;
    // A snack lands away from the supply trail's far end; a molting roach rests just beside the nest.
    var phase = kind === 'snack' ? this.chanceSpot([-0.1 * f.dir, -0.14 * f.dir, 0.1 * f.dir, -0.18 * f.dir, 0.14 * f.dir, -0.24 * f.dir], inset)
      : kind === 'egg' ? this.cornerSpot(inset)
      : kind === 'molt' ? this.chanceSpot([-0.035 * f.dir, -0.05 * f.dir, -0.07 * f.dir, 0.035 * f.dir, 0.05 * f.dir], inset, HUSK_BESIDE) : -1;
    if (phase < 0) return false;
    var p = this.lanePoint(phase, inset, this.ahead);
    var c = {kind: kind, art: art, sprite: sprite, mirror: null, dark: null, start: this.clock, seconds: Math.max(5, Number(seconds) || 30),
      phase: phase, inset: inset, x: p.x | 0, y: p.y | 0, home: wrap(f.a - phase), bite: 0, biteLeft: this.baseX + this.entryX < p.x,
      carry: 0, carryAt: 0, carryTime: 1, leave: 0, leaveAt: 0, away: 1, face: 1};
    this.chance = c;
    if (kind === 'molt') {
      // The husk lies beside it, a little further in from the edge. On a side edge it faces away from the husk, as if
      // just stepped out of it; on the top or bottom it faces along the lane away from the nest, the way it walks off.
      c.away = c.home > 0 ? -1 : 1;
      var inward = Math.cos(p.angle + Math.PI / 2);
      c.face = inward > 0.5 ? -1 : inward < -0.5 ? 1 : Math.cos(p.angle) * c.away < 0 ? -1 : 1;
      c.mirror = Habitat.critterCanvas('event_molting_roach', CHANCE_PX, true);
      var h = this.lanePoint(phase, inset + HUSK_BESIDE, this.ahead);
      this.husk = {sprite: Habitat.critterCanvas('event_molt_husk', CHANCE_PX, c.face < 0), x: h.x | 0, y: h.y | 0, until: Infinity};
    }
    this.events[kind === 'snack' ? 'snacks' : kind === 'egg' ? 'eggs' : 'molts']++;
    this.reconcile();
    if (kind === 'snack') {
      this.puff(Motes.DUST, c.x, c.y + 12, 6, 40, -Math.PI / 2, 2.4, 2);
      this.puff(Motes.CRUMB, c.x, c.y, 4, 50, -Math.PI / 2, 2, 2);
      this.recruit(phase, SNACK_CARRIERS);
    }
    return true;
  };

  // Ends a scheduled event. A snack is hauled home; an egg case hatches when caught, else the colony carries it in;
  // a molting roach that was caught walks into the nest, else it darkens and walks off.
  Habitat.prototype.endChance = function (kind, caught) {
    var c = this.chance;
    if (!c || c.kind !== kind || c.carry || c.leave) return;
    if (kind === 'snack') this.finishSnack();
    else if (kind === 'egg' && caught) this.hatchEgg();
    else if (kind === 'egg') this.carryEgg();
    else if (kind === 'dung') this.finishDung(caught);
    else {
      c.leave = caught ? 1 : 2;
      c.leaveAt = this.clock;
      if (!caught) {
        c.dark = darkCopy(this.canvas.ownerDocument, c.sprite);
        c.darkMirror = darkCopy(this.canvas.ownerDocument, c.mirror);
      } else this.puff(Motes.GLINT, c.x, c.y - 16, 3, 20, -Math.PI / 2, 1.2, 2);
    }
  };

  // Meat-chain walkers on the lane take up a carrying role: those that would bring the load home soonest, walking to
  // it and back at their own pace, with foragers and then other drones given a few seconds' head start.
  Habitat.prototype.recruit = function (phase, limit) {
    var self = this;
    var picked = this.pick(function (id) { return SPECIES[id].chain === 'meat'; }, MAX_ROACHES).filter(function (i) {
      return i !== self.lead && (self.job[i] === ROAM || self.job[i] === FORAGE);
    });
    var home = Math.abs(this.chance.home) * laneLength(this.canvas.width, this.canvas.height, this.chance.inset);
    var rank = function (i) { return (self.job[i] === FORAGE ? 0 : self.kinds[self.kind[i]].id === 'drone' ? 1 : 2) * 3 + self.approachTime(i) + home / (self.speed[i] * CARRY_PACE); };
    picked.sort(function (a, b) { return rank(a) - rank(b); });
    picked.length = Math.min(limit, picked.length);
    for (var k = 0; k < picked.length; k++) this.assume(picked[k], CARRY, k);
    return picked.length;
  };

  // Seconds a carrier takes to walk along the lane from its own spot to the load, and across to the load's lane.
  Habitat.prototype.approachTime = function (i) {
    var c = this.chance;
    var distance = Math.abs(wrap(c.phase - this.phase[i])) * laneLength(this.canvas.width, this.canvas.height, c.inset) + Math.abs(c.inset - this.inset[i]) + 20;
    return Math.max(0.6, distance / (this.speed[i] * CARRY_PACE));
  };

  // Where a carrier is: walking along the lane from its spot to the load, then (for a snack) shuttling between the load
  // and the nest door, outbound on the outer lane and home on the inner one like a forager, or (for an egg case)
  // carrying it home with its partner. Sets out.x, out.y and out.angle, and carryPhase and carryInset; returns 0
  // inside the door, 1 standing, 2 walking and 3 carrying a crumb.
  Habitat.prototype.carrierPoint = function (i, age, delta, out) {
    var c = this.chance;
    var f = this.routes.forage;
    var k = this.roleIndex[i];
    var length = laneLength(this.canvas.width, this.canvas.height, c.inset);
    var egg = c.kind === 'egg';
    // Snack carriers gather side by side on both lanes around the load; egg carriers one each side of it.
    var spread = egg ? (k ? -28 : 28) * (c.home < 0 ? -1 : 1) / length : (k % 3 - 1) * 9 / length;
    var lane = egg ? c.inset : k % 2 ? f.outer : f.inner;
    var reach = wrap(c.phase + spread - this.phase[i]);
    var approach = this.approachTime(i);
    var t = age - k * 0.25;
    var phase, inset, state, v;
    if (t < approach) {
      v = Math.max(0, t / approach);
      phase = this.phase[i] + reach * v;
      inset = this.inset[i] + (lane - this.inset[i]) * v;
      state = t > 0 ? 2 : 1;
      this.lanePoint(phase, inset, out);
      if (reach < 0) out.angle += Math.PI;
    } else if (egg) {
      v = (this.clock - c.carryAt) / c.carryTime;
      if (v >= 1) return 0;
      phase = c.phase + spread + c.home * Math.max(0, v);
      inset = lane;
      this.lanePoint(phase, inset, out);
      if (v > 0) { if (c.home < 0) out.angle += Math.PI; state = 2; }
      else { out.angle = Math.atan2(c.y - out.y, c.x - out.x); state = 1; }
    } else {
      var load = c.phase + spread;
      var gap = c.home - spread;
      var walk = Math.max(0.8, Math.abs(gap) * length / (this.speed[i] * CARRY_PACE));
      var period = CARRY_PICK + walk + CARRY_DROP + walk;
      var tau = (t - approach) % period;
      if (tau < CARRY_PICK) {
        phase = load; inset = lane; state = 1;
        this.lanePoint(phase, inset, out);
        out.angle = Math.atan2(c.y - out.y, c.x - out.x);
      } else if ((tau -= CARRY_PICK) < walk) {
        v = tau / walk;
        phase = load + gap * v; inset = lane + (f.inner - lane) * Math.min(1, v * 2.5); state = 3;
        this.lanePoint(phase, inset, out);
        if (gap < 0) out.angle += Math.PI;
      } else if ((tau -= walk) < CARRY_DROP) {
        // The crumb goes down at the door, where an inner worker carries it in as with a forager's.
        if (tau < delta) {
          this.puff(Motes.CRUMB, this.baseX + this.entryX, this.baseY + this.entryY, 2, 40, -Math.PI / 2, 2, 1);
          this.handoff();
        }
        phase = load + gap; inset = f.inner; state = 1;
        this.lanePoint(phase, inset, out);
        if (gap > 0) out.angle += Math.PI;
      } else {
        v = (tau - CARRY_DROP) / walk;
        phase = load + gap * (1 - v); inset = f.outer + (lane - f.outer) * Math.max(0, v * 2.5 - 1.5); state = 2;
        this.lanePoint(phase, inset, out);
        if (gap > 0) out.angle += Math.PI;
      }
    }
    this.carryPhase = phase;
    this.carryInset = inset;
    return state;
  };

  // Hatchlings walk out of a hatched egg case to the lane beside it, then carry on from there.
  Habitat.prototype.hatchPoint = function (i, age, out) {
    var k = this.roleIndex[i];
    var target = this.hatchPhase + (k - 1) * 0.006;
    this.lanePoint(target, Math.max(this.minInset, this.inset[i]), out);
    var dx = out.x - this.hatchX;
    var dy = out.y - this.hatchY;
    var t = (age - k * 0.3) * this.speed[i] * HURRY / Math.max(1, Math.sqrt(dx * dx + dy * dy));
    if (t < 0) return 0;
    if (t >= 1) {
      this.phase[i] = target - Math.floor(target);
      this.role[i] = 0;
      return -1;
    }
    out.angle = Math.atan2(dy, dx);
    out.x = this.hatchX + dx * t;
    out.y = this.hatchY + dy * t;
    return 2;
  };

  // A ceremony walker: those that can walk along the lane and through the door before it closes file in, and a
  // tending queen near enough steps in from her circle; the others fade out in four steps as they walk on. fileAlpha
  // carries the fade.
  Habitat.prototype.filePoint = function (i, age, out) {
    var delay = Math.min(0.8, this.roleIndex[i] * 0.03);
    var u = age - delay;
    this.fileAlpha = 1;
    var trip = this.toDoor(i, u, out);
    if (delay + trip <= CEREMONY_IN) {
      if (u >= trip) return 0;
      return u > 0 ? 2 : 1;
    }
    this.fileAlpha = 1 - Math.floor(Math.max(0, u) / 1.6 * 4) / 4;
    if (this.fileAlpha <= 0) return 0;
    var walked = Math.max(0, u) * this.speed[i];
    if (this.job[i] === TEND) {
      this.restPoint(i, out);
      out.angle = Math.atan2(this.baseY + this.entryY - out.y, this.baseX + this.entryX - out.x);
      out.x += Math.cos(out.angle) * walked;
      out.y += Math.sin(out.angle) * walked;
    } else {
      var inset = Math.max(this.minInset, this.inset[i]);
      var gap = wrap(this.routes.forage.a - this.phase[i]);
      this.lanePoint(this.phase[i] + (gap < 0 ? -1 : 1) * walked / laneLength(this.canvas.width, this.canvas.height, inset), inset, out);
      if (gap < 0) out.angle += Math.PI;
    }
    return u > 0 ? 2 : 1;
  };

  Habitat.prototype.retirePoint = function (i, age, delta, out) {
    var width = this.canvas.width;
    var height = this.canvas.height;
    var tile = this.kinds[this.kind[i]].tile;
    var x = this.atX[i];
    var y = this.atY[i];
    if (!(x > 0 || y > 0)) {
      this.restPoint(i, out);
      x = out.x;
      y = out.y;
    }
    var ex = this.baseX + this.entryX;
    var ey = this.baseY + this.entryY;
    var dex = ex - x;
    var dey = ey - y;
    var doorDist = this.baseCanvas.width ? Math.sqrt(dex * dex + dey * dey) : Infinity;
    var tx, ty;
    if (doorDist <= 120 && this.clearPath(i, ex, ey)) {
      tx = ex;
      ty = ey;
    } else {
      var dLeft = x + tile;
      var dRight = width - x + tile;
      var dTop = y + tile;
      var dBottom = height - y + tile;
      var best = Math.min(dLeft, dRight, dTop, dBottom);
      tx = best === dLeft ? -tile : best === dRight ? width + tile : x;
      ty = tx !== x ? y : best === dTop ? -tile : height + tile;
    }
    var dx = tx - x;
    var dy = ty - y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var step = this.speed[i] * 1.6 * delta;
    if (dist <= step || age >= 1.6 || x < -tile * 0.4 || x > width + tile * 0.4 || y < -tile * 0.4 || y > height + tile * 0.4) {
      this.departureReason[i] = 1;
      return 0;
    }
    out.x = x + dx / dist * step;
    out.y = y + dy / dist * step;
    out.angle = Math.atan2(dy, dx);
    this.atX[i] = out.x;
    this.atY[i] = out.y;
    this.fileAlpha = age > 1.2 ? Math.max(0.15, (1.6 - age) / 0.4) : 1;
    return 2;
  };

  // Draws a seat in one of the roles above (from drawRole). Returns false once its role has ended.
  Habitat.prototype.drawChanceRole = function (i, record, delta) {
    var role = this.role[i];
    var age = this.clock - this.roleStart[i];
    var s = this.spot;
    var state = 0;
    var alpha = 1;
    if (role === CARRY) {
      if (!this.chance) { this.role[i] = 0; this.carrying[i] = 0; return false; }
      state = this.carrierPoint(i, age, delta, s);
      this.carrying[i] = state === 3 ? 1 : 0;
    } else if (role === HATCH) {
      state = this.hatchPoint(i, age, s);
      if (state < 0) return false;
    } else if (role === DUNG_WATCH) {
      var dung = this.chance;
      if (!dung || dung.kind !== 'dung') { this.role[i] = 0; return false; }
      var along = Math.min(1, (this.clock - dung.start) / dung.seconds);
      var beside = this.roleIndex[i] ? 0.03 : -0.03;
      this.lanePoint(dung.phase + (dung.endPhase - dung.phase) * along + beside, Math.max(this.minInset, dung.inset - 16), s);
      state = 2;
    } else if (role === FILE_IN) {
      state = this.filePoint(i, age, s);
      alpha = this.fileAlpha;
    } else if (role === RETIRE) {
      state = this.retirePoint(i, age, delta, s);
      alpha = this.fileAlpha;
    }
    if (!state) return true;
    var tile = record.tile;
    var heading = facingRow(s.angle);
    this.stepGait(i, record, s.x, s.y, delta, state > 1, 1);
    if (this.blocked(s.x, s.y, tile * 0.55)) return true;
    this.ctx.globalAlpha = alpha;
    this.blit(record, heading, this.gait[i] | 0, s.x, s.y, this.scaleOf(i, record));
    this.ctx.globalAlpha = 1;
    if (state === 3) this.prop('carried-crumb', s.x + DX[heading] * tile * 0.42, s.y + DY[heading] * tile * 0.42);
    return true;
  };

  // Once per frame from draw(), under the walkers: the ceremony's steps, the husk and the event's prop, unless the
  // prop is what Red catches now (later), which drawCatchable puts on top.
  Habitat.prototype.drawChanceProps = function (later) {
    if (this.ceremony) this.stepCeremony();
    if (this.husk) this.drawHusk();
    var c = this.chance;
    if (!c || later) return;
    if (c.kind === 'snack') this.drawSnack(c);
    else if (c.kind === 'egg') this.drawEgg(c);
    else if (c.kind === 'dung') this.drawDung(c);
    else this.drawMolt(c);
  };

  // Last in the frame: a waiting egg case or molting roach over its halo, under the Red cue.
  Habitat.prototype.drawCatchable = function () {
    var c = this.chance;
    var half = c.kind === 'egg' ? 11 : 21;
    if (this.blocked(c.x, c.y, CHANCE_PX * 0.4)) return;
    this.halo(c.x, c.y, half * 6);
    if (c.kind === 'dung') this.drawDung(c);
    else if (c.kind === 'egg') this.drawEgg(c);
    else this.drawMolt(c);
    this.redCue(c.x, c.y - half, c.y + half);
  };

  Habitat.prototype.placeDung = function (art, sprite, seconds) {
    var claim = this.routes.claim;
    var ball = Habitat.critterCanvas('event_dung_ball', CHANCE_PX);
    if (!claim.span || !ball || !ball.width) return false;
    var start = claim.a - Math.floor(claim.a);
    var end = start + claim.dir * Math.min(0.35, claim.span);
    var at = this.lanePoint(start, claim.outer, this.ahead);
    this.chance = {kind: 'dung', art: art, sprite: sprite, ball: ball, start: this.clock, seconds: Math.max(8, Number(seconds) || 40),
      phase: start, endPhase: end, inset: claim.outer, x: at.x | 0, y: at.y | 0, home: 0, carry: 0, leave: 0, turns: 0};
    this.events.dungs++;
    this.reconcile();
    var picked = this.pick(function (id) { return SPECIES[id].chain === 'territory'; }, 8);
    var n = 0;
    for (var i = 0; i < picked.length && n < 2; i++) {
      if (this.role[picked[i]]) continue;
      this.assume(picked[i], DUNG_WATCH, n++);
    }
    return true;
  };

  Habitat.prototype.dungPoint = function (c) {
    var along = Math.min(1, (this.clock - c.start) / c.seconds);
    var phase = c.phase + (c.endPhase - c.phase) * along;
    var at = this.lanePoint(phase, c.inset, this.ahead);
    c.x = at.x | 0;
    c.y = at.y | 0;
    c.angle = at.angle + Math.PI;
    var step = Math.floor(along * 8);
    if (step !== c.turns) c.turns = step;
    return at;
  };

  Habitat.prototype.drawDung = function (c) {
    this.dungPoint(c);
    if (this.blocked(c.x, c.y, CHANCE_PX * 0.45)) return;
    var ctx = this.ctx;
    var ballX = c.x + Math.round(Math.cos(c.angle) * 28);
    var ballY = c.y + Math.round(Math.sin(c.angle) * 18);
    ctx.save();
    ctx.translate(ballX, ballY);
    ctx.rotate((c.turns % 4) * Math.PI / 2);
    ctx.drawImage(c.ball, -CHANCE_PX / 2, -CHANCE_PX / 2);
    ctx.restore();
    this.touch(ballX - CHANCE_PX / 2, ballY - CHANCE_PX / 2, CHANCE_PX, CHANCE_PX);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.drawImage(c.sprite, -CHANCE_PX / 2, -CHANCE_PX / 2);
    ctx.restore();
    this.touch(c.x - CHANCE_PX / 2, c.y - CHANCE_PX / 2, CHANCE_PX, CHANCE_PX);
    if (this.dustDue) this.puff(Motes.CLOD, ballX, ballY + 8, 1, 16, -Math.PI / 2, 1.2, 1);
  };

  Habitat.prototype.finishDung = function (caught) {
    var c = this.chance;
    if (!c) return;
    this.puff(Motes.CLOD, c.x, c.y, 6, 40, -Math.PI / 2, 2.2, 2);
    if (caught) this.puff(Motes.CRUMB, c.x, c.y, 4, 36, -Math.PI / 2, 2, 1);
    var i;
    for (i = 0; i < this.count; i++) if (this.role[i] === DUNG_WATCH) this.role[i] = 0;
    this.chance = null;
    this.reconcile();
  };

  // The snack loses a whole step from the side facing the nest each eighth of its time, with a spill of crumbs.
  Habitat.prototype.drawSnack = function (c) {
    var step = Math.min(SNACK_STEPS, Math.floor((this.clock - c.start) / c.seconds * SNACK_STEPS));
    var inner = CHANCE_PX - 2 * CHANCE_MARGIN;
    var keep = Math.round(inner * (SNACK_STEPS - step) / SNACK_STEPS);
    var left = c.x - CHANCE_PX / 2;
    var top = c.y - CHANCE_PX / 2;
    var sx = c.biteLeft ? CHANCE_PX - CHANCE_MARGIN - keep : CHANCE_MARGIN;
    if (step > c.bite) {
      c.bite = step;
      this.puff(Motes.CRUMB, left + (c.biteLeft ? sx : sx + keep), c.y, 3, 40, -Math.PI / 2, 2.2, 1);
    }
    if (keep <= 0 || this.blocked(c.x, c.y, CHANCE_PX * 0.4)) return;
    this.ctx.drawImage(c.sprite, sx, 0, keep, CHANCE_PX, left + sx, top, keep, CHANCE_PX);
    this.touch(left + sx, top, keep, CHANCE_PX);
  };

  Habitat.prototype.drawEgg = function (c) {
    var x = c.x;
    var y = c.y;
    var alpha = 1;
    if (c.carry) {
      var v = (this.clock - c.carryAt) / c.carryTime;
      if (v >= 1) { this.finishEgg(); return; }
      if (c.carry === 2) alpha = 1 - Math.floor(v * 4) / 4;
      else if (v > 0) {
        var p = this.lanePoint(c.phase + c.home * v, c.inset, this.ahead);
        x = p.x | 0;
        y = p.y | 0;
      }
    }
    if (this.blocked(x, y, CHANCE_PX * 0.4)) return;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(c.sprite, x - CHANCE_PX / 2, y - CHANCE_PX / 2);
    this.ctx.globalAlpha = 1;
    this.touch(x - CHANCE_PX / 2, y - CHANCE_PX / 2, CHANCE_PX, CHANCE_PX);
  };

  // Red hatched it: a burst of flecks, the egg case gone, and up to three hatchlings walking out of it.
  Habitat.prototype.hatchEgg = function () {
    var c = this.chance;
    this.hatchX = c.x;
    this.hatchY = c.y;
    this.hatchPhase = c.phase;
    this.puff(Motes.FLECK, c.x, c.y, 8, 46, -Math.PI / 2, 2.6, 2);
    this.puff(Motes.DUST, c.x, c.y + 8, 4, 30, -Math.PI / 2, 2, 2);
    this.chance = null;
    this.reconcile();
    var picked = this.pick(function (id) { return id === 'hatchling'; }, HATCHLINGS);
    for (var k = 0; k < picked.length; k++) this.assume(picked[k], HATCH, k);
    this.events.hatched++;
  };

  // Not caught: two carriers walk to it and carry it along the lane into the nest, or with nobody free it fades.
  Habitat.prototype.carryEgg = function () {
    var c = this.chance;
    var n = this.recruit(c.phase, EGG_CARRIERS);
    var latest = 0;
    var slowest = Infinity;
    for (var i = 0; i < this.count; i++) {
      if (this.role[i] !== CARRY) continue;
      latest = Math.max(latest, this.approachTime(i) + this.roleIndex[i] * 0.25);
      slowest = Math.min(slowest, this.speed[i]);
    }
    c.carry = n ? 1 : 2;
    c.carryAt = this.clock + (n ? latest + 0.4 : 0);
    // The pair carry it home at the pace of the slower, a little slower than they walk unladen.
    c.carryTime = n ? Math.max(2, Math.abs(c.home) * laneLength(this.canvas.width, this.canvas.height, c.inset) / (slowest * CARRY_PACE * 0.7)) : 1;
  };

  Habitat.prototype.finishEgg = function () {
    var k = 0;
    for (var i = 0; i < this.count; i++) if (this.role[i] === CARRY) this.emerge(i, k++);
    if (this.chance.carry === 1) this.puff(Motes.DUST, this.baseX + this.entryX, this.baseY + this.entryY, 4, 30, -Math.PI / 2, 2, 1);
    this.chance = null;
    this.reconcile();
  };

  // The foragers set down their last crumbs and walk on from wherever they are.
  Habitat.prototype.finishSnack = function () {
    var c = this.chance;
    for (var i = 0; i < this.count; i++) if (this.role[i] === CARRY && !this.settle(i)) this.role[i] = 0;
    this.puff(Motes.CRUMB, c.x, c.y, 3, 30, -Math.PI / 2, 2, 1);
    this.chance = null;
    this.reconcile();
  };

  // Ends a carrier's or a parading roach's errand where it walks, so whatever it does next starts from there. Returns
  // false for any other errand, or one that is out of sight or off the lane.
  Habitat.prototype.settle = function (i) {
    var role = this.role[i];
    var age = this.clock - this.roleStart[i];
    var s = this.spot;
    if (!role || role === GUARD) return true;
    if (role === CARRY && this.chance && this.carrierPoint(i, age, 0, s)) {
      this.phase[i] = this.carryPhase - Math.floor(this.carryPhase);
      this.inset[i] = this.carryInset;
      if (this.job[i] === FORAGE) { this.jobState[i] = 0; this.travel[i] = 0; }
      this.role[i] = 0;
      return true;
    }
    var w = this.paradeWalk;
    var k = this.roleIndex[i];
    if (role === PARADE && w && this.paradePoint(k, age * w.speed - (k ? w.half + PARADE_GAP * k : 0), s) === 2) {
      this.phase[i] = s.along - Math.floor(s.along);
      this.inset[i] = w.inset;
      if (k) this.toLane(i, w.inset + this.paradeSide(k), this.paradeSide(k));
      this.role[i] = 0;
      return true;
    }
    return false;
  };

  Habitat.prototype.drawMolt = function (c) {
    var x = c.x;
    var y = c.y;
    var face = c.face;
    var dark = 0;
    var alpha = 1;
    var age = this.clock - c.leaveAt;
    if (c.leave === 1) {
      // Caught: it hurries into the nest, pale as it is.
      var u = age * MOLT_SPEED * HURRY / Math.max(1, Math.sqrt((this.baseX + this.entryX - c.x) * (this.baseX + this.entryX - c.x) + (this.baseY + this.entryY - c.y) * (this.baseY + this.entryY - c.y)));
      if (u >= 1) { this.endMolt(); return; }
      var ex = this.baseX + this.entryX;
      var ey = this.baseY + this.entryY;
      face = ex < c.x ? -1 : 1;
      x += (ex - x) * u;
      y += (ey - y) * u + ((this.clock * 7) | 0) % 2;
    } else if (c.leave === 2) {
      if (age < MOLT_DARKEN) dark = Math.floor(age / MOLT_DARKEN * 4 + 1) / 4;
      else {
        var walked = age - MOLT_DARKEN;
        if (walked >= MOLT_WALK) { this.endMolt(); return; }
        dark = 1;
        var p = this.lanePoint(c.phase + c.away * walked * MOLT_SPEED / laneLength(this.canvas.width, this.canvas.height, c.inset), c.inset, this.ahead);
        x = p.x;
        y = p.y + ((this.clock * 7) | 0) % 2;
        if (walked > MOLT_WALK - 1) alpha = 1 - Math.floor((walked - MOLT_WALK + 1) * 4) / 4;
      }
    }
    x = x | 0;
    y = y | 0;
    if (this.blocked(x, y, CHANCE_PX * 0.4)) return;
    var ctx = this.ctx;
    var left = x - CHANCE_PX / 2;
    var top = y - CHANCE_PX / 2;
    if (dark < 1) { ctx.globalAlpha = alpha; ctx.drawImage(face < 0 ? c.mirror : c.sprite, left, top); }
    if (dark > 0) { ctx.globalAlpha = alpha * dark; ctx.drawImage(face < 0 ? c.darkMirror : c.dark, left, top); }
    ctx.globalAlpha = 1;
    this.touch(left, top, CHANCE_PX, CHANCE_PX);
  };

  Habitat.prototype.endMolt = function () {
    this.chance = null;
    if (this.husk) this.husk.until = this.clock + HUSK_STAYS;
    this.reconcile();
  };

  // The husk stays a while after the roach has gone, then fades in four steps over a second.
  Habitat.prototype.drawHusk = function () {
    var h = this.husk;
    var left = this.clock - h.until;
    if (left >= 1) { this.husk = null; this.reconcile(); return; }
    if (this.blocked(h.x, h.y, CHANCE_PX * 0.4)) return;
    this.ctx.globalAlpha = left > 0 ? 1 - Math.floor(left * 4) / 4 : 1;
    this.ctx.drawImage(h.sprite, h.x - CHANCE_PX / 2, h.y - CHANCE_PX / 2);
    this.ctx.globalAlpha = 1;
    this.touch(h.x - CHANCE_PX / 2, h.y - CHANCE_PX / 2, CHANCE_PX, CHANCE_PX);
  };

  // At night, after a big milestone, three winged roaches lift out of the nest and fly off the nearer side edge,
  // flapping between their two frames. At most once every FLIGHT_COOLDOWN seconds of visible play.
  Habitat.prototype.nuptialFlight = function () {
    if (!this.night || this.flight || this.ceremony || this.destroyed || this.canvas.ownerDocument.hidden || !this.baseCanvas.width || this.clock < this.flightNext || !Habitat.critterCanvas) return false;
    var ex = this.baseX + this.entryX;
    var dir = ex < this.canvas.width / 2 ? -1 : 1;
    var up = Habitat.critterCanvas('event_winged_roach_1', CHANCE_PX, dir < 0);
    if (!up || !up.width) return false;
    var ey = this.baseY + this.entryY;
    // They climb clear of the nest's top before they turn for the edge.
    this.flight = {start: this.clock, dir: dir, frames: [up, Habitat.critterCanvas('event_winged_roach_2', CHANCE_PX, dir < 0)], x: ex, y: ey, lift: Math.max(90, ey - this.baseY + 30)};
    this.flightNext = this.clock + FLIGHT_COOLDOWN;
    this.events.flights++;
    this.puff(Motes.DUST, ex, this.flight.y, 4, 30, -Math.PI / 2, 2, 1);
    this.reconcile();
    return true;
  };

  Habitat.prototype.drawFlight = function () {
    var f = this.flight;
    var age = this.clock - f.start;
    if (age >= FLIGHT_SECONDS + FLIGHT_GAP * (FLYERS - 1)) { this.flight = null; this.reconcile(); return; }
    var reach = (f.dir < 0 ? f.x : this.canvas.width - f.x) + CHANCE_PX;
    for (var k = 0; k < FLYERS; k++) {
      var t = (age - k * FLIGHT_GAP) / FLIGHT_SECONDS;
      if (t < 0 || t >= 1) continue;
      // A slow climb out of the door, then away to the edge with a gentle rise and fall.
      var x = f.x + f.dir * reach * t * t;
      var y = f.y - f.lift * Math.min(1, t * 2) - k * 14 + Math.sin(t * TAU * 2 + k) * 6;
      var left = (x - CHANCE_PX / 2) | 0;
      var top = (y - CHANCE_PX / 2) | 0;
      if (this.inCentre(x, y, CHANCE_PX / 2) || (!this.standalone && this.overlaps(left, top, left + CHANCE_PX, top + CHANCE_PX, 0))) continue;
      this.ctx.drawImage(f.frames[(((this.clock * 9) | 0) + k) & 1], left, top);
      this.touch(left, top, CHANCE_PX, CHANCE_PX);
    }
  };

  // The colony files into the nest; the reset colony's snapshot is held until the doors close, then the nest shows
  // its new (first) stage and a fresh pair walks out. Called by the colony page as an ascension succeeds.
  Habitat.prototype.ascendCeremony = function () {
    if (this.destroyed || this.ceremony || this.canvas.ownerDocument.hidden || !this.baseCanvas.width || !this.routes.ready) return false;
    var seats = this.chanceSeats();
    var i;
    // Carriers and parading roaches stop where they walk and file in from there; any other errand goes inside.
    for (i = 0; i < this.count; i++) if (this.job[i] <= TEND && !this.settle(i)) this.assume(i, WAIT_IN, 0);
    this.chance = this.husk = this.flight = null;
    this.ceremony = {start: this.clock, pending: null, applying: false, opened: false};
    var self = this;
    var order = [];
    for (i = 0; i < this.count; i++) if (this.job[i] <= TEND && this.role[i] !== WAIT_IN) order.push(i);
    var gaps = order.map(function (slot) { return Math.abs(wrap(self.routes.forage.a - self.phase[slot])); });
    var ranks = order.map(function (slot, k) { return k; }).sort(function (a, b) { return gaps[a] - gaps[b]; });
    for (var k = 0; k < ranks.length; k++) this.assume(order[ranks[k]], FILE_IN, Math.min(255, k));
    this.events.ceremonies++;
    if (seats) this.reconcile();
    return true;
  };

  // From update(): while the colony files in, the reset colony's snapshot waits. True when it was held.
  Habitat.prototype.holdUpdate = function (snapshot) {
    if (!this.ceremony || this.ceremony.applying) return false;
    this.ceremony.pending = snapshot;
    return true;
  };

  Habitat.prototype.stepCeremony = function () {
    var c = this.ceremony;
    var age = this.clock - c.start;
    var i, k;
    if (!c.opened && age >= CEREMONY_IN) {
      c.opened = true;
      if (c.pending) {
        c.applying = true;
        this.update(c.pending);
        c.applying = false;
        c.pending = null;
      }
      this.glowStart = this.clock;
      this.puff(Motes.DUST, this.baseX + this.entryX, this.baseY + this.entryY, 8, 40, -Math.PI / 2, Math.PI, 2);
      // The first two lane walkers are the fresh pair; everyone else waits inside.
      for (i = 0, k = 0; i < this.count; i++) {
        if (this.job[i] > TEND) { this.role[i] = 0; continue; }
        if (k < 2 && this.job[i] !== TEND) this.emerge(i, k++);
        else this.assume(i, WAIT_IN, 0);
      }
    } else if (c.opened && age >= CEREMONY_SECONDS) {
      // A refresh that arrived after the doors closed was held too.
      if (c.pending) {
        c.applying = true;
        this.update(c.pending);
      }
      for (i = 0, k = 0; i < this.count; i++) if (this.role[i] === WAIT_IN || this.role[i] === FILE_IN) this.emerge(i, Math.min(9, k++));
      this.ceremony = null;
    }
  };

  // Closing the colony ends every event at once; a held ascension snapshot is applied straight away.
  Habitat.prototype.endChances = function () {
    var seats = this.chanceSeats();
    var c = this.ceremony;
    this.chance = this.husk = this.flight = this.ceremony = null;
    if (c && c.pending) this.update(c.pending);
    else if (seats) this.reconcile();
  };

  Habitat.prototype.chanceDiagnostics = function () {
    var c = this.chance;
    var roles = {carrying: 0, hatching: 0, filing: 0, waiting: 0};
    for (var i = 0; i < this.count; i++) {
      var role = this.role[i];
      if (role === CARRY) roles.carrying++;
      else if (role === HATCH) roles.hatching++;
      else if (role === FILE_IN) roles.filing++;
      else if (role === WAIT_IN) roles.waiting++;
    }
    return {kind: c ? c.kind : '', art: c ? c.art : '', at: c ? [c.x, c.y] : null, bite: c ? c.bite : 0, carry: c ? c.carry : 0, leave: c ? c.leave : 0,
      catchable: this.chanceCatchable(), halo: this.haloClock === this.clock ? this.haloAt.slice() : null, husk: this.husk ? [this.husk.x, this.husk.y] : null, flight: this.flight ? {x: this.flight.x, y: this.flight.y, dir: this.flight.dir, lift: this.flight.lift} : null,
      ceremony: this.ceremony ? (this.ceremony.opened ? 'out' : 'in') : '', seats: this.chanceSeats(), carrying: roles.carrying, hatching: roles.hatching, filing: roles.filing, waiting: roles.waiting};
  };

  var icons = {};
  var iconOrder = [];
  var critters = root.RoachCritters;
  var critterSheet = null;
  // Lightness below which a pixel is outline, which a tint leaves alone.
  var TINT_OUTLINE = 24;

  // Atlas cells are true pixels drawn at whole-number scales. Sizes that divide the cell take the commonest colour
  // of each block, so pixels stay crisp; other smaller sizes average down and keep hard edges.
  function drawCritter(canvas, name, mirrored, tint, rank) {
    var cell = critterSheet && critters.icons[name];
    if (!cell) return false;
    var size = canvas.width, ctx = canvas.getContext('2d');
    var scale = Math.floor(size / cell.w), block = size < cell.w && cell.w % size === 0 ? cell.w / size : 0;
    var width = scale ? cell.w * scale : size, offset = Math.floor((size - width) / 2);
    if (mirrored) ctx.setTransform(-1, 0, 0, 1, size, 0);
    ctx.imageSmoothingEnabled = !scale && !block;
    if (block) ctx.drawImage(blockDown(cell, block), 0, 0);
    else ctx.drawImage(critterSheet, cell.x, cell.y, cell.w, cell.h, offset, offset, width, width);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if ((!scale && !block) || tint) {
      var image = ctx.getImageData(0, 0, size, size), data = image.data;
      if (!scale && !block) for (var i = 3; i < data.length; i += 4) data[i] = data[i] < 128 ? 0 : 255;
      if (tint) recolour(data, tint, rank, size);
      ctx.putImageData(image, 0, 0);
    }
    canvas.className = 'pixel-art';
    return true;
  }

  // A block is opaque when at least half its pixels are; its colour is the commonest one, and on a tie the one
  // nearest the block's average, so outlines neither swallow small icons nor vanish. Returns a canvas.
  function blockDown(cell, block) {
    var scratch = root.document.createElement('canvas');
    scratch.width = scratch.height = cell.w;
    var sctx = scratch.getContext('2d');
    sctx.drawImage(critterSheet, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
    var source = sctx.getImageData(0, 0, cell.w, cell.w).data, size = cell.w / block;
    var out = sctx.createImageData(size, size), data = out.data;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var counts = {}, keys = [], mean = [0, 0, 0], opaque = 0;
      for (var dy = 0; dy < block; dy++) for (var dx = 0; dx < block; dx++) {
        var at = ((y * block + dy) * cell.w + x * block + dx) * 4;
        if (source[at + 3] < 128) continue;
        var key = source[at] + ',' + source[at + 1] + ',' + source[at + 2];
        if (!counts[key]) keys.push(key);
        counts[key] = (counts[key] || 0) + 1;
        for (var c = 0; c < 3; c++) mean[c] += source[at + c];
        opaque++;
      }
      if (opaque * 2 < block * block) continue;
      var best = null, bestCount = 0, bestDistance = 0;
      for (var k = 0; k < keys.length; k++) {
        var rgb = keys[k].split(','), distance = 0;
        for (c = 0; c < 3; c++) distance += Math.abs(rgb[c] - mean[c] / opaque);
        if (counts[keys[k]] > bestCount || (counts[keys[k]] === bestCount && distance < bestDistance)) { best = rgb; bestCount = counts[keys[k]]; bestDistance = distance; }
      }
      var to = (y * size + x) * 4;
      data[to] = +best[0]; data[to + 1] = +best[1]; data[to + 2] = +best[2]; data[to + 3] = 255;
    }
    scratch.width = scratch.height = size;
    sctx.putImageData(out, 0, 0);
    return scratch;
  }

  // Numbered tiers share one drawing in a different body colour. Each lit pixel keeps its shading relative to the
  // icon's median lit pixel, which becomes the body colour; highlights lift part way to white and the near-black
  // outline stays as drawn.
  function recolour(data, tint, rankOrId, width) {
    var body = [parseInt(tint.slice(1, 3), 16), parseInt(tint.slice(3, 5), 16), parseInt(tint.slice(5, 7), 16)];
    // The tier tints are vivid; blend them halfway toward their grey and a warm soil brown so late tiers stay grounded.
    var grey = body[0] * 0.3 + body[1] * 0.59 + body[2] * 0.11;
    body = body.map(function (v, k) { return Math.round(v * 0.5 + grey * 0.3 + [118, 94, 70][k] * 0.2); });
    var lit = [];
    for (var i = 0; i < data.length; i += 4) {
      var light = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (data[i + 3] && light >= TINT_OUTLINE) lit.push(light);
    }
    if (!lit.length) return;
    lit.sort(function (a, b) { return a - b; });
    var median = lit[lit.length >> 1], top = Math.max(median + 1, lit[lit.length - 1]);
    for (var j = 0; j < data.length; j += 4) {
      var shade = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
      if (!data[j + 3] || shade < TINT_OUTLINE) continue;
      for (var c = 0; c < 3; c++) {
        data[j + c] = shade <= median ? Math.round(body[c] * shade / median) : Math.round(body[c] + (255 - body[c]) * 0.5 * (shade - median) / (top - median));
      }
    }
    var rank = typeof rankOrId === 'number' ? rankOrId : 0;
    if (!rank) {
      var ranked = /^(?:pantheon|overmind)([2-6])$/.exec(rankOrId || '');
      if (ranked) rank = +ranked[1];
    }
    if (rank >= 2) paintShellPips(data, width || Math.round(Math.sqrt(data.length / 4)), rank);
  }

  // Numbered pantheon and overmind shells carry rank bone-gold pips. Only pixels that are already fully opaque are
  // recoloured, so the alpha silhouette and the four quarter turns stay exact.
  function paintShellPips(data, width, rank) {
    if (rank < 2 || width < 2) return;
    var count = data.length >> 2;
    if (count % width) return;
    var height = count / width;
    var cell = height;
    var cells = width / cell;
    if (cells !== (cells | 0)) return;
    var gold = [244, 236, 212];
    for (var n = 0; n < cells; n++) {
      var xs = [], ys = [];
      var origin = n * cell;
      var y, x;
      for (y = 0; y < height; y++) {
        var row = y * width;
        for (x = 0; x < cell; x++) {
          var at = (row + origin + x) * 4;
          if (data[at + 3] !== 255) continue;
          var shade = data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
          if (shade < TINT_OUTLINE) continue;
          xs.push(x);
          ys.push(y);
        }
      }
      if (xs.length < 4) continue;
      xs.sort(function (a, b) { return a - b; });
      ys.sort(function (a, b) { return a - b; });
      var cx = xs[xs.length >> 1];
      var cy = ys[ys.length >> 1];
      var shell = xs[xs.length - 1] - xs[0] + 1;
      var pipW = shell >= rank * 3 ? 2 : 1;
      var pipH = 2;
      var span = rank * pipW + (rank - 1);
      var startX = cx - (span >> 1);
      var startY = cy - 1;
      for (var p = 0; p < rank; p++) {
        var px = startX + p * (pipW + 1);
        for (var dy = 0; dy < pipH; dy++) {
          for (var dx = 0; dx < pipW; dx++) {
            var xx = px + dx;
            var yy = startY + dy;
            if (xx < 0 || yy < 0 || xx >= cell || yy >= height) continue;
            var idx = (yy * width + origin + xx) * 4;
            if (data[idx + 3] !== 255) continue;
            data[idx] = gold[0];
            data[idx + 1] = gold[1];
            data[idx + 2] = gold[2];
          }
        }
      }
    }
  }

  // Twin, faster and empower rows name a unit. The picture is that unit, plus a corner mark,
  // so the list is not a run of the same eggs and the same leg.
  function upgradeUnit(id) {
    var mark = /(?:twin|prod|empower)$/.exec(id);
    if (!mark) return null;
    var unit = id.slice(0, id.length - mark[0].length);
    if (!SPECIES[unit] && !(critters && critters.units && critters.units[unit])) return null;
    return {unit: unit, mark: mark[0]};
  }

  function drawUnitBody(canvas, id) {
    var size = canvas.width;
    var ctx = canvas.getContext('2d');
    var ranked = /^(?:pantheon|overmind)([2-6])$/.exec(id);
    if (critters && critters.units[id] && drawCritter(canvas, critters.units[id], false, critters.tints && critters.tints[id], ranked ? +ranked[1] : id)) return;
    ctx.setTransform(size / 96, 0, 0, size / 96, size / 2, size / 2);
    paint(ctx, SPECIES[id] || SPECIES.drone, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // A 7-wide pixel mark on a dark plate: 2 for a twin, a chevron for faster output, a spark for empower.
  function paintUpgradeBadge(ctx, size, mark) {
    var glyphs = {
      twin: ['1111110', '0000010', '0000010', '1111110', '1000000', '1000000', '1111110'],
      prod: ['1000000', '1100000', '1110000', '1111000', '1110000', '1100000', '1000000'],
      empower: ['0001000', '0011100', '0111110', '1111111', '0111110', '0011100', '0001000']
    };
    var rows = glyphs[mark];
    if (!rows) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var s = size >= 48 ? 2 : 1;
    var gw = rows[0].length * s;
    var gh = rows.length * s;
    var pad = s * 2;
    var plateW = gw + pad * 2;
    var plateH = gh + pad * 2;
    var x0 = size - plateW - s;
    var y0 = size - plateH - s;
    ctx.fillStyle = '#1c120c';
    ctx.fillRect(x0, y0, plateW, plateH);
    ctx.fillStyle = '#c4883a';
    ctx.fillRect(x0, y0, plateW, s);
    ctx.fillRect(x0, y0 + plateH - s, plateW, s);
    ctx.fillRect(x0, y0, s, plateH);
    ctx.fillRect(x0 + plateW - s, y0, s, plateH);
    ctx.fillStyle = '#f2d48a';
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        if (rows[r].charAt(c) === '1') ctx.fillRect(x0 + pad + c * s, y0 + pad + r * s, s, s);
      }
    }
  }

  // Keys are unit@size for unit icons, unit+mark@size for a twin, faster or empower upgrade,
  // and #slug@size, with a trailing < when mirrored, for any atlas icon.
  function drawIcon(canvas, key) {
    var size = canvas.width, at = key.lastIndexOf('@');
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    canvas.className = '';
    if (key.charAt(0) === '#') return drawCritter(canvas, key.slice(1, at), key.charAt(key.length - 1) === '<');
    var plus = key.indexOf('+');
    if (plus > 0 && plus < at) {
      drawUnitBody(canvas, key.slice(0, plus));
      paintUpgradeBadge(ctx, size, key.slice(plus + 1, at));
      return;
    }
    drawUnitBody(canvas, key.slice(0, at));
  }

  // The critter atlas arrives asynchronously; until then unit icons are procedural and atlas icons blank, and
  // afterwards cached ones are repainted in place and listeners are told to copy them again.
  if (critters && root.Image) {
    var sheetImage = new root.Image();
    sheetImage.onload = function () {
      if (root.document && root.document.createElement) {
        var iconSheetCanvas = root.document.createElement('canvas');
        iconSheetCanvas.width = sheetImage.width;
        iconSheetCanvas.height = sheetImage.height;
        iconSheetCanvas.getContext('2d').drawImage(sheetImage, 0, 0);
        critterSheet = iconSheetCanvas;
      } else {
        critterSheet = sheetImage;
      }
      for (var key in icons) drawIcon(icons[key], key);
      if (typeof root.Event === 'function') root.dispatchEvent(new root.Event('roachcritters'));
    };
    sheetImage.src = critters.image;
  }

  if (root.RoachCreatures && root.Image) {
    var creatureImage = new root.Image();
    creatureImage.onload = function () {
      if (root.document && root.document.createElement) {
        var sheetCanvas = root.document.createElement('canvas');
        sheetCanvas.width = creatureImage.width;
        sheetCanvas.height = creatureImage.height;
        sheetCanvas.getContext('2d').drawImage(creatureImage, 0, 0);
        creatureSheet = sheetCanvas;
      } else {
        creatureSheet = creatureImage;
      }
      if (typeof root.Event === 'function') root.dispatchEvent(new root.Event('roachcreatures'));
    };
    creatureImage.src = root.RoachCreatures.image;
  }

  // True once the creature sheet has decoded and walkers can be baked.
  Habitat.creaturesReady = function () {
    return !!creatureSheet;
  };

  function cachedIcon(key, size) {
    if (icons[key]) return icons[key];
    var canvas = root.document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.setAttribute('aria-hidden', 'true');
    drawIcon(canvas, key);
    icons[key] = canvas;
    iconOrder.push(key);
    if (iconOrder.length > 64) delete icons[iconOrder.shift()];
    return canvas;
  }

  function iconSize(sizePx) {
    return Math.max(8, Math.min(128, Math.round(Number(sizePx) || 24)));
  }

  // Shared, cached DOM icon facing right. The same canvas is returned for a given id and size.
  Habitat.iconCanvas = function (unitId, sizePx) {
    var size = iconSize(sizePx);
    return cachedIcon((SPECIES[unitId] || (critters && critters.units[unitId]) ? unitId : 'drone') + '@' + size, size);
  };

  // Shared, cached icon for any atlas slug (RoachCritters.icons), facing right unless mirrored. Blank until the
  // atlas loads; the roachcritters event says when to copy it again.
  Habitat.critterCanvas = function (name, sizePx, mirrored) {
    var size = iconSize(sizePx);
    return cachedIcon('#' + name + '@' + size + (mirrored ? '<' : ''), size);
  };

  // Shared, cached icon for a game id of one kind: 'unit', 'resource', 'upgrade' or 'meta' (achievement, visitors,
  // nightShift, ascension, goldenRoach). Twin, faster and empower upgrades each get their unit's picture.
  // Other upgrades of one family share a canvas. Null when the id has no icon.
  Habitat.iconFor = function (kind, id, sizePx) {
    if (kind === 'unit') return Habitat.iconCanvas(id, sizePx);
    var size = iconSize(sizePx);
    if (kind === 'upgrade') {
      var marked = upgradeUnit(id);
      if (marked) return cachedIcon(marked.unit + '+' + marked.mark + '@' + size, size);
    }
    var map = critters && critters[kind === 'meta' ? 'meta' : kind + 's'];
    return map && map[id] ? Habitat.critterCanvas(map[id], sizePx) : null;
  };

  // The shared Red capsule at a whole-pixel scale, for the overlay's Catch chip.
  Habitat.redGlyph = function (scale) {
    return redGlyph(root.document, scale || RED_SCALE);
  };

  root.RoachHabitat = Habitat;
}(window));
