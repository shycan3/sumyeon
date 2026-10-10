'use strict';
const assert=require('node:assert/strict');
const Voyage=require('./party-expedition-voyage.js');
const Expansion=require('./party-expedition-voyage-combat.js');
const Base=require('./party-expedition-run.js');
const {Battle}=require('./party-expedition-core.js');
const Simulation=require('./party-expedition-simulation.js');
const CURRENT='voyage-balance-2',PREVIOUS='voyage-balance-1',LEGACY='voyage-balance-0';
const PARTY=['navigator','diver','pilot','lightkeeper'];
const clone=x=>JSON.parse(JSON.stringify(x));
const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
let checks=0,enemyComparisons=0;
function makeRun(balanceVersion=CURRENT,seed=31,difficulty='normal'){
  return new Voyage.Run({contentVersion:'voyage-1',balanceVersion,seed,difficulty,party:PARTY});
}
function mapEnemies(run){return run.s.map.nodes.filter(n=>n.route?.enemies.length);}
function makeBattle(enemy,version=CURRENT,tier='battle'){
  return new Battle({party:PARTY,deck:[{id:'r0',kind:'guard'}],enemies:[clone(enemy)],seed:1,
    voyage:{balanceVersion:version,encounterTier:tier,relics:[],tools:[],rule:'normal'}});
}
function protectAndEnd(b){b.s.allies.forEach(a=>a.shield=100);return b.endRound();}

test('새 원정 기본값과 실험 설정이 2차 버전을 쓰고 0·1·2를 모두 지원',()=>{
  assert.equal(Voyage.BALANCE_VERSION,CURRENT);
  assert.equal(Voyage.PREVIOUS_BALANCE_VERSION,PREVIOUS);
  assert.equal(Voyage.LEGACY_BALANCE_VERSION,LEGACY);
  assert.deepEqual([...Voyage.BALANCE_VERSIONS].sort(),[LEGACY,PREVIOUS,CURRENT]);
  assert.deepEqual(Expansion.BALANCE_VERSIONS,Voyage.BALANCE_VERSIONS);
  assert.equal(new Voyage.Run().s.balanceVersion,CURRENT);
  assert.equal(Simulation.normalize().balanceVersion,CURRENT);
  for(const version of [LEGACY,PREVIOUS,CURRENT])assert.equal(Simulation.normalize({balanceVersion:version}).balanceVersion,version);
  assert.throws(()=>Simulation.normalize({balanceVersion:'voyage-balance-999'}));
  assert.throws(()=>new Voyage.Run({balanceVersion:'voyage-balance-999'}));
});

test('짝·홀 시드와 보통·차분 난이도의 모든 일반·정예·보스·동행 적이 같은 비율로 강화',()=>{
  const patterns=new Set(),tiers=new Set();
  for(const seed of [31,32])for(const difficulty of ['normal','calm']){
    const old=makeRun(PREVIOUS,seed,difficulty),now=makeRun(CURRENT,seed,difficulty);
    assert.deepEqual(now.s.map.edges,old.s.map.edges);
    assert.deepEqual(now.s.blessings,old.s.blessings);
    assert.equal(now.s.seed,old.s.seed);
    assert.equal(now.s.rewardSeed,old.s.rewardSeed);
    for(const node of mapEnemies(now)){
      const before=old.s.map.nodes.find(n=>n.id===node.id);
      tiers.add(node.type);
      assert.equal(node.route.enemies.length,before.route.enemies.length);
      node.route.enemies.forEach((e,i)=>{
        const prior=before.route.enemies[i],label=`${seed}/${difficulty}/${node.id}/${e.pattern}`;
        patterns.add(e.pattern);enemyComparisons++;
        assert.equal(e.hp,Math.round(prior.hp*1.15),label+' HP');
        assert.equal(e.damage,prior.damage===0?0:Math.ceil(prior.damage*1.10),label+' 단일 공격');
        assert.equal(e.areaDamage,prior.areaDamage===0?0:Math.ceil(prior.areaDamage*1.10),label+' 전체 공격');
        assert.equal(e.toughnessMax,prior.toughnessMax,label+' 균형 유지');
        assert.equal(e.pattern,prior.pattern);
        assert.ok(node.route.description.includes(e.name+' HP '+e.hp),label+' 공개 HP');
        if(prior.damage>0)assert.ok(e.damage>prior.damage);
        if(prior.areaDamage>0)assert.ok(e.areaDamage>prior.areaDamage);
      });
    }
  }
  assert.deepEqual([...tiers].sort(),['battle','boss','elite']);
  assert.deepEqual([...patterns].sort(),['bellkeeper','boss','conductor','hunter','leech','sentinel','sweep','tideheart','twins']);
});

