'use strict';
(()=>{
  const P=window.SkillPresentation;
  class SkillDirector{
    constructor(){const settings=window.PresentationSettings?.load()||{mode:'full',frequency:'highlights'};this.battle=null;this.active=null;this.mode=settings.mode;this.frequency=settings.frequency;this.lastDialogue=-Infinity;this.seen=new Set();this.slot=null;this.portraitTimes=new Map();this.dialogueTimes=new Map();this.noticeTimes=new Map();this.notice=null;this.pending=[];}
    attach(b){this.battle=b;this.active=null;this.lastDialogue=-Infinity;this.seen.clear();this.portraitTimes.clear();this.dialogueTimes.clear();this.noticeTimes.clear();this.notice=null;this.pending=[];this.viewKey='';}
    saveSettings(){return window.PresentationSettings?.save({mode:this.mode,frequency:this.frequency})||false;}
    setMode(mode){if(!['full','simple','off'].includes(mode))return false;this.mode=mode;this.viewKey='';this.saveSettings();return true;}
    setFrequency(frequency){if(!['all','highlights','once'].includes(frequency))return false;this.frequency=frequency;this.viewKey='';this.saveSettings();return true;}
    result(b){if(this.notice?.until<=b.s.t)this.notice=null;this.pending=this.pending.filter(n=>n.until>b.s.t);if(!this.notice&&this.pending.length){this.pending.sort((a,z)=>z.priority-a.priority||z.at-a.at);this.notice=this.pending.shift();}return this.notice;}
    acceptOutcome(e,b){
      const target=b.get(e.target);if(!target||!['finish','ally-down','chain','urgent-heal','relay','relaylink'].includes(e.type))return;
      const identity=`${e.type}:${e.target}`,previous=this.noticeTimes.get(identity)??-Infinity;if(e.at-previous<(e.type==='urgent-heal'?6:1.5))return;this.noticeTimes.set(identity,e.at);
      const definitions={relay:{label:'추격 릴레이 · 표식 전달',priority:3,color:'#ecc18a'},relaylink:{label:'릴레이 후속 공격',priority:3,color:'#ecc18a'},finish:{label:'처치',priority:2,color:'#e9c28f'},'ally-down':{label:'전투불능',priority:5,color:'#efb1a0'},chain:{label:'추가 추격',priority:3,color:'#bcebe1'},'urgent-heal':{label:'위기 회복',priority:4,color:'#a7e8bb'}},d=definitions[e.type];
      const n={...d,type:e.type,target:e.target,targets:[e.target],actor:e.actor,at:e.at,until:e.at+1.4,text:`${target.name}${e.type==='urgent-heal'?' +'+Math.ceil(e.amount):''}`},current=this.result(b);
      if(current?.type==='finish'&&n.type==='finish'&&e.at-current.at<=.1){if(!current.targets.includes(e.target))current.targets.push(e.target);current.label=`${current.targets.length}명 처치`;current.text=current.targets.map(id=>b.get(id)?.name).join(' · ');return;}
      if(!current||n.priority>current.priority){this.notice=n;return;}
      this.pending.push(n);this.pending.sort((a,z)=>z.priority-a.priority||z.at-a.at);this.pending=this.pending.slice(0,2);
    }
    accept(e,b){
      if(e.kind==='outcome'){this.acceptOutcome(e,b);return;}
      if(e.kind==='cast'){
        const profile=P.profile(e.key),tier=P.tiers[profile.tier],identity=`${e.actor}:${e.cardId||e.id}:${e.at}`;
        if(this.seen.has(identity))return;this.seen.add(identity);if(this.seen.size>100)this.seen.delete(this.seen.values().next().value);
        if(this.active&&this.active.until>b.s.t&&P.tiers[this.active.profile.tier].priority>tier.priority)return;
        const stamp=`${e.actor}:${e.key}`,portraitAt=this.portraitTimes.get(stamp)??-Infinity,dialogueAt=this.dialogueTimes.get(stamp)??-Infinity;
        const first=this.frequency==='once',portrait=!!(tier.portrait&&profile.portrait&&(first?portraitAt===-Infinity:e.at-portraitAt>=(this.frequency==='highlights'?12:0)));
        const dialogue=profile.line&&(first?dialogueAt===-Infinity:e.at-dialogueAt>=(this.frequency==='highlights'?8:1.5))&&e.at-this.lastDialogue>=(this.frequency==='highlights'?2:.8);
        if(portrait)this.portraitTimes.set(stamp,e.at);if(dialogue){this.lastDialogue=e.at;this.dialogueTimes.set(stamp,e.at);}
        this.active={actionId:e.actionId,actor:e.actor,target:e.target,key:e.key,cardId:e.cardId,at:e.at,until:Math.max(e.at+tier.duration,(e.until||e.at)+(window.CharacterData.skill(e.key).recovery||0)+.45),introUntil:e.at+tier.duration,profile,line:dialogue?profile.line:'',showPortrait:portrait,phase:e.until>e.at?'준비':'사용',stopped:false};
      }else if(this.active&&e.actor===this.active.actor&&(e.actionId===undefined||this.active.actionId===undefined||e.actionId===this.active.actionId)&&(e.cardId===undefined||this.active.cardId===undefined||e.cardId===this.active.cardId)){
        const a=this.active;if(a.stopped&&['signature-hit','dash','chain','cover','parry','cut'].includes(e.kind))return;
        if(e.kind==='signature-hit'&&window.CharacterData.skill(a.key).type==='comboStrike'){a.target=e.target;a.phase=e.index===1+window.CharacterData.skill(a.key).offsets.length?'마무리':`${e.index}타`;if(b.get(e.target)?.hp<=0){a.phase+=' · 처치';a.stopped=true;a.until=Math.min(a.until,e.at+.45);}}
        else if(e.kind==='block'||e.kind==='cancel'){a.phase=e.kind==='block'?'차단 · 공격 종료':e.reason||'기술 중단';a.stopped=true;a.until=Math.min(a.until,e.at+.4);}
        else if(['dash','chain','cover','parry','cut'].includes(e.kind)&&e.landed!==false&&a.profile.style!=='signature')a.phase={dash:'돌진',chain:'추가 추격',cover:'엄호',parry:'반격 준비',cut:'간격 확보'}[e.kind];
      }
    }
    current(b){const a=this.active;if(b.s.ended||!a||a.until<=b.s.t)return null;return a;}
    render(slot,b,reduced=false){
      if(!slot)return;const a=this.current(b),notice=this.result(b),actor=a&&b.get(a.actor),p=a?.profile,tier=p&&P.tiers[p.tier],portrait=!!(a&&a.showPortrait&&this.mode==='full'&&b.s.t<a.introUntil);
      const purpose=b.validPurpose(b.get('a1')),idle=b.s.ended?b.s.winner===0?'전투 승리 · 다음 전황을 준비합니다.':'전투 종료':purpose?`${purpose.kind==='cover'?'엄호':'추격'} · ${b.get(purpose.target)?.name} · ${Math.max(0,purpose.until-b.s.t).toFixed(1)}초`:'태세에 따라 움직이며 카드로 전황을 바꿉니다.';
      const key=(a?`${a.actor}:${a.key}:${a.at}:${a.phase}:${this.mode}:${portrait}:${b.s.t<a.introUntil}`:idle)+(notice?`:${notice.type}:${notice.at}:${notice.text}`:'');
      if(this.slot!==slot||this.viewKey!==key){
        this.slot=slot;this.viewKey=key;slot.replaceChildren();slot.classList.add('skill-stage');slot.dataset.tier=p?.tier||'idle';slot.dataset.phase=a?.phase||'';slot.dataset.outcome=notice?.type||'';
        if(a){
          if(portrait){const image=document.createElement('img');image.className='skill-portrait';image.src=p.portrait;image.alt=`${actor?.name||'캐릭터'} 초상화`;slot.append(image);}
          const body=document.createElement('div');body.className='skill-copy';const over=document.createElement('small');over.textContent=`${actor?.name||'캐릭터'} · ${notice?a.phase:tier.label+' · '+a.phase}`;const title=document.createElement('strong');title.textContent=p.title;const line=document.createElement('span');line.className='skill-dialogue';line.textContent=a.stopped?a.phase:this.mode==='full'&&a.line&&b.s.t<a.introUntil?`“${a.line}”`:a.phase;const phase=document.createElement('span');phase.className='skill-phase';phase.textContent=a.phase;body.append(over,title,line);slot.append(body,phase);
        }else{const text=document.createElement('span');text.className='skill-idle';text.textContent=idle;slot.append(text);}
        if(notice){const badge=document.createElement('span');badge.className='skill-result';badge.style.color=notice.color;const label=document.createElement('strong'),text=document.createElement('span');label.textContent=notice.label;text.textContent=notice.text;badge.append(label,text);slot.append(badge);}
      }
      const age=a?b.s.t-a.at:0,progress=a?Math.min(1,Math.max(0,age/.18)):1;slot.style.setProperty('--skill-enter',String(reduced||this.mode!=='full'?1:progress));slot.style.setProperty('--skill-color',p?.color||'#c4ad8d');
    }
  }
  window.SkillDirector=SkillDirector;
})();
