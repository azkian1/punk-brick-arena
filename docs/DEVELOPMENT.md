# Development

See the [README](../README.md) for the shortest setup path and [Architecture](ARCHITECTURE.md) for code responsibilities.

This reference describes **v2 Battle Royal patch**, reviewed on 2026-10-09. The live browser entry point is a four-fighter battle; retained duel APIs serve compatibility tests. See [Release notes](RELEASE_NOTES.md) and [Testing](TESTING.md) for patch scope and accepted checks.

## Environment and installation

Use Node.js 22.12 or newer with npm. The locked Vite dependency declares `^20.19.0 || >=22.12.0`; this project's documented baseline is 22.12+. Validation on 2026-10-05 used Node.js 24.11.0 and npm 11.6.1 on Windows.

Run commands from the directory containing `package.json`:

```sh
npm ci
npm run dev
```

`npm ci` installs the included lockfile versions. Use `npm install` when intentionally changing dependencies and review the resulting lockfile changes. If a local npm cache is needed, use `npm ci --cache .npm-cache`; that directory is ignored.

Dependency installation may require registry access. After dependencies are available, the game build and character-generation pipeline use local files. There is no environment-variable setup, API key, database migration, or generator download step.

The locked tool versions after the 2026-10-06 security review are Three.js 0.180.0, TypeScript 5.9.3, Vite 7.3.6, Vitest 4.1.11, tsx 4.23.15, and pngjs 7.0.0. `package.json` specifies compatible ranges; `package-lock.json` records exact versions. See [Security audit](SECURITY_AUDIT.md) for the targeted test-runner upgrade and its verification.

## Commands and build behavior

| Command | Behavior |
| --- | --- |
| `npm run dev` | Runs `scripts/dev.mjs`; listens on `127.0.0.1:5173` with `strictPort: true` |
| `npm test` | Runs all Vitest tests once |
| `npm test -- --maxWorkers=2` | The accepted 446-test patch run; avoid concurrent GPU/browser audits |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | Runs the suite serially; useful when the long stress test times out during parallel execution |
| `npm test -- src/game/structure.test.ts` | Runs one test file while working on structural rules |
| `npm run build` | Runs `tsc --noEmit`, then the Vite production build |
| `npm run security:check` | Runs the security guard tests and scans the working tree and an existing fresh `dist/` build; run `npm run build` first |
| `npm run preview` | Serves the existing production build on loopback; use the URL printed by Vite |
| `npm run assets:generate` | Rewrites template JSON and diagnostics from the local roster images |
| `npx tsx scripts/generate-evolutions.ts` | Exports ten approved body blueprints and their authored color palettes to runtime JSON |
| `npm run test:mobile` | Checks actual touch movement/firing and release reset in both orientations |
| `node scripts/bot-squad-browser-audit.mjs` | Checks round alliances, role swaps, DASH, real volleys and native-map bot behavior |

The development wrapper sets `configFile: false` and disables dependency auto-discovery/prebundling with an empty include list. The project `vite.config.js` configures production builds and preview: it adds the production Content Security Policy and preview HTTP security headers. The wrapper deliberately does not load that config, so local development retains its own settings. Update the wrapper to change development options; CLI flags appended to `npm run dev` are not forwarded to Vite by the wrapper.

TypeScript targets ES2022 with strict checking, bundler module resolution, DOM libraries, and JSON imports. Its include scope is `src/`, including tests and vendored TypeScript. Files in `scripts/` and `artifacts/` are outside that type-check scope. Running the relevant script is necessary to verify those paths.

There are no configured lint, formatting, coverage, deployment, or CI scripts in this snapshot. Local browser audit scripts are documented in [Testing](TESTING.md); they require an existing Playwright installation and Chrome. `npm run build` does not run tests, the security scan, or asset generation.

## Configuration reference

All values below come from [src/game/config.ts](../src/game/config.ts). Times are simulation seconds; speeds and arena dimensions use world units unless stated otherwise. These are prototype settings, not final balance decisions.

