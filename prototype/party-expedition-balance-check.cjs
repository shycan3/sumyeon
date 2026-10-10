'use strict';
const assert=require('node:assert/strict');
const {CARDS,Battle}=require('./party-expedition-core.js');
const Auto=require('./party-expedition-auto.js');
const variants=d=>[d,{...d,...d.upgrade}];
for(let i=0;i<2;i++){
 const pick=k=>variants(CARDS[k])[i];
 assert.ok(pick('doublecourse').choices[0].damage<pick('burst').damage,'Flexibility trades focused damage.');
 assert.ok(pick('doublecourse').choices[1].areaDamage<pick('sweep').areaDamage,'Flexibility trades area damage.');
 assert.ok(pick('guardchoice').choices[0].shield<pick('guard').shield,'Choice does not strictly replace basic protection.');
 assert.ok(pick('rescuechoice').choices[0].heal<pick('mend').heal);
 assert.equal(pick('rescuechoice').choices[0].exhaust,true);
 assert.ok(pick('rescuechoice').choices[1].shield<pick('fortress').shield);
 assert.ok(pick('quietchain').weak<pick('suppress').weak,'Retention trades immediate control amount.');
 assert.ok(pick('patientstrike').damage<pick('finisher').damage);
 assert.ok(pick('anchoredwall').shield<pick('fortress').shield);
 assert.ok(pick('heldinsight').cost>pick('draw').cost,'Retained draw pays more upfront energy.');
 assert.ok(pick('drill').damage*pick('drill').hits<pick('impale').damage,'Multihit penetration cannot dominate focused penetration.');
 assert.equal(pick('routechoice').choices[0].exhaust,true,'Resource gain must not repeat through retrieval.');
 assert.ok(pick('routechoice').choices[1].draw/pick('routechoice').cost<pick('draw').draw/pick('draw').cost);
}
function choiceBattle(kind){const b=new Battle({party:['navigator','diver','pilot','lightkeeper'],deck:[{id:'c',kind}],enemies:[{id:'e',name:'선택 검사',hp:100,pattern:'hunter',damage:0}],seed:9});b.s.energy=5;return b;}
const heal=choiceBattle('rescuechoice');heal.actor('navigator').hp=2;const ha=Auto.choose(heal);assert.equal(ha.card,'c');assert.equal(ha.choice,0);heal.play(ha.card,ha.actor,ha.target,ha.choice);assert.ok(heal.s.zones.exhaust.includes('c'));
const resource=choiceBattle('routechoice');resource.s.energy=2;const ra=Auto.choose(resource);assert.equal(ra.card,'c');assert.equal(ra.choice,0);resource.play(ra.card,ra.actor,ra.target,ra.choice);assert.ok(resource.s.zones.exhaust.includes('c'));assert.equal(resource.s.energy,3);
const power=choiceBattle('steadywatch');const pa=Auto.choose(power);assert.equal(pa.card,'c');power.play(pa.card,pa.actor,pa.target,pa.choice);assert.equal(power.s.powers.roundShield,2);
console.log('PASS 일반/강화 유연성·보존의 대가, 기존 카드 역할 보존, 에너지 회수 순환 차단, 자동 회복·보급 선택·지속 설치');
