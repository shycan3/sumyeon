'use strict';
(async()=>{
 const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('제작 모듈을 읽지 못했습니다: '+src));document.head.append(s);});
 try{
  for(const f of ['data','character-data','trial-character','content-authoring'])await load(f+'.js?v=authoring4');
  const response=await fetch('content-support-template.json?v=authoring4');if(!response.ok)throw Error('지원가 제작 정의를 읽지 못했습니다.');const recipe=window.ContentAuthoring.register(await response.json()),K=window.CharacterData;
  // These adapters exist on this isolated page only; normal registration and saves are untouched.
  window.SupportContent={authoring:true,version:0};K.saveKey='afterglow-authoring-support-v1';const defaultParty=K.defaultParty,originalTemplate=window.TrialCharacter.template;
  K.defaultParty=()=>{const party=defaultParty();party[recipe.partySlot].characterId=recipe.character.id;return party;};
  for(const key of K.characters[3].base.concat(K.characters[3].reward))K.setCasterRule(key,{characterId:'medic'});
  const basicPool=K.basicPool;K.basicPool=()=>basicPool().filter(c=>!K.characters[3].base.includes(c.key));
  const concept=K.startingConcept;K.startingConcept=t=>{const original={...t};for(const x of recipe.startingReplacements)if(original[x.to]){original[x.from]=(original[x.from]||0)+original[x.to];delete original[x.to];}return concept(original);};
  window.TrialCharacter.template=(t,id)=>window.ContentAuthoring.template(originalTemplate(t,id),recipe);
  for(const src of JSON.parse(document.getElementById('lab-runtime').textContent)){
   if(src.startsWith('character-app.js')){const C=window.CharacterCampaign,fresh=C.fresh,start=C.Campaign.prototype.start;C.fresh=(levels)=>{const data=fresh(levels);data.meta.template=window.ContentAuthoring.template(data.meta.template,recipe);return data;};C.Campaign.prototype.start=function(seed,template,challenge,party){if(challenge)return false;return start.call(this,seed,template,challenge,party);};}
   await load(src);
  }
  window.SupportAuthoringLab={recipe,version:1};
 }catch(e){document.getElementById('content').textContent='제작 체험을 시작하지 못했습니다. '+e.message;}
})();
