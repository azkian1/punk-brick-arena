import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_SECURITY_POLICY } from './security-policy.mjs';

const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['API secret', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['credential URL', /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/@:]+:[^\s/@]+@/i],
];
const privateName = /^(?:\.env(?:\.(?!example$).+)?|\.npmrc|.*\.(?:pem|key|p12|pfx))$/i;
const textExtensions = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.txt', '.yml', '.yaml', '.toml', '.svg', '']);
const excluded = new Set(['.git', 'node_modules', '.npm-cache', '.vite', 'artifacts', 'dist']);

export function secretTypes(text) {
  // Return category names only: never emit a matched value or surrounding line.
  return secretPatterns.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}

export function forbiddenPublishedPath(path) {
  const parts = path.replaceAll('\\', '/').split('/');
  return parts.some(part => privateName.test(part) || part.startsWith('.') || ['node_modules', 'src', 'scripts', 'prototypes', 'art', 'docs'].includes(part))
    || /\.(?:map|ts|tsx|log)$/i.test(path) || /^(?:package(?:-lock)?\.json|vite\.config\.|tsconfig\.json)/i.test(parts.at(-1));
}

export function hasLocalProductionEntry(html, base = '/') {
  const entry = /<script\b[^>]*src="([^"]+)"/i.exec(html)?.[1];
  const prefix = `${base}assets/`;
  return !!entry?.startsWith(prefix) && /^[A-Za-z0-9_-]+\.js$/.test(entry.slice(prefix.length));
}

async function inspectTree(root, production, findings) {
  let count = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!production && excluded.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      const label = relative(root, path).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) {
        if (production) findings.push(`${label}: symbolic link in publish output`);
        continue;
      }
      if (production && forbiddenPublishedPath(label)) findings.push(`${label}: forbidden publish path`);
      if (!production && privateName.test(entry.name)) findings.push(`${label}: possible credential file; review locally`);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.isFile() || !textExtensions.has(extname(entry.name))) continue;
      const bytes = await readFile(path);
      if (bytes.includes(0)) continue;
      count++;
      for (const kind of secretTypes(bytes.toString('utf8'))) findings.push(`${label}: possible ${kind}; review locally`);
    }
  }
  await walk(root);
  return count;
}

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const findings = [];
  const workingFiles = await inspectTree(root, false, findings);
  const dist = resolve(root, 'dist');
  const publishedFiles = await inspectTree(dist, true, findings);
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  const csp = /<meta\s+[^>]*http-equiv="Content-Security-Policy"[^>]*>/i.exec(html);
  const policy = csp && /content="([^"]*)"/i.exec(csp[0])?.[1].replaceAll('&#39;', "'");
  if (policy !== CONTENT_SECURITY_POLICY) findings.push('dist/index.html: expected production CSP missing or changed');
  if (csp && /<(?:script|link)\b/i.test(html.slice(0, csp.index))) findings.push('dist/index.html: CSP appears after a resource tag');
  if (/\bon\w+\s*=/i.test(html) || /<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html)) findings.push('dist/index.html: inline script or event handler');
  if (!/<meta\s+name="referrer"\s+content="no-referrer"/i.test(html)) findings.push('dist/index.html: no-referrer meta missing');
  if (!hasLocalProductionEntry(html, process.env.DEPLOY_BASE_PATH || '/')) findings.push('dist/index.html: expected local production entry missing');
  if (findings.length) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Security checks passed: ${workingFiles} working-tree text files and ${publishedFiles} production text files; no matched credential patterns or forbidden publish files; production CSP present.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => { console.error(`Security check failed: ${error.code ?? 'invalid build'}. Build with npm run build first.`); process.exitCode = 1; });
}