test('지도 생성에서 공격력 0인 항목은 0으로 보존',()=>{
  const original=Base.Run.prototype.enemy;
  try{
    Base.Run.prototype.enemy=function(...args){return {...original.apply(this,args),damage:0,areaDamage:0};};
    for(const version of [PREVIOUS,CURRENT]){
      const run=makeRun(version,32);
      for(const node of mapEnemies(run))for(const enemy of node.route.enemies){
        if(['bellkeeper','twins','tideheart'].includes(enemy.pattern))continue;
        // Base draft elite routes add their own attack values before this patch.
        if(node.type==='elite')continue;
        assert.equal(enemy.damage,0);assert.equal(enemy.areaDamage,0);
      }
    }
  }finally{Base.Run.prototype.enemy=original;}
});

test('지도 열람·저장 복원·실패한 선택에서 같은 적에게 강화가 재적용되지 않는다',()=>{
  const run=makeRun(),before=run.snapshot();
  for(let i=0;i<5;i++){
    run.mapView();
    assert.deepEqual(Voyage.Run.restore(before).snapshot(),before);
    assert.deepEqual(run.snapshot(),before);
  }
  assert.throws(()=>run.chooseBlessing('invalid'));
  assert.deepEqual(run.snapshot(),before);
  run.chooseBlessing(run.s.blessings[0]);
  const route=clone(run.s.choices[0]);run.choosePath(0);
  run.battle.s.enemies.forEach((enemy,i)=>{
    assert.equal(enemy.max,route.enemies[i].hp);
    assert.equal(enemy.hp,route.enemies[i].hp);
    assert.equal(enemy.damage,route.enemies[i].damage);
    assert.equal(enemy.areaDamage,route.enemies[i].areaDamage);
  });
});

test('현재·이전·버전 없는 기존 원정의 지도와 진행 중 전투 저장을 그대로 복원',()=>{
  for(const version of [LEGACY,PREVIOUS,CURRENT]){
    const run=makeRun(version),initial=run.snapshot();
    assert.deepEqual(Voyage.Run.restore(initial).snapshot(),initial);
    run.chooseBlessing(run.s.blessings[0]);run.choosePath(0);
    const active=run.snapshot(),restored=Voyage.Run.restore(active);
    assert.deepEqual(restored.snapshot(),active);
    assert.deepEqual(restored.battle.s.enemies,run.battle.s.enemies);
    protectAndEnd(run.battle);protectAndEnd(restored.battle);
    assert.deepEqual(restored.battle.snapshot(),run.battle.snapshot());
  }
  const old=makeRun(LEGACY).snapshot();delete old.balanceVersion;
  const run=Voyage.Run.restore(old);assert.deepEqual(run.snapshot(),old);
  run.chooseBlessing(run.s.blessings[0]);run.choosePath(0);
  assert.equal(run.battle.s.voyage.balanceVersion,LEGACY);
  const saved=run.snapshot();delete saved.battle.voyage.balanceVersion;
  assert.deepEqual(Voyage.Run.restore(saved).snapshot(),saved);
});

