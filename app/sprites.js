/* Shared sprite and DOM icon facade. Exposes RoachSprites as a dedicated seam
   for UI, phone controller, and habitat callers while delegating to the active
   RoachHabitat icon and atlas implementation so test stubs on either global stay
   aligned. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachSprites = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function host() {
    return root && root.RoachHabitat ? root.RoachHabitat : null;
  }

  function iconCanvas(unitId, sizePx) {
    var h = host();
    return h && typeof h.iconCanvas === 'function' ? h.iconCanvas(unitId, sizePx) : null;
  }

  function critterCanvas(name, sizePx, mirrored) {
    var h = host();
    return h && typeof h.critterCanvas === 'function' ? h.critterCanvas(name, sizePx, mirrored) : null;
  }

  function iconFor(kind, id, sizePx) {
    var h = host();
    if (!h) return null;
    if (kind === 'unit') return typeof h.iconCanvas === 'function' ? h.iconCanvas(id, sizePx) : null;
    return typeof h.iconFor === 'function' ? h.iconFor(kind, id, sizePx) : null;
  }

  function redGlyph(scale) {
    var h = host();
    return h && typeof h.redGlyph === 'function' ? h.redGlyph(scale) : null;
  }

  function creaturesReady() {
    var h = host();
    return !!(h && typeof h.creaturesReady === 'function' && h.creaturesReady());
  }

  function slug(kind, id) {
    var critters = root && root.RoachCritters;
    var map = critters && critters[kind === 'meta' ? 'meta' : kind + 's'];
    return (map && map[id]) || '';
  }

  function copyIcon(document, kind, id, size) {
    var source = iconFor(kind, id, size);
    if (!source || !source.width) return null;
    var icon = document.createElement('canvas');
    icon.className = 'sprite-icon' + (source.className ? ' ' + source.className : '');
    icon.width = source.width;
    icon.height = source.height;
    icon.style.width = size + 'px';
    icon.style.height = size + 'px';
    icon.getContext('2d').drawImage(source, 0, 0);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  return {
    iconCanvas: iconCanvas,
    critterCanvas: critterCanvas,
    iconFor: iconFor,
    redGlyph: redGlyph,
    creaturesReady: creaturesReady,
    slug: slug,
    copyIcon: copyIcon
  };
}));
