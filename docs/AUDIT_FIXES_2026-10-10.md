# Quick audit fixes, 2026-10-10

The original workload measurements and findings remain in [Quick audit](QUICK_AUDIT_2026-10-10.md). This document records the corrective implementation and regression evidence. Hardware remeasurement and the final full-suite/browser results are recorded separately in [Performance audit](PERFORMANCE_AUDIT.md) and [Testing](TESTING.md).

## P1: floor inventory work

`src/game/ground-index.ts` adds a weak-key floor index shared by the live bot pass in `src/main.ts`. A synchronization reconciles externally replaced arrays, same-length replacements, removals, settled/airborne transitions, reordering and movement. Unchanged settled parts keep their cells and oriented size keys. Physics still retains every real part; the index only references them. Floor-part dimensions are immutable in the production spawn/projectile paths. Replacing a differently sized part uses a new physical object.

Bot resource ranking queries indexed cells and compatible size buckets using a min-heap. It retains the same useful-before-banking ordering, threat risk, ownership/firing locks, temporary unreachable deferrals and locked-goal bonuses. The cell distance multiplied by `0.65 / 2.2` is a conservative lower bound on the existing nonnegative score. Search stops only when the unvisited cells cannot improve the shortlist; rare useful parts anywhere in the arena remain eligible. This is not a fixed resource radius or a cap on physical inventory. Path/geometry approach checks still use the twelve candidates from that exact ranking.

`src/game/pickup.ts` queries each collector's actual circle through the same index. Shared loot is resolved by the same exact squared distance, original floor order and collector order; failed-placement revision guards and the real eight-part batch remain in effect. Physics and pickups synchronize after motion/landing, so new and removed drops do not become phantom candidates.

`src/game/debris.ts` retains support footprints and cell buckets across falling steps, while `src/game/debris-motion.ts` synchronizes them against the current floor. Removal, movement, height, rotation and settled-state changes update/remove exact support faces. A newly landed part is immediately available to subsequent falling parts. Removed high faces can leave a conservative early-out height overestimate, which never affects the exact landing-height query. Failed cover escape searches use weak-key negative caching stamped by construction identity, revision, position, drop position/radius and ejection source; cover changes release blocked real airborne parts for another bounded search.

`src/game/arena.ts` removes per-face arrays and translated boxes from the hot swept-circle query. Expanded rectangles only reject misses; exact face strips and circular corners continue to determine the first collision fraction, including holes in surviving cover.

## P2: optional resource timing

`src/game/bots.ts` tracks the underlying resource job separately from the visible evasive intent. Optional collecting/harvesting ages continue to advance during projectile dodging. The existing five-second collector / 3.5-second ordinary windows, pressure periods, recovery/repair exceptions, live lane reactions and finite real firing/dash cooldowns remain active.

The original eight-second isolated probe now records **330 building-fire decisions both in quiet conditions and under repeated threats**, versus the original **480 under threats**. The permanent regression also checks continued dodging and the mandatory-recovery exception. These fixed-position, productive-revision probes measure decisions, not actual volleys or native-match cadence.

## P2: navigation work and actual route following

Navigation uses a binary-heap A* frontier and exact nearest-24 candidate selection. Small graphs use a bounded shortlist; larger graphs query a spatial cell frontier instead of sorting every vertex. Corner validation, nearest-neighbor discovery, visibility checks, search expansion and edge relaxation are resumable with at most **192 yielded work units per bot step**. Unfinished work resumes on the next step. A pending search is distinct from an unreachable result. Radius, goal and cover-geometry changes invalidate the applicable work; unchanged projected cover geometry preserves its graph across structure-only revisions.

While planning, the bot can follow a still-valid existing segment or take a short fallback step checked against actual surviving cover and arena edges. Live threat analysis, dodging, aiming and legal firing continue every simulation step. The budget is an operation count, not a hard wall-clock guarantee: preparing revision-cached footprint unions and construction bounds is separate work, and an individual exact collision probe depends on current cover geometry.

Regressions caught two additional route-following errors. A waypoint within 0.7 units could previously be skipped before the next segment cleared a rounded obstacle corner. It now advances only when that segment is actually clear. Resource and harvest stall guards, and engagement staleness, now recognize real progress toward the current safe waypoint. Going around cover can temporarily increase Euclidean distance to the final goal; it no longer falsely abandons that valid detour. A stationary actor or failed route retains the existing stall/deferral exits.

The permanent fragmented-cover fixture navigates past sixty real obstacle fragments until the actor enters physical pickup reach. Both the unchanged case and a radius/goal-change case complete with safe pending movement, per-step budget assertions and unchanged physical actor inventory.

The narrow-opening fixture also distinguishes pending work from a terminal failure: an open projectile lane with a gap too small for a five-unit-radius body reaches mandatory building fire within fifteen fixed steps. It transfers actual stock into a projectile, verifies a real building impact, removes a real blocking part, and then traverses the opened passage using safe swept segments while resuming hostile fire. This replaces the earlier synchronous two-decision assumption with a bounded eventual outcome and a stronger physical clearing check.

The squad browser growth fixture needed a separate placement correction. Its fixed eighteen-unit loot distance exceeded the rushing attacker's existing short optional-pickup limit: the measured pickup radius was 5.00735 units, giving a 17.00735-unit limit. Both current production and the saved pre-fix bot source rejected that same first-step pickup before navigation. The fixture now refreshes actual body bounds, places loot at `pickupRadiusAtStart + 10`, and records those actual distances. All real installation, built growth, mass, travel, hostile-fire and retained-role assertions remain. An isolated production-tick probe passed both attacker and collector installations with that placement. A permanent regression also checks nearby growth during rush, continued hostile pressure over a distant optional detour, and the mandatory-recovery exception. The rush policy itself is unchanged.

