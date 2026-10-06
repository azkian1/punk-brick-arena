# Punk Brick Arena — Product Requirements

Status: implemented prototype, version `0.1.0`. Reviewed against the source code on 2026-10-06.

This document describes the current implementation. Design targets are explicitly marked. Technical details are in [Architecture](docs/ARCHITECTURE.md), [Development](docs/DEVELOPMENT.md), [Assets](docs/ASSETS.md), and [Testing](docs/TESTING.md).

## 1. Product concept

Punk Brick Arena is a browser game for one human player against one AI opponent. Each fighter starts as a predefined brick bust. Projectiles knock individual pieces out of the opponent, disconnected sections collapse, and players collect loose pieces to repair and enlarge their constructions.

**Move → shoot → break → collect → repair → grow → fight again.**

The main visual hook is the transformation of a recognizable head into one of five oversized rock-punk builds, with a planned body silhouette and mixed collected colors. The body communicates damage: there is a numerical piece count and Core status, but no conventional health bar.

The product question remains: is destroying an opponent's construction and rebuilding yourself from the debris fun? Automated correctness checks cannot answer that question; it requires playtesting.

## 2. Platform and scope

| Area | Current implementation |
| --- | --- |
| Platform | Browser application; desktop keyboard and mouse combat |
| Players | One human and one bot in each fight |
| Presentation | Three.js 3D rendering with movement and projectile collision in the X/Z plane |
| Arena | One square arena, 72.5 × 72.5 world units |
| Characters | 17 selectable sample busts; 377–639 pieces per base character |
| Evolution | Five fixed body paths, each with a phase-2 Body Form and phase-3 Final Form; compatible with all 17 heads |
| Run progression | Winning construction, evolution state, repair history, and reserve continue into another fight |
| Persistence | Memory in the current page only |
| Interface language | English, including menus, HUD, tooltips, accessibility labels, and character descriptions |
| Services | No backend, accounts, or matchmaking |

The lobby is responsive and scrollable on small screens. It allows character selection and preview on touch devices, but provides no touch movement or firing controls. A modern browser with WebGL is required.

## 3. Player journey and screens

### Lobby

The player selects a character from a roster paginated in groups of six (6 + 6 + 5). The selected portrait, name, subtitle, piece count, and live 3D bust update together. Previous/next roster buttons stop at the first/last page. Browsing a page does not select a character; starting a fight uses the last selected card even if it is on another page.

The player also selects Mosher, Guitar Demon, Stage Spider, Bass Titan, or Winged Frontman. This selects the planned body for the run; the live lobby preview remains the selected base head. Changing the path updates its description. The default path is Mosher, and the chosen path stays selected after restarting or returning to the lobby. Body Form (phase 2) and Final Form (phase 3) are assembled from collected parts during the run.

The lobby navigation links to Play, How to Play, and About sections in the same scrolling page. About identifies the independent, noncommercial fan project, its creator, the generator author, and third-party notices. The sound button works in the lobby; gameplay keyboard shortcuts do not.

A tuning panel sets direct projectile damage from 1 to 20. The initial setting is 10 and applies to both fighters. The setting persists across fights in the page session, including restarts; reloading restores the default.

### Fight

The player and bot spawn on opposite sides of the arena, at X coordinates approximately ±22.475. Twenty-four neutral pieces are placed near the center so collection and growth are available before the first hit.

The HUD shows round number, elapsed fight time, both piece counts, both Core protection states, the player's repair and growth totals, selected evolution and body progress, both reserve counts, dash readiness, and the bot's style and sniper panic state. Easy/medium difficulty is appended to the bot label in the opening rounds; the tooltip also identifies full strength when applicable. During victory collection the HUD shows reward progress. Feedback toasts report collection batches, larger cascades, and Core exposure.

### Pause

P, Escape, or the pause button pauses combat or victory collection. Window blur or a hidden tab also pauses it. Resume returns to the interrupted phase. The menu offers resume, restart, character selection, and the same damage setting as the lobby.

Simulation time, movement, firing and dash cooldowns, pickup ages, and victory collection stop while paused. Held movement/fire and pending dash input are cleared. The scene can still render; pause does not freeze every cosmetic camera adjustment or DOM timer. The top bar is inert behind the modal, and Resume receives keyboard focus.

### Result

