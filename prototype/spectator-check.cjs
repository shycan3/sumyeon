'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const c=vm.createContext({window:{matchMedia:()=>({matches:false})}});
for(const f of ['data','character-data','actor-ai','engine','character-engine','presentation-data','skill-director','spectator','trial-core'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),c);
const W=c.window,D=W.GameData,copy=x=>JSON.parse(JSON.stringify(x));
function isolated(){const b=W.TrialCore.create('base');for(const a of b.s.actors){a.cool=a.busy=1000;}b.s.due=b.s.enemyDue=1000;b.get('a1').busy=0;b.get('e0').hp=b.get('e0').max=300;return b;}
function dance(b){return {...D.definition({key:'serin_dance'}),side:0,actor:'a1',target:'e0',at:b.s.t,cardId:'visual-test'};}
{
  const b=isolated();b.resolve(dance(b));for(let i=0;i<20;i++)b.step(.02);
  const hits=b.visuals.filter(e=>e.kind==='signature-hit');assert.deepEqual(copy(hits.map(e=>e.index)),[1,2,3]);assert.equal(b.s.stats.signatureHits,hits.length);assert(Math.abs(hits[1].at-.16)<=.021&&Math.abs(hits[2].at-.32)<=.021);assert(!('visuals'in b.snapshot()));
  const blocked=isolated();blocked.s.guards[1]={n:1,until:10};blocked.resolve(dance(blocked));for(let i=0;i<20;i++)blocked.step(.02);assert.equal(blocked.visuals.filter(e=>e.kind==='signature-hit').length,0);assert.equal(blocked.visuals.filter(e=>e.kind==='block').length,1);
  const midway=isolated();midway.resolve(dance(midway));midway.s.guards[1]={n:1,until:10};for(let i=0;i<20;i++)midway.step(.02);assert.equal(midway.visuals.filter(e=>e.kind==='signature-hit').length,1);assert.equal(midway.s.stats.signatureHits,1);
  const before=b.snapshot(),visuals=copy(b.visuals);b.pause();const frozen=b.snapshot();b.step(.1);assert.deepEqual(b.snapshot(),frozen);assert.deepEqual(copy(b.visuals),visuals);b.pause();const restored=new W.CharacterBattle({},before);assert.equal(restored.visuals.length,0);assert.deepEqual(restored.snapshot(),before);
  const observer=new W.Spectator(),tones=[];observer.tone=(...args)=>tones.push(args);observer.sync(b);observer.sound=true;b.emitVisual('signature-hit',b.get('a1'),b.get('e0'),{index:3});observer.sync(b);assert.equal(tones.length,2);observer.sync(b);assert.equal(tones.length,2,'audio is not repeated when painting a paused event');
}
{
  const outcomes={};for(const preset of Object.keys(W.TrialCore.presets)){const b=W.TrialCore.create(preset),again=W.TrialCore.create(preset);assert.deepEqual(b.snapshot(),again.snapshot());assert.equal(b.s.decks[0].hand.length,5);assert.equal(['draw','hand','discard'].reduce((n,k)=>n+b.s.decks[0][k].length,0),20);assert(b.s.decks[0].hand.some(x=>x.key==='serin_dance'));for(let i=0;i<2250&&!b.s.ended;i++)b.step(.02);assert.equal(b.s.winner,0);assert(b.s.t<=45);assert(b.s.stats.signatureHits>0);outcomes[preset]=copy(b.s.stats);console.log(JSON.stringify({preset,seconds:+b.s.t.toFixed(2),signature:b.s.stats.signatureHits,chain:b.s.stats.chainHits,cover:b.s.stats.covered,counters:b.s.stats.counters}));}
  assert(outcomes.chase.chainHits>0);assert(outcomes.cover.covered>0&&outcomes.cover.counters>0);
  const actors=Object.keys(W.TrialCore.presets).map(p=>copy(W.TrialCore.create(p).s.actors));assert.deepEqual(actors[0],actors[1]);assert.deepEqual(actors[1],actors[2]);
}
console.log('PASS: actual 3-hit cues/timestamps, blocked and interrupted signature, transient non-save presentation, pause/restore/no repeated audio, deterministic equal-condition trial presets and actual chase/cover/signature use.');
