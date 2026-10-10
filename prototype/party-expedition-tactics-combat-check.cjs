'use strict';
const assert=require('node:assert/strict');
const {Battle}=require('./party-expedition-core.js');
require('./party-expedition-voyage-combat.js');
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const party=['navigator','diver','pilot','lightkeeper'];
const enemy=(id,pattern='hunter',hp=60,more={})=>({id,pattern,hp,damage:6,areaDamage:3,...more});
function battle(enemies,more={}){return new Battle({party,seed:32,enemies,deck:Array.from({length:12},(_,i)=>({id:'c'+i,kind:i%2?'strike':'guard'})),...more});}
function advance(b){if(b.s.needsTrim)b.discardForSounder(b.s.zones.hand[0]);return b.endRound();}
function shieldParty(b){b.s.allies.filter(a=>a.hp>0).forEach(a=>{a.hp=a.max;a.shield=99;});}
const intent=(b,id)=>b.s.intents.find(i=>i.actor===id);

test('동료 보호는 공개 시 부여되지 않고 실행 뒤 다음 플레이 라운드에 남는다',()=>{
  const b=battle([enemy('ward','warder'),enemy('hunter')]);
  assert.equal(intent(b,'ward').type,'ward');assert.equal(intent(b,'ward').target,'hunter');assert.equal(b.actor('hunter').shield,0);
  b.actor('hunter').shield=9;const events=advance(b);
  assert.equal(b.actor('hunter').shield,7);assert.deepEqual(events.find(e=>e.type==='enemy-ward'),{type:'enemy-ward',actor:'ward',target:'hunter',amount:7});
  assert.equal(intent(b,'ward').type,'attack');advance(b);assert.equal(b.actor('hunter').shield,0);
});
test('보호 대상이 죽으면 다른 동료·자신으로 재표적하지 않는다',()=>{
  const b=battle([enemy('ward','warder'),enemy('strong','hunter',12,{damage:10}),enemy('spare','hunter')]);
  assert.equal(intent(b,'ward').target,'strong');b.hit('strong',12);const events=advance(b);
  assert.ok(events.some(e=>e.type==='intent-canceled'&&e.actor==='ward'&&e.target==='strong'));
  assert.equal(b.actor('ward').shield,0);assert.equal(b.actor('spare').shield,0);
});
test('지원자가 준비 중 사망하면 지원을 실행하지 않고 혼자인 파수는 자신을 보호한다',()=>{
  const b=battle([enemy('ward','warder',10),enemy('hunter')]);b.hit('ward',10);const events=advance(b);
  assert.ok(!events.some(e=>e.type==='enemy-ward'));
  const solo=battle([enemy('ward','warder')]);assert.equal(intent(solo,'ward').target,'ward');advance(solo);assert.equal(solo.actor('ward').shield,7);
});
test('회복 준비는 고정된 부상 동료·회복량을 공개하며 저장 뒤 그대로 실행된다',()=>{
  const b=battle([enemy('mender','mender'),enemy('injured','hunter',35,{max:60}),enemy('other','hunter',45,{max:60})]);
  const announced=intent(b,'mender');assert.equal(announced.type,'prepare');assert.equal(announced.nextType,'heal');assert.equal(announced.nextTarget,'injured');assert.equal(announced.nextAmount,8);assert.equal(b.intentDamage(announced),0);
  b.actor('other').hp=1;const restored=Battle.restore(b.snapshot());advance(b);advance(restored);assert.deepEqual(restored.snapshot(),b.snapshot());
  assert.equal(intent(b,'mender').target,'injured');assert.equal(intent(b,'mender').amount,8);assert.equal(b.actor('injured').hp,35);
  shieldParty(b);shieldParty(restored);const events=advance(b);advance(restored);assert.deepEqual(restored.snapshot(),b.snapshot());
  assert.equal(b.actor('injured').hp,43);assert.equal(b.actor('other').hp,1);assert.ok(events.some(e=>e.type==='enemy-heal'&&e.target==='injured'&&e.amount===8));
});
test('회복은 사망 동료를 부활시키지 않으며 표적 사망으로 준비 내용을 바꾸지 않는다',()=>{
  const b=battle([enemy('mender','mender'),enemy('injured','hunter',5,{max:60}),enemy('spare','hunter',50,{max:60})]);
  b.hit('injured',5);advance(b);assert.equal(intent(b,'mender').target,'injured');const events=advance(b);
  assert.equal(b.actor('injured').hp,0);assert.equal(b.actor('spare').hp,50);assert.ok(events.some(e=>e.type==='intent-canceled'&&e.intentType==='heal'));
});
test('회복 실적은 최대 HP에 제한되며 지원에 약화·브레이크 피해 감소를 소비하지 않는다',()=>{
  const b=battle([enemy('mender','mender'),enemy('injured','hunter',59,{max:60})],{breakMode:'on'});
  const m=b.actor('mender');m.weak=4;m.broken=true;m.toughness=0;m.breakBonusArmed=true;
  assert.equal(b.intentDamage(intent(b,'mender')),0);advance(b);assert.equal(m.weak,4);assert.equal(b.intentDamage(intent(b,'mender')),0);
  const events=advance(b);assert.equal(m.weak,4);assert.ok(events.some(e=>e.type==='enemy-heal'&&e.amount===1));assert.equal(b.actor('injured').hp,60);
  const ward=battle([enemy('ward','warder')],{breakMode:'on'});ward.actor('ward').weak=5;ward.actor('ward').broken=true;ward.actor('ward').toughness=0;ward.actor('ward').breakBonusArmed=true;
  advance(ward);assert.equal(ward.actor('ward').shield,7);assert.equal(ward.actor('ward').weak,5);
});
test('추적자의 두 표적은 공개 단계에서 확정되고 각자 막고 반격한다',()=>{
  const b=battle([enemy('pursuer','pursuer')]);const i=intent(b,'pursuer');assert.equal(i.type,'volley');assert.equal(i.targets.length,2);assert.equal(new Set(i.targets).size,2);
  const [first,second]=i.targets;b.actor(first).shield=6;b.actor(first).reaction=5;
  assert.equal(b.incomingDamage(first),6);assert.equal(b.incomingDamage(second),6);assert.equal(b.incomingDamage('pilot'),0);
  const events=advance(b);assert.equal(b.actor(first).hp,30);assert.equal(b.actor(second).hp,24);assert.equal(b.actor('pursuer').hp,55);
  assert.equal(events.filter(e=>e.type==='damage'&&e.source==='pursuer').length,2);assert.equal(events.filter(e=>e.type==='reaction').length,1);assert.equal(intent(b,'pursuer').type,'area');
});
test('분산 타격은 사망한 고정 표적만 건너뛰고 나머지 생존자에게 재표적하지 않는다',()=>{
  const b=battle([enemy('pursuer','pursuer')]);const [first,second]=intent(b,'pursuer').targets;const spared=b.s.allies.filter(a=>![first,second].includes(a.id));b.actor(first).hp=0;
  assert.deepEqual(b.intentTargets(intent(b,'pursuer')),[second]);assert.equal(b.incomingDamage(first),0);advance(b);
  assert.equal(b.actor(second).hp,24);assert.ok(spared.every(a=>a.hp===30));
});
test('분산 타격 약화·브레이크는 각 타격에 적용하고 모두 불발하면 약화를 보존한다',()=>{
  const b=battle([enemy('pursuer','pursuer')],{breakMode:'on'}),e=b.actor('pursuer');e.weak=2;e.broken=true;e.toughness=0;e.breakBonusArmed=true;
  const targets=[...intent(b,'pursuer').targets];assert.equal(b.intentDamage(intent(b,'pursuer')),2);advance(b);assert.ok(targets.every(id=>b.actor(id).hp===28));assert.equal(e.weak,0);
  const canceled=battle([enemy('pursuer','pursuer')]);canceled.actor('pursuer').weak=3;intent(canceled,'pursuer').targets.forEach(id=>{canceled.actor(id).hp=0;});advance(canceled);assert.equal(canceled.actor('pursuer').weak,3);
});
test('분산 타격은 한 행동 안의 모든 생존 표적 타격 뒤 반격을 처리한다',()=>{
  const b=battle([enemy('pursuer','pursuer',5)]),[first,second]=intent(b,'pursuer').targets;b.actor(first).shield=6;b.actor(first).reaction=8;
  advance(b);assert.equal(b.actor(second).hp,24);assert.equal(b.s.status,'won');
});
test('연결 감시자는 보호→공격→광역 예고→고정 광역 실행을 반복한다',()=>{
  const b=battle([enemy('relay','relay'),enemy('hunter')]);assert.equal(intent(b,'relay').type,'ward');
  for(const expected of ['attack','prepare','area','ward']){shieldParty(b);advance(b);assert.equal(intent(b,'relay').type,expected);}
});
test('집행자의 반절 HP 국면은 현재 의도를 바꾸지 않고 다음 공개에서 전환한다',()=>{
  const b=battle([enemy('judge','abyssjudge',100)]);const initial=JSON.stringify(intent(b,'judge'));assert.equal(b.actor('judge').phase,'surface');
  b.hit('judge',50);assert.equal(b.actor('judge').phase,'surface');assert.equal(JSON.stringify(intent(b,'judge')),initial);
  const restored=Battle.restore(b.snapshot());advance(b);advance(restored);assert.deepEqual(restored.snapshot(),b.snapshot());
  assert.equal(intent(b,'judge').phase,'submerged');assert.equal(intent(b,'judge').phaseChanged,true);assert.equal(intent(b,'judge').type,'volley');
  b.heal('judge',40);shieldParty(b);advance(b);assert.equal(intent(b,'judge').phase,'submerged');assert.equal(intent(b,'judge').phaseChanged,undefined);assert.equal(intent(b,'judge').nextType,'area');
});
test('국면 변경도 이미 공개된 준비를 취소·변경하지 않는다',()=>{
  const b=battle([enemy('judge','abyssjudge',100)]);advance(b);const announced=intent(b,'judge');assert.equal(announced.type,'prepare');assert.equal(announced.nextDamage,4);
  b.hit('judge',50);advance(b);assert.equal(intent(b,'judge').phase,'submerged');assert.equal(intent(b,'judge').type,'area');assert.equal(intent(b,'judge').damage,announced.nextDamage);
});
test('신규 다섯 패턴은 저장 복원과 실행이 일치하며 기다려도 공격력 증폭이 없다',()=>{
  for(const pattern of ['warder','mender','pursuer','relay','abyssjudge']){
    const b=battle([enemy('new',pattern,200)]);for(let round=0;round<12;round++){
      shieldParty(b);const restored=Battle.restore(b.snapshot());advance(b);advance(restored);assert.deepEqual(restored.snapshot(),b.snapshot());
      assert.equal(b.actor('new').damage,6);assert.equal(b.actor('new').areaDamage,3);assert.ok(b.s.intents.every(i=>(i.nextDamage||i.damage)<=6));
    }
  }
});
test('잘못된 분산 표적·지원 대상·회복 큐·국면 저장은 거부한다',()=>{
  const b=battle([enemy('new','pursuer')]),snapshot=b.snapshot();snapshot.intents[0].targets=['navigator','navigator'];assert.throws(()=>Battle.restore(snapshot));
  const ward=battle([enemy('new','warder')]).snapshot();ward.intents[0].target='navigator';assert.throws(()=>Battle.restore(ward));
  const mender=battle([enemy('new','mender')]).snapshot();mender.enemies[0].queuedIntent.amount=-1;assert.throws(()=>Battle.restore(mender));
  const divergent=battle([enemy('new','mender')]).snapshot();divergent.enemies[0].queuedIntent.amount=4;assert.throws(()=>Battle.restore(divergent));
  const nested=battle([enemy('new','mender')]).snapshot();nested.enemies[0].queuedIntent.type='prepare';assert.throws(()=>Battle.restore(nested));
  const boss=battle([enemy('new','abyssjudge')]).snapshot();boss.enemies[0].phaseRound=0;assert.throws(()=>Battle.restore(boss));
});
test('실행 특성 기여는 새 전투의 실제 보호·드로우 증가량만 기록한다',()=>{
  const make=contentVersion=>battle([enemy('hunter')],{voyage:{contentVersion,relics:[],tools:[],rule:'normal'}});
  const current=make('voyage-2'),previous=make('voyage-1');const card=current.s.zones.hand.find(id=>current.definition(id).kind==='guard')||current.s.zones.hand.find(id=>current.definition(id).shield);
  current.play(card,'lightkeeper','navigator');previous.play(card,'lightkeeper','navigator');
  assert.ok(current.s.events.some(e=>e.type==='ability-effect'&&e.actor==='lightkeeper'&&e.effect==='shield'&&e.amount===4));assert.ok(!previous.s.events.some(e=>e.type==='ability-effect'));
  const stripped=current.snapshot();stripped.voyage.contentVersion='voyage-1';stripped.events=stripped.events.filter(e=>e.type!=='ability-effect');assert.deepEqual(stripped,previous.snapshot());
  const sounderParty=['navigator','diver','sounder','lightkeeper'];
  const drawn=battle([enemy('hunter')],{party:sounderParty,voyage:{contentVersion:'voyage-2',relics:[],tools:[],rule:'normal'}});drawn.discardForSounder(drawn.s.zones.hand[0]);drawn.play(drawn.s.zones.hand[0],'sounder',drawn.definition(drawn.s.zones.hand[0]).target==='enemy'?'hunter':'navigator');assert.ok(drawn.s.events.some(e=>e.type==='ability-effect'&&e.effect==='draw'&&e.amount===1));
});
console.log('PASS '+checks+' tactical combat checks');
