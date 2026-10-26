'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../app/theme');
const E=require('../app/engine');
const data=require('../app/swarm/data.generated.json');

function rows(table) { const seen=new Set(); return data[table].elements.filter(row=>row.name && !seen.has(row.name) && seen.add(row.name)); }
// The adapter hides achievements that only the original website can award.
const WEBSITE=['changelog','import','clickme','konami','debug','publictest1','therightquestion'];
const units=rows('unittypes'), upgrades=rows('upgrades'), achievements=rows('achievements').filter(entry=>!WEBSITE.includes(entry.name));
// Disabled bookkeeping units and the purchase-only crystal currency never reach the screen.
const playerUnits=units.filter(unit=>!unit.disabled && unit.name !== 'crystal');
const playerUpgrades=upgrades.filter(upgrade=>upgrade.name !== 'mutatehidden');
const plain=value=>String(value || '').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
const LEAK=/\b(meat|larvae?|drones?|swarms?|hives?|nests?|queens?|arachnomorphs?|culicimorphs?|chilopodomorphs?|lepidoptera|swarmlings?|stingers?|devourers?|goons?|nightbugs?|cocoons?|hatcher(?:y|ies)|spells?|expansions?|swarmwarps?)\b/i;
const leaks=value=>LEAK.test(value.replace(/\b[Nn]est queens?\b/g,''));

test('every visible unit and upgrade has a themed name drawn from the pinned source labels',()=>{
  playerUnits.forEach(unit=>{
    const one=T.plural(unit.name,unit.label,1), many=T.plural(unit.name,unit.label);
    assert.notEqual(one,unit.name,unit.name);
    assert.match(one,/^[A-Z]/,unit.name);
    if (!/^mutant/.test(unit.name)) assert.ok(one.length<=16 && many.length<=18,unit.name+' fits a census label');
    // Mass nouns such as "meat" share one source word for both numbers.
    if (unit.plural === unit.label) assert.ok([one,many].includes(T.text(unit.label)),unit.name);
    else assert.equal(T.text(unit.label),one,'source label for '+unit.name);
    if (unit.plural !== unit.label) assert.equal(T.text(unit.plural),many,'source plural for '+unit.name);
  });
  playerUpgrades.forEach(upgrade=>{
    assert.notEqual(T.label(upgrade.name),upgrade.name,upgrade.name);
    assert.equal(T.upgradeLabel(upgrade.name,upgrade.label),T.label(upgrade.name));
    assert.equal(T.text(upgrade.label),T.label(upgrade.name),'source label for '+upgrade.name);
    assert.ok(!leaks(T.label(upgrade.name)),upgrade.name);
  });
});

test('main chain and territory names are unique so tiers never read alike',()=>{
  const names=playerUnits.map(unit=>T.plural(unit.name,unit.label,1));
  assert.equal(new Set(names).size,names.length);
  assert.deepEqual(['drone','queen','nest','greaterqueen','hive','hivequeen','empress'].map(id=>T.label(id)),['Forager roach','Nest queen','Brood mother','Colony matriarch','Grand brooder','Grand matriarch','Roach empress']);
  assert.deepEqual(['prophet','goddess','pantheon','pantheon2','pantheon4','pantheon5','overmind','overmind6'].map(id=>T.label(id)),['Neuroprophet','Elder sage','Pantheon','Pantheon II','Pantheon IV','Council mind','Overmind','Overmind VI']);
  assert.equal(T.label('roach'),'Hissing roach');
  assert.equal(T.label('nexus'),'Nexus');assert.equal(T.label('nexus1'),'Build a nexus');
  assert.equal(T.label('meat'),'Crumbs');assert.equal(T.label('larva'),'Hatchlings');
});

