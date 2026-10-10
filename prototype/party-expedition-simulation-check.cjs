'use strict';
const assert = require('node:assert/strict');
const { Run } = require('./party-expedition-voyage.js');
const { Battle } = require('./party-expedition-core.js');
const Automation = require('./party-expedition-automation.js');
const Telemetry = require('./party-expedition-telemetry.js');
const Simulation = require('./party-expedition-simulation.js');
const copy = x => JSON.parse(JSON.stringify(x));
const party = ['navigator', 'diver', 'pilot', 'lightkeeper'];
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }

function fixture({ deck = ['strike'], enemies = [{ id: 'enemy', name: '검사 적', pattern: 'hunter', hp: 100, damage: 10 }], hearth = false } = {}) {
  const run = new Run({ seed: 41, party });
  run.chooseBlessing(run.s.blessings[0]);
  run.choosePath(0);
  deck = [...deck];
  while (deck.length < 6) deck.push('guard');
  run.s.deck = deck.map((kind, i) => ({ id: 'r' + i, kind, upgraded: false }));
  run.s.relics = hearth ? ['hearth'] : [];
  run.s.tools = [];
  run.battle = new Battle({ party, deck: run.s.deck, enemies, cardSet: 'draft-1', seed: 41, voyage: { relics: run.s.relics, tools: [], rule: 'normal' } });
  run.s.allies = run.battle.s.allies.map(a => ({ id: a.id, hp: a.hp, max: a.max }));
  return run;
}
function recordAction(recorder, run, method, args = []) {
  if (method === 'play' && args[0] !== 'basic' && !run.battle.s.zones.hand.includes(args[0])) {
    // Controlled fixture: expose this already-existing card rather than depend
    // on a particular shuffled test hand. Its identity/effects are unchanged.
    const zones = run.battle.s.zones;
    for (const zone of ['draw', 'discard', 'reserve']) {
      const index = zones[zone].indexOf(args[0]);
      if (index >= 0) { zones[zone].splice(index, 1); zones.hand.push(args[0]); break; }
    }
  }
  const before = run.snapshot();
  const fresh = run[method](...args);
  const after = run.snapshot();
  const events = before.phase === 'battle' ? fresh : [];
  recorder.observe({ decision: { method, args, reason: '독립 검증' }, before, after, events });
  return after;
}
function recorderFor(run) { return Telemetry.createRecorder({ seed: 41, policy: 'balanced', difficulty: 'normal', breakMode: 'off', party }, run.snapshot()); }

test('실제 적 HP 피해·보호 흡수·반격·자해 비용·전투 회복·전투 후 회복을 분리한다', () => {
  const run = fixture({ deck: ['redline', 'mend', 'strike'], hearth: true }), b = run.battle;
  b.actor('navigator').hp = 20;
  b.actor('navigator').shield = 6;
  b.actor('navigator').reaction = 6;
  b.s.powers = { roundHeal: 1 };
  b.s.energy = 5;
  b.s.intents = [{ actor: 'enemy', type: 'attack', target: 'navigator', damage: 10 }];
  run.s.allies = b.s.allies.map(a => ({ id: a.id, hp: a.hp, max: a.max }));
  const recorder = recorderFor(run);
  recordAction(recorder, run, 'endRound');
  assert.equal(b.actor('navigator').hp, 17);
  recordAction(recorder, run, 'play', ['r0', 'navigator', 'enemy']);
  assert.equal(b.actor('navigator').hp, 13);
  recordAction(recorder, run, 'play', ['r1', 'pilot', 'navigator']);
  assert.equal(b.actor('navigator').hp, 22);
  b.actor('enemy').hp = 1;
  recordAction(recorder, run, 'play', ['r2', 'lightkeeper', 'enemy']);
  const record = recorder.finish('aborted', run.snapshot()), combat = record.battles[0];
  assert.equal(combat.status, 'won');
  assert.equal(combat.metrics.enemyDamage, 4);
  assert.equal(combat.metrics.blocked, 6);
  assert.equal(combat.metrics.selfDamage, 4);
  assert.equal(combat.metrics.healing, 10);
  assert.equal(combat.actions[0].events.find(e => e.type === 'reaction').amount, 6);
  assert.equal(combat.byEnemy.enemy.damage, 4);
  assert.equal(combat.byTarget.navigator.damage, 4);
  assert.equal(combat.cards.redline.plays, 1);
  assert.equal(combat.cards.mend.healing, 9);
  assert.equal(combat.exit.allies.find(a => a.id === 'navigator').hp, 22);
  assert.equal(combat.postBattleAllies.find(a => a.id === 'navigator').hp, 24);
  assert.deepEqual(combat.healthAccounting, { entryHP: 110, exitHP: 112, expectedHP: 112, matches: true });
});