| Key | Value | Meaning |
| --- | --- | --- |
| `arenaWidth`, `arenaDepth` | 160, 160 | Playable X/Z dimensions |
| `movementSpeed` | `15 * 1.15 * 1.15` = 19.8375 | Player target movement speed |
| `botSpeed` | `11.5 * 1.15 * 1.15` = 15.20875 | Base bot movement speed before behavior/evasion multipliers |
| `projectileSpeed` | 64 | Planar projectile speed |
| `shotInterval` | 0.23 | Player cooldown and minimum interval enforced for every runtime fighter |
| `botShotInterval` | 0.62 | Base Balanced interval before battle behavior and difficulty adjustment |
| `dashDuration` / `dashCooldown` | 0.18 / 2.4 | Dash duration and recharge in simulation seconds |
| `dashSpeedMultiplier` | 3.3 | Shared player/bot dash speed multiplier for the supplied movement speed |
| `victoryMinDuration` / `victoryPickupBatchSize` | 2.4 / 16 | Minimum reward time; separate per-step budgets for incoming loot attempts and reserve attachments |
| `projectilePower` | 10 | Retained legacy damage-fixture value; live volley damage uses actual spent-part count |
| `projectileSize` | 1.25 | Legacy visual/default collision fallback; live volleys use their packed real-part footprint |
| `pickupRadius` | 2.8 | Minimum collection radius |
| `pickupReach` | 0.75 | Margin added to scaled horizontal bounds |
| `pickupBatchSize` | 8 | Maximum pickups per actor per step; also the separate default reserve-assembly budget |
| `pickupDelay` | 0.8 | Minimum drop age; settled state is also required |
| `ownPickupDelay` | 5 | Last owner's minimum drop age |
| `cameraZoom` | 1.25 | Minimum combat framing factor; actual height and aspect ratio can expand the view |
| `coreProtectionLoss` | 0.6 | Loss fraction used to derive the fixed round-start threshold |
| `characterScale` | 0.5 | Local stud units to world scale during combat |
| `maxPieces` | 16,000 | Attached-piece ceiling per actor; evolved fighters can still bank loot; debris render buffers grow separately |

The combat slider requests 1–20 parts per shot, initially 1. It transfers actual reserve parts first, then safely removable non-Core body parts. Shortages produce smaller volleys; a bare Core without stock cannot fire. Damage is fixed to each volley's actual count when fired, so changing the slider does not change existing shots. The requested count persists across in-page restarts.

Some constants live elsewhere: `main.ts` defines a 60 Hz simulation, 0.1-second frame-delta clamp and 24 starting drops; `ui.ts` defines six roster entries per page; `render.ts` defines initial instance capacities, pixel-ratio limits and the 240-piece reserve sample. `EVOLUTION_THRESHOLD` in `evolution.ts` is 0.85. Body geometry and color palettes live in generated JSON. `rune.ts` uses a 30-combat-second spawn interval. `projectiles.ts` preserves fired inventory without a lifetime deletion, locks pickup for five seconds from firing, and rebounds within 1–33% of edge-to-center distance with speed bounded by the original shot. Search these modules before treating `CONFIG` as an exhaustive settings API.

World debris starts with a 1,024-instance render buffer and expands when needed; it does not impose a logical loot limit. Large buffers are released on round reset. Settled debris reuses unchanged transforms and colors, while moving or compacted entries update their affected buffer ranges.

### Evolution data and tuning

`src/game/evolution.ts` owns the five display names/descriptions, exact-dimension slot matching, repair priority, reserve retries, and the phase-3 threshold. The active phase-2 plan starts with only the chosen head; runtime export does not award donor stock or colored prototype parts. Changing a silhouette requires rebuilding its prototype and running `npx tsx scripts/generate-evolutions.ts`. Changing portraits uses the separate `assets:generate` command. See [Evolution and reserve](EVOLUTION.md) for the full pipeline.

Keep `revision` for attached geometry and `reserveRevision` for stock changes consistent. Cached frontiers, bounds, character instances, and side piles use them. Check both incoming pickup and stored-part assembly when changing capacity or batch settings. The 85% threshold is evaluated after victory collection/assembly, never during active combat; the same threshold is shown in the UI.

### Bot coordination and tuning

[bot-squad.ts](../src/game/bot-squad.ts) owns alliances and roles. [bots.ts](../src/game/bots.ts) owns `thinkBattleBot()` for the current runtime; the older duel decision API remains compatibility code and does not describe battle behavior.

