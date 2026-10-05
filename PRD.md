# Punk Brick Arena — Product Requirements

Status: implemented prototype, version `0.1.0`. Reviewed against the source code on 2026-10-05.

This document describes the current implementation. Design targets and future ideas are explicitly marked. Technical details are in [Architecture](docs/ARCHITECTURE.md), [Development](docs/DEVELOPMENT.md), [Assets](docs/ASSETS.md), and [Testing](docs/TESTING.md).

## 1. Product concept

Punk Brick Arena is a browser game for one human player against one AI opponent. Each fighter starts as a predefined brick bust. Projectiles knock individual pieces out of the opponent, disconnected sections collapse, and players collect loose pieces to repair and enlarge their constructions.

**Move → shoot → break → collect → repair → grow → fight again.**

The main visual hook is the transformation of a recognizable character into an irregular, oversized mutant. The intended tone is playful and chaotic. The body communicates damage: there is a numerical piece count and Core status, but no conventional health bar.

The product question remains: is destroying an opponent's construction and rebuilding yourself from the debris fun? Automated correctness checks cannot answer that question; it requires playtesting.

## 2. Platform and scope

| Area | Current implementation |
| --- | --- |
| Platform | Browser application; desktop keyboard and mouse combat |
| Players | One human and one bot in each fight |
| Presentation | Three.js 3D rendering with movement and projectile collision in the X/Z plane |
| Arena | One square arena, 72.5 × 72.5 world units |
| Characters | 17 selectable sample busts; 377–639 pieces per base character |
| Run progression | Winning construction can continue into another fight |
| Persistence | Memory in the current page only |
| Interface language | English, including menus, HUD, tooltips, accessibility labels, and character descriptions |
| Services | No backend, accounts, matchmaking, wallet, or blockchain integration |

The lobby is responsive and scrollable on small screens. It allows character selection and preview on touch devices, but provides no touch movement or firing controls. A modern browser with WebGL is required.

## 3. Player journey and screens

### Lobby

The player selects a character from a roster paginated in groups of six (6 + 6 + 5). The selected portrait, name, subtitle, piece count, and live 3D bust update together. Previous/next roster buttons stop at the first/last page. Browsing a page does not select a character; starting a fight uses the last selected card even if it is on another page.

The lobby navigation links to Play, How to Play, and About sections in the same scrolling page. About identifies the independent, noncommercial fan project, its creator, the generator author, and third-party notices. The sound button works in the lobby; gameplay keyboard shortcuts do not.

A tuning panel sets direct projectile damage from 1 to 20. The initial setting is 10 and applies to both fighters. The setting persists across fights in the page session, including restarts; reloading restores the default.

### Fight

The player and bot spawn on opposite sides of the arena, at X coordinates approximately ±22.475. Twenty-four neutral pieces are placed near the center so collection and growth are available before the first hit.

The HUD shows round number, elapsed fight time, both piece counts, both Core protection states, the player's repair and growth totals, dash readiness, and the bot's style and sniper panic state. Easy/medium difficulty is appended to the bot label in the opening rounds; the tooltip also identifies full strength when applicable. During victory collection the HUD shows reward progress. Feedback toasts report collection batches, larger cascades, and Core exposure.

### Pause

P, Escape, or the pause button pauses combat or victory collection. Window blur or a hidden tab also pauses it. Resume returns to the interrupted phase. The menu offers resume, restart, character selection, and the same damage setting as the lobby.

Simulation time, movement, firing and dash cooldowns, pickup ages, and victory collection stop while paused. Held movement/fire and pending dash input are cleared. The scene can still render; pause does not freeze every cosmetic camera adjustment or DOM timer. The top bar is inert behind the modal, and Resume receives keyboard focus.

### Result

Destroying the enemy Core stops combat, clears all projectiles, and starts automatic victory collection. Remaining debris flies to the player and uses regular repair/growth rules, bypassing landing and ownership delays after combat. This stage lasts at least 2.4 seconds and waits for all placement attempts; rejected or capacity-limited pieces remain on the ground. It can be paused and resumed. The result then shows the outcome, fight time, hits, repairs, growth, direct/cascade removals, and the victory collection count. Player Core destruction goes directly to defeat with no collection reward.

