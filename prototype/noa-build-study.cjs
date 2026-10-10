'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),copy=x=>JSON.parse(JSON.stringify(x));
const ctx=vm.createContext({window:{}});
for(const f of ['data','character-data','trial-character','content-authoring','support-content','ultimate-data','strategy-encounters','expedition-growth','presentation-data','actor-ai','engine','campaign','character-engine','ultimate-engine','ultimate-diagnostics','character-campaign','content-catalog'])vm.runInContext(fs.readFileSync(__dirname+'/'+f+'.js','utf8'),ctx);
const W=ctx.window,{CharacterCampaign:C,CharacterData:K,CharacterBattle:B}=W,rows=[];
// Only one physical Noa guard is replaced. All other preparation stays identical.
for(const preset of K.startingDecks)for(const seed of [7,37,63])for(const policy of ['attack','protect'])for(const enemy of [3,7,8,'boss'])for(const key of ['noa_guard','noa_shelter','noa_circle']){
 const c=new C.Campaign(),party=K.defaultParty();party[3].characterId='noa';c.meta.levels=[3,3,3,3];c.meta.extraProgress.noa.level=3;c.meta.settings.autoPolicy=policy;c.start(seed,W.SupportContent.template(preset.template,'noa'),null,party);if(key!=='noa_guard')Object.assign(c.run.pool.find(x=>x.key==='noa_guard'),{key,source:'reward'});
 delete c.run.bossRulesVersion;delete c.run.bossId;c.run.depth=enemy==='boss'?5:2;const node={type:enemy==='boss'?'boss':'battle',encounter:enemy,seed,depth:c.run.depth};c.createBattle(node);const b=c.battle;let coverAt=null,coverPosition=null;
 for(let i=0;i<10000&&!b.s.ended;i++){b.step(.02);const a=b.get('a3');if(coverAt===null&&a.purpose?.kind==='cover'){coverAt=b.s.t;coverPosition={x:a.x,y:a.y,target:a.purpose.target};}}
 assert(b.s.ended);assert(C.validBattleRecord(c.run.battleStart));rows.push({preset:preset.id,seed,policy,enemy,key,winner:b.s.winner,time:b.s.t,hp:b.alive(0).reduce((n,a)=>n+a.hp,0),noaHP:b.get('a3').hp,coverAt,coverPosition,firstKO:b.s.insights.firstKO,card:copy(b.s.insights.rows[key]||null),ultimates:copy(b.ultimateSummary()),stats:copy(b.s.stats)});
}
// Existing Serin branch: same boss, same deck, only representative mode changes.
const serin=[];for(const seed of [7,37,63])for(const mode of ['standard','guardDance']){
 const c=new C.Campaign();c.meta.levels=[3,3,3,3];c.start(seed,K.startingDecks[2].template);delete c.run.bossRulesVersion;delete c.run.bossId;c.run.signatureMode=mode;c.run.depth=5;c.createBattle({type:'boss',seed,depth:5});const b=c.battle;for(let i=0;i<10000&&!b.s.ended;i++)b.step(.02);assert(C.validBattleRecord(c.run.battleStart));serin.push({seed,mode,winner:b.s.winner,time:b.s.t,hp:b.alive(0).reduce((n,a)=>n+a.hp,0),covered:b.s.stats.covered,dance:copy(b.s.insights.rows.serin_dance||null),damage:b.s.stats.card[0],ultimates:copy(b.ultimateSummary()),killOrder:b.s.recap.events.filter(e=>e.kind==='ko').map(e=>e.target)});
}
const summary=['noa_guard','noa_shelter','noa_circle'].map(key=>{const a=rows.filter(x=>x.key===key);return {key,battles:a.length,wins:a.filter(x=>x.winner===0).length,casts:a.reduce((n,x)=>n+(x.card?.used||0),0),healed:a.reduce((n,x)=>n+(x.card?.healed||0),0),shared:a.reduce((n,x)=>n+(x.card?.shared||0),0)};});
const pairs=rows.filter(x=>x.key==='noa_shelter').map(a=>{const b=rows.find(x=>x.key==='noa_circle'&&['preset','seed','policy','enemy'].every(k=>x[k]===a[k]));return {...Object.fromEntries(['preset','seed','policy','enemy'].map(k=>[k,a[k]])),protection:a.winner===0,healing:b.winner===0,hpProtection:a.hp,hpHealing:b.hp,coverAt:a.coverAt};});
const contrasts={protectionOnly:pairs.filter(x=>x.protection&&!x.healing),healingOnly:pairs.filter(x=>x.healing&&!x.protection)};
assert(summary.find(x=>x.key==='noa_shelter').shared>0);assert(summary.find(x=>x.key==='noa_circle').healed>0);assert(contrasts.protectionOnly.length&&contrasts.healingOnly.length,'both builds must have observed favourable situations');
fs.writeFileSync(__dirname+'/noa-build-results.json',JSON.stringify({summary,contrasts,serin,rows},null,2));console.log(JSON.stringify({summary,contrasts,serin},null,2));
