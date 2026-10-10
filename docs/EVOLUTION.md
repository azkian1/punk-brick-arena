# Playable evolutions and reserve

Reviewed against **v2 Battle Royal patch**, including the 2026-10-10 audit corrections. Its four-fighter 160 × 160 map reserves four 52-unit-wide diagonal routes so the largest authored full form can travel between spawns and the center. See [Release notes](RELEASE_NOTES.md) for the current patch and [Testing](TESTING.md) for accepted evidence.

The five approved brick prototypes are integrated into the arena: Mosher, Guitar Demon, Stage Spider, Bass Titan, and Winged Frontman. Choose a path in the lobby; it stays fixed for that run. Every one of the 17 heads can use every path. Each fresh bot receives a random path and starts as its base head.

| Path ID | Display name | Authored silhouette |
| --- | --- | --- |
| `mosher` | Mosher | Heavy boots, broad shoulders, and oversized fists |
| `guitar` | Guitar Demon | A jagged guitar and a towering claw |
| `spider` | Stage Spider | A drummer that grows four legs and four arms |
| `bass` | Bass Titan | A walking speaker body with shoulder horns |
| `frontman` | Winged Frontman | A microphone, torn coat, and wide wings |

The browser runtime uses one player and three bots, physical-part ammunition, and procedural destructible cover. Every path uses fixed body silhouettes and automatic spare-part storage. Body paths have no separate attack bonuses; they change the authored construction.

## Assembly and progression

The authored phase-2 and phase-3 bodies supply immutable slots. The assembly plan contains geometry only: no prototype donor parts are granted to a fighter. A separate authored-zone palette is used only when a color rune is collected. Head pieces keep their original geometry. A body slot overlapping a larger head or hat is omitted, as are any slots thereby disconnected from the head.

Loot is matched by exact X/Y/Z dimensions, not color or shape metadata. Incoming shape and original color are preserved. Slots must share a face with the surviving construction, and placements are checked for solid overlap and Core connectivity. Compatible previously built slots are tried before compatible unbuilt slots. A piece may build a new slot when no current repair accepts its dimensions. Ordinary assembly never stretches, cuts or recolors parts; rune collection is the explicit installed-color exception. This first implementation uses fixed slot sizes; it does not subdivide a large slot into smaller bricks, combine small pieces, or rotate incoming pieces.

Only attached parts contribute to Core protection. Actor damage still selects random eligible pieces and drops Core-disconnected sections. Safe firing can remove a body part and expose the Core but creates no cascade. Evolution uses exact slot history instead of merged repair cavities. Legacy `attachPiece()` remains for structure experiments and compatibility tests; live evolved fighters use `collectPiece()`.

The head begins at normal floor height. As the body fills downward, rendering translates the whole attached construction so its lowest piece remains at ground level. The camera frames living fighters and remaining cover. Collision and targeting remain planar.

After all victory loot is processed and reserve assembly makes no further placements, reaching 85% of the phase-2 body unlocks phase 3. The threshold is `EVOLUTION_THRESHOLD` in `src/game/evolution.ts`; it counts occupied body slots, excluding head pieces and stock. The existing head/Core survives; attached body parts and stored stock are reused for the larger plan. Missing head pieces are not generated. Body-slot repair history starts again for the new plan, and assembly continues before the result appears. Parts that cannot yet fit remain in stock. This rebuild does not restore Core protection during the current round. Next Round sets the new protection baseline normally.

Phase 1 is the starting head; its active runtime plan is already stage 2 with zero body progress. Phase 3 is the final form. Further loot repairs damage and fills remaining slots; extra parts stay in reserve. There is no phase 4 or growth beyond the chosen silhouette. Progress is shown as attached body pieces divided by slots, so taking damage can reduce it. The larger phase-3 target can also make the percentage drop during a successful evolution without any loss of inventory. Reaching a form depends on the sizes actually collected, not a fixed number of wins.

## Reserve and ammunition

Each shot requests 1–20 exact inventory parts, default 1: reserve first, then deterministic safe non-Core attached pieces. The actual available batch sets direct damage, packs into one logical volley, and returns every spent part as separate loot after contact/rebound. The Core is never ammunition; body firing keeps survivors connected and records a repairable missing slot without a cascade. ID, dimensions, color and shape survive shot, impact/rebound, drop and collection. Every fighter waits for landing plus five seconds from firing, including during victory collection. Boundary arcs do no damage and retain the part if no clear landing target is available.

