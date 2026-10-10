# Security audit

The original security review below is dated 2026-10-06 and describes that local working tree and static production output. The current **v2 Battle Royal patch** remains a single-player browser game: no application backend, account system, authentication endpoint, wallet connection, payment flow or database. Game state stays in memory. This documentation update did not deploy the game or repeat a live registry audit.

## Current v2 publication checks, 2026-10-10

After the final audit corrections, strict TypeScript/Vite build and `npm run security:check` pass all three guards and scan 140 working-tree text files / five production text files. No matched credential pattern or forbidden production path is reported. This count belongs to the recorded check before the present documentation edits. [Testing](TESTING.md) records the accepted final rule/browser results; [Development](DEVELOPMENT.md) describes current deployment and publication boundaries.

The dependency audit, browser policy probes, local security-software observation and smaller file/test counts below are preserved historical evidence. Their 2026-10-06 results do not establish today's npm advisory state or remotely hosted HTTP headers.

## Dependency findings and remediation

Live npm registry queries were completed after the sandbox initially blocked DNS access with `ENOTFOUND registry.npmjs.org`. The failed sandbox queries were not treated as successful audits.

Before the change, `npm audit --json` reported three affected package entries: one moderate and two critical. These are development dependencies, not packages shipped as browser services. `npm audit --omit=dev --json` reported zero advisories before remediation.

| Package | Before | After | Finding |
| --- | --- | --- | --- |
| `vitest` | 3.2.7 | 4.1.11 | Direct test runner affected through the mocker and worker pool |
| `@vitest/mocker` | 3.2.7 | 4.1.11 | Moderate arbitrary file read via redirect mocks, GHSA-82fw-gwwq-j7x9 |
| `tinypool` | 1.1.1 | Removed from installed dependency tree | Critical prototype-pollution gadgets, GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr |
| `vite` | 7.3.6 | 7.3.6 | Retained |
| `three` | 0.180.0 | 0.180.0 | Runtime dependency retained |
| `@types/node` | 24.19.1 | 24.19.1 | Retained |
| `@types/three` | 0.180.0 | 0.180.0 | Retained |
| `pngjs` | 7.0.0 | 7.0.0 | Retained |
| `tsx` | 4.23.15 | 4.23.15 | Retained |
| `typescript` | 5.9.3 | 5.9.3 | Retained |

The mocker advisory concerns development file serving and has reachability preconditions; this project does not import its standalone server plugin. The tinypool advisories require a prototype-pollution prerequisite. An exploitable application path for these issues was not demonstrated here. Their presence in the installed tooling was confirmed and removed.

The targeted `npm install --save-dev vitest@4.1.11 --cache .npm-cache` upgrade updates `package.json` and the lockfile. It uses the first patched maintained Vitest 4 version identified by the maintainer, rather than accepting npm's suggested Vitest 5 major automatically. Node.js 24.11.0 satisfies the inspected package engine requirement, and Vite 7 remains supported. No `npm audit fix --force` was used.

Fresh post-upgrade `npm audit --json --cache .npm-cache` and `npm audit --omit=dev --json --cache .npm-cache` both returned zero known advisories in every severity category. These are dated advisory-registry results, not a guarantee against unknown vulnerabilities or compromised package provenance. npm does not audit peer dependencies.

## Browser data and HTML

The runtime reads bundled character/evolution data and same-origin portrait and audio assets. Source review found no use of URL parameters, cookies, local/session storage, remote APIs, user uploads, `postMessage`, dynamic evaluation, or credentials in application browser code.

The UI creates its fixed layout with `innerHTML`. Character names, subtitles and IDs are escaped in initial markup; portraits come from a fixed catalog that rejects unknown IDs. Evolution IDs, names and descriptions now receive the same escaping before interpolation. Runtime labels use `textContent`; toasts use text nodes. SVG button icons are fixed markup. These changes harden a trusted bundled-data boundary; no current user-controlled XSS path was found.

External credit links are fixed HTTPS URLs and already use `target="_blank" rel="noopener noreferrer"`. A `no-referrer` document meta policy now covers other navigation as well. Application code does not automatically send links or data to external services during play. Local security software injected its own requests in the browser verification described below.

The WebGL error fallback uses a regular event listener for its retry action and a stylesheet class, so the production policy can reject inline script handlers without breaking retry. The game remains subject to normal browser limits: a player can modify their own in-memory state, and the client cannot enforce competitive integrity.

## Build and hosting boundaries

`vite.config.js` injects a CSP meta element before resource tags in production HTML. The policy allows same-origin scripts, styles, fonts, network requests and media, permits data images for the favicon, and blocks objects, frames, workers, form submissions and base-URL changes. It does not allow inline scripts or `unsafe-eval`. Source maps are explicitly disabled.

The development wrapper deliberately uses `configFile: false` and binds to `127.0.0.1:5173`; the production policy does not interfere with Vite's development HMR. The configured preview server also binds to loopback. Neither dev nor preview is a production server.

Local production preview supplies these response headers through `SECURITY_HEADERS` in `scripts/security-policy.mjs`:

```text
Content-Security-Policy: <the production policy>; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

No hosting provider configuration or deployed URL was found. A remote host must configure equivalent HTTP headers itself; Vite preview settings do not travel with `dist/`. In particular, CSP `frame-ancestors` is ignored in a meta element, so remote protection against framing is unverified. HTTPS, TLS settings, redirects, MIME types, CDN rules, caching and live response headers also remain unverified. Enable HSTS only at the actual HTTPS host with an appropriate domain policy.

Publish only the complete `dist/` directory. Publishing the repository root as the website would expose development files and is outside the reviewed output. The default build contains local portraits/audio, licenses, the HTML entry and bundled JavaScript/CSS; it does not include the prototype viewer or source tree.

Deployment follow-up: `.github/workflows/deploy.yml` now publishes `dist/` to GitHub Pages after tests, build, and publication checks. `DEPLOY_BASE_PATH` supports the `/punk-brick-arena/` project path, and the entry check rejects paths outside that prefix. The earlier remote-host findings above describe the original audit snapshot; the workflow does not install custom HTTP headers on GitHub Pages. The HTML CSP and referrer policy remain in the deployed build. GitHub Pages is configured to enforce HTTPS on its default domain.

## Credential and output checks

`.gitignore` now ignores `.env` variants except `.env.example`, as well as common private-key/certificate files. Ignoring a file does not remove it from an existing commit or prevent it being copied into `public/`.

After a fresh `npm run build`, run `npm run security:check`. It runs two Node guard tests and scans working-tree text files and production text output for selected high-confidence credential patterns. It emits category and file path only, never a matched value or surrounding text. The output check rejects hidden/credential paths, source maps, TypeScript, logs, development/source directories and package/config files in `dist/`, and verifies the early CSP, referrer policy, local module entry and absence of inline HTML handlers/scripts.

The working-tree scan excludes `.git`, dependencies, npm/Vite caches, `artifacts/` and `dist/`; production output is scanned separately. It scans supported text extensions, not binary asset contents. Source symlinks are skipped; production symlinks fail the check. No Git-history secret scan, external account scan, malware analysis or credential-validity check was performed. Pattern matching cannot rule out arbitrary secrets, encoded values, credentials in binary files, or secrets in excluded history/artifacts.

## Original security verification, 2026-10-06

- Live full and production-only dependency audits: zero advisories after remediation.
- Node guard tests: both passed; adversarial secret fixtures return categories without exposing values, and private/source publication paths are rejected.
- `npm run security:check`: passed after the original production build; 96 working-tree text files and five production text files scanned in that check. No matched credential pattern or forbidden output path was found. Later check counts are recorded above and in [Testing](TESTING.md).
- TypeScript check and Vite production build: passed on Node.js 24.11.0. The first sandbox build hit an `EPERM` realpath error; the required escalated retry succeeded.
- Production application browser check: passed with headless Chrome and software WebGL against freshly rebuilt `dist/`. The normal game had zero page errors and zero CSP violation events. All application assets returned 200, audio unlocked after the start gesture, and WebGL initialized. Injected inline/external script and external-image probes were blocked. Forced no-WebGL startup displayed the styled fallback and its retry action reloaded successfully without CSP violations.
- Direct loopback HTTP response: all configured security headers and the unmodified CSP meta matched the intended policy exactly.
- Browser policy integrity: unverified for the original policy in this local environment. Kaspersky rewrote both the browser-observed response header and the CSP meta, adding `http://gc.kis.v2.scr.kaspersky-labs.com` and its WebSocket origin; vendor-injected cross-origin requests were observed. The early CSP meta therefore did not preserve the exact original policy in this browser. The report retains both policies, records `browserPolicyMatchesServer: false`, and separates vendor requests from application resources. The application and limited blocking probes passed under this modified policy. No antivirus setting was changed and the source policy was not weakened.
- Browser sandbox attempt: `ERR_NETWORK_ACCESS_DENIED` prevented localhost navigation; the required escalated retry reached the preview and completed the checks.
- Final integrated gameplay/renderer suite: 199 tests in 14 files passed on Vitest 4.1.11, including a post-fix rerun. The final production build passed; see [Testing](TESTING.md) for the complete audit, timing context, and browser-fixture scope.

The production browser check can be repeated with `node scripts/security-browser-audit.mjs` after building. It uses an existing Playwright installation and Chrome executable; `PLAYWRIGHT_MODULE` and `CHROME_PATH` can override the local paths. It starts a temporary loopback preview on port 5196 and closes the browser and server after assertions. Its ignored JSON artifact is `artifacts/security-audit/browser.json`; failed runs also save partial results with `passed: false`. It verifies the actual build's local resources, audio unlock, WebGL, direct response headers, blocked probe scripts/images, and a forced no-WebGL fallback/retry. Browser header/meta discrepancies are explicit; unexpected discrepancies or cross-origin responses outside the observed local security-software origin fail assertions. The artifact also captures navigation/paint timings and resource transfer sizes from this localhost run with a warm filesystem and no network/CPU throttle. These figures are not a remote cold-network benchmark.

## Primary references

- [npm dependency auditing](https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/)
- [Vitest maintainer advisory: redirect mock file reads](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)
- [Tinypool maintainer advisory: worker options](https://github.com/tinylibs/tinypool/security/advisories/GHSA-5gmw-xhrv-c9v3)
- [Tinypool maintainer advisory: run options](https://github.com/tinylibs/tinypool/security/advisories/GHSA-85c8-ppgw-ccpr)
- [Vitest migration guide](https://vitest.dev/guide/migration/)
- [Vite 7 HTML plugin hooks](https://v7.vite.dev/guide/api-plugin)
- [CSP HTTP header and meta limitations](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
