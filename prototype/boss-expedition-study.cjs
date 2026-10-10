'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm'),copy=x=>JSON.parse(JSON.stringify(x)),ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','trial-character','content-authoring','support-content','ultimate-data','strategy-encounters','expedition-growth','presentation-data','actor-ai','engine','campaign','character-engine','ultimate-engine','ultimate-diagnostics','discovery','character-campaign','content-catalog','reward-impact','battle-practice'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);
const W=ctx.window,{CharacterCampaign:C,CharacterData:K,GameData:D,RewardImpact:I}=W,rows=[];
for(const preset of K.startingDecks)for(const support of ['medic','noa'])for(const ranger of ['ranger','ria'])for(const path of ['growth','recovery','prepared'])for(const bossId of ['fall','network']){
 let seed=1;while(K.bossForSeed(seed)!==bossId)seed++;const c=new C.Campaign(),party=W.TrialCharacter.party(ranger);party[3].characterId=support;c.meta.levels=[3,3,3,3];c.meta.extraProgress.ria.level=c.meta.extraProgress.noa.level=3;c.start(seed,W.SupportContent.template(W.TrialCharacter.template(preset.template,ranger),support),null,party);
 for(let turn=0;c.run&&turn<70;turn++){const r=c.run;
  if(r.stage==='map'){const n=r.map[r.depth].find(n=>n.type===(path==='growth'?r.depth===1?'upgrade':'elite':path==='prepared'&&r.depth===1?'upgrade':'heal'))||r.map[r.depth][0];c.enter(n.id);}
  else if(r.stage==='battle'){for(let i=0;i<10000&&!c.battle.s.ended;i++)c.battle.step(.02);assert(c.battle.s.ended);c.observe();}
  else if(r.stage==='result'){if(r.eliteBenefit?.status==='pending')c.elitePerk('heal');c.reward();}
  else if(r.stage==='camp')c.camp(path==='recovery'?'heal':'card');
  else if(r.stage==='upgrade'){const id=r.deck.find(id=>!r.pool.find(x=>x.id===id).upgraded);id?c.evolve(id):c.skip();}
  else if(r.stage==='reward'){const deck=r.deck.map(id=>r.pool.find(x=>x.id===id)),score=k=>(r.reward.reasons[k].startsWith('최종 상대')?6:0)+(D.cards[k].traits.includes(preset.id)?3:0)+(!deck.some(x=>x.key===k)?2:0);const key=[...r.reward.candidates].sort((a,b)=>score(b)-score(a)||a.localeCompare(b))[0];key?c.pick(key):c.skip();}
  else if(r.stage==='loot'){const out=I.safeReplacement(r.deck.map(id=>r.pool.find(x=>x.id===id)),r.pool.find(x=>x.id===r.reward.cardId));if(out)c.swap(out.id);c.next();}
  else c.next();C.validate(c.snapshot());
 }assert(!c.run);const h=c.meta.history[0],final=h.results.find(x=>x.practice.config.depth===5);assert.equal(h.bossId,bossId);if(final)assert.equal(final.name,K.expeditionBosses[bossId].name);rows.push({preset:preset.id,support,ranger,path,bossId,seed,success:h.success,reachedBoss:!!final,rooms:h.rooms,finalHP:h.results.at(-1).hp.reduce((n,h)=>n+h,0),failure:h.results.find(x=>x.winner!==0)?.name||null,finalDeck:h.finalDeck.map(x=>({key:x.key,upgraded:x.upgraded})),fights:h.results.map(x=>({name:x.name,winner:x.winner,hp:x.hp}))});
}
const summary=['fall','network'].map(bossId=>{const a=rows.filter(x=>x.bossId===bossId);return {bossId,runs:a.length,reachedBoss:a.filter(x=>x.reachedBoss).length,wins:a.filter(x=>x.success).length,path:['growth','recovery','prepared'].map(path=>({path,wins:a.filter(x=>x.path===path&&x.success).length,total:a.filter(x=>x.path===path).length}))};});
fs.writeFileSync(__dirname+'/boss-expedition-results.json',JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary,null,2));
