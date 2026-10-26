/* Generated from pinned GPL-3.0 upstream source. See source/ and PROVENANCE.md. */
module.exports = function registerCore(angular, _, Decimal, math, moment, Math, Date) {
var name = "";
'use strict';

/**
  * @ngdoc service
  * @name swarmApp.spreadsheetutil
  * @description
  * # spreadsheetutil
  * Factory in the swarmApp.
 */
var slice = [].slice;

angular.module('swarmApp').factory('spreadsheetUtil', ["util"], function(util) {
  var SpreadsheetUtil;
  return new (SpreadsheetUtil = (function() {
    function SpreadsheetUtil() {}

    SpreadsheetUtil.prototype.defaultFilter = function(val) {
      return !!val || _.isNumber(val);
    };

    SpreadsheetUtil.prototype.setNested = function(object, props, val) {
      var cur, i, j, lastprop, len, prop, ref;
      ref = props, props = 2 <= ref.length ? slice.call(ref, 0, i = ref.length - 1) : (i = 0, []), lastprop = ref[i++];
      cur = object;
      for (j = 0, len = props.length; j < len; j++) {
        prop = props[j];
        if (cur[prop] == null) {
          cur[prop] = {};
        }
        cur = cur[prop];
      }
      cur[lastprop] = val;
      return object;
    };

    SpreadsheetUtil.prototype.getNested = function(object, props) {
      var cur, i, len, prop;
      cur = object;
      for (i = 0, len = props.length; i < len; i++) {
        prop = props[i];
        cur = cur[prop];
      }
      return cur;
    };

    SpreadsheetUtil.prototype.normalizeRow = function(row, filterFn) {
      var col, props, ret, val;
      if (filterFn == null) {
        filterFn = this.defaultFilter;
      }
      ret = {};
      for (col in row) {
        val = row[col];
        if (filterFn(val)) {
          props = col.split('.');
          this.setNested(ret, props, val);
        }
      }
      return ret;
    };

    SpreadsheetUtil.prototype.normalizeRows = function(rows, filterFn) {
      var i, len, results, row;
      if (filterFn == null) {
        filterFn = this.defaultFilter;
      }
      results = [];
      for (i = 0, len = rows.length; i < len; i++) {
        row = rows[i];
        results.push(this.normalizeRow(row, filterFn));
      }
      return results;
    };

    SpreadsheetUtil.prototype.groupRows = function(groupSpec, rows, filterFn) {
      var group, groups, i, j, key, keyval, len, len1, listProp, listProps, listvals, mainrow, orderedKeyvals, ret;
      if (filterFn == null) {
        filterFn = this.defaultFilter;
      }
      ret = [];
      for (key in groupSpec) {
        listProps = groupSpec[key];
        groups = _.groupBy(rows, key);
        orderedKeyvals = _.uniq(_.map(rows, key));
        if (_.isString(listProps)) {
          listProps = [listProps];
        }
        if (!_.isArray(listProps)) {
          throw new Error("groupRows: nested groupings not supported yet");
        }
        for (i = 0, len = orderedKeyvals.length; i < len; i++) {
          keyval = orderedKeyvals[i];
          group = groups[keyval];
          ret.push(mainrow = _.clone(group[0]));
          for (j = 0, len1 = listProps.length; j < len1; j++) {
            listProp = listProps[j];
            listvals = _.map(group, listProp);
            mainrow[listProp] = _.filter(listvals, filterFn);
          }
        }
      }
      return ret;
    };

    SpreadsheetUtil.prototype.parseRows = function(groupSpec, rows, filterFn) {
      var normalized;
      if (filterFn == null) {
        filterFn = this.defaultFilter;
      }
      normalized = this.normalizeRows(rows, filterFn);
      return this.groupRows(groupSpec, normalized, filterFn);
    };

    SpreadsheetUtil.prototype.resolveList = function(objects, field, targets, opts) {
      var i, len, name, obj, results;
      if (opts == null) {
        opts = {};
      }
      if (opts.required == null) {
        opts.required = true;
      }
      results = [];
      for (i = 0, len = objects.length; i < len; i++) {
        obj = objects[i];
        name = obj[field];
        obj[field] = targets[name];
        results.push(util.assert(obj[field] || !opts.required, "couldn't resolve ref: " + obj + "." + field + "=" + name, obj, field, name, targets[name], objects));
      }
      return results;
    };

    return SpreadsheetUtil;

  })());
});

'use strict';

/**
  * @ngdoc service
  * @name swarmApp.seedrand
  * @description
  * # seedrand
  *
  * Deterministic serializable random numbers.
  * Fights savestate scumming that would occur with math.rand().
 */
angular.module('swarmApp').service('seedrand', ["session"], function(session) {
  var SeedRand;
  return new (SeedRand = (function() {
    function SeedRand() {}

    SeedRand.prototype.mkseed = function(seedstring, baseseed) {
      if (baseseed == null) {
        baseseed = session.state.date.started;
      }
      return baseseed + ":" + seedstring;
    };

    SeedRand.prototype.rng = function(seedstring, baseseed) {
      var seed;
      if (baseseed == null) {
        baseseed = null;
      }
      seed = this.mkseed(seedstring, baseseed);
      return new Math.seedrandom(seed);
    };

    SeedRand.prototype.rand = function(seedstring, baseseed) {
      if (baseseed == null) {
        baseseed = null;
      }
      return this.rng(seedstring, baseseed)();
    };

    return SeedRand;

  })());
});

'use strict';
angular.module('swarmApp').factory('Effect', ["util"], function(util) {
  var Effect;
  return Effect = (function() {
    function Effect(game1, parent1, data) {
      this.game = game1;
      this.parent = parent1;
      _.extend(this, data);
      if (data.unittype != null) {
        this.unit = util.assert(this.game.unit(data.unittype));
      }
      if (data.unittype2 != null) {
        this.unit2 = util.assert(this.game.unit(data.unittype2));
      }
      if (data.upgradetype != null) {
        this.upgrade = util.assert(this.game.upgrade(data.upgradetype));
      }
    }

    Effect.prototype.parentUnit = function() {
      if (this.parent.unittype != null) {
        return this.parent;
      } else {
        return this.parent.unit;
      }
    };

    Effect.prototype.parentUpgrade = function() {
      if (this.parent.unittype != null) {
        return null;
      } else {
        return this.parent;
      }
    };

    Effect.prototype.hasParentStat = function(statname, _default) {
      return this.parentUnit().hasStat(statname, _default);
    };

    Effect.prototype.parentStat = function(statname, _default) {
      return this.parentUnit().stat(statname, _default);
    };

    Effect.prototype.onBuy = function(level) {
      var base1;
      return typeof (base1 = this.type).onBuy === "function" ? base1.onBuy(this, this.game, this.parent, level) : void 0;
    };

    Effect.prototype.onBuyUnit = function(twinnum) {
      var base1;
      return typeof (base1 = this.type).onBuyUnit === "function" ? base1.onBuyUnit(this, this.game, this.parent, twinnum) : void 0;
    };

    Effect.prototype.calcStats = function(stats, schema, level) {
      var base1;
      if (stats == null) {
        stats = {};
      }
      if (schema == null) {
        schema = {};
      }
      if (level == null) {
        level = this.parent.count();
      }
      if (typeof (base1 = this.type).calcStats === "function") {
        base1.calcStats(this, stats, schema, level);
      }
      return stats;
    };

    Effect.prototype.bank = function() {
      var base1;
      return typeof (base1 = this.type).bank === "function" ? base1.bank(this, this.game) : void 0;
    };

    Effect.prototype.cap = function() {
      var base1;
      return typeof (base1 = this.type).cap === "function" ? base1.cap(this, this.game) : void 0;
    };

    Effect.prototype.output = function(level) {
      var base1;
      return typeof (base1 = this.type).output === "function" ? base1.output(this, this.game, void 0, level) : void 0;
    };

    Effect.prototype.outputNext = function() {
      return this.output(this.parent.count().plus(1));
    };

    Effect.prototype.power = function() {
      var ref, ret, upname;
      ret = this.parentStat('power', 1);
      upname = (ref = this.parentUpgrade()) != null ? ref.name : void 0;
      if (upname) {
        ret = ret.times(this.parentStat("power." + upname, 1));
      }
      return ret;
    };

    return Effect;

  })();
});

angular.module('swarmApp').factory('EffectType', [], function() {
  var EffectType;
  return EffectType = (function() {
    function EffectType(data) {
      _.extend(this, data);
    }

    return EffectType;

  })();
});


/**
  * @ngdoc service
  * @name swarmApp.effect
  * @description
  * # effect
  * Factory in the swarmApp.
 */

angular.module('swarmApp').factory('EffectTypes', [], function() {
  var EffectTypes;
  return EffectTypes = (function() {
    function EffectTypes(effecttypes) {
      var effecttype, i, len;
      if (effecttypes == null) {
        effecttypes = [];
      }
      this.list = [];
      this.byName = {};
      for (i = 0, len = effecttypes.length; i < len; i++) {
        effecttype = effecttypes[i];
        this.register(effecttype);
      }
    }

    EffectTypes.prototype.register = function(effecttype) {
      this.list.push(effecttype);
      this.byName[effecttype.name] = effecttype;
      return this;
    };

    return EffectTypes;

  })();
});

angular.module('swarmApp').factory('romanize', [], function() {
  
  var romanize = function(num) {
    if (!+num)
      return false;
    var digits = String(+num).split(""),
      key = ["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM",
             "","X","XX","XXX","XL","L","LX","LXX","LXXX","XC",
             "","I","II","III","IV","V","VI","VII","VIII","IX"],
      roman = "",
      i = 3;
    while (i--)
      roman = (key[+digits.pop() + (i * 10)] || "") + roman;
    return Array(+digits.join("") + 1).join("M") + roman;
  }
  ;
  return romanize;
});

angular.module('swarmApp').factory('effecttypes', ["EffectType","EffectTypes","util","seedrand","$log","romanize"], function(EffectType, EffectTypes, util, seedrand, $log, romanize) {
  var ONE, effecttypes, validateSchema;
  ONE = new Decimal(1);
  effecttypes = new EffectTypes();
  validateSchema = function(stat, schema, operation) {
    if (schema[stat] == null) {
      schema[stat] = operation;
    }
    return util.assert(schema[stat] === operation, "conflicting stat operations. expected " + operation + ", got " + schema[stat], stat, schema, operation);
  };
  effecttypes.register({
    name: 'addUnit',
    onBuy: function(effect, game) {
      return effect.unit._addCount(this.output(effect, game));
    },
    onBuyUnit: function(effect, game, boughtUnit, num) {
      return effect.unit._addCount(this.output(effect, game, num));
    },
    output: function(effect, game, num) {
      if (num == null) {
        num = 1;
      }
      return effect.power().times(effect.val).times(num);
    }
  });
  effecttypes.register({
    name: 'addUnitByVelocity',
    onBuy: function(effect, game) {
      return effect.unit._addCount(this.output(effect, game));
    },
    output: function(effect, game) {
      return effect.unit.velocity().times(effect.val).times(effect.power());
    }
  });
  effecttypes.register({
    name: 'addUnitTimed',
    onBuy: function(effect, game, parent, level) {
      var thresholdMillis;
      thresholdMillis = effect.val2 * 1000;
      if ((effect.unit2 == null) || effect.unit2.isVisible()) {
        if (effect.unit.isAddUnitTimerReady(thresholdMillis)) {
          effect.unit._addCount(effect.val);
          return effect.unit.setAddUnitTimer();
        }
      }
    }
  });
  effecttypes.register({
    name: 'addUnitRand',
    onBuy: function(effect, game, parent, level) {
      var out;
      out = this.output(effect, game, parent, level);
      if (out.spawned) {
        if (effect.unit.count().isZero()) {
          game.cache.firstSpawn[effect.unit.name] = game.now;
        }
        return effect.unit._addCount(out.qty);
      }
    },
    output: function(effect, game, parent, level) {
      var base1, baseqty, isspawned, maxqty, minlevel, minqty, modqty, prob, qty, qtyfactor, rng, roll, roll2, seed, stat_each;
      if (parent == null) {
        parent = effect.parent;
      }
      if (level == null) {
        level = parent.count();
      }
      minlevel = effect.parentStat("random.minlevel." + parent.name);
      if (level.greaterThanOrEqualTo(minlevel)) {
        stat_each = effect.parentStat('random.each', 1);
        prob = effect.parentStat('random.freq');
        minqty = 0.9;
        maxqty = 1.1;
        qtyfactor = effect.val;
        baseqty = stat_each.times(Decimal.pow(qtyfactor, level));
        if ((base1 = game.session.state.date).restarted == null) {
          base1.restarted = game.session.state.date.started;
        }
        seed = "[" + (game.session.state.date.restarted.getTime()) + ", " + effect.parent.name + ", " + level + "]";
        rng = seedrand.rng(seed);
        roll = rng();
        isspawned = level.equals(minlevel) || level.modulo(8).equals(0) || new Decimal(roll + '').lessThan(prob);
        roll2 = rng();
        modqty = minqty + (roll2 * (maxqty - minqty));
        qty = baseqty.times(modqty + '').ceil();
        return {
          spawned: isspawned,
          baseqty: baseqty,
          qty: qty
        };
      }
      return {
        spawned: false,
        baseqty: new Decimal(0),
        qty: new Decimal(0)
      };
    }
  });
  effecttypes.register({
    name: 'compoundUnit',
    bank: function(effect, game) {
      var base;
      base = effect.unit.count();
      if (effect.unit2 != null) {
        base = base.plus(effect.unit2.count());
      }
      return base;
    },
    cap: function(effect, game) {
      var velocity;
      if (effect.val2 === '' || (effect.val2 == null)) {
        return void 0;
      }
      velocity = effect.unit.velocity();
      if (effect.unit2 != null) {
        velocity = velocity.plus(effect.unit2.velocity());
      }
      return velocity.times(effect.val2).times(effect.power());
    },
    output: function(effect, game) {
      var base, cap, ret;
      base = this.bank(effect, game);
      ret = base.times(effect.val - 1);
      if ((cap = this.cap(effect, game)) != null) {
        ret = Decimal.min(ret, cap);
      }
      return ret;
    },
    onBuy: function(effect, game) {
      return effect.unit._addCount(this.output(effect, game));
    }
  });
  effecttypes.register({
    name: 'addUpgrade',
    onBuy: function(effect, game) {
      return effect.upgrade._addCount(this.output(effect, game));
    },
    output: function(effect, game) {
      return effect.power().times(effect.val);
    }
  });
  effecttypes.register({
    name: 'skipTime',
    onBuy: function(effect) {
      return effect.game.skipTime(this.output(effect).toNumber(), 'seconds');
    },
    output: function(effect) {
      return effect.power().times(effect.val);
    }
  });
  effecttypes.register({
    name: 'multStat',
    calcStats: function(effect, stats, schema, level) {
      var ref;
      validateSchema(effect.stat, schema, 'mult');
      return stats[effect.stat] = ((ref = stats[effect.stat]) != null ? ref : ONE).times(Decimal.pow(effect.val, level));
    }
  });
  effecttypes.register({
    name: 'expStat',
    calcStats: function(effect, stats, schema, level) {
      var ref;
      validateSchema(effect.stat, schema, 'mult');
      return stats[effect.stat] = ((ref = stats[effect.stat]) != null ? ref : ONE).times(Decimal.pow(level, effect.val).times(effect.val2).plus(1));
    }
  });
  effecttypes.register({
    name: 'asympStat',
    calcStats: function(effect, stats, schema, level) {
      var ref, weight;
      validateSchema(effect.stat, schema, 'mult');
      weight = level.times(effect.val2);
      util.assert(!weight.isNegative(), 'negative asympStat weight');
      return stats[effect.stat] = ((ref = stats[effect.stat]) != null ? ref : ONE).times(ONE.plus((new Decimal(effect.val).minus(1)).times(ONE.minus(ONE.dividedBy(weight.plus(1))))));
    }
  });
  effecttypes.register({
    name: 'logStat',
    calcStats: function(effect, stats, schema, level) {
      var ref, ref1;
      validateSchema(effect.stat, schema, 'mult');
      return stats[effect.stat] = ((ref1 = stats[effect.stat]) != null ? ref1 : ONE).times(new Decimal((ref = effect.val3) != null ? ref : 1).times(Decimal.log(level.times(effect.val).plus(effect.val2)).dividedBy(Decimal.log(effect.val2)).minus(1)).plus(1));
    }
  });
  effecttypes.register({
    name: 'addStat',
    calcStats: function(effect, stats, schema, level) {
      var ref;
      validateSchema(effect.stat, schema, 'add');
      return stats[effect.stat] = ((ref = stats[effect.stat]) != null ? ref : new Decimal(0)).plus(new Decimal(effect.val).times(level));
    }
  });
  effecttypes.register({
    name: 'initStat',
    calcStats: function(effect, stats, schema, level) {
      var ref;
      validateSchema(effect.stat, schema, 'mult');
      return stats[effect.stat] = ((ref = stats[effect.stat]) != null ? ref : ONE).times(effect.val);
    }
  });
  effecttypes.register({
    name: 'multStatPerAchievementPoint',
    calcStats: function(effect, stats, schema, level) {
      var points, ref;
      validateSchema(effect.stat, schema, 'mult');
      points = effect.game.achievementPoints();
      return stats[effect.stat] = ((ref = stats[effect.stat]) != null ? ref : ONE).times(Decimal.pow(ONE.plus(new Decimal(effect.val).times(points)), level));
    }
  });
  effecttypes.register({
    name: 'suffix',
    calcStats: function(effect, stats, schema, level) {
      var ref, suffix;
      if (level.isZero()) {
        suffix = '';
      } else if (level.lessThan(3999)) {
        suffix = romanize(level.plus(1).toNumber());
      }
      if (suffix == null) {
        suffix = level.plus(1).toString();
      }
      effect.unit.suffix = suffix;
      return stats.empower = ((ref = stats.empower) != null ? ref : new Decimal(0)).plus(level);
    }
  });
  return effecttypes;
});

'use strict';
angular.module('swarmApp').factory('ProducerPath', ["$log","UNIT_LIMIT"], function($log, UNIT_LIMIT) {
  var ProducerPath;
  return ProducerPath = (function() {
    function ProducerPath(unit, path1) {
      var pathname;
      this.unit = unit;
      this.path = path1;
      pathname = _.map(this.path, (function(_this) {
        return function(p) {
          return p.parent.name;
        };
      })(this)).join('>');
      this.name = this.unit.name + ":" + pathname + ">" + this.unit.name;
    }

    ProducerPath.prototype.first = function() {
      return this.path[0];
    };

    ProducerPath.prototype.isZero = function() {
      return this.first().parent.count().isZero();
    };

    ProducerPath.prototype.degree = function() {
      return this.path.length;
    };

    ProducerPath.prototype.degreeOrZero = function() {
      if (this.isZero()) {
        return 0;
      } else {
        return this.degree();
      }
    };

    ProducerPath.prototype.prodEach = function() {
      var base, name1;
      return (base = this.unit.game.cache.producerPathProdEach)[name1 = this.name] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          var ancestordata, i, len, ref, ret, val;
          ret = new Decimal(1);
          ref = _this.path;
          for (i = 0, len = ref.length; i < len; i++) {
            ancestordata = ref[i];
            val = new Decimal(ancestordata.prod.val).plus(ancestordata.parent.stat('base', 0));
            ret = ret.times(val);
            ret = ret.times(ancestordata.parent.stat('prod', 1));
            ret = Decimal.min(ret, UNIT_LIMIT);
          }
          return ret;
        };
      })(this)();
    };

    ProducerPath.prototype.coefficient = function(count) {
      if (count == null) {
        count = this.first().parent.rawCount();
      }
      return count.floor().times(this.prodEach());
    };

    ProducerPath.prototype.coefficientNow = function() {
      return this.coefficient(this.first().parent.count());
    };

    ProducerPath.prototype.count = function(secs) {
      var coeff, degree;
      degree = this.degree();
      coeff = this.coefficient();
      return coeff.times(Decimal.pow(secs, degree)).dividedBy(math.factorial(degree));
    };

    return ProducerPath;

  })();
});

