const assert=require('assert'),{D,C,B}=require('./simulation.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function make(control='auto',seed=11){
  const counts={guard:3,heal:3,dash:3,shot:3,heavy:2,wave:2,taunt:2,bash:1,ward:1};let serial=0;
  return new B({seed,levels:[1,1,1,1],hp:D.roles.map(r=>r.hp),stances:[0,1,1,0],depth:0,elite:false,encounter:D.encounters[0],timing:'mixed',control,cards:Object.entries(counts).flatMap(([key,n])=>Array.from({length:n},()=>({id:'auto-test-'+serial++,key,upgraded:false})))});
}
function ready(b){b.s.t=5;b.s.due=5;b.s.ready=true;b.s.paused=false;b.s.autoAt=5;b.s.enemyDue=1000;b.s.actors.forEach(a=>{a.cool=1000;a.busy=1000;});}
function hand(b,keys){
  const deck=b.s.decks[0];for(let i=0;i<keys.length;i++){
    if(deck.hand[i]?.key===keys[i])continue;let area,index;
    for(const name of ['hand','draw','discard']){const j=deck[name].findIndex((c,k)=>c.key===keys[i]&&(name!=='hand'||k>=i));if(j>=0){area=name;index=j;break;}}
    assert(area,'card exists: '+keys[i]);[deck.hand[i],deck[area][index]]=[deck[area][index],deck.hand[i]];
  }
}
function stepUntil(b,condition,limit=24000){for(let i=0;i<limit&&!condition(b);i++)b.step(.05);assert(condition(b),'battle reached expected state');}
function spent(b){return Object.values(b.s.stats.cards[0]).reduce((sum,n)=>sum+n,0);}
{
  const manual=make(null);assert.equal(manual.s.control,'manual');stepUntil(manual,b=>b.s.ready);assert(manual.s.paused);const frozen=manual.snapshot();manual.step(.1);assert.deepEqual(manual.snapshot(),frozen);
  for(const seed of [11,12]){
    const b=make('auto',seed),stances=b.alive(0).map(a=>a.stance);let sawEnemyCard=false;
    for(let i=0;i<24000&&!b.s.ended;i++){b.step(.05);sawEnemyCard ||= Object.values(b.s.stats.cards[1]).some(n=>n>0);if(!b.s.ended)assert(!b.s.paused,'auto does not pause at READY or enemy telegraph');assert(b.s.rerolls>=0&&b.s.rerolls<=2);}
    assert(b.s.ended);assert(b.s.stats.autoCards>0);assert.equal(b.s.stats.autoCards,spent(b));assert(sawEnemyCard);assert.deepEqual(b.s.actors.filter(a=>a.side===0).map(a=>a.stance),stances);assert.equal(b.s.stats.stanceChanges,0);assert(b.s.stats.rerolls<=2);
  }
}
{
  const b=make();ready(b);hand(b,['heal','guard','taunt','wave','bash']);b.get('a1').hp=5;assert(b.auto());assert.equal(b.s.autoLast.key,'heal');assert.equal(b.s.autoLast.target,'a1');assert.equal(b.get('a1').hp,43);assert(b.s.autoLast.reason);assert.equal(b.s.stats.autoCards,1);
  const guarded=make();ready(guarded);hand(guarded,['guard','dash','heal','wave','taunt']);const hp=guarded.alive(0).map(a=>a.hp);
  guarded.s.events.push({at:5.5,side:1,actor:'e0',key:'quake',kind:'area',power:80,target:null,name:'announced test attack'});assert(guarded.auto());assert.equal(guarded.s.autoLast.key,'guard');stepUntil(guarded,b=>b.s.t>=5.6);assert.deepEqual(guarded.alive(0).map(a=>a.hp),hp);assert.equal(guarded.s.stats.blocked[0],1);assert(!guarded.s.paused);
  const blind=make();ready(blind);hand(blind,['guard','dash','heal','wave','taunt']);const guard=blind.s.decks[0].hand[0];assert.equal(blind.autoScore(guard,blind.recommend(guard)),0);assert(blind.auto());assert.notEqual(blind.s.autoLast.key,'guard');
}
{
  const a=make();ready(a);hand(a,['guard','dash','heal','wave','taunt']);a.s.rerolls=0;const b=new B({},a.snapshot());
  const enemy=b.s.decks[1];assert(enemy.draw.length>0);[enemy.hand[0],enemy.draw[0]]=[enemy.draw[0],enemy.hand[0]];assert.notDeepEqual(clone(a.s.decks[1].hand),clone(enemy.hand),'different legal hidden opposing hand');
  for(const card of a.s.decks[0].hand)assert.equal(a.autoScore(card,a.recommend(card)),b.autoScore(card,b.recommend(card)));
  assert(a.auto());assert(b.auto());assert.deepEqual(clone(a.s.autoLast),clone(b.s.autoLast));assert.deepEqual(clone(a.s.history),clone(b.s.history));assert.equal(a.s.seed,b.s.seed,'hidden opposing cards do not affect scoring or selection');
}
{
  const b=make();ready(b);hand(b,['guard','guard','guard','taunt','taunt']);assert(!b.s.paused);b.auto();assert.equal(b.s.stats.rerolls,1,'auto can replace a presently unhelpful card');assert.equal(b.s.rerolls,1);
  const shared=make();ready(shared);assert(shared.replace(shared.s.decks[0].hand[0].id));assert(shared.intervene());shared.select(shared.s.decks[0].hand[0].id);assert(shared.reroll());assert.equal(shared.s.rerolls,0);assert(!shared.replace(shared.s.decks[0].hand[0].id));assert.equal(shared.s.stats.rerolls,2);
  const ko=make();ko.get('a1').hp=0;ko.refill(0);ready(ko);ko.auto();assert(ko.s.decks[0].excluded.length>0);assert(!ko.s.decks[0].hand.some(card=>card.actor==='a1'));assert(!ko.s.history.some(e=>D.cards[e.key].role===1));
}
{
  const b=make();ready(b);hand(b,['dash','guard','heal','wave','taunt']);const card=b.s.decks[0].hand[0],before=spent(b);assert(b.select(card.id));assert(b.s.paused&&b.s.intervening);const frozen=b.snapshot();for(let i=0;i<20;i++)b.step(.1);assert.deepEqual(b.snapshot(),frozen);assert.equal(b.s.stats.interventions,1);assert(b.intervene());assert.equal(b.s.stats.interventions,1);assert(b.confirm());assert(!b.s.intervening&&!b.s.paused);assert.equal(spent(b),before+1);assert.equal(b.s.due,5+D.cards[card.key].time);assert(!b.confirm());const due=b.s.due;assert(b.resumeAuto());assert.equal(b.s.due,due);b.step(.05);assert.equal(spent(b),before+1,'manual intervention spends exactly one command');
  const charging=make();charging.step(.1);const chargeDue=charging.s.due;assert(charging.intervene());const at=charging.s.t;charging.step(.1);assert.equal(charging.s.t,at);assert(charging.resumeAuto());assert.equal(charging.s.due,chargeDue);charging.step(.1);assert(charging.s.t>at);assert.equal(charging.s.stats.autoCards,0);
}
{
  const b=make();stepUntil(b,b=>b.s.t>=12||b.s.ended);const restored=new B({},b.snapshot());for(let i=0;i<1000&&!b.s.ended;i++){b.step(.05);restored.step(.05);}assert.deepEqual(restored.snapshot(),b.snapshot(),'saved automatic continuation is deterministic');
  const c=new C.Campaign();assert.equal(c.meta.settings.control,'manual');assert(c.setControl('auto'));c.start(1);c.chooseNode(C.availableNodes(c.run)[0].id);assert.equal(c.battle.s.control,'auto');const save=c.snapshot();C.validateSave(save);const reload=new C.Campaign(clone(save));assert.equal(reload.meta.settings.control,'auto');assert.equal(reload.battle.s.control,'auto');
  const legacy=clone(save);delete legacy.meta.settings.control;for(const field of ['control','intervening','autoAt','autoLast'])delete legacy.run.battle[field];delete legacy.run.battle.stats.autoCards;delete legacy.run.battle.stats.interventions;C.validateSave(legacy);const old=new C.Campaign(legacy);assert.equal(old.meta.settings.control,'manual');assert.equal(old.battle.s.control,'manual');assert.equal(old.battle.s.stats.autoCards,0);assert.equal(old.battle.s.stats.interventions,0);
  const badCases=[d=>d.meta.settings.control='unknown',d=>d.run.battle.control='unknown',d=>d.run.battle.intervening='yes',d=>d.run.battle.autoAt=Infinity,d=>d.run.battle.stats.autoCards=-1,d=>d.run.battle.stats.interventions=.5,d=>d.run.battle.autoLast={at:1,key:'unknown',target:null,reason:'bad'}];for(const change of badCases){const bad=clone(save);change(bad);assert.throws(()=>C.validateSave(bad));}
}
console.log('PASS: actual automatic fights, heal/announced guard/no blind guard, hidden-hand independence, unchanged stances, shared bounded redraw/KO, manual default, frozen intervention/single spend/charge resume, deterministic continuation and legacy/invalid saves.');
