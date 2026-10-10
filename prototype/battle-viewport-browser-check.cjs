'use strict';

const assert = require('assert');
const { chromium } = require('C:/Users/DH/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const viewports = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 1920, height: 1080 }
];

async function fieldBounds(page, selector = '#field') {
  return page.locator(selector).evaluate(canvas => {
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

async function assertViewport(page, viewport, label, selector = '#field') {
  const bounds = await fieldBounds(page, selector);
  for (const [key, expected] of Object.entries({ x: 0, y: 0, width: viewport.width, height: viewport.height })) {
    assert(Math.abs(bounds[key] - expected) <= 1, `${label}: ${key} must fill viewport: ${JSON.stringify(bounds)}`);
  }
  const overflow = await page.evaluate(() => ({
    pageX: document.documentElement.scrollWidth - innerWidth,
    pageY: document.documentElement.scrollHeight - innerHeight,
    bodyX: document.body.scrollWidth - innerWidth,
    bodyY: document.body.scrollHeight - innerHeight
  }));
  assert(Object.values(overflow).every(n => n <= 1), `${label}: viewport overflow ${JSON.stringify(overflow)}`);
  return bounds;
}

async function assertProjection(page, label, selector = '#field', practice = false) {
  const projection = await page.evaluate(({ selector, practice }) => {
    const canvas = document.querySelector(selector), spectator = characterGame.spectator;
    const battle = practice ? characterGame.practice.battle : characterGame.battle;
    spectator.draw(canvas, battle, document.getElementById(practice ? 'practice-moment' : 'moment-banner'));
    const origin = spectator.projectPoint(canvas, 480, 195);
    const right = spectator.projectPoint(canvas, 580, 195);
    const down = spectator.projectPoint(canvas, 480, 295);
    const actorPoints = battle.s.actors.filter(a => a.hp > 0).map(a => ({
      id: a.id, ...spectator.projectPoint(canvas, a.x, a.y)
    }));
    const hazard = battle.hazard?.(), hazardPoints = [];
    if (hazard) {
      const { x, y } = hazard;
      if (hazard.shape === 'line') {
        const cosine = Math.cos(hazard.angle || 0), sine = Math.sin(hazard.angle || 0);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const dx = sx * hazard.length / 2, dy = sy * hazard.width / 2;
          hazardPoints.push(spectator.projectPoint(canvas, x + dx * cosine - dy * sine, y + dx * sine + dy * cosine));
        }
      } else {
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          hazardPoints.push(spectator.projectPoint(canvas, x + Math.cos(angle) * hazard.radius, y + Math.sin(angle) * hazard.radius));
        }
      }
    }
    const context = canvas.getContext('2d'), edgePixels = [];
    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1], [.5, 0], [.5, 1], [0, .5], [1, .5]]) {
      const px = Math.min(canvas.width - 1, Math.max(0, Math.round(fx * (canvas.width - 1))));
      const py = Math.min(canvas.height - 1, Math.max(0, Math.round(fy * (canvas.height - 1))));
      edgePixels.push([...context.getImageData(px, py, 1, 1).data]);
    }
    return { origin, right, down, actorPoints, hazardPoints, edgePixels, width: canvas.clientWidth, height: canvas.clientHeight };
  }, { selector, practice });
  const scaleX = (projection.right.x - projection.origin.x) / 100;
  const scaleY = (projection.down.y - projection.origin.y) / 100;
  assert(scaleX > 0 && Math.abs(scaleX - scaleY) < .0001, `${label}: sprites must retain uniform scale ${JSON.stringify({ scaleX, scaleY })}`);
  assert(Math.abs(projection.right.y - projection.origin.y) < .0001 && Math.abs(projection.down.x - projection.origin.x) < .0001, `${label}: projection axes must not rotate`);
  for (const point of projection.actorPoints) {
    assert(point.x >= 8 && point.x <= projection.width - 8 && point.y >= 8 && point.y <= projection.height - 8,
      `${label}: living actor clipped ${JSON.stringify(point)}`);
  }
  for (const point of projection.hazardPoints) {
    assert(point.x >= 0 && point.x <= projection.width && point.y >= 0 && point.y <= projection.height,
      `${label}: hazard clipped ${JSON.stringify(point)}`);
  }
  assert(projection.edgePixels.every(pixel => pixel[3] === 255 && pixel[0] + pixel[1] + pixel[2] > 10),
    `${label}: battlefield must paint opaque ground across all edges ${JSON.stringify(projection.edgePixels)}`);
  return { scale: scaleX, livingActors: projection.actorPoints.length, hazardPoints: projection.hazardPoints.length };
}

