# Gameplay audit, 2026-10-06

This audit separates ordinary browser combat, deterministic API round scenarios, and explicitly granted geometry fixtures. None of these runs measures human win rate, player enjoyment, or real-time frame performance.

## Ordinary projectile matches

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

## Maintained API scenarios

`src/game/gameplay.audit.test.ts` exercises another 20 rounds per path through production game modules. These 100 deterministic API rounds use repeated standard-power damage rather than simulated projectiles. Each round includes 24 neutral opening drops, contested bot pickups, defeated-bot reserve transfer, automatic reward collection, exact inventory conservation, connected construction, and carryover. Every third round checks player damage and the five-second own-debris restriction before recovery. Each path also checks final defeat, rejection of Next Round, and an empty-reserve/base-body restart.

Separate cases cover invalid position/size rejection, globally unique IDs across body and reserve, cache invalidation on replaced/appended stock and cloned rounds, 300 banked rewards at the 16,000 attached-piece boundary, and full phase-3 Core cascades exceeding 4,000 detached pieces. The capacity case bypasses geometry to reach the boundary quickly; the Core-cascade cases install an authored full-body fixture rather than claiming earned loot.

Connectivity regressions compare the immutable-plan traversal with an independent spatial traversal after standard-power damage and reserve repairs for all five final bodies. They also verify fallback when a caller places a piece outside the blueprint or applies sub-epsilon offsets that change face adjacency. The fast path requires exact slot coordinates and sizes. Phase transition copies the surviving head's corresponding new slot coordinates exactly, avoiding accumulated floating-point neck-offset drift; missing head pieces remain missing.

## Browser geometry and UI fixtures

Granted-body fixtures are separate from the 100 ordinary matches. They check close-range center-origin shots in both body phases, combat pause, reward-collection pause, the result pause guard, phase transition, defeat, hidden Next Round after defeat, and restart. A separate debris fixture drops 12 overlapping pieces, waits for them to settle, and verifies that their rendered vertical spans do not overlap. The initial fixture donor loop could skip a donor when an earlier pickup filled a later slot; its screenshots therefore did not establish complete body coverage. The maintained harness now snapshots missing slots before supplying parts and asserts `built === target` before each close-range check.

The final fixture rerun passed for all five paths on the current game/render snapshot, with zero page/console errors. `artifacts/gameplay-audit-final/browser-report.json` records each loaded game module's hash and the verified counts below. Its screenshots show complete final forms; for example Winged Frontman's HUD reads 5,391 / 5,391 body pieces and 100%. Both phase-2 and phase-3 close-range tests recorded exactly one player hit for every path.

| Path | Complete phase-2 body | Complete phase-3 body |
| --- | ---: | ---: |
| Mosher | 2,918 / 2,918 | 9,718 / 9,718 |
| Guitar Demon | 2,285 / 2,285 | 4,084 / 4,084 |
| Stage Spider | 2,345 / 2,345 | 6,991 / 6,991 |
| Bass Titan | 2,725 / 2,725 | 7,591 / 7,591 |
| Winged Frontman | 2,100 / 2,100 | 5,391 / 5,391 |

Full-body camera checks project actual transformed mesh bounds at the player's four clamped arena corners. Every tested box remained inside the canvas frustum. This automatic assertion is not a proof that every possible HUD overlay leaves every brick unobscured. These checks do not certify visual behavior on every device or WebGL driver. Screenshots and reports remain ignored local artifacts.

Pause assertions compare all logical snapshot fields, inventory, drop ages, actor shot cooldowns, dash state, and reward progress. Renderer draw-call counts are excluded because entering pause can hide visual elements without advancing the simulation. An initial assertion that included draw calls failed on 58 versus 56 while all logical fields remained equal; the corrected final run passed.

The final integration run reported 199 passing tests in 14 files and a successful TypeScript/Vite production build. These counts include other audit work and are not attributed solely to this gameplay test file.

## Reproduction

```sh
npm test -- src/game/gameplay.audit.test.ts --maxWorkers=1 --no-file-parallelism
node scripts/gameplay-browser-audit.mjs
```

The browser script uses an existing Playwright installation and Chrome; it does not install dependencies. Set `PLAYWRIGHT_MODULE` and `CHROME_PATH` when the default local paths differ. Optional environment variables are `GAMEPLAY_AUDIT_PORT`, `GAMEPLAY_AUDIT_MATCHES`, `GAMEPLAY_AUDIT_SEED`, and `GAMEPLAY_AUDIT_OUTPUT`. Setting match count to zero runs only the geometry/UI fixtures; use a separate output directory to preserve the 100-match report. A thrown assertion is saved as failure metadata before browser/server cleanup.

The headless software renderer and fixed-step autoplay are unsuitable for frame-rate claims. Performance evidence belongs to the separately coordinated real-GPU audit. Audio, native focus changes, non-Latin physical keyboard layouts, accessibility across assistive tools, and cross-browser behavior remain outside these particular automated scenarios.
