'use strict';
const assert=require('node:assert/strict');
const {CARDS}=require('./party-expedition-core.js');
const {families,oldFamilies,planned}=require('./party-expedition-catalog.js');
const existing=Object.entries(oldFamilies).flatMap(([family,ids])=>ids.map(id=>({id,family,...CARDS[id]})));
const all=[...existing,...planned];
assert.equal(all.length,100);assert.equal(planned.length,70);
assert.equal(new Set(all.map(c=>c.id)).size,100);
assert.equal(new Set(all.map(c=>c.name)).size,100);
assert.equal(Object.keys(CARDS).filter(k=>k!=='basic').length,100);
for(const [id,d]of Object.entries(CARDS))if(id!=='basic')assert.ok(d.role&&d.link,`${id}: role and connection required`);
assert.match(CARDS.breaksurvey.text,/균형 −3/);
assert.deepEqual(existing.map(c=>c.id).sort(),Object.keys(CARDS).filter(k=>k!=='basic'&&!planned.some(p=>p.id===k)).sort());
const goals={assault:25,ward:20,disrupt:20,cycle:20,repair:15};
for(const [family,count] of Object.entries(goals))assert.equal(all.filter(c=>c.family===family).length,count);
for(const c of planned){
  assert.ok(families[c.family]&&c.name&&c.role&&c.links);
  assert.ok(c.cost==='X'||Number.isInteger(c.cost)&&c.cost>=0&&c.cost<=4);
  assert.ok(Object.keys(c.effects).length);
  if(c.effects.choices){assert.equal(c.effects.choices.length,2);assert.equal(new Set(c.effects.choices.map(o=>o.name)).size,2);}
  if(c.cost==='X'){assert.ok(c.effects.xScale.length);for(const key of c.effects.xScale)assert.ok(c.effects[key]>0);}
  assert.ok(!('owner' in c));
}
for(const flag of ['retain','power','xScale','choices'])assert.ok(planned.some(c=>c.effects[flag]));
const signatures=planned.map(c=>JSON.stringify({cost:c.cost,effects:c.effects}));
assert.equal(new Set(signatures).size,signatures.length,'New cards must not be identical effects with renamed art.');
console.log('PASS 100종 고유 설계 · 기존 30종 매핑 · 신규70종 역할/연결 · 25/20/20/20/15 배치 · 공통규칙 후보 · 동일 효과 중복 없음');
