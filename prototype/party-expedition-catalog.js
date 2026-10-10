(function(root){
  'use strict';
  // Authored identities and effects shared by the game and the design report.
  const families={assault:'돌파',ward:'수호',disrupt:'교란',cycle:'순환',repair:'정비'};
  const oldFamilies={
    assault:['strike','burst','jab','sweep','finisher','impale','undertow','deepdive','check','feint'],
    ward:['guard','fortress','riposte','bulwark','hold','bastion'],
    disrupt:['suppress','sunder','expose','lockdown','pressurevalve'],
    cycle:['draw','echo','salvage','pursuit','beacon','mobilize','rally'],
    repair:['mend','focus']
  };
  const oldPlans={
    strike:['낮은 비용으로 단일 위협 처리','노출·교대→공격'],
    burst:['준비 뒤 집중 피해','에너지 이월·도선사→일격'],
    jab:['자원 없이 마무리','소진→드로우'],
    sweep:['여러 적을 동시에 정리','광역 노출→광역'],
    finisher:['축적한 자원을 큰 타격으로 전환','이월·호흡→고비용'],
    impale:['적 보호를 우회','노출→관통'],
    undertow:['공격하며 실행자 복구','회복·장기전'],
    deepdive:['노출을 준비해 강력한 일격','노출·도선사→고비용'],
    check:['공격하며 실행자 보호','교대·자기 보호'],
    feint:['작은 타격과 실행자 방어','자기 보호→압력 전환'],
    guard:['예고된 공격을 막기','보호→반격·드로우'],
    fortress:['집중 강타에 큰 보호','보호→이월·전환'],
    riposte:['공격을 흡수해 반격','적 예고→보호→반격'],
    bulwark:['전체와 집중 공격에 함께 대응','전원 보호→조건부 효과'],
    hold:['다음 라운드 방어 확보','보관·인계'],
    bastion:['전체 위협 방어와 지정 반격','전원 보호·반격'],
    suppress:['예고 피해를 줄이기','약화→추가 피해'],
    sunder:['타격과 예고 억제를 함께','약화→추가 피해'],
    expose:['후속 타격의 틈 만들기','노출→피해·드로우·에너지'],
    lockdown:['큰 예고를 집중 억제','약화→안전한 준비'],
    pressurevalve:['자기 보호를 적 억제로 전환','보호→약화'],
    draw:['남은 에너지의 선택지 찾기','드로우→손패 연계'],
    echo:['다음 라운드 공격 확보','보관·인계'],
    salvage:['방금 사용한 카드 재활용','버림→회수'],
    pursuit:['노출을 타격과 손패로 전환','노출→드로우'],
    beacon:['보호된 아군을 통해 손패 연결','보호→드로우'],
    mobilize:['방어와 다음 손패를 함께 준비','전원 보호·버림→보관'],
    rally:['전체 보호와 손패 공급','보호·드로우'],
    mend:['누적 피해를 한 번 복구','소진·생존 유지'],
    focus:['현재 라운드 자원 보충','소진→고비용·X']
  };
  // Each row: stable ID, name, energy, effect specification, tactical role,
  // links. Upgrade is authored separately from normal identity: not a 101st card.
  const rows={
    assault:[
      ['crosscut','교차 베기',1,{damage:2,hits:3,weakDamage:3},'약화한 적을 연타로 마무리','약화→연타·교대'],
      ['harpoon','닻창',2,{damage:9,exposure:5},'피해와 후속 공격 준비','노출→후속'],
      ['shieldbash','방벽 충돌',1,{damage:3,shieldDamage:.5},'자기 보호를 공격에 활용','보호→공격'],
      ['aftershock','잔류 충격',1,{damage:5,exposedDamage:5},'노출을 피해로 전환','노출→공격'],
      ['undertowfan','역류 확산',2,{areaDamage:4,weak:3},'다수 타격과 주대상 억제','광역·약화'],
      ['patientstrike','결정적 순간',3,{damage:22,retain:true},'에너지를 모아 확실한 타격','보존·고비용'],
      ['cascade','쇄도','X',{areaDamage:4,xScale:['areaDamage']},'잔여 에너지 광역 사용','에너지→광역'],
      ['drill','나선 관통',2,{damage:3,hits:3,penetrate:true},'적 보호를 우회한 연타','연타·관통'],
      ['redline','한계 돌파',1,{damage:15,selfHP:4,exhaust:true},'체력을 지불하는 비상 공격','회복·소진'],
      ['returnstrike','귀환 타격',2,{damage:10,reserve:true},'반복 공격과 인계 활용','보관·인계'],
      ['lastword','마지막 파문',3,{areaDamage:11,exhaust:true},'한 번의 강한 광역 타격','소진·광역'],
      ['doublecourse','두 갈래 진격',2,{choices:[{name:'집중',damage:12},{name:'분산',areaDamage:4}]},'단일·다수 위협에 맞춰 선택','선택·광역'],
      ['wakeblade','물결 칼날',1,{damage:5,draw:1},'공격하며 손패 연결','공격→드로우'],
      ['shatterpoint','붕괴점',2,{damage:12,weakDamage:5},'약화한 적에게 집중 피해','약화→공격'],
      ['assaultstance','진격 태세',2,{power:{assaultDamage:2}},'이후 돌파 카드의 첫 타격 강화','지속·돌파']
    ],
    ward:[
      ['coverstep','엄호 교대',1,{shield:5,selfShield:3},'대상과 실행자 분산 보호','교대·보호'],
      ['anchoredwall','고정 방벽',2,{shield:12,retain:true},'강타 예고까지 방어 보유','보존·보호'],
      ['emergencylight','비상 점등',0,{allShield:3,exhaust:true},'에너지 부족 시 전원 방어','소진·전원'],
      ['tidalwall','밀물 장벽','X',{allShield:3,xScale:['allShield']},'잔여 에너지 전원 보호','에너지→보호'],
      ['mirrorward','반향 장막',2,{power:{shieldReaction:2}},'이후 카드 보호에 반격 추가','지속·보호→반격'],
      ['restingwall','휴식 방벽',2,{shield:8,heal:3},'다친 동료 방어와 복구','보호·회복'],
      ['hardreturn','견고한 귀환',2,{shield:9,reserve:true},'다음 라운드 방어 확보','보관·인계'],
      ['guardchoice','갈림 방벽',1,{choices:[{name:'집중',shield:5},{name:'분산',allShield:2}]},'집중·전체 공격 대응 선택','선택·보호'],
      ['recoil','반동 방벽',2,{shield:9,reaction:10},'집중 공격을 반격으로 전환','보호→반격'],
      ['shieldweave','보호 직조',1,{shield:4,protectedShield:5},'이미 보호한 대상 방어 확장','보호→보호'],
      ['warddraw','안전한 관측',2,{shield:8,draw:2},'방어하면서 다음 해법 찾기','보호→드로우'],
      ['reserveward','예비 방벽',1,{shield:4,nextShield:4},'이번·다음 라운드 나눠 보호','다음 라운드 준비'],
      ['lastshelter','최후의 피난처',3,{allShield:10,exhaust:true},'강한 전체 위협 비상 대응','소진·고비용'],
      ['steadywatch','불침번',2,{power:{roundShield:2}},'매 라운드 전원에게 작은 보호','지속·장기전']
    ],
    disrupt:[
      ['markall','전면 관측',1,{allExposure:3},'여러 적에게 후속 틈 생성','광역 노출'],
      ['dampen','파동 감쇠',2,{allWeak:3},'다수의 예고 공격 완화','전원 약화'],
      ['quietchain','침묵 사슬',1,{weak:3,retain:true},'강타까지 제어 카드 보유','보존·약화'],
      ['crackdraw','균열 관측',1,{exposure:5,draw:1},'공격 준비와 손패 연결','노출→드로우'],
      ['pressurechoice','압력 분기',1,{choices:[{name:'억제',weak:5},{name:'개방',exposure:6}]},'지금 방어와 다음 공격 선택','선택·약화·노출'],
      ['shatterguard','외피 해체',1,{damage:4,removeShield:8},'적 보호를 제거하고 동료 연결','적 보호→공격'],
      ['widecrack','심층 균열',2,{areaDamage:3,allExposure:4},'다수 공격의 발판','광역·노출'],
      ['slowcurrent','느린 해류',2,{weak:6,nextShield:3},'이번 적 억제와 다음 자기 방어','약화·준비'],
      ['breaksurvey','균형 탐사',1,{damage:3,breakPower:3},'균형과 후속 타격 준비','브레이크·공격'],
      ['controlnet','정박망','X',{allWeak:3,xScale:['allWeak']},'잔여 에너지로 전원 공격 억제','에너지→약화'],
      ['depthlens','심도 렌즈',2,{power:{exposureBonus:2}},'이후 노출 부여량 강화','지속·노출'],
      ['measuredthreat','위협 계측',1,{weak:3,draw:1},'억제와 다음 선택 연결','약화→드로우'],
      ['spentpressure','소모 압력',1,{weak:2,spendShield:7},'자기 보호를 더 큰 약화로 전환','보호→약화'],
      ['ruptureseal','파열 봉인',3,{allWeak:8,exhaust:true},'한 번의 대규모 예고 완화','소진·광역 제어'],
      ['controlrhythm','감쇠 리듬',2,{power:{disruptShield:3}},'교란을 맡길 때 자신 보호','지속·교란→보호']
    ],
    cycle:[
      ['heldinsight','간직한 해법',2,{draw:3,retain:true},'필요한 시점까지 드로우 보유','보존·순환'],
      ['quickchart','빠른 해도',0,{draw:2,exhaust:true},'한 번의 손패 재료 공급','소진·드로우'],
      ['routechoice','갈림길',2,{choices:[{name:'보급',energy:3,exhaust:true},{name:'탐색',draw:3}]},'자원과 손패 중 부족한 것 선택','선택·에너지·드로우'],
      ['familyretrieve','진격 회수',1,{retrieveFamily:'assault'},'최근 돌파 카드 한 장 회수','계열·회수'],
      ['wardretrieve','방벽 회수',1,{retrieveFamily:'ward'},'최근 수호 카드 한 장 회수','계열·회수'],
      ['longreserve','장기 준비',1,{reserveDiscard:1,draw:1},'버린 카드 다음 손패와 현재 선택','보관·드로우'],
      ['drawtide','기록 홍수','X',{draw:2,xScale:['draw']},'잔여 에너지로 대량 탐색','에너지→드로우'],
      ['echochart','반향 해도',2,{draw:2,reserve:true},'다음 라운드 순환을 확보','보관·순환'],
      ['cyclingcurrent','순환 해류',2,{power:{firstCycleDraw:1}},'라운드 첫 순환 카드 추가 드로우','지속·순환'],
      ['exhaustledger','소실 기록',2,{power:{firstExhaustDraw:2}},'라운드 첫 소진을 손패로 전환','지속·소진→드로우'],
      ['shieldrecord','방벽 기록',1,{shield:3,shieldedDraw:2},'이미 보호한 동료로 손패 탐색','보호→드로우'],
      ['openrecord','틈새 기록',1,{damage:3,exposureDraw:3},'노출을 많은 손패로 전환','노출→드로우'],
      ['preparedledger','준비된 기록',2,{draw:3,nextEnergy:1,exhaust:true},'지금 손패와 다음 자원 연결','드로우·준비']
    ],
    repair:[
      ['firstaidkit','휴대 구급함',1,{heal:5,exhaust:true},'작은 비용의 비상 회복','소진·회복'],
      ['safebreath','안전한 호흡',1,{shield:3,energy:1,exhaust:true},'방어하면서 실행자 특성 활용','소진·에너지·보호'],
      ['storedfuel','비축 연료',1,{nextEnergy:2,retain:true},'필요한 다음 라운드 자원 준비','보존·이월'],
      ['groupmend','공동 처치',2,{allHeal:3,exhaust:true},'전체 피해 이후 복구','소진·전원 회복'],
      ['rescuechoice','구조 판단',2,{choices:[{name:'응급',heal:7,exhaust:true},{name:'예방',shield:10}]},'누적 피해 복구와 예고 대응 선택','선택·회복·보호'],
      ['healingtide','회복 조류','X',{heal:4,xScale:['heal'],exhaust:true},'잔여 에너지로 한 동료 복구','에너지→회복'],
      ['supplyline','보급선',2,{power:{roundEnergy:1}},'초기 투자 뒤 라운드 공급 개선','지속·에너지'],
      ['medicalstation','응급 정박소',2,{power:{roundHeal:1}},'생존 동료의 작은 지속 회복','지속·장기전'],
      ['restoringlight','회복의 불빛',2,{heal:5,shield:5,retain:true},'위협 때까지 방어·회복 보유','보존·회복·보호'],
      ['recoverydraw','회복 관측',1,{heal:3,draw:1},'작은 회복과 다음 선택','회복→드로우'],
      ['fuelreserve','다음 항해',0,{nextEnergy:1,exhaust:true},'한 번의 다음 라운드 공급','소진·준비'],
      ['pressurecare','압력 치료',1,{heal:4,protectedHeal:4},'보호된 동료에게 강화 회복','보호→회복'],
      ['emergencyreserve','비상 비축',2,{energy:3,nextShield:3,exhaust:true},'손패가 충분할 때 자원과 방어 공급','소진·에너지·준비']
    ]
  };
  const planned=Object.entries(rows).flatMap(([family,items])=>items.map(([id,name,cost,effects,role,links])=>({id,name,cost,family,effects,role,links})));
  const powerNames={assaultDamage:'돌파 카드의 첫 직접 타격 추가 피해',shieldReaction:'카드 보호를 받은 동료에게 추가 반격',roundShield:'라운드 시작 전원 보호',exposureBonus:'카드·잠수자가 부여하는 노출 추가',disruptShield:'교란 카드 실행 뒤 자신 보호',firstCycleDraw:'라운드 첫 순환 카드 사용 시 추가 드로우',firstExhaustDraw:'라운드 첫 소진 카드 사용 시 추가 드로우',roundEnergy:'라운드 시작 추가 에너지',roundHeal:'라운드 시작 생존 동료 회복'};
  const rarities={common:'일반',uncommon:'고급',rare:'희귀'};
  const rarityIds={
    rare:['deepdive','bastion','mobilize','finisher','assaultstance','lastword','lastshelter','depthlens','controlrhythm','cyclingcurrent','exhaustledger','supplyline','medicalstation','ruptureseal','drawtide','controlnet','healingtide'],
    uncommon:['burst','fortress','bulwark','lockdown','impale','echo','undertow','rally','mend','patientstrike','cascade','drill','redline','returnstrike','doublecourse','tidalwall','mirrorward','restingwall','hardreturn','recoil','steadywatch','dampen','widecrack','slowcurrent','heldinsight','routechoice','familyretrieve','wardretrieve','echochart','preparedledger','groupmend','rescuechoice','restoringlight','emergencyreserve']
  };
  // Versioned bridges: previous expeditions retain their original card effects.
  const draftBridges={
    slowcurrent:{exposure:2,link:'약화·노출→후속 공격·다음 보호'},
    reserveward:{shield:3,nextShield:3,nextEnergy:1,link:'보호→다음 라운드 자원'},
    shatterguard:{exposure:2,link:'적 보호 제거→노출→후속 공격'},
    recoverydraw:{protectedHeal:3,link:'보호→회복→드로우'}
  };
  function variant(base,kind,cardSet){
    if(cardSet!=='draft-1'||!draftBridges[kind])return base;
    const d={...base,...draftBridges[kind]},u=upgradeEffects({...planned.find(c=>c.id===kind).effects,...draftBridges[kind]},d.cost);
    d.text=describe(d);d.upgrade={...u,text:describe({...d,...u})};return d;
  }
  function linkTags(d){
    const v=[d,...(d.choices||[])],any=keys=>v.some(o=>keys.some(k=>o[k]));
    return [any(['exposure','allExposure','exposureDraw','exposedDamage','weak','allWeak','weakDamage'])&&'opening',any(['shield','allShield','selfShield','nextShield','protectedShield','shieldDamage','shieldedDraw','spendShield','reaction','protectedHeal'])&&'bulwark',any(['energy','nextEnergy','xScale','retain'])&&'surge',any(['retrieveFamily','reserve','reserveDiscard','retrieve'])&&'recycle',any(['exhaust'])&&'exhaust'].filter(Boolean);
  }
  function describe(d){
    const out=[],unit=key=>d.xScale?.includes(key)?`${d[key]}×X`:d[key];
    if(d.choices)out.push(d.choices.map(o=>`${o.name}: ${describe({...o,cost:d.cost})}`).join(' / '));
    if(d.damage)out.push(`피해 ${d.damage}${d.hits?` × ${d.hits}회`:''}${d.penetrate?' · 보호 무시':''}`);
    if(d.areaDamage)out.push(`모든 적 피해 ${unit('areaDamage')}`);
    if(d.exposedDamage)out.push(`공격 전 노출이 있으면 추가 피해 ${d.exposedDamage}`);
    if(d.weakDamage)out.push(`공격 전 약화가 있으면 추가 피해 ${d.weakDamage}`);
    if(d.shieldDamage)out.push(`자신의 보호 ${d.shieldDamage*100}%만큼 첫 타격 추가 피해`);
    if(d.shield)out.push(`대상 보호 ${d.shield}`);
    if(d.protectedShield)out.push(`사용 전 대상 보호가 있으면 추가 보호 ${d.protectedShield}`);
    if(d.allShield)out.push(`전원 보호 ${unit('allShield')}`);
    if(d.selfShield)out.push(`자신 보호 ${d.selfShield}`);
    if(d.reaction)out.push(`공격을 보호로 흡수하고 생존하면 반격 ${d.reaction}`);
    if(d.heal)out.push(`대상 회복 ${unit('heal')}`);
    if(d.protectedHeal)out.push(`사용 전 대상 보호가 있으면 추가 회복 ${d.protectedHeal}`);
    if(d.allHeal)out.push(`생존 동료 전원 회복 ${d.allHeal}`);
    if(d.weak)out.push(`다음 공격 −${d.weak}`);
    if(d.spendShield)out.push(`자신 보호 최대 ${d.spendShield} 소비해 그만큼 약화 추가`);
    if(d.allWeak)out.push(`모든 적 다음 공격 −${unit('allWeak')}`);
    if(d.exposure)out.push(`노출 ${d.exposure}`);
    if(d.allExposure)out.push(`모든 적 노출 ${d.allExposure}`);
    if(d.removeShield)out.push(`타격 뒤 대상 보호 최대 ${d.removeShield} 제거`);
    if(d.breakPower)out.push(`브레이크 사용 시 균형 −${d.breakPower}`);
    if(d.draw)out.push(`드로우 ${unit('draw')}`);
    if(d.exposureDraw)out.push(`공격 전 노출이 있으면 드로우 ${d.exposureDraw}`);
    if(d.shieldedDraw)out.push(`사용 전 대상 보호가 있으면 드로우 ${d.shieldedDraw}`);
    if(d.energy)out.push(`에너지 +${d.energy}`);
    if(d.nextEnergy)out.push(`다음 라운드 에너지 +${d.nextEnergy}`);
    if(d.nextShield)out.push(`다음 라운드 자신 보호 ${d.nextShield}`);
    if(d.retrieveFamily)out.push(`최근 버린 ${families[d.retrieveFamily]} 카드 1장 회수`);
    if(d.reserveDiscard)out.push(`최근 버린 최대 ${d.reserveDiscard}장을 다음 손패에 보관`);
    if(d.selfHP)out.push(`자신 HP ${d.selfHP} 소비`);
    if(d.power)out.push('지속: '+Object.entries(d.power).map(([k,v])=>`${powerNames[k]} ${v}`).join(', ')+' · 동일 효과는 큰 값만 적용');
    if(d.retain)out.push('보존');if(d.reserve)out.push('사용 후 다음 손패에 보관');if(d.exhaust&&!d.power)out.push('소진');
    return out.join(' · ');
  }
  function upgradeEffects(e,cost){
    const next=JSON.parse(JSON.stringify(e));
    if(e.choices){next.choices=e.choices.map(o=>({...o,...upgradeEffects(o,cost)}));return next;}
    if(e.power){
      // Supply cannot grow beyond +1 each round. Its upgrade saves upfront energy.
      if(e.power.roundEnergy)return {...next,cost:1};
      next.power=Object.fromEntries(Object.entries(e.power).map(([k,v])=>[k,v+1]));return next;
    }
    const priority=['damage','areaDamage','shield','allShield','weak','allWeak','exposure','allExposure','heal','allHeal','draw','nextShield','nextEnergy','energy','retrieveFamily','reserveDiscard'];
    const key=priority.find(k=>e[k]);
    if(key==='retrieveFamily'){next.draw=1;return next;}
    if(key==='reserveDiscard'){next.draw=(next.draw||0)+1;return next;}
    if(key){next[key]+=e.xScale?.includes(key)?1:['draw','nextEnergy','energy'].includes(key)?1:e.hits?1:2;}
    return next;
  }
  function install(cards){
    for(const [family,ids]of Object.entries(oldFamilies))for(const id of ids){cards[id].family=family;cards[id].category=families[family];[cards[id].role,cards[id].link]=oldPlans[id];}
    for(const c of planned){
      const target=!c.effects.power&&(['assault','disrupt'].includes(c.family)||c.effects.damage)?'enemy':'ally';
      const d={name:c.name,cost:c.cost,family:c.family,category:families[c.family],target,icon:{assault:'✦',ward:'◇',disrupt:'◎',cycle:'▱',repair:'∴'}[c.family],role:c.role,link:c.links,...c.effects};
      const u=upgradeEffects(c.effects,c.cost);
      d.text=describe(d);d.upgrade={...u,text:describe({...d,...u})};
      cards[c.id]=d;
    }
    cards.basic.family='assault';
    for(const [id,d]of Object.entries(cards))if(id!=='basic'){
      d.rarity=Object.entries(rarityIds).find(([,ids])=>ids.includes(id))?.[0]||'common';
      d.linkTags=linkTags(variant(d,id,'draft-1'));
    }
    return cards;
  }
  const api={families,oldFamilies,planned,powerNames,describe,install,rarities,rarityIds,variant,linkTags,draftBridges};
  if(typeof module!=='undefined')module.exports=api;else root.PartyExpeditionCatalog=api;
})(typeof globalThis!=='undefined'?globalThis:this);
