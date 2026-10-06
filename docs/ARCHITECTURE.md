# Architecture

Reviewed against version `0.1.0` on 2026-10-06. See [Product requirements](../PRD.md) for player-facing rules and [Development](DEVELOPMENT.md) for tuning values.

## Runtime boundaries

The application is a static browser client. `index.html` supplies `#app` and `#arena`; `src/main.ts` creates the renderer, sound service, UI, and animation loop. There is no application server, database, network protocol, or saved run.

The structural modules operate on plain TypeScript data without a DOM or WebGL context. `main.ts` orchestrates these rules with input, AI, world positions, and rendering. The offline generator is separate from the runtime import graph: the browser imports its generated JSON through `src/assets/templates.ts`.

| Source | Responsibility |
| --- | --- |
| [src/main.ts](../src/main.ts) | Phase state, actors, input, simulation, bot, shots, debris, particles, statistics, diagnostic snapshot |
| [src/game/types.ts](../src/game/types.ts) | Piece, template, structure, damage, attachment, and random-source contracts |
| [src/game/config.ts](../src/game/config.ts) | Shared prototype constants |
| [src/game/structure.ts](../src/game/structure.ts) | Cloning, Core connectivity, damage, repair vacancies, attachment, bounds |
| [src/game/evolution.ts](../src/game/evolution.ts) | Head/body plans, exact-slot repair and growth, reserve assembly, progress, phase transition |
| [src/game/pickup.ts](../src/game/pickup.ts) | Eligibility, footprint-based reach, candidate ordering, batching, failed-placement cache |
| [src/game/movement.ts](../src/game/movement.ts) | Smoothed movement, dash duration/direction/cooldown, arena bounds |
| [src/game/bots.ts](../src/game/bots.ts) | Bot styles, loot targets, evasion, predictive aim and firing cadence |
| [src/game/victory.ts](../src/game/victory.ts) | Post-combat attraction, bounded attachment batches, completion and skipped loot |
| [src/game/debris.ts](../src/game/debris.ts) | Debris render dimensions, floor clearance, spatially indexed pile support |
| [src/game/collision.ts](../src/game/collision.ts) | First swept segment/circle contact in X/Z |
| [src/game/rounds.ts](../src/game/rounds.ts) | New runs, victory carryover, opponent queues, spawn ID namespaces |
| [src/render.ts](../src/render.ts) | Arena, adaptive camera framing, pointer projection, character instances, reserve piles, projectile visuals |
| [src/ui.ts](../src/ui.ts), [src/style.css](../src/style.css) | DOM screens, roster, HUD, dialogs, responsive presentation |
| [src/sound.ts](../src/sound.ts) | Local sample fetch/decode/playback, synthesized cues, mute |
| [src/assets/catalog.ts](../src/assets/catalog.ts) | Character order, names, subtitles, accents, portrait paths |
| [scripts/generate-templates.ts](../scripts/generate-templates.ts) | Offline PNG-to-template conversion and diagnostics |
| [scripts/generate-evolutions.ts](../scripts/generate-evolutions.ts) | Export geometry-only body slots from the ten authored prototype models |

## Data model and coordinates

`Vec3` contains numeric `x`, `y`, and `z` fields. Piece coordinates are local minimum corners in stud units; `size` contains positive dimensions along the same axes. Actor positions use world X/Z coordinates. Attached geometry is normally scaled by `CONFIG.characterScale = 0.5`; the lobby preview uses scale 1.

