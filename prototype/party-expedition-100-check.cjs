'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {Battle,CARDS,ROLES}=require('./party-expedition-core.js');
const {Run:BaseRun}=require('./party-expedition-run.js');
const contentVersion=process.argv[2]||'cards100-1';
assert.ok(['cards100-1','draft-1'].includes(contentVersion));
class Run extends BaseRun{constructor(options={}){super({contentVersion,...options});}}
const Auto=require('./party-expedition-auto.js');
const Catalog=require('./party-expedition-catalog.js');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
const kinds=Object.keys(CARDS).filter(k=>k!=='basic');
function specimen(kind,upgraded,breakMode,actor){
 const deck=[kind,'strike','guard','expose','focus','strike','guard','suppress'].map((kind,i)=>({id:'c'+i,kind,upgraded:i===0&&upgraded}));
 const party=actor?[actor,...ROLES.filter(r=>r.id!==actor).slice(0,3).map(r=>r.id)]:['navigator','diver','pilot','lightkeeper'];
 const b=new Battle({deck,party,seed:218,breakMode,...(contentVersion==='draft-1'?{cardSet:'draft-1'}:{}),enemies:[{id:'e',name:'표본',hp:150,pattern:'hunter',damage:6},{id:'e2',name:'표본2',hp:120,pattern:'sweep',damage:5}]});
 b.s.zones={hand:deck.slice(0,5).map(c=>c.id),draw:['c5'],discard:['c6','c7'],reserve:[],resolving:[],exhaust:[]};b.s.needsTrim=false;b.s.energy=5;
 b.actor(party[0]).shield=8;b.actor(party[1]).shield=8;b.actor(party[1]).hp=12;b.actor('e').weak=3;b.actor('e').exposure=4;
 return b;
}
test('100종 일반·강화에 계열·설명·역할·강화 차이가 있음',()=>{assert.equal(kinds.length,100);for(const k of kinds){const c=CARDS[k];assert.ok(c.family&&c.category&&c.role&&c.text&&c.upgrade);assert.notEqual(JSON.stringify({...c,text:undefined,upgrade:undefined}),JSON.stringify({...c,...c.upgrade,text:undefined,upgrade:undefined}));}assert.deepEqual(Object.fromEntries(Object.keys(Catalog.families).map(f=>[f,kinds.filter(k=>CARDS[k].family===f).length])),{assault:25,ward:20,disrupt:20,cycle:20,repair:15});});
let executions=0;
test('100종 모든 강화·선택·브레이크·실행자 미리보기와 실제·저장 동일',()=>{
 for(const k of kinds)for(const upgraded of [false,true])for(const breakMode of [false,true])for(const actor of ROLES.map(r=>r.id)){
  const probe=specimen(k,upgraded,breakMode),base=probe.definition('c0');
  for(const choice of base.choices?base.choices.map((_,i)=>i):[undefined]){
   const b=specimen(k,upgraded,breakMode,actor),d=b.definition('c0',choice),target=d.target==='enemy'?'e':b.s.allies[1].id;
   const before=b.snapshot(),expected=b.preview('c0',actor,target,choice);assert.deepEqual(b.snapshot(),before);
   b.play('c0',actor,target,choice);assert.deepEqual(b.snapshot(),expected);b.assert();assert.deepEqual(Battle.restore(b.snapshot()).snapshot(),expected);executions++;
  }
 }
});
test('무효 선택·대상은 신규 예약·지속·소진·RNG를 변경하지 않음',()=>{for(const k of kinds){const b=specimen(k,false,false),before=b.snapshot();assert.throws(()=>b.play('c0','pilot','missing',0));assert.deepEqual(b.snapshot(),before);}});
test('100종 전부 보상에 실제 제시되고 세 후보는 중복 없음',()=>{const seen=new Set();for(let seed=1;seed<=512;seed++){const r=new Run({seed});for(let floor=0;floor<6;floor++){r.s.floor=floor;const offers=r.rewardOffers();assert.equal(offers.length,3);assert.equal(new Set(offers).size,3);offers.forEach(k=>seen.add(k));}}assert.equal(seen.size,100);});
test('이전 콘텐츠 버전의 풀·저장·난수 흐름에 신규70종이 섞이지 않음',()=>{const fresh=new Set(Catalog.planned.map(c=>c.id));for(const version of [undefined,'legacy','links-1','tactics-1'])for(let seed=1;seed<=64;seed++){const r=new Run({seed,contentVersion:version||'legacy'});if(!version)delete r.s.contentVersion;const restored=Run.restore(r.snapshot());for(let floor=0;floor<6;floor++){r.s.floor=restored.s.floor=floor;const offers=r.rewardOffers();assert.deepEqual(offers,restored.rewardOffers());assert.ok(offers.every(k=>!fresh.has(k)));assert.equal(r.s.seed,restored.s.seed);}}});
test('자동은 효과 선택·X·지속 설치를 합법적으로 다룸',()=>{for(const kind of ['doublecourse','guardchoice','pressurechoice','routechoice','rescuechoice','cascade','tidalwall','supplyline','assaultstance']){const b=specimen(kind,false,false);const a=Auto.choose(b);assert.ok(a);if(a.type==='play'){b.validate(a.card,a.actor,a.target,a.choice);if(b.definition(a.card).choices)assert.ok(Number.isInteger(a.choice));}b.assert();}});
const timings=[],uses={},choices={},rewards={},runs=[];
const parties=[['navigator','sounder','salvager','lightkeeper'],['navigator','diver','pilot','lightkeeper'],['diver','pilot','sounder','salvager']];
const policies=['assault','ward','disrupt','cycle','repair'];
function pickReward(r,wanted){const deckKinds=new Set(r.s.deck.map(c=>c.kind));return [...r.s.offers].sort((a,b)=>{const worth=k=>(CARDS[k].family===wanted?20:0)+(deckKinds.has(k)?0:3)+(CARDS[k].power?1:0);return worth(b)-worth(a);})[0];}
test('전체 풀의 반복 원정을 제품 자동 전투만으로 실행',()=>{
 for(const party of parties)for(const breakMode of [false,true])for(const policy of policies)for(const seed of [11,47,83,129]){
  const sampleSeed=seed+parties.indexOf(party)*1000;
  const r=new Run({party,breakMode,seed:sampleSeed});let steps=0,combatSteps=0,lastRound=0,maxRound=0;
  while(!['won','lost'].includes(r.s.phase)&&steps++<1000){
   if(r.s.phase==='map'){const index=r.s.choices.findIndex(route=>route.interlude===(policy==='repair'?'camp':policy==='cycle'?'event':'shop'));r.choosePath(index>=0?index:0);}
   else if(r.s.phase==='battle'){
    const t=performance.now(),a=Auto.choose(r.battle);timings.push(performance.now()-t);assert.ok(a);combatSteps++;
    lastRound=r.battle.s.round;maxRound=Math.max(maxRound,lastRound);
    if(a.type==='discard')r.discardForSounder(a.card);else if(a.type==='end')r.endRound();else{
     const kind=a.card==='basic'?'basic':r.battle.s.cards[a.card].kind;uses[kind]=(uses[kind]||0)+1;
     if(a.choice!==undefined){const key=kind+':'+a.choice;choices[key]=(choices[key]||0)+1;}
     r.play(a.card,a.actor,a.target,a.choice);
    }
   }else if(r.s.phase==='reward'){const kind=pickReward(r,policy);rewards[kind]=(rewards[kind]||0)+1;r.chooseReward(kind);}
   else{const room=r.s.interlude;if(room.type==='shop'){
     if(!room.healed&&r.s.gold>=room.prices.heal&&r.s.allies.some(a=>a.hp<a.max))r.chooseInterlude('heal');
     if(room.offers.length&&r.s.gold>=room.prices.card){const kind=[...room.offers].sort((a,b)=>(CARDS[b].family===policy)-(CARDS[a].family===policy))[0];r.chooseInterlude('buy',kind);rewards[kind]=(rewards[kind]||0)+1;}
     r.chooseInterlude('continue');
    }else if(room.type==='event'&&room.offers.some(k=>CARDS[k].family===policy)&&r.s.allies.every(a=>a.hp>=18)){const kind=room.offers.find(k=>CARDS[k].family===policy);r.chooseInterlude('learn',kind);rewards[kind]=(rewards[kind]||0)+1;}
    else r.chooseInterlude('heal');
   }
   r.assert();
   if(steps%17===0)assert.deepEqual(Run.restore(r.snapshot()).snapshot(),r.snapshot());
  }
  assert.ok(steps<1000,'No unbounded auto battle.');assert.ok(['won','lost'].includes(r.s.phase));
  runs.push({party,breakMode,policy,seed:sampleSeed,result:r.s.phase,won:r.s.battlesWon,steps,combatSteps,maxRound,deck:r.s.deck.map(c=>c.kind),survivors:r.s.allies.filter(a=>a.hp>0).length});
 }
});
timings.sort((a,b)=>a-b);
const summary={checks,cardExecutions:executions,runs:runs.length,wins:runs.filter(r=>r.result==='won').length,losses:runs.filter(r=>r.result==='lost').length,uniqueFinalDecks:new Set(runs.map(r=>JSON.stringify([...r.deck].sort()))).size,distinctUsedCards:Object.keys(uses).length,distinctChosenCards:Object.keys(rewards).length,choices,latency:{decisions:timings.length,p50:timings[Math.floor(timings.length*.5)],p95:timings[Math.floor(timings.length*.95)],p99:timings[Math.floor(timings.length*.99)],max:timings.at(-1)},uses,rewards};
fs.writeFileSync(path.join(__dirname,contentVersion==='draft-1'?'party-expedition-draft-results.json':'party-expedition-100-results.json'),JSON.stringify({contentVersion,summary,runs},null,2));
console.log(JSON.stringify(summary,null,2));
assert.equal(runs.length,120);assert.ok(summary.uniqueFinalDecks>=40);assert.ok(summary.distinctChosenCards>=50);assert.ok(summary.distinctUsedCards>=45);
