'use strict';

const assert = require('node:assert/strict');
const { Battle, CARDS, ROLES } = require('./party-expedition-core.js');
const { Run } = require('./party-expedition-run.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const copy = value => JSON.parse(JSON.stringify(value));
const roleIds = ROLES.map(role => role.id);
function combinations(items, n) {
  if (!n) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), n - 1).map(rest => [item, ...rest]));
}
const parties = combinations(roleIds, 4);
const initialDeck = ['strike','strike','strike','strike','guard','guard','guard','guard','check','suppress']
  .map((kind, i) => ({ id: 'sample-' + i, kind, upgraded: false }));
function graphNode(view, id) { return view.nodes.find(node => node.id === id); }
function graphHasEdge(view, from, to) { return view.edges.some(edge => edge.from === from && edge.to === to); }
function assertLiveMap(run) {
  const view = run.mapView();
  assert.equal(new Set(view.nodes.map(node => node.id)).size, view.nodes.length);
  assert.deepEqual(view.trail.at(-1) || null, view.current);
  for (let i = 1; i < view.trail.length; i++) assert.ok(graphHasEdge(view, view.trail[i - 1], view.trail[i]), 'Visited rooms follow actual connecting edges.');
  if (run.s.phase === 'map') {
    assert.equal(view.available.length, run.s.choices.length);
    assert.deepEqual(new Set(view.available), new Set(run.s.choices.map(route => route.id)));
    for (const id of view.available) {
      const node = graphNode(view, id);
      assert.ok(node && node.route && node.floor === run.s.floor, 'A public choice is the current reachable combat room.');
      if (view.current) assert.ok(graphHasEdge(view, view.current, id), 'Next choices depend on the last visited service room.');
    }
  } else assert.deepEqual(view.available, [], 'Rooms cannot be entered while battle, reward or service is pending.');
  return view;
}
function availableRoute(run, wanted, fallback = 0) {
  const index = run.s.choices.findIndex(route => route.interlude === wanted);
  return index >= 0 ? index : Math.min(fallback, run.s.choices.length - 1);
}
// Captured from the pre-map v2 implementation, before graph generation existed.
// Keep the authored enemy/route values independent of the new route generator.
function legacyMapFixture() {
  const enemy = (name, pattern, hp, color) => ({ id:'f0-e0',name,pattern,hp,damage:6,areaDamage:2,toughnessMax:6,color });
  return {
    version:'expedition-run-2',phase:'map',floor:0,seed:216531249,initialSeed:803,
    party:['navigator','sounder','salvager','lightkeeper'],difficulty:'calm',breakMode:'off',gold:15,nextCard:10,
    deck:initialDeck.map((card, index) => ({ ...card,id:'r' + index })),
    allies:['navigator','sounder','salvager','lightkeeper'].map(id => ({ id,hp:30,max:30 })),
    choices:[
      { id:'f0-path0',name:'정박지 경유',description:'문지기 HP 24 / 전투 후 회복 / 카드 강화 / 제거',threat:'보호를 두른 뒤 강한 공격',enemies:[enemy('문지기','sentinel',24,'#deb874')],interlude:'camp' },
      { id:'f0-path1',name:'관측실 경유',description:'사냥꾼 HP 21 / 전투 후 기록 선택 / 회복 / 강화',threat:'대상을 바꾸는 집중 공격',enemies:[enemy('사냥꾼','hunter',21,'#f3a38f')],interlude:'event' }
    ],offers:[],interlude:null,route:null,history:[],actions:[],battlesWon:0,battle:null
  };
}
function fixture(extra = {}) {
  return new Battle({ party: ['navigator','sounder','salvager','lightkeeper'], deck: initialDeck,
    enemies: [{ id:'foe',name:'통합 검사용 적',hp:100,pattern:'hunter',damage:8 }],
    seed:719,breakMode:false,...extra });
}
function deck(kinds) { return kinds.map((kind, index) => ({ id: 'sample-' + index, kind, upgraded: false })); }
function setHand(battle, kinds) {
  const ids = Object.keys(battle.s.cards);
  const hand = [];
  for (const kind of kinds) {
    const id = ids.find(id => !hand.includes(id) && battle.s.cards[id].kind === kind);
    assert.ok(id, 'Fixture card exists: ' + kind); hand.push(id);
  }
  for (const zone of Object.keys(battle.s.zones)) battle.s.zones[zone] = [];
  battle.s.zones.hand = hand;
  battle.s.zones.draw = ids.filter(id => !hand.includes(id));
  battle.s.needsTrim = false;
  return hand;
}
function chooseTrimCard(battle) {
  // This policy only reads the currently visible hand/intent. It is a technical
  // interaction policy, not a recommended deck or a human fun measurement.
  const hasAttack = battle.s.intents.some(intent => ['attack','area'].includes(intent.type));
  return [...battle.s.zones.hand].sort((a, b) => {
    const worth = id => {
      const card = battle.definition(id);
      return (card.damage || card.areaDamage || 0) + (hasAttack ? (card.shield || card.allShield || 0) : 0)
        + (card.weak || 0) + (card.draw || 0) * 2 + (card.energy || 0) * 3 + (card.heal || 0) * .5;
    };
    return worth(a) - worth(b);
  })[0];
}
function legalActions(battle) {
  const result = [];
  for (const card of [...battle.s.zones.hand, 'basic']) {
    const definition = battle.definition(card);
    if (!definition) continue;
    const targets = definition.target === 'enemy' ? battle.s.enemies : battle.s.allies;
    for (const actor of battle.s.allies.filter(actor => actor.hp > 0)) {
      // Returned cards can cost less for one executor while retaining their printed cost.
      if (battle.costFor(card, actor.id) > battle.s.energy) continue;
      for (const target of targets.filter(target => target.hp > 0)) {
        try { battle.validate(card, actor.id, target.id); result.push([card, actor.id, target.id]); }
        catch (_) { /* Not an available action. */ }
      }
    }
  }
  return result;
}
function totalEnemyHP(state) { return state.enemies.reduce((sum, enemy) => sum + enemy.hp, 0); }
function nextEnemyPhase(state) {
  const battle = Battle.restore(state);
  if (battle.s.status === 'playing') battle.endRound();
  return battle.s;
}
function hpValue(state) {
  return state.allies.reduce((sum, ally) => sum + ally.hp + (ally.hp > 0 ? 24 : 0), 0);
}
function evaluate(battle, action, baseline) {
  const after = battle.preview(...action);
  const final = nextEnemyPhase(after);
  if (after.status === 'won') return 10000 + hpValue(after);
  const damage = totalEnemyHP(battle.s) - totalEnemyHP(after);
  const savedHP = hpValue(final) - hpValue(baseline);
  const kills = battle.s.enemies.filter(enemy => enemy.hp > 0).length - after.enemies.filter(enemy => enemy.hp > 0).length;
  const draw = after.zones.hand.length - battle.s.zones.hand.length + (action[0] === 'basic' ? 0 : 1);
  const reserve = after.zones.reserve.length - battle.s.zones.reserve.length;
  const weak = after.enemies.reduce((sum, enemy) => sum + enemy.weak, 0) - battle.s.enemies.reduce((sum, enemy) => sum + enemy.weak, 0);
  return damage * 1.25 + savedHP * 1.15 + kills * 6 + draw * 1.2 + reserve * 1.5 + weak * .25
    - (battle.s.energy - after.energy) * 2;
}
function chooseCombatAction(battle) {
  const baseline = nextEnemyPhase(battle.snapshot());
  let best = null, score = .05;
  for (const action of legalActions(battle)) {
    const value = evaluate(battle, action, baseline);
    if (value > score) { score = value; best = action; }
  }
  return best;
}
function winCurrentBattle(run) {
  let inputs = 0;
  while (run.s.phase === 'battle' && inputs++ < 160) {
    if (run.battle.s.needsTrim) { run.discardForSounder(chooseTrimCard(run.battle)); continue; }
    const action = chooseCombatAction(run.battle);
    if (action) run.play(...action); else run.endRound();
  }
  assert.ok(inputs < 160, 'Battle terminates within the technical sample budget.');
  assert.equal(run.battle.s.status, 'won');
}
function chooseRunReward(run) {
  const offers = run.s.offers || run.s.reward?.offers || [];
  assert.equal(offers.length, 3, 'Three distinct cards are offered before the last two fights.');
  const kinds = offers.map(offer => typeof offer === 'string' ? offer : offer.kind);
  assert.equal(new Set(kinds).size, 3);
  // Fixed preference serves technical completion, not a proposed player solution.
  const preference = ['riposte','bulwark','burst','suppress','relay','draw','strike'];
  const kind = preference.find(kind => kinds.includes(kind)) || kinds[0];
  run.chooseReward(kind);
}
function continueInterlude(run) {
  const room = run.s.interlude?.type || run.s.interlude;
  if (room === 'camp' || room === 'event') run.chooseInterlude('heal');
  else if (room === 'shop') {
    if (run.s.gold >= 12 && run.s.allies.some(ally => ally.hp < ally.max)) run.chooseInterlude('heal');
    run.chooseInterlude('continue');
  } else run.chooseInterlude('continue');
}
function finishRun(options, onPhase = () => {}) {
  const { path = 0, routePolicy = null, ...runOptions } = options;
  const run = new Run(runOptions);
  let actions = 0, lastFloor = -1;
  const seen = new Set(), entered = new Set();
  while (!['won','lost'].includes(run.s.phase) && actions++ < 1800) {
    const phaseKey = run.s.floor + '/' + run.s.phase;
    seen.add(run.s.phase);
    if (!entered.has(phaseKey)) { onPhase(run.s.phase, run); entered.add(phaseKey); }
    assertLiveMap(run);
    assert.ok(run.s.floor >= lastFloor, 'Run progress does not move backward.'); lastFloor = run.s.floor;
    if (run.s.phase === 'map') run.choosePath(routePolicy ? routePolicy(run) : Math.min(path, run.s.choices.length - 1));
    else if (run.s.phase === 'battle') {
      const before = run.battle.snapshot();
      if (run.battle.s.needsTrim) run.discardForSounder(chooseTrimCard(run.battle));
      else {
        const action = chooseCombatAction(run.battle);
        if (action) run.play(...action); else run.endRound();
      }
      assert.notDeepEqual(run.battle.snapshot(), before, 'A legal input advances battle state.');
    } else if (run.s.phase === 'reward') chooseRunReward(run);
    else if (run.s.phase === 'interlude') continueInterlude(run);
    else throw Error('Unknown run phase ' + run.s.phase);
  }
  assert.ok(actions < 1800, 'Run completes without an unbounded interaction loop.');
  return { run, actions, seen };
}

