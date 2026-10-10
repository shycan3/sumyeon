'use strict';
(() => {
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const unitCost=(cost,scale)=>1/(1+Math.max(0,cost)/scale);
  const rank=rows=>rows.sort((a,b)=>b.score-a.score||a.target.localeCompare(b.target));
  // Policies read a frozen context and propose data. Only the engine executes it.
  function rolePolicy(c){
    const a=c.actor,foes=c.actors.filter(b=>b.side!==a.side&&b.hp>0),friends=c.actors.filter(b=>b.side===a.side&&b.hp>0&&b.id!==a.id);
    const hunting=a.side===1&&(c.strategy==='hunt'||c.strategy==='boss'&&c.phase===2)&&a.role!==3;
    return foes.map(b=>{
      let cost,scale;const spatial=c.targetingRulesVersion===1&&!hunting&&!(a.role===0&&a.stance===0&&friends.length)&&!(a.role===1&&a.stance===1);
      if(a.side===1&&c.focus==='support'&&foes.some(b=>b.role===3)){return {target:b.id,score:unitCost((b.role===3?0:3)+distance(a,b)/600,1),tie:0,spatial:false,source:'role',reason:'개전 지원가 압박'};}
      if(hunting){cost=b.hp/b.max;scale=1;}
      else if(a.role===0&&a.stance===0&&friends.length){cost=Math.min(...friends.map(f=>distance(b,f)*(f.hp/f.max<.5?.7:1)));scale=230;}
      else if(a.role===1&&a.stance===1){cost=b.hp;scale=100;}
      else {cost=distance(a,b)*(c.targetingRulesVersion===1?1:b.role===0&&b.stance===0?.64:1);scale=230;}
      return {target:b.id,score:unitCost(cost,scale),tie:hunting?b.hp:spatial?(b.role===0&&b.stance===0?0:1):0,spatial,source:'role',reason:hunting?'부상 적 압박':a.role===0&&a.stance===0?'동료 주변 위협 견제':a.role===1&&a.stance===1?'약한 적 추격':spatial?'가까운 적 우선 · 동거리 보호자 우대':'역할에 맞는 표적 유지'};
    });
  }
  const legacyPreferences={serin:{type:'woundedAllyThreat',stance:0,below:.7,scale:230}};
  const preference=c=>c.preference||legacyPreferences[c.policy]||null;
  function characterPolicy(c,rows){
    const p=preference(c);
    if(p?.type!=='woundedAllyThreat'||c.actor.stance!==p.stance)return rows;
    const ally=c.actors.filter(b=>b.side===c.actor.side&&b.hp>0&&b.id!==c.actor.id).sort((a,b)=>a.hp/a.max-b.hp/b.max||a.id.localeCompare(b.id))[0];
    if(!ally||ally.hp/ally.max>=p.below)return rows;
    // Character preference uses the same 0..1 scale. No additive arbitrary scores.
    return rows.map(row=>({...row,score:unitCost(distance(c.actors.find(b=>b.id===row.target),ally),p.scale),spatial:false,source:'character',reason:'부상 동료 주변의 적 견제'}));
  }
  function defaults(a,t=0){return {target:null,nextThinkAt:t,holdUntil:t,stance:a.stance,goal:'',reason:''};}
  function plan(c,memory=defaults(c.actor,c.t)){
    const a=c.actor,valid=id=>c.actors.find(b=>b.id===id&&b.hp>0),foes=c.actors.filter(b=>b.side!==a.side&&b.hp>0);
    let rows=characterPolicy(c,rolePolicy(c));
    rows.sort((a,b)=>b.score-a.score||a.tie-b.tie||a.target.localeCompare(b.target));
    const state={...memory},modern=c.targetingRulesVersion===1,stable=modern||!!preference(c),current=rows.find(r=>r.target===memory.target);
    let chosen=rows[0];
    let rangeChoice=false;
    if(modern&&current?.spatial&&!c.purpose&&!c.forced&&a.role>=2&&distance(a,valid(current.target))>a.range){
      const reachable=rows.find(r=>r.spatial&&distance(a,valid(r.target))<=a.range);
      if(reachable){chosen=reachable;rangeChoice=true;}
    }
    if(current&&memory.stance===a.stance&&!rangeChoice){
      if(stable&&c.t<memory.nextThinkAt)chosen=current;
      else if(stable&&chosen&&(c.t<memory.holdUntil||chosen.score-current.score<(modern&&!preference(c)?.025:.08)&&!(modern&&chosen.spatial&&chosen.score===current.score&&chosen.tie<current.tie)))chosen=current;
    }
    if(rangeChoice||!current||memory.stance!==a.stance||c.t>=memory.nextThinkAt){
      state.target=chosen?.target||null;state.nextThinkAt=c.t+(stable?.2:0);state.stance=a.stance;
      if(state.target!==memory.target)state.holdUntil=c.t+(modern&&!preference(c)?.45:stable?.6:0);
    }
    let target=chosen?.target||null,move={mode:a.role===2&&a.stance===0?'kite':'toward',target},goal='engage',reason=chosen?.reason||'유효한 적 없음';
    const purpose=c.purpose,protectedAlly=purpose?.kind==='cover'&&valid(purpose.target);
    if(purpose?.kind==='chase'&&valid(purpose.target)){target=purpose.target;move={mode:'toward',target};goal='chase';reason='카드로 지정한 적 추격';}
    else if(protectedAlly){target=rank(foes.map(b=>({target:b.id,score:unitCost(distance(b,protectedAlly),230)})))[0]?.target||null;move={mode:'follow',target:protectedAlly.id,offset:48};goal='cover';reason='카드로 지정한 동료 엄호';}
    // Forced targeting is a constraint applied after preferences, not a large score.
    if(c.forced){target=c.forced;reason=protectedAlly?'동료 곁 유지 · 도발 대상 견제':'도발 대상 견제';if(!protectedAlly)move={mode:'toward',target};}
    let basic={mode:'attack',target};
    if(a.role===3&&a.stance===0&&a.cool<=0){const ally=c.actors.filter(b=>b.side===a.side&&b.hp>0).sort((x,y)=>x.hp/x.max-y.hp/y.max||x.id.localeCompare(y.id))[0];if(ally&&ally.hp<ally.max-1){basic={mode:'heal',target:ally.id};move={mode:'none',target:null};goal='heal';reason='부상 동료 기본 회복';}}
    if(rangeChoice&&goal==='engage'&&!c.forced)reason='사거리 안의 적 우선 · 불필요한 추격 중단';
    state.goal=goal;state.reason=reason;
    return {actor:a.id,move,basic,attackTarget:target,goal,reason,state};
  }
  window.ActorAI={defaults,rolePolicy,characterPolicy,plan};
})();