async function checkSkillStates(page, viewport, label) {
  const states = await page.evaluate(() => {
    const battle = characterGame.battle, director = characterGame.spectator.director;
    const canvas = document.getElementById('field'), slot = document.getElementById('moment-banner');
    const before = JSON.stringify(battle.snapshot()), rows = [];
    const measure = name => {
      characterGame.spectator.draw(canvas, battle, slot);
      const r = canvas.getBoundingClientRect(), s = slot.getBoundingClientRect();
      rows.push({ name, field: { x: r.x, y: r.y, width: r.width, height: r.height }, slot: { x: s.x, y: s.y, width: s.width, height: s.height } });
    };
    director.active = null; director.notice = null; director.viewKey = ''; measure('idle');
    const signature = Object.keys(GameData.cards).find(key => SkillPresentation.profile(key).tier === 'signature');
    const ultimate = Object.keys(GameData.cards).find(key => SkillPresentation.profile(key).tier === 'ultimate') ||
      Object.keys(window.UltimateData?.skills || {}).find(key => SkillPresentation.profile(key).tier === 'ultimate') || 'serin_dance';
    for (const mode of ['full', 'simple']) {
      director.mode = mode;
      for (const key of [...new Set([signature, ultimate])].filter(Boolean)) {
        const profile = SkillPresentation.profile(key);
        director.active = { actor: 'a1', key, at: battle.s.t, until: battle.s.t + 1.4, phase: '사용', profile,
          line: profile.line || '', showPortrait: true };
        director.notice = { at: battle.s.t, until: battle.s.t + 1.4, type: 'urgent-heal', label: '위기 회복', text: '동료 +30', color: '#a7e8bb' };
        director.viewKey = ''; measure(`${mode}:${key}:${profile.tier}`);
      }
    }
    director.active = null; director.notice = null; director.viewKey = ''; measure('idle-after');
    return { rows, pure: before === JSON.stringify(battle.snapshot()) };
  });
  assert(states.pure, `${label}: drawing skill states must not mutate the battle snapshot`);
  const baseline = states.rows[0].field;
  for (const state of states.rows) {
    assert.deepEqual(state.field, baseline, `${label}: skill ${state.name} shifts field bounds`);
    assert(state.slot.x >= -1 && state.slot.y >= -1 && state.slot.x + state.slot.width <= viewport.width + 1 &&
      state.slot.y + state.slot.height <= viewport.height + 1, `${label}: skill panel outside viewport ${JSON.stringify(state)}`);
  }
}

async function checkControls(page, viewport, label) {
  const before = await fieldBounds(page);
  const controls = await page.locator('.character-battle > .battle-watch').evaluate(row => {
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return [...row.children].filter(node => node.getBoundingClientRect().width > 0).map(node => ({ name: node.id || node.textContent.trim(), ...rect(node) }));
  });
  for (const control of controls) {
    assert(control.x >= 0 && control.y >= 0 && control.x + control.width <= viewport.width + 1 &&
      control.y + control.height <= viewport.height + 1, `${label}: watch control outside viewport ${JSON.stringify(control)}`);
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    assert(overlapX <= 1 || overlapY <= 1, `${label}: watch controls overlap ${JSON.stringify({ a, b })}`);
  }
  await page.locator('#watch-pause').click();
  assert(await page.evaluate(() => characterGame.state.paused), `${label}: pause click must pause`);
  await page.locator('#battle-speed').selectOption('2');
  assert.equal(await page.evaluate(() => characterGame.campaign.meta.settings.speed), 2, `${label}: speed must persist`);
  await page.locator('#watch-pause').click();
  assert(!await page.evaluate(() => characterGame.state.paused), `${label}: resume click must resume`);
  for (const selector of ['#watch-cards', '.watch-situation', '#battle-tools']) {
    const drawer = page.locator(selector);
    await drawer.locator(':scope > summary').click();
    assert(await drawer.evaluate(node => node.open), `${label}: ${selector} must open by click`);
    await assertViewport(page, viewport, `${label}: ${selector} open`);
    assert.deepEqual(await fieldBounds(page), before, `${label}: opening ${selector} must not resize field`);
    const close = drawer.locator('.watch-drawer-close');
    assert(await close.isVisible(), `${label}: ${selector} close must be visible`);
    const closeBounds = await close.boundingBox();
    assert(closeBounds.x >= 0 && closeBounds.y >= 0 && closeBounds.x + closeBounds.width <= viewport.width + 1 &&
      closeBounds.y + closeBounds.height <= viewport.height + 1, `${label}: ${selector} close must remain in viewport`);
    if (selector === '#watch-cards') assert(await drawer.locator('.hand-card').first().isVisible(), `${label}: hand contents must be visible`);
    if (selector === '.watch-situation') {
      await page.locator('#range-display').uncheck();
      assert.equal(await page.evaluate(() => characterGame.spectator.showRanges), false);
      await page.locator('#range-display').check();
    }
    if (selector === '#battle-tools') {
      await page.locator('#auto-toggle').click();
      assert.equal(await page.evaluate(() => characterGame.state.control), 'manual');
      assert.deepEqual(await fieldBounds(page), before, `${label}: manual toggle must not shift battlefield`);
    }
    await close.click();
    assert(!await drawer.evaluate(node => node.open), `${label}: ${selector} must close by click`);
    assert.deepEqual(await fieldBounds(page), before, `${label}: closing ${selector} must not resize field`);
  }
  assert.equal(await page.evaluate(() => characterGame.state.control), 'auto', `${label}: closing tools must restore auto`);
}