test('Six roles support all 15 four-person parties with the same shared cards', () => {
  assert.equal(roleIds.length, 6); assert.equal(parties.length, 15);
  for (const party of parties) {
    const battle = fixture({ party });
    assert.deepEqual(battle.s.allies.map(ally => ally.id), party);
    assert.equal(Object.keys(battle.s.cards).length, 10);
    if (battle.s.needsTrim) battle.discardForSounder(chooseTrimCard(battle));
    assert.ok(legalActions(battle).length > 0);
    const excluded = roleIds.find(id => !party.includes(id));
    const before = battle.snapshot();
    assert.throws(() => battle.play('basic', excluded, 'foe'));
    assert.deepEqual(battle.snapshot(), before);
  }
});

test('Forecasts, paid effects and RNG resume exactly from a mid-battle save', () => {
  const battle = fixture();
  const [strike, guard] = setHand(battle, ['strike','guard','strike','guard','suppress']);
  battle.play(strike, 'salvager', 'foe');
  const saved = battle.snapshot();
  const restored = Battle.restore(saved);
  const untouched = copy(saved);
  const predicted = restored.preview(guard, 'sounder', 'salvager');
  assert.deepEqual(restored.snapshot(), untouched);
  battle.play(guard, 'sounder', 'salvager'); restored.play(guard, 'sounder', 'salvager');
  assert.deepEqual(predicted, restored.snapshot());
  assert.deepEqual(battle.snapshot(), restored.snapshot());
  battle.endRound(); restored.endRound();
  assert.deepEqual(battle.snapshot(), restored.snapshot());
  assert.ok(battle.s.zones.hand.includes(strike), 'Reserved physical copy returns into the next hand.');
});

