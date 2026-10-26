/* Rebuild the offline facade from the pinned, unmodified upstream CoffeeScript. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const localModules = path.join(__dirname, 'engine-build/node_modules');
const modules = localModules;
if (!fs.existsSync(modules)) throw new Error('[ROACH] build: run npm run setup:engine before building.');
const cache = path.join(__dirname, 'engine-build/.cache');
fs.mkdirSync(cache, {recursive:true});
const coffee = require(path.join(modules, 'coffee-script'));
const esbuild = require(path.join(modules, 'esbuild'));
const source = path.join(root, 'app/swarm/source');
const vendor = path.join(root, 'app/swarm/vendor');
// English-only locale loader; duration/time arithmetic remains the original Moment implementation.
fs.writeFileSync(path.join(vendor, 'moment.js'), fs.readFileSync(path.join(vendor, 'moment-original.js'), 'utf8').replace("require('./locale/' + name);", "/* English only: dynamic locale loading intentionally removed. */"));
const files = ['spreadsheetutil', 'seedrand', 'effect', 'unit', 'upgrade', 'achievement', 'tab', 'game', 'statistics', 'command'];
let compiled = files.map(name => coffee.compile(fs.readFileSync(path.join(source, name + '.coffee'), 'utf8'), {bare:true})).join('\n');
compiled = compiled.replace(/(\.(?:factory|service)\('[^']+', )function\(([^)]*)\)/g, (match, prefix, args) => prefix + JSON.stringify(args.split(',').map(s=>s.trim()).filter(Boolean)) + ', function(' + args + ')');
fs.writeFileSync(path.join(root, 'app/swarm/core.generated.js'), '/* Generated from pinned GPL-3.0 upstream source. See source/ and PROVENANCE.md. */\nmodule.exports = function registerCore(angular, _, Decimal, math, moment, Math, Date) {\nvar name = \"\";\n' + compiled + '\n};\n');
esbuild.buildSync({entryPoints:[path.join(source, 'tables/spreadsheet/data.ts')], outfile:path.join(cache, 'tables.cjs'), bundle:true, platform:'node', format:'cjs', nodePaths:[modules]});
const tables = require(path.join(cache, 'tables.cjs')).default();
fs.writeFileSync(path.join(root, 'app/swarm/data.generated.json'), JSON.stringify(tables));
esbuild.buildSync({entryPoints:[path.join(root, 'app/swarm/adapter.js')], outfile:path.join(root, 'app/engine.js'), bundle:true, platform:'browser', format:'iife', globalName:'SwarmEngine', target:['chrome68'], nodePaths:[modules], minify:true, legalComments:'inline', footer:{js:'if (typeof module === "object" && module.exports) module.exports = SwarmEngine;'}});
console.log('Built pinned Swarm engine: ' + files.length + ' upstream services, ' + tables.unittypes.elements.length + ' unit rows.');
