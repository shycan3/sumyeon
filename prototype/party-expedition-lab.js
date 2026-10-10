(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STANDARD=[['navigator','diver','pilot','lightkeeper'],['navigator','sounder','salvager','lightkeeper'],['diver','pilot','sounder','salvager']];
  const ALL_ROLES=['navigator','diver','pilot','sounder','salvager','lightkeeper'];
  const POLICY={balanced:'균형',aggressive:'공격 중시',cautious:'생존 중시'},PHASE={blessing:'시작 유물',map:'경로 선택',battle:'전투',reward:'카드 보상',relicreward:'유물 보상',interlude:'정비',shop:'상점',event:'사건',patron:'중간 계약',waiting:'대기',won:'원정 승리',lost:'원정 패배'};
  const RESULT={won:'승리',lost:'패배',aborted:'중단',error:'오류'};
  const PAGE=30;
  let batch=null,timer=null,epoch=0,running=false,paused=false,stopped=false,battlePage=0,lastCount=-1,currentConfig=null,summary=null;
  function roleName(id){return PartyExpedition.ROLES.find(r=>r.id===id)?.name||id;}
  function partyName(p){return(Array.isArray(p)?p:String(p||'').split(/[,+|]/)).map(roleName).join(' · ');}
  function combinations(list,n){const result=[];function next(index,part){if(part.length===n){result.push(part);return;}for(let i=index;i<=list.length-(n-part.length);i++)next(i+1,[...part,list[i]]);}next(0,[]);return result;}
  function currentParty(){
    const query=new URLSearchParams(location.search).get('party');if(query){const ids=query.split(',');if(ids.length===4&&new Set(ids).size===4&&ids.every(id=>ALL_ROLES.includes(id)))return ids;}
    return STANDARD[0];
  }
  const CURRENT=currentParty();
  if(new URLSearchParams(location.search).has('party'))$('party-mode').value='current';
  $('party-checks').innerHTML=ALL_ROLES.map(id=>`<label><input type="checkbox" value="${id}" ${CURRENT.includes(id)?'checked':''}>${esc(roleName(id))}</label>`).join('');
  function manualParty(){return [...$('party-checks').querySelectorAll('input:checked')].map(el=>el.value);}
  function parties(){return $('party-mode').value==='all'?combinations(ALL_ROLES,4):$('party-mode').value==='current'?[manualParty()]:STANDARD;}
  function config(){return{seedStart:Number($('seed-start').value),seedCount:Number($('seed-count').value),policies:$('policy').value==='all'?Object.keys(POLICY):[$('policy').value],parties:parties(),breakMode:$('break-mode').value,difficulty:$('difficulty').value,maxSteps:Number($('max-steps').value),maxRounds:Number($('max-rounds').value)};}
  function updateConfig(){const c=config(),n=c.seedCount*c.policies.length*c.parties.length;$('batch-size').textContent=`총 ${Number.isFinite(n)?n:0}회 원정${n>500?' · 500회 상한 초과':''}`;$('batch-size').classList.toggle('warn',n>500);$('manual-party').hidden=$('party-mode').value!=='current';$('party-description').textContent=$('party-mode').value==='current'?`선택 파티: ${partyName(manualParty())} · ${manualParty().length}/4명`:$('party-mode').value==='all'?'여섯 문양 중 네 명을 고르는 모든 조합을 비교합니다.':STANDARD.map((p,i)=>`${i+1}. ${partyName(p)}`).join(' / ');}
  function records(){return batch?.records||[];}
  function progress(){return batch?.progress||{completed:0,total:0};}
  function integer(v){return Number(v||0).toLocaleString('ko-KR');}
  function decimal(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v).toFixed(1):'—';}
  const runSeed=r=>r.config?.seed??r.seed,runParty=r=>r.config?.party||r.initial?.party||r.party||[],runPolicy=r=>r.config?.policy||r.policy;
  function badge(status){return`<span class="badge ${esc(status)}">${esc(RESULT[status]||status||'—')}</span>`;}
  function setState(message){$('status').textContent=message;$('start').disabled=running||paused;$('pause').disabled=!batch||stopped||(!running&&!paused);$('pause').textContent=paused?'재개':'일시정지';$('stop').disabled=!batch||stopped||(!running&&!paused);document.querySelectorAll('#lab-config input,#lab-config select').forEach(el=>el.disabled=running||paused);}
  function decisionName(d,state){
    const args=d?.args||[],method=d?.method,b=state?.battle;
    if(method==='play')return`${readableCard(b?.cards?.[args[0]]||args[0])} · ${actorName(args[1],b)} → ${actorName(args[2],b)}`;
    if(method==='endRound')return'라운드 종료 / 적 행동';
    if(method==='discardForSounder')return`측심 정리 · ${readableCard(b?.cards?.[args[0]]||args[0])}`;
    if(method==='useTool')return`도구 ${Number(args[0])+1} · ${actorName(args[1],b)}`;
    if(method==='choosePath')return`경로 · ${state?.choices?.find(c=>c.id===args[0])?.name||args[0]}`;
    if(method==='chooseReward')return args[0]?`카드 보상 · ${readableCard(args[0])}`:'카드 보상 건너뛰기';
    if(method==='chooseBlessing'||method==='chooseRelic')return`유물 · ${PartyExpeditionVoyageCombat.RELICS[args[0]]?.name||args[0]||'건너뛰기'}`;
    if(method==='choosePact')return args[0]===null?'계약 거절':`계약 ${Number(args[0])+1}`;
    if(method==='chooseInterlude'){
      const label={heal:'회복',upgrade:'강화',remove:'삭제',learn:'기록 획득',buy:'구매',continue:'출발','event-relic':'사건 유물','event-gold':'사건 기록 조각','event-tool':'도구 획득','event-enchant':'각인','event-clone':'복제','event-transform':'카드 교환'}[args[0]]||args[0];
      const item=state?.deck?.find(c=>c.id===args[1]);return`${label}${item?' · '+readableCard(item):typeof args[1]==='string'?' · '+(PartyExpeditionVoyageCombat.RELICS[args[1]]?.name||PartyExpedition.CARDS[args[1]]?.name||args[1]):''}`;
    }
    return method||'선택';
  }
  function renderProgress(transition){const p=progress();$('progress').max=Math.max(1,p.total||1);$('progress').value=p.completed||0;$('progress-label').textContent=`${integer(p.completed)} / ${integer(p.total)}회`;$('current-run').textContent=stopped?'사용자 중단':batch?.done?'배치 종료':p.currentSeed!==null&&p.currentSeed!==undefined?`시드 ${p.currentSeed} · ${POLICY[p.policy]||p.policy||'—'} · ${partyName(p.party)} · ${PHASE[p.phase]||p.phase||'진행 중'}`:batch?.done?'배치 종료':'대기 중';const reason=p.reason||transition?.reason||transition?.decision?.reason;const decision=transition?.decision?decisionName(transition.decision,transition.before):transition?.label||transition?.description||transition?.actionName;const txt=[decision,reason].filter(Boolean).join(' · ');if(txt)$('current-decision').textContent=txt;}
  function allBattles(){return records().flatMap((run,ri)=>(run.battles||[]).map((b,bi)=>({run,ri,b,bi})));}
  function bStatus(b){return b.status||b.outcome||b.result;}
  function bName(b){return b.encounterName||b.name||(b.enemies||b.entry?.enemies||[]).map(e=>e.name||e.pattern).join(' + ')||b.encounter||'전투';}
  function bFloor(b){return b.floorLabel??b.floor??b.region??'—';}
  function bDamage(b){return b.metrics?.enemyDamage??b.damageTaken??b.metrics?.damageTaken??b.totals?.damageTaken??b.damage??0;}
  function bBlocked(b){return b.blocked??b.metrics?.blocked??b.totals?.blocked??b.shieldAbsorbed??0;}
  function bRounds(b){return b.rounds??b.metrics?.rounds??b.end?.round??0;}
  function renderBattles(){
    const items=allBattles().filter(x=>$('battle-filter').value==='all'||bStatus(x.b)===$('battle-filter').value),maxPage=Math.max(0,Math.ceil(items.length/PAGE)-1);
    battlePage=Math.min(battlePage,maxPage);
    $('battles').innerHTML=items.slice(battlePage*PAGE,(battlePage+1)*PAGE).map(({run,ri,b,bi})=>`<tr><td>${esc(runSeed(run))}</td><td>${esc(bFloor(b))}구역 · ${esc(bName(b))}</td><td class="party-cell">${esc(POLICY[runPolicy(run)]||runPolicy(run))}<small>${esc(partyName(runParty(run)))}</small></td><td>${badge(bStatus(b))}</td><td>${esc(bRounds(b))}</td><td>${integer(bDamage(b))} / ${integer(bBlocked(b))}</td><td><button type="button" data-battle="${ri}:${bi}">선택·피해 보기</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">이 결과의 전투가 없습니다.</td></tr>';
    $('battle-page').textContent=items.length?`${battlePage*PAGE+1}–${Math.min(items.length,(battlePage+1)*PAGE)} / ${integer(items.length)}개 전투`:'0개 전투';$('battle-prev').disabled=battlePage===0;$('battle-next').disabled=battlePage>=maxPage;
  }
  function renderResults(force=false){
    if(!batch||(!force&&lastCount===records().length))return;
    lastCount=records().length;summary=PartyExpeditionTelemetry.summarize(records());const r=summary.runs||{},b=summary.battles||{};
    $('metrics').innerHTML=`<div><span>완료 원정</span><strong>${integer((r.won||0)+(r.lost||0))}</strong><small>승리 ${integer(r.won)} · 패배 ${integer(r.lost)}</small></div><div><span>완료 전투</span><strong>${integer((b.won||0)+(b.lost||0))}</strong><small>승리 ${integer(b.won)} · 패배 ${integer(b.lost)} · 중단 ${integer(b.aborted)} · 오류 ${integer(b.error)}</small></div><div><span>원정 중단 / 오류</span><strong>${integer(r.aborted)} / ${integer(r.error)}</strong><small>승패 통계에서 분리</small></div>`;
    $('signals').innerHTML=(summary.signals||[]).map(s=>`<li>${esc(typeof s==='string'?s:s.message||JSON.stringify(s))}</li>`).join('')||'<li>아직 비교할 표본이 부족합니다.</li>';
    $('encounters').innerHTML=(summary.encounters||[]).map(e=>`<tr><td>${esc(e.name)}<small class="muted"> ${esc(e.tier==='elite'?'정예':e.tier==='boss'?'보스':'')}</small></td><td>${esc(e.floor)}</td><td class="party-cell">${esc(partyName(e.party))}<small>${esc(POLICY[e.policy]||e.policy)}</small></td><td>${integer(e.n)}</td><td>${integer(e.won)} / ${integer(e.lost)} / ${integer(e.aborted)} / ${integer(e.error)}</td><td>${decimal(e.meanDamage)}${e.outcomes?`<small class="muted"> 승 ${decimal(e.outcomes.won?.meanDamage)} / 패 ${decimal(e.outcomes.lost?.meanDamage)}</small>`:''}</td><td>${decimal(e.meanBlocked)}</td><td>${decimal(e.meanRounds)}</td><td>${integer(e.deaths)}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">아직 기록이 없습니다.</td></tr>';
    $('cards').innerHTML=(summary.cards||[]).map(c=>`<tr><td>${esc(c.name||c.kind)}</td><td>${integer(c.plays)}</td><td>${integer(c.battlesPresent)} / ${integer(c.battlesDrawn)} / ${integer(c.battlesUsed)}</td><td>${integer(c.wonUsed)} / ${integer(c.lostUsed)}</td><td>${integer(c.damage)}</td><td>${integer(c.healing)}</td><td>${integer(c.shield)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">아직 기록이 없습니다.</td></tr>';
    if($('reach'))$('reach').textContent=(summary.reach||[]).map(e=>`${e.floor}구역: 도달 원정 ${e.runsReached} / 전투 진입 ${e.battlesEntered}`).join(' · ')||'완료된 원정의 구역별 도달 정보를 표시합니다.';
    const rs=records();$('run-count').textContent=`최근 ${Math.min(30,rs.length)}회 / 총 ${integer(rs.length)}회`;
    $('runs').innerHTML=rs.slice(-30).map((r,i)=>`<tr><td>${esc(runSeed(r))}</td><td class="party-cell">${esc(POLICY[runPolicy(r)]||runPolicy(r))}<small>${esc(partyName(runParty(r)))}</small></td><td>${badge(r.status||r.outcome)}</td><td>${integer(r.battles?.length)}</td><td>${esc(r.reason||r.error?.message||r.error||'—')}</td><td><button type="button" data-run="${rs.length-Math.min(30,rs.length)+i}">원정 선택</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">아직 기록이 없습니다.</td></tr>';
    renderBattles();$('download-json').disabled=!rs.length;$('download-csv').disabled=!rs.length;
  }
  function clearTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
  function schedule(){const token=epoch;timer=setTimeout(()=>{timer=null;if(!running||token!==epoch)return;try{const result=batch.step();renderProgress(result.transition);renderResults();if(result.done){running=false;paused=false;setState(`실험 완료 · ${integer(progress().completed)}회 원정`);$('current-decision').textContent='모든 설정 조합의 원정이 끝났습니다.';renderResults(true);}else schedule();}catch(error){running=false;paused=false;stopped=true;setState(`실행 오류 · ${error.message}`);$('current-decision').textContent='오류로 실행을 중지했습니다. 완료된 기록은 다운로드할 수 있습니다.';renderResults(true);}},5);}
  $('lab-config').addEventListener('submit',event=>{event.preventDefault();if(running||paused)return;if(!window.PartyExpeditionSimulation||!window.PartyExpeditionTelemetry){setState('실험 엔진을 불러오지 못했습니다. 페이지를 새로고침하세요.');return;}if(!$('lab-config').reportValidity())return;clearTimer();epoch++;try{const nextConfig=config(),nextBatch=PartyExpeditionSimulation.createBatch(nextConfig);currentConfig=nextConfig;batch=nextBatch;lastCount=-1;battlePage=0;stopped=false;paused=false;running=true;setState('원정을 실행하고 있습니다.');renderProgress();renderResults(true);schedule();}catch(error){running=false;setState(`설정 오류 · ${error.message}`);}});
  $('pause').addEventListener('click',()=>{if(paused){paused=false;running=true;epoch++;setState('원정을 다시 실행하고 있습니다.');schedule();}else if(running){running=false;paused=true;epoch++;clearTimer();setState('일시정지 · 재개하면 같은 결정부터 이어갑니다.');}});
  $('stop').addEventListener('click',()=>{if(!batch)return;running=false;paused=false;stopped=true;epoch++;clearTimer();if(typeof batch.stop==='function')batch.stop('user');renderProgress();renderResults(true);setState('사용자가 실험을 중단했습니다. 완료된 기록을 유지합니다.');});
  $('lab-config').addEventListener('change',updateConfig);$('battle-filter').addEventListener('change',()=>{battlePage=0;renderBattles();});$('battle-prev').addEventListener('click',()=>{battlePage--;renderBattles();});$('battle-next').addEventListener('click',()=>{battlePage++;renderBattles();});
  function download(name,type,text){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function filename(ext){return`sumyeon-lab-${currentConfig?.seedStart||1}-${new Date().toISOString().slice(0,10)}.${ext}`;}
  $('download-json').addEventListener('click',()=>download(filename('json'),'application/json;charset=utf-8',JSON.stringify({schemaVersion:'lab-1',exportedAt:new Date().toISOString(),config:currentConfig,summary:PartyExpeditionTelemetry.summarize(records()),records:records()},null,2)));
  $('download-csv').addEventListener('click',()=>download(filename('csv'),'text/csv;charset=utf-8',PartyExpeditionTelemetry.battleCSV(records())));
  function readableCard(card){if(typeof card==='string')return PartyExpedition.CARDS[card]?.name||card;return card?.name||PartyExpedition.CARDS[card?.kind]?.name||card?.kind||card?.id||'—';}
  function actorName(value,state){if(!value)return'—';return(state?.allies||[]).concat(state?.enemies||[]).find(a=>a.id===value)?.name||roleName(value);}
  function intentView(intent,state){
    const target=id=>actorName(id,state),damage=n=>'피해 '+n;
    if(intent.type==='ward'||intent.type==='heal')return `${target(intent.actor)} → ${target(intent.target)} · ${intent.type==='ward'?'보호':'HP 회복'} ${intent.amount}`;
    if(intent.type==='volley')return `${target(intent.actor)} → ${(intent.targets||[]).map(target).join('·')} · 각 ${damage(intent.damage)}`;
    if(intent.type==='prepare'){
      const victims=intent.nextTargets?intent.nextTargets.map(target).join('·'):intent.nextTarget?target(intent.nextTarget):'전원';
      const effect=['ward','heal'].includes(intent.nextType)?`${intent.nextType==='ward'?'보호':'HP 회복'} ${intent.nextAmount}`:damage(intent.nextDamage);
      return `${target(intent.actor)} · 다음 라운드 ${victims} ${effect} 준비`;
    }
    return `${target(intent.actor)} · ${intent.type==='area'?'전원':target(intent.target)} ${damage(intent.damage)}`;
  }
  function stateView(state){if(!state)return'<p class="muted">이 시점의 상태가 없습니다.</p>';const hand=state.hand||state.zones?.hand||[];return`<p>라운드 ${esc(state.round??'—')} · 에너지 ${esc(state.energy??'—')}</p><p>손패: ${esc(hand.map(c=>readableCard(c)+(c.upgraded?'+':'')+(c.enchant?' [각인]':'')).join(' · ')||'없음')}</p><p>아군: ${esc((state.allies||[]).map(a=>`${a.name||roleName(a.id)} HP ${a.hp}${a.shield?` / 보호 ${a.shield}`:''}`).join(' · '))}</p><p>적: ${esc((state.enemies||[]).map(e=>`${e.name||e.pattern||e.id} HP ${e.hp}${e.shield?` / 보호 ${e.shield}`:''}`).join(' · '))}</p><p>적 의도: ${esc((state.intents||[]).map(i=>intentView(i,state)).join(' / ')||'없음')}</p>`;}
  function eventText(e,state){if(typeof e==='string')return e;if(e.text||e.message)return e.text||e.message;const target=actorName(e.target||e.actor,state);switch(e.type){case'enemy-ward':return`${actorName(e.actor,state)} → ${target}: 적 보호 ${e.amount}`;case'enemy-heal':return`${actorName(e.actor,state)} → ${target}: 적 HP ${e.amount} 회복`;case'boss-phase':return`${actorName(e.actor,state)}: 침수 국면으로 전환`;case'ability-effect':return`${actorName(e.actor,state)}: ${e.effect==='draw'?'추가 드로우':'보호'} ${e.amount}`;case'damage':return`${actorName(e.source,state)} → ${target}: 실제 HP 피해 ${e.amount} · 보호 흡수 ${e.absorbed||0}`;case'heal':return`${target}: HP ${e.amount} 회복`;case'shield':return`${target}: 보호 ${e.amount} 획득`;case'energy':return`에너지 ${e.amount>=0?'+':''}${e.amount}`;case'downed':return`${target}: 쓰러짐`;case'draw':return`카드 뽑기: ${e.card}`;case'card':return`카드 실행 · 지불 에너지 ${e.cost}${e.choice!==undefined?' · 효과 선택 '+(e.choice+1):''}`;default:return JSON.stringify(e);}}
  function actionView(a,index){
    const before=a.before,after=a.after,args=a.args||[],type=a.method,card=a.card||before?.hand?.find(c=>c.id===args[0]);
    const label=type==='play'?`${readableCard(card||args[0])} · ${actorName(args[1],before)} → ${actorName(args[2],before)}`:type==='endRound'?'라운드 종료 / 적 행동':type==='discardForSounder'?`측심 정리 · ${readableCard(card||args[0])}`:type==='useTool'?`전술 도구 ${Number(args[0])+1} · ${actorName(args[1],before)}`:type||'행동';
    const effects=a.events||[];
    return`<details class="action-entry"><summary><strong>${index+1}. ${esc(label)}</strong><span class="muted">라운드 ${esc(a.round??before?.round??'—')}${a.card?.cost!==undefined?' · 지불 에너지 '+esc(a.card.cost):''}</span></summary><div class="action-body"><p>선택 이유: ${esc(a.reason||'—')}</p>${effects.length?`<p>효과 기록:</p><ul>${effects.map(e=>`<li>${esc(eventText(e,before))}</li>`).join('')}</ul>`:''}<div class="state-snapshots"><div class="snapshot"><h3>행동 전 · 손패와 의도</h3>${stateView(before)}</div><div class="snapshot"><h3>행동 후 · 결과</h3>${stateView(after)}</div></div><details class="raw-record"><summary>원본 행동 로그</summary><pre>${esc(JSON.stringify(a,null,2))}</pre></details></div></details>`;
  }
  function openBattle(ri,bi){
    const r=records()[ri],b=r?.battles?.[bi];if(!b)return;$('detail-title').textContent=`시드 ${runSeed(r)} · ${bFloor(b)}구역 · ${bName(b)}`;const actions=b.actions||[];
    $('detail-content').innerHTML=`<div class="detail-grid"><p><small>결과 / 파티 정책</small>${badge(bStatus(b))} · ${esc(POLICY[runPolicy(r)]||runPolicy(r))}</p><p><small>라운드 / 실제 HP 피해 / 보호 흡수</small>${esc(bRounds(b))} / ${integer(bDamage(b))} / ${integer(bBlocked(b))}</p><p><small>파티</small>${esc(partyName(runParty(r)))}</p><p><small>회복 / 자기 HP 비용 / 도구 사용</small>${integer(b.metrics?.healing)} / ${integer(b.metrics?.selfDamage)} / ${integer(b.metrics?.toolsUsed)}</p><p><small>진입 HP → 종료 HP / HP 회계</small>${integer(b.healthAccounting?.entryHP)} → ${integer(b.healthAccounting?.exitHP)} · ${b.healthAccounting?.matches?'일치':'확인 필요'}</p><p><small>진입 덱 / 유물</small>${esc(b.deck?.map(readableCard).join(' · '))}<br>${esc((b.relics||[]).map(id=>PartyExpeditionVoyageCombat.RELICS[id]?.name||id).join(' · ')||'없음')}</p></div><div class="state-snapshots"><div class="snapshot"><h3>전투 진입</h3>${stateView(b.entry)}</div><div class="snapshot"><h3>전투 종료</h3>${stateView(b.exit)}</div></div><p>적별 실제 HP 피해: ${esc(Object.values(b.byEnemy||{}).map(e=>`${e.name} ${e.damage} / 보호 흡수 ${e.blocked}`).join(' · ')||'0')}</p><details class="raw-record"><summary>전투 전체 원본</summary><pre>${esc(JSON.stringify(b,null,2))}</pre></details><h3>행동 기록 · ${actions.length}개</h3>${actions.map(actionView).join('')||'<p class="muted">행동 기록이 없습니다.</p>'}`;$('detail-dialog').showModal();
  }
  function openRun(index){const r=records()[index];if(!r)return;$('detail-title').textContent=`시드 ${runSeed(r)} · 원정 선택 기록`;$('detail-content').innerHTML=`<p>${badge(r.status||r.outcome)} · ${esc(POLICY[runPolicy(r)]||runPolicy(r))} · ${esc(partyName(runParty(r)))}</p><p>${esc(r.reason||'')}</p><ol class="decision-list">${(r.decisions||[]).filter(d=>d.phase!=='battle').map(d=>`<li><strong>${d.floor}구역 · ${esc(PHASE[d.phase]||d.phase||'선택')}</strong> · ${esc(d.reason||'')}<details class="raw-record"><summary>선택 후보와 결과</summary><pre>${esc(JSON.stringify(d,null,2))}</pre></details></li>`).join('')}</ol><details class="raw-record"><summary>원본 원정 로그</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details>`;$('detail-dialog').showModal();}
  $('battles').addEventListener('click',event=>{const button=event.target.closest('[data-battle]');if(button)openBattle(...button.dataset.battle.split(':').map(Number));});$('runs').addEventListener('click',event=>{const button=event.target.closest('[data-run]');if(button)openRun(Number(button.dataset.run));});$('detail-close').addEventListener('click',()=>$('detail-dialog').close());
  window.addEventListener('beforeunload',()=>{epoch++;clearTimer();});
  updateConfig();
  window.PartyExpeditionLab={get state(){return{running,paused,stopped,config:currentConfig,progress:progress(),summary};},get records(){return records();}};
})();


