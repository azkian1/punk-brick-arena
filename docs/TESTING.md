# Testing and verification

Reviewed against **v2 Battle Royal patch** on 2026-10-10. The current runtime is a four-fighter battle with procedural cover and inventory ammunition; package metadata remains `0.1.0`. Node rule tests and disposable browser integration checks have different scopes. Dated prior sections preserve evidence from earlier production snapshots.

## Current audit-fix verification, 2026-10-10

The final isolated suite passes **552 tests in 31 files in 91.01 seconds**, using `npm test -- --maxWorkers=1 --no-file-parallelism` with existing/default timeouts, including the final rush/recovery regression. Strict TypeScript/Vite build passes; the entry is 2,779.85 kB minified / 442.29 kB gzip. All three publication/security guards and the scan of 140 working-tree text files / five production text files pass. The existing large-chunk warning remains.

New regressions compare exact floor ranking/radius queries to exhaustive references, retain rare compatible parts across the arena, reconcile changed/removed supports, invalidate real reserve counts, skip repeated unsuccessful cover escape searches and preserve exact swept-circle collision fractions in 2,400 reference cases. The underlying optional resource timer now advances during evasion; mandatory recovery still gets its exception. Two fragmented-cover tests reach real pickup distance with safe movement and at most 192 yielded navigation units per step, including changes of radius/goal. Real firing, inventory/Core protection, cooldown and DASH tests remain active. Independent ignored probes pass 1,200 ground-query comparisons and 2,430 support-height comparisons.

The initial full run found one obsolete synchronous expectation in the narrow-opening regression. A resumable route can remain pending beyond its second call. The replacement test bounds the wait to fifteen fixed steps and strengthens the actual behavior requirements: a terminal failed body route precedes legal building fire, one real reserve part transfers to an actual building impact, damage opens a body-passable gap, and the bot crosses it through clear swept segments while resuming hostile fire. All other 550 tests passed in that initial run; the subsequent complete run passed all 551. After adding the rush/recovery regression, the final run above passes all 552. No production change was required for either test adjustment.

Two sequential hardware workload runs conserve inventory and report zero browser errors. Live 4,000-part scenes reach 56.8–60.4 animation frames/s, 12,000-part scenes 52.4–58.5, and reserves of 5,000 real source parts per fighter 52.2–53.2, versus previous 38.9 / 4.6 / 42.4. The same AMD Radeon ANGLE/Direct3D11 adapter, 1872 × 879 / DPR 1 and roughly four-second windows are used. Simulation advances at approximately wall-time speed in both twelve-thousand-part runs. Short-window variability and individual spikes remain; these are headless spot checks, not universal FPS guarantees.

Each hardware run performs twenty resets with 38 geometries / one texture. Direct `Runtime.getHeapUsage` after retired frame scopes and forced GC remains approximately 36 MB in the confirmation run, with no increasing retained heap. Cached `performance.memory` estimates are recorded separately. Reports, screenshots, profiles and production hashes are in `artifacts/performance-battle-fixed-2026-10-10` and `artifacts/performance-battle-fixed-confirm-2026-10-10`. [Audit fixes](AUDIT_FIXES_2026-10-10.md) describes the changes; [Performance audit](PERFORMANCE_AUDIT.md) records exact CPU/frame measurements and limits.

Final browser reruns pass **14 squad fixtures and five native-map smoke runs**, **10 patch fixtures** and **21 battle fixtures**, with zero page/console errors. Reports are `artifacts/squad-audit-fixes-final-2026-10-10/report.json`, `artifacts/patch-audit-fixes-final-2026-10-10/report.json` and `artifacts/battle-audit-fixes-final-2026-10-10/browser-report.json`. They retain real attacker/collector growth while moving and firing, recovery swaps, legal shot/DASH cadence, allied immunity, same-step collision bounds, local debris scatter, reserve-first volleys, pickup locks, one-shot rune repaint, immediate defeat freeze, exact victory carryover, secondary-touch DASH and readable aligned HUD panels. The battle run uses `BATTLE_AUDIT_MATCHES=0`; these regressions and the squad's stationary-player smoke runs are integration checks, not human-difficulty measurements.

The growth browser check originally placed its optional loot at a fixed distance of 18 units. The attacker's actual pickup radius was 5.007 units, so the pre-existing rush cutoff of `pickupRadius + 12` correctly excluded it; substituting the captured original bot source reproduces that result. Placement now uses the measured current radius plus ten units. Both roles must still install the exact real part, increase built armour, move while firing at the hostile and preserve their role and total physical inventory. An additional permanent regression checks nearby rush collection, distant rush pressure and the mandatory-recovery exception. Production was unchanged by this fixture correction; all 37 production TypeScript hashes still match both hardware reports. Growth and workload screenshots were inspected.