test('오버킬을 명목 피해로 부풀리지 않고 실제 체력 손실과 흡수를 기록한다', () => {
  const run = fixture(), b = run.battle;
  b.s.allies.forEach(a => { a.hp = 3; a.shield = 2; });
  run.s.allies = b.s.allies.map(a => ({ id: a.id, hp: a.hp, max: a.max }));
  b.s.intents = [{ actor: 'enemy', type: 'area', damage: 20 }];
  const recorder = recorderFor(run);
  recordAction(recorder, run, 'endRound');
  const record = recorder.finish('lost', run.snapshot()), combat = record.battles[0];
  assert.equal(record.status, 'lost');
  assert.equal(combat.status, 'lost');
  assert.equal(combat.metrics.enemyDamage, 12);
  assert.equal(combat.metrics.blocked, 8);
  assert.equal(combat.metrics.deaths, 4);
  assert.equal(combat.healthAccounting.matches, true);
});

test('회복 도구는 실제 회복량만 기록하며 카드 사용 횟수에 포함하지 않는다', () => {
  const run = fixture(), b = run.battle;
  b.actor('navigator').hp = 27;
  b.s.voyage.tools = ['medicine'];
  run.s.tools = ['medicine'];
  run.s.allies = b.s.allies.map(a => ({ id: a.id, hp: a.hp, max: a.max }));
  const recorder = recorderFor(run);
  recordAction(recorder, run, 'useTool', [0, 'navigator']);
  const record = recorder.finish('aborted', run.snapshot()), combat = record.battles[0];
  assert.equal(combat.metrics.toolsUsed, 1);
  assert.equal(combat.metrics.healing, 3);
  assert.equal(combat.metrics.cardsPlayed, 0);
  assert.equal(combat.metrics.energySpent, 0);
  assert.equal(combat.actions[0].events[0].tool, 'medicine');
  assert.equal(combat.healthAccounting.matches, true);
});

test('두 마리 정예는 하나의 조우로 집계하고 각 적의 피해를 별도로 보존한다', () => {
  const run = fixture({ enemies: [0, 1].map(i => ({ id: 'twin' + i, name: '감시자 ' + i, pattern: 'twins', hp: 25, damage: 7, areaDamage: 3 })) }), b = run.battle;
  b.s.allies.forEach(a => { a.shield = 3; });
  b.s.intents = b.s.enemies.map(e => ({ actor: e.id, type: 'area', damage: 5 }));
  const recorder = recorderFor(run);
  recordAction(recorder, run, 'endRound');
  const record = recorder.finish('aborted', run.snapshot()), combat = record.battles[0];
  assert.equal(record.battles.length, 1);
  assert.equal(combat.encounter, 'twins+twins');
  assert.equal(combat.metrics.enemyDamage, 28);
  assert.equal(combat.metrics.blocked, 12);
  assert.equal(combat.byEnemy.twin0.damage, 8);
  assert.equal(combat.byEnemy.twin1.damage, 20);
  assert.ok(Object.values(combat.byTarget).every(t => t.damage === 7));
  assert.equal(combat.healthAccounting.matches, true);
});

test('종료 전투의 남은 이벤트가 보상·정비에서 다시 집계되지 않는다', () => {
  const run = fixture(), b = run.battle;
  b.actor('enemy').hp = 1;
  const recorder = recorderFor(run);
  recordAction(recorder, run, 'play', ['r0', 'navigator', 'enemy']);
  const before = copy(recorder.record.battles[0]);
  assert.equal(run.s.phase, 'reward');
  const snapshotBefore = run.snapshot();
  run.chooseReward(null);
  recorder.observe({ decision: { method: 'chooseReward', args: [null], reason: '보상 거절' }, before: snapshotBefore, after: run.snapshot(), events: copy(run.battle.s.events) });
  assert.deepEqual(recorder.record.battles[0], before);
  recorder.finish('aborted', run.snapshot());
  assert.equal(recorder.record.battles.length, 1);
});