test('source descriptions, achievements and adapter copy no longer leak the alien swarm',()=>{
  const game=new E.Game({now:1e6}),state=game.exportState(1e6);
  playerUnits.forEach(unit=>{state.state.unittypes[unit.name]='1000000';});
  Object.assign(state.state.unittypes,{meat:'1e40',larva:'1e30',territory:'1e30',energy:'1e6',nexus:'5',premutagen:'1e5',mutagen:'1e5',ascension:'1'});
  game.importState(state,1e6);
  const snapshot=game.snapshot(1e6,{includeAchievements:true});
  const strings=[snapshot.nextGoal,snapshot.prestige.description,snapshot.prestige.reset,snapshot.respec.description];
  snapshot.items.forEach(item=>strings.push(item.name,item.description,item.cost,item.batchCost,'Purchased '+item.name+'.'));
  snapshot.achievements.forEach(entry=>strings.push(entry.description));
  playerUnits.concat(playerUpgrades).forEach(row=>strings.push(plain(row.description)));
  achievements.forEach(entry=>strings.push(entry.description.replace('$REQUIRED','100')));
  strings.forEach(value=>{
    const themed=T.text(value);
    assert.ok(!leaks(themed),themed);
    assert.equal(T.text(themed),themed,'text() is idempotent: '+themed);
  });
});

