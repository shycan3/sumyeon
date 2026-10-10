(function(root){
  'use strict';
  const Base=typeof module!=='undefined'?require('./party-expedition-run.js'):root.PartyExpeditionRun;
  const Combat=typeof module!=='undefined'?require('./party-expedition-core.js'):root.PartyExpedition;
  const Expansion=typeof module!=='undefined'?require('./party-expedition-voyage-combat.js'):root.PartyExpeditionVoyageCombat;
  const Encounters=typeof module!=='undefined'?require('./party-expedition-encounters.js'):root.PartyExpeditionEncounters;
  const CONTENT_VERSION='voyage-2',CONTENT_VERSIONS=Object.freeze(['voyage-1',CONTENT_VERSION]);
  const {Battle,CARDS}=Combat,{RELICS,TOOLS,ENCHANTS,enchanted,BALANCE_VERSION,PREVIOUS_BALANCE_VERSION,LEGACY_BALANCE_VERSION,BALANCE_VERSIONS,hasFirstPatch}=Expansion,copy=v=>JSON.parse(JSON.stringify(v));
  const EVENTS={
    wreck:{name:'침몰한 보급선',text:'표류하는 금고 아래에 오래된 장비가 묶여 있습니다.'},
    observatory:{name:'뒤집힌 기록실',text:'카드 한 장을 바꿀 수 있습니다. 현재 카드와 교환 후보를 먼저 확인하세요.'},
    beacon:{name:'꺼지지 않는 등대',text:'기록 하나에 각인을 새기거나, 남은 빛으로 동료를 돌봅니다.'},
    pressure:{name:'불안정한 항로',text:'다음 두 전투의 시작 에너지 −1을 받아들이면 유물을 얻습니다.'},
    echo:{name:'메아리의 수장고',text:'기록 조각 12로 선택한 카드 사본을 복제하거나 전술 도구를 얻습니다.'},
    shelter:{name:'폐쇄된 정박실',text:'동료를 회복하거나 선택한 기록을 강화할 수 있습니다.'},
    cache:{name:'봉인된 유실물',text:'전투를 우회했습니다. 유물 하나 또는 도구와 기록 조각을 가져가세요.'}
  };
  class Voyage extends Base.Run{
    constructor(options={}){
      if(options.contentVersion&&!CONTENT_VERSIONS.includes(options.contentVersion))return new Base.Run(options);
      super({...options,contentVersion:'draft-1'});
      const balanceVersion=options.balanceVersion??BALANCE_VERSION;
      if(!BALANCE_VERSIONS.includes(balanceVersion))throw Error('원정 밸런스 버전 오류');
      const contentVersion=options.contentVersion||(options.balanceVersion&&options.balanceVersion!==BALANCE_VERSION?'voyage-1':CONTENT_VERSION);
      Object.assign(this.s,{contentVersion,balanceVersion,relics:[],tools:['barrier'],toolPolicy:'manual',shopRemovals:0,eventSeen:[],riskBattles:0,patronSeen:false,pendingSelection:null});
      this.expandMap();
      this.s.phase='blessing';this.s.blessings=this.relicOffers(3);this.s.choices=[];
      this.assert();
    }
    pick(pool,count){const result=[];pool=[...pool];while(result.length<count&&pool.length){const i=Math.floor(this.random()*pool.length);result.push(pool.splice(i,1)[0]);}return result;}
    relicOffers(count=2){return this.pick(Object.keys(RELICS).filter(id=>!this.s.relics.includes(id)),count);}
    acquireRelic(id){if(!RELICS[id]||this.s.relics.includes(id))throw Error('획득할 수 없는 유물');this.s.relics.push(id);}
    acquireTool(id){if(!TOOLS[id]||this.s.tools.length>=2)throw Error('전술 도구는 두 개까지 휴대합니다.');this.s.tools.push(id);}
    expandMap(){
      const map=this.s.map;
      const makeEnemy=(pattern,i,hp,floor,damage,areaDamage)=>({id:`f${floor}-e${i}`,name:{bellkeeper:'종을 지키는 자',twins:'분열된 감시자',tideheart:'해류의 심장'}[pattern],pattern,hp,damage,areaDamage,toughnessMax:pattern==='tideheart'?8:6,color:'#91bfcb'});
      const calm=this.s.difficulty==='calm',scaled=e=>({...e,hp:Math.round(e.hp*(calm?.8:1)),damage:Math.round(e.damage*(calm?.8:1)),areaDamage:Math.round(e.areaDamage*(calm?.8:1))});
      for(const floor of [3,6])for(const lane of [0,1]){
        const n=map.nodes.find(n=>n.id===`f${floor}-path${lane}`),r=n.route;
        r.enemies=lane===0?[makeEnemy('bellkeeper',0,floor===3?46:57,floor,10,3)]:[makeEnemy('twins',0,floor===3?25:31,floor,7,3),makeEnemy('twins',1,floor===3?25:31,floor,7,3)];
        r.enemies=r.enemies.map(scaled);n.type=r.rewardTier='elite';n.label=r.name=r.enemies.map(e=>e.name).join(' + ');
        r.threat=lane===0?'보호 7 뒤 집중 공격. 보호 제거·관통 또는 다음 공격 준비.':hasFirstPatch(this.s.balanceVersion)?'서로 다른 대상을 공격한 뒤, 2턴에 전체 공격 준비 · 3턴 실행. 집중 처치·약화 또는 전원 보호.':'둘이 다른 대상을 공격하다 전체 공격을 준비. 집중 처치 또는 분산 보호.';
        r.description=r.enemies.map(e=>e.name+' HP '+e.hp).join(' · ');n.entry=true;
      }
      const boss=map.nodes.find(n=>n.type==='boss');
      if(this.s.initialSeed%2){boss.route.enemies=[scaled(makeEnemy('tideheart',0,76,7,11,4)),scaled(makeEnemy('twins',1,18,7,6,2))];boss.label=boss.route.name='해류의 심장';boss.route.threat='보호를 두르는 준비와 노출 6 취약 단계를 반복. 자원을 이월하거나 노출 뒤 여러 행동을 준비.';}
      if(this.s.contentVersion===CONTENT_VERSION)Encounters.populate(map,{seed:this.s.initialSeed,difficulty:this.s.difficulty});
      this.s.bossName=boss.label;
      for(const [floor,lane,event]of [[2,2,'observatory'],[4,0,'cache']]){
        const n=map.nodes.find(n=>n.id===`f${floor}-path${lane}`),stop=n.id+'-stop';
        n.type='event';n.entry=true;n.label=EVENTS[event].name;n.route={id:n.id,name:n.label,enemies:[],interlude:'event',event,rewardTier:'event',threat:EVENTS[event].text,description:EVENTS[event].text};
        map.nodes=map.nodes.filter(x=>x.id!==stop);map.edges=map.edges.filter(e=>e.to!==stop).map(e=>e.from===stop?{...e,from:n.id}:e);
      }
      // Apply the new rules once, after every ordinary/elite/boss override and
      // difficulty adjustment. Restored runs keep their already-authored map.
      map.nodes.forEach(n=>{if(n.route){
        n.entry=true;delete n.route.recordTheme;
        if(this.s.balanceVersion===BALANCE_VERSION&&n.route.enemies.length){
          n.route.enemies.forEach(enemy=>{
            enemy.hp=Math.round(enemy.hp*1.15);
            enemy.damage=Math.ceil(enemy.damage*1.1);
            enemy.areaDamage=Math.ceil(enemy.areaDamage*1.1);
          });
          const after=n.route.description.includes(' / 전투 후 ')?' / 전투 후 '+n.route.description.split(' / 전투 후 ')[1]:'';
          n.route.description=n.route.enemies.map(enemy=>enemy.name+' HP '+enemy.hp).join(' · ')+after;
        }
      }});
    }
    availableNodes(){
      if(!CONTENT_VERSIONS.includes(this.s.contentVersion))return super.availableNodes();
      if(this.s.phase!=='map')return [];
      return this.s.map.edges.filter(e=>e.from===this.s.map.current).map(e=>this.s.map.nodes.find(n=>n.id===e.to)).filter(n=>n?.entry&&n.floor===this.s.floor);
    }
    chooseBlessing(id){return this.transact(()=>{this.requirePhase('blessing');if(!this.s.blessings.includes(id))throw Error('제시된 유물을 선택하세요');this.acquireRelic(id);this.s.blessings=[];this.s.phase='map';this.createChoices();return this.snapshot();});}
    choosePath(index){
      return this.transact(()=>{
        this.requirePhase('map');if(typeof index==='string')index=this.s.choices.findIndex(r=>r.id===index);
        const route=this.s.choices[index];if(!route||!this.availableNodes().some(n=>n.id===route.id))throw Error('연결된 경로를 고르세요');
        this.visitNode(route.id);this.s.route=copy(route);this.s.choices=[];
        if(!route.enemies.length){this.createInterlude();return this.snapshot();}
        const rule=this.s.riskBattles>0?'lowtide':'normal';if(this.s.riskBattles>0)this.s.riskBattles--;
        this.battle=new Battle({party:this.s.party,deck:copy(this.s.deck),allies:copy(this.s.allies),enemies:copy(route.enemies),seed:Math.floor(this.random()*4294967296)>>>0,breakMode:this.s.breakMode==='on',cardSet:'draft-1',voyage:{relics:[...this.s.relics],tools:[...this.s.tools],rule,balanceVersion:this.s.balanceVersion??LEGACY_BALANCE_VERSION,encounterTier:route.rewardTier||'battle',...(this.s.contentVersion===CONTENT_VERSION?{contentVersion:CONTENT_VERSION}:{})}});
        this.s.battleReview={cards:{},actors:{},damageDealt:0,damageTaken:0,damageAbsorbed:0,healing:0,enemySupport:0,downs:[],rounds:0,enemies:route.enemies.map(e=>({name:e.name,pattern:e.pattern}))};
        this.s.phase='battle';this.s.offers=[];return this.snapshot();
      });
    }
    syncBattle(){
      if(this.s.phase!=='battle')return;
      this.s.allies=this.battle.s.allies.map(a=>({id:a.id,hp:a.hp,max:a.max}));this.s.tools=[...this.battle.s.voyage.tools];
      const review=this.s.battleReview||(this.s.battleReview={cards:{},actors:{},damageDealt:0,damageTaken:0,damageAbsorbed:0,healing:0,enemySupport:0,downs:[],rounds:0,enemies:this.battle.s.enemies.map(e=>({name:e.name,pattern:e.pattern}))});
      review.rounds=Math.max(review.rounds||0,this.battle.s.round||0);
      for(const event of this.battle.s.events||[]){
        if(event.type==='card'){
          const card=this.battle.definition(event.card,event.choice)?.name||'카드';review.cards[card]=(review.cards[card]||0)+1;
          const actor=this.battle.actor(event.actor)?.name||event.actor;review.actors[actor]=(review.actors[actor]||0)+1;
        }else if(event.type==='damage'){
          const target=this.battle.actor(event.target);
          if(this.battle.s.enemies.some(e=>e.id===event.target))review.damageDealt=(review.damageDealt||0)+(event.amount||0);
          if(this.battle.s.allies.some(a=>a.id===event.target)&&this.battle.s.enemies.some(e=>e.id===event.source)){
            review.damageTaken=(review.damageTaken||0)+(event.amount||0);
            review.damageAbsorbed=(review.damageAbsorbed||0)+(event.absorbed||0);
            review.damageByAlly||={};const key=target?.name||event.target;review.damageByAlly[key]=(review.damageByAlly[key]||0)+(event.amount||0);
          }
        }else if(event.type==='heal'&&this.battle.s.allies.some(a=>a.id===event.target))review.healing=(review.healing||0)+(event.amount||0);
        else if(['enemy-heal','enemy-ward'].includes(event.type))review.enemySupport=(review.enemySupport||0)+(event.amount||0);
        else if(event.type==='downed'){
          const name=this.battle.actor(event.target)?.name||event.target;if(!review.downs.includes(name))review.downs.push(name);
        }
      }
      if(this.battle.s.status==='playing')return;
      const won=this.battle.s.status==='won';
      if(won&&this.s.relics.includes('hearth'))this.s.allies.forEach(a=>{if(a.hp>0)a.hp=Math.min(a.max,a.hp+2);});
      const earned=won?8+this.s.floor*2+(this.s.route.rewardTier==='elite'?4:0)+(this.s.relics.includes('purse')?3:0):0;
      this.s.gold+=earned;if(won)this.s.battlesWon++;
      this.s.history.push({floor:this.s.floor,nodeId:this.s.route.id,route:this.s.route.name,result:won?'won':'lost',rounds:this.battle.s.round,survivors:this.s.allies.filter(a=>a.hp>0).length,hp:copy(this.s.allies),goldEarned:earned,reward:null,review:copy(review)});
      this.s.battleReview=null;
      if(!won){this.s.phase='lost';return;}
      if(this.s.floor===7){this.s.phase='won';this.s.offers=[];this.s.interlude=null;return;}
      if(this.s.route.rewardTier==='elite'){
        this.s.phase='relicreward';this.s.relicChoices=this.relicOffers(2);if(!this.s.relicChoices.length)this.afterRelicReward();
      }else this.afterRelicReward();
    }
    afterRelicReward(){
      if(this.s.floor<6||this.s.route.rewardTier==='elite'){this.s.offers=this.rewardOffers();this.s.phase='reward';}else this.createInterlude();
    }
    chooseRelic(id){return this.transact(()=>{this.requirePhase('relicreward');if(id!==null&&!this.s.relicChoices.includes(id))throw Error('제시된 유물 중 선택하세요');if(id)this.acquireRelic(id);this.s.relicChoices=[];this.afterRelicReward();return this.snapshot();});}
    rollRewards(context,theme){
      // Rarity is still independent of family; starter-only copies never pollute
      // ordinary rewards. Preserve the saved RNG stream and pity policy.
      const excluded=['basic','strike','guard'],odds=Base.RARITY_ODDS[context],offers=[];
      // Break-only cards keep their authored effect. Do not offer a disabled
      // mechanic as a growth choice; old runs keep the original candidate pool.
      if(hasFirstPatch(this.s.balanceVersion)&&this.s.breakMode==='off')excluded.push('breaksurvey');
      if(!odds)throw Error('보상 종류 오류');
      for(let slot=0;slot<3;slot++){
        const combat=['battle','elite'].includes(context),rare=odds.rare+(combat?this.s.rewardOffset:0),roll=this.rewardRandom()*100;
        const rarity=roll<rare?'rare':roll<rare+odds.uncommon?'uncommon':'common';if(combat)this.s.rewardOffset=rarity==='rare'?-2:Math.min(30,this.s.rewardOffset+2);
        let pool=Object.keys(CARDS).filter(k=>!excluded.includes(k)&&CARDS[k].rarity===rarity&&!offers.includes(k));
        if(theme&&slot===2){const themed=pool.filter(k=>CARDS[k].linkTags.includes(theme));if(themed.length)pool=themed;else pool=Object.keys(CARDS).filter(k=>!excluded.includes(k)&&CARDS[k].rarity==='uncommon'&&CARDS[k].linkTags.includes(theme)&&!offers.includes(k));}
        offers.push(pool[Math.floor(this.rewardRandom()*pool.length)]);
      }return offers;
    }
    rewardOffers(){return this.rollRewards(this.s.route?.rewardTier==='elite'?'elite':'battle');}
    rewardDescription(route=this.s.route){return route?.rewardTier==='elite'?'강적 · 유물 2개 중 선택 + 카드 보상':route?.rewardTier==='boss'?'최종 전투':route?.event?'전투를 우회하는 선택 사건':'공용 카드 3장 중 선택';}
    chooseReward(kind){
      return this.transact(()=>{this.requirePhase('reward');if(kind!==null&&!this.s.offers.includes(kind))throw Error('제시된 카드 중 선택하세요');if(kind)this.addCard(kind);else if(this.s.relics.includes('ledger'))this.s.gold+=6;this.s.history.at(-1).reward=kind;this.s.offers=[];this.createInterlude();return this.snapshot();});
    }
    createInterlude(){
      const direct=!!this.s.route.event,type=this.s.route.interlude||'camp';
      if(!direct)this.visitNode(this.s.route.id+'-stop');
      this.s.phase='interlude';this.s.offers=[];
      const i=this.s.interlude={type,offers:[],prices:{card:20,heal:12,remove:12+this.s.shopRemovals*6},healed:false,removed:false,description:type==='camp'?'회복·강화·제거 중 하나':type==='shop'?'카드·유물·도구를 준비하세요.':'한 가지 선택 후 출발합니다.'};
      if(type==='shop'){
        i.offers=this.rollRewards('shop');i.cardPrices={};const sale=i.offers[Math.floor(this.random()*3)];
        i.offers.forEach(k=>{i.cardPrices[k]=Math.round(({common:14,uncommon:22,rare:32}[CARDS[k].rarity])*(k===sale?.65:1));});i.sale=sale;
        i.relics=this.relicOffers(1);i.tools=this.pick(Object.keys(TOOLS),2);i.enchants=this.pick(Object.keys(ENCHANTS),2);i.prices.relic=32;i.prices.enchant=18;
      }
      if(type==='event'){
        const pool=Object.keys(EVENTS).filter(k=>k!=='cache'&&!this.s.eventSeen.includes(k));i.event=direct?this.s.route.event:this.pick(pool.length?pool:Object.keys(EVENTS).filter(k=>k!=='cache'),1)[0];
        this.s.eventSeen.push(i.event);i.name=EVENTS[i.event].name;i.description=EVENTS[i.event].text;
        i.relics=this.relicOffers(2);i.tool=this.pick(Object.keys(TOOLS),1)[0];i.enchants=this.pick(Object.keys(ENCHANTS),3);i.transform=this.rollRewards('event');
      }
    }
    nonlethalDamage(n){this.s.allies.forEach(a=>{if(a.hp>0)a.hp=Math.max(1,a.hp-n);});}
    nextFloor(){
      this.s.floor++;
      if(this.s.floor===4&&!this.s.patronSeen){this.s.patronSeen=true;this.s.phase='patron';this.s.pacts=this.relicOffers(3).map((id,i)=>({id,cost:['hp','gold','risk'][i]}));this.s.interlude=null;this.s.route=null;return;}
      this.s.phase='map';this.createChoices();
    }
    choosePact(index){return this.transact(()=>{
      this.requirePhase('patron');if(index!==null){const p=this.s.pacts[index];if(!p)throw Error('제시된 계약 중 선택하세요');if(p.cost==='gold')this.spend(10);if(p.cost==='hp')this.nonlethalDamage(3);if(p.cost==='risk')this.s.riskBattles+=2;this.acquireRelic(p.id);}
      this.s.pacts=[];this.s.phase='map';this.createChoices();return this.snapshot();
    });}
    enchantCard(cardId,enchant){const card=this.requireCard(cardId);if(card.enchant||!ENCHANTS[enchant]?.test(super.definition(card)))throw Error('이 카드에는 해당 각인을 새길 수 없습니다.');card.enchant=enchant;}
    chooseInterlude(action,arg){
      return this.transact(()=>{
        this.requirePhase('interlude');const i=this.s.interlude,floor=this.s.floor;
        if(action==='continue'){this.s.actions.push({floor:this.s.floor,type:i.type,action});this.nextFloor();return this.snapshot();}
        if(i.type==='shop'){
          if(action==='buy'){if(!i.offers.includes(arg))throw Error('판매 중인 카드가 아닙니다');this.spend(i.cardPrices[arg]);this.addCard(arg);i.offers.splice(i.offers.indexOf(arg),1);}
          else if(action==='heal'){if(i.healed)throw Error('이미 회복했습니다');this.spend(12);this.heal(10,10);i.healed=true;}
          else if(action==='remove'){if(i.removed)throw Error('이 상점의 제거는 1회입니다');const card=this.requireCard(arg,true);this.spend(i.prices.remove);this.s.deck.splice(this.s.deck.indexOf(card),1);this.s.shopRemovals++;i.removed=true;}
          else if(action==='relic'){if(!i.relics.includes(arg))throw Error('판매 중인 유물이 아닙니다');this.spend(i.prices.relic);this.acquireRelic(arg);i.relics=[];}
          else if(action==='tool'){if(!i.tools.includes(arg)||this.s.tools.length>=2)throw Error('도구 보관함을 확인하세요');this.spend(TOOLS[arg].price);this.acquireTool(arg);i.tools.splice(i.tools.indexOf(arg),1);}
          else if(action==='enchant'){if(!i.enchants.includes(arg.enchant))throw Error('판매 중인 각인이 아닙니다');this.enchantCard(arg.card,arg.enchant);this.spend(i.prices.enchant);i.enchants.splice(i.enchants.indexOf(arg.enchant),1);}
          else throw Error('상점 선택 오류');
        }else if(i.type==='camp'){
          if(action==='heal'){this.heal(6,10);if(this.s.relics.includes('seal')&&this.s.deck.some(c=>!c.upgraded)){i.type='seal';i.description='정박지 인장 · 강화할 카드 한 장을 선택하세요.';return this.snapshot();}}
          else if(action==='upgrade'){const c=this.requireCard(arg);if(c.upgraded)throw Error('이미 강화한 카드입니다');c.upgraded=true;}
          else if(action==='remove'){const c=this.requireCard(arg,true);this.s.deck.splice(this.s.deck.indexOf(c),1);}else throw Error('정박지 선택 오류');
          this.nextFloor();
        }else if(i.type==='seal'){
          if(action!=='upgrade')throw Error('강화할 카드를 고르세요');const c=this.requireCard(arg);if(c.upgraded)throw Error('이미 강화한 카드입니다');c.upgraded=true;this.nextFloor();
        }else{
          const event=i.event;
          if(action==='event-gold'&&['wreck','pressure'].includes(event))this.s.gold+=event==='wreck'?12:8;
          else if(action==='event-relic'&&['wreck','pressure','cache'].includes(event)){
            if(!i.relics.includes(arg))throw Error('제시된 유물을 선택하세요');if(event==='wreck')this.nonlethalDamage(2);if(event==='pressure')this.s.riskBattles+=2;this.acquireRelic(arg);
          }else if(action==='event-tool'&&['echo','cache'].includes(event)){this.acquireTool(i.tool);if(event==='cache')this.s.gold+=8;}
          else if(action==='event-clone'&&event==='echo'){const c=this.requireCard(arg);this.spend(12);this.s.deck.push({...copy(c),id:'r'+this.s.nextCard++});}
          else if(action==='event-transform'&&event==='observatory'){
            const c=this.requireCard(arg.card);if(!i.transform.includes(arg.kind))throw Error('공개된 교환 후보 중 선택하세요');const index=this.s.deck.indexOf(c);this.s.deck[index]={id:c.id,kind:arg.kind,upgraded:c.upgraded,...(c.enchant?{enchant:c.enchant}:{})};
            if(c.enchant&&!ENCHANTS[c.enchant].test(super.definition(this.s.deck[index])))throw Error('현재 각인과 맞는 교환 후보를 선택하세요');
          }else if(action==='event-enchant'&&event==='beacon'){if(!i.enchants.includes(arg.enchant))throw Error('제시된 각인 중 선택하세요');this.enchantCard(arg.card,arg.enchant);}
          else if(action==='heal'&&['beacon','shelter'].includes(event))this.heal(event==='shelter'?6:4,8);
          else if(action==='upgrade'&&event==='shelter'){const c=this.requireCard(arg);if(c.upgraded)throw Error('이미 강화한 카드입니다');c.upgraded=true;}
          else throw Error('이 사건에서 할 수 없는 선택입니다');
          this.nextFloor();
        }
        this.s.actions.push({floor,type:i.type,action,argument:copy(arg??null)});return this.snapshot();
      });
    }
    definition(value){const c=typeof value==='object'?value:this.s.deck.find(c=>c.id===value);return enchanted(super.definition(value),c?.enchant);}
    useTool(slot,target){return this.transact(()=>{this.requirePhase('battle');const events=this.battle.useTool(slot,target);this.syncBattle();return events;});}
    discardTool(slot){return this.transact(()=>{if(!['map','interlude','blessing','patron'].includes(this.s.phase)||!this.s.tools[slot])throw Error('현재 버릴 수 없는 도구');this.s.tools.splice(slot,1);return this.snapshot();});}
    setToolPolicy(policy){if(!['manual','emergency'].includes(policy))throw Error('자동 도구 규칙 오류');this.s.toolPolicy=policy;}
    static restore(snapshot){
      if(!CONTENT_VERSIONS.includes(snapshot?.contentVersion))return Base.Run.restore(snapshot);
      const run=Object.create(Voyage.prototype);run.s=copy(snapshot);const b=run.s.battle;delete run.s.battle;run.battle=b?Battle.restore(b):null;run.assert();return run;
    }
    assert(){
      if(!CONTENT_VERSIONS.includes(this.s.contentVersion))return super.assert();
      const s=this.s;
      if(s.balanceVersion!==undefined&&!BALANCE_VERSIONS.includes(s.balanceVersion))throw Error('원정 밸런스 버전 오류');
      if(s.version!=='expedition-run-2'||!['blessing','map','battle','reward','relicreward','patron','interlude','won','lost'].includes(s.phase)||!Number.isInteger(s.floor)||s.floor<0||s.floor>7)throw Error('원정 단계 오류');
      if(!Array.isArray(s.deck)||s.deck.length<6||new Set(s.deck.map(c=>c.id)).size!==s.deck.length||s.deck.some(c=>!/^r\d+$/.test(c.id)||!CARDS[c.kind]||c.kind==='basic'||typeof c.upgraded!=='boolean'||c.enchant&&!ENCHANTS[c.enchant]))throw Error('공용 덱 오류');
      if(!Number.isInteger(s.gold)||s.gold<0||!Number.isInteger(s.nextCard)||s.deck.some(c=>Number(c.id.slice(1))>=s.nextCard))throw Error('재화/카드 사본 오류');
      if(!Array.isArray(s.relics)||new Set(s.relics).size!==s.relics.length||s.relics.some(id=>!RELICS[id])||!Array.isArray(s.tools)||s.tools.length>2||s.tools.some(id=>!TOOLS[id]))throw Error('원정 장비 오류');
      if(!['manual','emergency'].includes(s.toolPolicy)||!Number.isInteger(s.riskBattles)||s.riskBattles<0||!Number.isInteger(s.shopRemovals)||s.shopRemovals<0)throw Error('원정 운영 규칙 오류');
      if(s.allies.length!==4||s.party.length!==4||new Set(s.party).size!==4||s.party.some(id=>!Combat.ROLES.some(r=>r.id===id))||s.allies.some((a,i)=>a.id!==s.party[i]||!Number.isInteger(a.hp)||!Number.isInteger(a.max)||a.max<1||a.hp<0||a.hp>a.max))throw Error('파티 HP 오류');
      if(!['normal','calm'].includes(s.difficulty)||!['off','on'].includes(s.breakMode)||typeof s.patronSeen!=='boolean'||!Number.isInteger(s.battlesWon)||s.battlesWon<0||s.battlesWon>8)throw Error('원정 규칙 오류');
      if(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!Number.isInteger(s.initialSeed)||s.initialSeed<0||s.initialSeed>4294967295||!Number.isInteger(s.rewardSeed)||s.rewardSeed<1||s.rewardSeed>4294967295||!Number.isInteger(s.rewardOffset)||s.rewardOffset<-2||s.rewardOffset>30)throw Error('원정 난수 오류');
      const map=s.map,nodes=new Map(map.nodes.map(n=>[n.id,n]));
      if(nodes.size!==map.nodes.length||!nodes.has('start')||!nodes.has('f7-path0')||map.trail.at(-1)!==map.current||new Set(map.trail).size!==map.trail.length)throw Error('지도 상태 오류');
      if(map.trail[0]!=='start'||new Set(map.edges.map(e=>e.from+'>'+e.to)).size!==map.edges.length)throw Error('지도 시작/중복 오류');
      for(const n of map.nodes){if(!['start','battle','elite','boss','camp','shop','event'].includes(n.type)||!Number.isInteger(n.floor)||n.floor< -1||n.floor>7||!Number.isInteger(n.lane)||n.lane<0||n.lane>2)throw Error('지도 지점 오류');if(n.entry&&(!n.route||n.route.id!==n.id||n.route.rewardTier!==n.type||!Array.isArray(n.route.enemies)||n.route.enemies.length>2||!n.route.enemies.length&&!EVENTS[n.route.event]))throw Error('지도 공개 내용 오류');}
      for(const e of map.edges){const from=nodes.get(e.from),to=nodes.get(e.to);if(!from||!to)throw Error('지도 연결 오류');const valid=from.type==='start'?to.entry&&to.floor===0:from.entry&&from.route.enemies.length?to.id===from.id+'-stop'&&to.floor===from.floor:to.entry&&to.floor===from.floor+1&&(to.type==='boss'||Math.abs(from.lane-to.lane)<=1);if(!valid)throw Error('지도 이동 규칙 오류');}
      for(let i=1;i<map.trail.length;i++)if(!map.edges.some(e=>e.from===map.trail[i-1]&&e.to===map.trail[i]))throw Error('방문 기록 오류');
      if(s.phase==='map'&&JSON.stringify(this.availableNodes().map(n=>n.route))!==JSON.stringify(s.choices))throw Error('공개 경로 오류');
      if(['battle','reward','relicreward','interlude','won','lost'].includes(s.phase)&&(!s.route||JSON.stringify(nodes.get(s.route.id)?.route)!==JSON.stringify(s.route)))throw Error('현재 경로 오류');
      if(s.phase==='battle'&&(!this.battle||this.battle.s.status!=='playing'))throw Error('전투 단계 오류');
      if(s.phase==='reward'&&(s.offers.length!==3||new Set(s.offers).size!==3||s.offers.some(k=>!CARDS[k]||['basic','strike','guard'].includes(k))))throw Error('카드 보상 오류');
      if(s.phase==='won'&&(s.floor!==7||s.battlesWon<6||s.battlesWon>8))throw Error('원정 완료 오류');
      if(s.phase==='interlude'&&(!s.interlude||!['camp','shop','event','seal'].includes(s.interlude.type)))throw Error('정비 단계 오류');
      if(s.phase==='blessing'&&(!Array.isArray(s.blessings)||s.blessings.length!==3||new Set(s.blessings).size!==3||s.blessings.some(id=>!RELICS[id]||s.relics.includes(id))))throw Error('출발 유물 후보 오류');
      if(s.phase==='relicreward'&&(!Array.isArray(s.relicChoices)||!s.relicChoices.length||new Set(s.relicChoices).size!==s.relicChoices.length||s.relicChoices.some(id=>!RELICS[id]||s.relics.includes(id))))throw Error('유물 보상 후보 오류');
      if(s.phase==='patron'&&(!Array.isArray(s.pacts)||s.pacts.some(p=>!RELICS[p.id]||s.relics.includes(p.id)||!['hp','gold','risk'].includes(p.cost))))throw Error('중간 계약 후보 오류');
      if(s.phase==='interlude'&&s.interlude.type==='event'&&!EVENTS[s.interlude.event])throw Error('사건 내용 오류');
      if(this.battle){this.battle.assert();if(this.battle.s.allies.some((a,i)=>a.id!==s.party[i]))throw Error('전투 편성 불일치');if(s.phase==='battle'&&(this.battle.s.cardSet!=='draft-1'||JSON.stringify(this.battle.s.voyage.relics)!==JSON.stringify(s.relics)))throw Error('전투 유물/카드 규칙 불일치');}return true;
    }
  }
  const api={...Base,Run:Voyage,EVENTS,RELICS,TOOLS,ENCHANTS,BALANCE_VERSION,PREVIOUS_BALANCE_VERSION,LEGACY_BALANCE_VERSION,BALANCE_VERSIONS,CONTENT_VERSION,CONTENT_VERSIONS};
  if(typeof module!=='undefined')module.exports=api;else root.PartyExpeditionRun=api;
})(typeof globalThis!=='undefined'?globalThis:this);