test('A currently announced dead target cancels instead of secretly retargeting', () => {
  const battle = fixture();
  if (battle.s.needsTrim) battle.discardForSounder(chooseTrimCard(battle));
  battle.s.intents = [{ actor:'foe',type:'attack',target:'salvager',damage:8 }];
  battle.actor('salvager').hp = 0;
  battle.actor('foe').weak = 4;
  const livingHP = battle.s.allies.filter(ally => ally.hp > 0).map(ally => [ally.id,ally.hp]);
  battle.endRound();
  for (const [id, hp] of livingHP) assert.equal(battle.actor(id).hp, hp);
  assert.equal(battle.actor('foe').weak, 4, 'Cancelled action does not consume next-attack weakening.');
  assert.ok(battle.s.intents.every(intent => intent.target !== 'salvager'), 'Next round announces a valid living target.');
});

test('Preparation preserves weakening while area attacks apply it to every living target', () => {
  const battle = fixture();
  if (battle.s.needsTrim) battle.discardForSounder(chooseTrimCard(battle));
  battle.actor('foe').weak = 4;
  battle.s.intents = [{ actor:'foe',type:'prepare',damage:0,nextDamage:8,nextTarget:'navigator' }];
  battle.endRound();
  assert.equal(battle.actor('foe').weak, 4);
  if (battle.s.needsTrim) battle.discardForSounder(chooseTrimCard(battle));
  battle.s.intents = [{ actor:'foe',type:'area',damage:7,target:null }];
  const hp = battle.s.allies.map(ally => ally.hp);
  battle.endRound();
  battle.s.allies.forEach((ally, i) => assert.equal(ally.hp, hp[i] - 3));
  assert.equal(battle.actor('foe').weak, 0);
  assert.ok(battle.s.allies.every(ally => ally.shield === 0));
});

