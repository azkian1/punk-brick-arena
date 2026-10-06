# Performance audit

This audit measures the local application before changing rendering and reserve bookkeeping. The target is 60 FPS on an ordinary laptop. A short headless run, even with hardware acceleration, does not establish that target for interactive play or other laptops.

## Reproduce the measurements

Run the harness from the repository root with an existing Playwright installation and Chrome executable:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/path/to/node_modules/playwright'
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/performance-audit.mjs current
```

The script starts an isolated Vite development server on loopback port 5198, disables HMR, opens a fresh headless Chrome context at 1365 x 900 and DPR 1 with normal motion, injects temporary controls only into that browser's main-module response, records the test, and closes the browser/server. It does not ship a mutation API in the game. No browser or package installation is performed. The fallback runtime paths match the existing local review environment; set the two variables above on another machine.

Reports and pointer CPU profiles are written to ignored `artifacts/performance/<label>.json` and `<label>-pointer.cpuprofile`. The JSON records the browser, actual WebGL adapter, GPU feature status, source hashes, viewport, throttling, errors, and sample sizes. Open the CPU profile in Chrome DevTools. Chrome's [Performance panel documentation](https://developer.chrome.com/docs/devtools/performance/overview) explains CPU recording, frame analysis, and capture overhead. The profile recording is separate from headline timing samples.

The optional `--quiet-confirmed` flag records the caller's confirmation that concurrent browser/test work is idle. Source hashes are also captured after the run to detect production-source changes during measurement. OS/background activity remains uncontrolled.

The scenarios include:

- Frozen simulation: 120 frame intervals for small actors, two complete Final Form Mosher actors, and 12,000 stationary drops. These measure rendering, not live gameplay FPS.
- Live simulation and rendering: 300 frame intervals each for small actors, two complete evolved actors, and 12,000 initial drops. Bot combat, pickups, normal motion, and the real 60 Hz main loop remain active. The final phase and quantities are recorded because combat/pickups can change them during sampling.
- Pointer raycasting: 100 calls aimed at a visible part; full character instance synchronization: 15 rebuilds.
- Damage: deterministic power 20, plus synthetic powers 500 and 5,000 that exceed the live slider maximum. A separate power-13 hit selects the real head/body connectors and triggers thousands of cascade removals with legal live damage power.
- Victory: both a normal defeated head and a 12,000-drop stress pile, recording per-step and total computation without rendering. Simulation duration and CPU execution duration are distinct.
- Memory: forced-GC JavaScript heap and renderer geometry/texture counts after 0, 10, 20, and 30 restarts; a 33,000-drop capacity/conservation regression.

The full body controls create actual evolved structures using the immutable real plan and a consistent occupied/reserve state. They are forced fixtures; the test does not claim those bodies were naturally earned. The largest Mosher Final Form is used to stress instance count; all five body paths receive separate game integration coverage. Live frame samples use the initial damage setting of 10. The maximum live power of 20 is measured separately in the damage latency case.

## Recorded environment

The test machine is an HONOR BMH-WCX9 laptop with an AMD Ryzen 5 5500U (6 cores, 12 logical processors), 16,469,520,384 bytes of RAM, and AMD Radeon integrated graphics (driver 31.0.12046.15003). Chrome 131.0.6778.205 reports `ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164C) Direct3D11 vs_5_0 ps_5_0, D3D11)` with WebGL and GPU compositing enabled. Node.js is 24.11.0. SwiftShader was not requested or detected in the accepted before/after runs.

The tests use headless Chrome, no CPU/network throttling, a fresh browser HTTP cache, and existing local disk files. The Vite server serves development modules without dependency prebundling. Development load results must not be read as production/CDN load results. Frame intervals come from requestAnimationFrame; measured draw CPU time excludes asynchronous GPU completion, and frame intervals are not display-presented frame counts. Background OS activity, refresh scheduling, thermal state, and other devices remain uncontrolled. Quiet headline windows exclude this review's simultaneous browser/test runs.

## Changes supported by the baseline

The pointer CPU profile attributes the hot loop to per-instance raycasting and matrix multiplication. Character bodies now reject missed local brick boxes before the exact Three.js triangle test. Picking retains holes, clipping distances, material sides, root yaw, and instance replacement. Regression tests compare exact intersections against `THREE.InstancedMesh.prototype.raycast` across all 17 heads, a complete Final Form, damaged geometry, gaps, inside origins, and near/far limits.

Character synchronization writes the same affine matrices directly, reuses a single parsed color per brick for its studs, calculates body bounds during that pass, and uploads only the populated matrix/color ranges. A settled drop retains its cached transform/color until its identity or position changes; airborne drops and moving victory rewards still update. Only changed ranges are uploaded.

Debris uses a growing instance buffer and disposes the replaced GPU instance buffers while retaining shared geometry/material. Logical loot is never truncated at the previous visual capacity. Restart clears cached references and shrinks an oversized buffer. Renderer draw-call diagnostics now aggregate the arena and both reserve passes instead of reporting only the last stock preview.

The measured 67 ms damage computation on a complete evolved fighter motivated using the immutable blueprint graph for Core connectivity. The fast path validates every occupied piece against its exact planned geometry and falls back to spatial geometry checks for arbitrary constructions. Stored-piece ID caching also avoids rebuilding a complete reserve ID set for every newly banked piece. Separate gameplay regressions check graph parity and part identity/conservation.

Draw-call accounting needs care: the baseline renderer's automatic reset occurs after shadow rendering, so the baseline harness's sum includes the arena and reserve color passes but omits shadow calls. The final renderer resets before all passes and includes shadows. The reported 45 versus 51 small-scene calls therefore does not indicate six new scene objects or a rendering regression; those counters have different accounting scopes.

## Measured comparison

The accepted quiet comparison used identical starting fixtures: 423/389 pieces for small actors and 10,141/10,107 pieces for two complete Final Forms. Live combat changes their final counts. The table corresponds to `before.json` and the final `after.json`, recorded on 2026-10-06. The final report confirms its source hashes remained unchanged throughout the run and contains zero page/console errors. The final source was also covered by the integrated 199-test suite and five-path browser fixtures.

The later debris-stacking fix is outside the source hashes in `after.json`. Its spatial index skips footprint queries while falling pieces remain above every possible support; a current 12-piece browser pile settled without overlapping vertical spans, and the full 199-test suite, production build, and production-browser checks passed. The exact before/after timing table remains evidence for its recorded snapshots rather than a replacement profile of that later change.

| Measurement | Before | Final after |
| --- | ---: | ---: |
| Small live frame interval, mean / p99 | 16.67 / 17.2 ms | 16.67 / 17.1 ms |
| Complete Final Form live frame interval, mean / p99 | 17.72 / 83.1 ms | 16.72 / 17.3 ms |
| Complete Final Form live maximum frame interval | 116.6 ms | 33.4 ms |
| Complete Final Form live maximum draw CPU time | 61.1 ms | 43.3 ms |
| 12,000 initial drops, live frame interval, mean / p99 | 16.67 / 17.1 ms | 16.67 / 17.1 ms |
| Complete Final Form pointer query, mean | 1.36 ms | 0.25 ms |
| Complete Final Form instance synchronization, mean | 20.33 ms | 7.05 ms |
| Stationary 12,000-drop draw CPU time, mean | 8.60 ms | 2.28 ms |
| Live 12,000-drop draw CPU time, mean | 8.30 ms | 4.93 ms |
| Normal power-20 damage computation on 10,107 pieces | 67.0 ms | 15.6 ms |
| First draw after the power-20 hit | 25.3 ms | 10.9 ms |
| Power-13 bridge hit, 9,705 cascade removals: damage computation | 17.4 ms | 7.5 ms |
| First draw after the bridge cascade | 16.5 ms | 17.0 ms |
| Victory collection of 12,389 pieces, total CPU work | 4,319.8 ms | 852.8 ms |
| Heavy victory collection, per-step p95 | 10.9 ms | 1.8 ms |
| JavaScript heap after forced GC, 0 / 30 restarts | 55.38 / 55.46 MB | 53.30 / 53.37 MB |
| Renderer resources after 0 / 30 restarts | 35 / 35 geometries; 1 / 1 textures | 35 / 35 geometries; 1 / 1 textures |
| Add one piece to 33,000 drops | Piece lost; 33,000 instances exceeded 32,064 capacity | 33,001 pieces and instances; 65,536 capacity |

The legal bridge test preserves the same 13 direct removals and 9,705 cascade removals. Its first draw does not show an improvement: the destructive fixtures retain previously emitted drops, so the new debris buffer grows at that point. Single-event hit/cascade timings have fewer samples than frame distributions and are sensitive to allocation/JIT/driver scheduling; no universal percentage improvement is promised. Victory CPU work does not equal the visible animation's wall duration. MB in the heap row denotes decimal millions of bytes.

The live draw sample includes one leading draw before the first measurable frame interval, so its maximum draw CPU duration and the maximum requestAnimationFrame interval can differ. Both are recorded to retain that outlier rather than imply every draw fits a 16.7 ms budget.

The intermediate `after-initial.json` predates the final geometry-validation refinement. `after-final-recheck.json` overlapped other browser work and showed visible contention; it is excluded from this table. The early `exploratory.json` is also excluded. Raw reports remain available to show those conditions and avoid cherry-picking them into a claimed quiet result.

The grown live run still contains an isolated long frame. Its near-16.7 ms typical interval and better tail distribution support the optimizations, while the recorded maximum prevents a constant-60-FPS claim.

## Production load check

A current production-preview check recorded navigation duration 1,526.2 ms, response end 29.5 ms, DOMContentLoaded 672.1 ms, and first contentful paint 1,514.8 ms. Its primary JavaScript entry transferred 409,236 bytes and the CSS entry 6,303 bytes; these are individual resources, not total-page transfer. The raw resource list is in `artifacts/security-audit/browser.json`.

That check used headless Chrome with software WebGL, a fresh browser context, existing local disk files and localhost, without CPU/network throttling. Local Kaspersky browser instrumentation inserted additional requests and rewrote CSP metadata. These environmental conditions prevent treating the figures as remote cold-network production performance or combining its GPU timings with the Radeon gameplay audit. No load-time optimization is claimed from the before/after development navigations.

## Limits and remaining validation

The accepted report distinguishes live gameplay from render-only samples and legal damage from synthetic stress power. An earlier exploratory fixture omitted evolution state and exercised legacy free-growth vacancy merging; its nine-second power-5,000 result is not a live evolved-character finding and is excluded from accepted comparisons.

Interactive, headed play on this laptop and other ordinary laptops is still needed before promising 60 FPS. Check sustained combat with aiming/movement/dash/fire, mass cascades, very large long-lived reserves, actual victory animations, varying device pixel ratios, integrated GPU power-saving modes, pause/resume, and repeated rounds. Heap/renderer resource counts are useful leak signals but do not measure all browser/GPU-process memory.