| Type | Fields and role |
| --- | --- |
| `Piece` | `id`, `position`, `size`, `color`, and `shape` (`brick`, `plate`, `tile`, or `slope`) |
| `CharacterTemplate` | `id`, `name`, `subtitle`, `accent`, `coreId`, `pieces`, and provenance `source` URL |
| `Structure` | `pieces: Map<string, Piece>`, `coreId`, legacy `vacancies: Piece[]`, `revision`, `roundStartPieces`, `coreExposed`, optional `evolution` |
| `EvolutionPlan` | Path `id`, `stage` 2 or 3, `neckY`, `headCount`, immutable `slots`, and face-adjacency `neighbors` |
| `EvolutionState` | Path/stage/template/plan, `occupied` slot IDs, `everBuilt` slot history, `reserve` parts, and `reserveRevision` |
| `DamageResult` | Distinct `direct` and `cascade` piece arrays plus `eliminated` |
| `AttachmentResult` | Collected `piece` and `mode: repair`, `growth`, or `bank`; bank mode does not change attached geometry |
| `RoundState` | Number, selected player/enemy templates, both structures, remaining opponent IDs, `enemyBehavior`, and `enemyDifficulty` |
| `PickupState` | Last `ownerId` or `null`, simulation `age`, and `settled` |
| `DashState` | Active burst time, recharge time, and locked planar direction |
| `BotState` | Behavior style/difficulty, current tactic, decision/wander timers, movement direction, dodge duration, and dodge cooldown |
| `BotAction` | Movement/speed, aim, firing decision/interval, dodge flag, and sniper panic flag |
| `VictoryCollection` | Pending drop references, elapsed reward time, total/collected/skipped counts, and `evolutionChecked`/`evolved` flags |

`Actor`, `Shot`, `Drop`, `Particle`, and `Stats` are private runtime interfaces in `main.ts`. Actors combine a structure with a `CharacterView`, planar position/velocity, cooldown, hurt feedback, and cached bounds. Shots reference their owner and track planar motion, lifetime, and mesh. Drops retain the detached piece and add ownership, age, falling height/velocity, and rotation.

There is no shared `attached/flying/falling/ground` enum on `Piece`. Membership in the structure, drop array, or reserve, together with `settled` for drops, expresses that lifecycle. Projectiles are not body pieces. A legacy vacancy is an empty geometric box stored using the `Piece` shape; it is not a collectible object or a required original piece identity. Evolved actors repair exact blueprint slots instead of accumulating those vacancy boxes.

`createStructure()` deep-copies positions and sizes, validates finite positive geometry and unique nonempty IDs, and requires the Core ID to exist. It does not validate all overlaps or initial connectivity. The supplied assets are checked separately during generation and by tests.

## Phase and round lifecycle

```mermaid
stateDiagram-v2
    [*] --> Lobby
    Lobby --> Playing: Start / newRound
    Playing --> Paused: Pause / blur / hidden tab
    Paused --> Playing: Resume
    Playing --> Collecting: Enemy Core destroyed
    Collecting --> Paused: Pause / blur / hidden tab
    Paused --> Collecting: Resume collection
    Collecting --> Result: All loot processed and minimum duration elapsed
    Playing --> Result: Player Core destroyed
    Result --> Playing: Victory / nextRound
    Playing --> Playing: R / newRound
    Collecting --> Playing: R / newRound
    Paused --> Playing: Restart / newRound
    Result --> Playing: Restart / newRound
    Paused --> Lobby: Choose character
    Result --> Lobby: Choose character
```

`showPreview()` clears the run and creates a base-character preview. `beginRound()` clears old views, projectiles, debris, particles, held keys, and firing state; creates both actors; resets fight statistics and simulation time; and seeds 24 neutral drops.

`newRound()` validates the roster, clones both base structures, and creates a shuffled opponent queue excluding the selected character. Spawned IDs are namespaced, for example `round-1/player/violet-0151` and `round-2/enemy/flare-0000`. Both round constructors call `botForRound()`: round 1 assigns `balanced/easy`, round 2 assigns `balanced/medium`, and later rounds independently sample one of four styles at `normal` difficulty. Styles may repeat; the character queue's no-repeat rule is separate.

