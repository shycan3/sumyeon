'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const context=vm.createContext({window:{}});
for(const file of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context,{filename:file});
const D=context.window.GameData,G=context.window.GameCore,B=G.Battle;
const clone=value=>JSON.parse(JSON.stringify(value));
function make(elite=false,timing='mixed'){
  let n=0;const cards=Object.entries(D.starter).flatMap(([key,count])=>Array.from({length:count},()=>({id:'copy'+n++,key,upgraded:false})));
  return new B({seed:137,levels:[1,1,1,1],hp:D.roles.map(r=>r.hp),stances:[0,0,0,0],depth:0,elite,encounter:D.encounters[2],timing,cards});
}
function freeze(b){for(const a of b.s.actors){a.busy=1000;a.cool=1000;}b.s.due=b.s.enemyDue=1000;}
function advance(b,seconds){for(let t=0;t<seconds-1e-8;t+=.05)b.step(Math.min(.05,seconds-t));}
function install(b,key,side=0,actor){const c={id:'installed-'+key+'-'+side,key,upgraded:false,actor:actor||'a'+D.cards[key].role};b.s.decks[side].hand=[c];if(side===0){b.s.ready=true;b.s.paused=true;b.select(c.id);}else b.s.enemyReady=true;return c;}
const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-6,`${message}: ${actual} != ${expected}`);
const attack=(at,side=0,actor='a2',target='e2',power=24)=>({at,side,actor,target,power,kind:'attack',name:'시험 공격'});