Victory also shows the survivor's attached piece count and its ratio to the selected base template. The result headings are **Victory!** and **Ready to rebuild?**.

The menu actions are **Next Round**, **Start Over**, and **Choose Character**. Next Round is available only after victory. Start Over and character selection are available after either outcome. The primary focused action is Next Round after victory and Start Over after defeat. Next Round is both hidden and disabled on defeat. P/Escape does not dismiss the result or start another fight.

### Screen and session state

| State | Combat input | Menu behavior |
| --- | --- | --- |
| Lobby | Inactive | Roster, start, damage settings, sound button, instructions, and credits |
| Playing | Movement, pointer fire, and dash | Pause button/P/Escape, R restart, M mute |
| Collecting | Inactive | Reward progress; pause button/P/Escape, R restart, M mute |
| Paused | Inactive | Resume previous phase, restart, choose character, shared damage; R/M also work when a form input is not focused |
| Result | Inactive | Outcome-specific actions, R restart, M mute; no resume |

Returning to the lobby keeps the selected character, roster page, damage setting, and mute choice while clearing the run. It resets lobby scroll to the top. Restart and Next Round keep the page-level damage/mute choices. Reload resets all page state: first roster character/page, default damage 10, and unmuted sound awaiting a user gesture.

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

Shots are separate, enlarged one-stud construction bricks. They do not consume body pieces. There is no charging, ammunition inventory, or alternate projectile type.

Projectiles travel straight at 64 world units per second. Player shots have a 0.23-second cooldown. At full strength, Aggressors fire every 0.3 seconds, Collectors every 0.85, Balanced bots every 0.62, and Snipers every 0.62 at range or 0.12 under close pressure. Opening difficulty multiplies the bot's interval by 1.9 in round 1 and 1.35 in round 2. Each projectile disappears after impact, leaving the arena, or reaching its 1.8-second lifetime.

Space starts a 0.18-second dash at 3.3 times player speed, with a 2.4-second cooldown from activation. Movement input chooses the direction; from rest, aim chooses it. Holding Space does not repeat the dash. Direction stays fixed during the burst, arena bounds still apply, and dash does not grant invulnerability. Pause freezes duration and cooldown; a new fight resets them.

Hit detection uses a swept segment against the target's circular planar bound, including projectile radius. It does not select the visible brick under the pointer. Damage selection is random after an actor-level hit; height does not protect parts of a bust from combat.

## 5. Pieces and structural rules

A piece is one axis-aligned brick, plate, tile, or slope record with an ID, local minimum-corner position, dimensions, color, and shape. Rectangular pieces count as one unit each. There are no per-piece HP, weight, armor, attack, or speed stats.

Each structure has one designated Core, a map of attached pieces, and recorded repair vacancies. Two pieces connect when their bounding volumes share a face with positive area. Edge-only and corner-only contact do not connect them. Side contact is valid; gameplay does not require physical stud engagement.

Imported busts retain the generated arrangement, including bases and details. The game does not add anatomy, limbs, a skeleton, or realistic structural physics.

## 6. Damage, Core exposure, and elimination

Every actor-level hit resolves in this order:

1. Build the list of eligible attached pieces, excluding the Core while protection is active.
2. Choose up to the projectile power in distinct pieces at random, without replacement.
3. Remove the complete direct-damage batch.
4. Traverse face connections from the Core. Detach every remaining piece outside that component.
5. Record vacancies for all losses and create falling debris for detached pieces, within debris capacity.
6. Report exposure and elimination after the structural update.

Power 5 means up to five direct removals, plus any cascade. The default power is 10. Direct and cascade lists do not overlap. If the Core is destroyed, the rest of the structure detaches once; cosmetic death particles add no collectible pieces.

At the start of a fight, record the actual attached piece count as `roundStartPieces`, including any carried mutant. The exposure threshold is:

```text
max(1, floor(roundStartPieces × 0.4))
```

