'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), readline = require('node:readline'), assert = require('node:assert/strict');
const { Run } = require('./party-expedition-voyage.js');
const Automation = require('./party-expedition-automation.js');
const Telemetry = require('./party-expedition-telemetry.js');

const TARGET = { seed: 32, policy: 'balanced', party: ['navigator', 'pilot', 'sounder', 'salvager'] };
const POLICY = 'lowest-hp-target-probe';
const POLICY_VERSION = 'lowest-hp-target-probe-1';
const CONTROL = 'recorded-balanced-control';
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const safe = value => String(value).replace(/\|/g, '/');

async function readSourceRecord(file) {
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of reader) {
      lineNumber++;
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      if (record.config.seed === TARGET.seed && record.config.policy === TARGET.policy && record.config.party.join('|') === TARGET.party.join('|')) {
        assert.equal(record.status, 'lost', '지정한 coverage 사례가 자연 패배 기록이어야 합니다.');
        return { record, lineNumber, lineSHA256: hash(line) };
      }
    }
    throw Error('지정한 시드 32·편성·balanced 자연 패배 기록을 찾지 못했습니다.');
  } finally { reader.close(); input.destroy(); }
}

// A policy sees current public HP only. This helper does not read RNG state,
// draw order, or the result of a preview to select an action or an enemy.
function retargetDirectAttack(run, chosen) {
  if (chosen.method !== 'play') return { chosen, change: null };
  const [card, actor, target, choice] = chosen.args;
  const definition = run.battle.definition(card, choice);
  const direct = definition.target === 'enemy' && !definition.areaDamage
    && (card === 'basic' || definition.damage || definition.exposedDamage || definition.weakDamage);
  if (!direct) return { chosen, change: null };
  const living = run.battle.s.enemies.filter(enemy => enemy.hp > 0);
  const lowest = living.reduce((selected, enemy) => !selected || enemy.hp < selected.hp ? enemy : selected, null);
  if (!lowest || lowest.id === target) return { chosen, change: null };
  // Validation and preview establish legality only. The preview's hidden state
  // and effects are never scored, compared, or otherwise used by the policy.
  const before = run.battle.snapshot();
  run.battle.validate(card, actor, lowest.id, choice);
  run.battle.preview(card, actor, lowest.id, choice);
  assert.deepEqual(run.battle.snapshot(), before, '대상 유효성 미리보기는 실제 전투를 변경하지 않아야 합니다.');
  const args = [card, actor, lowest.id];
  if (choice !== undefined) args.push(choice);
  return { chosen: { ...chosen, args, reason: chosen.reason + ' 분석용 대조: 단일적 직접 공격의 대상만 현재 살아 있는 최저 HP 적으로 변경합니다.' },
    change: { round: run.battle.s.round, card, name: definition.name, actor, choice: choice ?? null,
      originalTarget: target, newTarget: lowest.id, publicEnemyHP: living.map(enemy => ({ id: enemy.id, hp: enemy.hp })),
      validated: true, originalDecision: copy(chosen) } };
}

