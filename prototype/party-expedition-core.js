(function (root) {
  'use strict';

  // Cards are common actions. No physical card is owned by a party member.
  const CARDS = {
    strike: { name: '타격', cost: 1, target: 'enemy', damage: 6, breakPower: 1, icon: '✦', category: '공격', text: '피해 6', upgrade: { damage: 9, text: '피해 9' } },
    guard: { name: '보호', cost: 1, target: 'ally', shield: 6, icon: '◇', category: '보호', text: '보호 6', upgrade: { shield: 9, text: '보호 9' } },
    check: { name: '견제', cost: 1, target: 'enemy', damage: 4, selfShield: 2, breakPower: 1, icon: '↗', category: '혼합', text: '피해 4 · 자신 보호 2', upgrade: { damage: 6, selfShield: 4, text: '피해 6 · 자신 보호 4' } },
    suppress: { name: '억제', cost: 1, target: 'enemy', weak: 4, breakPower: 1, icon: '≋', category: '제어', text: '다음 공격의 피해 −4', upgrade: { weak: 6, text: '다음 공격의 피해 −6' } },
    burst: { name: '돌파', cost: 2, target: 'enemy', damage: 15, breakPower: 2, icon: '✧', category: '공격', text: '피해 15', upgrade: { damage: 20, text: '피해 20' } },
    draw: { name: '정리', cost: 1, target: 'ally', draw: 2, icon: '▱', category: '순환', text: '카드 2장 뽑기', upgrade: { draw: 3, text: '카드 3장 뽑기' } },
    jab: { name: '틈새', cost: 0, target: 'enemy', damage: 3, exhaust: true, icon: '›', category: '공격', text: '피해 3 · 소진', upgrade: { damage: 5, text: '피해 5 · 소진' } },
    fortress: { name: '방벽', cost: 2, target: 'ally', shield: 14, icon: '▣', category: '보호', text: '보호 14', upgrade: { shield: 19, text: '보호 19' } },
    sweep: { name: '파문', cost: 2, target: 'enemy', areaDamage: 5, breakPower: 1, icon: '◉', category: '공격', text: '모든 적에게 피해 5', upgrade: { areaDamage: 8, text: '모든 적에게 피해 8' } },
    sunder: { name: '균열', cost: 1, target: 'enemy', damage: 4, weak: 3, breakPower: 2, icon: '⫽', category: '제어', text: '피해 4 · 다음 공격 −3', upgrade: { damage: 6, weak: 4, text: '피해 6 · 다음 공격 −4' } },
    riposte: { name: '맞받기', cost: 1, target: 'ally', shield: 5, reaction: 6, icon: '↶', category: '반격', text: '보호 5 · 공격을 보호로 흡수하고 생존하면 한 번 반격 6', upgrade: { shield: 7, reaction: 9, text: '보호 7 · 공격을 보호로 흡수하고 생존하면 한 번 반격 9' } },
    bulwark: { name: '엄호선', cost: 2, target: 'ally', allShield: 4, shield: 6, icon: '⌂', category: '보호', text: '모든 아군 보호 4 · 대상 추가 보호 6', upgrade: { allShield: 5, shield: 9, text: '모든 아군 보호 5 · 대상 추가 보호 9' } },
    mend: { name: '응급 처치', cost: 2, target: 'ally', heal: 9, exhaust: true, icon: '+', category: '회복', text: 'HP 9 회복 · 소진', upgrade: { heal: 13, text: 'HP 13 회복 · 소진' } },
    focus: { name: '호흡', cost: 0, target: 'ally', energy: 1, exhaust: true, icon: '∴', category: '자원', text: '에너지 1 획득 · 소진', upgrade: { energy: 2, text: '에너지 2 획득 · 소진' } },
    hold: { name: '대비', cost: 1, target: 'ally', shield: 4, reserve: true, icon: '⌁', category: '보호', text: '보호 4 · 이 카드를 다음 손패에 보관', upgrade: { shield: 7, text: '보호 7 · 이 카드를 다음 손패에 보관' } },
    finisher: { name: '결정타', cost: 3, target: 'enemy', damage: 24, breakPower: 2, icon: '✶', category: '공격', text: '피해 24', upgrade: { damage: 31, text: '피해 31' } },
    expose: { name: '약점 포착', cost: 1, target: 'enemy', damage: 3, exposure: 4, breakPower: 1, icon: '◎', category: '제어', link: '노출 → 후속 공격', text: '피해 3 · 이 적의 다음 카드 타격 피해 +4', upgrade: { damage: 5, exposure: 6, text: '피해 5 · 이 적의 다음 카드 타격 피해 +6' } },
    echo: { name: '되울림', cost: 2, target: 'enemy', damage: 8, reserve: true, breakPower: 1, icon: '∞', category: '순환', text: '피해 8 · 이 카드를 다음 손패에 보관', upgrade: { damage: 12, text: '피해 12 · 이 카드를 다음 손패에 보관' } },
    feint: { name: '몸 비틀기', cost: 1, target: 'enemy', damage: 4, selfShield: 5, breakPower: 1, icon: '↝', category: '혼합', text: '피해 4 · 자신 보호 5', upgrade: { damage: 6, selfShield: 8, text: '피해 6 · 자신 보호 8' } },
    rally: { name: '합류', cost: 1, target: 'ally', allShield: 3, draw: 1, icon: '⋈', category: '순환', text: '모든 아군 보호 3 · 카드 1장 뽑기', upgrade: { allShield: 5, text: '모든 아군 보호 5 · 카드 1장 뽑기' } },
    lockdown: { name: '정박 사슬', cost: 2, target: 'enemy', weak: 8, breakPower: 2, icon: '⚓', category: '제어', text: '다음 공격의 피해 −8', upgrade: { weak: 11, text: '다음 공격의 피해 −11' } },
    undertow: { name: '되밀기', cost: 2, target: 'enemy', damage: 10, selfHeal: 4, breakPower: 1, icon: '≈', category: '혼합', text: '피해 10 · 자신 HP 4 회복', upgrade: { damage: 14, selfHeal: 6, text: '피해 14 · 자신 HP 6 회복' } },
    salvage: { name: '건져 올리기', cost: 1, target: 'ally', retrieve: 1, draw: 1, icon: '⤴', category: '순환', text: '버림더미의 마지막 카드 1장 회수 · 카드 1장 뽑기', upgrade: { draw: 2, text: '버림더미의 마지막 카드 1장 회수 · 카드 2장 뽑기' } },
    impale: { name: '관통', cost: 2, target: 'enemy', damage: 11, penetrate: true, breakPower: 2, icon: '⟶', category: '공격', text: '보호를 무시하고 피해 11', upgrade: { damage: 16, text: '보호를 무시하고 피해 16' } },
    pursuit: { name: '틈새 추적', cost: 1, target: 'enemy', damage: 5, exposureDraw: 2, breakPower: 1, icon: '⌖', category: '공격', link: '노출 → 드로우', text: '피해 5 · 공격 전 이 적에게 노출이 있으면 2장 뽑기', upgrade: { damage: 7, exposureDraw: 3, text: '피해 7 · 공격 전 이 적에게 노출이 있으면 3장 뽑기' } },
    pressurevalve: { name: '압력 전환', cost: 1, target: 'enemy', weak: 3, spendShield: 4, icon: '⇌', category: '제어', link: '자신 보호 → 적 약화', text: '다음 공격 −3 · 자신의 보호를 최대 4 소비해 그만큼 추가 감소', upgrade: { weak: 4, spendShield: 6, text: '다음 공격 −4 · 자신의 보호를 최대 6 소비해 그만큼 추가 감소' } },
    beacon: { name: '등불 아래', cost: 1, target: 'ally', shield: 4, shieldedDraw: 1, icon: '⌑', category: '순환', link: '대상 보호 → 드로우', text: '보호 4 · 사용 전 대상에게 보호가 있으면 1장 뽑기', upgrade: { shield: 6, shieldedDraw: 2, text: '보호 6 · 사용 전 대상에게 보호가 있으면 2장 뽑기' } },
    deepdive: { name: '심층 강습', cost: 4, target: 'enemy', damage: 26, exposedDamage: 10, breakPower: 3, icon: '▼', category: '공격', link: '노출 → 강한 일격', text: '피해 26 · 공격 전 이 적에게 노출이 있으면 추가 피해 10', upgrade: { damage: 32, exposedDamage: 12, text: '피해 32 · 공격 전 이 적에게 노출이 있으면 추가 피해 12' } },
    bastion: { name: '귀환의 등대', cost: 3, target: 'ally', allShield: 6, shield: 6, reaction: 6, icon: '♜', category: '반격', link: '전체 보호 → 대상 반격', text: '전원 보호 6 · 대상 추가 보호 6과 반격 6', upgrade: { allShield: 8, shield: 8, reaction: 9, text: '전원 보호 8 · 대상 추가 보호 8과 반격 9' } },
    mobilize: { name: '총력 정비', cost: 3, target: 'ally', allShield: 4, reserveDiscard: 2, icon: '▦', category: '순환', link: '사용한 카드 → 다음 손패', text: '전원 보호 4 · 마지막 버린 카드 최대 2장을 다음 손패에 보관', upgrade: { allShield: 6, reserveDiscard: 2, text: '전원 보호 6 · 마지막 버린 카드 최대 2장을 다음 손패에 보관' } },
    basic: { name: '기본 공격', cost: 1, target: 'enemy', damage: 2, icon: '·', category: '기본', text: '피해 2 · 고유 효과 없음' }
  };
  const ROLES = [
    { id: 'navigator', name: '항해사', passive: '연속 항로', execution: '선회', ability: '생존 중: 실행자를 바꾼 유료 카드의 첫 직접 타격 +2. 실행: 다른 생존 동료의 유료 카드 뒤 첫 유료 카드에 첫 직접 타격 +4, 또는 HP 비율 최저 아군 보호 4.', color: '#ffbb86' },
    { id: 'diver', name: '잠수자', passive: '심층 공명', execution: '침투', ability: '생존 중: 라운드 첫 노출 소비 시 에너지 +1. 실행: 첫 유료 적 대상 카드 뒤 노출 4, 브레이크 사용 시 균형 추가 −1.', color: '#e5a2ba' },
    { id: 'pilot', name: '도선사', passive: '항로 개척', execution: '도선', ability: '생존 중: 유료 선행 카드 뒤 첫 인쇄 비용 2+ 카드에 첫 직접 타격 또는 대상 보호 +3. 실행: 선행 지불 에너지 2+ 뒤 첫 유료 카드에 첫 직접 타격 +5, 또는 자신 보호 5.', color: '#efcf82' },
    { id: 'sounder', name: '측심사', passive: '측심', execution: '정밀 관측', ability: '생존 중: 라운드 시작 6장 확보와 적 의도 공개 후 1장 선택해 버림. 실행: 첫 유료 카드 뒤 1장 뽑기.', color: '#c5b0ff' },
    { id: 'salvager', name: '인양사', passive: '인계', execution: '인양', ability: '생존 중: 인양해 반환된 동일 카드의 타인 사용 비용 −1, 최소 1. 실행: 첫 유료 비소진 카드 사본을 다음 손패에 예약.', color: '#91c9ff' },
    { id: 'lightkeeper', name: '등대지기', passive: '잔광', execution: '점등', ability: '생존 중: 적 행동 뒤 보호가 가장 많이 남은 아군 한 명의 보호 최대 4 이월. 실행: 첫 유료 카드 뒤 자신 보호 4.', color: '#8bd6c5' }
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const integer = (value, fallback) => Number.isInteger(value) ? value : fallback;
  const VERSION = 'expedition-combat-2';
  const TACTICAL_PATTERNS = ['warder', 'mender', 'pursuer', 'relay', 'abyssjudge'];
  const PATTERNS = ['hunter', 'sweep', 'sentinel', 'leech', 'conductor', 'boss', 'bellkeeper', 'twins', 'tideheart', ...TACTICAL_PATTERNS];

  class Battle {
    constructor(options = {}) {
      const party = options.party || ['navigator', 'sounder', 'salvager', 'lightkeeper'];
      if (!Array.isArray(party) || party.length !== 4 || new Set(party).size !== 4 || party.some(id => !ROLES.some(role => role.id === id))) throw Error('서로 다른 네 명을 편성해야 합니다');
      const deck = options.deck || ['strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'check', 'suppress'].map((kind, index) => ({ id: 'c' + index, kind }));
      if (!Array.isArray(deck) || !deck.length || new Set(deck.map(card => card.id)).size !== deck.length || deck.some(card => !card || typeof card.id !== 'string' || !card.id || card.id === 'basic' || !CARDS[card.kind] || card.kind === 'basic')) throw Error('카드 사본 정의 오류');
      const enemies = options.enemies || [{ id: 'hunter-1', name: '사냥꾼', hp: 28, pattern: 'hunter' }];
      if (!Array.isArray(enemies) || !enemies.length || new Set(enemies.map(enemy => enemy.id)).size !== enemies.length || enemies.some(enemy => !enemy || typeof enemy.id !== 'string' || party.includes(enemy.id) || !PATTERNS.includes(enemy.pattern || 'hunter') || !Number.isInteger(enemy.hp) || enemy.hp <= 0)) throw Error('적 정의 오류');
      const supplied = options.allies || [];
      if (!Array.isArray(supplied) || new Set(supplied.map(ally => ally.id)).size !== supplied.length || supplied.some(ally => !party.includes(ally.id))) throw Error('아군 정의 오류');
      this.s = {
        version: VERSION, seed: (integer(options.seed, 20261009) >>> 0) || 1,
        round: 0, energy: 0, status: 'playing', breakMode: options.breakMode === true || options.breakMode === 'on',
        memory: null, memoryAll: null, paidEnergy: 0, cardsPlayed: 0, paidCardsPlayed: 0, passiveReady: { pilot: true, diver: true }, needsTrim: false, salvageMarks: {}, events: [],
        allies: party.map(id => {
          const profile = ROLES.find(role => role.id === id), data = supplied.find(ally => ally.id === id) || {};
          const max = integer(data.max, 30), hp = integer(data.hp, max);
          if (max <= 0 || hp < 0 || hp > max) throw Error('아군 HP 오류');
          return { ...profile, hp, max, shield: 0, ready: hp > 0, reaction: 0 };
        }),
        enemies: enemies.map(enemy => {
          const max = integer(enemy.max, enemy.hp), toughnessMax = integer(enemy.toughnessMax, 5);
          if (max < enemy.hp || toughnessMax < 1 || enemy.damage != null && (!Number.isInteger(enemy.damage) || enemy.damage < 0) || enemy.areaDamage != null && (!Number.isInteger(enemy.areaDamage) || enemy.areaDamage < 0)) throw Error('적 수치 오류');
          return { id: enemy.id, name: enemy.name || '심층 존재', hp: enemy.hp, max, color: enemy.color || '#eab1bc', pattern: enemy.pattern || 'hunter', damage: integer(enemy.damage, enemy.pattern === 'boss' ? 12 : 8), areaDamage: integer(enemy.areaDamage, enemy.pattern === 'boss' ? 5 : 3), shield: 0, weak: 0, exposure: 0, toughness: toughnessMax, toughnessMax, broken: false, breakBonusArmed: false, queuedIntent: null };
        }),
        cards: {}, zones: { draw: [], hand: [], resolving: [], discard: [], reserve: [], exhaust: [] }, intents: []
      };
      if(options.cardSet!==undefined)this.s.cardSet=options.cardSet;
      if(options.voyage)this.s.voyage=clone(options.voyage);
      deck.forEach(card => { this.s.cards[card.id] = { id: card.id, kind: card.kind, upgraded: !!card.upgraded,...(card.enchant?{enchant:card.enchant}:{}) }; this.s.zones.draw.push(card.id); });
      this.shuffle(this.s.zones.draw);
      this.finish();
      if (this.s.status === 'playing') this.startRound();
      this.assert();
    }

    random() {
      let value = this.s.seed;
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      this.s.seed = value >>> 0;
      return this.s.seed / 4294967296;
    }
    shuffle(array) {
      for (let index = array.length - 1; index > 0; index--) {
        const other = Math.floor(this.random() * (index + 1));
        [array[index], array[other]] = [array[other], array[index]];
      }
    }
    draw(count) {
      while (count-- > 0) {
        if (!this.s.zones.draw.length && this.s.zones.discard.length) {
          this.s.zones.draw = this.s.zones.discard.splice(0);
          this.shuffle(this.s.zones.draw);
        }
        if (!this.s.zones.draw.length) break;
        const id = this.s.zones.draw.shift();
        this.s.zones.hand.push(id);
        this.s.events.push({ type: 'draw', card: id });
      }
    }
    startRound() {
      this.s.energy = this.s.round === 0 ? 4 : Math.min(5, this.s.energy + 2);
      if(this.s.round>0)this.s.energy=Math.min(5,this.s.energy+(this.s.powers?.roundEnergy||0)+(this.s.pending?.energy||0));
      this.s.round++;
      if(this.s.powers)this.s.powerUsed={};
      if(this.s.pending){for(const [id,amount]of Object.entries(this.s.pending.shields))if(this.alive(id))this.shield(id,amount);this.s.pending={energy:0,shields:{}};}
      this.s.allies.filter(a=>a.hp>0).forEach(a=>{if(this.s.powers?.roundShield)this.shield(a.id,this.s.powers.roundShield);if(this.s.powers?.roundHeal)this.heal(a.id,this.s.powers.roundHeal);});
      this.s.memory = null; this.s.memoryAll = null; this.s.paidEnergy = 0; this.s.cardsPlayed = 0; this.s.paidCardsPlayed = 0;
      this.s.passiveReady = { pilot: true, diver: true };
      this.s.allies.forEach(ally => { ally.ready = ally.hp > 0; });
      const returned = this.s.zones.reserve.splice(0);
      returned.forEach(id => { if (this.s.salvageMarks[id]) this.s.salvageMarks[id].returnedRound = this.s.round; });
      this.s.zones.hand.push(...returned);
      this.draw(Math.max(0, (this.alive('sounder') ? 6 : 5) - this.s.zones.hand.length));
      this.s.intents = this.s.enemies.filter(enemy => enemy.hp > 0).map((enemy, index) => this.enemyIntent(enemy, index));
      this.s.needsTrim = this.alive('sounder') && this.s.zones.hand.length === 6;
    }
    enemyIntent(enemy, index) {
      if (TACTICAL_PATTERNS.includes(enemy.pattern)) return this.tacticalIntent(enemy, index);
      if (enemy.queuedIntent) {
        const queued = clone(enemy.queuedIntent);
        enemy.queuedIntent = null;
        return { actor: enemy.id, ...queued };
      }
      const living = this.s.allies.filter(ally => ally.hp > 0);
      const target = living[(this.s.round - 1 + index) % living.length].id;
      const weakest = living.reduce((best, ally) => ally.hp / ally.max < best.hp / best.max ? ally : best, living[0]).id;
      const attack = (damage, selected = target) => ({ actor: enemy.id, type: 'attack', damage, target: selected });
      const area = damage => ({ actor: enemy.id, type: 'area', damage, target: null });
      const prepare = (damage, selected = target, type = 'attack') => {
        enemy.queuedIntent = { type, damage, target: type === 'area' ? null : selected };
        return { actor: enemy.id, type: 'prepare', damage: 0, target: null, nextType: type, nextDamage: damage, nextTarget: type === 'area' ? null : selected };
      };
      const phase = (this.s.round - 1) % 4;
      switch (enemy.pattern) {
        case 'sweep': return phase === 0 ? area(enemy.areaDamage) : phase === 2 ? prepare(enemy.areaDamage + 3, null, 'area') : attack(enemy.damage);
        case 'sentinel':
          if (phase === 0) { enemy.shield = 4; return prepare(enemy.damage + 4); }
          return phase === 2 ? area(enemy.areaDamage + 1) : attack(enemy.damage);
        case 'leech': return phase === 0 ? attack(enemy.damage, weakest) : phase === 1 ? area(enemy.areaDamage) : phase === 2 ? prepare(enemy.damage + 4, weakest) : attack(enemy.damage, weakest);
        case 'conductor': return phase === 0 ? area(enemy.areaDamage + 1) : phase === 1 ? prepare(enemy.damage + 4) : area(enemy.areaDamage + 2);
        case 'boss': {
          const bossPhase = (this.s.round - 1) % 6;
          if (bossPhase === 0) return area(enemy.areaDamage);
          if (bossPhase === 1) return attack(enemy.damage, weakest);
          if (bossPhase === 2) return prepare(enemy.areaDamage + 3, null, 'area');
          if (bossPhase === 4) return prepare(enemy.damage + 4);
          return attack(enemy.damage);
        }
        default: return phase === 1 ? prepare(enemy.damage + 4) : phase === 3 ? area(enemy.areaDamage) : attack(enemy.damage);
      }
    }
    tacticalIntent(enemy, index) {
      // New encounters lock their targets when disclosed. A support target or a
      // volley victim dying does not silently redirect the announced action.
      let phaseChanged = false;
      if (enemy.pattern === 'abyssjudge') {
        if (!enemy.phase) { enemy.phase = 'surface'; enemy.phaseRound = this.s.round; }
        if (enemy.phase === 'surface' && enemy.hp * 2 <= enemy.max) {
          enemy.phase = 'submerged'; enemy.phaseRound = this.s.round; phaseChanged = true;
          this.s.events.push({ type: 'boss-phase', actor: enemy.id, phase: enemy.phase, round: this.s.round });
        }
      }
      const publish = intent => enemy.pattern === 'abyssjudge' ? { ...intent, phase: enemy.phase, ...(phaseChanged ? { phaseChanged: true } : {}) } : intent;
      if (enemy.queuedIntent) {
        const queued = clone(enemy.queuedIntent); enemy.queuedIntent = null;
        return publish({ actor: enemy.id, ...queued });
      }
      const living = this.s.allies.filter(ally => ally.hp > 0);
      const targetIndex = (this.s.round - 1 + index) % living.length;
      const target = living[targetIndex].id;
      const twoTargets = [living[targetIndex].id, ...(living.length > 1 ? [living[(targetIndex + 1) % living.length].id] : [])];
      const companions = this.s.enemies.filter(candidate => candidate.hp > 0 && candidate.id !== enemy.id);
      const strongest = companions.reduce((best, candidate) => !best || candidate.damage > best.damage ? candidate : best, null) || enemy;
      const injured = companions.reduce((best, candidate) => !best || candidate.hp / candidate.max < best.hp / best.max ? candidate : best, null) || enemy;
      const attack = damage => ({ actor: enemy.id, type: 'attack', damage, target });
      const area = damage => ({ actor: enemy.id, type: 'area', damage, target: null });
      const volley = damage => ({ actor: enemy.id, type: 'volley', damage, target: null, targets: twoTargets });
      const support = (type, selected, amount) => ({ actor: enemy.id, type, damage: 0, target: selected.id, amount });
      const prepare = next => {
        const { actor, ...queued } = next; enemy.queuedIntent = clone(queued);
        return { actor: enemy.id, type: 'prepare', damage: 0, target: null, nextType: queued.type,
          ...(queued.amount !== undefined ? { nextAmount: queued.amount } : { nextDamage: queued.damage }),
          ...(queued.targets ? { nextTargets: clone(queued.targets) } : { nextTarget: queued.target }) };
      };
      const p = (this.s.round - 1) % 4;
      if (enemy.pattern === 'warder') return p % 2 === 0 ? support('ward', strongest, enemy.areaDamage + 4) : attack(enemy.damage);
      if (enemy.pattern === 'mender') return (this.s.round - 1) % 3 === 0 ? prepare(support('heal', injured, enemy.areaDamage + 5)) : attack(Math.max(1, enemy.damage - 2));
      if (enemy.pattern === 'pursuer') return p % 2 === 0 ? volley(enemy.damage) : area(enemy.areaDamage);
      if (enemy.pattern === 'relay') return p === 0 ? support('ward', strongest, enemy.areaDamage + 5) : p === 2 ? prepare(area(enemy.areaDamage + 2)) : attack(enemy.damage);
      const bossPhase = (this.s.round - enemy.phaseRound) % 4;
      const intent = bossPhase === 1 ? prepare(area(enemy.areaDamage + (enemy.phase === 'submerged' ? 2 : 1)))
        : enemy.phase === 'submerged' && bossPhase === 0 ? volley(enemy.damage)
        : attack(enemy.damage);
      return publish(intent);
    }
    actor(id) { return [...this.s.allies, ...this.s.enemies].find(actor => actor.id === id); }
    alive(id) { return this.s.allies.some(ally => ally.id === id && ally.hp > 0); }
    definition(id, choice) {
      if (id === 'basic') return { ...CARDS.basic, printedCost: CARDS.basic.cost, breakPower: 0 };
      const card = this.s.cards[id], base = cardDefinition(card?.kind,this.s.cardSet);
      if (!base) return undefined;
      const definition={ ...base, printedCost: base.cost, breakPower: base.breakPower || 0, ...(card.upgraded ? base.upgrade : {}), name: base.name + (card.upgraded ? '+' : ''), upgraded: card.upgraded };
      if(definition.choices&&choice!==undefined){
        if(!Number.isInteger(choice)||!definition.choices[choice])throw Error('유효하지 않은 카드 효과 선택');
        const option=definition.choices[choice];
        return {...definition,...option,name:definition.name+' · '+option.name,choice};
      }
      return definition;
    }
    costFor(card, actor) {
      const definition = this.definition(card);
      if (!definition) return Infinity;
      if(definition.cost==='X')return this.s.energy>0?this.s.energy:Infinity;
      const mark = this.s.salvageMarks[card];
      const discounted = card !== 'basic' && this.s.zones.hand.includes(card) && mark && mark.returnedRound === this.s.round && actor !== mark.actor && this.alive(actor) && this.alive('salvager');
      return discounted ? Math.max(1, definition.cost - 1) : definition.cost;
    }
    effectInfo(card, actor, choice) {
      const definition = this.definition(card,choice), executor = this.s.allies.find(ally => ally.id === actor);
      if (!definition || !executor) return null;
      const actualCost = this.costFor(card, actor), physical = card !== 'basic', paid = physical && actualCost >= 1;
      const switched = paid && this.s.memory && this.s.memory.actor !== actor;
      const attack = !!(definition.damage || definition.areaDamage);
      let eligible = paid && executor.ready && executor.hp > 0;
      if (actor === 'navigator') eligible = !!(eligible && switched && this.alive(this.s.memory.actor));
      if (actor === 'diver') eligible = !!(eligible && definition.target === 'enemy');
      if (actor === 'pilot') eligible = !!(eligible && this.s.paidEnergy >= 2);
      if (actor === 'salvager') eligible = !!(eligible && !definition.exhaust&&!definition.power);
      const navigatorPassive = !!(this.alive('navigator') && switched && attack);
      const pilotPassive = !!(physical && this.alive('pilot') && this.s.passiveReady.pilot && this.s.paidCardsPlayed > 0 && typeof definition.printedCost==='number'&&definition.printedCost >= 2);
      const damageBonus = (navigatorPassive ? 2 : 0) + (pilotPassive && attack ? 3 : 0) + (eligible && attack ? actor === 'navigator' ? 4 : actor === 'pilot' ? 5 : 0 : 0);
      const shieldBonus = pilotPassive && !attack && definition.target === 'ally' && definition.shield ? 3 : 0;
      const details = [];
      if (actualCost < definition.cost) details.push('인계: 비용 ' + definition.cost + ' → ' + actualCost);
      if (navigatorPassive) details.push('연속 항로: 첫 직접 타격 +2');
      if (pilotPassive) details.push('항로 개척: ' + (attack ? '첫 직접 타격 +3' : shieldBonus ? '대상 보호 +3' : '이번 기회 소비'));
      if (eligible) {
        const text = {
          navigator: attack ? '선회: 첫 직접 타격 +4' : '선회: HP 비율 최저 아군 보호 4',
          diver: '침투: 본효과 뒤 노출 4' + (this.s.breakMode ? ' · 균형 −1' : ''),
          pilot: attack ? '도선: 첫 직접 타격 +5' : '도선: 자신 보호 5',
          sounder: '정밀 관측: 본효과 뒤 1장 뽑기',
          salvager: '인양: 이 사본 다음 손패 예약',
          lightkeeper: '점등: 자신 보호 4'
        };
        details.push(text[actor]);
      }
      if (physical && attack && this.alive('diver') && this.s.passiveReady.diver) details.push('심층 공명: 노출을 소비하면 에너지 +1');
      return { printedCost: definition.printedCost, actualCost, cost: actualCost, eligible: !!eligible, navigatorPassive, pilotPassive, damageBonus, shieldBonus, details, text: details.join(' · ') || (executor.ready ? '실행 특성 조건 미충족' : '실행 특성 사용 완료') };
    }
    discardForSounder(card) {
      if (this.s.status !== 'playing' || !this.s.needsTrim || !this.s.zones.hand.includes(card)) throw Error('측심에서 버릴 손패 카드를 선택해야 합니다');
      this.s.events = [{ type: 'sounder-discard', actor: 'sounder', card }];
      this.s.zones.hand.splice(this.s.zones.hand.indexOf(card), 1);
      this.s.zones.discard.push(card);
      delete this.s.salvageMarks[card];
      this.s.needsTrim = false;
      this.assert(); return clone(this.s.events);
    }
    validate(card, actor, target, choice) {
      const definition = this.definition(card,choice), executor = this.s.allies.find(ally => ally.id === actor);
      const targets = definition?.target === 'enemy' ? this.s.enemies : this.s.allies;
      if (this.s.status !== 'playing' || this.s.needsTrim || !definition || !executor || executor.hp <= 0 || this.s.energy < this.costFor(card, actor) || card !== 'basic' && !this.s.zones.hand.includes(card) || !targets.some(candidate => candidate.id === target && candidate.hp > 0)) throw Error('유효하지 않은 행동');
      if(definition.choices&&choice===undefined)throw Error('카드 효과를 먼저 선택하세요');
      return definition;
    }
    hit(id, amount, options = {}) {
      const actor = this.actor(id);
      if (!actor || actor.hp <= 0 || amount <= 0) return { amount: 0, absorbed: 0 };
      const absorbed = options.penetrate ? 0 : Math.min(actor.shield, amount);
      actor.shield -= absorbed;
      const damage = Math.min(actor.hp, amount - absorbed);
      actor.hp -= damage;
      this.s.events.push({ type: 'damage', target: id, source: options.source || null, amount: damage, absorbed, direct: !!options.direct });
      if (actor.hp === 0) this.s.events.push({ type: this.s.allies.includes(actor) ? 'downed' : 'defeated', target: id });
      if (options.attacker && absorbed > 0 && actor.reaction > 0 && actor.hp > 0) {
        const response = actor.reaction;
        actor.reaction = 0;
        this.s.events.push({ type: 'reaction', actor: id, target: options.attacker, amount: response });
        this.hit(options.attacker, response, { source: id });
      }
      return { amount: damage, absorbed };
    }
    shield(id, amount) {
      const actor = this.actor(id);
      if (actor && actor.hp > 0 && amount > 0) { actor.shield += amount; this.s.events.push({ type: 'shield', target: id, amount }); }
    }
    heal(id, amount) {
      const actor = this.actor(id);
      if (!actor || actor.hp <= 0 || amount <= 0) return;
      const gained = Math.min(amount, actor.max - actor.hp);
      actor.hp += gained;
      if (gained) this.s.events.push({ type: 'heal', target: id, amount: gained });
    }
    directHit(target, amount, card, executor, penetrate = false, context = null) {
      const enemy = this.actor(target);
      if (!enemy || enemy.hp <= 0) return;
      let bonus = 0;
      const first = !context || !context.directUsed && target === context.target;
      if (first && enemy.exposure > 0) {
        bonus += enemy.exposure;
        this.s.events.push({ type: 'exposure-consumed', target, amount: enemy.exposure, card });
        enemy.exposure = 0;
        if (context) context.exposureConsumed = true;
      }
      if (first && this.s.breakMode && enemy.breakBonusArmed) {
        bonus += 4; enemy.breakBonusArmed = false;
        this.s.events.push({ type: 'break-bonus', target, amount: 4, card });
      }
      if (context && first) { bonus += context.damageBonus; context.directUsed = true; }
      this.hit(target, amount + bonus, { direct: true, source: executor, penetrate });
    }
    reduceToughness(target, amount, card) {
      if (!this.s.breakMode || amount <= 0) return;
      const enemy = this.s.enemies.find(candidate => candidate.id === target);
      if (!enemy || enemy.hp <= 0 || enemy.broken) return;
      const reduced = Math.min(enemy.toughness, amount);
      enemy.toughness -= reduced;
      this.s.events.push({ type: 'toughness', target, amount: reduced, card });
      if (enemy.toughness === 0) {
        enemy.broken = true; enemy.breakBonusArmed = true;
        this.s.events.push({ type: 'break', target, card });
      }
    }
    play(card, actor, target, choice) {
      let definition = this.validate(card, actor, target,choice);const executor = this.actor(actor);
      const powerBefore={...(this.s.powers||{})};
      const info = this.effectInfo(card, actor,choice);
      if(definition.xScale){definition={...definition};for(const key of definition.xScale)definition[key]*=info.actualCost;}
      const weakBefore=this.actor(target).weak>0;
      const exposedBefore=this.actor(target).exposure>0,protectedBefore=this.actor(target).shield>0;
      const spentShield=Math.min(executor.shield,definition.spendShield||0);
      const physical = card !== 'basic';
      const context = { target, directUsed: false, exposureConsumed: false, damageBonus: info.damageBonus+(physical&&definition.family==='assault'?powerBefore.assaultDamage||0:0) };
      const eligible = info.eligible;
      this.s.events = [];
      if(spentShield){executor.shield-=spentShield;this.s.events.push({type:'shield-spent',actor,amount:spentShield,card});}
      this.s.energy -= info.actualCost;
      if (physical) {
        this.s.paidEnergy += info.actualCost; this.s.cardsPlayed++;
        if (info.actualCost >= 1) this.s.paidCardsPlayed++;
        this.s.zones.hand.splice(this.s.zones.hand.indexOf(card), 1);
        this.s.zones.resolving.push(card);
        delete this.s.salvageMarks[card];
        if (eligible) executor.ready = false;
        if (info.pilotPassive) this.s.passiveReady.pilot = false;
        this.s.events.push({ type: 'card', card, actor, target, cost: info.actualCost, printedCost: definition.printedCost,...(choice!==undefined?{choice}:{}) });
        if (info.navigatorPassive) this.s.events.push({ type: 'passive', actor: 'navigator', name: '연속 항로', amount: 2 });
        if (info.pilotPassive) this.s.events.push({ type: 'passive', actor: 'pilot', name: '항로 개척', amount: info.damageBonus || info.shieldBonus ? 3 : 0 });
        if (eligible) this.s.events.push({ type: 'ability', actor, target, name: executor.execution });
      }
      if (definition.damage) {
        if (physical) for(let hit=0;hit<(definition.hits||1)&&this.actor(target).hp>0;hit++)this.directHit(target, definition.damage+(hit===0?(exposedBefore?definition.exposedDamage||0:0)+(weakBefore?definition.weakDamage||0:0)+Math.floor(executor.shield*(definition.shieldDamage||0)):0), card, actor, !!definition.penetrate, context);
        else this.hit(target, definition.damage, { source: actor });
      }
      if(exposedBefore&&definition.exposedDamage)this.s.events.push({type:'card-link',card,actor,target,kind:'exposure',damage:definition.exposedDamage});
      if (definition.areaDamage) {
        const enemies = this.s.enemies.filter(enemy => enemy.hp > 0);
        enemies.sort((left, right) => left.id === target ? -1 : right.id === target ? 1 : 0);
        enemies.forEach(enemy => this.directHit(enemy.id, definition.areaDamage, card, actor, false, context));
      }
      if (definition.shield) this.shield(target, definition.shield + info.shieldBonus+(protectedBefore?definition.protectedShield||0:0));
      if (definition.allShield) this.s.allies.filter(ally => ally.hp > 0).forEach(ally => this.shield(ally.id, definition.allShield));
      if (definition.selfShield) this.shield(actor, definition.selfShield);
      if (definition.heal) this.heal(target, definition.heal+(protectedBefore?definition.protectedHeal||0:0));
      if(definition.allHeal)this.s.allies.filter(a=>a.hp>0).forEach(a=>this.heal(a.id,definition.allHeal));
      if (definition.selfHeal) this.heal(actor, definition.selfHeal);
      const enemy = definition.target === 'enemy' ? this.actor(target) : null;
      if (definition.weak && enemy.hp > 0) { enemy.weak = Math.max(enemy.weak, definition.weak+spentShield); this.s.events.push({ type: 'weak', target, amount: enemy.weak }); }
      if (definition.exposure && enemy.hp > 0) { enemy.exposure = Math.max(enemy.exposure, definition.exposure+(powerBefore.exposureBonus||0)); this.s.events.push({ type: 'exposure', target, amount: enemy.exposure }); }
      if(definition.allWeak)this.s.enemies.filter(a=>a.hp>0).forEach(a=>{a.weak=Math.max(a.weak,definition.allWeak);this.s.events.push({type:'weak',target:a.id,amount:a.weak});});
      if(definition.allExposure)this.s.enemies.filter(a=>a.hp>0).forEach(a=>{a.exposure=Math.max(a.exposure,definition.allExposure+(powerBefore.exposureBonus||0));this.s.events.push({type:'exposure',target:a.id,amount:a.exposure});});
      if(definition.removeShield&&enemy.hp>0){const amount=Math.min(enemy.shield,definition.removeShield);enemy.shield-=amount;this.s.events.push({type:'shield-removed',target,amount});}
      if (definition.reaction) { this.actor(target).reaction = Math.max(this.actor(target).reaction, definition.reaction); this.s.events.push({ type: 'reaction-ready', target, amount: definition.reaction }); }
      if (definition.energy) {
        const amount = Math.min(5 - this.s.energy, definition.energy);
        this.s.energy += amount;
        this.s.events.push({ type: 'energy', amount });
      }
      if (definition.retrieve) {
        for (let index = 0; index < definition.retrieve && this.s.zones.discard.length; index++) {
          const id = this.s.zones.discard.pop(); this.s.zones.hand.push(id); this.s.events.push({ type: 'retrieve', card: id });
        }
      }
      if(definition.retrieveFamily){const index=this.s.zones.discard.findLastIndex(id=>this.definition(id).family===definition.retrieveFamily);if(index>=0){const [id]=this.s.zones.discard.splice(index,1);this.s.zones.hand.push(id);this.s.events.push({type:'retrieve',card:id});}}
      if(definition.nextEnergy||definition.nextShield){this.s.pending||={energy:0,shields:{}};this.s.pending.energy+=definition.nextEnergy||0;if(definition.nextShield)this.s.pending.shields[actor]=(this.s.pending.shields[actor]||0)+definition.nextShield;this.s.events.push({type:'next-round',actor,energy:definition.nextEnergy||0,shield:definition.nextShield||0});}
      if(definition.selfHP){const amount=Math.min(executor.hp,definition.selfHP);executor.hp-=amount;this.s.events.push({type:'damage',target:actor,amount,source:card});if(executor.hp===0)this.s.events.push({type:'downed',target:actor});}
      if(definition.reserveDiscard){
        for(let i=0;i<definition.reserveDiscard&&this.s.zones.discard.length;i++){
          const id=this.s.zones.discard.pop();this.s.zones.reserve.push(id);this.s.events.push({type:'reserve-discard',card:id,source:card});
        }
      }
      if (definition.draw) this.draw(definition.draw);
      if(powerBefore.shieldReaction){const ids=[...(definition.allShield?this.s.allies.filter(a=>a.hp>0).map(a=>a.id):[]),...(definition.shield?[target]:[]),...(definition.selfShield?[actor]:[])];for(const id of new Set(ids)){const a=this.actor(id);a.reaction+=powerBefore.shieldReaction;this.s.events.push({type:'reaction-ready',target:id,amount:a.reaction});}}
      if(definition.family==='disrupt'&&powerBefore.disruptShield)this.shield(actor,powerBefore.disruptShield);
      if(definition.family==='cycle'&&powerBefore.firstCycleDraw&&!this.s.powerUsed?.cycle){this.s.powerUsed||={};this.s.powerUsed.cycle=true;this.draw(powerBefore.firstCycleDraw);}
      if((definition.exhaust||definition.power)&&powerBefore.firstExhaustDraw&&!this.s.powerUsed?.exhaust){this.s.powerUsed||={};this.s.powerUsed.exhaust=true;this.draw(powerBefore.firstExhaustDraw);}
      if(definition.power){this.s.powers||={};for(const [key,value]of Object.entries(definition.power))this.s.powers[key]=Math.max(this.s.powers[key]||0,value);this.s.events.push({type:'power',card,effects:{...definition.power}});}
      const linkedDraw=(exposedBefore?definition.exposureDraw||0:0)+(protectedBefore?definition.shieldedDraw||0:0);
      if(linkedDraw){this.s.events.push({type:'card-link',card,actor,target,kind:exposedBefore&&definition.exposureDraw?'exposure':'shield',draw:linkedDraw});this.draw(linkedDraw);}
      if (physical && definition.target === 'enemy') this.reduceToughness(target, definition.breakPower, card);
      if (eligible && executor.hp > 0) {
        const executionShield = (id, amount) => {
          const before = this.actor(id)?.shield || 0; this.shield(id, amount);
          const gained = (this.actor(id)?.shield || 0) - before;
          if (gained > 0 && this.s.voyage?.contentVersion === 'voyage-2') this.s.events.push({ type: 'ability-effect', actor, ability: 'execution', effect: 'shield', amount: gained, target: id, card });
        };
        if (actor === 'navigator' && !definition.damage && !definition.areaDamage) {
          const lowest = this.s.allies.filter(ally => ally.hp > 0).reduce((best, ally) => !best || ally.hp / ally.max < best.hp / best.max ? ally : best, null);
          if (lowest) executionShield(lowest.id, 4);
        }
        if (actor === 'pilot' && !definition.damage && !definition.areaDamage) executionShield(actor, 5);
        if (actor === 'sounder') {
          const before = this.s.zones.hand.length; this.draw(1);
          const gained = this.s.zones.hand.length - before;
          if (gained > 0 && this.s.voyage?.contentVersion === 'voyage-2') this.s.events.push({ type: 'ability-effect', actor, ability: 'execution', effect: 'draw', amount: gained, target: actor, card });
        }
        if (actor === 'lightkeeper') executionShield(actor, 4);
        if (actor === 'diver' && enemy.hp > 0) {
          enemy.exposure = Math.max(enemy.exposure, 4+(powerBefore.exposureBonus||0));
          this.s.events.push({ type: 'exposure', target, amount: enemy.exposure });
          this.reduceToughness(target, 1, card);
        }
      }
      if (context.exposureConsumed && this.alive('diver') && this.s.passiveReady.diver) {
        this.s.passiveReady.diver = false;
        const amount = Math.min(1, 5 - this.s.energy);
        this.s.energy += amount;
        this.s.events.push({ type: 'energy', actor: 'diver', name: '심층 공명', amount });
      }
      if (physical) {
        this.s.memoryAll = { actor, card, cost: info.actualCost };
        if (info.actualCost >= 1) this.s.memory = { actor, card, cost: info.actualCost };
        this.s.zones.resolving.splice(this.s.zones.resolving.indexOf(card), 1);
        const salvaged = eligible && executor.hp > 0 && actor === 'salvager';
        const zone = definition.exhaust||definition.power ? 'exhaust' : definition.reserve || salvaged ? 'reserve' : 'discard';
        if (salvaged&&definition.cost!=='X') this.s.salvageMarks[card] = { actor, returnedRound: null };
        this.s.zones[zone].push(card);
        this.s.events.push({ type: 'zone', card, zone });
      }
      this.finish(); this.assert();
      return clone(this.s.events);
    }
    finish() {
      if (this.s.allies.every(ally => ally.hp <= 0)) this.s.status = 'lost';
      else if (this.s.enemies.every(enemy => enemy.hp <= 0)) this.s.status = 'won';
      if (this.s.status !== 'playing') this.s.needsTrim = false;
    }
    intentDamage(intent) {
      const enemy = this.s.enemies.find(candidate => candidate.id === intent.actor);
      if (!enemy || enemy.hp <= 0 || ['prepare', 'ward', 'heal'].includes(intent.type)) return 0;
      const weakened = Math.max(0, intent.damage - enemy.weak);
      return this.s.breakMode && enemy.broken ? Math.floor(weakened / 2) : weakened;
    }
    intentTargets(intent) {
      if (!this.s.enemies.some(enemy => enemy.id === intent.actor && enemy.hp > 0) || ['prepare', 'ward', 'heal'].includes(intent.type)) return [];
      const ids = intent.type === 'area' ? this.s.allies.map(ally => ally.id) : intent.type === 'volley' ? intent.targets : [intent.target];
      return ids.filter(id => this.alive(id));
    }
    incomingDamage(allyId) {
      if (!this.alive(allyId)) return 0;
      return this.s.intents.reduce((sum, intent) => sum + (this.intentTargets(intent).includes(allyId) ? this.intentDamage(intent) : 0), 0);
    }
    endRound() {
      if (this.s.status !== 'playing' || this.s.needsTrim) throw Error(this.s.needsTrim ? '측심에서 버릴 카드 선택 필요' : '종료된 전투');
      this.s.events = [];
      const discarded = this.s.zones.hand.filter(id=>!this.definition(id).retain);
      this.s.zones.hand=this.s.zones.hand.filter(id=>this.definition(id).retain);
      [...discarded,...this.s.zones.hand].forEach(id => { delete this.s.salvageMarks[id]; });
      this.s.zones.discard.push(...discarded);
      this.s.enemies.forEach(enemy => { enemy.shield = 0; });
      for (const intent of this.s.intents) {
        const enemy = this.actor(intent.actor);
        if (enemy.hp <= 0) continue;
        if (intent.type === 'prepare') { this.s.events.push({ type: 'prepare', actor: enemy.id, nextTarget: intent.nextTarget, nextDamage: intent.nextDamage, nextType: intent.nextType, ...(intent.nextAmount !== undefined ? { nextAmount: intent.nextAmount } : {}), ...(intent.nextTargets ? { nextTargets: clone(intent.nextTargets) } : {}) }); continue; }
        if (intent.type === 'ward' || intent.type === 'heal') {
          const recipient = this.s.enemies.find(candidate => candidate.id === intent.target && candidate.hp > 0);
          if (!recipient) { this.s.events.push({ type: 'intent-canceled', actor: enemy.id, target: intent.target, intentType: intent.type }); continue; }
          const amount = intent.type === 'ward' ? intent.amount : Math.min(intent.amount, recipient.max - recipient.hp);
          if (intent.type === 'ward') recipient.shield += amount; else recipient.hp += amount;
          this.s.events.push({ type: intent.type === 'ward' ? 'enemy-ward' : 'enemy-heal', actor: enemy.id, target: recipient.id, amount });
          continue;
        }
        const targets = intent.type === 'volley' ? intent.targets : intent.type === 'area' ? this.s.allies.filter(ally => ally.hp > 0).map(ally => ally.id) : [intent.target];
        const damage = this.intentDamage(intent);
        let attacked = false;
        const reactions = [];
        for (const target of targets) {
          if (enemy.hp <= 0 || this.actor(target)?.hp <= 0) continue;
          attacked = true;
          if (intent.type === 'area' || intent.type === 'volley') {
            const result = this.hit(target, damage, { source: enemy.id });
            if (result.absorbed > 0 && this.actor(target).hp > 0 && this.actor(target).reaction > 0) reactions.push(target);
          } else this.hit(target, damage, { source: enemy.id, attacker: enemy.id });
        }
        for (const target of reactions) {
          const ally = this.actor(target);
          if (enemy.hp <= 0 || ally.hp <= 0) continue;
          const amount = ally.reaction; ally.reaction = 0;
          this.s.events.push({ type: 'reaction', actor: target, target: enemy.id, amount });
          this.hit(enemy.id, amount, { source: target });
        }
        if (attacked) enemy.weak = 0;
        this.finish();
        if (this.s.status !== 'playing') break;
      }
      const carried = this.alive('lightkeeper') ? this.s.allies.filter(ally => ally.hp > 0).reduce((best, ally) => !best || ally.shield > best.shield ? ally : best, null) : null;
      const carriedAmount = carried ? Math.min(4, carried.shield) : 0;
      this.s.allies.forEach(ally => { ally.shield = ally === carried ? carriedAmount : 0; ally.reaction = 0; });
      if (carriedAmount) this.s.events.push({ type: 'shield-carried', actor: 'lightkeeper', target: carried.id, amount: carriedAmount });
      this.s.enemies.forEach(enemy => {
        if (enemy.hp > 0 && enemy.broken) {
          enemy.toughness = enemy.toughnessMax; enemy.broken = false; enemy.breakBonusArmed = false;
          this.s.events.push({ type: 'break-recovered', target: enemy.id });
        }
      });
      this.finish();
      if (this.s.status === 'playing') this.startRound();
      this.assert(); return clone(this.s.events);
    }
    snapshot() { return clone(this.s); }
    static restore(snapshot) {
      const battle = Object.create(Battle.prototype);
      battle.s = clone(snapshot);
      if (battle.s.version !== VERSION) throw Error('다른 전투 저장 버전');
      battle.assert(); return battle;
    }
    preview(card, actor, target, choice) { const battle = Battle.restore(this.snapshot()); battle.play(card, actor, target,choice); return battle.snapshot(); }
    assert() {
      const state = this.s;
      const powerKeys=['assaultDamage','shieldReaction','roundShield','exposureBonus','disruptShield','firstCycleDraw','firstExhaustDraw','roundEnergy','roundHeal'];
      if(state.cardSet!==undefined&&state.cardSet!=='draft-1')throw Error('카드 규칙 버전 오류');
      if(state.powers&&(typeof state.powers!=='object'||Array.isArray(state.powers)||Object.entries(state.powers).some(([k,v])=>!powerKeys.includes(k)||!Number.isInteger(v)||v<1||v>10)))throw Error('지속 효과 상태 오류');
      if(state.pending&&(!Number.isInteger(state.pending.energy)||state.pending.energy<0||!state.pending.shields||typeof state.pending.shields!=='object'||Array.isArray(state.pending.shields)||Object.entries(state.pending.shields).some(([id,v])=>!state.allies.some(a=>a.id===id)||!Number.isInteger(v)||v<0)))throw Error('다음 라운드 준비 오류');
      if(state.powerUsed&&(typeof state.powerUsed!=='object'||Array.isArray(state.powerUsed)||Object.entries(state.powerUsed).some(([k,v])=>!['cycle','exhaust'].includes(k)||typeof v!=='boolean')))throw Error('지속 발동 기록 오류');
      if (state.version !== VERSION || !Number.isInteger(state.seed) || state.seed < 0 || state.seed > 4294967295 || !Number.isInteger(state.round) || state.round < 0 || !['playing', 'won', 'lost'].includes(state.status) || typeof state.breakMode !== 'boolean') throw Error('전투 상태 오류');
      if (!Number.isInteger(state.energy) || state.energy < 0 || state.energy > 5 || !Number.isInteger(state.paidEnergy) || state.paidEnergy < 0) throw Error('에너지 오류');
      if (!Number.isInteger(state.cardsPlayed) || state.cardsPlayed < 0 || !Number.isInteger(state.paidCardsPlayed) || state.paidCardsPlayed < 0 || state.paidCardsPlayed > state.cardsPlayed || typeof state.needsTrim !== 'boolean' || !state.passiveReady || typeof state.passiveReady.pilot !== 'boolean' || typeof state.passiveReady.diver !== 'boolean' || !state.salvageMarks || typeof state.salvageMarks !== 'object' || Array.isArray(state.salvageMarks)) throw Error('전문성 상태 오류');
      if (Object.keys(state.zones).sort().join(',') !== ['draw', 'hand', 'resolving', 'discard', 'reserve', 'exhaust'].sort().join(',') || Object.values(state.zones).some(zone => !Array.isArray(zone))) throw Error('카드 영역 정의 오류');
      const ids = Object.values(state.zones).flat();
      if (ids.length !== Object.keys(state.cards).length || new Set(ids).size !== ids.length || ids.some(id => !state.cards[id] || state.cards[id].id !== id || id === 'basic' || !CARDS[state.cards[id].kind] || state.cards[id].kind === 'basic' || typeof state.cards[id].upgraded !== 'boolean')) throw Error('실물 카드 영역 오류');
      if (!Array.isArray(state.allies) || state.allies.length !== 4 || new Set(state.allies.map(ally => ally.id)).size !== 4 || state.allies.some(ally => !ROLES.some(role => role.id === ally.id))) throw Error('파티 오류');
      if (!Array.isArray(state.enemies) || !state.enemies.length || new Set([...state.allies, ...state.enemies].map(actor => actor.id)).size !== state.allies.length + state.enemies.length) throw Error('전투 개체 오류');
      for (const actor of [...state.allies, ...state.enemies]) {
        if (!Number.isInteger(actor.hp) || !Number.isInteger(actor.max) || actor.max < 1 || actor.hp < 0 || actor.hp > actor.max || !Number.isInteger(actor.shield) || actor.shield < 0) throw Error('전투 HP/보호 오류');
      }
      for (const ally of state.allies) if (typeof ally.ready !== 'boolean' || !Number.isInteger(ally.reaction) || ally.reaction < 0) throw Error('아군 효과 오류');
      for (const memory of [state.memory, state.memoryAll]) if (memory != null && (!state.allies.some(ally => ally.id === memory.actor) || !state.cards[memory.card] || !Number.isInteger(memory.cost) || memory.cost < (memory === state.memory ? 1 : 0))) throw Error('선행 실행자 오류');
      for (const [id, mark] of Object.entries(state.salvageMarks)) if (!state.cards[id] || !mark || mark.actor !== 'salvager' || !state.allies.some(ally => ally.id === mark.actor) || (!state.zones.reserve.includes(id) && !state.zones.hand.includes(id)) || !(mark.returnedRound === null && state.zones.reserve.includes(id) || Number.isInteger(mark.returnedRound) && mark.returnedRound === state.round && state.zones.hand.includes(id)) || this.definition(id).exhaust || this.definition(id).power|| this.definition(id).cost < 1) throw Error('인양 할인 표식 오류');
      if (state.needsTrim && (state.status !== 'playing' || !this.alive('sounder') || state.zones.hand.length !== 6)) throw Error('측심 선택 단계 오류');
      for (const enemy of state.enemies) {
        if (!PATTERNS.includes(enemy.pattern) || !Number.isInteger(enemy.damage) || enemy.damage < 0 || !Number.isInteger(enemy.areaDamage) || enemy.areaDamage < 0 || !Number.isInteger(enemy.weak) || enemy.weak < 0 || !Number.isInteger(enemy.exposure) || enemy.exposure < 0 || !Number.isInteger(enemy.toughness) || !Number.isInteger(enemy.toughnessMax) || enemy.toughnessMax < 1 || enemy.toughness < 0 || enemy.toughness > enemy.toughnessMax || typeof enemy.broken !== 'boolean' || typeof enemy.breakBonusArmed !== 'boolean' || enemy.broken && enemy.toughness !== 0 || enemy.breakBonusArmed && !enemy.broken || !enemy.broken && enemy.toughness === 0) throw Error('적 효과/균형 오류');
        if (enemy.phase !== undefined && (enemy.pattern !== 'abyssjudge' || !['surface', 'submerged'].includes(enemy.phase) || !Number.isInteger(enemy.phaseRound) || enemy.phaseRound < 1 || enemy.phaseRound > state.round)) throw Error('보스 국면 오류');
      }
      const validIntent = intent => {
        if (!intent || !['attack', 'area', 'prepare', 'ward', 'heal', 'volley'].includes(intent.type) || !Number.isInteger(intent.damage) || intent.damage < 0) return false;
        if (intent.type === 'attack' && !state.allies.some(ally => ally.id === intent.target)) return false;
        if (intent.type === 'volley' && (intent.target !== null || !Array.isArray(intent.targets) || intent.targets.length < 1 || intent.targets.length > 2 || new Set(intent.targets).size !== intent.targets.length || intent.targets.some(id => !state.allies.some(ally => ally.id === id)))) return false;
        if (['ward', 'heal'].includes(intent.type) && (intent.damage !== 0 || !Number.isInteger(intent.amount) || intent.amount < 1 || !state.enemies.some(enemy => enemy.id === intent.target))) return false;
        if (intent.phase !== undefined && (!['surface', 'submerged'].includes(intent.phase) || intent.phaseChanged !== undefined && typeof intent.phaseChanged !== 'boolean')) return false;
        return true;
      };
      if (!Array.isArray(state.intents) || state.intents.some(intent => !state.enemies.some(enemy => enemy.id === intent.actor) || !validIntent(intent))) throw Error('공개 의도 오류');
      for (const enemy of state.enemies.filter(candidate => TACTICAL_PATTERNS.includes(candidate.pattern))) {
        if (enemy.queuedIntent != null && (!validIntent(enemy.queuedIntent) || enemy.queuedIntent.type === 'prepare')) throw Error('다음 공개 의도 오류');
        const intent = state.intents.find(candidate => candidate.actor === enemy.id);
        if (intent?.type === 'prepare') {
          const queued = { type: intent.nextType, damage: intent.nextDamage || 0, target: intent.nextTarget ?? null, ...(intent.nextAmount !== undefined ? { amount: intent.nextAmount } : {}), ...(intent.nextTargets ? { targets: intent.nextTargets } : {}) };
          if (!validIntent(queued) || queued.type === 'prepare' || intent.damage !== 0 || !enemy.queuedIntent || ['type', 'damage', 'target', 'amount', 'targets'].some(key => JSON.stringify(queued[key]) !== JSON.stringify(enemy.queuedIntent[key]))) throw Error('준비 의도 오류');
        }
      }
      return true;
    }
  }
  const catalog=typeof module!=='undefined'?require('./party-expedition-catalog.js'):window.PartyExpeditionCatalog;
  if(!catalog)throw Error('카드 계열 모듈을 먼저 불러와야 합니다.');
  catalog.install(CARDS);
  function cardDefinition(kind,cardSet){const base=CARDS[kind];return base?catalog.variant(base,kind,cardSet):undefined;}
  const api = { Battle, CARDS, ROLES, cardDefinition };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PartyExpedition = api;
})(typeof window !== 'undefined' ? window : globalThis);
