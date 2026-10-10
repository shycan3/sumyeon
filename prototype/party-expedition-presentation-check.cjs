'use strict';
const assert=require('node:assert/strict');
const {Battle}=require('./party-expedition-core.js');
require('./party-expedition-voyage-combat.js');
const P=require('./party-expedition-presentation.js');
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
function make(party=['navigator','diver','pilot','lightkeeper'],kinds=['guard','strike','guard','burst','strike','guard','strike','guard']){
  const b=new Battle({party,deck:kinds.map((kind,i)=>({id:'c'+i,kind})),enemies:[{id:'e',name:'위협',hp:200,damage:3,pattern:'hunter'},{id:'s',name:'지원자',hp:80,damage:2,pattern:'warder'}],seed:11,cardSet:'draft-1',voyage:{contentVersion:'voyage-2',balanceVersion:'voyage-balance-2',encounterTier:'battle',relics:[],tools:[],rule:'normal'}});
  b.s.zones={hand:kinds.slice(0,4).map((_,i)=>'c'+i),draw:kinds.slice(4).map((_,i)=>'c'+(i+4)),resolving:[],discard:[],reserve:[],exhaust:[]};b.s.needsTrim=false;return b;
}
const action=(b,card,actor,target)=>{const before=b.snapshot();b.play(card,actor,target);return P.contributions(before,b.snapshot(),Battle);};
const texts=(c,id)=>c.units[id]?.map(x=>x.text).join(' ')||'';
test('지원 대상·수치·준비 후 회복을 공격 피해와 구분',()=>{
  const b=make(),e=b.actor('s');b.s.intents=[{actor:'s',type:'ward',target:'e',damage:0,amount:7}];
  assert.equal(P.intentText(b,e),'→ 위협 · 보호 7');assert.equal(P.threatText(b,b.actor('navigator')),'');
  b.s.intents=[{actor:'s',type:'prepare',target:null,damage:0,nextType:'heal',nextTarget:'e',nextAmount:6}];
  assert.equal(P.intentText(b,e),'준비 · 다음 위협 회복 6');b.actor('e').hp=0;assert.equal(P.intentText(b,e),'준비 취소 · 대상 격파');
});
test('두 고정 대상의 공격·약화·아군별 보호 후 피해 표시',()=>{
  const b=make(),e=b.actor('e');e.weak=2;b.actor('navigator').shield=2;
  b.s.intents=[{actor:'e',type:'volley',target:null,targets:['navigator','pilot'],damage:7}];
  assert.match(P.intentText(b,e),/항해사·도선사 · 각 피해 5/);assert.equal(P.threatText(b,b.actor('navigator')),'받을 공격 5 · 보호 후 3');assert.equal(P.threatText(b,b.actor('diver')),'');
  b.actor('pilot').hp=0;assert.match(P.intentText(b,e),/항해사 · 각 피해 5/);assert.doesNotMatch(P.intentText(b,e),/잠수자/);
});
test('예고된 두 대상·국면 정보가 현재 피해에 더해지지 않음',()=>{
  const b=make(),e=b.actor('e');b.s.intents=[{actor:'e',type:'prepare',target:null,damage:0,nextType:'volley',nextTargets:['diver','lightkeeper'],nextDamage:8,phase:'submerged',phaseChanged:true}];
  assert.equal(P.intentText(b,e),'준비 · 다음 잠수자·등대지기 · 각 피해 8');assert.equal(P.threatText(b,b.actor('diver')),'');assert.equal(P.phaseText(b,e),'국면 전환 · 침수');
});
test('항해사 실행과 지속 특성이 첫 타격의 출처로 함께 표시',()=>{
  const b=make();b.play('c0','lightkeeper','navigator');const c=action(b,'c1','navigator','e');
  assert.match(texts(c,'navigator'),/연속 항로 · 첫 타격 \+2/);assert.match(texts(c,'navigator'),/선회 · 첫 타격 \+4/);assert.ok(c.links.some(l=>l.from==='navigator'&&l.to==='e'));
});
test('실제 추가 노출과 실제 에너지 환급만 표시',()=>{
  const b=make(),c=action(b,'c1','diver','e');assert.match(texts(c,'diver'),/침투 · 노출 \+4/);
  const next=action(b,'c3','pilot','e');assert.match(texts(next,'diver'),/심층 공명 · 에너지 \+1/);
  const before=b.snapshot(),after=b.snapshot();after.events=[{type:'card',card:'c2',actor:'navigator',target:'navigator',cost:1},{type:'energy',actor:'diver',amount:0}];assert.equal(texts(P.contributions(before,after,Battle),'diver'),'');
});
test('기존 카드의 노출 4와 겹친 침투는 추가 노출로 오인하지 않음',()=>{
  const b=make(undefined,['expose','strike','guard','burst','strike','guard','strike','guard']),c=action(b,'c0','diver','e');assert.equal(texts(c,'diver'),'');
});
test('도선사의 첫 고비용 지속 효과와 준비 후 실행 효과 표시',()=>{
  const b=make();b.play('c0','lightkeeper','navigator');b.play('c2','diver','navigator');b.s.energy=3;const c=action(b,'c3','pilot','e');
  assert.match(texts(c,'pilot'),/항로 개척 · 첫 타격 \+3/);assert.match(texts(c,'pilot'),/도선 · 첫 타격 \+5/);
});
test('측심사 실제 드로우 사본은 표시하고 빈 더미에서는 표시하지 않음',()=>{
  const party=['navigator','sounder','salvager','lightkeeper'],b=make(party),c=action(b,'c1','sounder','e');assert.match(texts(c,'sounder'),/정밀 관측 · 1장 뽑기/);assert.equal(Object.keys(c.cards).length,1);
  const empty=make(party);empty.s.zones.exhaust.push(...empty.s.zones.draw);empty.s.zones.draw=[];const none=action(empty,'c1','sounder','e');assert.equal(texts(none,'sounder'),'');assert.equal(Object.keys(none.cards).length,0);
});
test('등대지기 실행 보호와 라운드 뒤 남은 보호 이월의 출처',()=>{
  const b=make(),c=action(b,'c0','lightkeeper','navigator');assert.match(texts(c,'lightkeeper'),/점등 · 보호 \+4/);b.s.intents=[];const before=b.snapshot();b.endRound();const next=P.contributions(before,b.snapshot(),Battle);assert.match(texts(next,'lightkeeper'),/등불 · 보호 4 이월/);
});
test('인양 예약·반환 사본·인계 비용은 실제 사본으로 연결',()=>{
  const b=make(['navigator','sounder','salvager','lightkeeper']);const first=action(b,'c3','salvager','e');assert.match(texts(first,'salvager'),/인양 · 다음 손패 확보/);assert.match(P.reservationDetail(b,'c3'),/인양사가 예약/);
  b.s.intents=[];b.endRound();b.s.needsTrim=false;const returned=action(b,'c3','navigator','e');assert.match(texts(returned,'salvager'),/인계 · 비용 2→1/);
});
console.log(JSON.stringify({checks,passed:checks}));