The live entry point always passes the selected evolution to `newRound()`. `enableEvolution()` translates the head to the blueprint's neck height, marks its slots occupied/previously built, and leaves body slots and reserve empty. The enemy receives an independently random evolution. The round API can omit evolution for legacy tests; this is not a selectable live game mode.

`nextRound()` requires the player's Core to exist and the enemy's Core to be absent. It deep-copies attached pieces, legacy vacancies, occupied-slot IDs, built-slot history, and every reserve piece; the immutable plan/template can be shared. It preserves the Core and stage, resets the structure revision, and sets a new protection baseline from the attached piece count. It creates a fresh base enemy with a new round namespace, random evolution, and empty reserve. Queue reshuffling avoids a repeat across cycle boundaries.

Damage power, mute, and the selected evolution are page-level variables. They survive new fights and lobby transitions. The selected template remains the basis for restarting and for excluding opponents, even when the survivor contains foreign pieces. Restart creates the selected head with no earned body or reserve; returning to the lobby discards the run.

`GameUI` also retains the selected card and roster page across screen transitions. Pagination only changes visible cards. Selecting a card changes the preview; it does not start a fight. Returning to the lobby resets its scroll position but does not reset those selections or the synchronized damage sliders. Reloading reconstructs run state and settings from defaults.

## Simulation and input

`requestAnimationFrame` measures wall-clock time and clamps each frame delta to 0.1 seconds. An accumulator runs `tick(1 / 60)` at a fixed simulation step. Rendering runs once per animation frame and the DOM HUD refreshes approximately every 0.15 seconds. There is no interpolated physics frame or deterministic replay system.

While playing, each tick:

1. Advances elapsed time, cooldowns, and hurt timers; refreshes actor bounds if a structure revision changed.
2. Projects pointer aim, starts a requested dash when ready, moves the player, and fires if the button is held and cooldown permits.
3. Updates the bot and separates overlapping actors, then clamps them to arena bounds.
4. Advances projectiles and resolves swept hits; a lethal hit ends active combat immediately.
5. Advances debris physics, runs automatic pickup, and retries bounded reserve assembly for both living fighters if still playing.

Pause returns before simulation time advances and resumes the prior combat or collection phase. Victory freezes fight time, clears shots, and runs `stepVictoryCollection()` until remaining drops, available reserve assembly, and the evolution check/rebuild are finished and the minimum celebration duration has elapsed. Normal drop physics and ownership timers do not govern this reward stage. The result phase advances any rejected debris without collecting it. Drawing still runs in all phases; particle updates are suppressed during pause. Toast removal uses a wall-clock DOM timeout and is independent of simulation time.

Movement normalizes nonzero input and exponentially smooths velocity. Collision radius uses 44% of the largest horizontal span after character scaling, with minimum and arena-size caps. Pickup uses a separate radius based on the farthest absolute X/Z extents plus reach, so the two radii serve different purposes.

Shots start at the shooter's X/Z center with visual height Y = 3.2. The origin does not move outward with the actor's radius, so growth cannot spawn a shot beyond a nearby opponent. Shots are checked against the opponent only. `segmentCircleHit()` returns the first contact fraction from 0 to 1, or `null`. It handles initial overlap and zero-length segments. It sweeps the shot against the target's current center, not a full moving-target trajectory.

Pointer rays use the actual canvas rectangle. A ray hitting the opponent's instanced body maps aim to that actor's planar center; otherwise it intersects the Y = 3.2 aiming plane and is clamped to the arena. Rendered yaw and individual brick geometry do not define projectile collision.

### Browser input routing

The window key handlers store `KeyboardEvent.code` values, so controls follow physical key positions across keyboard layouts. The lobby bypasses game shortcuts. Events targeting `input`, `select`, or `textarea` also bypass them; Space/Enter on a `button`, `a`, or `summary` retain native behavior. Otherwise WASD, arrows, and Space suppress default browser behavior. Repeat events can maintain the held-key set but cannot activate another dash, pause, restart, or mute action.

