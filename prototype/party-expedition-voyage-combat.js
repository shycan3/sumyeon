(function(root){
  'use strict';
  const Combat=typeof module!=='undefined'?require('./party-expedition-core.js'):root.PartyExpedition;
  const {Battle}=Combat, copy=v=>JSON.parse(JSON.stringify(v));
  const BALANCE_VERSION='voyage-balance-2',PREVIOUS_BALANCE_VERSION='voyage-balance-1',LEGACY_BALANCE_VERSION='voyage-balance-0';
  const BALANCE_VERSIONS=Object.freeze([BALANCE_VERSION,PREVIOUS_BALANCE_VERSION,LEGACY_BALANCE_VERSION]);
  const hasFirstPatch=version=>version===BALANCE_VERSION||version===PREVIOUS_BALANCE_VERSION;
  const RELICS={
    compass:{name:'삼중 나침반',icon:'◈',text:'라운드에 서로 다른 계열 카드 3종 사용 후 1장 뽑기. 라운드당 1회.'},
    oxygen:{name:'압축 산소통',icon:'▥',text:'매 전투 첫 인쇄 비용 2 이상 카드 사용 후 에너지 1 회복. X 제외.'},
    ledger:{name:'빈 기록장',icon:'▤',text:'전투 카드 보상을 건너뛰면 기록 조각 6 획득.'},
    rope:{name:'귀환 밧줄',icon:'↶',text:'카드를 회수한 실행자에게 보호 3. 라운드당 1회.'},
    lens:{name:'균열 망원경',icon:'⌖',text:'노출을 소비한 적에게 다음 공격 약화 2. 라운드당 1회.'},
    buoy:{name:'응급 부표',icon:'◉',text:'매 전투 첫 아군 HP 피해 뒤, 다른 생존 동료 중 HP 비율 최저에게 보호 5.'},
    hearth:{name:'귀항 등불',icon:'✧',text:'전투 승리 후 생존 동료 전원 HP 2 회복.'},
    hourglass:{name:'해류 모래시계',icon:'⌛',text:'매 전투 첫 다음 라운드 준비 카드 사용 후 다음 라운드 에너지 1 추가.'},
    signal:{name:'네 갈래 신호기',icon:'✣',text:'라운드에 서로 다른 실행자 3명이 유료 카드를 쓰면 에너지 1 회복. 라운드당 1회.'},
    mirror:{name:'은빛 방파판',icon:'◇',text:'라운드 첫 대상 보호 카드에 대상 반격 3 추가.'},
    purse:{name:'침몰선 금고',icon:'▣',text:'전투 기록 조각 +3. 회복과 제거를 함께 준비할 여유를 만든다.'},
    seal:{name:'정박지 인장',icon:'⚓',text:'정박지에서 회복을 선택하면 강화하지 않은 카드 1장도 직접 골라 강화.'}
  };
  const TOOLS={
    barrier:{name:'휴대 방파막',icon:'◇',text:'생존 동료 전원 보호 4.',price:12},
    battery:{name:'비상 축전지',icon:'◈',text:'에너지 2 회복. 최대 5.',price:16},
    flare:{name:'균열 신호탄',icon:'⌖',text:'적 하나 노출 6.',target:'enemy',price:12},
    medicine:{name:'응급 처치함',icon:'✚',text:'생존 동료 하나 HP 8 회복.',target:'ally',price:16},
    chart:{name:'예비 해도',icon:'▤',text:'카드 2장 뽑기.',price:10},
    muffler:{name:'감쇠 장치',icon:'≈',text:'모든 적 다음 공격 약화 3.',price:14}
  };
  const ENCHANTS={
    retain:{name:'정박',text:'사용하지 않으면 손패에 보존.',test:d=>!d.retain},
    flash:{name:'섬광',text:'비용 −1 · 사용 후 소진. X·지속·기존 소진 제외.',test:d=>Number.isInteger(d.cost)&&d.cost>0&&!d.power&&!d.exhaust},
    tide:{name:'해류',text:'다음 라운드 에너지 +1.',test:()=>true},
    anchor:{name:'귀환',text:'실행자 다음 라운드 보호 +3.',test:()=>true},
    edge:{name:'절삭',text:'직접 피해 +3 또는 대상 보호 +4.',test:d=>!!(d.damage||d.shield)}
  };
  function enchanted(d,id){
    if(!id)return d;
    if(!ENCHANTS[id])throw Error('알 수 없는 각인');
    d={...d};
    if(id==='retain')d.retain=true;
    if(id==='flash'){if(Number.isInteger(d.cost))d.cost=Math.max(0,d.cost-1);d.exhaust=true;}
    if(id==='tide')d.nextEnergy=(d.nextEnergy||0)+1;
    if(id==='anchor')d.nextShield=(d.nextShield||0)+3;
    if(id==='edge'){if(d.damage)d.damage+=3;else if(d.shield)d.shield+=4;}
    d.enchant=id;d.enchantName=ENCHANTS[id].name;
    d.text+=(d.text?' · ':'')+'각인 '+ENCHANTS[id].name+': '+ENCHANTS[id].text;
    return d;
  }
  const original={};
  for(const key of ['definition','startRound','enemyIntent','play','hit','assert'])original[key]=Battle.prototype[key];
  Battle.prototype.definition=function(id,choice){
    const d=original.definition.call(this,id,choice);
    return d?enchanted(d,this.s.cards[id]?.enchant):d;
  };
  function owns(b,id){return b.s.voyage?.relics.includes(id);}
  function once(b,id,scope='round'){
    const flags=scope==='battle'?b.s.voyage.used:b.s.voyage.roundUsed;
    if(!owns(b,id)||flags[id])return false;
    flags[id]=true;b.s.events.push({type:'relic',relic:id,name:RELICS[id].name});return true;
  }
  function gain(b,n){const amount=Math.min(n,5-b.s.energy);b.s.energy+=amount;if(amount)b.s.events.push({type:'energy',amount});}
  Battle.prototype.startRound=function(){
    const v=this.s.voyage;
    if(v){v.used||={};v.roundUsed={};v.families=[];v.actors=[];}
    original.startRound.call(this);
    if(v&&this.s.round===1&&v.rule==='lowtide')this.s.energy=Math.max(0,this.s.energy-1);
  };
  Battle.prototype.enemyIntent=function(enemy,index){
    if(!['bellkeeper','twins','tideheart'].includes(enemy.pattern))return original.enemyIntent.call(this,enemy,index);
    if(enemy.queuedIntent)return original.enemyIntent.call(this,enemy,index);
    const living=this.s.allies.filter(a=>a.hp>0),target=living[(this.s.round-1+index)%living.length].id;
    const attack=damage=>({actor:enemy.id,type:'attack',damage,target});
    const area=damage=>({actor:enemy.id,type:'area',damage,target:null});
    const prepare=(damage,wide=false)=>{
      enemy.queuedIntent={type:wide?'area':'attack',damage,target:wide?null:target};
      return {actor:enemy.id,type:'prepare',damage:0,target:null,nextType:wide?'area':'attack',nextDamage:damage,nextTarget:wide?null:target};
    };
    const p=(this.s.round-1)%4;
    if(enemy.pattern==='bellkeeper'){
      // The protected setup creates two answers: strip/penetrate now or prepare a
      // counterattack. Its damage never escalates just because a defensive deck waits.
      if(p===0){enemy.shield=7;return prepare(enemy.damage+5);}
      return p===2?area(enemy.areaDamage):attack(enemy.damage-2);
    }
    if(enemy.pattern==='twins'){
      // Give elite encounters one full round of warning before their third-round
      // area attack. Boss companions and saved legacy runs retain their cadence.
      const earlier=hasFirstPatch(this.s.voyage?.balanceVersion)&&this.s.voyage.encounterTier==='elite';
      return p===0?attack(enemy.damage):p===(earlier?1:2)?prepare(enemy.areaDamage+2,true):attack(Math.max(1,enemy.damage-2));
    }
    // Vulnerability is applied before player actions and consumed once, making
    // banking energy and using many small attacks both viable, with different costs.
    if(p===0){enemy.shield=6;return prepare(enemy.areaDamage+2,true);}
    if(p===2){enemy.exposure=Math.max(enemy.exposure,6);return prepare(enemy.damage+5);}
    return attack(enemy.damage);
  };
  Battle.prototype.play=function(card,actor,target,choice){
    const d=this.definition(card,choice),v=this.s.voyage;
    const expensive=Number.isInteger(d?.printedCost)&&d.printedCost>=2;
    const result=original.play.call(this,card,actor,target,choice);
    if(!v||card==='basic')return result;
    if(d.family&&!v.families.includes(d.family))v.families.push(d.family);
    const cost=this.s.events.find(e=>e.type==='card')?.cost||0;
    if(cost>0&&!v.actors.includes(actor))v.actors.push(actor);
    if(this.s.status==='playing'){
      if(v.families.length>=3&&once(this,'compass'))this.draw(1);
      if(expensive&&once(this,'oxygen','battle'))gain(this,1);
      if(v.actors.length>=3&&once(this,'signal'))gain(this,1);
      if(this.s.events.some(e=>e.type==='retrieve')&&once(this,'rope'))this.shield(actor,3);
      const consumed=this.s.events.find(e=>e.type==='exposure-consumed');
      if(consumed&&this.actor(consumed.target).hp>0&&once(this,'lens'))this.actor(consumed.target).weak=Math.max(2,this.actor(consumed.target).weak);
      if((d.nextEnergy||d.nextShield)&&once(this,'hourglass','battle')){this.s.pending||={energy:0,shields:{}};this.s.pending.energy++;}
      if(d.shield&&this.actor(target).hp>0&&once(this,'mirror'))this.actor(target).reaction=Math.max(this.actor(target).reaction,3);
    }
    this.assert();return copy(this.s.events);
  };
  Battle.prototype.hit=function(id,amount,options){
    const result=original.hit.call(this,id,amount,options);
    if(this.s.voyage&&result?.amount>0&&this.s.allies.some(a=>a.id===id)&&once(this,'buoy','battle')){
      const candidates=this.s.allies.filter(a=>a.hp>0&&a.id!==id).sort((a,b)=>a.hp/a.max-b.hp/b.max);
      if(candidates[0])this.shield(candidates[0].id,5);
    }
    return result;
  };
  Battle.prototype.useTool=function(slot,target){
    const v=this.s.voyage,id=v?.tools[slot],tool=TOOLS[id];
    if(this.s.status!=='playing'||this.s.needsTrim||!Number.isInteger(slot)||!tool)throw Error('현재 사용할 수 없는 전술 도구');
    const unit=this.actor(target);
    if(tool.target&&(!unit||unit.hp<=0||!this.s[tool.target==='enemy'?'enemies':'allies'].includes(unit)))throw Error('도구 대상을 선택하세요');
    this.s.events=[{type:'tool',tool:id,target:target||null}];
    if(id==='barrier')this.s.allies.filter(a=>a.hp>0).forEach(a=>this.shield(a.id,4));
    if(id==='battery')gain(this,2);
    if(id==='flare')unit.exposure=Math.max(6,unit.exposure);
    if(id==='medicine')this.heal(target,8);
    if(id==='chart')this.draw(2);
    if(id==='muffler')this.s.enemies.filter(a=>a.hp>0).forEach(a=>a.weak=Math.max(3,a.weak));
    v.tools.splice(slot,1);this.assert();return copy(this.s.events);
  };
  Battle.prototype.previewTool=function(slot,target){const b=Battle.restore(this.snapshot());b.useTool(slot,target);return b.snapshot();};
  Battle.prototype.assert=function(){
    original.assert.call(this);
    const v=this.s.voyage;
    if(v){
      if(v.balanceVersion!==undefined&&!BALANCE_VERSIONS.includes(v.balanceVersion))throw Error('원정 밸런스 버전 오류');
      if(v.encounterTier!==undefined&&!['battle','elite','boss'].includes(v.encounterTier))throw Error('전투 보상 등급 오류');
      if(!Array.isArray(v.relics)||new Set(v.relics).size!==v.relics.length||v.relics.some(id=>!RELICS[id])||!Array.isArray(v.tools)||v.tools.length>2||v.tools.some(id=>!TOOLS[id]))throw Error('원정 전투 장비 오류');
      if(v.rule!==undefined&&!['lowtide','normal'].includes(v.rule))throw Error('공개 전투 조건 오류');
      for(const field of ['used','roundUsed'])if(v[field]&&(typeof v[field]!=='object'||Array.isArray(v[field])||Object.entries(v[field]).some(([id,x])=>!RELICS[id]||typeof x!=='boolean')))throw Error('유물 발동 상태 오류');
      for(const field of ['families','actors'])if(v[field]&&(!Array.isArray(v[field])||new Set(v[field]).size!==v[field].length||v[field].some(id=>field==='families'?!['assault','ward','disrupt','cycle','repair'].includes(id):!this.s.allies.some(a=>a.id===id))))throw Error('유물 연계 기록 오류');
    }
    for(const c of Object.values(this.s.cards))if(c.enchant&&!ENCHANTS[c.enchant])throw Error('카드 각인 상태 오류');
    return true;
  };
  const api={RELICS,TOOLS,ENCHANTS,enchanted,BALANCE_VERSION,PREVIOUS_BALANCE_VERSION,LEGACY_BALANCE_VERSION,BALANCE_VERSIONS,hasFirstPatch};
  if(typeof module!=='undefined')module.exports=api;else root.PartyExpeditionVoyageCombat=api;
})(typeof globalThis!=='undefined'?globalThis:this);
