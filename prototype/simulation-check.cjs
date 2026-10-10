const assert=require('assert'),{D,C,B,context,decide,expedition,builds,setBuild}=require('./simulation.cjs');
const battle=()=>{const c=new C.Campaign();c.start(2);c.chooseNode(C.availableNodes(c.run)[0].id);return c.battle;};
{
  const create=()=>{const c=new C.Campaign();c.start(2);const r=c.run,b=new B({seed:3,levels:r.levels,hp:r.hp,stances:r.stances,depth:0,elite:false,encounter:D.encounters[5],timing:'mixed',cards:r.deck.map(id=>r.pool.find(c=>c.id===id))});
    b.s.t=5;b.s.ready=true;b.s.paused=true;b.s.enemyDue=7;b.s.actors.forEach(a=>{a.cool=1000;a.busy=1000;});b.s.decks[1]={draw:[],discard:[],excluded:[],hand:[{id:'forecast-quake',key:'quake',actor:'e0'}]};
    for(const key of ['guard','heavy']){const deck=b.s.decks[0];if(!deck.hand.some(c=>c.key===key)){const i=deck.draw.findIndex(c=>c.key===key),slot=deck.hand.findIndex(c=>!['guard','heavy'].includes(c.key));[deck.draw[i],deck.hand[slot]]=[deck.hand[slot],deck.draw[i]];}}
    return b;};
  const reserved=create(),attacked=create();decide(reserved,'adaptive');assert(reserved.s.waiting);
  attacked.select(attacked.s.decks[0].hand.find(c=>c.key==='heavy').id);assert(attacked.confirm());
  while(reserved.s.t<9){if(reserved.s.paused){reserved.select(reserved.s.decks[0].hand.find(c=>c.key==='guard').id);assert(reserved.confirm());}else reserved.step(.05);}
  while(attacked.s.t<9)attacked.step(.05);
  assert.equal(reserved.s.stats.blocked[0],1);assert.equal(attacked.s.stats.blocked[0],0);
  assert(reserved.alive(0).reduce((n,a)=>n+a.hp,0)>attacked.alive(0).reduce((n,a)=>n+a.hp,0),'reserving command must preserve HP against the telegraphed whole-party attack');
  assert(attacked.s.stats.card[0]>0,'the competing attack strategy must actually inflict damage');
}
{
  const b=battle();b.s.ready=true;b.s.paused=true;b.s.t=5;b.s.enemyDue=7;
  const all=[...b.s.decks[0].draw,...b.s.decks[0].hand],guard=all.find(c=>c.key==='guard'),old=b.s.decks[0].hand.find(c=>c.id!==guard.id);
  if(!b.s.decks[0].hand.includes(guard)){const index=b.s.decks[0].draw.indexOf(guard);b.s.decks[0].draw[index]=old;b.s.decks[0].hand[b.s.decks[0].hand.indexOf(old)]=guard;}
  b.get('a1').hp=b.get('a1').max*.6;decide(b,'adaptive');assert(b.s.ready&&b.s.waiting);assert.equal(b.s.stats.waits,1);
}
{
  const b=battle();b.s.ready=true;b.s.paused=true;b.s.t=5;b.s.enemyDue=100;
  const hand=b.s.decks[0].hand;hand.splice(0,hand.length,...['shot','dash','heavy','cleave','volley'].map((key,i)=>({id:'attack-'+i,key,actor:'a'+D.cards[key].role})));
  b.get('a1').hp=b.get('a1').max*.3;b.s.events.push({side:1,actor:'e0',target:'a1',kind:'attack',power:57,at:6,name:'위험한 예고'});
  decide(b,'adaptive');assert.equal(b.s.stats.rerolls,1);assert.equal(b.s.rerolls,1);
}
{
  for(const build of Object.keys(builds)){const c=new C.Campaign();setBuild(c,build);assert.equal(D.validateDeck(c.meta.deck,c.meta.owned),'');assert.equal(c.meta.owned.length,52);}
  const cases=Array.from({length:8},(_,i)=>expedition(i+1,'mixed','safe'));
  assert(cases.some(c=>c.meta.lastReport.success),'an actual expedition must complete');
  assert(cases.reduce((n,c)=>n+c.audit.swaps,0)>0,'reward cards must change actual decks');
  assert(cases.reduce((n,c)=>n+c.audit.newCommands,0)>0,'newly acquired card copies must be used in actual combat');
  assert(cases.reduce((n,c)=>n+c.audit.stances,0)>0,'adaptive strategy must use stances');
  for(const c of cases)C.validateSave(c.snapshot());
  const before=expedition(4,'mixed','safe',{strategy:'immediate'});assert(before.meta.lastReport.results.every(r=>r.stats.waits===0&&r.stats.rerolls===0));
  for(const feature of ['wait','reroll','stances']){
    const isolated=expedition(3,'mixed','safe',{[feature]:false}),field={wait:'waits',reroll:'rerolls',stances:'stanceChanges'}[feature];
    assert(isolated.meta.lastReport.results.every(r=>r.stats[field]===0),'independent removal '+feature);
  }
  const copy=expedition(3,'mixed','safe');const same=expedition(3,'mixed','safe');assert.deepEqual(copy.meta.lastReport,same.meta.lastReport);assert.deepEqual(copy.audit,same.audit);
}
console.log('PASS: purposeful waiting/redraw, three legal comparison decks, acquired-copy combat use, deck adaptation, stance changes and deterministic strategy comparison.');