To repeat the current rule/build/security families, run these sequentially:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
npm run security:check
```

With an existing Playwright/Chrome installation, run `node scripts/bot-squad-browser-audit.mjs`, `node scripts/patch-browser-audit.mjs` and `node scripts/battle-browser-audit.mjs` separately. Set `BATTLE_AUDIT_MATCHES=0` to reproduce the final regression-only battle scope, and use each harness's output variable to keep new reports separate. `npm run test:mobile` repeats the touch family; it was last accepted at the earlier hardcore snapshot. `node scripts/performance-battle-audit.mjs` runs the current hardware/reset workload family; `PERF_BATTLE_OUTPUT` and `PERF_BATTLE_PORT` select its report directory and loopback port. Do not combine heavy Node and browser jobs when comparing timings. The original `scripts/performance-audit.mjs` below belongs to the historical duel workload.

## Prior hardcore bot verification, 2026-10-10

The final isolated full suite passed **541 tests in 29 files** in **106.04 seconds**, using `npm test -- --maxWorkers=1 --no-file-parallelism` with existing/default timeouts. Strict TypeScript/Vite build passed; its entry is 2,773.18 kB minified / 439.94 kB gzip. All three publication/security guards and the scan of 133 working-tree text files and five production text files passed. The existing large-chunk warning remains.

All playable rounds now spawn full-strength bots. The focused six-file combat suite passed 208 tests; two subsequent regressions also passed in the 17-test hardcore file. Coverage exercises the actual `main` bot/fire/hit functions, legal 0.23-second attack cadence from round one, physical ammunition and allied/Core guards, exact moving-target interception including edge stopping, adaptive volleys, live crossing-shot evasion, bounded growth detours, opportunistic finishing, formations and role rotation. Existing/default timeouts remain unchanged.

The before/after harness `scripts/hardcore-browser-audit.mjs` runs rounds 1/2/3/4/6 on seeds 927 and 48. It substitutes the captured pre-hardcore `bots.ts` and `bot-squad.ts` only in the baseline browser's responses. Per-case reseeding produces identical initial map hashes in all ten pairs. Native maps retain ordinary inventory; the scripted player moves, aims, fires and requests real DASH. Runs stop at actual defeat or 30 combat seconds. The baseline records five player defeats and the current version six; both current third/fourth/sixth-round seeds end in defeat. First/second rounds remain playing at the limit. This small deterministic script is evidence of behavior, not human difficulty or universal optimality.

Ten separate isolated pressure fixtures per version grant 80 real reserve parts to one active bot and clear cover. They record one baseline versus six current player defeats, legal current shot spacing and actual hits on a moving player. Those grants must not be confused with native-map resources. Both versions conserve total physical inventory every tick and record zero page/console errors. Reports are `artifacts/hardcore-before-2026-10-10/report.json` and `artifacts/hardcore-current-2026-10-10/report.json`; baseline sources remain in ignored `artifacts/hardcore-baseline-2026-10-10/`. Current round-one and round-four screenshots were inspected.

The current squad browser report passes **14 production-loop fixtures and five native-map smoke runs**, with zero errors and inventory conservation (`artifacts/squad-hardcore-final-2026-10-10/report.json`). The growth fixture gives all bots equal real stock so strength-based reassignment does not replace the role under test; attacker and collector must still install actual growth loot while moving and firing. The early mining fixture now uses the current normal difficulty and retains rapid-fire, growth and conservation assertions. Its native stationary-player runs are separate from the moving-player comparison.

Final maintained reruns pass **21 battle fixtures**, **10 patch fixtures** and actual-touch **390 × 844 / 844 × 390** orientations, with zero page/console errors and no mobile overflow. Reports are `artifacts/battle-hardcore-final-2026-10-10/browser-report.json`, `artifacts/patch-hardcore-final-2026-10-10/report.json` and `artifacts/mobile-hardcore-final-2026-10-10/report.json`. Battle checks retain all five evolution paths, defeat freeze, victory collection, exact carryover, rune/pickup locks and HUD alignment. Patch checks retain three full-catalogue maps, same-step damage bounds, edge landing, recovery starvation, local building scatter, bounded volley meshes and secondary-touch DASH. Mobile uses actual movement/firing and release reset.

Reproduce the current comparison with `node scripts/hardcore-browser-audit.mjs`. `HARDCORE_AUDIT_OUTPUT`, `HARDCORE_AUDIT_SEEDS`, `HARDCORE_AUDIT_VARIANTS` and `HARDCORE_AUDIT_PORT` configure the harness. For a captured baseline, set `HARDCORE_AUDIT_BASELINE` to its directory and `HARDCORE_AUDIT_VARIANTS=baseline,current`. The directory must contain the prior two production source files. The harness defaults to current-only checks and installs no browser/runtime packages.

Run heavy tests and browser harnesses sequentially. The current commands are the same rule/build/security and maintained browser families listed below, plus the hardcore comparison. `BATTLE_AUDIT_MATCHES=0` selects existing battle regressions without new assisted matches. Environment output paths separate current reports from historical snapshots.

## Prior bot growth verification, 2026-10-10

The final isolated full suite passed **507 tests in 28 files** in **129.58 seconds**, using `npm test -- --maxWorkers=1 --no-file-parallelism` with existing/default timeouts. Strict TypeScript/Vite production build passed. Its entry is 2,768.86 kB minified / 438.40 kB gzip; the existing large-chunk warning remains. All three publication/security guards and the working-tree/build scan passed.

The isolated focused bot/navigation run passed **135 tests in four files** in **7.26 seconds**, with serial files and unchanged timeouts. `src/game/bot-growth.test.ts` adds twenty tests covering every style and attacker/independent/collector roles after preparation, actual physical pickup and authored-body installation, enemy fire while travelling, allied/locked/airborne exclusions, recovery/finish/evasion guards, complete/capped forms, rare one-in-32 compatible mining, pickup-reach approaches and actual main firing/hit/drop code at 0.23 seconds. Exact part IDs, dimensions, shapes, colors and total inventory remain conserved.

The unreachable-resource regressions include 85 nearer geometrically blocked useful drops before a reachable candidate, reopening after actual cover revision, and real hostile volleys while a route-stall timer advances. The earlier eight-second sealed-courtyard test now verifies each resolved movement segment and position, the actual exterior pickup moment, retained/deferred enclosed loot and subsequent legal mining. Its old final-position assertion conflicted with continuing resource movement after a successful pickup. Legacy collector assertions now require hostile fire during collection, while pickup batching, holding the pile, real inventory, recovery and Core guards remain in place.

`scripts/bot-squad-browser-audit.mjs` passed **14 production-loop fixtures and five native-map smoke runs**, with **zero errors** (`artifacts/squad-growth-final-2026-10-10/report.json`). The added attacker and collector fixtures actually install an exact growth part while moving and firing. Early-round easy mining fires its first five four-part volleys at 0.2333-second spacing and installs real construction loot; its 2,074-part inventory remains unchanged. The native runs retain ordinary inventories and a stationary player after forced round entry; authored body growth is observed in rounds 1/3/4/6, with fourth-round final counts 41 / 33 / 24. No growth was observed in the second-round sample. The table and scope are in [Gameplay audit](GAMEPLAY_AUDIT.md). Growth/mining fixture screenshots were inspected.

The other final browser reruns passed **21 battle fixtures**, **10 patch fixtures** and actual-touch **390 × 844 / 844 × 390** orientations, with zero errors and no mobile overflow. Reports are `artifacts/battle-growth-final-2026-10-10/browser-report.json`, `artifacts/patch-growth-final-2026-10-10/report.json` and `artifacts/mobile-growth-final-2026-10-10/report.json`. `BATTLE_AUDIT_MATCHES=0` excludes new assisted matches. Grants, forced impacts and frozen fixed-step/software-renderer fixtures verify integration and inventory; native partial runs do not establish human balance or GPU FPS.

To reproduce the growth snapshot's check families (the harnesses use the current source):

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
npm run security:check
node scripts/bot-squad-browser-audit.mjs
node scripts/patch-browser-audit.mjs
node scripts/battle-browser-audit.mjs
npm run test:mobile
```

