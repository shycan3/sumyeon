'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const Voyage=require('./party-expedition-voyage.js');
const Simulation=require('./party-expedition-simulation.js');
const Automation=require('./party-expedition-automation.js');
const {Run}=Voyage;
const Encounters=require('./party-expedition-encounters.js');
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const gameplayHash=value=>{const copy=JSON.parse(JSON.stringify(value));delete copy.battleReview;return hash(copy);};
const party=['navigator','diver','pilot','lightkeeper'];

// Recorded before the voyage-2 implementation. These fingerprints protect the
// authored voyage-1 map, initial RNG streams, card copies and first public turn.
// They are not generated from the new implementation during the assertion.
const legacyFingerprints=[
  ['voyage-balance-2','normal','e987d296d9d8df8d622ff999f7914bb24fe8a670bf9df441e324d0bdfb7a8efe','57365bfbc92d18d2b9478592cc71c81cb14dcfc9c008b3990ba17323c021483d'],
  ['voyage-balance-2','calm','6467df45eb2a55fa15c691944769d8f9c71e6bb60dcb0d16233c8a405efd573a','cdf00b323cb528aaf77c9720dccfdf0f074b021bc69572fd2b5a142f5be8876d'],
  ['voyage-balance-1','normal','a01b480a1dec62272fb61a20fa0b6aa0e51eff16b6912db22c1fe376a53707e8','330eda37e3f75011e9a81854a0dddcdad2fdeb86e6f53233b21f6a01a12e04ce'],
  ['voyage-balance-1','calm','77359e36dc3f3202308306c13d18a55f01e59bc1b479824564cab3d84be272a7','bc4fe68c94232fae055bc442eb91fd98716d7445d4738040dafe6cf1aef892e2'],
  ['voyage-balance-0','normal','009ce9f6c6852e2c45e3a38a6d7bf2309ebd491554b980d2910c0969baddfa76','c930679f07c384428ab61c448b839461b8dcfc88e0a6d09f0ae6997705fc95f9'],
  ['voyage-balance-0','calm','42e8585ba9afba064e2145625f817202a1e1633270d9fc462a386afccbb4dc62','74daf387d8c28c770f6450869220be948db4ef72b04719e6cd17a79d41c9bc91']
];

test('규칙 0·1·2의 기존 원정 지도·시작 덱·난수·첫 공개 전투를 그대로 유지한다',()=>{
  for(const [balanceVersion,difficulty,initial,battle]of legacyFingerprints){
    const r=new Run({seed:31,contentVersion:'voyage-1',balanceVersion,difficulty});
    assert.equal(gameplayHash(r.snapshot()),initial,balanceVersion+' '+difficulty+' 초기');
    r.chooseBlessing(r.s.blessings[0]);r.choosePath(0);
    assert.equal(gameplayHash(r.snapshot()),battle,balanceVersion+' '+difficulty+' 전투');
    assert.deepEqual(Run.restore(r.snapshot()).snapshot(),r.snapshot());
  }
});

test('밸런스 표식 없는 기존 저장과 draft 저장에 신규 조우가 섞이지 않는다',()=>{
  const r=new Run({seed:31,contentVersion:'voyage-1',balanceVersion:Voyage.LEGACY_BALANCE_VERSION});
  const stored=r.snapshot();delete stored.balanceVersion;
  assert.deepEqual(Run.restore(stored).snapshot(),stored);
  const restored=Run.restore(stored);restored.chooseBlessing(restored.s.blessings[0]);restored.choosePath(0);
  const battle=restored.snapshot();delete battle.battle.voyage.balanceVersion;
  assert.deepEqual(Run.restore(battle).snapshot(),battle);
  const old=new Run({seed:31,contentVersion:'draft-1'}),oldState=old.snapshot();
  assert.deepEqual(Run.restore(oldState).snapshot(),oldState);
});

