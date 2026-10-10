'use strict';
const assert=require('node:assert/strict');
const {Run,CONTENT_VERSION}=require('./party-expedition-voyage.js');
const {ENEMIES}=require('./party-expedition-encounters.js');
const Bestiary=require('./party-expedition-bestiary.js');
const party=['navigator','diver','pilot','lightkeeper'];let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
test('도감은 모든 조우의 이름과 대응 정보를 제공한다',()=>{
  for(const [pattern,enemy]of Object.entries(ENEMIES)){const entry=Bestiary.lookup(pattern);assert.equal(entry.name,enemy.name);assert.ok(entry.threat.length>0);assert.ok(entry.counter.length>0);}
});
test('초반 전투 안내는 실제 예고 대상·피해를 읽고 상태를 변경하지 않는다',()=>{
  const run=new Run({seed:100,contentVersion:CONTENT_VERSION,party});run.chooseBlessing(run.s.blessings[0]);run.choosePath(0);
  const before=run.battle.snapshot(),hint=Bestiary.coach(run.battle);
  assert.ok(hint.intents.length);assert.ok(hint.prompt.length);assert.ok(hint.threatened.every(x=>x.damage===run.battle.incomingDamage(run.battle.s.allies.find(a=>a.name===x.ally).id)));
  assert.deepEqual(run.battle.snapshot(),before);
});
test('실제 방문 경로로 발견한 적을 복원 후에도 구분한다',()=>{
  const run=new Run({seed:101,contentVersion:CONTENT_VERSION,party});
  run.chooseBlessing(run.s.blessings[0]);const available=run.s.choices[0];run.choosePath(0);
  const patterns=run.s.route.enemies.map(e=>e.pattern),visited=run.s.map.trail.map(id=>run.s.map.nodes.find(n=>n.id===id)?.route).filter(Boolean).flatMap(r=>r.enemies.map(e=>e.pattern));
  const restored=Run.restore(run.snapshot()),restoredVisited=restored.s.map.trail.map(id=>restored.s.map.nodes.find(n=>n.id===id)?.route).filter(Boolean).flatMap(r=>r.enemies.map(e=>e.pattern));
  assert.deepEqual(visited,patterns);assert.deepEqual(restoredVisited,patterns);assert.ok(available.enemies.length);
});
test('전투 복기는 실제 카드 사용·피해·흡수·쓰러짐을 합산해 저장한다',()=>{
  const run=new Run({seed:102,contentVersion:CONTENT_VERSION,party});run.chooseBlessing(run.s.blessings[0]);run.choosePath(0);
  const b=run.battle,ally=b.s.allies[0],enemy=b.s.enemies[0];
  b.s.events=[{type:'card',card:b.s.zones.hand[0],actor:party[0]}];run.syncBattle();
  b.s.events=[];b.shield(ally.id,5);b.hit(ally.id,9,{source:enemy.id});run.syncBattle();
  assert.equal(run.s.battleReview.damageTaken,4);assert.equal(run.s.battleReview.damageAbsorbed,5);
  b.s.events=[];b.hit(enemy.id,7,{source:'r1'});b.heal(ally.id,2);b.s.events.push({type:'enemy-ward',actor:enemy.id,target:enemy.id,amount:3});run.syncBattle();
  assert.equal(run.s.battleReview.damageDealt,7);assert.equal(run.s.battleReview.healing,2);assert.equal(run.s.battleReview.enemySupport,3);
  b.s.events=[];ally.hp=0;b.s.events.push({type:'downed',target:ally.id});run.syncBattle();
  assert.deepEqual(run.s.battleReview.downs,[ally.name]);
  b.s.allies.forEach(a=>a.hp=0);b.finish();run.syncBattle();
  assert.equal(run.s.phase,'lost');const review=run.s.history.at(-1).review;
  assert.equal(review.damageTaken,4);assert.equal(review.damageAbsorbed,5);assert.equal(review.damageDealt,7);assert.equal(review.healing,2);assert.equal(review.enemySupport,3);assert.ok(Object.values(review.cards).reduce((a,n)=>a+n,0)>=1);
  assert.deepEqual(Run.restore(run.snapshot()).s.history.at(-1).review,review);
});
console.log(`${checks} onboarding checks passed`);