test('강화된 9종 패턴의 예고·준비 큐·다음 실행·실제 피격 수치가 일치',()=>{
  const representatives=new Map();
  for(const seed of [31,32])for(const node of mapEnemies(makeRun(CURRENT,seed))){
    for(const enemy of node.route.enemies)if(!representatives.has(enemy.pattern))representatives.set(enemy.pattern,{enemy,tier:node.type});
  }
  for(const [pattern,{enemy,tier}]of representatives){
    const b=makeBattle(enemy,CURRENT,tier);
    for(let round=0;round<12;round++){
      const intent=clone(b.s.intents[0]);
      if(intent.type==='prepare'){
        assert.equal(intent.damage,0,pattern+' 준비 즉시 피해');
        assert.deepEqual(b.s.enemies[0].queuedIntent,{type:intent.nextType,damage:intent.nextDamage,target:intent.nextTarget});
        const restored=Battle.restore(b.snapshot());
        protectAndEnd(restored);protectAndEnd(b);
        assert.deepEqual(b.snapshot(),restored.snapshot(),pattern+' 준비 저장 복원');
        assert.equal(b.s.intents[0].type,intent.nextType);
        assert.equal(b.s.intents[0].damage,intent.nextDamage,pattern+' 다음 실행 피해');
        assert.equal(b.s.intents[0].target,intent.nextTarget);
      }else{
        assert.equal(b.intentDamage(intent),intent.damage,pattern+' 공개 실피해');
        const hits=protectAndEnd(b).filter(e=>e.type==='damage'&&e.source===enemy.id);
        assert.equal(hits.length,intent.type==='area'?4:1,pattern+' 피격 대상 수');
        hits.forEach(hit=>{assert.equal(hit.amount,0);assert.equal(hit.absorbed,intent.damage,pattern+' 보호로 확인한 원래 피해');});
      }
    }
  }
});

test('이전·현재 모두 정예 감시자 2턴 준비·3턴 실행을 유지하고 보스 동행은 기존 순서 유지',()=>{
  for(const version of [PREVIOUS,CURRENT]){
    const run=makeRun(version),elite=mapEnemies(run).find(n=>n.type==='elite'&&n.route.enemies[0].pattern==='twins');
    const b=makeBattle(elite.route.enemies[0],version,'elite');
    assert.equal(b.s.intents[0].type,'attack');protectAndEnd(b);
    assert.equal(b.s.intents[0].type,'prepare');
    assert.equal(b.s.intents[0].nextDamage,elite.route.enemies[0].areaDamage+2);protectAndEnd(b);
    assert.equal(b.s.intents[0].type,'area');
    const companion=mapEnemies(run).find(n=>n.type==='boss').route.enemies.find(e=>e.pattern==='twins');
    const boss=makeBattle(companion,version,'boss');
    assert.equal(boss.s.intents[0].type,'attack');protectAndEnd(boss);
    assert.equal(boss.s.intents[0].type,'attack');protectAndEnd(boss);
    assert.equal(boss.s.intents[0].type,'prepare');protectAndEnd(boss);
    assert.equal(boss.s.intents[0].type,'area');
  }
});

test('이전·현재 보상 후보와 난수 소비가 같으며 브레이크 끔에서 균형 탐사 제외를 유지',()=>{
  const old=makeRun(PREVIOUS),now=makeRun(CURRENT);
  for(const context of ['battle','elite','shop','event'])for(let i=0;i<250;i++){
    const a=old.rollRewards(context),b=now.rollRewards(context);
    assert.deepEqual(a,b);assert.ok(!b.includes('breaksurvey'));
    assert.equal(old.s.rewardSeed,now.s.rewardSeed);
    assert.equal(old.s.rewardOffset,now.s.rewardOffset);
  }
  for(const version of [PREVIOUS,CURRENT]){
    const run=new Voyage.Run({seed:31,balanceVersion:version,breakMode:'on'});let found=false;
    for(let i=0;i<500;i++)if(run.rollRewards('battle').includes('breaksurvey'))found=true;
    assert.ok(found,version+' 브레이크 켬에서 해당 카드 유지');
  }
});
console.log(`PASS ${checks} checks; ${enemyComparisons} map enemy comparisons`);