test('중단·오류·승리·패배는 다른 상태로 유지하며 중단은 완료 평균에서 제외한다', () => {
  const records = [];
  for (const status of ['aborted', 'error']) {
    const run = fixture(), recorder = recorderFor(run);
    recordAction(recorder, run, 'play', ['r0', 'navigator', 'enemy']);
    records.push(recorder.finish(status, run.snapshot(), status + ' 검사'));
  }
  for (const status of ['won', 'lost']) {
    const run = fixture(), recorder = recorderFor(run), b = run.battle;
    if (status === 'won') { b.actor('enemy').hp = 1; recordAction(recorder, run, 'play', ['r0', 'navigator', 'enemy']); }
    else { b.s.allies.forEach(a => { a.hp = 1; }); run.s.allies = b.s.allies.map(a => ({ id: a.id, hp: a.hp, max: a.max })); b.s.intents = [{ actor: 'enemy', type: 'area', damage: 2 }]; recordAction(recorder, run, 'endRound'); }
    records.push(recorder.finish(status, run.snapshot()));
  }
  const report = Telemetry.summarize(records);
  assert.deepEqual(report.runs, { total: 4, won: 1, lost: 1, aborted: 1, error: 1 });
  assert.deepEqual(report.battles, { total: 4, won: 1, lost: 1, aborted: 1, error: 1 });
  assert.equal(report.encounters[0].n, 2);
  assert.equal(report.encounters[0].meanDamage, 2);
  assert.equal(report.encounters[0].outcomes.won.meanDamage, 0);
  assert.equal(report.encounters[0].outcomes.lost.meanDamage, 4);
});

test('전체 원정 정책은 비공개 뽑을 카드 순서와 난수 상태를 보지 않는다', () => {
  const run = fixture({ deck: ['draw', 'guard', 'burst', 'focus', 'strike', 'redline', 'mend', 'deepdive', 'lockdown', 'sweep'] });
  run.battle.s.voyage.tools = ['battery', 'flare'];
  run.s.tools = ['battery', 'flare'];
  const original = run.snapshot(), other = Run.restore(original);
  other.battle.s.zones.draw.reverse();
  other.battle.s.seed = (other.battle.s.seed ^ 0x76543210) >>> 0;
  for (const policy of ['balanced', 'aggressive', 'cautious']) assert.deepEqual(Automation.decide(run, { policy }), Automation.decide(other, { policy }));
  assert.deepEqual(run.snapshot(), original);
  assert.equal('draw' in Telemetry.publicState(run.battle.snapshot()), false);
});

test('전체 원정 정책은 다음 경로의 비공개 사건·보상 난수에 의존하지 않는다', () => {
  const run = new Run({ seed: 41, party });
  run.chooseBlessing(run.s.blessings[0]);
  const other = Run.restore(run.snapshot());
  other.s.rewardSeed = (other.s.rewardSeed ^ 0x76543210) >>> 0;
  other.s.seed = (other.s.seed ^ 0x12345678) >>> 0;
  for (const policy of ['balanced', 'aggressive', 'cautious']) assert.deepEqual(Automation.decide(run, { policy }), Automation.decide(other, { policy }));
});

test('실행 상한과 사용자 중단은 패배 대신 중단 기록을 만든다', () => {
  const limited = Simulation.simulate({ seed: 41, party, maxSteps: 1 });
  assert.equal(limited.status, 'aborted');
  assert.equal(limited.decisions.length, 1);
  const roundLimited = Simulation.simulate({ seed: 41, party, maxRounds: 1 });
  assert.equal(roundLimited.status, 'aborted');
  assert.ok(roundLimited.battles.every(b => b.actions.every(a => a.round <= 1)));
  const batch = Simulation.createBatch({ seedStart: 41, seedCount: 2, parties: [party] });
  batch.step(); batch.stop();
  assert.equal(batch.done, true);
  assert.equal(batch.records.length, 1);
  assert.equal(batch.records[0].status, 'aborted');
  assert.equal(batch.records[0].reason, '사용자 중단');
});

test('자동 실행 오류는 패배로 바꾸지 않고 원인과 별도 상태로 남긴다', () => {
  const original = Automation.step;
  try {
    Automation.step = () => { throw Error('검증용 정책 오류'); };
    const batch = Simulation.createBatch({ seedCount: 1, parties: [party] });
    batch.step();
    assert.equal(batch.done, true);
    assert.equal(batch.records[0].status, 'error');
    assert.match(batch.records[0].reason, /검증용 정책 오류/);
  } finally { Automation.step = original; }
});

test('배치는 편성·정책별로 같은 시작 시드 묶음을 사용하고 입력을 변경하지 않는다', () => {
  const config = { seedStart: 101, seedCount: 2, policies: ['balanced', 'aggressive', 'cautious'], parties: Simulation.STANDARD_PARTIES, maxSteps: 1 }, before = copy(config);
  const batch = Simulation.createBatch(config);
  while (!batch.done) batch.step();
  assert.equal(batch.records.length, 18);
  for (const p of config.parties) for (const policy of config.policies) {
    assert.deepEqual(batch.records.filter(r => r.config.policy === policy && r.config.party.join('|') === p.join('|')).map(r => r.config.seed), [101, 102]);
  }
  assert.deepEqual(config, before);
  assert.equal(Simulation.allParties().length, 15);
});

