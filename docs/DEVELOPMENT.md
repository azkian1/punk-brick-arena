# Development

See the [README](../README.md) for the shortest setup path and [Architecture](ARCHITECTURE.md) for code responsibilities.

## Environment and installation

Use Node.js 22.12 or newer with npm. The locked Vite dependency declares `^20.19.0 || >=22.12.0`; this project's documented baseline is 22.12+. Validation on 2026-10-05 used Node.js 24.11.0 and npm 11.6.1 on Windows.

Run commands from the directory containing `package.json`:

```sh
npm ci
npm run dev
```

`npm ci` installs the included lockfile versions. Use `npm install` when intentionally changing dependencies and review the resulting lockfile changes. If a local npm cache is needed, use `npm ci --cache .npm-cache`; that directory is ignored.

Dependency installation may require registry access. After dependencies are available, the game build and character-generation pipeline use local files. There is no environment-variable setup, API key, database migration, or generator download step.

The locked tool versions at this review are Three.js 0.180.0, TypeScript 5.9.3, Vite 7.3.6, Vitest 3.2.7, tsx 4.23.15, and pngjs 7.0.0. `package.json` specifies compatible ranges; `package-lock.json` records exact versions.

## Commands and build behavior

| Command | Behavior |
| --- | --- |
| `npm run dev` | Runs `scripts/dev.mjs`; listens on `127.0.0.1:5173` with `strictPort: true` |
| `npm test` | Runs all Vitest tests once |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | Runs the suite serially; useful when the long stress test times out during parallel execution |
| `npm test -- src/game/structure.test.ts` | Runs one test file while working on structural rules |
| `npm run build` | Runs `tsc --noEmit`, then the Vite production build |
| `npm run preview` | Serves the existing production build on loopback; use the URL printed by Vite |
| `npm run assets:generate` | Rewrites template JSON and diagnostics from the local roster images |

The development wrapper sets `configFile: false` and disables dependency auto-discovery/prebundling with an empty include list. There is no project Vite configuration file. Adding a Vite config alone will not change this development server's options; update the wrapper when needed. CLI flags appended to `npm run dev` are not forwarded to Vite by the wrapper.

TypeScript targets ES2022 with strict checking, bundler module resolution, DOM libraries, and JSON imports. Its include scope is `src/`, including tests and vendored TypeScript. Files in `scripts/` and `artifacts/` are outside that type-check scope. Running the relevant script is necessary to verify those paths.

There are no configured lint, formatting, coverage, browser-test, deployment, or CI scripts in this snapshot. `npm run build` does not run tests or regenerate assets.

## Configuration reference

All values below come from [src/game/config.ts](../src/game/config.ts). Times are simulation seconds; speeds and arena dimensions use world units unless stated otherwise. These are prototype settings, not final balance decisions.

| Key | Value | Meaning |
| --- | --- | --- |
| `arenaWidth`, `arenaDepth` | 72.5, 72.5 | Playable X/Z dimensions |
| `movementSpeed` | `15 * 1.15` = 17.25 | Player target movement speed |
| `botSpeed` | `11.5 * 1.15` = 13.225 | Base bot movement speed before behavior/evasion multipliers |
| `projectileSpeed` | 64 | Planar projectile speed |
| `shotInterval` | 0.23 | Player firing cooldown |
| `botShotInterval` | 0.62 | Base Balanced and non-panic Sniper firing interval, before difficulty multiplication |
| `dashDuration` / `dashCooldown` | 0.18 / 2.4 | Dash duration and recharge in simulation seconds |
| `dashSpeedMultiplier` | 3.3 | Dash speed relative to normal player movement |
| `victoryMinDuration` / `victoryPickupBatchSize` | 2.4 / 16 | Minimum reward animation time and maximum placement attempts per step |
| `projectilePower` | 10 | Initial direct-removal power for both fighters |
| `projectileSize` | 1.25 | Projectile visual scale and planar collision diameter |
| `pickupRadius` | 2.8 | Minimum collection radius |
| `pickupReach` | 0.75 | Margin added to scaled horizontal bounds |
| `pickupBatchSize` | 8 | Maximum successful pickups per actor per simulation step |
| `pickupDelay` | 0.8 | Minimum drop age; settled state is also required |
| `ownPickupDelay` | 5 | Last owner's minimum drop age |
| `cameraZoom` | 1.25 | Combat camera framing factor, constrained by aspect ratio |
| `coreProtectionLoss` | 0.6 | Loss fraction used to derive the fixed round-start threshold |
| `characterScale` | 0.5 | Local stud units to world scale during combat |
| `maxPieces` | 16,000 | Live pickup ceiling per actor; also used to size debris capacity |

