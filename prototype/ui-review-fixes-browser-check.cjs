'use strict';
const assert=require('assert'),fs=require('fs'),{chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch(),metrics=[];
 try{for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:768,height:1024},{width:360,height:640}]){
  const ctx=await browser.newContext({viewport}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>requestAnimationFrame=()=>1);await p.goto('http://127.0.0.1:8765/character.html?v=refineui2');
  await p.evaluate(()=>{const c=characterGame.campaign;c.start(7);c.run.pool.find(x=>x.key==='guard').upgraded=true;characterGame.render();});
  const original=await p.evaluate(()=>JSON.stringify(characterGame.campaign.snapshot()));
  await p.locator('[data-action=run-deck]').click();
  const guards=p.locator('[data-action=editor-select]').filter({has:p.locator('[data-card-key=guard]')});
  assert.equal(await guards.count(),2);assert(await guards.first().locator('[data-state=evolved]').isVisible());assert(await guards.last().locator('[data-state=normal]').isVisible());
  assert.notEqual(await guards.first().innerText(),await guards.last().innerText(),'variants have distinct visible labels');
  const escort=p.locator('.editor-trait-summary [data-trait=escort]');assert.equal(await escort.getAttribute('data-level'),'1');
  await guards.first().click();await p.locator('[data-edit=remove]').click();
  assert.equal(await escort.getAttribute('data-level'),'1','removing one duplicate/evolution does not remove a trait kind');
  await p.locator('[data-edit=add]').click();
  await p.locator('[data-action=editor-select]').filter({has:p.locator('[data-card-key=serin_parry]')}).click();
  await p.locator('[data-edit=remove]').click();assert.equal(await escort.getAttribute('data-level'),'0');assert((await escort.innerText()).includes('1→0단계'));assert((await escort.innerText()).includes('3→2종'));
  await p.locator('[data-edit=add]').click();assert.equal(await escort.getAttribute('data-level'),'1');
  await p.locator('[data-action=editor-select]').last().click();
  const before=await p.locator('.deck-selected .visual-card').evaluate(e=>{e.scrollTop=e.scrollHeight;return e.scrollTop;});
  await p.locator('[data-edit=remove]').click();
  const after=await p.locator('.deck-selected .visual-card').evaluate(e=>({scroll:e.scrollTop,max:e.scrollHeight-e.clientHeight}));
  assert(Math.abs(after.scroll-Math.min(before,after.max))<=1,'same-card quantity edit preserves detail scroll');
  await p.locator('[data-action=editor-select]').first().click();assert.equal(await p.locator('.deck-selected .visual-card').evaluate(e=>e.scrollTop),0,'new card starts from top');
  const m=await p.evaluate(()=>{const detail=document.querySelector('.deck-selected .visual-card').getBoundingClientRect(),bar=document.querySelector('.editor-trait-summary').getBoundingClientRect(),commit=document.querySelector('[data-action=commit]').getBoundingClientRect();return {detail:detail.height,bar:{top:bar.top,bottom:bar.bottom},commit:commit.bottom,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(m.detail>=60,JSON.stringify({viewport,m}));assert(m.bar.top>=0&&m.bar.bottom<=viewport.height&&m.commit<=viewport.height&&!m.overflow,JSON.stringify({viewport,m}));
  await p.screenshot({path:__dirname+'/refine2-editor-'+viewport.width+'.png'});metrics.push({viewport,...m});
  await p.locator('[data-action=editor-cancel]').click();assert.equal(await p.evaluate(()=>JSON.stringify(characterGame.campaign.snapshot())),original,'draft cancellation leaves run untouched');
  await p.locator('[data-action=enter]').first().click();
  for(const selector of ['.watch-situation','.battle-log-panel','#watch-cards','#battle-tools']){
   await p.locator(selector+'>summary').click();assert.equal(await p.locator('.watch-extras>details[open]').count(),1);assert(await p.locator(selector+' .watch-drawer-close').isVisible());
   await p.keyboard.press('Escape');assert.equal(await p.locator('.watch-extras>details[open]').count(),0);assert(await p.locator(selector+'>summary').evaluate(e=>e===document.activeElement));
  }
  await p.locator('.watch-situation>summary').click();await p.locator('.battle-log-panel>summary').focus();await p.keyboard.press('Space');
  assert.equal(await p.locator('.watch-extras>details[open]').count(),1);assert(await p.locator('.battle-log-panel').evaluate(e=>e.open));
  await p.locator('.battle-log-panel .watch-drawer-close').click();assert.equal(await p.locator('.watch-extras>details[open]').count(),0);
  await p.locator('#watch-pause').click();const paused=await p.evaluate(()=>characterGame.state.paused);assert(paused);
  await p.locator('#battle-tools>summary').click();await p.locator('#auto-toggle').click();assert.equal(await p.evaluate(()=>characterGame.state.control),'manual');
  if(!await p.evaluate(()=>characterGame.state.paused))await p.locator('#pause').click();
  await p.locator('.watch-situation>summary').focus();await p.keyboard.press('Space');
  assert.equal(await p.evaluate(()=>characterGame.state.control),'auto');assert.equal(await p.evaluate(()=>characterGame.state.paused),paused);
  await p.locator('#battle-speed').focus();await p.keyboard.press('Escape');assert.equal(await p.locator('.watch-extras>details[open]').count(),0,'Escape also works from a select');
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS review fixes',viewport,m);
 }
 fs.writeFileSync(__dirname+'/ui-review-fixes-browser-results.json',JSON.stringify(metrics,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
