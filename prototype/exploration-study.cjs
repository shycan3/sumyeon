'use strict';
// A reproducible technical rollout, not a model of human enjoyment or a
// population win-rate estimate. Its policy uses the current public combat UI.
const fs=require('node:fs'),path=require('node:path'),E=require('./exploration-core.js'),M=require('./exploration-map.js'),P=require('./exploration-policy.js');
const count=Number(process.argv[2]||30);if(!Number.isInteger(count)||count<1||count>1000)throw Error('seed count must be 1..1000');
function summarize(r){const damage={},cards={},visits=new Set(),traits={};let backtracks=0,paidHP=0;for(const e of r.telemetry){if(e.type==='move'){if(visits.has(e.node))backtracks++;visits.add(e.node);}if(e.type==='cost')paidHP+=e.changes.reduce((n,a)=>n+a.lost,0);if(e.type==='combat-action')for(const v of e.events){if(v.type==='damage')damage[v.target]=(damage[v.target]||0)+v.amount;if(v.type==='card'){const kind=e.cardKind||v.card;cards[kind]=(cards[kind]||0)+1;}if(v.type==='trait')traits[v.trait]=(traits[v.trait]||0)+1;}}return{seed:r.seed,result:r.phase,depth:r.depth,moves:r.moves,backtracks,timeSpent:r.timeSpent,timeRemaining:r.timeRemaining,hpPaid:paidHP,hp:r.allies.map(a=>a.hp),battles:r.battleHistory,cardUses:cards,damage,traitTriggers:traits,settlement:r.settlement};}
function rollout(seed,strategy){const s=new E.Session();s.begin({seed});let steps=0;while(!['RETURNED','FAILED'].includes(s.s.run.phase)&&steps++<1200){const r=s.s.run;
  if(r.phase==='COMBAT'){s.combatAction(P.choose(s.battle()));continue;}
  if(r.phase==='REWARD'){s.chooseReward(r.offers[0]||null);continue;}
  if(r.allies.filter(a=>a.hp>0).length<3||r.timeRemaining===0&&r.allies.some(a=>a.hp>0&&a.hp<8)){s.returnHome();continue;}
  const n=s.node(),object=n.interactions.find(i=>!i.resolved&&(i.kind==='record'||strategy==='research'&&i.kind!=='workbench'));
  if(object){if(s.previewCost(r.config.inspectCost).lethal){s.returnHome();continue;}s.inspect(object.id);continue;}
  if(n.id===r.map.exit){if(!n.encounter.cleared){if(s.previewCost(r.config.combatEntryCost).lethal){s.returnHome();continue;}s.startCombat();}else if(r.depth===r.config.maxDepth)s.returnHome();else if(s.previewCost(r.config.descendCost).lethal)s.returnHome();else s.descend();continue;}
  if(strategy==='research'&&n.encounter&&!n.encounter.cleared&&r.timeRemaining>20){s.startCombat();continue;}
  const route=M.path(r.map,r.nodeId,r.map.exit),direction=Object.entries(n.exits).find(([_,id])=>id===route[1])[0];if(s.previewCost(r.config.moveCost).lethal)s.returnHome();else s.move(direction);
}if(steps>=1200)throw Error('rollout exceeded its bound: '+seed);s.assert();return{strategy,...summarize(s.s.run)};}
const records=[];for(let i=0;i<count;i++)for(const strategy of ['direct','research'])records.push(rollout(20261010+i,strategy));
const report={scope:'Technical simulated policies only; not human fun or population balance.',config:E.DEFAULTS,samples:records.length,results:records.reduce((result,r)=>{const key=r.strategy+':'+r.result+':depth'+r.depth;result[key]=(result[key]||0)+1;return result;},{}),records};
const output=path.join(__dirname,'study-results','exploration');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({scope:report.scope,samples:report.samples,results:report.results,output:path.join(output,'report.json')},null,2));