test('Navigator paid-card memory ignores zero-cost and basic actions; eligibility survives them', () => {
  const battle = fixture({ deck: deck(['guard','jab','strike','strike','guard','suppress','draw','burst','guard','check']) });
  const [guard, jab, strike] = setHand(battle, ['guard','jab','strike','guard','suppress']);
  battle.play(guard, 'lightkeeper', 'lightkeeper');
  battle.play(jab, 'sounder', 'foe');
  assert.equal(battle.s.memory.actor, 'lightkeeper');
  assert.equal(battle.s.memoryAll.actor, 'sounder');
  assert.equal(battle.actor('sounder').ready, true);
  battle.play('basic', 'navigator', 'foe');
  assert.equal(battle.s.memory.actor, 'lightkeeper');
  assert.equal(battle.s.memoryAll.actor, 'sounder');
  assert.equal(battle.actor('navigator').ready, true);
  const info = battle.effectInfo(strike, 'navigator');
  assert.equal(info.damageBonus, 6); assert.equal(info.eligible, true);
  battle.play(strike, 'navigator', 'foe');
  assert.equal(battle.actor('foe').hp, 83); // 3 zero-cost + 2 basic + 6+2+4 navigator.
});

test('Dead previous executor blocks Navigator execution but not its distinct party passive', () => {
  const battle = fixture(); const [guard, strike] = setHand(battle, ['guard','strike','guard','strike','suppress']);
  battle.play(guard, 'lightkeeper', 'lightkeeper'); battle.actor('lightkeeper').hp = 0;
  const info = battle.effectInfo(strike, 'navigator');
  assert.equal(info.damageBonus, 2); assert.equal(info.eligible, false);
  battle.play(strike, 'navigator', 'foe');
  assert.equal(battle.actor('foe').hp, 92); assert.equal(battle.actor('navigator').ready, true);
});

test('Pilot uses printed cost for its passive and actual earlier paid energy for execution', () => {
  const battle = fixture({ party: ['navigator','pilot','salvager','lightkeeper'], deck: deck(['burst','guard','guard','strike','guard','strike','check','suppress','guard','strike']) });
  let [burst] = setHand(battle, ['burst','guard','guard','strike','check']);
  battle.play(burst, 'salvager', 'foe'); battle.endRound();
  assert.equal(battle.costFor(burst, 'pilot'), 1); assert.equal(battle.costFor(burst, 'salvager'), 2);
  const [, guard1, guard2] = setHand(battle, ['burst','guard','guard','strike','check']);
  battle.play(guard1, 'lightkeeper', 'lightkeeper'); battle.play(guard2, 'navigator', 'navigator');
  const info = battle.effectInfo(burst, 'pilot');
  assert.equal(info.printedCost, 2); assert.equal(info.actualCost, 1); assert.equal(info.damageBonus, 10);
  const saved = battle.snapshot(), preview = battle.preview(burst, 'pilot', 'foe');
  assert.deepEqual(battle.snapshot(), saved);
  battle.play(burst, 'pilot', 'foe'); assert.deepEqual(battle.snapshot(), preview);
  assert.equal(battle.actor('foe').hp, 60); // First15, later15+Navigator2+Pilot3+Pilot5.
  assert.equal(battle.s.energy, 1); assert.equal(battle.s.passiveReady.pilot, false);
  assert.equal(battle.s.salvageMarks[burst], undefined);
});

test('Pilot passive spends its chance on a qualifying control card and basic energy is not prior card spending', () => {
  const battle = fixture({ party: ['navigator','pilot','salvager','lightkeeper'],
    deck: deck(['guard','lockdown','strike','burst','guard','guard','strike','strike','check','suppress']) });
  const [guard, lockdown] = setHand(battle, ['guard','lockdown','strike','burst','guard']);
  battle.play('basic', 'pilot', 'foe');
  assert.equal(battle.s.paidEnergy, 0); assert.equal(battle.s.paidCardsPlayed, 0);
  assert.equal(battle.effectInfo(lockdown, 'pilot').pilotPassive, false);
  battle.play(guard, 'lightkeeper', 'lightkeeper');
  const info = battle.effectInfo(lockdown, 'salvager');
  assert.equal(info.pilotPassive, true); assert.equal(info.damageBonus, 0); assert.equal(info.shieldBonus, 0);
  battle.play(lockdown, 'salvager', 'foe');
  assert.equal(battle.s.passiveReady.pilot, false);
  assert.equal(battle.actor('pilot').ready, true);
});

