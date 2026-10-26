// Observe the running colony over the DevTools protocol without acting on it.
// The page-side functions run in Chromium 68 and must stay ES5.
const {parseArgs} = require('node:util');
const {execFileSync} = require('node:child_process');

// Defaults to the address behind the `lgtv` SSH host alias.
const sshHost = () => (/^hostname (\S+)$/m.exec(execFileSync('ssh', ['-G', 'lgtv'], {encoding: 'utf8'})) || [])[1];

const {values: args} = parseArgs({options:{
  host:{type:'string'},
  port:{type:'string', default:'9998'},
  seconds:{type:'string', default:'30'},
  'slow-ms':{type:'string', default:'16'},
  json:{type:'boolean', default:false}
}});
args.host = args.host || process.env.ROACH_TV_HOST || sshHost();
const seconds = Number(args.seconds);
const slowMs = Number(args['slow-ms']);
if (!(seconds > 0 && seconds <= 600) || !(slowMs >= 0)) {
  console.error('[ROACH] probe: --seconds must be in (0, 600] and --slow-ms must be non-negative.');
  process.exit(2);
}
const log = message => { if (!args.json) console.error(message); };

function install(options) {
  var previous = window.__roachProbe;
  if (previous && previous.stop) previous.stop();
  var perf = window.performance;
  var nativeTimeout = window.setTimeout;
  var nativeClearTimeout = window.clearTimeout;
  var nativeFrame = window.requestAnimationFrame;
  var EVENT_LIMIT = 20000;
  var SAMPLE_LIMIT = 5000;
  var state = {
    startedAt: Date.now(), start: perf.now(), end: 0, active: true, depth: 0,
    calls: {}, events: [], droppedEvents: 0, slow: [], storage: {},
    longTasks: [], longTaskSupported: false, frames: 0, frameGaps: [], lastFrame: 0,
    wrapped: [], missing: [], restoreErrors: []
  };
  var restorers = [];

  function record(name, start, end) {
    var duration = end - start;
    var entry = state.calls[name] || (state.calls[name] = {count: 0, totalMs: 0, maxMs: 0, samples: []});
    entry.count++;
    entry.totalMs += duration;
    if (duration > entry.maxMs) entry.maxMs = duration;
    if (entry.samples.length < SAMPLE_LIMIT) entry.samples.push(duration);
    if (state.events.length < EVENT_LIMIT) state.events.push([name, start, duration, state.depth]);
    else state.droppedEvents++;
    if (duration >= options.slowMs && state.slow.length < 200) state.slow.push([name, start - state.start, duration]);
  }

  function wrap(owner, key, name, observe) {
    var original = owner && owner[key];
    if (typeof original !== 'function') { state.missing.push(name); return; }
    var own = Object.prototype.hasOwnProperty.call(owner, key);
    var wrapper = function () {
      if (!state.active) return original.apply(this, arguments);
      var start = perf.now();
      state.depth++;
      try { return original.apply(this, arguments); } finally {
        state.depth--;
        var end = perf.now();
        record(name, start, end);
        if (observe) observe(arguments, end - start);
      }
    };
    wrapper.__roachProbeWrapper = true;
    owner[key] = wrapper;
    state.wrapped.push(name);
    restorers.push(function () {
      if (owner[key] !== wrapper) { state.restoreErrors.push(name + ' was replaced after wrapping'); return; }
      if (own) owner[key] = original;
      else delete owner[key];
    });
  }

  var engine = window.SwarmEngine && window.SwarmEngine.Game && window.SwarmEngine.Game.prototype;
  wrap(engine, 'snapshot', 'Game.snapshot');
  wrap(engine, 'act', 'Game.act');
  wrap(engine, 'exportState', 'Game.exportState');
  wrap(window.RoachSave && window.RoachSave.Store && window.RoachSave.Store.prototype, 'save', 'Store.save');
  var habitat = window.RoachHabitat && window.RoachHabitat.prototype;
  wrap(habitat, 'update', 'Habitat.update');
  wrap(habitat, 'draw', 'Habitat.draw');
  wrap(habitat, 'reconcile', 'Habitat.reconcile');
  if (habitat) for (var key in habitat) if (/^bake/.test(key)) wrap(habitat, key, 'Habitat.' + key);
  wrap(window.Storage && window.Storage.prototype, 'setItem', 'Storage.setItem', function (input, duration) {
    var name = String(input[0]);
    var entry = state.storage[name] || (state.storage[name] = {count: 0, maxChars: 0, totalMs: 0, maxMs: 0});
    entry.count++;
    entry.maxChars = Math.max(entry.maxChars, String(input[1]).length);
    entry.totalMs += duration;
    entry.maxMs = Math.max(entry.maxMs, duration);
  });

  var observer = null;
  function takeLongTasks(list) {
    var entries = list.getEntries ? list.getEntries() : list;
    for (var i = 0; i < entries.length; i++) {
      var task = entries[i];
      if (task.startTime < state.start || state.longTasks.length >= 1000) continue;
      state.longTasks.push([task.startTime, task.duration, task.name]);
    }
  }
  try {
    observer = new window.PerformanceObserver(takeLongTasks);
    observer.observe({entryTypes: ['longtask']});
    state.longTaskSupported = true;
  } catch (error) { observer = null; }

  function frame(now) {
    if (!state.active) return;
    if (state.lastFrame && now - state.lastFrame > 50 && state.frameGaps.length < 2000) state.frameGaps.push([state.lastFrame - state.start, now - state.lastFrame]);
    state.lastFrame = now;
    state.frames++;
    nativeFrame.call(window, frame);
  }
  if (nativeFrame) nativeFrame.call(window, frame);

  function stop() {
    if (!state.active) return;
    state.active = false;
    state.end = perf.now();
    nativeClearTimeout.call(window, expiry);
    if (observer) {
      if (observer.takeRecords) takeLongTasks(observer.takeRecords());
      observer.disconnect();
    }
    for (var i = restorers.length - 1; i >= 0; i--) restorers[i]();
    restorers = [];
  }

  function finish() {
    stop();
    if (window.__roachProbe === probe) delete window.__roachProbe;
    var diagnostics = null;
    var diagnosticsError = '';
    try {
      diagnostics = window.colonyDiagnostics ? window.colonyDiagnostics() : null;
      if (diagnostics) delete diagnostics.snapshot;
    } catch (error) { diagnosticsError = String(error && error.message || error); }
    var memory = perf.memory ? {usedJSHeapSize: perf.memory.usedJSHeapSize, totalJSHeapSize: perf.memory.totalJSHeapSize, jsHeapSizeLimit: perf.memory.jsHeapSizeLimit} : null;
    return JSON.stringify({
      startedAt: state.startedAt, start: state.start, windowMs: state.end - state.start,
      calls: state.calls, events: state.events, droppedEvents: state.droppedEvents, slow: state.slow,
      storage: state.storage, longTaskSupported: state.longTaskSupported, longTasks: state.longTasks,
      frames: state.frames, frameGaps: state.frameGaps, wrapped: state.wrapped, missing: state.missing,
      restoreErrors: state.restoreErrors, diagnostics: diagnostics, diagnosticsError: diagnosticsError,
      memory: memory, hidden: document.hidden, href: location.href, userAgent: navigator.userAgent,
      viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio]
    });
  }

  // Restores the page by itself if the probe process disappears before collecting.
  var expiry = nativeTimeout.call(window, function () {
    stop();
    if (window.__roachProbe === probe) delete window.__roachProbe;
  }, options.windowMs + 15000);
  var probe = {stop: stop, finish: finish, startedAt: state.startedAt};
  window.__roachProbe = probe;
  return JSON.stringify({wrapped: state.wrapped, missing: state.missing, longTaskSupported: state.longTaskSupported, replaced: !!previous});
}