Only a left-button `pointerdown` on the canvas while playing starts fire and attempts an immediate shot. Window-level `pointermove` updates aim, and `pointerup` clears firing even outside the canvas. Pause, blur, and round cleanup clear held keys, firing, and queued dash input. `beginRound()` and resume focus the canvas. R restarts from any non-lobby phase; P/Escape only toggle playing/collecting and paused; M works outside the lobby subject to the focus guards above.

## Dash and bot decisions

`movement.ts` separates movement math from DOM input. Space queues a single dash request; key-repeat events do not queue additional bursts. Activation normalizes movement input or falls back to aim, locks that direction for 0.18 seconds, and starts a 2.4-second recharge. Burst speed is 3.3 times normal player speed. Arena clamping still applies, firing remains available, and no invulnerability flag is set. Each new fight creates fresh dash state.

`bots.ts` exposes four styles: `aggressor`, `collector`, `sniper`, and `balanced`. `BOT_DIFFICULTIES` adjusts decision intervals, movement speed, firing intervals, aim spread/lead, and dodge probability. Decisions refresh every 0.42 seconds on easy, 0.24 on medium, or 0.12 at normal difficulty. Wandering targets refresh every 2–4 seconds. Aggressors prioritize closing distance and nearby loot; collectors score eligible loot by distance and enemy risk; snipers seek distance, strafe, and predict player motion. Full-strength sniper panic shortens the firing interval to 0.12 seconds, including the current runtime shot cooldown when necessary.

The Balanced style chooses a new tactic when its wander timer refreshes: collect with probability 0.35, approach with probability 0.30, or strafe with probability 0.35. Collection considers eligible pieces with a distance-plus-risk score below 24 and only pursues them when the player is beyond `contact + 4`. Without such a target, it approaches/strafe-retreats around a medium range. Its base firing interval is `CONFIG.botShotInterval`, without sniper panic.

Collectors, snipers, and Balanced bots examine approaching projectile trajectories up to 0.7 seconds ahead and can dodge for 0.28 seconds. A wall check can reverse the dodge direction. Easy difficulty disables dodging; medium allows a detected-threat attempt with probability 0.55; normal allows it whenever eligible. Balanced bots set a 1.1-second retry cooldown when detecting a threat, even if the probability check rejects that attempt. Aggressors never dodge. Base bot speed is multiplied by 1.12 for aggressors or by 1.22 during evasion, then by the difficulty speed factor. `main.ts` applies the resulting movement, aim, and firing decisions to live actors; rule tests exercise these decisions separately from browser input and rendering.

Behavior distances use `contact = 0.8 * (player.radius + enemy.radius)`. Collector retreat starts below `max(18, contact + 8)`; sniper preferred range is `max(28, contact + 12)` and panic starts below `max(15, contact + 5)`. This lets the same rules react to larger builds. All bots receive passive pickup through the shared collector loop, even when their movement does not target loot. They never invoke `startDash()`.

Aim prediction uses `min(0.85, distance / projectileSpeed)` seconds, multiplied by 1 for snipers or 0.55 for other styles, then by the difficulty lead factor. Base oscillating X/Z spread has amplitude 0.8 for aggressors, 1.8 for collectors, 1.3 for Balanced bots, and 0.3 for snipers; panic reduces the sniper base spread to zero. Difficulty spread is added afterward. These offsets describe the current aiming heuristic, not guaranteed accuracy. Style parameters, difficulty factors, and firing ranges are documented in [Development](DEVELOPMENT.md).

## Victory collection

Live fighters use `evolution.ts`; see [Evolution and reserve](EVOLUTION.md). `collectPiece()` routes loot to exact repair/body slots or reserve. `assembleReserve()` retries stored parts. At the end of victory collection, `advanceEvolution()` can rebuild the phase-3 body, then stock assembly drains before the result. Evolution state contains the immutable plan, occupied-slot IDs, repair history, stage, reserve, and reserve revision. Both body and reserve are copied on Next Round. Bots start with fresh heads and empty reserves.