test('Sounder exposes intentions before trimming, saves the pending choice and draws after its card', () => {
  const battle = fixture();
  assert.equal(battle.s.zones.hand.length, 6); assert.equal(battle.s.needsTrim, true); assert(battle.s.intents.length > 0);
  const saved = battle.snapshot();
  for (const action of [() => battle.play('basic','navigator','foe'), () => battle.endRound()]) {
    assert.throws(action); assert.deepEqual(battle.snapshot(), saved);
  }
  const restored = Battle.restore(saved), id = battle.s.zones.hand[0];
  restored.discardForSounder(id); battle.discardForSounder(id);
  assert.deepEqual(restored.snapshot(), battle.snapshot()); assert.equal(battle.s.zones.hand.length, 5);
  const observed = fixture({ deck: deck(['draw','strike','guard','guard','suppress','strike','strike','guard','guard','check']) });
  const [drawCard] = setHand(observed, ['draw','strike','guard','guard','suppress']);
  observed.play(drawCard, 'sounder', 'sounder');
  assert.equal(observed.s.zones.hand.length, 7); assert.equal(observed.s.events.filter(event => event.type === 'draw').length, 3);
  assert.equal(observed.s.needsTrim, false, 'Only round-start six-card observation mandates trimming.');
  assert(!observed.s.zones.hand.includes(drawCard), 'Resolving card cannot draw itself.');
});

test('Salvager does not lose eligibility on free or exhausted cards and its reservation outlives it', () => {
  const battle = fixture({ deck: deck(['focus','jab','mend','burst','guard','strike','guard','strike','guard','check']) });
  const [focus, jab, mend, burst] = setHand(battle, ['focus','jab','mend','burst','guard']);
  battle.actor('lightkeeper').hp = 20;
  battle.play(focus, 'salvager', 'salvager'); battle.play(jab, 'salvager', 'foe'); battle.play(mend, 'salvager', 'lightkeeper');
  assert.equal(battle.actor('salvager').ready, true); assert.equal(battle.s.zones.reserve.length, 0);
  battle.play(burst, 'salvager', 'foe'); assert(battle.s.zones.reserve.includes(burst));
  battle.actor('salvager').hp = 0; battle.endRound();
  assert(battle.s.zones.hand.includes(burst)); assert.equal(battle.costFor(burst, 'navigator'), 2, 'Dead Salvager grants no new discount.');
  assert.deepEqual(Battle.restore(battle.snapshot()).snapshot(), battle.snapshot());
});

test('Discarding a returned copy in Sounder selection expires its exact one-use handover mark', () => {
  const battle = fixture({ deck: deck(['burst','guard','strike','guard','strike','guard','strike','guard','check','suppress']) });
  const [burst] = setHand(battle, ['burst','guard','strike','guard','suppress']);
  battle.play(burst, 'salvager', 'foe'); battle.endRound();
  assert.equal(battle.s.needsTrim, true); assert.equal(battle.costFor(burst, 'navigator'), 1);
  battle.discardForSounder(burst);
  assert.equal(battle.s.salvageMarks[burst], undefined); assert(battle.s.zones.discard.includes(burst));
  assert.equal(battle.costFor(burst, 'navigator'), 2);
  assert.deepEqual(Battle.restore(battle.snapshot()).snapshot(), battle.snapshot());
});

test('Lightkeeper retains only one leftover shield up to four with roster tie order and alive checks', () => {
  const battle = fixture(); if (battle.s.needsTrim) battle.discardForSounder(chooseTrimCard(battle));
  battle.actor('navigator').shield = 6; battle.actor('sounder').shield = 6;
  battle.s.intents = [{ actor:'foe',type:'prepare',damage:0,nextTarget:'navigator',nextDamage:8 }];
  battle.endRound();
  assert.equal(battle.actor('navigator').shield, 4); assert.equal(battle.actor('sounder').shield, 0);
  assert.equal(battle.s.allies.reduce((sum, ally) => sum + ally.shield, 0), 4);
  assert.deepEqual(Battle.restore(battle.snapshot()).snapshot(), battle.snapshot());
  if (battle.s.needsTrim) battle.discardForSounder(chooseTrimCard(battle));
  battle.actor('navigator').shield += 6;
  battle.s.intents = [{ actor:'foe',type:'prepare',damage:0,nextTarget:'navigator',nextDamage:8 }];
  battle.endRound(); assert.equal(battle.actor('navigator').shield, 4, 'A later preservation cannot accumulate beyond four.');
  if (battle.s.needsTrim) battle.discardForSounder(chooseTrimCard(battle));
  battle.actor('lightkeeper').hp = 0; battle.actor('sounder').shield = 10;
  battle.s.intents = [{ actor:'foe',type:'prepare',damage:0,nextTarget:'navigator',nextDamage:8 }];
  battle.endRound(); assert(battle.s.allies.every(ally => ally.shield === 0));
});

