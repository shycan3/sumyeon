'use strict';
(()=>{
 const L=window.CombatLab,D=window.GameData,Base=window.CharacterBattle,originalCreate=L.create,originalDeck=L.deck;
 L.scenarios.boss={name:'위험 구역 보스',goal:'주황 원은 고정된 낙하 지점입니다. 기본 AI는 위험 구역을 인식해 회피하지 않고 역할 행동을 유지합니다. 구출·재배치로 빠져나오고, 강타 후 3~5초의 빈틈에 공격하세요. 재배치 후에도 사거리 안의 공격·회복은 계속합니다. 이동 카드가 없다면 손패 교체나 차단도 활용할 수 있습니다.',strategy:'front',enemies:[{role:1,name:'낙하의 수호자',hp:580,damage:5,cards:['boss_zone']}]};
 function deck(){const cards=originalDeck();for(const [old,key]of [['serin_dash','boss_rescue'],['guard','boss_retreat']]){const card=cards.find(c=>c.key===old);card.key=key;card.actor='a'+D.cards[key].role;card.source='reward';card.characterId=D.cards[key].role===1?'serin':'guardian';}for(const card of cards)card.actor='a'+D.cards[card.key].role;return cards;}
 class BossBattle extends Base{constructor(config={},snapshot=null){super(config,snapshot);this.scenario='boss';this.s.labScenario='boss';this.s.mechanic??=Base.mechanicState();if(!Base.validMechanic(this.s.mechanic,this.s.t,this.s.actors))throw Error('보스 기믹 상태가 올바르지 않습니다.');}}
 function create(key,control='auto'){if(key!=='boss')return originalCreate(key,control);const seedBattle=originalCreate('heavy',control),saved=seedBattle.snapshot();saved.decks[0]={draw:deck(),hand:[],discard:[],excluded:[]};saved.decks[1]={draw:[],hand:[],discard:[],excluded:[]};const a=saved.actors.find(a=>a.id==='e0');a.name='낙하의 수호자';a.hp=a.max=580;a.damage=5;a.boss=true;a.range=70;a.speed=0;a.x=680;a.y=195;const b=new BossBattle({},saved);b.random.shuffle(b.s.decks[0].draw);b.refill(0);b.syncSeed();return b;}
 const summary=L.summarize;L.summarize=(b,...args)=>({...summary(b,...args),...(b.s.mechanic?{mechanic:JSON.parse(JSON.stringify(b.s.mechanic.stats))}:{})});L.create=create;L.deck=deck;L.visibleScenarios=['boss'];L.run=key=>{const b=create(key);for(let i=0;i<L.duration/.02&&!b.s.ended;i++)b.step(.02);return L.summarize(b);};window.BossBattle=BossBattle;
})();