| Round | Alliance and role policy |
| --- | --- |
| 1 | Four independent fighters |
| 2 | bot-1 and bot-2 ally and coordinate a hostile target; the player and bot-3 stay independent |
| 3 | All three bots ally against the player |
| 4+ | Two healthy attackers approach from different angles, while a collector gathers and grows |

At or below 65% of its attained attached-piece peak, a squad member enters recovery and a healthy collector can replace an attacker immediately. Recovery ends at 90%. Reserve is excluded from health, and role decisions never award parts or reset Core exposure. Round 2 shared targets have a three-second commitment, with local deferral of unreachable targets to prevent stalling. Hostility filters apply to target/threat selection and swept projectile impact; allied hits are also rejected at damage application.

`botForRound()` selects Balanced/easy for round 1, Balanced/medium for round 2, and an independently sampled full-strength style for each later bot. Repeated styles are allowed; styles are separate from alliance/role policy. The difficulty factors in `BOT_DIFFICULTIES` are:

| Difficulty | Movement multiplier | Shot-interval multiplier | Decision interval | Added aim spread | Aim-lead multiplier | Dodge probability per eligible detected threat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `easy` | 0.65 | 1.9 | 0.42 s | 4 | 0.2 | 0 |
| `medium` | 0.85 | 1.35 | 0.24 s | 1.8 | 0.65 | 0.55 |
| `normal` | 1 | 1 | 0.12 s | 0 | 1 | 1 |

Battle decisions combine vulnerability, target motion, exact surviving cover, pickup eligibility and real ammunition. Preparation ends after gaining four reserve parts, six net parts or six combat seconds. Collectors stay at an in-range pile until its eligible pickups finish; recovering fighters seek repair resources, and attackers can flank or clear obstructing cover. Styles and difficulty modify ordinary intervals, aim and movement; they do not grant resources or extra projectile damage.

From round 2, active enemy combat can fire at the player's 0.23-second interval when stocked, or with bounded safe body ammunition at health of at least 68% or a viable finishing opportunity. Collecting/recovering body fire does not receive this attack override. Actual execution always enforces the minimum cooldown. Bots choose 1–20 parts using hit confidence, resources, health and finishing chances; positive stock is not padded with body pieces to fill a requested group.

Each bot owns a real `DashState` and uses the shared movement function. AI requests require a ready cooldown and a full segment safe from cover/arena edges, accounting for threat lanes. Pause freezes recharge and duration; reset creates fresh states. `window.__arenaSnapshot.fighters` exposes team, role, intent, target, desired/actual volley count, shot count and independent dash state for QA. See [Architecture](ARCHITECTURE.md) for route caching and [Testing](TESTING.md) for fixtures and smoke-run limits.

## Production output and hosting

```sh
npm test
npm run build
npm run preview
```

Upload the complete contents of `dist/` to a static host, preserving relative file layout. Vite includes compiled JavaScript/CSS and copies `public/`, including portraits, audio, and `assets/ATTRIBUTION.txt`. No application backend is needed.

The live game is hosted at https://azkian1.github.io/punk-brick-arena/. The `.github/workflows/deploy.yml` workflow runs on pushes to `main` and can be started manually. It installs locked dependencies, runs tests, builds the game, checks publication output, and deploys only `dist/`. GitHub Pages must use **GitHub Actions** as its publishing source.

Vite reads `DEPLOY_BASE_PATH`, defaulting to `/`. Runtime portraits, audio, and the attribution link share `import.meta.env.BASE_URL` through `src/assets/url.ts`. The workflow gets the path from GitHub Pages metadata, so the build supports project paths and domain-root hosting. For a local Pages-equivalent check in PowerShell:

```powershell
$env:DEPLOY_BASE_PATH = '/punk-brick-arena/'
npm run build
npm run security:check
npm run preview
```

Open `http://127.0.0.1:4173/punk-brick-arena/`. Keep the same base for build, publication checks, and preview. Remove the environment variable to restore the default root build. The custom development server continues to serve at `/`.

The development and preview servers bind to `127.0.0.1`. They are local inspection tools. The custom development server has a fixed strict port and does not silently choose another port. The production HTML carries a Content Security Policy; preview additionally applies HTTP security headers. A static hosting provider must configure its own response headers, including `frame-ancestors`, which cannot be enforced by an HTML meta policy. See [Security audit](SECURITY_AUDIT.md) for the tested scope and hosting limitations.

