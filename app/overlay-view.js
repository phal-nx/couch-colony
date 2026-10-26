/* Overlay DOM primitives, pixel-segmented progress bars, 3x5 pixel text
   renderer, UI moments (flash, stopFlash, magnitudeRank), and pixel icon
   builders. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachOverlayView = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var GLYPHS = {
    '0': '111101101101111',
    '1': '010110010010111',
    '2': '111001111100111',
    '3': '111001111001111',
    '4': '101101111001001',
    '5': '111100111001111',
    '6': '111100111101111',
    '7': '111001001001001',
    '8': '111101111101111',
    '9': '111101111001111',
    '+': '000010111010000',
    '.': '000000000000010',
    'K': '101101110101101',
    'M': '101111111101101',
    'B': '110101110101110',
    'T': '111010010010010',
    'e': '000111111100111',
    '?': '111001011000010'
  };

  function node(tag, className, textContent, doc) {
    doc = doc || (root && root.document);
    var element = doc.createElement(tag);
    if (className) element.className = className;
    if (textContent !== undefined) element.textContent = textContent;
    return element;
  }

  function text(element, value) {
    value = String(value === undefined ? '' : value);
    if (element.textContent !== value) element.textContent = value;
  }

  function childWith(container, name, value) {
    for (var i = 0; i < container.children.length; i++) {
      if (container.children[i].getAttribute(name) === value) return container.children[i];
    }
    return null;
  }

  function segmentBar(className, segments, doc) {
    var bar = node('div', 'pixel-bar ' + className, undefined, doc);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    for (var i = 0; i < (segments || 10); i++) bar.appendChild(node('i', undefined, undefined, doc));
    return bar;
  }

  function setSegments(bar, fraction) {
    bar.hidden = fraction === null;
    if (fraction === null) return;
    var percent = String(Math.max(0, Math.min(100, Math.floor(fraction * 100 + 1e-6))));
    if (bar.getAttribute('aria-valuenow') === percent) return;
    bar.setAttribute('aria-valuenow', percent);
    var lit = Math.floor(Number(percent) * bar.children.length / 100);
    Array.prototype.forEach.call(bar.children, function (segment, index) {
      segment.className = index < lit ? 'on' : '';
    });
  }

  function pixelText(canvas, value) {
    var chars = String(value).split('').filter(function (c) { return GLYPHS[c]; });
    canvas.width = chars.length * 4 + 1;
    canvas.height = 7;
    canvas.style.width = canvas.width * 3 + 'px';
    canvas.style.height = '21px';
    canvas.style.marginRight = -canvas.width * 3 / 2 + 'px';
    var context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    ['rgba(20,16,10,.9)', '#f3dfa6'].forEach(function (color, layer) {
      context.fillStyle = color;
      chars.forEach(function (c, index) {
        for (var bit = 0; bit < 15; bit++) {
          if (GLYPHS[c].charAt(bit) !== '1') continue;
          var x = 1 + index * 4 + bit % 3, y = 1 + Math.floor(bit / 3);
          if (layer) context.fillRect(x, y, 1, 1);
          else context.fillRect(x - 1, y - 1, 3, 3);
        }
      });
    });
  }

  function magnitudeRank(value) {
    var match = /(?:e(\d+)|([KMBT]))$/.exec(value);
    if (!match) return 0;
    return match[1] ? 5 + Math.floor(Number(match[1]) / 10) : 'KMBT'.indexOf(match[2]) + 1;
  }

  function createFlashTracker(doc) {
    var flashed = [];

    function flash(element, name) {
      if (!element) return;
      var ownerDoc = doc || element.ownerDocument || (root && root.document);
      if (!element.flashes) {
        element.flashes = {};
        if (flashed.length >= 64 && ownerDoc && ownerDoc.body) {
          flashed = flashed.filter(function (each) { return ownerDoc.body.contains(each); });
        }
        flashed.push(element);
        element.addEventListener('animationend', function (event) {
          Object.keys(element.flashes).forEach(function (key) {
            if (event.animationName.indexOf(key) === 0) element.classList.remove(key + '-a', key + '-b');
          });
        });
      }
      element.flashes[name] = true;
      var first = !element.classList.contains(name + '-a');
      element.classList.remove(name + (first ? '-b' : '-a'));
      element.classList.add(name + (first ? '-a' : '-b'));
    }

    function stopFlash(element) {
      if (element && element.flashes) {
        Object.keys(element.flashes).forEach(function (key) {
          element.classList.remove(key + '-a', key + '-b');
        });
      }
    }

    function stopAll() {
      var ownerDoc = doc || (root && root.document);
      flashed = flashed.filter(function (element) {
        stopFlash(element);
        return !!(ownerDoc && ownerDoc.body && ownerDoc.body.contains(element));
      });
    }

    return {
      flash: flash,
      stopFlash: stopFlash,
      stopAll: stopAll
    };
  }

  function pixelIcon(kind, id, size, doc) {
    doc = doc || (root && root.document);
    var sprites = root && root.RoachSprites;
    if (sprites && sprites.copyIcon) {
      var copied = sprites.copyIcon(doc, kind, id, size);
      if (copied) return copied;
    }
    var habitatClass = root && root.RoachHabitat;
    var source = !habitatClass ? null : kind === 'unit' ? habitatClass.iconCanvas && habitatClass.iconCanvas(id, size) : habitatClass.iconFor && habitatClass.iconFor(kind, id, size);
    if (!source || !source.width) return null;
    var icon = node('canvas', 'sprite-icon' + (source.className ? ' ' + source.className : ''), undefined, doc);
    icon.width = source.width;
    icon.height = source.height;
    icon.style.width = size + 'px';
    icon.style.height = size + 'px';
    icon.getContext('2d').drawImage(source, 0, 0);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function unitIcon(id, size, doc) {
    var icon = pixelIcon('unit', id, size, doc);
    if (icon) return icon;
    var dot = node('span', 'item-icon role-' + id, undefined, doc);
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  }

  return {
    GLYPHS: GLYPHS,
    node: node,
    text: text,
    childWith: childWith,
    segmentBar: segmentBar,
    setSegments: setSegments,
    pixelText: pixelText,
    magnitudeRank: magnitudeRank,
    createFlashTracker: createFlashTracker,
    pixelIcon: pixelIcon,
    unitIcon: unitIcon
  };
}));
