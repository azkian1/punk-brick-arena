# Punk Brick Arena

A browser arena prototype where one player fights a bot using destructible brick characters. Choose one of five rock-punk evolutions, collect enemy pieces, and build its body downward from your original head. Destroy the opponent's Core to win and carry your surviving construction and spare-part reserve into the next fight.

Built with TypeScript, Three.js, and Vite. The game runs in the browser with local assets and no backend or accounts. The interface and project documentation are in English.

**[Play Punk Brick Arena](https://azkian1.github.io/punk-brick-arena/)** in a browser with a keyboard and mouse or touch controls.

## About the project

Punk Brick Arena is an independent, noncommercial fan project inspired by CryptoPunks, created purely for NFT culture with no financial interest. It is not affiliated with, sponsored by, or endorsed by CryptoPunks or LEGO.

Created by [@azaticus on Twitter / X](https://x.com/azaticus).

Character generation uses source code from [Punk to Bricks](https://github.com/hs7j4yk4sz-boop/punk-to-bricks) by **[John Karp (@johnkarp)](https://x.com/johnkarp)**. Thank you for making the generator available. Using that code does not imply its author's involvement in or endorsement of this game. You can also [try the original generator](https://hs7j4yk4sz-boop.github.io/punk-to-bricks/).

The game's original source code and documentation are released under the [MIT License](LICENSE). You may use, modify, fork, and redistribute that code, including commercially, while retaining the copyright and license notices. The project's noncommercial purpose does not add a noncommercial restriction to the code license. A link back to [Punk Brick Arena](https://github.com/azkian1/punk-brick-arena) is appreciated.

Third-party code and assets retain their own licenses and rights. The project license does not grant rights to CryptoPunks images, character likenesses, or third-party trademarks. See [Third-party notices](THIRD_PARTY_NOTICES.md) for source credits, the original generator license, and asset terms.

## Quick start

Use Node.js 22.12 or newer and npm. This snapshot was verified with Node.js 24.11.0 and npm 11.6.1. Dependencies are pinned by `package-lock.json`.

From the project directory:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The development server binds to the local computer and requires port 5173 to be free. No environment variables or asset generation are needed for the first run: generated characters, portraits, and audio are included.

Use a browser with WebGL support and hardware acceleration. Desktop play uses a keyboard and mouse. On a touch device, use the left joystick to move and touch the arena to aim and fire.

## Play

1. Choose one of 17 heads and an evolution: Mosher, Guitar Demon, Stage Spider, Bass Titan, or Winged Frontman.
2. Start against a randomly selected character controlled by an easy Balanced bot.
3. Shoot, dodge incoming projectiles, and move near settled debris to collect it automatically. Keyboard players can also dash with Space.
4. Reduce the opponent's construction until its Core becomes vulnerable, then destroy it.
5. Let victory collection finish, then choose **Next Round** to keep your build or **Start Over** to restart with the base character.

Next Round is the victory action that preserves the build; Start Over is the restart action that returns to round 1.

| Control | Action |
| --- | --- |
| WASD or arrow keys | Move in the arena plane |
| Mouse | Aim |
| Left mouse button | Fire; hold for repeated shots |
| Left touch joystick | Move on touch devices |
| Touch the arena | Aim and fire; hold for repeated shots |
| Space | Dash in the movement direction, or toward aim from rest; 2.4-second cooldown |
| P or Escape | Pause or resume combat or victory collection |
| R | Restart the run at round 1 outside the lobby |
| M | Toggle sound outside the lobby; a sound button is also available |

Movement and letter shortcuts use physical key positions, so switching keyboard layouts does not change the bindings. Space activates one dash per press; holding it does not repeat the burst. You can shoot during a dash, but it grants no invulnerability.

Switching away from the window or hiding the tab pauses combat or victory collection and clears held movement/fire. Return to the game and resume explicitly. Game shortcuts are ignored while a form input, such as the damage slider, has focus. Space and Enter retain their normal menu activation behavior on buttons, links, and expandable settings.

## Menus and match flow

| Screen | Available actions |
| --- | --- |
| Lobby | Browse roster pages, select a head and evolution path, start a fight, adjust shared damage, toggle sound, read instructions and credits |
| Combat | Move, aim, fire, pause, use keyboard shortcuts, or dash with Space |
| Victory collection | Watch automatic repair/growth; pause/resume, restart, and mute remain available; movement, fire, and dash stop |
| Pause | Resume the interrupted phase, restart from the base character, choose a character, or adjust shared damage |
| Victory result | Continue with Next Round, restart from the base character, or choose a character |
| Defeat result | Restart from the base character or choose a character; Next Round is unavailable |

The result screen stays open until an action is chosen; P/Escape does not dismiss it. Damage and sound settings survive restarts and returning to the lobby. Reloading resets them. Changing roster pages alone does not change the selected character.

## Current rules

- **Your body is your health.** Each brick or plate counts as one gameplay piece, regardless of its dimensions. Projectiles are separate objects and never consume body pieces.
- **Damage is random, with cascades.** A hit removes up to 10 eligible pieces by default, then detaches everything disconnected from the Core. The lobby and pause menu provide a shared player/bot damage slider from 1 to 20.
- **Core protection is temporary.** The Core is excluded from random damage until a hit leaves at most `max(1, floor(roundStartPieces × 0.4))` pieces. It becomes eligible on the following hit. Pickups can delay exposure, but cannot restore protection after exposure in that round. Exposure alone is not defeat.
- **Combat pickup requires landing.** Debris must settle and be at least 0.8 seconds old. Its last owner must wait 5 seconds from detachment. These timers use simulation time and freeze during pause.
- **Repair comes before planned growth.** A collected piece fills a compatible missing slot first, otherwise it fills a connected slot in the selected body. Dimensions, color, and shape are preserved. Parts that do not fit go to the side reserve. There is no random growth outside the blueprint.
- **Combat pickup happens in batches.** Each fighter can collect up to 8 pieces per simulation step. Collection range grows with the construction. Contested loot is resolved by distance, subject to eligibility, placement, and the batch limit.
- **Victories can form a run.** Next Round preserves attached pieces, positions, colors, the Core, repair history, evolution stage, and reserve. Enemies start from base templates. The other 16 characters are shuffled without repeats within a cycle or at cycle boundaries.
- **Victory collection.** Combat and its clock stop; remaining debris and the defeated opponent's reserve go to the winner. Landing and ownership delays no longer apply. The generator retries the winner's reserve, with unused parts kept for later. Pause freezes this stage too.
- **Three forms.** Start as a head and build phase 2 from collected parts. After a victory, loot collection and reserve assembly must leave at least 85% of the phase-2 body attached to unlock phase 3. Its larger body is rebuilt using your existing parts and reserve; no parts are granted or recolored by evolution. Phase 3 is the final blueprint and continues to accept repairs and missing parts.
- **Four bot styles and opening difficulty.** Round 1 uses an easy Balanced bot; round 2 uses a medium Balanced bot. From round 3, a full-strength Aggressor, Collector, Sniper, or Balanced bot is picked independently each fight, with repeats allowed. Balanced bots alternate approaching, strafing, and collecting. Aggressors pressure without dodging, Collectors seek safe loot, and Snipers keep their distance and fire rapidly under close pressure. The HUD identifies the style, opening difficulty, and sniper panic. There is no manual style or difficulty selector.
- **Storage is automatic.** The Backpack and Rival stock side panels show exact counts and 3D samples of stored parts, collapsing to counters on small screens; there is no need to visit them. Enemies start with a base head, a randomly chosen evolution, and an empty reserve. Each fight starts with 24 neutral loose pieces. Returning to the lobby, restarting, or reloading loses the current run and reserve.

Combat uses planar collision even though characters are rendered in 3D. Pointing at the opponent's visible body aims at its arena position; there is no separate height targeting. The camera adapts to growing bodies. Attachment stops at 16,000 pieces per fighter, while eligible excess loot can still enter the reserve. Character render buffers grow as needed.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server on port 5173 |
| `npm test` | Run the Vitest suite once |
| `npm run build` | Type-check `src/` and build the static site into `dist/` |
| `npm run security:check` | Check credential patterns and publication boundaries after a fresh build |
| `npm run preview` | Serve the production build locally; run the build first |
| `npm run assets:generate` | Regenerate all character templates and diagnostics from local PNGs |

For production preview, use the URL printed by Vite. GitHub Pages publishes the game automatically after tests, build, and publication checks pass on `main`. Other static hosts can serve the complete `dist/` directory; set `DEPLOY_BASE_PATH` when deploying below a path prefix. See [Development](docs/DEVELOPMENT.md).

## Project layout

```text
index.html                 Browser entry point
src/main.ts                Input, fixed-step simulation, bot, projectiles, debris
src/game/                  Structure, evolution, reserve, pickup, movement, bots, rounds
src/render.ts              Three.js arena and instanced character rendering
src/ui.ts                  Lobby, HUD, pause and result screens
src/style.css              Responsive interface styles
src/sound.ts               Local samples and synthesized feedback
src/assets/                Roster, generated templates, diagnostics, provenance
src/vendor/punk-to-bricks/  Pinned offline generator and original notices
scripts/                   Development server, character and evolution asset preparation
vite.config.js             Production CSP and local preview security headers
prototypes/brick-evolution/ Authored models, assembly viewer, and prototype validation
public/assets/             Source portraits, audio, attribution
art/evolutions/            Color concept illustrations for offline reference
docs/                      Technical and testing documentation
```

The ignored `artifacts/` directory contains local review pages, earlier QA outputs, and a pickup benchmark. It is not required to run or build the game.

## Documentation

| Document | Contents |
| --- | --- |
| [Product requirements](PRD.md) | Implemented gameplay, scope, and acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | Modules, data model, simulation, geometry, rendering, and state transitions |
| [Evolution and reserve](docs/EVOLUTION.md) | Five playable paths, phase progression, exact-part assembly, and stock carryover |
| [Development](docs/DEVELOPMENT.md) | Setup, commands, configuration, build, hosting, and troubleshooting |
| [Asset pipeline](docs/ASSETS.md) | Character roster, generator conversion, provenance, and audio preparation |
| [Testing](docs/TESTING.md) | Automated coverage, manual checks, diagnostics, and verification results |
| [Gameplay audit](docs/GAMEPLAY_AUDIT.md) | Twenty-match scenarios per path, conservation checks, extreme states, and limits |
| [Performance audit](docs/PERFORMANCE_AUDIT.md) | Local hardware, measured bottlenecks, optimizations, and repeatable profiling |
| [Security audit](docs/SECURITY_AUDIT.md) | Dependencies, UI data, credential scans, production policy, and hosting scope |
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Existing source credits and license notices |

## Status and credits

Version `0.1.0` is a playable prototype. Match duration, bot difficulty, balance, and performance across devices still need playtesting. Runs, inventories, and settings are held in memory and are not saved across reloads. There is no online multiplayer, gamepad support, or character editor. The intended 2–5 minute match length is a design target, not an enforced limit.

The 2026-10-06 integrated audit passed **199 tests in 14 files** and the production build. A separate browser run completed 20 assisted projectile matches per evolution, 100 total, with conservation checks and no page/console errors; it does not estimate human win rate. Local laptop profiling led to rendering, connectivity, and reserve optimizations, while dependency remediation left both npm audit scopes with zero reported advisories. Sustained interactive 60 FPS and remote hosting settings remain unverified. Vite still reports a JavaScript chunk above its 500 kB warning threshold. See [Testing](docs/TESTING.md) and the three audit reports for exact source snapshots, extreme-state fixtures, measurements, and limitations.

Characters come from the 17 sample portraits supplied with the vendored Punk to Bricks revision. Its generator code carries John Karp's MIT notice; image rights are documented separately. Combat samples are credited to kurt and Kenney. See [Third-party notices](THIRD_PARTY_NOTICES.md) and the distribution copy at [public/assets/ATTRIBUTION.txt](public/assets/ATTRIBUTION.txt). The project's [MIT License](LICENSE) applies to its original code and documentation; it does not relicense third-party artwork or trademarks.
