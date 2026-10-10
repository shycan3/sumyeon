'use strict';
const assert=require('assert'),fs=require('fs'),{chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch(),results=[];try{
 for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:768,height:1024},{width:360,height:640}]){
  const ctx=await browser.newContext({viewport}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await ctx.addInitScript(()=>requestAnimationFrame=()=>1);await p.goto('http://127.0.0.1:8765/character.html?v=comfort1');
  const rect=()=>p.locator('#field').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  for(const depth of [0,5]){
   await p.evaluate(depth=>{const c=characterGame.campaign;if(c.run)c.finish(false);c.meta.settings.control='auto';c.start(7);c.run.depth=depth;c.enter(c.run.map[depth][0].id);characterGame.render();},depth);
   const baseline=await rect();assert(baseline.h>=100,JSON.stringify({viewport,baseline}));
   for(const selector of ['#watch-cards','.watch-situation','.battle-log-panel','#battle-tools']){
    await p.locator(selector+'>summary').click();assert.deepEqual(await rect(),baseline,'disclosure must not resize arena');
    await p.locator(selector+'>summary').click();assert.equal(await p.locator('.watch-extras>details[open]').count(),0,'same disclosure button stays reachable to close');await p.locator(selector+'>summary').click();
    await p.keyboard.press('Escape');assert.deepEqual(await rect(),baseline);
   }
   const playback=await p.evaluate(()=>{const out=[];for(let i=0;i<1000&&characterGame.battle;i++){characterGame.step(.02);if(i%20===0&&characterGame.battle){const r=document.querySelector('#field').getBoundingClientRect(),hp=document.querySelector('#battle-party').getBoundingClientRect();out.push({t:characterGame.state.t,x:r.x,y:r.y,w:r.width,h:r.height,hp:hp.bottom});}}return out;});
   for(const m of playback){for(const k of ['x','y','w','h'])assert(Math.abs(m[k]-baseline[k])<.6,JSON.stringify({viewport,depth,baseline,m}));assert(m.hp<=viewport.height+.5);}
   results.push({viewport,depth,baseline,samples:playback.length});
  }
  // Keyboard selection and text reading must survive UI heartbeats while paused.
  await p.evaluate(()=>{const c=characterGame.campaign;if(c.run)c.finish(false);c.meta.settings.control='manual';c.start(7);c.enter(c.run.map[0][0].id);characterGame.render();for(let i=0;i<400&&!characterGame.state.ready;i++)characterGame.step(.02);});
  const attack=await p.evaluate(()=>characterGame.state.decks[0].hand.find(c=>GameData.cards[c.key].kind==='attack').id);await p.locator('#hand [data-id="'+attack+'"]').click();
  await p.locator('#target-list button').first().focus();const id=await p.locator('#target-list button').first().getAttribute('data-id');await p.evaluate(()=>characterGame.step(.02));assert.equal(await p.evaluate(()=>document.activeElement.dataset.id),id);
  await p.locator('#target-list button').first().click();assert.equal(await p.evaluate(()=>document.activeElement.dataset.id),id,'choosing a target preserves focus even when markup changes');
  const text=await p.evaluate(()=>{const node=document.querySelector('#selected-detail>span').firstChild,r=document.createRange();r.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(r);return getSelection().toString();});await p.evaluate(()=>characterGame.step(.02));assert.equal(await p.evaluate(()=>getSelection().toString()),text);
  const body=p.locator('#battle-tools .watch-drawer-body');await body.evaluate(e=>e.scrollTop=e.scrollHeight);const close=await p.locator('#battle-tools .watch-drawer-close').boundingBox(),popup=await body.boundingBox();assert(close.y>=popup.y&&close.y+close.height<=popup.y+popup.height,'close button stays visible at bottom of long popup');await p.keyboard.press('Escape');
  // Inspect a card that the actual auto policy will consume, using an isolated predictive copy.
  await p.evaluate(()=>{const c=characterGame.campaign;c.finish(false);c.meta.settings.control='auto';c.start(7);c.enter(c.run.map[0][0].id);characterGame.render();});
  const consumed=await p.evaluate(()=>{const original=characterGame.battle.s.decks[0].hand.map(c=>c.id),clone=new CharacterBattle({},characterGame.battle.snapshot());for(let i=0;i<1500&&!clone.s.ended;i++){clone.step(.02);const id=original.find(id=>!clone.s.decks[0].hand.some(c=>c.id===id));if(id)return id;}return null;});assert(consumed);
  await p.locator('#watch-cards>summary').click();await p.locator('#hand [data-id="'+consumed+'"]').click();const selected=await p.locator('#selected-detail [data-card-key]').getAttribute('data-card-key');
  await p.evaluate(id=>{for(let i=0;i<1500&&characterGame.battle&&characterGame.state.decks[0].hand.some(c=>c.id===id);i++)characterGame.step(.02);},consumed);assert.equal(await p.locator('#selected-detail [data-card-key]').getAttribute('data-card-key'),selected);assert(await p.locator('.inspection-note').isVisible());await p.keyboard.press('Escape');
  await p.evaluate(()=>{for(let i=0;i<12000&&characterGame.battle;i++)characterGame.step(.02);});
  await p.locator('[data-action=practice-open]').click();const original=await p.evaluate(()=>JSON.stringify(characterGame.campaign.snapshot()));
  // Both a direct desktop drawer and the compact status dialog remain open while editing.
  const drawer=p.locator('#practice-deck-details>summary');if(await drawer.isVisible())await drawer.click();else await p.locator('.status-summary>summary').click();
  const pool=p.locator('dialog [data-action=practice-copy]');await pool.last().scrollIntoViewIfNeeded();const lastId=await pool.last().getAttribute('data-id'),beforeScroll=await p.locator('.dialog-body').evaluate(e=>e.scrollTop);
  await pool.last().click();assert(await p.locator('dialog').evaluate(e=>e.open));assert.equal(await p.evaluate(()=>document.activeElement.dataset.id),lastId);assert(Math.abs(await p.locator('.dialog-body').evaluate(e=>e.scrollTop)-beforeScroll)<2);
  await p.locator('dialog [data-action=practice-copy][data-id="'+lastId+'"]').click();assert(await p.locator('dialog').evaluate(e=>e.open));assert.equal(await p.evaluate(()=>characterGame.practice.ids.length),20);await p.keyboard.press('Escape');
  await p.locator('#practice-speed').selectOption('2');await p.locator('[data-action=practice-start]').click();assert.equal(await p.locator('#practice-speed').inputValue(),'2');await p.locator('[data-action=practice-pause]').click();assert.equal(await p.locator('[data-action=practice-pause]').innerText(),'관전 재개');assert.equal(await p.locator('[data-action=practice-pause]').getAttribute('aria-pressed'),'true');await p.locator('[data-action=practice-pause]').click();assert.equal(await p.locator('[data-action=practice-pause]').innerText(),'관전 일시정지');
  await p.evaluate(()=>{for(let i=0;i<12000&&!characterGame.practice.battle.s.ended;i++)characterGame.practiceStep(.02);});assert.equal(await p.locator('#practice-speed').inputValue(),'2');assert.equal(await p.evaluate(()=>JSON.stringify(characterGame.campaign.snapshot())),original,'practice UI does not alter the expedition');assert.deepEqual(errors,[]);
  await p.screenshot({path:__dirname+'/comfort-practice-'+viewport.width+'.png'});await ctx.close();console.log('PASS comfort detail flows',viewport);
 }
 fs.writeFileSync(__dirname+'/comfort-browser-results.json',JSON.stringify(results,null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
