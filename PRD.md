# Punk Brick Arena — Product Requirements

Status: implemented prototype, **v2 Battle Royal patch** with audit corrections and mixed-part constructions, reviewed against the source on 2026-10-10. Package metadata remains `0.1.0`; the patch name identifies the local base snapshot. See [Release notes](docs/RELEASE_NOTES.md).

This document describes the current browser runtime. Earlier duel audits are historical evidence; see [Testing](docs/TESTING.md) and [Gameplay audit](docs/GAMEPLAY_AUDIT.md).

## Product and scope

One human player and three bots fight in a 160 × 160 world-unit arena, with alliances increasing across rounds. Each fighter starts as a brick head, spends real parts as ammunition, and collects debris to repair and build a selected body. The player wins only as the final surviving Core, and player Core destruction ends the run immediately. Bots attack hostile fighters according to the current round's alliances.

**Move → spend a part → break cover or an opponent → collect → repair → grow → survive.**

| Area | Implementation |
| --- | --- |
| Platform | Browser, WebGL, TypeScript, Three.js, Vite; keyboard/mouse and touch controls |
| Fighters | One player plus three bots per battle |
| Roster | 17 selectable heads; fresh bots receive other heads and random evolution paths |
| Arena | Twenty clustered walls, towers, ruins, steps, and arches; four 52-unit-wide diagonal spawn-to-center routes |
| Evolution | Mosher, Guitar Demon, Stage Spider, Bass Titan, Winged Frontman; two authored body plans per path |
| Progression | Winning player carries the exact survivor and reserve into a fresh battle |
| Persistence | Page memory only; no backend, accounts, matchmaking, or reload recovery |
| Interface | English |

The prototype has no online multiplayer, gamepad controls, character editor, or fixed match timeout. A 2–5 minute match is a design target rather than an enforced duration. Automated runs do not establish enjoyment, human win rate, or device performance.

The current playable mode is the four-fighter battle. A future lobby choice between 1×1 Duel and Battle Royale has been discussed, but no mode selector or playable duel entry point is implemented in this patch.

## Journey and outcomes

The lobby selects a head and evolution and previews the base head. Roster pages contain 6 + 6 + 5 cards; paging preserves selection. During combat a 1–20 parts-per-shot slider starts at 1. Shot count and mute settings persist across in-page restarts; reload resets them.

Each battle creates four fighters near the four corners at ±57.6 X/Z before size-dependent arena clamping, a new procedural map, and 24 neutral opening pieces near the center. The left HUD combines the player's build/Core, evolution, repairs and growth above Backpack. The right HUD contains DASH above the parts-per-shot slider. At viewport widths above 1280 pixels and heights of at least 600 pixels, both columns use `clamp(280px, 17vw, 336px)` widths and equal heights, with top/bottom edges anchored to the camera projection of the arena's outer base and capped by viewport space. Matching card rows use a 44/56 ratio, with an upper minimum of 280 pixels, reduced to 260 pixels at widths 1281–1440. Segoe UI/Arial numbers are 52–60 pixels, headings 24–28 and captions 16–18. Smaller viewports use compact cards; fine-pointer windows at heights of 500 pixels or less use a 64-pixel top and header-only Backpack. Opponent cards, Rival stock, time/round/alive counters and pickup-report toasts are removed; repair/growth totals remain in the player card. Backpacks are automatic inventories; players need not visit a tray.

Destroying a bot's Core eliminates that bot and releases its reserve as contested floor loot. Combat continues while the living player has opponents. Player Core destruction immediately enters the defeat result, clears movement/firing/dash input and freezes the remaining simulation, including drop ages and rune time. Pending projectiles become drops with their continuous fired ages and five-second lock preserved. There is no spectator phase or fabricated winner when several bots remain.

A sole surviving player enters victory collection. Remaining loose debris is attracted and either installed or banked; standing buildings are not dismantled or awarded. Pending projectiles become recoverable drops rather than disappearing. Fired-part pickup locks still apply during collection. Ordinary damage debris bypasses its usual landing/owner delays during this reward phase. Collection waits for loot processing, bounded reserve assembly, any phase transition, and a minimum 2.4-second celebration.

The immediate defeat result explicitly says **DEFEAT / You Lost** and offers **Restart** or **Choose Character**, with no winner or placement display. Only a sole-player victory offers **Next Round**. Restart/Start Over creates a base player in round 1; Choose Character returns to the lobby. P/Escape does not dismiss results.