angular.module('swarmApp').factory('ProducerPaths', ["$log","ProducerPath"], function($log, ProducerPath) {
  var ProducerPaths;
  return ProducerPaths = (function() {
    function ProducerPaths(unit, raw) {
      this.unit = unit;
      this.raw = raw;
      this.list = _.map(this.raw, (function(_this) {
        return function(path) {
          var tailpath;
          tailpath = path.concat([_this.unit]);
          return new ProducerPath(_this.unit, _.map(path, function(parent, index) {
            var child, prodlink;
            child = tailpath[index + 1];
            prodlink = parent.prodByName[child.name];
            return {
              parent: parent,
              child: child,
              prod: prodlink
            };
          }));
        };
      })(this));
      this.byDegree = _.groupBy(this.list, function(path) {
        return path.degree();
      });
    }

    ProducerPaths.prototype.getDegreeCoefficient = function(degree, now) {
      var i, len, path, ref, ref1, ret;
      if (now == null) {
        now = false;
      }
      ret = new Decimal(0);
      ref1 = (ref = this.byDegree[degree]) != null ? ref : [];
      for (i = 0, len = ref1.length; i < len; i++) {
        path = ref1[i];
        ret = ret.plus(now ? path.coefficientNow() : path.coefficient());
      }
      return ret;
    };

    ProducerPaths.prototype.getMaxDegree = function() {
      return this.getCoefficients().length - 1;
    };

    ProducerPaths.prototype.getCoefficients = function() {
      var base, name1;
      return (base = this.unit.game.cache.producerPathCoefficients)[name1 = this.unit.name] != null ? base[name1] : base[name1] = this._getCoefficients();
    };

    ProducerPaths.prototype._getCoefficients = function(now) {
      var coeff, coefficient, degree, i, j, len, len1, pathdata, ref, ref1, ret;
      if (now == null) {
        now = false;
      }
      ret = [now ? this.unit.count() : this.unit.rawCount()];
      ref = this.list;
      for (i = 0, len = ref.length; i < len; i++) {
        pathdata = ref[i];
        degree = pathdata.degree();
        coefficient = now ? pathdata.coefficientNow() : pathdata.coefficient();
        if (!coefficient.isZero()) {
          ret[degree] = ((ref1 = ret[degree]) != null ? ref1 : new Decimal(0)).plus(coefficient);
        }
      }
      for (degree = j = 0, len1 = ret.length; j < len1; degree = ++j) {
        coeff = ret[degree];
        if (coeff == null) {
          ret[degree] = new Decimal(0);
        }
      }
      return ret;
    };

    ProducerPaths.prototype.getCoefficientsNow = function() {
      return this._getCoefficients(true);
    };

    ProducerPaths.prototype.count = function(secs) {
      var coeff, degree, i, len, ref, ret;
      ret = new Decimal(0);
      ref = this.getCoefficients();
      for (degree = i = 0, len = ref.length; i < len; degree = ++i) {
        coeff = ref[degree];
        ret = ret.plus(coeff.times(Decimal.pow(secs, degree)).dividedBy(math.factorial(degree)));
      }
      return ret;
    };

    return ProducerPaths;

  })();
});

