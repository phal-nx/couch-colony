/* Repeatable host timings for the engine, save store and real page refresh.
 *
 *   node scripts/dev/benchmark-engine.cjs [appRoot] [--browser] [--longtasks] [--throttle=1,4,6] [--seconds=5] [--samples=15]
 *
 * Node mode times engine and save operations in-process. --browser repeats them in
 * local Chrome under CDP CPU throttling, then loads the real page with each fixture
 * and times the 500 ms interval callback in compact and menu views. Throttled desktop
 * Chrome is only a rough proxy: it is not Chromium 68 and not the TV. --longtasks loads
 * the page with an earlier backup and one upgrade auto-buy binding, then records every
 * timer and frame callback in the Upgrades menu and in compact mode, long enough to
 * include a routine save. Nothing here contacts the TV.
 */
'use strict';
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const args=process.argv.slice(2);
const flag=(name,fallback)=>{const hit=args.find(arg=>arg.startsWith('--'+name+'='));return hit ? hit.slice(name.length+3) : fallback;};
const root=path.resolve(args.find(arg=>!arg.startsWith('--')) || path.join(__dirname,'../../app'));
const browserMode=args.includes('--browser');
const longTaskMode=args.includes('--longtasks');
const throttles=flag('throttle','1,4,6').split(',').map(Number);
const seconds=Number(flag('seconds','5'));
const samples=Number(flag('samples','15'));
const START=1000000;

// Late is a pre-ascension colony reached by deterministic six-hourly purchases; very late
// stacks several ascensions, every tier and exponents in the thousands.
const FIXTURES={
  early:{units:{meat:'1000',larva:'1000',drone:'10'}},
  middle:{units:{meat:'1e15',larva:'1e9',drone:'1e6',queen:'10000',nest:'100',nexus:'1',territory:'1000',energy:'100'}},
  late:{achievements:38,
    units:{meat:'2.3466988585146723689e+70',larva:'71603564120.120768454',territory:'1.2826433663616008154e+34',energy:'5455',nexus:'2',crystal:'26000',premutagen:'13419334',drone:'2.0491264098821180295e+59',queen:'6.1405659573012564145e+48',nest:'7.2062963401177277136e+38',greaterqueen:'4.7768262943340898687e+29',hive:'4.5349228123527284898e+21',hivequeen:'118933793065680',empress:'77055581',prophet:'3',swarmling:'79432',stinger:'76472',spider:'64344',mosquito:'72872',locust:'71968',roach:'70592',giantspider:'41104',centipede:'57136',wasp:'29456',devourer:'7104',goon:'29148542236032'},
    upgrades:{hatchery:'69',droneprod:'21',dronetwin:'49',queenprod:'17',nexus1:'1',swarmwarp:'227',swarmlingtwin:'6',stingertwin:'6',spidertwin:'6',mosquitotwin:'6',locusttwin:'6',expansion:'87',achievementbonus:'5',roachtwin:'6',nestprod:'14',queentwin:'39',giantspidertwin:'6',nexus2:'1',larvarush:'24',nesttwin:'31',centipedetwin:'6',greaterqueenprod:'10',wasptwin:'6',devourertwin:'6',greaterqueentwin:'22',goontwin:'6',hiveprod:'8',hivetwin:'14',hivequeenprod:'5',hivequeentwin:'8',empressprod:'3',empresstwin:'1'}},
  veryLate:{achievements:90,units:{},upgrades:{}}
};
(function veryLate() {
  const f=FIXTURES.veryLate;
  ['drone','queen','nest','greaterqueen','hive','hivequeen','empress','prophet','goddess','pantheon','pantheon2','pantheon3','pantheon4','pantheon5','overmind','overmind2','overmind3','overmind4','overmind5','overmind6'].forEach((id,index)=>{
    f.units[id]=(index+1)*7+'e'+(9000-index*420);f.upgrades[id+'prod']=String(400-index*12);f.upgrades[id+'twin']=String(300-index*9);
  });
  ['swarmling','stinger','spider','mosquito','locust','roach','giantspider','centipede','wasp','devourer','goon'].forEach((id,index)=>{
    f.units[id]='3e'+(6000-index*500);f.upgrades[id+'twin']='120';f.upgrades[id+'empower']='4';
  });
  ['hatchery','bat','clone','swarmwarp','rush','each','freq','nexus','army','meat'].forEach(id=>{f.upgrades['mutate'+id]='1';f.units['mutant'+id]='250000';});
  Object.assign(f.units,{meat:'4.2e9100',larva:'6.6e2400',cocoon:'1e300',territory:'8.1e6100',energy:'48000',nexus:'5',crystal:'5e30',nightbug:'4000',moth:'900',bat:'120',mutagen:'7.7e45',premutagen:'2.9e44',ascension:'14',freeRespec:'2'});
  Object.assign(f.upgrades,{hatchery:'1800',expansion:'1500',achievementbonus:'5',cocooning:'1',nexus1:'1',nexus2:'1',nexus3:'1',nexus4:'1',nexus5:'1',swarmwarp:'5000',larvarush:'300',meatrush:'300',territoryrush:'300',clonelarvae:'200',clonearmy:'200'});
}());

