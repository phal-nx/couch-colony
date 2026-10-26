/* Nest artwork: a pixel-art cutaway, six stages from a crack to a salvage citadel, dressed with upgrade overlays. */
(function (root) {
  'use strict';
  var art = root.RoachNestSprites;
  var WIDTH = art.width;
  var HEIGHT = art.height;
  // Upgrade steps at which a bigger egg or crumb overlay replaces the smaller one, and the annex appears.
  var SIZES = [[9, 'large'], [5, 'medium'], [1, 'small']];
  var ANNEX = 3;
  var MUTATION = 'rgba(80,96,52,';
  // Luminance of the pennant cloth's brightest shade (#b94d20), which maps to the full unit colour.
  var CLOTH_LIGHT = 0.3 * 185 + 0.59 * 77 + 0.11 * 32;

  // Decoded bitmaps by name. Only the stage on show is kept, plus the small overlays it has needed.
  var images = {};
  var shown = -1;
  var flags = {};
  var revision = 0;

  function whole(value, high) {
    value = Math.round(Number(value) || 0);
    return value < 0 ? 0 : value > high ? high : value;
  }

  function normalize(state) {
    state = state || {};
    return {
      stage: whole(state.stage, 5),
      hatchery: whole(state.hatchery, 12),
      expansion: whole(state.expansion, 12),
      nexus: whole(state.nexus, 5),
      mutation: whole(state.mutation, 3),
      crumbs: whole(state.crumbs, 12),
      night: !!state.night,
      pennants: (state.pennants || []).slice(0, 10).map(function (pennant) {
        return /^#[0-9a-f]{6}$/i.test(pennant && pennant.color) ? pennant.color : '#8c7a5c';
      })
    };
  }

  // Whole multiples of the native art keep every pixel square; below about 0.6 the nest is drawn at half size.
  function factor(scale) {
    scale = Number(scale) || 1;
    return scale < 0.6 ? 0.5 : Math.max(1, Math.round(scale));
  }

  function changed() {
    revision++;
    if (typeof root.Event === 'function') root.dispatchEvent(new root.Event('roachnest'));
  }

  // Images decode asynchronously; until one is ready it is skipped, and the roachnest event asks for a re-bake.
  function image(name, url) {
    var entry = images[name];
    if (!entry) {
      entry = images[name] = {image: new root.Image(), ready: false};
      entry.image.onload = function () {
        if (images[name] !== entry) return;
        entry.ready = true;
        if (name.charAt(0) === '#') {
          for (var other in images) if (other !== name && other.charAt(0) === '#') delete images[other];
          shown = Number(name.slice(1));
        }
        changed();
      };
      entry.image.src = url;
    }
    return entry.ready ? entry.image : null;
  }

  // The requested stage once it has decoded; until then the previous one stays up.
  function stage(index) {
    image('#' + index, art.stages[index]);
    return images['#' + shown] && images['#' + shown].ready ? shown : -1;
  }

  function size(group, step) {
    for (var i = 0; i < SIZES.length; i++) if (step >= SIZES[i][0]) return group + '-' + SIZES[i][1];
    return '';
  }

  // Overlays sit at their stage-4 registration plus the per-stage offset from art/nest/layout.json.
  function place(ctx, name, offset, picture) {
    var o = art.overlays[name];
    picture = picture || image(name, o.image);
    if (picture) ctx.drawImage(picture, o.x + offset[0], o.y + offset[1]);
  }

  function glow(ctx, o, offset) {
    var x = o.x + offset[0] + o.w / 2, y = o.y + offset[1] + o.h / 2, r = Math.max(o.w, o.h) * 1.4;
    var bloom = ctx.createRadialGradient(x, y, 0, x, y, r);
    bloom.addColorStop(0, 'rgba(255,176,72,.55)');
    bloom.addColorStop(1, 'rgba(255,160,56,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Unit colours are vivid; banners pull them toward the soil palette so they read as dyed cloth.
  function muted(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [n >> 16 & 255, n >> 8 & 255, n & 255];
    var grey = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    var earth = [120, 96, 70];
    return c.map(function (v, i) { return v * 0.58 + grey * 0.17 + earth[i] * 0.25; });
  }

  // The pennant's cloth, right of its pole, takes the unit colour at the shade of each original pixel.
  function flag(hex) {
    if (flags[hex]) return flags[hex];
    var o = art.overlays.pennant;
    var picture = image('pennant', o.image);
    if (!picture) return null;
    var canvas = root.document.createElement('canvas');
    canvas.width = o.w;
    canvas.height = o.h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(picture, 0, 0);
    var pixels = ctx.getImageData(0, 0, o.w, o.h);
    var data = pixels.data;
    var colour = muted(hex);
    for (var y = 0; y < o.h; y++) {
      for (var x = o.cloth; x < o.w; x++) {
        var i = (y * o.w + x) * 4;
        var light = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
        // The near-black outline stays as drawn.
        if (!data[i + 3] || light < 12) continue;
        var shade = Math.min(1.25, light / CLOTH_LIGHT);
        for (var k = 0; k < 3; k++) data[i + k] = Math.min(255, Math.round(colour[k] * shade));
      }
    }
    ctx.putImageData(pixels, 0, 0);
    if (Object.keys(flags).length >= 16) flags = {};
    flags[hex] = canvas;
    return canvas;
  }

  // A soft dark halo cast from the finished silhouette keeps the nest legible over bright and dark footage.
  function halo(ctx, canvas, k) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.shadowColor = 'rgba(0,0,0,.72)';
    ctx.shadowBlur = 8 * k;
    ctx.shadowOffsetX = canvas.width + 40;
    ctx.shadowOffsetY = 2 * k;
    ctx.drawImage(canvas, -canvas.width - 40, 0);
    ctx.restore();
  }

  var SPORE_COLORS = ['#8fae6b', '#c8f09a', '#d3a256'];
  // Fixed offsets so spore rings stay identical across bakes. Scaled by chamber size and mutation.
  var SPORE_RING = [[2, 0], [-2, 1], [1, -2], [-1, 2], [3, 1], [-3, -1], [0, 3], [2, -3], [-2, -2], [4, 0], [0, -4], [3, 3], [-4, 2], [1, 4], [-3, 3]];

  // A 1px vein of hard pixels. source-atop keeps every dot inside the stage's existing silhouette.
  function sporeVein(ctx, x0, y0, x1, y1, color) {
    ctx.fillStyle = color;
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    var guard = dx + dy + 2;
    while (guard--) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) return;
      var e2 = err << 1;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  function paintSpores(ctx, index, mutation) {
    var traced = art.paths[index];
    if (!traced || !traced.chambers) return;
    var chambers = traced.chambers;
    for (var c = 0; c < chambers.length; c++) {
      var chamber = chambers[c];
      var n = 4 + mutation * 2;
      var shift = [0, 1, -1][mutation - 1] || 0;
      ctx.fillStyle = SPORE_COLORS[mutation % 3];
      ctx.fillRect(Math.round(chamber.x) + shift, Math.round(chamber.y), mutation % 2 ? 2 : 1, mutation > 1 ? 2 : 1);
      for (var i = 0; i < n; i++) {
        var spot = SPORE_RING[(i + c * 3) % SPORE_RING.length];
        var reach = 2 + chamber.r * (0.22 + 0.14 * mutation) + (i % 3);
        var x = Math.round(chamber.x + spot[0] * reach / 4);
        var y = Math.round(chamber.y + spot[1] * reach / 4);
        var size = (i + mutation) % 3 === 0 ? 2 : 1;
        var color = SPORE_COLORS[(i + mutation + c) % 3];
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
        if (i % 2 === 0) sporeVein(ctx, chamber.x, chamber.y, x, y, SPORE_COLORS[(c + i) % 3]);
      }
    }
  }

  function bake(state, scale) {
    var s = normalize(state);
    var k = factor(scale);
    var canvas = root.document.createElement('canvas');
    canvas.width = Math.round(WIDTH * k);
    canvas.height = Math.round(HEIGHT * k);
    var index = stage(s.stage);
    if (index < 0) return canvas;
    var a = art.anchors[index];
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = k < 1;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (s.expansion >= ANNEX && a.annex) place(ctx, 'side-tunnel-annex', a.annex);
    ctx.drawImage(images['#' + index].image, 0, 0);
    if (s.mutation) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = MUTATION + 0.07 * s.mutation + ')';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      paintSpores(ctx, index, s.mutation);
      ctx.globalCompositeOperation = 'source-over';
    }
    var eggs = size('eggs', s.hatchery);
    var crumbs = size('crumbs', s.crumbs);
    if (eggs && a.eggs) place(ctx, eggs, a.eggs);
    if (crumbs && a.crumbs) place(ctx, crumbs, a.crumbs);
    for (var i = 0; i < Math.min(s.nexus, a.nexus.length); i++) {
      // The night shift warms each nexus with a soft amber bloom behind the resin; baked once per boundary.
      if (s.night) glow(ctx, art.overlays.nexus, a.nexus[i]);
      place(ctx, 'nexus', a.nexus[i]);
    }
    for (i = 0; i < Math.min(s.pennants.length, a.pennant.length); i++) {
      var cloth = flag(s.pennants[i]);
      if (cloth) place(ctx, 'pennant', a.pennant[i], cloth);
    }
    halo(ctx, canvas, k);
    return canvas;
  }

  // Walkable interior for the nest-life layer, in the baked canvas's pixels. tunnels[i] runs from the entrance to
  // chambers[i]; a chamber's kind names the overlay standing in it, or plain when that overlay is not shown.
  function paths(state, scale) {
    var s = normalize(state);
    var k = factor(scale);
    var index = stage(s.stage);
    var traced = art.paths[index < 0 ? s.stage : index];
    var a = art.anchors[index < 0 ? s.stage : index];
    var visible = {egg: s.hatchery > 0 && !!a.eggs, crumb: s.crumbs > 0 && !!a.crumbs, nexus: s.nexus > 0};
    function at(p) { return [p[0] * k, p[1] * k]; }
    return {
      tunnels: traced.tunnels.map(function (walk) { return walk.map(at); }),
      chambers: traced.chambers.map(function (c) {
        return {x: c.x * k, y: c.y * k, r: c.r * k, kind: visible[c.kind] ? c.kind : 'plain'};
      }),
      entrance: {x: traced.entrance[0] * k, y: traced.entrance[1] * k}
    };
  }

  // True once every bitmap the state shows has decoded, so a bake is final.
  function ready(state) {
    var s = normalize(state);
    bake(s, 1);
    if (shown !== s.stage) return false;
    for (var name in images) if (!images[name].ready) return false;
    return true;
  }

  // Bytes held by decoded bitmaps and tinted pennants, for memory diagnostics.
  function decoded() {
    var bytes = 0;
    var names = [];
    for (var name in images) {
      if (!images[name].ready) continue;
      names.push(name);
      bytes += images[name].image.width * images[name].image.height * 4;
    }
    for (var hex in flags) bytes += flags[hex].width * flags[hex].height * 4;
    return {names: names.sort(), bytes: bytes, revision: revision};
  }

  root.RoachNestArt = {
    bake: bake,
    paths: paths,
    ready: ready,
    decoded: decoded,
    size: function (scale) {
      var k = factor(scale);
      return {width: Math.round(WIDTH * k), height: Math.round(HEIGHT * k)};
    },
    // The painted soil ends at y=205 of the 230-tall stage. The rest of the bitmap is empty margin.
    ground: function (scale) {
      var k = factor(scale);
      return Math.round(205 * k);
    },
    // The hole moves a little between stages; without a state this is the stage-4 hole.
    entrance: function (scale, state) {
      var k = factor(scale);
      var hole = art.anchors[state ? normalize(state).stage : 3].entrance;
      return {x: Math.round(hole[0] * k), y: Math.round(hole[1] * k)};
    }
  };
}(window));
