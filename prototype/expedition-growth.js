'use strict';
(()=>{
 const D=window.GameData,K=window.CharacterData,T=window.CardTraits;
 // Separate acquisition stream: no rerolling or consumption of combat randomness.
 function offers(run){
  const canRevive=run.map.slice(run.depth+1).some(row=>row.some(n=>n.type==='heal'));
  const available=K.rewardOptions(run).filter(k=>run.hp[run.identityVersion===1?K.bindCard({key:k,characterId:K.owner(k).id},run.party).casterSlot:K.owner(k).role]>0||canRevive),deck=run.deck.map(id=>run.pool.find(c=>c.id===id)),summary=T.summary(deck),rng=new D.Random((run.seed^run.current.seed^0x48b2e73d^run.depth)>>>0),chosen=[],reasons={};
  const counts=k=>deck.filter(c=>c.key===k).length;
  const ranked=[...summary].sort((a,b)=>b.level-a.level||b.count-a.count||a.id.localeCompare(b.id)),main=ranked[0],alternate=ranked[1];
  const special=k=>K.owner(k).reward.includes(k),has=(k,id)=>D.cards[k].traits.includes(id);
  function pick(list,reason){
   list=list.filter(k=>!chosen.includes(k));if(!list.length)return false;
   const unseen=list.filter(k=>!counts(k));if(unseen.length)list=unseen;
   const weights=list.map(k=>(special(k)?2:1)/(1+counts(k))),total=weights.reduce((a,b)=>a+b,0);let n=rng.next()*total,index=list.length-1;
   for(let i=0;i<list.length;i++){n-=weights[i];if(n<0){index=i;break;}}
   const key=list[index];chosen.push(key);reasons[key]=reason;return true;
  }
  pick(available.filter(k=>has(k,main.id)),main.name+' 심화 후보 · 새 종류 또는 주력 사본');
  const finalPlanning=run.bossRulesVersion===1&&run.current.type==='camp';
  const next=finalPlanning?[run.map.at(-1)[0]]:run.map.slice(run.depth+1).find(row=>row.some(n=>['battle','elite','boss'].includes(n.type)))||[];
  const response=new Set();for(const node of next){const e=run.contentRulesVersion===1&&node.encounter===8?window.SupportContent?.encounter:node.type==='boss'?run.bossRulesVersion===1?K.expeditionBosses[run.bossId]:K.strategyBoss:node.type==='elite'?K.expeditionElite:K.strategyBattles?.[node.encounter]||K.advancedBattles[node.encounter];
   const keys=node.type==='boss'&&run.bossRulesVersion===1&&run.bossId==='network'?['serin_dash','serin_chain','volley','ranger_line','ria_focus','ria_burst','guard','noa_guard']:node.type==='boss'||node.type==='elite'?['guard','boss_rescue','boss_retreat','wave','serin_parry']:e?.strategy==='swarm'?['volley','bash','wave','medic_circle']:e?.strategy==='sustain'?['serin_dash','serin_chain','volley',run.bossRulesVersion===1?'ranger_line':'archer_line','serin_dance']:['taunt','serin_cover','guard','heal','serin_parry'];keys.forEach(k=>response.add(run.contentRulesVersion===1&&run.party?.some(p=>p.characterId==='noa')?({heal:'noa_patch',wave:'noa_choir',medic_circle:'noa_choir'}[k]||k):k));}
  pick(available.filter(k=>response.has(k)),finalPlanning?'최종 상대 보완 후보 · 공개된 지원망/범위 위협 기준':'다음 전투 보완 후보 · 공개된 갈림길 기준');
  pick(available.filter(k=>has(k,alternate.id)),alternate.name+' 전환 후보 · 한 장으로 전환 완성은 아님');
  if(run.current.type==='camp')pick(available.filter(special),'정비 · 원정 전용 기술 후보');
  const limit=run.current.type==='camp'?4:3;while(chosen.length<Math.min(limit,available.length))if(!pick(available,'다른 운영 후보 · 필요 없으면 넘기기'))break;
  return {candidates:chosen,reasons,kind:run.current.type==='camp'?'camp':run.current.type==='elite'?'elite':'battle'};
 }
 function uses(report){return (report.growthChoices||[]).filter(x=>x.cardId).map(choice=>{
  const fights=(report.results||[]).map((r,index)=>({r,index})).filter(({r})=>r.practice?.config.depth>choice.depth&&r.practice.deck.includes(choice.cardId)&&r.practice.pool.some(c=>c.id===choice.cardId&&(choice.kind!=='evolve'||c.upgraded)));
  return {...choice,equipped:fights.length,casts:fights.reduce((n,{r})=>n+(r.stats.cards[0][choice.key]||0),0),used:fights.filter(({r})=>(r.stats.cards[0][choice.key]||0)>0).map(x=>x.index)};
 });}
 window.ExpeditionGrowth={offers,uses,rates:{upgrade:.10,card:.10,elite:.20}};
})();
