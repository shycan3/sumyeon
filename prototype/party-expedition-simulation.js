(function(root){
  'use strict';
  const Voyage=typeof module!=='undefined'?require('./party-expedition-voyage.js'):root.PartyExpeditionRun;
  const Auto=typeof module!=='undefined'?require('./party-expedition-automation.js'):root.PartyExpeditionAutomation;
  const Telemetry=typeof module!=='undefined'?require('./party-expedition-telemetry.js'):root.PartyExpeditionTelemetry;
  const Combat=typeof module!=='undefined'?require('./party-expedition-core.js'):root.PartyExpedition;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const STANDARD_PARTIES=[['navigator','diver','pilot','lightkeeper'],['navigator','sounder','salvager','lightkeeper'],['diver','pilot','sounder','salvager']];
  function allParties(){const ids=Combat.ROLES.map(r=>r.id),out=[];for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++)for(let c=b+1;c<ids.length;c++)for(let d=c+1;d<ids.length;d++)out.push([ids[a],ids[b],ids[c],ids[d]]);return out;}
  function normalize(options={}){
    const c={seedStart:1,seedCount:10,policies:['balanced'],parties:copy(STANDARD_PARTIES),difficulty:'normal',breakMode:'off',balanceVersion:Voyage.BALANCE_VERSION,maxSteps:1500,maxRounds:60,...copy(options)};
    c.contentVersion||=options.balanceVersion&&options.balanceVersion!==Voyage.BALANCE_VERSION?'voyage-1':Voyage.CONTENT_VERSION;
    if(!Number.isInteger(c.seedStart)||c.seedStart<0||!Number.isInteger(c.seedCount)||c.seedCount<1||c.seedCount>1000||c.seedStart+c.seedCount-1>0xffffffff)throw Error('시드 시작과 개수를 확인하세요.');
    if(!Array.isArray(c.policies)||!c.policies.length||new Set(c.policies).size!==c.policies.length||c.policies.some(p=>!['balanced','aggressive','cautious'].includes(p)))throw Error('자동 판단 정책 오류');
    if(!Array.isArray(c.parties)||!c.parties.length||c.parties.some(p=>!Array.isArray(p)||p.length!==4||new Set(p).size!==4||p.some(id=>!Combat.ROLES.some(r=>r.id===id))))throw Error('각 편성은 서로 다른 동료 4명이어야 합니다.');
    if(new Set(c.parties.map(p=>p.join('|'))).size!==c.parties.length)throw Error('중복 편성은 제거하세요.');
    if(!['normal','calm'].includes(c.difficulty)||!['on','off'].includes(c.breakMode))throw Error('원정 규칙 오류');
    if(!Voyage.BALANCE_VERSIONS.includes(c.balanceVersion))throw Error('원정 밸런스 버전 오류');
    if(!Voyage.CONTENT_VERSIONS.includes(c.contentVersion))throw Error('원정 콘텐츠 버전 오류');
    if(!Number.isInteger(c.maxSteps)||c.maxSteps<1||c.maxSteps>10000||!Number.isInteger(c.maxRounds)||c.maxRounds<1||c.maxRounds>300)throw Error('자동 실행 상한 오류');
    if(c.seedCount*c.parties.length*c.policies.length>500)throw Error('한 배치는 최대 500회입니다. 시드·편성·정책 개수를 줄여 나누어 실행하세요.');
    return c;
  }
  function createBatch(options={}){
    const config=normalize(options),jobs=[];
    for(let seed=config.seedStart;seed<config.seedStart+config.seedCount;seed++)for(const party of config.parties)for(const policy of config.policies)jobs.push({seed,party:copy(party),policy,difficulty:config.difficulty,breakMode:config.breakMode,balanceVersion:config.balanceVersion,contentVersion:config.contentVersion,maxSteps:config.maxSteps,maxRounds:config.maxRounds,policyVersion:Auto.POLICY_VERSION||'automation-1'});
    let index=0,run=null,recorder=null,steps=0,reason='실행 대기',stopped=false;
    const records=[];
    function finish(status,message=null){const record=recorder.finish(status,run.snapshot(),message);records.push(record);index++;run=null;recorder=null;steps=0;return record;}
    const batch={config,records,get done(){return stopped||index>=jobs.length;},get progress(){return {completed:records.length,total:jobs.length,currentSeed:jobs[index]?.seed??null,phase:run?.s.phase||'waiting',policy:jobs[index]?.policy??null,party:copy(jobs[index]?.party||[]),reason};},
      step(){
        if(batch.done)return {done:true,progress:batch.progress};
        if(!run){run=new Voyage.Run(jobs[index]);recorder=Telemetry.createRecorder(jobs[index],run.snapshot());run.setToolPolicy('emergency');reason='새 원정 시작';}
        if(steps>=config.maxSteps||(run.s.phase==='battle'&&run.battle.s.round>config.maxRounds)){
          reason='실행 상한으로 중단';const record=finish('aborted',reason);return {done:batch.done,record,progress:batch.progress};
        }
        try{
          const transition=Auto.step(run,{policy:jobs[index].policy,toolPolicy:'emergency'});steps++;reason=transition.decision.reason;recorder.observe(transition);
          let record;if(['won','lost'].includes(run.s.phase))record=finish(run.s.phase);
          return {done:batch.done,transition,record,progress:batch.progress};
        }catch(error){reason='자동 실행 오류: '+error.message;const record=finish('error',reason);return {done:batch.done,record,error:reason,progress:batch.progress};}
      },stop(){if(run)finish('aborted','사용자 중단');stopped=true;reason='사용자 중단';return batch.progress;},
      get snapshot(){return run?.snapshot()||null;}
    };
    return batch;
  }
  function simulate(config){const batch=createBatch({seedStart:config.seed??config.seedStart??1,seedCount:1,parties:[config.party||STANDARD_PARTIES[0]],policies:[config.policy||'balanced'],...Object.fromEntries(['difficulty','breakMode','balanceVersion','contentVersion','maxSteps','maxRounds'].filter(k=>config[k]!==undefined).map(k=>[k,config[k]]))});while(!batch.done)batch.step();return batch.records[0];}
  function replay(record){
    const run=new Voyage.Run({...record.config,contentVersion:record.contentVersion||record.config.contentVersion||'voyage-1',balanceVersion:record.config.balanceVersion??Voyage.LEGACY_BALANCE_VERSION});run.setToolPolicy('emergency');
    for(const d of record.decisions){if(typeof run[d.method]!=='function')throw Error('알 수 없는 재생 명령');run[d.method](...copy(d.args));}
    return {matches:JSON.stringify(run.s.deck)===JSON.stringify(record.final.deck)&&JSON.stringify(run.s.allies)===JSON.stringify(record.final.allies)&&run.s.phase===record.final.phase&&run.s.gold===record.final.gold,snapshot:run.snapshot()};
  }
  const api={VERSION:'expedition-simulation-1',STANDARD_PARTIES,allParties,normalize,createBatch,simulate,replay};
  if(typeof module!=='undefined')module.exports=api;else root.PartyExpeditionSimulation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
