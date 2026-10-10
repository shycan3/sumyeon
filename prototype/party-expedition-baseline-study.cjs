'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { Run } = require('./party-expedition-voyage.js');
const Auto = require('./party-expedition-auto.js');
const Telemetry = require('./party-expedition-telemetry.js');

const POLICY = 'fixed-choice-control';
const POLICY_VERSION = 'fixed-choice-control-1';
const PARTY_CYCLE = [
  ['navigator', 'sounder', 'salvager', 'lightkeeper'],
  ['navigator', 'diver', 'pilot', 'lightkeeper'],
  ['diver', 'pilot', 'sounder', 'salvager']
];
const copy = value => JSON.parse(JSON.stringify(value));
const terminal = run => ['won', 'lost'].includes(run.s.phase);
const decision = (method, args, reason) => {
  while (args.length && args.at(-1) === undefined) args.pop();
  return { method, args, reason };
};

// Reproduce only the unmodified, naturally played 24-run loop at the end of
// voyage-check.cjs. The earlier test fixtures which inject HP or state are never
// called here. This is a deterministic non-combat choice control, not a separate
// expert combat strategy, and it does not seek or enforce a losing outcome.
function select(seed, run) {
  const s = run.s;
  if (s.phase === 'blessing') return decision('chooseBlessing', [s.blessings[seed % 3]], '검사 대조 규칙: 시드 % 3 순번의 시작 유물을 선택합니다.');
  if (s.phase === 'map') return decision('choosePath', [seed % s.choices.length], '검사 대조 규칙: 시드 % 공개 경로 수 순번의 연결 경로를 선택합니다.');
  if (s.phase === 'battle') {
    const action = Auto.chooseVoyage(run.battle, run.s.toolPolicy);
    if (!action) throw Error('진행 중인 전투에 자동 행동이 없습니다.');
    if (action.type === 'discard') return decision('discardForSounder', [action.card], '공통 전투 자동 정책으로 측심사의 버릴 카드를 선택합니다.');
    if (action.type === 'end') return decision('endRound', [], '공통 전투 자동 정책이 라운드 종료를 선택합니다.');
    if (action.type === 'tool') return decision('useTool', [action.slot, action.target], '공통 전투 자동 정책이 현재 치명적인 예고에 도구로 대응합니다.');
    if (action.type === 'play') return decision('play', [action.card, action.actor, action.target, action.choice], '공통 전투 자동 정책으로 현재 공개 손패와 적 의도를 평가합니다.');
    throw Error('알 수 없는 전투 자동 행동: ' + action.type);
  }
  if (s.phase === 'reward') return decision('chooseReward', [s.offers[seed % 3]], '검사 대조 규칙: 시드 % 3 순번의 카드 보상을 선택합니다.');
  if (s.phase === 'relicreward') return decision('chooseRelic', [s.relicChoices[0]], '검사 대조 규칙: 첫 번째 유물 후보를 선택합니다.');
  if (s.phase === 'patron') return decision('choosePact', [seed % 3 === 1 && s.gold < 10 ? null : seed % 3], '검사 대조 규칙: 시드 % 3 계약을 선택하되 금화 계약의 재화가 부족하면 거절합니다.');
  if (s.phase !== 'interlude') throw Error('검사 대조 정책에 등록되지 않은 단계: ' + s.phase);
  const i = s.interlude;
  if (i.type === 'camp') return decision('chooseInterlude', ['heal'], '검사 대조 규칙: 정박지에서는 항상 회복합니다.');
  if (i.type === 'seal') return decision('chooseInterlude', ['upgrade', s.deck.find(c => !c.upgraded).id], '검사 대조 규칙: 인장에서는 첫 번째 미강화 카드 사본을 강화합니다.');
  if (i.type === 'event' && ['shelter', 'beacon'].includes(i.event)) return decision('chooseInterlude', ['heal'], '검사 대조 규칙: 정박실·등대 사건에서는 회복합니다.');
  if (i.type === 'event' && ['wreck', 'pressure'].includes(i.event)) return decision('chooseInterlude', ['event-gold'], '검사 대조 규칙: 보급선·불안정 항로 사건에서는 기록 조각을 선택합니다.');
  if (i.type === 'event' && i.event === 'cache' && i.relics.length) return decision('chooseInterlude', ['event-relic', i.relics[0]], '검사 대조 규칙: 유실물 사건에서는 첫 유물을 선택합니다.');
  return decision('chooseInterlude', ['continue'], '검사 대조 규칙: 그 외 상점·사건에서는 구매·추가 변경 없이 출발합니다.');
}

