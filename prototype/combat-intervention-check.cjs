'use strict';
const assert=require('assert'),fs=require('fs');const {D,K,B,C,fixture,settle,metrics}=require('./combat-choice-check.cjs');
function response(b,scenario){const friends=b.alive(0),hand=b.s.decks[0].hand,aims=b.alive(1).map(a=>b.inspectAI(a.id)?.attackTarget),lowest=[...friends].sort((a,c)=>a.hp/a.max-c.hp/c.max||a.id.localeCompare(c.id));
 const candidates=[];
 if(scenario==='focus'){
   const threatened=lowest.filter(a=>aims.includes(a.id));
   for(const key of ['taunt','serin_cover','heal']){const card=hand.find(c=>c.key===key);if(!card)continue;const target=key==='taunt'?null:threatened.find(a=>key!=='serin_cover'||a.id!=='a1')?.id;if(key!=='taunt'&&!target)continue;if(key==='taunt'&&(!threatened.some(a=>a.id!=='a0')||b.get('a0').hp/b.get('a0').max<.35))continue;if(key==='heal'&&b.get(target).max-b.get(target).hp<15)continue;candidates.push({card,target});}
 }else if(scenario==='swarm'){
   for(const key of ['volley','wave']){const card=hand.find(c=>c.key===key);if(!card)continue;if(key==='volley'&&b.alive(1).length<3)continue;if(key==='wave'&&friends.filter(a=>a.max-a.hp>=10).length<2)continue;candidates.push({card,target:null});}
 }else if(b.hazard()){
   for(const key of ['boss_retreat','boss_rescue','guard']){const card=hand.find(c=>c.key===key);if(!card)continue;const target=key==='boss_rescue'?lowest.find(a=>a.id!=='a1'&&b.inside(a))?.id:null;candidates.push({card,target});}
 }
 return candidates.find(x=>b.commandCheck(0,x.card.id,x.target).ok)||null;
}
const rows=[];for(const scenario of ['focus','swarm','line','boss'])for(const ratio of [1,.7,.45])for(const build of ['base','chain','cover','movement'])for(const seed of [2,7,19,37,83,113]){
 const b=fixture(scenario,build,ratio,seed);b.setControl('manual');for(let i=0;i<600&&!b.s.ready;i++)b.step(.02);assert(b.s.ready);if(['line','boss'].includes(scenario)){while(!b.hazard()&&!b.s.ended){if(b.s.paused)b.wait();b.step(.02);}}if(b.s.ended)continue;
 b.reopen();const before=JSON.stringify(b.snapshot()),choice=response(b,scenario);assert.equal(JSON.stringify(b.snapshot()),before,'public response selection is readonly');if(!choice)continue;
 const snapshot=b.snapshot(),auto=new B({},snapshot),manual=new B({},snapshot);assert.deepEqual(auto.snapshot(),manual.snapshot());auto.resumeAuto();assert(manual.select(choice.card.id));if(choice.target)assert(manual.target(choice.target));assert(manual.confirm());manual.resumeAuto();const autoResult=settle(auto),manualResult=settle(manual);rows.push({scenario,ratio,build,seed,key:choice.card.key,target:choice.target,at:+b.s.t.toFixed(2),auto:autoResult,oneCard:manualResult});
}
const summary=['focus','swarm','line','boss'].map(scenario=>{const cases=rows.filter(r=>r.scenario===scenario),avg=(method,key)=>+(cases.reduce((n,r)=>n+r[method][key],0)/cases.length).toFixed(2);return {scenario,pairs:cases.length,autoWins:cases.filter(r=>r.auto.win).length,oneCardWins:cases.filter(r=>r.oneCard.win).length,autoHP:avg('auto','hp'),oneCardHP:avg('oneCard','hp'),autoReceived:avg('auto','received'),oneCardReceived:avg('oneCard','received'),betterHP:cases.filter(r=>r.oneCard.hp>r.auto.hp+.01).length,worseHP:cases.filter(r=>r.oneCard.hp<r.auto.hp-.01).length,choices:cases.reduce((a,r)=>(a[r.key]=(a[r.key]||0)+1,a),{})};});
assert(summary.every(r=>r.pairs>0));assert(rows.some(r=>r.oneCard.hp>r.auto.hp+.01),'a legal single-card intervention should have measurable value in some conditions');assert(rows.some(r=>r.oneCard.hp<r.auto.hp-.01),'do not hide worse interventions');
fs.writeFileSync(__dirname+'/combat-intervention-results.json',JSON.stringify({policy:'One scripted public-information card, then common auto; mechanisms share prior retained command. This is not a human skill experiment.',rows,summary},null,2));console.log(JSON.stringify(summary));console.log('PASS: identical snapshots/real hands and one legal command, public-only readonly response selection, complete outcomes including worse interventions');
