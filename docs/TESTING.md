# Testing and verification

Reviewed on 2026-10-09. The current runtime is a four-fighter battle with procedural cover and inventory ammunition. Node rule tests and disposable browser integration checks have different scopes.

## Current coordinated-bot verification, 2026-10-09

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
