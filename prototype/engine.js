'use strict';
(() => {
  const D=window.GameData,offense=['attack','area','execute','pierce','mark','slow'];
  const single=['attack','execute','pierce','mark','slow'];
  const friendly=['heal','ward','cleanse'];
  const targeted=d=>single.includes(d.kind)||(d.kind==='area'&&d.radius>0);
  class Battle {
    constructor(config,snapshot=null){
      if(snapshot){this.s=JSON.parse(JSON.stringify(snapshot));if(this.s.stats.received===undefined)this.s.reviewPartial=true;this.initControl(this.s.control);this.random=new D.Random(this.s.seed);return;}
      this.random=new D.Random(config.seed);
      const profiles=config.playerProfiles||D.roles.map((r,role)=>({role,name:r.name}));const actors=profiles.map((r,slot)=>this.actor('a'+slot,0,r.role,r.name,D.maxHP(r.role,config.levels[slot]),140+(slot<2?65:0),75+slot*77,config.stances[slot],config.levels[slot]));
      actors.forEach((a,i)=>a.hp=Math.min(a.max,config.hp[i]));
      const depth=config.depth,scale=(1+depth*.035)*(config.elite?1.10:1);
      config.encounter.enemies.forEach((e,i)=>{
        const a=this.actor('e'+i,1,e.role,e.name,Math.round(e.hp*scale),765+(i%2)*85,90+i*100,e.stance||0,1);
        a.damage*=config.elite?1.08:1;a.damage*=.88+depth*.015;a.boss=!!e.boss;actors.push(a);
      });
      this.s={t:0,actors,seed:this.random.seed,timing:config.timing,paused:false,pauseReason:'',ready:false,waiting:false,due:5,span:5,enemyDue:7,enemyReady:false,enemySpan:7,selected:null,target:null,rerolls:2,ended:false,winner:null,events:[],fx:[],logs:[],history:[],guards:[{until:0,n:0},{until:0,n:0}],taunts:[{from:0,until:0,actor:null},{from:0,until:0,actor:null}],decks:[{draw:[],hand:[],discard:[],excluded:[]},{draw:[],hand:[],discard:[],excluded:[]}],stats:{damage:[0,0],basic:[0,0],card:[0,0],healed:[0,0],blocked:[0,0],protected:[0,0],delayed:[0,0],cards:[{},{}],waits:0,rerolls:0,stanceChanges:0},pressure:0,aiAt:0};
      this.s.strategy=config.encounter.strategy||'adaptive';this.s.phase=1;this.s.phaseAt=null;this.s.stats.received=[0,0,0,0];this.s.stats.byCard=[{},{}];this.s.knockouts=[];
      this.initControl(config.control);
      this.s.decks[0].draw=this.random.shuffle(config.cards.map(c=>({...c,actor:config.playerProfiles?c.actor:'a'+D.cards[c.key].role})));
      if(config.openingKey){const deck=this.s.decks[0].draw,index=deck.findIndex(c=>c.key===config.openingKey);if(index>=0)deck.push(deck.splice(index,1)[0]);}
      const enemies=actors.filter(a=>a.side===1);let n=0;
      for(const a of enemies){const keys=Object.keys(D.cards).filter(k=>D.cards[k].role===a.role&&!D.cards[k].spatial);for(let i=0;i<5;i++){let key=keys[i];if(a.boss&&i===0)key='quake';if(a.boss&&i===1)key='crush';this.s.decks[1].draw.push({id:'enemy'+n++,key,upgraded:false,actor:a.id});}}
      this.random.shuffle(this.s.decks[1].draw);this.refill(0);this.refill(1);this.log('전투 시작 · 첫 명령까지 5초');this.syncSeed();
    }
    actor(id,side,role,name,hp,x,y,stance,level){const r=D.roles[role];return {id,side,role,name,max:hp,hp,x,y,stance,level,nextStance:null,stanceUntil:0,damage:r.damage*(1+.05*(level-1)),range:r.range,period:r.period,speed:r.speed,cool:.5, busy:0,slowUntil:0,markUntil:0,armorUntil:0,armor:0,buffUntil:0,buff:0,shield:0,shieldUntil:0,flash:0};}
    initControl(mode){const s=this.s;s.control=mode==='auto'?'auto':'manual';s.intervening=s.control==='auto'&&!!s.intervening;s.autoAt=Number.isFinite(s.autoAt)?s.autoAt:0;s.stats.autoCards??=0;s.stats.interventions??=0;}
    setControl(mode){
      const s=this.s;if(!['manual','auto'].includes(mode)||s.ended)return false;
      s.control=mode;s.intervening=false;s.waiting=false;s.selected=null;s.target=null;s.autoAt=s.t;
      s.paused=mode==='manual'&&s.ready;s.pauseReason=s.paused?'command':'';
      this.log(mode==='auto'?'자동 운영 시작 · 태세 유지':'수동 운영 · 직접 카드 선택');return true;
    }
    intervene(){const s=this.s;if(s.control!=='auto'||s.ended)return false;if(!s.intervening){s.stats.interventions++;this.log('자동 운영에 직접 개입 · 시간 정지');}s.intervening=true;s.paused=true;s.waiting=false;s.pauseReason='intervention';return true;}
    resumeAuto(){return this.setControl('auto');}
    syncSeed(){this.s.seed=this.random.seed;}
    snapshot(){this.syncSeed();return JSON.parse(JSON.stringify(this.s));}
    alive(side){return this.s.actors.filter(a=>a.side===side&&a.hp>0);}
    get(id){return this.s.actors.find(a=>a.id===id);}
    log(text){this.s.logs.unshift({at:this.s.t,text});this.s.logs=this.s.logs.slice(0,36);}
    definition(c){return D.definition(c,this.s.timing);}
    caster(card,side){const d=this.definition(card);return card.actor?this.get(card.actor):this.alive(side??0).find(a=>a.role===d.role);}
    basePreparation(d,side){return side===1?(offense.includes(d.kind)?Math.max(1.35,d.prep||0):['healAll','blessing'].includes(d.kind)?1:Math.max(.2,d.prep||0)):(d.prep||0);}
    preparation(card,targetId,side){
      const d=this.definition(card),a=this.caster(card,side),team=side??a?.side??0;
      let extra=0;const target=this.get(targetId);
      if(d.approach&&a&&target)extra=Math.min(d.maxApproach||1.2,Math.max(0,Math.hypot(a.x-target.x,a.y-target.y)-(d.reach||70))/Math.max(1,a.speed*(a.slowUntil>this.s.t?.65:1)));
      return this.basePreparation(d,team)+extra;
    }
    areaTargets(e){
      const opponents=this.alive(1-e.side);if(!(e.radius>0))return opponents;
      const center=e.center||this.get(e.target);if(!center)return [];
      return opponents.filter(a=>Math.hypot(a.x-center.x,a.y-center.y)<=e.radius);
    }
    pressureMultiplier(side,at=this.s.t){return side===1&&at>=80?1+Math.min(.8,(Math.floor((at-80)/15)+1)*.12):1;}
    pendingAttack(actorId,after=this.s.t){return this.s.events.filter(e=>e.actor===actorId&&offense.includes(e.kind)&&e.at>after+1e-8&&(e.delayCount||0)<1).sort((a,b)=>a.at-b.at)[0];}
    tacticalScore(card,targetId){
      const d=this.definition(card),a=this.caster(card);if(!a||a.hp<=0)return 0;
      const side=a.side,at=this.s.t+this.preparation(card,targetId,side),friends=this.alive(side),target=this.get(targetId),time=d.time||1;
      if(offense.includes(d.kind)){
        const event={...d,side,actor:a.id,target:targetId,at},targets=d.kind==='area'?this.areaTargets(event):[this.eventTarget(event)].filter(b=>b?.hp>0);
        let value=0;
        for(const b of targets){let n=(d.power||0)*(a.buffUntil>at?1+a.buff:1)*this.pressureMultiplier(side,at)*(side===1?.78:1);
          if(d.kind==='execute'&&b.hp/b.max<=.5)n*=2;
          if(b.markUntil>at)n*=1.3;
          if(d.kind!=='pierce'){if(b.role===0&&b.stance===0)n*=.7;if(b.armorUntil>at)n*=1-Math.min(.65,b.armor);}
          value+=Math.min(b.hp,n)+(n>=b.hp?8:0);
          if(d.kind==='mark'&&b.markUntil<=at){const duration=Math.min(d.duration,Math.max(1,b.hp/Math.max(1,n)));value+=friends.reduce((sum,f)=>sum+f.damage/f.period,0)*duration*.3;}
          if(d.kind==='slow')value+=(b.slowUntil<=at?b.damage/b.period*Math.min(d.duration,4)*.35:0)+(this.pendingAttack(b.id,at)?12:0);
        }
        if(this.guardActive(1-side,at))value*=.1;
        return value/(time+this.preparation(card,targetId,side)*.35);
      }
      if(['heal','cleanse'].includes(d.kind))return target?.hp>0?(Math.min(d.power,target.max-target.hp)*1.5+(d.kind==='cleanse'&&(target.slowUntil>at||target.markUntil>at)?9:0))/time:0;
      if(['healAll','blessing'].includes(d.kind)){const heal=friends.reduce((sum,b)=>sum+Math.min(d.power,b.max-b.hp),0);return (heal*1.5+(d.kind==='blessing'?friends.filter(b=>b.buffUntil<=at||b.buff<.2).length*5:0))/time;}
      if(d.kind==='guard'){
        const incoming=this.s.events.filter(e=>e.side!==side&&offense.includes(e.kind)&&e.at>=at-1e-8&&e.at<=at+d.duration&&this.get(e.actor)?.hp>0).sort((b,c)=>b.at-c.at);
        const existing=this.s.guards[side];if(existing.n&&incoming[0]?.at<=existing.until)incoming.shift();
        const e=incoming[0];if(!e)return 0;
        const hits=e.kind==='area'?this.areaTargets(e):[this.eventTarget(e)].filter(b=>b?.hp>0);
        return hits.reduce((sum,b)=>sum+Math.min(b.hp,(e.power||0)*(e.side===1?.78:1)*(e.kind==='execute'&&b.hp/b.max<=.5?2:1)),0)/time*2.5;
      }
      if(d.kind==='ward')return target?.hp>0?Math.max(0,d.power-(target.shieldUntil>at?target.shield:0))/time*.65:0;
      if(d.kind==='taunt')return friends.some(b=>b.role===3&&b.hp/b.max<.55)&&a.hp/a.max>.35?7:0;
      if(d.kind==='armor')return friends.filter(b=>b.armorUntil<=at||b.armor<d.power).length*1.8;
      if(d.kind==='buff')return friends.filter(b=>b.buffUntil<=at||b.buff<d.power).length*1.8;
      return 0;
    }
    refill(side){
      const deck=this.s.decks[side];
      for(const area of ['hand','draw','discard']){const removed=deck[area].filter(c=>this.get(c.actor)?.hp<=0);deck.excluded.push(...removed);deck[area]=deck[area].filter(c=>this.get(c.actor)?.hp>0);}
      while(deck.hand.length<5){if(!deck.draw.length){if(!deck.discard.length)break;deck.draw=this.random.shuffle(deck.discard.splice(0));}deck.hand.push(deck.draw.pop());}
      if(side===0&&this.s.selected&&!deck.hand.some(c=>c.id===this.s.selected)){this.s.selected=null;this.s.target=null;}
      this.syncSeed();
    }
    forced(side,at=this.s.t){const effect=this.s.taunts[1-side],a=this.get(effect.actor);return at>=effect.from&&at<effect.until&&a?.hp>0?a:null;}
    basicTarget(a){
      const forced=this.forced(a.side);if(forced)return forced;
      if(a.side===1&&(this.s.strategy==='hunt'||this.s.strategy==='boss'&&this.s.phase===2)&&a.role!==3)return this.alive(0).sort((b,c)=>b.hp/b.max-c.hp/c.max||b.hp-c.hp)[0];
      if(a.role===0&&a.stance===0){const friends=this.alive(a.side).filter(b=>b.id!==a.id);if(friends.length){const threat=b=>Math.min(...friends.map(c=>Math.hypot(b.x-c.x,b.y-c.y)*(c.hp/c.max<.5?.7:1)));return this.alive(1-a.side).sort((b,c)=>threat(b)-threat(c))[0];}}
      const score=b=>a.role===1&&a.stance===1?b.hp:Math.hypot(a.x-b.x,a.y-b.y)*(b.role===0&&b.stance===0?.64:1);
      return this.alive(1-a.side).sort((b,c)=>score(b)-score(c))[0];
    }
    eventTarget(e,at=e.at){return (single.includes(e.kind)?this.forced(e.side,at):null)||this.get(e.target);}
    recommend(card){
      const d=this.definition(card),a=this.caster(card);if(!a)return null;
      const candidates=friendly.includes(d.kind)?this.alive(a.side):targeted(d)?this.alive(1-a.side):[];
      return candidates.sort((b,c)=>this.tacticalScore(card,c.id)-this.tacticalScore(card,b.id)||b.hp-c.hp)[0]?.id||null;
    }
    select(id){const s=this.s;if(!s.ready||s.ended)return false;const c=s.decks[0].hand.find(c=>c.id===id);if(!c)return false;if(s.control==='auto')this.intervene();s.paused=true;s.pauseReason=s.intervening?'intervention':'command';s.waiting=false;s.selected=id;s.target=this.recommend(c);return true;}
    target(id){const c=this.s.decks[0].hand.find(c=>c.id===this.s.selected),a=this.get(id);if(!c||!a||a.hp<=0)return false;const d=this.definition(c);if((friendly.includes(d.kind)&&a.side===0)||(targeted(d)&&a.side===1)){this.s.target=id;return true;}return false;}
    commandCheck(side,id,target){
      const s=this.s,deck=s.decks[side],i=deck.hand.findIndex(c=>c.id===id),ready=side===0?s.ready:s.enemyReady;
      if(!ready||i<0||s.ended)return {ok:false,error:'명령이 준비된 손패를 선택하세요.'};
      const card=deck.hand[i],d=this.definition(card),actor=this.get(card.actor);if(!actor||actor.hp<=0||actor.side!==side)return {ok:false,error:'시전자가 행동할 수 없습니다.'};
      if(targeted(d)||friendly.includes(d.kind)){const a=this.get(target);if(!a||a.hp<=0||a.side!==(friendly.includes(d.kind)?side:1-side))return {ok:false,error:'살아 있는 유효 대상을 선택하세요.'};}
      const prep=this.preparation(card,target,side);
      return {ok:true,card,d,actor,i,prep,target};
    }
    onCommandAccepted(){}
    decorateEvent(){}
    prepareActions(){}
    command(side,id,target){
      const check=this.commandCheck(side,id,target);if(!check.ok)return false;
      const {card,d,actor,i,prep}=check,s=this.s,deck=s.decks[side];
      this.onCommandAccepted(check);
      const e={...d,at:s.t+prep,side,actor:actor.id,target,cardId:card.id};this.decorateEvent(e,check);
      if(d.kind==='area'&&d.radius>0){const center=this.get(target);e.center={x:center.x,y:center.y};}
      if(d.approach&&this.get(target)){actor.approach={target,start:s.t,until:e.at,fromX:actor.x,fromY:actor.y,reach:d.reach||70};}
      actor.busy=s.t+prep+.15;deck.hand.splice(i,1);deck.discard.push(card);
      s.stats.cards[side][d.key]=(s.stats.cards[side][d.key]||0)+1;
      s.history.push({type:'card',side,key:d.key,cardId:card.id,at:s.t,target,recovery:d.time});s.history=s.history.slice(-150);
      if(side===0){s.due=s.t+d.time;s.span=d.time;s.ready=false;s.paused=false;s.waiting=false;s.pauseReason='';s.selected=null;s.target=null;s.intervening=false;}
      else {s.enemyDue=s.t+d.time;s.enemySpan=d.time;s.enemyReady=false;}
      this.log(`${side===1?'적 예고: ':''}${actor.name} · ${d.name}`);
      if(prep===0)this.resolve(e);else s.events.push(e);
      this.refill(side);this.checkEnd();
      if(side===1&&s.control==='manual'&&s.ready&&s.waiting&&!s.ended){s.paused=true;s.pauseReason='command';s.waiting=false;this.log('새 적 카드 예고 · 명령 선택');}
      return true;
    }
    confirm(){const s=this.s;if(!s.paused)return false;const automatic=s.control==='auto'&&s.intervening,ok=this.command(0,s.selected,s.target);if(ok&&automatic){s.intervening=false;s.autoAt=s.t;}return ok;}
    wait(){const s=this.s;if(!s.ready||s.ended)return false;if(s.control==='auto')return this.resumeAuto();s.paused=false;s.pauseReason='';s.waiting=true;s.selected=null;s.target=null;s.stats.waits++;this.log('명령을 보유하고 대기');return true;}
    reopen(){if(this.s.control==='auto')return this.intervene();if(!this.s.ready||this.s.ended)return false;this.s.paused=true;this.s.pauseReason='command';this.s.waiting=false;return true;}
    pause(){const s=this.s;if(s.ended)return;if(s.control==='auto'){if(s.paused)this.resumeAuto();else this.intervene();return;}s.paused=!s.paused;s.pauseReason=s.paused?'manual':'';if(s.ready&&s.paused)s.pauseReason='command';}
    canReplace(id){const s=this.s,deck=s.decks[0];return s.ready&&!s.ended&&s.rerolls>0&&deck.hand.some(c=>c.id===id)&&[...deck.draw,...deck.discard].some(c=>this.get(c.actor)?.hp>0);}
    canReroll(){return this.s.paused&&this.canReplace(this.s.selected);}
    replace(id){if(!this.canReplace(id))return false;const s=this.s,deck=s.decks[0],i=deck.hand.findIndex(c=>c.id===id);deck.draw=deck.draw.filter(c=>this.get(c.actor)?.hp>0);deck.discard=deck.discard.filter(c=>this.get(c.actor)?.hp>0);if(!deck.draw.length)deck.draw=this.random.shuffle(deck.discard.splice(0));const old=deck.hand[i],next=deck.draw.pop();deck.hand[i]=next;deck.discard.push(old);s.rerolls--;s.stats.rerolls++;s.selected=null;s.target=null;this.log(`손패 교체 · ${D.cards[old.key].name} → ${D.cards[next.key].name}`);this.syncSeed();return true;}
    reroll(){return this.canReroll()&&this.replace(this.s.selected);}
    autoScore(card,target){const score=this.tacticalScore(card,target),kind=this.definition(card).kind,a=this.get(target);return score*(['heal','cleanse','ward'].includes(kind)&&a?.hp/a?.max<.35?1.4:1);}
    autoReason(card,target){const d=this.definition(card);if(d.kind==='slow')return this.pendingAttack(target,this.s.t+this.preparation(card,target,0))?'예고된 공격 지연':'적 행동 둔화';if(d.kind==='execute'){const a=this.get(target);return a?.hp/a?.max<=.5?'부상 적 압박':'적 공격';}return {guard:'예고된 공격 차단',heal:'부상자 회복',healAll:'아군 전체 회복',cleanse:'회복과 상태 해제',ward:'보호막 보강',taunt:'부상자 보호',armor:'파티 피해 감소',buff:'파티 공격 강화',blessing:'회복과 강화',area:'범위 공격',mark:'집중 공격 표식',pierce:'방어 관통'}[d.kind]||'적 공격';}
    auto(){
      const s=this.s;if(s.control!=='auto'||s.intervening||s.paused||s.ended||!s.ready||s.t<s.autoAt)return false;s.autoAt=s.t+.25;
      const rank=()=>s.decks[0].hand.map(c=>{const target=this.recommend(c);return {c,target,score:this.autoScore(c,target)};}).sort((a,b)=>b.score-a.score);
      let scores=rank();if(!scores.length)return false;
      const urgent=this.alive(0).some(a=>a.hp/a.max<.35),usefulSupport=scores.some(x=>x.score>0&&['guard','heal','healAll','cleanse','ward','blessing'].includes(this.definition(x.c).kind));
      if(s.rerolls>0&&(scores[0].score<2||urgent&&!usefulSupport&&scores.at(-1).score<=0)){if(this.replace(scores.at(-1).c.id))scores=rank();}
      const best=scores[0];if(!best||best.score<=0)return false;
      const reason=this.autoReason(best.c,best.target);if(!this.command(0,best.c.id,best.target))return false;
      s.stats.autoCards++;s.autoLast={at:s.t,key:best.c.key,target:best.target,reason};this.log(`자동 · ${D.cards[best.c.key].name} · ${reason}`);return true;
    }
    reserveStance(a,desired){if(a.nextStance===desired)return false;if(desired===a.stance){a.nextStance=null;return true;}if((a.stanceUntil||0)>this.s.t)return false;a.nextStance=desired;return true;}
    stance(id){const a=this.get(id);if(!a||a.side!==0||a.hp<=0||this.s.ended)return false;const desired=a.nextStance!=null?a.stance:1-a.stance;if(!this.reserveStance(a,desired))return false;this.log(`${a.name} · ${a.nextStance==null?'태세 예약 취소':D.roles[a.role].stances[a.nextStance]+' 예약'}`);return true;}
    guardActive(side,at=this.s.t){const g=this.s.guards[side];return g.n>0&&(this.effectRules?g.until>at:g.until>=at);}
    applyEffect(a,kind,power,until){
      const fields={ward:['shield','shieldUntil'],armor:['armor','armorUntil'],buff:['buff','buffUntil']},pair=fields[kind];
      if(pair){a[pair[0]]=kind==='ward'?Math.max(a[pair[0]],power):power;a[pair[1]]=until;}
      else a[kind+'Until']=until;
    }
    mitigateDamage(a,amount,pierce=false){const at=this.effectAt??this.s.t;let n=amount;if(a.markUntil>at)n*=1.3;if(!pierce){if(a.role===0&&a.stance===0)n*=.7;if(a.armorUntil>at)n*=1-Math.min(.65,a.armor);}if(a.shieldUntil>at&&a.shield>0){const absorbed=Math.min(a.shield,n);a.shield-=absorbed;n-=absorbed;}return n;}
    damage(a,amount,side,source,pierce=false,cardKey=null,attackerId=null){
      if(!a||a.hp<=0)return 0;let n=this.mitigateDamage(a,amount,pierce);
      const protector=this.alive(a.side).filter(b=>b.id!==a.id&&b.role===0&&b.stance===0&&Math.hypot(a.x-b.x,a.y-b.y)<110).sort((b,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(a.x-c.x,a.y-c.y))[0];
      let moved=0;if(protector){moved=Math.min(protector.hp,n*.2);protector.hp-=moved;n-=moved;protector.flash=.18;this.s.stats.protected??=[0,0];this.s.stats.protected[a.side]+=moved;this.ray(protector,a,'#9eb9de');if(protector.side===0){this.s.stats.received??=[0,0,0,0];this.s.stats.received[protector.slot??protector.role]+=moved;}if(protector.hp===0){this.log(`${protector.name} · 아군을 보호하며 전투불능`);this.recordKO(protector,cardKey||'basic',true);}}
      return this.applyHealthDamage(a,n,side,source,cardKey,false,moved);
    }
    applyHealthDamage(a,n,side,source,cardKey,protectedAlly=false,moved=0){
      const actual=Math.min(a.hp,n);a.hp=Math.max(0,a.hp-n);a.flash=.25;this.s.stats.damage[side]+=actual+moved;this.s.stats[source==='basic'?'basic':'card'][side]+=actual+moved;
      if(a.side===0){this.s.stats.received??=[0,0,0,0];this.s.stats.received[a.slot??a.role]+=actual;}
      if(cardKey&&(D.cards[cardKey]||D.hostile[cardKey])){this.s.stats.byCard??=[{},{}];const row=this.s.stats.byCard[side];row[cardKey]=(row[cardKey]||0)+actual+moved;}
      if(a.hp===0){this.log(`${a.name} 전투불능`);this.recordKO(a,cardKey||'basic',protectedAlly);}
      this.updatePhase();return actual+moved;
    }
    recordKO(a,cause,protectedAlly){this.s.knockouts??=[];this.s.knockouts.push({at:this.s.t,actor:a.id,cause,protected:protectedAlly});}
    updatePhase(){const s=this.s,boss=s.actors.find(a=>a.side===1&&a.boss);if(s.strategy!=='boss'||s.phase===2||!boss||boss.hp<=0||boss.hp/boss.max>.5)return;s.phase=2;s.phaseAt=s.t;this.log('수호자 2단계 · 부상자 단일 공격 우선');}
    doctrine(){const key=this.s.strategy||'adaptive',d=D.doctrines[key];return {name:d.name+(key==='boss'?' · '+(this.s.phase||1)+'단계':''),desc:key==='boss'&&this.s.phase===2?'부상자 단일 공격 우선 · 이미 예고된 공격은 유지':d.desc};}
    review(){return {partial:!!this.s.reviewPartial,received:[...(this.s.stats.received||[0,0,0,0])],enemyCards:Object.entries(this.s.stats.byCard?.[1]||{}).map(([key,damage])=>({key,damage})).sort((a,b)=>b.damage-a.damage),knockouts:JSON.parse(JSON.stringify((this.s.knockouts||[]).filter(e=>this.get(e.actor)?.side===0))),phaseAt:this.s.phaseAt??null};}
    enemyTarget(card){
      const d=this.definition(card),strategy=this.s.strategy,actor=this.caster(card);
      if(!single.includes(d.kind))return this.recommend(card);
      const forced=this.forced(actor.side,this.s.t+this.preparation(card,null,actor.side));if(forced)return forced.id;
      if(strategy==='hunt'||strategy==='boss'&&this.s.phase===2)return this.alive(0).sort((a,b)=>a.hp/a.max-b.hp/b.max||a.hp-b.hp)[0]?.id;
      if(strategy==='duel')return this.alive(0).find(a=>a.role===3)?.id||this.recommend(card);
      return this.recommend(card);
    }
    enemyScore(card,target){
      let score=this.tacticalScore(card,target);if(score<=0)return 0;const d=this.definition(card),strategy=this.s.strategy;
      if(strategy==='front'&&offense.includes(d.kind))score*=1.15;
      if(strategy==='hunt'&&single.includes(d.kind))score*=1.3;
      if(strategy==='sustain'&&['heal','healAll','cleanse','ward','armor'].includes(d.kind))score*=1.65;
      if(strategy==='swarm'&&['area','slow'].includes(d.kind))score*=1.4;
      if(strategy==='duel'&&single.includes(d.kind))score*=1.4;
      if(strategy==='boss'){if(this.s.phase===2&&single.includes(d.kind))score*=1.8;else if(this.s.phase!==2&&d.kind==='area')score*=1.4;}
      return score;
    }
    heal(a,n,side){if(!a||a.hp<=0)return 0;const actual=Math.min(a.max-a.hp,n);a.hp+=actual;a.flash=.18;this.s.stats.healed[side]+=actual;return actual;}
    ray(a,b,color){this.s.fx.push({x:a.x,y:a.y,tx:b.x,ty:b.y,life:.35,color});}
    approachPoint(a,target,reach=42){const dx=a.x-target.x,dy=a.y-target.y,dist=Math.hypot(dx,dy);return {x:Math.max(35,Math.min(925,target.x+(dist>1?dx/dist:(a.side===0?-1:1))*reach)),y:Math.max(35,Math.min(355,target.y+(dist>1?dy/dist:0)*reach))};}
    advanceApproaches(){
      for(const a of this.s.actors){const move=a.approach;if(!move)continue;const target=this.get(move.target);
        if(a.hp<=0||!target||target.hp<=0){delete a.approach;continue;}
        const fraction=Math.min(1,Math.max(0,(this.s.t-move.start)/Math.max(.01,move.until-move.start))),point=this.approachPoint({x:move.fromX,y:move.fromY,side:a.side},target,move.reach);
        a.x=move.fromX+(point.x-move.fromX)*fraction;a.y=move.fromY+(point.y-move.fromY)*fraction;
      }
    }
    delayAttack(target,e){
      const pending=this.pendingAttack(target.id,e.at);if(!pending||!(e.delayAttack>0))return false;
      pending.at+=e.delayAttack;pending.delayCount=1;target.busy=Math.max(target.busy,pending.at+.15);
      if(target.approach)target.approach.until=Math.max(target.approach.until,pending.at);
      this.s.stats.delayed??=[0,0];this.s.stats.delayed[e.side]++;
      this.s.history.push({type:'delay',side:e.side,at:e.at,cardId:pending.cardId,target:target.id,until:pending.at});this.s.history=this.s.history.slice(-150);
      this.log(`${target.name} · 공격 카드 ${e.delayAttack.toFixed(1)}초 지연`);return true;
    }
    resolve(e){
      const s=this.s,a=this.get(e.actor);if(!a||a.hp<=0){this.log(`${e.name} · 시전자 전투불능으로 취소`);return;}
      const friends=this.alive(e.side),target=this.eventTarget(e);
      if(e.kind==='guard'){s.guards[e.side]={until:this.effectRules?Math.max(this.guardActive(e.side,e.at)?s.guards[e.side].until:0,e.at+e.duration):e.at+e.duration,n:1};this.log(`${a.name} · 차단 준비`);return;}
      if(e.kind==='taunt'){s.taunts[e.side]={from:e.at,until:e.at+e.duration,actor:a.id};this.log(`${a.name} · 도발 ${e.duration.toFixed(1)}초`);return;}
      if(e.kind==='armor'){friends.forEach(b=>{this.applyEffect(b,'armor',e.power,e.at+e.duration);});return;}
      if(e.kind==='buff'){friends.forEach(b=>{this.applyEffect(b,'buff',e.power,e.at+e.duration);});return;}
      if(['heal','cleanse'].includes(e.kind)){if(target?.hp>0){this.heal(target,e.power,e.side);if(e.kind==='cleanse'){target.slowUntil=0;target.markUntil=0;}this.ray(a,target,'#9bf0b1');}return;}
      if(e.kind==='ward'){if(target?.hp>0){this.applyEffect(target,'ward',e.power,e.at+e.duration);this.ray(a,target,'#adc9ff');}return;}
      if(['healAll','blessing'].includes(e.kind)){friends.forEach(b=>{this.heal(b,e.power,e.side);this.ray(a,b,'#9bf0b1');if(e.kind==='blessing'){this.applyEffect(b,'buff',.2,e.at+e.duration);}});return;}
      const targets=e.kind==='area'?this.areaTargets(e):(target?.hp>0?[target]:[]);if(!targets.length){delete a.approach;this.log(`${e.name} · 유효한 대상 없음`);return;}
      if((e.dash||e.approach)&&target?.hp>0){const point=this.approachPoint(a,target,e.approach?e.reach||70:42);a.x=point.x;a.y=point.y;}delete a.approach;
      const guard=s.guards[1-e.side];if(this.guardActive(1-e.side,e.at)){guard.n--;s.stats.blocked[1-e.side]++;this.log(`${e.name} 차단!`);return;}
      let power=e.power*(a.buffUntil>e.at?1+a.buff:1)*this.pressureMultiplier(e.side,e.at);if(e.side===1)power*=.78;
      targets.forEach(b=>{let n=power;if(e.kind==='execute'&&b.hp/b.max<=.5)n*=2;this.damage(b,n,e.side,'card',e.kind==='pierce',e.key,a.id);if(e.kind==='mark')this.applyEffect(b,'mark',0,e.at+e.duration);if(e.kind==='slow'){this.applyEffect(b,'slow',0,e.at+e.duration);this.delayAttack(b,e);}if(e.knock)b.x=Math.max(35,Math.min(925,b.x+(e.side===0?1:-1)*e.knock));this.ray(a,b,e.side?'#f8ab83':'#9ef0db');});
      this.log(`${e.name} 발동`);
    }
    enemy(){
      const s=this.s;if(s.t<s.enemyDue||s.ended)return;s.enemyReady=true;this.refill(1);
      const scored=s.decks[1].hand.map(c=>{const target=this.enemyTarget(c);return {c,target,score:this.enemyScore(c,target)};}).sort((a,b)=>b.score-a.score);
      if(scored[0]?.score>0)this.command(1,scored[0].c.id,scored[0].target);
    }
    enemyStances(){
      const s=this.s;if(s.t<(s.aiAt||0))return;s.aiAt=s.t+.6;
      for(const a of this.alive(1)){if(a.busy>s.t)continue;const friends=this.alive(1),foes=this.alive(0),nearest=Math.min(...foes.map(b=>Math.hypot(a.x-b.x,a.y-b.y)));
        let desired=a.stance;
        if(a.role===0)desired=friends.some(b=>b.id!==a.id&&b.hp/b.max<.8)?0:1;
        if(a.role===1)desired=foes.some(b=>b.hp/b.max<.55)?1:0;
        if(a.role===2)desired=nearest<155?0:1;
        if(a.role===3)desired=friends.some(b=>b.hp<b.max-3)?0:1;
        if(s.strategy==='sustain'&&[0,3].includes(a.role))desired=0;
        this.reserveStance(a,desired);
      }
    }
    prepareBasicActor(a,dt){
      const s=this.s;if(a.hp<=0)return false;a.flash=Math.max(0,a.flash-dt);if(a.shieldUntil<=s.t)a.shield=0;if(a.busy>s.t)return false;
      a.cool-=dt*(a.slowUntil>s.t?.65:1);
      if(a.cool<=0&&a.nextStance!=null&&(a.stanceUntil||0)<=s.t){a.stance=a.nextStance;a.nextStance=null;a.stanceUntil=s.t+3;if(a.side===0)s.stats.stanceChanges=(s.stats.stanceChanges||0)+1;this.log(`${a.name} · ${D.roles[a.role].stances[a.stance]} 적용 · 3초 유지`);}
      return true;
    }
    basicIntent(a){
      if(a.role===3&&a.stance===0){const b=this.alive(a.side).sort((a,b)=>a.hp/a.max-b.hp/b.max)[0];if(b&&b.hp<b.max-1&&a.cool<=0)return {move:{mode:'none'},basic:{mode:'heal',target:b.id}};}
      const target=this.basicTarget(a)?.id||null;return {move:{mode:a.role===2&&a.stance===0?'kite':'toward',target},basic:{mode:'attack',target}};
    }
    executeBasicIntent(a,intent,dt){
      const s=this.s;if(a.hp<=0||a.busy>s.t)return false;
      const basic=intent.basic,target=this.get(basic.target);
      if(basic.mode==='heal'){if(target?.hp>0&&target.side===a.side&&target.hp<target.max-1&&a.cool<=0){this.heal(target,a.side===0?4:3,a.side);a.cool=a.period;this.ray(a,target,'#a5d9ac');return true;}return false;}
      const before=target?Math.hypot(target.x-a.x,target.y-a.y):Infinity,move=intent.move,point=this.get(move.target);
      const speed=a.speed*(a.slowUntil>s.t?.65:1)*(a.role===0&&a.stance===0?1.2:1);
      if(point?.hp>0&&move.mode!=='none'){
        const x=move.mode==='follow'?Math.max(35,point.x-(move.offset||48)):point.x,y=point.y,dx=x-a.x,dy=y-a.y,dist=Math.hypot(dx,dy);
        if(move.mode==='follow'||dist>a.range){const amount=Math.min(speed*dt,move.mode==='follow'?dist:dist-a.range);a.x+=dx/Math.max(1,dist)*amount;a.y+=dy/Math.max(1,dist)*amount;}
        else if(move.mode==='kite'&&dist<145){a.x-=dx/Math.max(1,dist)*speed*dt;a.y-=dy/Math.max(1,dist)*speed*dt;}
      }
      a.x=Math.max(35,Math.min(925,a.x));a.y=Math.max(35,Math.min(355,a.y));
      // Keep the existing attack cadence and recheck the actual execution target.
      if(!target||target.hp<=0||target.side===a.side||before>a.range+5||Math.hypot(target.x-a.x,target.y-a.y)>a.range+5||a.cool>0)return false;
      let mult=a.role===1&&a.stance===1?1.2:a.role===2&&a.stance===1?1.3:a.role===0&&a.stance===1?1.25:1;if(a.buffUntil>s.t)mult*=1+a.buff;mult*=this.pressureMultiplier(a.side);
      this.damage(target,a.damage*mult,a.side,'basic',false,null,a.id);a.cool=a.period;this.ray(a,target,a.side?'#d48870':'#69bbae');if(a.role===3&&a.stance===1)target.slowUntil=Math.max(target.slowUntil,s.t+1.3);if(a.role===0&&a.stance===1)target.x=Math.max(35,Math.min(925,target.x+(a.side===0?15:-15)));return true;
    }
    basics(dt){for(const a of this.s.actors)if(this.prepareBasicActor(a,dt))this.executeBasicIntent(a,this.basicIntent(a),dt);}
    checkEnd(){const s=this.s;if(!this.alive(0).length||!this.alive(1).length){s.ended=true;s.paused=true;s.winner=this.alive(0).length?0:1;s.selected=null;this.log(s.winner===0?'전투 승리':'전투 패배');return true;}return false;}
    separate(dt){
      const actors=this.s.actors.filter(a=>a.hp>0);
      for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
        const a=actors[i],b=actors[j],dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy),gap=(a.boss?29:a.role===0?23:19)+(b.boss?29:b.role===0?23:19)+4;
        if(dist>=gap)continue;const nx=dist>.01?dx/dist:1,ny=dist>.01?dy/dist:0,push=(gap-dist)*Math.min(.5,dt*4);
        a.x=Math.max(35,Math.min(925,a.x-nx*push));a.y=Math.max(35,Math.min(355,a.y-ny*push));b.x=Math.max(35,Math.min(925,b.x+nx*push));b.y=Math.max(35,Math.min(355,b.y+ny*push));
      }
    }
    step(dt){
      const s=this.s;if(s.paused||s.ended)return;
      dt=Math.min(dt,.1);s.t+=dt;
      this.prepareActions();this.advanceApproaches();s.pressure=s.t>=80?Math.floor((s.t-80)/15)+1:0;
      const priority=e=>['guard','taunt','armor','ward'].includes(e.kind)?0:1;
      // Keep unresolved events visible: frost can postpone a later hit in this same frame.
      for(;;){const e=s.events.filter(e=>e.at<=s.t).sort((a,b)=>a.at-b.at||priority(a)-priority(b))[0];if(!e)break;s.events.splice(s.events.indexOf(e),1);this.resolve(e);}
      if(this.checkEnd())return;
      this.enemyStances();this.basics(dt);this.separate(dt);s.fx.forEach(f=>f.life-=dt);s.fx=s.fx.filter(f=>f.life>0);
      this.refill(0);this.refill(1);if(this.checkEnd())return;
      // Late pressure multiplies attacks without replacing temporary card buffs.
      this.enemy();if(this.checkEnd())return;
      if(!s.ready&&s.t>=s.due){s.ready=true;s.waiting=false;if(s.control==='manual'){s.paused=true;s.pauseReason='command';this.log('명령 준비 완료 · 시간 정지');}}
      this.auto();
      this.syncSeed();
    }
  }
  window.GameCore={Battle,single,friendly,offense,targeted};
})();
