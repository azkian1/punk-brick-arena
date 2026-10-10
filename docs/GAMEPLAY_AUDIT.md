# Gameplay audit

## Current v2 audit-fix verification, 2026-10-10

The playable runtime is one player plus three bots with immediate player defeat, physical inventory ammunition and escalating alliances. The final audit-fix suite passes **552 tests in 31 files** in **91.01 seconds** with serial workers and existing timeouts. Strict TypeScript/Vite build and all three publication/security guards pass; the entry is 2,779.85 kB / 442.29 kB gzip, with the existing large-chunk warning.

Final browser reruns pass fourteen squad fixtures plus five native-map smokes, ten patch fixtures and 21 battle fixtures, with zero errors. They retain exact inventory, real attacker/collector growth during hostile fire, legal cooldown/DASH, allied guards, rune/fired-loot locks, immediate defeat, carryover and HUD alignment. The final battle run excludes assisted matches (`BATTLE_AUDIT_MATCHES=0`); native smokes use a stationary player after forced round entry. The optional growth fixture now places its part relative to the actual pickup radius so the existing rush cutoff remains meaningful.

New regressions verify exact indexed resource/pickup queries, persistent debris support, shared stock counts, optional resource timing during dodges and navigation resuming within 192 yielded work units per bot step. Fragmented-cover routes preserve safe movement and reach actual pickup range; the narrow-opening fixture spends a real part to clear cover, traverses the opened passage and resumes hostile fire. [Testing](TESTING.md) and [Audit fixes](AUDIT_FIXES_2026-10-10.md) preserve exact report paths, hashes, grants and limits. Separate short hardware workloads are recorded in [Performance audit](PERFORMANCE_AUDIT.md).

The dated comparisons below describe their earlier production snapshots. Their match outcomes, test counts and bundle sizes do not replace the current verification above.

## Prior hardcore behavior comparison, 2026-10-10

Full-strength combat begins in round one. Bots solve moving-target intercepts using actual projectile speed and per-axis arena stopping, adjust an active dodge when another firing lane appears, and use the legal player-rate cooldown for viable hostile shots. Volleys spend real parts according to range, target size/speed, danger, stock and finishing mass. Useful growth remains available while firing; healthy optional detours have limited collection windows so bots return to pressure. Recovery, five-second fired-loot locks, allied damage protection and Core ammunition guards remain intact.

Round two's allied pair can switch early to a reachable wounded hostile. Round three assigns three crossfire sectors. Round four and later normally maintain two attackers and a collector, rotate a stronger healthy collector into an attack slot after a minimum tenure and score margin, replace wounded attackers, and let healthy support join a reachable finishing opportunity. A repaired target's permanent exposure flag alone does not trigger support rush.

The before/after native comparison uses matching map hashes for seeds 927 and 48, ordinary inventories, a scripted moving/firing/DASH player, forced round entry and a maximum of 30 combat seconds:

| Seed | Round | Prior seconds / outcome | Current seconds / outcome |
| --- | ---: | --- | --- |
| 927 | 1 | 30.00 / playing | 30.00 / playing |
| 927 | 2 | 30.00 / playing | 30.00 / playing |
| 927 | 3 | 16.43 / defeat | 13.68 / defeat |
| 927 | 4 | 11.13 / defeat | 15.00 / defeat |
| 927 | 6 | 25.15 / defeat | 11.82 / defeat |
| 48 | 1 | 30.00 / playing | 30.00 / playing |
| 48 | 2 | 30.00 / playing | 30.00 / playing |
| 48 | 3 | 14.07 / defeat | 9.37 / defeat |
| 48 | 4 | 30.00 / playing | 9.70 / defeat |
| 48 | 6 | 21.47 / defeat | 15.32 / defeat |

Current bots defeat that player in six runs versus five previously, including every sampled coalition round. One fourth-round case takes longer; early free-for-all/pair cases still reach the limit. This is not a claim of improvement for every seed or a human balance result. Player shots/hits change from 613/238 to 378/46; those totals combine changed routes, pressure, duration and evasion, so they are not a controlled dodge-success percentage.

Separate isolated open-arena pressure fixtures grant one active bot 80 physical reserve parts: six current player defeats versus one prior defeat over ten cases. They verify legal cadence, moving-target hits and conservation, rather than naturally earned ammunition. Both benchmark variants record zero errors. Reports and exact scope are in [Testing](TESTING.md). The final squad rerun also passes fourteen integration fixtures and five stationary-player native-map smokes, preserving actual growth, alliances, recovery, DASH and inventory.

