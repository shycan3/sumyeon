(function (root) {
  'use strict';
  const Combat = typeof module !== 'undefined' ? require('./party-expedition-core.js') : root.PartyExpedition;
  const { Battle } = Combat;
  const hp = s => s.allies.reduce((n,a)=>n+a.hp+(a.hp>0?28:0),0);
  const enemyHP = s => s.enemies.reduce((n,a)=>n+a.hp,0);
  // Only current public intents are evaluated. The resulting next hand and
  // future intents are deliberately not used by the decision score.
  function enemyResult(state) {
    const b=Battle.restore(state);
    if(b.s.status==='playing')b.endRound();
    return {health:hp(b.s),enemyHP:enemyHP(b.s),carried:b.s.allies.reduce((n,a)=>n+a.shield,0)};
  }
  function actions(b) {
    const result=[];
    for(const card of [...b.s.zones.hand,'basic']){
      const base=b.definition(card);
      const variants=base.choices?base.choices.map((_,choice)=>({d:b.definition(card,choice),choice})):[{d:base}];
      for(const {d,choice}of variants){const targets=d.target==='enemy'?b.s.enemies:b.s.allies;
      for(const actor of b.s.allies.filter(a=>a.hp>0)){
        if(b.costFor(card,actor.id)>b.s.energy)continue;
        for(const target of targets.filter(a=>a.hp>0)){
          b.validate(card,actor.id,target.id,choice);
          result.push({type:'play',card,actor:actor.id,target:target.id,...(choice!==undefined?{choice}:{})});
        }
      }
      }
    }
    return result;
  }
  function score(b,action,baseline) {
    const after=b.preview(action.card,action.actor,action.target,action.choice);
    if(after.status==='won')return 10000+hp(after);
    const result=enemyResult(after),s=b.s;
    const damage=enemyHP(s)-enemyHP(after);
    const drawn=after.zones.hand.length-s.zones.hand.length+(action.card==='basic'?0:1);
    const reserve=after.zones.reserve.length-s.zones.reserve.length;
    const exposure=after.enemies.reduce((n,a)=>n+(a.hp>0?a.exposure:0),0)-s.enemies.reduce((n,a)=>n+(a.hp>0?a.exposure:0),0);
    const weak=after.enemies.reduce((n,a)=>n+(a.hp>0?a.weak:0),0)-s.enemies.reduce((n,a)=>n+(a.hp>0?a.weak:0),0);
    const kills=s.enemies.filter(a=>a.hp>0).length-after.enemies.filter(a=>a.hp>0).length;
    const weights={assaultDamage:4,shieldReaction:4,roundShield:5,exposureBonus:3,disruptShield:3,firstCycleDraw:3,firstExhaustDraw:3,roundEnergy:8,roundHeal:4};
    const healthHorizon=Math.min(1,enemyHP(after)/45);
    const installed=Object.entries(after.powers||{}).reduce((n,[key,v])=>n+(v-(s.powers?.[key]||0))*(weights[key]||0),0)*healthHorizon;
    const prepared=(after.pending?.energy||0)-(s.pending?.energy||0);
    const readyShield=Object.values(after.pending?.shields||{}).reduce((n,v)=>n+v,0)-Object.values(s.pending?.shields||{}).reduce((n,v)=>n+v,0);
    return damage*1.2+(result.health-baseline.health)*1.5+Math.max(0,enemyHP(after)-result.enemyHP)*1.1
      +kills*5+drawn*1.5+reserve*1.8+exposure*.65+weak*.15+(result.carried-baseline.carried)*.4
      +(after.energy-s.energy)*2+installed+prepared*1.5+readyShield*.45;
  }
  function trim(b) {
    const threatened=b.s.intents.some(i=>['attack','area','volley'].includes(i.type));
    const worth=id=>{const d=b.definition(id);return (d.damage||d.areaDamage||0)+(threatened?(d.shield||0)+(d.allShield||0)*2+(d.weak||0):0)
      +(d.energy||0)*5+(d.draw||0)*3+(d.heal||0)*.7+(d.exposure||0)*.5+(d.power?5:0)+(d.retain?2:0)+(d.choices?4:0)-(d.cost==='X'?b.s.energy:d.cost);};
    return [...b.s.zones.hand].sort((a,c)=>worth(a)-worth(c))[0];
  }
  function choose(b) {
    if(!b||b.s.status!=='playing')return null;
    if(b.s.needsTrim)return {type:'discard',card:trim(b)};
    const baseline=enemyResult(b.snapshot());
    let best={type:'end'},value=.05;
    for(const action of actions(b)){
      const next=score(b,action,baseline);
      if(next>value){best=action;value=next;}
    }
    return best;
  }
  function chooseVoyage(b,policy='manual') {
    if(policy!=='emergency'||!b?.s.voyage?.tools.length||b.s.needsTrim||b.s.status!=='playing')return choose(b);
    const baseline=enemyResult(b.snapshot());
    const survivors=s=>s.allies.filter(a=>a.hp>0).length;
    const baselineState=Battle.restore(b.snapshot());baselineState.endRound();
    if(survivors(baselineState.s)>=survivors(b.s))return choose(b);
    const ordinary=choose(b);
    if(ordinary?.type==='play'){
      const safe=Battle.restore(b.preview(ordinary.card,ordinary.actor,ordinary.target,ordinary.choice));
      if(safe.s.status==='playing'&&!safe.s.needsTrim)safe.endRound();
      if(survivors(safe.s)>=survivors(b.s))return ordinary;
    }
    let best=null,value=baseline.health;
    b.s.voyage.tools.forEach((id,slot)=>{
      // A draw tool cannot expose future card identities to the decision policy.
      if(id==='chart')return;
      const targets=id==='medicine'?b.s.allies.filter(a=>a.hp>0).map(a=>a.id):id==='flare'?b.s.enemies.filter(a=>a.hp>0).map(a=>a.id):[undefined];
      targets.forEach(target=>{
        const after=Battle.restore(b.previewTool(slot,target));
        let result=enemyResult(after.snapshot());
        // Evaluate one ordinary action for tools which prepare rather than shield.
        // The existing policy sees the resulting public hand and current intents only.
        if(['battery','flare'].includes(id)){
          const next=choose(after);
          if(next?.type==='play')result=enemyResult(after.preview(next.card,next.actor,next.target,next.choice));
        }
        if(result.health>value+3){best={type:'tool',slot,...(target?{target}:{})};value=result.health;}
      });
    });
    return best||ordinary;
  }
  // One pending action at a time. Stopping invalidates queued work without
  // reversing an action that has already completed in the combat engine.
  function createController(options) {
    const clock=options.clock||{setTimeout:(fn,delay)=>setTimeout(fn,delay),clearTimeout:id=>clearTimeout(id)};
    let enabled=false,timer=null,inFlight=false,generation=0,steps=0;
    const clear=()=>{if(timer!==null)clock.clearTimeout(timer);timer=null;};
    function stop(reason='manual'){
      clear();generation++;
      if(enabled){enabled=false;options.onChange?.(false,reason);}
    }
    function wake(){
      if(!enabled||inFlight||timer!==null||!options.ready())return;
      timer=clock.setTimeout(pump,options.delay?.()??650);
    }
    async function pump(){
      timer=null;
      if(!enabled||inFlight||!options.ready())return;
      const current=generation;inFlight=true;
      try{
        if(++steps>(options.maxSteps??300)){stop('limit');return;}
        const action=options.decide();
        if(!action){stop('finished');return;}
        const ok=await options.execute(action);
        if(current===generation&&ok===false)stop('error');
      }catch(error){stop('error');options.onError?.(error);}
      finally{inFlight=false;wake();}
    }
    return {get enabled(){return enabled;},start(){if(enabled)return;enabled=true;generation++;steps=0;options.onChange?.(true,'start');wake();},stop,pause:clear,wake};
  }
  const api={choose,chooseVoyage,createController};
  if(typeof module!=='undefined')module.exports=api;
  else root.PartyExpeditionAuto=api;
})(typeof globalThis!=='undefined'?globalThis:this);
