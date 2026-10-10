'use strict';
// Review-only fixtures run in isolated contexts; they never read or change the user's save.
const fs = require('fs');
const { chromium } = require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch(), out = { editor: [], drawers: {}, moments: {} };
  try {
    for (const viewport of [{ width:1280,height:720 }, { width:390,height:844 }, { width:320,height:568 }]) {
      const ctx = await browser.newContext({ viewport }), p = await ctx.newPage();
      await ctx.addInitScript(() => requestAnimationFrame = () => 1);
      await p.goto('http://127.0.0.1:8765/character.html?v=refineui1-review');
      await p.evaluate(() => { const c=characterGame.campaign; c.start(7); c.run.pool.find(x=>x.key==='guard').upgraded=true; characterGame.render(); });
      await p.locator('[data-action=run-deck]').click();
      const variants = await p.locator('[data-action=editor-select]').filter({ has:p.locator('[data-card-key=guard]') }).evaluateAll(es => es.map(e=>({
        token:e.dataset.token, visibleText:e.innerText, evolutionBadge:e.querySelector('[data-state=evolved]') ? getComputedStyle(e.querySelector('.card-states')).display : null,
        rect:{width:e.clientWidth,height:e.clientHeight}
      })));
      await p.locator('[data-action=editor-select]').last().click();
      const scrollBefore = await p.evaluate(() => {
        const a=document.querySelector('.deck-selected .visual-card'),s=document.querySelector('.deck-selected'); a.scrollTop=a.scrollHeight;s.scrollTop=s.scrollHeight;
        return { article:{scroll:a.scrollTop,height:a.clientHeight,total:a.scrollHeight},outer:{scroll:s.scrollTop,height:s.clientHeight,total:s.scrollHeight} };
      });
      await p.locator('.deck-edit-actions [data-action=copy]').first().click();
      const scrollAfter = await p.evaluate(() => {
        const a=document.querySelector('.deck-selected .visual-card'),s=document.querySelector('.deck-selected');
        return { article:{scroll:a.scrollTop,height:a.clientHeight,total:a.scrollHeight},outer:{scroll:s.scrollTop,height:s.clientHeight,total:s.scrollHeight} };
      });
      out.editor.push({viewport,variants,scrollBefore,scrollAfter});
      await p.screenshot({path:__dirname+'/review-refine-editor-'+viewport.width+'.png'});
      await p.locator('[data-action=editor-cancel]').click();
      await p.locator('[data-action=enter]').first().click();
      if(viewport.width===1280) {
        await p.locator('.watch-situation>summary').click();
        await p.keyboard.press('Escape');
        out.drawers.situationAfterEscape=await p.locator('.watch-situation').evaluate(e=>e.open);
        await p.locator('.battle-log-panel>summary').focus();await p.keyboard.press('Space');
        out.drawers.multiple=await p.locator('.watch-extras>details').evaluateAll(es=>es.filter(e=>e.open).map(e=>({class:e.className,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,w:e.clientWidth,h:e.clientHeight}})));
        await p.keyboard.press('Escape');
        out.drawers.afterEscape=await p.locator('.watch-extras>details').evaluateAll(es=>es.filter(e=>e.open).map(e=>e.className));
        await p.screenshot({path:__dirname+'/review-refine-drawers.png'});
      }
      await ctx.close();
    }
    const ctx=await browser.newContext(),p=await ctx.newPage();
    await ctx.addInitScript(()=>requestAnimationFrame=()=>1);await p.goto('http://127.0.0.1:8765/character.html');
    out.moments=await p.evaluate(()=>{
      // Actual first battle, with a legitimate low-HP starting state, yields real ally KO events.
      const c=characterGame.campaign;c.start(1);c.run.hp=c.run.hp.map(()=>1);c.enter(c.run.map[0][0].id);
      for(let i=0;i<12000&&!c.battle.s.ended;i++)c.battle.step(.02);
      characterGame.step(0);const r=(c.run||c.meta.history[0]).results.at(-1);
      return {winner:r.winner,endReason:r.endReason,actors:r.actors,events:r.recap.events,display:ResultStory.moments(r,new Set()),panel:document.querySelector('.growth-story')?.innerText};
    });
    await p.screenshot({path:__dirname+'/review-refine-defeat.png'});await ctx.close();
    fs.writeFileSync(__dirname+'/refine-review-audit.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