test('새 원정은 콘텐츠 2를 사용하고 카드·에너지·기존 시작 선택을 보존한다',()=>{
  const current=new Run({seed:31,party}),old=new Run({seed:31,party,contentVersion:'voyage-1'});
  assert.equal(current.s.contentVersion,'voyage-2');
  assert.equal(current.s.balanceVersion,Voyage.BALANCE_VERSION);
  assert.equal(Simulation.normalize().contentVersion,'voyage-2');
  assert.equal(Simulation.normalize({contentVersion:'voyage-1'}).contentVersion,'voyage-1');
  assert.deepEqual(current.s.deck,old.s.deck);assert.deepEqual(current.s.allies,old.s.allies);
  assert.deepEqual(current.s.blessings,old.s.blessings);
  current.chooseBlessing(current.s.blessings[0]);current.choosePath(0);
  assert.equal(current.battle.s.energy,4);
  assert.equal(current.battle.s.zones.hand.length,5);
  assert.equal(current.battle.s.voyage.contentVersion,'voyage-2');
});

test('90개 시드의 같은 구역에 중복 조우가 없고 세 보스와 신규 적이 공개된다',()=>{
  const bosses={},seen=new Set();
  for(let seed=0;seed<90;seed++){
    const r=new Run({seed,party}),map=r.mapView(),combatNodes=map.nodes.filter(n=>n.entry&&n.route.enemies.length);
    assert.equal(map.nodes.filter(n=>n.type==='boss').length,1);
    for(let floor=0;floor<7;floor++){
      const nodes=combatNodes.filter(n=>n.floor===floor),signatures=nodes.map(n=>n.route.enemies.map(e=>e.pattern).sort().join('+'));
      assert.equal(new Set(signatures).size,signatures.length,'구역 '+floor+' seed '+seed);
      assert.equal(nodes.length,[2,4].includes(floor)?2:3);
      for(const n of nodes){
        assert.ok(n.route.enemies.length<=2);
        assert.equal(n.type,[3,6].includes(floor)?'elite':'battle');
        assert.equal(n.route.encounterId,n.route.enemies.map(e=>e.pattern).sort().join('+'));
        for(const e of n.route.enemies){
          seen.add(e.pattern);assert.ok(Encounters.ENEMIES[e.pattern]);
          assert.ok(Number.isInteger(e.hp)&&e.hp>0&&Number.isInteger(e.damage)&&e.damage>0);
          assert.ok(n.route.description.includes(e.name+' HP '+e.hp));
          if(['warder','mender'].includes(e.pattern))assert.equal(n.route.enemies.length,2,'지원자를 단독 조우로 배치하지 않는다');
        }
      }
    }
    const boss=combatNodes.find(n=>n.type==='boss');
    assert.equal(boss.floor,7);assert.equal(boss.route.enemies.length,2);
    assert.equal(r.s.bossName,boss.label);assert.equal(boss.route.name,boss.label);
    assert.equal(boss.label,boss.route.enemies[0].name);
    assert.equal(map.nodes.some(n=>n.id===boss.id+'-stop'),false);
    bosses[boss.route.enemies[0].pattern]=(bosses[boss.route.enemies[0].pattern]||0)+1;
    r.assert();
  }
  for(const pattern of ['warder','mender','pursuer','relay'])assert.ok(seen.has(pattern),pattern+' 누락');
  for(const pattern of ['boss','tideheart','abyssjudge'])assert.ok(bosses[pattern]>=15,pattern+' 보스가 한 시드군에 지나치게 편중됨');
  console.log('BOSS_COVERAGE '+JSON.stringify(bosses));
});