function runBaseline(seed, options = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('유효한 원정 시드가 필요합니다.');
  const limits = { maxSteps: 1500, maxRounds: 60, maxPhaseDecisions: 1000, maxBattleActions: 180, ...options };
  for (const key of ['maxSteps', 'maxRounds', 'maxPhaseDecisions', 'maxBattleActions']) {
    if (!Number.isInteger(limits[key]) || limits[key] < 1) throw Error('유효한 실행 상한이 필요합니다: ' + key);
  }
  const config = { seed, party: copy(PARTY_CYCLE[seed % 3]), difficulty: 'normal', breakMode: 'off', policy: POLICY,
    policyVersion: POLICY_VERSION, reference: 'party-expedition-voyage-check.cjs: final 24-run loop',
    ...Object.fromEntries(['maxSteps', 'maxRounds', 'maxPhaseDecisions', 'maxBattleActions'].map(key => [key, limits[key]])) };
  let run = new Run(config), steps = 0, phaseDecisions = 0;
  // Start recording the pristine constructor state, before the blessing or any
  // policy setting. Every gameplay mutation below is an actual Run API call.
  const recorder = Telemetry.createRecorder(config, run.snapshot());
  function finish(status, reason = null) { return recorder.finish(status, run.snapshot(), reason); }
  function execute(chosen) {
    const before = run.snapshot(), oldBattle = run.battle;
    const result = run[chosen.method](...chosen.args), after = run.snapshot();
    const events = before.phase === 'battle' && Array.isArray(result) ? copy(result)
      : run.battle && run.battle !== oldBattle ? copy(run.battle.s.events || []) : [];
    if (JSON.stringify(before) === JSON.stringify(after)) throw Error('대조 행동이 상태를 변경하지 않았습니다: ' + chosen.method);
    recorder.observe({ decision: chosen, before, after, events });
    steps++;
  }
  function stopped() {
    if (steps >= config.maxSteps) return '전체 실행 행동 상한으로 중단';
    if (run.s.phase === 'battle' && run.battle.s.round > config.maxRounds) return '전투 라운드 상한으로 중단';
    if (options.shouldStop?.()) return '사용자 중단';
    return null;
  }
  try {
    execute(select(seed, run));
    let reason = stopped();
    if (reason) return finish('aborted', reason);
    // Same ordering as the reference loop: blessing, then emergency tool policy.
    // The otherwise invisible policy setting is also retained as a decision.
    execute(decision('setToolPolicy', ['emergency'], '검사 대조 규칙: 전투 도구를 현재 치명적인 예고에만 자동 사용합니다.'));
    while (!terminal(run)) {
      reason = stopped();
      if (reason) return finish('aborted', reason);
      if (phaseDecisions >= config.maxPhaseDecisions) return finish('aborted', '원정 단계 판단 상한으로 중단');
      phaseDecisions++;
      if (run.s.phase === 'battle') {
        let battleActions = 0;
        while (run.s.phase === 'battle' && battleActions < config.maxBattleActions) {
          reason = stopped();
          if (reason) return finish('aborted', reason);
          execute(select(seed, run));
          battleActions++;
        }
        if (run.s.phase === 'battle') return finish('aborted', '전투 행동 상한으로 중단');
      } else execute(select(seed, run));
      // The reference checks each completed phase round trip. Restoration never
      // consumes RNG or rerolls a candidate and must preserve the entire state.
      const saved = run.snapshot();
      run = Run.restore(saved);
      assert.deepEqual(run.snapshot(), saved);
    }
    return finish(run.s.phase);
  } catch (error) { return finish('error', error.message); }
}

