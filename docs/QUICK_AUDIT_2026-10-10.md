# Original v2 quick audit: pre-fix correctness and load findings

Audited on 2026-10-10 after the hardcore-bot patch. Production source was unchanged during both measurements; its hashes are stored in each report. The measurements and findings below describe that original snapshot. The subsequent implementation, regression evidence and remaining measurement limits are recorded in [Audit fixes](AUDIT_FIXES_2026-10-10.md); accepted post-fix hardware results are recorded in [Performance audit](PERFORMANCE_AUDIT.md).

## Findings

1. **P1: high ground-inventory counts overload simulation and visibly slow combat.** With 12,000 explicitly granted, settled parts in verified cover-clear cells, live fourth-round play averaged **4.57 animation frames/s**, with a **316.7 ms p95 / maximum** interval. One tick averaged 37.21 ms, already above the 16.67 ms budget: bot work 27.62 ms and drop/pickup/assembly work 9.11 ms. The main loop ran up to six fixed steps per frame (mean 5.79), advancing 1.83 combat seconds in 4.38 wall seconds. Frozen simulation with the same part count rendered at about 59 frames/s. The measured bottleneck is therefore CPU gameplay work, rather than a failure to render 12,000 instances. Resource cache misses rescan the whole floor for each incomplete bot (`src/game/bots.ts:915`, `:921`); continuing pickups and inventory revisions invalidate that cache. The twelve-candidate limit bounds retained candidates, not scan/allocation cost. Pickup also scans all parts against all actors before sorting nearby candidates (`src/game/pickup.ts:51`). A separate cover-clear 4,000-part simulation profile attributes 13.1% of sampled self time to `thinkBattleBot`, 18.3% to `segmentBuildingHit`, 7.8% to `collectNearbyDrops` and 6.1% to `DebrisStack.add`; that profile is attribution evidence for its own fixture, not a direct 12,000-part profile. Prioritize spatially narrowed resource queries, bounded decision work, and pickup/support indexing while preserving physical inventory.

2. **P2: optional gathering limits are bypassed during continuous dodging.** `src/game/bots.ts:824` derives farming time from the previous displayed intent, but `:1256` overwrites that intent with `evade` while harvesting decisions and building fire can continue. An isolated eight-second decision probe with a healthy collector, useful cover, an enemy outside engagement range and repeated dangerous lanes produced 480 building-fire decisions while farming age remained zero. Its quiet control yielded to pressure after the five-second window, with 330 building-fire decisions. These are decision counts, not fired volleys: the probe fixes actor positions and advances productive construction revisions to isolate the guard. It does not claim a native-match firing rate. Reproduction is `node_modules/.bin/tsx artifacts/audit-farming-repro.ts` (ignored local fixture). Track the underlying resource job separately from the evasive display state.

3. **P2: navigation has no per-step computational budget.** `src/game/bots.ts:443` sorts all graph points when discovering neighbors, and `:465` scans all vertices to choose each next vertex. Limits of 24/8 apply after sorting; the search includes quadratic work. Fragmented cover, unavailable targets and radius/geometry revisions can produce expensive graph rebuilding and searches. Native first-round bot calls reached 60.4 ms, and the cover-clear 4,000-part case reached 175.7 ms, establishing actual AI spikes; the audit does not attribute each spike exclusively to navigation. Use a priority queue and bounded/resumable graph work, with a validated safe movement fallback.

Another confirmed full-scan cost is `src/game/debris-motion.ts:150`: any falling part rebuilds a support index from all settled drops on that step. This is bounded in memory but grows with the entire floor population. Blocked airborne parts can also repeat a bounded escape search each tick without a negative-result cache. Neither source inspection nor these runs found an infinite accumulator or a restart leak.

Large reserves also merit follow-up: 5,000 explicitly granted source parts per fighter produced about 42 frames/s and 116.5 ms peak frame intervals while assembly, collection, fire and view synchronization remained active. `thinkBattleBot` counts the whole reserve every step (`bots.ts:805`), and rebuilding its volley profile scans the reserve/body (`:546`). This fixture combines several costs; it is not evidence that any one reserve scan alone caused the frame loss.