For the battle command, set `BATTLE_AUDIT_MATCHES=0` to run only regression fixtures. Each harness supports its output environment variable (`SQUAD_AUDIT_OUTPUT`, `PATCH_AUDIT_OUTPUT`, `BATTLE_AUDIT_OUTPUT`, `MOBILE_AUDIT_OUTPUT`), plus existing runtime/port options. Run heavy Node checks and browser harnesses sequentially: a concurrent exploratory run hit an existing five-second large-body route timeout; the isolated focused run passed without increasing it. Earlier dated evidence below belongs to its own snapshots.

## Prior mixed-part verification, 2026-10-10

The final isolated suite passed **487 tests in 27 files** in **87.47 seconds**, using `npm test -- --maxWorkers=1 --no-file-parallelism`. All tests use their existing/default timeouts. Arena checks compare the catalogue to all 17 heads and ten authored body plans: **57 size/shape combinations over 39 oriented sizes**. They verify complete map coverage, supported face connectivity, no overlaps, the 600-part building cap, deterministic variation, wide traversal routes and 2.2-unit building clearance. Constant endpoint and non-finite random samples are covered too.

`src/game/arena-loot.test.ts` exercises all 57 types and 66 actual removed parts through aimed demolition, settling, repair, growth, reserve, attached/reserve ammunition and a mixed projectile rebound, conserving every ID, size, shape and color. It exposed a plate stalled in a narrow corridor: exact X/Z side-contact directions now let it move along cover. A minimized regression checks floor settling without a lift, overlap, wall crossing or distant relocation. The integration test uses the default five-second timeout.

`src/game/test-fixtures/legacy-arena.json` preserves exact original v2 geometry from commit `4bcff49`: the seed-29 1,919-part tower, 900 native spent plates and seed-16 edge arch. Its loader creates fresh test structures. These immutable fixtures keep the previous dense-collapse and edge-landing regressions meaningful after changing map generation. They are imported only by tests and temporary browser instrumentation, and are absent from the production entry.

The updated patch browser harness passed **10 production-loop fixture entries**, with **zero page/console errors**, in `artifacts/mixed-arena-final-2026-10-10/report.json`. Three new map checks use the live generator and preserve all five categories and all 57 actual types, with no invented signatures:

| Seed | Buildings | Total cover parts | Parts per building | Distinct counts |
| --- | ---: | ---: | ---: | ---: |
| 1 | 20 | 1,984 | 37–231 | 20 |
| 48 | 20 | 2,357 | 35–316 | 20 |
| 927 | 20 | 2,138 | 38–304 | 19 |

The three map screenshots and the current tower's before/after screenshots were inspected. The current seed-29 mixed tower contains **162 parts**; two forced 20-part impacts remove it, all 162 identities move and settle in a local two-dimensional pile, with maximum distance **9.75** and final height **2.92** versus source height **17.30**. This live-map fixture is separate from the retained heavy 1,919-part Node regressions. The other seven entries retain same-step bounds, original edge landing, both starvation cases, volley instances and secondary-touch DASH.