angular.module('swarmApp').factory('Unit', ["util","$log","Effect","ProducerPaths","UNIT_LIMIT"], function(util, $log, Effect, ProducerPaths, UNIT_LIMIT) {
  var Unit;
  return Unit = (function() {
    function Unit(game, unittype1) {
      this.game = game;
      this.unittype = unittype1;
      this.name = this.unittype.name;
      this.suffix = '';
      this.affectedBy = [];
      this.type = this.unittype;
    }

    Unit.prototype._init = function() {
      var upgrade;
      this.prod = _.map(this.unittype.prod, (function(_this) {
        return function(prod) {
          var ret;
          ret = _.clone(prod);
          ret.unit = _this.game.unit(prod.unittype);
          ret.val = new Decimal(ret.val);
          return ret;
        };
      })(this));
      this.prodByName = _.keyBy(this.prod, function(prod) {
        return prod.unit.name;
      });
      this.cost = _.map(this.unittype.cost, (function(_this) {
        return function(cost) {
          var ret;
          ret = _.clone(cost);
          ret.unit = _this.game.unit(cost.unittype);
          ret.val = new Decimal(ret.val);
          return ret;
        };
      })(this));
      this.costByName = _.keyBy(this.cost, function(cost) {
        return cost.unit.name;
      });
      this.warnfirst = _.map(this.unittype.warnfirst, (function(_this) {
        return function(warnfirst) {
          var ret;
          ret = _.clone(warnfirst);
          ret.unit = _this.game.unit(warnfirst.unittype);
          return ret;
        };
      })(this));
      this.showparent = this.game.unit(this.unittype.showparent);
      this.upgrades = {
        list: (function() {
          var i, len, ref, ref1, results;
          ref = this.game.upgradelist();
          results = [];
          for (i = 0, len = ref.length; i < len; i++) {
            upgrade = ref[i];
            if (this.unittype === upgrade.type.unittype || ((ref1 = this.showparent) != null ? ref1.unittype : void 0) === upgrade.type.unittype) {
              results.push(upgrade);
            }
          }
          return results;
        }).call(this)
      };
      this.upgrades.byName = _.keyBy(this.upgrades.list, 'name');
      this.upgrades.byClass = _.groupBy(this.upgrades.list, function(u) {
        return u.type["class"];
      });
      this.requires = _.map(this.unittype.requires, (function(_this) {
        return function(require) {
          var ret;
          util.assert(require.unittype || require.upgradetype, 'unit require without a unittype or upgradetype', _this.name, name, require);
          util.assert(!(require.unittype && require.upgradetype), 'unit require with both unittype and upgradetype', _this.name, name, require);
          ret = _.clone(require);
          ret.val = new Decimal(ret.val);
          if (require.unittype != null) {
            ret.resource = ret.unit = util.assert(_this.game.unit(require.unittype));
          }
          if (require.upgradetype != null) {
            ret.resource = ret.upgrade = util.assert(_this.game.upgrade(require.upgradetype));
          }
          return ret;
        };
      })(this));
      this.cap = _.map(this.unittype.cap, (function(_this) {
        return function(capspec) {
          var ret;
          ret = _.clone(capspec);
          ret.unit = _this.game.unit(ret.unittype);
          ret.val = new Decimal(ret.val);
          return ret;
        };
      })(this));
      this.effect = _.map(this.unittype.effect, (function(_this) {
        return function(effect) {
          var ret;
          ret = new Effect(_this.game, _this, effect);
          ret.unit.affectedBy.push(ret);
          return ret;
        };
      })(this));
      this.tab = this.game.tabs.byName[this.unittype.tab];
      if (this.tab) {
        this.next = this.tab.next(this);
        return this.prev = this.tab.prev(this);
      }
    };

    Unit.prototype._init2 = function() {
      return this._producerPath = new ProducerPaths(this, _.map(this.unittype.producerPathList, (function(_this) {
        return function(path) {
          return _.map(path, function(unittype) {
            var ret;
            ret = _this.game.unit(unittype);
            util.assert(ret);
            return ret;
          });
        };
      })(this)));
    };

    Unit.prototype.isCountInitialized = function() {
      return this.game.session.state.unittypes[this.name] != null;
    };

    Unit.prototype.rawCount = function() {
      var base, name1;
      return (base = this.game.cache.unitRawCount)[name1 = this.name] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          var ref, ret;
          ret = (ref = _this.game.session.state.unittypes[_this.name]) != null ? ref : 0;
          if (_.isNaN(ret)) {
            util.error('NaN count. oops.', _this.name, ret);
            ret = 0;
          }
          if (_.isNumber(ret)) {
            ret = ret.toPrecision(15);
          }
          return new Decimal(ret);
        };
      })(this)();
    };

    Unit.prototype._setCount = function(val) {
      this.game.session.state.unittypes[this.name] = new Decimal(val);
      return this.game.cache.onUpdate();
    };

    Unit.prototype._addCount = function(val) {
      return this._setCount(this.rawCount().plus(val));
    };

    Unit.prototype._subtractCount = function(val) {
      return this._addCount(new Decimal(val).times(-1));
    };

    Unit.prototype._parents = function() {
      var i, len, pathdata, ref, results;
      ref = this._producerPath.list;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        pathdata = ref[i];
        if (pathdata.first().parent.prodByName[this.name]) {
          results.push(pathdata.first().parent);
        }
      }
      return results;
    };

    Unit.prototype._getCap = function() {
      var base, name1;
      return (base = this.game.cache.unitCap)[name1 = this.name] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          var ret;
          if (_this.hasStat('capBase')) {
            ret = _this.stat('capBase');
            ret = ret.times(_this.stat('capMult', 1));
            ret = ret.plus(_this.stat('capFlat', 0));
            return ret;
          }
        };
      })(this)();
    };

    Unit.prototype.capValue = function(val) {
      var cap;
      cap = this._getCap();
      if (cap == null) {
        if (val == null) {
          return val;
        }
        return Decimal.min(val, UNIT_LIMIT);
      }
      if (val == null) {
        return cap;
      }
      return Decimal.min(val, cap);
    };

    Unit.prototype.capPercent = function() {
      var cap;
      if ((cap = this.capValue()) != null) {
        return this.count().dividedBy(cap);
      }
    };

    Unit.prototype.capDurationSeconds = function() {
      var base, cap, ref;
      if ((cap = this.capValue()) != null) {
        return (ref = typeof (base = this.estimateSecsUntilEarned(cap)).toNumber === "function" ? base.toNumber() : void 0) != null ? ref : 0;
      }
    };

    Unit.prototype.capDurationMoment = function() {
      var secs;
      if ((secs = this.capDurationSeconds()) != null) {
        return moment.duration(secs, 'seconds');
      }
    };

    Unit.ESTIMATE_BISECTION = true;

    Unit.prototype.isEstimateExact = function() {
      return this._producerPath.getMaxDegree() <= 2 || this.constructor.ESTIMATE_BISECTION;
    };

    Unit.prototype.isEstimateCacheable = function() {
      return this._producerPath.getMaxDegree() <= 2 || this.constructor.ESTIMATE_BISECTION;
    };

    Unit.prototype.estimateSecsUntilEarned = function(num) {
      var _, a, b, c, coeff, coeffs, count, deg, degree, disc, i, len, linear, maxSec, quadratic, ref, remaining, ret;
      count = this.count();
      num = new Decimal(num);
      remaining = num.minus(count);
      if (remaining.lessThanOrEqualTo(0)) {
        return 0;
      }
      degree = this._producerPath.getMaxDegree();
      coeffs = this._producerPath.getCoefficientsNow();
      ret = new Decimal(2e308);
      if (degree > 0) {
        if (!coeffs[1].isZero()) {
          linear = ret = Decimal.min(ret, remaining.dividedBy(coeffs[1]));
        }
        if (degree > 1) {
          _ = coeffs[0], b = coeffs[1], a = coeffs[2];
          if (!a.isZero()) {
            c = remaining.negated();
            a = a.dividedBy(2);
            disc = b.times(b).minus(a.times(c).times(4)).sqrt();
            quadratic = ret = Decimal.min(ret, b.negated().plus(disc).dividedBy(a.times(2)));
          }
          if (degree > 2) {
            if (this.constructor.ESTIMATE_BISECTION) {
              maxSec = linear != null ? linear : remaining.dividedBy(this._countInSecsFromNow(new Decimal(1)).minus(count));
              if (!maxSec.greaterThan(0)) {
                ret = new Decimal(1);
              } else {
                ret = this.estimateSecsUntilEarnedBisection(num, maxSec);
              }
            } else {
              ref = coeffs.slice(3);
              for (deg = i = 0, len = ref.length; i < len; deg = ++i) {
                coeff = ref[deg];
                if (!coeff.isZero()) {
                  deg += 3;
                  ret = Decimal.min(ret, remaining.dividedBy(coeff).times(math.factorial(deg)).pow(new Decimal(1).dividedBy(deg)));
                }
              }
            }
          }
        }
      }
      return ret;
    };

    Unit.prototype.estimateSecsUntilEarnedBisection = function(num, origMaxSec) {
      var done, f, isInThresh, iteration, maxSec, maxVal, midSec, midVal, minSec, minVal, starttime, timediff;
      $log.debug('bisecting');
      f = (function(_this) {
        return function(sec) {
          return num.minus(_this._countInSecsFromNow(sec));
        };
      })(this);
      isInThresh = function(min, max) {
        var thresh;
        thresh = new Decimal(0.2);
        return max.minus(min).dividedBy(2).lessThan(thresh);
      };
      minSec = new Decimal(0);
      maxSec = origMaxSec;
      minVal = f(minSec);
      maxVal = f(maxSec);
      iteration = 0;
      starttime = new Date().getTime();
      done = false;
      while (iteration < 50 && !done) {
        iteration += 1;
        midSec = maxSec.plus(minSec).dividedBy(2);
        midVal = f(midSec);
        if (midVal.isZero() || isInThresh(minSec, maxSec)) {
          done = true;
        } else if ((midVal.isNegative()) === (minVal.isNegative())) {
          minSec = midSec;
          minVal = f(minSec);
        } else {
          maxSec = midSec;
          maxVal = f(maxSec);
        }
      }
      timediff = new Date().getTime() - starttime;
      if (!done) {
        $log.debug("bisection estimate for " + this.name + " took more than " + iteration + " iterations; quitting. precision: " + (maxSec.minus(minSec).dividedBy(2)) + " (down from " + origMaxSec + "). time: " + timediff);
      } else {
        $log.debug("bisection estimate for " + this.name + " finished in " + iteration + " iterations. original range: " + origMaxSec + ", estimate is " + midSec + " - plus game.difftime of " + (this.game.diffSeconds()) + ", that's " + (midSec.plus(this.game.diffSeconds())) + " - this shouldn't change much over multiple iterations. time: " + timediff);
      }
      return midSec;
    };

    Unit.prototype.count = function() {
      var base, name1;
      return (base = this.game.cache.unitCount)[name1 = this.name] != null ? base[name1] : base[name1] = this._countInSecsFromNow();
    };

    Unit.prototype._countInSecsFromNow = function(secs) {
      if (secs == null) {
        secs = new Decimal(0);
      }
      return this._countInSecsFromReified(secs.plus(this.game.diffSeconds()));
    };

    Unit.prototype._countInSecsFromReified = function(secs) {
      if (secs == null) {
        secs = 0;
      }
      return this.capValue(this._producerPath.count(secs));
    };

    Unit.prototype.spentResources = function() {
      var i, len, ref, results, u;
      ref = [].concat(this.game.unitlist(), this.game.upgradelist());
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        u = ref[i];
        if (u.costByName[this.name] != null) {
          results.push(u);
        }
      }
      return results;
    };

    Unit.prototype.spent = function(ignores) {
      var cost, costeach, costs, i, j, len, len1, ref, ref1, ref2, ref3, ref4, ret, u;
      if (ignores == null) {
        ignores = {};
      }
      ret = new Decimal(0);
      ref = this.game.unitlist();
      for (i = 0, len = ref.length; i < len; i++) {
        u = ref[i];
        costeach = (ref1 = (ref2 = u.costByName[this.name]) != null ? ref2.val : void 0) != null ? ref1 : 0;
        ret = ret.plus(u.count().times(costeach));
      }
      ref3 = this.game.upgradelist();
      for (j = 0, len1 = ref3.length; j < len1; j++) {
        u = ref3[j];
        if (u.costByName[this.name] && (ignores[u.name] == null)) {
          costs = u.sumCost(u.count(), 0);
          cost = _.find(costs, (function(_this) {
            return function(c) {
              return c.unit.name === _this.name;
            };
          })(this));
          ret = ret.plus((ref4 = cost != null ? cost.val : void 0) != null ? ref4 : 0);
        }
      }
      return ret;
    };

    Unit.prototype._costMetPercent = function() {
      var cost, i, len, max, ref;
      max = new Decimal(2e308);
      ref = this.eachCost();
      for (i = 0, len = ref.length; i < len; i++) {
        cost = ref[i];
        if (cost.val.greaterThan(0)) {
          max = Decimal.min(max, cost.unit.count().dividedBy(cost.val));
        }
      }
      return max;
    };

    Unit.prototype._costMetPercentOfVelocity = function() {
      var cost, i, len, max, ref;
      max = new Decimal(2e308);
      ref = this.eachCost();
      for (i = 0, len = ref.length; i < len; i++) {
        cost = ref[i];
        if (cost.val.greaterThan(0)) {
          max = Decimal.min(max, cost.unit.velocity().dividedBy(cost.val));
        }
      }
      return max;
    };

    Unit.prototype.isVisible = function() {
      if (this.unittype.disabled) {
        return false;
      }
      if (this.game.cache.unitVisible[this.name]) {
        return true;
      }
      return this.game.cache.unitVisible[this.name] = this._isVisible();
    };

    Unit.prototype._isVisible = function() {
      var i, len, ref, require;
      if (this.count().greaterThan(0)) {
        return true;
      }
      util.assert(this.requires.length > 0, "unit without visibility requirements", this.name);
      ref = this.requires;
      for (i = 0, len = ref.length; i < len; i++) {
        require = ref[i];
        if (require.val.greaterThan(require.resource.count())) {
          if (require.op !== 'OR') {
            return false;
          }
        } else if (require.op === 'OR') {
          return true;
        }
      }
      return true;
    };

    Unit.prototype.isBuyButtonVisible = function() {
      var cost, eachCost, i, len;
      eachCost = this.eachCost();
      if (this.unittype.unbuyable || eachCost.length === 0) {
        return false;
      }
      for (i = 0, len = eachCost.length; i < len; i++) {
        cost = eachCost[i];
        if (!cost.unit.isVisible()) {
          return false;
        }
      }
      return true;
    };

    Unit.prototype.maxCostMet = function(percent) {
      var base, name1;
      if (percent == null) {
        percent = 1;
      }
      return (base = this.game.cache.unitMaxCostMet)[name1 = this.name + ":" + percent] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          return _this._costMetPercent().times(percent).floor();
        };
      })(this)();
    };

    Unit.prototype.maxCostMetOfVelocity = function() {
      var base, name1;
      return (base = this.game.cache.unitMaxCostMetOfVelocity)[name1 = "" + this.name] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          return _this._costMetPercentOfVelocity();
        };
      })(this)();
    };

    Unit.prototype.maxCostMetOfVelocityReciprocal = function() {
      return (new Decimal(1)).dividedBy(this.maxCostMetOfVelocity());
    };

    Unit.prototype.isCostMet = function() {
      return this.maxCostMet().greaterThan(0);
    };

    Unit.prototype.isBuyable = function(ignoreCost) {
      if (ignoreCost == null) {
        ignoreCost = false;
      }
      return (this.isCostMet() || ignoreCost) && this.isBuyButtonVisible() && !this.unittype.unbuyable;
    };

    Unit.prototype.buyMax = function(percent) {
      return this.buy(this.maxCostMet(percent));
    };

    Unit.prototype.twinMult = function() {
      var ret;
      ret = new Decimal(1);
      ret = ret.plus(this.stat('twinbase', 0));
      ret = ret.times(this.stat('twin', 1));
      return ret;
    };

    Unit.prototype.buy = function(num) {
      if (num == null) {
        num = 1;
      }
      if (!this.isCostMet()) {
        throw new Error("We require more resources");
      }
      if (!this.isBuyable()) {
        throw new Error("Cannot buy that unit");
      }
      num = Decimal.min(num, this.maxCostMet());
      return this.game.withSave((function(_this) {
        return function() {
          var cost, effect, i, j, len, len1, ref, ref1, twinnum;
          ref = _this.eachCost();
          for (i = 0, len = ref.length; i < len; i++) {
            cost = ref[i];
            cost.unit._subtractCount(cost.val.times(num));
          }
          twinnum = num.times(_this.twinMult());
          _this._addCount(twinnum);
          ref1 = _this.effect;
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            effect = ref1[j];
            effect.onBuyUnit(twinnum);
          }
          if (_this.name === 'energy') {
            _this.game.unit('mtxEnergy')._addCount(twinnum);
          }
          return {
            num: num,
            twinnum: twinnum
          };
        };
      })(this));
    };

    Unit.prototype.isNewlyUpgradable = function() {
      var ref, ref1, ref2, upgrades;
      upgrades = (ref = (ref1 = this.showparent) != null ? (ref2 = ref1.upgrades) != null ? ref2.list : void 0 : void 0) != null ? ref : this.upgrades.list;
      return _.some(upgrades, function(upgrade) {
        return upgrade.isVisible() && upgrade.isNewlyUpgradable();
      });
    };

    Unit.prototype.totalProduction = function() {
      var base, name1;
      return (base = this.game.cache.totalProduction)[name1 = this.name] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          var count, key, ref, ret, val;
          ret = {};
          count = _this.count().floor();
          ref = _this.eachProduction();
          for (key in ref) {
            val = ref[key];
            ret[key] = val.times(count);
          }
          return ret;
        };
      })(this)();
    };

    Unit.prototype.eachProduction = function() {
      var base, name1;
      return (base = this.game.cache.eachProduction)[name1 = this.name] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          var i, len, prod, ref, ret;
          ret = {};
          ref = _this.prod;
          for (i = 0, len = ref.length; i < len; i++) {
            prod = ref[i];
            ret[prod.unit.unittype.name] = (prod.val.plus(_this.stat('base', 0))).times(_this.stat('prod', 1));
          }
          return ret;
        };
      })(this)();
    };

    Unit.prototype.eachCost = function() {
      var base, name1;
      return (base = this.game.cache.eachCost)[name1 = this.name] != null ? base[name1] : base[name1] = _.map(this.cost, (function(_this) {
        return function(cost) {
          cost = _.clone(cost);
          cost.val = cost.val.times(_this.stat('cost', 1)).times(_this.stat("cost." + cost.unit.unittype.name, 1));
          return cost;
        };
      })(this));
    };

    Unit.prototype.velocity = function() {
      var base, name1;
      return (base = this.game.cache.velocity)[name1 = this.name] != null ? base[name1] : base[name1] = Decimal.min(UNIT_LIMIT, this._producerPath.getDegreeCoefficient(1, true));
    };

    Unit.prototype.isVelocityConstant = function() {
      return this._producerPath.getMaxCoefficient() <= 1;
    };

    Unit.prototype.hasStat = function(key, default_) {
      if (default_ == null) {
        default_ = void 0;
      }
      return (this.stats()[key] != null) && this.stats()[key] !== default_;
    };

    Unit.prototype.stat = function(key, default_) {
      var ref, ret;
      if (default_ == null) {
        default_ = void 0;
      }
      util.assert(key != null);
      if (default_ != null) {
        default_ = new Decimal(default_);
      }
      ret = (ref = this.stats()[key]) != null ? ref : default_;
      util.assert(ret != null, 'no such stat', this.name, key);
      return new Decimal(ret);
    };

    Unit.prototype.stats = function() {
      var base, name1;
      return (base = this.game.cache.stats)[name1 = this.name] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          var i, j, len, len1, ref, ref1, schema, stats, uniteffect, upgrade;
          stats = {};
          schema = {};
          ref = _this.upgrades.list;
          for (i = 0, len = ref.length; i < len; i++) {
            upgrade = ref[i];
            upgrade.calcStats(stats, schema);
          }
          ref1 = _this.affectedBy;
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            uniteffect = ref1[j];
            uniteffect.calcStats(stats, schema, uniteffect.parent.count());
          }
          return stats;
        };
      })(this)();
    };

    Unit.prototype.statistics = function() {
      var ref, ref1, ref2;
      return (ref = (ref1 = this.game.session.state.statistics) != null ? (ref2 = ref1.byUnit) != null ? ref2[this.name] : void 0 : void 0) != null ? ref : {};
    };

    Unit.prototype.url = function() {
      return this.tab.url(this);
    };

    Unit.prototype.addUnitTimer = function() {
      var key, ref;
      key = "addUnitTimed-" + this.name;
      return (ref = this.game.session.state.date[key]) != null ? ref : new Date(0);
    };

    Unit.prototype.addUnitTimerElapsedMillis = function(now) {
      if (now == null) {
        now = this.game.now;
      }
      return now.getTime() - this.addUnitTimer().getTime();
    };

    Unit.prototype.addUnitTimerRemainingMillis = function(durationMillis, now) {
      if (now == null) {
        now = this.game.now;
      }
      return Math.max(0, durationMillis - this.addUnitTimerElapsedMillis(now));
    };

    Unit.prototype.isAddUnitTimerReady = function(durationMillis, now) {
      if (now == null) {
        now = this.game.now;
      }
      return this.addUnitTimerRemainingMillis(durationMillis) === 0;
    };

    Unit.prototype.setAddUnitTimer = function(now) {
      var key;
      if (now == null) {
        now = this.game.now;
      }
      key = "addUnitTimed-" + this.name;
      this.game.session.state.date[key] = now;
      return util.assert(this.addUnitTimerElapsedMillis(now) === 0);
    };

    return Unit;

  })();
});