The implementation adds a small floating-point tolerance before flooring. Protection ends when a damage operation leaves the attached count at or below that threshold. This compares the current count with a fixed round-start baseline, rather than counting all losses over time. Pickups can delay reaching the threshold.

The hit that crosses the threshold cannot select the newly exposed Core midway through its batch. The Core becomes eligible on subsequent hits, but is not guaranteed to be selected immediately. Repair does not restore protection within the same fight.

**Core destroyed means elimination.** Reaching the threshold alone does not end the fight. A character containing only its Core begins exposed and cannot be revived after elimination.

## 7. Debris and pickup

Detached pieces receive simple impulses, fall under gravity, bounce, and settle inside the arena. Debris remains for the current fight; there is no time-based despawn.

During combat, pickup is automatic when a piece is in collection range and all conditions are met:

- The piece has settled.
- Its age is at least 0.8 seconds from detachment, not from landing.
- If the collector is its last owner, its age is at least 5 seconds.
- The collector's Core exists, its piece count is below 16,000, and a valid attachment can be found.

Neutral starting pieces have no owner lockout and begin settled at age 2 seconds. If a stolen piece is knocked off another fighter, that fighter becomes its last owner.

Each collector can accept up to 8 pieces per 1/60-second simulation step. Collection range encloses the horizontal construction bounds with an extra margin. Candidate collector/drop pairs are sorted by distance. A successful pickup removes the drop only once; batch limits, failed placement, and eligibility can allow another candidate to receive it.

An invalid placement remains on the ground and does not delay unrelated pickups. It is retried for the same structure after that structure's geometry revision changes. Pickup is disabled on the result screen, although existing debris continues falling.

Victory collection is a separate phase. It snapshots all remaining debris, including neutral pieces, the winner's own losses, and the defeated enemy's final cascade. After a 0.3-second lead-in, pieces accelerate toward the winner. Up to 16 nearby pieces receive one placement attempt per simulation step, bypassing combat pickup age, ownership, and range restrictions. Repair still precedes growth, and the 16,000-piece limit remains. Failed placements are skipped without retry; the result reports collected and skipped counts. The phase ends only after every piece has been processed and at least 2.4 seconds have elapsed.

## 8. Repair and growth

An incoming piece first searches vacancies caused by this fighter's previous losses. The search checks dimensions, free volume, and a connection to the surviving Core component. Incoming pieces may come from the opponent and have a different color.

Vacancies merge when their union forms an exact rectangular empty volume. A smaller repair can occupy part of a larger cavity, leaving the remainder available. Lost growth pieces also create repair vacancies.

If no valid repair candidate is found, the algorithm tries new positions on faces of connected pieces. Candidates and anchors are shuffled. Growth is irregular and does not optimize anatomy or symmetry.

Attachment preserves incoming dimensions, color, and shape, without rotating or resizing the piece. Placements cannot intersect attached solid volumes or extend below local Y = 0. IDs are retained where possible and suffixed if already present in the receiving structure. A failed attachment leaves the structure unchanged.

## 9. Consecutive rounds

| Action | Result |
| --- | --- |
| Start Over / R | Round 1, selected base character, fresh base opponent, empty repair history, reset fight statistics |
| Next Round after victory | Next round number, exact attached survivor and vacancies, fresh base opponent, reset fight statistics |
| Choose Character | Clear the run and return to a base-character preview |
| Reload | Lose the run and restore initial page defaults |

Next Round preserves the survivor after victory collection, including Core and piece IDs, colors, shapes, sizes, and positions. It performs no additional repair or collection. Cooldowns, velocities, projectiles, fight time, and any rejected/over-capacity debris reset. Damage and mute settings remain page-level settings.

The opponent character queue contains every template except the player's selected template. All 16 characters appear once per shuffled cycle. A new cycle avoids choosing the previous character immediately again. Behavior selection follows the separate difficulty progression below and allows repeated styles. There is no final round or tournament completion state.

Core protection rearms using the new fight's starting count, except for a lone Core. Live collection has a 16,000-piece limit per fighter. Render buffers expand as needed; the automated stress scenario exercises 15 rounds and more than 7,000 pieces without truncating instance counts. This is not a frame-rate guarantee at the limit.

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

