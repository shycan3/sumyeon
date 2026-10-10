'use strict';
(() => {
  const roles = [
    {name:'방패병',icon:'◆',color:'#79c9d2',hp:140,damage:4,range:55,period:1.8,speed:68,stances:['보호','압박'],tips:['아군을 위협하는 적에게 접근 · 가까운 아군 피해 20% 대신 부담 · 자신의 피해 30% 감소','가까운 적에게 접근해 밀치고 기본 피해 증가']},
    {name:'검사',icon:'†',color:'#e4bf79',hp:115,damage:6,range:58,period:1.65,speed:78,stances:['견제','추격'],tips:['가까운 적을 상대하며 전선을 유지','HP가 적은 적을 추격하고 기본 피해 20% 증가']},
    {name:'사수',icon:'↗',color:'#a7b9ef',hp:95,damage:5,range:230,period:2,speed:50,stances:['기동','집중'],tips:['적과 거리를 벌리며 사격','후퇴하지 않고 기본 피해 30% 증가']},
    {name:'지원가',icon:'✚',color:'#99d4aa',hp:95,damage:4,range:215,period:2.2,speed:48,stances:['지원','방해'],tips:['HP 비율이 낮은 아군을 조금씩 회복','위험한 적을 공격하고 이동·공격 속도를 늦춤']}
  ];
  // limit is a family limit: base and evolved copies share it.
  const cards = {
    guard:{name:'차단 방패',role:0,kind:'guard',time:5,prep:0,legacy:.2,duration:2.5,limit:3,desc:'다음 적 카드 공격 1회를 아군 전체에서 차단'},
    bash:{name:'방패 강타',role:0,kind:'attack',power:25,time:4,prep:0,legacy:.4,knock:35,limit:3,desc:'적 하나를 공격하고 뒤로 밀침'},
    taunt:{name:'도발',role:0,kind:'taunt',time:5,prep:0,legacy:.2,duration:4,limit:3,desc:'적 기본·단일 카드 공격을 자신에게 유도'},
    bulwark:{name:'수호의 진형',role:0,kind:'armor',time:6,prep:0,legacy:.4,duration:5,power:.3,limit:3,desc:'아군 전체가 받는 피해 감소'},
    slam:{name:'방패 충격파',role:0,kind:'area',radius:160,power:35,time:7,prep:.7,legacy:.7,knock:65,limit:1,desc:'지정 위치 반경 160의 적을 공격하고 밀침'},
    dash:{name:'돌진',role:1,kind:'attack',power:27,time:3,prep:0,legacy:.35,dash:true,limit:3,desc:'적 하나에게 접근해 빠르게 공격'},
    heavy:{name:'강격',role:1,kind:'attack',power:66,time:6,prep:.65,legacy:.7,approach:true,reach:70,maxApproach:1.2,limit:3,desc:'자동 접근 후 강타 · 먼 적은 접근 최대 1.2초 추가'},
    cleave:{name:'넓게 베기',role:1,kind:'area',radius:125,power:24,time:5,prep:0,legacy:.4,limit:3,desc:'지정 위치 반경 125 안의 적을 공격'},
    execute:{name:'마무리 일격',role:1,kind:'execute',power:38,time:5,prep:0,legacy:.4,limit:1,desc:'적 HP가 절반 이하면 피해 2배'},
    warcry:{name:'전투 함성',role:1,kind:'buff',time:5,prep:0,legacy:.3,duration:6,power:.3,limit:3,desc:'아군 전체의 기본·카드 피해 증가'},
    shot:{name:'속사',role:2,kind:'attack',power:24,time:3,prep:0,legacy:.3,limit:3,desc:'적 하나에게 빠르게 사격'},
    volley:{name:'화살비',role:2,kind:'area',power:27,time:6,prep:.55,legacy:.6,limit:3,desc:'준비 후 적 전체에 화살을 퍼부음'},
    mark:{name:'약점 표식',role:2,kind:'mark',time:3,prep:0,legacy:.3,power:10,duration:6,limit:3,desc:'적 하나를 공격하고 받는 피해 30% 증가'},
    frost:{name:'구속 사격',role:2,kind:'slow',time:4,prep:0,legacy:.3,power:23,duration:5,delayAttack:1,limit:3,desc:'이동·기본 공격 둔화 · 준비 중 공격 카드 1초 지연(카드당 1회)'},
    pierce:{name:'관통 화살',role:2,kind:'pierce',time:6,prep:.7,legacy:.7,power:55,limit:1,desc:'적 하나에게 피해 감소를 무시하는 사격'},
    heal:{name:'집중 회복',role:3,kind:'heal',power:38,time:5,prep:0,legacy:.4,limit:3,desc:'살아 있는 아군 하나를 회복'},
    wave:{name:'전체 회복',role:3,kind:'healAll',power:27,time:8,prep:0,legacy:.6,limit:3,desc:'살아 있는 아군 전체를 회복'},
    ward:{name:'보호의 빛',role:3,kind:'ward',power:35,time:4,prep:0,legacy:.3,duration:5,limit:3,desc:'아군 하나에게 임시 보호막 부여'},
    cleanse:{name:'정화',role:3,kind:'cleanse',power:27,time:4,prep:0,legacy:.3,limit:3,desc:'아군 하나를 회복하고 둔화·표식 제거'},
    blessing:{name:'새벽의 축복',role:3,kind:'blessing',power:24,time:7,prep:.6,legacy:.6,duration:5,limit:1,desc:'아군 전체 회복과 20% 피해 증가'}
  };
  const starter = {guard:2,bash:1,taunt:2,dash:3,heavy:2,shot:3,volley:2,heal:3,wave:2};
  const rooms = {
    battle:{name:'교전',icon:'⚔',color:'#e3b88a',desc:'적을 물리치고 카드 보상을 선택'},
    elite:{name:'강적',icon:'◆',color:'#ef8e8e',desc:'강한 적과 싸워 희귀 카드 보상을 노림'},
    reward:{name:'보급',icon:'▣',color:'#a7b9ef',desc:'카드 후보 3장 중 1장 획득'},
    heal:{name:'휴식',icon:'✚',color:'#99d4aa',desc:'최대 HP 30% 회복 · 쓰러진 아군 복귀'},
    upgrade:{name:'강화',icon:'✦',color:'#e4bf79',desc:'덱의 카드 한 장을 이번 출정에서 진화'},
    checkpoint:{name:'카드 확보',icon:'⚑',color:'#79c9d2',desc:'새로 얻은 카드를 영구 수집 목록에 확보'},
    boss:{name:'경계의 수호자',icon:'♜',color:'#ed9cbe',desc:'최종 보스를 격파하고 출정 완주'}
  };
  const doctrines={
    adaptive:{name:'상황 대응',desc:'현재 전황에 맞춰 공격·방어·회복을 선택'},
    front:{name:'전열 압박',desc:'방패병으로 전선을 유지하며 공격 카드를 우선'},
    hunt:{name:'부상자 추격',desc:'HP 비율이 낮은 동료를 기본 공격과 단일 카드로 집중 추격'},
    sustain:{name:'호위와 회복',desc:'방패병은 보호, 지원가는 회복을 유지하며 방어·회복 카드 우선'},
    swarm:{name:'범위 포위',desc:'여럿을 맞힐 수 있는 범위 공격과 이동 방해 우선'},
    duel:{name:'지원가 압박',desc:'단일 카드로 지원가를 우선 공격 · 도발로 표적 전환 가능'},
    boss:{name:'수호자의 시험',desc:'1단계 전체 공격 우선 → HP 50% 이하에서 2단계 부상자 단일 공격 우선'}
  };
  const encounters = [
    {name:'길목의 습격',strategy:'front',hint:'전열과 사수의 교전. 도발로 적의 공격을 모아보세요.',enemies:[{role:0,name:'방랑 방패병',hp:125},{role:2,name:'길목 사수',hp:90}]},
    {name:'추격대',strategy:'hunt',hint:'부상자를 노리는 적 검사와 사수. 회복과 빠른 마무리가 중요합니다.',enemies:[{role:1,name:'추격 검사',hp:105,stance:1},{role:2,name:'추격 사수',hp:90}]},
    {name:'주술사의 호위',strategy:'sustain',hint:'지원가가 적을 회복합니다. 표적을 바꾸거나 범위 공격으로 압박하세요.',enemies:[{role:0,name:'호위병',hp:140},{role:3,name:'주술사',hp:95},{role:2,name:'호위 사수',hp:85}]},
    {name:'칼날의 포위',strategy:'swarm',hint:'여러 근접 적이 몰려옵니다. 보호 태세와 범위 공격을 활용하세요.',enemies:[{role:1,name:'칼날 용병',hp:110},{role:1,name:'쌍검 용병',hp:100},{role:2,name:'지원 사수',hp:85}]},
    {name:'돌격대장',strategy:'duel',hint:'강한 단일 카드 공격이 예고됩니다. 차단·도발과 명령 회복 시간을 살피세요.',enemies:[{role:1,name:'돌격대장',hp:180,stance:1},{role:0,name:'전열 호위',hp:125}]},
    {name:'수호자의 문',strategy:'boss',hint:'보스의 충격파는 도발로 피할 수 없습니다. 차단과 전체 회복을 준비하세요.',boss:true,enemies:[{role:1,name:'경계의 수호자',hp:310,boss:true},{role:3,name:'등불 주술사',hp:115}]}
  ];
  const hostile = {
    quake:{name:'붕괴의 파동',role:1,kind:'area',power:32,time:8,prep:1.8,duration:0,desc:'아군 전체에 강한 피해'},
    crush:{name:'수호자의 강타',role:1,kind:'attack',power:57,time:7,prep:1.6,desc:'아군 하나에 강한 피해'}
  };
  const cardTraitMap={guard:'escort',bash:'resonance',taunt:'escort',bulwark:'escort',slam:'resonance',dash:'pursuit',heavy:'pursuit',cleave:'resonance',execute:'pursuit',warcry:'resonance',shot:'pursuit',volley:'resonance',mark:'pursuit',frost:'pursuit',pierce:'pursuit',heal:'resonance',wave:'resonance',ward:'escort',cleanse:'resonance',blessing:'resonance',quake:'resonance',crush:'pursuit'};
  for(const [key,d]of Object.entries({...cards,...hostile})){if(!cardTraitMap[key])throw Error('카드 특성이 누락됐습니다: '+key);d.traits=[cardTraitMap[key]];}
  class Random {
    constructor(seed=1){this.seed=seed>>>0;}
    next(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
    pick(items){return items[Math.floor(this.next()*items.length)];}
    shuffle(items){for(let i=items.length-1;i>0;i--){const j=Math.floor(this.next()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
  }
  function definition(card,timing='mixed'){
    const original=cards[card.key]||hostile[card.key];
    if(!original)throw new Error('Unknown card: '+card.key);
    if(!Array.isArray(original.traits)||!original.traits.length)throw new Error('카드 특성이 누락됐습니다: '+card.key);
    const d={...original,key:card.key,upgraded:!!card.upgraded};
    if(timing==='classic'&&d.legacy!==undefined)d.prep=d.legacy;
    if(card.upgraded){if(d.upgradeTimeReduction)d.time=Math.max(1,d.time-d.upgradeTimeReduction);if(d.power)d.power*=1.35;if(d.duration)d.duration*=1.3;}
    return d;
  }
  function maxHP(role,level=1){return Math.round(roles[role].hp*(1+.06*(level-1)));}
  function validateDeck(ids,pool){
    if(ids.length!==20)return '덱은 정확히 20장이어야 합니다.';
    if(new Set(ids).size!==ids.length)return '같은 개별 카드를 두 번 편성할 수 없습니다.';
    const counts={};
    for(const id of ids){const c=pool.find(c=>c.id===id);if(!c||!cards[c.key])return '보유하지 않은 카드입니다.';if(!Array.isArray(cards[c.key].traits)||!cards[c.key].traits.length)return '특성이 없는 카드는 편성할 수 없습니다.';counts[c.key]=(counts[c.key]||0)+1;if(counts[c.key]>cards[c.key].limit)return `${cards[c.key].name}: 최대 ${cards[c.key].limit}장입니다.`;}
    return '';
  }
  window.GameData={roles,cards,hostile,rooms,doctrines,encounters,starter,Random,definition,maxHP,validateDeck};
})();
