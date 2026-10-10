'use strict';
const assert = require('node:assert/strict');
const { Run } = require('./party-expedition-run.js');
const copy = value => JSON.parse(JSON.stringify(value));
let count = 0;
function test(name, body) { body(); count++; console.log('✓ ' + name); }
function unchanged(run, action) { const before = run.snapshot(); assert.throws(action); assert.deepEqual(run.snapshot(), before); }
function finishFixture(run) {
  // Only exercises graph/phase transitions; 1 HP enemies are not a balance test.
  run.battle.s.enemies.forEach(enemy => { enemy.hp = 1; enemy.shield = 0; });
  while (run.s.phase === 'battle') {
    if (run.battle.s.needsTrim) run.discardForSounder(run.battle.s.zones.hand.at(-1));
    const actor = run.battle.s.allies.find(ally => ally.hp > 0);
    const enemy = run.battle.s.enemies.find(item => item.hp > 0);
    const card = run.battle.s.zones.hand.find(id => run.battle.definition(id).damage && run.battle.costFor(id, actor.id) <= run.battle.s.energy);
    if (card) run.play(card, actor.id, enemy.id);
    else if (run.battle.s.energy > 0) run.play('basic', actor.id, enemy.id);
    else run.endRound();
  }
  assert.notEqual(run.s.phase, 'lost');
}
function finishStop(run) {
  if (run.s.phase === 'reward') run.chooseReward(null);
  if (run.s.phase === 'interlude') run.chooseInterlude('continue');
}
function reachable(edges, origin, backwards = false) {
  const visited = new Set([origin]);
  const pending = [origin];
  while (pending.length) {
    const current = pending.shift();
    for (const edge of edges) {
      if ((backwards ? edge.to : edge.from) !== current) continue;
      const target = backwards ? edge.from : edge.to;
      if (!visited.has(target)) { visited.add(target); pending.push(target); }
    }
  }
  return visited;
}
function asLegacy(run) {
  const snapshot = run.snapshot(); delete snapshot.map;
  const oldName = route => route.interlude === 'camp' ? '정박지 경유' : route.interlude === 'shop' ? '유실물 상점 경유' : route.interlude === 'event' ? '관측실 경유' : '최심부 · 파수꾼';
  snapshot.choices.forEach(route => { route.name = oldName(route); });
  if (snapshot.route) snapshot.route.name = oldName(snapshot.route);
  snapshot.history.forEach(item => {
    delete item.nodeId;
    item.route = item.route.includes('상점') ? '유실물 상점 경유' : item.route.includes('관측실') ? '관측실 경유' : item.floor === 7 ? '최심부 · 파수꾼' : '정박지 경유';
  });
  return snapshot;
}
function assertMigration(snapshot) {
  const before = copy(snapshot);
  const restored = Run.restore(snapshot);
  const migrated = restored.snapshot(); delete migrated.map;
  assert.deepEqual(migrated, before);
  assert.deepEqual(snapshot, before, 'restore must not mutate caller snapshot');
  assert.equal(restored.s.map.legacy, true);
  const again = Run.restore(before);
  assert.deepEqual(again.snapshot(), restored.snapshot());
  return restored;
}

