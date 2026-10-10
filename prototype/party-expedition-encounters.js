(function(root){
  'use strict';
  // All values are authored before difficulty and balance multipliers. This
  // module uses a private map RNG; looking ahead never consumes a combat draw.
  const VERSION='voyage-encounters-1';
  const ENEMIES=Object.freeze({
    hunter:{name:'사냥꾼',hp:26,damage:8,areaDamage:3,color:'#f3a38f',threat:'집중 공격과 예고된 강타. 처치하거나 약화·보호로 대응.'},
    sweep:{name:'파문체',hp:23,damage:7,areaDamage:3,color:'#b39be5',threat:'단일 공격과 전체 공격을 번갈아 사용. 분산 보호 또는 집중 처치.'},
    sentinel:{name:'문지기',hp:30,damage:8,areaDamage:3,color:'#deb874',threat:'보호를 두르고 강타 준비. 관통·보호 제거 또는 준비 후 대응.'},
    leech:{name:'흡수체',hp:25,damage:7,areaDamage:3,color:'#accc82',threat:'가장 다친 동료를 노리는 공격과 전체 공격. 집중 보호 또는 우선 처치.'},
    conductor:{name:'관측자',hp:25,damage:7,areaDamage:4,color:'#88cad3',threat:'전체 공격과 예고된 집중 공격. 약화·전원 보호·우선 처치.'},
    warder:{name:'방파의 파수',hp:19,damage:5,areaDamage:2,color:'#83c4d4',threat:'동료에게 보호를 예고하고 실행. 지원자를 제거하거나 보호를 관통·해체.'},
    mender:{name:'봉합의 잔향',hp:18,damage:5,areaDamage:2,color:'#a6d2a3',threat:'회복 대상을 먼저 공개하고 다음 라운드에 회복. 지원자 또는 회복 대상부터 처치.'},
    pursuer:{name:'잠항 추적자',hp:28,damage:5,areaDamage:3,color:'#d8ae86',threat:'두 동료를 함께 노린 뒤 전체 공격. 두 대상 보호·약화·집중 처치.'},
    bellkeeper:{name:'종을 지키는 자',hp:46,damage:10,areaDamage:3,color:'#91bfcb',toughnessMax:6,threat:'보호 7 뒤 집중 공격. 보호 제거·관통 또는 다음 공격 준비.'},
    twins:{name:'분열된 감시자',hp:25,damage:7,areaDamage:3,color:'#bea3d5',toughnessMax:6,threat:'2턴 전체 공격 준비 · 3턴 실행. 집중 처치·약화 또는 전원 보호.'},
    relay:{name:'연결의 감시자',hp:37,damage:9,areaDamage:3,color:'#83bbbf',toughnessMax:7,threat:'동료 보호·집중 공격·광역 준비. 지원을 끊거나 현재 공격에 먼저 대응.'},
    boss:{name:'심층의 파수꾼',hp:68,damage:14,areaDamage:6,color:'#d9a4ef',toughnessMax:8,threat:'집중·전체 공격을 번갈아 예고. 동행 관측자와 본체의 표적 우선순위 판단.'},
    tideheart:{name:'해류의 심장',hp:76,damage:11,areaDamage:4,color:'#91bfcb',toughnessMax:8,threat:'보호를 두르는 준비와 노출 6 취약 단계를 반복. 자원 이월·틈 활용·동행 적 처치.'},
    abyssjudge:{name:'침수의 집행자',hp:74,damage:11,areaDamage:4,color:'#93a8d9',toughnessMax:8,threat:'HP 절반 이하부터 다음 행동 공개 때 침수 국면. 두 대상 공격·광역 준비로 전환. 이미 예고한 행동은 유지.'}
  });
  // A lane keeps its own service and edge topology. Only the encounter is drawn
  // from this floor's pool. Supports appear alongside one threatening partner.
  const FLOORS=[
    [['hunter'],['sentinel'],['pursuer'],['sweep']],
    [['sweep'],['leech'],['pursuer'],['hunter']],
    [['hunter','warder'],['pursuer','mender'],['leech','conductor'],['sweep','warder']],
    [['bellkeeper'],['twins','twins'],['relay','warder'],['sentinel','mender']],
    [['leech','hunter'],['sweep','warder'],['pursuer','mender'],['sentinel','warder']],
    [['sentinel','conductor'],['hunter','mender'],['pursuer','warder'],['leech','mender']],
    [['bellkeeper'],['twins','twins'],['relay','mender'],['sentinel','pursuer']]
  ];
  const BOSSES=[['boss','conductor'],['tideheart','twins'],['abyssjudge','mender']];
  const signature=patterns=>[...patterns].sort().join('+');
  const rng=seed=>{let value=((seed>>>0)^0x61c88647)>>>0||1;return()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return(value>>>=0)/4294967296;};};
  function populate(map,{seed,difficulty='normal'}){
    const random=rng(seed),shuffle=values=>{const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
    const calm=difficulty==='calm';
    function enemy(pattern,index,floor,companion=false){
      const d=ENEMIES[pattern],elite=[3,6].includes(floor),boss=floor===7;
      let hp=d.hp,damage=d.damage,areaDamage=d.areaDamage;
      if(boss&&companion){hp=18;damage=pattern==='conductor'?9:pattern==='twins'?6:5;areaDamage=pattern==='conductor'?5:2;}
      else if(boss){/* bosses have individually authored budgets */}
      else if(pattern==='bellkeeper'){hp=floor===6?57:46;}
      else if(pattern==='twins'){hp=floor===6?31:25;}
      else if(pattern==='relay'){hp=floor===6?46:37;damage+=floor===6?1:0;}
      else if(['warder','mender'].includes(pattern)){hp+=Math.floor(floor/2)*2;damage+=Math.floor(floor/4);}
      else {hp+=floor<2?floor*2:Math.floor(floor/2)*3;damage+=Math.floor(floor/3);areaDamage+=Math.floor(floor/4);if(elite){hp=Math.round(hp*1.1);damage++;}}
      return{id:`f${floor}-e${index}`,pattern,name:d.name,hp:Math.max(1,Math.round(hp*(calm?.8:1))),damage:Math.max(1,Math.round(damage*(calm?.8:1))),areaDamage:Math.max(1,Math.round(areaDamage*(calm?.8:1))),color:d.color,toughnessMax:d.toughnessMax||(boss?8:6)};
    }
    let previous=new Set();
    for(let floor=0;floor<7;floor++){
      const ranked=shuffle(FLOORS[floor]),candidates=[...ranked.filter(p=>!previous.has(signature(p))),...ranked.filter(p=>previous.has(signature(p)))].slice(0,3);
      previous=new Set(candidates.map(signature));
      for(let lane=0;lane<3;lane++){
        const n=map.nodes.find(n=>n.id===`f${floor}-path${lane}`),r=n.route,patterns=candidates[lane];
        n.type=r.rewardTier=[3,6].includes(floor)?'elite':'battle';
        r.enemies=patterns.map((p,i)=>enemy(p,i,floor));n.label=r.enemies.map(e=>e.name).join(' + ');
        r.name=n.label+(r.interlude?' · '+({camp:'정박지',shop:'유실물 상점',event:'관측실'}[r.interlude])+' 경유':'');
        r.threat=[...new Set(patterns.map(p=>ENEMIES[p].threat))].join(' / ');
        r.description=r.enemies.map(e=>e.name+' HP '+e.hp).join(' · ')+(r.interlude?' / 전투 후 '+({camp:'회복 / 카드 강화 / 제거',shop:'카드 구매 / 회복 / 제거',event:'사건 선택'}[r.interlude]):'');
        r.encounterId=signature(patterns);n.entry=true;
      }
    }
    // Three distinct bosses are seeded independently of route/reward/combat RNG.
    const patterns=BOSSES[Math.floor(random()*BOSSES.length)],n=map.nodes.find(n=>n.type==='boss'),r=n.route;
    r.enemies=patterns.map((p,i)=>enemy(p,i,7,i>0));n.label=r.name=r.enemies[0].name;r.rewardTier='boss';
    r.description=r.enemies.map(e=>e.name+' HP '+e.hp).join(' · ')+' / 전투 후 원정 완료';
    r.threat=patterns.map(p=>ENEMIES[p].threat).join(' / ');r.encounterId=signature(patterns);n.entry=true;
    map.encounterVersion=VERSION;
    return map;
  }
  const api={VERSION,ENEMIES,FLOORS,BOSSES,populate};
  if(typeof module!=='undefined')module.exports=api;else root.PartyExpeditionEncounters=api;
})(typeof globalThis!=='undefined'?globalThis:this);
