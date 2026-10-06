# Testing and Verification

The maintained automated suite uses Vitest and runs in Node. It exercises structural rules, generated content, planned evolution, reserve conservation, pickups, collision math, dash movement, bot decisions, victory collection, round transitions, and character instance allocation. It is not an end-to-end browser suite.

## Audit verification on 2026-10-06

The GitHub Pages deployment follow-up passed **200 tests in 14 files**, the production build with `DEPLOY_BASE_PATH=/punk-brick-arena/`, and all three Node publication guards. The extra asset test covers portrait URLs beneath a project prefix; the new publication guard rejects an entry script outside that prefix. The dated audit results below retain their original counts and scope.

The accepted integrated serial audit run passed **199 tests in 14 files** with Vitest 4.1.11 in 58.11 seconds. After the debris-stacking fix, the same 199 tests in 14 files passed again; that run overlapped active local browser work and took 119.35 seconds, so its duration is not a performance reference. The current production build passed strict TypeScript checking and Vite compilation. Its JavaScript bundle is 2,612.62 kB minified / 408.94 kB gzip; the existing large-chunk warning remains. Initial sandbox attempts failed with filesystem `EPERM` before checking the application; the successful retries are the accepted results.

The new maintained gameplay audit adds 22 cases: 100 deterministic API rounds across five paths, invalid stock rejection, attachment-capacity storage, reserve ID collision/cache handling, five complete-body Core cascades, five blueprint/spatial connectivity comparisons, and an adversarial sub-epsilon geometry fallback. Three renderer tests compare exact picking against Three.js across the roster, growth, damage, gaps, transformed roots, and clipping distances. Earlier case counts below are dated historical results.

The separate browser audit completed **100 assisted projectile matches**, 20 consecutive wins per evolution, with active bots, damage, pickups, reward collection, exact carryover, and zero page/console errors. Autoplay advances fixed simulation time and assists aim/evasion; this is not human play or a balance estimate. Reports record the loaded source snapshot. See [Gameplay audit](GAMEPLAY_AUDIT.md) for progression, final-source geometry/UI rechecks, and precise fixture boundaries.

The final-source browser recheck passed for all five paths with exact 100% body completion asserted in both phases, close-range projectile hits, combat/reward pause, transition, result guard, defeat/restart, transformed camera bounds at four arena corners, and non-overlapping vertical placement for a 12-piece debris pile. It reported zero page/console errors. This separate fixture run preserves the original 100-match evidence and its source hashes.

The [Performance audit](PERFORMANCE_AUDIT.md) records coordinated before/after measurements on an HONOR laptop with Ryzen 5 5500U and Radeon integrated graphics. It separates live simulation from render-only sampling, legal damage from synthetic stress, and development load from production load. Remaining isolated frame delays mean sustained interactive 60 FPS is not certified.

The [Security audit](SECURITY_AUDIT.md) records the targeted Vitest upgrade, zero advisories in live full and production-only npm audits, two separate Node guard tests, source/output scans, and production-browser checks. Local antivirus rewrites the browser-observed CSP; raw preview headers/meta match the configured policy. Remote hosting is unverified.

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
npm run security:check
node scripts/gameplay-browser-audit.mjs
node scripts/performance-audit.mjs current
node scripts/security-browser-audit.mjs
```

The browser scripts use an existing Playwright runtime and Chrome, with configurable local paths described in the audit documents/scripts. Run performance measurements separately from tests and other browser audits. QA mutation controls are injected into disposable browser responses and are absent from the production source/build. Audit JSON, CPU profiles, and screenshots are written to ignored `artifacts/` directories.

The evolution integration also received a disposable Chromium review of all five paths in both full body phases, victory rebuilding, Next Round stock preservation, restart, movement/dash/shooting, camera framing, and the narrow lobby. It reported zero page/console errors. The local evidence is in ignored `artifacts/evolution-game/`. QA-only controls were injected into the test browser's module response and are not shipped in game source.

A separate 15-victory simulation per path conserved all parts and kept each body connected. It used VIOLET, no player damage, and direct collection of every defeated base enemy; it did not include the match loop's neutral starting drops, combat movement, or reward animation. All five paths reached phase 3 by round 15 (approximately 38–88% of its final body, depending on path). This is a progression sanity check, not an estimate of a player's win rate or real match duration.

## Run the checks

```sh
npm test
npm run build
```

The build performs strict TypeScript checking for `src/` before producing `dist/`. Tests are a separate command. The GitHub Pages workflow now runs tests, build, and publication guards before deployment on each push to `main`; no coverage threshold is configured.

If the 15-round stress case exceeds its 30-second timeout during a parallel run, retry without file parallelism:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
```

