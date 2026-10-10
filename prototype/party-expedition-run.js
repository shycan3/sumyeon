(function (root) {
  'use strict';
  const Combat = typeof module !== 'undefined' ? require('./party-expedition-core.js') : root.PartyExpedition;
  if (!Combat) throw new Error('전투 모듈을 먼저 불러와야 합니다.');
  const { Battle, CARDS, ROLES } = Combat;
  const copy = value => JSON.parse(JSON.stringify(value));
  const VERSION = 'expedition-run-2';
  const MAP_VERSION = 'expedition-map-1';
  const COMBAT_NODES = ['battle', 'elite', 'boss'];
  const STOP_LABELS = { camp: '정박지', shop: '유실물 상점', event: '관측실' };
  const PHASES = ['map', 'battle', 'reward', 'interlude', 'won', 'lost'];
  const REWARD_GROUPS = [
    ['burst', 'jab', 'sweep', 'finisher', 'impale', 'undertow', 'sunder'],
    ['fortress', 'riposte', 'bulwark', 'mend', 'rally', 'hold'],
    ['draw', 'focus', 'expose', 'echo', 'feint', 'lockdown', 'salvage']
  ];
  const LINK_GROUPS=[
    [...REWARD_GROUPS[0],'pursuit'],REWARD_GROUPS[1],
    [...REWARD_GROUPS[2],'pressurevalve','beacon']
  ];
  const TACTIC_GROUPS=[[...LINK_GROUPS[0],'deepdive'],[...LINK_GROUPS[1],'bastion'],[...LINK_GROUPS[2],'mobilize']];
  const FULL_GROUPS=[['assault'],['ward'],['disrupt','cycle','repair']].map(families=>Object.keys(CARDS).filter(k=>k!=='basic'&&families.includes(CARDS[k].family)));
  const RECORD_THEMES={opening:{name:'틈새 기록',text:'약화·노출과 후속 공격·드로우'},bulwark:{name:'등불 기록',text:'보호와 반격·공격·회복'},surge:{name:'해류 기록',text:'에너지 준비·보존·X 운용'},recycle:{name:'귀환 기록',text:'회수와 다음 손패 보관'}};
  const RARITY_ODDS={battle:{rare:3,uncommon:37},elite:{rare:10,uncommon:40},shop:{rare:9,uncommon:37},event:{rare:10,uncommon:45}};
  const PATTERNS = {
    hunter: { name: '사냥꾼', threat: '대상을 바꾸는 집중 공격', hp: 26, damage: 8, areaDamage: 3, color: '#f3a38f' },
    sweep: { name: '파문체', threat: '약한 전체 공격과 준비', hp: 23, damage: 7, areaDamage: 3, color: '#b39be5' },
    sentinel: { name: '문지기', threat: '보호를 두른 뒤 강한 공격', hp: 30, damage: 8, areaDamage: 3, color: '#deb874' },
    leech: { name: '흡수체', threat: '가장 다친 동료를 노리는 공격', hp: 25, damage: 7, areaDamage: 3, color: '#accc82' },
    conductor: { name: '관측자', threat: '전체 공격과 준비 후 집중 공격', hp: 25, damage: 7, areaDamage: 4, color: '#88cad3' },
    boss: { name: '심층의 파수꾼', threat: '집중 공격과 전체 공격을 번갈아 준비', hp: 68, damage: 12, areaDamage: 5, color: '#d9a4ef' }
  };
  class Run {
    constructor(options = {}) {
      const party = options.party || ['navigator', 'sounder', 'salvager', 'lightkeeper'];
      const difficulty = options.difficulty || 'normal';
      const breakMode = options.breakMode === true ? 'on' : options.breakMode === false ? 'off' : (options.breakMode || 'off');
      const seed = options.seed === undefined ? 20261009 : options.seed;
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('원정 시드 오류');
      if (!['normal', 'calm'].includes(difficulty) || !['off', 'on'].includes(breakMode)) throw new Error('원정 규칙 오류');
      if (!Array.isArray(party) || party.length !== 4 || new Set(party).size !== 4 || party.some(id => !ROLES.some(role => role.id === id))) throw new Error('서로 다른 동료 4명을 선택하세요.');
      this.s = {
        version: VERSION, contentVersion:options.contentVersion||'draft-1', phase: 'map', floor: 0, seed: seed || 0xa341316c, initialSeed: seed,
        party: [...party], difficulty, breakMode, gold: 15, nextCard: 10,
        deck: ['strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'check', 'suppress'].map((kind, index) => ({ id: 'r' + index, kind, upgraded: false })),
        allies: party.map(id => ({ id, hp: 30, max: 30 })), choices: [], offers: [], interlude: null,
        route: null, history: [], actions: [], battlesWon: 0
      };
      this.battle = null;
      if(this.s.contentVersion==='draft-1'){this.s.rewardOffset=-2;this.s.rewardSeed=((seed^0x85ebca6b)>>>0)||1;}
      this.s.map = this.generateMap();
      this.createChoices();
      this.assert();
    }
    random() {
      let x = this.s.seed;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.s.seed = x >>> 0;
      return this.s.seed / 4294967296;
    }
    select(values) { return values[Math.floor(this.random() * values.length)]; }
    enemy(pattern, index, hp, floor = this.s.floor) {
      const base = PATTERNS[pattern];
      const calm = this.s.difficulty === 'calm';
      const total = hp === undefined ? base.hp + floor * 3 : hp;
      return {
        id: 'f' + floor + '-e' + index, name: base.name, pattern,
        hp: Math.max(1, Math.round(total * (calm ? .8 : 1))),
        damage: Math.max(1, Math.round((base.damage + Math.floor(floor / 3)) * (calm ? .8 : 1))),
        areaDamage: Math.max(1, Math.round((base.areaDamage + Math.floor(floor / 4)) * (calm ? .8 : 1))),
        toughnessMax: pattern === 'boss' ? 8 : 6, color: base.color
      };
    }
    generateMap() {
      // Map randomness is independent of combat, rewards and events. Looking ahead,
      // saving, and restoring cannot consume or reroll the active run RNG.
      let mapSeed = ((this.s.initialSeed >>> 0) ^ 0x9e3779b9) >>> 0 || 0xa341316c;
      const random = () => {
        mapSeed ^= mapSeed << 13; mapSeed ^= mapSeed >>> 17; mapSeed ^= mapSeed << 5;
        mapSeed >>>= 0;
        return mapSeed / 4294967296;
      };
      const shuffle = values => {
        const result = [...values];
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      };
      const encounters = [
        [['hunter'], ['sentinel']],
        [['sweep'], ['leech']],
        [['hunter', 'sweep'], ['leech', 'conductor']],
        [['sentinel'], ['conductor']],
        [['leech', 'hunter'], ['sweep', 'sentinel']],
        [['sentinel', 'conductor'], ['hunter', 'leech']],
        [['sentinel'], ['hunter', 'conductor']],
        [['boss', 'conductor']]
      ];
      const nodes = [{ id: 'start', type: 'start', floor: -1, lane: 1, label: '잠항 시작' }];
      const edges = [];
      for (let floor = 0; floor < 8; floor++) {
        const layouts = floor === 7 ? encounters[floor] : shuffle([...encounters[floor], encounters[floor][Math.floor(random() * 2)]]);
        const stops = floor === 7 ? [null] : shuffle(['camp', 'shop', 'event']);
        layouts.forEach((patterns, index) => {
        const interlude = stops[index];
        const enemies = patterns.map((pattern, enemyIndex) => {
          let hp;
          if (floor === 2) hp = enemyIndex === 0 ? 23 : 21;
          if (floor === 3) hp = pattern === 'sentinel' ? 43 : 39;
          if (floor === 4) hp = enemyIndex === 0 ? 29 : 26;
          if (floor === 5) hp = enemyIndex === 0 ? 32 : 29;
          if (floor === 6) hp = patterns.length === 1 ? 57 : enemyIndex === 0 ? 32 : 28;
          if (floor === 7) hp = enemyIndex === 0 ? 68 : 18;
          return this.enemy(pattern, enemyIndex, hp, floor);
        });
        const after = interlude === 'camp' ? '회복 / 카드 강화 / 제거' : interlude === 'shop' ? '카드 구매 / 회복 / 제거' : interlude === 'event' ? '기록 선택 / 회복 / 강화' : '완성한 덱으로 최종 전투';
        const type = floor === 7 ? 'boss' : (floor === 3 || floor === 6) && patterns.length === 1 && patterns[0] === 'sentinel' ? 'elite' : 'battle';
        const route = {
          id: 'f' + floor + '-path' + index,
          name: floor === 7 ? '최심부 · 파수꾼' : enemies.map(enemy => enemy.name).join(' + ') + ' · ' + STOP_LABELS[interlude] + ' 경유',
          description: enemies.map(enemy => enemy.name + ' HP ' + enemy.hp).join(' · ') + ' / 전투 후 ' + after,
          threat: patterns.map(pattern => PATTERNS[pattern].threat).join(' + '),
          enemies, interlude
        };
        if(this.s.contentVersion==='draft-1'){
          route.rewardTier=type;
          if(type==='elite')enemies.forEach(enemy=>{enemy.hp=Math.round(enemy.hp*1.15);enemy.damage+=2;enemy.areaDamage+=1;});
          route.description=enemies.map(enemy=>enemy.name+' HP '+enemy.hp).join(' · ')+' / 전투 후 '+after;
          if(interlude==='event')route.recordTheme=Object.keys(RECORD_THEMES)[(this.s.initialSeed+floor*3+index)%4];
        }
        nodes.push({ id: route.id, type, floor, lane: floor === 7 ? 1 : index, label: floor === 7 ? '심층의 파수꾼' : enemies.map(enemy => enemy.name).join(' + '), route });
        if (interlude) {
          const stop = { id: route.id + '-stop', type: interlude, floor, lane: index, label: STOP_LABELS[interlude] };
          nodes.push(stop);
          edges.push({ from: route.id, to: stop.id });
        }
        });
      }
      for (let lane = 0; lane < 3; lane++) edges.push({ from: 'start', to: 'f0-path' + lane });
      for (let floor = 0; floor < 7; floor++) for (let lane = 0; lane < 3; lane++) {
        const from = 'f' + floor + '-path' + lane + '-stop';
        if (floor === 6) {
          edges.push({ from, to: 'f7-path0' });
        } else {
          edges.push({ from, to: 'f' + (floor + 1) + '-path' + lane });
          // The middle lane chooses one neighbouring branch, never all three.
          // Some outer routes stay narrow, making future service access matter.
          if (lane === 1 || random() < .7) {
            const neighbour = lane === 0 ? 1 : lane === 2 ? 1 : random() < .5 ? 0 : 2;
            edges.push({ from, to: 'f' + (floor + 1) + '-path' + neighbour });
          }
        }
      }
      return { version: MAP_VERSION, nodes, edges, trail: ['start'], current: 'start' };
    }
    availableNodes() {
      if (this.s.phase !== 'map') return [];
      const map = this.s.map;
      return map.edges.filter(edge => edge.from === map.current).map(edge => map.nodes.find(node => node.id === edge.to)).filter(node => node && COMBAT_NODES.includes(node.type) && node.floor === this.s.floor);
    }
    mapView() {
      const map = this.s.map;
      return { nodes: copy(map.nodes), edges: copy(map.edges), trail: [...map.trail], current: map.current, available: this.availableNodes().map(node => node.id) };
    }
    visitNode(id) {
      const map = this.s.map;
      if (map.current === id) return;
      if (!map.edges.some(edge => edge.from === map.current && edge.to === id) || map.trail.includes(id)) throw new Error('이어진 지도 경로를 선택하세요.');
      map.trail.push(id); map.current = id;
    }
    createChoices() {
      this.s.choices = this.availableNodes().map(node => copy(node.route));
      this.s.offers = [];
      this.s.interlude = null;
      this.s.route = null;
    }
    transact(action) {
      const previous = this.snapshot();
      try {
        const value = action();
        this.assert();
        return value;
      } catch (error) {
        const restored = this.constructor.restore(previous);
        this.s = restored.s; this.battle = restored.battle;
        throw error;
      }
    }
    requirePhase(phase) { if (this.s.phase !== phase) throw new Error('현재 단계에서 할 수 없는 선택입니다.'); }
    choosePath(index) {
      return this.transact(() => {
        this.requirePhase('map');
        if (typeof index === 'string') index = this.s.choices.findIndex(route => route.id === index);
        if (!Number.isInteger(index) || !this.s.choices[index] || !this.availableNodes().some(node => node.id === this.s.choices[index].id)) throw new Error('유효하지 않은 경로입니다.');
        const route = copy(this.s.choices[index]);
        const seed = Math.floor(this.random() * 0x100000000) >>> 0;
        const battle = new Battle({ party: [...this.s.party], deck: copy(this.s.deck), allies: copy(this.s.allies), enemies: copy(route.enemies), seed, breakMode: this.s.breakMode === 'on',...(this.s.contentVersion==='draft-1'?{cardSet:'draft-1'}:{}) });
        this.visitNode(route.id);
        this.s.route = route;
        this.s.phase = 'battle';
        this.s.offers = [];
        this.battle = battle;
        return battle.snapshot();
      });
    }
    play(cardId, actorId, targetId, choice) {
      return this.transact(() => {
        this.requirePhase('battle');
        const result = this.battle.play(cardId, actorId, targetId, choice);
        this.syncBattle();
        return result;
      });
    }
    discardForSounder(cardId) {
      return this.transact(() => {
        this.requirePhase('battle');
        const result = this.battle.discardForSounder(cardId);
        this.syncBattle();
        return result;
      });
    }
    endRound() {
      return this.transact(() => {
        this.requirePhase('battle');
        const result = this.battle.endRound();
        this.syncBattle();
        return result;
      });
    }
    syncBattle() {
      // A completed battle may remain available for the result view. It cannot award twice
      // or overwrite healing performed in the subsequent interlude.
      if (this.s.phase !== 'battle') return;
      this.s.allies = this.battle.s.allies.map(ally => ({ id: ally.id, hp: ally.hp, max: ally.max }));
      if (this.battle.s.status === 'playing') return;
      if (this.battle.s.status === 'lost') {
        this.s.phase = 'lost';
        this.s.history.push({ floor: this.s.floor, nodeId: this.s.route.id, route: this.s.route.name, result: 'lost', rounds: this.battle.s.round, survivors: 0, reward: null });
        return;
      }
      const earned = 8 + this.s.floor * 2 + (this.s.contentVersion==='draft-1'&&this.s.route.rewardTier==='elite'?4:0);
      this.s.gold += earned;
      this.s.battlesWon++;
      this.s.history.push({
        floor: this.s.floor, nodeId: this.s.route.id, route: this.s.route.name, result: 'won', rounds: this.battle.s.round,
        survivors: this.s.allies.filter(ally => ally.hp > 0).length,
        hp: this.s.allies.map(ally => ({ id: ally.id, hp: ally.hp })), goldEarned: earned, reward: null
      });
      if (this.s.floor === 7) {
        this.s.phase = 'won'; this.s.offers = []; this.s.interlude = null;
      } else if (this.s.floor < 6 || this.s.contentVersion==='draft-1'&&this.s.route.rewardTier==='elite') {
        this.s.offers = this.rewardOffers(); this.s.phase = 'reward';
      } else {
        this.createInterlude();
      }
    }
    rewardOffers() {
      if(this.s.contentVersion==='draft-1')return this.rollRewards(this.s.route?.rewardTier==='elite'?'elite':'battle');
      if(this.s.contentVersion==='cards100-1')return FULL_GROUPS.map(group=>this.select(group));
      // Every choice contains attack, survival and utility possibilities. No required combo is guaranteed.
      const latest=this.s.contentVersion==='tactics-1',linked=latest||this.s.contentVersion==='links-1';
      const groups=latest?TACTIC_GROUPS:linked?LINK_GROUPS:REWARD_GROUPS,offers=[];
      groups.forEach((group,index)=>{
        let pool=linked&&this.s.floor<2&&index===2?['expose','beacon','pressurevalve','salvage']:group;
        if(latest&&this.s.floor===2&&index===0)pool=['finisher','deepdive'];
        if(latest&&this.s.floor===3&&index===1)pool=['bastion','mobilize'];
        offers.push(this.select(pool.filter(kind=>CARDS[kind]&&!offers.includes(kind))));
      });
      return offers;
    }
    rewardRandom(){let x=this.s.rewardSeed;x^=x<<13;x^=x>>>17;x^=x<<5;this.s.rewardSeed=x>>>0;return this.s.rewardSeed/4294967296;}
    rollRewards(context,theme){
      const odds=RARITY_ODDS[context];if(!odds||theme&&!RECORD_THEMES[theme])throw Error('카드 보상 종류 오류');
      const combat=['battle','elite'].includes(context),offers=[];
      for(let slot=0;slot<3;slot++){
        const roll=this.rewardRandom()*100,rare=odds.rare+(combat?this.s.rewardOffset:0);
        const rarity=roll<rare?'rare':roll<rare+odds.uncommon?'uncommon':'common';
        if(combat)this.s.rewardOffset=rarity==='rare'?-2:Math.min(30,this.s.rewardOffset+2);
        let pool=Object.keys(CARDS).filter(k=>k!=='basic'&&CARDS[k].rarity===rarity&&!offers.includes(k));
        if(theme&&slot===2){pool=pool.filter(k=>CARDS[k].linkTags.includes(theme));if(!pool.length)pool=Object.keys(CARDS).filter(k=>k!=='basic'&&CARDS[k].rarity==='uncommon'&&CARDS[k].linkTags.includes(theme)&&!offers.includes(k));if(!pool.length)throw Error('기록 계열 후보가 없습니다.');}
        offers.push(pool[Math.floor(this.rewardRandom()*pool.length)]);
      }
      return offers;
    }
    rewardDescription(route=this.s.route,floor=this.s.floor){
      if(this.s.contentVersion!=='draft-1')return '';
      if(route?.rewardTier==='boss')return '최종 전투 · 원정 완료';
      const elite=route?.rewardTier==='elite';
      return floor===6&&!elite?'전투 카드 보상 없음 · 정비 후 최심부':elite?'강적 보상 · 희귀 확률 증가 · 기록 조각 +4':'전투 보상 · 계열 제한 없이 3장 중 선택';
    }
    recordDescription(route=this.s.route){const theme=RECORD_THEMES[route?.recordTheme];return theme?`${theme.name} · ${theme.text} 후보 1장 포함`:'';}
    addCard(kind) {
      const card = { id: 'r' + this.s.nextCard++, kind, upgraded: false };
      this.s.deck.push(card);
      return card;
    }
    chooseReward(kind) {
      return this.transact(() => {
        this.requirePhase('reward');
        if (kind !== null && !this.s.offers.includes(kind)) throw new Error('제시된 카드 중에서 선택하세요.');
        if (kind !== null) this.addCard(kind);
        this.s.history[this.s.history.length - 1].reward = kind;
        this.s.offers = [];
        this.createInterlude();
        return this.snapshot();
      });
    }
    createInterlude() {
      const type = this.s.route.interlude || 'camp';
      this.visitNode(this.s.route.id + '-stop');
      this.s.phase = 'interlude';
      this.s.offers = [];
      this.s.interlude = {
        type,
        description: type === 'camp' ? '1회 선택: 전원 HP +6 · 쓰러진 동료 HP 10 복귀 / 카드 1장 강화 / 카드 1장 제거' : type === 'shop' ? '구매와 회복을 마친 뒤 출발하세요. 쓰러진 동료도 회복으로 복귀합니다.' : '1회 선택: 기록 카드 획득 / 전원 HP +4 · 쓰러진 동료 HP 8 복귀 / 카드 1장 강화',
        offers: type === 'camp' ? [] : this.s.contentVersion==='draft-1'?this.rollRewards(type==='shop'?'shop':'event',type==='event'?this.s.route.recordTheme:undefined):this.rewardOffers(),
        prices: { card: 20, heal: 12, remove: 12 }, healed: false
      };
    }
    requireCard(cardId, removing = false) {
      const card = this.s.deck.find(item => item.id === cardId);
      if (!card) throw new Error('덱에 없는 카드입니다.');
      if (removing && this.s.deck.length <= 6) throw new Error('덱에는 최소 6장을 남겨야 합니다.');
      return card;
    }
    spend(amount) {
      if (this.s.gold < amount) throw new Error('기록 조각이 부족합니다.');
      this.s.gold -= amount;
    }
    heal(amount, revive) {
      this.s.allies.forEach(ally => { ally.hp = ally.hp <= 0 ? Math.min(ally.max, revive) : Math.min(ally.max, ally.hp + amount); });
    }
    nextFloor() {
      this.s.floor++;
      this.s.phase = 'map';
      this.createChoices();
    }
    chooseInterlude(action, argument) {
      return this.transact(() => {
        this.requirePhase('interlude');
        const interlude = this.s.interlude;
        const type = interlude.type;
        if (!['heal', 'upgrade', 'remove', 'buy', 'learn', 'continue'].includes(action)) throw new Error('유효하지 않은 정비 행동입니다.');
        if (action === 'continue') {
          this.s.actions.push({ floor: this.s.floor, type, action });
          this.nextFloor();
          return this.snapshot();
        }
        if (type === 'shop') {
          if (!['buy', 'heal', 'remove'].includes(action)) throw new Error('상점에서 할 수 없는 행동입니다.');
          if (action === 'buy') {
            if (!interlude.offers.includes(argument)) throw new Error('판매 중인 카드가 아닙니다.');
            this.spend(interlude.prices.card);
            this.addCard(argument);
            interlude.offers.splice(interlude.offers.indexOf(argument), 1);
          } else if (action === 'heal') {
            if (interlude.healed) throw new Error('이 상점의 회복은 이미 사용했습니다.');
            this.spend(interlude.prices.heal); this.heal(10, 10); interlude.healed = true;
          } else {
            const card = this.requireCard(argument, true);
            this.spend(interlude.prices.remove);
            this.s.deck.splice(this.s.deck.indexOf(card), 1);
          }
        } else {
          const valid = type === 'camp' ? ['heal', 'upgrade', 'remove'] : ['heal', 'upgrade', 'learn'];
          if (!valid.includes(action)) throw new Error('이 장소에서 할 수 없는 행동입니다.');
          if (action === 'heal') this.heal(type === 'camp' ? 6 : 4, type === 'camp' ? 10 : 8);
          else if (action === 'upgrade') {
            const card = this.requireCard(argument);
            if (card.upgraded || !CARDS[card.kind].upgrade) throw new Error('강화할 수 없는 카드입니다.');
            card.upgraded = true;
          } else if (action === 'remove') {
            const card = this.requireCard(argument, true);
            this.s.deck.splice(this.s.deck.indexOf(card), 1);
          } else {
            if (!interlude.offers.includes(argument)) throw new Error('제시된 기록 카드가 아닙니다.');
            this.addCard(argument);
          }
        }
        this.s.actions.push({ floor: this.s.floor, type, action, card: argument || null });
        if (type !== 'shop') this.nextFloor();
        return this.snapshot();
      });
    }
    definition(value) {
      const card = typeof value === 'object' ? value : this.s.deck.find(item => item.id === value) || { kind: value, upgraded: false };
      const base = Combat.cardDefinition(card.kind,['draft-1','voyage-1','voyage-2'].includes(this.s.contentVersion)?'draft-1':undefined);
      if (!base) throw new Error('알 수 없는 카드입니다.');
      return copy({ ...base, ...(card.upgraded ? base.upgrade : {}), kind: card.kind, upgraded: !!card.upgraded });
    }
    viewDeck() { return this.s.deck.map(card => ({ ...copy(card), definition: this.definition(card) })); }
    snapshot() { return { ...copy(this.s), battle: this.battle ? this.battle.snapshot() : null }; }
    migrateMap() {
      // Legacy v2 saves contain their active choices and complete battle snapshot.
      // Keep these verbatim; only the missing future graph is generated separately.
      const map = this.generateMap();
      map.legacy = true;
      this.s.map = map;
      const graft = route => {
        if (!route || typeof route.id !== 'string') return;
        const floorMatch = /^f([0-7])-path([0-2])$/.exec(route.id);
        if (!floorMatch) throw new Error('저장된 경로 번호 오류');
        const floor = Number(floorMatch[1]), lane = floor === 7 ? 1 : Number(floorMatch[2]);
        const existing = map.nodes.find(node => node.id === route.id);
        if (!existing) throw new Error('저장된 경로를 지도에 연결할 수 없습니다.');
        existing.floor = floor; existing.lane = lane;
        existing.route = copy(route);
        existing.label = route.enemies.map(enemy => enemy.name).join(' + ');
        existing.type = floor === 7 ? 'boss' : (floor === 3 || floor === 6) && route.enemies.length === 1 && route.enemies[0].pattern === 'sentinel' ? 'elite' : 'battle';
        if (floor < 7) {
          const stop = map.nodes.find(node => node.id === route.id + '-stop');
          stop.type = route.interlude || 'camp'; stop.label = STOP_LABELS[stop.type];
        }
      };
      this.s.choices.forEach(graft);
      graft(this.s.route);
      const append = id => {
        if (map.current === id) return;
        if (!map.nodes.some(node => node.id === id) || map.trail.includes(id)) throw new Error('저장된 방문 기록 오류');
        if (!map.edges.some(edge => edge.from === map.current && edge.to === id)) map.edges.push({ from: map.current, to: id });
        map.trail.push(id); map.current = id;
      };
      const knownNode = history => {
        const candidates = map.nodes.filter(node => node.floor === history.floor && COMBAT_NODES.includes(node.type));
        if (history.nodeId && candidates.some(node => node.id === history.nodeId)) return history.nodeId;
        if (this.s.route && this.s.floor === history.floor && this.s.route.name === history.route) return this.s.route.id;
        const matching = candidates.find(node => node.route.name === history.route);
        if (matching) return matching.id;
        const action = this.s.actions.find(item => item.floor === history.floor);
        const type = action ? action.type : history.route.includes('정박지') ? 'camp' : history.route.includes('상점') ? 'shop' : history.route.includes('관측실') ? 'event' : null;
        // In the original two-choice v2 map, camp was always path0 and the
        // alternate shop/event was always path1. These history labels identify
        // the actual visited lane even when the new map places that stop elsewhere.
        if (['정박지 경유', '유실물 상점 경유', '관측실 경유'].includes(history.route)) return 'f' + history.floor + '-path' + (type === 'camp' ? 0 : 1);
        if (history.floor === 7) return 'f7-path0';
        const matchingStop = candidates.find(node => node.route.interlude === type);
        return (matchingStop || candidates[0]).id;
      };
      this.s.history.forEach(history => {
        const id = knownNode(history);
        append(id);
        if (history.result === 'won' && history.floor < 7 && (history.floor < this.s.floor || this.s.phase === 'interlude')) {
          const stop = map.nodes.find(node => node.id === id + '-stop');
          const action = this.s.actions.find(item => item.floor === history.floor);
          const knownType = action ? action.type : history.route.includes('정박지') ? 'camp' : history.route.includes('상점') ? 'shop' : history.route.includes('관측실') ? 'event' : null;
          if (knownType) {
            stop.type = knownType; stop.label = STOP_LABELS[knownType];
            const combat = map.nodes.find(node => node.id === id);
            combat.route.interlude = knownType;
            if (history.floor < this.s.floor) combat.route.name = history.route;
          }
          append(stop.id);
        }
      });
      if (this.s.phase !== 'map' && this.s.route) {
        if (this.s.phase === 'interlude') {
          if (map.current !== this.s.route.id + '-stop') {
            append(this.s.route.id); append(this.s.route.id + '-stop');
          }
        } else append(this.s.route.id);
      }
      if (this.s.phase === 'map') {
        // Do not add a new third choice to an already exposed legacy decision.
        map.edges = map.edges.filter(edge => edge.from !== map.current);
        this.s.choices.forEach(route => map.edges.push({ from: map.current, to: route.id }));
      }
    }
    static restore(snapshot) {
      if (!snapshot || snapshot.version !== VERSION) throw new Error('다른 원정 저장 버전입니다.');
      const run = Object.create(Run.prototype);
      run.s = copy(snapshot);
      const battle = run.s.battle;
      delete run.s.battle;
      run.battle = battle ? Battle.restore(battle) : null;
      if (!run.s.map) run.migrateMap();
      run.assert();
      return run;
    }
    assert() {
      const state = this.s;
      if(state.contentVersion!=null&&!['legacy','links-1','tactics-1','cards100-1','draft-1'].includes(state.contentVersion))throw new Error('원정 콘텐츠 버전 오류');
      if(state.contentVersion==='draft-1'&&(!Number.isInteger(state.rewardOffset)||state.rewardOffset<-2||state.rewardOffset>30||!Number.isInteger(state.rewardSeed)||state.rewardSeed<1||state.rewardSeed>0xffffffff))throw Error('카드 보상 확률 상태 오류');
      if (state.version !== VERSION || !PHASES.includes(state.phase) || !Number.isInteger(state.floor) || state.floor < 0 || state.floor > 7) throw new Error('원정 단계 오류');
      if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > 0xffffffff || !['normal', 'calm'].includes(state.difficulty) || !['off', 'on'].includes(state.breakMode)) throw new Error('원정 규칙 오류');
      if (state.party.length !== 4 || new Set(state.party).size !== 4 || state.party.some(id => !ROLES.some(role => role.id === id))) throw new Error('파티 오류');
      if (state.allies.length !== 4 || state.allies.some((ally, index) => ally.id !== state.party[index] || !Number.isInteger(ally.hp) || !Number.isInteger(ally.max) || ally.max <= 0 || ally.hp < 0 || ally.hp > ally.max)) throw new Error('동료 HP 오류');
      if (state.deck.length < 6 || new Set(state.deck.map(card => card.id)).size !== state.deck.length || state.deck.some(card => typeof card.id !== 'string' || !/^r\d+$/.test(card.id) || !CARDS[card.kind] || card.kind === 'basic' || typeof card.upgraded !== 'boolean')) throw new Error('원정 덱 오류');
      if (!Number.isInteger(state.nextCard) || state.nextCard < 10 || !Number.isInteger(state.gold) || state.gold < 0) throw new Error('원정 재화 오류');
      if (state.deck.some(card => Number(card.id.slice(1)) >= state.nextCard)) throw new Error('카드 사본 번호 오류');
      if (state.phase === 'map' && (!state.choices.length || state.choices.some(route => !route.enemies.length || route.enemies.length > 2))) throw new Error('경로 오류');
      if (state.phase === 'battle' && (!this.battle || this.battle.s.status !== 'playing')) throw new Error('진행 중 전투 오류');
      if (state.phase === 'reward' && (state.floor >= (state.contentVersion==='draft-1'?7:6) || state.offers.length !== 3 || new Set(state.offers).size !== 3 || state.offers.some(kind => !CARDS[kind]))) throw new Error('보상 오류');
      if (state.phase === 'interlude' && (!state.interlude || !['camp', 'shop', 'event'].includes(state.interlude.type))) throw new Error('정비 장소 오류');
      if (state.phase === 'won' && (state.floor !== 7 || state.battlesWon !== 8)) throw new Error('원정 완료 오류');
      const map = state.map;
      if(state.contentVersion==='draft-1'&&map?.nodes.some(n=>n.route&&(n.route.rewardTier!==n.type||n.route.recordTheme&&!RECORD_THEMES[n.route.recordTheme])))throw Error('공개 보상 경로 오류');
      if(state.contentVersion==='draft-1'&&state.phase==='reward'&&state.floor===6&&state.route?.rewardTier!=='elite')throw Error('최심부 전 카드 보상 조건 오류');
      if (!map || map.version !== MAP_VERSION || !Array.isArray(map.nodes) || !Array.isArray(map.edges) || !Array.isArray(map.trail)) throw new Error('원정 지도 오류');
      const nodes = new Map(map.nodes.map(node => [node.id, node]));
      if (nodes.size !== map.nodes.length || !nodes.has('start') || !nodes.has('f7-path0') || map.trail[0] !== 'start' || map.trail.at(-1) !== map.current || new Set(map.trail).size !== map.trail.length) throw new Error('지도 방문 기록 오류');
      if (map.nodes.some(node => typeof node.id !== 'string' || !['start', 'battle', 'elite', 'camp', 'shop', 'event', 'boss'].includes(node.type) || !Number.isInteger(node.floor) || node.floor < -1 || node.floor > 7 || !Number.isInteger(node.lane) || node.lane < 0 || node.lane > 2 || !node.label || (COMBAT_NODES.includes(node.type) && (!node.route || node.route.id !== node.id || !node.route.enemies.length)))) throw new Error('지도 지점 오류');
      if (new Set(map.edges.map(edge => edge.from + '>' + edge.to)).size !== map.edges.length) throw new Error('지도 연결 중복');
      for (const edge of map.edges) {
        const from = nodes.get(edge.from), to = nodes.get(edge.to);
        if (!from || !to) throw new Error('존재하지 않는 지도 연결');
        const valid = from.type === 'start' ? COMBAT_NODES.includes(to.type) && to.floor === 0 : COMBAT_NODES.includes(from.type) ? ['camp', 'shop', 'event'].includes(to.type) && from.floor === to.floor && from.id + '-stop' === to.id : COMBAT_NODES.includes(to.type) && to.floor === from.floor + 1 && (map.legacy || to.type === 'boss' || Math.abs(from.lane - to.lane) <= 1);
        if (!valid) throw new Error('잘못된 지도 연결');
      }
      for (let i = 1; i < map.trail.length; i++) if (!nodes.has(map.trail[i]) || !map.edges.some(edge => edge.from === map.trail[i - 1] && edge.to === map.trail[i])) throw new Error('방문 경로 연결 오류');
      const current = nodes.get(map.current);
      if (!current) throw new Error('현재 지도 위치 오류');
      if (state.phase === 'map' && JSON.stringify(this.availableNodes().map(node => node.id)) !== JSON.stringify(state.choices.map(route => route.id))) throw new Error('공개 경로와 지도 연결이 다릅니다.');
      if (state.phase === 'map' && !(current.type === 'start' ? state.floor === 0 : ['camp', 'shop', 'event'].includes(current.type) && current.floor === state.floor - 1)) throw new Error('지도 진행 위치 오류');
      if (state.phase !== 'map' && (!state.route || !nodes.has(state.route.id) || JSON.stringify(nodes.get(state.route.id).route) !== JSON.stringify(state.route) || current.id !== (state.phase === 'interlude' ? state.route.id + '-stop' : state.route.id))) throw new Error('현재 경로와 지도 위치가 다릅니다.');
      if (state.phase === 'map' && state.choices.some(route => JSON.stringify(nodes.get(route.id).route) !== JSON.stringify(route))) throw new Error('지도 경로 내용이 다릅니다.');
      if (this.battle) {
        if(state.contentVersion==='draft-1'&&this.battle.s.cardSet!=='draft-1')throw Error('전투 카드 규칙이 원정과 다릅니다.');
        if (this.battle.s.allies.some((ally, index) => ally.id !== state.party[index])) throw new Error('전투와 원정 편성이 다릅니다.');
        this.battle.assert();
      }
      return true;
    }
  }
  const api = { Run, RECORD_THEMES, RARITY_ODDS };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PartyExpeditionRun = api;
})(typeof window !== 'undefined' ? window : globalThis);
