'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),ctx=vm.createContext({window:{}});
for(const f of ['data.js','character-data.js','actor-ai.js','engine.js','campaign.js','character-engine.js','character-campaign.js','card-visuals.js','battle-insights.js','battle-practice.js','result-story.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx,{filename:f});
const {CharacterCampaign:C,CharacterBattle:B,ResultStory:S}=ctx.window,copy=x=>JSON.parse(JSON.stringify(x));
const c=new C.Campaign();c.start(1);c.run.hp=c.run.hp.map(()=>1);c.enter(c.run.map[0][0].id);
for(let i=0;i<12000&&!c.battle.s.ended;i++)c.battle.step(.02);
const r=C.summarizeBattle(c.battle,c.run.battleStart),analysis=S.analyze(r,c.run.initialDeck);
assert.equal(r.winner,1);assert(r.recap.events.some(e=>e.kind==='heal'&&e.origin==='basic'));
assert(r.recap.events.some(e=>e.kind==='ko'&&e.origin==='enemy'));
assert(analysis.moments.some(e=>e.text.includes('기본 행동')));
assert(analysis.moments.every(e=>!e.failure&&!e.text.includes('아군 전투불능')));
assert.equal(analysis.setbacks.length,2);assert(analysis.setbacks.every(e=>e.failure&&e.text.includes('아군 전투불능')));
assert(analysis.setbacks[0].at<analysis.setbacks[1].at);
assert(S.panel(r,c.run.initialDeck).includes('아군 기여 장면'));assert(S.panel(r,c.run.initialDeck).includes('아군 전투불능 · 첫 발생 장면'));
assert(B.validRecap(r.recap,r.time,r.actors));
const legacy=copy(r);for(const e of legacy.recap.events){delete e.origin;delete e.cardKey;}
assert(B.validRecap(legacy.recap,legacy.time,legacy.actors));assert(S.setbacks(legacy).every(e=>e.text.includes('아군 전투불능')));
assert(S.moments({...legacy,recap:{...legacy.recap,events:legacy.recap.events.filter(e=>e.kind==='heal')}},new Set()).every(e=>e.text.includes('행동 출처 미기록')),'old unknown source must not be asserted as basic');
const invalid=copy(r.recap);invalid.events[0].origin='invented';assert(!B.validRecap(invalid,r.time,r.actors));
// Source metadata must survive snapshots, save validation, and resumed combat.
const mid=new C.Campaign();mid.start(1);mid.enter(mid.run.map[0][0].id);for(let i=0;i<600&&!mid.battle.s.ended;i++)mid.battle.step(.02);
const save=mid.snapshot();assert(C.validate(copy(save)));const resumed=new C.Campaign(copy(save));
for(let i=0;i<12000&&!resumed.battle.s.ended;i++)resumed.battle.step(.02);resumed.observe();assert(C.validate(copy(resumed.snapshot())));
console.log('PASS actual basic/card/enemy event attribution, separated ally KO, chronological setbacks, old optional metadata, invalid origin rejection, save/resume validation');
