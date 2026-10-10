(function(root){
 'use strict';
 const CARDS={strike:{name:'타격',cost:1,target:'enemy',damage:6,icon:'✦',text:'피해 6'},guard:{name:'보호',cost:1,target:'ally',shield:6,icon:'◇',text:'보호 6'},check:{name:'견제',cost:1,target:'enemy',damage:4,selfShield:2,icon:'↗',text:'피해 4 · 자신 보호 2'},suppress:{name:'억제',cost:1,target:'enemy',weak:4,icon:'≋',text:'다음 공격의 피해 −4'},burst:{name:'돌파',cost:2,target:'enemy',damage:15,icon:'✧',text:'피해 15'},draw:{name:'정리',cost:1,target:'ally',draw:2,icon:'▱',text:'카드 2장 뽑기'},basic:{name:'기본 공격',cost:1,target:'enemy',damage:2,icon:'·',text:'피해 2 · 고유 효과 없음'}};
 const ROLES=[{id:'anchor',name:'버팀',ability:'첫 카드: 자신 보호 4',color:'#8bd6c5'},{id:'chase',name:'추격',ability:'첫 카드: 앞선 다른 동료의 공격 대상에 피해 4',color:'#ffbb86'},{id:'care',name:'돌봄',ability:'첫 카드: HP 비율이 가장 낮은 아군 보호 4',color:'#c5b0ff'},{id:'recall',name:'재현',ability:'첫 카드: 사용한 카드를 다음 손패에 보관',color:'#91c9ff'}];
 const clone=x=>JSON.parse(JSON.stringify(x));
 class Battle{
 constructor(mode='normal',seed=20261009,energyMode='reset'){if(!['reset','bank'].includes(energyMode))throw Error('에너지 규칙 오류');this.s={version:3,mode,energyMode,seed:seed>>>0,round:0,energy:0,status:'playing',memory:null,events:[],allies:ROLES.map(r=>({...r,hp:30,max:30,shield:0,ready:true})),enemies:[{id:'hunter',name:'사냥꾼',hp:30,max:30,shield:0,weak:0},{id:'shaman',name:'주술사',hp:26,max:26,shield:0,weak:0}],cards:{},zones:{draw:[],hand:[],resolving:[],discard:[],reserve:[],exhaust:[]},intents:[]};
 const pressure=['pressure-a','pressure-b','pressure-c','pressure-d','pressure-e'].includes(mode);
 const kinds=['strike','strike','strike','strike','guard','guard','guard','guard','check','suppress'];
 if(mode==='pressure-e')kinds.splice(0,kinds.length,'strike','guard','guard','suppress','guard','strike','strike','strike','guard','check');
 else if(pressure)kinds.splice(0,kinds.length,'strike','strike','guard','guard','suppress','strike','strike','guard','guard','check');
 else if(mode!=='normal') kinds.splice(0,kinds.length,'strike','guard','burst','suppress','draw','strike','guard','check','guard','strike');
 kinds.forEach((kind,i)=>{const id='c'+i;this.s.cards[id]={id,kind};this.s.zones.draw.push(id)});
 if(mode==='normal')this.shuffle(this.s.zones.draw);
 this.startRound();
 if(pressure){this.s.round=2;this.s.energy=2;this.s.allies[3].hp=8;const hp=['pressure-a','pressure-e'].includes(mode)?10:24;this.s.enemies=[{id:'hunter',name:'사냥꾼',hp,max:hp,shield:0,weak:0,focus:'recall',attackDamage:12}];if(mode==='pressure-d')this.s.enemies[0].pattern='vary';this.s.intents=[mode==='pressure-c'?{actor:'hunter',type:'prepare',damage:0,target:null,nextDamage:12,nextTarget:'recall'}:{actor:'hunter',type:'attack',damage:12,target:'recall'}]}
 else if(mode!=='normal'){this.s.allies[0].hp=10;this.s.allies[2].hp=6;this.s.enemies[0].hp=this.s.enemies[0].max=mode==='thick'?14:10;this.s.enemies[1].hp=this.s.enemies[1].max=20;this.s.intents=[{actor:'hunter',target:'care',damage:mode==='care'?10:12,type:'attack'},{actor:'shaman',target:'anchor',damage:8,type:'attack'}];if(mode==='care'){this.s.enemies[0].hp=this.s.enemies[0].max=40;this.s.enemies[1].hp=this.s.enemies[1].max=40;this.s.allies[0].hp=30;this.s.intents[1]={actor:'shaman',type:'prepare',damage:0,target:null}}}
 this.assert();}
 random(){let x=this.s.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.s.seed=x>>>0;return this.s.seed/4294967296}
 shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}}
 draw(n){while(n-->0){if(!this.s.zones.draw.length){this.s.zones.draw=this.s.zones.discard.splice(0);this.shuffle(this.s.zones.draw)}if(!this.s.zones.draw.length)break;this.s.zones.hand.push(this.s.zones.draw.shift())}}
 startRound(){this.s.energy=this.s.round===0||this.s.energyMode!=='bank'?4:Math.min(5,this.s.energy+2);this.s.round++;this.s.memory=null;this.s.allies.forEach(a=>a.ready=a.hp>0);this.s.zones.hand.push(...this.s.zones.reserve.splice(0));this.draw(Math.max(0,5-this.s.zones.hand.length));const living=this.s.allies.filter(a=>a.hp>0);this.s.intents=this.s.enemies.filter(e=>e.hp>0).map(e=>this.enemyIntent(e,living))}
 enemyIntent(e,living){
 const target=id=>living.find(a=>a.id===id)?.id||living[0].id;
 if(e.pattern==='vary'){
 const phase=(this.s.round-2)%4;
 if(phase===1)return {actor:e.id,type:'area',target:null,damage:3};
 if(phase===2)return {actor:e.id,type:'prepare',target:null,damage:0,nextTarget:target('anchor'),nextDamage:12};
 return {actor:e.id,type:'attack',target:target(phase===3?'anchor':'recall'),damage:12};
 }
 if(e.focus)return {actor:e.id,type:'attack',target:target(e.focus),damage:e.attackDamage};
 if(e.id==='shaman')return this.s.round%2===1?{actor:e.id,type:'prepare',target:null,damage:0}:{actor:e.id,type:'area',target:null,damage:5};
 return {actor:e.id,type:'attack',target:living[Math.floor(this.random()*living.length)].id,damage:8};
 }
 actor(id){return [...this.s.allies,...this.s.enemies].find(a=>a.id===id)}
 definition(id){return id==='basic'?CARDS.basic:CARDS[this.s.cards[id]?.kind]}
 validate(card,actor,target){const c=this.definition(card),a=this.s.allies.find(x=>x.id===actor),targets=c?.target==='enemy'?this.s.enemies:this.s.allies;if(this.s.status!=='playing'||!c||!a||a.hp<=0||this.s.energy<c.cost||(card!=='basic'&&!this.s.zones.hand.includes(card))||!targets.some(t=>t.id===target&&t.hp>0))throw Error('유효하지 않은 행동');return c}
 hit(id,amount){const a=this.actor(id);if(!a||a.hp<=0)return;const absorb=Math.min(a.shield,amount);a.shield-=absorb;a.hp=Math.max(0,a.hp-(amount-absorb));this.s.events.push({type:'damage',target:id,amount:amount-absorb,absorbed:absorb})}
 shield(id,n){const a=this.actor(id);if(a&&a.hp>0){a.shield+=n;this.s.events.push({type:'shield',target:id,amount:n})}}
 play(card,actor,target){const c=this.validate(card,actor,target),a=this.actor(actor),previous=clone(this.s.memory),first=card!=='basic'&&a.ready;const care=this.s.allies.filter(x=>x.hp>0).reduce((best,x)=>!best||x.hp/x.max<best.hp/best.max?x:best,null)?.id;this.s.events=[];this.s.energy-=c.cost;
 if(card!=='basic'){this.s.zones.hand.splice(this.s.zones.hand.indexOf(card),1);this.s.zones.resolving.push(card);if(first)a.ready=false}
 if(c.damage)this.hit(target,c.damage);if(c.shield)this.shield(target,c.shield);if(c.selfShield)this.shield(actor,c.selfShield);if(c.weak&&this.actor(target).hp>0)this.actor(target).weak=Math.max(this.actor(target).weak,c.weak);if(c.draw)this.draw(c.draw);
 if(first&&a.hp>0){if(actor==='anchor')this.shield(actor,4);if(actor==='care')this.shield(care,4);if(actor==='chase'&&previous&&previous.actor!==actor)this.hit(previous.target,4)}
 if(card!=='basic'){if(c.damage)this.s.memory={actor,target};this.s.zones.resolving.splice(0);this.s.zones[first&&actor==='recall'?'reserve':'discard'].push(card)}
 this.finish();this.assert();return clone(this.s.events)}
 finish(){if(this.s.allies.every(a=>a.hp<=0))this.s.status='lost';else if(this.s.enemies.every(a=>a.hp<=0))this.s.status='won'}
 endRound(){if(this.s.status!=='playing')throw Error('종료된 전투');this.s.events=[];this.s.zones.discard.push(...this.s.zones.hand.splice(0));this.s.enemies.forEach(e=>e.shield=0);for(const intent of this.s.intents){const e=this.actor(intent.actor);if(e.hp<=0||intent.type==='prepare'||intent.type==='attack'&&this.actor(intent.target).hp<=0)continue;const damage=Math.max(0,intent.damage-e.weak);if(intent.type==='area')this.s.allies.filter(a=>a.hp>0).forEach(a=>this.hit(a.id,damage));else this.hit(intent.target,damage);e.weak=0;this.finish();if(this.s.status!=='playing')break}this.s.allies.forEach(a=>a.shield=0);this.finish();if(this.s.status==='playing')this.startRound();this.assert();return clone(this.s.events)}
 snapshot(){return clone(this.s)}
 static restore(s){const b=Object.create(Battle.prototype);b.s=clone(s);if(b.s.version!==3)throw Error('다른 저장 버전');b.assert();return b}
 preview(card,actor,target){const b=Battle.restore(this.snapshot());b.play(card,actor,target);return b.snapshot()}
 assert(){const ids=Object.values(this.s.zones).flat();if(ids.length!==Object.keys(this.s.cards).length||new Set(ids).size!==ids.length||ids.some(id=>!this.s.cards[id]))throw Error('실물 카드 영역 오류');if(!Number.isInteger(this.s.energy)||this.s.energy<0||this.s.energy>(this.s.energyMode==='bank'?5:4))throw Error('에너지 오류');return true}
 }
 const api={Battle,CARDS,ROLES};if(typeof module!=='undefined')module.exports=api;else root.PartyV3=api;
})(typeof window!=='undefined'?window:globalThis);
