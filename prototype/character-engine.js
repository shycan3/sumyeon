'use strict';
(()=>{
  const D=window.GameData,C=window.CharacterData,Base=window.GameCore.Battle,AI=window.ActorAI,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class CharacterBattle extends Base{
    constructor(config,snapshot=null){
      const identity=snapshot?snapshot.identityVersion??0:config.identityVersion??(config.party?1:0);
      if(![0,1].includes(identity))throw Error('캐릭터 식별 규칙이 올바르지 않습니다.');
      const party=identity===1?(snapshot?snapshot.party:config.party||C.defaultParty()):null;
      if(identity===1&&!C.validParty(party)||identity===0&&(snapshot?.party||config.party))throw Error('캐릭터 파티가 올바르지 않습니다.');
      if(!snapshot&&identity===1)config={...config,playerProfiles:party.map(p=>C.character(p.characterId)),cards:config.cards.map(c=>{const bound=C.bindCard(c,party);return {...bound,actor:'a'+bound.casterSlot};})};
      super(config,snapshot);
      if(!snapshot&&config.contentRulesVersion===1)this.s.contentRulesVersion=1;
      if(!snapshot&&config.autoSupportVersion===1)this.s.autoSupportVersion=1;
      if((snapshot?snapshot.autoSupportVersion:config.autoSupportVersion)!==undefined&&![0,1].includes(snapshot?snapshot.autoSupportVersion:config.autoSupportVersion))throw Error('지원 판단 버전이 올바르지 않습니다.');
      if(this.s.contentRulesVersion!==undefined&&![0,1].includes(this.s.contentRulesVersion))throw Error('콘텐츠 버전이 올바르지 않습니다.');
      if(identity===0&&snapshot?.actors.some(a=>a.slot!==undefined))throw Error('이전 규칙의 슬롯 정보가 올바르지 않습니다.');
      if(identity===1){this.s.identityVersion=1;this.s.party=JSON.parse(JSON.stringify(party));for(const p of party){const a=this.get('a'+p.slot),c=C.character(p.characterId);if(snapshot&&(a?.slot!==p.slot||a.characterId!==c.id||a.role!==c.role))throw Error('저장된 파티와 전투 개체가 다릅니다.');if(!snapshot){a.slot=p.slot;a.characterId=c.id;a.name=c.name;}}for(const card of ['draw','hand','discard','excluded'].flatMap(k=>this.s.decks[0][k])){const bound=C.bindCard(card,party);if(card.casterSlot!==bound.casterSlot||card.actor!=='a'+bound.casterSlot)throw Error('카드 시전자 식별이 올바르지 않습니다.');}}

      for(const a of this.s.actors){const profile=a.side===0&&identity===1?C.character(a.characterId):null;if(!snapshot&&profile?.basicProfile){const b=profile.basicProfile;a.damage*=b.damage/D.roles[a.role].damage;a.range=b.range;a.speed=b.speed;a.period=b.period;}if(profile?.passive){if(!snapshot)a.passiveState={target:null,hits:0,procs:0};const p=a.passiveState;if(!p||!Number.isInteger(p.hits)||p.hits<0||p.hits>=profile.passive.hits||!Number.isInteger(p.procs)||p.procs<0||(p.target!==null&&!this.s.actors.some(e=>e.id===p.target&&e.side!==a.side)))throw Error('패시브 상태가 올바르지 않습니다.');}else if(a.passiveState!==undefined)throw Error('패시브 소유자가 올바르지 않습니다.');}

      this.s.combatRulesVersion??=snapshot?0:config.combatRulesVersion??0;if(![0,1].includes(this.s.combatRulesVersion))throw Error('전투 판단 버전이 올바르지 않습니다.');if(this.s.autoSupportVersion===1&&this.s.combatRulesVersion!==1)throw Error('지원 판단과 전투 규칙이 다릅니다.');
      if(!snapshot){for(const a of this.s.actors.filter(a=>a.side===0)){const c=identity===1?C.character(party[a.slot].characterId):C.characters[a.role];a.characterId=c.id;a.name=c.name;}this.s.moments=[];this.s.stats.chainHits=0;this.s.stats.covered=0;this.s.stats.counters=0;this.s.stats.signatureHits=0;}
      this.s.spatialRulesVersion??=snapshot?0:config.spatialRulesVersion??0;if(![0,1].includes(this.s.spatialRulesVersion))throw Error('공간 효과 버전이 올바르지 않습니다.');
      this.s.formationVersion??=snapshot?1:config.formationVersion??1;if(![1,2].includes(this.s.formationVersion))throw Error('배치 버전이 올바르지 않습니다.');
      if(!snapshot){if(config.formation!=null&&!window.Formation.valid(config.formation,this.s.formationVersion))throw Error('전투 배치가 올바르지 않습니다.');this.s.formation=config.formation?[...config.formation]:null;if(this.s.formation)for(let i=0;i<4;i++)Object.assign(this.get('a'+i),window.Formation.point(this.s.formation[i],this.s.formationVersion));}
      if(this.s.formation!=null&&!window.Formation.valid(this.s.formation,this.s.formationVersion))throw Error('전투 배치가 올바르지 않습니다.');
      if(!snapshot&&config.encounter.profileVersion===1){
        const deck=this.s.decks[1];deck.draw=[];deck.hand=[];deck.discard=[];deck.excluded=[];let serial=0;
        config.encounter.enemies.forEach((profile,i)=>{
          const a=this.get('e'+i),scale=(config.elite?1.08:1)*(.88+config.depth*.015);
          if(profile.damage!==undefined)a.damage=profile.damage*scale;
          if(profile.period!==undefined)a.period=profile.period;
          if(profile.x!==undefined)a.x=profile.x;if(profile.y!==undefined)a.y=profile.y;
          const keys=profile.cards||Object.keys(D.cards).filter(k=>D.cards[k].role===a.role&&!D.cards[k].spatial).slice(0,5);
          if(!keys.length||keys.some(k=>!D.cards[k]&&!D.hostile[k]))throw Error('적 전투 카드 구성이 올바르지 않습니다.');
          for(let j=0;j<5;j++)deck.draw.push({id:'enemy-profile:'+serial++,key:keys[j%keys.length],actor:a.id,upgraded:false});
        });
        this.random.shuffle(deck.draw);this.refill(1);this.syncSeed();
      }
      this.s.enemyTactics??=snapshot?null:CharacterBattle.enemyTacticsFor(config.encounter);if(!CharacterBattle.validEnemyTactics(this.s.enemyTactics,this.s.actors))throw Error('적 전술 상태가 올바르지 않습니다.');
      if(this.s.aiVersion!==undefined&&this.s.aiVersion!==2)throw Error('지원하지 않는 전투 AI 버전입니다.');
      this.s.targetingRulesVersion??=snapshot?0:config.targetingRulesVersion??1;if(![0,1].includes(this.s.targetingRulesVersion))throw Error('표적 규칙 버전이 올바르지 않습니다.');
      const migrate=this.s.aiVersion===undefined;this.s.aiVersion=2;
      for(const a of this.s.actors){if(migrate)a.ai=AI.defaults(a,this.s.t);else if(!a.ai)throw Error('전투 AI 상태가 누락됐습니다.');}
      if(this.s.effectRulesVersion!==undefined&&this.s.effectRulesVersion!==1)throw Error('지원하지 않는 전투 효과 버전입니다.');
      this.s.effectRulesVersion=1;this.effectRules=true;this.visuals=[];this.visualSerial=0;
      if(this.s.actionRulesVersion!==undefined&&this.s.actionRulesVersion!==1)throw Error('지원하지 않는 행동 처리 버전입니다.');
      this.s.actionRulesVersion=1;this.s.actionSerial??=0;this.s.actionResults??=[];
      if(this.s.recap!==undefined&&!CharacterBattle.validRecap(this.s.recap,this.s.t,this.s.actors))throw Error('전투 복기 기록이 올바르지 않습니다.');
      this.s.recap??={version:1,from:this.s.t,events:[]};
      if(this.s.autoHold!==undefined&&!CharacterBattle.validAutoHold(this.s.autoHold,this.s.t))throw Error('오토 보유 상태가 올바르지 않습니다.');this.s.autoHold??=null;this.s.stats.autoHolds??=0;if(!Number.isSafeInteger(this.s.stats.autoHolds)||this.s.stats.autoHolds<0)throw Error('오토 보유 횟수가 올바르지 않습니다.');
      if(this.s.battleLimit===undefined)this.s.battleLimit=snapshot?null:180;if(!CharacterBattle.validDeadline(this.s))throw Error('교전 제한 시간이 올바르지 않습니다.');
      this.s.autoPolicy??=snapshot?'balanced':config.autoPolicy||'balanced';
      if(!['balanced','attack','protect'].includes(this.s.autoPolicy))throw Error('오토 방침이 올바르지 않습니다.');
      if(!CharacterBattle.validAutoLast(this.s.autoLast,this.s.t,this.s.actors))throw Error('최근 오토 결정이 올바르지 않습니다.');
      this.s.autoTraitVersion??=snapshot?0:config.autoTraitVersion??1;if(![0,1].includes(this.s.autoTraitVersion))throw Error('특성 오토 버전이 올바르지 않습니다.');
      this.s.autoDecisions??=[];if(!CharacterBattle.validAutoDecisions(this.s.autoDecisions,this.s.t,this.s.actors,this.s.autoPolicy))throw Error('오토 결정 기록이 올바르지 않습니다.');
      this.s.mechanic??=config.encounter?.mechanic?CharacterBattle.mechanicState(config.encounter.mechanic):null;this.s.encounterName??=config.encounter?.name||null;if(this.s.mechanic){this.s.mechanic.pattern??=CharacterBattle.mechanicState().pattern;for(const a of this.s.actors)delete a.evadeHoldUntil;for(const e of this.s.events)if(e.key===(this.s.mechanic.pattern.attackKey||'boss_zone')){e.zone=true;e.shape??=this.s.mechanic.pattern.shape;}if(!CharacterBattle.validMechanic(this.s.mechanic,this.s.t,this.s.actors,this.s.events))throw Error('위험 구역 상태가 올바르지 않습니다.');}
      this.s.defensiveEnemy??=!snapshot&&config.encounter?.defensiveEnemy===true;if(typeof this.s.defensiveEnemy!=='boolean')throw Error('적 방어 운영 규칙이 올바르지 않습니다.');
      this.s.bossPhases??=!snapshot&&config.encounter?.phase2?{version:1,second:CharacterBattle.mechanicState(config.encounter.phase2).pattern,applied:false,at:null}:null;
      if(!CharacterBattle.validBossPhases(this.s))throw Error('보스 단계 기록이 올바르지 않습니다.');
      this.s.traits??={version:1,enabled:!snapshot&&config.traits!==false,keys:window.CardTraits.keys(this.s),protection:[],guardUntil:0,mark:null,last:null,charge:0,stats:{escort:0,pursuit:0,resonance:0},history:[]};
      if(!CharacterBattle.validTraits(this.s.traits,this.s.t,this.s.actors,window.CardTraits.keys(this.s)))throw Error('카드 특성 상태가 올바르지 않습니다.');
      this.traitLevels=Object.fromEntries(window.CardTraits.summary(this.s.traits.keys).map(r=>[r.id,r.level]));
      if(!snapshot&&config.tactic!==undefined&&config.tactic!==null&&config.tactic!=='relay')throw Error('지원하지 않는 원정 전술입니다.');
      this.s.runTactic??=!snapshot&&config.tactic==='relay'?{version:1,id:'relay',commands:0,transfers:0,links:0,seen:[],history:[]}:null;
      if(!CharacterBattle.validTactic(this.s.runTactic,this.s.t,this.s.actors))throw Error('원정 전술 기록이 올바르지 않습니다.');
      if(!CharacterBattle.validInsights(this.s.insights,this.s.t))throw Error('카드 기여도 기록이 올바르지 않습니다.');
      if(!this.s.insights){this.s.insights={version:1,from:this.s.t,complete:!snapshot,rows:{},shields:{},guardKey:null,firstKO:null};for(const c of this.s.decks[0].hand)this.insight(c.key,'drawn',1);}
      if(!CharacterBattle.validSpatialEvents(this.s))throw Error('공간 기술의 예고가 올바르지 않습니다.');
      for(const a of this.s.actors)if(!a.action){const e=this.s.events.find(e=>e.actor===a.id);if(e)this.adoptAction(e);}
    }
    static validPassiveStates(s){return Array.isArray(s?.actors)&&s.actors.every(a=>{const d=s.identityVersion===1&&a.side===0?C.character(a.characterId)?.passive:null,p=a.passiveState;return d?!!p&&Number.isSafeInteger(p.hits)&&p.hits>=0&&p.hits<d.hits&&Number.isSafeInteger(p.procs)&&p.procs>=0&&(p.target===null||s.actors.some(e=>e.id===p.target&&e.side!==a.side)):p===undefined;});}
    static validEnemyTactics(x,actors){return x==null||x.version===1&&Array.isArray(x.focus)&&x.focus.length<=8&&new Set(x.focus.map(r=>r?.actor)).size===x.focus.length&&x.focus.every(r=>r&&actors.some(a=>a.id===r.actor&&a.side===1)&&r.mode==='support'&&Number.isFinite(r.until)&&r.until>0&&r.until<=30);}
    static enemyTacticsFor(e){return e?.tacticsVersion===1?{version:1,focus:e.enemies.flatMap((r,i)=>r.focus?[{actor:'e'+i,mode:r.focus,until:r.focusUntil}]:[])}:null;}
    static validSpatialEvents(s){return !!s&&s.events.every(e=>{const d=D.cards[e.key];if(!d?.spatial)return e.spatialOrigin===undefined&&e.spatialAim===undefined;if(s.spatialRulesVersion!==1||e.spatial!==d.spatial||e.kind!==d.kind||e.radius!==d.radius)return false;if(d.spatial!=='line')return e.spatialOrigin===undefined&&e.spatialAim===undefined;const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=960&&p.y>=0&&p.y<=390;return point(e.spatialOrigin)&&point(e.spatialAim)&&e.length===d.length&&e.width===d.width;});}
    spatialGeometry(e){const d=e.spatial?e:this.definition({key:e.key}),a=this.get(e.actor),target=this.get(e.target);if(!a)return null;if(d.spatial==='circleHeal')return {kind:'circle',x:a.x,y:a.y,radius:d.radius};if(d.spatial==='line'){const from=e.spatialOrigin||a,to=e.spatialAim||e.center||target;if(!to)return null;const angle=Math.atan2(to.y-from.y,to.x-from.x);return {kind:'line',x:from.x,y:from.y,angle,length:d.length,width:d.width};}return null;}
    spatialFriends(e){const g=this.spatialGeometry(e);return g?this.alive(e.side).filter(a=>Math.hypot(a.x-g.x,a.y-g.y)<=g.radius):[];}
    lineTargets(e){const g=this.spatialGeometry(e);if(!g)return [];const cos=Math.cos(g.angle),sin=Math.sin(g.angle);return this.alive(1-e.side).filter(a=>{const dx=a.x-g.x,dy=a.y-g.y,along=dx*cos+dy*sin,across=-dx*sin+dy*cos;return along>=0&&along<=g.length&&Math.abs(across)<=g.width/2;});}
    static validInsights(x,t){
      if(x===undefined)return true;const num=n=>Number.isFinite(n)&&n>=0&&n<=1e9,key=k=>Object.hasOwn(D.cards,k),fields=['drawn','used','damage','healed','shield','blocks','shared','moved','boosts'];
      return !!(x&&x.version===1&&num(x.from)&&x.from<=t&&typeof x.complete==='boolean'&&x.rows&&typeof x.rows==='object'&&!Array.isArray(x.rows)&&Object.keys(x.rows).length<=40&&Object.entries(x.rows).every(([k,r])=>key(k)&&r&&fields.every(f=>num(r[f]))&&['drawn','used','blocks','moved','boosts'].every(f=>Number.isSafeInteger(r[f])))&&x.shields&&typeof x.shields==='object'&&!Array.isArray(x.shields)&&Object.keys(x.shields).length<=4&&Object.entries(x.shields).every(([id,k])=>/^a[0-3]$/.test(id)&&key(k))&&(x.guardKey===null||key(x.guardKey))&&(x.firstKO===null||x.firstKO&&num(x.firstKO.at)&&x.firstKO.at<=t&&/^a[0-3]$/.test(x.firstKO.actor)&&(x.firstKO.cause==='basic'||D.cards[x.firstKO.cause]||D.hostile[x.firstKO.cause])));
    }
    insight(key,field,amount){const x=this.s?.insights;if(!x||!D.cards[key]||!(amount>0))return;const r=x.rows[key]??={drawn:0,used:0,damage:0,healed:0,shield:0,blocks:0,shared:0,moved:0,boosts:0};r[field]+=amount;}
    refill(side){const before=new Set(this.s?.decks?.[0]?.hand.map(c=>c.id)||[]);super.refill(side);if(side===0&&this.s.insights)for(const c of this.s.decks[0].hand)if(!before.has(c.id))this.insight(c.key,'drawn',1);}
    replace(id){const before=new Set(this.s.decks[0].hand.map(c=>c.id)),ok=super.replace(id);if(ok)for(const c of this.s.decks[0].hand)if(!before.has(c.id))this.insight(c.key,'drawn',1);return ok;}
    definition(card){const d=super.definition(card);if(this.s?.runTactic&&this.traitLevel('pursuit')&&(!card.actor||card.actor.startsWith('a'))&&d.traits.includes('pursuit')&&window.GameCore.offense.includes(d.kind))d.time+=1;return d;}
    command(side,id,target){const c=side===0&&this.s.decks[0].hand.find(c=>c.id===id),charged=c&&this.definition(c).time>super.definition(c).time,ok=super.command(side,id,target);if(ok&&c){this.insight(c.key,'used',1);if(charged)this.s.runTactic.commands++;}return ok;}
    static validTactic(x,t,actors){if(x===null||x===undefined)return true;return !!(x.version===1&&x.id==='relay'&&['commands','transfers','links'].every(k=>Number.isSafeInteger(x[k])&&x[k]>=0&&x[k]<=100000)&&x.links<=x.transfers&&Array.isArray(x.seen)&&x.seen.length<=x.transfers&&x.seen.length<=100&&new Set(x.seen).size===x.seen.length&&x.seen.every(k=>typeof k==='string'&&k.length<=180)&&Array.isArray(x.history)&&x.history.length<=20&&x.history.every(e=>e&&Number.isFinite(e.at)&&e.at>=0&&e.at<=t&&['transfer','link'].includes(e.kind)&&Object.hasOwn(D.cards,e.key)&&actors?.some(a=>a.id===e.actor&&a.side===0)&&actors.some(a=>a.id===e.target&&a.side===1)));}
    tacticEvent(kind,e,target,from=null){const x=this.s.runTactic;if(!x)return;x[kind==='transfer'?'transfers':'links']++;x.history.push({kind,at:this.s.t,key:e.key,actor:e.actor,target:target.id});x.history=x.history.slice(-20);this.log(kind==='transfer'?'추격 릴레이 · 표식 전달 → '+target.name:'추격 릴레이 · 동료 후속 공격');this.emitVisual('outcome',this.get(e.actor),target,{type:kind==='transfer'?'relay':'relaylink',key:e.key});if(from)this.emitVisual('trait',this.get(e.actor),target,{trait:'pursuit',label:'표식 전달',relay:true,fromX:from.x,fromY:from.y});}
    static validTraits(x,t,actors,keys=null){
      const num=n=>Number.isFinite(n)&&n>=0,id=v=>actors.some(a=>a.id===v),ids=['escort','pursuit','resonance'];
      return x===undefined||!!(x&&x.version===1&&typeof x.enabled==='boolean'&&Array.isArray(x.keys)&&x.keys.length<=40&&x.keys.every(k=>D.cards[k])&&JSON.stringify(x.keys)===JSON.stringify([...new Set(x.keys)].sort())&&(!keys||JSON.stringify(keys)===JSON.stringify(x.keys))&&Array.isArray(x.protection)&&x.protection.length<=5&&new Set(x.protection.map(p=>p.target)).size===x.protection.length&&x.protection.every(p=>(p.target===null||id(p.target)&&p.target.startsWith('a'))&&num(p.until)&&p.until<=t+20)&&num(x.guardUntil)&&x.guardUntil<=t+8.00001&&(x.mark===null||x.mark&&(x.mark.relay===undefined||typeof x.mark.relay==='boolean')&&(x.mark.key===undefined||Object.hasOwn(D.cards,x.mark.key))&&id(x.mark.target)&&x.mark.target.startsWith('e')&&id(x.mark.actor)&&x.mark.actor.startsWith('a')&&num(x.mark.until)&&x.mark.until<=t+8.00001)&&(x.last===null||id(x.last)&&x.last.startsWith('a'))&&Number.isInteger(x.charge)&&x.charge>=0&&x.charge<=4&&x.stats&&ids.every(k=>Number.isSafeInteger(x.stats[k])&&x.stats[k]>=0)&&Array.isArray(x.history)&&x.history.length<=40&&x.history.every(e=>ids.includes(e.trait)&&num(e.at)&&e.at<=t&&typeof e.text==='string'&&e.text.length<=160&&(e.actor===null||id(e.actor))&&(e.target===null||id(e.target))));
    }
    relayBasicKO(defeated){
      const mark=this.s.traits?.mark,tactic=this.s.runTactic;
      if(!tactic||!this.traitLevel('pursuit')||mark?.target!==defeated.id||mark.until<=this.s.t||mark.relay||!mark.key)return;
      const next=this.alive(1).sort((a,b)=>Math.hypot(a.x-defeated.x,a.y-defeated.y)-Math.hypot(b.x-defeated.x,b.y-defeated.y)||a.id.localeCompare(b.id))[0];
      const actor=this.get(this.visualSource?.actor)||this.get(mark.actor),stamp='basic:'+mark.actor+':'+mark.target+':'+mark.until;
      if(!next||actor?.side!==0||tactic.seen.includes(stamp))return;
      tactic.seen.push(stamp);tactic.seen=tactic.seen.slice(-100);
      this.s.traits.mark={target:next.id,actor:actor.id,until:this.s.t+8,relay:true,key:mark.key};
      this.tacticEvent('transfer',{key:mark.key,actor:actor.id},next,defeated);
    }
    traitLevel(id){const x=this.s.traits;return x?.enabled?this.traitLevels?.[id]||0:0;}
    traitEvent(trait,text,actor=null,target=null){const x=this.s.traits;x.stats[trait]++;x.history.push({trait,text,at:this.s.t,actor:actor?.id||null,target:target?.id||null});x.history=x.history.slice(-40);this.log(window.CardTraits.traits[trait].name+' · '+text);this.emitVisual('trait',actor,target,{trait,text});}
    traitGuardReady(target=null){if(!this.traitLevel('escort'))return;target??=this.alive(0).find(a=>a.role===0)||this.alive(0)[0]||null;const x=this.s.traits;if(x.guardUntil>this.s.t)return;x.guardUntil=this.s.t+8;this.traitEvent('escort','보호 성공 → 반격 준비',null,target);}
    traitProtection(target,until){const x=this.s.traits;if(!this.traitLevel('escort'))return;x.protection=x.protection.filter(p=>p.until>this.s.t&&p.target!==target);x.protection.push({target,until});}
    traitPrepare(e){
      const x=this.s.traits;if(!x?.enabled||e.side!==0||!e.cardId||e.signatureFollow||e.chainFollow)return {e,root:false};
      const d=D.cards[e.key],a=this.get(e.actor),target=this.eventTarget(e),offense=window.GameCore.offense.includes(e.kind);let factor=1,escort=false,pursuit=false,resonance=false;
      if(offense&&!this.guardActive(1,e.at)){if(x.guardUntil>this.s.t){escort=true;factor+=this.traitLevel('escort')===2?.2:.1;}if(window.GameCore.single.includes(e.kind)&&x.mark?.until>this.s.t&&x.mark.target===target?.id&&x.mark.actor!==a.id){pursuit=true;factor+=this.traitLevel('pursuit')===2?.2:.1;}}
      const level=this.traitLevel('resonance'),need=level===2?3:4;
      if(level&&d?.traits.includes('resonance')&&(offense||['heal','healAll','cleanse','blessing'].includes(e.kind))&&x.charge>=need&&e.power>0&&(!offense||!this.guardActive(1,e.at))){resonance=true;factor+=level===2?.25:.15;}
      return {e:{...e,...(e.power>0?{power:e.power*factor,traitMultiplier:factor}:{})},root:true,targetId:target?.id||null,escort,pursuit,resonance,relayed:!!x.mark?.relay,damage:this.s.stats.damage[0],healed:this.s.stats.healed[0],relocated:(this.s.mechanic?.stats.rescued||0)+(this.s.mechanic?.stats.repositioned||0)};
    }
    traitFinish(memo){
      if(!memo.root)return;const {e}=memo,x=this.s.traits,d=D.cards[e.key],a=this.get(e.actor),target=this.get(memo.targetId)||this.eventTarget(e),offense=window.GameCore.offense.includes(e.kind),dealt=this.s.stats.damage[0]>memo.damage,healed=this.s.stats.healed[0]>memo.healed;
      const relocated=(this.s.mechanic?.stats.rescued||0)+(this.s.mechanic?.stats.repositioned||0)>memo.relocated,success=offense?dealt:['heal','healAll','cleanse','blessing'].includes(e.kind)?healed||relocated:d.movement?relocated:!!a&&a.hp>0;
      if(!success)return;
      if((dealt||healed)&&(memo.escort||memo.pursuit||memo.resonance))this.insight(e.key,'boosts',1);
      if(memo.escort&&dealt){x.guardUntil=0;this.traitEvent('escort','반격 강화 · '+d.name,a,target);}
      if(memo.pursuit&&dealt){x.mark=null;this.traitEvent('pursuit','다른 캐릭터의 후속 공격 · '+d.name,a,target);if(memo.relayed&&this.s.runTactic)this.tacticEvent('link',e,target);}
      if(this.traitLevel('escort')&&d.traits.includes('escort')){if(e.kind==='guard')this.traitProtection(null,e.at+e.duration);else if(['ward','taunt'].includes(e.kind))this.traitProtection(e.kind==='taunt'?a.id:target?.id,e.at+e.duration);}
      if(this.traitLevel('pursuit')&&d.traits.includes('pursuit')&&dealt&&target?.hp>0){x.mark={target:target.id,actor:a.id,until:this.s.t+8,key:e.key};this.traitEvent('pursuit','추격 표식 · '+target.name,a,target);}
      const tactic=this.s.runTactic,stamp=e.cardId+':'+(e.actionId??e.at);
      if(tactic&&this.traitLevel('pursuit')&&d.traits.includes('pursuit')&&offense&&dealt&&target?.hp===0&&!tactic.seen.includes(stamp)){const next=this.alive(1).sort((b,c)=>Math.hypot(b.x-target.x,b.y-target.y)-Math.hypot(c.x-target.x,c.y-target.y)||b.id.localeCompare(c.id))[0];if(next){tactic.seen.push(stamp);tactic.seen=tactic.seen.slice(-100);x.mark={target:next.id,actor:a.id,until:this.s.t+8,relay:true};this.tacticEvent('transfer',e,next,target);}}
      if(this.traitLevel('resonance')&&d.traits.includes('resonance')){if(memo.resonance&&(dealt||healed)){x.charge=0;this.traitEvent('resonance','공명 강화 · '+d.name,a,target);}else if(x.last!==a.id)x.charge=Math.min(this.traitLevel('resonance')===2?3:4,x.charge+1);x.last=a.id;}
    }
    static mechanicState(pattern={}){return {version:1,pattern:{actor:'e0',radius:155,power:55,windup:1.6,interval:10,start:8,recovery:3,maxRecovery:5,vulnerability:.4,shape:'circle',...pattern},next:pattern.start??8,hazard:null,exposedUntil:0,stats:{casts:0,hits:0,dodges:0,rescued:0,repositioned:0,windowDamage:0},history:[]};}
    static validMechanic(m,t,actors,events=null){if(m===null||m===undefined)return !events||!events.some(e=>e.zone);const p=m.pattern||CharacterBattle.mechanicState().pattern,finite=n=>Number.isFinite(n)&&n>=0,point=h=>h&&['x','y','radius','start','at'].every(k=>finite(h[k]))&&h.x<=960&&h.y<=390&&h.radius>0&&h.radius<=500&&h.start<=t&&h.at>=h.start&&(!h.shape||['circle','line'].includes(h.shape))&&(h.shape!=='line'||['length','width','angle'].every(k=>Number.isFinite(h[k]))&&h.length>0&&h.length<=1800&&h.width>0&&h.width<=500);return m.version===1&&(p.attackKey===undefined||['boss_zone','line_zone'].includes(p.attackKey))&&actors.some(a=>a.id===p.actor&&a.side===1)&&['radius','power','windup','interval','start','recovery','maxRecovery','vulnerability'].every(k=>finite(p[k]))&&p.radius>0&&p.radius<=500&&p.windup>0&&p.windup<=10&&p.interval>p.windup+p.maxRecovery&&p.maxRecovery>=p.recovery&&p.maxRecovery<=10&&p.vulnerability<=1&&(p.shape!=='line'||['length','width','angle'].every(k=>Number.isFinite(p[k]))&&p.length>0&&p.length<=1800&&p.width>0&&p.width<=500)&&['circle','line'].includes(p.shape)&&(!m.hazard||!events||events.some(e=>e.key===(p.attackKey||'boss_zone')&&e.actor===p.actor&&e.at===m.hazard.at&&e.center?.x===m.hazard.x&&e.center?.y===m.hazard.y&&e.radius===m.hazard.radius&&(e.shape||'circle')===(m.hazard.shape||'circle')&&(e.shape!=='line'||e.length===m.hazard.length&&e.width===m.hazard.width&&e.angle===m.hazard.angle)))&&finite(m.next)&&finite(m.exposedUntil)&&(!m.hazard||point(m.hazard))&&m.stats&&['casts','hits','dodges','rescued','repositioned','windowDamage'].every(k=>finite(m.stats[k]))&&Array.isArray(m.history)&&m.history.length<=30&&m.history.every(h=>finite(h.at)&&h.at<=t&&h.kind==='impact'&&finite(h.hits)&&finite(h.dodges)&&typeof h.blocked==='boolean'&&Number.isFinite(h.x)&&Number.isFinite(h.y)&&finite(h.radius)&&(h.opening===undefined||finite(h.opening)&&h.opening<=10));}
    areaTargets(e){if(e.zone)return this.alive(1-e.side).filter(a=>this.inside(a,{...e.center,radius:e.radius,shape:e.shape,length:e.length,width:e.width,angle:e.angle}));if(e.spatial==='line')return this.lineTargets(e);return super.areaTargets(e);}
    static validBossPhases(s){const x=s.bossPhases;if(x===null||x===undefined)return true;return !!(x.version===1&&s.strategy==='boss'&&[1,2].includes(s.phase)&&(s.phase===1?s.phaseAt===null:Number.isFinite(s.phaseAt)&&s.phaseAt>=0&&s.phaseAt<=s.t)&&s.mechanic&&typeof x.applied==='boolean'&&CharacterBattle.validMechanic(CharacterBattle.mechanicState(x.second),0,s.actors,[])&&(x.applied?s.phase===2&&Number.isFinite(s.phaseAt)&&s.phaseAt>=0&&Number.isFinite(x.at)&&x.at>=s.phaseAt&&x.at<=s.t&&JSON.stringify(x.second)===JSON.stringify(s.mechanic.pattern):x.at===null));}
    updatePhase(){if(!this.s.bossPhases){super.updatePhase();return;}const s=this.s,boss=this.get(s.mechanic.pattern.actor);if(s.phase===1&&boss?.hp>0&&boss.hp/boss.max<=.5){s.phase=2;s.phaseAt=s.t;this.log('수호자 2단계 · 다음 위험 구역부터 부상자 중심 직선 찌르기');}this.applyBossPhase();}
    applyBossPhase(){const s=this.s,x=s.bossPhases;if(!x||x.applied||s.phase!==2||s.mechanic.hazard||s.ended||this.get(s.mechanic.pattern.actor)?.hp<=0)return;x.applied=true;x.at=s.t;s.mechanic.pattern=JSON.parse(JSON.stringify(x.second));this.log('수호자 2단계 적용 · 부상자 중심 직선 찌르기 · 기존 회복 빈틈 유지');}
    doctrine(){if(!this.s.bossPhases)return super.doctrine();return {name:'수호자 · '+this.s.phase+'단계',desc:this.s.phase===1?'HP 50%까지 원형 낙하 · 공격 후 빈틈':'부상자 중심 직선 찌르기 · 전환 전에 예고한 원형 공격 유지'};}
    enemy(){this.applyBossPhase();if(this.s.mechanic){this.mechanicEnemy();if(this.alive(1).some(a=>a.id!==this.s.mechanic.pattern.actor))return super.enemy();return;}return super.enemy();}
    enemyScore(card,target){if(this.s.mechanic&&card.actor===this.s.mechanic.pattern.actor)return 0;const score=super.enemyScore(card,target),d=this.definition(card),a=this.caster(card);if(this.s.defensiveEnemy&&d.kind==='guard'&&a?.hp>0&&a.busy<=this.s.t&&!a.action&&!this.guardActive(1,this.s.t)&&this.s.due-this.s.t<=d.duration)return Math.max(score,9);return score;}
  hazard(){const h=this.s.mechanic?.hazard;return !this.s.ended&&this.get(this.s.mechanic?.pattern?.actor||'e0')?.hp>0&&h&&h.at>=this.s.t?h:null;}
  inside(a,h=this.hazard()){if(!h||!a)return false;if(h.shape==='line'){const dx=a.x-h.x,dy=a.y-h.y,c=Math.cos(h.angle||0),s=Math.sin(h.angle||0);return Math.abs(dx*c+dy*s)<=h.length/2&&Math.abs(-dx*s+dy*c)<=h.width/2;}return Math.hypot(a.x-h.x,a.y-h.y)<=h.radius;}
  safePoint(a,h=this.hazard()){if(!h)return {x:a.x,y:a.y};const margin=(h.shape==='line'?Math.hypot(h.length/2,h.width/2):h.radius)+48,dx=a.x-h.x,dy=a.y-h.y,len=Math.hypot(dx,dy),angle=len>1?Math.atan2(dy,dx):a.role%2?Math.PI/2:-Math.PI/2;const rows=Array.from({length:16},(_,i)=>{const theta=angle+i*Math.PI/8,x=clamp(h.x+Math.cos(theta)*margin,35,925),y=clamp(h.y+Math.sin(theta)*margin,35,355);return {x,y,d:Math.hypot(x-a.x,y-a.y),safe:h.shape==='line'?!this.inside({x,y},h):Math.hypot(x-h.x,y-h.y)>h.radius+25};});return rows.filter(p=>p.safe).sort((x,y)=>x.d-y.d)[0]||null;}
  basicPolicy(a,plan){if(a.side===0&&a.repositionHoldUntil>this.s.t)return {...plan,move:{mode:'none'},reason:'재배치 카드의 안전 지점 유지 · 가능한 기본 행동 계속'};if(a.id===this.s.mechanic?.pattern?.actor)return {...plan,move:{mode:'none'}};return plan;}
  mechanicEnemy(){
    const m=this.s.mechanic,p=m.pattern,a=this.get(p.actor),key=p.attackKey||'boss_zone',definition=D.hostile[key];
    if(this.s.t<m.next||!a||a.hp<=0||a.action||a.busy>this.s.t)return;
    const friends=this.alive(0);if(!friends.length)return;
    const zoneAt=target=>({x:target.x,y:target.y,radius:p.radius,shape:p.shape,...(p.shape==='line'?{length:p.length,width:p.width,angle:p.angle||0}:{})});
    const count=target=>friends.filter(z=>this.inside(z,zoneAt(target))).length;
    const target=[...friends].sort((x,y)=>this.s.bossPhases&&this.s.phase===2?x.hp/x.max-y.hp/y.max||x.id.localeCompare(y.id):count(y)-count(x)||x.id.localeCompare(y.id))[0],at=this.s.t+p.windup,h={...zoneAt(target),start:this.s.t,at};
    m.hazard=h;m.next=this.s.t+p.interval;m.stats.casts++;
    const action=this.startAction(a,key,null,null);a.busy=at+p.recovery;
    this.s.events.push({...definition,power:p.power,radius:p.radius,zone:true,shape:p.shape,...(p.shape==='line'?{length:p.length,width:p.width,angle:p.angle||0}:{}),key,side:1,actor:a.id,target:null,center:{x:h.x,y:h.y},at,cardId:null,actionId:action.id});
    this.s.stats.cards[1][key]=(this.s.stats.cards[1][key]||0)+1;this.log(definition.name+' · 위치 고정 · '+p.windup.toFixed(1)+'초 후 발동');
  }
  openingDuration(e){const boss=this.get(e.actor);const p=this.s.mechanic.pattern;if(!boss)return p.recovery;const returning=this.alive(0).filter(a=>a.role<=1&&a.repositionHoldUntil>=e.at);const travel=returning.map(a=>Math.max(0,Math.hypot(a.x-boss.x,a.y-boss.y)-a.range)/Math.max(1,a.speed*(a.slowUntil>e.at?.65:1)*(a.role===0&&a.stance===0?1.2:1)));return clamp(Math.max(p.recovery,...travel.map(t=>t+1.5)),p.recovery,p.maxRecovery);}
  openWindow(e){const boss=this.get(e.actor);if(!boss||boss.hp<=0||this.s.ended)return;const duration=this.openingDuration(e),m=this.s.mechanic;m.exposedUntil=e.at+duration;boss.busy=Math.max(boss.busy,m.exposedUntil);const impact=m.history.at(-1);if(impact)impact.opening=duration;this.log((m.pattern.shape==='line'?'강적':'보스')+' 빈틈 · '+duration.toFixed(1)+'초 동안 받는 피해 '+Math.round(m.pattern.vulnerability*100)+'% 증가');}
    static validAutoHold(h,t){return h===null||h&&h.version===1&&['holding','released'].includes(h.phase)&&['charge','started','until'].every(k=>Number.isFinite(h[k])&&h[k]>=0)&&h.charge<=h.started&&h.started<=t&&h.until>=h.started&&h.until-h.started<=1.20000001&&typeof h.reason==='string'&&h.reason.length<=120;}
    setControl(mode){const changed=super.setControl(mode);if(changed)this.s.autoHold=null;return changed;}
    autoThreat(){return this.s.events.filter(e=>e.side===1&&window.GameCore.offense.includes(e.kind)&&e.at>this.s.t&&e.at-this.s.t<=3&&this.get(e.actor)?.hp>0&&!this.guardActive(0,e.at)).map(e=>({e,targets:(e.kind==='area'?this.areaTargets(e):[this.eventTarget(e,e.at)]).filter(a=>a?.hp>0)})).filter(x=>x.targets.length&&(x.e.power>=35||x.targets.length>=2)).sort((a,b)=>a.e.at-b.e.at)[0]||null;}
    autoHoldPlan(){const threat=this.autoThreat();if(!threat)return null;const pulses=Math.min(2,Math.floor((threat.e.at-this.s.t-1)/.6));if(pulses<1)return null;const candidates=this.s.autoPolicy==='balanced'?this.s.decks[0].hand.map(c=>({c,target:this.recommend(c),d:this.definition(c)})).filter(x=>this.commandCheck(0,x.c.id,x.target).ok):this.autoCandidates();
      if(this.alive(0).some(a=>a.hp/a.max<=.25)&&candidates.some(x=>['heal','healAll','cleanse','blessing'].includes(x.d.kind)&&this.autoScore(x.c,x.target)>0))return null;
      const response=candidates.some(x=>this.preparation(x.c,x.target,0)<=.25&&(x.d.kind==='guard'||x.d.kind==='armor'&&this.autoScore(x.c,x.target)>0||!!x.d.movement||['counterWard','coverWard'].includes(C.skill(x.c.key).type)&&threat.targets.some(a=>a.id===x.target)||x.d.kind==='ward'&&threat.targets.some(a=>a.id===x.target)&&this.autoScore(x.c,x.target)>0));if(!response)return null;
      return {version:1,charge:this.s.due,started:this.s.t,until:this.s.t+pulses*.6,phase:'holding',reason:'공개된 강공격에 대비 · 명령 잠시 보유'};
    }
    static validDeadline(s){return (s.battleLimit===undefined||s.battleLimit===null||s.battleLimit===180&&s.t<=180)&&(s.endReason===undefined||s.endReason==='교전 시간 초과 (180초)'&&s.ended&&s.winner===1&&s.battleLimit===180&&s.t===180);}
    static validAutoLast(x,t,actors){return x===undefined||x===null||x&&Number.isFinite(x.at)&&x.at>=0&&x.at<=t&&D.cards[x.key]&&typeof x.reason==='string'&&x.reason.length<=180&&(x.target===null||actors.some(a=>a.id===x.target));}
    static validAutoDecisions(rows,t,actors,policy=null){return Array.isArray(rows)&&rows.length<=40&&rows.every(x=>x&&Number.isFinite(x.at)&&x.at>=0&&x.at<=t&&['attack','protect'].includes(x.policy)&&(!policy||x.policy===policy)&&D.cards[x.key]&&typeof x.reason==='string'&&x.reason.length<=180&&(x.target===null||actors.some(a=>a.id===x.target)));}
    cardAvailability(card){const a=this.caster(card),d=this.definition(card);if(this.s.ended)return '전투 종료';if(!a||a.hp<=0)return '시전자 전투불능';if(a.busy>this.s.t||this.s.events.some(e=>e.actor===a.id))return '시전자 기술 실행 중';if(d.purposeMode==='reject'&&this.validPurpose(a))return '현재 행동 종료 후 사용';if(d.movement&&!this.hazard())return '위험 구역 예고 중 사용';if(!this.s.ready)return '명령 충전 중';const targets=d.self?[a.id]:window.GameCore.friendly.includes(d.kind)?this.alive(0).map(x=>x.id):window.GameCore.targeted(d)?this.alive(1).map(x=>x.id):[null];const checks=targets.map(id=>this.commandCheck(0,card.id,id));return checks.some(x=>x.ok)?'사용 가능':checks[0]?.error||'유효 대상 없음';}
    autoPolicyLabel(){return {attack:'공격 중심',protect:'보호 중심',balanced:'기존 운영'}[this.s.autoPolicy];}
    autoCandidates(){
      const rows=[];for(const c of this.s.decks[0].hand){const d=this.definition(c),a=this.caster(c);if(!a||a.hp<=0)continue;
        const targets=d.self?[a.id]:window.GameCore.friendly.includes(d.kind)?this.alive(0).map(a=>a.id):window.GameCore.targeted(d)?this.alive(1).map(a=>a.id):[null];
        for(const target of targets)if(this.commandCheck(0,c.id,target).ok)rows.push({c,target,d,score:this.policyScore(c,target),...this.autoSafety(c,target)});
      }return rows.sort((a,b)=>(b.score>0?b.tier:0)-(a.score>0?a.tier:0)||b.score-a.score||a.c.id.localeCompare(b.c.id)||String(a.target).localeCompare(String(b.target)));
    }
    // Pure evaluation of the current hand and public events. Never simulate a future deck draw.
    autoTraitPlan(card,target){
      const none={factor:1,reasons:[]};if(this.s.autoTraitVersion!==1||!this.s.traits?.enabled)return none;
      const x=this.s.traits,d=this.definition(card),a=this.caster(card),at=this.s.t+this.preparation(card,target,0)+.02;
      if(!a||a.side!==0||a.hp<=0)return none;
      const offense=window.GameCore.offense.includes(d.kind),e={...d,side:0,actor:a.id,target,at},hit=this.eventTarget(e),targets=offense?(d.kind==='area'?this.areaTargets(e):hit?.hp>0?[hit]:[]):[];
      const blocked=offense&&this.guardActive(1,at),reasons=[];let bonus=0;
      // Bound reward to the extra useful output: finishing an already dying target needs no combo.
      const damageOutput=(ratio)=>targets.reduce((n,b)=>{
        let p=(d.power||0)*(C.skill(card.key).type==='comboStrike'?1+C.skill(card.key).offsets.length:d.kind==='execute'&&b.hp/b.max<=.5?2:1)*(a.buffUntil>at?1+a.buff:1);
        if(b.markUntil>at)p*=1.3;if(d.kind!=='pierce'){if(b.role===0&&b.stance===0)p*=.7;if(b.armorUntil>at)p*=1-Math.min(.65,b.armor);}const m=this.s.mechanic;if(m?.pattern.actor===b.id&&m.exposedUntil>at)p*=1+m.pattern.vulnerability;
        const shield=b.shieldUntil>at?b.shield:0;return n+Math.min(b.hp,Math.max(0,p*(1+ratio)-shield));
      },0),usefulDamage=ratio=>damageOutput(ratio)-damageOutput(0);
      if(offense&&!blocked){
        if(this.traitLevel('escort')&&x.guardUntil>at&&usefulDamage(this.traitLevel('escort')===2?.2:.1)>.5){bonus+=this.traitLevel('escort')===2?.2:.1;reasons.push('호위 반격 활용');}
        if(this.traitLevel('pursuit')&&window.GameCore.single.includes(d.kind)&&x.mark?.until>at&&x.mark.actor!==a.id&&x.mark.target===hit?.id&&usefulDamage(this.traitLevel('pursuit')===2?.2:.1)>.5){bonus+=this.traitLevel('pursuit')===2?.35:.3;reasons.push('추격 표식 연계');}
      }
      const level=this.traitLevel('resonance'),need=level===2?3:4,ratio=level===2?.25:.15,isResonance=level&&d.traits.includes('resonance');
      const friends=d.spatial==='circleHeal'?this.spatialFriends({...d,actor:a.id,side:0}):['heal','cleanse'].includes(d.kind)?[this.get(target)].filter(a=>a?.hp>0):this.alive(0);
      const isHeal=!d.movement&&['heal','healAll','cleanse','blessing'].includes(d.kind),usefulHeal=isHeal?friends.reduce((n,b)=>n+Math.min(b.max-b.hp,(d.power||0)*(1+ratio))-Math.min(b.max-b.hp,d.power||0),0):0;
      const canSucceed=offense?!blocked&&targets.length>0&&damageOutput(0)>0:isHeal?friends.some(b=>b.hp<b.max):d.movement?!!this.hazard()&&(d.movement==='party'?this.alive(0):[a,this.get(target)]).some(b=>b&&this.inside(b)):false;
      if(isResonance&&x.charge>=need){if(!blocked&&(offense&&usefulDamage(ratio)>.5||usefulHeal>.5)){bonus+=ratio;reasons.push('공명 강화 활용');}}
      else if(isResonance&&x.last!==a.id&&canSucceed){bonus+=x.charge===need-1?.16:.08;reasons.push(x.charge===need-1?'공명 완성 준비':'다른 캐릭터로 공명 축적');}
      // Protection setup earns a small preference only when somebody is actually threatened.
      if(this.traitLevel('escort')&&d.traits.includes('escort')&&!d.movement&&x.guardUntil<=this.s.t){
        const protectedIds=d.kind==='guard'?this.alive(0):[d.kind==='taunt'?a:this.get(target)].filter(Boolean);
        if(protectedIds.some(b=>this.publicRisk(b.id)>0)){bonus+=.06;reasons.push('위협받는 동료의 호위 준비');}
      }
      return {factor:1+Math.min(.45,bonus),reasons};
    }
    autoSafety(card,target){
      if(this.s.autoTraitVersion!==1)return {tier:0,reason:''};
      const d=this.definition(card),a=this.caster(card),at=this.s.t+this.preparation(card,target,0)+.02;
      if(!a||a.side!==0)return {tier:0,reason:''};
      const heal=!d.movement&&['heal','healAll','cleanse','blessing'].includes(d.kind),friends=d.spatial==='circleHeal'?this.spatialFriends({...d,actor:a.id,side:0}):window.GameCore.friendly.includes(d.kind)?[this.get(target)].filter(Boolean):this.alive(0);
      const critical=friends.filter(b=>b.hp>0&&b.hp/b.max<=.15&&Math.min(d.power||0,b.max-b.hp)>=Math.min(8,b.max-b.hp));
      let tier=0,reason='';if(heal&&critical.length&&(d.time<=5||critical.length>=2)&&at-this.s.t<=1){tier=2;reason='위기 회복 우선';}
      for(const e of this.s.events){
        if(e.side!==1||!window.GameCore.offense.includes(e.kind)||e.at<at||e.at-this.s.t>1.25||this.get(e.actor)?.hp<=0||this.guardActive(0,e.at))continue;
        const victims=(e.kind==='area'?this.areaTargets(e):[this.eventTarget(e,e.at)]).filter(b=>b?.hp>0);if(!victims.length)continue;
        const injury=b=>{let n=(e.power||0)*.78*(e.kind==='execute'&&b.hp/b.max<=.5?2:1);if(b.role===0&&b.stance===0)n*=.7;if(b.armorUntil>e.at)n*=1-Math.min(.65,b.armor);if(b.markUntil>e.at)n*=1.3;return Math.max(0,n-(b.shieldUntil>e.at?b.shield:0));};
        const endangered=b=>b&&injury(b)>=b.hp;const severe=e.zone||victims.some(endangered);if(!severe)continue;
        const threatened=b=>victims.some(v=>v.id===b?.id);
        const duration=d.duration||0;
        if(window.GameCore.offense.includes(d.kind)&&at+(C.skill(card.key).type==='comboStrike'?Math.max(...C.skill(card.key).offsets):0)<e.at&&!this.guardActive(1,at)){const ev={...d,side:0,actor:a.id,target,at},hits=d.kind==='area'?this.areaTargets(ev):[this.eventTarget(ev)],caster=hits.find(b=>b?.id===e.actor);if(caster){let n=(d.power||0)*(C.skill(card.key).type==='comboStrike'?1+C.skill(card.key).offsets.length:d.kind==='execute'&&caster.hp/caster.max<=.5?2:1)*(a.buffUntil>at?1+a.buff:1);if(caster.markUntil>at)n*=1.3;if(d.kind!=='pierce'){if(caster.role===0&&caster.stance===0)n*=.7;if(caster.armorUntil>at)n*=1-Math.min(.65,caster.armor);}n=Math.max(0,n-(caster.shieldUntil>at?caster.shield:0));if(n>=caster.hp){tier=3;reason='예고 시전자 처치 예상';break;}}}
        const response=d.movement?e.zone&&(d.movement==='party'?victims.some(b=>this.safePoint(b)):threatened(this.get(target))&&this.safePoint(this.get(target))):
          d.kind==='guard'?at+duration>=e.at&&this.autoScore(card,target)>0:
          d.kind==='ward'?threatened(this.get(target))&&endangered(this.get(target))&&at+duration>=e.at&&(d.power||0)>(this.get(target)?.shieldUntil>e.at?this.get(target).shield:0):
          d.kind==='armor'?at+duration>=e.at&&victims.some(b=>b.armorUntil<=e.at||b.armor<(d.power||0)):
          d.kind==='taunt'?window.GameCore.single.includes(e.kind)&&victims.some(b=>b.id!==a.id&&endangered(b))&&a.hp/a.max>.5&&at+duration>=e.at:
          heal?friends.some(b=>threatened(b)&&endangered(b)&&b.hp+Math.min(d.power||0,b.max-b.hp)>injury(b)):false;
        if(response){tier=3;reason=e.zone?'위험 구역 대응 우선':'예고된 강공격 대응 우선';break;}
      }return {tier,reason};
    }
    publicRisk(id){const a=this.get(id);if(!a)return 0;const aims=this.alive(1).filter(e=>this.inspectAI(e.id)?.attackTarget===id).length;
      const incoming=this.s.events.filter(e=>e.side===1&&window.GameCore.offense.includes(e.kind)&&e.at>this.s.t&&e.at-this.s.t<=3&&this.get(e.actor)?.hp>0&&!this.guardActive(0,e.at)).filter(e=>(e.kind==='area'?this.areaTargets(e):[this.eventTarget(e,e.at)]).some(a=>a?.id===id)).length;
      return aims+incoming*2;
    }
    autoSupportPlan(card,target){
      if(this.s.autoSupportVersion!==1||this.s.autoPolicy==='balanced')return {factor:1,reason:''};
      const d=this.definition(card),a=this.caster(card);
      if(!a||d.movement||!['heal','healAll','cleanse','blessing'].includes(d.kind)||d.time<=5)return {factor:1,reason:''};
      const friends=d.spatial==='circleHeal'?this.spatialFriends({...d,actor:a.id,side:0}):['heal','cleanse'].includes(d.kind)?[this.get(target)].filter(Boolean):this.alive(0);
      const wounded=friends.filter(b=>b.hp>0&&b.hp/b.max<.35&&Math.min(d.power||0,b.max-b.hp)>=8);
      const alternative=this.s.decks[0].hand.some(c=>{
        const other=this.definition(c),caster=this.caster(c);if(c.id===card.id||!caster||other.movement||!['heal','healAll','cleanse','blessing'].includes(other.kind)||other.time>5||other.time>=d.time)return false;
        const targets=['heal','cleanse'].includes(other.kind)?wounded.map(b=>b.id):[null];
        return targets.some(id=>{if(!this.commandCheck(0,c.id,id).ok||this.preparation(c,id,0)>this.preparation(card,target,0))return false;
          const recipients=other.spatial==='circleHeal'?this.spatialFriends({...other,actor:caster.id,side:0}):id?[this.get(id)]:this.alive(0);
          return recipients.some(b=>wounded.some(w=>w.id===b.id)&&Math.min(other.power||0,b.max-b.hp)>=8);
        });
      });
      const urgency=alternative?Math.max(0,...wounded.map(b=>Math.max(0,1-b.hp/b.max/.35))):0;
      // Use current injuries only; do not inspect future cards, random numbers or unannounced attacks.
      const factor=d.time/(d.time+Math.max(0,d.time-5)*2*urgency);
      return {factor,reason:urgency>0?'부상자 회복 · 긴 명령 공백 비용 반영':''};
    }
    policyScore(card,target){
      const d=this.definition(card),b=this.get(target),protect=this.s.autoPolicy==='protect',offense=window.GameCore.offense.includes(d.kind);let score=this.autoScore(card,target);if(score<=0)return 0;const mark=this.s.traits?.mark;if(this.s.autoTraitVersion===0&&this.traitLevel('pursuit')&&mark?.until>this.s.t&&mark.target===target&&mark.actor!==this.caster(card)?.id&&window.GameCore.single.includes(d.kind))score*=1.3;
      if(offense){const hit=this.eventTarget({...d,side:0,actor:card.actor,target,at:this.s.t+this.preparation(card,target,0)}),recent=this.s.autoDecisions.findLast(x=>this.get(x.target)?.side===1&&this.s.t-x.at<8);
        score*=protect?.72:1.65;
        if(hit?.hp>0){if(!protect&&hit.id===recent?.target)score*=1.3;const power=d.power*(C.skill(card.key).type==='comboStrike'?1+C.skill(card.key).offsets.length:d.kind==='execute'&&hit.hp/hit.max<=.5?2:1);if(hit.hp<=power)score*=protect?1.25:1.65;else if(!protect)score*=1+(1-hit.hp/hit.max)*.35;}
      }else{const friends=d.spatial==='circleHeal'?this.spatialFriends({...d,actor:this.caster(card).id,side:0}):b?.side===0?[b]:this.alive(0),risk=Math.max(0,...friends.map(a=>this.publicRisk(a.id))),missing=Math.max(0,...friends.map(a=>1-a.hp/a.max));score*=protect?1.75:.62;
        if(protect)score*=1+Math.min(3,risk)*.22+missing*.5;
        if(missing>=.75&&['heal','healAll','cleanse','blessing'].includes(d.kind))score*=protect?1.2:2.8;
      }return score*this.autoTraitPlan(card,target).factor*this.autoSupportPlan(card,target).factor;
    }
    policyReason(card,target){const d=this.definition(card),b=this.get(target),old=this.s.autoTraitVersion===0&&this.s.traits?.mark?.until>this.s.t&&this.s.traits.mark.target===target&&this.s.traits.mark.actor!==this.caster(card)?.id&&window.GameCore.single.includes(d.kind)?['추격 표식 우선']:[],safety=this.autoSafety(card,target),traits=this.autoTraitPlan(card,target);return (this.autoPolicyLabel()+' · '+[...(safety.reason?[safety.reason]:[]),...(this.autoSupportPlan(card,target).reason?[this.autoSupportPlan(card,target).reason]:[]),...old,...traits.reasons,this.autoReason(card,target)].join(' · ')+(b?' → '+b.name:'')).slice(0,180);}
    autoTraitStatus(){if(this.s.autoPolicy==='balanced')return '기존 운영 · 공격/보호 방침에서 특성 판단 적용';if(this.s.autoTraitVersion!==1)return '이전 운영 · 다음 교전부터 특성 판단 적용';if(!this.s.traits?.enabled)return '특성 미활성 · 기본 운영';const x=this.s.traits,reasons=[];if(x.guardUntil>this.s.t)reasons.push('호위 반격 준비');if(x.mark?.until>this.s.t&&this.get(x.mark.target)?.hp>0)reasons.push('추격 연계 준비');const level=this.traitLevel('resonance'),need=level===2?3:4;if(level)reasons.push(x.charge>=need?'공명 강화 준비':'공명 '+x.charge+'/'+need);return reasons.join(' · ')||'특성 기회 대기';}
    autoUsefulSupport(row){
      if(!(row.score>0))return false;if(this.s.autoTraitVersion===0)return !window.GameCore.offense.includes(row.d.kind);
      if(row.tier>=2)return true;if(row.d.movement||!['heal','healAll','cleanse','blessing'].includes(row.d.kind))return false;
      const friends=row.target?[this.get(row.target)].filter(Boolean):this.alive(0);return friends.some(a=>a.hp>0&&a.hp/a.max<=.25);
    }
    policyAuto(){const s=this.s;let rows=this.autoCandidates();if(!rows.length)return false;
      const urgent=this.alive(0).some(a=>a.hp/a.max<=.25),support=rows.some(x=>this.autoUsefulSupport(x));
      if(s.rerolls>0&&(rows[0].score<2||urgent&&!support)){const hand=s.decks[0].hand.map(c=>({c,score:Math.max(0,...rows.filter(x=>x.c.id===c.id).map(x=>x.score))})).sort((a,b)=>a.score-b.score||a.c.id.localeCompare(b.c.id));if(hand[0]&&this.replace(hand[0].c.id))rows=this.autoCandidates();}
      const best=rows[0];if(!best||best.score<=0)return false;const reason=this.policyReason(best.c,best.target);if(!this.command(0,best.c.id,best.target))return false;
      s.stats.autoCards++;s.autoLast={at:s.t,key:best.c.key,target:best.target,reason};s.autoDecisions.push({at:s.t,policy:s.autoPolicy,key:best.c.key,target:best.target,reason});s.autoDecisions=s.autoDecisions.slice(-40);this.log('자동 · '+reason);return true;
    }
    auto(){const s=this.s;if(s.control!=='auto'||s.intervening||s.paused||s.ended||!s.ready||s.t<s.autoAt)return false;
      if(s.autoHold?.charge!==s.due)s.autoHold=null;
      if(!s.autoHold){const plan=this.autoHoldPlan();if(plan){s.autoHold=plan;s.stats.autoHolds++;this.log('자동 · '+plan.reason);}}
      const hold=s.autoHold;if(hold?.phase==='holding'){const emergency=this.alive(0).some(a=>a.hp/a.max<=.25);if(s.t<hold.until&&this.autoThreat()&&!emergency&&!(s.autoTraitVersion===1&&this.autoCandidates().some(x=>x.score>0&&x.tier===3))){s.autoAt=s.t+.6;return false;}hold.phase='released';}
      const acted=s.autoPolicy==='balanced'?super.auto():this.policyAuto();s.autoAt=s.t+.6;return acted;
    }
    static validRecap(r,t,actors=null){return r&&r.version===1&&Number.isFinite(r.from)&&r.from>=0&&r.from<=t&&Array.isArray(r.events)&&r.events.length<=80&&r.events.every(e=>e&&['ko','heal','shield','protect','block','counter'].includes(e.kind)&&Number.isFinite(e.at)&&e.at>=r.from&&e.at<=t&&Number.isFinite(e.amount)&&e.amount>=0&&['actor','target','key'].every(k=>e[k]===null||typeof e[k]==='string'&&e[k].length<=80)&&typeof e.shared==='boolean'&&(e.cardKey===undefined||Object.hasOwn(D.cards,e.cardKey))&&(e.origin===undefined||['card','basic','enemy','unknown'].includes(e.origin))&&(e.key===null||D.cards[e.key]||D.hostile[e.key])&&(!actors||['actor','target'].every(k=>e[k]===null||actors.some(a=>a.id===e[k]))));}
    recordRecap(kind,actor,target,amount=0,key=null,shared=false,cardKey=null,origin='unknown'){this.s.recap??={version:1,from:this.s.t,events:[]};const e={kind,at:this.s.t,actor:actor?.id||null,target:target?.id||null,amount,key,shared,origin,...(cardKey?{cardKey}:{})};this.s.recap.events.push(e);this.s.recap.events=this.s.recap.events.slice(-80);}
    mitigateDamage(a,amount,pierce){const shield=a.shield;const n=super.mitigateDamage(a,amount,pierce);if(shield>a.shield&&a.side===0){this.recordRecap('shield',null,a,shield-a.shield,null,false,this.s.insights?.shields[a.id],this.s.insights?.shields[a.id]?'card':'unknown');this.insight(this.s.insights?.shields[a.id],'shield',shield-a.shield);}return n;}
    applyHealthDamage(a,n,side,source,key,shared=false,moved=0){const before=a.hp,actual=super.applyHealthDamage(a,n,side,source,key,shared,moved);if(side===0&&source==='card')this.insight(key,'damage',actual);if(side===0&&source==='basic'&&before>0&&a.hp===0)this.relayBasicKO(a);if(before>0&&a.hp===0&&a.side===0&&this.s.insights&&!this.s.insights.firstKO)this.s.insights.firstKO={at:this.s.t,actor:a.id,cause:key||'basic'};if(before>0&&a.hp===0)this.recordRecap('ko',this.get(this.visualSource?.actor),a,actual,key,shared,side===0&&source==='card'&&D.cards[key]?key:null,side===1?'enemy':source==='basic'?'basic':source==='card'?'card':'unknown');return actual;}
    emitVisual(kind,actor,target,extra={}){this.visuals??=[];this.visualSerial??=0;this.visuals.push({id:++this.visualSerial,kind,actionId:extra.actionId??actor?.action?.id,actor:actor?.id||null,target:target?.id||null,at:this.s.t,x:actor?.x??target?.x??0,y:actor?.y??target?.y??0,tx:target?.x??actor?.x??0,ty:target?.y??actor?.y??0,...extra});this.visuals=this.visuals.filter(e=>this.s.t-e.at<2).slice(-100);}
    moment(kind,actor,target,extra={}){this.s.moments.push({kind,actor:actor.id,target:target?.id||null,at:this.s.t});this.s.moments=this.s.moments.slice(-8);this.emitVisual(kind,actor,target,extra);}
    executeBasicIntent(a,intent,dt){const previous=this.visualHealer,previousOrigin=this.recapOrigin;let ok;this.visualHealer=a.id;this.recapOrigin='basic';try{ok=super.executeBasicIntent(a,intent,dt);}finally{this.visualHealer=previous;this.recapOrigin=previousOrigin;}if(ok)this.emitVisual(intent.basic.mode==='heal'?'heal-link':'attack',a,this.get(intent.basic.target));return ok;}
    heal(a,n,side){const before=a?.hp||0,actual=super.heal(a,n,side);if(actual>0){if(side===0)this.insight(this.insightKey,'healed',actual);this.emitVisual('heal',null,a,{amount:actual});if(side===0&&before/a.max<=.25)this.recordRecap('heal',this.get(this.visualHealer),a,actual,null,false,this.insightKey,this.recapOrigin||'unknown');if(side===0&&before/a.max<=.25)this.emitVisual('outcome',this.get(this.visualHealer),a,{type:'urgent-heal',amount:actual});}return actual;}
    ray(a,b,color){super.ray(a,b,color);if(color==='#9eb9de')this.emitVisual('protect',a,b);if(color==='#9bf0b1')this.emitVisual('heal-link',a,b);}
    recordKO(a,cause,protectedAlly){super.recordKO(a,cause,protectedAlly);this.emitVisual('ko',a,null);this.emitVisual('outcome',this.get(this.visualSource?.actor),a,{type:a.side===1?'finish':'ally-down',key:cause,protected:protectedAlly});if(a.action)this.endAction(a,'cancelled','시전자 전투불능');delete a.approach;delete a.purpose;delete a.counter;delete a.repositionHoldUntil;a.busy=this.s.t;}
    observedDamage(target,amount,side,source,pierce,key,attackerId){const previous=this.visualSource;this.visualSource={actor:attackerId};try{const m=this.s.mechanic,exposed=m&&target?.id===m.pattern.actor&&m.exposedUntil>(this.effectAt??this.s.t),actual=this.settleDamage(target,amount*(exposed?1+m.pattern.vulnerability:1),side,source,pierce,key,attackerId);if(exposed)m.stats.windowDamage+=actual;return actual;}finally{this.visualSource=previous;}}
    observedResolve(e){const previous=this.visualHealer,previousKey=this.insightKey,previousOrigin=this.recapOrigin,blocked=this.s.stats.blocked[0],a=this.get(e.actor),offense=window.GameCore.offense.includes(e.kind);if(a?.action&&offense&&!this.guardActive(1-e.side,e.at))a.action.hits++;this.visualHealer=e.actor;this.insightKey=e.side===0?e.key:null;this.recapOrigin=e.side===0?'card':'enemy';try{let result;if(e.spatial==='circleHeal'){for(const ally of this.spatialFriends(e)){this.heal(ally,e.power,e.side);this.ray(a,ally,'#9bf0b1');}}else result=super.resolve(e);if(e.side===0&&e.kind==='guard'&&!e.movement&&this.s.insights)this.s.insights.guardKey=e.key;if(e.side===1&&this.s.stats.blocked[0]>blocked)this.insight(this.s.insights?.guardKey,'blocks',this.s.stats.blocked[0]-blocked);return result;}finally{this.visualHealer=previous;this.insightKey=previousKey;this.recapOrigin=previousOrigin;}}
    startAction(a,key,cardId,target,phase='preparation'){
      a.action={id:++this.s.actionSerial,key,cardId:cardId||null,target:target||null,start:this.s.t,phase,hits:0};return a.action;
    }
    adoptAction(e){const a=this.get(e.actor);if(!a)return null;if(e.actionId===undefined&&a.action&&(a.action.key!==e.key||a.action.cardId!==(e.cardId||null)))this.endAction(a,'completed');const existing=a.action,action=existing||this.startAction(a,e.key,e.cardId,e.target,e.signatureFollow||e.chainFollow?'follow':'preparation');if(!existing)action.start=this.s.history.findLast(h=>h.type==='card'&&h.cardId===e.cardId&&h.side===a.side)?.at||0;e.actionId??=action.id;for(const pending of this.s.events)if(pending.actor===a.id&&pending.actionId===undefined&&pending.cardId===e.cardId)pending.actionId=action.id;return action;}
    decorateEvent(e){e.actionId=this.get(e.actor).action.id;if(e.spatial==='line'){const a=this.get(e.actor),target=this.get(e.target);e.spatialOrigin={x:a.x,y:a.y};e.spatialAim={x:target.x,y:target.y};}}
    targetMissing(e,at=this.s.t){const a=this.get(e.actor);if(!a)return true;if(window.GameCore.single.includes(e.kind)){const target=this.eventTarget(e,at);return !target||target.hp<=0||target.side===a.side;}if(window.GameCore.friendly.includes(e.kind)){const target=this.get(e.target);return !target||target.hp<=0||target.side!==a.side;}return false;}
    endAction(a,status,reason='',notify=true){
      const action=a.action;if(!action)return;this.s.events=this.s.events.filter(e=>e.actionId!==action.id);delete a.approach;delete a.action;
      if(status!=='completed'){a.busy=this.s.t;if(a.purpose?.actionId===action.id){delete a.purpose;a.ai.nextThinkAt=this.s.t;a.ai.target=null;}}
      this.s.actionResults.push({id:action.id,actor:a.id,key:action.key,cardId:action.cardId,start:action.start,at:this.s.t,status,reason,hits:action.hits});this.s.actionResults=this.s.actionResults.slice(-50);
      if(notify&&status!=='completed')this.emitVisual(status==='blocked'?'block':'cancel',a,this.get(action.target),{key:action.key,cardId:action.cardId,actionId:action.id,reason});
      if(status!=='completed')this.log(a.name+' · '+reason);
    }
    prepareActions(){
      for(const a of this.s.actors){const pending=this.s.events.filter(e=>e.actor===a.id).sort((x,y)=>x.at-y.at);if(!a.action&&pending[0])this.adoptAction(pending[0]);const action=a.action;if(!action)continue;
        if(a.hp<=0){this.endAction(a,'cancelled','시전자 전투불능');continue;}
        if(pending[0]&&this.targetMissing(pending[0])){this.endAction(a,'cancelled','대상 소실 · 기술 종료');continue;}
        if(pending.length){action.phase=pending[0].signatureFollow||pending[0].chainFollow?'follow':a.approach?'movement':'preparation';}
        else if(a.busy<=this.s.t)this.endAction(a,'completed');else action.phase='recovery';
      }
      this.syncZone();
    }
    syncZone(){const m=this.s.mechanic,h=m?.hazard;if(!h)return;const e=this.s.events.find(e=>e.zone&&e.actor===m.pattern.actor&&e.actionId===this.get(e.actor)?.action?.id);if(!e){m.hazard=null;for(const a of this.s.actors)if(a.repositionHoldUntil===h.at)delete a.repositionHoldUntil;return;}if(e.at!==h.at){for(const a of this.s.actors)if(a.repositionHoldUntil===h.at)a.repositionHoldUntil=e.at;h.at=e.at;}}
    validPurpose(a){const p=a.purpose,target=p&&this.get(p.target);return p&&p.until>(this.effectAt??this.s.t)&&a.hp>0&&target?.hp>0&&(p.kind==='cover'?target.side===a.side&&target.id!==a.id:p.kind==='chase'&&target.side!==a.side)?p:null;}
    aiContext(a){
      const actors=this.s.actors.map(b=>Object.freeze({id:b.id,side:b.side,role:b.role,characterId:b.characterId,hp:b.hp,max:b.max,x:b.x,y:b.y,stance:b.stance,cool:b.cool,range:b.range})),purpose=this.validPurpose(a);
      return Object.freeze({t:this.s.t,focus:this.s.enemyTactics?.focus.find(r=>r.actor===a.id&&r.until>this.s.t)?.mode||null,targetingRulesVersion:this.s.targetingRulesVersion,actor:actors.find(b=>b.id===a.id),actors:Object.freeze(actors),purpose:purpose?Object.freeze({...purpose}):null,forced:this.forced(a.side)?.id||null,strategy:this.s.strategy,phase:this.s.phase,policy:C.character(a.characterId)?.actorPolicy||'role',preference:C.character(a.characterId)?.actorPreference?Object.freeze({...C.character(a.characterId).actorPreference}):null});
    }
    inspectAI(id){const a=this.get(id);return a?this.basicPolicy(a,AI.plan(this.aiContext(a),a.ai)):null;}
    basicTarget(a){return this.get(AI.plan(this.aiContext(a),a.ai).attackTarget);}
    basicIntent(a){const intent=AI.plan(this.aiContext(a),a.ai);a.ai=intent.state;return this.basicPolicy(a,intent);}
    executeBasicIntent(a,intent,dt){
      // Preferred lane is a soft firing position, never a return-to-spawn order.
      const slot=this.s.formation?.[a.slot??a.role],target=this.get(intent.basic.target),distance=target?Math.hypot(a.x-target.x,a.y-target.y):Infinity;
      if(this.s.formationVersion===1&&a.side===0&&slot!=null&&a.role>=2&&a.hp>0&&a.busy<=this.s.t&&intent.basic.mode==='attack'&&!this.validPurpose(a)&&!this.forced(0)&&!(a.repositionHoldUntil>this.s.t)&&distance<=a.range-12&&(intent.move.mode==='toward'||intent.move.mode==='kite'&&distance>=160)){
        const y=window.Formation.point(slot).y,delta=y-a.y,step=Math.sign(delta)*Math.min(Math.abs(delta),a.speed*(a.slowUntil>this.s.t?.65:1)*dt*.35);
        if(Math.hypot(a.x-target.x,a.y+step-target.y)<=a.range-8){a.y+=step;intent={...intent,move:{mode:'none'}};}
      }
      return super.executeBasicIntent(a,intent,dt);
    }
    recommend(card){const mark=this.s.traits?.mark,d=this.definition(card),caster=this.caster(card),forced=caster&&window.GameCore.single.includes(d.kind)&&this.forced(caster.side,this.s.t+this.preparation(card,null,caster.side));if(forced)return forced.id;if(caster?.side===0&&this.traitLevel('pursuit')&&mark?.until>this.s.t&&this.get(mark.target)?.hp>0&&mark.actor!==this.caster(card)?.id&&window.GameCore.single.includes(d.kind)&&!this.forced(0,this.s.t+this.preparation(card,mark.target,0)))return mark.target;if(this.definition(card).movement==='rescue')return this.alive(0).filter(a=>a.id!==this.caster(card)?.id&&this.inside(a)).sort((a,b)=>a.hp/a.max-b.hp/b.max||a.id.localeCompare(b.id))[0]?.id||null;if(C.skill(card.key).target==='self')return this.caster(card)?.id;if(C.skill(card.key).target==='otherAlly')return this.alive(0).filter(a=>a.id!==this.caster(card)?.id).sort((a,b)=>this.tacticalScore(card,b.id)-this.tacticalScore(card,a.id))[0]?.id||null;return super.recommend(card);}
    target(id){const card=this.s.decks[0].hand.find(c=>c.id===this.s.selected),caster=card&&this.caster(card);if(C.skill(card?.key).target==='self'&&id!==caster?.id||C.skill(card?.key).target==='otherAlly'&&id===caster?.id)return false;return super.target(id);}
    commandCheck(side,id,target){
      const check=super.commandCheck(side,id,target);if(!check.ok)return check;const {card,d,actor}=check;
      if(actor.busy>this.s.t||actor.approach?.until>this.s.t||this.s.events.some(e=>e.actor===actor.id))return {ok:false,error:'이 캐릭터는 기술을 실행 중입니다. 다른 카드를 고르거나 전투를 재개하세요.'};
      if(C.skill(card.key).target==='self'&&target!==actor.id||C.skill(card.key).target==='otherAlly'&&target===actor.id)return {ok:false,error:'이 기술의 유효 대상을 선택하세요.'};
      if(d.purposeMode==='reject'&&this.validPurpose(actor))return {ok:false,error:'현재 행동이 끝난 뒤 사용할 수 있습니다.'};
      if(d.spatial&&this.s.spatialRulesVersion!==1)return {ok:false,error:'이 교전은 이전 공간 규칙입니다.'};
      if(d.spatial==='line'&&Math.hypot(actor.x-this.get(target).x,actor.y-this.get(target).y)>d.length)return {ok:false,error:'직선 공격 사거리 밖입니다.'};
      if(d.movement){if(!this.hazard())return {ok:false,error:'위험 구역 예고 중에만 사용할 수 있습니다.'};if(d.movement==='rescue'&&(target===actor.id||!this.inside(this.get(target))))return {ok:false,error:'위험 구역 안의 다른 동료를 선택하세요.'};if(d.movement==='party'&&!this.alive(0).some(a=>this.inside(a)))return {ok:false,error:'위험 구역 안의 아군이 없습니다.'};const moving=d.movement==='party'?this.alive(0).filter(a=>this.inside(a)):[this.get(target),actor].filter(a=>a&&this.inside(a));if(moving.some(a=>!this.safePoint(a)))return {ok:false,error:'전장 안에 안전한 재배치 지점이 없습니다.'};}
      return check;
    }
    onCommandAccepted({actor,d,prep,target,card}){if(actor.side===0)this.s.autoHold=null;this.startAction(actor,d.key,card.id,target);if(d.purposeMode==='replace'||d.movement){delete actor.repositionHoldUntil;delete actor.purpose;actor.ai.nextThinkAt=this.s.t;actor.ai.target=null;}this.emitVisual('cast',actor,this.get(target),{key:d.key,cardId:card.id,actionId:actor.action.id,until:this.s.t+prep});}
    tacticalScore(card,target){
      const a=this.caster(card),d=this.definition(card),b=this.get(target),skill=C.skill(card.key);if(!a||a.hp<=0)return 0;
      if(a.busy>this.s.t||a.approach?.until>this.s.t||this.s.events.some(e=>e.actor===a.id)||d.purposeMode==='reject'&&this.validPurpose(a))return 0;
      if(d.spatial&&this.s.spatialRulesVersion!==1)return 0;
      if(d.spatial==='circleHeal')return this.spatialFriends({...d,actor:a.id,side:a.side}).reduce((n,ally)=>n+Math.min(d.power,ally.max-ally.hp),0)*1.5/d.time;
      if(d.spatial==='line'&&(!b||Math.hypot(a.x-b.x,a.y-b.y)>d.length))return 0;
      if(d.movement){if(!this.commandCheck(0,card.id,target).ok)return 0;const h=this.hazard(),units=d.movement==='party'?this.alive(0).filter(a=>this.inside(a)):[b,a].filter(a=>this.inside(a));return units.reduce((n,a)=>n+(this.s.mechanic.pattern.power)*(1+(1-a.hp/a.max)),0)/d.time/Math.max(.3,h.at-this.s.t);}
      if(C.skill(card.key).target==='self'){if(b!==a)return 0;const threatened=this.alive(1).some(e=>this.basicTarget(e)?.id===a.id)||this.s.events.some(e=>e.side===1&&(e.target===a.id||e.kind==='area'));return threatened&&!a.counter?(Math.max(0,d.power-(a.shieldUntil>this.s.t?a.shield:0))+(skill.counterPower*.64))/d.time:0;}
      if(C.skill(card.key).target==='otherAlly'){if(!b||b.hp<=0||b.id===a.id||b.side!==0||a.purpose?.kind==='cover'&&a.purpose.until>this.s.t)return 0;const threat=this.alive(1).some(e=>this.basicTarget(e)?.id===b.id)||this.s.events.some(e=>e.side===1&&(e.target===b.id||e.kind==='area'));return threat?(Math.max(0,d.power-(b.shieldUntil>this.s.t?b.shield:0))+Math.min(b.max-b.hp,35)+14)/d.time:0;}
      let score=super.tacticalScore(card,target);
      if(C.skill(card.key).type==='comboStrike'){
        if(this.s.combatRulesVersion===1){const at=this.s.t+this.preparation(card,target,a.side),hit=this.eventTarget({...d,side:a.side,actor:a.id,target,at});if(!hit||hit.hp<=0)score=0;else{let shield=hit.shieldUntil>at?hit.shield:0,total=0;for(const offset of [0,...skill.offsets]){const tick=at+offset;let n=d.power*(a.buffUntil>tick?1+a.buff:1)*this.pressureMultiplier(a.side,tick)*(a.side===1?.78:1);if(hit.markUntil>tick)n*=1.3;if(hit.role===0&&hit.stance===0)n*=.7;if(hit.armorUntil>tick)n*=1-Math.min(.65,hit.armor);if(this.s.mechanic?.pattern.actor===hit.id&&this.s.mechanic.exposedUntil>tick)n*=1+this.s.mechanic.pattern.vulnerability;const absorbed=hit.shieldUntil>tick?Math.min(shield,n):0;shield-=absorbed;total+=n-absorbed;}score=(Math.min(hit.hp,total)+(total>=hit.hp?8:0))/(d.time+this.preparation(card,target,a.side)*.35);if(this.guardActive(1-a.side,at))score=0;}}
        else score=super.tacticalScore(card,target)*(1+skill.offsets.length);
      }
      if(d.kind==='taunt'&&a.side===0&&this.s.combatRulesVersion===1){if(a.hp/a.max<=.4||this.forced(1,this.s.t)?.id===a.id)score=0;else{const pressure=this.alive(1).reduce((n,e)=>{const plan=this.basicIntent(e),victim=this.get(plan?.basic?.target);return plan?.basic?.mode==='attack'&&e.busy<=this.s.t&&victim?.side===0&&victim.id!==a.id&&Math.hypot(e.x-victim.x,e.y-victim.y)<=e.range+e.speed? n+e.damage/e.period: n;},0);const pending=this.s.events.filter(e=>e.side===1&&window.GameCore.single.includes(e.kind)&&e.at>=this.s.t&&e.at<=this.s.t+d.duration&&this.get(e.actor)?.hp>0&&!this.guardActive(0,e.at)&&this.eventTarget(e,e.at)?.hp>0&&this.eventTarget(e,e.at)?.id!==a.id).reduce((n,e)=>n+(e.power||0)*.78,0);score=Math.max(score,(pressure*d.duration+pending)*.5/d.time);}}
      if(C.skill(card.key).type==='executeChain'){const hit=this.eventTarget({...d,side:a.side,actor:a.id,target,at:this.s.t+this.preparation(card,target,a.side)});if(hit?.hp>0){const damage=d.power*(hit.hp/hit.max<=.5?2:1);if(hit.hp<=damage&&this.alive(1-a.side).length>1)score+=7;}}
      if(a.purpose?.kind==='cover'&&a.purpose.until>this.s.t&&d.dash)score*=.25;
      if(this.hazard()&&(d.dash||d.approach)&&target===this.s.mechanic.pattern.actor)score*=.1;return score;
    }
    autoReason(card,target){const d=this.definition(card);if(d.spatial==='circleHeal')return '주변 유효 회복 '+this.spatialFriends({...d,actor:this.caster(card).id,side:0}).filter(a=>a.hp<a.max).length+'명';if(d.spatial==='line')return '직선 범위 공격 '+this.areaTargets({...d,actor:this.caster(card).id,side:0,target}).length+'명';if(this.definition(card).movement)return this.definition(card).movement==='rescue'?'위험 구역의 동료 구출':'위험 구역 밖으로 재배치';return C.skill(card.key).reason||super.autoReason(card,target);}
    resolve(e){
      const a=this.get(e.actor);if(!a)return;
      if(e.actionId!==undefined&&a.action?.id!==e.actionId)return;
      const action=this.adoptAction(e);if(a.hp<=0){this.endAction(a,'cancelled','시전자 전투불능');return;}
      if(e.zone&&!this.areaTargets(e).length){this.endAction(a,'completed');this.finishZone(e,[],false);return;}
      if(this.targetMissing(e,e.at)||e.kind==='area'&&!this.areaTargets(e).length){this.endAction(a,'cancelled','대상 소실 · 기술 종료');return;}
      action.target=this.eventTarget(e)?.id||action.target;action.phase='executing';const previous=this.effectAt,blocked=this.s.stats.blocked[1-e.side];this.effectAt=e.at;
      const traitMemo=this.traitPrepare(e);
      try{this.resolveEffect(traitMemo.e);this.traitFinish(traitMemo);}finally{this.effectAt=previous;}
      if(a.action?.id!==action.id)return;
      if(this.s.stats.blocked[1-e.side]>blocked){if(e.side===1&&this.s.traits?.protection.some(p=>p.target===null&&p.until>=e.at))this.traitGuardReady();this.recordRecap('block',a,this.eventTarget(e),0,e.key,false,e.side===0&&D.cards[e.key]?e.key:null,e.side===0?'card':'enemy');this.endAction(a,'blocked','차단 · 공격 종료',false);if(e.zone&&a.hp>0)a.busy=Math.max(a.busy,this.s.mechanic.exposedUntil);return;}
      const pending=this.s.events.filter(x=>x.actionId===action.id);
      if(pending[0]&&this.targetMissing(pending[0],e.at)){this.endAction(a,'completed','대상 처치 · 공격 종료');a.busy=this.s.t;}
      else if(pending.length)action.phase='follow';else {action.phase='recovery';if(a.busy<=this.s.t)this.endAction(a,'completed');}
    }
    resolveEffect(e){
      const a=this.get(e.actor),target=this.eventTarget(e),skill=C.skill(e.key);
      if(e.zone){const livingCount=this.alive(0).length,targets=this.areaTargets(e),blocked=this.guardActive(0,e.at);this.observedResolve(e);this.finishZone(e,targets,blocked,livingCount);return;}
      if(this.definition({key:e.key}).movement){this.relocate(e);return;}
      if(skill.type==='coverWard'){
        const point=this.approachPoint({x:target.x-65,y:target.y,side:a.side},target,55);a.x=point.x;a.y=point.y;delete a.approach;a.purpose={kind:'cover',target:target.id,until:e.at+e.duration,source:e.key,controls:'movement',actionId:e.actionId};this.applyCounter(a,skill.counterPower*(e.upgraded?1.35:1),e.at+e.duration,e.key);
        this.observedResolve(e);this.moment('cover',a,target);this.log(a.name+' · 네 곁을 지킬게');return;
      }
      if(skill.type==='counterWard'){this.observedResolve(e);this.applyCounter(a,skill.counterPower*(e.upgraded?1.35:1),e.at+e.duration,e.key);this.moment('parry',a,a);return;}
      if(skill.type==='comboStrike'&&!e.signatureFollow){
        this.moment('signature',a,target);const guard=this.s.guards[1-e.side],blocked=this.guardActive(1-e.side,e.at);this.observedResolve(e);if(blocked){this.emitVisual('block',a,target,{key:e.key,cardId:e.cardId});return;}this.s.stats.signatureHits++;this.emitVisual('signature-hit',a,target,{key:e.key,cardId:e.cardId,actionId:e.actionId,index:1});
        if(a.hp<=0)return;for(const offset of skill.offsets)this.s.events.push({...e,target:target.id,at:e.at+offset,signatureFollow:true,dash:false});a.busy=Math.max(a.busy,e.at+skill.recovery);return;
      }
      if(skill.type==='comboStrike'){if(target?.hp>0){const guard=this.s.guards[1-e.side],blocked=this.guardActive(1-e.side,e.at);this.observedResolve(e);if(blocked){this.s.events=this.s.events.filter(x=>!(x.signatureFollow&&x.actionId===e.actionId));this.emitVisual('block',a,target,{key:e.key,cardId:e.cardId});}else {this.s.stats.signatureHits++;this.emitVisual('signature-hit',a,target,{key:e.key,cardId:e.cardId,actionId:e.actionId,index:1+skill.offsets.length-this.s.events.filter(x=>x.signatureFollow&&x.cardId===e.cardId&&x.actor===e.actor).length});}}else this.emitVisual('cancel',a,target,{key:e.key,cardId:e.cardId,reason:'대상 처치 · 공격 종료'});return;}
      if(e.chainFollow){const event={...e},guard=this.s.guards[1-e.side],blocked=this.guardActive(1-e.side,e.at),landed=target?.hp>0&&target.side!==e.side&&!blocked;this.observedResolve(event);if(a.hp>0&&target?.hp>0)a.purpose={kind:'chase',target:target.id,until:e.at+skill.followHold,source:e.key,controls:'movement'};if(landed)this.s.stats.chainHits++;this.moment('chain',a,target,{landed:!!landed});if(landed)this.emitVisual('outcome',a,target,{type:'chain',key:e.key,cardId:e.cardId});else this.emitVisual(blocked?'block':'cancel',a,target,{key:e.key,cardId:e.cardId,reason:'추가 공격 종료'});return;}
      if(skill.type==='executeChain'){
        this.observedResolve(e);if(a.hp>0&&target?.hp>0)a.purpose={kind:'chase',target:target.id,until:e.at+e.hold,source:e.key,controls:'movement'};
        if(a.hp>0&&target&&target.hp===0){const next=this.alive(1-e.side).sort((x,y)=>Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y))[0];if(next)this.s.events.push({...e,kind:'attack',power:skill.followPower*(e.upgraded?1.35:1)*(e.traitMultiplier||1),target:next.id,at:e.at+skill.followDelay,chainFollow:true});}
        return;
      }
      const blockedBefore=this.s.stats.blocked[1-e.side];this.observedResolve(e);if(this.s.stats.blocked[1-e.side]>blockedBefore)this.emitVisual('block',a,target,{key:e.key,cardId:e.cardId,actionId:e.actionId});
      if(skill.type==='chaseStrike'&&a.hp>0&&target?.hp>0){a.purpose={kind:'chase',target:target.id,until:e.at+e.hold,source:e.key,controls:'movement'};this.moment('dash',a,target);}
      if(skill.type==='retreatStrike'&&a.hp>0&&target?.hp>0){const dx=a.x-target.x,dy=a.y-target.y,dist=Math.max(1,Math.hypot(dx,dy));a.x=Math.max(35,Math.min(925,a.x+dx/dist*skill.retreat));a.y=Math.max(35,Math.min(355,a.y+dy/dist*skill.retreat));this.moment('cut',a,target);}
    }
    finishZone(e,targets,blocked,livingCount=this.alive(0).length){const m=this.s.mechanic;if(!m)return;const hits=blocked?0:targets.length,dodges=Math.max(0,livingCount-targets.length);m.stats.hits+=hits;m.stats.dodges+=dodges;m.history.push({at:this.s.t,kind:'impact',x:e.center.x,y:e.center.y,radius:e.radius,...(e.shape==='line'?{shape:e.shape,length:e.length,width:e.width,angle:e.angle}:{}),hits,dodges,blocked});m.history=m.history.slice(-30);m.hazard=null;this.openWindow(e);}
    relocate(e){const h=this.hazard();if(!h)return;const d=this.definition({key:e.key}),units=d.movement==='party'?this.alive(0).filter(a=>this.inside(a)):[this.get(e.target),this.get(e.actor)].filter(a=>a?.hp>0);let count=0;for(const a of units){if(!this.inside(a,h))continue;const from={x:a.x,y:a.y},p=this.safePoint(a,h);if(!p)continue;if(a.id!==e.actor&&a.action)this.endAction(a,'cancelled','재배치 · 기술 중단');a.x=p.x;a.y=p.y;a.repositionHoldUntil=h.at;delete a.purpose;delete a.approach;a.ai.target=null;a.ai.nextThinkAt=this.s.t;this.emitVisual('reposition',a,a,{fromX:from.x,fromY:from.y});count++;}if(e.side===0)this.insight(e.key,'moved',count);this.s.mechanic.stats[d.movement==='rescue'?'rescued':'repositioned']+=count;this.log(d.name+' · '+count+'명 안전 지점 이동');}
    applyEffect(a,kind,power,until){
      if(!a||a.hp<=0)return;const at=this.effectAt??this.s.t;
      const fields={ward:['shield','shieldUntil'],armor:['armor','armorUntil'],buff:['buff','buffUntil']},pair=fields[kind];
      if(pair){const active=a[pair[1]]>at;if(kind==='ward'&&a.side===0&&this.s.insights&&this.insightKey&&(!active||power>=a.shield))this.s.insights.shields[a.id]=this.insightKey;a[pair[0]]=Math.max(active?a[pair[0]]:0,power);a[pair[1]]=Math.max(active?a[pair[1]]:0,until);}
      else a[kind+'Until']=Math.max(a[kind+'Until']>at?a[kind+'Until']:0,until);
    }
    applyCounter(a,power,until,key){const old=a.counter?.until>(this.effectAt??this.s.t)?a.counter:null;a.counter={power:Math.max(old?.power||0,power),until:Math.max(old?.until||0,until),key:old&&old.power>power?old.key:key};}
    static protectionRules=Object.freeze({guardRadius:110,coverRadius:115,guardShare:.2,coverShare:.25});
    protectionFor(target,at=this.effectAt??this.s.t){
      if(!target||target.hp<=0)return null;const rules=CharacterBattle.protectionRules,allies=this.alive(target.side).filter(a=>a.id!==target.id),distance=a=>Math.hypot(a.x-target.x,a.y-target.y);
      const cover=target.side===0?allies.find(a=>a.purpose?.kind==='cover'&&a.purpose.target===target.id&&a.purpose.until>at&&distance(a)<rules.coverRadius):null;
      if(cover)return {actor:cover,kind:'cover',radius:rules.coverRadius,share:rules.coverShare};
      const guard=allies.filter(a=>a.role===0&&a.stance===0&&distance(a)<rules.guardRadius).sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id))[0];
      return guard?{actor:guard,kind:'guard',radius:rules.guardRadius,share:rules.guardShare}:null;
    }
    damage(target,amount,side,source,pierce=false,key=null,attackerId=null){
      if(!target||target.hp<=0||!(amount>0))return 0;const before=target.hp,shield=target.shield;
      const result=this.observedDamage(target,amount,side,source,pierce,key,attackerId);
      if(side===1&&this.s.traits?.protection.some(p=>p.target===target.id&&p.until>=(this.effectAt??this.s.t))&&(result>0||target.shield<shield))this.traitGuardReady(target);
      this.emitVisual('hit',this.get(attackerId),target,{amount:before-target.hp,key,source});
      const attacker=this.get(attackerId),passive=!this.passiveResolving&&side===0&&source==='basic'&&result>0&&C.character(attacker?.characterId)?.passive;
      if(passive){const state=attacker.passiveState;if(state.target!==target.id){state.target=target.id;state.hits=0;}state.hits++;if(state.hits===passive.hits){state.hits=0;if(target.hp>0){state.procs++;this.log(attacker.name+' · 흔들리지 않는 조준 · 추가 사격');this.passiveResolving=true;try{this.damage(target,passive.power*attacker.damage/C.character(attacker.characterId).basicProfile.damage,side,'basic',false,null,attacker.id);}finally{this.passiveResolving=false;}}}}
      return result;
    }
    settleDamage(target,amount,side,source,pierce,key,attackerId){
      if(!target||target.hp<=0||!(amount>0))return 0;
      const s=this.s,at=this.effectAt??s.t,n=this.mitigateDamage(target,amount,pierce);
      // Partition final injury once: redirected injury cannot be defended or shared again.
      const protection=this.protectionFor(target,at),protector=protection?.actor,cover=protection?.kind==='cover'?protector:null;
      const coverKey=cover?.purpose?.source;
      const share=protector?Math.min(protector.hp,n*protection.share):0;
      let moved=0;if(share>0){moved=this.applyHealthDamage(protector,share,side,source,key,true);if(target.side===0)this.recordRecap('protect',protector,target,moved,key,false,cover?coverKey:null,cover?(coverKey?'card':'unknown'):'basic');if(cover){s.stats.covered+=moved;if(target.side===0)this.insight(coverKey,'shared',moved);}else {s.stats.protected??=[0,0];s.stats.protected[target.side]+=moved;}this.ray(protector,target,cover?'#f3bbd0':'#9eb9de');if(cover)this.moment('cover',protector,target);this.emitVisual('protect',protector,target,{amount:moved});}
      const actual=this.applyHealthDamage(target,n-share,side,source,key);
      const counter=share>0&&protector.hp>0&&protector.counter?.until>at?protector:target.hp>0&&target.counter?.until>at?target:null,attacker=this.get(attackerId);
      // A shielded direct hit can trigger parry; a fully shielded ally needs no cover counter.
      if(side===1&&counter&&attacker?.hp>0&&attacker.side!==target.side){const response=counter.counter;delete counter.counter;const responseDamage=this.observedDamage(attacker,response.power,0,'card',false,response.key,counter.id);this.recordRecap('counter',counter,attacker,responseDamage,response.key,false,response.key,'card');this.ray(counter,attacker,'#ffe4aa');this.moment('counter',counter,attacker);s.stats.counters++;this.log(counter.name+' · 받아치기!');}
      return actual+moved;
    }
    cleanupPurposes(){
      for(const a of this.s.actors){for(const [value,until] of [['shield','shieldUntil'],['armor','armorUntil'],['buff','buffUntil']])if(a[until]<=this.s.t){a[value]=0;a[until]=0;}for(const k of ['slowUntil','markUntil'])if(a[k]<=this.s.t)a[k]=0;if(a.purpose&&!this.validPurpose(a)){delete a.purpose;a.ai.nextThinkAt=this.s.t;a.ai.target=null;}if(a.counter?.until<=this.s.t)delete a.counter;}
    }
    checkEnd(){if(this.s.mechanic&&this.get(this.s.mechanic.pattern.actor)?.hp<=0){this.s.mechanic.hazard=null;this.s.mechanic.exposedUntil=0;}if(this.s.ended||!this.s.ready)this.s.autoHold=null;for(let side=0;side<2;side++){if(this.s.guards[side].until<=this.s.t)this.s.guards[side]={n:0,until:0};const taunt=this.s.taunts[side];if(taunt.until<=this.s.t||this.get(taunt.actor)?.hp===0)this.s.taunts[side]={from:0,until:0,actor:null};}this.cleanupPurposes();const ended=this.s.ended||super.checkEnd();if(ended){this.s.autoHold=null;if(this.s.mechanic){this.s.mechanic.hazard=null;this.s.mechanic.exposedUntil=0;}for(const a of this.s.actors)delete a.repositionHoldUntil;for(const a of this.s.actors)if(a.action){const pending=this.s.events.some(e=>e.actionId===a.action.id);this.endAction(a,pending?'cancelled':'completed',pending?'전투 종료':'');a.busy=this.s.t;}this.s.events=[];}else this.prepareActions();return ended;}
    step(dt){const s=this.s;if(s.paused||s.ended)return;super.step(s.battleLimit?Math.min(dt,Math.max(0,s.battleLimit-s.t)):dt);if(!s.ended&&s.battleLimit&&s.t>=s.battleLimit){s.ended=true;s.paused=true;s.winner=1;s.selected=null;s.target=null;s.waiting=false;s.ready=false;s.intervening=false;s.endReason='교전 시간 초과 (180초)';this.log(s.endReason);this.checkEnd();}}
    basics(dt){
      this.cleanupPurposes();if(this.s.targetingRulesVersion!==1){super.basics(dt);return;}
      const ready=this.s.actors.filter(a=>this.prepareBasicActor(a,dt));
      // Evaluate every intent before executing movement; no actor gets an earlier view.
      const plans=ready.map(a=>({a,intent:this.basicIntent(a)}));for(const {a,intent}of plans)this.executeBasicIntent(a,intent,dt);
    }
  }
  window.CharacterBattle=CharacterBattle;
})();
