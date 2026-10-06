import assert from 'node:assert/strict';
// Run with node --test; keep this file outside Vitest's *.test discovery.
import test from 'node:test';
import { forbiddenPublishedPath, hasLocalProductionEntry, secretTypes } from './security-check.mjs';

test('credential checks detect representative secrets without returning their values', () => {
  const samples = [
    ['AWS access key', ['AK', 'IA', 'A'.repeat(16)].join('')],
    ['GitHub token', ['gh', 'p_', 'a'.repeat(36)].join('')],
    ['npm token', ['np', 'm_', 'a'.repeat(36)].join('')],
    ['API secret', ['s', 'k-proj-', 'a'.repeat(40)].join('')],
    ['private key', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
    ['credential URL', ['https://user', ':password', '@example.invalid'].join('')],
  ];
  for (const [kind, secret] of samples) {
    const found = secretTypes(`const value = "${secret}";`);
    assert.deepEqual(found, [kind]);
    assert.ok(!JSON.stringify(found).includes(secret));
  }
  assert.deepEqual(secretTypes('https://github.com/example/repo'), []);
});

test('publish checks reject credential and source files but permit game assets', () => {
  for (const path of ['.env', '.env.production', 'assets/private.pem', 'assets/index.js.map', 'npm-debug.log', 'src/main.ts', 'package-lock.json', '.git/config', 'scripts/dev.mjs']) assert.equal(forbiddenPublishedPath(path), true, path);
  for (const path of ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'assets/source/reference.png', 'assets/audio/impact.ogg', 'assets/ATTRIBUTION.txt']) assert.equal(forbiddenPublishedPath(path), false, path);
});

test('production entry must stay within the configured deployment base', () => {
  const html = path => `<script type="module" src="${path}"></script>`;
  assert.equal(hasLocalProductionEntry(html('/assets/index-abc.js')), true);
  assert.equal(hasLocalProductionEntry(html('/punk-brick-arena/assets/index-abc.js'), '/punk-brick-arena/'), true);
  for (const path of ['/assets/index-abc.js', 'https://example.invalid/assets/index.js', '//example.invalid/assets/index.js', '/punk-brick-arena/assets/../index.js']) {
    assert.equal(hasLocalProductionEntry(html(path), '/punk-brick-arena/'), false, path);
  }
});