function memory() {const values={};return {getItem:key=>Object.prototype.hasOwnProperty.call(values,key) ? values[key] : null,setItem:(key,value)=>{values[key]=String(value);},removeItem:key=>{delete values[key];}};}
function fixtureState(E,name) {
  const fixture=FIXTURES[name],game=new E.Game({now:START}),state=game.exportState(START),core=game._runtime.game;
  Object.assign(state.state.unittypes,fixture.units);Object.assign(state.state.upgrades,fixture.upgrades||{});
  core.achievementlist().slice(0,fixture.achievements||0).forEach(achievement=>{state.state.achievements[achievement.name]=0;});
  Object.keys(fixture.units).forEach(id=>{if(core.unit(id).type.tier) state.state.statistics.byUnit[id]={clicks:12,num:'1e6',twinnum:'2e6',elapsedFirst:0};});
  Object.keys(fixture.upgrades||{}).forEach(id=>{state.state.statistics.byUpgrade[id]={clicks:12,num:fixture.upgrades[id],elapsedFirst:0};});
  return state;
}

// Runs unchanged in Node and in the page, so both report the same operations.
function runOperations(E,S,state,storage,count) {
  const now=()=>(typeof performance === 'object' ? performance : require('node:perf_hooks').performance).now();
  const game=new E.Game({now:state.clock,activeTimeOnly:true});game.importState(state,state.clock);
  let clock=state.clock;game.resume(clock);
  const store=new S.Store(storage);if(!store.save(game,clock)) throw new Error(store.error);
  function sample(fn) {
    for(let i=0;i<3;i++) {clock+=500;fn(clock);}
    const times=[];
    for(let i=0;i<count;i++) {clock+=500;const start=now();fn(clock);times.push(now()-start);}
    times.sort((a,b)=>a-b);
    return {medianMs:+times[Math.floor(times.length/2)].toFixed(2),maxMs:+times[times.length-1].toFixed(2)};
  }
  const menu=(kind,quantity,tab,ids)=>at=>game.snapshot(at,{quantity,kind,tab,ids,includeAchievements:false});
  // The busiest upgrade tab, and its first page of four rows, as the menu would show them.
  const sizes={};game.snapshot(clock,{kind:'upgrade',includeAchievements:false}).items.forEach(item=>{sizes[item.tab]=(sizes[item.tab]||[]).concat(item.id);});
  const tab=Object.keys(sizes).sort((a,b)=>sizes[b].length-sizes[a].length)[0];
  return {
    compact:sample(at=>game.snapshot(at,{includeItems:false,includeAchievements:false})),
    compactWithoutMenu:sample(at=>game.snapshot(at,{includeItems:false,includeAchievements:false,includeMenu:false})),
    units1:sample(menu('unit',1)),units10:sample(menu('unit',10)),unitsMax:sample(menu('unit','max')),
    upgrades1:sample(menu('upgrade',1)),upgrades10:sample(menu('upgrade',10)),upgradesMax:sample(menu('upgrade','max')),
    upgrades1BusiestTab:sample(menu('upgrade',1,tab)),upgrades1BusiestTabPage:sample(menu('upgrade',1,tab,sizes[tab].slice(0,4))),
    full:sample(at=>game.snapshot(at)),
    save:sample(at=>{if(!store.save(game,at)) throw new Error(store.error);}),
    load:sample(at=>{const copy=new E.Game({now:at,activeTimeOnly:true});if(!new S.Store(storage).load(copy,at).loaded) throw new Error('load failed');})
  };
}

