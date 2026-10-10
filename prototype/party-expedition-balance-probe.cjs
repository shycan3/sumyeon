'use strict';
const fs = require('node:fs'), path = require('node:path'), readline = require('node:readline');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { Run } = require('./party-expedition-voyage.js');
const Automation = require('./party-expedition-automation.js');
const Telemetry = require('./party-expedition-telemetry.js');
const copy = x => JSON.parse(JSON.stringify(x));
const hash = x => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const VERSION = 'elite-twins-paired-balance-probe-1';

async function selectCases(files, count = 12) {
  files = Array.isArray(files) ? files : [files];
  const candidates = [], identities = new Set(); let duplicateCandidates = 0;
  for (const file of files) {
    const input = fs.createReadStream(file, { encoding: 'utf8' });
    const reader = readline.createInterface({ input, crlfDelay: Infinity });
    let lineNumber = 0;
    try {
    for await (const line of reader) {
      lineNumber++;
      if (!line.trim()) continue;
      const record = JSON.parse(line);
      if ((record.config.balanceVersion || 'voyage-balance-0') !== 'voyage-balance-0') continue;
      for (const battle of record.battles) {
        if (battle.tier === 'elite' && battle.encounter === 'twins+twins' && ['won', 'lost'].includes(battle.status)) {
          const identity = [record.config.seed, record.config.party.join('|'), record.config.policy, record.config.difficulty, record.config.breakMode, battle.nodeId].join('::');
          if (identities.has(identity)) { duplicateCandidates++; continue; }
          identities.add(identity);
          candidates.push({ record, battle, lineNumber, lineSHA256: hash(line), sourcePath: file });
        }
      }
    }
    } finally { reader.close(); input.destroy(); }
  }
  assert.ok(candidates.length, '이전 밸런스의 정예 감시자 완료 전투가 없습니다.');
  const floors = [...new Set(candidates.map(c => c.battle.floor))].sort((a, b) => a - b);
  const policyRank = { balanced: 0, aggressive: 1, cautious: 2 };
  candidates.sort((a, b) => a.record.config.seed - b.record.config.seed || (policyRank[a.record.config.policy] ?? 3) - (policyRank[b.record.config.policy] ?? 3) || a.lineNumber - b.lineNumber);
  const queues = new Map(floors.map(f => [f, candidates.filter(c => c.battle.floor === f)]));
  const selected = [], used = new Set(), strata = new Set();
  // Round-robin floors, preferring a new party in each floor. No outcome or
  // after-patch result is used to choose cases. Fewer than 12 remain valid.
  while (selected.length < Math.min(count, candidates.length)) {
    let progressed = false;
    for (const floor of floors) {
      const q = queues.get(floor);
      let available = q.filter(c => !used.has(c) && !strata.has(floor + '|' + c.record.config.party.join('|')));
      if (!available.length) available = q.filter(c => !used.has(c));
      const floorSelected = selected.filter(c => c.battle.floor === floor);
      const policyCount = policy => floorSelected.filter(c => c.record.config.policy === policy).length;
      const distance = candidate => floorSelected.length ? Math.min(...floorSelected.map(c => candidate.record.config.party.filter(id => !c.record.config.party.includes(id)).length)) : 0;
      available.sort((a,b) => policyCount(a.record.config.policy) - policyCount(b.record.config.policy)
        || (policyRank[a.record.config.policy] ?? 3) - (policyRank[b.record.config.policy] ?? 3)
        || distance(b) - distance(a) || a.record.config.seed - b.record.config.seed || a.lineNumber - b.lineNumber);
      const next = available[0];
      if (!next) continue;
      selected.push(next); used.add(next); strata.add(floor + '|' + next.record.config.party.join('|')); progressed = true;
      if (selected.length >= count) break;
    }
    if (!progressed) break;
  }
  return { selected, candidateCount: candidates.length, duplicateCandidates, candidateFloors: floors, absentFloors: [4, 7].filter(f => !floors.includes(f)), selection: '구역 교대·구역별 새 편성 우선; 구역별 정책 표본 수가 적은 정책 우선(동수 balanced/aggressive/cautious 순), 선택된 편성과 구성 차이가 큰 후보 우선; 입력간 같은 시드/편성/정책/규칙/노드는 중복 제외; 원본 승패 및 패치 결과로 선정하지 않음' };
}