The evolution integration passed 174 cases in 12 files with the serial command above. Its initial parallel run passed all assertions but reported a worker RPC timeout, followed by a clean serial run. The exhaustive blueprint test yields between head/body combinations so it does not block worker communication. These results do not establish a frame-rate guarantee.

For focused work:

```sh
npm test -- src/game/core-protection.test.ts
npm test -- src/game/pickup.integration.test.ts
npm test -- src/game/rounds.test.ts
npm test -- src/game/movement.test.ts src/game/bots.test.ts src/game/victory.test.ts
npm test -- src/game/evolution.test.ts --maxWorkers=1 --no-file-parallelism
```

After changing the catalog, source images, importer, or vendored generator, run `npm run assets:generate` before tests/build and inspect both generated JSON files. Do not assume a passing build regenerates content.

After changing authored body geometry, rebuild/audit the prototype models and run `npx tsx scripts/generate-evolutions.ts` before tests/build. The head generator and body exporter are separate pipelines; see [Evolution and reserve](EVOLUTION.md).

## Existing automated coverage

Counts below describe the suite reviewed on 2026-10-05.

| Test file | Cases | Coverage |
| --- | ---: | --- |
| [collision.test.ts](../src/game/collision.test.ts) | 3 | Fast segment crossings, misses/out-of-range contacts, initial overlap, zero motion |
| [pickup.test.ts](../src/game/pickup.test.ts) | 6 | Five-second owner restriction, 0.8-second shared delay, settled state, neutral drops, latest ownership |
| [core-protection.test.ts](../src/game/core-protection.test.ts) | 7 | Protected selection, exact/fractional thresholds, cascades, oversized hits, repairs, next-hit eligibility, lone Core |
| [structure.test.ts](../src/game/structure.test.ts) | 17 | Cloning, IDs, Core/face connectivity, bounds, batch damage, elimination, vacancies, repair priority, non-overlapping growth |
| [pickup.integration.test.ts](../src/game/pickup.integration.test.ts) | 7 | Full-speed collection of 120 pieces, nearest-first batches, asymmetric reach, owner lockout, rejected pieces, contested loot, repairs |
| [templates.test.ts](../src/assets/templates.test.ts) | 52 | Roster/portrait provenance and per-template geometry, overlap, and connectivity checks |
| [combat.integration.test.ts](../src/game/combat.integration.test.ts) | 34 | Default power on every template and complete structural damage/collection loops with conservation and immutable source templates |
| [rounds.test.ts](../src/game/rounds.test.ts) | 6 | Roster eligibility, opponent cycles, victory guard, exact carryover, restart, long-run structure/render capacity |
| [movement.test.ts](../src/game/movement.test.ts) | 4 | Dash distance/direction, diagonal normalization, cooldown, arena bounds |
| [bots.test.ts](../src/game/bots.test.ts) | 18 | Four styles, loot growth/ownership, retreat, evasion/cooldown, sniper fire/lead, corners, Balanced tactics, opening difficulty, random repeats, restart progression |
| [victory.test.ts](../src/game/victory.test.ts) | 5 | Reward collection, repair/growth, carryover, empty arena, rejected pieces, capacity, defeated player |
| [evolution.test.ts](../src/game/evolution.test.ts) | 15 | All 170 head/body combinations, five complete phase-2 bodies, colors/sizes, connected growth, bank ownership, repairs, phase-3 conservation, carryover, victory and reset |
| **Total** | **174** | **12 files** |

The legacy free-growth 15-round stress test manually defeats enemies and feeds their pieces directly into `attachPiece()`, reaching more than 7,000 attached pieces. It then checks body and stud instance counts. It does not exercise the new blueprint placement policy. Evolution tests separately cover 170 head/path/phase combinations, complete phase-2 bodies for all five paths, bank/repair behavior, phase transition, and carryover. These tests construct Three.js scene/mesh objects without creating a browser WebGL renderer.