At this prior snapshot, the full rule suite passed **541 tests in 29 files**, without increasing timeouts. Strict TypeScript/Vite build, all three publication/security guards, 21 battle regressions, ten patch regressions and both actual-touch orientations passed. Its entry size was 2,773.18 kB / 439.94 kB gzip; the existing large-chunk warning remained. The previous growth-only results below belong to their earlier snapshot.

## Prior bot growth behavior, 2026-10-10

Incomplete bots seek parts that fit the current repair/growth frontier, including healthy stocked attackers and independent fighters after preparation. Movement toward useful loot can continue while aiming and firing at a viable hostile. Useful building mining approaches pickup reach and fires with the ordinary 0.23-second runtime cooldown in every round. Harvest volleys spend small real groups, usually 1–4; stocked bots can target a rare matching part among unsuitable material. Body-only mining has yield and armour-budget guards. Recovery, emergency evasion and finishing opportunities retain priority.

The production-loop squad report passed **14 fixtures and five native-map smoke runs**, with **zero errors** and exact mass conservation (`artifacts/squad-growth-final-2026-10-10/report.json`, seed 927). The three added fixtures prove actual installation while an attacker/collector moves and fires, and early-round rapid building fire followed by real growth. Each moving-role fixture installed one exact donated part and fired twice; the mining fixture installed a real construction part, increased body progress from zero to two and fired its first five four-part volleys 0.2333 seconds apart. Granted resources in these fixtures are explicit instrumentation, not runtime bot grants. Growth and mining screenshots were inspected.

Native runs use normal inventories and pickups with a stationary player after forced round entry. The counts below are attached authored body parts at the end, so later damage can reduce them; they are not repair/growth grants or guaranteed growth in every round.

| Forced round | Combat seconds | Outcome | Bot shots (1/2/3) | Bot DASH starts (1/2/3) | Attached body parts (1/2/3) | Final roles | Conserved parts |
| --- | ---: | --- | --- | --- | --- | --- | ---: |
| 1 | 30.00 | Playing | 20 / 13 / 18 | 11 / 12 / 11 | 0 / 3 / 4 | independent / independent / independent | 3,943 |
| 2 | 30.00 | Playing | 80 / 44 / 59 | 12 / 13 / 12 | 0 / 0 / 0 | attacker / attacker / independent | 3,954 |
| 3 | 22.50 | Player defeat | 31 / 17 / 18 | 8 / 9 / 10 | 0 / 0 / 119 | attacker / attacker / attacker | 3,965 |
| 4 | 30.00 | Playing | 17 / 4 / 11 | 11 / 13 / 8 | 41 / 33 / 24 | attacker / attacker / collector | 3,996 |
| 6 | 19.77 | Player defeat | 46 / 73 / 17 | 6 / 5 / 6 | 0 / 0 / 12 | attacker / attacker / collector | 3,912 |

These are partial behavior runs rather than completed wins or human balance measurements. See [Testing](TESTING.md) for the final rule-suite, build and other browser results.

The final isolated rule suite passes **507 tests in 28 files** in **129.58 seconds**, retaining the default/existing timeouts and all mixed-map/dense-physics regressions. Strict TypeScript/Vite build, all three publication/security guards, 21 battle fixtures, ten patch fixtures and both actual-touch orientations pass. The existing large-entry warning remains.

## Prior mixed-part constructions, 2026-10-10

The live generator uses all **57 actual size/shape combinations** from the 17 heads and ten authored body plans. Twenty buildings retain five categories but vary in quantity, asymmetry and silhouette, using long bricks, broad plates and studless tiles. No part is resized or given an unavailable orientation. Supported face connectivity, non-overlap, 2.2-unit inter-building clearance and the four 52-unit-wide routes are covered by rule tests.

The final serial suite passed **487 tests in 27 files** in **87.47 seconds**. Its mixed-loot integration preserves every identity, dimension, shape and color through demolition, physical settling, repair, growth, bank, body/reserve ammunition and rebound. It also found and fixed an actual long-plate stall in a narrow cover corridor; the exact-coordinate regression checks a local tangent exit without lifting or crossing a wall. Earlier dense collapses retain original test-only geometry, so changing the map does not weaken those checks.

The updated patch browser report passed **10 fixtures with zero errors** (`artifacts/mixed-arena-final-2026-10-10/report.json`). Seeds 1/48/927 contain 20 buildings each, all 57 types and respectively 1,984 / 2,357 / 2,138 cover parts. Individual counts range 37–231 / 35–316 / 38–304. The three actual map screenshots were reviewed for mixed silhouettes and readable framing. A current 162-part tower settles completely after two forced 20-part impacts: all identities remain, debris scatters in two dimensions, final height is 2.92 versus source 17.30, and maximum distance is 9.75. Those forced impacts are separate from ordinary combat.