Destroying the enemy Core stops combat, clears all projectiles, and starts automatic victory collection. Remaining debris and the defeated bot's reserve fly to the player, bypassing landing and ownership delays. Compatible parts repair or build the chosen body; other valid parts enter the winner's reserve, including when the attachment cap is reached. The stage lasts at least 2.4 seconds and waits until current loot is processed, available reserve assembly finishes, and the phase-3 eligibility check and any resulting rebuild finish. An empty assembly pass can leave unused stock for future rounds. Invalid pieces can remain on the ground. Collection can be paused and resumed. The result then shows the outcome, fight time, hits, repairs, growth, direct/cascade removals, and victory loot count. Player Core destruction goes directly to defeat with no collection reward.

Victory also shows the survivor's attached piece count, evolution, reserve count, and any unlocked Final Form. The result headings are **You Win!** and **Ready to rebuild?**.

The menu actions are **Next Round**, **Start Over**, and **Choose Character**. Next Round is available only after victory. Start Over and character selection are available after either outcome. The primary focused action is Next Round after victory and Start Over after defeat. Next Round is both hidden and disabled on defeat. P/Escape does not dismiss the result or start another fight.

### Screen and session state

| State | Combat input | Menu behavior |
| --- | --- | --- |
| Lobby | Inactive | Roster, evolution path, start, damage settings, sound button, instructions, and credits |
| Playing | Movement, pointer fire, and dash | Pause button/P/Escape, R restart, M mute |
| Collecting | Inactive | Reward progress; pause button/P/Escape, R restart, M mute |
| Paused | Inactive | Resume previous phase, restart, choose character, shared damage; R/M also work when a form input is not focused |
| Result | Inactive | Outcome-specific actions, R restart, M mute; no resume |

Returning to the lobby keeps the selected character, evolution path, roster page, damage setting, and mute choice while clearing the run and reserve. It resets lobby scroll to the top. Restart and Next Round keep the page-level damage/mute choices. Reload resets all page state: first roster character/page, Mosher evolution, default damage 10, and unmuted sound awaiting a user gesture.

## 4. Input and combat

| Input | Behavior |
| --- | --- |
| WASD / arrow keys | Move with normalized diagonal input and smoothed velocity |
| Mouse | Aim within the arena; pointing at the enemy body resolves to its planar location |
| Left mouse button | Fire immediately when ready and repeat while held |
| Space | Dash once per press when ready; movement direction takes priority over aim |
| P / Escape | Pause or resume combat or victory collection |
| R | Start a fresh run outside the lobby |
| M | Toggle sound outside the lobby |

Bindings use physical keyboard codes, including on non-Latin layouts. Outside the lobby, WASD, arrows, and Space suppress default browser behavior unless a focus guard applies. All game shortcuts are ignored when an input, select, or textarea has focus; this includes the damage slider. Space/Enter on a button, link, or settings summary are left to the browser's native control behavior. Repeated keydown events do not retrigger dash, pause, restart, or mute.

Firing starts only with the left button pressed on the arena canvas during combat. Releasing the pointer anywhere in the window stops it. Starting a fight or resuming focuses the canvas. Movement, firing, and dash are inactive during victory collection and results.

Shots are separate, enlarged one-stud construction bricks. They start at the shooter's center in the arena plane, independent of its growing floor circle, so nearby opponents inside that circle can still be hit. This applies to both fighters. Shots do not consume body pieces. There is no charging, ammunition inventory, or alternate projectile type.

Projectiles travel straight at 64 world units per second. Player shots have a 0.23-second cooldown. At full strength, Aggressors fire every 0.3 seconds, Collectors every 0.85, Balanced bots every 0.62, and Snipers every 0.62 at range or 0.12 under close pressure. Opening difficulty multiplies the bot's interval by 1.9 in round 1 and 1.35 in round 2. Each projectile disappears after impact, leaving the arena, or reaching its 1.8-second lifetime.

Space starts a 0.18-second dash at 3.3 times player speed, with a 2.4-second cooldown from activation. Movement input chooses the direction; from rest, aim chooses it. Holding Space does not repeat the dash. Direction stays fixed during the burst, arena bounds still apply, and dash does not grant invulnerability. Pause freezes duration and cooldown; a new fight resets them.

Hit detection uses a swept segment against the target's circular planar bound, including projectile radius. It does not select the visible brick under the pointer. Damage selection is random after an actor-level hit; height does not protect parts of a bust from combat.

## 5. Pieces and structural rules

