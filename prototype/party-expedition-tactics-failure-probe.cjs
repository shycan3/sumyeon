'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline'),assert=require('node:assert/strict');
const {Run}=require('./party-expedition-voyage.js');
const Automation=require('./party-expedition-automation.js');
const Telemetry=require('./party-expedition-telemetry.js');
const {retargetDirectAttack}=require('./party-expedition-failure-probe.cjs');
const VERSION='tactics-natural-failure-diagnostic-1';
const STUDY='paired-natural-failure-diagnostic';
const DEFAULT_SOURCES=['enemy-buff-2-after','enemy-buff-2-holdout-after'].map(name=>path.join(__dirname,'study-results',name,'runs.jsonl'));
const SOURCE_MODULES=['party-expedition-tactics-failure-probe.cjs','party-expedition-failure-probe.cjs','party-expedition-core.js','party-expedition-catalog.js','party-expedition-run.js','party-expedition-voyage.js','party-expedition-voyage-combat.js','party-expedition-auto.js','party-expedition-automation.js','party-expedition-telemetry.js'];
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const moduleHashes=()=>Object.fromEntries(SOURCE_MODULES.map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))]));
async function fileHash(file){const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))digest.update(chunk);return digest.digest('hex');}

async function selectCases(files=DEFAULT_SOURCES,count=6){
  const selected=[],population=[];
  for(const file of files){
    const input=fs.createReadStream(file,{encoding:'utf8'}),reader=readline.createInterface({input,crlfDelay:Infinity});let lineNumber=0,total=0,lost=0;
    try{for await(const line of reader){
      lineNumber++;if(!line.trim())continue;const record=JSON.parse(line);total++;
      if(record.status!=='lost')continue;lost++;
      const battle=record.battles.find(b=>b.status==='lost');assert.ok(battle,'자연 패배 원정에 패배 전투가 없습니다.');
      assert.equal(record.contentVersion||record.config.contentVersion||'voyage-1','voyage-1','이 진단은 과거 voyage-1 실패만 사용합니다.');
      assert.equal(record.config.balanceVersion,'voyage-balance-2','이 진단은 2차 능력치 상향의 원본 실패만 사용합니다.');
      if(selected.length<count)selected.push({sourcePath:path.resolve(file),lineNumber,lineSHA256:hash(line),record,battle});
    }}finally{reader.close();input.destroy();}
    population.push({file:path.resolve(file),total,lost,SHA256:await fileHash(file)});
  }
  assert.equal(selected.length,count,'요청한 첫 6개 자연 패배가 모두 필요합니다.');
  return {selected,population,selection:'입력 파일 순서(enemy-buff-2-after, enemy-buff-2-holdout-after)와 JSONL 행 순서를 유지해 자연 패배 중 첫 6건 선택. 분석 정책 결과를 보거나 교체·재선정하지 않음.'};
}
function execute(run,chosen){
  const before=run.snapshot(),oldBattle=run.battle;
  const result=run[chosen.method](...copy(chosen.args)),after=run.snapshot();
  const events=before.phase==='battle'&&Array.isArray(result)?copy(result):run.battle&&run.battle!==oldBattle?copy(run.battle.s.events||[]):[];
  assert.notDeepEqual(after,before,'진단 명령은 실제 상태를 변경해야 합니다.');
  return {decision:copy(chosen),before,after,events};
}
function resultOf(record){
  assert.equal(record.battles.length,1,'단 하나의 지정 전투만 진단에 포함해야 합니다.');const b=record.battles[0];
  return {status:b.status,recordStatus:record.status,reason:record.reason,rounds:b.rounds,entryHP:b.entry.allies.reduce((n,a)=>n+a.hp,0),exitHP:b.exit.allies.reduce((n,a)=>n+a.hp,0),
    metrics:copy(b.metrics),healthAccounting:copy(b.healthAccounting),finalAllies:b.exit.allies.map(a=>({id:a.id,hp:a.hp})),finalEnemies:b.exit.enemies.map(e=>({id:e.id,pattern:e.pattern,hp:e.hp})),
    commands:record.decisions.map(d=>({method:d.method,args:d.args})),runPhaseAfterFight:record.final.phase};
}
function pairedCase(candidate,index){
  const {record:source,battle:sourceBattle}=candidate;
  const config={...copy(source.config),contentVersion:'voyage-1',balanceVersion:source.config.balanceVersion};
  const boundary=source.decisions.findIndex(d=>d.phase==='battle'&&d.floor===sourceBattle.floor);
  assert.ok(boundary>0,'전투 진입 명령 경계가 없습니다.');
  const prefix=source.decisions.slice(0,boundary),suffix=[];
  for(const chosen of source.decisions.slice(boundary)){if(chosen.phase!=='battle'||chosen.floor!==sourceBattle.floor)break;suffix.push(chosen);}
  const reference=new Run(config);reference.setToolPolicy('emergency');for(const chosen of prefix)execute(reference,chosen);
  const entry=reference.snapshot();assert.equal(entry.phase,'battle');assert.equal(entry.floor+1,sourceBattle.floor);
  assert.deepEqual(Telemetry.publicState(entry.battle),sourceBattle.entry,'원본 공개 진입 상태가 재현되지 않았습니다.');
  const restored=Run.restore(copy(entry));assert.deepEqual(restored.snapshot(),entry);assert.deepEqual(restored.battle.snapshot(),reference.battle.snapshot());
  const entryHashes={fullRun:hash(entry),fullBattle:hash(entry.battle),HP:hash(entry.battle.allies.map(a=>({id:a.id,hp:a.hp,max:a.max}))),seed:hash(entry.battle.seed),deck:hash(entry.deck),zones:hash(entry.battle.zones),enemies:hash(entry.battle.enemies)};
  function branch(kind){
    const run=Run.restore(copy(entry));assert.deepEqual(run.snapshot(),entry,'분기 시작 전체 원정 상태 불일치');assert.deepEqual(run.battle.snapshot(),reference.battle.snapshot(),'분기 내부 전체 전투 상태 불일치');
    const actualStart=run.snapshot(),recorder=Telemetry.createRecorder({...config,analysisOnly:true,excludeFromCoverageTotals:true,studyType:STUDY,diagnosticPolicy:kind,diagnosticVersion:VERSION,caseNumber:index+1,sourceLine:candidate.lineNumber,targetFloor:sourceBattle.floor},actualStart);
    const changes=[];let steps=0,aborted=null;
    if(kind==='recorded-suffix'){
      for(const chosen of suffix){recorder.observe(execute(run,chosen));steps++;}
    }else{
      while(run.s.phase==='battle'){
        if(steps>=1500||run.battle.s.round>60){aborted='진단 전투 실행 상한';break;}
        const chosen=Automation.decide(run,{policy:source.config.policy});assert.ok(chosen,'진행 중 전투에 자동 명령이 없습니다.');
        const selected=kind==='lowest-public-HP-direct-target'?retargetDirectAttack(run,chosen):{chosen,change:null};
        const transition=execute(run,selected.chosen);recorder.observe(transition);steps++;
        if(selected.change)changes.push({...selected.change,actionIndex:steps,actualEvents:copy(transition.events)});
      }
    }
    const status=aborted?'aborted':run.battle.s.status;assert.ok(['won','lost','aborted'].includes(status));
    const record=recorder.finish(status,run.snapshot(),aborted);Object.assign(record,{studyType:STUDY,excludeFromCoverageTotals:true,analysisOnly:true});
    const outcome=resultOf(record);assert.ok(outcome.healthAccounting.matches,'단일 전투 HP 회계 불일치');
    assert.equal(hash(actualStart),entryHashes.fullRun);assert.equal(hash(actualStart.battle),entryHashes.fullBattle);
    return {record,outcome,changes,start:actualStart};
  }
  const replay=branch('recorded-suffix');
  assert.equal(replay.outcome.status,'lost');assert.deepEqual(replay.record.battles[0].exit,sourceBattle.exit,'기록된 전투 suffix 종료 전체 공개 상태 불일치');
  assert.deepEqual(replay.outcome.commands,suffix.map(d=>({method:d.method,args:d.args})), 'suffix 기록 재생 명령 불일치');
  const original=branch('original-auto');
  assert.equal(original.outcome.status,sourceBattle.status);assert.deepEqual(original.record.battles[0].exit,sourceBattle.exit,'현재 원본 오토의 공개 종료가 과거 기록과 다릅니다.');
  assert.deepEqual(original.outcome.commands,suffix.map(d=>({method:d.method,args:d.args})),'현재 원본 오토의 명령이 과거 기록과 다릅니다.');
  const probe=branch('lowest-public-HP-direct-target');
  assert.deepEqual(original.start,probe.start,'원본 오토와 표적 분기의 실제 진입 전체 상태 불일치');
  const clean=r=>{const {commands,...summary}=r;return summary;};
  return {records:[replay.record,original.record,probe.record],comparison:{caseNumber:index+1,source:{file:candidate.sourcePath,line:candidate.lineNumber,lineSHA256:candidate.lineSHA256,seed:config.seed,party:copy(config.party),policy:config.policy,contentVersion:'voyage-1',balanceVersion:config.balanceVersion,floor:sourceBattle.floor,node:sourceBattle.nodeId,encounter:sourceBattle.encounter,name:sourceBattle.name},
    verification:{sourcePublicEntryMatches:true,restoreFullEntryMatches:true,recordedSuffixExitMatches:true,originalAutoExitMatches:true,originalAutoCommandsMatch:true,allThreeActualFullEntriesIdentical:true,entryHashes,
      actualBranchEntrySHA256:{replay:hash(replay.start),originalAuto:hash(original.start),probe:hash(probe.start)},targetSelectionReadsPublicHPOnly:true,noFollowingExpeditionContentExecuted:true},
    recorded:clean(replay.outcome),originalAuto:clean(original.outcome),probe:clean(probe.outcome),targetChanges:probe.changes,
    delta:{rounds:probe.outcome.rounds-original.outcome.rounds,enemyDamage:probe.outcome.metrics.enemyDamage-original.outcome.metrics.enemyDamage,blocked:probe.outcome.metrics.blocked-original.outcome.metrics.blocked,healing:probe.outcome.metrics.healing-original.outcome.metrics.healing,exitHP:probe.outcome.exitHP-original.outcome.exitHP,cardsPlayed:probe.outcome.metrics.cardsPlayed-original.outcome.metrics.cardsPlayed}}};
}
function aggregate(comparisons){
  const result={};for(const side of ['recorded','originalAuto','probe']){const outcomes=comparisons.map(c=>c[side]);result[side]={cases:outcomes.length,won:outcomes.filter(r=>r.status==='won').length,lost:outcomes.filter(r=>r.status==='lost').length,aborted:outcomes.filter(r=>r.status==='aborted').length,rounds:outcomes.reduce((n,r)=>n+r.rounds,0),enemyDamage:outcomes.reduce((n,r)=>n+r.metrics.enemyDamage,0),blocked:outcomes.reduce((n,r)=>n+r.metrics.blocked,0),healing:outcomes.reduce((n,r)=>n+r.metrics.healing,0),exitHP:outcomes.reduce((n,r)=>n+r.exitHP,0)};}
  result.targetChanges=comparisons.reduce((n,c)=>n+c.targetChanges.length,0);result.hpAccountingErrors=comparisons.flatMap(c=>[c.recorded,c.originalAuto,c.probe]).filter(r=>!r.healthAccounting.matches).length;return result;
}
function report(comparisons,summary,selection){
  const aggregateResults=summary.diagnosticResults;
  const lines=['# 능력치 상향 이후 자연 패배 6건의 단일 공격 표적 진단','','이 보고서는 원정 승률 집계에 포함하지 않는 사후 진단이다. 자연 패배한 전투 6건의 동일 진입 상태에서 원본 명령 재생·원본 오토·공개 최저 HP 표적 정책을 비교했다. 18개 재생 기록은 새 원정 18회가 아니다.','',selection.selection,'',
    `원본 모집단: ${selection.population.map(p=>`${path.basename(path.dirname(p.file))} ${p.total}회 중 ${p.lost}패`).join(' / ')}. 첫 6건은 모두 seed32이므로 새 시드나 전체 패배군으로 일반화하지 않는다.`, '',
    '| 사례 | 정책·구역 | 적 | 진입 HP | 원본 승패/턴 | 표적 변경 승패/턴 | 받은 HP 피해 원본→변경 | 종료 HP 원본→변경 | 변경 수 |','|---:|---|---|---:|---|---|---:|---:|---:|',
    ...comparisons.map(c=>`| ${c.caseNumber} | ${c.source.policy}·${c.source.floor} | ${c.source.encounter} | ${c.originalAuto.entryHP} | ${c.originalAuto.status}/${c.originalAuto.rounds} | ${c.probe.status}/${c.probe.rounds} | ${c.originalAuto.metrics.enemyDamage}→${c.probe.metrics.enemyDamage} | ${c.originalAuto.exitHP}→${c.probe.exitHP} | ${c.targetChanges.length} |`), '',
    `원본 명령 재생과 현재 원본 오토는 6건 모두 공개 종료 상태와 모든 실행 명령이 일치했다. 원본 오토 ${aggregateResults.originalAuto.won}승/${aggregateResults.originalAuto.lost}패, 표적 진단 ${aggregateResults.probe.won}승/${aggregateResults.probe.lost}패, 중단 ${aggregateResults.probe.aborted}건. 표적 변경은 총 ${aggregateResults.targetChanges}회, HP 회계 오류는 ${aggregateResults.hpAccountingErrors}건이다.`, '',
    `6개 지정 전투에서 파티가 적에게 받은 실제 HP 피해 합계는 ${aggregateResults.originalAuto.enemyDamage}→${aggregateResults.probe.enemyDamage}, 보호 흡수 합계는 ${aggregateResults.originalAuto.blocked}→${aggregateResults.probe.blocked}, 턴 합계는 ${aggregateResults.originalAuto.rounds}→${aggregateResults.probe.rounds}였다.`, '',
    '## 해석과 적용 한계','',
    `공개된 낮은 HP 적을 먼저 제거하는 단일 표적 변경으로 ${aggregateResults.probe.won}개 원본 패배 전투를 이겼다. 이는 이 사례들의 오토 표적 정책을 조사할 근거다. 카드 선택·실행자·효과 선택·도구는 기존 오토 판단을 유지했으며, 상태 변화 뒤 후속 판단은 다시 계산한다. 이 결과는 카드·적 수치 또는 공격형 전략의 보편적 우월성을 입증하지 않는다.`,'',
    '최저 HP 정책은 지원형 패턴을 강제로 식별하지 않는다. 이 원본 자료에는 신규 지원 적이 없고, 가장 낮은 공개 HP가 동행 적인 상황에서 먼저 제거하는 보조 표적 정책을 시험한다. 현재 공개 HP만 읽으며 미래 덱 순서·RNG·미리보기 결과로 승리할 행동을 선별하지 않는다. 기존 retargetDirectAttack의 미리보기는 합법성 확인만 한다.','',
    '원본은 voyage-1·voyage-balance-2로 고정했다. 진입 체력·카드·구역·유물·도구·에너지·적·내부 난수를 주입하지 않고 원본 prefix 명령을 공개 Run API로 재생했다. 내부 전체 상태 해시는 동일성 검사용이며 표적 정책에 전달하지 않는다. 실제 분기 시작 상태와 원정/전투/HP/덱/난수/영역/적 해시는 comparison.json에 기록했다.','',
    '전투 종료 즉시 중단하여 보상·노드·다음 전투를 수행하지 않았다. 모든 로그와 요약에 excludeFromCoverageTotals=true를 설정했으며 기존 180회 원정 승률·신규 콘텐츠 승률과 합산하지 않는다. 승리한 진단 전투 뒤 원정 단계가 reward/relicreward인 것은 정상이며 전체 원정 클리어를 뜻하지 않는다.','',
    '## 사례별 편성과 실제 변경',''];
  for(const c of comparisons){lines.push(`### 사례 ${c.caseNumber}: ${c.source.party.join(' / ')}`,'',`원본 행 ${c.source.line}, ${c.source.policy}, ${c.source.floor}구역. 실제 진입 전체 상태 SHA256: ${c.verification.entryHashes.fullRun}`,'','| 턴 | 카드·실행자 | 원래 대상→새 대상 | 당시 공개 HP |','|---:|---|---|---|',...c.targetChanges.map(ch=>`| ${ch.round} | ${ch.name}·${ch.actor} | ${ch.originalTarget}→${ch.newTarget} | ${ch.publicEnemyHP.map(e=>e.id+':'+e.hp).join(' / ')} |`),'');}
  return lines.join('\n')+'\n';
}
async function main(argv=process.argv.slice(2)){
  const flags={};for(let i=0;i<argv.length;i++){if(argv[i]==='--help'){console.log('node prototype/party-expedition-tactics-failure-probe.cjs [--out 신규폴더]\n기존 180회 능력치 상향 실험의 자연 패배 중 첫 6건을 동일 진입으로 진단한다. 기존 출력은 덮어쓰지 않는다.');return;}if(argv[i]!=='--out'||!argv[i+1])throw Error('유효한 --out 값이 필요합니다.');flags.out=argv[++i];}
  const out=path.resolve(flags.out||path.join(__dirname,'study-results','tactics-1-failure-diagnostic'));if(fs.existsSync(out))throw Error('기존 출력 폴더는 덮어쓰지 않습니다: '+out);
  const beforeHashes=moduleHashes(),selection=await selectCases(),comparisons=[],records=[];
  console.log('자연 패배 '+selection.population.reduce((n,p)=>n+p.lost,0)+'건 중 첫 6건을 원본·표적 진단으로 재생합니다.');
  for(let i=0;i<selection.selected.length;i++){const result=pairedCase(selection.selected[i],i);comparisons.push(result.comparison);records.push(...result.records);const c=result.comparison;console.log(`case ${i+1}: ${c.source.policy} floor${c.source.floor} ${c.originalAuto.status}/${c.originalAuto.rounds} → ${c.probe.status}/${c.probe.rounds}, target changes ${c.targetChanges.length}`);}
  assert.deepEqual(moduleHashes(),beforeHashes,'실행 중 전투·정책 소스가 변경됐습니다. 출력 없이 새 프로세스로 재실행해야 합니다.');
  const summary={...Telemetry.summarize(records),studyType:STUDY,analysisOnly:true,excludeFromCoverageTotals:true,diagnosticResults:aggregate(comparisons)};
  const manifest={version:VERSION,createdAt:new Date().toISOString(),studyType:STUDY,analysisOnly:true,excludeFromCoverageTotals:true,sources:selection.population,selection:selection.selection,caseCount:6,diagnosticReplayCount:18,fullExpeditionsAdded:0,sourceSHA256:beforeHashes,
    policies:{recorded:'원본 suffix 명령 exact 재생',originalAuto:'원본 기존 정책으로 현재 공개 상태 판단',probe:'기존 정책 선택 뒤 단일 직접 공격의 적 표적만 공개 최저 HP로 변경',reuse:'party-expedition-failure-probe.cjs retargetDirectAttack',readsFutureRNG:false},limits:{maxSteps:1500,maxRounds:60},contentVersion:'voyage-1',balanceVersion:'voyage-balance-2'};
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.mkdirSync(out);const write=(name,value)=>fs.writeFileSync(path.join(out,name),value,{flag:'wx'});
  write('manifest.json',JSON.stringify(manifest,null,2));write('runs.jsonl',records.map(r=>JSON.stringify(r)).join('\n')+'\n');write('summary.json',JSON.stringify(summary,null,2));write('comparison.json',JSON.stringify({version:VERSION,studyType:STUDY,excludeFromCoverageTotals:true,comparisons},null,2));write('battles.csv',Telemetry.battleCSV(records));write('report.md',report(comparisons,summary,selection));
  console.log(JSON.stringify({out,...summary.diagnosticResults},null,2));if(summary.runs.error||summary.diagnosticResults.hpAccountingErrors)process.exitCode=1;
}
module.exports={selectCases,pairedCase,aggregate,report,VERSION};
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