On a win, `finish()` clears projectiles, stops actor motion and the player's dash, freezes combat time, transfers the defeated enemy's reserve into the drop array just beyond the arena's right edge, empties that reserve, and creates a `VictoryCollection` over all current drops. `stepVictoryCollection()` uses a separate elapsed timer; ordinary drop physics and age updates stop during this phase.

After 0.3 seconds, pending pieces move toward `(player.x, 2.5, player.z)` at an increasing speed of `35 + elapsed * 32`. Pieces within 0.8 world units are processed up to 16 per step. Combat pickup eligibility is bypassed. Body and bank pickups both remove world drops; invalid pieces are skipped. A defeated fighter cannot collect. For evolved fighters the attachment cap does not block banking.

Each step also allows up to 16 reserve attachments, separately from its 16 incoming-drop attempts. When pending drops are exhausted and an assembly pass makes no more placements, `advanceEvolution()` checks the phase-2 body fraction once. At 85% or above it preserves surviving head slots, returns body pieces to stock, selects the larger plan, and retries assembly on following steps. Completion requires no pending drops, no further placements in that pass, the completed evolution check, and at least 2.4 seconds elapsed; unused reserve is allowed. Bounds are refreshed as the winner grows. Next Round copies the survivor and reserve. Defeat skips this reward phase entirely.

Collection counters include parts accepted into either body or reserve. Repair/growth statistics count placements, not stock transfers; phase-3 rearrangement is excluded from new-piece statistics. The victory progress bar can reach 100% while reserve assembly or evolution is still running.

## Evolution plans and reserve

`evolutionPlan()` combines the selected head with geometry-only body slots from `src/assets/evolutions.generated.json`. It removes slots overlapping the chosen head and slots no longer reachable from it, then caches the immutable face graph. Each combination can therefore have a slightly different body target. Five paths and two body phases support all 17 heads.

`frontier()` tracks currently empty slots next to occupied slots, indexed by exact X/Y/Z dimensions. Previously occupied slots go into repair buckets; never-built slots go into growth buckets. It refreshes occupancy after damage using the structure revision. `place()` tries matching repairs before matching new slots and calls `attachAt()` to validate actual geometry/Core contact. Color and incoming shape do not select a slot and are preserved. No cutting, resizing, rotation, or alternate tiling is performed.

`collectPiece()` installs the part when possible. A valid unplaceable piece is cloned into the reserve with a nonconflicting ID, increments `reserveRevision`, and returns bank mode. `assembleReserve()` indexes stock by dimensions and reuses the repair/growth frontier, placing at most 8 pieces per combat step by default. This budget is separate from the 8 incoming pickups. Unchanged geometry and stock are not rescanned after an unsuccessful pass; exhausted budgets permit work on the next step.

`evolutionProgress()` counts currently occupied body slots, excluding the head and reserve. Stage 2 means its body plan is active even when only the initial head is present. Phase 3 is the final plan. `advanceEvolution()` resets body-slot history for the new plan, conserves actual body/stock pieces, and never creates missing head parts or rearms current-round Core protection.

## Structural geometry and caches

`structure.ts` treats every shape as an axis-aligned box. Intersections require positive overlap on all axes; connections require one shared face and positive overlap on the other two axes. Comparisons use `EPSILON = 1e-6`. Shape metadata does not alter structural collision.

A `SpatialIndex` uses 2-stud buckets for local neighbor queries. Pieces spanning more than 512 buckets go into a separate large-piece list; queries spanning more than 4,096 buckets fall back to scanning the indexed pieces. This limits bucket allocation for unusually large geometry.