test('achievement titles keep their puns unless the rename broke them',()=>{
  achievements.forEach(entry=>{
    const themed=T.achievementLabel(entry.name,entry.label);
    assert.match(themed,/^["A-Z0-9]/,entry.name);
    // Until the UI calls achievementLabel, titles pass through text(); both paths must agree.
    if (entry.label !== 'hive mind') assert.equal(T.text(entry.label).toLowerCase(),themed.toLowerCase(),entry.name);
  });
  assert.equal(T.achievementLabel('nest1','I wanna be the very nest'),'I wanna be the very nest');
  assert.equal(T.achievementLabel('drone1','a good start'),'A good start');
  assert.equal(T.text('Build your first nest'),'Raise your first brood mother');
  assert.equal(T.text('Build 5 nexus'),'Build 5 nexuses');
  assert.equal(T.text('Hatch 1 roaches'),'Hatch 1 hissing roach');
});

test('text() replaces whole words only and keeps capitalisation and number agreement',()=>{
  assert.equal(T.text('Queensland honest nesting beehive dronesque meatball larval'),'Queensland honest nesting beehive dronesque meatball larval');
  assert.equal(T.text('Queens rule. queens rule.'),'Nest queens rule. nest queens rule.');
  assert.equal(T.text('Each queen costs 810 meat + 100 drone + 1 larva.'),'Each nest queen costs 810 crumbs + 100 forager roaches + 1 hatchling.');
  assert.equal(T.text('Produces 1 meat/s each, 1.5K drone/s each, 1.00 nest/s each.'),'Produces 1 crumb/s each, 1.5K forager roaches/s each, 1.00 brood mother/s each.');
  assert.equal(T.text('Next use: +5 larva; 1e+12 overmind II'),'Next use: +5 hatchlings; 1e+12 overminds II');
  assert.equal(T.text('Overmind IIIs produce more overmind IIs.'),'Overminds III produce more overminds II.');
  assert.equal(T.text('Strengthens Larvae Rush, Meat Rush and Swarmwarp.'),'Strengthens Hatchling rush, Crumb rush and Time warp.');
  assert.equal(T.text('mutagen (inactive)'),'Pending mutagen');
  assert.equal(T.text('Purchased roach.'),'Purchased hissing roach.');
  assert.equal(T.text('Purchased twin queens.'),'Purchased twin nest queens.');
  assert.equal(T.text('Purchased construct nexus.'),'Purchased build a nexus.');
  assert.equal(T.text('300 roaches in all'),'300 roaches in all');
  assert.equal(T.text('Forager roach'),'Forager roach');
  assert.equal(T.text(''),'');assert.equal(T.text(undefined),'');
});

test('costText pluralises from the formatted amount',()=>{
  assert.equal(T.costText([{id:'meat',amount:'810'},{id:'drone',amount:'100'},{id:'larva',amount:'1'}]),'810 Crumbs + 100 Forager roaches + 1 Hatchling');
  assert.equal(T.costText([{id:'nexus',amount:'1.00'},{id:'queen',amount:'1K'},{id:'energy',amount:'0.5'}]),'1.00 Nexus + 1K Nest queens + 0.5 Energy');
  assert.equal(T.costText([{id:'overmind2',amount:'1e+12'},{id:'swarmling',amount:'1'}]),'1e+12 Overminds II + 1 Silverfish');
  assert.equal(T.costText([{id:'unknown',amount:'3',name:'larvae'}]),'3 Hatchlings');
  assert.equal(T.costText([]),'0');
});

test('existing callers keep their contract for unknown ids',()=>{
  assert.equal(T.label('unit8','Queen'),'Queen');
  assert.equal(T.label('mystery'),'mystery');
  assert.equal(T.plural('queen','queen',1),'Nest queen');assert.equal(T.plural('queen','queen','2'),'Nest queens');assert.equal(T.plural('queen','queen'),'Nest queens');
  assert.equal(T.source('drone','drone'),'drone');assert.equal(T.source('wasp','wasp'),'');assert.equal(T.source('mystery','x'),'');
  assert.equal(T.tabLabel('meat','meat'),'Roaches');assert.equal(T.tabLabel('unknown','Other'),'Other');
});

test('tutorial hints read as Roach Colony and point at its own menus',()=>{
  const at=(counts,upgrades)=>{const game=new E.Game({now:1e6}),state=game.exportState(1e6);Object.assign(state.state.unittypes,counts);Object.assign(state.state.upgrades,upgrades||{});state.opening={awake:true};game.importState(state,1e6);return game.snapshot(1e6,{includeItems:false,includeAchievements:false,includeHint:true}).hint;};
  const hints=[new E.Game({now:1e6}).snapshot(1e6,{includeHint:true}).hint,at({drone:'3'}),at({drone:'10'}),at({drone:'10',meat:'300'}),at({drone:'10'},{hatchery:'1'}),at({queen:'1'},{hatchery:'1'}),at({queen:'5'},{hatchery:'1'}),at({queen:'5',territory:'3'},{hatchery:'1'}),at({queen:'5',territory:'10'},{hatchery:'1'}),at({queen:'50'},{expansion:'2'}),at({queen:'50'},{expansion:'6'}),at({nexus:'1',energy:'5'},{expansion:'6',nexus1:'1'}),at({premutagen:'5'}),at({ascension:'1'}),at({ascension:'2'})];
  assert.equal(new Set(hints.map(entry=>entry.step)).size,15,'every step is covered');
  hints.forEach(entry=>{
    const themed=T.text(entry.text);
    assert.ok(!leaks(themed) && !/Swarm Simulator|larva-|'larvae'|mutagen tab/.test(themed),themed);
    assert.equal(T.text(themed),themed,'text() is idempotent: '+themed);
  });
  assert.equal(T.text(hints[4].text),'You lead a small brood of forager roaches. They long for a nest queen. You must sacrifice many forager roaches to hatch a nest queen, but once born, your nest queen will slowly hatch forager roaches without consuming crumbs or hatchlings.');
  assert.match(T.text(hints[0].text),/^Welcome to Roach Colony\. /);
  assert.equal(T.text(hints[3].text),'You have enough crumbs to upgrade your egg chamber. Find it under Upgrades, in the Brood tab.');
});

test('shared number formatting, log10 magnitude and cost progress helpers behave identically across TV and phone',()=>{
  assert.equal(T.short('1,234.5'),'1.23K');
  assert.equal(T.short('10.12M'),'10.1M');
  assert.equal(T.short('2.35e+70'),'2.35e70');
  assert.equal(T.whole('42.9'),'42');
  assert.equal(T.compact('9999'),'9999');
  assert.equal(T.compact('12345'),'12.3K');
  assert.equal(T.shortNumbers('Cost: 1,234.5 crumbs + 10.12M hatchlings'),'Cost: 1.23K crumbs + 10.1M hatchlings');
  assert.ok(Math.abs(T.magnitude('1K') - 3) < 1e-9);
  assert.ok(Math.abs(T.magnitude('1e+300') - 300) < 1e-9);
  assert.equal(T.magnitude('0'),-Infinity);
  assert.equal(T.magnitude('bad'),null);
  const progress=T.itemProgress([{have:'50',need:'100',rate:'10'},{have:'10',need:'10',rate:'1'}]);
  assert.ok(Math.abs(progress.pct - 0.5) < 1e-6);
  assert.ok(Math.abs(progress.eta - 5) < 1e-6);
  assert.equal(T.effectText({id:'drone',name:'drone',op:'×',stat:'prod',amount:'2'}),'×2 Forager roach output');
  assert.deepEqual(T.upgradeText('Makes foragers faster. Forager roach production multiplier: ×2.'),{brief:'Makes foragers faster.',effect:'Forager roach production multiplier: ×2'});
});

