'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const context=vm.createContext({window:{matchMedia:()=>({matches:false})}});
for(const f of ['data','character-data','actor-ai','engine','character-engine','presentation-data','skill-director','spectator','trial-core'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),context);
const W=context.window,P=W.SkillPresentation,copy=x=>JSON.parse(JSON.stringify(x));
function ready(){const b=W.TrialCore.create('base');b.s.due=b.s.enemyDue=1000;for(const a of b.s.actors){a.cool=a.busy=1000;}b.get('a1').busy=0;b.get('e0').hp=b.get('e0').max=300;b.s.ready=true;return b;}
function cast(b){const card=b.s.decks[0].hand.find(c=>c.key==='serin_dance');assert(b.command(0,card.id,'e0'));return card;}
function consume(d,b,from){for(const e of b.visuals)if(e.id>from)d.accept(e,b);return b.visualSerial;}
{
  assert.equal(P.profile('serin_cut').tier,'basic');for(const key of ['serin_dash','serin_parry','serin_chain','serin_cover'])assert.equal(P.profile(key).tier,'accent');assert.equal(P.profile('serin_dance').tier,'signature');assert.equal(P.profile('heal').tier,'basic');assert(Object.isFrozen(P.cards)&&Object.isFrozen(P.tiers));
  const b=ready(),d=new W.SkillDirector();d.attach(b);cast(b);let serial=consume(d,b,0);assert.equal(d.current(b).profile.tier,'signature');assert.equal(d.current(b).phase,'준비');assert.equal(d.current(b).line,'한 줄기 빛이면 충분해.');const before=b.snapshot(),active=copy(d.active);d.accept(b.visuals.find(e=>e.kind==='cast'),b);assert.deepEqual(copy(d.active),active,'duplicate cast cannot restart its intro');assert.deepEqual(b.snapshot(),before,'presentation cannot change battle');
  const phases=[];for(let i=0;i<40;i++){b.step(.02);serial=consume(d,b,serial);phases.push(d.current(b)?.phase);}assert(phases.includes('1타')&&phases.includes('2타')&&phases.includes('마무리'));assert.equal(b.s.stats.signatureHits,3);
  b.pause();const frozen=copy(d.current(b));for(let i=0;i<20;i++){b.step(.1);consume(d,b,serial);}assert.deepEqual(copy(d.current(b)),frozen);b.pause();for(let i=0;i<40;i++)b.step(.02);assert.equal(d.current(b),null,'intro expires in simulation time');
}
{
  for(const failure of ['block','target','caster']){const b=ready(),d=new W.SkillDirector();d.attach(b);cast(b);let serial=consume(d,b,0);if(failure==='block')b.s.guards[1]={n:1,until:10};else b.get(failure==='target'?'e0':'a1').hp=0;
    let stopped=null;for(let i=0;i<21;i++){b.step(.02);serial=consume(d,b,serial);if(d.current(b)?.stopped)stopped=d.current(b).phase;}assert(stopped, failure+' produces a stopped presentation');assert.equal(b.s.stats.signatureHits,0);assert.equal(b.visuals.filter(e=>e.kind==='signature-hit').length,0);
  }
  const b=ready(),d=new W.SkillDirector();d.attach(b);cast(b);let serial=consume(d,b,0);for(let i=0;i<18;i++){b.step(.02);serial=consume(d,b,serial);}b.s.guards[1]={n:1,until:10};for(let i=0;i<9;i++){b.step(.02);serial=consume(d,b,serial);}assert.equal(b.s.stats.signatureHits,1);assert(d.current(b).phase.includes('차단'));
}
{
  const b=ready(),d=new W.SkillDirector();d.attach(b);cast(b);consume(d,b,0);const active=copy(d.active);d.accept({kind:'cast',id:999,actor:'a3',cardId:'heal',key:'heal',at:b.s.t,until:b.s.t+.1},b);assert.deepEqual(copy(d.active),active,'basic cast cannot obscure signature');
  const observer=new W.Spectator();observer.sync(b);assert.equal(observer.director.current(b),null,'late attachment skips past intros');const restored=new W.CharacterBattle({},b.snapshot()),next=new W.Spectator();next.sync(restored);assert.equal(next.director.current(restored),null,'reload does not replay portrait/dialogue');
  const snapshot=b.snapshot();assert(d.setMode('simple'));assert.equal(d.mode,'simple');assert(!d.setMode('invalid'));assert.deepEqual(b.snapshot(),snapshot);
}
console.log('PASS: independent card tiers, accepted intro/dialogue, actual 1/2/final phases, single intro, blocked/interrupted/KO cancellation, priority, pause/restore, presentation-only simplification and unchanged battle snapshot.');