function abandon() {
  var probe = window.__roachProbe;
  if (probe && probe.stop) probe.stop();
  delete window.__roachProbe;
  return true;
}

function remainingWrappers() {
  var found = [];
  if (window.__roachProbe) found.push('window.__roachProbe');
  var owners = {
    Game: window.SwarmEngine && window.SwarmEngine.Game && window.SwarmEngine.Game.prototype,
    Store: window.RoachSave && window.RoachSave.Store && window.RoachSave.Store.prototype,
    Habitat: window.RoachHabitat && window.RoachHabitat.prototype,
    Storage: window.Storage && window.Storage.prototype
  };
  for (var owner in owners) {
    if (!owners[owner]) continue;
    var names = Object.getOwnPropertyNames(owners[owner]);
    for (var i = 0; i < names.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(owners[owner], names[i]);
      if (descriptor.value && descriptor.value.__roachProbeWrapper) found.push(owner + '.' + names[i]);
    }
  }
  return JSON.stringify(found);
}

function collect() {
  var probe = window.__roachProbe;
  return probe ? probe.finish() : 'null';
}

async function connect() {
  const base = `http://${args.host}:${args.port}`;
  const response = await fetch(`${base}/json`, {signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error(`${base}/json answered ${response.status}`);
  const targets = await response.json();
  const target = targets.find(item => item.type === 'page' && (item.title === 'Roach Colony' || String(item.url).includes('com.phil.roachcolony')));
  if (!target) throw new Error(`no Roach Colony page among ${targets.length} target(s): ${targets.map(item => JSON.stringify(item.title)).join(', ')}`);
  // Older webOS builds omit the socket URL or report a loopback host, so derive it from the requested address.
  const path = target.webSocketDebuggerUrl ? new URL(target.webSocketDebuggerUrl).pathname : `/devtools/page/${target.id}`;
  if (typeof WebSocket !== 'function') throw new Error('this Node.js has no global WebSocket; use Node.js 22 or newer');
  const socket = new WebSocket(`ws://${args.host}:${args.port}${path}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DevTools socket did not open within 5 s')), 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('DevTools socket refused the connection; is another debugger attached?')); });
  });
  let next = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });
  socket.addEventListener('close', () => { for (const handler of pending.values()) handler.reject(new Error('DevTools socket closed')); pending.clear(); });
  const evaluate = async (fn, input) => {
    const id = ++next;
    const expression = `(${fn.toString()})(${input === undefined ? '' : JSON.stringify(input)})`;
    const result = await new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      socket.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression, returnByValue:true}}));
      setTimeout(() => { if (pending.delete(id)) reject(new Error('DevTools evaluation timed out')); }, 15000);
    });
    if (result.exceptionDetails) throw new Error(`page threw: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
    return result.result.value;
  };
  return {target, evaluate, close:() => socket.close()};
}

function stats(values) {
  if (!values.length) return {count:0, p50:0, p95:0, max:0};
  const sorted = [...values].sort((a, b) => a - b);
  const rank = q => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return {count:values.length, p50:rank(0.5), p95:rank(0.95), max:sorted[sorted.length - 1]};
}

const OVERLAP_SLACK_MS = 1;

function analyze(raw) {
  const functions = Object.entries(raw.calls).map(([name, entry]) => {
    const summary = stats(entry.samples);
    return {name, count:entry.count, totalMs:entry.totalMs, medianMs:summary.p50, p95Ms:summary.p95, maxMs:entry.maxMs};
  }).sort((a, b) => b.totalMs - a.totalMs);
  const overlaps = {};
  let unattributed = 0;
  const longTasks = raw.longTasks.map(([start, duration, source]) => {
    const names = {};
    for (const [name, callStart, callDuration] of raw.events) {
      // Long task times are coarsened to whole milliseconds, so a call at the task's edge can fall just outside it.
      const overlap = Math.min(start + duration, callStart + callDuration) - Math.max(start, callStart);
      if (overlap >= -OVERLAP_SLACK_MS) names[name] = (names[name] || 0) + Math.max(0, overlap);
    }
    const coincident = Object.keys(names);
    if (!coincident.length) unattributed++;
    for (const name of coincident) {
      const entry = overlaps[name] || (overlaps[name] = {name, longTasks:0, overlapMs:0});
      entry.longTasks++;
      entry.overlapMs += names[name];
    }
    return {atMs:start - raw.start, durationMs:duration, source, functions:names};
  });
  const windowSeconds = raw.windowMs / 1000;
  const diagnostics = raw.diagnostics || {};
  return {
    target:{href:raw.href, userAgent:raw.userAgent, viewport:raw.viewport, hidden:raw.hidden},
    windowSeconds,
    habitat:diagnostics.habitat || null,
    colony:{compact:diagnostics.compact, menu:diagnostics.menu, closed:diagnostics.closed, autoBindings:diagnostics.autoBindings, autoPaused:diagnostics.autoPaused, pendingSave:diagnostics.pendingSave, storageError:diagnostics.storageError, uptimeSeconds:diagnostics.uptimeSeconds},
    diagnosticsError:raw.diagnosticsError || undefined,
    longTasks:{supported:raw.longTaskSupported, ...stats(raw.longTasks.map(task => task[1])), totalMs:raw.longTasks.reduce((sum, task) => sum + task[1], 0), unattributed, entries:longTasks},
    frames:{count:raw.frames, fps:raw.frames / windowSeconds, gapsOver50ms:{...stats(raw.frameGaps.map(gap => gap[1])), entries:raw.frameGaps.map(([atMs, gapMs]) => ({atMs, gapMs}))}},
    functions,
    longTaskCoincidence:Object.values(overlaps).sort((a, b) => b.overlapMs - a.overlapMs),
    slowCalls:raw.slow.map(([name, atMs, durationMs]) => ({name, atMs, durationMs})),
    saves:raw.calls['Store.save']?.count || 0,
    storage:raw.storage,
    memory:raw.memory,
    probe:{wrapped:raw.wrapped, missing:raw.missing, droppedEvents:raw.droppedEvents, restoreErrors:raw.restoreErrors}
  };
}

const ms = value => (value === undefined || value === null ? '-' : value.toFixed(value < 10 ? 2 : 1));
const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;

function print(report) {
  const lines = [];
  const habitat = report.habitat;
  lines.push(`Roach Colony probe: ${report.windowSeconds.toFixed(1)} s at ${report.target.href}`);
  lines.push(`Page: ${report.target.hidden ? 'hidden' : 'visible'}, ${report.colony.closed ? 'closed' : report.colony.compact ? 'compact' : `menu ${report.colony.menu}`}, ${report.target.viewport[0]}x${report.target.viewport[1]} @${report.target.viewport[2]}x, auto-buy ${(report.colony.autoBindings || []).length}${report.colony.autoPaused ? ' (paused)' : ''}`);
  if (habitat) lines.push(`Habitat: ${ms(habitat.achievedFps)}/${habitat.targetFps} fps, quality ${habitat.quality}, ${habitat.entities} entities, frame avg ${ms(habitat.averageFrameMs)} ms, peak ${ms(habitat.peakFrameMs)} ms, atlas ${mb(habitat.atlasBytes)}, canvas ${mb(habitat.canvasBytes)}`);
  else lines.push(`Habitat: no diagnostics${report.diagnosticsError ? ` (${report.diagnosticsError})` : ''}`);
  if (habitat && habitat.events && habitat.events.promotions !== undefined) {
    const e = habitat.events;
    lines.push(`Behaviours: promotions ${e.promotions}, crews ${e.crews} (${e.crewTimeouts} timed out), scatters ${e.scatters}, guards ${e.guards} standing (${e.guardShifts} shift changes), nursery lines ${e.nursery}`);
  }
  if (habitat && habitat.behaviors) lines.push(`Lane manners: ${habitat.behaviors.greetings} greetings, ${habitat.behaviors.handoffs} crumb handoffs, ${habitat.behaviors.yields} give-ways, ${habitat.behaviors.queued} door waits; now ${habitat.behaviors.now.waiting} waiting, ${habitat.behaviors.now.pacing} keeping pace`);
  if (habitat && habitat.nestDust) lines.push(`Nest dust: ${habitat.nestDust.on ? 'on' : 'off'}, ${habitat.nestDust.live} live, ${habitat.nestDust.spawned} spawned; motes ${habitat.motes ? `${habitat.motes.live}/${habitat.motes.cap}` : '-'}`);
  const tasks = report.longTasks;
  lines.push(tasks.supported
    ? `Long tasks: ${tasks.count} (${ms(tasks.totalMs)} ms total), p50 ${ms(tasks.p50)} ms, p95 ${ms(tasks.p95)} ms, max ${ms(tasks.max)} ms, ${tasks.unattributed} with no wrapped call`
    : 'Long tasks: PerformanceObserver longtask is unavailable');
  const gaps = report.frames.gapsOver50ms;
  lines.push(`Animation frames: ${report.frames.count} (${ms(report.frames.fps)}/s); gaps over 50 ms: ${gaps.count}, p50 ${ms(gaps.p50)} ms, p95 ${ms(gaps.p95)} ms, max ${ms(gaps.max)} ms`);
  lines.push('');
  lines.push('Function               Calls  Median ms  p95 ms   Max ms  Total ms');
  for (const entry of report.functions) lines.push(`${entry.name.padEnd(21)} ${String(entry.count).padStart(6)} ${ms(entry.medianMs).padStart(10)} ${ms(entry.p95Ms).padStart(7)} ${ms(entry.maxMs).padStart(8)} ${ms(entry.totalMs).padStart(9)}`);
  if (!report.functions.length) lines.push('(no wrapped calls observed)');
  lines.push('');
  if (report.longTaskCoincidence.length) {
    lines.push('Calls overlapping long tasks:');
    for (const entry of report.longTaskCoincidence) lines.push(`  ${entry.name}: ${entry.longTasks} task(s), ${ms(entry.overlapMs)} ms overlapping${entry.overlapMs < 1 ? ' (negligible share)' : ''}`);
  } else if (tasks.count) lines.push('No wrapped call overlapped a long task.');
  if (report.slowCalls.length) lines.push(`Slowest calls: ${[...report.slowCalls].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5).map(call => `${call.name} ${ms(call.durationMs)} ms @${(call.atMs / 1000).toFixed(1)} s`).join('; ')}`);
  const storage = Object.entries(report.storage).map(([key, entry]) => `${key} x${entry.count} (${Math.round(entry.maxChars / 1024)} KiB, max ${ms(entry.maxMs)} ms)`);
  lines.push(`Saves: ${report.saves}; storage writes: ${storage.length ? storage.join(', ') : 'none'}`);
  lines.push(`JS heap: ${report.memory ? `${mb(report.memory.usedJSHeapSize)} used of ${mb(report.memory.totalJSHeapSize)} (limit ${mb(report.memory.jsHeapSizeLimit)})` : 'performance.memory unavailable'}`);
  if (report.probe.missing.length) lines.push(`Not found on page: ${report.probe.missing.join(', ')}`);
  if (report.probe.restoreErrors.length) lines.push(`Restore problems: ${report.probe.restoreErrors.join('; ')}`);
  if (report.probe.droppedEvents) lines.push(`Event log full; ${report.probe.droppedEvents} call(s) not checked against long tasks.`);
  console.log(lines.join('\n'));
}

async function main() {
  let session;
  try {
    session = await connect();
  } catch (error) {
    console.error(`[ROACH] probe: cannot reach the Roach Colony page at ${args.host}:${args.port}: ${error.message}`);
    process.exit(1);
  }
  let interrupted = false;
  const cleanup = async () => {
    interrupted = true;
    try { await session.evaluate(abandon); } catch {}
    session.close();
    process.exit(130);
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  try {
    const installed = JSON.parse(await session.evaluate(install, {windowMs:seconds * 1000, slowMs}));
    log(`[ROACH] probe: observing ${session.target.title} for ${seconds} s (${installed.wrapped.length} hooks${installed.replaced ? ', replaced an earlier probe' : ''})`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    if (interrupted) return;
    const raw = JSON.parse(await session.evaluate(collect));
    if (!raw) throw new Error('the probe disappeared from the page; was it reloaded?');
    const leftovers = JSON.parse(await session.evaluate(remainingWrappers));
    const report = analyze(raw);
    if (leftovers.length) report.probe.restoreErrors.push(`still present after cleanup: ${leftovers.join(', ')}`);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else print(report);
  } catch (error) {
    try { await session.evaluate(abandon); } catch {}
    if (/socket|timed out/i.test(error.message)) {
      console.error(`[ROACH] probe: lost the DevTools connection: ${error.message}`);
      process.exitCode = 1;
    } else console.error(`[ROACH] probe: ${error.message}`);
  } finally {
    session.close();
  }
}

main();
