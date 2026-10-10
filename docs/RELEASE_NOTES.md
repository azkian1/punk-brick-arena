# v2 Battle Royal patch

Base local snapshot dated 2026-10-09, with follow-up audit corrections, mixed-part constructions, growth-priority and hardcore bots dated 2026-10-10. This record covers the implemented battle, HUD, coordinated bots and local follow-up changes. Package metadata remains `0.1.0`. Local changes do not update the hosted GitHub Pages game.

## Current audit fixes and verification, 2026-10-10

The current local patch includes the gameplay below and the final corrections from [Audit fixes](AUDIT_FIXES_2026-10-10.md):

- Shared spatial floor queries preserve exact useful-first resource ranking, contested pickup order and rare matching parts across the arena. Persistent support buckets update as real debris lands, moves or disappears. No physical inventory is truncated.
- Optional gathering/mining time keeps advancing during evasive movement, preserving the existing return-to-pressure windows and required-recovery exceptions.
- Navigation resumes heap-based A* work across simulation steps, with at most 192 yielded work units per bot step. Pending routes retain validated movement and live evasion/fire; safe waypoint progress prevents valid detours from being mistaken for stalls. The bound counts operations, not elapsed milliseconds.
- Squad and bot reserve counts share revision-aware caches. Volley geometry reads only the needed real stock, while firing still owns every reserve/body transfer and excludes Core ammunition.

| Accepted check | Current result |
| --- | --- |
| Complete rule suite | 552 tests / 31 files / 91.01 seconds; `npm test -- --maxWorkers=1 --no-file-parallelism`, existing timeouts |
| Build | Strict TypeScript and Vite pass; entry 2,779.85 kB / 442.29 kB gzip; large-chunk warning remains |
| Publication/security | Three guards pass; 140 working-tree text files and five production text files scanned |
| Browser integration | 14 squad fixtures + five native-map smokes, ten patch fixtures and 21 battle fixtures; zero page/console errors |
| Hardware spot checks | Two sequential roughly four-second Radeon windows: 56.8–60.4 animation frames/s at 4,000 ground parts, 52.4–58.5 at 12,000, 52.2–53.2 at 5,000 reserve parts per fighter |
| Twenty resets | Direct post-GC V8 usage stays near 36 MB; 38 geometries / one texture |

Exact source hashes and inventory checks link the browser/workload reports to these production corrections. The final battle harness uses regression fixtures (`BATTLE_AUDIT_MATCHES=0`); native smokes use forced round entry and a stationary player. The short hardware/reset measurements do not establish human balance, constant 60 FPS, dense full-form collapse performance or long-run leak absence. [Testing](TESTING.md) and [Performance audit](PERFORMANCE_AUDIT.md) retain the commands, reports and limits. The earlier hardcore actual-touch orientations remain dated evidence; no new final touch rerun is claimed here.

The dated prior sections preserve implementation history and verification of their own snapshots; their test counts and bundle sizes are historical. The battle, bot progression and interface sections describe the current gameplay.

## Prior hardcore bots, 2026-10-10

- Playable bots use full strength from round one and sustain viable hostile attacks at the legal 0.23-second cooldown. Explicit easy/medium compatibility APIs remain available.
- Moving-target aim solves projectile interception, including arena-edge stops. Defensive movement re-evaluates new projectile lanes during an active dodge; real DASH and existing speed rules remain intact.
- Physical volley sizes adapt to target motion/size, range, stock, danger and remaining finishing mass. Body ammunition keeps survival limits and never spends the Core.
- Healthy optional gathering has bounded windows, and reachable finishing can override optional collection. Repair, useful growth while firing and small rapid harvest volleys retain their resource guards.
- The second-round pair switches opportunistically to a reachable weak hostile. Third-round bots approach through three crossfire sectors. Later squads rotate stronger healthy members into attack slots, replace wounded bots and temporarily commit support to a viable finishing opportunity.
- Allies, pickup locks, cooldowns, part identity and total inventory remain governed by the existing physical rules. Squad ammunition counting avoids repeated array allocation when reserve is unchanged.

At this snapshot, verification passed **541 tests in 29 files**, strict TypeScript/Vite build and all three publication/security guards. Browser checks passed fourteen squad fixtures plus five native-map smokes, 21 battle fixtures, ten patch fixtures and both actual-touch orientations, with zero errors. The before/after comparison used ten matching native maps and a scripted moving/firing/DASH player: hardcore coalition rounds produced six player defeats versus five previously. Separate explicitly stocked pressure fixtures produced six defeats versus one. Both versions conserved inventory and recorded zero errors. These partial deterministic runs establish behavior rather than human difficulty or global optimality. Exact scope and later regression results are in [Testing](TESTING.md).

