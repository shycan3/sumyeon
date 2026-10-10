(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./party-expedition-core.js'):root.PartyExpedition;
  const L=typeof module!=='undefined'?require('./exploration-laws.js'):root.ExplorationLaws;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const TRAITS={
    torrent:{name:'격류',family:'assault',steps:[2,4,6],effects:['돌파 카드의 직접 피해 +1','직접 피해 +2로 강화','라운드 첫 노출 대상 돌파의 직접 피해 +4']},
    beacon:{name:'등불',family:'ward',steps:[2,4,6],effects:['수호 카드의 보호 +1','보호 +2로 강화','보호가 있는 대상에게 첫 유료 수호: 1장 뽑기']},
    echo:{name:'잔향',family:'disrupt',steps:[2,4,6],effects:['교란 카드의 약화 +1','약화 +2로 강화','약화된 대상에게 첫 유료 교란: 1장 뽑기']},
    current:{name:'해류',family:'cycle',steps:[2,4,6],effects:['첫 유료 순환 카드 뒤 1장 더 뽑기','추가 뽑기를 2장으로 강화','선행 지출 2 이상인 첫 유료 순환: 에너지 1 회수']},
    repair:{name:'정비망',family:'repair',steps:[2,4,6],effects:['정비 카드의 회복 +1','회복 +2로 강화','다친 대상에게 첫 유료 정비: 1장 뽑기']}
  };
  const DEFINITIONS={};
  const traitFor=kind=>DEFINITIONS[kind]?DEFINITIONS[kind].primaryTraitId:Object.keys(TRAITS).find(id=>TRAITS[id].family===C.CARDS[kind]?.family);
  function cardMetadata(kind){const d=C.CARDS[kind];if(!d)return null;const fields=[d,...(d.choices||[])],tags=[];for(const [tag,keys]of Object.entries({attack:['damage','areaDamage'],shield:['shield','allShield','selfShield'],control:['weak','allWeak','exposure','allExposure','breakPower'],draw:['draw','retrieve'],heal:['heal','selfHeal','allHeal'],resource:['energy','nextEnergy'],reservation:['retain','reserve','reserveDiscard'],persistent:['power']}))if(fields.some(f=>keys.some(k=>f[k])))tags.push(tag);return {primaryTraitId:traitFor(kind)||null,functionTags:DEFINITIONS[kind]?.functionTags||tags,baseWeight:DEFINITIONS[kind]?.baseWeight??1};}
  Object.assign(DEFINITIONS,Object.fromEntries(Object.entries(C.CARDS).map(([id,d])=>[id,{...d,...cardMetadata(id)}])));
  for(const [id,t]of Object.entries(TRAITS))t.breakpoints=t.steps.map((requiredCopies,i)=>({requiredCopies,effectId:id+'-'+(i+1),stackingMode:i===2?'stack':'replace',bonus:i<2?i+1:0}));
  function counts(deck){const result=Object.fromEntries(Object.keys(TRAITS).map(id=>[id,0]));for(const card of deck){const id=traitFor(card.kind);if(id)result[id]++;}return result;}
  class Battle extends C.Battle{
    constructor(options={}){super({...options,cardSet:'draft-1'});this.s.lawId=options.lawId??null;L.get(this.s.lawId);this.s.exploration={counts:counts(options.deck||Object.values(this.s.cards)),used:{},round:this.s.round};this.assert();}
    stage(id){const n=this.s.exploration?.counts[id]||0;return TRAITS[id]?.breakpoints.filter(b=>n>=b.requiredCopies).length||0;}
    flatBonus(id){return TRAITS[id]?.breakpoints.slice(0,Math.min(this.stage(id),2)).reduce((value,b)=>b.stackingMode==='stack'?value+b.bonus:b.bonus,0)||0;}
    definition(card,choice){const base=super.definition(card,choice);if(!base)return base;const d={...clone(base),...cardMetadata(this.s.cards[card]?.kind||'basic')};if(!this.s.exploration)return d;const id=traitFor(this.s.cards[card]?.kind),bonus=this.flatBonus(id),keys=id==='torrent'?['damage','areaDamage']:id==='beacon'?['shield','allShield']:id==='echo'?['weak','allWeak']:id==='repair'?['heal','selfHeal','allHeal']:[];for(const key of keys)if(d[key]&&!d.xScale?.includes(key))d[key]+=bonus;return d;}
    startRound(){if(this.residuePending)this.applyResidue();super.startRound();if(this.s.exploration){this.s.exploration.used={};this.s.exploration.round=this.s.round;}}
    hit(target,amount,info={}){const law=L.get(this.s.lawId),unit=this.actor(target);if(law?.id==='excess'&&unit?.hp>0){if(info.direct){this.s.events.push({type:'law',law:'excess',target,source:info.source,base:amount,bonus:law.damageBonus,result:amount+law.damageBonus});amount+=law.damageBonus;}else if(this.s.enemies.some(e=>e.id===info.source)&&this.s.allies.some(a=>a.id===target))this.s.events.push({type:'law',law:'excess',target,source:info.source,base:Math.max(0,amount-law.damageBonus),bonus:law.damageBonus,result:amount});}return super.hit(target,amount,info);}
    intentDamage(intent){const amount=super.intentDamage(intent);return L.get(this.s.lawId)?.id==='excess'&&!['prepare','ward','heal'].includes(intent.type)&&this.actor(intent.actor)?.hp>0?amount+L.DEFINITIONS.excess.damageBonus:amount;}
    applyResidue(){const pending=this.residuePending;delete this.residuePending;for(const a of this.s.allies){const before=pending[a.id]||0,retained=a.hp>0?Math.floor(before*L.DEFINITIONS.residue.shieldRetention):0;a.shield=Math.max(a.shield,retained);if(before)this.s.events.push({type:'law',law:'residue',target:a.id,base:before,result:a.shield,retained});}for(const e of this.s.enemies){const before=e.shield;e.shield=e.hp>0?Math.floor(before*L.DEFINITIONS.residue.shieldRetention):0;if(before)this.s.events.push({type:'law',law:'residue',target:e.id,base:before,result:e.shield,retained:e.shield});}}
    endRound(){if(this.s.lawId!=='residue')return super.endRound();if(this.s.status!=='playing'||this.s.needsTrim)return super.endRound();const baseHit=this.hit;this.residuePending=Object.fromEntries(this.s.allies.map(a=>[a.id,a.shield]));this.hit=function(...args){const result=baseHit.apply(this,args);this.residuePending=Object.fromEntries(this.s.allies.map(a=>[a.id,a.shield]));return result;};const held=this.s.enemies.map(e=>{let value=e.shield,first=true;Object.defineProperty(e,'shield',{enumerable:true,configurable:true,get:()=>value,set:v=>{if(first&&v===0){first=false;return;}first=false;value=v;}});return e;});try{super.endRound();if(this.residuePending)this.applyResidue();}finally{this.hit=baseHit;delete this.residuePending;for(const e of held){const value=e.shield;Object.defineProperty(e,'shield',{value,writable:true,enumerable:true,configurable:true});}}this.assert();return clone(this.s.events);}
    play(card,actor,target,choice){
      const d=this.definition(card,choice),kind=this.s.cards[card]?.kind,id=traitFor(kind),stage=this.stage(id),unit=this.actor(target),paid=this.costFor(card,actor)>0,earlier=this.s.paidEnergy;
      const ready=paid&&stage===3&&!this.s.exploration.used[id+'high'],condition=id==='beacon'?unit?.shield>0:id==='echo'?unit?.weak>0:id==='repair'?unit?.hp<unit?.max:false;
      const burst=ready&&id==='torrent'&&unit?.exposure>0&&(d.damage||d.areaDamage)>0;
      // Hook the ordinary hit only during this action; previews use the same
      // subclass and deterministic public state. No base prototype is patched.
      const baseHit=this.hit,baseDirect=this.directHit,baseShield=this.shield,baseHeal=this.heal,flat=this.flatBonus(id),xFields=d.xScale||[],spent=this.costFor(card,actor),weakBefore=Object.fromEntries(this.s.enemies.map(e=>[e.id,e.weak]));let enhanced=false;
      if(flat&&id==='torrent'&&xFields.some(k=>['damage','areaDamage'].includes(k)))this.directHit=function(targetId,amount,...args){return baseDirect.call(this,targetId,amount+flat,...args);};
      if(flat&&id==='beacon'&&xFields.includes('allShield')){const waiting=new Set(this.s.allies.filter(a=>a.hp>0).map(a=>a.id));this.shield=function(id,amount){if(waiting.delete(id))amount+=flat;return baseShield.call(this,id,amount);};}
      if(flat&&id==='repair'&&xFields.includes('heal')){let pending=true;this.heal=function(id,amount){if(pending&&id===target){amount+=flat;pending=false;}return baseHeal.call(this,id,amount);};}
      if(burst)this.hit=function(targetId,amount,info){if(!enhanced&&targetId===target&&info?.source===actor&&info.direct){enhanced=true;amount+=4;}return baseHit.call(this,targetId,amount,info);};
      try{super.play(card,actor,target,choice);}finally{this.hit=baseHit;this.directHit=baseDirect;this.shield=baseShield;this.heal=baseHeal;}
      if(flat&&id==='echo'&&xFields.includes('allWeak'))for(const e of this.s.enemies.filter(e=>e.hp>0)){e.weak=Math.max(weakBefore[e.id],d.allWeak*spent+flat);const event=this.s.events.findLast(v=>v.type==='weak'&&v.target===e.id);if(event)event.amount=e.weak;}
      if(id&&stage>0){const original=super.definition(card,choice),modifiers=Object.fromEntries(['damage','areaDamage','shield','allShield','weak','allWeak','heal','selfHeal','allHeal'].filter(k=>(d[k]||0)!==(original[k]||0)).map(k=>[k,(d[k]||0)-(original[k]||0)]));for(const key of xFields)if(flat&&((id==='torrent'&&['damage','areaDamage'].includes(key))||(id==='beacon'&&key==='allShield')||(id==='repair'&&key==='heal')||(id==='echo'&&key==='allWeak')))modifiers[key]=flat;if(Object.keys(modifiers).length)this.s.events.push({type:'trait-base',trait:id,card,modifiers});}
      if(enhanced){this.s.exploration.used[id+'high']=true;this.s.events.push({type:'trait',trait:id,amount:4});}
      if(this.s.status==='playing'&&paid&&id==='current'&&stage>0&&!this.s.exploration.used.current){this.s.exploration.used.current=true;this.draw(stage>=2?2:1);this.s.events.push({type:'trait',trait:id,amount:stage>=2?2:1});}
      if(this.s.status==='playing'&&ready&&((id==='current'&&earlier>=2)||condition)){this.s.exploration.used[id+'high']=true;if(id==='current')this.s.energy=Math.min(5,this.s.energy+1);else this.draw(1);this.s.events.push({type:'trait',trait:id,amount:1});}
      this.assert();return clone(this.s.events);
    }
    preview(card,actor,target,choice){const b=Battle.restore(this.snapshot());b.play(card,actor,target,choice);return b.snapshot();}
    temporaryClone(sourceId){
      const source=this.s.cards[sourceId];if(!source||this.s.status!=='playing'||this.s.needsTrim)throw Error('임시 복제 전에 유효한 전투 카드와 손패 선택이 필요합니다.');
      const id='temporary-'+Object.keys(this.s.cards).length;if(this.s.cards[id])throw Error('임시 사본 ID 충돌');
      this.s.cards[id]={...clone(source),id,temporary:true,sourceCardId:source.sourceCardId||sourceId};this.s.zones.hand.push(id);this.s.events.push({type:'temporary-copy',card:id,source:sourceId});this.assert();return id;
    }
    static restore(state){const b=Object.create(Battle.prototype);b.s=clone(state);if(b.s.lawId===undefined)b.s.lawId=null;b.assert();return b;}
    assert(){super.assert();L.get(this.s.lawId);const e=this.s.exploration;if(e&&(e.round!==this.s.round||Object.keys(e.counts).sort().join(',')!==Object.keys(TRAITS).sort().join(',')||Object.values(e.counts).some(n=>!Number.isInteger(n)||n<0)||!e.used||Object.entries(e.used).some(([k,v])=>!Object.keys(TRAITS).some(id=>k===id||k===id+'high')||v!==true)))throw Error('덱 특성 상태 오류');}
  }
  const api={Battle,TRAITS,traitFor,cardMetadata,DEFINITIONS,counts,CARDS:C.CARDS,ROLES:C.ROLES};if(typeof module!=='undefined')module.exports=api;root.ExplorationCombat=api;
})(typeof globalThis!=='undefined'?globalThis:this);