/**
  * @ngdoc service
  * @name swarmApp.unittypes
  * @description
  * # unittypes
  * Factory in the swarmApp.
 */

angular.module('swarmApp').factory('UnitType', [], function() {
  var Unit;
  return Unit = (function() {
    function Unit(data) {
      _.extend(this, data);
      this.producerPath = {};
      this.producerPathList = [];
    }

    Unit.prototype.producerNames = function() {
      return _.mapValues(this.producerPath, function(paths) {
        return _.map(paths, function(path) {
          return _.map(path, 'name');
        });
      });
    };

    return Unit;

  })();
});

angular.module('swarmApp').factory('UnitTypes', ["spreadsheetUtil","UnitType","util","$log"], function(spreadsheetUtil, UnitType, util, $log) {
  var UnitTypes;
  return UnitTypes = (function() {
    function UnitTypes(unittypes) {
      var i, len, unittype;
      if (unittypes == null) {
        unittypes = [];
      }
      this.list = [];
      this.byName = {};
      for (i = 0, len = unittypes.length; i < len; i++) {
        unittype = unittypes[i];
        this.register(unittype);
      }
    }

    UnitTypes.prototype.register = function(unittype) {
      this.list.push(unittype);
      return this.byName[unittype.name] = unittype;
    };

    UnitTypes._buildProducerPath = function(unittype, producer, path) {
      var base, i, len, name1, nextgen, ref, results;
      path = [producer].concat(path);
      unittype.producerPathList.push(path);
      if ((base = unittype.producerPath)[name1 = producer.name] == null) {
        base[name1] = [];
      }
      unittype.producerPath[producer.name].push(path);
      ref = producer.producedBy;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        nextgen = ref[i];
        results.push(this._buildProducerPath(unittype, nextgen, path));
      }
      return results;
    };

    UnitTypes.parseSpreadsheet = function(effecttypes, data) {
      var cost, i, j, k, l, len, len1, len2, len3, len4, len5, m, n, prod, producer, ref, ref1, ref2, ref3, ref4, ref5, ret, row, rows, unittype;
      rows = spreadsheetUtil.parseRows({
        name: ['cost', 'prod', 'warnfirst', 'requires', 'cap', 'effect']
      }, data.data.unittypes.elements);
      ret = new UnitTypes((function() {
        var i, len, results;
        results = [];
        for (i = 0, len = rows.length; i < len; i++) {
          row = rows[i];
          results.push(new UnitType(row));
        }
        return results;
      })());
      ref = ret.list;
      for (i = 0, len = ref.length; i < len; i++) {
        unittype = ref[i];
        unittype.producedBy = [];
        unittype.affectedBy = [];
      }
      ref1 = ret.list;
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        unittype = ref1[j];
        if (unittype.showparent) {
          spreadsheetUtil.resolveList([unittype], 'showparent', ret.byName);
        }
        spreadsheetUtil.resolveList(unittype.cost, 'unittype', ret.byName);
        spreadsheetUtil.resolveList(unittype.prod, 'unittype', ret.byName);
        spreadsheetUtil.resolveList(unittype.warnfirst, 'unittype', ret.byName);
        spreadsheetUtil.resolveList(unittype.requires, 'unittype', ret.byName, {
          required: false
        });
        spreadsheetUtil.resolveList(unittype.cap, 'unittype', ret.byName, {
          required: false
        });
        spreadsheetUtil.resolveList(unittype.effect, 'unittype', ret.byName);
        spreadsheetUtil.resolveList(unittype.effect, 'type', effecttypes.byName);
        unittype.slug = unittype.label;
        ref2 = unittype.prod;
        for (k = 0, len2 = ref2.length; k < len2; k++) {
          prod = ref2[k];
          prod.unittype.producedBy.push(unittype);
          util.assert(prod.val > 0, "unittype prod.val must be positive", prod);
        }
        ref3 = unittype.cost;
        for (l = 0, len3 = ref3.length; l < len3; l++) {
          cost = ref3[l];
          util.assert(cost.val > 0 || (unittype.unbuyable && unittype.disabled), "unittype cost.val must be positive", cost);
        }
      }
      ref4 = ret.list;
      for (m = 0, len4 = ref4.length; m < len4; m++) {
        unittype = ref4[m];
        ref5 = unittype.producedBy;
        for (n = 0, len5 = ref5.length; n < len5; n++) {
          producer = ref5[n];
          this._buildProducerPath(unittype, producer, []);
        }
      }
      $log.debug('built unittypes', ret);
      return ret;
    };

    return UnitTypes;

  })();
});


/**
  * @ngdoc service
  * @name swarmApp.units
  * @description
  * # units
  * Service in the swarmApp.
 */

angular.module('swarmApp').factory('unittypes', ["UnitTypes","effecttypes","spreadsheet"], function(UnitTypes, effecttypes, spreadsheet) {
  return UnitTypes.parseSpreadsheet(effecttypes, spreadsheet);
});

