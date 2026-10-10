const assert=require('assert');
const {chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL='http://127.0.0.1:8765/';
async function advance(page,until){return page.evaluate(until=>{const battle=game.battle;let steps=0;while(battle&&!battle.s.ended&&!battle.s.paused&&battle.s.t<until&&steps++<24000)battle.step(.05);const state=battle?.snapshot();game.step(0);return state;},until);}
(async()=>{
  let browser;const errors=[];
  try{
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:950}});
    await context.addInitScript(()=>{crypto.getRandomValues=array=>{array[0]=1;return array;};});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(URL);await page.locator('[data-action="start"]').waitFor();assert.equal(await page.evaluate(()=>game.data.meta.settings.control),'manual');
    await page.locator('header [data-action="settings"]').click();assert.equal(await page.locator('#control').inputValue(),'manual');await page.locator('#control').selectOption('auto');assert.equal(await page.evaluate(()=>game.data.meta.settings.control),'auto');
    await page.locator('header button[data-action="home"]').click();await page.locator('[data-action="start"]').click();await page.locator('.map-layer.current [data-action="node"]').first().click();assert.equal(await page.locator('#control').inputValue(),'auto');await page.locator('[data-action="enter-battle"]').click();
    assert.equal(await page.evaluate(()=>game.state.control),'auto');assert.equal(await page.locator('#auto-toggle').getAttribute('aria-pressed'),'true');assert(await page.locator('#auto-info').isVisible());
    await page.locator('#intervene').click();let frozen=await page.evaluate(()=>({t:game.state.t,due:game.state.due,spent:game.state.stats.autoCards,ready:game.state.ready}));assert(!frozen.ready);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>game.state.t),frozen.t);assert(await page.locator('#resume-auto').isVisible());assert((await page.locator('#battle-status').textContent()).includes('직접 개입'));
    await page.locator('#resume-auto').click();assert.equal(await page.evaluate(()=>game.state.due),frozen.due);await advance(page,1);assert(!(await page.evaluate(()=>game.state.paused)));
    await page.locator('#auto-toggle').click();assert.equal(await page.evaluate(()=>game.state.control),'manual');assert.equal(await page.evaluate(()=>game.data.meta.settings.control),'manual');const ready=await advance(page,8);assert(ready.ready&&ready.paused);assert.equal(ready.stats.autoCards,0);
    const choice=await page.evaluate(()=>{const hand=game.state.decks[0].hand;return (hand.find(card=>GameCore.offense.includes(GameData.cards[card.key].kind))||hand[0]).id;});const before=await page.evaluate(()=>Object.values(game.state.stats.cards[0]).reduce((sum,n)=>sum+n,0));await page.locator(`#hand [data-action="pick"][data-id="${choice}"]`).click();await page.locator('#confirm').click();assert.equal(await page.evaluate(()=>Object.values(game.state.stats.cards[0]).reduce((sum,n)=>sum+n,0)),before+1);assert(!(await page.evaluate(()=>game.state.ready)));
    const due=await page.evaluate(()=>game.state.due);await page.locator('#auto-toggle').click();assert.equal(await page.evaluate(()=>game.state.control),'auto');assert.equal(await page.evaluate(()=>game.state.due),due);
    await page.locator('#intervene').click();await page.locator('header button[data-action="home"]').click();const saved=await page.evaluate(()=>game.campaign.snapshot());await page.reload();assert.equal(await page.evaluate(()=>game.data.meta.settings.control),'auto');assert.equal(await page.evaluate(()=>game.state.t),saved.run.battle.t);assert.equal(await page.evaluate(()=>game.state.control),'auto');assert(await page.evaluate(()=>game.state.intervening&&game.state.paused));await page.locator('[data-action="continue"]').click();assert(await page.locator('#resume-auto').isVisible());await page.locator('#resume-auto').click();
    const stances=await page.evaluate(()=>game.state.actors.filter(a=>a.side===0).map(a=>a.stance));const final=await advance(page,1200);assert(final.ended,'actual engine automatic decisions finish the fight');assert.equal(final.winner,0,'known fresh battle permits next-fight mode verification');assert(final.stats.autoCards>0);assert.deepEqual(final.actors.filter(a=>a.side===0).map(a=>a.stance),stances);assert.equal(final.stats.stanceChanges,0);assert.equal(final.stats.interventions,2);assert(final.stats.rerolls<=2);assert(final.autoLast?.reason);assert.equal(await page.evaluate(()=>game.data.run.stage),'battleResult');
    await page.locator('[data-action="open-reward"]').click();await page.locator('[data-action="reward"]').first().click();await page.locator('[data-action="complete-node"]').click();
    let nextFight=false;
    for(let attempts=0;attempts<10&&!nextFight;attempts++){
      const run=await page.evaluate(()=>game.data.run);assert(run);
      if(run.stage==='map'){
        const node=await page.evaluate(()=>{const nodes=GameCampaign.availableNodes(game.data.run);return nodes.find(n=>['battle','elite','boss'].includes(n.type))||nodes[0];});await page.locator(`[data-action="node"][data-id="${node.id}"]`).click();
        if(['battle','elite','boss'].includes(node.type)){assert.equal(await page.locator('#control').inputValue(),'auto');await page.locator('[data-action="enter-battle"]').click();nextFight=true;}
      }else if(run.stage==='upgrade')await page.locator('[data-action="skip-upgrade"]').click();
      else if(run.stage==='reward')await page.locator('[data-action="reward"]').first().click();
      else if(['loot','nodeDone'].includes(run.stage))await page.locator('[data-action="complete-node"]').click();
      else throw Error('Unexpected campaign stage '+run.stage);
    }
    assert(nextFight);assert.equal(await page.evaluate(()=>game.state.control),'auto');assert.equal(await page.locator('#auto-toggle').getAttribute('aria-pressed'),'true');const next=await advance(page,8);assert(!next.paused&&!next.intervening);assert(next.stats.autoCards>0);assert.deepEqual(errors,[]);
    console.log(`PASS: isolated browser auto preference/start, charging intervention/resume, manual card choice, unchanged cooldown, mode/intervention save-reload, ${final.stats.autoCards} real automatic commands to victory and next-fight mode persistence.`);
  }finally{if(browser)await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
