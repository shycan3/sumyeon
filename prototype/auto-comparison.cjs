'use strict';
const assert=require('assert'),{D,C,B,play,expedition}=require('./simulation.cjs');
const mean=values=>+(values.reduce((n,v)=>n+v,0)/values.length).toFixed(1);
function encounterMatrix(strategy){
  const results=[];
  for(let encounter=0;encounter<6;encounter++)for(let seed=1;seed<=12;seed++){
    const c=new C.Campaign();c.start(seed);const r=c.run;
    const b=new B({seed,levels:r.levels,hp:r.hp,stances:r.stances,depth:0,elite:false,encounter:D.encounters[encounter],timing:'mixed',control:strategy==='auto'?'auto':'manual',cards:r.deck.map(id=>r.pool.find(c=>c.id===id))});
    play(b,20000,strategy);
    assert(b.s.actors.filter(a=>a.side===0).every(a=>a.stance===0&&a.nextStance==null),'comparison must preserve starting stances');
    results.push({win:b.s.winner===0,hp:b.alive(0).reduce((n,a)=>n+a.hp,0),ko:4-b.alive(0).length,cards:Object.values(b.s.stats.cards[0]).reduce((n,v)=>n+v,0),blocked:b.s.stats.blocked[0],time:b.s.t});
  }
  console.log(JSON.stringify({kind:'encounters',strategy,count:results.length,wins:results.filter(r=>r.win).length,meanHP:mean(results.map(r=>r.hp)),KO:results.reduce((n,r)=>n+r.ko,0),meanCards:mean(results.map(r=>r.cards)),blocks:results.reduce((n,r)=>n+r.blocked,0),meanSeconds:mean(results.map(r=>r.time))}));
}
function expeditionMatrix(timing,route,build='starter',count=12){
  const runs=Array.from({length:count},(_,i)=>expedition(i+1,timing,route,{strategy:'auto',build})),reports=runs.map(c=>c.meta.lastReport),battles=reports.flatMap(r=>r.results);
  for(const c of runs){C.validateSave(c.snapshot());assert.equal(c.meta.settings.control,'auto');assert.equal(c.audit.stances,0);}
  console.log(JSON.stringify({kind:'expeditions',timing,route,build,count,wins:reports.filter(r=>r.success).length,battles:battles.length,autoCards:battles.reduce((n,r)=>n+(r.stats.autoCards||0),0),interventions:battles.reduce((n,r)=>n+(r.stats.interventions||0),0),meanPostfightHP:mean(battles.map(r=>r.hp.reduce((n,hp)=>n+hp,0))),KO:battles.reduce((n,r)=>n+r.hp.filter(hp=>hp===0).length,0),acquiredCardCommands:runs.reduce((n,c)=>n+c.audit.newCommands,0)}));
}
encounterMatrix('auto');encounterMatrix('immediate');
for(const timing of ['mixed','classic'])for(const route of ['safe','risk'])expeditionMatrix(timing,route);
for(const build of ['burst','control','support'])expeditionMatrix('mixed','safe',build,8);
