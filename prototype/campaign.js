'use strict';
(() => {
  const D=window.GameData;
  function fresh(){
    const owned=[];let serial=1;
    for(const [key,count] of Object.entries(D.starter))for(let i=0;i<count;i++)owned.push({id:'o'+serial++,key});
    const deck=owned.map(c=>c.id);
    for(const key of ['bulwark','cleave','mark','ward'])owned.push({id:'o'+serial++,key});
    return {version:1,meta:{owned,deck,serial,fragments:0,levels:[1,1,1,1],xp:[0,0,0,0],attempts:0,wins:0,history:[],settings:{timing:'mixed',speed:1,control:'manual'},lastReport:null},run:null};
  }
  function makeMap(seed){
    const rng=new D.Random(seed),pattern=[['battle','battle'],['battle','reward'],['heal','upgrade','elite'],['checkpoint'],['battle','elite'],['reward','battle'],['heal','upgrade','elite'],['checkpoint'],['elite','heal','upgrade'],['boss']];
    if(rng.next()<.5)pattern[1]=['battle','upgrade'];
    if(rng.next()<.5)pattern[5]=['reward','elite'];
    const map=pattern.map((types,depth)=>rng.shuffle([...types]).map((type,col)=>({id:`${seed}-${depth}-${col}`,depth,col,type,encounter:type==='boss'?5:Math.floor(rng.next()*5),seed:Math.floor(rng.next()*4294967295),next:[]})));
    for(let depth=0;depth<map.length-1;depth++){
      const from=map[depth],to=rng.shuffle([...map[depth+1]]);
      if(from.length===1||to.length===1){for(const node of from)node.next=to.map(n=>n.id);continue;}
      for(let i=0;i<Math.max(from.length,to.length);i++){const node=from[i%from.length],id=to[i%to.length].id;if(!node.next.includes(id))node.next.push(id);}
      // Occasional forks allow a choice; sparse connections make the previous choice matter.
      for(const node of from)if(rng.next()<.25){const id=rng.pick(to).id;if(!node.next.includes(id))node.next.push(id);}
    }
    // Every checkpoint interval offers a fork after combat and a recovery exit.
    for(const depth of [0,4])for(const node of map[depth])node.next=map[depth+1].map(n=>n.id);
    for(const depth of [1,5])for(const node of map[depth]){
      const next=map[depth+1],heal=next.find(n=>n.type==='heal');if(!node.next.includes(heal.id))node.next.push(heal.id);
      if(node.next.length===1)node.next.push(next.find(n=>n.type!=='heal').id);
    }
    return map;
  }
  function availableNodes(run){
    if(!run)return [];
    const layer=run.map[run.depth]||[];
    if(run.depth===0)return layer;
    const previous=run.map[run.depth-1]?.find(n=>n.id===run.visited.at(-1));
    return previous?.next?layer.filter(n=>previous.next.includes(n.id)):layer;
  }
  function ownedCount(meta,key){return meta.owned.filter(c=>c.key===key).length;}
  function pendingCount(run,key){return run?run.pool.filter(c=>c.key===key&&c.acquired&&!c.ownedId&&!c.converted).length:0;}
  class Campaign {
    constructor(data=fresh()){this.data=data;if(data.meta.settings.control===undefined)data.meta.settings.control='manual';if(data.meta.fragments===undefined)data.meta.fragments=0;this.battle=null;if(data.run?.battle)this.battle=new window.GameCore.Battle({},data.run.battle);}
    get meta(){return this.data.meta;}
    get run(){return this.data.run;}
    snapshot(){if(this.run&&this.battle){this.run.battle=this.battle.snapshot();this.run.hp=D.roles.map((_,i)=>this.battle.get('a'+i).hp);this.run.stances=D.roles.map((_,i)=>this.battle.get('a'+i).stance);}return JSON.parse(JSON.stringify(this.data));}
    setControl(mode){
      if(!['manual','auto'].includes(mode))return false;
      if(this.battle&&!this.battle.setControl(mode))return false;
      if(this.meta.settings.control!==mode)this.record('control',mode==='auto'?'전투 운영: 오토':'전투 운영: 수동');
      this.meta.settings.control=mode;return true;
    }
    setDeck(ids){const error=D.validateDeck(ids,this.meta.owned);if(error)return error;this.meta.deck=[...ids];if(this.meta.openingKey&&!ids.some(id=>this.meta.owned.find(c=>c.id===id)?.key===this.meta.openingKey))this.prepareOpening(null);return '';}
    exchange(key){
      if(this.run)return '출정 종료 후 카드를 교환할 수 있습니다.';
      if(!D.cards[key])return '알 수 없는 카드입니다.';
      if(ownedCount(this.meta,key)>=D.cards[key].limit)return '이미 편성 가능한 최대 수량을 보유하고 있습니다.';
      if(this.meta.fragments<3)return '전술 조각이 3개 필요합니다.';
      this.meta.fragments-=3;this.meta.owned.push({id:'o'+this.meta.serial++,key});return '';
    }
    prepareOpening(key){
      if(this.run)return '출정 종료 후 첫 손패를 준비할 수 있습니다.';
      if(key==null){if(this.meta.openingKey)this.meta.fragments+=3;this.meta.openingKey=null;return '';}
      if(!D.cards[key]||!this.meta.deck.some(id=>this.meta.owned.find(c=>c.id===id)?.key===key))return '시작 덱에 편성한 카드만 예약할 수 있습니다.';
      if(!this.meta.openingKey){if(this.meta.fragments<3)return '전술 조각이 3개 필요합니다.';this.meta.fragments-=3;}
      this.meta.openingKey=key;return '';
    }
    record(kind,text){const r=this.run;if(r){r.journal??=[];r.journal.push({depth:r.depth,kind,text});r.journal=r.journal.slice(-256);}}
    previewNode(id){const r=this.run;if(!r||r.stage!=='map')return false;const n=availableNodes(r).find(n=>n.id===id);if(!n||!['battle','elite','boss'].includes(n.type))return false;r.previewId=id;return true;}
    cancelPreview(){if(this.run?.stage!=='map')return false;this.run.previewId=null;return true;}
    startingStance(role){const r=this.run;if(!r||r.stage!=='map'||!Number.isInteger(role)||role<0||role>3||r.hp[role]<=0)return false;r.stances[role]=1-r.stances[role];this.record('stance',D.roles[role].name+' 시작 태세: '+D.roles[role].stances[r.stances[role]]);return true;}
    availableNodes(){return availableNodes(this.run);}
    start(seed){
      if(this.run)return '진행 중인 출정을 이어서 하거나 종료해주세요.';
      const error=D.validateDeck(this.meta.deck,this.meta.owned);if(error)return error;
      this.meta.attempts++;
      this.data.run={seed:seed>>>0,rng:seed>>>0,depth:0,map:makeMap(seed>>>0),current:null,stage:'map',pool:this.meta.deck.map(id=>({...this.meta.owned.find(c=>c.id===id),ownedId:id,upgraded:false,acquired:false})),deck:[...this.meta.deck],hp:D.roles.map((_,i)=>D.maxHP(i,this.meta.levels[i])),levels:[...this.meta.levels],stances:[0,0,0,0],visited:[],results:[],reward:null,serial:1,battle:null,nodeMessage:'',timing:this.meta.settings.timing};
      this.run.journal=[];this.run.previewId=null;this.run.openingKey=this.meta.openingKey||null;this.run.openingUsed=false;this.meta.openingKey=null;
      this.battle=null;return '';
    }
    chooseNode(id){
      const r=this.run;if(!r||r.stage!=='map'||r.current)return false;
      const node=availableNodes(r).find(n=>n.id===id);if(!node)return false;
      r.previewId=null;r.current=node;this.record('room',`${r.depth+1}번째 방: ${D.rooms[node.type].name}${['battle','elite','boss'].includes(node.type)?' · '+D.encounters[node.encounter].name:''}`);r.reward=null;r.elitePerk=null;r.nodeMessage='';
      if(['battle','elite','boss'].includes(node.type)){
        const encounter=D.encounters[node.encounter];
        this.battle=new window.GameCore.Battle({seed:node.seed,levels:r.levels,hp:r.hp,stances:r.stances,depth:r.depth,elite:node.type==='elite',encounter,timing:r.timing,control:this.meta.settings.control,openingKey:!r.openingUsed?r.openingKey:null,cards:r.deck.map(id=>r.pool.find(c=>c.id===id))});
        r.openingUsed=true;r.battle=this.battle.snapshot();r.stage='battle';
      }else if(node.type==='reward'){r.reward=this.reward(node);r.stage='reward';}
      else if(node.type==='upgrade'){r.stage='upgrade';}
      else if(node.type==='heal'){
        r.hp=r.hp.map((hp,i)=>Math.min(D.maxHP(i,r.levels[i]),Math.max(0,hp)+D.maxHP(i,r.levels[i])*.3));
        r.nodeMessage='전원 최대 HP의 30% 회복. 쓰러졌던 동료도 복귀했습니다.';r.stage='nodeDone';
      }else if(node.type==='checkpoint'){const before=this.meta.fragments,secured=this.secure(),fragments=this.meta.fragments-before;r.nodeMessage=`새 카드 ${secured}장${fragments?` · 전술 조각 ${fragments}개`:''}을 영구 확보했습니다. 이번 출정의 강화는 유지됩니다.`;r.stage='nodeDone';}
      return true;
    }
    reward(node){
      const rng=new D.Random(node.seed^0x2de318ab),keys=Object.keys(D.cards),counts=Object.fromEntries(keys.map(key=>[key,ownedCount(this.meta,key)+pendingCount(this.run,key)]));
      const ranked=keys.map(key=>({key,score:rng.next()+(counts[key]<D.cards[key].limit?4:0)+(counts[key]===0?1:0)+(['elite','boss'].includes(node.type)&&D.cards[key].limit===1?2:0)})).sort((a,b)=>b.score-a.score);
      const candidates=ranked.slice(0,3).map(c=>c.key);
      if(['elite','boss'].includes(node.type)&&!candidates.some(key=>D.cards[key].limit===1)){const special=ranked.find(c=>D.cards[c.key].limit===1);candidates[2]=special.key;}
      const overflowKeys=candidates.filter(key=>counts[key]>=D.cards[key].limit),upgradedKeys=candidates.filter(key=>node.type!=='elite'&&overflowKeys.includes(key));
      return {id:node.id,candidates,upgradedKeys,overflowKeys,picked:null,cardId:null};
    }
    observeBattle(){
      const r=this.run,b=this.battle;if(!r||r.stage!=='battle'||!b?.s.ended)return false;
      r.hp=D.roles.map((_,i)=>b.get('a'+i).hp);r.stances=D.roles.map((_,i)=>b.get('a'+i).stance);
      const result={room:r.current.id,name:D.encounters[r.current.encounter].name,type:r.current.type,time:b.s.t,winner:b.s.winner,stats:JSON.parse(JSON.stringify(b.s.stats)),hp:[...r.hp],review:b.review()};
      r.results.push(result);r.battle=null;this.battle=null;
      if(result.winner!==0){this.finish(false,'전원 전투불능');return true;}
      const xp=r.current.type==='elite'?3:r.current.type==='boss'?4:2;this.grantXP(xp);
      r.reward=this.reward(r.current);r.stage=r.current.type==='elite'?'elitePerk':'battleResult';return true;
    }
    chooseElitePerk(perk){
      const r=this.run;if(r?.stage!=='elitePerk'||!['evolve','recover'].includes(perk))return false;
      if(perk==='recover')r.hp=r.hp.map((hp,i)=>hp>0?Math.min(D.maxHP(i,r.levels[i]),hp+D.maxHP(i,r.levels[i])*.12):0);
      else r.reward.upgradedKeys=[...r.reward.candidates];
      this.record('perk',perk==='recover'?'강적 특전: 생존자 12% 회복':'강적 특전: 진화 카드');r.elitePerk=perk;r.results.at(-1).elitePerk=perk;r.stage='battleResult';return true;
    }
    grantXP(amount){
      for(let i=0;i<4;i++){this.meta.xp[i]+=amount;while(this.meta.xp[i]>=5&&this.meta.levels[i]<5){this.meta.xp[i]-=5;this.meta.levels[i]++;}if(this.meta.levels[i]===5)this.meta.xp[i]=0;}
      if(this.run)this.run.levels=[...this.meta.levels];
    }
    openReward(){if(this.run?.stage!=='battleResult')return false;this.run.stage='reward';return true;}
    pickReward(key){
      const r=this.run;if(!r||r.stage!=='reward'||!r.reward||r.reward.picked||!r.reward.candidates.includes(key))return false;
      const card={id:`r${r.seed}-${this.meta.attempts}-${r.serial++}`,key,ownedId:null,upgraded:!!r.reward.upgradedKeys?.includes(key),acquired:true};
      r.pool.push(card);this.record('reward',`${D.cards[key].name}${card.upgraded?' ✦':''} 획득`);r.reward.picked=key;r.reward.cardId=card.id;r.stage='loot';return true;
    }
    setRunDeck(ids){const r=this.run;if(!r||!['loot','map'].includes(r.stage))return '전투 사이에만 덱을 편성할 수 있습니다.';const error=D.validateDeck(ids,r.pool);if(error)return error;const removed=r.deck.filter(id=>!ids.includes(id)),added=ids.filter(id=>!r.deck.includes(id));if(removed.length||added.length)this.record('swap',`${removed.map(id=>D.cards[r.pool.find(c=>c.id===id).key].name).join('·')||'없음'} → ${added.map(id=>D.cards[r.pool.find(c=>c.id===id).key].name).join('·')||'없음'}`);r.deck=[...ids];return '';}
    swapReward(outId){
      const r=this.run;if(r?.stage!=='loot')return '보상 획득 직후에만 빠른 교체를 할 수 있습니다.';
      const inId=r.reward.cardId;if(r.deck.includes(inId)||!r.deck.includes(outId))return '교체할 카드를 다시 선택해주세요.';
      const error=this.setRunDeck(r.deck.map(id=>id===outId?inId:id));if(error)return error;r.reward.swapOutId=outId;return '';
    }
    undoRewardSwap(){
      const r=this.run,outId=r?.reward?.swapOutId,inId=r?.reward?.cardId;
      if(r?.stage!=='loot'||!outId||r.deck.includes(outId)||!r.deck.includes(inId))return '현재 편성에서는 교체를 되돌릴 수 없습니다.';
      const error=this.setRunDeck(r.deck.map(id=>id===inId?outId:id));if(!error)r.reward.swapOutId=null;return error;
    }
    evolve(id){const r=this.run;if(!r||r.stage!=='upgrade'||!r.deck.includes(id))return false;const card=r.pool.find(c=>c.id===id);if(!card||card.upgraded)return false;card.upgraded=true;this.record('upgrade',D.cards[card.key].name+' 진화');r.stage='nodeDone';r.nodeMessage=`${D.cards[card.key].name} 진화 완료. 이번 출정에서 효과가 강화됩니다.`;return true;}
    skipUpgrade(){if(this.run?.stage!=='upgrade')return false;this.run.stage='nodeDone';this.run.nodeMessage='이번 강화 기회를 지나갑니다.';return true;}
    secure(){
      const r=this.run;if(!r)return 0;let count=0;
      for(const c of r.pool){if(c.acquired&&!c.ownedId&&!c.converted){if(ownedCount(this.meta,c.key)>=D.cards[c.key].limit){c.converted=true;this.meta.fragments++;r.fragmentGained=(r.fragmentGained||0)+1;}else{c.ownedId='o'+this.meta.serial++;this.meta.owned.push({id:c.ownedId,key:c.key});count++;}}}
      return count;
    }
    completeNode(){
      const r=this.run;if(!r||!r.current||!['nodeDone','loot'].includes(r.stage))return false;
      if(D.validateDeck(r.deck,r.pool))return false;
      r.visited.push(r.current.id);r.current=null;r.reward=null;r.depth++;
      if(r.depth>=r.map.length){this.finish(true,'경계의 수호자 격파');return true;}
      r.stage='map';return true;
    }
    abandon(){if(!this.run)return false;this.finish(false,'출정 중도 귀환');return true;}
    finish(success,reason){
      const r=this.run;if(!r)return false;const bonusKeys=[];
      if(success){
        this.secure();
        const remaining=Object.keys(D.cards).filter(key=>ownedCount(this.meta,key)<D.cards[key].limit),special=remaining.filter(key=>D.cards[key].limit===1),rng=new D.Random(r.seed^0x71b4d937);
        if(remaining.length){const key=rng.pick(special.length?special:remaining);this.meta.owned.push({id:'o'+this.meta.serial++,key});bonusKeys.push(key);}
        else{this.meta.fragments+=3;r.fragmentGained=(r.fragmentGained||0)+3;}
      }
      const acquired=r.pool.filter(c=>c.acquired),secured=acquired.filter(c=>c.ownedId),converted=acquired.filter(c=>c.converted),lost=acquired.length-secured.length-converted.length;
      this.record('finish',reason);
      const report={journal:JSON.parse(JSON.stringify(r.journal||[])),success,reason,seed:r.seed,depth:r.depth,visited:r.visited.length,secured:secured.length+bonusKeys.length,converted:converted.length,fragments:r.fragmentGained||0,bonusKeys,lost,keys:[...secured.map(c=>c.key),...bonusKeys],results:r.results,time:r.results.reduce((n,b)=>n+b.time,0),levels:[...this.meta.levels]};
      if(success)this.meta.wins++;this.meta.lastReport=report;this.meta.history.unshift({success,seed:r.seed,secured:report.secured,lost,time:report.time});this.meta.history=this.meta.history.slice(0,10);this.data.run=null;this.battle=null;return true;
    }
  }
  function validateSave(data){
    const fail=msg=>{throw new Error(msg);};
    const finite=n=>typeof n==='number'&&Number.isFinite(n),uint=n=>Number.isInteger(n)&&n>=0&&n<=4294967295;
    const statsValid=s=>s&&['damage','basic','card','healed','blocked'].every(k=>Array.isArray(s[k])&&s[k].length===2&&s[k].every(n=>finite(n)&&n>=0))&&Array.isArray(s.cards)&&s.cards.length===2&&s.cards.every(c=>c&&typeof c==='object'&&!Array.isArray(c)&&Object.entries(c).every(([key,n])=>(D.cards[key]||D.hostile[key])&&Number.isInteger(n)&&n>=0))&&Number.isInteger(s.waits)&&s.waits>=0&&Number.isInteger(s.rerolls)&&s.rerolls>=0&&['autoCards','interventions'].every(k=>s[k]===undefined||Number.isInteger(s[k])&&s[k]>=0);
    const journalValid=j=>j===undefined||Array.isArray(j)&&j.length<=256&&j.every(e=>e&&Number.isInteger(e.depth)&&e.depth>=0&&e.depth<=10&&['room','stance','reward','perk','swap','upgrade','finish','control'].includes(e.kind)&&typeof e.text==='string'&&e.text.length<=1000);
    const reviewValid=v=>v===undefined||v&&(v.partial===undefined||typeof v.partial==='boolean')&&Array.isArray(v.received)&&v.received.length===4&&v.received.every(n=>finite(n)&&n>=0)&&Array.isArray(v.enemyCards)&&v.enemyCards.length<=22&&v.enemyCards.every(e=>e&&(D.cards[e.key]||D.hostile[e.key])&&finite(e.damage)&&e.damage>=0)&&Array.isArray(v.knockouts)&&v.knockouts.length<=4&&v.knockouts.every(e=>e&&/^a[0-3]$/.test(e.actor)&&finite(e.at)&&e.at>=0&&(e.cause==='basic'||D.cards[e.cause]||D.hostile[e.cause])&&typeof e.protected==='boolean')&&(v.phaseAt==null||finite(v.phaseAt)&&v.phaseAt>=0);
    const resultValid=r=>r&&typeof r.name==='string'&&finite(r.time)&&r.time>=0&&[0,1].includes(r.winner)&&statsValid(r.stats)&&Array.isArray(r.hp)&&r.hp.length===4&&r.hp.every(n=>finite(n)&&n>=0)&&reviewValid(r.review)&&(!r.review||r.review.knockouts.every(e=>e.at<=r.time)&&(r.review.phaseAt==null||r.review.phaseAt<=r.time));
    if(!data||data.version!==1||!data.meta)fail('지원하지 않는 저장 형식입니다.');
    const m=data.meta;
    if(m.fragments===undefined)m.fragments=0;
    if(!Number.isInteger(m.fragments)||m.fragments<0)fail('전술 조각 정보가 올바르지 않습니다.');
    if(!Array.isArray(m.owned)||m.owned.length>10000||m.owned.length<20)fail('카드 목록이 올바르지 않습니다.');
    if(m.owned.some(c=>!c||typeof c.id!=='string'||!D.cards[c.key]||c.upgraded))fail('영구 카드 정보가 올바르지 않습니다.');
    if(new Set(m.owned.map(c=>c.id)).size!==m.owned.length)fail('중복 카드 ID가 있습니다.');
    if(!Array.isArray(m.deck)||D.validateDeck(m.deck,m.owned))fail('시작 덱이 올바르지 않습니다.');
    if(m.openingKey!=null&&(!D.cards[m.openingKey]||!m.deck.some(id=>m.owned.find(c=>c.id===id)?.key===m.openingKey)))fail('첫 손패 예약이 올바르지 않습니다.');
    if(!Array.isArray(m.levels)||m.levels.length!==4||m.levels.some(n=>!Number.isInteger(n)||n<1||n>5))fail('레벨 정보가 올바르지 않습니다.');
    if(!Array.isArray(m.xp)||m.xp.length!==4||m.xp.some(n=>!Number.isFinite(n)||n<0))fail('경험치 정보가 올바르지 않습니다.');
    if(!Number.isInteger(m.serial)||m.serial<1||!Number.isInteger(m.attempts)||m.attempts<0||!Number.isInteger(m.wins)||m.wins<0||m.wins>m.attempts)fail('진행 정보가 올바르지 않습니다.');
    if(m.owned.some(c=>!/^o[1-9]\d*$/.test(c.id)||Number(c.id.slice(1))>=m.serial))fail('카드 지급 순서가 올바르지 않습니다.');
    if(!m.settings||!['mixed','classic'].includes(m.settings.timing)||![1,1.5,2].includes(m.settings.speed)||m.settings.control!==undefined&&!['manual','auto'].includes(m.settings.control))fail('설정이 올바르지 않습니다.');
    if(m.settings.control===undefined)m.settings.control='manual';
    if(!Array.isArray(m.history)||m.history.length>10||m.history.some(r=>typeof r.success!=='boolean'||!finite(r.time)||r.time<0||!Number.isInteger(r.secured)||r.secured<0||!Number.isInteger(r.lost)||r.lost<0))fail('출정 기록이 올바르지 않습니다.');
    if(m.lastReport&&(typeof m.lastReport.success!=='boolean'||typeof m.lastReport.reason!=='string'||!Array.isArray(m.lastReport.keys)||m.lastReport.keys.some(k=>!D.cards[k])||!Array.isArray(m.lastReport.results)||m.lastReport.results.some(r=>!resultValid(r))||!finite(m.lastReport.time)||!Number.isInteger(m.lastReport.secured)||!Number.isInteger(m.lastReport.lost)))fail('출정 결과가 올바르지 않습니다.');
    if(m.lastReport&&(['converted','fragments'].some(field=>m.lastReport[field]!==undefined&&(!Number.isInteger(m.lastReport[field])||m.lastReport[field]<0))||m.lastReport.bonusKeys!==undefined&&(!Array.isArray(m.lastReport.bonusKeys)||m.lastReport.bonusKeys.some(key=>!D.cards[key]))))fail('출정 보너스 정보가 올바르지 않습니다.');
    if(!journalValid(m.lastReport?.journal))fail('원정 기록이 올바르지 않습니다.');
    const r=data.run;
    if(r){
      if(!journalValid(r.journal))fail('원정 기록이 올바르지 않습니다.');
      if(r.previewId!=null&&(r.stage!=='map'||!availableNodes(r).some(n=>n.id===r.previewId&&['battle','elite','boss'].includes(n.type))))fail('전투 준비 대상이 올바르지 않습니다.');
      const stages=['map','battle','elitePerk','battleResult','reward','loot','upgrade','nodeDone'];
      if(!stages.includes(r.stage)||!Number.isInteger(r.depth)||r.depth<0||r.depth>=10||!Array.isArray(r.map)||r.map.length!==10)fail('출정 정보가 올바르지 않습니다.');
      if(!uint(r.seed)||!uint(r.rng)||r.map.some((layer,depth)=>!Array.isArray(layer)||layer.length<1||layer.length>3||layer.some(n=>!n||typeof n.id!=='string'||n.depth!==depth||!D.rooms[n.type]||!uint(n.seed)||!Number.isInteger(n.encounter)||!D.encounters[n.encounter])))fail('출정 지도가 올바르지 않습니다.');
      const nodeIds=r.map.flat().map(n=>n.id);if(new Set(nodeIds).size!==nodeIds.length||!r.map[3].every(n=>n.type==='checkpoint')||!r.map[7].every(n=>n.type==='checkpoint')||r.map[9].length!==1||r.map[9][0].type!=='boss')fail('필수 경로가 올바르지 않습니다.');
      for(let depth=0;depth<r.map.length;depth++){
        const nextIds=r.map[depth+1]?.map(n=>n.id)||[];
        for(const node of r.map[depth])if(node.next!==undefined&&(!Array.isArray(node.next)||new Set(node.next).size!==node.next.length||node.next.some(id=>!nextIds.includes(id))||(depth<9&&!node.next.length)))fail('지도 연결이 올바르지 않습니다.');
        if(depth>0&&r.map[depth-1].every(n=>Array.isArray(n.next))&&r.map[depth].some(n=>!r.map[depth-1].some(previous=>previous.next.includes(n.id))))fail('접근할 수 없는 방이 있습니다.');
      }
      if(!Array.isArray(r.pool)||r.pool.some(c=>!D.cards[c.key]||typeof c.id!=='string'||typeof c.upgraded!=='boolean')||new Set(r.pool.map(c=>c.id)).size!==r.pool.length)fail('출정 카드 정보가 올바르지 않습니다.');
      if(r.pool.some(c=>c.converted!==undefined&&typeof c.converted!=='boolean'||c.converted&&(!c.acquired||c.ownedId))||r.fragmentGained!==undefined&&(!Number.isInteger(r.fragmentGained)||r.fragmentGained<0))fail('전술 조각 확보 정보가 올바르지 않습니다.');
      if(r.pool.some(c=>c.ownedId&&!m.owned.some(o=>o.id===c.ownedId&&o.key===c.key)))fail('확보한 카드의 원본이 없습니다.');
      if(D.validateDeck(r.deck,r.pool)||!Array.isArray(r.hp)||r.hp.length!==4||r.hp.some(n=>!Number.isFinite(n)||n<0))fail('출정 덱과 HP가 올바르지 않습니다.');
      if(!Array.isArray(r.levels)||r.levels.length!==4||r.levels.some(n=>!Number.isInteger(n)||n<1||n>5)||!Array.isArray(r.stances)||r.stances.length!==4||r.stances.some(n=>![0,1].includes(n)))fail('파티 정보가 올바르지 않습니다.');
      if(!Array.isArray(r.results)||r.results.some(result=>!resultValid(result))||!Array.isArray(r.visited)||r.visited.length!==r.depth||r.visited.some(id=>!nodeIds.includes(id))||new Set(r.visited).size!==r.visited.length||!Number.isInteger(r.serial)||r.serial<1||!['mixed','classic'].includes(r.timing))fail('출정 진행 정보가 올바르지 않습니다.');
      for(let depth=0;depth<r.visited.length;depth++){
        const node=r.map[depth].find(n=>n.id===r.visited[depth]),previous=depth?r.map[depth-1].find(n=>n.id===r.visited[depth-1]):null;
        if(!node||previous?.next&&!previous.next.includes(node.id))fail('이동한 경로가 올바르지 않습니다.');
      }
      if(r.stage==='map'&&r.current)fail('지도 상태가 올바르지 않습니다.');
      if(r.stage!=='map'&&!availableNodes(r).some(n=>n.id===r.current?.id))fail('현재 방이 올바르지 않습니다.');
      if(r.openingKey!=null&&!D.cards[r.openingKey]||r.openingUsed!==undefined&&typeof r.openingUsed!=='boolean'||r.elitePerk!=null&&!['evolve','recover'].includes(r.elitePerk)||r.stage==='elitePerk'&&(r.current.type!=='elite'||r.results.at(-1)?.winner!==0))fail('전술 선택 정보가 올바르지 않습니다.');
      if(['elitePerk','battleResult','reward','loot'].includes(r.stage)&&(!r.reward||!Array.isArray(r.reward.candidates)||r.reward.candidates.some(k=>!D.cards[k])))fail('보상 정보가 올바르지 않습니다.');
      if(r.reward&&(['upgradedKeys','overflowKeys'].some(field=>r.reward[field]!==undefined&&(!Array.isArray(r.reward[field])||r.reward[field].some(key=>!r.reward.candidates.includes(key))))))fail('강화 보상 정보가 올바르지 않습니다.');
      if(r.reward?.swapOutId!=null&&!r.pool.some(c=>c.id===r.reward.swapOutId))fail('보상 교체 기록이 올바르지 않습니다.');
      if(r.stage==='loot'&&(!r.reward.picked||!r.pool.some(c=>c.id===r.reward.cardId&&c.key===r.reward.picked)))fail('획득한 카드가 없습니다.');
      if(r.stage==='battle'){
        const b=r.battle;
        if(!b||!Array.isArray(b.actors)||!Array.isArray(b.decks)||b.decks.length!==2||!Array.isArray(b.events)||!Number.isFinite(b.t)||b.t<0)fail('전투 저장이 올바르지 않습니다.');
        if(b.actors.some(a=>!a||typeof a.id!=='string'||!Number.isFinite(a.hp)||!Number.isFinite(a.max)||a.hp<0||a.max<=0||![0,1].includes(a.side)||!D.roles[a.role]))fail('전투 캐릭터가 올바르지 않습니다.');
        if(['a0','a1','a2','a3'].some(id=>!b.actors.some(a=>a.id===id)))fail('전투 파티가 누락됐습니다.');
        if(new Set(b.actors.map(a=>a.id)).size!==b.actors.length||b.actors.some(a=>a.hp>a.max||!finite(a.x)||!finite(a.y)||!finite(a.cool)||!finite(a.busy)||!finite(a.damage)||!finite(a.period)||a.period<=0||![0,1].includes(a.stance)))fail('전투 행동 정보가 올바르지 않습니다.');
        if(b.actors.some(a=>a.nextStance!=null&&![0,1].includes(a.nextStance)||a.stanceUntil!==undefined&&(!finite(a.stanceUntil)||a.stanceUntil<0)))fail('태세 예약이 올바르지 않습니다.');
        if(b.control!==undefined&&!['manual','auto'].includes(b.control)||b.intervening!==undefined&&typeof b.intervening!=='boolean'||b.autoAt!==undefined&&(!finite(b.autoAt)||b.autoAt<0))fail('자동 운영 상태가 올바르지 않습니다.');
        if(b.autoLast!=null&&(!finite(b.autoLast.at)||b.autoLast.at<0||b.autoLast.at>b.t||!D.cards[b.autoLast.key]||b.autoLast.target!=null&&!b.actors.some(a=>a.id===b.autoLast.target)||typeof b.autoLast.reason!=='string'||b.autoLast.reason.length>300))fail('자동 운영 판단 기록이 올바르지 않습니다.');
        if(b.strategy!==undefined&&!D.doctrines[b.strategy]||b.phase!==undefined&&![1,2].includes(b.phase)||b.phaseAt!=null&&(!finite(b.phaseAt)||b.phaseAt<0||b.phaseAt>b.t))fail('적 전술 단계가 올바르지 않습니다.');
        if(b.knockouts!==undefined&&(!Array.isArray(b.knockouts)||b.knockouts.length>b.actors.length||b.knockouts.some(e=>!b.actors.some(a=>a.id===e.actor)||!finite(e.at)||e.at<0||e.at>b.t||!(e.cause==='basic'||D.cards[e.cause]||D.hostile[e.cause])||typeof e.protected!=='boolean')))fail('전투불능 기록이 올바르지 않습니다.');
        if(b.stats?.received!==undefined&&(!Array.isArray(b.stats.received)||b.stats.received.length!==4||b.stats.received.some(n=>!finite(n)||n<0)))fail('피해 기록이 올바르지 않습니다.');
        if(b.stats?.byCard!==undefined&&(!Array.isArray(b.stats.byCard)||b.stats.byCard.length!==2||b.stats.byCard.some(row=>!row||typeof row!=='object'||Array.isArray(row)||Object.entries(row).some(([key,n])=>!D.cards[key]&&!D.hostile[key]||!finite(n)||n<0))))fail('카드 피해 기록이 올바르지 않습니다.');
        if(!statsValid(b.stats)||!uint(b.seed)||!Array.isArray(b.guards)||b.guards.length!==2||!Array.isArray(b.taunts)||b.taunts.length!==2||!Array.isArray(b.fx)||!Array.isArray(b.logs)||!Array.isArray(b.history)||b.logs.some(l=>!finite(l.at)||typeof l.text!=='string')||!finite(b.due)||!finite(b.span)||b.span<=0||!finite(b.enemyDue)||!finite(b.enemySpan)||b.enemySpan<=0||!Number.isInteger(b.rerolls)||b.rerolls<0||b.rerolls>2||typeof b.ready!=='boolean'||typeof b.paused!=='boolean'||typeof b.ended!=='boolean')fail('전투 상태가 올바르지 않습니다.');
        if(b.guards.some(g=>!finite(g.until)||!Number.isInteger(g.n)||g.n<0)||b.taunts.some(t=>!finite(t.from)||!finite(t.until)||(t.actor!==null&&!b.actors.some(a=>a.id===t.actor))))fail('전투 효과가 올바르지 않습니다.');
        if(b.events.some(e=>!e||!finite(e.at)||e.at<b.t-.1||!D.cards[e.key]&&!D.hostile[e.key]||!b.actors.some(a=>a.id===e.actor)))fail('카드 명령이 올바르지 않습니다.');
        for(let side=0;side<2;side++){
          const deck=b.decks[side];for(const area of ['draw','hand','discard','excluded'])if(!Array.isArray(deck[area])||deck[area].some(c=>(!D.cards[c.key]&&!D.hostile[c.key])||typeof c.id!=='string'||!b.actors.some(a=>a.id===c.actor&&a.side===side)))fail('전투 카드가 올바르지 않습니다.');
          const ids=['draw','hand','discard','excluded'].flatMap(k=>deck[k].map(c=>c.id));if(new Set(ids).size!==ids.length||deck.hand.length>5)fail('전투 카드가 중복됐습니다.');
          if(side===0&&(ids.length!==20||r.deck.some(id=>!ids.includes(id))))fail('출정 덱과 전투 덱이 다릅니다.');
        }
      }
    }
    return data;
  }
  window.GameCampaign={Campaign,fresh,makeMap,availableNodes,validateSave};
})();
