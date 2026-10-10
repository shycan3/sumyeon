'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),c=vm.createContext({window:{}});
for(const f of ['data','character-data','engine','campaign','actor-ai','character-engine','character-campaign','combat-lab-core','spectator'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),c);
const W=c.window,L=W.CombatLab,A=W.BattleAwareness,copy=x=>JSON.parse(JSON.stringify(x));
{
 const b=L.create('heavy'),card=b.s.decks[1].hand.find(x=>x.key==='quake');b.s.enemyReady=true;assert(b.command(1,card.id,null));const saved=b.snapshot(),x=A.inspect(b);assert.equal(x.incoming.length,1);assert.equal(x.incoming[0].targets.length,4);assert.equal(x.incoming[0].remaining,2.8);assert(A.panel(b).includes('광역'));assert.deepEqual(b.snapshot(),saved,'inspection/panel must not mutate gameplay');
 b.s.guards[0]={n:1,until:5};b.resolve(b.s.events.shift());assert.equal(b.s.stats.blocked[0],1);assert.equal(b.s.stats.byCard[1].quake||0,0);assert.equal(b.s.recap.events.filter(x=>x.kind==='block').length,1);assert.equal(b.s.recap.events.filter(x=>x.kind==='ko').length,0);assert(A.recap({recap:b.s.recap,actors:b.s.actors}).includes('피해 발생 없음'));
}
{
 const b=L.create('focus'),a=b.get('a1'),target=b.get('a3');b.get('a0').x=35;b.get('a0').y=35;a.x=target.x+114;a.y=target.y;a.purpose={kind:'cover',target:target.id,until:5};a.hp=1;target.shield=10;target.shieldUntil=5;const before=target.hp;b.damage(target,30,1,'card',true,'pierce','e1');const events=b.s.recap.events;assert.equal(events.find(e=>e.kind==='shield').amount,10);assert.equal(events.find(e=>e.kind==='protect').amount,1);const ko=events.find(e=>e.kind==='ko');assert.equal(ko.actor,'e1');assert.equal(ko.target,'a1');assert.equal(ko.shared,true);assert.equal(ko.amount,1);assert.equal(before-target.hp,19);assert(A.recap({recap:b.s.recap,actors:b.s.actors}).includes('분담 피해 1.0'));
 const saved=b.snapshot();A.inspect(b);A.recap({recap:b.s.recap,actors:b.s.actors});assert.deepEqual(saved,b.snapshot());const restored=new b.constructor({},saved);assert.deepEqual(restored.snapshot(),saved);const bad=copy(saved);bad.recap.events[0].target='invalid';assert.throws(()=>new b.constructor({},bad));
}
{
 const b=L.create('focus'),a=b.get('a1'),target=b.get('a3');a.x=target.x+114;a.y=target.y;a.purpose={kind:'cover',target:target.id,until:2};a.counter={power:22,key:'serin_cover',until:2};target.shield=5;target.shieldUntil=2;
 let x=A.inspect(b);assert(x.states.find(x=>x.id===target.id).labels.some(x=>x.includes('세린')));a.x=target.x+115;x=A.inspect(b);assert(x.states.find(x=>x.id===a.id).labels.some(x=>x.includes('엄호 접근')));assert(!x.states.find(x=>x.id===target.id).labels.some(x=>x.includes('세린')));b.s.t=2;x=A.inspect(b);assert(!x.states.some(x=>x.labels.some(s=>/엄호|반격|보호막/.test(s))));
 const medic=b.get('a3');medic.hp=10;b.visualHealer='a3';b.heal(medic,500,0);assert.equal(b.s.recap.events.at(-1).amount,medic.max-10);const count=b.s.recap.events.length;b.heal(medic,500,0);assert.equal(b.s.recap.events.length,count,'zero healing has no recap');for(let i=0;i<100;i++)b.recordRecap('shield',null,medic,1);assert.equal(b.s.recap.events.length,80);assert(W.CharacterBattle.validRecap(b.s.recap,b.s.t,b.s.actors));
 const old=copy(b.snapshot());delete old.recap;const migrated=new b.constructor({},old);assert.equal(migrated.s.recap.from,2);assert.equal(migrated.s.recap.events.length,0);assert(A.recap({}).includes('이전 전투'));
}
{
 for(const key of Object.keys(L.scenarios)){const normal=L.create(key),quiet=L.create(key);quiet.recordRecap=()=>{};for(let i=0;i<3000&&!normal.s.ended;i++){normal.step(.02);quiet.step(.02);}const a=copy(normal.snapshot()),b=copy(quiet.snapshot());delete a.recap;delete b.recap;assert.deepEqual(a,b,'recap instrumentation must not change real combat');const result=L.summarize(normal);assert(result.recap.events.some(e=>e.kind==='ko'));assert(A.recap(result).includes('전투불능'));}
}
console.log('PASS: pure real-target/area inspection, one factual guard block without damage, shield then lethal cover attribution, exact distance/expiry status, capped actual healing, bounded/validated/migrated save records, recap HTML and identical gameplay with recording disabled.');
