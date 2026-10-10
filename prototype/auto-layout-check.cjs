const assert=require('assert'),path=require('path');
const {chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function fits(page,viewport,selectors){
  const layout=await page.evaluate(selectors=>({overflow:document.documentElement.scrollWidth>innerWidth,scrollY,boxes:Object.fromEntries(selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return [selector,{visible:!e.hidden&&r.height>0,top:r.top,bottom:r.bottom,left:r.left,right:r.right}];}))}),selectors);
  assert(!layout.overflow,JSON.stringify({viewport,layout}));assert.equal(layout.scrollY,0);
  for(const [selector,box] of Object.entries(layout.boxes))assert(box.visible&&box.top>=0&&box.bottom<=viewport.height+1&&box.left>=0&&box.right<=viewport.width+1,selector+' must fit '+JSON.stringify({viewport,box}));
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
      const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      // Drive actual engine ticks explicitly so UI transitions are independent of frame timing.
      await context.addInitScript(()=>{requestAnimationFrame=()=>1;crypto.getRandomValues=a=>{a[0]=1;return a;};});
      await page.goto('http://127.0.0.1:8765/');await page.locator('[data-action="start"]').click();await page.locator('.map-layer.current [data-action="node"]:not([disabled])').first().click();await page.locator('[data-action="enter-battle"]').click();
      await page.locator('#auto-toggle').click();await page.evaluate(()=>{for(let i=0;i<120;i++)game.step(.05);});assert.equal(await page.evaluate(()=>game.state.stats.autoCards),1);
      const due=await page.evaluate(()=>game.state.due),common=['#field','#hand','#incoming','#auto-toggle','#auto-info'];
      await fits(page,viewport,[...common,'#intervene']);await page.screenshot({path:path.join(__dirname,viewport.width===390?'auto-mobile-preview.png':'auto-desktop-preview.png'),fullPage:true});
      await page.locator('#intervene').click();assert(!(await page.evaluate(()=>game.state.ready)));await fits(page,viewport,[...common,'#resume-auto']);const at=await page.evaluate(()=>game.state.t);await page.evaluate(()=>game.step(.1));assert.equal(await page.evaluate(()=>game.state.t),at);
      await page.keyboard.press('Escape');assert(!(await page.evaluate(()=>game.state.paused)));assert.equal(await page.evaluate(()=>game.state.due),due);
      await page.keyboard.press('Space');assert(await page.evaluate(()=>game.state.intervening&&game.state.paused));await page.keyboard.press('Space');assert(!(await page.evaluate(()=>game.state.paused)));
      await page.keyboard.press('a');assert.equal(await page.evaluate(()=>game.state.control),'manual');await page.evaluate(()=>{for(let i=0;i<200&&!game.state.ready;i++)game.step(.05);});assert(await page.evaluate(()=>game.state.ready&&game.state.paused));
      await page.keyboard.press('a');assert.equal(await page.evaluate(()=>game.state.control),'auto');await page.locator('#intervene').click();
      const card=await page.evaluate(()=>{const hand=game.state.decks[0].hand;return (hand.find(c=>GameCore.targeted(game.battle.definition(c))||GameCore.friendly.includes(game.battle.definition(c).kind))||hand[0]).id;});await page.locator('#hand [data-id="'+card+'"]').click();
      await fits(page,viewport,[...common,'#confirm','#reroll','#resume-auto']);await page.screenshot({path:path.join(__dirname,viewport.width===390?'auto-intervention-mobile-preview.png':'auto-intervention-desktop-preview.png'),fullPage:true});
      const before=await page.evaluate(()=>Object.values(game.state.stats.cards[0]).reduce((n,v)=>n+v,0));await page.locator('#confirm').click();assert(await page.evaluate(()=>game.state.control==='auto'&&!game.state.intervening&&!game.state.paused));assert.equal(await page.evaluate(()=>Object.values(game.state.stats.cards[0]).reduce((n,v)=>n+v,0)),before+1);
      assert.deepEqual(errors,[]);console.log('PASS: '+viewport.width+'x'+viewport.height+' auto/charging/READY intervention fit, A/Space/Esc, one manual command and automatic return');await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
