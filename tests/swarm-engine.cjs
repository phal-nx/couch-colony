'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../app/engine');
const START=1000000;
// Fixtures are awake colonies; a new game opens dormant with no stock (see the opening tests).
function fixture(counts={},upgrades={},options={now:START}) {
  const game=new E.Game(options),state=game.exportState(options.now);
  Object.assign(state.state.unittypes,counts);Object.assign(state.state.upgrades,upgrades);state.opening={awake:true};
  game.importState(state,options.now);return game;
}
// The source's own opening: 35 meat, 10 larva and the hatchery already producing.
function classic(options={now:START}) {return fixture({meat:'35',larva:'10'},{},options);}
function count(game,id,now=START) {return game.exportState(now).state.unittypes[id];}

test('pinned authoritative dataset includes every late tier, ability and mutation',()=>{
  const game=new E.Game({now:START}),snapshot=game.snapshot(START);
  assert.deepEqual(snapshot.coverage,{units:58,upgrades:88,achievements:121,playableAchievements:114,sourceCommit:E.SOURCE_COMMIT});
  const state=game.exportState(START);
  ['overmind6','pantheon5','bat','mutantmeat','mutantnexus'].forEach(id=>assert.ok(id in state.state.unittypes));
  assert.equal(state.state.unittypes.freeRespec,'4');
});
test('commands retain purchase statistics and achievement events',()=>{
  const game=classic();assert.equal(game.act({type:'unit',id:'drone',quantity:'max'},START).ok,true);
  assert.equal(count(game,'drone'),'3');
  const state=game.exportState(START);assert.equal(state.state.statistics.byUnit.drone.twinnum,'3');
  assert.equal(game.snapshot(START).achievements.find(a=>a.id==='drone1').earned,true);
  assert.equal(count(game,'meat',START+60000),'185');
});
test('offline chain uses raw ancestor floors and c*t^degree/degree factorial',()=>{
  const game=fixture({meat:'0',drone:'1.9',queen:'2.7',nest:'1.9'});
  const state=game.exportState(START+2000);
  assert.equal(state.state.unittypes.meat,'18');
  assert.equal(state.state.unittypes.drone,'21.9');assert.equal(state.state.unittypes.queen,'8.7');
});
test('reify locks old rates before purchasing production upgrades',()=>{
  const game=fixture({meat:'1000',larva:'10'});
  assert.equal(game.act({type:'upgrade',id:'hatchery',quantity:1},START+10000).ok,true);
  assert.equal(count(game,'larva',START+20000),'40');
});
test('saved polynomial chain catches up offline once and clamps backward clocks',()=>{
  const game=fixture({meat:'0',queen:'1'}),saved=game.exportState(START);
  const resumed=new E.Game({now:START+10000});resumed.importState(saved,START+10000);
  const first=resumed.exportState(START+10000);assert.equal(first.state.unittypes.meat,'100');
  const copy=new E.Game({now:START});copy.importState(first,START);
  assert.equal(copy.exportState(START).state.unittypes.meat,'100');
  assert.equal(copy.exportState(START+10000).state.unittypes.meat,'100');
  assert.equal(copy.exportState(START+11000).state.unittypes.meat,'121');
});
test('late overmind chain and numbers above JavaScript range survive offline saves',()=>{
  const game=fixture({meat:'1e400',overmind6:'2'});
  const saved=game.exportState(START+86400000);
  assert.match(saved.state.unittypes.meat,/e\+400$/);
  assert.notEqual(saved.state.unittypes.overmind5,'0');
  const copy=new E.Game({now:START+86400000});copy.importState(saved,START+86400000);
  assert.deepEqual(copy.snapshot(START+86400000).resources,game.snapshot(START+86400000).resources);
});
test('energy obeys source cap and swarmwarp does not generate energy',()=>{
  const game=fixture({nexus:'5',energy:'10000',drone:'1',meat:'0'});
  assert.equal(count(game,'energy',START+1e9),'50000');
  const now=START+1e9,old=game.exportState(now);
  assert.equal(game.act({type:'upgrade',id:'swarmwarp',quantity:1},now).ok,true);
  const state=game.exportState(now);
  assert.equal(state.state.unittypes.energy,'48000');
  assert.ok(Number(state.state.unittypes.meat)>Number(old.state.unittypes.meat));
});
test('invalid and prototype-name actions do not modify canonical state',()=>{
  const game=new E.Game({now:START}),before=game.exportState(START);
  for(const id of ['missing','__proto__','constructor','toString']) for(const type of ['unit','upgrade']) assert.equal(game.act({type,id,quantity:1},START).ok,false);
  assert.equal(game.act({type:'unit',id:'drone',quantity:-1},START).ok,false);
  assert.deepEqual(game.exportState(START),before);
});
test('bad imports are atomic and reject corrupt Decimal, metadata and permanent counters',()=>{
  const game=new E.Game({now:START}),before=game.exportState(START);
  const corruptions=[s=>s.state.unittypes.meat='NaN',s=>s.state.unittypes.meat='1e100001',s=>s.state.unittypes.ascension='0.5',s=>s.state.unittypes.freeRespec='0.5',s=>s.state.unittypes.nexus='6',s=>s.state.upgrades.hatchery='1e100000',s=>s.state.upgrades.droneprod='1e100000',s=>s.state.skippedMillis=1e300,s=>s.clock++,s=>s.state.statistics.byUnit.drone={clicks:'1',num:'1',twinnum:'1',elapsedFirst:0}];
  corruptions.forEach(change=>{const state=JSON.parse(JSON.stringify(before));change(state);assert.throws(()=>game.importState(state,START));assert.deepEqual(game.exportState(START),before);});
});
test('ascension resets ordinary progress, transfers mutagen, and third ascent adds free respec',()=>{
  const game=fixture({ascension:'2',nexus:'5',energy:'10000',premutagen:'100',mutagen:'20',drone:'100'}, {larvarush:'2000'});
  const before=game.exportState(START);before.state.achievements.drone1=0;game.importState(before,START);
  assert.equal(game.snapshot(START).prestige.available,true);
  assert.equal(game.act({type:'ascend'},START).ok,true);
  const after=game.exportState(START);
  assert.equal(after.state.unittypes.ascension,'3');assert.equal(after.state.unittypes.mutagen,'120');assert.equal(after.state.unittypes.premutagen,'0');assert.equal(after.state.unittypes.drone,'0');assert.equal(after.state.unittypes.meat,'35');assert.equal(after.state.upgrades.larvarush,'0');assert.equal(after.state.unittypes.freeRespec,'5');assert.equal(after.state.achievements.drone1,0);
});
test('mutation allocations refund exactly without double-counting unlocks',()=>{
  const game=fixture({ascension:'1',mutagen:'100000'});
  const initial=count(game,'mutagen');
  assert.equal(game.act({type:'upgrade',id:'mutatemeat',quantity:1},START).ok,true);
  assert.equal(game.act({type:'unit',id:'mutantmeat',quantity:10},START).ok,true);
  assert.notEqual(count(game,'mutagen'),initial);
  assert.equal(game.act({type:'respec'},START).ok,true);
  assert.equal(count(game,'mutagen'),initial);assert.equal(count(game,'mutantmeat'),'0');assert.equal(count(game,'freeRespec'),'3');
});
test('impractical max upgrade batches reject explicitly before spending',()=>{
  const game=fixture({ascension:'1',mutagen:'1e20',territory:'1e10000'});
  const before=game.exportState(START);
  assert.equal(game.act({type:'upgrade',id:'expansion',quantity:'max'},START).ok,false);
  assert.deepEqual(game.exportState(START),before);
  // mutatehidden has fixed costs and is disabled, so it must remain inaccessible.
  assert.equal(game.act({type:'upgrade',id:'mutatehidden',quantity:'max'},START).ok,false);
});