The five-path battle regression also passed **21 fixtures with zero errors**, without new assisted matches (`artifacts/battle-mixed-final-2026-10-10/browser-report.json`, `BATTLE_AUDIT_MATCHES=0`). The squad rerun passed **11 fixtures and five native-map smoke runs** with zero errors and conservation (`artifacts/squad-mixed-final-2026-10-10/report.json`, seed 927). Each smoke run uses normal inventories/pickups and a stationary player after forced round entry:

| Forced round | Combat seconds | Outcome | Bot shots (1/2/3) | Bot DASH starts (1/2/3) | Final roles | Conserved parts |
| --- | ---: | --- | --- | --- | --- | ---: |
| 1 | 30.00 | Playing | 18 / 16 / 19 | 10 / 9 / 8 | independent / independent / independent | 4,099 |
| 2 | 30.00 | Playing | 68 / 75 / 37 | 8 / 10 / 7 | attacker / attacker / independent | 3,951 |
| 3 | 9.97 | Player defeat | 16 / 28 / 27 | 4 / 1 / 3 | attacker / attacker / attacker | 3,990 |
| 4 | 30.00 | Playing | 100 / 87 / 17 | 4 / 3 / 5 | attacker / attacker / collector | 3,836 |
| 6 | 30.00 | Playing | 97 / 89 / 13 | 4 / 4 / 3 | attacker / collector / attacker | 3,934 |

Actual-touch portrait/landscape checks passed with zero overflow/errors and input reset (`artifacts/mobile-mixed-final-2026-10-10/report.json`). Strict TypeScript/Vite production build and all three publication/security guards passed. See [Testing](TESTING.md) for reproduction and fixture scope; these partial native runs and fixed-step software rendering do not establish human balance or GPU FPS.

## Prior audit corrections, 2026-10-10

The audit corrections preserve real inventory while fixing stale hit radii, safe edge landings, touch DASH/firing ownership, stocked finishing volleys, unnecessary attacker loot ranking and recovery starvation. If every squad member needs recovery and attached counts stop improving for eight seconds, up to two armed members resume combat. This order stays latched until recovery or ammunition exhaustion; even a bare Core with real reserve can spend that reserve, while Core is never ammunition. Normal pickup and repair rules remain active.

Building fragments now retain their world source positions and receive bounded outward impulses. Local clearance avoids the old actor-center relocation; swept cover/arena checks guard subsequent movement. A falling part lands only on an overlapping top face crossed from above. Parts entering a pile sideways move locally aside instead of being lifted onto its top.

The isolated rule suite passed **481 tests in 26 files** in **87.00 seconds**, with serial workers and unchanged timeouts. The new browser regression passed **seven entries** with zero errors in `artifacts/patch-final-2026-10-10/report.json`. Native seed-16 rebound landing stays clear. Both resource-starved wounded bots and Core-only stocked bots resume physical firing without healing grants, and inventory is conserved. A native 1,919-part tower destroyed by 45 forced 20-part impacts retains every identity, settles in two dimensions around its base and ends at height 5.30 rather than the original source height 17.10. Its before/after screenshots were inspected. The denser Node regression adds 900 existing native plates and verifies complete settling, unchanged IDs/geometry/colors and no artificial upward trajectory.

These tower impacts and starvation scenarios are isolated forced fixtures, not earned progression or completed matches. The volley fixture verifies bounded draw calls and shared-resource disposal rather than FPS. See [Testing](TESTING.md) for exact accepted scopes and reproduction.

The final coordinated-bot browser rerun passed **11 fixture entries** and the following **five native-map smoke runs**, with zero errors and exact inventory conservation (`artifacts/squad-patch-final-2026-10-10/report.json`, seed 927). These runs use normal inventories/pickups, regenerated maps and a stationary player after forced round entry. Four stop at 30 combat seconds; the third ends earlier through the actual immediate-defeat flow.

| Forced round | Combat seconds | Outcome | Bot shots (1/2/3) | Bot DASH starts (1/2/3) | Final roles | Conserved parts |
| --- | ---: | --- | --- | --- | --- | ---: |
| 1 | 30.00 | Playing | 32 / 21 / 33 | 9 / 6 / 10 | independent / independent / independent | 11,957 |
| 2 | 30.00 | Playing | 31 / 75 / 46 | 2 / 9 / 8 | attacker / attacker / independent | 12,261 |
| 3 | 11.33 | Player defeat | 22 / 33 / 25 | 4 / 3 / 2 | attacker / attacker / attacker | 12,579 |
| 4 | 30.00 | Playing | 86 / 89 / 41 | 4 / 5 / 1 | attacker / recover / attacker | 10,292 |
| 6 | 30.00 | Playing | 96 / 93 / 47 | 5 / 1 / 1 | attacker / attacker / collector | 12,671 |

