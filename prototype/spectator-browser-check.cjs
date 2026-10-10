'use strict';
const assert=require('assert'),path=require('path');
const {chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
  for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>{requestAnimationFrame=()=>1;localStorage.setItem('afterglow-character-v2','saved expedition sentinel');localStorage.setItem('afterglow-expedition-v1','legacy sentinel');});
    await page.goto('http://127.0.0.1:8765/spectator.html');assert.equal(await page.locator('[data-preset]').count(),3);
    const saved=await page.evaluate(()=>({...localStorage}));await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>spectatorTrial.spectator.audio.state),'running');await page.locator('#sound').click();assert.equal(await page.evaluate(()=>spectatorTrial.spectator.audio.state),'suspended');
    for(const preset of ['base','chase','cover']){
      await page.locator('[data-preset="'+preset+'"]').click();await page.locator('#pause').click();const t=await page.evaluate(()=>spectatorTrial.battle.s.t);await page.evaluate(()=>spectatorTrial.step(.1));assert.equal(await page.evaluate(()=>spectatorTrial.battle.s.t),t);await page.locator('#pause').click();
      const snap=await page.evaluate(()=>{for(let i=0;i<2250&&!spectatorTrial.done;i++)spectatorTrial.step(.02);return spectatorTrial.battle.snapshot();});assert.equal(snap.winner,0);assert(snap.stats.signatureHits>0);if(preset==='chase')assert(snap.stats.chainHits>0);if(preset==='cover')assert(snap.stats.covered>0&&snap.stats.counters>0);assert((await page.locator('#trial-result').innerText()).includes('승리'));
      await page.locator('#restart').click();assert.equal(await page.evaluate(()=>spectatorTrial.battle.s.t),0);assert.equal(await page.locator('[data-preset="'+preset+'"]').getAttribute('aria-pressed'),'true');
    }
    await page.evaluate(()=>{for(let i=0;i<2250&&!spectatorTrial.done;i++){spectatorTrial.step(.02);if(spectatorTrial.battle.visuals.some(e=>e.kind==='signature-hit'&&e.index===3)){for(let j=0;j<5;j++)spectatorTrial.step(.02);break;}}});
    const before=await page.evaluate(()=>spectatorTrial.battle.snapshot());await page.evaluate(()=>{const {battle,spectator}=spectatorTrial;for(let i=0;i<20;i++)spectator.draw(document.getElementById('field'),battle);});assert.deepEqual(await page.evaluate(()=>spectatorTrial.battle.snapshot()),before,'painting cannot change combat');
    await page.screenshot({path:path.join(__dirname,'spectator-'+viewport.width+'.png'),fullPage:true});
    assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));const bounds=await page.locator('#field').boundingBox();assert(bounds.y>=0&&bounds.y+bounds.height<=viewport.height);assert.deepEqual(await page.evaluate(()=>({...localStorage})),saved,'comparison and sound do not modify expedition storage');assert.deepEqual(errors,[]);
    await page.reload();assert.equal(await page.evaluate(()=>spectatorTrial.battle.s.t),0);assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');await context.close();console.log('PASS: '+viewport.width+'x'+viewport.height+' three real trials, sound consent/on-off, freeze/restart, actual counters, renderer purity, storage isolation and canvas bounds; browser errors 0');
  }
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();await page.goto('http://127.0.0.1:8765/character.html');assert(await page.locator('a[href="spectator.html"]').isVisible());await page.locator('a[href="spectator.html"]').click();assert(await page.evaluate(()=>spectatorTrial.spectator.reduced));await context.close();console.log('PASS: main game comparison link and reduced-motion setting');
}finally{await browser.close();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
