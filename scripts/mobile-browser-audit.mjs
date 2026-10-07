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

  for (const viewport of [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
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
    await page.locator('[data-action="start"]').click();
    const joystick = page.locator('[data-joystick]');
    await joystick.waitFor({ state: 'visible' });
    const box = await joystick.boundingBox();
    assert(box, `${viewport.name}: joystick has no bounds`);
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
      `${viewport.name}: joystick is outside the viewport`);

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
        joystick: bounds('.mobile-joystick'),
        playerHud: bounds('.fighter--you'),
        enemyHud: bounds('.fighter--enemy'),
        playerReserve: bounds('.reserve-panel--player'),
        enemyReserve: bounds('.reserve-panel--enemy'),
      };
    });
    assert.equal(layout.coarse, true, `${viewport.name}: touch context did not expose a coarse pointer`);
    assert(layout.overflowX <= 0, `${viewport.name}: page overflows horizontally`);

    const cdp = await context.newCDPSession(page);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const moved = { x: center.x + box.width * 0.34, y: center.y };
    const fire = { x: viewport.width * 0.78, y: viewport.height * 0.64 };
    const point = (id, position) => ({ x: position.x, y: position.y, id, radiusX: 8, radiusY: 8, force: 0.8 });
    const before = await page.evaluate(() => window.__arenaSnapshot);
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
    await page.screenshot({ path: `${output}/${viewport.name}.png` });
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