function runProbe(source, options = {}) {
  assert.equal(source.config.seed, TARGET.seed);
  assert.equal(source.config.policy, TARGET.policy);
  assert.deepEqual(source.config.party, TARGET.party);
  assert.equal(source.status, 'lost');
  const limits = { maxSteps: 1500, maxRounds: 60, ...options };
  for (const key of ['maxSteps', 'maxRounds']) if (!Number.isInteger(limits[key]) || limits[key] < 1) throw Error('유효한 실행 상한이 필요합니다: ' + key);
  const sourceBoss = source.battles.find(battle => battle.floor === 8 && battle.tier === 'boss');
  assert.ok(sourceBoss && sourceBoss.status === 'lost', '8구역 보스 자연 패배가 필요합니다.');
  const prefixEnd = source.decisions.findIndex(d => d.phase === 'battle' && d.floor === 8);
  assert.ok(prefixEnd > 0, '보스 진입 직전의 원본 명령 경계를 찾지 못했습니다.');
  const prefix = source.decisions.slice(0, prefixEnd), suffix = source.decisions.slice(prefixEnd);

  // The product batch bootstrap sets emergency tool policy before its first
  // recorded decision. Reconstruct that declared setup using its public API;
  // no ally HP, deck, foe, energy, RNG, or growth state is injected or edited.
  const replayConfig={...source.config,contentVersion:source.contentVersion||source.config.contentVersion||'voyage-1',balanceVersion:source.config.balanceVersion||'voyage-balance-0'};
  const reference = new Run(replayConfig);
  reference.setToolPolicy('emergency');
  for (const chosen of prefix) reference[chosen.method](...copy(chosen.args));
  const referenceStart = reference.snapshot();
  assert.equal(referenceStart.phase, 'battle');
  assert.equal(referenceStart.floor, 7);
  assert.deepEqual(Telemetry.publicState(referenceStart.battle), sourceBoss.entry, '원본 명령으로 재생한 보스의 공개 진입 상태가 수집 원본과 달라졌습니다.');
  const restored = Run.restore(referenceStart);
  assert.deepEqual(restored.snapshot(), referenceStart, '복원한 원정 전체 상태가 원본 명령 재생 상태와 달라졌습니다.');
  assert.deepEqual(restored.battle.snapshot(), reference.battle.snapshot(), '내부 전투 전체 상태의 복원이 일치해야 합니다.');

  function makeRunner(policy) {
    const config = { ...copy(source.config), policy, policyVersion: POLICY_VERSION, sourcePolicy: TARGET.policy,
      analysisOnly: true, excludeFromCoverageTotals: true, studyType: 'paired-failure-diagnostic', ...Object.fromEntries(['maxSteps', 'maxRounds'].map(key => [key, limits[key]])) };
    const run = new Run(replayConfig), recorder = Telemetry.createRecorder(config, run.snapshot());
    let steps = 0;
    function execute(chosen) {
      const before = run.snapshot(), oldBattle = run.battle;
      const result = run[chosen.method](...copy(chosen.args)), after = run.snapshot();
      const events = before.phase === 'battle' && Array.isArray(result) ? copy(result)
        : run.battle && run.battle !== oldBattle ? copy(run.battle.s.events || []) : [];
      if (JSON.stringify(before) === JSON.stringify(after)) throw Error('분석용 행동이 상태를 변경하지 않았습니다: ' + chosen.method);
      recorder.observe({ decision: chosen, before, after, events });
      steps++;
      return { before, after, events };
    }
    execute({ method: 'setToolPolicy', args: ['emergency'], reason: '원본 제품 배치의 선언된 시작 설정을 같은 Run API로 복원합니다. 이 설정은 원본 배치에서 첫 결정 전에 적용됩니다.' });
    for (const chosen of prefix) execute(chosen);
    const start = run.snapshot();
    assert.deepEqual(start, referenceStart, '분석 분기의 보스 진입 원정 상태가 원본 명령 재생과 달라졌습니다.');
    assert.deepEqual(run.battle.snapshot(), reference.battle.snapshot(), '분석 분기의 내부 전투 전체 상태가 원본 명령 재생과 달라졌습니다.');
    return { run, execute, recorder, start, get steps() { return steps; } };
  }

  const control = makeRunner(CONTROL);
  for (const chosen of suffix) control.execute(chosen);
  assert.equal(control.run.s.phase, source.status);
  assert.deepEqual(Telemetry.publicState(control.run.snapshot().battle), sourceBoss.exit, '원본의 보스 종료 공개 상태도 그대로 재현되어야 합니다.');
  for (const key of ['deck', 'allies', 'relics', 'tools', 'gold', 'battlesWon']) assert.deepEqual(control.run.s[key], source.final[key]);
  const controlRecord = control.recorder.finish(control.run.s.phase, control.run.snapshot());

  const probe = makeRunner(POLICY), changes = [];
  let probeRecord;
  try {
    while (probe.run.s.phase === 'battle') {
      let reason = probe.steps >= limits.maxSteps ? '전체 실행 행동 상한으로 중단'
        : probe.run.battle.s.round > limits.maxRounds ? '보스 라운드 상한으로 중단'
          : options.shouldStop?.() ? '사용자 중단' : null;
      if (reason) { probeRecord = probe.recorder.finish('aborted', probe.run.snapshot(), reason); break; }
      const base = Automation.decide(probe.run, { policy: TARGET.policy });
      if (!base) throw Error('진행 중인 보스 전투에 자동 행동이 없습니다.');
      const { chosen, change } = retargetDirectAttack(probe.run, base);
      const transition = probe.execute(chosen);
      if (change) changes.push({ ...change, actionIndex: probe.recorder.record.battles.at(-1).actions.length,
        actualEvents: copy(transition.events) });
    }
    if (!probeRecord) {
      if (!['won', 'lost'].includes(probe.run.s.phase)) throw Error('보스 분석 분기가 예상하지 못한 원정 단계로 종료했습니다.');
      probeRecord = probe.recorder.finish(probe.run.s.phase, probe.run.snapshot());
    }
  } catch (error) { probeRecord = probe.recorder.finish('error', probe.run.snapshot(), error.message); }
  function result(record) {
    const battle = record.battles.at(-1);
    return { policy: record.config.policy, status: record.status, reason: record.reason,
      entryHP: battle.entry.allies.reduce((n, ally) => n + ally.hp, 0), exitHP: battle.exit.allies.reduce((n, ally) => n + ally.hp, 0),
      finalAllies: battle.exit.allies.map(ally => ({ id: ally.id, hp: ally.hp })),
      postBattleRunHP: record.final.allies.reduce((n, ally) => n + ally.hp, 0),
      postBattleRunAllies: record.final.allies.map(ally => ({ id: ally.id, hp: ally.hp })),
      finalEnemies: battle.exit.enemies.map(enemy => ({ id: enemy.id, pattern: enemy.pattern, hp: enemy.hp })),
      rounds: battle.rounds, metrics: copy(battle.metrics), healthAccounting: copy(battle.healthAccounting) };
  }
  const comparison = { version: POLICY_VERSION, studyType: 'paired-failure-diagnostic', excludeFromCoverageTotals: true,
    target: copy(TARGET), sourceStatus: source.status, sourceBoss: { floor: sourceBoss.floor, name: sourceBoss.name, encounter: sourceBoss.encounter },
    originalPrefixCommands: prefix.length, originalBossCommands: suffix.length,
    bootstrap: { method: 'setToolPolicy', args: ['emergency'], note: '원본 배치에서 첫 기록 결정 전에 적용한 설정이며 두 분석 분기에 동일하게 적용하고 별도 기록한다.' },
    entryVerification: { sourceRecordedPublicEntryMatches: true, originalCommandReplayEqualsRunRestore: true,
      controlFullRunMatchesOriginalReplay: true, probeFullRunMatchesOriginalReplay: true,
      controlFullInternalBattleMatchesOriginalReplay: true, probeFullInternalBattleMatchesOriginalReplay: true,
      referenceRunSHA256: hash(referenceStart), referenceBattleSHA256: hash(referenceStart.battle),
      controlBattleSHA256: hash(control.start.battle), probeBattleSHA256: hash(probe.start.battle),
      scope: '원본 JSONL은 공개 상태를 보존한다. 내부 전체 상태는 원본 명령의 새 Run 재생을 기준으로 비교했다. 엔진 복원·동일성 검사용 내부 상태는 정책 선택에 사용하지 않는다.' },
    originalExitMatchesSource: true, control: result(controlRecord), probe: result(probeRecord), targetChanges: changes,
    limitations: ['한 자연 패배 사례에서 한 가지 표적 정책만 바꾼 사후 진단이며 독립적인 반복 표본이 아니다.',
      '보스 진입 상태는 같지만 대상 변경 이후 전투 상태와 후속 자동 선택은 달라질 수 있다. 모든 후속 카드를 강제로 같게 만든 실험은 아니다.',
      '직접 공격의 표적만 바꾸며 광역·아군 카드·도구·카드 선택·효과 선택·실행자는 같은 balanced 자동 판단을 사용한다.',
      '이 진단만으로 공격형 덱이 정답이거나 보호가 무효하다고 결론 내릴 수 없다. 제품 정책이나 적·카드 수치는 수정하지 않았다.',
      '두 재생의 전반 원정은 동일한 원본을 복제한다. coverage-450 및 기존 660회 통계, baseline-24와 별도로 보관하고 승패·표본 수에 합산하지 않는다.'] };
  return { records: [controlRecord, probeRecord], summary: Telemetry.summarize([controlRecord, probeRecord]), comparison };
}

