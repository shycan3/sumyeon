'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','actor-ai','engine','campaign','character-engine','character-campaign','battle-practice','spectator'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx,{filename:f});
const W=ctx.window,{CharacterCampaign:C,CharacterBattle:B,ActorAI:AI,BattlePractice:P,BattleAwareness:A}=W,copy=x=>JSON.parse(JSON.stringify(x));
const make=()=>{const c=new C.Campaign();c.start(7);c.enter(c.run.map[0][0].id);return c;};
function fixture(){const b=make().battle;b.s.events=[];b.s.strategy='front';const actor=b.get('a2');actor.x=200;actor.y=195;actor.range=240;for(const e of b.alive(1)){e.x=500;e.y=195;e.stance=1;}return {b,actor,near:b.get('e0'),far:b.get('e1')};}
{
 const {b,actor,near,far}=fixture();near.role=1;near.x=300;far.role=0;far.stance=0;far.x=340;assert.equal(b.inspectAI(actor.id).attackTarget,near.id,'a farther tank no longer wins with a hidden distance discount');far.x=300;assert.equal(b.inspectAI(actor.id).attackTarget,far.id,'same-distance protection tank wins');b.s.targetingRulesVersion=0;far.x=340;assert.equal(b.inspectAI(actor.id).attackTarget,far.id,'old targeting still applies its old tank preference');
}
{
 const {b,actor,near,far}=fixture();near.x=300;far.x=302;let p=b.basicIntent(actor);assert.equal(p.attackTarget,near.id);b.s.t=.1;near.x=303;far.x=300;assert.equal(b.basicIntent(actor).attackTarget,near.id,'tiny distance changes do not oscillate');b.s.t=.5;near.x=650;far.x=300;assert.equal(b.basicIntent(actor).attackTarget,far.id,'in-range replacement overrides stale target and hold');near.hp=0;far.hp=0;assert.equal(b.inspectAI(actor.id).attackTarget,null);
}
{
 const {b,actor,near,far}=fixture();near.x=650;far.x=300;actor.ai=AI.defaults(actor,0);actor.ai.target=near.id;actor.ai.holdUntil=2;actor.ai.nextThinkAt=1;const p=b.basicIntent(actor);assert.equal(p.attackTarget,far.id);const x=actor.x;b.executeBasicIntent(actor,p,.02);assert(actor.x<=x,'ranged actor can kite the close target but does not advance after the old distant target');
 actor.purpose={kind:'chase',target:near.id,until:10};assert.equal(b.inspectAI(actor.id).attackTarget,near.id,'explicit chase stays in charge');b.s.taunts[1]={from:0,until:10,actor:far.id};assert.equal(b.inspectAI(actor.id).attackTarget,far.id,'taunt overrides explicit chase');
 delete actor.purpose;b.s.taunts[1]={from:0,until:0,actor:null};b.s.strategy='hunt';const hunter=b.get('e0');hunter.role=1;hunter.stance=0;b.get('a0').hp=1;assert.equal(b.inspectAI(hunter.id).attackTarget,'a0','injured hunting remains an exception');
}
{
 const first=make().battle,second=new B({},first.snapshot());second.s.actors.reverse();for(const b of [first,second]){b.s.events=[];b.s.due=b.s.enemyDue=1000;for(const a of b.s.actors){a.cool=100;a.busy=0;}b.basics(.02);}const targets=b=>Object.fromEntries([...b.s.actors].sort((a,z)=>a.id.localeCompare(z.id)).map(a=>[a.id,a.ai.target]));assert.deepEqual(targets(first),targets(second),'all first decisions see the same positions regardless of actor array order');
}
{
 const b=make().battle,target=b.get('a2'),guard=b.get('a0'),cover=b.get('a1');target.x=400;target.y=195;guard.x=509;guard.y=195;cover.x=800;cover.y=195;guard.stance=0;
 assert.equal(b.protectionFor(target).share,.2);assert(A.inspect(b).states.find(s=>s.id===target.id).labels.some(l=>l.includes('20%')));const hp=target.hp,ghp=guard.hp;b.damage(target,20,1,'basic',true,null,'e0');assert.equal(hp-target.hp,16);assert.equal(ghp-guard.hp,4);
 guard.x=510;assert.equal(b.protectionFor(target),null,'exact radius boundary is outside');cover.x=514;cover.purpose={kind:'cover',target:target.id,until:2};assert.equal(b.protectionFor(target).share,.25);assert(A.inspect(b).states.find(s=>s.id===target.id).labels.some(l=>l.includes('25%')));assert.equal(b.protectionFor(target,2),null,'cover expires at actual hit time');cover.x=515;assert.equal(b.protectionFor(target),null);guard.x=509;cover.x=514;assert.equal(b.protectionFor(target).kind,'cover','cover is exclusive and first');const snap=b.snapshot();b.protectionFor(target);A.inspect(b);assert.deepEqual(b.snapshot(),snap,'inspection never changes battle state');
}
{
 const c=make();assert.equal(c.battle.s.targetingRulesVersion,1);assert.equal(c.run.battleStart.config.targetingRulesVersion,1);const save=c.snapshot();const resumed=new C.Campaign(C.validate(copy(save)));for(let i=0;i<100;i++){c.battle.step(.02);resumed.battle.step(.02);}assert.deepEqual(c.snapshot(),resumed.snapshot());
 for(const mutate of [s=>s.run.battle.targetingRulesVersion=4,s=>s.run.battleStart.config.targetingRulesVersion=-1,s=>delete s.run.battle.targetingRulesVersion]){const bad=copy(save);mutate(bad);assert.throws(()=>C.validate(bad));}
 const record=copy(save.run.battleStart);delete record.config.targetingRulesVersion;const config={...copy(record.config),targetingRulesVersion:0,cards:record.deck.map(id=>record.pool.find(x=>x.id===id))};const old=new B(config);for(let i=0;i<100;i++)old.step(.02);const snapshot=old.snapshot();delete snapshot.targetingRulesVersion;const legacy=new B({},snapshot);assert.equal(legacy.s.targetingRulesVersion,0);assert.equal(legacy.s.seed,snapshot.seed);for(let i=0;i<200;i++){old.step(.02);legacy.step(.02);}assert.deepEqual(old.snapshot(),legacy.snapshot(),'old running battle behavior is preserved');
 const reference=new B(config);for(let i=0;i<10000&&!reference.s.ended;i++)reference.step(.02);const session=new P.Session(C.summarizeBattle(reference,record));session.start();assert.equal(session.battle.s.targetingRulesVersion,0);for(let i=0;i<10000&&!session.battle.s.ended;i++)session.step(.02);assert.equal(session.battle.s.t,reference.s.t);assert.deepEqual(session.battle.s.stats,reference.s.stats,'historical practice uses old rules');
}
console.log('PASS: distance/tank tiebreak, hold and reachable replacement, chase/taunt/hunt exceptions, same-state first decisions, protection boundaries and UI/effect agreement, readonly inspection, versioned save/replay and invalid inputs.');
