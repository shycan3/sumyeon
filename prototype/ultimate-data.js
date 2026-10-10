'use strict';
(() => {
 const D=window.GameData,K=window.CharacterData;
 // These effect definitions reuse execution, but never enter a deck/reward pool.
 Object.assign(D.cards,{
  serin_ultimate:{name:'새벽을 여는 검무',role:1,kind:'attack',power:38,time:7,prep:.4,dash:true,limit:0,source:'ultimate',traits:['pursuit'],purposeMode:'replace',desc:'게이지 100과 공유 명령 소비 · 접근 후 38 피해씩 2타 · 손패 미소비'},
  ria_ultimate:{name:'흔들림 없는 한 발',role:2,kind:'pierce',power:72,time:8,prep:.8,limit:0,source:'ultimate',traits:['pursuit'],purposeMode:'compatible',desc:'게이지 100과 공유 명령 소비 · 피해 감소를 무시하는 피해 72 · 보호막과 차단은 유효 · 손패 미소비'}
 });
 K.registerSkill('serin_ultimate',{type:'comboStrike',target:'enemy',offsets:[.28],recovery:.6,reason:'준비한 검무 2타'});
 const profiles=Object.freeze({
  serin:Object.freeze({key:'serin_ultimate',basic:5,attack:20,protection:15,desc:'기본 적중 +5 · 유효 공격 기술 +20 · 실제 보호막 흡수/엄호 +15. 한 기술의 연속 타격은 한 번만 축적.'}),
  ria:Object.freeze({key:'ria_ultimate',basic:10,focus:15,desc:'기본 적중 +10 · 같은 적 3회 적중의 추가 사격 +15. 카드 사격은 조준 게이지를 채우지 않음.'})
 });
 function validConfig(c){return (c.autoUltimateVersion===undefined||[0,1].includes(c.autoUltimateVersion))&&(c.autoUltimateVersion!==1||c.ultimateRulesVersion===1)&&( !c.encounter?.enemies?.some(e=>e.cards?.some(k=>D.cards[k]?.source==='ultimate')))&&( c.ultimateRulesVersion===undefined||[0,1].includes(c.ultimateRulesVersion))&&(c.ultimateRulesVersion===1?c.identityVersion===1&&K.validParty(c.party)&&['standard','guardDance'].includes(c.signatureMode||'standard')&&((c.signatureMode||'standard')==='standard'||c.party.some(p=>p.characterId==='serin')):c.signatureMode===undefined||c.signatureMode==='standard');}
 function validSummary(x,t,actors,c){if(x===undefined)return c?.ultimateRulesVersion!==1;if(!c||c.ultimateRulesVersion!==1||!validConfig(c)||x?.version!==1||x.signatureMode!==(c.signatureMode||'standard'))return false;const expected=c.party.flatMap(p=>profiles[p.characterId]?[{actor:'a'+p.slot,characterId:p.characterId,key:profiles[p.characterId].key}]:[]),at=n=>Number.isFinite(n)&&n>=0&&n<=t;
  return Array.isArray(x.actors)&&x.actors.length===expected.length&&x.actors.every((r,i)=>r&&r.actor===expected[i].actor&&r.characterId===expected[i].characterId&&r.key===expected[i].key&&Number.isInteger(r.charge)&&r.charge>=0&&r.charge<=100&&Number.isInteger(r.casts)&&r.casts>=0&&r.casts<=2&&(r.readyAt===null?r.charge<100:r.charge===100&&at(r.readyAt)))&&Array.isArray(x.history)&&x.history.length===x.actors.reduce((n,r)=>n+r.casts,0)&&new Set(x.history.map(h=>h.actionId)).size===x.history.length&&x.history.every(h=>h&&x.actors.some(r=>r.actor===h.actor&&r.key===h.key)&&Number.isSafeInteger(h.actionId)&&h.actionId>0&&at(h.at)&&at(h.preparedAt)&&h.preparedAt<=h.at&&actors?.some(a=>a.id===h.target&&a.side===1)&&['completed','cancelled','blocked'].includes(h.status)&&typeof h.reason==='string'&&h.reason.length<=180&&Number.isFinite(h.damage)&&h.damage>=0&&h.damage<=1e9)&&x.actors.every(r=>x.history.filter(h=>h.actor===r.actor).length===r.casts);}
 window.UltimateData={validSummary,profiles,maxCasts:2,interval:18,cardGap:2,validConfig};
})();