A module-level `WeakMap` caches the Core-connected component per structure revision and creates a spatial index only when needed. For an evolved body, connectivity traverses the immutable blueprint face graph after checking that every attached ID occupies exactly the recorded slot coordinates and dimensions. Any unmapped, duplicate, or displaced piece falls back to spatial traversal, including sub-epsilon offsets that can change actual face contact. `connectedToCore()` returns a copy of the cached ID set. A bounded cache retains up to 12 prepared head/body plans. Phase transition places surviving head pieces at their exact new plan coordinates to avoid accumulated floating-point drift.

Changes must keep `revision` and cached geometry consistent. Use the structural APIs instead of directly changing map entries or nested positions: direct mutation without invalidation can leave connectivity, bounds, and rendering stale. Damage invalidates or refreshes its caches; attachment incrementally extends the index and connected set.

## Damage and attachment APIs

`damageStructure(structure, power, rng)` sanitizes finite power to a nonnegative integer and caps it by the eligible piece count. It samples without replacement, removes the whole direct batch, computes the Core component, detaches the remainder, records vacancies for legacy structures without evolution, and increments the revision once for a nonempty operation. Evolved structures retain built-slot history for exact repairs.

Core eligibility is captured before removal. Exposure uses `max(1, floor(roundStartPieces * (1 - coreProtectionLoss) + EPSILON))` and is sticky for the rest of the fight. Missing Core means an empty connected component and elimination. Zero/invalid power leaves an otherwise unchanged structure at the same revision.

`attachPiece(structure, incoming, rng)` is the legacy free-growth API used by experiments and its existing tests. It searches shuffled compatible vacancies and faces. Live evolved actors use `collectPiece()` and `attachAt()` to preserve the planned silhouette. The latter validates a prescribed slot against the spatial index and extends cached connectivity.

Both attachment APIs avoid solid overlap and require contact with the Core-connected component. Successful attachment clones the incoming piece, keeps or suffixes its ID, increments the revision, and extends cached connectivity. Legacy `attachPiece()` also rejects placements below local Y = 0 and subtracts occupied volume from vacancy boxes; adjacent vacancies merge only when they form an exact rectangular union, and partial repairs leave rectangular fragments. Planned placement uses the authored nonnegative slot positions and tracks repairs through slot history instead of vacancy subtraction.

`attachPiece()` and `attachAt()` themselves have no 16,000-piece cap. Evolved placement enforces it in `evolution.ts`, while `collectPiece()` can still bank valid loot at the cap. `collectNearbyDrops()` and `stepVictoryCollection()` enforce the cap directly for legacy structures without evolution. Tooling that calls low-level attachment APIs directly is responsible for its own capacity policy.

## Pickup scheduling

`collectNearbyDrops()` builds eligible drop/collector pairs within each collector's radius, sorts by squared distance, and processes them with per-collector batch counts. A set prevents duplicate collection. It compacts the ground array once after successful repair, growth, or bank results.

Failed placements are cached in a nested weak map keyed by drop, structure, and revision. Unchanged geometry does not repeatedly retry the same rejection. Ownership, age, Core existence, and the live piece cap are checked separately. Candidate distances/radii are a snapshot for that call; growth affects the next bounds refresh.

There is no explicit tie-break rule beyond candidate enumeration/stable sorting. Do not depend on equal-distance contested pickups as a fairness mechanism.

## Rendering, UI, and audio

`CharacterView` uses separate instanced meshes for boxes and studs. It rewrites instance matrices/colors only when the structure revision changes. Capacities start at 512 bodies and 2,048 studs and grow to the next power of two. Tiles and slopes omit studs; all bodies use box geometry, so stored slopes do not produce curved slope meshes. The current Mini assets contain bricks, plates, and tiles.

Detached pieces are boxes in one instanced mesh, starting with capacity 1,024 and growing to a sufficient power of two. Rendering capacity never discards logical loot. Replaced instance buffers are disposed; an oversized buffer is released on round reset. Falling pieces use a spatial index of settled footprints and stop on the highest overlapping support, so debris forms shallow piles instead of occupying the same plane. Settled drops reuse cached transforms and colors, while moving or compacted entries update the affected GPU buffer ranges. Hit/pickup/result particles use another instanced mesh with capacity 500; spawning stops at 450 active particles.