function execute(run, chosen) {
  const before = run.snapshot(), oldBattle = run.battle;
  const result = run[chosen.method](...copy(chosen.args)), after = run.snapshot();
  const events = before.phase === 'battle' && Array.isArray(result) ? copy(result)
    : run.battle && oldBattle !== run.battle ? copy(run.battle.s.events || []) : [];
  return { decision: copy(chosen), before, after, events };
}

function areaObservation(battle) {
  const publicArea = new Set(), publicWindup = new Set(), appliedArea = new Set(), appliedWindup = new Set();
  const visit = s => {
    for (const intent of s?.intents || []) {
      if (intent.type === 'area') publicArea.add(s.round + '|' + intent.actor);
      if (intent.type === 'prepare' && intent.nextType === 'area') publicWindup.add(s.round + '|' + intent.actor);
    }
  };
  visit(battle.entry);
  for (const action of battle.actions) {
    visit(action.before); visit(action.after);
    if (action.method !== 'endRound') continue;
    for (const intent of action.before.intents) {
      if (intent.type === 'area' && action.events.some(e => e.type === 'damage' && e.source === intent.actor && action.before.allies.some(a => a.id === e.target))) appliedArea.add(action.round + '|' + intent.actor);
      if (intent.type === 'prepare' && intent.nextType === 'area' && action.events.some(e => e.type === 'prepare' && e.actor === intent.actor)) appliedWindup.add(action.round + '|' + intent.actor);
    }
  }
  const rounds = values => [...new Set([...values].map(key => Number(key.split('|')[0])))].sort((a, b) => a - b);
  return { areaPublicOpportunities: publicArea.size, areaAppliedOpportunities: appliedArea.size,
    windupPublicOpportunities: publicWindup.size, windupAppliedOpportunities: appliedWindup.size,
    areaPublicRounds: rounds(publicArea), areaAppliedRounds: rounds(appliedArea), windupPublicRounds: rounds(publicWindup) };
}

