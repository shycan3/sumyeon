const assert=require('assert'),path=require('path');
const {chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:1280,height:950},{width:1280,height:720},{width:390,height:844}]){
      const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:8765/');await page.locator('[data-action="start"]').click();await page.locator('.map-layer.current [data-action="node"]:not([disabled])').first().click();await page.locator('[data-action="enter-battle"]').click();
      await page.evaluate(()=>{for(let i=0;i<110&&!game.state.ready;i++)game.step(.05);});
      await page.locator('#hand [data-action="pick"]').first().click();
      const targeted=await page.evaluate(()=>game.state.decks[0].hand.find(c=>GameCore.targeted(game.battle.definition(c))||GameCore.friendly.includes(game.battle.definition(c).kind))?.id);
      if(targeted){await page.locator('#hand [data-id="'+targeted+'"]').click();const target=page.locator('#target-list [data-action="target"]').last(),targetId=await target.getAttribute('data-id');await target.click();assert.equal(await page.evaluate(()=>game.state.target),targetId);}
      assert((await page.locator('#timing-line').innerText()).includes('카드 발동'));assert((await page.locator('#timing-line').innerText()).includes('공격 미정'));
      const layout=await page.evaluate(()=>{const bounds=selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right};};return {canvas:bounds('#field'),hand:bounds('#hand'),confirm:bounds('#confirm'),incoming:bounds('#incoming'),timing:bounds('#timing-line'),reroll:bounds('#reroll'),overflow:document.documentElement.scrollWidth>innerWidth,scrollY};});
      assert(!layout.overflow,JSON.stringify({viewport,layout}));assert.equal(layout.scrollY,0,'battle transition must reset map scrolling');
      for(const name of ['canvas','hand','confirm','incoming','timing','reroll'])assert(layout[name].top>=0&&layout[name].bottom<=viewport.height+1,name+' must fit '+JSON.stringify({viewport,layout}));
      await page.screenshot({path:path.join(__dirname,viewport.width===390?'battle-mobile-preview.png':'battle-'+viewport.height+'-preview.png'),fullPage:true});
      assert.deepEqual(errors,[]);console.log('PASS: '+viewport.width+'x'+viewport.height+' arena/hand/telegraph/confirmation visible together');await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