test('새 지도는 44개 노드와 8전투, 별도 정비 장소, 세 시작 경로를 제공', () => {
  const run = new Run({ seed: 803 }), map = run.mapView();
  assert.equal(map.nodes.length, 44);
  assert.equal(map.nodes.filter(node => ['battle', 'elite'].includes(node.type)).length, 21);
  assert.equal(map.nodes.filter(node => node.type === 'boss').length, 1);
  assert.deepEqual(map.available, ['f0-path0', 'f0-path1', 'f0-path2']);
  assert.deepEqual(map.trail, ['start']); assert.equal(map.current, 'start');
  for (let floor = 0; floor < 7; floor++) {
    const battles = map.nodes.filter(node => node.floor === floor && ['battle', 'elite'].includes(node.type));
    const stops = map.nodes.filter(node => node.floor === floor && ['camp', 'shop', 'event'].includes(node.type));
    assert.equal(battles.length, 3);
    assert.deepEqual(stops.map(node => node.type).sort(), ['camp', 'event', 'shop']);
    for (const battle of battles) assert(map.edges.some(edge => edge.from === battle.id && edge.to === battle.id + '-stop'));
  }
});
test('64개 시드의 모든 노드는 시작에서 도달하고 막다른 길 없이 보스로 이어짐', () => {
  for (let seed = 0; seed < 64; seed++) {
    const map = new Run({ seed }).mapView();
    assert.equal(reachable(map.edges, 'start').size, map.nodes.length);
    assert.equal(reachable(map.edges, 'f7-path0', true).size, map.nodes.length);
    assert.equal(new Set(map.edges.map(edge => edge.from + '>' + edge.to)).size, map.edges.length);
    const nodes = new Map(map.nodes.map(node => [node.id, node]));
    for (const stop of map.nodes.filter(node => ['camp', 'shop', 'event'].includes(node.type))) {
      const edges = map.edges.filter(edge => edge.from === stop.id);
      assert(edges.length >= 1 && edges.length <= 2);
      for (const edge of edges) {
        const next = nodes.get(edge.to);
        assert.equal(next.floor, stop.floor + 1);
        assert(next.type === 'boss' || Math.abs(stop.lane - next.lane) <= 1);
      }
    }
  }
});
test('지도 생성과 100번 열람은 전투·보상 RNG를 전혀 소비하지 않음', () => {
  const run = new Run({ seed: 803 }); assert.equal(run.s.seed, 803);
  const before = run.snapshot();
  for (let i = 0; i < 100; i++) run.mapView();
  assert.deepEqual(run.snapshot(), before);
  const zero = new Run({ seed: 0 }); assert.equal(zero.s.seed, 0xa341316c);
});
test('동일 시드의 지도는 정확히 같고 시드 변경은 경로·배치를 변화시킴', () => {
  const first = new Run({ seed: 803 }), second = new Run({ seed: 803 }), third = new Run({ seed: 804 });
  assert.deepEqual(first.mapView(), second.mapView());
  assert.notDeepEqual(first.mapView(), third.mapView());
  first.choosePath('f0-path2'); second.choosePath('f0-path2');
  assert.deepEqual(first.snapshot(), second.snapshot());
});
test('지도 반환 객체를 수정해도 저장된 경로·적·방문 기록은 바뀌지 않음', () => {
  const run = new Run(), before = run.snapshot(), view = run.mapView();
  view.nodes[1].route.enemies[0].hp = 99999;
  view.edges.length = 0; view.trail.push('fake'); view.available.length = 0;
  assert.deepEqual(run.snapshot(), before);
});
test('서로 다른 시작 경로는 다음에 도달 가능한 노드를 다르게 제한', () => {
  const left = new Run({ seed: 29 }), right = new Run({ seed: 29 });
  left.choosePath('f0-path0'); right.choosePath('f0-path2');
  finishFixture(left); finishFixture(right); finishStop(left); finishStop(right);
  assert.notDeepEqual(left.mapView().available, right.mapView().available);
  assert(left.s.choices.length <= 2 && right.s.choices.length <= 2);
  assert.equal(left.mapView().current, 'f0-path0-stop');
  assert.equal(right.mapView().current, 'f0-path2-stop');
});
test('미래 층 건너뛰기·미연결 경로·되돌아가기·존재하지 않는 노드는 원상 복구', () => {
  const run = new Run({ seed: 29 });
  unchanged(run, () => run.choosePath('f3-path0'));
  unchanged(run, () => run.choosePath('start'));
  unchanged(run, () => run.choosePath('f0-path0-stop'));
  run.choosePath('f0-path0'); finishFixture(run); finishStop(run);
  const inaccessible = ['f1-path0', 'f1-path1', 'f1-path2'].find(id => !run.mapView().available.includes(id));
  assert(inaccessible); unchanged(run, () => run.choosePath(inaccessible));
  unchanged(run, () => run.choosePath('f0-path0'));
  unchanged(run, () => run.choosePath('missing'));
});
test('전투·보상에서는 전투 노드, 정비에서는 정비 노드로 현재 위치와 방문 선을 기록', () => {
  const run = new Run(); run.choosePath(0);
  assert.equal(run.mapView().current, 'f0-path0'); assert.deepEqual(run.mapView().available, []);
  assert.deepEqual(run.mapView().trail, ['start', 'f0-path0']);
  finishFixture(run); assert.equal(run.s.phase, 'reward'); assert.equal(run.mapView().current, 'f0-path0');
  run.chooseReward(null); assert.equal(run.mapView().current, 'f0-path0-stop');
  assert.deepEqual(run.mapView().trail, ['start', 'f0-path0', 'f0-path0-stop']);
  run.chooseInterlude('continue'); assert(run.mapView().available.length >= 1);
});
test('모든 선택을 끝내면 8전투·7정비를 방문하고 하나의 보스로 수렴', () => {
  for (let lane = 0; lane < 3; lane++) {
    const run = new Run({ seed: 100 + lane }); run.choosePath(lane);
    while (run.s.phase !== 'won') {
      if (run.s.phase === 'battle') finishFixture(run);
      else if (run.s.phase === 'map') run.choosePath(run.s.choices.at(-1).id);
      else finishStop(run);
    }
    const map = run.mapView();
    assert.equal(map.current, 'f7-path0'); assert.deepEqual(map.available, []);
    assert.equal(map.trail.length, 16); assert.equal(run.s.battlesWon, 8);
    assert.equal(new Set(map.trail).size, 16);
    assert.deepEqual(Run.restore(run.snapshot()).mapView(), map);
  }
});
test('기존 cards100 정예의 적 HP를 보존', () => {
  const map = new Run({ seed: 803,contentVersion:'cards100-1' }).mapView();
  const elites = map.nodes.filter(node => node.type === 'elite');
  assert(elites.length >= 2);
  for (const node of elites) {
    assert.equal(node.route.enemies.length, 1); assert.equal(node.route.enemies[0].pattern, 'sentinel');
    assert.equal(node.route.enemies[0].hp, node.floor === 3 ? 43 : 57);
  }
  const boss = map.nodes.find(node => node.type === 'boss');
  assert.deepEqual(boss.route.enemies.map(enemy => enemy.hp), [68, 18]);
});
test('각 단계 저장·복원은 전체 미래 지도와 현재 선택·보상을 고정', () => {
  const run = new Run({ seed: 43 });
  for (const phase of ['map', 'battle', 'reward', 'interlude']) {
    assert.equal(run.s.phase, phase);
    assert.deepEqual(Run.restore(run.snapshot()).snapshot(), run.snapshot());
    if (phase === 'map') run.choosePath(1);
    if (phase === 'battle') finishFixture(run);
    if (phase === 'reward') run.chooseReward(null);
  }
});
test('지도 없는 구 v2 첫 화면은 노출된 두 경로·순서·RNG를 그대로 보존', () => {
  const run = new Run({ seed: 803 }), snapshot = asLegacy(run);
  snapshot.choices = snapshot.choices.slice(0, 2); snapshot.seed = 2129479340;
  const restored = assertMigration(snapshot);
  assert.deepEqual(restored.mapView().available, snapshot.choices.map(route => route.id));
  assert.equal(restored.s.choices.length, 2);
  unchanged(restored, () => restored.choosePath('f0-path2'));
  restored.choosePath(snapshot.choices[1].id);
  assert.deepEqual(restored.s.route, snapshot.choices[1]);
  assert.equal(restored.battle.s.enemies[0].max, snapshot.choices[1].enemies[0].hp);
});
test('구 v2 전투·보상·정비 저장은 HP·손패·예고·보상·RNG를 바꾸지 않고 연결', () => {
  const run = new Run({ seed: 803 }); run.choosePath(1);
  let restored = assertMigration(asLegacy(run));
  assert.equal(restored.mapView().current, run.s.route.id);
  finishFixture(run); restored = assertMigration(asLegacy(run));
  assert.equal(restored.s.phase, 'reward');
  restored.chooseReward(null); assert.equal(restored.mapView().current, restored.s.route.id + '-stop');
  run.chooseReward(null); restored = assertMigration(asLegacy(run));
  assert.equal(restored.s.phase, 'interlude');
  restored.chooseInterlude('continue'); assert(restored.mapView().available.length >= 1);
});
test('구 v2 중간 지도는 과거 실제 정비·방문 기록과 현재 노출 경로를 연결', () => {
  const run = new Run({ seed: 321 });
  for (let i = 0; i < 3; i++) { run.choosePath(0); finishFixture(run); finishStop(run); }
  const legacy = asLegacy(run), restored = assertMigration(legacy);
  assert.equal(restored.mapView().trail.length, 7);
  assert.equal(restored.mapView().current.endsWith('-stop'), true);
  assert.deepEqual(restored.mapView().available, legacy.choices.map(route => route.id));
  for (const history of legacy.history) {
    const lane = history.route === '정박지 경유' ? 0 : 1;
    assert(restored.mapView().trail.includes('f' + history.floor + '-path' + lane));
  }
  restored.choosePath(0); finishFixture(restored); finishStop(restored); restored.assert();
});
test('구 v2 종료 저장도 마지막 전투 위치와 승패를 그대로 보존', () => {
  const lost = new Run(); lost.choosePath(0);
  lost.battle.s.allies.forEach(ally => { ally.hp = 0; }); lost.battle.finish(); lost.syncBattle();
  const restoredLost = assertMigration(asLegacy(lost)); assert.equal(restoredLost.s.phase, 'lost');
  const won = new Run();
  while (won.s.phase !== 'won') {
    if (won.s.phase === 'map') won.choosePath(0);
    else if (won.s.phase === 'battle') finishFixture(won);
    else finishStop(won);
  }
  const restoredWon = assertMigration(asLegacy(won)); assert.equal(restoredWon.mapView().current, 'f7-path0');
  assert.equal(restoredWon.mapView().trail.length, 16);
});
test('손상된 지도 연결·중복 지점·현재 위치·경로 내용은 저장 복원에서 거부', () => {
  const run = new Run(); run.choosePath(0);
  const brokenEdge = run.snapshot(); brokenEdge.map.edges = brokenEdge.map.edges.filter(edge => !(edge.from === 'start' && edge.to === 'f0-path0'));
  assert.throws(() => Run.restore(brokenEdge));
  const duplicate = run.snapshot(); duplicate.map.nodes.push(copy(duplicate.map.nodes[0])); assert.throws(() => Run.restore(duplicate));
  const current = run.snapshot(); current.map.current = 'f1-path1'; assert.throws(() => Run.restore(current));
  const mismatch = run.snapshot(); mismatch.map.nodes.find(node => node.id === mismatch.route.id).route.enemies[0].hp++;
  assert.throws(() => Run.restore(mismatch));
});
console.log('\n' + count + '개 지도 검사 통과 (경로·저장·난수 검증; 재미·밸런스 판정 아님).');
