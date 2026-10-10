const fs=require('fs'),vm=require('vm'),assert=require('assert');
const nodes=new Map(),noop=()=>{},paint=new Proxy({},{get:()=>noop});
function element(){return {children:[],style:{},replaceChildren(){this.children=[]},append(x){this.children.push(x)},getContext:()=>paint,getBoundingClientRect:()=>({left:0,top:0,width:960,height:390})}}
const context=vm.createContext({window:{},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},createElement:element},requestAnimationFrame:noop});
const html=fs.readFileSync(`${__dirname}/lab.html`,'utf8');vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
const g=context.window.game,advance=n=>{for(let i=0;i<n*100;i++)g.step(.01)},cards=()=>g.state.hand.length+g.state.draw.length+g.state.discard.length;
assert.equal(cards(),20);const initial=g.state.hand.map(c=>c.id).join(',');
advance(7);assert(g.state.ready&&g.state.paused);const frozen=g.state.t;g.step(1);assert.equal(g.state.t,frozen);
g.wait();assert(g.state.ready&&!g.state.paused);assert.equal(g.state.hand.map(c=>c.id).join(','),initial);
advance(3);assert(g.state.paused&&g.state.events.some(e=>e.side===1));
g.pick(0);g.confirm();assert(!g.state.ready&&!g.state.paused);assert.equal(g.state.hand.length,5);assert(g.state.due>g.state.t);
g.state.actors[1].hp=0;g.step(.01);assert(![...g.state.hand,...g.state.draw,...g.state.discard].some(c=>['dash','heavy'].includes(c.key)));
g.reset();g.state.selected=0;g.reroll();assert.equal(g.state.rerolls,2);assert.equal(g.state.hand.map(c=>c.id).join(','),initial);
advance(7);g.pick(1);const before=g.state.hand.map(c=>c.id),time=g.state.t,due=g.state.due,enemyDue=g.state.enemyDue,events=g.state.events.length;g.reroll();
assert.equal(g.state.rerolls,1);assert.equal(g.state.hand.length,5);assert.equal(cards(),20);assert.equal(new Set([...g.state.hand,...g.state.draw,...g.state.discard].map(c=>c.id)).size,20);
assert.notEqual(g.state.hand[1].id,before[1]);before.forEach((id,i)=>{if(i!==1)assert.equal(g.state.hand[i].id,id)});assert(g.state.discard.some(c=>c.id===before[1]));
assert(g.state.ready&&g.state.paused);assert.equal(g.state.t,time);assert.equal(g.state.due,due);assert.equal(g.state.enemyDue,enemyDue);assert.equal(g.state.events.length,events);assert.equal(g.state.selected,-1);assert.equal(g.state.target,null);
g.pick(2);g.reroll();assert.equal(g.state.rerolls,0);g.pick(0);const exhausted=g.state.hand.map(c=>c.id).join(',');g.reroll();assert.equal(g.state.hand.map(c=>c.id).join(','),exhausted);assert.equal(g.state.rerolls,0);
g.reset();advance(7);g.pick(0);g.state.draw=[];g.state.discard=[];const noReplacement=g.state.hand.map(c=>c.id).join(',');g.reroll();assert.equal(g.state.rerolls,2);assert.equal(g.state.selected,0);assert.equal(g.state.hand.map(c=>c.id).join(','),noReplacement);
g.state.discard=[{key:'dash',id:100}];g.state.actors[1].hp=0;g.reroll();assert.equal(g.state.rerolls,2);assert.equal(g.state.hand.map(c=>c.id).join(','),noReplacement);
g.state.discard=[{key:g.state.hand[0].key,id:101}];g.reroll();assert.equal(g.state.hand[0].id,101);assert.equal(g.state.rerolls,1);assert.equal(g.state.discard.length,1);
g.reset();assert.equal(g.state.hand.map(c=>c.id).join(','),initial);
assert.equal(g.state.rerolls,2);
g.reset();assert.equal(context.basicTarget(g.state.actors[4]).id,0);g.state.actors[0].stance=1;assert.equal(context.basicTarget(g.state.actors[4]).id,1);
g.state.actors[0].stance=0;g.state.actors[1].x=680;g.state.actors[1].y=180;assert.equal(context.basicTarget(g.state.actors[4]).id,1,'Passive preference must not force a distant shield target');
function freezeBasics(){g.state.actors.forEach(a=>{a.cool=100;a.busy=100});g.state.enemyDue=100}
g.reset();advance(7);freezeBasics();let tauntIndex=g.state.hand.findIndex(c=>c.key==='taunt');if(tauntIndex<0){const i=g.state.draw.findIndex(c=>c.key==='taunt');assert(i>=0);[g.state.hand[0],g.state.draw[i]]=[g.state.draw[i],g.state.hand[0]];tauntIndex=0}
const start=g.state.t,shieldHP=g.state.actors[0].hp,warriorHP=g.state.actors[1].hp;
const incoming={at:start+.7,side:1,actor:4,target:1,kind:'attack',power:20,name:'시험 일격'};g.state.events.push(incoming);
g.pick(tauntIndex);assert.equal(g.state.target,null);g.confirm();assert.equal(g.state.due,start+5);assert.equal(context.forcedTarget(1),null);g.step(.1);assert.equal(context.eventTarget(incoming).id,1);
g.step(.11);assert.equal(context.forcedTarget(1).id,0);assert.equal(context.eventTarget(incoming).id,0);assert(nodes.get('telegraph').textContent.includes('→ 방패병'));
g.state.actors[0].stance=1;assert.equal(context.basicTarget(g.state.actors[4]).id,0,'Active taunt persists after stance changes');g.state.actors[0].stance=0;
g.step(.51);assert.equal(g.state.actors[1].hp,warriorHP);assert(Math.abs(g.state.actors[0].hp-(shieldHP-13))<1e-9);
const beforeArea=g.state.actors.map(a=>a.hp);g.state.events.push({at:g.state.t+.1,side:1,actor:6,kind:'area',power:10,name:'시험 범위 공격'});g.step(.11);assert.equal(g.state.actors[1].hp,beforeArea[1]-10);
g.step(4);assert.equal(context.forcedTarget(1),null);assert.equal(context.eventTarget({...incoming,at:g.state.t}).id,1);
g.reset();freezeBasics();const tieShield=g.state.actors[0].hp,tieWarrior=g.state.actors[1].hp;
g.state.events=[{at:1,side:1,actor:4,target:1,kind:'attack',power:20,name:'동시 일격'},{at:1,side:0,actor:0,kind:'taunt',duration:4}];g.step(1.02);assert.equal(g.state.actors[1].hp,tieWarrior);assert.equal(g.state.actors[0].hp,tieShield-13);
g.state.actors[0].hp=0;assert.equal(context.forcedTarget(1),null);assert.equal(context.eventTarget({...incoming,at:g.state.t}).id,1);assert.notEqual(context.basicTarget(g.state.actors[4]).id,0);
g.reset();freezeBasics();g.state.events=[{at:.9,side:1,actor:4,target:1,kind:'attack',power:20,name:'먼저 일격'},{at:1,side:0,actor:0,kind:'taunt',duration:4}];g.step(1.02);assert.equal(g.state.actors[1].hp,90);assert.equal(g.state.actors[0].hp,130,'Taunt cannot redirect an earlier hit');
g.reset();freezeBasics();g.state.events=[{at:1,side:0,actor:0,kind:'taunt',duration:4},{at:5,side:1,actor:4,target:1,kind:'attack',power:20,name:'만료 일격'}];g.step(5);assert.equal(g.state.actors[1].hp,90);assert.equal(g.state.actors[0].hp,130);
g.reset();assert.equal(g.state.hand.map(c=>c.id).join(','),initial);assert.equal(context.forcedTarget(1),null);
for(let i=0;i<24000&&!g.state.ended;i++){if(g.state.paused){g.pick(0);g.confirm()}else g.step(.01)}
assert(g.state.ended,'Battle must finish without a deadlock');console.log(`PASS: command flow, limited redraw, protective aggro, taunt timing/expiry/KO/AoE, replay; battle ${g.state.t.toFixed(1)}s.`);