The existing five-path battle regression passed **21 fixtures with zero errors**, with no new assisted matches (`artifacts/battle-mixed-final-2026-10-10/browser-report.json`, `BATTLE_AUDIT_MATCHES=0`).

The squad rerun passed **11 fixtures and five native-map smoke runs**, with zero errors and exact inventory conservation (`artifacts/squad-mixed-final-2026-10-10/report.json`, seed 927). Rounds 1/2/4/6 reach the 30-combat-second limit; round 3 ends in actual player defeat at 9.97 seconds. These runs retain normal bot inventories and a stationary player after forced round entry. They check behavior on mixed cover, rather than completed wins or human balance. The round statistics are in [Gameplay audit](GAMEPLAY_AUDIT.md).

The final actual-touch audit passed portrait **390 × 844** and landscape **844 × 390**, with coarse-pointer contexts, real movement/firing, release reset, zero horizontal overflow and zero page/console errors (`artifacts/mobile-mixed-final-2026-10-10/report.json`).

Strict TypeScript/Vite production build and all three publication/security guards passed, including the source/build scan. The existing large-entry warning remains (2,765.05 kB minified, 437.25 kB gzip); no chunk splitting was added. Browser grants, forced impacts and fixed-step/software-renderer checks establish integration and inventory correctness, rather than human balance or GPU FPS.

