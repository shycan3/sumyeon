'use strict';
const assert = require('node:assert/strict');
const { Run } = require('./party-expedition-run.js');
const { CARDS, ROLES } = require('./party-expedition-core.js');
let count = 0;
function test(name, body) { body(); count++; console.log('✓ ' + name); }
function unchanged(run, action) { const snapshot = run.snapshot(); assert.throws(action); assert.deepEqual(run.snapshot(), snapshot); }
function trimFixture(run) {
  if (!run.battle.s.needsTrim) return;
  const id = run.battle.s.zones.hand.find(id => !run.battle.definition(id).damage) || run.battle.s.zones.hand.at(-1);
  run.discardForSounder(id);
}
function restoreEqual(run) { const restored = Run.restore(run.snapshot()); assert.deepEqual(restored.snapshot(), run.snapshot()); return restored; }
function finishFixture(run) {
  // Phase-transition fixture, not a balance or fun test: reduce living enemies to 1 HP,
  // then execute real legal hand/basic actions through Run's transactional API.
  run.battle.s.enemies.forEach(enemy => { enemy.hp = 1; enemy.shield = 0; });
  while (run.s.phase === 'battle') {
    trimFixture(run);
    const enemy = run.battle.s.enemies.find(item => item.hp > 0);
    const actor = run.battle.s.allies.find(item => item.hp > 0);
    const card = run.battle.s.zones.hand.find(id => run.battle.definition(id).damage && run.battle.costFor(id, actor.id) <= run.battle.s.energy);
    if (card) run.play(card, actor.id, enemy.id);
    else if (run.battle.s.energy > 0) run.play('basic', actor.id, enemy.id);
    else run.endRound();
  }
  assert.notEqual(run.s.phase, 'lost');
}
function atInterlude(type) {
  const run = new Run({ seed: 1042 });
  // The three initial lanes have distinct stops. Later service access depends on
  // the chosen links instead of promising a camp at every branching decision.
  const index = run.s.choices.findIndex(route => route.interlude === type);
  assert(index >= 0);
  run.choosePath(index); finishFixture(run); run.chooseReward(null);
  assert.equal(run.s.interlude.type, type);
  return run;
}
test('원정 초기 덱은 캐릭터 귀속 없이 10장의 고유 사본으로 시작', () => {
  const run = new Run();
  assert.equal(run.s.phase, 'map'); assert.equal(run.s.floor, 0); assert.equal(run.s.deck.length, 10);
  assert.equal(new Set(run.s.deck.map(card => card.id)).size, 10);
  assert(run.s.deck.every(card => !('owner' in card) && !card.upgraded));
  assert.equal(run.s.breakMode, 'off');
  assert.equal(run.s.version, 'expedition-run-2');
  assert.deepEqual(run.s.party, ['navigator', 'sounder', 'salvager', 'lightkeeper']);
  assert.deepEqual(ROLES.map(role => role.name), ['항해사', '잠수자', '도선사', '측심사', '인양사', '등대지기']);
});
test('15가지 4인 편성 생성 및 잘못된 편성·규칙 거부', () => {
  let parties = 0;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) for (let d = c + 1; d < 6; d++) {
    new Run({ party: [a, b, c, d].map(index => ROLES[index].id) }).assert(); parties++;
  }
  assert.equal(parties, 15);
  assert.throws(() => new Run({ party: ['navigator', 'navigator', 'salvager', 'lightkeeper'] }));
  assert.throws(() => new Run({ difficulty: 'unknown' }));
  assert.throws(() => new Run({ breakMode: 'unknown' }));
  assert.throws(() => new Run({ seed: -1 }));
});
test('지도는 위협·HP·다음 정비 장소를 공개하고 실제 연결된 경로만 제공', () => {
  const run = new Run();
  assert.equal(run.s.choices.length, 3);
  while (run.s.phase !== 'won') {
    assert(run.s.choices.every(route => route.threat && route.description.includes('HP') && route.enemies.length <= 2));
    assert.deepEqual(run.s.choices.map(route => route.id), run.mapView().available);
    if (run.s.floor > 0 && run.s.floor < 7) assert(run.s.choices.length >= 1 && run.s.choices.length <= 2);
    if (run.s.floor === 7) assert.equal(run.s.choices.length, 1);
    run.choosePath(0); finishFixture(run);
    if (run.s.phase === 'reward') run.chooseReward(null);
    if (run.s.phase === 'interlude') run.chooseInterlude('continue');
  }
});
test('같은 시드와 선택은 지도·전투·미래 보상을 정확히 재현', () => {
  const first = new Run({ seed: 9001 }); const second = new Run({ seed: 9001 });
  assert.deepEqual(first.snapshot(), second.snapshot());
  first.choosePath(1); second.choosePath(1); assert.deepEqual(first.snapshot(), second.snapshot());
  finishFixture(first); finishFixture(second); assert.deepEqual(first.snapshot(), second.snapshot());
});
test('부드러운 난이도는 공개된 적 HP·공격을 줄이며 브레이크 OFF는 실제 OFF', () => {
  const normal = new Run({ seed: 12 }); const calm = new Run({ seed: 12, difficulty: 'calm' });
  normal.s.choices.forEach((route, index) => route.enemies.forEach((enemy, enemyIndex) => {
    const softer = calm.s.choices[index].enemies[enemyIndex];
    assert(softer.hp < enemy.hp); assert(softer.damage <= enemy.damage);
  }));
  normal.choosePath(0); assert.equal(normal.battle.s.breakMode, false);
  const on = new Run({ breakMode: 'on' }); on.choosePath(0); assert.equal(on.battle.s.breakMode, true);
});
test('전투 중 저장은 손패·인양 예약·예고·HP·난수를 바꾸지 않음', () => {
  const run = new Run(); run.choosePath(0); trimFixture(run);
  const card = run.battle.s.zones.hand.find(id => run.battle.definition(id).damage);
  if (card) run.play(card, 'salvager', run.battle.s.enemies[0].id);
  assert(run.battle.s.zones.reserve.includes(card));
  assert(run.battle.s.salvageMarks[card]);
  const restored = restoreEqual(run);
  run.endRound(); restored.endRound(); assert.deepEqual(restored.snapshot(), run.snapshot());
  assert(run.battle.s.salvageMarks[card]);
  assert(run.battle.s.zones.hand.includes(card));
});
test('유효하지 않은 경로·카드·단계 선택은 상태와 RNG를 원상 보존', () => {
  const run = new Run();
  unchanged(run, () => run.choosePath(99)); unchanged(run, () => run.chooseReward('burst'));
  run.choosePath(0); trimFixture(run); unchanged(run, () => run.choosePath(0));
  unchanged(run, () => run.play('missing', 'navigator', run.battle.s.enemies[0].id));
  unchanged(run, () => run.chooseInterlude('heal'));
});
test('측심사 선별 대기 중 전투 시작 저장은 공개 의도와 여섯 장을 그대로 복원', () => {
  const run = new Run(); run.choosePath(0);
  assert.equal(run.battle.s.needsTrim, true);
  assert.equal(run.battle.s.zones.hand.length, 6);
  assert(run.battle.s.intents.length > 0);
  const restored = restoreEqual(run), discard = run.battle.s.zones.hand[0];
  run.discardForSounder(discard); restored.discardForSounder(discard);
  assert.deepEqual(restored.snapshot(), run.snapshot());
  assert.equal(run.battle.s.needsTrim, false);
  assert.equal(run.battle.s.zones.hand.length, 5);
  assert(run.battle.s.zones.discard.includes(discard));
});
test('원정 선별 명령은 단계·사본·중복 선택을 검증하며 잘못된 명령을 원상 복구', () => {
  const run = new Run(); unchanged(run, () => run.discardForSounder('r0'));
  run.choosePath(0);
  unchanged(run, () => run.endRound());
  unchanged(run, () => run.play('basic', 'navigator', run.battle.s.enemies[0].id));
  unchanged(run, () => run.discardForSounder('missing'));
  const discard = run.battle.s.zones.hand[0]; run.discardForSounder(discard);
  unchanged(run, () => run.discardForSounder(run.battle.s.zones.hand[0]));
});
test('측심사 미편성은 선별 없이 다섯 장으로 진행하며 쓰러지면 다음 라운드 선별이 없음', () => {
  const without = new Run({ party: ['navigator', 'diver', 'pilot', 'lightkeeper'] }); without.choosePath(0);
  assert.equal(without.battle.s.zones.hand.length, 5); assert.equal(without.battle.s.needsTrim, false);
  unchanged(without, () => without.discardForSounder(without.battle.s.zones.hand[0]));
  const fallen = new Run(); fallen.choosePath(0); trimFixture(fallen);
  fallen.battle.actor('sounder').hp = 0; fallen.endRound();
  assert.equal(fallen.battle.s.zones.hand.length, 5); assert.equal(fallen.battle.s.needsTrim, false);
  assert.equal(fallen.s.allies.find(ally => ally.id === 'sounder').hp, 0);
});
test('보상은 중복 없는 후보 3장이며 선택 또는 건너뛰기를 한 번만 허용', () => {
  const run = new Run(); run.choosePath(0); finishFixture(run);
  assert.equal(run.s.phase, 'reward'); assert.equal(run.s.offers.length, 3);
  const before = restoreEqual(run); const offer = run.s.offers[1];
  run.chooseReward(offer); assert.equal(run.s.deck.length, 11); assert.equal(run.s.history[0].reward, offer);
  unchanged(run, () => run.chooseReward(offer));
  before.chooseReward(null); assert.equal(before.s.deck.length, 10); assert.equal(before.s.phase, 'interlude');
});
test('완료 전투를 다시 동기화해도 보상·기록이 중복되지 않고 정비 회복을 되돌리지 않음', () => {
  const run = new Run(); run.choosePath(0); finishFixture(run);
  const completed = run.snapshot(); run.syncBattle(); assert.deepEqual(run.snapshot(), completed);
  run.chooseReward(null); run.s.allies[0].hp = 0; run.chooseInterlude('heal');
  const healed = run.snapshot(); run.syncBattle(); assert.deepEqual(run.snapshot(), healed);
});
test('보상 저장은 제시 카드·순서를 고정하고 저장으로 덱을 수정하지 않음', () => {
  const run = new Run(); run.choosePath(0); finishFixture(run);
  const restored = restoreEqual(run), deck = JSON.stringify(run.s.deck);
  assert.equal(JSON.stringify(restored.s.deck), deck); assert.deepEqual(restored.s.offers, run.s.offers);
  const kind = run.s.offers[0]; run.chooseReward(kind); restored.chooseReward(kind);
  assert.deepEqual(run.snapshot(), restored.snapshot());
});
test('캠프 회복은 전원 HP를 회복하고 쓰러진 동료를 공개된 HP로 복귀', () => {
  const run = atInterlude('camp'); run.s.allies[0].hp = 0; run.s.allies[1].hp = 23;
  run.chooseInterlude('heal'); assert.equal(run.s.allies[0].hp, 10); assert.equal(run.s.allies[1].hp, 29);
  assert.equal(run.s.phase, 'map'); assert.equal(run.s.floor, 1);
});
test('강화는 선택한 사본 하나만 변화시키고 다음 전투에 그대로 적용', () => {
  const run = atInterlude('camp'); const id = run.s.deck[0].id;
  run.chooseInterlude('upgrade', id); assert.equal(run.s.deck.filter(card => card.upgraded).length, 1);
  assert.equal(run.definition(id).damage, CARDS.strike.upgrade.damage);
  run.choosePath(0); assert.equal(run.battle.definition(id).damage, CARDS.strike.upgrade.damage);
  assert.equal(run.battle.s.cards[id].upgraded, true);
});
test('카드 제거는 실제 선택한 사본만 없애고 삭제한 사본을 저장으로 복구하지 않음', () => {
  const run = atInterlude('camp'); const id = run.s.deck[0].id;
  run.chooseInterlude('remove', id); assert.equal(run.s.deck.length, 9);
  const restored = restoreEqual(run); assert(!restored.s.deck.some(card => card.id === id));
  restored.choosePath(0); assert(!restored.battle.s.cards[id]);
});
test('제거 최소 6장·이미 강화한 카드의 재강화 제한은 재화와 상태를 보존', () => {
  const run = atInterlude('camp'); run.s.deck.splice(6);
  unchanged(run, () => run.chooseInterlude('remove', run.s.deck[0].id));
  run.s.deck[0].upgraded = true;
  unchanged(run, () => run.chooseInterlude('upgrade', run.s.deck[0].id));
});
test('상점은 공개 가격으로 구매·회복·제거하고 출발 전까지 유지', () => {
  const run = atInterlude('shop'); run.s.gold = 100;
  const kind = run.s.interlude.offers[0], id = run.s.deck[0].id;
  run.chooseInterlude('buy', kind); assert.equal(run.s.gold, 80); assert.equal(run.s.phase, 'interlude');
  unchanged(run, () => run.chooseInterlude('buy', kind));
  run.s.allies[0].hp = 0; run.chooseInterlude('heal'); assert.equal(run.s.gold, 68); assert.equal(run.s.allies[0].hp, 10);
  unchanged(run, () => run.chooseInterlude('heal'));
  run.chooseInterlude('remove', id); assert.equal(run.s.gold, 56); assert(!run.s.deck.some(card => card.id === id));
  restoreEqual(run); run.chooseInterlude('continue'); assert.equal(run.s.phase, 'map');
});
test('상점 재화 부족은 제시 카드·덱·난수 모두 보존', () => {
  const run = atInterlude('shop'); run.s.gold = 0;
  unchanged(run, () => run.chooseInterlude('buy', run.s.interlude.offers[0]));
  unchanged(run, () => run.chooseInterlude('remove', run.s.deck[0].id));
});
test('관측실은 제시 기록 획득·회복·강화 중 하나를 선택', () => {
  const run = atInterlude('event'), restored = restoreEqual(run);
  const kind = run.s.interlude.offers[2]; run.chooseInterlude('learn', kind);
  assert.equal(run.s.deck.length, 11); assert.equal(run.s.phase, 'map');
  restored.s.allies[0].hp = 0; restored.chooseInterlude('heal'); assert.equal(restored.s.allies[0].hp, 8);
  assert.equal(restored.s.deck.length, 10);
});
test('전투 간 HP·카드 사본이 유지되고 소진한 카드는 다음 전투에서 돌아옴', () => {
  const run = new Run(); run.s.deck[0].kind = 'jab'; run.s.allies[0].hp = 18;
  run.choosePath(0); trimFixture(run); const id = run.s.deck[0].id;
  // Place this physical card in hand without duplication to test its permanent deck lifecycle.
  Object.values(run.battle.s.zones).forEach(zone => { const index = zone.indexOf(id); if (index >= 0) zone.splice(index, 1); });
  run.battle.s.zones.hand.push(id); run.play(id, 'navigator', run.battle.s.enemies[0].id);
  assert(run.battle.s.zones.exhaust.includes(id));
  finishFixture(run); run.chooseReward(null); run.chooseInterlude('continue'); run.choosePath(0);
  assert.equal(run.battle.s.allies[0].hp, 18); assert(run.battle.s.cards[id]); assert.equal(run.battle.s.zones.exhaust.length, 0);
});
test('기존 cards100 원정은 앞 6회 보상 후 완성 덱 활용, 최종 승리 기록과 저장 유지', () => {
  const run = new Run({ seed: 178,contentVersion:'cards100-1' }); let rewards = 0;
  while (run.s.phase !== 'won') {
    if (run.s.phase === 'map') run.choosePath(0);
    else if (run.s.phase === 'battle') finishFixture(run);
    else if (run.s.phase === 'reward') { run.chooseReward(run.s.offers[0]); rewards++; }
    else if (run.s.phase === 'interlude') {
      run.chooseInterlude('heal');
      if (run.s.phase === 'interlude') run.chooseInterlude('continue');
    }
    else assert.fail('Unexpected phase ' + run.s.phase);
  }
  assert.equal(rewards, 6); assert.equal(run.s.deck.length, 16); assert.equal(run.s.battlesWon, 8);
  assert.equal(run.s.history.length, 8); assert.equal(run.s.history[6].reward, null); assert.equal(run.s.history[7].reward, null);
  restoreEqual(run); unchanged(run, () => run.choosePath(0));
});
test('패배는 보상 없이 기록되고 종료한 원정에서 추가 행동을 거부', () => {
  const run = new Run(); run.choosePath(0); run.battle.s.allies.forEach(ally => { ally.hp = 0; });
  run.battle.finish(); run.syncBattle(); assert.equal(run.s.phase, 'lost'); assert.equal(run.s.gold, 15);
  assert.equal(run.s.history[0].result, 'lost'); restoreEqual(run); unchanged(run, () => run.endRound());
});
test('잘못된 저장 버전·중복 사본·사본 번호 오류를 거부', () => {
  const run = new Run(); const snapshot = run.snapshot(); snapshot.version = 'expedition-run-1'; assert.throws(() => Run.restore(snapshot));
  const duplicate = run.snapshot(); duplicate.deck[1].id = duplicate.deck[0].id; assert.throws(() => Run.restore(duplicate));
  const bad = run.snapshot(); bad.nextCard = 9; assert.throws(() => Run.restore(bad));
  run.choosePath(0); const mixed = run.snapshot();
  mixed.party = ['diver', 'pilot', 'salvager', 'lightkeeper'];
  mixed.allies[0].id = 'diver'; mixed.allies[1].id = 'pilot';
  assert.throws(() => Run.restore(mixed));
});
console.log('\n' + count + '개 원정 검사 통과 (단계 전환 fixture; 재미·난이도 통과 판정 아님).');
