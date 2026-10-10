'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),copy=x=>JSON.parse(JSON.stringify(x)),ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','trial-character','content-authoring','support-content','ultimate-data','strategy-encounters','expedition-growth','presentation-data','actor-ai','engine','campaign','character-engine','ultimate-engine','ultimate-diagnostics','discovery','character-campaign','content-catalog','reward-impact','battle-practice','expedition-flow'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);
const W=ctx.window,{CharacterCampaign:C,CharacterData:K}=W;
const observed=new Set();for(let seed=1;seed<=40;seed++){
 const c=new C.Campaign();assert(c.start(seed));observed.add(c.run.bossId);assert.equal(c.run.map.length,6);assert.deepEqual(copy(c.run.map),copy(C.map(seed,3)));const before=copy(c.snapshot()),p=c.finalBoss();assert.equal(p.name,K.expeditionBosses[c.run.bossId].name);assert.equal(p.responses.length,2);assert(p.threat);assert.deepEqual(copy(c.snapshot()),before,'read-only public preview');C.validate(c.snapshot());const restored=new C.Campaign(C.validate(copy(c.snapshot())));assert.deepEqual(copy(restored.finalBoss()),copy(p));
 for(const mutate of [x=>x.run.bossRulesVersion=2,x=>x.run.bossId='missing',x=>x.run.bossId='toString',x=>x.run.bossId=c.run.bossId==='fall'?'network':'fall']){const invalid=copy(before);mutate(invalid);assert.throws(()=>C.validate(invalid));}
 c.enter(c.run.map[0][0].id);for(let i=0;i<50;i++)c.battle.step(.02);const saved=copy(c.snapshot()),resume=new C.Campaign(C.validate(copy(saved)));for(let i=0;i<10000&&!c.battle.s.ended;i++){c.battle.step(.02);resume.battle.step(.02);}assert.deepEqual(copy(c.battle.snapshot()),copy(resume.battle.snapshot()));c.observe();c.finish(false);C.validate(c.snapshot());assert.equal(c.meta.history[0].bossId,before.run.bossId);assert.equal(c.meta.history[0].results[0].practice.config.bossId,before.run.bossId);const session=new W.BattlePractice.Session(c.meta.history[0].results[0]);assert(session.start());
 const bad=copy(c.snapshot());bad.meta.history[0].bossId=before.run.bossId==='fall'?'network':'fall';assert.throws(()=>C.validate(bad));
}
assert.equal(observed.size,2);
// Old ongoing runs and challenges retain their previous boss, map and random streams.
const old=new C.Campaign();old.start(37);delete old.run.bossRulesVersion;delete old.run.bossId;assert.equal(old.finalBoss(),null);assert.deepEqual(copy(old.baseEncounter(old.run.map[5][0])),copy(K.strategyBoss));C.validate(old.snapshot());const resumed=new C.Campaign(C.validate(copy(old.snapshot())));assert.equal(resumed.run.bossRulesVersion,undefined);assert.equal(resumed.finalBoss(),null);
const challenge=new C.Campaign();challenge.meta.wins=1;challenge.start(7,K.starter,'siege');assert.equal(challenge.run.bossRulesVersion,undefined);assert.equal(challenge.finalBoss(),null);C.validate(challenge.snapshot());
// Boss record cannot silently be replayed against another final enemy.
const c=new C.Campaign();c.start(7);const boss=c.run.map[5][0];c.run.depth=5;c.createBattle(boss);assert(C.validBattleRecord(c.run.battleStart));const bad=copy(c.run.battleStart);bad.config.bossId=c.run.bossId==='fall'?'network':'fall';assert(!C.validBattleRecord(bad));
// Camp's actual growth-offer provider uses the already-public final enemy, not an assumed fall boss.
let networkOffer=false;for(let seed=1;seed<=40;seed++){
 const c=new C.Campaign();c.start(seed);c.run.depth=3;c.run.current=c.run.map[3][0];c.run.stage='camp';const before=copy(c.snapshot()),offers=W.ExpeditionGrowth.offers(c.run);assert.deepEqual(copy(c.snapshot()),before);assert(offers.candidates.length<=4);assert(offers.candidates.every(k=>K.rewardOptions(c.run).includes(k)));const key=offers.candidates.find(k=>offers.reasons[k].startsWith('최종 상대'));
 if(key&&c.run.bossId==='network'){assert(['serin_dash','serin_chain','volley','ranger_line','guard'].includes(key));networkOffer=true;}
 delete c.run.bossRulesVersion;delete c.run.bossId;const previous=W.ExpeditionGrowth.offers(c.run);assert(!Object.values(previous.reasons).some(s=>s.startsWith('최종 상대')));
}assert(networkOffer);
console.log('PASS two deterministic public bosses, unchanged six-room route/random stream, pure early disclosure and actual camp offers, exact save/replay/report versions, invalid mismatches, old ongoing and challenge bosses retained');