// A guard that starts after the hit, or expires before it, must not consume an AI command.
{
  const b=make();freeze(b);b.s.t=1;b.s.enemyDue=1;
  const guard=install(b,'guard',1,'e0');b.s.decks[1].draw=[];b.s.decks[1].discard=[];b.s.events=[attack(1.1)];
  assert.equal(b.tacticalScore(guard,null),0);b.enemy();assert.equal(b.s.history.length,0);
  b.s.events=[attack(5)];assert.equal(b.tacticalScore(guard,null),0);
  b.s.events=[attack(1.2)];assert(b.tacticalScore(guard,null)>0);b.enemy();
  assert.equal(b.s.history.at(-1).key,'guard');assert.equal(b.s.history.at(-1).cardId,guard.id);
  const hp=b.get('e2').hp;advance(b,.25);assert.equal(b.get('e2').hp,hp);assert.equal(b.s.stats.blocked[1],1);
}
// Pressure is independent of temporary buffs for both card and basic damage.
{
  const b=make();freeze(b);b.s.t=80;const enemy=b.get('e2'),target=b.get('a2');enemy.buff=.3;enemy.buffUntil=90;
  b.step(.05);assert.equal(enemy.buff,.3);assert.equal(enemy.buffUntil,90);assert.equal(b.s.pressure,1);
  const hp=target.hp;b.resolve(attack(b.s.t,1,enemy.id,target.id,10));close(hp-target.hp,10*.78*1.3*1.12,'card buff and pressure combine');
  enemy.x=600;enemy.y=300;target.x=500;target.y=300;enemy.busy=0;enemy.cool=0;enemy.stance=1;
  const before=target.hp;b.basics(.01);close(before-target.hp,enemy.damage*1.3*1.3*1.12,'basic buff and pressure combine');
  b.s.t=95;close(b.pressureMultiplier(1),1.24,'pressure stage advances');assert.equal(enemy.buff,.3);
}
// Heavy approaches before its reliable hit; dash moves immediately, even when blocked.
{
  const b=make();freeze(b);const c=install(b,'heavy'),actor=b.get(c.actor),target=b.get('e2');
  actor.x=100;actor.y=300;target.x=900;target.y=300;
  close(b.preparation(c,target.id,0),D.cards.heavy.prep+1.2,'bounded distant approach');
  const hp=target.hp;b.s.target=target.id;assert(b.confirm());advance(b,.5);assert.equal(target.hp,hp);assert(actor.x>100);
  advance(b,1.4);assert(target.hp<hp);assert(Math.hypot(actor.x-target.x,actor.y-target.y)<=D.cards.heavy.reach+1);
  const near=make();freeze(near);const hc=install(near,'heavy'),ha=near.get(hc.actor),ht=near.get('e2');ha.x=ht.x-60;ha.y=ht.y;
  close(near.preparation(hc,ht.id,0),D.cards.heavy.prep,'no extra near preparation');
  const dash=make();freeze(dash);const dc=install(dash,'dash'),da=dash.get(dc.actor),dt=dash.get('e2');dash.s.guards[1]={until:5,n:1};dash.s.target=dt.id;
  const dhp=dt.hp;assert(dash.confirm());assert.equal(dt.hp,dhp);assert(Math.hypot(da.x-dt.x,da.y-dt.y)<=43);
}
// Limited areas use the selected fixed center and real impact positions; global areas remain global.
{
  const b=make();freeze(b);const enemies=b.alive(1);enemies[0].x=500;enemies[0].y=100;enemies[1].x=540;enemies[1].y=100;enemies[2].x=880;enemies[2].y=300;
  const c=install(b,'cleave');assert(G.targeted(b.definition(c)));assert.equal(b.recommend(c),enemies[1].id);
  assert(b.target(enemies[0].id));const before=enemies.map(a=>a.hp);assert(b.confirm());assert(enemies[0].hp<before[0]&&enemies[1].hp<before[1]);assert.equal(enemies[2].hp,before[2]);
  const slow=make(false,'classic');freeze(slow);const sc=install(slow,'slam'),foes=slow.alive(1);foes[0].x=500;foes[0].y=100;foes[1].x=550;foes[1].y=100;foes[2].x=890;foes[2].y=300;
  slow.s.target=foes[0].id;slow.confirm();const e=slow.s.events[0];assert.equal(e.center.x,500);
  foes[0].x=900;foes[0].y=300;foes[2].x=510;foes[2].y=100;
  const hits=slow.areaTargets(e).map(a=>a.id);assert(!hits.includes(foes[0].id));assert(hits.includes(foes[1].id)&&hits.includes(foes[2].id));
  const hp=foes.map(a=>a.hp);advance(slow,.75);assert.equal(foes[0].hp,hp[0]);assert(foes[1].hp<hp[1]&&foes[2].hp<hp[2]);
  assert.equal(b.areaTargets({...D.cards.volley,side:0}).length,3);assert.equal(b.areaTargets({...D.hostile.quake,side:1}).length,4);
  // Old stored area events had no radius and still mean all opponents.
  assert.equal(b.areaTargets({kind:'area',side:0,key:'cleave'}).length,3);
}
// Frost postpones one preparing attack once, including a later event in the same update frame.
{
  const b=make();freeze(b);const hit={...attack(.08,1,'e2','a2',20),cardId:'pending-copy'},frost={...D.cards.frost,at:.04,side:0,actor:'a2',target:'e2',name:'구속 사격'};
  b.s.events=[hit,frost];const hp=b.get('a2').hp;b.step(.1);
  assert.equal(b.get('a2').hp,hp);close(hit.at,1.08,'same-frame attack delayed');assert.equal(hit.delayCount,1);assert(b.get('e2').busy>=1.23);assert(b.get('e2').slowUntil>0);assert.equal(b.s.stats.delayed[0],1);
  b.resolve({...frost,at:.1});close(hit.at,1.08,'no stacked delay');assert.equal(b.s.stats.delayed[0],1);
  const saved=b.snapshot(),restored=new B({},saved);advance(b,1.05);advance(restored,1.05);assert(b.get('a2').hp<hp);assert.deepEqual(clone(restored.snapshot()),clone(b.snapshot()));
  const heal={kind:'heal',at:3,side:1,actor:'e2',target:'e1',power:10,name:'회복'};b.s.events=[heal];b.resolve({...frost,at:b.s.t});assert.equal(heal.at,3);
  const score=make();freeze(score);const card=install(score,'frost'),target=score.get('e2'),baseline=score.tacticalScore(card,target.id);score.s.events=[attack(1,1,target.id,'a2')];assert(score.tacticalScore(card,target.id)>baseline);
}
// Marking an already marked actor gives less value, and copied commands stay distinguishable.
{
  const b=make();freeze(b);const c=install(b,'mark'),target=b.get('e2');const fresh=b.tacticalScore(c,target.id);target.markUntil=10;assert(b.tacticalScore(c,target.id)<fresh);
  b.s.target=target.id;b.confirm();assert.equal(b.s.history.at(-1).cardId,c.id);assert(target.markUntil>0);assert(b.stance('a1'));assert.equal(b.s.stats.stanceChanges,0);assert.equal(b.get('a1').nextStance,1);
  const elite=make(true),normal=make(false);assert.equal(elite.get('e2').max,Math.round(D.encounters[2].enemies[2].hp*1.10));close(elite.get('e2').damage/normal.get('e2').damage,1.08,'elite damage tuning');
}
// Stance changes are reserved, cancellable, held for three seconds and survive saves.
{
  const b=make();b.s.paused=true;const a=b.get('a0'),due=b.s.due;
  assert(b.stance(a.id));assert.equal(a.stance,0);assert.equal(a.nextStance,1);assert(b.stance(a.id));assert.equal(a.nextStance,null);
  assert(b.stance(a.id));const restored=new B({},b.snapshot());a.cool=0;a.busy=0;b.basics(.01);
  const ra=restored.get(a.id);ra.cool=0;ra.busy=0;restored.basics(.01);assert.equal(ra.stance,1);assert.equal(a.stance,1);assert.equal(b.s.stats.stanceChanges,1);assert.equal(b.s.due,due);assert(!b.stance(a.id));
  b.s.t=3.01;assert(b.stance(a.id));assert.equal(a.stance,1);a.cool=0;b.basics(.01);assert.equal(a.stance,0);
  assert(D.cards.heavy.power>2*D.cards.dash.power,'slow attack must beat two fast attacks in raw damage');
}
console.log('PASS: timely AI guard, independent pressure/buffs, heavy approach/dash, fixed limited-area targeting, single frost delay and deterministic resume, tactical marks, command copy IDs, elite scaling.');