The battle regression also passed all **21 fixture entries** across five paths without new assisted matches (`artifacts/battle-patch-final-2026-10-10/browser-report.json`). Actual-touch portrait/landscape checks passed in `artifacts/mobile-patch-final-2026-10-10/report.json`. Strict TypeScript/Vite build and three publication/security guards passed. Native smoke outcomes are behavior observations, not human win rates or performance measurements.

## Prior coordinated-bot verification, 2026-10-09

Round 1 remains free-for-all; round 2 allies bot-1/bot-2 against the other independent fighters; from round 3 all bots ally against the player. From round 4, healthy members keep two attackers and one collector, with immediate replacement when an attacker reaches 65% of its attained attached peak. Recovery ends at 90%; inventories and Core exposure are never fabricated or reset by role decisions. The opening toast announces the round's challenge. Bots use finite, cooldown-bound DASH and adaptive real-part batches; healthy combat in later rounds can use the player's 0.23-second firing interval even with safe body ammunition.

The final isolated rule suite passed **446 tests in 23 files** in **55.77 seconds**, using two workers. Three existing five-second timeouts in a concurrent browser/test attempt were absent from this isolated run; the timeout setting was not raised. The accepted production-loop report is `artifacts/bot-squad-final-v2/report.json`: **11 isolated fixture entries**, **five native-map smoke runs**, zero errors, and inventory conservation throughout.

| Forced round entry | Combat seconds | Bot shots (1/2/3) | Bot DASH starts (1/2/3) | Roles at smoke limit |
| --- | ---: | --- | --- | --- |
| 1 | 30 | 24 / 16 / 17 | 9 / 10 / 8 | independent / independent / independent |
| 2 | 30 | 97 / 98 / 26 | 7 / 9 / 5 | attacker / attacker / independent |
| 3 | 30 | 80 / 47 / 41 | 8 / 1 / 0 | attacker / attacker / attacker |
| 4 | 30 | 72 / 102 / 38 | 6 / 3 / 4 | recover / attacker / attacker |
| 6 | 30 | 80 / 40 / 44 | 7 / 0 / 1 | attacker / attacker / collector |

These native-map runs use a stationary player and normal bot resource rules after forced round entry with a base carried head. All were still playing at the smoke limit; they are partial behavior checks, not completed wins or human balance evidence. In round 4 the collector grew and banked actual parts, then replaced a damaged attacker around 26 seconds; the replacement moved into combat and hit the player, while the damaged bot sought recovery. The player's normal automatic repairs can increase its count while it stands still.

Separate granted-stock/forced-contact fixtures verify alliances, immediate replacement and actual pickup recovery, Core-safe reserve/body fire, finite real DASH and frozen/restarted timers. Stock fire spent five groups of 20 parts; body fire spent four groups of three. Spacing was 0.2333 seconds, never faster than 0.23. Loaded production module hashes and raw samples are in the report. See [Testing](TESTING.md) for repeat commands and earlier evidence scopes.

The final strict TypeScript/Vite build and three publication/security guards passed. All 21 earlier combat/progression fixture entries passed across five evolution paths, with no new assisted matches (`artifacts/battle-audit-squad-final/browser-report.json`). The separate actual-touch audit passed both orientations, input reset and zero overflow/errors (`artifacts/mobile-audit-squad-final/report.json`).

## Prior arena-aligned HUD verification, 2026-10-09

At viewport widths above 1280 pixels and heights of at least 600 pixels, the desktop HUD has two equally sized columns aligned with the projected outer arena base: build/Core and Backpack on the left, DASH and parts per shot on the right. Width is `clamp(280px, 17vw, 336px)` and both columns share top/bottom edges and matching 44/56 card rows. The upper minimum is 280 pixels, reduced to 260 pixels at widths 1281–1440. Segoe UI/Arial numbers are 52–60 pixels, headings 24–28 and captions 16–18. Smaller windows use compact cards; portrait retains a 76-pixel Backpack, while short touch landscape and fine-pointer windows at heights of 500 pixels or less show its header/count. The short fine-pointer top is 64 pixels. The shared WebGL stock preview has transparent container/stage backgrounds and white text header/footer. Rival counters/stock, time/round/alive indicators and pickup-report toasts remain absent; repair/growth totals stay in the player card.