test('legal purchases at six-hour intervals reach ascension, mutate, respec and grow a second run',()=>{
  let now=START;const game=classic();let reached=false,buys=0;
  // This deterministic purchasing script measures one strategy, not optimal player pacing.
  for(let round=0;round<160;round++) {
    now+=21600000;
    let snapshot=game.snapshot(now);
    if(snapshot.prestige.available){reached=true;break;}
    snapshot.items.filter(i=>i.kind==='unit'&&i.tab==='meat'&&i.available).reverse().forEach(i=>{if(game.act({type:'unit',id:i.id,quantity:'max'},now).ok)buys++;});
    if(snapshot.items.some(i=>i.id==='swarmwarp'&&i.available))game.act({type:'upgrade',id:'swarmwarp',quantity:10},now);
    snapshot.items.filter(i=>i.kind==='upgrade'&&i.available&&!/^mutate|empower/.test(i.id)).forEach(i=>{if(game.act({type:'upgrade',id:i.id,quantity:'max'},now).ok)buys++;});
    game.snapshot(now).items.filter(i=>i.kind==='unit'&&i.available&&!['cocoon','larva','energy'].includes(i.id)).reverse().forEach(i=>{if(game.act({type:'unit',id:i.id,quantity:'max'},now).ok)buys++;});
  }
  assert.equal(reached,true);assert.ok(buys>100);
  const earned=game.snapshot(now).achievements.filter(a=>a.earned).length;
  assert.equal(game.act({type:'ascend'},now).ok,true);
  assert.equal(game.act({type:'upgrade',id:'mutatemeat',quantity:1},now).ok,true);
  assert.equal(game.act({type:'unit',id:'mutantmeat',quantity:10},now).ok,true);
  assert.equal(game.act({type:'unit',id:'drone',quantity:'max'},now).ok,true);
  now+=3600000;
  const state=game.exportState(now);
  assert.ok(Number(state.state.unittypes.meat)>35);assert.equal(state.state.unittypes.ascension,'1');
  assert.ok(game.snapshot(now).achievements.filter(a=>a.earned).length>=earned);
  assert.equal(game.act({type:'respec'},now).ok,true);
});


test('random mutagen awards are deterministic across save reloads',()=>{
  const first=fixture({meat:'1e50'}, {hatchery:'39'});
  const saved=first.exportState(START),second=new E.Game({now:START});second.importState(saved,START);
  assert.equal(first.act({type:'upgrade',id:'hatchery',quantity:1},START).ok,true);
  assert.equal(second.act({type:'upgrade',id:'hatchery',quantity:1},START).ok,true);
  const award=count(first,'premutagen');assert.notEqual(award,'0');assert.equal(count(second,'premutagen'),award);
});
test('paid respec charges energy and resets ascension spending accounting',()=>{
  const game=fixture({ascension:'1',mutagen:'100000',freeRespec:'0',nexus:'5',energy:'50000'}, {larvarush:'500'});
  assert.equal(game.act({type:'upgrade',id:'mutatemeat',quantity:1},START).ok,true);
  const oldSpent=game._runtime.game.ascendEnergySpent(),cost=game._runtime.game.respecCost();
  assert.equal(game.act({type:'respec'},START).ok,true);
  assert.equal(count(game,'respecEnergy'),oldSpent.minus(cost).toString());
  assert.equal(count(game,'energy'),new (oldSpent.constructor)(50000).minus(cost).toString());
  assert.equal(game._runtime.game.ascendEnergySpent().toString(),cost.toString());
});


test('manual forage grants a minimum crumb, scales with production and can be spammed without cooldown',()=>{
  const game=classic();
  assert.equal(game.act('forage',START).ok,true);
  assert.equal(count(game,'meat'),'36');
  const saved=game.exportState(START),copy=new E.Game({now:START});copy.importState(saved,START);
  assert.equal(copy.act({type:'forage'},START+10).ok,true);
  assert.equal(count(copy,'meat',START+10),'37');
  assert.equal(copy.act({type:'forage'},START+20).ok,true);
  assert.equal(count(copy,'meat',START+20),'38');
  const growing=fixture({meat:'35',drone:'10'});
  assert.equal(growing.act({type:'forage'},START).ok,true);
  assert.equal(count(growing,'meat'),'45');
  const atCap=fixture({meat:'1e100000'});
  assert.equal(atCap.act('forage',START).ok,false);
  assert.equal(count(atCap,'meat'),'1e+100000');
});