To reproduce the current checks with an existing Playwright/Chrome installation:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
npm run security:check
node scripts/patch-browser-audit.mjs
```

Set `PATCH_AUDIT_OUTPUT` to keep separate ignored reports and `PATCH_AUDIT_PORT` to choose a loopback port. `PLAYWRIGHT_MODULE` and `CHROME_PATH` select existing runtime paths. Earlier results below describe their own snapshots.

## Prior audit-fix verification, 2026-10-10

The final isolated suite passed **481 tests in 26 files** in **87.00 seconds**, using `npm test -- --maxWorkers=1 --no-file-parallelism`. No test timeout was increased. New regressions execute the actual main hit/drop functions and cover radius refresh, edge clearance, stalled recovery with body or 1–3 stored parts, finishing ammunition, selective loot ranking, projectile instance allocation/disposal, and physical pile contacts. The native seed-29 tower test preserves all 1,919 source parts; its two variants, with zero or 900 real native spent plates, fully settle after 300 physics steps without lifting descending fragments onto higher supports.

`scripts/patch-browser-audit.mjs` passed **seven production-loop fixture entries** with **zero page/console errors**. The accepted report is `artifacts/patch-final-2026-10-10/report.json`, including loaded module hashes and before/after tower screenshots. The screenshots were inspected separately to verify a local pile rather than a stripe or an artificial tall column.

| Fixture | Observed result |
| --- | --- |
| Same-step collapse | Radius shrinks from 9.24 to 2.2 before the next shot; that shot misses the surviving Core and mass is unchanged |
| Native seed-16 edge arc | The settled part stays at the clear landing point, without an extra fixed edge inset; age and firing lock remain intact |
| Entire wounded squad without resources | All initially recover; actual combat resumes at 10.12 combat seconds without granted healing or new loot |
| Bare Core squad with one real stocked part each | Actual stock fires after stalled recovery; Core remains and mass is unchanged |
| Native seed-29 tower | Forty-five forced 20-part impacts remove the whole tower; all 1,919 unique tower parts move outward and settle, maximum final height 5.30 versus source height 17.10 |
| Volley rendering | Twenty-four 20-part groups carry 480 parts in 48 meshes; 130 draw calls, equal to the 24 one-part groups in the same fixture |
| Secondary-touch DASH | Releasing the DASH finger preserves held fire; DASH starts once, fire-owner release stops firing, and subsequent Enter activation still works |

Fixture grants, forced contacts and frozen RAF stepping are response-only browser instrumentation. The tower fixture deliberately concentrates impacts without cooldown delays to stress a dense pile; it is not an ordinary match. Draw-call counts are software-renderer diagnostics, not gameplay FPS or human balance evidence. `PATCH_AUDIT_OUTPUT` and `PATCH_AUDIT_PORT` override the default ignored output `artifacts/patch-audit` and loopback port 5197; `PLAYWRIGHT_MODULE` and `CHROME_PATH` select existing installations.

The final coordinated-bot rerun passed **11 fixture entries and five native-map smoke runs**, with zero errors and inventory conserved (`artifacts/squad-patch-final-2026-10-10/report.json`). Native runs use normal inventories and a stationary player after forced round entry: rounds 1/2/4/6 remain playing at 30 combat seconds; round 3 ends in player defeat at 11.33 seconds. These observations verify behavior rather than human difficulty. The existing battle regression passed **21 fixture entries** across all five evolution paths with zero errors and no new assisted matches (`artifacts/battle-patch-final-2026-10-10/browser-report.json`, `BATTLE_AUDIT_MATCHES=0`).

The final actual-touch audit passed portrait **390 × 844** and landscape **844 × 390**, movement/firing/release reset and zero overflow/errors (`artifacts/mobile-patch-final-2026-10-10/report.json`). Strict TypeScript/Vite build, all three publication/security guards and the source/build scan passed. Vite's existing large-entry warning remains; no chunk splitting or real-GPU FPS result is claimed.

## Prior coordinated-bot verification, 2026-10-09

The final rule suite passed **446 tests in 23 files** in **55.77 seconds**, using `npm test -- --maxWorkers=2` without concurrent browser work. An earlier concurrent run hit three existing five-second test timeouts; the isolated final run passed every assertion without raising test timeouts. This duration is not gameplay FPS.

`scripts/bot-squad-browser-audit.mjs` passed **11 production-loop fixture entries** and **five native-map smoke runs**, with **zero page/console errors** and physical inventory conserved. Its accepted report is `artifacts/bot-squad-final-v2/report.json`. Fixtures cover round policies 1/2/3/4/6, allied projectile protection in rounds 2/3, immediate injury replacement and real pickup recovery, rapid reserve/body volleys, and actual DASH plus pause/restart. A stocked fighter fired five real 20-part groups with 0.2333-second spacing; an unstocked healthy fighter spent twelve safe attached pieces across four three-part groups with the same spacing, retaining its Core. These are granted-stock/forced-contact fixtures, not earned progression.

Native runs each advanced 30 combat seconds on regenerated maps after forced round entry, with a stationary player and normal bot inventories/pickups. The native fourth round observed a recovery/attack-slot swap without fixture injury. All five remained in combat at the smoke limit; they are partial behavior checks rather than completed matches or human balance measurements. Loaded production module hashes are included in the report.

To repeat the command/team audit: `node scripts/bot-squad-browser-audit.mjs`. `SQUAD_AUDIT_OUTPUT`, `SQUAD_AUDIT_SEED`, `SQUAD_AUDIT_PORT`, `SQUAD_AUDIT_URL`, `PLAYWRIGHT_MODULE` and `CHROME_PATH` are configurable. The default seed is 927. Response-only instrumentation freezes RAF stepping and adds disposable fixtures; it does not modify game source or give bots runtime resources.

Final strict TypeScript/Vite build and three publication/security guards passed. The existing battle regression passed all **21 fixture entries** across five evolution paths with zero errors (`artifacts/battle-audit-squad-final/browser-report.json`, `BATTLE_AUDIT_MATCHES=0`). The separate real-touch audit passed portrait 390 × 844 and landscape 844 × 390, movement/firing/release reset and zero overflow/errors (`artifacts/mobile-audit-squad-final/report.json`). No new full assisted matches are claimed in this stage.

## Prior arena-aligned HUD verification, 2026-10-09

The production HUD audit passed **11 viewport/DPR cases** with **zero page/console errors**, equal desktop column bounds, arena-base alignment, no card clipping or horizontal overflow, and working range, DASH, pause/resume and defeat controls. Range input changed between 19/20 without firing. The accepted report is `artifacts/hud-arena-final-v2/report.json`.

| Cases | CSS viewport and DPR |
| --- | --- |
| Large desktop | 1971 × 862 and 1872 × 879, DPR 1 |
| Laptop and boundary | 1366 × 768 at DPR 1/2; 1281 × 768 at DPR 1 |
| Compact desktop | 1024 × 768 at DPR 1 |
| Zoom equivalents | 1314 × 575 at DPR 1.5; 986 × 431 at DPR 2 |
| Short fine-pointer window | 1366 × 480 at DPR 1 |
| Coarse-pointer touch | Portrait 390 × 844 and landscape 844 × 390, DPR 2 |

The desktop contract applies above 1280 pixels wide and at least 600 pixels high: equal `clamp(280px, 17vw, 336px)` widths, projected outer-base top/bottom anchors, matching 44/56 rows and large common Segoe UI/Arial typography. Compact layouts cover smaller windows; fine-pointer heights of 500 pixels or less use a 64-pixel top and header-only Backpack. Forty camera/layout cycles preserved the anchors, and shake did not move them. GPU drawing was suppressed only inside that stability loop; these checks do not measure GPU FPS. Zoom-equivalent viewport/DPR cases are not native browser-zoom tests.

Granted stock of 240 parts and separate five-digit display checks were isolated layout fixtures, not naturally earned progression. Normal screenshots show native counts; `-large-counts` images show the separate display fixture. Six focused rendering tests passed in **1.47 seconds**; strict TypeScript/Vite build, three Node publication/security guards and the security scan passed.

The final battle regression passed **21 fixture entries** with **zero page/console errors** across all five evolution paths, recorded in `artifacts/battle-audit-hud-final/browser-report.json`. It ran `scripts/battle-browser-audit.mjs` with `BATTLE_AUDIT_MATCHES=0`, using granted complete forms and forced cases for corner framing, picking/hits, fired locks, rune behavior, defeat/victory and controls. The previously recorded five assisted matches belong to the prior snapshot below.

The final separate mobile audit passed portrait **390 × 844** and landscape **844 × 390**, with real coarse-pointer contexts, CDP-dispatched movement/firing touches and input reset after release. Both had zero horizontal overflow and zero page/console errors. Its accepted report is `artifacts/mobile-audit-hud-final/report.json`.

## Prior fixed-height HUD, immediate-defeat and bot record, 2026-10-09

The following accepted evidence predates the current enlarged, arena-aligned HUD and its short-window correction. It verifies that recorded snapshot rather than the latest layout.

The preceding aligned-HUD, immediate-defeat and purposeful-bot snapshot passed **367 tests in 21 files** in **188.29 seconds**, while browser/QA work ran concurrently. Strict TypeScript/Vite production build passed after that snapshot's code changes; the three Node publication/security guards also passed. This test-run duration is not a gameplay performance measurement.

Focused isolated HUD checks passed desktop 1872 × 879 and 1366 × 768, portrait 390 × 844 and landscape 844 × 390, with zero page/console errors or horizontal overflow. All **21 side-panel text roles** computed the same Segoe UI/Arial font family. Desktop columns had equal widths, top/bottom edges and **480-pixel heights**, with equal card rows. Native range arrows/Home/End, pointer/keyboard isolation, simultaneous CDP slider/joystick touch, DASH, pause focus/Tab wrapping, defeat/restart/character selection and the absence of a fabricated winner/placement were checked. The report is `artifacts/hud-unified-font-check/report.json`. The final actual-game review at all four viewports confirmed the transparent shared-renderer Backpack preview, equal desktop columns, readable text and correct canvas resizing.

The final battle audit passed **five assisted matches plus 21 separate fixture entries**, with **zero page/console errors** and conservation in every checked batch. All five matches ended in immediate player defeat; three ended with three bots still alive and two with one bot alive. Victory, reward collection and Next Round were verified in separate fixtures. The accepted report is `artifacts/battle-audit-hud-defeat-final/browser-report.json`; per-path durations and masses are in [Gameplay audit](GAMEPLAY_AUDIT.md). Granted bodies, forced contacts and eliminations remain separate from assisted matches.

The separate mobile audit passed portrait 390 × 844 and landscape 844 × 390, using coarse-pointer contexts and actual joystick/firing touches, with no horizontal overflow or page/console errors. Its report is `artifacts/mobile-audit-hud-defeat-final/report.json`.

A 90-combat-second AI smoke run recorded preparation ending within six seconds, then hunting, evasion, cover clearing, flanking and finishing decisions. It saw two eliminations, conserved **10,727 parts** and recorded zero errors. Its report is `artifacts/bot-purpose-smoke.json`. This deterministic smoke run checks active behavior and inventory conservation; it does not establish human balance.

## Prior snapshot evidence

The earlier 2026-10-09 volley/rune snapshot passed **349 tests in 20 files** in **130.08 seconds**, build and three security guards. Its accepted browser record was five assisted matches plus 19 fixtures with zero errors, in `artifacts/battle-audit-volley-final/browser-report.json`. All ended with one surviving Core: Bass Titan won as the player, while the four bot wins completed the former spectator flow. The final isolated rendering recheck passed 15 fixtures in `artifacts/battle-render-volley-final/browser-report.json`; both mobile orientations passed in `artifacts/mobile-audit-volley-final/report.json`. These are historical results from before immediate defeat, the aligned HUD and the current bot decision changes.

Before the volley, rune and compact-HUD changes on 2026-10-09, the preceding battle snapshot passed 298 tests in 19 files in 103.44 seconds, build/security checks, five assisted matches plus 14 fixtures with zero page/console errors, and both separate coarse-pointer mobile viewports. Its accepted reports are `artifacts/battle-audit-final/browser-report.json` and `artifacts/mobile-audit-final/report.json`. Those results do not certify later source changes.

The 2026-10-06 duel verification (199 integrated tests, followed by a 200-test deployment check, plus 100 assisted duel matches) remains historical. It does not verify the present four-actor entry point, physical ammunition, building cover or immediate-defeat flow. See [Gameplay audit](GAMEPLAY_AUDIT.md) for the retained record.

## Run the maintained checks

```sh
npm test
npm run build
npm run security:check
npm run test:mobile
```

The build runs strict TypeScript checks before producing `dist/`; it does not run tests or regenerate assets. The GitHub Pages workflow runs tests, build and publication guards before deployment. No coverage threshold is configured.

For a serial run, particularly when the retained long-run structure stress case reaches a worker/timeout limit:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
```

