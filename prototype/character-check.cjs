'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const context=vm.createContext({window:{}});
for(const file of ['data.js','character-data.js','actor-ai.js','engine.js','campaign.js','character-engine.js','character-campaign.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context,{filename:file});
const D=context.window.GameData,K=context.window.CharacterData,C=context.window.CharacterCampaign,B=context.window.CharacterBattle;
const copy=x=>JSON.parse(JSON.stringify(x));
// These identity/effect fixtures retain the legacy four-card reward schedule.
// New room proposals and real expeditions are covered by reward-growth-check.cjs.
const originalStart=C.Campaign.prototype.start;C.Campaign.prototype.start=function(...args){const ok=originalStart.apply(this,args);if(this.run){delete this.run.rewardRulesVersion;this.run.encounterVersion=2;this.run.routeVersion=1;this.run.map=C.map(this.run.seed,1);}return ok;};
// Isolated effect fixtures retain the original shield enemy's mitigation; expedition tests use current encounters.
function battle(seed=1){const c=new C.Campaign();c.start(seed);c.run.encounterVersion=1;delete c.run.routeVersion;delete c.run.eliteBenefit;c.run.map=C.map(seed);c.enter(c.run.map[0][0].id);return c.battle;}
function settle(b,until){for(let i=0;i<20000&&b.s.t<until&&!b.s.ended;i++){if(b.s.paused)b.resumeAuto();b.step(.02);}}
function freezeBasics(b){b.s.enemyDue=1000;for(const a of b.s.actors){a.cool=1000;a.busy=1000;}b.s.due=1000;}
function event(key,b,target){return {...D.definition({key}),side:0,actor:'a1',target,at:b.s.t,cardId:'test'};}
{
  assert.equal(K.validateTemplate(K.starter),'');assert(K.validateTemplate({...K.starter,serin_cover:1}));
  const c=new C.Campaign();c.start(1);assert.equal(c.run.rulesVersion,2);assert.equal(c.run.deck.length,20);assert.equal(c.run.pool.filter(c=>c.source==='reward').length,0);assert.equal(c.run.pool.filter(c=>c.characterId==='serin').length,5);C.validate(c.snapshot());
  c.enter(c.run.map[0][0].id);C.validate(c.snapshot());c.battle.intervene();const saved=c.snapshot(),reloaded=new C.Campaign(copy(C.validate(saved)));assert.equal(reloaded.battle.s.paused,true);assert.equal(reloaded.battle.s.control,'auto');reloaded.battle.resumeAuto();const original=new B({},reloaded.battle.snapshot()),restored=new B({},original.snapshot());for(let i=0;i<700&&!original.s.ended;i++){original.step(.02);restored.step(.02);}assert.deepEqual(original.snapshot(),restored.snapshot());
}
{
  const b=battle();freezeBasics(b);const a=b.get('a1'),target=b.get('e0');target.hp=target.max=300;a.busy=0;const before=target.hp;b.resolve(event('serin_dance',b,target.id));settle(b,.4);assert.equal(b.s.stats.signatureHits,3);assert(Math.abs(before-target.hp-63*.7)<1e-8);assert.equal(b.s.history.length,0,'effect continuation does not spend extra commands');
  const blocked=battle();freezeBasics(blocked);blocked.s.guards[1]={n:1,until:10};blocked.resolve(event('serin_dance',blocked,'e0'));assert.equal(blocked.s.events.length,0);assert.equal(blocked.s.stats.blocked[1],1);assert.equal(blocked.s.stats.signatureHits,0);
  const midway=battle();freezeBasics(midway);midway.get('e0').hp=midway.get('e0').max=300;midway.resolve(event('serin_dance',midway,'e0'));midway.s.guards[1]={n:1,until:10};settle(midway,.4);assert.equal(midway.s.stats.signatureHits,1);assert.equal(midway.s.events.length,0);assert.equal(midway.s.stats.blocked[1],1,'new defense blocks remaining hits of the same command');
  const chain=battle();freezeBasics(chain);chain.get('e0').hp=10;chain.resolve(event('serin_chain',chain,'e0'));assert.equal(chain.get('e0').hp,0);assert.equal(chain.s.events.length,1);settle(chain,.3);assert.equal(chain.s.stats.chainHits,1);assert.equal(chain.get('a1').purpose.kind,'chase');assert.equal(chain.s.events.length,0,'additional pursuit cannot recurse');
}
{
  const b=battle();freezeBasics(b);const a=b.get('a1'),ally=b.get('a3'),enemy=b.get('e1');b.resolve(event('serin_cover',b,ally.id));assert.equal(a.purpose.kind,'cover');assert(Math.hypot(a.x-ally.x,a.y-ally.y)<70);const allyHP=ally.hp,serinHP=a.hp,enemyHP=enemy.hp;b.damage(ally,40,1,'basic',false,null,enemy.id);assert.equal(allyHP-ally.hp,9,'shield absorbs 28 before remaining 12 is shared by 25%');assert.equal(serinHP-a.hp,3);assert.equal(enemyHP-enemy.hp,22);assert.equal(b.s.stats.covered,3);assert.equal(b.s.stats.counters,1);b.damage(ally,1,1,'basic',false,null,enemy.id);assert.equal(b.s.stats.counters,1);a.busy=0;ally.x=350;settle(b,3);assert(Math.hypot(a.x-ally.x,a.y-ally.y)<100,'cover follows its moving ally instead of chasing enemies');settle(b,6);assert(!a.purpose);assert.equal(a.stance,1);
  const parry=battle();freezeBasics(parry);parry.resolve(event('serin_parry',parry,'a1'));const e=parry.get('e1'),hp=e.hp;parry.damage(parry.get('a1'),10,1,'card',false,'shot',e.id);assert.equal(hp-e.hp,25);assert.equal(parry.s.stats.counters,1);parry.get('a1').hp=0;parry.basics(.02);assert(!parry.get('a1').purpose);
}
function expedition(seed,choice,mode='auto',risk=false){const c=new C.Campaign();c.meta.settings.control=mode;c.start(seed);let fights=0;
  for(let turns=0;c.run&&turns<100;turns++){
    const r=c.run;
    if(r.stage==='map')c.enter((risk&&r.depth===1?r.map[r.depth].find(n=>n.type==='upgrade'):!risk&&r.depth===4?r.map[r.depth].find(n=>n.type==='heal'):r.map[r.depth][0]).id);
    else if(r.stage==='battle'){const b=c.battle;for(let i=0;i<20000&&!b.s.ended;i++){if(b.s.paused&&b.s.ready){const card=b.s.decks[0].hand.map(c=>({c,target:b.recommend(c)})).sort((x,y)=>b.autoScore(y.c,y.target)-b.autoScore(x.c,x.target))[0];if(card&&b.autoScore(card.c,card.target)>0){b.select(card.c.id);assert(b.confirm());}else b.wait();}else b.step(.05);}assert(b.s.ended,'real battle must finish');fights++;c.observe();}
    else if(r.stage==='result')c.reward();else if(r.stage==='camp')c.camp('card');
    else if(r.stage==='reward'){if(r.reward.candidates.includes(choice))assert(c.pick(choice));else assert(c.skip());}
    else if(r.stage==='loot'){const out=r.deck.find(id=>r.pool.find(c=>c.id===id).key==='serin_cut')||r.deck.find(id=>r.pool.find(c=>c.id===id).key==='serin_parry')||r.deck.find(id=>r.pool.find(c=>c.id===id).key==='serin_dash');if(out)c.swap(out);c.next();}
    else if(r.stage==='upgrade'){const card=r.deck.find(id=>!r.pool.find(c=>c.id===id).upgraded);card?c.evolve(card):c.skip();}
    else if(r.stage==='done')c.next();C.validate(c.snapshot());
  }
  assert(!c.run);return c;
}
{
  const results=[];for(const choice of ['serin_chain','serin_cover'])for(const mode of ['auto','manual']){const runs=Array.from({length:8},(_,i)=>expedition(i+1,choice,mode)),battles=runs.flatMap(c=>c.meta.history[0].results);const row={choice,mode,wins:runs.filter(c=>c.meta.history[0].success).length,runs:8,chainHits:battles.reduce((n,b)=>n+b.stats.chainHits,0),covered:+battles.reduce((n,b)=>n+b.stats.covered,0).toFixed(1),counters:battles.reduce((n,b)=>n+b.stats.counters,0),signatureHits:battles.reduce((n,b)=>n+b.stats.signatureHits,0)};results.push(row);console.log(JSON.stringify(row));assert(battles.some(b=>b.stats.cards[0][choice]),'chosen rewards are actually used');assert(row.signatureHits>0);}
  assert(results.filter(r=>r.choice==='serin_chain').some(r=>r.chainHits>0));assert(results.filter(r=>r.choice==='serin_cover').some(r=>r.covered>0));
}
{
  const c=new C.Campaign();c.start(3);c.enter(c.run.map[0][0].id);c.battle.get('a1').hp=0;c.battle.refill(0);assert(!c.battle.s.decks[0].hand.some(card=>card.actor==='a1'));c.battle.s.winner=0;c.battle.s.ended=true;c.observe();c.reward();c.pick('serin_cover');assert(c.run.pool.some(card=>card.source==='reward'));c.run.pool[0].upgraded=true;const template=copy(c.meta.template);assert(c.finish(false));assert.equal(c.run,null);assert.deepEqual(copy(c.meta.template),template);assert(c.meta.discovered.includes('serin_cover'));c.start(7);assert(c.run.pool.every(card=>card.source==='base'&&!card.upgraded));assert(!c.run.pool.some(card=>card.key==='serin_cover'));assert(K.validateTemplate({...c.meta.template,serin_cover:1}));
  const completed=expedition(1,'serin_chain');completed.start(9);assert(completed.run.pool.every(c=>c.source==='base'&&!c.upgraded));
  const failed=new C.Campaign();failed.start(2);failed.enter(failed.run.map[0][0].id);const xp=copy(failed.meta.xp);for(const a of failed.battle.alive(0))a.hp=0;failed.battle.checkEnd();assert(failed.observe());assert.equal(failed.run,null);assert.deepEqual(copy(failed.meta.xp),xp);assert.equal(failed.meta.history[0].success,false);failed.start(4);assert(failed.run.pool.every(c=>c.source==='base'&&!c.upgraded));
  let riskWins=0;for(let i=1;i<=8;i++){const risk=expedition(i,i%2?'serin_chain':'serin_cover','auto',true);riskWins+=risk.meta.history[0].success?1:0;assert.equal(risk.meta.history[0].evolved,1);C.validate(risk.snapshot());}console.log(JSON.stringify({route:'upgrade-and-elite',runs:8,wins:riskWins}));
  const save=c.snapshot();for(const change of [d=>d.run.pool[0].source='reward',d=>d.run.pool[0].characterId='serin',d=>d.run.rulesVersion=1,d=>d.meta.template.serin_chain=1,d=>d.run.hp[0]=-1,d=>d.run.map[0][0].type='checkpoint',d=>d.run.pool.push(copy(d.run.pool[0]))]){const bad=copy(save);change(bad);assert.throws(()=>C.validate(bad));}
}
console.log('PASS: character identity/base ownership, run-only rewards/evolution, 3-hit signature/full-card block, bounded pursuit, protective movement/redirect/exact attacker counter, manual/auto expeditions, deterministic saved continuation, successful and abandoned reset, invalid saves.');
module.exports={D,K,C,B,battle,expedition};