function report(comparison) {
  const c = comparison.control, p = comparison.probe;
  return ['# 시드 32 자연 패배의 공격 대상 진단', '',
    `대상: coverage-450의 시드 ${TARGET.seed}, ${TARGET.party.join(' / ')}, balanced. 보스 진입 실제 HP ${c.entryHP}.`, '',
    '원본 명령을 새 Run에서 재생해 보스 시작 상태를 복원했다. 공개 손패·적 의도·HP는 원본 수집 상태와 일치하고, 분석 두 분기의 원정 전체 상태와 내부 전투 전체 상태는 원본 명령 재생 상태와 동일하다. 내부 RNG·덱 순서는 복원 검증용이며 판단 근거에 사용하지 않는다.', '',
    '| 보스 결과 | 원본 명령 재생 | 단일 공격 대상 변경 |', '|---|---:|---:|',
    `| 승패 | ${c.status} | ${p.status} |`, `| 라운드 | ${c.rounds} | ${p.rounds} |`,
    `| 실제 적 HP 피해 | ${c.metrics.enemyDamage} | ${p.metrics.enemyDamage} |`, `| 보호 흡수 | ${c.metrics.blocked} | ${p.metrics.blocked} |`,
    `| 전투 회복 | ${c.metrics.healing} | ${p.metrics.healing} |`, `| 사용 카드 | ${c.metrics.cardsPlayed} | ${p.metrics.cardsPlayed} |`,
    `| 기본 공격 | ${c.metrics.basicAttacks} | ${p.metrics.basicAttacks} |`, `| 도구 사용 | ${c.metrics.toolsUsed} | ${p.metrics.toolsUsed} |`,
    `| 종료 파티 HP | ${c.exitHP} | ${p.exitHP} |`, '',
    `분석 분기는 단일적 직접 공격의 대상만 살아 있는 최저 HP 적으로 돌렸다. 실제 대상 변경은 ${comparison.targetChanges.length}회였다. 광역·아군 카드·도구·카드 선택·효과 선택·실행자는 기존 balanced 자동 판단을 유지했다. 대상 변경 이후 달라진 공개 상황에 맞춰 후속 판단은 다시 계산된다.`, '',
    '## 실제 대상 변경', '', '| 턴 | 카드 | 실행자 | 원래 대상 | 변경 대상 | 당시 적 HP |', '|---:|---|---|---|---|---|',
    ...comparison.targetChanges.map(change => `| ${change.round} | ${safe(change.name)} | ${change.actor} | ${change.originalTarget} | ${change.newTarget} | ${change.publicEnemyHP.map(e => e.id + ': ' + e.hp).join(' / ')} |`), '',
    '## 판단', '',
    p.status === 'won' && c.status === 'lost'
      ? '동일한 성장·덱·체력·적·난수 진입 조건에서 표적 정책의 작은 변경으로 이 사례를 이겼다. 따라서 이 패배를 진입 체력 부족이나 보호 카드의 무효로만 설명하기 어렵다. 한 행동의 미리보기 점수를 높이는 선택이 동료 적을 오래 남기는 표적 편향으로 이어졌는지 조사할 근거가 생겼다.'
      : '이 사례에서 표적 정책 변경의 실제 결과를 기록했다. 단일 사례이며 후속 전투 선택도 달라질 수 있으므로 수치 변경의 근거로 직접 사용하지 않는다.', '',
    '## 표본 분리와 한계', '', ...comparison.limitations.map(value => '- ' + value), '',
    'runs.jsonl에는 동일한 전반 원정 명령과 원본/대체 보스의 전체 실제 전환·공개 후보·손패·실행자·대상·이벤트를 담았다. comparison.json에는 내부 상태의 동일성 검사 해시·보스 단독 수치·대상 변경을 담았다. summary.json은 이 두 진단 재생만 집계하며 일반 원정 승률로 해석하지 않는다.', ''].join('\n');
}

