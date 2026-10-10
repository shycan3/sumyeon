'use strict';
const fs=require('fs'),{chromium}=require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch(),out={};try{
 const ctx=await browser.newContext({viewport:{width:320,height:568}}),p=await ctx.newPage();await ctx.addInitScript(()=>requestAnimationFrame=()=>1);await p.goto('http://127.0.0.1:8765/character.html');
 await p.evaluate(()=>{const c=characterGame.campaign;c.start(7);c.enter(c.run.map[0][0].id);characterGame.render();});
 const field=()=>p.locator('#field').evaluate(e=>{const r=e.getBoundingClientRect();return {y:r.y,h:r.height};});
 out.drawer={closed:await field()};await p.locator('#watch-cards>summary').click();out.drawer.open=await field();await p.keyboard.press('Escape');out.drawer.after=await field();
 out.live=[];for(let i=0;i<20;i++){out.live.push(await p.evaluate(()=>{const r=document.querySelector('#field').getBoundingClientRect();return {t:characterGame.state.t,y:r.y,h:r.height,aiHeight:document.querySelector('#auto-info').clientHeight,threatHeight:document.querySelector('.threat-line').clientHeight,partyHeight:document.querySelector('#battle-party').clientHeight};}));await p.evaluate(()=>{for(let i=0;i<20&&characterGame.battle;i++)characterGame.step(.02);});}
 await p.locator('#battle-tools>summary').click();await p.locator('#auto-toggle').click();await p.evaluate(()=>{for(let i=0;i<400&&characterGame.battle&&!characterGame.state.ready;i++)characterGame.step(.02);});
 const attack=await p.evaluate(()=>characterGame.state.decks[0].hand.find(c=>['attack','execute','pierce','mark','slow'].includes(GameData.cards[c.key].kind))?.id);
 if(attack)await p.locator('#hand [data-action=card][data-id="'+attack+'"]').click();else await p.locator('#hand [data-action=card]').first().click();
 if(await p.locator('#target-list button').count()){await p.locator('#target-list button').first().focus();const before=await p.evaluate(()=>document.activeElement.dataset.id);await p.evaluate(()=>characterGame.step(.02));out.targetFocus={before,after:await p.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.dataset.id}))};}
 await p.keyboard.press('Escape');if(await p.evaluate(()=>characterGame.state.paused))await p.locator('#watch-pause').click();await p.evaluate(()=>{for(let i=0;i<12000&&characterGame.battle;i++)characterGame.step(.02);});
 await p.locator('[data-action=reward-open]').click();out.reward=await p.locator('.reward-planner').evaluate(e=>{e.scrollTop=e.scrollHeight;return {scroll:e.scrollTop,max:e.scrollHeight-e.clientHeight};});
 const next=await p.locator('[data-action=reward-preview]').last().getAttribute('data-key');await p.evaluate(key=>document.querySelector('[data-action=reward-preview][data-key="'+key+'"]').click(),next);out.reward.after=await p.locator('.reward-planner').evaluate(e=>e.scrollTop);
 await p.evaluate(()=>{characterGame.campaign.run.stage='result';characterGame.render();});await p.locator('[data-action=practice-open]').click();
 await p.locator('.status-summary>summary').click();out.practice={before:await p.locator('dialog').evaluate(e=>e.open)};
 await p.locator('dialog [data-action=practice-copy]').first().click();out.practice.after=await p.locator('dialog').evaluate(e=>e.open);
 if(await p.locator('dialog').evaluate(e=>e.open))await p.keyboard.press('Escape');
 // Return to a valid practice deck and inspect pause/speed controls.
 await p.locator('[data-action=practice-reset]').click();await p.locator('#practice-speed').selectOption('2');await p.locator('[data-action=practice-start]').click();out.practice.speedAfterStart=await p.locator('#practice-speed').inputValue();await p.locator('[data-action=practice-pause]').click();out.practice.pause={state:await p.evaluate(()=>characterGame.practice.battle.s.paused),label:await p.locator('[data-action=practice-pause]').innerText()};
 fs.writeFileSync(__dirname+'/'+(process.argv[2]||'comfort-audit-before.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));await ctx.close();
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
