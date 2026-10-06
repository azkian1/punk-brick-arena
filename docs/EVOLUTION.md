# Playable evolutions and reserve

The five approved brick prototypes are integrated into the arena: Mosher, Guitar Demon, Stage Spider, Bass Titan, and Winged Frontman. Choose a path in the lobby; it stays fixed for that run. Every one of the 17 heads can use every path. Each fresh bot receives a random path and starts as its base head.

| Path ID | Display name | Authored silhouette |
| --- | --- | --- |
| `mosher` | Mosher | Heavy boots, broad shoulders, and oversized fists |
| `guitar` | Guitar Demon | A jagged guitar and a towering claw |
| `spider` | Stage Spider | A drummer that grows four legs and four arms |
| `bass` | Bass Titan | A walking speaker body with shoulder horns |
| `frontman` | Winged Frontman | A microphone, torn coat, and wide wings |

This patch replaces live free-face growth with these fixed silhouettes, adds automatic spare-part storage, and carries both the body and reserve across victories. The existing one-player/one-bot combat, damage, dash, and opponent-difficulty progression remain in place. No new attacks or bonuses are assigned to the different body paths.

## Assembly and progression

The authored phase-2 and phase-3 bodies supply immutable slots. Runtime data contains geometry only: no prototype donor colors or stock are granted to a fighter. Head pieces keep their original geometry. A body slot overlapping a larger head or hat is omitted, as are any slots thereby disconnected from the head.

Loot is matched by exact X/Y/Z dimensions, not color or shape metadata. Incoming shape and original color are preserved. Slots must share a face with the surviving construction, and placements are checked for solid overlap and Core connectivity. Compatible previously built slots are tried before compatible unbuilt slots. A piece may build a new slot when no current repair accepts its dimensions. Parts are never stretched, cut, or recolored. This first implementation uses fixed slot sizes; it does not subdivide a large slot into smaller bricks, combine small pieces, or rotate incoming pieces.

Only attached parts count as health and contribute to Core protection. The existing random damage, cascades, shared damage setting, and five-second restriction on collecting one's own debris are unchanged. Evolution uses exact slot history instead of merged repair cavities. Legacy `attachPiece()` remains available to structure experiments and tests, but live evolved fighters use `collectPiece()`.

The head begins at normal floor height. As the body fills downward, rendering translates the whole attached construction so its lowest piece remains at ground level. The camera frames the actual growing height and both fighters. Collision and targeting remain planar.

After all victory loot is processed and reserve assembly makes no further placements, reaching 85% of the phase-2 body unlocks phase 3. The threshold is `EVOLUTION_THRESHOLD` in `src/game/evolution.ts`; it counts occupied body slots, excluding head pieces and stock. The existing head/Core survives; attached body parts and stored stock are reused for the larger plan. Missing head pieces are not generated. Body-slot repair history starts again for the new plan, and assembly continues before the result appears. Parts that cannot yet fit remain in stock. This rebuild does not restore Core protection during the current round. Next Round sets the new protection baseline normally.

Phase 1 is the starting head; its active runtime plan is already stage 2 with zero body progress. Phase 3 is the final form. Further loot repairs damage and fills remaining slots; extra parts stay in reserve. There is no phase 4 or growth beyond the chosen silhouette. Progress is shown as attached body pieces divided by slots, so taking damage can reduce it. The larger phase-3 target can also make the percentage drop during a successful evolution without any loss of inventory. Reaching a form depends on the sizes actually collected, not a fixed number of wins.

## Reserve

Eligible loot that cannot attach is collected into the owner's reserve. In combat, each fighter can pick up at most 8 drops and separately install at most 8 stored pieces per simulation step. A bounded assembly pass retries stock when geometry or inventory changes. Storing a piece does not count as a repair or new body part. The HUD shows body progress, repairs, additions, and both reserve counts.

Each side has a backpack card with an exact stock count and a larger 3D tray. Both previews share the arena's WebGL renderer; they are drawn into their panel viewports with separate cameras, outside the combat area. On narrow or short screens the cards collapse to compact counters. Rendering displays up to 240 real stock pieces as a sample, with a label when the total exceeds the sample; the complete inventory remains in game state. Backpacks are protected storage, not another floor pickup source. They do not need to be walked to or opened.

On victory the defeated bot's reserve joins the world loot. The winner can collect up to 16 incoming parts and separately install up to 16 stored parts per step. Victory collection bypasses landing and ownership delays; the five-second owner restriction still applies during combat. The winner's reserve is retried along with new pieces, then retained. There is no inventory sorting screen. Next Round deep-copies the body, stage, repair history, and reserve. Start Over, returning to character selection, and reload clear the run. Construction and stock are not saved across reloads.

The 16,000-piece attachment cap remains. An evolved fighter can still store eligible loot when attachment capacity is reached; stock is not silently deleted. Invalid geometry is rejected.

The two progress indicators describe different things: victory loot counts accepted world pieces, including banked pieces, while body progress counts installed body slots. Loot can reach 100% before assembly or a phase transition is finished. The result does not appear until both processing and the 2.4-second minimum celebration have finished.

## Files and regeneration

- `src/game/evolution.ts`: plans, repair/build frontier, inventory, bounded assembly, and phase transition.
- `src/assets/evolutions.generated.json`: compact geometry for the ten authored bodies.
- `scripts/generate-evolutions.ts`: exports runtime geometry from approved prototype models.
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

Current integrated verification includes 199 tests in 14 files, a production build, 100 assisted projectile matches across all five paths, and final full-body browser fixtures. The earlier evolution review and separate 15-victory conservation simulation remain historical evidence. See [Testing](TESTING.md) for the exact scope, source snapshots, and limits. Game face-contact checks do not certify real-world stud engagement or physical load-bearing strength.
