const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ROACH_PREVIEW_URL || 'http://127.0.0.1:8765/app/';
const screenshotDir = path.resolve('work/ui-qa');
fs.mkdirSync(screenshotDir, {recursive: true});
const mockEngine = `
(function () {
 var owned = 1;
 window.SwarmEngine = {Game: function () {
  this.snapshot = function (now,options) {options=options||{};return {
   resources: [{id:'meat',name:'Meat',amount:'2.35e+70',rate:'4.3e+65'},{id:'larva',name:'Larvae',amount:'71.61B',rate:'10.12M'},{id:'territory',name:'Territory',amount:'40,000',rate:'90'},{id:'energy',name:'Energy',amount:'50',rate:'0.1'},{id:'mutagen',name:'Mutagen',amount:'7.7e+4500',rate:'1,234.567'}],
   visibleUnitIds:owned>1?['unit0','unit8']:['unit0'],visibleUnits:owned>1?[{id:'unit0',name:'Forager',owned:true,tier:1,count:'5.6K',countExact:'5600'},{id:'unit8',name:'Queen',owned:true,tier:2,count:String(owned),countExact:String(owned)},{id:'swarm',name:'Swarmling',owned:true,tier:1,count:'40',countExact:'40',productionTargets:[{id:'territory',name:'Territory'}]},{id:'unit6',name:'Nest',owned:false,tier:3,count:'0',countExact:'0'}]:[{id:'unit0',name:'Forager',owned:true,tier:1,count:'5.6K',countExact:'5600'}],earnedAchievementIds:owned>1?['first']:[],earnedAchievementCount:owned>1?1:0,earnedAchievements:owned>1?[{id:'first',name:'A growing colony'}]:[],population:'1e100',ascensions:'2',tabs:[{id:'meat',label:'Meat'},{id:'territory',label:'Territory'},{id:'mutagen',label:'Mutations'}],
   items:Array.from({length:10},function(_,i){return {id:'unit'+i,kind:i%2?'upgrade':'unit',tab:'meat',name:i===9?'<script>unsafe</script>':'Worker '+i,description:i%2?'Upgrade '+i+' makes the colony faster. It also has a long explanation that only fits behind details.':'Produces resources for the growing colony. Requires a queen and enough larvae.',owned:String(owned),cost:'10 larvae + 100 meat'+(i===8?' + 100 unit0':''),costs:[{id:'larva',name:'Larvae',amount:'10'},{id:'meat',name:'Meat',amount:'100'}].concat(i===8?[{id:'drone',name:'drone',amount:'100'}]:[]).concat(i===2?[{id:'territory',name:'Territory',amount:'100,000'}]:[]),batchCosts:(function(q){return [{id:'larva',name:'Larvae',amount:String(10*q)},{id:'meat',name:'Meat',amount:String(100*q)}].concat(i===8?[{id:'drone',name:'drone',amount:String(100*q)}]:[]);}(options.quantity==='max'?99:options.quantity||1)),effects:i%2?[{op:'×',stat:'prod',id:'unit0',name:'Forager',amount:'2'}]:undefined,batchQuantity:options.quantity==='max'?'99':String(options.quantity||1),batchQuantityLabel:options.quantity==='max'?'99':String(options.quantity||1),batchOwnedGain:options.quantity==='max'?'198':String((options.quantity||1)*2),batchCost:options.quantity==='max'?'990 larvae + 9900 meat':options.quantity===10?'100 larvae + 1000 meat'+(i===8?' + 1000 unit0':''):'10 larvae + 100 meat'+(i===8?' + 100 unit0':''),batchAvailable:i!==2,available:i!==2,visible:true};}).concat([{id:'mutation0',kind:'upgrade',tab:'mutagen',name:'Mutation',description:'Permanent production growth.',owned:'0',cost:'10 mutagen',available:true,visible:true}]),
   achievements:Array.from({length:10},function(_,i){var earned=i<3||i===3&&owned>110;return {id:'achievement'+i,name:i>=7?'Unknown achievement':'Achievement '+i,description:'Grow a very large colony.',earned:earned,earnedAt:earned?i*1000:null,masked:i>=7,progress:earned||i>=7?null:{id:'queen',kind:'unit',name:'queen',value:String(34+i),max:'100',percent:(34+i)/100}};}),nextEta:options.includeEta&&owned>1?{id:'unit8',name:'Queen',seconds:840,label:'14m'}:null,
   prestige:{unlocked:true,available:true,cost:'50 energy',reward:'20 mutagen',rewardRatio:options.lastAscensionReward?'2':'',preview:options.includeAscension?(window.__ascensionViews=(window.__ascensionViews||0)+1,{gain:'20',percent:'15',energy:'Energy 15% of 6.44K, full in 3h 2m.',keeps:'Keeps mutagen, mutations and achievements; the rest resets.',next:'Next mutagen: hatchery 48 adds 49.6K, expansion 96 adds 52K.'}):undefined,description:'Begin another colony.',reset:'Meat, territory and units',preserve:'Achievements and permanent progression'},
   respec:{unlocked:true,available:true,description:'Reassign permanent mutations.',cost:'One ascension',reset:'Assigned mutations',preserve:'Mutagen'},nextGoal:'Reach the next queen tier.',nextGoalTarget:owned>1?{kind:'unit',id:'unit8'}:{kind:'ascend',id:'ascend'},
   quickSlots:options.includeQuick&&window.__quickSlots?(window.__quickCalls=(window.__quickCalls||0)+1,typeof window.__quickSlots==='function'?window.__quickSlots():window.__quickSlots):undefined
  };};
  this.act=function(action){window.__acts=(window.__acts||[]).concat([action]);if(action.type==='reward'){window.__rewards=(window.__rewards||[]).concat([action]);return {ok:true,message:'Gained',reward:{resource:action.resource,amount:String(action.seconds*10),amountExact:String(action.seconds*10)}};}var q=action.quantity==='max'?99:action.quantity;owned+=q;var result={ok:true,message:action.type+' completed'};
   if(action.type==='unit'||action.type==='upgrade')result.purchase={id:action.id,kind:action.type,name:'Worker',quantity:String(q),quantityLabel:String(q),spent:[{id:'larva',name:'Larvae',amount:String(10*q)},{id:'meat',name:'Meat',amount:String(100*q)}].concat(action.id==='unit8'?[{id:'drone',name:'drone',amount:String(100*q)}]:[])};
   if(action.type==='ascend')result.reward='20';return result;};
  this.quickEta=function(kind,id){window.__etaCalls=(window.__etaCalls||0)+1;return window.__eta||{ready:false,label:'12s'};};
  this.autoBuy=function(list){window.__autoLists=(window.__autoLists||[]).concat([list.map(function(b){return b.id;})]);owned+=1;return {ok:true,index:0,purchase:{id:list[0].id,kind:list[0].type,name:'Worker',quantity:'1',quantityLabel:'1',spent:[]}};};
  this.exportState=function(){return {version:2,owned:owned};};
  this.importState=function(state){if(!state||state.version!==2)throw new Error('Invalid state');owned=state.owned;};
 }};
}());`;
const mockSave = `
window.RoachSave={Store:function(storage){
 this.error='';this.load=function(){return {loaded:false,recovered:false,legacyAvailable:false,message:'Fixture save'};};
 this.save=function(game){try{storage.setItem('fixture',JSON.stringify(game.exportState()));this.error='';return true;}catch(error){this.error=error.message;return false;}};
 this.export=function(game){return JSON.stringify(game.exportState());};
 this.import=function(text,game){try{game.importState(JSON.parse(text));this.save(game);return {ok:true,message:'Imported'};}catch(error){return {ok:false,message:'Invalid save: '+error.message};}};
}};`;
// The source's own opening (35 crumbs, 10 hatchlings, an awake hatchery) as a stored save. A new colony
// opens dormant with neither; tests/opening.cjs covers that start.
function classicSave() {
 const now=Date.now(),game=new (require('../app/engine.js').Game)({now,activeTimeOnly:true}),state=game.exportState(now);
 Object.assign(state.state.unittypes,{meat:'35',larva:'10'});state.opening={awake:true};
 return JSON.stringify({format:'roach-colony',version:2,savedAt:state.clock,state});
}
async function fixture(browser, init, icons) {
 const page = await browser.newPage({viewport:{width:1920,height:1080}});
 if (init) await page.addInitScript(init);
 if (icons !== undefined) await page.route('**/habitat.js', async route => {
  const response = await route.fetch();
  route.fulfill({response, body:(await response.text())+(icons ? ';RoachHabitat.iconCanvas=function(id,size){var c=document.createElement("canvas");c.width=c.height=size;c.getContext("2d").fillRect(0,0,size,size);return c;};' : ';delete RoachHabitat.iconCanvas;')});
 });
 await page.route('**/engine.js', route => route.fulfill({contentType:'application/javascript',body:mockEngine}));
 await page.route('**/save.js', route => route.fulfill({contentType:'application/javascript',body:mockSave}));
 return page;
}
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 // Chance events read the local clock; pin daytime so the night shift never adds toasts to unrelated checks.
 const newPage=browser.newPage.bind(browser);
 browser.newPage=async options => {const page=await newPage(options);await page.addInitScript(() => {window.RoachMechanicsOptions={hour:() => 14};});return page;};
 try {
  const errors = [];
  const actual = await browser.newPage({viewport:{width:1920,height:1080}});
  actual.on('pageerror', e => errors.push(e.message));
  await actual.goto(base + 'engine.js');
  await actual.evaluate(text => localStorage.setItem('phil_roach_colony_v2',text),classicSave());
  await actual.goto(base + '?preview=1');
  await actual.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
  const initial = await actual.evaluate(() => colonyDiagnostics());
  assert.equal(initial.compact,true);assert.equal(initial.corner,'bottom-right');
  assert.equal(await actual.locator('#preview-scene').isVisible(),true);
  assert.equal(await actual.locator('#colony').evaluate(e => getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  await actual.evaluate(() => {window.compactPrevented=[];document.addEventListener('keydown',e => compactPrevented.push({code:e.keyCode,prevented:e.defaultPrevented}));});
  await actual.keyboard.press('ArrowDown');await actual.keyboard.press('Enter');await actual.keyboard.press('p');
  assert.equal(await actual.evaluate(() => colonyDiagnostics().compact),true);
  assert.equal(await actual.evaluate(() => compactPrevented.some(e => e.prevented)),false);
  assert.ok(await actual.locator('#plus').evaluate(e => {var r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;}));
  await actual.locator('#plus').focus();await actual.keyboard.press('Enter');
  assert.equal(await actual.evaluate(() => colonyDiagnostics().compact),false);
  await actual.locator('#close').click();
  await actual.screenshot({path:path.join(screenshotDir,'compact.png')});
  await actual.locator('#plus').click();assert.equal(await actual.evaluate(() => colonyDiagnostics().compact),false);
  assert.equal(await actual.locator('h1').textContent(),'Roach Colony');
  assert.doesNotMatch(await actual.locator('#colony').textContent(),/HDMI|bezel/i);
  assert.ok(await actual.locator('#colony').evaluate(e => {var r=e.getBoundingClientRect();return r.width<=570&&r.height<=608;}));
  assert.ok(await actual.locator('#items article').count()>0);
  assert.doesNotMatch(await actual.locator('#items').textContent(),/\b(meat|larvae|larva)\b/i);
  await actual.locator('[data-quantity="10"]').click();
  await actual.evaluate(() => {window.__cues=[];RoachHabitat.prototype.cue=function(name){__cues.push(name);};});
  await actual.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
  assert.match(await actual.locator('#message').textContent(),/Foraged 1 crumb\./);
  // A forage updates the crumb count immediately without a pop animation or habitat cue.
  assert.deepEqual(await actual.evaluate(() => [__cues.slice(),document.querySelector('#resources [data-resource="meat"] strong').className]),[[],'']);
  await actual.locator('[data-quantity="1"]').click();
  const openSnapshot=await actual.evaluate(() => colonyDiagnostics().snapshot);
  const available = openSnapshot.items.find(item => item.kind==='unit'&&item.available);
  assert.ok(available);
  const buy = actual.locator('[data-item="'+available.id+'"] .buy');await buy.click();
  assert.match(await actual.locator('[data-item="'+available.id+'"]').getAttribute('class'),/\bwash-a\b/,'a bought row washes once');
  const purchased = await actual.evaluate(id => colonyDiagnostics().snapshot.items.find(item => item.id===id&&item.kind==='unit').owned,available.id);
  assert.notEqual(purchased,available.owned);
  assert.equal(await actual.locator('[data-item="'+available.id+'"] .description').isVisible(),false);
  await actual.locator('[data-item="'+available.id+'"] .details').click();
  assert.equal(await actual.locator('[data-item="'+available.id+'"] .description').isVisible(),true);
  await actual.locator('[data-item="'+available.id+'"] .details').click();
  await actual.screenshot({path:path.join(screenshotDir,'expanded.png')});
  await actual.locator('[data-view="upgrades"]').click();
  assert.ok(await actual.locator('#items article').count()>0);
  await actual.locator('[data-view="more"]').click();await actual.locator('#export').click();
  const exported=await actual.locator('#save-text').inputValue();assert.ok(JSON.parse(exported));
  const download=actual.waitForEvent('download');await actual.locator('#dialog-confirm').click();assert.match((await download).suggestedFilename(),/\.json$/);
  await actual.locator('#dialog-cancel').click();await actual.locator('#import').click();
  await actual.locator('#save-text').fill('bad save');await actual.locator('#dialog-confirm').click();assert.equal(await actual.locator('#dialog').isVisible(),true);
  await actual.locator('#save-text').fill(exported);await actual.locator('#dialog-confirm').click();assert.equal(await actual.locator('#dialog').isVisible(),false);
  await actual.locator('#close').click();assert.equal(await actual.evaluate(() => colonyDiagnostics().compact),true);
  assert.equal(await actual.evaluate(() => colonyDiagnostics().closed),false);
  await actual.reload();await actual.waitForFunction(() => colonyDiagnostics().snapshot);await actual.locator('#plus').click();
  assert.equal(await actual.evaluate(id => colonyDiagnostics().snapshot.items.find(item => item.id===id&&item.kind==='unit').owned,available.id),purchased);
  await actual.keyboard.press('Escape');await actual.keyboard.press('Escape');assert.equal(await actual.evaluate(() => colonyDiagnostics().closed),false,'Back in compact mode leaves the colony open');
  // Critters only is chosen from More; it keeps the habitat and drops every line of text.
  await actual.evaluate(() => document.getElementById('critters-only').click());
  assert.deepEqual(await actual.evaluate(() => {var d=colonyDiagnostics();return [d.compact,d.critters,d.closed,d.snapshot.paused];}),[true,true,false,false]);
  assert.equal(await actual.evaluate(() => document.getElementById('colony').innerText.trim()),'');
  assert.equal(await actual.locator('#world').isVisible(),true);
  // Item 1: digits 0-9 and media automation keys do nothing in critters-only mode.
  const crittersBefore = await actual.evaluate(() => {
    var d = colonyDiagnostics();
    var u = d.snapshot.visibleUnits.find(x => x.id === 'drone');
    return {drones: u ? u.countExact : '0', paused: d.autoPaused, bindings: d.autoBindings.length};
  });
  for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) await actual.keyboard.press(digit);
  for (const mediaCode of [19, 415, 413]) await actual.evaluate(c => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: c, bubbles: true})), mediaCode);
  assert.deepEqual(await actual.evaluate(() => {
    var d = colonyDiagnostics();
    var u = d.snapshot.visibleUnits.find(x => x.id === 'drone');
    return {critters: d.critters, compact: d.compact, drones: u ? u.countExact : '0', paused: d.autoPaused, bindings: d.autoBindings.length, helpHidden: document.getElementById('key-help').hidden, hintHidden: document.getElementById('hint-card').hidden};
  }), {critters: true, compact: true, drones: crittersBefore.drones, paused: crittersBefore.paused, bindings: crittersBefore.bindings, helpHidden: true, hintHidden: true}, 'digits 0-9 and media keys are inert in critters-only mode');
  await actual.waitForTimeout(600);await actual.screenshot({path:path.join(screenshotDir,'critters-only.png')});
  await actual.keyboard.press('c');assert.deepEqual(await actual.evaluate(() => [colonyDiagnostics().compact,colonyDiagnostics().critters]),[true,false]);
  assert.equal(await actual.locator('#resources').isVisible(),true);
  await actual.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{remoteToggle:true}})));assert.equal(await actual.evaluate(() => colonyDiagnostics().closed),true,'one Blue press hides the colony from compact');

  // A real late colony quotes only the visible page and pages through the full selection.
  const {fixtureState}=require('../scripts/dev/benchmark-engine.cjs');
  const lateState=fixtureState(require('../app/engine.js'),'late');
  const late=await browser.newPage({viewport:{width:1920,height:1080}});late.on('pageerror',e => errors.push(e.message));
  await late.goto(base+'engine.js');
  await late.evaluate(text => {localStorage.clear();localStorage.setItem('phil_roach_colony_v2',text);},JSON.stringify({format:'roach-colony',version:2,savedAt:lateState.clock,state:lateState}));
  await late.goto(base);await late.waitForFunction(() => window.colonyDiagnostics && colonyDiagnostics().snapshot);
  assert.equal(await late.locator('#resources [data-resource="territory"]').isVisible(),true,'territory is visible in compact mode when Crevice is in quick-buy');
  assert.ok(await late.locator('#census .census-entry .rate:visible').count()>0,'census shows units produced per second');
  await late.keyboard.press('c');await late.locator('[data-view="upgrades"]').click();
  await late.locator('[data-tab="larva"]').click();
  assert.equal(await late.locator('#resources [data-resource="territory"]').isVisible(),true,'territory is visible on Upgrades -> Brood where Crevice is bought');
  await late.locator('[data-tab="territory"]').click();
  const latePage=async () => late.evaluate(() => {var d=colonyDiagnostics();return {page:d.page,quoted:d.snapshot.items.map(i => i.id),selection:d.snapshot.itemIds,rows:Array.prototype.map.call(document.querySelectorAll('#items article'),a => a.getAttribute('data-item')),costs:Array.prototype.map.call(document.querySelectorAll('#items .cost'),c => c.textContent),label:document.getElementById('page-label').textContent};});
  let shown=await latePage();
  assert.ok(shown.selection.length>8);assert.equal(shown.label,'1 / '+Math.ceil(shown.selection.length/4));
  assert.deepEqual(shown.rows,shown.selection.slice().reverse().slice(0,4));assert.deepEqual(shown.quoted.slice().sort(),shown.rows.slice().sort());
  assert.ok(shown.costs.every(cost => /^[\d.]+(?:e\d+|[KMBT])? \D/.test(cost)),shown.costs.join());
  await late.locator('#next').click();shown=await latePage();
  assert.equal(shown.page,1);assert.deepEqual(shown.rows,shown.selection.slice().reverse().slice(4,8));assert.deepEqual(shown.quoted.slice().sort(),shown.rows.slice().sort());
  await late.locator('[data-tab="meat"]').click();shown=await latePage();
  assert.equal(shown.page,0);assert.deepEqual(shown.rows,shown.selection.slice().reverse().slice(0,4));assert.ok(shown.quoted.length<=4);
  await late.locator('[data-view="units"]').click();await late.locator('[data-tab="meat"]').click();
  assert.ok(await late.locator('#items .unit-rate:visible').count()>0,'unit rows show units produced per second');
  // Pin & Save-toward reserve inside expanded row details, plus Field ops / Chronicle pages under More.
  await late.locator('#items article .details').first().click();
  assert.equal(await late.locator('#items article.open .row-tools button').count(), 2, 'expanded row offers Pin and Save toward');
  await late.locator('#items article.open .row-tools button').first().click();
  assert.ok((await late.evaluate(() => colonyDiagnostics().pinnedQuick)) !== null, 'pinning a row records pinnedQuick');
  await late.locator('#items article.open .row-tools button').nth(1).click();
  assert.ok((await late.evaluate(() => colonyDiagnostics().reserveTarget)) !== null, 'saving toward a row records reserveTarget');
  await late.locator('[data-view="more"]').click();
  await late.locator('#show-chronicle').click();
  assert.equal(await late.locator('#chronicle').isVisible(), true, 'Field ops / Chronicle opens under More');
  for (let cp = 0; cp < 3; cp++) {
    assert.ok(await late.locator('#menu').evaluate(e => e.scrollHeight <= e.clientHeight + 1), 'chronicle page ' + (cp + 1) + ' fits menu height');
    await late.locator('#next').click();
  }
  assert.ok((await late.locator('#chronicle').textContent()).indexOf('Support') !== -1, 'page 4 shows Support & inspector');
  await late.locator('#show-journal').click();
  await late.close();

  const advanced=await fixture(browser,null,false);advanced.on('pageerror',e => errors.push(e.message));
  await advanced.goto(base+'?preview=1');
  assert.deepEqual(await advanced.locator('#census .census-entry').evaluateAll(e => e.map(n => n.getAttribute('data-unit'))),['unit0']);
  await advanced.locator('#plus').click();
  assert.equal(await advanced.locator('#resources .resource:visible').count(),3);
  assert.ok(await advanced.evaluate(() => colonyDiagnostics().spriteCount<=64));
  assert.equal(await advanced.locator('#items article').count(),4);
  assert.equal(await advanced.locator('[data-item="unit2"] .buy').getAttribute('aria-disabled'),'true');
  await advanced.locator('[data-item="unit2"] .buy').focus();await advanced.keyboard.press('Enter');assert.match(await advanced.locator('#message').textContent(),/Not enough yet/);
  // Pixel chrome: the focused row wears bracket corners without moving, the frame keeps the menu at
  // 560 px with four rows and no scrolling, and the locked row's bar lights 4 of 10 segments for 40%.
  const row2=advanced.locator('[data-item="unit2"]');
  assert.ok(await row2.evaluate(e => getComputedStyle(e).borderImageSource.indexOf('ui_focus_9slice')!==-1),'the focused row shows brackets');
  assert.equal(await advanced.locator('[data-item="unit4"]').evaluate(e => getComputedStyle(e).borderImageSource),'none');
  const rowLayout=() => row2.evaluate(e => {var r=e.getBoundingClientRect(),m=e.parentNode.getBoundingClientRect();return [r.left-m.left,r.top-m.top,r.width,r.height];});
  const focusedBox=await rowLayout();await advanced.locator('#quantities [data-quantity="1"]').focus();
  assert.deepEqual(await rowLayout(),focusedBox,'brackets never shift layout');
  assert.ok(await advanced.locator('#quantities [data-quantity="1"]').evaluate(e => getComputedStyle(e).borderImageSource.indexOf('ui_focus_9slice')!==-1&&getComputedStyle(e).outlineStyle==='none'),'buttons outside rows show brackets instead of the glow');
  await row2.locator('.buy').focus();
  assert.deepEqual(await row2.locator('.row-bar').evaluate(e => [e.hidden,e.getAttribute('aria-valuenow'),e.querySelectorAll('i.on').length,e.children.length]),[false,'40',4,10]);
  assert.equal(await advanced.locator('[data-item="unit4"] .row-bar').isHidden(),true,'affordable rows have no bar');
  assert.deepEqual(await advanced.locator('#menu').evaluate(e => {var r=e.getBoundingClientRect();return [r.width,r.height<=500,e.scrollHeight<=e.clientHeight+1,getComputedStyle(e).borderImageSource.indexOf('ui_border_9slice')!==-1];}),[560,true,true,true],'the framed menu stays 560 px with four rows and no scrolling (within sub-pixel rounding)');
  assert.equal(await advanced.locator('#items article').count(),4);
  assert.ok(await advanced.locator('#menu-views button').evaluateAll(e => e.every(b => getComputedStyle(b,'::before').backgroundImage.indexOf('tab_')!==-1)),'menu views carry glyphs');
  assert.equal(await advanced.locator('#menu-views').evaluate(e => new Set(Array.from(e.children).filter(b => b.offsetParent).map(b => Math.round(b.getBoundingClientRect().top))).size),1,'menu views stay on one line');
  await advanced.waitForTimeout(300);await advanced.screenshot({path:path.join(screenshotDir,'pixel-units.png')});
  await advanced.screenshot({path:path.join(screenshotDir,'pixel-focused-row.png'),clip:await row2.evaluate(e => {var r=e.getBoundingClientRect();return {x:r.left-8,y:r.top-6,width:r.width+16,height:r.height+12};})});
  const builds=await advanced.evaluate(() => colonyDiagnostics().listBuilds);
  await advanced.locator('[data-quantity="10"]').click();await advanced.locator('[data-item="unit8"] .buy').click();
  assert.match(await advanced.locator('#message').textContent(),/^Hatched 10 \w+\. Used 1K Forager roaches\.$/);assert.match(await advanced.locator('#local-hint').textContent(),/Used 1K Forager roaches/);
  assert.match(await advanced.locator('[data-item="unit8"] .owned').textContent(),/11/);
  assert.deepEqual(await advanced.locator('#census .census-entry').evaluateAll(e => e.map(n => n.getAttribute('data-unit'))),['unit8','unit0','swarm']);
  assert.equal(await advanced.locator('#census .census-entry').first().textContent(),'11Queen');
  assert.equal(await advanced.locator('#census .item-icon').count(),3);
  await advanced.evaluate(() => {window.censusEntry=document.querySelector('#census .census-entry');});
  assert.equal(await advanced.evaluate(() => colonyDiagnostics().listBuilds),builds);
  assert.equal(await advanced.locator('[data-item="unit8"] .cost').textContent(),'100 Hatchlings + 1K Crumbs + 1K Forager roaches');
  assert.equal(await advanced.locator('[data-item="unit8"] .buy').textContent(),'Buy 10');
  await advanced.locator('[data-quantity="max"]').click();await advanced.locator('[data-item="unit8"] .buy').click();
  assert.match(await advanced.locator('[data-item="unit8"] .owned').textContent(),/110/);
  assert.equal(await advanced.locator('#census strong').first().textContent(),'110');
  assert.ok(await advanced.evaluate(() => document.querySelector('#census .census-entry')===window.censusEntry));
  while(await advanced.locator('#next').isEnabled())await advanced.locator('#next').click();assert.equal(await advanced.locator('#items article').count(),1);
  await advanced.locator('[data-view="upgrades"]').click();
  assert.deepEqual(await advanced.locator('#items article').evaluateAll(e => e.map(n => n.getAttribute('data-item'))),['unit9','unit7','unit5','unit3']);
  assert.match(await advanced.locator('[data-item="unit9"] h2').textContent(),/<script>/);assert.equal(await advanced.locator('#items script').count(),0);
  assert.equal(await advanced.locator('[data-item="unit7"] .brief').isVisible(),true);assert.match(await advanced.locator('[data-item="unit7"] .brief').textContent(),/^×2 Forager output · Upgrade 7/);assert.equal(await advanced.locator('[data-item="unit7"] .description').isVisible(),false);
  assert.ok(await advanced.locator('[data-item="unit7"] .brief').evaluate(e => e.scrollWidth>e.clientWidth&&getComputedStyle(e).textOverflow==='ellipsis'));
  assert.ok(await advanced.locator('#menu').evaluate(e => {var r=e.getBoundingClientRect();return r.width<=560&&r.height<=500&&e.scrollHeight<=e.clientHeight;}));
  await advanced.screenshot({path:path.join(screenshotDir,'upgrades.png')});
  await advanced.locator('[data-item="unit7"] .details').click();
  assert.equal(await advanced.locator('[data-item="unit7"] .brief').isVisible(),false);assert.equal(await advanced.locator('[data-item="unit7"] .description').isVisible(),true);
  await advanced.locator('[data-item="unit7"] .details').click();
  await advanced.locator('[data-tab="mutagen"]').click();await advanced.waitForTimeout(550);
  assert.equal(await advanced.locator('#resources .resource:visible').count(),3);
  assert.deepEqual(await advanced.locator('#resources .resource:visible').evaluateAll(e => e.map(n => n.firstChild.textContent+' '+n.lastChild.textContent)),['2.35e70 4.3e65 / sec','71.6B 10.1M / sec','7.7e4500 1.23K / sec']);
  assert.equal(await advanced.locator('#resources .resource:visible').evaluateAll(e => new Set(e.map(n => Math.round(n.getBoundingClientRect().top))).size),1,'resource strip stays on one row');
  await advanced.locator('[data-view="more"]').click();await advanced.locator('#show-achievements').click();
  assert.equal(await advanced.locator('#achievements article').count(),4);assert.equal(await advanced.locator('#achievements article').nth(3).locator('span').textContent(),'37 / 100 Nest queens');
  // Achievement progress lights whole tenths: 40% of the way lights four of ten segments.
  assert.deepEqual(await advanced.locator('#achievements article').first().locator('.achievement-bar').evaluate(e => [e.hidden,e.getAttribute('aria-valuenow'),e.querySelectorAll('i.on').length]),[false,'40',4]);
  assert.ok(await advanced.locator('#menu').evaluate(e => e.scrollHeight<=e.clientHeight),'achievements fit without scrolling');
  await advanced.screenshot({path:path.join(screenshotDir,'pixel-achievements.png')});
  await advanced.screenshot({path:path.join(screenshotDir,'achievement-progress.png')});assert.match(await advanced.locator('#page-label').textContent(),/^1 \/ 4 · 3 \/ 18 earned$/,'eight guest achievements join the source\'s');
  // Closest locked goals lead, then the latest earned, then one row for the undiscovered.
  assert.deepEqual(await advanced.locator('#achievements article strong').allTextContents(),['Achievement 6','Achievement 5','Achievement 4','Achievement 3']);
  await advanced.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
  assert.deepEqual(await advanced.locator('#achievements article strong').allTextContents(),['Achievement 6','Achievement 5','Achievement 4','Guest book']);
  assert.equal(await advanced.locator('#achievements article').nth(3).locator('span').textContent(),'0 / 1 visitors');
  await advanced.locator('#next').click();
  assert.deepEqual(await advanced.locator('#achievements article strong').allTextContents(),['Pest friends','Common ground','Full house','Heart of gold']);
  assert.match(await advanced.locator('#achievements article').nth(2).locator('span').textContent(),/^0 \/ \d+ visitors$/);
  await advanced.locator('#next').click();
  assert.deepEqual(await advanced.locator('#achievements article strong').allTextContents(),['Gold standard','Not in my nest','Hold the perimeter','Achievement 3']);
  assert.equal(await advanced.locator('#achievements article').nth(3).locator('span').textContent(),'EARNED');
  await advanced.locator('#next').click();
  assert.deepEqual(await advanced.locator('#achievements article strong').allTextContents(),['Achievement 2','Achievement 1','Achievement 0','3 more to discover']);
  assert.equal(await advanced.locator('#achievements article').nth(3).locator('span').textContent(),'');
  await advanced.locator('#previous').click();await advanced.locator('#previous').click();await advanced.locator('#previous').click();
  assert.equal(await advanced.evaluate(() => window.__ascensionViews || 0),0);
  await advanced.locator('[data-view="evolution"]').click();
  assert.equal(await advanced.locator('#prestige-preview').textContent(),'Keeps mutagen, mutations and achievements; the rest resets. Next mutagen: egg chamber 48 adds 49.6K, crevice 96 adds 52K.');
  assert.ok(await advanced.locator('#menu').evaluate(e => {var r=e.getBoundingClientRect();return r.width<=560&&r.height<=500&&e.scrollHeight<=e.clientHeight;}));
  await advanced.screenshot({path:path.join(screenshotDir,'evolution-preview.png')});
  await advanced.locator('#ascend').click();
  assert.match(await advanced.locator('#dialog-description').textContent(),/Resets: Crumbs/);
  await advanced.keyboard.press('Escape');assert.equal(await advanced.evaluate(() => colonyDiagnostics().closed),false);
  assert.equal(await advanced.locator('#prestige-cost').textContent(),'Ascend now for +20 mutagen. Energy 15% of 6.44K, full in 3h 2m.');
  await advanced.locator('#ascend').click();await advanced.locator('#dialog-confirm').click();
  assert.equal(await advanced.evaluate(() => colonyDiagnostics().habitat.events.ceremonies),1,'an ascension files the colony into the nest');
  assert.equal(await advanced.evaluate(() => localStorage.getItem('phil_roach_colony_ui_last_ascension_v1')),'20');
  assert.equal(await advanced.locator('#prestige-cost').textContent(),'Ascend now for +20 mutagen (×2 vs last ascension). Energy 15% of 6.44K, full in 3h 2m.');
  await advanced.locator('#respec').click();await advanced.locator('#dialog-confirm').click();assert.match(await advanced.locator('#message').textContent(),/respec completed/);
  await advanced.locator('[data-view="units"]').click();await advanced.screenshot({path:path.join(screenshotDir,'late-game.png')});
  assert.ok(await advanced.locator('#menu').evaluate(e => {var r=e.getBoundingClientRect();return r.width<=560&&r.height<=500;}));
  await advanced.setViewportSize({width:960,height:540});
  assert.ok(await advanced.locator('#colony').evaluate(e => {var r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;}));
  await advanced.locator('[data-view="more"]').click();await advanced.locator('#import').click();
  assert.ok(await advanced.locator('#dialog').evaluate(e => {var r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
  while(!(await advanced.evaluate(() => colonyDiagnostics().compact)))await advanced.keyboard.press('Escape');assert.equal(await advanced.evaluate(() => colonyDiagnostics().closed),false);
  await advanced.keyboard.press('c');assert.equal(await advanced.evaluate(() => colonyDiagnostics().compact),false);

  const keys=await fixture(browser,null,true);await keys.goto(base);await keys.locator('#plus').click();
  assert.equal(await keys.locator('#census .sprite-icon').count(),1);assert.equal(await keys.locator('#items .item-head .sprite-icon').count(),4);
  await keys.keyboard.press('1');assert.equal((await keys.evaluate(() => colonyDiagnostics().lastPurchase)).id,'unit8');
  await keys.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:404,bubbles:true})));
  assert.match(await keys.locator('[data-item="unit8"] .owned').textContent(),/3/);
  await keys.keyboard.press('5');assert.equal((await keys.evaluate(() => colonyDiagnostics().autoBindings))[0].id,'unit8');
  await keys.waitForFunction(() => document.querySelector('[data-item="unit8"] .owned').textContent==='× 4',{},{timeout:4000});
  await keys.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:19,bubbles:true})));
  await keys.waitForTimeout(2300);assert.match(await keys.locator('[data-item="unit8"] .owned').textContent(),/4/);
  await keys.locator('[data-view="more"]').click();await keys.locator('#import').click();
  await keys.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
  await keys.keyboard.press('Escape');await keys.locator('[data-view="units"]').click();
  assert.match(await keys.locator('[data-item="unit8"] .owned').textContent(),/4/);
  await keys.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:415,bubbles:true})));
  await keys.waitForFunction(() => document.querySelector('[data-item="unit8"] .owned').textContent==='× 5',{},{timeout:4000});
  await keys.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:413,bubbles:true})));
  assert.equal(await keys.evaluate(() => colonyDiagnostics().autoBindings.length),0);
  // Rows 1-3 hold unit8 (tier 2), unit6 (tier 3) and unit4 (no tier): automation offers the
  // highest tier first and rotates one place after each purchase.
  await keys.evaluate(() => {window.__autoLists=[];});
  for (const id of ['unit8','unit6','unit4']) {await keys.locator(`[data-item="${id}"] .buy`).focus();await keys.keyboard.press('5');}
  await keys.waitForFunction(() => window.__autoLists.length>=2,{},{timeout:6000});
  await keys.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:413,bubbles:true})));
  const lists=await keys.evaluate(() => window.__autoLists.slice(0,2));
  const cycle=['unit6','unit8','unit4'],rotation=list => cycle.slice(cycle.indexOf(list[0])).concat(cycle.slice(0,cycle.indexOf(list[0])));
  lists.forEach(list => assert.deepEqual(list,rotation(list)));
  assert.equal(cycle.indexOf(lists[1][0]),(cycle.indexOf(lists[0][0])+1)%3);
  await keys.keyboard.press('9');assert.equal(await keys.locator('#key-help').isVisible(),true);assert.ok(await keys.locator('#key-help').evaluate(e => e.scrollHeight<=e.clientHeight),'Key help fits without scrolling');
  assert.ok(await keys.locator('#key-help').evaluate(e => getComputedStyle(e).borderImageSource.indexOf('ui_border_9slice')!==-1),'key help wears the soil frame');await keys.screenshot({path:path.join(screenshotDir,'pixel-key-help.png')});
  await keys.keyboard.press('9');
  const focused=() => keys.evaluate(() => document.activeElement.getAttribute('data-focus'));
  await keys.locator('#close').click();await keys.keyboard.press('c');assert.equal(await focused(),'buy-unit8');
  await keys.keyboard.press('ArrowRight');assert.equal(await focused(),'buy-unit8');
  await keys.keyboard.press('ArrowLeft');assert.equal(await focused(),'auto-unit-unit8');
  await keys.keyboard.press('ArrowDown');assert.equal(await focused(),'auto-unit-unit6');
  await keys.keyboard.press('ArrowRight');await keys.keyboard.press('ArrowDown');await keys.keyboard.press('ArrowDown');
  assert.equal(await focused(),'buy-unit2');
  await keys.keyboard.press('ArrowDown');assert.equal(await keys.evaluate(() => colonyDiagnostics().page),1);assert.equal(await focused(),'buy-unit0');
  const before=await keys.locator('[data-item="unit0"] .owned').textContent();
  await keys.keyboard.press('Enter');assert.notEqual(await keys.locator('[data-item="unit0"] .owned').textContent(),before);
  await keys.keyboard.press('ArrowUp');assert.ok(await keys.evaluate(() => document.getElementById('list-tools').contains(document.activeElement)));
  await keys.keyboard.press('PageDown');assert.equal(await keys.evaluate(() => colonyDiagnostics().page),0);
  await keys.keyboard.press('PageUp');assert.equal(await keys.evaluate(() => colonyDiagnostics().page),1);
  await keys.keyboard.press('Minus');assert.equal(await keys.evaluate(() => colonyDiagnostics().page),0);
  await keys.keyboard.press('ArrowDown');await keys.keyboard.press('ArrowDown');assert.equal(await focused(),'buy-unit6');
  for (let i=0;i<4;i++) await keys.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:405,bubbles:true})));
  assert.equal(await keys.evaluate(() => colonyDiagnostics().menu),'units');assert.equal(await focused(),'buy-unit6');
  await keys.keyboard.press('Escape');await keys.keyboard.press('c');assert.equal(await focused(),'buy-unit6');
  await keys.locator('#close').click();await keys.keyboard.press('0');

  // Number keys act on the menu: 7 follows the goal, 5 and 8 the highlighted row, 6 the quantity, 0 the hint.
  const numbers=await fixture(browser,null,true);await numbers.goto(base);await numbers.locator('#plus').click();
  const at=() => numbers.evaluate(() => document.activeElement.getAttribute('data-focus'));
  const numberState=() => numbers.evaluate(() => colonyDiagnostics());
  // While the goal is to ascend, 7 opens Evolution on the ascend button.
  await numbers.keyboard.press('7');assert.equal((await numberState()).menu,'evolution');assert.equal(await at(),'ascend');
  await numbers.keyboard.press('5');assert.match(await numbers.locator('#message').textContent(),/Highlight a unit or upgrade row/);
  assert.equal((await numberState()).autoBindings.length,0);
  await numbers.locator('[data-view="units"]').click();await numbers.keyboard.press('1');
  // The goal now targets the queen row: 7 leaves the upgrades list and the second page for it.
  await numbers.locator('[data-view="upgrades"]').click();
  await numbers.locator('[data-view="units"]').click();await numbers.keyboard.press('PageUp');assert.equal((await numberState()).page,1);
  await numbers.locator('[data-view="upgrades"]').click();
  await numbers.keyboard.press('7');
  assert.deepEqual([(await numberState()).menu,(await numberState()).page,await at()],['units',0,'buy-unit8']);
  // 5 binds whichever row is highlighted, including one past the first four.
  await numbers.keyboard.press('PageUp');assert.equal(await at(),'buy-unit0');
  await numbers.keyboard.press('5');assert.deepEqual((await numberState()).autoBindings,[{type:'unit',id:'unit0'}]);
  await numbers.keyboard.press('8');assert.equal(await numbers.locator('[data-item="unit0"] .description').isVisible(),true);
  await numbers.keyboard.press('8');assert.equal(await numbers.locator('[data-item="unit0"] .description').isVisible(),false);
  const pressed=() => numbers.evaluate(() => document.querySelector('#quantities [aria-pressed="true"]').getAttribute('data-quantity'));
  for (const expected of ['10','max','1']) {
   await numbers.keyboard.press('6');assert.equal(await pressed(),expected);
   assert.equal(await numbers.locator('[data-item="unit0"]').getAttribute('data-quantity'),expected);
  }
  await numbers.keyboard.press('q');assert.equal((await numberState()).unhandledKeys.slice(-1)[0],81);
  await numbers.keyboard.press('0');assert.deepEqual([(await numberState()).compact,(await numberState()).critters,await numbers.locator('#hint-card').isVisible()],[false,false,true]);
  assert.equal(await numbers.locator('#hint-card .hint-goal').textContent(),'Next goal: Reach the next nest queen tier.');
  await numbers.keyboard.press('0');assert.equal(await numbers.locator('#hint-card').isVisible(),false,'0 again closes the hint');
  assert.equal((await numberState()).autoBindings.length,1,'0 no longer clears automation');
  const hidden=await browser.newPage();await hidden.addInitScript(() => Object.defineProperty(document,'hidden',{value:true,configurable:true}));
  await hidden.goto(base);await hidden.waitForFunction(() => colonyDiagnostics().snapshot);
  assert.equal(await hidden.evaluate(() => colonyDiagnostics().snapshot.paused),true);
  await hidden.waitForTimeout(1100);
  await hidden.evaluate(() => {Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await hidden.evaluate(() => colonyDiagnostics().snapshot.paused),false);

  const transparent=await browser.newPage({viewport:{width:1920,height:1080}});await transparent.goto(base);await transparent.waitForFunction(() => colonyDiagnostics().snapshot);
  assert.equal(await transparent.locator('#preview-scene').isVisible(),false);
  assert.equal(await transparent.locator('body').evaluate(e => getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  await transparent.screenshot({path:path.join(screenshotDir,'transparent.png'),omitBackground:true});
  const tv=await fixture(browser,() => {window.PalmSystem={launchParams:'{}'};window.close=()=>{window.didClose=true;};});await tv.goto(base);
  assert.equal(await tv.evaluate(() => colonyDiagnostics().deadline),0);
  var remaining;
  await tv.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{autoCloseSeconds:999}})));
  remaining=await tv.evaluate(() => (colonyDiagnostics().deadline-Date.now())/1000);assert.ok(remaining>118&&remaining<=120);
  await tv.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{autoCloseSeconds:1}})));await tv.waitForFunction(() => window.didClose===true);
  assert.equal(await tv.evaluate(() => colonyDiagnostics().closed),true);
  await tv.evaluate(() => {window.PalmSystem.launchParams=JSON.stringify({autoCloseSeconds:10,compact:false,corner:'top-left'});window.webOSRelaunch();});
  assert.equal(await tv.evaluate(() => colonyDiagnostics().closed),false);assert.equal(await tv.locator('#menu').isVisible(),true);assert.equal(await tv.evaluate(() => colonyDiagnostics().corner),'top-left');
  await tv.evaluate(() => {window.PalmSystem.launchParams=JSON.stringify({remoteToggle:true,compact:true,autoCloseSeconds:0});window.webOSRelaunch();});
  assert.equal(await tv.evaluate(() => colonyDiagnostics().closed),true);
  await tv.evaluate(() => window.webOSRelaunch());assert.equal(await tv.evaluate(() => colonyDiagnostics().closed),false,'Blue reopens an overlay that stayed running after closing');
  await tv.evaluate(() => window.webOSRelaunch());assert.equal(await tv.evaluate(() => colonyDiagnostics().closed),true);
  const remote=await fixture(browser,() => {window.PalmSystem={launchParams:JSON.stringify({remoteToggle:true,compact:true,autoCloseSeconds:0})};window.close=()=>{};});await remote.goto(base);
  const focus=await fixture(browser,() => {window.focusLog=[];window.PalmSystem={launchParams:'{}',setWindowProperty:(name,value)=>{if(name==='needFocus')window.focusLog.push(value);}};window.close=()=>{};});await focus.goto(base);
  assert.equal(await focus.evaluate(() => window.focusLog.slice(-1)[0]),'false','compact mode leaves the remote with YouTube');
  await focus.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{remoteKey:405}})));
  assert.equal(await focus.evaluate(() => colonyDiagnostics().compact),false);assert.equal(await focus.evaluate(() => window.focusLog.slice(-1)[0]),'true','the menu takes the remote');
  await focus.keyboard.press('Escape');assert.equal(await focus.evaluate(() => colonyDiagnostics().compact),true);assert.equal(await focus.evaluate(() => window.focusLog.slice(-2).join()),'true,false');
  await focus.evaluate(() => document.getElementById('critters-only').click());
  assert.equal(await focus.evaluate(() => colonyDiagnostics().critters),true);assert.equal(await focus.evaluate(() => window.focusLog.slice(-1)[0]),'false','critters only leaves the remote with YouTube');
  await focus.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{remoteKey:403}})));assert.match(await focus.locator('#message').textContent(),/forage completed/);
  assert.equal(await focus.evaluate(() => colonyDiagnostics().closed),false,'a forwarded key never toggles the colony');
  assert.equal(await remote.evaluate(() => colonyDiagnostics().closed),false);assert.equal(await remote.evaluate(() => colonyDiagnostics().deadline),0);
  await remote.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
  assert.match(await remote.locator('#message').textContent(),/forage completed/);
  await remote.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:405,bubbles:true})));
  assert.equal(await remote.evaluate(() => colonyDiagnostics().menu),'upgrades');assert.equal(await remote.evaluate(() => colonyDiagnostics().compact),false);
  await remote.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:405,bubbles:true})));assert.equal(await remote.evaluate(() => colonyDiagnostics().menu),'evolution');
  await remote.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:404,bubbles:true})));assert.match(await remote.locator('#message').textContent(),/Buy a unit or upgrade first/);
  await remote.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:406,bubbles:true})));assert.equal(await remote.evaluate(() => colonyDiagnostics().closed),true);
  const denied=await fixture(browser,() => {Storage.prototype.setItem=()=>{throw new Error('Storage denied');};});await denied.goto(base);
  assert.equal(await denied.locator('#save-warning').isVisible(),true);await denied.locator('#plus').click();await denied.locator('[data-view="more"]').click();await denied.locator('#export').click();
  assert.ok((await denied.locator('#save-text').inputValue()).length);
  const toast=await fixture(browser,() => {if(!localStorage.getItem('phil_roach_colony_ui_milestones_v1'))localStorage.setItem('phil_roach_colony_ui_milestones_v1','7');});await toast.goto(base);
  assert.equal(await toast.evaluate(() => colonyDiagnostics().milestone.showing),false);
  await toast.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
  assert.equal(await toast.locator('#unit-intro').isVisible(),true);await toast.locator('#intro-close').click();
  await toast.waitForFunction(() => colonyDiagnostics().milestone.showing,{},{timeout:3000});
  assert.equal(await toast.locator('#milestone span').textContent(),'Nest queen');
  assert.equal(await toast.locator('#milestone em').textContent(),'The walls hum a little louder tonight.');
  assert.equal(await toast.evaluate(() => localStorage.getItem('phil_roach_colony_ui_flavor_v1')),'1');
  await toast.screenshot({path:path.join(screenshotDir,'milestone-flavor.png')});
  assert.ok(await toast.locator('#milestone').evaluate(e => getComputedStyle(e).borderImageSource.indexOf('ui_border_9slice')!==-1),'toasts wear the soil frame');
  await toast.evaluate(() => document.body.classList.add('preview'));await toast.waitForTimeout(350);
  await toast.screenshot({path:path.join(screenshotDir,'pixel-toast.png')});
  assert.ok(await toast.evaluate(() => colonyDiagnostics().milestone.queued<=4));
  // The toast plays a short exit before it hides.
  await toast.waitForFunction(() => document.getElementById('milestone').classList.contains('leaving'),{},{timeout:6000});
  await toast.waitForFunction(() => !colonyDiagnostics().milestone.showing,{},{timeout:6000});
  await toast.reload();await toast.waitForFunction(() => colonyDiagnostics().snapshot);
  await toast.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
  assert.equal(await toast.evaluate(() => colonyDiagnostics().milestone.showing),false);
  // A slow next role shows one dim line in compact only; idle text fades and the overlay drifts.
  const idle=await fixture(browser,null,true);idle.on('pageerror',e => errors.push(e.message));
  await idle.clock.install();await idle.goto(base+'?preview=1');await idle.waitForFunction(() => colonyDiagnostics().snapshot);
  assert.equal(await idle.locator('#next-eta').isVisible(),false);
  await idle.locator('#plus').click();await idle.locator('[data-item="unit8"] .buy').click();await idle.locator('#close').click();
  await idle.clock.runFor(1000);
  assert.equal(await idle.locator('#next-eta').textContent(),'Next Queen ~ 14m');assert.equal(await idle.locator('#next-eta').isVisible(),true);
  await idle.screenshot({path:path.join(screenshotDir,'next-goal.png')});
  await idle.locator('#plus').click();assert.equal(await idle.locator('#next-eta').isVisible(),false);await idle.locator('#close').click();
  assert.equal(await idle.evaluate(() => colonyDiagnostics().dimmed),false);
  await idle.clock.runFor(125000);
  assert.equal(await idle.evaluate(() => colonyDiagnostics().dimmed),true);
  assert.equal(await idle.locator('#resources').evaluate(e => getComputedStyle(e).transitionDuration),'3s');
  await idle.waitForTimeout(3500);assert.equal(await idle.locator('#census').evaluate(e => getComputedStyle(e).opacity),'0.35');
  await idle.screenshot({path:path.join(screenshotDir,'faded.png')});
  await idle.clock.runFor(60000);
  const shifted=await idle.locator('#colony').evaluate(e => e.style.transform);
  assert.match(shifted,/^translate\(-?(?:1[0-2]|[0-9])px, -?(?:1[0-2]|[0-9])px\)$/);
  await idle.keyboard.press('9');
  assert.equal(await idle.evaluate(() => colonyDiagnostics().dimmed),false);assert.equal(await idle.locator('#census').evaluate(e => getComputedStyle(e).opacity),'1');
  await idle.keyboard.press('9');await idle.locator('#plus').click();assert.equal(await idle.locator('#colony').evaluate(e => e.style.transform),'');
  await idle.close();
  // Chance events run on visible time only, with an injected random source, clock and a
  // one-second minute so the guest spacing plays out quickly.
  const guests=await fixture(browser,() => {window.__hour=14;window.RoachMechanicsOptions={random:() => 0.01,hour:() => window.__hour,minute:1000};});
  guests.on('pageerror',e => errors.push(e.message));
  await guests.route('**/habitat.js',async route => {
   const response=await route.fetch();
   route.fulfill({response,body:(await response.text())+';RoachCritters.visitors=["monarch-butterfly","ladybug","stag-beetle","firefly"];RoachHabitat.critterCanvas=function(slug,px){var c=document.createElement("canvas");c.width=c.height=px;var x=c.getContext("2d"),h=slug.length*40%360;x.fillStyle="hsl("+h+",60%,55%)";x.beginPath();x.ellipse(px*.45,px*.5,px*.3,px*.18,0,0,7);x.fill();x.fillStyle="#2a2118";x.beginPath();x.arc(px*.8,px*.5,px*.1,0,7);x.fill();return c;};'});
  });
  await guests.clock.install();await guests.goto(base+'?preview=1');await guests.waitForFunction(() => colonyDiagnostics().snapshot);
  const red=() => guests.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
  const state=() => guests.evaluate(() => {var d=colonyDiagnostics();return {m:d.mechanics,h:d.habitat.guests,entities:d.habitat.entities,toast:document.getElementById('milestone').hidden?'':document.querySelector('#milestone strong').textContent+' | '+document.querySelector('#milestone span').textContent,message:document.getElementById('message').textContent,rewards:(window.__rewards||[]).slice(),night:!document.getElementById('night-shift').hidden};});
  await guests.clock.runFor(4000);
  let seen=await state();
  assert.equal(seen.m.visitor,'monarch-butterfly');assert.equal(seen.h.visitor,'monarch-butterfly');
  assert.ok(seen.entities<=64);
  // Red's Catch chip names the current target in place of the population line, and only while there is one.
  const chip=() => guests.evaluate(() => [document.getElementById('red-cue').hidden?'':document.getElementById('red-cue').textContent,document.getElementById('stage').hidden,!!document.querySelector('#red-cue canvas.red-glyph')]);
  assert.deepEqual(await chip(),['Catch monarch butterfly',true,true]);
  await red();seen=await state();
  assert.deepEqual(await chip(),['',true,true],'nothing catchable, no chip');
  assert.equal(seen.toast,'New visitor | Monarch butterfly · +600 crumbs');assert.equal(seen.h.visitor,'');
  assert.deepEqual(seen.rewards,[{type:'reward',resource:'meat',seconds:60}]);
  assert.equal(await guests.evaluate(() => localStorage.getItem('phil_roach_colony_ui_visitors_v1')),'{"monarch-butterfly":1}');
  await red();assert.match((await state()).message,/forage completed/,'with nothing on screen Red forages');
  // At ten minutes the golden roach and another visitor are both out; Red takes the golden one first.
  await guests.clock.runFor(7000);seen=await state();
  assert.equal(seen.m.golden,true);assert.equal(seen.h.golden,true);assert.equal(seen.m.visitor,'monarch-butterfly');
  assert.equal((await chip())[0],'Catch golden roach','the chip names what Red takes first');
  const cue=await guests.evaluate(() => colonyDiagnostics().habitat.redCue);
  assert.ok(cue&&cue[2]===32&&cue[3]===16,'one Red capsule is drawn on the habitat');
  await red();seen=await state();
  assert.equal((await chip())[0],'Catch monarch butterfly');
  assert.equal(seen.toast,'Golden roach caught | +3K crumbs, +1.2K hatchlings.');
  assert.deepEqual(seen.rewards.slice(1),[{type:'reward',resource:'meat',seconds:300},{type:'reward',resource:'larva',seconds:120}]);
  assert.equal(seen.h.golden,false);assert.equal(seen.m.visitor,'monarch-butterfly');
  await red();seen=await state();
  assert.match(seen.message,/Spotted a monarch butterfly again\. \+250 crumbs\./);
  assert.equal(await guests.evaluate(() => localStorage.getItem('phil_roach_colony_ui_visitors_v1')),'{"monarch-butterfly":2}');
  assert.equal(await guests.evaluate(() => localStorage.getItem('phil_roach_colony_ui_catches_v1')),'{"golden":1,"intruders":0}');
  // Guest achievements join the toast queue behind the catches and show at most once. Here the
  // queue is full of new roles, so the golden catch's toast bumps Guest book out of the four places.
  const toasts=[];
  for (let i=0;i<60;i++) {await guests.clock.runFor(1000);const toast=(await state()).toast;if (toast&&toast!==toasts[toasts.length-1]) toasts.push(toast);}
  assert.deepEqual(toasts.filter(t => /^Achievement earned/.test(t)),['Achievement earned | Heart of gold'],toasts.join('; '));
  const seenKeys=Object.keys(JSON.parse(await guests.evaluate(() => localStorage.getItem('phil_roach_colony_ui_milestones_v1'))));
  assert.ok(['achievement:colony:golden1','achievement:colony:guests1'].every(k => seenKeys.includes(k)),'earned guest achievements are remembered so they never toast again');
  // Hidden time spawns nothing and pays nothing, and every guest leaves.
  await guests.clock.runFor(5000);
  const hiddenFrom=await state();
  await guests.evaluate(() => {Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await guests.clock.runFor(60000);
  await guests.evaluate(() => {Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  seen=await state();
  assert.ok(seen.m.elapsed-hiddenFrom.m.elapsed<=1000,'hidden time is not play');assert.equal(seen.rewards.length,hiddenFrom.rewards.length);
  assert.equal(seen.m.golden,false);assert.equal(seen.h.intruder,'');
  // The night shift starts at 22:00 local time: marker, toast once, and a small bonus every two visible minutes.
  await guests.evaluate(() => {window.__hour=23;});
  await guests.clock.runFor(121000);seen=await state();
  assert.equal(seen.night,true);assert.equal(seen.h.night,true);
  assert.deepEqual(seen.rewards.slice(hiddenFrom.rewards.length).filter(r => r.seconds===12),[{type:'reward',resource:'meat',seconds:12}]);
  assert.ok(Object.keys(JSON.parse(await guests.evaluate(() => localStorage.getItem('phil_roach_colony_ui_milestones_v1')))).some(k => /^night:/.test(k)));
  // A purchase brings territory; an intruder follows within thirty visible minutes, then retreats with a territory bonus.
  await guests.locator('#plus').click();await guests.locator('[data-item="unit8"] .buy').click();await guests.locator('#close').click();
  await guests.evaluate(() => {window.__hour=14;});
  let chased=false;
  for (let i=0;i<20&&!chased;i++) {await guests.clock.runFor(2000);seen=await state();chased=!!seen.h.intruder;}
  assert.ok(chased,'an intruder arrives once territory exists');
  assert.ok(seen.entities<=64);
  let cleared=false;
  for (let i=0;i<40&&!cleared;i++) {
    await guests.clock.runFor(500);seen=await state();
    cleared=!seen.h.intruder && seen.rewards.length && seen.rewards[seen.rewards.length-1].resource==='territory';
  }
  assert.ok(cleared,'the intruder leaves and the colony is paid territory');
  // The Visitors page under More: found ones with names, the rest as silhouettes.
  await guests.locator('#plus').click();await guests.locator('[data-view="more"]').click();await guests.locator('#show-visitors').click();
  assert.equal(await guests.locator('#visitors .visitor').count(),4);assert.equal(await guests.locator('#visitors .visitor.unfound').count(),3);
  assert.match(await guests.locator('#page-label').textContent(),/1 \/ 4 found$/);
  assert.equal(await guests.locator('#visitors .visitor span').first().textContent(),'Monarch butterfly');
  assert.ok(await guests.locator('#menu').evaluate(e => e.scrollHeight<=e.clientHeight));
  // The same Achievements list carries the guest goals with their progress.
  await guests.locator('[data-view="more"]').click();await guests.locator('#show-achievements').click();
  const rows={};
  for (let p=0;p<5;p++) {
   for (const row of await guests.locator('#achievements article').evaluateAll(e => e.map(n => [n.querySelector('strong').textContent,n.querySelector('span').textContent]))) rows[row[0]]=row[1];
   if (await guests.locator('#next').isDisabled()) break;
   await guests.locator('#next').click();
  }
  assert.deepEqual([rows['Guest book'],rows['Common ground'],rows['Full house'],rows['Heart of gold'],rows['Gold standard'],rows['Not in my nest'],rows['Hold the perimeter']],['EARNED','1 / 3 common visitors','1 / 4 visitors','EARNED','1 / 10 golden roaches','EARNED','EARNED']);
  assert.equal(rows['Pest friends'],undefined,'a pool of four cannot reach ten');
  assert.equal(await guests.evaluate(() => JSON.parse(localStorage.getItem('phil_roach_colony_ui_catches_v1')).intruders>=1),true);
  await guests.close();
  // Habitat events, with the golden roach caught as it shows: a snack (roll 0.1) needs no Red and pays once hauled
  // home; an egg case (roll 0.5) and a molting roach (roll 0.9) take Red's chip ahead of a visitor.
  for (const [roll,kind,label,toast,reward] of [[0.1,'snack','Catch monarch butterfly',/^Snack hauled home \| The foragers carried off a cereal ring\. \+900 crumbs\.$/,{type:'reward',resource:'meat',seconds:90}],[0.5,'egg','Hatch egg case',/^Egg case hatched \| \+1\.2K hatchlings\.$/,{type:'reward',resource:'larva',seconds:120}],[0.9,'molt','Catch molting roach',/^Molting roach caught \| Fresh-shelled, it joins the foragers: \+450 crumbs \(45 seconds of crumbs\)\.$/,{type:'reward',resource:'meat',seconds:45}]]) {
   const page=await fixture(browser,new Function('window.RoachMechanicsOptions={random:() => '+roll+',hour:() => 14,minute:1000};'));
   page.on('pageerror',e => errors.push(e.message));
   await page.route('**/habitat.js',async route => {const response=await route.fetch();route.fulfill({response,body:(await response.text())+';RoachCritters.visitors=["monarch-butterfly"];'});});
   await page.clock.install();await page.goto(base+'?preview=1');await page.waitForFunction(() => colonyDiagnostics().snapshot);
   const look=() => page.evaluate(() => {var d=colonyDiagnostics();return {target:d.mechanics.chance,visitor:d.mechanics.visitor,golden:d.mechanics.golden,habitat:d.habitat.chance.kind,chip:document.getElementById('red-cue').hidden?'':document.getElementById('red-cue').textContent,toast:document.getElementById('milestone').hidden?'':document.querySelector('#milestone strong').textContent+' | '+document.querySelector('#milestone span').textContent,rewards:(window.__rewards||[]).slice()};});
   let seen;
   for (let i=0;i<40;i++) {await page.clock.runFor(500);seen=await look();if (seen.golden) await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));if (seen.target) break;}
   assert.equal(seen.target,kind);assert.equal(seen.habitat,kind,'the habitat shows it');
   assert.ok(seen.visitor,'a visitor is out as well');
   assert.equal(seen.chip,label,'the chip names what Red takes first');
   const cue=await page.evaluate(() => [colonyDiagnostics().habitat.redCue,colonyDiagnostics().habitat.chance.at]);
   if (kind!=='snack') assert.ok(cue[0]&&Math.abs(cue[0][0]+16-cue[1][0])<=1,'the habitat cue sits over it');
   const before=seen.rewards.length;
   if (kind==='snack') {
    await page.clock.runFor(31000);seen=await look();
    assert.equal(seen.habitat,'','the snack is home');
   } else {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:403,bubbles:true})));
    await page.clock.runFor(300);seen=await look();
    assert.equal(seen.chip,'Catch monarch butterfly','the visitor takes the chip next');
   }
   // The toast waits for the one showing (the golden roach's, or a first hatch) to finish.
   for (let i=0;i<40&&!toast.test(seen.toast);i++) {await page.clock.runFor(500);seen=await look();}
   assert.match(seen.toast,toast);
   assert.deepEqual(seen.rewards.slice(before),[reward]);
   assert.equal(seen.target,null);
   await page.close();
  }
  // Compact quick-buy: four picks from the live candidates, without duplicates, held steady
  // against brief changes of lead, and bought by keys 1-4 that arrive as remoteKey relaunches.
  const pick=(id,affordable,progress,kind,gain) => ({kind:kind||'unit',id,name:id,affordable,progress,gain:affordable?gain||'1':'0'});
  const quick=await fixture(browser,() => {
   window.__quickSlots=[[{kind:'unit',id:'unit8',name:'Queen',affordable:false,progress:0.4,gain:'0'}],[{kind:'unit',id:'unit0',name:'Forager',affordable:true,progress:1,gain:'1234'}],[{kind:'upgrade',id:'unit1',name:'Worker 1',affordable:true,progress:1,gain:'1'}],[{kind:'unit',id:'unit0',name:'Forager',affordable:true,progress:1,gain:'1234'},{kind:'unit',id:'swarm',name:'Swarmling',affordable:false,progress:0.5,gain:'0'}]];
   // Counts each moment as it starts (once per batch of class changes), so a pulse or float that plays twice is caught.
   window.__moments={};
   document.addEventListener('DOMContentLoaded',() => new MutationObserver(list => {var done=[];list.forEach(m => {var name=(m.target.className.baseVal===undefined?m.target.className:'').match(/\b(ready|rise|keylit|bump|note)-[ab]\b/);if (!name||(m.oldValue||'').indexOf(name[0])>=0||done.some(d => d[0]===m.target&&d[1]===name[0])) return;done.push([m.target,name[0]]);window.__moments[name[1]]=(window.__moments[name[1]]||0)+1;});}).observe(document.body,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['class']}));
  },true);
  quick.on('pageerror',e => errors.push(e.message));
  await quick.clock.install();await quick.goto(base+'?preview=1');await quick.waitForFunction(() => colonyDiagnostics().snapshot);
  const picks=() => quick.evaluate(() => colonyDiagnostics().quickPicks.map(p => p&&p.id));
  const moments=() => quick.evaluate(() => Object.assign({},window.__moments));
  // Waits for the next compact refresh that asked for quick candidates.
  const nextRefresh=async () => {const before=await quick.evaluate(() => window.__quickCalls);for (let i=0;i<8&&(await quick.evaluate(() => window.__quickCalls))===before;i++) await quick.clock.runFor(500);};
  const note=() => quick.locator('#quick-note').evaluate(e => e.hidden?null:[e.firstChild.textContent,e.lastChild.textContent,e.scrollWidth<=e.clientWidth+0.5]);
  await nextRefresh();
  assert.deepEqual(await picks(),['unit8','unit0','unit1','swarm'],'slot 4 skips the forager slot 2 already holds');
  // Affordable picks carry what a press buys; short ones show the menu's segmented bar instead, lit in fifths.
  assert.deepEqual(await quick.locator('#quick .quick-pick').evaluateAll(list => list.map(b => [b.querySelector('.keycap').textContent,b.classList.contains('short'),!!b.querySelector('.quick-icon').firstChild,b.getAttribute('aria-label'),b.querySelector('.quick-badge').hidden?null:b.querySelector('.quick-badge').textContent,b.querySelector('.quick-bar').hidden?null:b.querySelectorAll('.quick-bar i.on').length])),
   [['1',true,true,'1: Queen (saving up)',null,2],['2',false,true,'2: Forager, buys 1.23K','×1.23K',null],['3',false,true,'3: Worker 1, buys 1','×1',null],['4',true,true,'4: Swarmling (saving up)',null,2]]);
  assert.equal(await quick.locator('#quick').isVisible(),true);
  assert.ok(await quick.locator('#quick').evaluate(e => {var r=e.getBoundingClientRect(),p=document.getElementById('colony').getBoundingClientRect(),plus=document.getElementById('plus').getBoundingClientRect();return r.left>=p.left&&r.right<=plus.left&&r.height<=56;}),'the strip fits the compact footprint, clear of the + button');
  // The badge and bar stay inside their pick, under the icon, and the badge never covers the keycap.
  assert.ok(await quick.locator('#quick .quick-pick').evaluateAll(list => list.every(b => {var r=b.getBoundingClientRect(),key=b.querySelector('.keycap').getBoundingClientRect(),icon=b.querySelector('.quick-icon').getBoundingClientRect();return Array.prototype.every.call(b.querySelectorAll('.quick-badge:not([hidden]),.quick-bar:not([hidden])'),c => {var q=c.getBoundingClientRect();return q.left>=r.left-0.5&&q.right<=r.right+0.5&&q.bottom<=r.bottom+0.5&&q.top>=icon.top+icon.height/2&&(q.top>=key.bottom||q.left>=key.right);});})));
  // Legible from the couch: the art at its 48 px on-screen size, 18 px keycaps and a 15 px bold badge that never wraps.
  assert.deepEqual(await quick.locator('#quick .quick-pick').nth(1).evaluate(b => [b.querySelector('.quick-icon').getBoundingClientRect().height,getComputedStyle(b.querySelector('.keycap')).fontSize,getComputedStyle(b.querySelector('.quick-badge')).fontSize,b.querySelector('.quick-badge').getBoundingClientRect().height<=17]),[48,'18px','15px',true]);
  await quick.screenshot({path:path.join(screenshotDir,'quick-strip.png'),clip:{x:1340,y:880,width:580,height:200}});
  assert.equal(await note(),null,'the first showing names nothing');
  // A new leader must hold its lead for four refreshes before it replaces a pick; then its name shows briefly.
  await quick.evaluate(pick => {__quickSlots[1]=[pick,__quickSlots[1][0]];__quickSlots[3]=[__quickSlots[3][1]];},pick('unit6',true,1,'unit','24'));
  const held=[];
  for (let i=0;i<4;i++) {await nextRefresh();held.push((await picks())[1]);if (i<3) assert.equal(await note(),null,'a held pick names nothing');}
  assert.deepEqual(held,['unit0','unit0','unit0','unit6']);
  assert.deepEqual(await note(),['2','unit6',true],'the new pick is named beside its key');
  assert.match(await quick.locator('#quick-note').getAttribute('class'),/\bnote-[ab]\b/);
  await quick.screenshot({path:path.join(screenshotDir,'quick-name.png'),clip:{x:1340,y:880,width:580,height:200}});
  await nextRefresh();await nextRefresh();await nextRefresh();
  assert.equal(await note(),null,'the name fades after about two seconds');
  // A lead that changes every refresh never displaces the held pick.
  await quick.evaluate(() => {var turn=0,a={kind:'unit',id:'unit2',name:'unit2',affordable:true,progress:1,gain:'5'},b={kind:'unit',id:'unit4',name:'unit4',affordable:true,progress:1,gain:'5'},c={kind:'unit',id:'unit6',name:'unit6',affordable:true,progress:1,gain:'24'},slots=__quickSlots;window.__quickSlots=function(){turn++;return [slots[0],[turn%2?a:b,c],slots[2],slots[3]];};});
  for (let i=0;i<8;i++) await nextRefresh();
  assert.equal((await picks())[1],'unit6','an alternating lead does not flicker the slot');
  // A pick that is no longer a candidate is replaced at once.
  await quick.evaluate(() => {window.__quickSlots=[[{kind:'unit',id:'unit8',name:'Queen',affordable:true,progress:1,gain:'3'}],[{kind:'unit',id:'unit4',name:'unit4',affordable:true,progress:1,gain:'24'}],[{kind:'upgrade',id:'unit1',name:'Worker 1',affordable:true,progress:1,gain:'1'}],[{kind:'unit',id:'swarm',name:'Swarmling',affordable:false,progress:0.6,gain:'0'}]];});
  await nextRefresh();
  assert.deepEqual(await picks(),['unit8','unit4','unit1','swarm']);
  assert.equal(await quick.locator('#quick .quick-pick').first().evaluate(b => b.classList.contains('short')),false,'affordability follows the live state');
  assert.equal((await moments()).ready,1,'slot 1 pulses once as it becomes affordable');
  await nextRefresh();await nextRefresh();
  assert.equal((await moments()).ready,1,'the pulse does not repeat while it stays affordable');
  // Keys 1-4 reach the collapsed colony as remoteKey relaunch parameters: a roach slot buys Max, an upgrade one level.
  const acts=() => quick.evaluate(() => (window.__acts||[]).filter(a => a.type!=='reward').map(a => a.type+':'+a.id+':'+a.quantity));
  const relaunchKey=code => quick.evaluate(code => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{remoteKey:code}})),code);
  await quick.clock.runFor(61000);
  assert.equal(await quick.evaluate(() => colonyDiagnostics().dimmed),true,'idle text dims');
  await relaunchKey(50);
  // The float, keycap light and icon bump play at once, on the compositor; caught mid-climb for review.
  const bought=await quick.locator('#quick .quick-pick').nth(1).evaluate(b => [/\brise-[ab]\b/.test(b.querySelector('.quick-rise').getAttribute('class')),/\bkeylit-[ab]\b/.test(b.querySelector('.keycap').className),/\bbump-[ab]\b/.test(b.querySelector('.quick-icon').className),b.querySelector('.quick-rise').width,b.querySelector('.quick-rise').getAnimations().map(a => [a.animationName,a.effect.getTiming().duration])]);
  assert.deepEqual(bought.slice(0,4),[true,true,true,4*3+1],'+99 floats in pixel digits as the keycap lights and the icon bumps');
  assert.deepEqual(bought[4].map(a => a[1]),[500],'the float lasts half a second');
  await quick.waitForTimeout(150);
  await quick.screenshot({path:path.join(screenshotDir,'quick-float.png'),clip:{x:1340,y:860,width:580,height:220}});
  assert.equal(await quick.evaluate(() => colonyDiagnostics().dimmed),false,'a quick-buy press wakes dimmed text');
  await relaunchKey(51);
  assert.deepEqual((await acts()).slice(-2),['unit:unit4:max','upgrade:unit1:1']);
  assert.match(await quick.locator('#local-hint').textContent(),/^(Hatched|Upgraded) /,'a quick purchase gets the usual brief toast');
  assert.equal(await quick.evaluate(() => colonyDiagnostics().compact),true,'quick-buy never opens the menu');
  await relaunchKey(404);assert.deepEqual((await acts()).slice(-1),['upgrade:unit1:1'],'Green repeats the quick purchase with its amount');
  await relaunchKey(50);await relaunchKey(404);assert.deepEqual((await acts()).slice(-2),['unit:unit4:max','unit:unit4:max'],'Green repeats a roach slot as Max');
  // A short pick buys nothing; its key shows how long it will take, then the line fades.
  let count=(await acts()).length;
  await relaunchKey(52);
  assert.equal((await acts()).length,count,'a short pick is not bought');
  assert.deepEqual(await note(),['4','Ready in 12s',true]);
  assert.match(await quick.locator('#quick .quick-pick').nth(3).getAttribute('class'),/\bnudge-[ab]\b/);
  await quick.screenshot({path:path.join(screenshotDir,'quick-eta.png'),clip:{x:1340,y:880,width:580,height:200}});
  await quick.clock.runFor(1000);
  assert.deepEqual(await note(),['4','Ready in 12s',true],'the ETA holds for a moment');
  await nextRefresh();await nextRefresh();
  assert.equal(await note(),null,'the ETA fades after about two seconds');
  await quick.evaluate(() => {window.__eta={ready:false,label:''};});
  await relaunchKey(52);assert.deepEqual(await note(),['4','Not enough yet',true],'no production means no ETA');
  // A pick that became affordable since the last refresh is bought rather than timed.
  await quick.evaluate(() => {window.__eta={ready:true,label:''};});
  await relaunchKey(52);assert.deepEqual((await acts()).slice(-1),['unit:swarm:max']);
  await quick.evaluate(() => {delete window.__eta;});
  // The pulse plays once per transition: short again, then affordable again, pulses a second time.
  await quick.evaluate(() => {__quickSlots[3]=[{kind:'unit',id:'swarm',name:'Swarmling',affordable:true,progress:1,gain:'7'}];});await nextRefresh();
  assert.equal((await moments()).ready,2);
  // Returning from the menu, or from hiding, is quiet: no pulse or name for what changed meanwhile.
  await quick.evaluate(() => {__quickSlots[3]=[{kind:'unit',id:'swarm',name:'Swarmling',affordable:false,progress:0.6,gain:'0'}];});await nextRefresh();
  await quick.locator('#plus').click();
  await quick.evaluate(() => {__quickSlots[3]=[{kind:'unit',id:'swarm',name:'Swarmling',affordable:true,progress:1,gain:'7'}];});
  await quick.locator('#close').click();await nextRefresh();await nextRefresh();
  assert.equal((await moments()).ready,2,'reopening is not a transition');
  // Hiding mid-moment drops the float, light, bump and note, and none of them plays again on return.
  await relaunchKey(50);await relaunchKey(52);
  const playedBefore=await moments();
  await relaunchKey(406);
  await quick.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{remoteToggle:true}})));
  await nextRefresh();await quick.waitForTimeout(700);
  assert.deepEqual(await moments(),playedBefore,'nothing replays after hiding');
  assert.equal(await note(),null);
  assert.ok(await quick.locator('#quick').evaluate(e => !/-[ab]\b/.test(Array.prototype.map.call(e.querySelectorAll('*'),c => typeof c.className === 'string' ? c.className : c.getAttribute('class')).join(' '))),'no moment class survives hiding');
  // Critters only shows no picks, so its keys buy nothing.
  count=(await acts()).length;
  await quick.evaluate(() => document.getElementById('critters-only').click());
  await relaunchKey(49);await relaunchKey(52);assert.equal((await acts()).length,count);assert.equal(await quick.locator('#quick').isVisible(),false);
  assert.equal(await note(),null,'critters only shows no ETA');
  await quick.keyboard.press('c');
  // In the menu, 1-4 still buy the visible rows with the menu's quantity.
  await quick.locator('#plus').click();
  const firstRow=await quick.locator('#items article').first().getAttribute('data-item');
  await quick.keyboard.press('1');assert.deepEqual((await acts()).slice(-1),[(await quick.locator('#items article').first().getAttribute('data-kind'))+':'+firstRow+':1']);
  assert.equal(await quick.locator('#quick').isVisible(),false,'the strip belongs to the collapsed view');
  await quick.locator('#close').click();
  // With no candidates the strip disappears and a key says so.
  await quick.evaluate(() => {window.__quickSlots=[[],[],[],[]];});await nextRefresh();
  assert.equal(await quick.locator('#quick').isVisible(),false);
  await relaunchKey(52);assert.match(await quick.locator('#message').textContent(),/Nothing to buy on 4 yet/);
  await quick.close();
  // Standalone terrarium mode pins all unlocked resources and up to six castes to a frameless top bar,
  // widens the menu to 720 px with six rows per page, and drops the opaque 9-slice fill.
  const terrarium=await fixture(browser,null,true);terrarium.on('pageerror',e => errors.push(e.message));
  await terrarium.goto(base+'?standalone=1');await terrarium.waitForFunction(() => colonyDiagnostics().snapshot);
  assert.equal(await terrarium.evaluate(() => colonyDiagnostics().standalone && document.body.classList.contains('standalone')),true);
  assert.equal(await terrarium.locator('#resources .resource:visible').count(),5,'standalone shows every unlocked resource in compact');
  const topHud=await terrarium.evaluate(() => ({res:document.getElementById('resources').getBoundingClientRect().top,cen:document.getElementById('census').getBoundingClientRect().top}));
  assert.ok(topHud.res<60 && topHud.cen<60,'resources and census sit in the top bar');
  await terrarium.screenshot({path:path.join(screenshotDir,'standalone-compact.png')});
  await terrarium.locator('#plus').click();
  assert.equal(await terrarium.locator('#items article').count(),5,'standalone menu fits all five mock units on one six-row page');
  assert.equal(await terrarium.locator('#pagination').isHidden(),true,'five units need no second page in standalone');
  const deck=await terrarium.evaluate(() => {var c=document.getElementById('colony'),m=document.getElementById('menu');return {width:c.getBoundingClientRect().width,borderImage:getComputedStyle(m).borderImageSource};});
  assert.equal(deck.width,720);assert.equal(deck.borderImage,'none','standalone menu drops the opaque 9-slice fill');
  await terrarium.screenshot({path:path.join(screenshotDir,'standalone-menu.png')});
  await terrarium.locator('[data-view="more"]').click();await terrarium.locator('#standalone-view').click();
  await terrarium.locator('[data-view="units"]').click();
  assert.equal(await terrarium.locator('#items article').count(),4,'returning to TV overlay restores four-row pages');
  // Standalone mode is never sticky on reload without ?standalone=1, and 8 / Escape toggle Watch TV cleanly.
  await terrarium.locator('[data-view="more"]').click();await terrarium.locator('#standalone-view').click();
  assert.equal(await terrarium.evaluate(() => colonyDiagnostics().standalone),true);
  await terrarium.goto(base+'?preview=1');await terrarium.waitForFunction(() => colonyDiagnostics().snapshot);
  assert.equal(await terrarium.evaluate(() => colonyDiagnostics().standalone),false,'opening without ?standalone=1 always starts in TV overlay mode');
  await terrarium.evaluate(() => document.getElementById('standalone-view').click());
  assert.equal(await terrarium.evaluate(() => colonyDiagnostics().standalone),true,'More > Standalone view enters standalone');
  const blue=() => terrarium.evaluate(() => document.dispatchEvent(new CustomEvent('webOSRelaunch',{detail:{remoteToggle:true,compact:true,corner:'bottom-right',autoCloseSeconds:0}})));
  await blue();assert.equal(await terrarium.evaluate(() => colonyDiagnostics().closed),true,'Blue hides a standalone colony');
  await blue();
  assert.deepEqual(await terrarium.evaluate(() => {const d=colonyDiagnostics();return {closed:d.closed,standalone:d.standalone,compact:d.compact,body:document.body.classList.contains('standalone')};}),{closed:false,standalone:false,compact:true,body:false},'Blue always reopens the TV overlay, never standalone');
  await terrarium.keyboard.press('8');
  assert.equal(await terrarium.evaluate(() => colonyDiagnostics().watchMode),true);
  await terrarium.keyboard.press('Escape');
  assert.equal(await terrarium.evaluate(() => colonyDiagnostics().watchMode),false,'Back/Escape exits Watch TV to full compact HUD');
  await terrarium.close();
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: bounded transparent plus/popovers, unit census, purchase/details, upgrade briefs, remote spatial navigation and paging, category/quantity navigation, real save/export/import/reload, evolution confirmation, contextual resources, escaped labels, TV launch/relaunch bounds, storage denial and chance events (Red priority, Catch chip, rewards, visitor log, intruders, night shift, hidden time, snack drop, egg case and molting roach) and compact quick-buy (picks, hysteresis, remote keys 1-4, Max and one-level amounts, badges, fill bars, purchase float, ready pulse, name and ETA notes, nothing replayed after hiding).');
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
