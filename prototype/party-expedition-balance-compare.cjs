'use strict';
// Offline saved-log comparison. It never runs a policy or loads current balance effects.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { verifyHealth, intentObservations } = require('./party-expedition-study-analysis.cjs');
const VERSION = 'expedition-balance-compare-1';
const COMPLETE = new Set(['won', 'lost']);
const canonical = value => JSON.stringify(value === undefined ? null : value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))]))
  : Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : value);
const hash = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const sumHP = units => (units || []).reduce((n, a) => n + (a.hp || 0), 0);
const counts = () => ({ total: 0, won: 0, lost: 0, aborted: 0, error: 0, other: 0 });
function count(statuses, status) { statuses.total++; statuses[Object.hasOwn(statuses, status) ? status : 'other']++; }
const blankMetrics = () => ({ completedBattles: 0, enemyDamage: 0, blocked: 0, healing: 0, selfDamage: 0, downed: 0, rounds: 0, tools: 0 });
const deckShape = deck => (deck || []).map(c => ({ kind: c.kind, upgraded: !!c.upgraded, enchant: c.enchant || null })).sort((a, b) => canonical(a).localeCompare(canonical(b)));
function identity(record) {
  const c = record.config || {};
  return canonical({ seed: c.seed, party: c.party || record.initial?.party || [], policy: c.policy,
    difficulty: c.difficulty, breakMode: c.breakMode, maxSteps: c.maxSteps, maxRounds: c.maxRounds });
}
function battleMetrics(b) {
  // Downed and HP are independently recomputed from saved real events.
  const h = verifyHealth(b), allyIds = new Set((b.entry?.allies || []).map(a => a.id));
  const downed = (b.actions || []).flatMap(a => a.events || []).filter(e => e.type === 'downed' && allyIds.has(e.target)).length;
  return { completedBattles: 1, enemyDamage: h.enemyDamage ?? b.metrics?.enemyDamage ?? 0,
    blocked: b.metrics?.blocked || 0, healing: h.healing ?? b.metrics?.healing ?? 0,
    selfDamage: h.selfDamage ?? b.metrics?.selfDamage ?? 0, downed, rounds: b.rounds || 0, tools: b.metrics?.toolsUsed || 0 };
}
function addMetrics(target, metrics) { for (const key of Object.keys(target)) target[key] += metrics[key] || 0; }
function means(m) { return { ...m, meanDamage: m.completedBattles ? m.enemyDamage / m.completedBattles : null,
  meanBlocked: m.completedBattles ? m.blocked / m.completedBattles : null,
  meanRounds: m.completedBattles ? m.rounds / m.completedBattles : null,
  meanDowned: m.completedBattles ? m.downed / m.completedBattles : null }; }
function battleEntryFingerprint(b) { return hash({ allies: b.entry?.allies, enemies: b.entry?.enemies, energy: b.entry?.energy,
  hand: b.entry?.hand, intents: b.entry?.intents, deck: b.deck, relics: b.relics, tools: b.tools, rule: b.rule }); }