const num = value => value == null ? '—' : value.toFixed(2);
const safe = value => String(value).replace(/\|/g, '/');
function report(records, summary, verification) {
  const lines = ['# 후보 순번 대조 원정 관찰', '',
    `정책: \`${POLICY}\` / \`${POLICY_VERSION}\`. 기존 검사 파일 말미의 시드 1~24 원정을 실제 게임 API로 재현했다.`, '',
    `원정 ${summary.runs.total}회: 승리 ${summary.runs.won}, 패배 ${summary.runs.lost}, 중단 ${summary.runs.aborted}, 오류 ${summary.runs.error}.`,
    `전투 ${summary.battles.total}회: 승리 ${summary.battles.won}, 패배 ${summary.battles.lost}, 중단 ${summary.battles.aborted}, 오류 ${summary.battles.error}.`,
    `자연 패배 시드: ${records.filter(r => r.status === 'lost').map(r => r.config.seed).join(', ') || '없음'}.`,
    `기준 결과(22승, 시드 2·12 패배) 재현: ${verification.matches ? '일치' : '불일치 또는 미완료'}.`, '',
    '## 정책의 의미', '',
    '시작 유물·카드 보상·경로·계약은 시드로 정한 후보 순번을 선택한다. 정박지에서는 항상 회복하고, 상점에서는 구매하지 않는다. 전투에서는 제품과 같은 Auto.chooseVoyage 전투 판단을 사용하고 도구는 emergency 규칙만 적용한다. 보상·경로 휴리스틱에 대한 단순 대조 조건이며, 제품의 세 정책과 다른 숙련 전투 전략으로 해석하지 않는다.', '',
    '시드만 같아도 서로 다른 경로와 보상 선택에 따른 난수 소비로 이후 전투·손패·진입 HP가 달라진다. 승패 차이는 여러 원정 운영 선택의 묶음과 연관되며, 특정 카드·유물·회복의 인과적 효과를 분리한 결과가 아니다. 실패를 만들기 위한 HP 주입·수치 변경·새 난이도를 사용하지 않았다.', '',
    '## 자연 패배 전투', '', '| 시드 | 편성 | 구역·전투 | 진입 HP | 종료 HP | 실제 적 HP 피해 | 보호 흡수 | 전투 회복 | 턴 |', '|---:|---|---|---:|---:|---:|---:|---:|---:|',
    ...records.flatMap(r => r.battles.filter(b => b.status === 'lost').map(b => `| ${r.config.seed} | ${b.party.join('/')} | ${b.floor} · ${safe(b.name)} | ${b.healthAccounting.entryHP} | ${b.healthAccounting.exitHP} | ${b.metrics.enemyDamage} | ${b.metrics.blocked} | ${b.metrics.healing} | ${b.rounds} |`)), '',
    '## 구역·편성별 완료 전투', '', '| 구역·전투 | 편성 | 완료 표본 | 승/패 | 평균 실제 HP 피해 | 보호 흡수 | 평균 턴 | 승리/패배 평균 피해 |', '|---|---|---:|---:|---:|---:|---:|---:|',
    ...summary.encounters.map(g => `| ${g.floor} · ${safe(g.name)} | ${g.party.join('/')} | ${g.n} | ${g.won}/${g.lost} | ${num(g.meanDamage)} | ${num(g.meanBlocked)} | ${num(g.meanRounds)} | ${num(g.outcomes.won.meanDamage)} / ${num(g.outcomes.lost.meanDamage)} |`), '',
    '## 조사 신호', '', ...summary.signals.map(s => '- ' + s), '',
    '## 해석 범위', '', ...summary.limitations.map(s => '- ' + s), '',
    'runs.jsonl에는 시작 선택·공개 후보·전투 손패·실행자·대상·실제 이벤트·HP 회계가 있다. battles.csv에는 전투별 승패와 피해가 있다. manifest.json에는 원정 설정·대조 정책의 별명·기준 검사 파일과 엔진 소스 해시를 보존한다. 중단·오류는 패배와 별도로 수집한다.', ''];
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') { console.log('node prototype/party-expedition-baseline-study.cjs [--out 신규결과폴더] [--max-steps 1500] [--max-rounds 60]\n시드 1~24 · normal · break off · 후보 순번 대조 정책. 기존 출력 폴더는 덮어쓰지 않습니다.'); return; }
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !['out', 'max-steps', 'max-rounds'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('유효한 옵션과 값이 필요합니다: ' + argv[i]);
    flags[key] = argv[++i];
  }
  const limits = { maxSteps: Number(flags['max-steps'] ?? 1500), maxRounds: Number(flags['max-rounds'] ?? 60) };
  if (!Object.values(limits).every(n => Number.isInteger(n) && n > 0)) throw Error('유효한 실행 상한이 필요합니다.');
  const out = path.resolve(flags.out || path.join(__dirname, 'study-results', 'baseline-24'));
  if (fs.existsSync(out)) throw Error('기존 출력 폴더는 덮어쓰지 않습니다: ' + out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(out);
  const write = (file, value) => fs.writeFileSync(path.join(out, file), value, { flag: 'wx' });
  const sources = ['party-expedition-baseline-study.cjs', 'party-expedition-voyage-check.cjs', 'party-expedition-core.js', 'party-expedition-catalog.js', 'party-expedition-run.js', 'party-expedition-voyage.js', 'party-expedition-voyage-combat.js', 'party-expedition-auto.js', 'party-expedition-telemetry.js'];
  const manifest = { createdAt: new Date().toISOString(), config: { seedStart: 1, seedCount: 24, difficulty: 'normal', breakMode: 'off', partyRule: 'PARTY_CYCLE[seed % 3]', partyCycle: copy(PARTY_CYCLE), ...limits, maxPhaseDecisions: 1000, maxBattleActions: 180 },
    policy: { id: POLICY, version: POLICY_VERSION, alias: '후보 순번 대조 정책', reference: 'party-expedition-voyage-check.cjs: final 24-run loop', combat: 'Auto.chooseVoyage(emergency)', independentExpertCombatStrategy: false },
    versions: { telemetry: Telemetry.VERSION, baselinePolicy: POLICY_VERSION },
    sourceSHA256: Object.fromEntries(sources.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex')])) };
  write('manifest.json', JSON.stringify(manifest, null, 2));
  write('runs.jsonl', '');
  const records = [];
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.on('SIGINT', interrupt);
  try {
    console.log(`후보 순번 대조 원정 24회 시작 · 로그 ${out}`);
    for (let seed = 1; seed <= 24 && !interrupted; seed++) {
      const record = runBaseline(seed, { ...limits, shouldStop: () => interrupted });
      records.push(record);
      fs.appendFileSync(path.join(out, 'runs.jsonl'), JSON.stringify(record) + '\n');
      console.log(`${records.length}/24 · seed ${seed} · ${record.status} · ${record.battles.length}전투`);
      await new Promise(resolve => setImmediate(resolve));
    }
  } finally { process.removeListener('SIGINT', interrupt); }
  const summary = Telemetry.summarize(records);
  const losses = records.filter(r => r.status === 'lost').map(r => r.config.seed);
  const verification = { expected: { total: 24, won: 22, lost: 2, aborted: 0, error: 0, lossSeeds: [2, 12] },
    observed: { ...summary.runs, lossSeeds: losses }, matches: records.length === 24 && summary.runs.won === 22 && summary.runs.lost === 2 && !summary.runs.aborted && !summary.runs.error && JSON.stringify(losses) === '[2,12]' };
  write('summary.json', JSON.stringify({ ...summary, baselineVerification: verification }, null, 2));
  write('battles.csv', Telemetry.battleCSV(records));
  write('report.md', report(records, summary, verification));
  const hpAccountingErrors = records.flatMap(r => r.battles).filter(b => !b.healthAccounting.matches).length;
  console.log(JSON.stringify({ runs: summary.runs, battles: summary.battles, verification, hpAccountingErrors, out }, null, 2));
  if (summary.runs.error || hpAccountingErrors || (!interrupted && !verification.matches)) process.exitCode = 1;
}

module.exports = { runBaseline, POLICY, POLICY_VERSION, PARTY_CYCLE };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