The production HUD audit passed **11 viewport/DPR cases** with **zero page/console errors**, alignment/no-clipping checks, native range input without firing, DASH, pause/resume and defeat controls. Its accepted report is `artifacts/hud-arena-final-v2/report.json`; the case matrix is in [Testing](TESTING.md). Forty camera/layout cycles kept anchors stable, and camera shake did not move the HUD. GPU draw was suppressed only during that stability loop. Granted stock of 240 parts and separate five-digit display checks are layout fixtures, not earned progression; normal screenshots use native counts and `-large-counts` images show the display fixture. Six rendering tests passed in **1.47 seconds**, and strict TypeScript/Vite build plus three Node security guards and the security scan passed.

The final battle regression passed **21 fixture entries** across all five evolution paths with **zero page/console errors**, recorded in `artifacts/battle-audit-hud-final/browser-report.json`. It used `BATTLE_AUDIT_MATCHES=0` with granted complete forms and forced framing/picking/hits, locks, rune, defeat/victory and control cases. The five assisted matches below belong to the preceding snapshot. No new full-suite pass is claimed for this HUD revision.

The final separate mobile audit passed portrait **390 × 844** and landscape **844 × 390**, with coarse-pointer contexts, real CDP movement/firing touches, input reset after release, zero horizontal overflow and zero page/console errors. Its accepted report is `artifacts/mobile-audit-hud-final/report.json`.

## Prior fixed-height HUD, immediate-defeat and bot verification, 2026-10-09

The following accepted record predates the enlarged arena-aligned HUD and its short-window correction. That HUD used a top at 80 pixels, 480-pixel equal-height columns, equal card rows and responsive widths of 220–280 pixels. Its results apply to the recorded snapshot.

Player Core destruction immediately displays **DEFEAT / You Lost**. Remaining actors, drop ages, rune time and inputs freeze, pending projectiles become drops with their continuous fired ages and five-second lock preserved, and the result does not fabricate a winner or placement. Restart and Choose Character remain available. There is no spectator flow. Only a sole surviving player completes loose reward collection and can choose Next Round.

Bots keep the same opening difficulty tiers and real-part rules. Resource preparation ends within six combat seconds or earlier after stock/part gains. Hunting keeps a target while automatic nearby pickups repair, changes promptly for reachable finishing blows, leads moving targets and checks actual packed-volley openings. Scarce stock can favor a local flank; obstructing cover can be cleared, recovery remains bounded by need, stale targets are deferred and incoming pressure can trigger evasion.

That snapshot's rule suite passed **367 tests in 21 files** in **188.29 seconds**, with browser/QA work running concurrently. Strict TypeScript/Vite build passed after its code changes, and the three Node security guards passed. Focused HUD checks passed desktop 1872 × 879 and 1366 × 768, portrait 390 × 844 and landscape 844 × 390 with equal desktop bounds, a single computed font family for all 21 roles, range/DASH/touch/pause/result keyboard behavior and zero errors/overflow. The report is `artifacts/hud-unified-font-check/report.json`.

The accepted production browser audit passed **five assisted matches plus 21 separate fixture entries**, with **zero page/console errors** and conservation in every checked batch. Its report is `artifacts/battle-audit-hud-defeat-final/browser-report.json`. Five granted per-path body reports cover both complete stages, four-corner framing, isolated stationary-rival combat without cover and installed rune painting; sixteen other entries cover HUD/range/desktop alignment, actual 1/3/20-part volleys, rune timing, pause, recovery, impacts/cover, lethal player loss and simulation freeze, fallen bank, immediate result, continuation and portrait layout. Granted forms and forced contacts are separate from assisted match outcomes.

All five assisted matches ended in immediate player defeat. A loss can end with multiple bots alive; the UI does not claim a sole winner in that case. Player victory, reward collection and Next Round passed separate granted fixtures.

| Path | Simulated combat seconds | Outcome | Bots alive at result | Conserved part mass |
| --- | ---: | --- | ---: | ---: |
| Mosher | 88.90 | Defeat | 1 | 10,379 |
| Guitar Demon | 39.02 | Defeat | 3 | 11,148 |
| Stage Spider | 66.05 | Defeat | 1 | 12,194 |
| Bass Titan | 47.28 | Defeat | 3 | 12,034 |
| Winged Frontman | 42.32 | Defeat | 3 | 11,037 |

The final separate mobile audit passed portrait 390 × 844 and landscape 844 × 390 with coarse-pointer joystick/firing touches and zero errors/overflow in `artifacts/mobile-audit-hud-defeat-final/report.json`. Actual-game screenshots at both desktop sizes and both mobile orientations were reviewed: the transparent Backpack model, equal desktop columns, readability and canvas resize were correct. The 90-combat-second AI smoke record in `artifacts/bot-purpose-smoke.json` observed preparation within six seconds, hunt/evade/clear/flank/finish decisions, two eliminations and unchanged mass of **10,727 parts**, with zero errors.

