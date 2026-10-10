'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const context=vm.createContext({window:{}});
for(const file of ['data.js','character-data.js','actor-ai.js','engine.js','campaign.js','character-engine.js','character-campaign.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context,{filename:file});
const D=context.window.GameData,K=context.window.CharacterData,B=context.window.CharacterBattle,Campaign=context.window.CharacterCampaign.Campaign;
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function battle(seed=11){const c=new Campaign();c.start(seed);c.enter(c.run.map[0][0].id);c.battle.setControl('manual');return c.battle;}
function quiet(b,active=null){b.s.due=b.s.enemyDue=1000;for(const a of b.s.actors){a.cool=1000;a.busy=a.id===active?0:1000;}b.s.events=[];}
function install(b,key){const deck=b.s.decks[0];let card=deck.hand.find(c=>c.key===key);
  if(!card){let area=['draw','discard'].find(name=>deck[name].some(c=>c.key===key));if(area){const i=deck[area].findIndex(c=>c.key===key);[deck.hand[0],deck[area][i]]=[deck[area][i],deck.hand[0]];card=deck.hand[0];}else{card={id:'layered-'+key,key,actor:'a'+D.cards[key].role,upgraded:false};deck.hand[0]=card;}}
  b.s.ready=true;b.s.paused=true;b.s.selected=card.id;return card;
}
function event(b,key,target){return {...D.definition({key}),key,side:0,actor:'a1',target,at:b.s.t,cardId:'layered-effect'};}
function assertChoice(b,actor,expected,message){const target=b.finalBasicTarget?b.finalBasicTarget(actor):b.basicTarget(actor);assert.equal(target?.id,expected,message);}
{
  const b=battle(),a=b.get('a1'),chase=b.get('e0'),taunter=b.get('e1');quiet(b,a.id);chase.stance=1;a.x=200;a.y=150;a.cool=0;a.purpose={kind:'chase',target:chase.id,until:10};chase.x=245;chase.y=150;taunter.x=200;taunter.y=195;
  b.s.taunts[1]={from:0,until:4,actor:taunter.id};assertChoice(b,a,taunter.id,'forced target takes priority over pursuit');const hp=[chase.hp,taunter.hp];b.basics(.02);assert.equal(chase.hp,hp[0]);assert(taunter.hp<hp[1],'basic attack really strikes the taunter');assert.equal(a.purpose.target,chase.id,'taunt does not destroy pursuit purpose');
  b.s.t=4.1;assertChoice(b,a,chase.id,'pursuit resumes after taunt expires');
}
{
  const b=battle(),a=b.get('a1'),ally=b.get('a3'),close=b.get('e0'),taunter=b.get('e1');quiet(b,a.id);ally.x=180;ally.y=230;a.x=132;a.y=230;a.cool=0;a.purpose={kind:'cover',target:ally.id,until:10};close.x=176;close.y=260;taunter.x=800;taunter.y=230;b.s.taunts[1]={from:0,until:5,actor:taunter.id};assertChoice(b,a,taunter.id,'taunt controls attack target even while covering');const hp=[close.hp,taunter.hp],origin={x:a.x,y:a.y};
  for(let i=0;i<50;i++){b.s.t+=.02;b.basics(.02);}assert.equal(close.hp,hp[0]);assert.equal(taunter.hp,hp[1]);assert(Math.hypot(a.x-ally.x,a.y-ally.y)<100,'cover movement remains beside ally');assert(Math.hypot(a.x-origin.x,a.y-origin.y)<100,'distant taunt does not drag cover movement away');assert(a.cool<=0,'out-of-range forced target does not consume an attack');
}
{
  for(const key of ['serin_dash','serin_chain','serin_dance','serin_cut']){
    const b=battle(),a=b.get('a1');quiet(b,a.id);a.purpose={kind:'cover',target:'a3',until:10};const card=install(b,key);assert(b.command(0,card.id,'e0'),key+' accepted');assert(!a.purpose,key+' removes stale movement purpose immediately on acceptance');assert(b.s.events.some(e=>e.cardId===card.id));
    const rejected=battle(),busy=rejected.get('a1');quiet(rejected,busy.id);busy.purpose={kind:'cover',target:'a3',until:10};const blocked=install(rejected,key);busy.busy=rejected.s.t+2;const before=rejected.snapshot();assert(!rejected.command(0,blocked.id,'e0'),key+' rejects a busy caster');assert.deepEqual(rejected.snapshot(),before,key+' rejected command leaves cards/cooldown/purpose/events/seed unchanged');
  }
  const parry=battle(),serin=parry.get('a1');quiet(parry,serin.id);serin.purpose={kind:'cover',target:'a3',until:10};const purpose=copy(serin.purpose),parryCard=install(parry,'serin_parry');assert(parry.command(0,parryCard.id,serin.id));assert.deepEqual(copy(serin.purpose),purpose,'parry remains compatible with cover movement');
  const heal=battle(),cover=heal.get('a1');quiet(heal,'a3');cover.purpose={kind:'cover',target:'a3',until:10};const original=copy(cover.purpose),healCard=install(heal,'heal');assert(heal.command(0,healCard.id,'a1'));assert.deepEqual(copy(cover.purpose),original,'another actor healing does not cancel movement purpose');
}
{
  for(const key of ['serin_dash','serin_chain']){
    const b=battle(),a=b.get('a1'),taunter=b.get('e0'),selected=b.get('e1');quiet(b,a.id);taunter.hp=taunter.max=300;selected.hp=selected.max=300;
    b.resolve({...D.definition({key:'taunt'}),key:'taunt',side:1,actor:taunter.id,target:null,at:b.s.t,cardId:'enemy-taunt'});assert.equal(b.forced(0)?.id,taunter.id);
    const hp=[taunter.hp,selected.hp],card=install(b,key);assert(b.command(0,card.id,selected.id));for(let i=0;i<30&&b.s.t<.3;i++)b.step(.02);
    assert(taunter.hp<hp[0],key+' damages actual taunt target');assert.equal(selected.hp,hp[1],key+' leaves original selected target untouched');assert.equal(a.purpose?.kind,'chase');assert.equal(a.purpose?.target,taunter.id,key+' pursuit follows actual resolved target');
  }
  for(const key of ['serin_chain','serin_dance']){
    const b=battle(),a=b.get('a1');quiet(b,a.id);a.busy=0;a.purpose={kind:'cover',target:'a3',until:10};const card=install(b,'serin_dash');b.s.events.push({...event(b,key,'e0'),at:1,...(key==='serin_chain'?{chainFollow:true}:{signatureFollow:true})});
    const before=b.snapshot();assert(!b.command(0,card.id,'e1'),key+' pending continuation blocks a new movement command after busy timer expires');assert.deepEqual(b.snapshot(),before,'pending continuation rejection is atomic');
  }
  const scored=battle(),caster=scored.get('a1'),original=scored.get('e0'),forced=scored.get('e1');quiet(scored,caster.id);original.hp=10;forced.hp=forced.max=200;scored.s.taunts[1]={from:0,until:5,actor:forced.id};const chain=install(scored,'serin_chain');assert.equal(scored.tacticalScore(chain,original.id),scored.tacticalScore(chain,forced.id),'chain kill bonus scores the actual taunt target rather than the selected low-HP enemy');
}
{
  const b=battle(),a=b.get('a1');quiet(b,a.id);a.cool=0;a.speed=0;a.purpose={kind:'chase',target:'e0',until:10};b.get('e0').hp=0;b.get('e1').x=900;b.get('e1').y=350;b.basics(.02);assert(!a.purpose,'target KO clears purpose before basic action');assert(a.cool<=0,'invalid or distant replacement target does not consume basic cooldown');
  const expired=battle(),actor=expired.get('a1');quiet(expired,actor.id);actor.purpose={kind:'cover',target:'a3',until:0};expired.basics(.02);assert(!actor.purpose,'purpose expiration is cleared immediately');
  const vanished=battle(),owner=vanished.get('a1');quiet(vanished,owner.id);owner.purpose={kind:'cover',target:'missing',until:10};vanished.basics(.02);assert(!owner.purpose,'missing purpose target is cleared immediately');
}
{
  const b=battle(17);assert.equal(b.s.aiVersion,2);assert(b.s.actors.every(a=>a.ai&&Number.isFinite(a.ai.nextThinkAt)),'per-actor policy state exists');b.resumeAuto();for(let i=0;i<500&&!b.s.ended;i++)b.step(.02);assert(!b.s.ended);b.intervene();const frozen=b.snapshot();for(let i=0;i<30;i++)b.step(.1);assert.deepEqual(b.snapshot(),frozen,'intervention freezes policy timers and decisions');
  b.resumeAuto();const restored=new B({},b.snapshot());for(let i=0;i<1000&&!b.s.ended;i++){b.step(.02);restored.step(.02);}assert.deepEqual(restored.snapshot(),b.snapshot(),'layered policy state resumes deterministically');
  const migration=battle(19),actor=migration.get('a1');quiet(migration,actor.id);migration.s.t=1.5;actor.busy=3;actor.purpose={kind:'cover',target:'a3',until:8};actor.approach={target:'e0',start:1,until:3,fromX:actor.x,fromY:actor.y,reach:42};migration.s.events=[{...event(migration,'serin_dash','e0'),at:3}];const legacy=migration.snapshot();delete legacy.aiVersion;for(const a of legacy.actors)delete a.ai;const old=new B({},legacy);assert.equal(old.s.aiVersion,2);assert(old.s.actors.every(a=>a.ai));
  assert.equal(old.s.t,legacy.t);assert.equal(old.s.seed,legacy.seed);assert.deepEqual(copy(old.s.events).map(({actionId,...e})=>e),copy(legacy.events));assert(old.s.events.every(e=>e.actionId===old.get(e.actor).action.id));for(const before of legacy.actors){const after=old.get(before.id);assert.equal(after.busy,before.busy);assert.deepEqual(copy(after.purpose),copy(before.purpose));assert.deepEqual(copy(after.approach),copy(before.approach));}assert.deepEqual(old.s.decks,legacy.decks);
}
{
  const c=new Campaign();c.start(31);c.enter(c.run.map[0][0].id);const save=c.snapshot();context.window.CharacterCampaign.validate(save);
  const badCases=[data=>data.run.battle.aiVersion=1,data=>data.run.battle.aiVersion=3,data=>data.run.battle.actors[0].ai.nextThinkAt=-1,data=>data.run.battle.actors[0].ai.nextThinkAt=Infinity,data=>data.run.battle.actors[0].ai.nextThinkAt='invalid',data=>data.run.battle.actors[0].ai.holdUntil=-1,data=>data.run.battle.actors[0].ai.target='missing'];
  for(const change of badCases){const data=copy(save);change(data);assert.throws(()=>context.window.CharacterCampaign.validate(data),'invalid layered policy save is rejected');}
}
{
  const AI=context.window.ActorAI,b=battle(),actor=copy(b.get('a1')),weakAlly=copy(b.get('a3')),near=copy(b.get('e0')),threat=copy(b.get('e1'));
  const runtimeContext=b.aiContext(b.get('a1')),runtimeBefore=b.snapshot();assert(Object.isFrozen(runtimeContext)&&Object.isFrozen(runtimeContext.actors)&&runtimeContext.actors.every(Object.isFrozen),'engine supplies a frozen per-actor policy context');AI.plan(runtimeContext,b.get('a1').ai);assert.deepEqual(b.snapshot(),runtimeBefore,'policy evaluation cannot mutate the live battle through its context');
  actor.x=100;actor.y=100;actor.stance=0;actor.cool=0;weakAlly.x=700;weakAlly.y=100;weakAlly.hp=weakAlly.max*.2;near.x=200;near.y=100;near.hp=near.max=100;threat.x=680;threat.y=100;threat.hp=threat.max=100;
  const ctx={t:2,actor,actors:[actor,weakAlly,near,threat],policy:'serin',purpose:null,forced:null,strategy:'adaptive',phase:1},memory=AI.defaults(actor,ctx.t),before=copy(ctx),beforeMemory=copy(memory);
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}freeze(ctx);freeze(memory);
  const plan=AI.plan(ctx,memory);assert.deepEqual(copy(ctx),before,'pure policy leaves readonly battle context unchanged');assert.deepEqual(copy(memory),beforeMemory,'pure policy returns new memory rather than mutating saved memory');assert.deepEqual(copy(AI.plan(ctx,memory)),copy(plan),'pure policy is deterministic');assert.equal(plan.basic.target,threat.id,'character preference protects the weak ally');
  const role=AI.plan({...copy(ctx),policy:'role'},AI.defaults(actor,ctx.t));assert.equal(role.basic.target,near.id,'same-role actor without character bias keeps its role preference');
  const chase={...copy(ctx),actor:{...copy(actor),stance:1},policy:'serin'};chase.actors[0]=chase.actor;chase.actors.find(a=>a.id===near.id).hp=20;assert.equal(AI.plan(chase,AI.defaults(chase.actor,chase.t)).basic.target,near.id,'stance can change character preference within the same role');
}
{
  const b=battle(),second=b.get('a2'),ally=b.get('a3');second.role=1;second.characterId='serin';second.stance=0;second.range=D.roles[1].range;second.speed=D.roles[1].speed;second.ai=context.window.ActorAI.defaults(second,b.s.t);quiet(b,second.id);second.x=150;second.y=220;ally.x=350;ally.y=220;second.purpose={kind:'cover',target:ally.id,until:5};
  for(let i=0;i<100;i++){b.s.t+=.02;b.basics(.02);}assert(Math.hypot(second.x-ally.x,second.y-ally.y)<100,'same-role character in another slot executes its own movement intent');assert(!b.get('a1').purpose,'per-actor purpose is not hardcoded to the original character slot');
}
console.log('PASS: layered target/taunt priority with actual basic/card hits and pursuit, cover movement versus distant taunt, atomic movement-card acceptance/busy or pending-continuation rejection, compatible parry/heal, KO/expiry/missing-purpose cleanup, policy freeze/deterministic save, legacy-state migration/invalid saves, pure readonly policy and same-role character/stance/slot behavior.');