Tests inject seeded random functions or controlled values where needed. The live application uses `Math.random()`, so browser match sequences are not reproduced by those fixtures.

## Manual browser checklist

Use `npm run dev`, or run a fresh build followed by `npm run preview`. These are checks to perform for gameplay/UI changes, not a claim that every item was rerun during the documentation update.

| Area | Action and expected result |
| --- | --- |
| Lobby | Visit all three roster pages; select first and last entries; confirm name, portrait, piece count, and live preview match. Paging alone must not change the selected character; boundary pagination buttons must be disabled |
| Evolution selection | Select each of the five paths with different heads; confirm its description and combat HUD. A fresh run starts with the selected head, zero built body slots, and empty reserve; the lobby preview remains a head |
| Navigation and credits | Follow Play/How to Play/About anchors; verify creator/generator links and the distributed attribution link |
| Layout | Resize between wide desktop and narrow viewport; the lobby scrolls and the preview canvas retains correct framing |
| Start | Begin a fight; verify both actors, HUD, opposite spawns, and neutral starting debris |
| Movement | Use WASD and arrows, including diagonals and arena edges; check normalized input, actor separation, and bounds |
| Dash | Press Space while moving and while stationary; confirm direction, burst, cooldown indicator, arena bounds, no repeated burst while held, firing during a burst, and reset on a new fight. It must not grant invulnerability |
| Bots | Observe all four styles' movement, loot priorities, evasion, firing range, and sniper panic HUD state. Round 1 must be Balanced/easy, round 2 Balanced/medium, and later rounds full-strength random styles with repeats allowed; restart returns to Balanced/easy |
| Aim/shoot | Fire at visible upper and lower parts of the enemy; shots use planar targeting and holding the button repeats fire. With a fully grown build, hit a nearby enemy inside the shooter's floor circle; shots must start at the character's center and must not skip past the target |
| Damage | Change power in lobby/pause; both fighters use the new value and cascades may exceed direct power |
| Core | Observe protected/exposed HUD feedback; exposure alone is not defeat, and repairs do not rearm protection during the fight |
| Pickup | Run near landed debris; verify batches, repair/growth counters, and the delayed recovery of your own pieces |
| Planned assembly | Check that compatible lost slots repair before new growth, incoming colors/shapes remain unchanged, and growth stays within the selected silhouette |
| Reserve | Collect a currently incompatible size; its world drop disappears and the reserve increases. Check that later connections trigger assembly, only installed pieces increase body progress, and each side panel represents its owner's stock without requiring a visit |
| Backpack panels | Check exact counts, empty-state copy, 3D tray framing, and the 240-piece sample label; narrow/short screens must show compact counters. Confirm side panels leave the central arena usable and no additional WebGL context is created |
| Pause | Use P/Escape and switch windows/tabs during combat and victory collection; fight time, dash timers, pickup ages, and reward movement stop, held fire clears, and resuming restores the interrupted phase |
| Victory | Confirm victory badge, reward count, statistics, survivor count, evolution/reserve summary, and focused Next Round action; continue with body damage, stage, and stock preserved. P/Escape must not dismiss the result |
| Phase transition | After victory collection/assembly leaves at least 85% of the phase-2 body attached, verify phase 3 unlocks, the surviving head/Core remains, and attached-plus-stored parts are conserved. It must not unlock during active combat or grow beyond the final plan |
| Defeat | Confirm defeat badge and focused restart action; Next Round must be hidden and disabled, with no reward or survivor panel |
| Reset and settings | Use Start Over/R and return to character selection; verify a base head, zero body progress, empty reserve, and round 1 on restart, preserved damage/mute settings, selected head/path and roster page, and reset lobby scroll. Reload must restore run/settings defaults |
| Audio | Start with a user gesture; verify shots/hits, pickup and result cues, and mute via M/button |
| Keyboard UI | Tab through roster/settings and modal actions; confirm visible focus, native Space/Enter behavior, and modal focus cycling. The top bar must be inert behind pause/results; the canvas regains focus on start/resume |
| Keyboard layout and input focus | Switch to a non-Latin layout and use the same physical game keys. While the damage slider is focused, its arrow keys must adjust damage and game shortcuts must be ignored; resume through the button or after leaving the input |
| Pointer release | Start firing on the canvas and release over the HUD or outside the canvas; firing must stop. Clicking a menu control must not shoot |
| Reduced motion | Enable the browser/OS preference; preview sway, CSS animation, and extra dash/victory-pickup particles stop; remaining combat motion and loot attraction are expected |
| Production assets | Check browser console/network for missing portraits, all five evolution PNGs, audio, scripts, or attribution after a production build |
| Large builds | Inspect silhouette, aiming, camera framing, input response, and frame rate after substantial growth |

