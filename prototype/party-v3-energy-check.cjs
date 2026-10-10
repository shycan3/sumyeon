const assert=require('node:assert/strict');
const {Battle}=require('./party-v3-core.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name)}
const bank=()=>new Battle('cross',20261009,'bank');
test('Bank starts at four, spends four then recovers to two',()=>{const b=bank();assert.equal(b.s.energy,4);b.play('c0','anchor','hunter');b.play('c1','chase','anchor');b.play('c2','recall','shaman');assert.equal(b.s.energy,0);b.endRound();assert.equal(b.s.energy,2);assert.equal(b.s.zones.hand.length,5);assert.ok(b.s.zones.hand.includes('c2'))});
test('Spending two leaves two and next round restores four',()=>{const b=bank();b.play('c2','recall','hunter');assert.equal(b.s.energy,2);b.endRound();assert.equal(b.s.energy,4)});
test('Spending one banks three, next round is capped at five',()=>{const b=bank();b.play('c0','anchor','hunter');b.endRound();assert.equal(b.s.energy,5)});
test('Passing cannot exceed storage cap or carry unused hand',()=>{const b=bank();b.s.intents=[];const oldHand=[...b.s.zones.hand];b.endRound();assert.equal(b.s.energy,5);assert.equal(b.s.zones.hand.length,5);oldHand.forEach(id=>assert.ok(b.s.zones.discard.includes(id)));b.s.intents=[];b.endRound();assert.equal(b.s.energy,5);b.assert()});
test('Stored fifth point is actually spendable',()=>{const b=bank();b.s.intents=[];b.endRound();for(let i=0;i<5;i++)b.play('basic','anchor','hunter');assert.equal(b.s.energy,0);assert.throws(()=>b.play('basic','anchor','hunter'))});
test('Baseline still resets to four after spending',()=>{const b=new Battle('cross');b.play('c2','anchor','hunter');b.endRound();assert.equal(b.s.energy,4)});
test('Recovery mode does not change initial draw or intent RNG',()=>{const a=new Battle('normal',137,'reset'),b=new Battle('normal',137,'bank');assert.deepEqual(a.s.zones,b.s.zones);assert.deepEqual(a.s.intents,b.s.intents);assert.equal(a.s.seed,b.s.seed);a.play('basic','anchor','hunter');b.play('basic','anchor','hunter');a.endRound();b.endRound();assert.deepEqual(a.s.zones,b.s.zones);assert.deepEqual(a.s.intents,b.s.intents);assert.equal(a.s.seed,b.s.seed)});
test('Bank preview and cancel simulation do not spend reserve or RNG',()=>{const b=bank();const before=b.snapshot();b.preview('c2','recall','hunter');assert.deepEqual(b.snapshot(),before)});
test('Mid-round bank save reproduces next energy, hand and intent',()=>{const b=bank();b.play('c0','anchor','hunter');const c=Battle.restore(b.snapshot());b.play('c1','care','care');c.play('c1','care','care');b.endRound();c.endRound();assert.equal(c.s.energy,4);assert.deepEqual(c.snapshot(),b.snapshot())});
test('Invalid modes and out-of-range stored energy rejected',()=>{assert.throws(()=>new Battle('normal',1,'invalid'));const b=bank();b.s.energy=6;assert.throws(()=>b.assert())});
console.log(`\n${count} energy checks passed`);