async function checkPractice(page, viewport, label) {
  await page.evaluate(() => {
    const battle = characterGame.battle;
    battle.s.paused = false;
    for (let i = 0; i < 10000 && !battle.s.ended; i++) battle.step(.02);
    characterGame.step(0);
  });
  await page.locator('[data-action="practice-open"]').first().click();
  assert(!await page.evaluate(() => document.body.classList.contains('battle-mode')), `${label}: practice setup should use normal layout`);
  await page.locator('[data-action="practice-start"]').click();
  await assertViewport(page, viewport, `${label}: practice`, '#practice-field');
  await assertProjection(page, `${label}: practice`, '#practice-field', true);
  await page.locator('[data-action="practice-pause"]').click();
  assert(await page.evaluate(() => characterGame.practice.battle.s.paused), `${label}: practice pause click must pause`);
  await page.locator('[data-action="practice-pause"]').click();
  await page.evaluate(() => {
    for (let i = 0; i < 10000 && !characterGame.practice.battle.s.ended; i++) characterGame.practiceStep(.02);
  });
  assert(!await page.evaluate(() => document.body.classList.contains('battle-mode')), `${label}: practice completion must restore normal layout`);
  assert(await page.locator('#practice-results').isVisible(), `${label}: practice results must remain accessible`);
  await page.locator('[data-action="practice-back"]').click();
}

async function checkBossHazard(page, viewport, label) {
  await page.evaluate(() => {
    const campaign = characterGame.campaign;
    campaign.finish(false, '전장 배율 검사');
    campaign.meta.levels = [5, 5, 5, 5];
    campaign.start(23);
    campaign.run.depth = 5;
    campaign.enter(campaign.run.map[5][0].id);
    const battle = campaign.battle;
    for (let i = 0; i < 600 && !battle.hazard() && !battle.s.ended; i++) battle.step(.02);
    if (!battle.hazard()) throw Error('boss fixture did not produce a hazard');
    characterGame.render();
  });
  await assertViewport(page, viewport, `${label}: boss hazard`);
  return assertProjection(page, `${label}: boss hazard`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  try {
    for (const route of ['character.html', 'support-lab.html']) {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
        const label = `${route} ${viewport.width}x${viewport.height}`;
        try {
        page.setDefaultTimeout(10000);
        page.on('pageerror', error => errors.push(error.message));
        await context.addInitScript(() => { requestAnimationFrame = () => 1; });
        await page.goto(`http://127.0.0.1:8765/${route}?v=battleviewport1`);
        await page.waitForFunction(() => window.characterGame, null, { polling: 100 });
        await page.evaluate(() => {
          const campaign = characterGame.campaign;
          campaign.start(7);
          campaign.enter(campaign.run.map[0][0].id);
          characterGame.render();
        });
        await assertViewport(page, viewport, label);
        const projection = await assertProjection(page, label);
        await checkSkillStates(page, viewport, label);
        await checkControls(page, viewport, label);
        await checkPractice(page, viewport, label);
        const boss = await checkBossHazard(page, viewport, label);
        await page.locator('.battle-heading [data-action="home"]').click();
        assert(!await page.evaluate(() => document.body.classList.contains('battle-mode')), `${label}: home must exit full-screen battle`);
        assert(await page.locator('.topbar').isVisible(), `${label}: home navigation must return`);
        if (route === 'support-lab.html') assert(await page.locator('.authoring-banner').isVisible(), `${label}: authoring banner must return`);
        assert.deepEqual(errors, [], `${label}: browser errors`);
        console.log(`PASS ${label}: full viewport, opaque edges, uniform scale ${projection.scale.toFixed(3)}, ${projection.livingActors} actors, skill purity, controls/drawers, practice, ${boss.hazardPoints} hazard outline points, home exit`);
        } catch (error) {
          failures.push(`${label}: ${error.message}`);
          console.error(`FAIL ${label}: ${error.message}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(failures, [], failures.join('\n'));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