test('timed rewards add bounded seconds of current production as Decimals and refuse while paused',()=>{
  const game=fixture({drone:'10',meat:'0'});
  const result=game.act({type:'reward',resource:'meat',seconds:300},START);
  assert.equal(result.ok,true);assert.equal(result.message,'Gained 3K crumbs.');assert.equal(result.reward.amountExact,'3000');
  assert.equal(count(game,'meat'),'3000');
  for (const bad of [{resource:'meat',seconds:0},{resource:'meat',seconds:-5},{resource:'meat',seconds:NaN},{resource:'meat',seconds:Infinity},{resource:'meat',seconds:3601},{resource:'meat',seconds:'60'},{resource:'energy',seconds:60},{resource:'mutagen',seconds:60},{seconds:60}]) {
    assert.equal(game.act(Object.assign({type:'reward'},bad),START).ok,false,JSON.stringify(bad));
  }
  assert.equal(count(game,'meat'),'3000');
  assert.equal(fixture({meat:'5'}).act({type:'reward',resource:'territory',seconds:60},START).ok,false,'nothing is granted without production');
  const huge=fixture({meat:'1e99999',drone:'1e99998'});
  assert.equal(huge.act({type:'reward',resource:'meat',seconds:3600},START).ok,true);
  assert.equal(count(huge,'meat'),'1e+100000','rewards stop at the engine limit');
  assert.equal(huge.act({type:'reward',resource:'meat',seconds:60},START).ok,false);
  const big=fixture({meat:'0',drone:'1e400'});
  assert.equal(big.act({type:'reward',resource:'meat',seconds:10},START).ok,true);
  assert.match(count(big,'meat'),/^1e\+401$/);
  const paused=new E.Game({now:START,activeTimeOnly:true});paused.importState(fixture({drone:'10'}).exportState(START),START);
  assert.equal(paused.paused,true);
  assert.equal(paused.act({type:'reward',resource:'meat',seconds:60},START+1000).ok,false);
  paused.resume(START+1000);
  assert.equal(paused.act({type:'reward',resource:'larva',seconds:10},START+1000).ok,true);
});
test('selected unit batch quotes clamp to affordability and include twins exactly',()=>{
  for(const quantity of [1,10,'max']) {
    const game=fixture({meat:'35',larva:'10'}, {dronetwin:'2'});
    const item=game.snapshot(START,{quantity}).items.find(i=>i.id==='drone');
    assert.equal(item.affordable,'3');
    assert.equal(item.batchQuantity,quantity===1?'1':'3');
    assert.equal(item.batchOwnedGain,quantity===1?'4':'12');
    assert.equal(item.batchCost,quantity===1?'10 meat + 1 larva':'30 meat + 3 larva');
    assert.equal(item.batchAvailable,true);
    assert.equal(game.act({type:'unit',id:'drone',quantity},START).ok,true);
    assert.equal(count(game,'drone'),item.batchOwnedGain);
    assert.equal(count(game,'meat'),quantity===1?'25':'5');
  }
});
test('upgrade cost always quotes one level and selected batch follows geometric prices',()=>{
  const game=fixture({meat:'33300'}, {hatchery:'1'});
  let item=game.snapshot(START,{quantity:10}).items.find(i=>i.id==='hatchery');
  assert.equal(item.cost,'3K meat');assert.equal(item.affordable,'2');assert.equal(item.batchQuantity,'2');assert.equal(item.batchCost,'33K meat');
  assert.equal(game.act({type:'upgrade',id:'hatchery',quantity:10},START).ok,true);
  assert.equal(count(game,'meat'),'300');
  item=game.snapshot(START).items.find(i=>i.id==='hatchery');assert.equal(item.cost,'300K meat');assert.equal(item.batchAvailable,false);
});
test('unaffordable batches quote the next level consistently across the affordability threshold',()=>{
  const game=fixture({meat:'2999'}, {hatchery:'1'});
  let item=game.snapshot(START,{quantity:10}).items.find(i=>i.id==='hatchery');
  assert.equal(item.batchQuantity,'0');assert.equal(item.batchCost,'3K meat');assert.equal(item.batchAvailable,false);
  assert.equal(game.act({type:'forage'},START).ok,true);
  item=game.snapshot(START,{quantity:10}).items.find(i=>i.id==='hatchery');
  assert.equal(item.batchQuantity,'1');assert.equal(item.batchCost,'3K meat');assert.equal(item.batchAvailable,true);
  assert.equal(game.act({type:'upgrade',id:'hatchery',quantity:10},START).ok,true);
  assert.equal(count(game,'meat'),'0');assert.equal(game.exportState(START).state.upgrades.hatchery,'2');
});
test('biological display counts floor each unit while internal fractions remain intact',()=>{
  const game=fixture({drone:'1.9',queen:'2.7',larva:'10.9',cocoon:'3.8'});
  const snapshot=game.snapshot(START);
  assert.equal(snapshot.items.find(i=>i.id==='drone').owned,'1');assert.equal(snapshot.items.find(i=>i.id==='queen').owned,'2');
  assert.equal(snapshot.resources.find(r=>r.id==='larva').amount,'10');assert.equal(snapshot.resources.find(r=>r.id==='cocoon').amount,'3');
  assert.equal(snapshot.population,'3');
  assert.equal(count(game,'drone'),'1.9');assert.equal(count(game,'queen'),'2.7');assert.equal(count(game,'larva'),'10.9');
});
test('lightweight snapshots skip purchase arithmetic and achievement descriptions',()=>{
  const game=classic();
  game.act({type:'unit',id:'drone',quantity:1},START);
  const full=game.snapshot(START);
  const core=game._runtime.game;
  core.unitlist().concat(core.upgradelist()).forEach(resource=>{resource.maxCostMet=()=>{throw Error('unexpected quote');};});
  core.achievementlist().forEach(achievement=>{achievement.description=()=>{throw Error('unexpected description');};});
  const compact=game.snapshot(START,{includeItems:false,includeAchievements:false});
  assert.deepEqual(compact.items,[]);assert.deepEqual(compact.achievements,[]);
  assert.deepEqual(compact.visibleUnitIds,full.visibleUnitIds);assert.deepEqual(compact.resources,full.resources);
  assert.deepEqual(compact.earnedAchievementIds,full.earnedAchievementIds);assert.equal(compact.earnedAchievementCount,1);
});
test('compact snapshots can skip menu-only ascension work without changing presented values',()=>{
  const game=fixture({nexus:'2',energy:'5000',premutagen:'10',drone:'1e6',queen:'1000',territory:'1e6',swarmling:'50'},{hatchery:'40',expansion:'30',swarmwarp:'20'});
  const full=game.snapshot(START,{includeItems:false,includeAchievements:false});
  game._runtime.game.ascendCost=()=>{throw Error('unexpected ascension cost');};
  const lean=game.snapshot(START,{includeItems:false,includeAchievements:false,includeMenu:false});
  ['tabs','prestige','respec','nextGoal','nextGoalTarget'].forEach(key=>{assert.ok(key in full);assert.ok(!(key in lean));delete full[key];});
  assert.deepEqual(lean,full);
  assert.ok(lean.visibleUnits.some(unit=>unit.id==='swarmling'&&unit.countExact==='50'));assert.notEqual(lean.populationExact,'0');
});
test('quoted ids limit purchase arithmetic to shown rows while itemIds keeps the whole selection',()=>{
  const game=fixture({meat:'1e30',larva:'1e9',drone:'1e6',queen:'1000',nest:'10'},{hatchery:'10'});
  const full=game.snapshot(START,{kind:'upgrade',includeAchievements:false});
  assert.deepEqual(full.itemIds,full.items.map(item=>item.id));
  const shown=full.items.filter(item=>item.available).slice(1,3).map(item=>item.id);
  assert.equal(shown.length,2);
  game._runtime.game.upgradelist().forEach(upgrade=>{if(!shown.includes(upgrade.name)) upgrade.maxCostMet=()=>{throw Error('unexpected quote');};});
  const page=game.snapshot(START,{kind:'upgrade',includeAchievements:false,ids:shown});
  assert.deepEqual(page.itemIds,full.itemIds);
  assert.deepEqual(page.items,full.items.filter(item=>shown.includes(item.id)));
  assert.throws(()=>game.snapshot(START,{ids:'drone'}),/invalid snapshot ids/);
});
test('selected tab and kind avoid unrelated quotes but preserve all visible tab kinds',()=>{
  const game=new E.Game({now:START});
  const full=game.snapshot(START),filtered=game.snapshot(START,{tab:'larva',kind:'upgrade',includeAchievements:false});
  assert.deepEqual(filtered.tabs,full.tabs);assert.ok(filtered.tabs.find(tab=>tab.id==='larva').kinds.includes('upgrade'));
  assert.ok(filtered.items.length>0);assert.ok(filtered.items.every(item=>item.kind==='upgrade'&&item.tab==='larva'));
});
test('compact numeric labels avoid trailing zeros and gigantic integer allocations',()=>{
  assert.equal(E.format(1000),'1K');assert.equal(E.format(1500),'1.5K');assert.equal(E.format(1000000),'1M');assert.equal(E.format('1e400'),'1e+400');
  const game=fixture({meat:'1e100000',larva:'1e100000',drone:'1e99999'});
  const snapshot=game.snapshot(START,{tab:'meat',kind:'unit',quantity:'max',includeAchievements:false});
  const drone=snapshot.items.find(item=>item.id==='drone');
  ['affordable','batchQuantity','batchOwnedGain','ownedExact','batchQuantityLabel','batchOwnedGainLabel'].forEach(key=>assert.ok(drone[key].length<40,key));
  assert.ok(snapshot.populationExact.length<40);
});


test('early menus hide actions whose currency has not unlocked while keeping unaffordable hatcheries',()=>{
  const game=new E.Game({now:START});
  const initial=game.snapshot(START,{quantity:'max'});
  assert.ok(initial.items.some(item=>item.id==='hatchery'));
  assert.equal(initial.items.find(item=>item.id==='hatchery').batchCost,'300 meat');
  assert.ok(!initial.items.some(item=>item.id==='expansion'));assert.ok(!initial.items.some(item=>item.id==='larva'));
  const later=fixture({queen:'5'}).snapshot(START);
  assert.ok(later.items.some(item=>item.id==='expansion'));
});
test('compact progress metadata names earned achievements and visible units without full descriptions',()=>{
  const game=classic();game.act({type:'unit',id:'drone',quantity:1},START);
  const snapshot=game.snapshot(START,{includeItems:false,includeAchievements:false});
  assert.deepEqual(snapshot.earnedAchievements,[{id:'drone1',name:'a good start'}]);
  assert.ok(snapshot.visibleUnits.some(unit=>unit.id==='drone'&&unit.name==='drone'&&unit.owned&&unit.description&&unit.count==='1'&&unit.countExact==='1'));
  assert.deepEqual(snapshot.visibleUnits.find(unit=>unit.id==='drone').productionTargets,[{id:'meat',name:'meat'}]);
  assert.deepEqual(snapshot.upgradeLevels,{});
  assert.ok(snapshot.visibleUpgradeIds.includes('hatchery'));assert.ok(!snapshot.visibleUpgradeIds.includes('expansion'));
  assert.equal(snapshot.coverage.playableAchievements,114);
});