test('신규 조우는 기존 지도 연결·8구역·우회 사건·정비 지점을 유지한다',()=>{
  for(let seed=0;seed<24;seed++){
    const current=new Run({seed,contentVersion:'voyage-2'}),old=new Run({seed,contentVersion:'voyage-1'});
    assert.deepEqual(current.s.map.edges,old.s.map.edges);
    assert.deepEqual(current.s.map.nodes.map(n=>[n.id,n.floor,n.lane]),old.s.map.nodes.map(n=>[n.id,n.floor,n.lane]));
    for(const [floor,lane,event]of [[2,2,'observatory'],[4,0,'cache']]){
      const id=`f${floor}-path${lane}`,n=current.s.map.nodes.find(n=>n.id===id);
      assert.equal(n.type,'event');assert.equal(n.route.event,event);assert.equal(n.route.enemies.length,0);
      assert.ok(current.s.map.edges.some(e=>e.from===id));
      assert.equal(current.s.map.nodes.some(x=>x.id===id+'-stop'),false);
      assert.equal(current.s.map.edges.some(e=>e.from===id+'-stop'||e.to===id+'-stop'),false);
    }
  }
});

test('조우 추첨과 지도 열람은 전투·보상 난수를 소비하지 않고 같은 시드로 재현한다',()=>{
  for(let seed=0;seed<24;seed++){
    const current=new Run({seed,contentVersion:'voyage-2'}),old=new Run({seed,contentVersion:'voyage-1'});
    assert.equal(current.s.seed,old.s.seed);assert.equal(current.s.rewardSeed,old.s.rewardSeed);
    assert.deepEqual(current.s.blessings,old.s.blessings);
    const before=current.snapshot();for(let i=0;i<3;i++)current.mapView();
    assert.deepEqual(current.snapshot(),before);assert.deepEqual(Run.restore(before).snapshot(),before);
    assert.deepEqual(new Run({seed,contentVersion:'voyage-2'}).snapshot(),before);
    for(const context of ['battle','elite','shop','event'])assert.deepEqual(current.rollRewards(context),old.rollRewards(context));
    assert.equal(current.s.seed,old.s.seed);assert.equal(current.s.rewardSeed,old.s.rewardSeed);
  }
});

test('난이도 조정 후 최신 HP·공격 상향을 단 한 번 적용하고 저장에서 재적용하지 않는다',()=>{
  const covered=new Set();
  for(let seed=0;seed<12;seed++)for(const difficulty of ['normal','calm']){
    const base=new Run({seed,difficulty,contentVersion:'voyage-2',balanceVersion:Voyage.PREVIOUS_BALANCE_VERSION});
    const current=new Run({seed,difficulty,contentVersion:'voyage-2',balanceVersion:Voyage.BALANCE_VERSION});
    for(const n of current.s.map.nodes.filter(n=>n.route?.enemies.length)){
      const before=base.s.map.nodes.find(x=>x.id===n.id);
      assert.deepEqual(n.route.enemies.map(e=>e.pattern),before.route.enemies.map(e=>e.pattern));
      for(let i=0;i<n.route.enemies.length;i++){
        const e=n.route.enemies[i],old=before.route.enemies[i];covered.add(e.pattern);
        assert.equal(e.hp,Math.round(old.hp*1.15));assert.equal(e.damage,Math.ceil(old.damage*1.1));assert.equal(e.areaDamage,Math.ceil(old.areaDamage*1.1));
      }
    }
    const saved=current.snapshot();assert.deepEqual(Run.restore(saved).snapshot(),saved);
  }
  for(const pattern of Object.keys(Encounters.ENEMIES))assert.ok(covered.has(pattern),pattern+' 상향 검산 누락');
});

test('새 전투의 오토는 비공개 손패 순서·난수에 의존하거나 선택 중 상태를 바꾸지 않는다',()=>{
  for(let seed=0;seed<8;seed++){
    const r=new Run({seed,party});r.chooseBlessing(r.s.blessings[0]);r.choosePath(0);
    const original=r.snapshot(),other=Run.restore(original);
    other.battle.s.zones.draw.reverse();other.battle.s.seed=(other.battle.s.seed^0x76543210)>>>0;
    for(const policy of ['balanced','aggressive','cautious'])assert.deepEqual(Automation.decide(r,{policy}),Automation.decide(other,{policy}));
    assert.deepEqual(r.snapshot(),original);
  }
});