These checks establish the recorded source behavior and conservation, not human win rates, match balance or real GPU FPS.

## Prior volley, rune and HUD snapshot, 2026-10-09

The following accepted results predate the aligned HUD, immediate defeat and current bot decisions. Their former spectator outcomes describe only that saved snapshot.

That snapshot used reserve-first volleys of 1–20 actual parts, default 1. One logical shot carries all spent parts, its direct damage equals the available batch, and every fired identity returns as separately locked loot. There is no independent damage tuning. Player running and dashing are 15% faster than the preceding snapshot; base speeds are 19.8375 for the player and 15.20875 for bots before difficulty modifiers.

Its HUD combined the player build/Core, evolution, repair and growth at upper left with Backpack below. DASH and a native parts-per-shot slider occupy the right. Rival cards/stock and time/round/alive counters are absent. Portrait Backpack is 76 pixels high; short landscape shows its header/count. The arena camera uses compact corner overlays to provide a larger clear playable view.

A center rune becomes available every 30 combat seconds, stays until living contact and does not stack. Each pickup restores original selected-head colors and a coherent authored-zone body palette once, without changing installed IDs/geometry/shapes, missing slots, Core state, stock, loose loot or active shots. Later ordinary loot keeps its own color.

The full rule suite passed **349 tests in 20 files** in **130.08 seconds**; strict TypeScript/Vite build and security checks passed, including three Node guards. The focused isolated HUD audit passed desktop 1440 × 900 and both coarse-pointer mobile orientations with zero errors, normal range keys, no gameplay activation from the range, simultaneous slider/joystick touch, DASH, pause focus and no overlap/overflow. Its final compact-HUD report is `artifacts/hud-ui-check/report.json`.

The battle harness then ran five assisted matches plus **19 separate fixtures**: five per-path reports each verify two granted complete forms, four-corner framing, isolated stationary-rival combat without cover, and one-time granted final-body repaint/identity/stock conservation. Fourteen other entries cover HUD/range input; real-part volley counts 1/3/20; center-rune timing at 30/60 seconds; pause; reserve/rebound recovery; close impact; cover blocking; final-impact fired ages; fallen bank; spectating; reward/carryover; and portrait layout. Granted bodies and forced contacts remain separate from assisted matches.

The accepted full battle run passed **five assisted matches and 19 fixtures**, with **zero page/console errors**, one surviving Core per match and conservation in every checked batch. Its report is `artifacts/battle-audit-volley-final/browser-report.json`.

| Path | Simulated combat seconds | Sole winner | Conserved part mass |
| --- | ---: | --- | ---: |
| Mosher | 329.05 | bot-2 | 10,829 |
| Guitar Demon | 184.82 | bot-1 | 11,281 |
| Stage Spider | 575.02 | bot-2 | 10,756 |
| Bass Titan | 229.22 | player | 12,952 |
| Winged Frontman | 440.43 | bot-3 | 13,237 |

The final separate mobile recheck passed portrait 390 × 844 and landscape 844 × 390 after the 76-pixel Backpack change: actual coarse pointer, joystick movement, arena firing, input reset, zero horizontal overflow and zero page/console errors. Its report is `artifacts/mobile-audit-volley-final/report.json`. Landscape coverage belongs to that separate audit.

These durations are assisted simulation time. The results demonstrate completed battle/spectator integration and conservation, not human win rates, balance or GPU FPS. Granted fixture progression remains separate from the five matches.

## Earlier battle snapshot, 2026-10-09

The following accepted record predates the volley, color-rune and compact-HUD changes and applies only to its saved source hashes.

That battle snapshot ran one player and three bots on a regenerated 160 × 160 map with twenty buildings and four 52-unit-wide diagonal routes for complete authored forms. `scripts/battle-browser-audit.mjs` is the maintained browser harness for this mode. It defaults to one assisted match for each of the five evolution paths, followed by separate granted/instrumented fixtures. The final Node suite passed 298 tests in 19 files in 103.44 seconds; the TypeScript/Vite build and security check (three Node tests) passed. The accepted browser audit passed five assisted matches and 14 separate fixture entries, with zero page/console errors. Its report is `artifacts/battle-audit-final/browser-report.json`.

Assisted matches retain production simulation, multi-opponent bots, exact-part ammunition, terrain damage, pickups, spectator flow and final-survivor outcomes. Fixed stepping and a disposable player controller enable repeatability. Every checked batch conserved parts across all bodies/reserves, standing buildings, world drops and projectiles. Loaded source hashes and per-match winner/placement statistics are recorded. All five accepted matches ended with the player as sole survivor:

| Path | Simulated combat seconds | Outcome |
| --- | ---: | --- |
| Mosher | 66.70 | Player victory |
| Guitar Demon | 46.62 | Player victory |
| Stage Spider | 37.65 | Player victory |
| Bass Titan | 55.80 | Player victory |
| Winged Frontman | 39.97 | Player victory |

These are assisted fixture durations, not real-time performance, human win rates, or a target for human match length.

All 14 separate battle fixture entries passed: five path reports each cover complete stage-2 and stage-3 bodies, four-corner framing, and an isolated stationary-rival shot with no cover and non-overlapping body placement. The remaining nine cover combat pause; reserve-first firing/rebound lock; ordinary close impact; cover obstruction; two fired-part ages at the final lethal impact; fallen-bank loot; spectating/final-bot result; reward lock/pause/continuation; and portrait 390 × 844 HUD layout. The last-impact check verifies both fired ages equal elapsed combat time and preserve lock five when collection begins. Forced parts, placements and eliminations remain fixture evidence, not naturally earned progression.

```sh
node scripts/battle-browser-audit.mjs
```

Existing Playwright and Chrome paths are configurable with `PLAYWRIGHT_MODULE` and `CHROME_PATH`. Other controls are `BATTLE_AUDIT_PORT`, `BATTLE_AUDIT_MATCHES`, `BATTLE_AUDIT_SEED`, `BATTLE_AUDIT_OUTPUT`, and optional positional evolution IDs. Default reports/screenshots go to ignored `artifacts/battle-audit/`; the final 2026-10-09 run writes `artifacts/battle-audit-final/browser-report.json`. See [Testing](TESTING.md) for recorded verification and reproduction details.

`npm run test:mobile` is a separate coarse-pointer/CDP touch audit for portrait 390 × 844 and landscape 844 × 390. Its accepted 160-unit-map recheck passed both viewports with a coarse pointer, movement/firing, zero horizontal overflow and zero page/console errors; the report is `artifacts/mobile-audit-final/report.json`. These viewports are not both covered by the battle report's portrait layout fixture.

These assisted software-rendered checks do not establish human win rate, balance, naturally earned progression, or real GPU FPS.

## Historical duel audit, 2026-10-06

The remaining record describes the earlier one-player/one-bot snapshot. Its `scripts/gameplay-browser-audit.mjs` instrumentation is duel-oriented and is not the maintained harness for the current four-actor main loop. The retained `RoundState`/`newRound()`/`nextRound()` and duel API tests continue to check compatibility of shared structure/evolution rules.


This historical audit separates ordinary browser combat, deterministic API round scenarios, and explicitly granted geometry fixtures. None of these runs measures human win rate, player enjoyment, or real-time frame performance.

### Ordinary projectile matches

`scripts/gameplay-browser-audit.mjs` ran 20 consecutive matches for each evolution, 100 matches total, in local Chromium. The production `tick()`, movement, bot decisions, projectile creation/collision, damage, pickup, victory collection, and Next Round flow remained active. An injected controller assisted aim and evasion and advanced fixed simulation steps. It did not grant loot, disable player damage, or directly destroy enemies during these matches. Each path won all 20 matches in this fixture; this is not a balance or difficulty result.

The controller used seed 412. The harness disabled development HMR and ordinary RAF scheduling, recorded executed main/render response hashes, and retained the original module responses. Every 600-step batch preserved the total number of physical parts across both fighters, both reserves, and world drops. Each Next Round preserved the player's ordered piece ID/size/color/shape inventory exactly.

| Path | Matches | Victories | Phase 3 unlocked after round | Body after round 20 | Reserve after round 20 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mosher | 20 | 20 | 11 | 5,366 / 9,718 | 4,224 |
| Guitar Demon | 20 | 20 | 6 | 4,082 / 4,084 | 5,718 |
| Stage Spider | 20 | 20 | 6 | 4,618 / 6,991 | 4,918 |
| Bass Titan | 20 | 20 | 8 | 5,519 / 7,591 | 4,140 |
| Winged Frontman | 20 | 20 | 6 | 5,390 / 5,391 | 4,181 |

The ignored `artifacts/gameplay-audit/browser-report.json` contains the per-match durations, shots, hits, progression, reserve, hashes, and an empty page/console error list. This initial 100-match run used the loaded snapshot recorded in that report. Later stock-identity/connectivity improvements require their own focused checks.

### Retained duel API compatibility scenarios