Next Round preserves the player's Core, attached piece IDs/geometry/colors/shapes, evolution stage, occupied slots, repair history, and reserve. It resets velocities, cooldowns, combat statistics, and the Core protection baseline, and creates three fresh base bots and a regenerated map with new ID namespaces. The opponent roster uses shuffled cycles; fresh opponents in one battle are distinct when the roster permits.

## Controls and pause

| Control | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse / left mouse button | Aim / fire, including held repeat |
| Left touch joystick / touch arena | Move / aim and fire |
| Space / DASH button | One dash per activation; movement direction or aim from rest |
| PARTS / SHOT slider | Request 1–20 inventory parts per volley; starts at 1 |
| P / Escape | Pause or resume combat or victory collection |
| R | Restart outside the lobby |
| M / sound button | Toggle sound |

Shortcuts use physical key positions. Form inputs keep normal keyboard behavior; Space/Enter activate menu controls normally. Window blur or a hidden tab pauses combat/collection and clears held input. Resume is explicit. Pause freezes simulation time, cooldowns, fired-part ages, rune spawning, debris, and reward processing. The native range keeps arrow/Home/End behavior and isolates its pointer and keyboard actions from movement, fire and dash; the touch slider stays clear of the movement joystick.

Running and dashing are 15% faster than the preceding snapshot: player base speed is 19.8375 and bot base speed is 15.20875 world units/second before difficulty modifiers. A dash lasts 0.18 seconds at 3.3 times movement speed, with a 2.4-second recharge. It permits firing and grants no invulnerability. Continuous cover collision prevents movement or dashes from tunneling through walls and permits sliding along them. Growth overlap checks refresh obstacles after every displacement; if local resolution cannot find room, the actor moves to the verified clear center with velocity zero.

## Ammunition and shots

Every shot transfers up to the requested 1–20 existing inventory pieces. Reserve is consumed first, then a deterministic safe removal order detaches non-Core body pieces while preserving the remainder's Core connectivity. A shortage reduces the actual volley and its damage; it never fabricates ammunition. Firing never creates a damage cascade and never uses the designated Core. It can create a repair vacancy or expose the Core as the attached count falls. A fighter with only its Core and no eligible stock cannot fire.

One logical shot owns all transferred parts and packs them into a compact visible group. Every part keeps its ID, dimensions, color, and shape. It starts at the actor's planar center so close targets are hittable, travels at 64 world units/second, and uses the packed group's actual horizontal extent for swept collision. Actor hit detection uses circular planar bounds; cover uses remaining brick footprints. The earliest contact wins, so cover blocks fighters behind it. Actor damage selection remains random after a hit. There is no independent height targeting.

After one nearest hit, every ammunition part becomes separate debris. At an arena boundary, a missed shot enters a non-damaging ballistic arc toward a clear interior landing point. It remains the same physical piece, keeps its age since firing, and is retained if a safe landing point is temporarily unavailable. Shots have no deletion timeout.

A fired part must land and reach five seconds since firing before **any** fighter can collect it. The same rule survives rebound, impact, and victory collection; it is distinct from ordinary damage-debris ownership.

## Damage, cover, and collection

Each brick or plate counts as one attached gameplay piece. Fighter damage requests exactly the number of parts actually fired, removes up to that many distinct eligible pieces, and then drops everything disconnected from the Core. Default firing spends one part for one direct damage; there is no separate damage tuning. Cascades can exceed direct damage.

The Core is protected until the attached count reaches `max(1, floor(roundStartPieces × 0.4))`. A damage batch that begins protected cannot hit the Core; a subsequent batch can. Exposure is permanent for the rest of that battle even after repair. A lone Core begins exposed. Only destruction of the Core eliminates a fighter.

Arena structures are neutral, floor-anchored construction. Twenty irregular walls, towers, ruins, steps and arches mix the full existing catalogue: 57 size/shape combinations over 39 oriented dimensions, including long bricks, wide plates and studless tiles. Every map includes the catalogue; each construction has a random composition, silhouette and part count, capped at 600. Pieces retain actual authored dimensions and shapes, stay face-connected and do not overlap. The four wide routes and clear center remain reserved.

Their reference `coreId` has no actor protection or elimination meaning. Damage removes a local patch and drops every section disconnected from all surviving floor bricks. Grounded fragments survive independently. Buildings provide actual movement and shot cover; collisions update when pieces disappear, including traversable gaps. Detached parts keep their identity, dimensions, shape and color and can become repair, growth, reserve, or ammunition parts.

