const fs=require('fs'),vm=require('vm');
const context=vm.createContext({window:{}});
for(const file of ['data.js','engine.js','campaign.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context,{filename:file});
const D=context.window.GameData,C=context.window.GameCampaign,B=context.window.GameCore.Battle;
const builds={
  burst:{dash:3,shot:3,cleave:3,mark:3,warcry:2,heal:3,execute:1,pierce:1,volley:1},
  control:{guard:3,taunt:2,frost:3,mark:3,ward:2,heal:3,dash:2,pierce:1,cleanse:1},
  support:{guard:3,bulwark:3,heal:3,wave:2,ward:3,cleanse:2,warcry:2,shot:2}
};
const policies=new WeakMap();
function fallbackScore(b,c,target){
  const d=b.definition(c),a=b.get(target),missing=b.alive(0).reduce((n,a)=>n+a.max-a.hp,0),incoming=b.s.events.filter(e=>e.side===1&&context.window.GameCore.offense.includes(e.kind));
  if(context.window.GameCore.offense.includes(d.kind))return (d.power||15)/d.time*(d.kind==='area'?b.alive(1).length:1)*(d.kind==='execute'&&a?.hp/a?.max<=.5?2:1);
  if(['heal','cleanse'].includes(d.kind))return Math.min(d.power,a?.max-a?.hp||0)/d.time*1.8;
  if(['healAll','blessing'].includes(d.kind))return Math.min(missing,d.power*b.alive(0).length)/d.time*1.8;
  if(d.kind==='guard')return incoming.length?26:0;
  if(d.kind==='taunt')return incoming.length?9:0;
  if(d.kind==='ward')return a?.hp/a?.max<.6?8:2;
  return 5;
}
function ranked(b){return b.s.decks[0].hand.map(c=>{const target=b.recommend(c);return {c,target,score:b.tacticalScore?b.tacticalScore(c,target):fallbackScore(b,c,target)};}).sort((a,b)=>b.score-a.score);}
function adjustStances(b){
  const s=b.s;if(s.t<(s.botStanceAt||0))return;s.botStanceAt=s.t+.8;
  for(const a of b.alive(0)){
    const friends=b.alive(0),foes=b.alive(1),nearest=Math.min(...foes.map(t=>Math.hypot(a.x-t.x,a.y-t.y)));
    const stance=a.role===0?(friends.some(t=>t.hp/t.max<.7)?0:1):a.role===1?(foes.some(t=>t.hp/t.max<.55)?1:0):a.role===2?(nearest<155?0:1):(friends.some(t=>t.hp<t.max-8)?0:1);
    if(a.stance!==stance&&a.nextStance!==stance&&b.stance(a.id))s.stats.botStances=(s.stats.botStances||0)+1;
    else if(a.stance===stance&&a.nextStance!=null)b.stance(a.id);
  }
}
function decide(b,strategy='adaptive',features={}){
  let state=policies.get(b);if(!state){state={heldDue:null};policies.set(b,state);}
  if(strategy==='adaptive'&&features.stances!==false)adjustStances(b);
  let scores=ranked(b);if(!scores.length){b.wait();return;}
  const incoming=b.s.events.filter(e=>e.side===1&&context.window.GameCore.offense.includes(e.kind)),lowest=Math.min(...b.alive(0).map(a=>a.hp/a.max));
  if(strategy==='adaptive'){
    const needsDefense=incoming.length&&lowest<.45&&!scores.some(x=>['guard','ward','taunt'].includes(b.definition(x.c).kind));
    if(features.reroll!==false&&(scores[0].score<4||needsDefense)&&b.s.rerolls>0){b.select(scores.at(-1).c.id);if(b.reroll())scores=ranked(b);}
    const enemySoon=b.s.enemyDue-b.s.t;
    if(features.wait!==false&&!incoming.length&&enemySoon>0&&enemySoon<=2.05&&state.heldDue!==b.s.enemyDue&&scores.some(x=>b.definition(x.c).kind==='guard')&&(lowest<.75||b.alive(1).some(a=>a.boss))){state.heldDue=b.s.enemyDue;b.wait();return;}
  }
  b.select(scores[0].c.id);if(!b.confirm())throw new Error('AI card confirmation failed');
}
function play(b,maxSteps=20000,strategy='adaptive',features={}){
  if(strategy==='auto'){
    if(b.s.control!=='auto')b.setControl('auto');
    let ticks=0;while(!b.s.ended&&ticks++<maxSteps){if(b.s.paused)throw Error('Auto unexpectedly paused');b.step(.05);}
    if(!b.s.ended)throw Error('Auto battle stalled');return b.s.winner;
  }
  let ticks=0;while(!b.s.ended&&ticks++<maxSteps){if(b.s.paused){if(b.s.ready)decide(b,strategy,features);else b.pause();}else{if(strategy==='adaptive'&&features.stances!==false)adjustStances(b);b.step(.05);}}
  if(!b.s.ended)throw new Error('Battle stalled');return b.s.winner;
}
function setBuild(c,build){
  if(!builds[build])return;
  c.meta.owned=[];c.meta.serial=1;
  for(const [key,d] of Object.entries(D.cards))for(let i=0;i<d.limit;i++)c.meta.owned.push({id:'o'+c.meta.serial++,key});
  c.meta.deck=Object.entries(builds[build]).flatMap(([key,n])=>c.meta.owned.filter(o=>o.key===key).slice(0,n).map(o=>o.id));
  if(D.validateDeck(c.meta.deck,c.meta.owned))throw Error('Invalid comparison deck '+build);
}
function value(key,build='starter'){
  const d=D.cards[key],preferred=builds[build];
  const baseline={heal:15,guard:13,frost:13,cleave:13,mark:12,dash:12,execute:12,warcry:11,ward:11,pierce:11,shot:10,volley:10,cleanse:9,wave:9,bulwark:8,slam:8,heavy:12,taunt:7,blessing:12,bash:6};
  return (baseline[key]||5)+(preferred?.[key]?preferred[key]*2:0)+(d.limit===1?1:0);
}
function replacement(c,card,build){
  const r=c.run,chosen=r.deck.map(id=>r.pool.find(x=>x.id===id)),same=chosen.filter(x=>x.key===card.key);
  const candidates=same.length>=D.cards[card.key].limit?same:chosen;
  return candidates.map(old=>({old,score:value(old.key,build)*(old.upgraded?1.35:1)+(old.key==='heal'&&chosen.filter(x=>x.key==='heal').length===1?8:0)})).sort((a,b)=>a.score-b.score)[0];
}
function chooseReward(c,build){
  const r=c.run;return r.reward.candidates.map(key=>{const card={key,upgraded:r.reward.upgradedKeys?.includes(key)},old=replacement(c,card,build),count=c.meta.owned.filter(x=>x.key===key).length;return {key,score:value(key,build)*(card.upgraded?1.35:1)-(old?.score||0)+(count<D.cards[key].limit?3:0)};}).sort((a,b)=>b.score-a.score)[0].key;
}
function insertReward(c,build,audit){
  const r=c.run,card=r.pool.find(x=>x.id===r.reward.cardId),candidate=replacement(c,card,build);if(!candidate)return;
  if(value(card.key,build)*(card.upgraded?1.35:1)<=candidate.score+.1)return;
  const deck=r.deck.map(id=>id===candidate.old.id?card.id:id);if(!c.setRunDeck(deck)){audit.swaps++;audit.newIds.push(card.id);}
}
function chooseNode(c,route){
  const r=c.run,nodes=C.availableNodes?C.availableNodes(r):r.map[r.depth];
  const desired=route==='risk'?['elite','upgrade','battle','reward','heal']:['heal','reward','upgrade','battle','elite'];
  const priority=n=>{const at=desired.indexOf(n.type);let score=at<0?20:10-at;const next=(n.next||[]).map(id=>r.map[r.depth+1]?.find(t=>t.id===id)).filter(Boolean);if(next.length)score+=Math.max(...next.map(t=>(desired.length-desired.indexOf(t.type))*.18));return score;};
  return [...nodes].sort((a,b)=>priority(b)-priority(a))[0];
}
function expedition(seed,timing='mixed',route='safe',options={}){
  const {build='starter',strategy='adaptive'}=options,c=new C.Campaign(),audit={swaps:0,newIds:[],newCommands:0,upgrades:0,stances:0};setBuild(c,build);c.meta.settings.timing=timing;if(strategy==='auto')c.setControl('auto');c.start(seed);
  let iterations=0;
  while(c.run&&iterations++<150){const r=c.run;
    if(r.stage==='map'){const node=chooseNode(c,route);if(!node||!c.chooseNode(node.id))throw Error('No reachable route');}
    else if(r.stage==='battle'){const b=c.battle;play(b,20000,strategy,options);audit.newCommands+=b.s.history.filter(e=>e.side===0&&audit.newIds.includes(e.cardId)).length;audit.stances+=b.s.stats.stanceChanges||0;c.observeBattle();}
    else if(r.stage==='elitePerk')c.chooseElitePerk(options.elitePerk||(r.hp.some((hp,i)=>hp>0&&hp<D.maxHP(i,r.levels[i])*.7)?'recover':'evolve'));
    else if(r.stage==='battleResult')c.openReward();
    else if(r.stage==='reward')c.pickReward(chooseReward(c,build));
    else if(r.stage==='loot'){insertReward(c,build,audit);c.completeNode();}
    else if(r.stage==='nodeDone')c.completeNode();
    else if(r.stage==='upgrade'){const card=r.deck.map(id=>r.pool.find(c=>c.id===id)).filter(c=>!c.upgraded).sort((a,b)=>value(b.key,build)-value(a.key,build))[0];if(card){c.evolve(card.id);audit.upgrades++;}else c.skipUpgrade();}
    C.validateSave(c.snapshot());
  }
  if(c.run)throw new Error('Expedition stalled');c.audit=audit;return c;
}
function compare(timing,route,build,strategy,count=12,features={}){
  const runs=Array.from({length:count},(_,i)=>expedition(i+1,timing,route,{build,strategy,...features})),reports=runs.map(c=>c.meta.lastReport),sum=fn=>runs.reduce((n,c)=>n+fn(c),0);
  const battles=reports.flatMap(r=>r.results),mean=fn=>battles.reduce((n,r)=>n+fn(r),0)/battles.length;
  console.log(timing+'/'+route+'/'+build+'/'+(features.label||strategy)+': '+reports.filter(r=>r.success).length+'/'+count+' wins; wait '+sum(c=>c.meta.lastReport.results.reduce((n,r)=>n+r.stats.waits,0))+', redraw '+sum(c=>c.meta.lastReport.results.reduce((n,r)=>n+r.stats.rerolls,0))+', deck swaps '+sum(c=>c.audit.swaps)+', acquired-card commands '+sum(c=>c.audit.newCommands)+', stance changes '+sum(c=>c.audit.stances)+', mean postfight HP '+mean(r=>r.hp.reduce((n,hp)=>n+hp,0)).toFixed(1)+', KO '+battles.reduce((n,r)=>n+r.hp.filter(hp=>hp===0).length,0)+', blocks '+battles.reduce((n,r)=>n+r.stats.blocked[0],0));
}
if(require.main===module){
  for(const timing of ['mixed','classic'])for(const route of ['safe','risk'])compare(timing,route,'starter','adaptive');
  for(const build of Object.keys(builds))for(const route of ['safe','risk'])compare('mixed',route,build,'adaptive',8);
  for(const route of ['safe','risk'])compare('mixed',route,'starter','immediate');
  for(const feature of ['wait','reroll','stances'])compare('mixed','safe','starter','adaptive',12,{[feature]:false,label:'no-'+feature});
}
module.exports={D,C,B,context,decide,play,expedition,builds,setBuild,chooseNode};
