import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const output = process.env.MOBILE_AUDIT_OUTPUT || 'artifacts/mobile-audit';
const port = Number(process.env.MOBILE_AUDIT_PORT || 5193);
await mkdir(output, { recursive: true });

const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();

let browser;
const report = { errors: [], viewports: [] };
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  for (const viewport of [
    { name: 'portrait', width: 390, height: 844 },
    { name: 'small-portrait', width: 360, height: 640 },
    { name: 'landscape', width: 844, height: 390 },
    { name: 'small-landscape', width: 667, height: 375 },
    { name: 'compact-landscape', width: 568, height: 320 },
  ].filter(viewport => !process.env.MOBILE_AUDIT_VIEWPORT || viewport.name === process.env.MOBILE_AUDIT_VIEWPORT)) {
    const context = await browser.newContext({
      viewport,
      screen: viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${viewport.name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(`${viewport.name}: ${message.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.locator('[data-action="start"]').evaluate(button => button.click());
    assert.equal(await page.locator('.toast').filter({ hasText: /Round \d/ }).count(), 0,
      `${viewport.name}: round announcement appears over the mobile arena`);
    const joystick = page.locator('[data-joystick]');
    await joystick.waitFor({ state: 'visible' });
    const box = await joystick.boundingBox();
    assert(box, `${viewport.name}: joystick has no bounds`);
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
      `${viewport.name}: joystick is outside the viewport`);
    await page.screenshot({ path: `${output}/${viewport.name}-playing.png` });

    const layout = await page.evaluate(() => {
      const bounds = selector => {
        const element = document.querySelector(selector);
        if (!element || element.getClientRects().length === 0) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        coarse: matchMedia('(pointer: coarse)').matches,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        arena: bounds('#arena'),
        joystick: bounds('.mobile-joystick'),
        playerSidebar: bounds('.player-sidebar'),
        actionPanel: bounds('.action-panel'),
        dash: bounds('.dash-hud'),
        shotControl: bounds('.shot-control'),
        shotInput: bounds('[data-shot-count]'),
        playerReserve: bounds('.reserve-panel--player'),
        dashRing: getComputedStyle(document.querySelector('.dash-hud')).backgroundImage,
        dashTextVisible: getComputedStyle(document.querySelector('.dash-hud__body')).display !== 'none',
        ammoIconVisible: getComputedStyle(document.querySelector('.shot-control__icon')).display !== 'none',
        shotWordsVisible: getComputedStyle(document.querySelector('.shot-control__heading > span:not(.shot-control__icon)')).display !== 'none',
      };
    });
    assert.equal(layout.coarse, true, `${viewport.name}: touch context did not expose a coarse pointer`);
    assert(layout.overflowX <= 0, `${viewport.name}: page overflows horizontally`);
    assert(!layout.playerSidebar && !layout.playerReserve, `${viewport.name}: build panels are visible`);
    assert(layout.arena && layout.dash && layout.shotControl && layout.shotInput, `${viewport.name}: mobile controls have no bounds`);
    assert(Math.abs(layout.dash.width - box.width) <= 2 && Math.abs(layout.dash.height - box.height) <= 2,
      `${viewport.name}: dash is not the same size as the joystick`);
    assert(layout.dashRing.includes('conic-gradient') && !layout.dashTextVisible,
      `${viewport.name}: dash ring or icon layout is missing`);
    if (viewport.height > viewport.width) {
      assert(layout.shotControl.x >= box.x + box.width + 4
        && layout.shotControl.x + layout.shotControl.width <= layout.dash.x - 4,
        `${viewport.name}: parts selector is not between movement and dash`);
      assert(layout.dash.y >= viewport.height * 0.7 && layout.shotControl.y >= viewport.height * 0.7,
        `${viewport.name}: controls cover the center of the arena`);
    } else {
      assert(layout.arena.width <= viewport.width - 112 && layout.dash.x >= layout.arena.x + layout.arena.width + 4,
        `${viewport.name}: arena does not leave a right-side space for dash`);
      assert(layout.shotControl.x >= layout.arena.x + layout.arena.width + 4
        && layout.shotControl.y >= 60
        && layout.shotControl.y + layout.shotControl.height <= layout.dash.y - 8,
      `${viewport.name}: parts selector overlaps the arena or dash`);
      assert(layout.shotInput.height > layout.shotInput.width * 1.8,
        `${viewport.name}: parts slider is not vertical`);
      assert(layout.ammoIconVisible && !layout.shotWordsVisible,
        `${viewport.name}: compact ammo icon did not replace the parts label`);
      const notice = await page.evaluate(() => {
        const stack = document.querySelector('.toast-stack');
        if (!stack) return null;
        const sample = document.createElement('div');
        sample.className = 'toast';
        sample.textContent = 'Round 1 · Every fighter for themselves';
        stack.append(sample);
        const { x, y, width, height } = sample.getBoundingClientRect();
        sample.remove();
        return { x, y, width, height };
      });
      assert(notice && notice.y + notice.height <= 64,
        `${viewport.name}: round notice covers the arena`);
    }

    const cdp = await context.newCDPSession(page);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const moved = { x: center.x + box.width * 0.34, y: center.y };
    const fire = { x: layout.arena.x + layout.arena.width * 0.5, y: layout.arena.y + layout.arena.height * 0.5 };
    const point = (id, position) => ({ x: position.x, y: position.y, id, radiusX: 8, radiusY: 8, force: 0.8 });
    const before = await page.evaluate(() => window.__arenaSnapshot);
    assert(before.camera.viewWidth < 130 && before.camera.viewHeight < 80,
      `${viewport.name}: camera still tries to show the whole arena`);
    assert(Math.abs(before.camera.x - before.player.x) < (viewport.width > viewport.height ? 15 : 5)
      && Math.abs(before.camera.z - before.player.z) < (viewport.width > viewport.height ? 15 : 5),
      `${viewport.name}: camera is not following the player`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(1, center)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(1, moved)] });
    await page.waitForTimeout(250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(1, moved), point(2, fire)] });
    await page.waitForTimeout(650);
    const during = await page.evaluate(() => window.__arenaSnapshot);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__arenaSnapshot);
    report.viewports.push({ viewport, layout, before, during, after });
    assert(during.player.x > before.player.x + 1, `${viewport.name}: joystick did not move the player right`);
    assert(during.stats.shots > before.stats.shots, `${viewport.name}: second touch did not fire while moving`);
    assert.deepEqual(after.input.touchMovement, { x: 0, z: 0 }, `${viewport.name}: joystick input did not reset after release`);
    assert.equal(after.input.firing, false, `${viewport.name}: firing input did not reset after release`);
    if (viewport.width > viewport.height) {
      const slider = layout.shotInput;
      const sliderBottom = { x: slider.x + slider.width / 2, y: slider.y + slider.height - 8 };
      const sliderTop = { x: sliderBottom.x, y: slider.y + 8 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(5, sliderBottom)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(5, sliderTop)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => window.__arenaSnapshot.shotCount > 1, null, { timeout: 5000 });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(3, center)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(3, moved)] });
    const dashCenter = { x: layout.dash.x + layout.dash.width / 2, y: layout.dash.y + layout.dash.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(3, moved), point(4, dashCenter)] });
    await page.waitForFunction(starts => window.__arenaSnapshot.fighters[0].dashStarts > starts,
      after.fighters[0].dashStarts, { timeout: 10000 });
    const afterDash = await page.evaluate(() => window.__arenaSnapshot);
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.dash-hud')).getPropertyValue('--dash-fill')) < 100,
      null, { timeout: 5000 });
    if (viewport.name === 'small-portrait') await page.screenshot({ path: `${output}/small-portrait-dash-cooldown.png` });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(afterDash.fighters[0].dashStarts > after.fighters[0].dashStarts,
      `${viewport.name}: second touch did not activate dash while moving`);
    if (after.phase === 'playing') {
      await page.locator('[data-action="pause"]').click();
      const modal = await page.locator('.pause-modal').boundingBox();
      assert(modal && modal.x >= 0 && modal.y >= 0 && modal.x + modal.width <= viewport.width && modal.y + modal.height <= viewport.height,
        `${viewport.name}: pause modal is outside the viewport`);
      const resume = await page.locator('[data-action="resume"]').boundingBox();
      assert(resume && resume.y >= modal.y && resume.y + resume.height <= modal.y + modal.height,
        `${viewport.name}: resume button is hidden inside the pause modal`);
      await page.screenshot({ path: `${output}/${viewport.name}-paused.png` });
      await page.locator('[data-action="resume"]').click();
      assert.equal(await page.locator('.game-ui').getAttribute('data-screen'), 'playing',
        `${viewport.name}: resume did not return to play`);
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