Ordinary combat debris must settle and be at least 0.8 seconds old; its last owner waits five seconds from detachment. Fallen reserve and neutral building loot use the same shared collection pipeline. Contested eligible pieces go to the nearest eligible collector, with up to 8 pickups and a separate bounded reserve assembly pass per fighter per simulation step. Dead fighters cannot collect.

Pickup range follows the growing construction. Landed debris uses footprint-aware stacking. Piece conservation includes attached parts, all reserves, standing buildings, projectiles, and world drops.

## Assembly and forms

Exact X/Y/Z dimensions match immutable blueprint slots. Compatible previously built slots are repaired before new connected slots are filled. Colors and shape metadata are preserved; pieces are not stretched, cut, combined, or rotated to fit. Valid parts with no current placement enter the reserve. Legacy free-face attachment remains available to compatibility tests; live fighters use planned evolution.

Phase 1 is the starting head. The phase-2 plan is active from the beginning with zero body progress. After victory loot and reserve assembly, at least 85% of phase-2 body slots must be occupied to unlock phase 3. Head pieces and reserve do not count toward that percentage. Rebuilding reuses actual attached body parts and stock, preserves the surviving head/Core, and grants no replacements. Phase 3 is final; further parts repair/fill its slots or remain stored.

The attachment limit is 16,000 pieces per fighter; eligible excess loot can still be banked. Backpack trays show a sample of up to 240 real stored pieces with exact inventory counts. Their transparent stage reveals the shared WebGL preview. Narrow screens keep the player's compact tray; portrait uses a 76-pixel Backpack with a small preview, while short touch landscape and fine-pointer windows at heights of 500 pixels or less keep its header/count.

## Color rune

A cube becomes available at the clear arena center at each 30-second combat interval. A missed rune stays available rather than stacking; pause freezes its clock. A living player or bot whose body touches its 2.5-unit pickup area can collect it. Nearest center distance decides simultaneous contact, with actor ID breaking ties.

Each pickup recolors only installed pieces once: original selected-head slot colors and the chosen authored body's dark clothing, silver details and path accent. It grants no parts, repair or progress. IDs, geometry, shape, Core state, reserve, drops and shots remain intact. Ordinary later loot preserves its donor color, so another rune may restore that newly attached patchwork.

## Bot behavior

Every live round uses full-strength bots, beginning with round 1. The first two rounds use Balanced style; from round 3 each bot independently receives Aggressor, Collector, Sniper, or Balanced, with repeated styles allowed. Explicit easy/medium construction remains a compatibility API and is not selected by live round progression.

Round 1 is free-for-all. In round 2, bot-1 and bot-2 are allies sharing a hostile target; the player and bot-3 remain independent. From round 3, all bots are allies against the player. Allied projectiles do not damage allied fighters; they still hit enemy fighters and neutral cover, and physical actor separation remains active.

From round 3, attackers seek distinct angles around the shared target rather than all using one firing lane. From round 4, the healthy squad normally keeps two attackers and one collector. The collector seeks eligible debris and harvests useful cover, but a clearly fitter, better-stocked member can rotate into attack after a minimum role tenure. A collector with at least 90% attached health and real ammunition can temporarily join a nearby finishing push; it returns to gathering when that opportunity ends. Permanent Core exposure alone does not qualify a repaired opponent for this squad finishing push.

At 65% or less of its highest attained attached count, a bot switches to recovery; an available healthy replacement fills the attack slot immediately. At 90% restored count, the recovering bot becomes available again. If fewer than three healthy bots remain, available bots fill up to two attack slots. Reserve does not count as restored armour, and Core exposure stays permanent without preventing a repaired bot from leaving recovery. Roles, targets and formation state reset with each new round.

If all living bots are recovering and attached counts stop improving for eight seconds, up to two armed members resume combat. This fallback stays latched until recovery or ammunition exhaustion and never grants parts, restores Core protection or spends Core as ammunition. Complete healthy stocked forms skip optional floor ranking; incomplete stocked fighters still seek useful growth. Actual nearby pickups remain automatic.

Every live bot has its own real DASH: 0.18 seconds at 3.3 times its current movement speed, with a 2.4-second recharge and no invulnerability. The AI checks readiness, the whole cover/arena-safe path and live projectile lanes before requesting one. Ordinary movement retains the configured bot speed and the existing 1.25 evasion factor. Viable hostile fire uses the player's real 0.23-second interval in every round, including while a healthy collector moves toward useful growth. Health and tactical guards still decide whether to fire and how much real body ammunition to spend; recovery retains its no-trade guard. No decision resets or bypasses an execution cooldown.