A piece is one axis-aligned brick, plate, tile, or slope record with an ID, local minimum-corner position, dimensions, color, and shape. Rectangular pieces count as one unit each. There are no per-piece HP, weight, armor, attack, or speed stats.

Each structure has one designated Core and a map of attached pieces. Evolved fighters also track the selected blueprint, occupied slots, previously built slots, and stored pieces. Two pieces connect when their bounding volumes share a face with positive area. Edge-only and corner-only contact do not connect them. Side contact is valid; gameplay does not require physical stud engagement.

Imported heads retain their generated arrangement, including bases and details. Collected parts build authored torsos, limbs, instruments, or wings beneath and around the head. These are fixed brick silhouettes; there are no articulated joints, procedural anatomy, skeleton animation, or realistic structural physics.

## 6. Damage, Core exposure, and elimination

Every actor-level hit resolves in this order:

1. Build the list of eligible attached pieces, excluding the Core while protection is active.
2. Choose up to the projectile power in distinct pieces at random, without replacement.
3. Remove the complete direct-damage batch.
4. Traverse face connections from the Core. Detach every remaining piece outside that component.
5. Leave lost blueprint slots available for repair and create falling debris for every detached piece. The debris render buffer expands as needed without discarding logical loot. Legacy structures without an evolution record geometric vacancies instead.
6. Report exposure and elimination after the structural update.

Power 5 means up to five direct removals, plus any cascade. The default power is 10. Direct and cascade lists do not overlap. If the Core is destroyed, the rest of the structure detaches once; cosmetic death particles add no collectible pieces.

At the start of a fight, record the actual attached piece count as `roundStartPieces`, including any carried build. The exposure threshold is:

```text
max(1, floor(roundStartPieces × 0.4))
```

The implementation adds a small floating-point tolerance before flooring. Protection ends when a damage operation leaves the attached count at or below that threshold. This compares the current count with a fixed round-start baseline, rather than counting all losses over time. Pickups can delay reaching the threshold.

The hit that crosses the threshold cannot select the newly exposed Core midway through its batch. The Core becomes eligible on subsequent hits, but is not guaranteed to be selected immediately. Repair does not restore protection within the same fight.

**Core destroyed means elimination.** Reaching the threshold alone does not end the fight. A character containing only its Core begins exposed and cannot be revived after elimination.

## 7. Debris and pickup

Detached pieces receive simple impulses, fall under gravity, bounce, and settle inside the arena. Overlapping pieces stop on settled pieces below them, forming shallow piles without full rigid-body simulation. Debris remains for the current fight; there is no time-based despawn.

During combat, pickup is automatic when a piece is in collection range and all conditions are met:

- The piece has settled.
- Its age is at least 0.8 seconds from detachment, not from landing.
- If the collector is its last owner, its age is at least 5 seconds.
- The collector's Core exists. Loot that cannot attach goes to its reserve, including at the 16,000-piece attachment limit.

Neutral starting pieces have no owner lockout and begin settled at age 2 seconds. If a stolen piece is knocked off another fighter, that fighter becomes its last owner.

Each collector can accept up to 8 pieces per 1/60-second simulation step. Collection range encloses the horizontal construction bounds with an extra margin. Candidate collector/drop pairs are sorted by distance. A successful pickup removes the drop only once; batch limits, failed placement, and eligibility can allow another candidate to receive it.

Valid pieces that cannot fit are stored in the reserve. Invalid geometry remains on the ground and does not delay unrelated pickups. Pickup is disabled on the result screen.

Victory collection snapshots all remaining debris and the defeated enemy's reserve. After a 0.3-second lead-in, pieces accelerate toward the winner. Up to 16 nearby pieces are collected per simulation step, bypassing combat pickup age, ownership, and range restrictions. Repair precedes planned growth; unsuitable parts are saved. The generator retries existing stock and performs an eligible evolution before showing the result, after at least 2.4 seconds.

## 8. Repair and growth

The lobby offers five fixed evolution paths for any of the 17 heads. An incoming piece first fills a compatible lost slot, then an available connected slot in the chosen body. Dimensions must match; color is irrelevant. Unsuitable loot is stored in a visible reserve beside the arena. The body grows downward from the original head.

