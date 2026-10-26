/* TV shell: webOS PalmSystem window focus (needFocus pulse/release), spatial
   D-pad navigation (nearestLine, move), burn-in pixel shift and idle dimming,
   and corner placement. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachTvShell = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var CORNERS = ['top-right', 'top-left', 'bottom-left', 'bottom-right'];
  var SHIFTS = [[0, 0], [-4, -3], [3, -5], [-6, 2], [5, 3], [-2, -6]];
  var QUIET_SHIFTS = [[0, 0], [-12, -8], [10, -12], [-8, 12], [12, 6], [-6, -12]];

  function parseParams(input) {
    try {
      var value = typeof input === 'string' ? JSON.parse(input) : input;
      return value && typeof value === 'object' ? (value.params || value) : {};
    } catch (error) { return {}; }
  }

  function center(element) {
    var rect = element.getBoundingClientRect();
    return {
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right
    };
  }

  // Remote arrows move between visual lines. A line is every control whose
  // center sits within a few pixels of the nearest one in that direction.
  function nearestLine(choices, y, forward, x) {
    var spots = choices.map(function (choice) {
      var spot = center(choice);
      spot.element = choice;
      spot.distance = forward ? spot.y - y : y - spot.y;
      return spot;
    }).filter(function (spot) { return spot.distance > 8; });
    var closest = Math.min.apply(Math, spots.map(function (spot) { return spot.distance; }));
    var best = null;
    spots.forEach(function (spot) {
      if (spot.distance <= closest + 12 && (!best || Math.abs(spot.x - x) < Math.abs(best.x - x))) best = spot;
    });
    return best && best.element;
  }

  function focusKey(doc) {
    doc = doc || (root && root.document);
    return doc && doc.activeElement && doc.activeElement.getAttribute('data-focus');
  }

  function focusByKey(panel, key, doc) {
    if (!key || !panel) return false;
    doc = doc || panel.ownerDocument || (root && root.document);
    var active = doc && doc.activeElement;
    if (active && active.getAttribute('data-focus') === key && !active.disabled) return true;
    var target = panel.querySelector('[data-focus="' + key + '"]');
    if (target && !target.disabled && target.offsetWidth) {
      target.focus();
      return true;
    }
    return false;
  }

  function navigable(scope) {
    if (!scope) return [];
    return Array.prototype.filter.call(scope.querySelectorAll('button, textarea'), function (button) {
      return !button.disabled && button.offsetWidth && button.offsetHeight;
    });
  }

  function itemRole(element) {
    var roles = ['buy', 'auto-toggle', 'details'];
    if (!element || !element.classList) return '';
    for (var i = 0; i < roles.length; i++) {
      if (element.classList.contains(roles[i])) return roles[i];
    }
    return '';
  }

  function itemRow(element, itemsEl) {
    var node = element;
    while (node && node.parentElement !== itemsEl) node = node.parentElement;
    return node;
  }

  // Scroll #tabs only when the button sits outside the visible window.
  function scrollTabIntoView(button) {
    if (!button) return;
    var tabs = button.parentElement;
    while (tabs && tabs.id !== 'tabs') tabs = tabs.parentElement;
    if (!tabs) return;
    var tabsBox = tabs.getBoundingClientRect();
    var buttonBox = button.getBoundingClientRect();
    if (buttonBox.left < tabsBox.left - 1) tabs.scrollLeft -= tabsBox.left - buttonBox.left;
    else if (buttonBox.right > tabsBox.right + 1) tabs.scrollLeft += buttonBox.right - tabsBox.right;
  }

  function createFocusController(options) {
    var panel = options.panel;
    var el = options.el;
    var getView = options.getView;
    var onTurnPage = options.onTurnPage;
    var column = null;

    function primaryFocus() {
      if (!el('dialog').hidden) { focusByKey(panel, 'dialog-cancel'); return; }
      var view = getView();
      var section = el({units: 'items', upgrades: 'items', evolution: 'evolution', more: 'colony-settings'}[view]);
      var choices = navigable(section);
      var buy = section.querySelector('.buy');
      (buy || choices[0] || el('menu-views').querySelector('.active')).focus();
    }

    function move(code) {
      var scope = el('dialog').hidden ? el('menu') : el('dialog');
      var choices = navigable(scope);
      var doc = panel.ownerDocument;
      var current = doc.activeElement;
      if (choices.indexOf(current) === -1) { primaryFocus(); return; }
      var settingsEl = el('colony-settings');
      var journal = el('show-journal');
      if (journal && current === journal && settingsEl && settingsEl.classList.contains('listing')) {
        var pages = el('pagination');
        if ((code === 37 || code === 39) && pages && !pages.hidden) { onTurnPage(code === 39 ? 1 : -1); return; }
        if (code === 38 && pages && !pages.hidden && el('previous') && !el('previous').disabled) { onTurnPage(-1); return; }
      }
      var from = center(current);
      var target = null;
      var toolsEl = el('list-tools');
      if (code === 38 || code === 40) {
        if (!column || column.element !== current) column = {x: from.x, role: itemRole(current)};
        var itemsEl = el('items');
        var fromItems = !!(itemsEl && itemsEl.contains(current));
        target = nearestLine(choices, from.y, code === 40, column.x);
        if (!target && code === 40 && el('dialog').hidden) { onTurnPage(1); return; }
        if (target) {
          var viewsEl = el('menu-views');
          var paginationEl = el('pagination');
          if (code === 40 && itemsEl && !fromItems && itemsEl.contains(target)) {
            var enterRow = itemRow(target, itemsEl);
            var buy = enterRow && enterRow.querySelector('.buy');
            if (buy) {
              target = buy;
              column.x = center(buy).x;
              column.role = 'buy';
            }
          } else if (fromItems && itemsEl.contains(target) && column.role) {
            var stayRow = itemRow(target, itemsEl);
            var roleButton = stayRow && stayRow.querySelector('.' + column.role);
            if (roleButton && !roleButton.disabled && roleButton.offsetWidth) target = roleButton;
          } else if (code === 38 && fromItems && toolsEl && toolsEl.contains(target)) {
            var tabsEl = el('tabs');
            var activeTool = tabsEl && !tabsEl.hidden ? tabsEl.querySelector('.active') : el('quantities') && el('quantities').querySelector('.active');
            if (activeTool) {
              target = activeTool;
              scrollTabIntoView(activeTool);
            }
          } else if (code === 38 && viewsEl && viewsEl.contains(target) && !(paginationEl && paginationEl.contains(current))) {
            var activeView = viewsEl.querySelector('button.active');
            if (activeView) target = activeView;
          }
          column.element = target;
        }
      } else {
        column = null;
        if (toolsEl && toolsEl.contains(current)) {
          var tools = navigable(toolsEl);
          var toolIndex = tools.indexOf(current);
          target = tools[toolIndex + (code === 39 ? 1 : -1)] || null;
          if (target) scrollTabIntoView(target);
        } else {
          choices.forEach(function (choice) {
            var spot = center(choice);
            var gap = code === 39 ? spot.left - from.right : from.left - spot.right;
            if (choice === current || gap < -4 || spot.bottom <= from.top || spot.top >= from.bottom) return;
            if (!target || gap < target.gap) target = {element: choice, gap: gap};
          });
          target = target && target.element;
          if (!target && current.parentElement && current.parentElement.classList.contains('more-actions')) {
            var siblings = navigable(current.parentElement);
            var siblingIndex = siblings.indexOf(current);
            target = siblings[siblingIndex + (code === 39 ? 1 : -1)] || null;
          }
        }
      }
      if (target) target.focus();
    }

    function columnXForElement(element) {
      return column && column.element === element ? column.x : center(element).x;
    }

    function setColumn(element, x) {
      column = element ? {element: element, x: x, role: itemRole(element)} : null;
    }

    return {
      primaryFocus: primaryFocus,
      move: move,
      columnXForElement: columnXForElement,
      setColumn: setColumn
    };
  }

  function createRemoteHold(options) {
    var panel = options.panel;
    var isClosed = options.isClosed;
    var isCompact = options.isCompact;
    var releaseTimer = null;

    function holdRemote(hold) {
      var win = root && root.window ? root.window : root;
      if (!win || !win.PalmSystem || !win.PalmSystem.setWindowProperty) return;
      clearTimeout(releaseTimer);
      if (hold) {
        win.PalmSystem.setWindowProperty('needFocus', 'true');
        return;
      }
      var doc = panel.ownerDocument;
      var active = doc.activeElement;
      if (active && active !== doc.body && panel.contains(active)) active.blur();
      win.PalmSystem.setWindowProperty('needFocus', 'true');
      win.PalmSystem.setWindowProperty('needFocus', 'false');
      var waits = [120, 600];
      function release() {
        if (!win.PalmSystem || isClosed() || !isCompact()) return;
        var cur = doc.activeElement;
        if (cur && cur !== doc.body && panel.contains(cur)) cur.blur();
        win.PalmSystem.setWindowProperty('needFocus', 'true');
        win.PalmSystem.setWindowProperty('needFocus', 'false');
        var wait = waits.shift();
        if (wait) releaseTimer = setTimeout(release, wait);
      }
      releaseTimer = setTimeout(release, waits.shift());
    }

    return {holdRemote: holdRemote};
  }

  function positionCorner(panel, el, corner) {
    var margin = '22px';
    panel.style.top = corner < 2 ? margin : 'auto';
    panel.style.bottom = corner >= 2 ? margin : 'auto';
    panel.style.left = corner === 1 || corner === 2 ? margin : 'auto';
    panel.style.right = corner === 0 || corner === 3 ? margin : 'auto';
    ['milestone', 'unit-intro', 'key-help', 'hint-card', 'local-hint'].forEach(function (id) {
      var node = el(id);
      if (!node) return;
      node.style.bottom = corner < 2 ? 'auto' : 'calc(100% + 10px)';
      node.style.top = corner < 2 ? 'calc(100% + 10px)' : 'auto';
    });
    var dialog = el('dialog');
    if (dialog) {
      if (corner < 2) {
        dialog.style.top = '8px';
        dialog.style.bottom = 'auto';
      } else {
        dialog.style.top = 'auto';
        dialog.style.bottom = '124.8px';
      }
    }
  }

  function applyShift(panel, shiftIndex, compact, dimmed, watchMode, standalone) {
    var table = (dimmed || watchMode) && !standalone ? QUIET_SHIFTS : SHIFTS;
    var off = table[shiftIndex % table.length];
    panel.style.transform = compact && !standalone && shiftIndex ? 'translate(' + off[0] + 'px, ' + off[1] + 'px)' : '';
  }

  return {
    CORNERS: CORNERS,
    SHIFTS: SHIFTS,
    QUIET_SHIFTS: QUIET_SHIFTS,
    parseParams: parseParams,
    center: center,
    nearestLine: nearestLine,
    focusKey: focusKey,
    focusByKey: focusByKey,
    navigable: navigable,
    itemRole: itemRole,
    scrollTabIntoView: scrollTabIntoView,
    createFocusController: createFocusController,
    createRemoteHold: createRemoteHold,
    positionCorner: positionCorner,
    applyShift: applyShift
  };
}));
