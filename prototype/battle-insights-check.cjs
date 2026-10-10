'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),ctx=vm.createContext({window:{}});
for(const f of ['data.js','character-data.js','actor-ai.js','engine.js','campaign.js','character-engine.js','character-campaign.js','battle-practice.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx,{filename:f});
const {CharacterCampaign:C,CharacterBattle:B,GameData:D,BattlePractice:P}=ctx.window,copy=x=>JSON.parse(JSON.stringify(x));
const campaign=()=>{const c=new C.Campaign();c.start(7);c.enter(c.run.map[0][0].id);return c;};
function finish(b){for(let i=0;i<10000&&!b.s.ended;i++)b.step(.02);assert(b.s.ended);}
function fixture(){const b=campaign().battle;b.s.due=b.s.enemyDue=1000;for(const a of b.s.actors)a.cool=a.busy=1000;return b;}
function resolve(b,key,target){const d=D.definition({key});b.resolve({...d,key,side:0,actor:'a'+d.role,target,at:b.s.t,cardId:'fixture'});}
{
 const b=fixture(),a=b.get('a1');a.hp=a.max-7;resolve(b,'heal',a.id);assert.equal(b.s.insights.rows.heal.healed,7);resolve(b,'heal',a.id);assert.equal(b.s.insights.rows.heal.healed,7,'overheal not counted');
 resolve(b,'serin_cover','a3');const shield=b.get('a3').shield;b.damage(b.get('a3'),shield+12,1,'basic',false,null,'e1');assert.equal(b.s.insights.rows.serin_cover.shield,shield);assert.equal(b.s.insights.rows.serin_cover.shared,3);assert(b.s.insights.rows.serin_cover.damage>0,'counter belongs to source card');
 resolve(b,'guard',null);const before=b.s.stats.blocked[0];b.resolve({...D.definition({key:'shot'}),key:'shot',side:1,actor:'e0',target:'a1',at:b.s.t,cardId:'enemy'});assert.equal(b.s.insights.rows.guard.blocks,b.s.stats.blocked[0]-before);assert.equal(b.s.insights.rows.guard.blocks,1);
 a.hp=1;b.damage(a,10000,1,'basic',true,null,'e1');assert.equal(b.s.insights.firstKO.actor,'a1');assert(B.validInsights(b.s.insights,b.s.t));
 const bad=copy(b.s.insights);bad.rows.guard.used=-1;assert(!B.validInsights(bad,b.s.t));const fake=copy(b.s.insights);fake.shields.a0='toString';assert(!B.validInsights(fake,b.s.t));
}
{
 const b=fixture();b.s.traits.guardUntil=8;const enemy=b.get('e0');enemy.hp=enemy.max=1000;resolve(b,'serin_cut',enemy.id);assert.equal(b.s.insights.rows.serin_cut.boosts,1,'actual trait boost attributed by event key');
 const snapshot=b.snapshot(),old=copy(snapshot);delete old.insights;const migrated=new B({},old);assert.equal(migrated.s.insights.complete,false);assert.equal(migrated.s.insights.from,old.t);assert.equal(Object.values(migrated.s.insights.rows).reduce((n,r)=>n+r.damage,0),0);
 const first=new B({},snapshot),second=new B({},snapshot);for(let i=0;i<100;i++){first.step(.02);second.step(.02);}assert.deepEqual(first.snapshot(),second.snapshot());
}
{
 const c=campaign();C.validate(c.snapshot());const save=copy(c.snapshot()),resumed=new C.Campaign(C.validate(save));finish(resumed.battle);resumed.observe();C.validate(resumed.snapshot());
 const reference=resumed.run.results[0],q=new P.Session(reference),untouched=JSON.stringify(resumed.snapshot());assert(q.start());assert(!q.toggle(q.ids[0]),'cannot edit running battle');assert(!q.useBasics(true));finish(q.battle);q.observe();assert.equal(q.results[0].time,reference.time);assert.deepEqual(q.results[0].stats,reference.stats);assert.deepEqual(q.results[0].insights,reference.insights);assert.equal(Object.values(reference.insights.rows).reduce((n,r)=>n+r.used,0),Object.values(reference.stats.cards[0]).reduce((n,v)=>n+v,0));assert.equal(JSON.stringify(resumed.snapshot()),untouched,'practice cannot mutate campaign');
 assert(q.useBasics(true));assert(C.validPool(q.pool));assert(q.pool.length>q.record.pool.length);const remove=q.ids[0],add=q.pool.find(x=>!q.ids.includes(x.id));q.toggle(remove);q.toggle(add.id);assert.equal(D.validateDeck(q.ids,q.pool),'');for(let i=0;i<7;i++){assert(q.start());finish(q.battle);q.observe();}assert.equal(q.results.length,6);assert.equal(JSON.stringify(resumed.snapshot()),untouched);
 const bad=copy(reference.practice);bad.config.hp[0]=1e6;assert(!C.validBattleRecord(bad));assert.throws(()=>new P.Session({...reference,practice:bad}));
 const legacy=copy(resumed.snapshot());delete legacy.run.initialDeck;for(const r of legacy.run.results){delete r.practice;delete r.insights;}C.validate(legacy);assert.throws(()=>new P.Session(legacy.run.results[0]));
 const lost=campaign();for(const a of lost.battle.alive(0))a.hp=0;lost.battle.checkEnd();lost.observe();assert(!lost.run);C.validate(lost.snapshot());assert(new P.Session(lost.meta.history[0].results[0]).start(),'failed expedition retains practice source');
}
console.log('PASS: effective healing/shield/block/share/counter/trait attribution; partial legacy metrics; deterministic replay/resume; pool caps and edit lock; original campaign isolation; failed-run and save validation.');
