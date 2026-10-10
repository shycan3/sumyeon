'use strict';
const assert=require('assert'),fs=require('fs'),{chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch(),results=[];
 try{for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:768,height:1024},{width:360,height:640}]){
  const ctx=await browser.newContext({viewport}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>requestAnimationFrame=()=>1);await p.goto('http://127.0.0.1:8765/character.html?v=stablewatch1');
  await p.evaluate(()=>{const c=characterGame.campaign;c.start(7);c.enter(c.run.map[0][0].id);characterGame.render();});
  const measurements=await p.evaluate(()=>{
   const b=characterGame.battle,d=characterGame.spectator.director,slot=document.querySelector('#moment-banner'),out=[];
   const measure=label=>{d.render(slot,b);const field=document.querySelector('#field').getBoundingClientRect(),r=slot.getBoundingClientRect();out.push({label,field:{x:field.x,y:field.y,width:field.width,height:field.height},slot:r.height,hpBottom:document.querySelector('#battle-party').getBoundingClientRect().bottom,children:[...slot.querySelectorAll('.skill-copy small,.skill-copy strong,.skill-dialogue,.skill-portrait,.skill-result')].map(e=>{const c=e.getBoundingClientRect();return {text:e.textContent,inside:c.top>=r.top-.5&&c.bottom<=r.bottom+.5};})});};
   const snapshot=JSON.stringify(b.snapshot());d.active=null;d.notice=null;measure('idle');
   for(const mode of ['full','simple']){d.mode=mode;for(const [key,card]of Object.entries(GameData.cards)){
    const profile=SkillPresentation.profile(key);d.active={actor:'a'+card.role,key,at:b.s.t,until:b.s.t+1.4,phase:'사용',profile,line:profile.line||'',showPortrait:profile.tier==='signature'};
    for(const notice of [null,{at:b.s.t,until:b.s.t+1.4,type:'urgent-heal',label:'위기 회복',text:'야전 의무관 +30',color:'#a7e8bb'}]){d.notice=notice;measure(mode+':'+key+(notice?':outcome':''));}
   }}
   d.active=null;d.notice={at:b.s.t,until:b.s.t+1.4,type:'ally-down',label:'전투불능',text:'지원 사수',color:'#efb1a0'};measure('outcome-only');d.notice=null;measure('idle-after');
   return {out,sameBattle:JSON.stringify(b.snapshot())===snapshot};
  });
  const baseline=measurements.out[0].field;
  for(const m of measurements.out){assert.deepEqual(m.field,baseline,'skill state must not change field bounds: '+JSON.stringify({viewport,m}));assert(m.children.every(c=>c.inside),'visible text/portrait bounds: '+JSON.stringify({viewport,m}));assert(m.hpBottom<=viewport.height);}
  assert(measurements.sameBattle,'presentation does not mutate combat');assert(baseline.height>=100);assert.deepEqual(errors,[]);
  await p.screenshot({path:__dirname+'/stablewatch-'+viewport.width+'.png'});results.push({viewport,field:baseline,slot:measurements.out[0].slot,states:measurements.out.length});await ctx.close();console.log('PASS stable skill layout',results.at(-1));
 }
 fs.writeFileSync(__dirname+'/stable-watch-browser-results.json',JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
