"use strict";
const fs=require('fs'),vm=require('vm'),assert=require('assert'),ctx=vm.createContext({window:{}});
for(const f of ['data.js','character-data.js','actor-ai.js','engine.js','campaign.js','character-engine.js','character-campaign.js','auto-lab-core.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx,{filename:f});
const {GameData:D,CharacterData:K,CharacterBattle:B,CharacterCampaign:C,AutoLab:L}=ctx.window,copy=x=>JSON.parse(JSON.stringify(x));
function fixture(build='base',scenario='focus',policy='attack'){const b=L.create(scenario,build,policy,1,37);b.s.ready=true;b.s.due=b.s.t;b.s.autoAt=b.s.t;b.s.enemyDue=9999;for(const a of b.s.actors){a.busy=0;a.cool=9999;a.shield=0;a.shieldUntil=0;if(a.side===1){a.hp=a.max=1000;a.armor=0;a.armorUntil=0;}}return b;}
function hand(b,keys){const deck=b.s.decks[0],pool=['draw','hand','discard','excluded'].flatMap(k=>deck[k]),ids=[];deck.hand=keys.map(key=>{const c=pool.find(c=>c.key===key&&!ids.includes(c.id));assert(c,'missing '+key);ids.push(c.id);return c;});deck.draw=pool.filter(c=>!ids.includes(c.id));deck.discard=[];deck.excluded=[];}
function decision(b){assert(b.policyAuto());return b.s.autoLast;}
function plan(b,key,target){const c=b.s.decks[0].hand.find(c=>c.key===key);return b.autoTraitPlan(c,target);}
function baseline(b){const x=new B({},b.snapshot());x.s.autoTraitVersion=0;return x;}
// Ranking must account for real utility, prep/expiry, each actual actor and taunt target.
{
 const b=fixture();hand(b,['shot','serin_dance']);b.s.traits.guardUntil=8;
 assert(plan(b,'shot','e0').reasons.includes('호위 반격 활용'));assert(plan(b,'serin_dance','e0').reasons.includes('호위 반격 활용'));
 b.get('e0').hp=1;assert.equal(plan(b,'shot','e0').factor,1,'overkill needs no boosted output');b.get('e0').hp=1000;b.s.traits.guardUntil=.1;assert(!plan(b,'serin_dance','e0').reasons.includes('호위 반격 활용'),'cast outlasts preparation');b.s.traits.guardUntil=8;b.s.guards[1]={n:1,until:2};assert.equal(plan(b,'shot','e0').factor,1,'public block denies buff value');
 b.s.guards[1]={n:0,until:0};b.s.traits.guardUntil=0;b.s.traits.mark={actor:'a1',target:'e0',until:8};assert(plan(b,'shot','e0').reasons.includes('추격 표식 연계'));assert(!plan(b,'serin_dance','e0').reasons.includes('추격 표식 연계'),'same actor cannot follow');b.s.taunts[1]={from:0,until:5,actor:'e1'};assert(!plan(b,'shot','e0').reasons.includes('추격 표식 연계'),'actual forced target is unmarked');b.s.taunts[1]={from:0,until:0,actor:null};b.s.traits.mark.until=.001;assert(!plan(b,'shot','e0').reasons.includes('추격 표식 연계'));
}
{
 const b=fixture('trait_resonance');hand(b,['bash','serin_cut','heal','wave']);b.s.traits.last='a3';b.s.traits.charge=2;
 assert(plan(b,'bash','e0').reasons.includes('공명 완성 준비'));b.get('a1').hp=80;assert(!plan(b,'heal','a1').reasons.some(x=>x.includes('축적')||x.includes('완성')),'same caster gives no charging preference');
 b.s.traits.charge=3;b.get('a1').hp=b.get('a1').max;assert.equal(plan(b,'heal','a1').factor,1,'full HP');b.get('a1').hp=85;assert.equal(plan(b,'heal','a1').factor,1,'normal heal covers missing HP');b.get('a1').hp=60;assert(plan(b,'heal','a1').reasons.includes('공명 강화 활용'));assert(plan(b,'bash','e0').reasons.includes('공명 강화 활용'));
 const snap=b.snapshot();b.autoCandidates();b.policyReason(b.s.decks[0].hand[0],'e0');assert.deepEqual(b.snapshot(),snap,'reading ranking/status/reason preserves RNG and all state');const hidden=copy(snap);hidden.decks[1].draw=[];hidden.decks[1].hand=[];hidden.enemyDue=99999;const blind=new B({},hidden);assert.deepEqual(copy(blind.autoCandidates().map(x=>[x.c.id,x.target,x.score,x.tier])),copy(b.autoCandidates().map(x=>[x.c.id,x.target,x.score,x.tier])),'no hidden enemy hand/clock');
}
// Actual choices: ready resonance lifts a useful bash above a comparable cut, not via extra stats.
{
 const b=fixture('trait_resonance');hand(b,['bash','serin_cut']);b.s.traits.charge=3;const old=baseline(b);assert.equal(decision(old).key,'serin_cut');const picked=decision(b);assert.equal(picked.key,'bash');assert(picked.reason.includes('공명 강화 활용'));assert.equal(b.s.traits.charge,0);assert.equal(b.s.traits.stats.resonance,1);assert.equal(b.s.stats.autoCards,1);assert.equal(b.s.history.filter(e=>e.side===0&&e.type==='card').length,1);assert.equal(b.s.due,4,'ordinary card time retained');
 const charge=fixture('trait_resonance');hand(charge,['bash','serin_cut']);charge.s.traits.charge=2;charge.s.traits.last='a3';charge.get('a0').buff=.04;charge.get('a0').buffUntil=10;assert.equal(decision(charge).key,'bash');assert.equal(charge.s.traits.charge,3);assert.equal(charge.s.traits.stats.resonance,0,'charge isn\'t actual empowered cast');
}
for(const policy of ['attack','protect']){
 // Urgent heals beat charged representative attacks, for both global modes.
 const b=fixture('base','focus',policy);hand(b,['serin_dance','heal']);b.get('a2').hp=10;b.s.traits.guardUntil=8;b.s.traits.charge=4;b.s.traits.mark={actor:'a0',target:'e0',until:8};const picked=decision(b);assert.equal(picked.key,'heal');assert.equal(picked.target,'a2');assert(picked.reason.includes('위기 회복 우선'));assert.equal(b.s.traits.charge,0);assert.equal(b.s.traits.guardUntil,8,'healing does not spend counter');
 const dead=fixture('trait_resonance','focus',policy);hand(dead,['heal','bash','serin_cut']);dead.get('a3').hp=0;dead.s.traits.charge=3;assert(!dead.autoCandidates().some(x=>x.c.key==='heal'));decision(dead);
}
// Near public mechanics trump any trait; late casts/irrelevant support cannot claim safety.
for(const policy of ['attack','protect']){
 const b=fixture('movement','line',policy);b.s.t=10;b.s.due=10;b.s.autoAt=10;for(const a of b.alive(0)){a.x=300;a.y=180;}
 b.s.mechanic.hazard={x:300,y:180,radius:155,shape:'line',length:500,width:100,angle:Math.PI/2,start:10,at:11};b.s.events=[{...D.hostile.line_zone,actor:'e0',side:1,target:null,zone:true,shape:'line',center:{x:300,y:180},radius:155,length:500,width:100,angle:Math.PI/2,power:42,at:11}];hand(b,['boss_retreat','serin_dance']);b.s.traits.guardUntil=18;b.s.traits.charge=3;
 const snap=b.snapshot(),rows=b.autoCandidates();assert.equal(rows[0].c.key,'boss_retreat');assert.equal(rows[0].tier,3);assert.deepEqual(b.snapshot(),snap);const picked=decision(b);assert.equal(picked.key,'boss_retreat');assert(picked.reason.includes('위험 구역 대응 우선'));assert(b.s.mechanic.stats.repositioned>0);assert.equal(b.s.traits.charge,3,'movement does not burn damage/heal resonance');
 const unrelated=fixture();hand(unrelated,['heal','wave']);unrelated.get('a3').hp=10;unrelated.s.events=[{...D.definition({key:'heavy'}),actor:'e0',side:1,target:'a1',at:1}];assert.equal(unrelated.autoSafety(unrelated.s.decks[0].hand.find(c=>c.key==='heal'),'a3').tier,2,'healing someone not threatened has no immediate attack response tier');
}
// Nothing legal: don't invent a card/target or wait forever for a desired combo.
{
 const b=fixture();hand(b,['serin_dance','heal']);for(const a of b.alive(0))a.busy=10;b.s.traits.charge=4;const snap=b.snapshot();assert.equal(b.policyAuto(),false);assert.deepEqual(b.snapshot(),snap);b.get('a1').busy=0;assert(decision(b));
 const fallback=fixture();hand(fallback,['shot']);fallback.s.traits.last='a2';fallback.s.traits.charge=4;assert.equal(decision(fallback).key,'shot','nonresonance fallback continues');
 const off=fixture();hand(off,['shot']);off.s.traits.enabled=false;assert.equal(plan(off,'shot','e0').factor,1);
 const busyHeal=fixture();hand(busyHeal,['heal','shot']);busyHeal.get('a2').hp=10;busyHeal.get('a3').busy=10;assert.equal(decision(busyHeal).key,'shot','unavailable response not waited upon');
}
{
 const c=new C.Campaign();c.start(37);c.enter(c.run.map[0][0].id);assert.equal(c.battle.s.autoTraitVersion,1);for(let i=0;i<450;i++)c.battle.step(.02);const snap=c.snapshot();C.validate(snap);const r=new C.Campaign(copy(C.validate(snap)));for(let i=0;i<700&&!c.battle.s.ended;i++){c.battle.step(.02);r.battle.step(.02);}assert.deepEqual(c.battle.snapshot(),r.battle.snapshot());const bad=copy(snap);bad.run.battle.autoTraitVersion=2;assert.throws(()=>C.validate(bad));assert.throws(()=>new B({},bad.run.battle));
 const old=copy(snap);delete old.run.battle.autoTraitVersion;C.validate(old);const migration=new C.Campaign(old);assert.equal(migration.battle.s.autoTraitVersion,0);assert.equal(migration.battle.s.traits.enabled,true);assert.equal(new B({},migration.battle.snapshot()).s.autoTraitVersion,0);
 const pause=c.battle.snapshot();c.battle.intervene();const frozen=c.battle.snapshot();c.battle.auto();c.battle.step(.02);assert.deepEqual(c.battle.snapshot(),frozen);c.battle.resumeAuto();c.battle.setControl('manual');const manual=c.battle.snapshot();c.battle.auto();assert.deepEqual(c.battle.snapshot(),manual);
}

{
 const b=fixture();hand(b,['shot','guard','serin_parry']);b.get('e0').hp=20;b.get('a2').hp=10;b.s.events=[{...D.definition({key:'heavy'}),actor:'e0',side:1,target:'a2',at:1,power:66}];const attack=b.autoSafety(b.s.decks[0].hand[0],'e0');assert.equal(attack.tier,3);assert.equal(attack.reason,'예고 시전자 처치 예상');assert.equal(b.autoSafety(b.s.decks[0].hand[2],'a1').tier,0,'protecting unrelated self is not a rescue');
 b.get('e0').hp=1000;for(const a of b.alive(0))a.hp=a.max;b.s.events=[{...D.definition({key:'volley'}),actor:'e0',side:1,target:null,at:1,power:24}];assert.equal(b.autoSafety(b.s.decks[0].hand[1],null).tier,0,'small nonlethal attack does not force defense');
 b.get('a2').hp=10;assert.equal(b.autoSafety(b.s.decks[0].hand[2],'a1').tier,0,'area victim elsewhere does not make self ward emergency');
 const viable=fixture();hand(viable,['heal','shot']);viable.get('a2').hp=viable.get('a2').max*.2;const rerolls=viable.s.rerolls;assert(viable.autoCandidates().some(r=>r.c.key==='heal'&&viable.autoUsefulSupport(r)));decision(viable);assert.equal(viable.s.rerolls,rerolls,'useful critical healing prevents unnecessary hand fishing');
 const shielded=fixture('trait_resonance');hand(shielded,['bash']);shielded.s.traits.charge=2;shielded.s.traits.last='a3';for(const e of shielded.alive(1)){e.shield=60;e.shieldUntil=10;}assert.equal(plan(shielded,'bash','e0').factor,1,'an attack fully absorbed by an existing shield cannot build resonance');
 const longHeal=fixture();hand(longHeal,['wave','shot']);longHeal.get('a2').hp=10;assert.equal(longHeal.autoSafety(longHeal.s.decks[0].hand[0],null).tier,0,'one hurt ally does not force an eight-second team heal');longHeal.get('a1').hp=10;assert.equal(longHeal.autoSafety(longHeal.s.decks[0].hand[0],null).tier,2,'multiple critical allies justify team healing priority');
 const flat=fixture('trait_resonance');hand(flat,['serin_cut','bash']);flat.s.traits.charge=3;flat.get('e0').hp=1;assert(!plan(flat,'bash','e0').reasons.includes('공명 강화 활용'),'overkill does not promote resonance consumption');
}
if(process.argv.includes('--fixtures-only')){console.log('PASS: trait-auto decision/safety/save fixtures.');process.exit(0);}
const results=[];let changed=0;
for(const scenario of ['focus','swarm','line','boss'])for(const build of ['base','trait_pursuit','trait_escort','trait_resonance','movement'])for(const policy of ['attack','protect'])for(const ratio of [1,.45,.25])for(const seed of [7,37]){
 const b=L.create(scenario,build,policy,ratio,seed),old=baseline(b),party=b.s.actors.map(a=>[a.max,a.damage,a.period]),before=b.snapshot();b.autoCandidates();assert.deepEqual(b.snapshot(),before);let restored=null;
 for(let i=0;i<10000&&(!b.s.ended||!old.s.ended);i++){if(!b.s.ended)b.step(.02);if(!old.s.ended)old.step(.02);if(i===400)restored=new B({},b.snapshot());else if(restored&&!restored.s.ended)restored.step(.02);}
 assert(b.s.ended&&old.s.ended);assert.deepEqual(b.snapshot(),restored.snapshot());assert.deepEqual(b.s.actors.map(a=>[a.max,a.damage,a.period]),party);assert(b.s.autoDecisions.length<=40);const measure=x=>({win:x.s.winner===0,time:+x.s.t.toFixed(2),hp:+x.alive(0).reduce((n,a)=>n+a.hp,0).toFixed(2),traitEvents:copy(x.s.traits.stats),traitActivations:x.s.traits.history.filter(e=>e.text.includes('강화')||e.text.includes('후속 공격')).length,mechanicHits:x.s.mechanic?.stats.hits||0,decisions:copy(x.s.autoDecisions)});
 const fresh=measure(b),prior=measure(old);if(JSON.stringify(fresh.decisions.map(x=>[x.key,x.target,x.at]))!==JSON.stringify(prior.decisions.map(x=>[x.key,x.target,x.at])))changed++;
 results.push({scenario,build,policy,ratio,seed,current:fresh,previous:prior});
}
const summary=['attack','protect'].map(policy=>{const rows=results.filter(r=>r.policy===policy),mean=(version,key)=>+(rows.reduce((n,r)=>n+r[version][key],0)/rows.length).toFixed(2);return {policy,pairs:rows.length,currentWins:rows.filter(r=>r.current.win).length,previousWins:rows.filter(r=>r.previous.win).length,currentMeanTime:mean('current','time'),previousMeanTime:mean('previous','time'),currentMeanHP:mean('current','hp'),previousMeanHP:mean('previous','hp'),currentTraitActivations:rows.reduce((n,r)=>n+r.current.traitActivations,0),previousTraitActivations:rows.reduce((n,r)=>n+r.previous.traitActivations,0)};});
const regressions=results.filter(r=>r.previous.win&&!r.current.win).map(({current,previous,...r})=>({...r,currentTime:current.time,previousTime:previous.time}));
fs.writeFileSync(__dirname+'/trait-auto-results.json',JSON.stringify({pairs:results.length,battles:results.length*2,changed,summary,regressions,results},null,2));console.log(JSON.stringify({pairs:results.length,changed,summary,regressions}));console.log('PASS: useful/expiry/public-only pure trait ranking; actual charge/spend choices; urgent heal/near mechanic safety; no unavailable cards or free commands; fallback, pause/manual; version save/migration/rejection; deterministic reload and '+results.length+' real current/previous battle pairs.');
