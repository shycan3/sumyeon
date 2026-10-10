const assert=require('assert'),{D,C,B,play,expedition}=require('./simulation.cjs');
const clone=o=>JSON.parse(JSON.stringify(o));
const make=(seed=2026,timing='mixed',encounter=2)=>{const c=new C.Campaign();c.meta.settings.timing=timing;c.start(seed);const r=c.run;return new B({seed,levels:r.levels,hp:r.hp,stances:r.stances,depth:0,elite:false,encounter:D.encounters[encounter],timing,cards:r.deck.map(id=>r.pool.find(c=>c.id===id))});};
const advance=(b,n)=>{for(let i=0;i<n*20;i++)b.step(.05);};
const freeze=b=>{b.s.actors.forEach(a=>{a.cool=1000;a.busy=1000;});b.s.enemyDue=1000;b.s.due=1000;};
const total=b=>b.s.decks[0].draw.length+b.s.decks[0].hand.length+b.s.decks[0].discard.length+b.s.decks[0].excluded.length;
function install(b,key){const deck=b.s.decks[0];let index=deck.hand.findIndex(c=>c.key===key);if(index<0){const i=deck.draw.findIndex(c=>c.key===key);if(i>=0)[deck.hand[0],deck.draw[i]]=[deck.draw[i],deck.hand[0]];else deck.hand[0]={id:'test-card',key,actor:'a'+D.cards[key].role};index=0;}b.s.ready=true;b.s.paused=true;b.select(deck.hand[index].id);return deck.hand[index];}
{
  const data=C.fresh();assert.equal(D.validateDeck(data.meta.deck,data.meta.owned),'');assert.equal(data.meta.owned.length,24);
  assert(D.validateDeck(data.meta.deck.slice(1),data.meta.owned));const duplicate=[...data.meta.deck];duplicate[1]=duplicate[0];assert(D.validateDeck(duplicate,data.meta.owned));
  const extra=data.meta.owned.find(c=>c.key==='ward'),changed=[...data.meta.deck];changed[0]=extra.id;assert.equal(D.validateDeck(changed,data.meta.owned),'');
  assert.deepEqual(clone(C.makeMap(44)),clone(C.makeMap(44)));assert.notDeepEqual(clone(C.makeMap(44)),clone(C.makeMap(45)));
  for(let seed=1;seed<=20;seed++){const map=C.makeMap(seed);assert.equal(map.length,10);assert(map[3].every(n=>n.type==='checkpoint'));assert(map[7].every(n=>n.type==='checkpoint'));assert.equal(map[9][0].type,'boss');}
}
{
  const b=make(),first=clone(b.s.decks[0].hand);advance(b,6);assert(b.s.ready&&b.s.paused);const time=b.s.t;b.step(.1);assert.equal(b.s.t,time);
  assert(b.wait());assert(!b.s.paused&&b.s.ready);advance(b,3);assert(b.s.paused);assert(b.s.events.some(e=>e.side===1));assert.deepEqual(clone(b.s.decks[0].hand),first);assert(Object.values(b.s.stats.cards[1]).length>0);
  b.select(b.s.decks[0].hand[0].id);const before=clone(b.s.decks[0].hand),due=b.s.due,events=clone(b.s.events),beforeTime=b.s.t;assert(b.reroll());assert.equal(b.s.rerolls,1);assert.equal(b.s.t,beforeTime);assert.equal(b.s.due,due);assert.deepEqual(clone(b.s.events),events);assert.equal(total(b),20);assert.equal(b.s.selected,null);assert.equal(b.s.decks[0].hand.filter((c,i)=>c.id!==before[i].id).length,1);
  b.select(b.s.decks[0].hand[0].id);assert(b.reroll());b.select(b.s.decks[0].hand[0].id);assert(!b.reroll());assert.equal(b.s.rerolls,0);
  assert(b.confirm());assert(!b.s.ready&&!b.s.paused);assert.equal(b.s.decks[0].hand.length,5);assert(b.s.due>b.s.t);
  b.get('a1').hp=0;b.refill(0);assert(b.s.decks[0].excluded.length>0);assert(![...b.s.decks[0].hand,...b.s.decks[0].draw,...b.s.decks[0].discard].some(c=>c.actor==='a1'));assert.equal(total(b),20);
  const restored=new B({},b.snapshot());assert.deepEqual(restored.snapshot(),b.snapshot());
}
{
  const b=make();advance(b,6);const c=b.s.decks[0].hand[0];b.select(c.id);b.s.decks[0].draw=[];b.s.decks[0].discard=[];const snapshot=clone(b.s.decks[0].hand);assert(!b.reroll());assert.equal(b.s.rerolls,2);assert.equal(b.s.selected,c.id);assert.deepEqual(clone(b.s.decks[0].hand),snapshot);
}
{
  const b=make();freeze(b);b.get('a1').hp=30;install(b,'heal');const at=b.s.t;assert(b.confirm());assert.equal(b.get('a1').hp,68);assert.equal(b.s.due,at+5);assert.equal(b.s.events.length,0);
  const classic=make(2026,'classic');freeze(classic);classic.get('a1').hp=30;install(classic,'heal');assert(classic.confirm());assert.equal(classic.get('a1').hp,30);advance(classic,.5);assert.equal(classic.get('a1').hp,68);
}
{
  const b=make();freeze(b);b.s.events.push({at:.5,side:1,actor:'e0',target:'a1',kind:'attack',power:20,name:'시험 일격'});install(b,'taunt');assert(b.confirm());assert.equal(b.forced(1).id,'a0');assert.equal(b.eventTarget(b.s.events[0]).id,'a0');const hp=b.get('a0').hp;advance(b,.6);assert.equal(b.get('a1').hp,b.get('a1').max);assert(Math.abs(b.get('a0').hp-(hp-20*.78*.7))<1e-6);
  b.s.events.push({at:1,side:1,actor:'e0',kind:'area',power:10,name:'범위 공격'});const ally=b.get('a1').hp;advance(b,.5);assert(b.get('a1').hp<ally);
  advance(b,4);assert.equal(b.forced(1),null);
  install(b,'taunt');b.confirm();b.get('a0').hp=0;assert.equal(b.forced(1),null);
  const tie=make();freeze(tie);tie.s.events=[{at:1,side:1,actor:'e0',target:'a1',kind:'attack',power:20,name:'동시 일격'},{at:1,side:0,actor:'a0',kind:'taunt',duration:4,name:'도발'}];advance(tie,1.1);assert.equal(tie.get('a1').hp,tie.get('a1').max);assert(tie.get('a0').hp<tie.get('a0').max);
}
{
  const b=make();freeze(b);install(b,'guard');b.confirm();const hp=b.get('a1').hp;b.s.events.push({at:.5,side:1,actor:'e0',target:'a1',kind:'attack',power:30,name:'차단 시험'});advance(b,.6);assert.equal(b.get('a1').hp,hp);assert.equal(b.s.stats.blocked[0],1);
  b.s.events.push({at:1,side:1,actor:'e0',target:'a1',kind:'attack',power:30,name:'다음 타격'});advance(b,.5);assert(b.get('a1').hp<hp);
  const dying=make();freeze(dying);install(dying,'heavy');dying.confirm();dying.get('a1').hp=0;const enemyHP=dying.get('e0').hp;advance(dying,1);assert.equal(dying.get('e0').hp,enemyHP);
  const pressure=make();freeze(pressure);advance(pressure,81);assert(pressure.s.pressure>0);
}
for(const key of Object.keys(D.cards)){
  const b=make();freeze(b);b.s.actors.filter(a=>a.side===0).forEach(a=>a.hp=a.max*.6);const card=install(b,key),d=b.definition(card);assert(b.confirm(),key);advance(b,d.prep+.15);assert(b.s.actors.every(a=>Number.isFinite(a.hp)&&a.hp>=0&&a.hp<=a.max),key+' HP');
}
{
  const b=make();freeze(b);const shield=b.get('a0'),friend=b.get('a1');shield.x=friend.x=150;shield.y=100;friend.y=150;
  b.damage(friend,50,1,'basic');assert.equal(friend.hp,friend.max-40);assert.equal(shield.hp,shield.max-10);assert.equal(b.s.stats.protected[0],10);assert.equal(b.s.stats.damage[1],50);
  shield.stance=1;b.damage(friend,20,1,'basic');assert.equal(friend.hp,friend.max-60);assert.equal(shield.hp,shield.max-10);
  const statuses=make();freeze(statuses);statuses.get('a0').x=30;statuses.get('a0').y=30;statuses.get('a1').x=500;statuses.get('a1').y=300;
  install(statuses,'ward');statuses.s.target='a1';statuses.confirm();const hp=statuses.get('a1').hp;statuses.damage(statuses.get('a1'),20,1,'basic');assert.equal(statuses.get('a1').hp,hp);assert.equal(statuses.get('a1').shield,15);
  statuses.get('a1').slowUntil=10;statuses.get('a1').markUntil=10;install(statuses,'cleanse');statuses.s.target='a1';statuses.confirm();assert.equal(statuses.get('a1').slowUntil,0);assert.equal(statuses.get('a1').markUntil,0);
  install(statuses,'bulwark');statuses.confirm();assert(statuses.alive(0).every(a=>a.armor>.29&&a.armorUntil>0));
  install(statuses,'warcry');statuses.confirm();assert(statuses.alive(0).every(a=>a.buff>.29&&a.buffUntil>0));
  const c=new C.Campaign();c.start(42);c.chooseNode(c.run.map[0][0].id);const snapshot=c.snapshot();C.validateSave(snapshot);
  const malformed=clone(snapshot);malformed.run.battle.decks[0].hand.push(malformed.run.battle.decks[0].hand[0]);assert.throws(()=>C.validateSave(malformed));
  const resumed=new C.Campaign(clone(snapshot));assert.equal(play(c.battle),play(resumed.battle));assert.deepEqual(c.battle.snapshot(),resumed.battle.snapshot());
}
{
  const c=new C.Campaign();c.start(10);const r=c.run;c.chooseNode(r.map[0][0].id);assert(!c.chooseNode(r.map[0][1].id));
  c.battle.s.actors.filter(a=>a.side===1).forEach(a=>a.hp=0);c.battle.checkEnd();assert(c.observeBattle());assert.equal(r.stage,'battleResult');assert(c.openReward());const candidates=[...r.reward.candidates];C.validateSave(c.snapshot());const reload=new C.Campaign(clone(c.snapshot()));assert.deepEqual(clone(reload.run.reward.candidates),clone(candidates));
  assert(c.pickReward(candidates[0]));assert(!c.pickReward(candidates[0]));const card=r.pool.at(-1);assert(card.acquired&&!card.ownedId);const revised=[...r.deck];revised[0]=card.id;const error=D.validateDeck(revised,r.pool);if(!error){assert.equal(c.setRunDeck(revised),'');assert(r.deck.includes(card.id));}
  card.upgraded=true;const before=c.meta.owned.length;assert.equal(c.secure(),1);assert.equal(c.secure(),0);assert.equal(c.meta.owned.length,before+1);assert(card.upgraded);assert(!c.meta.owned.find(c=>c.id===card.ownedId).upgraded);
  r.pool.push({id:'unsecured-extra',key:'pierce',acquired:true,ownedId:null,upgraded:true});assert(c.abandon());assert.equal(c.meta.lastReport.secured,1);assert.equal(c.meta.lastReport.lost,1);assert.equal(c.meta.owned.length,before+1);assert(!c.meta.owned.some(c=>c.upgraded));C.validateSave(c.snapshot());
}
{
  const c=new C.Campaign();c.start(99);const r=c.run;r.depth=2;r.hp=[0,30,10,20];const node=r.map[2].find(n=>n.type==='heal');assert(c.chooseNode(node.id));assert(r.hp[0]>0);assert.equal(r.hp[0],D.maxHP(0,1)*.3);assert(!c.chooseNode(node.id));assert(c.completeNode());
  r.depth=6;const upgrade=r.map[6].find(n=>n.type==='upgrade');c.chooseNode(upgrade.id);const id=r.deck[0];assert(c.evolve(id));assert(!c.evolve(id));assert(r.pool.find(c=>c.id===id).upgraded);c.completeNode();
  c.grantXP(100);assert(c.meta.levels.every(n=>n===5));c.grantXP(100);assert(c.meta.levels.every(n=>n===5));
}
{
  const data=C.fresh();assert.throws(()=>C.validateSave({...data,version:99}));assert.throws(()=>C.validateSave({...data,meta:{...data.meta,levels:[99,1,1,1]}}));
  const b1=make(55),b2=make(55);assert.equal(play(b1),play(b2));assert.deepEqual(b1.snapshot(),b2.snapshot());
  for(const timing of ['mixed','classic']){const c=expedition(2,timing);assert(c.meta.lastReport.success,timing+' complete expedition');assert.equal(c.meta.lastReport.visited,10);assert(c.meta.lastReport.secured>0);assert(c.meta.lastReport.results.some(r=>r.type==='boss'));const owned=c.meta.owned.length;c.start(200);assert(c.run.pool.every(c=>!c.upgraded));assert.equal(c.meta.owned.length,owned);assert(c.run.hp.every((n,i)=>n===D.maxHP(i,c.meta.levels[i])));C.validateSave(c.snapshot());}
}
console.log('PASS: deck limits, deterministic maps, command pause/wait, enemy hand, limited redraw, instant/classic effects, taunt/guard/KO/AoE, all 20 card effects, reward/upgrade/checkpoint/failure/levels/save, real 10-room boss expeditions.');
