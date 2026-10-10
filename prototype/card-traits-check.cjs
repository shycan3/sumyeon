"use strict";
const assert=require('assert'),fs=require('fs'),vm=require('vm'),ctx=vm.createContext({window:{}});
for(const f of ['data.js','character-data.js','actor-ai.js','engine.js','campaign.js','character-engine.js','character-campaign.js','auto-lab-core.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx,{filename:f});
const {GameData:D,CharacterData:K,CharacterBattle:B,CharacterCampaign:C,CardTraits:T,AutoLab:L}=ctx.window,copy=x=>JSON.parse(JSON.stringify(x));
function cards(changes=[]){const {pool,ids}=K.templatePool(K.starter),rows=ids.map(id=>({...pool.find(c=>c.id===id)}));for(const [old,key]of changes){const i=rows.findIndex(c=>c.key===old);assert(i>=0);rows[i]={...rows[i],key,characterId:K.owner(key).id,source:'reward'};}assert.equal(D.validateDeck(rows.map(c=>c.id),rows),'');return rows;}
function battle(changes=[],enabled=true){return new B({seed:19,levels:[1,1,1,1],hp:D.roles.map(r=>r.hp),stances:[0,1,0,0],depth:0,encounter:K.expeditionBattles[0],timing:'mixed',control:'manual',traits:enabled,cards:cards(changes)});}
function freeze(b){b.s.enemyDue=9999;b.s.due=9999;for(const a of b.s.actors){a.cool=9999;a.busy=9999;if(a.side===1)a.hp=a.max=2000;}}
function resolve(b,key,target){const card=['draw','hand','discard','excluded'].flatMap(k=>b.s.decks[0][k]).find(c=>c.key===key);assert(card);const a=b.get('a'+D.cards[key].role);if(a.action)b.endAction(a,'completed');a.busy=0;b.resolve({...D.definition(card),side:0,actor:a.id,target,cardId:card.id,at:b.s.t});}
for(const [key,d]of Object.entries({...D.cards,...D.hostile}))assert.equal(d.traits.length,1,key+' trait required');
assert.equal(T.summary(cards()).find(r=>r.id==='escort').count,3);assert.equal(T.summary(cards()).find(r=>r.id==='pursuit').count,3);assert.equal(T.summary(cards()).find(r=>r.id==='resonance').count,5);
assert.deepEqual(copy(T.summary([{key:'guard'},{key:'guard',upgraded:true}])),copy(T.summary([{key:'guard'}])));
{
 const b=battle([['heal','serin_cover'],['shot','boss_rescue']]);freeze(b);assert.equal(b.traitLevel('escort'),2);resolve(b,'serin_parry','a1');const x=b.get('a1');b.damage(x,5,1,'basic',false,null,'e0');assert(b.s.traits.guardUntil>0);const t=b.get('e0'),hp=t.hp;resolve(b,'shot',t.id);assert(Math.abs(hp-t.hp-24*1.2)<1e-8);assert.equal(b.s.traits.guardUntil,0);
}
{
 const b=battle();freeze(b);const t=b.get('e0');resolve(b,'shot',t.id);assert.equal(b.s.traits.mark.target,t.id);const c=['draw','hand'].flatMap(k=>b.s.decks[0][k]).find(c=>c.key==='serin_cut');assert.equal(b.recommend(c),t.id);const hp=t.hp;resolve(b,'serin_cut',t.id);assert(Math.abs(hp-t.hp-30*1.1)<1e-8);assert(b.s.traits.history.some(e=>e.text.includes('후속 공격')));
 const other=b.get('e1');const hp2=other.hp;resolve(b,'shot',other.id);assert.equal(hp2-other.hp,24,'different target is not strengthened');
}
{
 const b=battle();freeze(b);resolve(b,'bash','e0');b.get('a1').hp=30;resolve(b,'heal','a1');resolve(b,'bash','e0');b.get('a1').hp=30;resolve(b,'heal','a1');assert.equal(b.s.traits.charge,4);const hp=b.get('e0').hp;resolve(b,'serin_dance','e0');for(let i=0;i<25;i++)b.step(.02);assert(Math.abs(hp-b.get('e0').hp-21*1.15*3)<1e-8);assert.equal(b.s.traits.charge,0);assert.equal(b.s.traits.stats.resonance,1);assert.equal(b.s.history.length,0,'traits add no card command');
}
{
 const b=battle([['heal','boss_retreat']]);assert.equal(b.traitLevel('resonance'),2);freeze(b);resolve(b,'bash','e0');b.get('a1').hp=1;resolve(b,'heal','a1');resolve(b,'bash','e0');assert.equal(b.s.traits.charge,3);b.get('a1').hp=1;resolve(b,'heal','a1');assert(Math.abs(b.get('a1').hp-1-38*1.25)<1e-8);
 const c=battle();freeze(c);resolve(c,'heal','a1');assert.equal(c.s.traits.charge,0,'full HP heal does not charge');resolve(c,'bash','e0');resolve(c,'bash','e0');assert.equal(c.s.traits.charge,1,'same character cannot farm resonance');
}
{
 const b=battle();freeze(b);resolve(b,'guard',null);b.resolve({...D.definition({key:'heavy'}),actor:'e0',target:'a1',side:1,cardId:'hostile',at:0});assert(b.s.traits.guardUntil>0,'actual block prepares escort');
 b.s.guards[1]={n:1,until:10};const hp=b.get('e0').hp;resolve(b,'shot','e0');assert.equal(b.get('e0').hp,hp);assert(b.s.traits.guardUntil>0,'blocked attack does not spend trait');assert.equal(b.s.traits.mark,null);
}
{
 const c=new C.Campaign();c.start(37);c.enter(c.run.map[0][0].id);for(let i=0;i<400;i++)c.battle.step(.02);C.validate(c.snapshot());const saved=c.snapshot(),a=new B({},saved.run.battle),b=new B({},saved.run.battle);for(let i=0;i<2000&&!a.s.ended;i++){a.step(.02);b.step(.02);}assert.deepEqual(a.snapshot(),b.snapshot());
 const bad=copy(saved);bad.run.battle.traits.keys.pop();assert.throws(()=>C.validate(bad));const bad2=copy(saved);bad2.run.battle.traits.charge=999;assert.throws(()=>C.validate(bad2));const old=copy(saved.run.battle);delete old.traits;const migrated=new B({},old);assert.equal(migrated.s.traits.enabled,false);const oldSave=copy(saved);delete oldSave.run.battle.traits;C.validate(oldSave);assert.equal(new C.Campaign(oldSave).battle.s.traits.enabled,false);
 c.finish(false);assert.equal(c.run,null);c.start(38);c.enter(c.run.map[0][0].id);assert.equal(c.battle.s.traits.enabled,true);assert.equal(c.battle.s.traits.history.length,0);
}

{
 const b=battle([['heal','serin_chain']]);freeze(b);assert.equal(b.traitLevel('pursuit'),2);resolve(b,'shot','e0');const c=['draw','hand'].flatMap(k=>b.s.decks[0][k]).find(c=>c.key==='serin_cut');b.s.taunts[1]={from:0,until:10,actor:'e1'};assert.equal(b.recommend(c),'e1','trait respects forced taunt');b.s.taunts[1]={from:0,until:0,actor:null};const enemy=b.s.decks[1].hand.find(c=>ctx.window.GameCore.single.includes(D.definition(c).kind));if(enemy)assert.equal(b.get(b.recommend(enemy)).side,0,'allied trait cannot redirect enemy to its own side');const hp=b.get('e0').hp;resolve(b,'serin_cut','e0');assert(Math.abs(hp-b.get('e0').hp-30*1.2)<1e-8);b.s.t=9;assert.equal(b.s.traits.mark.until<9,true);const h=b.get('e0').hp;resolve(b,'shot','e0');assert.equal(h-b.get('e0').hp,24,'expired mark gives no boost');
 const g=battle();freeze(g);resolve(g,'guard',null);g.damage(g.get('a2'),3,1,'basic',false,null,'e0');assert.equal(g.s.traits.guardUntil,0,'guard waiting does not defend basic hits');
 const dead=battle();freeze(dead);dead.get('a0').hp=0;const card=cards().find(c=>c.key==='bash');dead.resolve({...D.definition(card),actor:'a0',side:0,target:'e0',cardId:card.id,at:0});assert.equal(dead.s.traits.charge,0,'cancelled caster cannot charge');
}
let total=0,different=0,records=0;const results=[];
for(const scenario of ['focus','swarm','line','boss'])for(const build of ['base','chain','cover','movement','trait_pursuit','trait_escort','trait_resonance'])for(const policy of ['attack','protect'])for(const seed of [7,37]){
 const a=L.create(scenario,build,policy,.45,seed),old=new B({},a.snapshot());old.s.traits.enabled=false;let reloaded=null;
 for(let i=0;i<10000&&(!a.s.ended||!old.s.ended);i++){if(!a.s.ended)a.step(.02);if(!old.s.ended)old.step(.02);if(i===400)reloaded=new B({},a.snapshot());else if(reloaded&&!reloaded.s.ended)reloaded.step(.02);}
 assert(a.s.ended&&old.s.ended);assert.deepEqual(a.snapshot(),reloaded.snapshot());assert(B.validTraits(a.s.traits,a.s.t,a.s.actors,T.keys(a.s)));assert(a.s.traits.history.length<=40);records+=a.s.traits.history.length;total++;if(JSON.stringify(a.s.autoDecisions)!==JSON.stringify(old.s.autoDecisions))different++;
 results.push({scenario,build,policy,seed,win:a.s.winner===0,time:+a.s.t.toFixed(2),levels:T.summary(a.s.traits.keys).map(r=>r.level),traitEvents:a.s.traits.stats,withoutTraits:{win:old.s.winner===0,time:+old.s.t.toFixed(2)}});
}
fs.writeFileSync(__dirname+'/card-traits-results.json',JSON.stringify({battles:total,pairs:total,different,records,results},null,2));console.log('PASS: all cards tagged; family/evolution counting; real protection, cross-character target/attack, resonance full skill/heal; no free commands; blocked/cancelled/no-op conditions; reset, old-save migration, corrupted save, deterministic reload; '+total+' actual on/off battle pairs ('+different+' changed command histories).');