function nodeReport() {
  const E=require(path.join(root,'engine.js')),S=require(path.join(root,'save.js'));
  const results={};
  Object.keys(FIXTURES).forEach(name=>{results[name]=runOperations(E,S,fixtureState(E,name),memory(),samples);});
  return results;
}

function serve() {
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
  const server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const file=path.resolve(root,pathname.slice(1) || 'index.html');
    if(!file.startsWith(root+path.sep)) {response.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{
      if(error) {response.writeHead(404).end();return;}
      response.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});response.end(data);
    });
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}

// Times every 500 ms interval callback and the engine, store and renderer calls inside it.
const PAGE_PROBE=`(() => {
  const nativeInterval=window.setInterval;
  window.__probe={ticks:[]};
  window.setInterval=function(fn,ms){
    if(ms!==500) return nativeInterval.apply(window,arguments);
    return nativeInterval.call(window,function(){
      const probe=window.__probe,mark={snapshot:probe.snapshot||0,update:probe.update||0,save:probe.save||0},start=performance.now();
      try {return fn.apply(this,arguments);}
      finally {probe.ticks.push({total:performance.now()-start,snapshot:(probe.snapshot||0)-mark.snapshot,update:(probe.update||0)-mark.update,save:(probe.save||0)-mark.save,refreshed:(probe.snapshot||0)!==mark.snapshot});}
    },ms);
  };
})();`;
function wrapPage() {
  const probe=window.__probe;
  const wrap=(owner,method,key)=>{const original=owner[method];owner[method]=function(){const start=performance.now();try{return original.apply(this,arguments);}finally{probe[key]=(probe[key]||0)+performance.now()-start;}};};
  wrap(SwarmEngine.Game.prototype,'snapshot','snapshot');wrap(RoachSave.Store.prototype,'save','save');
  if(window.RoachHabitat) wrap(RoachHabitat.prototype,'update','update');
}
function summarize(ticks) {
  const pick=(list,key)=>{if(!list.length) return null;const values=list.map(entry=>entry[key]).sort((a,b)=>a-b);return {medianMs:+values[Math.floor(values.length/2)].toFixed(2),maxMs:+values[values.length-1].toFixed(2)};};
  const refreshes=ticks.filter(tick=>tick.refreshed&&!tick.save),others=ticks.filter(tick=>!tick.refreshed);
  return {refreshes:refreshes.length,cycle:pick(refreshes,'total'),snapshot:pick(refreshes,'snapshot'),habitatUpdate:pick(refreshes,'update'),idleTick:pick(others,'total'),persistTicks:ticks.filter(tick=>tick.save).map(tick=>+tick.save.toFixed(2))};
}

