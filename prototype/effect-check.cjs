'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),c=vm.createContext({window:{}});
for(const f of ['data','character-data','actor-ai','engine','campaign','character-engine','character-campaign'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),c);
const W=c.window,D=W.GameData,B=W.CharacterBattle,C=W.CharacterCampaign,copy=x=>JSON.parse(JSON.stringify(x));
function make(){const camp=new C.Campaign();camp.start(1);camp.enter(camp.run.map[0][0].id);const b=camp.battle;b.s.due=b.s.enemyDue=1000;for(const a of b.s.actors){a.x=850;a.y=330;a.cool=1000;a.busy=1000;a.stance=1;}b.get('a0').x=30;b.get('a0').y=30;return b;}
const near=(a,x=200)=>{a.x=x;a.y=150;};
const close=(a,z)=>assert(Math.abs(a-z)<1e-8, a+' != '+z);
function event(b,kind,target='a3',power=20,duration=5,actor='a1',key='serin_parry'){return {kind,side:0,actor,target,power,duration,at:b.s.t,key,cardId:'effects',name:'test'};}
{
 const b=make(),a=b.get('a3');b.s.t=1;
 for(const kind of ['ward','armor','buff']){const value={ward:'shield',armor:'armor',buff:'buff'}[kind],until={ward:'shieldUntil',armor:'armorUntil',buff:'buffUntil'}[kind];b.applyEffect(a,kind,20,8);b.applyEffect(a,kind,10,4);assert.equal(a[value],20);assert.equal(a[until],8);b.applyEffect(a,kind,25,6);assert.equal(a[value],25);assert.equal(a[until],8);b.s.t=8;b.applyEffect(a,kind,7,10);assert.equal(a[value],7,'expired value cannot resurrect');assert.equal(a[until],10);b.s.t=1;}
 for(const kind of ['mark','slow']){b.applyEffect(a,kind,0,8);b.applyEffect(a,kind,0,3);assert.equal(a[kind+'Until'],8);}
 b.applyCounter(b.get('a1'),25,8,'serin_parry');b.applyCounter(b.get('a1'),22,5,'serin_cover');assert.equal(b.get('a1').counter.power,25);assert.equal(b.get('a1').counter.until,8);assert.equal(b.get('a1').counter.key,'serin_parry');
 b.resolve(event(b,'guard',null,0,8,'a0','guard'));b.resolve(event(b,'guard',null,0,2,'a0','guard'));assert.equal(b.s.guards[0].n,1);assert.equal(b.s.guards[0].until,9);assert(!b.guardActive(0,9));
 b.resolve(event(b,'taunt',null,0,8,'a0','taunt'));b.resolve(event(b,'taunt',null,0,2,'a1','taunt'));assert.equal(b.s.taunts[0].actor,'a1');assert.equal(b.s.taunts[0].until,3);
 b.s.t=10;b.checkEnd();for(const field of ['shield','armor','buff','shieldUntil','armorUntil','buffUntil','slowUntil','markUntil'])assert.equal(a[field],0);assert(!b.get('a1').counter);assert.equal(b.s.guards[0].n,0);assert.equal(b.s.taunts[0].actor,null);
}
{
 const b=make(),target=b.get('a3'),cover=b.get('a1'),guardian=b.get('a0');near(target);near(cover,230);near(guardian,180);guardian.stance=0;
 target.markUntil=5;target.armor=.5;target.armorUntil=5;target.shield=15;target.shieldUntil=5;cover.purpose={kind:'cover',target:target.id,until:5};
 const hp=[target.hp,cover.hp,guardian.hp];close(b.damage(target,100,1,'card',false,'shot','e1'),50);close(hp[0]-target.hp,37.5);close(hp[1]-cover.hp,12.5);close(hp[2]-guardian.hp,0);close(b.s.stats.covered,12.5);close(b.s.stats.damage[1],50);close(b.s.stats.byCard[1].shot,50);
 close(b.s.stats.received.reduce((a,z)=>a+z,0),50);
}
{
 const b=make(),a=b.get('a3'),cover=b.get('a1');near(a);near(cover,230);cover.purpose={kind:'cover',target:a.id,until:5};cover.shield=100;cover.shieldUntil=5;cover.armor=.5;cover.armorUntil=5;cover.markUntil=5;cover.hp=2;cover.counter={until:5,power:22,key:'serin_cover'};
 const hp=a.hp;b.damage(a,40,1,'basic',false,null,'e1');assert.equal(cover.hp,0);close(hp-a.hp,38);assert.equal(cover.shield,100,'final redirected injury is not defended again');assert.equal(b.s.stats.counters,0);assert.equal(b.s.knockouts.filter(x=>x.actor===cover.id).length,1);assert(b.s.knockouts.find(x=>x.actor===cover.id).protected);assert(b.visuals.some(x=>x.type==='ally-down'&&x.actor==='e1'));
}
{
 const b=make(),a=b.get('a3'),cover=b.get('a1');near(a);near(cover,230);cover.purpose={kind:'cover',target:a.id,until:5};cover.counter={until:5,power:22,key:'serin_cover'};a.shield=100;a.shieldUntil=5;b.damage(a,10,1,'basic',false,null,'e1');assert.equal(b.s.stats.covered,0);assert.equal(b.s.stats.counters,0);assert(cover.counter);
 cover.shield=100;cover.shieldUntil=5;const hp=b.get('e1').hp;b.damage(cover,10,1,'basic',false,null,'e1');close(hp-b.get('e1').hp,22);assert.equal(b.s.stats.counters,1);b.damage(cover,10,1,'basic',false,null,'e1');assert.equal(b.s.stats.counters,1);
 const missing=make();missing.get('a1').counter={until:5,power:25,key:'serin_parry'};missing.damage(missing.get('a1'),1,1,'basic',false,null,null);assert.equal(missing.s.stats.counters,0);assert(missing.get('a1').counter,'invalid attacker does not consume a reaction');
}
{
 const b=make(),a=b.get('a3');a.armor=.5;a.armorUntil=1;a.shield=10;a.shieldUntil=1;b.s.t=1;const hp=a.hp;b.damage(a,20,1,'card',true,'pierce','e1');close(hp-a.hp,20);
 const inside=make(),target=inside.get('a3');target.shield=30;target.shieldUntil=.01;inside.s.events.push({...event(inside,'attack',target.id,20,0,'e1','shot'),side:1,at:.005});inside.step(.02);assert.equal(target.hp,target.max,'scheduled event evaluates effects at its own time inside a tick');
 const boundary=make(),x=boundary.get('a3');x.shield=30;x.shieldUntil=.01;boundary.s.events.push({...event(boundary,'attack',x.id,20,0,'e1','shot'),side:1,at:.01});boundary.step(.02);close(x.max-x.hp,20*.78);
}
{
 const camp=new C.Campaign();camp.start(7);camp.enter(camp.run.map[0][0].id);const b=camp.battle;for(const a of b.s.actors)a.cool=1000;
 b.applyEffect(b.get('a3'),'ward',28,5);b.applyEffect(b.get('a3'),'armor',.3,3);b.applyCounter(b.get('a1'),25,4,'serin_parry');b.get('a1').purpose={kind:'cover',target:'a3',until:5,source:'serin_cover',controls:'movement'};b.s.guards[0]={n:1,until:2};b.s.taunts[0]={from:0,until:3,actor:'a0'};
 b.s.events.push({...event(b,'attack','a3',30,0,'e1','shot'),side:1,at:1});const saved=camp.snapshot();C.validate(saved);const restored=new C.Campaign(copy(saved));for(let i=0;i<300&&!b.s.ended;i++){b.step(.02);restored.battle.step(.02);}assert.deepEqual(b.snapshot(),restored.battle.snapshot());
 const old=copy(saved);delete old.run.battle.effectRulesVersion;C.validate(old);assert.equal(new C.Campaign(old).battle.s.effectRulesVersion,1);const invalid=copy(saved);invalid.run.battle.effectRulesVersion=99;assert.throws(()=>C.validate(invalid));invalid.run.battle.effectRulesVersion=1;invalid.run.battle.actors[0].shield=-1;assert.throws(()=>C.validate(invalid));
}
{
 // Pierce bypasses armor/stance but still respects mark, shield and one passive protector.
 const b=make(),a=b.get('a3'),guard=b.get('a0');near(a);near(guard,230);guard.stance=0;a.armor=.5;a.armorUntil=5;a.markUntil=5;a.shield=10;a.shieldUntil=5;const hp=[a.hp,guard.hp];close(b.damage(a,40,1,'card',true,'pierce','e1'),42);close(hp[0]-a.hp,33.6);close(hp[1]-guard.hp,8.4);close(b.s.stats.protected[0],8.4);
 b.resolve(event(b,'cleanse',a.id,10,0,'a3','cleanse'));assert.equal(a.markUntil,0);assert.equal(a.slowUntil,0);
 // Guard consumes the whole card event before damage, shields, sharing or reactions.
 const blocked=make(),x=blocked.get('a3');x.shield=10;x.shieldUntil=5;blocked.s.guards[0]={n:1,until:5};const before=x.hp;blocked.resolve({...event(blocked,'attack',x.id,40,0,'e1','shot'),side:1});assert.equal(x.hp,before);assert.equal(x.shield,10);assert.equal(blocked.s.guards[0].n,0);assert.equal(blocked.s.stats.blocked[0],1);
 // Equal-time defensive events take priority over attacks.
 const same=make(),z=same.get('a3');same.s.events.push({...event(same,'attack',z.id,20,0,'e1','shot'),side:1,at:.02},{...event(same,'ward',z.id,30,5,'a3','ward'),at:.02});same.step(.02);assert.equal(z.hp,z.max);close(z.shield,30-20*.78);
}
console.log('PASS: non-additive refresh/expiry, taunt replacement and single guard/counter, ordered mitigation/shield/exclusive sharing/KO/accounting, non-recursive reactions, exact event-time boundaries, effect-save migration/validation/deterministic continuation.');