'use strict';
angular.module('swarmApp').factory('Upgrade', ["util","Effect","$log"], function(util, Effect, $log) {
  var ONE, Upgrade;
  ONE = new Decimal(1);
  return Upgrade = (function() {
    function Upgrade(game, type) {
      this.game = game;
      this.type = type;
      this.name = this.type.name;
      this.unit = util.assert(this.game.unit(this.type.unittype));
    }

    Upgrade.prototype._init = function() {
      this.costByName = {};
      this.cost = _.map(this.type.cost, (function(_this) {
        return function(cost) {
          var ret;
          util.assert(cost.unittype, 'upgrade cost without a unittype', _this.name, name, cost);
          ret = _.clone(cost);
          ret.unit = util.assert(_this.game.unit(cost.unittype));
          ret.val = new Decimal(ret.val);
          ret.factor = new Decimal(ret.factor);
          _this.costByName[ret.unit.name] = ret;
          return ret;
        };
      })(this));
      this.requires = _.map(this.type.requires, (function(_this) {
        return function(require) {
          var ret;
          util.assert(require.unittype, 'upgrade require without a unittype', _this.name, name, require);
          ret = _.clone(require);
          ret.unit = util.assert(_this.game.unit(require.unittype));
          ret.val = new Decimal(ret.val);
          return ret;
        };
      })(this));
      this.effect = _.map(this.type.effect, (function(_this) {
        return function(effect) {
          return new Effect(_this.game, _this, effect);
        };
      })(this));
      return this.effectByType = _.groupBy(this.effect, 'type.name');
    };

    Upgrade.prototype.count = function() {
      var ref, ret;
      ret = (ref = this.game.session.state.upgrades[this.name]) != null ? ref : 0;
      if (_.isNaN(ret)) {
        util.error("count is NaN! resetting to zero. " + this.name);
        ret = 0;
      }
      if (this.type.maxlevel) {
        ret = Decimal.min(this.type.maxlevel, ret);
      }
      return new Decimal(ret);
    };

    Upgrade.prototype._setCount = function(val) {
      this.game.session.state.upgrades[this.name] = new Decimal(val);
      return this.game.cache.onUpdate();
    };

    Upgrade.prototype._addCount = function(val) {
      return this._setCount(this.count().plus(val));
    };

    Upgrade.prototype._subtractCount = function(val) {
      return this._addCount(new Decimal(val).negated());
    };

    Upgrade.prototype.isVisible = function() {
      if (!this.unit.isVisible() && !this.unit.unittype.disabled) {
        return false;
      }
      if ((this.type.maxlevel != null) && this.count().greaterThanOrEqualTo(this.type.maxlevel)) {
        return false;
      }
      if (this.type.disabled) {
        return false;
      }
      if (this.game.cache.upgradeVisible[this.name]) {
        return true;
      }
      return this.game.cache.upgradeVisible[this.name] = this._isVisible();
    };

    Upgrade.prototype._isVisible = function() {
      var j, len, ref, require;
      if (this.count().greaterThan(0)) {
        return true;
      }
      ref = this.requires;
      for (j = 0, len = ref.length; j < len; j++) {
        require = ref[j];
        if (require.val.greaterThan(require.unit.count())) {
          return false;
        }
      }
      return true;
    };

    Upgrade.prototype.totalCost = function() {
      var base, name1;
      return (base = this.game.cache.upgradeTotalCost)[name1 = this.name] != null ? base[name1] : base[name1] = this._totalCost();
    };

    Upgrade.prototype._totalCost = function(count) {
      if (count == null) {
        count = this.count().plus(this.unit.stat('upgradecost', 0));
      }
      return _.map(this.cost, (function(_this) {
        return function(cost) {
          var total;
          total = _.clone(cost);
          total.val = total.val.times(Decimal.pow(total.factor, count)).times(_this.unit.stat("upgradecostmult", 1)).times(_this.unit.stat("upgradecostmult." + _this.name, 1));
          return total;
        };
      })(this));
    };

    Upgrade.prototype.sumCost = function(num, startCount) {
      return _.map(this._totalCost(startCount), function(cost0) {
        var cost;
        cost = _.clone(cost0);
        if (cost.factor.equals(1)) {
          cost.val = cost.val.times(num);
        } else {
          cost.val = cost.val.times(ONE.minus(Decimal.pow(cost.factor, num)).dividedBy(ONE.minus(cost.factor)));
        }
        return cost;
      });
    };

    Upgrade.prototype.isCostMet = function() {
      return this.maxCostMet().greaterThan(0);
    };

    Upgrade.prototype.maxCostMet = function(percent) {
      var base, name1;
      if (percent == null) {
        percent = 1;
      }
      return (base = this.game.cache.upgradeMaxCostMet)[name1 = this.name + ":" + percent] != null ? base[name1] : base[name1] = (function(_this) {
        return function() {
          var cost, j, k, len, len1, m, max, ref, ref1;
          max = new Decimal(2e308);
          if (_this.type.maxlevel) {
            max = new Decimal(_this.type.maxlevel).minus(_this.count());
          }
          ref = _this.totalCost();
          for (j = 0, len = ref.length; j < len; j++) {
            cost = ref[j];
            util.assert(cost.val.greaterThan(0), 'upgrade cost <= 0', _this.name, _this);
            if (cost.factor.equals(1)) {
              m = cost.unit.count().dividedBy(cost.val);
            } else {
              m = ONE.minus(cost.unit.count().times(percent).times(ONE.minus(cost.factor)).dividedBy(cost.val)).log().dividedBy(cost.factor.log());
            }
            max = Decimal.min(max, m);
          }
          max = max.floor();
          if (max.greaterThanOrEqualTo(0)) {
            ref1 = _this.sumCost(max);
            for (k = 0, len1 = ref1.length; k < len1; k++) {
              cost = ref1[k];
              if (cost.unit.count().lessThan(cost.val)) {
                $log.debug('maxCostMet corrected its own precision');
                return max.minus(1);
              }
            }
          }
          return max;
        };
      })(this)();
    };

    Upgrade.prototype.isMaxAffordable = function() {
      return (this.type.maxlevel != null) && this.maxCostMet().greaterThanOrEqualTo(this.type.maxlevel);
    };

    Upgrade.prototype.costMetPercent = function() {
      var cost, costOfMet, count, j, len, max, ref, val;
      costOfMet = _.keyBy(this.sumCost(this.maxCostMet()), function(c) {
        return c.unit.name;
      });
      max = new Decimal(2e308);
      if (this.isMaxAffordable()) {
        return ONE;
      }
      ref = this.sumCost(this.maxCostMet().plus(1));
      for (j = 0, len = ref.length; j < len; j++) {
        cost = ref[j];
        count = cost.unit.count().minus(costOfMet[cost.unit.name].val);
        val = cost.val.minus(costOfMet[cost.unit.name].val);
        max = Decimal.min(max, count.dividedBy(val));
      }
      return Decimal.min(1, Decimal.max(0, max));
    };

    Upgrade.prototype.estimateSecsUntilBuyable = function(noRecurse) {
      var base, cached, name1, ret;
      if (this.isMaxAffordable()) {
        return {
          val: new Decimal(2e308)
        };
      }
      cached = this.game.cache.upgradeEstimateSecsUntilBuyableCacheSafe[this.name];
      if (cached == null) {
        cached = (base = this.game.cache.upgradeEstimateSecsUntilBuyablePeriodic)[name1 = this.name] != null ? base[name1] : base[name1] = this._estimateSecsUntilBuyable();
        if (cached.cacheSafe) {
          this.game.cache.upgradeEstimateSecsUntilBuyableCacheSafe[this.name] = cached;
        }
      }
      ret = _.extend({
        val: cached.rawVal.plus((cached.now - this.game.now.getTime()) / 1000)
      }, cached);
      if (ret.val.lessThanOrEqualTo(0) && !noRecurse) {
        delete this.game.cache.upgradeEstimateSecsUntilBuyableCacheSafe[this.name];
        delete this.game.cache.upgradeEstimateSecsUntilBuyablePeriodic[this.name];
        ret = this.estimateSecsUntilBuyable(true);
      }
      return ret;
    };

    Upgrade.prototype._estimateSecsUntilBuyable = function() {
      var cacheSafe, cost, costOfMet, j, len, max, ref, secs;
      costOfMet = _.keyBy(this.sumCost(this.maxCostMet()), function(c) {
        return c.unit.name;
      });
      cacheSafe = true;
      max = {
        rawVal: new Decimal(0),
        unit: null
      };
      if ((this.type.maxlevel != null) && this.maxCostMet().plus(1).greaterThan(this.type.maxlevel)) {
        return 0;
      }
      ref = this.sumCost(this.maxCostMet().plus(1));
      for (j = 0, len = ref.length; j < len; j++) {
        cost = ref[j];
        secs = cost.unit.estimateSecsUntilEarned(cost.val);
        if (max.rawVal.lessThan(secs)) {
          max = {
            rawVal: secs,
            unit: cost.unit,
            now: this.game.now.getTime()
          };
        }
        cacheSafe &= cost.unit.isEstimateCacheable();
      }
      max.cacheSafe = cacheSafe;
      return max;
    };

    Upgrade.prototype.isUpgradable = function(costPercent, useWatchedAt) {
      var base, name1;
      if (costPercent == null) {
        costPercent = void 0;
      }
      if (useWatchedAt == null) {
        useWatchedAt = false;
      }
      if (useWatchedAt) {
        costPercent = new Decimal(costPercent != null ? costPercent : 1).dividedBy(this.watchedDivisor());
      }
      return (base = this.game.cache.upgradeIsUpgradable)[name1 = this.name + ":" + costPercent] != null ? base[name1] : base[name1] = this.type["class"] === 'upgrade' && this.isBuyable() && this.maxCostMet(costPercent).greaterThan(0);
    };

    Upgrade.prototype.isAutobuyable = function() {
      return this.watchedAt() > 0;
    };

    Upgrade.prototype.isNewlyUpgradable = function(costPercent) {
      if (costPercent == null) {
        costPercent = 1;
      }
      return this.watchedAt() > 0 && this.isUpgradable(costPercent / this.watchedDivisor());
    };

    Upgrade.prototype.isBuyable = function() {
      return this.isCostMet() && this.isVisible();
    };

    Upgrade.prototype.buy = function(num) {
      if (num == null) {
        num = 1;
      }
      if (!this.isCostMet()) {
        throw new Error("We require more resources");
      }
      if (!this.isBuyable()) {
        throw new Error("Cannot buy that upgrade");
      }
      num = Decimal.min(num, this.maxCostMet());
      $log.debug('buy', this.name, num);
      return this.game.withSave((function(_this) {
        return function() {
          var cost, count, effect, i, j, k, l, len, len1, ref, ref1, ref2;
          ref = _this.sumCost(num);
          for (j = 0, len = ref.length; j < len; j++) {
            cost = ref[j];
            util.assert(cost.unit.count().greaterThanOrEqualTo(cost.val), "tried to buy more than we can afford. upgrade.maxCostMet is broken!", _this.name, name, cost);
            util.assert(cost.val.greaterThan(0), "zero cost from sumCost, yet cost was met?", _this.name, name, cost);
            cost.unit._subtractCount(cost.val);
          }
          count = _this.count();
          _this._addCount(num);
          for (i = k = 0, ref1 = num.toNumber(); 0 <= ref1 ? k < ref1 : k > ref1; i = 0 <= ref1 ? ++k : --k) {
            ref2 = _this.effect;
            for (l = 0, len1 = ref2.length; l < len1; l++) {
              effect = ref2[l];
              effect.onBuy(count.plus(i + 1));
            }
          }
          return num;
        };
      })(this));
    };

    Upgrade.prototype.buyMax = function(percent) {
      return this.buy(this.maxCostMet(percent));
    };

    Upgrade.prototype.calcStats = function(stats, schema) {
      var count, effect, j, len, ref;
      if (stats == null) {
        stats = {};
      }
      if (schema == null) {
        schema = {};
      }
      count = this.count();
      ref = this.effect;
      for (j = 0, len = ref.length; j < len; j++) {
        effect = ref[j];
        effect.calcStats(stats, schema, count);
      }
      return stats;
    };

    Upgrade.prototype.statistics = function() {
      var ref, ref1, ref2;
      return (ref = (ref1 = this.game.session.state.statistics) != null ? (ref2 = ref1.byUpgrade) != null ? ref2[this.name] : void 0 : void 0) != null ? ref : {};
    };

    Upgrade.prototype._watchedAtDefault = function() {
      var ref;
      return ((ref = this.unit.tab) != null ? ref.name : void 0) !== 'mutagen';
    };

    Upgrade.prototype.isManuallyHidden = function() {
      return this.watchedAt() < 0;
    };

    Upgrade.prototype.watchedAt = function() {
      var base, ref, watched;
      if ((base = this.game.session.state).watched == null) {
        base.watched = {};
      }
      watched = (ref = this.game.session.state.watched[this.name]) != null ? ref : this._watchedAtDefault();
      if (typeof watched === 'boolean') {
        if (watched) {
          return 1;
        } else {
          return 0;
        }
      }
      return watched;
    };

    Upgrade.prototype.watchedDivisor = function() {
      return Math.max(this.watchedAt(), 1);
    };

    Upgrade.prototype.watch = function(state) {
      return this.game.withUnreifiedSave((function(_this) {
        return function() {
          var base;
          if ((base = _this.game.session.state).watched == null) {
            base.watched = {};
          }
          if (state !== _this._watchedAtDefault()) {
            return _this.game.session.state.watched[_this.name] = state;
          } else {
            return delete _this.game.session.state.watched[_this.name];
          }
        };
      })(this));
    };

    return Upgrade;

  })();
});

angular.module('swarmApp').factory('UpgradeType', [], function() {
  var UpgradeType;
  return UpgradeType = (function() {
    function UpgradeType(data) {
      _.extend(this, data);
    }

    return UpgradeType;

  })();
});

angular.module('swarmApp').factory('UpgradeTypes', ["spreadsheetUtil","UpgradeType","util"], function(spreadsheetUtil, UpgradeType, util) {
  var UpgradeTypes;
  return UpgradeTypes = (function() {
    function UpgradeTypes(unittypes1, upgrades) {
      var j, len, upgrade;
      this.unittypes = unittypes1;
      if (upgrades == null) {
        upgrades = [];
      }
      this.list = [];
      this.byName = {};
      for (j = 0, len = upgrades.length; j < len; j++) {
        upgrade = upgrades[j];
        this.register(upgrade);
      }
    }

    UpgradeTypes.prototype.register = function(upgrade) {
      util.assert(upgrade.name, 'upgrade without a name', upgrade);
      this.list.push(upgrade);
      return this.byName[upgrade.name] = upgrade;
    };

    UpgradeTypes.parseSpreadsheet = function(unittypes, effecttypes, data) {
      var cost, j, k, l, len, len1, len2, ref, ref1, ref2, ret, row, rows, unittype, upgrade;
      rows = spreadsheetUtil.parseRows({
        name: ['requires', 'cost', 'effect']
      }, data.data.upgrades.elements);
      ret = new UpgradeTypes(unittypes, (function() {
        var j, len, results;
        results = [];
        for (j = 0, len = rows.length; j < len; j++) {
          row = rows[j];
          if (row.name) {
            results.push(new UpgradeType(row));
          }
        }
        return results;
      })());
      ref = ret.list;
      for (j = 0, len = ref.length; j < len; j++) {
        upgrade = ref[j];
        spreadsheetUtil.resolveList([upgrade], 'unittype', unittypes.byName);
        spreadsheetUtil.resolveList(upgrade.cost, 'unittype', unittypes.byName);
        spreadsheetUtil.resolveList(upgrade.requires, 'unittype', unittypes.byName);
        spreadsheetUtil.resolveList(upgrade.effect, 'unittype', unittypes.byName, {
          required: false
        });
        spreadsheetUtil.resolveList(upgrade.effect, 'upgradetype', ret.byName, {
          required: false
        });
        spreadsheetUtil.resolveList(upgrade.effect, 'type', effecttypes.byName);
        ref1 = upgrade.cost;
        for (k = 0, len1 = ref1.length; k < len1; k++) {
          cost = ref1[k];
          util.assert(cost.val > 0, "upgradetype cost.val must be positive", cost);
          if (upgrade.maxlevel === 1 && !cost.factor) {
            cost.factor = 1;
          }
          util.assert(cost.factor > 0, "upgradetype cost.factor must be positive", cost);
        }
      }
      ref2 = unittypes.list;
      for (l = 0, len2 = ref2.length; l < len2; l++) {
        unittype = ref2[l];
        spreadsheetUtil.resolveList(unittype.requires, 'upgradetype', ret.byName, {
          required: false
        });
      }
      return ret;
    };

    return UpgradeTypes;

  })();
});


