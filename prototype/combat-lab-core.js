'use strict';
(()=>{
 const D=window.GameData,K=window.CharacterData,Base=window.CharacterBattle;
 const scenarios={
  focus:{name:'집중 공격',goal:'부상자를 추격하는 적. 도발·엄호·회복으로 공격을 분산해보세요.',strategy:'hunt',enemies:[{role:1,name:'추격 검사',hp:125,damage:5.5,cards:['dash','execute','heavy']},{role:2,name:'추격 사수',hp:110,damage:5,cards:['shot','pierce']}]},
  swarm:{name:'다수의 적',goal:'약한 근접 적 다섯이 접근합니다. 광역 공격과 처치 순서를 살펴보세요.',strategy:'swarm',enemies:Array.from({length:5},(_,i)=>({role:1,name:'포위병 '+(i+1),hp:62,damage:2.8,cards:['dash','cleave']}))},
  heavy:{name:'예고된 강공격',goal:'강공격은 2.8초 동안 예고됩니다. 차단할 카드와 명령 기회를 남겨보세요.',strategy:'front',windup:2.8,enemies:[{role:1,name:'철퇴 파수꾼',hp:320,damage:6,period:3,cards:['crush','quake','heavy']}]}
 };
 class LabBattle extends Base{
  constructor(config,snapshot=null){super(config,snapshot);this.scenario=config.scenario||snapshot?.labScenario;if(!scenarios[this.scenario])throw Error('지원하지 않는 비교 전투입니다.');this.s.labScenario=this.scenario;}
  basePreparation(d,side){return side===1&&this.scenario==='heavy'&&window.GameCore.offense.includes(d.kind)?scenarios.heavy.windup:super.basePreparation(d,side);}
 }
 function deck(){const {pool,ids}=K.templatePool(K.starter),cards=ids.map((id,i)=>({...pool.find(c=>c.id===id),id:'lab:'+i}));for(const [old,key]of [['serin_cut','serin_chain'],['serin_dash','serin_cover']]){const i=cards.findIndex(c=>c.key===old);cards[i]={id:cards[i].id,key,characterId:'serin',source:'reward',upgraded:false};}return cards;}
 function create(key,control='auto'){
  const scenario=scenarios[key];if(!scenario||!['auto','manual'].includes(control))throw Error('전투와 운영 방식을 선택하세요.');
  const b=new LabBattle({scenario:key,seed:37,levels:[1,1,1,1],hp:[140,115,95,70],stances:[0,1,0,0],depth:0,elite:false,encounter:scenario,timing:'mixed',control,cards:deck()});
  const enemyDeck=b.s.decks[1];enemyDeck.draw=[];enemyDeck.hand=[];enemyDeck.discard=[];enemyDeck.excluded=[];
  scenario.enemies.forEach((config,i)=>{const a=b.get('e'+i);a.damage=config.damage;a.period=config.period||a.period;a.x=690+(i%2)*95;a.y=scenario.enemies.length===1?195:55+i*65;for(let j=0;j<5;j++)enemyDeck.draw.push({id:'lab-enemy:'+i+':'+j,key:config.cards[j%config.cards.length],actor:a.id,upgraded:false});});
  b.random.shuffle(enemyDeck.draw);b.refill(1);b.syncSeed();return b;
 }
 const duration=60;
 function summarize(b,manualCards=0,intervened=false){const s=b.s,uses=Object.entries(s.stats.cards[0]).map(([key,n])=>({key,n,damage:s.stats.byCard?.[0]?.[key]||0}));return {recap:JSON.parse(JSON.stringify(s.recap)),actors:s.actors.map(a=>({id:a.id,name:a.name,side:a.side})),scenario:b.scenario,seed:37,method:s.control==='manual'?'수동':manualCards>0||intervened?'개입':'오토',manualCards,status:s.ended?s.winner===0?'승리':'패배':'시간 종료',time:+s.t.toFixed(2),hp:s.actors.filter(a=>a.side===0).map(a=>({id:a.id,name:a.name,hp:a.hp,max:a.max})),received:[...(s.stats.received||[0,0,0,0])],damage:s.stats.damage[0],healed:s.stats.healed[0],shared:(s.stats.protected?.[0]||0)+s.stats.covered,blocked:s.stats.blocked[0],signature:s.stats.signatureHits,uses,cards:uses.reduce((n,x)=>n+x.n,0),enemyCards:Object.entries(s.stats.cards[1]).map(([key,n])=>({key,n}))};}
 function run(key){const b=create(key);for(let i=0;i<duration/.02&&!b.s.ended;i++)b.step(.02);return summarize(b);}
 window.CombatLab={scenarios,create,deck,duration,summarize,run};
})();