test('Diver creates exposure and break after its hit and refunds the first actual exposure consumption only', () => {
  const battle = fixture({ party: ['navigator','diver','pilot','lightkeeper'], breakMode: true,
    deck: deck(['strike','strike','strike','expose','guard','guard','strike','suppress','check','guard']),
    enemies: [{ id:'foe',name:'균형 검사',hp:100,pattern:'hunter',damage:8,toughnessMax:2 }] });
  const [strike1, strike2, expose, strike3] = setHand(battle, ['strike','strike','expose','strike','guard']);
  battle.play(strike1, 'diver', 'foe');
  assert.equal(battle.actor('foe').hp, 94); assert.equal(battle.actor('foe').exposure, 4);
  assert.equal(battle.actor('foe').broken, true); assert.equal(battle.actor('foe').breakBonusArmed, true); assert.equal(battle.s.energy, 3);
  battle.play(strike2, 'lightkeeper', 'foe');
  assert.equal(battle.actor('foe').hp, 78); assert.equal(battle.s.energy, 3); assert.equal(battle.s.passiveReady.diver, false);
  battle.play(expose, 'navigator', 'foe'); battle.play(strike3, 'lightkeeper', 'foe');
  assert.equal(battle.actor('foe').hp, 57); assert.equal(battle.s.energy, 1);
  assert.equal(battle.actor('foe').exposure, 0); assert.equal(battle.actor('foe').breakBonusArmed, false);
});

const results = [];
test('All parties reach legal connected expedition results in both break modes', () => {
  for (const breakMode of ['off','on']) {
    for (let i = 0; i < parties.length; i++) {
      const result = finishRun({ seed:20261009,party:parties[i],difficulty:'normal',breakMode });
      results.push({ party:parties[i].join('/'),breakMode,result:result.run.s.phase,floor:result.run.s.floor,actions:result.actions });
      assert.ok(['won','lost'].includes(result.run.s.phase));
      if (result.run.s.phase === 'won') {
        assert.equal(result.run.s.floor, 7);
        assert.equal(result.run.s.battlesWon, 8);
        assert.ok(result.seen.has('reward') && result.seen.has('interlude'));
      } else assert.ok(result.run.s.allies.every(ally => ally.hp === 0), 'Only actual party defeat ends an expedition in loss.');
    }
  }
});

test('Every newly generated room is reachable from a start and can reach the boss', () => {
  for (const seed of [0,1,803,941,20261009,0xffffffff]) {
    const run = new Run({ seed });
    const view = assertLiveMap(run), ids = new Set(view.nodes.map(node => node.id));
    const bosses = view.nodes.filter(node => node.type === 'boss');
    assert.equal(bosses.length, 1); assert.equal(bosses[0].floor, 7);
    assert.equal(view.available.length, 3, 'First-floor lanes offer a genuine initial fork.');
    const reachable = new Set(['start']), queue = ['start'];
    for (let i = 0; i < queue.length; i++) {
      for (const edge of view.edges.filter(edge => edge.from === queue[i])) {
        assert(ids.has(edge.to));
        if (!reachable.has(edge.to)) { reachable.add(edge.to); queue.push(edge.to); }
      }
    }
    assert.equal(reachable.size, ids.size, 'New map generation has no decorative or unreachable rooms.');
    const reachesBoss = new Set([bosses[0].id]), backward = [bosses[0].id];
    for (let i = 0; i < backward.length; i++) {
      for (const edge of view.edges.filter(edge => edge.to === backward[i])) {
        if (!reachesBoss.has(edge.from)) { reachesBoss.add(edge.from); backward.push(edge.from); }
      }
    }
    assert.equal(reachesBoss.size, ids.size, 'Every chosen lane continues to the final fight.');
    for (const edge of view.edges) {
      const from = graphNode(view, edge.from), to = graphNode(view, edge.to);
      assert.ok(from && to && edge.from !== edge.to);
      assert(to.floor === from.floor || to.floor === from.floor + 1, 'Edges cannot skip a fight floor or travel backward.');
    }
    assert.ok(view.nodes.some(node => view.edges.filter(edge => edge.from === node.id).length > 1), 'Map includes a fork.');
    assert.ok(view.nodes.some(node => view.edges.filter(edge => edge.to === node.id).length > 1), 'Map includes a convergence.');
  }
});

test('Map view is read-only and unreachable node IDs cannot jump or backtrack', () => {
  const run = new Run({ seed:803,difficulty:'calm' });
  const first = assertLiveMap(run), untouched = run.snapshot();
  const far = first.nodes.find(node => node.floor > 1);
  assert.throws(() => run.choosePath(far.id)); assert.deepEqual(run.snapshot(), untouched);
  first.nodes[0].label = 'changed externally'; first.edges.length = 0; first.available.length = 0;
  if (first.nodes.find(node => node.route)) first.nodes.find(node => node.route).route.enemies[0].hp = 999;
  assert.deepEqual(run.snapshot(), untouched, 'View consumers cannot mutate graph, route enemies or live choices.');
  const chosen = run.mapView().available[0]; run.choosePath(chosen);
  const current = assertLiveMap(run); assert.equal(current.current, chosen);
  const pending = run.snapshot(); assert.throws(() => run.choosePath(chosen)); assert.deepEqual(run.snapshot(), pending);
  winCurrentBattle(run); run.chooseReward(null); continueInterlude(run);
  const next = assertLiveMap(run), saved = run.snapshot();
  assert.equal(run.s.floor, 1); assert.ok(next.available.length >= 1 && next.available.length <= 2);
  assert.throws(() => run.choosePath(chosen)); assert.deepEqual(run.snapshot(), saved);
  const disconnected = next.nodes.find(node => node.floor === 1 && node.route && !next.available.includes(node.id));
  assert.ok(disconnected, 'The chosen lane excludes at least one next-floor route.');
  assert.throws(() => run.choosePath(disconnected.id)); assert.deepEqual(run.snapshot(), saved);
  const restored = Run.restore(saved);
  assert.deepEqual(restored.mapView(), next);
  run.choosePath(next.available[0]); restored.choosePath(next.available[0]);
  assert.deepEqual(restored.snapshot(), run.snapshot());
});