async function fileHash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

async function main(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') { console.log('node prototype/party-expedition-failure-probe.cjs [--source coverage-450/runs.jsonl] [--out 신규폴더]\n시드 32 자연 패배를 원본 명령 재생과 보스 공격 대상 변경으로 비교합니다. 기존 출력 폴더는 덮어쓰지 않습니다.'); return; }
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !['source', 'out'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('유효한 옵션과 값이 필요합니다: ' + argv[i]);
    flags[key] = argv[++i];
  }
  const sourceFile = path.resolve(flags.source || path.join(__dirname, 'study-results', 'coverage-450', 'runs.jsonl'));
  const out = path.resolve(flags.out || path.join(__dirname, 'study-results', 'failure-probe'));
  if (fs.existsSync(out)) throw Error('기존 출력 폴더는 덮어쓰지 않습니다: ' + out);
  const { record, lineNumber, lineSHA256 } = await readSourceRecord(sourceFile);
  const sources = ['party-expedition-failure-probe.cjs', 'party-expedition-core.js', 'party-expedition-catalog.js', 'party-expedition-run.js', 'party-expedition-voyage.js', 'party-expedition-voyage-combat.js', 'party-expedition-auto.js', 'party-expedition-automation.js', 'party-expedition-telemetry.js'];
  const manifest = { createdAt: new Date().toISOString(), studyType: 'paired-failure-diagnostic', excludeFromCoverageTotals: true,
    source: { file: sourceFile, SHA256: await fileHash(sourceFile), targetLine: lineNumber, targetLineSHA256: lineSHA256, target: copy(TARGET) },
    policies: { control: CONTROL, probe: POLICY, version: POLICY_VERSION, alias: '보스 단일 공격의 최저 HP 표적 진단', combat: 'balanced Automation.decide / Auto.chooseVoyage(emergency); only direct enemy target overridden', independentExpertCombatStrategy: false },
    versions: { telemetry: Telemetry.VERSION, originalPolicy: Automation.POLICY_VERSION, probe: POLICY_VERSION },
    sourceSHA256: Object.fromEntries(sources.map(file => [file, hash(fs.readFileSync(path.join(__dirname, file), 'utf8'))])) };
  console.log('시드 32 자연 패배를 동일한 진입 상태로 복원하고 분석용 표적 정책을 비교합니다.');
  const result = runProbe(record);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(out);
  const write = (file, value) => fs.writeFileSync(path.join(out, file), value, { flag: 'wx' });
  write('manifest.json', JSON.stringify(manifest, null, 2));
  write('runs.jsonl', result.records.map(r => JSON.stringify(r)).join('\n') + '\n');
  write('summary.json', JSON.stringify({ ...result.summary, studyType: 'paired-failure-diagnostic', excludeFromCoverageTotals: true }, null, 2));
  write('battles.csv', Telemetry.battleCSV(result.records));
  write('comparison.json', JSON.stringify(result.comparison, null, 2));
  write('report.md', report(result.comparison));
  const hpAccountingErrors = result.records.flatMap(r => r.battles).filter(b => !b.healthAccounting.matches).length;
  console.log(JSON.stringify({ source: TARGET, original: result.comparison.control, probe: result.comparison.probe,
    targetChanges: result.comparison.targetChanges.length, allEntryStateChecksMatch: true, hpAccountingErrors, out }, null, 2));
  if (result.summary.runs.error || hpAccountingErrors) process.exitCode = 1;
}

module.exports = { readSourceRecord, runProbe, retargetDirectAttack, POLICY, POLICY_VERSION, TARGET };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