function pairedCase(candidate, options = {}) {
  const { record: source, battle: sourceBattle, lineNumber, lineSHA256, sourcePath } = candidate;
  const oldConfig = { ...copy(source.config), contentVersion:source.contentVersion||source.config.contentVersion||'voyage-1', balanceVersion: source.config.balanceVersion || 'voyage-balance-0' };
  const prefixEnd = source.decisions.findIndex(d => d.phase === 'battle' && d.floor === sourceBattle.floor);
  assert.ok(prefixEnd > 0, '정예 전투 시작 명령 경계가 없습니다.');
  const prefix = source.decisions.slice(0, prefixEnd), suffix = [];
  for (const chosen of source.decisions.slice(prefixEnd)) {
    if (chosen.phase !== 'battle' || chosen.floor !== sourceBattle.floor) break;
    suffix.push(chosen);
  }
  const reference = new Run(oldConfig); reference.setToolPolicy('emergency');
  for (const chosen of prefix) execute(reference, chosen);
  const entry = reference.snapshot();
  assert.equal(entry.phase, 'battle'); assert.equal(entry.floor + 1, sourceBattle.floor);
  assert.deepEqual(Telemetry.publicState(entry.battle), sourceBattle.entry, '원본 명령 재생의 정예 공개 진입 상태 불일치');
  const restore = Run.restore(copy(entry));
  assert.deepEqual(restore.snapshot(), entry, '원정 내부 전체 상태 복원 불일치');
  assert.deepEqual(restore.battle.snapshot(), reference.battle.snapshot(), '전투 내부 전체 상태 복원 불일치');
  for (const chosen of suffix) execute(restore, chosen);
  assert.deepEqual(Telemetry.publicState(restore.snapshot().battle), sourceBattle.exit, '원본 명령 전투 종료 상태 불일치');

  function branch(balanceVersion) {
    const run = Run.restore(copy(entry));
    assert.deepEqual(run.snapshot(), entry, '분기 복원 직후 전체 상태 불일치');
    if (balanceVersion === 'voyage-balance-1') {
      run.s.balanceVersion = balanceVersion;
      run.battle.s.voyage.balanceVersion = balanceVersion;
      run.battle.s.voyage.encounterTier = 'elite';
    }
    const actualEntry = run.snapshot(), normalized = copy(actualEntry);
    normalized.balanceVersion = entry.balanceVersion;
    normalized.battle.voyage.balanceVersion = entry.battle.voyage.balanceVersion;
    if (entry.battle.voyage.encounterTier === undefined) delete normalized.battle.voyage.encounterTier;
    else normalized.battle.voyage.encounterTier = entry.battle.voyage.encounterTier;
    assert.deepEqual(normalized, entry, '세 가지 버전/정예 표식 이외의 진입 상태가 달라졌습니다.');
    const config = { ...oldConfig, balanceVersion, analysisOnly: true, excludeFromCoverageTotals: true,
      excludediagnostic: true, studyType: 'paired-balance-diagnostic', sourceLine: lineNumber, targetFloor: sourceBattle.floor,
      policyVersion: Automation.POLICY_VERSION, probeVersion: VERSION };
    const recorder = Telemetry.createRecorder(config, actualEntry);
    let steps = 0, status, reason = null;
    try {
      while (run.s.phase === 'battle') {
        if (steps >= (options.maxSteps || 1500) || run.battle.s.round > (options.maxRounds || 60)) { status = 'aborted'; reason = '진단 전투 실행 상한'; break; }
        const transition = Automation.step(run, { policy: source.config.policy, toolPolicy: 'emergency' });
        assert.ok(transition.decision, '진행 중인 진단 전투의 자동 명령 부재');
        recorder.observe(transition); steps++;
      }
      if (!status) status = run.battle.s.status;
    } catch (error) { status = 'error'; reason = error.message; }
    const log = recorder.finish(status, run.snapshot(), reason), battle = log.battles[0];
    assert.equal(log.battles.length, 1, '해당 정예 전투만 수집해야 합니다.');
    return { log, start: actualEntry, result: { status, reason, rounds: battle.rounds, entryHP: battle.healthAccounting.entryHP,
      exitHP: battle.healthAccounting.exitHP, healthAccounting: copy(battle.healthAccounting), metrics: copy(battle.metrics),
      cards: copy(battle.cards), area: areaObservation(battle) } };
  }
  const control = branch('voyage-balance-0'), patched = branch('voyage-balance-1');
  assert.deepEqual(control.log.battles[0].exit, sourceBattle.exit, '같은 기존 자동 정책의 원본 전투 종료 재현 불일치');
  assert.deepEqual(control.log.decisions.map(d => ({ method: d.method, args: d.args })), suffix.map(d => ({ method: d.method, args: d.args })), '같은 기존 자동 정책의 명령 재현 불일치');
  const c = control.result, p = patched.result;
  return { records: [control.log, patched.log], comparison: { source: { path: sourcePath, lineNumber, lineSHA256, seed: source.config.seed,
    party: copy(source.config.party), policy: source.config.policy, floor: sourceBattle.floor, node: sourceBattle.nodeId, name: sourceBattle.name },
    verification: { originalPublicEntryMatches: true, originalRecordedCommandsExitMatches: true, originalAutoExitMatches: true,
      originalAutoCommandsMatch: true, fullRestoredStatesMatch: true, onlyDeclaredEntryMetadataDiffers: true,
      originalFullEntrySHA256: hash(entry), patchedFullEntrySHA256: hash(patched.start), originalBattleSHA256: hash(entry.battle),
      patchedBattleSHA256: hash(patched.start.battle), normalizedPatchedEntrySHA256: hash(entry) },
    control: c, patched: p, delta: { enemyDamage: p.metrics.enemyDamage - c.metrics.enemyDamage,
      blocked: p.metrics.blocked - c.metrics.blocked, healing: p.metrics.healing - c.metrics.healing,
      rounds: p.rounds - c.rounds, deaths: p.metrics.deaths - c.metrics.deaths,
      cardsPlayed: p.metrics.cardsPlayed - c.metrics.cardsPlayed, areaPublicOpportunities: p.area.areaPublicOpportunities - c.area.areaPublicOpportunities,
      areaAppliedOpportunities: p.area.areaAppliedOpportunities - c.area.areaAppliedOpportunities } } };
}