The evolution integration build succeeds with a large-chunk warning: templates, ten body blueprints, and Three.js are imported into the application bundle, above Vite's 500 kB warning threshold. This is an output-size warning, not a TypeScript error or a measured runtime failure. The prototype viewer and local QA artifacts are not included in the default application build.

## Making changes

Change game rules in `src/game/` and exercise their existing tests. Keep structural revisions consistent: rendering and geometry caches use them to notice changes. If a change touches pickups, test both small fixtures and full generated characters.

Change roster content through the catalog, source PNGs, and generation pipeline. Do not hand-edit the generated template array as the primary workflow. See [Assets](ASSETS.md) for provenance and replacement requirements.

Change UI text in `ui.ts` and related runtime messages/metadata as needed. UI copy, accessibility labels, character subtitles, evolution names/descriptions, prototype text, and project documentation must be English with no Cyrillic characters. Use Body Form for phase 2 and Final Form for phase 3, including HUD, tooltips, and prototype captions. Keep button labels consistent: Next Round preserves the build and reserve; Start Over resets both. The code has no locale selector or translation dictionary. For UI work, manually check lobby scrolling, canvas reparenting, dialogs, focus, and resize behavior.

Control changes span the event handlers in `main.ts`, movement rules in `movement.ts`, and hints/HUD in `ui.ts`. Preserve the form-input and native button-key guards when adjusting shortcuts. Menu changes can also affect phase gating, modal focus, top-bar `inert`, and responsive rules in `style.css`; check playing, collecting, pause, victory, and defeat separately. UI fixtures must supply a real `#arena` canvas and all current update/result fields, including player build/evolution, dash, requested shot count and victory counters. Opponent stock/status and time/round/alive HUD counters are intentionally absent.

When rules, configuration, scripts, or assets change, update the corresponding documentation and run the checks appropriate to that change.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Node engine or tool startup error | Compare `node --version` with the documented baseline and reinstall locked dependencies |
| Port 5173 is already occupied | Stop the process you intended to replace, or deliberately change the port in `scripts/dev.mjs`; the wrapper uses a strict port |
| Opening `index.html` directly does not run the game | Use the dev server or build/preview commands; raw TypeScript is not a standalone `file://` application |
| WebGL error screen | Check browser WebGL support and hardware acceleration; the page includes a reload action |
| Silent combat | Start/resume with a user gesture, check mute, and inspect requests for the three local audio files |
| Missing portraits/audio on a hosted site | Check that asset requests include the configured `DEPLOY_BASE_PATH` and the complete `dist/` was uploaded |
| Fight pauses after changing tabs | This is intentional; resume after returning |
| P/Escape or another game shortcut does nothing while adjusting parts per shot | Form inputs bypass game shortcuts; leave the slider or use the Resume button |
| Space activates a menu control instead of dashing | Native button/link/settings keyboard handling takes priority; dash is available only during combat |
| No Next Round action after defeat | Expected: only a living winner can carry its construction forward |
| Collected pieces go to the pile without increasing body progress | Their exact dimensions may not fit a currently connected repair/body slot; stock is retained and retried as the build changes |
| Body progress drops after a Final Form unlock | Phase 3 has a larger target and reuses actual inventory; this does not grant a complete body or imply lost parts |
| A full body keeps collecting without getting larger | Phase 3 is the final silhouette; extra valid loot stays in reserve for repairs |
| Victory progress finishes below 100% | The meter counts pieces collected into body or reserve; only invalid loot is rejected. Evolution assembly can continue briefly after collection reaches 100% |
| Long round stress test exceeds 30 seconds | Retry with one worker using the command above; see [Testing](TESTING.md) for the recorded timeout and serial result |
| Asset tests fail after replacing a portrait | Update provenance and roster-specific expectations deliberately, regenerate, then rerun tests |
| Old local review page fails | `artifacts/` is ignored and may contain stale fixtures; use the current game and maintained tests |

No installation or setup changes were required for the documentation review because this workspace already had dependencies installed. See [Testing](TESTING.md) for the exact verification scope.
