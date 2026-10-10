'use strict';
(()=>{
 const D=window.GameData,K=window.CharacterData,C=window.CharacterCampaign,copy=x=>JSON.parse(JSON.stringify(x));
 const schemaVersion=1;
 // Trial content does not replace a versioned campaign encounter or reward pool.
 const crossfire={id:'crossfire',version:1,status:'trial',name:'교차사격 진지',intent:'전열 차단과 양쪽 후열 사격을 함께 상대한다.',responses:['광역 공격으로 두 사수 함께 압박','집중 공격으로 한 사수부터 제거','도발·보호로 지원가를 유지하며 전열 돌파'],cost:'분산 배치는 근처 보호를 약하게 하고, 단일 추격은 반대편 사수를 남깁니다.',encounter:{profileVersion:1,tacticsVersion:1,name:'교차사격 진지',strategy:'hunt',defensiveEnemy:true,hint:'전열 차단 뒤 양쪽 사수가 지원가를 노립니다. 광역 공격 또는 한쪽 집중 공격으로 사격을 줄이고, 도발·보호로 지원가를 유지하세요.',enemies:[{role:0,name:'진지 방패병',hp:110,damage:6,period:1.6,x:655,y:175,cards:['guard','bash']},{role:2,name:'북쪽 사수',hp:75,damage:10,period:1.4,x:800,y:60,cards:['shot','pierce'],focus:'support',focusUntil:10},{role:2,name:'남쪽 사수',hp:75,damage:10,period:1.4,x:800,y:310,cards:['shot','pierce'],focus:'support',focusUntil:10}]}};
 const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
 const pressure=copy(crossfire);pressure.id='crossfire_pressure';pressure.name='교차사격 돌파 시험';pressure.intent='후열 치유 지원을 끊으면서 양쪽 사격을 버텨야 합니다.';pressure.responses=['광역·연계로 지원망 함께 압박','추격·집중 공격으로 약한 표적부터 제거','근처 보호 배치·도발로 지원가 유지'];pressure.cost='보호 범위와 후열 공격 접근 거리를 함께 고려하세요. 한쪽을 먼저 줄이면 반대편 사격이 남습니다.';pressure.encounter.name=pressure.name;pressure.encounter.hint='전열 차단과 후열 치유가 양쪽 사격을 유지합니다. 광역·연계 또는 약한 적 집중 공격으로 지원망을 줄이고, 도발·가까운 보호 배치로 아군 지원가를 유지하세요.';pressure.encounter.enemies.slice(1).forEach(e=>{e.damage=14;e.period=1.3;});pressure.encounter.enemies.push({role:3,name:'진지 의무관',hp:60,damage:3,period:2.5,x:870,y:175,cards:['heal','wave']});
 const duel={id:'focused_rush',version:1,status:'trial',name:'집중 추격 비교 시험',intent:'한 명의 빠른 돌격수를 먼저 제압하고 아군 지원가를 유지합니다.',responses:['빠른 단일 추격으로 일찍 제압','도발·근처 보호·회복으로 지원가 유지'],cost:'광역 피해는 한 적에게만 들어갑니다. 보호만 이어가면 추격 피해가 누적됩니다.',encounter:{profileVersion:1,tacticsVersion:1,name:'집중 추격 비교 시험',strategy:'duel',hint:'개전 30초 동안 한 돌격수가 지원가를 노립니다. 빠른 단일 공격 또는 도발·근처 보호·회복으로 대응하세요. 광역 공격은 한 명에게만 적중합니다.',enemies:[{role:1,name:'집요한 돌격수',hp:260,damage:18,period:.9,x:710,y:180,cards:['heavy','execute','dash'],focus:'support',focusUntil:30}]}};
 const barrier=copy(duel);barrier.id='blocking_front';barrier.name='차단 전열 비교 시험';barrier.intent='전열 차단과 빠른 공격을 상대하며 아군 체력 소모를 비교합니다.';barrier.responses=['빠른 단일 공격으로 차단 이후 계속 압박','보호·받아치기·회복으로 피해 소모 줄이기'];barrier.cost='차단된 연속 공격은 후속 타격도 중단됩니다. 종료 시간과 남은 체력을 함께 비교하세요.';barrier.encounter.name=barrier.name;barrier.encounter.hint='한 방패병이 차단하고 아군 지원가를 추격합니다. 빠른 단일 공격 또는 보호·받아치기·회복으로 대응하세요. 광역 공격은 한 명에게만 들어가며 차단은 연속 기술을 중단합니다.';barrier.encounter.defensiveEnemy=true;barrier.encounter.enemies=[{role:0,name:'차단 방패병',hp:260,damage:14,period:.9,x:710,y:180,cards:['guard','bash'],focus:'support',focusUntil:30}];
 const packs=freeze([copy(crossfire),pressure,duel,barrier]);
 function record(pack,{preset='pursuit',character='ranger',support='medic',policy='attack',seed=81001,level=3,formation=[1,2,4,11],diagnostics=false}={}){
  const p=K.startingDecks.find(p=>p.id===preset);if(!p||!['ranger','ria'].includes(character)||!['attack','protect'].includes(policy)||!Number.isInteger(level)||level<1||level>5)throw Error('체험 시작 조건을 확인하세요.');
  if(!['medic','noa'].includes(support)||support==='noa'&&window.SupportContent?.version!==1)throw Error('지원가 선택을 확인하세요.');const party=window.TrialCharacter.party(character);if(support==='noa')party[3].characterId='noa';let t=window.TrialCharacter.template(p.template,character);if(support==='noa')t=window.SupportContent.template(t,support);const base=K.templatePool(t),pool=base.ids.map(id=>copy(base.pool.find(c=>c.id===id)));
  const config={autoSupportVersion:1,...(support==='noa'?{contentRulesVersion:1}:{}),...(diagnostics?{ultimateDiagnosticsVersion:1}:{}),autoUltimateVersion:1,ultimateRulesVersion:1,signatureMode:'standard',identityVersion:1,party,combatRulesVersion:1,spatialRulesVersion:1,formationVersion:2,targetingRulesVersion:1,formation:copy(formation),seed,levels:[level,level,level,level],hp:party.map(p=>D.maxHP(K.character(p.characterId).role,level)),stances:[0,1,0,0],depth:2,elite:false,encounter:copy(pack.encounter),timing:'mixed',control:'auto',autoPolicy:policy,autoTraitVersion:1,traits:true,tactic:null};
  return {version:1,engineVersion:1,config,pool,deck:pool.map(c=>c.id)};
 }
 function validatePack(pack){
  const errors=[];if(!pack||typeof pack!=='object'||Array.isArray(pack))return ['콘텐츠 정의가 객체여야 합니다.'];
  const fields=['id','version','status','name','intent','responses','cost','encounter'];for(const k of Object.keys(pack))if(!fields.includes(k))errors.push('알 수 없는 필드: '+k);
  if(!/^[a-z][a-z0-9_-]{1,39}$/.test(pack.id||''))errors.push('안정적인 콘텐츠 ID가 필요합니다.');if(pack.version!==1)errors.push('지원하는 콘텐츠 버전은 1입니다.');if(pack.status!=='trial')errors.push('검증 전 콘텐츠는 trial이어야 합니다.');
  for(const k of ['name','intent','cost'])if(typeof pack[k]!=='string'||!pack[k].trim()||pack[k].length>240)errors.push(k+' 설명이 필요합니다.');
  if(!Array.isArray(pack.responses)||pack.responses.length<2||pack.responses.length>4||pack.responses.some(s=>typeof s!=='string'||!s.trim()||s.length>160)||new Set(pack.responses).size!==pack.responses.length)errors.push('서로 다른 대응 방법을 2~4개 기록하세요.');
  if(pack.name!==pack.encounter?.name)errors.push('콘텐츠와 전투 이름이 다릅니다.');
  try{if(!C.validBattleRecord(record(pack)))errors.push('적·효과·좌표·전투 시작 조건이 저장 규칙과 맞지 않습니다.');}catch(e){errors.push('전투 정의를 만들 수 없습니다: '+e.message);}
  return errors;
 }
 function audit(){
  const errors=[],characters=K.playableCharacters();
  for(const [key,d]of Object.entries({...D.cards,...D.hostile})){
   if(!Array.isArray(d.traits)||!d.traits.length||new Set(d.traits).size!==d.traits.length||d.traits.some(t=>!window.CardTraits.traits[t]))errors.push(key+': 유효한 특성이 필요합니다.');
   if(d.source==='ultimate'){if(d.limit!==0||K.owner(key))errors.push(key+': 궁극기가 획득 카드에 포함됐습니다.');continue;}
   const owner=K.owner(key);if(!owner)continue;const source=owner.base.includes(key)?'base':owner.reward.includes(key)?'reward':null;
   if(!source||!Number.isInteger(d.limit)||d.limit<1||d.limit>4)errors.push(key+': 소유자·획득 경로·사본 상한을 확인하세요.');
   const pool=K.basicPool();if(source==='base'&&pool.filter(c=>c.key===key).length!==d.limit)errors.push(key+': 기초 키트 사본 수 불일치');
   const presentation=window.SkillPresentation?.profile(key);if(presentation&&(!window.SkillPresentation.tiers[presentation.tier]||presentation.title!==d.name))errors.push(key+': 연출 식별 불일치');
  }
  for(const c of characters){if(!c.base.length||new Set([...c.base,...c.reward]).size!==c.base.length+c.reward.length||!Array.isArray(c.stances)||c.stances.length!==2)errors.push(c.id+': 기초 키트·획득 경로·태세를 확인하세요.');for(const key of [...c.base,...c.reward])if(!K.canCast({key},c))errors.push(c.id+': 자신의 카드 사용 불가 '+key);}
  for(const p of packs)errors.push(...validatePack(p).map(e=>p.id+': '+e));
  return {schemaVersion,characters:characters.length,cards:Object.keys(D.cards).filter(k=>K.owner(k)).length,trialPacks:packs.length,errors};
 }
 function baseline(id,character='ranger',options={}){
  const pack=packs.find(p=>p.id===id);if(!pack||validatePack(pack).length)throw Error('사용할 수 없는 확장 전투입니다.');const start=record(pack,{...options,character,diagnostics:true}),b=new window.CharacterBattle({...copy(start.config),cards:copy(start.pool)});
  for(let i=0;i<10000&&!b.s.ended;i++)b.step(.02);if(!b.s.ended)throw Error('기준 전투가 종료되지 않았습니다.');return C.summarizeBattle(b,start);
 }
 if(window.SupportContent?.version===1)window.SupportContent.encounter=copy(pressure.encounter);
 window.ContentCatalog={schemaVersion,packs,record,validatePack,audit,baseline};
})();
