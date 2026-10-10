'use strict';
(function(root){
  const clone=x=>JSON.parse(JSON.stringify(x));
  const traits={escort:{name:'호위',color:'#77d5c5'},pursuit:{name:'추격',color:'#ffb17d'},resonance:{name:'공명',color:'#b5a7ff'}};
  const cards={
    bind:{name:'결속',actor:'doyun',cost:1,trait:'pursuit',kind:'bind',target:'enemy',power:8,description:'대상의 다음 행동 피해를 절반으로 줄임. 다음 기술 타격 +8, 1회.',art:'⌁'},
    impact:{name:'충격참',actor:'harin',cost:2,trait:'pursuit',kind:'attack',target:'enemy',power:20,description:'적 한 명에게 피해 20.',art:'✦'},
    guard:{name:'엄호',actor:'doyun',cost:1,trait:'escort',kind:'shield',target:'ally',power:10,description:'동료 한 명에게 보호 10. 대상의 다음 개인 턴 시작까지 유지.',art:'◇'},
    pull:{name:'견인',actor:'doyun',cost:1,trait:'escort',kind:'move',target:'ally',power:0,description:'동료 한 명을 반대 열로 이동. 구역 공격을 피할 수 있음.',art:'↝'},
    slash:{name:'짧은 베기',actor:'harin',cost:1,trait:'resonance',kind:'attack',target:'enemy',power:10,description:'적 한 명에게 피해 10.',art:'╱'},
    mend:{name:'연결 회복',actor:'doyun',cost:1,trait:'resonance',kind:'heal',target:'ally',power:8,description:'동료 한 명의 HP 8 회복.',art:'+'},
    parry:{name:'받아치기',actor:'harin',cost:1,trait:'escort',kind:'parry',target:'self',power:10,description:'자신에게 보호 10. 피해를 막으면 공격자에게 반격 6, 1회.',art:'⟐'},
    burst:{name:'파열참',actor:'harin',cost:2,trait:'pursuit',kind:'attack',target:'enemy',power:28,description:'적 한 명에게 피해 28. 원정 보상 기술.',art:'✴'},
    shelter:{name:'정박 보호',actor:'doyun',cost:1,trait:'escort',kind:'shield',target:'ally',power:16,description:'동료 한 명에게 보호 16. 대상의 다음 개인 턴 시작까지 유지.',art:'⬡'},
    reunion:{name:'다시 연결',actor:'doyun',cost:2,trait:'resonance',kind:'partyHeal',target:'self',power:10,description:'생존한 아군 전체의 HP 10 회복.',art:'✧'}
  };
  function definition(c){if(!cards[c.key])throw Error('카드 없음');const d={...cards[c.key]};if(c.upgraded&&d.power)d.power+=d.kind==='attack'?5:4;return d;}
  function description(c){const d=definition(c);if(d.kind==='attack')return `적 한 명에게 피해 ${d.power}.`;if(d.kind==='shield')return `동료 한 명에게 보호 ${d.power}. 대상의 다음 개인 턴 시작까지.`;if(d.kind==='heal')return `동료 한 명의 HP ${d.power} 회복.`;return d.description;}
  function starter(style='balanced'){let keys=['bind','impact','guard','pull','slash','mend','bind','impact','guard','slash','mend','parry'];if(style==='attack')keys.splice(8,3,'slash','impact','slash');if(style==='protect')keys.splice(7,3,'guard','mend','parry');return keys.map((key,i)=>({id:'card-'+i,key,upgraded:false}));}
  const encounters=[
    {name:'쌍방 압박',hint:'하린 대상 공격과 후열 공격을 함께 해결하세요.',enemies:[{id:'e0',name:'사냥꾼',hp:28,lane:'front',type:'hunter',power:12},{id:'e1',name:'주술사',hp:18,lane:'rear',type:'rear',power:8}]},
    {name:'갈라진 승강장',hint:'전열 공격이 등장합니다. 무조건 앞으로 모이는 것은 위험합니다.',enemies:[{id:'e0',name:'돌격병',hp:34,lane:'front',type:'striker',power:13},{id:'e1',name:'파동술사',hp:24,lane:'rear',type:'front',power:7},{id:'e2',name:'복원자',hp:16,lane:'rear',type:'healer',power:7}]},
    {name:'잔향의 파수꾼',hint:'전열·후열 공격이 번갈아 옵니다. 체력이 낮아지면 다음 턴부터 강공격.',enemies:[{id:'e0',name:'잔향의 파수꾼',hp:62,lane:'front',type:'boss',power:11},{id:'e1',name:'추적자',hp:24,lane:'rear',type:'hunter',power:10}]}
  ];
  class Battle{
    constructor(config={}){
      const deck=clone(config.cards||starter(config.style));
      if(!deck.length||new Set(deck.map(c=>c.id)).size!==deck.length||deck.some(c=>!cards[c.key]))throw Error('올바르지 않은 덱');
      const encounter=encounters[config.stage||0];if(!encounter)throw Error('전투 없음');
      this.s={version:1,stage:config.stage||0,seed:(config.seed||137)>>>0,round:0,phase:'choice',energy:3,actors:[{id:'doyun',name:'도윤',side:0,max:40,hp:config.hp?.doyun??40,lane:'rear',basic:2,color:'#77d5c5'},{id:'harin',name:'하린',side:0,max:44,hp:config.hp?.harin??44,lane:'front',basic:3,color:'#ffb17d'},...encounter.enemies.map(e=>({...e,side:1,max:e.hp,color:e.type==='boss'?'#be9ffa':'#ef8597'}))].map(a=>({...a,shield:0,bound:0,boost:0,counter:0})),draw:[],hand:[],discard:[],excluded:[],intents:[],basics:[],history:[],stats:{cards:0,cardDamage:0,basicDamage:0,blocked:0,healing:0,moves:0},deck:clone(deck)};
      const opening=deck.slice(0,5);this.s.draw=this.shuffle(deck.slice(5));this.s.draw=[...opening,...this.s.draw];
      this.begin();
    }
    snapshot(){return clone(this.s);}
    static restore(s){if(s.version!==1)throw Error('규칙 버전 불일치');const b=Object.create(Battle.prototype);b.s=clone(s);return b;}
    random(){let x=this.s.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.s.seed=x>>>0;return this.s.seed/4294967296;}
    shuffle(a){a=clone(a);for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    get(id){return this.s.actors.find(a=>a.id===id);}
    alive(side){return this.s.actors.filter(a=>a.side===side&&a.hp>0);}
    draw(n){for(let i=0;i<n;i++){if(!this.s.draw.length&&this.s.discard.length){this.s.draw=this.shuffle(this.s.discard);this.s.discard=[];}if(!this.s.draw.length)break;this.s.hand.push(this.s.draw.shift());}}
    excludeDead(){let removed=0;for(const zone of ['draw','hand','discard']){const keep=[];for(const c of this.s[zone]){if(this.get(cards[c.key].actor).hp<=0){this.s.excluded.push(c);if(zone==='hand')removed++;}else keep.push(c);}this.s[zone]=keep;}return removed;}
    ended(){const won=!this.alive(1).length,lost=!this.alive(0).length;if(lost||won)this.s.phase=lost?'lost':'won';return lost||won;}
    begin(){if(this.ended())return;this.excludeDead();this.s.round++;this.s.phase='choice';this.s.energy=3;this.draw(Math.max(0,5-this.s.hand.length));this.makeIntents();this.planBasics();}
    makeIntents(){const r=this.s.round,amp=Math.max(0,r-1)*2;
      this.s.intents=this.alive(1).map(e=>{let kind='attack',target=null,lane=null,power=e.power+amp;
        if(e.type==='healer'){kind='heal';power=e.power;target=this.alive(1).find(x=>x.id!==e.id)?.id||e.id;}
        else if(e.type==='rear'||e.type==='front'){kind='area';lane=e.type;}
        else if(e.type==='boss'){if(e.hp<=e.max/2){target=this.get('doyun').hp>0?'doyun':this.alive(0)[0].id;power+=5;}else{kind='area';lane=r%2?'rear':'front';}}
        else target=this.get(e.type==='striker'?'doyun':'harin').hp>0?(e.type==='striker'?'doyun':'harin'):this.alive(0)[0].id;
        return {actor:e.id,kind,target,lane,power};});
    }
    planBasics(){const enemies=this.alive(1),target=enemies.find(e=>e.lane==='front')||enemies[0];this.s.basics=this.alive(0).map(a=>({actor:a.id,target:target?.id,power:a.basic}));}
    targets(c){const d=definition(c),a=this.get(d.actor);if(!a||a.hp<=0)return[];if(d.target==='self')return[a.id];return this.alive(d.target==='enemy'?1:0).filter(x=>d.kind!=='move'||this.alive(0).filter(y=>y.lane!==x.lane).length<3).map(x=>x.id);}
    check(id,target){const c=this.s.hand.find(c=>c.id===id);if(this.s.phase!=='choice')return {ok:false,error:'카드 결정 단계가 아닙니다.'};if(!c)return {ok:false,error:'손패에 없는 카드입니다.'};const d=definition(c);if(this.s.energy<d.cost)return {ok:false,error:'행동력이 부족합니다.'};if(!this.targets(c).includes(target))return {ok:false,error:'사용할 수 없는 대상입니다.'};return {ok:true,c,d};}
    event(list,e){list.push(e);}
    hit(from,to,power,source,events){const a=this.get(from),t=this.get(to);if(!a||a.hp<=0||!t||t.hp<=0)return;
      const bonus=source==='card'?t.boost:0;if(bonus)t.boost=0;const incoming=Math.max(0,Math.floor(power+bonus)),blocked=Math.min(t.shield,incoming);t.shield-=blocked;const dealt=Math.min(t.hp,incoming-blocked);t.hp-=dealt;
      if(t.side===0)this.s.stats.blocked+=blocked;if(t.side===1&&source==='card')this.s.stats.cardDamage+=dealt;if(t.side===1&&source==='basic')this.s.stats.basicDamage+=dealt;
      this.event(events,{kind:'hit',from,to,amount:dealt,blocked,hp:t.hp,shield:t.shield,source});
      if(blocked&&t.hp>0&&t.counter&&source!=='counter'){const counter=t.counter;t.counter=0;this.hit(t.id,a.id,counter,'counter',events);}
    }
    heal(from,to,power,events){const a=this.get(to);if(!a||a.hp<=0)return;const amount=Math.min(power,a.max-a.hp);a.hp+=amount;if(a.side===0)this.s.stats.healing+=amount;this.event(events,{kind:'heal',from,to,amount,hp:a.hp});}
    play(id,target){const checked=this.check(id,target);if(!checked.ok)return checked;const {c,d}=checked,events=[],a=this.get(d.actor),t=this.get(target);
      this.s.energy-=d.cost;this.s.hand=this.s.hand.filter(x=>x.id!==id);this.s.stats.cards++;this.event(events,{kind:'cast',from:a.id,to:target,name:d.name,trait:d.trait,art:d.art});
      if(d.kind==='attack')this.hit(a.id,t.id,d.power,'card',events);
      else if(d.kind==='bind'){t.bound=.5;t.boost=Math.max(t.boost,d.power);this.event(events,{kind:'bind',from:a.id,to:t.id,boost:t.boost});}
      else if(d.kind==='shield'||d.kind==='parry'){t.shield+=d.power;if(d.kind==='parry')t.counter=6;this.event(events,{kind:'shield',from:a.id,to:t.id,shield:t.shield,amount:d.power});}
      else if(d.kind==='heal')this.heal(a.id,t.id,d.power,events);
      else if(d.kind==='partyHeal')this.alive(0).forEach(x=>this.heal(a.id,x.id,d.power,events));
      else if(d.kind==='move'){const oldLane=t.lane;t.lane=t.lane==='front'?'rear':'front';this.s.stats.moves++;this.event(events,{kind:'move',from:a.id,to:t.id,oldLane,lane:t.lane});}
      if(a.hp>0)this.s.discard.push(c);else this.s.excluded.push(c);
      const removed=this.excludeDead();if(!this.ended()&&removed)this.draw(removed);this.planBasics();this.record(events);return {ok:true,events};
    }
    endTurn(){if(this.s.phase!=='choice')return {ok:false,error:'이미 종료된 전투입니다.'};const events=[],round=this.s.round;this.s.phase='resolving';const basics=clone(this.s.basics);
      for(const p of basics){if(this.get(p.actor)?.hp>0&&this.get(p.target)?.hp>0){this.event(events,{kind:'basic',from:p.actor,to:p.target,name:'기본 베기'});this.hit(p.actor,p.target,p.power,'basic',events);}else this.event(events,{kind:'cancel',from:p.actor,name:'기본행동',reason:'대상 전투불능'});if(this.ended())break;}
      if(this.s.phase==='resolving')for(const p of this.s.intents){const a=this.get(p.actor);if(a.hp<=0){this.event(events,{kind:'cancel',from:p.actor,name:'적 행동',reason:'처치로 취소'});continue;}
        const power=p.kind==='heal'?p.power:Math.floor(p.power*(a.bound?1-a.bound:1));
        if(p.kind==='heal'){if(this.get(p.target)?.hp>0)this.heal(a.id,p.target,power,events);else this.event(events,{kind:'cancel',from:a.id,name:'회복',reason:'대상 전투불능'});}
        else {const targets=p.kind==='area'?this.alive(0).filter(x=>x.lane===p.lane):[this.get(p.target)].filter(x=>x?.hp>0);
          if(!targets.length)this.event(events,{kind:'cancel',from:a.id,name:'적 공격',reason:p.kind==='area'?'구역에 아군 없음':'대상 전투불능'});
          for(const t of targets){if(a.hp<=0)break;this.event(events,{kind:'enemy',from:a.id,to:t.id,name:p.kind==='area'?'구역 공격':'집중 공격'});this.hit(a.id,t.id,power,'enemy',events);if(this.ended())break;}
        }if(this.ended())break;
      }
      this.excludeDead();if(this.s.phase==='resolving'){this.s.discard.push(...this.s.hand);this.s.hand=[];for(const a of this.s.actors){a.shield=0;a.bound=0;a.boost=0;a.counter=0;}this.begin();}
      this.record(events,round);return {ok:true,events};
    }
    record(events,round=this.s.round){this.s.history.push(...events.map(e=>({...e,round})));if(this.s.history.length>250)this.s.history=this.s.history.slice(-250);}
    forecast(){if(this.s.phase!=='choice')return null;const b=Battle.restore(this.s),r=b.endTurn();return {actors:b.s.actors.map(a=>({id:a.id,hp:a.hp,max:a.max})),phase:b.s.phase,events:r.events};}
    preview(id,target){const b=Battle.restore(this.s),r=b.play(id,target);if(!r.ok)return null;return {state:b.snapshot(),events:r.events,forecast:b.forecast()};}
    intentText(p){const a=this.get(p.actor),power=Math.floor(p.power*(a.bound?1-a.bound:1));if(a.hp<=0)return '처치 · 행동 취소';if(p.kind==='heal')return `${this.get(p.target)?.name||'동료'} 회복 ${power}`;return p.kind==='area'?`${p.lane==='front'?'전열':'후열'} 전체 ${power}`:`${this.get(p.target)?.name||'대상'} 공격 ${power}`;}
  }

  // Stage 1 experiment: fixed choices, one action, deterministic integer gauge clock.
  class IndividualBattle extends Battle{
    constructor(config={}){
      super(config);
      Object.assign(this.s,{version:2,clock:0,round:1,turn:0,current:null,ready:[],energy:2,draw:[],hand:[],discard:[],intents:[],basics:[]});
      this.s.actors.forEach((a,i)=>Object.assign(a,{gauge:0,speed:i===0?12:i===1?10:8,order:i,turns:0}));
      this.publishIntents();this.advance([]);
    }
    static restore(s){if(s.version!==2)throw Error('개인 턴 규칙 버전 불일치');const b=Object.create(IndividualBattle.prototype);b.s=clone(s);return b;}
    publishIntents(){
      // Publish only a freshly scheduled enemy's next action; never rewrite another intent.
      const previous=this.s.intents||[];
      super.makeIntents();
      this.s.intents=this.s.intents.map(p=>previous.find(q=>q.actor===p.actor)||p);
    }
    newIntent(a){
      const saved=this.s.intents,savedRound=this.s.round;this.s.round=a.turns+1;super.makeIntents();
      const p=this.s.intents.find(p=>p.actor===a.id);this.s.round=savedRound;this.s.intents=saved.filter(p=>p.actor!==a.id);if(p)this.s.intents.push(p);
    }
    choices(a){
      const keys=a.id==='doyun'?['bind','guard','pull','mend']:['impact','slash','parry'];
      for(const c of this.s.deck)if(cards[c.key].actor===a.id&&!keys.includes(c.key))keys.push(c.key);
      return keys.map(key=>({id:'fixed-'+key,key,upgraded:false}));
    }
    nextOrder(n=6){
      if(['won','lost'].includes(this.s.phase))return [];
      const actors=this.s.actors.filter(a=>a.hp>0).map(a=>({...a})),ready=this.s.ready.filter(id=>this.get(id)?.hp>0),out=[];let tick=this.s.clock;
      if(this.s.current)out.push({actor:this.s.current,tick,current:true});
      while(out.length<n&&actors.length){
        if(!ready.length){const dt=Math.min(...actors.map(a=>Math.ceil((100-a.gauge)/a.speed)));tick+=dt;actors.forEach(a=>a.gauge=Math.min(100,a.gauge+a.speed*dt));ready.push(...actors.filter(a=>a.gauge>=100).sort((a,b)=>a.order-b.order).map(a=>a.id));}
        const id=ready.shift(),a=actors.find(a=>a.id===id);if(!a)continue;out.push({actor:id,tick});a.gauge=0;
      }return out;
    }
    advance(events){
      while(!this.ended()){
        this.s.ready=this.s.ready.filter(id=>this.get(id)?.hp>0);
        if(!this.s.ready.length){const living=this.s.actors.filter(a=>a.hp>0),dt=Math.min(...living.map(a=>Math.ceil((100-a.gauge)/a.speed)));this.s.clock+=dt;living.forEach(a=>a.gauge=Math.min(100,a.gauge+a.speed*dt));this.s.ready=living.filter(a=>a.gauge>=100).sort((a,b)=>a.order-b.order).map(a=>a.id);}
        const a=this.get(this.s.ready.shift());a.gauge=0;this.s.current=a.id;this.s.turn++;this.s.round=this.s.turn;
        // Protection and counter expire at the protected unit's next own turn.
        a.shield=0;a.counter=0;
        if(a.side===0){this.s.phase='choice';this.s.energy=2;this.s.hand=this.choices(a);this.planBasics();return;}
        this.s.phase='resolving';this.enemyAction(a,events);a.turns++;a.bound=0;
        events.push({kind:'return',from:a.id,lane:a.lane,name:'배치 복귀'});
        if(this.ended())break;this.newIntent(a);this.s.current=null;
      }
      this.s.current=null;this.s.hand=[];
    }
    enemyAction(a,events){
      const p=clone(this.s.intents.find(p=>p.actor===a.id));if(!p)return;
      events.push({kind:'advance',from:a.id,name:'행동 진출'});
      const power=p.kind==='heal'?p.power:Math.floor(p.power*(1-a.bound));
      if(p.kind==='heal'){if(this.get(p.target)?.hp>0)this.heal(a.id,p.target,power,events);else events.push({kind:'cancel',from:a.id,name:'회복',reason:'공개 대상 전투불능'});}
      else{const targets=p.kind==='area'?this.alive(0).filter(x=>x.lane===p.lane):[this.get(p.target)].filter(x=>x?.hp>0);
        if(!targets.length)events.push({kind:'cancel',from:a.id,name:'적 공격',reason:'공개 대상 없음'});
        for(const t of targets){if(a.hp<=0)break;events.push({kind:'enemy',from:a.id,to:t.id,name:p.kind==='area'?'구역 공격':'집중 공격'});this.hit(a.id,t.id,power,'enemy',events);if(this.ended())break;}
      }
    }
    planBasics(){const a=this.get(this.s.current),target=this.alive(1).find(e=>e.lane==='front')||this.alive(1)[0];this.s.basics=a?.side===0?[{actor:a.id,target:target?.id,power:a.basic}]:[];}
    check(id,target){const r=super.check(id,target);if(r.ok&&r.d.actor!==this.s.current)return {ok:false,error:'현재 행동자의 카드만 사용할 수 있습니다.'};return r;}
    complete(a,events){a.turns++;events.push({kind:'return',from:a.id,lane:a.lane,name:'배치 복귀'});this.s.current=null;this.s.hand=[];this.advance(events);this.record(events);return {ok:true,events};}
    play(id,target){const checked=this.check(id,target);if(!checked.ok)return checked;
      const a=this.get(this.s.current),oldHistory=clone(this.s.history);
      const r=super.play(id,target);this.s.history=oldHistory;
      // A card replaces the actor's basic action; it never causes a party attack.
      this.s.discard=[];r.events.unshift({kind:'advance',from:a.id,name:'행동 진출'});
      return this.complete(a,r.events);
    }
    endTurn(){if(this.s.phase!=='choice')return {ok:false,error:'개인 카드 결정 단계가 아닙니다.'};const a=this.get(this.s.current),p=this.s.basics[0],events=[{kind:'advance',from:a.id,name:'행동 진출'}];
      if(p&&this.get(p.target)?.hp>0){events.push({kind:'basic',from:a.id,to:p.target,name:'기본행동'});this.hit(a.id,p.target,p.power,'basic',events);}return this.complete(a,events);
    }
    forecast(){if(this.s.phase!=='choice')return null;const b=IndividualBattle.restore(this.s),r=b.endTurn();return {actors:b.s.actors.map(a=>({id:a.id,hp:a.hp,max:a.max})),phase:b.s.phase,events:r.events};}
    preview(id,target){const b=IndividualBattle.restore(this.s),r=b.play(id,target);return r.ok?{state:b.snapshot(),events:r.events,forecast:null}:null;}
  }

  const api={Battle:IndividualBattle,SharedBattle:Battle,cards,traits,starter,definition,description,encounters};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Tactical=api;
})(typeof window!=='undefined'?window:globalThis);