let completed;
test('실제 새 원정 18회는 중간 저장·복원·공개 조우·피해 회계와 종료를 보존한다',()=>{
  completed=[];
  for(let seed=101;seed<107;seed++)for(const p of Simulation.STANDARD_PARTIES){
    const config={seed,party:p,policy:'balanced',contentVersion:'voyage-2'},r=new Run(config);
    r.setToolPolicy('emergency');let steps=0;
    while(!['won','lost'].includes(r.s.phase)&&steps++<1500){
      const before=r.snapshot();const restored=Run.restore(before);
      assert.deepEqual(restored.snapshot(),before);
      assert.deepEqual(Automation.decide(r,{policy:'balanced'}),Automation.decide(restored,{policy:'balanced'}));
      Automation.step(r,{policy:'balanced',toolPolicy:'emergency'});r.assert();
    }
    assert.ok(['won','lost'].includes(r.s.phase),'원정 미종료 seed '+seed);
    const record=Simulation.simulate(config);assert.equal(record.status,r.s.phase);
    assert.deepEqual(record.final.deck,r.s.deck);assert.deepEqual(record.final.allies,r.s.allies);
    assert.ok(record.battles.every(b=>b.healthAccounting.matches));
    assert.equal(Simulation.replay(record).matches,true);
    completed.push(record);
  }
  assert.equal(completed.length,18);
});

test('콘텐츠·밸런스 버전 없는 기존 로그 명령은 기존 원정으로 재생된다',()=>{
  for(const balanceVersion of Voyage.BALANCE_VERSIONS){
    const record=Simulation.simulate({seed:31,party,contentVersion:'voyage-1',balanceVersion});
    const exported=copy(record);delete exported.config.contentVersion;
    if(balanceVersion===Voyage.LEGACY_BALANCE_VERSION)delete exported.config.balanceVersion;
    assert.equal(Simulation.replay(exported).matches,true);
  }
});

test('업데이트 전 저장한 규칙 0·1·2의 실제 원정 로그를 기존 결과로 재생한다',()=>{
  function firstRecord(file){
    const handle=fs.openSync(file,'r'),parts=[];let count=0;
    try{
      while(true){
        const block=Buffer.alloc(65536),size=fs.readSync(handle,block,0,block.length,null);
        assert.ok(size,'원정 로그 첫 줄 누락');const used=block.subarray(0,size),end=used.indexOf(10);
        parts.push(end>=0?used.subarray(0,end):used);count+=size;
        assert.ok(count<16*1024*1024,'단일 원정 로그 읽기 상한');
        if(end>=0)return JSON.parse(Buffer.concat(parts).toString('utf8'));
      }
    }finally{fs.closeSync(handle);}
  }
  for(const [folder,balanceVersion]of [['balance-patch-1-before','voyage-balance-0'],['balance-patch-1-after','voyage-balance-1'],['enemy-buff-2-after','voyage-balance-2']]){
    const file=path.join(__dirname,'study-results',folder,'runs.jsonl'),record=firstRecord(file);
    assert.equal(record.contentVersion,'voyage-1');
    assert.equal(record.config.balanceVersion||Voyage.LEGACY_BALANCE_VERSION,balanceVersion);
    const replay=Simulation.replay(record);assert.equal(replay.matches,true,folder);
    assert.equal(replay.snapshot.contentVersion,'voyage-1');
  }
});

console.log(JSON.stringify({checks,expeditions:completed.length,wins:completed.filter(r=>r.status==='won').length,losses:completed.filter(r=>r.status==='lost').length,battles:completed.reduce((n,r)=>n+r.battles.length,0),result:'all passed'},null,2));