## Large reserves

`src/game/ammunition.ts` exposes the same exact weak-key non-Core stock count to the squad coordinator and each bot. Reserve identity, revision, length and Core ID invalidate it. Volley geometry reads at most the first twenty usable stock parts instead of filtering the entire reserve; attached-body bounds are evaluated only when actual stock cannot fill the requested group. No ammo is created, the Core remains excluded, and the firing layer owns all real transfers.

## Post-fix hardware spot checks

Two sequential runs used the same Radeon hardware WebGL, 1872 × 879 / DPR 1, live four-fighter runtime, actual input paths and cover-clear stress placement as the original audit. Each frame window lasted about four seconds. The second run repeated the three heavy scenarios. All production `.ts` source hashes match across both post-fix runs and were unchanged during their measurements. Both reports contain zero browser errors and preserve initial physical mass.

| Live scene | Original animation frames/s | Two post-fix spot checks |
| --- | ---: | ---: |
| 4,000 cover-clear ground parts | 38.9 | 60.4 / 56.8 |
| 12,000 cover-clear ground parts | 4.6 | 52.4 / 58.5 |
| 5,000 granted reserve parts per fighter | 42.4 | 53.2 / 52.2 |

The 12,000-part mean tick CPU falls from 37.21 ms to 10.96 / 9.02 ms. Its maximum measured frame interval falls from 316.7 ms to 50.1 ms in both post-fix checks; these maxima still prevent a constant-60-FPS claim. The second 4,000-part run retains a 116.6 ms maximum interval despite its improved typical rate. Native rounds and the forced demolition/full-form scenes in the eight-scenario first run stay around 59–60 animation frames/s. The full-form scene measures existing attached forms, not their complete dense collapse.

The repeated-reset confirmation lets old frame scopes retire for two animation frames, forces GC, and reads `Runtime.getHeapUsage` directly. V8 used bytes are 36.016 → 35.889 → 35.870 → 35.875 → 35.913 MB after 0/5/10/15/20 resets. Renderer resources remain 38 geometries / one texture. The older `performance.memory` estimates in the first post-fix run fluctuate up to 94 MB; the confirmation's cached estimate can be 73.9 MB at the same point where direct V8 usage is 35.9 MB. Those estimates are not retained-heap growth evidence. The short reset check found no monotonic retained-heap or renderer-resource growth; it does not establish long-run absence of every leak.

Reports: `artifacts/performance-battle-fixed-2026-10-10/report.json` and `artifacts/performance-battle-fixed-confirm-2026-10-10/report.json`, with profiles and screenshots. Frame rates are reciprocals of mean requestAnimationFrame intervals, not display-presented frame counts or guarantees for other devices.

## Verification and limits

- Strict TypeScript and the Vite production build passed after all production corrections. The build retains the existing large-chunk warning; the main entry is 2,779.85 kB / 442.29 kB gzip.
- The final complete suite passed **552 tests in 31 files in 91.01 seconds** with existing/default timeouts, including actual narrow-opening clearance, resumed hostile fire and the final rush/recovery regression. The updated growth file also passed **25 tests in 4.32 seconds** separately. Browser results and fixture assumptions are recorded in [Testing](TESTING.md).
- Security checks passed all three guards and the working-tree/production-text scans. No production changes were required after the hardware measurements.
- Final browser reruns pass 14 squad fixtures plus five native-map smoke runs, 10 patch fixtures and 21 battle fixtures with zero page/console errors. Exact inventory, actual growth, legal firing/DASH, allied guards, physical scatter, round outcomes, rune/pickup locks and HUD alignment remain checked. Current production hashes match both hardware runs; screenshots were inspected. Reports and fixture assumptions are recorded in [Testing](TESTING.md).
- The final focused run passed **196 tests in thirteen files in 30.48 seconds**, including spatial queries, actual bot/fire runtime, growth, squad AI, pickup, debris/support, ammunition, arena and collision. The preceding focused run passed 215 tests in eleven files before the final route-following additions.
- `ground-index.test.ts` compares eighty randomized useful-first and radius queries with exhaustive references, including risk, locks, equal scores and negative coordinates. Its 12,000-part fixture verifies local candidate work and separately retains a rare compatible part across the arena.
- Independent ignored probes passed **1,200 ground-ranking/radius comparisons** and **2,430 cached-vs-rebuilt support-height comparisons**, including same-length edits, state changes and resets. Reproducers: `artifacts/audit-ground-index-independent.ts` and `artifacts/audit-support-index-independent.ts`.
- `arena-sweep.test.ts` passed 2,400 comparisons against the previous exact rounded face-strip/corner algorithm. The negative-escape regression also passed: a second unchanged attempt skips expensive search, then resumes after construction replacement.
- The strengthened narrow-opening check and all **61 battle tests** also passed in a separate focused run before the complete suite.

The algorithms reduce repeated allocation/scanning and bound graph search without truncating parts or lowering normal bot difficulty, base speed, dodge response, real shot cadence, stock limits or dash cooldowns. These invariants and operation counts do not themselves establish 60 FPS, complete long-run leak absence, dense full-form collapse performance, or behavior on every laptop. Accepted post-fix hardware measurements must retain the same cover-clear fixture, renderer/adapter, quiet sequential execution and unchanged source hashes.