/**
  * @ngdoc service
  * @name swarmApp.upgrade
  * @description
  * # upgrade
  * Factory in the swarmApp.
 */

angular.module('swarmApp').factory('upgradetypes', ["UpgradeTypes","unittypes","effecttypes","spreadsheet"], function(UpgradeTypes, unittypes, effecttypes, spreadsheet) {
  return UpgradeTypes.parseSpreadsheet(unittypes, effecttypes, spreadsheet);
});

'use strict';
angular.module('swarmApp').factory('Achievement', ["util","$log","$rootScope","$filter"], function(util, $log, $rootScope, $filter) {
  var Achievement;
  return Achievement = (function() {
    function Achievement(game1, type) {
      this.game = game1;
      this.type = type;
      this.name = this.type.name;
    }

    Achievement.prototype._init = function() {
      var base;
      if ((base = this.game.session.state).achievements == null) {
        base.achievements = {};
      }
      this.requires = _.map(this.type.requires, (function(_this) {
        return function(require) {
          require = _.clone(require);
          if (require.unittype) {
            require.resource = require.unit = util.assert(_this.game.unit(require.unittype));
          }
          if (require.upgradetype) {
            require.resource = require.upgrade = util.assert(_this.game.upgrade(require.upgradetype));
          }
          util.assert(!(require.unit && require.upgrade), "achievement requirement can't have both unit and upgrade", _this.name);
          return require;
        };
      })(this));
      util.assert(this.requires.length <= 1, 'multiple achievement requirements not yet supported', this.name);
      return this.visible = _.map(this.type.visible, (function(_this) {
        return function(visible) {
          visible = _.clone(visible);
          if (visible.unittype) {
            visible.resource = visible.unit = util.assert(_this.game.unit(visible.unittype));
          }
          if (visible.upgradetype) {
            visible.resource = visible.upgrade = util.assert(_this.game.upgrade(visible.upgradetype));
          }
          util.assert(!!visible.unit !== !!visible.upgrade, "achievement visiblity must have unit xor upgrade", _this.name);
          return visible;
        };
      })(this));
    };

    Achievement.prototype.description = function() {
      var desc;
      desc = this.type.description;
      if (this.type.requires.length > 0 && (this.type.requires[0].unittype || this.type.requires[0].upgradetype)) {
        desc = desc.replace('$REQUIRED', $filter('longnum')(this.type.requires[0].val, void 0, {
          sigfigs: void 0
        }));
      }
      return desc;
    };

    Achievement.prototype.isEarned = function() {
      return this.game.session.state.achievements[this.name] != null;
    };

    Achievement.prototype.earn = function(elapsed) {
      if (elapsed == null) {
        elapsed = this.game.elapsedStartMillis();
      }
      if (!this.isEarned()) {
        this.game.withUnreifiedSave((function(_this) {
          return function() {
            return _this.game.session.state.achievements[_this.name] = elapsed;
          };
        })(this));
        return $rootScope.$emit('achieve', this);
      }
    };

    Achievement.prototype.earnedAtMillisElapsed = function() {
      return this.game.session.state.achievements[this.name];
    };

    Achievement.prototype.earnedAtMoment = function() {
      var ret;
      if (this.isEarned() == null) {
        return void 0;
      }
      ret = moment(this.game.session.state.date.started);
      ret.add(this.game.session.state.achievements[this.name], 'ms');
      return ret;
    };

    Achievement.prototype.pointsEarned = function() {
      if (this.isEarned()) {
        return this.type.points;
      } else {
        return 0;
      }
    };

    Achievement.prototype.isMasked = function() {
      return !this.isUnmasked();
    };

    Achievement.prototype.isUnmasked = function() {
      var i, len, ref, visible;
      if (this.visible.length === 0) {
        return false;
      }
      ref = this.visible;
      for (i = 0, len = ref.length; i < len; i++) {
        visible = ref[i];
        if (visible.resource.count().lessThan(visible.val)) {
          return false;
        }
      }
      return true;
    };

    Achievement.prototype.hasProgress = function() {
      var i, len, ref, req;
      ref = this.requires;
      for (i = 0, len = ref.length; i < len; i++) {
        req = ref[i];
        if (req.resource != null) {
          return true;
        }
      }
      return false;
    };

    Achievement.prototype.progressMax = function() {
      if ((this.hasProgress() != null) && (this.requires[0].val != null)) {
        return new Decimal(this.requires[0].val);
      }
    };

    Achievement.prototype.progressVal = function() {
      var ref, req;
      req = this.requires[0];
      if (req.upgrade != null) {
        return req.upgrade.count();
      }
      if (req.unit != null) {
        if (req.unit.unittype.unbuyable) {
          return req.unit.count();
        }
        return new Decimal((ref = req.unit.statistics().twinnum) != null ? ref : 0);
      }
      return void 0;
    };

    Achievement.prototype.progressPercent = function() {
      if (this.hasProgress() != null) {
        return this.progressVal().dividedBy(this.progressMax());
      }
    };

    Achievement.prototype.progressOrder = function() {
      if (this.isEarned()) {
        return 2;
      }
      if (this.isMasked()) {
        return -2;
      }
      if (this.hasProgress() && this.progressMax() > 0) {
        return this.progressPercent().toNumber();
      }
      return -1;
    };

    return Achievement;

  })();
});

angular.module('swarmApp').factory('AchievementTypes', ["spreadsheetUtil","util","$log"], function(spreadsheetUtil, util, $log) {
  var AchievementTypes;
  return AchievementTypes = (function() {
    function AchievementTypes() {
      this.list = [];
      this.byName = {};
    }

    AchievementTypes.prototype.register = function(achievement) {
      this.list.push(achievement);
      return this.byName[achievement.name] = achievement;
    };

    AchievementTypes.prototype.pointsPossible = function() {
      return util.sum(_.map(this.list, function(a) {
        return a.points;
      }));
    };

    AchievementTypes.parseSpreadsheet = function(data, unittypes, upgradetypes) {
      var i, j, len, len1, ref, ret, row, rows;
      rows = spreadsheetUtil.parseRows({
        name: ['requires', 'visible']
      }, data.data.achievements.elements);
      ret = new AchievementTypes();
      for (i = 0, len = rows.length; i < len; i++) {
        row = rows[i];
        ret.register(row);
      }
      ref = ret.list;
      for (j = 0, len1 = ref.length; j < len1; j++) {
        row = ref[j];
        spreadsheetUtil.resolveList(row.requires, 'unittype', unittypes.byName, {
          required: false
        });
        spreadsheetUtil.resolveList(row.requires, 'upgradetype', upgradetypes.byName, {
          required: false
        });
        spreadsheetUtil.resolveList(row.visible, 'unittype', unittypes.byName, {
          required: false
        });
        spreadsheetUtil.resolveList(row.visible, 'upgradetype', upgradetypes.byName, {
          required: false
        });
        util.assert(row.points >= 0, 'achievement must have points', row.name, row);
        util.assert(_.isNumber(row.points), 'achievement points must be number', row.name, row);
      }
      return ret;
    };

    return AchievementTypes;

  })();
});

angular.module('swarmApp').factory('AchievementsListener', ["util","$log"], function(util, $log) {
  var AchievementsListener;
  return AchievementsListener = (function() {
    function AchievementsListener(game1, scope) {
      this.game = game1;
      this.scope = scope;
      this._listen(this.scope);
    }

    AchievementsListener.prototype.achieveUnit = function(unitname, rawcount) {
      var achieve, count, i, len, ref, require, results;
      if (rawcount == null) {
        rawcount = false;
      }
      ref = this.game.achievementlist();
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        achieve = ref[i];
        results.push((function() {
          var j, len1, ref1, ref2, results1;
          ref1 = achieve.requires;
          results1 = [];
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            require = ref1[j];
            if (!require.event && require.unit && require.val) {
              if (rawcount) {
                count = require.unit.count();
              } else {
                count = (ref2 = require.unit.statistics().twinnum) != null ? ref2 : 0;
                count = new Decimal(count);
              }
              $log.debug('achievement check: unitcount after command', require.unit.name, count + '', (count != null) && count >= require.val);
              if ((count != null) && count.greaterThanOrEqualTo(require.val)) {
                $log.debug('earned', achieve.name, achieve);
                results1.push(achieve.earn());
              } else {
                results1.push(void 0);
              }
            } else {
              results1.push(void 0);
            }
          }
          return results1;
        })());
      }
      return results;
    };

    AchievementsListener.prototype.achieveUpgrade = function(upgradename) {
      var achieve, count, i, len, ref, require, results;
      ref = this.game.achievementlist();
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        achieve = ref[i];
        results.push((function() {
          var j, len1, ref1, results1;
          ref1 = achieve.requires;
          results1 = [];
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            require = ref1[j];
            if (!require.event && require.upgrade && require.val) {
              count = require.upgrade.count();
              $log.debug('achievement check: upgradecount after command', require.upgrade.name, count, (count != null) && count >= require.val);
              if ((count != null) && count.greaterThanOrEqualTo(require.val)) {
                $log.debug('earned', achieve.name, achieve);
                results1.push(achieve.earn());
              } else {
                results1.push(void 0);
              }
            } else {
              results1.push(void 0);
            }
          }
          return results1;
        })());
      }
      return results;
    };

    AchievementsListener.prototype._listen = function(scope) {
      var achieve, fn, i, len, ref;
      this.scope = scope;
      ref = this.game.achievementlist();
      fn = (function(_this) {
        return function(achieve) {
          var j, len1, ref1, require, results;
          ref1 = achieve.requires;
          results = [];
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            require = ref1[j];
            if (require.event && !require.unit) {
              results.push((function(require) {
                var cancelListen;
                if (require.val) {
                  require.val = JSON.parse(require.val);
                  $log.debug('parse event-achievement json', require.event, require.val);
                }
                return cancelListen = _this.scope.$on(require.event, function(event, param) {
                  var valid, validparam;
                  $log.debug('achieve listen', require.event, param, require.val);
                  if (require.val) {
                    validparam = _.pick(param, _.keys(require.val));
                    valid = _.isEqual(validparam, require.val);
                    $log.debug('validate', require.event, require.val, validparam, valid);
                    if (!valid) {
                      return;
                    }
                  }
                  return achieve.earn();
                });
              })(require));
            } else {
              results.push(void 0);
            }
          }
          return results;
        };
      })(this);
      for (i = 0, len = ref.length; i < len; i++) {
        achieve = ref[i];
        fn(achieve);
      }
      return this.scope.$on('command', (function(_this) {
        return function(event, cmd) {
          $log.debug('checking achievements for command', cmd);
          if (cmd.unitname != null) {
            _this.achieveUnit(cmd.unitname);
          }
          if (cmd.upgradename != null) {
            _this.achieveUpgrade(cmd.upgradename);
          }
          if (cmd.name === 'ascension') {
            $log.debug('ascending!', _this.game.unit('ascension').count());
            return _this.achieveUnit('ascension', true);
          }
        };
      })(this));
    };

    return AchievementsListener;

  })();
});

angular.module('swarmApp').factory('achievementslistener', ["AchievementsListener","game","$rootScope"], function(AchievementsListener, game, $rootScope) {
  return new AchievementsListener(game, $rootScope);
});


/**
  * @ngdoc service
  * @name swarmApp.achievements
  * @description
  * # achievements
  * Factory in the swarmApp.
 */

angular.module('swarmApp').factory('achievements', ["AchievementTypes","unittypes","upgradetypes","spreadsheet"], function(AchievementTypes, unittypes, upgradetypes, spreadsheet) {
  return AchievementTypes.parseSpreadsheet(spreadsheet, unittypes, upgradetypes);
});

