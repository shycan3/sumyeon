'use strict';
(()=>{
 const copy=x=>JSON.parse(JSON.stringify(x)),C=window.CharacterCampaign,D=window.GameData;
 function measure(record,formation=record.config.formation,version=record.config.formationVersion??1){
  if(!C.validBattleRecord(record)||!window.Formation.valid(formation,version))throw Error('배치 비교의 시작 조건을 확인하세요.');
  const config={...copy(record.config),formation:[...formation],formationVersion:version,control:'auto',targetingRulesVersion:record.config.targetingRulesVersion??0,cards:record.deck.map(id=>copy(record.pool.find(c=>c.id===id)))};
  const b=new window.CharacterBattle(config),metrics={firstTargets:[],firstAttack:[null,null],firstDamage:[null,null],areaEvents:[0,0],areaMax:[0,0],areaMulti:[0,0],zoneMax:[0,0],zoneMulti:[0,0],positions10:null},seen=new Set();let impact=null;
  const intent=b.basicIntent.bind(b);b.basicIntent=function(a){const plan=intent(a);if(a.side===1&&plan?.basic?.mode==='attack'&&plan.basic.target&&!seen.has(a.id)){seen.add(a.id);metrics.firstTargets.push({actor:a.id,target:plan.basic.target,at:this.s.t});}return plan;};
  const execute=b.executeBasicIntent.bind(b);b.executeBasicIntent=function(a,plan,dt){const ok=execute(a,plan,dt);if(ok&&plan.basic.mode==='attack'&&metrics.firstAttack[a.side]===null)metrics.firstAttack[a.side]=this.s.t;return ok;};
  const damage=b.observedDamage.bind(b);b.observedDamage=function(target,amount,side,source,pierce,key,attacker){const n=damage(target,amount,side,source,pierce,key,attacker);if(n>0){if(metrics.firstDamage[side]===null)metrics.firstDamage[side]=this.s.t;if(impact&&impact.side===side&&impact.actor===attacker&&impact.key===key)impact.targets.add(target.id);}return n;};
  const resolve=b.observedResolve.bind(b);b.observedResolve=function(e){const previous=impact,area=e.kind==='area';if(area)impact={side:e.side,actor:e.actor,key:e.key,targets:new Set()};try{return resolve(e);}finally{if(area){const n=impact.targets.size;metrics.areaEvents[e.side]++;metrics.areaMax[e.side]=Math.max(metrics.areaMax[e.side],n);if(n>=2)metrics.areaMulti[e.side]++;if(e.zone){metrics.zoneMax[e.side]=Math.max(metrics.zoneMax[e.side],n);if(n>=2)metrics.zoneMulti[e.side]++;}}impact=previous;}};
  const opening=b.s.decks[0].hand.map(c=>c.id);for(let i=0;i<10000&&!b.s.ended;i++){b.step(.02);if(!metrics.positions10&&b.s.t>=10)metrics.positions10=b.alive(0).map(a=>({id:a.id,x:a.x,y:a.y}));}
  if(!b.s.ended)throw Error('배치 비교가 제한 시간 안에 끝나지 않았습니다.');
  return {formation:[...formation],formationVersion:version,opening,...metrics,winner:b.s.winner,time:b.s.t,hp:b.alive(0).reduce((n,a)=>n+a.hp,0),survivors:b.alive(0).length,protected:b.s.stats.protected?.[0]||0,covered:b.s.stats.covered||0,firstKO:copy(b.s.insights.firstKO),circleHeal:Object.entries(b.s.insights.rows).filter(([key])=>D.cards[key]?.spatial==='circleHeal').reduce((n,[,r])=>n+r.healed,0),lineDamage:Object.entries(b.s.insights.rows).filter(([key])=>D.cards[key]?.spatial==='line').reduce((n,[,r])=>n+r.damage,0),actors:b.s.actors.map(a=>({id:a.id,name:a.name})),summary:C.summarizeBattle(b)};
 }
 function compare(record,formation,version=record.config.formationVersion??1){
  const baseline=record.config.formation;if(!baseline||version!==(record.config.formationVersion??1))throw Error('같은 배치 규칙의 위치 기록이 있는 교전만 비교할 수 있습니다.');
  const before=measure(record,baseline,version),after=measure(record,formation,version);
  return {before,after,policy:record.config.autoPolicy,seed:record.config.seed,same:JSON.stringify(baseline)===JSON.stringify(formation)};
 }
 window.DeploymentStudy={measure,compare};
})();
