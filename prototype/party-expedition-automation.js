(function (root) {
  'use strict';
  const Expedition = typeof module !== 'undefined' ? require('./party-expedition-voyage.js') : root.PartyExpeditionRun;
  const Combat = typeof module !== 'undefined' ? require('./party-expedition-core.js') : root.PartyExpedition;
  const Auto = typeof module !== 'undefined' ? require('./party-expedition-auto.js') : root.PartyExpeditionAuto;
  if (!Expedition || !Combat || !Auto) throw Error('원정·전투·전투 자동 모듈을 먼저 불러오세요.');
  const { RELICS = {}, TOOLS = {}, ENCHANTS = {} } = Expedition;
  const copy = value => JSON.parse(JSON.stringify(value));
  const POLICY_VERSION = 'expedition-heuristic-1';
  // These weights are explicit initial hypotheses, not learned human preferences
  // or calibrated estimates of a card's contribution to victory.
  const PROFILES = {
    balanced: { attack: 1, defense: 1, heal: 1, elite: 5, risk: 1, healRatio: .67, toolDamage: 10, skip: 3.7 },
    aggressive: { attack: 1.25, defense: .8, heal: .8, elite: 11, risk: .55, healRatio: .48, toolDamage: 16, skip: 3.7 },
    cautious: { attack: .9, defense: 1.2, heal: 1.2, elite: 1, risk: 1.7, healRatio: .8, toolDamage: 5, skip: 3.7 }
  };
  const terminal = run => ['won', 'lost'].includes(run.s.phase);
  const decision = (method, args, reason) => {
    // Trailing optional arguments stay absent after JSON export/replay instead
    // of silently becoming null.
    while (args.length && args.at(-1) === undefined) args.pop();
    return { method, args, reason };
  };
  const hpRatio = run => run.s.allies.reduce((n, a) => n + a.hp, 0) / run.s.allies.reduce((n, a) => n + a.max, 0);
  const downed = run => run.s.allies.some(a => a.hp <= 0);
  function best(items, score) {
    let chosen = null, value = -Infinity;
    for (const item of items) {
      const next = score(item);
      if (Number.isFinite(next) && next > value) { chosen = item; value = next; }
    }
    return chosen === null ? null : { item: chosen, value };
  }
  function profile(options) {
    const name = options?.policy || 'balanced';
    if (!PROFILES[name]) throw Error('알 수 없는 원정 자동 정책: ' + name);
    return { name, weights: PROFILES[name] };
  }
  function effectValue(d, p) {
    const x = d.cost === 'X' ? 3 : 1;
    const amount = key => (d[key] || 0) * (d.xScale?.includes(key) ? x : 1);
    const powers = { assaultDamage: 5, shieldReaction: 4, roundShield: 7, exposureBonus: 3, disruptShield: 4,
      firstCycleDraw: 5, firstExhaustDraw: 5, roundEnergy: 12, roundHeal: 6 };
    return ((d.damage || 0) * (d.hits || 1) + amount('areaDamage') * 1.6 + (d.exposedDamage || 0) * .45
      + (d.weakDamage || 0) * .4 + (d.penetrate ? 2 : 0)) * p.attack
      + ((d.shield || 0) + amount('allShield') * 2 + (d.selfShield || 0) * .55 + (d.reaction || 0) * .6
        + (d.weak || 0) * 1.1 + amount('allWeak') * 2 + (d.nextShield || 0) * .55) * .75 * p.defense
      + (amount('heal') + (d.selfHeal || 0) * .8 + (d.allHeal || 0) * 2.4 + (d.protectedHeal || 0) * .4) * p.heal
      + (d.exposure || 0) * .65 + (d.allExposure || 0) + (d.removeShield || 0) * .25
      + amount('draw') * 3.3 + (d.shieldedDraw || d.exposureDraw || 0) * 1.6
      + (d.energy || 0) * 6 + (d.nextEnergy || 0) * 3.5 + (d.retrieve || d.retrieveFamily ? 3 : 0)
      + (d.reserveDiscard || 0) * 2 + (d.reserve ? 2 : 0) + (d.retain ? 1.5 : 0)
      + Object.entries(d.power || {}).reduce((n, [key, v]) => n + v * (powers[key] || 0), 0)
      - (d.selfHP || 0) * p.heal;
  }
  function quality(run, card, p) {
    const d = run.definition(card);
    const cost = d.cost === 'X' ? 3 : d.cost;
    const value = d.choices?.length ? Math.max(...d.choices.map(choice => effectValue({ ...d, ...choice, choices: null }, p))) + 1 : effectValue(d, p);
    const tags = d.linkTags || [];
    const existing = run.s.deck.filter(c => typeof card === 'object' ? c.id !== card.id : true).map(c => run.definition(c));
    const overlap = tags.reduce((n, tag) => n + Math.min(3, existing.filter(other => other.linkTags?.includes(tag)).length), 0);
    return value / (1 + cost * .65) + overlap * .15;
  }
  function rewardValue(run, kind, p) {
    const count = run.s.deck.filter(c => c.kind === kind).length;
    return quality(run, kind, p) - count * .65 - Math.max(0, run.s.deck.length - 16) * .18;
  }
  function relicValue(run, id, p) {
    const deck = run.s.deck.map(c => run.definition(c)), size = deck.length;
    const count = predicate => deck.filter(predicate).length;
    const missing = 1 - hpRatio(run);
    const values = {
      compass: new Set(deck.map(d => d.family)).size >= 3 ? 9 : 4,
      oxygen: 4 + count(d => Number.isInteger(d.cost) && d.cost >= 2) * 1.2,
      ledger: size >= 15 ? 8 : 4,
      rope: 3 + count(d => d.retrieve || d.retrieveFamily) * 2,
      lens: (4 + count(d => d.exposure || d.allExposure) * 1.4 + (run.s.party.includes('diver') ? 3 : 0)) * p.defense,
      buoy: (5 + missing * 4) * p.defense,
      hearth: (7 + missing * 5) * p.heal,
      hourglass: 3 + count(d => d.nextEnergy || d.nextShield) * 2,
      signal: 9,
      mirror: (4 + count(d => d.shield) * .6) * p.defense,
      purse: run.s.floor < 5 ? 8 : 3,
      seal: run.s.floor < 5 ? 9 : 5
    };
    return values[id] || 2;
  }
  function removal(run, p) {
    if (run.s.deck.length <= 6) return null;
    return best(run.s.deck, c => -quality(run, c, p) + (['strike', 'guard'].includes(c.kind) ? 1 : 0) - (c.upgraded ? 1 : 0));
  }
  function upgrade(run, p) {
    return best(run.s.deck.filter(c => !c.upgraded), c => quality(run, { ...c, upgraded: true }, p) - quality(run, c, p) + quality(run, c, p) * .1);
  }
  function enchant(run, ids, p) {
    const candidates = [];
    for (const card of run.s.deck.filter(c => !c.enchant)) {
      const d = run.definition(card);
      for (const id of ids || []) if (ENCHANTS[id]?.test(d)) candidates.push({ card: card.id, enchant: id });
    }
    return best(candidates, c => quality(run, { ...run.s.deck.find(card => card.id === c.card), enchant: c.enchant }, p)
      - quality(run, c.card, p) + (c.enchant === 'flash' ? 1 : 0));
  }
  function routeValue(run, route, p) {
    // Every route read here is a connected public choice. No rewards or random
    // events are generated until the chosen node is actually entered.
    const enemies = route.enemies || [], ratio = hpRatio(run);
    const pressure = enemies.reduce((n, e) => n + e.hp / 12 + e.damage / 3 + e.areaDamage * .6, 0);
    let score = route.rewardTier === 'elite' ? p.elite : route.event ? 5 : 3;
    score -= pressure * p.risk * (ratio < .65 ? 1.8 : .7);
    if (downed(run)) score -= enemies.length * 7;
    if (route.interlude === 'camp') score += (1 - ratio) * 12 + (downed(run) ? 12 : 2);
    if (route.interlude === 'shop') score += Math.min(6, run.s.gold / 8) + (downed(run) && run.s.gold >= 12 ? 7 : 0);
    if (route.event === 'cache') score += 5;
    if (route.event === 'observatory' && run.s.deck.some(c => c.kind === 'strike' || c.kind === 'guard')) score += 2;
    return score;
  }
  function combatDecision(run, p) {
    const b = run.battle;
    if (!b || b.s.status !== 'playing') throw Error('전투 단계와 전투 상태가 일치하지 않습니다.');
    const action = Auto.chooseVoyage(b, 'emergency');
    if (!action) throw Error('진행 중인 전투에 자동 행동이 없습니다.');
    if (action.type === 'tool') return decision('useTool', [action.slot, action.target], '현재 예고된 치명적인 공격에 대응하는 도구를 사용합니다.');
    if (action.type === 'discard') return decision('discardForSounder', [action.card], '공개된 적 의도에 맞춰 측심사의 손패를 정리합니다.');
    const tools = b.s.voyage?.tools || [], allies = b.s.allies.filter(a => a.hp > 0), enemies = b.s.enemies.filter(e => e.hp > 0);
    const damage = b.s.intents.reduce((sum, i) => {
      if (i.type === 'prepare' || !enemies.some(e => e.id === i.actor)) return sum;
      const targets = b.intentTargets(i).filter(id=>allies.some(a=>a.id===id)).map(id=>b.actor(id));
      return sum + targets.reduce((n, a) => n + Math.max(0, b.intentDamage(i) - a.shield), 0);
    }, 0);
    const wounded = best(allies.filter(a => a.max - a.hp >= 8), a => a.max - a.hp);
    if (wounded && tools.includes('medicine')) return decision('useTool', [tools.indexOf('medicine'), wounded.item.id], '회복량 8을 온전히 활용해 누적 피해를 복구합니다.');
    if (damage >= p.toolDamage && tools.includes('muffler')) return decision('useTool', [tools.indexOf('muffler')], '현재 공개된 다수 공격을 약화해 체력 손실을 줄입니다.');
    if (damage >= p.toolDamage && tools.includes('barrier')) return decision('useTool', [tools.indexOf('barrier')], '현재 예고 피해에 파티 보호 도구를 사용합니다.');
    if (action.type === 'end' && b.s.energy <= 2 && tools.includes('battery')) {
      const affordableSoon = b.s.zones.hand.some(id => {
        const d = b.definition(id); return d.cost === 'X' || Number.isInteger(d.cost) && d.cost > b.s.energy && d.cost <= Math.min(5, b.s.energy + 2);
      });
      if (affordableSoon) return decision('useTool', [tools.indexOf('battery')], '현재 손패의 카드를 사용할 에너지를 보충합니다.');
    }
    if (action.type === 'end' && b.s.energy >= 2 && tools.includes('chart')) return decision('useTool', [tools.indexOf('chart')], '남은 에너지에 비해 손패의 해법이 부족해 카드를 뽑습니다. 결과 카드는 미리 읽지 않습니다.');
    if (action.type === 'play') {
      const d = b.definition(action.card, action.choice), enemy = enemies.find(e => e.id === action.target);
      if ((d.damage || d.areaDamage) && enemy && !enemy.exposure && tools.includes('flare') && enemy.hp > (d.damage || d.areaDamage) + 6)
        return decision('useTool', [tools.indexOf('flare'), enemy.id], '현재 선택한 공격을 준비하기 위해 살아 있는 대상에게 노출을 부여합니다.');
      return decision('play', [action.card, action.actor, action.target, action.choice], '현재 손패와 공개된 예고를 전투 자동 정책으로 평가해 카드·실행자·대상을 선택합니다.');
    }
    if (action.type === 'end') return decision('endRound', [], '현재 손패에서 유효한 추가 행동보다 라운드 종료를 선택합니다.');
    throw Error('알 수 없는 전투 자동 행동: ' + action.type);
  }
  function shopDecision(run, p) {
    const i = run.s.interlude, candidates = [], gold = run.s.gold;
    const add = (action, arg, score, reason) => candidates.push({ action, arg, score, reason });
    if (!i.healed && gold >= (i.prices.heal || 12) && (downed(run) || hpRatio(run) < p.healRatio))
      add('heal', undefined, 12 + (1 - hpRatio(run)) * 12 + (downed(run) ? 20 : 0), '상점에서 다친 동료를 회복하고 쓰러진 동료를 복귀시킵니다.');
    for (const kind of i.offers || []) {
      const price = i.cardPrices?.[kind] ?? i.prices.card;
      const value = rewardValue(run, kind, p);
      if (gold >= price && value > p.skip + .8) add('buy', kind, value - price * .09, '공개된 판매 카드 중 덱에 도움이 되는 카드를 구매합니다.');
    }
    for (const id of i.relics || []) if (gold >= i.prices.relic)
      add('relic', id, relicValue(run, id, p) - i.prices.relic * .08, '현재 덱과 어울리는 공개 판매 유물을 구매합니다.');
    if (run.s.tools && run.s.tools.length < 2) for (const id of i.tools || []) if (gold >= TOOLS[id].price) {
      const value = { medicine: (1 - hpRatio(run)) * 9 + 3, barrier: 4 * p.defense, muffler: 5 * p.defense, battery: 5 * p.attack, chart: 4, flare: 4 * p.attack }[id] || 0;
      add('tool', id, value - TOOLS[id].price * .12, '비어 있는 도구 칸에 전투용 소모품을 준비합니다.');
    }
    const removed = removal(run, p);
    if (!i.removed && removed && gold >= i.prices.remove && run.s.deck.length >= 11 && ['strike', 'guard'].includes(removed.item.kind))
      add('remove', removed.item.id, 4 - i.prices.remove * .07, '덱의 낮은 효율 기본 카드 한 장을 제거합니다.');
    const marked = enchant(run, i.enchants, p);
    if (marked && gold >= i.prices.enchant) add('enchant', marked.item, marked.value + 2 - i.prices.enchant * .06, '공개된 각인을 적용해 기존 카드의 역할을 개선합니다.');
    const choice = best(candidates, c => c.score);
    // Every purchase removes stock, spends positive gold or marks its one-shot
    // service. A new decision is recomputed after it; no shopping loop can repeat
    // the same operation without changing state.
    return choice && choice.value > .5 ? decision('chooseInterlude', [choice.item.action, choice.item.arg], choice.item.reason)
      : decision('chooseInterlude', ['continue'], '유효한 구매와 정비를 마쳐 다음 구역으로 출발합니다.');
  }
  function eventDecision(run, p) {
    const i = run.s.interlude, event = i.event, heal = downed(run) || hpRatio(run) < p.healRatio;
    const relic = best(i.relics || [], id => relicValue(run, id, p));
    if (event === 'wreck') return relic && hpRatio(run) > .35
      ? decision('chooseInterlude', ['event-relic', relic.item], '각 생존 동료의 체력 2를 지불해 공개된 유물을 얻습니다.')
      : decision('chooseInterlude', ['event-gold'], '현재 체력을 보존하고 기록 조각을 얻습니다.');
    if (event === 'pressure') return relic && p.elite >= 5 && hpRatio(run) > .65 && run.s.riskBattles === 0
      ? decision('chooseInterlude', ['event-relic', relic.item], '다음 두 전투의 시작 에너지 감소를 받아들이고 유물을 얻습니다.')
      : decision('chooseInterlude', ['event-gold'], '추가 전투 제약을 피하고 기록 조각을 얻습니다.');
    if (event === 'cache') return relic ? decision('chooseInterlude', ['event-relic', relic.item], '전투를 우회한 보물에서 현재 덱에 맞는 유물을 얻습니다.')
      : run.s.tools.length < 2 ? decision('chooseInterlude', ['event-tool'], '빈 도구 칸에 보급품과 기록 조각을 얻습니다.')
        : decision('chooseInterlude', ['continue'], '보관 가능한 보상이 없어 다음 구역으로 출발합니다.');
    if (event === 'beacon') {
      if (heal) return decision('chooseInterlude', ['heal'], '누적 피해를 회복하는 안전한 사건 선택을 합니다.');
      const marked = enchant(run, i.enchants, p);
      return marked ? decision('chooseInterlude', ['event-enchant', marked.item], '공개된 각인으로 선택한 카드 사본을 개선합니다.')
        : decision('chooseInterlude', ['heal'], '적합한 각인 대상이 없어 동료를 돌봅니다.');
    }
    if (event === 'shelter') {
      const improved = upgrade(run, p);
      return heal || !improved ? decision('chooseInterlude', ['heal'], '정박실에서 동료를 회복하고 쓰러진 동료를 복귀시킵니다.')
        : decision('chooseInterlude', ['upgrade', improved.item.id], '현재 덱에서 강화 이득이 큰 카드를 개선합니다.');
    }
    if (event === 'echo') {
      const clone = best(run.s.deck, c => rewardValue(run, c.kind, p) + (c.upgraded ? 1 : 0) + (c.enchant ? 1 : 0));
      if (clone && clone.value > 6 && run.s.gold >= 12 && run.s.deck.length < 18)
        return decision('chooseInterlude', ['event-clone', clone.item.id], '강화와 각인이 보존되는 유용한 카드 사본을 복제합니다.');
      return run.s.tools.length < 2 ? decision('chooseInterlude', ['event-tool'], '덱을 늘리는 대신 빈 도구 칸에 보급품을 얻습니다.')
        : decision('chooseInterlude', ['continue'], '복제와 도구 획득의 이득이 적어 사건을 지나갑니다.');
    }
    if (event === 'observatory') {
      const candidates = [];
      for (const card of run.s.deck) for (const kind of i.transform || []) {
        if (card.kind === kind) continue;
        const replacement = { ...card, kind };
        const unmarked = run.definition({ ...replacement, enchant: undefined });
        if (card.enchant && !ENCHANTS[card.enchant].test(unmarked)) continue;
        candidates.push({ card: card.id, kind, value: quality(run, replacement, p) - quality(run, card, p) });
      }
      const changed = best(candidates, c => c.value);
      return changed && changed.value > .2 ? decision('chooseInterlude', ['event-transform', { card: changed.item.card, kind: changed.item.kind }], '현재 카드와 공개된 교환 후보를 비교해 더 유용한 카드로 바꿉니다.')
        : decision('chooseInterlude', ['continue'], '현재 카드보다 나은 공개 교환 후보가 없어 유지합니다.');
    }
    throw Error('자동 정책에 등록되지 않은 사건: ' + event);
  }
  function interludeDecision(run, p) {
    const i = run.s.interlude;
    if (!i) throw Error('정비 단계에 장소 정보가 없습니다.');
    const voyage = Expedition.CONTENT_VERSIONS.includes(run.s.contentVersion);
    if (i.type === 'shop') return shopDecision(run, p);
    if (i.type === 'event' && voyage) return eventDecision(run, p);
    const improved = upgrade(run, p), needsHeal = downed(run) || hpRatio(run) < p.healRatio;
    if (i.type === 'seal') return improved ? decision('chooseInterlude', ['upgrade', improved.item.id], '정박지 인장으로 강화할 카드 사본을 고릅니다.')
      : decision('chooseInterlude', ['continue'], '강화할 카드가 없어 다음 구역으로 출발합니다.');
    if (!['camp', 'event'].includes(i.type)) throw Error('자동 정책에 등록되지 않은 장소: ' + i.type);
    if (needsHeal) return decision('chooseInterlude', ['heal'], '다음 전투의 생존을 위해 동료를 회복합니다.');
    if (i.type === 'event' && !voyage) {
      const learned = best(i.offers || [], kind => rewardValue(run, kind, p));
      if (learned && learned.value > p.skip) return decision('chooseInterlude', ['learn', learned.item], '공개된 기록 중 덱을 발전시키는 카드를 얻습니다.');
    }
    return improved ? decision('chooseInterlude', ['upgrade', improved.item.id], '현재 덱에서 강화 이득이 큰 카드 사본을 개선합니다.')
      : decision('chooseInterlude', ['continue'], '필요한 정비를 마쳐 다음 구역으로 출발합니다.');
  }
  function decide(run, options = {}) {
    if (!run?.s || typeof run.snapshot !== 'function') throw Error('유효한 원정 객체가 필요합니다.');
    const p = profile(options).weights, s = run.s;
    if (terminal(run)) return null;
    if (s.phase === 'battle') return combatDecision(run, p);
    if (s.phase === 'map') {
      const route = best(s.choices || [], r => routeValue(run, r, p));
      if (!route) throw Error('지도 단계에 연결된 공개 경로가 없습니다.');
      return decision('choosePath', [route.item.id], '현재 체력·덱·보상과 공개된 위협을 비교해 연결된 경로를 고릅니다.');
    }
    if (s.phase === 'blessing' || s.phase === 'relicreward') {
      const offer = best(s.phase === 'blessing' ? s.blessings : s.relicChoices, id => relicValue(run, id, p));
      if (!offer && s.phase === 'blessing') throw Error('출발 유물 후보가 없습니다.');
      return decision(s.phase === 'blessing' ? 'chooseBlessing' : 'chooseRelic', [offer?.item || null], '현재 덱과 파티에 맞는 공개 유물 후보를 선택합니다.');
    }
    if (s.phase === 'reward') {
      const offer = best(s.offers || [], kind => rewardValue(run, kind, p));
      if (!offer) throw Error('카드 보상 단계에 후보가 없습니다.');
      return offer.value >= p.skip ? decision('chooseReward', [offer.item], '현재 덱의 효율과 연계에 도움이 되는 공개 보상 카드를 얻습니다.')
        : decision('chooseReward', [null], '현재 덱에 비해 추가 카드의 이득이 적어 보상을 건너뜁니다.');
    }
    if (s.phase === 'patron') {
      const offers = (s.pacts || []).map((pact, index) => ({ ...pact, index })).filter(pact => pact.cost !== 'gold' || s.gold >= 10);
      const pact = best(offers, offered => {
        const price = offered.cost === 'gold' ? 2 : offered.cost === 'hp' ? (hpRatio(run) < .4 ? 12 : 3 * p.heal)
          : (hpRatio(run) < .6 ? 12 : 5 * p.risk);
        return relicValue(run, offered.id, p) - price;
      });
      return pact && pact.value > .5 ? decision('choosePact', [pact.item.index], '공개된 유물의 이득과 체력·재화·다음 전투 제약의 대가를 비교해 계약합니다.')
        : decision('choosePact', [null], '현재 상황에서는 계약의 대가가 커서 거절합니다.');
    }
    if (s.phase === 'interlude') return interludeDecision(run, p);
    throw Error('자동 정책에 등록되지 않은 원정 단계: ' + s.phase);
  }
  function step(run, options = {}) {
    const before = run.snapshot(), chosen = decide(run, options);
    if (!chosen) return { decision: null, before, after: copy(before), events: [] };
    if (typeof run[chosen.method] !== 'function') throw Error('원정 실행 메서드가 없습니다: ' + chosen.method);
    const oldBattle = run.battle, result = run[chosen.method](...chosen.args), after = run.snapshot();
    const events = before.phase === 'battle' && Array.isArray(result) ? copy(result)
      : run.battle && run.battle !== oldBattle ? copy(run.battle.s.events || []) : [];
    if (JSON.stringify(before) === JSON.stringify(after)) throw Error('자동 행동이 원정 상태를 변경하지 않았습니다: ' + chosen.method);
    return { decision: chosen, before, after, events };
  }
  const api = {
    decide, step, POLICY_VERSION, policies: Object.keys(PROFILES),
    metadata: { version: POLICY_VERSION, profiles: copy(PROFILES), combat: '기존 단일 행동 미리보기 + 공개 손패와 예고에 따른 도구 휴리스틱',
      limitations: ['카드·유물 점수와 정책 문턱은 학습하지 않은 초기 휴리스틱입니다.', '세 정책은 서로 독립적인 숙련 플레이어의 전략이 아닙니다.',
        '자동 승률과 카드 사용률은 해당 정책의 편향을 포함하며 사람의 재미와 난이도를 증명하지 않습니다.', '보상·상점 후보와 현재 손패 외의 미래 추첨 결과는 선택 근거로 사용하지 않습니다.'] }
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PartyExpeditionAutomation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