Eligible loot that cannot attach is collected into the owner's reserve. In combat, each fighter can pick up at most 8 drops and separately install at most 8 stored pieces per simulation step. A bounded assembly pass retries stock when geometry or inventory changes. Storing a piece does not count as a repair or new body part. The left HUD shows player build/Core, body progress, repairs and additions above Backpack; DASH and the parts-per-shot slider form the right column. Above 1280 pixels wide and at least 600 pixels high, columns share projected arena top/bottom edges, equal `clamp(280px, 17vw, 336px)` widths/heights, matching 44/56 card rows and larger Segoe UI/Arial typography. Pickup-report toasts are removed; repair/growth totals remain in the player card, and opponent stock/status counters stay hidden.

The player's Backpack shares the arena WebGL renderer and shows up to 240 actual stored pieces, with an exact total and sample-size label. Its transparent container/stage expose the 3D preview; white header/footer backgrounds keep text readable. Rival stock is removed. Portrait uses a compact 76-pixel header/preview. Short touch landscape and fine-pointer windows at heights of 500 pixels or less collapse to the header/count. Storage needs no visit or manual sorting. A fighter's stock stays banked until spent, assembled, or released after elimination.

An eliminated bot releases its reserve immediately as contested floor loot while the player continues fighting. Player Core destruction ends the run immediately with DEFEAT / You Lost; actors, debris ages, rune time and inputs freeze, and pending shots become drops with their age and five-second fired lock preserved. There is no spectator phase or reward/phase transition after defeat. Restart and Choose Character remain available, while Next Round requires the sole surviving player.

The final surviving player collects remaining loose rewards; standing buildings are not dismantled or awarded. Up to 16 incoming and separately 16 stored parts are processed per step. Ordinary damage debris bypasses combat landing/owner delays in this phase, while fired parts still must land and reach five seconds since firing. Next Round deep-copies the player body, stage, repair history and reserve into a fresh map with three new bots. Start Over, character selection and reload clear the run.

The 16,000-piece attachment cap remains. An evolved fighter can still store eligible loot when attachment capacity is reached; stock is not silently deleted. Invalid geometry is rejected.

The two progress indicators describe different things: victory loot counts accepted world pieces, including banked pieces, while body progress counts installed body slots. Loot can reach 100% before assembly or a phase transition is finished. The victory result does not appear until both processing and the 2.4-second minimum celebration have finished; defeat appears immediately.

## Color rune

Every 30 combat seconds a color cube can appear at the clear center. It stays until a living player or bot touches its pickup area; missed intervals do not stack runes, and pause freezes the clock. Each pickup recolors installed pieces once without repairing or granting inventory. Missing parts remain missing, and IDs, geometry, shapes, Core status and reserve are preserved.

Head slots regain the selected portrait's original colors. Body slots use a coherent authored-zone palette: dark clothing, silver spikes/details and a distinct accent for each of the five paths. This palette is exported separately from geometry in `evolution-colors.generated.json`; it does not inherit chaotic donor-stock colors. Loose drops, banked parts and active shots are untouched. Ordinary later loot keeps its own color until another rune is collected.

## Files and regeneration

- `src/game/evolution.ts`: plans, repair/build frontier, inventory, bounded assembly, and phase transition.
- `src/assets/evolutions.generated.json`: compact geometry for the ten authored bodies.
- `src/assets/evolution-colors.generated.json`: authored-zone body palettes for one-time rune painting.
- `src/game/rune.ts` and `rune.test.ts`: 30-second spawning, contested contact, installed colors and identity/stock preservation.
- `scripts/generate-evolutions.ts`: exports runtime geometry and rune palettes from approved prototype models.
- `src/game/ammunition.ts` and `src/game/projectiles.ts`: exact-part firing, safe inventory transfer, recovery timing and boundary return.
- `src/game/evolution.test.ts`: all 170 head/body combinations, conservation, connected construction, pickup ownership, repairs, victory collection, transition, carryover, and reset.

After changing prototype geometry, regenerate the approved models and export their runtime slots:

```sh
npx tsx prototypes/brick-evolution/build.ts
npx tsx prototypes/brick-evolution/audit.ts
npx tsx scripts/generate-evolutions.ts
npm test -- --maxWorkers=1 --no-file-parallelism
npm run build
```

The original prototype viewer remains available from the development server at `/prototypes/brick-evolution/` for inspecting the complete bodies independently of earned loot. It is not an entry point in the default production build. Its donor-stock demonstrations are not the live game inventory. Runtime slot export must be repeated when prototype geometry changes; `npm run build` does not regenerate it.

Current battle verification and its exact recorded scope are in [Testing](TESTING.md). The 2026-10-06 199-test integration, 100 assisted duel matches, earlier evolution review, and 15-victory conservation simulation remain historical evidence. Retained duel API tests protect shared assembly/carryover rules rather than the current four-actor browser loop. Face-contact checks do not certify real-world stud engagement or physical load-bearing strength.