async function browserReport() {
  const {chromium}=require('playwright');
  const server=await serve(),base=`http://127.0.0.1:${server.address().port}/`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const E=require(path.join(root,'engine.js'));
  const report={};
  try {
    for(const rate of throttles) {
      report[rate+'x']={};
      for(const name of Object.keys(FIXTURES)) {
        const state=fixtureState(E,name);
        const context=await browser.newContext({viewport:{width:1920,height:1080}});
        const page=await context.newPage(),cdp=await context.newCDPSession(page);
        await page.goto(base+'engine.js');
        await page.setContent('<script src="/engine.js"></script><script src="/save.js"></script>');
        await page.waitForFunction(()=>window.SwarmEngine && window.RoachSave);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate});
        const operations=await page.evaluate(([source,input,count])=>{
          const values={},storage={getItem:key=>Object.prototype.hasOwnProperty.call(values,key) ? values[key] : null,setItem:(key,value)=>{values[key]=String(value);},removeItem:key=>{delete values[key];}};
          const local={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)};
          const run=(0,eval)('('+source+')');
          return {memoryStorage:run(SwarmEngine,RoachSave,input,storage,count),localStorageSave:run(SwarmEngine,RoachSave,input,local,count).save};
        },[runOperations.toString(),state,samples]);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
        const envelope=JSON.stringify({format:'roach-colony',version:2,savedAt:state.clock,state});
        await page.evaluate(text=>{localStorage.clear();localStorage.setItem('phil_roach_colony_v2',text);},envelope);
        await page.addInitScript(PAGE_PROBE);
        await page.goto(base+'index.html');
        await page.waitForFunction(()=>window.colonyDiagnostics && colonyDiagnostics().snapshot && window.__probe);
        await page.evaluate(wrapPage);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate});
        const phases={};
        const steps=[
          ['compact',null],['units1','c'],
          ['unitsMax',()=>document.querySelector('[data-quantity="max"]').click()],['upgradesMax',()=>document.querySelector('[data-view="upgrades"]').click()],
          ['upgrades10',()=>document.querySelector('[data-quantity="10"]').click()],['upgrades1',()=>document.querySelector('[data-quantity="1"]').click()]
        ];
        for(const [phase,action] of steps) {
          if(action === 'c') await page.keyboard.press('c'); else if(action) await page.evaluate(action);
          await page.waitForTimeout(600);
          await page.evaluate(()=>{window.__probe.ticks=[];});
          await page.waitForTimeout(seconds*1000);
          phases[phase]=summarize(await page.evaluate(()=>window.__probe.ticks));
        }
        const diagnostics=await page.evaluate(()=>{const d=colonyDiagnostics();return {compact:d.compact,menu:d.menu,storageError:d.storageError,population:d.snapshot.population};});
        if(diagnostics.compact || diagnostics.menu !== 'upgrades' || diagnostics.storageError) throw new Error('[ROACH] benchmark: page did not reach the measured view '+JSON.stringify(diagnostics));
        report[rate+'x'][name]={operations,page:phases};
        await context.close();
      }
    }
  } finally {await browser.close();server.close();}
  return report;
}

