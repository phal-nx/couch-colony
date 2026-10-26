/* A small shared particle pool for the habitat: dust, crumbs, embers, glints, fireflies and nest specks.
   Fixed struct-of-arrays storage, one pre-drawn sprite per kind and life frame, one integer blit per mote,
   and no canvas state changes, so a burst costs the same as a few roaches. */
(function (root) {
  'use strict';
  var MAX = 96;
  var FRAMES = 8;
  var DUST = 0, CRUMB = 1, FLECK = 2, EMBER = 3, SPORE = 4, GLINT = 5, CLOD = 6, FIREFLY = 7, SPECK = 8;
  // Per kind: life in seconds, gravity (px/s², negative rises), drag per second.
  var LIFE = [0.6, 0.7, 0.5, 1.1, 1.4, 0.7, 0.8, 3.2, 2.4];
  var GRAVITY = [-30, 260, 120, -40, -18, 0, 300, 0, 5];
  var DRAG = [3, 1, 2, 1.6, 1.2, 4, 1, 0.4, 0.3];
  // Admission share of the cap by priority: ambient, trail, event.
  var SHARE = [0.5, 0.75, 1];

  function Motes() {
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX);
    this.count = 0;
    this.cap = 64;
    this.emitted = 0;
    this.refused = 0;
    this.sheet = null;
    this.sx = 0;
    this.sy = 0;
    this.cell = 16;
  }

  // The sprites live in the creature sheet: one row per kind, FRAMES cells across its life.
  Motes.prototype.setSheet = function (image, x, y, cell) {
    this.sheet = image;
    this.sx = x;
    this.sy = y;
    this.cell = cell;
  };

  Motes.prototype.setCap = function (cap) {
    this.cap = Math.max(0, Math.min(MAX, cap | 0));
    while (this.count > this.cap) this.kill(this.count - 1);
  };

  // Emits up to count motes of a kind at (x, y), moving at about speed px/s within spread radians of angle.
  // Returns how many were admitted; ambient and trail motes leave room for events.
  Motes.prototype.emit = function (kind, x, y, count, speed, angle, spread, priority) {
    var room = Math.floor(this.cap * SHARE[priority === undefined ? 2 : priority]) - this.count;
    var n = Math.max(0, Math.min(count, room));
    this.refused += count - n;
    for (var k = 0; k < n; k++) {
      var i = this.count++;
      var a = angle + (Math.random() - 0.5) * spread;
      var v = speed * (0.6 + Math.random() * 0.6);
      this.x[i] = x + (Math.random() - 0.5) * 4;
      this.y[i] = y + (Math.random() - 0.5) * 4;
      this.vx[i] = Math.cos(a) * v;
      this.vy[i] = Math.sin(a) * v;
      this.age[i] = 0;
      this.life[i] = LIFE[kind] * (0.8 + Math.random() * 0.4);
      this.kind[i] = kind;
    }
    this.emitted += n;
    return n;
  };

  Motes.prototype.kill = function (i) {
    var last = --this.count;
    this.x[i] = this.x[last]; this.y[i] = this.y[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
    this.age[i] = this.age[last]; this.life[i] = this.life[last]; this.kind[i] = this.kind[last];
  };

  // Ages and moves every mote; any that end their life or drift into the centre of the picture are removed.
  Motes.prototype.step = function (dt, width, height) {
    var left = width * 0.2, right = width * 0.8, top = height * 0.2, bottom = height * 0.8;
    for (var i = this.count - 1; i >= 0; i--) {
      var kind = this.kind[i];
      this.age[i] += dt;
      var keep = 1 - Math.min(1, DRAG[kind] * dt);
      this.vx[i] *= keep;
      this.vy[i] = this.vy[i] * keep + GRAVITY[kind] * dt;
      if (kind === FIREFLY) { this.vx[i] += (Math.random() - 0.5) * 60 * dt; this.vy[i] += (Math.random() - 0.5) * 60 * dt; }
      var x = this.x[i] += this.vx[i] * dt;
      var y = this.y[i] += this.vy[i] * dt;
      var half = this.cell / 2;
      if (this.age[i] >= this.life[i] || (x + half > left && x - half < right && y + half > top && y - half < bottom)) this.kill(i);
    }
  };

  // dirty, when given, has touch(x, y, w, h) called with each blit's rectangle so its owner can clear just those.
  Motes.prototype.draw = function (ctx, dirty) {
    if (!this.sheet) return;
    var cell = this.cell;
    var half = cell / 2;
    for (var i = 0; i < this.count; i++) {
      var frame = Math.min(FRAMES - 1, (this.age[i] / this.life[i] * FRAMES) | 0);
      var x = (this.x[i] - half + 0.5) | 0;
      var y = (this.y[i] - half + 0.5) | 0;
      ctx.drawImage(this.sheet, this.sx + frame * cell, this.sy + this.kind[i] * cell, cell, cell, x, y, cell, cell);
      if (dirty) dirty.touch(x, y, cell, cell);
    }
  };

  Motes.prototype.clear = function () {
    this.count = 0;
  };

  Motes.prototype.stats = function () {
    var kinds = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < this.count; i++) kinds[this.kind[i]]++;
    return {live: this.count, cap: this.cap, max: MAX, emitted: this.emitted, refused: this.refused, kinds: kinds};
  };

  Motes.MAX = MAX;
  Motes.DUST = DUST; Motes.CRUMB = CRUMB; Motes.FLECK = FLECK; Motes.EMBER = EMBER;
  Motes.SPORE = SPORE; Motes.GLINT = GLINT; Motes.CLOD = CLOD; Motes.FIREFLY = FIREFLY; Motes.SPECK = SPECK;
  root.RoachMotes = Motes;
}(window));
