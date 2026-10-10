'use strict';
const assert = require('node:assert/strict');
const { Battle, CARDS, ROLES } = require('./party-expedition-core.js');
let passed = 0;
function test(name, action) { action(); passed++; console.log('OK ' + name); }
const QUIET = ['diver', 'pilot', 'salvager', 'lightkeeper'];
const ORIGINAL = ['navigator', 'sounder', 'salvager', 'lightkeeper'];
function battle(kinds = ['strike', 'guard', 'check', 'suppress', 'draw'], options = {}) {
  return new Battle({ party: QUIET, deck: kinds.map((kind, index) => ({ id: 'c' + index, kind })), enemies: [{ id: 'enemy', name: '표적', hp: 100, pattern: 'hunter', damage: 12 }], ...options });
}
function focused(b, target = 'salvager', damage = 12) { b.s.intents = [{ actor: 'enemy', type: 'attack', target, damage }]; return b; }
function ordered(b, ids) {
  b.s.zones = { draw: Object.keys(b.s.cards).filter(id => !ids.includes(id)), hand: [...ids], resolving: [], discard: [], reserve: [], exhaust: [] };
  b.s.needsTrim = false; b.assert(); return b;
}
function trim(b, id) { if (b.s.needsTrim) b.discardForSounder(id || b.s.zones.hand.at(-1)); return b; }
function prep(b) { b.s.intents = [{ actor: 'enemy', type: 'prepare', damage: 0, target: null, nextType: 'attack', nextTarget: 'salvager', nextDamage: 12 }]; return b; }