// Every timer and frame callback is one main-thread task on the page, so its duration is
// what the TV shows as a frame freeze.
const TASK_PROBE=`(() => {
  window.__tasks=[];window.__longtasks=[];
  const record=fn=>function(){const start=performance.now();try{return fn.apply(this,arguments);}finally{window.__tasks.push(performance.now()-start);}};
  const interval=window.setInterval,timeout=window.setTimeout,frame=window.requestAnimationFrame;
  window.setInterval=function(fn,ms){return interval.call(window,typeof fn==='function' ? record(fn) : fn,ms);};
  window.setTimeout=function(fn,ms){return timeout.call(window,typeof fn==='function' ? record(fn) : fn,ms);};
  window.requestAnimationFrame=function(fn){return frame.call(window,record(fn));};
  try {new PerformanceObserver(list=>list.getEntries().forEach(entry=>window.__longtasks.push(entry.duration))).observe({entryTypes:['longtask']});} catch(error) {}
})();`;
function wrapCalls() {
  window.__calls={act:[],autoBuy:[],snapshot:[],save:[]};
  const wrap=(owner,method)=>{const original=owner[method];owner[method]=function(){const start=performance.now();try{return original.apply(this,arguments);}finally{window.__calls[method].push(performance.now()-start);}};};
  wrap(SwarmEngine.Game.prototype,'act');if(SwarmEngine.Game.prototype.autoBuy) wrap(SwarmEngine.Game.prototype,'autoBuy');wrap(SwarmEngine.Game.prototype,'snapshot');wrap(RoachSave.Store.prototype,'save');
}
function taskSummary(result) {
  const tasks=result.tasks.slice().sort((a,b)=>a-b),round=value=>+value.toFixed(1);
  const calls={};Object.keys(result.calls).forEach(key=>{const list=result.calls[key].slice().sort((a,b)=>a-b);calls[key]={count:list.length,medianMs:round(list[list.length>>1] || 0),maxMs:round(list[list.length-1] || 0)};});
  return {tasks:tasks.length,p95Ms:round(tasks[Math.floor(tasks.length*.95)] || 0),maxMs:round(tasks[tasks.length-1] || 0),
    over30:tasks.filter(value=>value>30).length,over50:tasks.filter(value=>value>50).length,calls,
    longtaskObserver:{count:result.longtasks.length,maxMs:round(Math.max.apply(null,[0].concat(result.longtasks)))}};
}
async function longTaskReport() {
  const {chromium}=require('playwright');
  const server=await serve(),base=`http://127.0.0.1:${server.address().port}/`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const E=require(path.join(root,'engine.js'));
  const report={};
  try {
    for(const rate of throttles) {
      report[rate+'x']={};
      for(const name of ['late','veryLate']) {
        const state=fixtureState(E,name),game=new E.Game({now:state.clock,activeTimeOnly:true});
        game.importState(state,state.clock);game.resume(state.clock);
        // Bind the upgrade with the most affordable levels so auto-buy keeps purchasing.
        const target=game.snapshot(state.clock+10,{kind:'upgrade',includeAchievements:false}).items.filter(item=>item.available).sort((a,b)=>b.affordable.length-a.affordable.length)[0];
        const envelope=JSON.stringify({format:'roach-colony',version:2,savedAt:state.clock,state});
        const earlier=JSON.parse(envelope);earlier.state.state.statistics.clicks+=1;
        const context=await browser.newContext({viewport:{width:1920,height:1080}});
        const page=await context.newPage(),cdp=await context.newCDPSession(page);
        await page.goto(base+'engine.js');
        await page.evaluate(([primary,backup,binding])=>{localStorage.clear();localStorage.setItem('phil_roach_colony_v2',primary);localStorage.setItem('phil_roach_colony_v2_backup',backup);localStorage.setItem('phil_roach_colony_ui_auto_v1',JSON.stringify([binding]));},[envelope,JSON.stringify(earlier),{type:'upgrade',id:target.id}]);
        await page.addInitScript(TASK_PROBE);
        await page.goto(base+'index.html');
        await page.waitForFunction(()=>window.colonyDiagnostics && colonyDiagnostics().snapshot);
        await page.evaluate(wrapCalls);
        await page.keyboard.press('c');
        await page.evaluate(()=>document.querySelector('[data-view="upgrades"]').click());
        await page.evaluate(tab=>{const button=document.querySelector('[data-tab="'+tab+'"]');if(button) button.click();},target.tab);
        await page.waitForTimeout(1000);
        report[rate+'x'][name]={binding:target.id};
        for(const phase of ['upgradesMenu','compact']) {
          if(phase === 'compact') {await page.keyboard.press('Escape');await page.waitForTimeout(1000);}
          await cdp.send('Emulation.setCPUThrottlingRate',{rate});
          await page.evaluate(()=>{window.__tasks=[];window.__longtasks=[];Object.keys(window.__calls).forEach(key=>{window.__calls[key]=[];});});
          await page.waitForTimeout(seconds*1000);
          report[rate+'x'][name][phase]=taskSummary(await page.evaluate(()=>({tasks:window.__tasks,longtasks:window.__longtasks,calls:window.__calls})));
          await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
        }
        const diagnostics=await page.evaluate(()=>{const d=colonyDiagnostics();return {compact:d.compact,storageError:d.storageError,bindings:d.autoBindings.length};});
        if(!diagnostics.compact || diagnostics.storageError || diagnostics.bindings !== 1) throw new Error('[ROACH] benchmark: long-task page did not keep the measured state '+JSON.stringify(diagnostics));
        await context.close();
      }
    }
  } finally {await browser.close();server.close();}
  return report;
}

if(require.main !== module) module.exports={FIXTURES,fixtureState,runOperations};
else (async()=>{
  const output={runtime:process.version,appRoot:path.relative(process.cwd(),root) || '.',samples,
    note:'Host timings only, never TV evidence. Node runs in-process; browser runs use local Chrome with CDP CPU throttling as a rough proxy for the TV.',
    node:nodeReport()};
  if(browserMode) output.browser=await browserReport();
  if(longTaskMode) output.longTasks=await longTaskReport();
  console.log(JSON.stringify(output,null,1));
})().catch(error=>{console.error(error);process.exitCode=1;});
