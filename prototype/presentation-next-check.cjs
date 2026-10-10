'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),store=new Map();
const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
const c=vm.createContext({window:{localStorage:storage,matchMedia:()=>({matches:false})}});
for(const f of ['data','character-data','actor-ai','engine','character-engine','presentation-data','presentation-settings','skill-director','spectator','trial-core'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),c);
const W=c.window,D=W.GameData,S=W.PresentationSettings,copy=x=>JSON.parse(JSON.stringify(x)),make=()=>W.TrialCore.create('base');
function accepted(b,n){return {kind:'cast',id:n,cardId:'intro-'+n,actor:'a1',target:'e0',key:'serin_dance',at:b.s.t,until:b.s.t+.35};}
{
  for(const frequency of ['all','highlights','once']){const b=make(),d=new W.SkillDirector();d.attach(b);d.setFrequency(frequency);d.accept(accepted(b,1),b);assert(d.current(b).showPortrait);assert(d.current(b).line);b.s.t=6;d.accept(accepted(b,2),b);assert.equal(d.current(b).showPortrait,frequency==='all');assert.equal(!!d.current(b).line,frequency==='all');b.s.t=13;d.accept(accepted(b,3),b);assert.equal(d.current(b).showPortrait,frequency!=='once');const another=make();d.attach(another);d.accept(accepted(another,4),another);assert(d.current(another).showPortrait,'first usage resets on new battle');}
  const d=new W.SkillDirector();d.setMode('simple');d.setFrequency('once');const again=new W.SkillDirector();assert.equal(again.mode,'simple');assert.equal(again.frequency,'once');assert.equal(JSON.parse(store.get(S.key)).version,1);assert(!d.setFrequency('invalid'));
  store.set('afterglow-character-v2','expedition sentinel');store.set('afterglow-expedition-v1','legacy sentinel');const b=make(),snapshot=b.snapshot();d.setMode('full');assert.equal(store.get('afterglow-character-v2'),'expedition sentinel');assert.equal(store.get('afterglow-expedition-v1'),'legacy sentinel');assert.deepEqual(b.snapshot(),snapshot);
  store.set(S.key,'malformed');assert.equal(S.load().mode,'full');W.localStorage={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};const unavailable=new W.SkillDirector();assert(unavailable.setMode('simple'));assert.equal(unavailable.mode,'simple');W.localStorage=storage;store.delete(S.key);
}
{
  const b=make(),medic=b.get('a3');medic.hp=medic.max*.2;b.heal(medic,4,0);assert.equal(b.visuals.filter(e=>e.kind==='outcome'&&e.type==='urgent-heal').length,1);assert.equal(b.visuals.find(e=>e.type==='urgent-heal').amount,4);medic.hp=medic.max;b.heal(medic,4,0);medic.hp=0;b.heal(medic,4,0);assert.equal(b.visuals.filter(e=>e.type==='urgent-heal').length,1,'zero/dead healing is not highlighted');
  const killed=make();killed.get('e0').hp=1;killed.damage(killed.get('e0'),100,0,'card',false,'serin_chain','a1');const finish=killed.visuals.find(e=>e.type==='finish');assert.equal(finish.actor,'a1');assert.equal(finish.target,'e0');assert.equal(killed.get('e0').hp,0);
  const counter=make();counter.get('e0').hp=1;counter.get('a1').counter={until:5,power:25,key:'serin_parry'};counter.damage(counter.get('a1'),1,1,'basic',false,null,'e0');assert(counter.visuals.some(e=>e.type==='finish'&&e.actor==='a1'&&e.target==='e0'),'counter KO identifies the real counter caster');
  for(const blocked of [false,true]){const chain=make();if(blocked)chain.s.guards[1]={n:1,until:10};chain.resolve({...D.definition({key:'serin_chain'}),kind:'attack',key:'serin_chain',chainFollow:true,actor:'a1',side:0,target:'e1',at:0,cardId:'follow'});assert.equal(chain.visuals.some(e=>e.type==='chain'),!blocked);assert.equal(chain.visuals.find(e=>e.kind==='chain').landed,!blocked);assert.equal(chain.s.stats.chainHits,blocked?0:1);}
  const vanished=make();vanished.get('e1').hp=0;vanished.resolve({...D.definition({key:'serin_chain'}),chainFollow:true,actor:'a1',side:0,target:'e1',at:0});assert(!vanished.visuals.some(e=>e.type==='chain'));
}
{
  const b=make(),d=new W.SkillDirector();d.attach(b);d.accept({kind:'outcome',type:'finish',actor:'a1',target:'e0',at:0},b);d.accept({kind:'outcome',type:'finish',actor:'a2',target:'e1',at:0},b);assert.equal(d.result(b).label,'2명 처치');
  d.accept({kind:'outcome',type:'urgent-heal',actor:'a3',target:'a1',amount:4,at:0},b);assert.equal(d.result(b).type,'urgent-heal');d.accept({kind:'outcome',type:'chain',actor:'a1',target:'e1',at:0},b);d.accept({kind:'outcome',type:'finish',actor:'a1',target:'e0',at:0},b);assert(d.pending.length<=2);b.s.t=2;assert.equal(d.result(b),null,'late queued notices are dropped');
  b.s.t=0;d.attach(b);d.accept({kind:'outcome',type:'urgent-heal',actor:'a3',target:'a1',amount:4,at:0},b);const first=d.result(b);b.s.t=3;d.accept({kind:'outcome',type:'urgent-heal',actor:'a3',target:'a1',amount:4,at:3},b);assert.equal(d.result(b),null,'repeated urgent healing does not spam');b.s.t=7;d.accept({kind:'outcome',type:'urgent-heal',actor:'a3',target:'a1',amount:4,at:7},b);assert.equal(d.result(b).type,'urgent-heal');
}
{
  const b=make(),observer=new W.Spectator(),tones=[];observer.sync(b);observer.sound=true;observer.tone=(...args)=>tones.push(args);for(let i=0;i<6;i++)b.emitVisual('heal-link',b.get('a3'),b.get('a'+i%4));observer.sync(b);assert.equal(tones.length,1,'same-frame healing audio is coalesced');observer.sync(b);assert.equal(tones.length,1,'no replay when paused');
  class Quiet extends W.CharacterBattle{emitVisual(){}}
  for(const preset of ['base','chase','cover']){const noisy=W.TrialCore.create(preset),quiet=new Quiet({},noisy.snapshot());for(let i=0;i<2250&&!noisy.s.ended;i++){noisy.step(.02);quiet.step(.02);}assert.deepEqual(noisy.snapshot(),quiet.snapshot(),'presentation signals do not affect '+preset+' battle');}
}
console.log('PASS: saved display/frequency settings and isolation/fallback, all/highlights/once throttling, true KO/counter/urgent-heal/landed-chain outcomes, blocked/invalid suppression, merging/priority/expiry, bounded audio and identical battles with presentation signals disabled.');