Focused current battle checks:

```sh
npm test -- src/game/ammunition.test.ts src/game/projectiles.test.ts src/game/rune.test.ts
npm test -- src/game/arena.test.ts src/game/battle-combat.test.ts
npm test -- src/game/battle.test.ts src/game/bots.test.ts src/game/victory.test.ts
npm test -- src/game/combat-debris.test.ts src/game/debris-motion.test.ts src/game/debris.test.ts --maxWorkers=1 --no-file-parallelism
npm test -- src/game/bot-squad.test.ts src/game/bot-squad-ai.test.ts src/render.test.ts
node scripts/patch-browser-audit.mjs
```

After portrait/generator changes, run `npm run assets:generate`. After authored body changes, rebuild/audit prototypes and run `npx tsx scripts/generate-evolutions.ts`; see [Evolution](EVOLUTION.md). Build alone does neither.

## Automated scope

| Area | Maintained evidence |
| --- | --- |
| Four-fighter rounds | `battle.test.ts`: roster, namespaces, immediate player-loss/sole-player outcome, fallen bank release, continuation, restarted base inventory |
| Battle contacts | `battle-combat.test.ts`: nearest non-owner/live actor or remaining cover, cover blocking, rebound immunity and exact-part width |
| Physical ammo | `ammunition.test.ts`: reserve-first 1–20 batches, shortages, Core exclusion, deterministic body removal, surviving connectivity, no firing cascade and conservation |
| Fired parts | `projectiles.test.ts`: exact grouped parts, compact offsets/radius, actual-count damage, continuous age, impact/landing locks, boundary arcs, clear interior landing and unavailable landing retention |
| Color rune | `rune.test.ts`: 30-second intervals, missed-rune persistence, deterministic living contact, original head/authored body palettes, unchanged IDs/geometry/stock and one-time painting |
| Arena | `arena.test.ts`: seeded variants, five templates, compatible/unique pieces, full-form spawn-to-center routes, floor support, local demolition conservation, current holes, swept movement/dash, sliding and stable growth recovery |
| Battle bots | `bots.test.ts` and `battle.test.ts`: multi-opponent vulnerability, loot/repair/stock, building harvest, footprint routing/avoidance, offensive cover clearing even with a valid proxy route, opening tiers/styles, preparation capped at six seconds, stable hunting/finishing targets, recovery without disrupting in-range repairs, flanking/cover clearing, interception/opening-aware batches, pressure intent and threats |
| Bot coordination | `bot-squad.test.ts`, `bot-squad-ai.test.ts`: alliances, immediate replacement, recovery hysteresis/starvation, real stocked/body fallback, finite DASH, cooldown-bound volleys, finishing stock economy and skipped irrelevant floor ranking |
| Debris integration | `combat-debris.test.ts`, `debris.test.ts`, `debris-motion.test.ts`: actual main same-step bounds/edge landing, exact-part tower scatter, dense native pile settling, top-face crossing, bounded side contacts, swept cover/arena clearance, age/lock conservation and support cache |
| Structure/Core | `structure.test.ts`, `core-protection.test.ts`, `collision.test.ts`: face connectivity, geometry, random damage, cascades, exposure and swept circles |
| Pickup/evolution | Pickup and evolution tests: nearest-first ownership, fired locks, exact slots, all 170 head/path/phase combinations, reserve caches, repair, transition and part conservation |
| Rewards | `victory.test.ts`: bounded loose-reward collection, reserve assembly, fired lock, eligibility, phase transition and completion |
| Assets/rendering | Template/renderer tests: source provenance, geometry/connectivity, instance allocation, all 6,241 floor markers within their instance buffer, and picking against Three.js |
| Compatibility | `rounds.test.ts`, `combat.integration.test.ts`, `gameplay.audit.test.ts`: retained duel and legacy free-growth API scenarios |