Victory runs automatic collection before showing the result. Check flying debris, defeated-bot reserve transfer, the counter, pause/resume, fight-clock freeze, reserve assembly, and the resulting survivor before Next Round. Movement, firing, and dash must be inactive; the dash HUD and toasts are hidden. Valid unplaceable or attachment-cap-limited pieces enter the reserve. Only rejected invalid loot can remain on the ground and be discarded on the next round. Progress counts body or bank pickups, so skipped invalid pieces can leave the fraction below 100% without blocking completion. Conversely, 100% collected does not mean reserve assembly or evolution is finished. An empty arena must still wait for the 2.4-second minimum. Defeat has no reward collection.

## Runtime diagnostics

The browser exposes a getter at `window.__arenaSnapshot`. Inspect it in developer tools:

```js
window.__arenaSnapshot
```

It returns `phase`, `round`, `elapsed`, current `damage`, player/enemy positions and piece counts, player evolution progress and reserve count, enemy reserve count, the player's legacy vacancy count, drop/projectile counts, fight `stats`, and renderer `drawCalls`.

Statistics include elapsed time, repairs, growth, player shots/hits, and direct/cascade removals credited to player hits. The snapshot is a read-only diagnostic summary, not a save file or a control API. Read the HUD or tests for detailed bot, dash, and victory state. No remote calls or telemetry are performed by this getter.

## Optional local review artifacts

The ignored `artifacts/` directory in this workspace contains `pickup-benchmark.ts`, `pickup-review.html`, and `round-review.html`, plus historical outputs and screenshots. They are not guaranteed to exist in another checkout and are excluded from the default TypeScript scope and production build.

The pickup benchmark can be run locally with `npx tsx artifacts/pickup-benchmark.ts` after dependencies are installed. It compares an earlier single-piece pickup loop with batch collection and records local timings. Timings depend on the machine and are not a release performance guarantee.

The English update refreshed `round-review.html` with the required canvas and dash/bot/difficulty/victory fields. `make-action-review.mjs` regenerates a local main-loop copy with explicit QA outcome controls. Both remain development fixtures, excluded from production.

`english-ui-review.mjs` is a local Playwright/Chromium check with machine-specific runtime paths. It starts an isolated Vite server on port 5187 and checks the real lobby/combat UI plus the outcome fixtures. It saves an English-only DOM/attribute audit, layout checks, screenshots, and a JSON report, then closes the browser and server. It is not part of `npm test` or a portable browser-test setup. The two About screenshots were replaced with current English captures.

`artifacts/review-evolution-game.mjs` uses the real local game and injects temporary QA controls into that disposable browser's module response. It supplies known source-piece sizes to complete bodies, triggers victory, checks exact attached-plus-reserve carryover, checks reset and projected body bounds, and captures all five paths in both phases. Movement/dash/shooting are sampled on Mosher, and narrow-lobby overflow is checked at 390 x 844. These forced full-body checks establish rendering/integration behavior, not naturally earned progression. The QA controls do not exist in shipped source.

`artifacts/evolution-run.ts` separately simulates 15 ideal victories per path and writes `artifacts/evolution-game/run-15.json`. `report.json` records all five browser paths; `report-frontman.json` records the focused Winged Frontman recheck. Both report files contain empty error lists. These artifacts are local evidence, not portable package commands or committed CI outputs.

Those evolution browser reports predate the later Backpack/Rival stock panel presentation. Their zero-error results and framing checks apply to the recorded integration snapshot and must not be treated as a browser verification of the newer panel cameras, viewports, or responsive tray layout. Current panel behavior is documented from source; use the panel checklist above when verifying it.