function compactRecord(record, source) {
  const growth = (record.decisions || []).filter(d => d.phase !== 'battle' && d.phase !== 'map').map(d => ({ phase: d.phase, floor: d.floor, method: d.method, args: d.args }));
  const route = (record.decisions || []).filter(d => d.phase === 'map').map(d => ({ floor: d.floor, method: d.method, args: d.args }));
  const battles = (record.battles || []).map(b => ({ id: b.id, floor: b.floor, node: b.nodeId, tier: b.tier,
    encounter: b.encounter, name: b.name, status: b.status, metrics: battleMetrics(b), health: verifyHealth(b),
    entryFingerprint: battleEntryFingerprint(b), entryHP: sumHP(b.entry?.allies), exitHP: sumHP(b.exit?.allies),
    deckHash: hash(deckShape(b.deck)), intentObservations: intentObservations(b, record.config?.breakMode),
    patterns: [...new Set((b.enemies || b.entry?.enemies || []).map(e => e.pattern))] }));
  const metrics = blankMetrics(); for (const b of battles) if (COMPLETE.has(b.status)) addMetrics(metrics, b.metrics);
  return { key: identity(record), config: record.config, source, contentVersion: record.contentVersion, balanceVersion: record.config?.balanceVersion ?? 0,
    status: record.status, reason: record.reason, finalHP: sumHP(record.final?.allies),
    initialFingerprint: hash({ party: record.initial?.party, allies: record.initial?.allies, deck: record.initial?.deck, gold: record.initial?.gold }),
    routeHash: hash(route), route, growthHash: hash(growth), finalDeckHash: hash(deckShape(record.final?.deck)),
    metrics, battles };
}
function sideSummary(side) {
  const runs = counts(), battles = counts(), healthAccounting = { matches: 0, mismatch: 0, missing: 0 }, metrics = blankMetrics();
  const encounters = new Map(), patterns = new Map(), balanceVersions = {};
  for (const r of side.records.values()) {
    count(runs, r.status); addMetrics(metrics, r.metrics);balanceVersions[r.balanceVersion]=(balanceVersions[r.balanceVersion]||0)+1;
    for (const b of r.battles) {
      count(battles, b.status); healthAccounting[b.health.status]++;
      const key = canonical({ floor: b.floor, encounter: b.encounter, tier: b.tier });
      if (!encounters.has(key)) encounters.set(key, { key, floor: b.floor, encounter: b.encounter, tier: b.tier, name: b.name, statuses: counts(), metrics: blankMetrics() });
      const eg = encounters.get(key); count(eg.statuses, b.status); if (COMPLETE.has(b.status)) addMetrics(eg.metrics, b.metrics);
      for (const pattern of b.patterns) {
        const pk = canonical({ floor: b.floor, pattern, tier: b.tier });
        if (!patterns.has(pk)) patterns.set(pk, { key: pk, floor: b.floor, pattern, tier: b.tier, completedBattles: 0, incompleteBattles: 0,
          battlesWithPreparePublished: 0, battlesWithPrepareResolved: 0,
          battlesWithAreaPublished: 0, battlesWithAreaApplications: 0, observations: {}, preparedFollowups: {} });
        const pg = patterns.get(pk); if (!COMPLETE.has(b.status)) { pg.incompleteBattles++; continue; }
        pg.completedBattles++; const obs = b.intentObservations.filter(o => o.pattern === pattern);
        if (obs.some(o => o.type === 'prepare')) pg.battlesWithPreparePublished++;
        if (obs.some(o => o.type === 'prepare' && o.observation === 'prepareResolved')) pg.battlesWithPrepareResolved++;
        if (obs.some(o => o.type === 'area')) pg.battlesWithAreaPublished++;
        if (obs.some(o => o.type === 'area' && o.observation === 'damageApplicationsObserved')) pg.battlesWithAreaApplications++;
        for (const o of obs) { const ik = `${o.type}:${o.observation}`; pg.observations[ik] = (pg.observations[ik] || 0) + 1;
          if (o.followup) pg.preparedFollowups[o.followup] = (pg.preparedFollowups[o.followup] || 0) + 1; }
      }
    }
  }
  return { inputs: side.inputs, sources: side.sources, skippedDuplicates: side.skippedDuplicates,
    excludedDiagnosticRecords: side.excludedDiagnosticRecords, balanceVersions, runs, battles, healthAccounting, metrics: means(metrics),
    encounters: [...encounters.values()].map(g => ({ ...g, metrics: means(g.metrics) })).sort((a, b) => a.floor - b.floor || a.encounter.localeCompare(b.encounter)),
    patterns: [...patterns.values()].sort((a, b) => a.floor - b.floor || a.pattern.localeCompare(b.pattern)) };
}
async function readSide(inputs) {
  const side = { inputs: [], sources: [], records: new Map(), skippedDuplicates: 0, excludedDiagnosticRecords: 0 };
  for (const input of inputs) {
    const absolute = path.resolve(input), isDir = fs.statSync(absolute).isDirectory(), file = isDir ? path.join(absolute, 'runs.jsonl') : absolute;
    const manifestFile = path.join(isDir ? absolute : path.dirname(file), 'manifest.json');
    const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, '')) : null;
    const source = side.sources.length; side.inputs.push(file); side.sources.push({ input: file, manifest: manifestFile,
      sourceSHA256: manifest?.sourceSHA256 || null, sourceHash: manifest?.sourceSHA256 ? hash(manifest.sourceSHA256) : null,
      createdAt: manifest?.createdAt || null, config: manifest?.config || null, versions: manifest?.versions || null });
    const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    let number = 0;
    for await (const raw of lines) {
      number++; const line = raw.replace(/^\uFEFF/, '').trim(); if (!line) continue;
      let r; try { r = JSON.parse(line); if (!r.config || !Array.isArray(r.battles)) throw Error('원정 로그 구조 오류'); }
      catch (e) { throw Error(`${file}:${number}: ${e.message}`); }
      if (r.config.excludeFromCoverageTotals || r.config.studyType === 'paired-failure-diagnostic' || r.studyType === 'paired-failure-diagnostic') { side.excludedDiagnosticRecords++; continue; }
      const compact = compactRecord(r, source), previous = side.records.get(compact.key);
      if (previous) {
        const previousSource = side.sources[previous.source];
        if (previousSource.sourceHash !== side.sources[source].sourceHash) throw Error('한쪽 입력에 같은 조건의 다른 소스 버전이 중복됩니다. 버전별 --before/--after 입력을 분리하세요.');
        if (previous.status !== compact.status || previous.routeHash !== compact.routeHash || previous.finalDeckHash !== compact.finalDeckHash || canonical(previous.metrics) !== canonical(compact.metrics)) throw Error('같은 조건·소스의 서로 다른 결과가 중복됩니다.');
        side.skippedDuplicates++; continue;
      }
      side.records.set(compact.key, compact);
    }
  }
  return side;
}
function compareSides(before, after) {
  const pairs = [], unmatchedBefore = [], unmatchedAfter = [...after.records.keys()].filter(k => !before.records.has(k));
  const transitions = {}, completedPairMetrics = { before: blankMetrics(), after: blankMetrics() };
  const paired = { total: 0, completed: 0, incomplete: 0, unchangedRoute: 0, unchangedGrowthDecisions: 0, unchangedFinalDeck: 0,
    unchangedInitialState: 0, changedPolicyVersion: 0, matchedEncounters: 0, exactSamePublicBattleEntry: 0, unmatchedBattlesBefore: 0, unmatchedBattlesAfter: 0 };
  for (const [key, b] of before.records) {
    const a = after.records.get(key); if (!a) { unmatchedBefore.push(key); continue; }
    paired.total++; const completed = COMPLETE.has(b.status) && COMPLETE.has(a.status);
    paired[completed ? 'completed' : 'incomplete']++;
    if (completed) { addMetrics(completedPairMetrics.before, b.metrics); addMetrics(completedPairMetrics.after, a.metrics); }
    const statusKey = `${b.status}->${a.status}`; transitions[statusKey] = (transitions[statusKey] || 0) + 1;
    const sameRoute = b.routeHash === a.routeHash, sameGrowth = b.growthHash === a.growthHash, sameDeck = b.finalDeckHash === a.finalDeckHash;
    if (sameRoute) paired.unchangedRoute++; if (sameGrowth) paired.unchangedGrowthDecisions++; if (sameDeck) paired.unchangedFinalDeck++;
    if (b.initialFingerprint === a.initialFingerprint) paired.unchangedInitialState++;
    if (b.config.policyVersion !== a.config.policyVersion) paired.changedPolicyVersion++;
    const aBattles = new Map(a.battles.map(x => [canonical({ floor: x.floor, node: x.node, encounter: x.encounter }), x]));
    const battlePairs = [];
    for (const bb of b.battles) {
      const bk = canonical({ floor: bb.floor, node: bb.node, encounter: bb.encounter }), ab = aBattles.get(bk);
      if (!ab) { paired.unmatchedBattlesBefore++; continue; }
      aBattles.delete(bk); paired.matchedEncounters++; const exactEntry = bb.entryFingerprint === ab.entryFingerprint;
      if (exactEntry) paired.exactSamePublicBattleEntry++;
      battlePairs.push({ floor: bb.floor, node: bb.node, encounter: bb.encounter, exactSamePublicEntry: exactEntry,
        sameEntryDeck: bb.deckHash === ab.deckHash, before: { status: bb.status, entryHP: bb.entryHP, exitHP: bb.exitHP, ...bb.metrics },
        after: { status: ab.status, entryHP: ab.entryHP, exitHP: ab.exitHP, ...ab.metrics } });
    }
    paired.unmatchedBattlesAfter += aBattles.size;
    pairs.push({ config: b.config, beforeContentVersion: b.contentVersion, afterContentVersion: a.contentVersion,
      beforeBalanceVersion: b.balanceVersion, afterBalanceVersion: a.balanceVersion,
      beforeSource: b.source, afterSource: a.source, statusBefore: b.status, statusAfter: a.status, completed,
      sameRoute, sameGrowthDecisions: sameGrowth, sameFinalDeck: sameDeck, beforeFinalHP: b.finalHP, afterFinalHP: a.finalHP,
      metricsBefore: b.metrics, metricsAfter: a.metrics, routeBefore: b.route, routeAfter: a.route, battles: battlePairs });
  }
  const bSummary = sideSummary(before), aSummary = sideSummary(after);
  const changedSources = [];
  for (const bs of before.sources) for (const as of after.sources) {
    if (!bs.sourceSHA256 || !as.sourceSHA256) continue;
    changedSources.push({ before: bs.input, after: as.input, files: [...new Set([...Object.keys(bs.sourceSHA256), ...Object.keys(as.sourceSHA256)])].filter(k => bs.sourceSHA256[k] !== as.sourceSHA256[k]) });
  }
  return { version: VERSION, createdAt: new Date().toISOString(), before: bSummary, after: aSummary, paired, transitions,
    completedPairMetrics: { before: means(completedPairMetrics.before), after: means(completedPairMetrics.after) },
    unmatchedBefore, unmatchedAfter, changedSources, pairs,
    limitations: ['전후 비교는 같은 시드·순서가 있는 편성·정책·난이도·브레이크·실행 상한으로 시작한 원정끼리 짝지었습니다. 소스와 콘텐츠 버전은 패치에 따라 달라도 허용합니다.',
      '경로·보상·덱·전투 판단의 변화로 이후 난수 소비와 전투 진입 상태가 달라질 수 있습니다. 같은 원정 시작 조건 비교이며, 동일 전투 진입에서 단일 수치만 바꾼 인과 실험이 아닙니다.',
      '구역·적 패턴별 평균은 각 버전에서 완료된 전투의 표본입니다. 후반 표본에는 도달 편향이 있으며 정예 경로 선택도 달라질 수 있습니다.',
      '중단·오류는 패배로 계산하지 않습니다. 완료된 전후 원정 짝의 지표도 별도로 제공하며, 표본이 작은 승률을 전체 난이도 판정으로 일반화하지 않습니다.',
      '패턴 적용은 저장된 실제 이벤트로 확인합니다. 공개된 예고, 준비 행동, 피해 적용은 구분하고 피해량 0이거나 전투가 먼저 끝난 경우를 실행으로 추정하지 않습니다.',
      '자동 정책은 사람이 느끼는 재미와 선택의 질을 대변하지 않습니다. 카드 사용·승패의 연관만으로 특정 카드의 인과적 성능을 판단하지 않습니다.'] };
}
const num = n => n === null || n === undefined ? '—' : typeof n === 'number' ? n.toFixed(2) : String(n);
const safe = s => String(s).replace(/\|/g, '/');
function markdown(r) {
  const metrics = [['승리 원정', r.before.runs.won, r.after.runs.won], ['패배 원정', r.before.runs.lost, r.after.runs.lost], ['중단 원정', r.before.runs.aborted, r.after.runs.aborted], ['오류 원정', r.before.runs.error, r.after.runs.error],
    ['실제 HP 피해 / 완료 전투', r.before.metrics.meanDamage, r.after.metrics.meanDamage], ['보호 흡수 / 완료 전투', r.before.metrics.meanBlocked, r.after.metrics.meanBlocked], ['턴 / 완료 전투', r.before.metrics.meanRounds, r.after.metrics.meanRounds],
    ['전투불능 이벤트', r.before.metrics.downed, r.after.metrics.downed], ['HP 검산 불일치', r.before.healthAccounting.mismatch, r.after.healthAccounting.mismatch]];
  const keys = [...new Set([...r.before.encounters.map(x => x.key), ...r.after.encounters.map(x => x.key)])];
  const encounters = keys.map(key => ({ b: r.before.encounters.find(x => x.key === key), a: r.after.encounters.find(x => x.key === key) })).sort((x, y) => (x.b || x.a).floor - (y.b || y.a).floor);
  const patternKeys = [...new Set([...r.before.patterns.map(x => x.key), ...r.after.patterns.map(x => x.key)])];
  const patterns = patternKeys.map(key => ({ b: r.before.patterns.find(x => x.key === key), a: r.after.patterns.find(x => x.key === key) }));
  return ['# 밸런스 패치 전후 자동 관찰', '', `전후 원정 ${r.before.runs.total}/${r.after.runs.total}회, 조건이 일치하는 짝 ${r.paired.total}회. 완료된 짝 ${r.paired.completed}, 중단·오류 등이 포함된 짝 ${r.paired.incomplete}.`,
    `매칭되지 않은 전후 원정 ${r.unmatchedBefore.length}/${r.unmatchedAfter.length}회. 진단용 기록 제외 ${r.before.excludedDiagnosticRecords}/${r.after.excludedDiagnosticRecords}회.`, '',
    '| 지표 | 수정 전 | 수정 후 |', '|---|---:|---:|', ...metrics.map(([label,b,a]) => `| ${label} | ${num(b)} | ${num(a)} |`), '',
    '## 비교 조건', '', `같은 경로 ${r.paired.unchangedRoute}/${r.paired.total}, 같은 성장 선택 ${r.paired.unchangedGrowthDecisions}/${r.paired.total}, 같은 최종 덱 ${r.paired.unchangedFinalDeck}/${r.paired.total}.`,
    `같은 초기 파티·HP·덱·골드 ${r.paired.unchangedInitialState}/${r.paired.total}. 정책 버전이 바뀐 짝 ${r.paired.changedPolicyVersion}.`,
    `같은 구역·노드·적 패턴 전투 ${r.paired.matchedEncounters}회 중 공개 진입 상태가 완전히 같은 전투 ${r.paired.exactSamePublicBattleEntry}회. 매칭되지 않은 전후 전투 ${r.paired.unmatchedBattlesBefore}/${r.paired.unmatchedBattlesAfter}회.`,
    '밸런스 버전 전후: '+canonical(r.before.balanceVersions)+' / '+canonical(r.after.balanceVersions)+' (기록이 없으면 기존 버전 0으로 표시).',
    '공개 진입 상태에는 손패·적 수치·의도·아군·에너지·덱·유물·도구가 포함됩니다. 난수 내부 상태와 뽑기 순서는 로그에 없으므로 같은 공개 상태도 완전 동일 상태를 보장하지 않습니다.', '',
    '승패 전환: '+Object.entries(r.transitions).map(([k,n]) => `${k} ${n}회`).join(', '), '',
    '변경된 소스: '+r.changedSources.map(x => x.files.join(', ') || '없음').join(' / '), '',
    '## 구역·전투별 완료 표본', '', '| 구역·전투 | 전후 완료 표본 | 전후 패배 | 전후 평균 HP 피해 | 전후 평균 보호 흡수 | 전후 평균 턴 | 전후 전투불능 |', '|---|---:|---:|---:|---:|---:|---:|',
    ...encounters.map(({b,a}) => { const x=b||a; return `| ${x.floor} · ${safe(x.name)} (${safe(x.encounter)}) | ${b?.metrics.completedBattles||0}/${a?.metrics.completedBattles||0} | ${b?.statuses.lost||0}/${a?.statuses.lost||0} | ${num(b?.metrics.meanDamage)}/${num(a?.metrics.meanDamage)} | ${num(b?.metrics.meanBlocked)}/${num(a?.metrics.meanBlocked)} | ${num(b?.metrics.meanRounds)}/${num(a?.metrics.meanRounds)} | ${b?.metrics.downed||0}/${a?.metrics.downed||0} |`; }), '',
    '## 적 패턴 관찰', '', '| 구역·적 패턴 | 전후 완료 전투 | 준비 예고를 본 전투 | 준비 실행을 관찰한 전투 | 광역 예고를 본 전투 | 광역 피해 적용을 관찰한 전투 |', '|---|---:|---:|---:|---:|---:|',
    ...patterns.map(({b,a}) => { const x=b||a; return `| ${x.floor} · ${x.pattern} | ${b?.completedBattles||0}/${a?.completedBattles||0} | ${b?.battlesWithPreparePublished||0}/${a?.battlesWithPreparePublished||0} | ${b?.battlesWithPrepareResolved||0}/${a?.battlesWithPrepareResolved||0} | ${b?.battlesWithAreaPublished||0}/${a?.battlesWithAreaPublished||0} | ${b?.battlesWithAreaApplications||0}/${a?.battlesWithAreaApplications||0} |`; }), '',
    '## 해석 범위', '', ...r.limitations.map(x => '- '+x), '', '전체 SHA-256과 짝별 경로·전투 지표는 comparison.json, 간단한 원정별 전후 수치는 pairs.csv에 있습니다.', ''].join('\n');
}
function pairCSV(r) {
  const rows = [['seed','party','policy','difficulty','breakMode','beforeBalanceVersion','afterBalanceVersion','beforeStatus','afterStatus','sameRoute','sameGrowthDecisions','sameFinalDeck','beforeFinalHP','afterFinalHP','beforeBattles','afterBattles','beforeDamage','afterDamage','beforeDowned','afterDowned','beforeRounds','afterRounds']];
  for (const p of r.pairs) rows.push([p.config.seed, p.config.party.join('+'), p.config.policy, p.config.difficulty, p.config.breakMode, p.beforeBalanceVersion, p.afterBalanceVersion, p.statusBefore, p.statusAfter, p.sameRoute, p.sameGrowthDecisions, p.sameFinalDeck,
    p.beforeFinalHP,p.afterFinalHP,p.metricsBefore.completedBattles,p.metricsAfter.completedBattles,p.metricsBefore.enemyDamage,p.metricsAfter.enemyDamage,p.metricsBefore.downed,p.metricsAfter.downed,p.metricsBefore.rounds,p.metricsAfter.rounds]);
  return '\uFEFF'+rows.map(row => row.map(v => '"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
function selfTest() {
  const assert = require('node:assert/strict');
  const fixture = (seed,status='won') => ({config:{seed,party:['a','b','c','d'],policy:'balanced',difficulty:'normal',breakMode:'off',maxSteps:1500,maxRounds:60,policyVersion:'test1'},contentVersion:'test',status,
    initial:{party:['a','b','c','d'],allies:[{id:'a',hp:10}],deck:[{kind:'hit'}],gold:1}, final:{allies:[{id:'a',hp:6}],deck:[{kind:'hit'}]},decisions:[{phase:'map',floor:1,method:'chooseNode',args:['x']}],
    battles:[{id:1,floor:1,nodeId:'x',tier:'battle',encounter:'hunter',name:'fixture',status,rounds:2,deck:[{kind:'hit'}],enemies:[{id:'e',pattern:'hunter'}],entry:{round:1,status:'playing',allies:[{id:'a',hp:10}],enemies:[{id:'e',hp:20,pattern:'hunter'}],intents:[{actor:'e',type:'attack',target:'a',damage:4}]},exit:{allies:[{id:'a',hp:6}]},
      metrics:{enemyDamage:4,blocked:1,healing:0,selfDamage:0,deaths:0,toolsUsed:0},actions:[{method:'endRound',before:{round:1,status:'playing',allies:[{id:'a',hp:10}],enemies:[{id:'e',hp:20,pattern:'hunter'}],intents:[{actor:'e',type:'attack',target:'a',damage:4}]},after:{round:2,status:'won',allies:[{id:'a',hp:6}],enemies:[{id:'e',hp:0}],intents:[]},events:[{type:'damage',source:'e',target:'a',amount:4,absorbed:1}]}]}]});
  const side = (records, hashValue) => ({inputs:['test'],sources:[{input:'test',sourceHash:hashValue,sourceSHA256:{'balance.js':hashValue}}],records:new Map(records.map(r => [identity(r),compactRecord(r,0)])),skippedDuplicates:0,excludedDiagnosticRecords:0});
  const before = [fixture(1),fixture(2,'aborted'),fixture(3,'won')], after = [fixture(1,'lost'),fixture(2),fixture(4)];
  after[0].contentVersion='patched';after[0].config.balanceVersion=1;after[0].decisions[0].args=['new-node'];after[0].final.deck.push({kind:'guard'});
  const report = compareSides(side(before,'old'),side(after,'new'));
  assert.equal(report.paired.total,2);assert.equal(report.paired.completed,1);assert.equal(report.paired.incomplete,1);
  assert.equal(report.before.balanceVersions[0],3);assert.equal(report.after.balanceVersions[1],1);assert.equal(report.pairs[0].afterBalanceVersion,1);
  assert.equal(report.transitions['won->lost'],1);assert.equal(report.before.runs.aborted,1);assert.equal(report.before.runs.lost,0);
  assert.equal(report.unmatchedBefore.length,1);assert.equal(report.unmatchedAfter.length,1);
  assert.equal(report.paired.unchangedRoute,1);assert.equal(report.paired.unchangedFinalDeck,1);
  assert.equal(report.before.healthAccounting.matches,3);assert.equal(report.changedSources[0].files[0],'balance.js');
  assert.equal(report.before.patterns[0].observations['attack:damageApplicationsObserved'],2);
  const prepared=fixture(6),pb=prepared.battles[0],attack=JSON.parse(JSON.stringify(pb.actions[0]));
  pb.entry.intents=[{actor:'e',type:'prepare',nextType:'area'}];
  const areaState={...attack.before,round:2,intents:[{actor:'e',type:'area',damage:4}]};
  attack.before=areaState;attack.after.round=3;
  pb.actions=[{method:'endRound',before:pb.entry,after:areaState,events:[{type:'prepare',actor:'e'}]},attack];pb.rounds=3;
  const prepareReport=compareSides(side([prepared],'old'),side([prepared],'new'));
  const ps=prepareReport.before.patterns[0];assert.equal(ps.battlesWithPreparePublished,1);assert.equal(ps.battlesWithPrepareResolved,1);
  assert.equal(ps.battlesWithAreaPublished,1);assert.equal(ps.battlesWithAreaApplications,1);assert.equal(prepareReport.before.healthAccounting.matches,1);
  const broken=fixture(5);broken.battles[0].metrics.enemyDamage=5;
  const bad=compareSides(side([broken],'old'),side([broken],'new'));assert.equal(bad.before.healthAccounting.mismatch,1);
  const changedOrder=fixture(1);changedOrder.config.party.reverse();assert.notEqual(identity(changedOrder),identity(fixture(1)));
  const changedCap=fixture(1);changedCap.config.maxRounds=59;assert.notEqual(identity(changedCap),identity(fixture(1)));
  assert.ok(markdown(report).includes('동일 전투'));assert.ok(pairCSV(report).includes('sameFinalDeck'));
  console.log('PASS 짝 매칭·순서 편성·상한·소스 패치 허용·중단 분리·HP 이벤트 검산·경로/덱 차이·패턴 적용·미매칭');
}
async function main(args) {
  const before=[],after=[];let out=null,test=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];if(arg==='--help'){console.log('node prototype/party-expedition-balance-compare.cjs --before <기존 실험 폴더> --after <패치 실험 폴더> --out <비교 폴더>\n--before/--after 반복 가능. --self-test 지원.');return;}
    if(arg==='--self-test'){test=true;continue;}if(!['--before','--after','--out'].includes(arg)||!args[i+1]||args[i+1].startsWith('--'))throw Error('옵션을 확인하세요: '+arg);
    if(arg==='--before')before.push(args[++i]);else if(arg==='--after')after.push(args[++i]);else out=args[++i];
  }
  if(test){selfTest();if(!before.length&&!after.length)return;}
  if(!before.length||!after.length||!out)throw Error('--before, --after, --out을 지정하세요.');
  const directory=path.resolve(out),files=['comparison.json','report.md','pairs.csv'];
  if(files.some(file=>fs.existsSync(path.join(directory,file))))throw Error('기존 비교 결과를 보존하려면 다른 --out 폴더를 지정하세요.');
  const [b,a]=await Promise.all([readSide(before),readSide(after)]),report=compareSides(b,a);
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(directory,'report.md'),markdown(report));fs.writeFileSync(path.join(directory,'pairs.csv'),pairCSV(report));
  console.log(JSON.stringify({before:report.before.runs,after:report.after.runs,paired:report.paired,transitions:report.transitions,healthBefore:report.before.healthAccounting,healthAfter:report.after.healthAccounting,out:directory},null,2));
  if(report.before.healthAccounting.mismatch||report.after.healthAccounting.mismatch)process.exitCode=1;
}
module.exports={VERSION,readSide,compareSides,identity,compactRecord,sideSummary,markdown,pairCSV,selfTest};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
