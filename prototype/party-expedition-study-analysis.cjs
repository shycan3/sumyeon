'use strict';
// Offline analysis only. This module never executes decisions or changes game data.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
// Names only: effects, decisions, and metrics always come from the saved records.
const catalogNames = Object.fromEntries(Object.entries(require('./party-expedition-core.js').CARDS).map(([kind, card]) => [kind, card.name]));
const VERSION = 'expedition-study-analysis-1';
const COMPLETED = new Set(['won', 'lost']);
const TYPES = ['attack', 'area', 'prepare', 'volley', 'ward', 'heal'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))]))
  : Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : value);
const totalHP = xs => (xs || []).reduce((n, x) => n + (x.hp || 0), 0);
const ratio = (a, b) => b ? a / b : null;
const statuses = () => ({ total: 0, won: 0, lost: 0, aborted: 0, error: 0, other: 0 });
function countStatus(target, status) { target.total++; target[Object.hasOwn(target, status) ? status : 'other']++; }
function get(map, key, init) { if (!map.has(key)) map.set(key, init()); return map.get(key); }
function sumMetrics(battles) {
  return battles.reduce((s, b) => {
    for (const k of ['enemyDamage', 'blocked', 'selfDamage', 'healing', 'deaths', 'toolsUsed']) s[k] += b.metrics?.[k] || 0;
    return s;
  }, { enemyDamage: 0, blocked: 0, selfDamage: 0, healing: 0, deaths: 0, toolsUsed: 0 });
}
function manifestInfo(manifest, source) {
  const sources = manifest?.sourceSHA256;
  const known = !!sources && Object.keys(sources).length > 0;
  return { source, known, sourceHash: known ? hash(canonical(sources)) : 'unknown:' + source,
    sourceSHA256: sources || null, policyVersion: manifest?.policy?.version || null };
}
function runConditions(record, info) {
  const c = record.config || {};
  return { contentVersion: record.contentVersion || 'unknown', sourceHash: info.sourceHash,
    policyVersion: c.policyVersion || info.policyVersion || 'unknown', difficulty: c.difficulty || 'unknown',
    breakMode: c.breakMode || 'unknown', balanceVersion: c.balanceVersion || 'voyage-balance-0', maxSteps: c.maxSteps ?? null, maxRounds: c.maxRounds ?? null };
}
function identity(record, conditions) {
  return canonical({ ...conditions, seed: record.config?.seed, party: record.config?.party || record.initial?.party || [],
    policy: record.config?.policy || 'unknown' });
}
function verifyHealth(battle) {
  const before = battle.entry?.allies, after = battle.exit?.allies;
  if (!before || !after) return { status: 'missing' };
  const ids = new Set(before.map(a => a.id));
  let damage = 0, healing = 0, enemyDamage = 0, selfDamage = 0;
  const enemies = new Set((battle.entry?.enemies || battle.enemies || []).map(e => e.id));
  for (const action of battle.actions || []) for (const event of action.events || []) {
    if (event.type === 'damage' && ids.has(event.target)) {
      damage += event.amount || 0;
      if (enemies.has(event.source)) enemyDamage += event.amount || 0; else selfDamage += event.amount || 0;
    }
    if (event.type === 'heal' && ids.has(event.target)) healing += event.amount || 0;
  }
  const entryHP = totalHP(before), exitHP = totalHP(after), expectedHP = entryHP + healing - damage;
  const metricExpectedHP = entryHP + (battle.metrics?.healing || 0) - (battle.metrics?.enemyDamage || 0) - (battle.metrics?.selfDamage || 0);
  return { status: expectedHP === exitHP && metricExpectedHP === exitHP ? 'matches' : 'mismatch',
    entryHP, exitHP, expectedHP, metricExpectedHP, healing, enemyDamage, selfDamage,
    savedMatches: battle.healthAccounting?.matches ?? null };
}
function intentObservations(battle, breakMode) {
  // One opportunity per enemy and round. Changing a target does not add another opportunity.
  const opportunities = new Map(), endActions = new Map();
  function see(state) {
    if (!state || state.status && state.status !== 'playing') return;
    const alive = new Set((state.enemies || []).filter(e => e.hp > 0).map(e => e.id));
    for (const intent of state.intents || []) {
      if (!alive.has(intent.actor) || !TYPES.includes(intent.type)) continue;
      const key = `${state.round}|${intent.actor}`;
      if (!opportunities.has(key)) opportunities.set(key, { round: state.round, actor: intent.actor, type: intent.type,
        nextType: intent.nextType || null, first: intent });
    }
  }
  see(battle.entry);
  for (const action of battle.actions || []) {
    see(action.before);
    if (action.method === 'endRound') endActions.set(action.before.round, action);
    see(action.after);
  }
  const results = [];
  for (const opportunity of opportunities.values()) {
    const action = endActions.get(opportunity.round);
    const pattern = (battle.enemies || battle.entry?.enemies || []).find(e => e.id === opportunity.actor)?.pattern || 'unknown';
    const out = { ...opportunity, pattern, observation: null, damage: 0, absorbed: 0, targetApplications: 0 };
    delete out.first;
    if (!action) out.observation = COMPLETED.has(battle.status) ? 'battleEndedBeforeEndRound' : 'censored';
    else {
      const intent = action.before.intents.find(i => i.actor === opportunity.actor);
      const enemy = action.before.enemies.find(e => e.id === opportunity.actor);
      const allyIds = new Set(action.before.allies.map(a => a.id));
      const events = action.events || [];
      const damageEvents = events.filter(e => e.type === 'damage' && e.source === opportunity.actor && allyIds.has(e.target));
      if (intent?.type === 'prepare' && events.some(e => e.type === 'prepare' && e.actor === opportunity.actor)) out.observation = 'prepareResolved';
      else if (['ward','heal'].includes(intent?.type)) {
        const applied=events.filter(e=>e.type===(intent.type==='ward'?'enemy-ward':'enemy-heal')&&e.actor===opportunity.actor);
        if(applied.length){out.observation='supportApplicationsObserved';out.supportAmount=applied.reduce((n,e)=>n+(e.amount||0),0);out.targetApplications=applied.length;}
        else if(!enemy||enemy.hp<=0)out.observation='actorDefeatedBeforeEndRound';
        else if(!action.before.enemies.some(e=>e.id===intent.target&&e.hp>0))out.observation='targetDownBeforeEndRound';
        else out.observation='noSupportApplicationObserved';
      }
      else if (damageEvents.length) {
        out.observation = 'damageApplicationsObserved';
        out.damage = damageEvents.reduce((s, e) => s + (e.amount || 0), 0);
        out.absorbed = damageEvents.reduce((s, e) => s + (e.absorbed || 0), 0);
        out.targetApplications = damageEvents.length;
      } else if (!enemy || enemy.hp <= 0) out.observation = 'actorDefeatedBeforeEndRound';
      else if (intent?.type === 'attack' && !action.before.allies.some(a => a.id === intent.target && a.hp > 0)) out.observation = 'targetDownBeforeEndRound';
      else if (intent && intent.type !== 'prepare') {
        let effective = Math.max(0, intent.damage - (enemy.weak || 0));
        if (breakMode === 'on' && enemy.broken) effective = Math.floor(effective / 2);
        // No damage event does not itself prove dispatch; zero damage can also coincide with a later skip.
        out.observation = effective === 0 ? 'zeroEffectiveDamageWithoutEvent' : 'noApplicationObserved';
      } else out.observation = 'noApplicationObserved';
    }
    results.push(out);
  }
  // A prepare event establishes an actual preparation. Its next-round outcome is based on public records only.
  for (const out of results) if (out.observation === 'prepareResolved') {
    const follow = results.find(x => x.actor === out.actor && x.round === out.round + 1 && x.type === out.nextType);
    out.followup = follow?.observation || (COMPLETED.has(battle.status) ? 'battleEndedBeforeFollowupPublished' : 'censored');
  }
  return results;
}
function createAnalyzer() {
  const runs = statuses(), battles = statuses(), health = { matches: 0, mismatch: 0, missing: 0, samples: [] };
  const sources = new Map(), cohorts = new Map(), partyPolicies = new Map(), floors = new Map(), cards = new Map(), patterns = new Map();
  const losses = [];
  const seen = new Set(), baseIdentities = new Map(), duplicateWarnings = [];
  let skippedDuplicates = 0, excludedDiagnosticRecords = 0, parsedRecords = 0, rewardDecisions = 0, skippedRewards = 0, malformedRewardChoices = 0, downedMetricMismatches = 0;
  function cardStats(kind, cohort) {
    return get(cards, `${cohort}|${kind}`, () => ({ cohort, kind, name: catalogNames[kind] || kind,
      nameOrigin: catalogNames[kind] ? 'currentCatalogNameOnly' : 'kind', offeredEpisodes: 0, selectedEpisodes: 0,
      selectedWithoutLaterCompletedBattle: 0, selectedWithLaterCompletedBattle: 0, selectedWithLaterPossession: 0,
      selectedWithLaterDraw: 0, selectedWithLaterUse: 0, completedBattles: 0, heldBattles: 0,
      drawnHeldBattles: 0, usedHeldBattles: 0, plays: 0, inferredDrawEvidence: 0 }));
  }
  function add(record, info = manifestInfo(null, 'memory')) {
    parsedRecords++;
    if (!record || !Array.isArray(record.battles) || !record.config) throw Error('원정 로그 구조를 확인하세요.');
    sources.set(info.source, info);
    if (record.config.excludeFromCoverageTotals === true || record.config.studyType === 'paired-failure-diagnostic' || record.studyType === 'paired-failure-diagnostic') {
      excludedDiagnosticRecords++;
      return false;
    }
    const conditions = runConditions(record, info), id = identity(record, conditions);
    if (seen.has(id)) { skippedDuplicates++; return false; }
    seen.add(id);
    const base = canonical({ seed: record.config.seed, party: record.config.party, policy: record.config.policy,
      difficulty: conditions.difficulty, breakMode: conditions.breakMode, balanceVersion: conditions.balanceVersion, contentVersion: conditions.contentVersion });
    if (baseIdentities.has(base) && baseIdentities.get(base) !== conditions.sourceHash && duplicateWarnings.length < 30)
      duplicateWarnings.push(`같은 시드·편성·정책·규칙이 소스 해시가 다른 입력에 있습니다. 임의 제거하지 않았습니다: seed ${record.config.seed}, ${record.config.policy}`);
    baseIdentities.set(base, conditions.sourceHash);
    const cohort = hash(canonical(conditions)).slice(0, 16);
    const cg = get(cohorts, cohort, () => ({ id: cohort, conditions, runs: statuses() }));
    countStatus(cg.runs, record.status); countStatus(runs, record.status);
    const party = record.config.party || record.initial?.party || [], policy = record.config.policy || 'unknown';
    const pg = get(partyPolicies, canonical({ cohort, party, policy }), () => ({ cohort, party, policy, runs: statuses(),
      completedRuns: 0, completedRunsWithoutDowned: 0, wonWithoutDowned: 0, downedEventsAllRuns: 0,
      completedBattles: 0, enemyDamage: 0, blocked: 0, combatHealing: 0, selfDamage: 0, toolsUsed: 0,
      outcomes: { won: { runs: 0, enemyDamage: 0, downedEvents: 0 }, lost: { runs: 0, enemyDamage: 0, downedEvents: 0 } } }));
    countStatus(pg.runs, record.status);
    const finishedBattles = record.battles.filter(b => COMPLETED.has(b.status));
    const runM = sumMetrics(record.battles), completedM = sumMetrics(finishedBattles);
    pg.downedEventsAllRuns += runM.deaths;
    pg.completedBattles += finishedBattles.length;
    pg.enemyDamage += completedM.enemyDamage; pg.blocked += completedM.blocked;
    pg.combatHealing += completedM.healing; pg.selfDamage += completedM.selfDamage; pg.toolsUsed += completedM.toolsUsed;
    if (COMPLETED.has(record.status)) {
      pg.completedRuns++;
      if (runM.deaths === 0) pg.completedRunsWithoutDowned++;
      if (record.status === 'won' && runM.deaths === 0) pg.wonWithoutDowned++;
      const o = pg.outcomes[record.status]; o.runs++; o.enemyDamage += runM.enemyDamage; o.downedEvents += runM.deaths;
    }
    for (const decision of record.decisions || []) {
      if (decision.phase !== 'reward' || decision.method !== 'chooseReward') continue;
      rewardDecisions++;
      const candidates = Array.isArray(decision.candidates) ? new Set(decision.candidates.filter(k => typeof k === 'string')) : new Set();
      const selected = decision.args?.[0] ?? null;
      if (selected === null) skippedRewards++;
      else if (!candidates.has(selected)) malformedRewardChoices++;
      for (const kind of candidates) {
        const c = cardStats(kind, cohort); c.offeredEpisodes++;
        if (kind !== selected) continue;
        c.selectedEpisodes++;
        const later = finishedBattles.filter(b => b.floor > decision.floor);
        if (!later.length) { c.selectedWithoutLaterCompletedBattle++; continue; }
        c.selectedWithLaterCompletedBattle++;
        const held = later.filter(b => b.deck?.some(card => card.kind === kind));
        if (held.length) c.selectedWithLaterPossession++;
        if (held.some(b => (b.drawnCards || []).includes(kind) || b.actions?.some(a => a.before?.hand?.some(card => card.kind === kind) || a.after?.hand?.some(card => card.kind === kind)))) c.selectedWithLaterDraw++;
        if (held.some(b => b.cards?.[kind]?.plays > 0)) c.selectedWithLaterUse++;
      }
    }
    for (const b of record.battles) {
      countStatus(battles, b.status);
      if (b.status === 'lost') losses.push({ cohort, source: info.source, seed: record.config.seed, party, policy,
        floor: b.floor, name: b.name, encounter: b.encounter, tier: b.tier, rounds: b.rounds,
        entryHP: totalHP(b.entry?.allies), entryAllies: b.entry?.allies?.map(a => ({ id: a.id, hp: a.hp, max: a.max })) || [],
        deck: b.deck || [], relics: b.relics || [], tools: b.tools || [], metrics: b.metrics || {},
        healthAccounting: b.healthAccounting || null });
      const h = verifyHealth(b); health[h.status]++;
      if (h.status !== 'matches' && health.samples.length < 20) health.samples.push({ seed: record.config.seed, policy, party, floor: b.floor, status: b.status, ...h });
      const obs = intentObservations(b, conditions.breakMode);
      const allyIds = new Set((b.entry?.allies || []).map(a => a.id));
      const downed = (b.actions || []).flatMap(a => a.events || []).filter(e => e.type === 'downed' && allyIds.has(e.target)).length;
      if (downed !== (b.metrics?.deaths || 0)) {
        downedMetricMismatches++;
        if (health.samples.length < 20) health.samples.push({ seed: record.config.seed, floor: b.floor, issue: 'downedEventMetricMismatch', downed, saved: b.metrics?.deaths });
      }
      if (COMPLETED.has(b.status)) {
        const fg = get(floors, canonical({ cohort, floor: b.floor, tier: b.tier, encounter: b.encounter }), () => ({ cohort,
          floor: b.floor, tier: b.tier, encounter: b.encounter, name: b.name, completedBattles: 0, won: 0, lost: 0,
          enemyDamage: 0, blocked: 0, healing: 0, selfDamage: 0, downedEvents: 0, toolsUsed: 0, rounds: 0,
          outcomes: { won: { n: 0, damage: 0 }, lost: { n: 0, damage: 0 } } }));
        fg.completedBattles++; fg[b.status]++; fg.enemyDamage += b.metrics?.enemyDamage || 0;
        fg.blocked += b.metrics?.blocked || 0; fg.healing += b.metrics?.healing || 0; fg.selfDamage += b.metrics?.selfDamage || 0;
        fg.downedEvents += downed; fg.toolsUsed += b.metrics?.toolsUsed || 0; fg.rounds += b.rounds || 0;
        fg.outcomes[b.status].n++; fg.outcomes[b.status].damage += b.metrics?.enemyDamage || 0;
        const held = new Set((b.deck || []).map(c => c.kind));
        const drawn = new Set(b.drawnCards || []);
        for (const a of b.actions || []) for (const state of [a.before, a.after]) for (const card of state?.hand || []) drawn.add(card.kind);
        for (const kind of held) {
          const c = cardStats(kind, cohort); c.heldBattles++;
          if (drawn.has(kind)) c.drawnHeldBattles++;
          const u = b.cards?.[kind];
          if (u?.plays > 0) {
            c.usedHeldBattles++; c.plays += u.plays;
            if (u.name) { c.name = u.name; c.nameOrigin = 'savedLog'; }
            if (!drawn.has(kind)) c.inferredDrawEvidence++;
          }
        }
      }
      // Patterns from incomplete fights remain separate; only completed fights enter percentages.
      for (const pattern of new Set((b.enemies || b.entry?.enemies || []).map(e => e.pattern))) {
        const p = get(patterns, `${cohort}|${pattern}|${b.floor}|${b.tier}`, () => ({ cohort, pattern, floor: b.floor, tier: b.tier,
          completedBattles: 0, incompleteBattles: 0, battlesWithAreaPublished: 0, battlesWithAreaApplications: 0,
          battlesWithoutAreaApplications: 0, observations: {}, preparedFollowups: {}, hpDamage: 0, absorbed: 0 }));
        if (!COMPLETED.has(b.status)) { p.incompleteBattles++; continue; }
        p.completedBattles++;
        const own = obs.filter(o => o.pattern === pattern);
        if (own.some(o => o.type === 'area')) p.battlesWithAreaPublished++;
        if (own.some(o => o.type === 'area' && o.observation === 'damageApplicationsObserved')) p.battlesWithAreaApplications++;
        else p.battlesWithoutAreaApplications++;
        for (const o of own) {
          const key = `${o.type}:${o.observation}`; p.observations[key] = (p.observations[key] || 0) + 1;
          p.hpDamage += o.damage; p.absorbed += o.absorbed;
          if (o.followup) p.preparedFollowups[o.followup] = (p.preparedFollowups[o.followup] || 0) + 1;
        }
      }
    }
    return true;
  }
  function result() {
    const floorRows = [...floors.values()].map(g => ({ ...g, meanEnemyDamage: ratio(g.enemyDamage, g.completedBattles),
      meanBlocked: ratio(g.blocked, g.completedBattles), meanHealing: ratio(g.healing, g.completedBattles),
      meanRounds: ratio(g.rounds, g.completedBattles) })).sort((a, b) => b.floor - a.floor || b.meanEnemyDamage - a.meanEnemyDamage);
    const totalCompletedBattles = battles.won + battles.lost;
    const cardsRows = [...cards.values()].map(c => {
      const denominator = floorRows.filter(f => f.cohort === c.cohort).reduce((n, f) => n + f.completedBattles, 0);
      return { ...c, completedBattles: denominator, selectionRateOfOffers: ratio(c.selectedEpisodes, c.offeredEpisodes),
        possessionRateAfterSelectedOpportunity: ratio(c.selectedWithLaterPossession, c.selectedWithLaterCompletedBattle),
        drawRateAfterSelectedPossession: ratio(c.selectedWithLaterDraw, c.selectedWithLaterPossession),
        useRateAfterSelectedDraw: ratio(c.selectedWithLaterUse, c.selectedWithLaterDraw),
        heldRateOfCompletedBattles: ratio(c.heldBattles, denominator), drawRateOfHeldBattles: ratio(c.drawnHeldBattles, c.heldBattles),
        useRateOfDrawnHeldBattles: ratio(c.usedHeldBattles, c.drawnHeldBattles) };
    }).sort((a, b) => b.offeredEpisodes - a.offeredEpisodes || b.plays - a.plays);
    return { version: VERSION, createdAt: new Date().toISOString(), catalogNamesSHA256: hash(canonical(catalogNames)), parsedRecords, skippedDuplicates, excludedDiagnosticRecords,
      diagnosticExclusionReason: '같은 원정 진입 상태를 복제한 paired-failure-diagnostic 또는 excludeFromCoverageTotals 표식 자료는 독립적인 전체 원정 표본이 아니므로 제외한다. 별도 failure-probe 보고서에서 비교한다.',
      duplicates: duplicateWarnings, sources: [...sources.values()], cohorts: [...cohorts.values()], mixedConditions: cohorts.size > 1,
      runs, battles, completedBattles: totalCompletedBattles, healthAccounting: health,
      rewardDecisions, skippedRewards, malformedRewardChoices, downedMetricMismatches, losses,
      partyPolicies: [...partyPolicies.values()].map(g => ({ ...g, meanDamagePerCompletedBattle: ratio(g.enemyDamage, g.completedBattles),
        noDownedRateOfCompletedRuns: ratio(g.completedRunsWithoutDowned, g.completedRuns) })),
      floors: floorRows, cards: cardsRows, patterns: [...patterns.values()],
      limitations: [
        '원본 JSONL을 한 줄씩 처리한다. 한 원정의 로그와 집계·중복 식별자만 메모리에 유지하며 전체 원본 배열을 만들지 않는다.',
        '전체 합계는 입력 조건을 합친 기술 통계이다. 소스 해시·콘텐츠·정책 버전·난이도·브레이크·실행 상한이 다른 조건은 cohort로 분리한다. 편성·정책은 별도 층화한다.',
        '같은 시드·편성·정책·조건·소스 해시인 중복은 최초 한 번만 사용한다. manifest가 없으면 입력 경로를 소스 식별자로 사용해 서로 다른 파일의 중복을 임의 제거하지 않는다.',
        'excludeFromCoverageTotals:true 또는 studyType:paired-failure-diagnostic 표식 자료는 전체 원정 집계에서 자동 제외한다. 동일 진입 상태의 대조 진단을 독립 원정 승률 표본으로 재사용하지 않는다.',
        '카드 보상 후보/채택은 reward 단계 chooseReward만 포함한다. 상점 구매·사건 복제/교환·시작 덱은 보상 채택 분모에 포함하지 않는다.',
        '기존 초기/coverage 배치에는 카드 사본 ID 변화 기록이 없다. 새 수집기의 inventoryChanges가 있는 로그도 이번 분석에서는 같은 카드 종류 단위로 추적한다. 같은 종류의 기존 카드·다른 획득·복제가 영향을 줄 수 있다. 다음 구역의 완료 전투만 후속 기회로 센다.',
        '카드 이름은 저장 로그를 우선 사용하고 없으면 현재 카탈로그의 이름만 보완한다(nameOrigin). 효과·수치·후보·사용 판정은 저장 로그 기준이며 현재 카드 효과로 과거 전투를 재계산하지 않는다.',
        '카드 보유→손패→사용은 완료 전투마다 종류를 한 번씩 센다. 반복 뽑기나 중복 카드는 표본 수를 늘리지 않는다. 기본 행동은 덱 카드가 아니므로 이 표에서 제외한다.',
        '손패 도달은 초기/행동 전후 손패 및 drawnCards로 관찰한다. 사용 기록이 있는데 손패 증거가 없으면 inferredDrawEvidence로 표시하고 수집을 검토한다.',
        '후반 전투는 그 구역까지 도달한 원정만 포함한다. 생존자 편향이 있으며 편성별 표본·경로·유물·진입 체력 차이는 승률의 원인을 증명하지 않는다.',
        '쓰러짐은 downed 이벤트 수다. 회복 후 다시 쓰러짐은 다시 센다. 사망 없는 원정은 완료 원정 중 downed 이벤트가 0인 경우이며 영구 사망을 의미하지 않는다.',
        'HP 회계는 전투 진입/종료 HP와 실제 damage/heal 이벤트로 재검산한다. 보호 흡수는 HP 감소가 아니며 전투 후 유물/정비 회복은 전투 회계 밖이다.',
        '적 의도는 라운드·적당 공개된 기회 한 번씩 센다. 실제 해결은 prepare 이벤트와 아군을 대상으로 한 적 source의 damage 이벤트로 확인한다. 완전 보호 흡수도 적용으로 센다.',
        '피해 0 완전 억제는 hit가 이벤트를 남기지 않는다. zeroEffectiveDamageWithoutEvent는 무피해 조건 관찰일 뿐 실제 공격 실행의 확증이 아니다. 죽은 대상은 endRound 도중 재지정하지 않는다.',
        '반격으로 적이 죽거나 이전 공격으로 대상이 쓰러지면 뒤 의도가 생략될 수 있다. noApplicationObserved는 피해 이벤트 없음이며 원인을 임의 확정하지 않는다.',
        '공개하지 않은 미래 의도/난수는 읽지 않는다. 광역 피해 적용이 없었다는 사실만으로 전투가 쉬웠거나 전략적으로 단조롭다고 확정할 수 없다.',
        '카드의 낮은 채택·사용률이나 자동 승률은 휴리스틱 정책의 편향을 포함한다. 약한 카드·좋은 밸런스·사람의 재미를 증명하지 않는다. 표본이 적은 비율은 탐색 신호로만 사용한다.'
      ] };
  }
  return { add, result };
}
const show = n => n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(2);
const escape = value => String(value ?? '—').replace(/\|/g, '/').replace(/[\r\n]/g, ' ');
function markdown(report) {
  const r = report.runs, b = report.battles;
  const lines = ['# 자동 원정 추가 분석', '', `원정 ${r.total}회: 승리 ${r.won}, 패배 ${r.lost}, 중단 ${r.aborted}, 오류 ${r.error}.`,
    `전투 ${b.total}회: 승리 ${b.won}, 패배 ${b.lost}, 중단 ${b.aborted}, 오류 ${b.error}.`,
    `HP 회계: 일치 ${report.healthAccounting.matches}, 불일치 ${report.healthAccounting.mismatch}, 증거 없음 ${report.healthAccounting.missing}. 중복 제외 ${report.skippedDuplicates}회.`, '',
    `대조 진단 자료 제외 ${report.excludedDiagnosticRecords}건. ${report.diagnosticExclusionReason}`, '',
    report.mixedConditions ? '**조건이 다른 입력의 총합이다. 아래 통계는 cohort별로 나누며 숫자만으로 원인을 비교하지 않는다.**' : '입력의 콘텐츠·소스·규칙 조건은 하나이다. 편성·정책·경로 차이는 남아 있다.', '',
    '## 입력 조건', '', '| cohort | 콘텐츠 | 밸런스 버전 | 난이도 | 브레이크 | 정책 버전 | 원정 | 소스 해시 앞 12자 |', '|---|---|---|---|---|---|---:|---|',
    ...report.cohorts.map(c => `| ${c.id} | ${escape(c.conditions.contentVersion)} | ${c.conditions.balanceVersion} | ${c.conditions.difficulty} | ${c.conditions.breakMode} | ${c.conditions.policyVersion} | ${c.runs.total} | ${c.conditions.sourceHash.slice(0,12)} |`), '',
    '## 편성·정책', '', 'HP 피해·보호·회복 평균에는 완료 전투만 들어간다. 무사 원정은 완료 원정 중 쓰러짐 이벤트 0회이다.', '',
    '| cohort | 편성 | 정책 | 완료 원정 | 무사 원정 | 승/패 | 완료 전투 | 평균 실제 HP 피해 | 쓰러짐 이벤트(전체 원정) |', '|---|---|---|---:|---:|---:|---:|---:|---:|',
    ...report.partyPolicies.map(g => `| ${g.cohort} | ${g.party.join('/')} | ${g.policy} | ${g.completedRuns} | ${g.completedRunsWithoutDowned} | ${g.runs.won}/${g.runs.lost} | ${g.completedBattles} | ${show(g.meanDamagePerCompletedBattle)} | ${g.downedEventsAllRuns} |`), '',
    '## 자연 패배 사례', '',
    ...(report.losses.length ? report.losses.map(l => `- cohort ${l.cohort} · seed ${l.seed} · ${l.policy} · ${l.party.join('/')} · ${l.floor}구역 ${escape(l.name)} · 진입 HP ${l.entryHP} (${l.entryAllies.map(a => `${a.id} ${a.hp}`).join(', ')}) · 실제 HP 피해 ${l.metrics.enemyDamage || 0} · 보호 흡수 ${l.metrics.blocked || 0} · 회복 ${l.metrics.healing || 0} · 쓰러짐 ${l.metrics.deaths || 0} · ${l.rounds}턴. 덱 ${l.deck.map(c => `${c.kind}${c.upgraded ? '+' : ''}${c.enchant ? '(' + c.enchant + ')' : ''}`).join(', ')}. 유물 ${l.relics.join(', ') || '없음'}.`) : ['자연 패배 전투가 없다. 패배와 승리의 실제 사례 비교는 현재 표본으로 할 수 없다.']), '',
    '## 구역·전투 부담', '', '| cohort | 구역·전투 | 완료 표본 | 승/패 | 평균 HP 피해 | 평균 보호 흡수 | 평균 회복 | 평균 턴 | 쓰러짐 |', '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.floors.map(g => `| ${g.cohort} | ${g.floor} · ${escape(g.name)} | ${g.completedBattles} | ${g.won}/${g.lost} | ${show(g.meanEnemyDamage)} | ${show(g.meanBlocked)} | ${show(g.meanHealing)} | ${show(g.meanRounds)} | ${g.downedEvents} |`), '',
    '## 보상 후보에서 실제 사용까지', '', `전투 카드 보상 결정 ${report.rewardDecisions}회, 건너뛰기 ${report.skippedRewards}회, 후보 밖 채택 ${report.malformedRewardChoices}회.`, '',
    '후속 단계는 채택한 **카드 종류**를 다음 구역의 완료 전투에서 추적한다. 단일 실물 카드의 추적은 아니다. 마지막 전투 뒤 채택 등 다음 완료 전투가 없는 경우는 별도 열이다. 상점·사건·시작 덱은 제시/채택에서 제외한다.', '',
    '| cohort | 카드 | 후보 제시 | 채택 | 다음 전투 없음 | 후속 기회 | 이후 보유 | 이후 손패 | 이후 사용 |', '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.cards.filter(c => c.offeredEpisodes).map(c => `| ${c.cohort} | ${escape(c.name)} (${c.kind}) | ${c.offeredEpisodes} | ${c.selectedEpisodes} | ${c.selectedWithoutLaterCompletedBattle} | ${c.selectedWithLaterCompletedBattle} | ${c.selectedWithLaterPossession} | ${c.selectedWithLaterDraw} | ${c.selectedWithLaterUse} |`), '',
    '제시→채택의 분모는 후보 제시 횟수, 채택→보유의 분모는 후속 기회 있는 채택, 보유→손패의 분모는 이후 보유 확인, 손패→사용의 분모는 이후 손패 확인이다. 반복 제시·채택은 각각 사건 한 번씩 센다.', '',
    '## 완료 전투의 보유·손패·사용', '', '각 카드 종류를 전투당 한 번 센다. 보유율 분모는 해당 cohort 완료 전투, 손패 도달률 분모는 보유 전투, 사용률 분모는 손패에 도달한 보유 전투이다. 표본이 적거나 낮은 비율이라는 이유로 카드가 약하다고 판단하지 않는다.', '',
    '| cohort | 카드 | 전체 완료 전투 | 보유 전투 | 손패 도달 | 사용 전투 | 총 사용 횟수 | 손패 증거 없는 사용 |', '|---|---|---:|---:|---:|---:|---:|---:|',
    ...report.cards.filter(c => c.heldBattles).map(c => `| ${c.cohort} | ${escape(c.name)} (${c.kind}) | ${c.completedBattles} | ${c.heldBattles} | ${c.drawnHeldBattles} | ${c.usedHeldBattles} | ${c.plays} | ${c.inferredDrawEvidence} |`), '',
    '## 적 의도: 공개와 실제 적용', '', '광역 적용은 적 source의 아군 damage 이벤트로 확인한다. 전부 보호로 흡수된 공격도 포함한다. 적용 없음에는 조기 처치·완전 억제·죽은 대상·반격 취소가 섞일 수 있다. 공개되지 않은 미래 패턴은 추정하지 않는다.', '',
    '| cohort | 구역·패턴 | 완료 전투 | 광역 공개 전투 | 광역 적용 전투 | 광역 적용 없는 전투 | 준비 해결 횟수 | 준비 후 다음 패턴 실제 적용 |', '|---|---|---:|---:|---:|---:|---:|---:|',
    ...report.patterns.map(p => `| ${p.cohort} | ${p.floor} · ${p.pattern} | ${p.completedBattles} | ${p.battlesWithAreaPublished} | ${p.battlesWithAreaApplications} | ${p.battlesWithoutAreaApplications} | ${p.observations['prepare:prepareResolved'] || 0} | ${p.preparedFollowups.damageApplicationsObserved || 0} |`), '',
    '공격/광역/준비별 세부 기회 분류와 준비 후속 결과는 analysis.json의 patterns에 있다. 피해 이벤트 없는 완전 억제는 실제 적용으로 세지 않는다. 중단·오류 전투는 incompleteBattles로 별도 저장한다.', '',
    '## 해석 범위', '', ...report.limitations.map(x => '- ' + x), '',
    ...report.duplicates.map(x => '- 중복 후보 경고: ' + x), ''];
  return lines.join('\n');
}
async function analyzeInputs(inputs) {
  if (!inputs.length) throw Error('--input을 하나 이상 지정하세요.');
  const analyzer = createAnalyzer();
  for (const input of inputs) {
    const absolute = path.resolve(input), directory = fs.statSync(absolute).isDirectory() ? absolute : path.dirname(absolute);
    const file = fs.statSync(absolute).isDirectory() ? path.join(directory, 'runs.jsonl') : absolute;
    const manifestPath = path.join(directory, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')) : null;
    const info = manifestInfo(manifest, file);
    let lineNumber = 0;
    const stream = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const raw of stream) {
      lineNumber++;
      const line = raw.replace(/^\uFEFF/, '').trim(); if (!line) continue;
      try { analyzer.add(JSON.parse(line), info); }
      catch (error) { throw Error(`${file}:${lineNumber}: ${error.message}`); }
    }
  }
  return analyzer.result();
}
async function selfTest() {
  const assert = require('node:assert/strict');
  const Simulation = require('./party-expedition-simulation.js');
  const Telemetry = require('./party-expedition-telemetry.js');
  const Combat = require('./party-expedition-core.js');
  const record = Simulation.simulate({ seed: 3, maxSteps: 1500 });
  const info = manifestInfo({ sourceSHA256: { fixture: 'actual-engine' } }, 'self-test');
  const a = createAnalyzer(); assert.equal(a.add(record, info), true); assert.equal(a.add(record, info), false);
  const report = a.result();
  assert.equal(report.runs.total, 1); assert.equal(report.skippedDuplicates, 1);
  const marked = JSON.parse(JSON.stringify(record)); marked.config.excludeFromCoverageTotals = true;
  const diagnostic = JSON.parse(JSON.stringify(record)); diagnostic.config.studyType = 'paired-failure-diagnostic';
  assert.equal(a.add(marked, info), false); assert.equal(a.add(diagnostic, info), false);
  assert.equal(a.result().runs.total, 1); assert.equal(a.result().battles.total, record.battles.length);
  assert.equal(a.result().excludedDiagnosticRecords, 2); assert.equal(a.result().skippedDuplicates, 1);
  assert.equal(report.healthAccounting.mismatch, 0); assert.equal(report.healthAccounting.matches, record.battles.length);
  assert.equal(report.rewardDecisions, record.decisions.filter(d => d.phase === 'reward' && d.method === 'chooseReward').length);
  for (const c of report.cards) { assert.ok(c.selectedEpisodes <= c.offeredEpisodes); assert.ok(c.usedHeldBattles <= c.drawnHeldBattles); assert.ok(c.drawnHeldBattles <= c.heldBattles); }
  const battle = new Combat.Battle({ party: Simulation.STANDARD_PARTIES[0], enemies: [{ id: 'fixture-enemy', hp: 6, damage: 9, pattern: 'hunter' }], seed: 4 });
  battle.s.enemies[0].weak = 99;
  const before = Telemetry.publicState(battle.s), events = battle.endRound(), after = Telemetry.publicState(battle.s);
  const obs = intentObservations({ status: 'aborted', enemies: before.enemies, entry: before, actions: [{ method: 'endRound', before, after, events }] }, 'off');
  assert.ok(obs.some(o => o.observation === 'zeroEffectiveDamageWithoutEvent'));
  assert.ok(!obs.some(o => o.round === 1 && o.observation === 'damageApplicationsObserved'));
  // Damage fully absorbed by shield remains an actual application; a reaction can end the fight.
  const guarded = new Combat.Battle({ party: Simulation.STANDARD_PARTIES[0], enemies: [{ id: 'guarded-enemy', hp: 6, damage: 9, pattern: 'hunter' }], seed: 4 });
  const target = guarded.actor(guarded.s.intents[0].target); target.shield = 20; target.reaction = 6;
  const gb = Telemetry.publicState(guarded.s), ge = guarded.endRound(), ga = Telemetry.publicState(guarded.s);
  const observed = intentObservations({ status: guarded.s.status, enemies: gb.enemies, entry: gb, actions: [{ method: 'endRound', before: gb, after: ga, events: ge }] }, 'off');
  assert.equal(observed[0].observation, 'damageApplicationsObserved'); assert.equal(observed[0].damage, 0); assert.equal(observed[0].absorbed, 9);
  assert.equal(guarded.s.status, 'won');
  const changed = JSON.parse(JSON.stringify(record)); changed.config.difficulty = 'calm'; a.add(changed, info);
  assert.equal(a.result().cohorts.length, 2);
  const legacy = JSON.parse(JSON.stringify(record)); legacy.config.balanceVersion = 'voyage-balance-0'; a.add(legacy, info);
  assert.equal(a.result().cohorts.length, 3, '동일 소스라도 이전·현재 밸런스 규칙은 분리한다.');
  assert.ok(markdown(report).includes('후속 기회'));
  console.log(`PASS 실제 원정 ${record.battles.length}전투: 중복·진단 제외·HP 회계·보상 분모·손패 분모·완전 억제·보호/반격·조건 분리`);
}
async function main(args) {
  const inputs = []; let out = null, test = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') { console.log('node prototype/party-expedition-study-analysis.cjs --input <실험 폴더 또는 runs.jsonl> [--input <다른 입력>] --out <분석 폴더>\n--self-test: 작은 실제 엔진 fixture 검사'); return; }
    if (arg === '--self-test') { test = true; continue; }
    if (!['--input', '--out'].includes(arg) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('옵션을 확인하세요: ' + arg);
    if (arg === '--input') inputs.push(args[++i]); else out = args[++i];
  }
  if (test) { await selfTest(); if (!inputs.length) return; }
  if (!out) throw Error('--out 분석 폴더를 지정하세요.');
  const report = await analyzeInputs(inputs), directory = path.resolve(out);
  // Refuse replacing the inputs themselves; output is intentionally an additional artifact.
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'analysis.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(directory, 'analysis.md'), markdown(report));
  console.log(JSON.stringify({ runs: report.runs, battles: report.battles, healthAccounting: report.healthAccounting,
    skippedDuplicates: report.skippedDuplicates, excludedDiagnosticRecords: report.excludedDiagnosticRecords, cohorts: report.cohorts.length, out: directory }, null, 2));
  if (report.healthAccounting.mismatch || report.malformedRewardChoices) process.exitCode = 1;
}
module.exports = { VERSION, createAnalyzer, analyzeInputs, markdown, intentObservations, verifyHealth, manifestInfo, selfTest };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
