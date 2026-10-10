'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','actor-ai','engine','campaign','character-engine','character-campaign','presentation-data','skill-director'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);
const W=ctx.window,D=W.GameData,C=W.CharacterCampaign,B=W.CharacterBattle,copy=x=>JSON.parse(JSON.stringify(x));
function make(){const c=new C.Campaign();c.start(1);c.enter(c.run.map[0][0].id);const b=c.battle;b.s.control='auto';b.s.due=b.s.enemyDue=1000;for(const a of b.s.actors){a.cool=1000;a.busy=0;a.stance=1;a.x=850;a.y=330;}b.get('a0').x=30;b.get('a0').y=30;b.get('e0').hp=b.get('e0').max=300;return {c,b};}
function install(b,key){const deck=b.s.decks[0],zone=['hand','draw','discard'].find(k=>deck[k].some(x=>x.key===key));let card;if(zone){card=deck[zone].find(x=>x.key===key);if(zone!=='hand'){const i=deck[zone].indexOf(card);[deck.hand[0],deck[zone][i]]=[card,deck.hand[0]];}}else{card={key,id:'test:'+key,actor:'a'+D.cards[key].role,upgraded:false};deck.hand[0]=card;}b.s.ready=true;return card;}
function cast(b,key,target='e0'){const card=install(b,key);assert(b.command(0,card.id,target));return card;}
const step=(b,n)=>{for(let i=0;i<n;i++)b.step(.02);};
const result=(b,id)=>b.s.actionResults.find(x=>x.id===id);
{
 const {b}=make(),card=cast(b,'serin_dance'),a=b.get('a1'),id=a.action.id,charge=b.s.due,event=copy(b.s.events[0]);b.get('e0').hp=0;const pos=[a.x,a.y];step(b,1);assert(!a.action);assert(!a.approach);assert.equal(a.busy,b.s.t);assert.equal(b.s.events.length,0);assert.equal(b.s.due,charge);assert(b.s.decks[0].discard.some(c=>c.id===card.id));assert.equal(result(b,id).status,'cancelled');assert.equal(result(b,id).hits,0);const hp=b.get('e1').hp;b.resolve(event);assert.equal(b.get('e1').hp,hp,'stale cancelled event cannot resolve');assert.equal(b.visuals.filter(e=>e.kind==='cancel'&&e.actionId===id).length,1);
}
{
 const {b}=make();cast(b,'serin_dance');step(b,18);const a=b.get('a1'),id=a.action.id;assert.equal(b.s.stats.signatureHits,1);b.get('e0').hp=0;step(b,1);assert.equal(b.s.events.length,0);assert(!a.action);assert.equal(result(b,id).status,'cancelled');step(b,30);assert.equal(b.s.stats.signatureHits,1);
 const blocked=make().b;cast(blocked,'serin_dance');step(blocked,18);const action=blocked.get('a1').action.id;blocked.s.guards[1]={n:1,until:10};step(blocked,8);assert.equal(result(blocked,action).status,'blocked');assert.equal(blocked.s.events.length,0);assert.equal(blocked.s.stats.signatureHits,1);assert(!blocked.get('a1').action);assert(blocked.get('a1').busy<=blocked.s.t);assert.equal(blocked.visuals.filter(e=>e.kind==='block').length,1);
}
{
 const {b}=make();cast(b,'serin_dance');const a=b.get('a1'),id=a.action.id;a.hp=1;
 // A lethal incoming hit cancels the pending allied cast before any follow-ups.
 const enemy=b.get('e1');enemy.hp=1;const e={...D.definition({key:'shot'}),side:1,actor:enemy.id,target:'a1',at:.1,cardId:'enemy-test'};a.counter={until:10,power:1000,key:'serin_parry'};b.s.events.push(e);step(b,6);assert.equal(a.hp,0);assert(!a.action);assert(!a.approach);assert(!a.counter);assert.equal(result(b,id).status,'cancelled');assert(!b.s.events.some(e=>e.actor===a.id));step(b,30);assert.equal(b.s.stats.signatureHits,0);
}
{
 const {b}=make();const a=b.get('a1');a.x=100;a.y=150;const card=cast(b,'heavy');const caster=b.get('a1'),id=caster.action.id;assert(caster.approach);b.get('e0').hp=0;const pos=[caster.x,caster.y];step(b,1);assert(!caster.approach);assert(!caster.action);assert.equal(result(b,id).status,'cancelled');assert(caster.busy<=b.s.t);
 const dead=make().b;cast(dead,'serin_dance');const actor=dead.get('a1'),action=actor.action.id;dead.damage(actor,10000,1,'card',true,'shot','e1');assert(!actor.action);assert(!dead.s.events.some(e=>e.actor===actor.id));assert.equal(result(dead,action).status,'cancelled');
}
{
 const {b}=make();cast(b,'serin_dance');b.s.taunts[1]={from:0,until:2,actor:'e1'};b.get('e0').hp=0;const hp=b.get('e1').hp;step(b,18);assert(b.get('e1').hp<hp,'living taunter is a valid actual target despite selected target death');assert.equal(b.s.stats.signatureHits,1);
 const area=make().b;const c=cast(area,'volley','e0');area.get('e0').hp=0;step(area,60);assert(area.s.actionResults.some(r=>r.cardId===c.id&&r.status==='completed'),'whole-field attack can resolve after selected enemy death');
 const heal=make().b;const card=cast(heal,'serin_cover','a3'),id=heal.get('a1').action.id;heal.get('a3').hp=0;step(heal,1);assert.equal(result(heal,id).status,'cancelled');assert.equal(heal.s.stats.healed[0],0);
}
{
 const {b}=make();b.get('e0').hp=1;cast(b,'serin_chain');step(b,11);const a=b.get('a1'),id=a.action.id;assert(b.s.events.some(e=>e.chainFollow));b.get('e1').hp=0;step(b,1);assert.equal(b.s.events.length,0);assert(!a.action);assert.equal(b.s.stats.chainHits,0);assert(result(b,id));
 const complete=make().b;cast(complete,'serin_dance');const action=complete.get('a1').action.id;step(complete,35);assert.equal(complete.s.stats.signatureHits,3);assert.equal(complete.get('a1').action.phase,'recovery');step(complete,10);assert(!complete.get('a1').action);assert.equal(result(complete,action).hits,3);assert.equal(result(complete,action).status,'completed');
}
{
 const {c,b}=make();cast(b,'serin_dance');step(b,18);const before=c.snapshot();C.validate(before);const restored=new C.Campaign(copy(before));step(b,30);step(restored.battle,30);assert.deepEqual(b.snapshot(),restored.battle.snapshot());
 const paused=make().b;cast(paused,'serin_dance');paused.intervene();const frozen=paused.snapshot();paused.step(.1);assert.deepEqual(paused.snapshot(),frozen);
 const old=copy(before);delete old.run.battle.actionRulesVersion;delete old.run.battle.actionSerial;delete old.run.battle.actionResults;for(const a of old.run.battle.actors)delete a.action;for(const e of old.run.battle.events)delete e.actionId;C.validate(old);const migrated=new C.Campaign(old);assert.equal(migrated.battle.s.actionRulesVersion,1);assert(migrated.battle.s.events.every(e=>e.actionId===migrated.battle.get(e.actor).action.id));
 for(const mutate of [s=>s.actionRulesVersion=99,s=>s.actionSerial=-1,s=>s.actors.find(a=>a.action).action.phase='invalid',s=>s.events[0].actionId=999]){const bad=copy(before);mutate(bad.run.battle);assert.throws(()=>C.validate(bad));}
 const ended=make().b;cast(ended,'serin_dance');for(const a of ended.alive(1))a.hp=0;ended.checkEnd();assert.equal(ended.s.events.length,0);assert(!ended.s.actors.some(a=>a.action||a.approach));
}
{
 const {b}=make(),hero=b.get('a1'),enemy=b.get('e1');enemy.hp=1;hero.counter={until:10,power:1000,key:'serin_parry'};
 b.resolve({...D.definition({key:'serin_dance'}),key:'serin_dance',actor:enemy.id,side:1,target:hero.id,cardId:'enemy-signature',at:0});assert.equal(enemy.hp,0);assert(!enemy.action);assert(!b.s.events.some(e=>e.actor===enemy.id),'counter KO cannot schedule ghost follow-up attacks');assert.equal(b.s.actionResults.filter(r=>r.actor===enemy.id).length,1);assert.equal(b.s.actionResults.find(r=>r.actor===enemy.id).hits,1);
 const director=new W.SkillDirector();director.attach(b);director.accept({kind:'cast',actor:'a1',target:'e0',key:'serin_dance',cardId:'same-copy',actionId:100,at:b.s.t,until:1},b);director.accept({kind:'cancel',actor:'a1',cardId:'same-copy',actionId:99,at:b.s.t,reason:'old'},b);assert(!director.current(b).stopped,'old use of same card copy does not cancel a newer intro');director.accept({kind:'cancel',actor:'a1',cardId:'same-copy',actionId:100,at:b.s.t,reason:'시전자 전투불능'},b);director.accept({kind:'signature-hit',actor:'a1',target:'e0',cardId:'same-copy',actionId:100,index:1,at:b.s.t},b);assert.equal(director.current(b).phase,'시전자 전투불능','a late hit cue does not overwrite interruption');
}
{
 const {b}=make();cast(b,'serin_dance');const a=b.get('a1'),id=a.action.id,pending=b.s.events[0],due=b.s.due;
 b.resolve({...D.definition({key:'frost'}),key:'frost',actor:'e1',side:1,target:a.id,at:0,cardId:'delay'});assert.equal(a.action.id,id);assert.equal(pending.delayCount,1);assert(pending.at>1);assert.equal(b.s.due,due);step(b,18);assert.equal(b.s.stats.signatureHits,0);step(b,90);assert.equal(b.s.stats.signatureHits,3);assert.equal(b.s.actionResults.filter(r=>r.id===id).length,1);
 for(const ticks of [1,18,35]){const {c,b}=make();cast(b,'serin_dance');step(b,ticks);const saved=c.snapshot();C.validate(saved);const resumed=new C.Campaign(copy(saved));step(b,60);step(resumed.battle,60);assert.deepEqual(b.snapshot(),resumed.battle.snapshot(),'identical continuation in preparation/follow/recovery');}
}
console.log('PASS: preparation/travel/follow/recovery lifecycle, stale-event isolation, target/caster KO and guarded continuation cleanup, charge/card retention, taunt actual target/area validity, single terminal result, paused/saved/migrated actions and invalid-state rejection.');
