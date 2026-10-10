(function(root){
  'use strict';
  const {RELICS,TOOLS,ENCHANTS}=root.PartyExpeditionVoyageCombat;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button=(action,id,title,text,disabled=false)=>`<button class="service" data-voyage="${action}" data-id="${esc(id)}" ${disabled?'disabled':''}><strong>${esc(title)}</strong><span>${esc(text)}</span></button>`;
  const relicButton=(action,id,extra='',disabled=false)=>button(action,id,RELICS[id].icon+' '+RELICS[id].name,RELICS[id].text+extra,disabled);
  function screen(run,cardMarkup){
    const s=run.s;
    if(s.phase==='blessing')return `<span class="eyebrow">원정의 첫 방향</span><h1 class="screen-title">어떤 유실물을 챙길까요?</h1><p class="lead">선택한 유물은 이번 원정 동안 파티 전체에 작동합니다.</p><div class="interlude-grid">${s.blessings.map(id=>relicButton('blessing',id)).join('')}</div>`;
    if(s.phase==='relicreward')return `<span class="eyebrow">강적 돌파</span><h1 class="screen-title">새로운 해법을 얻었습니다.</h1><div class="interlude-grid">${s.relicChoices.map(id=>relicButton('relic',id)).join('')}</div><button data-voyage="relic" data-id="skip">유물 없이 계속</button>`;
    if(s.phase==='patron')return `<span class="eyebrow">심도 전환</span><h1 class="screen-title">심층의 존재와 계약합니다.</h1><p class="lead">대가를 먼저 확인하세요. 계약 없이 진행할 수도 있습니다.</p><div class="interlude-grid">${s.pacts.map((p,i)=>button('pact',i,RELICS[p.id].name,RELICS[p.id].text+' / 대가: '+({hp:'생존 전원 HP −3, 최소 1',gold:'기록 조각 10',risk:'다음 두 전투 시작 에너지 −1'}[p.cost]),p.cost==='gold'&&s.gold<10)).join('')}</div><button data-voyage="pact" data-id="skip">계약 없이 계속</button>`;
    if(s.phase!=='interlude')return null;
    const i=s.interlude;if(i.type==='camp')return null;
    if(i.type==='seal')return `<h1 class="screen-title">정박지 인장</h1><p class="lead">회복을 마쳤습니다. 강화할 카드도 한 장 고르세요.</p>${button('card-select','upgrade','카드 강화','덱에서 한 장 선택')}`;
    if(i.type==='shop')return `<span class="eyebrow">기록 조각 ${s.gold}</span><h1 class="screen-title">유실물 상점</h1><div class="interlude-grid">${button('service','heal','동료 회복 · 12','전원 HP +10 · 쓰러진 동료 HP 10 복귀',i.healed||s.gold<12)}${button('card-select','remove',`카드 제거 · ${i.prices.remove}`,'방문당 1회 · 구매할 때마다 다음 제거 비용 +6',i.removed||s.gold<i.prices.remove||s.deck.length<=6)}${i.relics.map(id=>relicButton('shop-relic',id,` · ${i.prices.relic} 기록 조각`,s.gold<i.prices.relic)).join('')}${i.tools.map(id=>button('shop-tool',id,TOOLS[id].name+' · '+TOOLS[id].price,TOOLS[id].text,s.tools.length>=2||s.gold<TOOLS[id].price)).join('')}${i.enchants.map(id=>button('enchant-select',id,'각인 '+ENCHANTS[id].name+' · 18',ENCHANTS[id].text,s.gold<18)).join('')}</div><div class="shop-grid">${i.offers.map(k=>cardMarkup(run.definition(k),`data-voyage="shop-card" data-id="${k}" ${s.gold<i.cardPrices[k]?'disabled':''}`,`<span>${i.sale===k?'할인 · ':''}${i.cardPrices[k]} 기록 조각</span>`)).join('')}</div><div class="actions">${button('service','continue','다음 구역으로','')}${button('inventory','','장비 확인','도구 교체·자동 사용 설정')}</div>`;
    const choices=[];
    if(['wreck','pressure','cache'].includes(i.event))choices.push(...i.relics.map(id=>relicButton('event-relic',id,i.event==='wreck'?' / 대가: 생존 전원 HP −2, 최소 1':i.event==='pressure'?' / 다음 두 전투 시작 에너지 −1':'')));
    if(['wreck','pressure'].includes(i.event))choices.push(button('service','event-gold','기록 조각 받기',i.event==='wreck'?'기록 조각 +12':'기록 조각 +8'));
    if(['echo','cache'].includes(i.event))choices.push(button('service','event-tool',TOOLS[i.tool].name,TOOLS[i.tool].text+(i.event==='cache'?' · 기록 조각 +8':''),s.tools.length>=2));
    if(i.event==='echo')choices.push(button('card-select','event-clone','선택한 카드 복제 · 12','강화와 각인도 보존합니다.',s.gold<12));
    if(i.event==='observatory')choices.push(...i.transform.map(k=>button('transform-select',k,'교환 후보 · '+run.definition(k).name,run.definition(k).text+' / 다음에 교환할 내 카드를 선택합니다. 강화·각인 보존.')));
    if(i.event==='beacon')choices.push(...i.enchants.map(id=>button('enchant-select',id,'각인 '+ENCHANTS[id].name,ENCHANTS[id].text)));
    if(['beacon','shelter'].includes(i.event))choices.push(button('service','heal','동료 회복',i.event==='shelter'?'전원 HP +6 · 쓰러진 동료 HP 8 복귀':'전원 HP +4 · 쓰러진 동료 HP 8 복귀'));
    if(i.event==='shelter')choices.push(button('card-select','upgrade','카드 강화','한 장을 직접 선택합니다.'));
    return `<span class="eyebrow">항로의 사건</span><h1 class="screen-title">${esc(i.name)}</h1><p class="lead">${esc(i.description)}</p><div class="interlude-grid">${choices.join('')}</div><div class="actions">${button('service','continue','관여하지 않고 출발','')}${button('inventory','','장비 확인','')}</div>`;
  }
  function install({getRun,perform,render,notice,selectTool,cardMarkup,isBusy=()=>false}){
    const dialog=document.createElement('dialog');dialog.id='voyage-dialog';dialog.innerHTML='<div class="dialog-heading"><h2 id="voyage-title"></h2><button id="voyage-close" aria-label="장비 닫기">×</button></div><div id="voyage-content"></div>';document.body.append(dialog);
    document.getElementById('voyage-close').onclick=()=>dialog.close();
    const content=()=>document.getElementById('voyage-content');
    function open(title,html){document.getElementById('voyage-title').textContent=title;content().innerHTML=html;if(!dialog.open)dialog.showModal();}
    function inventory(){const run=getRun(),s=run?.s;if(!s?.relics){notice('새 원정에서 유물과 전술 도구를 사용할 수 있습니다.');return;}
      open('원정 장비',`<div class="interlude-grid">${s.relics.map(id=>`<article class="service"><strong>${esc(RELICS[id].icon+' '+RELICS[id].name)}</strong><span>${esc(RELICS[id].text)}</span></article>`).join('')}</div><h3>전술 도구 ${s.tools.length}/2</h3><div class="interlude-grid">${s.tools.map((id,slot)=>button(s.phase==='battle'?'tool-select':'tool-discard',slot,TOOLS[id].name,TOOLS[id].text+(s.phase==='battle'?'':' · 선택하면 버림'))).join('')}</div><label>자동 도구 사용 <select data-voyage-policy><option value="manual" ${s.toolPolicy==='manual'?'selected':''}>직접 사용</option><option value="emergency" ${s.toolPolicy==='emergency'?'selected':''}>위기 시 허용</option></select></label><p>자동 전투는 기본적으로 도구를 사용하지 않습니다. 위기 시 허용하면 현재 공격으로 쓰러질 동료를 구할 때 사용합니다.</p>`);
    }
    function cards(action,extra){const run=getRun();open('적용할 카드 선택',`<p>${action==='enchant'?esc(ENCHANTS[extra].text):action==='event-transform'?'선택한 카드가 '+esc(run.definition(extra).name)+'로 바뀝니다. 강화와 각인을 유지합니다.':'덱에서 한 장을 직접 고르세요.'}</p><div class="shop-grid">${run.viewDeck().map(c=>{
      const disabled=action==='upgrade'&&c.upgraded||action==='remove'&&run.s.deck.length<=6||action==='enchant'&&(c.enchant||!ENCHANTS[extra].test(c.definition))||action==='event-transform'&&c.enchant&&!ENCHANTS[c.enchant].test(run.definition(extra));
      const after=disabled?null:action==='enchant'?root.PartyExpeditionVoyageCombat.enchanted(c.definition,extra):action==='event-transform'?run.definition({kind:extra,upgraded:c.upgraded,enchant:c.enchant}):action==='upgrade'?run.definition({...c,upgraded:true}):null;
      return button('apply-card',JSON.stringify({action,extra,card:c.id}),c.definition.name+(c.upgraded?'+':''),`비용 ${c.definition.cost}${after?' → '+after.cost:''} · `+c.definition.text+(after?' → '+after.text:''),disabled);
    }).join('')}</div>`);}
    document.addEventListener('change',e=>{if(e.target.matches('[data-voyage-policy]')){getRun().setToolPolicy(e.target.value);perform(()=>getRun().snapshot());}});
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-voyage]');if(!b||b.disabled||isBusy())return;
      const a=b.dataset.voyage,id=b.dataset.id,run=getRun();if(!run)return;
      if(a==='inventory'){inventory();return;}
      if(a==='card-select'){cards(id);return;}
      if(a==='enchant-select'){cards('enchant',id);return;}
      if(a==='transform-select'){cards('event-transform',id);return;}
      if(a==='tool-select'){dialog.close();selectTool(Number(id));return;}
      if(a==='apply-card'){
        const p=JSON.parse(id),action=p.action==='enchant'?(run.s.interlude.type==='shop'?'enchant':'event-enchant'):p.action;
        const arg=p.action==='enchant'?{card:p.card,enchant:p.extra}:p.action==='event-transform'?{card:p.card,kind:p.extra}:p.card;
        dialog.close();perform(()=>run.chooseInterlude(action,arg));return;
      }
      if(a==='tool-discard'){dialog.close();perform(()=>run.discardTool(Number(id)));return;}
      dialog.close();
      const fn=a==='blessing'?()=>run.chooseBlessing(id):a==='relic'?()=>run.chooseRelic(id==='skip'?null:id):a==='pact'?()=>run.choosePact(id==='skip'?null:Number(id)):a==='shop-relic'?()=>run.chooseInterlude('relic',id):a==='shop-tool'?()=>run.chooseInterlude('tool',id):a==='shop-card'?()=>run.chooseInterlude('buy',id):a==='event-relic'?()=>run.chooseInterlude('event-relic',id):()=>run.chooseInterlude(id);
      perform(fn);
    });
    return {inventory,screen:run=>screen(run,cardMarkup),tray:run=>{
      if(!['voyage-1','voyage-2'].includes(run?.s.contentVersion))return '';
      const v=run.battle?.s.voyage;
      const icons=run.s.relics.map(id=>{
        const count=id==='compass'?`${Math.min(3,v?.families?.length||0)}/3`:id==='signal'?`${Math.min(3,v?.actors?.length||0)}/3`:['oxygen','buoy','hourglass'].includes(id)?`${v?.used?.[id]?0:1}/1`:['rope','lens','mirror'].includes(id)?`${v?.roundUsed?.[id]?0:1}/1`:'';
        return `<button class="relic-charge" data-voyage="inventory" data-id="" title="${esc(RELICS[id].name+' · '+RELICS[id].text)}" aria-label="${esc(RELICS[id].name+' · '+(count?'발동 상태 '+count:'원정 효과'))}">${RELICS[id].icon}${count?` <small>${count}</small>`:''}</button>`;
      }).join('');
      return `<span class="relic-charges">${icons}</span>${run.s.tools.map((id,i)=>`<button data-voyage="tool-select" data-id="${i}" title="${esc(TOOLS[id].text)}">${esc(TOOLS[id].icon+' '+TOOLS[id].name)}</button>`).join('')}${v?.rule==='lowtide'?'<span>불안정 항로 · 시작 에너지 −1</span>':''}`;
    }};
  }
  root.PartyExpeditionVoyageUI={screen,install};
})(typeof globalThis!=='undefined'?globalThis:this);