test('six canonical profession IDs and names with original default party', () => {
  assert.deepEqual(ROLES.map(r => r.id), ['navigator', 'diver', 'pilot', 'sounder', 'salvager', 'lightkeeper']);
  assert.deepEqual(ROLES.map(r => r.name), ['항해사', '잠수자', '도선사', '측심사', '인양사', '등대지기']);
  assert.ok(ROLES.every(r => r.passive && r.execution && r.ability)); assert.deepEqual(new Battle().s.allies.map(a => a.id), ORIGINAL);
});
test('four distinct valid profession IDs required', () => {
  for (const party of [QUIET.slice(0, 3), ['diver', 'pilot', 'salvager', 'salvager'], ['anchor', 'chase', 'care', 'recall']]) assert.throws(() => battle(undefined, { party }));
});
test('one hundred unowned upgradeable cards and separated printed cost', () => {
  const b = battle(); assert.equal(Object.values(CARDS).filter(c => c.upgrade).length, 100); assert.ok(Object.values(b.s.cards).every(c => !('owner' in c)));
  assert.equal(b.definition('c0').printedCost, 1); assert.equal(b.definition('c0').cost, 1);
});
test('card uniqueness and basic cannot be physical copies', () => {
  assert.throws(() => battle(undefined, { deck: [{ id: 'x', kind: 'strike' }, { id: 'x', kind: 'guard' }] }));
  assert.throws(() => battle(undefined, { deck: [{ id: 'basic', kind: 'strike' }] })); assert.throws(() => battle(undefined, { deck: [{ id: 'x', kind: 'basic' }] }));
  const b = battle(), s = b.snapshot(); s.zones.discard.push(s.zones.hand[0]); assert.throws(() => Battle.restore(s));
});
test('start4 energy, recover2 and carry cap5', () => {
  const b = battle(); assert.equal(b.s.energy, 4); b.play('c0', 'lightkeeper', 'enemy'); b.endRound(); assert.equal(b.s.energy, 5); b.endRound(); assert.equal(b.s.energy, 5);
});
test('zero energy does not autoend and next round has two', () => {
  const b = battle(); for (const id of ['c0', 'c1', 'c2', 'c3']) b.play(id, 'lightkeeper', b.definition(id).target === 'enemy' ? 'enemy' : 'salvager');
  assert.equal(b.s.energy, 0); assert.equal(b.s.round, 1); b.endRound(); assert.equal(b.s.energy, 2);
});
test('invalid commands leave entire state unchanged', () => {
  const b = battle(), before = b.snapshot(); for (const args of [['c0', 'enemy', 'enemy'], ['c0', 'lightkeeper', 'salvager'], ['missing', 'lightkeeper', 'enemy']]) { assert.throws(() => b.play(...args)); assert.deepEqual(b.snapshot(), before); }
  b.s.energy = 0; const zero = b.snapshot(); assert.throws(() => b.play('c0', 'lightkeeper', 'enemy')); assert.deepEqual(b.snapshot(), zero);
});
test('dead executors and ally targets rejected atomically', () => {
  const b = battle(); b.actor('lightkeeper').hp = 0; const before = b.snapshot(); assert.throws(() => b.play('c0', 'lightkeeper', 'enemy')); assert.throws(() => b.play('c1', 'salvager', 'lightkeeper')); assert.deepEqual(b.snapshot(), before);
});
test('basic triggers no traits, memories, exposure or Break bonus', () => {
  const b = battle(undefined, { breakMode: true }), e = b.actor('enemy'); e.exposure = 4; e.toughness = 0; e.broken = true; e.breakBonusArmed = true;
  const zones = structuredClone(b.s.zones); b.play('basic', 'diver', 'enemy'); assert.equal(e.hp, 98); assert.equal(b.actor('diver').ready, true); assert.equal(e.exposure, 4); assert.equal(e.breakBonusArmed, true);
  assert.equal(b.s.memory, null); assert.equal(b.s.memoryAll, null); assert.equal(b.s.paidEnergy, 0); assert.deepEqual(b.s.zones, zones);
});
test('navigator initial unqualified card preserves execution', () => {
  const b = battle(undefined, { party: ORIGINAL }); b.play('c0', 'navigator', 'enemy'); assert.equal(b.actor('enemy').hp, 94); assert.equal(b.actor('navigator').ready, true);
});
test('navigator sustained +2 repeats for each switched paid attack', () => {
  const b = battle(['strike', 'strike', 'strike', 'strike', 'guard'], { party: ORIGINAL });
  b.play('c0', 'lightkeeper', 'enemy'); b.play('c1', 'sounder', 'enemy'); b.play('c2', 'lightkeeper', 'enemy'); b.play('c3', 'sounder', 'enemy'); assert.equal(b.actor('enemy').hp, 70);
});
test('navigator same executor receives no sustained bonus', () => {
  const b = battle(['strike', 'strike', 'guard', 'guard', 'guard'], { party: ORIGINAL }); b.play('c0', 'lightkeeper', 'enemy'); b.play('c1', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 88);
});
test('paid protection updates memory and enables navigator +2+4', () => {
  const b = battle(undefined, { party: ORIGINAL }); b.play('c1', 'lightkeeper', 'salvager'); assert.deepEqual(b.s.memory, { actor: 'lightkeeper', card: 'c1', cost: 1 });
  assert.equal(b.effectInfo('c0', 'navigator').damageBonus, 6); b.play('c0', 'navigator', 'enemy'); assert.equal(b.actor('enemy').hp, 88); assert.equal(b.actor('navigator').ready, false);
});
test('navigator nonattack shields lowest after base heal', () => {
  const b = battle(['strike', 'mend', 'guard', 'guard', 'guard'], { party: ORIGINAL, allies: [{ id: 'navigator', hp: 10 }, { id: 'sounder', hp: 12 }] });
  b.play('c0', 'lightkeeper', 'enemy'); b.play('c1', 'navigator', 'navigator'); assert.equal(b.actor('navigator').hp, 19); assert.equal(b.actor('sounder').shield, 4); assert.equal(b.actor('navigator').shield, 0);
});
test('navigator lowest HP tie follows roster', () => {
  const b = battle(undefined, { party: ORIGINAL }); b.play('c0', 'lightkeeper', 'enemy'); b.play('c1', 'navigator', 'salvager'); assert.equal(b.actor('navigator').shield, 4);
});
test('zero and basic preserve paid memory and navigator eligibility', () => {
  const b = battle(['guard', 'jab', 'strike', 'focus', 'guard'], { party: ORIGINAL }); b.play('c0', 'lightkeeper', 'salvager'); b.play('c1', 'navigator', 'enemy'); b.play('basic', 'navigator', 'enemy');
  assert.equal(b.actor('navigator').ready, true); assert.equal(b.s.memory.actor, 'lightkeeper'); b.play('c2', 'navigator', 'enemy'); assert.equal(b.actor('enemy').hp, 83);
});
test('dead navigator removes only new passive contributions', () => {
  const b = battle(['strike', 'strike', 'strike', 'guard', 'guard'], { party: ORIGINAL }); b.play('c0', 'lightkeeper', 'enemy'); b.play('c1', 'sounder', 'enemy'); b.actor('navigator').hp = 0; b.play('c2', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 80);
});
test('navigator execution requires previous executor alive', () => {
  const b = battle(undefined, { party: ORIGINAL }); b.play('c1', 'lightkeeper', 'salvager'); b.actor('lightkeeper').hp = 0; assert.equal(b.effectInfo('c0', 'navigator').eligible, false);
  b.play('c0', 'navigator', 'enemy'); assert.equal(b.actor('navigator').ready, true); assert.equal(b.actor('enemy').hp, 92);
});
test('diver eligibility survives ally and free cards', () => {
  const b = battle(['guard', 'jab', 'strike', 'strike', 'guard']); b.play('c0', 'diver', 'salvager'); b.play('c1', 'diver', 'enemy'); assert.equal(b.actor('diver').ready, true);
  b.play('c2', 'diver', 'enemy'); assert.equal(b.actor('enemy').hp, 91); assert.equal(b.actor('enemy').exposure, 4); assert.equal(b.actor('diver').ready, false);
});
test('diver exposure is post-hit and next ally hit refunds energy', () => {
  const b = battle(['strike', 'strike', 'guard', 'guard', 'guard']); b.play('c0', 'diver', 'enemy'); assert.equal(b.actor('enemy').hp, 94); assert.equal(b.s.energy, 3);
  b.play('c1', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 84); assert.equal(b.s.energy, 3); assert.equal(b.s.passiveReady.diver, false);
});
test('exposure refund once per round and reset next round', () => {
  const b = battle(['expose', 'strike', 'expose', 'strike', 'guard']); b.play('c0', 'lightkeeper', 'enemy'); b.play('c1', 'pilot', 'enemy'); assert.equal(b.s.energy, 3);
  b.play('c2', 'lightkeeper', 'enemy'); b.play('c3', 'pilot', 'enemy'); assert.equal(b.s.energy, 1); assert.equal(b.actor('enemy').exposure, 0); b.endRound(); assert.equal(b.s.passiveReady.diver, true);
});
test('dead diver existing exposure consumes without refund', () => {
  const b = battle(); b.actor('enemy').exposure = 4; b.actor('diver').hp = 0; b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 90); assert.equal(b.s.energy, 3);
});
test('free direct card consumes exposure with refund capped at five', () => {
  const b = battle(['jab', 'strike', 'guard', 'guard', 'guard']); b.actor('enemy').exposure = 4; b.s.energy = 5; b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 93); assert.equal(b.s.energy, 5); assert.equal(b.s.passiveReady.diver, false);
});
test('diver extra toughness once post-hit without retroactive Break bonus', () => {
  const b = battle(['strike', 'strike', 'guard', 'guard', 'guard'], { breakMode: true, enemies: [{ id: 'enemy', hp: 100, pattern: 'hunter', toughnessMax: 2 }] });
  const events = b.play('c0', 'diver', 'enemy'); assert.equal(b.actor('enemy').hp, 94); assert.equal(b.actor('enemy').toughness, 0); assert.equal(b.actor('enemy').breakBonusArmed, true); assert.equal(events.filter(e => e.type === 'break').length, 1);
  b.play('c1', 'diver', 'enemy'); assert.equal(b.actor('enemy').hp, 80); assert.equal(b.actor('enemy').exposure, 0);
});
test('diver killing target consumes eligibility but adds no state', () => {
  const b = battle(undefined, { breakMode: true, enemies: [{ id: 'enemy', hp: 6, pattern: 'hunter', toughnessMax: 2 }, { id: 'second', hp: 100, pattern: 'hunter' }] });
  b.play('c0', 'diver', 'enemy'); assert.equal(b.actor('diver').ready, false); assert.equal(b.actor('enemy').exposure, 0); assert.equal(b.actor('enemy').toughness, 2);
});
test('pilot sustain requires paid predecessor and works on any executor', () => {
  const b = battle(['guard', 'burst', 'guard', 'strike', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); assert.equal(b.effectInfo('c1', 'salvager').damageBonus, 3);
  b.play('c1', 'salvager', 'enemy'); assert.equal(b.actor('enemy').hp, 82); assert.equal(b.s.passiveReady.pilot, false);
});
test('pilot initial costly card preserves both chances', () => {
  const b = battle(['burst', 'guard', 'guard', 'strike', 'guard']); b.play('c0', 'pilot', 'enemy'); assert.equal(b.actor('enemy').hp, 85); assert.equal(b.s.passiveReady.pilot, true); assert.equal(b.actor('pilot').ready, true);
});
test('pilot sustain costly shield adds three to designated target', () => {
  const b = battle(['guard', 'fortress', 'guard', 'strike', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.play('c1', 'lightkeeper', 'salvager'); assert.equal(b.actor('salvager').shield, 23);
});
test('pilot costly pure control consumes passive opportunity', () => {
  const b = battle(['guard', 'lockdown', 'fortress', 'strike', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.play('c1', 'lightkeeper', 'enemy'); assert.equal(b.s.passiveReady.pilot, false);
  b.s.energy = 2; b.play('c2', 'lightkeeper', 'salvager'); assert.equal(b.actor('salvager').shield, 20);
});
test('pilot execution eligible on one-cost attack after prior payment two', () => {
  const b = battle(['guard', 'guard', 'strike', 'guard', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.play('c1', 'lightkeeper', 'salvager'); assert.equal(b.effectInfo('c2', 'pilot').eligible, true);
  b.play('c2', 'pilot', 'enemy'); assert.equal(b.actor('enemy').hp, 89); assert.equal(b.actor('pilot').ready, false);
});
test('pilot execution threshold evaluated BEFORE current cost payment', () => {
  const b = battle(['guard', 'burst', 'strike', 'guard', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.play('c1', 'pilot', 'enemy'); assert.equal(b.actor('enemy').hp, 82); assert.equal(b.actor('pilot').ready, true);
  b.play('c2', 'pilot', 'enemy'); assert.equal(b.actor('enemy').hp, 71); assert.equal(b.actor('pilot').ready, false);
});
test('pilot sustained three and execution five stack on first hit', () => {
  const b = battle(['guard', 'guard', 'burst', 'strike', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.play('c1', 'lightkeeper', 'salvager'); b.play('c2', 'pilot', 'enemy'); assert.equal(b.actor('enemy').hp, 77);
});
test('pilot nonattack execution adds self five independently of target', () => {
  const b = battle(['guard', 'guard', 'guard', 'strike', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.play('c1', 'lightkeeper', 'salvager'); b.play('c2', 'pilot', 'diver'); assert.equal(b.actor('diver').shield, 6); assert.equal(b.actor('pilot').shield, 5);
});
test('dead pilot removes new sustained bonus', () => {
  const b = battle(['guard', 'burst', 'guard', 'strike', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.actor('pilot').hp = 0; b.play('c1', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 85);
});
test('sounder six cards and public intents precede mandatory chosen discard', () => {
  const b = new Battle(); assert.equal(b.s.zones.hand.length, 6); assert.equal(b.s.needsTrim, true); assert.equal(b.s.intents.length, 1);
  const before = b.snapshot(), id = b.s.zones.hand[0]; assert.throws(() => b.play(id, 'lightkeeper', b.definition(id).target === 'enemy' ? b.s.enemies[0].id : 'salvager')); assert.throws(() => b.endRound()); assert.deepEqual(b.snapshot(), before);
  b.discardForSounder(id); assert.equal(b.s.zones.hand.length, 5); assert.equal(b.s.needsTrim, false); assert.ok(b.s.zones.discard.includes(id));
});
test('sounder fewer than six available needs no selection', () => {
  const b = battle(undefined, { party: ORIGINAL }); assert.equal(b.s.zones.hand.length, 5); assert.equal(b.s.needsTrim, false); assert.throws(() => b.discardForSounder('c0'));
});
test('sounder first paid card draws one only once', () => {
  const b = ordered(battle(['strike', 'guard', 'guard', 'guard', 'guard', 'strike', 'guard'], { party: ORIGINAL }), ['c0', 'c1', 'c2', 'c3', 'c4']);
  b.play('c0', 'sounder', 'enemy'); assert.equal(b.s.zones.hand.length, 5); assert.ok(b.s.zones.hand.includes('c5')); assert.equal(b.actor('sounder').ready, false);
  b.play('c1', 'sounder', 'salvager'); assert.equal(b.s.zones.hand.length, 4);
});
test('sounder free card does not consume first paid draw chance', () => {
  const b = battle(['jab', 'strike', 'guard', 'guard', 'guard'], { party: ORIGINAL }); b.play('c0', 'sounder', 'enemy'); assert.equal(b.actor('sounder').ready, true); b.play('c1', 'sounder', 'enemy'); assert.equal(b.actor('sounder').ready, false);
});
test('sounder base draw then trait draw may exceed five without new trim', () => {
  const b = ordered(battle(['draw', 'strike', 'guard', 'guard', 'guard', 'strike', 'guard', 'strike'], { party: ORIGINAL }), ['c0', 'c1', 'c2', 'c3', 'c4']);
  b.play('c0', 'sounder', 'salvager'); assert.equal(b.s.zones.hand.length, 7); assert.equal(b.s.needsTrim, false); assert.ok(!b.s.zones.hand.includes('c0')); b.assert();
});
test('dead sounder starts with five and no trim phase', () => {
  const b = new Battle({ allies: [{ id: 'sounder', hp: 0 }] }); assert.equal(b.s.zones.hand.length, 5); assert.equal(b.s.needsTrim, false);
});
test('sounder pending trim and public intentions restore exactly', () => {
  const b = new Battle(), restored = Battle.restore(b.snapshot()); assert.equal(restored.s.needsTrim, true); const id = b.s.zones.hand[0]; b.discardForSounder(id); restored.discardForSounder(id); assert.deepEqual(restored.snapshot(), b.snapshot());
});
test('salvager reserves real copy then returns with same ID and mark', () => {
  const b = battle(); b.play('c0', 'salvager', 'enemy'); assert.deepEqual(b.s.zones.reserve, ['c0']); assert.deepEqual(b.s.salvageMarks.c0, { actor: 'salvager', returnedRound: null });
  b.endRound(); assert.ok(b.s.zones.hand.includes('c0')); assert.equal(b.s.salvageMarks.c0.returnedRound, 2); assert.equal(b.s.zones.hand.length, 5); b.assert();
});
test('returned costly copy discounts another actor actual payment only', () => {
  const b = battle(['burst', 'guard', 'guard', 'guard', 'guard']); b.play('c0', 'salvager', 'enemy'); b.endRound(); assert.equal(b.definition('c0').cost, 2); assert.equal(b.definition('c0').printedCost, 2);
  assert.equal(b.costFor('c0', 'salvager'), 2); assert.equal(b.costFor('c0', 'lightkeeper'), 1); b.s.energy = 1; b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.s.energy, 0); assert.equal(b.s.salvageMarks.c0, undefined);
});
test('salvager discount minimum remains one', () => {
  const b = battle(); b.play('c0', 'salvager', 'enemy'); b.endRound(); assert.equal(b.costFor('c0', 'lightkeeper'), 1);
});
test('pilot printed-cost trigger uses discounted actual-cost accounting', () => {
  const b = battle(['burst', 'guard', 'guard', 'guard', 'guard']); b.play('c0', 'salvager', 'enemy'); b.endRound(); b.play('c1', 'lightkeeper', 'salvager');
  assert.equal(b.effectInfo('c0', 'pilot').pilotPassive, true); assert.equal(b.effectInfo('c0', 'pilot').eligible, false); const hp = b.actor('enemy').hp, energy = b.s.energy;
  b.play('c0', 'pilot', 'enemy'); assert.equal(b.actor('enemy').hp, hp - 18); assert.equal(b.s.energy, energy - 1); assert.equal(b.s.paidEnergy, 2);
});
test('unplayed returned card expires discount at turn end', () => {
  const b = battle(['burst', 'guard', 'guard', 'guard', 'guard']); b.play('c0', 'salvager', 'enemy'); b.endRound(); b.endRound(); assert.equal(b.s.salvageMarks.c0, undefined); assert.equal(b.costFor('c0', 'lightkeeper'), 2);
});
test('sounder trim of returned reservation removes its discount', () => {
  const b = trim(new Battle()), id = b.s.zones.hand.find(card => !b.definition(card).exhaust); b.play(id, 'salvager', b.definition(id).target === 'enemy' ? b.s.enemies[0].id : 'lightkeeper');
  b.endRound(); assert.equal(b.s.needsTrim, true); assert.ok(b.s.salvageMarks[id]); b.discardForSounder(id); assert.equal(b.s.salvageMarks[id], undefined);
});
test('salvager free and exhaust preserve execution opportunity', () => {
  const b = battle(['focus', 'mend', 'strike', 'guard', 'guard']); b.play('c0', 'salvager', 'salvager'); assert.equal(b.actor('salvager').ready, true);
  b.play('c1', 'salvager', 'salvager'); assert.equal(b.actor('salvager').ready, true); assert.ok(b.s.zones.exhaust.includes('c1')); b.play('c2', 'salvager', 'enemy'); assert.equal(b.actor('salvager').ready, false); assert.deepEqual(b.s.zones.reserve, ['c2']);
});
test('dead salvager does not destroy reserved copy but prevents discount', () => {
  const b = focused(battle(['burst', 'guard', 'guard', 'guard', 'guard'])); b.actor('salvager').hp = 1; b.play('c0', 'salvager', 'enemy'); b.endRound();
  assert.equal(b.actor('salvager').hp, 0); assert.ok(b.s.zones.hand.includes('c0')); assert.equal(b.costFor('c0', 'lightkeeper'), 2);
});
test('native reservations create no salvager discount ownership', () => {
  const b = battle(['echo', 'hold', 'guard', 'guard', 'guard']); b.play('c0', 'lightkeeper', 'enemy'); b.play('c1', 'lightkeeper', 'salvager'); b.endRound(); assert.ok(b.s.zones.hand.includes('c0')); assert.ok(b.s.zones.hand.includes('c1')); assert.equal(b.costFor('c0', 'pilot'), 2); assert.equal(Object.keys(b.s.salvageMarks).length, 0);
});
test('salvager marks and legal discounts round-trip save exactly', () => {
  const b = battle(['burst', 'guard', 'guard', 'guard', 'guard']); b.play('c0', 'salvager', 'enemy'); b.endRound(); const restored = Battle.restore(b.snapshot()); b.play('c0', 'lightkeeper', 'enemy'); restored.play('c0', 'lightkeeper', 'enemy'); assert.deepEqual(restored.snapshot(), b.snapshot());
});
test('lightkeeper first paid card self shields four once', () => {
  const b = battle(); b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.actor('lightkeeper').shield, 4); b.play('c1', 'lightkeeper', 'salvager'); assert.equal(b.actor('lightkeeper').shield, 4);
});
test('lightkeeper free and basic preserve execution shield chance', () => {
  const b = battle(['focus', 'strike', 'guard', 'guard', 'guard']); b.play('c0', 'lightkeeper', 'salvager'); b.play('basic', 'lightkeeper', 'enemy'); assert.equal(b.actor('lightkeeper').ready, true); assert.equal(b.actor('lightkeeper').shield, 0);
});
test('lightkeeper largest remaining shield carry caps four on one ally', () => {
  const b = prep(battle()); b.actor('diver').shield = 11; b.actor('pilot').shield = 8; b.endRound(); assert.deepEqual(b.s.allies.map(a => a.shield), [4, 0, 0, 0]);
});
test('lightkeeper carry ties follow party order', () => {
  const b = prep(battle()); b.actor('pilot').shield = 3; b.actor('salvager').shield = 3; b.endRound(); assert.deepEqual(b.s.allies.map(a => a.shield), [0, 3, 0, 0]);
});
test('lightkeeper carry considers remaining shields AFTER damage', () => {
  const b = focused(battle(), 'diver', 12); b.actor('diver').shield = 10; b.actor('pilot').shield = 7; b.actor('salvager').hp = 0; b.actor('salvager').shield = 20;
  b.endRound(); assert.equal(b.actor('diver').shield, 0); assert.equal(b.actor('pilot').shield, 4); assert.equal(b.actor('salvager').shield, 0);
});
test('dead lightkeeper creates no new shield carry', () => {
  const b = prep(battle()); b.actor('lightkeeper').hp = 0; b.actor('diver').shield = 10; b.endRound(); assert.ok(b.s.allies.every(a => a.shield === 0));
});
test('lightkeeper protection cannot accumulate beyond carried cap', () => {
  const b = prep(battle()); b.actor('diver').shield = 12; b.endRound(); assert.equal(b.actor('diver').shield, 4); prep(b); b.actor('diver').shield += 10; b.endRound(); assert.equal(b.actor('diver').shield, 4);
});
test('Break OFF ignores toughness but keeps diver exposure', () => {
  const b = battle(undefined, { breakMode: false }); b.play('c0', 'diver', 'enemy'); assert.equal(b.actor('enemy').toughness, 5); assert.equal(b.actor('enemy').exposure, 4);
});
test('unbroken toughness persists and broken toughness recovers', () => {
  const b = battle(undefined, { breakMode: true }); b.play('c0', 'lightkeeper', 'enemy'); b.endRound(); assert.equal(b.actor('enemy').toughness, 4);
  b.actor('enemy').toughness = 1; b.play('c3', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').broken, true); b.endRound(); assert.equal(b.actor('enemy').toughness, 5); assert.equal(b.actor('enemy').broken, false);
});
test('weak then Break then protection shares intent/actual damage rules', () => {
  const b = focused(battle(['suppress', 'guard', 'strike', 'guard', 'guard'], { breakMode: true, enemies: [{ id: 'enemy', hp: 100, pattern: 'hunter', damage: 12, toughnessMax: 1 }] }));
  b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.intentDamage(b.s.intents[0]), 4); b.play('c1', 'lightkeeper', 'salvager'); b.endRound(); assert.equal(b.actor('salvager').hp, 30);
});
test('preparation does not consume weak and publishes next exact attack', () => {
  const b = battle(); b.endRound(); const prepared = structuredClone(b.s.intents[0]); assert.equal(prepared.type, 'prepare'); b.play('c3', 'lightkeeper', 'enemy'); b.endRound(); assert.equal(b.actor('enemy').weak, 4); assert.equal(b.s.intents[0].damage, prepared.nextDamage); assert.equal(b.s.intents[0].target, prepared.nextTarget);
});
test('dead fixed target cancels attack and preserves weak', () => {
  const b = focused(battle()); b.actor('salvager').hp = 0; b.actor('enemy').weak = 4; const hp = b.s.allies.map(a => a.hp); b.endRound(); assert.deepEqual(b.s.allies.map(a => a.hp), hp); assert.equal(b.actor('enemy').weak, 4);
});
test('newly created Break bonus cannot be used by same card', () => {
  const b = battle(['strike', 'strike', 'guard', 'guard', 'guard'], { breakMode: true, enemies: [{ id: 'enemy', hp: 100, pattern: 'hunter', toughnessMax: 1 }] });
  b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 94); assert.equal(b.actor('enemy').breakBonusArmed, true); b.play('c1', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 84); assert.equal(b.actor('enemy').breakBonusArmed, false);
});
test('navigator exposure and Break all stack on first direct hit', () => {
  const b = battle(['guard', 'strike', 'guard', 'guard', 'guard'], { party: ORIGINAL, breakMode: true }); b.play('c0', 'lightkeeper', 'salvager'); const e = b.actor('enemy'); e.exposure = 4; e.toughness = 0; e.broken = true; e.breakBonusArmed = true;
  b.play('c1', 'navigator', 'enemy'); assert.equal(e.hp, 80); assert.equal(e.exposure, 0); assert.equal(e.breakBonusArmed, false);
});
test('area bonuses exposure and Break affect only primary first hit', () => {
  const b = battle(['guard', 'sweep', 'guard', 'guard', 'guard'], { party: ORIGINAL, breakMode: true, enemies: [{ id: 'enemy', hp: 100, pattern: 'hunter' }, { id: 'second', hp: 100, pattern: 'sweep' }] }); b.play('c0', 'lightkeeper', 'salvager');
  for (const e of b.s.enemies) { e.exposure = 4; e.toughness = 0; e.broken = true; e.breakBonusArmed = true; }
  b.play('c1', 'navigator', 'enemy'); assert.equal(b.actor('enemy').hp, 81); assert.equal(b.actor('second').hp, 95); assert.equal(b.actor('second').exposure, 4); assert.equal(b.actor('second').breakBonusArmed, true);
});
test('area toughness reduces primary once and no secondary target', () => {
  const b = battle(['sweep', 'guard', 'guard', 'guard', 'guard'], { breakMode: true, enemies: [{ id: 'enemy', hp: 100, pattern: 'hunter' }, { id: 'second', hp: 100, pattern: 'sweep' }] });
  b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').toughness, 4); assert.equal(b.actor('second').toughness, 5);
});
test('enemy area hits all allies before counter defeats source', () => {
  const b = battle(['riposte', 'guard', 'strike', 'guard', 'guard'], { enemies: [{ id: 'enemy', hp: 6, pattern: 'sweep', areaDamage: 3 }] }); b.play('c0', 'diver', 'diver'); const events = b.endRound();
  assert.equal(b.s.status, 'won'); assert.deepEqual(b.s.allies.map(a => a.hp), [30, 27, 27, 27]); const response = events.findIndex(e => e.type === 'reaction'); assert.equal(events.slice(0, response).filter(e => e.type === 'damage' && e.source === 'enemy').length, 4);
});
test('area deaths settle before counters and simultaneous wipe loses', () => {
  const b = battle(['riposte', 'guard', 'strike', 'guard', 'guard'], { enemies: [{ id: 'enemy', hp: 6, pattern: 'sweep', areaDamage: 12 }] }); b.s.allies.forEach(a => { a.hp = 1; }); b.play('c0', 'diver', 'diver'); const events = b.endRound(); assert.equal(b.s.status, 'lost'); assert.ok(!events.some(e => e.type === 'reaction')); assert.equal(b.actor('enemy').hp, 6);
});
test('reaction needs actual absorption and survival', () => {
  const b = focused(battle(['riposte', 'guard', 'strike', 'guard', 'guard'])); b.play('c0', 'diver', 'salvager'); assert.equal(b.endRound().filter(e => e.type === 'reaction').length, 1); assert.equal(b.actor('enemy').hp, 94);
  const zero = focused(battle(['riposte', 'guard', 'strike', 'guard', 'guard']), 'salvager', 0); zero.play('c0', 'diver', 'salvager'); assert.ok(!zero.endRound().some(e => e.type === 'reaction'));
});
test('reaction does not consume exposure or Break or trigger refund', () => {
  const b = focused(battle(['riposte', 'guard', 'strike', 'guard', 'guard'], { breakMode: true })), e = b.actor('enemy'); e.exposure = 4; e.toughness = 0; e.broken = true; e.breakBonusArmed = true;
  b.play('c0', 'diver', 'salvager'); const events = b.endRound(); assert.equal(e.hp, 94); assert.equal(e.exposure, 4); assert.ok(!events.some(e => e.type === 'exposure-consumed' || e.type === 'break-bonus'));
});
test('draw cannot redraw resolving physical card', () => {
  const b = battle(['draw', 'strike']); b.play('c1', 'lightkeeper', 'enemy'); b.play('c0', 'pilot', 'pilot'); assert.deepEqual(b.s.zones.hand, ['c1']); assert.deepEqual(b.s.zones.discard, ['c0']);
});
test('focus works at zero energy and caps at five', () => {
  const b = battle(['focus', 'focus', 'strike', 'guard', 'guard']); b.s.energy = 0; b.play('c0', 'lightkeeper', 'salvager'); assert.equal(b.s.energy, 1); b.s.energy = 5; b.play('c1', 'lightkeeper', 'salvager'); assert.equal(b.s.energy, 5);
});
test('healing caps at max HP and never resurrects', () => {
  const b = battle(['mend', 'strike', 'guard', 'guard', 'guard']); b.actor('pilot').hp = 28; b.play('c0', 'lightkeeper', 'pilot'); assert.equal(b.actor('pilot').hp, 30);
});
test('retrieval gets latest discard before drawing and never itself', () => {
  const b = battle(['salvage', 'strike', 'guard']); b.play('c1', 'lightkeeper', 'enemy'); b.play('c0', 'pilot', 'pilot'); assert.deepEqual(b.s.zones.hand.sort(), ['c1', 'c2']); assert.deepEqual(b.s.zones.discard, ['c0']);
});
test('penetration keeps target shield while damaging HP', () => {
  const b = battle(['impale', 'strike', 'guard', 'guard', 'guard']); b.actor('enemy').shield = 20; b.play('c0', 'lightkeeper', 'enemy'); assert.equal(b.actor('enemy').hp, 89); assert.equal(b.actor('enemy').shield, 20);
});
test('upgrades belong to specific copy and preserve printed cost', () => {
  const b = battle(['strike', 'strike', 'guard', 'guard', 'guard']); b.s.cards.c0.upgraded = true; assert.equal(b.definition('c0').damage, 9); assert.equal(b.definition('c1').damage, 6); assert.equal(b.definition('c0').name, '타격+'); assert.equal(b.definition('c0').printedCost, 1);
});
test('preview equals actual discounted pilot execution with no source change', () => {
  const b = battle(['burst', 'guard', 'guard', 'strike', 'guard']); b.play('c0', 'salvager', 'enemy'); b.endRound(); b.play('c1', 'lightkeeper', 'salvager'); const before = b.snapshot(), expected = b.preview('c0', 'pilot', 'enemy');
  assert.deepEqual(b.snapshot(), before); b.play('c0', 'pilot', 'enemy'); assert.deepEqual(b.snapshot(), expected);
});
test('old combat version rejected and current version roundtrips', () => {
  const b = battle(), old = b.snapshot(); old.version = 'expedition-combat-1'; assert.throws(() => Battle.restore(old)); assert.deepEqual(Battle.restore(b.snapshot()).snapshot(), b.snapshot());
});
test('malformed profession counters memories marks and trim rejected', () => {
  const b = battle(); for (const alter of [s => { s.paidCardsPlayed = -1; }, s => { s.passiveReady.pilot = 'yes'; }, s => { s.memory = { actor: 'unknown', card: 'c0', cost: 1 }; }, s => { s.salvageMarks.c0 = { actor: 'salvager', returnedRound: null }; }, s => { s.needsTrim = true; }, s => { s.energy = 6; }]) { const invalid = b.snapshot(); alter(invalid); assert.throws(() => Battle.restore(invalid)); }
});
test('same seed and actions including trim reproduce full state', () => {
  const left = new Battle(), right = new Battle(); for (let round = 0; round < 5 && left.s.status === 'playing'; round++) { trim(left, left.s.zones.hand[0]); trim(right, right.s.zones.hand[0]); left.endRound(); right.endRound(); assert.deepEqual(left.snapshot(), right.snapshot()); }
});
test('terminal battles reject extra commands atomically', () => {
  const b = battle(undefined, { enemies: [{ id: 'enemy', hp: 6, pattern: 'hunter' }] }); b.play('c0', 'lightkeeper', 'enemy'); const before = b.snapshot(); assert.throws(() => b.endRound()); assert.throws(() => b.play('c1', 'pilot', 'salvager')); assert.deepEqual(b.snapshot(), before);
});
test('all hundred kinds, choices and upgrades execute save with card-zone integrity', () => {
  for (const [kind, definition] of Object.entries(CARDS)) {
    if (kind === 'basic') continue;
    for (const upgraded of [false, true]) for(const choice of definition.choices?definition.choices.map((_,i)=>i):[undefined]){ const b = battle([kind, 'strike', 'guard', 'guard', 'guard']); b.s.cards.c0.upgraded = upgraded;const d=b.definition('c0',choice); b.play('c0', 'lightkeeper', d.target === 'enemy' ? 'enemy' : 'salvager',choice); b.assert(); Battle.restore(b.snapshot()).assert(); }
  }
});
console.log('PASS ' + passed + ' expedition combat checks');
