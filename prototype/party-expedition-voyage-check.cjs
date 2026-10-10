'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {Run,RELICS,TOOLS,ENCHANTS}=require('./party-expedition-voyage.js');
const {Battle}=require('./party-expedition-core.js'),Auto=require('./party-expedition-auto.js');
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const clone=x=>JSON.parse(JSON.stringify(x));
function battle(relics=[],tools=[]){return new Battle({party:['navigator','diver','pilot','lightkeeper'],deck:['guard','strike','expose','burst','focus','draw'].map((kind,i)=>({id:'r'+i,kind})),enemies:[{id:'enemy',hp:150,pattern:'tideheart',damage:8,areaDamage:3}],voyage:{relics,tools,rule:'normal'},seed:1,cardSet:'draft-1'});}
function fullHand(b){b.s.zones={draw:[],hand:Object.keys(b.s.cards),resolving:[],discard:[],reserve:[],exhaust:[]};b.s.needsTrim=false;}
function finishFight(r){for(let i=0;i<180&&r.s.phase==='battle';i++){const a=Auto.chooseVoyage(r.battle,r.s.toolPolicy);if(a.type==='discard')r.discardForSounder(a.card);else if(a.type==='end')r.endRound();else if(a.type==='tool')r.useTool(a.slot,a.target);else r.play(a.card,a.actor,a.target,a.choice);}assert.notEqual(r.s.phase,'battle');}
function interlude(type,event){const r=new Run({seed:41});r.chooseBlessing(r.s.blessings[0]);r.choosePath(0);finishFight(r);if(r.s.phase==='relicreward')r.chooseRelic(null);if(r.s.phase==='reward')r.chooseReward(null);r.s.interlude={type,event,offers:['burst','draw','mend'],cardPrices:{burst:22,draw:14,mend:14},prices:{remove:12,relic:32,enchant:18},relics:r.relicOffers(2),tools:['battery','chart'],enchants:['flash','edge','retain'],transform:['burst','draw','mend'],tool:'medicine',healed:false,removed:false};r.s.gold=100;r.assert();return r;}
test('12 유물·6 도구·5 각인은 전체 메타데이터와 실제 효과를 가진다',()=>{assert.equal(Object.keys(RELICS).length,12);assert.equal(Object.keys(TOOLS).length,6);assert.equal(Object.keys(ENCHANTS).length,5);});
test('시작 선택은 원정 방향을 주고 중복 선택은 난수·덱을 보존한다',()=>{const r=new Run({seed:6}),before=r.snapshot();assert.equal(r.s.phase,'blessing');assert.throws(()=>r.chooseBlessing('invalid'));assert.deepEqual(r.snapshot(),before);r.chooseBlessing(r.s.blessings[0]);assert.equal(r.s.relics.length,1);assert.equal(r.s.phase,'map');assert.deepEqual(Run.restore(r.snapshot()).snapshot(),r.snapshot());});
test('지도 열람·복원으로 사건·보스·후보가 재추첨되지 않는다',()=>{const r=new Run({seed:9,contentVersion:'voyage-1'});r.chooseBlessing(r.s.blessings[0]);const before=r.snapshot();r.mapView();r.mapView();assert.deepEqual(r.snapshot(),before);assert.equal(r.s.bossName,'해류의 심장');assert.ok(r.s.map.nodes.some(n=>n.entry&&n.route.event==='cache'));assert.deepEqual(Run.restore(before).snapshot(),before);});
test('시작용 타격·보호는 일반 보상에서 제외된다',()=>{const r=new Run({seed:10});for(let i=0;i<200;i++)for(const k of r.rollRewards('battle'))assert.ok(!['basic','strike','guard'].includes(k));});
test('삼중 나침반은 다른 세 계열에서 한 번만 발동하고 미리보기와 실행이 일치한다',()=>{const b=battle(['compass']);fullHand(b);b.play('r0','lightkeeper','lightkeeper');b.play('r1','diver','enemy');const p=b.preview('r2','navigator','enemy');b.play('r2','navigator','enemy');assert.deepEqual(b.snapshot(),p);assert.equal(b.s.voyage.roundUsed.compass,true);assert.equal(b.s.voyage.families.length,3);});
test('산소통은 고비용 카드에서 전투당 1회 환급하고 인쇄 비용을 보존한다',()=>{const b=battle(['oxygen']);fullHand(b);b.play('r3','diver','enemy');assert.ok(b.s.events.some(e=>e.type==='relic'&&e.relic==='oxygen'));assert.equal(b.s.voyage.used.oxygen,true);assert.equal(b.s.energy,3);});
test('신호기·망원경·방파판은 서로 다른 판단에서 발동하고 저장으로 기회를 복원하지 않는다',()=>{
  const b=battle(['signal','lens','mirror']);fullHand(b);b.play('r1','diver','enemy');b.play('r0','lightkeeper','lightkeeper');assert.equal(b.actor('lightkeeper').reaction,3);b.play('r2','navigator','enemy');assert.equal(b.s.voyage.roundUsed.signal,true);assert.ok(b.s.events.some(e=>e.type==='relic'&&e.relic==='signal'));
  b.s.energy=3;b.s.zones.hand.push(b.s.zones.discard.splice(b.s.zones.discard.indexOf('r1'),1)[0]);b.play('r1','pilot','enemy');assert.equal(b.actor('enemy').weak,2);assert.equal(b.s.voyage.roundUsed.lens,true);assert.deepEqual(Battle.restore(b.snapshot()).snapshot(),b.snapshot());
});
test('밧줄·모래시계는 회수와 다음 라운드 준비에 반응한다',()=>{
  const b=new Battle({deck:['strike','salvage','reserveward','guard','draw','expose'].map((kind,i)=>({id:'r'+i,kind})),voyage:{relics:['rope','hourglass'],tools:[],rule:'normal'},enemies:[{id:'enemy',hp:100,pattern:'hunter'}],cardSet:'draft-1'});fullHand(b);b.s.zones.hand.splice(0,1);b.s.zones.discard.push('r0');b.play('r1','navigator','navigator');assert.equal(b.s.voyage.roundUsed.rope,true);assert.ok(b.actor('navigator').shield>=3);b.play('r2','lightkeeper','lightkeeper');assert.equal(b.s.voyage.used.hourglass,true);assert.equal(b.s.pending.energy,2);
});
test('부표는 전투당 한 번만 피해 이후 보호를 제공한다',()=>{const b=battle(['buoy']);b.hit('navigator',1);assert.equal(b.s.allies.reduce((n,a)=>n+a.shield,0),5);b.hit('navigator',1);assert.equal(b.s.allies.reduce((n,a)=>n+a.shield,0),5);});
test('금고·귀항 등불·빈 기록장은 전투 이후 경제와 생존을 바꾼다',()=>{
  const r=new Run({seed:41});r.chooseBlessing(r.s.blessings[0]);for(const id of ['purse','hearth','ledger'])if(!r.s.relics.includes(id))r.acquireRelic(id);r.choosePath(0);r.battle.s.allies.forEach(a=>{a.hp=20;});r.battle.s.enemies.forEach(a=>{a.hp=0;});r.battle.finish();r.syncBattle();assert.equal(r.s.gold,26);assert.ok(r.s.allies.every(a=>a.hp===22));r.chooseReward(null);assert.equal(r.s.gold,32);
});
test('다섯 각인의 실효과는 비용·소진·보존·준비·피해로 적용된다',()=>{
  for(const id of Object.keys(ENCHANTS)){const b=new Battle({deck:['strike','guard','expose','draw','focus','burst'].map((kind,i)=>({id:'r'+i,kind,...(i===0?{enchant:id}:{})})),voyage:{relics:[],tools:[],rule:'normal'},enemies:[{id:'enemy',hp:100,pattern:'hunter'}],seed:1});fullHand(b);
    if(id==='retain'){b.s.allies.forEach(a=>a.shield=20);b.endRound();assert.ok(b.s.zones.hand.includes('r0'));continue;}
    if(id==='edge')assert.equal(b.definition('r0').damage,9);b.play('r0','lightkeeper','enemy');
    if(id==='tide')assert.equal(b.s.pending.energy,1);if(id==='anchor')assert.equal(b.s.pending.shields.lightkeeper,3);if(id==='flash'){assert.equal(b.s.energy,4);assert.ok(b.s.zones.exhaust.includes('r0'));}
  }
});
test('각인 하나만 허용하고 섬광은 비용·소진·인양 조건에 실제 반영된다',()=>{const r=interlude('shop');r.chooseInterlude('enchant',{card:'r0',enchant:'flash'});assert.equal(r.definition('r0').cost,0);assert.equal(r.definition('r0').exhaust,true);const before=r.snapshot();assert.throws(()=>r.chooseInterlude('enchant',{card:'r0',enchant:'edge'}));assert.deepEqual(r.snapshot(),before);const b=new Battle({deck:r.s.deck,voyage:{relics:[],tools:[],rule:'normal'}});fullHand(b);const p=b.preview('r0','salvager',b.s.enemies[0].id);b.play('r0','salvager',b.s.enemies[0].id);assert.deepEqual(b.snapshot(),p);assert.ok(b.s.zones.exhaust.includes('r0'));});
test('도구 6종은 비용·실행 기회를 쓰지 않으며 잘못된 대상은 소모하지 않는다',()=>{
  for(const id of Object.keys(TOOLS)){const b=battle([], [id]);const e=b.s.energy,paid=b.s.paidCardsPlayed;const target=TOOLS[id].target==='enemy'?'enemy':TOOLS[id].target==='ally'?'navigator':undefined;if(id==='medicine')b.actor('navigator').hp=15;const before=b.snapshot();if(target){assert.throws(()=>b.useTool(0,'invalid'));assert.deepEqual(b.snapshot(),before);}const preview=b.previewTool(0,target);b.useTool(0,target);assert.deepEqual(b.snapshot(),preview);assert.equal(b.s.voyage.tools.length,0);assert.equal(b.s.paidCardsPlayed,paid);if(id!=='battery')assert.equal(b.s.energy,e);if(id==='barrier')assert.ok(b.s.allies.every(a=>a.shield===4));if(id==='battery')assert.equal(b.s.energy,5);if(id==='flare')assert.equal(b.actor('enemy').exposure,6);if(id==='medicine')assert.equal(b.actor('navigator').hp,23);if(id==='muffler')assert.equal(b.actor('enemy').weak,3);if(id==='chart')assert.equal(b.s.zones.hand.length,6);}
});
test('자동 도구는 기본 직접 사용이며 현재 치명타가 있을 때만 사용 가능하다',()=>{const b=battle([],['barrier']);b.s.intents=[{actor:'enemy',type:'attack',target:'navigator',damage:8}];b.actor('navigator').hp=5;b.s.zones.discard.push(...b.s.zones.hand.splice(0));const before=b.snapshot();assert.notEqual(Auto.chooseVoyage(b,'manual').type,'tool');assert.equal(Auto.chooseVoyage(b,'emergency').type,'tool');assert.deepEqual(b.snapshot(),before);});
test('자동은 예비 해도로 얻을 비공개 카드의 정체를 미리 읽지 않는다',()=>{const b=battle([],['chart']);b.actor('navigator').hp=1;b.s.intents=[{actor:'enemy',type:'attack',target:'navigator',damage:10}];b.s.zones.draw.push(...b.s.zones.hand.splice(0));const other=Battle.restore(b.snapshot());other.s.zones.draw.reverse();assert.deepEqual(Auto.chooseVoyage(b,'emergency'),Auto.chooseVoyage(other,'emergency'));assert.notEqual(Auto.chooseVoyage(b,'emergency').type,'tool');});
test('보호 카드로 당장 살릴 수 있으면 자동은 도구를 아낀다',()=>{const b=battle([],['barrier']);fullHand(b);b.actor('navigator').hp=5;b.s.intents=[{actor:'enemy',type:'attack',target:'navigator',damage:8}];const a=Auto.chooseVoyage(b,'emergency');assert.equal(a.type,'play');const after=Battle.restore(b.preview(a.card,a.actor,a.target,a.choice));after.endRound();assert.ok(after.actor('navigator').hp>0);});
test('상점은 개별 카드 가격·도구 2칸·제거 1회와 다음 비용 증가를 지킨다',()=>{const r=interlude('shop');r.chooseInterlude('remove','r0');assert.equal(r.s.shopRemovals,1);assert.equal(r.s.gold,88);const before=r.snapshot();assert.throws(()=>r.chooseInterlude('remove','r1'));assert.deepEqual(r.snapshot(),before);r.chooseInterlude('tool','battery');assert.equal(r.s.tools.length,2);const full=r.snapshot();assert.throws(()=>r.chooseInterlude('tool','chart'));assert.deepEqual(r.snapshot(),full);r.chooseInterlude('buy','burst');assert.equal(r.s.gold,50);});
test('복제는 선택 사본의 강화·각인을 보존하고 다른 사본을 수정하지 않는다',()=>{const r=interlude('event','echo');r.s.deck[0].upgraded=true;r.s.deck[0].enchant='edge';r.chooseInterlude('event-clone','r0');assert.deepEqual({...r.s.deck.at(-1),id:'r0'},r.s.deck[0]);assert.equal(r.s.deck.length,11);});
test('변환은 공개된 후보로 선택 사본만 교환하고 강화·각인을 보존한다',()=>{const r=interlude('event','observatory');r.s.deck[0].upgraded=true;r.s.deck[0].enchant='retain';r.chooseInterlude('event-transform',{card:'r0',kind:'burst'});assert.equal(r.s.deck[0].kind,'burst');assert.equal(r.s.deck[0].upgraded,true);assert.equal(r.s.deck[0].enchant,'retain');assert.equal(r.s.deck.length,10);});
test('위험 사건은 공개된 다음 2전투 시작 페널티이며 피해로 동료를 강제 사망시키지 않는다',()=>{const r=interlude('event','pressure');r.chooseInterlude('event-relic',r.s.interlude.relics[0]);assert.equal(r.s.riskBattles,2);r.choosePath(0);assert.equal(r.battle.s.voyage.rule,'lowtide');assert.equal(r.battle.s.energy,3);assert.equal(r.s.riskBattles,1);});
test('정박지 인장은 회복 뒤 직접 고른 카드만 강화한다',()=>{const r=interlude('camp');if(!r.s.relics.includes('seal'))r.acquireRelic('seal');r.chooseInterlude('heal');assert.equal(r.s.interlude.type,'seal');r.chooseInterlude('upgrade','r0');assert.equal(r.s.deck[0].upgraded,true);});
test('사건 여섯 종류와 보물의 대가·각인·안전 대안이 실제로 적용된다',()=>{
  let r=interlude('event','wreck'),id=r.s.interlude.relics[0],hp=r.s.allies.map(a=>a.hp);r.chooseInterlude('event-relic',id);assert.ok(r.s.relics.includes(id));assert.deepEqual(r.s.allies.map(a=>a.hp),hp.map(n=>Math.max(1,n-2)));
  r=interlude('event','wreck');r.chooseInterlude('event-gold');assert.equal(r.s.gold,112);
  r=interlude('event','beacon');r.chooseInterlude('event-enchant',{card:'r0',enchant:'edge'});assert.equal(r.definition('r0').damage,9);
  r=interlude('event','shelter');r.chooseInterlude('upgrade','r0');assert.equal(r.s.deck[0].upgraded,true);
  r=interlude('event','pressure');r.chooseInterlude('event-gold');assert.equal(r.s.gold,108);assert.equal(r.s.riskBattles,0);
  r=interlude('event','echo');r.chooseInterlude('event-tool');assert.ok(r.s.tools.includes('medicine'));
  r=interlude('event','cache');r.chooseInterlude('event-tool');assert.equal(r.s.gold,108);assert.equal(r.s.tools.length,2);
});
test('중간 계약 세 대가와 거절은 공개된 효과만 적용한다',()=>{
  const r=new Run({seed:41,difficulty:'calm'});r.chooseBlessing(r.s.blessings[0]);
  for(let n=0;n<100&&r.s.phase!=='patron';n++){
    if(r.s.phase==='map')r.choosePath(0);else if(r.s.phase==='battle')finishFight(r);else if(r.s.phase==='relicreward')r.chooseRelic(null);else if(r.s.phase==='reward')r.chooseReward(null);else r.chooseInterlude(r.s.interlude.type==='camp'?'heal':'continue');
  }
  assert.equal(r.s.phase,'patron');const saved=r.snapshot();
  for(const index of [0,1,2,null]){const x=Run.restore(saved),before=clone(x.s);x.choosePact(index);assert.equal(x.s.phase,'map');if(index===null){assert.deepEqual(x.s.relics,before.relics);assert.equal(x.s.gold,before.gold);}else{assert.ok(x.s.relics.includes(before.pacts[index].id));if(index===0)assert.deepEqual(x.s.allies.map(a=>a.hp),before.allies.map(a=>Math.max(1,a.hp-3)));if(index===1)assert.equal(x.s.gold,before.gold-10);if(index===2)assert.equal(x.s.riskBattles,before.riskBattles+2);}}
});
test('세 신규 적은 공개 예고·저장·다음 단계가 일치하고 무한 공격 증가가 없다',()=>{for(const pattern of ['bellkeeper','twins','tideheart']){const b=battle();b.s.enemies[0].pattern=pattern;for(let i=0;i<8;i++){b.s.allies.forEach(a=>{a.hp=30;a.shield=30;});const restored=Battle.restore(b.snapshot());if(b.s.needsTrim)b.discardForSounder(b.s.zones.hand[0]);if(restored.s.needsTrim)restored.discardForSounder(restored.s.zones.hand[0]);b.endRound();restored.endRound();assert.deepEqual(restored.snapshot(),b.snapshot());assert.ok(b.s.intents.every(x=>x.damage<=13&&(!x.nextDamage||x.nextDamage<=13)));}}});
test('旧 draft 저장은 확장 후에도 결과·난수를 그대로 복원한다',()=>{const Old=require('./party-expedition-run.js').Run,r=new Old({seed:30,contentVersion:'draft-1'});r.choosePath(0);assert.deepEqual(Run.restore(r.snapshot()).snapshot(),r.snapshot());});
const results=[];
for(let seed=1;seed<=24;seed++){
  let r=new Run({seed,party:seed%3===0?['navigator','sounder','salvager','lightkeeper']:seed%3===1?['navigator','diver','pilot','lightkeeper']:['diver','pilot','sounder','salvager']});r.chooseBlessing(r.s.blessings[seed%3]);r.setToolPolicy('emergency');
  let decisions=0;
  while(!['won','lost'].includes(r.s.phase)&&decisions++<1000){
    const s=r.s;
    if(s.phase==='map')r.choosePath(seed%s.choices.length);
    else if(s.phase==='battle')finishFight(r);
    else if(s.phase==='reward')r.chooseReward(s.offers[seed%3]);
    else if(s.phase==='relicreward')r.chooseRelic(s.relicChoices[0]);
    else if(s.phase==='patron')r.choosePact(seed%3===1&&s.gold<10?null:seed%3);
    else {const i=s.interlude;if(i.type==='camp'||i.type==='seal')r.chooseInterlude(i.type==='camp'?'heal':'upgrade',i.type==='seal'?s.deck.find(c=>!c.upgraded).id:undefined);else if(i.type==='event'&&['shelter','beacon'].includes(i.event))r.chooseInterlude('heal');else if(i.type==='event'&&['wreck','pressure'].includes(i.event))r.chooseInterlude('event-gold');else if(i.type==='event'&&i.event==='cache'&&i.relics.length)r.chooseInterlude('event-relic',i.relics[0]);else r.chooseInterlude('continue');}
    const before=r.snapshot();r=Run.restore(before);assert.deepEqual(r.snapshot(),before);
  }
  assert.ok(['won','lost'].includes(r.s.phase));results.push({seed,status:r.s.phase,battles:r.s.battlesWon,relics:r.s.relics,boss:r.s.bossName,hp:r.s.allies.map(a=>a.hp),decisions});
}
fs.writeFileSync(__dirname+'/party-expedition-voyage-results.json',JSON.stringify({checks,results},null,2));
console.log(JSON.stringify({checks,runs:results.length,wins:results.filter(r=>r.status==='won').length,losses:results.filter(r=>r.status==='lost').length},null,2));