function aggregate(comparisons) {
  const out = {};
  for (const side of ['control', 'patched']) {
    const values = comparisons.map(c => c[side]);
    out[side] = { cases: values.length, won: values.filter(v => v.status === 'won').length, lost: values.filter(v => v.status === 'lost').length,
      aborted: values.filter(v => v.status === 'aborted').length, error: values.filter(v => v.status === 'error').length,
      hpAccountingErrors: values.filter(v => !v.healthAccounting.matches).length,
      areaPublicBattles: values.filter(v => v.area.areaPublicOpportunities > 0).length,
      areaAppliedBattles: values.filter(v => v.area.areaAppliedOpportunities > 0).length,
      windupPublicBattles: values.filter(v => v.area.windupPublicOpportunities > 0).length };
    for (const key of ['enemyDamage', 'blocked', 'healing', 'deaths', 'cardsPlayed']) out[side][key] = values.reduce((n, v) => n + v.metrics[key], 0);
    out[side].rounds = values.reduce((n, v) => n + v.rounds, 0);
  }
  return out;
}

function report(result) {
  const rows = ['# 정예 감시자 패턴의 동일 진입 상태 대조', '',
    `원본 후보 ${result.selection.candidateCount}건에서 ${result.comparisons.length}건을 사전 규칙으로 골랐다. 후보 구역: ${result.selection.candidateFloors.join(', ')}. 요청 구역 중 후보 없음: ${result.selection.absentFloors.join(', ') || '없음'}.`, '',
    result.selection.selection, '',
    '원본 명령을 이전 밸런스 Run API로 재생해 전투 진입 상태를 복원했다. 같은 전체 상태를 두 번 복제하고 패치 분기에서는 원정/전투 balanceVersion과 encounterTier 표식만 바꿨다. 덱·카드 수치·HP·적·도구·유물·비용·난수 상태·뽑기 순서는 같으며 후속 노드나 보상은 진행하지 않는다. 내부 상태는 동일성 검증용이고 정책은 기존 공개 정보 자동 판단을 그대로 사용한다.', '',
    '| 시드 | 구역 | 편성 | 정책 | 승패 전→후 | 턴 전→후 | 실제 HP 피해 전→후 | 광역 공개 턴 전→후 | 광역 적용 턴 전→후 | 쓰러짐 전→후 |',
    '|---:|---:|---|---|---|---|---|---|---|---|'];
  for (const c of result.comparisons) rows.push(`| ${c.source.seed} | ${c.source.floor} | ${c.source.party.join('/')} | ${c.source.policy} | ${c.control.status}→${c.patched.status} | ${c.control.rounds}→${c.patched.rounds} | ${c.control.metrics.enemyDamage}→${c.patched.metrics.enemyDamage} | ${c.control.area.areaPublicRounds.join(',') || '없음'}→${c.patched.area.areaPublicRounds.join(',') || '없음'} | ${c.control.area.areaAppliedRounds.join(',') || '없음'}→${c.patched.area.areaAppliedRounds.join(',') || '없음'} | ${c.control.metrics.deaths}→${c.patched.metrics.deaths} |`);
  rows.push('', '## 합계 관찰', '', '| 항목 | 이전 패턴 | 변경 패턴 |', '|---|---:|---:|');
  for (const [key, name] of [['cases','대조 사례'],['won','승리'],['lost','패배'],['aborted','중단'],['error','오류'],['areaPublicBattles','광역 의도 공개 전투'],['areaAppliedBattles','광역 실제 적용 전투'],['windupPublicBattles','광역 준비 공개 전투'],['enemyDamage','실제 HP 피해 합계'],['blocked','보호 흡수 합계'],['healing','전투 회복 합계'],['deaths','쓰러짐 합계'],['cardsPlayed','카드 사용 합계'],['rounds','라운드 합계'],['hpAccountingErrors','HP 검산 불일치']]) rows.push(`| ${name} | ${result.aggregate.control[key]} | ${result.aggregate.patched[key]} |`);
  rows.push('', '## 해석 범위', '',
    '- 같은 진입 상태의 대조로 패턴 표식의 효과를 비교한다. 이후 공개 의도와 전투 상태가 바뀌면 같은 자동 판단 규칙도 다른 카드·실행자·대상을 선택할 수 있다. 모든 후속 행동을 강제 고정한 실험은 아니다.',
    '- 광역 공개는 라운드·적별 의도 한 번, 실제 적용은 endRound의 해당 적 source인 아군 damage 이벤트로 확인한다. 보호에 모두 흡수된 공격도 포함한다. 피해 이벤트가 없는 완전 약화 등은 실제 적용으로 세지 않는다.',
    '- 원본 전투는 명령과 공개 종료 상태까지 재현 확인한다. 두 분기는 독립적인 원정 표본이 아니므로 기존 전체 원정 집계에 합산하지 않는다.',
    '- 최대 12건의 구역·편성 우선 사례이며 대표 승률·사람의 재미 검증이 아니다. 후보가 없는 구역으로 결과를 외삽하지 않는다.',
    '- 적 HP·공격력 및 광역 피해량은 변경하지 않는다. 선택된 정예 twins의 준비/실행 시점만 검증한다.',
    '- comparison.json에 검증 해시·행동 지표·카드별 사용과 차이를, runs.jsonl에 해당 전투만의 실제 이벤트를 보존한다.', '');
  return rows.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') { console.log('node prototype/party-expedition-balance-probe.cjs [--source runs.jsonl] [--source 추가runs.jsonl] [--out 신규폴더] [--count 1~12]\n이전 정예 twins 진입 상태를 그대로 복제해 패턴 시점만 대조합니다.'); return; }
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !['source','out','count'].includes(key) || !argv[i+1] || argv[i+1].startsWith('--')) throw Error('유효한 옵션과 값이 필요합니다: ' + argv[i]);
    const value = argv[++i];
    if (key === 'source') (flags.sources ||= []).push(value); else flags[key] = value;
  }
  const sources = (flags.sources || [path.join(__dirname, 'study-results', 'balance-patch-1-before', 'runs.jsonl')]).map(f => path.resolve(f));
  const out = path.resolve(flags.out || path.join(__dirname, 'study-results', 'balance-patch-1-probe'));
  const count = flags.count === undefined ? 12 : Number(flags.count);
  if (!Number.isInteger(count) || count < 1 || count > 12) throw Error('대조 건수는 1~12입니다.');
  if (fs.existsSync(out)) throw Error('기존 출력 폴더는 덮어쓰지 않습니다: ' + out);
  const selected = await selectCases(sources, count), records = [], comparisons = [];
  for (const candidate of selected.selected) {
    const pair = pairedCase(candidate); records.push(...pair.records); comparisons.push(pair.comparison);
    console.log(JSON.stringify({ seed: candidate.record.config.seed, floor: candidate.battle.floor, party: candidate.record.config.party,
      policy: candidate.record.config.policy, before: pair.comparison.control.status, after: pair.comparison.patched.status,
      damage: [pair.comparison.control.metrics.enemyDamage, pair.comparison.patched.metrics.enemyDamage],
      areaApplied: [pair.comparison.control.area.areaAppliedRounds, pair.comparison.patched.area.areaAppliedRounds] }));
  }
  const selection = Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'selected'));
  const result = { version: VERSION, createdAt: new Date().toISOString(), studyType: 'paired-balance-diagnostic',
    excludediagnostic: true, excludeFromCoverageTotals: true, selection, comparisons, aggregate: aggregate(comparisons) };
  const files = ['party-expedition-balance-probe.cjs','party-expedition-core.js','party-expedition-catalog.js','party-expedition-run.js','party-expedition-voyage.js','party-expedition-voyage-combat.js','party-expedition-auto.js','party-expedition-automation.js','party-expedition-telemetry.js'];
  const manifest = { version: VERSION, createdAt: result.createdAt, studyType: result.studyType, excludeFromCoverageTotals: true,
    sources: sources.map(source => ({ path: source, SHA256: hash(fs.readFileSync(source)) })), selection,
    sourceSHA256: Object.fromEntries(files.map(f => [f, hash(fs.readFileSync(path.join(__dirname, f)))])) };
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.mkdirSync(out);
  const write = (f, data) => fs.writeFileSync(path.join(out, f), data, { flag: 'wx' });
  write('manifest.json', JSON.stringify(manifest, null, 2)); write('comparison.json', JSON.stringify(result, null, 2));
  write('runs.jsonl', records.map(r => JSON.stringify(r)).join('\n') + '\n');
  write('battles.csv', Telemetry.battleCSV(records)); write('report.md', report(result));
  console.log(JSON.stringify({ out, ...result.aggregate }, null, 2));
  if (Object.values(result.aggregate).some(s => s.error || s.aborted || s.hpAccountingErrors)) process.exitCode = 1;
}

module.exports = { VERSION, selectCases, pairedCase, areaObservation, aggregate, report, main };
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