`src/game/gameplay.audit.test.ts` exercises another 20 rounds per path through production game modules. These 100 deterministic API rounds use repeated standard-power damage rather than simulated projectiles. Each round includes 24 neutral opening drops, contested bot pickups, defeated-bot reserve transfer, automatic reward collection, exact inventory conservation, connected construction, and carryover. Every third round checks player damage and the five-second own-debris restriction before recovery. Each path also checks final defeat, rejection of Next Round, and an empty-reserve/base-body restart.

Separate cases cover invalid position/size rejection, globally unique IDs across body and reserve, cache invalidation on replaced/appended stock and cloned rounds, 300 banked rewards at the 16,000 attached-piece boundary, and full phase-3 Core cascades exceeding 4,000 detached pieces. The capacity case bypasses geometry to reach the boundary quickly; the Core-cascade cases install an authored full-body fixture rather than claiming earned loot.

Connectivity regressions compare the immutable-plan traversal with an independent spatial traversal after standard-power damage and reserve repairs for all five final bodies. They also verify fallback when a caller places a piece outside the blueprint or applies sub-epsilon offsets that change face adjacency. The fast path requires exact slot coordinates and sizes. Phase transition copies the surviving head's corresponding new slot coordinates exactly, avoiding accumulated floating-point neck-offset drift; missing head pieces remain missing.

### Browser geometry and UI fixtures

Granted-body fixtures are separate from the 100 ordinary matches. They check close-range center-origin shots in both body phases, combat pause, reward-collection pause, the result pause guard, phase transition, defeat, hidden Next Round after defeat, and restart. A separate debris fixture drops 12 overlapping pieces, waits for them to settle, and verifies that their rendered vertical spans do not overlap. The initial fixture donor loop could skip a donor when an earlier pickup filled a later slot; its screenshots therefore did not establish complete body coverage. That duel harness snapshots missing slots before supplying parts and asserts `built === target` before each close-range check.

The final fixture rerun passed for all five paths on the 2026-10-06 game/render snapshot, with zero page/console errors. `artifacts/gameplay-audit-final/browser-report.json` records each loaded game module's hash and the verified counts below. Its screenshots show complete final forms; for example Winged Frontman's HUD reads 5,391 / 5,391 body pieces and 100%. Both phase-2 and phase-3 close-range tests recorded exactly one player hit for every path.

| Path | Complete phase-2 body | Complete phase-3 body |
| --- | ---: | ---: |
| Mosher | 2,918 / 2,918 | 9,718 / 9,718 |
| Guitar Demon | 2,285 / 2,285 | 4,084 / 4,084 |
| Stage Spider | 2,345 / 2,345 | 6,991 / 6,991 |
| Bass Titan | 2,725 / 2,725 | 7,591 / 7,591 |
| Winged Frontman | 2,100 / 2,100 | 5,391 / 5,391 |

Full-body camera checks project actual transformed mesh bounds at the player's four clamped arena corners. Every tested box remained inside the canvas frustum. This automatic assertion is not a proof that every possible HUD overlay leaves every brick unobscured. These checks do not certify visual behavior on every device or WebGL driver. Screenshots and reports remain ignored local artifacts.

Pause assertions compare all logical snapshot fields, inventory, drop ages, actor shot cooldowns, dash state, and reward progress. Renderer draw-call counts are excluded because entering pause can hide visual elements without advancing the simulation. An initial assertion that included draw calls failed on 58 versus 56 while all logical fields remained equal; the corrected final run passed.

The 2026-10-06 integration run reported 199 passing tests in 14 files and a successful TypeScript/Vite production build. These counts include other audit work and are not attributed solely to this gameplay test file.

### Reproduction

```sh
npm test -- src/game/gameplay.audit.test.ts --maxWorkers=1 --no-file-parallelism
node scripts/gameplay-browser-audit.mjs
```

The browser script uses an existing Playwright installation and Chrome; it does not install dependencies. Set `PLAYWRIGHT_MODULE` and `CHROME_PATH` when the default local paths differ. Optional environment variables are `GAMEPLAY_AUDIT_PORT`, `GAMEPLAY_AUDIT_MATCHES`, `GAMEPLAY_AUDIT_SEED`, and `GAMEPLAY_AUDIT_OUTPUT`. Setting match count to zero runs only the geometry/UI fixtures; use a separate output directory to preserve the 100-match report. A thrown assertion is saved as failure metadata before browser/server cleanup.

The headless software renderer and fixed-step autoplay are unsuitable for frame-rate claims. Performance evidence belongs to the separately coordinated real-GPU audit. Audio, native focus changes, non-Latin physical keyboard layouts, accessibility across assistive tools, and cross-browser behavior remain outside these particular automated scenarios.