The lobby uses white surfaces, violet accents, pixel portraits, and a live preview. One WebGL canvas moves between the preview container and full-screen arena. A fixed oblique orthographic camera uses viewport-dependent framing and hit shake. It does not follow the player or dynamically frame a growing mutant.

Implemented feedback includes shadows, hit/pickup particles, body motion, debris impulses, screen shake, result particles, sampled combat sounds, and synthesized pickup/win/loss tones. Projectile trails and a dedicated landing-dust effect are not implemented.

Buttons have accessible labels and visible keyboard focus. Pause and result dialogs receive focus and cycle Tab within their controls. Toasts use an ARIA live region. Reduced-motion preferences disable CSS transitions/toast animation, idle preview sway, and extra dash/victory-pickup particles. Combat motion, loot attraction, and camera shake remain. Full nonvisual gameplay accessibility has not been established.

Audio is local and unlocked after a user gesture. There is no background music or saved sound preference.

## 12. Assets and technical delivery

The game uses 17 locally generated Mini models from a pinned Punk to Bricks revision. The generator runs offline through `npm run assets:generate`; the game imports JSON and never calls a remote generation service.

The stack is strict TypeScript, Three.js, Vite, and Vitest. A production build is a static `dist/` directory. Source provenance and retained notices are linked from the [README](README.md).

## 13. Acceptance criteria and evidence

| Requirement | Existing evidence |
| --- | --- |
| All templates have valid geometry, unique IDs, no overlaps, and Core connectivity | Asset tests and generation diagnostics |
| Direct damage selects distinct eligible pieces and cascades detach disconnected parts | Structure and combat integration tests |
| Core exposure starts after the crossing hit and survives repairs | Core protection tests |
| Fast shots cannot skip a static target between ticks | Swept collision unit tests |
| Pickup honors ownership, landing, proximity, batching, and single collection | Pickup unit and integration tests |
| Repairs precede growth and preserve incoming geometry/color | Structure and combat integration tests |
| Next Round preserves the survivor and rotates fresh opponents | Round tests |
| Large constructions allocate enough body/stud instances | Round stress test |
| Dash has fixed direction, normalized speed, cooldown, and arena bounds | Movement tests |
| Bot styles differ in movement, targeting, evasion, and fire cadence | Bot tests |
| Every run opens with easy/medium Balanced bots, then allows all four full-strength styles and repeats | Bot/round progression tests |
| Victory collection repairs/grows, handles rejected loot, and preserves the reward into the next round | Victory tests |
| Lobby, controls, audio, results, and browser performance behave correctly | Manual browser checklist; not established by unit tests alone |

On 2026-10-05, the English interface update passed 159 tests across 11 files and the production build. A local Chromium review checked 11 UI states, including desktop/narrow layouts, pause, victory collection, and both results; it found no page errors, Cyrillic text, or detected text overflow. Regeneration changed only character subtitles, preserving geometry and diagnostics. See [Testing](docs/TESTING.md) for commands, the historical stress-test timeout, and verification limits.

Target match duration remains **2–5 minutes**, subject to playtesting. There is no enforced time limit, and no measured duration or fun/retention result is claimed.

## 14. Deferred ideas and non-goals

These are options, not implemented features or a committed schedule:

- Charge shots, alternate projectiles, stronger actor knockback, trails, and landing dust.
- Attack, armor, speed, magnet, explosive, heavy, or electric pieces.
- Dynamic camera framing and more character content.
- Online 1v1, survival waves, infection, giant, horde, or structured tournaments. The current run already preserves growth, but has no bracket or tournament ending.
- The earlier top-down destruction alternative with threshold-based defeat. Active gameplay uses random damage plus connectivity cascades and Core destruction.

Accounts, backend services, matchmaking, a marketplace, blockchain/NFT integration, inventory, XP/unlocks, a complex character editor, procedural anatomy, IK, ragdolls, and advanced AI are outside the current scope.

Further iteration should validate match length, damage, pickup readability, Core exposure feedback, large-mutant framing, and browser performance through playtests. Mutation should remain simple and surprising.