'use strict';
angular.module('swarmApp').factory('Tab', [], function() {
  var Tab;
  return Tab = (function() {
    function Tab(leadunit, index1, name) {
      this.leadunit = leadunit;
      this.index = index1;
      this.name = name != null ? name : this.leadunit.name;
      this.units = [];
      this.sortedUnits = [];
      this.indexByUnitName = {};
      this.push(this.leadunit);
    }

    Tab.prototype.push = function(unit) {
      this.indexByUnitName[unit.name] = this.units.length;
      this.units.push(unit);
      return this.sortedUnits.unshift(unit);
    };

    Tab.prototype.next = function(unit) {
      var index, ref;
      index = this.indexByUnitName[(ref = unit != null ? unit.name : void 0) != null ? ref : unit];
      return this.units[index + 1];
    };

    Tab.prototype.prev = function(unit) {
      var index, ref;
      index = this.indexByUnitName[(ref = unit != null ? unit.name : void 0) != null ? ref : unit];
      return this.units[index - 1];
    };

    Tab.prototype.isVisible = function() {
      return this.leadunit.isVisible();
    };

    Tab.prototype.isNewlyUpgradable = function() {
      return _.some(this.units, function(unit) {
        return unit.isVisible() && unit.isNewlyUpgradable();
      });
    };

    Tab.prototype.sortUnits = function() {
      if (this.name === 'all') {
        return this.sortedUnits;
      }
      return _.sortBy(this.sortedUnits, function(u) {
        return -1 * u.stat('empower', 0);
      });
    };

    Tab.buildTabs = function(unitlist) {
      var all, i, len, ret, tab, unit;
      ret = {
        list: [],
        byName: {},
        byUnit: {}
      };
      all = null;
      for (i = 0, len = unitlist.length; i < len; i++) {
        unit = unitlist[i];
        if (unit.unittype.tab && !unit.unittype.disabled) {
          tab = ret.byName[unit.unittype.tab];
          if (tab != null) {
            tab.push(unit);
          } else {
            tab = ret.byName[unit.unittype.tab] = new Tab(unit, ret.list.length);
            ret.list.push(tab);
          }
          ret.byUnit[unit.name] = tab;
          if (!all) {
            all = ret.byName.all = new Tab(unit, 1, 'all');
          } else {
            all.push(unit);
          }
        }
      }
      all.sortedUnits.reverse();
      return ret;
    };

    Tab.prototype.url = function(unit) {
      var unitsuffix;
      if (unit == null) {
        unit = this.lastselected;
      }
      unitsuffix = unit ? "/unit/" + unit.unittype.slug : "";
      return "/tab/" + this.name + unitsuffix;
    };

    return Tab;

  })();
});

'use strict';
var slice = [].slice;

angular.module('swarmApp').factory('Cache', [], function() {
  var Cache;
  return Cache = (function() {
    function Cache() {
      this.firstSpawn = {};
      this.onUpdate();
      this.onRespec();
    }

    Cache.prototype.onPeriodic = function() {
      this._lastPeriodicClear = new Date().getTime();
      this.upgradeIsUpgradable = {};
      return this.upgradeEstimateSecsUntilBuyablePeriodic = {};
    };

    Cache.prototype.onUpdate = function() {
      this.onPeriodic();
      this.onTick();
      this.tinyUrl = {};
      this.stats = {};
      this.eachCost = {};
      this.eachProduction = {};
      this.upgradeTotalCost = {};
      this.producerPathProdEach = {};
      this.producerPathCoefficients = {};
      this.unitRawCount = {};
      this.unitCap = {};
      this.unitCapPercent = {};
      return this.upgradeEstimateSecsUntilBuyableCacheSafe = {};
    };

    Cache.prototype.onTick = function() {
      this.unitCount = {};
      this.velocity = {};
      this.totalProduction = {};
      this.upgradeMaxCostMet = {};
      this.unitMaxCostMet = {};
      this.unitMaxCostMetOfVelocity = {};
      delete this.tutorialStep;
      if (new Date().getTime() - this._lastPeriodicClear >= 3000) {
        return this.onPeriodic();
      }
    };

    Cache.prototype.onRespec = function() {
      this.unitVisible = {};
      return this.upgradeVisible = {};
    };

    return Cache;

  })();
});


/**
  * @ngdoc service
  * @name swarmApp.game
  * @description
  * # game
  * Factory in the swarmApp.
 */

angular.module('swarmApp').factory('Game', ["unittypes","upgradetypes","achievements","util","$log","Upgrade","Unit","Achievement","Tab","Cache"], function(unittypes, upgradetypes, achievements, util, $log, Upgrade, Unit, Achievement, Tab, Cache) {
  var Game;
  return Game = (function() {
    function Game(session1) {
      this.session = session1;
      this._init();
    }

    Game.prototype._init = function() {
      var base, i, item, j, len, len1, ref, ref1, ref2, ref3, ref4;
      this._units = {
        list: _.map(unittypes.list, (function(_this) {
          return function(unittype) {
            return new Unit(_this, unittype);
          };
        })(this))
      };
      this._units.byName = _.keyBy(this._units.list, 'name');
      this._units.bySlug = _.keyBy(this._units.list, function(u) {
        return u.unittype.slug;
      });
      this._upgrades = {
        list: _.map(upgradetypes.list, (function(_this) {
          return function(upgradetype) {
            return new Upgrade(_this, upgradetype);
          };
        })(this))
      };
      this._upgrades.byName = _.keyBy(this._upgrades.list, 'name');
      this._achievements = {
        list: _.map(achievements.list, (function(_this) {
          return function(achievementtype) {
            return new Achievement(_this, achievementtype);
          };
        })(this))
      };
      this._achievements.byName = _.keyBy(this._achievements.list, 'name');
      this.achievementPointsPossible = achievements.pointsPossible();
      $log.debug('possiblepoints: ', this.achievementPointsPossible);
      this.tabs = Tab.buildTabs(this._units.list);
      this.skippedMillis = 0;
      this.gameSpeed = 1;
      if ((base = this.session.state).skippedMillis == null) {
        base.skippedMillis = 0;
      }
      ref = [].concat(this._units.list, this._upgrades.list, this._achievements.list);
      for (i = 0, len = ref.length; i < len; i++) {
        item = ref[i];
        item._init();
      }
      ref1 = this._units.list;
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        item = ref1[j];
        item._init2();
      }
      this.cache = new Cache();
      delete this.now;
      this.tick((ref2 = this.session) != null ? (ref3 = ref2.state) != null ? (ref4 = ref3.date) != null ? ref4.reified : void 0 : void 0 : void 0);
      return this.tick();
    };

    Game.prototype.diffMillis = function() {
      return this._realDiffMillis() * this.gameSpeed + this.skippedMillis;
    };

    Game.prototype._realDiffMillis = function() {
      var ret;
      ret = this.now.getTime() - this.session.state.date.reified.getTime();
      return Math.max(0, ret);
    };

    Game.prototype.diffSeconds = function() {
      return this.diffMillis() / 1000;
    };

    Game.prototype.skipMillis = function(millis) {
      millis = Math.floor(millis);
      this.skippedMillis += millis;
      return this.session.state.skippedMillis += millis;
    };

    Game.prototype.skipDuration = function(duration) {
      return this.skipMillis(duration.asMilliseconds());
    };

    Game.prototype.skipTime = function() {
      var args;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return this.skipDuration(moment.duration.apply(moment, args));
    };

    Game.prototype.setGameSpeed = function(speed) {
      this.reify();
      return this.gameSpeed = speed;
    };

    Game.prototype.totalSkippedMillis = function() {
      return this.session.state.skippedMillis;
    };

    Game.prototype.totalSkippedDuration = function() {
      return moment.duration(this.totalSkippedMillis());
    };

    Game.prototype.dateStarted = function() {
      return this.session.state.date.started;
    };

    Game.prototype.momentStarted = function() {
      return moment(this.dateStarted());
    };

    Game.prototype.tick = function(now, skipExpire) {
      var diffMillis;
      if (now == null) {
        now = new Date();
      }
      if (skipExpire == null) {
        skipExpire = false;
      }
      util.assert(now, "can't tick to undefined time", now);
      if ((!this.now) || this.now <= now) {
        this.now = now;
        return this.cache.onTick();
      } else {
        diffMillis = this.now.getTime() - now.getTime();
        return util.assert(diffMillis <= 120 * 1000, "tick tried to go back in time. System clock problem?", this.now, now, diffMillis);
      }
    };

    Game.prototype.elapsedStartMillis = function() {
      return this.now.getTime() - this.session.state.date.started.getTime();
    };

    Game.prototype.timestampMillis = function() {
      return this.elapsedStartMillis() + this.totalSkippedMillis();
    };

    Game.prototype.unit = function(unitname) {
      if (_.isUndefined(unitname)) {
        return void 0;
      }
      if (!_.isString(unitname)) {
        unitname = unitname.name;
      }
      return this._units.byName[unitname];
    };

    Game.prototype.unitBySlug = function(unitslug) {
      if (unitslug) {
        return this._units.bySlug[unitslug];
      }
    };

    Game.prototype.units = function() {
      return _.clone(this._units.byName);
    };

    Game.prototype.unitlist = function() {
      return _.clone(this._units.list);
    };

    Game.prototype.count = function(unitname, secs) {
      return this.unit(unitname).count(secs);
    };

    Game.prototype.counts = function() {
      return this.countUnits();
    };

    Game.prototype.countUnits = function() {
      return _.mapValues(this.units(), function(unit, name) {
        return unit.count();
      });
    };

    Game.prototype.countUpgrades = function() {
      return _.mapValues(this.upgrades(), function(upgrade, name) {
        return upgrade.count();
      });
    };

    Game.prototype.getNewlyUpgradableUnits = function() {
      var i, len, ref, results, u;
      ref = this.unitlist();
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        u = ref[i];
        if (u.isNewlyUpgradable() && u.isVisible()) {
          results.push(u);
        }
      }
      return results;
    };

    Game.prototype.upgrade = function(name) {
      if (!_.isString(name)) {
        name = name.name;
      }
      return this._upgrades.byName[name];
    };

    Game.prototype.upgrades = function() {
      return _.clone(this._upgrades.byName);
    };

    Game.prototype.upgradelist = function() {
      return _.clone(this._upgrades.list);
    };

    Game.prototype.availableUpgrades = function(costPercent) {
      var i, len, ref, results, u;
      if (costPercent == null) {
        costPercent = void 0;
      }
      ref = this.upgradelist();
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        u = ref[i];
        if (u.isVisible() && u.isUpgradable(costPercent, true)) {
          results.push(u);
        }
      }
      return results;
    };

    Game.prototype.availableAutobuyUpgrades = function(costPercent) {
      var i, len, ref, results, u;
      if (costPercent == null) {
        costPercent = void 0;
      }
      ref = this.availableUpgrades(costPercent);
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        u = ref[i];
        if (u.isAutobuyable()) {
          results.push(u);
        }
      }
      return results;
    };

    Game.prototype.ignoredUpgrades = function() {
      var i, len, ref, results, u;
      ref = this.upgradelist();
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        u = ref[i];
        if (u.isVisible() && u.isIgnored()) {
          results.push(u);
        }
      }
      return results;
    };

    Game.prototype.unignoredUpgrades = function() {
      var i, len, ref, results, u;
      ref = this.upgradelist();
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        u = ref[i];
        if (u.isVisible() && !u.isIgnored()) {
          results.push(u);
        }
      }
      return results;
    };

    Game.prototype.resourcelist = function() {
      return this.unitlist().concat(this.upgradelist());
    };

    Game.prototype.achievement = function(name) {
      if (!_.isString(name)) {
        name = name.name;
      }
      return this._achievements.byName[name];
    };

    Game.prototype.achievements = function() {
      return _.clone(this._achievements.byName);
    };

    Game.prototype.achievementlist = function() {
      return _.clone(this._achievements.list);
    };

    Game.prototype.achievementsSorted = function() {
      return _.sortBy(this.achievementlist(), function(a) {
        return a.earnedAtMillisElapsed();
      });
    };

    Game.prototype.achievementPoints = function() {
      return util.sum(_.map(this.achievementlist(), function(a) {
        return a.pointsEarned();
      }));
    };

    Game.prototype.achievementPercent = function() {
      return this.achievementPoints() / this.achievementPointsPossible;
    };

    Game.prototype.reify = function(skipSeconds) {
      var counts, secs;
      if (skipSeconds == null) {
        skipSeconds = 0;
      }
      secs = this.diffSeconds();
      counts = this.counts(secs);
      _.extend(this.session.state.unittypes, counts);
      this.skippedMillis = 0;
      this.session.state.skippedMillis += this.diffMillis() - this._realDiffMillis();
      this.session.state.date.reified = this.now;
      this.cache.onUpdate();
      return util.assert(0 === this.diffSeconds(), 'diffseconds != 0 after reify!');
    };

    Game.prototype.save = function() {
      return this.withSave(function() {});
    };

    Game.prototype.importSave = function(encoded, transient) {
      this.session.importSave(encoded, transient);
      return this._init();
    };

    Game.prototype.withSave = function(fn) {
      var ret;
      this.reify();
      ret = fn();
      this.reify();
      this.session.save();
      this.cache.onUpdate();
      return ret;
    };

    Game.prototype.withUnreifiedSave = function(fn) {
      var ret;
      ret = fn();
      this.session.save();
      return ret;
    };

    Game.prototype.reset = function(transient) {
      var i, len, ref, unit;
      if (transient == null) {
        transient = false;
      }
      this.session.reset();
      this._init();
      ref = this.unitlist();
      for (i = 0, len = ref.length; i < len; i++) {
        unit = ref[i];
        unit._setCount(unit.unittype.init || 0);
      }
      if (!transient) {
        return this.save();
      }
    };

    Game.prototype.ascendEnergySpent = function() {
      var energy;
      energy = this.unit('energy');
      return energy.spent();
    };

    Game.prototype.ascendCost = function(opts) {
      var ascendPenalty, ascends, costVelocity, spent;
      if (opts == null) {
        opts = {};
      }
      if (opts.spent != null) {
        spent = new Decimal(opts.spent);
      } else {
        spent = this.ascendEnergySpent();
      }
      ascends = this.unit('ascension').count();
      ascendPenalty = Decimal.pow(1.12, ascends);
      costVelocity = new Decimal(50000).times(this.unit('mutagen').stat('ascendCost', 1));
      return ascendPenalty.times(5e6).dividedBy(Decimal.pow(2, spent.dividedBy(costVelocity))).ceil();
    };

    Game.prototype.ascendCostCapDiff = function(cost) {
      if (cost == null) {
        cost = this.ascendCost();
      }
      return cost.minus(this.unit('energy').capValue());
    };

    Game.prototype.ascendCostPercent = function(cost) {
      if (cost == null) {
        cost = this.ascendCost();
      }
      return Decimal.min(1, this.unit('energy').count().dividedBy(cost));
    };

    Game.prototype.ascendCostDurationSecs = function(cost) {
      var energy;
      if (cost == null) {
        cost = this.ascendCost();
      }
      energy = this.unit('energy');
      if (cost.lessThan(energy.capValue())) {
        return energy.estimateSecsUntilEarned(cost).toNumber();
      }
    };

    Game.prototype.ascendCostDurationMoment = function(cost) {
      var secs;
      if ((secs = this.ascendCostDurationSecs(cost)) != null) {
        return moment.duration(secs, 'seconds');
      }
    };

    Game.prototype.ascend = function(free) {
      if (free == null) {
        free = false;
      }
      if (!free && this.ascendCostPercent() < 1) {
        throw new Error("We require more resources (ascension cost)");
      }
      return this.withSave((function(_this) {
        return function() {
          var ascension, i, j, len, len1, mutagen, premutagen, ref, ref1, ref2, results, unit, upgrade;
          premutagen = _this.unit('premutagen');
          mutagen = _this.unit('mutagen');
          ascension = _this.unit('ascension');
          mutagen._addCount(premutagen.count());
          premutagen._setCount(0);
          ascension._addCount(1);
          _this.session.state.date.restarted = _this.now;
          if (ascension.count().modulo(3).isZero()) {
            _this.unit('freeRespec')._addCount(1);
          }
          _this._init();
          if (ascension.count().equals(1)) {
            _this.cache.firstSpawn.ascension = true;
          }
          ref = _this.unitlist();
          for (i = 0, len = ref.length; i < len; i++) {
            unit = ref[i];
            if (!unit.unittype.ascendPreserve) {
              unit._setCount(unit.unittype.init || 0);
            }
          }
          ref1 = _this.upgradelist();
          results = [];
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            upgrade = ref1[j];
            if (((ref2 = upgrade.unit.tab) != null ? ref2.name : void 0) !== 'mutagen') {
              results.push(upgrade._setCount(0));
            } else {
              results.push(void 0);
            }
          }
          return results;
        };
      })(this));
    };

    Game.prototype.respecRate = function() {
      return 1.00;
    };

    Game.prototype.respecCost = function() {
      return this.ascendCost().times(this.respecCostRate).ceil();
    };

    Game.prototype.respecCostRate = 0.3;

    Game.prototype.respecCostCapDiff = function() {
      return this.ascendCostCapDiff(this.respecCost());
    };

    Game.prototype.respecCostPercent = function() {
      return this.ascendCostPercent(this.respecCost());
    };

    Game.prototype.respecCostDurationSecs = function() {
      return this.ascendCostDurationSecs(this.respecCost());
    };

    Game.prototype.respecCostDurationMoment = function() {
      return this.ascendCostDurationMoment(this.respecCost());
    };

    Game.prototype.isRespecCostMet = function() {
      return this.unit('energy').count().greaterThanOrEqualTo(this.respecCost());
    };

    Game.prototype.respecSpent = function() {
      var i, ignores, len, mutagen, ref, up;
      mutagen = this.unit('mutagen');
      ignores = {};
      ref = mutagen.upgrades.list;
      for (i = 0, len = ref.length; i < len; i++) {
        up = ref[i];
        ignores[up.name] = true;
      }
      return mutagen.spent(ignores).minus(this.upgrade('mutatehidden').count());
    };

    Game.prototype.respec = function() {
      return this.withSave((function(_this) {
        return function() {
          var cost, spent;
          if (!_this.isRespecCostMet()) {
            throw new Error("We require more resources");
          }
          cost = _this.respecCost();
          _this.unit('energy')._subtractCount(cost);
          spent = _this.ascendEnergySpent().minus(cost);
          _this.unit('respecEnergy')._addCount(spent);
          return _this._respec();
        };
      })(this));
    };

    Game.prototype.respecFree = function() {
      return this.withSave((function(_this) {
        return function() {
          if (!_this.unit('freeRespec').count().greaterThan(0)) {
            throw new Error("We require more resources");
          }
          _this.unit('freeRespec')._subtractCount(1);
          return _this._respec();
        };
      })(this));
    };

    Game.prototype._respec = function() {
      var i, len, mutagen, ref, resource, spent;
      mutagen = this.unit('mutagen');
      spent = this.respecSpent();
      ref = mutagen.spentResources();
      for (i = 0, len = ref.length; i < len; i++) {
        resource = ref[i];
        resource._setCount(0);
      }
      mutagen._addCount(spent.times(this.respecRate()).floor());
      this.cache.onRespec();
      return util.assert(mutagen.spent().isZero(), "respec didn't refund all mutagen!");
    };

    return Game;

  })();
});

