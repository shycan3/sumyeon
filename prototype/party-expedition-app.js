(() => {
  'use strict';
  const {CARDS,ROLES}=PartyExpedition, {Run}=PartyExpeditionRun;
  const $=id=>document.getElementById(id), STORE='sumyeon-expedition-professions-v2', PREFS='sumyeon-expedition-ui-v1', CODEX='sumyeon-expedition-bestiary-v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let run=null, setup=true, selected=null, executor=null, busy=false, token=0, deckAction=null;
  let selectedChoice, selectedTool=null;
  const selectedDefinition=()=>selectedTool!==null?{...PartyExpeditionVoyageCombat.TOOLS[run.s.tools[selectedTool]],target:PartyExpeditionVoyageCombat.TOOLS[run.s.tools[selectedTool]]?.target,cost:0}:battle()?.definition(selected,selectedChoice);
  let party=['navigator','sounder','salvager','lightkeeper'], difficulty='normal', breakMode=false;
  let previousView=null, inspectedMapNode=null, actionCues={units:{},cards:{},links:[]},coachHidden=false;
  const presentation=PartyExpeditionPresentation;
  const clearCues=()=>{actionCues={units:{},cards:{},links:[]};};
  const cueMarkup=id=>{const items=actionCues.units[id];return items?.length?`<span class="role-cue effect-cues" title="${esc(items.map(x=>x.detail).join(' '))}">${items.map(x=>`<span class="effect-badge">${esc(x.text)}</span>`).join('')}</span>`:'';};
  const received=id=>actionCues.links.some(l=>l.to===id)?'effect-received':'';
  const qa=document.body.dataset.qa==='true';
  const role=id=>ROLES.find(r=>r.id===id), battle=()=>run?.battle;
  const rarityLabel=d=>d.rarity?`<span class="rarity-label" data-rarity="${d.rarity}" title="희귀도는 등장 빈도이며 카드 계열과 별개입니다">${esc(PartyExpeditionCatalog.rarities[d.rarity])}</span>`:'';
  let autoMessage='';
  const auto=PartyExpeditionAuto.createController({
    ready:()=>!setup&&run?.s.phase==='battle'&&battle().s.status==='playing'&&!busy&&!document.hidden&&!document.querySelector('dialog[open]'),
    decide:()=>PartyExpeditionAuto.chooseVoyage(battle(),run.s.toolPolicy),
    delay:()=>Math.max(220,650/Math.max(1,Number($('speed').value))),
    execute:async action=>{
      if(action.type==='tool'){autoMessage='비상 도구 사용';return perform(()=>run.useTool(action.slot,action.target),null,true);}
      if(action.type==='discard'){autoMessage=`측심 · ${battle().definition(action.card).name} 버리기`;return perform(()=>run.discardForSounder(action.card));}
      if(action.type==='end'){autoMessage='라운드 종료';return perform(()=>run.endRound(),null,true);}
      autoMessage=`${battle().definition(action.card,action.choice).name} · ${battle().actor(action.actor).name} → ${battle().actor(action.target).name}`;
      return perform(()=>run.play(action.card,action.actor,action.target,action.choice),action.actor,true);
    },
    onChange:(enabled,reason)=>{if(!enabled)autoMessage='';if(reason==='limit')notice('자동 전투를 잠시 멈췄습니다. 전황을 확인한 뒤 다시 켤 수 있습니다.');render();},
    onError:error=>notice('자동 전투 중지 · '+error.message)
  });
  const concepts={
    navigator:['항로를 잇는 문양','실행자 교대의 연속 공격','선회 · 동료의 행동을 이어 강화'],
    diver:['심층으로 파고드는 문양','노출을 소비하면 에너지 회복','침투 · 적에게 다음 공격의 틈 생성'],
    pilot:['길을 열어주는 문양','선행 카드 뒤 고비용 효과 강화','도선 · 지출을 쌓은 뒤 강한 실행'],
    sounder:['깊이를 읽어내는 문양','6장을 보고 1장 선택해 버리기','정밀 관측 · 실행 후 추가 드로우'],
    salvager:['유실된 힘을 건지는 문양','예약 카드를 동료에게 인계해 할인','인양 · 사용한 사본을 다음 손패로'],
    lightkeeper:['돌아올 빛을 남기는 문양','한 동료의 남은 보호 최대 4 이월','점등 · 실행 후 자신에게 보호']
  };
  function emblem(id){
    const shapes={navigator:'<circle cx="20" cy="17" r="11"/><path d="m20 8 4 13-4-2-4 2zM5 33q5-5 10 0t10 0t10 0"/>',diver:'<path d="M20 4v21m-8-8 8 8 8-8M20 28q-8 7 0 10 8-3 0-10Z"/>',pilot:'<path d="M14 12h12v16H14zM16 8h8m-4-4v4m0 7v10M9 31q5-3 11 0t11 0"/>',sounder:'<path d="M20 3v19m-5 0h10l-5 8zM8 30q-6 6 0 8m24-8q6 6 0 8M12 32q-3 3 0 5m16-5q3 3 0 5"/>',salvager:'<path d="M20 4v20q0 10-9 10-7 0-7-7m0 0 4 4m-4-4 1 6M17 8h6M29 14l6 6-6 6m6-6H25"/>',lightkeeper:'<path d="m16 14-4 22h16l-4-22zM15 8h10v6H15zM13 8l7-5 7 5M8 11 2 8m6 6-6 2m30-5 6-3m-6 6 6 2M18 23h4"/>'};
    return `<svg class="emblem" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[id]||''}</svg>`;
  }
  function minCost(card){const b=battle();return Math.min(...b.s.allies.filter(a=>a.hp>0).map(a=>b.costFor(card,a.id)));}
  const dockObserver=new ResizeObserver(()=>{if(!$('battle-board').hidden){
    $('allies').style.bottom=($('dock').offsetHeight+18)+'px';
    const minimum=parseFloat(getComputedStyle($('battle-board')).top)+$('enemies').offsetTop+$('enemies').offsetHeight+$('allies').offsetHeight+$('dock').offsetHeight+42;
    $('game').style.setProperty('--battle-min-height',Math.ceil(minimum)+'px');
  }});
  ['dock','allies','enemies'].forEach(id=>dockObserver.observe($(id)));
  function notice(message=''){ $('notice').textContent=message; }
  function knownEnemies(){
    let found=[];try{found=JSON.parse(localStorage.getItem(CODEX)||'[]');}catch{}
    return new Set(Array.isArray(found)?found:[]);
  }
  function rememberEnemies(patterns){if(qa||!run)return;const all=knownEnemies();patterns.forEach(p=>all.add(p));try{localStorage.setItem(CODEX,JSON.stringify([...all]));}catch{}}
  function visitedPatterns(){const nodes=run?.s.map?.nodes||[],seen=[];for(const id of run?.s.map?.trail||[]){const route=nodes.find(n=>n.id===id)?.route;for(const enemy of route?.enemies||[])seen.push(enemy.pattern);}for(const enemy of run?.s.route?.enemies||[])seen.push(enemy.pattern);return [...new Set(seen)];}
  function renderBestiary(){
    rememberEnemies(visitedPatterns());
    const all=PartyExpeditionEncounters.ENEMIES,seen=knownEnemies(),entries=Object.keys(all).map(pattern=>({pattern,...PartyExpeditionBestiary.lookup(pattern)}));
    $('bestiary-count').textContent=`발견 ${entries.filter(e=>seen.has(e.pattern)).length} / ${entries.length}`;
    const discovered=entries.filter(entry=>seen.has(entry.pattern)),unknown=entries.length-discovered.length;
    $('bestiary-list').innerHTML=discovered.map(entry=>`<article class="bestiary-entry"><span class="eyebrow">${esc(entry.threat)}</span><h3>${esc(entry.name)}</h3><p>${esc(entry.counter)}</p></article>`).join('')+(unknown?`<p class="bestiary-locked">미발견 적 ${unknown}종 · 직접 조우하면 기록됩니다.</p>`:'');
  }
  function save(){if(qa)return;try{if(run)localStorage.setItem(STORE,JSON.stringify(run.snapshot()));}catch{notice('진행 상황을 저장할 공간이 부족합니다. 이 탭에서 계속 플레이할 수 있습니다.');}}
  function savePrefs(){if(qa)return;try{localStorage.setItem(PREFS,JSON.stringify({speed:$('speed').value,keys:$('show-keys').checked}));}catch{}}
  function health(a){return `<span class="health">${a.hp}/${a.max}${a.shield?` · 보호 ${a.shield}`:''}</span><span class="hpbar"><i style="width:${a.hp/a.max*100}%"></i></span>`;}
  function partyStrip(){return `<div class="party-strip">${run.s.allies.map(a=>`<div class="party-mini ${a.hp<=0?'dead':''}" style="--color:${role(a.id).color}"><strong>${esc(role(a.id).name)}</strong><span>${a.hp<=0?'쓰러짐':`HP ${a.hp}/${a.max}`}</span></div>`).join('')}</div>`;}
  function cardMarkup(d,attributes='',extra=''){return `<button class="reward-card" ${attributes}><span class="cost">${d.cost}</span>${rarityLabel(d)}<span class="card-icon" aria-hidden="true">${esc(d.icon||'✦')}</span><strong>${esc(d.name)}${d.upgraded&&!d.name.endsWith('+')?'+':''}</strong><span class="card-text">${esc(d.text)}</span>${d.link?`<span class="card-link">${esc(d.link)}</span>`:''}<span class="card-meta">${esc(d.category||'공용')}${run?.s.breakMode==='on'&&d.breakPower?` · 균형 −${d.breakPower}`:''}</span>${extra}</button>`;}
  function setupScreen(){
    return `<span class="eyebrow">여섯 문양, 네 명의 동료</span><h1 class="screen-title">하나의 덱으로, 서로 다른 해법을.</h1><p class="lead">적의 다음 행동을 읽고 카드를 맡길 동료를 고르세요. 각 문양의 지속 특성과 실행 특성이 공용 카드에 다른 쓰임을 더합니다.</p><div class="role-grid">${ROLES.map(r=>`<button class="role-choice ${party.includes(r.id)?'active':''}" style="--color:${r.color}" data-role="${r.id}" aria-pressed="${party.includes(r.id)}" title="${esc(r.ability)}">${emblem(r.id)}<span class="role-name">${esc(r.name)}<span aria-hidden="true">${party.includes(r.id)?'◆':'◇'}</span></span><span class="role-concept">${esc(PartyExpeditionGuide.roles[r.id].purpose)}</span><span class="ability">${esc(concepts[r.id][1])}</span><span class="execution-brief">${esc(PartyExpeditionGuide.roles[r.id].example)}</span></button>`).join('')}</div><div class="setup-options"><label>난이도 <select id="difficulty" aria-label="원정 난이도"><option value="normal" ${difficulty==='normal'?'selected':''}>표준</option><option value="calm" ${difficulty==='calm'?'selected':''}>여유롭게</option></select></label><label class="check-label"><input id="break-mode" type="checkbox" ${breakMode?'checked':''}> 브레이크 사용</label><small>편성 ${party.length}/4 · 시작 덱 10장 · 8구역</small></div><div class="actions"><button class="primary" data-action="start" ${party.length!==4?'disabled':''}>원정 시작</button>${run?'<button data-action="resume">진행 중인 원정으로 돌아가기</button>':''}</div>`;
  }
    const mapLabels={start:'출발',battle:'전투',elite:'강적',boss:'최심부',camp:'정박지',shop:'유실물 상점',event:'사건'};
  function mapSelection(view){if(!view.nodes.some(n=>n.id===inspectedMapNode))inspectedMapNode=view.available[0]||view.current;return inspectedMapNode;}
  function mapRoute(node,view){if(node.route)return node.route;const incoming=view.edges.find(e=>e.to===node.id);return incoming?view.nodes.find(n=>n.id===incoming.from)?.route:null;}
  function mapDetails(view,modal=false){
    const id=mapSelection(view),node=view.nodes.find(n=>n.id===id),route=node&&mapRoute(node,view);if(!node)return '';
    const available=!setup&&run.s.phase==='map'&&view.available.includes(id),visited=view.trail.includes(id),current=id===view.current;
    const isFight=['battle','elite','boss'].includes(node.type),after=isFight?view.nodes.find(n=>view.edges.some(e=>e.from===id&&e.to===n.id)&&['camp','shop','event'].includes(n.type)):null;
    const activeEncounter=id===run.s.route?.id&&battle(),enemies=activeEncounter?battle().s.enemies:route?.enemies;
    const explanations={start:'네 명의 동료와 함께 심층으로 향합니다.',camp:'동료 회복, 카드 강화, 카드 제거 중 한 번 선택합니다.',shop:'기록 조각으로 카드를 구매하고 동료를 회복하거나 카드를 제거합니다.',event:'새로운 기록, 동료 회복, 카드 강화 중 한 번 선택합니다.'};
    const content=isFight?`<div class="map-encounter">${(enemies||[]).map(e=>`<div><strong>${esc(e.name)}</strong><span>${activeEncounter?'HP':'초기 HP'} ${e.hp}</span></div>`).join('')}</div><p class="map-threat">${esc(route?.threat||'')}</p>${run.rewardDescription(route,node.floor)?`<p class="map-reward-info">${esc(run.rewardDescription(route,node.floor))}</p>`:''}${after?`<div class="map-next-stop"><span>전투 후</span><strong>${PartyExpeditionMap.icon(after.type)}${esc(mapLabels[after.type])}</strong></div>`:'<p class="map-destination">완성한 덱으로 최심부의 존재와 맞섭니다.</p>'}`:`<p class="map-service-description">${esc(node.entry?route?.description:explanations[node.type]||'')}</p>${node.type!=='start'&&!visited&&!node.entry?'<small>연결된 전투를 마치면 도착합니다.</small>':''}`;
    const status=available?'선택 가능':current?'현재 위치':visited?'지나온 지점':node.floor<run.s.floor?'지나간 갈림길':'앞으로의 경로';
    return `<aside class="map-details" aria-live="polite"><span class="map-detail-state ${available?'available':''}">${status}</span><span class="map-detail-icon">${PartyExpeditionMap.icon(node.type)}</span><h2>${esc(isFight?(node.type==='boss'?node.label:`${node.floor+1}구역 · ${mapLabels[node.type]}`):mapLabels[node.type])}</h2>${content}${route?.recordTheme?`<p class="map-record-info">${esc(run.recordDescription(route))}</p>`:''}${available?`<button class="primary map-enter" data-action="map-enter" data-node="${esc(id)}">이 경로로 진입</button>`:current?'':'<p class="map-connection-note">연결선을 따라 다음 지점을 선택합니다.</p>'}<div class="map-tools"><button data-action="map-current">현재 위치</button><button data-action="map-top">최심부 보기</button></div></aside>`;
  }
  function mapContent(modal=false){const view=run.mapView();return PartyExpeditionMap.render(view,{selected:mapSelection(view),readOnly:setup||run.s.phase!=='map'})+mapDetails(view,modal);}
  function mapScreen(){return `<div class="map-heading"><div><span class="eyebrow">심층 항로</span><h1 class="screen-title">어느 길로 잠수할까요?</h1></div><span class="map-resources">기록 조각 ${run.s.gold}<br>공용 덱 ${run.s.deck.length}장</span></div>${partyStrip()}<div id="main-map-content" class="map-layout">${mapContent()}</div>`;}
  function positionMap(host,top=false){const scroll=host?.querySelector('.map-scroll');if(!scroll)return;if(top){scroll.scrollTop=0;return;}const view=run.mapView(),id=view.current,node=host.querySelector(`[data-map-node="${id}"]`);if(node)scroll.scrollTop=Math.max(0,node.offsetTop-scroll.clientHeight*.78);}
  function inspectMap(id,host,modal=false){if(!run||!run.mapView().nodes.some(n=>n.id===id))return;inspectedMapNode=id;host.querySelectorAll('[data-map-node]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapNode===id)));const details=host.querySelector('.map-details');if(details)details.outerHTML=mapDetails(run.mapView(),modal);}
  function openMap(){if(!run||busy)return;const view=run.mapView();inspectedMapNode=run.s.phase==='map'?view.available[0]||view.current:view.current;$('map-dialog-content').innerHTML=mapContent(true);$('map-dialog').showModal();requestAnimationFrame(()=>positionMap($('map-dialog-content')));}
  function handleMapClick(event,host,modal=false){const node=event.target.closest('[data-map-node]');if(node){inspectMap(node.dataset.mapNode,host,modal);return true;}const button=event.target.closest('[data-action]');if(!button||button.disabled)return false;const action=button.dataset.action;if(action==='map-current'||action==='map-top'){const view=run.mapView(),id=action==='map-top'?view.nodes.find(n=>n.type==='boss')?.id:view.current;if(id)inspectMap(id,host,modal);positionMap(host,action==='map-top');return true;}if(action==='map-enter'){if(modal)$('map-dialog').close();perform(()=>run.choosePath(button.dataset.node));return true;}return false;}
  function rewardScreen(){const history=run.s.history.at(-1);return `<span class="eyebrow">전투 승리 · ${history?.rounds||0}라운드</span><h1 class="screen-title">다음 전투의 가능성</h1><p class="lead">한 장을 덱에 추가합니다. 지금 조합을 유지하고 싶다면 건너뛸 수 있습니다.</p>${partyStrip()}${run.rewardDescription()?`<p class="reward-source">${esc(run.rewardDescription())}</p>`:''}<div class="reward-grid">${run.s.offers.map(kind=>cardMarkup(run.definition(kind),`data-action="reward" data-kind="${kind}"`)).join('')}</div><div class="actions"><button data-action="skip-reward">건너뛰기</button><small>기록 조각 ${run.s.gold} · 남은 전투 최대 ${7-run.s.floor}회</small></div>`;}
  function interludeScreen(){
    const i=run.s.interlude, shop=i.type==='shop', event=i.type==='event';
    const services=[];
    services.push(`<button class="service" data-action="service" data-service="heal" ${shop&&(i.healed||run.s.gold<i.prices.heal)?'disabled':''}><strong>${shop&&i.healed?'회복 완료':'동료 회복'}${shop?` · ${i.prices.heal}`:''}</strong><span>전원 HP +${shop?10:event?4:6} · 쓰러진 동료 HP ${shop?10:event?8:10}으로 복귀</span></button>`);
    if(!shop)services.push('<button class="service" data-action="deck-service" data-service="upgrade"><strong>카드 강화</strong><span>덱에서 한 장을 골라 효과를 강화합니다.</span></button>');
    if(!event)services.push(`<button class="service" data-action="deck-service" data-service="remove" ${run.s.deck.length<=6||shop&&run.s.gold<i.prices.remove?'disabled':''}><strong>카드 제거${shop?` · ${i.prices.remove}`:''}</strong><span>덱에서 한 장을 골라 제거합니다. 최소 6장을 남깁니다.</span></button>`);
    return `<span class="eyebrow">전투 뒤의 선택</span><h1 class="screen-title">${shop?'유실물 상점':event?'폐쇄된 관측실':'정박지'}</h1><p class="lead">${esc(i.description)}</p>${event&&run.recordDescription()?`<p class="reward-source">${esc(run.recordDescription())}</p>`:''}${partyStrip()}<div class="interlude-grid">${services.join('')}</div>${shop||event?`<div class="${shop?'shop':'reward'}-grid">${i.offers.map(kind=>cardMarkup(run.definition(kind),`data-action="service-card" data-service="${shop?'buy':'learn'}" data-kind="${kind}" ${shop&&run.s.gold<i.prices.card?'disabled':''}`,`<span class="card-meta">${shop?`기록 조각 ${i.prices.card}`:'이 기록을 가져가기'}</span>`)).join('')}</div>`:''}<div class="actions"><button class="primary" data-action="service" data-service="continue">다음 구역으로</button><small>기록 조각 ${run.s.gold}${shop?'':' · 정비는 한 번 선택'}</small></div>`;
  }
  function battleReview(){
    const item=[...run.s.history].reverse().find(h=>h.result==='lost'||run.s.phase==='won'&&h.floor===7),r=item?.review;if(!r)return '';
    const topDamage=Object.entries(r.damageByAlly||{}).sort((a,b)=>b[1]-a[1])[0],cards=Object.entries(r.cards||{}).sort((a,b)=>b[1]-a[1]).slice(0,5),actors=Object.entries(r.actors||{}).sort((a,b)=>b[1]-a[1]);
    return `<section class="battle-review"><h2>${run.s.phase==='lost'?'마지막 전투 복기':'최심부 전투 복기'} · ${esc(item.route)}</h2><p class="review-facts">${r.enemies.map(e=>esc(e.name)).join(' · ')} · ${r.rounds}라운드</p><div class="review-stats"><span>아군이 받은 HP 피해 <strong>${r.damageTaken||0}</strong></span><span>보호가 흡수한 피해 <strong>${r.damageAbsorbed||0}</strong></span><span>적에게 준 피해 <strong>${r.damageDealt||0}</strong></span>${r.enemySupport?`<span>적 지원 회복·보호 <strong>${r.enemySupport}</strong></span>`:''}${r.healing?`<span>아군 회복 <strong>${r.healing}</strong></span>`:''}</div>${topDamage?`<p>HP 피해가 가장 컸던 동료: <strong>${esc(topDamage[0])} · ${topDamage[1]}</strong></p>`:''}${r.downs?.length?`<p>쓰러진 순서: <strong>${r.downs.map(esc).join(' → ')}</strong></p>`:''}<div class="review-columns"><div><h3>많이 사용한 카드</h3><p>${cards.length?cards.map(([name,count])=>`${esc(name)} ×${count}`).join(' · '):'기록된 카드 사용 없음'}</p></div><div><h3>카드를 맡긴 동료</h3><p>${actors.length?actors.map(([name,count])=>`${esc(name)} ${count}회`).join(' · '):'기록 없음'}</p></div></div><small>전투 로그에 남은 실제 피해와 행동 요약입니다. 수치만으로 패배 원인을 단정하지 않습니다.</small></section>`;
  }
  function resultScreen(){const won=run.s.phase==='won';return `<span class="eyebrow">${won?'원정 완료':'원정 종료'}</span><h1 class="screen-title">${won?'수면 너머에서 돌아왔습니다.':'이번 여정은 여기까지.'}</h1><p class="lead">${won?'함께 만든 덱으로 최심부를 돌파했습니다. 다른 편성과 카드 선택으로 다음 길을 열어보세요.':'지금까지 고른 카드와 마주한 위협을 확인하고, 새로운 원정을 시작할 수 있습니다.'}</p><div class="summary-grid"><div class="summary-item"><strong>${run.s.battlesWon}</strong><span>돌파한 전투</span></div><div class="summary-item"><strong>${run.s.deck.length}</strong><span>완성 덱의 카드</span></div><div class="summary-item"><strong>${run.s.allies.filter(a=>a.hp>0).length}/4</strong><span>생존 동료</span></div></div>${battleReview()}${partyStrip()}<div class="history">${run.s.history.map(h=>`<span>${h.floor+1}구역 · ${h.rounds}라운드${h.reward?` · ${esc(CARDS[h.reward].name)}`:''}</span>`).join('')}</div><div class="actions"><button class="primary" data-action="new">새 원정 준비</button><button data-action="view-deck">완성 덱 보기</button><button data-action="retry">같은 조건으로 재도전</button></div>`;}
  function intentText(enemy){return presentation.intentText(battle(),enemy);}
  function threatText(ally){return presentation.threatText(battle(),ally);}
  function bonusText(ally){
    const b=battle();if(!selectedDefinition())return '';if(selected==='basic')return '고유 효과 없음';
    const info=b.effectInfo(selected,ally.id,selectedChoice);if(!info)return '';
    if(info.actualCost>b.s.energy)return `에너지 ${info.actualCost} 필요`;
    return info.text;
  }
  function previewText(target){
    if(selectedTool!==null){try{const after=battle().previewTool(selectedTool,target),before=battle().actor(target),a=[...after.allies,...after.enemies].find(x=>x.id===target);return `HP ${before.hp} → ${a.hp} · 보호 ${before.shield} → ${a.shield}${a.exposure?` · 노출 ${a.exposure}`:''}`;}catch{return '';}}
    const b=battle();if(!selected||!executor)return '';
    try{if(selectedDefinition().target==='ally')return PartyExpeditionGuide.allyPreview(b,selected,executor,target,selectedChoice).local;const after=b.preview(selected,executor,target,selectedChoice),changes=[];
      const living=after.allies.filter(a=>a.hp>0),commonShield=living.length>1?Math.max(0,Math.min(...living.map(a=>a.shield-b.actor(a.id).shield))):0;
      if(commonShield)changes.push(`전체 보호 +${commonShield}`);
      [...after.allies,...after.enemies].forEach(a=>{const before=b.actor(a.id),shieldGain=a.shield-before.shield-(living.includes(a)?commonShield:0);if(a.hp<before.hp)changes.push(`${a.name} −${before.hp-a.hp}${a.hp===0?' · 행동 취소':''}`);if(a.hp>before.hp)changes.push(`${a.name} 회복 +${a.hp-before.hp}`);if(shieldGain>0)changes.push(`${commonShield&&a.id===target?'대상':a.name} ${commonShield?'추가 ':''}보호 +${shieldGain}`);if(a.weak>before.weak)changes.push(`${a.name} 공격 −${a.weak}`);if(a.exposure>before.exposure)changes.push(`${a.name} 받을 카드 피해 +${a.exposure}`);if(a.broken&&!before.broken)changes.push(`${a.name} 브레이크`);else if(a.toughness<before.toughness)changes.push(`${a.name} 균형 −${before.toughness-a.toughness}`);if(a.reaction>before.reaction)changes.push(`${a.name} 반격 ${a.reaction}`);});
      after.events.filter(e=>e.type==='shield-spent').forEach(e=>changes.push(`${b.actor(e.actor).name} 보호 ${e.amount} 소비`));
      const newlyReserved=after.zones.reserve.filter(id=>!b.s.zones.reserve.includes(id));if(newlyReserved.length)changes.push('다음 손패: '+newlyReserved.map(id=>b.definition(id).name).join(', '));
      const drawn=after.zones.hand.length-b.s.zones.hand.length+(selected==='basic'?0:1);if(drawn>0)changes.push(`손패 +${drawn}`);
      const refunded=after.energy-(b.s.energy-b.costFor(selected,executor));if(refunded>0)changes.push(`에너지 +${refunded}`);
      return changes.join(' · ')||'카드 효과 실행';
    }catch{return '';}
  }
  function renderBattle(){
    const b=battle(),s=b.s,c=selectedDefinition(),needsChoice=c?.choices&&selectedChoice===undefined,targetSide=selectedTool!==null?c?.target:executor?c?.target:null,lock=busy||s.status!=='playing'||s.needsTrim||needsChoice;
    rememberEnemies([...visitedPatterns(),...s.enemies.filter(e=>e.hp>0).map(e=>e.pattern)]);
    const coach=$('battle-coach'),showCoach=run.s.floor<2&&!coachHidden;coach.hidden=!showCoach;
    if(showCoach){const model=PartyExpeditionBestiary.coach(b);coach.innerHTML=`<div class="coach-head"><strong>전황 읽기 · ${run.s.floor===0?'첫 전투':'두 번째 전투'}</strong><div><button type="button" data-coach-professions>문양 역할</button> <button type="button" data-coach-close>접기</button></div></div><p>${esc(model.prompt)}</p><div class="coach-intents">${model.intents.map(i=>`<span><strong>${esc(i.enemy)}</strong> · ${esc(i.text)}</span>`).join('')}</div><small>카드 → 실행자 → 대상 순서로 고릅니다. 동료 이름 아래 줄에서 지금 발동할 특성을 확인하세요.</small>`;}
    $('card-choices').hidden=!c?.choices;$('card-choices').innerHTML=c?.choices?c.choices.map((o,i)=>`<button data-effect-choice="${i}" aria-pressed="${i===selectedChoice}" ${busy?'disabled':''}><strong>${esc(o.name)}</strong><span>${esc(PartyExpeditionCatalog.describe(o))}</span></button>`).join(''):'';
    const ongoing=Object.entries(s.powers||{}).map(([key,v])=>`${PartyExpeditionCatalog.powerNames[key]} ${v}`);
    if(s.pending?.energy)ongoing.push(`다음 라운드 에너지 +${s.pending.energy}`);
    for(const [id,v]of Object.entries(s.pending?.shields||{}))ongoing.push(`다음 ${b.actor(id).name} 보호 ${v}`);
    $('ongoing-effects').textContent=ongoing.join(' · ');$('ongoing-effects').hidden=!ongoing.length;
    $('energy').textContent=`◈ ${s.energy} / 5`;$('next-energy').textContent=`다음 ${Math.min(5,s.energy+2+(s.powers?.roundEnergy||0)+(s.pending?.energy||0))} · 회복 +${2+(s.powers?.roundEnergy||0)}`;
    $('selection').textContent=selectedTool!==null?`${c.name} · 대상 선택`:auto.enabled?`자동 전투${autoMessage?' · '+autoMessage:''}`:s.needsTrim?'측심 · 적의 의도를 보고 버릴 카드 1장 선택':!selected?'카드 선택':needsChoice?`${c.name} · 효과 선택`:!executor?`${c.name} · 실행자 선택`:`${c.name} · ${b.actor(executor).name} · 비용 ${b.costFor(selected,executor)} → 대상 선택`;
    $('hand').classList.toggle('trimming',s.needsTrim);
    $('action-detail').textContent=selectedTool===null&&executor&&c?.target==='ally'?PartyExpeditionGuide.allyPreview(b,selected,executor,s.allies.find(a=>a.hp>0).id,selectedChoice).shared:'';$('action-detail').hidden=!$('action-detail').textContent;
    $('cancel').hidden=!selected&&selectedTool===null;$('cancel').disabled=busy;$('basic').disabled=lock||s.energy<1;$('end').disabled=lock;$('basic').classList.toggle('selected',selected==='basic');
    $('enemies').innerHTML=s.enemies.map(a=>`<button class="enemy ${received(a.id)} ${a.hp<=0?'dead':''} ${targetSide==='enemy'&&a.hp>0?'targetable':''}" data-unit="${a.id}" aria-label="${esc(a.name)}, HP ${a.hp}, ${esc(intentText(a))}" ${lock||targetSide!=='enemy'||a.hp<=0?'disabled':''}><span class="name">${esc(a.name)}</span>${health(a)}<span class="intent" title="${esc(presentation.intentDetail(b,a))}">${esc(intentText(a))}</span>${presentation.phaseText(b,a)?`<span class="enemy-phase">${esc(presentation.phaseText(b,a))}</span>`:''}${a.weak?`<span class="toughness">약화 ${a.weak}</span>`:''}${a.exposure?`<span class="toughness">다음 카드 공격 +${a.exposure}</span>`:''}${s.breakMode?`<span class="toughness ${a.broken?'broken':''}">${a.broken?`브레이크 · 공격 절반${a.breakBonusArmed?' · 다음 카드 +4':''}`:`균형 ${a.toughness}/${a.toughnessMax}`}</span>`:''}${targetSide==='enemy'&&a.hp>0?`<span class="preview">${esc(previewText(a.id))}</span>`:''}</button>`).join('');
    $('allies').innerHTML=s.allies.map(a=>{const cue=executor&&executor!==a.id?{text:targetSide==='ally'?'대상으로 선택':'',active:false}:PartyExpeditionGuide.cue(b,a.id,selected,selectedChoice);return `<button class="ally ${received(a.id)} ${actionCues.units[a.id]?.length?'ability-contributed':''} ${cue.active?'ability-live':''} ${a.hp<=0?'dead':''} ${executor===a.id?'selected':''} ${targetSide==='ally'&&a.hp>0?'targetable':''}" style="--color:${a.color}" data-unit="${a.id}" aria-label="${esc(a.name)}, HP ${a.hp}, ${a.ready?'실행 특성 준비':'실행 특성 사용함'}" title="${esc(a.ability)}" ${lock||!selected&&selectedTool===null||a.hp<=0||executor&&targetSide!=='ally'||!executor&&selected&&b.costFor(selected,a.id)>s.energy?'disabled':''}><span class="name">${esc(a.name)}<span class="ready ${a.ready?'':'spent'}" aria-hidden="true">◆</span></span><span class="role-purpose">${esc(PartyExpeditionGuide.roles[a.id].purpose)}</span>${health(a)}${threatText(a)?`<span class="threat">${esc(threatText(a))}</span>`:''}${a.reaction?`<span class="bonus">반격 ${a.reaction} 준비</span>`:''}${cueMarkup(a.id)||`<span class="role-cue ${cue.active?'live':''}" title="${esc(selected?bonusText(a):a.ability)}">${esc(cue.text)}</span>`}${targetSide==='ally'&&a.hp>0?`<span class="preview">${esc(previewText(a.id))}</span>`:''}</button>`;}).join('');
    $('hand').innerHTML=s.zones.hand.map((id,index)=>{const d=b.definition(id),link=PartyExpeditionGuide.linkCue(b,id),cost=minCost(id),discount=cost<d.cost,blocked=busy||s.status!=='playing'||!s.needsTrim&&s.energy<cost;return `<button class="hand-card ${actionCues.cards[id]?'effect-drawn':''} ${link?.active?'link-ready':''} ${selected===id?'selected':''} ${s.needsTrim?'trim-card':''}" data-card="${id}" title="${esc(actionCues.cards[id]?.detail||s.salvageMarks[id]?actionCues.cards[id]?.detail||presentation.reservationDetail(b,id):d.text)}" aria-label="${s.needsTrim?'버릴 카드: ':''}${esc(d.name)}, 비용 ${d.cost}${discount?`, 인계 비용 ${cost}`:''}, ${esc(d.text)}" ${blocked?'disabled':''}><span class="cost ${discount?'discounted':''}" title="${discount?'동료에게 인계 시 할인':'카드 비용'}">${discount?`${d.cost}→${cost}`:d.cost}</span><span class="family-label" data-family="${d.family}">${esc(d.category)}</span>${rarityLabel(d)}<span class="card-icon" aria-hidden="true">${esc(d.icon)}</span><strong>${esc(d.name)}</strong><span class="card-text">${esc(d.text)}</span>${link?`<span class="card-link ${link.active?'live':''}">${esc(link.text)}${link.active?' · 대상 있음':''}</span>`:''}${actionCues.cards[id]?`<span class="card-link live">${esc(actionCues.cards[id].text)}</span>`:''}${s.needsTrim?'<span class="trim-label">버리기</span>':s.salvageMarks[id]?.returnedRound===s.round&&b.alive('salvager')?'<span class="handoff-label">인양 반환 · 인계 비용 −1, 최소 1</span>':''}${$('show-keys').checked?`<kbd>${index<9?index+1:''}</kbd>`:''}</button>`;}).join('');
    if(selectedTool!==null)$('allies').querySelectorAll('[data-unit]').forEach(button=>{button.disabled=lock||targetSide!=='ally'||b.actor(button.dataset.unit).hp<=0;button.querySelector('.role-cue').textContent=targetSide==='ally'?'도구 대상으로 선택':'';});
    $('deck-count').textContent=`뽑기 ${s.zones.draw.length} · 버림 ${s.zones.discard.length} · 소진 ${s.zones.exhaust.length}`;
    $('reserved').textContent=s.zones.reserve.length?'보관: '+s.zones.reserve.map(id=>b.definition(id).name).join(', '):'';$('reserved').title=s.zones.reserve.map(id=>presentation.reservationDetail(b,id)).join(' ');
    PartyV3Stage.set(s);
  }
  function render(){
    const view=setup?'setup':`${run.s.phase}-${run.s.floor}`;
    if(view!==previousView){previousView=view;coachHidden=false;if(!setup&&run?.s.phase==='map')inspectedMapNode=null;requestAnimationFrame(()=>{$('game').scrollTop=0;window.scrollTo(0,0);});}
    const inBattle=!setup&&run?.s.phase==='battle';$('battle-board').hidden=!inBattle;$('screen').hidden=inBattle;$('deck-open').disabled=!run;$('map-open').disabled=!run||busy;$('screen').classList.toggle('map-screen',!setup&&run?.s.phase==='map');if(!inBattle)$('game').style.removeProperty('--battle-min-height');
    if(!inBattle)auto.stop('finished');
    $('auto-toggle').hidden=!inBattle;$('auto-toggle').textContent=auto.enabled?'자동 중지':'자동 전투';$('auto-toggle').setAttribute('aria-pressed',String(auto.enabled));
    $('progress-label').textContent=setup?'원정 준비':`${run.s.floor+1}/8구역${inBattle?` · 라운드 ${battle().s.round}`:''}`;
    $('progress').innerHTML=Array.from({length:8},(_,i)=>`<span class="step ${run&&i<run.s.battlesWon?'done':!setup&&i===run.s.floor?'current':''}" title="${i+1}구역"></span>`).join('');
    if(inBattle){renderBattle();$('voyage-tray').innerHTML=voyageUI.tray(run);}else {PartyV3Stage.set(null);$('screen').innerHTML=setup?setupScreen():['voyage-1','voyage-2'].includes(run.s.contentVersion)&&voyageUI.screen(run)!==null?voyageUI.screen(run):run.s.phase==='map'?mapScreen():run.s.phase==='reward'?rewardScreen():run.s.phase==='interlude'?interludeScreen():resultScreen();if(!setup&&run.s.phase==='map')requestAnimationFrame(()=>positionMap($('main-map-content')));if(busy)$('screen').querySelectorAll('button').forEach(button=>button.disabled=true);}
    auto.wake();
  }
  async function perform(fn,actor=null,animate=false){
    if(busy)return false;notice();const turn=++token,previousBattle=battle(),before=run?.s.phase==='battle'?previousBattle?.snapshot():null;
    try{fn();actionCues=before?presentation.contributions(before,previousBattle.snapshot(),PartyExpedition.Battle):{units:{},cards:{},links:[]};selectedTool=null;selected=executor=null;selectedChoice=undefined;save();const ms=animate&&Number($('speed').value)>0&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches?360/Number($('speed').value):0;busy=ms>0;if(ms)PartyV3Stage.animate(actor,ms);render();if(ms){battle()?.s.events.forEach(e=>document.querySelector(`[data-unit="${e.target}"]`)?.classList.add('flash'));await new Promise(resolve=>setTimeout(resolve,ms));}if(turn!==token)return false;busy=false;render();return true;}
    catch(error){busy=false;auto.stop('error');notice(error.message);render();return false;}
  }
  function select(card){selectedTool=null;if(busy||setup||run?.s.phase!=='battle')return;auto.stop();const b=battle(),d=b.definition(card);if(!d)return;if(b.s.needsTrim){if(card!=='basic')perform(()=>run.discardForSounder(card));return;}if(minCost(card)>b.s.energy)return;clearCues();selected=card;selectedChoice=undefined;executor=null;notice();render();}
  function unit(id){if(selectedTool!==null){if(!busy)perform(()=>run.useTool(selectedTool,id),null,true);return;}if(busy||!selected||run?.s.phase!=='battle'||battle().s.needsTrim||selectedDefinition()?.choices&&selectedChoice===undefined)return;const a=battle().actor(id);if(!executor){if(!battle().s.allies.includes(a)||a.hp<=0||battle().costFor(selected,id)>battle().s.energy)return;executor=id;render();}else perform(()=>run.play(selected,executor,id,selectedChoice),executor,true);}
  function showSetup(){auto.stop();token++;busy=false;clearCues();selected=executor=null;selectedChoice=undefined;setup=true;selectedTool=null;notice();render();}
  function startRun(seed,contentVersion='voyage-2'){const orderedParty=ROLES.filter(r=>party.includes(r.id)).map(r=>r.id);run=new Run({party:orderedParty,difficulty,breakMode,contentVersion,seed:seed??(Date.now()>>>0)});party=[...run.s.party];setup=false;clearCues();selected=executor=null;selectedChoice=undefined;save();render();}
  function openDeck(action=null){
    if(!run)return;deckAction=action;$('catalog-open').hidden=!!action;$('catalog-family').hidden=true;$('catalog-rarity').hidden=true;$('deck-title').textContent=action==='upgrade'?'강화할 카드 선택':action==='remove'?'제거할 카드 선택':'공용 덱';
    $('deck-description').textContent=action==='upgrade'?'한 장을 선택하면 강화하고 다음 구역으로 이동합니다.':action==='remove'?`최소 6장을 남깁니다.${run.s.interlude?.type==='shop'?` 제거 비용 ${run.s.interlude.prices.remove} 기록 조각.`:''}`:`${run.s.deck.length}장 · 모든 동료가 공유합니다.`;
    $('deck-list').innerHTML=run.viewDeck().map(c=>{const d=c.definition,disabled=action==='upgrade'&&(c.upgraded||!CARDS[c.kind].upgrade)||action==='remove'&&run.s.deck.length<=6;const upgraded=action==='upgrade'&&!disabled?run.definition({...c,upgraded:true}):null;return `<button class="deck-card" data-deck-card="${c.id}" ${!action||disabled?'disabled':''}><span class="cost">${d.cost}</span><span class="family-label" data-family="${d.family}">${esc(d.category)}</span>${rarityLabel(d)}<strong>${esc(d.name)}${c.upgraded?'+':''}</strong><span class="card-text">${esc(d.text)}</span>${upgraded?`<span class="comparison">강화 → ${esc(upgraded.text)}${upgraded.cost!==d.cost?` · 비용 ${upgraded.cost}`:''}</span>`:''}</button>`;}).join('');
    if(!$('deck-dialog').open)$('deck-dialog').showModal();
  }
  function openCatalog(){
    deckAction=null;$('catalog-rarity').hidden=false;$('deck-title').textContent='공용 카드 100종';$('catalog-open').hidden=false;$('catalog-family').hidden=false;
    const family=$('catalog-family').value,rarity=$('catalog-rarity').value,entries=Object.entries(CARDS).filter(([id,d])=>id!=='basic'&&(family==='all'||d.family===family)&&(rarity==='all'||d.rarity===rarity)).map(([id])=>[id,PartyExpedition.cardDefinition(id,['draft-1','voyage-1','voyage-2'].includes(run?.s.contentVersion)?'draft-1':undefined)]);
    $('deck-description').textContent=`${entries.length}종 · 계열은 사용 목적, 희귀도는 등장 빈도입니다. 강화판은 종류에 포함하지 않습니다.`;
    $('deck-list').innerHTML=entries.map(([id,d])=>`<article class="deck-card"><span class="cost">${d.cost}</span><span class="family-label" data-family="${d.family}">${esc(d.category)}</span>${rarityLabel(d)}<strong>${esc(d.name)}</strong><span class="card-text">${esc(d.text)}</span><span class="card-meta">${esc(d.role)}</span><span class="comparison">강화 → ${esc(d.upgrade.text)}${d.upgrade.cost!==undefined&&d.upgrade.cost!==d.cost?` · 비용 ${d.upgrade.cost}`:''}</span></article>`).join('');
    if(!$('deck-dialog').open)$('deck-dialog').showModal();
  }
  const voyageUI=PartyExpeditionVoyageUI.install({getRun:()=>run,perform,render,notice,cardMarkup,isBusy:()=>busy,selectTool:slot=>{
    if(setup||busy||run?.s.phase!=='battle'||battle().s.needsTrim){notice('전투 중 측심을 마친 뒤 사용할 수 있습니다.');return;}
    auto.stop();clearCues();selected=executor=null;selectedChoice=undefined;const tool=PartyExpeditionVoyageCombat.TOOLS[run.s.tools[slot]];
    if(!tool)return;if(!tool.target){perform(()=>run.useTool(slot),null,true);return;}selectedTool=slot;render();
  }});
  $('inventory-open').onclick=()=>voyageUI.inventory();
  $('screen').addEventListener('click',event=>{
    if($('main-map-content')&&handleMapClick(event,$('main-map-content')))return;
    const choice=event.target.closest('[data-role]');if(choice){const id=choice.dataset.role;if(party.includes(id))party=party.filter(x=>x!==id);else if(party.length<4)party.push(id);else {notice('먼저 편성한 동료 한 명을 해제하세요.');return;}notice();render();return;}
    const button=event.target.closest('[data-action]');if(!button||button.disabled||busy)return;const action=button.dataset.action;
    if(action==='start'){try{startRun();}catch(e){notice(e.message);}return;}
    if(action==='resume'){setup=false;notice();render();return;}
    if(action==='new'){showSetup();return;}
    if(action==='view-deck'){openDeck();return;}
    if(action==='retry'){party=[...run.s.party];difficulty=run.s.difficulty;breakMode=run.s.breakMode==='on';startRun(run.s.initialSeed,run.s.contentVersion||'legacy');return;}
    if(action==='deck-service'){openDeck(button.dataset.service);return;}
    if(action==='path')perform(()=>run.choosePath(Number(button.dataset.index)));
    else if(action==='reward')perform(()=>run.chooseReward(button.dataset.kind));
    else if(action==='skip-reward')perform(()=>run.chooseReward(null));
    else if(action==='service')perform(()=>run.chooseInterlude(button.dataset.service));
    else if(action==='service-card')perform(()=>run.chooseInterlude(button.dataset.service,button.dataset.kind));
  });
  $('screen').addEventListener('change',event=>{if(event.target.id==='difficulty')difficulty=event.target.value;if(event.target.id==='break-mode')breakMode=event.target.checked;});
  $('hand').addEventListener('click',event=>{const button=event.target.closest('[data-card]');if(button&&!button.disabled)select(button.dataset.card);});
  $('card-choices').addEventListener('click',event=>{const button=event.target.closest('[data-effect-choice]');if(!button||busy)return;selectedChoice=Number(button.dataset.effectChoice);executor=null;render();});
  ['allies','enemies'].forEach(id=>$(id).addEventListener('click',event=>{const button=event.target.closest('[data-unit]');if(button&&!button.disabled)unit(button.dataset.unit);}));
  $('basic').onclick=()=>select('basic');$('cancel').onclick=()=>{auto.stop();selectedTool=null;selected=executor=null;selectedChoice=undefined;render();};$('end').onclick=()=>{auto.stop();perform(()=>run.endRound(),null,true);};
  $('auto-toggle').onclick=()=>{if(auto.enabled)auto.stop();else if(!setup&&run?.s.phase==='battle'){selectedTool=null;selected=executor=null;selectedChoice=undefined;notice();auto.start();}};
  $('new-run').onclick=showSetup;$('map-open').onclick=openMap;$('deck-open').onclick=()=>openDeck();$('help-open').onclick=()=>$('help-dialog').showModal();$('professions-open').onclick=()=>$('professions-dialog').showModal();$('settings-open').onclick=()=>$('settings-dialog').showModal();
  $('bestiary-open').onclick=()=>{renderBestiary();$('bestiary-dialog').showModal();};
  $('battle-coach').addEventListener('click',event=>{if(event.target.closest('[data-coach-close]')){coachHidden=true;render();}else if(event.target.closest('[data-coach-professions]'))$('professions-dialog').showModal();});
  $('map-dialog-content').addEventListener('click',event=>handleMapClick(event,$('map-dialog-content'),true));
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>auto.wake()));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)auto.pause();else auto.wake();});
  window.addEventListener('pagehide',()=>auto.stop());
  $('deck-list').addEventListener('click',event=>{const button=event.target.closest('[data-deck-card]');if(!button||button.disabled||!deckAction)return;const action=deckAction,card=button.dataset.deckCard;$('deck-dialog').close();deckAction=null;perform(()=>run.chooseInterlude(action,card));});
  $('catalog-open').onclick=openCatalog;$('catalog-family').onchange=openCatalog;$('catalog-rarity').onchange=openCatalog;
  $('speed').onchange=savePrefs;$('show-keys').onchange=()=>{savePrefs();render();};
  $('profession-guide').innerHTML=ROLES.map(r=>{const g=PartyExpeditionGuide.roles[r.id];return `<article class="profession-detail" style="--color:${r.color}">${emblem(r.id)}<h3>${esc(r.name)} · ${esc(g.purpose)}</h3><p>${esc(g.example)}</p><dl><dt>생존 중</dt><dd>${esc(g.passive)}</dd><dt>라운드당 실행 1회</dt><dd>${esc(g.execution)}</dd></dl></article>`;}).join('');
  $('role-guide').innerHTML=ROLES.map(r=>`<p style="--color:${r.color}">${emblem(r.id)}<strong>${esc(r.name)}</strong><br>${esc(r.ability)}</p>`).join('');
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)||setup||run?.s.phase!=='battle'||busy||event.ctrlKey||event.metaKey||event.altKey)return;
    const key=event.key.toLowerCase();if(key==='escape'){auto.stop();selectedTool=null;selected=executor=null;selectedChoice=undefined;notice();render();return;}
    if(/^[1-9]$/.test(key)){const id=battle().s.zones.hand[Number(key)-1];if(id){event.preventDefault();select(id);}return;}
    if(battle().s.needsTrim)return;
    const allyIndex=['a','s','d','f'].indexOf(key);if(allyIndex>=0){event.preventDefault();unit(battle().s.allies[allyIndex].id);return;}
    const enemyIndex=['q','w'].indexOf(key);if(enemyIndex>=0&&(executor||selectedTool!==null)&&selectedDefinition()?.target==='enemy'){event.preventDefault();const a=battle().s.enemies[enemyIndex];if(a&&a.hp>0)unit(a.id);return;}
    if(key==='e'){event.preventDefault();auto.stop();perform(()=>run.endRound(),null,true);}
  });
  if(!qa)try{const p=JSON.parse(localStorage.getItem(PREFS));if(p&&['0','1','2'].includes(p.speed))$('speed').value=p.speed;$('show-keys').checked=!!p?.keys;}catch{}
  if(qa){
    const scenario=new URLSearchParams(location.search).get('scenario')||'roles';
    if(['tactics','enemy','boss','boss-phase'].includes(scenario)){
      // Normal starts and normal player APIs only: no enemy, deck, HP or RNG
      // replacement. This tab is isolated from the player's expedition save.
      run=new Run({party:['navigator','diver','pilot','lightkeeper'],seed:scenario.startsWith('boss')?102:100,contentVersion:'voyage-2'});run.setToolPolicy('emergency');
      let attempts=0,reached=false;
      while(attempts++<1200){
        const s=run.s;
        const goal=scenario==='boss-phase'?s.route?.rewardTier==='boss'&&run.battle?.s.intents.some(i=>i.phase==='submerged'):scenario==='boss'?s.route?.rewardTier==='boss':run.battle?.s.enemies.some(e=>['warder','mender'].includes(e.pattern));
        if(s.phase==='battle'&&goal){reached=true;break;}
        if(s.phase==='blessing')run.chooseBlessing(s.blessings[0]);
        else if(s.phase==='map')run.choosePath(0);
        else if(s.phase==='battle'){
          const a=PartyExpeditionAuto.chooseVoyage(run.battle,'emergency');
          if(a.type==='discard')run.discardForSounder(a.card);else if(a.type==='end')run.endRound();else if(a.type==='tool')run.useTool(a.slot,a.target);else run.play(a.card,a.actor,a.target,a.choice);
        }else if(s.phase==='reward')run.chooseReward(s.offers[0]);
        else if(s.phase==='relicreward')run.chooseRelic(s.relicChoices[0]);
        else if(s.phase==='patron')run.choosePact(null);
        else if(s.phase==='interlude'){
          const i=s.interlude,upgrade=s.deck.find(c=>!c.upgraded&&CARDS[c.kind].upgrade);
          if(i.type==='camp')run.chooseInterlude('heal');else if(i.type==='seal'&&upgrade)run.chooseInterlude('upgrade',upgrade.id);
          else if(i.type==='event'&&['beacon','shelter'].includes(i.event))run.chooseInterlude('heal');else run.chooseInterlude('continue');
        }else throw Error('전술 QA 진입 전에 원정이 종료되었습니다.');
      }
      if(!reached)throw Error('전술 QA 진입 상한');party=[...run.s.party];setup=false;$('speed').value='0';notice('전술 QA · 정상 원정으로 진입 · 실제 저장에는 쓰지 않습니다.');
    }else if(scenario==='balance'){
      // Reach the encounter through real expedition choices. This fixture never
      // edits HP, deck, enemies or RNG and never writes the player's saved run.
      run=new Run({party:['navigator','diver','pilot','lightkeeper'],seed:32,contentVersion:'voyage-1'});
      run.setToolPolicy('emergency');let attempts=0;
      while(attempts++<1000){
        if(run.s.phase==='battle'&&run.s.route.rewardTier==='elite'&&run.battle.s.enemies.some(e=>e.pattern==='twins'))break;
        const s=run.s;
        if(s.phase==='blessing')run.chooseBlessing(s.blessings[0]);
        else if(s.phase==='map'){const target=s.choices.findIndex(r=>r.rewardTier==='elite'&&r.enemies.some(e=>e.pattern==='twins'));run.choosePath(target>=0?target:0);}
        else if(s.phase==='battle'){
          const a=PartyExpeditionAuto.chooseVoyage(run.battle,'emergency');
          if(a.type==='discard')run.discardForSounder(a.card);else if(a.type==='end')run.endRound();else if(a.type==='tool')run.useTool(a.slot,a.target);else run.play(a.card,a.actor,a.target,a.choice);
        }else if(s.phase==='reward')run.chooseReward(s.offers[0]);
        else if(s.phase==='relicreward')run.chooseRelic(s.relicChoices[0]);
        else if(s.phase==='patron')run.choosePact(null);
        else if(s.phase==='interlude'){
          const i=s.interlude;
          if(i.type==='camp')run.chooseInterlude('heal');else if(i.type==='seal')run.chooseInterlude('upgrade',s.deck.find(c=>!c.upgraded).id);
          else if(i.type==='event'&&['beacon','shelter'].includes(i.event))run.chooseInterlude('heal');else run.chooseInterlude('continue');
        }else throw Error('밸런스 QA의 정예 진입 전에 원정이 종료되었습니다.');
      }
      if(run.s.phase!=='battle'||!run.battle.s.enemies.some(e=>e.pattern==='twins'))throw Error('밸런스 QA 진입 상한');
      party=[...run.s.party];setup=false;$('speed').value='0';notice('1차 패치 QA · 정예 광역 준비 2턴 / 실행 3턴 · 실제 원정 저장에는 쓰지 않습니다.');
    }else if(['draft','voyage','tools'].includes(scenario)){
      run=new Run({party:['navigator','diver','pilot','lightkeeper'],seed:178,contentVersion:scenario==='draft'?'draft-1':'voyage-1'});party=[...run.s.party];setup=false;$('speed').value='0';notice('QA 원정 · 정상 시작 덱 · 실제 원정 저장에는 쓰지 않습니다.');
      if(scenario==='tools'){run.chooseBlessing(run.s.blessings[0]);run.s.tools=['flare','medicine'];run.s.allies[0].hp=20;run.choosePath(0);}
    }else{
    const samples={roles:['guard','strike','burst','expose','focus'],links:['expose','pursuit','guard','pressurevalve','salvage','strike'],heavy:['focus','expose','deepdive','bastion','mobilize','strike','guard'],defense:['guard','beacon','bastion','pressurevalve','focus','strike'],cards100:['routechoice','assaultstance','patientstrike','cascade','focus','markall'],power:['steadywatch','mirrorward','guard','beacon','focus']};
    const kinds=(samples[scenario]||samples.roles).filter(k=>CARDS[k]);
    run=new Run({party:['navigator','diver','pilot','lightkeeper'],seed:8100,contentVersion:'draft-1'});run.choosePath(0);
    run.s.route.enemies[0].hp=100;run.s.route.enemies[0].max=100;
    run.s.map.nodes.find(n=>n.id===run.s.route.id).route=JSON.parse(JSON.stringify(run.s.route));
    const qaDeck=[...kinds,'strike','guard'];
    run.battle=new PartyExpedition.Battle({party:run.s.party,deck:qaDeck.map((kind,i)=>({id:'r'+i,kind,upgraded:false})),enemies:run.s.route.enemies,seed:8100,cardSet:'draft-1'});
    run.s.deck=qaDeck.map((kind,i)=>({id:'r'+i,kind,upgraded:false}));while(run.s.deck.length<6){const i=run.s.deck.length;run.s.deck.push({id:'r'+i,kind:'strike',upgraded:false});}
    run.s.nextCard=Math.max(10,run.s.deck.length);
    run.battle.s.zones={draw:qaDeck.slice(kinds.length).map((_,i)=>'r'+(i+kinds.length)),hand:kinds.map((_,i)=>'r'+i),resolving:[],discard:[],reserve:[],exhaust:[]};run.battle.s.needsTrim=false;
    party=[...run.s.party];setup=false;$('speed').value='0';
    notice('QA 연습 · 실제 원정 저장에는 쓰지 않습니다.');
    }
  }else try{const saved=JSON.parse(localStorage.getItem(STORE));if(saved){run=Run.restore(saved);party=[...run.s.party];difficulty=run.s.difficulty;breakMode=run.s.breakMode==='on';setup=false;}}catch{notice('이전 원정 저장을 읽을 수 없습니다. 새 원정을 시작할 수 있습니다.');}
  render();
})();
