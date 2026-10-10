const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL='http://127.0.0.1:8765/';
async function fight(page){
  return page.evaluate(()=>{
    const b=game.battle,G=window.GameCore;
    let steps=0;
    while(b&&!b.s.ended&&steps++<20000){
      if(b.s.paused){
        if(!b.s.ready){b.pause();continue;}
        const list=b.s.decks[0].hand.map(c=>{
          const d=b.definition(c),target=b.recommend(c),a=b.get(target),missing=b.alive(0).reduce((n,a)=>n+a.max-a.hp,0),incoming=b.s.events.filter(e=>e.side===1&&G.offense.includes(e.kind));let score=0;
          if(b.tacticalScore)return {c,score:b.tacticalScore(c,target)};
          if(G.offense.includes(d.kind)){score=(d.power||15)/d.time*(d.kind==='area'?b.alive(1).length:1);if(d.kind==='execute'&&a?.hp/a?.max<=.5)score*=2;if(b.s.guards[1].n&&b.s.guards[1].until>b.s.t)score*=.25;}
          if(d.kind==='heal'||d.kind==='cleanse')score=Math.min(d.power,a?.max-a?.hp||0)/d.time*1.8;
          if(['healAll','blessing'].includes(d.kind))score=Math.min(missing,d.power*b.alive(0).length)/d.time*1.8;
          if(d.kind==='guard')score=incoming.length?26:0;if(d.kind==='taunt')score=incoming.length?9:0;if(['armor','buff'].includes(d.kind))score=5;if(d.kind==='ward')score=a?.hp/a?.max<.6?8:2;return {c,score};
        }).sort((a,b)=>b.score-a.score);
        if(list[0]){b.select(list[0].c.id);b.confirm();}else b.wait();
      }else b.step(.05);
    }
    if(!b?.s.ended)throw Error('Browser battle stalled');const winner=b.s.winner;game.step(0);return winner;
  });
}
(async()=>{
  let browser;const errors=[];
  try{
    browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1280,height:950},acceptDownloads:true});
    await ctx.addInitScript(()=>{crypto.getRandomValues=a=>{a[0]=1;return a;};});
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
    await page.goto(URL);await page.locator('[data-action="start"]').waitFor();
    await page.locator('header [data-action="collection"]').click();assert.equal(await page.locator('.card').count(),20);
    await page.locator('header button[data-action="home"]').click();await page.locator('[data-action="edit-home"]').first().click();
    await page.locator('[data-action="deck-remove"][data-key="guard"]').click();assert(await page.locator('[data-action="commit-editor"]').isDisabled());
    await page.locator('[data-action="deck-add"][data-key="ward"]').click();assert(!(await page.locator('[data-action="commit-editor"]').isDisabled()));await page.locator('[data-action="commit-editor"]').click();
    assert.equal(await page.evaluate(()=>game.data.meta.deck.length),20);
    await page.locator('header [data-action="settings"]').click();await page.locator('#timing').selectOption('classic');await page.locator('#speed').selectOption('2');
    assert.equal(await page.evaluate(()=>game.data.meta.settings.timing),'classic');await page.locator('#timing').selectOption('mixed');
    await page.locator('header button[data-action="home"]').click();await page.locator('[data-action="start"]').click();assert.equal(await page.locator('.map-layer').count(),10);
    await page.screenshot({path:path.join(__dirname,'map-preview.png'),fullPage:true});
    await page.locator('.map-layer.current [data-action="node"]').first().click();assert(await page.locator('[data-action="enter-battle"]').isVisible());assert.equal(await page.evaluate(()=>game.battle),null);await page.locator('[data-action="starting-stance"][data-role="3"]').click();assert.equal(await page.evaluate(()=>game.data.run.stances[3]),1);await page.screenshot({path:path.join(__dirname,'briefing-preview.png'),fullPage:true});await page.locator('[data-action="home"]').last().click();await page.reload();await page.locator('[data-action="continue"]').click();assert(await page.locator('[data-action="enter-battle"]').isVisible());assert.equal(await page.evaluate(()=>game.data.run.stances[3]),1);await page.locator('[data-action="starting-stance"][data-role="3"]').click();await page.locator('[data-action="enter-battle"]').click();await page.waitForFunction(()=>game.state?.ready,{},{timeout:12000});
    const frozen=await page.evaluate(()=>game.state.t);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>game.state.t),frozen);
    await page.locator('#hand [data-action="pick"]').first().click();await page.locator('#reroll').click();assert.equal(await page.evaluate(()=>game.state.rerolls),1);
    await page.locator('#hand [data-action="pick"]').first().click();await page.locator('#reroll').click();assert.equal(await page.evaluate(()=>game.state.rerolls),0);
    await page.locator('#hand [data-action="pick"]').first().click();assert(await page.locator('#reroll').isDisabled());
    await page.locator('#stance-0').click();assert.equal(await page.evaluate(()=>game.battle.get('a0').stance),0);assert.equal(await page.evaluate(()=>game.battle.get('a0').nextStance),1);await page.locator('#stance-0').click();
    await page.screenshot({path:path.join(__dirname,'battle-preview.png'),fullPage:true});
    await page.locator('#wait').click();await page.waitForFunction(()=>game.state?.paused&&game.state.events.some(e=>e.side===1),{},{timeout:12000});
    await page.keyboard.press('1');assert((await page.locator('#timing-line').innerText()).includes('적 타격'));await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>game.state.ready),false);
    await page.locator('header button[data-action="home"]').click();const saved=await page.evaluate(()=>game.campaign.snapshot());await page.reload();
    assert.equal(await page.evaluate(()=>game.data.run.depth),saved.run.depth);assert.equal(await page.evaluate(()=>game.state.t),saved.run.battle.t);assert.equal(await page.evaluate(()=>game.state.rerolls),0);
    await page.locator('[data-action="continue"]').click();
    let encounters=0,upgrades=0,checkpoints=0,swapped=false,lockedPath=false;
    // One known legal route verifies the full UI flow; balance is compared separately.
    const routeColumns=[0,1,0,0,0,1,0,0,0,0];
    for(let loops=0;loops<100;loops++){
      const state=await page.evaluate(()=>({run:game.data.run,report:game.data.meta.lastReport}));if(!state.run){assert(state.report.success,'Full browser expedition must reach boss victory');break;}
      const r=state.run;
      if(r.stage==='battle'){assert.equal(await fight(page),0,JSON.stringify({depth:r.depth,encounter:r.current.encounter,room:r.current.type,hp:r.hp}));encounters++;}
      else if(r.stage==='elitePerk'){await page.locator('[data-action="elite-perk"][data-perk="recover"]').click();assert.equal(await page.evaluate(()=>game.data.run.elitePerk),'recover');}
      else if(r.stage==='battleResult')await page.locator('[data-action="open-reward"]').click();
      else if(r.stage==='reward'){
        const choices=r.reward.candidates,counts={};r.deck.forEach(id=>{const c=r.pool.find(c=>c.id===id);counts[c.key]=(counts[c.key]||0)+1;});
        const key=await page.evaluate(({choices,counts})=>choices.find(k=>(counts[k]||0)<GameData.cards[k].limit)||choices[0],{choices,counts});
        const savedChoices=JSON.stringify(choices);await page.locator('header button[data-action="home"]').click();await page.reload();assert.equal(await page.evaluate(()=>JSON.stringify(game.data.run.reward.candidates)),savedChoices);await page.locator('[data-action="continue"]').click();
        await page.locator(`[data-action="reward"][data-key="${key}"]`).click();
      }else if(r.stage==='loot'){
        if(!swapped){const newCard=r.pool.find(c=>c.id===r.reward.cardId),swap=page.locator('[data-action="swap-reward"]:not([disabled])').first(),outId=await swap.getAttribute('data-id');await page.screenshot({path:path.join(__dirname,'swap-preview.png'),fullPage:true});await swap.click();assert(await page.evaluate(id=>game.data.run.deck.includes(id),newCard.id));assert.equal(await page.evaluate(()=>game.data.run.deck.length),20);await page.locator('[data-action="undo-swap"]').click();assert(await page.evaluate(id=>game.data.run.deck.includes(id),outId));await page.locator(`[data-action="swap-reward"][data-id="${outId}"]`).click();await page.locator('header button[data-action="home"]').click();await page.reload();await page.locator('[data-action="continue"]').click();assert(await page.locator('[data-action="undo-swap"]').isVisible());swapped=true;}
        await page.locator('[data-action="complete-node"]').click();
      }else if(r.stage==='map'){
        if(r.depth===1){await page.locator('[data-action="journal"]').click();assert((await page.locator('#content').innerText()).includes('→'));await page.locator('[data-action="continue"]').click();}
        const nodes=await page.evaluate(()=>GameCampaign.availableNodes(game.data.run)),node=nodes.find(n=>n.col===routeColumns[r.depth]);assert(node,'planned route must be connected');
        if(await page.locator('.map-layer.current .node.locked').count())lockedPath=true;
        await page.locator(`[data-action="node"][data-id="${node.id}"]`).click();if(['battle','elite','boss'].includes(node.type))await page.locator('[data-action="enter-battle"]').click();if(node.type==='checkpoint')checkpoints++;
      }else if(r.stage==='upgrade'){await page.locator('[data-action="evolve"]').first().click();upgrades++;}
      else if(r.stage==='nodeDone')await page.locator('[data-action="complete-node"]').click();
      else throw Error('Unknown stage '+r.stage);
    }
    const final=await page.evaluate(()=>game.data.meta.lastReport);assert(final?.success);assert.equal(final.visited,10);assert.equal(checkpoints,2);assert(upgrades>0);assert(encounters>=3);assert(final.secured>0);assert(await page.evaluate(()=>game.data.meta.lastReport.visited===10));assert.equal(final.bonusKeys.length,1);assert(final.journal.some(e=>e.kind==='swap'));assert(final.results.every(r=>r.review));await page.locator('details summary').last().click();assert((await page.locator('#content').innerText()).includes('피해와 전투불능'));await page.screenshot({path:path.join(__dirname,'review-preview.png'),fullPage:true});
    await page.evaluate(()=>{game.data.meta.fragments=3;game.save();});await page.locator('header [data-action="collection"]').click();
    const exchange=page.locator('[data-action="exchange"]:not([disabled])').first(),exchangeKey=await exchange.getAttribute('data-key'),countBefore=await page.evaluate(key=>game.data.meta.owned.filter(c=>c.key===key).length,exchangeKey);
    await exchange.click();assert.equal(await page.evaluate(()=>game.data.meta.fragments),0);assert.equal(await page.evaluate(key=>game.data.meta.owned.filter(c=>c.key===key).length,exchangeKey),countBefore+1);
    await page.evaluate(()=>{game.data.meta.fragments=3;game.save();});await page.locator('header [data-action="collection"]').click();
    const opening=page.locator('[data-action="opening"]:not([disabled])').first(),openingKey=await opening.getAttribute('data-key');await opening.click();assert.equal(await page.evaluate(()=>game.data.meta.openingKey),openingKey);assert.equal(await page.evaluate(()=>game.data.meta.fragments),0);
    await page.locator('[data-action="opening-cancel"]').click();assert.equal(await page.evaluate(()=>game.data.meta.fragments),3);assert.equal(await page.evaluate(()=>game.data.meta.openingKey),null);
    await page.locator('header [data-action="settings"]').click();const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await downloadPromise;const savePath=path.join(__dirname,'test-save.json');await download.saveAs(savePath);const exported=JSON.parse(fs.readFileSync(savePath,'utf8'));assert(exported.meta.lastReport.success);
    await page.locator('[data-action="ask-reset"]').click();await page.locator('#modal [data-action="reset"]').click();assert.equal(await page.evaluate(()=>game.data.meta.attempts),0);
    await page.locator('header [data-action="settings"]').click();await page.locator('#import-file').setInputFiles(savePath);await page.locator('#modal button').first().click();assert.equal(await page.evaluate(()=>game.data.meta.lastReport.success),true);
    await page.locator('header [data-action="settings"]').click();await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});assert.equal(await page.evaluate(()=>game.data.meta.lastReport.success),true);assert(await page.locator('#modal').isHidden());
    await page.locator('header button[data-action="home"]').click();
    await page.waitForTimeout(3400);await page.screenshot({path:path.join(__dirname,'home-preview.png'),fullPage:true});
    const prepared=await browser.newContext(),pp=await prepared.newPage();pp.on('pageerror',e=>errors.push(e.message));await pp.goto(URL);
    await pp.evaluate(()=>{game.data.meta.fragments=3;game.save();});await pp.locator('header [data-action="collection"]').click();await pp.locator('[data-action="opening"][data-key="heavy"]').click();
    await pp.locator('header button[data-action="home"]').click();assert((await pp.locator('.journey-banner').innerText()).includes('강격'));await pp.locator('[data-action="start"]').click();await pp.locator('.map-layer.current [data-action="node"]').first().click();await pp.locator('[data-action="enter-battle"]').click();
    assert(await pp.evaluate(()=>game.state.decks[0].hand.some(c=>c.key==='heavy')));assert.equal(await pp.evaluate(()=>game.data.meta.openingKey),null);assert.equal(await pp.evaluate(()=>game.data.meta.fragments),0);await prepared.close();
    const mobile=await browser.newContext({viewport:{width:390,height:844}}),mp=await mobile.newPage();mp.on('pageerror',e=>errors.push(e.message));await mp.goto(URL);
    assert(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mp.locator('[data-action="edit-home"]').first().click();assert(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mp.screenshot({path:path.join(__dirname,'mobile-preview.png'),fullPage:true});await mp.locator('[data-action="cancel-editor"]').click();await mp.locator('[data-action="start"]').click();await mp.locator('.map-layer.current [data-action="node"]').first().click();assert(await mp.locator('[data-action="enter-battle"]').isVisible());assert(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mp.screenshot({path:path.join(__dirname,'briefing-mobile-preview.png'),fullPage:true});
    await mobile.close();assert.deepEqual(errors,[]);console.log(`PASS: real browser hub/deck/settings/combat/wait/redraw/save-reload/reward-swap/upgrade/checkpoints/boss/collection/export-import/mobile; ${encounters} actual combats, ${final.secured} secured cards.`);
  }finally{if(browser)await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});