## Prior growth-priority bots, 2026-10-10

- Incomplete bots prioritize useful repair/growth parts even when healthy, stocked and past their opening preparation. Movement toward growth can retain viable hostile fire, including for the squad collector.
- Useful buildings are mined with the normal 0.23-second cooldown in every round and difficulty. Bots approach pickup reach and usually spend 1–4 real parts per harvest volley; stocked bots can target a rare matching part among unsuitable material.
- Body-only mining retains an armour budget and requires plausible yield. Recovery, finishing blows, emergency evasion, alliances and Core protection retain their guards.
- Resource ranking keeps a bounded shortlist with revision-cached frontiers/composition and short decision caching. Impossible pickup circles and stalled goals are deferred; changing ammunition cannot reset a collection-stall timer. Complete/capped stocked forms avoid optional growth farming.

Final growth-bot verification: **507 tests in 28 files**, strict TypeScript/Vite build and all three publication/security guards pass. Browser checks pass fourteen squad fixtures plus five native-map behavior runs, 21 battle fixtures, ten patch fixtures and both actual-touch orientations, with exact inventory conservation where checked and zero errors. Added fixtures prove actual growth while moving/firing and early-round mining at 0.2333-second spacing in the 60 Hz simulation. Native fourth-round bots end with 41 / 33 / 24 authored body parts. These partial runs are behavior evidence, not a human balance or GPU FPS measurement. Final commands and evidence are in [Testing](TESTING.md).

## Prior mixed-part constructions, 2026-10-10

- Map cover uses the full actual catalogue: 57 size/shape combinations, including long bricks, wide/thin plates and studless tiles. Each map includes every combination; orientation preserves authored dimensions and shape.
- Twenty constructions keep the five cover categories, with irregular asymmetry, varying silhouettes, palettes and random part counts. Each building has at most 600 parts.
- Parts remain supported and non-overlapping. The four wide corner-to-center routes stay clear; destroyed pieces keep their real identity, dimensions, shape and color for repair, growth, stock and firing.
- Long loose parts can slide exactly along cover faces in narrow corridors. This prevents a side-contact stall without lifting parts onto a pile or moving them through walls.
- Earlier heavy physics regressions now use immutable test-only geometry snapshots from the original generator. Changing a random map no longer removes the 1,919-part collapse or the exact seed-16 edge-landing regression.

Final mixed-part verification: **487 tests in 27 files**, strict TypeScript/Vite build and all three publication/security guards pass. The updated browser checks pass ten patch fixtures (including three live mixed maps), 21 battle fixtures, 11 squad fixtures plus five native-map smoke runs, and both actual-touch orientations, with zero page/console errors. Three map screenshots and current tower before/after screenshots were reviewed; all 162 parts of the mixed tower settle locally. Exact results and the retained heavy fixture scope are in [Testing](TESTING.md) and [Gameplay audit](GAMEPLAY_AUDIT.md).

## Prior audit corrections, 2026-10-10

- Damage immediately refreshes the surviving actor's collision radius before the next projectile in the same step.
- A squad with no healthy attacker resumes real combat after eight seconds without repair progress, instead of recovering forever. The fallback stays stable and never grants health or ammunition.
- Healthy stocked hunters skip irrelevant floor ranking. Finishing volleys respect remaining target mass even with plentiful stock.
- Firing tracks its own pointer. A second finger can use DASH or release the joystick without cancelling held fire; cancellation and lifecycle resets release the hold.
- Projectile drops use their actual radius and local cover clearance, avoiding the fixed edge inset that could move a safe rebound into a wall.
- Building fragments scatter outward around their source with bounded impulses and continuous cover collision. Landing checks vertical crossing and side entry into an existing pile, preventing debris from being lifted into an artificial tall column. Local clearance replaces the actor-center fallback; source part identity, shape, size and color remain exact.
- Projectile bodies and studs use at most two instanced meshes per volley. Instance-buffer disposal preserves shared resources for other active shots. Debris broadphase and cached settled footprints reduce repeated collision/stack calculations.

