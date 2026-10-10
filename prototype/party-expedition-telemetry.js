(function(root){
  'use strict';
  const Combat=typeof module!=='undefined'?require('./party-expedition-core.js'):root.PartyExpedition;
  const copy=x=>JSON.parse(JSON.stringify(x)),sum=(xs,f)=>xs.reduce((n,x)=>n+f(x),0);
  const VERSION='expedition-telemetry-1';
  const metrics=()=>({enemyDamage:0,blocked:0,selfDamage:0,healing:0,shield:0,damageToEnemies:0,energySpent:0,energyGained:0,cardsPlayed:0,basicAttacks:0,toolsUsed:0,deaths:0});
  const cardName=k=>Combat.CARDS[k]?.name||k;
  function inventoryChanges(before,after){
    const previous=new Map((before.deck||[]).map(c=>[c.id,c])),current=new Map((after.deck||[]).map(c=>[c.id,c]));
    const added=[...current.values()].filter(c=>!previous.has(c.id)),removed=[...previous.values()].filter(c=>!current.has(c.id));
    const changed=[...current.values()].filter(c=>previous.has(c.id)&&JSON.stringify(c)!==JSON.stringify(previous.get(c.id))).map(c=>({before:previous.get(c.id),after:c}));
    const relicsAdded=(after.relics||[]).filter(id=>!(before.relics||[]).includes(id)),relicsRemoved=(before.relics||[]).filter(id=>!(after.relics||[]).includes(id));
    const toolsChanged=JSON.stringify(before.tools||[])!==JSON.stringify(after.tools||[]);
    if(!added.length&&!removed.length&&!changed.length&&!relicsAdded.length&&!relicsRemoved.length&&!toolsChanged)return null;
    return copy({cards:{added,removed,changed},relics:{added:relicsAdded,removed:relicsRemoved},...(toolsChanged?{tools:{before:before.tools||[],after:after.tools||[]}}:{})});
  }
  function publicState(b){
    if(!b)return null;
    return {round:b.round,energy:b.energy,status:b.status,needsTrim:b.needsTrim,
      hand:b.zones.hand.map(id=>({id,...copy(b.cards[id])})),intents:copy(b.intents),
      allies:copy(b.allies),enemies:copy(b.enemies),powers:copy(b.powers||{}),pending:copy(b.pending||{}),
      discardCount:b.zones.discard.length,drawCount:b.zones.draw.length,reserveCount:b.zones.reserve.length,exhaustCount:b.zones.exhaust.length};
  }
  function createRecorder(config,initial){
    const record={version:VERSION,config:{...copy(config),balanceVersion:initial.balanceVersion||'voyage-balance-0',...(initial.contentVersion==='voyage-2'?{contentVersion:initial.contentVersion}:{})},contentVersion:initial.contentVersion,status:'running',reason:null,
      initial:{party:copy(initial.party),deck:copy(initial.deck),allies:copy(initial.allies),gold:initial.gold},decisions:[],battles:[]};
    let active=null;
    function begin(s){
      const b=s.battle;
      active={id:record.battles.length+1,floor:s.floor+1,nodeId:s.route.id,name:s.route.name,tier:s.route.rewardTier||'battle',
        encounter:b.enemies.map(e=>e.pattern).sort().join('+'),party:copy(s.party),policy:config.policy||'balanced',seed:config.seed,
        enemies:copy(b.enemies),deck:copy(s.deck),relics:copy(s.relics||[]),tools:copy(s.tools||[]),rule:b.voyage?.rule||'normal',
        entry:publicState(b),exit:null,postBattleAllies:null,status:'running',rounds:1,metrics:metrics(),byEnemy:{},byTarget:{},cards:{},roundStats:{},actions:[],healthAccounting:null};
      record.battles.push(active);
      // Constructor draw events are real draws; no preview events are collected.
      active.drawnCards=[...new Set(b.zones.hand.map(id=>b.cards[id].kind))];
    }
    function account(transition){
      const {before,after,decision}=transition,b=before.battle,events=transition.events||[],m=active.metrics;
      const round=active.roundStats[b.round]||(active.roundStats[b.round]={round:b.round,...metrics()});
      const allies=new Set(b.allies.map(a=>a.id)),enemies=new Set(b.enemies.map(a=>a.id));
      const add=(key,value)=>{m[key]+=value;round[key]+=value;};
      const played=events.find(e=>e.type==='card'),basic=decision.method==='play'&&decision.args[0]==='basic';
      let card=null;
      if(played||basic){
        const id=played?.card||'basic',kind=b.cards[id]?.kind||'basic';
        card=active.cards[kind]||(active.cards[kind]={kind,name:cardName(kind),plays:0,damage:0,healing:0,shield:0,energySpent:0,byActor:{},choices:{}});
        card.plays++;card.byActor[decision.args[1]]=(card.byActor[decision.args[1]]||0)+1;
        if(played?.choice!==undefined)card.choices[played.choice]=(card.choices[played.choice]||0)+1;
        const spent=played?.cost??(b.energy-after.battle.energy);
        card.energySpent+=spent;add('energySpent',spent);add(basic?'basicAttacks':'cardsPlayed',1);
      }
      for(const e of events){
        if(e.type==='damage'){
          if(allies.has(e.target)&&enemies.has(e.source)){
            add('enemyDamage',e.amount);add('blocked',e.absorbed||0);
            const enemy=active.byEnemy[e.source]||(active.byEnemy[e.source]={id:e.source,name:b.enemies.find(x=>x.id===e.source).name,pattern:b.enemies.find(x=>x.id===e.source).pattern,damage:0,blocked:0,byTarget:{}});
            enemy.damage+=e.amount;enemy.blocked+=e.absorbed||0;enemy.byTarget[e.target]=(enemy.byTarget[e.target]||0)+e.amount;
            const target=active.byTarget[e.target]||(active.byTarget[e.target]={damage:0,blocked:0});target.damage+=e.amount;target.blocked+=e.absorbed||0;
          }else if(allies.has(e.target))add('selfDamage',e.amount);
          else if(enemies.has(e.target)){add('damageToEnemies',e.amount);if(card)card.damage+=e.amount;}
        }
        if(e.type==='heal'&&allies.has(e.target)){add('healing',e.amount);if(card)card.healing+=e.amount;}
        if(e.type==='shield'&&allies.has(e.target)){add('shield',e.amount);if(card)card.shield+=e.amount;}
        if(e.type==='energy')add('energyGained',e.amount);
        if(e.type==='tool')add('toolsUsed',1);
        if(e.type==='downed')add('deaths',1);
        if(e.type==='draw'){
          const kind=after.battle.cards[e.card]?.kind;if(kind&&!active.drawnCards.includes(kind))active.drawnCards.push(kind);
        }
      }
      active.actions.push({index:active.actions.length+1,round:b.round,method:decision.method,args:copy(decision.args),reason:decision.reason,
        card:played?{id:played.card,kind:b.cards[played.card].kind,name:cardName(b.cards[played.card].kind),upgraded:b.cards[played.card].upgraded,enchant:b.cards[played.card].enchant||null,cost:played.cost,choice:played.choice??null}:basic?{id:'basic',kind:'basic',name:cardName('basic')}:null,
        before:publicState(b),after:publicState(after.battle),events:copy(events)});
      active.rounds=Math.max(active.rounds,after.battle.round);
      if(after.battle.status!=='playing')close(after,after.battle.status);
    }
    function close(s,status){
      if(!active)return;
      active.status=status;active.exit=publicState(s.battle);active.postBattleAllies=copy(s.allies);
      const m=active.metrics,entryHP=sum(active.entry.allies,a=>a.hp),exitHP=sum(active.exit.allies,a=>a.hp);
      active.healthAccounting={entryHP,exitHP,expectedHP:entryHP+m.healing-m.enemyDamage-m.selfDamage,
        matches:entryHP+m.healing-m.enemyDamage-m.selfDamage===exitHP};
      active=null;
    }
    return {record,observe(t){
      const {before,after,decision}=t;
      const inventory=before.phase==='battle'?null:inventoryChanges(before,after);
      record.decisions.push({index:record.decisions.length+1,phase:before.phase,floor:before.floor+1,method:decision.method,args:copy(decision.args),reason:decision.reason,
        candidates:before.phase==='reward'?copy(before.offers):before.phase==='map'?before.choices.map(c=>({id:c.id,name:c.name,tier:c.rewardTier,interlude:c.interlude||null,event:c.event||null,enemies:copy(c.enemies||[])})):before.phase==='blessing'?copy(before.blessings):before.phase==='relicreward'?copy(before.relicChoices):before.phase==='patron'?copy(before.pacts):before.phase==='interlude'?copy(before.interlude):null,
        ...(inventory?{inventoryChanges:inventory}:{}),
        goldBefore:before.gold,goldAfter:after.gold,hpBefore:before.allies.map(a=>a.hp),hpAfter:after.allies.map(a=>a.hp)});
      if(before.phase==='battle'){
        if(!active)begin(before);account(t);
      }else if(after.phase==='battle')begin(after);
    },finish(status,s,reason=null){
      if(record.status!=='running')return copy(record);
      if(active)close(s,status==='error'?'error':'aborted');
      record.status=status;record.reason=reason;record.final={phase:s.phase,floor:s.floor+1,allies:copy(s.allies),deck:copy(s.deck),relics:copy(s.relics||[]),tools:copy(s.tools||[]),gold:s.gold,battlesWon:s.battlesWon};
      return copy(record);
    }};
  }
  function summarize(records){
    const runs={total:records.length,won:0,lost:0,aborted:0,error:0},battles={total:0,won:0,lost:0,aborted:0,error:0},groups=new Map(),cards=new Map();
    for(const r of records){
      if(runs[r.status]!==undefined)runs[r.status]++;
      for(const b of r.battles){
        battles.total++;if(battles[b.status]!==undefined)battles[b.status]++;
        const key=[b.encounter,b.floor,b.tier,b.party.join('+'),b.policy,r.config.difficulty,r.config.breakMode].join('|');
        let g=groups.get(key);if(!g){g={key,name:b.name,encounter:b.encounter,floor:b.floor,tier:b.tier,party:b.party,policy:b.policy,difficulty:r.config.difficulty,breakMode:r.config.breakMode,n:0,won:0,lost:0,aborted:0,error:0,damage:0,blocked:0,rounds:0,healing:0,deaths:0,tools:0,damageSamples:[],outcomes:{won:{n:0,damage:0,blocked:0,rounds:0},lost:{n:0,damage:0,blocked:0,rounds:0}}};groups.set(key,g);}
        // Incomplete fights remain visible, but are excluded from completed averages.
        if(['won','lost'].includes(b.status)){g.n++;g[b.status]++;g.damage+=b.metrics.enemyDamage;g.blocked+=b.metrics.blocked;g.rounds+=b.rounds;g.healing+=b.metrics.healing;g.deaths+=b.metrics.deaths;g.tools+=b.metrics.toolsUsed;g.damageSamples.push(b.metrics.enemyDamage);const o=g.outcomes[b.status];o.n++;o.damage+=b.metrics.enemyDamage;o.blocked+=b.metrics.blocked;o.rounds+=b.rounds;}
        else if(g[b.status]!==undefined)g[b.status]++;
        const present=new Set(b.deck.map(c=>c.kind));present.add('basic');
        for(const kind of present){
          let c=cards.get(kind);if(!c){c={kind,name:cardName(kind),plays:0,battlesPresent:0,battlesDrawn:0,battlesUsed:0,wonUsed:0,lostUsed:0,damage:0,healing:0,shield:0,energySpent:0,byActor:{}};cards.set(kind,c);}
          if(!['won','lost'].includes(b.status))continue;
          c.battlesPresent++;if(kind==='basic'||b.drawnCards.includes(kind))c.battlesDrawn++;const u=b.cards[kind];if(!u)continue;
          c.battlesUsed++;c.plays+=u.plays;if(b.status==='won')c.wonUsed++;else c.lostUsed++;
          for(const metric of ['damage','healing','shield','energySpent'])c[metric]+=u[metric];
          for(const [actor,n]of Object.entries(u.byActor))c.byActor[actor]=(c.byActor[actor]||0)+n;
        }
      }
    }
    const encounters=[...groups.values()].map(g=>{
      const sorted=g.damageSamples.slice().sort((a,b)=>a-b),n=g.n;
      return {...g,outcomes:Object.fromEntries(Object.entries(g.outcomes).map(([status,o])=>[status,{...o,meanDamage:o.n?o.damage/o.n:null,meanBlocked:o.n?o.blocked/o.n:null,meanRounds:o.n?o.rounds/o.n:null}])),meanDamage:n?g.damage/n:null,meanBlocked:n?g.blocked/n:null,meanRounds:n?g.rounds/n:null,meanHealing:n?g.healing/n:null,p90Damage:n?sorted[Math.ceil(n*.9)-1]:null};
    }).sort((a,b)=>b.floor-a.floor||(b.meanDamage||0)-(a.meanDamage||0));
    const signals=[];
    for(const g of encounters){
      if(g.n<5)continue;
      const prefix=`${g.floor}구역 ${g.name} (${g.policy}, ${g.n}전)`;
      if(g.lost/g.n>=.2)signals.push(`${prefix}: 패배 ${g.lost}회. 진입 HP·덱·도구 소비를 먼저 비교하세요.`);
      if(g.won===g.n&&g.meanRounds<=2&&g.meanDamage<=2)signals.push(`${prefix}: 평균 ${g.meanRounds.toFixed(1)}턴·HP 피해 ${g.meanDamage.toFixed(1)}. 주요 패턴을 경험하기 전에 끝나는지 확인하세요.`);
      if(g.p90Damage>g.meanDamage*2+10)signals.push(`${prefix}: 평균 피해 ${g.meanDamage.toFixed(1)}에 비해 상위 10% 피해 ${g.p90Damage}. 일부 진입 상태에서 부담이 집중됩니다.`);
    }
    const completed=records.flatMap(r=>r.battles).filter(b=>['won','lost'].includes(b.status));
    if(completed.some(b=>!b.healthAccounting?.matches))signals.unshift('HP 회계 불일치가 있습니다. 밸런스 해석 전에 수집 오류를 확인하세요.');
    if(!signals.length)signals.push('현재 표본에서 경고 조건이 발견되지 않았습니다. 균형이나 재미가 검증됐다는 뜻은 아닙니다.');
    const reach=Array.from({length:8},(_,i)=>({floor:i+1,runsReached:records.filter(r=>r.final.floor>=i+1).length,battlesEntered:records.reduce((n,r)=>n+r.battles.filter(b=>b.floor===i+1).length,0)}));
    return {version:VERSION,runs,battles,reach,encounters,cards:[...cards.values()].sort((a,b)=>b.plays-a.plays),signals,
      limitations:['정책은 휴리스틱이며 사람의 선택·재미를 대변하지 않습니다.','카드 사용과 승패의 연관은 인과관계가 아닙니다. 덱·유물·진입 HP·구역을 함께 비교하세요.','평균은 완료된 전투만 포함합니다. 중단·오류는 패배와 별도로 집계합니다. 후반 전투는 도달한 원정만 포함하는 생존자 편향이 있습니다.','카드 피해·회복·생성 보호는 즉시 실행 효과와 실행자·유물 효과를 함께 포함합니다. 후속 턴의 효과는 해당 카드에 소급 귀속하지 않습니다.','같은 seed라도 경로와 선택에 따른 난수 소비 때문에 이후 보상·전투는 달라질 수 있습니다.']};
  }
  function battleCSV(records){
    const rows=[['seed','policy','party','difficulty','breakMode','floor','node','encounter','tier','status','entryHP','exitHP','rounds','enemyHPDamage','shieldAbsorbed','selfHPDamage','combatHealing','generatedShield','toolsUsed','deaths','cardPlays','healthAccountingMatches']];
    for(const r of records)for(const b of r.battles)rows.push([r.config.seed,b.policy,b.party.join('+'),r.config.difficulty,r.config.breakMode,b.floor,b.nodeId,b.encounter,b.tier,b.status,b.healthAccounting?.entryHP??sum(b.entry.allies,a=>a.hp),b.healthAccounting?.exitHP??'',b.rounds,b.metrics.enemyDamage,b.metrics.blocked,b.metrics.selfDamage,b.metrics.healing,b.metrics.shield,b.metrics.toolsUsed,b.metrics.deaths,b.metrics.cardsPlayed,b.healthAccounting?.matches??'']);
    return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  }
  const api={VERSION,createRecorder,summarize,battleCSV,publicState};
  if(typeof module!=='undefined')module.exports=api;else root.PartyExpeditionTelemetry=api;
})(typeof globalThis!=='undefined'?globalThis:this);
