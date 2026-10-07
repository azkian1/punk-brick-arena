import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const port = Number(process.env.MOBILE_PREVIEW_PORT || 5194);
const viewport = { width: 390, height: 780 };

const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port, strictPort: true, hmr: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();

let browser;
try {
  browser = await chromium.launch({
    headless: false,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--window-position=80,50', '--window-size=470,940'],
  });
  const context = await browser.newContext({
    viewport,
    screen: viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  process.stdout.write(`Mobile preview is open at http://127.0.0.1:${port}/\nClose the Chrome window to stop the preview.\n`);
  await new Promise((resolve) => browser.on('disconnected', resolve));
} finally {
  await browser?.close();
  await server.close();
}