Final audit-fix verification: **481 tests in 26 files**, strict TypeScript/Vite build and all three publication/security guards pass. Browser checks pass seven new regressions, 21 existing battle fixtures, 11 squad fixtures plus five native-map behavior runs, and both real-touch orientations, with zero page/console errors. The 1,919-part native tower retains every identity and settles around its base; the dense Node variant adds 900 existing plates and also settles completely. Exact results and fixture limits are in [Testing](TESTING.md) and [Gameplay audit](GAMEPLAY_AUDIT.md). The accepted verification below belongs to the original v2 snapshot.

## Battle and inventory

- One player and three bots begin near the four corners of a 160 × 160 arena. Player Core destruction immediately ends the run with defeat; only a sole surviving player receives victory collection and Next Round.
- Twenty procedural walls, towers, ruins, steps and arches provide destructible cover. Four wide routes connect spawns to the clear center. Detached building parts become usable loot.
- Shots spend real reserve parts first, then deterministic, safely removable non-Core attached parts. Firing does not randomly strip the build or cause a removal cascade.
- The parts-per-shot control requests 1–20 actual pieces in one packed volley. Direct damage equals the number actually spent; a shortage reduces the group. Every source part retains its identity, geometry, shape and color.
- Fired parts remain unavailable to every fighter until settled and five seconds old. Impact releases the parts nearby. Boundary impacts use a non-damaging ballistic arc, with travel of 1–33% of edge-to-center distance and speed bounded by the original shot; inventory is never deleted by a lifetime timeout.
- Player and bot base movement speeds increase by 15% over the preceding build. DASH uses the shared 0.18-second duration, 3.3 speed multiplier and 2.4-second recharge, with continuous cover collision.
- A metallic center rune appears every 30 combat seconds and remains until collected. Pickup restores the installed head/body colors once. Missing parts, inventory and later collected colors remain governed by the normal rules; uncollected runes do not stack.

## Bot progression

| Round | Behavior |
| --- | --- |
| 1 | Every fighter is independent |
| 2 | Two bots ally against the other independent fighters and share hostile targets |
| 3 | All three bots ally against the player |
| 4+ | Two attackers and one collector, with immediate replacement of a recovering attacker |

Squad recovery begins at 65% of a bot's attained attached build and ends at 90%. Health excludes stock, and coordination does not create parts or reset Core exposure. Allies cannot damage one another. Bots hunt vulnerable targets, evade, lead moving targets, flank or break cover, gather usable debris and harvest buildings to repair/grow. They use real DASH, select 1–20 real-part volleys and use the player's 0.23-second cooldown for viable normal hostile shots in every round when resource and health conditions permit. A collector finishes eligible nearby pickups before leaving a pile.

## Interface and controls

The desktop HUD has equal-size side columns aligned with the arena's projected top and bottom, with a common font and larger readable numbers. Player build/Core and evolution/repair/growth share the top-left card above Backpack. DASH and parts per shot occupy the matching right column. Opponent counters, Rival stock, time/round/alive counters and pickup-report popups are hidden. Compact and touch layouts retain movement, aiming/firing, DASH and native range input without horizontal overflow.

The currently playable mode is the four-fighter battle. A future choice between 1×1 Duel and Battle Royale has been discussed; this patch does not implement a mode selector. Retained duel APIs support older compatibility tests.

## Original v2 snapshot verification, 2026-10-09

- Final isolated rule suite: **446 tests in 23 files**, using `npm test -- --maxWorkers=2`.
- Coordinated-bot browser audit: **11 fixture entries and five native-map smoke runs**, with zero errors and physical inventory conservation. Native runs cover 30 combat seconds each after forced round entry; they are partial behavior checks, not completed matches or human balance measurements.
- Existing battle browser regression: **21 fixture entries** across all five evolution paths, with zero errors.
- Real-touch checks pass portrait 390 × 844 and landscape 844 × 390, including movement/firing and release reset, with zero overflow/errors.
- Strict TypeScript/Vite build and all three publication/security guards pass.
- Earlier arena-aligned HUD audit covers 11 viewport/DPR cases; its scope is recorded separately from the final bot verification.

Reports and screenshots stay in ignored local `artifacts/`; maintained audit scripts, tests and documented results are included in the patch. See [Testing](TESTING.md), [Gameplay audit](GAMEPLAY_AUDIT.md), [Architecture](ARCHITECTURE.md), [Development](DEVELOPMENT.md) and [Product requirements](../PRD.md) for details and repeat commands.
