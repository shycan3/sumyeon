'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Run,RECORD_THEMES}=require('./party-expedition-run.js');
const {Battle,CARDS,cardDefinition}=require('./party-expedition-core.js');
const Auto=require('./party-expedition-auto.js');
const Catalog=require('./party-expedition-catalog.js');
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
test('100종 희귀도 독립 분류와 전 계열의 세 희귀도',()=>{
 assert.equal(Object.keys(CARDS).filter(k=>k!=='basic').length,100);
 const ids=Object.values(Catalog.rarityIds).flat();assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(k=>CARDS[k]));
 for(const family of Object.keys(Catalog.families))for(const rarity of Object.keys(Catalog.rarities))assert.ok(Object.values(CARDS).some(c=>c.family===family&&c.rarity===rarity));
 for(const [k,c]of Object.entries(CARDS))if(k!=='basic')assert.ok(Catalog.rarities[c.rarity]);
});
test('보정은 후보마다 증가·희귀 생성 시 초기화, 비전투는 비변경',()=>{
 const r=new Run({seed:99});let rolls=[0,0,.99,0,.99,0];r.rewardRandom=()=>rolls.shift();r.rollRewards('battle');assert.equal(r.s.rewardOffset,2);
 const q=new Run({seed:7});q.s.rewardOffset=30;let hi=[.99,0,.99,0,.99,0];q.rewardRandom=()=>hi.shift();q.rollRewards('battle');assert.equal(q.s.rewardOffset,30);
 const s=new Run({seed:8}),offset=s.s.rewardOffset;s.rollRewards('shop');assert.equal(s.s.rewardOffset,offset);s.rollRewards('event','opening');assert.equal(s.s.rewardOffset,offset);
});
const stats={};
test('기본 보상은 계열 고정 없이 동일 계열 세 장도 가능·정예 희귀율 증가',()=>{
 for(const context of ['battle','elite','shop','event']){
  const r=new Run({seed:721});const count={common:0,uncommon:0,rare:0},families={},seen=new Set();
  for(let i=0;i<12000;i++){
   r.s.rewardOffset=0;const offers=r.rollRewards(context);assert.equal(new Set(offers).size,3);
   count[CARDS[offers[0]].rarity]++;offers.forEach(k=>seen.add(k));const pattern=offers.map(k=>CARDS[k].family).join('/');families[pattern]=(families[pattern]||0)+1;
  }
  assert.equal(seen.size,100);if(context==='battle')assert.ok(Object.keys(families).some(p=>new Set(p.split('/')).size===1));
  stats[context]={count,seen:seen.size,rarePercent:count.rare/120};
 }
 assert.ok(Math.abs(stats.battle.rarePercent-3)<1);assert.ok(Math.abs(stats.elite.rarePercent-10)<1);assert.ok(stats.elite.rarePercent>stats.battle.rarePercent+5);
});
test('관측실은 공개 주제와 일치하며 덱을 보지 않고 중복 없이 생성',()=>{
 for(const theme of Object.keys(RECORD_THEMES)){
  const r=new Run({seed:711});for(let i=0;i<5000;i++){const a=r.rollRewards('event',theme);assert.ok(CARDS[a[2]].linkTags.includes(theme));assert.equal(new Set(a).size,3);}
 }
 const a=new Run({seed:7}),b=new Run({seed:7});b.s.deck.forEach(c=>c.kind='guard');assert.deepEqual(a.rollRewards('battle'),b.rollRewards('battle'));assert.equal(a.s.rewardSeed,b.s.rewardSeed);
 // Rare themed candidates already used in the first two slots must not fail.
 const r=new Run({seed:7});let rolls=[0,0,0,.3,0,0];r.rewardRandom=()=>rolls.shift();assert.equal(new Set(r.rollRewards('event','recycle')).size,3);
});
test('지도는 강적·주제를 미리 공개하고 열람·복원은 RNG 비변경',()=>{
 const r=new Run({seed:178});assert.ok(r.s.map.nodes.some(n=>n.route?.rewardTier==='elite'));assert.ok(r.s.map.nodes.some(n=>n.route?.recordTheme));
 const old=new Run({seed:178,contentVersion:'cards100-1'});for(const n of r.s.map.nodes.filter(n=>n.type==='elite')){const e=n.route.enemies[0],previous=old.s.map.nodes.find(x=>x.id===n.id).route.enemies[0];assert.ok(e.hp>previous.hp&&e.damage>previous.damage);}
 const before=r.snapshot();for(let i=0;i<20;i++)r.mapView();assert.deepEqual(r.snapshot(),before);assert.deepEqual(Run.restore(before).snapshot(),before);
 for(const n of r.s.map.nodes.filter(n=>n.route)){if(n.type==='elite')assert.match(r.rewardDescription(n.route,n.floor),/희귀 확률/);if(n.route.recordTheme)assert.match(r.recordDescription(n.route),/후보 1장/);}
 for(const field of ['rewardOffset','rewardSeed']){const x=r.snapshot();x[field]=-99;assert.throws(()=>Run.restore(x));}
});
function finishFixture(r){r.battle.s.enemies.forEach(e=>{e.hp=1;e.shield=0;});let steps=0;while(r.s.phase==='battle'&&steps++<50){const a=Auto.choose(r.battle);if(a.type==='discard')r.discardForSounder(a.card);else if(a.type==='end')r.endRound();else r.play(a.card,a.actor,a.target,a.choice);}assert.notEqual(r.s.phase,'battle');}
test('제시 뒤 건너뛰기·복원은 확률 비변경, 7구역 강적은 추가 카드·재화',()=>{
 const r=new Run({seed:178});let rewards=0,eliteLate=false;
 while(r.s.phase!=='won'){
  if(r.s.phase==='map')r.choosePath(0);
  else if(r.s.phase==='battle'){const tier=r.s.route.rewardTier;finishFixture(r);if(tier==='elite'){assert.equal(r.s.history.at(-1).goldEarned,12+r.s.floor*2);if(r.s.floor===6){assert.equal(r.s.phase,'reward');eliteLate=true;}}}
  else if(r.s.phase==='reward'){const snapshot=r.snapshot(),offset=r.s.rewardOffset;assert.deepEqual(Run.restore(snapshot).snapshot(),snapshot);r.chooseReward(null);assert.equal(r.s.rewardOffset,offset);rewards++;}
  else{r.chooseInterlude('heal');if(r.s.phase==='interlude')r.chooseInterlude('continue');}
 }
 assert.ok(eliteLate);assert.equal(rewards,7);
});
test('4종 연결 보완은 새 규칙에서만 실행·강화·미리보기·저장 일치',()=>{
 for(const kind of Object.keys(Catalog.draftBridges))for(const upgraded of [false,true]){
  const deck=[{id:'c',kind,upgraded},{id:'a',kind:'strike'},{id:'b',kind:'guard'}];
  const old=new Battle({deck,party:['navigator','diver','pilot','lightkeeper'],seed:7,enemies:[{id:'e',hp:90,damage:2}]});
  const b=new Battle({deck,party:['navigator','diver','pilot','lightkeeper'],cardSet:'draft-1',seed:7,enemies:[{id:'e',hp:90,damage:2}]});
  b.s.zones={hand:['c','a','b'],draw:[],discard:[],reserve:[],resolving:[],exhaust:[]};b.actor('navigator').shield=4;b.actor('navigator').hp=10;
  const d=b.definition('c'),target=d.target==='enemy'?'e':'navigator',expected=b.preview('c','lightkeeper',target);b.play('c','lightkeeper',target);assert.deepEqual(b.snapshot(),expected);assert.deepEqual(Battle.restore(b.snapshot()).snapshot(),expected);
  assert.notEqual(old.definition('c').text,d.text);
  if(kind==='reserveward')assert.equal(b.s.pending.energy,1);
  if(['slowcurrent','shatterguard'].includes(kind))assert.equal(b.actor('e').exposure,2);
  if(kind==='recoverydraw')assert.equal(b.actor('navigator').hp,upgraded?18:16);
 }
});
test('단일 정답 카드 없이 일반/고급으로 여러 준비·활용 경로 존재',()=>{
 const ds=Object.keys(CARDS).filter(k=>k!=='basic'&&CARDS[k].rarity!=='rare').map(k=>cardDefinition(k,'draft-1'));
 for(const keys of [['exposure','allExposure'],['weak','allWeak'],['shield','allShield'],['draw','retrieveFamily'],['nextEnergy','energy']])assert.ok(ds.filter(d=>[d,...(d.choices||[])].some(o=>keys.some(k=>o[k]))).length>=3);
 for(const key of ['exposureDraw','weakDamage','shieldDamage','protectedHeal'])assert.ok(ds.some(d=>d[key]));
});
test('기존100 풀과 전투 효과·난수 흐름 보존',()=>{
 for(const version of ['cards100-1','legacy','links-1','tactics-1']){
  const r=new Run({seed:88,contentVersion:version});assert.ok(!('rewardOffset' in r.s));const other=Run.restore(r.snapshot());for(let i=0;i<12;i++)assert.deepEqual(r.rewardOffers(),other.rewardOffers());r.choosePath(0);assert.ok(!('cardSet' in r.battle.s));
 }
 const old=new Run({seed:9,contentVersion:'cards100-1'}),fresh=new Run({seed:9});assert.equal(old.definition('reserveward').nextEnergy,undefined);assert.equal(fresh.definition('reserveward').nextEnergy,1);
});
fs.writeFileSync(path.join(__dirname,'party-expedition-draft-odds.json'),JSON.stringify({checks,stats},null,2));
console.log(JSON.stringify({checks,stats},null,2));
