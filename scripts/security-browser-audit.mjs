// Verify the actual production build in a disposable browser; never deploy.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from './security-policy.mjs';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const server = await preview({ configFile: 'vite.config.js', preview: { host: '127.0.0.1', port: 5196, strictPort: true } });
const origin = 'http://127.0.0.1:5196';
const observedSecuritySoftwareOrigin = 'http://gc.kis.v2.scr.kaspersky-labs.com';
const report = { passed: false, recordedAt: new Date().toISOString(), mode: 'production preview, headless Chrome with software WebGL, warm local filesystem, no network/CPU throttle', headers: {}, browserHeaders: {}, environmentDifferences: [], requests: [], normalErrors: [], normalViolations: [], blockedDirectives: [], fallback: {} };
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // Check the server directly as well: local security software can rewrite browser responses.
  const direct = await fetch(origin);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    report.headers[name] = direct.headers.get(name);
    assert.equal(report.headers[name], value, `${name} direct preview header`);
  }
  const directHtml = await direct.text();
  report.serverMetaPolicy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(directHtml)?.[1].replaceAll('&#39;', "'");
  assert.equal(report.serverMetaPolicy, CONTENT_SECURITY_POLICY, 'unmodified server CSP meta');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.__securityViolations = [];
    window.addEventListener('securitypolicyviolation', event => window.__securityViolations.push(event.effectiveDirective));
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = class extends OriginalAudioContext {
      constructor(...args) { super(...args); window.__securityAudioContext = this; }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.normalErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    report.requests.push({ path: url.origin === origin ? url.pathname : '[environment resource]', origin: url.origin === origin ? 'self' : url.origin, status: response.status(), sameOrigin: url.origin === origin });
  });
  const response = await page.goto(origin, { waitUntil: 'networkidle' });
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    report.browserHeaders[name] = response.headers()[name.toLowerCase()];
    if (report.browserHeaders[name] !== value) {
      assert.ok(name === 'Content-Security-Policy' && report.browserHeaders[name]?.includes(observedSecuritySoftwareOrigin), 'unexpected browser header change');
      report.environmentDifferences.push(`${name}: browser response differs from direct server response; observed local Kaspersky additions`);
    }
  }
  report.load = await page.evaluate(() => ({
    navigation: performance.getEntriesByType('navigation').map(entry => ({ duration: entry.duration, responseEnd: entry.responseEnd, domContentLoaded: entry.domContentLoadedEventEnd, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize })),
    paint: performance.getEntriesByType('paint').map(entry => ({ name: entry.name, startTime: entry.startTime })),
    resources: performance.getEntriesByType('resource').map(entry => { const url = new URL(entry.name); return { name: url.origin === location.origin ? url.pathname : `[environment resource from ${url.origin}]`, duration: entry.duration, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize }; }),
    policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
  }));
  report.browserPolicyMatchesServer = report.load.policy === CONTENT_SECURITY_POLICY && report.browserHeaders['Content-Security-Policy'] === SECURITY_HEADERS['Content-Security-Policy'];
  if (report.load.policy !== CONTENT_SECURITY_POLICY) {
    assert.ok(report.load.policy?.includes(observedSecuritySoftwareOrigin), 'unexpected browser meta policy change');
    report.environmentDifferences.push('CSP meta was also rewritten by local Kaspersky injection; the early meta does not preserve the exact original browser policy in this environment');
  }
  await page.locator('[data-action="start"]').click();
  await page.waitForFunction(() => document.querySelector('.game-ui')?.dataset.screen === 'playing' && window.__securityAudioContext?.state === 'running');
  assert.equal(await page.locator('#arena').evaluate(canvas => !!canvas.getContext('webgl2')), true, 'production WebGL context');
  assert.match(await page.locator('[data-clock]').textContent(), /^\d{2}:\d{2}$/, 'game clock renders');
  report.normalViolations = await page.evaluate(() => [...window.__securityViolations]);
  assert.deepEqual(report.normalErrors, [], 'normal application page errors');
  assert.deepEqual(report.normalViolations, [], 'normal application CSP violations');
  for (const path of ['/assets/audio/gunshot.wav', '/assets/audio/impact.ogg', '/assets/audio/debris.ogg']) assert.ok(report.requests.some(request => request.path === path && request.status === 200), `${path} loads`);
  report.environmentRequests = report.requests.filter(request => !request.sameOrigin);
  assert.ok(report.requests.filter(request => request.sameOrigin).every(request => request.status === 200), 'application resources succeed');
  assert.ok(report.environmentRequests.every(request => request.origin === observedSecuritySoftwareOrigin), 'no unexpected cross-origin response outside observed security software');

  await page.evaluate(() => {
    const inline = document.createElement('script');
    inline.textContent = 'window.__securityInlineRan = true';
    document.head.append(inline);
    const remote = document.createElement('script');
    remote.src = 'https://example.invalid/security-probe.js';
    document.head.append(remote);
    const image = document.createElement('img');
    image.src = 'https://example.invalid/security-probe.png';
    document.body.append(image);
  });
  await page.waitForFunction(() => window.__securityViolations.includes('script-src-elem') && window.__securityViolations.includes('img-src'));
  assert.equal(await page.evaluate(() => window.__securityInlineRan), undefined, 'inline script is blocked');
  report.blockedDirectives = await page.evaluate(() => [...window.__securityViolations]);
  await context.close();

  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    window.__fallbackViolations = [];
    window.addEventListener('securitypolicyviolation', event => window.__fallbackViolations.push(event.effectiveDirective));
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl' || type === 'webgl2' ? null : getContext.call(this, type, ...args);
    };
  });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto(origin, { waitUntil: 'networkidle' });
  await fallbackPage.getByRole('heading', { name: 'The 3D arena could not start' }).waitFor();
  report.fallback.className = await fallbackPage.locator('#app > section').getAttribute('class');
  assert.equal(report.fallback.className, 'webgl-error');
  await Promise.all([fallbackPage.waitForEvent('load'), fallbackPage.getByRole('button', { name: 'Try Again' }).click()]);
  await fallbackPage.getByRole('heading', { name: 'The 3D arena could not start' }).waitFor();
  report.fallback.retryReloaded = true;
  report.fallback.violations = await fallbackPage.evaluate(() => window.__fallbackViolations);
  assert.deepEqual(report.fallback.violations, [], 'fallback remains compatible with production CSP');
  await fallbackContext.close();
  report.passed = true;
  console.log(`Production application checks passed: local assets/audio/WebGL, direct server security headers, blocked probe scripts/images, WebGL fallback retry. Browser policy matches server: ${report.browserPolicyMatchesServer}. See report for environment differences.`);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  await mkdir('artifacts/security-audit', { recursive: true });
  await writeFile('artifacts/security-audit/browser.json', `${JSON.stringify(report, null, 2)}\n`);
}
