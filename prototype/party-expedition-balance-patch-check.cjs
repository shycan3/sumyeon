'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),readline=require('node:readline');
const Voyage=require('./party-expedition-voyage.js'),{Battle}=require('./party-expedition-core.js');
const Simulation=require('./party-expedition-simulation.js');
const {BALANCE_VERSION:NEW,LEGACY_BALANCE_VERSION:OLD}=Voyage;
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
function make(version=NEW,tier='elite'){
  return new Battle({party:['navigator','diver','pilot','lightkeeper'],deck:[{id:'c',kind:'guard'}],
    enemies:[{id:'e',pattern:'twins',hp:500,damage:7,areaDamage:3}],
    voyage:{relics:[],tools:[],rule:'normal',...(version?{balanceVersion:version,encounterTier:tier}:{})},seed:1});
}
function cadence(b,n=8){const result=[];for(let i=0;i<n;i++){
  result.push({...b.s.intents[0]});b.s.allies.forEach(a=>a.shield=100);b.endRound();
}return result;}
test('정예만 준비 2턴·광역 3턴으로 이동하고 4턴 주기의 총 예고 피해는 유지',()=>{
  const old=cadence(make(OLD)),now=cadence(make());
  assert.deepEqual(old.map(i=>i.type),['attack','attack','prepare','area','attack','attack','prepare','area']);
  assert.deepEqual(now.map(i=>i.type),['attack','prepare','area','attack','attack','prepare','area','attack']);
  assert.equal(now[1].nextDamage,5);assert.equal(now[2].damage,5);
  const pressure=xs=>xs.slice(0,4).reduce((n,i)=>n+(i.type==='area'?i.damage*4:i.damage),0);
  assert.equal(pressure(now),pressure(old));
});
test('보스 동행·일반 조우·버전 없는 기존 전투는 기존 순서와 수치 보존',()=>{
  const expected=cadence(make(OLD));
  assert.deepEqual(cadence(make(NEW,'boss')),expected);
  assert.deepEqual(cadence(make(NEW,'battle')),expected);
  assert.deepEqual(cadence(make(null)),expected);
});
test('광역 준비 저장·복원 후에도 공개한 피해와 다음 실행이 동일',()=>{
  const b=make();b.s.allies.forEach(a=>a.shield=100);b.endRound();
  assert.equal(b.s.intents[0].type,'prepare');const restored=Battle.restore(b.snapshot());
  assert.deepEqual(restored.snapshot(),b.snapshot());b.endRound();restored.endRound();
  assert.deepEqual(restored.snapshot(),b.snapshot());assert.equal(b.s.intents[0].type,'area');
});
test('빨라진 광역도 실제 보호·약화·준비 중 처치로 대응할 수 있다',()=>{
  const guarded=make();guarded.s.allies.forEach(a=>a.shield=100);guarded.endRound();guarded.endRound();
  guarded.s.allies.forEach(a=>a.shield=0);guarded.play('c','lightkeeper','diver');
  const events=guarded.endRound(),hit=events.find(e=>e.type==='damage'&&e.target==='diver');
  assert.equal(hit.amount,0);assert.equal(hit.absorbed,5);
  const weak=make();weak.s.allies.forEach(a=>a.shield=100);weak.endRound();weak.endRound();
  weak.s.allies.forEach(a=>a.shield=0);weak.actor('e').weak=3;
  assert.deepEqual(weak.endRound().filter(e=>e.type==='damage').map(e=>e.amount),[2,2,2,2]);
  const killed=make();killed.s.allies.forEach(a=>a.shield=100);killed.endRound();
  killed.hit('e',500,{source:'navigator'});killed.finish();assert.equal(killed.s.status,'won');
});
test('브레이크 끔의 전투·강적·상점·사건·주제 후보에서 균형 탐사 제외',()=>{
  const r=new Voyage.Run({seed:31,breakMode:'off'});
  for(const context of ['battle','elite','shop','event'])for(let i=0;i<300;i++){
    const offers=r.rollRewards(context,i%2?'opening':undefined);
    assert.ok(!offers.includes('breaksurvey'));assert.equal(new Set(offers).size,3);
  }
});
test('브레이크 사용 및 기존 버전 후보에는 균형 탐사가 남고 효과를 바꾸지 않는다',()=>{
  for(const options of [{balanceVersion:OLD,breakMode:'off'},{balanceVersion:NEW,breakMode:'on'}]){
    const r=new Voyage.Run({seed:31,...options});let seen=false;
    for(let i=0;i<500;i++)if(r.rollRewards('battle').includes('breaksurvey'))seen=true;
    assert.ok(seen);const d=r.definition({kind:'breaksurvey',upgraded:false});
    assert.equal(d.damage,3);assert.equal(d.breakPower,3);
  }
});
test('후보 필터가 희귀도 추첨·희귀 보정·보상 난수 소비량을 바꾸지 않는다',()=>{
  const old=new Voyage.Run({seed:37,balanceVersion:OLD}),now=new Voyage.Run({seed:37});
  for(let i=0;i<100;i++){
    const context=['battle','elite','shop','event'][i%4];
    assert.deepEqual(now.rollRewards(context).map(k=>require('./party-expedition-core.js').CARDS[k].rarity),old.rollRewards(context).map(k=>require('./party-expedition-core.js').CARDS[k].rarity));
    assert.equal(now.s.rewardSeed,old.s.rewardSeed);assert.equal(now.s.rewardOffset,old.s.rewardOffset);
  }
});
test('버전 없는 원정 저장은 수정 없이 복원하고 다음 전투도 기존 규칙 사용',()=>{
  const saved=new Voyage.Run({seed:31,balanceVersion:OLD}).snapshot();delete saved.balanceVersion;
  const r=Voyage.Run.restore(saved);assert.deepEqual(r.snapshot(),saved);
  r.chooseBlessing(r.s.blessings[0]);r.choosePath(0);
  assert.equal(r.battle.s.voyage.balanceVersion,OLD);
});
test('새 실험은 버전을 기록하고 알 수 없는 버전은 거부',()=>{
  assert.equal(Simulation.normalize().balanceVersion,NEW);
  assert.throws(()=>Simulation.normalize({balanceVersion:'unknown'}));
  assert.throws(()=>new Voyage.Run({balanceVersion:'unknown'}));
});
(async()=>{
  const file=__dirname+'/study-results/balance-patch-1-before/runs.jsonl';
  const lines=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  let oldRecord;for await(const line of lines){if(line.trim()){oldRecord=JSON.parse(line);break;}}
  assert.ok(oldRecord);assert.equal(Simulation.replay(oldRecord).matches,true);
  checks++;console.log('PASS 패치 전 실제 원정의 명령 로그를 기존 규칙으로 정확 재생');
  console.log(`PASS ${checks} checks`);
})().catch(error=>{console.error(error);process.exitCode=1;});