angular.module('swarmApp').factory('game', ["Game","session"], function(Game, session) {
  return new Game(session);
});

'use strict';

/**
  * @ngdoc service
  * @name swarmApp.statistics
  * @description
  * # statistics
  * Factory in the swarmApp.
 */
angular.module('swarmApp').factory('StatisticsListener', ["util","$log","kongregate"], function(util, $log, kongregate) {
  var StatisticsListener;
  return StatisticsListener = (function() {
    function StatisticsListener(session1, scope1) {
      this.session = session1;
      this.scope = scope1;
      this._init();
    }

    StatisticsListener.prototype._init = function() {
      var base, stats;
      stats = (base = this.session.state).statistics != null ? base.statistics : base.statistics = {};
      if (stats.byUnit == null) {
        stats.byUnit = {};
      }
      if (stats.byUpgrade == null) {
        stats.byUpgrade = {};
      }
      return stats.clicks != null ? stats.clicks : stats.clicks = 0;
    };

    StatisticsListener.prototype.push = function(cmd) {
      var e, stats, ustats;
      stats = this.session.state.statistics;
      stats.clicks += 1;
      if (cmd.unitname != null) {
        ustats = stats.byUnit[cmd.unitname];
        if (ustats == null) {
          ustats = stats.byUnit[cmd.unitname] = {
            clicks: 0,
            num: 0,
            twinnum: 0,
            elapsedFirst: cmd.elapsed
          };
          this.scope.$emit('buyFirst', cmd);
        }
        ustats.clicks += 1;
        try {
          ustats.num = new Decimal(ustats.num).plus(cmd.num);
          ustats.twinnum = new Decimal(ustats.twinnum).plus(cmd.twinnum);
        } catch (error) {
          e = error;
          $log.warn('statistics corrupt for unit, resetting', cmd.unitname, ustats, e);
          ustats.num = new Decimal(cmd.num);
          ustats.twinnum = new Decimal(cmd.twinnum);
        }
      }
      if (cmd.upgradename != null) {
        ustats = stats.byUpgrade[cmd.upgradename];
        if (ustats == null) {
          ustats = stats.byUpgrade[cmd.upgradename] = {
            clicks: 0,
            num: 0,
            elapsedFirst: cmd.elapsed
          };
          this.scope.$emit('buyFirst', cmd);
        }
        ustats.clicks += 1;
        try {
          ustats.num = new Decimal(ustats.num).plus(cmd.num);
        } catch (error) {
          e = error;
          $log.warn('statistics corrupt for upgrade, resetting', cmd.upgradename, ustats, e);
          ustats.num = new Decimal(cmd.num);
        }
      }
      this.session.save();
      delete cmd.now;
      delete cmd.unit;
      return delete cmd.upgrade;
    };

    StatisticsListener.prototype.listen = function(scope) {
      scope.$on('reset', (function(_this) {
        return function() {
          return _this._init();
        };
      })(this));
      return scope.$on('command', (function(_this) {
        return function(event, cmd) {
          $log.debug('statistics', event, cmd);
          _this.push(cmd);
          return kongregate.reportStats();
        };
      })(this));
    };

    return StatisticsListener;

  })();
});

angular.module('swarmApp').factory('statistics', ["session","StatisticsListener","$rootScope"], function(session, StatisticsListener, $rootScope) {
  var stats;
  stats = new StatisticsListener(session, $rootScope);
  stats.listen($rootScope);
  return stats;
});

'use strict';

/**
  * @ngdoc service
  * @name swarmApp.command
  * @description
  * # command
  * Factory in the swarmApp.
 */
angular.module('swarmApp').factory('commands', ["util","game","$rootScope","$log","loginApi","mtx"], function(util, game, $rootScope, $log, loginApi, mtx) {
  var Commands;
  return new (Commands = (function() {
    function Commands() {}

    Commands.prototype._setUndo = function(opts) {
      if (opts == null) {
        opts = {};
      }
      return this._undo = _.extend({}, opts, {
        state: game.session.exportSave(),
        date: game.now
      });
    };

    Commands.prototype.undo = function() {
      var ref, state;
      if (!((ref = this._undo) != null ? ref.state : void 0)) {
        throw new Error('no undostate available');
      }
      state = this._undo.state;
      this._setUndo({
        isRedo: true
      });
      return game.importSave(state, false);
    };

    Commands.prototype._emit = function(name, params) {
      util.assert(params.name == null, 'command has a name already?');
      params.name = name;
      $rootScope.$emit("command", params);
      return loginApi.saveCommand(params);
    };

    Commands.prototype.buyUnit = function(opts) {
      var bought, num, unit;
      this._setUndo();
      unit = opts.unit;
      num = opts.num;
      bought = unit.buy(num);
      return this._emit('buyUnit', {
        unit: unit,
        unitname: unit.name,
        now: unit.game.now,
        elapsed: unit.game.elapsedStartMillis(),
        attempt: num,
        num: bought.num,
        twinnum: bought.twinnum,
        ui: opts.ui
      });
    };

    Commands.prototype.buyMaxUnit = function(opts) {
      var bought, unit;
      this._setUndo();
      unit = opts.unit;
      bought = unit.buyMax(opts.percent);
      return this._emit('buyMaxUnit', {
        unit: unit,
        unitname: unit.name,
        now: unit.game.now,
        elapsed: unit.game.elapsedStartMillis(),
        num: bought.num,
        twinnum: bought.twinnum,
        percent: opts.percent,
        ui: opts.ui
      });
    };

    Commands.prototype.buyUpgrade = function(opts) {
      var num, upgrade;
      this._setUndo();
      upgrade = opts.upgrade;
      num = upgrade.buy(opts.num);
      return this._emit('buyUpgrade', {
        upgrade: upgrade,
        upgradename: upgrade.name,
        now: upgrade.game.now,
        elapsed: upgrade.game.elapsedStartMillis(),
        num: num,
        ui: opts.ui
      });
    };

    Commands.prototype.buyMaxUpgrade = function(opts) {
      var num, upgrade;
      this._setUndo();
      upgrade = opts.upgrade;
      num = upgrade.buyMax(opts.percent);
      return this._emit('buyMaxUpgrade', {
        upgrade: upgrade,
        upgradename: upgrade.name,
        now: upgrade.game.now,
        elapsed: upgrade.game.elapsedStartMillis(),
        num: num,
        percent: opts.percent,
        ui: opts.ui
      });
    };

    Commands.prototype.buyAllUpgrades = function(opts) {
      var i, len, num, upgrade, upgrades;
      this._setUndo();
      upgrades = opts.upgrades;
      for (i = 0, len = upgrades.length; i < len; i++) {
        upgrade = upgrades[i];
        num = upgrade.buyMax(opts.percent / upgrade.watchedDivisor());
        this._emit('buyMaxUpgrade', {
          upgrade: upgrade,
          upgradename: upgrade.name,
          now: upgrade.game.now,
          elapsed: upgrade.game.elapsedStartMillis(),
          num: num,
          percent: opts.percent,
          ui: 'buyAllUpgrades'
        });
      }
      if (upgrades.length) {
        return this._emit('buyAllUpgrades', {
          now: upgrades[0].game.now,
          elapsed: upgrades[0].game.elapsedStartMillis(),
          percent: opts.percent
        });
      }
    };

    Commands.prototype.ascend = function(opts) {
      this._setUndo();
      game = opts.game;
      game.ascend();
      return this._emit('ascension', {
        now: game.now,
        unit: game.unit('ascension'),
        unitname: 'ascension',
        num: 1,
        twinnum: 1,
        elapsed: game.elapsedStartMillis()
      });
    };

    Commands.prototype.respec = function(opts) {
      this._setUndo();
      game = opts.game;
      game.respec();
      return this._emit('respec', {
        now: game.now,
        elapsed: game.elapsedStartMillis()
      });
    };

    Commands.prototype.respecFree = function(opts) {
      this._setUndo();
      game = opts.game;
      game.respecFree();
      return this._emit('respec', {
        now: game.now,
        elapsed: game.elapsedStartMillis()
      });
    };

    Commands.prototype.convertCrystal = function(opts) {
      var conversion;
      this._setUndo();
      conversion = opts.conversion;
      mtx.convert(conversion);
      return this._emit('convertEnergy', {
        now: game.now,
        crystal: conversion.crystal,
        energy: conversion.energy
      });
    };

    return Commands;

  })());
});

};
