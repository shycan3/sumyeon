'use strict';
(()=>{
 const K=window.CharacterData,D=window.GameData,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function guide(view,run){
  if(view==='starting')return {step:'출발',text:'덱 컨셉과 동료를 고르세요. 전투는 자동으로 진행하고, 보상으로 이번 원정의 덱을 바꿉니다.'};
  if(view!=='run'||!run||run.stage==='battle')return null;
  const stages={map:['경로','적과 보상을 확인하고 방을 고르세요. HP는 다음 교전으로 이어집니다.'],prep:['준비','적의 위협에 맞춰 배치·덱·방침을 준비하세요. 전투가 시작되면 동료가 자동으로 싸웁니다.'],result:['복기',run.current?.type==='boss'?'보스를 격파했습니다. 원정을 마치고 이번 덱의 변화와 대표 장면을 확인하세요.':'실제로 사용한 카드와 남은 HP를 확인한 뒤 보상을 선택하세요.'],reward:['보상','교체할 카드의 능력·특성과 얻고 잃는 효과를 비교하세요. 대기에 둔 카드는 편성해야 전투에 나옵니다.'],loot:['편성','덱은 20장입니다. 보상을 편성하거나 대기에 둔 뒤 다음 방으로 이동하세요.'],upgrade:['성장','진화·대표 운용 중 하나를 고르세요. 선택의 대가와 다음 적을 함께 확인하세요.'],camp:['정비',run.growthRulesVersion===2?'카드 제안·집중 진화·회복 중 하나를 고르세요. 성장 선택의 정비로는 쓰러진 동료가 복귀하지 않습니다.':'카드와 회복 중 지금 필요한 것을 고르세요. 생존자 회복과 쓰러진 동료 복귀는 다릅니다.'],done:['계속','정비가 끝났습니다. 다음 방에서 새 구성의 싸우는 모습을 확인하세요.']};
  const x=stages[run.stage];return x?{step:x[0],text:x[1]}:null;
 }
 function guidePanel(view,run){const g=guide(view,run);return g?`<aside class="flow-guide" aria-label="현재 할 일"><strong>${esc(g.step)}</strong><span>${esc(g.text)}</span></aside>`:'';}
 function preparationNote(run,preview){
  if(!run||!preview?.combat||preview.enemies.length<4)return '';
  const cards=run.deck.map(id=>run.pool.find(c=>c.id===id)).filter(c=>c&&run.hp[c.casterSlot??D.cards[c.key].role]>0),area=cards.filter(c=>D.cards[c.key].kind==='area').length,healing=cards.filter(c=>['healAll','blessing'].includes(D.cards[c.key].kind)||D.cards[c.key].spatial==='circleHeal').length;
  return area&&healing?'':`생존 동료: 광역 공격 ${area}장 · 범위/전체 회복 ${healing}장`;
 }
 function retryPlan(report){
  if(!report||report.challenge||!Array.isArray(report.initialDeck))return null;
  const template={};for(const c of report.initialDeck){if(c.upgraded||!K.playableCharacters().some(p=>p.base.includes(c.key)))return null;template[c.key]=(template[c.key]||0)+1;}
  if(K.validateTemplate(template))return null;
  const party=report.results?.find(r=>r.practice?.config.identityVersion===1)?.practice.config.party;
  const character=party?.find(p=>p.slot===2)?.characterId|| (template.ria_focus?'ria':'ranger');
  if(!['ria','ranger'].includes(character))return null;
  const support=party?.find(p=>p.slot===3)?.characterId||(window.SupportContent?.infer?.(template)||'medic');if(!['medic','noa'].includes(support)||support==='noa'&&window.SupportContent?.version!==1&&!window.SupportContent?.authoring)return null;const expected=window.TrialCharacter.party(character);if(window.SupportContent?.version===1)expected[3].characterId=support;
  if(party&&JSON.stringify(party)!==JSON.stringify(expected))return null;
  const {pool,ids}=K.templatePool(template);if(ids.some(id=>!expected.some(p=>K.canCast(pool.find(c=>c.id===id),K.character(p.characterId)))))return null;
  return {template,character,support};
 }
 function advice(result){
  if(!result)return null;const ko=result.insights?.firstKO;
  if(ko){const name=result.actors?.find(a=>a.id===ko.actor)?.name||'동료',cause=D.cards[ko.cause]?.name||D.hostile[ko.cause]?.name||'기본 공격';
   return {kind:'ko',evidence:`${ko.at.toFixed(1)}초에 ${name}이 먼저 쓰러졌습니다 · ${cause}`,proposal:'이 전투의 연습에서 해당 동료의 배치를 뒤로 옮기거나 보호 카드를 보강해 비교하세요. 한 번에 하나만 바꾸면 차이를 읽기 쉽습니다.'};}
  if(result.mechanic?.hits>0)return {kind:'hazard',evidence:`범위 공격에 ${result.mechanic.hits}회 피격했습니다.`,proposal:'같은 적의 연습에서 시작 배치를 벌리거나 카드 이동·보호 구성을 비교하세요. 기본 AI가 위험 구역을 완벽히 피하지는 않습니다.'};
  const unused=result.ultimates?.actors.filter(a=>a.charge===100)||[];
  if(unused.length)return {kind:'prepared',evidence:`${unused.length}명의 궁극기가 준비된 채 전투가 끝났습니다.`,proposal:'준비와 발동은 다릅니다. 현재 카드의 생존 가치가 우선됐을 수 있습니다. 공격·보호 방침을 바꾼 연습에서 카드 사용과 생존을 함께 비교하세요.'};
  if(!result.insights?.complete)return {kind:'unknown',evidence:'이 전투의 세부 행동 기록이 일부 없습니다.',proposal:'같은 적의 연습에서 덱과 배치를 하나씩 바꿔 비교하세요. 기록만으로 원인을 확정할 수 없습니다.'};
  return {kind:'stable',evidence:'기록된 아군 전투불능과 범위 공격 피격이 없습니다.',proposal:'다른 보상·경로를 골라 같은 캐릭터의 운영이 어떻게 달라지는지 비교해보세요.'};
 }
 function nextPanel(report){const results=report.results||[],index=results.findIndex(r=>r.winner!==0),chosen=index>=0?index:results.length-1,r=results[chosen],a=advice(r);return `<section class="panel flow-next"><h2>${report.success?'다음 원정에서 바꿔볼 것':'다시 준비할 것'}</h2>${a?`<p><strong>${esc(r.name)}</strong> · ${esc(a.evidence)}</p><p>${esc(a.proposal)}</p><p class="note">관측된 장면을 바탕으로 한 비교 제안입니다. 패배 원인이나 승리를 보장하지 않습니다.</p>${r.practice?`<button data-action="practice-open" data-origin="report" data-result="${chosen}">이 전투에서 한 가지 바꿔보기</button>`:''}`:'<p>전투 기록이 없습니다. 출발 덱을 확인하고 새 원정을 준비하세요.</p>'}${retryPlan(report)?'<button data-action="retry-start">이전 출발 덱으로 준비</button><p class="note">기초 덱·사수·지원가 선택을 불러옵니다. 새 시드·현재 레벨로 출발하며 보상·진화·운용 분기는 초기화됩니다.</p>':''}</section>`;}
 window.ExpeditionFlow={guide,guidePanel,preparationNote,retryPlan,advice,nextPanel};
})();
