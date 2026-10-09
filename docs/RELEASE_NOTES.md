# v2 Battle Royal patch

Local snapshot dated 2026-10-09. This patch records the implemented battle, HUD and coordinated-bot changes. Package metadata remains `0.1.0`. A local commit does not update the hosted GitHub Pages game.

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

Squad recovery begins at 65% of a bot's attained attached build and ends at 90%. Health excludes stock, and coordination does not create parts or reset Core exposure. Allies cannot damage one another. Bots hunt vulnerable targets, evade, lead moving targets, flank or break cover, gather usable debris and harvest buildings to repair/grow. They use real DASH, select 1–20 real-part volleys and can attack at the player's 0.23-second cooldown in later rounds when resource and health conditions permit. A collector finishes eligible nearby pickups before leaving a pile.

## Interface and controls

The desktop HUD has equal-size side columns aligned with the arena's projected top and bottom, with a common font and larger readable numbers. Player build/Core and evolution/repair/growth share the top-left card above Backpack. DASH and parts per shot occupy the matching right column. Opponent counters, Rival stock, time/round/alive counters and pickup-report popups are hidden. Compact and touch layouts retain movement, aiming/firing, DASH and native range input without horizontal overflow.

The currently playable mode is the four-fighter battle. A future choice between 1×1 Duel and Battle Royale has been discussed; this patch does not implement a mode selector. Retained duel APIs support older compatibility tests.

## Accepted verification

- Final isolated rule suite: **446 tests in 23 files**, using `npm test -- --maxWorkers=2`.
- Coordinated-bot browser audit: **11 fixture entries and five native-map smoke runs**, with zero errors and physical inventory conservation. Native runs cover 30 combat seconds each after forced round entry; they are partial behavior checks, not completed matches or human balance measurements.
- Existing battle browser regression: **21 fixture entries** across all five evolution paths, with zero errors.
- Real-touch checks pass portrait 390 × 844 and landscape 844 × 390, including movement/firing and release reset, with zero overflow/errors.
- Strict TypeScript/Vite build and all three publication/security guards pass.
- Earlier arena-aligned HUD audit covers 11 viewport/DPR cases; its scope is recorded separately from the final bot verification.

Reports and screenshots stay in ignored local `artifacts/`; maintained audit scripts, tests and documented results are included in the patch. See [Testing](TESTING.md), [Gameplay audit](GAMEPLAY_AUDIT.md), [Architecture](ARCHITECTURE.md), [Development](DEVELOPMENT.md) and [Product requirements](../PRD.md) for details and repeat commands.