Compatibility tests still protect shared damage, geometry, assembly and carryover behavior. Their direct-damage 20-round scenarios are not current four-fighter browser matches. The legacy free-growth stress fixture grants parts and checks allocation; it does not model live planned progression or establish FPS.

## Current browser harness

```sh
node scripts/battle-browser-audit.mjs
```

The default runs one assisted match per evolution, five total, followed by separate granted/instrumented fixtures. The production four-actor `tick()`, bots, ammunition, movement, impacts, building damage, pickup and result flow remain active during assisted matches. A disposable controller drives the player; fixed simulation stepping replaces ordinary RAF scheduling.

The script records loaded module hashes, per-match winner/placement/duration/part counts, fixture results, and page/console errors. Its default output is ignored `artifacts/battle-audit/browser-report.json`; the aligned-HUD/immediate-defeat rerun uses `artifacts/battle-audit-hud-defeat-final/browser-report.json`. Conservation includes buildings, every fighter/stock, shots and drops. Cross-round assertions compare the player's exact carried inventory.

The default five-path battle harness records **21 fixture entries**, separate from assisted matches. Five entries are complete-body reports, one per path, each testing both stages 2 and 3: exact full assembly, framing at four clamped arena corners, and a shot at a stationary rival in an isolated arena without cover. That rival is placed beyond the bodies' separation distance. Each report also collects a rune on the granted final body, checking its authored palette and unchanged installed IDs/geometry/shapes, stock and mass. These ten granted body states test rendering/contact and painting integration rather than naturally earned progression or combat through terrain.

The other sixteen entries are:

| Fixture | Isolated check |
| --- | --- |
| Unified HUD/range | Rivals, clock and enemy stock absent; player summary present; native keyboard slider updates requested volley without firing |
| Real-part volley (three entries) | Counts 1, 3 and 20 each spend and visibly carry the same number of parts, deal that direct damage to a sufficient fixture target, return all parts with lock five, and preserve mass |
| Center rune | No early spawn, collection at 30 seconds, original-head palette, renewed availability at 60 seconds, visible cube and mass conservation |
| Combat pause | Logical state freezes |
| Reserve-first/rebound | Exact stock part fires; all owners respect landing and age-five lock |
| Close shot | Normal close-range actor impact preserves the fired part and mass |
| Cover shot | Terrain takes the hit before the rival behind it |
| Last impact | Two fired parts retain correct continuous ages when one hit ends combat; both ages equal elapsed combat time and retain lock five on entry to collection |
| Lethal player impact | Immediate defeat stops later projectile contacts in the same step; remaining shots become age-preserving locked drops, and simulation/input stay frozen |
| Fallen bank | Eliminated stock becomes contested drops exactly once |
| Immediate result | Player loss with two rivals alive shows defeat without a winner, spectator phase or Next Round |
| Victory/continuation | Fired lock, reward pause, exact carryover and regenerated map |
| Aligned desktop HUD | Actual game at 1872 × 879 and 1366 × 768 has equal column widths/top/heights/bottom edges, readable common typography and visible stock preview |
| Narrow HUD | Portrait 390 × 844 keeps the parts slider visible, rivals absent and horizontal overflow zero |