test('active-time colonies start paused and advance only during visible play',()=>{
  const game=classic({now:START,activeTimeOnly:true}),later=START+86400000;
  assert.equal(game.activeTimeOnly,true);assert.equal(game.paused,true);
  assert.equal(count(game,'larva',later),'10');
  assert.equal(game.act('forage',later).ok,false);
  game.resume(later);
  assert.equal(count(game,'larva',later+1000),'11');
  assert.equal(game.act({type:'unit',id:'drone',quantity:1},later+1000).ok,true);
  game.pause(later+2000);
  assert.equal(count(game,'meat',later+86400000),'26');
  assert.equal(count(game,'larva',later+86400000),'11');
  assert.equal(game.paused,true);
});
test('pause and resume are idempotent and wall-clock rollback rebases without negative progress',()=>{
  const game=classic({now:START,activeTimeOnly:true});
  game.resume(START);game.resume(START+1000);
  assert.equal(count(game,'larva',START+1000),'11');
  game.snapshot(START+500);
  assert.equal(count(game,'larva',START+1000),'11.5');
  game.pause(START+2000);game.pause(START+86400000);
  assert.equal(count(game,'larva',START+86400000),'12.5');
  game.resume(START+86400000);game.resume(START+86400000);
  assert.equal(count(game,'larva',START+86401000),'13.5');
});
test('saving a running active colony and reopening never grants offline growth',()=>{
  const game=classic({now:START,activeTimeOnly:true});game.resume(START);
  game.act({type:'unit',id:'drone',quantity:1},START);
  const saved=game.exportState(START+1000);
  assert.deepEqual(saved.timePolicy,{activeOnly:true,paused:false,wallAnchor:START+1000});
  const later=START+86400000,copy=new E.Game({now:later});copy.importState(saved,later);
  assert.equal(copy.activeTimeOnly,true);assert.equal(copy.paused,true);
  assert.equal(count(copy,'meat',later),'26');assert.equal(count(copy,'larva',later),'10');
  assert.equal(copy.exportState(later).clock,START+1000);
  copy.resume(later);
  assert.equal(count(copy,'meat',later+1000),'27');
  const paused=copy.exportState(later+1000);copy.pause(later+1000);
  const second=new E.Game({now:later+86400000,activeTimeOnly:true});second.importState(paused,later+86400000);
  assert.equal(count(second,'meat',later+86400000),'27');
});
test('legacy saves imported into active-time mode preserve counts without old offline catch-up',()=>{
  const old=classic();old.act({type:'unit',id:'drone',quantity:1},START);
  const saved=old.exportState(START),later=START+86400000;
  const game=new E.Game({now:later,activeTimeOnly:true});game.importState(saved,later);
  assert.equal(count(game,'meat',later),'25');assert.equal(count(game,'larva',later),'9');assert.equal(game.paused,true);
  game.resume(later);assert.equal(count(game,'meat',later+1000),'26');
});
test('intentional source time boosts work in active mode while hidden wall time stays paused',()=>{
  const legacy=fixture({nexus:'5',energy:'50000',drone:'1'}).exportState(START);
  const game=new E.Game({now:START,activeTimeOnly:true});game.importState(legacy,START);game.resume(START);
  assert.equal(game.act({type:'upgrade',id:'swarmwarp',quantity:1},START).ok,true);
  const boosted=game.exportState(START);
  assert.ok(Number(boosted.state.unittypes.meat)>35);assert.equal(boosted.state.unittypes.energy,'48000');
  assert.ok(boosted.state.skippedMillis>0);
  game.pause(START);const hidden=game.exportState(START+86400000);
  assert.deepEqual(hidden.state.unittypes,boosted.state.unittypes);
  assert.equal(hidden.clock,boosted.clock);
});
test('invalid time policies reject atomically without changing the target clock mode',()=>{
  const game=new E.Game({now:START,activeTimeOnly:true}),before=game.exportState(START);
  for(const policy of [null,{activeOnly:false,paused:true,wallAnchor:START},{activeOnly:true,paused:'yes',wallAnchor:START},{activeOnly:true,paused:true,wallAnchor:-1}]) {
    const state=JSON.parse(JSON.stringify(before));state.timePolicy=policy;
    assert.throws(()=>game.importState(state,START));assert.deepEqual(game.exportState(START),before);
  }
});


