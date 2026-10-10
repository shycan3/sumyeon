'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),copy=x=>JSON.parse(JSON.stringify(x));
function context(discovery=true){const ctx=vm.createContext({window:{}});for(const f of ['data','character-data','trial-character','content-authoring','support-content','ultimate-data','strategy-encounters','expedition-growth','presentation-data','actor-ai','engine','campaign','character-engine','ultimate-engine','ultimate-diagnostics',...(discovery?['discovery']:[]),'character-campaign','content-catalog','reward-impact','battle-practice'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);return ctx.window;}
const W=context(),C=W.CharacterCampaign,K=W.CharacterData,V=W.Discovery;
assert(V.valid(V.fresh()));assert(!V.valid({...V.fresh(),policies:['attack','attack']}));assert(!V.valid({...V.fresh(),rewards:['heal']}));
const row=(key,amount)=>({[key]:{used:1,damage:amount,healed:0,shield:0,blocks:0,shared:0,moved:0}});
const fixture={results:[{name:'시험 교전',winner:0,autoPolicy:'attack',practice:{config:{control:'auto'}},traits:{enabled:true,keys:Object.keys(W.GameData.cards).filter(k=>W.GameData.cards[k].traits.includes('pursuit')).slice(0,4),stats:{pursuit:1}},insights:{rows:{...row('serin_dance',24),...row('serin_chain',10)}}}]};
assert.equal(W.CardTraits.summary(fixture.results[0].traits.keys).find(t=>t.id==='pursuit').level,2);
const meta={};assert.deepEqual(copy(V.record(meta,fixture)),['trait','reward']);assert(V.valid(meta.discovery));assert.equal(meta.discovery.moments[0].characterId,'serin');
const before=copy(meta);assert.deepEqual(copy(V.record(meta,fixture)),[]);assert.deepEqual(copy(meta),before);
const second=copy(fixture);second.results[0].autoPolicy='protect';assert.deepEqual(copy(V.record(meta,second)),['policy']);
const manual=copy(fixture);manual.results[0].practice.config.control='manual';const manualMeta={};V.record(manualMeta,manual);assert.equal(manualMeta.discovery.policies.length,0);
const cancelled=copy(fixture);for(const r of Object.values(cancelled.results[0].insights.rows))r.damage=0;const empty={};V.record(empty,cancelled);assert.equal(empty.discovery.moments.length,0);assert.equal(empty.discovery.rewards.length,0);
const failed=copy(fixture);failed.results[0].winner=1;const failure={};V.record(failure,failed);assert.equal(failure.discovery.traits.length,0);assert.equal(failure.discovery.policies.length,0);assert.equal(failure.discovery.rewards.length,1);
const invalid=copy(meta.discovery);invalid.moments[0].characterId='ria';assert(!V.valid(invalid));invalid.moments[0].characterId='serin';invalid.moments[0].amount=Infinity;assert(!V.valid(invalid));assert(!V.validReport(['trait','trait']));assert(!V.validReport(['unknown']));
// Actual completed combats, save restoration, retained records, and no combat/stat change.
const old=context(false),a=new C.Campaign(),b=new old.CharacterCampaign.Campaign();a.meta.levels=b.meta.levels=[3,3,3,3];const template=K.startingDecks[2].template;assert(a.start(7,template));assert(b.start(7,template));a.enter(a.run.map[0][0].id);b.enter(b.run.map[0][0].id);
for(let i=0;i<10000&&!a.battle.s.ended;i++){a.battle.step(.02);b.battle.step(.02);}assert(a.battle.s.ended);assert.deepEqual(copy(a.battle.snapshot()),copy(b.battle.snapshot()));a.observe();b.observe();a.finish(false);b.finish(false);assert.deepEqual(copy(a.meta.levels),copy(b.meta.levels));assert.deepEqual(copy(a.meta.xp),copy(b.meta.xp));assert(V.valid(a.meta.discovery));C.validate(a.snapshot());
const restored=new C.Campaign(C.validate(copy(a.snapshot())));assert.deepEqual(copy(restored.meta.discovery),copy(a.meta.discovery));const migrated=copy(b.snapshot());assert(!migrated.meta.discovery);const migration=new C.Campaign(C.validate(migrated));assert.deepEqual(copy(migration.meta.discovery),copy(a.meta.discovery));
const ledger=copy(a.meta.discovery);for(let i=0;i<11;i++){a.start(i+20);a.finish(false);}assert.equal(a.meta.history.length,10);assert.deepEqual(copy(a.meta.discovery),ledger);C.validate(a.snapshot());
const bad=copy(a.snapshot());bad.meta.discovery.policies=['attack','attack'];assert.throws(()=>C.validate(bad));
const practice=new W.BattlePractice.Session(b.meta.history[0].results[0]),permanent=copy(restored.meta.discovery);practice.start();for(let i=0;i<10000&&!practice.battle.s.ended;i++)practice.battle.step(.02);assert.deepEqual(copy(restored.meta.discovery),permanent);
console.log('PASS evidence-based goals/scenes, cancellation/failure, idempotence, owner/save validation, old-history migration, retention beyond 10 reports, practice isolation, exact combat/stat parity');


