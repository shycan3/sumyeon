'use strict';
(()=>{
 const Base=window.CharacterBattle,U=window.UltimateData,copy=x=>JSON.parse(JSON.stringify(x));
 const labels={autoDelay:'다음 자동 검토 대기',command:'명령 회복 중',caster:'시전자 기술 실행 중',cardGap:'궁극기 이후 카드 2회 필요',interval:'같은 궁극기 발동 간격',target:'유효한 적 없음',defense:'적 차단으로 효과 없음',urgent:'위급한 아군 지원 우선',hold:'적 공격 대응을 위해 명령 보유',value:'현재 카드의 가치 우세',other:'다른 동료 궁극기 우선',selected:'궁극기 선택 가능',paused:'일시정지·수동 조작',ended:'전투 종료'};
 function valid(x,t,actors){const num=n=>Number.isFinite(n)&&n>=0;if(!x||x.version!==1||!num(x.nextAt)||x.nextAt>t+.601||!Array.isArray(x.rows)||x.rows.length>160||!Array.isArray(x.states)||x.states.length>4)return false;
  const actor=id=>actors.some(a=>a.side===0&&a.id===id),reason=r=>Object.hasOwn(labels,r);
  return new Set(x.states.map(r=>r.actor)).size===x.states.length&&x.states.every(r=>r&&actor(r.actor)&&(r.reason===null||reason(r.reason))&&num(r.at)&&r.at<=t&&r.seconds&&Object.keys(r.seconds).every(reason)&&Object.values(r.seconds).every(n=>num(n)&&n<=t+.001)&&Object.values(r.seconds).reduce((n,v)=>n+v,0)<=t+.001)&&x.rows.every((r,i)=>r&&actor(r.actor)&&reason(r.reason)&&num(r.at)&&r.at<=t&&(i===0||r.at>=x.rows[i-1].at));
 }
 class DiagnosticBattle extends Base{
  constructor(config,snapshot=null){if(!snapshot&&config.ultimateDiagnosticsVersion!==undefined&&![0,1].includes(config.ultimateDiagnosticsVersion))throw Error('궁극기 관측 버전이 올바르지 않습니다.');super(config,snapshot);if(!snapshot&&config.ultimateDiagnosticsVersion===1){if(!this.s.ultimates)throw Error('궁극기 관측에 궁극기 규칙이 필요합니다.');this.s.ultimateDiagnostics={version:1,nextAt:0,rows:[],states:this.s.ultimates.actors.map(r=>({actor:r.actor,reason:null,at:0,seconds:{}}))};}if(this.s.ultimateDiagnostics&&(!valid(this.s.ultimateDiagnostics,this.s.t,this.s.actors)||JSON.stringify(this.s.ultimateDiagnostics.states.map(r=>r.actor))!==JSON.stringify(this.s.ultimates?.actors.map(r=>r.actor))))throw Error('궁극기 관측 저장이 올바르지 않습니다.');}
  ultimateDecisionReasons(){
   const s=this.s,charged=(s.ultimates?.actors||[]).filter(r=>r.charge===100);if(!charged.length)return [];
   let decision=null;
   return charged.map(r=>{const a=this.get(r.actor),target=this.recommend({key:r.key,actor:r.actor,upgraded:false});let reason;
    if(s.ended)reason='ended';else if(s.paused||s.control!=='auto'||s.intervening)reason='paused';else if(!s.ready)reason='command';else if(s.t<s.autoAt)reason='autoDelay';else if(a.busy>s.t||a.action||a.approach||s.events.some(e=>e.actor===a.id))reason='caster';else if(s.ultimates.cardsSince<U.cardGap)reason='cardGap';else if(r.lastCast!==null&&s.t-r.lastCast<U.interval)reason='interval';else if(!target||this.get(target)?.hp<=0)reason='target';else if(this.guardActive(1,s.t+this.preparation({key:r.key,actor:r.actor,upgraded:false},target,0)))reason='defense';else{
     decision??=this.ultimateDecision();reason=decision.reasons.find(c=>c.actor===r.actor)?.reason||'value';
    }return {actor:r.actor,reason};
   });
  }
  observeUltimate(force=false){const s=this.s,x=s.ultimateDiagnostics;if(!x||!force&&s.t<x.nextAt)return;x.nextAt=s.t+.6;const observations=this.ultimateDecisionReasons();for(const state of x.states){const observation=observations.find(r=>r.actor===state.actor),reason=observation?.reason||null;if(state.reason)state.seconds[state.reason]=(state.seconds[state.reason]||0)+Math.max(0,s.t-state.at);if(reason&&reason!==state.reason)x.rows.push({at:s.t,actor:state.actor,reason});state.reason=reason;state.at=s.t;}x.rows=x.rows.slice(-160);}
  auto(){const s=this.s,decision=s.control==='auto'&&!s.intervening&&!s.paused&&!s.ended&&s.ready&&s.t>=s.autoAt;this.observeUltimate(decision);const accepted=super.auto();if(decision&&accepted)this.observeUltimate(true);return accepted;}
  step(dt){super.step(dt);this.observeUltimate(this.s.ended);}
  ultimateDiagnosticsSummary(){if(!this.s.ultimateDiagnostics)return null;this.observeUltimate(true);return copy(this.s.ultimateDiagnostics);}
 }
 function readout(b,actor,reasons=[]){const s=b.s,r=b.ultimateRow(actor);if(!r)return {phase:'none',label:'궁극 없음',detail:'현재 궁극기 없음',available:false};
  const a=b.get(actor),casting=s.ultimates.history.findLast(h=>h.actor===actor&&h.status==='casting');
  if(a.hp<=0)return {phase:'ko',label:'전투불능',detail:'시전자가 전투불능입니다.',available:false};
  if(casting)return {phase:'casting',label:'궁극 실행',detail:'공유 명령과 게이지를 소비하고 실행 중입니다.',available:false};
  if(r.casts>=U.maxCasts)return {phase:'complete',label:'발동 완료',detail:'이번 전투의 두 번 발동을 모두 사용했습니다.',available:false};
  if(r.charge<100)return {phase:'charging',label:'궁극기 '+r.charge+'/100',detail:U.profiles[r.characterId].desc,available:false};
  const reason=reasons.find(x=>x.actor===actor)?.reason||'value',short={autoDelay:'검토',command:'명령',caster:'기술',cardGap:'카드'+Math.max(0,U.cardGap-s.ultimates.cardsSince)+'회',interval:Math.ceil(Math.max(0,U.interval-(s.t-r.lastCast)))+'초',target:'대상',defense:'차단',urgent:'지원',hold:'대응',value:'카드',other:'동료',selected:'발동',paused:'정지',ended:'종료'},available=['urgent','hold','value','other','selected'].includes(reason);
  return {phase:available?'eligible':'prepared',label:reason==='selected'?'발동 가능':'준비·'+short[reason],detail:'준비 완료 · '+(available?'발동 조건 충족':'발동 조건 대기')+' · '+labels[reason],available,reason};
 }
 window.UltimateDiagnostics={labels,valid,readout};window.CharacterBattle=DiagnosticBattle;
})();