test('A genuine mapless v2 save gains a map without changing active choices or random state', () => {
  const legacy = legacyMapFixture(), original = copy(legacy);
  const migrated = Run.restore(legacy);
  assert.deepEqual(legacy, original, 'Restoring cannot modify the caller-owned old snapshot.');
  const withoutMap = migrated.snapshot(); delete withoutMap.map;
  assert.deepEqual(withoutMap, original, 'Migration only adds the graph around existing public decisions.');
  const view = assertLiveMap(migrated);
  assert.deepEqual(view.available, original.choices.map(route => route.id));
  for (const route of original.choices) assert.deepEqual(graphNode(view, route.id).route, route);
  const second = Run.restore(original); migrated.choosePath(1); second.choosePath(original.choices[1].id);
  assert.deepEqual(migrated.snapshot(), second.snapshot(), 'Index and node selection preserve one identical old continuation.');
  const current = migrated.snapshot();
  assert.deepEqual(current.route, original.choices[1]);
  assert.equal(current.battle.enemies[0].hp, 21); assert.equal(current.battle.needsTrim, true);
});

test('A mapless active battle, reward and service retain their current content through migration', () => {
  const legacy = legacyMapFixture();
  legacy.phase = 'battle'; legacy.seed = 2500513174; legacy.route = copy(legacy.choices[1]);
  legacy.battle = new Battle({ party:legacy.party,deck:legacy.deck,allies:legacy.allies,enemies:legacy.route.enemies,seed:2500513174,breakMode:false }).snapshot();
  for (const phase of ['battle','reward','interlude']) {
    let source;
    if (phase === 'battle') source = copy(legacy);
    else {
      const advanced = Run.restore(legacy); winCurrentBattle(advanced);
      if (phase === 'interlude') advanced.chooseReward(null);
      source = advanced.snapshot(); delete source.map;
    }
    const original = copy(source), run = Run.restore(source), stripped = run.snapshot(); delete stripped.map;
    assert.deepEqual(source, original); assert.deepEqual(stripped, original, 'Exact active ' + phase + ' state remains intact.');
    assertLiveMap(run);
    const restored = Run.restore(run.snapshot()); assert.deepEqual(restored.snapshot(), run.snapshot());
    if (phase === 'battle') {
      const discard = chooseTrimCard(run.battle); run.discardForSounder(discard); restored.discardForSounder(discard);
    } else if (phase === 'reward') { run.chooseReward(null); restored.chooseReward(null); }
    else { run.chooseInterlude('heal'); restored.chooseInterlude('heal'); }
    assert.deepEqual(restored.snapshot(), run.snapshot(), 'Same input after migrating ' + phase + ' has exact results.');
  }
});

test('Invalid phase selections are atomic and do not alter route or reward RNG', () => {
  const run = new Run({ seed:941 });
  const before = run.snapshot();
  for (const action of [() => run.choosePath(99), () => run.chooseReward('burst'), () => run.chooseInterlude('heal')]) {
    assert.throws(action); assert.deepEqual(run.snapshot(), before);
  }
  run.choosePath(0);
  const battle = run.snapshot();
  for (const action of [() => run.choosePath(0), () => run.chooseReward(null), () => run.play('basic','missing',run.battle.s.enemies[0].id)]) {
    assert.throws(action); assert.deepEqual(run.snapshot(), battle);
  }
});

test('Skipping a reward and removing a chosen copy persists into the next battle', () => {
  const run = new Run({ seed:803,difficulty:'calm' });
  run.choosePath(availableRoute(run, 'camp')); winCurrentBattle(run);
  const before = run.snapshot();
  assert.throws(() => run.chooseReward('not-offered'));
  assert.deepEqual(run.snapshot(), before);
  run.chooseReward(null);
  assert.equal(run.s.deck.length, 10, 'Skipping does not silently replace or add a card.');
  const after = run.snapshot();
  assert.throws(() => run.chooseReward(null)); assert.deepEqual(run.snapshot(), after);
  const removed = run.s.deck.find(card => card.kind === 'guard').id;
  run.chooseInterlude('remove', removed);
  assert.equal(run.s.deck.length, 9);
  assert.ok(!run.s.deck.some(card => card.id === removed));
  const restored = Run.restore(run.snapshot());
  run.choosePath(0); restored.choosePath(0);
  assert.deepEqual(restored.snapshot(), run.snapshot());
  assert.equal(Object.keys(run.battle.s.cards).length, 9);
  assert.ok(!run.battle.s.cards[removed], 'Removed copy is not recreated by battle setup.');
});

