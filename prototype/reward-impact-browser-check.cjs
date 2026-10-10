'use strict';
const assert=require('assert'),{chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
  for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(()=>requestAnimationFrame=()=>1);
    await page.goto('http://127.0.0.1:8765/character.html?v=rewardcost1');
    const fixture=await page.evaluate(()=>{
      const c=characterGame.campaign;c.start(7,{guard:3,taunt:3,serin_parry:1,serin_dash:3,shot:3,heal:1,wave:3,bash:3});delete c.run.rewardRulesVersion;delete c.run.growthRulesVersion;delete c.run.growthChoices;
      c.enter(c.run.map[0][0].id);for(let i=0;i<10000&&!c.battle.s.ended;i++)c.battle.step(.02);c.observe();if(!c.run||!c.reward())throw Error('fixture battle failed');
      const parry=c.run.pool.find(x=>x.key==='serin_parry');parry.upgraded=true;characterGame.render();characterGame.save();
      return {parry:parry.id,heal:c.run.pool.find(x=>x.key==='heal').id,deck:[...c.run.deck],snapshot:JSON.stringify(c.snapshot()),save:localStorage.getItem(CharacterData.saveKey)};
    });
    await page.locator('[data-action=reward-preview][data-key=serin_chain]').click();
    await page.locator('#reward-out').selectOption(fixture.parry);
    const impact=await page.locator('.swap-impact').innerText();
    assert(impact.includes('진화된 받아치기 한 장'));assert(impact.includes('호위 1→0단계'));assert(impact.includes('자기 보호막'));assert(impact.includes('기본 행동·태세는 유지'));assert(impact.includes('실제 사용 횟수를 보장하지 않습니다'));
    assert((await page.locator('.swap-copy-table').innerText()).includes('5%→0%'));assert.equal(await page.locator('[data-impact-warning=evolution]').count(),1);
    assert.equal(await page.evaluate(()=>JSON.stringify(characterGame.campaign.snapshot())),fixture.snapshot);assert.equal(await page.evaluate(()=>localStorage.getItem(CharacterData.saveKey)),fixture.save);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'reward-out');
    await page.locator('#reward-out').selectOption(fixture.heal);
    const healing=await page.locator('.swap-impact').innerText();assert(healing.includes('단일 회복 카드가 없어집니다'));assert(!healing.includes('전체 회복 카드가 없어집니다'));assert.equal(await page.locator('[data-impact-warning=evolution]').count(),0);
    await page.locator('#reward-out').selectOption('');assert.equal(await page.locator('.swap-impact').count(),0);assert(await page.locator('[data-action=reward-apply]').isDisabled());
    await page.locator('#reward-out').selectOption(fixture.parry);
    const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,body:document.querySelector('.workspace-body').clientHeight,actions:[...document.querySelectorAll('.workspace-commit button')].map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};})}));
    assert(!geometry.overflow);assert(geometry.body>=90);for(const r of geometry.actions)assert(r.top>=0&&r.bottom<=viewport.height+1&&r.left>=0&&r.right<=viewport.width+1&&r.height>=44,JSON.stringify({viewport,r}));
    await page.locator('.swap-impact').scrollIntoViewIfNeeded();await page.screenshot({path:__dirname+'/reward-cost-'+viewport.width+'x'+viewport.height+'.png'});
    await page.locator('.swap-impact').screenshot({path:__dirname+'/reward-cost-panel-'+viewport.width+'.png'});
    await page.locator('[data-action=reward-apply]').click();
    const applied=await page.evaluate(id=>{const c=characterGame.campaign;CharacterCampaign.validate(c.snapshot());return {length:c.run.deck.length,outEquipped:c.run.deck.includes(id),reserved:c.reserve().find(x=>x.id===id),incoming:c.run.deck.includes(c.run.reward.cardId),escort:CardTraits.summary(c.run.deck.map(id=>c.run.pool.find(x=>x.id===id))).find(x=>x.id==='escort').level};},fixture.parry);
    assert.equal(applied.length,20);assert(!applied.outEquipped&&applied.incoming&&applied.reserved.upgraded);assert.equal(applied.escort,0);
    await page.locator('[data-action=undo-deck]').click();assert.deepEqual(await page.evaluate(()=>characterGame.campaign.run.deck),fixture.deck);
    // Acquired-card exchange uses exactly the same costs, cancellation and actual swap rules.
    await page.locator('.swap-candidate[data-copy-key=serin_parry] [data-action=swap]').click();assert((await page.locator('.swap-impact').innerText()).includes('진화된 받아치기 한 장'));assert((await page.locator('.swap-candidate[data-copy-key=serin_parry] .swap-cost-preview').innerText()).includes('진화 한 장 대기로'));
    const loot=await page.evaluate(()=>JSON.stringify(characterGame.campaign.snapshot()));
    await page.locator('[data-action=swap-cancel]').click();assert.equal(await page.locator('.swap-impact').count(),0);assert.equal(await page.evaluate(()=>JSON.stringify(characterGame.campaign.snapshot())),loot);
    await page.locator('.swap-candidate[data-copy-key=serin_parry] [data-action=swap]').click();await page.locator('[data-action=swap-confirm]').click();
    await page.reload();await page.locator('[data-action=continue]').click();assert((await page.locator('.reward-exchange').innerText()).includes('편성 완료'));assert(await page.evaluate(id=>characterGame.campaign.reserve().some(c=>c.id===id&&c.upgraded),fixture.parry));
    assert.deepEqual(errors,[]);console.log('PASS reward costs, immutable save/RNG preview, exact swap/undo/cancel/reload and fixed actions',viewport);await context.close();
  }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
