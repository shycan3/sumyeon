'use strict';
(()=>{
  const D=window.GameData;
  Object.assign(D.cards,{
    serin_dash:{name:'빛을 좇는 걸음',role:1,kind:'attack',power:27,time:3,prep:.2,dash:true,limit:3,hold:2,desc:'적에게 돌진해 베고, 2초간 그 적을 우선 추격',source:'base'},
    serin_cut:{name:'간격 베기',role:1,kind:'attack',power:30,time:4,prep:.15,limit:3,desc:'적을 벤 뒤 짧게 거리를 벌림',source:'base'},
    serin_parry:{name:'받아치기',role:1,kind:'ward',power:20,time:4,prep:0,duration:4,limit:3,self:true,desc:'자신에게 보호막 · 4초 안에 공격받으면 반격 1회',source:'base'},
    serin_dance:{name:'잔광 검무',role:1,kind:'attack',power:21,time:6,prep:.35,dash:true,limit:1,desc:'적에게 접근해 검무 3타 · 마지막 타격을 크게 강조',source:'base'},
    serin_chain:{name:'이어지는 섬광',role:1,kind:'execute',power:42,time:5,prep:.2,dash:true,limit:3,hold:3,desc:'HP 절반 이하 적에게 피해 2배 · 처치하면 다른 적에게 추가 돌진 1회',source:'reward'},
    serin_cover:{name:'너의 곁으로',role:1,kind:'ward',power:28,time:5,prep:.2,duration:5,limit:3,desc:'동료 곁으로 이동해 보호막 · 5초간 보호막을 뚫은 피해 25%를 대신 받고 반격 1회',source:'reward'}
  });
  Object.assign(D.cards,{boss_rescue:{name:'위험 구역 구출',role:1,kind:'heal',power:0,time:4,prep:0,limit:1,source:'reward',movement:'rescue',upgradeTimeReduction:1,desc:'위험 구역의 동료와 세린을 안전 지점으로 이동 · 이동 대상의 다른 기술 중단 · 진화 시 다음 명령 1초 단축'},boss_retreat:{name:'긴급 재배치',role:0,kind:'guard',duration:0,time:7,prep:0,limit:1,source:'reward',movement:'party',upgradeTimeReduction:1,desc:'위험 구역의 아군을 안전 지점으로 재배치 · 이동 대상의 다른 기술 중단 · 피해 차단 없음 · 진화 시 다음 명령 1초 단축'}});
  Object.assign(D.cards,{
    medic_circle:{name:'모여드는 온기',role:3,kind:'healAll',spatial:'circleHeal',radius:130,power:36,time:7,prep:.3,limit:2,source:'reward',desc:'시전 완료 시 지원가 주변 반경 130 안의 살아 있는 아군을 36 회복 · 멀리 떨어진 아군은 제외'},
    ranger_line:{name:'빛의 사선',role:2,kind:'area',spatial:'line',radius:1,length:460,width:60,power:33,time:6,prep:.45,limit:2,source:'reward',desc:'선택한 적 방향으로 길이 460·폭 60의 직선 공격 · 시전 시작 방향 고정 · 범위 안 적마다 피해 33'}
  });
  D.hostile.lantern_burst={name:'집속 등불탄',role:2,kind:'area',radius:105,power:38,time:8,prep:1.6,localBurst:true};
  D.hostile.line_zone={name:'균열 찌르기',role:1,kind:'area',power:42,radius:155,time:11,prep:2.2};
  D.hostile.boss_zone={name:'낙하 강타',role:1,kind:'area',power:55,radius:155,time:10,prep:1.6};
  for(const [key,d]of Object.entries({...D.cards,...D.hostile}))d.purposeMode=d.dash||d.approach?'replace':'compatible';
  const characters=[
    {id:'guardian',role:0,name:'호위병',tag:'임시 동료 · 보호',base:['guard','bash','taunt'],reward:['boss_retreat'],stances:D.roles[0].stances},
    {id:'serin',role:1,actorPolicy:'serin',actorPreference:{type:'woundedAllyThreat',stance:0,below:.7,scale:230},name:'세린',tag:'추격과 엄호의 검객',base:['serin_dash','serin_cut','serin_parry','serin_dance'],reward:['serin_chain','serin_cover','boss_rescue'],stances:['호위','추격'],line:'놓치지 않을게. 적도, 네 손도.',desc:'은빛 머리와 붉은 스카프의 검객. 추격할 때는 집요하게, 동료를 지킬 때는 망설임 없이 움직입니다.'},
    {id:'ranger',role:2,name:'지원 사수',tag:'임시 동료 · 원거리',base:['shot','volley'],reward:['ranger_line'],stances:D.roles[2].stances},
    {id:'medic',role:3,name:'야전 의무관',tag:'임시 동료 · 회복',base:['heal','wave'],reward:['medic_circle'],stances:D.roles[3].stances}
  ];
  // Character identity, role, party slot and card origin are separate concepts.
  const catalog=new Map(characters.map(c=>[c.id,c]));
  const defaultParty=()=>characters.map((c,slot)=>({slot,characterId:c.id}));
  const character=id=>catalog.get(id)||null;
  const playableCharacters=()=>[...catalog.values()].filter(c=>characters.includes(c)||c.playable===true);
  const validParty=party=>Array.isArray(party)&&party.length===4&&party.every((p,i)=>p&&p.slot===i&&character(p.characterId))&&new Set(party.map(p=>p.characterId)).size===4;
  const skillTypes=new Set(['plain','chaseStrike','retreatStrike','counterWard','comboStrike','executeChain','coverWard']);
  const skills={
    serin_dash:{type:'chaseStrike',target:'enemy',reason:'접근 후 집중 추격'},
    serin_cut:{type:'retreatStrike',target:'enemy',retreat:24,reason:'공격 후 간격 확보'},
    serin_parry:{type:'counterWard',target:'self',counterPower:25,reason:'위협을 받아치기'},
    serin_dance:{type:'comboStrike',target:'enemy',offsets:[.16,.32],recovery:.5,reason:'대표 검무 3타'},
    serin_chain:{type:'executeChain',target:'enemy',followPower:22,followDelay:.18,followHold:3,reason:'마무리와 추가 추격'},
    serin_cover:{type:'coverWard',target:'otherAlly',counterPower:22,reason:'위협받는 동료 엄호'}
  };
  const skill=key=>skills[key]||{type:'plain',target:'default'};
  function registerSkill(key,profile){if(!D.cards[key]||!profile||!skillTypes.has(profile.type)||!['default','enemy','self','otherAlly'].includes(profile.target))throw Error('공유 기술 정의가 올바르지 않습니다.');const number=n=>Number.isFinite(n)&&n>=0;if(profile.type==='comboStrike'&&(!Array.isArray(profile.offsets)||!profile.offsets.length||profile.offsets.length>5||profile.offsets.some((n,i)=>!number(n)||n>2||i&&n<=profile.offsets[i-1])||!number(profile.recovery)))throw Error('연속 타격 정의가 올바르지 않습니다.');for(const k of ['counterPower','followPower','followDelay','followHold','retreat'])if(profile[k]!==undefined&&!number(profile[k]))throw Error('공유 기술 수치가 올바르지 않습니다.');const required={chaseStrike:[],retreatStrike:['retreat'],counterWard:['counterPower'],comboStrike:[],executeChain:['followPower','followDelay','followHold'],coverWard:['counterPower']}[profile.type]||[];if(required.some(k=>!number(profile[k])))throw Error('공유 기술의 필수 수치가 누락됐습니다.');const kind={chaseStrike:'attack',retreatStrike:'attack',counterWard:'ward',comboStrike:'attack',executeChain:'execute',coverWard:'ward'}[profile.type];if(kind&&D.cards[key].kind!==kind)throw Error('공유 기술과 카드 효과 유형이 다릅니다.');const target={plain:'default',chaseStrike:'enemy',retreatStrike:'enemy',counterWard:'self',comboStrike:'enemy',executeChain:'enemy',coverWard:'otherAlly'}[profile.type];if(profile.target!==target||profile.type==='comboStrike'&&profile.recovery<profile.offsets.at(-1))throw Error('공유 기술 대상 또는 회복 시간이 올바르지 않습니다.');D.cards[key].purposeMode=['retreatStrike','coverWard'].includes(profile.type)||D.cards[key].dash||D.cards[key].approach?'replace':'compatible';skills[key]=Object.freeze({...profile,...(profile.offsets?{offsets:Object.freeze([...profile.offsets])}:{})});}
  for(const [key,profile]of Object.entries(skills))registerSkill(key,profile);
  function registerCharacter(profile){if(!profile||typeof profile.id!=='string'||!profile.id||catalog.has(profile.id)||!Number.isInteger(profile.role)||!D.roles[profile.role]||typeof profile.name!=='string'||!Array.isArray(profile.base)||!Array.isArray(profile.reward)||[...profile.base,...profile.reward].some(k=>!D.cards[k]||D.cards[k].role!==profile.role))throw Error('캐릭터 정의가 올바르지 않습니다.');if(profile.actorPreference&&(profile.actorPreference.type!=='woundedAllyThreat'||![0,1].includes(profile.actorPreference.stance)||!Number.isFinite(profile.actorPreference.below)||profile.actorPreference.below<=0||profile.actorPreference.below>1||!Number.isFinite(profile.actorPreference.scale)||profile.actorPreference.scale<=0))throw Error('캐릭터 AI 선호가 올바르지 않습니다.');if(profile.basicProfile&&(!['range','speed','damage','period'].every(k=>Number.isFinite(profile.basicProfile[k])&&profile.basicProfile[k]>0)||profile.basicProfile.range>500||profile.basicProfile.speed>150||profile.basicProfile.damage>20||profile.basicProfile.period>10))throw Error('기본 행동 수치가 올바르지 않습니다.');if(profile.passive&&(!profile.basicProfile||profile.passive.type!=='repeatHit'||!Number.isInteger(profile.passive.hits)||profile.passive.hits<2||profile.passive.hits>10||!Number.isFinite(profile.passive.power)||profile.passive.power<=0||profile.passive.power>30))throw Error('패시브 정의가 올바르지 않습니다.');const value=Object.freeze({...profile,...(profile.basicProfile?{basicProfile:Object.freeze({...profile.basicProfile})}:{}),...(profile.passive?{passive:Object.freeze({...profile.passive})}:{}),...(profile.actorPreference?{actorPreference:Object.freeze({...profile.actorPreference})}:{}),base:Object.freeze([...profile.base]),reward:Object.freeze([...profile.reward])});catalog.set(value.id,value);return value;}
  const casterRules=new Map(['serin_dash','serin_cut','serin_parry','serin_dance','serin_chain','serin_cover'].map(k=>[k,{characterId:'serin'}]));
  function setCasterRule(key,rule){if(!D.cards[key]||!rule||rule.characterId!==undefined&&!character(rule.characterId))throw Error('카드 시전자 규칙이 올바르지 않습니다.');casterRules.set(key,Object.freeze({...rule}));}
  function canCast(card,profile){const origin=owner(card.key),d=D.cards[card.key];return !!(profile&&d&&d.source!=='ultimate'&&profile.role===d.role&&(!casterRules.get(card.key)?.characterId||profile.id===casterRules.get(card.key).characterId));}
  function bindCard(card,party=defaultParty()){
    if(!validParty(party))throw Error('전투 파티가 올바르지 않습니다.');let slot=card.casterSlot;
    if(slot===undefined){const origin=party.find(p=>p.characterId===card.characterId||p.characterId===owner(card.key)?.id);if(origin&&canCast(card,character(origin.characterId)))slot=origin.slot;else {const compatible=party.filter(p=>canCast(card,character(p.characterId)));if(compatible.length!==1)throw Error('공유 카드의 시전 슬롯을 지정하세요.');slot=compatible[0].slot;}}
    if(!Number.isInteger(slot)||slot<0||slot>=4||!canCast(card,character(party[slot].characterId)))throw Error('카드와 시전자가 호환되지 않습니다.');return {...card,casterSlot:slot};
  }
  const starter={guard:2,bash:1,taunt:2,serin_dash:2,serin_cut:1,serin_parry:1,serin_dance:1,shot:3,volley:2,heal:3,wave:2};
  const startingDecks=[
    {id:'escort',name:'호위 출발',desc:'방패와 받아치기로 버티며 반격합니다.',weakness:'공격 카드 종류가 적어 다수의 적을 빠르게 정리하기 어렵습니다.',template:{guard:3,taunt:3,serin_parry:3,serin_dash:3,shot:3,heal:3,wave:2}},
    {id:'pursuit',name:'추격 출발',desc:'세린과 사수가 같은 적을 이어서 공격합니다.',weakness:'광역 공격과 받아치기가 없어 다수의 적과 지속 피해에 주의해야 합니다.',template:{serin_dash:3,serin_cut:3,shot:3,guard:3,taunt:2,heal:3,wave:3}},
    {id:'resonance',name:'공명 출발',desc:'여러 캐릭터가 기술을 번갈아 사용해 공격과 회복을 강화합니다.',weakness:'도발이 없고 느린 광역 기술이 많아 단일 적의 집중 공격에 취약합니다.',template:{bash:3,serin_dance:1,volley:3,heal:3,wave:1,guard:3,serin_parry:1,shot:3,serin_cut:2}}
  ];
  function startingConcept(template){const keys=Object.keys(template).filter(k=>template[k]>0).sort();return startingDecks.find(p=>JSON.stringify(keys)===JSON.stringify(Object.keys(p.template).sort())&&keys.every(k=>template[k]===p.template[k]))?.id||'custom';}
  function owner(key){return [...catalog.values()].find(c=>[...c.base,...c.reward].includes(key));}
  function basicPool(party=null){return playableCharacters().flatMap(c=>c.base.flatMap(key=>Array.from({length:D.cards[key].limit},(_,i)=>({id:`base:${c.id}:${key}:${i}`,key,characterId:c.id,source:'base',upgraded:false})))).filter(c=>!party||party.some(p=>canCast(c,character(p.characterId))));}
  function templatePool(template){const pool=basicPool(),ids=[];for(const [key,count]of Object.entries(template))ids.push(...pool.filter(c=>c.key===key).slice(0,count).map(c=>c.id));return {pool,ids};}
  function validateTemplate(template){if(!template||typeof template!=='object'||Array.isArray(template))return '기초 덱이 올바르지 않습니다.';for(const [key,n]of Object.entries(template))if(!owner(key)?.base.includes(key)||!Number.isInteger(n)||n<0||n>D.cards[key].limit)return '기초 카드와 장수 제한을 확인하세요.';const {pool,ids}=templatePool(template);return D.validateDeck(ids,pool);}
  const route=[
    [{type:'battle',encounter:0}],
    [{type:'heal'},{type:'upgrade'}],
    [{type:'battle',encounter:3}],
    [{type:'camp'}],
    [{type:'elite',encounter:1},{type:'heal'}],
    [{type:'boss',encounter:5}]
  ];
  D.rooms.camp={name:'정비',icon:'⚑',color:'#79c9d2',desc:'이번 원정 카드 또는 생존자 HP 15% 회복'};
  const expeditionBattles={
    0:{profileVersion:1,name:'길목의 추격대',strategy:'hunt',hint:'검사와 사수가 부상자를 집중 추격합니다. 도발로 단일 공격을 돌리거나 보호 태세·집중 회복으로 버티고, 한 적을 먼저 처치해 압박을 줄이세요.',enemies:[{role:1,name:'추격 검사',hp:125,damage:5.5,x:700,y:115,cards:['dash','execute','heavy']},{role:2,name:'추격 사수',hp:110,damage:5,x:805,y:235,cards:['shot','pierce']}]},
    3:{profileVersion:1,name:'다섯 칼날의 포위',strategy:'swarm',hint:'체력이 낮은 근접 적 다섯이 몰려오며 범위 공격을 사용합니다. 화살비로 여러 적을 함께 줄이고, 흩어진 피해에는 전체 회복을 활용하세요. 도발은 범위 공격을 돌리지 못합니다.',enemies:Array.from({length:5},(_,i)=>({role:1,name:'포위병 '+(i+1),hp:62,damage:3.4,x:690+(i%2)*85,y:55+i*65,cards:['dash','cleave']}))}
  };
  const expeditionElite={name:'균열 창기사',strategy:'front',hint:'세로로 긴 직선 구역을 고정한 뒤 찌릅니다. 구출·재배치 또는 차단·보호·회복으로 대응하고 공격 후 빈틈을 노리세요. 기본 AI는 구역을 감지해 회피하지 않습니다.',mechanic:{actor:'e0',attackKey:'line_zone',radius:155,power:42,windup:2.2,interval:11,start:7,recovery:3,maxRecovery:5,vulnerability:.3,shape:'line',length:500,width:100,angle:Math.PI/2},enemies:[{role:1,name:'균열 창기사',hp:260}]};
  const expeditionBoss={name:'낙하 수호자의 문',strategy:'front',hint:'원형 낙하 구역을 고정해 공격합니다. 이동 카드가 없어도 차단·보호·회복으로 대응할 수 있습니다. 공격 후 빈틈에는 받는 피해가 증가합니다.',mechanic:{actor:'e0',radius:155,power:55,windup:1.6,interval:10,start:8,recovery:3,maxRecovery:5,vulnerability:.4,shape:'circle'},enemies:[{role:1,name:'낙하의 수호자',hp:400,boss:true}]};
  const advancedBattles={...expeditionBattles,
    6:{defensiveEnemy:true,profileVersion:1,name:'등불의 방벽',strategy:'sustain',hint:'전열 방패병이 차단하고 후열 의무관이 회복합니다. 돌진·집중 공격으로 회복자를 먼저 줄이거나, 광역 공격으로 두 전선을 함께 압박하세요. 회복을 상쇄할 화력이 필요합니다.',enemies:[{role:0,name:'방벽 호위병',hp:150,damage:3.8,x:650,y:175,cards:['guard','bash','taunt']},{role:3,name:'등불 치유사',hp:85,damage:3,x:825,y:90,cards:['heal','wave']},{role:2,name:'등불 사수',hp:85,damage:4.3,x:820,y:280,cards:['shot','volley']}]},
    7:{defensiveEnemy:true,profileVersion:1,name:'강철의 돌격',strategy:'duel',hint:'방패병의 차단 뒤 돌격수가 긴 강공격을 준비합니다. 차단·보호·도발로 받아내거나, 빠른 집중 공격과 밀치기로 시전자를 일찍 처치하세요. 하나의 이동 카드가 필수인 전투는 아닙니다.',enemies:[{role:0,name:'강철 방패병',hp:125,damage:3.8,x:670,y:260,cards:['guard','bash']},{role:1,name:'강철 돌격수',hp:165,damage:5.3,x:740,y:130,cards:['heavy','execute','dash']}]}
  };
  const tacticalBattles={...advancedBattles,
    6:{...advancedBattles[6],tacticsVersion:1,hint:'전열 차단·후열 회복과 함께 사수가 밀집한 위치에 반경 105 등불탄을 쏩니다. 1.6초 예고 뒤 고정 위치를 타격합니다. 간격을 벌려 동시 피해를 줄이거나 차단·전체 회복으로 받아내고, 돌진·집중 공격으로 치유사를 압박하세요.',threat:'밀집 위치에 고정 폭발 · 반경 105 / 1.6초 예고',responses:['간격 조절 + 집중 공격','차단·회복 + 광역 압박'],tradeoff:'흩어지면 보호·주변 회복 연결이 약해질 수 있습니다.',enemies:advancedBattles[6].enemies.map((e,i)=>i===2?{...e,cards:['shot','lantern_burst']}:e)},
    7:{...advancedBattles[7],tacticsVersion:1,hint:'개전 12초 동안 돌격수의 기본 공격은 지원가를 우선 추격합니다. 단일 카드도 지원가를 노리지만 도발로 돌릴 수 있습니다. 지원가 곁 보호·엄호와 회복으로 버티거나, 돌격수를 집중 공격·밀치기로 먼저 줄이세요.',threat:'개전 지원가 추격 · 기본 행동 12초 / 단일 카드는 지속 압박',responses:['지원가 근처 보호·도발·회복','돌격수 집중 공격·밀치기'],tradeoff:'지원가를 뒤로 빼면 접근은 늦출 수 있지만 보호 연결이 멀어집니다.',enemies:advancedBattles[7].enemies.map((e,i)=>i===1?{...e,focus:'support',focusUntil:12}:e)}
  };
  const phasedBoss={...expeditionBoss,strategy:'boss',hint:'HP 50%까지 원형 낙하, 이후 부상자 중심 직선 찌르기로 전환합니다. 전환 전에 예고한 원형 공격은 끝까지 유지합니다. 차단·보호·회복 또는 이동 카드로 버티고 공격 후 빈틈에 집중하세요.',phase2:{actor:'e0',attackKey:'line_zone',radius:155,power:45,windup:2.2,interval:11,start:8,recovery:3,maxRecovery:5,vulnerability:.4,shape:'line',length:500,width:100,angle:Math.PI/2}};
  const assignments={lantern_burst:'resonance',medic_circle:'resonance',ranger_line:'resonance',serin_dash:'pursuit',serin_cut:'pursuit',serin_parry:'escort',serin_dance:'resonance',serin_chain:'pursuit',serin_cover:'escort',boss_rescue:'escort',boss_retreat:'resonance',line_zone:'pursuit',boss_zone:'resonance'};
  for(const [key,trait]of Object.entries(assignments))(D.cards[key]||D.hostile[key]).traits=[trait];
  const traits={
    escort:{name:'호위',color:'#9dded1',steps:[3,5],effects:['호위 카드로 보호한 아군이 보호막 흡수·피해 분담·피격을 받거나 차단에 성공하면 반격 준비. 8초 안의 다음 공격 카드 피해 +10%.','같은 조건의 반격 강화가 +20%로 증가.'],desc:'지켜낸 뒤 다음 공격 카드로 반격'},
    pursuit:{name:'추격',color:'#ecc18a',steps:[3,4],effects:['추격 공격 카드가 실제 피해를 주면 적에게 8초간 표식. 다른 캐릭터의 다음 단일 공격 카드가 그 적을 우선하며 피해 +10%.','후속 공격 피해 +20%.'],desc:'한 캐릭터가 길을 열고 다른 캐릭터가 집중 공격'},
    resonance:{name:'공명',color:'#bcb1ee',steps:[5,6],effects:['서로 다른 캐릭터가 공명 카드를 성공적으로 사용하면 공명 축적. 4회 축적 후 다음 공명 공격·회복 카드 효과 +15%.','필요 축적 3회, 강화 효과 +25%.'],desc:'여러 캐릭터의 기술을 이어 대표 기술 강화'}
  };
  function traitSummary(cards){const keys=[...new Set(cards.map(c=>typeof c==='string'?c:c.key))].sort();return Object.entries(traits).map(([id,d])=>{const members=keys.filter(k=>D.cards[k]?.traits.includes(id)),count=members.length,level=d.steps.filter(n=>count>=n).length;return {id,...d,members,count,level,next:d.steps[level]||null};});}
  function traitKeys(state){return [...new Set(['draw','hand','discard','excluded'].flatMap(k=>state.decks[0][k].map(c=>c.key)))].sort();}
  // Acquisition uses a separate seeded stream. It never consumes combat randomness.
  const rewardKeys=characters.flatMap(c=>[...c.base,...c.reward]);
  function rewardOptions(run){const available=run.party?.some(p=>!characters.some(c=>c.id===p.characterId))?playableCharacters().flatMap(c=>[...c.base,...c.reward]):rewardKeys;return [...new Set(available)].filter(k=>(!D.cards[k].buildVersion||run.buildRulesVersion===D.cards[k].buildVersion)&&(!run.party||run.party.some(p=>canCast({key:k},character(p.characterId))))&&(!D.cards[k].spatial||run.spatialRulesVersion===1)&&run.pool.filter(c=>c.key===k).length<D.cards[k].limit);}
  function responseKeys(run){
    const next=run.map.slice(run.depth+1).find(layer=>layer.some(n=>['battle','elite','boss'].includes(n.type)))||[];
    const keys=new Set();for(const n of next){const e=n.type==='boss'?expeditionBoss:n.type==='elite'?expeditionElite:(run.encounterVersion===3?advancedBattles:expeditionBattles)[n.encounter];if(n.type==='boss'&&run.bossRulesVersion===1&&run.bossId==='network'){for(const k of ['serin_chain','serin_dash','volley','ranger_line','ria_burst','ria_focus','guard','noa_guard'])keys.add(k);}else if(n.type==='boss'||n.type==='elite')for(const k of ['guard','boss_rescue','boss_retreat','heal','wave'])keys.add(k);else if(e?.strategy==='swarm')for(const k of ['volley','wave','guard','serin_cover'])keys.add(k);else if(e?.strategy==='sustain')for(const k of ['serin_dash','serin_chain','volley','serin_dance'])keys.add(k);else for(const k of ['taunt','serin_parry','heal','serin_cover','serin_chain','guard'])keys.add(k);}return keys;
  }
  function rewardOffers(run){
    const available=rewardOptions(run),random=new D.Random((run.seed^run.current.seed^0x72f39a15^run.depth)>>>0),chosen=[],reasons={},deck=run.deck.map(id=>run.pool.find(c=>c.id===id)),summary=traitSummary(deck),response=responseKeys(run);
    function pick(items,reason,weight){items=items.filter(k=>!chosen.includes(k));if(!items.length)return;const values=items.map(k=>weight?weight(k):1),total=values.reduce((a,b)=>a+b,0);let n=random.next()*total,index=items.length-1;for(let i=0;i<items.length;i++){n-=values[i];if(n<0){index=i;break;}}const key=items[index];chosen.push(key);reasons[key]=reason;}
    const basics=available.filter(k=>owner(k).base.includes(k)),special=available.filter(k=>owner(k).reward.includes(k));
    const growth=k=>{const t=summary.find(t=>D.cards[k].traits.includes(t.id));return (run.pool.some(c=>c.key===k)?1:4)*(t?.level?2:1);};
    pick(special,'원정 전용 기술');
    if(run.current.type==='elite')pick(special,'강적 보상 · 다른 전용 기술');
    else pick(basics,run.current.type==='camp'?'정비 · 기초 키트 보완':'기초 키트 보완',growth);
    if(run.current.type==='camp')pick(basics,'정비 · 다른 기초 기술',k=>growth(k)*(summary.find(t=>D.cards[k].traits.includes(t.id))?.level?1:2));
    pick(available.filter(k=>response.has(k)),'다음 전투 대응 후보',k=>run.pool.some(c=>c.key===k)?1:3);
    const count=run.current.type==='camp'?4:3;while(chosen.length<Math.min(count,available.length))pick(available,'다른 운영 선택',growth);
    return {candidates:chosen,reasons,kind:run.current.type==='camp'?'camp':run.current.type==='elite'?'elite':'battle'};
  }
  function rewardHint(key,run){const cards=run.deck.map(id=>run.pool.find(c=>c.id===id)),t=traitSummary(cards).find(t=>D.cards[key].traits.includes(t.id)),known=cards.some(c=>c.key===key);return known?'이미 편성한 종류 · 사본 추가는 특성 종류 수를 늘리지 않습니다.':`${t.name} 새 종류 · ${t.count} → ${t.count+1}종 (교체 전). 실제 교체 결과는 빠지는 카드에 따라 달라집니다.`;}
  for(const [key,d]of Object.entries({...D.cards,...D.hostile}))if(!Array.isArray(d.traits)||!d.traits.length||d.traits.some(t=>!traits[t]))throw Error('카드 특성이 올바르지 않습니다: '+key);
  window.Formation={
    enemyPoint:(encounter,i)=>{const e=encounter.enemies[i];return {x:encounter.profileVersion===1&&e.x!==undefined?e.x:765+(i%2)*85,y:encounter.profileVersion===1&&e.y!==undefined?e.y:90+i*100};},
    recommended:[0,1,2,5],
    valid:(x,version=1)=>[1,2].includes(version)&&Array.isArray(x)&&x.length===4&&x.every(n=>Number.isInteger(n)&&n>=0&&n<(version===2?12:6))&&new Set(x).size===4,
    recommendedFor:version=>version===2?[1,2,4,11]:[0,1,2,5],
    point:(slot,version=1)=>version===2?({x:[330,225,120][Math.floor(slot/4)],y:60+(slot%4)*80+(Math.floor(slot/4)===1?35:0)}):({x:[330,225,120][Math.floor(slot/2)],y:slot%2?255:135}),
    label:(slot,version=1)=>['전열','중열','후열'][Math.floor(slot/(version===2?4:2))]+' · '+(version===2?(slot%4+1)+'번 열':slot%2?'아래':'위'),
    convert:(list,from,to)=>{if(!window.Formation.valid(list,from))return null;const used=new Set();return list.map(slot=>{const p=window.Formation.point(slot,from),slots=Array.from({length:to===2?12:6},(_,i)=>i).filter(i=>!used.has(i)).sort((a,b)=>{const x=window.Formation.point(a,to),y=window.Formation.point(b,to);return Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y)||a-b;});used.add(slots[0]);return slots[0];});},
    move:(list,role,slot,version=1)=>{if(!window.Formation.valid(list,version)||!Number.isInteger(role)||role<0||role>3||!Number.isInteger(slot)||slot<0||slot>=(version===2?12:6))return null;const next=[...list],other=next.indexOf(slot);if(other>=0)next[other]=next[role];next[role]=slot;return next;}
  };
  window.CardTraits={traits,summary:traitSummary,keys:traitKeys};
  window.CharacterData={playableCharacters,defaultParty,character,validParty,skill,registerSkill,registerCharacter,setCasterRule,canCast,bindCard,tacticalBattles,advancedBattles,phasedBoss,expeditionBattles,expeditionElite,expeditionBoss,characters,starter,startingDecks,startingConcept,owner,basicPool,templatePool,validateTemplate,route,rewardOptions,rewardOffers,rewardHint,rulesVersion:2,saveKey:'afterglow-character-v2'};
})();
