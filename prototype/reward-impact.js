'use strict';
(()=>{
  const D=window.GameData,T=window.CardTraits;
  // These are card capabilities, not promises about the whole team's basic AI.
  const labels={healSingle:'단일 회복',healAll:'전체 회복',healNearby:'주변 회복',block:'적 카드 공격 차단',taunt:'도발',shieldSelf:'자기 보호막',shieldAlly:'동료 보호막',armor:'전체 피해 감소',rescue:'동료 구출 이동',reposition:'위험 구역 재배치',singleAttack:'단일 공격',allAttack:'적 전체 공격',areaAttack:'지점 범위 공격',lineAttack:'직선 공격',approach:'접근 공격',knock:'밀치기',finisher:'부상자 마무리',retreat:'공격 후 거리 벌리기',counter:'피격 후 반격',share:'동료 피해 분담',escortMove:'동료 곁 이동',chain:'처치 후 추가 추격'};
  const important=new Set(['healSingle','healAll','healNearby','block','taunt','shieldSelf','shieldAlly','armor','rescue','reposition','counter','share']);
  const effects={retreatStrike:['retreat'],counterWard:['counter'],coverWard:['escortMove','share','counter'],executeChain:['chain']};
  function capabilities(card){
    const d=D.definition(card),out=[];
    if(d.movement)return [d.movement==='rescue'?'rescue':'reposition'];
    if(d.power>0){if(['heal','cleanse'].includes(d.kind))out.push('healSingle');if(['healAll','blessing'].includes(d.kind))out.push(d.spatial==='circleHeal'?'healNearby':'healAll');if(['attack','execute','pierce','mark','slow'].includes(d.kind))out.push('singleAttack');if(d.kind==='area')out.push(d.spatial==='line'?'lineAttack':d.radius?'areaAttack':'allAttack');}
    if(d.kind==='ward'&&d.power>0)out.push(d.self?'shieldSelf':'shieldAlly');
    if(d.duration>0){if(d.kind==='guard')out.push('block');if(d.kind==='taunt')out.push('taunt');if(d.kind==='armor')out.push('armor');}
    if(d.dash||d.approach)out.push('approach');if(d.knock)out.push('knock');if(d.kind==='execute')out.push('finisher');
    return out.concat(effects[window.CharacterData.skill(card.key).type]||[]);
  }
  const count=(cards,key)=>cards.filter(c=>c.key===key).length;
  function analyze(cards,outId,incoming){
    const out=cards.find(c=>c.id===outId);
    if(!out||!D.cards[incoming?.key]||cards.some(c=>c.id===incoming.id))return null;
    const after=cards.filter(c=>c.id!==outId).concat({...incoming});
    const beforeTraits=T.summary(cards),afterTraits=T.summary(after);
    const traits=afterTraits.map(n=>{const p=beforeTraits.find(t=>t.id===n.id);return {id:n.id,name:n.name,before:p.count,after:n.count,beforeLevel:p.level,afterLevel:n.level,next:n.next};});
    const beforeFunctions=new Set(cards.flatMap(capabilities)),afterFunctions=new Set(after.flatMap(capabilities));
    const lost=[...beforeFunctions].filter(f=>!afterFunctions.has(f)),gained=[...afterFunctions].filter(f=>!beforeFunctions.has(f));
    const warnings=[];
    if(out.upgraded&&!(out.key===incoming.key&&incoming.upgraded))warnings.push({type:'evolution',text:`진화된 ${D.cards[out.key].name} 한 장이 대기로 이동합니다.`});
    for(const f of lost)if(important.has(f))warnings.push({type:'capability',capability:f,text:`편성 덱의 ${labels[f]} 카드가 없어집니다.`});
    for(const t of traits)if(t.afterLevel<t.beforeLevel)warnings.push({type:'trait',trait:t.id,text:`${t.name} ${t.beforeLevel}→${t.afterLevel}단계${t.afterLevel===0?' · 특성 효과 비활성':''}`});
    const copies=[...new Set([out.key,incoming.key])].map(key=>({key,name:D.cards[key].name,before:count(cards,key),after:count(after,key),beforeEvolved:cards.filter(c=>c.key===key&&c.upgraded).length,afterEvolved:after.filter(c=>c.key===key&&c.upgraded).length}));
    return {out:{...out},incoming:{...incoming},size:cards.length,traits,copies,lost,gained,warnings};
  }
  function traitText(x){return x.traits.filter(t=>t.before!==t.after||t.beforeLevel!==t.afterLevel).map(t=>`${t.name} ${t.before}→${t.after}종${t.beforeLevel!==t.afterLevel?' · '+t.beforeLevel+'→'+t.afterLevel+'단계':''}`).join(' / ')||'특성 단계·종류 수 유지';}
  function brief(x){return x?.warnings.map(w=>w.type==='capability'?`${labels[w.capability]} 카드 없음`:w.type==='evolution'?'진화 한 장 대기로':w.text).join(' · ')||'';}
  // A conservative benchmark policy, not a prediction of optimal player choices.
  function safeReplacement(cards,incoming){
    const pool=cards.concat(incoming.id?incoming:{...incoming,id:'preview:replacement'});
    const target=pool.at(-1);
    return cards.map(c=>({card:c,impact:analyze(cards,c.id,target)})).filter(x=>x.impact&&!x.impact.warnings.length&&!D.validateDeck(cards.map(c=>c.id===x.card.id?target.id:c.id),pool)).sort((a,b)=>{
      const loss=x=>x.impact.traits.reduce((n,t)=>n+Math.max(0,t.before-t.after),0);
      return loss(a)-loss(b)||count(cards,b.card.key)-count(cards,a.card.key)||a.card.id.localeCompare(b.card.id);
    })[0]?.card||null;
  }
  window.RewardImpact={labels,capabilities,analyze,traitText,brief,safeReplacement};
})();