Volley sizes remain 1–20 and adapt to target size, motion, range, available ammunition, health, incoming fire and finishing mass. Abundant stock alone does not force the maximum group. Finishing shots respect the target's remaining mass and a bounded uncertainty margin. Positive stock is not padded with body pieces to reach a requested count, and packed shot openings can reduce the group further. A bare Core without eligible reserve cannot fire.

Initial resource preparation lasts at most six combat seconds and can finish earlier after gaining stock or parts; it does not create a slow first-round combat tier. The battle decision layer maintains a hunting target, prioritizes reachable finishing blows, approaches worthwhile repair/stock loot, and recovers only when needed. Automatic pickups in reach can repair without interrupting a hunt. Bots clear the first actual cover obstruction or try a cheap flank with scarce stock and route using the current body radius. Resource and target locks limit aimless switching; stale or unreachable goals are deferred. Styles set fighting ranges and priorities, and bots can collect the same center rune. All bots obey the same part ammunition, Core, landing, pickup, repair, reserve, and elimination rules.

Full-strength aim solves the quadratic interception time for the target's current planar velocity, without the former 1.3-second lead cap. Each axis stops at its actual arena limit, so the predicted point does not continue beyond where the target can move. Full-strength bots reconsider live hostile projectile groups every simulation step, using their packed radius, damage count, relative motion and actual cover. They evaluate multiple escape directions against the incoming lanes and can revise an ongoing dodge when another shot arrives. Rebound, settled and allied parts are not invented threats; evasion and DASH still grant no invulnerability.

Growing remains available during combat for incomplete attackers, independent bots and collectors. Eligible parts matching the current repair/growth frontier take precedence over raw reserve material, and healthy fighters can shoot a viable hostile while travelling. Optional collection or mining is bounded: ordinary bots return to pressure after 3.5 seconds of farming, with a four-second pressure window; collectors use five seconds followed by 2.5 seconds of pressure. Required recovery or repair is exempt. A coordinated rush suppresses long off-axis resource trips and optional mining while retaining short useful pickups. Reachable finishing blows override optional growth and in-range pile holding, including for collectors.

Mining chooses useful real building parts and approaches a free pickup point beside surviving cover. Stocked bots can mine a rare matching part even among mostly unsuitable pieces. All building fire uses the 0.23-second runtime cooldown, with useful harvest volleys capped at 1–4 actual parts. Body-only resource mining requires plausible yield and retains at least 85% of the attained attached peak, with a 12-piece minimum; combat cover clearing has separate conditions. Recovering or critically damaged fighters retain their hostile-trade guards. Unreachable loot and stalled harvest goals are deferred, and ammunition expenditure cannot reset a collection-stall timer.

Optional resource time keeps advancing during evasive movement. Resumable navigation keeps live aiming, dodging and legal firing active while a route is pending; interim movement is checked against current cover and arena limits. A safe detour counts as progress toward its waypoint even when it temporarily leads away from the final goal. Exact indexed resource/pickup queries and persistent support/reserve caches preserve the same real parts, eligibility and contest order.

## Acceptance and verification

Maintained tests cover round alliances, recovery/replacement hysteresis, real DASH and rapid reserve/body fire, four-participant rounds, immediate player-loss and sole-player continuation guards, fallen reserve release, exact carryover, safe deterministic ammunition, fired-part timing, boundary return, arena generation/support/collision, bounded preparation and purposeful target/navigation decisions, nearest swept hostile battle impacts, planned evolution, and conservation.

The final 2026-10-10 suite passes 552 tests in 31 files, strict TypeScript/Vite build and three publication/security guards. Final browser integration passes fourteen squad fixtures plus five native-map smokes, ten patch fixtures and 21 battle fixtures with zero errors. [Testing](docs/TESTING.md) records exact commands, inventory/source-hash checks and fixture assumptions; [Performance audit](docs/PERFORMANCE_AUDIT.md) records separate short hardware workload measurements.

The current browser harness is `scripts/battle-browser-audit.mjs`. Its default runs one assisted match for each of the five paths, followed by separate granted/instrumented fixtures; the final rerun uses `BATTLE_AUDIT_MATCHES=0`. `scripts/patch-browser-audit.mjs` covers the audit regressions and native tower scatter/height. These fixtures exercise source integration; they do not demonstrate naturally earned progression or human balance. The 2026-10-06 100-match duel audit remains historical.