After victory loot and reserve assembly, at least 85% of the phase-2 body slots must be occupied to unlock phase 3. The head is excluded from that percentage. The generator rebuilds using actual attached body parts and the reserve, preserving surviving head parts and the Core without granting replacements. Leftovers remain in stock. Phase 3 is the final blueprint; damage can reduce progress, and extra stock cannot grow outside it. The transition never occurs during active combat. See [Evolution and reserve](docs/EVOLUTION.md) for exact rules and implementation limits.

Attachment requires exact X/Y/Z dimensions and preserves incoming color and shape, without rotating, subdividing, combining, or resizing pieces. Compatible previously built slots take priority over new slots, and each slot must connect to the surviving construction. Placements cannot intersect attached solid volumes or extend below local Y = 0. IDs are retained where possible and suffixed on conflict. A valid piece that has no current placement changes the reserve instead of attached geometry. Backpack and Rival stock side panels display up to 240 actual stored pieces in 3D trays, with full counts and a sample-size label when needed. They collapse to counters on narrow or short screens; players do not need to visit or open them.

## 9. Consecutive rounds

| Action | Result |
| --- | --- |
| Start Over / R | Round 1, selected base head and path with no body built, fresh base opponent, empty reserve, initial head-slot history, reset fight statistics |
| Next Round after victory | Next round number, survivor, evolution stage, repair history and reserve, fresh base opponent, reset fight statistics |
| Choose Character | Clear the run and return to a base-character preview |
| Reload | Lose the run and restore initial page defaults |

Next Round preserves the survivor after victory assembly, including the reserve, stage, Core, piece IDs, colors, shapes, sizes, and positions. It performs no additional repair or collection. Cooldowns, velocities, projectiles and fight time reset. Start Over also clears the reserve. Damage and mute settings remain page-level settings.

The opponent character queue contains every template except the player's selected template. All 16 characters appear once per shuffled cycle. A new cycle avoids choosing the previous character immediately again. Behavior selection follows the separate difficulty progression below and allows repeated styles. There is no final round or tournament completion state.

Core protection rearms using the new fight's attached starting count, except for a lone Core; stored parts do not count toward it. Attachment has a 16,000-piece limit per fighter, while reserve collection can continue. Render buffers expand as needed; the legacy free-growth stress scenario exercises 15 rounds and more than 7,000 pieces without truncating instance counts. Separate evolution tests and simulations exercise planned bodies and inventory conservation. None of these establish a frame-rate guarantee at the limit.

## 10. Bot and arena behavior

Each fight assigns a persistent style and difficulty independently of the character model. Restart always returns to the opening setup. There is no user-facing style or difficulty selector.

| Round | Behavior | Difficulty |
| --- | --- | --- |
| 1 | Balanced | Easy: slower movement and decisions, wider aim spread, weaker prediction, slower shots, no dodging |
| 2 | Balanced | Medium: intermediate movement/aim/fire speed and probabilistic dodging |
| 3 onward | Independent random choice among all four styles, including Balanced | Normal / full strength; repeats are allowed and difficulty does not keep scaling with round number |

The following style values describe full-strength behavior. Opening difficulty applies additional multipliers.

| Style | Movement and loot | Projectile response | Firing interval and range |
| --- | --- | --- | --- |
| Aggressor | Closes the gap; steers toward nearby eligible pieces while pressuring the player | No dodging | 0.3 seconds while center distance is below 66 world units |
| Collector | Seeks eligible loot with a distance/risk score; retreats when the player is too close; wanders without loot | Dodges approaching shots | 0.85 seconds while center distance is below 42 world units |
| Sniper | Strafes at range and retreats under pressure; does not actively seek loot | Dodges; close pressure triggers panic fire | 0.62 seconds normally, 0.12 in panic, while center distance is below 66 world units |
| Balanced | Alternates approach, medium-range strafing, and nearby eligible loot; avoids chasing distant loot | Dodges with a 1.1-second retry cooldown; no sniper panic | 0.62 seconds while center distance is below 66 world units |

All styles can collect pieces they pass within reach of and use the same damage, structure, pickup, and Core rules as the player. Bots use evasive movement rather than the player's Space dash. Their aims lead player velocity; the full-strength Sniper uses stronger prediction and removes its oscillating aim spread during panic. Movement and panic distances account for growing actor collision radii. The HUD shows the style, difficulty information, a descriptive tooltip, and a highlighted panic indicator for the Sniper.

