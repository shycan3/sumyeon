'use strict';
const assert=require('assert');
const {chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
      const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await context.addInitScript(()=>{requestAnimationFrame=()=>1;crypto.getRandomValues=a=>{a[0]=1;return a;};});
      await page.goto('http://127.0.0.1:8765/character.html?v=layered-ai');
      await page.locator('[data-action="start"]').click();if(await page.locator('[data-action="starting-confirm"]').count()){await page.locator('[data-action="starting-custom"]').click();await page.locator('[data-action="starting-confirm"]').click();}await page.locator('[data-action="enter"]').first().click();
      const cardId=await page.evaluate(()=>{
        const b=characterGame.battle,deck=b.s.decks[0];b.setControl('manual');b.s.ready=true;b.s.paused=true;
        let card=deck.hand.find(c=>c.key==='serin_dash');
        if(!card){const area=['draw','discard'].find(k=>deck[k].some(c=>c.key==='serin_dash')),i=deck[area].findIndex(c=>c.key==='serin_dash');[deck.hand[0],deck[area][i]]=[deck[area][i],deck.hand[0]];card=deck.hand[0];}
        b.get('a1').purpose={kind:'cover',target:'a3',until:10,source:'serin_cover',controls:'movement'};b.get('a1').busy=1;b.select(card.id);characterGame.render();return card.id;
      });
      assert((await page.locator('#selected-detail').innerText()).includes('현재 엄호 종료'));
      assert(await page.locator('#confirm').isDisabled());assert((await page.locator('#hint').innerText()).includes('기술을 실행 중'));
      const before=await page.evaluate(()=>characterGame.battle.snapshot());await page.keyboard.press('Enter');
      assert.deepEqual(await page.evaluate(()=>characterGame.battle.snapshot()),before,'keyboard cannot bypass command rejection');
      assert((await page.locator('#toast').innerText()).includes('기술을 실행 중'));
      await page.evaluate(()=>{characterGame.battle.get('a1').busy=0;characterGame.render();});
      assert(!(await page.locator('#confirm').isDisabled()));await page.locator('#confirm').click();
      const accepted=await page.evaluate(()=>characterGame.battle.snapshot());assert(!accepted.actors.find(a=>a.id==='a1').purpose);
      assert.equal(accepted.history.filter(e=>e.type==='card'&&e.cardId===cardId).length,1);assert.equal(accepted.events.filter(e=>e.cardId===cardId).length,1);assert(!accepted.ready);
      await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>characterGame.battle.snapshot()),accepted,'same card command spends once');
      const saved=await page.evaluate(()=>{characterGame.battle.pause();characterGame.save();return characterGame.battle.snapshot();});await page.reload();assert.equal(await page.evaluate(()=>characterGame.battle.s.aiVersion),2);
      assert.deepEqual(await page.evaluate(()=>characterGame.battle.snapshot()),saved,'accepted casting event survives browser reload');
      await page.locator('[data-action="continue"]').click();await page.evaluate(()=>{const b=characterGame.battle;b.pause();b.s.enemyDue=1000;for(const a of b.s.actors){a.cool=1000;if(a.id!=='a1')a.busy=1000;}for(let i=0;i<20;i++)characterGame.step(.02);});
      assert.equal(await page.evaluate(()=>characterGame.battle.get('a1').purpose?.kind),'chase');
      assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));assert.deepEqual(errors,[]);
      await context.close();console.log(`PASS: ${viewport.width}x${viewport.height} purpose replacement preview, busy rejection/hint and keyboard atomicity, single acceptance, casting save/reload and chase continuation; browser errors 0`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
