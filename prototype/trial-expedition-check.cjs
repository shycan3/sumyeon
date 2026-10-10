'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),ctx=vm.createContext({window:{}}),copy=x=>JSON.parse(JSON.stringify(x));
for(const f of ['data','character-data','trial-character','strategy-encounters','expedition-growth','actor-ai','engine','campaign','character-engine','character-campaign','reward-impact','deployment-study','battle-practice'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);
const {CharacterData:K,CharacterCampaign:C,TrialCharacter:T,RewardImpact:I,BattlePractice:P}=ctx.window,rows=[];
for(const preset of K.startingDecks)for(const seed of [7,37]){
 const c=new C.Campaign(C.fresh([5,5,5,5]));c.meta.extraProgress.ria={level:5,xp:0};assert(c.start(seed,T.template(preset.template,'ria'),null,T.party('ria')));
 for(let step=0;c.run&&step<60;step++){
  const r=c.run;if(r.stage==='map'){const node=r.map[r.depth].find(n=>n.type==='heal')||r.map[r.depth][0];c.enter(node.id);}
  else if(r.stage==='battle'){for(let i=0;i<10000&&!c.battle.s.ended;i++)c.battle.step(.02);assert(c.battle.s.ended);c.observe();}
  else if(r.stage==='result'){if(r.eliteBenefit?.status==='pending')c.elitePerk('heal');c.reward();}
  else if(r.stage==='camp')c.camp('card');
  else if(r.stage==='reward'){const key=r.reward.candidates.find(k=>k.startsWith('ria_'))||r.reward.candidates[0];if(key){assert(c.pick(key));const incoming=r.pool.find(card=>card.id===r.reward.cardId),out=I.safeReplacement(r.deck.map(id=>r.pool.find(card=>card.id===id)),incoming);if(out)assert(c.swap(out.id));}else c.skip();}
  else if(r.stage==='upgrade'){const id=r.deck.find(id=>!r.pool.find(card=>card.id===id).upgraded);id?c.evolve(id):c.skip();}
  else if(['done','loot'].includes(r.stage))c.next();else throw Error('Unexpected stage '+r.stage);
  C.validate(c.snapshot());
 }
 assert(!c.run);const report=c.meta.history[0];assert(report.results.every(r=>r.passives?.some(p=>p.characterId==='ria')));const result=report.results[0],practice=new P.Session(result);assert(practice.usePreset(preset.id));assert(practice.pool.some(c=>c.key==='ria_focus')||preset.id==='resonance');assert(practice.start());assert.equal(practice.battle.get('a2').characterId,'ria');assert.deepEqual(new C.Campaign(copy(c.snapshot())).snapshot(),c.snapshot());
 rows.push({preset:preset.id,seed,success:report.success,cards:report.cards,procs:report.results.map(r=>r.passives[0].procs),casts:report.results.map(r=>r.stats.cards[0]),levels:c.meta.levels,ria:c.meta.extraProgress.ria});
}
assert(rows.some(r=>r.cards.some(k=>k==='ria_burst'||k==='ria_cover')));assert(rows.some(r=>r.casts.some(row=>row.ria_burst||row.ria_cover)));fs.writeFileSync(__dirname+'/trial-expedition-results.json',JSON.stringify(rows,null,2));console.log('PASS 6 complete trial expeditions: actual offers/acquisition/swap/casts/growth reports/save restore/party-aware practice presets; clears',rows.filter(r=>r.success).length);
