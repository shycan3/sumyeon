'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','actor-ai','engine','campaign','character-engine','character-campaign','battle-practice'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);
const {CharacterCampaign:C,CharacterBattle:B,CharacterData:K,GameData:D}=ctx.window,copy=x=>JSON.parse(JSON.stringify(x));
function battle(){const c=new C.Campaign();c.start(7);c.enter(c.run.map[0][0].id);return c.battle;}
const b=battle(),medic=b.get('a3'),ranger=b.get('a2');
medic.x=200;medic.y=195;for(const a of b.alive(0)){a.hp=a.max-50;a.x=700;a.y=195;}medic.x=200;b.get('a0').x=330;b.get('a1').x=331;
const heal={key:'medic_circle'},he={...D.definition(heal),actor:medic.id,side:0};
assert.deepEqual(Array.from(b.spatialFriends(he),a=>a.id).sort(),['a0','a3']);
assert.equal(b.tacticalScore(heal,null),36*2*1.5/7);
b.get('a1').hp=1;assert.equal(b.tacticalScore(heal,null),36*2*1.5/7,'outside critical ally cannot inflate heal score');
b.observedResolve(he);assert.equal(b.get('a0').hp,b.get('a0').max-14);assert.equal(b.get('a1').hp,1);assert.equal(b.s.insights.rows.medic_circle.healed,72);
ranger.x=200;ranger.y=195;const enemies=b.alive(1);enemies.forEach((a,i)=>{a.x=350+i*80;a.y=195;});
const line={...D.definition({key:'ranger_line'}),actor:ranger.id,side:0,target:enemies[0].id};
assert.equal(b.areaTargets(line).length,enemies.length);enemies[1].y=225.1;assert(!b.areaTargets(line).includes(enemies[1]));enemies[1].y=225;assert(b.areaTargets(line).includes(enemies[1]));enemies[1].x=661;assert(!b.areaTargets(line).includes(enemies[1]));
line.spatialOrigin={x:200,y:195};line.spatialAim={x:350,y:195};enemies[0].y=300;assert(!b.areaTargets(line).includes(enemies[0]),'cast direction stays fixed when target moves');
const s=b.snapshot();s.events.push({...line,key:'ranger_line',at:1,length:460,width:60});assert(B.validSpatialEvents(s));s.events[0].width=61;assert(!B.validSpatialEvents(s));
const hitBattle=battle(),shooter=hitBattle.get('a2');shooter.x=200;shooter.y=195;const victims=hitBattle.alive(1);victims.forEach((a,i)=>{a.x=350+i*80;a.y=195;a.stance=1;});const impact={...D.definition({key:'ranger_line'}),actor:shooter.id,side:0,target:victims[0].id,at:0,spatialOrigin:{x:200,y:195},spatialAim:{x:350,y:195}},health=victims.map(a=>a.hp);hitBattle.observedResolve(impact);victims.forEach((a,i)=>assert.equal(health[i]-a.hp,33));hitBattle.s.guards[1]={n:1,until:2};const guarded=victims.map(a=>a.hp);hitBattle.observedResolve(impact);assert.deepEqual(victims.map(a=>a.hp),guarded,'one guard blocks the entire line');
const c=new C.Campaign();c.start(19);assert.equal(c.run.spatialRulesVersion,1);assert(K.rewardOptions(c.run).includes('medic_circle'));assert(K.rewardOptions(c.run).includes('ranger_line'));assert(c.run.pool.every(card=>!D.cards[card.key].spatial),'no spatial reward in starter');delete c.run.spatialRulesVersion;assert(!K.rewardOptions(c.run).includes('medic_circle'));C.validate(c.snapshot());
for(const key of ['medic_circle','ranger_line'])assert(D.cards[key].traits.length,'every spatial card has a trait');
for(let seed=1;seed<=24;seed++){const c=new C.Campaign();c.start(seed);const old=c.run.pool.find(card=>card.key==='heal'),card={...old,key:'medic_circle',source:'reward'},old2=c.run.pool.find(card=>card.key==='shot'),card2={...old2,key:'ranger_line',source:'reward'};Object.assign(old,card);Object.assign(old2,card2);c.enter(c.run.map[0][0].id);const b=c.battle;for(let i=0;i<10000&&!b.s.ended;i++)b.step(.02);assert(b.s.ended,'bounded spatial battle');assert(b.s.actors.every(a=>Number.isFinite(a.hp)&&Number.isFinite(a.x)));C.validate(c.snapshot());}
console.log('PASS: actual circle recipients, edge/length/width and fixed line direction, scoring and heal attribution, malformed spatial events, old reward pool, no free starter cards, traits, 24 bounded auto battles and save validation.');