Damage can be overridden at runtime by the lobby/pause slider (integer 1–20). It applies when a projectile hits, including projectiles already in flight after resuming. Starting another fight does not reset this page-level setting.

Some constants live elsewhere: `main.ts` defines a 60 Hz simulation, 0.1-second frame-delta clamp, 1.8-second projectile lifetime, and 24 starting drops; `ui.ts` defines six roster entries per page; `render.ts` defines initial instance capacities and pixel-ratio limits. Search those files before treating `CONFIG` as an exhaustive settings API.

### Bot tuning outside CONFIG

The following values are local to [bots.ts](../src/game/bots.ts). Distances refer to actor centers, in world units. Define `contact = 0.8 * (player.radius + enemy.radius)` when reading the distance formulas.

| Parameter | Aggressor | Collector | Sniper | Balanced |
| --- | --- | --- | --- | --- |
| Base speed multiplier | 1.12 | 1 | 1 | 1 |
| Base shot interval | 0.3 seconds | 0.85 seconds | `CONFIG.botShotInterval` (0.62), or 0.12 during panic | `CONFIG.botShotInterval` (0.62) |
| Maximum firing distance (exclusive) | 66 | 42 | 66 | 66 |
| Main spacing rule | Approach beyond `contact + 0.5` | Retreat below `max(18, contact + 8)` | Preferred range `max(28, contact + 12)` | Tactic range `max(16 or 22, contact + 7)`; retreat below `contact + 5` |
| Projectile evasion | Disabled | Difficulty-dependent | Difficulty-dependent | Difficulty-dependent, with 1.1-second retry cooldown |
| Panic threshold | None | None | Distance below `max(15, contact + 5)` | None |

`botForRound()` controls progression: round 1 is Balanced/easy, round 2 Balanced/medium, and rounds 3+ use an independent random style at normal difficulty. Repeated styles are allowed. Restart resets this progression. The difficulty factors in `BOT_DIFFICULTIES` are:

| Difficulty | Movement multiplier | Shot-interval multiplier | Decision interval | Added aim spread | Aim-lead multiplier | Dodge probability per eligible detected threat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `easy` | 0.65 | 1.9 | 0.42 s | 4 | 0.2 | 0 |
| `medium` | 0.85 | 1.35 | 0.24 s | 1.8 | 0.65 | 0.55 |
| `normal` | 1 | 1 | 0.12 s | 0 | 1 | 1 |

Thus the opening Balanced bot fires at 1.178-second intervals, the second-round bot at 0.837 seconds, and a full-strength Balanced bot at 0.62 seconds. Difficulty changes movement and aim/fire decisions, not projectile speed, damage power, or structural rules.

Wandering targets and Balanced tactics refresh every 2–4 seconds. Evasion looks up to 0.7 seconds ahead, lasts 0.28 seconds, and uses a 1.22 speed multiplier before difficulty adjustment. These are movement heuristics, not player dash settings. Changing `botShotInterval` affects Balanced and non-panic Sniper fire. Keep `BOT_LABELS`, `BOT_DIFFICULTIES`, HUD labels, round progression, and product documentation aligned with tuning changes.

## Production output and hosting

```sh
npm test
npm run build
npm run preview
```

