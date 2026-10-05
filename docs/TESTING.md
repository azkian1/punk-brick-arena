# Testing and Verification

The maintained automated suite uses Vitest and runs in Node. It exercises structural rules, generated content, pickups, collision math, dash movement, bot decisions, victory collection, round transitions, and character instance allocation. It is not an end-to-end browser suite.

## Run the checks

```sh
npm test
npm run build
```

The build performs strict TypeScript checking for `src/` before producing `dist/`. Tests are a separate command. There is no configured CI workflow or coverage threshold in this snapshot.

If the 15-round stress case exceeds its 30-second timeout during a parallel run, retry without file parallelism:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
```

The latest documentation check passed all 159 cases with the default `npm test` command. An earlier version's check hit this timeout and then passed with the serial command above. No test expectations or timeout values were changed for documentation verification. These results do not establish a performance guarantee or identify the cause of the earlier timeout.

For focused work:

```sh
npm test -- src/game/core-protection.test.ts
npm test -- src/game/pickup.integration.test.ts
npm test -- src/game/rounds.test.ts
npm test -- src/game/movement.test.ts src/game/bots.test.ts src/game/victory.test.ts
```

After changing the catalog, source images, importer, or vendored generator, run `npm run assets:generate` before tests/build and inspect both generated JSON files. Do not assume a passing build regenerates content.

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
| **Total** | **159** | **11 files** |

The 15-round stress test manually defeats enemies and feeds their pieces directly into the attachment API, reaching more than 7,000 attached pieces. It then checks body and stud instance counts. This exercises a maximum-growth scenario without the live collection animation. The victory tests separately exercise reward collection and carryover. These tests construct Three.js scene/mesh objects without creating a browser WebGL renderer.

Tests inject seeded random functions or controlled values where needed. The live application uses `Math.random()`, so browser match sequences are not reproduced by those fixtures.

## Manual browser checklist

Use `npm run dev`, or run a fresh build followed by `npm run preview`. These are checks to perform for gameplay/UI changes, not a claim that every item was rerun during the documentation update.

| Area | Action and expected result |
| --- | --- |
| Lobby | Visit all three roster pages; select first and last entries; confirm name, portrait, piece count, and live preview match. Paging alone must not change the selected character; boundary pagination buttons must be disabled |
| Navigation and credits | Follow Play/How to Play/About anchors; verify creator/generator links and the distributed attribution link |
| Layout | Resize between wide desktop and narrow viewport; the lobby scrolls and the preview canvas retains correct framing |
| Start | Begin a fight; verify both actors, HUD, opposite spawns, and neutral starting debris |
| Movement | Use WASD and arrows, including diagonals and arena edges; check normalized input, actor separation, and bounds |
| Dash | Press Space while moving and while stationary; confirm direction, burst, cooldown indicator, arena bounds, no repeated burst while held, firing during a burst, and reset on a new fight. It must not grant invulnerability |
| Bots | Observe all four styles' movement, loot priorities, evasion, firing range, and sniper panic HUD state. Round 1 must be Balanced/easy, round 2 Balanced/medium, and later rounds full-strength random styles with repeats allowed; restart returns to Balanced/easy |
| Aim/shoot | Fire at visible upper and lower parts of the enemy; shots use planar targeting and holding the button repeats fire |
| Damage | Change power in lobby/pause; both fighters use the new value and cascades may exceed direct power |
| Core | Observe protected/exposed HUD feedback; exposure alone is not defeat, and repairs do not rearm protection during the fight |
| Pickup | Run near landed debris; verify batches, repair/growth counters, and the delayed recovery of your own pieces |
| Pause | Use P/Escape and switch windows/tabs during combat and victory collection; fight time, dash timers, pickup ages, and reward movement stop, held fire clears, and resuming restores the interrupted phase |
| Victory | Confirm victory badge, reward count, statistics, survivor count/ratio, and focused Next Round action; continue with attached damage/growth preserved. P/Escape must not dismiss the result |
| Defeat | Confirm defeat badge and focused restart action; Next Round must be hidden and disabled, with no reward or survivor panel |
| Reset and settings | Use Start Over/R and return to character selection; verify a base construction and round 1 on restart, preserved damage/mute settings, selected character and roster page, and reset lobby scroll. Reload must restore page defaults |
| Audio | Start with a user gesture; verify shots/hits, pickup and result cues, and mute via M/button |
| Keyboard UI | Tab through roster/settings and modal actions; confirm visible focus, native Space/Enter behavior, and modal focus cycling. The top bar must be inert behind pause/results; the canvas regains focus on start/resume |
| Keyboard layout and input focus | Switch to a non-Latin layout and use the same physical game keys. While the damage slider is focused, its arrow keys must adjust damage and game shortcuts must be ignored; resume through the button or after leaving the input |
| Pointer release | Start firing on the canvas and release over the HUD or outside the canvas; firing must stop. Clicking a menu control must not shoot |
| Reduced motion | Enable the browser/OS preference; preview sway, CSS animation, and extra dash/victory-pickup particles stop; remaining combat motion and loot attraction are expected |
| Production assets | Check browser console/network for missing portraits, audio, scripts, or attribution after a production build |
| Large mutants | Inspect silhouette, aiming, camera framing, input response, and frame rate after substantial growth |

Victory runs automatic collection before showing the result. Check flying debris, the counter, pause/resume, fight-clock freeze, and the resulting survivor before Next Round. Movement, firing, and dash must be inactive; the dash HUD and toasts are hidden. Only rejected or over-capacity loot remains on the ground and is discarded on the next round. Progress counts successful pickups, so skipped pieces can leave the final fraction below 100% without blocking completion. An empty arena must still wait for the 2.4-second minimum. Defeat has no reward collection.

## Runtime diagnostics

The browser exposes a getter at `window.__arenaSnapshot`. Inspect it in developer tools:

```js
window.__arenaSnapshot
```

It returns `phase`, `elapsed`, current `damage`, player/enemy positions and piece counts, the player's vacancy count, drop/projectile counts, a copy of fight `stats`, and renderer `drawCalls`.

Statistics include elapsed time, repairs, growth, player shots/hits, and direct/cascade removals credited to player hits. The snapshot is a diagnostic summary, not a save file or a control API. It does not expose the round number, full geometry, opponent queue, Core exposure state, bot style/difficulty, dash state, or victory progress. Read the HUD or inspect underlying logic/tests for those details. No remote calls or telemetry are performed by this getter.

## Optional local review artifacts

The ignored `artifacts/` directory in this workspace contains `pickup-benchmark.ts`, `pickup-review.html`, and `round-review.html`, plus historical outputs and screenshots. They are not guaranteed to exist in another checkout and are excluded from the default TypeScript scope and production build.

The pickup benchmark can be run locally with `npx tsx artifacts/pickup-benchmark.ts` after dependencies are installed. It compares an earlier single-piece pickup loop with batch collection and records local timings. Timings depend on the machine and are not a release performance guarantee.

The English update refreshed `round-review.html` with the required canvas and dash/bot/difficulty/victory fields. `make-action-review.mjs` regenerates a local main-loop copy with explicit QA outcome controls. Both remain development fixtures, excluded from production.

`english-ui-review.mjs` is a local Playwright/Chromium check with machine-specific runtime paths. It starts an isolated Vite server on port 5187 and checks the real lobby/combat UI plus the outcome fixtures. It saves an English-only DOM/attribute audit, layout checks, screenshots, and a JSON report, then closes the browser and server. It is not part of `npm test` or a portable browser-test setup. The two About screenshots were replaced with current English captures.

## Verification recorded on 2026-10-05

| Check | Result |
| --- | --- |
| Latest `npm test` | Passed: 159 tests in 11 files, 21.53 seconds overall; stress case approximately 15.65 seconds |
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

The English update covers menus, HUD, tooltips, accessibility labels, bot labels/descriptions, combat messages, metadata, character subtitles, and local QA pages. Core states, result actions, and piece-count wording were reviewed for consistent English. Browser captures were inspected at desktop and narrow sizes. Tests and browser/build checks required execution outside the restricted filesystem after sandbox EPERM/launch failures; no test expectations or game rules were changed.

## Coverage limits

There is no maintained browser suite in the package scripts. The local English review covers selected DOM/input/outcome flows and screenshots, but does not exhaust pause-on-blur, audio unlocking, every dynamic message, WebGL rendering across devices, or deployment paths. The structural integration tests do not run the complete game in a browser.

The suite does not establish performance at the full 16,000-piece live pickup limit, fairness of random damage, browser compatibility, touch combat, or fun/match duration. It also does not exhaust every arbitrary imported geometry or attachment candidate. Use the manual checks and targeted profiling when those areas change.