Character synchronization writes affine matrices directly, reuses parsed brick colors for studs, and derives conservative body bounds in the same pass. Body picking first rejects missed axis-aligned brick boxes in mesh-local space, then retains Three.js's exact triangle test for surviving candidates. Tests compare its intersections against the original instanced raycast. Renderer statistics reset before the frame and aggregate the arena, shadow work, and both stock previews.

`ArenaRenderer` owns the combat orthographic camera, lights, arena meshes, pointer projection, and hit shake. `fitCombat()` uses actual attached height and actor depth to shift the camera target and enlarge its vertical framing; `resize()` subtracts visible reserve-panel insets when fitting arena width. `CharacterView` offsets geometry by its lowest attached Y, so the starting head sits on the ground and rises as parts fill downward. Lobby framing uses a separate target/scale. Device pixel ratio is capped at 1.75. The UI reparents the same canvas; `ResizeObserver` and window resize events update its size. The inventory trays share the same WebGL renderer.

`ReserveView` owns a separate scene and orthographic camera for each Backpack/Rival stock tray, drawing through the arena's existing WebGL renderer with DOM-aligned viewports and scissor rectangles. It samples up to 240 actual inventory pieces and updates on state/reserve-revision changes, while the full inventory remains in game state. Tray framing uses the sample bounds; the main viewport is restored after both previews render. The UI shows exact counts, empty-state copy, and a sample-size label above 240 parts. At widths below 1,100 pixels or heights below 700 pixels, CSS hides the trays and leaves compact counters. These are noninteractive inventory views, not arena collision or pickup objects.

`GameUI` creates DOM markup once and delegates events to callbacks. It manages screen visibility, six-item roster pages, focus cycling in dialogs, selected-card state, sliders, and toasts. There is no UI framework, router, or localization layer. Most strings live in `ui.ts`, with additional messages in `main.ts`, bot labels in `bots.ts`, metadata in `index.html`, and subtitles in the catalog.

`setScreen()` reparents `#arena` between the lobby preview and root, updates its tab index, and marks the top bar inert during pause/results. The HUD remains present behind those modal overlays. The collecting screen adds reward progress and hides dash/toast displays through CSS. Result rendering makes Next Round hidden/disabled on defeat and promotes Restart to the primary button; focus moves to the visible enabled primary action on the next animation frame. Tab/Shift+Tab cycle between visible modal controls, including the pause settings summary/input.

Victory progress is `collected / total`, with an empty arena displayed as complete. Skipped pieces are not counted as collected, so a finished reward phase can end below 100%; completion is decided by the pending set and elapsed time, not the progress bar. Toasts are created only while playing, limited to three, and removed after 2.1 wall-clock seconds. They are hidden during collecting, pause, and results.

`Sound` fetches three local samples during lobby initialization. A user gesture creates/resumes `AudioContext`, then decodes buffers once. Sample sounds pass through a compressor; pickup/win/loss sounds use oscillators. Loading errors are logged and missing combat samples are skipped. Sound and mute state are not persisted.

## Practical limits

The runtime uses `Math.random()` for combat, opponents, AI, cosmetic effects, and legacy free growth. Planned evolution placement follows slot/frontier order and incoming dimensions rather than choosing a random free face. Pure rule functions accept injected random sources where needed for tests, but the complete game is not deterministic. There is no serialization or network synchronization boundary.

Large builds increase geometry, pointer raycasting, and rendering cost. The test suite verifies correctness and instance capacity, not a guaranteed frame rate. Camera framing adapts to growing bodies, but circular actor collision remains an approximation of the visible footprint. See [Testing](TESTING.md) for evidence and manual checks.
