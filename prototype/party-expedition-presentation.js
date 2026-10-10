(function(root){
  'use strict';
  const supportTypes=['ward','heal'];
  const name=(b,id)=>b.actor(id)?.name||'대상';
  const living=(b,ids)=>ids.filter(id=>b.actor(id)?.hp>0);
  const targets=(b,i)=>i.type==='area'?b.s.allies.filter(a=>a.hp>0).map(a=>a.id):i.type==='volley'?living(b,i.targets||[]):i.target&&b.actor(i.target)?.hp>0?[i.target]:[];
  function attackText(b,i,enemy,future=false){
    const type=future?i.nextType:i.type,ids=future?type==='area'?b.s.allies.filter(a=>a.hp>0).map(a=>a.id):type==='volley'?living(b,i.nextTargets||[]):living(b,[i.nextTarget]):targets(b,i);
    if(!ids.length)return '공격 취소 · 대상 쓰러짐';
    const damage=future?Math.max(0,(i.nextDamage||0)-enemy.weak):b.intentDamage(i),to=type==='area'?'전체':ids.map(id=>name(b,id)).join('·');
    return `${to} · ${type==='volley'?'각 ':''}피해 ${damage}`;
  }
  function intentText(b,enemy){
    if(enemy.hp<=0)return '격파';
    const i=b.s.intents.find(x=>x.actor===enemy.id);if(!i)return '';
    if(i.type==='prepare'){
      if(supportTypes.includes(i.nextType)){const target=b.actor(i.nextTarget);return target?.hp>0?`준비 · 다음 ${target.name} ${i.nextType==='ward'?'보호':'회복'} ${i.nextAmount}`:'준비 취소 · 대상 격파';}
      return `준비 · 다음 ${attackText(b,i,enemy,true)}`;
    }
    if(supportTypes.includes(i.type)){const target=b.actor(i.target);return target?.hp>0?`→ ${target.name} · ${i.type==='ward'?'보호':'회복'} ${i.amount}`:'지원 취소 · 대상 격파';}
    return `→ ${attackText(b,i,enemy)}`;
  }
  function intentDetail(b,enemy){
    const i=b.s.intents.find(x=>x.actor===enemy.id);if(!i)return '';
    const phase=i.phase==='surface'?'수면 위':i.phase==='submerged'?'침수':'';
    const timing=i.type==='prepare'?'이번 라운드에는 준비만 합니다. 다음 라운드의 고정 대상과 효과입니다.':'이번 라운드 종료 시 실행합니다.';
    const fixed=i.type==='volley'||i.nextType==='volley'?' 표시된 동료만 타격하며 대상이 쓰러져도 다른 동료로 바뀌지 않습니다.':supportTypes.includes(i.type)||supportTypes.includes(i.nextType)?' 지원 대상이 격파되면 취소됩니다.':' 대상은 이번 라운드 중 바뀌지 않습니다.';
    return `${phase?`${phase}${i.phaseChanged?' · 국면 전환':''}. `:''}${timing}${fixed}`;
  }
  function phaseText(b,enemy){const i=b.s.intents.find(x=>x.actor===enemy.id);return i?.phase==='surface'?`${i.phaseChanged?'국면 전환 · ':''}수면 위`:i?.phase==='submerged'?`${i.phaseChanged?'국면 전환 · ':''}침수`:'';}
  function threatText(b,ally){
    if(ally.hp<=0)return '';
    const amount=typeof b.incomingDamage==='function'?b.incomingDamage(ally.id):b.s.intents.filter(i=>b.actor(i.actor)?.hp>0&&targets(b,i).includes(ally.id)&&['attack','area','volley'].includes(i.type)).reduce((n,i)=>n+b.intentDamage(i),0);
    return amount>0?`받을 공격 ${amount} · 보호 후 ${Math.max(0,amount-ally.shield)}`:'';
  }
  // These cues use this completed action's events. A consumed opportunity alone
  // does not count as damage, a draw, energy, or added exposure.
  function contributions(before,after,Battle){
    const result={units:{},cards:{},links:[]};if(!before||!after)return result;
    const events=after.events||[],card=events.find(e=>e.type==='card'),b=Battle.restore(before);
    const add=(id,text,detail,target)=>{if(!id)return;const entry={text,detail};(result.units[id]||=[]).push(entry);if(target&&target!==id&&!result.links.some(l=>l.from===id&&l.to===target))result.links.push({from:id,to:target});};
    for(const e of events.filter(e=>e.type==='shield-carried'&&e.amount>0))add(e.actor,`등불 · 보호 ${e.amount} 이월`,`${name(b,e.target)}의 남은 보호 ${e.amount}이 다음 라운드로 이어졌습니다.`,e.target);
    if(!card)return result;
    const d=b.definition(card.card,card.choice),info=b.effectInfo(card.card,card.actor,card.choice),a=after.allies.find(x=>x.id===card.actor),zoneIndex=events.findIndex(e=>e.type==='zone'&&e.card===card.card),coreEvents=zoneIndex<0?events:events.slice(0,zoneIndex),direct=coreEvents.find(e=>e.type==='damage'&&e.direct);
    for(const e of coreEvents.filter(e=>e.type==='passive'&&e.amount>0)){
      if(e.actor==='navigator'&&direct)add(e.actor,'연속 항로 · 첫 타격 +2',`${name(b,card.actor)}의 ${d.name} 첫 직접 타격에 항해사가 피해 2를 더했습니다.`,direct.target);
      if(e.actor==='pilot'&&(direct||info?.shieldBonus&&coreEvents.some(e=>e.type==='shield'&&e.target===card.target)))add(e.actor,`항로 개척 · ${direct?'첫 타격':'대상 보호'} +3`,`앞선 유료 카드 뒤 ${d.name}의 ${direct?'첫 직접 타격':'대상 보호'}에 도선사가 3을 더했습니다.`,direct?.target||card.target);
    }
    const ability=coreEvents.find(e=>e.type==='ability');
    if(ability&&a?.hp>0&&info?.eligible){
      const actor=card.actor;
      if(['navigator','pilot'].includes(actor)&&direct)add(actor,`${actor==='navigator'?'선회':'도선'} · 첫 타격 +${actor==='navigator'?4:5}`,`${d.name}의 첫 직접 타격에 실행 특성이 적용됐습니다.`,direct.target);
      else if(['navigator','pilot','lightkeeper'].includes(actor)){
        const amount=actor==='pilot'?5:4,e=coreEvents.find(e=>e.type==='ability-effect'&&e.actor===actor&&e.effect==='shield')||(!before.voyage?.contentVersion||before.voyage.contentVersion==='voyage-1'?coreEvents.findLast(e=>e.type==='shield'&&e.amount===amount&&(actor==='navigator'||e.target===actor)):null);
        if(e)add(actor,`${actor==='navigator'?'선회':actor==='pilot'?'도선':'점등'} · 보호 +${amount}`,`${name(b,e.target)}에게 실행 특성으로 보호 ${amount}를 부여했습니다.`,e.target);
      }
      if(actor==='diver'&&after.enemies.find(e=>e.id===card.target)?.hp>0){
        const exposureEvents=coreEvents.map((e,index)=>({e,index})).filter(x=>x.e.type==='exposure'&&x.e.target===card.target),last=exposureEvents.at(-1);
        if(last){let prior=b.actor(card.target).exposure;coreEvents.slice(0,last.index).forEach(e=>{if(e.target===card.target){if(e.type==='exposure-consumed')prior=0;else if(e.type==='exposure')prior=e.amount;}});const gained=last.e.amount-prior;if(gained>0)add(actor,`침투 · 노출 +${gained}`,`${name(b,card.target)}의 노출을 ${prior}에서 ${last.e.amount}로 늘렸습니다. 다음 카드 타격이 소비합니다.`,card.target);}
      }
      if(actor==='sounder'){
        const observed=coreEvents.find(e=>e.type==='ability-effect'&&e.actor===actor&&e.effect==='draw'&&e.amount>0);
        if(observed){const i=coreEvents.indexOf(observed),drawn=coreEvents.slice(0,i).filter(e=>e.type==='draw').slice(-observed.amount);add(actor,`정밀 관측 · ${observed.amount}장 뽑기`,`${d.name} 실행 특성으로 ${drawn.map(e=>b.definition(e.card).name).join(', ')}을 실제로 뽑았습니다.`);for(const e of drawn)result.cards[e.card]={text:'측심 · 추가 드로우',detail:'측심사의 정밀 관측으로 뽑은 카드입니다.'};}
      }
      if(actor==='salvager'&&events.some(e=>e.type==='zone'&&e.card===card.card&&e.zone==='reserve'))add(actor,'인양 · 다음 손패 확보',`${d.name} 사본을 다음 손패 한 자리에 예약했습니다.`);
    }
    for(const e of coreEvents.filter(e=>e.type==='energy'&&e.actor==='diver'&&e.amount>0))add('diver',`심층 공명 · 에너지 +${e.amount}`,`${d.name}이 노출을 소비하여 파티 에너지 ${e.amount}를 회복했습니다.`,card.actor);
    const mark=before.salvageMarks?.[card.card];
    if(mark&&mark.returnedRound===before.round&&card.actor!==mark.actor&&card.cost<d.cost)add('salvager',`인계 · 비용 ${d.cost}→${card.cost}`,`${name(b,card.actor)}가 인양한 ${d.name} 사본을 사용해 에너지 ${d.cost-card.cost}를 덜 썼습니다.`,card.actor);
    return result;
  }
  function reservationDetail(b,card){const mark=b.s.salvageMarks?.[card],d=b.definition(card);return mark?`인양사가 예약한 ${d.name} 사본. ${mark.returnedRound===b.s.round?'이번 라운드에 다른 생존 동료가 사용하면 비용 −1, 최소 1.':'다음 손패 한 자리를 차지합니다.'}`:`${d.name}의 카드 효과로 보관한 사본. 다음 손패 한 자리를 차지합니다.`;}
  const api={intentText,intentDetail,phaseText,threatText,contributions,reservationDetail};
  if(typeof module!=='undefined')module.exports=api;root.PartyExpeditionPresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