## Game and workload measurements

Fresh headless Chrome used **AMD Radeon hardware WebGL through ANGLE/Direct3D11**, without SwiftShader or CPU throttling, at 1872 × 879 / DPR 1. Each sampling window lasted roughly four seconds. Frame-rate estimates are reciprocal mean requestAnimationFrame intervals, not display-presented FPS or a guarantee for other devices. Keyboard movement, pointer-held firing and Space DASH use the actual game input paths in the native and large-reserve runs. All four fighters, current cover, legal cooldowns, pickup/physics and rendering stay active in live scenes. Higher-round entry, full forms, debris populations, stock and two power-20 building impacts are explicitly forced fixtures.

| Scene | Approx. animation frames/s | Frame p95 | Max interval | Mean tick CPU |
| --- | ---: | ---: | ---: | ---: |
| Native round 1, actual input | 55.0 | 33.2 ms | 99.9 ms | 5.05 ms |
| Native round 4, actual input | 59.7 | 17.0 ms | 33.4 ms | 2.12 ms |
| Two forced building impacts | 58.7 | 17.0 ms | 50.4 ms | 2.83 ms |
| 4,000 cover-clear settled parts, live simulation | 38.9 | 50.1 ms | 316.6 ms | 10.83 ms |
| 12,000 cover-clear settled parts, frozen simulation | 59.3 | 16.8 ms | 50.1 ms | Frozen |
| 12,000 cover-clear settled parts, live simulation | 4.6 | 316.7 ms | 316.7 ms | 37.21 ms |
| 5,000 reserve parts per fighter, live/input | 42.4 | 50.0 ms | 116.5 ms | 9.49 ms |
| Four complete authored forms, live | 58.5 | 17.1 ms | 83.4 ms | 2.08 ms |

The full-form fixture begins with 40,724 attached parts across four actual plans. It measures that scene, not naturally earned forms or their complete dense collapse. Each scenario conserved its initial physical mass. All three reports contain zero page/console errors. Twenty repeated resets per run showed stable **38 geometries / one texture**, with post-GC JS heap ending near **64 MB**, close to its starting value. Intermediate heap samples fluctuate; this short test found no monotonic retained-heap or GPU-resource growth and does not prove absence of every possible leak.

Fresh focused regression tests passed **100 tests in five files in 10.25 seconds**: hardcore bot runtime, squad coordination, debris motion, pickup and renderer. The preceding full suite remains **541 tests in 29 files** for the same production code. Passing regressions do not invalidate the newly isolated timer bug or certify workload performance.

Reports:

- `artifacts/performance-battle-2026-10-10/report.json`: initial native input, demolition, full-form scenes and restart samples. Its preliminary grid-debris timings are superseded by the cover-clear rerun.
- `artifacts/performance-battle-heavy-2026-10-10/report.json`: accepted large-reserve scene and restart samples; preliminary twelve-thousand-part placement is superseded.
- `artifacts/performance-battle-clear-2026-10-10/report.json`: accepted 4,000/12,000-part live/render scenes, with detailed radius-aware cover exclusion during placement, screenshots and restart samples. Its profile is the accepted 4,000-part attribution result. Earlier grids could include cells beneath intact cover, so they are not used for the final debris table. Placement changes also change bot routes and contested pickup patterns; the three runs are short spot checks, not statistical repeats.
- Each directory includes `simulation.cpuprofile`; the profile uses the separate 4,000-part, 120-tick attribution fixture outside headline frame sampling.

Run `node scripts/performance-battle-audit.mjs`; set `PERF_BATTLE_OUTPUT` for the report directory, `PERF_BATTLE_SCENARIOS` for comma-separated scene names, and the existing `PLAYWRIGHT_MODULE` / `CHROME_PATH` options for installed runtimes. Run browser/load tests sequentially and keep other heavy work idle. The harness adds QA controls only to a disposable browser's fetched main-module response, installs no packages and does not change game source or the user's open tab.
