'use strict';
const assert=require('assert'),{D,C,B}=require('./simulation.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
function battle(strategy='hunt'){
  const c=new C.Campaign();c.start(12);return new B({seed:12,levels:c.run.levels,hp:c.run.hp,stances:c.run.stances,depth:0,elite:false,encounter:{...D.encounters[5],strategy},timing:'mixed',cards:c.run.deck.map(id=>c.run.pool.find(c=>c.id===id))});
}
{
  const c=new C.Campaign();c.start(2);const node=c.availableNodes()[0],before=clone(c.snapshot());
  assert(c.previewNode(node.id));assert.equal(c.run.stage,'map');assert.equal(c.run.current,null);assert.equal(c.battle,null);assert.deepEqual(clone(c.run.hp),before.run.hp);assert.equal(c.run.rng,before.run.rng);
  assert(c.startingStance(0));assert.equal(c.run.stances[0],1);assert(!c.startingStance(4));
  const restored=new C.Campaign(C.validateSave(clone(c.snapshot())));assert.equal(restored.run.previewId,node.id);assert(restored.cancelPreview());assert.equal(restored.run.previewId,null);
  assert(restored.chooseNode(node.id));assert.equal(restored.battle.get('a0').stance,1);
  const invalid=clone(before);invalid.run.previewId='not-reachable';assert.throws(()=>C.validateSave(invalid));
}
{
  const c=new C.Campaign();c.start(3);c.chooseNode(c.availableNodes()[0].id);c.battle.alive(1).forEach(a=>a.hp=0);c.battle.checkEnd();c.observeBattle();c.openReward();
  c.pickReward(c.run.reward.candidates[0]);const r=c.run,original=[...r.deck],newId=r.reward.cardId;
  assert(c.swapReward('bad-id'));assert.deepEqual(clone(r.deck),original);
  const out=original.find(id=>!D.validateDeck(original.map(x=>x===id?newId:x),r.pool));assert(out);assert.equal(c.swapReward(out),'');
  assert.equal(r.deck.length,20);assert(r.deck.includes(newId));assert(!r.deck.includes(out));
  const resumed=new C.Campaign(C.validateSave(clone(c.snapshot())));assert.equal(resumed.undoRewardSwap(),'');assert.deepEqual(clone(resumed.run.deck),original);assert(resumed.undoRewardSwap());
  assert.equal(resumed.swapReward(out),'');assert(resumed.completeNode());assert(resumed.undoRewardSwap());resumed.abandon();assert(resumed.meta.lastReport.journal.some(e=>e.kind==='swap'));C.validateSave(resumed.snapshot());
}
{
  const b=battle(),card={id:'test',actor:'e0',key:'heavy'};b.get('a1').hp=25;
  assert.equal(b.enemyTarget(card),'a1');b.s.strategy='duel';assert.equal(b.enemyTarget(card),'a3');
  b.s.taunts[0]={from:0,until:10,actor:'a0'};assert.equal(b.enemyTarget(card),'a0');
  const target=b.enemyTarget(card),score=b.enemyScore(card,target);b.s.selected='fake-selection';assert.equal(b.enemyScore(card,target),score);
}
{
  const b=battle('boss'),boss=b.get('e0'),pending={key:'quake',kind:'area',actor:boss.id,side:1,at:5,power:32,target:null,name:'붕괴의 파동'};
  b.s.events=[pending];const before=clone(pending),initial=b.enemyScore({key:'crush',actor:boss.id},'a2');
  b.damage(boss,boss.max*.6,0,'card',true,'heavy');assert.equal(b.s.phase,2);assert.deepEqual(clone(pending),before);
  assert(b.enemyScore({key:'crush',actor:boss.id},'a2')>initial);const phaseAt=b.s.phaseAt;boss.hp=boss.max;b.updatePhase();assert.equal(b.s.phase,2);assert.equal(b.s.phaseAt,phaseAt);
  const restored=new B({},b.snapshot());assert.equal(restored.s.phase,2);assert.deepEqual(clone(restored.s.events),clone(b.s.events));
}
{
  const b=battle();b.get('a0').x=40;b.get('a1').x=500;b.get('a2').x=850;b.get('a3').x=900;
  b.get('a1').hp=12;b.damage(b.get('a1'),30,1,'card',true,'crush');
  assert.equal(b.s.stats.received[1],12);assert.equal(b.review().enemyCards[0].damage,12);assert.equal(b.review().knockouts[0].cause,'crush');
  b.damage(b.get('a1'),30,1,'card',true,'crush');assert.equal(b.review().knockouts.length,1);
  const shield=b.get('a0'),friend=b.get('a2');shield.hp=1;shield.x=friend.x-20;shield.y=friend.y;shield.stance=0;
  b.damage(friend,10,1,'card',false,'shot');assert.equal(b.review().knockouts.at(-1).actor,'a0');assert(b.review().knockouts.at(-1).protected);assert.equal(b.s.stats.received[0],1);
  const before=clone(b.review()),restored=new B({},b.snapshot());assert.deepEqual(clone(restored.review()),before);
}
{
  const b=battle('boss'),legacy=clone(b.snapshot());
  delete legacy.stats.received;delete legacy.stats.byCard;delete legacy.knockouts;delete legacy.strategy;delete legacy.phase;delete legacy.phaseAt;
  const restored=new B({},legacy);assert(restored.review().partial);assert.equal(restored.doctrine().name,'상황 대응');
  restored.damage(restored.get('a2'),10,1,'card',true,'crush');assert.equal(restored.review().received[2],10);assert(restored.review().partial);
  const c=new C.Campaign();c.start(3);c.chooseNode(c.availableNodes()[0].id);c.battle.alive(1).forEach(a=>a.hp=0);c.battle.checkEnd();c.observeBattle();const invalid=clone(c.snapshot());
  invalid.run.results[0].review.enemyCards=[{key:'missing-card',damage:2}];assert.throws(()=>C.validateSave(invalid));
}
console.log('PASS: preview/starting stances without battle mutation, atomic reward swap/undo/resume, enemy doctrines/taunt, boss phase preserving pending attacks, factual damage/KO review and journals.');