Upload the complete contents of `dist/` to a static host, preserving relative file layout. Vite includes compiled JavaScript/CSS and copies `public/`, including portraits, audio, and `assets/ATTRIBUTION.txt`. No application backend is needed.

The current source uses root-absolute `/assets/...` URLs for portraits and audio and the default Vite base. Hosting at the domain root is the supported configuration. Hosting below a path prefix requires updating both Vite's base and those asset URLs, then checking the built site; changing the base alone does not rewrite hardcoded runtime paths.

The development and preview servers bind to `127.0.0.1`. They are local inspection tools. The custom development server has a fixed strict port and does not silently choose another port.

The reviewed English build succeeds with a large-chunk warning: the JavaScript bundle is approximately 1,473 kB minified (209 kB gzip). Templates and Three.js are imported into the application bundle. This is a known output-size warning, not a TypeScript error or a measured runtime failure.

## Making changes

Change game rules in `src/game/` and exercise their existing tests. Keep structural revisions consistent: rendering and geometry caches use them to notice changes. If a change touches pickups, test both small fixtures and full generated characters.

Change roster content through the catalog, source PNGs, and generation pipeline. Do not hand-edit the generated template array as the primary workflow. See [Assets](ASSETS.md) for provenance and replacement requirements.

Change UI text in `ui.ts` and related runtime messages/metadata as needed. UI copy, accessibility labels, character subtitles, and metadata are English. Keep button labels consistent: Next Round preserves the mutant; Start Over resets the run. The code has no locale selector or translation dictionary. For UI work, manually check lobby scrolling, canvas reparenting, dialogs, focus, and resize behavior.

Control changes span the event handlers in `main.ts`, movement rules in `movement.ts`, and hints/HUD in `ui.ts`. Preserve the form-input and native button-key guards when adjusting shortcuts. Menu changes can also affect phase gating, modal focus, top-bar `inert`, and responsive rules in `style.css`; check playing, collecting, pause, victory, and defeat separately. UI fixtures must supply a real `#arena` canvas and all current update/result fields, including dash, bot style/difficulty, and victory counters.

When rules, configuration, scripts, or assets change, update the corresponding documentation and run the checks appropriate to that change. Keep design ideas labeled as deferred until implemented.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Node engine or tool startup error | Compare `node --version` with the documented baseline and reinstall locked dependencies |
| Port 5173 is already occupied | Stop the process you intended to replace, or deliberately change the port in `scripts/dev.mjs`; the wrapper uses a strict port |
| Opening `index.html` directly does not run the game | Use the dev server or build/preview commands; raw TypeScript is not a standalone `file://` application |
| WebGL error screen | Check browser WebGL support and hardware acceleration; the page includes a reload action |
| Silent combat | Start/resume with a user gesture, check mute, and inspect requests for the three local audio files |
| Missing portraits/audio on a hosted site | Check `/assets/` requests, domain-root hosting, and whether the complete `dist/` was uploaded |
| Fight pauses after changing tabs | This is intentional; resume after returning |
| P/Escape or another game shortcut does nothing while adjusting damage | Form inputs bypass game shortcuts; leave the slider or use the Resume button |
| Space activates a menu control instead of dashing | Native button/link/settings keyboard handling takes priority; dash is available only during combat |
| No Next Round action after defeat | Expected: only a living winner can carry its construction forward |
| Victory progress finishes below 100% | The meter counts successful attachments; rejected or over-capacity pieces are skipped and reported on the result |
| Long round stress test exceeds 30 seconds | Retry with one worker using the command above; see [Testing](TESTING.md) for the recorded timeout and serial result |
| Asset tests fail after replacing a portrait | Update provenance and roster-specific expectations deliberately, regenerate, then rerun tests |
| Old local review page fails | `artifacts/` is ignored and may contain stale fixtures; use the current game and maintained tests |

No installation or setup changes were required for the documentation review because this workspace already had dependencies installed. See [Testing](TESTING.md) for the exact verification scope.