test('achievement timestamps and source session age exclude hidden wall time',()=>{
  const game=classic({now:START,activeTimeOnly:true}),later=START+86400000;
  game.resume(later);
  assert.equal(game.act({type:'unit',id:'drone',quantity:1},later+1000).ok,true);
  const state=game.exportState(later+1000);
  assert.equal(state.clock,START+1000);
  assert.equal(state.state.statistics.byUnit.drone.elapsedFirst,1000);
  assert.equal(state.state.achievements.drone1,1000);
  assert.equal(state.state.date.started,START);
});
test('automation share buys a tenth of affordable units, at least one, as Decimal strings',()=>{
  let game=fixture({meat:'1e6',larva:'1000'});
  let result=game.act({type:'unit',id:'drone',quantity:'share'},START);
  assert.equal(result.purchase.quantity,'100');assert.equal(count(game,'larva'),'900');
  assert.deepEqual(result.purchase.spent,[{id:'meat',name:'meat',amount:'1K'},{id:'larva',name:'larva',amount:'100'}]);
  game=fixture({meat:'1e6',larva:'1000',drone:'250'});
  result=game.act({type:'unit',id:'queen',quantity:'share'},START);
  assert.equal(result.purchase.quantity,'1');assert.equal(count(game,'drone'),'150');
  game=fixture({meat:'1e400',larva:'1e400'});
  result=game.act({type:'unit',id:'drone',quantity:'share'},START);
  assert.equal(result.purchase.quantity,'1e+398');assert.equal(count(game,'meat'),'9e+399');
  assert.equal(fixture({meat:'5',larva:'5'}).act({type:'unit',id:'drone',quantity:'share'},START).ok,false);
});
test('automation share levels upgrades within a tenth of stock and at most ten per tick',()=>{
  let game=fixture({meat:'1e400',larva:'1e400',drone:'1e300'});
  let result=game.act({type:'upgrade',id:'droneprod',quantity:'share'},START);
  assert.equal(result.purchase.quantity,'10');assert.equal(game.exportState(START).state.upgrades.droneprod,'10');
  game=fixture({drone:'100'});
  result=game.act({type:'upgrade',id:'droneprod',quantity:'share'},START);
  assert.equal(result.purchase.quantity,'1');assert.equal(result.purchase.kind,'upgrade');
});
test('auto-buy takes the first affordable binding in order and leaves stock for the next',()=>{
  const game=fixture({meat:'100000',larva:'1e6',drone:'50'});
  let result=game.autoBuy([{type:'unit',id:'queen'},{type:'unit',id:'drone'},{type:'upgrade',id:'droneprod'}],START);
  assert.equal(result.index,1);assert.equal(result.purchase.id,'drone');assert.equal(result.purchase.quantity,'1000');assert.equal(result.purchase.quantityLabel,'1K');
  assert.equal(count(game,'meat'),'90000');
  result=game.autoBuy([{type:'unit',id:'queen'},{type:'unit',id:'drone'}],START);
  assert.equal(result.index,0);assert.equal(result.purchase.id,'queen');assert.equal(result.purchase.quantity,'1');
  assert.equal(game.autoBuy([{type:'unit',id:'missing'},{type:'upgrade',id:'mutatehidden'},{type:'unit',id:'nest'}],START).ok,false);
  assert.equal(game.autoBuy(new Array(17).fill({type:'unit',id:'drone'}),START).ok,false);
});
test('snapshots carry structured costs, upgrade effects and achievement progress',()=>{
  const game=fixture({meat:'1e6',larva:'1000',drone:'150',queen:'2'});
  game.act({type:'unit',id:'drone',quantity:10},START);
  const snapshot=game.snapshot(START,{quantity:10});
  const queen=snapshot.items.find(i=>i.id==='queen');
  assert.deepEqual(queen.costs.map(c=>c.id),['meat','drone','larva']);
  assert.deepEqual(queen.batchCosts.find(c=>c.id==='drone'),{id:'drone',name:'drone',amount:'100'});
  assert.deepEqual(snapshot.items.find(i=>i.id==='droneprod').effects,[{op:'×',stat:'prod',id:'drone',name:'drone',amount:'2'}]);
  assert.deepEqual(snapshot.items.find(i=>i.id==='hatchery').effects,[{op:'+',stat:'base',id:'larva',name:'larva',amount:'1'}]);
  assert.deepEqual(snapshot.achievements.find(a=>a.id==='drone2').progress,{id:'drone',kind:'unit',name:'drone',value:'10',max:'201',have:'10',need:'201',percent:10/201});
  const first=snapshot.achievements.find(a=>a.id==='drone1');
  assert.equal(first.progress,null);assert.equal(first.earnedAt,0);assert.equal(first.masked,false);
  assert.ok(snapshot.achievements.some(a=>a.masked && a.name==='Unknown achievement'));
});
test('capped resources report their maximum and unit rates appear only when requested',()=>{
  const game=fixture({nexus:'2',energy:'40',drone:'5',queen:'1'});
  const snapshot=game.snapshot(START,{includeRates:true,includeMenu:false});
  assert.equal(snapshot.resources.find(r=>r.id==='energy').cap,'20K');assert.equal(snapshot.resources.find(r=>r.id==='meat').cap,'');
  assert.deepEqual(['velocity','velocityExact'].map(key=>snapshot.visibleUnits.find(u=>u.id==='drone')[key]),['2','2']);
  assert.equal(game.snapshot(START,{includeMenu:false}).visibleUnits.find(u=>u.id==='drone').velocity,undefined);
});
test('next-role estimate appears only for slow waits under a day',()=>{
  const eta=counts=>fixture(counts).snapshot(START,{includeEta:true,includeItems:false,includeMenu:false}).nextEta;
  assert.deepEqual(eta({meat:'1e12',larva:'1e6',drone:'1000',queen:'10',nest:'1'}),{id:'nest',name:'nest',seconds:330,label:'6m'});
  assert.equal(eta({meat:'1e12',larva:'1e6',drone:'1000',queen:'999',nest:'1'}),null);
  assert.equal(eta({meat:'1e12',larva:'1e6',drone:'1000',queen:'10',nest:'1e-9'}),null);
  assert.equal(eta({}),null);
  assert.equal(fixture({}).snapshot(START,{includeMenu:false}).nextEta,undefined);
});
test('ascension preview compares pending mutagen with the last reward',()=>{
  const game=fixture({ascension:'2',nexus:'5',energy:'10000',premutagen:'300',drone:'100'},{larvarush:'2000'});
  assert.equal(game.snapshot(START,{lastAscensionReward:'100'}).prestige.rewardRatio,'3');
  assert.equal(game.snapshot(START,{lastAscensionReward:'nope'}).prestige.rewardRatio,'');
  assert.equal(game.snapshot(START).prestige.rewardExact,'300');
  assert.equal(game.act({type:'ascend'},START).reward,'300');
});
test('ascend-now preview is computed only on request and predicts the next seeded mutagen spawn',()=>{
  const game=fixture({nexus:'5',energy:'1000',premutagen:'300',meat:'1e80'},{hatchery:'45',larvarush:'300'});
  assert.equal(game.snapshot(START,{includeItems:false}).prestige.preview,undefined);
  assert.equal(new E.Game({now:START}).snapshot(START,{includeAscension:true}).prestige.preview,undefined);
  const preview=game.snapshot(START,{includeItems:false,includeAscension:true}).prestige.preview;
  assert.equal(preview.gain,'300');assert.equal(preview.energy,'Energy 15% of 6.44K, full in 3h 2m.');
  assert.equal(preview.percent,'15');assert.equal(preview.keeps,'Keeps mutagen, mutations and achievements; the rest resets.');
  // The prediction must match what buying up to that level actually awards, and earlier levels award nothing.
  const [,level,amount,suffix]=/^Next mutagen: hatchery (\d+) adds ([\d.]+)(K?)\.$/.exec(preview.next);
  const low=Number(amount)*(suffix?1000:1),high=low+(suffix?100:1);
  const hatcheries=()=>Number(game.exportState(START).state.upgrades.hatchery);
  let before;
  while(hatcheries()<Number(level)) {
    before=BigInt(count(game,'premutagen'));
    assert.equal(game.act({type:'upgrade',id:'hatchery',quantity:1},START).ok,true);
    if(hatcheries()<Number(level)) assert.equal(BigInt(count(game,'premutagen')),before);
  }
  const added=Number(BigInt(count(game,'premutagen'))-before);
  assert.ok(added>=low&&added<high,added+' outside '+preview.next);
  const capped=fixture({nexus:'5',energy:'1000',premutagen:'300'},{hatchery:'45',larvarush:'100'});
  assert.equal(capped.snapshot(START,{includeItems:false,includeAscension:true}).prestige.preview.energy,'Energy 0% of 544K; spend energy to lower it.');
});
test('the next goal names a row key 7 can open, or ascension, at each stage',()=>{
  const {FIXTURES,fixtureState}=require('../scripts/dev/benchmark-engine.cjs');
  const stage=game=>{const s=game.snapshot(START,{includeAchievements:false});return [s.nextGoalTarget,s.prestige.available];};
  assert.deepEqual(stage(new E.Game({now:START})),[{kind:'unit',id:'drone'},false]);
  assert.deepEqual(stage(fixture({meat:'1e6',drone:'1e6',queen:'10'})),[null,false]);
  const expected={early:{kind:'unit',id:'queen'},middle:{kind:'upgrade',id:'hatchery'},late:{kind:'ascend',id:'ascend'},veryLate:{kind:'ascend',id:'ascend'}};
  Object.keys(FIXTURES).forEach(name=>{
    const state=fixtureState(E,name),game=new E.Game({now:state.clock});game.importState(state,state.clock);
    const snapshot=game.snapshot(state.clock,{includeAchievements:false}),target=snapshot.nextGoalTarget;
    assert.deepEqual(target,expected[name],name);
    if (target.kind === 'ascend') {assert.equal(snapshot.prestige.available,true,name);return;}
    const row=game.snapshot(state.clock,{includeAchievements:false,includeMenu:false,kind:target.kind,ids:[target.id]}).items.find(item=>item.id===target.id);
    assert.ok(row && row.kind === target.kind,name);
  });
});
test('compact quick-buy candidates follow the goal, top roach, upgrades and expansion from live state',()=>{
  const lean={includeItems:false,includeAchievements:false,includeMenu:false};
  assert.equal(fixture().snapshot(START,lean).quickSlots,undefined,'only when requested');
  const early=fixture({meat:'1000',larva:'1000',drone:'10'}).snapshot(START,Object.assign({includeQuick:true},lean)).quickSlots;
  assert.equal(early.length,5);
  assert.deepEqual(early[0].map(c=>c.id),['queen'],'the goal is the next queen, listed once');
  assert.equal(early[1][0].id,'drone');
  const slots=fixture({meat:'1e15',larva:'1e9',drone:'1e6',queen:'10000',nest:'100',nexus:'1',territory:'1000',energy:'100'}).snapshot(START,Object.assign({includeQuick:true},lean)).quickSlots;
  assert.deepEqual(slots[1].map(c=>c.id),['nest','queen','drone'],'affordable main-chain roaches, highest first');
  assert.equal(slots[2][0].id,'nestprod','the upgrade for the highest roach leads');
  assert.ok(slots[2].every(c=>c.kind==='upgrade'&&!/^mutate/.test(c.id)),'abilities and mutations are never ordinary upgrade picks');
  assert.ok(slots[3].some(c=>c.id==='expansion'));
  assert.ok(!slots[4].some(c=>['larvarush','swarmwarp','meatrush','territoryrush'].includes(c.id)),'an unaffordable energy ability stays off the hot bar');
  const charged=fixture({meat:'1e15',larva:'1e9',drone:'1e6',queen:'10000',nest:'100',nexus:'1',territory:'1000',energy:'8000'}).snapshot(START,Object.assign({includeQuick:true},lean)).quickSlots;
  assert.equal(charged[4].length,1);
  assert.ok(['larvarush','swarmwarp','meatrush','territoryrush'].includes(charged[4][0].id));
  assert.equal(charged[4][0].affordable,true);
  slots.forEach(list=>list.forEach(c=>{assert.equal(typeof c.progress,'number');assert.ok(c.progress>=0&&c.progress<=1);assert.equal(c.progress===1,c.affordable);}));
  // Stock far beyond JavaScript's range still yields bounded shares.
  const huge=fixture({meat:'1e5000',larva:'1e5000',territory:'1e5000',drone:'1e4000',queen:'1e3000'}).snapshot(START,Object.assign({includeQuick:true},lean)).quickSlots;
  huge.forEach(list=>list.forEach(c=>assert.ok(c.progress>=0&&c.progress<=1)));
  huge[1].filter(c=>c.affordable).forEach(c=>assert.match(c.gain,/^\d(\.\d+)?e\+\d+$/,'huge batches stay formatted text'));
});
test('a quick pick says what its key buys, and how long a short one will take',()=>{
  const lean={includeItems:false,includeAchievements:false,includeMenu:false,includeQuick:true};
  const counts={meat:'1e15',larva:'1e9',drone:'1e6',queen:'10000',nest:'100',nexus:'1',territory:'1000',energy:'100'};
  const slots=fixture(counts).snapshot(START,lean);
  const all=[].concat.apply([],slots.quickSlots);
  all.forEach(c=>assert.equal(c.gain,!c.affordable ? '0' : c.kind === 'upgrade' ? '1' : c.gain,c.id));
  // The badge is the purchase: a roach slot buys Max and an upgrade slot one level.
  all.filter(c=>c.affordable).forEach(c=> {
    const result=fixture(counts).act({type:c.kind,id:c.id,quantity:c.kind === 'unit' ? 'max' : 1},START);
    assert.equal(result.ok,true,c.id);
    assert.equal(result.purchase.quantityLabel,c.gain,c.id);
  });
  const game=fixture(counts);
  const ready=all.find(c=>c.affordable),short=all.find(c=>!c.affordable);
  assert.deepEqual(game.quickEta(ready.kind,ready.id,START),{ready:true,label:''});
  const eta=game.quickEta(short.kind,short.id,START);
  assert.equal(eta.ready,false);
  assert.match(eta.label,/^(\d+s|\d+m|\d+h( \d+m)?|\d+d( \d+h)?|over a year|)$/,short.id+': '+eta.label);
  // A cost nothing produces has no ETA.
  assert.deepEqual(fixture({meat:'10'}).quickEta('unit','queen',START),{ready:false,label:''});
  assert.equal(game.quickEta('unit','nothing',START),null);
});
test('compact refreshes cost the same with routine saves between them',()=>{
  const {FIXTURES,fixtureState}=require('../scripts/dev/benchmark-engine.cjs');
  const options={quantity:1,includeItems:false,includeAchievements:false,includeMenu:false,includeEta:true,includeQuick:true};
  Object.keys(FIXTURES).forEach(name=>{
    const state=fixtureState(E,name),game=new E.Game({now:state.clock,activeTimeOnly:true});
    game.importState(state,state.clock);game.resume(state.clock);
    // Decimal operations stand in for time, deterministically. A save that left the source
    // caches cold made the next refresh do four to ten times the median work.
    const proto=Object.getPrototypeOf(game._runtime.game.unit('meat').count());
    const names=['times','mul','plus','add','minus','sub','dividedBy','div','toPower','pow','comparedTo','cmp'],originals=names.map(key=>proto[key]);
    let ops=0;
    names.forEach((key,index)=>{proto[key]=function(){ops++;return originals[index].apply(this,arguments);};});
    const work=[];
    try {
      let clock=state.clock;
      for (let i=0;i<60;i++) {clock+=1000;if (i%15===7) game.exportState(clock);const before=ops;game.snapshot(clock,options);if (i>=5) work.push(ops-before);}
    } finally {names.forEach((key,index)=>{proto[key]=originals[index];});}
    work.sort((a,b)=>a-b);
    const median=work[work.length>>1],p95=work[Math.floor(work.length*0.95)];
    assert.ok(p95<=median*1.5 && work[work.length-1]<=median*2,name+': median '+median+', p95 '+p95+', max '+work[work.length-1]+' Decimal operations');
  });
});
test('a save stores what the source reify would, without reifying the live colony',()=>{
  const {fixtureState}=require('../scripts/dev/benchmark-engine.cjs');
  const state=fixtureState(E,'late'),at=state.clock+90000;
  const games=[0,1].map(()=>{const game=new E.Game({now:state.clock,activeTimeOnly:true});game.importState(JSON.parse(JSON.stringify(state)),state.clock);game.resume(state.clock);game.act({type:'reward',resource:'meat',seconds:30},state.clock+30000);return game;});
  const reifiedAt=games[0]._runtime.session.state.date.reified.getTime();
  games[1]._advance(at);games[1]._runtime.game.reify();
  assert.deepEqual(games[0].exportState(at),games[1].exportState(at));
  assert.equal(games[0]._runtime.session.state.date.reified.getTime(),reifiedAt,'the live reify point is unchanged');
});
test('active-time colonies pull in only the long gates',()=>{
  const active=new E.Game({now:START,activeTimeOnly:true});
  const inner=active._runtime.game;
  assert.equal(inner.ascendCost().toString(),'400000');
  assert.equal(inner.unit('invisiblehatchery').stat('random.minlevel.hatchery').toString(),'30');
  assert.equal(inner.unit('invisiblehatchery').stat('random.minlevel.expansion').toString(),'48');
  assert.equal(inner.unit('nexus').prod.find(prod=>prod.unit.name==='energy').val.toString(),'0.2');
  assert.equal(inner.unit('hive').cost.find(cost=>cost.unit.name==='greaterqueen').val.toString(),'40000');
  assert.equal(inner.unit('drone').cost.find(cost=>cost.unit.name==='meat').val.toString(),'10');
  assert.equal(inner.upgrade('nexus1').costByName.meat.val.toString(),'3333333333333');
  assert.equal(inner.upgrade('nexus4').costByName.larva.val.toString(),'10000000');
  assert.equal(inner.upgrade('expansion').costByName.territory.factor.toString(),'2.3');
  assert.equal(inner.upgrade('swarmlingtwin').costByName.larva.factor.toString(),'35');
  assert.equal(new E.Game({now:START})._runtime.game.ascendCost().toString(),'5000000');
  active.resume(START);
  active.setBonusAchievementPoints(20);
  const before=inner.achievementPoints();
  active.setBonusAchievementPoints(30);
  assert.equal(inner.achievementPoints(),before+10);
  const fed=new E.Game({now:START,activeTimeOnly:true});
  fed.resume(START);
  fed._runtime.game.unit('meat')._setCount(0);
  fed._runtime.game.upgrade('expansion')._setCount(2);
  assert.equal(fed.act({type:'forage'},START).ok,true);
  assert.equal(fed.exportState(START).state.unittypes.meat,'1.1');
});

