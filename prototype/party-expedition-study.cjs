'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Simulation=require('./party-expedition-simulation.js'),Telemetry=require('./party-expedition-telemetry.js'),Automation=require('./party-expedition-automation.js');
const Voyage=require('./party-expedition-voyage.js');
const args=process.argv.slice(2),flags={};
for(let i=0;i<args.length;i++){if(!args[i].startsWith('--'))throw Error('옵션 앞에 --를 붙이세요.');const key=args[i].slice(2);if(['all-parties','break','help'].includes(key))flags[key]=true;else{if(!args[i+1]||args[i+1].startsWith('--'))throw Error('옵션 값 필요: '+key);flags[key]=args[++i];}}
const allowed=new Set(['all-parties','break','help','start','seeds','policies','party','difficulty','balance','content','max-steps','max-rounds','out']);
for(const key of Object.keys(flags))if(!allowed.has(key))throw Error('알 수 없는 옵션: --'+key);
if(flags.help){console.log('node prototype/party-expedition-study.cjs --seeds 20 --policies all --out prototype/study-results\n옵션: --start 1 --seeds 20 --policies balanced,aggressive,cautious|all --party navigator,diver,pilot,lightkeeper --all-parties --difficulty normal|calm --balance current|previous|legacy --content current|previous --break --max-steps 1500 --max-rounds 60');process.exit(0);}
if(flags.balance&&!['current','previous','legacy'].includes(flags.balance))throw Error('밸런스는 current, previous 또는 legacy를 지정하세요.');
if(flags.content&&!['current','previous'].includes(flags.content))throw Error('콘텐츠는 current 또는 previous를 지정하세요.');
const policies=flags.policies==='all'?Automation.policies:(flags.policies||'balanced,aggressive,cautious').split(',');
const config={seedStart:Number(flags.start??1),seedCount:Number(flags.seeds??20),policies,
  parties:flags['all-parties']?Simulation.allParties():flags.party?[flags.party.split(',')]:Simulation.STANDARD_PARTIES,
  difficulty:flags.difficulty||'normal',breakMode:flags.break?'on':'off',balanceVersion:{legacy:Voyage.LEGACY_BALANCE_VERSION,previous:Voyage.PREVIOUS_BALANCE_VERSION,current:Voyage.BALANCE_VERSION}[flags.balance||'current'],...(flags.content?{contentVersion:flags.content==='previous'?'voyage-1':Voyage.CONTENT_VERSION}:{}),maxSteps:Number(flags['max-steps']??1500),maxRounds:Number(flags['max-rounds']??60)};
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const batch=Simulation.createBatch(config),out=path.resolve(flags.out||path.join(__dirname,'study-results','batch-'+stamp));
if(['manifest.json','runs.jsonl','summary.json','battles.csv','report.md'].some(file=>fs.existsSync(path.join(out,file))))throw Error('이 폴더에는 실험 기록이 있습니다. 기존 기록을 보존하려면 다른 --out 폴더를 지정하세요.');
fs.mkdirSync(out,{recursive:true});
const sources=['party-expedition-core.js','party-expedition-catalog.js','party-expedition-voyage-combat.js','party-expedition-run.js','party-expedition-encounters.js','party-expedition-voyage.js','party-expedition-auto.js','party-expedition-automation.js','party-expedition-telemetry.js','party-expedition-simulation.js','party-expedition-study.cjs'];
const metadata={createdAt:new Date().toISOString(),config:batch.config,policy:Automation.metadata,versions:{simulation:Simulation.VERSION,telemetry:Telemetry.VERSION},sourceSHA256:Object.fromEntries(sources.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex')]))};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(metadata,null,2));
fs.writeFileSync(path.join(out,'runs.jsonl'),'');
const num=n=>n==null?'—':n.toFixed(1),safe=s=>String(s).replace(/\|/g,'/');
function report(summary){
  const lines=['# 자동 원정 관찰 보고서','',`콘텐츠: ${batch.config.contentVersion} · 밸런스 규칙: ${batch.config.balanceVersion}.`, '',`원정 ${summary.runs.total}회: 승리 ${summary.runs.won}, 패배 ${summary.runs.lost}, 중단 ${summary.runs.aborted}, 오류 ${summary.runs.error}.`,
    `전투 ${summary.battles.total}회: 승리 ${summary.battles.won}, 패배 ${summary.battles.lost}, 중단 ${summary.battles.aborted}, 오류 ${summary.battles.error}.`,'',
    '자동 정책의 관찰 결과이며 사람의 재미·난이도·카드의 인과적 효과를 증명하지 않는다. 세 정책은 동일한 전투 자동 판단을 공유하고, 경로·덱 성장·도구 사용 선호를 달리한다.','',
    '## 도달 표본','', '| 구역 | 도달 원정 | 실제 전투 진입 |','|---|---:|---:|',...summary.reach.map(g=>`| ${g.floor} | ${g.runsReached} | ${g.battlesEntered} |`),'',
    '## 정예·보스: 구역·편성·정책별 결과','', '| 구역·전투 | 편성 | 정책 | 완료 표본 | 승/패 | 평균 실제 HP 피해 | 보호 흡수 | 평균 턴 | 승리/패배 평균 피해 |','|---|---|---|---:|---:|---:|---:|---:|---:|',
    ...summary.encounters.filter(g=>['elite','boss'].includes(g.tier)).map(g=>`| ${g.floor} · ${safe(g.name)} | ${g.party.join('/')} | ${g.policy} | ${g.n} | ${g.won}/${g.lost} | ${num(g.meanDamage)} | ${num(g.meanBlocked)} | ${num(g.meanRounds)} | ${num(g.outcomes.won.meanDamage)} / ${num(g.outcomes.lost.meanDamage)} |`),'',
    '## 사용 카드 상위 25종','', '| 카드 | 사용 횟수 | 보유 / 손패 도달 / 사용 전투 | 사용된 전투 승/패 | 즉시 피해 | 즉시 회복 | 생성 보호 |','|---|---:|---:|---:|---:|---:|---:|',
    ...summary.cards.slice(0,25).map(c=>`| ${safe(c.name)} | ${c.plays} | ${c.battlesPresent}/${c.battlesDrawn}/${c.battlesUsed} | ${c.wonUsed}/${c.lostUsed} | ${c.damage} | ${c.healing} | ${c.shield} |`),'',
    '## 추가로 볼 신호','',...summary.signals.map(s=>'- '+s),'','## 해석 범위','',...summary.limitations.map(s=>'- '+s),'',
    '전체 실행 이유·제시 후보·전투 진입 덱/유물·실제 이벤트·손패·적 의도는 runs.jsonl에 있다. battles.csv는 전투별 표이다. manifest.json의 소스 해시와 시드·정책으로 실험 조건을 식별한다.',''];
  return lines.join('\n');
}
let interrupted=false;process.on('SIGINT',()=>{interrupted=true;});
(async()=>{
  console.log(`자동 원정 ${batch.progress.total}회 시작 · 로그 ${out}`);
  while(!batch.done){
    const result=batch.step();
    if(result.record){fs.appendFileSync(path.join(out,'runs.jsonl'),JSON.stringify(result.record)+'\n');const p=batch.progress;
      console.log(`${p.completed}/${p.total} · seed ${result.record.config.seed} · ${result.record.config.policy} · ${result.record.status} · ${result.record.battles.length}전투`);
      await new Promise(resolve=>setImmediate(resolve));}
    if(interrupted){const previous=batch.records.length;batch.stop();for(const r of batch.records.slice(previous))fs.appendFileSync(path.join(out,'runs.jsonl'),JSON.stringify(r)+'\n');}
  }
  const summary=Telemetry.summarize(batch.records);
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
  fs.writeFileSync(path.join(out,'battles.csv'),Telemetry.battleCSV(batch.records));
  fs.writeFileSync(path.join(out,'report.md'),report(summary));
  console.log(JSON.stringify({runs:summary.runs,battles:summary.battles,hpAccountingErrors:batch.records.flatMap(r=>r.battles).filter(b=>!b.healthAccounting.matches).length,out},null,2));
  if(summary.runs.error)process.exitCode=1;
})();