test('A rewarded and upgraded physical copy retains its exact upgrade in later battle', () => {
  const run = new Run({ seed:804,difficulty:'calm' });
  run.choosePath(availableRoute(run, 'camp')); winCurrentBattle(run);
  const kind = run.s.offers[0];
  run.chooseReward(kind);
  const card = run.s.deck[run.s.deck.length - 1];
  const base = run.definition(card);
  run.chooseInterlude('upgrade', card.id);
  const definition = run.definition(card.id);
  assert.equal(definition.upgraded, true);
  assert.notEqual(definition.text, base.text);
  const snapshot = run.snapshot();
  const restored = Run.restore(snapshot);
  run.choosePath(0); restored.choosePath(0);
  assert.deepEqual(restored.snapshot(), run.snapshot());
  assert.equal(run.battle.s.cards[card.id].kind, kind);
  assert.equal(run.battle.definition(card.id).upgraded, true);
  assert.equal(run.battle.definition(card.id).text, definition.text);
  assert.equal(Object.keys(run.battle.s.cards).length, 11);
});

test('Map, battle, reward and interlude saves retain choices, HP and completed progress', () => {
  const phases = new Set();
  const result = finishRun({ seed:803,party:['navigator','sounder','salvager','lightkeeper'],difficulty:'calm',breakMode:'on' }, (phase, run) => {
    phases.add(phase);
    const snapshot = run.snapshot();
    const graph = assertLiveMap(run);
    const restored = Run.restore(snapshot);
    const expected = Run.restore(snapshot);
    assert.deepEqual(restored.snapshot(), snapshot, 'Exact restoration in ' + phase);
    assert.deepEqual(restored.mapView(), graph, 'Exact graph and selected trail restoration in ' + phase);
    if (phase === 'map') { expected.choosePath(0); restored.choosePath(0); }
    else if (phase === 'battle') {
      if (run.battle.s.needsTrim) { const id = chooseTrimCard(run.battle); expected.discardForSounder(id); restored.discardForSounder(id); }
      else {
        const action = chooseCombatAction(run.battle);
        if (action) { expected.play(...action); restored.play(...action); }
        else { expected.endRound(); restored.endRound(); }
      }
    } else if (phase === 'reward') { chooseRunReward(expected); chooseRunReward(restored); }
    else if (phase === 'interlude') { continueInterlude(expected); continueInterlude(restored); }
    assert.deepEqual(restored.snapshot(), expected.snapshot(), 'Same next input in ' + phase);
  });
  assert.equal(result.run.s.phase, 'won');
  assert.deepEqual([...phases].sort(), ['battle','interlude','map','reward']);
});

test('Alternate routes enter shop and event rooms and resume purchased state exactly', () => {
  const visited = new Set();
  const result = finishRun({ seed:803,party:['navigator','sounder','salvager','lightkeeper'],difficulty:'calm',breakMode:'off',routePolicy:run => availableRoute(run, run.s.floor % 2 ? 'shop' : 'event') }, (phase, run) => {
    if (phase !== 'interlude') return;
    const type = run.s.interlude.type;
    visited.add(type);
    const saved = run.snapshot();
    assert.deepEqual(Run.restore(saved).snapshot(), saved);
    if (type === 'shop') {
      const restored = Run.restore(saved);
      const kind = run.s.interlude.offers[0];
      if (run.s.gold >= 20) {
        const size = run.s.deck.length, gold = run.s.gold;
        run.chooseInterlude('buy', kind); restored.chooseInterlude('buy', kind);
        assert.equal(run.s.gold, gold - 20); assert.equal(run.s.deck.length, size + 1);
        assert.deepEqual(restored.snapshot(), run.snapshot());
        const after = run.snapshot();
        assert.throws(() => run.chooseInterlude('buy', kind));
        assert.deepEqual(run.snapshot(), after, 'A purchased shop offer cannot be purchased twice.');
      }
    }
  });
  assert.equal(result.run.s.phase, 'won');
  assert.ok(visited.has('shop') && visited.has('event'));
});

console.log('\nFull-run technical sample: ' + results.length + ' terminal runs; ' + results.filter(result => result.result === 'won').length + ' wins; ' + results.reduce((sum,result) => sum + result.actions, 0) + ' legal inputs.');
console.log(JSON.stringify(results));
console.log(passed + ' integration checks passed. This is not evidence of player fun or party balance.');