Bot base speed is 13.225 world units per second, with a 1.12 multiplier for Aggressors and a 1.22 multiplier during evasive movement. Difficulty further multiplies speed by 0.65 on easy, 0.85 on medium, or 1 at full strength. Normal player speed is 17.25. Live matches use stochastic decisions without a reproducible random seed. Full difficulty constants are in [Development](docs/DEVELOPMENT.md).

Fighters are clamped to arena bounds using their planar collision radii and separated when their circles overlap. Debris uses lightweight custom movement. There is no general rigid-body engine or physical simulation of attached bricks.

## 11. Presentation, sound, and accessibility

The lobby uses white surfaces, violet accents, pixel portraits, evolution choices, and a live preview. One WebGL canvas moves between the preview container and full-screen arena. The oblique orthographic camera adapts its framing to the actual height of growing builds and leaves room for the backpack cards. Each card has an exact stock count and a separate 3D tray viewport rendered by the same WebGL context; narrow or short screens use compact counters.

Implemented feedback includes shadows, hit/pickup particles, body motion, debris impulses, screen shake, result particles, sampled combat sounds, and synthesized pickup/win/loss tones. Projectile trails and a dedicated landing-dust effect are not implemented.

Buttons have accessible labels and visible keyboard focus. Pause and result dialogs receive focus and cycle Tab within their controls. Toasts use an ARIA live region. Reduced-motion preferences disable CSS transitions/toast animation, idle preview sway, and extra dash/victory-pickup particles. Combat motion, loot attraction, and camera shake remain. Full nonvisual gameplay accessibility has not been established.

Audio is local and unlocked after a user gesture. There is no background music or saved sound preference.

## 12. Assets and technical delivery

The game uses 17 locally generated Mini models from a pinned Punk to Bricks revision. The generator runs offline through `npm run assets:generate`; the game imports JSON and never calls a remote generation service.

Ten authored body blueprints are exported separately with `npx tsx scripts/generate-evolutions.ts`. Runtime data contains slot geometry only, not the prototype models' donor colors or spare parts. No prototype stock is awarded by choosing a path. Generated geometry, templates, portraits, and audio are included for the first run.

The stack is strict TypeScript, Three.js, Vite, and Vitest. A production build is a static `dist/` directory. Source provenance and retained notices are linked from the [README](README.md).

## 13. Acceptance criteria and evidence

| Requirement | Existing evidence |
| --- | --- |
| All templates have valid geometry, unique IDs, no overlaps, and Core connectivity | Asset tests and generation diagnostics |
| Direct damage selects distinct eligible pieces and cascades detach disconnected parts | Structure and combat integration tests |
| Core exposure starts after the crossing hit and survives repairs | Core protection tests |
| Fast shots cannot skip a static target between ticks | Swept collision unit tests |
| Pickup honors ownership, landing, proximity, batching, and single collection | Pickup unit and integration tests |
| Exact-slot repairs precede planned growth and preserve incoming geometry/color | Evolution tests; legacy attachment also has structure/combat coverage |
| All 17 heads work with all five paths in both body phases | Evolution tests covering 170 combinations |
| Unplaceable loot is stored, transition conserves parts, and reset clears progression | Evolution tests |
| Next Round preserves the survivor and reserve and rotates fresh opponents | Round and evolution tests |
| Large constructions allocate enough body/stud instances | Round stress test |
| Dash has fixed direction, normalized speed, cooldown, and arena bounds | Movement tests |
| Bot styles differ in movement, targeting, evasion, and fire cadence | Bot tests |
| Every run opens with easy/medium Balanced bots, then allows all four full-strength styles and repeats | Bot/round progression tests |
| Victory collection repairs/grows, handles rejected loot, and preserves the reward into the next round | Victory tests |
| Lobby, controls, audio, results, and browser performance behave correctly | Manual browser checklist; not established by unit tests alone |

The final integrated audit passed 199 tests across 14 files in a serial run and the production build on 2026-10-06. A browser audit completed 20 assisted projectile matches per path, 100 total, with conservation checks and no page/console errors. A final fixture run covered all five paths, complete body phases, close-range hits after growth, pause and result guards, defeat and restart, phase transition, and camera framing. The earlier disposable Chromium review and separate 15-victory conservation simulation remain historical evidence. See [Testing](docs/TESTING.md) for exact scope, source snapshots, earlier results, and verification limits.

Target match duration remains **2–5 minutes**, subject to playtesting. There is no enforced time limit, and no measured duration or fun/retention result is claimed.
