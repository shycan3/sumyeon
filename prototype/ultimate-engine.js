'use strict';
(() => {
 const Base=window.CharacterBattle,D=window.GameData,K=window.CharacterData,U=window.UltimateData,copy=x=>JSON.parse(JSON.stringify(x));
 const isUltimate=key=>D.cards[key]?.source==='ultimate';
 class UltimateBattle extends Base{
  constructor(config,snapshot=null){
   if(!snapshot&&!U.validConfig(config))throw Error('궁극기 규칙이 올바르지 않습니다.');
   super(config,snapshot);
   if(!snapshot&&config.autoUltimateVersion===1)this.s.autoUltimateVersion=1;
   if(!snapshot&&config.ultimateRulesVersion===1)this.s.ultimates={version:1,signatureMode:config.signatureMode||'standard',cardsSince:U.cardGap,actors:this.s.party.flatMap(p=>U.profiles[p.characterId]?[{actor:'a'+p.slot,characterId:p.characterId,key:U.profiles[p.characterId].key,charge:0,casts:0,readyAt:null,lastCast:null,lastGain:'',seen:[]}]:[]),history:[]};
   if(!UltimateBattle.validUltimateStates(this.s))throw Error('궁극기 저장 상태가 올바르지 않습니다.');
  }
  static validUltimateStates(s){
   if(s?.autoUltimateVersion!==undefined&&(![0,1].includes(s.autoUltimateVersion)||s.autoUltimateVersion===1&&!s.ultimates))return false;
   const x=s?.ultimates,num=n=>Number.isFinite(n)&&n>=0&&n<=s.t;
   if(x===undefined)return !!s?.events&&!s.events.some(e=>isUltimate(e.key))&&!s.actors.some(a=>isUltimate(a.action?.key));
   const expected=s.party?.flatMap(p=>U.profiles[p.characterId]?[{actor:'a'+p.slot,characterId:p.characterId,key:U.profiles[p.characterId].key}]:[]);
   if(s.identityVersion!==1||x.version!==1||!['standard','guardDance'].includes(x.signatureMode)||x.signatureMode==='guardDance'&&!s.party.some(p=>p.characterId==='serin')||!Number.isSafeInteger(x.cardsSince)||x.cardsSince<0||x.cardsSince>U.cardGap||!Array.isArray(x.actors)||x.actors.length!==expected?.length)return false;
   if(!x.actors.every((r,i)=>r&&r.actor===expected[i].actor&&r.characterId===expected[i].characterId&&r.key===expected[i].key&&Number.isInteger(r.charge)&&r.charge>=0&&r.charge<=100&&Number.isInteger(r.casts)&&r.casts>=0&&r.casts<=U.maxCasts&&(r.casts<U.maxCasts||r.charge===0)&&(r.lastCast===null?r.casts===0:r.casts>0&&num(r.lastCast))&&(r.readyAt===null?r.charge<100:r.charge===100&&num(r.readyAt))&&typeof r.lastGain==='string'&&r.lastGain.length<=100&&Array.isArray(r.seen)&&r.seen.length<=128&&new Set(r.seen).size===r.seen.length&&r.seen.every(k=>typeof k==='string'&&k.length<=100)&&(s.actors.find(a=>a.id===r.actor)?.hp>0||r.charge===0&&r.readyAt===null)))return false;
   if(!Array.isArray(x.history)||x.history.length!==x.actors.reduce((n,r)=>n+r.casts,0)||x.history.length>8||new Set(x.history.map(h=>h.actionId)).size!==x.history.length||!x.history.every((h,i)=>h&&(i===0||h.at>=x.history[i-1].at)&&(!x.history.slice(0,i).some(p=>p.actor===h.actor)||h.at-x.history.slice(0,i).findLast(p=>p.actor===h.actor).at>=U.interval)&&x.actors.some(r=>r.actor===h.actor&&r.key===h.key)&&Number.isSafeInteger(h.actionId)&&h.actionId>0&&h.actionId<=s.actionSerial&&num(h.at)&&num(h.preparedAt)&&h.preparedAt<=h.at&&s.actors.some(a=>a.id===h.target&&a.side===1)&&['casting','completed','cancelled','blocked'].includes(h.status)&&typeof h.reason==='string'&&h.reason.length<=180&&Number.isFinite(h.damage)&&h.damage>=0&&h.damage<=1e9&& (h.status==='casting'?s.actors.some(a=>a.id===h.actor&&a.action?.id===h.actionId&&a.action.key===h.key&&a.action.cardId===null):!s.actors.some(a=>a.action?.id===h.actionId))))return false;
   return x.actors.every(r=>x.history.filter(h=>h.actor===r.actor).length===r.casts&&r.lastCast===(x.history.findLast(h=>h.actor===r.actor)?.at??null))&&s.events.every(e=>!isUltimate(e.key)||e.ultimate===true&&e.side===0&&e.power===D.cards[e.key].power&&e.kind===D.cards[e.key].kind&&e.time===D.cards[e.key].time&&e.cardId===null&&x.history.some(h=>h.actionId===e.actionId&&h.key===e.key&&h.actor===e.actor&&h.status==='casting'));
  }
  ultimateRow(actor){return this.s.ultimates?.actors.find(r=>r.actor===actor)||null;}
  gainUltimate(actor,amount,stamp,reason){const r=this.ultimateRow(actor);if(!r||this.get(actor)?.hp<=0||r.casts>=U.maxCasts||r.charge>=100||r.seen.includes(stamp))return;r.seen.push(stamp);r.seen=r.seen.slice(-128);r.charge=Math.min(100,r.charge+amount);r.lastGain=reason;if(r.charge===100){r.readyAt=this.s.t;this.log(this.get(actor).name+' · 궁극기 준비 완료');}}
  definition(card){if(isUltimate(card.key))return D.definition(card,this.s.timing);const d=super.definition(card);if(this.s.ultimates?.signatureMode==='guardDance'&&card.key==='serin_dance'&&(!card.actor||card.actor.startsWith('a')))d.power=Number((d.power*.76).toFixed(2));return d;}
  autoTraitPlan(card,target){return isUltimate(card.key)?{factor:1,reasons:[]}:super.autoTraitPlan(card,target);}
  command(side,id,target){const ok=super.command(side,id,target);if(ok&&side===0&&this.s.ultimates)this.s.ultimates.cardsSince=Math.min(U.cardGap,this.s.ultimates.cardsSince+1);return ok;}
  damage(target,amount,side,source,pierce=false,key=null,attackerId=null){
   const actor=this.get(attackerId),r=this.ultimateRow(attackerId),p=r&&U.profiles[r.characterId],eligible=!this.passiveResolving&&!this.ultimateOrigin&&!isUltimate(key),procs=actor?.passiveState?.procs||0;
   const actual=super.damage(target,amount,side,source,pierce,key,attackerId);
   if(eligible&&side===0&&actual>0&&p){if(source==='basic'){this.gainUltimate(actor.id,p.basic,'basic:'+actor.id+':'+this.s.t,'기본 공격 적중');if(p.focus&&actor.passiveState.procs>procs)this.gainUltimate(actor.id,p.focus,'focus:'+actor.passiveState.procs,'집중 적중 추가 사격');}else if(source==='card'&&p.attack)this.gainUltimate(actor.id,p.attack,'attack:'+(actor.action?.id||key+':'+this.s.t),'유효 공격 기술');}
   return actual;
  }
  recordRecap(kind,actor,target,amount,key,shared,cardKey,origin){super.recordRecap(kind,actor,target,amount,key,shared,cardKey,origin);if(amount>0&&!this.ultimateOrigin&&['shield','protect'].includes(kind)){const protector=kind==='protect'?actor:this.s.actors.find(a=>a.side===0&&a.characterId==='serin'&&['serin_parry','serin_cover','serin_dance'].includes(cardKey));const row=protector&&this.ultimateRow(protector.id),p=row&&U.profiles[row.characterId];if(p?.protection){const attacker=this.get(this.visualSource?.actor);this.gainUltimate(protector.id,p.protection,'protect:'+(attacker?.action?.id||attacker?.id+':'+this.s.t),'실제 보호막 흡수·엄호');}}}
  ultimateCheck(actor,target){const s=this.s,r=this.ultimateRow(actor),a=this.get(actor),b=this.get(target);return !!(r&&s.ready&&!s.ended&&!s.paused&&r.charge===100&&r.casts<U.maxCasts&&s.ultimates.cardsSince>=U.cardGap&&(r.lastCast===null||s.t-r.lastCast>=U.interval)&&a?.hp>0&&a.busy<=s.t&&!a.action&&!a.approach&&!s.events.some(e=>e.actor===actor)&&b?.hp>0&&b.side===1);}
  castUltimate(actor,target,reason='현재 손패와 효과·시간 비교'){
   if(!this.ultimateCheck(actor,target))return false;const s=this.s,r=this.ultimateRow(actor),preparedAt=r.readyAt,a=this.get(actor),card={key:r.key,actor,id:null,upgraded:false},d=this.definition(card),prep=this.preparation(card,target,0);
   // Acceptance consumes both resources once; cancellation does not refund them.
   r.charge=0;r.readyAt=null;r.casts++;r.lastCast=s.t;s.ultimates.cardsSince=0;
   this.onCommandAccepted({actor:a,d,prep,target,card});const e={...d,at:s.t+prep,side:0,actor,target,cardId:null,ultimate:true};this.decorateEvent(e);a.busy=e.at+.15;s.events.push(e);s.events.sort((a,b)=>a.at-b.at);
   s.ultimates.history.push({actor,key:r.key,actionId:e.actionId,preparedAt,at:s.t,target,status:'casting',reason,damage:0});this.insight(r.key,'used',1);
   s.due=s.t+d.time;s.span=d.time;s.ready=false;s.paused=false;s.waiting=false;s.pauseReason='';s.selected=null;s.target=null;s.intervening=false;s.autoAt=s.t+.6;
   s.history.push({type:'ultimate',side:0,key:r.key,at:s.t,target,recovery:d.time});s.history=s.history.slice(-150);
   const text='궁극기 · '+d.name+' · '+reason;s.autoLast={at:s.t,key:r.key,target,reason:text};s.autoDecisions.push({at:s.t,policy:s.autoPolicy,key:r.key,target,reason:text});s.autoDecisions=s.autoDecisions.slice(-40);this.log(a.name+' · '+text);return true;
  }
  ultimateCandidates(){return (this.s.ultimates?.actors||[]).flatMap(r=>{const card={key:r.key,actor:r.actor,upgraded:false},target=this.recommend(card);if(!this.ultimateCheck(r.actor,target))return [];const hit=this.eventTarget({...this.definition(card),side:0,actor:r.actor,target,at:this.s.t+this.preparation(card,target,0)});if(!hit||hit.hp<=0||this.guardActive(1,this.s.t+this.preparation(card,target,0)))return [];const safety=this.autoSafety(card,target);return [{actor:r.actor,target,key:r.key,score:this.s.autoPolicy==='balanced'?this.autoScore(card,target):this.policyScore(card,target),tier:safety.tier,reason:safety.reason||'현재 손패보다 유효 피해와 명령 비용 우세'}];}).filter(r=>r.score>0).sort((a,b)=>b.tier-a.tier||b.score-a.score||a.actor.localeCompare(b.actor));}
  // Compare the actual first card; a lower-ranked support card must not veto a lethal interruption.
  ultimateDecision(){const s=this.s,candidates=this.ultimateCandidates(),cards=this.autoCandidates(),candidate=candidates[0],best=cards[0];
   const critical=this.alive(0).some(a=>a.hp/a.max<=.25),modern=s.autoUltimateVersion===1&&s.autoPolicy!=='balanced';
   const urgent=modern?critical&&!!best&&!window.GameCore.offense.includes(best.d.kind)&&this.autoUsefulSupport(best):critical&&cards.some(r=>this.autoUsefulSupport(r));
   const hold=!!this.autoHoldPlan(),reasons=candidates.map(c=>({actor:c.actor,reason:urgent&&(!modern||!best||c.tier<=best.tier)?'urgent':hold&&c.tier<3?'hold':best&&!(c.tier>best.tier||c.tier===best.tier&&c.score>best.score*1.1)?'value':candidate?.actor!==c.actor?'other':'selected'}));
   return {candidate:reasons.find(r=>r.actor===candidate?.actor)?.reason==='selected'?candidate:null,reasons,cards,candidates};
  }
  auto(){const s=this.s;if(s.autoUltimateVersion===1&&s.autoPolicy!=='balanced'){if(s.control==='auto'&&!s.intervening&&!s.paused&&!s.ended&&s.ready&&s.t>=s.autoAt&&s.ultimates){const candidate=this.ultimateDecision().candidate;if(candidate&&this.castUltimate(candidate.actor,candidate.target,candidate.reason))return true;}return super.auto();}
   if(s.control==='auto'&&!s.intervening&&!s.paused&&!s.ended&&s.ready&&s.t>=s.autoAt&&s.ultimates){const ultimate=this.ultimateCandidates()[0],cards=this.autoCandidates(),best=cards[0],urgent=this.alive(0).some(a=>a.hp/a.max<=.25)&&cards.some(r=>this.autoUsefulSupport(r));if(ultimate&&!urgent&&!(this.autoHoldPlan()&&ultimate.tier<3)&&(!best||ultimate.tier>best.tier||ultimate.tier===best.tier&&ultimate.score>best.score*1.1)&&this.castUltimate(ultimate.actor,ultimate.target,ultimate.reason))return true;}return super.auto();}
  resolveEffect(e){const previous=this.ultimateOrigin;this.ultimateOrigin=previous||e.ultimate===true;const before=this.s.stats.damage[0];try{super.resolveEffect(e);if(e.side===0&&!e.signatureFollow&&e.key==='serin_dance'&&this.s.ultimates?.signatureMode==='guardDance'&&this.s.stats.damage[0]>before){const a=this.get(e.actor);if(a.hp>0){const old=this.insightKey;this.insightKey=e.key;try{this.applyEffect(a,'ward',20,e.at+3);}finally{this.insightKey=old;}this.emitVisual('protect',a,a,{key:e.key});}}}finally{if(e.ultimate){const h=this.s.ultimates.history.find(h=>h.actionId===e.actionId);if(h)h.damage+=Math.max(0,this.s.stats.damage[0]-before);}this.ultimateOrigin=previous;}}
  endAction(a,status,reason='',notify=true){const id=a.action?.id;super.endAction(a,status,reason,notify);const h=this.s.ultimates?.history.find(h=>h.actionId===id);if(h){h.status=status;h.reason=reason||h.reason;}}
  recordKO(a,cause,protectedAlly){super.recordKO(a,cause,protectedAlly);const r=this.ultimateRow(a.id);if(r){r.charge=0;r.readyAt=null;}}
  ultimateSummary(){return this.s.ultimates?copy({version:1,signatureMode:this.s.ultimates.signatureMode,actors:this.s.ultimates.actors.map(({actor,characterId,key,charge,casts,readyAt})=>({actor,characterId,key,charge,casts,readyAt})),history:this.s.ultimates.history}):null;}
 }
 window.CharacterBattle=UltimateBattle;
})();