## Evolution integration verification recorded on 2026-10-05

| Check | Recorded result |
| --- | --- |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | Passed: 174 tests in 12 files, with successful exit and no unhandled errors |
| Initial parallel run | All assertions passed, but a worker RPC timeout prevented a clean run; the serial result above is the accepted verification |
| `npm run build` | Passed TypeScript checking and Vite production build; large-chunk warning remains |
| Browser integration | All five paths, both completed body phases, victory/phase rebuilding, reserve carryover, restart, sampled controls, full-body framing, and narrow lobby; no recorded page/console errors |
| Fifteen-victory simulation | Each path conserved attached plus stored pieces and kept attached parts Core-connected across all 15 rounds |
| Documentation refresh | Cross-checked against current rule modules and runtime flow; English text with no Cyrillic. No game tests or browser runs are claimed solely for this documentation edit |

The simulation's phase-3 results are reproducible evidence for that fixture only:

| Path | Phase 3 unlocked after simulated round | Phase-3 body at round 15 | Stored pieces at round 15 |
| --- | ---: | ---: | ---: |
| Mosher | 11 | 3,745 / 9,718 (38.5%) | 3,154 |
| Guitar Demon | 6 | 3,609 / 4,084 (88.4%) | 3,195 |
| Stage Spider | 6 | 3,455 / 6,991 (49.4%) | 3,349 |
| Bass Titan | 8 | 3,663 / 7,591 (48.3%) | 3,232 |
| Winged Frontman | 7 | 4,720 / 5,391 (87.6%) | 2,166 |

## Earlier English-interface verification on 2026-10-05

These results predate the evolution integration; their test count and bundle size are historical, not the current totals.

| Check | Result |
| --- | --- |
| English-interface `npm test` | Passed: 159 tests in 11 files, 21.53 seconds overall; stress case approximately 15.65 seconds |
| Earlier default/serial checks | An earlier default run had 152 passes and one stress-test timeout at 30 seconds; its serial retry passed all 153 tests, with the stress case approximately 16.8 seconds |
| `npm run build` | Passed: TypeScript and Vite static output |
| Build warning | JavaScript chunk above Vite's 500 kB warning threshold; approximately 1,473 kB minified / 209 kB gzip |
| `npm run assets:generate` | Passed; all 17 models regenerated with English subtitles |
| Generated output comparison | All template fields except subtitles unchanged; diagnostics JSON byte-identical |
| Portrait provenance | All 17 PNGs match recorded Git blob hashes exactly |
| Vendored text provenance | All 11 recorded text files match after excluding one additional trailing LF in each local copy |
| English browser review | Passed 11 UI states at 1365 × 900 and 390 × 844, covering lobby, last roster page, combat, pause, victory collection, victory/defeat, Next Round, and About; no page errors or detected text overflow |
| Language audit | No Cyrillic in project-owned text, generated templates, local review pages, or production output; HTML documents declare `lang="en"`. Installed dependencies and package-manager caches are excluded |

Environment: Windows, Node.js 24.11.0, npm 11.6.1, Vitest 3.2.7, Vite 7.3.6. Dependencies were already installed; a clean `npm ci` was not part of this review.

That English update covered menus, HUD, tooltips, accessibility labels, bot labels/descriptions, combat messages, metadata, character subtitles, and local QA pages. Core states, result actions, and piece-count wording were reviewed for consistent English. Browser captures were inspected at desktop and narrow sizes. Tests and browser/build checks required execution outside the restricted filesystem after sandbox EPERM/launch failures; no test expectations or game rules were changed by that translation patch.

## Coverage limits

There is no maintained browser suite in the package scripts. The local English and evolution reviews cover selected DOM/input/outcome flows and screenshots, but do not exhaust pause-on-blur, audio unlocking, every dynamic message, WebGL rendering across devices, or deployment paths. The structural integration tests do not run the complete game in a browser. Browser full-body fixtures deliberately grant parts, and the long-run simulation bypasses real combat; neither proves that a typical player reaches the same phase on the same round.

The suite does not establish performance at the full 16,000-piece live pickup limit, fairness of random damage, browser compatibility, touch combat, or fun/match duration. It also does not exhaust every arbitrary imported geometry or attachment candidate. Use the manual checks and targeted profiling when those areas change.