test('잘못된 시드·편성·정책·상한과 과대 배치는 실행 전에 거절한다', () => {
  for (const config of [{ seedStart: -1 }, { seedCount: 0 }, { policies: ['unknown'] }, { parties: [[...party.slice(0, 3), party[0]]] }, { maxSteps: 0 }, { maxRounds: 0 }, { seedCount: 1000, policies: ['balanced', 'aggressive'] }]) assert.throws(() => Simulation.createBatch(config));
});

let completedRecords;
test('여러 실제 원정은 노드·보상·상점·사건·유물·계약을 거쳐 정상 종료된다', () => {
  const batch = Simulation.createBatch({ seedStart: 1, seedCount: 3, policies: ['balanced', 'aggressive', 'cautious'], parties: [party] });
  while (!batch.done) batch.step();
  completedRecords = batch.records;
  assert.equal(completedRecords.length, 9);
  assert.ok(completedRecords.every(r => ['won', 'lost'].includes(r.status)), completedRecords.map(r => r.reason).join('\n'));
  assert.ok(completedRecords.every(r => r.battles.every(b => b.healthAccounting.matches)));
  const decisions = completedRecords.flatMap(r => r.decisions), phases = new Set(decisions.map(d => d.phase));
  for (const phase of ['blessing', 'map', 'battle', 'reward', 'relicreward', 'patron', 'interlude']) assert.ok(phases.has(phase), phase + ' 누락');
  assert.ok(decisions.some(d => d.phase === 'interlude' && d.candidates.type === 'shop'));
  assert.ok(decisions.some(d => d.phase === 'interlude' && d.candidates.type === 'event'));
  assert.ok(completedRecords.some(r => r.battles.some(b => b.tier === 'elite')));
  assert.ok(completedRecords.every(r => r.battles.every(b => b.actions.every(a => a.before && a.after && Array.isArray(a.events)))));
});

test('동일 설정의 기록은 완전히 같고 저장 복원·선택 재생은 일반 게임을 보존한다', () => {
  const normal = new Run({ seed: 178, party });
  normal.chooseBlessing(normal.s.blessings[0]); normal.choosePath(0);
  const original = normal.snapshot(), restored = Run.restore(original);
  assert.deepEqual(restored.snapshot(), original);
  const config = { seed: 41, party, policy: 'balanced' };
  const one = Simulation.simulate(config), two = Simulation.simulate(config);
  assert.deepEqual(one, two);
  assert.equal(Simulation.replay(one).matches, true);
  assert.deepEqual(normal.snapshot(), original);
});

test('실제 보상에서 얻은 카드 사본과 유물 변경을 공개 선택 후보와 함께 기록한다', () => {
  const decisions=completedRecords.flatMap(r=>r.decisions);
  const rewards=decisions.filter(d=>d.method==='chooseReward'&&d.args[0]!==null);
  assert.ok(rewards.length>0);
  for(const d of rewards){
    assert.ok(d.candidates.includes(d.args[0]));
    assert.equal(d.inventoryChanges.cards.added.length,1);
    assert.equal(d.inventoryChanges.cards.added[0].kind,d.args[0]);
    assert.ok(d.inventoryChanges.cards.added[0].id);
  }
  for(const d of decisions.filter(d=>d.method==='chooseBlessing'))assert.deepEqual(d.inventoryChanges.relics.added,[d.args[0]]);
  for(const d of decisions.filter(d=>d.method==='choosePath'))assert.ok(d.candidates.every(c=>Array.isArray(c.enemies)));
});

test('보고서와 CSV는 조우 단위와 실제 피해·자해·회복을 구분해서 내보낸다', () => {
  const report = Telemetry.summarize(completedRecords), csv = Telemetry.battleCSV(completedRecords);
  assert.equal(report.runs.total, 9);
  assert.equal(report.battles.total, completedRecords.reduce((n, r) => n + r.battles.length, 0));
  assert.ok(report.encounters.every(g => g.n > 0 && Number.isFinite(g.meanDamage)));
  assert.ok(report.cards.some(c => c.plays > 0 && Object.keys(c.byActor).length));
  assert.match(csv, /enemyHPDamage/);
  assert.match(csv, /shieldAbsorbed/);
  assert.match(csv, /selfHPDamage/);
  assert.match(csv, /combatHealing/);
  assert.equal(csv.split('\r\n').length, report.battles.total + 1);
  assert.ok(report.limitations.some(t => t.includes('인과')));
});

console.log(JSON.stringify({ checks, expeditions: completedRecords.length, wins: completedRecords.filter(r => r.status === 'won').length, losses: completedRecords.filter(r => r.status === 'lost').length, battles: completedRecords.reduce((n, r) => n + r.battles.length, 0), result: 'all passed' }, null, 2));