// The opening: a new colony starts with nothing and grows only once the player has foraged a first forager.
test('a new colony opens dormant with no crumbs or hatchlings',()=>{
  const game=new E.Game({now:START}),state=game.exportState(START);
  assert.equal(state.state.unittypes.meat,'0');assert.equal(state.state.unittypes.larva,'0');
  assert.equal(state.state.unittypes.invisiblehatchery,'1');assert.equal(state.state.unittypes.freeRespec,'4');
  assert.deepEqual(state.opening,{awake:false,forages:0});
  const snapshot=game.snapshot(START,{includeItems:false,includeAchievements:false,includeMenu:false,includeQuick:true});
  assert.equal(snapshot.dormant,true);
  assert.deepEqual(snapshot.resources.map(r=>[r.id,r.amount,r.rate]),[['meat','0','0'],['larva','0','0']]);
  assert.equal(snapshot.nextGoal,'Press Red to forage. Gather 10 meat and 1 larva for your first drone.');
  assert.deepEqual(snapshot.nextGoalTarget,{kind:'unit',id:'drone'});
  assert.deepEqual(snapshot.quickSlots,[[{kind:'unit',id:'drone',name:'drone',affordable:false,progress:0,gain:'0',bottleneck:{id:'meat',name:'meat',short:true,producer:{kind:'unit',id:'drone',name:'drone'}}}],[],[],[],[]]);
  assert.equal(game.snapshot(START,{includeAchievements:false}).nextGoal,snapshot.nextGoal,'the menu shows the same goal');
});
test('nothing grows while the nest is dormant, in visible play or across a long gap',()=>{
  const active=new E.Game({now:START,activeTimeOnly:true});active.resume(START);
  assert.equal(count(active,'larva',START+3600000),'0');assert.equal(count(active,'meat',START+3600000),'0');
  assert.equal(active.act({type:'reward',resource:'larva',seconds:120},START+3600000).ok,false,'rewards scale with production, which is zero');
  assert.equal(count(new E.Game({now:START}),'larva',START+86400000*30),'0');
  assert.equal(active.quickEta('unit','drone',START+3600000).label,'','nothing produces the missing stock');
});
test('dormant forages give one crumb each and a hatchling on every second one',()=>{
  const game=new E.Game({now:START});
  const yields=[];
  for (let i=1;i<=10;i++) {
    const result=game.act('forage',START+i*150);
    assert.equal(result.ok,true);
    yields.push([result.hatchling,result.message,count(game,'meat',START+i*150),count(game,'larva',START+i*150)]);
  }
  assert.deepEqual(yields.slice(0,2),[[false,'Foraged 1 crumbs.','1','0'],[true,'Foraged 1 crumbs and 1 hatchling.','2','1']]);
  assert.deepEqual(yields[9],[true,'Foraged 1 crumbs and 1 hatchling.','10','5']);
  assert.deepEqual(game.exportState(START+1500).opening,{awake:false,forages:10});
  assert.equal(game.snapshot(START+1500,{includeItems:false,includeAchievements:false,includeMenu:false,includeQuick:true}).quickSlots[0][0].affordable,true,'ten presses buy the first forager');
  assert.equal(game.act('forage',START+1549).ok,true,'forage has no click cooldown');
});
test('the first purchase wakes the nest for good and production starts from then without catch-up',()=>{
  const game=new E.Game({now:START});
  for (let i=1;i<=10;i++) game.act('forage',START+i*150);
  const at=START+600000;
  const bought=game.act({type:'unit',id:'drone',quantity:'max'},at);
  assert.equal(bought.ok,true);assert.equal(bought.woke,true);assert.equal(bought.purchase.quantity,'1');
  assert.equal(count(game,'larva',at),'4');assert.equal(count(game,'meat',at),'0');
  assert.equal(count(game,'larva',at+10000),'14','the hatchery hatches one a second');
  assert.equal(count(game,'meat',at+10000),'10','the forager gathers one crumb a second');
  assert.deepEqual(game.exportState(at+10000).opening,{awake:true});
  const snapshot=game.snapshot(at+10000,{includeItems:false,includeAchievements:false,includeMenu:false,includeQuick:true});
  assert.equal(snapshot.dormant,false);assert.equal('nextGoal' in snapshot,false);
  const forage=game.act('forage',at+10000);
  assert.equal(forage.hatchling,false);assert.equal(count(game,'larva',at+10000),'14');
  assert.equal(game.act({type:'unit',id:'drone',quantity:1},at+20000).woke,false);
  // Auto-buy wakes it the same way.
  const auto=new E.Game({now:START});
  for (let i=1;i<=2;i++) auto.act('forage',START+i*150);
  const state=auto.exportState(START+300);state.state.unittypes.meat='10';auto.importState(state,START+300);
  assert.equal(auto.autoBuy([{type:'unit',id:'drone'}],START+300).woke,true);
  assert.equal(count(auto,'larva',START+1300),'1');
});
test('the opening persists through saves and rejects malformed values atomically',()=>{
  const game=new E.Game({now:START});
  for (let i=1;i<=3;i++) game.act('forage',START+i*150);
  const saved=game.exportState(START+450);
  assert.deepEqual(saved.opening,{awake:false,forages:3});
  const copy=new E.Game({now:START+450});copy.importState(saved,START+450);
  assert.equal(copy.act('forage',START+600).hatchling,true,'the fourth forage brings the second hatchling');
  assert.equal(count(copy,'larva',START+3600000),'2');
  const before=game.exportState(START+450);
  for (const opening of [null,[],'awake',{},{awake:'no'},{awake:false},{awake:false,forages:-1},{awake:false,forages:1.5},{awake:false,forages:'3'},{awake:true,forages:2},{awake:true,extra:1}]) {
    const state=JSON.parse(JSON.stringify(before));state.opening=opening;
    assert.throws(()=>game.importState(state,START+450),JSON.stringify(opening));
    assert.deepEqual(game.exportState(START+450),before);
  }
});
test('a save from before the opening stays dormant with its stock until it owns something',()=>{
  // Reset progress before the opening left the source's 35 meat and 10 larva, plus a few minutes of larvae.
  const legacy=fixture({meat:'35',larva:'210'}).exportState(START);delete legacy.opening;
  const game=new E.Game({now:START,activeTimeOnly:true});game.importState(legacy,START);game.resume(START);
  assert.deepEqual(game.exportState(START).opening,{awake:false,forages:0});
  assert.equal(count(game,'larva',START+60000),'210');assert.equal(count(game,'meat',START+60000),'35');
  assert.equal(game.act('forage',START+60000).message,'Foraged 1 crumbs.');
  const bought=game.act({type:'unit',id:'drone',quantity:'max'},START+60000);
  assert.equal(bought.woke,true);assert.equal(bought.purchase.quantity,'3');
  assert.equal(count(game,'larva',START+61000),'208');
  // Owning anything beyond the starting stock means the nest is already awake, whatever the save says.
  const owned=[[{drone:'1'},{}],[{queen:'2'},{}],[{},{hatchery:'1'}],[{ascension:'1'},{}],[{mutagen:'5'},{}]];
  owned.forEach(([counts,upgrades])=>{
    for (const opening of [undefined,{awake:false,forages:7}]) {
      const state=fixture(counts,upgrades).exportState(START);
      if (opening) state.opening=opening; else delete state.opening;
      const loaded=new E.Game({now:START});loaded.importState(state,START);
      assert.deepEqual(loaded.exportState(START).opening,{awake:true},JSON.stringify([counts,upgrades,opening]));
    }
  });
});
test('an ascension never sends the colony back to sleep',()=>{
  const game=fixture({ascension:'2',nexus:'5',energy:'10000',premutagen:'100',mutagen:'20',drone:'100'},{larvarush:'2000'});
  assert.equal(game.act({type:'ascend'},START).ok,true);
  const after=game.exportState(START);
  assert.deepEqual(after.opening,{awake:true});
  assert.equal(after.state.unittypes.meat,'35');assert.equal(after.state.unittypes.larva,'10');
  assert.ok(Number(count(game,'larva',START+10000))>10,'the restarted hatchery hatches at once');
  assert.equal(game.snapshot(START,{includeAchievements:false}).dormant,false);
});
// The original web game's tutorial, ported into the adapter: one step per stage of a colony, asked for only
// when a hint is wanted.
const hint=game=>game.snapshot(START,{includeItems:false,includeAchievements:false,includeHint:true}).hint;
test('the original tutorial step follows a colony from the dormant opening to ascension',()=>{
  const dormant=new E.Game({now:START,activeTimeOnly:true});
  assert.equal(hint(dormant).step,1);
  assert.match(hint(dormant).text,/^Welcome to Swarm Simulator\./);
  const ladder=[
    [1,{meat:'35',larva:'10'}],
    [2,{meat:'20',drone:'3'}],
    [3,{meat:'100',drone:'10'}],
    [11,{meat:'300',drone:'10'}],
    [4,{meat:'500',drone:'40'},{hatchery:'1'}],
    [5,{drone:'200',queen:'2'},{hatchery:'1'}],
    [6,{drone:'2000',queen:'5'},{hatchery:'2'}],
    [7,{queen:'8',swarmling:'3',territory:'3'},{hatchery:'2'}],
    [8,{queen:'20',swarmling:'40',territory:'60'},{hatchery:'3'}],
    [9,{queen:'500',swarmling:'1000',territory:'1e4'},{hatchery:'5',expansion:'2'}],
    ['nexus',{queen:'1e5',nest:'100',territory:'1e7'},{hatchery:'12',expansion:'6'}],
    ['energy',{queen:'1e7',nest:'1e4',nexus:'1',energy:'40'},{hatchery:'20',expansion:'12',nexus1:'1'}],
    [10,{nexus:'2',energy:'5000',premutagen:'1240'},{hatchery:'40',expansion:'30',nexus1:'1',nexus2:'1'}],
    [100,{ascension:'1',mutagen:'1240'}],
    ['ascended',{ascension:'1',mutagen:'1000'},{mutatehatchery:'1'}],
    ['ascended',{ascension:'3',mutagen:'5e5'}]
  ];
  ladder.forEach(([step,counts,upgrades])=>assert.equal(hint(fixture(counts,upgrades||{})).step,step,JSON.stringify(counts)));
  const {FIXTURES,fixtureState}=require('../scripts/dev/benchmark-engine.cjs');
  const steps=Object.keys(FIXTURES).map(name=>{const game=new E.Game({now:START});game.importState(fixtureState(E,name),START);return hint(game).step;});
  assert.deepEqual(steps,[11,11,10,'ascended'],'early, middle, late and very late');
  // A first ascension turns the ascend step into the original congratulations.
  const ascending=fixture({nexus:'5',energy:'1e5',premutagen:'100',drone:'100'},{larvarush:'2000'});
  assert.equal(hint(ascending).step,10);
  assert.equal(ascending.act({type:'ascend'},START).ok,true);
  assert.equal(hint(ascending).step,100);
});
test('tutorial text keeps the original words without links or markup, and only a hint request computes it',()=>{
  const games=[new E.Game({now:START}),fixture({drone:'3'}),fixture({meat:'500',drone:'40'},{hatchery:'1'}),fixture({queen:'1e5'},{hatchery:'12',expansion:'6'}),fixture({ascension:'1',mutagen:'1'})];
  games.forEach(game=>assert.doesNotMatch(hint(game).text,/[<>]|https?:|#\/|swarmsim\.com/));
  assert.equal(hint(games[2]).text,'You lead a small brood of worker drones. They long for a queen. You must sacrifice many drones to hatch a queen, but once born, your queen will slowly hatch drones without consuming meat or larvae.');
  assert.equal(games[1].snapshot(START,{includeMenu:false,includeItems:false,includeQuick:true,includeEta:true}).hint,undefined);
  assert.equal(games[1].snapshot(START).hint,undefined);
});

test('bottleneckInfo, pinnedCandidate, reserve auto-buy, evolution planner, and upgrade impact preview work end-to-end',()=>{
  // 1. Bottleneck guidance on items and quickSlots
  const game=fixture({meat:'50',larva:'0',drone:'20',queen:'5',territory:'5',stinger:'2'});
  const snap=game.snapshot(START,{includeQuick:true,pinnedQuick:{kind:'upgrade',id:'hatchery'}});
  const droneItem=snap.items.find(i=>i.id==='drone');
  assert.equal(droneItem.bottleneck.id,'larva');
  assert.equal(droneItem.bottleneck.short,true);
  assert.equal(droneItem.bottleneck.producer.kind,'upgrade');
  assert.equal(droneItem.bottleneck.producer.id,'hatchery');

  const expBuyable=fixture({meat:'50',larva:'0',drone:'20',queen:'5',territory:'15'}).snapshot(START).items.find(i=>i.id==='drone');
  assert.equal(expBuyable.bottleneck.producer.id,'expansion','when expansion is visible and affordable, larva bottleneck points at expansion');

  const expItem=snap.items.find(i=>i.id==='expansion');
  assert.equal(expItem.bottleneck.id,'territory');
  assert.equal(expItem.bottleneck.producer.id,'stinger');

  const queenItem=snap.items.find(i=>i.id==='queen');
  assert.equal(queenItem.bottleneck.id,'larva');

  // 2. Pinned quick candidate
  assert.ok(snap.pinnedCandidate);
  assert.equal(snap.pinnedCandidate.id,'hatchery');
  assert.equal(snap.pinnedCandidate.kind,'upgrade');
  assert.equal(game.snapshot(START,{includeQuick:true,pinnedQuick:{kind:'unit',id:'overmind6'}}).pinnedCandidate,null);

  // 3. Upgrade impact preview
  const prodGame=fixture({meat:'1e6',larva:'100',drone:'150',queen:'2'},{dronetwin:'1'});
  const prodSnap=prodGame.snapshot(START);
  const droneProd=prodSnap.items.find(i=>i.id==='droneprod');
  assert.equal(droneProd.impact,'drone output: 150/s \u2192 300/s');
  const droneTwin=prodSnap.items.find(i=>i.id==='dronetwin');
  assert.equal(droneTwin.impact,'Each purchase: \u00d72 \u2192 \u00d74');
  const hatcheryUp=prodSnap.items.find(i=>i.id==='hatchery');
  assert.equal(hatcheryUp.impact,'larva output: 1/s \u2192 2/s');

  // 4. Auto-buy with reserve and holdReason
  const reserveGame=fixture({meat:'800',larva:'10',drone:'50'});
  // Queen costs 810 meat, 100 drone, 1 larva. Reserve queen: drone share cannot dip meat below 810.
  const held=reserveGame.autoBuy([{type:'unit',id:'drone'}],START,{reserve:{kind:'unit',id:'queen'}});
  assert.equal(held.ok,false);
  assert.equal(held.holdReason,'Saving for queen');
  assert.equal(count(reserveGame,'meat'),'800');

  // With 830 meat and 100 larva, drone share would be 8 (80 meat), but reserve clamps it to 2 (20 meat) leaving 810 meat
  const clampedGame=fixture({meat:'830',larva:'100',drone:'50'});
  const clamped=clampedGame.autoBuy([{type:'unit',id:'drone'}],START,{reserve:{kind:'unit',id:'queen'}});
  assert.equal(clamped.ok,true);
  assert.equal(clamped.purchase.id,'drone');
  assert.equal(clamped.purchase.quantity,'2');
  assert.equal(count(clampedGame,'meat'),'810');

  // When reserved item itself is bound and affordable, autoBuy buys it
  const readyReserve=fixture({meat:'1000',larva:'10',drone:'150'});
  const boughtReserve=readyReserve.autoBuy([{type:'unit',id:'drone'},{type:'unit',id:'queen'}],START,{reserve:{kind:'unit',id:'queen'}});
  assert.equal(boughtReserve.ok,true);
  assert.equal(boughtReserve.purchase.id,'queen');
  assert.equal(boughtReserve.index,1);

  // Hold larva reason when upgrade is only short on larva
  const holdLarvaGame=fixture({meat:'1e6',larva:'1',drone:'50',queen:'5',swarmling:'5'},{expansion:'1',swarmlingtwin:'1'});
  // swarmlingtwin costs meat and larva; with 1 larva it is short only on larva
  const larvaHold=holdLarvaGame.autoBuy([{type:'upgrade',id:'swarmlingtwin'},{type:'unit',id:'drone'}],START);
  assert.equal(larvaHold.ok,false);
  assert.match(larvaHold.holdReason,/^Holding hatchlings for /);

  // 5. Evolution planner
  const evoGame=fixture({nexus:'5',energy:'1000',premutagen:'300',meat:'1e80'},{hatchery:'45',expansion:'50',larvarush:'100'});
  const preview=evoGame.snapshot(START,{includeItems:false,includeAscension:true}).prestige.preview;
  assert.ok(preview.planner);
  assert.ok(Array.isArray(preview.planner.thresholds));
  assert.ok(preview.planner.thresholds.length > 0 && preview.planner.thresholds.length <= 4);
  assert.match(preview.planner.warpImpact,/^Spending 2K energy drops cost by .+ energy$/);
});

