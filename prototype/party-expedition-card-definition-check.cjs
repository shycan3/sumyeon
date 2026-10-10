'use strict';
const assert=require('node:assert/strict');
const {Run}=require('./party-expedition-voyage.js');
const {Battle,CARDS}=require('./party-expedition-core.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const old=new Run({seed:31,contentVersion:'voyage-1'});
const current=new Run({seed:31,contentVersion:'voyage-2'});
const before={old:old.snapshot(),current:current.snapshot()};
const kinds=Object.keys(CARDS).filter(kind=>kind!=='basic');
const rewardKinds=kinds.filter(kind=>!['strike','guard'].includes(kind));
assert.equal(kinds.length,100,'시작 카드를 포함한 전체 물리 카드 풀');

// Only identity/display metadata differs between a run definition and a live
// card copy. All authored effect fields, nested choices, upgrade data and text
// remain in this comparison. A missing breakPower means zero in combat.
function effects(definition){
  const result=copy(definition);
  for(const key of ['name','kind','printedCost','choice'])delete result[key];
  result.breakPower=result.breakPower||0;
  return result;
}
let definitions=0,choices=0;
for(const upgraded of [false,true]){
  const deck=kinds.map((kind,index)=>({id:'r'+index,kind,upgraded}));
  const battle=new Battle({seed:31,deck,cardSet:'draft-1'}),initial=battle.snapshot();
  for(const card of deck){
    const prior=old.definition(card),shown=current.definition(card),actual=battle.definition(card.id);
    assert.deepEqual(shown,prior,card.kind+' '+(upgraded?'강화':'기본')+' 원정 1·2 표시와 효과');
    assert.deepEqual(effects(actual),effects(shown),card.kind+' '+(upgraded?'강화':'기본')+' 원정 표시와 전투 효과');
    for(let choice=0;choice<(shown.choices?.length||0);choice++){
      const expected={...shown,...shown.choices[choice]};
      assert.deepEqual(effects(battle.definition(card.id,choice)),effects(expected),card.kind+' '+(upgraded?'강화':'기본')+' 선택 '+choice);
      choices++;
    }
    definitions++;
  }
  assert.deepEqual(battle.snapshot(),initial,'카드 정의 조회는 손패와 난수를 바꾸지 않는다');
}
assert.deepEqual(old.snapshot(),before.old,'기존 원정 정의 조회 불변');
assert.deepEqual(current.snapshot(),before.current,'새 원정 정의 조회 불변');
console.log('PASS 100종 카드의 기본·강화·모든 선택 효과가 원정 1·2 표시와 실제 전투에서 일치한다');
console.log(JSON.stringify({checks:1,physicalCards:kinds.length,rewardCandidates:rewardKinds.length,starterCards:2,definitions,choices,result:'all passed'},null,2));
