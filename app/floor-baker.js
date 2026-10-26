/* Floor, ground-mark, and top-down base painting helpers for the habitat.
   Exposes RoachFloorBaker while remaining optional so standalone habitat test
   harnesses that only load habitat.js continue to work unchanged. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachFloorBaker = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAU = Math.PI * 2;
  var OUTLINE = '#32261d';
  var CRUMB_COLORS = ['#ead198', '#d9b26a', '#f2dfae', '#c99a55', '#e4c27e'];
  var SOIL_COLORS = ['rgba(150,112,70,.42)', 'rgba(118,86,54,.4)', 'rgba(176,140,96,.36)', 'rgba(96,70,46,.38)'];
  var PROP_MARKS = {burrow: 1, pile: 1, claim: 1, tufts: 1, soil: 1, crumbs: 1};

  function oval(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }

  function dot(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function fill(ctx, color, outline) {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = outline || 2.6;
    ctx.stroke();
  }

  function line(ctx, color, width) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = width + 2.1;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

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
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  function crumb(ctx, x, y, size, rand) {
    chip(ctx, x, y, size, CRUMB_COLORS[rand() * CRUMB_COLORS.length | 0], 'rgba(74,52,26,.55)', rand);
  }

  function paintProp(ctx, kind, level, rand, drawProp) {
    var i, angle;
    if (kind === 'burrow') {
      for (i = 0; i < 6 + level; i++) {
        angle = rand() * TAU;
        chip(ctx, Math.cos(angle) * (9 + rand() * 4), Math.sin(angle) * (7 + rand() * 3), 0.8 + rand() * 1.2, SOIL_COLORS[rand() * 4 | 0], '', rand);
      }
      drawProp(ctx, rand() < 0.5 ? 'burrow-hole-1' : 'burrow-hole-2', 0, 0);
    } else if (kind === 'pile') {
      drawProp(ctx, level > 8 ? 'crumb-pile-large' : level > 4 ? 'crumb-pile-medium' : 'crumb-pile-small', 0, 0);
    } else if (kind === 'tufts') {
      var chips = 2 + (rand() * 2 | 0);
      for (i = 0; i < chips; i++) chip(ctx, (rand() - 0.5) * 10, (rand() - 0.5) * 4, 0.55 + rand() * 0.5, SOIL_COLORS[rand() * 4 | 0], '', rand);
      var tufts = 1 + (rand() * 2 | 0);
      for (i = 0; i < tufts; i++) drawProp(ctx, 'grass-tuft-' + (1 + (rand() * 3 | 0)), (rand() - 0.5) * 10, (rand() - 0.5) * 4);
    } else if (kind === 'soil') {
      var clods = 3 + (rand() * 3 | 0);
      for (i = 0; i < clods; i++) chip(ctx, (rand() - 0.5) * 12, (rand() - 0.5) * 4, 0.7 + rand() * 1.1, SOIL_COLORS[rand() * 4 | 0], '', rand);
      drawProp(ctx, rand() < 0.5 ? 'soil-clod-1' : 'soil-clod-2', (rand() - 0.5) * 12, (rand() - 0.5) * 4);
    } else if (kind === 'crumbs') {
      var bits = 3 + (rand() * 3 | 0);
      for (i = 0; i < bits; i++) crumb(ctx, (rand() - 0.5) * 14, (rand() - 0.5) * 4, 0.7 + rand() * 0.9, rand);
      bits = 1 + (rand() * 2 | 0);
      for (i = 0; i < bits; i++) drawProp(ctx, 'crumb-' + (1 + (rand() * 4 | 0)), (rand() - 0.5) * 14, (rand() - 0.5) * 4);
    } else if (kind === 'claim') {
      for (i = 0; i < 4; i++) chip(ctx, (rand() - 0.5) * 12, 6 + rand() * 3, 1 + rand(), SOIL_COLORS[rand() * 4 | 0], '', rand);
      drawProp(ctx, 'territory-claim-post', 0, -2);
    }
  }

  function paintMark(ctx, kind, length, thickness, level, rand) {
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
      oval(ctx, x, y, hole, hole * 0.72, rand() - 0.5);
      ctx.fillStyle = 'rgba(26,17,10,.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(176,136,88,.4)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y, hole + 1.2, hole * 0.72 + 1, 0, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
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
      for (i = 0; i < 7; i++) chip(ctx, (rand() - 0.5) * 9, 3 + (rand() - 0.5) * 6, 1.4 + rand() * 1.4, SOIL_COLORS[rand() * 4 | 0], 'rgba(60,44,28,.5)', rand);
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -9); line(ctx, '#bfa77a', 1.2);
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, -7); ctx.lineTo(0, -5); ctx.closePath(); fill(ctx, 'rgba(170,112,60,.85)', 1);
    } else if (kind === 'crumbs') {
      for (i = 4 + level + (rand() * 4 | 0); i > 0; i--) crumb(ctx, (rand() - 0.5) * length, (rand() + rand() - 1) * side, 0.9 + rand() * 1.6, rand);
    } else {
      oval(ctx, 0, 1, side * 0.9, side * 0.6);
      ctx.fillStyle = 'rgba(28,18,10,.22)';
      ctx.fill();
      for (i = 8 + level * 3; i > 0; i--) {
        var spread = Math.sqrt(rand());
        angle = rand() * TAU;
        crumb(ctx, Math.cos(angle) * spread * side * 0.8, Math.sin(angle) * spread * side * 0.55, 1 + (1 - spread) * 1.8 + rand(), rand);
      }
    }
  }

  return {
    PROP_MARKS: PROP_MARKS,
    chip: chip,
    crumb: crumb,
    paintProp: paintProp,
    paintMark: paintMark
  };
}));
