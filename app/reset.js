(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoachReset = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TOKEN = 'fresh-start-0.3.0';
  var RECEIPT = 'phil_roach_colony_reset_token';

  function apply(storage, token) {
    if (token !== TOKEN) return false;
    try {
      if (storage.getItem(RECEIPT) === TOKEN) return false;
      var keys = [];
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        if (key && key.indexOf('phil_roach_colony_') === 0 && key !== RECEIPT) keys.push(key);
      }
      keys.forEach(function (key) {
        storage.removeItem(key);
        if (storage.getItem(key) !== null) throw new Error('Old colony data was not removed.');
      });
      storage.setItem(RECEIPT, TOKEN);
      if (storage.getItem(RECEIPT) !== TOKEN) throw new Error('Reset receipt was not retained.');
      return true;
    } catch (cause) {
      var error = new Error('[ROACH] reset: the requested fresh start could not be completed.');
      error.cause = cause;
      throw error;
    }
  }
  return {apply: apply, token: TOKEN};
}));
