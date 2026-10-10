'use strict';
const assert=require('node:assert/strict');
const {Battle,ROLES}=require('./party-expedition-core.js');
const {Run}=require('./party-expedition-run.js');
const {choose,createController}=require('./party-expedition-auto.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function sample(kinds,extra={}){
  const b=new Battle({party:['navigator','diver','pilot','lightkeeper'],seed:19,
    deck:[...kinds,'strike','guard'].map((kind,i)=>({id:'c'+i,kind})),
    enemies:[{id:'enemy',name:'검사 적',pattern:'hunter',hp:80,damage:12}],...extra});
  b.s.zones={hand:kinds.map((_,i)=>'c'+i),draw:['c'+kinds.length,'c'+(kinds.length+1)],resolving:[],discard:[],reserve:[],exhaust:[]};
  b.s.needsTrim=false;b.assert();return b;
}
function execute(b,a){if(a.type==='play')b.play(a.card,a.actor,a.target);else if(a.type==='discard')b.discardForSounder(a.card);else b.endRound();}
test('판단은 원본 상태·손패·난수를 변경하지 않음',()=>{const b=sample(['expose','pursuit','bastion','focus']);const before=b.snapshot(),a=choose(b);assert.deepEqual(b.snapshot(),before);assert.deepEqual(choose(b),a);});
test('다음 뽑기 순서를 알아내서 의사결정하지 않음',()=>{const b=sample(['draw','strike','guard']);const a=choose(b);b.s.zones.draw.reverse();b.s.seed=921;assert.deepEqual(choose(b),a);});
test('예고된 치명타를 막을 보호 대상 선택',()=>{const b=sample(['guard'],{enemies:[{id:'enemy',name:'검사 적',pattern:'hunter',hp:80,damage:6}]});b.s.energy=1;b.actor('navigator').hp=2;const a=choose(b);assert.equal(a.type,'play');assert.equal(a.card,'c0');assert.equal(a.target,'navigator');execute(b,a);assert.ok(b.actor('navigator').shield>0);});
test('처치 가능한 적은 공격하여 예고를 취소',()=>{const b=sample(['guard','strike']);b.actor('enemy').hp=5;b.s.energy=1;const a=choose(b);assert.equal(a.card,'c1');execute(b,a);assert.equal(b.s.status,'won');assert.equal(b.actor('navigator').hp,30);});
test('충분한 보호 위에 불필요한 방어를 반복하지 않음',()=>{const b=sample(['guard']);b.actor('navigator').shield=30;b.s.energy=1;assert.notEqual(choose(b).card,'c0');});
test('에너지 부족은 라운드 종료로 진행',()=>{const b=sample(['deepdive','bastion']);b.s.energy=0;assert.deepEqual(choose(b),{type:'end'});});
test('최대 에너지에서 호흡을 헛되이 소진하지 않음',()=>{const b=sample(['focus']);b.s.energy=5;assert.notEqual(choose(b).card,'c0');});
test('기존 노출을 고비용 공격에 활용',()=>{const b=sample(['deepdive','guard']);b.actor('enemy').exposure=4;const a=choose(b);assert.equal(a.card,'c0');execute(b,a);assert.ok(b.actor('enemy').hp<=40);});
test('쓰러진 실행자·대상은 자동 행동에서 제외',()=>{const b=sample(['strike','guard']);b.actor('pilot').hp=0;const a=choose(b);assert.notEqual(a.actor,'pilot');assert.notEqual(a.target,'pilot');execute(b,a);b.assert();});
test('측심 선택을 자동으로 처리하고 전투를 이어감',()=>{const b=new Battle({seed:19});assert.equal(b.s.needsTrim,true);const a=choose(b);assert.equal(a.type,'discard');assert.ok(b.s.zones.hand.includes(a.card));execute(b,a);assert.equal(b.s.needsTrim,false);});
test('종료된 전투에서는 아무 행동도 요청하지 않음',()=>{const b=sample(['strike']);b.actor('enemy').hp=1;execute(b,choose(b));assert.equal(choose(b),null);});
let runActions=0,wins=0;
test('원정에서 카드·브레이크·편성이 달라도 합법 행동으로 종료',()=>{
  for(const party of [ROLES.slice(0,4).map(r=>r.id),['navigator','sounder','salvager','lightkeeper']])for(const breakMode of [false,true]){
    const r=new Run({party,breakMode,seed:312});let steps=0;
    while(!['won','lost'].includes(r.s.phase)&&steps++<700){
      if(r.s.phase==='map')r.choosePath(0);
      else if(r.s.phase==='battle'){
        const before=r.snapshot(),a=choose(r.battle);assert.deepEqual(r.snapshot(),before);
        if(a.type==='play')r.play(a.card,a.actor,a.target);else if(a.type==='discard')r.discardForSounder(a.card);else r.endRound();
      }else if(r.s.phase==='reward')r.chooseReward(r.s.offers.find(k=>['deepdive','bastion','mobilize','pursuit','beacon','pressurevalve'].includes(k))||r.s.offers[0]);
      else {const i=r.s.interlude;if(i.type==='shop'){if(!i.healed&&r.s.gold>=i.prices.heal)r.chooseInterlude('heal');r.chooseInterlude('continue');}else r.chooseInterlude('heal');}
      r.assert();assert.deepEqual(Run.restore(r.snapshot()).snapshot(),r.snapshot());
    }
    assert.ok(steps<700);assert.ok(['won','lost'].includes(r.s.phase));runActions+=steps;if(r.s.phase==='won')wins++;
  }
});
function fakeClock(){let id=0;const tasks=new Map();return {setTimeout(fn){tasks.set(++id,fn);return id;},clearTimeout(key){tasks.delete(key);},get size(){return tasks.size;},async tick(){const [key,fn]=tasks.entries().next().value||[];if(fn){tasks.delete(key);await fn();}}};}
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
  await check('중복 렌더·재개는 대기 행동 하나만 생성',async()=>{const clock=fakeClock();let count=0;const c=createController({clock,ready:()=>true,decide:()=>({type:'end'}),execute:()=>{count++;return true;}});c.start();c.wake();c.wake();assert.equal(clock.size,1);await clock.tick();assert.equal(count,1);assert.equal(clock.size,1);c.stop();assert.equal(clock.size,0);});
  await check('수동 중지는 이미 예약된 행동을 취소',async()=>{const clock=fakeClock();let count=0;const c=createController({clock,ready:()=>true,decide:()=>({type:'end'}),execute:()=>count++});c.start();c.stop();await clock.tick();assert.equal(count,0);assert.equal(c.enabled,false);});
  await check('설명창·숨겨진 탭에서 행동 없이 대기하고 복귀 시 재개',async()=>{const clock=fakeClock();let ready=true,count=0;const c=createController({clock,ready:()=>ready,decide:()=>({type:'end'}),execute:()=>count++});c.start();ready=false;await clock.tick();assert.equal(count,0);assert.equal(c.enabled,true);assert.equal(clock.size,0);ready=true;c.wake();await clock.tick();assert.equal(count,1);c.stop();});
  await check('진행 중 연출에서 중지해도 다음 자동 행동이 남지 않음',async()=>{const clock=fakeClock();let resolve,count=0;const c=createController({clock,ready:()=>true,decide:()=>({type:'end'}),execute:()=>{count++;return new Promise(r=>resolve=r);}});c.start();const step=clock.tick();c.stop();resolve(true);await step;assert.equal(count,1);assert.equal(clock.size,0);assert.equal(c.enabled,false);});
  await check('전투 종료와 실행 오류는 자동을 해제',async()=>{for(const decide of [()=>null,()=>{throw Error('검사 오류');}]){const clock=fakeClock();const c=createController({clock,ready:()=>true,decide,execute:()=>true});c.start();await clock.tick();assert.equal(c.enabled,false);assert.equal(clock.size,0);}});
  await check('실행 실패 반환과 행동 상한은 무한 재시도를 차단',async()=>{for(const fail of [true,false]){const clock=fakeClock();let n=0;const c=createController({clock,maxSteps:2,ready:()=>true,decide:()=>({type:'end'}),execute:()=>{n++;return !fail;}});c.start();for(let i=0;i<4;i++)await clock.tick();assert.equal(c.enabled,false);assert.equal(n,fail?1:2);}});
  console.log(`${passed}개 자동 전투 검사 통과 · 4개 원정 ${wins}승/${4-wins}패 · ${runActions}개 단계 진행 (재미·승률 검증 아님)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