Fixtures grant or relocate parts/actors and trigger eliminations where needed. They are integration checks, not naturally earned match outcomes.

The script uses an existing Playwright runtime and Chrome. Override `PLAYWRIGHT_MODULE` and `CHROME_PATH` for other installations. Controls include `BATTLE_AUDIT_PORT` (default 5194), `BATTLE_AUDIT_SEED` (413), `BATTLE_AUDIT_MATCHES` (one per path), and `BATTLE_AUDIT_OUTPUT`. Optional positional arguments select path IDs. An assertion failure is saved before browser/server cleanup.

`npm run test:mobile` runs the separate `scripts/mobile-browser-audit.mjs` audit at portrait 390 × 844 and landscape 844 × 390. It checks a real coarse-pointer/touch context and CDP-dispatched joystick plus firing touches, movement/shots, input reset after release, and layout. Its default report is `artifacts/mobile-audit/report.json`; `MOBILE_AUDIT_PORT` and `MOBILE_AUDIT_OUTPUT` are configurable. Landscape coverage belongs to this audit, not the battle harness's portrait HUD fixture.

`scripts/gameplay-browser-audit.mjs` is the historical duel harness. Its response instrumentation assumes the old two-actor loop; it is not the maintained harness for the current entry point. The older English/evolution browser reviews under ignored `artifacts/` have the same snapshot limitation.

Headless software rendering and assisted fixed-step matches cannot measure human balance or real GPU FPS. Run performance sampling separately from tests/browser audits. See [Performance audit](PERFORMANCE_AUDIT.md) and [Security audit](SECURITY_AUDIT.md) for their dated scopes; earlier results are not automatically current-runtime certifications.

## Manual browser checklist

| Check | Expected behavior |
| --- | --- |
| Lobby | All 17 heads and five paths selectable; pagination preserves selection; sound, credits and focus work |
| Start | Four corner spawns, aligned build/Backpack and DASH/range columns, twenty buildings/five types, four wide routes and opening debris; no rival/time/round/alive HUD or pickup toast |
| Ammo | Request 1–20 parts, default 1; reserve fires before body, actual available count sets damage, every identity/shape/color/size appears; body removal creates no cascade; bare Core cannot fire |
| Shots | Close targets remain hittable; nearest cover blocks an actor; hit parts land as loot; boundary arcs do no damage |
| Recovery | Every part in a volley waits until landing and age five for every actor, including after rebound and during rewards |
| Rune | Center cube appears each 30 combat seconds; living player/bot contact paints installed head/body once, preserves missing parts/stock/IDs/geometry, leaves later loot colors ordinary, and does not stack uncollected cubes |
| Cover | Movement and dash stop/slide; damage removes local bricks and unsupported sections; demolished gaps admit shots and movement; full-form growth recovery leaves a stable clear position |
| Combat | Bots prepare for at most six seconds, then hunt/finish, recover, clear/flank cover or evade with real ammo; fallen stock is contestable while the player lives |
| Elimination | Bot death releases stock and combat continues; player death immediately shows DEFEAT / You Lost and freezes logic, ages, rune time and inputs; Restart/Choose Character remain, Next Round stays hidden |
| Victory | Only the final surviving player collects loose rewards; standing buildings remain; Next Round preserves exact inventory and creates fresh bots/map |
| Evolution | Compatible repair precedes growth; 85% phase-2 completion can transition only after victory processing; no new parts are granted |
| Pause/focus | Combat/reward time, locks, rune clock, cooldowns and processing freeze; held input clears; resume returns to the same phase |
| Touch/layout | Joystick/arena aim/fire and DASH work; slider remains touch-accessible and isolated, clears joystick, and player-only HUD has no portrait/landscape overflow |
| Presentation | Full bodies fit camera; all side-panel roles share Segoe UI/Arial, desktop columns align in width/height/bottom, stock counts and visible 3D sample agree, keyboard focus/audio/reduced motion work |

## Runtime diagnostics and limits

Read `window.__arenaSnapshot` in development. It reports phase/round/time, player and all fighters, alive count, player placement, winner, building count/revisions, stock, requested shot count, rune state, drops/volley groups, part mass, combat events, input, statistics and draw calls. It has no remote calls, telemetry or save capability.

The enlarged floor grid allocates all 6,241 markers before writing their matrices; the regression checks the final marker and instance capacity. A visual review on the 160-unit map confirmed the former gray bands were absent.

The harness injects QA controls into disposable module responses; production source/build does not contain those controls. Screenshots, reports and profiles remain ignored local artifacts.

Node tests do not run browser WebGL or prove all DOM flows. Software-rendered browser fixtures do not verify sustained 60 FPS, driver/device compatibility, sound on every browser, native focus behavior, all accessibility tools, or human match balance. Current evidence must be tied to its loaded source snapshot.
