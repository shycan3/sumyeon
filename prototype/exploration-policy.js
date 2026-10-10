(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./exploration-combat.js'):root.ExplorationCombat;
  // Only the current hand and publicly announced intents are evaluated. No
  // future draw identity or next-round enemy intent is examined.
  function risk(b){let total=0;for(const a of b.s.allies.filter(a=>a.hp>0)){let damage=0;for(const i of b.s.intents){if(b.actor(i.actor)?.hp<=0||!['attack','area','volley'].includes(i.type))continue;if(i.type==='area'||i.target===a.id||i.targets?.includes(a.id))damage+=b.intentDamage(i);}const loss=Math.min(a.hp,Math.max(0,damage-a.shield));total+=loss+(loss===a.hp?12:0);}return total;}
  function choose(b){if(b.s.status!=='playing')return null;if(b.s.needsTrim){const score=id=>{const d=b.definition(id);return(d.damage||0)+(d.shield||0)+(d.heal||0)+(d.draw||0)*3;};return{type:'trim',card:[...b.s.zones.hand].sort((a,c)=>score(a)-score(c))[0]};}
    const beforeRisk=risk(b);let best=null,bestScore=-Infinity;
    for(const card of [...b.s.zones.hand,'basic']){const base=b.definition(card);for(const actor of b.s.allies.filter(a=>a.hp>0)){if(b.costFor(card,actor.id)>b.s.energy)continue;for(const choice of base.choices?base.choices.map((_,i)=>i):[undefined])for(const target of(b.definition(card,choice).target==='enemy'?b.s.enemies:b.s.allies).filter(a=>a.hp>0)){const after=C.Battle.restore(b.preview(card,actor.id,target.id,choice));const damage=b.s.enemies.reduce((n,a)=>n+a.hp,0)-after.s.enemies.reduce((n,a)=>n+a.hp,0),heal=after.s.allies.reduce((n,a,i)=>n+a.hp-b.s.allies[i].hp,0),draw=after.s.zones.hand.length-b.s.zones.hand.length+(card==='basic'?0:1);const score=damage*1.2+heal*2+(beforeRisk-risk(after))*2+draw*2+(after.s.energy-b.s.energy)*2+(after.s.status==='won'?1000:0);if(score>bestScore){bestScore=score;best={type:'play',card,actor:actor.id,target:target.id,...(choice!==undefined?{choice}:{})};}}}}
    return best||{type:'end'};
  }
  const api={choose,risk};if(typeof module!=='undefined')module.exports=api;root.ExplorationPolicy=api;
})(typeof globalThis!=='undefined'?globalThis:this);
